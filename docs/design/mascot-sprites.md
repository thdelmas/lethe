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

RESOLVED 2026-08-06 — the dark-generation staging was recovered:

- **Source model**: historical versions of `mascot-taproot.glb` are the
  dark cracked model (current HEAD taproot is a different slim/gray
  model — do not use). Re-extract with
  `git show 87242e6:static/mascot-taproot.glb` (12 conversation clips,
  durations match the record-all.js table; wave = idx 9) and
  `git show acfd45e:static/mascot-taproot.glb` (97 clips, 0–59 named:
  walk@10, run@54, idle@24 = 17.29s — the idle_alt source).
- **Staging**: the deleted pre-acfd45e `record-preview.html` (ACES 1.3,
  ambient 0x222222 + key + teal fill/rim, camera z=3.0). Recovered as
  `static/record-taproot-det.html` with deterministic `window._step(dt)`,
  `?glb=`/`?rot=`/`?dist=` params, and a reconstructed floor plate
  (translucent teal quad — the page that originally added it was never
  committed; color sampled from the shipped sheets). Sheet-matching
  params: `rot=290&dist=3.0`.
- **Clip-collapse pitfall**: long NlaTrack clips from these Tripo
  exports collapse mid-clip under three.js (wave collapses ~1.0–2.7s,
  idle likewise) in BOTH historical GLBs. Short clips (walk 2.38s,
  run 1.29s) are clean. The shipped wave sheet is a splice of the clean
  segments (frames 0–16 + 47–65, 36 frames ≈ 2.4s one-shot). Inspect
  every full-clip render for collapsed frames before shipping.
- **Shipped 06-08**: true wave (spliced, replaces the nod-copy), dark
  walk + run (fidget pool now consistent). All at 15fps native → no
  sidecars needed. The old pale idle lives at
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
The correct value for a dark-generation sheet is authored clip duration ÷
frame count (validated: the eye-tuned idle 116 ms equals 17.29 s / 149
exactly; inter-frame diffs confirm uniform sampling, no dup/dropped
frames). The dark sheets were captured at wildly different native rates,
so every dark state sheet ships a sidecar (2026-08-06, fixes
thinking/speaking playing up to 4× too fast at the 66 ms default):

| sheet | frames | authored | frame-ms |
|---|---|---|---|
| idle | 149 | 17.29s (97-clip GLB idx 24) | 116 |
| listening | 89 | 3.58s | 40 |
| thinking | 59 | 15.38s | 261 |
| speaking | 59 | 6.00s | 102 |
| alert | 37 | 2.17s | 59 |
| sleep | 74 | 3.88s | 52 |
| nod | 37 | 2.58s | 70 |

wave/walk/run are 15 fps native (bright-pipeline / 06-08 dark rerecords)
— the 66 ms default is correct, no sidecars. Thinking is only ~3.8 fps
native (59 frames over 15.4 s): correct duration now, but visibly choppy
— candidate for re-record via `record-taproot-det.html` at 15 fps.
Tune live: `adb push` a new value, then cycle the strip (tap →
one-shot → back to idle reloads it — or `am force-stop` + relaunch;
a top-most resumed activity ignores the start intent and keeps its
resident strip).

## Live mascot SHIPPED 07-08 (FilamentMascotView)

`persist.lethe.mascot.live3d=true` switches every mascot surface to a
live Filament render of the dark taproot GLB (24.6k tris). All hosts go
through `MascotViews.create()` — one look everywhere. Clips play in
authored seconds (the sidecar machinery below only applies to the
sprite fallback). 15fps cap — the PMIC power envelope, not the GPU, is
the constraint. Framing lives in `persist.lethe.mascot.{scale,rot,dy,
dist}` (defaults baked from the 07-08 keyguard tuning loop; rot 290 =
front, matching the det-recorder's sheet params). State→clip map:
`persist.lethe.mascot.clip.<state>` = index or name — the conversation
clips are the unnamed NlaTracks (sleep=66, alert=70, listening≈88,
speaking=89, thinking=90, wave=91, nod≈69), identified by authored
duration. GLB: `/data/local/tmp/lethe-sprites/mascot.glb` overrides the
APK asset (re-extract: `git show acfd45e:static/mascot-taproot.glb`).
Filament 1.51.0 vendored under `prebuilt/filament/` (jars + arm64 JNI),
wired by `lethe_stage_filament` + the Android.bp generator; the cm-14.1
generator strips the live path. Gotchas that cost time: `Gltfio.init()`
is separate from `Filament.init()`; `SystemProperties.get` returns ""
never null (empty-string prop == unset); the keyguard shows bind-pose
T-pose only if clip resolution fails.

## Live-renderer probe (tools/filament-probe)

Sideloaded Filament+gltfio APK playing the dark taproot GLB (24.6k
tris) directly: 59.7fps sustained on bramble, clips in authored
seconds. Ground truth for any pacing dispute, and the feasibility gate
for replacing sheets with a live renderer + agent-driven avatar
control. See tools/filament-probe/README.md.

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
