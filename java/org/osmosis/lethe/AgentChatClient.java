package org.osmosis.lethe;

import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * HTTP client for the local LETHE agent core on localhost:8080
 * (lethe#188, Route 3). OpenAI-compatible chat completions, requested
 * with stream=true: SSE deltas are forwarded chunk-by-chunk when the
 * backend streams, and a plain JSON body is handled as a single chunk
 * when it doesn't. All callbacks arrive on the main thread.
 *
 * Cloud providers are deliberately not routed here — the WebView chat's
 * redaction (lethe#96) and context-truncation (lethe#97) layers haven't
 * been ported to Java yet, and calling cloud endpoints without them
 * would regress the privacy posture. Local-only until that port lands.
 */
final class AgentChatClient {

    interface Listener {
        void onDelta(String chunk);
        void onComplete(String fullText);
        void onError(String message);
    }

    private static final String TAG = "lethe-chat-client";
    static final String BASE = "http://127.0.0.1:8080";
    private static final int CONNECT_TIMEOUT_MS = 5000;
    /* Tool-chaining turns inside the agent can take a while. */
    private static final int READ_TIMEOUT_MS = 120000;
    /* Matches maxTokensFor('local') in static/config.js. */
    private static final int MAX_TOKENS = 1024;

    private final Handler main = new Handler(Looper.getMainLooper());

    /** POST the conversation; stream the reply through the listener. */
    void send(final JSONArray messages, final Listener listener) {
        new Thread(new Runnable() {
            @Override public void run() { doSend(messages, listener); }
        }, "lethe-chat-send").start();
    }

    private void doSend(JSONArray messages, final Listener listener) {
        HttpURLConnection conn = null;
        try {
            JSONObject body = new JSONObject();
            body.put("messages", messages);
            body.put("max_tokens", MAX_TOKENS);
            body.put("stream", true);
            // The backend auto-starts llama-server only when the request
            // names a model (agent/src/routes/llm.rs) — same conditional
            // the WebView chat applies from config.js.
            String model = localModel();
            if (!model.isEmpty()) body.put("model", model);

            conn = open("/v1/chat/completions");
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setDoOutput(true);
            conn.setReadTimeout(READ_TIMEOUT_MS);
            OutputStream os = conn.getOutputStream();
            os.write(body.toString().getBytes(StandardCharsets.UTF_8));
            os.close();

            int status = conn.getResponseCode();
            if (status != 200) {
                fail(listener, "Agent error " + status);
                return;
            }
            String contentType = conn.getContentType();
            if (contentType != null && contentType.contains("text/event-stream")) {
                readSse(conn.getInputStream(), listener);
            } else {
                readJson(conn.getInputStream(), listener);
            }
        } catch (Exception e) {
            Log.w(TAG, "chat request failed", e);
            fail(listener, "Thinking core unreachable.");
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private void readSse(InputStream in, final Listener listener) throws Exception {
        BufferedReader br = new BufferedReader(
            new InputStreamReader(in, StandardCharsets.UTF_8));
        final StringBuilder full = new StringBuilder();
        String line;
        while ((line = br.readLine()) != null) {
            if (!line.startsWith("data:")) continue;
            String payload = line.substring(5).trim();
            if (payload.isEmpty() || "[DONE]".equals(payload)) {
                if ("[DONE]".equals(payload)) break;
                continue;
            }
            String delta = extractDelta(payload);
            if (delta != null && !delta.isEmpty()) {
                full.append(delta);
                final String chunk = delta;
                main.post(new Runnable() {
                    @Override public void run() { listener.onDelta(chunk); }
                });
            }
        }
        br.close();
        main.post(new Runnable() {
            @Override public void run() { listener.onComplete(full.toString()); }
        });
    }

    /** choices[0].delta.content for stream chunks, with a fallback to
     *  choices[0].message.content for backends that ignore stream=true
     *  but still label the body as an event stream. */
    private static String extractDelta(String payload) {
        try {
            JSONObject chunk = new JSONObject(payload);
            JSONObject choice = chunk.getJSONArray("choices").getJSONObject(0);
            JSONObject delta = choice.optJSONObject("delta");
            if (delta != null) return delta.optString("content", "");
            JSONObject msg = choice.optJSONObject("message");
            return msg != null ? msg.optString("content", "") : "";
        } catch (Exception e) {
            return null;
        }
    }

    private void readJson(InputStream in, final Listener listener) throws Exception {
        final String text = extractDelta(slurp(in));
        if (text == null) {
            fail(listener, "Malformed agent response.");
            return;
        }
        main.post(new Runnable() {
            @Override public void run() {
                listener.onDelta(text);
                listener.onComplete(text);
            }
        });
    }

    /** GET /api/device — device-state context for the system prompt.
     *  Returns null when the backend is unreachable (SHELL mode). */
    JSONObject fetchDeviceState() {
        HttpURLConnection conn = null;
        try {
            conn = open("/api/device");
            if (conn.getResponseCode() != 200) return null;
            return new JSONObject(slurp(conn.getInputStream()));
        } catch (Exception e) {
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    /** GET /v1/models — cheap availability probe, same as checkAgent()
     *  in static/launcher.js. */
    boolean isAgentAvailable() {
        HttpURLConnection conn = null;
        try {
            conn = open("/v1/models");
            return conn.getResponseCode() == 200;
        } catch (Exception e) {
            return false;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    /** providers.local.model from the persisted config, "" when unset. */
    private static String localModel() {
        try {
            JSONObject local = new JSONObject(LetheConfig.loadPersistedConfig())
                .getJSONObject("providers").getJSONObject("local");
            return local.isNull("model") ? "" : local.optString("model", "");
        } catch (Exception e) {
            return "";
        }
    }

    private static HttpURLConnection open(String path) throws Exception {
        HttpURLConnection conn =
            (HttpURLConnection) new URL(BASE + path).openConnection();
        conn.setConnectTimeout(CONNECT_TIMEOUT_MS);
        conn.setReadTimeout(CONNECT_TIMEOUT_MS);
        return conn;
    }

    private static String slurp(InputStream in) throws Exception {
        BufferedReader br = new BufferedReader(
            new InputStreamReader(in, StandardCharsets.UTF_8));
        StringBuilder sb = new StringBuilder();
        String line;
        while ((line = br.readLine()) != null) sb.append(line).append('\n');
        br.close();
        return sb.toString();
    }

    private void fail(final Listener listener, final String message) {
        main.post(new Runnable() {
            @Override public void run() { listener.onError(message); }
        });
    }
}
