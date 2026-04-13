# LETHE v1.0.0 — Privacy Android that forgets everything on reboot

**A LineageOS overlay with burner mode, Tor enforcement, and an AI guardian built into the OS.**

LETHE is not a ROM — it's an overlay you flash on top of LineageOS. It adds privacy hardening, identity rotation, and an embedded AI agent without forking or modifying the LineageOS source.

Every reboot wipes your data by default. Every connection routes through Tor. Every tracker is blocked at the system level. The phone forgets — and that's the point.

---

## What's different from stock LineageOS?

| Feature | LineageOS | LETHE |
|---------|-----------|-------|
| Data on reboot | Persists | Wiped (burner mode, disable in Settings) |
| Network routing | Direct | All user traffic through Tor |
| Trackers | Not blocked | 37+ domains blocked via hosts |
| Google services | Optional | Removed at build time |
| Identity | Fixed | MAC + Android ID + serial rotated on boot |
| AI agent | None | Built-in guardian (text + voice input) |
| Firewall | Permissive | Default-deny, user apps Tor-only |
| DNS | Google/ISP | Quad9 DNS-over-TLS, Mullvad fallback |
| Panic wipe | None | 5x power press = instant wipe |
| Dead man's switch | None | Missed check-in → lock → wipe → brick |
| Launcher | Trebuchet | Void — clock + mascot + gestures |

---

## Supported devices

### Android 15 (LineageOS 22.1)

| Brand | Device | Codename |
|-------|--------|----------|
| Google | Pixel 7 | panther |
| Google | Pixel 7 Pro | cheetah |
| Google | Pixel 7a | lynx |
| Google | Pixel 8 | shiba |
| Google | Pixel 8 Pro | husky |
| Google | Pixel 8a | akita |
| Google | Pixel 9 | caiman |
| Google | Pixel 9 Pro | komodo |
| Google | Pixel 9 Pro Fold | tokay |
| Nothing | Phone (1) | spacewar |
| Nothing | Phone (2) | pong |
| Nothing | Phone (2a) | pacman |
| Fairphone | Fairphone 4 | FP4 |
| Fairphone | Fairphone 5 | FP5 |
| OnePlus | 8 Pro | instantnoodlep |
| OnePlus | 9 | lemonades |
| OnePlus | 9 Pro | martini |
| Xiaomi | Mi 11 Lite 4G | courbet |
| Xiaomi | Mi 11 Lite 5G | renoir |
| Motorola | Moto G7 Plus | hawao |
| Motorola | Moto G52 | devon |
| Sony | Xperia 1 II | pdx206 |
| Sony | Xperia 1 III | pdx215 |
| Samsung | Galaxy Tab S 10.5 | chagalllte |

### Android 7.1 (LineageOS 14.1, legacy)

| Brand | Device | Codename | Notes |
|-------|--------|----------|-------|
| Samsung | Galaxy Note II | t03g | Exynos 4412, tested |
| Samsung | Galaxy Note II LTE | t0lte | Exynos 4412, tested |

---

## Requirements

- A supported device with LineageOS already installed
- A computer running Linux (macOS/Windows with WSL2 also work)
- A USB data cable (not charge-only)
- OSmosis installed on the computer (optional but recommended)

---

## Install instructions

### Option A: Via OSmosis (recommended)

```bash
git clone https://github.com/thdelmas/OSmosis.git ~/OSmosis
cd ~/OSmosis && make install && make serve
```

1. Plug your phone in via USB
2. OSmosis detects the device and shows compatible OS options
3. Select LETHE, click Build
4. OSmosis builds the overlay and flashes it to your phone
5. Reboot — LETHE is active

### Option B: Manual sideload

1. Install LineageOS on your device (follow the official LineageOS wiki for your device)

2. Download the LETHE overlay ZIP for your device from the GitHub releases page

3. Boot into TWRP recovery:
   - **Samsung**: Power off, hold Volume Down + Home + Power
   - **Pixel/OnePlus/Xiaomi/Motorola/Fairphone**: Power off, hold Volume Down + Power
   - **Nothing/Sony**: Power off, hold Volume Down + Power

4. In TWRP, select "Advanced" → "ADB Sideload" → swipe to start

5. On your computer:
   ```bash
   adb sideload Lethe-1.0.0-YOUR_CODENAME.zip
   ```

