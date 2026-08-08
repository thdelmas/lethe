package org.osmosis.lethe;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

/**
 * Native voice surface (lethe#190, Route 3 — see
 * docs/design/launcher-architecture-routes.md).
 *
 * Launch:  am start -a lethe.intent.VOICE  (also via assist long-press —
 * LetheAssistActivity forwards here so the assist path works on user
 * builds where the WebView host crashes).
 *
 * Capture, WAV framing and the STT call live in VoiceIo (shared with
 * ChatActivity's in-thread voice notes). The transcript is handed to
 * ChatActivity, which streams the answer. Audio never leaves the
 * device: the agent core runs sherpa-onnx or whisper.cpp locally.
 */
public class VoiceActivity extends Activity implements VoiceIo.SttListener {

    private static final int REQ_MIC = 1;

    private final VoiceIo voice = new VoiceIo();
    private TextView status;
    private Button done;
    private boolean retryMode;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        buildUi();
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(
                new String[] { Manifest.permission.RECORD_AUDIO }, REQ_MIC);
        } else {
            voice.startRecording(this);
        }
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] res) {
        if (code == REQ_MIC && res.length > 0
                && res[0] == PackageManager.PERMISSION_GRANTED) {
            voice.startRecording(this);
        } else {
            Toast.makeText(this, "Microphone permission needed",
                Toast.LENGTH_SHORT).show();
            finish();
        }
    }

    @Override
    protected void onDestroy() {
        voice.stopRecording();
        super.onDestroy();
    }

    private void buildUi() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setBackgroundColor(0xFF080808);

        status = new TextView(this);
        status.setText("Listening…");
        status.setTextSize(TypedValue.COMPLEX_UNIT_SP, 22);
        status.setTextColor(0xFFD8D4C8);
        status.setGravity(Gravity.CENTER);
        int pad = dp(24);
        status.setPadding(pad, pad, pad, pad);
        root.addView(status);

        done = new Button(this);
        done.setText("Done");
        done.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                if (retryMode) {
                    retryMode = false;
                    done.setText("Done");
                    status.setText("Listening…");
                    voice.startRecording(VoiceActivity.this);
                } else {
                    voice.stopRecording();
                    done.setEnabled(false);
                    status.setText("Thinking…");
                }
            }
        });
        root.addView(done);
        setContentView(root);
    }

    // --- VoiceIo.SttListener (worker thread) ----------------------------------

    @Override
    public void onTranscript(final String transcript) {
        runOnUiThread(new Runnable() {
            @Override public void run() {
                Intent chat = new Intent(VoiceActivity.this, ChatActivity.class);
                chat.putExtra(ChatActivity.EXTRA_QUERY, transcript);
                chat.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                    | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                startActivity(chat);
                finish();
            }
        });
    }

    @Override
    public void onVoiceError(final String message) {
        runOnUiThread(new Runnable() {
            @Override public void run() {
                status.setText(message);
                done.setText("Retry");
                done.setEnabled(true);
                retryMode = true;
            }
        });
    }

    private int dp(int v) {
        float density = getResources().getDisplayMetrics().density;
        return Math.round(v * density);
    }
}
