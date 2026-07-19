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

## Attempt 2 — 2026-07-19 (native OTA sideload, no firmware change)

Reasoning: attempt 1 installed via manual fastbootd partition flash, which
can miss AVB/slot/super subtleties. Reinstall via the blessed LineageOS
path instead — cheaper than the firmware detour and needs no Google image.

1. Device already in LETHE recovery. `adb reboot sideload` → sideload mode
   directly (no menu navigation needed). ✅
2. `adb sideload lineage-...-bramble.zip` → transfer completed (rc 0);
   recovery showed "to install additional packages you need to reboot to
   recovery first" = **successful install** (that message is the LOS
   post-sideload success prompt, not an error).
3. `adb reboot` to system → **got FURTHER than attempt 1**: adbd came up
   (adb `unauthorized` for ~40s) before failing back — i.e. Android
   userspace booted substantially (adbd is past early init) then
   crash-looped, landing in recovery.
4. pstore + pmsg both EMPTY again (userspace crash, no kernel oops).
5. Pre-authorized adb by writing `~/.android/adbkey.pub` to
   `/data/misc/adb/adb_keys` from recovery (to auto-auth and catch logcat
   next boot without the dialog).
6. Re-boot attempts to capture logcat: **boot behaviour was
   nondeterministic** — one attempt fell to fastboot at ~76s with no adbd
   window; the next showed no USB at all. Could not catch a logcat.

### Refined verdict: firmware mismatch (H1), confidence raised

The **nondeterminism** is the key new evidence: a deterministic software
bug (our init/sepolicy overlay) would fail the *same way every boot*.
Boot-to-different-states (adbd/recovery/fastboot/black) across identical
attempts is characteristic of **firmware/hardware-level incompatibility**,
not a code bug. Combined with: recovery always boots (kernel fine), Android
userspace reaches adbd then crash-loops, no kernel panic, device on A14
bootloader `b5-0.6-10489838`. H2 (overlay) is now unlikely — it got past
early init to adbd, and the failure isn't reproducible-identical.

### Required next step (attempt 3): update firmware first

bramble's newest *official* Android is 14, so there is no A15 stock — but
lineage-22.1 is built against the **latest A14 bramble firmware**. If this
device is on an older A14 (or A13) build, that is the mismatch. Update it:

1. Get the **latest** bramble stock factory image (Google-hosted only —
   the standing no-Google caveat applies; `bramble-*` factory zip).
2. Flash firmware only (both slots), NOT the stock system:
   `fastboot flash bootloader bootloader-bramble-*.img; fastboot reboot bootloader`
   `fastboot flash radio radio-bramble-*.img; fastboot reboot bootloader`
   (Or run the factory `flash-all.sh` to get a known-good A14 stock base +
   confirm the hardware boots, then flash LETHE over it — this also
   definitively separates H1 from H2: if stock A14 boots but LETHE doesn't,
   it's H2 after all.)
3. Re-flash LETHE (either fastbootd images + `set_active a`, or preferably
   `adb sideload` the OTA in recovery), then `fastboot -w reboot`.

### Device left in: bootlooping/parked (attempt 2 end). Mía to force-off
### (hold Power ~10s) or Power+VolDown to bootloader. Bootloader still
### unlocked; nothing further wiped. Pick up at attempt 3.

## Attempt 3 — 2026-07-19 (H1 refuted; adb-keys diagnostic build)

Plan was "update stock firmware first" — killed by evidence before any
Google download:

1. **H1 (firmware mismatch) REFUTED.** The vendor blobs the build was made
   from match the device exactly: `abl.img` string
   `OEM_IMAGE_VERSION_STRING=b5-0.1-10489838` vs device bootloader
   `b5-0.6-10489838` (same build 10489838), and vendor MCFG
   `MCFG-g7250-00264-230619-B-10346159-B5R3` == device baseband
   `g7250-00264-230619-B-10346159`. Additionally
   `META/ab_partitions.txt` shows the OTA payload ships ALL firmware
   partitions (abl aop devcfg featenabler hyp keymaster modem qupfw tz
   uefisecapp xbl xbl_config) — attempt 2's sideload already wrote
   matching firmware to its slot. **No Google factory image needed; the
   no-Google line holds at zero cost.** (`android-info.txt` is useless
   here — it only says `require board=bramble`.)
2. **Runbook correction:** `fastboot oem reboot-recovery` is now ALSO
   refused by the bootloader ("Invalid oem command") — contradicts
   attempt 1 step 11. Neither `reboot recovery` nor `oem reboot-recovery`
   works from the hw bootloader. Working remote path: **flash a BCB to
   `misc`** (2048 B: `command[32]="boot-recovery"`,
   `recovery[768]@64="recovery\n"`) + `fastboot reboot` → recovery. ✅
3. Recovery adbd needs the on-screen Allow tap every recovery boot: the
   attempt-2 "seeded adb_keys" is GONE — `/data` cannot be mounted from
   recovery at all (`mount: Invalid argument`, expected under metadata
   encryption). That seed never landed anywhere durable.
4. Our recovery supports `--sideload` / `--sideload_auto_reboot` boot args
   (recovery.cpp:733-734) → BCB `recovery\n--sideload_auto_reboot\n`
   enters sideload (unauthenticated protocol) with no tap. Not yet used;
   noted for fully-remote reflash.
5. Clean-boot test of slot B (attempt-2's complete OTA install, firmware
   included): `set_active b` (retry-count back to 3) + reboot →
   **offline for 265 s (≈3 boot tries), never any adbd window, fell back
   to fastboot.** So a fully self-consistent fresh install with matching
   firmware fails identically. H2 (overlay breaks userspace boot) now
   leads. Stale-/data (H3/H4) weakened: attempt-1's `fastboot -w` had
   already blanked userdata+metadata and boots still failed.
6. **Diagnostic build started:** `PRODUCT_ADB_KEYS := ~/.android/adbkey.pub`
   added to `device/google/bramble/lineage_bramble.mk` (LOCAL EDIT in the
   build tree, not committed — bakes the host pubkey at
   `/product/etc/security/adb_keys`, symlinked as `/adb_keys`, read by
   adbd_auth → no auth dialog on userdebug). Verified chain:
   `build/make/target/product/security/Android.mk`,
   `system/core/rootdir/create_root_structure.mk:37`,
   `frameworks/native/libs/adbd_auth/adbd_auth.cpp:394`.
   Build: `lunch lineage_bramble-ap4a-userdebug && mka bacon` under
   `systemd-run --user --unit=lethe-adbkeys-build`, log
   `build-adbkeys.log`.
7. Next once built: BCB → sideload_auto_reboot → `adb sideload` new zip →
   auto-reboot → adbd auto-authorizes → **camp logcat through the crash
   window**. That logcat finally discriminates overlay-service crash vs
   vold//data failure vs anything else.
