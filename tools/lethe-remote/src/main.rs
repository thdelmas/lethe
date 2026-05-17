//! lethe-remote — editor-side CLI for the LETHE remote-DMS channel.
//!
//! Tracks #103, phase 4 of the ship plan. Talks to the on-device
//! responder shipped in #173 (agent endpoints) + #174 (Tor hidden
//! service + split-bind). See
//! `docs/security/journalist-audit/remote-dms-channel.md` for the
//! channel design.

mod client;
mod profile;
mod wire;

use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{anyhow, Context, Result};
use clap::{Parser, Subcommand};

use crate::client::RemoteClient;
use crate::profile::{default_profile_path, generate_keypair, Profile};
use crate::wire::{encode_command, DevicePub, Nonce, Verb};

#[derive(Parser, Debug)]
#[command(
    name = "lethe-remote",
    version,
    about = "Editor-side CLI for the LETHE remote-DMS channel (#103)"
)]
struct Cli {
    /// Path to the peer profile JSON. Defaults to the OS config dir.
    #[arg(long, global = true)]
    profile: Option<PathBuf>,

    /// Override the Tor SOCKS proxy. Default: socks5h://127.0.0.1:9050
    #[arg(long, global = true)]
    socks: Option<String>,

    #[command(subcommand)]
    cmd: Cmd,
}

#[derive(Subcommand, Debug)]
enum Cmd {
    /// Generate a fresh Ed25519 keypair for this editor (peer side).
    Keygen,
    /// Import a pair payload (peer_priv + peer_pub + device_onion + device_pub) into the profile.
    PairImport {
        /// Path to a pair JSON with the same fields as a profile.
        path: PathBuf,
    },
    /// Print the loaded profile location and pubkeys (no secrets).
    Whoami,
    /// GET /v1/remote_dms/pubkey — fetch + verify the device pubkey.
    Pubkey,
    /// GET /v1/remote_dms/heartbeat — fetch + verify device state.
    Heartbeat,
    /// Send STATUS_PING.
    Ping,
    /// Send DMS_RESET — record a fresh dead-man check-in.
    DmsReset,
    /// Send DMS_PAUSE_24H — extend the dead-man window 24h.
    DmsPause24h,
    /// Send LOCK_NOW — phase-1 devices reject this with verb_not_enabled.
    Lock,
    /// Send WIPE_NOW — phase-1 devices reject this with verb_not_enabled.
    Wipe {
        /// Safety phrase set at pair time (second factor; enforced device-side in phase 2).
        #[arg(long)]
        confirm: String,
    },
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();
    let profile_path = match cli.profile.clone() {
        Some(p) => p,
        None => default_profile_path().context("computing default profile path")?,
    };

    match cli.cmd {
        Cmd::Keygen => run_keygen(),
        Cmd::PairImport { path } => run_pair_import(&path, &profile_path),
        Cmd::Whoami => run_whoami(&profile_path),
        other => run_remote(other, &profile_path, cli.socks.as_deref()).await,
    }
}

fn run_keygen() -> Result<()> {
    let (priv_b64, pub_b64) = generate_keypair().map_err(|e| anyhow!("rng failed: {e}"))?;
    println!("peer_priv_b64: {priv_b64}");
    println!("peer_pub_b64:  {pub_b64}");
    Ok(())
}

fn run_pair_import(src: &Path, dst: &Path) -> Result<()> {
    let p = Profile::load(src).context("reading pair payload")?;
    p.save(dst).context("writing profile")?;
    println!("wrote profile to {}", dst.display());
    Ok(())
}

fn run_whoami(path: &Path) -> Result<()> {
    let p = Profile::load(path).context("loading profile")?;
    println!("profile:      {}", path.display());
    println!("peer_pub:     {}", p.peer_pub_b64);
    println!("device_pub:   {}", p.device_pub_b64);
    println!("device_onion: {}", p.device_onion);
    Ok(())
}

async fn run_remote(cmd: Cmd, profile_path: &Path, socks: Option<&str>) -> Result<()> {
    let profile = Profile::load(profile_path).context("loading profile")?;
    let device_pub =
        DevicePub::from_b64(&profile.device_pub_b64).context("decoding device_pub_b64")?;
    let client = RemoteClient::new(&profile.device_onion, device_pub, socks)
        .context("building Tor SOCKS5h client")?;

    match cmd {
        Cmd::Pubkey => {
            let body = client.pubkey().await.context("/pubkey request")?;
            println!("device_pub_b64: {}", body.device_pub_b64);
            println!("enabled_verbs:  {}", body.enabled_verbs.join(", "));
            if body.device_pub_b64 != profile.device_pub_b64 {
                return Err(anyhow!(
                    "device pubkey mismatch — onion may be impersonated, or profile is stale"
                ));
            }
            Ok(())
        }
        Cmd::Heartbeat => {
            let body = client.heartbeat().await.context("/heartbeat request")?;
            let last = body
                .last_checkin_unix
                .map_or_else(|| "none".to_string(), |t| t.to_string());
            let battery = body
                .battery_pct
                .map_or_else(|| "unknown".to_string(), |b| b.to_string());
            println!("last_checkin_unix: {last}");
            println!("battery_pct:       {battery}");
            println!("dms_enabled:       {}", body.dms_enabled);
            println!("enabled_verbs:     {}", body.enabled_verbs.join(", "));
            println!("ts:                {}", body.ts);
            Ok(())
        }
        Cmd::Ping => send(&client, &profile, Verb::StatusPing).await,
        Cmd::DmsReset => send(&client, &profile, Verb::DmsReset).await,
        Cmd::DmsPause24h => send(&client, &profile, Verb::DmsPause24h).await,
        Cmd::Lock => {
            eprintln!("note: phase-1 devices reject LOCK_NOW with verb_not_enabled (needs phase 2).");
            send(&client, &profile, Verb::LockNow).await
        }
        Cmd::Wipe { confirm: _ } => {
            eprintln!("note: phase-1 devices reject WIPE_NOW with verb_not_enabled (needs phase 2).");
            // Safety phrase is enforced device-side once phase 2 lands;
            // the CLI accepts it now so the surface is locked at v0.1.
            send(&client, &profile, Verb::WipeNow).await
        }
        Cmd::Keygen | Cmd::PairImport { .. } | Cmd::Whoami => unreachable!(),
    }
}

async fn send(client: &RemoteClient, profile: &Profile, verb: Verb) -> Result<()> {
    let nonce = Nonce::random().map_err(|e| anyhow!("nonce rng: {e}"))?;
    let ts = unix_now()?;
    let priv_key = profile.signing_key().context("decoding peer_priv_b64")?;
    let device_pub = DevicePub::from_b64(&profile.device_pub_b64)?;
    let cmd = encode_command(nonce, ts, verb, &priv_key, &device_pub);

    let ack = client.send_command(cmd).await.context("/cmd request")?;
    println!("verb:     {}", ack.verb);
    println!("accepted: {}", ack.accepted);
    if let Some(e) = &ack.error {
        println!("error:    {e}");
    }
    println!("ts:       {}", ack.ts);
    if !ack.accepted {
        std::process::exit(2);
    }
    Ok(())
}

fn unix_now() -> Result<i64> {
    let d = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| anyhow!("system time before unix epoch: {e}"))?;
    Ok(d.as_secs() as i64)
}
