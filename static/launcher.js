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

/* ═══════════ 2D VIDEO ANIMATION (CANVAS CROSSFADE) ═══════════ */
var canvas2d = document.getElementById('mascot-canvas-2d');
var ctx2d = canvas2d ? canvas2d.getContext('2d') : null;
var vidA = document.getElementById('vid-a');
var vidB = document.getElementById('vid-b');
var activeVid = vidA;   // currently drawing to canvas
var nextVid = vidB;     // preloading next video
// Context-aware animation pools — no LLM needed
// All green to match default mood; mood system handles color shifts separately
// speed: playbackRate (1 = normal, <1 = slower)
var animByContext = {
  calm:      [{src: 'mascot-waving-green.webm'}, {src: 'mascot-walk-green.webm'}],
  fidgeting: [{src: 'mascot-walk-green.webm'}, {src: 'mascot-run-green.webm', speed: 0.6}],
  sleepy:    [{src: 'mascot-idle-green.webm'}],
  replied:   [{src: 'mascot-waving-green.webm'}, {src: 'mascot-walk-green.webm'}],
  tap:       [{src: 'mascot-waving-green.webm'}, {src: 'mascot-walk-green.webm'}, {src: 'mascot-run-green.webm', speed: 0.6}],
  wake:      [{src: 'mascot-warm_up-green.webm'}]
};
var letheAnimPlaying = false;
var idleLoopTimer = null;
var lastInteraction = Date.now();
var boredomState = 'calm';
var currentMood = 'green';
var crossfading = false;
var crossfadeAlpha = 0;   // 0 = show active, 1 = show next
var crossfadeDuration = 200; // ms — smooth blend, masks arm position differences
var crossfadeStart = 0;
var pendingAnim = null;
var nextReady = false;

// Canvas size
if (canvas2d) {
  canvas2d.width = 480;
  canvas2d.height = 480;
}

// Draw loop — always running, draws active video (and crossfade if transitioning)
function drawLoop() {
  requestAnimationFrame(drawLoop);
  if (!ctx2d) return;

  if (crossfading) {
    var elapsed = Date.now() - crossfadeStart;
    crossfadeAlpha = Math.min(elapsed / crossfadeDuration, 1);

    // Quick crossfade — too fast for the eye to see ghosting
    ctx2d.globalAlpha = 1 - crossfadeAlpha;
    if (activeVid.readyState >= 2) {
      ctx2d.drawImage(activeVid, 0, 0, canvas2d.width, canvas2d.height);
    }
    ctx2d.globalAlpha = crossfadeAlpha;
    if (nextVid.readyState >= 2) {
      ctx2d.drawImage(nextVid, 0, 0, canvas2d.width, canvas2d.height);
    }
    ctx2d.globalAlpha = 1;

    if (crossfadeAlpha >= 1) {
      crossfading = false;
      activeVid.pause();
      var tmp = activeVid;
      activeVid = nextVid;
      nextVid = tmp;
    }
  } else {
    if (activeVid.readyState >= 2) {
      ctx2d.drawImage(activeVid, 0, 0, canvas2d.width, canvas2d.height);
    }
  }

  // Mood transition post-processing (glitch + color fade)
  if (moodTransition) applyMoodTransition();

  // Check: should we trigger the swap?
  // No neutral frame sync needed — crossfade handles the blend
  if (pendingAnim && !letheAnimPlaying && !crossfading && nextReady) {
    startCrossfade();
  }
}

