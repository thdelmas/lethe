package org.osmosis.lethe;

import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Context;
import android.os.Build;
import android.os.SystemClock;
import android.provider.Settings;
import android.util.Log;

import java.io.File;
import java.io.FileWriter;
import java.lang.reflect.InvocationTargetException;

/**
 * Unified auto-wipe chokepoint.
 *
 * Every wipe trigger (panic, duress, DMS, failed-unlock, every-restart,
 * USB signal) calls {@link #executeWipe} here. We delegate to
 * {@link DevicePolicyManager#wipeData}, which runs in the system_server
 * domain — the one with the system_data_file neverallow exemption that
 * the lethe domain's rm-sweep doesn't have. Single chokepoint also makes
 * the future swap to per-session crypto-erase (feat/per-session-keys) a
 * one-class edit.
 *
 * Property surface (read/written via {@link LetheConfig}):
 *   persist.lethe.autowipe.failed_unlock.enabled    boolean
 *   persist.lethe.autowipe.failed_unlock.threshold  int (default 10)
 *   persist.lethe.autowipe.failed_unlock.delays     csv minutes
 *   persist.lethe.autowipe.dms.enabled              boolean
 *   persist.lethe.autowipe.every_restart.enabled    boolean
 *   persist.lethe.autowipe.panic.enabled            boolean
 *   persist.lethe.autowipe.duress.enabled           boolean
 *   persist.lethe.autowipe.usb_signal.enabled       boolean
 *
 * Audit log: each call writes one line to /persist/lethe/autowipe.log
 * before invoking the wipe. /persist survives the wipe by design; lets a
 * later forensic / recovery flow distinguish "user-triggered wipe" from
 * "device wiped due to attack" without trusting volatile memory.
 */
public final class AutoWipePolicy {

    private static final String TAG = "lethe-autowipe";

    public enum Trigger {
        PANIC,            // 5x power-button press (user-facing countdown happens upstream)
        DURESS,           // duress PIN entered on lockscreen
        DMS,              // dead-man's switch Stage 2 escalation
        FAILED_UNLOCK,    // N failed PIN/pattern/password attempts (iPhone-style)
        EVERY_RESTART,    // burner mode — kept on the legacy post-fs-data path
                          // (DPM would reboot-loop on every boot). Listed here
                          // for policy / UI uniformity; not routed through
                          // executeWipe today. Future: per-session crypto-erase.
        USB_SIGNAL,       // OSmosis remote trigger
    }

    // DPM.wipeData flags — declared as raw ints since several post-date API 25
    // (cm-14.1) and we need to feature-gate at runtime, not at compile time.
    private static final int WIPE_EXTERNAL_STORAGE = 0x0001; // API 23
    private static final int WIPE_RESET_PROTECTION = 0x0002; // API 24
    private static final int WIPE_EUICC            = 0x0004; // API 28
    private static final int WIPE_SILENTLY         = 0x0008; // API 29

    private static final String AUDIT_LOG = "/persist/lethe/autowipe.log";

    private AutoWipePolicy() {}

    /**
     * One-shot migration: v1.0/v1.1 stored these triggers under different
     * property names (persist.lethe.burner.*, persist.lethe.deadman.*).
     * Copy any legacy values into the unified namespace on first boot
     * post-upgrade so users don't silently lose their burner-on setting.
     * Guarded by a marker prop so user changes after migration aren't
     * overwritten on subsequent boots.
     */
    public static void migrateLegacyProps() {
        final String MARK = "persist.lethe.autowipe.migrated";
        if ("true".equals(LetheConfig.get(MARK, "false"))) return;

        copyIfUnset("persist.lethe.burner.enabled",
                    "persist.lethe.autowipe.every_restart.enabled");
        copyIfUnset("persist.lethe.burner.trigger.panic_button",
                    "persist.lethe.autowipe.panic.enabled");
        copyIfUnset("persist.lethe.deadman.duress_pin.enabled",
                    "persist.lethe.autowipe.duress.enabled");
        copyIfUnset("persist.lethe.deadman.enabled",
                    "persist.lethe.autowipe.dms.enabled");

        LetheConfig.set(MARK, "true");
        Log.i(TAG, "legacy property migration complete");
    }

