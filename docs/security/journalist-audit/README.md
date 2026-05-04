# Journalist-audit design docs

Design and feasibility write-ups produced in response to the journalist
threat-model audit (2026-04-15). Each doc maps to a tracking issue.

Ordered by impact:

| # | Doc | Issue | Status |
|---|---|---|---|
| 1 | [Per-session encryption keys](per-session-keys.md) | [#101](https://github.com/thdelmas/lethe/issues/101) | promote P2 → P0, prototype on Pixel 7a |
| 2 | [USB data lockout backport](usb-data-lockout.md) | [#99](https://github.com/thdelmas/lethe/issues/99) | three-layer patch, before next release |
| 3 | [Remote DMS / wipe trigger channel](remote-dms-channel.md) | [#103](https://github.com/thdelmas/lethe/issues/103) | Tor v3 onion, Ed25519-signed commands |
| 4 | [IMSI-catcher detection](imsi-catcher-detection.md) | [#105](https://github.com/thdelmas/lethe/issues/105) | `lethe-cellguard` daemon, tier-aware |
| 5 | [Hidden volumes / plausible deniability](hidden-volumes.md) | [#102](https://github.com/thdelmas/lethe/issues/102) | proceed cautiously, opt-in only |

Each doc includes threat model, approach, prototype plan, acceptance
mapping back to the issue, and an honest residual-risks section.
