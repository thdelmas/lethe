use axum::body::Body;
use axum::extract::State;
use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::Router;
use std::sync::Arc;
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

const LLAMA_PORT: u16 = 8081;
const MODELS_DIR: &str = "/data/lethe/models";
const LLAMA_BIN: &str = "/system/extras/lethe/bin/llama-server";

pub struct LlmState {
    process: Mutex<Option<Child>>,
    client: reqwest::Client,
}

impl LlmState {
    pub fn new() -> Self {
        Self {
            process: Mutex::new(None),
            client: reqwest::Client::new(),
        }
    }

    /// Ensure llama-server is running with the given model.
    async fn ensure_running(&self, model_file: &str) -> Result<(), String> {
        let mut proc = self.process.lock().await;

        // Check if already running
        if let Some(ref mut child) = *proc {
            match child.try_wait() {
                Ok(None) => return Ok(()), // still running
                _ => {}                    // exited or error — restart
            }
        }

        let model_path = format!("{MODELS_DIR}/{model_file}");
        let child = Command::new(LLAMA_BIN)
            .arg("--model")
            .arg(&model_path)
            .arg("--port")
            .arg(LLAMA_PORT.to_string())
            .arg("--host")
            .arg("127.0.0.1")
            .arg("--ctx-size")
            .arg("4096")
            .arg("--threads")
            .arg(num_threads().to_string())
            .kill_on_drop(true)
            .spawn()
            .map_err(|e| format!("failed to start llama-server: {e}"))?;

        *proc = Some(child);

        // Wait for server to be ready (poll /health)
        for _ in 0..50 {
            tokio::time::sleep(std::time::Duration::from_millis(200)).await;
            if self
                .client
                .get(format!("http://127.0.0.1:{LLAMA_PORT}/health"))
                .send()
                .await
                .is_ok()
            {
                return Ok(());
            }
        }
        Err("llama-server did not become ready in 10s".into())
    }
}

fn num_threads() -> usize {
    std::thread::available_parallelism()
        .map(|n| n.get().max(1))
        .unwrap_or(2)
}

/// GET /v1/models — list available GGUF files
async fn list_models() -> impl IntoResponse {
    let mut models = Vec::new();
    if let Ok(mut dir) = tokio::fs::read_dir(MODELS_DIR).await {
        while let Ok(Some(entry)) = dir.next_entry().await {
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.ends_with(".gguf") || name.ends_with(".bin") {
                let size = entry
                    .metadata()
                    .await
                    .map(|m| m.len())
                    .unwrap_or(0);
                models.push(serde_json::json!({
                    "id": name,
                    "object": "model",
                    "owned_by": "local",
                    "size_bytes": size,
                }));
            }
        }
    }
    axum::Json(serde_json::json!({
        "object": "list",
        "data": models,
    }))
}

/// POST /v1/chat/completions — proxy to llama-server
async fn chat_completions(
    State(state): State<Arc<LlmState>>,
    body: String,
) -> Response {
    // Parse request to extract model name for auto-start
    let model_file = serde_json::from_str::<serde_json::Value>(&body)
        .ok()
        .and_then(|v| v.get("model").and_then(|m| m.as_str().map(String::from)))
        .unwrap_or_default();

    if !model_file.is_empty() {
        if let Err(e) = state.ensure_running(&model_file).await {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                axum::Json(serde_json::json!({ "error": e })),
            )
                .into_response();
        }
    }

    // Forward the request body to llama-server
    let url = format!("http://127.0.0.1:{LLAMA_PORT}/v1/chat/completions");
    let resp = state
        .client
        .post(&url)
        .header("Content-Type", "application/json")
        .body(body)
        .send()
        .await;

    match resp {
        Ok(r) => {
            let status = StatusCode::from_u16(r.status().as_u16())
                .unwrap_or(StatusCode::BAD_GATEWAY);
            let is_stream = r
                .headers()
                .get(header::CONTENT_TYPE)
                .and_then(|v| v.to_str().ok())
                .map(|ct| ct.contains("text/event-stream"))
                .unwrap_or(false);

            if is_stream {
                // Stream SSE response through
                let stream = r.bytes_stream();
                Response::builder()
                    .status(status)
                    .header(header::CONTENT_TYPE, "text/event-stream")
                    .header(header::CACHE_CONTROL, "no-cache")
                    .body(Body::from_stream(stream))
                    .unwrap_or_else(|_| {
                        StatusCode::INTERNAL_SERVER_ERROR.into_response()
                    })
            } else {
                let bytes = r.bytes().await.unwrap_or_default();
                Response::builder()
                    .status(status)
                    .header(header::CONTENT_TYPE, "application/json")
                    .body(Body::from(bytes))
                    .unwrap_or_else(|_| {
                        StatusCode::INTERNAL_SERVER_ERROR.into_response()
                    })
            }
        }
        Err(e) => (
            StatusCode::BAD_GATEWAY,
            axum::Json(serde_json::json!({
                "error": format!("llama-server unreachable: {e}")
            })),
        )
            .into_response(),
    }
}

pub fn router() -> Router<Arc<LlmState>> {
    Router::new()
        .route("/v1/models", get(list_models))
        .route("/v1/chat/completions", post(chat_completions))
}
