# Anonymous Routing Protocols — Research

Tor is Lethe's current anonymity layer. This surveys alternatives to understand
where Tor falls short and what could replace or augment it.

## Why Tor today

Largest anonymity set (~2M daily users), mature, audited, Android support via
transparent proxy, .onion hidden services. Lethe runs it as `init.lethe-tor.rc`.

## Where Tor falls short

- TCP only — no UDP/ICMP (no VoIP, gaming, DNS-over-UDP)
- 9 hardcoded directory authorities — single censorship point
- No timing obfuscation or cover traffic — global adversary can correlate
- High latency for hidden services (~500ms+ RTT)
- Bridge distribution is losing the arms race (all PTs blocked in China, Apr 2025)

---

## Protocol survey

### I2P — Garlic routing, decentralized
- Unidirectional tunnels (inbound/outbound separate) — stronger traffic analysis resistance
- 12-hop round-trip vs Tor's 6
- Decentralized routing via Kademlia DHT — no directory authorities
- Every node routes for others
- ~50K users (100x fewer than Tor — smaller anonymity set)
- PurpleI2P (C++) is lightweight enough for mobile
- **Lethe use:** Run alongside Tor for device-to-device hidden services (heartbeats, backup sync)

### Lokinet — Layer 3 onion routing
- Routes all IP traffic (TCP, UDP, ICMP) — not just TCP
- Oxen Service Node relays with staked Sybil resistance
- Lower latency than Tor for many workloads
- Small network (~1K nodes), blockchain dependency, no Android client yet
- **Lethe use:** Skip — blockchain dep, no mobile, small network

### Nym — Mixnet
- Reorders, delays, and pads packets — defeats global passive adversary
- Cover traffic makes network look busy even when idle
- Too slow for daily browsing (50-200ms per hop added)
- NYM token incentivization (crypto dependency)
- **Lethe use:** Watch — selectively route high-sensitivity traffic (heartbeats, backup uploads)

### Veilid — Mobile-first P2P framework
- Rust, every node is a relay, DHT-based routing + storage
- No blockchain, no tokens — pure protocol
- Handles cell↔WiFi transitions seamlessly (critical for mobile)
- XChaCha20-Poly1305, x25519, BLAKE3, Argon2
- Created by Cult of the Dead Cow
- Very young, tiny network, no audit
- **Lethe use:** Watch closely — most architecturally aligned. Could eventually replace Tor+IPFS.

### Session — Onion-routed messenger
- 3-hop onion requests via Oxen Service Nodes
- No phone number, 66-char public key identity
- Decentralized message storage on swarms
- Production Android app
- **Lethe use:** Ship as default online messenger

### Briar — Offline mesh messenger
- Online: Tor hidden services. Offline: Bluetooth, WiFi Direct, USB sneakernet
- No servers at all — pure P2P, messages stored only on devices
- Audited by Cure53. Android-native. No iOS.
- **Lethe use:** Ship as default offline/extreme-scenario messenger

### Yggdrasil — Encrypted IPv6 mesh
- Cryptographic IPv6 addresses, self-healing spanning tree routing
- Zero-config, works over any transport
- NOT an anonymity tool — routing tree reveals topology
- **Lethe use:** Consider as encrypted local backbone for P2P relay/sync (not internet anonymity)

### Tox — P2P encrypted voice/video/chat
- Pure P2P via DHT. No servers, no accounts. Voice, video, file transfer, screen share.
- No metadata — DHT-based discovery, no central directory
- qTox (desktop), aTox/Antox (Android)
- **Lethe use:** Fills the voice/video gap. Briar (offline) + Session (async) + Tox (real-time A/V).

### OnionShare — anonymous file sharing/hosting
- Start a temporary Tor .onion service on your device. Share files, host a site, run a chat.
- No account, no server, no upload limit. Close share = URL ceases to exist.
- Pre-installed on Tails, QubesOS. Desktop only — no Android client yet.
- **Lethe use:** If ported to Android, instant anonymous dead drop via Lethe's Tor daemon.

### Ricochet Refresh — zero-metadata Tor chat
- Each user IS a .onion hidden service — direct circuit, no servers, no storage
- Both users must be online simultaneously
- Desktop only (Qt). Needs Android port or Arti-based reimplementation.
- **Lethe use:** Highest-privacy real-time chat. Needs porting work.

### Others evaluated

| Protocol | Verdict | Reason |
|----------|---------|--------|
| CJDNS | Skip | Encrypted mesh, no anonymity, superseded by Yggdrasil |
| Hyphanet | Skip | Java, no mobile, high latency. Interesting persistence model for server-side only |
| GNUnet | Skip | GNS naming is interesting, rest is impractical. Tiny user base |

---

## Comparison

| Protocol | Anonymity | UDP | Mobile | Network size | Decentralized | Offline | Blockchain |
|----------|-----------|-----|--------|-------------|---------------|---------|------------|
| Tor | Strong | No | Yes | ~2M | No (9 auths) | No | No |
| I2P | Strong | Yes | Yes | ~50K | Yes | No | No |
| Lokinet | Moderate | Yes | In dev | ~1K | Yes | No | Yes |
| Nym | Strongest | Via mix | Yes | ~500 | Yes | No | Yes |
| Veilid | Moderate | TBD | Yes | Tiny | Yes | No | No |
| Session | Moderate | No | Yes | ~1.5K | Yes | No | Yes |
| Briar | Strong | No | Yes | P2P | N/A | Yes | No |
| Tox | None | Yes | Yes | P2P | Yes | No | No |
| OnionShare | Strong | No | No (yet) | P2P | N/A | No | No |
| Ricochet | Strong | No | No (yet) | P2P | N/A | No | No |
| Yggdrasil | None | Yes | Community | ~1K | Yes | Yes | No |

---

## Recommendations

**Keep:** Tor — nothing matches the anonymity set.
**Add:** Briar (offline mesh) + Session (online messaging) + Tox (voice/video).
**Evaluate:** I2P alongside Tor for hidden services (PurpleI2P).
**Port:** OnionShare to Android (anonymous dead drops), Ricochet Refresh (zero-metadata chat).
**Watch:** Veilid (future unified stack), Nym (high-threat supplement).
**Skip:** Lokinet, CJDNS, Hyphanet, GNUnet.
**Steal from Tails:** hostname randomization on boot, strict Tor-or-nothing firewall enforcement.

## Layered architecture vision

```
Daily use          │  High-threat ops
───────────────    │  ────────────────
Tor (clearnet)     │  Nym (mixnet)
Session (chat)     │  I2P (hidden svcs)
IPFS via Tor       │  Briar (offline)
───────────────────┼──────────────────
Local mesh (opt)   │  Yggdrasil / Reticulum
Transport          │  WiFi / Cell / BT / USB
```

## Messaging stack (complete)

```
Scenario             │  Protocol
─────────────────────┼──────────────
Offline / mesh       │  Briar (BT/WiFi/USB)
Async / online       │  Session (Oxen onion routing)
Real-time voice/vid  │  Tox (P2P, no servers)
Zero-metadata chat   │  Ricochet Refresh (Tor hidden svc)
Group chat           │  Quiet (Tor+IPFS) or Nostr
Anonymous file drop  │  OnionShare (.onion)
Covert messaging     │  PixelKnot steganography
Off-grid (1-10km)    │  Meshtastic + Reticulum
```
