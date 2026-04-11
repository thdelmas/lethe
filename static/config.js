/* LETHE Config Manager — single source of truth on /persist.
 * Reads/writes via NativeLauncher.loadConfig()/saveConfig().
 * All provider keys, models, and preferences flow through here.
 * No localStorage for anything that must survive burner wipes. */

var letheConfig = null;

function reloadConfig() {
  if (typeof NativeLauncher !== 'undefined' && NativeLauncher.loadConfig) {
    try {
      letheConfig = JSON.parse(NativeLauncher.loadConfig());
    } catch (e) {
      console.log('LETHE config: parse error, using defaults');
      letheConfig = defaultConfig();
    }
  } else {
    /* No Java bridge (desktop testing) — fall back to localStorage */
    try {
      var raw = localStorage.getItem('lethe_config');
      letheConfig = raw ? JSON.parse(raw) : defaultConfig();
    } catch (e) {
      letheConfig = defaultConfig();
    }
  }
  rebuildProviders();
}

function persistConfig() {
  if (!letheConfig) return;
  var json = JSON.stringify(letheConfig);
  if (typeof NativeLauncher !== 'undefined' && NativeLauncher.saveConfig) {
    var result = NativeLauncher.saveConfig(json);
    if (result !== 'ok') console.log('LETHE config save: ' + result);
  } else {
    localStorage.setItem('lethe_config', json);
  }
  rebuildProviders();
}

function defaultConfig() {
  return {
    version: 1,
    active_provider: null,
    providers: {
      local: { endpoint: 'http://127.0.0.1:8080', key: null, model: null },
      anthropic: { endpoint: 'https://api.anthropic.com',
        key: null, model: 'claude-sonnet-4-6' },
      openrouter: { endpoint: 'https://openrouter.ai/api/v1',
        key: null, model: 'anthropic/claude-sonnet-4-6' },
      custom: { endpoint: '', key: null, model: null }
    }
  };
}

/* Build the providers array that chatRequest() uses */
var providers = [];

function rebuildProviders() {
  if (!letheConfig) return;
  var cfg = letheConfig.providers;
  providers = [
    { name: 'local', endpoint: cfg.local.endpoint || 'http://127.0.0.1:8080',
      format: 'openai', needsKey: false,
      key: cfg.local.key, model: cfg.local.model },
    { name: 'anthropic', endpoint: cfg.anthropic.endpoint || 'https://api.anthropic.com',
      format: 'anthropic', needsKey: true,
      key: cfg.anthropic.key, model: cfg.anthropic.model || 'claude-sonnet-4-6' },
    { name: 'openrouter', endpoint: cfg.openrouter.endpoint || 'https://openrouter.ai/api/v1',
      format: 'openai', needsKey: true,
      key: cfg.openrouter.key, model: cfg.openrouter.model || 'anthropic/claude-sonnet-4-6' },
    { name: 'custom', endpoint: cfg.custom.endpoint || '',
      format: 'openai', needsKey: false,
      key: cfg.custom.key, model: cfg.custom.model }
  ];
}

function getProvider() {
  if (!letheConfig) return null;
  /* If user explicitly selected a provider, try it first */
  if (letheConfig.active_provider) {
    var p = resolveProvider(letheConfig.active_provider);
    if (p) return p;
  }
  /* Auto: local first if online, then cloud in order */
  var order = ['local', 'anthropic', 'openrouter', 'custom'];
  for (var i = 0; i < order.length; i++) {
    var r = resolveProvider(order[i]);
    if (r) return r;
  }
  return null;
}

function resolveProvider(name) {
  for (var i = 0; i < providers.length; i++) {
    if (providers[i].name !== name) continue;
    var p = providers[i];
    if (p.name === 'local' && !agentAvailable) return null;
    if (p.needsKey && !p.key) return null;
    if (!p.endpoint) return null;
    return p;
  }
  return null;
}

/* Adaptive max_tokens — reduces if provider rejects */
var maxTokensAdaptive = {};

function maxTokensFor(p) {
  if (maxTokensAdaptive[p.name]) return maxTokensAdaptive[p.name];
  return p.name === 'local' ? 1024 : 512;
}

/* Parse API errors into user-friendly messages */
function parseApiError(provider, err) {
  var status = err.status || 0;
  var msg = err.message || 'Unknown error';
  var r = { userMessage: '', suggestion: '', retryable: false };

  if (status === 401) {
    r.userMessage = provider.name + ': invalid API key.';
    r.suggestion = 'Check your key in /settings.';
    r.retryable = true;
  } else if (status === 402) {
    r.userMessage = provider.name + ': insufficient credits.';
    r.suggestion = 'Add credits or use a different provider.';
    r.retryable = true;
  } else if (status === 429) {
    r.userMessage = provider.name + ': rate limited. Wait a moment.';
    r.retryable = true;
  } else if (status === 400 && msg.toLowerCase().indexOf('max_tokens') >= 0) {
    r.userMessage = provider.name + ': reducing response length...';
    maxTokensAdaptive[provider.name] =
      Math.max(256, Math.floor((maxTokensAdaptive[provider.name] || 2048) / 2));
    r.retryable = true;
  } else if (status >= 500) {
    r.userMessage = provider.name + ' is down.';
    r.retryable = true;
  } else {
    r.userMessage = provider.name + ': ' + msg;
    r.retryable = status >= 400;
  }
  return r;
}

/* Load on startup */
reloadConfig();
