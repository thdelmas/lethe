# App Broker — Agent-Mediated App Installation

LETHE agent as a privacy-aware app broker: unified interface for discovering,
evaluating, and installing apps from multiple sources.

## Problem

Users need apps from Google Play but LETHE removes Google Play Services.
F-Droid covers open-source apps; Aurora Store covers Play Store anonymously.
But neither is agent-integrated — the user must context-switch to a separate
app store, search manually, and judge privacy trade-offs alone.

## Architecture

```
User: "install Signal"
       |
       v
  LETHE Agent (localhost:8080)
       |
       +---> 1. Check F-Droid repo (preferred — FOSS, no tracking)
       |        API: f-droid.org/api/v1/ or local index
       |
       +---> 2. Check IPFS app repo (lethe-apps IPNS channel)
       |        Manifest: per-app CID + APK signature hash
       |
       +---> 3. Check Google Play (anonymous)
       |        Library: gplayapi (Aurora Store's API library)
       |        Auth: disposable anonymous tokens, rotated per session
       |        Transport: routed through Tor (transparent proxy)
       |
       v
  Privacy Evaluation
       |
       +---> Exodus Privacy tracker count
       +---> Permission analysis (camera, mic, location, contacts)
       +---> Network behavior (known phoning-home domains vs hosts blocklist)
       +---> F-Droid Anti-Features flags (if available)
       |
       v
  Agent Response
       "Signal is on F-Droid (0 trackers) and Play Store (2 trackers).
        Installing from F-Droid. No unusual permissions."
       |
       v
  Install via pm install / session API
```

## Source Priority

1. **F-Droid** — always preferred. FOSS, reproducible builds, no tracking.
2. **IPFS repo** — LETHE-curated apps with pinned versions and signatures.
3. **Google Play (anonymous)** — fallback for proprietary apps not on F-Droid.

Agent explains *why* it chose a source and lets user override.

## Anonymous Play Store Access

### Protocol

Google Play uses a protobuf-based HTTPS API. The gplayapi library
(used by Aurora Store, MIT-licensed) provides:

- **Device spoofing**: crafts headers with valid build fingerprints, locale,
  device properties so Google's servers treat requests as legitimate.
- **Anonymous auth**: generates disposable tokens without a Google account.
  No identity tied to downloads.
- **Token rotation**: sessions are short-lived, rotated to limit correlation.

### Integration Points

| Component | Role |
|-----------|------|
| `gplayapi` (Python/Java) | Search, metadata, APK download URLs |
| Tor transparent proxy | All API calls exit through Tor — Google sees exit node, not device |
| Exodus Privacy API | Tracker/permission analysis before install |
| `pm install` | System-level install (LETHE agent runs as system service) |

### Privacy Guarantees

- **No Google account required** for free apps.
- **No Google Play Services** on device — no persistent framework phoning home.
- **Tor-routed** — Google cannot correlate device IP across sessions.
- **Token rotation** — even anonymous tokens are short-lived.
- **Circuit isolation** — Play Store traffic uses its own Tor circuit
  (already configured in manifest.yaml `circuit_isolation: true`).

## Agent UX

### Conversational Install

```
User: "I need a password manager"
Agent: "I'd recommend KeePassDX (F-Droid, 0 trackers, offline-only)
        or Bitwarden (Play Store, 3 trackers, cloud sync).
        KeePassDX keeps everything on-device. Want that?"
User: "yeah"
Agent: "Installing KeePassDX from F-Droid... done.
        Tip: it can import from other password managers."
```

### Privacy Warnings

```
User: "install facebook"
Agent: "Facebook has 37 trackers (Exodus Privacy) and requests:
        - Camera, microphone, contacts, location, call logs
        - Background location (blocked by LETHE defaults)
        If you proceed, I'll install it in a Shelter work profile
        so it can't access your main profile data. Continue?"
```

### Update Management

Agent can check for updates across all sources:
- F-Droid: index refresh (already built into F-Droid client)
- Play Store: version comparison via gplayapi
- IPFS: IPNS manifest refresh (already built into OTA system)

## Implementation Phases

### Phase 1: Aurora Store as system app (NOW)
- Added to `manifest.yaml` pre-installed apps
- Zero code — just ships with the ROM
- Tor routing automatic via transparent proxy
- Users get Play Store access immediately

### Phase 2: Agent search + recommendations
- Agent queries F-Droid index + Exodus API
- "What's a good X?" returns curated suggestions with privacy scores
- No Play Store integration yet — just knowledge + F-Droid

### Phase 3: Agent-mediated Play Store
- Integrate gplayapi into agent backend
- Anonymous token management as background service
- Agent installs from best source with privacy rationale
- Shelter auto-isolation for high-tracker apps

### Phase 4: IPFS app repo
- Curated LETHE app channel via IPNS
- Pinned versions with signature verification
- Offline sideload via CAR files (sneakernet)
- Agent prefers IPFS versions when available

## Dependencies

- **gplayapi**: [Aurora's Play Store API library](https://gitlab.com/AuroraOSS/gplayapi)
  — Java/Kotlin, would need Python bindings or JNI bridge from agent backend.
  Alternative: [googleplay-api (Python)](https://github.com/NoMore201/googleplay-api)
  — pure Python, simpler integration, less maintained.
- **Exodus Privacy API**: `https://reports.exodus-privacy.eu.org/api/`
  — public REST API, no auth needed, returns tracker list per package.
- **F-Droid index**: `https://f-droid.org/repo/index-v2.json`
  — public, refreshed daily, contains all app metadata.

## Open Questions

- Should agent auto-update Play Store apps, or only F-Droid? (Privacy vs convenience)
- Token pool: should LETHE run a shared anonymous token service, or per-device?
  (e/OS runs a server-side token dispenser — reduces Google rate-limiting per device)
- How to handle paid apps? Require Google account sign-in, scoped to Shelter profile?
- gplayapi is Java/Kotlin — bridge to Python agent, or rewrite critical paths?
