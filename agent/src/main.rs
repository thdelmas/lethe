//! LETHE Agent — system daemon serving on 127.0.0.1:8080
//!
//! Replaces the Python Flask backend. Provides:
//! - System tool endpoints (shell, sysinfo, files, packages, network)
//! - Device state endpoint (/api/device)
//! - LLM inference proxy (/v1/chat/completions, /v1/models)
//! - Audio transcription (/v1/audio/transcriptions)
//! - SSE agent state stream (/api/agent/state)

mod routes;

use axum::Router;
use routes::llm::LlmState;
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
