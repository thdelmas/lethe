package org.osmosis.lethe;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/**
 * Receives lethe.intent.DURESS_UNLOCK from the Keyguard overlay.
 *
 * When the user enters the duress PIN on the lock screen, the patched
 * Keyguard broadcasts this intent before proceeding with a normal-looking
 * unlock. This receiver triggers a silent background wipe via the
 * existing init property trigger (init.lethe-deadman.rc).
 *
 * The wipe runs in the background while the phone appears to work
 * normally — the adversary sees a clean home screen.
 */
public class DuressPinReceiver extends BroadcastReceiver {

    private static final String TAG = "lethe-duress";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!LetheConfig.isDuressPinEnabled()) {
            Log.d(TAG, "Duress PIN disabled — ignoring");
            return;
        }

        Log.w(TAG, "DURESS UNLOCK — triggering silent wipe");
        WipeUtil.triggerDuressWipe(context);
    }
}
