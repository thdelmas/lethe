# LETHE SELinux Policy

Custom SELinux domain for LETHE init services.

> **v1.0 status — partial (Tor only).** `tor.te` + `file_contexts` ship active.
> `lethe.te.disabled-in-v1.0` and `file_contexts.disabled-in-v1.0` retain the
> full LETHE labeling for v1.1 reference. The May-4 zygote-crash claim that
> motivated the original strip was made under the same misframing as the
> bisect (see project memory: v1.0.x boot regression resolved 2026-05-09);
> may not have been a real bug. The narrow tor.te is conservative — it covers
> only the Tor binary so we don't re-introduce whatever (if anything) was
> wrong with the broader policy. v1.1 expands to cover burner, mac-rotate,
> tor-rules, tor-pt, settings-applicator. Investigation: [issue #122].
>
> [issue #122]: https://github.com/thdelmas/lethe/issues/122

## Why this exists

On Android 7.1 enforcing SELinux, services declared with `seclabel u:r:init:s0`
in init.rc inherit the init domain, but init cannot `execute_no_trans` to
binaries labeled `system_file`, and shell scripts invoked from init cannot
`setattr` on `/data/*` directories. This silently broke **burner mode** on
GT-N7105 and similar Android 7.1 devices — the wipe service was blocked
by policy and user data persisted across reboot.

## What this does

- Defines a single `lethe` domain covering all LETHE init services:
  burner-wipe, mac-rotate, tor, tor-rules, agent, deadman-{boot,monitor,duress},
  ipfs, ota-check, ota-boot, channels-init, p2p, p2p-mesh
- Labels LETHE binaries and scripts as `lethe_exec` so init can execute them
  and transition into the `lethe` domain automatically (via `init_daemon_domain`)
- Grants permissions needed for the full LETHE feature set: data wipe,
  network/iptables control, property read/write, binder calls to system_server
  (for `settings put secure android_id`)

## Files

- `lethe.te` — domain and allow rules
- `file_contexts` — binary/script labels
- `property_contexts` — `persist.lethe.*` property labels

## Integration

Installed to the LineageOS build tree by `lethe/scripts/install-sepolicy.sh`,
called from `apply-overlays.sh` step 12/17 with the build codename.

Target depends on the source tree:

- **cm-14.1** (`vendor/cm/` present): `device/<vendor>/<codename>/selinux/`,
  picked up by the device tree's existing `BOARD_SEPOLICY_DIRS`. The script
  resolves `<vendor>` by globbing `device/*/<codename>/` and fails loudly if
  the device tree isn't synced — it must not silently fall back, or the OTA
  ships without LETHE's policy and burner mode breaks under enforcement.
- **LineageOS 15.1+** (`device/lineage/sepolicy/` present): tries
  `device/lineage/sepolicy/vendor`, then `.../common`, then `.../sepolicy`.
- **Otherwise**: falls back to `vendor/lethe/sepolicy` (consumer must add it
  to `BOARD_SEPOLICY_DIRS` in BoardConfig.mk).

## Adding new LETHE binaries

1. Add an entry to `file_contexts` labeling the binary as `lethe_exec`
2. Use `seclabel u:r:lethe:s0` in the init.rc service definition
3. If the binary needs permissions not in `lethe.te`, add allow rules here

## Trust boundary

One domain covers all LETHE services. This is a simplification — all LETHE
services are root-owned system services that LineageOS builds include by
default. Splitting into per-service domains would tighten least-privilege
but complicate maintenance. Revisit if a specific service grows beyond the
trust boundary (e.g., an untrusted plugin system).
