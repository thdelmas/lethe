package org.osmosis.lethe;

import android.app.Notification;
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

        // Promote LetheDeviceAdmin to Device Owner if the provisioning
        // window is still open (DEVICE_PROVISIONED=0). Must run before
        // applyPolicy — applyPolicy bails if isAdminActive() is false,
        // which it is until setDeviceOwner activates the admin.
        AutoWipePolicy.ensureDeviceOwner(context);

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
            NotificationChannelCompat.startServiceCompat(context,
                new Intent(context, PanicPressService.class));
            Log.i(TAG, "Panic press monitor started");
        }

        // Start mesh BLE signaling if enabled
        if (LetheConfig.isMeshEnabled()) {
            NotificationChannelCompat.startServiceCompat(context,
                new Intent(context, LetheMeshService.class));
            Log.i(TAG, "Mesh service started");
        }

        // Start BFU auto-reboot monitor if enabled (lethe#100)
        if (LetheConfig.isBfuEnabled()) {
            NotificationChannelCompat.startServiceCompat(context,
                new Intent(context, BfuRebootService.class));
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

        new NotificationChannelCompat(
                CHANNEL_ID, "Burner mode", NotificationChannelCompat.IMPORTANCE_LOW)
            .setDescription("Active when burner mode is on")
            .setEnableVibration(false)
            .setSilent()
            .ensure(nm);

        Notification.Builder b = NotificationChannelCompat.newBuilder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentTitle("Burner mode active")
            .setContentText("Photos, files, and data are erased on reboot")
            .setOngoing(true);
        if (Build.VERSION.SDK_INT < 26) {
            b.setPriority(Notification.PRIORITY_LOW);
        }
        nm.notify(BURNER_NOTIFICATION_ID, b.build());
        Log.i(TAG, "Burner mode notification shown");
    }
}
