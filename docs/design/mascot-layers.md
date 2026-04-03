# LETHE Mascot — SVG Layer Specification

How to decompose `overlays/mascot.png` into an animatable layered SVG.

## Source image

The mascot is a cracked stone Android figure with bioluminescent teal
veins, glowing teal eyes, a circular chest orb with concentric wave
pattern, two antennae, and small moss patches. Dark background, "LETHE"
text below (text is NOT part of the animated SVG).

## SVG structure

```xml
<svg viewBox="0 0 540 960" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Reusable filters and gradients -->
    <filter id="glow">
      <feGaussianBlur stdDeviation="4" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <radialGradient id="orb-gradient">
      <stop offset="0%" stop-color="#22e8a0" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="#22e8a0" stop-opacity="0.1"/>
    </radialGradient>
  </defs>

  <!-- Layer order: back to front -->
  <g id="body">        <!-- Stone shell, static -->
  <g id="moss">        <!-- Lichen patches, static -->
  <g id="cracks">      <!-- Bioluminescent veins -->
  <g id="chest_orb">   <!-- Central orb -->
  <g id="eyes">        <!-- Two eye shapes -->
  <g id="antennae">    <!-- Head antennae -->
</svg>
```

## Layer details

### `body` — Stone shell
- Trace the outer silhouette of the figure as filled paths.
- Fill: `#2a2a28` (dark gray stone).
- No animation. This is the static foundation.
- Include the headphone/ear shapes as part of this group.

### `moss` — Organic patches
- Small irregular shapes on shoulders, joints, and feet.
- Fill: `#1a3a20` (very dark green), opacity 0.6.
- Static. Adds organic texture.

### `cracks` — Bioluminescent veins
- Trace each visible crack/vein as an individual `<path>`.
- Stroke: `#22e8a0`, stroke-width: 1.5–3px depending on vein size.
- Fill: none (veins are lines, not filled shapes).
- Apply `filter="url(#glow)"` for the bioluminescent effect.
- **Important:** Give each vein a unique `id` (e.g., `crack-torso-1`,
  `crack-arm-l-2`) so directional animations can stagger them.
- Group sub-paths by body region for directional flow:
  ```xml
  <g id="cracks">
    <g id="cracks-head">...</g>
    <g id="cracks-torso">...</g>
    <g id="cracks-arms">...</g>
    <g id="cracks-legs">...</g>
  </g>
  ```

### `chest_orb` — Central orb
- Outer circle: `r="65"`, centered on the chest.
- Inner pattern: concentric rings or wave paths traced from the source.
- Fill the outer circle with `url(#orb-gradient)`.
- Inner wave pattern: stroke `#22e8a0`, varying opacity.
- The orb is the emotional center — it reacts most visibly.

### `eyes` — Glowing eyes
- Two ellipses or rounded rects, positioned in the head.
- Fill: `#22e8a0` with `filter="url(#glow)"`.
- Each eye is a separate element for independent blink animation:
  ```xml
  <g id="eyes">
    <g id="eye-left">
      <ellipse id="eye-left-glow" rx="18" ry="14" fill="#22e8a0"/>
      <rect id="eye-left-lid" width="40" height="30" fill="#2a2a28"
            transform="scaleY(0)" transform-origin="center"/>
    </g>
    <g id="eye-right">...</g>
  </g>
  ```
- Blink = animate `eye-*-lid` scaleY from 0 → 1 → 0 over 0.2s.
- Glow intensity = animate the `feGaussianBlur` stdDeviation or
  the fill opacity.

### `antennae` — Head antennae
- Two thin lines or narrow paths extending from the top of the head.
- Stroke: `#666`, stroke-width: 2px.
- Small circles at the tips (the flower/dot shapes visible in the PNG).
- Tip fill: `#ddd` (the small white flowers).
- Animate via `transform: rotate()` on each antenna `<g>` with
  `transform-origin` set to the base of each antenna.

## 3D Stage setup

The SVG is wrapped in a `.mascot-stage` div that provides CSS perspective:

