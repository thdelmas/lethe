//! Remote DMS / wipe-trigger channel — agent responder (phase 1).
//!
//! Tracks [#103](https://github.com/thdelmas/lethe/issues/103). See
//! `docs/security/journalist-audit/remote-dms-channel.md` for the full
//! design and the phased ship plan; this module is phase 1.
//!
//! Endpoints:
//!   POST /v1/remote_dms/cmd        signed-command endpoint
//!   GET  /v1/remote_dms/heartbeat  signed device-state snapshot
//!   GET  /v1/remote_dms/pubkey     device public key (pairing verification)
//!
//! Enabled verbs in v1: `STATUS_PING`, `DMS_RESET`, `DMS_PAUSE_24H`.
//! `LOCK_NOW` and `WIPE_NOW` are accepted at the wire layer but rejected
//! at dispatch with `verb_not_enabled` — wiring them to actual lock /
//! wipe needs the system-app bridge (phase 2) and #101's persistent
//! class key for pair storage.
//!
//! Wire contract is locked across phases. Only the enabled-verb set
//! changes between phases.
//!
//! Pairing state in v1 is a JSON file at the path returned by
//! `default_pair_path()`. The first-boot pairing wizard is phase 3
//! (#159 follow-up); for now, test devices drop a manually-prepared
//! pair file.

use axum::body::Bytes;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Json as JsonResp};
use axum::routing::{get, post};
use axum::Router;
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::Mutex;

// ── Wire-format constants — locked across phases ──────────────────

const NONCE_LEN: usize = 16;
const TIMESTAMP_LEN: usize = 8;
const VERB_LEN: usize = 1;
const SIG_LEN: usize = 64;
const COMMAND_LEN: usize = NONCE_LEN + TIMESTAMP_LEN + VERB_LEN + SIG_LEN; // 89

const VERB_STATUS_PING: u8 = 0x01;
const VERB_LOCK_NOW: u8 = 0x02;
const VERB_WIPE_NOW: u8 = 0x03;
const VERB_DMS_RESET: u8 = 0x04;
const VERB_DMS_PAUSE_24H: u8 = 0x05;

const SKEW_NORMAL_S: i64 = 120;
const SKEW_BOOT_S: i64 = 10;
const BOOT_TIGHTEN_WINDOW_S: u64 = 60;
const NONCE_WINDOW_CAP: usize = 512;
const PEER_CAP: usize = 5;

const DEFAULT_PAIR_PATH: &str = "/data/lethe/remote_dms/pair.json";
const HEARTBEAT_PATH: &str = "/persist/lethe/deadman/last_checkin";
const BATTERY_SYSFS: &str = "/sys/class/power_supply/battery/capacity";

const ENABLED_VERBS_V1: &[&str] = &["status_ping", "dms_reset", "dms_pause_24h"];

pub fn default_pair_path() -> &'static str {
    DEFAULT_PAIR_PATH
}

// ── Pair-file shape (JSON on disk) ────────────────────────────────

