# #168 — pair-scan decoder build-glue spike

Sub-case of [#159](https://github.com/thdelmas/lethe/issues/159). Tracked at
[#168](https://github.com/thdelmas/lethe/issues/168). After [#165](https://github.com/thdelmas/lethe/pull/165)
and [#167](https://github.com/thdelmas/lethe/pull/167) shipped the broadcast
and paste-pair paths, the camera-scan path remains broken on user builds —
the existing `NativeLauncher.scanQR` → `static/settings.js:451` flow lives
inside `LetheActivity` (WebView-in-system-uid, crashes on shipping ROMs).

## What the spike validates

The unknown blocking #168 is build-glue. The cm-14.1 system-app template
at [apply-overlays.sh:399](../../../apply-overlays.sh#L399) doesn't pull
any third-party JARs today. Before writing the ~200 LOC of Camera2 +
scanner UI, we need to confirm:

1. A sibling Android.mk at `packages/apps/LethePrebuilts/` declaring
   `zxing-core` as a `BUILD_PREBUILT` JAVA_LIBRARIES module is picked up
   by the LineageOS top-level build.
2. `LOCAL_STATIC_JAVA_LIBRARIES := zxing-core` on the Lethe APK
   correctly links the JAR into Lethe.apk, with classes reachable from
   the system-uid process.

A no-op probe ([spike/168-pair-scan/PairScanProbe.java](../../../spike/168-pair-scan/PairScanProbe.java))
references `com.google.zxing.Result` so any link failure surfaces at
compile time, not as a runtime ClassNotFoundException.

## How to run the spike

The whole spike is opt-in via env var. Default builds are unchanged.

1. Fetch the ZXing core JAR (not committed — build-glue PR only):
   ```sh
   cd prebuilts/zxing
   curl -fLo core-3.3.3.jar \
     https://repo1.maven.org/maven2/com/google/zxing/core/3.3.3/core-3.3.3.jar
   sha256sum core-3.3.3.jar > core-3.3.3.jar.sha256
   ```
2. Stage and build:
   ```sh
   LETHE_BUILD_PAIR_SCAN_SPIKE=1 ./apply-overlays.sh tissot
   cd "$LINEAGE_TREE" && mka lethe-image
   ```
3. Confirm Lethe.apk contains `Result.class`:
   ```sh
   unzip -l out/target/product/tissot/system/priv-app/Lethe/Lethe.apk \
     | grep 'com/google/zxing/Result\.class'
   ```

3.3.3 chosen because it is the last ZXing release fully compatible
with the Java 7 source/target the cm-14.1 system-app pipeline uses.

## Non-goals

- No `PairScanActivity` UI in the spike PR.
- No manifest entry, no `PairReceiver` wiring.
- No JAR committed — that's a follow-up after the build path is
  confirmed and the SHA-256 has been recorded.
- No Camera2 plumbing or barcode decode loop.

## Open questions deferred to the follow-up PR

- Whether to vendor `zxing-core` under `prebuilts/zxing/` or under a
  build-system-wide `external/zxing/` path more consistent with other
  LineageOS modules.
- Whether `LOCAL_STATIC_JAVA_LIBRARIES` is the right linkage vs.
  `LOCAL_JAVA_LIBRARIES` (compile-time only). The cm-14.1 system path
  has no runtime ZXing, so static is the only practical option — but
  the spike build will confirm dex-size is acceptable.
- Lifecycle of `PairScanProbe.java`: delete it the moment
  `PairScanActivity` ships and supplies its own ZXing reference.

## Acceptance

- `LETHE_BUILD_PAIR_SCAN_SPIKE=1 ./apply-overlays.sh <codename>` succeeds.
- `mka lethe-image` succeeds with no link errors against `zxing-core`.
- `Lethe.apk` contains `com/google/zxing/Result.class`.
- Default builds (`LETHE_BUILD_PAIR_SCAN_SPIKE` unset) are byte-identical
  to pre-spike output.
