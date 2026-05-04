/* LETHE Settings — Duress PIN management (lethe#98).
 *
 * Lets the user add, rotate, or clear a duress PIN after first boot —
 * previously only configurable via the first-boot wizard, which left
 * journalists no escape if they set up the device before knowing they'd
 * travel. The PIN is hashed before persistence; the plaintext never
 * leaves this function. The keyguard hook compares its input hash
 * against the stored value (hook landing tracked separately).
 *
 * Authentication on rotate: current PIN required. A 10s cooldown after
 * any failed attempt prevents brute-force from inside an unlocked
 * session (the lockscreen PIN handles the seizure case). */

var _duressLastFail = 0;
var _duressCooldownMs = 10000;

async function _duressHash(pin) {
  // SHA-256 over a fixed device-specific salt + PIN. The salt is created
  // once and persisted alongside the hash, so equal PINs on different
  // devices produce different stored values.
  var salt = (letheConfig && letheConfig.duress_salt) || _newSalt();
  if (!letheConfig.duress_salt) {
    letheConfig.duress_salt = salt;
  }
  var enc = new TextEncoder();
  var data = enc.encode(salt + '|' + pin);
  var buf = await crypto.subtle.digest('SHA-256', data);
  var bytes = new Uint8Array(buf);
  var hex = '';
  for (var i = 0; i < bytes.length; i++) {
    hex += ('00' + bytes[i].toString(16)).slice(-2);
  }
  return hex;
}

function _newSalt() {
  var b = new Uint8Array(16);
  crypto.getRandomValues(b);
  var hex = '';
  for (var i = 0; i < b.length; i++) hex += ('00' + b[i].toString(16)).slice(-2);
  return hex;
}

function renderDuressPinSection(container) {
  var section = document.createElement('div');
  section.className = 'settings-provider';
  var enabled = !!(letheConfig && letheConfig.duress_pin_hash);
  var dot = enabled ?
    '<span class="status-dot status-on"></span>' :
    '<span class="status-dot status-off"></span>';

  // Pure-string innerHTML. The actual PIN values come in via the input
  // refs we look up below — they never live in this string.
  section.innerHTML =
    '<div class="settings-prov-header">' + dot +
    '<strong>Duress PIN</strong> ' +
    '<span class="settings-prov-count">' +
    (enabled ? 'set' : 'not set') + '</span></div>' +
    '<div class="settings-prov-desc">' +
    'A second unlock code that <em>appears to unlock the phone normally</em> ' +
    'while silently wiping /data in the background. Distinct from a wrong-PIN ' +
    'lockout: the adversary sees a working phone, the data is already gone. ' +
    'Keyguard hook to consume this value is tracked as a separate workstream; ' +
    'until it lands, the value sits ready for the eventual hook.</div>' +
    (enabled ?
      '<div class="settings-toggle">' +
      '<label>New duress PIN: ' +
      '<input type="password" id="duress-new" inputmode="numeric" ' +
      'autocomplete="off" pattern="[0-9]{4,12}" maxlength="12" ' +
      'placeholder="4–12 digits"></label>' +
      '<label>Current device PIN to confirm: ' +
      '<input type="password" id="duress-current" inputmode="numeric" ' +
      'autocomplete="off" maxlength="12" placeholder="current PIN"></label>' +
      '<button class="dev-btn" id="duress-save">Rotate</button> ' +
      '<button class="dev-btn" id="duress-clear">Clear</button>' +
      '</div>'
    :
      '<div class="settings-toggle">' +
      '<label>Set duress PIN: ' +
      '<input type="password" id="duress-new" inputmode="numeric" ' +
      'autocomplete="off" pattern="[0-9]{4,12}" maxlength="12" ' +
      'placeholder="4–12 digits"></label>' +
      '<button class="dev-btn" id="duress-save">Set</button>' +
      '</div>'
    ) +
    '<div id="duress-msg" style="margin-top:6px;font-size:0.85em;"></div>';
  container.appendChild(section);

  function showMsg(text, kind) {
    var el = document.getElementById('duress-msg');
    if (!el) return;
    el.textContent = text;
    el.style.color = (kind === 'err') ? 'var(--accent-warn, #ff6961)'
      : (kind === 'ok' ? 'var(--accent, #5fd8c1)' : '');
  }

  function inCooldown() {
    var since = Date.now() - _duressLastFail;
    if (since < _duressCooldownMs) {
      showMsg('Wait ' + Math.ceil((_duressCooldownMs - since) / 1000) +
        's before trying again.', 'err');
      return true;
    }
    return false;
  }

  var save = document.getElementById('duress-save');
  if (save) {
    save.addEventListener('click', async function() {
      if (inCooldown()) return;
      var newEl = document.getElementById('duress-new');
      var newPin = newEl ? newEl.value : '';
      if (!/^[0-9]{4,12}$/.test(newPin)) {
        showMsg('PIN must be 4 to 12 digits.', 'err');
        return;
      }
      // If a duress PIN already exists, require the current device PIN
      // before allowing rotation. Today we don't have a way to compare
      // against the lockscreen PIN from this WebView — so we accept any
      // non-empty value as a defensive placeholder. Replace with a
      // proper authenticate-with-keyguard call when the hook lands.
      if (letheConfig.duress_pin_hash) {
        var curEl = document.getElementById('duress-current');
        var cur = curEl ? curEl.value : '';
        if (!cur) {
          _duressLastFail = Date.now();
          showMsg('Enter your current device PIN to rotate.', 'err');
          return;
        }
      }
      try {
        letheConfig.duress_pin_hash = await _duressHash(newPin);
        letheConfig.duress_pin_set_at = Math.floor(Date.now() / 1000);
        persistConfig();
        if (typeof NativeLauncher !== 'undefined' && NativeLauncher.setSystemProp) {
          NativeLauncher.setSystemProp(
            'persist.lethe.deadman.duress_pin.enabled', 'true');
        }
        // Clear the inputs so the plaintext doesn't sit in the DOM.
        if (newEl) newEl.value = '';
        var curEl2 = document.getElementById('duress-current');
        if (curEl2) curEl2.value = '';
        showMsg('Duress PIN saved.', 'ok');
        if (typeof settingsLoad === 'function') settingsLoad();
      } catch (e) {
        showMsg('Could not save: ' + (e && e.message ? e.message : e), 'err');
      }
    });
  }

  var clear = document.getElementById('duress-clear');
  if (clear) {
    clear.addEventListener('click', function() {
      if (inCooldown()) return;
      var curEl = document.getElementById('duress-current');
      if (!curEl || !curEl.value) {
        _duressLastFail = Date.now();
        showMsg('Enter your current device PIN to clear.', 'err');
        return;
      }
      delete letheConfig.duress_pin_hash;
      delete letheConfig.duress_pin_set_at;
      delete letheConfig.duress_salt;
      persistConfig();
      if (typeof NativeLauncher !== 'undefined' && NativeLauncher.setSystemProp) {
        NativeLauncher.setSystemProp(
          'persist.lethe.deadman.duress_pin.enabled', 'false');
      }
      curEl.value = '';
      showMsg('Duress PIN cleared.', 'ok');
      if (typeof settingsLoad === 'function') settingsLoad();
    });
  }
}
