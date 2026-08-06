# Mascot sprite pipeline — provenance, pacing, lock screen

State as of 2026-08-06. Written after a debugging session whose root cause
was undocumented asset provenance; keep this current when touching
`static/mascot-*` or the mascot views.

## Three sheet generations coexist in static/

The `mascot-<anim>-<mood>.sprite.png` strips (320px frames stacked
vertically; gitignored except `mascot-idle-green`) were produced by three
different pipelines and look visibly different:

| Generation | Look | Source | Members (green) |
|---|---|---|---|
| old-Blender | smooth malachite, **broken elbow rig** | early Blender export | (retired — `mascot-wave-green.sprite.png.broken-oldmodel`) |
| dark/floor | dark cracked plates on teal floor plate | unknown offline render — **pipeline not in repo** | idle (from idle_alt), idle_alt, nod, alert, listening, thinking, speaking, sleep, wake, unsure, handshake, dismiss, deny, critical, confirm*, wave (=nod copy) |
| bright | bright green/orange, no floor | `record-preview.html` + `lethe-3d.glb` via `record-all-sprites.js` | walk, run, warm_up, greet_01/02, agree, dances, and the rest of the 45-anim batch |

\* `confirm` has scrambled frames (wall-clock capture, see below) — don't
use it until re-recorded.

The launcher/app should stay within ONE generation per surface. The
native app (SpriteMascotView) currently uses dark/floor everywhere except
the rare fidget one-shots (walk/run — bright, no dark render exists yet).

Known open items:

- **True wave**: `mascot-wave-green.sprite.png` is a copy of the nod
  sheet. `mascot-taproot.glb` has a native `wave` clip (idx 96, 15s) but
  taproot is the *slim/pale* model, and the dark-generation staging is
  unreproduced — recover or rebuild that staging before re-rendering.
- **Dark walk/run** for the fidget pool.
- The old pale idle lives at
  `static/mascot-idle-green.sprite.png.pale-oldrender`.

## Recorder pitfalls (both fixed by the -det pages)

1. **Stale name→index tables.** `record-all.js` / `record-all-anims.js`
   carry a 12-clip index map from an older GLB export. In today's
   `lethe-3d.glb` (97 clips) those indices hit different clips — idx 9
   "wave" is now `fall`. `record-all-sprites.js` has the correct names
   for `lethe-3d.glb`. Always verify `idx → clip name` against the GLB
   (parse the JSON chunk) before recording.
2. **Wall-clock capture scrambles timing.** The original recorders
   screenshot on a timer while the mixer runs on real time; under
   software rendering a frame can take seconds, so frames sample random
   clip positions (the `confirm` sheet is this failure). Use
   `record-preview-det.html` / `record-video-det.html`: they expose
   `window._step(dt)` and never self-animate, so the capture script
   drives clip time deterministically per frame.

## Playback pacing — frame-ms sidecars

`SpriteMascotView` plays 66 ms/frame by default, but the generations were
captured at different native rates. A sheet may ship a sidecar next to it
(dev dir `/data/local/tmp/lethe-sprites/` or APK `assets/sprites/`):

```
mascot-idle-green.frame-ms.txt   # contains e.g. "116"
```

Integer milliseconds per frame, clamped 16–1000, read at strip load.
Current values: idle = 116 (149 frames spanning the ~17.3s authored idle
clip). Tune live: `adb push` a new value, then cycle the strip (tap →
one-shot → back to idle reloads it).

## Lock-screen mascot (KeyguardMascotService)

`TYPE_KEYGUARD_DIALOG` window (INTERNAL_SYSTEM_WINDOW via the platform
signature — no SystemUI patch, ships in the `mka Lethe` + `adb install`
loop). Bottom-center, under the notification stack.

- Gate: `persist.lethe.mascot.keyguard` (default off; `setprop ... true`).
- Geometry props (dp, live — applied on next screen-on):
  `persist.lethe.mascot.kg.size` (default 440, box self-clamps to screen
  width because WM edge-pins oversized windows instead of centering) and
  `persist.lethe.mascot.kg.margin` (default 40).
- `FLAG_NOT_TOUCHABLE`: bottom-center of the keyguard is the
  swipe-to-unlock zone; the window must not eat that gesture.
- Lifecycle: shows on SCREEN_ON while `isKeyguardLocked()`, hides (and
  frees the ~60MB strip) on SCREEN_OFF / USER_PRESENT. A **fresh view is
  created per show** — SpriteMascotView keeps `stripName` across detach,
  so a reused instance would skip reloading its recycled strip.
- Start paths: BootReceiver (gated) and MascotActivity.onCreate — the
  service is not exported, so after `adb install -r` re-arm it with
  `am start -a lethe.intent.MASCOT`.
- Known gap: a long notification stack can overlap the mascot; the window
  height is fixed, it doesn't track the stack.
