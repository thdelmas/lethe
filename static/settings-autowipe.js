/* LETHE Settings — Auto-Wipe Policy.
 *
 * Unified surface for the six auto-wipe triggers. Backed by the
 * persist.lethe.autowipe.* property family read by AutoWipePolicy.java.
 * The Device-Owner-promoted LetheDeviceAdmin pushes the failed-unlock
 * threshold into the stock keyguard via setMaximumFailedPasswordsForWipe,
 * so toggling the failed-unlock checkbox here is what wires up the
 * iPhone-style "fail N → wipe" behavior.
 *
 * For brand-new triggers (failed-unlock, USB-signal) we store as native
 * system properties via NativeLauncher.setSystemProp so the Java side
 * sees changes without a reboot. For legacy duress / DMS the user
 * configures elsewhere; this panel shows their state read-only here so
 * the unified picture is honest.
 */

var _AW = {
  failed_unlock_enabled: 'persist.lethe.autowipe.failed_unlock.enabled',
  failed_unlock_threshold: 'persist.lethe.autowipe.failed_unlock.threshold',
  failed_unlock_delays: 'persist.lethe.autowipe.failed_unlock.delays',
  dms_enabled: 'persist.lethe.autowipe.dms.enabled',
  every_restart_enabled: 'persist.lethe.autowipe.every_restart.enabled',
  panic_enabled: 'persist.lethe.autowipe.panic.enabled',
  duress_enabled: 'persist.lethe.autowipe.duress.enabled',
  usb_signal_enabled: 'persist.lethe.autowipe.usb_signal.enabled',
};

function _awGet(key, fallback) {
  if (typeof NativeLauncher !== 'undefined' && NativeLauncher.getSystemProp) {
    var v = NativeLauncher.getSystemProp(key, fallback || '');
    return v == null ? (fallback || '') : v;
  }
  return fallback || '';
}

function _awSet(key, value) {
  if (typeof NativeLauncher !== 'undefined' && NativeLauncher.setSystemProp) {
    NativeLauncher.setSystemProp(key, value);
  }
}

function _awToggleRow(id, label, key, fallbackProp) {
  var enabled = _awGet(key, '') === 'true';
  if (!enabled && fallbackProp) {
    // Honor the legacy property name during upgrade so the toggle
    // reflects the user's pre-v1.2 choice.
    enabled = _awGet(fallbackProp, '') === 'true';
  }
  var dot = enabled
    ? '<span class="status-dot status-on"></span>'
    : '<span class="status-dot status-off"></span>';
  return '<label class="settings-toggle">' +
    '<input type="checkbox" id="' + id + '"' +
    (enabled ? ' checked' : '') + '/> ' + dot + label + '</label>';
}

function renderAutoWipeSection(container) {
  var section = document.createElement('div');
  section.className = 'settings-provider';

  var threshold = parseInt(_awGet(_AW.failed_unlock_threshold, '10'), 10) || 10;
  var delays = _awGet(_AW.failed_unlock_delays, '');

  section.innerHTML =
    '<div class="settings-prov-header">' +
    '<strong>Auto-Wipe Policy</strong></div>' +
    '<div class="settings-prov-desc">' +
    'Which triggers should wipe the device. Each runs through the same ' +
    'wipe path (DPM.wipeData, system_server domain). Failed-unlock + ' +
    'duress + DMS + USB are silent; panic shows a 5s cancel window; ' +
    'every-restart wipes at post-fs-data on the legacy script (DPM ' +
    'would reboot-loop on every boot).</div>' +

    '<div style="margin-top:8px;"><strong>Failed unlock attempts</strong></div>' +
    _awToggleRow('aw-failed-unlock', 'Wipe after N failed unlocks',
                 _AW.failed_unlock_enabled) +
    '<div class="settings-toggle">' +
    '<label>Threshold: ' +
    '<input type="number" id="aw-threshold" min="3" max="50" ' +
    'value="' + threshold + '" style="width:5em;"></label>' +
    ' <span style="opacity:0.7;font-size:0.85em;">attempts</span></div>' +
    '<div class="settings-toggle">' +
    '<label>Lockout delays (minutes, comma-separated, blank = none): ' +
    '<input type="text" id="aw-delays" placeholder="1,5,15,60" ' +
    'value="' + delays + '" style="width:10em;"></label></div>' +

    '<div style="margin-top:12px;"><strong>Inactivity / Dead-Man\'s Switch</strong></div>' +
    _awToggleRow('aw-dms', 'Wipe after missed check-in',
                 _AW.dms_enabled, 'persist.lethe.deadman.enabled') +

    '<div style="margin-top:12px;"><strong>Every restart (Burner)</strong></div>' +
    _awToggleRow('aw-every-restart', 'Wipe on every boot',
                 _AW.every_restart_enabled, 'persist.lethe.burner.enabled') +

    '<div style="margin-top:12px;"><strong>Panic press</strong></div>' +
    _awToggleRow('aw-panic', '5× power-button press wipes',
                 _AW.panic_enabled, 'persist.lethe.burner.trigger.panic_button') +

    '<div style="margin-top:12px;"><strong>Duress PIN</strong></div>' +
    _awToggleRow('aw-duress', 'Duress PIN entry wipes silently',
                 _AW.duress_enabled, 'persist.lethe.deadman.duress_pin.enabled') +

    '<div style="margin-top:12px;"><strong>USB signal</strong></div>' +
    _awToggleRow('aw-usb', 'OSmosis remote USB trigger wipes',
                 _AW.usb_signal_enabled);

  container.appendChild(section);

  function bindToggle(id, key) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', function() {
      _awSet(key, el.checked ? 'true' : 'false');
    });
  }
  bindToggle('aw-failed-unlock', _AW.failed_unlock_enabled);
  bindToggle('aw-dms', _AW.dms_enabled);
  bindToggle('aw-every-restart', _AW.every_restart_enabled);
  bindToggle('aw-panic', _AW.panic_enabled);
  bindToggle('aw-duress', _AW.duress_enabled);
  bindToggle('aw-usb', _AW.usb_signal_enabled);

  var t = document.getElementById('aw-threshold');
  if (t) t.addEventListener('change', function() {
    var n = parseInt(t.value, 10);
    if (isNaN(n) || n < 3) { t.value = '3'; n = 3; }
    if (n > 50) { t.value = '50'; n = 50; }
    _awSet(_AW.failed_unlock_threshold, String(n));
  });

  var d = document.getElementById('aw-delays');
  if (d) d.addEventListener('change', function() {
    var v = d.value.replace(/\s+/g, '');
    if (v && !/^[0-9]+(,[0-9]+)*$/.test(v)) {
      // Reject invalid input rather than persist garbage.
      d.style.borderColor = 'var(--accent-warn, #ff6961)';
      return;
    }
    d.style.borderColor = '';
    _awSet(_AW.failed_unlock_delays, v);
  });
}
