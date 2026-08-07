package org.osmosis.lethe;

import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Typeface;
import android.os.Bundle;
import android.text.format.DateFormat;
import android.util.TypedValue;
import android.view.GestureDetector;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.FrameLayout;
import android.widget.ListView;
import android.widget.TextView;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/**
 * Void launcher — the avatar IS the home screen (v1.1 "Void launcher":
 * clock + mascot, no icons/widgets/search). Registered for
 * CATEGORY_HOME, so Android's default-launcher chooser offers this vs
 * the legacy UI (Trebuchet) natively; the user keeps the stock UX one
 * Settings toggle away.
 *
 * Gesture grammar (docs/design/mascot-sprites.md):
 *   tap        → agentic mode (ChatActivity)
 *   swipe up   → app drawer (text-only list, no icons — legacy access
 *                without switching launchers)
 *   back/home  → close drawer
 */
public class LauncherActivity extends Activity {

    private FrameLayout root;
    private View mascot;
    private TextView clock;
    private TextView date;
    private ListView drawer;
    private GestureDetector gestures;
    private BroadcastReceiver tick;

    private static class AppEntry implements Comparable<AppEntry> {
        final String label;
        final ComponentName component;
        AppEntry(String label, ComponentName component) {
            this.label = label;
            this.component = component;
        }
        @Override public int compareTo(AppEntry o) {
            return label.compareToIgnoreCase(o.label);
        }
        @Override public String toString() { return label; }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        root = new FrameLayout(this);
        root.setBackgroundColor(0xFF080808);

        mascot = MascotViews.create(this);
        root.addView(mascot, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT));

