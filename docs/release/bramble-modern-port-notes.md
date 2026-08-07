# LETHE on modern LineageOS (bramble / lineage-22.1) — port notes

Captured 2026-07-18 bringing up the first modern-Android-15 / arm64 target
(Pixel 4a 5G, bramble) on `lineage-22.1`. The overlay was written for
cm-14.1 (Android 7.1, armv7); every gotcha below is a place where modern
LineageOS / Soong / Treble behaves differently and broke the build. Each
died deeper than the last — product spec → soong analysis → OOM → package
validation → artifact-path — so fixing them was strictly sequential.

## Build invocation

```sh
source build/envsetup.sh
lunch lineage_bramble-ap4a-userdebug     # NOT trunk_staging — see #4
USE_CCACHE=1 CCACHE_EXEC=/usr/bin/ccache m -j14 bacon
```

Run it under a **transient systemd user unit**, not `nohup`/`setsid` — an
editor/agent session teardown was SIGTERM-ing the detached build mid-parse
otherwise:

```sh
systemd-run --user --unit=lethe-build --collect \
  --property=WorkingDirectory=$PWD \
  --setenv=USE_CCACHE=1 --setenv=CCACHE_EXEC=/usr/bin/ccache \
  bash -c 'source build/envsetup.sh && lunch lineage_bramble-ap4a-userdebug && m -j14 bacon'
```

## The seven port fixes (all in apply-overlays.sh unless noted)

1. **Agent backend was never bundled.** `lethe-agent-start.sh` idles when
   `/system/extras/lethe/agent/lethe-agent` is absent, and no build step
   ever installed it — so every prior OTA shipped an idle guardian. Now
   bundled on arm64 builds only (armv7 devices never get a mismatched
   binary — the ENOEXEC lesson from the tor prebuilt). Cross-build first:
   `agent/build.sh aarch64-linux-android`.

2. **Android 15 denylists `Android.mk` under `packages/apps/`**
   (`androidmk_denylist.go`). The Lethe system app's `.mk` was silently
   ignored, then `PRODUCT_PACKAGES += Lethe` failed as a non-existent
   module. Fix: generate an `Android.bp` on modern trees, keep the `.mk`
   for cm-14.1. `zxing-core` + `telephony-common` both exist as Soong
   modules in 22.1.

3. **Debloat deleted the Pixel's vendor blobs.** `vendor/google` is GApps
   on cm-14.1 but TheMuppets proprietary HALs/firmware on a modern Pixel
   tree. Blanket-removing it erased `vendor/google/bramble` and the product
   spec vanished (`bramble-vendor.mk does not exist`). Now cm-14.1-only.

4. **`trunk_staging` lunch suffix breaks lineage-sdk.** The device tree
   advertises `lineage_bramble-trunk_staging-userdebug`, but that release
   config sets `RELEASE_USE_RESOURCE_PROCESSOR_BY_DEFAULT=true`, which is
   incompatible with lineage-sdk's `:...{.aapt.srcjar}` reference and dies
   in soong analysis with "unsupported module reference tag". Official LOS
   builds pin a stable config; use `-ap4a-` (or any config where that flag
   is unset). This one is a lunch-line choice, not an apply-overlays fix.

5. **Never delete repo-managed source dirs on modern trees; debloat via
   config only.** The cm-14.1 debloat mechanism `rm -rf`'d app source dirs
   (Browser2). On modern LineageOS that breaks the build in *two* ways,
   found in sequence: (a) `PRODUCT_PACKAGES` is parse-time validated, so a
   config still naming Browser2 → hard error ("non-existent modules"); and
   (b) even after stripping the config entry, the `build-manifest.xml`
   generator runs `git rev-parse` in every repo project and dies on the
   now-missing `packages/apps/Browser2` (`FileNotFoundError`) — this one
   fails late, in packaging. Fix: on modern trees skip source-dir deletion
   entirely and debloat by stripping the `PRODUCT_PACKAGES` entry
   (Browser2 comes from AOSP `handheld_product.mk`); the source dir stays,
   keeping the repo manifest intact, and the app is simply not packaged.
   If a tree already had the dir deleted, restore it with
   `repo sync --force-sync packages/apps/Browser2`.

6. **Treble artifact-path enforcement** (`generic_system.mk`) hard-errors
   on any `/system` file not on its allowlist. All 21 LETHE artifacts need
   `PRODUCT_ARTIFACT_PATH_REQUIREMENT_ALLOWED_LIST += <glob>` entries.
   cm-14.1 predates the mechanism entirely.

7. **ELF prebuilts via `PRODUCT_COPY_FILES` are rejected** (`Makefile`:
   "found ELF prebuilt in PRODUCT_COPY_FILES, use cc_prebuilt_binary").
   Fires at ~87%, deep in image assembly — the latest-failing gate. LETHE
   ships two ELF binaries the copy way: `system/bin/tor` and the bundled
   `lethe-agent`. Set the legacy escape hatch
   `BUILD_BROKEN_ELF_PREBUILT_PRODUCT_COPY_FILES := true` in the device's
   Lineage board config (`device/*/<codename>/BoardConfigLineage.mk`, which
   is in the board-config include chain). The clean long-term fix is
   per-binary `cc_prebuilt_binary` modules with `check_elf_files` handling;
   the escape hatch is acceptable tech debt for a legacy-overlay port.

