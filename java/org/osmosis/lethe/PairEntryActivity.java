package org.osmosis.lethe;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Bundle;
import android.text.InputType;
import android.util.Log;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONException;

/**
 * Native pair-payload entry surface.
 *
 * Lets the user paste a LETHE pair payload — the JSON that an OSmosis
 * partner device encodes into its QR code — and apply it to the
 * persisted config. Same write path as
 * {@link PairReceiver#applyPayloadJson}.
 *
 * On user builds the in-WebView QR scanner is unreachable because
 * {@link LetheActivity} crashes (WebView banned in system-uid
 * processes; lethe#159). This activity gives users a way to pair
 * providers without the WebView, until a native camera-based QR scanner
 * lands (tracked separately).
 *
 * Launch surfaces:
 * <ul>
 *   <li>Trebuchet app drawer — labeled "LETHE Pair"</li>
 *   <li>{@code am start -a lethe.intent.PAIR_ENTRY}</li>
 * </ul>
 *
 * Payload shape (same as
 * {@code static/settings.js:onQRResult}):
 * <pre>
 *   {"lethe_pair":true,"provider":"anthropic","key":"sk-...","model":"..."}
 * </pre>
 */
public class PairEntryActivity extends Activity {

    private static final String TAG = "lethe-pair-entry";

    private EditText payloadField;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setTitle("Pair LETHE");

        ScrollView scroll = new ScrollView(this);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        int pad = dp(16);
        root.setPadding(pad, pad, pad, pad);
        scroll.addView(root, new ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT));
        setContentView(scroll);

        TextView desc = new TextView(this);
        desc.setText(
            "Paste the pair payload from your OSmosis device. It looks "
            + "like a JSON object beginning with "
            + "{\"lethe_pair\":true,…} — the same content the OSmosis "
            + "device encodes into its QR code. Press Apply to merge "
            + "the provider key into this device's config.");
        desc.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        desc.setTextColor(0xFFAAAAAA);
        desc.setPadding(0, 0, 0, dp(12));
        root.addView(desc);

        payloadField = new EditText(this);
        payloadField.setHint("{\"lethe_pair\":true,\"provider\":\"…\",\"key\":\"…\"}");
        payloadField.setSingleLine(false);
        payloadField.setGravity(Gravity.TOP | Gravity.START);
        payloadField.setMinLines(5);
        payloadField.setMaxLines(12);
        payloadField.setTypeface(Typeface.MONOSPACE);
        payloadField.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        payloadField.setInputType(
            InputType.TYPE_CLASS_TEXT
            | InputType.TYPE_TEXT_FLAG_MULTI_LINE
            | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
        root.addView(payloadField);

        LinearLayout buttonRow = new LinearLayout(this);
        buttonRow.setOrientation(LinearLayout.HORIZONTAL);
        buttonRow.setPadding(0, dp(16), 0, 0);
        buttonRow.setGravity(Gravity.END);

        Button cancel = new Button(this);
        cancel.setText("Cancel");
        cancel.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { finish(); }
        });
        buttonRow.addView(cancel);

        Button apply = new Button(this);
        apply.setText("Apply");
        apply.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { onApply(); }
        });
        LinearLayout.LayoutParams applyParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT);
        applyParams.setMargins(dp(8), 0, 0, 0);
        buttonRow.addView(apply, applyParams);

        root.addView(buttonRow);
    }

    private void onApply() {
        String payload = payloadField.getText().toString().trim();
        if (payload.isEmpty()) {
            toast("Paste a pair payload first.");
            return;
        }
        try {
            String provider = PairReceiver.applyPayloadJson(this, payload);
            toast("Paired with " + provider + ".");
            finish();
        } catch (JSONException e) {
            Log.w(TAG, "Pair apply failed", e);
            payloadField.setBackgroundColor(0x33FF6961);
            toast("Could not pair: " + e.getMessage());
        }
    }

    private void toast(String msg) {
        Toast.makeText(this, msg, Toast.LENGTH_LONG).show();
    }

    private int dp(int v) {
        float density = getResources().getDisplayMetrics().density;
        return Math.round(v * density);
    }
}
