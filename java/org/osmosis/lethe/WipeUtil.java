package org.osmosis.lethe;

import android.content.Context;
import android.os.Vibrator;
import android.util.Log;

import java.io.IOException;

/**
 * Wipe trigger utilities for burner mode, panic wipe, and duress PIN.
 * Runs the same shell commands as init.lethe-burner.rc for consistency.
 * Requires system UID (android:sharedUserId="android.uid.system").
 */
public final class WipeUtil {

    private static final String TAG = "lethe-wipe";

    private static final String WIPE_CMD =
        "rm -rf /data/app /data/data /data/user /data/user_de " +
        "/data/misc/wifi /data/misc/bluedroid /data/media/0/* " +
        "/data/system/notification_log";

    private WipeUtil() {}

    /**
     * Panic wipe: immediate data wipe + reboot.
     * Vibrates briefly so the user knows it worked.
     */
    public static void triggerPanicWipe(Context ctx) {
        Log.w(TAG, "PANIC WIPE triggered");
        vibrate(ctx, 200);
        exec(WIPE_CMD + " && reboot");
    }

    /**
     * Duress wipe: silent wipe via init property trigger.
     * Sets the property that init.lethe-deadman.rc watches.
     * No vibration, no visual feedback — the phone looks normal.
     */
    public static void triggerDuressWipe(Context ctx) {
        Log.w(TAG, "DURESS WIPE triggered");
        LetheConfig.set("persist.lethe.deadman.duress_triggered", "true");
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

    private static void exec(String cmd) {
        try {
            Runtime.getRuntime().exec(
                new String[]{"/system/bin/sh", "-c", cmd});
        } catch (IOException e) {
            Log.e(TAG, "exec failed", e);
        }
    }
}