    private static void copyIfUnset(String src, String dst) {
        String existing = LetheConfig.get(dst, "");
        if (!existing.isEmpty()) return;
        String val = LetheConfig.get(src, "");
        if (val.isEmpty()) return;
        LetheConfig.set(dst, val);
    }

    /**
     * One-shot promotion of LetheDeviceAdmin to Device Owner. Replaces the
     * v1.2 init shell-out path (lethe-set-device-owner.sh + lethe_set_owner
     * service), which required granting the lethe SELinux domain
     * zygote_exec perms to invoke pm/dpm — see #145. BootReceiver runs as
     * system uid in the platform_app domain, which already has the DPM
     * binder access; this method goes through the same DevicePolicyManagerService
     * path as the dpm shell tool but bypasses the lethe-domain sepolicy gap.
     *
     * Timing: DevicePolicyManagerService.enforceCanSetDeviceOwner refuses
     * once DEVICE_PROVISIONED=1 (primary user established). BOOT_COMPLETED
     * on a fresh flash fires before setup wizard sets that flag — same
     * window the old init service relied on (sys.boot_completed=1).
     *
     * Idempotent via persist.lethe.device_owner_set. On transient failure
     * (DPM not ready, reflection blocked) we leave the marker unset so a
     * later boot retries.
     */
    public static void ensureDeviceOwner(Context ctx) {
        final String DONE = "persist.lethe.device_owner_set";
        if ("true".equals(LetheConfig.get(DONE, "false"))) return;

        int provisioned = Settings.Global.getInt(
            ctx.getContentResolver(), Settings.Global.DEVICE_PROVISIONED, 0);
        if (provisioned != 0) {
            Log.w(TAG, "ensureDeviceOwner: DEVICE_PROVISIONED=" + provisioned
                + " — window closed; manual `dpm set-device-owner` required");
            return;
        }

        DevicePolicyManager dpm = (DevicePolicyManager)
            ctx.getSystemService(Context.DEVICE_POLICY_SERVICE);
        if (dpm == null) {
            Log.e(TAG, "ensureDeviceOwner: DPM unavailable");
            return;
        }
        ComponentName admin = LetheDeviceAdmin.getComponent(ctx);

        try {
            if (!dpm.isAdminActive(admin)) {
                // setActiveAdmin(ComponentName, boolean refreshing) — @hide on
                // API 25; reachable from a platform-signed system-uid app via
                // LOCAL_PRIVATE_PLATFORM_APIS + reflection. Mirrors what the
                // dpm shell tool does internally before set-device-owner.
                DevicePolicyManager.class
                    .getMethod("setActiveAdmin", ComponentName.class, boolean.class)
                    .invoke(dpm, admin, false);
            }
            // setDeviceOwner(ComponentName, String ownerName) — @hide on API 25.
            // Returns boolean. DPMS enforces DEVICE_PROVISIONED==0 internally,
            // so a TOCTOU with setup wizard surfaces as `false`, not an exception.
            Object ok = DevicePolicyManager.class
                .getMethod("setDeviceOwner", ComponentName.class, String.class)
                .invoke(dpm, admin, "LETHE");
            if (Boolean.TRUE.equals(ok)) {
                LetheConfig.set(DONE, "true");
                Log.i(TAG, "Device Owner promotion complete");
            } else {
                Log.w(TAG, "Device Owner promotion returned false; will retry next boot");
            }
        } catch (InvocationTargetException e) {
            Log.e(TAG, "ensureDeviceOwner: DPM call threw", e.getTargetException());
        } catch (ReflectiveOperationException e) {
            Log.e(TAG, "ensureDeviceOwner: reflection failed", e);
        }
    }

