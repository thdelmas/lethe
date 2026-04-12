use axum::{routing::get, Json, Router};
use serde::Serialize;
use tokio::fs;

#[derive(Serialize)]
pub struct SysInfo {
    pub battery_percent: Option<u8>,
    pub battery_charging: Option<bool>,
    pub memory_total_mb: Option<u64>,
    pub memory_available_mb: Option<u64>,
    pub storage_total_mb: Option<u64>,
    pub storage_available_mb: Option<u64>,
    pub cpu_cores: Option<usize>,
    pub cpu_arch: String,
    pub uptime_secs: Option<u64>,
    pub hostname: String,
    pub kernel: String,
    pub android_version: String,
}

async fn get_sysinfo() -> Json<SysInfo> {
    let (battery_percent, battery_charging) = read_battery().await;
    let (mem_total, mem_avail) = read_memory().await;
    let (stor_total, stor_avail) = read_storage().await;

    Json(SysInfo {
        battery_percent,
        battery_charging,
        memory_total_mb: mem_total,
        memory_available_mb: mem_avail,
        storage_total_mb: stor_total,
        storage_available_mb: stor_avail,
        cpu_cores: std::thread::available_parallelism().ok().map(|n| n.get()),
        cpu_arch: std::env::consts::ARCH.into(),
        uptime_secs: read_uptime().await,
        hostname: read_line("/etc/hostname").await.unwrap_or_default(),
        kernel: read_line("/proc/version").await.unwrap_or_default(),
        android_version: getprop("ro.build.version.release").await,
    })
}

async fn read_battery() -> (Option<u8>, Option<bool>) {
    let cap = read_line("/sys/class/power_supply/battery/capacity").await;
    let status = read_line("/sys/class/power_supply/battery/status").await;
    (
        cap.and_then(|s| s.trim().parse().ok()),
        status.map(|s| s.trim().eq_ignore_ascii_case("charging")),
    )
}

async fn read_memory() -> (Option<u64>, Option<u64>) {
    let content = match fs::read_to_string("/proc/meminfo").await {
        Ok(c) => c,
        Err(_) => return (None, None),
    };
    let mut total = None;
    let mut avail = None;
    for line in content.lines() {
        if line.starts_with("MemTotal:") {
            total = parse_kb_line(line);
        } else if line.starts_with("MemAvailable:") {
            avail = parse_kb_line(line);
        }
    }
    (total.map(|kb| kb / 1024), avail.map(|kb| kb / 1024))
}

fn parse_kb_line(line: &str) -> Option<u64> {
    line.split_whitespace().nth(1)?.parse().ok()
}

async fn read_storage() -> (Option<u64>, Option<u64>) {
    let output = match tokio::process::Command::new("df")
        .arg("-k")
        .arg("/data")
        .output()
        .await
    {
        Ok(o) => o,
        Err(_) => return (None, None),
    };
    let text = String::from_utf8_lossy(&output.stdout);
    let line = match text.lines().nth(1) {
        Some(l) => l,
        None => return (None, None),
    };
    let parts: Vec<&str> = line.split_whitespace().collect();
    if parts.len() < 4 {
        return (None, None);
    }
    (
        parts[1].parse::<u64>().ok().map(|k| k / 1024),
        parts[3].parse::<u64>().ok().map(|k| k / 1024),
    )
}

async fn read_uptime() -> Option<u64> {
    let content = fs::read_to_string("/proc/uptime").await.ok()?;
    let secs: f64 = content.split_whitespace().next()?.parse().ok()?;
    Some(secs as u64)
}

async fn read_line(path: &str) -> Option<String> {
    fs::read_to_string(path).await.ok().map(|s| s.trim().to_string())
}

async fn getprop(key: &str) -> String {
    tokio::process::Command::new("getprop")
        .arg(key)
        .output()
        .await
        .ok()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_default()
}

pub fn router() -> Router {
    Router::new().route("/api/sysinfo", get(get_sysinfo))
}
