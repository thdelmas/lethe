package org.osmosis.lethe;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.Vibrator;
import android.util.Log;

import java.util.ArrayList;

/**
 * Monitors rapid power button presses to trigger panic wipe.
 * Each press toggles the screen, producing SCREEN_ON/SCREEN_OFF broadcasts.
 * Five presses within 3 seconds = panic wipe.
 *
 * Default mode is "safe": after detection, a high-priority lockscreen
 * notification posts a countdown with a Cancel action. The wipe fires only
 * if the user does not cancel within panic_cooloff_s seconds (default 5).
 * "instant" mode bypasses the cancel window for high-risk users who
 * explicitly opt in. See lethe#106.
 *
 * Runs as a foreground service (required for persistent background work
 * on API 26+). The notification is minimal and silent.
 */
public class PanicPressService extends Service {

    private static final String TAG = "lethe-panic";
    private static final String CHANNEL_ID = "lethe_panic";
    private static final String CHANNEL_ID_ALERT = "lethe_panic_alert";
    private static final int FG_NOTIFICATION_ID = 0x50414E49; // "PANI"
    private static final int COUNTDOWN_NOTIFICATION_ID = 0x50414E32; // "PAN2"
    private static final long WINDOW_MS = 3000;

    static final String ACTION_CANCEL_WIPE =
        "org.osmosis.lethe.action.CANCEL_PANIC_WIPE";

    private int requiredEvents;
    private final ArrayList<Long> timestamps = new ArrayList<>();
    private BroadcastReceiver screenReceiver;
    private BroadcastReceiver cancelReceiver;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private Runnable pendingWipe;