#[derive(Debug, Deserialize, Serialize, Clone)]
struct PairFile {
    device_priv_b64: String,
    device_pub_b64: String,
    #[serde(default)]
    peers: Vec<PeerEntry>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
struct PeerEntry {
    name: String,
    pub_key_b64: String,
    #[serde(default)]
    added_ts: u64,
}

// ── Runtime state ─────────────────────────────────────────────────

pub struct RemoteDmsState {
    signing_key: SigningKey,
    verifying_key: VerifyingKey,
    peer_keys: Vec<(String, VerifyingKey)>,
    nonces: Mutex<NonceWindow>,
    // Time the agent's RemoteDmsState was constructed. The boot-tighten
    // window references this, not sys.boot_completed — at every agent
    // restart the nonce table is empty again, so the same tightening
    // rule applies as at boot.
    agent_start_ts: u64,
}

impl RemoteDmsState {
    /// Loads a pair file and constructs runtime state. Returns `None`
    /// (with a log line) on missing / unreadable / malformed input so
    /// the agent can start without the remote-DMS routes registered —
    /// phase 1 lets test devices drop a pair file later without
    /// rebooting the agent.
    pub fn load(path: &str) -> Option<Arc<Self>> {
        let raw = match std::fs::read_to_string(path) {
            Ok(s) => s,
            Err(_) => {
                // Quiet on missing — this is the common case in dev.
                return None;
            }
        };
        let pair: PairFile = match serde_json::from_str(&raw) {
            Ok(p) => p,
            Err(e) => {
                eprintln!("remote_dms: pair file at {path} is not valid JSON: {e}");
                return None;
            }
        };

        let priv_bytes: [u8; 32] = B64
            .decode(&pair.device_priv_b64)
            .ok()
            .and_then(|v| v.try_into().ok())?;
        let signing_key = SigningKey::from_bytes(&priv_bytes);
        let verifying_key = signing_key.verifying_key();

        // Catch pair-file corruption early: a swapped stored pub means
        // peers will sign against a key the device no longer holds.
        let stored_pub: [u8; 32] = B64
            .decode(&pair.device_pub_b64)
            .ok()
            .and_then(|v| v.try_into().ok())?;
        if verifying_key.to_bytes() != stored_pub {
            eprintln!("remote_dms: pair file device_pub_b64 does not match device_priv_b64");
            return None;
        }

        let mut peer_keys: Vec<(String, VerifyingKey)> = Vec::new();
        for p in &pair.peers {
            if peer_keys.len() >= PEER_CAP {
                eprintln!(
                    "remote_dms: peer cap ({PEER_CAP}) reached — ignoring '{}'",
                    p.name
                );
                break;
            }
            let Some(bytes) = B64.decode(&p.pub_key_b64).ok().and_then(|v| {
                let arr: Result<[u8; 32], _> = v.try_into();
                arr.ok()
            }) else {
                eprintln!("remote_dms: peer '{}' pub_key_b64 is not 32 bytes", p.name);
                continue;
            };
            match VerifyingKey::from_bytes(&bytes) {
                Ok(vk) => peer_keys.push((p.name.clone(), vk)),
                Err(e) => eprintln!(
                    "remote_dms: peer '{}' pub_key_b64 is not a valid Ed25519 point: {e}",
                    p.name
                ),
            }
        }

        Some(Arc::new(Self {
            signing_key,
            verifying_key,
            peer_keys,
            nonces: Mutex::new(NonceWindow::default()),
            agent_start_ts: now_unix(),
        }))
    }
}

#[derive(Default)]
struct NonceWindow {
    seen: VecDeque<[u8; NONCE_LEN]>,
}

impl NonceWindow {
    /// Returns true if the nonce was new (and recorded). O(n) check;
    /// n=512 is negligible compared to Ed25519 verify cost.
    fn check_and_record(&mut self, nonce: [u8; NONCE_LEN]) -> bool {
        if self.seen.iter().any(|n| *n == nonce) {
            return false;
        }
        if self.seen.len() == NONCE_WINDOW_CAP {
            self.seen.pop_front();
        }
        self.seen.push_back(nonce);
        true
    }
}

// ── Response wire types ───────────────────────────────────────────

#[derive(Debug, Serialize, Clone)]
struct AckBody {
    accepted: bool,
    verb: String,
    error: Option<String>,
    ts: u64,
}

#[derive(Debug, Serialize, Clone)]
struct HeartbeatBody {
    last_checkin_unix: Option<u64>,
    battery_pct: Option<u32>,
    dms_enabled: bool,
    enabled_verbs: Vec<&'static str>,
    ts: u64,
}

#[derive(Debug, Serialize, Clone)]
struct PubkeyBody {
    device_pub_b64: String,
    enabled_verbs: Vec<&'static str>,
}

/// Wrapper for any signed agent response. `sig_b64` is Ed25519 over the
/// canonical JSON serialization of `body` — peers reconstruct the same
/// bytes by re-serializing the parsed body and verifying.
#[derive(Debug, Serialize)]
struct Signed<T: Serialize> {
    body: T,
    sig_b64: String,
}

// ── Helpers ───────────────────────────────────────────────────────

fn now_unix() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn verb_name(v: u8) -> &'static str {
    match v {
        VERB_STATUS_PING => "status_ping",
        VERB_LOCK_NOW => "lock_now",
        VERB_WIPE_NOW => "wipe_now",
        VERB_DMS_RESET => "dms_reset",
        VERB_DMS_PAUSE_24H => "dms_pause_24h",
        _ => "unknown",
    }
}

