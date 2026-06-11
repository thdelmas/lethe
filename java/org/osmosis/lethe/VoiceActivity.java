package org.osmosis.lethe;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.os.Bundle;
import android.util.Log;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;

/**
 * Native voice surface (lethe#190, Route 3 — see
 * docs/design/launcher-architecture-routes.md).
 *
 * Launch:  am start -a lethe.intent.VOICE  (also via assist long-press —
 * LetheAssistActivity forwards here so the assist path works on user
 * builds where the WebView host crashes).
 *
 * Records 16 kHz mono PCM with AudioRecord, wraps it in a WAV header,
 * and posts it to the agent core's OpenAI-compatible STT endpoint
 * (POST /v1/audio/transcriptions, multipart "file" field — see
 * agent/src/routes/audio.rs). The transcript is handed to ChatActivity,
 * which streams the answer. Audio never leaves the device: the backend
 * runs sherpa-onnx or whisper.cpp locally.
 */
public class VoiceActivity extends Activity {

    private static final String TAG = "lethe-voice";
    private static final int REQ_MIC = 1;
    private static final int SAMPLE_RATE = 16000;
    private static final int MAX_SECONDS = 30;
    private static final String BOUNDARY = "----lethe-voice-boundary";

    private TextView status;
    private Button done;
    private volatile boolean recording;
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
            startRecording();
        }
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] res) {
        if (code == REQ_MIC && res.length > 0
                && res[0] == PackageManager.PERMISSION_GRANTED) {
            startRecording();
        } else {
            Toast.makeText(this, "Microphone permission needed",
                Toast.LENGTH_SHORT).show();
            finish();
        }
    }

    @Override
    protected void onDestroy() {
        recording = false;
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
                    startRecording();
                } else {
                    recording = false;
                    done.setEnabled(false);
                    status.setText("Thinking…");
                }
            }
        });
        root.addView(done);
        setContentView(root);
    }

    // --- recording ------------------------------------------------------------

    private void startRecording() {
        recording = true;
        new Thread(new Runnable() {
            @Override public void run() { recordLoop(); }
        }, "lethe-voice-rec").start();
    }

    private void recordLoop() {
        int minBuf = AudioRecord.getMinBufferSize(SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
        AudioRecord rec = new AudioRecord(MediaRecorder.AudioSource.MIC,
            SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT, Math.max(minBuf, 8192));
        if (rec.getState() != AudioRecord.STATE_INITIALIZED) {
            rec.release();
            fail("Microphone unavailable.");
            return;
        }
        ByteArrayOutputStream pcm = new ByteArrayOutputStream();
        byte[] buf = new byte[4096];
        long maxBytes = (long) SAMPLE_RATE * 2 * MAX_SECONDS;
        rec.startRecording();
        while (recording && pcm.size() < maxBytes) {
            int n = rec.read(buf, 0, buf.length);
            if (n > 0) pcm.write(buf, 0, n);
        }
        rec.stop();
        rec.release();
        if (pcm.size() < SAMPLE_RATE / 2) {  // under ~0.25s of audio
            fail("Heard nothing.");
            return;
        }
        transcribe(wavFromPcm(pcm.toByteArray()));
    }

    /** Standard 44-byte RIFF header for 16 kHz mono 16-bit PCM — the
     *  format both on-device STT engines want, so the backend's ffmpeg
     *  pass is a no-op conversion. */
    private static byte[] wavFromPcm(byte[] pcm) {
        ByteBuffer header = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN);
        header.put("RIFF".getBytes(StandardCharsets.US_ASCII));
        header.putInt(36 + pcm.length);
        header.put("WAVEfmt ".getBytes(StandardCharsets.US_ASCII));
        header.putInt(16);                       // PCM fmt chunk size
        header.putShort((short) 1);              // PCM
        header.putShort((short) 1);              // mono
        header.putInt(SAMPLE_RATE);
        header.putInt(SAMPLE_RATE * 2);          // byte rate
        header.putShort((short) 2);              // block align
        header.putShort((short) 16);             // bits per sample
        header.put("data".getBytes(StandardCharsets.US_ASCII));
        header.putInt(pcm.length);
        byte[] wav = new byte[44 + pcm.length];
        System.arraycopy(header.array(), 0, wav, 0, 44);
        System.arraycopy(pcm, 0, wav, 44, pcm.length);
        return wav;
    }

    // --- transcription ----------------------------------------------------------

    private void transcribe(byte[] wav) {
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(
                AgentChatClient.BASE + "/v1/audio/transcriptions").openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(5000);
            conn.setReadTimeout(60000);
            conn.setRequestProperty("Content-Type",
                "multipart/form-data; boundary=" + BOUNDARY);
            conn.setDoOutput(true);
            OutputStream os = conn.getOutputStream();
            os.write(("--" + BOUNDARY + "\r\n"
                + "Content-Disposition: form-data; name=\"file\"; "
                + "filename=\"voice.wav\"\r\n"
                + "Content-Type: audio/wav\r\n\r\n")
                .getBytes(StandardCharsets.UTF_8));
            os.write(wav);
            os.write(("\r\n--" + BOUNDARY + "--\r\n")
                .getBytes(StandardCharsets.UTF_8));
            os.close();

            if (conn.getResponseCode() != 200) {
                fail("Thinking core unreachable.");
                return;
            }
            JSONObject resp = new JSONObject(slurp(conn));
            String text = resp.optString("text", "").trim();
            if (text.isEmpty()) {
                String err = resp.optString("error", "Could not transcribe.");
                fail(err);
                return;
            }
            handOff(text);
        } catch (Exception e) {
            Log.w(TAG, "transcription failed", e);
            fail("Thinking core unreachable.");
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static String slurp(HttpURLConnection conn) throws Exception {
        java.io.BufferedReader br = new java.io.BufferedReader(
            new java.io.InputStreamReader(
                conn.getInputStream(), StandardCharsets.UTF_8));
        StringBuilder sb = new StringBuilder();
        String line;
        while ((line = br.readLine()) != null) sb.append(line);
        br.close();
        return sb.toString();
    }

    private void handOff(final String transcript) {
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

    private void fail(final String message) {
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
