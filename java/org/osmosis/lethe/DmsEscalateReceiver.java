package org.osmosis.lethe;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/**
 * Receives {@code lethe.intent.DMS_ESCALATE_STAGE2} from the dead-man's
 * switch monitor when grace period + check-in interval are both blown.
 *
 * Stage 2 of DMS is the wipe stage (see overlays/dead-mans-switch.conf:55-74).
 * Pre-v1.2 this fired through the partial-failing shell rm-sweep; now it
 * routes through {@link AutoWipePolicy#executeWipe} which uses
 * DPM.wipeData under the system_server domain.
 *
 * Stage 1 (lock) and Stage 3 (brick) are separate; this receiver is
 * Stage-2-only by intent contract.
 */
public class DmsEscalateReceiver extends BroadcastReceiver {

    private static final String TAG = "lethe-dms-escalate";
    public static final String ACTION_STAGE2 = "lethe.intent.DMS_ESCALATE_STAGE2";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!ACTION_STAGE2.equals(intent.getAction())) return;
        if (!AutoWipePolicy.isTriggerEnabled(AutoWipePolicy.Trigger.DMS)) {
            Log.i(TAG, "DMS trigger disabled — ignoring escalation");
            return;
        }
        Log.w(TAG, "DMS Stage 2 — wiping");
        AutoWipePolicy.executeWipe(context, AutoWipePolicy.Trigger.DMS);
    }
}
