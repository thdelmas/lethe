package org.osmosis.lethe;

import android.app.Notification;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

import java.lang.reflect.Method;

/**
 * Reflective shim over android.app.NotificationChannel (API 26+).
 *
 * cm-14.1 / Note II builds against the API-25 framework.jar, where
 * NotificationChannel, Notification.Builder(Context, String), and
 * Context.startForegroundService do not exist as compile-time symbols.
 * Direct references would refuse to compile even inside SDK_INT guards
 * (Jack resolves symbols eagerly). Centralising every post-O call behind
 * reflection lets the surrounding files stay in pure API-25 syntax and
 * still do the right thing on Android 8+.
 *
 * Pre-O paths fall through to the legacy unbound builder / startService.
 */
final class NotificationChannelCompat {

    private static final String TAG = "lethe-ncc";

    // Mirror of NotificationManager.IMPORTANCE_* (API 26+). Same int values.
    static final int IMPORTANCE_NONE    = 0;
    static final int IMPORTANCE_MIN     = 1;
    static final int IMPORTANCE_LOW     = 2;
    static final int IMPORTANCE_DEFAULT = 3;
    static final int IMPORTANCE_HIGH    = 4;

    private final String id;
    private final CharSequence name;
    private final int importance;
    private String description;
    private Boolean vibration;
    private boolean silent;
    private Boolean showBadge;
    private Integer lockscreenVisibility;

    NotificationChannelCompat(String id, CharSequence name, int importance) {
        this.id = id;
        this.name = name;
        this.importance = importance;
    }

    NotificationChannelCompat setDescription(String d)        { description = d;      return this; }
    NotificationChannelCompat setEnableVibration(boolean v)   { vibration = v;        return this; }
    NotificationChannelCompat setSilent()                     { silent = true;        return this; }
    NotificationChannelCompat setShowBadge(boolean b)         { showBadge = b;        return this; }
    NotificationChannelCompat setLockscreenVisibility(int v)  { lockscreenVisibility = v; return this; }

    /** Idempotently creates the channel on API 26+; no-op on older platforms. */
    void ensure(NotificationManager nm) {
        if (Build.VERSION.SDK_INT < 26 || nm == null) return;
        try {
            Class<?> ncCls = Class.forName("android.app.NotificationChannel");
            Method getCh = NotificationManager.class
                .getMethod("getNotificationChannel", String.class);
            if (getCh.invoke(nm, id) != null) return;

            Object ch = ncCls.getConstructor(String.class, CharSequence.class, int.class)
                .newInstance(id, name, importance);

            if (description != null) {
                ncCls.getMethod("setDescription", String.class).invoke(ch, description);
            }
            if (vibration != null) {
                ncCls.getMethod("enableVibration", boolean.class).invoke(ch, vibration);
            }
            if (silent) {
                ncCls.getMethod("setSound", android.net.Uri.class, android.media.AudioAttributes.class)
                    .invoke(ch, null, null);
            }
            if (showBadge != null) {
                ncCls.getMethod("setShowBadge", boolean.class).invoke(ch, showBadge);
            }
            if (lockscreenVisibility != null) {
                ncCls.getMethod("setLockscreenVisibility", int.class)
                    .invoke(ch, lockscreenVisibility);
            }
            NotificationManager.class
                .getMethod("createNotificationChannel", ncCls)
                .invoke(nm, ch);
        } catch (ReflectiveOperationException e) {
            Log.w(TAG, "ensure(" + id + ") failed", e);
        }
    }

    /** Returns a channel-bound Notification.Builder on API 26+; legacy unbound otherwise. */
    static Notification.Builder newBuilder(Context ctx, String channelId) {
        if (Build.VERSION.SDK_INT >= 26) {
            try {
                return Notification.Builder.class
                    .getConstructor(Context.class, String.class)
                    .newInstance(ctx, channelId);
            } catch (ReflectiveOperationException e) {
                Log.w(TAG, "newBuilder(channeled) failed; using legacy", e);
            }
        }
        return new Notification.Builder(ctx);
    }

    /** Context.startForegroundService(Intent) on API 26+; startService(Intent) fallback. */
    static void startServiceCompat(Context ctx, Intent svc) {
        if (Build.VERSION.SDK_INT >= 26) {
            try {
                Context.class.getMethod("startForegroundService", Intent.class).invoke(ctx, svc);
                return;
            } catch (ReflectiveOperationException e) {
                Log.w(TAG, "startForegroundService failed; using startService", e);
            }
        }
        ctx.startService(svc);
    }
}
