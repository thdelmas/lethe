package org.osmosis.lethe;

import android.app.admin.DeviceAdminReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/**
 * Device Admin receiver for LETHE.
 *
 * Promoted to Device Owner at first boot from BootReceiver.onReceive,
 * via {@link AutoWipePolicy#ensureDeviceOwner}. That registration is
 * what gives AutoWipePolicy a working wipe path — DPM.wipeData() runs
 * as system_server, which is exempt from the system_data_file
 * neverallow that today's lethe-domain rm-sweep hits.
 *
 * Phase 1 ships the receiver only; Phase 2 wires AutoWipePolicy through
 * it; Phase 3 hooks onPasswordFailed for the iPhone-style trigger.
 */
public class LetheDeviceAdmin extends DeviceAdminReceiver {

    private static final String TAG = "lethe-admin";

    /** Returns the component for use with DevicePolicyManager calls. */
    public static ComponentName getComponent(Context ctx) {
        return new ComponentName(ctx, LetheDeviceAdmin.class);
    }

    @Override
    public void onEnabled(Context context, Intent intent) {
        Log.i(TAG, "Device Admin enabled");
        // Push current policy now that we're admin.
        AutoWipePolicy.applyPolicy(context);
    }

    @Override
    public void onDisabled(Context context, Intent intent) {
        Log.w(TAG, "Device Admin disabled");
    }

    @Override
    public void onPasswordFailed(Context context, Intent intent) {
        AutoWipePolicy.onPasswordFailed(context);
    }

    @Override
    public void onPasswordSucceeded(Context context, Intent intent) {
        Log.d(TAG, "onPasswordSucceeded");
    }
}
