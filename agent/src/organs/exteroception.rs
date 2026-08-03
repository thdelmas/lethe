//! Exteroception — the wake-sense organ, ported from the
//! agent-nervous-system suite (thdelmas/exteroception).
//!
//! Sweeps the watched surfaces of the device, diffs actual state against
//! the remembered baseline, and hands ranked deltas to the organ loop.
//! Read-only: a sweep never mutates. The delta — not the state — is the
//! finding; a surface that reads the same as last tick produces nothing.
//!
//! Slice 1 watches the network/anonymity surface: Tor service state,
//! Wi-Fi association, airplane mode, bluetooth, private DNS. Slice 2 adds
//! the install surface: the third-party package set (an app appearing or
//! vanishing is news the user should see at wake, not discover in the
//! drawer) and the tracker-hosts file integrity (baked into the read-only
//! system image — a changed hash means remount or tamper, a broken
//! promise either way). The baseline persists at
//! /data/lethe/organs/exteroception.json so a daemon restart doesn't
//! blind the sense.
//!
//! Probe discipline: a reading of `None` means the probe itself failed,
//! never that the surface is off. A failed probe keeps the old baseline
//! value and reports itself as a delta — an unreadable surface must not
//! masquerade as an unchanged (or changed) one.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeSet;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::process::Command;

pub const SNAPSHOT_PATH: &str = "/data/lethe/organs/exteroception.json";

/// Tor is not a toggle on LETHE — the transparent proxy is the core
/// promise. Any state other than this is a standing violation.
const TOR_EXPECTED: &str = "running";

/// The StevenBlack/AdAway blocklist baked into the system image at build
/// time (manifest.yaml tracker_blocking).
const HOSTS_PATH: &str = "/system/etc/hosts";

/// A package-set delta lists at most this many names before eliding; the
/// brief must stay one line even after a restore installs fifty apps.
const PKG_DELTA_MAX_LISTED: usize = 6;

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
    /// Third-party package names (`cmd package list packages -3`). System
    /// packages sit behind verified boot; this set is where installs land.
    pub pkgs_3p: Option<BTreeSet<String>>,
    /// Hex SHA-256 of the baked-in tracker blocklist at /system/etc/hosts.
    pub hosts_sha256: Option<String>,
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
        pkgs_3p: probe("cmd", &["package", "list", "packages", "-3"])
            .await
            .map(parse_package_list),
        hosts_sha256: hash_file(Path::new(HOSTS_PATH)).await,
    }
}

/// "package:com.foo\npackage:com.bar" -> {"com.foo", "com.bar"}. A BTreeSet
/// so ordering never manufactures a delta.
fn parse_package_list(raw: String) -> BTreeSet<String> {
    raw.lines()
        .filter_map(|l| l.trim().strip_prefix("package:"))
        .filter(|p| !p.is_empty())
        .map(str::to_string)
        .collect()
}

/// Hex SHA-256 of a file; `None` when unreadable (probe failure, not a
/// value).
async fn hash_file(path: &Path) -> Option<String> {
    let bytes = tokio::fs::read(path).await.ok()?;
    let digest = Sha256::digest(&bytes);
    Some(format!("{digest:x}"))
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
    if current.pkgs_3p.is_none() && old.pkgs_3p.is_some() {
        current.pkgs_3p = old.pkgs_3p.clone();
    }
    keep(&mut current.hosts_sha256, &old.hosts_sha256);
    current
}

