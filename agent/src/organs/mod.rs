//! The organ loop — consciousness-loop port from the agent-nervous-system
//! suite (thdelmas/consciousness-loop).
//!
//! A self-firing executive: wake on a tick, sense (exteroception sweep),
//! integrate, decide, act or defer, set the next wake interval from
//! arousal, sleep. Slice 1 is fully deterministic — no LLM call per tick;
//! judgment prompts route through docs/agent/organs.yaml task fragments
//! in a later slice. The daemon runs for the life of the device, so the
//! suite's "bound every autonomous run" translates to a time-boxed sense
//! per tick and arousal decay, not a total-tick cap.
//!
//! Cadence is legible by design: every tick logs its arousal band, the
//! chosen interval, and the reason — self-regulation you can't see reads
//! as randomness.
//!
//! Arousal bands (seconds, overridable via system properties):
//!   alert  persist.lethe.organs.tick.alert   default 300
//!   drowsy persist.lethe.organs.tick.drowsy  default 1800
//!   deep   persist.lethe.organs.tick.deep    default 7200
//! Master switch: persist.lethe.organs.enabled (default on; "0"/"false"
//! disables sweeping but keeps the loop breathing at the deep interval so
//! a re-enable is picked up without a daemon restart).

pub mod exteroception;

use crate::routes::state::{AgentEvent, AgentState};
use exteroception::{Severity, SweepOutcome};
use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

const SENSE_TIMEOUT: Duration = Duration::from_secs(30);
/// Consecutive quiet ticks before arousal decays one band.
const QUIET_TICKS_TO_DECAY: u32 = 2;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Arousal {
    Alert,
    Drowsy,
    DeepSleep,
}

impl Arousal {
    fn interval(self) -> Duration {
        let (key, env, default) = match self {
            Arousal::Alert => ("persist.lethe.organs.tick.alert", "LETHE_ORGANS_TICK_ALERT", 300),
            Arousal::Drowsy => ("persist.lethe.organs.tick.drowsy", "LETHE_ORGANS_TICK_DROWSY", 1800),
            Arousal::DeepSleep => ("persist.lethe.organs.tick.deep", "LETHE_ORGANS_TICK_DEEP", 7200),
        };
        let secs = prop_or_env(key, env)
            .and_then(|v| v.parse::<u64>().ok())
            .filter(|&s| s > 0)
            .unwrap_or(default);
        Duration::from_secs(secs)
    }

    fn decay(self) -> Arousal {
        match self {
            Arousal::Alert => Arousal::Drowsy,
            _ => Arousal::DeepSleep,
        }
    }
}

/// The frequency-setting step, pure so it can be tested on the host.
/// Violations (standing expectation breaches, e.g. Tor down) pin arousal
/// at Alert — a persistent breach must never decay into deep sleep.
fn next_arousal(current: Arousal, outcome: &SweepOutcome, quiet_ticks: u32) -> (Arousal, u32) {
    if !outcome.violations.is_empty()
        || outcome.deltas.iter().any(|d| d.severity == Severity::Alert)
    {
        return (Arousal::Alert, 0);
    }
    if !outcome.deltas.is_empty() {
        // Info-level news: worth watching, not worth racing.
        return (Arousal::Drowsy, 0);
    }
    let quiet = quiet_ticks + 1;
    if quiet >= QUIET_TICKS_TO_DECAY {
        (current.decay(), 0)
    } else {
        (current, quiet)
    }
}

pub fn spawn(agent: Arc<AgentState>) {
    tokio::spawn(run(agent, Path::new(exteroception::SNAPSHOT_PATH).to_path_buf()));
}

