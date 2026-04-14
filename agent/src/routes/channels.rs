use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::{delete, get};
use axum::Router;
use std::path::Path;

const CHANNELS_DIR: &str = "/persist/lethe/channels";
const ADVISORIES_DIR: &str = "/data/lethe/advisories";

/// GET /v1/channels — list all subscribed channels.
async fn list_channels() -> impl IntoResponse {
    let mut channels = Vec::new();
    let dir = Path::new(CHANNELS_DIR);
    if let Ok(entries) = tokio::fs::read_dir(dir).await {
        let mut entries = entries;
        while let Ok(Some(entry)) = entries.next_entry().await {
            let name = entry.file_name().to_string_lossy().into_owned();
            if !name.ends_with(".json") || name.starts_with('.') {
                continue;
            }
            if let Ok(data) = tokio::fs::read_to_string(entry.path()).await {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&data) {
                    channels.push(val);
                }
            }
        }
    }
    axum::Json(serde_json::json!({ "channels": channels }))
}

/// POST /v1/channels — add or update a channel subscription.
/// Body: {"name": "...", "type": "hosts|firewall|advisory|models",
///        "ipns_name": "/ipns/...", "description": "..."}
async fn add_channel(body: String) -> impl IntoResponse {
    let val: serde_json::Value = match serde_json::from_str(&body) {
        Ok(v) => v,
        Err(_) => {
            return (
                StatusCode::BAD_REQUEST,
                axum::Json(serde_json::json!({"error": "invalid JSON"})),
            )
                .into_response()
        }
    };

    let name = val.get("name").and_then(|v| v.as_str()).unwrap_or("");
    if name.is_empty() || name.contains('/') || name.contains("..") {
        return (
            StatusCode::BAD_REQUEST,
            axum::Json(serde_json::json!({"error": "invalid channel name"})),
        )
            .into_response();
    }

    let path = format!("{CHANNELS_DIR}/{name}.json");
    match tokio::fs::write(&path, body.as_bytes()).await {
        Ok(_) => (
            StatusCode::CREATED,
            axum::Json(serde_json::json!({"ok": true, "name": name})),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            axum::Json(serde_json::json!({"error": format!("write failed: {e}")})),
        )
            .into_response(),
    }
}

/// DELETE /v1/channels/:name — remove a channel subscription.
async fn remove_channel(
    axum::extract::Path(name): axum::extract::Path<String>,
) -> impl IntoResponse {
    if name.contains('/') || name.contains("..") {
        return StatusCode::BAD_REQUEST.into_response();
    }
    let path = format!("{CHANNELS_DIR}/{name}.json");
    match tokio::fs::remove_file(&path).await {
        Ok(_) => StatusCode::OK.into_response(),
        Err(_) => StatusCode::NOT_FOUND.into_response(),
    }
}

/// GET /v1/advisories — list security advisories received via channels.
async fn list_advisories() -> impl IntoResponse {
    let mut advisories = Vec::new();
    let dir = Path::new(ADVISORIES_DIR);
    if let Ok(entries) = tokio::fs::read_dir(dir).await {
        let mut entries = entries;
        while let Ok(Some(entry)) = entries.next_entry().await {
            let name = entry.file_name().to_string_lossy().into_owned();
            if !name.ends_with(".json") {
                continue;
            }
            if let Ok(data) = tokio::fs::read_to_string(entry.path()).await {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&data) {
                    advisories.push(val);
                }
            }
        }
    }
    axum::Json(serde_json::json!({ "advisories": advisories }))
}

pub fn router() -> Router {
    Router::new()
        .route("/v1/channels", get(list_channels).post(add_channel))
        .route("/v1/channels/{name}", delete(remove_channel))
        .route("/v1/advisories", get(list_advisories))
}
