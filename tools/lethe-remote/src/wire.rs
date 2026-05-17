//! Wire format for the LETHE remote-DMS channel (issue #103).
//!
//! This module is the peer-side mirror of
//! `agent/src/routes/remote_dms.rs`. Any change here MUST be matched
//! on the device side — the wire is a contract, not implementation.
//!
//! Byte layout for `POST /v1/remote_dms/cmd`:
//!
//! ```text
//! nonce(16) || timestamp_be_i64(8) || verb(1) || sig(64) = 89 bytes
//! sig = Ed25519(peer_priv, nonce || timestamp_be_i64 || verb || device_pub)
//! ```
//!
//! Signed responses (`/pubkey`, `/heartbeat`, `/cmd` ACK) are
//! `{"body": <T>, "sig_b64": "..."}` where `sig_b64` is Ed25519 of
//! `serde_json::to_vec(&body)`. Verification re-serializes `body` from
//! the typed struct, so the field order in `AckBody` / `HeartbeatBody`
//! / `PubkeyBody` MUST match the agent struct order exactly.

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use thiserror::Error;

pub const NONCE_LEN: usize = 16;
pub const TIMESTAMP_LEN: usize = 8;
pub const VERB_LEN: usize = 1;
pub const SIG_LEN: usize = 64;
pub const PUBKEY_LEN: usize = 32;
pub const COMMAND_LEN: usize = NONCE_LEN + TIMESTAMP_LEN + VERB_LEN + SIG_LEN;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum Verb {
    StatusPing = 0x01,
    LockNow = 0x02,
    WipeNow = 0x03,
    DmsReset = 0x04,
    DmsPause24h = 0x05,
}

#[derive(Debug, Error)]
pub enum WireError {
    #[error("ed25519 signature verification failed")]
    BadSignature,
    #[error("base64 decode error: {0}")]
    Base64(#[from] base64::DecodeError),
    #[error("expected {expected} bytes, got {got}")]
    WrongLen { expected: usize, got: usize },
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("invalid ed25519 key: {0}")]
    BadKey(ed25519_dalek::SignatureError),
}

#[derive(Debug, Clone, Copy)]
pub struct Nonce(pub [u8; NONCE_LEN]);

impl Nonce {
    pub fn random() -> Result<Self, getrandom::Error> {
        let mut n = [0u8; NONCE_LEN];
        getrandom::getrandom(&mut n)?;
        Ok(Nonce(n))
    }
}

#[derive(Debug, Clone, Copy)]
pub struct DevicePub(pub [u8; PUBKEY_LEN]);

impl DevicePub {
    pub fn from_b64(s: &str) -> Result<Self, WireError> {
        let bytes = B64.decode(s)?;
        let got = bytes.len();
        let arr: [u8; PUBKEY_LEN] = bytes
            .try_into()
            .map_err(|_| WireError::WrongLen { expected: PUBKEY_LEN, got })?;
        Ok(DevicePub(arr))
    }

    pub fn verifying_key(&self) -> Result<VerifyingKey, WireError> {
        VerifyingKey::from_bytes(&self.0).map_err(WireError::BadKey)
    }
}

/// Builds the 89-byte command payload. The signed pre-image is
/// `nonce || ts_be || verb || device_pub` — device_pub is included so
/// a captured command for one paired device cannot be replayed against
/// another.
pub fn encode_command(
    nonce: Nonce,
    timestamp: i64,
    verb: Verb,
    peer_priv: &SigningKey,
    device_pub: &DevicePub,
) -> [u8; COMMAND_LEN] {
    let mut msg = [0u8; NONCE_LEN + TIMESTAMP_LEN + VERB_LEN + PUBKEY_LEN];
    msg[..NONCE_LEN].copy_from_slice(&nonce.0);
    msg[NONCE_LEN..NONCE_LEN + TIMESTAMP_LEN].copy_from_slice(&timestamp.to_be_bytes());
    msg[NONCE_LEN + TIMESTAMP_LEN] = verb as u8;
    msg[NONCE_LEN + TIMESTAMP_LEN + VERB_LEN..].copy_from_slice(&device_pub.0);

    let sig = peer_priv.sign(&msg);

    let mut cmd = [0u8; COMMAND_LEN];
    cmd[..NONCE_LEN].copy_from_slice(&nonce.0);
    cmd[NONCE_LEN..NONCE_LEN + TIMESTAMP_LEN].copy_from_slice(&timestamp.to_be_bytes());
    cmd[NONCE_LEN + TIMESTAMP_LEN] = verb as u8;
    cmd[NONCE_LEN + TIMESTAMP_LEN + VERB_LEN..].copy_from_slice(&sig.to_bytes());
    cmd
}

/// Mirror of `Signed<T>` from `remote_dms.rs`. The sig is over
/// `serde_json::to_vec(&body)` on the typed body.
#[derive(Debug, Deserialize, Serialize)]
pub struct Signed<T> {
    pub body: T,
    pub sig_b64: String,
}

