#!/usr/bin/env bash
# Stage the #168 pair-scan decoder build-glue spike into a LineageOS source
# tree. Sourced by apply-overlays.sh during step 11 when
# LETHE_BUILD_PAIR_SCAN_SPIKE=1. Off by default; default builds are
# byte-identical to pre-spike output.
#
# Validates that a prebuilt-JAR sibling module under packages/apps/
# wires through to the Lethe APK via LOCAL_STATIC_JAVA_LIBRARIES. See
# docs/security/journalist-audit/168-pair-scan-spike.md for the why.
#
# Usage: stage-pair-scan-spike.sh <repo-root> <lethe-app-dest>
set -euo pipefail

SCRIPT_DIR="$1"
LETHE_APP_DEST="$2"

echo "  -> LETHE_BUILD_PAIR_SCAN_SPIKE=1: staging zxing-core prebuilt + probe."

LETHE_PREBUILTS_DEST="packages/apps/LethePrebuilts"
rm -rf "$LETHE_PREBUILTS_DEST"
mkdir -p "$LETHE_PREBUILTS_DEST"
cp "$SCRIPT_DIR/prebuilts/zxing/Android.mk" "$LETHE_PREBUILTS_DEST/Android.mk"

if [ -f "$SCRIPT_DIR/prebuilts/zxing/core-3.3.3.jar" ]; then
    cp "$SCRIPT_DIR/prebuilts/zxing/core-3.3.3.jar" "$LETHE_PREBUILTS_DEST/core-3.3.3.jar"
    echo "     - core-3.3.3.jar staged."
else
    echo "     - WARN: prebuilts/zxing/core-3.3.3.jar absent;"
    echo "       prebuilt module will skip itself and the probe compile WILL fail."
    echo "       See prebuilts/zxing/README.md for the fetch command."
fi

sed -i '/^LOCAL_JAVA_LIBRARIES := telephony-common$/a LOCAL_STATIC_JAVA_LIBRARIES := zxing-core' \
    "$LETHE_APP_DEST/Android.mk"

mkdir -p "$LETHE_APP_DEST/java/org/osmosis/lethe/spike"
cp "$SCRIPT_DIR/spike/168-pair-scan/PairScanProbe.java" \
    "$LETHE_APP_DEST/java/org/osmosis/lethe/spike/PairScanProbe.java"
