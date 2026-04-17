/* ═══════════ 2D VIDEO ANIMATION (CANVAS CROSSFADE) ═══════════ */
var canvas2d = document.getElementById('mascot-canvas-2d');
var ctx2d = canvas2d ? canvas2d.getContext('2d') : null;
var vidA = document.getElementById('vid-a');
var vidB = document.getElementById('vid-b');
var activeVid = vidA;   // currently drawing to canvas
var nextVid = vidB;     // preloading next video

/* Reduced motion: draw static frame, skip crossfades and boredom animations */
var _animReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
var animPrefersStatic = _animReducedMotion && _animReducedMotion.matches;
if (_animReducedMotion && _animReducedMotion.addEventListener) {
  _animReducedMotion.addEventListener('change', function(e) {
    animPrefersStatic = e.matches;
  });
}
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
var lastDrawTime = 0;
function drawLoop() {
  requestAnimationFrame(drawLoop);
  if (!ctx2d) return;

  /* Reduced motion: draw one static frame, skip animation */
  if (animPrefersStatic && !moodTransition) {
    if (activeVid.readyState >= 2) {
      ctx2d.drawImage(activeVid, 0, 0, canvas2d.width, canvas2d.height);
    }
    return;
  }

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
        // Guard: timeout after 5s to prevent leak if crossfade is interrupted
        var checkCount = 0;
        var checkDone = setInterval(function() {
          checkCount++;
          if (!crossfading || checkCount > 100) {
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

  /* Create spark particles — rising from cracks around the mascot.
     CSS handles animation via custom properties (launcher.css). */
  var sparkContainer = document.querySelector('.mascot-2d');
  if (sparkContainer) {
    var sparkDefs = [
      { x: '25%', y: '20%', dur: '2.5s', delay: '0s',    drift: '4px' },
      { x: '70%', y: '25%', dur: '3s',   delay: '0.8s',  drift: '-3px' },
      { x: '40%', y: '15%', dur: '2.8s', delay: '1.5s',  drift: '5px' },
      { x: '55%', y: '30%', dur: '3.2s', delay: '0.3s',  drift: '-6px' },
      { x: '30%', y: '35%', dur: '2.6s', delay: '2.1s',  drift: '3px' },
      { x: '65%', y: '22%', dur: '2.9s', delay: '1.2s',  drift: '-4px' }
    ];
    for (var si = 0; si < sparkDefs.length; si++) {
      var sp = document.createElement('div');
      sp.className = 'spark';
      sp.style.setProperty('--x', sparkDefs[si].x);
      sp.style.setProperty('--y', sparkDefs[si].y);
      sp.style.setProperty('--dur', sparkDefs[si].dur);
      sp.style.setProperty('--delay', sparkDefs[si].delay);
      sp.style.setProperty('--drift', sparkDefs[si].drift);
      sparkContainer.appendChild(sp);
    }
  }
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
  if (!vidA || letheAnimPlaying || animPrefersStatic) return;
  var anim = pickAnim(context || boredomState);
  playVideoAnim(anim.src, anim.speed);
}

function setBoredom(state) {
  if (boredomState === state) return;
  boredomState = state;

  /* Bridge boredom to mascot CSS state so visuals reflect idle progression.
     Sleep: eyes close, veins dim. Sleepy: subtle dimming. */
  if (state === 'asleep' && window.letheEmotion) {
    window.letheEmotion.setState('sleep');
  } else if (state === 'calm' && window.letheEmotion &&
             window.letheEmotion.getState() === 'sleep') {
    window.letheEmotion.setState('idle');
  }
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

/* ═══════════ SPRITE ANIMATION (SHALLOW TIER) ═══════════ */
var spriteCanvas = document.getElementById('mascot-canvas-sprite');
if (window.letheTier === 'sprite' && spriteCanvas && typeof SpritePlayer !== 'undefined') {
  SpritePlayer.init(spriteCanvas);
  var chatSpriteCanvas = document.getElementById('chat-mascot-sprite');
  if (chatSpriteCanvas) SpritePlayer.setMirror(chatSpriteCanvas);
  SpritePlayer.play('idle', { speed: 42, loop: true });
  console.log('LETHE sprite: idle animation started');

  /* Override playRandomAnim to use sprites instead of video */
  window._origPlayRandomAnim = typeof playRandomAnim === 'function' ? playRandomAnim : null;
  playRandomAnim = function(context) {
    var spriteAnims = {
      calm: ['idle'],
      tap: ['wave', 'idle'],
      replied: ['idle'],
      wake: ['warmup'],
      fidgeting: ['walk', 'idle'],
      sleepy: ['idle']
    };
    var pool = spriteAnims[context] || spriteAnims.calm;
    var pick = pool[Math.floor(Math.random() * pool.length)];
    var isIdle = (pick === 'idle');
    SpritePlayer.play(pick, { speed: isIdle ? 200 : 100, loop: isIdle });
  };

  /* Start idle loop for sprites too */
  scheduleIdleLoop();
}

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
// Throttled: skip frames when intensity is changing slowly to reduce main-thread blocking
var glitchFrameCount = 0;
function applyGlitchDesat(ctx, w, h, glitchIntensity, desatAmount) {
  if (glitchIntensity < 0.05 && desatAmount < 0.05) return;
  /* Skip every other frame at low intensity — halves pixel processing cost */
  glitchFrameCount++;
  if (glitchIntensity < 0.5 && (glitchFrameCount & 1)) return;
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
