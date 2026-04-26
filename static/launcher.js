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
/* transcript, inputEl, btnSend, btnMic, statusEl defined in launcher-chat.js */
var hintEl = document.getElementById('hint');
var clockH = document.getElementById('clock-h');
var clockM = document.getElementById('clock-m');
var clockDate = document.getElementById('clock-date');
var chatClockH = document.getElementById('chat-clock-h');
var chatClockM = document.getElementById('chat-clock-m');

var DAYS = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
var MONTHS = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE',
              'JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];

/* ═══════════ CLOCK ═══════════ */
function updateClock() {
  var d = new Date();
  var h = String(d.getHours()).padStart(2, '0');
  var m = String(d.getMinutes()).padStart(2, '0');
  clockH.textContent = h;
  clockM.textContent = m;
  clockDate.textContent = DAYS[d.getDay()] + ' \u00b7 ' +
    d.getDate() + ' ' + MONTHS[d.getMonth()];
  if (chatClockH) chatClockH.textContent = h;
  if (chatClockM) chatClockM.textContent = m;
}
updateClock();
setInterval(updateClock, 10000);

/* ═══════════ VIEW STATE ═══════════ */
var viewState = 'home';

/* Burner banner moved to Android notification panel — stubs kept for callers */
function hideBurnerBanner() {}
function showBurnerBanner() {}

function openChat() {
  viewState = 'chat';
  chatEl.classList.add('open');
  home.classList.add('hidden');
  hintEl.classList.remove('visible');
  hideBurnerBanner();
  history.pushState({ view: 'chat' }, '');
  if (window.mascot3D) window.mascot3D.setChatVisible(true);
  /* Reset mascot to attentive idle — don't carry stale state into chat */
  setState('idle');
  /* Cancel any in-progress mood transition on 2D canvas */
  if (typeof moodTransition !== 'undefined') moodTransition = null;
  /* Show native input bar (Android EditText) */
  if (typeof NativeLauncher !== 'undefined' && NativeLauncher.showInputBar) {
    NativeLauncher.showInputBar();
  }
  /* Show welcome on first open */
  if (transcript.children.length === 0) {
    var p = getProvider();
    if (!p || (p.name === 'local' && !agentAvailable)) {
      addMessage('I need a thinking core to talk.', 'lethe');
      addMessage('Tap the gear icon above, or type /settings to set up a provider.', 'lethe');
    } else {
      addMessage('What do you need?', 'lethe');
    }
  }
}

function closeChat() {
  viewState = 'home';
  /* Hide native input bar */
  if (typeof NativeLauncher !== 'undefined' && NativeLauncher.hideInputBar) {
    NativeLauncher.hideInputBar();
  }
  chatEl.classList.remove('open');
  home.classList.remove('hidden');
  inputEl.blur();
  showBurnerBanner();
  if (window.mascot3D) window.mascot3D.setChatVisible(false);
  /* Return mascot to calm idle on home screen */
  setState('idle');
  /* Restore focus to mascot for keyboard navigation */
  homeMascot.focus();
}

/* ═══════════ TOUCH RIPPLE ═══════════ */
function spawnRipple(x, y) {
  var r = document.createElement('div');
  r.className = 'touch-ripple';
  r.style.left = x + 'px';
  r.style.top = y + 'px';
  document.body.appendChild(r);
  setTimeout(function() { r.remove(); }, 800);
}

/* ═══════════ MASCOT TOUCH ═══════════ */
var tapTimer = null;
var pressStart = 0;
var glowTimer = null;

homeMascot.addEventListener('touchstart', function(e) {
  pressStart = Date.now();
  lastInteraction = Date.now();

  // Wake from sleep on any touch
  if (boredomState === 'asleep' || boredomState === 'sleepy') {
    setBoredom('calm');
    setState('idle');
    if (canvas2d && !letheAnimPlaying) {
      playRandomAnim('wake');
    }
  }

  // Yellow glow after 400ms hold
  glowTimer = setTimeout(function() {
    if (canvas2d) canvas2d.classList.add('glow-yellow');
  }, 400);
}, { passive: true });

homeMascot.addEventListener('touchend', function(e) {
  var held = Date.now() - pressStart;
  if (glowTimer) { clearTimeout(glowTimer); glowTimer = null; }
  if (canvas2d) canvas2d.classList.remove('glow-yellow');

  // Spawn teal ripple at touch point
  var touch = e.changedTouches[0];
  if (touch) spawnRipple(touch.clientX, touch.clientY);

  if (held > 500) {
    playRandomAnim('tap');
  } else {
    openChat();
  }
  e.preventDefault();
}, { passive: false });

