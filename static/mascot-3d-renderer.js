/**
 * LETHE Mascot 3D Renderer (classic script, no ES modules)
 * Requires three.min.js + GLTFLoader.js loaded before this.
 * Drives two canvases: #mascot-canvas (home) and #chat-mascot-canvas (chat).
 */

(function() {
  'use strict';

  var homeCanvas = document.getElementById('mascot-canvas');
  var chatCanvas = document.getElementById('chat-mascot-canvas');
  if (!homeCanvas || typeof THREE === 'undefined') return;

  // ═══════════ HOME RENDERER ═══════════

  var isShallow = (window.letheDeviceTier === 'shallow');

  var homeRenderer = new THREE.WebGLRenderer({
    canvas: homeCanvas, alpha: true, antialias: !isShallow
  });
  homeRenderer.setPixelRatio(isShallow ? 1 : Math.min(window.devicePixelRatio || 1, 2));
  if (!isShallow) {
    homeRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    homeRenderer.toneMappingExposure = 1.3;
  }

  var homeScene = new THREE.Scene();
  var homeCamera = new THREE.PerspectiveCamera(35, 200 / 260, 0.01, 50);
  homeCamera.position.set(0, 0.05, 1.6);
  homeCamera.lookAt(new THREE.Vector3(0, 0.05, 0));

  if (isShallow) {
    // Minimal lighting for weak GPUs — one ambient + one directional
    homeScene.add(new THREE.AmbientLight(0x333333, 1.0));
    var hKey = new THREE.DirectionalLight(0xffffff, 1.2);
    hKey.position.set(1, 2, 2);
    homeScene.add(hKey);
  } else {
    homeScene.add(new THREE.AmbientLight(0x1a1a1a, 1.0));
    var hKey = new THREE.DirectionalLight(0xffffff, 1.0);
    hKey.position.set(1.5, 3, 2);
    homeScene.add(hKey);
    var hFill = new THREE.DirectionalLight(0x22e8a0, 0.3);
    hFill.position.set(-2, 0.5, -1);
    homeScene.add(hFill);
    var hRim = new THREE.PointLight(0x22e8a0, 0.5, 4);
    hRim.position.set(0, -0.3, 1.5);
    homeScene.add(hRim);
  }

  // ═══════════ CHAT RENDERER (skip on shallow to save VRAM) ═══════════

  var chatRenderer = null, chatScene = null, chatCamera = null;
  if (!isShallow && chatCanvas) {
    chatRenderer = new THREE.WebGLRenderer({
      canvas: chatCanvas, alpha: true, antialias: true
    });
    chatRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    chatScene = new THREE.Scene();
    chatCamera = new THREE.PerspectiveCamera(30, 1, 0.01, 50);
    chatCamera.position.set(0, 0.1, 1.4);
    chatCamera.lookAt(new THREE.Vector3(0, 0.1, 0));

    chatScene.add(new THREE.AmbientLight(0x1a1a1a, 0.8));
    var cKey = new THREE.DirectionalLight(0xffffff, 0.8);
    cKey.position.set(1, 2, 2);
    chatScene.add(cKey);
    var cRim = new THREE.PointLight(0x22e8a0, 0.3, 3);
    cRim.position.set(0, 0, 1.5);
    chatScene.add(cRim);
  }

  // ═══════════ LOAD MODEL ═══════════

  var mixers = [];
  var homeModel = null;
  var chatVisible = false;

  // Load tier-appropriate model
  // file:// blocks XHR — try agent backend (HTTP) first, then file:// fallback
  var glbFile = (window.letheTierConfig && window.letheTierConfig.glbFile)
    ? window.letheTierConfig.glbFile : 'mascot-shallow.glb';

  var httpBase = 'http://127.0.0.1:8080/static/';
  var fileBase = '';  // relative = same directory as HTML

  var loader = new THREE.GLTFLoader();

  function tryLoad(url, fallbackUrl) {
    loader.load(url, onLoaded, undefined, function() {
      if (fallbackUrl) {
        loader.load(fallbackUrl, onLoaded, undefined, onFail);
      } else {
        onFail();
      }
    });
  }

  function onFail() {
    // All loads failed — show PNG fallback
    homeCanvas.style.display = 'none';
    var img = document.createElement('img');
    img.src = 'mascot.png';
    img.style.cssText = 'width:100%;height:100%;object-fit:contain;';
    homeCanvas.parentElement.appendChild(img);
  }

  // Try HTTP first (works with XHR), fall back to file://
  tryLoad(httpBase + glbFile, fileBase + glbFile);

  function onLoaded(gltf) {
    homeModel = gltf.scene;
    homeScene.add(homeModel);

    // Clone for chat (skip on shallow)
    if (chatScene) chatScene.add(homeModel.clone());

    // Play all animations
    if (gltf.animations.length > 0) {
      var mixer = new THREE.AnimationMixer(homeModel);
      mixers.push(mixer);
      for (var i = 0; i < gltf.animations.length; i++) {
        mixer.clipAction(gltf.animations[i]).play();
      }
    }

    resizeHome();
    resizeChat();
  }

  // ═══════════ RESIZE ═══════════

  function resizeHome() {
    var w = homeCanvas.parentElement.clientWidth || 200;
    var h = homeCanvas.parentElement.clientHeight || 260;
    homeRenderer.setSize(w, h);
    homeCamera.aspect = w / h;
    homeCamera.updateProjectionMatrix();
  }

  function resizeChat() {
    if (!chatRenderer) return;
    chatRenderer.setSize(56, 56);
    chatCamera.aspect = 1;
    chatCamera.updateProjectionMatrix();
  }

  window.addEventListener('resize', function() {
    resizeHome(); resizeChat();
  });

  // ═══════════ GYROSCOPE ═══════════

  var gyroActive = false, gyroBeta0 = 0, gyroGamma0 = 0;

  function onOrientation(e) {
    if (e.beta === null || !homeModel) return;
    if (!gyroActive) { gyroActive = true; gyroBeta0 = e.beta; gyroGamma0 = e.gamma; }
    homeModel.rotation.x = Math.max(-0.12, Math.min(0.12, (e.beta - gyroBeta0) * 0.005));
    homeModel.rotation.y = Math.max(-0.12, Math.min(0.12, (e.gamma - gyroGamma0) * 0.005));
  }

  if (typeof DeviceOrientationEvent !== 'undefined') {
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      document.addEventListener('touchstart', function req() {
        DeviceOrientationEvent.requestPermission().then(function(r) {
          if (r === 'granted') window.addEventListener('deviceorientation', onOrientation);
        }).catch(function() {});
        document.removeEventListener('touchstart', req);
      }, { once: true });
    } else {
      window.addEventListener('deviceorientation', onOrientation);
    }
  }

  // ═══════════ RENDER LOOP ═══════════

  var clock = new THREE.Clock();

  var elapsed = 0;

  function animate() {
    requestAnimationFrame(animate);
    var dt = clock.getDelta();
    elapsed += dt;
    for (var i = 0; i < mixers.length; i++) mixers[i].update(dt);

    // Idle animation when no embedded anims: gentle sway + breathe
    if (homeModel && mixers.length === 0 && !gyroActive) {
      homeModel.rotation.y = Math.sin(elapsed * 0.4) * 0.06;
      homeModel.rotation.x = Math.sin(elapsed * 0.25) * 0.02;
      homeModel.scale.setScalar(1 + Math.sin(elapsed * 0.7) * 0.008);
    }

    homeRenderer.render(homeScene, homeCamera);
    if (chatVisible && chatRenderer) chatRenderer.render(chatScene, chatCamera);
  }
  animate();

  // ═══════════ API ═══════════

  window.mascot3D = {
    setChatVisible: function(v) { chatVisible = v; }
  };

})();
