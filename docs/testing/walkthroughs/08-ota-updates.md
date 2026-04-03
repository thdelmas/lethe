# Walkthrough: Keeping LETHE Updated

The phone needs to update itself. This tests whether updates work and whether the user even has to think about them.

---

## 8.1 — Does the User Know Updates Exist?

1. When an update is available, how does the user find out?
   - Notification? Agent mentions it? Settings badge?
2. Is the update described in plain language? ("A new version of LETHE is available with security fixes")
3. Does the user need to do anything, or is it automatic?

**Pass:** User is notified about updates in a way they'll notice. Language is plain.

**Fail examples:** Updates happen silently with no notification (user doesn't know their phone just changed). Update notification says "IPNS manifest v2 published, CID: Qm..." No notification at all — user has to check manually.

---

## 8.2 — Installing an Update (Online)

1. When an update is available, can the user install it with one tap?
2. Does the phone show progress?
3. Does the phone verify the update before installing? (Signature + hash — but the user doesn't need to know this)
4. After reboot, is the phone on the new version? (Check Settings > About Phone)

**Pass:** One tap to update. Progress visible. Phone reboots to new version. User's data and settings preserved (unless burner mode is on).

**Fail examples:** Update requires terminal commands. Download stalls with no error. Phone won't boot after update.

---

## 8.3 — Installing an Update (Offline, via OSmosis)

1. Phone has no network (airplane mode, no WiFi, no cellular)
2. Connect phone to computer running OSmosis via USB
3. Can OSmosis push the update to the phone?
4. Does it work without the user running any commands?

**Pass:** OSmosis detects that an update is available and offers to install it. One click. No terminal.

**Fail examples:** Offline update requires `adb sideload` in a terminal. OSmosis doesn't offer OTA via USB.

---

## 8.4 — Update Security (for testers)

These are technical checks — the user won't do these, but we need to verify they work:

- [ ] Manifest signature is verified (Ed25519) before download starts
- [ ] Phone only downloads its own codename's build, not all devices
- [ ] SHA256 of downloaded file matches the manifest
- [ ] A tampered manifest is rejected (modify a byte — phone refuses)
- [ ] If Tor is enabled, OTA download traffic goes through Tor
