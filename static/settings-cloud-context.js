/* LETHE Settings — cloud-context limit toggle (lethe#97).
 *
 * Default: cloud calls send only the current turn + system prompt. The
 * earlier history (which may include source names mentioned three turns
 * ago) stays on the device. Opting in to full history is one tap, but
 * the risk copy makes the leak path explicit.
 *
 * Loaded after settings.js so this function is on `window` by the time
 * settingsLoad() calls it. */

function renderCloudContextToggle(container) {
  var section = document.createElement('div');
  section.className = 'settings-provider';
  var full = !!(letheConfig && letheConfig.cloud_context_full);
  var dot = full ?
    '<span class="status-dot status-on"></span>' :
    '<span class="status-dot status-off"></span>';
  section.innerHTML =
    '<div class="settings-prov-header">' + dot +
    '<strong>Cloud context</strong> ' +
    '<span class="settings-prov-count">' +
    (full ? 'full history' : '1-turn') + '</span></div>' +
    '<div class="settings-prov-desc">' +
    'By default, only the current message + system prompt go to cloud ' +
    'providers — earlier turns stay on this device. Enabling full history ' +
    'sends the whole conversation on every cloud call. A source name from ' +
    'three turns ago will be re-sent each time.</div>' +
    '<label class="settings-toggle">' +
    '<input type="checkbox" id="cloud-context-toggle"' +
    (full ? ' checked' : '') + '/>' +
    ' Send full conversation history to cloud providers</label>';
  container.appendChild(section);

  var toggle = document.getElementById('cloud-context-toggle');
  if (toggle) {
    toggle.addEventListener('change', function() {
      if (!letheConfig) return;
      letheConfig.cloud_context_full = toggle.checked;
      persistConfig();
    });
  }
}
