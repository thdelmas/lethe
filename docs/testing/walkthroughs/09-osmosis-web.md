# Walkthrough: OSmosis Web UI — The User's Control Panel

OSmosis is the bridge between the user's computer and their phone. This tests whether the web UI is usable for someone who has never flashed a phone before.

---

## 9.1 — First Impression

1. Open OSmosis in a browser
2. Within 10 seconds, can you answer:
   - What is this tool for?
   - What should I do first?
   - Is my phone connected?
3. Is the layout clean and uncluttered?

**Pass:** Purpose and next action are immediately obvious. Connected device (if any) is prominently shown.

**Fail examples:** Landing page is a dashboard of API endpoints. User doesn't know where to click. Phone is plugged in but there's no indication.

---

## 9.2 — Device Connection Experience

1. Plug in a phone while OSmosis is open
2. Does the UI update automatically? (No page refresh needed)
3. Does it show the phone's name, model, and current OS?
4. If the phone needs USB debugging enabled, does OSmosis walk the user through it?

**Pass:** Phone appears automatically. User sees their phone's name and knows it's connected.

**Fail examples:** User has to refresh the page. Device appears as a serial number instead of a name. No guidance when USB debugging is off.

---

## 9.3 — Finding and Installing LETHE

1. With a phone connected, can you find the LETHE install option?
2. Is it clear what LETHE is and what will change on the phone?
3. Is the install button prominent? Does it require confirmation?
4. During install, is there a progress indicator showing what's happening?
5. If the phone needs physical button presses, does OSmosis guide you with pictures and timers?

**Pass:** Entire install flow is guided within the web UI. Progress is visible. Physical steps have visual guidance with countdown timers.

**Fail examples:** LETHE is in a submenu. Install starts with no warning. Progress bar gives no detail ("Installing..." for 10 minutes). Physical buttons described in text only — no image, no timer.

---

## 9.4 — Managing LETHE After Install

1. With LETHE installed and the phone connected, what can the user do from OSmosis?
   - See device status? (LETHE version, battery, storage)
   - Push an OTA update?
   - Trigger a backup or wipe?
2. Are these actions clear and accessible?

**Pass:** OSmosis is useful after install, not just during it. Status visible, actions available.

---

## 9.5 — Unsupported Phone

1. Plug in a phone that LETHE doesn't support
2. Does OSmosis tell the user clearly? ("This phone isn't supported yet")
3. Does it suggest alternatives or explain why?
4. Does it avoid showing a broken install button that would fail?

**Pass:** Clear "not supported" message. No broken install path. User isn't left guessing.

---

## 9.6 — Error Recovery

Test what happens when things go wrong:

- [ ] USB cable disconnected mid-install — does OSmosis notice and tell the user? Can they recover?
- [ ] Phone battery dies during install — does OSmosis warn about low battery before starting?
- [ ] Network drops during OTA build download — does OSmosis retry or explain?
- [ ] OSmosis is closed and reopened — does it recover state or start fresh?

**Pass:** Every error has a human-readable message and a suggested next step. Nothing is left in a broken state silently.