    /**
     * Apply the current policy to DPM. Idempotent — safe to call every
     * boot. Single call site for pushing
     * {@code setMaximumFailedPasswordsForWipe(N)} which is what gives
     * us iPhone-style "fail N times and the device wipes" via stock
     * Android machinery (we don't count attempts ourselves for the wipe;
     * the framework does, and triggers DPM.wipeData with our flags).
     */
    public static void applyPolicy(Context ctx) {
        DevicePolicyManager dpm = (DevicePolicyManager)
            ctx.getSystemService(Context.DEVICE_POLICY_SERVICE);
        if (dpm == null) {
            Log.e(TAG, "applyPolicy: DPM unavailable");
            return;
        }
        ComponentName admin = LetheDeviceAdmin.getComponent(ctx);
        if (!dpm.isAdminActive(admin)) {
            Log.w(TAG, "applyPolicy: LetheDeviceAdmin not active yet");
            return;
        }

        int wipeThreshold = isTriggerEnabled(Trigger.FAILED_UNLOCK)
            ? getFailedUnlockThreshold()
            : 0; // 0 disables the wipe trigger at the framework level.
        try {
            dpm.setMaximumFailedPasswordsForWipe(admin, wipeThreshold);
            Log.i(TAG, "setMaximumFailedPasswordsForWipe(" + wipeThreshold + ")");
        } catch (SecurityException e) {
            Log.e(TAG, "applyPolicy: refused by framework", e);
        }
    }

    /** Configured wipe threshold (failed-unlock attempts). Default 10. */
    public static int getFailedUnlockThreshold() {
        try {
            int n = Integer.parseInt(LetheConfig.get(
                "persist.lethe.autowipe.failed_unlock.threshold", "10"));
            return n < 1 ? 1 : n;
        } catch (NumberFormatException e) {
            return 10;
        }
    }

    /**
     * Parses the optional lockout-delay staircase (csv of minutes).
     * Empty / unset / malformed = no staircase. Caller indexes by
     * (attempts - 1), clamping to the last entry.
     *
     * The keyguard reads the same prop via LockPatternUtils.
     * getLetheStaircaseTimeoutMs and enforces the cooldown directly;
     * this method exists for UI surfaces (settings panel, audit log).
     */
    public static int[] getFailedUnlockDelaysMinutes() {
        String csv = LetheConfig.get(
            "persist.lethe.autowipe.failed_unlock.delays", "");
        if (csv.isEmpty()) return new int[0];
        String[] parts = csv.split(",");
        int[] out = new int[parts.length];
        for (int i = 0; i < parts.length; i++) {
            try { out[i] = Math.max(0, Integer.parseInt(parts[i].trim())); }
            catch (NumberFormatException e) { out[i] = 0; }
        }
        return out;
    }

    /** Called from LetheDeviceAdmin.onPasswordFailed. */
    public static void onPasswordFailed(Context ctx) {
        if (!isTriggerEnabled(Trigger.FAILED_UNLOCK)) return;

        DevicePolicyManager dpm = (DevicePolicyManager)
            ctx.getSystemService(Context.DEVICE_POLICY_SERVICE);
        if (dpm == null) return;

        int attempts = dpm.getCurrentFailedPasswordAttempts();
        int threshold = getFailedUnlockThreshold();
        int[] delays = getFailedUnlockDelaysMinutes();
        int delayMin = (delays.length == 0) ? 0
            : delays[Math.min(attempts - 1, delays.length - 1)];

        Log.w(TAG, "Failed unlock: attempts=" + attempts +
            "/" + threshold + " delay=" + delayMin + "m");

        // The wipe itself fires automatically via setMaximumFailedPasswordsForWipe;
        // staircase cooldowns are enforced by the keyguard patch
        // (LockPatternUtils.getLetheStaircaseTimeoutMs). This method just logs.
    }

