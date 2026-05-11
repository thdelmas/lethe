package org.osmosis.lethe;

import android.content.Context;
import android.os.Vibrator;
import android.util.Log;

import java.io.IOException;

/**
 * Wipe trigger entrypoints. Thin shim — the real chokepoint is
 * {@link AutoWipePolicy#executeWipe}. This class exists for two reasons:
 *   1. Backward compat: PanicPressService and DuressPinReceiver call into
 *      triggerPanicWipe / triggerDuressWipe by name.
 *   2. Legacy fallback: if DPM is unavailable or the Device Owner promotion
 *      failed at first boot, {@link #legacyWipe} runs the original rm-sweep
 *      so a partial wipe is still preferable to no wipe.
 *
 * Phase 5 will retire the legacy path once Device Owner registration is
 * proven to land on every boot.
 */
public final class WipeUtil {

    private static final String TAG = "lethe-wipe";

    // Legacy rm-sweep — kept identical to scripts/runtime/lethe-burner-wipe.sh
    // for the fallback path only. Partial-fails under enforcing SELinux (the
    // documented v1.0 behavior); see sepolicy/lethe.te:108-114.
    private static final String LEGACY_WIPE_CMD =
        "rm -rf /data/app /data/data /data/user /data/user_de " +
        "/data/misc/wifi /data/misc/bluedroid /data/media/0/* " +
        "/data/system/notification_log " +
        "/data/misc/profiles/cur/0 /data/misc/profiles/ref/0 " +
        "/data/system/users/0/accounts.db " +
        "/data/system/users/0/accounts.db-journal " +
        "/data/system/users/0/autofill " +
        "/data/system/users/0/credentials " +
        "/data/system/users/0/recent_tasks " +
        "/data/system_ce/0/recent_tasks " +
        "/data/system_ce/0/snapshots " +
        "/data/local/tmp/* /data/cache/* " +
        "/data/dalvik-cache/profiles /data/system/dropbox";

    private WipeUtil() {}

    /** Panic wipe — vibrate, then route through AutoWipePolicy. */
    public static void triggerPanicWipe(Context ctx) {
        Log.w(TAG, "PANIC WIPE triggered");
        vibrate(ctx, 200);
        AutoWipePolicy.executeWipe(ctx, AutoWipePolicy.Trigger.PANIC);
    }

    /** Duress wipe — silent, no feedback. */
    public static void triggerDuressWipe(Context ctx) {
        Log.w(TAG, "DURESS WIPE triggered");
        AutoWipePolicy.executeWipe(ctx, AutoWipePolicy.Trigger.DURESS);
    }

    /**
     * Legacy fallback. Only called when AutoWipePolicy could not reach
     * DPM.wipeData (e.g. Device Owner promotion never landed). Partial
     * coverage under enforcing SELinux but better than no wipe at all.
     */
    static void legacyWipe(Context ctx, boolean reboot) {
        Log.w(TAG, "Legacy wipe path (DPM unavailable)");
        String cmd = reboot ? (LEGACY_WIPE_CMD + " && reboot") : LEGACY_WIPE_CMD;
        try {
            Runtime.getRuntime().exec(new String[]{"/system/bin/sh", "-c", cmd});
        } catch (IOException e) {
            Log.e(TAG, "legacy wipe exec failed", e);
        }
    }

    private static void vibrate(Context ctx, long ms) {
        try {
            Vibrator v = (Vibrator) ctx.getSystemService(Context.VIBRATOR_SERVICE);
            if (v != null && v.hasVibrator()) {
                v.vibrate(ms);
            }
        } catch (Exception e) {
            // Vibration is optional feedback
        }
    }
}
