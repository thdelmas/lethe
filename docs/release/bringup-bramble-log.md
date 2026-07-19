# bramble bring-up log (Pixel 4a 5G) — running record

A step-by-step log of flashing LETHE onto bramble, kept so the process
consolidates across attempts. Newest attempt at the bottom. Pairs with the
procedure in `flash-bramble-ab.md` and the build fixes in
`bramble-modern-port-notes.md`. When a step's outcome contradicts the
runbook, fix the runbook and note it here.

## Device facts (fixed)

- Serial `0B201JECB13875`, codename bramble, redbull platform, A/B,
  dynamic partitions (super), recovery-in-`vendor_boot`.
- `install_method: fastboot_nexus`. Bootloader does NOT support
  `fastboot reboot recovery` ("Unsupported reboot option") — reach
  recovery via the bootloader menu (Volume to "Recovery mode", Power) or
  `fastboot oem reboot-recovery`.
- Was on **stock Android 14** before flashing. LETHE build is
  lineage-22.1 = **Android 15**.

## Attempt 1 — 2026-07-19 (first flash of the modern build)

Sequence run and outcomes:

1. `adb reboot bootloader` → OK, `fastboot devices` sees it.
2. Bootloader unlock: `sys.oem_unlock_allowed=1` but `ro.boot.flash.locked=1`
   (OEM-unlock *permission* on, bootloader still *locked*).
   `fastboot flashing unlock` → OKAY; device wiped + rebooted; USB dropped
   several minutes (booted to stock setup, adb deauthorized). Re-entered
   bootloader by hardware keys. `fastboot getvar unlocked` → **yes**. ✅
3. Flashed boot chain to slot A (all OKAY):
   `fastboot flash boot boot.img`, `flash dtbo dtbo.img`,
   `flash vendor_boot vendor_boot.img`,
   `flash vbmeta --disable-verity --disable-verification vbmeta.img`.
4. `fastboot reboot recovery` → **FAILED** "Unsupported reboot option".
   Pivoted to fastbootd for direct image flash instead of sideload.
5. `fastboot reboot fastboot` → fastbootd (`is-userspace: yes`,
   `super-partition-name: super`, slot a). Flashed logical partitions
   (all OKAY): `flash system system.img`, `flash vendor vendor.img`,
   `flash product product.img`, `flash system_ext system_ext.img`.
6. `fastboot -w reboot` → metadata erased (no `cache` partition on A/B;
   "not automatically formatting / raw not supported" is benign — OS
   formats /data on boot). Rebooted.
7. **Boot FAILED: "no valid slot to boot."** Slot metadata:
   `slot-unbootable:a: yes`, `slot-retry-count:a: 0`. The flash never set
   slot A bootable. Fix: `fastboot set_active a` → `unbootable:a: no`,
   `retry-count: 3`. ✅ (Runbook updated: always `set_active a` after a
   fastbootd image flash.)
8. Reboot → **boot FAILED**: burned all 3 retries (~90s each), fell back
   to fastboot, slot A `unbootable` again. ~90s/attempt = kernel starts,
   fails in early boot (not an instant vbmeta rejection).
9. Suspected verity chain. Flashed `vbmeta_system` +
   re-flashed `vbmeta`, both `--disable-verity --disable-verification`;
   `set_active a`; reboot → **still FAILED** (~306s, fell back). Verity
   chain ruled OUT.
10. `fastboot oem reboot-recovery` → device left fastboot; adb now sees it
    `unauthorized` (adbd running — booted into Android or recovery).
    [in progress — awaiting on-screen state]

### Working hypotheses for the boot failure (attempt 1)

- **H1 (most likely): firmware mismatch.** Device firmware (bootloader,
  radio, modem, abl, tz — the QC images we correctly did NOT flash) is
  Android-14-era; lineage-22.1 vendor expects Android-15 firmware.
  LineageOS Pixel installs require updating to latest stock first. Fix:
  flash bootloader + radio from a compatible bramble stock factory image,
  or the firmware from an Android-15 build, then re-flash LETHE.
- **H2: LETHE overlay breaks boot.** A bad init service (tor/agent/burner
  rc), or an sepolicy denial on a critical path under enforcing. Would be
  confirmed if a *vanilla* lineage-22.1 bramble build boots but ours does
  not. Distinguish via the boot log (pstore / last_kmsg from recovery).

### Diagnostic results (attempt 1, continued)

11. `fastboot oem reboot-recovery` **worked** — booted LETHE recovery
    (adb state `recovery`, `/sbin/recovery` present). Confirmed genuine
    LETHE build: `ro.build.display.id = LETHE-1.0.0-20260719-3134e9b`
    (the fingerprint override DID land — earlier "stock id" read was the
    wrong build.prop). Needed on-screen "Allow USB debugging" tap.
12. **Recovery boots fine ⇒ kernel + vendor_boot are good.** The failure
    is specifically the **Android system boot**, in **userspace** — no
    kernel panic: `/sys/fs/pstore/` is EMPTY (a kernel oops would leave
    console-ramoops). A userspace init/HAL crash-loop reboots without a
    ramoops. Boot reason: `reboot,recovery`.
13. Device firmware: bootloader `b5-0.6-10489838` (Android-14 era),
    `verifiedbootstate: orange` (unlocked, expected).

### Verdict: firmware mismatch (H1) is the leading cause

Recovery-boots + userspace-fail + no-panic + device on A14 firmware while
the build is A15 = the textbook LineageOS-Pixel requirement: **you must be
on current stock firmware before flashing.** The QC firmware partitions we
(correctly) never flashed — bootloader, radio, modem, abl, tz, etc. — are
A14; lineage-22.1 vendor/HALs expect A15. The system boot fails when the
A15 vendor HALs hit A14 firmware.

Not fully excluded: an overlay boot-break (H2). But recovery booting and
no kernel panic make a kernel/sepolicy-load failure unlikely; the strong
prior is firmware.

### Fix for next attempt (do this first)

1. Get the bramble **stock factory image** for a build matching
   lineage-22.1 (Android 15 / AP4A.*). NOTE: Pixel firmware is
   **Google-hosted only** — no self-owned source exists for it; this is an
   unavoidable Google dependency for flashing a Pixel. Decide if that's
   acceptable before proceeding.
2. From the factory zip, flash ONLY the firmware, not the stock system:
   `fastboot flash bootloader bootloader-bramble-*.img` (both slots),
   `fastboot reboot bootloader`,
   `fastboot flash radio radio-bramble-*.img` (both slots),
   `fastboot reboot bootloader`.
   (Or run the factory `flash-all.sh` with `-w` removed and stop before it
   flashes the stock images — simplest is to flash bootloader + radio
   only, then our LETHE partitions.)
3. Re-flash LETHE: boot, dtbo, vendor_boot, vbmeta (+vbmeta_system) with
   `--disable-verity --disable-verification`, then fastbootd
   system/vendor/product/system_ext, then `fastboot set_active a`,
   `fastboot -w reboot`.
4. If it STILL fails to boot with matching firmware → H2 (overlay). Then
   pull `adb logcat` from the failed boot and audit our init rc / sepolicy.

### Device left in: LETHE recovery (stable). Safe to power off or reboot
### to bootloader. Nothing further wiped.
