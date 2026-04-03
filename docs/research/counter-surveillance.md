# Counter-Surveillance & Unconventional Tech — Research

Hardware-level privacy, anti-forensics, covert communication, and
attack surface reduction. The stuff that lives below the OS layer.

---

## Cellular surveillance detection

### IMSI catcher / Stingray detection

IMSI catchers (Stingrays) are fake cell towers that intercept device identifiers,
track location, and can downgrade connections to exploitable 2G.

**EFF Rayhunter** (2025) — the most promising detector:
- Runs on a $30 Orbic mobile hotspot, not on the phone itself
- Analyzes control traffic between hotspot and tower in real-time
- Green line = normal, red line = suspicious activity detected
- Detects: 2G downgrade attempts, suspicious IMSI requests
- Open source (Rust): https://github.com/EFForg/rayhunter

**Older tools:** AIMSICD and SnoopSnitch require rooted phones + Qualcomm chipset.
Research shows detection apps on normal phones are unreliable because Android
restricts the radio info needed to detect attacks.

**Lethe angle:**
- Can't run Rayhunter on the phone itself (needs hotspot hardware)
- Could ship AIMSICD-style monitoring as a system app (Lethe is rooted)
- Alert user to 2G downgrades, unknown tower IDs, silent SMS
- Complement with: airplane mode toggle, modem kill in software

### Baseband modem isolation

The cellular baseband is the least audited, least hardened component on any
phone. Zero-day exploits in basebands deploy malware like Predator/Pegasus.
The baseband has DMA access to main memory on most devices.

**State of the art:**
- Pixel phones: Bounds Sanitizer, Integer Overflow Sanitizer, Stack Canaries
- Librem 5: physically isolated modem (separate bus, no DMA to CPU/RAM)
- PinePhone: hardware kill switches disconnect modem entirely
- Most Android phones: modem shares memory bus with CPU — no isolation

**Lethe angle:**
- Software-only: can't fix hardware DMA on existing phones
- Can minimize attack surface: disable 2G at baseband level where supported,
  restrict modem permissions, monitor for anomalous baseband behavior
- Long-term: recommend/support phones with isolated modems (device-tiers.yaml)
- Add to security roadmap as P3 research item

---

## Device fingerprinting resistance

### Sensor fingerprinting

Accelerometer, gyroscope, and magnetometer have unique manufacturing
imperfections. Websites and apps can read these via JavaScript (no
permission needed on most browsers) to create a persistent device fingerprint.

**Attack:** Read sensor calibration data → derive per-device fingerprint →
track across sessions, apps, even factory resets.

**Defenses:**
- GrapheneOS: Sensors permission toggle — apps receive zeroed data when denied.
  Disabled by default for user-installed apps.
- iOS 12.2+: Added random noise to sensor ADC outputs.
- Lethe should port GrapheneOS's approach: per-app sensor permission,
  default deny, noise injection for apps that need sensors.

### BLE tracking

MAC randomization is default on Android 10+ but insufficient:
- Predictable RPA update intervals can be exploited
- Advertising packet contents create fingerprints even with random MACs
- Apps can derive unique fingerprints from BLE scan data

**Lethe angle:**
- Already randomizes MAC on boot (burner mode)
- Should also: randomize RPA interval (not fixed), restrict BLE scan
  permissions, strip identifying fields from advertising packets

### RF fingerprinting

Every radio transmitter has unique characteristics from manufacturing
imperfections — a "radio fingerprint." Passive receivers can identify
specific devices by analyzing the transmitted waveform.

**Reality check:** Requires specialized equipment and proximity. Not a
mass surveillance tool (yet). ML-based detection is improving (~99% accuracy
in lab conditions). No practical defense exists — it's a hardware property.

**Lethe angle:** Awareness only. If RF fingerprinting becomes a threat,
the only defense is not transmitting (airplane mode / LoRa with different
radio hardware).

---

## Steganography

Hiding data inside innocent-looking files (images, audio, video). The
message's existence is invisible, not just its content.

**Tools:**
- **Steghide** — embed data in JPEG/BMP/WAV/AU, AES-128 encryption
- **OpenStego** — hide data in images, watermarking support
- **DeepSound** — audio steganography in WAV/FLAC, AES-256
- **PixelKnot** (Guardian Project) — Android app, hide encrypted messages in photos
- **SoniTalk** — ultrasonic data-over-sound protocol (see below)

