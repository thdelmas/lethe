/* LETHE Settings — warrant canary status (lethe#114).
 *
 * Reads /data/lethe/canary/state.json (written by lethe-canary-fetch.sh)
 * and surfaces fresh / stale / missing in the About section. The absence
 * of a fresh signed canary is the signal — we make it visible without
 * making it scary.
 *
 * If the agent backend isn't running yet (v1.0 ships without /api/agent),
 * this section reads from window.NativeLauncher.readFile when present, or
 * shows a "not available on this build" message. Defensive — never fails
 * the parent settings render. */

function renderWarrantCanary(container) {
  var section = document.createElement('div');
  section.className = 'settings-provider';
  var holder = document.createElement('div');
  holder.id = 'canary-status-holder';
  holder.innerHTML =
    '<div class="settings-prov-header">' +
    '<span class="status-dot status-off"></span>' +
    '<strong>Warrant canary</strong> ' +
    '<span class="settings-prov-count">checking…</span></div>' +
    '<div class="settings-prov-desc">' +
    'A periodic signed statement on IPNS asserting that the project ' +
    'has not received court orders, gag orders, or key-disclosure ' +
    'demands. <strong>Absence is the signal.</strong> If this turns ' +
    'red or stays stale past its own next_due, that is the alarm.' +
    '</div>';
  section.appendChild(holder);
  container.appendChild(section);

  fetchCanaryState().then(function (state) {
    renderCanaryState(holder, state);
  }).catch(function () {
    renderCanaryState(holder, null);
  });
}

function fetchCanaryState() {
  // Preferred path: native bridge that reads /data/lethe/canary/state.json
  // through the agent's already-elevated privileges. Falls back to a
  // /api/agent endpoint when the agent ships, then to a no-op when neither
  // is reachable.
  if (typeof NativeLauncher !== 'undefined' &&
      typeof NativeLauncher.readFile === 'function') {
    try {
      var raw = NativeLauncher.readFile('/data/lethe/canary/state.json');
      if (raw) return Promise.resolve(JSON.parse(raw));
    } catch (e) { /* fall through */ }
  }
  return fetch('/api/canary/state').then(function (r) {
    if (!r.ok) throw new Error('no /api/canary/state');
    return r.json();
  });
}

function renderCanaryState(holder, state) {
  if (!state) {
    holder.querySelector('.settings-prov-count').textContent = 'unavailable';
    return;
  }
  var status = (state.status || 'missing').toLowerCase();
  var dot = holder.querySelector('.status-dot');
  var count = holder.querySelector('.settings-prov-count');
  var desc = holder.querySelector('.settings-prov-desc');

  if (status === 'fresh') {
    dot.className = 'status-dot status-on';
    count.textContent = 'fresh — as of ' + (state.as_of || '?');
  } else if (status === 'stale') {
    dot.className = 'status-dot status-warn';
    count.textContent = 'STALE';
  } else {
    dot.className = 'status-dot status-off';
    count.textContent = 'missing';
  }

  // Append the human-readable detail without trampling the existing copy.
  var detail = document.createElement('div');
  detail.className = 'settings-prov-extra';
  detail.style.marginTop = '6px';
  detail.style.fontSize = '0.85em';
  var msg = state.message || '';
  if (state.next_due) msg += ' Next due: ' + state.next_due + '.';
  if (state.checked_at) msg += ' Checked: ' + state.checked_at + '.';
  detail.textContent = msg;
  desc.appendChild(detail);
}
