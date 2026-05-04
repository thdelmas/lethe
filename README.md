# LETHE

**Logical Erasure & Total History Elimination** — a privacy-hardened Android overlay on LineageOS.

LETHE is named after the river of forgetting in Greek mythology. It's an overlay applied at build time to LineageOS — not a fork — that adds burner mode, identity rotation, hardened DNS, tracker blocking, and an AI guardian baked into the OS as a system service. The phone forgets by default. That's the point.

- **Release notes:** [docs/RELEASE-v1.0.0.md](docs/RELEASE-v1.0.0.md)
- **Privacy policy and disclaimers:** [PRIVACY.md](PRIVACY.md)
- **Internal docs index:** [docs/README.md](docs/README.md)

## What ships in v1.0

- **Burner mode** — every reboot wipes user data, internal storage, WiFi/Bluetooth credentials, clipboard, and notification log. MAC, Android ID, and device serial rotate on each cycle. On by default; user-disabled in Settings.
- **Dead Man's Switch** — opt-in escalation chain (lock → wipe → optional brick) on missed check-in. Duress PIN supported. Configured in the first-boot wizard.
- **Mesh signaling (preview)** — short-range BLE heartbeat between devices in your trust ring as a transport for the dead man's switch only. No chat, voice, or files cross the mesh. Off by default. For real conversations, install [Briar](https://briarproject.org) or [Molly-FOSS](https://molly.im).
- **Panic wipe** — 5× power button press triggers wipe with a 5-second cancel window.
- **Debloat** — Google Play Services, Play Store, GSF, Maps, YouTube, TTS, setup wizard removed at build time.
- **Tracker blocking** — system-level hosts file from StevenBlack and AdAway, refreshed weekly.
- **Hardened DNS** — Quad9 DNS-over-TLS primary, Mullvad fallback, cleartext DNS rejected.
- **IPFS OTA** — firmware updates resolved via signed IPNS, fetched via Tor SOCKS, Ed25519-verified.
- **Void launcher** — minimalist home screen: clock, mascot, gestures. No icons, no widgets, no search bar.
- **AI guardian** — system-service agent (`org.osmosis.lethe.agent` on `localhost:8080`). Cloud LLMs via user-supplied keys; local on-device models in v1.1.

## Supported devices

26 devices across 8 brands — Samsung, Google Pixel, Nothing, Fairphone, OnePlus, Xiaomi, Motorola, Sony. Includes legacy LineageOS 14.1 builds for the Samsung Galaxy Note II (2012). Full list and per-device notes: [manifest.yaml](manifest.yaml).

## Building

LETHE is an overlay applied to a LineageOS source tree at build time. The source tree itself is never modified.

```bash
# 1. Sync LineageOS 22.1
repo init -u https://github.com/LineageOS/android.git -b lineage-22.1 --depth=1
repo sync -c -j$(nproc) --force-sync --no-clone-bundle --no-tags

# 2. Apply LETHE overlays
./apply-overlays.sh <codename>

# 3. Build
source build/envsetup.sh && lunch lineage_<codename>-user && mka bacon

# 4. Sign and package
./scripts/sign-build.sh <codename>
./scripts/generate-ota.sh <codename>
```

Codenames are listed in [manifest.yaml](manifest.yaml). Signing keys are not committed (`keys/` is gitignored).

## Repository layout

See [CLAUDE.md](CLAUDE.md) for the architecture overview. In short:

- `manifest.yaml` — single source of truth for devices and features
- `overlays/` — declarative configs baked into the system image
- `initrc/` — Android `init.rc` services for burner, dead-man, Tor, IPFS, agent
- `static/` — agent WebView UI (Void launcher, mascot, chat)
- `scripts/` — build and runtime helpers
- `docs/` — internal documentation (agent, security roadmap, research, audits)

## Contributing

Run `bash scripts/setup-hooks.sh` after cloning to install pre-commit hooks. Conventional commits (`type(scope): description`). Shell scripts must pass `shellcheck` and `set -euo pipefail`. Files are capped at 500 lines.

## License

GPL-3.0 — see [LICENSE](LICENSE).

---

Check your local laws regarding encryption and privacy software before installing. Some jurisdictions restrict or prohibit Tor, VPNs, encryption tools, or AI systems. Full disclaimers in [PRIVACY.md](PRIVACY.md).