function startCrossfade() {
  pendingAnim = null;
  nextReady = false;
  letheAnimPlaying = true;
  nextVid.play();
  crossfading = true;
  crossfadeAlpha = 0;
  crossfadeStart = Date.now();

  // When animation ends → crossfade back to idle
  nextVid.onended = function() {
    nextVid.onended = null;
    // Preload idle on the other video
    var idleVid = nextVid === vidA ? vidB : vidA;
    // Wait — after crossfade, activeVid will be the animation video
    // We need to load idle on the OTHER one
    setTimeout(function() {
      // Now activeVid = animation (just finished), nextVid = old idle (paused)
      nextVid.src = 'mascot-idle-green.webm';
      nextVid.loop = true;
      nextVid.load();
      console.log('LETHE anim: preloading idle return');
      function onIdleReady() {
        nextVid.oncanplay = null;
        nextVid.onloadeddata = null;
        nextVid.play();
        crossfading = true;
        crossfadeAlpha = 0;
        crossfadeStart = Date.now();
        // After this crossfade, letheAnimPlaying = false
        var checkDone = setInterval(function() {
          if (!crossfading) {
            clearInterval(checkDone);
            letheAnimPlaying = false;
          }
        }, 50);
      }
      nextVid.oncanplay = onIdleReady;
      nextVid.onloadeddata = onIdleReady;
    }, 50);
  };
}

// Init: play idle on active video
if (vidA && canvas2d) {
  activeVid.src = 'mascot-idle-green.webm';
  activeVid.loop = true;
  var p = activeVid.play();
  if (p) p.catch(function() {
    document.addEventListener('touchstart', function f() {
      activeVid.play(); document.removeEventListener('touchstart', f);
    }, { once: true });
  });
  drawLoop();
}

function playVideoAnim(src, speed) {
  if (!vidA || letheAnimPlaying || crossfading || pendingAnim) return;
  pendingAnim = src;
  nextReady = false;

  // Preload animation on next video
  nextVid.src = src;
  nextVid.loop = false;
  nextVid.playbackRate = speed || 1;
  nextVid.load();
  console.log('LETHE anim: preloading ' + src);
  function onReady() {
    nextVid.oncanplay = null;
    nextVid.onloadeddata = null;
    if (nextReady) return; // avoid double-fire
    nextVid.pause();
    nextVid.currentTime = 0;
    nextReady = true;
    console.log('LETHE anim: ready ' + src);
  }
  nextVid.oncanplay = onReady;
  nextVid.onloadeddata = onReady; // fallback for older WebViews
}

function pickAnim(context) {
  var pool = animByContext[context] || animByContext.calm;
  return pool[Math.floor(Math.random() * pool.length)];
}

function playRandomAnim(context) {
  if (!vidA || letheAnimPlaying) return;
  var anim = pickAnim(context || boredomState);
  playVideoAnim(anim.src, anim.speed);
}

function setBoredom(state) {
  if (!vidA || boredomState === state) return;
  boredomState = state;
}

function checkBoredom() {
  if (letheAnimPlaying || viewState !== 'home') return;
  var idle = Date.now() - lastInteraction;
  if (idle > 600000) { setBoredom('asleep'); }
  else if (idle > 300000) { setBoredom('sleepy'); }
  else if (idle > 120000) { setBoredom('fidgeting'); }
  else { setBoredom('calm'); }
}

setInterval(checkBoredom, 10000);

function scheduleIdleLoop() {
  if (idleLoopTimer) clearTimeout(idleLoopTimer);
  var wait = 45000 + Math.random() * 45000;
  console.log('LETHE idle: next reaction in ' + Math.round(wait/1000) + 's');
  idleLoopTimer = setTimeout(function() {
    if (viewState !== 'home' || letheAnimPlaying) {
      scheduleIdleLoop(); return;
    }
    playRandomAnim();
    var ci = setInterval(function() {
      if (!letheAnimPlaying) { clearInterval(ci); scheduleIdleLoop(); }
    }, 1000);
  }, wait);
}

if (vidA) scheduleIdleLoop();

function letheSetAnim(name) { playVideoAnim('mascot-' + name + '.webm'); }

/* ═══════════ MOOD TRANSITION (GLITCH + COLOR FADE) ═══════════ */
var moodTransition = null; // { phase, start, fromMood, toMood }
var MOOD_PHASE_MS = 80;    // each phase duration (out + hold + in, symmetric)
var MOOD_HOLD_MS = 30;     // hold at full glitch after swap

