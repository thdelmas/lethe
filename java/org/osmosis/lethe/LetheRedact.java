package org.osmosis.lethe;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Pre-cloud prompt sanitization (lethe#96 regex pass) — Java port of the
 * WebView's static/launcher-redact.js, for native cloud chat (lethe#196).
 *
 * For non-local providers, scrub PII-shaped tokens out of every message
 * before it leaves the device. Placeholders are token-stable within a
 * session: the same phone number used twice becomes [PHONE_1] both times,
 * so the model's reply stays grounded. Keep one {@link Store} per chat
 * session and reuse it across calls.
 *
 * This is the regex pass only. The NER pass (PERSON / ORG / LOC) needs an
 * on-device classifier and is still tracked in lethe#96 — names are NOT
 * redacted here. Users who cannot tolerate that should use a field build
 * (lethe#95) so the cloud paths do not exist at all.
 *
 * Patterns are intentionally conservative — for someone who has already
 * chosen a cloud provider, a few unredacted tokens are less harmful than
 * false positives mangling their prompt.
 */
final class LetheRedact {

    /** Per-session placeholder map. Reuse across calls for stable tags. */
    static final class Store {
        // kind -> (raw value -> placeholder), insertion-ordered for stable numbering.
        private final Map<String, Map<String, String>> tags = new LinkedHashMap<>();
        private final Map<String, Integer> next = new LinkedHashMap<>();

        String tag(String kind, String raw) {
            Map<String, String> m = tags.get(kind);
            if (m == null) { m = new LinkedHashMap<>(); tags.put(kind, m); }
            String existing = m.get(raw);
            if (existing != null) return existing;
            int n = (next.containsKey(kind) ? next.get(kind) : 0) + 1;
            next.put(kind, n);
            String placeholder = "[" + kind.toUpperCase() + "_" + n + "]";
            m.put(raw, placeholder);
            return placeholder;
        }
    }

    /** Result of redacting a message array. */
    static final class Result {
        final JSONArray msgs;
        final int count;
        final Store store;
        Result(JSONArray msgs, int count, Store store) {
            this.msgs = msgs; this.count = count; this.store = store;
        }
    }

    // Order matters — emails before phones (an email local-part would slice
    // into a phone match), coords before phones, IBAN before phone (alphanum),
    // IPv4 before phone (phone's separator class includes dots, so 192.168.1.42
    // would otherwise look like a phone).
    private static final Pattern EMAIL =
        Pattern.compile("\\b[A-Z0-9._%+\\-]+@[A-Z0-9.\\-]+\\.[A-Z]{2,}\\b",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern COORD =
        Pattern.compile("-?\\d{1,3}\\.\\d{4,}\\s*,\\s*-?\\d{1,3}\\.\\d{4,}");
    private static final Pattern IBAN =
        Pattern.compile("\\b[A-Z]{2}\\d{2}[A-Z0-9]{11,30}\\b");
    private static final Pattern IPV4 = Pattern.compile(
        "\\b(?:(?:25[0-5]|2[0-4]\\d|[01]?\\d?\\d)\\.){3}"
        + "(?:25[0-5]|2[0-4]\\d|[01]?\\d?\\d)\\b");
    private static final Pattern PHONE =
        Pattern.compile("\\+?\\d[\\d\\s\\-().]{7,18}\\d");

    private LetheRedact() {}

    private static boolean isPhoneish(String s) {
        int digits = 0;
        for (int i = 0; i < s.length(); i++) {
            if (Character.isDigit(s.charAt(i))) digits++;
        }
        return digits >= 8 && digits <= 16;
    }

    private static final class Counter { int n; }

    /** Redact a single string. Returns the redacted text; increments c.n. */
    static String redactString(String s, Store store, Counter c) {
        if (s == null || s.isEmpty()) return s;
        s = replace(EMAIL, s, store, "email", c, false);
        s = replace(COORD, s, store, "coord", c, false);
        s = replace(IBAN, s, store, "iban", c, false);
        s = replace(IPV4, s, store, "ip", c, false);
        s = replace(PHONE, s, store, "phone", c, true);
        return s;
    }

    private static String replace(Pattern p, String s, Store store, String kind,
                                  Counter c, boolean phoneGuard) {
        Matcher m = p.matcher(s);
        StringBuffer sb = new StringBuffer();
        while (m.find()) {
            String raw = m.group();
            if (phoneGuard && !isPhoneish(raw)) {
                m.appendReplacement(sb, Matcher.quoteReplacement(raw));
                continue;
            }
            c.n++;
            m.appendReplacement(sb, Matcher.quoteReplacement(store.tag(kind, raw)));
        }
        m.appendTail(sb);
        return sb.toString();
    }

    /**
     * Redact every message in a chat-history array. The system prompt
     * (index 0, role=system) is our own copy, not user data, so it is left
     * untouched. Content may be a String or an array of {type,text,...}
     * blocks (Anthropic format) — both are walked. Returns a new array;
     * the input is not mutated.
     */
    static Result redactMsgsForCloud(JSONArray msgs, Store store) {
        if (msgs == null) return new Result(msgs, 0, store);
        if (store == null) store = new Store();
        Counter c = new Counter();
        JSONArray out = new JSONArray();
        for (int i = 0; i < msgs.length(); i++) {
            JSONObject msg = msgs.optJSONObject(i);
            if (msg == null) { out.put(msgs.opt(i)); continue; }
            if (i == 0 && "system".equals(msg.optString("role"))) {
                out.put(msg);
                continue;
            }
            out.put(redactMessage(msg, store, c));
        }
        return new Result(out, c.n, store);
    }

    private static JSONObject redactMessage(JSONObject msg, Store store, Counter c) {
        try {
            Object content = msg.opt("content");
            if (content instanceof String) {
                JSONObject copy = new JSONObject(msg.toString());
                copy.put("content", redactString((String) content, store, c));
                return copy;
            }
            if (content instanceof JSONArray) {
                JSONArray blocks = (JSONArray) content;
                JSONArray outBlocks = new JSONArray();
                for (int i = 0; i < blocks.length(); i++) {
                    JSONObject block = blocks.optJSONObject(i);
                    if (block != null && block.opt("text") instanceof String) {
                        JSONObject bc = new JSONObject(block.toString());
                        bc.put("text", redactString(block.optString("text"), store, c));
                        outBlocks.put(bc);
                    } else {
                        outBlocks.put(blocks.opt(i));
                    }
                }
                JSONObject copy = new JSONObject(msg.toString());
                copy.put("content", outBlocks);
                return copy;
            }
        } catch (org.json.JSONException e) {
            // Fall through — return the message unchanged rather than risk
            // sending a half-redacted copy.
        }
        return msg;
    }
}
