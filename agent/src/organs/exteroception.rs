//! Exteroception — the wake-sense organ, ported from the
//! agent-nervous-system suite (thdelmas/exteroception).
//!
//! Sweeps the watched surfaces of the device, diffs actual state against
//! the remembered baseline, and hands ranked deltas to the organ loop.
//! Read-only: a sweep never mutates. The delta — not the state — is the
//! finding; a surface that reads the same as last tick produces nothing.
//!
//! Slice 1 watches the network/anonymity surface: Tor service state,
//! Wi-Fi association, airplane mode, bluetooth, private DNS. The baseline
//! persists at /data/lethe/organs/exteroception.json so a daemon restart
//! doesn't blind the sense.
//!
//! Probe discipline: a reading of `None` means the probe itself failed,
//! never that the surface is off. A failed probe keeps the old baseline
//! value and reports itself as a delta — an unreadable surface must not
//! masquerade as an unchanged (or changed) one.

use serde::{Deserialize, Serialize};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::process::Command;

pub const SNAPSHOT_PATH: &str = "/data/lethe/organs/exteroception.json";

/// Tor is not a toggle on LETHE — the transparent proxy is the core
/// promise. Any state other than this is a standing violation.
const TOR_EXPECTED: &str = "running";

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct Snapshot {
    pub taken_at_epoch_s: u64,
    /// `init.svc.lethe_tor` — "running" / "stopped" / "unset" (never started).
    pub tor_svc: Option<String>,
    /// Compact Wi-Fi state: "connected:<ssid>" / "enabled" / "disabled".
    pub wifi: Option<String>,
    /// `settings get global airplane_mode_on` — "0" / "1".
    pub airplane_mode: Option<String>,
    /// `settings get global bluetooth_on` — "0" / "1".
    pub bluetooth: Option<String>,
    /// "<private_dns_mode>:<private_dns_specifier>".
    pub private_dns: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum Severity {
    Info,
    Alert,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Delta {
    pub surface: &'static str,
    pub before: String,
    pub after: String,
    pub severity: Severity,
}

impl Delta {
    pub fn brief(&self) -> String {
        format!("{}: {} -> {}", self.surface, self.before, self.after)
    }
}

/// Result of one sweep. `violations` are standing expectation breaches
/// (present even when unchanged since last tick) — the loop uses them to
/// hold arousal up; `deltas` are news since the baseline.
#[derive(Debug, Default)]
pub struct SweepOutcome {
    pub first_run: bool,
    pub deltas: Vec<Delta>,
    pub violations: Vec<String>,
}

pub async fn sweep(snapshot_path: &Path) -> SweepOutcome {
    let baseline = load_baseline(snapshot_path).await;
    let current = gather().await;
    let merged = merge_probe_failures(baseline.as_ref(), current);

    let (first_run, deltas) = match &baseline {
        None => (true, Vec::new()),
        Some(old) => (false, diff(old, &merged)),
    };
    let violations = violations(&merged);

    store_baseline(snapshot_path, &merged).await;
    SweepOutcome {
        first_run,
        deltas,
        violations,
    }
}

async fn load_baseline(path: &Path) -> Option<Snapshot> {
    let bytes = tokio::fs::read(path).await.ok()?;
    serde_json::from_slice(&bytes).ok()
}

async fn store_baseline(path: &Path, snap: &Snapshot) {
    if let Some(dir) = path.parent() {
        let _ = tokio::fs::create_dir_all(dir).await;
    }
    if let Ok(json) = serde_json::to_vec_pretty(snap) {
        if let Err(e) = tokio::fs::write(path, json).await {
            eprintln!("organs/exteroception: baseline write failed: {e}");
        }
    }
}

async fn gather() -> Snapshot {
    Snapshot {
        taken_at_epoch_s: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0),
        tor_svc: probe("getprop", &["init.svc.lethe_tor"])
            .await
            .map(|v| if v.is_empty() { "unset".into() } else { v }),
        wifi: probe("cmd", &["wifi", "status"]).await.map(compact_wifi),
        airplane_mode: probe("settings", &["get", "global", "airplane_mode_on"]).await,
        bluetooth: probe("settings", &["get", "global", "bluetooth_on"]).await,
        private_dns: match (
            probe("settings", &["get", "global", "private_dns_mode"]).await,
            probe("settings", &["get", "global", "private_dns_specifier"]).await,
        ) {
            (Some(mode), Some(spec)) => Some(format!("{mode}:{spec}")),
            _ => None,
        },
    }
}

/// Read-only probe: trimmed stdout on success, `None` when the command
/// fails to spawn or exits non-zero.
async fn probe(program: &str, args: &[&str]) -> Option<String> {
    let out = Command::new(program).args(args).output().await.ok()?;
    if !out.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

/// Reduce `cmd wifi status` output to a stable, comparable token so
/// incidental output churn (signal strength, tx rates) never reads as a
/// delta.
fn compact_wifi(raw: String) -> String {
    if let Some(idx) = raw.find("connected to \"") {
        let rest = &raw[idx + "connected to \"".len()..];
        if let Some(end) = rest.find('"') {
            return format!("connected:{}", &rest[..end]);
        }
    }
    if raw.contains("Wifi is enabled") {
        return "enabled".into();
    }
    if raw.contains("Wifi is disabled") {
        return "disabled".into();
    }
    "unknown".into()
}

/// A failed probe must not overwrite a known baseline value: keep the old
/// reading so the next successful probe diffs against reality, not against
/// a gap.
fn merge_probe_failures(baseline: Option<&Snapshot>, mut current: Snapshot) -> Snapshot {
    let Some(old) = baseline else {
        return current;
    };
    fn keep(cur: &mut Option<String>, old: &Option<String>) {
        if cur.is_none() && old.is_some() {
            *cur = old.clone();
        }
    }
    keep(&mut current.tor_svc, &old.tor_svc);
    keep(&mut current.wifi, &old.wifi);
    keep(&mut current.airplane_mode, &old.airplane_mode);
    keep(&mut current.bluetooth, &old.bluetooth);
    keep(&mut current.private_dns, &old.private_dns);
    current
}

pub fn diff(old: &Snapshot, new: &Snapshot) -> Vec<Delta> {
    let mut out = Vec::new();
    let surfaces: [(&'static str, &Option<String>, &Option<String>); 5] = [
        ("tor", &old.tor_svc, &new.tor_svc),
        ("wifi", &old.wifi, &new.wifi),
        ("airplane_mode", &old.airplane_mode, &new.airplane_mode),
        ("bluetooth", &old.bluetooth, &new.bluetooth),
        ("private_dns", &old.private_dns, &new.private_dns),
    ];
    for (surface, before, after) in surfaces {
        if let (Some(b), Some(a)) = (before, after) {
            if b != a {
                out.push(Delta {
                    surface,
                    before: b.clone(),
                    after: a.clone(),
                    severity: severity_of(surface, a),
                });
            }
        }
    }
    // Rank alerts first: the brief is an input to the loop's decide step.
    out.sort_by(|a, b| b.severity.cmp(&a.severity));
    out
}

/// Tor leaving "running" and hardened-DNS drift are the surfaces whose
/// change breaks a promise the OS made; everything else is orientation.
fn severity_of(surface: &str, after: &str) -> Severity {
    match surface {
        "tor" if after != TOR_EXPECTED => Severity::Alert,
        "private_dns" => Severity::Alert,
        _ => Severity::Info,
    }
}

/// Standing expectation breaches — "the absence of an expected event is
/// an event". Reported every sweep until cleared, independent of the diff.
pub fn violations(snap: &Snapshot) -> Vec<String> {
    let mut out = Vec::new();
    if let Some(tor) = &snap.tor_svc {
        if tor != TOR_EXPECTED {
            out.push(format!("tor transparent proxy not running (init.svc.lethe_tor={tor})"));
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn snap(tor: &str, wifi: &str) -> Snapshot {
        Snapshot {
            taken_at_epoch_s: 1,
            tor_svc: Some(tor.into()),
            wifi: Some(wifi.into()),
            airplane_mode: Some("0".into()),
            bluetooth: Some("0".into()),
            private_dns: Some("hostname:dns.quad9.net".into()),
        }
    }

    #[test]
    fn unchanged_snapshot_yields_no_deltas() {
        let a = snap("running", "connected:home");
        assert!(diff(&a, &a).is_empty());
    }

    #[test]
    fn tor_stop_is_alert_and_ranked_first() {
        let old = snap("running", "connected:home");
        let mut new = snap("stopped", "connected:cafe");
        new.taken_at_epoch_s = 2;
        let deltas = diff(&old, &new);
        assert_eq!(deltas.len(), 2);
        assert_eq!(deltas[0].surface, "tor");
        assert_eq!(deltas[0].severity, Severity::Alert);
        assert_eq!(deltas[1].severity, Severity::Info);
    }

    #[test]
    fn private_dns_drift_is_alert() {
        let old = snap("running", "enabled");
        let mut new = old.clone();
        new.private_dns = Some("off:".into());
        let deltas = diff(&old, &new);
        assert_eq!(deltas[0].surface, "private_dns");
        assert_eq!(deltas[0].severity, Severity::Alert);
    }

    #[test]
    fn probe_failure_keeps_baseline_and_is_not_a_delta() {
        let old = snap("running", "connected:home");
        let mut cur = snap("running", "connected:home");
        cur.wifi = None; // probe failed this tick
        let merged = merge_probe_failures(Some(&old), cur);
        assert_eq!(merged.wifi.as_deref(), Some("connected:home"));
        assert!(diff(&old, &merged).is_empty());
    }

    #[test]
    fn tor_violation_reported_even_without_transition() {
        let s = snap("stopped", "enabled");
        let v = violations(&s);
        assert_eq!(v.len(), 1);
        assert!(v[0].contains("lethe_tor=stopped"));
    }

    #[test]
    fn wifi_compaction_is_stable_across_noise() {
        let a = compact_wifi("Wifi is enabled\nWifi is connected to \"home\"\nrssi -54".into());
        let b = compact_wifi("Wifi is enabled\nWifi is connected to \"home\"\nrssi -71".into());
        assert_eq!(a, b);
        assert_eq!(a, "connected:home");
    }

    #[test]
    fn snapshot_serde_roundtrip() {
        let s = snap("running", "disabled");
        let json = serde_json::to_string(&s).unwrap();
        let back: Snapshot = serde_json::from_str(&json).unwrap();
        assert_eq!(s, back);
    }
}
