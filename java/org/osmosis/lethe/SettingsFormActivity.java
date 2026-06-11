package org.osmosis.lethe;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.widget.CheckBox;
import android.widget.CompoundButton;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.util.ArrayList;
import java.util.List;

/**
 * Shared scaffolding for LETHE's native settings forms (lethe#186 Route 3).
 *
 * Same programmatic-UI approach as AutoWipeSettingsActivity: a vertical
 * LinearLayout inside a ScrollView, no XML layouts, widgets appended
 * through the add* helpers. Subclasses build their form in
 * {@link #buildForm} and wire widget callbacks to their own write paths.
 */
abstract class SettingsFormActivity extends Activity {

    protected LinearLayout root;

    /** Every text field, so we can flush uncommitted edits on pause. */
    private final List<EditText> textFields = new ArrayList<>();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        ScrollView scroll = new ScrollView(this);
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        int pad = dp(16);
        root.setPadding(pad, pad, pad, pad);
        scroll.addView(root, new ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT));
        setContentView(scroll);
        buildForm();
    }

    /**
     * Flush every field on pause. Commit-on-focus-loss alone is not enough:
     * a field with no focusable-in-touch-mode sibling (e.g. the only text
     * field on the form) never loses focus to a tap on a checkbox or radio,
     * so its edit would silently never save. Leaving the activity is the
     * backstop. Verified on t0lte where the lockscreen owner-info field was
     * otherwise uncommittable.
     */
    @Override
    protected void onPause() {
        super.onPause();
        for (EditText et : textFields) {
            if (et.hasFocus()) et.clearFocus();  // fires the focus-loss commit
        }
    }

    /** Append the form's widgets to {@link #root}. */
    protected abstract void buildForm();

    // --- UI helpers ---------------------------------------------------------

    protected void addDescription(String text) {
        TextView tv = new TextView(this);
        tv.setText(text);
        tv.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        tv.setTextColor(0xFFAAAAAA);
        tv.setPadding(0, 0, 0, dp(12));
        root.addView(tv);
    }

    protected void addSection(String title) {
        TextView tv = new TextView(this);
        tv.setText(title);
        tv.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        tv.setTypeface(tv.getTypeface(), Typeface.BOLD);
        tv.setPadding(0, dp(12), 0, dp(4));
        root.addView(tv);
    }

    protected void addInlineLabel(String text) {
        TextView tv = new TextView(this);
        tv.setText(text);
        tv.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        tv.setPadding(0, dp(8), 0, dp(2));
        root.addView(tv);
    }

    protected CheckBox addToggle(String label, boolean checked,
                                 final BooleanSetter onChange) {
        CheckBox cb = new CheckBox(this);
        cb.setText(label);
        cb.setChecked(checked);
        cb.setOnCheckedChangeListener(new CompoundButton.OnCheckedChangeListener() {
            @Override
            public void onCheckedChanged(CompoundButton btn, boolean isChecked) {
                onChange.set(isChecked);
            }
        });
        root.addView(cb);
        return cb;
    }

    /**
     * Labeled free-text field. Commits on focus loss, on the IME action
     * (Done/Next), and on activity pause via {@link #onPause} — so the
     * value saves whether or not there is another focusable field to tab
     * to. An invalid value (committer returns false) turns the field red
     * and is not saved.
     */
    protected EditText addTextField(String label, String value, String hint,
                                    int inputType, final TextCommitter committer) {
        addInlineLabel(label);
        final EditText et = new EditText(this);
        et.setInputType(inputType);
        et.setHint(hint);
        et.setText(value);
        et.setImeOptions(EditorInfo.IME_ACTION_DONE);
        et.setOnFocusChangeListener(new View.OnFocusChangeListener() {
            @Override
            public void onFocusChange(View v, boolean hasFocus) {
                if (!hasFocus) commitField(et, committer);
            }
        });
        et.setOnEditorActionListener(new TextView.OnEditorActionListener() {
            @Override
            public boolean onEditorAction(TextView v, int actionId, android.view.KeyEvent e) {
                if (actionId == EditorInfo.IME_ACTION_DONE
                        || actionId == EditorInfo.IME_ACTION_NEXT) {
                    commitField(et, committer);
                }
                return false;  // let the IME dismiss/advance as usual
            }
        });
        textFields.add(et);
        root.addView(et);
        return et;
    }

    private void commitField(EditText et, TextCommitter committer) {
        if (committer.commit(et.getText().toString().trim())) {
            et.setBackgroundColor(Color.TRANSPARENT);
        } else {
            et.setBackgroundColor(0x33FF6961);
            toast("Invalid value — not saved");
        }
    }

    protected void toast(String msg) {
        Toast.makeText(this, msg, Toast.LENGTH_SHORT).show();
    }

    protected int dp(int v) {
        float density = getResources().getDisplayMetrics().density;
        return Math.round(v * density);
    }

    protected interface BooleanSetter { void set(boolean value); }

    /** Validate-and-save for text fields. Return false to reject. */
    protected interface TextCommitter { boolean commit(String value); }
}
