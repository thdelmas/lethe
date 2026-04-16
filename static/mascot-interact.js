/* LETHE Mascot — Interactive awareness layer
 *
 * Gyroscope parallax, eye gaze tracking, touch reactions,
 * and ambient system awareness (battery, time-of-day).
 *
 * Requires: mascot-3d.css loaded, #home-mascot in DOM.
 * Reads/writes CSS custom properties on the mascot element.
 * Calls setState(), setExpression(), microExpression() from mascot-emotion.js.
 */

/* ══════════════════════════════════════════
   Reduced motion detection
   Respects OS-level accessibility setting.
   ══════════════════════════════════════════ */
var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
var prefersReducedMotion = reducedMotion && reducedMotion.matches;

/* Live-update: user can toggle in system settings without reload */
if (reducedMotion && reducedMotion.addEventListener) {
  reducedMotion.addEventListener('change', function(e) {
    prefersReducedMotion = e.matches;
    if (prefersReducedMotion) {
      mascot.classList.remove('gyro-active', 'gaze-active');
      mascot.style.removeProperty('--gyro-x');
      mascot.style.removeProperty('--gyro-y');
      mascot.style.removeProperty('--gaze-x');
      mascot.style.removeProperty('--gaze-y');
    }
  });
}

/* ══════════════════════════════════════════
   Gyroscope parallax
   Tilt the phone → the avatar shifts in 3D.
   ══════════════════════════════════════════ */
var mascot = document.getElementById('home-mascot');
var gyroEnabled = false;
var gyroBeta0 = 0;
var gyroGamma0 = 0;

function initGyro() {
  if (gyroEnabled || prefersReducedMotion) return;
  window.addEventListener('deviceorientation', function(e) {
    if (e.beta === null || prefersReducedMotion) return;
    if (!gyroEnabled) {
      gyroEnabled = true;
      gyroBeta0 = e.beta;
      gyroGamma0 = e.gamma;
      mascot.classList.add('gyro-active');
    }
    /* Map tilt to +-8deg rotation, clamped */
    var rx = Math.max(-8, Math.min(8, (e.beta - gyroBeta0) * 0.3));
    var ry = Math.max(-8, Math.min(8, (e.gamma - gyroGamma0) * 0.3));
    mascot.style.setProperty('--gyro-x', rx + 'deg');
    mascot.style.setProperty('--gyro-y', ry + 'deg');
  });
}

/* iOS requires permission request on user gesture */
if (typeof DeviceOrientationEvent !== 'undefined' &&
    typeof DeviceOrientationEvent.requestPermission === 'function') {
  document.addEventListener('touchstart', function reqGyro() {
    DeviceOrientationEvent.requestPermission().then(function(r) {
      if (r === 'granted') initGyro();
    }).catch(function() {});
    document.removeEventListener('touchstart', reqGyro);
  }, { once: true });
} else {
  initGyro();
}


/* ══════════════════════════════════════════
   Eye gaze tracking
   Eyes follow touch/mouse position on screen.
   ══════════════════════════════════════════ */
var stage = mascot;

function updateGaze(clientX, clientY) {
  if (prefersReducedMotion) return;
  var rect = stage.getBoundingClientRect();
  var cx = rect.left + rect.width / 2;
  var cy = rect.top + rect.height / 2;
  /* Normalize relative to viewport, works with keyboard open or rotated */
  var vw = document.documentElement.clientWidth || window.innerWidth;
  var vh = document.documentElement.clientHeight || window.innerHeight;
  var dx = (clientX - cx) / (vw / 2);
  var dy = (clientY - cy) / (vh / 2);
  var gazeX = Math.max(-6, Math.min(6, dx * 6));
  var gazeY = Math.max(-4, Math.min(4, dy * 4));
  mascot.style.setProperty('--gaze-x', gazeX + 'px');
  mascot.style.setProperty('--gaze-y', gazeY + 'px');
  if (!mascot.classList.contains('gaze-active')) {
    mascot.classList.add('gaze-active');
  }
}

document.addEventListener('touchmove', function(e) {
  if (e.touches.length === 1) {
    updateGaze(e.touches[0].clientX, e.touches[0].clientY);
  }
}, { passive: true });

document.addEventListener('mousemove', function(e) {
  updateGaze(e.clientX, e.clientY);
}, { passive: true });


/* ══════════════════════════════════════════
   Touch / keyboard reactions
   Tap or press Enter/Space → flinch + curious look.
   ══════════════════════════════════════════ */
