# Hidden Gems: Decentralized, P2P & Mesh Communication

> Research compiled 2026-03-31. Part of the hidden-gems series.
> Priority: P0 (ship-blocking), P1 (next release), P2 (3-6mo), P3 (long-term).

Already in LETHE/researched: IPFS, Tor, Reticulum/Sideband, Meshtastic,
Briar, Session, Tox, Magic Wormhole, Veilid, Nym, OnionShare, Ricochet.

---

## 1. Storage & Sync

### Iroh (n0/number0) — P1
- **URL**: https://iroh.computer / https://github.com/n0-computer/iroh
- **What**: Rust P2P networking on QUIC with multipath, NAT traversal,
  direct encrypted connections. "Dial keys instead of IPs." BLAKE3
  hashing. Tested on hundreds of thousands of devices including Android.
  Handles mobile roaming.
- **Why**: **IPFS successor that fixes IPFS's mobile problems.** No
  heavy libp2p, no global DHT requirement. MagicSocket tries UDP, QUIC
  multipath, and relay simultaneously. Relay sees only encrypted opaque
  key-to-key traffic.

### Willow Protocol + Earthstar — P1
- **URL**: https://willowprotocol.org / https://earthstar-project.org
- **What**: P2P data sync using 3D range-based reconciliation --
  identifies and transfers only missing data in milliseconds, even with
  millions of records. Earthstar v11 (beta) implements Willow with
  Meadowcap capability-based access control. Includes a **Sideloading
  protocol** for offline sync via USB/QR/physical media.
- **Why**: Sideloading protocol is purpose-built for LETHE's offline
  scenarios. Far more efficient than IPFS Bitswap. Earthstar's
  invite-only namespaces map perfectly to LETHE's privacy model.

### GuardianDB — P2
- **URL**: https://github.com/wmaslonek/guardian-db
- **What**: Rust local-first decentralized DB on Iroh + Willow. Started
  as Rust OrbitDB, stripped IPFS. BLAKE3, QUIC, zero-copy, native
  encryption, CRDT sync.
- **Why**: OrbitDB rebuilt without IPFS baggage. Perfect embedded DB
  for LETHE apps needing P2P sync.

### Automerge — P2
- **URL**: https://automerge.org
- **What**: CRDT library for local-first apps. Documents merge without
  conflicts. Rust core. Sync is transport-agnostic (Bluetooth, USB, QR).
- **Why**: Ideal data format for offline-first apps. Transport-agnostic
  sync matches LETHE's multi-transport philosophy.

### Peergos — P2
- **URL**: https://peergos.org (Google Play)
- **What**: P2P encrypted filesystem with social networking. Quantum-
  resistant E2EE. Zero-knowledge access control (server never sees
  metadata or friendship graphs). Audited by Radically Open Security
  (Nov 2024).
- **Why**: Zero-knowledge access control layer is independent of storage
  -- could adopt on top of Iroh instead of IPFS.

---

## 2. Identity & Capabilities

### Spritely Goblins + OCapN — P2
- **URL**: https://spritely.institute / https://codeberg.org/spritely
- **What**: Distributed object-capability programming. OCapN protocol
  for secure collaboration between mutually suspicious parties. "If you
  don't have it, you can't use it." Proto-standardization with Agoric,
  MetaMask, Sandstorm.
- **Why**: Radically better than ACLs. Asks "what authority do you hold?"
  not "who are you?" Works offline -- capabilities are crypto tokens
  needing no blockchain/server. LETHE's permission system for plugins.

### Polygon ID (Mobile ZKP) — P3
- **URL**: https://polygonid.com
- **What**: Self-sovereign identity via zero-knowledge proofs. Prove
  attributes ("I'm over 18") without revealing identity. Mobile SDK.
- **Why**: Ultimate privacy-preserving auth if mobile proving gets fast.

### Halo2 (Rust ZKP) — P3
- **URL**: https://github.com/zcash/halo2
- **What**: ZK-SNARK. No trusted setup. Pure Rust. Zcash team.
  Compiles to Android NDK and WASM.
- **Why**: No trusted setup is critical for privacy OS. Could attest
  "this device runs unmodified LETHE" without revealing device identity.

