# Walkthrough: Burner Mode — The Disappearing Phone

Burner mode erases everything when the phone restarts. This tests whether the user understands what that means *before* they lose data, and whether the wipe actually works.

---

## 6.1 — Does the User Know It's On?

1. Burner mode is ON by default. Is there a persistent, gentle reminder?
   - Status bar icon? Subtle indicator on the home screen? Agent mentions it on first chat?
2. If the user saves a photo, downloads a file, or connects to WiFi — are they warned that this data won't survive a reboot?

**Pass:** User is never surprised by data loss. The phone communicates "I forget everything when I restart" in a way that's clear but not nagging.

**Fail examples:** No visible indicator. User takes 50 photos and discovers they're gone after a reboot. Warning only exists in a settings menu nobody opens.

---

## 6.2 — Does the Wipe Actually Work?

1. With burner mode ON:
   - Save a photo
   - Connect to a WiFi network
   - Pair a Bluetooth device
   - Download a file
2. Reboot the phone
3. After reboot, check:
   - [ ] Photo is gone
   - [ ] WiFi network is forgotten
   - [ ] Bluetooth pairing is gone
   - [ ] Downloaded file is gone
   - [ ] Setup wizard reappears (clean state)

**Pass:** Everything is gone. Phone is indistinguishable from a fresh install.

---

## 6.3 — Is the Identity Randomized?

1. Before reboot, note the phone's MAC address and Android ID (Settings > About Phone)
2. Reboot
3. Check again

**Pass:** Both values are different. The phone is a new "person" after every reboot.

---

## 6.4 — Can the User Turn It Off?

1. Go to Settings and find burner mode
2. Is it obvious where to find it?
3. Toggle it OFF
4. Reboot
5. Is all data preserved?

**Pass:** Toggle is findable. Turning it OFF does what the user expects — data survives reboot.

**Fail examples:** Burner mode setting is buried under 3 levels of menus. Turning it off requires a terminal command. Data is still wiped after turning it off (bug).

---

## 6.5 — Emergency Wipe

1. With the phone on (locked or unlocked), long-press the power button 5 times
2. Does a wipe trigger?
3. How fast is it? Does the phone give any feedback (vibration, screen flash)?

**Pass:** Panic wipe triggers reliably. Happens fast. Some feedback so the user knows it worked.

**Fail examples:** Nothing happens. Wipe takes 2 minutes during which the phone looks normal. Triggers accidentally from normal power button use.

---

## 6.6 — Duress PIN

1. Set up a duress PIN (Settings or during setup)
2. Lock the phone
3. Enter the duress PIN on the lock screen
4. The phone should appear to unlock normally — no alarm, no special screen
5. In the background, data is being wiped

**Pass:** Looks like a normal unlock to anyone watching. Data is silently erased. Phone reboots clean afterward.

**Fail examples:** Entering the duress PIN shows a "wiping..." screen (defeats the purpose). Wipe doesn't actually happen.
