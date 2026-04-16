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

  /* ── Peer Network toggle ── */
  var peerSection = document.createElement('div');
  peerSection.className = 'settings-provider';
  var p2pEnabled = letheConfig && letheConfig.p2p_enabled;
  var peerStatusDot = p2pEnabled ?
    '<span class="status-dot status-on"></span>' :
    '<span class="status-dot status-off"></span>';
  peerSection.innerHTML =
    '<div class="settings-prov-header">' + peerStatusDot +
    '<strong>Peer Network</strong></div>' +
    '<div class="settings-prov-desc">' +
    'Share inference with nearby LETHE devices over LAN. ' +
    'No data leaves the local network. Only the current prompt is sent — ' +
    'no conversation history or memory is shared.</div>' +
    '<label class="settings-toggle">' +
    '<input type="checkbox" id="p2p-toggle"' + (p2pEnabled ? ' checked' : '') + '/>' +
    ' Enable peer inference (mDNS discovery)</label>' +
    '<div id="peer-status" class="settings-prov-desc" style="margin-top:0.3rem"></div>';
  container.appendChild(peerSection);

  /* Check peer sidecar health if enabled */
  if (p2pEnabled) {
    fetch('http://127.0.0.1:8080/v1/peers/health')
      .then(function(r) { return r.json(); })
      .then(function(d) {
        var el = document.getElementById('peer-status');
        if (el && d.status === 'ok') {
          el.textContent = 'Sidecar running. ' + (d.peer_count || 0) + ' peer(s) discovered.';
          el.style.color = 'var(--accent)';
        }
      })
      .catch(function() {
        var el = document.getElementById('peer-status');
        if (el) { el.textContent = 'Sidecar not running.'; el.style.color = '#888'; }
      });
  }

  var p2pToggle = document.getElementById('p2p-toggle');
  if (p2pToggle) {
    p2pToggle.addEventListener('change', function() {
      if (letheConfig) {
        letheConfig.p2p_enabled = p2pToggle.checked;
        persistConfig();
        /* Set Android system property to start/stop the sidecar */
        if (typeof NativeLauncher !== 'undefined' && NativeLauncher.setSystemProp) {
          NativeLauncher.setSystemProp('persist.lethe.p2p.enabled',
            p2pToggle.checked ? 'true' : 'false');
        }
      }
    });
  }

  var providerDefs = [
    { name: 'local', label: 'Local (on-device)',
      desc: 'Runs on this phone. Fully offline. No data leaves the device.',
      needsKey: false, needsEndpoint: false },
    { name: 'anthropic', label: 'Anthropic',
      desc: 'Claude models. Requires an API key from console.anthropic.com',
      privacy: 'https://www.anthropic.com/privacy',
      needsKey: true, keyHint: 'sk-ant-...', needsEndpoint: false },
    { name: 'openrouter', label: 'OpenRouter',
      desc: 'Access many models with one key. openrouter.ai',
      privacy: 'https://openrouter.ai/privacy',
      needsKey: true, keyHint: 'sk-or-...', needsEndpoint: false },
    { name: 'custom', label: 'Custom endpoint',
      desc: 'Any OpenAI-compatible API.',
      needsKey: false, needsEndpoint: true }
  ];

  for (var i = 0; i < providerDefs.length; i++) {
    var def = providerDefs[i];
    var section = document.createElement('div');
    section.className = 'settings-provider';

    var pc = letheConfig ? letheConfig.providers[def.name] : null;
    var hasKey = def.needsKey && pc ? pc.key : null;
    var hasEndpoint = def.needsEndpoint && pc ? pc.endpoint : null;
    var isLocal = def.name === 'local';
    var configured = isLocal || !!hasKey || !!hasEndpoint;

    var statusDot = configured ?
      '<span class="status-dot status-on"></span>' :
      '<span class="status-dot status-off"></span>';

    var privacyLink = def.privacy ?
      ' <a href="' + def.privacy + '" target="_blank" ' +
      'style="color:var(--accent);font-size:0.6rem">[privacy policy]</a>' : '';
    var html = '<div class="settings-prov-header">' +
      statusDot + '<strong>' + def.label + '</strong></div>' +
      '<div class="settings-prov-desc">' + def.desc + privacyLink + '</div>';

    section.innerHTML = html;
    container.appendChild(section);

    /* Create inputs via DOM API (not innerHTML) to prevent XSS from
       stored keys/endpoints injected via QR pairing. */
    if (def.needsKey) {
      var keyInput = document.createElement('input');
      keyInput.className = 'settings-input';
      keyInput.type = 'password';
      keyInput.setAttribute('data-provider', def.name);
      keyInput.setAttribute('data-field', 'key');
      keyInput.placeholder = def.keyHint || 'API key';
      keyInput.setAttribute('aria-label', def.label + ' API key');
      keyInput.value = (pc && pc.key) || '';
      section.appendChild(keyInput);
    }

    if (def.needsEndpoint) {
      var epInput = document.createElement('input');
      epInput.className = 'settings-input';
      epInput.type = 'url';
      epInput.setAttribute('data-provider', 'custom');
      epInput.setAttribute('data-field', 'endpoint');
      epInput.placeholder = 'https://your-server.com/v1';
      epInput.setAttribute('aria-label', 'Custom endpoint URL');
      epInput.value = (pc && pc.endpoint) || '';
      section.appendChild(epInput);
    }

    // Model selector
    var models = modelCatalog[def.name] || [];
    if (models.length) {
      var savedModel = (pc && pc.model) || '';
      var select = document.createElement('select');
      select.className = 'settings-input settings-model';
      select.setAttribute('data-provider', def.name);
      select.setAttribute('data-field', 'model');
      select.setAttribute('aria-label', def.label + ' model');
      for (var j = 0; j < models.length; j++) {
        var opt = document.createElement('option');
        opt.value = models[j].id;
        opt.textContent = models[j].label;
        if (models[j].id === savedModel) opt.selected = true;
        select.appendChild(opt);
      }
      section.appendChild(select);
    }
  }
}

