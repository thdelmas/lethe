/* LETHE Settings panel — provider/model configuration + burner warning.
 * Loaded after launcher.js. Reads/writes localStorage keys that
 * launcher.js provider array already consumes. */

/* ═══════════ MODEL CATALOG ═══════════
 * Mirrors providers.yaml. Local models are auto-detected by the
 * backend; cloud models are listed here for the selector. */
var modelCatalog = {
  local: [],  /* populated by /v1/models when agent is online */
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
  ],
  custom: []
};

/* ═══════════ DOM ═══════════ */
var settingsPanel = document.getElementById('settings-panel');
var setProvider = document.getElementById('set-provider');
var setModel = document.getElementById('set-model');
var setKey = document.getElementById('set-key');
var setEndpoint = document.getElementById('set-endpoint');
var setKeySection = document.getElementById('set-key-section');
var setEndpointSection = document.getElementById('set-endpoint-section');
var setModelSection = document.getElementById('set-model-section');
var setStatus = document.getElementById('set-status');

/* ═══════════ OPEN / CLOSE ═══════════ */
function settingsOpen() {
  settingsPanel.style.display = 'block';
  settingsLoad();
}
function settingsClose() {
  settingsPanel.style.display = 'none';
}

document.getElementById('settings-close').addEventListener('click', settingsClose);

/* ═══════════ LOAD CURRENT VALUES ═══════════ */
function settingsLoad() {
  /* Determine active provider from stored keys */
  var active = localStorage.getItem('lethe_active_provider') || 'local';
  setProvider.value = active;
  settingsUpdateUI(active);
}

function settingsUpdateUI(prov) {
  /* Key field */
  var needsKey = (prov === 'anthropic' || prov === 'openrouter');
  setKeySection.style.display = needsKey ? 'block' : 'none';
  if (needsKey) {
    setKey.value = localStorage.getItem('lethe_key_' + prov) || '';
  }

  /* Endpoint field */
  setEndpointSection.style.display = (prov === 'custom') ? 'block' : 'none';
  if (prov === 'custom') {
    setEndpoint.value = localStorage.getItem('lethe_custom_endpoint') || '';
  }

  /* Model selector */
  var models = modelCatalog[prov] || [];
  setModelSection.style.display = models.length ? 'block' : 'none';
  setModel.innerHTML = '';
  var stored = localStorage.getItem('lethe_model_' + prov) || '';
  for (var i = 0; i < models.length; i++) {
    var opt = document.createElement('option');
    opt.value = models[i].id;
    opt.textContent = models[i].label;
    if (models[i].id === stored) opt.selected = true;
    setModel.appendChild(opt);
  }
}

setProvider.addEventListener('change', function() {
  settingsUpdateUI(this.value);
});

/* ═══════════ SAVE ═══════════ */
document.getElementById('set-save').addEventListener('click', function() {
  var prov = setProvider.value;
  localStorage.setItem('lethe_active_provider', prov);

  /* Save key */
  if (prov === 'anthropic' || prov === 'openrouter') {
    var key = setKey.value.trim();
    if (key) localStorage.setItem('lethe_key_' + prov, key);
  }

  /* Save endpoint */
  if (prov === 'custom') {
    localStorage.setItem('lethe_custom_endpoint', setEndpoint.value.trim());
  }

  /* Save model */
  var models = modelCatalog[prov] || [];
  if (models.length && setModel.value) {
    localStorage.setItem('lethe_model_' + prov, setModel.value);
  }

  /* Update live provider array (defined in launcher.js) */
  if (typeof providers !== 'undefined') {
    for (var i = 0; i < providers.length; i++) {
      var p = providers[i];
      if (p.name === 'anthropic') {
        p.key = localStorage.getItem('lethe_key_anthropic');
        p.model = localStorage.getItem('lethe_model_anthropic') || 'claude-sonnet-4-6';
      } else if (p.name === 'openrouter') {
        p.key = localStorage.getItem('lethe_key_openrouter');
        p.model = localStorage.getItem('lethe_model_openrouter') || 'anthropic/claude-sonnet-4-6';
      } else if (p.name === 'custom') {
        p.endpoint = localStorage.getItem('lethe_custom_endpoint') || '';
        p.key = localStorage.getItem('lethe_key_custom');
        p.model = localStorage.getItem('lethe_model_custom') || null;
      }
    }
  }

  setStatus.textContent = 'saved';
  setTimeout(function() { setStatus.textContent = ''; }, 2000);
});

/* ═══════════ FETCH LOCAL MODELS ═══════════ */
/* When agent is online, populate local model list from /v1/models */
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
    .catch(function() { /* agent offline — no local models */ });
}
fetchLocalModels();

/* ═══════════ BURNER MODE WARNING ═══════════
 * Shows a persistent banner when burner mode is active.
 * Checks the system property via the agent API, with a
 * localStorage fallback for offline/first-boot. */
var burnerBanner = document.getElementById('burner-banner');
var burnerDismissed = sessionStorage.getItem('lethe_burner_dismissed');

function showBurnerWarning() {
  if (burnerDismissed) return;
  burnerBanner.style.display = 'flex';
}

function hideBurnerWarning() {
  burnerBanner.style.display = 'none';
}

document.getElementById('burner-dismiss').addEventListener('click', function() {
  hideBurnerWarning();
  sessionStorage.setItem('lethe_burner_dismissed', '1');
  burnerDismissed = '1';
});

/* Check burner mode status */
function checkBurnerMode() {
  fetch('http://127.0.0.1:8080/api/device')
    .then(function(r) { return r.json(); })
    .then(function(d) {
      /* Agent reports burner mode state via device info */
      if (d.burner_mode || d.burner_enabled) {
        localStorage.setItem('lethe_burner_active', '1');
        showBurnerWarning();
      } else {
        localStorage.removeItem('lethe_burner_active');
        hideBurnerWarning();
      }
    })
    .catch(function() {
      /* Agent offline — use cached state. Burner is ON by default,
       * so assume active unless explicitly disabled. */
      if (localStorage.getItem('lethe_burner_active') !== '0') {
        showBurnerWarning();
      }
    });
}
checkBurnerMode();

/* Re-check after agent comes online (SSE reconnect) */
if (typeof EventSource !== 'undefined' && location.protocol !== 'file:') {
  try {
    var burnerSSE = new EventSource('/api/agent/state');
    burnerSSE.addEventListener('burner_changed', function(e) {
      try {
        var d = JSON.parse(e.data);
        if (d.enabled) { showBurnerWarning(); }
        else { hideBurnerWarning(); }
      } catch(_) {}
    });
  } catch(_) {}
}
