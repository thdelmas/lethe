# #168 — pair-scan decoder build-glue spike

> **Status (2026-05-18):** spike closed. `PairScanActivity` is in
> mainline. The `LETHE_BUILD_PAIR_SCAN_SPIKE` env var, the
> `scripts/stage-pair-scan-spike.sh` stager, and the
> `org.osmosis.lethe.spike.PairScanProbe` class are gone — the
> `LOCAL_STATIC_JAVA_LIBRARIES := zxing-core` line is in the inline
> `Lethe/Android.mk` heredoc in `apply-overlays.sh` directly, and the
> Camera2 scanner activity replaces the probe. This doc remains as the
> hardware-validation record for the build-glue decision.

Sub-case of [#159](https://github.com/thdelmas/lethe/issues/159). Tracked at
[#168](https://github.com/thdelmas/lethe/issues/168). After [#165](https://github.com/thdelmas/lethe/pull/165)
and [#167](https://github.com/thdelmas/lethe/pull/167) shipped the broadcast
and paste-pair paths, the camera-scan path remains broken on user builds —
the existing `NativeLauncher.scanQR` → `static/settings.js:451` flow lives
inside `LetheActivity` (WebView-in-system-uid, crashes on shipping ROMs).

## What the spike validates

The unknown blocking #168 was build-glue. Before writing the ~200 LOC of
Camera2 + scanner UI, we needed to confirm that the Lethe APK could link
a barcode-decoder library through the cm-14.1 system-app pipeline at
[apply-overlays.sh](../../../apply-overlays.sh), which had never pulled in
a third-party JAR.

## Finding — validated on t0lte, 2026-05-17

**The cm-14.1 source tree already ships `zxing-core` 2.3.1.** It is
declared at [`packages/apps/Snap/Android.mk`](https://github.com/LineageOS/android_packages_apps_Snap/blob/cm-14.1/Android.mk)
as a `LOCAL_PREBUILT_STATIC_JAVA_LIBRARIES` pointing at
`quickReader/libs/zxing-core-g-2.3.1.jar`.

Adding `LOCAL_STATIC_JAVA_LIBRARIES := zxing-core` to the Lethe Android.mk
is the entire build-glue. No vendored JAR. No sibling `LethePrebuilts`
module. Attempting to vendor a second copy under a duplicate module name
fails at config-evaluation time:

```
build/core/base_rules.mk:183: *** packages/apps/Snap:
MODULE.TARGET.JAVA_LIBRARIES.zxing-core already defined by
packages/apps/LethePrebuilts.
```

Once the duplicate prebuilt is removed, `mka Lethe` succeeds in 1:51
(t0lte, warm ccache). `Lethe.apk`'s `classes.dex` (635 KB, up from
~500 KB pre-spike) contains `com.google.zxing.BarcodeFormat`,
`com.google.zxing.qrcode.decoder.*`, the full ResultParser tree, and
the probe's own `org.osmosis.lethe.spike.PairScanProbe` (which imports
`com.google.zxing.Result` to force the link).

## How to run the spike

The whole spike stays opt-in via env var. Default builds are unchanged.

1. Stage:
   ```sh
   LETHE_BUILD_PAIR_SCAN_SPIKE=1 ./apply-overlays.sh t0lte
   ```
   (in the cm-14.1 source tree root — typically `~/android/lineage-v1.0.1`).
2. Build the module inside `lethe-cm14-build:latest`:
   ```sh
   docker run --rm \
     -e LC_ALL=C -e LANG=C -e USE_CCACHE=1 -e CCACHE_DIR=/ccache \
     -e USER=root -e HOME=/root \
     -e GIT_CONFIG_COUNT=1 -e GIT_CONFIG_KEY_0=safe.directory -e GIT_CONFIG_VALUE_0='*' \
     -v ~/android/lineage-v1.0.1:/lineage \
     -v ~/Lethe:/lethe \
     -v ~/.ccache:/ccache \
     lethe-cm14-build:latest \
     bash -c "cd /lineage && source build/envsetup.sh && lunch lineage_t0lte-user && mka Lethe"
   ```
3. Confirm the dex link:
   ```sh
   unzip -p ~/android/lineage-v1.0.1/out/target/product/t0lte/system/priv-app/Lethe/Lethe.apk \
     classes.dex | strings | grep 'com/google/zxing'
   ```
   Expect ZXing class names (`SwitchMap$com$google$zxing$BarcodeFormat`, parser source files, etc.).

## Non-goals

- No `PairScanActivity` UI in the spike PR.
- No manifest entry, no `PairReceiver` wiring.
- No Camera2 plumbing or barcode-decode loop.

## What this means for the PairScanActivity follow-up

- Implementation can assume `com.google.zxing.*` is reachable. The
  Camera2 preview can feed `MultiFormatReader.decode` against
  `RGBLuminanceSource` (or `PlanarYUVLuminanceSource` for raw preview
  frames) without any further build-system work.
- 2.3.1 is from 2014. It works fine for the QR-pair use case (~70-byte
  payload, controlled lighting, partner OSmosis device on-screen). If a
  future feature ever needs a newer decoder (high-density / damaged-code
  recovery), revisit the vendor question — that would mean **renaming**
  to `lethe-zxing-core` to dodge the Snap collision.
- For LOS 22.1+ trees the layout is different (no `packages/apps/Snap`).
  PairScanActivity is currently cm-14.1-only because #159 is — when it
  ports forward, the vendoring question comes back as a separate spike.

## Acceptance

- [x] `LETHE_BUILD_PAIR_SCAN_SPIKE=1 ./apply-overlays.sh t0lte` succeeds.
- [x] `mka Lethe` in `lethe-cm14-build:latest` docker succeeds (1:51 warm).
- [x] `Lethe.apk` contains `com.google.zxing.*` classes in `classes.dex`.
- [x] Probe class `org.osmosis.lethe.spike.PairScanProbe` compiles and links.
- [x] Default builds (`LETHE_BUILD_PAIR_SCAN_SPIKE` unset) are unchanged
      — the staging script is never invoked.