impl<T: Serialize> Signed<T> {
    pub fn verify(&self, device_pub: &DevicePub) -> Result<(), WireError> {
        let json = serde_json::to_vec(&self.body)?;
        let sig_bytes = B64.decode(&self.sig_b64)?;
        let got = sig_bytes.len();
        let sig_arr: [u8; SIG_LEN] = sig_bytes
            .try_into()
            .map_err(|_| WireError::WrongLen { expected: SIG_LEN, got })?;
        let sig = Signature::from_bytes(&sig_arr);
        let vk = device_pub.verifying_key()?;
        vk.verify(&json, &sig).map_err(|_| WireError::BadSignature)
    }
}

// Field order MUST match `agent/src/routes/remote_dms.rs` exactly —
// signed JSON re-serialization relies on field order being identical
// on both sides.

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct AckBody {
    pub accepted: bool,
    pub verb: String,
    pub error: Option<String>,
    pub ts: u64,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct HeartbeatBody {
    pub last_checkin_unix: Option<u64>,
    pub battery_pct: Option<u32>,
    pub dms_enabled: bool,
    pub enabled_verbs: Vec<String>,
    pub ts: u64,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct PubkeyBody {
    pub device_pub_b64: String,
    pub enabled_verbs: Vec<String>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::SigningKey;

    fn gen_key() -> SigningKey {
        let mut bytes = [0u8; 32];
        getrandom::getrandom(&mut bytes).expect("rng");
        SigningKey::from_bytes(&bytes)
    }

    #[test]
    fn command_encodes_to_exactly_89_bytes() {
        let peer = gen_key();
        let device = gen_key();
        let device_pub = DevicePub(device.verifying_key().to_bytes());
        let nonce = Nonce([0x42; NONCE_LEN]);
        let cmd = encode_command(nonce, 1_700_000_000, Verb::StatusPing, &peer, &device_pub);
        assert_eq!(cmd.len(), 89);
        assert_eq!(&cmd[..NONCE_LEN], &[0x42; NONCE_LEN]);
        assert_eq!(cmd[NONCE_LEN + TIMESTAMP_LEN], Verb::StatusPing as u8);
    }

    #[test]
    fn command_verifies_against_agent_layout() {
        // Reconstruct the same signed pre-image the agent expects and
        // verify our sig against the peer's verifying key. This is the
        // mirror-test for the encoder/decoder contract.
        let peer = gen_key();
        let device = gen_key();
        let device_pub_arr = device.verifying_key().to_bytes();
        let device_pub = DevicePub(device_pub_arr);
        let nonce = Nonce([0x11; NONCE_LEN]);
        let ts: i64 = 1_700_000_001;
        let cmd = encode_command(nonce, ts, Verb::DmsReset, &peer, &device_pub);

        let mut expected_msg = Vec::with_capacity(NONCE_LEN + TIMESTAMP_LEN + VERB_LEN + PUBKEY_LEN);
        expected_msg.extend_from_slice(&nonce.0);
        expected_msg.extend_from_slice(&ts.to_be_bytes());
        expected_msg.push(Verb::DmsReset as u8);
        expected_msg.extend_from_slice(&device_pub_arr);

        let sig_bytes: [u8; SIG_LEN] = cmd[NONCE_LEN + TIMESTAMP_LEN + VERB_LEN..]
            .try_into()
            .unwrap();
        let sig = Signature::from_bytes(&sig_bytes);
        peer.verifying_key()
            .verify(&expected_msg, &sig)
            .expect("agent-layout sig verifies");
    }

    #[test]
    fn signed_response_round_trip_ok() {
        let device = gen_key();
        let device_pub = DevicePub(device.verifying_key().to_bytes());
        let body = AckBody {
            accepted: true,
            verb: "status_ping".into(),
            error: None,
            ts: 42,
        };
        let json = serde_json::to_vec(&body).unwrap();
        let sig = device.sign(&json);
        let signed = Signed {
            body,
            sig_b64: B64.encode(sig.to_bytes()),
        };
        signed.verify(&device_pub).expect("verifies");
    }

    #[test]
    fn signed_response_tampered_body_rejected() {
        let device = gen_key();
        let device_pub = DevicePub(device.verifying_key().to_bytes());
        let body = AckBody {
            accepted: true,
            verb: "status_ping".into(),
            error: None,
            ts: 42,
        };
        let json = serde_json::to_vec(&body).unwrap();
        let sig = device.sign(&json);
        let mut signed = Signed {
            body,
            sig_b64: B64.encode(sig.to_bytes()),
        };
        signed.body.accepted = false;
        assert!(matches!(
            signed.verify(&device_pub),
            Err(WireError::BadSignature)
        ));
    }

    #[test]
    fn signed_response_wrong_key_rejected() {
        let device = gen_key();
        let evil = gen_key();
        let evil_pub = DevicePub(evil.verifying_key().to_bytes());
        let body = PubkeyBody {
            device_pub_b64: "x".into(),
            enabled_verbs: vec!["status_ping".into()],
        };
        let json = serde_json::to_vec(&body).unwrap();
        let sig = device.sign(&json);
        let signed = Signed {
            body,
            sig_b64: B64.encode(sig.to_bytes()),
        };
        assert!(matches!(
            signed.verify(&evil_pub),
            Err(WireError::BadSignature)
        ));
    }
}
