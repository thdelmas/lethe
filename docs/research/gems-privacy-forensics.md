# Hidden Gems: Privacy, Anti-Forensics & Counter-Surveillance

> Research compiled 2026-03-31. Part of the hidden-gems series.
> Priority: P0 (ship-blocking), P1 (next release), P2 (3-6mo), P3 (long-term).

Already in LETHE: Tor, burner mode, dead man's switch, duress PIN,
IPFS OTA, hosts-file blocking, DNS-over-TLS (Quad9/Mullvad), EXIF
stripping (Scrambled Exif), PanicKit, PixelKnot steganography.

---

## 1. Anti-Forensic Tools

### Android AntiForensic Tools — P1
- **URL**: https://github.com/bakad3v/Android-AntiForensic-Tools
- **What**: Silently destroys data on trigger: duress password, USB
  connect, button sequence, wrong-password threshold. Runs TRIM after
  deletion, disables logs, disables safe boot mode. Successor to Wasted
  (which breaks on Android 14+).
- **Android**: 8.0+. Uses device owner rights for wipeDevice on 14+.
- **Why**: Solves the critical Wasted Android 14+ breakage. TRIM-after-
  delete and log-disabling go beyond factory reset.

### mFSTRIM — P1
- **URL**: https://xdaforums.com/t/mfstrim-utility.4258765/
- **What**: Forces TRIM on Android flash storage immediately. Android's
  built-in TRIM only runs weekly during charging at midnight.
- **Android**: No root required. FOSS.
- **Why**: File delete + forced TRIM = forensic recovery essentially
  impossible. LETHE's burner mode should trigger this automatically.

### Shufflecake (Hidden Encrypted Volumes) — P3
- **URL**: https://shufflecake.net / https://codeberg.org/shufflecake
- **What**: Spiritual successor to TrueCrypt hidden volumes. Multiple
  nested hidden encrypted filesystems. Each volume has different key;
  decoy reveals only decoy data. Performance exceeds bare dm-crypt/LUKS.
  Published ACM CCS 2023.
- **Android**: Kernel module (dm-sflc). Port feasible (Android uses
  device-mapper).
- **Why**: ONLY modern maintained tool for plausible deniability on
  Linux. Hand over one password showing innocent data; real data stays
  invisible, indistinguishable from random noise.

### Auto-Reboot to BFU State — P0
- **Source**: GrapheneOS feature, validated by Cellebrite leak analysis.
- **What**: Auto-reboot after configurable inactivity, returning to
  Before First Unlock state. Encryption keys not in memory. Cellebrite/
  GrayKey capabilities severely limited in BFU.
- **Why**: AFU vs BFU = "cracked in an hour" vs "inaccessible." LETHE
  should reboot to BFU aggressively: 15min inactivity, USB while
  locked, SIM removal.

### Cellebrite Resistance Intelligence — P0
- **URL**: https://osservatorionessuno.org/blog/2025/03/cellebrite/
- **What**: Leaked matrices (Feb 2025): Every locked Pixel on
  GrapheneOS = inaccessible. Almost every non-Pixel non-Samsung IS
  unlockable. MediaTek bootrom exploits are unpatchable.
- **Why**: Forensic roadmap: (1) Target Pixel hardware, (2) Auto-
  reboot-to-BFU, (3) Port GrapheneOS hardening, (4) Never ship on
  MediaTek with known bootrom exploits.

---

## 2. Metadata Stripping

### mat2 (Metadata Anonymisation Toolkit 2) — P1
- **URL**: https://0xacab.org/jvoisin/mat2
- **What**: Strips metadata from 30+ formats: images, PDFs, DOCX, XLSX,
  PPTX, ODT, MP3, FLAC, WAV, OGG, OPUS, AVI, MP4, WMV, ZIP, TAR,
  EPUB, torrents, CSS, SVG. Used by Tails OS. Available on PyPI.
- **Why**: Far more comprehensive than Scrambled Exif (images only).
  Strips PDF author/creation date, Office revision history, audio ID3
  tags, torrent metadata. Run on every file shared externally.

---

## 3. Ultrasonic Surveillance

### Skewy — P1
- **URL**: https://github.com/skewyapp/skewyapp (F-Droid)
- **What**: Detects ultrasonic tracking beacons (18-20kHz, SilverPush)
  AND jams them with masking sound. Goertzel algorithm. Live graphs.
- **Why**: 223 Android apps found listening for ultrasonic beacons.
  Only open-source tool that detects AND jams. Integrate as background
  service.

---

## 4. Dead Man's Switch Protocols

### Posthumous (Federated DMS) — P2
- **URL**: https://metafunctor.com/post/2026-02-14-posthumous/
- **What**: Multiple self-hosted nodes watch each other. TOTP check-ins.
  HMAC-signed HTTP federation. Any node trigger cascades everywhere.
  99% test coverage. Python, 2200 lines.
- **Why**: Federated model solves single-point-of-failure. Phone checks
  in to distributed nodes; they trigger if it stops.

### Sarcophagus (Blockchain DMS) — P3
- **URL**: https://sarcophagus.io
- **What**: DMS on Ethereum + Arweave. Smart contract enforcement.
  $5.47M funded. No server to seize.
- **Why**: Truly unstoppable for state-level adversary threat model.

### LastSignal (E2EE DMS) — P3
- **URL**: https://github.com/giovantenne/lastsignal
- **What**: Self-hosted, email-first DMS. Zero-knowledge server. If you
  stop responding to email check-ins, messages deliver automatically.
- **Why**: Zero-knowledge = server can't read your messages.

---

## 5. Keystroke Anonymization