```html
<div class="mascot-stage">
  <svg class="lethe-mascot mascot-state-idle" viewBox="0 0 540 960">
    <g id="body">...</g>          <!-- Z: 0px  -->
    <g id="moss">...</g>          <!-- Z: 2px  -->
    <g id="cracks">...</g>        <!-- Z: 6px  -->
    <g id="chest_orb">...</g>     <!-- Z: 12px -->
    <g id="eyes">...</g>          <!-- Z: 16px -->
    <g id="antennae">...</g>      <!-- Z: 20px -->
  </svg>
</div>
```

Each layer has `transform: translateZ(Npx)` in CSS. When the root
SVG rotates (tilt, sway, lean), the Z-separated layers create real
depth parallax — eyes and antennae shift more than the body.

This is pure CSS 3D transforms. No Three.js, no WebGL, no canvas.
GPU-composited on all Android WebViews with hardware acceleration.

## Animation CSS class mapping

The backend emits conversation state over SSE. The frontend sets a
CSS class on the SVG root element:

```
<svg class="mascot-state-idle">      → default
<svg class="mascot-state-listening"> → user speaking (leans forward)
<svg class="mascot-state-thinking">  → processing (head dips, eyes shift)
<svg class="mascot-state-speaking">  → generating response (upright sway)
<svg class="mascot-state-alert">     → security event (braces back)
<svg class="mascot-state-sleep">     → screen off / low power (still)
```

Expressions overlay on top of states via a second class:

```
<svg class="mascot-state-speaking mascot-expr-curious">
<svg class="mascot-state-idle mascot-expr-amused">
<svg class="mascot-state-alert mascot-expr-concerned">
<svg class="mascot-state-speaking mascot-expr-proud">
```

### 3D body movements per state

| State     | Body movement               | Character intent         |
|-----------|-----------------------------|--------------------------|
| idle      | Gentle sway + breathing     | Calm, alive, present     |
| listening | Lean forward                | "I'm paying attention"   |
| thinking  | Head dips, eyes look down   | Processing internally    |
| speaking  | Upright with subtle sway    | Confident delivery       |
| alert     | Lean back, rigid            | Bracing, defensive       |
| sleep     | No movement                 | Conserving energy        |

### Expressions (emotional overlays)

| Expression | Body + face                    | Trigger                   |
|------------|--------------------------------|---------------------------|
| curious    | Head tilt, eyes widen          | Unexpected user input     |
| amused     | Lean back, eyes squint         | Humor, lighthearted input |
| concerned  | Lean in, dim glow, slow pulse  | Security worry, low state |
| proud      | Stand tall, full radiance      | Task complete, wipe done  |

## Interactive awareness (mascot-interact.js)

The mascot responds to the physical world through four sensor channels.
All driven by lightweight JS → CSS custom property updates (no frame
loops, no rAF). Disabled automatically by `prefers-reduced-motion`.

### Gyroscope parallax

Tilt the phone → the avatar shifts in 3D. Uses `DeviceOrientationEvent`
to map device tilt (beta/gamma) to `--gyro-x` and `--gyro-y` CSS vars
on `.lethe-mascot`. Clamped to +-8deg to avoid nausea. On iOS, requests
permission on first touch gesture. Adds `.gyro-active` class when active.

### Eye gaze tracking

Eyes follow your touch/cursor. Maps `touchmove`/`mousemove` position
relative to the mascot center into `--gaze-x` and `--gaze-y` CSS vars.
Max offset: 6px horizontal, 4px vertical. Adds `.gaze-active` class.

### Touch reactions

Tap the mascot → flinch animation + surprise micro-expression. Tap 3
times → LETHE gets amused (expression overlay for 3 seconds). Suppressed
during alert and thinking states.

### Ambient system awareness

LETHE IS the phone. It feels its own state:

- **Battery** → vein brightness (40% glow at 10% battery, 100% at full).
  At ≤10% battery (not charging), LETHE shows `concerned` expression.
  When charger is plugged in, LETHE nods.
