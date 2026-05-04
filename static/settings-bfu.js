/* LETHE Settings — BFU auto-reboot (lethe#100).
 *
 * After N minutes of inactivity (screen off + locked), the device reboots
 * back to Before-First-Unlock so the credential-encrypted file-system class
 * keys leave RAM. Cold-boot / DMA extraction then has to defeat the
 * lockscreen first, which on Pixels with Titan M2 is a meaningful jump
 * in difficulty.
 *
 * Off by default in v1.x. Default-on once Border Mode (lethe#110) lands. */

function renderBfuToggle(container) {
  var section = document.createElement('div');
  section.className = 'settings-provider';
  var enabled = !!(letheConfig && letheConfig.bfu_enabled);
  var minutes = (letheConfig && letheConfig.bfu_timeout_minutes) || 15;
  var dot = enabled ?
    '<span class="status-dot status-on"></span>' :
    '<span class="status-dot status-off"></span>';
  section.innerHTML =
    '<div class="settings-prov-header">' + dot +
    '<strong>Auto-reboot to BFU</strong> ' +
    '<span class="settings-prov-count">' +
    (enabled ? minutes + ' min' : 'off') + '</span></div>' +
    '<div class="settings-prov-desc">' +
    'Reboots the device after inactivity to evict at-rest encryption ' +
    'keys from RAM. An attacker with physical possession then has to ' +
    'defeat the lockscreen before reading /data — on Pixels this is ' +
    'rate-limited by the Titan M2.</div>' +
    '<label class="settings-toggle">' +
    '<input type="checkbox" id="bfu-toggle"' +
    (enabled ? ' checked' : '') + '/>' +
    ' Enable BFU auto-reboot</label>' +
    '<div class="settings-presets" id="bfu-presets" style="margin-top:8px;' +
    (enabled ? '' : 'display:none;') + '">' +
    _bfuPresetButton(5, minutes) +
    _bfuPresetButton(15, minutes) +
    _bfuPresetButton(60, minutes) +
    '</div>';
  container.appendChild(section);

  var toggle = document.getElementById('bfu-toggle');
  if (toggle) {
    toggle.addEventListener('change', function() {
      if (!letheConfig) return;
      letheConfig.bfu_enabled = toggle.checked;
      persistConfig();
      if (typeof NativeLauncher !== 'undefined' && NativeLauncher.setSystemProp) {
        NativeLauncher.setSystemProp('persist.lethe.bfu.enabled',
          toggle.checked ? 'true' : 'false');
      }
      var presets = document.getElementById('bfu-presets');
      if (presets) presets.style.display = toggle.checked ? '' : 'none';
    });
  }

  var presets = document.querySelectorAll('#bfu-presets [data-bfu-min]');
  for (var i = 0; i < presets.length; i++) {
    presets[i].addEventListener('click', function(e) {
      var m = parseInt(e.target.getAttribute('data-bfu-min'), 10);
      if (!letheConfig || !m) return;
      letheConfig.bfu_timeout_minutes = m;
      persistConfig();
      if (typeof NativeLauncher !== 'undefined' && NativeLauncher.setSystemProp) {
        NativeLauncher.setSystemProp('persist.lethe.bfu.timeout_minutes',
          String(m));
      }
      // Re-render to update the count chip + active preset.
      if (typeof settingsLoad === 'function') settingsLoad();
    });
  }
}

function _bfuPresetButton(m, current) {
  var active = (m === current) ? ' style="font-weight:bold;"' : '';
  return '<button class="dev-btn" data-bfu-min="' + m + '"' + active +
    '>' + m + ' min</button> ';
}