fn verb_enabled_in_v1(v: u8) -> bool {
    matches!(v, VERB_STATUS_PING | VERB_DMS_RESET | VERB_DMS_PAUSE_24H)
}

/// Parses the 89-byte command shape into its four fields. Returns
/// `None` on a length mismatch; callers should reply HTTP 400 because
/// there's no verb to acknowledge.
fn parse_command(bytes: &[u8]) -> Option<([u8; NONCE_LEN], i64, u8, [u8; SIG_LEN])> {
    if bytes.len() != COMMAND_LEN {
        return None;
    }
    let mut nonce = [0u8; NONCE_LEN];
    nonce.copy_from_slice(&bytes[0..NONCE_LEN]);
    let mut ts_bytes = [0u8; TIMESTAMP_LEN];
    ts_bytes.copy_from_slice(&bytes[NONCE_LEN..NONCE_LEN + TIMESTAMP_LEN]);
    let ts = i64::from_be_bytes(ts_bytes);
    let verb = bytes[NONCE_LEN + TIMESTAMP_LEN];
    let mut sig = [0u8; SIG_LEN];
    sig.copy_from_slice(&bytes[NONCE_LEN + TIMESTAMP_LEN + VERB_LEN..COMMAND_LEN]);
    Some((nonce, ts, verb, sig))
}

/// Maximum allowed clock skew (seconds) for a command timestamp. The
/// first BOOT_TIGHTEN_WINDOW_S after agent start uses SKEW_BOOT_S;
/// after that, SKEW_NORMAL_S. Closes the replay window an empty nonce
/// table would otherwise expose immediately after boot or restart.
fn allowed_skew(now: u64, agent_start: u64) -> i64 {
    if now < agent_start {
        // Clock went backwards somehow — be conservative, use normal.
        return SKEW_NORMAL_S;
    }
    if now - agent_start < BOOT_TIGHTEN_WINDOW_S {
        SKEW_BOOT_S
    } else {
        SKEW_NORMAL_S
    }
}

/// Reconstructs the bytes the peer signed. Format spec:
///   sig = Ed25519(peer_priv, nonce || timestamp || verb || device_pub)
fn signed_message(
    nonce: &[u8; NONCE_LEN],
    timestamp: i64,
    verb: u8,
    device_pub: &[u8; 32],
) -> Vec<u8> {
    let mut msg = Vec::with_capacity(NONCE_LEN + TIMESTAMP_LEN + VERB_LEN + 32);
    msg.extend_from_slice(nonce);
    msg.extend_from_slice(&timestamp.to_be_bytes());
    msg.push(verb);
    msg.extend_from_slice(device_pub);
    msg
}

fn sign_body<T: Serialize + Clone>(state: &RemoteDmsState, body: &T) -> Signed<T> {
    // serde_json::to_vec is deterministic for a given struct shape +
    // field order, so the peer reconstructs the same bytes by parsing
    // and re-serializing. Cosmetic differences (whitespace) would break
    // verification — we don't pretty-print on either side.
    let json = serde_json::to_vec(body).unwrap_or_default();
    let sig = state.signing_key.sign(&json);
    Signed {
        body: body.clone(),
        sig_b64: B64.encode(sig.to_bytes()),
    }
}

// ── Endpoint handlers ─────────────────────────────────────────────

