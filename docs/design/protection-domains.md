# LETHE Protection Domains — Investigation

**Date:** 2026-04-05
**Purpose:** Map the full scope of what a guardian agent OS can protect for
its owner, beyond device/OS management.

---

## Confirmed Modules

These are committed directions. LETHE will propose them as integrated
offerings during onboarding.

### Bios — Protect Your Health

Health data sovereignty and wellness awareness.

- **Medical data access:** OSCAR (CPAP), xDrip+ (CGM), Gadgetbridge
  (wearable vitals) — no cloud accounts required
- **EXIF/metadata stripping** on health-related photos before sharing
- **Emergency info:** lockscreen medical card (allergies, blood type,
  emergency contacts) — accessible without unlock
- **Sensor privacy:** default-deny camera/mic/location prevents health
  apps from over-collecting
- **Local-first:** health data never leaves the device unless user
  explicitly exports

**Status:** Conceptual. Some primitives exist (EXIF stripping in
SECURITY-ROADMAP P1, sensor permissions).

### PreuJust — Protect Your Money

Financial awareness and fraud prevention.

- **Phishing detection:** flag suspicious URLs in SMS/email before user
  taps (heuristic on shallow, vision model on deeproot)
- **Permission audit:** warn when a financial app requests contacts,
  SMS, or accessibility — common vectors for banking trojans
- **Subscription tracking:** surface recurring charges from bank
  notifications (local NLP, never cloud-processed)
- **Scam call screening:** caller ID lookup against community-sourced
  spam databases (local DB, no cloud API)
- **Payment screen guardian:** on deeproot, vision model flags deceptive
  payment dialogs or modified amounts
- **No financial advice:** LETHE never recommends investments, moves
  money, or optimizes spending — it only guards against threats

**Status:** Conceptual. Phishing detection partially addressed by
tracker/ad blocking (hosts file). Vision model gated on Gap #8.

---

## Candidate Domains

Ranked by alignment with LETHE's guardian identity, feasibility across
device tiers, and user demand.

### Tier 1 — Strong fit, buildable now

#### 1. Privacy & Identity

*"Know who's watching. Control what leaks."*

- **Breach monitoring:** check email/username against HIBP-style
  databases (local bloom filter, no API call with raw credentials)
- **Password hygiene:** detect reused passwords in exported vaults
  (KeePassXC integration), never store passwords itself
- **Tracker report:** daily/weekly summary of blocked trackers, DNS
  queries, and Tor circuit usage — the guardian's patrol log
- **Permission drift alert:** notify when an app update adds new
  permissions (compare pre/post-update manifests)
- **Account cleanup suggestions:** surface accounts the user hasn't
  accessed in 12+ months (from browser history, if opted in)

**Why Tier 1:** Most primitives already exist (Tor, firewall, tracker
blocking, permission system). This is packaging + UX, not new infra.

#### 2. Time & Attention

*"Your focus is yours. Dark patterns are not."*

- **Notification triage:** classify notifications by urgency (local NLP).
  Deliver critical immediately, batch low-priority for digest.
- **Dark pattern detection:** on deeproot, vision model flags infinite
  scroll, countdown timers, fake "limited offer" UI patterns
- **Screen time awareness:** opt-in daily/weekly report. Never
  gamified, never guilt-inducing. Just data.
- **Focus mode:** one-tap silence for configurable duration. Only
  emergency contacts and LETHE security alerts break through.
- **App usage transparency:** show which apps used network, camera,
  mic, GPS in the last 24h — always available, never hidden

**Why Tier 1:** Notification filtering and usage stats are OS-level
capabilities. Android already tracks most of this; LETHE surfaces it
honestly instead of burying it.

#### 3. Digital Legacy

*"When you're gone, your data follows your wishes — not a corporation's."*

- **Dead man's switch integration** (already in LETHE): missed
  check-ins trigger configurable escalation
- **Legacy contacts:** designate trusted people who receive encrypted
  exports if DMS triggers
- **Account inventory:** list of accounts and instructions per account
  (delete, transfer, memorialize) — stored encrypted in /persist
- **Posthumous message vault:** encrypted messages released to
  designated recipients on DMS trigger
- **Wipe-on-trigger:** option to wipe device completely instead of
  (or in addition to) releasing data

**Why Tier 1:** Dead man's switch already exists. Legacy contacts and
wipe-on-trigger are extensions of existing escalation logic. Aligns
deeply with River Lethe (forgetting) theme — choosing what survives.

---

### Tier 2 — Good fit, needs new capabilities

#### 4. Physical Safety

*"A guardian that knows when to call for help."*

- **Emergency SOS:** hardware button combo triggers emergency call +
  GPS to trusted contacts (not cloud service)
- **Location sharing:** opt-in, time-limited, encrypted sharing with
  chosen contacts via Briar/Signal/SimpleX
- **Travel mode:** crossing a geofence triggers preset actions (enable
  VPN, disable biometrics, switch to burner profile)
- **Duress detection:** secondary unlock code that opens a decoy
  profile while silently triggering DMS

**Why Tier 2:** Requires reliable location services (which LETHE
intentionally restricts), geofencing logic, and hardware button
interception at init level.