/* Fallback for non-touch (desktop testing) */
homeMascot.addEventListener('click', function(e) {
  lastInteraction = Date.now();
  spawnRipple(e.clientX, e.clientY);
  /* Touch devices use touchend — this only fires on mouse click.
     Match touch behavior: short click opens chat. */
  if (!hasTouchInput) openChat();
});

/* Tap mini mascot in chat → go home */
chatMascotImg.addEventListener('click', closeChat);

/* Swipe down on chat header → close chat */
var chatHeader = document.querySelector('.chat-header');
var swipeStartY = 0;
var swipeStartTime = 0;
chatHeader.addEventListener('touchstart', function(e) {
  swipeStartY = e.touches[0].clientY;
  swipeStartTime = Date.now();
}, { passive: true });
chatHeader.addEventListener('touchend', function(e) {
  var dy = e.changedTouches[0].clientY - swipeStartY;
  var dt = Date.now() - swipeStartTime;
  /* Swipe down: >50px distance, <400ms, downward direction */
  if (dy > 50 && dt < 400) {
    closeChat();
  }
});

/* Back button → go home */
window.addEventListener('popstate', function() {
  if (viewState === 'chat') closeChat();
  else if (viewState === 'drawer' && typeof closeDrawer === 'function') closeDrawer();
});

/* Android back via Java bridge */
window.onBackPressed = function() {
  if (viewState === 'chat') { closeChat(); return true; }
  if (viewState === 'drawer' && typeof closeDrawer === 'function') { closeDrawer(); return true; }
  return false;
};

/* Detect primary input: touch vs keyboard/mouse */
var hasTouchInput = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
var defaultHintText = hasTouchInput ? 'tap the guardian' : 'press Enter on the guardian';
hintEl.textContent = defaultHintText;

/* Show/hide hint with proper screen reader semantics */
function showHint(text) {
  hintEl.textContent = text || defaultHintText;
  hintEl.classList.add('visible');
  hintEl.removeAttribute('aria-hidden');
}
function hideHint() {
  hintEl.classList.remove('visible');
  /* Wait for CSS fade-out to complete before hiding from SR */
  setTimeout(function() {
    if (!hintEl.classList.contains('visible')) {
      hintEl.setAttribute('aria-hidden', 'true');
    }
  }, 2100); /* matches 2s opacity transition in CSS + buffer */
}

/* First-visit hints — sequential onboarding */
if (!localStorage.getItem('lethe_hint_seen')) {
  setTimeout(function() { showHint(); }, 5000);
  homeMascot.addEventListener('click', function once() {
    hideHint();
    localStorage.setItem('lethe_hint_seen', '1');
    homeMascot.removeEventListener('click', once);
    /* After guardian interaction: show navigation hint */
    if (!localStorage.getItem('lethe_swipe_hint_seen')) {
      setTimeout(function() {
        var navHint = hasTouchInput ? 'swipe up for apps' : 'press Escape to go back';
        showHint(navHint);
        localStorage.setItem('lethe_swipe_hint_seen', '1');
        setTimeout(function() { hideHint(); }, 4000);
      }, 3000);
    }
  });
} else if (!localStorage.getItem('lethe_swipe_hint_seen')) {
  setTimeout(function() {
    var navHint = hasTouchInput ? 'swipe up for apps' : 'press Escape to go back';
    showHint(navHint);
    localStorage.setItem('lethe_swipe_hint_seen', '1');
    setTimeout(function() { hideHint(); }, 4000);
  }, 5000);
}

function showHomeNotice(text) {
  showHint(text);
  setTimeout(function() { hideHint(); }, 2500);
}

/* ═══════════ AGENT AVAILABILITY ═══════════ */
var agentAvailable = false;

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

/* Detect native input bar — hide WebView input area */
if (typeof NativeLauncher !== 'undefined' && NativeLauncher.showInputBar) {
  document.body.setAttribute('data-native-input', '');
}

/* State is driven through the emotion engine (mascot-emotion.js).
 * Falls back to simple global if emotion engine hasn't loaded yet. */
function setState(s) {
  if (window.letheEmotion) {
    window.letheEmotion.setState(s);
  } else {
    window.currentState = s;
    if (window.mascot3D && window.mascot3D.playState) {
      window.mascot3D.playState(s);
    }
  }
}
var currentState = 'idle';

