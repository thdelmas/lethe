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

## SELinux

`sepolicy/file_contexts` gained a `lethe_exec` label for the bundled
`/system/extras/lethe/agent/lethe-agent` so the in-domain exec is allowed
under enforcing. Watch first boot for `avc` denials
(`dmesg | grep -i avc`) — the agent domain may need more allows once it
actually runs on-device.
