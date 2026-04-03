# Walkthrough: First 5 Minutes With the Phone

The user just finished setup. They're staring at the Void Launcher. What happens next?

---

## 2.1 — Can the User Find Their Apps?

1. The app drawer opens with swipe up — but does the user know that?
2. Is there a visual hint (subtle arrow, text, animation) that teaches the gesture?
3. Once open, can the user find a specific app quickly? (Alphabetical, searchable?)
4. Can the user get back to the home screen easily?

**Pass:** User finds and opens an app within 30 seconds of first seeing the home screen.

**Fail examples:** User stares at the screen and doesn't know what to do. User swipes left/right expecting pages (like stock Android). App drawer has no search — user scrolls through 50 apps.

---

## 2.2 — Can the User Make a Phone Call?

1. From the home screen, find and open the dialer
2. Make a call
3. Receive a call

**Pass:** Calling works. Finding the dialer is intuitive (app drawer or agent: "call mom").

**Fail examples:** No dialer app installed. Dialer is there but Tor routing breaks cellular. User can't find it without knowing the app name.

---

## 2.3 — Can the User Send a Text Message?

1. Find and open the messaging app
2. Send and receive an SMS

**Pass:** Messaging works out of the box. App is findable.

---

## 2.4 — Can the User Take a Photo?

1. Find and open the camera app
2. Take a photo
3. Find the photo afterward (gallery / file manager)
4. **With burner mode ON:** Does the user understand the photo will be gone after reboot?

**Pass:** Camera works. Photo is viewable. If burner is ON, there's a visible reminder that data won't persist.

**Fail examples:** No camera app. Photo is saved but user can't find it. Burner mode silently deletes photos with no warning.

---

## 2.5 — Can the User Browse the Web?

1. Find and open the browser
2. Visit a website
3. Is Tor working transparently? (Page loads, maybe slower — no error)
4. If Tor is OFF, does browsing still work normally?

**Pass:** Web browsing works. If Tor is ON, pages load (may be slower). User isn't asked to configure anything.

**Fail examples:** No browser installed. Tor blocks all traffic. DNS doesn't resolve. User gets a certificate error.

---

## 2.6 — Can the User Connect to WiFi?

1. Go to Settings (via app drawer or ask the agent: "connect to WiFi")
2. Find the WiFi settings
3. Connect to a network

**Pass:** WiFi settings reachable. Connection works. MAC randomization doesn't break anything the user can see.

---

## 2.7 — Can the User Talk to LETHE?

1. Tap the mascot on the home screen
2. Ask something simple: "What's the weather?" or "What can you do?"
3. Does the agent respond? Is the response helpful?
4. Can the user figure out how to dismiss the chat and go back to the home screen?

**Pass:** Agent responds. Response is useful. Getting back to the home screen is obvious.

**Fail examples:** Tapping the mascot does nothing. Agent responds but the text is too small / overlaps the UI. No way to close the chat panel. Agent says "I am running on my own" with no further explanation.

---

## 2.8 — Notifications

1. Receive a notification (send yourself a message, set a timer, etc.)
2. Does it appear? Can you swipe down to see it?
3. Does tapping it open the right app?
4. Is the notification style consistent with the LETHE theme (dark, teal accents)?

**Pass:** Notifications work, are visible, and match the theme.

---

## 2.9 — Locking and Unlocking

1. Lock the phone (power button or double-tap)
2. Lock screen shows LETHE theme (not stock)
3. Unlock the phone
4. Does the mascot play a wake animation?

**Pass:** Lock/unlock works. Lock screen is LETHE-themed. Return to home screen is seamless.
