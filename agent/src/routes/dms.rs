//! Dead Man's Switch status endpoint.
//!
//! Reads DMS configuration from Android system properties and the
//! heartbeat file, computes time until next check-in and current
//! escalation stage, and returns a JSON summary. The launcher and
//! agent voice path use this so the user can ask "Is DMS armed?"

use axum::response::IntoResponse;
use axum::routing::get;
use axum::Router;
use serde::Serialize;
use std::time::{SystemTime, UNIX_EPOCH};

const HEARTBEAT_PATH: &str = "/persist/lethe/deadman/last_checkin";

#[derive(Debug, Serialize)]
pub struct DmsStatus {
    pub enabled: bool,
    pub interval_s: u64,
    pub grace_period_s: u64,
    pub last_checkin_unix: Option<u64>,
    pub next_checkin_due_unix: Option<u64>,
    pub seconds_until_due: Option<i64>,
    pub stage: &'static str,
    pub stage3_enabled: bool,
    pub duress_pin_enabled: bool,
}

fn getprop(key: &str) -> Option<String> {
    std::process::Command::new("getprop")
        .arg(key)
        .output()
        .ok()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .filter(|s| !s.is_empty())
}

fn getprop_bool(key: &str) -> bool {
    getprop(key).map(|v| v == "true" || v == "1").unwrap_or(false)
}

fn parse_interval(s: &str) -> u64 {
    let s = s.trim();
    if s.ends_with('d') {
        s.trim_end_matches('d').parse::<u64>().unwrap_or(24) * 86400
    } else if s.ends_with('h') {
        s.trim_end_matches('h').parse::<u64>().unwrap_or(24) * 3600
    } else if s.ends_with('m') {
        s.trim_end_matches('m').parse::<u64>().unwrap_or(1440) * 60
    } else {
        s.parse::<u64>().unwrap_or(86400)
    }
}

fn read_last_checkin() -> Option<u64> {
    let content = std::fs::read_to_string(HEARTBEAT_PATH).ok()?;
    content.trim().parse::<u64>().ok()
}

fn now_unix() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

async fn status() -> impl IntoResponse {
    let enabled = getprop_bool("persist.lethe.deadman.enabled");

    if !enabled {
        return axum::Json(DmsStatus {
            enabled: false,
            interval_s: 0,
            grace_period_s: 0,
            last_checkin_unix: None,
            next_checkin_due_unix: None,
            seconds_until_due: None,
            stage: "disabled",
            stage3_enabled: false,
            duress_pin_enabled: false,
        });
    }

    let interval_raw = getprop("persist.lethe.deadman.interval").unwrap_or("24h".into());
    let interval_s = parse_interval(&interval_raw);
    let grace_raw = getprop("persist.lethe.deadman.grace_period").unwrap_or("4h".into());
    let grace_period_s = parse_interval(&grace_raw);

    let last_checkin = read_last_checkin();
    let now = now_unix();

    let (next_due, seconds_until, stage) = match last_checkin {
        Some(lc) => {
            let due = lc + interval_s;
            let until = due as i64 - now as i64;
            let stage = if until > 0 {
                "armed"
            } else if (now - due) < grace_period_s {
                "grace"
            } else {
                let since_grace = now - (due + grace_period_s);
                let s2_delay = parse_interval(
                    &getprop("persist.lethe.deadman.stage2.delay").unwrap_or("1h".into()),
                );
                if since_grace < s2_delay {
                    "locked"
                } else {
                    "wiped"
                }
            };
            (Some(due), Some(until), stage)
        }
        None => (None, None, "no_checkin_recorded"),
    };

    axum::Json(DmsStatus {
        enabled,
        interval_s,
        grace_period_s,
        last_checkin_unix: last_checkin,
        next_checkin_due_unix: next_due,
        seconds_until_due: seconds_until,
        stage,
        stage3_enabled: getprop_bool("persist.lethe.deadman.stage3.enabled"),
        duress_pin_enabled: getprop_bool("persist.lethe.deadman.duress_pin.enabled"),
    })
}

pub fn router() -> Router {
    Router::new().route("/api/dms/status", get(status))
}
