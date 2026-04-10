package org.osmosis.lethe;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

/**
 * Starts persistent LETHE services on BOOT_COMPLETED.
 */
public class BootReceiver extends BroadcastReceiver {

    private static final String TAG = "lethe-boot";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;

        Log.i(TAG, "Boot completed — starting LETHE services");

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
    }
}
