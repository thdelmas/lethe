/* LETHE Void Launcher — clock, mascot, chat, gestures.
 *
 * Works in two modes:
 *   FULL  — agent backend on localhost:8080. Chat works. Full experience.
 *   SHELL — no backend. Clock + mascot + gestures still work.
 *           Tapping mascot shows "thinking core offline".
 *
 * Java bridge (NativeLauncher) is injected by LetheActivity.java:
 *   NativeLauncher.openAppDrawer()
 *   NativeLauncher.expandNotifications()
 *   NativeLauncher.screenOff()
 *   NativeLauncher.openSettings()
 *   NativeSpeech.listen() / .isAvailable()
 */

/* ═══════════ DOM ═══════════ */
var home = document.getElementById('home');
var chatEl = document.getElementById('chat');
var homeMascot = document.getElementById('home-mascot');
var chatMascotImg = document.querySelector('.chat-mascot');
var transcript = document.getElementById('transcript');
var inputEl = document.getElementById('input');
var btnSend = document.getElementById('btn-send');
var btnMic = document.getElementById('btn-mic');
var statusEl = document.getElementById('status');
var hintEl = document.getElementById('hint');
var clockH = document.getElementById('clock-h');
var clockM = document.getElementById('clock-m');
var clockDate = document.getElementById('clock-date');

var DAYS = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
var MONTHS = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE',
              'JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];

/* ═══════════ CLOCK ═══════════ */
function updateClock() {
  var d = new Date();
  clockH.textContent = String(d.getHours()).padStart(2, '0');
  clockM.textContent = String(d.getMinutes()).padStart(2, '0');
  clockDate.textContent = DAYS[d.getDay()] + ' \u00b7 ' +
    d.getDate() + ' ' + MONTHS[d.getMonth()];
}
updateClock();
setInterval(updateClock, 10000);

/* ═══════════ VIEW STATE ═══════════ */
var viewState = 'home';

function openChat() {
  viewState = 'chat';
  chatEl.classList.add('open');
  home.classList.add('hidden');
  hintEl.classList.remove('visible');
  inputEl.focus();
  history.pushState({ view: 'chat' }, '');
  if (window.mascot3D) window.mascot3D.setChatVisible(true);
}

function closeChat() {
  viewState = 'home';
  chatEl.classList.remove('open');
  home.classList.remove('hidden');
  inputEl.blur();
  if (window.mascot3D) window.mascot3D.setChatVisible(false);
}

/* Tap mascot on home → open chat (if agent available) */
homeMascot.addEventListener('click', function() {
  homeMascot.classList.add('tap-react');
  setTimeout(function() { homeMascot.classList.remove('tap-react'); }, 300);
  setTimeout(function() {
    if (!agentAvailable) {
      showHomeNotice('thinking core offline');
      return;
    }
    openChat();
  }, 200);
});

/* Tap mini mascot in chat → go home */
chatMascotImg.addEventListener('click', closeChat);

/* Back button → go home */
window.addEventListener('popstate', function() {
  if (viewState === 'chat') closeChat();
});

/* Android back via Java bridge */
window.onBackPressed = function() {
  if (viewState === 'chat') { closeChat(); return true; }
  return false;
};

/* First-visit hint */
if (!localStorage.getItem('lethe_hint_seen')) {
  setTimeout(function() { hintEl.classList.add('visible'); }, 5000);
  homeMascot.addEventListener('click', function once() {
    hintEl.classList.remove('visible');
    localStorage.setItem('lethe_hint_seen', '1');
    homeMascot.removeEventListener('click', once);
  });
}

function showHomeNotice(text) {
  hintEl.textContent = text;
  hintEl.classList.add('visible');
  setTimeout(function() {
    hintEl.classList.remove('visible');
    hintEl.textContent = 'tap the guardian';
  }, 2500);
}

/* ═══════════ AGENT AVAILABILITY ═══════════ */
var agentAvailable = false;
var currentState = 'idle';

function checkAgent() {
  fetch('http://127.0.0.1:8080/v1/models', {
    method: 'GET',
    /* AbortSignal.timeout not in Chrome 69 */
  })
  .then(function(r) { agentAvailable = r.ok; })
  .catch(function() { agentAvailable = false; });
}
checkAgent();
setInterval(checkAgent, 30000);

