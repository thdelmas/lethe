package org.osmosis.lethe;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.BatteryManager;
import android.provider.Settings;
import android.util.Log;

import java.util.Calendar;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * The avatar's vitals — one arbiter for how the phone *is*, kept
 * separate from what it is *doing*.
 *
 * Doctrine (docs/design/avatar-ui.md): colour and animation are
 * orthogonal channels. This class owns the colour channel only: it
 * observes the device's own condition and resolves a single VITAL_*.
 * Behaviour (idle / listening / thinking / …) stays on
 * MascotViews.setState and never touches colour. An amber listening
 * avatar therefore reads "I hear you, and something also wants your
 * attention" — one meaning per channel.
 *
 * Inputs are permission-free by construction. Everything here is a
 * sticky broadcast, a world-readable setting, or a system property:
 * the avatar must not become a reason to hold permissions a privacy
 * OS would otherwise refuse.
 *
 * Gates:
 *   persist.lethe.mascot.vitals       "false" pins to nominal
 *   persist.lethe.mascot.vital.force  force a vital by name (testing —
 *                                     verify the palette without
 *                                     draining the battery or killing
 *                                     tor)
 *   persist.lethe.mascot.tint.<vital> per-vital colour override (hex)
 */
public final class MascotStateController {

    private static final String TAG = "lethe-vitals";

    /* The colour channel. Deliberately small — a vital scale, not a
     * mood ring; every addition costs legibility. */
    public static final String VITAL_NOMINAL = "nominal";
    public static final String VITAL_ATTENTION = "attention";
    public static final String VITAL_ALARM = "alarm";
    public static final String VITAL_RESTING = "resting";
    public static final String VITAL_SESSION = "session";

    /** vital → default colour (sRGB hex, no #). */
    private static final String[][] PALETTE = {
        { VITAL_NOMINAL, "58e06b" },     // green   — all guarantees held
        { VITAL_ATTENTION, "f2c14e" },   // amber   — something wants you
        { VITAL_ALARM, "ff4f3e" },       // red     — a guarantee is broken
        { VITAL_RESTING, "7a5cff" },     // violet  — night / at rest
        { VITAL_SESSION, "35e0b8" },     // teal    — agentic session live
    };

    private static final int BATTERY_LOW_PCT = 15;
    private static final int NIGHT_FROM_HOUR = 23;
    private static final int NIGHT_TO_HOUR = 6;

    public interface Listener {
        void onVitalChanged(String vital);
    }

    private static MascotStateController sInstance;

    private final Context appContext;
    private final CopyOnWriteArrayList<Listener> listeners =
        new CopyOnWriteArrayList<>();

    private String vital = VITAL_NOMINAL;
    private boolean registered;
    private boolean sessionActive;
    private int batteryPct = 100;
    private boolean charging = true;