function letheSetMood(mood) {
  if (mood === currentMood || moodTransition) return;
  moodTransition = {
    phase: 'out',        // 'out' = glitch+desat, 'swap' = switch video, 'in' = resat+unglitch
    start: Date.now(),
    fromMood: currentMood,
    toMood: mood
  };
  console.log('LETHE mood: ' + currentMood + ' → ' + mood);
}

// Combined glitch + desaturate in a single getImageData pass (perf: one read/write)
function applyGlitchDesat(ctx, w, h, glitchIntensity, desatAmount) {
  if (glitchIntensity < 0.05 && desatAmount < 0.05) return;
  var imgData = ctx.getImageData(0, 0, w, h);
  var data = imgData.data;
  var shift = Math.floor(glitchIntensity * 12 + Math.random() * 6);
  var shift2 = Math.floor(glitchIntensity * 8 + Math.random() * 4);

  for (var y = 0; y < h; y++) {
    var doGlitch = glitchIntensity > 0.05 && Math.random() < 0.35 * glitchIntensity;
    var isScanline = (y & 3) === 0 && glitchIntensity > 0.05;
    var dim = isScanline ? (1 - glitchIntensity * 0.3) : 1;

    for (var x = 0; x < w; x++) {
      var i = (y * w + x) * 4;
      var r = data[i], g = data[i+1], b = data[i+2];

      // RGB channel shift on glitch lines
      if (doGlitch) {
        r = data[(y * w + Math.min(x + shift, w - 1)) * 4];
        b = data[(y * w + Math.max(x - shift2, 0)) * 4 + 2];
      }

      // Scanline dimming
      if (isScanline) { r *= dim; g *= dim; b *= dim; }

      // Desaturate
      if (desatAmount > 0.05) {
        var gray = r * 0.3 + g * 0.59 + b * 0.11;
        r = r + (gray - r) * desatAmount;
        g = g + (gray - g) * desatAmount;
        b = b + (gray - b) * desatAmount;
      }

      data[i] = r; data[i+1] = g; data[i+2] = b;
    }
  }
  ctx.putImageData(imgData, 0, 0);
}

