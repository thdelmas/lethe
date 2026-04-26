/* LETHE Void Launcher — dev panel handlers + help/feedback wiring.
 *
 * Loaded after launcher.js, which queries the dev panel + clock and
 * defines devOpen/devClose. This file installs the per-control event
 * handlers (animation selector, sliders, mood/tier buttons), the help
 * & feedback buttons, the chat info/settings buttons, and the
 * updateDevInfo() function devOpen() calls. */

// Animation definitions for dev panel + sprite player speed lookup
var letheAnimations = [
  { name: 'idle',     speed: 200 },
  { name: 'warmup',   speed: 100 },
  { name: 'thinking', speed: 100 },
  { name: 'listening',speed: 100 },
  { name: 'speaking', speed: 100 },
  { name: 'nod',      speed: 80 },
  { name: 'deny',     speed: 80 },
  { name: 'wave',     speed: 100 },
  { name: 'alert',    speed: 60 },
  { name: 'confirm',  speed: 80 },
  { name: 'sleep',    speed: 200 },
  { name: 'wake',     speed: 100 }
];

// Animation selector
document.getElementById('dev-anim').addEventListener('change', function() {
  var name = this.value;
  var isIdle = (name === 'idle');
  var found = letheAnimations.filter(function(a) { return a.name === name; })[0];
  var spd = found ? found.speed : 100;
  SpritePlayer.play(name, { speed: spd, loop: isIdle });
  letheAnimPlaying = !isIdle;
  if (window.mascot3D && window.mascot3D.playByName) {
    window.mascot3D.playByName(name);
  }
});

// Speed slider
document.getElementById('dev-speed').addEventListener('input', function() {
  document.getElementById('dev-speed-val').textContent = this.value + 'x';
  if (window.mascot3D && window.mascot3D.setSpeed) {
    window.mascot3D.setSpeed(parseFloat(this.value));
  }
});

// Rotation slider
document.getElementById('dev-rot').addEventListener('input', function() {
  document.getElementById('dev-rot-val').textContent = this.value + '°';
  if (window.mascot3D && window.mascot3D.setRotation) {
    window.mascot3D.setRotation(parseFloat(this.value));
  }
});

// Mood selector — triggers glitch + color fade transition
document.getElementById('dev-mood').addEventListener('change', function() {
  letheSetMood(this.value);
});

// Tier buttons — highlight current tier
var tierBtns = document.getElementById('dev-panel').querySelectorAll('[data-tier]');
for (var i = 0; i < tierBtns.length; i++) {
  if (tierBtns[i].getAttribute('data-tier') === window.letheTier) {
    tierBtns[i].style.borderColor = 'var(--accent)';
    tierBtns[i].style.color = '#fff';
    tierBtns[i].setAttribute('aria-pressed', 'true');
  }
  tierBtns[i].addEventListener('click', function() {
    localStorage.setItem('lethe_avatar_tier', this.getAttribute('data-tier'));
    location.reload();
  });
}

/* ═══════════ HELP & FEEDBACK ═══════════ */
document.getElementById('btn-report-issue').addEventListener('click', function() {
  var tier = window.letheTier || 'unknown';
  var agent = window.agentAvailable ? 'online' : 'offline';
  var gpu = (window.letheTierConfig ? window.letheTierConfig.gpu : 'unknown');
  var webgl = !!document.createElement('canvas').getContext('webgl');
  var body = [
    '## Description',
    '',
    '<!-- Describe what happened and what you expected -->',
    '',
    '## Device info',
    '',
    '| Key | Value |',
    '|-----|-------|',
    '| Tier | ' + tier + ' |',
    '| GPU | ' + gpu + ' |',
    '| WebGL | ' + webgl + ' |',
    '| Agent | ' + agent + ' |',
    '| User-Agent | ' + navigator.userAgent + ' |',
    '| Screen | ' + screen.width + 'x' + screen.height + ' |'
  ].join('\n');
  var url = 'https://github.com/thdelmas/OSmosis/issues/new'
    + '?labels=bug,lethe'
    + '&title=' + encodeURIComponent('[LETHE] ')
    + '&body=' + encodeURIComponent(body);
  window.open(url, '_blank');
});

document.getElementById('btn-discord').addEventListener('click', function() {
  window.open('https://discord.gg/tAqyY47Szp', '_blank');
});

document.getElementById('btn-settings').addEventListener('click', function() {
  document.getElementById('dev-panel').style.display = 'none';
  if (typeof settingsOpen === 'function') settingsOpen();
});

/* Chat info button — AI transparency panel (EU AI Act Art. 4) */
var chatInfoBtn = document.getElementById('chat-info-btn');
var aiInfoPanel = document.getElementById('ai-info-panel');
if (chatInfoBtn && aiInfoPanel) {
  chatInfoBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    aiInfoPanel.style.display = 'block';
  });
  document.getElementById('ai-info-close').addEventListener('click', function() {
    aiInfoPanel.style.display = 'none';
  });
}

/* Chat settings button — opens provider settings directly */
var chatSettingsBtn = document.getElementById('chat-settings-btn');
if (chatSettingsBtn) {
  chatSettingsBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    console.log('LETHE: gear icon clicked');
    if (typeof settingsOpen === 'function') {
      settingsOpen();
    } else {
      console.log('LETHE: settingsOpen not defined');
    }
  });
}

function updateDevInfo() {
  var info = document.getElementById('dev-info');
  var tierInfo = document.getElementById('dev-tier-info');
  tierInfo.textContent = window.letheTier || '?';
  var lines = [
    'GPU: ' + (window.letheTierConfig ? window.letheTierConfig.gpu : '?'),
    'Tier: ' + (window.letheTier || '?'),
    'Agent: ' + (window.agentAvailable ? 'online' : 'offline'),
    'Boredom: ' + boredomState,
    'Anims: ' + (letheAnimations ? letheAnimations.length : 0),
    'WebGL: ' + (!!document.createElement('canvas').getContext('webgl'))
  ];
  info.textContent = lines.join('\n');
}
