use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::{get, post, delete};
use axum::Router;
use tokio::process::Command;

const TOKEN_PATH: &str = "/persist/lethe/cluster/token";
const EDGEVPN_BIN: &str = "/system/extras/lethe/bin/edgevpn";

/// GET /v1/cluster/status — is the cluster active? Which peers are online?
async fn cluster_status() -> impl IntoResponse {
    let token_exists = tokio::fs::metadata(TOKEN_PATH).await.is_ok();
    let enabled = getprop("persist.lethe.cluster.enabled").await == "true";

    // Query edgevpn API for peer list (if running)
    let peers = query_edgevpn_peers().await.unwrap_or_default();

    axum::Json(serde_json::json!({
        "enabled": enabled,
        "token_configured": token_exists,
        "peer_count": peers.len(),
        "peers": peers,
    }))
}

/// POST /v1/cluster/generate — generate a new cluster token on this device.
/// Returns the token which can be shown as QR code for other devices to scan.
async fn generate_token() -> impl IntoResponse {
    // edgevpn generates a random token + cluster config
    let output = match Command::new(EDGEVPN_BIN)
        .arg("api")
        .arg("--generate")
        .output()
        .await
    {
        Ok(o) => o,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                axum::Json(serde_json::json!({
                    "error": format!("edgevpn not available: {e}")
                })),
            )
                .into_response();
        }
    };

    if !output.status.success() {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            axum::Json(serde_json::json!({
                "error": String::from_utf8_lossy(&output.stderr).into_owned()
            })),
        )
            .into_response();
    }

    let token = String::from_utf8_lossy(&output.stdout).trim().to_string();

    // Save the token
    if let Err(e) = tokio::fs::write(TOKEN_PATH, &token).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            axum::Json(serde_json::json!({
                "error": format!("failed to save token: {e}")
            })),
        )
            .into_response();
    }

    axum::Json(serde_json::json!({
        "ok": true,
        "token": token,
    }))
    .into_response()
}

/// POST /v1/cluster/import — import a cluster token from another device.
/// Body: {"token": "..."}
async fn import_token(body: String) -> impl IntoResponse {
    let val: serde_json::Value = match serde_json::from_str(&body) {
        Ok(v) => v,
        Err(_) => {
            return (
                StatusCode::BAD_REQUEST,
                axum::Json(serde_json::json!({"error": "invalid JSON"})),
            )
                .into_response();
        }
    };

    let token = val.get("token").and_then(|v| v.as_str()).unwrap_or("");
    if token.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            axum::Json(serde_json::json!({"error": "missing token"})),
        )
            .into_response();
    }

    // Validate token format (edgevpn tokens are base64-encoded yaml)
    if token.len() < 100 || token.len() > 4096 {
        return (
            StatusCode::BAD_REQUEST,
            axum::Json(serde_json::json!({"error": "token format invalid"})),
        )
            .into_response();
    }

    if let Err(e) = tokio::fs::write(TOKEN_PATH, token).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            axum::Json(serde_json::json!({
                "error": format!("failed to save token: {e}")
            })),
        )
            .into_response();
    }

    axum::Json(serde_json::json!({"ok": true})).into_response()
}

/// DELETE /v1/cluster — leave the cluster (remove token).
async fn leave_cluster() -> impl IntoResponse {
    let _ = tokio::fs::remove_file(TOKEN_PATH).await;
    // Also disable the system property
    let _ = Command::new("setprop")
        .arg("persist.lethe.cluster.enabled")
        .arg("false")
        .status()
        .await;
    StatusCode::OK
}

async fn getprop(name: &str) -> String {
    Command::new("getprop")
        .arg(name)
        .output()
        .await
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_default()
}

async fn query_edgevpn_peers() -> Option<Vec<serde_json::Value>> {
    // edgevpn exposes a local API when running — typically on port 8080
    // but since that's our agent's port, edgevpn is configured to use 8083
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_millis(500))
        .build()
        .ok()?;
    let resp = client
        .get("http://127.0.0.1:8083/api/peers")
        .send()
        .await
        .ok()?;
    let val: serde_json::Value = resp.json().await.ok()?;
    val.get("peers")
        .and_then(|v| v.as_array())
        .map(|a| a.clone())
}

pub fn router() -> Router {
    Router::new()
        .route("/v1/cluster/status", get(cluster_status))
        .route("/v1/cluster/generate", post(generate_token))
        .route("/v1/cluster/import", post(import_token))
        .route("/v1/cluster", delete(leave_cluster))
}
