/* LETHE Settings — provider & model configuration.
 * Two-section UX:
 *   1. Models — flat list of every provider/model with an enable toggle.
 *   2. API Keys — per-provider key entry.
 * The router picks model-per-task; users choose which models it may pick.
 * Source of truth for cloud models: docs/agent/providers.yaml. Keep in sync. */

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
    { id: 'meta-llama/llama-4-maverick', label: 'Llama 4 Maverick' },
    { id: 'meta-llama/llama-4-scout', label: 'Llama 4 Scout' },
    { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash' }
  ]
};

var providerMeta = {
  local:      { label: 'Local (on-device)',
                desc: 'Runs on this phone. Fully offline. No data leaves the device.',
                needsKey: false, needsEndpoint: false },
  anthropic:  { label: 'Anthropic',
                desc: 'Claude models. Key from console.anthropic.com',
                privacy: 'https://www.anthropic.com/privacy',
                needsKey: true, keyHint: 'sk-ant-...' },
  openrouter: { label: 'OpenRouter',
                desc: 'Access many models with one key. openrouter.ai',
                privacy: 'https://openrouter.ai/privacy',
                needsKey: true, keyHint: 'sk-or-...' },
  custom:     { label: 'Custom endpoint',
                desc: 'Any OpenAI-compatible API.',
                needsKey: false, needsEndpoint: true }
};

var settingsPanel = document.getElementById('settings-panel');
var setStatus = document.getElementById('set-status');

function settingsOpen() {
  settingsPanel.classList.remove('hidden');
  settingsLoad();
  fetchLocalModels();
}
function settingsClose() {
  settingsPanel.classList.add('hidden');
}

document.getElementById('settings-close').addEventListener('click', settingsClose);

/* A provider is "ready" if it can currently serve: local always, custom if
 * endpoint set, cloud if key present. Drives the per-model status chip. */
function providerReady(name) {
  if (!letheConfig) return false;
  if (name === 'local') return true;
  var pc = letheConfig.providers[name];
  if (!pc) return false;
  if (name === 'custom') return !!pc.endpoint;
  return !!pc.key;
}

function providerModelCount(name) {
  var models = modelCatalog[name] || [];
  var disabled = (letheConfig && letheConfig.disabled_models) || {};
  var enabled = 0;
  for (var i = 0; i < models.length; i++) {
    if (!disabled[name + '/' + models[i].id]) enabled++;
  }
  return { total: models.length, enabled: enabled };
}

/* ═══════════ RENDER SETTINGS ═══════════ */
function settingsLoad() {
  var container = document.getElementById('settings-providers');
  if (!container) return;
  container.innerHTML = '';

  renderPeerToggle(container);
  renderMeshToggle(container);
  renderModelsSection(container);
  renderKeysSection(container);
}

/* ── Mesh signaling toggle ── DMS transport only; not chat. */
function renderMeshToggle(container) {
  var section = document.createElement('div');
  section.className = 'settings-provider';
  var enabled = letheConfig && letheConfig.mesh_enabled;
  var dot = enabled ?
    '<span class="status-dot status-on"></span>' :
    '<span class="status-dot status-off"></span>';
  section.innerHTML =
    '<div class="settings-prov-header">' + dot +
    '<strong>Mesh signaling</strong> ' +
    '<span class="settings-prov-count">preview</span></div>' +
    '<div class="settings-prov-desc">' +
    "Dead man's switch transport over BLE. Broadcasts a 21-byte " +
    'liveness heartbeat to trusted LETHE devices in range. ' +
    '<strong>Not a chat — no messages, no voice, no files.</strong> ' +
    'For chat install Briar (offline / anonymous) or Molly-FOSS ' +
    '(Signal contacts) from F-Droid.</div>' +
    '<label class="settings-toggle">' +
    '<input type="checkbox" id="mesh-toggle"' +
    (enabled ? ' checked' : '') + '/>' +
    ' Enable mesh signaling</label>';
  container.appendChild(section);

  var toggle = document.getElementById('mesh-toggle');
  if (toggle) {
    toggle.addEventListener('change', function() {
      if (!letheConfig) return;
      letheConfig.mesh_enabled = toggle.checked;
      persistConfig();
      if (typeof NativeLauncher !== 'undefined' && NativeLauncher.setSystemProp) {
        NativeLauncher.setSystemProp('persist.lethe.mesh.enabled',
          toggle.checked ? 'true' : 'false');
      }
    });
  }
}

/* ── Peer Network toggle ── */
function renderPeerToggle(container) {
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
        if (typeof NativeLauncher !== 'undefined' && NativeLauncher.setSystemProp) {
          NativeLauncher.setSystemProp('persist.lethe.p2p.enabled',
            p2pToggle.checked ? 'true' : 'false');
        }
      }
    });
  }
}

