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

## Device specifics (confirmed from the built tree + LOS wiki data)

- `install_method: fastboot_nexus`, `recovery_partition_name: vendor_boot`.
- **No standalone `recovery.img`** — recovery lives in `vendor_boot.img`
  (`BOARD_MOVE_RECOVERY_RESOURCES_TO_VENDOR_BOOT := true`). An earlier
  draft's `fastboot boot recovery.img` step was wrong for this device.
- Images are in `out/target/product/bramble/`: `boot.img`, `vendor_boot.img`,
  `dtbo.img`, `vbmeta.img` + logical `system/vendor/product/system_ext.img`.
- **Never flash the Qualcomm firmware images** (`modem/tz/abl/aop/xbl/...`).
  LineageOS runs on the stock firmware; flashing these can hard-brick.

## Steps

Unlocking **wipes the device**. Test unit, so fine — but needs a human at
the screen for the volume/power confirmation. All commands run against the
built tree (`cd out/target/product/bramble` first). **Verify live before
executing** — this is brick-risk; confirm slot/partitions with
`fastboot getvar current-slot` and `fastboot getvar all` once connected.

```sh
# 1. Reboot to the bootloader, confirm fastboot sees it.
adb reboot bootloader
fastboot devices                 # -> 0B201JECB13875  fastboot

# 2. Unlock (Mía: Volume to select "Unlock the bootloader", Power to
#    confirm). WIPES USERDATA. Device returns to bootloader.
fastboot flashing unlock

# 3. Flash the LineageOS boot chain (recovery is inside vendor_boot).
fastboot flash boot boot.img
fastboot flash dtbo dtbo.img
fastboot flash vendor_boot vendor_boot.img
#    vbmeta with verity/verification disabled — an unsigned custom build
#    fails Verified Boot otherwise.
fastboot flash vbmeta --disable-verity --disable-verification vbmeta.img

# 4. Boot into the just-flashed LineageOS recovery.
fastboot reboot recovery

# 5. In recovery: Factory reset -> Format data/factory reset (mandatory
#    once after unlock — old userdata is encrypted with the old key).

# 6. Apply update -> Apply from ADB, then sideload the OTA. For an A/B
#    device this writes the inactive slot and flips it on success;
#    dynamic (super) partitions are resized automatically.
adb sideload lineage-22.1-20260719-UNOFFICIAL-bramble.zip

# 7. Reboot to system. First boot is slow (dexopt) — allow ~5-10 min
#    before suspecting a bootloop. Subsequent boots are ~30-60s.
```

Fallback if sideload misbehaves: flash images directly instead of steps
4-6 — `fastboot reboot fastboot` (into fastbootd), then `fastboot flash
system system.img`, `vendor`, `product`, `system_ext`, then `fastboot -w
reboot`. Prefer sideload; it handles super sizing automatically.

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
