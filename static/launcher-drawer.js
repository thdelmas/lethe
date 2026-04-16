/* ═══════════════════════════════════════════
   LAUNCHER GESTURES — always work, no agent needed
   ═══════════════════════════════════════════ */
var touchStartY = 0, touchStartX = 0, touchStartTime = 0;

document.addEventListener('touchstart', function(e) {
  if (viewState !== 'home') return;
  touchStartY = e.touches[0].clientY;
  touchStartX = e.touches[0].clientX;
  touchStartTime = Date.now();
}, { passive: true });

document.addEventListener('touchend', function(e) {
  if (viewState !== 'home') return;
  var dy = touchStartY - e.changedTouches[0].clientY;
  var dx = touchStartX - e.changedTouches[0].clientX;
  var dt = Date.now() - touchStartTime;
  if (dt > 500) return;
  var threshold = 60;

  /* Swipe UP → app drawer */
  if (dy > threshold && Math.abs(dx) < threshold) {
    openDrawer();
  }
  /* Swipe DOWN → notification shade */
  if (dy < -threshold && Math.abs(dx) < threshold) {
    if (typeof NativeLauncher !== 'undefined') NativeLauncher.expandNotifications();
  }
}, { passive: true });

/* ═══════════ APP DRAWER ═══════════ */
var drawerEl = document.getElementById('drawer');
var drawerList = document.getElementById('drawer-list');
var drawerSearch = document.getElementById('drawer-search');
var drawerApps = [];
var drawerOpen = false;

function openDrawer() {
  if (drawerOpen) return;
  drawerOpen = true;
  viewState = 'drawer';
  loadApps();
  drawerEl.classList.add('open');
  home.classList.add('hidden');
  hintEl.classList.remove('visible');
  hideBurnerBanner();
  drawerSearch.value = '';
  drawerSearch.focus();
  history.pushState({ view: 'drawer' }, '');
}

function closeDrawer() {
  if (!drawerOpen) return;
  drawerOpen = false;
  viewState = 'home';
  drawerEl.classList.remove('open');
  home.classList.remove('hidden');
  drawerSearch.blur();
  showBurnerBanner();
  homeMascot.focus();
}

function toggleDrawer() {
  if (drawerOpen) closeDrawer(); else openDrawer();
}

function loadApps() {
  if (typeof NativeLauncher === 'undefined' || !NativeLauncher.getInstalledApps) {
    drawerList.innerHTML = '<div class="drawer-letter">No app bridge available</div>';
    return;
  }
  try {
    drawerApps = JSON.parse(NativeLauncher.getInstalledApps());
  } catch (e) {
    drawerApps = [];
  }
  renderApps(drawerApps);
}

function renderApps(apps) {
  drawerList.innerHTML = '';
  var currentLetter = '';
  for (var i = 0; i < apps.length; i++) {
    var app = apps[i];
    var firstLetter = (app.label || '?')[0].toUpperCase();
    if (firstLetter !== currentLetter) {
      currentLetter = firstLetter;
      var letterEl = document.createElement('div');
      letterEl.className = 'drawer-letter';
      letterEl.textContent = currentLetter;
      drawerList.appendChild(letterEl);
    }
    var row = document.createElement('div');
    row.className = 'drawer-app';
    row.setAttribute('data-pkg', app.package);
    row.setAttribute('data-activity', app.activity || '');
    row.setAttribute('role', 'button');
    row.setAttribute('tabindex', '0');
    row.setAttribute('aria-label', 'Open ' + app.label);
    var icon = '';
    if (app.icon) {
      icon = '<img class="drawer-app-icon" src="' + app.icon + '"/>';
    } else {
      icon = '<div class="drawer-app-icon"></div>';
    }
    row.innerHTML = icon + '<span class="drawer-app-label">' +
      escapeHtml(app.label) + '</span>';
    row.addEventListener('click', launchFromDrawer);
    row.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        launchFromDrawer(e);
      }
    });
    drawerList.appendChild(row);
  }
}

function launchFromDrawer(e) {
  var row = e.currentTarget;
  var pkg = row.getAttribute('data-pkg');
  var act = row.getAttribute('data-activity');
  if (typeof NativeLauncher !== 'undefined') {
    NativeLauncher.launchApp(pkg, act);
  }
  closeDrawer();
}

if (drawerSearch) {
  drawerSearch.addEventListener('input', function() {
    var q = drawerSearch.value.toLowerCase();
    if (!q) { renderApps(drawerApps); return; }
    var filtered = drawerApps.filter(function(a) {
      return a.label.toLowerCase().indexOf(q) !== -1;
    });
    renderApps(filtered);
  });
}

/* Swipe down in drawer → close */
if (drawerEl) {
  var drawerTouchY = 0;
  drawerEl.addEventListener('touchstart', function(e) {
    drawerTouchY = e.touches[0].clientY;
  }, { passive: true });
  drawerEl.addEventListener('touchend', function(e) {
    var dy = e.changedTouches[0].clientY - drawerTouchY;
    if (dy > 100) closeDrawer();
  }, { passive: true });
}

/* Double-tap → screen off (ignore mascot area) */
var lastTap = 0;
home.addEventListener('click', function(e) {
  if (homeMascot.contains(e.target)) return;
  var now = Date.now();
  if (now - lastTap < 300) {
    if (typeof NativeLauncher !== 'undefined') NativeLauncher.screenOff();
  }
  lastTap = now;
});
