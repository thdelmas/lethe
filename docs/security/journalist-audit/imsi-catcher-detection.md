# IMSI-catcher detection — design

**Tracks:** [#105](https://github.com/thdelmas/lethe/issues/105)  ·  **Roadmap:** P3 → P1 (this release line)

## Threat model

Active radio adversaries operating fake base stations to (a) pin device
identifiers, (b) downgrade to weak ciphers (A5/0, A5/1) so a passive
collector can read traffic, (c) deliver silent SMS for location
confirmation. Stingrays, Triggerfish, Hailstorm, and modern 5G
"non-standalone" downgraders are common in protests, border zones, and
embassies — exactly the situations LETHE targets.

LETHE cannot fully detect these on every device — IMSI-catcher detection
fundamentally requires access to the modem's diagnostic interface
(Qualcomm DIAG, MediaTek MTKLOGGER), which most stock Android builds lock
out. LETHE *is* rooted, which gets us further than user-space apps can,
but device support is uneven.

## Detection signals (cheap → expensive)

1. **Cipher null / A5/0** — connection negotiated with no encryption.
   Read via DIAG layer-3 messages or `+QENG`-style AT commands on
   modems that expose them. Strong signal.
2. **2G downgrade in a country whose carriers run 4G/5G** — almost
   always malicious in EU/US in 2026. Available from the radio info
   service via reflection on rooted devices.
3. **Sudden cell-tower change with the same LAC/TAC** — legitimate
   handovers update LAC/TAC; rogue towers often clone identifiers
   imperfectly. Heuristic, not deterministic.
4. **Empty / known-rogue PLMNs** — published rogue MCC/MNC codes
   (the "PLMN blacklist"). Trivial; first thing to ship.
5. **Silent SMS / type-0 SMS** — used to ping IMSI without user
   notification. Detectable via DIAG; often dropped by the modem
   before reaching userspace, so coverage is partial.
6. **TMSI reallocation rate** — a real network reallocates TMSI on
   schedule; a Stingray often re-pages the IMSI directly. Statistical
   signal, false-positive prone.
7. **Cell-tower geolocation mismatch** — the reported tower's published
   coordinates vs. GPS. Powerful but requires an offline cell-tower
   database (~200 MB OpenCelliD dump shipped or fetched over Tor).

## Approach

Three components.

### `lethe-cellguard` daemon

Native service running as `radio` UID on rooted devices, started by a new
`init.lethe-cellguard.rc`. Tries DIAG first (Qualcomm), falls back to
RIL telephony API for cipher and PLMN info. Emits a structured event
stream on `/data/lethe/cellguard.sock`.

### Detection rules (declarative)

A YAML rule file shipped at `overlays/cellguard-rules.yaml`:

```yaml
- id: cipher-null
  match: { cipher: A5/0 }
  severity: high
- id: 2g-downgrade-in-eu
  match: { rat: GERAN, country_in: [DE, FR, NL, BE, ...] }
  severity: high
- id: plmn-rogue-known
  match: { plmn_in: blacklist }
  severity: critical
- id: tower-coord-mismatch
  match: { gps_distance_km_gt: 10 }
  severity: medium
```

Rules update via the existing IPFS OTA channel — important, because
rogue PLMN lists evolve.

### UI surface

Quick Settings tile "Cellular Integrity" with three states (green /
amber / red), tappable for an event log. On critical events, the agent
surfaces a notification *without* network identifiers ("rogue tower
detected, switch to Wi-Fi or airplane mode") — the device must not
reply to anything until the user decides.

## Device support matrix

| Tier | Devices | DIAG | RIL fallback | Confidence |
|---|---|---|---|---|
| 1 | Pixel 6/7/7a/8 (Tensor + Exynos modem) | partial — Tensor exposes Samsung modem AT, no DIAG | yes | medium |
| 2 | Fairphone 5 (Snapdragon 7 Gen 2) | yes (Qualcomm DIAG, root) | yes | high |
| 3 | OnePlus, older Snapdragon devices | yes | yes | high |
| 4 | MediaTek devices (t03g class, older Samsung) | MTKLOGGER, vendor-specific | yes | low |

Quality varies enough that we ship per-tier honesty: the Quick Settings
tile shows "monitoring (limited)" on tier-1, "monitoring (full)" on
tier-2/3, "monitoring not available" on tier-4 with an explanation link.

## Acceptance mapping

| Issue criterion | Lands in |
|---|---|
| Device support matrix (which baseband exposes DIAG) | matrix above |
| Alerting on 2G-downgrade / cipher-null / sudden cell-tower change | rule file + notification path |
| Documented limitations for non-Qualcomm devices | "Device support matrix" + tier-4 fallback |

## Why not just port SnoopSnitch / Rayhunter

* **SnoopSnitch** is the closest fit but is GPL, requires a recent
  baseband, and its rule set is GSM-era. We can integrate its
  *detection logic* (rule definitions) without taking the whole app.
* **Rayhunter** is brilliant but runs on a separate piece of hardware
  (Orbic hotspot). Out of scope for the on-device feature, though
  documenting a "pair LETHE with a Rayhunter" recipe is a follow-up.
* **AIMSICD** is unmaintained; we'd be inheriting bit-rot.

Decision: ship our own daemon, lift SnoopSnitch's rule formalism, leave
Rayhunter as an ecosystem doc rather than a build dependency.

## Residual risks / honest limitations

* Modern 5G stingrays exploit NSA-class techniques against the
  RRC layer that DIAG doesn't show. Our coverage is GSM/UMTS/LTE-class
  attacks, not nation-state 5G.
* False positives from poorly-deployed legitimate networks (rural
  2G fallback, in-building DAS). The amber state exists for these;
  we deliberately do not cry-wolf with red.
* Detection is post-hoc. By the time the daemon flags a rogue tower,
  the IMSI is already pinned. The defense is the user response
  (airplane mode, Faraday bag), not detection itself.
