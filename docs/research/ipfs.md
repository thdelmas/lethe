# IPFS — Research

How IPFS fits Lethe. No cleartext HTTP, no cloud accounts, no phone-home.

## Primitives

| Primitive | How Lethe uses it |
|-----------|-------------------|
| CID (content addressing) | OTA ZIP integrity — same hash = same file regardless of source |
| IPNS (mutable pointer) | `lethe-updates` channel — devices resolve to latest manifest CID |
| DHT client | Fetch OTA without exposing device as an IPFS node |
| PubSub | (Planned) security alerts, dead man's heartbeats |
| Pinning | OSmosis pins builds so devices can fetch them |
| CAR files | (Planned) sneakernet OTA distribution |
| Bitswap | (Planned) P2P OTA relay between nearby devices |

## Threat model

- **Client-only** (`dhtclient`), no gateway, no content serving — full node leaks metadata.
- **All swarm through Tor** — peers see a Tor exit, not the device's IP.
- **CIDs are deterministic** — never pin cleartext user data. Only public artifacts or encrypted blobs.
- **IPNS resolution leaks interest** — acceptable tradeoff, doesn't identify the device.

---

## Implemented: OTA via IPFS + IPNS

End-to-end. OSmosis builds → pins to IPFS → publishes signed manifest via IPNS.
Devices resolve every 6h (+ once at boot) and pull their build.

**Server:** `POST /api/lethe/ota/publish`, `GET /api/lethe/ota/manifest`, `GET /api/lethe/ota/status`
**Device:** `lethe-ota-update.sh` → IPNS resolve → Ed25519 verify → codename filter → `ipfs get` → SHA256 → apply by policy
**Files:** `lethe/scripts/lethe-ota-update.sh`, `lethe/initrc/init.lethe-ipfs.rc`, `lethe/overlays/ipfs-ota.conf`, `web/routes/lethe_ota.py`

---

## Planned

### High impact

**Encrypted backups** — AES-256-GCM (Argon2id key), pin to IPFS, user keeps CID + passphrase.
Random padding before encryption to prevent CID correlation. Tor-routed.

**Live blocklist updates** — Separate IPNS key `lethe-blocklists`, daily resolve, same Ed25519 verification. Hosts file + nftables rules. Rollback on failure.

**Dead man's heartbeat via PubSub** — Topic `lethe-heartbeat-<device-hash>`, encrypted payload, trusted contact subscribes. Fail-safe: missed beats trigger the switch.

### Medium impact

**P2P OTA relay** — Pin downloaded ZIP, announce CID to local network. Opt-in (exposes device as IPFS peer).

**Tor bridge distribution** — IPNS key `lethe-bridges`, encrypted per-region bridge lists, fallback when Tor is blocked.

**App repo** — IPNS key `lethe-apps`, signed manifest with per-app CID + APK signature hash. F-Droid without the server.

**Security broadcast** — PubSub topic `lethe-security`, signed CVE alerts, supplements 6h IPNS poll.

**Warrant canary** — OSmosis publishes a signed statement via IPNS: "we have NOT been served a secret court order." Lethe checks on the same 6h cycle alongside OTA. If the canary disappears or signature is invalid → alert user that OSmosis may be compromised.

---

## IPFS ecosystem — Web2 alternatives

| Project | Replaces | Ship? | Notes |
|---------|----------|-------|-------|
| **Quiet** | Slack/Discord | Yes | Tor+IPFS chat, same stack, reuse Lethe daemons. Not audited. |
| **PeerTube+IPFS** | YouTube | Client only | Fetch video by CID via Tor. No WebRTC IP leak. IPFS not upstream yet. |
| **Plebbit** | Reddit | Optional | Serverless, IPFS+GossipSub+ENS. ENS dependency. |
| **Hyprspace** | WireGuard | Evaluate | P2P VPN via libp2p. Archived upstream, maintained as fork. |
| **Peergos** | Google Drive | Evaluate | E2E encrypted file sharing on IPFS. Heavier than raw backup. |
| **OrbitDB** | Firebase | Watch | P2P database, Merkle-CRDTs. Heavy for a minimal OS. |
| **Handshake** | DNS | Watch | Tor already handles DNS privacy. |
| **OnionShare** | WeTransfer/SecureDrop | Port to Android | Temp .onion file share via Lethe's Tor daemon. |
| **ProofMode** | Photo authenticity | Pre-install | Crypto-signed media + C2PA + AI detection. |

---

## Not planned

**IPFS as general storage** — CIDs are deterministic; data existence itself is sensitive in Lethe's threat model. IPFS only for public artifacts, encrypted blobs, and ephemeral signaling.

**Full IPFS node** — serves content (metadata exposure), uses significant bandwidth, identifies device as IPFS node. Client-only is the right tradeoff.