---

## 3. Messaging

### SimpleX Chat — P0
- **URL**: https://simplex.chat
- **What**: First messaging network with **no user identifiers at all**.
  No usernames, phone numbers, or random IDs. Temporary one-time
  invitation links. Quantum-resistant E2EE. Unidirectional message
  queues. Audited by Trail of Bits (Jul 2024). Funded by Jack Dorsey.
- **Android**: v6.4.8 stable.
- **Why**: Gold standard for metadata resistance. Server handling
  delivery for Alice has zero knowledge of Bob. No user graph to leak.
  More metadata-resistant than Signal, Session, or Matrix.

### TinySSB (Scuttlebutt over LoRa/BLE) — P2
- **URL**: https://github.com/ssbc/tinySSB
- **What**: Scuttlebutt shrunk to 120-byte packets for BLE and LoRa.
  Two devices auto-sync via BLE proximity. Voice over SSB over LoRa
  (vossbol). ESP32 firmware.
- **Why**: LETHE phones auto-sharing encrypted social feeds by
  proximity. No internet, servers, or accounts. Parallel communication
  invisible to conventional surveillance.

### Cabal / Cable Protocol — P2
- **URL**: https://cabal.chat / https://codeberg.org/cabal/cable
- **What**: P2P encrypted group chat. No servers, sign-up, or accounts.
  Cable protocol over Hyperswarm DHT. Offline history browsing.
  cabal-mobile in development.
- **Why**: True serverless group chat. No infrastructure to seize,
  subpoena, or shut down.

### Nostr — P2
- **URL**: https://nostr.com (Android: Amethyst)
- **What**: Open protocol for decentralized message relay. Identity is
  a keypair. Relay-based (not federated servers). Mostr bridge for
  ActivityPub interop. $10M from Jack Dorsey (2025).
- **Why**: Simplicity is the strength. Local relay on phone syncs
  opportunistically. NIP system for extensibility without protocol bloat.

---

## 4. Mesh Networking

### Yggdrasil Network — P1
- **URL**: https://yggdrasil-network.github.io (F-Droid)
- **What**: E2E encrypted IPv6 overlay. Every node gets cryptographic
  IPv6 from its public key. Local mesh to global network.
- **Android**: F-Droid app, VPN API (no root). ~15MB Go binary.
- **Why**: Unlike Tor/I2P (anonymity), Yggdrasil provides **routable
  encrypted addressing**. Every LETHE device gets a permanent crypto
  address working over WiFi mesh, internet, or LoRa bridge. The missing
  "always-reachable identity" layer.

### Qaul — P2
- **URL**: https://qaul.net (Google Play)
- **What**: Internet-independent mesh: voice, encrypted messaging, file
  sharing, user discovery. BLE + WiFi + Internet simultaneously.
  Written in Rust (v2.0). AGPLv3.
- **Why**: Multi-transport mesh in Rust. Exactly LETHE's needs.

### B.A.T.M.A.N.-adv — P3
- **URL**: https://www.open-mesh.org/projects/batman-adv/wiki
- **What**: L2 mesh routing in Linux kernel since 2.6.38. All mesh
  nodes appear as single LAN. Apps work transparently.
- **Why**: L2 = zero app modification for mesh. LETHE kernel could
  include for seamless bridging.

### EasyTier — P2
- **URL**: https://github.com/EasyTier/EasyTier
- **What**: Decentralized mesh VPN with WireGuard. Auto NAT traversal.
  Falls back to shared relay. Rust.
- **Why**: Self-forming WireGuard mesh. LETHE devices join automatically
  creating encrypted overlay between all users.

---

## 5. DTN & Store-Carry-Forward

### DTN7-kotlin — P2
- **URL**: https://dtn7.github.io
- **What**: Bundle Protocol v7 (RFC 9171) in Kotlin. Store-carry-forward
  delivery. Packets hop via occasional physical proximity. QUICL
  convergence layer.
- **Android**: Kotlin = native Android, no JNI.
- **Why**: Solves a different problem than IPFS/Tor -- moving data when
  no path exists, only occasional physical proximity.

