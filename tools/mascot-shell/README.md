# mascot-shell — the two-material crack shell (avatar UI step 4)

Regenerates `prebuilt/filament/mascot.glb` so the avatar's **state colour lands
in the cracks only** and the stone keeps its authored albedo.

## Why a shell at all

The source model is **one material across all 23 meshes**, sharing a single
512² albedo atlas and one UV set. The 23 meshes are body parts — head, torso,
four limb chains, tail — spatially disjoint. **The cracks are painted into the
texture, not modelled**, so they run across and within meshes: no mesh split
can isolate them, and "give the veins their own material" is not a thing the
source asset can express.

So we build the second material as a **shell**: duplicate every mesh, push it
out along its normals by a hair, and give the duplicate an alpha-masked
material that is opaque only on crack pixels. Tinting that material tints the
veins and nothing else.

Cost, measured on bramble (Pixel 4a 5G), and accepted deliberately:

| | before | after |
|---|---|---|
| meshes / materials | 23 / 1 | 46 / 2 |
| triangles | ~24.6k | ~49k |
| GLB | 12.5 MB | 20.5 MB |

The renderer is capped at 15 fps (`FRAME_INTERVAL_NANOS`), which is the regime
the power envelope requires — uncapped 60 fps hard-crashed this device with a
PMIC rail fault on 2026-08-07, and that constraint binds harder now that the
tri count has doubled. **Do not raise the cap for this asset.**

## Inputs — read this before running anything

Both GLBs are gitignored, per this repo's convention that large models live in
history rather than in the tree:

- **`prebuilt/filament/mascot-stone.glb`** — the un-shelled stone model, 12.5 MB.
  **This is the pipeline's input** and the thing to protect. If it is missing,
  it is the 12.5 MB optimized taproot; the nearest recoverable copies are a
  Gradle intermediate under `tools/filament-probe/app/build/`, or
  `git show acfd45e:static/mascot-taproot.glb` (20.1 MB — the *historical*
  model, not byte-identical to the optimized one).
- **`prebuilt/filament/mascot.glb`** — the shelled **output**, 20.5 MB, what
  `lethe_stage_filament` packages into the APK.

The output is itself a valid input to this pipeline, so re-running against
`mascot.glb` would stack a second shell on the first (92 meshes, 4 materials,
veins offset twice). `build-shell.py` hard-fails on an already-shelled input
rather than trusting the operator to remember.

## Pipeline

```bash
cd tools/mascot-shell
STONE=../../prebuilt/filament/mascot-stone.glb
python3 extract-basecolor.py "$STONE" /tmp/basecolor.jpg
./make-crack-mask.sh /tmp/basecolor.jpg /tmp/crack_shell.png 0.62
blender --background --factory-startup --python build-shell.py -- \
        "$STONE" /tmp/crack_shell.png /tmp/shell.glb 0.0008
python3 patch-glb.py "$STONE" /tmp/shell.glb \
        ../../prebuilt/filament/mascot.glb 0.5
```

Then restage into the build tree (`lethe_stage_filament`, or copy to
`packages/apps/Lethe/assets/mascot.glb`) and `mka Lethe`.

## The two things the Blender exporter gets wrong

`patch-glb.py` exists solely to repair them. Both are silent.

1. **Animation order is scrambled on export.** Clip indices are load-bearing —
   `persist.lethe.mascot.clip.<state>` resolves by index, and the conversation
   clips live at 66/69/70/88–91. The patcher re-imposes the original order by
   name and the durations are asserted to match. Verify after any re-author:
   all 97 present, same order, zero duration drift.
2. **`alphaMode` comes out `BLEND`.** A blended shell is depth-sorted per draw
   and hazes the whole model. It must be `MASK` with a 0.5 cutoff — the mask is
   binary, so the cutoff is exact and no sorting is needed. The patcher also
   sets `doubleSided: false`, since the shell is an outward offset and its
   backfaces are pure waste.

## Gotchas that cost time

- **Normals.** The source GLB carries no `NORMAL` attribute; Blender computes
  them on import and then writes them out, which is most of the size growth.
  The offset direction depends on them — after any re-author, assert the shell's
  bounding box is *larger* than the base's (22/23 meshes expand outward). A
  shell pushed inward is invisible and looks exactly like a broken material.
- **The offset is 0.0008 on a ~1.0-tall model.** Smaller z-fights; larger and
  the veins visibly float off the stone.
- **Vitals are not sprite states.** The tint colour is keyed by *vital*
  (`nominal` / `attention` / `alarm` / `resting` / `session`), not by the
  animation state (`idle` / `listening` / `alert` / …). Forcing
  `persist.lethe.mascot.vital.force=alert` silently does nothing: `colorFor()`
  returns null and `applyTint()` bails before it tints anything. It looks
  identical to "the shell isn't rendering". Use `alarm` and `session` for a
  far-apart A/B, and confirm `lethe-3d: tint target: crack shell only` appears
  in logcat before believing any screenshot.
- **Pin the clip before comparing colours.** Different vitals select different
  animations, so two captures differ in pose as well as hue. Set
  `persist.lethe.mascot.clip.<state>` to the same index on both sides, or the
  diff measures the wrong thing.
