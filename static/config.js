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
  /* Fill in any providers added in newer versions so rebuildProviders
   * doesn't crash on a stale persisted config. */
  var def = defaultConfig();
  if (!letheConfig.providers) letheConfig.providers = {};
  for (var name in def.providers) {
    if (!letheConfig.providers[name]) {
      letheConfig.providers[name] = def.providers[name];
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
  /* Key set may have changed — refresh the router plan. */
  if (typeof refreshRouterPlan === 'function') refreshRouterPlan('chat');
}

function defaultConfig() {
  return {
    version: 1,
    active_provider: null,
    p2p_enabled: false,
    /* Empty means every known model is enabled. Entries are
       "<provider>/<model>": true — user-disabled models the router must skip. */
    disabled_models: {},
    providers: {
      local: { endpoint: 'http://127.0.0.1:8080', key: null, model: null },
      peer: { endpoint: 'http://127.0.0.1:8080', key: null, model: null },
      anthropic: { endpoint: 'https://api.anthropic.com',
        key: null, model: 'claude-sonnet-4-6' },
      openrouter: { endpoint: 'https://openrouter.ai/api/v1',
        key: null, model: 'anthropic/claude-sonnet-4-6' },
      custom: { endpoint: '', key: null, model: null }
    }
  };
}

function isModelDisabled(providerName, modelId) {
  if (!letheConfig || !letheConfig.disabled_models || !modelId) return false;
  return !!letheConfig.disabled_models[providerName + '/' + modelId];
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
    { name: 'peer', endpoint: cfg.peer.endpoint || 'http://127.0.0.1:8080',
      format: 'openai', needsKey: false, isPeer: true,
      key: cfg.peer.key, model: cfg.peer.model },
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
  /* Auto: local first, then peer network, then cloud in order */
  var order = ['local', 'peer', 'anthropic', 'openrouter', 'custom'];
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
    if (p.name === 'peer' && (!letheConfig || !letheConfig.p2p_enabled)) return null;
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

/* ── Task-based router ──────────────────────────────────────────────
 * Authoritative router lives in the Rust agent (POST /v1/route/plan).
 * We cache the plan per task so selection stays synchronous. Cache
 * refreshes whenever provider config changes (see settings save path).
 * If the agent is unreachable we silently fall back to getProvider(). */
var routerPlanCache = {};

function configuredCloudProviders() {
  var out = [];
  if (!letheConfig) return out;
  var cp = letheConfig.providers;
  if (cp.anthropic && cp.anthropic.key) out.push('anthropic');
  if (cp.openrouter && cp.openrouter.key) out.push('openrouter');
  return out;
}

function refreshRouterPlan(task, cb) {
  task = task || 'chat';
  var body = { task: task, configured_cloud: configuredCloudProviders() };
  fetch('http://127.0.0.1:8080/v1/route/plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).then(function(r) { return r.ok ? r.json() : null; })
    .then(function(d) {
      if (d && d.candidates) routerPlanCache[task] = d;
      if (cb) cb();
    }).catch(function() { if (cb) cb(); });
}

/* Full ordered candidate list for a task. Each candidate is a
 * frontend provider object (with model overridden from the plan).
 * Falls back to [getProvider()] if the plan cache is empty. */
function candidatesForTask(task) {
  var plan = routerPlanCache[task || 'chat'];
  var out = [];
  if (plan && plan.candidates) {
    var seen = {};
    for (var i = 0; i < plan.candidates.length; i++) {
      var c = plan.candidates[i];
      if (seen[c.provider]) continue;
      if (isModelDisabled(c.provider, c.model)) continue;
      var r = resolveProvider(c.provider);
      if (!r) continue;
      seen[c.provider] = true;
      var copy = {};
      for (var k in r) if (r.hasOwnProperty(k)) copy[k] = r[k];
      if (c.model) copy.model = c.model;
      out.push(copy);
    }
  }
  if (!out.length) {
    var fallback = getProvider();
    if (fallback) out.push(fallback);
  }
  return out;
}

/* Synchronous first-choice pick — the head of candidatesForTask(). */
function getProviderForTask(task) {
  var cands = candidatesForTask(task);
  return cands.length ? cands[0] : null;
}

/* Walk the candidate list, calling chatRequest() on each in order.
 * First success wins. On every attempt, onAttempt(p) is invoked so the
 * caller can update UI (status line, lastProvider). Resolves with
 * { result, provider } — the successful provider so tool-call
 * follow-ups stay with the same upstream. */
function chatRequestForTask(task, msgs, onAttempt) {
  var cands = candidatesForTask(task);
  if (!cands.length) return Promise.reject(new Error('no_provider'));
  var errors = [];
  function attempt(i) {
    if (i >= cands.length) {
      var e = new Error('all_failed');
      e.errors = errors;
      return Promise.reject(e);
    }
    var p = cands[i];
    if (onAttempt) onAttempt(p);
    return chatRequest(p, msgs).then(
      function(result) { return { result: result, provider: p }; },
      function(err) {
        errors.push({ provider: p.name, message: err && err.message });
        console.log('LETHE fallthrough: ' + p.name +
          ' failed (' + (err && err.message) + '), trying next');
        return attempt(i + 1);
      }
    );
  }
  return attempt(0);
}

/* Load on startup */
reloadConfig();
/* Prime the chat plan after config loads. Agent may not be up yet —
 * refreshRouterPlan silently no-ops on failure, and the cache will
 * remain empty (getProviderForTask falls back to getProvider). */
setTimeout(function() { refreshRouterPlan('chat'); }, 250);
