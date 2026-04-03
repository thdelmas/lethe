# Walkthrough: Does It Look and Feel Like LETHE?

Every screen the user sees should feel like one product. This tests visual consistency and polish.

---

## 11.1 — Consistent Dark Theme

Visit these screens and check that the background is consistently near-black (#080404):

- [ ] Home screen (Void Launcher)
- [ ] App drawer
- [ ] Lock screen
- [ ] Notification shade
- [ ] Settings
- [ ] Agent chat panel
- [ ] Setup wizard

**Pass:** Dark everywhere. No screen flashes white when loading. No bright settings pages breaking the mood.

**Fail examples:** Settings uses stock Android white theme. Notification shade is grey. App drawer has a different black than the home screen.

---

## 11.2 — Teal Accent Consistency

Check that teal (#22e8a0) is used consistently for interactive/accent elements:

- [ ] Clock breathing dot
- [ ] App drawer first-letter highlights
- [ ] Agent chat highlights
- [ ] Mascot bioluminescent veins
- [ ] Toggle switches and selection indicators
- [ ] Lock screen accent elements

**Pass:** One accent color throughout. Feels intentional.

**Fail examples:** Some toggles are stock blue. Clock dot is a different shade of green. Mix of teal and cyan.

---

## 11.3 — Text Readability

- [ ] Body text is tan/beige (#dcc8c0) and easy to read on the dark background
- [ ] No screen has text that's too small, too faint, or clipped
- [ ] Contrast is sufficient for reading in direct sunlight

**Pass:** All text is readable without squinting. Colors are warm, not harsh.

---

## 11.4 — No Stock Branding Leaking Through

- [ ] Boot animation is LETHE (not LineageOS or Android)
- [ ] About Phone mentions LETHE (not just "LineageOS 22.1")
- [ ] No "Powered by Android" or Google logos anywhere visible
- [ ] Lock screen, status bar, and notification styling are all themed

**Pass:** A user would never know this is based on LineageOS unless they go digging.

---

## 11.5 — Does It Feel Like Something?

This is the vibe check. After using the phone for 10 minutes:

- [ ] Does it feel like a cohesive product or a skin on top of Android?
- [ ] Does the visual identity (dark, teal, stone guardian) come through consistently?
- [ ] Would you show this to someone and say "look at this" or apologize for the rough edges?

**Pass:** It feels like a product someone designed, not a ROM someone compiled.