    @Override
    public void onCreate() {
        super.onCreate();

        if (!LetheConfig.isPanicButtonEnabled()) {
            Log.i(TAG, "Panic button disabled — stopping");
            stopSelf();
            return;
        }

        int pressCount = LetheConfig.getPanicPressCount();
        // N presses = (2*N - 1) screen toggle events (OFF-ON-OFF-ON-OFF...)
        requiredEvents = pressCount * 2 - 1;
        Log.i(TAG, "Panic press monitor started: " + pressCount +
            " presses (" + requiredEvents + " events in " + WINDOW_MS + "ms)");

        startForeground(FG_NOTIFICATION_ID, buildIdleNotification());

        screenReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                onScreenEvent();
            }
        };
        IntentFilter filter = new IntentFilter();
        filter.addAction(Intent.ACTION_SCREEN_ON);
        filter.addAction(Intent.ACTION_SCREEN_OFF);
        registerReceiver(screenReceiver, filter);

        cancelReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                cancelPendingWipe();
            }
        };
        IntentFilter cancelFilter = new IntentFilter(ACTION_CANCEL_WIPE);
        // Cancel intent is fired by the user via the lockscreen notification,
        // not exported to other apps.
        // The 3-arg registerReceiver(receiver, filter, int) and the
        // RECEIVER_NOT_EXPORTED constant (0x4) are both API 33+. On cm-14.1's
        // API-25 framework.jar neither symbol resolves, so call reflectively
        // when present and fall back to the 2-arg form otherwise.
        boolean registered = false;
        if (Build.VERSION.SDK_INT >= 33) {
            try {
                Context.class.getMethod("registerReceiver",
                        BroadcastReceiver.class, IntentFilter.class, int.class)
                    .invoke(this, cancelReceiver, cancelFilter, 0x4);
                registered = true;
            } catch (ReflectiveOperationException e) {
                Log.w(TAG, "registerReceiver(flags) failed; using 2-arg form", e);
            }
        }
        if (!registered) {
            registerReceiver(cancelReceiver, cancelFilter);
        }
    }

    private void onScreenEvent() {
        // Already counting down — extra presses don't accelerate the wipe.
        if (pendingWipe != null) {
            return;
        }

        long now = System.currentTimeMillis();
        timestamps.add(now);

        long cutoff = now - WINDOW_MS;
        while (!timestamps.isEmpty() && timestamps.get(0) < cutoff) {
            timestamps.remove(0);
        }

        if (timestamps.size() >= requiredEvents) {
            timestamps.clear();
            onPanicDetected();
        }
    }

    private void onPanicDetected() {
        String mode = LetheConfig.getPanicMode();
        int cooloff = LetheConfig.getPanicCooloffSeconds();

        if ("instant".equals(mode) || cooloff <= 0) {
            Log.w(TAG, "PANIC PRESS DETECTED — instant wipe (mode=" + mode + ")");
            WipeUtil.triggerPanicWipe(this);
            return;
        }

        Log.w(TAG, "PANIC PRESS DETECTED — wiping in " + cooloff + "s (cancellable)");
        vibrate(300);
        postCountdownNotification(cooloff);

        pendingWipe = new Runnable() {
            @Override
            public void run() {
                pendingWipe = null;
                clearCountdownNotification();
                Log.w(TAG, "Cooloff expired — triggering wipe");
                WipeUtil.triggerPanicWipe(PanicPressService.this);
            }
        };
        handler.postDelayed(pendingWipe, cooloff * 1000L);
    }

    private void cancelPendingWipe() {
        if (pendingWipe == null) {
            return;
        }
        Log.i(TAG, "Panic wipe cancelled by user");
        handler.removeCallbacks(pendingWipe);
        pendingWipe = null;
        clearCountdownNotification();
        vibrate(80);
    }

    private void postCountdownNotification(int cooloffSeconds) {
        NotificationManager nm = (NotificationManager)
            getSystemService(NOTIFICATION_SERVICE);
        if (nm == null) return;

        ensureChannels(nm);

        Intent cancel = new Intent(ACTION_CANCEL_WIPE).setPackage(getPackageName());
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent cancelPi = PendingIntent.getBroadcast(
            this, 0, cancel, flags);

        Notification.Builder b = NotificationChannelCompat.newBuilder(this, CHANNEL_ID_ALERT);
        if (Build.VERSION.SDK_INT < 26) {
            b.setPriority(Notification.PRIORITY_MAX);
        }
        b.setSmallIcon(android.R.drawable.ic_lock_idle_lock)
         .setContentTitle("Panic wipe in " + cooloffSeconds + "s")
         .setContentText("Tap Cancel to abort")
         .setOngoing(true)
         .setAutoCancel(false)
         .setCategory(Notification.CATEGORY_ALARM)
         .setVisibility(Notification.VISIBILITY_PUBLIC)
         .addAction(new Notification.Action.Builder(
                android.R.drawable.ic_menu_close_clear_cancel,
                "Cancel wipe", cancelPi).build());
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            b.setColor(0xFFD32F2F);
        }
        nm.notify(COUNTDOWN_NOTIFICATION_ID, b.build());
    }

    private void clearCountdownNotification() {
        NotificationManager nm = (NotificationManager)
            getSystemService(NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.cancel(COUNTDOWN_NOTIFICATION_ID);
        }
    }

    private Notification buildIdleNotification() {
        NotificationManager nm = (NotificationManager)
            getSystemService(NOTIFICATION_SERVICE);
        if (nm != null) ensureChannels(nm);

        Notification.Builder b = NotificationChannelCompat.newBuilder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_lock_idle_lock);
        if (Build.VERSION.SDK_INT < 26) {
            b.setPriority(Notification.PRIORITY_MIN);
        }
        return b.build();
    }

    private void ensureChannels(NotificationManager nm) {
        new NotificationChannelCompat(
                CHANNEL_ID, "Security", NotificationChannelCompat.IMPORTANCE_MIN)
            .setDescription("Security monitoring")
            .setEnableVibration(false)
            .setSilent()
            .setShowBadge(false)
            .ensure(nm);
        new NotificationChannelCompat(
                CHANNEL_ID_ALERT, "Panic countdown", NotificationChannelCompat.IMPORTANCE_HIGH)
            .setDescription("Cancel-window before panic wipe")
            .setEnableVibration(true)
            .setLockscreenVisibility(Notification.VISIBILITY_PUBLIC)
            .ensure(nm);
    }

    private void vibrate(long ms) {
        try {
            Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            if (v != null && v.hasVibrator()) {
                v.vibrate(ms);
            }
        } catch (Exception e) {
            // Vibration is optional feedback
        }
    }

    @Override
    public void onDestroy() {
        if (screenReceiver != null) unregisterReceiver(screenReceiver);
        if (cancelReceiver != null) unregisterReceiver(cancelReceiver);
        if (pendingWipe != null) {
            handler.removeCallbacks(pendingWipe);
            pendingWipe = null;
        }
        clearCountdownNotification();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
