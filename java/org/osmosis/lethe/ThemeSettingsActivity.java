package org.osmosis.lethe;

import android.graphics.Color;
import android.provider.Settings;
import android.text.InputType;
import android.util.Log;
import android.view.View;
import android.widget.LinearLayout;

/**
 * Native theme settings (lethe#191, Route 3 — see
 * docs/design/launcher-architecture-routes.md).
 *
 * Launch:  am start -a lethe.intent.THEME_SETTINGS
 *
 * Values persist in the short persist.lethe.th.* property family. The
 * historical persist.lethe.theme.* names from overlays/theme-lethe.conf
 * mostly overflow Android 7.1's 31-char PROP_NAME_MAX and were never
 * settable on cm-14.1 (same bug class as lethe#154); the one legacy name
 * that fits is honored as a read-only fallback. The native surfaces from
 * lethe#188/#189 read these props for their palette; the animation scale
 * additionally applies live through Settings.Global so it takes effect
 * without waiting for any consumer.
 */
public class ThemeSettingsActivity extends SettingsFormActivity {

    private static final String TAG = "lethe-theme-settings";

    // Property keys — kept <=31 chars to fit Android 7.1's PROP_NAME_MAX.
    static final String K_ACCENT = "persist.lethe.th.accent";
    static final String K_OLED   = "persist.lethe.th.oled";
    static final String K_ANIM   = "persist.lethe.th.anim";
    static final String K_CHROME = "persist.lethe.th.chrome";

    // Pre-#191 name that fits PROP_NAME_MAX; read-only fallback.
    private static final String LK_ACCENT = "persist.lethe.theme.accent";

    /** LETHE teal, matching overlays/theme-lethe.conf accent. */
    static final String DEFAULT_ACCENT = "ff22e8a0";

    private View swatch;

    @Override
    protected void buildForm() {
        setTitle("Theme");

        addDescription(
            "Palette and motion settings for the LETHE surfaces. The "
            + "accent and surface values feed the native launcher "
            + "screens; the animation scale applies system-wide "
            + "immediately.");

        addSection("Accent");
        addTextField("Accent color (aarrggbb hex):", readAccent(),
            DEFAULT_ACCENT, InputType.TYPE_CLASS_TEXT,
            new TextCommitter() {
                @Override public boolean commit(String value) {
                    String argb = normalizeArgb(value);
                    if (argb == null) return false;
                    writeProp(K_ACCENT, argb);
                    tintSwatch(argb);
                    return true;
                }
            });
        swatch = new View(this);
        LinearLayout.LayoutParams lp =
            new LinearLayout.LayoutParams(dp(48), dp(24));
        lp.topMargin = dp(4);
        root.addView(swatch, lp);
        tintSwatch(readAccent());

        addSection("Display");
        addToggle("OLED true-black surfaces",
            "true".equals(LetheConfig.get(K_OLED, "true")),
            new BooleanSetter() {
                @Override public void set(boolean value) {
                    writeProp(K_OLED, value ? "true" : "false");
                }
            });
        addToggle("Reduce visual chrome (minimal UI furniture)",
            "true".equals(LetheConfig.get(K_CHROME, "true")),
            new BooleanSetter() {
                @Override public void set(boolean value) {
                    writeProp(K_CHROME, value ? "true" : "false");
                }
            });

        addSection("Animations");
        addTextField("System animation scale (0 = off, 1 = stock):",
            LetheConfig.get(K_ANIM, "0.5"), "0.5",
            InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL,
            new TextCommitter() {
                @Override public boolean commit(String value) {
                    float scale;
                    try { scale = Float.parseFloat(value); }
                    catch (NumberFormatException e) { return false; }
                    if (scale < 0f || scale > 2f) return false;
                    writeProp(K_ANIM, value);
                    applyAnimationScale(scale);
                    return true;
                }
            });
    }

    // --- read/write paths ---------------------------------------------------

    private String readAccent() {
        String v = LetheConfig.get(K_ACCENT, "");
        if (v.isEmpty()) {
            // theme-lethe.conf writes ff_22e8a0-style values; normalize.
            v = LetheConfig.get(LK_ACCENT, DEFAULT_ACCENT);
        }
        String argb = normalizeArgb(v);
        return argb != null ? argb : DEFAULT_ACCENT;
    }

    /** Accept rrggbb / aarrggbb, with or without the conf's ff_ underscore
     *  separator. Returns lowercase aarrggbb, or null when malformed. */
    static String normalizeArgb(String value) {
        if (value == null) return null;
        String v = value.replace("_", "").trim().toLowerCase();
        if (v.matches("^[0-9a-f]{6}$")) v = "ff" + v;
        return v.matches("^[0-9a-f]{8}$") ? v : null;
    }

    private void tintSwatch(String argb) {
        try {
            swatch.setBackgroundColor(Color.parseColor("#" + argb));
        } catch (IllegalArgumentException e) {
            swatch.setBackgroundColor(Color.TRANSPARENT);
        }
    }

    private void writeProp(String key, String value) {
        LetheConfig.set(key, value);
        Log.i(TAG, "set " + key + "=" + value);
    }

    /** Push the scale into the three live Settings.Global animation knobs.
     *  Needs WRITE_SECURE_SETTINGS — granted via platform signature. */
    private void applyAnimationScale(float scale) {
        try {
            Settings.Global.putFloat(getContentResolver(),
                Settings.Global.WINDOW_ANIMATION_SCALE, scale);
            Settings.Global.putFloat(getContentResolver(),
                Settings.Global.TRANSITION_ANIMATION_SCALE, scale);
            Settings.Global.putFloat(getContentResolver(),
                Settings.Global.ANIMATOR_DURATION_SCALE, scale);
        } catch (SecurityException e) {
            Log.w(TAG, "animation scale write denied", e);
            toast("Animation scale saved but not applied live");
        }
    }
}
