use axum::{extract::Json, routing::post, Router};
use serde::{Deserialize, Serialize};
use tokio::process::Command;

#[derive(Deserialize)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum NetworkRequest {
    WifiScan,
    WifiConnect { ssid: String, password: Option<String> },
    WifiDisconnect,
    WifiStatus,
    SetAirplaneMode { enabled: bool },
    BluetoothToggle { enabled: bool },
}

#[derive(Serialize)]
pub struct NetworkResponse {
    pub ok: bool,
    pub output: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

async fn network_action(Json(req): Json<NetworkRequest>) -> Json<NetworkResponse> {
    match req {
        NetworkRequest::WifiScan => run_cmd("cmd", &["wifi", "list-scan-results"]).await,
        NetworkRequest::WifiConnect { ssid, password } => {
            let args = match password {
                Some(pw) => format!("cmd wifi connect-network '{}' wpa2 '{}'", ssid, pw),
                None => format!("cmd wifi connect-network '{}' open", ssid),
            };
            run_shell(&args).await
        }
        NetworkRequest::WifiDisconnect => run_cmd("cmd", &["wifi", "forget-network", "all"]).await,
        NetworkRequest::WifiStatus => run_cmd("cmd", &["wifi", "status"]).await,
        NetworkRequest::SetAirplaneMode { enabled } => {
            let val = if enabled { "1" } else { "0" };
            run_shell(&format!(
                "settings put global airplane_mode_on {} && \
                 am broadcast -a android.intent.action.AIRPLANE_MODE",
                val
            ))
            .await
        }
        NetworkRequest::BluetoothToggle { enabled } => {
            let subcmd = if enabled { "enable" } else { "disable" };
            run_cmd("cmd", &["bluetooth_manager", subcmd]).await
        }
    }
}

async fn run_cmd(program: &str, args: &[&str]) -> Json<NetworkResponse> {
    match Command::new(program).args(args).output().await {
        Ok(o) => Json(NetworkResponse {
            ok: o.status.success(),
            output: String::from_utf8_lossy(&o.stdout).into_owned(),
            error: if o.status.success() {
                None
            } else {
                Some(String::from_utf8_lossy(&o.stderr).into_owned())
            },
        }),
        Err(e) => Json(NetworkResponse {
            ok: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

async fn run_shell(cmd: &str) -> Json<NetworkResponse> {
    match Command::new("sh").arg("-c").arg(cmd).output().await {
        Ok(o) => Json(NetworkResponse {
            ok: o.status.success(),
            output: String::from_utf8_lossy(&o.stdout).into_owned(),
            error: if o.status.success() {
                None
            } else {
                Some(String::from_utf8_lossy(&o.stderr).into_owned())
            },
        }),
        Err(e) => Json(NetworkResponse {
            ok: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

pub fn router() -> Router {
    Router::new().route("/api/network", post(network_action))
}
