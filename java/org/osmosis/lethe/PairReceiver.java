package org.osmosis.lethe;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * Receives {@code lethe.intent.PAIR} from a partner OSmosis device over
 * USB and merges the handed-off provider key into the persisted LETHE
 * config.
 *
 * Pre-#159 this receiver was registered at runtime inside
 * {@link LetheActivity#onCreate} — but that activity is unreachable on
 * user builds (WebView banned in privileged processes since Android
 * 7.0; the app holds {@code sharedUserId="android.uid.system"}). So on
 * shipping cm-14.1 ROMs the activity crashes, the receiver never
 * registers, and a paired OSmosis device cannot configure cloud
 * providers. Declared in the manifest, this receiver runs without an
 * activity attached and the pair flow works on user builds.
 *
 * Trigger:
 * <pre>
 *   adb shell am broadcast -a lethe.intent.PAIR \
 *       --es provider anthropic \
 *       --es key sk-ant-... \
 *       [--es model claude-opus-4-6]
 * </pre>
 *
 * Security: the intent is currently unprotected — any app on the device
 * could broadcast it and inject a provider key. Pre-existing behavior
 * (the in-activity receiver had no permission gate either). A
 * sig|priv permission gate would block adb shell broadcasts from the
 * OSmosis partner, so the right fix is a more selective check (sender
 * UID == SHELL_UID || SYSTEM_UID) — tracked separately.
 */
public class PairReceiver extends BroadcastReceiver {

    private static final String TAG = "lethe-pair";
    public static final String ACTION_PAIR = "lethe.intent.PAIR";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!ACTION_PAIR.equals(intent.getAction())) return;

        String provider = intent.getStringExtra("provider");
        String key = intent.getStringExtra("key");
        String model = intent.getStringExtra("model");
        if (provider == null || provider.isEmpty()
                || key == null || key.isEmpty()) {
            Log.w(TAG, "PAIR missing provider or key — dropping");
            return;
        }

        // Idempotent: LetheConfig caches the dir on first call.
        LetheConfig.initConfigDir(context);

        try {
            String merged = merge(
                LetheConfig.loadPersistedConfig(), provider, key, model);
            String result = LetheConfig.savePersistedConfig(merged);
            if ("ok".equals(result)) {
                Log.i(TAG, "Paired provider=" + provider);
            } else {
                Log.e(TAG, "Pair save failed: " + result);
            }
        } catch (JSONException e) {
            Log.e(TAG, "Pair config merge failed", e);
        }
    }

    /**
     * Visible for testing. Merges a pair handoff into the persisted
     * config JSON, returning the new JSON string. {@code provider} and
     * {@code key} are required (non-null, non-empty); {@code model} is
     * optional and only written when non-null and non-empty. Sets
     * {@code active_provider} to the paired provider so the UI picks
     * it up immediately.
     */
    static String merge(String currentJson, String provider, String key,
                        String model) throws JSONException {
        JSONObject cfg = new JSONObject(currentJson);
        JSONObject providers = cfg.optJSONObject("providers");
        if (providers == null) {
            providers = new JSONObject();
            cfg.put("providers", providers);
        }
        JSONObject pc = providers.optJSONObject(provider);
        if (pc == null) pc = new JSONObject();
        pc.put("key", key);
        if (model != null && !model.isEmpty()) {
            pc.put("model", model);
        }
        providers.put(provider, pc);
        cfg.put("active_provider", provider);
        return cfg.toString();
    }
}
