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

function hideBurnerBanner() {
  var bb = document.getElementById('burner-banner');
  if (bb) bb.style.display = 'none';
}
function showBurnerBanner() {
  var bb = document.getElementById('burner-banner');
  if (bb && deviceState.burner_mode && !sessionStorage.getItem('lethe_burner_dismissed')) {
    bb.style.display = 'flex';
  }
}

function openChat() {
  viewState = 'chat';
  chatEl.classList.add('open');
  home.classList.add('hidden');
  hintEl.classList.remove('visible');
  hideBurnerBanner();
  history.pushState({ view: 'chat' }, '');
  if (window.mascot3D) window.mascot3D.setChatVisible(true);
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
  playRandomAnim('tap');
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

/* First-visit hints — sequential onboarding */
if (!localStorage.getItem('lethe_hint_seen')) {
  setTimeout(function() { hintEl.classList.add('visible'); }, 5000);
  homeMascot.addEventListener('click', function once() {
    hintEl.classList.remove('visible');
    localStorage.setItem('lethe_hint_seen', '1');
    homeMascot.removeEventListener('click', once);
    /* After guardian tap: show swipe-up hint for app drawer */
    if (!localStorage.getItem('lethe_swipe_hint_seen')) {
      setTimeout(function() {
        hintEl.textContent = 'swipe up for apps';
        hintEl.classList.add('visible');
        localStorage.setItem('lethe_swipe_hint_seen', '1');
        setTimeout(function() { hintEl.classList.remove('visible'); hintEl.textContent = 'tap the guardian'; }, 4000);
      }, 3000);
    }
  });
} else if (!localStorage.getItem('lethe_swipe_hint_seen')) {
  /* Returning user who tapped guardian but hasn't seen swipe hint yet */
  setTimeout(function() {
    hintEl.textContent = 'swipe up for apps';
    hintEl.classList.add('visible');
    localStorage.setItem('lethe_swipe_hint_seen', '1');
    setTimeout(function() { hintEl.classList.remove('visible'); hintEl.textContent = 'tap the guardian'; }, 4000);
  }, 5000);
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

document.getElementById('dev-close').addEventListener('click', function() {
  devPanel.style.display = 'none';
});

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

// Tier buttons
var tierBtns = devPanel.querySelectorAll('[data-tier]');
for (var i = 0; i < tierBtns.length; i++) {
  tierBtns[i].addEventListener('click', function() {
    localStorage.setItem('lethe_avatar_tier', this.getAttribute('data-tier'));
    location.reload();
  });
}

/* ═══════════ BURNER BANNER DISMISS ═══════════ */
var burnerDismissBtn = document.getElementById('burner-dismiss');
if (burnerDismissBtn) {
  burnerDismissBtn.addEventListener('click', function() {
    sessionStorage.setItem('lethe_burner_dismissed', '1');
    var banner = document.getElementById('burner-banner');
    if (banner) banner.style.display = 'none';
  });
}

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
