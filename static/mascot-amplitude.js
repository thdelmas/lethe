/**
 * LETHE Speech Amplitude
 *
 * Real-time RMS amplitude extraction from a MediaStream via Web Audio.
 * Drives mascot pulsing during speech: orb emissive on the 3D renderer,
 * --speech-amplitude CSS custom property on #home-mascot for the 2D tier.
 *
 * Exports: window.letheAmplitude.start(stream) / .stop()
 *
 * Reduced-motion preference disables both: there is no point spinning up
 * an AudioContext to drive animations the user has asked us to suppress.
 *
 * window.letheEmotion.startSpeechAmplitude / .stopSpeechAmplitude are
 * preserved as thin wrappers in mascot-emotion.js for backwards compat
 * with launcher-send.js.
 */

(function() {
  'use strict';

  var reducedMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)');
  var prefersReducedMotion = reducedMotion && reducedMotion.matches;
  if (reducedMotion && reducedMotion.addEventListener) {
    reducedMotion.addEventListener('change', function(e) {
      prefersReducedMotion = e.matches;
    });
  }

  var audioCtx = null;
  var analyser = null;
  var amplitudeData = null;
  var amplitudeRaf = null;
  var audioSource = null;

  function start(mediaStream) {
    stop();
    if (prefersReducedMotion) return;
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
      poll();
    } catch (e) { /* AudioContext not available */ }
  }

  function poll() {
    if (!analyser) return;
    analyser.getByteFrequencyData(amplitudeData);

    // RMS amplitude normalized to 0-1
    var sum = 0;
    for (var i = 0; i < amplitudeData.length; i++) {
      sum += amplitudeData[i] * amplitudeData[i];
    }
    var rms = Math.sqrt(sum / amplitudeData.length) / 255;

    if (window.mascot3D && window.mascot3D.setSpeechAmplitude) {
      window.mascot3D.setSpeechAmplitude(rms);
    }

    var el = document.getElementById('home-mascot');
    if (el) {
      el.style.setProperty('--speech-amplitude', rms.toFixed(3));
    }

    amplitudeRaf = requestAnimationFrame(poll);
  }

  function stop() {
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

    if (window.mascot3D && window.mascot3D.setSpeechAmplitude) {
      window.mascot3D.setSpeechAmplitude(0);
    }
    var el = document.getElementById('home-mascot');
    if (el) el.style.setProperty('--speech-amplitude', '0');
  }

  window.letheAmplitude = { start: start, stop: stop };

})();