// Called after each frame draw in drawLoop
function applyMoodTransition() {
  if (!moodTransition) return;
  var elapsed = Date.now() - moodTransition.start;

  if (moodTransition.phase === 'out') {
    // Phase 1: glitch in + desaturate to full grey (0 → 1)
    var t = Math.min(elapsed / MOOD_PHASE_MS, 1);
    var e = t * t;
    applyGlitchDesat(ctx2d, canvas2d.width, canvas2d.height, e, e);
    if (t >= 1) {
      // Preload new mood on the OTHER video element
      moodTransition.phase = 'swap';
      currentMood = moodTransition.toMood;
      var newSrc = 'mascot-idle-' + currentMood + '.webm';
      nextVid.src = newSrc;
      nextVid.loop = true;
      nextVid.load();
      console.log('LETHE mood: preloading ' + newSrc);
      var swapDone = false;
      function onSwapReady() {
        if (swapDone) return;
        swapDone = true;
        nextVid.oncanplay = null;
        nextVid.onloadeddata = null;
        // Sync to same relative time as old video for seamless pose
        nextVid.currentTime = activeVid.currentTime % (nextVid.duration || 4);
        nextVid.play();
        // Swap roles
        activeVid.pause();
        var tmp = activeVid;
        activeVid = nextVid;
        nextVid = tmp;
        // Hold full glitch briefly so new color is hidden
        moodTransition.phase = 'hold';
        moodTransition.start = Date.now();
      }
      nextVid.oncanplay = onSwapReady;
      nextVid.onloadeddata = onSwapReady;
    }
  } else if (moodTransition.phase === 'swap') {
    // Waiting for video load — full glitch on OLD video
    applyGlitchDesat(ctx2d, canvas2d.width, canvas2d.height, 1, 1);
  } else if (moodTransition.phase === 'hold') {
    // Brief hold at full glitch on NEW video (hides color)
    applyGlitchDesat(ctx2d, canvas2d.width, canvas2d.height, 1, 1);
    if (elapsed >= MOOD_HOLD_MS) {
      moodTransition.phase = 'in';
      moodTransition.start = Date.now();
    }
  } else if (moodTransition.phase === 'in') {
    // Phase 3: glitch out + resaturate (1 → 0), mirrors phase 1
    var t2 = Math.min(elapsed / MOOD_PHASE_MS, 1);
    var e2 = 1 - (1 - t2) * (1 - t2);
    var inv = 1 - e2;
    applyGlitchDesat(ctx2d, canvas2d.width, canvas2d.height, inv, inv);
    if (t2 >= 1) {
      moodTransition = null;
    }
  }
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

/* ═══════════ SEND ═══════════ */
/* Called from native Android EditText via evaluateJavascript */
function nativeSend(text) {
  if (!text) return;
  inputEl.value = text;
  send();
}

function send() {
  var text = inputEl.value.trim();
  if (!text) return;

  /* Slash commands */
  if (text.charAt(0) === '/') {
    var cmd = text.toLowerCase().split(' ')[0];
    inputEl.value = ''; autoResize();
    switch (cmd) {
      case '/settings':
        addMessage(text, 'user');
        if (typeof settingsOpen === 'function') settingsOpen();
        return;
      case '/help':
        addMessage(text, 'user');
        addMessage('Available commands:', 'lethe');
        addMessage('/settings — open provider settings', 'lethe');
        addMessage('/clear — clear this conversation', 'lethe');
        addMessage('/help — show this list', 'lethe');
        return;
      case '/clear':
        addMessage(text, 'user');
        transcript.innerHTML = '';
        chatHistory = [{ role: 'system', content: buildSystemPrompt() }];
        turnCount = 0;
        addMessage('Fresh start.', 'lethe');
        return;
    }
  }

  /* Stability: block if idle-locked */
  if (isIdleLocked()) {
    showHomeNotice('wake me first');
    return;
  }

  /* Stability: check conversation limits */
  turnCount++;
  if (checkConversationLimits() === 'reset') return;

  /* Stability: reset chain depth on user input */
  chainDepth = 0;

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
  lastProvider = p.name;
  lastModel = p.model || '';
  setState('thinking'); showTyping(); showStatus(p.name);

  /* Refresh device state in system prompt before each send */
  chatHistory[0] = { role: 'system', content: buildSystemPrompt() };

  chainDepth++;
  chatRequest(p, chatHistory)
    .then(function(result) {
      hideTyping();

      /* Tool-call handling: execute tools, send results back to LLM */
      if (result.toolCalls) {
        setState('acting');
        if (result.text) addMessage(result.text, 'lethe');
        var toolResults = [];
        for (var i = 0; i < result.toolCalls.length; i++) {
          var tc = result.toolCalls[i];
          showStatus(tc.name.replace(/_/g, ' '));
          var output = executeTool(tc.name, tc.input);
          toolResults.push({ id: tc.id, name: tc.name, result: output });
        }
        /* Feed tool results back — Anthropic format */
        if (p.format === 'anthropic') {
          var acontent = [];
          if (result.text) acontent.push({ type: 'text', text: result.text });
          for (var a = 0; a < result.toolCalls.length; a++) {
            acontent.push({ type: 'tool_use', id: result.toolCalls[a].id,
              name: result.toolCalls[a].name, input: result.toolCalls[a].input });
          }
          chatHistory.push({ role: 'assistant', content: acontent });
          for (var b = 0; b < toolResults.length; b++) {
            chatHistory.push({ role: 'user', content: [{ type: 'tool_result',
              tool_use_id: toolResults[b].id, content: toolResults[b].result }] });
          }
        } else {
          /* OpenAI format */
          var amsg = { role: 'assistant', content: result.text || null, tool_calls: [] };
          for (var c = 0; c < result.toolCalls.length; c++) {
            amsg.tool_calls.push({ id: result.toolCalls[c].id, type: 'function',
              'function': { name: result.toolCalls[c].name,
                arguments: JSON.stringify(result.toolCalls[c].input) } });
          }
          chatHistory.push(amsg);
          for (var d = 0; d < toolResults.length; d++) {
            chatHistory.push({ role: 'tool', tool_call_id: toolResults[d].id,
              content: toolResults[d].result });
          }
        }
        /* Follow-up call so LLM can summarize what it did */
        if (chainDepth < CHAIN_DEPTH_MAX) {
          chainDepth++;
          showTyping(); setState('thinking');
          chatRequest(p, chatHistory).then(function(followUp) {
            hideTyping(); handleReply(followUp.text || 'Done.');
          }).catch(function() {
            hideTyping(); handleReply('Action completed.');
          });
        } else {
          handleReply('Done.');
        }
        return;
      }

      handleReply(result.text);
    })
    .catch(function(err) {
      hideTyping(); setState('alert');
      chainDepth = 0;
      console.log('LETHE chat error: ' + (err ? err.message || err : 'unknown'));
      addMessage(p.name === 'local'
        ? 'My local core is not running.'
        : 'Lost contact with ' + p.name + '. (' + (err ? err.message || '' : '') + ')', 'lethe');
      setTimeout(function() { setState('idle'); }, 3000);
    });
}

function handleReply(reply) {
  setState('speaking');

  if (hasSpiralRisk(reply)) {
    reply = 'I noticed myself going in circles. What were we working on?';
  }
  if (isRefusal(reply)) {
    microExpression('deny');
    if (window.letheEmotion) window.letheEmotion.setExpression('concerned');
  }

  chatHistory.push({ role: 'assistant', content: reply });
  addMessage(reply, 'lethe', { provider: lastProvider, model: lastModel });
  setState('idle');
  if (!isRefusal(reply) && viewState === 'home' && Math.random() > 0.5) {
    setTimeout(function() { playRandomAnim('replied'); }, 1500);
  }
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
      /* Feed voice amplitude to avatar */
      if (window.letheEmotion) {
        window.letheEmotion.startSpeechAmplitude(stream);
      }
    };
    mediaRecorder.onstop = function() {
      recording = false; btnMic.classList.remove('recording');
      if (window.letheEmotion) {
        window.letheEmotion.stopSpeechAmplitude();
      }
      stream.getTracks().forEach(function(t) { t.stop(); });
      var blob = new Blob(chunks, { type: 'audio/webm' });
      var form = new FormData();
      form.append('file', blob, 'voice.webm');
      form.append('model', 'whisper');

      function applyTranscription(text) {
        if (text) {
          inputEl.value = text.trim();
          btnSend.disabled = false; autoResize();
        }
        setState('idle');
      }

      function tryCloudTranscription() {
        /* Fall back to cloud provider if local Whisper is unavailable */
        var cp = getProvider();
        if (!cp || !cp.key) {
          showStatus('No transcription'); setState('idle'); return;
        }
        var cf = new FormData();
        cf.append('file', blob, 'voice.webm');
        cf.append('model', 'whisper-1');
        var cloudUrl, cloudHeaders = {};
        if (cp.name === 'openrouter' || cp.format === 'openai') {
          cloudUrl = cp.endpoint + '/audio/transcriptions';
          if (cp.key) cloudHeaders['Authorization'] = 'Bearer ' + cp.key;
        } else {
          showStatus('No transcription'); setState('idle'); return;
        }
        fetch(cloudUrl, { method: 'POST', headers: cloudHeaders, body: cf })
          .then(function(r) { return r.json(); })
          .then(function(d) { applyTranscription(d.text); })
          .catch(function() { showStatus('No transcription'); setState('idle'); });
      }

      fetch('http://127.0.0.1:8080/v1/audio/transcriptions',
        { method: 'POST', body: form })
        .then(function(r) {
          if (!r.ok) throw new Error(r.status);
          return r.json();
        })
        .then(function(d) {
          if (d.text) applyTranscription(d.text);
          else tryCloudTranscription();
        })
        .catch(function() { tryCloudTranscription(); });
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
    openDrawer();
  }
  /* Swipe DOWN → notification shade */
  if (dy < -threshold && Math.abs(dx) < threshold) {
    if (typeof NativeLauncher !== 'undefined') NativeLauncher.expandNotifications();
  }
}, { passive: true });