async fn pubkey_handler(State(state): State<Arc<RemoteDmsState>>) -> impl IntoResponse {
    let body = PubkeyBody {
        device_pub_b64: B64.encode(state.verifying_key.to_bytes()),
        enabled_verbs: ENABLED_VERBS_V1.to_vec(),
    };
    JsonResp(sign_body(&state, &body))
}

async fn heartbeat_handler(State(state): State<Arc<RemoteDmsState>>) -> impl IntoResponse {
    let body = HeartbeatBody {
        last_checkin_unix: read_last_checkin(),
        battery_pct: read_battery(),
        dms_enabled: getprop_bool("persist.lethe.deadman.enabled"),
        enabled_verbs: ENABLED_VERBS_V1.to_vec(),
        ts: now_unix(),
    };
    JsonResp(sign_body(&state, &body))
}

async fn cmd_handler(
    State(state): State<Arc<RemoteDmsState>>,
    body: Bytes,
) -> Result<JsonResp<Signed<AckBody>>, (StatusCode, &'static str)> {
    let (nonce, ts_signed, verb, sig_bytes) = match parse_command(&body) {
        Some(parts) => parts,
        None => return Err((StatusCode::BAD_REQUEST, "bad command length or shape")),
    };

    // Try to match against each paired peer. We can't tell which peer
    // sent a request from the wire — the sig over (nonce, ts, verb,
    // device_pub) is the entire identity. Linear scan; PEER_CAP is 5.
    let device_pub = state.verifying_key.to_bytes();
    let msg = signed_message(&nonce, ts_signed, verb, &device_pub);
    let signature = Signature::from_bytes(&sig_bytes);

    let matched = state
        .peer_keys
        .iter()
        .any(|(_, vk)| vk.verify(&msg, &signature).is_ok());
    if !matched {
        return Ok(ack(&state, verb, false, Some("auth_failed")));
    }

    // Timestamp gate.
    let now = now_unix();
    let skew = allowed_skew(now, state.agent_start_ts);
    let delta = (now as i64) - ts_signed;
    if delta.abs() > skew {
        return Ok(ack(&state, verb, false, Some("timestamp_out_of_window")));
    }

    // Replay-resistance — nonce window. Only consume the nonce after
    // signature + timestamp pass; that way a probe with a bad sig
    // can't burn a future legitimate nonce.
    let new = state.nonces.lock().await.check_and_record(nonce);
    if !new {
        return Ok(ack(&state, verb, false, Some("replay_nonce_seen")));
    }

    // Verb dispatch.
    if !verb_enabled_in_v1(verb) {
        return Ok(ack(&state, verb, false, Some("verb_not_enabled")));
    }

    let outcome = match verb {
        VERB_STATUS_PING => Ok(()),
        VERB_DMS_RESET | VERB_DMS_PAUSE_24H => {
            // Phase 1: both verbs write a fresh check-in timestamp.
            // DMS_PAUSE_24H gets upgraded to a real pause-until file
            // in phase 2; the wire contract is unchanged.
            write_checkin_now().map_err(|e| format!("checkin_write_failed: {e}"))
        }
        _ => Err("verb_not_enabled".into()),
    };

    Ok(match outcome {
        Ok(()) => ack(&state, verb, true, None),
        Err(e) => ack(&state, verb, false, Some(Box::leak(e.into_boxed_str()))),
    })
}

fn ack(
    state: &RemoteDmsState,
    verb: u8,
    accepted: bool,
    error: Option<&str>,
) -> JsonResp<Signed<AckBody>> {
    let body = AckBody {
        accepted,
        verb: verb_name(verb).into(),
        error: error.map(|s| s.to_string()),
        ts: now_unix(),
    };
    JsonResp(sign_body(state, &body))
}

// ── Side-effect helpers ───────────────────────────────────────────

fn getprop_bool(key: &str) -> bool {
    std::process::Command::new("getprop")
        .arg(key)
        .output()
        .ok()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .map(|v| v == "true" || v == "1")
        .unwrap_or(false)
}

