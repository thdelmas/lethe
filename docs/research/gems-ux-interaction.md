# Hidden Gems: UX, Animation & Interaction Design

> Research compiled 2026-03-31. Part of the hidden-gems series.
> Priority: P0 (ship-blocking), P1 (next release), P2 (3-6mo), P3 (long-term).

Already in LETHE: Three.js mascot (3D), CSS 2D animations, gyroscope
parallax, eye gaze, touch reactions, emotion states, eSpeak TTS,
Whisper STT, tiered device support (shallow/taproot/deeproot).

---

## 1. Lightweight Rendering Alternatives

### OGL (Minimal WebGL) — P1
- **URL**: https://github.com/oframe/ogl
- **What**: Zero-dependency ES6 WebGL. Three.js-like API, dramatically
  smaller. Devs write own shaders, work close to raw WebGL.
- **Why**: Replace Three.js on mid-tier. Mascot geometry is simple
  enough that OGL cuts JS parse time and memory while keeping the same
  shader pipeline. Zero deps = easier to audit.

### TWGL.js — P2
- **URL**: https://twgljs.org
- **What**: Thin WebGL helper. Not an engine -- makes raw WebGL less
  verbose without adding abstraction.
- **Why**: Lowest-tier WebGL path. Creates clean four-tier rendering
  stack: Three.js > OGL > TWGL > CSS/APNG.

### CSS 3D Transforms (No JS/WebGL) — P1
- **URL**: https://3dtransforms.desandro.com
- **What**: Pure CSS `perspective`, `rotate3d`, `translateZ` with
  hardware acceleration. 60fps with zero JS thread cost.
- **Why**: Mascot idle state entirely in CSS 3D. Flat SVG/PNG with CSS
  transforms driven by gyroscope via tiny JS bridge. Near-zero CPU for
  the always-present guardian.

---

## 2. Procedural Animation

### FABRIK Inverse Kinematics (TypeScript) — P2
- **URL**: https://github.com/tmf-code/inverse-kinematics
- **What**: IK solver for 2D/3D chains. Specify end-effector, chain
  solves. No pre-baked animations needed.
- **Why**: Mascot arms/tentacles/tail procedurally reach toward UI
  elements, point at notifications, recoil from threats. Replaces
  dozens of sprite sheets with one solver + bone positions.

### springTo.js — P1
- **URL**: https://matthaeuskrenn.com/springto
- **What**: Single-line spring physics animation. No dependencies.
- **Why**: Perfect for micro-interactions: eyes following touch, body
  wobble on notification, bounce on tap. Spring physics = alive motion
  without keyframe data.

### Motion (formerly Framer Motion) — P2
- **URL**: https://motion.dev
- **What**: Production animation library. Web Animations API for 120fps
  native, falls back to JS for springs/gestures.
- **Why**: Hybrid engine auto-picks efficient rendering path. Perfect
  for tiered device support.

---

## 3. Calm Technology & Ambient Computing

### Calm Technology Principles — P0
- **URL**: https://calmtech.com
- **What**: 8 principles for peripheral technology. Information moves
  from periphery to center and back without demanding attention. Calm
  Tech Certified program (2024) provides measurable standards.
- **Why**: LETHE's guardian IS calm technology. Show privacy state
  through ambient visual changes (glow intensity, posture, breathing)
  not pop-ups.

### Mascot-as-Privacy-Dashboard (Synthesis) — P0

Make the mascot the primary privacy visualization:
- **Posture** = threat level (relaxed / alert / defensive)
- **Glow** = teal spectrum (bright=secure, dark=reduced, amber=warning)
- **Breathing rate** = activity (slow=idle, fast=scanning, held=blocking)
- **Eye behavior** = attention (at user=listening, away=scanning,
  at element=flagging it)
- **Shield/aura** = active protections (CSS radial gradient or WebGL,
  expanding/contracting based on protection count)

Users never need a privacy dashboard. The guardian's body language IS
the dashboard. Research (2025) confirms visualizing privacy state
increases trust and lowers perceived intrusiveness.

### Ambient Multisensory Escalation Ladder — P1