- **Time of day** → hue shift on all bioluminescent elements.
  Night (10pm–6am): cool blue shift (-15deg).
  Midday (10am–4pm): warm shift (+8deg).
  Dawn/dusk: neutral.

### Particle sparks

6 CSS-only `<div class="spark">` elements float upward from the cracks.
Staggered timing, random horizontal drift. No JS frame loop — pure
CSS `@keyframes`. Turn red during alert state, disabled during sleep.

## 3D model + Mixamo FBX pipeline

On taproot/deeproot tiers, the mascot uses a skeletal 3D model
(`mascot-taproot.glb`, 12MB) rendered via Three.js. Animations are
embedded in the GLB (39 bones, 117 tracks per clip).

### Adding Mixamo animations

Mixamo FBX files can be retargeted onto the LETHE skeleton at runtime.
The rigs differ in bone naming, rest pose, and proportions (Mixamo is
a tall skinny humanoid, LETHE is a small stocky golem).

**Retargeting strategy** (in `mascot-3d-renderer.js`):
- Torso, legs, head, clavicles: delta-from-rest (extract rotation
  change from Mixamo rest pose, apply to LETHE rest pose)
- Upper arms, forearms, hands: world-rotation copy (bone local axes
  differ too much for delta approach)
- Position tracks: skipped (proportions differ)

**Bone mapping** (FBXLoader strips the colon from `mixamorig:` prefix):

| Mixamo | LETHE |
|--------|-------|
| mixamorigHips | Hip |
| mixamorigSpine | Waist |
| mixamorigSpine1/2 | Spine01/02 |
| mixamorigNeck | NeckTwist01 |
| mixamorigHead | Head |
| mixamorigLeft/RightShoulder | L/R_Clavicle |
| mixamorigLeft/RightArm | L/R_Upperarm |
| mixamorigLeft/RightForeArm | L/R_Forearm |
| mixamorigLeft/RightHand | L/R_Hand |
| mixamorigLeft/RightUpLeg | L/R_Thigh |
| mixamorigLeft/RightLeg | L/R_Calf |
| mixamorigLeft/RightFoot | L/R_Foot |

### Recording to 2D WebM

For shallow/taproot tiers, 3D animations are pre-rendered to WebM
videos using Puppeteer + the recording pipeline:

1. Download FBX from Mixamo ("Without Skin" to save space)
2. Place in `static/`
3. Record: open `record-video-test.html?fbx=YourAnim.fbx&speed=0.5&mood=green`
4. Encode frames to WebM via `encode-webm.html`
5. Output: `mascot-{name}-green.webm` (480x480, VP8, ~1.5MB)
6. Add to `animByContext` in `launcher.js`

### Context-aware animation pools

Animations are selected by context without LLM dependency:

| Context | Trigger | Pool |
|---------|---------|------|
| calm | Idle <2min | waving, walk |
| fidgeting | Idle 2-5min | walk, run |
| sleepy | Idle >5min | slow idle |
| tap | User taps mascot | waving, walk, run |
| wake | Touch during sleep | warm_up |
| replied | After LLM response (50%) | waving, walk |

Per-animation playback speed is supported (e.g. run at 0.6x).

## Performance constraints

- Target: 60fps on Snapdragon 425 (Moto G7 Plus, lowest-spec device).
- CSS 3D transforms only — `perspective`, `translateZ`, `rotateX/Y/Z`.
  These are all GPU-composited. No JavaScript frame loops.
- Interactive JS uses passive event listeners and CSS custom properties.
  No `requestAnimationFrame` loops — the browser handles compositing.
- Prefer `transform` and `opacity` (GPU-composited) over `fill`,
  `stroke`, or `filter` animations where possible.
- The glow filter is expensive. On low-end devices, degrade to a
  simple opacity pulse without the blur filter.
- Total SVG file size target: < 50KB.
- `prefers-reduced-motion`: collapse ALL animations, 3D transforms,
  gyroscope, gaze tracking, and particles. Only static opacity remains.
