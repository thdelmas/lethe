# Walkthrough: Does It Work on MY Phone?

LETHE targets everything from 10-year-old phones to current flagships. This tests whether the experience scales gracefully — not that every phone gets every feature, but that every phone gets a GOOD experience.

---

## 10.1 — Old / Low-End Phone (Shallow Tier)

Example: Samsung Galaxy Note II (GT-N7100), 2GB RAM, ARMv7

The experience should be lean but functional:

- [ ] Phone boots without running out of memory
- [ ] Launcher is responsive — swipes and taps react within 2 seconds
- [ ] Mascot is a static image (not trying to render 3D/sprites and lagging)
- [ ] Agent responds (using smallest local model) without freezing the UI
- [ ] Calling, texting, and browsing all work
- [ ] Battery life isn't destroyed by background services

**Pass:** The phone feels intentionally minimal, not broken. A user with this phone has a complete experience — just without the bells and whistles.

**Fail examples:** Phone is unusable due to lag. Agent takes 60 seconds to respond. UI constantly crashes. Battery dies in 2 hours from Tor + IPFS.

---

## 10.2 — Mid-Range Phone (Taproot Tier)

Example: Nothing Phone 1, 8GB RAM, ARM64

The sweet spot — most users will be here:

- [ ] Mascot has smooth 2D sprite animations
- [ ] Agent responds quickly (local model: first token under 5 seconds)
- [ ] All features work concurrently (Tor + IPFS + agent) without overheating
- [ ] Battery lasts a normal day with typical use
- [ ] Everything from the shallow tier also works, just better

**Pass:** Phone feels like a complete product. Nothing feels slow or compromised.

---

## 10.3 — Flagship Phone (Deeproot Tier)

Example: Google Pixel 7, 8GB RAM, Mali-G710

The full experience:

- [ ] Mascot is a full 3D WebGL model, smooth 60 FPS
- [ ] Gyroscope parallax works (tilt phone, mascot responds)
- [ ] Eye gaze tracking works (tap different areas, mascot looks)
- [ ] Agent uses larger local model (Qwen 3 4B) and cloud routing for complex tasks
- [ ] Everything from shallow + taproot tiers also works

**Pass:** The phone shows off everything LETHE can do. The 3D mascot feels premium, not gimmicky.

---

## 10.4 — Tier Auto-Detection

The user should NEVER have to choose their tier manually.

1. Install LETHE on each device
2. Does it automatically pick the right mascot tier?
3. Does it automatically pick the right local model size?
4. If the device is borderline (e.g., 4GB RAM ARM64), does it pick the safer/lighter option?

**Pass:** Tier detection is automatic and correct. User never sees the words "shallow", "taproot", or "deeproot."