function setState(s) { currentState = s; }

function showStatus(text) {
  statusEl.textContent = text;
  statusEl.classList.add('visible');
  clearTimeout(statusEl._t);
  statusEl._t = setTimeout(function() {
    statusEl.classList.remove('visible');
  }, 3000);
}

/* ═══════════ MESSAGES ═══════════ */
function escapeHtml(s) {
  var d = document.createElement('div');
  d.textContent = s; return d.innerHTML;
}

function addMessage(text, from) {
  var el = document.createElement('div');
  el.className = 'message from-' + from;
  el.innerHTML = '<div class="message-bubble">' + escapeHtml(text) + '</div>';
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
var SYSTEM_PROMPT =
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
var chatHistory = [{ role: 'system', content: SYSTEM_PROMPT }];

var providers = [
  { name: 'local', endpoint: 'http://127.0.0.1:8080', format: 'openai',
    needsKey: false, key: null, model: null },
  { name: 'anthropic', endpoint: 'https://api.anthropic.com', format: 'anthropic',
    needsKey: true, key: localStorage.getItem('lethe_key_anthropic'),
    model: 'claude-sonnet-4-6' },
  { name: 'openrouter', endpoint: 'https://openrouter.ai/api/v1', format: 'openai',
    needsKey: true, key: localStorage.getItem('lethe_key_openrouter'),
    model: 'anthropic/claude-sonnet-4-6' },
  { name: 'custom',
    endpoint: localStorage.getItem('lethe_custom_endpoint') || '',
    format: 'openai', needsKey: false,
    key: localStorage.getItem('lethe_key_custom'), model: null }
];

function getProvider() {
  for (var i = 0; i < providers.length; i++) {
    var p = providers[i];
    if (p.needsKey && !p.key) continue;
    if (!p.endpoint) continue;
    return p;
  }
  return null;
}

function chatRequest(p, msgs) {
  if (p.format === 'anthropic') {
    var sys = msgs[0] && msgs[0].role === 'system' ? msgs[0].content : '';
    var m = msgs.filter(function(x) { return x.role !== 'system'; });
    return fetch(p.endpoint + '/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': p.key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: p.model, max_tokens: 512, system: sys, messages: m
      })
    }).then(function(r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function(d) {
        return d.content && d.content[0] ? d.content[0].text : '...';
      });
  }
  var h = { 'Content-Type': 'application/json' };
  if (p.key) h['Authorization'] = 'Bearer ' + p.key;
  if (p.name === 'openrouter') {
    h['HTTP-Referer'] = 'https://osmosis.dev';
    h['X-Title'] = 'LETHE';
  }
  var body = { messages: msgs, max_tokens: 512 };
  if (p.model) body.model = p.model;
  var url = p.endpoint +
    (p.name === 'local' ? '/v1/chat/completions' : '/chat/completions');
  return fetch(url, { method: 'POST', headers: h, body: JSON.stringify(body) })
    .then(function(r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function(d) {
      return d.choices && d.choices[0] && d.choices[0].message
        ? d.choices[0].message.content : '...';
    });
}

/* ═══════════ SEND ═══════════ */
function send() {
  var text = inputEl.value.trim();
  if (!text) return;
  var p = getProvider();
  if (!p) {
    addMessage(text, 'user');
    addMessage('No thinking core. Connect a provider in Settings.', 'lethe');
    inputEl.value = ''; btnSend.disabled = true;
    return;
  }
  addMessage(text, 'user');
  chatHistory.push({ role: 'user', content: text });
  inputEl.value = ''; btnSend.disabled = true; autoResize();
  setState('thinking'); showTyping(); showStatus(p.name);

  chatRequest(p, chatHistory)
    .then(function(reply) {
      hideTyping(); setState('speaking');
      chatHistory.push({ role: 'assistant', content: reply });
      addMessage(reply, 'lethe'); setState('idle');
    })
    .catch(function() {
      hideTyping(); setState('alert');
      addMessage(p.name === 'local'
        ? 'My local core is not running.'
        : 'Lost contact with ' + p.name + '.', 'lethe');
      setTimeout(function() { setState('idle'); }, 3000);
    });
}

/* ═══════════ INPUT ═══════════ */
inputEl.addEventListener('input', function() {
  btnSend.disabled = !inputEl.value.trim(); autoResize();
});
inputEl.addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
});
btnSend.addEventListener('click', send);