/* ── Section 1: Models ── flat list of every provider/model ── */
function renderModelsSection(container) {
  var h = document.createElement('div');
  h.className = 'settings-section-h';
  h.textContent = 'Models';
  container.appendChild(h);

  var desc = document.createElement('div');
  desc.className = 'settings-desc';
  desc.textContent = 'LETHE picks the right model for each task from the ones you enable below.';
  container.appendChild(desc);

  var list = document.createElement('div');
  list.className = 'settings-model-list';
  container.appendChild(list);

  var order = ['local', 'anthropic', 'openrouter'];
  var disabled = (letheConfig && letheConfig.disabled_models) || {};

  for (var i = 0; i < order.length; i++) {
    var provName = order[i];
    var models = modelCatalog[provName] || [];
    var ready = providerReady(provName);

    if (provName === 'local' && !models.length) {
      var empty = document.createElement('div');
      empty.className = 'settings-model-row settings-model-empty';
      empty.textContent = 'Local — no models downloaded yet.';
      list.appendChild(empty);
      continue;
    }

    for (var j = 0; j < models.length; j++) {
      var m = models[j];
      var key = provName + '/' + m.id;
      var row = document.createElement('label');
      row.className = 'settings-model-row';

      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'settings-model-toggle';
      cb.checked = !disabled[key];
      cb.setAttribute('data-model-key', key);
      row.appendChild(cb);

      var text = document.createElement('span');
      text.className = 'settings-model-text';
      text.textContent = m.label;
      row.appendChild(text);

      var badge = document.createElement('span');
      badge.className = 'settings-model-badge';
      badge.textContent = providerMeta[provName] ? providerMeta[provName].label : provName;
      row.appendChild(badge);

      var chip = document.createElement('span');
      chip.className = 'settings-model-chip ' + (ready ? 'chip-ready' : 'chip-needs');
      chip.textContent = ready ? 'ready' : 'needs key';
      row.appendChild(chip);

      list.appendChild(row);
    }
  }
}

/* ── Section 2: API Keys ── per-provider key entry ── */
function renderKeysSection(container) {
  var h = document.createElement('div');
  h.className = 'settings-section-h';
  h.textContent = 'API Keys';
  container.appendChild(h);

  var desc = document.createElement('div');
  desc.className = 'settings-desc';
  desc.textContent = 'Enter keys once. Each unlocks its provider\'s models above.';
  container.appendChild(desc);

  var order = ['anthropic', 'openrouter', 'custom'];
  for (var i = 0; i < order.length; i++) {
    var name = order[i];
    var def = providerMeta[name];
    if (!def) continue;
    var pc = letheConfig ? letheConfig.providers[name] : null;
    var ready = providerReady(name);

    var section = document.createElement('div');
    section.className = 'settings-provider';

    var statusDot = ready ?
      '<span class="status-dot status-on"></span>' :
      '<span class="status-dot status-off"></span>';
    var privacyLink = def.privacy ?
      ' <a href="' + def.privacy + '" target="_blank" ' +
      'style="color:var(--accent);font-size:0.6rem">[privacy]</a>' : '';
    var counts = providerModelCount(name);
    var countText = counts.total ?
      ' <span class="settings-prov-count">' + counts.enabled + '/' + counts.total + ' models</span>' : '';

    section.innerHTML = '<div class="settings-prov-header">' +
      statusDot + '<strong>' + def.label + '</strong>' + countText + '</div>' +
      '<div class="settings-prov-desc">' + def.desc + privacyLink + '</div>';
    container.appendChild(section);

    /* Inputs via DOM API (not innerHTML) — prevents XSS from stored keys
       injected via QR pairing. */
    if (def.needsKey) {
      var keyInput = document.createElement('input');
      keyInput.className = 'settings-input';
      keyInput.type = 'password';
      keyInput.setAttribute('data-provider', name);
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
  }
  /* Model enable/disable toggles: store only the disabled set so absent
     = enabled, which keeps old configs working after upgrades. */
  var disabled = {};
  var toggles = document.querySelectorAll('.settings-model-toggle');
  for (var k = 0; k < toggles.length; k++) {
    var mk = toggles[k].getAttribute('data-model-key');
    if (mk && !toggles[k].checked) disabled[mk] = true;
  }
  letheConfig.disabled_models = disabled;
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
  scanBtn.addEventListener('click', function() {
    console.log('LETHE QR: scan tapped; letheQR=' + (typeof window.letheQR));
    if (window.letheQR && typeof window.letheQR.open === 'function') {
      window.letheQR.open(
        function(data) { onQRResult(data); },
        function(msg)  { console.log('LETHE QR: error ' + msg); onQRResult('ERROR:' + msg); },
        function()     { /* user cancelled */ }
      );
    } else if (typeof NativeLauncher !== 'undefined' && NativeLauncher.scanQR) {
      NativeLauncher.scanQR();
    } else {
      settingsClose();
      if (typeof addMessage === 'function') {
        addMessage('QR scanner unavailable on this device.', 'lethe');
      }
    }
  });
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
        /* Panel may be already open — re-render so the Models section
           shows newly-detected local models instead of the empty hint. */
        if (settingsPanel && !settingsPanel.classList.contains('hidden')) {
          settingsLoad();
        }
      }
    })
    .catch(function() {});
}
fetchLocalModels();

/* Burner mode warning moved to Android notification panel (BootReceiver) */
