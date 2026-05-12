package org.osmosis.lethe;

import android.app.Notification;
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

        Notification.Builder b = NotificationChannelCompat.newBuilder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_lock_idle_lock)
            .setContentTitle(title)
            .setContentText(body)
            .setContentIntent(pi)
            .setAutoCancel(true);
        if (Build.VERSION.SDK_INT < 26) {
            b.setPriority(Notification.PRIORITY_LOW);
        }
        nm.notify(NOTIFICATION_ID, b.build());
    }

    private void ensureChannel(NotificationManager nm) {
        new NotificationChannelCompat(
                CHANNEL_ID, "System", NotificationChannelCompat.IMPORTANCE_LOW)
            .setDescription("LETHE system notifications")
            .setEnableVibration(false)
            .setSilent()
            .ensure(nm);
    }
}
