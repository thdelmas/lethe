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
  theme-lethe.conf        Dark red UI theme
bootanimation/          Boot animation generator + ZIP
docs/                   Internal docs (security roadmap, etc.)
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
- Bender AI companion embedded as system service (localhost:8080).
- ADB secure by default (ro.adb.secure=1) — see docs/SECURITY-ROADMAP.md P0.