var touchCount = 0;

/* Make mascot focusable for keyboard users */
if (stage && !stage.hasAttribute('tabindex')) {
  stage.setAttribute('tabindex', '0');
  stage.setAttribute('role', 'button');
  stage.setAttribute('aria-label', 'LETHE guardian — tap to interact');
}

function handleMascotActivation() {
  /* Don't react while in alert or thinking */
  if (currentState === 'alert' || currentState === 'thinking') return;

  touchCount++;
  if (!prefersReducedMotion) {
    mascot.classList.add('touch-flinch');
    setTimeout(function() { mascot.classList.remove('touch-flinch'); }, 300);
  }
  microExpression('surprise');

  /* After 3 taps, LETHE gets amused */
  if (touchCount >= 3) {
    setExpression('amused');
    touchCount = 0;
  }
}

/* Pointer: immediate press feedback + click activation */
stage.addEventListener('pointerdown', function() {
  if (prefersReducedMotion) return;
  mascot.classList.add('touch-active');
}, { passive: true });

stage.addEventListener('pointerup', function() {
  mascot.classList.remove('touch-active');
}, { passive: true });

stage.addEventListener('pointercancel', function() {
  mascot.classList.remove('touch-active');
}, { passive: true });

stage.addEventListener('click', handleMascotActivation);

/* Keyboard: Enter opens chat, Space triggers interaction */
stage.addEventListener('keydown', function(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    if (typeof openChat === 'function') openChat();
  } else if (e.key === ' ') {
    e.preventDefault();
    handleMascotActivation();
  }
});


/* ══════════════════════════════════════════
   Ambient system awareness
   Battery → vein brightness. Time → hue warmth.
   LETHE IS the phone — it feels its own state.
   ══════════════════════════════════════════ */
function getTimeHueShift() {
  var hour = new Date().getHours();
  if (hour >= 22 || hour < 6) return -15;       /* Night: cool blue shift */
  if (hour >= 10 && hour < 16) return 8;        /* Midday: warm shift */
  return 0;                                      /* Dawn/dusk: neutral */
}

function updateAmbient() {
  mascot.style.setProperty('--ambient-hue', getTimeHueShift() + 'deg');

  if (navigator.getBattery) {
    navigator.getBattery().then(function(bat) {
      var brightness = 0.4 + (bat.level * 0.6);       /* 40%-100% */
      mascot.style.setProperty('--ambient-brightness', brightness);
      mascot.classList.add('ambient-active');

      /* Apply battery expression for current state */
      applyBatteryExpression(bat);

      bat.addEventListener('levelchange', function() {
        var b = 0.4 + (bat.level * 0.6);
        mascot.style.setProperty('--ambient-brightness', b);
        applyBatteryExpression(bat);
      });

      bat.addEventListener('chargingchange', function() {
        if (bat.charging) {
          microExpression('nod');          /* Plugged in — acknowledged */
        }
        applyBatteryExpression(bat);
      });
    });
  } else {
    mascot.style.setProperty('--ambient-brightness', '1');
    mascot.classList.add('ambient-active');
  }

  /* Centralized battery → Plutchik emotion mapping.
     Intensity scales with severity: apprehension → fear → terror. */
  function applyBatteryExpression(bat) {
    var emo = window.letheEmotion || {};
    if (typeof emo.setEmotion !== 'function') {
      /* Fallback if emotion engine not loaded yet */
      if (bat.level <= 0.1 && !bat.charging) setExpression('concerned');
      else if (bat.level >= 1.0 && bat.charging) setExpression('proud');
      return;
    }
    if (bat.level <= 0.05 && !bat.charging) {
      emo.setEmotion('fear', 0.85);       /* Terror — critical */
    } else if (bat.level <= 0.1 && !bat.charging) {
      emo.setEmotion('fear', 0.55);       /* Fear — warning */
    } else if (bat.level <= 0.15 && !bat.charging) {
      emo.setEmotion('fear', 0.3);        /* Apprehension — uneasy */
    } else if (bat.level >= 1.0 && bat.charging) {
      emo.setEmotion('joy', 0.75);        /* Ecstasy — fully charged */
    } else if (bat.level > 0.15) {
      emo.setEmotion('trust', 0.15);      /* Acceptance — recovery */
    }
  }
}

updateAmbient();

/* Refresh time hue every 15 minutes */
setInterval(function() {
  mascot.style.setProperty('--ambient-hue', getTimeHueShift() + 'deg');
}, 900000);
