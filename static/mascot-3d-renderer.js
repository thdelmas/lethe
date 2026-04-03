/* LETHE 3D Avatar Renderer
 * Loads mascot-taproot.glb, plays animations, handles mood via CSS filter.
 * Runs only when letheTier === '3d'. */

(function() {
  var canvas = document.getElementById('mascot-canvas');
  if (!canvas || typeof THREE === 'undefined') return;

  var W = canvas.parentElement.clientWidth || 320;
  var H = canvas.parentElement.clientHeight || 320;

  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false, alpha: true });
  renderer.setSize(W, H);
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 2.0;

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(35, W / H, 0.01, 50);

  // Lighting
  scene.add(new THREE.AmbientLight(0x444444, 1.0));
  var keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
  keyLight.position.set(2, 3, 2);
  scene.add(keyLight);
  var fillLight = new THREE.DirectionalLight(0xcccccc, 0.8);
  fillLight.position.set(-2, 1, -1);
  scene.add(fillLight);

  // Inner lights
  var orbLight = new THREE.PointLight(0x22e8a0, 2.0, 0.8);
  scene.add(orbLight);
  var coreLight = new THREE.PointLight(0x22e8a0, 1.5, 0.6);
  scene.add(coreLight);
  var headLight = new THREE.PointLight(0x22e8a0, 1.0, 0.4);
  scene.add(headLight);

  var mixer = null;
  var currentAction = null;
  var animations = {};
  var modelScene = null;

  var loader = new THREE.GLTFLoader();
  loader.load('mascot-taproot.glb', function(gltf) {
    modelScene = gltf.scene;
    modelScene.rotation.y = 285 * Math.PI / 180;

    var box = new THREE.Box3().setFromObject(modelScene);
    var center = box.getCenter(new THREE.Vector3());
    var size = box.getSize(new THREE.Vector3());
    modelScene.position.x = -center.x;
    modelScene.position.z = -center.z;
    modelScene.position.y = -box.min.y;

    camera.position.set(0, size.y * 0.45, size.x * 2.5);
    camera.lookAt(0, size.y * 0.4, 0);

    orbLight.position.set(0, size.y * 0.55, 0.02);
    coreLight.position.set(0, size.y * 0.35, 0.02);
    headLight.position.set(0, size.y * 0.80, 0.02);

    scene.add(modelScene);

    mixer = new THREE.AnimationMixer(modelScene);

    // Index animations by name
    gltf.animations.forEach(function(clip) {
      animations[clip.name] = clip;
    });

    // Play idle by default
    playAnimation('idle');

    console.log('LETHE 3D: loaded, ' + gltf.animations.length + ' animations');
  });

  function playAnimation(name) {
    if (!mixer || !animations[name]) return;
    if (currentAction) currentAction.fadeOut(0.3);
    currentAction = mixer.clipAction(animations[name]);
    currentAction.reset().fadeIn(0.3).play();
  }

  // Mood CSS filter on the canvas
  var moodFilters = {
    green:  'hue-rotate(-60deg) saturate(2.0) brightness(1.3) contrast(1.0)',
    blue:   'hue-rotate(-30deg) saturate(1.5) brightness(1.3) contrast(1.0)',
    yellow: 'hue-rotate(160deg) saturate(2.5) brightness(1.5) contrast(1.0)',
    red:    'hue-rotate(-180deg) saturate(2.5) brightness(1.3) contrast(1.0)',
    purple: 'hue-rotate(80deg) saturate(1.5) brightness(1.0) contrast(1.0)',
    white:  'hue-rotate(0deg) saturate(0.1) brightness(1.5) contrast(1.0)'
  };

  function setMood(mood) {
    if (moodFilters[mood]) {
      canvas.style.filter = moodFilters[mood];
      canvas.style.transition = 'filter 0.8s ease';
    }
  }

  var clock = new THREE.Clock();
  function animate() {
    requestAnimationFrame(animate);
    var dt = clock.getDelta();
    var t = clock.getElapsedTime();

    if (mixer) mixer.update(dt);

    // Inner glow pulse
    var glow = 0.5 + 0.5 * Math.sin(t * Math.PI / 7.5);
    orbLight.intensity = 2.0 * (0.7 + 0.15 * glow);
    coreLight.intensity = 1.5 * (0.7 + 0.15 * glow);
    headLight.intensity = 1.0 * (0.7 + 0.15 * glow);

    renderer.render(scene, camera);
  }
  animate();

  // Export API
  window.mascot3D = {
    playAnimation: playAnimation,
    setMood: setMood,
    playByName: playAnimation,
    setSpeed: function(s) { if (mixer) mixer.timeScale = s; },
    setRotation: function(deg) { if (modelScene) modelScene.rotation.y = deg * Math.PI / 180; }
  };
})();
