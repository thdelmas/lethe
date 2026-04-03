# Walkthrough: Getting OSmosis Running

You need a computer with OSmosis to install LETHE on a phone. This walkthrough tests whether a user can get there without help.

---

## 0.1 — Find OSmosis and Understand What It Is

1. Starting from scratch (you've heard about LETHE or OSmosis), try to find the install page
2. How many hops does it take? Can you go from a search or a link straight to "install this"?
3. Once you're on the OSmosis page, can you figure out what it does in under 30 seconds?
4. Is it clear that OSmosis is the tool you use to install LETHE on your phone?
5. Is there a "Get Started" or "Download" button that stands out?

**Pass:** A first-time visitor finds OSmosis and understands what to do within 30 seconds. No wall of text, no jargon. Ideally one hop from wherever they heard about it.

**Fail examples:** Landing page leads with technical specs. "Get Started" is buried below the fold. User has to read a README on GitHub to understand anything.

### Known finding (2026-04-01)

Users can arrive via `theophile.world/project/osmosis` or directly on the GitHub repo. Either way, the GitHub README is the effective landing page. Test whether the README gets a new user from "I just got here" to "I'm installing OSmosis" without friction — is the first thing they see a clear pitch and a get-started path, or a wall of technical details?

---

## 0.2 — Install OSmosis on Your Computer

1. Follow whatever install instructions OSmosis provides
2. Note every moment where you feel lost, need to Google something, or hit an error
3. Pay attention to:
   - Does it tell you what OS you need? (Linux, macOS, Windows)
   - Does it explain what to install and how? Or does it assume you know what `apt`, `brew`, or `pip` means?
   - If a command fails, does the error message tell you what to do next?

**Pass:** A user who has never opened a terminal can get OSmosis installed by following the instructions. If terminal commands are required, each one is explained (what it does, not just what to type).

**Fail examples:** Instructions say "install Heimdall" without explaining what it is or why. A step assumes you have Node.js but doesn't check or tell you how to get it. `make install` fails with a cryptic error and no guidance.

> **Note for testers:** If this step requires technical knowledge today, that's a valid test finding — file it as a UX issue. The goal is to make this accessible.

---

## 0.3 — Start OSmosis

1. After installation, how do you launch OSmosis?
2. Is it obvious? Is there a desktop shortcut, a single command, an app icon?
3. Does OSmosis open in your browser automatically, or do you have to know to go to `localhost:5000`?

**Pass:** One action to launch (double-click, single command, app icon). Browser opens automatically.

**Fail examples:** User has to remember `make serve`. User has to know what `localhost:5000` means. Nothing tells the user OSmosis is running.

---

## 0.4 — Plug In Your Phone

1. Plug a phone into the computer via USB
2. Does OSmosis detect it? How long does it take?
3. If the phone needs USB debugging enabled, does OSmosis tell the user how to do it — step by step, on the phone screen, with pictures?
4. If the phone asks "Trust this computer?", does OSmosis tell the user to look at their phone?

**Pass:** OSmosis either detects the phone automatically, or walks the user through enabling detection with on-screen guidance. No terminal commands needed.

**Fail examples:** OSmosis shows nothing — user doesn't know if it's working or broken. Instructions say "enable USB debugging" but don't explain where that setting is. User needs to run `adb devices` in a terminal to diagnose.

### Common real-world snags to test:

- [ ] Phone is plugged in but set to "charge only" mode — does OSmosis notice and guide the user?
- [ ] Phone has USB debugging OFF — does OSmosis explain how to turn it on?
- [ ] Phone shows "Trust this computer?" — does OSmosis prompt the user to check their phone screen?
- [ ] USB cable is charge-only (no data) — does OSmosis suggest trying a different cable?
- [ ] User plugs in before OSmosis is running — does it pick up the phone when it starts?

---

## 0.5 — Find LETHE and Understand What It Offers

1. With the phone detected, can you find the LETHE option in OSmosis?
2. Is it clear what LETHE will do to the phone?
3. Does it explain:
   - What you're getting (privacy OS, guardian agent, clean launcher)
   - What you're giving up (Google apps, Play Store)
   - Whether it's reversible
4. Is the phone's compatibility shown clearly (supported / not supported / partial)?

**Pass:** User understands what they're about to install and can make an informed decision. No surprises.

**Fail examples:** LETHE is listed as a codename with no explanation. No mention of what gets removed. User doesn't know if their phone is supported until they try to install.

---

## 0.6 — Troubleshooting (for testers)

These are known friction points. If you hit any of them, note whether OSmosis handled it or whether you had to figure it out yourself.

| Situation | OSmosis should... |
|---|---|
| Phone not detected | Show a help panel with cable/USB-debugging/trust steps |
| Wrong USB mode on phone | Prompt to switch from "charge only" to "file transfer" or similar |
| Unsupported phone plugged in | Say clearly "this phone isn't supported yet" with a link to supported devices |
| `make install` fails | Show which dependency is missing and how to install it |
| Port 5000 already in use | Detect the conflict and suggest a fix or use another port |
| User on Windows without WSL | Explain that WSL2 is needed, link to setup guide |