/* ═══════════ APP DRAWER ═══════════ */
var drawerEl = document.getElementById('drawer');
var drawerList = document.getElementById('drawer-list');
var drawerSearch = document.getElementById('drawer-search');
var drawerApps = [];
var drawerOpen = false;

function openDrawer() {
  if (drawerOpen) return;
  drawerOpen = true;
  loadApps();
  drawerEl.classList.add('open');
  home.classList.add('hidden');
  hintEl.classList.remove('visible');
  hideBurnerBanner();
  drawerSearch.value = '';
  drawerSearch.focus();
}

function closeDrawer() {
  if (!drawerOpen) return;
  drawerOpen = false;
  drawerEl.classList.remove('open');
  home.classList.remove('hidden');
  drawerSearch.blur();
  showBurnerBanner();
}

function toggleDrawer() {
  if (drawerOpen) closeDrawer(); else openDrawer();
}

function loadApps() {
  if (typeof NativeLauncher === 'undefined' || !NativeLauncher.getInstalledApps) {
    drawerList.innerHTML = '<div class="drawer-letter">No app bridge available</div>';
    return;
  }
  try {
    drawerApps = JSON.parse(NativeLauncher.getInstalledApps());
  } catch (e) {
    drawerApps = [];
  }
  renderApps(drawerApps);
}