/* ═══════════ CLOUD CONSENT (EU AI Act Art. 50) ═══════════ */
var cloudConsentMessages = {
  anthropic: 'Your messages will be sent to Anthropic servers for processing. Anthropic may process your data per their usage policy.',
  openrouter: 'Your messages will be sent to OpenRouter servers and routed to third-party model providers.',
  custom: 'Your messages will be sent to the external endpoint you configure.'
};

function needsCloudConsent(provName) {
  if (provName === 'local') return false;
  if (letheConfig && letheConfig['consent_' + provName]) return false;
  return true;
}

function showCloudConsent(provName, onAccept) {
  var overlay = document.createElement('div');
  overlay.className = 'consent-overlay';
  var msg = cloudConsentMessages[provName] ||
    'Your messages will be sent to external servers for processing.';
  overlay.innerHTML =
    '<div class="consent-dialog">' +
    '<div class="consent-title">Data leaves this device</div>' +
    '<div class="consent-body">' + msg +
    '<br><br>Conversations are not stored on this device by default (burner mode). ' +
    'But the cloud provider receives your messages while the session is active.' +
    '<br><br>You can switch to Local Only at any time in Settings.</div>' +
    '<div class="consent-actions">' +
    '<button class="dev-btn consent-cancel">Cancel</button>' +
    '<button class="dev-btn consent-accept">I understand</button>' +
    '</div></div>';
  document.body.appendChild(overlay);
  overlay.querySelector('.consent-cancel').addEventListener('click', function() {
    overlay.remove();
  });
  overlay.querySelector('.consent-accept').addEventListener('click', function() {
    if (letheConfig) { letheConfig['consent_' + provName] = true; persistConfig(); }
    overlay.remove();
    onAccept();
  });
}

/* ═══════════ SAVE ALL ═══════════ */
function doSave() {
  if (!letheConfig) letheConfig = defaultConfig();
  var inputs = document.querySelectorAll('.settings-input');
  for (var i = 0; i < inputs.length; i++) {
    var inp = inputs[i];
    var prov = inp.getAttribute('data-provider');
    var field = inp.getAttribute('data-field');
    var val = inp.value.trim();
    if (!letheConfig.providers[prov]) letheConfig.providers[prov] = {};
    if (field === 'key') letheConfig.providers[prov].key = val || null;
    if (field === 'endpoint') letheConfig.providers[prov].endpoint = val;
    if (field === 'model' && val) letheConfig.providers[prov].model = val;
  }
  persistConfig(); /* writes to /persist + rebuilds providers array */

  setStatus.textContent = 'saved';
  setTimeout(function() { setStatus.textContent = ''; }, 2000);

  /* Refresh settings UI to update status dots */
  settingsLoad();
}

document.getElementById('set-save').addEventListener('click', function() {
  /* Check if any NEW cloud provider keys were entered that need consent */
  var inputs = document.querySelectorAll('.settings-input[data-field="key"]');
  var needConsent = null;
  for (var i = 0; i < inputs.length; i++) {
    var prov = inputs[i].getAttribute('data-provider');
    var val = inputs[i].value.trim();
    var hadKey = letheConfig && letheConfig.providers[prov] && letheConfig.providers[prov].key;
    if (val && !hadKey && needsCloudConsent(prov)) {
      needConsent = prov;
      break;
    }
  }
  /* Also check custom endpoint */
  if (!needConsent) {
    var epInput = document.querySelector('.settings-input[data-field="endpoint"]');
    if (epInput) {
      var epVal = epInput.value.trim();
      var hadEp = letheConfig && letheConfig.providers.custom && letheConfig.providers.custom.endpoint;
      if (epVal && !hadEp && needsCloudConsent('custom')) {
        needConsent = 'custom';
      }
    }
  }

  if (needConsent) {
    showCloudConsent(needConsent, doSave);
  } else {
    doSave();
  }
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
    if (letheConfig && cfg.provider) {
      if (!letheConfig.providers[cfg.provider])
        letheConfig.providers[cfg.provider] = {};
      if (cfg.key) letheConfig.providers[cfg.provider].key = cfg.key;
      if (cfg.model) letheConfig.providers[cfg.provider].model = cfg.model;
      letheConfig.active_provider = cfg.provider;
      persistConfig();
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
