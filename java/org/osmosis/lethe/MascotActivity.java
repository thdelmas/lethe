package org.osmosis.lethe;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.TextView;

/**
 * Full-screen mascot presentation (lethe#189, Route 3 — see
 * docs/design/launcher-architecture-routes.md).
 *
 * Launch:  am start -a lethe.intent.MASCOT  (drawer: "LETHE Guardian")
 *
 * First time the mascot is visible on user builds — the CSS version
 * lived inside the crash-looping WebView host. Tap the guardian to
 * open the chat, mirroring the home-screen gesture in
 * static/launcher.js. Long-press cycles the conversation states for
 * visual verification until the agent drives them (phase 2).
 */
public class MascotActivity extends Activity {

    private static final String[] DEMO_STATES = {
        MascotView.STATE_IDLE, MascotView.STATE_LISTENING,
        MascotView.STATE_THINKING, MascotView.STATE_SPEAKING,
        MascotView.STATE_ALERT, MascotView.STATE_SLEEP,
    };

    private View mascot;              // SpriteMascotView or MascotView
    private TextView hint;
    private int demoIndex;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(0xFF080808);

        // The pre-rendered Blender model when its sheets are reachable,
        // the Canvas guardian otherwise (see SpriteMascotView docs).
        mascot = SpriteMascotView.available(this)
            ? new SpriteMascotView(this) : new MascotView(this);
        root.addView(mascot, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT));

        hint = new TextView(this);
        hint.setText("tap the guardian");
        hint.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        hint.setTextColor(0xFF8A8670);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.WRAP_CONTENT,
            FrameLayout.LayoutParams.WRAP_CONTENT,
            Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
        lp.bottomMargin = Math.round(48 * getResources()
            .getDisplayMetrics().density);
        root.addView(hint, lp);

        mascot.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                Intent chat = new Intent(MascotActivity.this, ChatActivity.class);
                startActivity(chat);
            }
        });
        mascot.setOnLongClickListener(new View.OnLongClickListener() {
            @Override public boolean onLongClick(View v) {
                demoIndex = (demoIndex + 1) % DEMO_STATES.length;
                setMascotState(DEMO_STATES[demoIndex]);
                hint.setText(DEMO_STATES[demoIndex]);
                return true;
            }
        });
        setContentView(root);
    }

    private void setMascotState(String state) {
        if (mascot instanceof SpriteMascotView) {
            ((SpriteMascotView) mascot).setMascotState(state);
        } else {
            ((MascotView) mascot).setMascotState(state);
        }
    }
}
