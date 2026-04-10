package org.osmosis.lethe;

import android.util.Log;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.lang.reflect.Method;

/**
 * Reads and writes Android system properties for LETHE features.
 * Uses reflection for the hidden SystemProperties API.
 * Falls back to reading /persist config files if properties are unset.
 */
public final class LetheConfig {

    private static final String TAG = "lethe-config";

    private static Method sGetMethod;
    private static Method sSetMethod;

    static {
        try {
            Class<?> sp = Class.forName("android.os.SystemProperties");
            sGetMethod = sp.getMethod("get", String.class, String.class);
            sSetMethod = sp.getMethod("set", String.class, String.class);
        } catch (Exception e) {
            Log.e(TAG, "SystemProperties reflection failed", e);
        }
    }

    private LetheConfig() {}

    public static String get(String key, String defaultValue) {
        if (sGetMethod != null) {
            try {
                return (String) sGetMethod.invoke(null, key, defaultValue);
            } catch (Exception e) {
                Log.w(TAG, "get " + key + " failed", e);
            }
        }
        return defaultValue;
    }

    public static void set(String key, String value) {
        if (sSetMethod != null) {
            try {
                sSetMethod.invoke(null, key, value);
            } catch (Exception e) {
                Log.e(TAG, "set " + key + " failed", e);
            }
        }
    }

    public static boolean isDeadmanEnabled() {
        return "true".equals(get("persist.lethe.deadman.enabled", "false"));
    }

    public static boolean isDuressPinEnabled() {
        return "true".equals(get("persist.lethe.deadman.duress_pin.enabled", "false"));
    }

    public static boolean isPanicButtonEnabled() {
        return "true".equals(get("persist.lethe.burner.trigger.panic_button", "false"));
    }

    public static int getPanicPressCount() {
        try {
            return Integer.parseInt(
                get("persist.lethe.burner.trigger.panic_press_count", "5"));
        } catch (NumberFormatException e) {
            return 5;
        }
    }

    /** Read a line from a file, returning defaultValue on any error. */
    public static String readFile(String path, String defaultValue) {
        File f = new File(path);
        if (!f.exists()) return defaultValue;
        try (BufferedReader br = new BufferedReader(new FileReader(f))) {
            String line = br.readLine();
            return (line != null) ? line.trim() : defaultValue;
        } catch (Exception e) {
            Log.w(TAG, "readFile " + path + " failed", e);
            return defaultValue;
        }
    }
}
