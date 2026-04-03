# LETHE

L.E.T.H.E. (Logical Erasure & Total History Elimination) — privacy-hardened Android overlay on LineageOS.

## Architecture

```
manifest.yaml           Device list, feature definitions, build pipeline
apply-overlays.sh       Applies overlays to LineageOS source tree at build time
overlays/               Config files baked into system image
  privacy-defaults.conf   System properties (DNS, NTP, sensors, encryption)
  firewall-rules.conf     nftables default-deny rules
  burner-mode.conf        Ephemeral wipe-on-boot settings
  dead-mans-switch.conf   Missed check-in escalation config
  hosts                   Tracker/ad blocking hosts file
  theme-lethe.conf        Teal-on-black UI theme + lockscreen + minimalism props
  launcher.conf           Void launcher — minimalist gesture-driven home screen
initrc/                 Android init.rc templates (copied to source tree at build time)
  init.lethe-burner.rc   Burner mode early-init wipe service
  init.lethe-deadman.rc  Dead man's switch boot-time enforcement
  init.lethe-tor.rc      Tor transparent proxy + iptables rules
  init.lethe-ipfs.rc     IPFS OTA update daemon
  init.lethe-agent.rc    LETHE agent backend + assist registration
bootanimation/          Boot animation generator, wallpaper generator, ZIP
static/                 Agent WebView UI assets
  mascot.css              Mascot 2D layer animations (idle, listening, thinking, speaking, alert)
  mascot-3d.css           3D transforms, body movement, parallax depth, particles, expressions
  mascot-interact.js      Gyroscope parallax, eye gaze tracking, touch reactions, ambient awareness
  launcher.html           Void launcher — clock, mascot, gestures, chat. One page IS the OS.
  launcher.css            Launcher styles — home screen, clock, mascot, chat panel
  launcher.js             Launcher logic — clock, views, chat, provider routing, gestures
  mascot-home.html        (deprecated — merged into launcher.html)
  conversation.html       (deprecated — merged into launcher.html)
scripts/                Build and runtime scripts
  lethe-ota-update.sh    On-device OTA updater (IPNS resolve, verify, download, apply)
docs/                   Internal docs (see docs/README.md for full index)
  agent/                  Agent personality, safety, LLM routing, onboarding
  design/                 Hardware tiers, mascot visuals, competitive gaps
  security/               Hardening roadmap (GrapheneOS bridge)
  research/               Protocol surveys — IPFS, anonymity, off-grid, pop culture
```

## Conventions

- Shell scripts: bash, `set -euo pipefail`, shellcheck clean.
- YAML for config. manifest.yaml is the single source of truth for devices and features.
- 500-line file limit enforced by pre-commit hooks.
- Conventional commits: `type(scope): description` (feat, fix, refactor, docs, test, chore).
- Run `bash scripts/setup-hooks.sh` after cloning to install git hooks.
- Run `bash scripts/code-quality-check.sh` to check quality manually.
- Overlay files are system properties or config — not executable code. Keep them declarative.
- apply-overlays.sh step numbers must stay sequential. Update counts when adding/removing steps.
- Never commit signing keys. keys/ is gitignored.
- This is a private repo. Do not reference internal details in public repos.

## Adding a device

1. Ensure LineageOS supports the codename
2. Add codename to `devices:` list in manifest.yaml
3. If the device needs a different base version, use the object form with `codename:` and `base_version:`
4. Test build with `apply-overlays.sh <codename>`

## Key design decisions

- Overlay-based, not a fork. We never modify LineageOS source directly.
- Burner mode ON by default. User disables it, not enables it.
- Dead man's switch OFF by default. First-boot wizard asks explicitly.
- LETHE is both the OS and the agent — no separate AI app. Package: org.osmosis.lethe.agent. System service on localhost:8080.
- The agent backend source lives in the bender/ submodule (legacy repo name) but is installed as LETHE. Use AGENT_DIR or LETHE_DIR to locate it.
- ADB secure by default (ro.adb.secure=1) — see docs/SECURITY-ROADMAP.md P0.
