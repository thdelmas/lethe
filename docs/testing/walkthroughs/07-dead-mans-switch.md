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