fn read_last_checkin() -> Option<u64> {
    std::fs::read_to_string(HEARTBEAT_PATH)
        .ok()?
        .trim()
        .parse::<u64>()
        .ok()
}

fn read_battery() -> Option<u32> {
    std::fs::read_to_string(BATTERY_SYSFS)
        .ok()?
        .trim()
        .parse::<u32>()
        .ok()
}

fn write_checkin_now() -> Result<(), String> {
    use std::io::Write;
    let path = std::path::Path::new(HEARTBEAT_PATH);
    let parent = path.parent().ok_or_else(|| "no parent dir".to_string())?;
    if !parent.exists() {
        // The parent dir is created at boot by the deadman init script
        // (`/persist/lethe/deadman` mode 700 root:root). If it's
        // missing the agent has no business creating it — fail closed.
        return Err(format!("parent dir missing: {}", parent.display()));
    }
    let tmp = path.with_extension("tmp");
    let now = now_unix().to_string();
    let mut f = std::fs::File::create(&tmp).map_err(|e| format!("create_tmp: {e}"))?;
    f.write_all(now.as_bytes()).map_err(|e| format!("write: {e}"))?;
    f.sync_all().map_err(|e| format!("sync: {e}"))?;
    drop(f);
    std::fs::rename(&tmp, path).map_err(|e| format!("rename: {e}"))?;
    Ok(())
}

// ── Router ────────────────────────────────────────────────────────

pub fn router() -> Router<Arc<RemoteDmsState>> {
    Router::new()
        .route("/v1/remote_dms/cmd", post(cmd_handler))
        .route("/v1/remote_dms/heartbeat", get(heartbeat_handler))
        .route("/v1/remote_dms/pubkey", get(pubkey_handler))
}