## Environment

- **OOM during soong analysis.** The glob/analysis phase spiked past 30G
  RAM and the kernel OOM-killed the build repeatedly at ~2 min. 2G swap
  was far too thin. Fix: 32G+ swap file, or drop to `-j8` for the parse
  phase. With swap present, `-j14` (all cores) is fine for the compile.
- **ccache** is arch/flag-specific: a cm-14.1 armv7 cache gives ~0 hits
  for an arm64/A15 build (host tools like ICU are the exception — those
  are shared x86_64). Set it at the *start* of a build, not mid-flight:
  toggling it on a running compile gave no speedup on this first build and
  introduced a failure. Point `CCACHE_DIR` at a **writable** path you own
  — the default `~/.ccache` here had a root-owned `tmp/` from an earlier
  sudo build, which failed every host compile with "Permission denied".
  Fix: `--setenv=CCACHE_DIR=/home/mia/android/.ccache-lethe
  --setenv=CCACHE_MAXSIZE=50G`.
- **Soong tracks env vars — never launch a build without the full canonical
  env block above.** A 2026-08-06 `mka Lethe` missing `USE_CCACHE=1` made
  soong invalidate its analysis (`environment variables changed value`)
  and drop into cold re-analysis: ~26GB RSS, froze the desktop, oomd kill.
  The damage is sticky — the analysis is regenerated in place, so the NEXT
  run is cold even with the env restored (it froze the machine a second
  time). Cold analysis cannot run on this 30G box while it's in use unless
  swap absorbs the overshoot: `/swapfile2` (32G) is now active + fstab'd
  for exactly this. Unit caps that survived the incident:
  `-p MemoryHigh=22G -p MemoryMax=26G -p CPUWeight=40 -p IOWeight=20`
  (`ManagedOOM*` properties are rejected on user transient units). Warm
  module builds are seconds-to-minutes; the one-time cold pass was 34 min
  over swap with the desktop usable.

## SELinux

`sepolicy/file_contexts` gained a `lethe_exec` label for the bundled
`/system/extras/lethe/agent/lethe-agent` so the in-domain exec is allowed
under enforcing. Watch first boot for `avc` denials
(`dmesg | grep -i avc`) — the agent domain may need more allows once it
actually runs on-device.

### Port fix 9 — the policy was installed into a container dir (2026-08-07)

**Symptom.** `lethe-agent` restart-loops on every boot:

```
init: cannot setexeccon('u:r:lethe:s0') for lethe-agent: Invalid argument
init: Service 'lethe-agent' ... exited with status 6
```

It reads like a missing sepolicy, but `sepolicy/lethe.te` declares the
domain and `apply-overlays.sh` does call `scripts/install-sepolicy.sh`.
The files really were in the tree — at
`device/lineage/sepolicy/common/`.

**Cause.** That path is a **container, not a policy dir.**
`common/sepolicy.mk` (pulled in by `build/make/core/config.mk:1298` for
`LINEAGE_BUILD`) only adds the *subdirectories* —
`common/public`, `common/private`, `common/dynamic`, `common/vendor` — to
`SYSTEM_EXT_*_SEPOLICY_DIRS` / `BOARD_VENDOR_SEPOLICY_DIRS`. Nothing
reads `common/` itself, so `lethe.te`, `tor.te` and the merged
`file_contexts` sat in the tree, were never compiled, and the domain
silently did not exist at runtime. **Nothing warns** — the install
prints success and the image builds clean. This is the failure mode to
remember: *installed* is not *compiled*. The correct target is
`common/private`, where LineageOS labels its own `/system/bin` binaries.

**What the policy does when correctly wired.** It fails to build — which
is why the silent orphaning went unnoticed for so long. Measured with
`mka selinux_policy` (~11 min cold, ~30 s warm — always test policy with
this target, never by discovering it 20 minutes into `mka bacon`):

1. `tor.te:73: ERROR 'unknown type urandom_device'` — the type was
   merged into `random_device` in modern AOSP. cm-14.1 still needs it,
   so `install-sepolicy.sh` strips `LEGACY_ONLY_TYPES` on modern trees
   and leaves the source cm-14.1-correct. **Fixed.**
2. With that cleared: **10 neverallow violations across 7 rules.**
   `lethe`: `system_file` execute_no_trans, `system_data_file` dir,
   `app_data_file` dir, `system_prop` set + read,
   `self:capability { sys_admin dac_override dac_read_search chown
   fowner fsetid net_admin net_raw }`. `tor`: `self:capability`,
   `system_file`. These are AOSP restrictions tightened after Android 7
   and are deliberate — clearing them means splitting the daemons' real
   needs out of blanket cm-14.1-era grants, i.e. a **domain redesign,
   not a syntax fix.** Same family as the `system_data_file` neverallow
   that already blocks the v1.1 burner wipe. **Open.**

**Current state.** `install-sepolicy.sh` skips modern trees by default
so `mka bacon` keeps building; the cost is the status quo (no `lethe`
domain, agent restart-loops — harmless on the permissive diag build,
blocking for enforcing). Set `LETHE_SEPOLICY_MODERN=1` to install once
the domain is reworked. The wiring fix and the legacy-type strip are
already in place behind that flag, so the next attempt starts at the
neverallows rather than re-deriving any of the above.
