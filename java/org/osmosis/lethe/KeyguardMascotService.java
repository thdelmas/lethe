package org.osmosis.lethe;

import android.app.KeyguardManager;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.PixelFormat;
import android.os.IBinder;
import android.os.PowerManager;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;

/**
 * Guardian on the lock screen — floats the mascot bottom-center on the
 * keyguard, under the notification stack.
 *
 * Uses a TYPE_KEYGUARD_DIALOG window (INTERNAL_SYSTEM_WINDOW, granted by
 * the platform signature) rather than a SystemUI patch, so it ships in
 * the normal `mka Lethe` + adb install loop with no image rebuild.
 *
 * The window is NOT_TOUCHABLE: the bottom-center of the keyguard is the
 * swipe-to-unlock gesture zone, and a touchable window there would eat
 * the gesture. A fresh view is created per show — SpriteMascotView keeps
 * stripName across detach, so a reused instance skips reloading its
 * recycled strip.
 *
 * Gate: persist.lethe.mascot.keyguard (default off).
 */
public class KeyguardMascotService extends Service {

    private static final String TAG = "lethe-kg-mascot";
    /* Defaults; overridable without a rebuild via
     * persist.lethe.mascot.kg.size / .margin (dp). The window manager
     * clamps the box to the screen, so oversizing is safe. */
    private static final int SIZE_DP = 440;
    private static final int BOTTOM_MARGIN_DP = 40;

    private View mascot;

    private final BroadcastReceiver screenReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            String action = intent.getAction();
            if (Intent.ACTION_SCREEN_ON.equals(action)) {
                evaluate();
            } else if (Intent.ACTION_SCREEN_OFF.equals(action)
                    || Intent.ACTION_USER_PRESENT.equals(action)) {
                hide();
            }
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        IntentFilter filter = new IntentFilter();
        filter.addAction(Intent.ACTION_SCREEN_ON);
        filter.addAction(Intent.ACTION_SCREEN_OFF);
        filter.addAction(Intent.ACTION_USER_PRESENT);
        registerReceiver(screenReceiver, filter);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        evaluate();
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        unregisterReceiver(screenReceiver);
        hide();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    static boolean isEnabled() {
        return "true".equals(
            LetheConfig.get("persist.lethe.mascot.keyguard", "false"));
    }

    /** Show iff enabled, screen interactive, and keyguard showing. */
    private void evaluate() {
        if (!isEnabled()) { hide(); return; }
        KeyguardManager km = (KeyguardManager)
            getSystemService(Context.KEYGUARD_SERVICE);
        PowerManager pm = (PowerManager)
            getSystemService(Context.POWER_SERVICE);
        if (km != null && km.isKeyguardLocked()
                && pm != null && pm.isInteractive()) {
            show();
        } else {
            hide();
        }
    }

    private void show() {
        if (mascot != null) return;
        WindowManager wm = (WindowManager)
            getSystemService(Context.WINDOW_SERVICE);
        if (wm == null) return;

        mascot = SpriteMascotView.available(this)
            ? new SpriteMascotView(this) : new MascotView(this);

        // Clamp to the screen ourselves: an oversized window gets edge-
        // pinned by WM, not centered.
        float density = getResources().getDisplayMetrics().density;
        int size = Math.min(
            Math.round(propDp("persist.lethe.mascot.kg.size", SIZE_DP)
                * density),
            getResources().getDisplayMetrics().widthPixels);
        WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
            size, size,
            WindowManager.LayoutParams.TYPE_KEYGUARD_DIALOG,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,
            PixelFormat.TRANSLUCENT);
        lp.gravity = Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL;
        lp.y = Math.round(propDp("persist.lethe.mascot.kg.margin",
            BOTTOM_MARGIN_DP) * density);
        lp.setTitle("LetheKeyguardMascot");

        try {
            wm.addView(mascot, lp);
            Log.i(TAG, "Keyguard mascot shown");
        } catch (Exception e) {
            Log.e(TAG, "addView failed", e);
            mascot = null;
        }
    }

    private static int propDp(String key, int def) {
        try {
            return Math.max(48, Math.min(1000,
                Integer.parseInt(LetheConfig.get(key, String.valueOf(def)))));
        } catch (Exception e) {
            return def;
        }
    }

    private void hide() {
        if (mascot == null) return;
        WindowManager wm = (WindowManager)
            getSystemService(Context.WINDOW_SERVICE);
        try {
            wm.removeViewImmediate(mascot);
        } catch (Exception ignored) { }
        mascot = null;
        Log.i(TAG, "Keyguard mascot hidden");
    }
}
