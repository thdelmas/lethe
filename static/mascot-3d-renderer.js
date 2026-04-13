/* LETHE 3D Avatar Renderer
 * Loads mascot-taproot.glb, plays animations, handles mood via CSS filter.
 * Supports runtime retargeting of Mixamo FBX animations.
 * Runs only when letheTier === '3d'. */

(function() {
  var canvas = document.getElementById('mascot-canvas');
  if (!canvas || typeof THREE === 'undefined') return;

  /* Reduced motion: render a single static frame, skip animation loop */
  var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  var prefersStatic = reducedMotion && reducedMotion.matches;

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
  var restPose = {};
  var activeFBXRetarget = null;

  // Mixamo → LETHE bone mapping (FBXLoader strips the colon)
  var MIXAMO_TO_LETHE = {
    'mixamorigHips': 'Hip', 'mixamorigSpine': 'Waist',
    'mixamorigSpine1': 'Spine01', 'mixamorigSpine2': 'Spine02',
    'mixamorigNeck': 'NeckTwist01', 'mixamorigHead': 'Head',
    'mixamorigLeftUpLeg': 'L_Thigh', 'mixamorigLeftLeg': 'L_Calf',
    'mixamorigLeftFoot': 'L_Foot', 'mixamorigLeftToeBase': 'L_Foot',
    'mixamorigRightUpLeg': 'R_Thigh', 'mixamorigRightLeg': 'R_Calf',
    'mixamorigRightFoot': 'R_Foot', 'mixamorigRightToeBase': 'R_Foot',
    'mixamorigLeftShoulder': 'L_Clavicle', 'mixamorigLeftArm': 'L_Upperarm',
    'mixamorigLeftForeArm': 'L_Forearm', 'mixamorigLeftHand': 'L_Hand',
    'mixamorigRightShoulder': 'R_Clavicle', 'mixamorigRightArm': 'R_Upperarm',
    'mixamorigRightForeArm': 'R_Forearm', 'mixamorigRightHand': 'R_Hand'
  };

  // Bones that use world-rotation copy (arms have different local axes)
  var WORLD_COPY_BONES = ['L_Upperarm', 'L_Forearm', 'L_Hand',
                          'R_Upperarm', 'R_Forearm', 'R_Hand'];

  // Bone processing order (parent before child)
  var BONE_ORDER = ['mixamorigHips', 'mixamorigSpine', 'mixamorigSpine1', 'mixamorigSpine2',
    'mixamorigNeck', 'mixamorigHead',
    'mixamorigLeftShoulder', 'mixamorigLeftArm', 'mixamorigLeftForeArm', 'mixamorigLeftHand',
    'mixamorigRightShoulder', 'mixamorigRightArm', 'mixamorigRightForeArm', 'mixamorigRightHand',
    'mixamorigLeftUpLeg', 'mixamorigLeftLeg', 'mixamorigLeftFoot', 'mixamorigLeftToeBase',
    'mixamorigRightUpLeg', 'mixamorigRightLeg', 'mixamorigRightFoot', 'mixamorigRightToeBase'];

  // FBX scenes stored for runtime retargeting
  var fbxScenes = {};

  function setupRuntimeRetarget(fbxScene, clipName) {
    var mixamoBones = {};
    var mixamoRestLocal = {};
    fbxScene.traverse(function(node) {
      if (!node.isBone) return;
      mixamoBones[node.name] = node;
      mixamoRestLocal[node.name] = node.quaternion.clone();
    });

    var letheBones = {};
    modelScene.traverse(function(node) {
      if (node.isBone) letheBones[node.name] = node;
    });

    var fbxMixer = new THREE.AnimationMixer(fbxScene);
    var fbxAction = fbxMixer.clipAction(fbxScene.animations[0]);
    fbxAction.setLoop(THREE.LoopRepeat);
    fbxAction.play();

    activeFBXRetarget = {
      fbxScene: fbxScene,
      fbxMixer: fbxMixer,
      mixamoBones: mixamoBones,
      mixamoRestLocal: mixamoRestLocal,
      letheBones: letheBones,
      clipName: clipName
    };
  }

  function updateRuntimeRetarget(dt) {
    if (!activeFBXRetarget) return;
    var r = activeFBXRetarget;

    r.fbxMixer.update(dt);
    r.fbxScene.updateMatrixWorld(true);

    BONE_ORDER.forEach(function(mName) {
      var lName = MIXAMO_TO_LETHE[mName];
      var mBone = r.mixamoBones[mName];
      var lBone = r.letheBones[lName];
      if (!mBone || !lBone || !restPose[lName]) return;

      if (WORLD_COPY_BONES.indexOf(lName) !== -1) {
        // World rotation copy for arms
        var mWorldQ = new THREE.Quaternion();
        mBone.getWorldQuaternion(mWorldQ);
        var lParentWorldQ = new THREE.Quaternion();
        if (lBone.parent) lBone.parent.getWorldQuaternion(lParentWorldQ);
        lBone.quaternion.copy(lParentWorldQ.clone().invert().multiply(mWorldQ));
      } else {
        // Delta approach for torso/legs/head
        var mRest = r.mixamoRestLocal[mName];
        var delta = mRest.clone().invert().multiply(mBone.quaternion);
        lBone.quaternion.copy(restPose[lName].q.clone().multiply(delta));
      }
    });
    modelScene.updateMatrixWorld(true);
  }

  /** Load an external FBX and register for runtime retargeting */
  function loadAnimPack(url, callback) {
    if (typeof THREE.FBXLoader === 'undefined') {
      console.warn('LETHE 3D: FBXLoader not available');
      return;
    }
    var fbxLoader = new THREE.FBXLoader();
    fbxLoader.load(url, function(result) {
      var name = url.replace(/\.fbx$/i, '').replace(/^.*\//, '');
      fbxScenes[name] = result;
      animations[name] = { _fbxName: name, duration: result.animations[0].duration };
      console.log('LETHE 3D: loaded FBX ' + name);
      if (callback) callback(1);
    });
  }

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

    // Save rest pose
    modelScene.traverse(function(node) {
      if (node.isBone) {
        restPose[node.name] = {
          q: node.quaternion.clone(),
          p: node.position.clone()
        };
      }
    });

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
    if (!modelScene || !animations[name]) return;

    // Stop any active FBX retarget
    if (activeFBXRetarget) {
      activeFBXRetarget = null;
      // Restore rest pose before switching
      modelScene.traverse(function(node) {
        if (node.isBone && restPose[node.name]) {
          node.quaternion.copy(restPose[node.name].q);
          node.position.copy(restPose[node.name].p);
        }
      });
    }

    // FBX animation: use runtime retargeting
    var anim = animations[name];
    if (anim._fbxName && fbxScenes[anim._fbxName]) {
      if (currentAction) { currentAction.stop(); currentAction = null; }
      setupRuntimeRetarget(fbxScenes[anim._fbxName], anim._fbxName);
      return;
    }

    // GLB animation: use mixer
    if (!mixer) return;
    if (currentAction) currentAction.fadeOut(0.3);
    currentAction = mixer.clipAction(anim);
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

  /* ═══════════ RESPONSIVE CANVAS ═══════════ */
  function resizeCanvas() {
    var newW = canvas.parentElement.clientWidth || 320;
    var newH = canvas.parentElement.clientHeight || 320;
    if (newW === W && newH === H) return;
    W = newW; H = newH;
    renderer.setSize(W, H);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
  }

  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(resizeCanvas).observe(canvas.parentElement);
  } else {
    window.addEventListener('resize', resizeCanvas);
  }

  /* ═══════════ ANIMATE ═══════════ */
  var clock = new THREE.Clock();
  var prevGlow = -1;
  var glRendererLost = false;

  /* WebGL context loss recovery */
  canvas.addEventListener('webglcontextlost', function(e) {
    e.preventDefault();
    glRendererLost = true;
    console.warn('LETHE 3D: WebGL context lost');
  });
  canvas.addEventListener('webglcontextrestored', function() {
    glRendererLost = false;
    console.log('LETHE 3D: WebGL context restored');
  });

  function animate() {
    requestAnimationFrame(animate);
    if (glRendererLost) return;

    var dt = clock.getDelta();
    var t = clock.getElapsedTime();

    /* Reduced motion: render static pose, skip animation updates */
    if (!prefersStatic) {
      if (activeFBXRetarget) {
        updateRuntimeRetarget(dt);
      } else if (mixer) {
        mixer.update(dt);
      }

      // Inner glow pulse — skip update if intensity hasn't changed
      var glow = 0.5 + 0.5 * Math.sin(t * Math.PI / 7.5);
      var glowRound = Math.round(glow * 100);
      if (glowRound !== prevGlow) {
        prevGlow = glowRound;
        orbLight.intensity = 2.0 * (0.7 + 0.15 * glow);
        coreLight.intensity = 1.5 * (0.7 + 0.15 * glow);
        headLight.intensity = 1.0 * (0.7 + 0.15 * glow);
      }
    }

    try {
      renderer.render(scene, camera);
    } catch (e) {
      /* WebGL crash — stop loop, fall back to 2D */
      console.error('LETHE 3D: render error, falling back', e);
      if (window.letheSetAvatarTier) window.letheSetAvatarTier('2d');
      return;
    }
  }
  animate();

  /* Listen for reduced-motion changes at runtime */
  if (reducedMotion && reducedMotion.addEventListener) {
    reducedMotion.addEventListener('change', function(e) {
      prefersStatic = e.matches;
    });
  }

  // Export API — unified naming: playState (looping), playOnce (one-shot)
  window.mascot3D = {
    playAnimation: playAnimation,
    playState: playAnimation,
    playOnce: function(name) {
      if (!modelScene || !mixer || !animations[name]) return;
      var clip = animations[name];
      if (clip._fbxName) { playAnimation(name); return; }
      var action = mixer.clipAction(clip);
      action.reset().setLoop(THREE.LoopOnce, 1).clampWhenFinished = true;
      action.fadeIn(0.2).play();
      mixer.addEventListener('finished', function onDone(e) {
        if (e.action === action) {
          mixer.removeEventListener('finished', onDone);
          action.fadeOut(0.2);
        }
      });
    },
    setMood: setMood,
    playByName: playAnimation,
    setSpeechAmplitude: function(amp) {
      if (!orbLight) return;
      orbLight.intensity = 2.0 + amp * 3.0;
    },
    setSpeed: function(s) { if (mixer) mixer.timeScale = s; },
    setRotation: function(deg) { if (modelScene) modelScene.rotation.y = deg * Math.PI / 180; },
    loadAnimPack: loadAnimPack
  };
})();
