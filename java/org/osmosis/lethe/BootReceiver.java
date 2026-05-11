package org.osmosis.lethe;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

/**
 * Starts persistent LETHE services on BOOT_COMPLETED.
 * Also shows a persistent notification when burner mode is active
 * so the user knows data won't survive a reboot.
 */
public class BootReceiver extends BroadcastReceiver {

    private static final String TAG = "lethe-boot";
    private static final String CHANNEL_ID = "lethe_burner";
    private static final int BURNER_NOTIFICATION_ID = 0x4255524E; // "BURN"

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;

        Log.i(TAG, "Boot completed — starting LETHE services");

        // One-shot upgrade migration from v1.0/v1.1 property names.
        AutoWipePolicy.migrateLegacyProps();

        // Re-apply auto-wipe policy to DPM (idempotent). This is what pushes
        // setMaximumFailedPasswordsForWipe(N) so a hostile actor failing N
        // unlocks gets the device wiped by the stock keyguard.
        AutoWipePolicy.applyPolicy(context);

        // NOTE: the EVERY_RESTART trigger is intentionally NOT invoked here.
        // Routing it through DPM.wipeData would reboot-to-recovery, then
        // BootReceiver fires again on the next boot and loops forever.
        // Every-restart stays on the post-fs-data shell path
        // (init.lethe-burner.rc → lethe-burner-wipe.sh). When per-session
        // crypto-erase ships (feat/per-session-keys), EVERY_RESTART becomes
        // an O(1) keyring teardown and rejoins this chokepoint.

        // Start panic press monitor if enabled
        if (LetheConfig.isPanicButtonEnabled()) {
            Intent svc = new Intent(context, PanicPressService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(svc);
            } else {
                context.startService(svc);
            }
            Log.i(TAG, "Panic press monitor started");
        }

        // Start mesh BLE signaling if enabled
        if (LetheConfig.isMeshEnabled()) {
            Intent mesh = new Intent(context, LetheMeshService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(mesh);
            } else {
                context.startService(mesh);
            }
            Log.i(TAG, "Mesh service started");
        }

        // Start BFU auto-reboot monitor if enabled (lethe#100)
        if (LetheConfig.isBfuEnabled()) {
            Intent bfu = new Intent(context, BfuRebootService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(bfu);
            } else {
                context.startService(bfu);
            }
            Log.i(TAG, "BFU auto-reboot monitor started");
        }

        // Show persistent burner mode notification
        if ("true".equals(
                LetheConfig.get("persist.lethe.burner.enabled", "false"))) {
            showBurnerNotification(context);
        }
    }

    static void showBurnerNotification(Context context) {
        NotificationManager nm = (NotificationManager)
            context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (nm.getNotificationChannel(CHANNEL_ID) == null) {
                NotificationChannel ch = new NotificationChannel(
                    CHANNEL_ID, "Burner mode",
                    NotificationManager.IMPORTANCE_LOW);
                ch.setDescription("Active when burner mode is on");
                ch.enableVibration(false);
                ch.setSound(null, null);
                nm.createNotificationChannel(ch);
            }
        }

        Notification notification;
        String title = "Burner mode active";
        String body = "Photos, files, and data are erased on reboot";

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            notification = new Notification.Builder(context, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_dialog_alert)
                .setContentTitle(title)
                .setContentText(body)
                .setOngoing(true)
                .build();
        } else {
            notification = new Notification.Builder(context)
                .setSmallIcon(android.R.drawable.ic_dialog_alert)
                .setContentTitle(title)
                .setContentText(body)
                .setPriority(Notification.PRIORITY_LOW)
                .setOngoing(true)
                .build();
        }

        nm.notify(BURNER_NOTIFICATION_ID, notification);
        Log.i(TAG, "Burner mode notification shown");
    }
}
