/* LETHE in-WebView QR scanner.
 * Uses getUserMedia + jsQR. No external app needed.
 * Exposes: window.letheQR.open(onResult, onError, onCancel) */

(function() {
  var overlay = document.getElementById('qr-scanner');
  var video = document.getElementById('qr-video');
  var canvas = document.getElementById('qr-canvas');
  var hint = document.getElementById('qr-hint');
  var cancelBtn = document.getElementById('qr-cancel');
  if (!overlay || !video || !canvas) return;

  var ctx = canvas.getContext('2d', { willReadFrequently: true });
  var stream = null;
  var rafId = 0;
  var active = false;
  var onResultCb = null;
  var onErrorCb = null;
  var onCancelCb = null;

  function setHint(text) { if (hint) hint.textContent = text; }

  function stop() {
    active = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    if (stream) {
      var tracks = stream.getTracks();
      for (var i = 0; i < tracks.length; i++) tracks[i].stop();
      stream = null;
    }
    try { video.pause(); video.srcObject = null; } catch (e) {}
    overlay.classList.add('hidden');
  }

  function fail(msg) {
    stop();
    if (typeof onErrorCb === 'function') onErrorCb(msg);
  }

  function tick() {
    if (!active) return;
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      var w = video.videoWidth;
      var h = video.videoHeight;
      if (w && h) {
        /* Downscale for decoder perf on slow devices */
        var scale = Math.min(1, 480 / Math.max(w, h));
        canvas.width = Math.floor(w * scale);
        canvas.height = Math.floor(h * scale);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        var img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        try {
          var code = window.jsQR(img.data, img.width, img.height, {
            inversionAttempts: 'dontInvert'
          });
          if (code && code.data) {
            var data = code.data;
            stop();
            if (typeof onResultCb === 'function') onResultCb(data);
            return;
          }
        } catch (e) {
          console.log('LETHE QR decode error:', e && e.message);
        }
      }
    }
    rafId = requestAnimationFrame(tick);
  }

  function start() {
    console.log('LETHE QR: start()');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.log('LETHE QR: no mediaDevices API');
      fail('Camera API not available in this WebView.');
      return;
    }
    if (typeof window.jsQR !== 'function') {
      console.log('LETHE QR: jsQR not loaded');
      fail('QR decoder failed to load.');
      return;
    }
    setHint('Point camera at the pairing QR from OSmosis');
    overlay.classList.remove('hidden');
    active = true;
    console.log('LETHE QR: overlay shown, requesting camera');

    navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width:  { ideal: 640 },
        height: { ideal: 480 }
      }
    }).then(function(s) {
      console.log('LETHE QR: got stream');
      if (!active) { s.getTracks().forEach(function(t) { t.stop(); }); return; }
      stream = s;
      video.srcObject = s;
      var p = video.play();
      if (p && p.catch) p.catch(function(e) {
        console.log('LETHE QR: video.play rejected: ' + (e && e.name));
      });
      rafId = requestAnimationFrame(tick);
    }).catch(function(err) {
      var name = err && err.name ? err.name : 'Error';
      var msg = err && err.message ? err.message : '';
      console.log('LETHE QR: getUserMedia failed: ' + name + ' - ' + msg);
      var hintMap = {
        NotAllowedError: 'Camera permission denied.',
        NotFoundError:   'No camera found on this device.',
        NotReadableError:'Camera is in use by another app.',
        SecurityError:   'Camera blocked by security policy.'
      };
      fail(hintMap[name] || ('Camera error: ' + name));
    });
  }

  function open(onResult, onError, onCancel) {
    onResultCb = onResult;
    onErrorCb  = onError;
    onCancelCb = onCancel;
    start();
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', function() {
      var cb = onCancelCb;
      stop();
      if (typeof cb === 'function') cb();
    });
  }

  /* Esc closes */
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && !overlay.classList.contains('hidden')) {
      var cb = onCancelCb;
      stop();
      if (typeof cb === 'function') cb();
    }
  });

  window.letheQR = { open: open, close: stop };
})();
