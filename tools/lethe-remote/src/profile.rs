//! Editor-side profile — peer keypair + paired device (onion + pubkey).
//!
//! Single-device profile in v0.1. Multi-device is a straight Vec
//! extension; we ship one slot first to keep the surface honest with
//! what phase 1 actually supports.

use std::fs;
use std::path::{Path, PathBuf};

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use directories::ProjectDirs;
use ed25519_dalek::SigningKey;
use serde::{Deserialize, Serialize};
use thiserror::Error;

const PUBKEY_LEN: usize = 32;
const ONION_V3_TOTAL_LEN: usize = 62; // 56 chars + ".onion"
const ONION_V3_LABEL_LEN: usize = 56;

#[derive(Debug, Error)]
pub enum ProfileError {
    #[error("profile not found at {0}")]
    NotFound(PathBuf),
    #[error("io error on {path}: {source}")]
    Io {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("profile field '{0}' has wrong length")]
    BadKeyLen(&'static str),
    #[error("base64 decode error in '{field}': {source}")]
    Base64 {
        field: &'static str,
        #[source]
        source: base64::DecodeError,
    },
    #[error("cannot determine default config directory")]
    NoConfigDir,
    #[error("invalid onion address '{0}' (expected 56 lowercase base32 chars + .onion)")]
    BadOnion(String),
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct Profile {
    pub peer_priv_b64: String,
    pub peer_pub_b64: String,
    pub device_onion: String,
    pub device_pub_b64: String,
}

impl Profile {
    pub fn load(path: &Path) -> Result<Self, ProfileError> {
        if !path.exists() {
            return Err(ProfileError::NotFound(path.to_path_buf()));
        }
        let raw = fs::read_to_string(path).map_err(|e| ProfileError::Io {
            path: path.to_path_buf(),
            source: e,
        })?;
        let p: Profile = serde_json::from_str(&raw)?;
        p.validate()?;
        Ok(p)
    }

    pub fn save(&self, path: &Path) -> Result<(), ProfileError> {
        self.validate()?;
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| ProfileError::Io {
                path: parent.to_path_buf(),
                source: e,
            })?;
        }
        let json = serde_json::to_string_pretty(self)?;
        fs::write(path, json).map_err(|e| ProfileError::Io {
            path: path.to_path_buf(),
            source: e,
        })?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = fs::metadata(path)
                .map_err(|e| ProfileError::Io {
                    path: path.to_path_buf(),
                    source: e,
                })?
                .permissions();
            perms.set_mode(0o600);
            fs::set_permissions(path, perms).map_err(|e| ProfileError::Io {
                path: path.to_path_buf(),
                source: e,
            })?;
        }
        Ok(())
    }

    pub fn signing_key(&self) -> Result<SigningKey, ProfileError> {
        let bytes = B64
            .decode(&self.peer_priv_b64)
            .map_err(|source| ProfileError::Base64 {
                field: "peer_priv_b64",
                source,
            })?;
        let arr: [u8; PUBKEY_LEN] = bytes
            .try_into()
            .map_err(|_| ProfileError::BadKeyLen("peer_priv_b64"))?;
        Ok(SigningKey::from_bytes(&arr))
    }

    fn validate(&self) -> Result<(), ProfileError> {
        if !is_plausible_onion_v3(&self.device_onion) {
            return Err(ProfileError::BadOnion(self.device_onion.clone()));
        }
        check_b64_key(&self.peer_priv_b64, "peer_priv_b64")?;
        check_b64_key(&self.peer_pub_b64, "peer_pub_b64")?;
        check_b64_key(&self.device_pub_b64, "device_pub_b64")?;
        Ok(())
    }
}

fn check_b64_key(s: &str, field: &'static str) -> Result<(), ProfileError> {
    let bytes = B64
        .decode(s)
        .map_err(|source| ProfileError::Base64 { field, source })?;
    if bytes.len() != PUBKEY_LEN {
        return Err(ProfileError::BadKeyLen(field));
    }
    Ok(())
}

/// v3 onion shape only. We don't verify the embedded checksum here —
/// the SOCKS layer will reject a malformed address at connect time,
/// and we want a plain "looks like the right kind of string" gate so
/// users get fast feedback for typos.
fn is_plausible_onion_v3(s: &str) -> bool {
    let s = s.trim();
    if s.len() != ONION_V3_TOTAL_LEN || !s.ends_with(".onion") {
        return false;
    }
    s[..ONION_V3_LABEL_LEN]
        .chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
}

pub fn default_profile_path() -> Result<PathBuf, ProfileError> {
    let pd = ProjectDirs::from("org", "osmosis", "lethe-remote")
        .ok_or(ProfileError::NoConfigDir)?;
    Ok(pd.config_dir().join("peer.json"))
}

/// Returns `(peer_priv_b64, peer_pub_b64)` from a fresh Ed25519 key.
pub fn generate_keypair() -> Result<(String, String), getrandom::Error> {
    let mut bytes = [0u8; PUBKEY_LEN];
    getrandom::getrandom(&mut bytes)?;
    let sk = SigningKey::from_bytes(&bytes);
    let pk = sk.verifying_key();
    Ok((B64.encode(sk.to_bytes()), B64.encode(pk.to_bytes())))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plausible_onion_accepts_v3() {
        // 56 lowercase b32 chars
        let s = format!("{}{}", "a".repeat(56), ".onion");
        assert!(is_plausible_onion_v3(&s));
    }

    #[test]
    fn plausible_onion_rejects_v2_length() {
        // v2 was 16 chars; obsolete and not supported.
        let s = format!("{}{}", "a".repeat(16), ".onion");
        assert!(!is_plausible_onion_v3(&s));
    }

    #[test]
    fn plausible_onion_rejects_uppercase() {
        let s = format!("{}{}", "A".repeat(56), ".onion");
        assert!(!is_plausible_onion_v3(&s));
    }

    #[test]
    fn keygen_yields_32_byte_keys() {
        let (priv_b64, pub_b64) = generate_keypair().unwrap();
        assert_eq!(B64.decode(&priv_b64).unwrap().len(), 32);
        assert_eq!(B64.decode(&pub_b64).unwrap().len(), 32);
    }

    #[test]
    fn load_save_round_trip() {
        let tmp = std::env::temp_dir().join(format!(
            "lethe-remote-profile-{}.json",
            std::process::id()
        ));
        let (priv_b64, pub_b64) = generate_keypair().unwrap();
        let (_dev_priv, dev_pub) = generate_keypair().unwrap();
        let onion = format!("{}{}", "a".repeat(56), ".onion");
        let p = Profile {
            peer_priv_b64: priv_b64,
            peer_pub_b64: pub_b64,
            device_onion: onion,
            device_pub_b64: dev_pub,
        };
        p.save(&tmp).unwrap();
        let loaded = Profile::load(&tmp).unwrap();
        assert_eq!(loaded.peer_pub_b64, p.peer_pub_b64);
        let _ = fs::remove_file(&tmp);
    }
}
