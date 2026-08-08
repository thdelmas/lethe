package org.osmosis.lethe;

import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.AudioTrack;
import android.media.MediaRecorder;
import android.util.Log;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;

/**
 * Shared voice transport (docs/design/voice-io.md): mic capture → WAV →
 * the agent core's STT endpoint, and text → the core's TTS endpoint →
 * speaker. Used by VoiceActivity (assist surface) and ChatActivity
 * (voice notes + spoken replies). Voice is a transport, not a second
 * brain — both directions go through the same local core that owns the
 * conversation, and the engines run core-side. This class never decides
 * anything; it moves audio.
 *
 * Capture stays in the app process: the daemon transcribes WAV bytes it
 * is handed, it never opens the mic (mic doctrine, voice-io.md).
 */
final class VoiceIo {

    private static final String TAG = "lethe-voice";
    private static final int SAMPLE_RATE = 16000;
    private static final int MAX_SECONDS = 30;
    private static final String BOUNDARY = "----lethe-voice-boundary";

    interface SttListener {
        /** Worker thread. */
        void onTranscript(String text);
        /** Worker thread. */
        void onVoiceError(String message);
    }

    private volatile boolean recording;
    private volatile AudioTrack playing;

    // --- capture → transcript -------------------------------------------------

    /** Starts the mic on a worker thread; stopRecording() ends the take
     *  and the transcript (or error) lands on the listener. */
    void startRecording(final SttListener listener) {
        if (recording) return;
        recording = true;
        new Thread(new Runnable() {
            @Override public void run() { recordLoop(listener); }
        }, "lethe-voice-rec").start();
    }

    void stopRecording() {
        recording = false;
    }

    boolean isRecording() {
        return recording;
    }

    private void recordLoop(SttListener listener) {
        int minBuf = AudioRecord.getMinBufferSize(SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
        AudioRecord rec = new AudioRecord(MediaRecorder.AudioSource.MIC,
            SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT, Math.max(minBuf, 8192));
        if (rec.getState() != AudioRecord.STATE_INITIALIZED) {
            rec.release();
            recording = false;
            listener.onVoiceError("Microphone unavailable.");
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
        recording = false;
        rec.stop();
        rec.release();
        if (pcm.size() < SAMPLE_RATE / 2) {  // under ~0.25s of audio
            listener.onVoiceError("Heard nothing.");
            return;
        }
        transcribe(wavFromPcm(pcm.toByteArray()), listener);
    }

    /** Standard 44-byte RIFF header for 16 kHz mono 16-bit PCM — the
     *  format both core-side STT engines want, so the backend's ffmpeg
     *  pass is a no-op conversion. */
    static byte[] wavFromPcm(byte[] pcm) {
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

    private void transcribe(byte[] wav, SttListener listener) {
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
                listener.onVoiceError("Thinking core unreachable.");
                return;
            }
            JSONObject resp = new JSONObject(
                new String(slurp(conn.getInputStream()), StandardCharsets.UTF_8));
            String text = resp.optString("text", "").trim();
            if (text.isEmpty()) {
                listener.onVoiceError(
                    resp.optString("error", "Could not transcribe."));
                return;
            }
            listener.onTranscript(text);
        } catch (Exception e) {
            Log.w(TAG, "transcription failed", e);
            listener.onVoiceError("Thinking core unreachable.");
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    // --- text → speaker -------------------------------------------------------

    /** Speaks text through the core's TTS endpoint on a worker thread.
     *  A second call stops the current playback first. onDone runs on
     *  the worker when playback ends or fails (UI re-arms there). */
    void speak(final String text, final Runnable onDone) {
        stopSpeaking();
        new Thread(new Runnable() {
            @Override public void run() {
                try {
                    playWav(fetchTts(text));
                } catch (Exception e) {
                    Log.w(TAG, "tts failed", e);
                } finally {
                    if (onDone != null) onDone.run();
                }
            }
        }, "lethe-voice-tts").start();
    }

    void stopSpeaking() {
        AudioTrack t = playing;
        playing = null;
        if (t != null) {
            try { t.stop(); } catch (IllegalStateException ignored) { }
            t.release();
        }
    }

    boolean isSpeaking() {
        return playing != null;
    }

    private static byte[] fetchTts(String text) throws Exception {
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(
                AgentChatClient.BASE + "/v1/audio/speech").openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(5000);
            conn.setReadTimeout(60000);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setDoOutput(true);
            byte[] body = new JSONObject().put("input", text)
                .toString().getBytes(StandardCharsets.UTF_8);
            conn.getOutputStream().write(body);
            if (conn.getResponseCode() != 200) {
                throw new IllegalStateException("tts http " + conn.getResponseCode());
            }
            return slurp(conn.getInputStream());
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    /** Minimal RIFF parse: sample rate from the fmt chunk, PCM from the
     *  data chunk. Piper writes canonical mono 16-bit WAVs. */
    private void playWav(byte[] wav) {
        if (wav.length < 44) return;
        ByteBuffer bb = ByteBuffer.wrap(wav).order(ByteOrder.LITTLE_ENDIAN);
        int sampleRate = bb.getInt(24);
        int dataOff = 12;
        int dataLen = 0;
        while (dataOff + 8 <= wav.length) {
            int chunkLen = bb.getInt(dataOff + 4);
            if (wav[dataOff] == 'd' && wav[dataOff + 1] == 'a'
                    && wav[dataOff + 2] == 't' && wav[dataOff + 3] == 'a') {
                dataLen = Math.min(chunkLen, wav.length - dataOff - 8);
                dataOff += 8;
                break;
            }
            dataOff += 8 + chunkLen + (chunkLen & 1);
        }
        if (dataLen <= 0 || sampleRate <= 0) return;

        AudioTrack track = new AudioTrack.Builder()
            .setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ASSISTANT)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build())
            .setAudioFormat(new AudioFormat.Builder()
                .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                .setSampleRate(sampleRate)
                .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                .build())
            .setTransferMode(AudioTrack.MODE_STATIC)
            .setBufferSizeInBytes(dataLen)
            .build();
        track.write(wav, dataOff, dataLen);
        playing = track;
        track.play();
        /* MODE_STATIC has no end callback worth the wire — poll the head
         * position until the clip runs out or stopSpeaking() clears us. */
        int frames = dataLen / 2;
        while (playing == track && track.getPlaybackHeadPosition() < frames) {
            try { Thread.sleep(50); } catch (InterruptedException e) { break; }
        }
        if (playing == track) {
            playing = null;
            track.release();
        }
    }

    private static byte[] slurp(InputStream in) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        in.close();
        return out.toByteArray();
    }
}
