use axum::extract::State;
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;
use std::convert::Infallible;
use std::sync::Arc;
use tokio::sync::broadcast;
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::StreamExt;

/// Agent state visible to the frontend mascot animations.
#[derive(Clone, Debug)]
pub struct AgentEvent {
    pub state: String,
    pub status: String,
}

pub struct AgentState {
    tx: broadcast::Sender<AgentEvent>,
}

impl AgentState {
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel(64);
        Self { tx }
    }

    pub fn broadcast(&self, event: AgentEvent) {
        let _ = self.tx.send(event);
    }
}

/// GET /api/agent/state — SSE stream of agent state changes.
/// Frontend connects on page load and updates mascot accordingly.
async fn state_stream(
    State(state): State<Arc<AgentState>>,
) -> Sse<impl tokio_stream::Stream<Item = Result<Event, Infallible>>> {
    let rx = state.tx.subscribe();
    let stream = BroadcastStream::new(rx).filter_map(|result: Result<AgentEvent, _>| {
        result.ok().map(|ev| {
            let json = serde_json::json!({
                "state": ev.state,
                "status": ev.status,
            });
            Ok(Event::default().data(json.to_string()))
        })
    });

    Sse::new(stream).keep_alive(KeepAlive::default())
}

#[derive(Deserialize)]
struct StateUpdate {
    state: String,
    #[serde(default)]
    status: String,
}

/// POST /api/agent/state — internal endpoint for setting agent state.
/// Called by tool execution or other backend processes.
async fn set_state(
    State(state): State<Arc<AgentState>>,
    Json(update): Json<StateUpdate>,
) -> &'static str {
    state.broadcast(AgentEvent {
        state: update.state,
        status: update.status,
    });
    "ok"
}

pub fn router() -> Router<Arc<AgentState>> {
    Router::new()
        .route("/api/agent/state", get(state_stream))
        .route("/api/agent/state", post(set_state))
}
