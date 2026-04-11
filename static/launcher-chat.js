/* ═══════════ MESSAGES ═══════════ */
function escapeHtml(s) {
  var d = document.createElement('div');
  d.textContent = s; return d.innerHTML;
}

function addMessage(text, from, meta) {
  var el = document.createElement('div');
  el.className = 'message from-' + from;
  if (from === 'lethe') {
    el.setAttribute('data-ai-generated', 'true');
    var p = (meta && meta.provider) ? meta.provider : lastProvider || '';
    var m = (meta && meta.model) ? meta.model : '';
    if (p) el.setAttribute('data-provider', p);
    if (m) el.setAttribute('data-model', m);
    var badge = '<span class="ai-badge">AI</span>';
    var provLabel = p ? '<span class="ai-provider">' + escapeHtml(p) +
      (m ? ' / ' + escapeHtml(m) : '') + '</span>' : '';
    el.innerHTML = '<div class="message-bubble">' + escapeHtml(text) + '</div>' +
      '<div class="ai-label">' + badge + provLabel + '</div>';
  } else {
    el.innerHTML = '<div class="message-bubble">' + escapeHtml(text) + '</div>';
  }
  transcript.appendChild(el);
  transcript.scrollTop = transcript.scrollHeight;
}

function showTyping() {
  var el = document.createElement('div');
  el.className = 'message from-lethe'; el.id = 'typing';
  el.innerHTML = '<div class="typing-indicator">' +
    '<span></span><span></span><span></span></div>';
  transcript.appendChild(el);
  transcript.scrollTop = transcript.scrollHeight;
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
  "You are always LETHE, always the system. One device, one user, one scope.";

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
  /* Battery → mascot mood */
  if (deviceState.battery !== undefined && window.letheEmotion) {
    if (deviceState.battery <= 10) {
      letheSetMood('yellow');
      window.letheEmotion.setExpression('concerned');
    } else if (deviceState.battery <= 15) {
      window.letheEmotion.setExpression('concerned');
    }
  }
  /* Burner mode banner — show when active, dismissable per session */
  var burnerBanner = document.getElementById('burner-banner');
  if (burnerBanner && deviceState.burner_mode !== undefined) {
    var dismissed = sessionStorage.getItem('lethe_burner_dismissed');
    burnerBanner.style.display = (deviceState.burner_mode && !dismissed) ? 'flex' : 'none';
  }
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

/* ═══════════ TOOL CALLING ═══════════ */
var LETHE_TOOLS = [
  { name: 'open_app_drawer', description: 'Open the app drawer to show installed apps',
    input_schema: { type: 'object', properties: {} } },
  { name: 'expand_notifications', description: 'Pull down the notification shade',
    input_schema: { type: 'object', properties: {} } },
  { name: 'screen_off', description: 'Turn off the screen and lock the device',
    input_schema: { type: 'object', properties: {} } },
  { name: 'open_settings', description: 'Open Android system settings',
    input_schema: { type: 'object', properties: {} } },
  { name: 'set_timer', description: 'Set a countdown timer',
    input_schema: { type: 'object', properties: {
      seconds: { type: 'integer', description: 'Timer duration in seconds' },
      label: { type: 'string', description: 'Optional timer label' }
    }, required: ['seconds'] } },
  { name: 'set_alarm', description: 'Set an alarm',
    input_schema: { type: 'object', properties: {
      hour: { type: 'integer', description: 'Hour (0-23)' },
      minute: { type: 'integer', description: 'Minute (0-59)' },
      label: { type: 'string', description: 'Optional alarm label' }
    }, required: ['hour', 'minute'] } },
  { name: 'toggle_flashlight', description: 'Toggle the flashlight on or off',
    input_schema: { type: 'object', properties: {} } },
  { name: 'open_app', description: 'Launch an app by package name or common name',
    input_schema: { type: 'object', properties: {
      app: { type: 'string', description: 'App package name or common name (e.g. "camera", "browser")' }
    }, required: ['app'] } },
  { name: 'get_privacy_status', description: 'Get current privacy and security status: Tor state, trackers blocked, connectivity, burner mode, dead man\'s switch',
    input_schema: { type: 'object', properties: {} } }
];

/* Convert tool definitions for OpenAI-compatible APIs */
function toolsForOpenAI() {
  return LETHE_TOOLS.map(function(t) {
    return { type: 'function', 'function': {
      name: t.name, description: t.description,
      parameters: t.input_schema
    }};
  });
}

function executeTool(name, input) {
  var nl = (typeof NativeLauncher !== 'undefined') ? NativeLauncher : null;
  if (!nl) return 'Action unavailable — no system bridge on this device.';
  switch (name) {
    case 'open_app_drawer': nl.openAppDrawer(); return 'App drawer opened.';
    case 'expand_notifications': nl.expandNotifications(); return 'Notifications expanded.';
    case 'screen_off': nl.screenOff(); return 'Screen turned off.';
    case 'open_settings': nl.openSettings(); return 'Settings opened.';
    case 'set_timer':
    case 'set_alarm':
    case 'toggle_flashlight':
    case 'open_app':
      if (nl.executeAction) {
        nl.executeAction(name, JSON.stringify(input || {}));
        return name.replace(/_/g, ' ') + ' done.';
      }
      return 'This action requires a newer system build.';
    case 'get_privacy_status':
      var s = deviceState || {};
      return JSON.stringify({
        tor: s.tor !== undefined ? (s.tor ? 'active' : 'offline') : 'unknown',
        trackers_blocked: s.trackers_blocked !== undefined ? s.trackers_blocked : 'unknown',
        connectivity: s.connectivity || 'unknown',
        burner_mode: s.burner_mode !== undefined ? (s.burner_mode ? 'ON' : 'off') : 'unknown',
        dead_mans_switch: s.dead_mans_switch !== undefined ? (s.dead_mans_switch ? 'ON' : 'off') : 'unknown',
        battery: s.battery !== undefined ? s.battery + '%' : 'unknown'
      });
    default: return 'Unknown action: ' + name;
  }
}

/* providers, getProvider(), maxTokensFor(), parseApiError()
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
