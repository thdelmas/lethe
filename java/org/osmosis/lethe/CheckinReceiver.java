package org.osmosis.lethe;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

/**
 * Receives lethe.intent.CHECKIN_DUE from the deadman monitor init service.
 * Shows a mundane notification that opens the passphrase dialog on tap.
 */
public class CheckinReceiver extends BroadcastReceiver {

    private static final String TAG = "lethe-deadman";
    static final String CHANNEL_ID = "lethe_system";
    static final int NOTIFICATION_ID = 0x4C455448; // "LETH"

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!LetheConfig.isDeadmanEnabled()) return;

        Log.i(TAG, "Check-in due — showing notification");

        NotificationManager nm = (NotificationManager)
            context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        ensureChannel(nm);

        Intent dialogIntent = new Intent(context, CheckinDialogActivity.class);
        dialogIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 31) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent pi = PendingIntent.getActivity(
            context, 0, dialogIntent, flags);

        // Notification text matches dead-mans-switch.conf grace_notification_text
        String title = "System update";
        String body = "Scheduled maintenance pending";

        Notification notification;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            notification = new Notification.Builder(context, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_lock_idle_lock)
                .setContentTitle(title)
                .setContentText(body)
                .setContentIntent(pi)
                .setAutoCancel(true)
                .build();
        } else {
            notification = new Notification.Builder(context)
                .setSmallIcon(android.R.drawable.ic_lock_idle_lock)
                .setContentTitle(title)
                .setContentText(body)
                .setContentIntent(pi)
                .setPriority(Notification.PRIORITY_LOW)
                .setAutoCancel(true)
                .build();
        }

        nm.notify(NOTIFICATION_ID, notification);
    }

    private void ensureChannel(NotificationManager nm) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        if (nm.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel ch = new NotificationChannel(
            CHANNEL_ID, "System", NotificationManager.IMPORTANCE_LOW);
        ch.setDescription("LETHE system notifications");
        ch.enableVibration(false);
        ch.setSound(null, null);
        nm.createNotificationChannel(ch);
    }
}