function showStatus(text) {
  statusEl.textContent = text;
  statusEl.classList.add('visible');
  clearTimeout(statusEl._t);
  statusEl._t = setTimeout(function() {
    statusEl.classList.remove('visible');
  }, 3000);
}

/* ═══════════ DEV PANEL ═══════════ */
var devPanel = document.getElementById('dev-panel');
var devClockTimer = null;

// Long-press clock (2s) to open — works with both touch and mouse
var clockEl = document.querySelector('.clock');
function devOpen() {
  devPanel.style.display = 'block';
  updateDevInfo();
  /* Focus first interactive element inside the panel */
  var first = devPanel.querySelector('button, select, input');
  if (first) first.focus();
}
// Triple-tap clock to open dev panel
var devTapCount = 0;
var devTapTimer = null;
clockEl.addEventListener('click', function() {
  devTapCount++;
  if (devTapTimer) clearTimeout(devTapTimer);
  if (devTapCount >= 3) {
    devTapCount = 0;
    devOpen();
  } else {
    devTapTimer = setTimeout(function() { devTapCount = 0; }, 600);
  }
});
// Also keep long-press for desktop testing
var devTouchStart = null;
clockEl.addEventListener('touchstart', function(e) {
  devTouchStart = e.touches[0] ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
  devClockTimer = setTimeout(devOpen, 1500);
}, { passive: true });
clockEl.addEventListener('touchend', function() {
  if (devClockTimer) { clearTimeout(devClockTimer); devClockTimer = null; }
});
clockEl.addEventListener('touchmove', function(e) {
  if (devClockTimer && devTouchStart && e.touches[0]) {
    var dx = e.touches[0].clientX - devTouchStart.x;
    var dy = e.touches[0].clientY - devTouchStart.y;
    if (dx*dx + dy*dy > 400) { clearTimeout(devClockTimer); devClockTimer = null; }
  }
});
clockEl.addEventListener('mousedown', function() {
  devClockTimer = setTimeout(devOpen, 2000);
});
clockEl.addEventListener('mouseup', function() {
  if (devClockTimer) { clearTimeout(devClockTimer); devClockTimer = null; }
});

function devClose() {
  devPanel.style.display = 'none';
  /* Return focus to the element that opened the panel */
  clockEl.focus();
}

document.getElementById('dev-close').addEventListener('click', devClose);

/* Escape key closes any open panel (innermost first) */
document.addEventListener('keydown', function(e) {
  if (e.key !== 'Escape') return;
  var sp = document.getElementById('settings-panel');
  if (sp && !sp.classList.contains('hidden')) {
    if (typeof settingsClose === 'function') settingsClose();
    return;
  }
  if (devPanel.style.display !== 'none') { devClose(); return; }
  if (aiInfoPanel && aiInfoPanel.style.display !== 'none') {
    aiInfoPanel.style.display = 'none'; return;
  }
  if (viewState === 'drawer' && typeof closeDrawer === 'function') { closeDrawer(); return; }
  if (viewState === 'chat') closeChat();
});

/* Focus trap: keep Tab inside dev panel while it's open */
devPanel.addEventListener('keydown', function(e) {
  if (e.key !== 'Tab') return;
  var focusable = devPanel.querySelectorAll('button, select, input, [tabindex]:not([tabindex="-1"])');
  if (!focusable.length) return;
  var first = focusable[0];
  var last = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault(); last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault(); first.focus();
  }
});

// Animation definitions for dev panel + sprite player speed lookup
var letheAnimations = [
  { name: 'idle',     speed: 200 },
  { name: 'warmup',   speed: 100 },
  { name: 'thinking', speed: 100 },
  { name: 'listening',speed: 100 },
  { name: 'speaking', speed: 100 },
  { name: 'nod',      speed: 80 },
  { name: 'deny',     speed: 80 },
  { name: 'wave',     speed: 100 },
  { name: 'alert',    speed: 60 },
  { name: 'confirm',  speed: 80 },
  { name: 'sleep',    speed: 200 },
  { name: 'wake',     speed: 100 }
];

// Animation selector
document.getElementById('dev-anim').addEventListener('change', function() {
  var name = this.value;
  var isIdle = (name === 'idle');
  var found = letheAnimations.filter(function(a) { return a.name === name; })[0];
  var spd = found ? found.speed : 100;
  SpritePlayer.play(name, { speed: spd, loop: isIdle });
  letheAnimPlaying = !isIdle;
  if (window.mascot3D && window.mascot3D.playByName) {
    window.mascot3D.playByName(name);
  }
});