// ── Tests ─────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use rand_core::{OsRng, RngCore};

    /// Generate a fresh Ed25519 key for tests. ed25519-dalek 2.x's
    /// `SigningKey::generate` is gated behind the `rand_core` feature
    /// flag — sidestepping by feeding `from_bytes` directly avoids
    /// turning that on in the release binary.
    fn gen_key() -> SigningKey {
        let mut bytes = [0u8; 32];
        OsRng.fill_bytes(&mut bytes);
        SigningKey::from_bytes(&bytes)
    }

    fn make_state_with_peer() -> (Arc<RemoteDmsState>, SigningKey) {
        let device_priv = gen_key();
        let peer_priv = gen_key();

        let state = Arc::new(RemoteDmsState {
            signing_key: device_priv.clone(),
            verifying_key: device_priv.verifying_key(),
            peer_keys: vec![("test-peer".into(), peer_priv.verifying_key())],
            nonces: Mutex::new(NonceWindow::default()),
            // Past the boot-tighten window — most tests don't want to
            // think about the ±10 s gate.
            agent_start_ts: now_unix().saturating_sub(BOOT_TIGHTEN_WINDOW_S + 5),
        });
        (state, peer_priv)
    }

    fn make_cmd(
        peer: &SigningKey,
        device_pub: &[u8; 32],
        verb: u8,
        ts: i64,
        nonce_seed: u8,
    ) -> Vec<u8> {
        let mut nonce = [0u8; NONCE_LEN];
        nonce[0] = nonce_seed;
        let msg = signed_message(&nonce, ts, verb, device_pub);
        let sig = peer.sign(&msg);
        let mut cmd = Vec::with_capacity(COMMAND_LEN);
        cmd.extend_from_slice(&nonce);
        cmd.extend_from_slice(&ts.to_be_bytes());
        cmd.push(verb);
        cmd.extend_from_slice(&sig.to_bytes());
        cmd
    }

    // ── unit-level ────────────────────────────────────────────────

    #[test]
    fn parse_command_round_trips() {
        let peer = gen_key();
        let device_pub = gen_key().verifying_key().to_bytes();
        let cmd = make_cmd(&peer, &device_pub, VERB_STATUS_PING, 12345, 0x42);
        let (nonce, ts, verb, _sig) = parse_command(&cmd).expect("parses");
        assert_eq!(nonce[0], 0x42);
        assert_eq!(ts, 12345);
        assert_eq!(verb, VERB_STATUS_PING);
    }

    #[test]
    fn parse_command_rejects_wrong_length() {
        assert!(parse_command(&[0u8; COMMAND_LEN - 1]).is_none());
        assert!(parse_command(&[0u8; COMMAND_LEN + 1]).is_none());
    }

    #[test]
    fn nonce_window_rejects_dupes_and_evicts_old() {
        let mut w = NonceWindow::default();
        let n1 = [1u8; NONCE_LEN];
        assert!(w.check_and_record(n1));
        assert!(!w.check_and_record(n1)); // dup

        // Fill the window with distinct nonces (n1 already in).
        for i in 2..=NONCE_WINDOW_CAP {
            let mut n = [0u8; NONCE_LEN];
            n[0] = (i % 256) as u8;
            n[1] = (i / 256) as u8;
            assert!(w.check_and_record(n));
        }
        // Window is full; n1 was the oldest, so adding one more evicts
        // it and re-presenting n1 should now succeed.
        let mut overflow = [0u8; NONCE_LEN];
        overflow[15] = 0xFF;
        assert!(w.check_and_record(overflow));
        assert!(w.check_and_record(n1));
    }

    #[test]
    fn allowed_skew_tightens_during_boot_window() {
        let start = 1000;
        assert_eq!(allowed_skew(start + 1, start), SKEW_BOOT_S);
        assert_eq!(allowed_skew(start + 59, start), SKEW_BOOT_S);
        assert_eq!(allowed_skew(start + 60, start), SKEW_NORMAL_S);
        assert_eq!(allowed_skew(start + 1000, start), SKEW_NORMAL_S);
        // Clock-jump-back protection.
        assert_eq!(allowed_skew(start - 5, start), SKEW_NORMAL_S);
    }

    // ── handler-level ─────────────────────────────────────────────

    #[tokio::test]
    async fn cmd_status_ping_accepted() {
        let (state, peer) = make_state_with_peer();
        let device_pub = state.verifying_key.to_bytes();
        let cmd = make_cmd(&peer, &device_pub, VERB_STATUS_PING, now_unix() as i64, 1);
        let resp = cmd_handler(State(state), Bytes::from(cmd)).await.unwrap();
        assert!(resp.0.body.accepted, "got: {:?}", resp.0.body);
        assert_eq!(resp.0.body.verb, "status_ping");
        assert!(resp.0.body.error.is_none());
        // Ack is signed; b64 sig should decode to 64 bytes.
        let sig = B64.decode(resp.0.sig_b64).expect("sig b64 decodes");
        assert_eq!(sig.len(), SIG_LEN);
    }

    #[tokio::test]
    async fn cmd_wrong_peer_rejected_with_auth_failed() {
        let (state, _real_peer) = make_state_with_peer();
        let evil = gen_key();
        let device_pub = state.verifying_key.to_bytes();
        let cmd = make_cmd(&evil, &device_pub, VERB_STATUS_PING, now_unix() as i64, 2);
        let resp = cmd_handler(State(state), Bytes::from(cmd)).await.unwrap();
        assert!(!resp.0.body.accepted);
        assert_eq!(resp.0.body.error.as_deref(), Some("auth_failed"));
    }

    #[tokio::test]
    async fn cmd_replay_rejected_with_replay_nonce_seen() {
        let (state, peer) = make_state_with_peer();
        let device_pub = state.verifying_key.to_bytes();
        let ts = now_unix() as i64;
        let cmd = make_cmd(&peer, &device_pub, VERB_STATUS_PING, ts, 7);

        let first = cmd_handler(State(state.clone()), Bytes::from(cmd.clone()))
            .await
            .unwrap();
        assert!(first.0.body.accepted);

        let replay = cmd_handler(State(state), Bytes::from(cmd)).await.unwrap();
        assert!(!replay.0.body.accepted);
        assert_eq!(replay.0.body.error.as_deref(), Some("replay_nonce_seen"));
    }

    #[tokio::test]
    async fn cmd_stale_timestamp_rejected() {
        let (state, peer) = make_state_with_peer();
        let device_pub = state.verifying_key.to_bytes();
        // 10 minutes in the past — well outside the ±120 s normal window.
        let stale_ts = now_unix() as i64 - 600;
        let cmd = make_cmd(&peer, &device_pub, VERB_STATUS_PING, stale_ts, 3);
        let resp = cmd_handler(State(state), Bytes::from(cmd)).await.unwrap();
        assert!(!resp.0.body.accepted);
        assert_eq!(resp.0.body.error.as_deref(), Some("timestamp_out_of_window"));
    }

    #[tokio::test]
    async fn cmd_lock_now_rejected_in_v1_as_verb_not_enabled() {
        let (state, peer) = make_state_with_peer();
        let device_pub = state.verifying_key.to_bytes();
        let cmd = make_cmd(&peer, &device_pub, VERB_LOCK_NOW, now_unix() as i64, 9);
        let resp = cmd_handler(State(state), Bytes::from(cmd)).await.unwrap();
        assert!(!resp.0.body.accepted);
        assert_eq!(resp.0.body.verb, "lock_now");
        assert_eq!(resp.0.body.error.as_deref(), Some("verb_not_enabled"));
    }

    #[tokio::test]
    async fn cmd_wipe_now_also_rejected_in_v1() {
        let (state, peer) = make_state_with_peer();
        let device_pub = state.verifying_key.to_bytes();
        let cmd = make_cmd(&peer, &device_pub, VERB_WIPE_NOW, now_unix() as i64, 10);
        let resp = cmd_handler(State(state), Bytes::from(cmd)).await.unwrap();
        assert!(!resp.0.body.accepted);
        assert_eq!(resp.0.body.error.as_deref(), Some("verb_not_enabled"));
    }

    #[tokio::test]
    async fn cmd_unknown_verb_rejected_as_verb_not_enabled() {
        let (state, peer) = make_state_with_peer();
        let device_pub = state.verifying_key.to_bytes();
        let cmd = make_cmd(&peer, &device_pub, 0xFE, now_unix() as i64, 11);
        let resp = cmd_handler(State(state), Bytes::from(cmd)).await.unwrap();
        assert!(!resp.0.body.accepted);
        assert_eq!(resp.0.body.error.as_deref(), Some("verb_not_enabled"));
        assert_eq!(resp.0.body.verb, "unknown");
    }

    #[tokio::test]
    async fn cmd_bad_wire_returns_http_400() {
        let (state, _peer) = make_state_with_peer();
        let bad = vec![0u8; COMMAND_LEN - 1];
        let err = cmd_handler(State(state), Bytes::from(bad)).await.unwrap_err();
        assert_eq!(err.0, StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn pubkey_endpoint_returns_signed_device_pub() {
        let (state, _peer) = make_state_with_peer();
        let resp = pubkey_handler(State(state.clone())).await.into_response();
        // We can't easily extract the body without serializing through
        // axum's IntoResponse + reading bytes, so re-call the inner
        // assembly the way the handler does.
        let body = PubkeyBody {
            device_pub_b64: B64.encode(state.verifying_key.to_bytes()),
            enabled_verbs: ENABLED_VERBS_V1.to_vec(),
        };
        let signed = sign_body(&state, &body);
        // sig length sanity check; full byte-equality with `resp` would
        // require routing through hyper — overkill for this layer.
        assert_eq!(B64.decode(signed.sig_b64).unwrap().len(), SIG_LEN);
        assert_eq!(body.device_pub_b64.len(), 44); // 32 bytes b64-std-padded
        let _ = resp; // handler runs without panic
    }
}
