use axum::{extract::Json, routing::post, Router};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tokio::process::Command;

const TIMEOUT_SECS: u64 = 30;
const MAX_OUTPUT_BYTES: usize = 64 * 1024;

#[derive(Deserialize)]
pub struct ShellRequest {
    command: String,
    #[serde(default = "default_timeout")]
    timeout_secs: u64,
}

fn default_timeout() -> u64 {
    TIMEOUT_SECS
}

#[derive(Serialize)]
pub struct ShellResponse {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
    pub timed_out: bool,
}

async fn run_shell(Json(req): Json<ShellRequest>) -> Json<ShellResponse> {
    let timeout = Duration::from_secs(req.timeout_secs.min(120));

    let result = tokio::time::timeout(
        timeout,
        Command::new("sh")
            .arg("-c")
            .arg(&req.command)
            .output(),
    )
    .await;

    match result {
        Ok(Ok(output)) => Json(ShellResponse {
            stdout: truncate_utf8(&output.stdout, MAX_OUTPUT_BYTES),
            stderr: truncate_utf8(&output.stderr, MAX_OUTPUT_BYTES),
            exit_code: output.status.code(),
            timed_out: false,
        }),
        Ok(Err(e)) => Json(ShellResponse {
            stdout: String::new(),
            stderr: format!("exec error: {e}"),
            exit_code: None,
            timed_out: false,
        }),
        Err(_) => Json(ShellResponse {
            stdout: String::new(),
            stderr: "command timed out".into(),
            exit_code: None,
            timed_out: true,
        }),
    }
}

fn truncate_utf8(bytes: &[u8], max: usize) -> String {
    let s = String::from_utf8_lossy(bytes);
    if s.len() <= max {
        s.into_owned()
    } else {
        let mut end = max;
        while end > 0 && !s.is_char_boundary(end) {
            end -= 1;
        }
        format!("{}…(truncated)", &s[..end])
    }
}

pub fn router() -> Router {
    Router::new().route("/api/shell", post(run_shell))
}
