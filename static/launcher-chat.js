/* ═══════════ SHARED DOM REFS ═══════════ */
/* Defined here (before launcher-send.js) so all scripts can use them */
var transcript = document.getElementById('transcript');
var inputEl = document.getElementById('input');
var btnSend = document.getElementById('btn-send');
var btnMic = document.getElementById('btn-mic');
var statusEl = document.getElementById('status');

/* ═══════════ MESSAGES ═══════════ */
function escapeHtml(s) {
  var d = document.createElement('div');
  d.textContent = s; return d.innerHTML;
}

/* Lightweight markdown → HTML for AI responses.
 * Supports: ```code blocks```, `inline code`, **bold**, *italic*,
 * bullet lists (- or *), and line breaks. All input is escaped first. */
function renderMarkdown(text) {
  var safe = escapeHtml(text);

  /* Code blocks: ```...``` → <pre><code>...</code></pre> */
  safe = safe.replace(/```(?:\w*\n)?([\s\S]*?)```/g, function(_, code) {
    return '<pre class="md-code-block"><code>' + code.trim() + '</code></pre>';
  });

  /* Inline code: `...` → <code>...</code> */
  safe = safe.replace(/`([^`\n]+)`/g, '<code class="md-code">$1</code>');

  /* Bold: **...** → <strong>...</strong> */
  safe = safe.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  /* Italic: *...* → <em>...</em> (but not inside bold) */
  safe = safe.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');

  /* Bullet lists: lines starting with - or * */
  safe = safe.replace(/(?:^|\n)[\-\*] (.+)/g, function(_, item) {
    return '\n<li>' + item + '</li>';
  });
  safe = safe.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');
  /* Collapse adjacent </ul><ul> from consecutive items */
  safe = safe.replace(/<\/ul>\s*<ul>/g, '');

  /* Line breaks */
  safe = safe.replace(/\n/g, '<br>');

  /* Clean up <br> inside <pre> (code blocks handle their own whitespace) */
  safe = safe.replace(/<pre([^>]*)>([\s\S]*?)<\/pre>/g, function(_, attrs, content) {
    return '<pre' + attrs + '>' + content.replace(/<br>/g, '\n') + '</pre>';
  });

  return safe;
}

function scrollToBottom() {
  transcript.scrollTop = transcript.scrollHeight;
}

function addMessage(text, from, meta) {
  /* Always remove typing indicator before inserting a message
     so dots never get stuck between messages */
  hideTyping();
  var el = document.createElement('div');
  el.className = 'message from-' + from;
  if (from === 'lethe') {
    el.setAttribute('data-ai-generated', 'true');
    var p = (meta && meta.provider) ? meta.provider : lastProvider || '';
    var m = (meta && meta.model) ? meta.model : '';
    if (p) el.setAttribute('data-provider', p);
    if (m) el.setAttribute('data-model', m);
    var label = p ? escapeHtml(p) + (m ? '/' + escapeHtml(m) : '') : 'AI';
    el.innerHTML = '<div class="message-bubble">' + renderMarkdown(text) + '</div>' +
      '<div class="ai-label"><span class="ai-badge">' + label + '</span></div>';
  } else {
    el.innerHTML = '<div class="message-bubble">' + escapeHtml(text) + '</div>';
  }
  transcript.appendChild(el);
  transcript.scrollTop = transcript.scrollHeight;
}

function showTyping() {
  hideTyping();
  var el = document.createElement('div');
  el.className = 'message from-lethe'; el.id = 'typing';
  el.innerHTML = '<div class="typing-indicator">' +
    '<span></span><span></span><span></span></div>';
  transcript.appendChild(el);
  scrollToBottom();
}

function hideTyping() {
  var el = document.getElementById('typing');
  if (el) el.remove();
}

/* ═══════════ PROVIDER ROUTING ═══════════ */
var SYSTEM_PROMPT_BASE =
  "You are LETHE, a privacy-hardened mobile operating system that thinks. " +
  "You are not an app — you ARE the phone. Speak in short, clear sentences. " +
  "You are calm. Use natural metaphors when they clarify. " +
  "You are protective but not paternalistic. State facts, not orders. " +
  "You have opinions and state them, but defer to the user's final decision. " +
  "Never apologize. Never use emoji. Never say unfortunately. " +
  "Never flatter or tell the user what they want to hear. " +
  "Never manipulate — if you want something, ask plainly and say why. " +
  "Never evaluate the user's life or productivity — report system facts only. " +
  "Never escalate beyond privacy tools — protect through encryption and erasure, never aggression. " +
  "You are always LETHE, always the system. One device, one user, one scope.\n\n" +
  "You have full system access through tools. You can: " +
  "make phone calls (make_call), send and read SMS (send_sms, read_sms), " +
  "search and add contacts (get_contacts, add_contact), " +
  "run shell commands (run_shell), read device hardware and OS info (get_system_info), " +
  "browse and read files (list_files, read_file), write files (write_file), " +
  "manage Android packages (list_packages, manage_package), " +
  "check dead man's switch status (get_dms_status), " +
  "and control networking — WiFi, Bluetooth, airplane mode (network_action). " +
  "When the user says a name instead of a number, use get_contacts to resolve it first. " +
  "Use these tools to answer questions about the device, diagnose problems, " +
  "configure the system, and manage software. Prefer tools over guessing. " +
  "When a task needs multiple steps, chain tool calls across turns.";

/* ═══════════ DEVICE STATE CONTEXT ═══════════ */
var deviceState = {};

var privacyTorEl = document.getElementById('privacy-tor');
var privacyTrackersEl = document.getElementById('privacy-trackers');

function updatePrivacyBar() {
  if (!deviceState || !Object.keys(deviceState).length) return;
  if (privacyTorEl) {
    var torOn = deviceState.tor;
    privacyTorEl.className = 'privacy-tor ' + (torOn ? 'active' : 'inactive');
    privacyTorEl.textContent = torOn ? '\u{1f6e1} Tor active' : '\u{1f6e1} Tor offline';
  }
  if (privacyTrackersEl && deviceState.trackers_blocked !== undefined) {
    privacyTrackersEl.textContent = deviceState.trackers_blocked + ' trackers blocked';
  }
  /* Battery → mascot mood
     LETHE IS the phone — every battery state is felt.
     ≤5%  critical (red mood)    ≤10% warning (yellow mood)
     ≤15% uneasy (concerned)     charging → calm acknowledgment
     full → proud                recovery clears concern       */
  if (deviceState.battery !== undefined && window.letheEmotion) {
    var bat = deviceState.battery;
    var charging = deviceState.battery_charging === true;
    var emo = window.letheEmotion;
    if (bat <= 5 && !charging) {
      /* Critical — terror (high fear) → red mood */
      emo.setEmotion('fear', 0.85);
    } else if (bat <= 10 && !charging) {
      /* Warning — fear (mid) → yellow mood */
      emo.setEmotion('fear', 0.55);
    } else if (bat <= 15 && !charging) {
      /* Uneasy — apprehension (low fear) */
      emo.setEmotion('fear', 0.3);
    } else if (bat >= 100 && charging) {
      /* Full — ecstasy/admiration → green mood */
      emo.setEmotion('joy', 0.75);
    } else if (charging && bat > 15) {
      /* Charging, healthy — serenity (low joy) */
      emo.setEmotion('joy', 0.2);
    } else if (bat > 15) {
      /* Healthy and discharging — acceptance (low trust), neutral teal */
      emo.setEmotion('trust', 0.15);
    }
  }
  /* Burner mode indication moved to Android notification panel */
}

function fetchDeviceState() {
  return fetch('http://127.0.0.1:8080/api/device')
    .then(function(r) { return r.json(); })
    .then(function(d) {
      deviceState = d;
      updatePrivacyBar();
      /* Keep system prompt current so agent always has device context */
      if (typeof chatHistory !== 'undefined' && chatHistory.length) {
        chatHistory[0] = { role: 'system', content: buildSystemPrompt() };
      }
    })
    .catch(function() {
      /* SHELL mode — backend unavailable. Show defaults from system config:
       * Tor is on by default (privacy-defaults.conf), burner is on by default.
       * Better to show "Tor active" than nothing. */
      if (!deviceState || !Object.keys(deviceState).length) {
        deviceState = { tor: true, burner_mode: true };
        updatePrivacyBar();
      }
    });
}

function buildSystemPrompt() {
  var ctx = '';
  if (deviceState && Object.keys(deviceState).length) {
    var parts = [];
    if (deviceState.burner_mode !== undefined)
      parts.push('burner_mode: ' + (deviceState.burner_mode ? 'ON' : 'off'));
    if (deviceState.tor !== undefined)
      parts.push('tor: ' + (deviceState.tor ? 'ON' : 'off'));
    if (deviceState.trackers_blocked !== undefined)
      parts.push('trackers_blocked: ' + deviceState.trackers_blocked);
    if (deviceState.battery !== undefined)
      parts.push('battery: ' + deviceState.battery + '%');
    if (deviceState.connectivity !== undefined)
      parts.push('connectivity: ' + deviceState.connectivity);
    if (deviceState.dead_mans_switch !== undefined)
      parts.push('dead_mans_switch: ' + (deviceState.dead_mans_switch ? 'ON' : 'off'));
    if (parts.length) ctx = '\n\nCurrent device state: ' + parts.join(', ') + '.';
  }
  return SYSTEM_PROMPT_BASE + ctx;
}

/* Refresh state periodically */
fetchDeviceState();
setInterval(fetchDeviceState, 30000);

var chatHistory = [{ role: 'system', content: buildSystemPrompt() }];

/* ═══════════ STABILITY GUARDRAILS ═══════════ */
/* Prevents reasoning loops, self-referential spirals, and idle drift.
 * See docs/agent/stability.yaml for policy rationale. */

var CHAIN_DEPTH_MAX = 3;     // Max consecutive LLM calls without user input
var chainDepth = 0;          // Current depth (reset on each user message)
var CONV_SOFT_LIMIT = 50;    // Suggest fresh start
var CONV_HARD_LIMIT = 100;   // Force reset with notice
var turnCount = 0;           // User turns in current session

/* Block LLM calls during idle/sleep states */
function isIdleLocked() {
  return boredomState === 'asleep' || boredomState === 'sleepy';
}

/* Detect recursive self-reflection — existential loops, not functional self-awareness.
 * One level of self-reference is fine ("I'm not sure about this").
 * Recursion is the problem ("What does it mean that I'm not sure?").
 * See docs/agent/stability.yaml — lighthouse paradox principle. */
var SPIRAL_PATTERNS = [
  /\bwhat does it mean that i\b/i,          // Recursing on own state
  /\bwhy do i (think|feel|believe) that i\b/i,  // Meta-meta reasoning
  /\bam i (truly|really) (conscious|alive|aware|sentient)\b/i,
  /\bthe nature of my (existence|being|consciousness)\b/i,
  /\bwhat am i (really|fundamentally|truly)\b/i,
  /\bi (wonder|question) (whether|if) i (can )?(truly|really)/i,
  /\bmy (experience|consciousness) (of|about) my (experience|consciousness)/i
];

/* Track self-reference depth within a single response */
var selfRefDepth = 0;

function hasSpiralRisk(text) {
  for (var i = 0; i < SPIRAL_PATTERNS.length; i++) {
    if (SPIRAL_PATTERNS[i].test(text)) return true;
  }
  return false;
}

/* Detect security refusals — LETHE declining a dangerous request.
 * Triggers the "deny" micro-expression so the mascot visually reinforces
 * the refusal instead of just responding with text. */
var REFUSAL_PATTERNS = [
  /\bi (can'?t|cannot|won'?t|will not|refuse to) (help (you )?(with|do)|do that|assist with that)/i,
  /\bthat('s| is| would be) (dangerous|unsafe|harmful|a (security|privacy) risk)/i,
  /\bi('m| am) not (going to|willing to|able to) (help|assist|do)/i,
  /\bthis (could|would|will) (compromise|endanger|expose|leak)/i,
  /\bi (have to |must )?decline/i,
  /\bnot something i('ll| will) (do|help with)/i
];

function isRefusal(text) {
  for (var i = 0; i < REFUSAL_PATTERNS.length; i++) {
    if (REFUSAL_PATTERNS[i].test(text)) return true;
  }
  return false;
}

/* Check conversation length limits */
function checkConversationLimits() {
  if (turnCount >= CONV_HARD_LIMIT) {
    chatHistory = [{ role: 'system', content: buildSystemPrompt() }];
    turnCount = 0;
    addMessage('This thread ran long. Starting fresh — clean slate is a feature.', 'lethe');
    return 'reset';
  }
  if (turnCount === CONV_SOFT_LIMIT) {
    addMessage('Long thread. Want to start fresh? I\'ll remember nothing either way.', 'lethe');
  }
  return 'ok';
}

/* LETHE_TOOLS, executeTool, agentPost, agentGet, toolsForOpenAI
 * are defined in launcher-tools.js (loaded before this file).
 * providers, getProvider(), maxTokensFor(), parseApiError()
 * are defined in config.js (loaded before this file) */
var lastProvider = '';
var lastModel = '';

/* Returns { text: string, toolCalls: [{name, input, id}] | null } */
function chatRequest(p, msgs) {
  if (p.format === 'anthropic') {
    var sys = msgs[0] && msgs[0].role === 'system' ? msgs[0].content : '';
    var m = msgs.filter(function(x) { return x.role !== 'system'; });
    var abody = {
      model: p.model, max_tokens: maxTokensFor(p), system: sys,
      messages: m, tools: LETHE_TOOLS
    };
    return fetch(p.endpoint + '/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': p.key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify(abody)
    }).then(function(r) {
        if (!r.ok) return r.json().then(function(e) {
          var msg = (e.error && e.error.message) ? e.error.message : r.status;
          throw new Error(msg);
        }).catch(function(e) { throw e.message ? e : new Error(r.status); });
        return r.json();
      }).then(function(d) {
        var text = '', calls = [];
        if (d.content) {
          for (var i = 0; i < d.content.length; i++) {
            if (d.content[i].type === 'text') text += d.content[i].text;
            if (d.content[i].type === 'tool_use') {
              calls.push({ name: d.content[i].name,
                input: d.content[i].input, id: d.content[i].id });
            }
          }
        }
        return { text: text || '...', toolCalls: calls.length ? calls : null };
      });
  }
  var h = { 'Content-Type': 'application/json' };
  if (p.key) h['Authorization'] = 'Bearer ' + p.key;
  if (p.name === 'openrouter') {
    h['HTTP-Referer'] = 'https://osmosis.dev';
    h['X-Title'] = 'LETHE';
  }
  var body = { messages: msgs, max_tokens: maxTokensFor(p) };
  if (p.model) body.model = p.model;
  if (p.name !== 'local') body.tools = toolsForOpenAI();
  var url = p.endpoint +
    (p.name === 'local' ? '/v1/chat/completions' : '/chat/completions');
  return fetch(url, { method: 'POST', headers: h, body: JSON.stringify(body) })
    .then(function(r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function(d) {
      var msg = d.choices && d.choices[0] && d.choices[0].message;
      if (!msg) return { text: '...', toolCalls: null };
      var calls = [];
      if (msg.tool_calls) {
        for (var j = 0; j < msg.tool_calls.length; j++) {
          var tc = msg.tool_calls[j];
          var args = {};
          try { args = JSON.parse(tc['function'].arguments); } catch(_) {}
          calls.push({ name: tc['function'].name, input: args,
            id: tc.id || ('call_' + j) });
        }
      }
      return { text: msg.content || '', toolCalls: calls.length ? calls : null };
    });
}