### Serval Mesh — P2
- **URL**: https://github.com/servalproject/batphone (F-Droid)
- **What**: Android mesh for voice, SMS, files over WiFi. Rhizome DTN
  for epidemic file distribution. Bluetooth. Android 2.2+.
- **Why**: Rhizome's epidemic routing is battle-tested for disaster/
  protest scenarios.

### CoMapeo (formerly Mapeo) — P2
- **URL**: https://comapeo.app
- **What**: Offline-first P2P mapping on Hypercore. Used by indigenous
  communities in 90+ countries. Works in Amazon rainforest.
- **Why**: Battle-tested offline P2P sync in harshest conditions.
  Sync-over-WiFi-Direct patterns directly applicable to LETHE.

---

## 6. Radio-Based Transfer

### LoRa-AX.25-Android BLE Bridge — P2
- **URL**: https://github.com/psytraxx/android-lora-ble-bridge
- **What**: Text + GPS over 433MHz LoRa via ESP32-S3 paired to Android
  BLE. Up to 10km range, 70-100hr battery.
- **Why**: Turnkey Android-to-LoRa. Built-in BLE pairing to cheap ESP32
  = 10km text messaging without infrastructure.

### esp32_loraprs — P2
- **URL**: https://github.com/sh123/esp32_loraprs
- **What**: ESP32 LoRa/FSK with KISS TNC over BLE/USB/TCP. Compatible
  with APRSDroid. Bridges LoRa to AX.25 packet radio.
- **Why**: Tap into global APRS network via cheap hardware.

---

## 7. Decentralized Apps & Consensus

### Holochain — P3
- **URL**: https://holochain.org
- **What**: Agent-centric DHT. Each node validates locally, no global
  consensus. "Zero-width arcs" for mobile (DHT peer without storing
  others' data). v0.4, Mar 2025. Chat demo on Volla phone.
- **Why**: Eliminates blockchain bottleneck. Each LETHE device is
  sovereign. Zero-width arc = perfect for mobile.

### Obtainium — P1
- **URL**: https://github.com/ImranR98/Obtainium
- **What**: Install/update apps directly from developer release pages.
  No app store intermediary. Signature verification.
- **Why**: Default package manager. Apps from source, no gatekeeping.

### Accrescent — P1
- **URL**: https://accrescent.app
- **What**: Security-focused app repository. Developers sign their own
  apps (unlike F-Droid which re-signs -- security risk).
- **Why**: Developer-signed = strictly better than F-Droid model.

### Hypercore / Pear Runtime — P3
- **URL**: https://docs.pears.com / https://keet.io
- **What**: Complete P2P app platform. Hypercore (append-only logs),
  Hyperswarm (DHT), Hyperdrive (filesystem). "Bare" minimal JS runtime
  for mobile. Keet messenger on Google Play. Backed by Tether.
- **Why**: LETHE could use Pear/Bare as P2P app runtime giving every
  installed app P2P capabilities by default.

---

## 8. P2P DHT & Discovery

### GNUnet R5N-DHT — P3
- **URL**: https://gnunet.org
- **What**: Byzantine fault-tolerant, censorship-resistant Kademlia
  variant. CADET protocol for confidential E2E transport over DHT.
  v0.25.0, Sep 2025. Being standardized as IETF RFC.
- **Why**: Most rigorous DHT designed for privacy. Resists Sybil attacks
  by design. CADET = encrypted routing without separate overlay.

### casq (Content-Addressed Storage) — P3
- **URL**: https://github.com/roobie/casq
- **What**: Minimal single-binary content-addressed store using BLAKE3.
  Rust. "Minimal git object store."
- **Why**: When IPFS is overkill but you want content addressing.

---

## Integration Priority

**P0:** SimpleX Chat (default messenger candidate)

**P1:** Iroh + Willow (supplement/replace IPFS), Yggdrasil (device
addressing), Obtainium + Accrescent (app distribution)

**P2:** GuardianDB, Automerge, DTN7-kotlin, Qaul, TinySSB, Cabal,
LoRa bridges, EasyTier, Nostr, CoMapeo patterns

**P3:** Holochain, Halo2 ZKP, GNUnet, B.A.T.M.A.N.-adv, Hypercore/
Pear, Katzenpost, Polygon ID
