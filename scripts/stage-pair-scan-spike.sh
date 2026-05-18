#!/usr/bin/env bash
# Stage the #168 pair-scan decoder build-glue spike into a LineageOS source
# tree. Sourced by apply-overlays.sh during step 11 when
# LETHE_BUILD_PAIR_SCAN_SPIKE=1. Off by default; default builds are
# byte-identical to pre-spike output.
#
# Hardware-validated on t0lte 2026-05-17 (cm-14.1 lethe-cm14-build docker):
# adding LOCAL_STATIC_JAVA_LIBRARIES := zxing-core to the Lethe Android.mk
# is the entire build-glue. packages/apps/Snap already declares zxing-core
# as a prebuilt (quickReader/libs/zxing-core-g-2.3.1.jar) — vendoring a
# second copy collides at module-namespace level. See
# docs/security/journalist-audit/168-pair-scan-spike.md.
#
# Usage: stage-pair-scan-spike.sh <repo-root> <lethe-app-dest>
set -euo pipefail

SCRIPT_DIR="$1"
LETHE_APP_DEST="$2"

echo "  -> LETHE_BUILD_PAIR_SCAN_SPIKE=1: wiring zxing-core (from Snap) + probe."

sed -i '/^LOCAL_JAVA_LIBRARIES := telephony-common$/a LOCAL_STATIC_JAVA_LIBRARIES := zxing-core' \
    "$LETHE_APP_DEST/Android.mk"

mkdir -p "$LETHE_APP_DEST/java/org/osmosis/lethe/spike"
cp "$SCRIPT_DIR/spike/168-pair-scan/PairScanProbe.java" \
    "$LETHE_APP_DEST/java/org/osmosis/lethe/spike/PairScanProbe.java"