    /** True if the given trigger is enabled by user policy. */
    public static boolean isTriggerEnabled(Trigger t) {
        switch (t) {
            case PANIC:
                return "true".equals(LetheConfig.get(
                    "persist.lethe.autowipe.panic.enabled",
                    // Legacy fallback: panic was wired through burner.trigger.panic_button.
                    LetheConfig.get("persist.lethe.burner.trigger.panic_button", "true")));
            case DURESS:
                return "true".equals(LetheConfig.get(
                    "persist.lethe.autowipe.duress.enabled",
                    LetheConfig.get("persist.lethe.deadman.duress_pin.enabled", "false")));
            case DMS:
                return "true".equals(LetheConfig.get(
                    "persist.lethe.autowipe.dms.enabled",
                    LetheConfig.get("persist.lethe.deadman.enabled", "false")));
            case FAILED_UNLOCK:
                return "true".equals(LetheConfig.get(
                    "persist.lethe.autowipe.failed_unlock.enabled", "false"));
            case EVERY_RESTART:
                return "true".equals(LetheConfig.get(
                    "persist.lethe.autowipe.every_restart.enabled",
                    // Legacy fallback: v1.0 stored this as burner.enabled.
                    LetheConfig.get("persist.lethe.burner.enabled", "false")));
            case USB_SIGNAL:
                return "true".equals(LetheConfig.get(
                    "persist.lethe.autowipe.usb_signal.enabled", "false"));
        }
        return false;
    }

    /**
     * Wipe the device. Returns only on failure — success path reboots.
     * Caller is responsible for any pre-wipe UI (countdown, splash) and
     * must ensure {@link #isTriggerEnabled} was true.
     */
    public static void executeWipe(Context ctx, Trigger reason) {
        audit(reason);

        DevicePolicyManager dpm = (DevicePolicyManager)
            ctx.getSystemService(Context.DEVICE_POLICY_SERVICE);

        if (dpm == null) {
            Log.e(TAG, "DPM unavailable; falling back to legacy WipeUtil path");
            WipeUtil.legacyWipe(ctx, reason == Trigger.PANIC);
            return;
        }

        ComponentName admin = LetheDeviceAdmin.getComponent(ctx);
        if (!dpm.isAdminActive(admin)) {
            Log.e(TAG, "LetheDeviceAdmin not active; falling back to legacy");
            WipeUtil.legacyWipe(ctx, reason == Trigger.PANIC);
            return;
        }

        int flags = WIPE_EXTERNAL_STORAGE;
        if (Build.VERSION.SDK_INT >= 28) flags |= WIPE_EUICC;
        if (Build.VERSION.SDK_INT >= 29 && shouldSilence(reason)) flags |= WIPE_SILENTLY;
        // WIPE_RESET_PROTECTION_DATA only honored on Device-Owner-managed
        // devices, which is exactly what ensureDeviceOwner sets up at boot.
        flags |= WIPE_RESET_PROTECTION;

        Log.w(TAG, "WIPE: reason=" + reason + " flags=0x" + Integer.toHexString(flags));
        try {
            dpm.wipeData(flags);
        } catch (SecurityException e) {
            Log.e(TAG, "DPM.wipeData refused; falling back to legacy", e);
            WipeUtil.legacyWipe(ctx, reason == Trigger.PANIC);
        }
    }

    /** Per-trigger silence map. Adversary-facing triggers wipe silently;
     *  user-initiated triggers already did their own UI upstream so we
     *  silence the system toast either way. */
    private static boolean shouldSilence(Trigger reason) {
        switch (reason) {
            case DURESS:
            case DMS:
            case FAILED_UNLOCK:
            case USB_SIGNAL:
                return true;
            case PANIC:           // countdown already happened upstream
            case EVERY_RESTART:   // boot splash shows separately
            default:
                return true;
        }
    }

    private static void audit(Trigger reason) {
        try {
            File dir = new File("/persist/lethe");
            if (!dir.exists()) dir.mkdirs();
            try (FileWriter w = new FileWriter(AUDIT_LOG, /*append*/ true)) {
                w.write(SystemClock.elapsedRealtime() + " " + reason.name() + "\n");
            }
        } catch (Exception e) {
            // Audit failure must never block a wipe.
            Log.w(TAG, "audit write failed", e);
        }
    }
}
