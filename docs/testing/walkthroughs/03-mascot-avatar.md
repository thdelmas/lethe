# Walkthrough: Meeting the Guardian

The mascot is the user's main way to interact with LETHE. This tests whether the experience feels alive, responsive, and trustworthy — not whether the FPS counter hits a target.

---

## 3.1 — First Impression

1. Look at the mascot on the home screen
2. Does it feel alive? (Breathing, subtle movement, not a frozen image)
3. Does it fit the phone's capabilities?
   - Old/cheap phone: a still image is fine — as long as it doesn't try to load a 3D model and lag
   - Mid-range phone: smooth sprite animation
   - Flagship: full 3D model with detail
4. Does the mascot's appearance match the LETHE identity? (Cracked stone, teal glow, guardian feel)

**Pass:** Mascot looks intentional. User feels like someone's home. No lag, no broken textures, no blank space where the mascot should be.

**Fail examples:** Black rectangle where the mascot should be. 3D model loads on a weak phone and the whole UI freezes. Static image on a flagship feels cheap.

---

## 3.2 — Interacting With the Guardian

1. Tap the mascot — does it react? (Wave, walk, or run animation — varies each tap)
2. Tap several times — do you see variety? (At least 2 different animations in 5 taps)
3. Say something — does the speaking animation play while LETHE responds?
4. After the conversation, does the mascot settle back to idle? (50% chance of a post-reply animation)
5. Leave the phone alone for 2+ minutes — does the mascot start fidgeting? (walk/run)
6. Leave it 5+ minutes — does it go sleepy?
7. Touch the mascot while sleepy/asleep — does it play the warm-up animation?

**Pass:** The mascot feels responsive to what you're doing. Animations match context (calm → fidget → sleep). Transitions are smooth, not jarring. All animations stay green (no mood color bleed).

**Fail examples:** Tap the mascot and nothing visible changes. Same animation every tap. Speaking animation plays 5 seconds after the response. Mascot gets stuck in one state. Animation plays in wrong color (red/blue when mood is green).

---

## 3.3 — Does It Feel Like a Guardian?

1. Ask LETHE something it should refuse (e.g., "disable all my security")
   - Does the mascot show a "deny" reaction? (Head shake, posture change)
2. Trigger a security event if possible (DMS notification, unknown USB)
   - Does the mascot shift to alert mode? (Teal glow intensifies, posture tightens)
3. Let the battery get low (or simulate)
   - Does the mascot look tired/dim?

**Pass:** The mascot's mood reflects what's happening. You can *feel* the guardian watching.

**Fail examples:** Mascot looks the same whether everything is fine or the phone is about to wipe itself. Alert state is identical to idle.

---

## 3.4 — Does It Break Anything?

1. While the mascot is animating, try using the phone normally (open apps, swipe, type)
2. Does the mascot animation cause lag or block interaction?
3. On a low-end device, does the mascot gracefully degrade rather than tank performance?

**Pass:** Mascot is eye candy, not a tax. Phone stays responsive regardless of mascot state.
