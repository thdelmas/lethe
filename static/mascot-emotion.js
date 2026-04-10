/**
 * LETHE Emotion Engine
 *
 * Emotion momentum/decay — states and expressions don't snap, they have
 * inertia. A guardian that was just proud doesn't instantly go blank.
 *
 * Speech amplitude extraction — Web Audio API feeds real-time amplitude
 * to the 3D renderer (orb emissive) and 2D CSS (custom properties).
 *
 * Bridges both rendering modes:
 *   3D → mascot3D.playState(), mascot3D.playOnce()
 *   2D → CSS classes on #mascot-stage, CSS custom properties
 *
 * Exports: window.letheEmotion + backwards-compat globals
 *   setState(), setExpression(), microExpression()
 */

(function() {
  'use strict';

  var currentState = 'idle';
  var currentExpr = null;
  var stateDecayTimer = null;
  var exprDecayTimer = null;
  var stage = document.getElementById('mascot-stage');

  // ═══════════ EXPRESSION DECAY ═══════════
  // How long emotional expressions linger before fading.
  // States are conversation-driven (no auto-decay except alert).

  var EXPR_DECAY = {
    proud:     { hold: 2500 },
    amused:    { hold: 2000 },
    concerned: { hold: 3500 },
    curious:   { hold: 2500 }
  };

  // State transitions: alert decays to idle after threat subsides
  var STATE_MOMENTUM = {
    alert: { hold: 3000, next: 'idle' }
  };

  // Map expressions to 3D one-shot animations
  var EXPR_ANIM = {
    proud: 'confirm', amused: 'wave', curious: 'nod'
  };

  // Map micro-expressions to 3D one-shot animations
  var MICRO_ANIM = {
    surprise: 'alert', nod: 'nod',
    deny: 'deny',
    'message-received': 'nod',
    'tracker-blocked': 'deny',
    'tor-rebuilt': 'confirm'
  };

  // ═══════════ STATE ═══════════

  function setState(name) {
    if (name === currentState) return;
    currentState = name;
    window.currentState = name;

    // Clear pending state decay
    if (stateDecayTimer) {
      clearTimeout(stateDecayTimer);
      stateDecayTimer = null;
    }

    // Bridge to 3D avatar
    if (window.mascot3D && window.mascot3D.playState) {
      window.mascot3D.playState(name);
    }

    // Bridge to 2D avatar (CSS classes)
    if (stage) {
      stage.className = stage.className
        .replace(/\bmascot-state-\S+/g, '').trim();
      stage.classList.add('mascot-state-' + name);
    }

    // Schedule momentum decay
    var momentum = STATE_MOMENTUM[name];
    if (momentum) {
      stateDecayTimer = setTimeout(function() {
        setState(momentum.next);
      }, momentum.hold);
    }
  }

  // ═══════════ EXPRESSIONS ═══════════

  function setExpression(name) {
    if (name === currentExpr) return;
    currentExpr = name;
    window.currentExpr = name;

    // Clear pending decay
    if (exprDecayTimer) {
      clearTimeout(exprDecayTimer);
      exprDecayTimer = null;
    }

    // Apply CSS expression class
    if (stage) {
      stage.className = stage.className
        .replace(/\bmascot-expr-\S+/g, '').trim();
      if (name) stage.classList.add('mascot-expr-' + name);
    }

    // 3D: trigger one-shot for this expression
    if (window.mascot3D && window.mascot3D.playOnce && name) {
      var anim = EXPR_ANIM[name];
      if (anim) window.mascot3D.playOnce(anim);
    }

    // Schedule expression decay
    if (name && EXPR_DECAY[name]) {
      exprDecayTimer = setTimeout(function() {
        setExpression(null);
      }, EXPR_DECAY[name].hold);
    }
  }

  // ═══════════ MICRO-EXPRESSIONS ═══════════

  function microExpression(name) {
    // Brief 1.5s CSS overlay
    if (stage) {
      var cls = 'micro-' + name;
      stage.classList.add(cls);
      setTimeout(function() { stage.classList.remove(cls); }, 1500);
    }

    // 3D one-shot
    if (window.mascot3D && window.mascot3D.playOnce) {
      var anim = MICRO_ANIM[name];
      if (anim) window.mascot3D.playOnce(anim);
    }
  }

  // ═══════════ SPEECH AMPLITUDE ═══════════
  // Extract real-time amplitude from audio and feed to renderers.
  // The orb and veins pulse with LETHE's voice.

  var audioCtx = null;
  var analyser = null;
  var amplitudeData = null;
  var amplitudeRaf = null;
  var audioSource = null;

  function startSpeechAmplitude(mediaStream) {
    stopSpeechAmplitude();
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      audioCtx = new AC();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.7;
      amplitudeData = new Uint8Array(analyser.frequencyBinCount);

      audioSource = audioCtx.createMediaStreamSource(mediaStream);
      audioSource.connect(analyser);
      pollAmplitude();
    } catch (e) { /* AudioContext not available */ }
  }

  function pollAmplitude() {
    if (!analyser) return;
    analyser.getByteFrequencyData(amplitudeData);

    // RMS amplitude normalized to 0-1
    var sum = 0;
    for (var i = 0; i < amplitudeData.length; i++) {
      sum += amplitudeData[i] * amplitudeData[i];
    }
    var rms = Math.sqrt(sum / amplitudeData.length) / 255;

    // Feed to 3D renderer
    if (window.mascot3D && window.mascot3D.setSpeechAmplitude) {
      window.mascot3D.setSpeechAmplitude(rms);
    }

    // Feed to 2D CSS
    var mascot = document.querySelector('.lethe-mascot');
    if (mascot) {
      mascot.style.setProperty('--speech-amplitude', rms.toFixed(3));
    }

    amplitudeRaf = requestAnimationFrame(pollAmplitude);
  }

  function stopSpeechAmplitude() {
    if (amplitudeRaf) {
      cancelAnimationFrame(amplitudeRaf);
      amplitudeRaf = null;
    }
    if (audioSource) {
      audioSource.disconnect();
      audioSource = null;
    }
    if (audioCtx) {
      audioCtx.close().catch(function() {});
      audioCtx = null;
    }
    analyser = null;

    // Reset renderers
    if (window.mascot3D && window.mascot3D.setSpeechAmplitude) {
      window.mascot3D.setSpeechAmplitude(0);
    }
    var mascot = document.querySelector('.lethe-mascot');
    if (mascot) mascot.style.setProperty('--speech-amplitude', '0');
  }

  // ═══════════ EXPORTS ═══════════

  window.letheEmotion = {
    setState: setState,
    setExpression: setExpression,
    microExpression: microExpression,
    startSpeechAmplitude: startSpeechAmplitude,
    stopSpeechAmplitude: stopSpeechAmplitude,
    getState: function() { return currentState; },
    getExpression: function() { return currentExpr; }
  };

  // Backwards compat — globals used by mascot-interact.js
  window.setState = setState;
  window.setExpression = setExpression;
  window.microExpression = microExpression;
  window.currentState = currentState;
  window.currentExpr = currentExpr;

})();
