/* LETHE Mascot — Interactive awareness layer
 *
 * Gyroscope parallax, eye gaze tracking, touch reactions,
 * and ambient system awareness (battery, time-of-day).
 *
 * Requires: mascot-3d.css loaded, #mascot and #mascot-stage in DOM.
 * Reads/writes CSS custom properties on the mascot element.
 * Calls setState(), setExpression(), microExpression() from conversation.html.
 */

/* ══════════════════════════════════════════
   Gyroscope parallax
   Tilt the phone → the avatar shifts in 3D.
   ══════════════════════════════════════════ */
var gyroEnabled = false;
var gyroBeta0 = 0;
var gyroGamma0 = 0;

function initGyro() {
  if (gyroEnabled) return;
  window.addEventListener('deviceorientation', function(e) {
    if (e.beta === null) return;
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
var stage = document.getElementById('mascot-stage');

function updateGaze(clientX, clientY) {
  var rect = stage.getBoundingClientRect();
  var cx = rect.left + rect.width / 2;
  var cy = rect.top + rect.height / 2;
  /* Normalize to +-1, then scale to pixels */
  var dx = (clientX - cx) / (window.innerWidth / 2);
  var dy = (clientY - cy) / (window.innerHeight / 2);
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
   Touch reactions
   Tap the mascot → flinch + curious look.
   ══════════════════════════════════════════ */
var touchCount = 0;

stage.addEventListener('click', function() {
  /* Don't react while in alert or thinking */
  if (currentState === 'alert' || currentState === 'thinking') return;

  touchCount++;
  mascot.classList.add('touch-flinch');
  microExpression('surprise');
  setTimeout(function() { mascot.classList.remove('touch-flinch'); }, 300);

  /* After 3 taps, LETHE gets amused */
  if (touchCount >= 3) {
    setExpression('amused');
    setTimeout(function() { setExpression(null); }, 3000);
    touchCount = 0;
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

      /* Low battery → concerned */
      if (bat.level <= 0.1 && !bat.charging) {
        setExpression('concerned');
      }

      bat.addEventListener('levelchange', function() {
        var b = 0.4 + (bat.level * 0.6);
        mascot.style.setProperty('--ambient-brightness', b);
        if (bat.level <= 0.1 && !bat.charging) {
          setExpression('concerned');
        } else if (bat.level > 0.1 && currentExpr === 'concerned') {
          setExpression(null);
        }
      });

      bat.addEventListener('chargingchange', function() {
        if (bat.charging && bat.level < 0.5) {
          microExpression('nod');        /* Acknowledgment: plugged in */
        }
      });
    });
  } else {
    mascot.style.setProperty('--ambient-brightness', '1');
    mascot.classList.add('ambient-active');
  }
}

updateAmbient();

/* Refresh time hue every 15 minutes */
setInterval(function() {
  mascot.style.setProperty('--ambient-hue', getTimeHueShift() + 'deg');
}, 900000);
