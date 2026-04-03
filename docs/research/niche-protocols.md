# Niche & Off-Grid Protocols — Research

Protocols that solve problems most tools assume don't exist: no internet,
no cell towers, hostile networks, air-gapped transfer, extreme latency.

---

## Radio & off-grid

### Meshtastic (LoRa mesh)
- $20-50 LoRa boards (ESP32/nRF52840), 1-10+ km range, days of battery
- Every device relays — self-healing mesh, no infrastructure
- AES-256 encrypted channels, text + GPS
- Android companion via Bluetooth
- **Lethe use:** Ship companion integration. $25 hardware → long-range encrypted comms with no internet.

### Reticulum + Sideband (transport-agnostic networking)
- Works over: LoRa, packet radio, WiFi, serial, I2P, TCP, QR codes on paper
- 150 bps (packet radio) to 1.2 Gbps (ethernet) — same protocol
- Cryptographic identity, E2E encrypted, zero-config, delay-tolerant
- Sideband app: text, voice (Codec2 over LoRa), images, telemetry
- LXMF: delay-tolerant message format (store-carry-forward)
- **Lethe use: Most important discovery in this research.** Bridges the gap between "has internet" and "has a radio board and nothing else." Ship Sideband, use Reticulum for device mesh.

---

## Censorship circumvention

### Pluggable Transports (Tor ecosystem)

| Transport | Disguise | Status (2025) |
|-----------|----------|---------------|
| obfs4 | Random noise | Blocked in China |
| Snowflake | WebRTC video call | Blocked in China |
| meek | HTTPS to cloud | Blocked in China |
| WebTunnel | HTTPS to website | Partially blocked |
| Domain shadowing | CDN-based (newer) | More resistant |

China blocks all major PTs as of April 2025. Lethe needs fallbacks beyond Tor PTs.

### Arti (Tor in Rust)
- Official Tor Project rewrite — embeddable as library, not SOCKS proxy
- Rust: memory-safe, ~50% of past C tor CVEs would be impossible
- 1.0 released, production-ready. Mobile SDK in early dev.
- **Lethe use:** Replace C tor daemon when mobile SDK stabilizes. Smaller, safer, embeddable.

---

## Data sync & social

### Secure Scuttlebutt (SSB)
- Offline-first: append-only signed feeds, epidemic gossip replication
- Syncs over TCP, LAN, Tor, or USB stick — ~20K nodes
- **Caveat:** Append-only = can't delete. Conflicts with burner mode "leave no trace."
- **Lethe use:** Research further — gossip model is interesting but permanence is a problem.

### Nostr (Notes and Other Stuff Transmitted by Relays)
- Minimalist: signed JSON events → WebSocket relays. Keypair = identity.
- Any relay can carry any content, relays are interchangeable
- Sub-protocols: groups, marketplaces, git, livestreaming
- **Lethe use:** Local relay on-device for offline, sync to public relays via Tor. Lighter than SSB.

### Willow Protocol (P2P data sync)
- 3D range-based set reconciliation — efficient multi-writer partial sync
- Meta-protocol: app defines encryption + data model
- Rust impl in progress — too early to adopt
- **Lethe use:** Watch — could underpin settings/contact sync between devices.

---

## Delay-tolerant & sneakernet

### DTN / Bundle Protocol
- NASA-designed store-carry-forward protocol for extreme latency/disconnection
- RFC 9171 (updated RFC 9713, Jan 2025)
- Not a direct integration target — but its principles inform Lethe's "works when nothing works" model: IPFS CAR as bundles, mesh message delivery, heartbeats tolerating hours of disconnect.

### Physical transfer
- **NFC tap:** Encrypted message exchange between Lethe devices in proximity
- **QR codes:** Reticulum/Sideband encodes encrypted messages as QR — photograph to decode
- **USB/SD:** Briar sneakernet, IPFS CAR files for offline OTA
- **Lethe use:** Support all of these. Burner mode: wipe device, keep SD card separately.

---

## Specialized messaging

### Ricochet Refresh (Tor hidden service chat)
- Each user IS a .onion hidden service — direct Tor circuit, zero servers
- No metadata whatsoever — no relay, no swarm, no storage
- Both users must be online simultaneously
- Desktop only (Qt). Would need Android port or Arti-based reimplementation.
- **Lethe use:** Ideal for high-threat real-time chat. Needs porting work.

### Magic Wormhole (one-time file transfer)
- Spoken code → SPAKE2 key exchange → E2E encrypted transfer
- Direct peer-to-peer (LAN or relay), one-time use
- **Lethe use:** "Send via wormhole" in share menu. Route relay through Tor. Perfect for sharing backup CIDs, keys, files between burner sessions.

---

## Transport reach

```
Full internet ──────── Tor, IPFS, Session, Nostr, Nym
Censored internet ──── Pluggable Transports, domain shadowing
WiFi (no internet) ─── Briar, Reticulum, Yggdrasil
Bluetooth (~10m) ───── Briar, Meshtastic
LoRa (1-10+ km) ────── Meshtastic, Reticulum
Packet radio ────────── Reticulum
QR code (paper) ─────── Reticulum/Sideband
USB/SD card ─────────── Briar, IPFS CAR, DTN
```

Lethe should work at every level.

---

## Recommendations

### Must integrate
| Protocol | Why | Effort |
|----------|-----|--------|
| Reticulum + Sideband | Works over anything — ultimate last resort | Medium |
| Meshtastic | Long-range off-grid ($25 hardware) | Low |
| Arti | Replace C tor — safer, embeddable | High (wait for SDK) |

### Should integrate
| Protocol | Why | Effort |
|----------|-----|--------|
| Ricochet Refresh | Zero-metadata real-time Tor chat | High (needs port) |
| Magic Wormhole | File transfer via spoken code | Low |
| Nostr | Lightweight social, local relay | Medium |

### Should ship (pre-install)
| Tool | Why | Effort |
|------|-----|--------|
| Haven (Guardian Project) | Physical intrusion detection via phone sensors, alerts via Tor | Low |
| ProofMode (Guardian Project) | Cryptographic proof of photo/video authenticity + C2PA + AI detection | Low |
| Scrambled Exif | Strip EXIF/GPS metadata from share sheet (or bake into OS) | Low |
| age | Modern file encryption, replaces GPG. Go + Rust impls. | Low |

### Should integrate
| Tool | Why | Effort |
|------|-----|--------|
| Dangerzone | Quarantine untrusted docs → safe PDF via pixel rendering | High (needs port) |
| NetGuard / per-app firewall | Per-app outbound network control at system level | Medium |
| BLE proximity dead man's switch | BusKill concept → BLE beacon out of range = lock/wipe | Medium |

### Watch
| Protocol | Blocker |
|----------|---------|
| Willow | Too early — Rust impl in progress |
| SSB | Append-only conflicts with burner mode |
| Domain shadowing | Needs upstream Tor PT support |
