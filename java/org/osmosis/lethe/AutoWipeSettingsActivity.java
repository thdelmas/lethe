package org.osmosis.lethe;

import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.text.InputType;
import android.util.Log;
import android.util.TypedValue;
import android.view.View;
import android.view.ViewGroup;
import android.widget.CheckBox;
import android.widget.CompoundButton;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

/**
 * Native auto-wipe policy settings.
 *
 * Mirrors static/settings-autowipe.js but lives outside the WebView so the
 * panel is reachable on user builds — LetheActivity (the WebView host) is
 * banned in privileged processes on Android 7.0+ because the app runs as
 * SYSTEM_UID via sharedUserId. See lethe#151.
 *
 * Launch:  am start -a lethe.intent.AUTOWIPE_SETTINGS
 *
 * Writes go through {@link LetheConfig#set} → SystemProperties.set, which
 * succeeds here (system context) but is denied for shell on user builds.
 * After every write we call {@link AutoWipePolicy#applyPolicy} so the
 * failed-unlock threshold pushes into DPM live without waiting for reboot.
 */
public class AutoWipeSettingsActivity extends Activity {

    private static final String TAG = "lethe-aw-settings";

    // Property keys — kept <=31 chars to fit Android 7.1's PROP_NAME_MAX.
    private static final String K_FU_ENABLED   = "persist.lethe.aw.fu.enabled";
    private static final String K_FU_THRESHOLD = "persist.lethe.aw.fu.threshold";
    private static final String K_FU_DELAYS    = "persist.lethe.aw.fu.delays";
    private static final String K_DMS          = "persist.lethe.aw.dms.enabled";
    private static final String K_ER           = "persist.lethe.aw.er.enabled";
    private static final String K_PANIC        = "persist.lethe.aw.panic.enabled";
    private static final String K_DURESS       = "persist.lethe.aw.duress.enabled";
    private static final String K_USB          = "persist.lethe.aw.usb.enabled";

    // Legacy keys honored as read-only fallback so the toggle reflects a
    // pre-v1.2 user choice. The migration in AutoWipePolicy is one-shot;
    // before it has run, these still drive isTriggerEnabled. Only the
    // legacy keys that physically fit PROP_NAME_MAX are listed — the
    // other two historical fallbacks (burner.trigger.panic_button and
    // deadman.duress_pin.enabled, both 40+ chars) were never settable
    // on cm-14.1 so a fallback read against them is dead code.
    private static final String LK_DEADMAN = "persist.lethe.deadman.enabled";
    private static final String LK_BURNER  = "persist.lethe.burner.enabled";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setTitle("Auto-Wipe Policy");

