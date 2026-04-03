# Walkthrough: Installing LETHE and First Boot

The user found OSmosis, got it running, and their phone is detected. Now they want to install LETHE.

---

## 1.1 — Start the Install from OSmosis

1. In the OSmosis web UI, with the phone detected, the user clicks "Install LETHE" (or equivalent)
2. Does OSmosis explain what's about to happen before starting?
3. Is there a confirmation step? ("This will replace your phone's operating system. Continue?")
4. Does OSmosis show a progress indicator once the install begins?
5. Does the progress bar show actual percentage (not just an indeterminate animation)?
6. Are the phases visible? (e.g., "Checking device... Building overlay... Verifying... Flashing...")

**Pass:** The user clicks one button to start. They see a real progress bar with percentage AND a label of what's happening. They know what's happening at every moment.

**Fail examples:** Install starts with no confirmation. Progress bar is stuck at 0% for minutes with no explanation. User doesn't know if it's working or frozen.

### Physical button moments

5. If the phone needs to enter recovery/download mode, does OSmosis show:
   - Which buttons to press (with a picture of the phone or clear text)?
   - How long to hold them (countdown timer)?
   - What the phone screen should look like when it works?
6. After the button press, does OSmosis confirm it detected the phone in the new mode?

**Pass:** Every physical step has visual guidance and a timer. User never wonders "did it work?"

**Fail examples:** "Boot into recovery" with no explanation of how. No countdown — user holds buttons and guesses. Phone enters recovery but OSmosis doesn't acknowledge it.

---

## 1.2 — Phone Reboots into LETHE

1. After install completes, does OSmosis tell the user what to expect? ("Your phone will restart. When it comes back, you'll see LETHE.")
2. How long does the first boot take? Is there a boot animation that reassures the user something is happening?
3. Does the phone land on the LETHE setup wizard (not a blank screen, not stock Android)?

**Pass:** Phone reboots, shows LETHE boot animation, lands on setup wizard. User knows it worked.

**Fail examples:** Long black screen with no feedback. Boot loop. Lands on stock launcher.

---

## 1.3 — Setup Wizard: Does It Make Sense?

Go through each wizard screen and ask: would my grandmother understand this?

### Screen: Welcome / Meet LETHE
- [ ] Does it explain who LETHE is in one sentence?
- [ ] Does it feel welcoming, not intimidating?

### Screen: Network Privacy (Tor)
- [ ] Does it explain the benefit without using the word "Tor"? (e.g., "Hide your internet activity")
- [ ] Is the default clear and safe for someone who doesn't know what this is?
- [ ] Can you skip it without feeling like you broke something?

### Screen: AI Provider (API key)
- [ ] Does it explain what this is for? ("LETHE can think faster with a cloud connection")
- [ ] Is skipping it the obvious path for someone who doesn't have an API key?
- [ ] Does it make clear the phone still works without one?

### Screen: Burner Mode
- [ ] Does the explanation land? ("Everything is erased when you restart the phone")
- [ ] Is the consequence of leaving it ON crystal clear?
- [ ] Would a non-technical person understand why they might want this?

### Screen: Dead Man's Switch
- [ ] Does it explain the concept without sounding scary?
- [ ] Is "skip" the obvious default? (DMS is opt-in)
- [ ] If enabled, is the passphrase step clear?

### Screen: Summary
- [ ] Does it show what was chosen in plain language?
- [ ] Can you go back and change something?
- [ ] Is there a "Done" button that feels final?

**Pass:** Every screen is understood on first read. No screen makes the user stop and think "what does this mean?" Total wizard time under 3 minutes.

---

## 1.4 — Landing on the Home Screen

1. After the wizard, the Void Launcher appears
2. Is it obvious that this is the home screen? (Clock, mascot visible)
3. Does the "tap the guardian" hint appear and make sense?
4. Does the user know how to open apps? (Swipe up isn't obvious to everyone — is there any hint?)

**Pass:** User can tell this is the home screen and knows how to get to their apps within 10 seconds.

**Fail examples:** Blank black screen with just a clock — user thinks the phone is broken. No hint about swiping up. User taps everywhere and nothing happens.
