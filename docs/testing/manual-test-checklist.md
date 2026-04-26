# LETHE Manual Test Checklist

Tests follow the user's journey: from finding OSmosis to daily-driving LETHE. Each step asks "would a real person get through this without help?"

For each test, the linked walkthrough has detailed steps, pass/fail criteria, and common fail examples.

### Before you start

You need:
- A computer (Linux, macOS, or Windows with WSL2)
- A supported phone (see device list in OSmosis) — **use a spare, NOT your daily phone**
- A USB data cable (not charge-only)
- 1–2 hours for a full run, or pick individual sections

### Symbols

- Tests marked with a walkthrough link have detailed step-by-step instructions
- No test requires terminal commands from the end user — if it does, that's a bug

---

## 0. Getting OSmosis Running — [walkthrough](walkthroughs/00-osmosis-setup.md)

*Can a user get OSmosis installed and see their phone in the web UI?*

- [ ] **0.1** User can find OSmosis and understand what it does within 30 seconds — [steps](walkthroughs/00-osmosis-setup.md#01--find-osmosis-and-understand-what-it-is)
- [ ] **0.2** OSmosis installs on the computer without cryptic errors — [steps](walkthroughs/00-osmosis-setup.md#02--install-osmosis-on-your-computer)
- [ ] **0.3** OSmosis launches and opens in the browser — [steps](walkthroughs/00-osmosis-setup.md#03--start-osmosis)
- [ ] **0.4** Phone is plugged in and detected — OSmosis guides through USB debugging if needed — [steps](walkthroughs/00-osmosis-setup.md#04--plug-in-your-phone)
- [ ] **0.5** LETHE is findable in the UI, and the phone's compatibility is clear — [steps](walkthroughs/00-osmosis-setup.md#05--find-lethe-and-understand-what-it-offers)

---

## 1. Installing LETHE — [walkthrough](walkthroughs/01-first-boot-setup.md)

*Can a user install LETHE from OSmosis and get through the setup wizard without confusion?*

- [ ] **1.1** One-click install from OSmosis, with progress and physical button guidance — [steps](walkthroughs/01-first-boot-setup.md#11--start-the-install-from-osmosis)
- [ ] **1.2** Phone reboots into LETHE (boot animation, then setup wizard) — [steps](walkthroughs/01-first-boot-setup.md#12--phone-reboots-into-lethe)
- [ ] **1.3** Setup wizard makes sense — every screen understood on first read, under 3 min total — [steps](walkthroughs/01-first-boot-setup.md#13--setup-wizard-does-it-make-sense)
- [ ] **1.4** Home screen appears and user knows what to do next — [steps](walkthroughs/01-first-boot-setup.md#14--landing-on-the-home-screen)

---

## 2. First 5 Minutes — [walkthrough](walkthroughs/02-void-launcher.md)

*Can a user do basic phone things immediately?*

- [ ] **2.1** User finds and opens apps within 30 seconds — [steps](walkthroughs/02-void-launcher.md#21--can-the-user-find-their-apps)
- [ ] **2.2** Phone calls work — [steps](walkthroughs/02-void-launcher.md#22--can-the-user-make-a-phone-call)
- [ ] **2.3** Text messages work — [steps](walkthroughs/02-void-launcher.md#23--can-the-user-send-a-text-message)
- [ ] **2.4** Camera works and photos are findable — [steps](walkthroughs/02-void-launcher.md#24--can-the-user-take-a-photo)
- [ ] **2.5** Web browsing works (with or without Tor) — [steps](walkthroughs/02-void-launcher.md#25--can-the-user-browse-the-web)
- [ ] **2.6** WiFi connects — [steps](walkthroughs/02-void-launcher.md#26--can-the-user-connect-to-wifi)
- [ ] **2.7** Agent responds when you tap the mascot — [steps](walkthroughs/02-void-launcher.md#27--can-the-user-talk-to-lethe)
- [ ] **2.8** Notifications work and are themed — [steps](walkthroughs/02-void-launcher.md#28--notifications)
- [ ] **2.9** Lock/unlock works, lock screen is themed — [steps](walkthroughs/02-void-launcher.md#29--locking-and-unlocking)

---

## 3. Meeting the Guardian — [walkthrough](walkthroughs/03-mascot-avatar.md)

*Does the mascot feel alive and appropriate for the device?*

- [ ] **3.1** Mascot makes a good first impression (alive, fits the device tier) — [steps](walkthroughs/03-mascot-avatar.md#31--first-impression)
- [ ] **3.2** Mascot reacts to taps, conversations, and inactivity — [steps](walkthroughs/03-mascot-avatar.md#32--interacting-with-the-guardian)
- [ ] **3.3** Mascot mood reflects device state (calm, alert, low battery) — [steps](walkthroughs/03-mascot-avatar.md#33--does-it-feel-like-a-guardian)
- [ ] **3.4** Mascot doesn't tank phone performance — [steps](walkthroughs/03-mascot-avatar.md#34--does-it-break-anything)

---

## 4. Talking to LETHE — [walkthrough](walkthroughs/04-agent-chat.md)

*Is the agent actually useful, or just a gimmick?*

- [ ] **4.1** Basic conversation works, tone feels like LETHE — [steps](walkthroughs/04-agent-chat.md#41--basic-conversation)
- [ ] **4.2** Everyday tasks work (timer, flashlight, open apps, call contacts) — [steps](walkthroughs/04-agent-chat.md#42--useful-everyday-tasks)
- [ ] **4.3** Agent answers privacy questions with real info about this device — [steps](walkthroughs/04-agent-chat.md#43--privacy-questions)
- [ ] **4.4** Agent works offline (slower but functional) — [steps](walkthroughs/04-agent-chat.md#44--offline--local-only-mode)
- [ ] **4.5** Agent feels like a guardian, not a chatbot — [steps](walkthroughs/04-agent-chat.md#45--does-it-feel-like-lethe)

---

## 5. Privacy — Does It Actually Work? — [walkthrough](walkthroughs/05-privacy-features.md)

*Is the user actually protected, and can they tell?*

- [ ] **5.1** Tor masks IP (and user can verify without a terminal) — [steps](walkthroughs/05-privacy-features.md#51--is-my-traffic-hidden-tor)
- [ ] **5.2** Ads and trackers are blocked — [steps](walkthroughs/05-privacy-features.md#52--are-trackers-blocked)
- [ ] **5.3** Google is gone, and alternatives are available — [steps](walkthroughs/05-privacy-features.md#53--is-google-gone)
- [ ] **5.4** Agent can report real-time privacy status — [steps](walkthroughs/05-privacy-features.md#54--can-the-user-verify-their-privacy)

---

## 6. Burner Mode — The Disappearing Phone — [walkthrough](walkthroughs/06-burner-mode.md)

*Does the user understand it, and does the wipe actually work?*

- [ ] **6.1** User knows burner mode is on (persistent, gentle indicator) — [steps](walkthroughs/06-burner-mode.md#61--does-the-user-know-its-on)
- [ ] **6.2** Reboot wipes everything (photos, WiFi, files, Bluetooth) — [steps](walkthroughs/06-burner-mode.md#62--does-the-wipe-actually-work)
- [ ] **6.3** MAC + Android ID randomized on each boot — [steps](walkthroughs/06-burner-mode.md#63--is-the-identity-randomized)
- [ ] **6.4** User can find the toggle and turn it off, data persists — [steps](walkthroughs/06-burner-mode.md#64--can-the-user-turn-it-off)
- [ ] **6.5** Panic wipe (power 5x) works fast — [steps](walkthroughs/06-burner-mode.md#65--emergency-wipe)
- [ ] **6.6** Duress PIN wipes silently while looking like a normal unlock — [steps](walkthroughs/06-burner-mode.md#66--duress-pin)

---

## 7. Dead Man's Switch — [walkthrough](walkthroughs/07-dead-mans-switch.md)

*Does the user understand what they're enabling, and does the escalation work? Also covers the BLE mesh signaling preview (DMS transport — not chat).*

- [ ] **7.1** DMS concept explained clearly (no jargon, not scary) — [steps](walkthroughs/07-dead-mans-switch.md#71--does-the-user-understand-what-this-is)
- [ ] **7.2** Check-in is quick, notification is discreet — [steps](walkthroughs/07-dead-mans-switch.md#72--checking-in)
- [ ] **7.3** Missed check-in escalates correctly (lock → wipe → brick) — [steps](walkthroughs/07-dead-mans-switch.md#73--what-happens-when-you-miss-it)
- [ ] **7.4** Timer counts real time even when phone is powered off — [steps](walkthroughs/07-dead-mans-switch.md#74--does-power-off-cheat-the-timer)
- [ ] **7.5** Disabling requires passphrase — [steps](walkthroughs/07-dead-mans-switch.md#75--can-the-user-disable-it)
- [ ] **7.6** Mesh toggle findable in Settings, OFF by default, description correctly says "DMS transport, not chat" with Briar/Molly redirect — [steps](walkthroughs/07-dead-mans-switch.md#76--finding-the-mesh-toggle)
- [ ] **7.7** Toggling mesh ON/OFF starts/stops the BLE service immediately, no reboot — [steps](walkthroughs/07-dead-mans-switch.md#77--mesh-service-start-and-stop)
- [ ] **7.8** With mesh ON, an HMAC-tagged 21-byte advert is broadcast on the LETHE service UUID (tester-only, requires a BLE scanner) — [steps](walkthroughs/07-dead-mans-switch.md#78--verifying-the-ble-advert-tester-only)

---

## 8. Updates — [walkthrough](walkthroughs/08-ota-updates.md)

*Can the phone update itself, and can OSmosis push updates offline?*

- [ ] **8.1** User is notified about updates in plain language — [steps](walkthroughs/08-ota-updates.md#81--does-the-user-know-updates-exist)
- [ ] **8.2** Online update: one tap, progress shown, phone reboots to new version — [steps](walkthroughs/08-ota-updates.md#82--installing-an-update-online)
- [ ] **8.3** Offline update via OSmosis USB: one click, no terminal — [steps](walkthroughs/08-ota-updates.md#83--installing-an-update-offline-via-osmosis)
- [ ] **8.4** Update security: signature + hash verified, tampered manifests rejected — [steps](walkthroughs/08-ota-updates.md#84--update-security-for-testers)

---

## 9. OSmosis Web UI — [walkthrough](walkthroughs/09-osmosis-web.md)

*Is OSmosis usable as the user's ongoing control panel?*

- [ ] **9.1** First impression: purpose and next action obvious within 10 seconds — [steps](walkthroughs/09-osmosis-web.md#91--first-impression)
- [ ] **9.2** Device connection is automatic with guided troubleshooting — [steps](walkthroughs/09-osmosis-web.md#92--device-connection-experience)
- [ ] **9.3** LETHE install is guided, with progress and physical button help — [steps](walkthroughs/09-osmosis-web.md#93--finding-and-installing-lethe)
- [ ] **9.4** Post-install: status, updates, and management are accessible — [steps](walkthroughs/09-osmosis-web.md#94--managing-lethe-after-install)
- [ ] **9.5** Unsupported phone: clear message, no broken install path — [steps](walkthroughs/09-osmosis-web.md#95--unsupported-phone)
- [ ] **9.6** Errors show human-readable messages with next steps — [steps](walkthroughs/09-osmosis-web.md#96--error-recovery)

---

## 10. Does It Work on MY Phone? — [walkthrough](walkthroughs/10-device-tiers.md)

*Test on at least one device per tier.*

- [ ] **10.1** Old phone (shallow): lean but functional, no lag or crashes — [steps](walkthroughs/10-device-tiers.md#101--old--low-end-phone-shallow-tier)
- [ ] **10.2** Mid-range phone (taproot): smooth experience, all features work — [steps](walkthroughs/10-device-tiers.md#102--mid-range-phone-taproot-tier)
- [ ] **10.3** Flagship phone (deeproot): full 3D mascot, fast agent, premium feel — [steps](walkthroughs/10-device-tiers.md#103--flagship-phone-deeproot-tier)
- [ ] **10.4** Tier is auto-detected — user never chooses or sees tier names — [steps](walkthroughs/10-device-tiers.md#104--tier-auto-detection)

---

## 11. Look and Feel — [walkthrough](walkthroughs/11-visual-theme.md)

*Does it feel like one product?*

- [ ] **11.1** Dark background consistent on every screen — [steps](walkthroughs/11-visual-theme.md#111--consistent-dark-theme)
- [ ] **11.2** Teal accent used consistently — [steps](walkthroughs/11-visual-theme.md#112--teal-accent-consistency)
- [ ] **11.3** Text is readable everywhere — [steps](walkthroughs/11-visual-theme.md#113--text-readability)
- [ ] **11.4** No stock Android/LineageOS branding visible — [steps](walkthroughs/11-visual-theme.md#114--no-stock-branding-leaking-through)
- [ ] **11.5** Overall vibe: cohesive product, not a ROM skin — [steps](walkthroughs/11-visual-theme.md#115--does-it-feel-like-something)

---

## 12. The Grandmother Test — [walkthrough](walkthroughs/12-adoption.md)

*Hand the phone to someone non-technical. Tell them nothing. What happens?*

- [ ] **12.1** They install LETHE via OSmosis without help — [steps](walkthroughs/12-adoption.md#121--can-they-install-lethe)
- [ ] **12.2** They figure out basic phone tasks (call, text, camera, browse) — [steps](walkthroughs/12-adoption.md#122--can-they-use-the-phone)
- [ ] **12.3** They talk to the guardian and get a useful response — [steps](walkthroughs/12-adoption.md#123--can-they-talk-to-the-guardian)
- [ ] **12.4** They can articulate what's different about this phone — [steps](walkthroughs/12-adoption.md#124--do-they-understand-whats-different)
- [ ] **12.5** Nothing breaks when they explore freely — [steps](walkthroughs/12-adoption.md#125--nothing-breaks-when-they-explore)
- [ ] **12.6** Would they use it? (Ask and document the answer) — [steps](walkthroughs/12-adoption.md#126--would-they-use-it)
