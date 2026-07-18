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
 * HTTP client for LETHE chat (lethe#188, Route 3).
 *
 * The local agent core on localhost:8080 is OpenAI-compatible and streamed
 * (stream=true, SSE). Cloud providers (lethe#196) are non-streamed and, per
 * the active config, formatted as Anthropic ({@code /v1/messages}) or
 * OpenAI-compatible ({@code /chat/completions}). Before any message leaves
 * the device on a cloud call it passes through context truncation (lethe#97)
 * and PII redaction (lethe#96, {@link LetheRedact}). All callbacks arrive on
 * the main thread.
 */
final class AgentChatClient {

    interface Listener {
        void onDelta(String chunk);
        void onComplete(String fullText);
        void onError(String message);
        /** Transient status (e.g. "redacted 3"); ChatActivity surfaces it. */
        void onStatus(String message);
    }

    private static final String TAG = "lethe-chat-client";
    static final String BASE = "http://127.0.0.1:8080";
    private static final int CONNECT_TIMEOUT_MS = 5000;
    /* Tool-chaining turns inside the agent can take a while. */
    private static final int READ_TIMEOUT_MS = 120000;
    private static final int MAX_TOKENS_LOCAL = 1024;
    private static final int MAX_TOKENS_CLOUD = 512;

    private final Handler main = new Handler(Looper.getMainLooper());
    /** Session-stable redaction store; reset by ChatActivity on /clear. */
    private LetheRedact.Store redactStore;

    /** Resolved chat target. format is "anthropic" or "openai". */
    private static final class Provider {
        String name, endpoint, format, key, model;
        boolean isLocal;
    }

    void resetRedactStore() { redactStore = null; }

    /** POST the conversation; stream or fetch the reply through the listener. */
    void send(final JSONArray messages, final Listener listener) {
        new Thread(new Runnable() {
            @Override public void run() { doSend(messages, listener); }
        }, "lethe-chat-send").start();
    }

    private void doSend(JSONArray messages, final Listener listener) {
        Provider p = resolveProvider();
        if (p.isLocal) {
            sendLocalStreaming(messages, p, listener);
        } else {
            sendCloud(messages, p, listener);
        }
    }

    // --- local (streaming) --------------------------------------------------

    private void sendLocalStreaming(JSONArray messages, Provider p,
                                    final Listener listener) {
        HttpURLConnection conn = null;
        try {
            JSONObject body = new JSONObject();
            body.put("messages", messages);
            body.put("max_tokens", MAX_TOKENS_LOCAL);
            body.put("stream", true);
            // The backend auto-starts llama-server only when the request names
            // a model (agent/src/routes/llm.rs) — same conditional config.js used.
            if (p.model != null && !p.model.isEmpty()) body.put("model", p.model);

            conn = open(BASE + "/v1/chat/completions");
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setDoOutput(true);
            conn.setReadTimeout(READ_TIMEOUT_MS);
            writeBody(conn, body.toString());

            if (conn.getResponseCode() != 200) {
                fail(listener, "Agent error " + conn.getResponseCode());
                return;
            }
            String contentType = conn.getContentType();
            if (contentType != null && contentType.contains("text/event-stream")) {
                readSse(conn.getInputStream(), listener);
            } else {
                String text = extractOpenAiContent(slurp(conn.getInputStream()));
                deliverWhole(listener, text != null ? text : "Malformed agent response.");
            }
        } catch (Exception e) {
            Log.w(TAG, "local chat request failed", e);
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
            String delta = extractStreamDelta(payload);
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

    /** choices[0].delta.content for stream chunks, falling back to
     *  choices[0].message.content for backends that ignore stream=true. */
    private static String extractStreamDelta(String payload) {
        try {
            JSONObject choice = new JSONObject(payload)
                .getJSONArray("choices").getJSONObject(0);
            JSONObject delta = choice.optJSONObject("delta");
            if (delta != null) return delta.optString("content", "");
            JSONObject msg = choice.optJSONObject("message");
            return msg != null ? msg.optString("content", "") : "";
        } catch (Exception e) {
            return null;
        }
    }

    // --- cloud (non-streaming, redacted) ------------------------------------

    private void sendCloud(JSONArray messages, Provider p, final Listener listener) {
        // 1. Truncate to system + latest user turn (lethe#97), then 2. redact
        //    PII before anything leaves the device (lethe#96). Order matters:
        //    truncate first so we don't pay to redact history we won't send.
        JSONArray msgs = truncateForCloud(messages);
        LetheRedact.Result r = LetheRedact.redactMsgsForCloud(msgs, redactStore);
        msgs = r.msgs;
        redactStore = r.store;
        if (r.count > 0) status(listener, "redacted " + r.count);

        HttpURLConnection conn = null;
        try {
            String url, payload;
            if ("anthropic".equals(p.format)) {
                url = p.endpoint + "/v1/messages";
                payload = anthropicBody(msgs, p).toString();
            } else {
                url = p.endpoint + "/chat/completions";
                payload = openAiBody(msgs, p).toString();
            }
            conn = open(url);
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setReadTimeout(READ_TIMEOUT_MS);
            if ("anthropic".equals(p.format)) {
                conn.setRequestProperty("x-api-key", p.key);
                conn.setRequestProperty("anthropic-version", "2023-06-01");
            } else {
                if (p.key != null && !p.key.isEmpty()) {
                    conn.setRequestProperty("Authorization", "Bearer " + p.key);
                }
                if ("openrouter".equals(p.name)) {
                    conn.setRequestProperty("HTTP-Referer", "https://osmosis.dev");
                    conn.setRequestProperty("X-Title", "LETHE");
                }
            }
            conn.setDoOutput(true);
            writeBody(conn, payload);

            int code = conn.getResponseCode();
            if (code != 200) {
                fail(listener, cloudError(p, code, conn));
                return;
            }
            String resp = slurp(conn.getInputStream());
            String text = "anthropic".equals(p.format)
                ? extractAnthropicContent(resp) : extractOpenAiContent(resp);
            deliverWhole(listener, text != null && !text.isEmpty()
                ? text : "Empty response from " + p.name + ".");
        } catch (Exception e) {
            Log.w(TAG, "cloud chat request failed", e);
            fail(listener, p.name + " unreachable.");
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static JSONObject anthropicBody(JSONArray msgs, Provider p) throws Exception {
        String system = "";
        JSONArray nonSystem = new JSONArray();
        for (int i = 0; i < msgs.length(); i++) {
            JSONObject m = msgs.optJSONObject(i);
            if (m == null) continue;
            if ("system".equals(m.optString("role"))) {
                system = m.optString("content", "");
            } else {
                nonSystem.put(m);
            }
        }
        return new JSONObject()
            .put("model", p.model)
            .put("max_tokens", MAX_TOKENS_CLOUD)
            .put("system", system)
            .put("messages", nonSystem);
    }

    private static JSONObject openAiBody(JSONArray msgs, Provider p) throws Exception {
        JSONObject body = new JSONObject()
            .put("messages", msgs)
            .put("max_tokens", MAX_TOKENS_CLOUD);
        if (p.model != null && !p.model.isEmpty()) body.put("model", p.model);
        return body;
    }

    private static String extractAnthropicContent(String resp) {
        try {
            JSONArray content = new JSONObject(resp).optJSONArray("content");
            if (content == null) return null;
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < content.length(); i++) {
                JSONObject block = content.optJSONObject(i);
                if (block != null && "text".equals(block.optString("type"))) {
                    sb.append(block.optString("text"));
                }
            }
            return sb.toString();
        } catch (Exception e) {
            return null;
        }
    }

    private static String extractOpenAiContent(String resp) {
        try {
            JSONObject msg = new JSONObject(resp).getJSONArray("choices")
                .getJSONObject(0).optJSONObject("message");
            return msg != null ? msg.optString("content", "") : "";
        } catch (Exception e) {
            return null;
        }
    }

    /** Best-effort human-readable error, mirroring config.js parseApiError. */
    private static String cloudError(Provider p, int code, HttpURLConnection conn) {
        if (code == 401 || code == 403) return p.name + ": invalid API key.";
        if (code == 429) return p.name + ": rate limited — try again shortly.";
        try {
            String body = slurp(conn.getErrorStream());
            JSONObject err = new JSONObject(body).optJSONObject("error");
            if (err != null && err.has("message")) {
                return p.name + ": " + err.optString("message");
            }
        } catch (Exception ignored) { }
        return p.name + " error " + code + ".";
    }

    // --- provider resolution ------------------------------------------------

    /** Resolve the active provider from persisted config. Falls back to local
     *  when no cloud provider is selected, or the selected one lacks a key. */
    private Provider resolveProvider() {
        Provider local = new Provider();
        local.name = "local";
        local.endpoint = BASE;
        local.format = "openai";
        local.isLocal = true;
        try {
            JSONObject cfg = new JSONObject(LetheConfig.loadPersistedConfig());
            JSONObject providers = cfg.optJSONObject("providers");
            String active = cfg.isNull("active_provider")
                ? null : cfg.optString("active_provider", null);
            if (providers != null && providers.optJSONObject("local") != null) {
                JSONObject lp = providers.getJSONObject("local");
                local.model = lp.isNull("model") ? null : lp.optString("model", null);
            }
            if (active == null || "local".equals(active) || "peer".equals(active)) {
                return local;
            }
            JSONObject pc = providers != null ? providers.optJSONObject(active) : null;
            if (pc == null) return local;
            String endpoint = pc.optString("endpoint", "");
            String key = pc.isNull("key") ? "" : pc.optString("key", "");
            // A cloud provider with no endpoint/key can't be called — stay local.
            if (endpoint.isEmpty() || key.isEmpty()) return local;
            Provider p = new Provider();
            p.name = active;
            p.endpoint = endpoint;
            p.key = key;
            p.model = pc.isNull("model") ? null : pc.optString("model", null);
            p.format = "anthropic".equals(active) ? "anthropic" : "openai";
            p.isLocal = false;
            return p;
        } catch (Exception e) {
            return local;
        }
    }

    /** Keep system(0) + the most recent real user turn onward for cloud calls
     *  (lethe#97). Opt out with top-level cloud_context_full=true. Skips
     *  tool_result-bearing user messages (current turn's tool loop). */
    private static JSONArray truncateForCloud(JSONArray msgs) {
        if (msgs == null || msgs.length() <= 2) return msgs;
        try {
            JSONObject cfg = new JSONObject(LetheConfig.loadPersistedConfig());
            if (cfg.optBoolean("cloud_context_full", false)) return msgs;
        } catch (Exception ignored) { }
        int keepFrom = -1;
        for (int i = msgs.length() - 1; i > 0; i--) {
            JSONObject m = msgs.optJSONObject(i);
            if (m == null || !"user".equals(m.optString("role"))) continue;
            Object content = m.opt("content");
            if (content instanceof JSONArray) {
                JSONObject first = ((JSONArray) content).optJSONObject(0);
                if (first != null && "tool_result".equals(first.optString("type"))) {
                    continue;
                }
            }
            keepFrom = i;
            break;
        }
        if (keepFrom <= 0) return msgs;
        JSONArray out = new JSONArray();
        out.put(msgs.opt(0));
        for (int j = keepFrom; j < msgs.length(); j++) out.put(msgs.opt(j));
        return out;
    }

    // --- probes (always local) ----------------------------------------------

    /** GET /api/device — device-state context. Null when unreachable. */
    JSONObject fetchDeviceState() {
        HttpURLConnection conn = null;
        try {
            conn = open(BASE + "/api/device");
            if (conn.getResponseCode() != 200) return null;
            return new JSONObject(slurp(conn.getInputStream()));
        } catch (Exception e) {
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    /** True when a cloud provider is active, or the local core answers. */
    boolean isChatAvailable() {
        if (!resolveProvider().isLocal) return true;
        HttpURLConnection conn = null;
        try {
            conn = open(BASE + "/v1/models");
            return conn.getResponseCode() == 200;
        } catch (Exception e) {
            return false;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    // --- shared helpers -----------------------------------------------------

    private static HttpURLConnection open(String url) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setConnectTimeout(CONNECT_TIMEOUT_MS);
        conn.setReadTimeout(CONNECT_TIMEOUT_MS);
        return conn;
    }

    private static void writeBody(HttpURLConnection conn, String body) throws Exception {
        OutputStream os = conn.getOutputStream();
        os.write(body.getBytes(StandardCharsets.UTF_8));
        os.close();
    }

    private static String slurp(InputStream in) throws Exception {
        if (in == null) return "";
        BufferedReader br = new BufferedReader(
            new InputStreamReader(in, StandardCharsets.UTF_8));
        StringBuilder sb = new StringBuilder();
        String line;
        while ((line = br.readLine()) != null) sb.append(line).append('\n');
        br.close();
        return sb.toString();
    }

    private void deliverWhole(final Listener listener, final String text) {
        main.post(new Runnable() {
            @Override public void run() {
                listener.onDelta(text);
                listener.onComplete(text);
            }
        });
    }

    private void status(final Listener listener, final String message) {
        main.post(new Runnable() {
            @Override public void run() { listener.onStatus(message); }
        });
    }

    private void fail(final Listener listener, final String message) {
        main.post(new Runnable() {
            @Override public void run() { listener.onError(message); }
        });
    }
}
