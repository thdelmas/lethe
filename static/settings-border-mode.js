/* LETHE Settings — Border Mode (lethe#110).
 *
 * One toggle that flips the bundle of protections needed for a border
 * crossing or other high-risk transit:
 *
 *   - duress PIN setup forced (lethe#98)
 *   - BFU auto-reboot on, 15-min timeout (lethe#100)
 *   - DMS interval shortened to 12h (lethe#94 lineage)
 *   - cloud AI providers refused at the router (lethe#95/#97)
 *   - cloud context defaults to 1-turn even if the user later flips it back
 *   - mesh signaling off (avoids the BLE service-UUID leak — lethe#112)
 *
 * Biometrics-off is part of the documented bundle but requires a
 * DeviceAdminReceiver to enforce KEYGUARD_DISABLE_FINGERPRINT /
 * KEYGUARD_DISABLE_FACE. We set persist.lethe.border_mode=1 so a future
 * admin component (and a future Settings.Secure pin to "PIN only")
 * can pick it up; today the UI surfaces a "you must turn off biometrics
 * manually" line in the briefing.
 *
 * Symmetric disable path also requires acknowledgment so the user can't
 * leave Border Mode by reflex. */

var BORDER_MODE_BRIEFING = [
  'Border Mode bundles the protections you want active when crossing a border or in a similar high-risk situation. Read this once before turning it on.',
  '',
  'What it does:',
  '  • Refuses cloud AI providers — local model only.',
  '  • Cloud context capped at 1 turn (no historical leakage if you later disable Border Mode).',
  '  • BFU auto-reboot every 15 minutes of inactivity.',
  '  • DMS check-in interval shortened to 12h (you must check in twice a day).',
  '  • Mesh signaling off (no BLE service-UUID broadcast).',
  '  • Duress PIN required if not already set.',
  '',
  'What it does NOT do:',
  '  • Cellebrite-class extraction is rate-limited but not prevented on most devices. See docs/DEVICE-SECURITY.md.',
  '  • Baseband attacks (rogue cell tower) are out of scope.',
  '  • You must disable fingerprint / face unlock yourself in the system Settings — this UI cannot toggle it.',
  '  • Border Mode does not protect against compelled-PIN-disclosure jurisdictions.',
  '',
  'Acknowledge to enable.'
].join('\n');

function _borderModeApply(enable) {
  if (!letheConfig) return false;
  if (enable) {
    letheConfig.border_mode = true;
    letheConfig.bfu_enabled = true;
    letheConfig.bfu_timeout_minutes = 15;
    letheConfig.cloud_context_full = false;
    letheConfig.mesh_enabled = false;
    letheConfig.dms_interval = '12h';
    letheConfig.border_mode_acknowledged_at = Math.floor(Date.now() / 1000);
  } else {
    letheConfig.border_mode = false;
    letheConfig.border_mode_disabled_at = Math.floor(Date.now() / 1000);
    // Don't auto-restore the other toggles — the user may have
    // independently chosen to keep BFU on, for instance. They flip
    // them back individually if they want.
  }
  persistConfig();
  if (typeof NativeLauncher !== 'undefined' && NativeLauncher.setSystemProp) {
    NativeLauncher.setSystemProp('persist.lethe.border_mode',
      enable ? '1' : '0');
    NativeLauncher.setSystemProp('persist.lethe.bfu.enabled',
      enable ? 'true' : (letheConfig.bfu_enabled ? 'true' : 'false'));
    NativeLauncher.setSystemProp('persist.lethe.bfu.timeout',
      String(letheConfig.bfu_timeout_minutes || 15));
    NativeLauncher.setSystemProp('persist.lethe.mesh.enabled',
      letheConfig.mesh_enabled ? 'true' : 'false');
    NativeLauncher.setSystemProp('persist.lethe.deadman.interval',
      letheConfig.dms_interval || '24h');
  }
  return true;
}

function renderBorderModeSection(container) {
  var section = document.createElement('div');
  section.className = 'settings-provider';
  var enabled = !!(letheConfig && letheConfig.border_mode);
  var dot = enabled ?
    '<span class="status-dot status-on"></span>' :
    '<span class="status-dot status-off"></span>';

  section.innerHTML =
    '<div class="settings-prov-header">' + dot +
    '<strong>Border Mode</strong> ' +
    '<span class="settings-prov-count">' +
    (enabled ? 'active' : 'off') + '</span></div>' +
    '<div class="settings-prov-desc">' +
    'Bundles every protection you want active when crossing a border or ' +
    'in similar high-risk transit: cloud AI off, BFU auto-reboot 15 min, ' +
    'DMS 12h, mesh off, duress PIN required. One tap; one tap to disable. ' +
    'Tap "Show briefing" before activating — there are limits.</div>' +
    '<div class="settings-toggle">' +
    '<button class="dev-btn" id="border-mode-briefing">Show briefing</button> ' +
    '<button class="dev-btn" id="border-mode-toggle">' +
    (enabled ? 'Disable Border Mode' : 'Activate Border Mode') +
    '</button>' +
    '</div>' +
    '<pre id="border-mode-briefing-text" style="display:none;' +
    'white-space:pre-wrap;font-size:0.8em;margin-top:8px;' +
    'padding:8px;border:1px solid var(--border, #333);' +
    'border-radius:6px;"></pre>';
  container.appendChild(section);

  var briefingBtn = document.getElementById('border-mode-briefing');
  var briefingEl = document.getElementById('border-mode-briefing-text');
  if (briefingBtn && briefingEl) {
    briefingBtn.addEventListener('click', function() {
      if (briefingEl.style.display === 'none') {
        briefingEl.textContent = BORDER_MODE_BRIEFING;
        briefingEl.style.display = '';
      } else {
        briefingEl.style.display = 'none';
      }
    });
  }

  var toggleBtn = document.getElementById('border-mode-toggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', function() {
      // Both directions require the briefing to have been shown at least
      // once in this Settings session. Discourages reflex toggling.
      if (briefingEl && briefingEl.style.display === 'none') {
        briefingEl.textContent = BORDER_MODE_BRIEFING +
          '\n\n— click again to confirm —';
        briefingEl.style.display = '';
        return;
      }
      // If activating and no duress PIN exists, require the user to set
      // one first (the bundle's force-duress-PIN clause).
      if (!enabled && !(letheConfig && letheConfig.duress_pin_hash)) {
        briefingEl.textContent = 'Set a duress PIN before activating ' +
          'Border Mode. Use the Duress PIN section above.';
        briefingEl.style.display = '';
        return;
      }
      _borderModeApply(!enabled);
      if (typeof settingsLoad === 'function') settingsLoad();
    });
  }
}