        clock = new TextView(this);
        clock.setTextSize(TypedValue.COMPLEX_UNIT_SP, 56);
        clock.setTextColor(0xFFB8B4A0);
        clock.setTypeface(Typeface.create("sans-serif-thin", Typeface.NORMAL));
        date = new TextView(this);
        date.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        date.setTextColor(0xFF8A8670);
        float dp = getResources().getDisplayMetrics().density;
        FrameLayout.LayoutParams clp = new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.WRAP_CONTENT,
            FrameLayout.LayoutParams.WRAP_CONTENT,
            Gravity.TOP | Gravity.CENTER_HORIZONTAL);
        clp.topMargin = Math.round(72 * dp);
        root.addView(clock, clp);
        FrameLayout.LayoutParams dlp = new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.WRAP_CONTENT,
            FrameLayout.LayoutParams.WRAP_CONTENT,
            Gravity.TOP | Gravity.CENTER_HORIZONTAL);
        dlp.topMargin = Math.round(148 * dp);
        root.addView(date, dlp);

        gestures = new GestureDetector(this,
            new GestureDetector.SimpleOnGestureListener() {
                @Override public boolean onSingleTapUp(MotionEvent e) {
                    if (!drawerOpen()) openAgentic();
                    return true;
                }
                @Override public boolean onFling(MotionEvent e1, MotionEvent e2,
                        float vx, float vy) {
                    if (drawerOpen()) return false;
                    if (e1 != null && e2 != null
                            && e2.getY() - e1.getY() < -160 * dpScale()
                            && vy < -800) {
                        openDrawer();
                        return true;
                    }
                    return false;
                }
            });

        // Re-arm the lock-screen mascot after an adb install -r kills the
        // process — same shell-reachable hook as MascotActivity.
        if (KeyguardMascotService.isEnabled()) {
            startService(new Intent(this, KeyguardMascotService.class));
        }
        setContentView(root);
    }

    private float dpScale() {
        return getResources().getDisplayMetrics().density;
    }

    /* Gestures live on the activity, not the mascot view: the
     * SurfaceView still sees ACTION_DOWN (interaction one-shots), but
     * nothing consumes the stream before the detector. */
    @Override
    public boolean dispatchTouchEvent(MotionEvent ev) {
        gestures.onTouchEvent(ev);
        return super.dispatchTouchEvent(ev);
    }

    private void openAgentic() {
        startActivity(new Intent(this, ChatActivity.class));
    }

    // --- drawer -----------------------------------------------------------------

    private boolean drawerOpen() {
        return drawer != null && drawer.getVisibility() == View.VISIBLE;
    }

    /* The Filament SurfaceView is setZOrderOnTop — it composites over
     * every sibling view, so the drawer can't cover it. INVISIBLE (not
     * GONE) releases only the surface; engine and asset stay loaded and
     * the reopen is instant. */
    private void openDrawer() {
        if (drawer == null) buildDrawer();
        mascot.setVisibility(View.INVISIBLE);
        drawer.setVisibility(View.VISIBLE);
    }

    private void closeDrawer() {
        if (drawer != null) drawer.setVisibility(View.GONE);
        mascot.setVisibility(View.VISIBLE);
    }

    /** Text-only alphabetical list — the Void doctrine has no icons. */
    private void buildDrawer() {
        final List<AppEntry> apps = new ArrayList<>();
        Intent main = new Intent(Intent.ACTION_MAIN)
            .addCategory(Intent.CATEGORY_LAUNCHER);
        PackageManager pm = getPackageManager();
        for (ResolveInfo ri : pm.queryIntentActivities(main, 0)) {
            if (getPackageName().equals(ri.activityInfo.packageName)
                    && LauncherActivity.class.getName()
                        .equals(ri.activityInfo.name)) {
                continue;
            }
            apps.add(new AppEntry(
                String.valueOf(ri.loadLabel(pm)),
                new ComponentName(ri.activityInfo.packageName,
                    ri.activityInfo.name)));
        }
        Collections.sort(apps);

        drawer = new ListView(this);
        drawer.setBackgroundColor(0xFF080808);
        drawer.setDivider(null);
        drawer.setVerticalScrollBarEnabled(false);
        float dp = dpScale();
        int pad = Math.round(28 * dp);
        drawer.setPadding(pad, Math.round(64 * dp), pad, Math.round(32 * dp));
        drawer.setClipToPadding(false);
        drawer.setAdapter(new ArrayAdapter<AppEntry>(this, 0, apps) {
            @Override public View getView(int pos, View convert, ViewGroup parent) {
                TextView tv = convert instanceof TextView
                    ? (TextView) convert : new TextView(LauncherActivity.this);
                tv.setText(getItem(pos).label);
                tv.setTextSize(TypedValue.COMPLEX_UNIT_SP, 19);
                tv.setTextColor(0xFFB8B4A0);
                int vp = Math.round(14 * dpScale());
                tv.setPadding(0, vp, 0, vp);
                return tv;
            }
        });
        drawer.setOnItemClickListener(new AdapterView.OnItemClickListener() {
            @Override public void onItemClick(AdapterView<?> parent, View view,
                    int pos, long id) {
                AppEntry entry = (AppEntry) parent.getItemAtPosition(pos);
                try {
                    startActivity(new Intent(Intent.ACTION_MAIN)
                        .addCategory(Intent.CATEGORY_LAUNCHER)
                        .setComponent(entry.component)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                } catch (Exception ignored) { }
                closeDrawer();
            }
        });
        root.addView(drawer, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT));
    }

    // --- home/back/clock --------------------------------------------------------

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);      // home pressed while already home
        closeDrawer();
    }

    @Override
    public void onBackPressed() {
        if (drawerOpen()) closeDrawer();
        // else: home screens swallow back
    }

    @Override
    protected void onResume() {
        super.onResume();
        updateClock();
        tick = new BroadcastReceiver() {
            @Override public void onReceive(Context context, Intent intent) {
                updateClock();
            }
        };
        IntentFilter f = new IntentFilter(Intent.ACTION_TIME_TICK);
        f.addAction(Intent.ACTION_TIME_CHANGED);
        f.addAction(Intent.ACTION_TIMEZONE_CHANGED);
        registerReceiver(tick, f);
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (tick != null) {
            unregisterReceiver(tick);
            tick = null;
        }
        closeDrawer();
    }

    private void updateClock() {
        Date now = new Date();
        clock.setText(DateFormat.getTimeFormat(this).format(now));
        date.setText(new SimpleDateFormat("EEEE d MMMM", Locale.getDefault())
            .format(now));
    }
}
