# Filament probe

Standalone sideloaded APK (NOT part of the system image) answering two
questions before replacing the sprite-sheet mascot with a live renderer:

1. **Perf**: fps/thermals on bramble rendering the dark mascot GLB
   (24.6k tris, 97 clips) with Filament + gltfio.
2. **Timing ground truth**: the gltfio Animator plays clips in authored
   seconds — what this app shows IS the intended animation speed.
   Compare against the sprite sheets to settle any "too fast" dispute.

Also the feasibility gate for agent-driven live avatar control
(cross-fade between clips, procedural bone control) — impossible with
pre-rendered strips.

## Build & run

```
git show acfd45e:static/mascot-taproot.glb > app/src/main/assets/mascot.glb
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am start org.osmosis.filamentprobe/.MainActivity
adb logcat -s probe   # fps log
```

Tap: next clip (idle, walk, run, wave, nod first, then the rest).
HUD: clip name, authored duration, measured fps.

## Asset

`mascot.glb` = the dark cracked model, extracted from git history —
current HEAD `static/mascot-taproot.glb` is the slim/gray model, do not
use (see docs/design/mascot-sprites.md).