pub fn diff(old: &Snapshot, new: &Snapshot) -> Vec<Delta> {
    let mut out = Vec::new();
    let surfaces: [(&'static str, &Option<String>, &Option<String>); 6] = [
        ("tor", &old.tor_svc, &new.tor_svc),
        ("wifi", &old.wifi, &new.wifi),
        ("airplane_mode", &old.airplane_mode, &new.airplane_mode),
        ("bluetooth", &old.bluetooth, &new.bluetooth),
        ("private_dns", &old.private_dns, &new.private_dns),
        ("hosts_integrity", &old.hosts_sha256, &new.hosts_sha256),
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
    if let Some(d) = diff_packages(&old.pkgs_3p, &new.pkgs_3p) {
        out.push(d);
    }
    // Rank alerts first: the brief is an input to the loop's decide step.
    out.sort_by(|a, b| b.severity.cmp(&a.severity));
    out
}

/// Tor leaving "running", hardened-DNS drift, and tracker-hosts drift are
/// the surfaces whose change breaks a promise the OS made; everything else
/// is orientation. Package installs are Info by design: the deterministic
/// half cannot tell a user's Aurora install from planted stalkerware, so
/// it reports the fact and leaves escalation to the judgment half.
fn severity_of(surface: &str, after: &str) -> Severity {
    match surface {
        "tor" if after != TOR_EXPECTED => Severity::Alert,
        "private_dns" => Severity::Alert,
        "hosts_integrity" => Severity::Alert,
        _ => Severity::Info,
    }
}

/// One compact Delta for the whole package-set change: "42 pkgs" ->
/// "+com.new.app -com.gone.app", eliding past PKG_DELTA_MAX_LISTED so a
/// bulk restore can't flood the brief.
fn diff_packages(old: &Option<BTreeSet<String>>, new: &Option<BTreeSet<String>>) -> Option<Delta> {
    let (Some(o), Some(n)) = (old, new) else {
        return None;
    };
    if o == n {
        return None;
    }
    let changes: Vec<String> = n
        .difference(o)
        .map(|p| format!("+{p}"))
        .chain(o.difference(n).map(|p| format!("-{p}")))
        .collect();
    let shown = changes.iter().take(PKG_DELTA_MAX_LISTED).cloned().collect::<Vec<_>>();
    let after = if changes.len() > PKG_DELTA_MAX_LISTED {
        format!("{} (+{} more)", shown.join(" "), changes.len() - PKG_DELTA_MAX_LISTED)
    } else {
        shown.join(" ")
    };
    Some(Delta {
        surface: "packages",
        before: format!("{} pkgs", o.len()),
        after,
        severity: Severity::Info,
    })
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
            pkgs_3p: Some(pkgs(&["org.fdroid.fdroid", "com.aurora.store"])),
            hosts_sha256: Some("aa11".into()),
        }
    }

    fn pkgs(names: &[&str]) -> BTreeSet<String> {
        names.iter().map(|s| s.to_string()).collect()
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

    /// A slice-1 baseline already sits on deployed devices; it must load
    /// with the new surfaces as None, and the first slice-2 sweep must
    /// adopt them silently (no manufactured delta from None -> Some).
    #[test]
    fn slice1_baseline_loads_and_new_surfaces_adopt_silently() {
        let old_json = r#"{"taken_at_epoch_s":1,"tor_svc":"running","wifi":"enabled",
            "airplane_mode":"0","bluetooth":"0","private_dns":"hostname:dns.quad9.net"}"#;
        let old: Snapshot = serde_json::from_str(old_json).unwrap();
        assert!(old.pkgs_3p.is_none());
        assert!(old.hosts_sha256.is_none());
        let mut new = old.clone();
        new.pkgs_3p = Some(pkgs(&["org.fdroid.fdroid"]));
        new.hosts_sha256 = Some("aa11".into());
        assert!(diff(&old, &new).is_empty());
    }

    #[test]
    fn package_install_and_removal_is_one_info_delta() {
        let old = snap("running", "enabled");
        let mut new = old.clone();
        new.pkgs_3p = Some(pkgs(&["org.fdroid.fdroid", "com.evil.app"]));
        let deltas = diff(&old, &new);
        assert_eq!(deltas.len(), 1);
        assert_eq!(deltas[0].surface, "packages");
        assert_eq!(deltas[0].severity, Severity::Info);
        assert_eq!(deltas[0].before, "2 pkgs");
        assert_eq!(deltas[0].after, "+com.evil.app -com.aurora.store");
    }

    #[test]
    fn bulk_package_change_elides_past_cap() {
        let old = snap("running", "enabled");
        let mut new = old.clone();
        let many: Vec<String> = (0..10).map(|i| format!("com.app.n{i}")).collect();
        new.pkgs_3p = Some(many.iter().map(String::from).collect());
        let deltas = diff(&old, &new);
        assert_eq!(deltas.len(), 1);
        assert!(deltas[0].after.ends_with("(+6 more)"), "got: {}", deltas[0].after);
    }

    #[test]
    fn hosts_drift_is_alert_and_ranked_first() {
        let old = snap("running", "enabled");
        let mut new = old.clone();
        new.hosts_sha256 = Some("bb22".into());
        new.pkgs_3p = Some(pkgs(&["org.fdroid.fdroid", "com.aurora.store", "com.x"]));
        let deltas = diff(&old, &new);
        assert_eq!(deltas[0].surface, "hosts_integrity");
        assert_eq!(deltas[0].severity, Severity::Alert);
    }

    #[test]
    fn package_probe_failure_keeps_baseline_set() {
        let old = snap("running", "enabled");
        let mut cur = old.clone();
        cur.pkgs_3p = None; // `cmd package` failed this tick
        let merged = merge_probe_failures(Some(&old), cur);
        assert_eq!(merged.pkgs_3p, old.pkgs_3p);
        assert!(diff(&old, &merged).is_empty());
    }

    #[test]
    fn package_list_parses_and_ignores_noise() {
        let set = parse_package_list(
            "package:com.aurora.store\npackage:org.fdroid.fdroid\n\nWarning: junk line\npackage:".into(),
        );
        assert_eq!(set, pkgs(&["com.aurora.store", "org.fdroid.fdroid"]));
    }
}
