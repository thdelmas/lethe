# LETHE — Features

Privacy-hardened Android overlay on LineageOS 22.1 (Android 15).
Works on 300+ devices via LineageOS device trees.

> **Source of truth:** [manifest.yaml](../manifest.yaml).
> This document is a human-readable index. If it disagrees with the manifest, the manifest wins.

---

## Privacy & Hardening

### Debloat
Removes Google Play Services, GSF, Maps, YouTube, Play Store, setup wizard, and related telemetry. Replaces Trebuchet with the Void launcher.

### Network hardening
- **DNS-over-TLS** — Quad9 primary, Mullvad fallback, strict mode (no cleartext).
- **Firewall** — default-deny, per-app grants, VPN lockdown kills network on drop.
- **NTP** — `time.cloudflare.com` (no Google NTP).
- **Captive portal** — GrapheneOS endpoint, not Google.

### Tracker blocking
System-level hosts file from StevenBlack + AdAway, refreshed every 7 days.

### Sensor permissions
Camera/mic/location default to `ask`. Body sensors, nearby devices, and background location default to `deny`.

### SELinux
Enforcing with custom deny rules (`net_raw`, executable app data).

### Encryption
FDE (AES-256-XTS) enforced on first boot. Disabled on Exynos 4412 devices where the base supports only broken FBE.

See [security/SECURITY-ROADMAP.md](security/SECURITY-ROADMAP.md) for P0–P3 hardening roadmap.

---

## Anonymity & Network

### Tor (transparent proxy, on by default)
All user-app TCP and DNS routed through Tor. UDP dropped to prevent leaks.
- Per-app circuit isolation + stream isolation
- obfs4 bridges for censored networks
- Orbot pre-installed as optional UI (Tor runs as system service regardless)

### IPFS OTA
Firmware updates over IPFS, Ed25519-signed manifests, swarm reached via Tor.
- IPNS channel `lethe-updates`, 6-hour check interval
- Client-only (no DHT serving, no content hosting)
- `.car` archives for offline updates via OSmosis USB
- Security patches auto-install; feature updates prompt

---

## Ephemerality & Duress

### Burner mode (ON by default)
Full wipe on every boot unless disabled in Settings > Privacy > Burner Mode. Config lives on `/persist` so preferences survive wipes.
- **Triggers:** power-button panic (5× long-press), USB signal from OSmosis, dead man's switch
- **Wipe scope:** `/data`, internal storage, eSIM profiles, Wi-Fi, Bluetooth pairings, clipboard, notifications
- **Identity rotation:** MAC, Android ID, and serial randomised post-wipe

### Dead man's switch (OFF by default — first-boot wizard asks)
Silence is the trigger: no signal is ever sent. Check-in via bland "Scheduled maintenance pending" notification.
- Intervals: 12h / 24h (default) / 48h / 72h / 7d
- Separate dead-man passphrase, optional duress PIN
- **Escalation:** lock (immediate) → wipe (+1h) → brick (+2h, opt-in, OSmosis USB recovery only)

### Mesh signaling — **preview** (OFF by default)
The LETHE mesh is a **dead man's switch transport, not a chat network.**
Trusted LETHE devices broadcast HMAC-SHA256-tagged 21-byte "I'm alive"
heartbeats over BLE; if you go silent across your fleet, surviving
peers detect the silence and the DMS escalation fires on schedule.
Carries no user-authored content by design — across v1.0/v1.1/v1.2 —
because that scope (a) is all the DMS needs, (b) keeps the mesh
outside the EU ECS perimeter (see
[research/eu-mesh-regulation.md](research/eu-mesh-regulation.md)),
and (c) avoids reinventing crypto Briar already does well.

Range: BLE line-of-sight (~10–30m). v1.1 bridges DMS payloads over
Briar's bramble-core contact graph; v1.2 extends with Iroh + Yggdrasil
for IP-layer DMS relay. Roadmap:
[research/gems-decentralized-mesh.md](research/gems-decentralized-mesh.md#implementation-status--release-roadmap).

**For actual chat, voice, or file transfer, use Briar or Molly-FOSS**
(both in the recommended Apps list below). LETHE doesn't replace them.

---

## Interface

### Void launcher
Minimalist single-page home: wallpaper, breathing clock, living mascot. No dock, no widgets, no search bar.
- Text-only alphabetical app drawer (swipe up; again for search)
- Gestures: swipe down = notifications, double-tap = sleep, long-press = LETHE agent
- Ember-style notifications (faint red dots, no badges)
- Progressive hints instead of a tutorial

### LETHE agent
Guardian-personality AI built into the OS (package `org.osmosis.lethe.agent`, localhost:8080). Full spec in [agent/agent.yaml](agent/agent.yaml). Multi-provider LLM routing in [agent/providers.yaml](agent/providers.yaml).

---

## Protection Domains (guardian modules)

See [design/protection-domains.md](design/protection-domains.md) for full scope.

- **Bios** — health data sovereignty (OSCAR, xDrip+, Gadgetbridge, EXIF stripping, lockscreen medical card)
- **PreuJust** — financial fraud prevention (phishing detection, permission audits, subscription tracking)
- **Vigil, Mnemo, Hora, Egida, Themis, Oikos** — see protection-domains doc

---

## Legal & Onboarding

### First-boot wizard
Unified flow defined in [agent/first-boot-wizard.yaml](agent/first-boot-wizard.yaml). Targets <3 min.

### Legal gates
- **Geographic notice** — blocks setup in comprehensively sanctioned jurisdictions; cautions in encryption/VPN/AI-restricted ones
- **AI disclaimers** — health (Bios), financial (PreuJust), and general AI response limitations — must acknowledge

---

## OSmosis Integration

- USB-delivered OTA updates
- IPFS update channel
- Remote recovery boot via OSmosis
- Automated NAND backup agent

---

## Recommended apps

**Pre-installed:** F-Droid, Orbot, Mull Browser, Aurora Store, DAVx5.
**Suggested:** Molly-FOSS, Briar, NewPipe, OsmAnd+, K-9 Mail, Aegis, Shelter, Scrambled Exif.

**Messenger positioning:** Molly-FOSS (hardened Signal fork, same network as Signal — use for existing contacts) and Briar (BLE + Tor mesh, no phone number — use for anonymous / offline / dissident scenarios, and it shares BLE transport with the dead man's switch mesh). Stock Signal is not recommended: its phone-number requirement conflicts with LETHE's burner/identity-rotation story.

---

## Device tiers

40+ device mappings across shallow/taproot/deeproot tiers — see [design/device-tiers.yaml](design/device-tiers.yaml). Devices include Pixel 7–9 series, Fairphone 4/5, Nothing Phone 1/2/2a, OnePlus 8 Pro/9/9 Pro, Xiaomi Mi 11 Lite, Motorola G7+/G52, Sony Xperia 1 II/III, and unofficial Samsung Galaxy Note II (Exynos 4412, LOS 14.1).

---

## Related documents

- [competitive-gaps.md](design/competitive-gaps.md) — P0–P3 gap analysis vs 2026 AI agents
- [SECURITY-ROADMAP.md](security/SECURITY-ROADMAP.md) — hardening priorities bridging GrapheneOS depth
- [RELEASE-v1.0.0.md](RELEASE-v1.0.0.md) — v1.0.0 release scope (target: 2026-05-04)
