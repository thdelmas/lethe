/**
 * LETHE Emotion Engine
 *
 * Plutchik-based emotion wheel — 8 primary emotions × 3 intensity tiers.
 * Emotions carry intensity (0-1) and decay gradually through tiers,
 * so the mascot winds down naturally instead of snapping to neutral.
 *
 * Color is derived from emotion: each primary maps to a Plutchik hue,
 * intensity drives saturation. Adjacent emotions blend into dyads.
 *
 * Speech amplitude extraction — Web Audio API feeds real-time amplitude
 * to the 3D renderer (orb emissive) and 2D CSS (custom properties).
 *
 * Bridges both rendering modes:
 *   3D → mascot3D.playState(), mascot3D.playOnce()
 *   2D → CSS classes on #mascot-stage, CSS custom properties
 *
 * Exports: window.letheEmotion + backwards-compat globals
 *   setState(), setExpression(), microExpression(), setEmotion()
 */

(function() {
  'use strict';

  var currentState = 'idle';
  var currentExpr = null;
  var stateDecayTimer = null;
  var exprDecayTimer = null;
  var exprFadeTimer = null;
  var stage = document.getElementById('home-mascot');

  /* Reduced motion: skip animation, use instant state changes */
  var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  var prefersReducedMotion = reducedMotion && reducedMotion.matches;
  if (reducedMotion && reducedMotion.addEventListener) {
    reducedMotion.addEventListener('change', function(e) {
      prefersReducedMotion = e.matches;
    });
  }

  // ═══════════ PLUTCHIK EMOTION WHEEL ═══════════
  // 8 primary emotions, each with 3 intensity tiers (low/mid/high),
  // a Plutchik-canonical hue, and the mood slot it resolves to.
  //
  // Tier names follow Plutchik's nomenclature:
  //   joy:          serenity → joy → ecstasy
  //   trust:        acceptance → trust → admiration
  //   fear:         apprehension → fear → terror
  //   surprise:     distraction → surprise → amazement
  //   sadness:      pensiveness → sadness → grief
  //   disgust:      boredom → disgust → loathing
  //   anger:        annoyance → anger → rage
  //   anticipation: interest → anticipation → vigilance

  var PLUTCHIK = {
    joy:          { hue: 48,  mood: 'yellow', tiers: ['serenity','joy','ecstasy'],
                    anim: 'wave', animHigh: 'confirm' },
    trust:        { hue: 120, mood: 'green',  tiers: ['acceptance','trust','admiration'],
                    anim: 'nod',  animHigh: 'confirm' },
    fear:         { hue: 60,  mood: 'yellow', tiers: ['apprehension','fear','terror'],
                    anim: null,   animHigh: 'alert' },
    surprise:     { hue: 280, mood: 'purple', tiers: ['distraction','surprise','amazement'],
                    anim: 'alert', animHigh: 'alert' },
    sadness:      { hue: 220, mood: 'blue',   tiers: ['pensiveness','sadness','grief'],
                    anim: null,   animHigh: 'deny' },
    disgust:      { hue: 300, mood: 'purple', tiers: ['boredom','disgust','loathing'],
                    anim: 'deny', animHigh: 'deny' },
    anger:        { hue: 0,   mood: 'red',    tiers: ['annoyance','anger','rage'],
                    anim: 'deny', animHigh: 'alert' },
    anticipation: { hue: 30,  mood: 'yellow', tiers: ['interest','anticipation','vigilance'],
                    anim: 'nod',  animHigh: 'confirm' }
  };

  // Adjacent emotions blend into dyads (Plutchik's petal overlaps).
  // Each dyad names two primaries and the resulting feeling.
  var DYADS = {
    love:         ['joy', 'trust'],
    submission:   ['trust', 'fear'],
    awe:          ['fear', 'surprise'],
    disapproval:  ['surprise', 'sadness'],
    remorse:      ['sadness', 'disgust'],
    contempt:     ['disgust', 'anger'],
    aggressiveness: ['anger', 'anticipation'],
    optimism:     ['anticipation', 'joy']
  };

  // ═══════════ EMOTION STATE ═══════════
  // The mascot carries a single active emotion (or dyad) with intensity 0-1.
  // Intensity decays over time: high → mid → low → neutral.

  var currentEmotion = null;   // e.g. 'fear' or 'love' (dyad)
  var emotionIntensity = 0;    // 0-1
  var emotionDecayRaf = null;
  var emotionDecayRate = 0.08; // intensity lost per second (default)
  var lastDecayTime = 0;

  function intensityTier(intensity) {
    if (intensity >= 0.67) return 2; // high
    if (intensity >= 0.34) return 1; // mid
    if (intensity > 0)     return 0; // low
    return -1;                       // neutral
  }

  function tierName(emotion, intensity) {
    var def = PLUTCHIK[emotion];
    if (!def) return null;
    var tier = intensityTier(intensity);
    return tier >= 0 ? def.tiers[tier] : null;
  }

  // Resolve emotion → mood color slot. High-intensity fear/anger override
  // to 'red'; dyads blend the two primaries' hues.
  function emotionToMood(emotion, intensity) {
    var def = PLUTCHIK[emotion];
    if (def) {
      if (intensity >= 0.67 && (emotion === 'fear' || emotion === 'anger')) {
        return 'red';
      }
      return def.mood;
    }
    // Dyad: use the first primary's mood
    var pair = DYADS[emotion];
    if (pair) return PLUTCHIK[pair[0]].mood;
    return 'green';
  }

  // Resolve emotion → CSS hue-rotate value for fine-grained color.
  // Base mascot hue is ~160 (teal), so offset = target - 160.
  function emotionToHue(emotion) {
    var def = PLUTCHIK[emotion];
    if (def) return def.hue;
    var pair = DYADS[emotion];
    if (pair) {
      // Average the two primaries' hues
      var h1 = PLUTCHIK[pair[0]].hue;
      var h2 = PLUTCHIK[pair[1]].hue;
      // Handle wrapping (e.g. 350 + 10 → 0, not 180)
      var diff = h2 - h1;
      if (diff > 180) diff -= 360;
      if (diff < -180) diff += 360;
      return (h1 + diff / 2 + 360) % 360;
    }
    return 160; // neutral teal
  }

  // Pick the right 3D one-shot animation for this emotion + intensity
  function emotionToAnim(emotion, intensity) {
    var def = PLUTCHIK[emotion];
    if (!def) {
      var pair = DYADS[emotion];
      if (pair) def = PLUTCHIK[pair[0]];
    }
    if (!def) return null;
    return (intensity >= 0.67 && def.animHigh) ? def.animHigh : def.anim;
  }

  // Apply emotion visuals: CSS vars, mood color, CSS class, 3D anim
  function applyEmotion() {
    var tier = intensityTier(emotionIntensity);
    var name = currentEmotion;
    var tName = name ? tierName(
      PLUTCHIK[name] ? name : (DYADS[name] ? DYADS[name][0] : null),
      emotionIntensity
    ) : null;

    if (stage) {
      // Set CSS custom properties for fine-grained visual control
      stage.style.setProperty('--emotion-intensity',
        emotionIntensity.toFixed(3));
      stage.style.setProperty('--emotion-hue',
        name ? emotionToHue(name) + 'deg' : '160deg');
      stage.style.setProperty('--emotion-saturation',
        name ? (0.5 + emotionIntensity * 0.5).toFixed(2) : '0');

      // Class for CSS tier hooks: mascot-emo-serenity, mascot-emo-terror, etc.
      stage.className = stage.className
        .replace(/\bmascot-emo-\S+/g, '').trim();
      if (tName) stage.classList.add('mascot-emo-' + tName);
    }

    // Drive mood color from emotion
    if (name && typeof window.letheSetMood === 'function') {
      window.letheSetMood(emotionToMood(name, emotionIntensity));
    }
  }

  /**
   * setEmotion(name, intensity, opts)
   *
   * Primary API — set the mascot's emotional state on Plutchik's wheel.
   *
   * @param {string} name       Primary emotion key ('joy','fear','anger',…)
   *                             or dyad name ('love','awe','optimism',…)
   * @param {number} intensity  0-1 (0.1=serenity, 0.5=joy, 0.9=ecstasy)
   * @param {object} [opts]     { decayRate: 0.08, noAnim: false }
   */
  function setEmotion(name, intensity, opts) {
    opts = opts || {};
    var clampedIntensity = Math.max(0, Math.min(1, intensity));

    // If same emotion, only update if new intensity is higher (don't dampen)
    if (name === currentEmotion && clampedIntensity <= emotionIntensity) {
      return;
    }

    var prevTier = currentEmotion
      ? intensityTier(emotionIntensity) : -1;

    currentEmotion = name;
    emotionIntensity = clampedIntensity;
    emotionDecayRate = opts.decayRate || 0.08;

    applyEmotion();

    // Trigger 3D one-shot on tier change (not every setEmotion call)
    var newTier = intensityTier(clampedIntensity);
    if (!opts.noAnim && newTier > prevTier) {
      var anim = emotionToAnim(name, clampedIntensity);
      if (anim && window.mascot3D && window.mascot3D.playOnce) {
        window.mascot3D.playOnce(anim);
      }
    }

    // Start decay loop if not already running
    if (!emotionDecayRaf) {
      lastDecayTime = Date.now();
      emotionDecayRaf = requestAnimationFrame(decayLoop);
    }
  }

  function clearEmotion() {
    currentEmotion = null;
    emotionIntensity = 0;
    if (emotionDecayRaf) {
      cancelAnimationFrame(emotionDecayRaf);
      emotionDecayRaf = null;
    }
    if (stage) {
      stage.style.setProperty('--emotion-intensity', '0');
      stage.style.setProperty('--emotion-saturation', '0');
      stage.className = stage.className
        .replace(/\bmascot-emo-\S+/g, '').trim();
    }
  }

  // Gradual decay: intensity decreases over time, stepping down tiers.
  // At each tier boundary the CSS class updates, giving a visible wind-down.
  function decayLoop() {
    if (!currentEmotion || emotionIntensity <= 0) {
      clearEmotion();
      return;
    }
    var now = Date.now();
    var dt = (now - lastDecayTime) / 1000;
    lastDecayTime = now;

    var prevTier = intensityTier(emotionIntensity);
    emotionIntensity = Math.max(0, emotionIntensity - emotionDecayRate * dt);
    var newTier = intensityTier(emotionIntensity);

    // Re-apply visuals on tier boundary or every ~4 frames for smooth CSS
    if (newTier !== prevTier || Math.random() < 0.25) {
      applyEmotion();
    }

    if (emotionIntensity <= 0) {
      clearEmotion();
    } else {
      emotionDecayRaf = requestAnimationFrame(decayLoop);
    }
  }

  // ═══════════ EXPRESSION DECAY (legacy) ═══════════
  // Kept for backwards compat. setExpression() now routes through
  // setEmotion() when possible, falling back to CSS-only for unknowns.

  var EXPR_DECAY = {
    proud:     { hold: 2500 },
    amused:    { hold: 2000 },
    concerned: { hold: 3500 },
    curious:   { hold: 2500 }
  };

  // Map legacy expression names → Plutchik emotion + intensity
  var EXPR_TO_EMOTION = {
    proud:     { emotion: 'joy',      intensity: 0.7  },
    amused:    { emotion: 'joy',      intensity: 0.4  },
    concerned: { emotion: 'fear',     intensity: 0.45 },
    curious:   { emotion: 'surprise', intensity: 0.3  }
  };

  // State transitions: alert decays to idle after threat subsides
  var STATE_MOMENTUM = {
    alert: { hold: 3000, next: 'idle' }
  };

  // Map expressions to 3D one-shot animations (legacy fallback)
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

  // Map micro-expressions → Plutchik emotion + intensity for quick flash
  var MICRO_TO_EMOTION = {
    surprise:          { emotion: 'surprise',     intensity: 0.5 },
    deny:              { emotion: 'disgust',      intensity: 0.4 },
    'tracker-blocked': { emotion: 'anger',        intensity: 0.35 },
    'tor-rebuilt':     { emotion: 'trust',        intensity: 0.5 },
    'message-received':{ emotion: 'anticipation', intensity: 0.25 }
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

    // Clear pending timers
    if (exprDecayTimer) { clearTimeout(exprDecayTimer); exprDecayTimer = null; }
    if (exprFadeTimer) { clearTimeout(exprFadeTimer); exprFadeTimer = null; }

    // Route through Plutchik system when possible
    if (name && EXPR_TO_EMOTION[name]) {
      var emo = EXPR_TO_EMOTION[name];
      setEmotion(emo.emotion, emo.intensity);
    } else if (!name) {
      // Clearing expression — let emotion decay naturally (don't force-clear)
    }

    // Fade out previous expression before applying new one
    if (stage && currentExpr && !name) {
      stage.classList.add('mascot-expr-fading');
      exprFadeTimer = setTimeout(function() {
        stage.className = stage.className
          .replace(/\bmascot-expr-\S+/g, '').trim();
      }, prefersReducedMotion ? 10 : 300);
    } else if (stage) {
      stage.className = stage.className
        .replace(/\bmascot-expr-\S+/g, '').trim();
      if (name) stage.classList.add('mascot-expr-' + name);
    }

    currentExpr = name;
    window.currentExpr = name;

    // 3D: trigger one-shot for this expression (fallback if Plutchik didn't)
    if (window.mascot3D && window.mascot3D.playOnce && name) {
      if (!EXPR_TO_EMOTION[name]) {
        var anim = EXPR_ANIM[name];
        if (anim) window.mascot3D.playOnce(anim);
      }
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
    // Feed Plutchik system — brief intensity spike with fast decay
    if (MICRO_TO_EMOTION[name]) {
      var emo = MICRO_TO_EMOTION[name];
      setEmotion(emo.emotion, emo.intensity, { decayRate: 0.2 });
    }

    // Reduced motion: skip CSS animation, still trigger 3D one-shot
    if (stage && !prefersReducedMotion) {
      var cls = 'micro-' + name;
      stage.classList.add(cls);
      setTimeout(function() { stage.classList.remove(cls); }, 1500);
    }

    // 3D one-shot (controlled by its own reduced-motion guard)
    if (window.mascot3D && window.mascot3D.playOnce) {
      var anim = MICRO_ANIM[name];
      if (anim) window.mascot3D.playOnce(anim);
    }
  }

  // ═══════════ SPEECH AMPLITUDE ═══════════
  // Implementation moved to mascot-amplitude.js. Thin shims below
  // preserve the letheEmotion.start/stopSpeechAmplitude() API so
  // launcher-send.js callers don't need to change.

  function startSpeechAmplitude(mediaStream) {
    if (window.letheAmplitude) window.letheAmplitude.start(mediaStream);
  }
  function stopSpeechAmplitude() {
    if (window.letheAmplitude) window.letheAmplitude.stop();
  }

  // ═══════════ EXPORTS ═══════════

  window.letheEmotion = {
    setState: setState,
    setExpression: setExpression,
    microExpression: microExpression,
    setEmotion: setEmotion,
    clearEmotion: clearEmotion,
    startSpeechAmplitude: startSpeechAmplitude,
    stopSpeechAmplitude: stopSpeechAmplitude,
    getState: function() { return currentState; },
    getExpression: function() { return currentExpr; },
    getEmotion: function() { return currentEmotion; },
    getEmotionIntensity: function() { return emotionIntensity; },
    getEmotionTier: function() {
      if (!currentEmotion) return null;
      var primary = PLUTCHIK[currentEmotion]
        ? currentEmotion
        : (DYADS[currentEmotion] ? DYADS[currentEmotion][0] : null);
      return primary ? tierName(primary, emotionIntensity) : null;
    },
    PLUTCHIK: PLUTCHIK,
    DYADS: DYADS
  };

  // Backwards compat — globals used by mascot-interact.js
  window.setState = setState;
  window.setExpression = setExpression;
  window.microExpression = microExpression;
  window.setEmotion = setEmotion;
  window.currentState = currentState;
  window.currentExpr = currentExpr;

})();
