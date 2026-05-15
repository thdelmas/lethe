//! LETHE Agent — system daemon.
//!
//! Replaces the Python Flask backend. Two binds:
//!
//! * **127.0.0.1:8080 (main)** — system tool endpoints (shell, sysinfo,
//!   files, packages, network), device state, LLM proxy, audio
//!   transcription, SSE agent state stream. WebView clients and local
//!   tooling talk to this port.
//!
//! * **127.0.0.1:8081 (remote_dms)** — narrow surface for #103: only
//!   `/v1/remote_dms/{cmd,heartbeat,pubkey}`. Tor's hidden service
//!   forwards onion:80 here. Kept separate so the Tor-reachable
//!   surface NEVER overlaps the main one (shell + files + agent
//!   state etc. must not be exposed to a remote peer). Only spawns
//!   when the pair file is present.

mod routes;

use axum::Router;
use routes::llm::LlmState;
use routes::remote_dms::{default_pair_path, RemoteDmsState};
use routes::router::RouterState;
use routes::state::AgentState;
use std::net::SocketAddr;
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};

#[tokio::main]
async fn main() {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let llm = Arc::new(LlmState::new());
    let agent = Arc::new(AgentState::new());
    let router_state = RouterState::load_or_empty();

    // Remote-DMS responder (#103). Pair file is the gate: if it's
    // missing or unparseable, the bind doesn't spawn. Test devices
    // drop the JSON when ready; first-boot wizard pairing is phase 3.
    if let Some(state) = RemoteDmsState::load(default_pair_path()) {
        let dms_app = routes::remote_dms::router()
            .with_state(state)
            .layer(cors.clone());
        let dms_addr = SocketAddr::from(([127, 0, 0, 1], 8081));
        eprintln!("lethe-agent: remote_dms listening on {dms_addr}");
        tokio::spawn(async move {
            let listener = tokio::net::TcpListener::bind(dms_addr)
                .await
                .expect("failed to bind 127.0.0.1:8081");
            // Tor forwards onion:80 here. NEVER add the main router
            // surface to this app — the whole point of the split bind
            // is keeping shell / files / agent-state off the
            // Tor-reachable side.
            axum::serve(listener, dms_app)
                .await
                .expect("remote_dms server error");
        });
    }

    let app = Router::new()
        // Stateless routes
        .merge(routes::dms::router())
        .merge(routes::device::router())
        .merge(routes::shell::router())
        .merge(routes::sysinfo::router())
        .merge(routes::files::router())
        .merge(routes::packages::router())
        .merge(routes::network::router())
        .merge(routes::audio::router())
        .merge(routes::channels::router())
        .merge(routes::cluster::router())
        .merge(routes::peer::router())
        .merge(routes::mesh::router())
        // Stateful routes (LLM proxy needs process handle)
        .merge(routes::llm::router().with_state(llm))
        // Task-based router (resolves task → ordered provider candidates)
        .merge(routes::router::router().with_state(router_state))
        // Stateful routes (SSE needs broadcast channel)
        .merge(routes::state::router().with_state(agent))
        .layer(cors);

    let addr = SocketAddr::from(([127, 0, 0, 1], 8080));
    eprintln!("lethe-agent listening on {addr}");

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("failed to bind 127.0.0.1:8080");

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .expect("server error");
}

async fn shutdown_signal() {
    tokio::signal::ctrl_c().await.ok();
}