async fn run(agent: Arc<AgentState>, snapshot_path: std::path::PathBuf) {
    let mut arousal = Arousal::Drowsy;
    let mut quiet_ticks: u32 = 0;
    let mut tick: u64 = 0;

    loop {
        tick += 1;

        if !enabled() {
            let interval = Arousal::DeepSleep.interval();
            eprintln!(
                "organs: tick #{tick} disabled — sleeping {}s (persist.lethe.organs.enabled=0)",
                interval.as_secs()
            );
            tokio::time::sleep(interval).await;
            continue;
        }

        // Sense — time-boxed: a sense that takes as long as the work it
        // orients is not a sense. On timeout, this tick reports nothing
        // rather than blocking the loop (stale beats blind).
        let outcome = match tokio::time::timeout(SENSE_TIMEOUT, exteroception::sweep(&snapshot_path)).await {
            Ok(o) => o,
            Err(_) => {
                eprintln!("organs: tick #{tick} sweep timed out after {}s", SENSE_TIMEOUT.as_secs());
                SweepOutcome::default()
            }
        };

        // Integrate + decide + act/defer. One tick, one thing: the act is
        // the brief — surface the top finding to the UI stream; everything
        // else waits in the log for the next consumer.
        let reason = if outcome.first_run {
            "baseline established".to_string()
        } else if let Some(v) = outcome.violations.first() {
            agent.broadcast(AgentEvent {
                state: "alert".into(),
                status: v.clone(),
            });
            format!("violation: {v}")
        } else if let Some(d) = outcome.deltas.first() {
            if d.severity == Severity::Alert {
                agent.broadcast(AgentEvent {
                    state: "alert".into(),
                    status: d.brief(),
                });
            }
            format!("{} deltas, top: {}", outcome.deltas.len(), d.brief())
        } else {
            "quiet".to_string()
        };

        // Set the next frequency and sleep. Sleeping is the loop working.
        let (next, quiet) = next_arousal(arousal, &outcome, quiet_ticks);
        arousal = next;
        quiet_ticks = quiet;
        let interval = arousal.interval();
        eprintln!(
            "organs: tick #{tick} arousal={arousal:?} next_wake={}s reason={reason}",
            interval.as_secs()
        );
        tokio::time::sleep(interval).await;
    }
}

fn enabled() -> bool {
    match prop_or_env("persist.lethe.organs.enabled", "LETHE_ORGANS_ENABLED") {
        Some(v) => !(v == "0" || v == "false"),
        None => true,
    }
}

/// Android getprop with an env-var fallback so the loop is drivable on a
/// dev host (same pattern as routes/router.rs).
fn prop_or_env(key: &str, env: &str) -> Option<String> {
    if let Ok(out) = std::process::Command::new("getprop").arg(key).output() {
        let v = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if !v.is_empty() {
            return Some(v);
        }
    }
    std::env::var(env).ok().filter(|v| !v.is_empty())
}

#[cfg(test)]
mod tests {
    use super::exteroception::{Delta, Severity, SweepOutcome};
    use super::*;

    fn quiet_outcome() -> SweepOutcome {
        SweepOutcome::default()
    }

    fn outcome_with(severity: Severity) -> SweepOutcome {
        SweepOutcome {
            deltas: vec![Delta {
                surface: "wifi",
                before: "a".into(),
                after: "b".into(),
                severity,
            }],
            ..Default::default()
        }
    }

    #[test]
    fn alert_delta_raises_arousal() {
        let (a, q) = next_arousal(Arousal::DeepSleep, &outcome_with(Severity::Alert), 5);
        assert_eq!(a, Arousal::Alert);
        assert_eq!(q, 0);
    }

    #[test]
    fn standing_violation_pins_alert_even_when_diff_is_quiet() {
        let outcome = SweepOutcome {
            violations: vec!["tor down".into()],
            ..Default::default()
        };
        let (a, _) = next_arousal(Arousal::Drowsy, &outcome, 1);
        assert_eq!(a, Arousal::Alert);
    }

    #[test]
    fn info_delta_settles_at_drowsy() {
        let (a, _) = next_arousal(Arousal::Alert, &outcome_with(Severity::Info), 0);
        assert_eq!(a, Arousal::Drowsy);
    }

    #[test]
    fn quiet_ticks_decay_one_band_at_a_time() {
        let (a, q) = next_arousal(Arousal::Alert, &quiet_outcome(), 0);
        assert_eq!((a, q), (Arousal::Alert, 1));
        let (a, q) = next_arousal(a, &quiet_outcome(), q);
        assert_eq!((a, q), (Arousal::Drowsy, 0));
        let (a, q) = next_arousal(a, &quiet_outcome(), q);
        assert_eq!((a, q), (Arousal::Drowsy, 1));
        let (a, _) = next_arousal(a, &quiet_outcome(), q);
        assert_eq!(a, Arousal::DeepSleep);
    }

    #[test]
    fn deep_sleep_is_the_floor() {
        let (a, q) = next_arousal(Arousal::DeepSleep, &quiet_outcome(), 1);
        assert_eq!((a, q), (Arousal::DeepSleep, 0));
    }
}
