/**
 * LETHE Device Tier + Avatar Selection
 *
 * Tiers (named after root depth):
 *   "deeproot" — flagship, full 3D WebGL, 60fps
 *   "taproot"  — mid-range, 2D animated CSS or low-poly 3D, 30fps
 *   "shallow"  — old/weak, static or minimal 2D
 *
 * Avatar modes:
 *   "3d"     — WebGL GLB model
 *   "2d"     — PNG + CSS transforms + particles + glow
 *   "static" — PNG only
 *
 * Priority: user override > build-time tier > runtime detection
 *
 * User override: localStorage
 *   lethe_avatar_tier  = "3d" | "2d" | "static" | "auto"
 *   lethe_device_tier  = "deeproot" | "taproot" | "shallow" | "auto"
 *
 * Settings API:
 *   letheSetAvatarTier("3d" | "2d" | "static" | "auto")
 *   letheSetDeviceTier("deeproot" | "taproot" | "shallow" | "auto")
 *   letheGetTierInfo() → { device, avatar, ram, cores, gpu }
 */

(function() {
  'use strict';

  // ═══════════ DEVICE TIER ═══════════

  var savedDevice = localStorage.getItem('lethe_device_tier') || 'auto';
  var deviceTier;

  if (savedDevice !== 'auto') {
    deviceTier = savedDevice;
  } else {
    deviceTier = detectDeviceTier();
  }

  // ═══════════ AVATAR MODE ═══════════

  var savedAvatar = localStorage.getItem('lethe_avatar_tier') || 'auto';
  var avatarMode;

  if (savedAvatar !== 'auto') {
    avatarMode = savedAvatar;
  } else {
    avatarMode = tierToAvatar(deviceTier);
  }

  // Reduced motion always overrides to static
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    if (savedAvatar === 'auto') avatarMode = 'static';
  }

  // ═══════════ TIER CONFIG ═══════════

  var tierConfig = {
    deeproot: {
      animFps: 60, particles: 6, gyroscope: true,
      clockInterval: 10000, agentCheck: 15000, chatHistory: 200,
      glbFile: 'lethe-3d.glb'            // Full model, 12 bone anims
    },
    taproot: {
      animFps: 30, particles: 3, gyroscope: true,
      clockInterval: 10000, agentCheck: 30000, chatHistory: 50,
      glbFile: 'mascot-taproot.glb'     // 8MB, same mesh, 12 bone anims, 1024px
    },
    shallow: {
      animFps: 0, particles: 0, gyroscope: false,
      clockInterval: 30000, agentCheck: 60000, chatHistory: 20,
      glbFile: 'mascot-shallow.glb'     // 3MB, 19K verts, no skeleton, JS idle anim
    }
  };

  var config = tierConfig[deviceTier] || tierConfig.taproot;

  // ═══════════ APPLY ═══════════

  applyAvatar(avatarMode);

  // Force override (set in HTML before this script loads)
  if (window.letheTierForce) {
    avatarMode = window.letheTierForce;
    applyAvatar(avatarMode);
  }

  // Export
  window.letheTier = avatarMode;        // Backwards compat for launcher.html
  window.letheDeviceTier = deviceTier;
  window.letheTierConfig = config;
  console.log('LETHE tier: device=' + deviceTier + ' avatar=' + avatarMode + ' gpu=' + getGPU());

  window.letheSetAvatarTier = function(t) {
    localStorage.setItem('lethe_avatar_tier', t);
    location.reload();
  };

  window.letheSetDeviceTier = function(t) {
    localStorage.setItem('lethe_device_tier', t);
    localStorage.setItem('lethe_avatar_tier', 'auto'); // re-derive avatar
    location.reload();
  };

  window.letheGetTierInfo = function() {
    return {
      device: deviceTier,
      avatar: avatarMode,
      ram: navigator.deviceMemory || '?',
      cores: navigator.hardwareConcurrency || '?',
      gpu: getGPU(),
      config: config
    };
  };

  // ═══════════ DETECTION ═══════════

  function detectDeviceTier() {
    var mem = navigator.deviceMemory || 0; // GB, 0 if unsupported
    var cores = navigator.hardwareConcurrency || 0;
    var gpu = getGPU().toLowerCase();

    // Known weak GPUs → shallow
    var weakGPU = /mali-4|mali-300|mali-t6|adreno 2|adreno 30[0-5]|sgx 5|powervr sgx|vivante/i;
    if (weakGPU.test(gpu)) return 'shallow';

    // Memory-based (deviceMemory reports in GB, capped at 8)
    if (mem > 0 && mem < 3) return 'shallow';
    if (mem >= 8) return 'deeproot';

    // Core count fallback (old browsers don't report memory)
    if (cores > 0 && cores < 4) return 'shallow';
    if (cores >= 8 && !weakGPU.test(gpu)) return 'deeproot';

    // Strong GPU names → deeproot
    var strongGPU = /adreno 6[4-9]|adreno 7|mali-g7[1-9]|mali-g8|xclipse|immortalis/i;
    if (strongGPU.test(gpu)) return 'deeproot';

    // Default: taproot (safe middle ground)
    return 'taproot';
  }

  function tierToAvatar(tier) {
    // All tiers try 3D first (each has its own LOD GLB).
    // Fall back to 2D (animated WebP) if WebGL is broken.
    // 2D works on any device — it's just an <img> tag.
    if (canWebGL()) return '3d';
    return '2d';
  }

  function canWebGL() {
    try {
      var c = document.createElement('canvas');
      var gl = c.getContext('webgl') || c.getContext('experimental-webgl');
      if (!gl) return false;
      // Test actual draw capability: try rendering a 1-triangle scene
      var vs = gl.createShader(gl.VERTEX_SHADER);
      gl.shaderSource(vs, 'attribute vec2 p;void main(){gl_Position=vec4(p,0,1);}');
      gl.compileShader(vs);
      var fs = gl.createShader(gl.FRAGMENT_SHADER);
      gl.shaderSource(fs, 'void main(){gl_FragColor=vec4(1);}');
      gl.compileShader(fs);
      var prog = gl.createProgram();
      gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
      // Check OES_element_index_uint — required for any non-trivial model
      var hasUint32 = !!gl.getExtension('OES_element_index_uint');
      // Check max texture size (need at least 1024 for decent quality)
      var maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 0;
      // Check framebuffer completeness
      gl.useProgram(prog);
      var err = gl.getError();
      gl.deleteProgram(prog); gl.deleteShader(vs); gl.deleteShader(fs);
      // Must have uint32 indices, decent textures, and no errors
      return hasUint32 && maxTex >= 1024 && err === gl.NO_ERROR;
    } catch (e) {
      return false;
    }
  }

  function getGPU() {
    try {
      var c = document.createElement('canvas');
      var gl = c.getContext('webgl') || c.getContext('experimental-webgl');
      if (!gl) return 'unknown';
      var ext = gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
    } catch (e) {
      return 'unknown';
    }
  }

  // ═══════════ UI APPLY ═══════════

  function applyAvatar(mode) {
    var el3d = document.querySelector('.mascot-3d');
    var el2d = document.querySelector('.mascot-2d');
    var elStatic = document.querySelector('.mascot-static');
    var chat3d = document.querySelector('.chat-3d');
    var chat2d = document.querySelector('.chat-2d');

    if (el3d) el3d.style.display = (mode === '3d') ? 'block' : 'none';
    if (el2d) el2d.style.display = (mode === '2d') ? 'block' : 'none';
    if (elStatic) elStatic.style.display = (mode === 'static') ? 'block' : 'none';
    if (chat3d) chat3d.style.display = (mode === '3d') ? 'block' : 'none';
    if (chat2d) chat2d.style.display = (mode !== '3d') ? 'block' : 'none';

    // Hide particles on shallow tier
    if (deviceTier === 'shallow') {
      var sparks = document.querySelectorAll('.spark');
      for (var i = 0; i < sparks.length; i++) sparks[i].style.display = 'none';
    }

    document.body.setAttribute('data-avatar-tier', mode);
    document.body.setAttribute('data-device-tier', deviceTier);
  }

})();
