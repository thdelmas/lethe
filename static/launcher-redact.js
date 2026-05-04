/* LETHE — pre-cloud prompt sanitization (lethe#96, regex pass).
 *
 * For non-local providers, scrub PII-shaped tokens out of every message
 * before it leaves the device. Token-stable placeholders so the same
 * phone number used twice in a session is [PHONE_1] both times — the
 * model's response stays grounded.
 *
 * This is the regex pass only. The NER pass (PERSON / ORG / LOC) needs
 * an on-device classifier and is tracked in lethe#96. Names are NOT
 * redacted here; users who can't tolerate that should use field-build
 * (lethe#95) so the cloud paths don't exist at all.
 *
 * Patterns (intentionally conservative — false positives are worse than
 * a few unredacted tokens for a journalist who has already chosen cloud):
 *   - phone:  +<digits><sep><digits>... 8+ digits total
 *   - email:  user@host.tld
 *   - coord:  -DD.D{4+}, -DDD.D{4+} (lat,long)
 *   - iban:   2-letter country + 2-digit check + 11-30 alphanum
 *   - ipv4:   four 0-255 octets separated by dots
 */

(function (root) {
  function makeStore() {
    return { phone: {}, email: {}, coord: {}, iban: {}, ip: {}, _next: {} };
  }

  function tag(store, kind, raw) {
    if (store[kind][raw] !== undefined) return store[kind][raw];
    store._next[kind] = (store._next[kind] || 0) + 1;
    var placeholder = "[" + kind.toUpperCase() + "_" + store._next[kind] + "]";
    store[kind][raw] = placeholder;
    return placeholder;
  }

  // Order matters — emails before phones, otherwise the local-part of an
  // email gets sliced into a phone match. Coords before phones for the
  // same reason. IBAN before phone (alphanum). IPv4 last.
  var REGEX_EMAIL = /\b[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}\b/gi;
  var REGEX_COORD = /-?\d{1,3}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}/g;
  var REGEX_IBAN = /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g;
  var REGEX_PHONE = /\+?\d[\d\s\-().]{7,18}\d/g;
  var REGEX_IPV4 = /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\b/g;

  function _isPhoneish(s) {
    var digits = s.replace(/\D/g, "");
    return digits.length >= 8 && digits.length <= 16;
  }

  /* Redact a single string. Returns { text, count }. */
  function redactString(s, store) {
    if (typeof s !== "string" || !s) return { text: s, count: 0 };
    var count = 0;

    s = s.replace(REGEX_EMAIL, function (m) {
      count++;
      return tag(store, "email", m);
    });
    s = s.replace(REGEX_COORD, function (m) {
      count++;
      return tag(store, "coord", m);
    });
    s = s.replace(REGEX_IBAN, function (m) {
      count++;
      return tag(store, "iban", m);
    });
    // IPv4 before phone — phone's permissive separator class includes dots
    // so `192.168.1.42` would otherwise be misclassified as a phone.
    s = s.replace(REGEX_IPV4, function (m) {
      count++;
      return tag(store, "ip", m);
    });
    s = s.replace(REGEX_PHONE, function (m) {
      if (!_isPhoneish(m)) return m;
      count++;
      return tag(store, "phone", m);
    });
    return { text: s, count: count };
  }

  /* Walk a chat-style message and redact its content (which may be a
   * string OR an array of {type, text|...} blocks per Anthropic format). */
  function redactMessage(msg, store) {
    if (!msg) return { msg: msg, count: 0 };
    var total = 0;
    if (typeof msg.content === "string") {
      var r = redactString(msg.content, store);
      total += r.count;
      return { msg: { role: msg.role, content: r.text }, count: total };
    }
    if (Array.isArray(msg.content)) {
      var out = [];
      for (var i = 0; i < msg.content.length; i++) {
        var block = msg.content[i];
        if (block && typeof block.text === "string") {
          var rr = redactString(block.text, store);
          total += rr.count;
          var copy = {};
          for (var k in block) if (Object.prototype.hasOwnProperty.call(block, k)) copy[k] = block[k];
          copy.text = rr.text;
          out.push(copy);
        } else {
          out.push(block);
        }
      }
      var newMsg = {};
      for (var kk in msg) if (Object.prototype.hasOwnProperty.call(msg, kk)) newMsg[kk] = msg[kk];
      newMsg.content = out;
      return { msg: newMsg, count: total };
    }
    return { msg: msg, count: 0 };
  }

  /* Public entry point: redact every message in a chat-history array.
   * Returns { msgs, count, store } where store can be reused across calls
   * in the same session for token-stable placeholders. */
  function redactMsgsForCloud(msgs, store) {
    if (!Array.isArray(msgs)) return { msgs: msgs, count: 0, store: store };
    store = store || makeStore();
    var total = 0;
    var out = [];
    for (var i = 0; i < msgs.length; i++) {
      // Don't touch the system prompt — it's our own copy, not user data.
      if (i === 0 && msgs[i] && msgs[i].role === "system") {
        out.push(msgs[i]);
        continue;
      }
      var r = redactMessage(msgs[i], store);
      total += r.count;
      out.push(r.msg);
    }
    return { msgs: out, count: total, store: store };
  }

  root.LetheRedact = {
    makeStore: makeStore,
    redactString: redactString,
    redactMsgsForCloud: redactMsgsForCloud
  };
})(typeof window !== "undefined" ? window : this);