        ScrollView scroll = new ScrollView(this);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        int pad = dp(16);
        root.setPadding(pad, pad, pad, pad);
        scroll.addView(root, new ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT));
        setContentView(scroll);

        addDescription(root,
            "Which triggers should wipe the device. Each runs through the "
            + "same wipe path (DPM.wipeData, system_server domain). "
            + "Failed-unlock, duress, DMS, and USB triggers are silent; "
            + "panic press shows a 5s cancel window; every-restart wipes "
            + "at post-fs-data on the legacy script (DPM would reboot-loop "
            + "on every boot).");

        addSection(root, "Failed unlock attempts");
        addToggle(root, "Wipe after N failed unlocks", K_FU_ENABLED, null);
        addIntField(root, "Threshold (attempts):", K_FU_THRESHOLD, "10", 3, 50);
        addTextField(root, "Lockout delays (csv minutes, blank=none):",
            K_FU_DELAYS, "", "1,5,15,60", DelayValidator.INSTANCE);

        addSection(root, "Inactivity / Dead-Man's Switch");
        addToggle(root, "Wipe after missed check-in", K_DMS, LK_DEADMAN);

        addSection(root, "Every restart (Burner)");
        addToggle(root, "Wipe on every boot", K_ER, LK_BURNER);

        addSection(root, "Panic press");
        addToggle(root, "5× power-button press wipes", K_PANIC, null);

        addSection(root, "Duress PIN");
        addToggle(root, "Duress PIN entry wipes silently", K_DURESS, null);

        addSection(root, "USB signal");
        addToggle(root, "OSmosis remote USB trigger wipes", K_USB, null);
    }

    // --- UI helpers ---------------------------------------------------------

    private void addDescription(LinearLayout parent, String text) {
        TextView tv = new TextView(this);
        tv.setText(text);
        tv.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        tv.setTextColor(0xFFAAAAAA);
        tv.setPadding(0, 0, 0, dp(12));
        parent.addView(tv);
    }

    private void addSection(LinearLayout parent, String title) {
        TextView tv = new TextView(this);
        tv.setText(title);
        tv.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        tv.setTypeface(tv.getTypeface(), android.graphics.Typeface.BOLD);
        tv.setPadding(0, dp(12), 0, dp(4));
        parent.addView(tv);
    }

    private void addToggle(LinearLayout parent, String label,
                           final String key, final String legacyKey) {
        boolean enabled = "true".equals(LetheConfig.get(key, ""));
        // Skip legacy fallback when the legacy name itself overflows
        // PROP_NAME_MAX (32 bytes incl. null) — SystemProperties.get
        // would throw IllegalArgumentException and pollute logcat with
        // every open. Two legacy keys are affected: burner.trigger.
        // panic_button (40 chars) and deadman.duress_pin.enabled (40).
        if (!enabled && legacyKey != null && legacyKey.length() <= 31) {
            enabled = "true".equals(LetheConfig.get(legacyKey, "false"));
        }
        CheckBox cb = new CheckBox(this);
        cb.setText(label);
        cb.setChecked(enabled);
        cb.setOnCheckedChangeListener(new CompoundButton.OnCheckedChangeListener() {
            @Override
            public void onCheckedChanged(CompoundButton btn, boolean isChecked) {
                writeProp(key, isChecked ? "true" : "false");
            }
        });
        parent.addView(cb);
    }

    private void addIntField(LinearLayout parent, String label,
                             final String key, String defaultValue,
                             final int min, final int max) {
        addInlineLabel(parent, label);
        final EditText et = new EditText(this);
        et.setInputType(InputType.TYPE_CLASS_NUMBER);
        et.setText(LetheConfig.get(key, defaultValue));
        et.setOnFocusChangeListener(new View.OnFocusChangeListener() {
            @Override
            public void onFocusChange(View v, boolean hasFocus) {
                if (hasFocus) return;
                int n;
                try { n = Integer.parseInt(et.getText().toString().trim()); }
                catch (NumberFormatException e) { n = min; }
                if (n < min) n = min;
                if (n > max) n = max;
                et.setText(String.valueOf(n));
                writeProp(key, String.valueOf(n));
            }
        });
        parent.addView(et);
    }

    private void addTextField(LinearLayout parent, String label,
                              final String key, String defaultValue,
                              String hint, final Validator validator) {
        addInlineLabel(parent, label);
        final EditText et = new EditText(this);
        et.setInputType(InputType.TYPE_CLASS_TEXT);
        et.setHint(hint);
        et.setText(LetheConfig.get(key, defaultValue));
        et.setOnFocusChangeListener(new View.OnFocusChangeListener() {
            @Override
            public void onFocusChange(View v, boolean hasFocus) {
                if (hasFocus) return;
                String v2 = et.getText().toString().replaceAll("\\s+", "");
                if (!v2.isEmpty() && !validator.isValid(v2)) {
                    et.setBackgroundColor(0x33FF6961);
                    Toast.makeText(AutoWipeSettingsActivity.this,
                        "Invalid value — not saved", Toast.LENGTH_SHORT).show();
                    return;
                }
                et.setBackgroundColor(Color.TRANSPARENT);
                writeProp(key, v2);
            }
        });
        parent.addView(et);
    }

    private void addInlineLabel(LinearLayout parent, String text) {
        TextView tv = new TextView(this);
        tv.setText(text);
        tv.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        tv.setPadding(0, dp(8), 0, dp(2));
        parent.addView(tv);
    }

    // --- write path ---------------------------------------------------------

    private void writeProp(String key, String value) {
        LetheConfig.set(key, value);
        Log.i(TAG, "set " + key + "=" + value);
        // Push autowipe-policy changes to DPM live so the keyguard threshold
        // updates without waiting for next boot — matches LetheActivity's
        // setSystemProp bridge behavior.
        if (key.startsWith("persist.lethe.aw.")) {
            AutoWipePolicy.applyPolicy(this);
        }
    }

    // --- misc ---------------------------------------------------------------

    private int dp(int v) {
        float density = getResources().getDisplayMetrics().density;
        return Math.round(v * density);
    }

    private interface Validator { boolean isValid(String v); }

    private static final class DelayValidator implements Validator {
        static final DelayValidator INSTANCE = new DelayValidator();
        @Override public boolean isValid(String v) {
            return v.matches("^[0-9]+(,[0-9]+)*$");
        }
    }
}