function renderApps(apps) {
  drawerList.innerHTML = '';
  var currentLetter = '';
  for (var i = 0; i < apps.length; i++) {
    var app = apps[i];
    var firstLetter = (app.label || '?')[0].toUpperCase();
    if (firstLetter !== currentLetter) {
      currentLetter = firstLetter;
      var letterEl = document.createElement('div');
      letterEl.className = 'drawer-letter';
      letterEl.textContent = currentLetter;
      drawerList.appendChild(letterEl);
    }
    var row = document.createElement('div');
    row.className = 'drawer-app';
    row.setAttribute('data-pkg', app.package);
    row.setAttribute('data-activity', app.activity || '');
    var icon = '';
    if (app.icon) {
      icon = '<img class="drawer-app-icon" src="' + app.icon + '"/>';
    } else {
      icon = '<div class="drawer-app-icon"></div>';
    }
    row.innerHTML = icon + '<span class="drawer-app-label">' +
      escapeHtml(app.label) + '</span>';
    row.addEventListener('click', launchFromDrawer);
    drawerList.appendChild(row);
  }
}

function launchFromDrawer(e) {
  var row = e.currentTarget;
  var pkg = row.getAttribute('data-pkg');
  var act = row.getAttribute('data-activity');
  if (typeof NativeLauncher !== 'undefined') {
    NativeLauncher.launchApp(pkg, act);
  }
  closeDrawer();
}

if (drawerSearch) {
  drawerSearch.addEventListener('input', function() {
    var q = drawerSearch.value.toLowerCase();
    if (!q) { renderApps(drawerApps); return; }
    var filtered = drawerApps.filter(function(a) {
      return a.label.toLowerCase().indexOf(q) !== -1;
    });
    renderApps(filtered);
  });
}

/* Swipe down in drawer → close */
if (drawerEl) {
  var drawerTouchY = 0;
  drawerEl.addEventListener('touchstart', function(e) {
    drawerTouchY = e.touches[0].clientY;
  }, { passive: true });
  drawerEl.addEventListener('touchend', function(e) {
    var dy = e.changedTouches[0].clientY - drawerTouchY;
    if (dy > 100) closeDrawer();
  }, { passive: true });
}

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
