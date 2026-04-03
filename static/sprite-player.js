/* LETHE Sprite Player — JS-driven frame animation with exact timing control.
 *
 * Uses vertical sprite sheets (one column, N rows). Each animation is a
 * separate PNG file: mascot-idle.sprite.png, mascot-wave.sprite.png, etc.
 *
 * The browser's APNG/WebP decoder can't be trusted for frame timing on
 * older WebViews (Chrome 69). This player uses setInterval to guarantee
 * the exact ms-per-frame we want. */

var SpritePlayer = (function() {
  var canvas, ctx;
  var currentSheet = null;    // Image object
  var currentName = '';
  var currentMood = 'green';  // current mood for sprite selection
  var frameCount = 0;
  var frameWidth = 0;
  var frameHeight = 0;
  var frameIndex = 0;
  var intervalId = null;
  var msPerFrame = 200;       // default: 5fps
  var sheets = {};            // cache: name-mood -> Image
  var onSwitch = null;        // callback when animation ends (for one-shot anims)

  function init(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
  }

  function loadSheet(name, callback) {
    var key = name + '-' + currentMood;
    if (sheets[key]) {
      callback(sheets[key]);
      return;
    }
    var img = new Image();
    img.onload = function() {
      sheets[key] = img;
      callback(img);
    };
    img.onerror = function() {
      console.log('LETHE sprite: failed to load ' + name);
    };
    // Try mood-specific sheet first, fall back to base
    img.src = 'mascot-' + name + '-' + currentMood + '.sprite.png';
    img.onerror = function() {
      // Fall back to mood-less version
      var fallback = new Image();
      fallback.onload = function() {
        sheets[key] = fallback;
        callback(fallback);
      };
      fallback.onerror = function() {
        console.log('LETHE sprite: no sheet for ' + name);
      };
      fallback.src = 'mascot-' + name + '.sprite.png';
    };
  }

  function drawFrame() {
    if (!currentSheet || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(
      currentSheet,
      0, frameIndex * frameHeight,
      frameWidth, frameHeight,
      0, 0,
      canvas.width, canvas.height
    );
  }

  function tick() {
    frameIndex = (frameIndex + 1) % frameCount;
    drawFrame();
  }

  function play(name, opts) {
    opts = opts || {};
    var speed = opts.speed || msPerFrame;
    var loop = opts.loop !== false;

    if (name === currentName && intervalId) return; // already playing

    loadSheet(name, function(img) {
      // Sprite sheets are vertical: width = frame width, height = frame height * N
      // Frame height = frame width (square frames from our recorder)
      frameWidth = img.width;
      frameHeight = img.width; // square
      frameCount = Math.round(img.height / frameHeight);

      canvas.width = frameWidth;
      canvas.height = frameHeight;

      currentSheet = img;
      currentName = name;
      frameIndex = 0;

      if (intervalId) clearInterval(intervalId);

      drawFrame();

      if (loop) {
        intervalId = setInterval(tick, speed);
      } else {
        var onceTick = function() {
          frameIndex++;
          if (frameIndex >= frameCount) {
            clearInterval(intervalId);
            intervalId = null;
            if (onSwitch) onSwitch();
            return;
          }
          drawFrame();
        };
        intervalId = setInterval(onceTick, speed);
      }
    });
  }

  function stop() {
    if (intervalId) { clearInterval(intervalId); intervalId = null; }
  }

  function setSpeed(ms) {
    msPerFrame = ms;
    if (intervalId && currentName) {
      clearInterval(intervalId);
      intervalId = setInterval(tick, ms);
    }
  }

  function setOnSwitch(fn) { onSwitch = fn; }

  function setMood(mood) {
    currentMood = mood;
    // Reload current animation with new mood
    if (currentName) {
      var wasPlaying = !!intervalId;
      var savedSpeed = msPerFrame;
      play(currentName, { speed: savedSpeed, loop: wasPlaying });
    }
  }

  return {
    init: init,
    play: play,
    stop: stop,
    setSpeed: setSpeed,
    setMood: setMood,
    setOnSwitch: setOnSwitch,
    getFrameCount: function() { return frameCount; },
    getCurrentName: function() { return currentName; },
    getMood: function() { return currentMood; }
  };
})();
