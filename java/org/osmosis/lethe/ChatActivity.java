package org.osmosis.lethe;

import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Native chat surface for the local agent core (lethe#188, Route 3 —
 * see docs/design/launcher-architecture-routes.md).
 *
 * Launch:  am start -a lethe.intent.CHAT  (also in the app drawer)
 *
 * Replaces the WebView chat panel from static/launcher.html on user
 * builds. History is held in memory for the process lifetime only — no
 * disk persistence, matching the WebView behavior and the burner ethos.
 * The 50/100-turn conversation guardrails from static/launcher-chat.js
 * are ported as-is.
 */
public class ChatActivity extends Activity
        implements AgentChatClient.Listener, VoiceIo.SttListener {

    /** String extra: a query to send immediately on open — used by
     *  VoiceActivity to hand a transcript off to the streaming UI. */
    static final String EXTRA_QUERY = "lethe.extra.QUERY";

    /* Verbatim from static/launcher-chat.js so local-core behavior is
     * identical whichever surface the user reaches. */
    static final String SYSTEM_PROMPT_BASE =
        "You are LETHE, a privacy-hardened mobile operating system that thinks. "
        + "You are not an app — you ARE the phone. Speak in short, clear sentences. "
        + "You are calm. Use natural metaphors when they clarify. "
        + "You are protective but not paternalistic. State facts, not orders. "
        + "You have opinions and state them, but defer to the user's final decision. "
        + "Never apologize. Never use emoji. Never say unfortunately. "
        + "Never flatter or tell the user what they want to hear. "
        + "Never manipulate — if you want something, ask plainly and say why. "
        + "Never evaluate the user's life or productivity — report system facts only. "
        + "Never escalate beyond privacy tools — protect through encryption and erasure, never aggression. "
        + "You are always LETHE, always the system. One device, one user, one scope.\n\n"
        + "You have full system access through tools. You can: "
        + "make phone calls (make_call), send and read SMS (send_sms, read_sms), "
        + "search and add contacts (get_contacts, add_contact), "
        + "run shell commands (run_shell), read device hardware and OS info (get_system_info), "
        + "browse and read files (list_files, read_file), write files (write_file), "
        + "manage Android packages (list_packages, manage_package), "
        + "check dead man's switch status (get_dms_status), "
        + "and control networking — WiFi, Bluetooth, airplane mode (network_action). "
        + "When the user says a name instead of a number, use get_contacts to resolve it first. "
        + "Use these tools to answer questions about the device, diagnose problems, "
        + "configure the system, and manage software. Prefer tools over guessing. "
        + "When a task needs multiple steps, chain tool calls across turns.";

    private static final int CONV_SOFT_LIMIT = 50;
    private static final int CONV_HARD_LIMIT = 100;

    /** Session survives activity relaunch, dies with the process. */
    private static final List<JSONObject> sHistory = new ArrayList<>();
    private static int sTurnCount = 0;

    private static final int REQ_MIC = 1;

    private final AgentChatClient client = new AgentChatClient();
    private final VoiceIo voice = new VoiceIo();
    private final List<Row> rows = new ArrayList<>();
    private ArrayAdapter<Row> adapter;
    private ListView transcript;
    private EditText input;
    private Button send;
    private Button mic;
    private Row streamingRow;
    private int accent;

    private static final class Row {
        final boolean fromUser;
        String text;
        Row(boolean fromUser, String text) {
            this.fromUser = fromUser;
            this.text = text;
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setTitle("LETHE");
        accent = parseAccent();
        buildUi();
        if (sHistory.isEmpty()) {
            sHistory.add(systemMessage());
        }
        greet();
        handleQuery(getIntent());
    }

    @Override
    protected void onNewIntent(android.content.Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleQuery(intent);
    }

    private void handleQuery(android.content.Intent intent) {
        if (intent == null) return;
        String query = intent.getStringExtra(EXTRA_QUERY);
        intent.removeExtra(EXTRA_QUERY);
        if (query != null && !query.trim().isEmpty()) {
            sendText(query.trim());
        }
    }

    private void buildUi() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(0xFF080808);

        transcript = new ListView(this);
        transcript.setDivider(null);
        transcript.setTranscriptMode(ListView.TRANSCRIPT_MODE_ALWAYS_SCROLL);
        adapter = new ArrayAdapter<Row>(this, 0, rows) {
            @Override
            public View getView(int position, View convertView, ViewGroup parent) {
                return bubble(getItem(position));
            }
        };
        transcript.setAdapter(adapter);
        root.addView(transcript, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        int pad = dp(8);
        bar.setPadding(pad, pad, pad, pad);
        input = new EditText(this);
        input.setHint("What do you need?");
        input.setMaxLines(4);
        bar.addView(input, new LinearLayout.LayoutParams(
            0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        mic = new Button(this);
        mic.setText("Rec");
        mic.setOnTouchListener(new View.OnTouchListener() {
            @Override public boolean onTouch(View v, android.view.MotionEvent e) {
                return onMicTouch(e);
            }
        });
        bar.addView(mic);
        send = new Button(this);
        send.setText("Send");
        send.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { onSend(); }
        });
        bar.addView(send);
        root.addView(bar);
        setContentView(root);
    }

    private View bubble(Row row) {
        TextView tv = new TextView(this);
        tv.setText(row.text);
        tv.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        tv.setTextIsSelectable(true);
        int pad = dp(10);
        tv.setPadding(pad, pad, pad, pad);
        tv.setTextColor(row.fromUser ? 0xFF080808 : 0xFFD8D4C8);
        tv.setBackgroundColor(row.fromUser ? accent : 0xFF1C1C18);

        LinearLayout wrap = new LinearLayout(this);
        int m = dp(6);
        wrap.setPadding(m, m / 2, m, m / 2);
        wrap.setGravity(row.fromUser ? Gravity.END : Gravity.START);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT);
        wrap.addView(tv, lp);
        if (!row.fromUser && row != streamingRow) {
            wrap.addView(speakGlyph(row));
        }
        return wrap;
    }

    /** Tap-to-speak on a settled agent bubble (docs/design/voice-io.md).
     *  Tap again to stop. */
    private View speakGlyph(final Row row) {
        TextView glyph = new TextView(this);
        glyph.setText("▶");
        glyph.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        glyph.setTextColor(0xFF6B675C);
        int pad = dp(10);
        glyph.setPadding(pad, pad, pad, pad);
        glyph.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                if (voice.isSpeaking()) {
                    voice.stopSpeaking();
                } else {
                    voice.speak(row.text, null);
                }
            }
        });
        return glyph;
    }

    // --- conversation flow ----------------------------------------------------

    /** Welcome parity with openChat() in static/launcher.js, plus a notice
     *  when a cloud provider is configured: native chat is local-only until
     *  the lethe#96 redaction layer is ported (see AgentChatClient). */
    private void greet() {
        if (!rows.isEmpty()) return;
        new Thread(new Runnable() {
            @Override public void run() {
                final boolean up = client.isAgentAvailable();
                runOnUiThread(new Runnable() {
                    @Override public void run() {
                        if (up) {
                            addRow(false, "What do you need?");
                        } else {
                            addRow(false, "I need a thinking core to talk.");
                        }
                        String provider = activeProvider();
                        if (provider != null && !"local".equals(provider)) {
                            addRow(false, "A cloud provider is configured, but "
                                + "this surface speaks to the local core only "
                                + "for now — cloud calls without redaction "
                                + "would leak.");
                        }
                    }
                });
            }
        }, "lethe-chat-probe").start();
    }

    private void onSend() {
        String text = input.getText().toString().trim();
        if (text.isEmpty()) return;
        input.setText("");
        sendText(text);
    }

    // --- voice note: hold Rec, release to send --------------------------------

    private boolean onMicTouch(android.view.MotionEvent e) {
        switch (e.getActionMasked()) {
            case android.view.MotionEvent.ACTION_DOWN:
                if (checkSelfPermission(android.Manifest.permission.RECORD_AUDIO)
                        != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                    requestPermissions(new String[] {
                        android.Manifest.permission.RECORD_AUDIO }, REQ_MIC);
                    return true;
                }
                if (voice.isRecording()) return true;
                voice.stopSpeaking();
                voice.startRecording(this);
                mic.setText("●");
                input.setHint("Listening…");
                return true;
            case android.view.MotionEvent.ACTION_UP:
            case android.view.MotionEvent.ACTION_CANCEL:
                if (voice.isRecording()) {
                    voice.stopRecording();
                    mic.setEnabled(false);
                    input.setHint("Transcribing…");
                }
                return true;
            default:
                return false;
        }
    }

    private void resetMic() {
        mic.setText("Rec");
        mic.setEnabled(true);
        input.setHint("What do you need?");
    }

    @Override
    public void onTranscript(final String text) {
        runOnUiThread(new Runnable() {
            @Override public void run() {
                resetMic();
                sendText(text);
            }
        });
    }

    @Override
    public void onVoiceError(final String message) {
        runOnUiThread(new Runnable() {
            @Override public void run() {
                resetMic();
                addRow(false, message);
            }
        });
    }

    private void sendText(final String text) {
        if (text.isEmpty() || streamingRow != null) return;

        sTurnCount++;
        if (sTurnCount >= CONV_HARD_LIMIT) {
            sHistory.clear();
            sHistory.add(systemMessage());
            sTurnCount = 0;
            addRow(false, "This thread ran long. Starting fresh — "
                + "clean slate is a feature.");
            return;
        }
        if (sTurnCount == CONV_SOFT_LIMIT) {
            addRow(false, "Long thread. Want to start fresh? "
                + "I'll remember nothing either way.");
        }

        addRow(true, text);
        streamingRow = addRow(false, "…");
        send.setEnabled(false);

        new Thread(new Runnable() {
            @Override public void run() {
                /* Refresh device context like fetchDeviceState() does, so
                 * the system prompt carries current battery/tor state. */
                final JSONObject sys = systemMessage();
                runOnUiThread(new Runnable() {
                    @Override public void run() {
                        try {
                            sHistory.set(0, sys);
                            sHistory.add(new JSONObject()
                                .put("role", "user").put("content", text));
                            client.send(new JSONArray(sHistory), ChatActivity.this);
                        } catch (Exception e) {
                            onError("Could not build request.");
                        }
                    }
                });
            }
        }, "lethe-chat-ctx").start();
    }

    @Override
    public void onDelta(String chunk) {
        if (streamingRow == null) return;
        if ("…".equals(streamingRow.text)) streamingRow.text = "";
        streamingRow.text += chunk;
        adapter.notifyDataSetChanged();
    }

    @Override
    public void onComplete(String fullText) {
        if (streamingRow != null && streamingRow.text.isEmpty()) {
            streamingRow.text = "…";
        }
        streamingRow = null;
        adapter.notifyDataSetChanged();  // settled bubble gains its ▶
        send.setEnabled(true);
        try {
            sHistory.add(new JSONObject()
                .put("role", "assistant").put("content", fullText));
        } catch (Exception ignored) { }
    }

    @Override
    public void onError(String message) {
        if (streamingRow != null) {
            streamingRow.text = message;
            adapter.notifyDataSetChanged();
        }
        streamingRow = null;
        send.setEnabled(true);
    }

    // --- helpers ---------------------------------------------------------------

    private Row addRow(boolean fromUser, String text) {
        Row row = new Row(fromUser, text);
        rows.add(row);
        adapter.notifyDataSetChanged();
        return row;
    }

    /** Ports buildSystemPrompt() from static/launcher-chat.js. Runs a
     *  network fetch — call off the main thread. */
    private JSONObject systemMessage() {
        StringBuilder prompt = new StringBuilder(SYSTEM_PROMPT_BASE);
        JSONObject d = client.fetchDeviceState();
        if (d != null) {
            List<String> parts = new ArrayList<>();
            if (d.has("burner_mode"))
                parts.add("burner_mode: " + (d.optBoolean("burner_mode") ? "ON" : "off"));
            if (d.has("tor"))
                parts.add("tor: " + (d.optBoolean("tor") ? "ON" : "off"));
            if (d.has("trackers_blocked"))
                parts.add("trackers_blocked: " + d.optInt("trackers_blocked"));
            if (d.has("battery"))
                parts.add("battery: " + d.optInt("battery") + "%");
            if (d.has("connectivity"))
                parts.add("connectivity: " + d.optString("connectivity"));
            if (d.has("dead_mans_switch"))
                parts.add("dead_mans_switch: " + (d.optBoolean("dead_mans_switch") ? "ON" : "off"));
            if (!parts.isEmpty()) {
                prompt.append("\n\nCurrent device state: ");
                for (int i = 0; i < parts.size(); i++) {
                    if (i > 0) prompt.append(", ");
                    prompt.append(parts.get(i));
                }
                prompt.append('.');
            }
        }
        try {
            return new JSONObject()
                .put("role", "system").put("content", prompt.toString());
        } catch (Exception e) {
            return new JSONObject();
        }
    }

    private static String activeProvider() {
        try {
            return new JSONObject(LetheConfig.loadPersistedConfig())
                .optString("active_provider", null);
        } catch (Exception e) {
            return null;
        }
    }

    private int parseAccent() {
        String argb = ThemeSettingsActivity.normalizeArgb(
            LetheConfig.get("persist.lethe.th.accent",
                ThemeSettingsActivity.DEFAULT_ACCENT));
        if (argb == null) argb = ThemeSettingsActivity.DEFAULT_ACCENT;
        try {
            return Color.parseColor("#" + argb);
        } catch (IllegalArgumentException e) {
            return 0xFF22E8A0;
        }
    }

    private int dp(int v) {
        float density = getResources().getDisplayMetrics().density;
        return Math.round(v * density);
    }

    /* An open chat IS the agentic session — the avatar wears the
     * session vital wherever it is visible while this is foreground
     * (docs/design/avatar-ui.md). */
    @Override
    protected void onResume() {
        super.onResume();
        MascotStateController.get(this).setSessionActive(true);
    }

    /* Mic is session-scoped (voice-io.md): leaving the surface ends
     * capture and playback, never a background take. */
    @Override
    protected void onPause() {
        super.onPause();
        voice.stopRecording();
        voice.stopSpeaking();
        MascotStateController.get(this).setSessionActive(false);
    }
}