6. After it finishes, tap "Reboot System"

7. LETHE is now active. Burner mode is ON by default — your data will be wiped on every reboot. To disable: Settings → Privacy → Burner Mode.

---

## Setting up the AI agent

The LETHE agent needs a cloud provider key to respond (local models coming soon).

### From OSmosis (easiest)
1. With the phone connected, open OSmosis in your browser
2. The connected device page shows "Set up LETHE AI"
3. Select a provider (OpenRouter recommended — free tier available)
4. Enter your API key and click "Send to phone"
5. Tap the mascot on your phone — the agent responds

### From the phone
1. Tap the mascot to open chat
2. Type `/settings`
3. Enter your API key in the provider section
4. Tap Save

**Note:** In burner mode, keys are wiped on reboot. Re-pair via OSmosis after each restart, or disable burner mode for persistence.

---

## What's included

- **Void Launcher** — minimalist home screen. Clock + mascot. Swipe up for apps. Tap mascot to chat.
- **Tracker blocking** — system-level hosts file blocking 37+ ad/tracking domains
- **Tor transparent proxy** — all user app traffic forced through Tor via iptables
- **Default-deny firewall** — no inbound connections, user apps can only reach Tor
- **Burner mode** — wipes /data on every reboot (user data, WiFi, Bluetooth, notifications)
- **Identity rotation** — randomizes MAC address, Android ID, and device serial on each boot
- **Dead man's switch** — opt-in. Lock → wipe → brick if you miss a check-in
- **Panic wipe** — press power 5 times rapidly for immediate data wipe
- **Duress PIN** — secondary PIN that silently wipes data while appearing to unlock normally
- **Lockdown tile** — Quick Settings tile to kill WiFi, Bluetooth, and mobile data in one tap
- **DNS-over-TLS** — Quad9 primary, Mullvad fallback. No Google DNS.
- **LETHE agent** — AI guardian with tool calling (timer, alarm, flashlight, open apps, privacy status)
- **EU AI Act compliance** — AI disclosure labels, consent dialog for cloud providers, transparency info panel

---

## What's NOT included (yet)

- Local on-device AI models (llama.cpp + Qwen 3 — coming in v1.1)
- Mesh networking between LETHE devices (coming in v1.1)
- Anthropic OAuth (use your claude.ai subscription — coming in v1.1)
- WiFi QR code scanner
- Per-app sensor permissions
- Verified boot (AVB relock for Pixels)

---

## Screenshots

*(screenshots to be added before May 4th)*

---

## Legal

Check your local laws regarding encryption and privacy software before installing. Some countries restrict or ban Tor, VPNs, encryption tools, or AI systems. Full legal disclaimers: [PRIVACY.md](https://github.com/thdelmas/lethe/blob/main/PRIVACY.md)

---

## Source code

- **LETHE overlay:** [github.com/thdelmas/lethe](https://github.com/thdelmas/lethe)
- **OSmosis (installer):** [github.com/thdelmas/OSmosis](https://github.com/thdelmas/OSmosis)

## Community

- **Discord (LETHE):** https://discord.gg/tAqyY47Szp
- **Discord (OSmosis):** https://discord.gg/vWqxwvRpJe

---

## FAQ

**Q: Will this brick my phone?**
A: No. LETHE is an overlay on LineageOS — you can always re-flash stock LineageOS to remove it.

**Q: Can I keep my data between reboots?**
A: Yes — disable burner mode in Settings → Privacy after first boot. Data will persist normally.

**Q: Does the AI agent phone home?**
A: Only if you configure a cloud provider. With no API key, the agent is silent. Local models for fully offline operation are coming in v1.1.

**Q: Why not just use GrapheneOS?**
A: Different goals. GrapheneOS is deeper security on Pixels only. LETHE is operational security (burner mode, dead man's switch, identity rotation) on 26 devices from 8 brands, with an AI agent built in.

**Q: Is Tor always on?**
A: By default, yes. All user app traffic routes through Tor. System services (NTP, DNS-over-TLS, DHCP) go direct. You can configure this in Settings.

**Q: My old phone from 2012 — will it work?**
A: If it runs LineageOS, probably yes. The Galaxy Note II (2012) is a tested device.
