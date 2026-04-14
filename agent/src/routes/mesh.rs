use axum::body::Body;
use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post, delete};
use axum::Router;

const P2P_URL: &str = "http://127.0.0.1:8082";

/// GET /v1/mesh/trust — list trusted peers in the mesh.
async fn list_trust() -> Response {
    proxy_get("/mesh/trust").await
}

/// POST /v1/mesh/trust — add a trusted peer.
async fn add_trust(body: String) -> Response {
    proxy_post("/mesh/trust/add", body).await
}

/// DELETE /v1/mesh/trust?id=<peer_id> — remove a trusted peer.
async fn remove_trust(
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> Response {
    let id = params.get("id").cloned().unwrap_or_default();
    let client = reqwest::Client::new();
    match client
        .delete(format!("{P2P_URL}/mesh/trust/remove?id={id}"))
        .send()
        .await
    {
        Ok(_) => StatusCode::OK.into_response(),
        Err(_) => mesh_unavailable(),
    }
}

/// POST /v1/mesh/signal — send a signal to the mesh.
async fn send_signal(body: String) -> Response {
    proxy_post("/mesh/signal", body).await
}

async fn proxy_get(path: &str) -> Response {
    let client = reqwest::Client::new();
    match client.get(format!("{P2P_URL}{path}")).send().await {
        Ok(r) => {
            let bytes = r.bytes().await.unwrap_or_default();
            Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(bytes))
                .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())
        }
        Err(_) => mesh_unavailable(),
    }
}

async fn proxy_post(path: &str, body: String) -> Response {
    let client = reqwest::Client::new();
    match client
        .post(format!("{P2P_URL}{path}"))
        .header("Content-Type", "application/json")
        .body(body)
        .send()
        .await
    {
        Ok(r) => {
            let status = StatusCode::from_u16(r.status().as_u16())
                .unwrap_or(StatusCode::BAD_GATEWAY);
            let bytes = r.bytes().await.unwrap_or_default();
            Response::builder()
                .status(status)
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(bytes))
                .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())
        }
        Err(_) => mesh_unavailable(),
    }
}

fn mesh_unavailable() -> Response {
    (
        StatusCode::SERVICE_UNAVAILABLE,
        axum::Json(serde_json::json!({
            "error": "mesh relay not available",
            "hint": "Enable in Settings > LETHE > Mesh Network"
        })),
    )
        .into_response()
}

pub fn router() -> Router {
    Router::new()
        .route("/v1/mesh/trust", get(list_trust).post(add_trust))
        .route("/v1/mesh/trust/remove", delete(remove_trust))
        .route("/v1/mesh/signal", post(send_signal))
}