**Lethe angle:**
- Ship PixelKnot or similar as a pre-installed app
- Use case: send encrypted message as an innocent-looking photo via any
  messenger (WhatsApp, email, etc.) — the carrier doesn't need to be secure
- Complements Briar/Session for scenarios where using a "privacy app" itself
  is suspicious

---

## Covert & unconventional channels

### Ultrasonic data transfer (SoniTalk)

Send data between phones using near-ultrasound (18-20 kHz) — inaudible to
most humans, works with any phone speaker/microphone.

- Open source Android SDK: https://github.com/fhstp/SoniTalk
- No WiFi, no Bluetooth, no internet, no pairing
- Range: a few meters (same room)
- Low bandwidth: short messages, keys, URLs

**Lethe angle:**
- Emergency key exchange: two Lethe phones in the same room can exchange
  encryption keys via ultrasound — no radio emissions, no network trace
- Complement to NFC tap (NFC can be detected by RF scanners; ultrasound can't)

### Satellite broadcast (Blockstream Satellite)

Blockstream broadcasts data via geosynchronous satellites — receive-only,
completely passive, anonymous. Originally for Bitcoin blocks, but supports
custom data payloads via API.

- Receive with a $100 satellite dish + SDR dongle
- One-way: impossible to determine who is receiving
- Global coverage (6 satellites)

**Lethe angle:**
- OTA updates via satellite in regions with no internet and blocked Tor
- OSmosis publishes update manifests to Blockstream Satellite API
- Lethe device receives passively — no uplink, no IP, no trace
- Extreme edge case but uniquely uncensorable

### Air-gap bridging (threat awareness)

Research catalogs covert channels for exfiltrating data from air-gapped
systems: LED modulation, acoustic emanation, power consumption, thermal,
electromagnetic, infrared via security cameras.

**Lethe angle:** Not for integration — for threat awareness. Lethe's
dead man's switch and burner mode assume physical device access. If the
adversary has lab-grade equipment and physical proximity, these side
channels can leak data even from a "wiped" device. The defense is
destroying the hardware, not just wiping the storage.

---

## Anti-forensics

### Secure deletion

Standard Android file deletion doesn't erase data — it marks space as free.
Forensic tools recover "deleted" files trivially.

**Approaches:**
- **Overwrite:** Write zeros/random data to the entire block before freeing.
  Effective on HDD; less reliable on flash/SSD (wear leveling, spare blocks).
- **Encryption + key destruction:** Encrypt all data with a per-session key.
  On wipe, destroy the key — ciphertext without key is noise. This is the
  only reliable approach on flash storage.
- **TRIM:** Tell the flash controller to erase blocks. Most Android devices
  TRIM on delete, but timing varies and forensic snapshots may precede TRIM.

**Lethe already does this right:**
- Burner mode: wipes `/data` on every reboot
- Full-disk encryption is mandatory
- The correct improvement: per-session encryption keys (derive from boot
  entropy, never persist). When burner mode wipes, the key is gone —
  all prior data is cryptographic noise regardless of flash wear leveling.

### Duress PIN / panic wipe

Enter a special PIN on the lock screen → silent wipe instead of unlock.

**Ecosystem:**
- GrapheneOS: native duress PIN support (2025)
- Wasted: Android app, wipe on emergency trigger (tile, shortcut, broadcast)
- PanicKit (Guardian Project): Android library, any app can respond to panic
- Lethe: already has duress PIN in dead man's switch (`init.lethe-deadman.rc`)

**Lethe improvement:** PanicKit integration — on duress PIN, trigger not just
data wipe but also: clear RAM, kill Tor circuits, broadcast "duress" signal
to trusted contacts (via PubSub/Reticulum), power off modem.

### Android Anti-Forensic Tools

Open-source app that silently protects user data from forensic extraction:
https://github.com/bakad3v/Android-AntiForensic-Tools

**Lethe angle:** Evaluate for integration. System-level anti-forensics
(clear logs, shred temp files, randomize free space) as a background
service, not just on panic trigger.

---

## Hardware kill switches (software emulation)

Librem 5 and PinePhone have physical switches to disconnect modem, WiFi,
camera, microphone. Most Android phones don't have these.

**Software emulation on Lethe:**
- Quick Settings tiles: Modem off, WiFi off, Camera off, Mic off, Sensors off
- GrapheneOS approach: per-app sensor/camera/mic permissions, default deny
- "Lockdown mode" toggle: kill modem + WiFi + BT + sensors in one tap
- Caveat: software kill can be bypassed by compromised firmware.
  Label as "best-effort" not "hardware-grade"

---

## Plausible deniability

### Hidden encrypted volumes

VeraCrypt model: one container, two passwords. Outer password opens decoy
data; inner password opens real data. Impossible to prove the hidden volume
exists (looks like random noise in unused space).

**Challenges on mobile:**
- No VeraCrypt for Android
- SSD/flash wear leveling and TRIM can leak hidden volume existence
- Android's FBE (file-based encryption) doesn't support hidden volumes

**Lethe angle:**
- Per-session encryption with burner mode is already stronger than hidden
  volumes — there's nothing to find because the key is gone
- For persistent mode (burner off): research dm-crypt + LUKS hidden volume
  on the `/data` partition. Hard but not impossible.
- Alternative: decoy user profile with innocent data, real profile behind
  a different PIN (Android supports multiple users)

---

## Recommendations

### Must implement
| Feature | Why | Effort |
|---------|-----|--------|
| Per-app sensor permissions | Fingerprinting defense (port from GrapheneOS) | Medium |
| Per-session encryption keys | Only reliable secure deletion on flash | Medium |
| PanicKit integration | Extend duress PIN to full system panic | Low |
| Lockdown mode toggle | One-tap modem+WiFi+BT+sensors kill | Low |

### Should implement
| Feature | Why | Effort |
|---------|-----|--------|
| IMSI catcher monitoring | Alert on 2G downgrade, unknown towers | Medium |
| Steganography app (PixelKnot) | Covert messaging via innocent photos | Low (pre-install) |
| BLE tracking hardening | Randomize RPA interval, strip ad fields | Medium |

### Should research
| Feature | Why | Blocker |
|---------|-----|---------|
| Ultrasonic key exchange | No-radio key exchange in same room | SoniTalk maturity |
| Satellite OTA | Uncensorable one-way update delivery | Hardware cost, niche |
| Hidden volume on /data | Plausible deniability in persistent mode | Flash wear leveling |
| Decoy user profile | Plausible deniability via Android multi-user | UX complexity |
| Anti-forensic background service | Continuous shredding of temp files, logs | Battery impact |

---

## Guardian Project toolkit

The Guardian Project builds privacy tools for activists, journalists, and
people at risk. Several of their tools are directly relevant to Lethe.

### Haven — physical intrusion detection

Turn a spare phone into a sensor-based security system. Uses accelerometer,
camera, microphone, and light sensor to detect intrusion. Records only on
trigger, stores locally, alerts via Signal or Tor.

**Lethe angle:** Ship Haven pre-installed. A Lethe phone left in a hotel room
or office becomes a silent witness. Alerts go through Tor — no SMS, no push
notification service. Pairs with dead man's switch: if someone seizes the
device, Haven records it, Lethe wipes itself.

Source: https://guardianproject.github.io/haven/

### ProofMode — verifiable photo/video capture

Adds cryptographic signatures, hardware authentication, and third-party
notarization to photos/videos at capture time. Now supports C2PA (Content
Authenticity Initiative) standard. 2025 update adds AI-generated content
detection via ProofCheck.

**Lethe angle:** Pre-install. Activists documenting abuses need provably
authentic media. ProofMode proves: this photo was taken on this device, at
this time, and hasn't been tampered with. Complements burner mode — prove
authenticity without revealing identity.

Source: https://guardianproject.info/apps/org.witness.proofmode/

### PixelKnot — steganography (already in doc above)

### PanicKit — panic response framework (already in doc above)

---

## Privacy tools worth shipping

### OnionShare — anonymous file sharing/hosting/chat

Start a temporary Tor onion service on your phone. Share files, host a
website, or run a chat room — all as a .onion address. No account, no
server, no trace. Recipient uses Tor Browser to access.

- Any file size, no upload limit (direct from device)
- Comes pre-installed on Tails, QubesOS, ParrotOS
- Desktop app (Python/Qt) — no Android client yet

**Lethe angle:** If ported to Android (or via Termux), OnionShare + Lethe's
Tor daemon = instant anonymous dead drop. Share a file by giving someone
a .onion URL. When you close the share, the URL ceases to exist.

Source: https://onionshare.org/

### Dangerzone — document quarantine

Convert untrusted PDFs, Office docs, and images into safe PDFs by rendering
to pixels in a gVisor sandbox, then reconstructing. Destroys any embedded
malware, macros, or tracking pixels.

- Freedom of the Press Foundation project
- Audited by Include Security (no high-risk findings)
- Desktop only (Linux/macOS/Windows)

**Lethe angle:** High-threat users receive documents from unknown sources.
Opening a malicious PDF could compromise the device. Dangerzone sanitizes
it first. Would need Android port — render in sandboxed WebView or isolated
process, output clean PDF.

Source: https://github.com/freedomofpress/dangerzone

### Scrambled Exif — metadata stripping

Android share-sheet integration: share a photo through Scrambled Exif, it
strips EXIF/GPS/camera metadata, then forwards the clean version.

- F-Droid and Play Store, open source
- JPEG only (limitation)

**Lethe angle:** Pre-install, or better: bake metadata stripping into
Lethe's share sheet system-wide. Every photo shared from Lethe should
optionally strip EXIF before leaving the device. Default: strip.

### age — modern file encryption

Simple, modern alternative to GPG. No config, no keyring database.
Keys are plain text files. Encrypt with public key or passphrase.

- `age -r <pubkey> file.txt` → encrypted
- `age -d file.txt.age` → decrypted
- Go implementation + Rust implementation (rage)
- Intentionally no signing (use minisign for that)

**Lethe angle:** Replace GPG for all on-device encryption needs.
Simpler UX, fewer footguns, modern crypto (X25519, ChaCha20-Poly1305).
Use for: backup encryption, file sharing, key exchange with Reticulum.

Source: https://github.com/FiloSottile/age

### NetGuard — per-app outbound firewall

Rootless Android firewall using local VPN. Block internet access per-app,
per-network (WiFi/mobile), log all outgoing connections.

**Lethe angle:** Lethe already has nftables firewall rules (system-level).
NetGuard adds user-visible per-app control: "this app can never phone home."
Consider integrating at the system level instead of shipping as a separate
app — per-app network permission in Lethe settings, like GrapheneOS.

Source: https://netguard.me/

---

## Physical dead man's switches

### BusKill — USB kill cord

Hardware tether: USB cable with magnetic breakaway connects user to device.
If the cable separates (device grabbed, user walks away), triggers:
lock screen, shutdown, or LUKS header destruction.

- $59 cable + open-source app
- Works on Linux, macOS, Windows

**Lethe angle:** Can't directly use on a phone (no USB-C tether convention).
But the concept translates: **Bluetooth proximity dead man's switch.**
Pair Lethe with a BLE beacon (keychain, watch, another phone). If the beacon
goes out of range → trigger lock/wipe. Like BusKill but wireless.

Source: https://www.buskill.in/

---

## Messaging: additional options

### Tox — P2P encrypted voice/video/chat

Pure peer-to-peer using DHT for discovery. No servers, no accounts.
Voice and video calls, file transfer, screen sharing. All encrypted.

- No metadata — DHT-based, no central directory
- qTox (desktop), several Android clients (aTox, Antox)
- Protocol is stable, clients are rough

**Lethe angle:** Tox covers voice/video calling, which Briar and Session
lack or do poorly. Could complement the messaging stack:
Briar (offline/mesh) + Session (async/online) + Tox (real-time voice/video).

Source: https://tox.chat/

---

## Concepts worth stealing

### Warrant canary (from transparency reports)

A regular signed statement saying "we have NOT received a secret court
order." If the statement disappears, users infer a gag order was received.

**Lethe angle:** OSmosis publishes a signed warrant canary via IPNS alongside
OTA manifests. Lethe devices check it on the same 6h cycle. If the canary
disappears or its signature is invalid → notify user that OSmosis may be
compromised. Trust, but verify.

### Tails-style amnesia (reference architecture)

Tails runs entirely in RAM, never touches the host disk, overwrites RAM on
shutdown. Lethe's burner mode is the mobile equivalent — but Tails also:
- Randomizes hostname on every boot
- Spoofs MAC on every connection
- Routes 100% through Tor with no exceptions
- Blocks all non-Tor traffic at the firewall level

**Lethe should steal:** hostname randomization on boot (currently static),
and strict Tor-or-nothing firewall enforcement (Lethe allows some local
traffic that could leak).

### Decoy user profiles (from VeraCrypt hidden OS)

Android supports multiple user profiles. One profile is the "decoy" with
innocent apps and data. The real profile is behind a different PIN.
At a border crossing or police stop, unlock the decoy. The real profile's
data is encrypted with a different key — its existence is not obvious.

**Lethe angle:** Implement as part of burner mode options:
- Burner mode (default): wipe everything on reboot
- Persistent mode: keep data between reboots
- Decoy mode: two profiles, two PINs, one visible, one hidden