### Kloak — P2
- **URL**: https://github.com/vmonaco/kloak
- **What**: Obfuscates typing timing at input device level. Random
  delays between keystrokes. Currently Linux/Wayland only.
- **Why**: Typing biometrics identify users across Tor sessions. Port
  to Android's InputReader/InputDispatcher to prevent deanonymization.

---

## 6. Anonymity Networks

### Katzenpost (Post-Quantum Mixnet) — P3
- **URL**: https://katzenpost.network
- **What**: First post-quantum mixnet. Loopix-based. Sphinx packets.
  Decoy traffic. Go thin_client (Dec 2025).
- **Why**: PQ from the ground up (unlike Tor which retrofits). Mixnet
  with decoy traffic is fundamentally stronger against global adversary.

### Arti / Lightarti (Tor in Rust) — P1
- **URL**: https://gitlab.torproject.org/tpo/core/arti
- **What**: Production Tor in Rust (v1.8.0). Lightarti for mobile:
  pre-calculated relay lists, downloads once/week vs every 2 hours.
  Only Tor library for both Android and iOS.
- **Why**: Dramatically more efficient than C tor daemon. Should replace
  LETHE's current Tor integration.

### xx.network (David Chaum's Mixnet) — P2
- **URL**: https://xx.network
- **What**: Quantum-resistant cMixx mixnet. 350+ nodes, 50+ countries.
  xx Messenger on Google Play since 2022. Founded by inventor of mix
  networks.
- **Why**: Quantum-resistant E2E + metadata shredding, shipping.

---

## 7. Traffic Analysis Resistance

### DeTorrent — P2
- **URL**: https://github.com/jkhollandjr/PETS_DeTorrent
- **What**: GAN-generated dummy packet schedules defeat traffic
  fingerprinting. -61.5% attacker accuracy. Tested live with Tor.
  PoPETS 2024.
- **Why**: State-of-the-art. GAN approach smarter than static padding.
  Run generator model locally to schedule cover traffic.

### Protozoa / Stegozoa (WebRTC Covert Channels) — P3
- **URL**: https://github.com/dmbb/Protozoa
- **What**: Tunnels IP traffic through real WebRTC video calls.
  Stegozoa embeds data into actual video frames. ACM CCS 2020.
- **Why**: "Video call" that IS a real WebRTC session but tunnels
  encrypted traffic. Nearly impossible to detect.

---

## 8. Privacy-Preserving DNS

### dnscrypt-proxy-android (Anonymized DNS + ODoH) — P1
- **URL**: https://github.com/d3cim/dnscrypt-proxy-android
- **What**: Magisk module with anonymized DNSCrypt relays + ODoH
  (RFC 9230). Resolver sees query not IP; relay sees IP not query.
  DNSCrypt v2, DoH, ODoH.
- **Why**: Strictly superior to DoH/DoT. IP/query separation is a
  fundamental architectural improvement. Ship as default DNS resolver.

---

## 9. Anti-Tracking

### IronFox — P1
- **URL**: https://gitlab.com/ironfox-oss/IronFox
- **What**: Successor to Mull (DivestOS shutdown Dec 2024). Hardened
  Firefox/Gecko. Default fingerprinting protections, uBlock Origin,
  no Mozilla telemetry.
- **Why**: Cromite (Chromium) lacks fingerprinting resistance. IronFox
  as default browser, Cromite as fallback.

### Cromite SystemWebView — P1
- **URL**: https://github.com/uazo/cromite
- **What**: Privacy-hardened Chromium. Drop-in SystemWebView. Ad
  blocking, fingerprint protections. CalyxOS ships this.
- **Why**: Replace stock WebView = system-wide tracker blocking for
  ALL apps.

---

## 10. Whonix/Kicksecure Concepts for Mobile — P2
- **Source**: https://www.kicksecure.com
- **What**: Boot Clock Randomization, sdwdate (anonymous time sync),
  Kloak (see above). No Android equivalents exist.
- **Why**: LETHE could be first mobile OS with time-sync anonymization
  and boot clock randomization.

---

## 11. Satellite Censorship Resistance

### Toosheh — P3
- **URL**: https://en.wikipedia.org/wiki/Toosheh
- **What**: Broadcasts encrypted data via satellite to MENA. Users
  record from satellite TV to USB, decrypt with phone app. ~3M users
  in Iran. Battle-tested 2017-2022 protests.
- **Why**: Existing consumer TV equipment. One-way = no return signal.

### Othernet — P3
- **URL**: https://othernet.is
- **What**: One-way satellite data via LoRa. ~100-200MB/day free.
  Open-source decoder (open-ondd).
- **Why**: Receive-only channel impossible to trace to receiver.

---

## Integration Priority

**P0 (ship-blocking):**
- Auto-reboot to BFU (port from GrapheneOS)
- Cellebrite resistance guidelines (hardware targeting)

**P1 (next release):**
- mat2 in share pipeline
- Android AntiForensic Tools / mFSTRIM integration
- Skewy ultrasonic detection as background service
- Arti/Lightarti replacing C tor daemon
- dnscrypt-proxy anonymized DNS
- IronFox + Cromite WebView

**P2 (3-6 months):**
- Kloak keystroke anonymization port
- DeTorrent traffic analysis padding
- Posthumous federated DMS
- Kicksecure concepts (boot clock, sdwdate)

**P3 (long-term):**
- Shufflecake hidden volumes kernel port
- Katzenpost post-quantum mixnet
- Protozoa/Stegozoa WebRTC tunneling
- Satellite reception (Toosheh, Othernet)
- Sarcophagus blockchain DMS
