use axum::{routing::get, Json, Router};
use serde::Serialize;
use tokio::fs;

/// Existing /api/device contract — consumed by launcher-chat.js every 30s.
#[derive(Serialize)]
pub struct DeviceState {
    pub tor: bool,
    pub burner_mode: bool,
    pub trackers_blocked: u32,
    pub battery: Option<u8>,
    pub battery_charging: Option<bool>,
    pub connectivity: String,
    pub dead_mans_switch: bool,
}

async fn get_device() -> Json<DeviceState> {
    Json(DeviceState {
        tor: prop_bool("persist.lethe.tor.enabled").await,
        burner_mode: prop_bool("persist.lethe.burner.enabled").await,
        trackers_blocked: read_tracker_count().await,
        battery: read_battery_level().await,
        battery_charging: read_battery_charging().await,
        connectivity: detect_connectivity().await,
        dead_mans_switch: prop_bool("persist.lethe.deadman.enabled").await,
    })
}

async fn prop_bool(key: &str) -> bool {
    tokio::process::Command::new("getprop")
        .arg(key)
        .output()
        .await
        .ok()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim() == "1")
        .unwrap_or(false)
}

async fn read_battery_level() -> Option<u8> {
    fs::read_to_string("/sys/class/power_supply/battery/capacity")
        .await
        .ok()
        .and_then(|s| s.trim().parse().ok())
}

async fn read_battery_charging() -> Option<bool> {
    fs::read_to_string("/sys/class/power_supply/battery/status")
        .await
        .ok()
        .map(|s| s.trim().eq_ignore_ascii_case("Charging"))
}

async fn read_tracker_count() -> u32 {
    // Count blocked entries in the LETHE hosts file
    let content = fs::read_to_string("/system/etc/hosts").await.unwrap_or_default();
    content
        .lines()
        .filter(|l| {
            let t = l.trim();
            !t.is_empty() && !t.starts_with('#') && t.starts_with("0.0.0.0")
        })
        .count() as u32
}

async fn detect_connectivity() -> String {
    // Quick check: can we reach the GrapheneOS connectivity endpoint?
    let result = tokio::time::timeout(
        std::time::Duration::from_secs(5),
        tokio::process::Command::new("sh")
            .arg("-c")
            .arg("curl -so /dev/null -w '%{http_code}' --max-time 4 https://connectivity.grapheneos.org/generate_204")
            .output(),
    )
    .await;

    match result {
        Ok(Ok(output)) => {
            let code = String::from_utf8_lossy(&output.stdout);
            if code.trim() == "204" {
                "online".into()
            } else {
                "captive_portal".into()
            }
        }
        _ => "offline".into(),
    }
}

pub fn router() -> Router {
    Router::new().route("/api/device", get(get_device))
}