// Speed slider
document.getElementById('dev-speed').addEventListener('input', function() {
  document.getElementById('dev-speed-val').textContent = this.value + 'x';
  if (window.mascot3D && window.mascot3D.setSpeed) {
    window.mascot3D.setSpeed(parseFloat(this.value));
  }
});

// Rotation slider
document.getElementById('dev-rot').addEventListener('input', function() {
  document.getElementById('dev-rot-val').textContent = this.value + '\u00b0';
  if (window.mascot3D && window.mascot3D.setRotation) {
    window.mascot3D.setRotation(parseFloat(this.value));
  }
});

// Mood selector — triggers glitch + color fade transition
document.getElementById('dev-mood').addEventListener('change', function() {
  letheSetMood(this.value);
});

// Tier buttons — highlight current tier
var tierBtns = devPanel.querySelectorAll('[data-tier]');
for (var i = 0; i < tierBtns.length; i++) {
  if (tierBtns[i].getAttribute('data-tier') === window.letheTier) {
    tierBtns[i].style.borderColor = 'var(--accent)';
    tierBtns[i].style.color = '#fff';
    tierBtns[i].setAttribute('aria-pressed', 'true');
  }
  tierBtns[i].addEventListener('click', function() {
    localStorage.setItem('lethe_avatar_tier', this.getAttribute('data-tier'));
    location.reload();
  });
}

/* Burner banner dismiss removed — notification panel handles this natively */

/* ═══════════ HELP & FEEDBACK ═══════════ */
document.getElementById('btn-report-issue').addEventListener('click', function() {
  var tier = window.letheTier || 'unknown';
  var agent = agentAvailable ? 'online' : 'offline';
  var gpu = (window.letheTierConfig ? window.letheTierConfig.gpu : 'unknown');
  var webgl = !!document.createElement('canvas').getContext('webgl');
  var body = [
    '## Description',
    '',
    '<!-- Describe what happened and what you expected -->',
    '',
    '## Device info',
    '',
    '| Key | Value |',
    '|-----|-------|',
    '| Tier | ' + tier + ' |',
    '| GPU | ' + gpu + ' |',
    '| WebGL | ' + webgl + ' |',
    '| Agent | ' + agent + ' |',
    '| User-Agent | ' + navigator.userAgent + ' |',
    '| Screen | ' + screen.width + 'x' + screen.height + ' |'
  ].join('\n');
  var url = 'https://github.com/thdelmas/OSmosis/issues/new'
    + '?labels=bug,lethe'
    + '&title=' + encodeURIComponent('[LETHE] ')
    + '&body=' + encodeURIComponent(body);
  window.open(url, '_blank');
});

document.getElementById('btn-discord').addEventListener('click', function() {
  window.open('https://discord.gg/tAqyY47Szp', '_blank');
});

document.getElementById('btn-settings').addEventListener('click', function() {
  devPanel.style.display = 'none';
  if (typeof settingsOpen === 'function') settingsOpen();
});

/* Chat info button — AI transparency panel (EU AI Act Art. 4) */
var chatInfoBtn = document.getElementById('chat-info-btn');
var aiInfoPanel = document.getElementById('ai-info-panel');
if (chatInfoBtn && aiInfoPanel) {
  chatInfoBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    aiInfoPanel.style.display = 'block';
  });
  document.getElementById('ai-info-close').addEventListener('click', function() {
    aiInfoPanel.style.display = 'none';
  });
}

/* Chat settings button — opens provider settings directly */
var chatSettingsBtn = document.getElementById('chat-settings-btn');
if (chatSettingsBtn) {
  chatSettingsBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    console.log('LETHE: gear icon clicked');
    if (typeof settingsOpen === 'function') {
      settingsOpen();
    } else {
      console.log('LETHE: settingsOpen not defined');
    }
  });
}

function updateDevInfo() {
  var info = document.getElementById('dev-info');
  var tierInfo = document.getElementById('dev-tier-info');
  tierInfo.textContent = window.letheTier || '?';
  var lines = [
    'GPU: ' + (window.letheTierConfig ? window.letheTierConfig.gpu : '?'),
    'Tier: ' + (window.letheTier || '?'),
    'Agent: ' + (agentAvailable ? 'online' : 'offline'),
    'Boredom: ' + boredomState,
    'Anims: ' + (letheAnimations ? letheAnimations.length : 0),
    'WebGL: ' + (!!document.createElement('canvas').getContext('webgl'))
  ];
  info.textContent = lines.join('\n');
}
