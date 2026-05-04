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

    /** Cancel-window seconds between panic-press detection and wipe.
     *  0 = wipe immediately (legacy / high-risk opt-in). Default 5s. */
    public static int getPanicCooloffSeconds() {
        try {
            int v = Integer.parseInt(
                get("persist.lethe.burner.trigger.panic_cooloff_s", "5"));
            return v < 0 ? 0 : v;
        } catch (NumberFormatException e) {
            return 5;
        }
    }

    /** "safe" (default) shows a cancellable countdown notification before
     *  wiping; "instant" wipes immediately on detection. */
    public static String getPanicMode() {
        String v = get("persist.lethe.burner.trigger.panic_mode", "safe");
        return ("instant".equals(v)) ? "instant" : "safe";
    }

    /** BFU auto-reboot — return device to Before-First-Unlock after inactivity
     *  to evict CE class keys from RAM. Off by default; default-on in Border
     *  Mode (lethe#100, lethe#110). */
    public static boolean isBfuEnabled() {
        return "true".equals(get("persist.lethe.bfu.enabled", "false"));
    }

    /** Inactivity (screen off + locked) minutes before BFU reboot. Default 15. */
    public static int getBfuTimeoutMinutes() {
        try {
            int v = Integer.parseInt(
                get("persist.lethe.bfu.timeout_minutes", "15"));
            return v < 1 ? 1 : v;
        } catch (NumberFormatException e) {
            return 15;
        }
    }

    public static boolean isMeshEnabled() {
        return "true".equals(get("persist.lethe.mesh.enabled", "false"));
    }

    public static boolean isMeshBleEnabled() {
        return "true".equals(get("persist.lethe.mesh.ble", "true"));
    }

    public static long getMeshBleIntervalMs() {
        try {
            return Long.parseLong(
                get("persist.lethe.mesh.ble_interval", "1000"));
        } catch (NumberFormatException e) {
            return 1000L;
        }
    }

    public static int getMeshMaxPeers() {
        try {
            return Integer.parseInt(
                get("persist.lethe.mesh.max_peers", "16"));
        } catch (NumberFormatException e) {
            return 16;
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

    /* ═══════════ PERSIST CONFIG ═══════════ */

    /* Config stored in the app's own data dir. Writable by the app,
     * allowed by SELinux. Burner wipe deletes /data/data — so the
     * init script must explicitly preserve this file. */
    private static String sConfigDir = null;
    private static String sConfigPath = null;

    public static void initConfigDir(android.content.Context ctx) {
        sConfigDir = ctx.getFilesDir().getAbsolutePath();
        sConfigPath = sConfigDir + "/config.json";
    }

    private static String configPath() {
        return sConfigPath != null ? sConfigPath
            : "/data/local/lethe/config.json";
    }

    private static String configDir() {
        return sConfigDir != null ? sConfigDir : "/data/local/lethe";
    }
    private static final String DEFAULT_CONFIG =
        "{\"version\":1,\"active_provider\":null,\"providers\":{"
        + "\"local\":{\"endpoint\":\"http://127.0.0.1:8080\","
        + "\"key\":null,\"model\":null},"
        + "\"anthropic\":{\"endpoint\":\"https://api.anthropic.com\","
        + "\"key\":null,\"model\":\"claude-sonnet-4-6\"},"
        + "\"openrouter\":{\"endpoint\":\"https://openrouter.ai/api/v1\","
        + "\"key\":null,\"model\":\"anthropic/claude-sonnet-4-6\"},"
        + "\"custom\":{\"endpoint\":\"\",\"key\":null,\"model\":null}"
        + "}}";

    public static String loadPersistedConfig() {
        File f = new File(configPath());
        if (!f.exists()) {
            savePersistedConfig(DEFAULT_CONFIG);
            return DEFAULT_CONFIG;
        }
        try {
            java.io.FileInputStream fis = new java.io.FileInputStream(f);
            byte[] buf = new byte[(int) f.length()];
            fis.read(buf); fis.close();
            return new String(buf, "UTF-8");
        } catch (Exception e) {
            Log.e(TAG, "loadPersistedConfig failed", e);
            return DEFAULT_CONFIG;
        }
    }

    public static String savePersistedConfig(String json) {
        try {
            new org.json.JSONObject(json); // validate
            File dir = new File(configDir());
            if (!dir.exists()) dir.mkdirs();
            File tmp = new File(configPath() + ".tmp");
            java.io.FileOutputStream fos = new java.io.FileOutputStream(tmp);
            fos.write(json.getBytes("UTF-8")); fos.close();
            tmp.renameTo(new File(configPath()));
            return "ok";
        } catch (Exception e) {
            Log.e(TAG, "savePersistedConfig failed", e);
            return "error: " + e.getMessage();
        }
    }
}
