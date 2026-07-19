# Flashing LETHE on bramble (Pixel 4a 5G) — A/B runbook

First modern-device flash procedure. bramble is **A/B, dynamic-partition,
recovery-as-boot** (`AB_OTA_UPDATER := true`, `BOARD_SUPER_PARTITION`,
recovery lives in the boot ramdisk) — none of the Note II / cm-14.1 TWRP
steps in `v1.0.0-build-notes.md` apply. Use this instead for any
redbull-family / modern Pixel target.

## Preconditions

- OEM unlocking enabled on device: Settings → System → Developer options →
  "OEM unlocking" ON. Verify: `adb shell getprop sys.oem_unlock_allowed`
  returns `1`. (bramble test unit: confirmed 2026-07-18.)
- Build artifacts present in `out/target/product/bramble/`:
  `lineage-*-bramble.zip` (the sideloadable OTA), plus `boot.img` and
  `recovery.img`.
- `platform-tools` on PATH (`adb`, `fastboot`). USB cable, no hub if
  fastboot is flaky.

## Steps

Unlocking **wipes the device**. It is a test unit, so this is fine — but
it needs a human at the screen for the volume/power confirmation.

```sh
# 1. Reboot to the bootloader.
adb reboot bootloader

# 2. Confirm fastboot sees it.
fastboot devices          # -> 0B201JECB13875  fastboot

# 3. Unlock. Phone shows a warning screen — Mía: Volume to select
#    "Unlock the bootloader", Power to confirm. WIPES USERDATA.
fastboot flashing unlock

# 4. Device wipes and returns to bootloader. Confirm still connected.
fastboot devices

# 5. Temporarily BOOT the LineageOS recovery (do not flash yet).
fastboot boot out/target/product/bramble/recovery.img

# 6. In LineageOS recovery: Factory reset -> Format data/factory reset
#    (mandatory once after unlock — userdata is encrypted with the old
#    key and must be wiped before the new system boots).

# 7. Apply update -> Apply from ADB, then sideload the OTA. For an A/B
#    device this writes the inactive slot and flips the active slot on
#    success; dynamic partitions are resized automatically.
adb sideload out/target/product/bramble/lineage-*-bramble.zip

# 8. Reboot to system. First boot is slow (dexopt) — allow up to ~10 min
#    before suspecting a bootloop. Subsequent boots are ~30-60s.
```

Leave the bootloader **unlocked** — a degoogled ROM cannot pass Verified
Boot with the stock key, and re-locking on a custom image can hard-brick.

## Post-boot organ verification

The payoff test — the organ loop's Tor violation should now clear, the
inverse of the stock-phone run (`docs/agent/organs.yaml`).

```sh
# Tor transparent proxy is now a real service (was "unset" on stock):
adb shell getprop init.svc.lethe_tor          # -> running

# The bundled agent is live as a system service:
adb shell pidof lethe-agent
adb shell 'logcat -d | grep "organs: tick"'   # arousal/interval/reason lines

# Expected on a healthy Lethe boot: NO tor violation (the standing Alert
# from the stock run is gone), so the loop should decay Alert -> Drowsy ->
# DeepSleep over consecutive quiet ticks — the quiet-decay path that only
# unit tests have exercised so far.
#
# Exercise the sweep live by flipping a watched surface, same as the
# stock-phone test:
adb shell settings put global private_dns_mode off   # -> Alert delta next tick
adb shell settings put global private_dns_mode opportunistic
```

If Tor is *not* running post-boot, that is a real finding (sepolicy denial
or init failure), not an organ bug — check `adb shell dmesg | grep -i
avc` and `logcat -b all | grep lethe_tor` before touching the organ code.
