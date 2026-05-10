# LETHE v1.0.0 — The River of Forgetting

**May 4th, 2026**

LETHE is a privacy-hardened Android built on top of LineageOS. It's named after the river of forgetting in Greek mythology.

Growing up collecting old machines, I found hard drives full of data — photos, documents, accounts. People get rid of their devices but their devices don't get rid of them. Sometimes the best way to protect someone is to forget them.

OSmosis was built to free hardware from proprietary software. LETHE is where we're going next — free users from screens. We're not there yet. v1.0 is the foundation.

## What ships in v1.0

v1.0 is R&D. What's actually live in the image:

**Tor daemon, listening locally.** A bundled Tor daemon runs as a system service in its own SELinux domain (validated under enforcing on cm-14.1 t0lte). It listens on `127.0.0.1:9050` (SOCKS), `:9040` (TransPort), `:5400` (DNSPort). Apps that explicitly use SOCKS5 — Mull Browser, Briar, anything you point at the SOCKS port — route through it today. The iptables rules that would force *all* user-app TCP through the TransPort are silently dead in v1.0 (their shell-script init service is blocked by stock cm-14.1 SELinux until the v1.1 relabel pass) — see "Coming in v1.1" below.

**Tracker blocking at the system level.** A curated `hosts` file from StevenBlack and AdAway intercepts known ad and tracker domains for every app, no per-app config.

**Hardened DNS defaults.** Quad9 DNS-over-TLS primary, Mullvad fallback declared in the image's properties. The runtime applicator that pushes equivalent values into Settings.Global also ships in v1.1 with the rest of the userspace.

**No Google.** Play Services, Play Store, Maps, YouTube, Setup Wizard, GSF — all removed at build time. F-Droid + Aurora Store ship instead.

**Privacy sensor defaults.** Background location, body sensors, and nearby-devices access denied by default for all apps.

**LETHE theme.** Teal-on-black aesthetic, custom boot animation, dark wallpaper.

**Validated** end-to-end on Galaxy Note II (t0lte) under enforcing SELinux. Other codenames in the manifest use the same overlay pipeline and are expected to work, but have not been individually verified for v1.0.

## Coming in v1.1 (preview/in-flight)

The runtime components for these features have configuration shipped in the v1.0 image but their init services are silently failing because cm-14.1's stock SELinux policy doesn't grant init `execute_no_trans` on shell scripts inheriting the generic `system_file` label. The v1.1 sepolicy work (file_contexts entries mapping `/system/bin/lethe-*.sh` to a label init *can* exec) is what unblocks them:

- **Burner mode** — every-reboot wipe of user data, internal storage, WiFi/Bluetooth credentials, clipboard, notification log. MAC + Android ID rotation per cycle.
- **Tor transparent proxy** — iptables NAT redirect from all user-app TCP into the running Tor daemon's TransPort. UDP dropped to prevent leaks. Per-app circuit isolation. Not a toggle, a firewall rule.
- **Dead Man's Switch** — the missed-check-in escalation chain (lock → wipe → optional brick), duress PIN, hint-based recovery.
- **LETHE Agent** — the in-OS guardian. Provider-agnostic: bring your own LLM key. Cloud first, on-device for capable hardware.
- **Void launcher** — minimalist clock-and-mascot home screen with gesture navigation.
- **IPFS OTA** — Tor-routed Ed25519-signed firmware updates (no central update server).
- **Mesh signaling** — short-range BLE heartbeat between trust-ring devices as DMS transport (not chat — for chat install [Briar](https://briarproject.org) or [Molly-FOSS](https://molly.im)).
- **Panic wipe** — 5× power-button press, 5-second cancel window.
- **PT bridge selection** — obfs4 / meek / webtunnel / snowflake selectable via a persist prop.
- **ADB hardening** — paired-host RSA whitelisting, ADB-over-USB only by default.

## Supported devices

26 device codenames in the build manifest across 8 brands (Samsung, Pixel, Nothing, Fairphone, OnePlus, Xiaomi, Motorola, Sony) — including a Galaxy Note II from 2012 on the legacy LineageOS 14.1 base.

**v1.0 has been validated on Galaxy Note II (t0lte).** Builds for the other codenames listed in [manifest.yaml](../manifest.yaml) use the same overlay pipeline and are expected to work, but have not been individually verified for v1.0. Per-device validation rolls out in v1.0.x point releases.

Old phones in drawers are not trash — they have screens, mics, speakers, batteries, radios. They're perfect.

## Legal notice

**LETHE is not available everywhere.** Some countries restrict or ban privacy tools, encryption software, VPNs, or AI systems. Distributing, downloading, or using LETHE may violate local laws in certain jurisdictions.

**Do not use LETHE if you are in:** North Korea, Iran, Syria, Cuba, or any country under comprehensive US/EU sanctions. LETHE cannot be legally distributed to these regions.

**Use with caution in:** China, Russia, Belarus, Turkmenistan, Myanmar, Vietnam, and other countries that restrict encryption, VPNs, or AI agents. LETHE's privacy architecture (Tor enforcement, identity rotation, encrypted local storage) may conflict with lawful interception or data localization laws in your jurisdiction. **Check your local laws before installing.**

**AI-generated content (v1.1):** When the agent ships, all responses will be generated by language models. They may be inaccurate, incomplete, or outdated. LETHE is not a human. Verify anything that matters.

**Health (Bios topic, v1.1):** LETHE is not a medical device. When the agent discusses health, it provides general wellness information only. It does not diagnose, treat, predict, or prevent any disease or medical condition. Do not use it as a substitute for professional medical advice.

**Financial (PreuJust topic, v1.1):** LETHE is not a financial advisor. When the agent discusses finances, it provides general information only. It does not provide personalized investment advice, access bank accounts, or make financial decisions. Do not use it as a substitute for professional financial advice.

**Export controls:** LETHE includes encryption software. The source code is publicly available. Distribution may be subject to EU dual-use controls (Regulation 2021/821) and US EAR depending on jurisdiction. Open-source exemptions exist in both frameworks.

For the full legal and regulatory analysis, see [docs/research/legal-compliance.md](research/legal-compliance.md).

---

## What's next

Beyond the v1.1 features above: more protection modules. Health, finances, digital legacy, home network, your rights. All opt-in, all local. The goal is for LETHE to go from device guardian to life guardian.

---

*May the 4th be with you.*
