# LETHE SELinux Policy

Custom SELinux domain for LETHE init services.

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
called from `apply-overlays.sh` step 12/17. Target directories tried in order:
`device/lineage/sepolicy/vendor`, `device/lineage/sepolicy/common`, then
`device/lineage/sepolicy`. Falls back to `vendor/lethe/sepolicy` for trees
without a device/lineage overlay.

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