function autoResize() {
  inputEl.style.height = 'auto';
  inputEl.style.height = Math.min(inputEl.scrollHeight, 100) + 'px';
}

if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', function() {
    document.body.style.height = window.visualViewport.height + 'px';
  });
}

/* ═══════════ VOICE ═══════════ */
var mediaRecorder = null, recording = false;
btnMic.addEventListener('click', function() {
  if (typeof NativeSpeech !== 'undefined' && NativeSpeech.isAvailable()) {
    setState('listening'); btnMic.classList.add('recording');
    NativeSpeech.listen(); return;
  }
  if (recording) { mediaRecorder.stop(); return; }
  if (!navigator.mediaDevices) { inputEl.focus(); return; }
  navigator.mediaDevices.getUserMedia({ audio: true }).then(function(stream) {
    mediaRecorder = new MediaRecorder(stream);
    var chunks = [];
    mediaRecorder.ondataavailable = function(e) { chunks.push(e.data); };
    mediaRecorder.onstart = function() {
      recording = true; btnMic.classList.add('recording');
      setState('listening');
    };
    mediaRecorder.onstop = function() {
      recording = false; btnMic.classList.remove('recording');
      stream.getTracks().forEach(function(t) { t.stop(); });
      var blob = new Blob(chunks, { type: 'audio/webm' });
      var form = new FormData();
      form.append('file', blob, 'voice.webm');
      form.append('model', 'whisper');
      fetch('http://127.0.0.1:8080/v1/audio/transcriptions',
        { method: 'POST', body: form })
        .then(function(r) { return r.json(); })
        .then(function(d) {
          if (d.text) {
            inputEl.value = d.text.trim();
            btnSend.disabled = false; autoResize();
          }
          setState('idle');
        })
        .catch(function() { showStatus('No transcription'); setState('idle'); });
    };
    mediaRecorder.start();
  }).catch(function() { inputEl.focus(); });
});

function onSpeechResult(text) {
  btnMic.classList.remove('recording');
  if (text && text !== 'cancelled') {
    inputEl.value = text; btnSend.disabled = false;
  }
  setState('idle');
}
function onSpeechError() {
  btnMic.classList.remove('recording'); setState('idle');
}

/* ═══════════ SSE ═══════════ */
if (location.protocol !== 'file:') {
  try {
    var sse = new EventSource('/api/agent/state');
    sse.onmessage = function(e) {
      try {
        var d = JSON.parse(e.data);
        if (d.state) setState(d.state);
        if (d.status) showStatus(d.status);
      } catch(_) {}
    };
    sse.onerror = function() { sse.close(); };
  } catch(_) {}
}

/* ═══════════════════════════════════════════
   LAUNCHER GESTURES — always work, no agent needed
   ═══════════════════════════════════════════ */
var touchStartY = 0, touchStartX = 0, touchStartTime = 0;

document.addEventListener('touchstart', function(e) {
  if (viewState !== 'home') return;
  touchStartY = e.touches[0].clientY;
  touchStartX = e.touches[0].clientX;
  touchStartTime = Date.now();
}, { passive: true });

document.addEventListener('touchend', function(e) {
  if (viewState !== 'home') return;
  var dy = touchStartY - e.changedTouches[0].clientY;
  var dx = touchStartX - e.changedTouches[0].clientX;
  var dt = Date.now() - touchStartTime;
  if (dt > 500) return;
  var threshold = 60;

  /* Swipe UP → app drawer */
  if (dy > threshold && Math.abs(dx) < threshold) {
    if (typeof NativeLauncher !== 'undefined') NativeLauncher.openAppDrawer();
  }
  /* Swipe DOWN → notification shade */
  if (dy < -threshold && Math.abs(dx) < threshold) {
    if (typeof NativeLauncher !== 'undefined') NativeLauncher.expandNotifications();
  }
}, { passive: true });

/* Double-tap → screen off (ignore mascot area) */
var lastTap = 0;
home.addEventListener('click', function(e) {
  if (homeMascot.contains(e.target)) return;
  var now = Date.now();
  if (now - lastTap < 300) {
    if (typeof NativeLauncher !== 'undefined') NativeLauncher.screenOff();
  }
  lastTap = now;
});
