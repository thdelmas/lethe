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
import android.view.WindowManagerGlobal;

import com.android.internal.policy.KeyguardDismissCallback;

/**
 * Guardian on the lock screen — floats the mascot bottom-center on the
 * keyguard, under the notification stack.
 *
 * Uses a TYPE_KEYGUARD_DIALOG window (INTERNAL_SYSTEM_WINDOW, granted by
 * the platform signature) rather than a SystemUI patch, so it ships in
 * the normal `mka Lethe` + adb install loop with no image rebuild.
 *
 * The mascot's box IS touchable (since 07-08): tap or fling-up on the
 * guardian starts the unlock flow (KeyguardDismissActivity → bouncer),
 * matching what the swipe-to-unlock zone under it would do — both
 * gestures lead to the same place, so eating them costs nothing.
 * Touches OUTSIDE the box keep the greet-then-get-out-of-the-way
 * behavior. A fresh view is created per show — SpriteMascotView keeps
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
    private final android.os.Handler handler = new android.os.Handler();
    private final Runnable reshow = new Runnable() {
        @Override public void run() { evaluate(); }
    };

    private final BroadcastReceiver screenReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            String action = intent.getAction();
            if (Intent.ACTION_SCREEN_ON.equals(action)) {
                evaluate();
            } else if (Intent.ACTION_SCREEN_OFF.equals(action)
                    || Intent.ACTION_USER_PRESENT.equals(action)) {
                handler.removeCallbacks(reshow);
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
        handler.removeCallbacks(reshow);
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

        mascot = MascotViews.create(this);

        // Clamp to the screen ourselves: an oversized window gets edge-
        // pinned by WM, not centered.
        float density = getResources().getDisplayMetrics().density;
        int size = Math.min(
            Math.round(propDp("persist.lethe.mascot.kg.size", SIZE_DP)
                * density),
            getResources().getDisplayMetrics().widthPixels);
        // Touchable box + WATCH_OUTSIDE_TOUCH: touches ON the mascot are
        // ours (tap / fling-up → unlock flow); every other screen touch
        // is an OUTSIDE event. The TYPE_KEYGUARD_DIALOG layer sits above
        // the bouncer, so outside interactions (swipe-to-PIN, PIN typing)
        // hide the mascot before it can cover the PIN pad; it comes back
        // after a quiet period or on the next screen-on.
        WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
            size, size,
            WindowManager.LayoutParams.TYPE_KEYGUARD_DIALOG,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                | WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH,
            PixelFormat.TRANSLUCENT);
        lp.gravity = Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL;
        lp.y = Math.round(propDp("persist.lethe.mascot.kg.margin",
            BOTTOM_MARGIN_DP) * density);
        lp.setTitle("LetheKeyguardMascot");
        final android.view.GestureDetector gd = new android.view.GestureDetector(
            this, new android.view.GestureDetector.SimpleOnGestureListener() {
                @Override public boolean onSingleTapUp(
                        android.view.MotionEvent e) {
                    startUnlockFlow();
                    return true;
                }
                @Override public boolean onFling(android.view.MotionEvent e1,
                        android.view.MotionEvent e2, float vx, float vy) {
                    if (e1 != null && e2 != null
                            && e2.getY() - e1.getY() < -80 * density
                            && vy < -500) {
                        startUnlockFlow();
                        return true;
                    }
                    return false;
                }
            });
        mascot.setOnTouchListener(new View.OnTouchListener() {
            @Override public boolean onTouch(View v, android.view.MotionEvent e) {
                if (e.getActionMasked()
                        == android.view.MotionEvent.ACTION_OUTSIDE) {
                    // Hide out of the interaction's way (PIN pad included),
                    // then return after a quiet period with the keyguard
                    // still up — each further touch (PIN typing) pushes the
                    // timer back. 0 disables the re-show.
                    hide();
                    int quiet = propMs("persist.lethe.mascot.kg.reshow", 3500);
                    if (quiet > 0) {
                        handler.removeCallbacks(reshow);
                        handler.postDelayed(reshow, quiet);
                    }
                    return false;
                }
                gd.onTouchEvent(e);
                return true;
            }
        });

        try {
            wm.addView(mascot, lp);
            Log.i(TAG, "Keyguard mascot shown");
        } catch (Exception e) {
            Log.e(TAG, "addView failed", e);
            mascot = null;
        }
    }

    /** Tap on the guardian → system unlock flow (bouncer, or straight
     *  through when the device is unsecured/trusted).
     *
     *  Goes to IWindowManager directly rather than
     *  KeyguardManager.requestDismissKeyguard: that one is activity-
     *  scoped and fails with onDismissError unless the requesting
     *  activity is already visible over the keyguard — a service has no
     *  such activity, and a transparent trampoline launched into the
     *  mascot's task inherits its hidden-behind-keyguard visibility
     *  (measured 07-08). CONTROL_KEYGUARD is granted by the platform
     *  signature.
     *
     *  Hide first so the mascot never covers the bouncer; the
     *  quiet-period re-show covers the cancel path (evaluate() no-ops
     *  once USER_PRESENT has fired). */
    private void startUnlockFlow() {
        hide();
        int quiet = propMs("persist.lethe.mascot.kg.reshow", 3500);
        if (quiet > 0) {
            handler.removeCallbacks(reshow);
            handler.postDelayed(reshow, quiet);
        }
        try {
            WindowManagerGlobal.getWindowManagerService().dismissKeyguard(
                new KeyguardDismissCallback() {
                    @Override public void onDismissSucceeded() {
                        Log.i(TAG, "unlock: dismissed");
                    }
                    @Override public void onDismissCancelled() {
                        Log.i(TAG, "unlock: cancelled");
                    }
                    @Override public void onDismissError() {
                        Log.w(TAG, "unlock: error");
                    }
                }, null);
        } catch (Exception e) {
            Log.e(TAG, "unlock flow failed", e);
        }
    }

    /** Milliseconds, 0..60000; 0 = disabled. */
    private static int propMs(String key, int def) {
        try {
            return Math.max(0, Math.min(60_000,
                Integer.parseInt(LetheConfig.get(key, String.valueOf(def)))));
        } catch (Exception e) {
            return def;
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
