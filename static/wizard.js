/* LETHE First-boot Wizard — legal gates + onboarding.
 * EU AI Act Art. 50: AI disclosure. Sanctions notice. Module disclaimers.
 * Shows once on first launch. Completion stored via config.js persistConfig().
 *
 * Screen order (from first-boot-wizard.yaml):
 *   0: welcome    — Meet LETHE + AI disclosure
 *   1: geographic — Sanctions notice (REQUIRED — cannot skip)
 *   2: disclaimers — AI + health + financial (REQUIRED)
 *   3: tor        — Tor explanation (skippable)
 *   4: provider   — Choose thinking core (skippable)
 *   5: ready      — Done
 *
 * Burner mode, dead man's switch, and voice are configured in Settings
 * to keep the wizard under 3 minutes and < 6 screens.
 */

var wizard = (function() {
  var overlay = document.getElementById('wizard-overlay');
  if (!overlay) return { shouldShow: function() { return false; } };

  var screens = overlay.querySelectorAll('.wizard-screen');
  var dots = overlay.querySelectorAll('.wizard-dot');
  var current = 0;
  var total = screens.length;

  /* Required screens that cannot be skipped */
  var REQUIRED = { 1: true, 2: true };

  function shouldShow() {
    if (letheConfig && letheConfig.wizard_complete) return false;
    return !localStorage.getItem('lethe_wizard_complete');
  }

  function show() {
    overlay.style.display = 'flex';
    goTo(0);
  }

  function hide() {
    overlay.classList.add('done');
    /* Persist completion */
    if (letheConfig) {
      letheConfig.wizard_complete = true;
      persistConfig();
    }
    localStorage.setItem('lethe_wizard_complete', '1');
    setTimeout(function() { overlay.style.display = 'none'; }, 500);
  }

  function goTo(idx) {
    if (idx < 0 || idx >= total) return;
    for (var i = 0; i < total; i++) {
      var s = screens[i];
      s.classList.remove('active', 'exit-left');
      if (i < idx) s.classList.add('exit-left');
    }
    screens[idx].classList.add('active');
    current = idx;
    updateDots();
    updateActions();
  }

  function next() {
    if (current < total - 1) goTo(current + 1);
    else hide();
  }

  function updateDots() {
    for (var i = 0; i < dots.length; i++) {
      dots[i].classList.remove('active', 'visited');
      if (i === current) dots[i].classList.add('active');
      else if (i < current) dots[i].classList.add('visited');
    }
  }

  function updateActions() {
    /* Show/hide skip button based on whether screen is required */
    var skipBtns = overlay.querySelectorAll('.wizard-btn-skip');
    for (var i = 0; i < skipBtns.length; i++) {
      var screenIdx = parseInt(skipBtns[i].getAttribute('data-screen'), 10);
      if (!isNaN(screenIdx)) {
        skipBtns[i].style.display = REQUIRED[screenIdx] ? 'none' : 'block';
      }
    }
  }

  /* ── Tap handler — works on old WebViews where click on divs is unreliable ── */
  function onTap(el, fn) {
    var startY = 0;
    el.addEventListener('touchstart', function(e) {
      startY = e.touches[0].clientY;
    }, { passive: true });
    el.addEventListener('touchend', function(e) {
      if (Math.abs(e.changedTouches[0].clientY - startY) < 20) {
        e.preventDefault();
        fn.call(el);
      }
    });
    el.addEventListener('click', fn);
  }

  /* ── Provider selection on the provider screen ── */
  function setupProviders() {
    var cards = overlay.querySelectorAll('.wizard-provider[data-provider]');
    for (var i = 0; i < cards.length; i++) {
      onTap(cards[i], function() {
        var prov = this.getAttribute('data-provider');
        if (prov === 'local') {
          next();
          return;
        }
        /* Open settings panel for API key entry, then advance */
        hide();
        if (typeof settingsOpen === 'function') settingsOpen();
      });
    }
  }

  /* ── Bind all continue/skip buttons ── */
  function bindButtons() {
    var btns = overlay.querySelectorAll('[data-action]');
    for (var i = 0; i < btns.length; i++) {
      onTap(btns[i], function() {
        var action = this.getAttribute('data-action');
        if (action === 'next') next();
        else if (action === 'skip-all') hide();
      });
    }
    setupProviders();
  }

  return {
    shouldShow: shouldShow,
    show: show,
    hide: hide,
    bindButtons: bindButtons
  };
})();

/* Auto-launch on first boot */
if (wizard.shouldShow()) {
  wizard.bindButtons();
  wizard.show();
}
