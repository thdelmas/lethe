# Gladys Assistant — Research

How Gladys relates to LETHE. Privacy-first home automation as a companion
system for a privacy-first OS.

- Site: `https://gladysassistant.com/`
- GitHub: `https://github.com/GladysAssistant/Gladys`
- License: Apache 2.0
- Stack: Node.js + SQLite + Preact, deployed via Docker
- Status: Actively maintained (v4.71.0, March 2026, 11 years running)

---

## What Gladys Is

Open-source home automation platform. Controls lights, sensors, cameras,
locks, thermostats from a single dashboard. 39+ integrations (Zigbee, Matter,
MQTT, Z-Wave, Bluetooth, Philips Hue, Shelly, Tuya, Tasmota, etc.). GUI-only
config, no YAML needed.

**Core philosophy overlaps with LETHE:** local-first, no cloud dependency, no
tracking, no data selling. All data stays on the user's machine. Optional paid
cloud layer (Gladys Plus) for E2E-encrypted remote access — users without it
use VPN instead.

---

## Relevance to LETHE

### 1. IoT Control from the Agent

LETHE's agent could act as the **command layer** for Gladys-managed devices.
User says "turn off the lights" → LETHE agent → Gladys API → Zigbee bulb.
Gladys handles protocol complexity (Zigbee, Z-Wave, Matter), LETHE handles
intent and privacy.

| LETHE component | Gladys touchpoint |
|-----------------|-------------------|
| Agent chat/voice | Gladys REST API for device control |
| Privacy defaults | Gladys local-only mode (no cloud) |
| Tor routing | Gladys Plus E2E model (reference) |
| Dead man's switch | Could trigger Gladys scenes (lock doors, kill cameras) |
| Burner mode | Could wipe Gladys API tokens on ephemeral boot |

### 2. Matter as the Bridge Protocol

Gladys already integrates Matter and Matterbridge. Matter is vendor-neutral
and local-first — no cloud needed for device pairing or control. LETHE could
speak Matter directly without needing Gladys as middleware for simple setups,
or delegate to Gladys for complex multi-protocol homes.

### 3. SQLite Patterns

Gladys uses SQLite with Sequelize ORM and migrations. LETHE already uses
SQLite for on-device RAG (sqlite-vec, from hidden-gems research). Gladys's
schema patterns for device state, sensor history, and scene definitions are
a reference for LETHE's own device awareness layer.

### 4. E2E Remote Access Model

Gladys Plus provides encrypted remote access without exposing the local
instance. Relevant to LETHE's remote management story — how a user accesses
their LETHE device when away from home. The Gladys model (WebSocket tunnel
with E2E encryption) is lighter than a full Tor hidden service.

### 5. Scene Automation as Agent Capability

Gladys scenes are if-then automations (motion detected → turn on light,
temperature > 30 → alert). LETHE's agent could:

- **Create** Gladys scenes via natural language ("when I leave, lock
  everything and arm the cameras")
- **Override** scenes based on privacy mode ("in burner mode, disable all
  camera recording scenes")
- **Extend** scenes with LETHE-specific triggers (dead man's switch timeout,
  Tor circuit failure, threat level change)

---

## Architecture Fit

```
User ↔ LETHE Agent ↔ Gladys API (localhost or LAN)
                         ↓
                    Zigbee / Matter / MQTT / Z-Wave
                         ↓
                    Physical devices
```

Gladys runs on a separate device (Pi, NAS, mini-PC) on the same LAN. LETHE
treats it as a **peripheral service** — like Tor or IPFS. The agent discovers
Gladys via mDNS/LAN scan and authenticates locally.

**Privacy constraint:** LETHE must never send device telemetry or scene data
through Gladys Plus (cloud). All communication stays on the local network.
If remote access is needed, it goes through LETHE's own Tor hidden service,
not Gladys's cloud tunnel.

---

## What Gladys Lacks (LETHE Can Fill)

| Gap in Gladys | LETHE fills it with |
|---------------|---------------------|
| No threat awareness | Privacy state drives automation |
| No ephemeral mode | Burner mode wipes IoT tokens |
| No agent personality | Guardian mediates device control |
| No anonymity layer | Tor isolates smart home traffic |
| No forensic resistance | Device state wiped on dead man's switch |
| Single-maintainer risk | LETHE doesn't depend on Gladys — it's optional |

---

## Integration Priority

**P2 (3-6 month horizon).** Not ship-blocking. LETHE's core value is the
phone in your pocket, not the house around it. But home automation is a
natural extension of a privacy-first OS, and Gladys is the closest
philosophically aligned project in that space.

**First step:** Add Gladys device discovery to the agent's LAN scan. If a
Gladys instance is found, surface it in the agent chat as an available
service. No deep integration needed initially — just awareness.
