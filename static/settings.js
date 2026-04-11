/* LETHE Settings — provider & model configuration.
 * All providers are shown at once. The system auto-routes per task:
 * local first, cloud fallback. Users just enter their keys. */

var modelCatalog = {
  local: [],
  anthropic: [
    { id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' }
  ],
  openrouter: [
    { id: 'anthropic/claude-opus-4-6', label: 'Claude Opus 4.6' },
    { id: 'anthropic/claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
    { id: 'qwen/qwen3-72b', label: 'Qwen 3 72B' },
    { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash' }
  ]
};

var settingsPanel = document.getElementById('settings-panel');
var setStatus = document.getElementById('set-status');

function settingsOpen() {
  settingsPanel.style.display = 'block';
  settingsLoad();
}
function settingsClose() {
  settingsPanel.style.display = 'none';
}

document.getElementById('settings-close').addEventListener('click', settingsClose);

/* ═══════════ RENDER ALL PROVIDERS ═══════════ */
function settingsLoad() {
  var container = document.getElementById('settings-providers');
  if (!container) return;
  container.innerHTML = '';

  var providerDefs = [
    { name: 'local', label: 'Local (on-device)',
      desc: 'Runs on this phone. Fully offline. No data leaves the device.',
      needsKey: false, needsEndpoint: false },
    { name: 'anthropic', label: 'Anthropic',
      desc: 'Claude models. Requires an API key from console.anthropic.com',
      needsKey: true, keyHint: 'sk-ant-...', needsEndpoint: false },
    { name: 'openrouter', label: 'OpenRouter',
      desc: 'Access many models with one key. openrouter.ai',
      needsKey: true, keyHint: 'sk-or-...', needsEndpoint: false },
    { name: 'custom', label: 'Custom endpoint',
      desc: 'Any OpenAI-compatible API.',
      needsKey: false, needsEndpoint: true }
  ];

  for (var i = 0; i < providerDefs.length; i++) {
    var def = providerDefs[i];
    var section = document.createElement('div');
    section.className = 'settings-provider';

    var hasKey = def.needsKey ?
      localStorage.getItem('lethe_key_' + def.name) : null;
    var hasEndpoint = def.needsEndpoint ?
      localStorage.getItem('lethe_custom_endpoint') : null;
    var isLocal = def.name === 'local';
    var configured = isLocal || !!hasKey || !!hasEndpoint;

    var statusDot = configured ?
      '<span class="status-dot status-on"></span>' :
      '<span class="status-dot status-off"></span>';

    var html = '<div class="settings-prov-header">' +
      statusDot + '<strong>' + def.label + '</strong></div>' +
      '<div class="settings-prov-desc">' + def.desc + '</div>';

    if (def.needsKey) {
      var savedKey = localStorage.getItem('lethe_key_' + def.name) || '';
      var maskedKey = savedKey ? savedKey.substring(0, 8) + '...' : '';
      html += '<input class="settings-input" type="password" ' +
        'data-provider="' + def.name + '" data-field="key" ' +
        'placeholder="' + (def.keyHint || 'API key') + '" ' +
        'value="' + savedKey + '"/>';
    }

    if (def.needsEndpoint) {
      var savedEndpoint = localStorage.getItem('lethe_custom_endpoint') || '';
      html += '<input class="settings-input" type="url" ' +
        'data-provider="custom" data-field="endpoint" ' +
        'placeholder="https://your-server.com/v1" ' +
        'value="' + savedEndpoint + '"/>';
    }

    // Model selector
    var models = modelCatalog[def.name] || [];
    if (models.length) {
      var savedModel = localStorage.getItem('lethe_model_' + def.name) || '';
      html += '<select class="settings-input settings-model" ' +
        'data-provider="' + def.name + '" data-field="model">';
      for (var j = 0; j < models.length; j++) {
        var sel = models[j].id === savedModel ? ' selected' : '';
        html += '<option value="' + models[j].id + '"' + sel + '>' +
          models[j].label + '</option>';
      }
      html += '</select>';
    }

    section.innerHTML = html;
    container.appendChild(section);
  }
}

/* ═══════════ SAVE ALL ═══════════ */
document.getElementById('set-save').addEventListener('click', function() {
  var inputs = document.querySelectorAll('.settings-input');
  for (var i = 0; i < inputs.length; i++) {
    var inp = inputs[i];
    var prov = inp.getAttribute('data-provider');
    var field = inp.getAttribute('data-field');
    var val = inp.value.trim();

    if (field === 'key' && val) {
      localStorage.setItem('lethe_key_' + prov, val);
    }
    if (field === 'endpoint') {
      localStorage.setItem('lethe_custom_endpoint', val);
    }
    if (field === 'model' && val) {
      localStorage.setItem('lethe_model_' + prov, val);
    }
  }

  /* Update live provider array */
  if (typeof providers !== 'undefined') {
    for (var j = 0; j < providers.length; j++) {
      var p = providers[j];
      if (p.name === 'anthropic') {
        p.key = localStorage.getItem('lethe_key_anthropic');
        p.model = localStorage.getItem('lethe_model_anthropic') ||
          'claude-sonnet-4-6';
      } else if (p.name === 'openrouter') {
        p.key = localStorage.getItem('lethe_key_openrouter');
        p.model = localStorage.getItem('lethe_model_openrouter') ||
          'anthropic/claude-sonnet-4-6';
      } else if (p.name === 'custom') {
        p.endpoint = localStorage.getItem('lethe_custom_endpoint') || '';
        p.key = localStorage.getItem('lethe_key_custom');
        p.model = localStorage.getItem('lethe_model_custom') || null;
      }
    }
  }

  setStatus.textContent = 'saved';
  setTimeout(function() { setStatus.textContent = ''; }, 2000);

  /* Refresh settings UI to update status dots */
  settingsLoad();
});

/* ═══════════ QR SCAN BUTTON ═══════════ */
var scanBtn = document.getElementById('set-scan-qr');
if (scanBtn) {
  console.log('LETHE: scan button bound');
  scanBtn.addEventListener('click', function() {
    console.log('LETHE: scan button clicked');
    if (typeof NativeLauncher !== 'undefined' && NativeLauncher.scanQR) {
      console.log('LETHE: calling NativeLauncher.scanQR()');
      NativeLauncher.scanQR();
    } else {
      console.log('LETHE: no NativeLauncher.scanQR');
      settingsClose();
      if (typeof addMessage === 'function') {
        addMessage('QR scanning needs a barcode scanner app. Install "Barcode Scanner" from F-Droid, then try again.', 'lethe');
      }
    }
  });
} else {
  console.log('LETHE: scan button NOT found');
}

/* ═══════════ QR CODE PAIRING ═══════════ */
/* Scan a QR from OSmosis to import provider + API key in one step.
 * QR payload: {"lethe_pair":true,"provider":"anthropic","key":"sk-...","model":"..."} */
function onQRResult(data) {
  if (data.indexOf('ERROR:') === 0) {
    if (typeof addMessage === 'function') {
      addMessage(data.substring(6), 'lethe');
    }
    return;
  }
  try {
    var cfg = JSON.parse(data);
    if (!cfg.lethe_pair) return;
    if (cfg.key) localStorage.setItem('lethe_key_' + cfg.provider, cfg.key);
    if (cfg.model) localStorage.setItem('lethe_model_' + cfg.provider, cfg.model);
    /* Update live providers */
    if (typeof providers !== 'undefined') {
      for (var i = 0; i < providers.length; i++) {
        if (providers[i].name === cfg.provider) {
          providers[i].key = cfg.key;
          if (cfg.model) providers[i].model = cfg.model;
        }
      }
    }
    settingsLoad();
    if (typeof addMessage === 'function') {
      addMessage('Paired with ' + cfg.provider + '. Ready to talk.', 'lethe');
    }
  } catch (e) {
    if (typeof addMessage === 'function') {
      addMessage('Could not read QR code.', 'lethe');
    }
  }
}

/* ═══════════ LOCAL MODEL DETECTION ═══════════ */
function fetchLocalModels() {
  fetch('http://127.0.0.1:8080/v1/models')
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (d.data) {
        modelCatalog.local = d.data.map(function(m) {
          return { id: m.id, label: m.id };
        });
      }
    })
    .catch(function() {});
}
fetchLocalModels();

/* ═══════════ BURNER MODE WARNING ═══════════ */
var burnerBanner = document.getElementById('burner-banner');
var burnerDismissed = sessionStorage.getItem('lethe_burner_dismissed');

document.getElementById('burner-dismiss').addEventListener('click', function() {
  burnerBanner.style.display = 'none';
  sessionStorage.setItem('lethe_burner_dismissed', '1');
  burnerDismissed = '1';
});

function checkBurnerMode() {
  if (burnerDismissed) return;
  fetch('http://127.0.0.1:8080/api/device')
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (d.burner_mode || d.burner_enabled) {
        localStorage.setItem('lethe_burner_active', '1');
        burnerBanner.style.display = 'flex';
      }
    })
    .catch(function() {
      if (localStorage.getItem('lethe_burner_active') !== '0') {
        burnerBanner.style.display = 'flex';
      }
    });
}
checkBurnerMode();
