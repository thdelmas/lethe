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
 * Receives lethe.intent.OTA_AVAILABLE from the OTA update script.
 * Shows a notification so the user knows an update is ready.
 *
 * For "auto" policy, the update installs on next reboot without
 * user action — the notification is informational only.
 * For "prompt" policy, tapping opens system updater settings.
 */
public class OtaReceiver extends BroadcastReceiver {

    private static final String TAG = "lethe-ota";
    private static final String CHANNEL_ID = "lethe_updates";
    private static final int NOTIFICATION_ID = 0x4F544100; // "OTA\0"

    @Override
    public void onReceive(Context context, Intent intent) {
        String version = intent.getStringExtra("version");
        String policy = intent.getStringExtra("policy");
        boolean isSecurity = intent.getBooleanExtra("is_security_patch", false);

        Log.i(TAG, "OTA available: v" + version +
            " policy=" + policy + " security=" + isSecurity);

        NotificationManager nm = (NotificationManager)
            context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        ensureChannel(nm);

        String title = isSecurity
            ? "Security update available"
            : "LETHE update available";
        String body = "Version " + version + " is ready to install.";
        if ("auto".equals(policy)) {
            body += " It will install on next reboot.";
        }

        // Tap opens system updater (or LETHE settings in the future)
        Intent tapIntent = new Intent(android.provider.Settings.ACTION_DEVICE_INFO_SETTINGS);
        tapIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 31) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent pi = PendingIntent.getActivity(
            context, 0, tapIntent, flags);

        Notification.Builder b = NotificationChannelCompat.newBuilder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_download_done)
            .setContentTitle(title)
            .setContentText(body)
            .setContentIntent(pi)
            .setAutoCancel(true);
        if (Build.VERSION.SDK_INT < 26) {
            b.setPriority(Notification.PRIORITY_DEFAULT);
        }
        nm.notify(NOTIFICATION_ID, b.build());
    }

    private void ensureChannel(NotificationManager nm) {
        new NotificationChannelCompat(
                CHANNEL_ID, "Updates", NotificationChannelCompat.IMPORTANCE_DEFAULT)
            .setDescription("LETHE system updates")
            .ensure(nm);
    }
}
