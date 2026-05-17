// Build-glue probe for #168 — references com.google.zxing.Result so dx
// fails the system-app build if the zxing-core prebuilt JAR did not link
// via LOCAL_STATIC_JAVA_LIBRARIES. Staged into the Lethe APK only when
// apply-overlays.sh runs with LETHE_BUILD_PAIR_SCAN_SPIKE=1. The spike is
// the successful compile, not runtime behavior — delete this class once
// PairScanActivity replaces it.
package org.osmosis.lethe.spike;

import com.google.zxing.Result;

public final class PairScanProbe {
    public static final String ZXING_CLASS = Result.class.getName();

    private PairScanProbe() {}
}
