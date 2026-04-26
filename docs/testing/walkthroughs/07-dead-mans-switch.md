# Walkthrough: Dead Man's Switch — If You Don't Check In

DMS protects the phone if the owner can't access it. This tests whether it works correctly and whether the user understands what they're enabling.

---

## 7.1 — Does the User Understand What This Is?

1. Go through the DMS setup (wizard or Settings)
2. Is the concept explained clearly without being scary?
   - Good: "If you can't unlock your phone for 24 hours, it will lock itself down and eventually erase your data"
   - Bad: "Dead man's switch: triggers wipe escalation after missed check-in window"
3. Is it clear this is opt-in (OFF by default)?

**Pass:** A non-technical user understands what DMS does, why they might want it, and what happens if they forget to check in.

---

## 7.2 — Checking In

1. After enabling DMS, wait for the check-in notification
2. Does the notification look innocuous? (Not "DEAD MAN'S SWITCH ACTIVE" — something subtle like "Scheduled maintenance")
3. Tap it, enter the passphrase
4. Does the deadline reset? Is there confirmation?

**Pass:** Notification blends in. Check-in is quick (tap, type passphrase, done). User knows it worked.

**Fail examples:** Notification says "DMS" or "wipe pending" where someone could see it. No confirmation that check-in succeeded. Passphrase prompt is a raw text field with no context.

---

## 7.3 — What Happens When You Miss It?

> **Test with a short interval (12h) on a SPARE device. These steps cause data loss.**

### Stage 1: Lock-down
1. Let the interval expire without checking in
2. Phone should lock to passphrase only (no fingerprint, no face unlock)
3. Can you still check in and recover?

**Pass:** Phone locks down. Passphrase still works to recover. Fingerprint is disabled.

### Stage 2: Wipe
1. Let the interval expire + 1 hour
2. Phone should wipe all data

**Pass:** Data wiped. Phone reboots clean.

### Stage 3: Brick (only if opted in)
1. Let the interval expire + 2 hours
2. Phone should overwrite boot and recovery — it will NOT turn on again normally

**Pass:** Phone is bricked. Re-flash via OSmosis is required to recover.

> **Only test Stage 3 if you have the device connected to OSmosis and can re-flash it.**

---

## 7.4 — Does Power-Off Cheat the Timer?

1. Enable DMS with a 12-hour interval
2. Check in (reset deadline)
3. Power off the phone completely for several hours
4. Power on

**Pass:** Elapsed time is counted even while the phone was off (hardware RTC). Timer was NOT paused.

**Fail examples:** Timer resets on power-on. Timer only counts time while the phone is awake.

---

## 7.5 — Can the User Disable It?

1. Go to Settings and find DMS
2. Try to disable it
3. It should require the DMS passphrase (so someone who stole the phone can't just turn it off)

**Pass:** Disabling requires passphrase. After disabling, no more check-in notifications.

**Fail examples:** Anyone can disable DMS without the passphrase. DMS setting is not findable. Disabling it doesn't actually stop the timer.

---

## 7.6 — Finding the Mesh Toggle

The mesh is a BLE transport for the dead man's switch — every LETHE
device in your trust ring broadcasts a 21-byte "I'm alive" heartbeat,
so peers know you've gone silent even when the internet is down. It is
**not** a chat or voice network — that's what Briar and Molly-FOSS are
for, both recommended in `docs/FEATURES.md`.

1. Open Settings → Providers panel
2. Scroll to **Mesh signaling — preview**
3. Read the description

**Pass:**
- Toggle is OFF by default
- Description includes "Not a chat — no messages, no voice, no files"
- Description tells the user to install Briar (offline / anonymous) or
  Molly-FOSS (Signal contacts) for actual conversations
- The "preview" tag is visible

**Fail examples:** Toggle is ON by default. Description sells the mesh
as a chat network. No mention of Briar/Molly. Toggle is hidden behind
a hidden gesture or only reachable via shell.

---

## 7.7 — Mesh Service Start and Stop

This verifies the toggle actually starts/stops the BLE foreground
service in real time, with no reboot required.

1. With mesh OFF, swipe down the notification panel — there should be
   no "LETHE Mesh" persistent notification
2. Toggle mesh ON in Settings
3. Within a couple of seconds, a persistent foreground-service
   notification appears (LETHE Mesh)
4. Toggle mesh OFF
5. The notification disappears within a couple of seconds

**Pass:** Notification appears on ON, disappears on OFF, no reboot
between transitions, no lingering notification from a previous session.

**Fail examples:** Toggle requires reboot to take effect. Service
notification persists after toggling OFF. Toggling causes a crash.

---

## 7.8 — Verifying the BLE Advert (tester-only)

> **This step is for testers, not end users. Requires a BLE scanner
> on a third device — nRF Connect (free on Play Store / F-Droid) is
> what we recommend.**

1. On the LETHE phone, enable mesh signaling (test 7.7)
2. On a third device, install nRF Connect
3. In nRF Connect, start a scan and filter by service UUID
   `4c455448-454d-4553-4831-000000000001` (ASCII: "LETHEMESH1")
4. The LETHE phone should appear as an advertiser. Tap it to inspect
   the manufacturer data — payload is 21 bytes
5. Disable mesh on LETHE — the advert disappears within ~2 seconds

**Pass:** Advert visible only when mesh is ON. Service UUID matches.
Payload length is 21 bytes (16-byte HMAC + 4-byte sequence + 1-byte
version, per `LetheMeshService` design).

**Fail examples:** Advert visible even with mesh OFF. Service UUID
wrong. Payload length wrong. Two LETHE devices with mismatched trust-
ring secrets accept each other's adverts as valid (HMAC verification
broken — log this as a P0 bug).

> **Cross-device pairing UX is v1.1 — for v1.0 the trust-ring secret
> must be shared out-of-band (file copy or QR), so this test only
> verifies advertising. End-to-end peer recognition is tested in v1.1.**