Three-channel notification system:
1. Glow color/intensity (visual periphery)
2. Custom vibration patterns (haptic periphery)
3. Procedural earcons (audio periphery)

Escalation: glow shift > posture change > gentle animation > haptic
pattern > earcon > notification badge > interruption. **Most events
should never pass level 2.**

Research: 94.4% non-annoyance rate for peripheral vibration patterns.

---

## 4. Voice Interaction

### openWakeWord — P1
- **URL**: https://github.com/dscripka/openWakeWord
- **What**: Open-source wake word detection. Custom words via synthetic
  speech (Piper TTS). 20+ languages. ONNX. Runs on RPi.
- **Why**: "Hey Lethe" trained on synthetic voices only. Zero real voice
  data. Fully auditable.

### DaVoice — P2
- **URL**: https://davoice.io
- **What**: Wake + VAD + STT + TTS + speaker ID. Zero false positives.
- **Why**: Speaker ID for voice authentication without cloud biometrics.

### DARE-GP (Privacy Defense) — P3
- **URL**: https://arxiv.org/abs/2211.09273
- **What**: Adversarial noise preserving transcription accuracy but
  defeating emotion detection by hostile listeners.
- **Why**: Protect emotional privacy on outgoing voice calls.

---

## 5. Haptic Feedback

### Android Haptics Primitives — P1
- **Source**: developer.android.com/develop/ui/views/haptics/
- **What**: `VibrationEffect.Composition` with primitives (CLICK, TICK,
  THUD, SPIN). Envelope API for precise amplitude/frequency. Web
  Vibration API (`navigator.vibrate`) works in WebView.
- **Why**: Guardian's "haptic language": slow pulse = all clear, sharp
  double-tick = permission requested, rising buzz = threat. Users learn
  to feel security state. Mascot animations sync with vibration.

---

## 6. Always-On Display

### AOD Mascot Form — P2
- **What**: Minimal AOD mascot -- teal silhouette changing posture/
  expression based on privacy state. Sleeping = all clear. Alert =
  needs attention. Near-zero power on OLED.
- **Why**: 24/7 ambient privacy awareness without battery cost.

### TRMNL Architecture Pattern — P3
- **URL**: https://trmnl.com
- **What**: ePaper dashboard with one-way data polling, HTML/CSS
  templates, months of battery.
- **Why**: LETHE could adopt the pattern: render privacy status as
  minimal HTML, push to AOD via lightweight polling. One-way (device
  pulls, never pushes) is perfect privacy architecture.

---

## 7. Gesture Recognition

### MediaPipe Gesture Recognizer (Web JS) — P2
- **URL**: ai.google.dev/edge/mediapipe/solutions/vision/gesture_recognizer
- **What**: Camera-based hand gesture recognition in browser. 8 gestures,
  2 hands, on-device ML.
- **Why**: Wave to dismiss, thumbs up to approve permission, open palm
  to stop. All local, zero data leaves device. Embodied interaction
  with guardian.

### ZingTouch — P2
- **URL**: https://zingchart.github.io/zingtouch
- **What**: Lightweight touch gesture library. Tap, swipe, pinch,
  rotate with configurable sensitivity.
- **Why**: Rich mascot touch: petting (multi-finger swipe), spinning
  (rotate), pushing aside (swipe). Physical interaction builds
  emotional connection.

---

## 8. Sound Design

### Tone.js (Procedural Earcons) — P1
- **URL**: https://tonejs.github.io
- **What**: Web Audio framework. Synths (FM, AM, Noise), effects.
  Generates sounds procedurally -- no audio files needed.
- **Why**: Guardian earcons synthesized mathematically. "Privacy OK" =
  specific chord. Threats = increasing dissonance. Zero audio storage.
  Parameterized by threat level. Holistic sonic branding = 10x more
  effective than individual sounds.

### Resonance Audio (Google, Spatial) — P2
- **URL**: https://github.com/resonance-audio/resonance-audio-web-sdk
- **What**: HRTF binaural rendering. Sound source positioning. Room
  acoustics. Works via Web Audio API in Android WebView. Apache 2.0.
