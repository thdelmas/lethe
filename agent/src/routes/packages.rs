use axum::{extract::Json, routing::{get, post}, Router};
use serde::{Deserialize, Serialize};
use tokio::process::Command;

#[derive(Deserialize)]
pub struct PackageRequest {
    action: PackageAction,
    package: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PackageAction {
    Install,
    Remove,
    Info,
}

#[derive(Serialize)]
pub struct PackageResponse {
    pub ok: bool,
    pub output: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// List installed packages (Android: pm list packages)
async fn list_packages() -> Json<PackageResponse> {
    let output = Command::new("pm")
        .args(["list", "packages", "-f"])
        .output()
        .await;

    match output {
        Ok(o) => Json(PackageResponse {
            ok: o.status.success(),
            output: String::from_utf8_lossy(&o.stdout).into_owned(),
            error: if o.status.success() {
                None
            } else {
                Some(String::from_utf8_lossy(&o.stderr).into_owned())
            },
        }),
        Err(e) => Json(PackageResponse {
            ok: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

/// Install, remove, or query a package
async fn manage_package(Json(req): Json<PackageRequest>) -> Json<PackageResponse> {
    let (cmd, args) = match req.action {
        PackageAction::Install => ("pm", vec!["install", "-r", &req.package]),
        PackageAction::Remove => ("pm", vec!["uninstall", &req.package]),
        PackageAction::Info => ("dumpsys", vec!["package", &req.package]),
    };

    let output = Command::new(cmd).args(&args).output().await;

    match output {
        Ok(o) => Json(PackageResponse {
            ok: o.status.success(),
            output: String::from_utf8_lossy(&o.stdout).into_owned(),
            error: if o.status.success() {
                None
            } else {
                Some(String::from_utf8_lossy(&o.stderr).into_owned())
            },
        }),
        Err(e) => Json(PackageResponse {
            ok: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

pub fn router() -> Router {
    Router::new()
        .route("/api/packages/list", get(list_packages))
        .route("/api/packages/manage", post(manage_package))
}
