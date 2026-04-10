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
import android.os.IBinder;
import android.util.Log;

import java.util.ArrayList;

/**
 * Monitors rapid power button presses to trigger panic wipe.
 * Each press toggles the screen, producing SCREEN_ON/SCREEN_OFF broadcasts.
 * Five presses within 3 seconds = panic wipe.
 *
 * Runs as a foreground service (required for persistent background work
 * on API 26+). The notification is minimal and silent.
 */
public class PanicPressService extends Service {

    private static final String TAG = "lethe-panic";
    private static final String CHANNEL_ID = "lethe_panic";
    private static final int FG_NOTIFICATION_ID = 0x50414E49; // "PANI"
    private static final long WINDOW_MS = 3000;

    private int requiredEvents;
    private final ArrayList<Long> timestamps = new ArrayList<>();
    private BroadcastReceiver screenReceiver;

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

        startForeground(FG_NOTIFICATION_ID, buildNotification());

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
    }

    private void onScreenEvent() {
        long now = System.currentTimeMillis();
        timestamps.add(now);

        // Trim events outside the sliding window
        long cutoff = now - WINDOW_MS;
        while (!timestamps.isEmpty() && timestamps.get(0) < cutoff) {
            timestamps.remove(0);
        }

        if (timestamps.size() >= requiredEvents) {
            Log.w(TAG, "PANIC PRESS DETECTED — triggering wipe");
            timestamps.clear();
            WipeUtil.triggerPanicWipe(this);
        }
    }

    private Notification buildNotification() {
        NotificationManager nm = (NotificationManager)
            getSystemService(NOTIFICATION_SERVICE);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm != null) {
            if (nm.getNotificationChannel(CHANNEL_ID) == null) {
                NotificationChannel ch = new NotificationChannel(
                    CHANNEL_ID, "Security", NotificationManager.IMPORTANCE_MIN);
                ch.setDescription("Security monitoring");
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

    @Override
    public void onDestroy() {
        if (screenReceiver != null) {
            unregisterReceiver(screenReceiver);
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
