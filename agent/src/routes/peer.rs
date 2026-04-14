use axum::body::Body;
use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::Router;

const P2P_URL: &str = "http://127.0.0.1:8082";

/// GET /v1/peers — list discovered peers and their models.
async fn list_peers() -> Response {
    let client = reqwest::Client::new();
    match client.get(format!("{P2P_URL}/peers")).send().await {
        Ok(r) => {
            let bytes = r.bytes().await.unwrap_or_default();
            Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(bytes))
                .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())
        }
        Err(_) => (
            StatusCode::SERVICE_UNAVAILABLE,
            axum::Json(serde_json::json!({
                "error": "peer network not available",
                "hint": "Enable in Settings > LETHE > Peer Network"
            })),
        )
            .into_response(),
    }
}

/// GET /v1/peers/health — check if the P2P sidecar is running.
async fn peer_health() -> Response {
    let client = reqwest::Client::new();
    match client.get(format!("{P2P_URL}/health")).send().await {
        Ok(r) => {
            let bytes = r.bytes().await.unwrap_or_default();
            Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(bytes))
                .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())
        }
        Err(_) => (
            StatusCode::SERVICE_UNAVAILABLE,
            axum::Json(serde_json::json!({ "status": "offline" })),
        )
            .into_response(),
    }
}

/// POST /v1/peer/chat/completions — forward to peer network.
/// Returns 404 if no peer has the requested model, so the frontend
/// knows to fall through to cloud providers.
async fn peer_chat_completions(body: String) -> Response {
    let client = reqwest::Client::new();
    let resp = client
        .post(format!("{P2P_URL}/v1/chat/completions"))
        .header("Content-Type", "application/json")
        .body(body)
        .send()
        .await;

    match resp {
        Ok(r) => {
            let status = StatusCode::from_u16(r.status().as_u16())
                .unwrap_or(StatusCode::BAD_GATEWAY);
            let ct = r
                .headers()
                .get(header::CONTENT_TYPE)
                .and_then(|v| v.to_str().ok())
                .unwrap_or("application/json")
                .to_string();
            let bytes = r.bytes().await.unwrap_or_default();
            Response::builder()
                .status(status)
                .header(header::CONTENT_TYPE, ct)
                .body(Body::from(bytes))
                .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())
        }
        Err(_) => (
            StatusCode::SERVICE_UNAVAILABLE,
            axum::Json(serde_json::json!({
                "error": "peer network unavailable"
            })),
        )
            .into_response(),
    }
}

pub fn router() -> Router {
    Router::new()
        .route("/v1/peers", get(list_peers))
        .route("/v1/peers/health", get(peer_health))
        .route("/v1/peer/chat/completions", post(peer_chat_completions))
}