#### 5. Legal Rights

*"Know your rights before you need them."*

- **Jurisdiction-aware rights cards:** offline database of rights during
  police stops, border crossings, protests — by country/state
- **Document scanner:** photograph documents, OCR locally, store
  encrypted (contracts, receipts, IDs)
- **Warrant canary** (already in SECURITY-ROADMAP P3): cryptographic
  proof the device hasn't been served a secret order
- **Legal contacts:** quick-dial list for lawyers/legal aid, separate
  from general contacts

**Why Tier 2:** Rights database requires significant curation effort
per jurisdiction. OCR needs vision model (deeproot) or external
processing.

#### 6. Relationships & Social

*"Protect yourself from manipulation, not from people."*

- **Scam detection:** flag common social engineering patterns in
  messages (urgency + money + stranger = red flag)
- **Catfishing alerts:** reverse image search of profile pictures
  (on-device, against local cache of known scam images)
- **Manipulation pattern recognition:** flag escalating isolation
  tactics in message history (opt-in, deeply sensitive)

**Why Tier 2:** NLP classification at this level requires capable
models (taproot minimum). False positives in relationship analysis
are dangerous — LETHE must never make accusations, only surface
patterns for the user to interpret. See boundaries.yaml.

---

### Tier 3 — Interesting, needs research

#### 7. Home & Property

*"Your home network is your perimeter."*

- **IoT audit:** scan LAN for devices, identify manufacturers, flag
  known-vulnerable firmware (reuse Gladys integration, Gap #3b)
- **Smart home guardian:** Gladys bridge monitors for anomalous device
  behavior (camera activating at unusual times, lock state changes)
- **Network intrusion alerts:** ARP scan + traffic anomaly detection
  on home WiFi (nftables + eBPF, SECURITY-ROADMAP P2)

**Why Tier 3:** Requires Gladys integration (Gap #3b), reliable LAN
scanning from a phone, and low false-positive anomaly detection.

#### 8. Knowledge & Information

*"Don't believe everything. Verify."*

- **Source verification:** check URLs against known misinformation
  databases (local bloom filter)
- **Provenance tagging:** ProofMode integration (already in research)
  for photos/videos — cryptographic proof of when/where captured
- **Content transparency:** flag AI-generated text/images when
  detectable (C2PA metadata, heuristic analysis)

**Why Tier 3:** Misinformation classification is politically loaded.
LETHE must flag provenance and sources, never label content as
"true" or "false" — that's the user's judgment. ProofMode is the
safest starting point.

#### 9. Reputation

*"Know what the internet says about you."*

- **Name monitoring:** periodic search for user's name/handles across
  public sources (via Tor, no tracking)
- **Impersonation alerts:** flag new accounts using the user's name
  or photos
- **Deepfake detection:** analyze images/videos of the user for
  manipulation artifacts

**Why Tier 3:** Requires regular internet access (conflicts with
minimal-network philosophy), image analysis capabilities, and careful
handling of surveillance-adjacent features.

---

## Anti-Patterns — What LETHE Must NOT Do

These are protection-adjacent features that violate LETHE's ethics:

| Don't | Why |
|-------|-----|
| Optimize spending or suggest budgets | LETHE guards, doesn't advise |
| Gamify health metrics | No streaks, no guilt, no behavioral nudges |
| Score or rate relationships | Pattern flagging yes, judgment no |
| Track location continuously | Only on explicit, time-limited opt-in |
| Store biometric data | Never. Not even locally. |
| Predict behavior | LETHE reacts to threats, doesn't model the user |
| Compete with professional help | Always suggest doctor/lawyer/therapist over self-diagnosis |

---

## Naming Convention

Modules follow a pattern: short evocative name + "Protect your X"
tagline.

| Module | Tagline | Domain |
|--------|---------|--------|
| **Bios** | Protect your health | Health & wellness |
| **PreuJust** | Protect your money | Financial safety |
| **Mnemo** | Protect your legacy | Digital legacy & DMS |
| **Vigil** | Protect your privacy | Identity & data |
| **Hora** | Protect your time | Attention & focus |
| **Egida** | Protect your safety | Physical safety |
| **Themis** | Know your rights | Legal awareness |
| **Oikos** | Protect your home | IoT & network |

*Names draw from Greek/Latin roots to match LETHE (Greek: forgetfulness)
and Bios (Greek: life). Mnemo from Mnemosyne (memory) — counterpart
to Lethe. Vigil (Latin: watchful). Hora (Greek: time). Egida (aegis,
shield). Themis (Greek: justice). Oikos (Greek: home/household).*

---

## Cross-Cutting Concerns

Every protection module must respect:

1. **Tier degradation** — shallow devices get heuristics, not ML.
   Every module must have a shallow-tier fallback.
2. **Opt-in only** — no module activates without explicit consent
   during onboarding or later in settings.
3. **Local-first** — no module phones home. Period.
4. **Auditable** — every module's data and decisions are inspectable
   by the user in plain text.
5. **Boundaries** — every module respects boundaries.yaml. No
   manipulation, no dependency creation, no behavior optimization.
6. **Burner mode** — every module's data is wiped in burner mode
   unless explicitly persisted by the user.