- **Why**: Mascot voice spatialized to its screen position. In
  headphones, guardian sounds physically present. Sound follows mascot
  movement.

### Earcon Design (Google) — P1
- **Source**: developers.google.com/assistant/conversation-design/earcons
- **What**: Guidelines for voice assistant earcons. Duration, placement
  relative to speech.
- **Why**: Earcons bookend guardian speech: "listening" before STT,
  "processing" during inference, "done" after response. Replace visual
  spinners for eyes-free interaction.

---

## 9. Input Methods

### Thumb-Key — P1
- **URL**: https://github.com/dessalines/thumb-key
- **What**: Privacy keyboard with 3x3 grid + swipe. No cloud prediction.
  Explicitly rejects cloud ML as "privacy-offending."
- **Why**: No language model needed (saves RAM for agent). Large keys
  are inherently accessible. Accessibility-first = privacy-first.

### FUTO Keyboard — P1
- **What**: Open-source with offline transformer prediction, offline
  voice input, swipe. Never connects to internet.
- **Why**: Smart prediction without cloud. Transformer models local.

### HeliBoard — P2
- **What**: Privacy fork of OpenBoard. Offline, deep customization.
- **Why**: Most customizable. Theme with teal + mascot stickers.

---

## 10. Accessibility = Privacy

### `prefers-reduced-motion` / `prefers-reduced-data` — P1
- **What**: CSS media queries for OS preferences. `prefers-reduced-data`
  disables autoplay, loads lighter images, minimizes network surface.
- **Why**: `prefers-reduced-data` is both accessibility AND privacy.
  Expose as OS-level privacy controls. "Reduced data" = more private.

### Large Touch Targets / Simplified Navigation — P1
- **What**: WCAG 48dp minimum touch targets and simplified nav reduce
  UI surface for dark patterns, hidden toggles, buried settings.
- **Why**: Accessibility-first settings UI = privacy controls impossible
  to hide or make confusing.

---

## 11. Low-Power Animation Techniques

### Compositor-Only Properties — P0
- **What**: Animate only `transform` and `opacity` on GPU compositor.
  Combined with `will-change`, browser pre-promotes layers. Use
  `navigator.deviceMemory` + `hardwareConcurrency` for auto-scaling.
  Page Visibility API for background throttling.
- **Why**: Mascot idle (breathing, blinking, sway) at near-zero CPU.
  GPU handles it. JS thread free for agent. Budget management: full
  when foregrounded, CSS-only when backgrounded, stop on AOD.

### `prefers-reduced-motion` as Power-Saving — P1
- **What**: When enabled, swap CSS animations for static states.
- **Why**: "Guardian sleep mode" = system-wide `prefers-reduced-motion`.
  Mascot shows sleeping pose, all animations reduced, battery extended.
  Single toggle for accessibility + battery + visual simplicity.

---

## 12. Privacy Visualization Research

### Privacy Pattern Catalog (NDSS 2026) — P2
- **URL**: https://arxiv.org/html/2601.13342v1
- **What**: 14 privacy considerations and 8 core design patterns from
  practitioner interviews.
- **Why**: Systematic framework. Each pattern maps to mascot behavior.

### Transparency by Design (2025) — P1
- **URL**: tandfonline.com/doi/full/10.1080/0144929X.2025.2520594
- **What**: 286 participants: visualizing privacy policies increases
  trust and lowers perceived intrusiveness.
- **Why**: Validates the entire mascot approach. Living guardian
  embodying privacy state > static indicators.

---

## Integration Priority

**P0:** Calm Technology principles, Mascot-as-dashboard design,
Compositor-only animation

**P1:** OGL rendering, CSS 3D transforms, springTo.js, escalation
ladder, openWakeWord, haptic language, Tone.js earcons, earcon design,
Thumb-Key/FUTO keyboard, prefers-reduced-motion/data, Transparency by
Design validation

**P2:** TWGL.js, FABRIK IK, Motion library, DaVoice, AOD mascot,
MediaPipe gestures, ZingTouch, Resonance Audio, HeliBoard, Privacy
Pattern Catalog

**P3:** TRMNL architecture, DARE-GP voice privacy