    private final BroadcastReceiver receiver = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            if (Intent.ACTION_BATTERY_CHANGED.equals(intent.getAction())) {
                readBattery(intent);
            }
            reevaluate();
        }
    };

    private MascotStateController(Context context) {
        appContext = context.getApplicationContext();
    }

    public static synchronized MascotStateController get(Context context) {
        if (sInstance == null) {
            sInstance = new MascotStateController(context);
        }
        return sInstance;
    }

    // --- listeners --------------------------------------------------------------

    /** Receivers are registered only while something is watching — an
     *  avatar nobody can see must not cost wakeups. */
    public void addListener(Listener listener) {
        listeners.addIfAbsent(listener);
        if (!registered) {
            IntentFilter f = new IntentFilter();
            f.addAction(Intent.ACTION_BATTERY_CHANGED);
            f.addAction(Intent.ACTION_SCREEN_ON);
            f.addAction(Intent.ACTION_AIRPLANE_MODE_CHANGED);
            // TIME_TICK (1/min, only while registered) carries the
            // night boundary and re-polls tor without a custom timer.
            f.addAction(Intent.ACTION_TIME_TICK);
            Intent sticky = appContext.registerReceiver(receiver, f);
            if (sticky != null) readBattery(sticky);   // battery is sticky
            registered = true;
        }
        reevaluate();
        listener.onVitalChanged(vital);
    }

    public void removeListener(Listener listener) {
        listeners.remove(listener);
        if (listeners.isEmpty() && registered) {
            try {
                appContext.unregisterReceiver(receiver);
            } catch (Exception ignored) { }
            registered = false;
        }
    }

    public String vital() {
        return vital;
    }

    /** Agentic session opened/closed (ChatActivity, voice). */
    public void setSessionActive(boolean active) {
        if (sessionActive == active) return;
        sessionActive = active;
        reevaluate();
    }

    // --- inputs -----------------------------------------------------------------

    private void readBattery(Intent intent) {
        int level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
        int scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
        if (level >= 0 && scale > 0) batteryPct = level * 100 / scale;
        int status = intent.getIntExtra(BatteryManager.EXTRA_STATUS,
            BatteryManager.BATTERY_STATUS_UNKNOWN);
        charging = status == BatteryManager.BATTERY_STATUS_CHARGING
            || status == BatteryManager.BATTERY_STATUS_FULL;
    }

    /** Tor is the load-bearing privacy guarantee: every user-app TCP
     *  routes through its TransPort. Configured-but-not-running means
     *  the guarantee the OS advertises is not being kept — the one
     *  condition that earns alarm. */
    private boolean torBroken() {
        String state = LetheConfig.get("init.svc.lethe_tor", "");
        if (state.isEmpty()) return false;      // not part of this build
        return !"running".equals(state);
    }

    private boolean airplane() {
        try {
            return Settings.Global.getInt(appContext.getContentResolver(),
                Settings.Global.AIRPLANE_MODE_ON, 0) != 0;
        } catch (Exception e) {
            return false;
        }
    }

    private static boolean night() {
        int h = Calendar.getInstance().get(Calendar.HOUR_OF_DAY);
        return h >= NIGHT_FROM_HOUR || h < NIGHT_TO_HOUR;
    }

    // --- arbitration ------------------------------------------------------------

    /** Priority: a broken guarantee outranks a request for attention,
     *  which outranks a live session, which outranks rest. Airplane
     *  mode is deliberately NOT a vital — being offline is a normal
     *  state for this OS, not a fault. */
    private String resolve() {
        String forced = LetheConfig.get("persist.lethe.mascot.vital.force", "");
        if (!forced.isEmpty()) return forced;
        if (!"false".equals(LetheConfig.get("persist.lethe.mascot.vitals", "true"))) {
            if (torBroken()) return VITAL_ALARM;
            if (batteryPct <= BATTERY_LOW_PCT && !charging) return VITAL_ATTENTION;
            if (sessionActive) return VITAL_SESSION;
            if (night()) return VITAL_RESTING;
        }
        return VITAL_NOMINAL;
    }

    private void reevaluate() {
        String next = resolve();
        if (next.equals(vital)) return;
        vital = next;
        Log.i(TAG, "vital -> " + vital
            + " (batt=" + batteryPct + (charging ? "+" : "-")
            + " tor=" + LetheConfig.get("init.svc.lethe_tor", "?")
            + " session=" + sessionActive + ")");
        for (Listener l : listeners) {
            try {
                l.onVitalChanged(vital);
            } catch (Exception e) {
                Log.w(TAG, "listener failed", e);
            }
        }
    }

    // --- palette ----------------------------------------------------------------

    /** sRGB hex for a vital: per-vital prop override, else the palette.
     *  Returns "" when unknown, which the view reads as "leave the
     *  model's own colour alone". */
    public static String colorFor(String vital) {
        String override =
            LetheConfig.get("persist.lethe.mascot.tint." + vital, "");
        if (!override.isEmpty()) return override;
        for (String[] pair : PALETTE) {
            if (pair[0].equals(vital)) return pair[1];
        }
        return "";
    }
}
