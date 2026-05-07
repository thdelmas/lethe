package org.osmosis.lethe;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.telephony.TelephonyManager;
import android.util.Log;

/**
 * BFU auto-reboot — return the device to the Before-First-Unlock state after
 * inactivity, evicting credential-encrypted file-system class keys from RAM.
 *
 * lethe#100. A powered-on phone in AFU (After-First-Unlock) state holds
 * unlocked CE class keys; cold-boot or DMA-style extraction recovers them.
 * Rebooting back to BFU forces an attacker to defeat the lockscreen
 * (rate-limited by the TEE) before they can read /data, which on Pixels
 * with Titan M2 is a meaningful jump in difficulty.
 *
 * Behavior:
 *   - SCREEN_OFF starts a countdown of `persist.lethe.bfu.timeout`.
 *   - SCREEN_ON or USER_PRESENT cancels.
 *   - At expiry: if not in an active call, reboot via PowerManager.
 *
 * Defaults:
 *   - persist.lethe.bfu.enabled = false  (opt-in for v1.x; default-on in
 *     Border Mode once that lands — lethe#110)
 *   - persist.lethe.bfu.timeout = 15
 *
 * Exemptions:
 *   - Active phone call (CALL_STATE_OFFHOOK / RINGING).
 *   - DMS check-in is fast (file write + return), so no exemption needed.
 *   - OTA in progress: track in a follow-up; today the worst case is the
 *     OTA is interrupted by reboot and the user retries.
 */
public class BfuRebootService extends Service {

    private static final String TAG = "lethe-bfu";
    private static final String CHANNEL_ID = "lethe_bfu";
    private static final int FG_NOTIFICATION_ID = 0x42465552; // "BFUR"

    private final Handler handler = new Handler(Looper.getMainLooper());
    private Runnable pendingReboot;
    private BroadcastReceiver screenReceiver;

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onCreate() {
        super.onCreate();

        if (!LetheConfig.isBfuEnabled()) {
            Log.i(TAG, "BFU auto-reboot disabled — stopping");
            stopSelf();
            return;
        }

        startForeground(FG_NOTIFICATION_ID, buildNotification());

        screenReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                String a = intent.getAction();
                if (Intent.ACTION_SCREEN_OFF.equals(a)) {
                    onScreenOff();
                } else if (Intent.ACTION_SCREEN_ON.equals(a)
                        || Intent.ACTION_USER_PRESENT.equals(a)) {
                    cancelPending();
                }
            }
        };
        IntentFilter f = new IntentFilter();
        f.addAction(Intent.ACTION_SCREEN_OFF);
        f.addAction(Intent.ACTION_SCREEN_ON);
        f.addAction(Intent.ACTION_USER_PRESENT);
        registerReceiver(screenReceiver, f);

        Log.i(TAG, "BFU auto-reboot active: timeout="
            + LetheConfig.getBfuTimeoutMinutes() + " min");
    }

    @Override
    public void onDestroy() {
        if (screenReceiver != null) unregisterReceiver(screenReceiver);
        cancelPending();
        super.onDestroy();
    }

    private void onScreenOff() {
        cancelPending();
        long timeoutMs = LetheConfig.getBfuTimeoutMinutes() * 60_000L;
        if (timeoutMs <= 0) return;
        Log.i(TAG, "Screen off — scheduling BFU reboot in " + timeoutMs + " ms");
        pendingReboot = new Runnable() {
            @Override
            public void run() {
                pendingReboot = null;
                triggerRebootIfPermitted();
            }
        };
        handler.postDelayed(pendingReboot, timeoutMs);
    }

    private void cancelPending() {
        if (pendingReboot != null) {
            handler.removeCallbacks(pendingReboot);
            pendingReboot = null;
            Log.i(TAG, "Pending BFU reboot cancelled");
        }
    }

    private void triggerRebootIfPermitted() {
        if (isInActiveCall()) {
            Log.i(TAG, "Active call detected — deferring BFU reboot 5 min");
            // Re-arm a short retry rather than skipping outright.
            pendingReboot = new Runnable() {
                @Override
                public void run() {
                    pendingReboot = null;
                    triggerRebootIfPermitted();
                }
            };
            handler.postDelayed(pendingReboot, 5L * 60_000L);
            return;
        }
        Log.w(TAG, "BFU timeout reached — rebooting to evict CE keys");
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                pm.reboot(null);
                return;
            }
        } catch (Exception e) {
            Log.e(TAG, "PowerManager.reboot failed", e);
        }
        // Fallback: plain reboot via init signal (only works if we have
        // android.uid.system; otherwise we silently no-op rather than fork
        // a su shell from a foreground service).
        LetheConfig.set("sys.powerctl", "reboot");
    }

    private boolean isInActiveCall() {
        try {
            TelephonyManager tm = (TelephonyManager)
                getSystemService(Context.TELEPHONY_SERVICE);
            if (tm == null) return false;
            int state = tm.getCallState();
            return state == TelephonyManager.CALL_STATE_OFFHOOK
                || state == TelephonyManager.CALL_STATE_RINGING;
        } catch (SecurityException e) {
            // READ_PHONE_STATE may not be granted; fail open (don't reboot
            // mid-call we can't observe).
            Log.w(TAG, "telephony state unreadable: " + e.getMessage());
            return true;
        }
    }

    private Notification buildNotification() {
        NotificationManager nm = (NotificationManager)
            getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm != null) {
            if (nm.getNotificationChannel(CHANNEL_ID) == null) {
                NotificationChannel ch = new NotificationChannel(
                    CHANNEL_ID, "Auto-reboot",
                    NotificationManager.IMPORTANCE_MIN);
                ch.setDescription("Periodic reboot to evict at-rest keys");
                ch.enableVibration(false);
                ch.setSound(null, null);
                ch.setShowBadge(false);
                nm.createNotificationChannel(ch);
            }
            return new Notification.Builder(this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_lock_idle_lock)
                .build();
        }
        return new Notification.Builder(this)
            .setSmallIcon(android.R.drawable.ic_lock_idle_lock)
            .setPriority(Notification.PRIORITY_MIN)
            .build();
    }
}
