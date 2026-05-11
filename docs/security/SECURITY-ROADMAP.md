# LETHE Security Roadmap

Closing the hardening gap with GrapheneOS — without giving up device breadth.

GrapheneOS is deeper security: hardened allocator, verified boot, exec-based spawning.
LETHE is broader reach + operational security: burner mode, dead man's switch, 300+ devices.
This roadmap bridges the two by porting what we can and fixing what we control.

---

## P0 — Ship-blocking (config fixes, no code) — DONE

### Fix ADB authentication — DONE

~~`ro.adb.secure=0` and `ro.debuggable=1` give any USB cable full shell access
with zero authentication.~~

**Implemented:**
- `ro.adb.secure=1` and `ro.debuggable=0` in `privacy-defaults.conf`
- OSmosis USB pairing exchanges ADB RSA keys at pair time
- Unpaired USB connections see the auth prompt — no shell access

### Switch to `user` builds — DONE

~~`manifest.yaml` builds `lineage_{codename}-userdebug`.~~

**Implemented:**
- Build target is now `lineage_{codename}-user`
- A separate `lethe-dev` variant for contributors who need debug access is TODO

---

## P1 — Quick wins (low effort, meaningful impact)

### Next-release blocking (journalist-audit 2026-04-15)

Items below are tracked individually but called out here so they don't slip:

- **Unified Auto-Wipe Policy** (v1.2) — DELIVERED. LetheDeviceAdmin promoted to Device Owner at first boot; `AutoWipePolicy.executeWipe` is now the single chokepoint for panic / duress / DMS / failed-unlock / USB triggers; uses `DPM.wipeData` so the `system_data_file` neverallow no longer partial-fails the wipe. iPhone-style "N failed unlocks → wipe" wired through stock `setMaximumFailedPasswordsForWipe`. Every-restart trigger stays on the legacy post-fs-data shell path (DPM would reboot-loop) until per-session crypto-erase ships.
- **Per-session encryption keys** (was P2) — issue [#101](https://github.com/OSmosis-org/lethe/issues/101), design at [journalist-audit/per-session-keys.md](journalist-audit/per-session-keys.md). Foundational — burner-mode claim depends on it.
- **USB data lockout when locked** — issue [#99](https://github.com/OSmosis-org/lethe/issues/99), design at [journalist-audit/usb-data-lockout.md](journalist-audit/usb-data-lockout.md). Cellebrite/GrayKey defense.
- **Remote DMS / wipe channel** — issue [#103](https://github.com/OSmosis-org/lethe/issues/103), design at [journalist-audit/remote-dms-channel.md](journalist-audit/remote-dms-channel.md). Closes competitive-gap §3.
- **IMSI-catcher detection** (was P3) — issue [#105](https://github.com/OSmosis-org/lethe/issues/105), design at [journalist-audit/imsi-catcher-detection.md](journalist-audit/imsi-catcher-detection.md).
- **Hidden volumes** — issue [#102](https://github.com/OSmosis-org/lethe/issues/102), feasibility at [journalist-audit/hidden-volumes.md](journalist-audit/hidden-volumes.md). Opt-in, tier-1 only — proceed cautiously.

### Per-app sensor permissions

Port GrapheneOS's Sensors permission toggle. When denied, apps receive zeroed
accelerometer/gyroscope/magnetometer data — prevents sensor fingerprinting
(websites/apps can derive persistent device IDs from manufacturing imperfections).
Default deny for user-installed apps. Quick Settings tile: "Sensors off."

### Lockdown mode toggle — DONE

~~One-tap Quick Settings tile: kill modem + WiFi + Bluetooth + sensors + camera + mic.~~

**Implemented:**
- LetheTileService.java — Quick Settings tile, one-tap toggle
- Kills WiFi, mobile data, Bluetooth via `svc` commands
- Sets `persist.lethe.lockdown.active` for sensor restriction
- Labeled "best-effort" (software-only, can't match hardware disconnect)

### EXIF metadata stripping — PARTIAL

~~Strip EXIF/GPS/camera metadata from photos before sharing, system-wide.~~

**Implemented:**
- Scrambled Exif added to recommended apps in manifest.yaml
- Share-sheet integration and system-wide mat2 still TODO (see P1 mat2 item)

### PanicKit integration

Extend duress PIN beyond data wipe: clear RAM, kill Tor circuits, broadcast
duress signal to trusted contacts (via PubSub/Reticulum), power off modem.
Use Guardian Project's PanicKit framework for app-level panic response.

**Partially implemented:**
- Panic wipe (5x power press) via PanicPressService.java
- Duress PIN receiver via DuressPinReceiver.java
- PanicKit broadcast integration and Tor circuit kill still TODO

### Default-deny input firewall — DONE

~~`firewall-rules.conf` input chain has `policy accept`. Any service listening on
the device is reachable from the local network.~~

**Implemented:** `firewall-rules.conf` input chain already has `policy drop`.
Allows: established/related, loopback, DHCP replies. All else dropped and logged.

### Per-connection MAC randomization — DONE

~~LETHE randomizes MAC on wipe, but a single MAC per boot session lets networks
correlate all activity within that session.~~

**Implemented:**
- `persist.lethe.mac_rand=per_connection` in privacy-defaults.conf (abbreviated to fit Android's 31-byte PROPERTY_KEY_MAX)
- Per-boot rotation via init.lethe-burner.rc (runs at post-fs-data)
- Android 14+ devices get per-connection randomization; older devices get per-boot

### AVB relock on Pixel builds

Unlocked bootloaders let an attacker flash anything — but on Pixels, you can
relock with custom Android Verified Boot keys. GrapheneOS does exactly this.

**Changes:**
- Generate LETHE AVB signing keys
- Sign Pixel builds with custom AVB keys
- Add dm-verity with custom signing for /system /vendor integrity
- Document the relock flow for users
- Non-Pixel devices stay unlocked — document the tradeoff honestly

### Auto-reboot to BFU state

Cellebrite leak (Feb 2025): every locked Pixel on GrapheneOS is inaccessible.
The key difference is BFU (Before First Unlock) vs AFU (After First Unlock).
In AFU, encryption keys are in memory — tools extract them. In BFU, keys
aren't loaded yet — extraction is severely limited.

**Changes:**
- Auto-reboot after configurable inactivity (default: 15 minutes)
- Reboot on USB connection while locked
- Reboot on SIM removal
- Port from GrapheneOS; Android 16 adds 72h auto-reboot in Advanced Protection

### USB data lockout when locked

Android 16 Advanced Protection Mode disables USB data when locked. Only
charging. Blocks Cellebrite/GrayKey extraction, USB keyboard brute-force,
payload injection.

**Changes:**
- Backport USB data lockout to Android 15 base
- Go further: require explicit confirmation for USB data even when unlocked
- Disable USB debugging completely in lockdown mode

### Metadata encryption (dm-default-key)

Standard FBE encrypts file contents/names but leaves metadata exposed: file
sizes, timestamps, file count. Forensic examiners reconstruct timelines.

**Changes:**
- Ensure dm-default-key is enabled in kernel config
- Verify LineageOS base enables it (may not be default)

### Comprehensive metadata stripping (mat2)

Scrambled Exif only handles images. mat2 strips metadata from 30+ formats:
PDFs, Office documents, audio, video, archives, ebooks, torrents.

**Changes:**
- Integrate mat2 into share pipeline (strip all metadata on external share)
- Pre-install or bundle Python library

### eBPF kernel-space firewall

Replace/supplement nftables with custom eBPF programs. Fingerprint tracker
protocols by packet pattern, enforce DNS, block tracker IPs — all in kernel
space with zero wakeups. Dramatically more power-efficient.

**Changes:**
- Write custom eBPF programs for per-UID tracker blocking
- Supplement existing nftables rules, don't replace initially
- Monitor battery impact vs current userspace filtering

### Anonymized DNS (dnscrypt-proxy)

Current DoT to Quad9/Mullvad exposes query content to resolver. Anonymized
DNSCrypt relays separate IP from query: relay sees IP not query, resolver
sees query not IP. Strictly superior.

**Changes:**
- Ship dnscrypt-proxy as system service (replace or supplement DoT)
- Pre-configure anonymized relay list
- Support ODoH (RFC 9230) as alternative

---

## P2 — Ported hardening (high effort, high impact)

### LKRG (Linux Kernel Runtime Guard)

Runtime kernel integrity checking. Detects unauthorized modifications,
credential escalation, exploit attempts. v1.0 stable Sep 2025. ARM64 + ARMv7.
Unlike compile-time hardening (KSPP), catches exploits at runtime.

**Changes:**
- Build LKRG as loadable module against LETHE kernels
- Enable on all ARM64 devices, test on ARMv7
- Complements SELinux (static policy) with dynamic detection

### KSPP features audit

Many upstream Kernel Self Protection Project features are left off in
LineageOS builds. Low effort, high impact.

**Changes:**
- Audit and enable: `CONFIG_INIT_ON_FREE_DEFAULT_ON`, `CONFIG_STACKLEAK_PLUGIN`,
  `CONFIG_CFI_CLANG`, `CONFIG_RANDOMIZE_KSTACK_OFFSET_DEFAULT`
- Enable ARM MTE (Memory Tagging Extension) by default on ARMv9 (Pixel 8+)
- Enable `cls_cgroup` + `xt_cgroup` for PID-level firewall support

### Cromite SystemWebView

Replace stock WebView with Cromite — system-wide ad/tracker blocking and
fingerprint resistance for ALL apps that use WebView. CalyxOS already ships
this. Includes EasyList ad blocking engine.

**Changes:**
- Add `PRODUCT_PACKAGES += cromite-webview` to build
- Ship IronFox (hardened Firefox) as default browser alongside
- Ensure hardened_malloc is the allocator for WebView process

### UnifiedPush + ntfy as system service

Google-free push notifications. ntfy.sh is self-hostable. Zero Google code.
Growing ecosystem (Tusky, FluffyChat, Element, SchildiChat).

**Changes:**
- Ship ntfy as system service
- Register as default UnifiedPush distributor
- Route ntfy traffic through Tor

### Accessibility whitelist

Hardcode LETHE agent as only allowed Accessibility Service consumer. Android
17 adds `isAccessibilityTool` flag; LETHE can enforce at OS level.

**Changes:**
- Whitelist org.osmosis.lethe.agent in framework
- Deny all other accessibility requests at OS level
- Eliminates entire class of accessibility-based malware

### fanotify filesystem integrity monitoring

Kernel-level filesystem events for entire mount points. One fd monitors
/data, /system, /vendor. Permission events block writes before completion.

**Changes:**
- Replace inotify-based monitoring with fanotify
- Enable permission events to block unauthorized APK installs
- Consider integrating Hypatia/LoveLaceAV scan engine for real-time malware detection

### Integrate hardened_malloc

GrapheneOS's biggest single exploit mitigation. Replaces the system memory
allocator with one designed to make heap exploitation unreliable. Can be built
standalone from GrapheneOS's repo.

**Changes:**
- Build hardened_malloc for ARM64 from [GrapheneOS/hardened_malloc](https://github.com/GrapheneOS/hardened_malloc)
- Include in system image as default allocator
- Works on any ARM64 device — no kernel changes needed
- ARMv7 devices (t03g, etc.) excluded — document limitation

**Risk:** Performance regression on low-RAM devices. Benchmark on lowest-spec
supported device before shipping.

### Exec-based app spawning

Android's Zygote forks every app from a shared process. One leaked memory
address compromises ASLR for every app on the device. GrapheneOS replaces this
with exec-based spawning that re-randomizes ASLR per app.

**Changes:**
- Port GrapheneOS exec-spawning patches to LineageOS 21.0 base
- These touch the Android runtime, not hardware-specific code
- Maintain as a patch set rebased on each LineageOS sync

**Risk:** Slower app launch (cold start). Acceptable tradeoff for security.

### Per-session encryption keys — promoted to P1 (tracked under issue #101)

Moved up to P1 / next-release blocking. See [journalist-audit/per-session-keys.md](journalist-audit/per-session-keys.md)
for the full design, threat model, and prototype plan. Without this primitive
the burner-mode claim ("reboot = data is noise") is not actually true on
flash storage — wear leveling preserves ciphertext that a TEE-recovered
unwrap-key can still decrypt.

### Per-app outbound firewall

System-level per-app network permissions (not a VPN-based app like NetGuard).
Each app can be set to: full access, Tor only, WiFi only, or blocked.
Similar to GrapheneOS's network permission toggle. Prevents apps from
phoning home even if they bypass the VPN.

### BLE tracking hardening

BLE MAC randomization is default on Android 14+ but insufficient:
- Randomize RPA update interval (currently predictable/fixed)
- Strip identifying fields from BLE advertising packets
- Restrict BLE scan permissions per-app (default deny)

### Hostname randomization

Tails randomizes hostname on every boot. Lethe currently has a static hostname
visible on local networks. Randomize on each boot session to prevent
correlation across WiFi networks.

### Network namespaces per app

Per-app network namespaces where the only interface is a tunnel. Apps
physically cannot communicate except through the assigned network.
Kernel-enforced, unlike VPN tricks that root apps bypass via raw sockets.

**Changes:**
- Assign different apps to different network namespaces
- Tor namespace (default), VPN namespace, direct namespace
- No userspace bypass possible

### Droidspaces service isolation

LXC-inspired container runtime for Android, under 260KB. Run Tor and IPFS
in isolated containers with PID/MNT/NET namespaces. If Tor is compromised,
attacker is trapped with no Android userspace access.

### Arti/Lightarti (replace C tor daemon)

Production Tor in Rust (v1.8.0). Lightarti for mobile pre-calculates relay
lists, downloads once/week vs every 2 hours. Dramatically lower bandwidth,
faster startup, embeddable as library.

**Changes:**
- Replace C tor daemon with Arti/Lightarti
- Use lightarti-rest-android (Maven) for integration
- Major battery and bandwidth savings

### Patch cadence automation

LineageOS merges AOSP security patches weeks after release. GrapheneOS ships
within days. We can't match that, but we can close the gap.

**Changes:**
- CI job monitors LineageOS security bulletin merges
- Auto-triggers rebuild for all devices on merge detection
- Publishes signed builds to IPFS channel
- Target: patches land in LETHE builds within 72 hours of LineageOS merge

---

## Implemented — Tor + IPFS

### Transparent Tor proxy (all user app traffic)

Every user app's TCP traffic is transparently redirected through Tor via
iptables NAT rules. DNS for user apps resolves through Tor. UDP is dropped
(Tor is TCP-only — this prevents leaks). Tor runs as a system service
(UID 9050) independent of any app.

**Components:**
- `overlays/tor.conf` — Tor daemon config (TransPort 9040, DNSPort 5400)
- `overlays/firewall-rules.conf` — nftables/iptables enforcing Tor-only
- `init.lethe-tor.rc` — Starts Tor + applies NAT redirect on boot
- Orbot pre-installed for bridge configuration UI
- Tor data on `/persist` — survives burner wipe, circuits rebuild faster
- Bridge support (obfs4) available in Settings for censored networks
- Per-app circuit isolation — apps can't correlate each other's traffic

### IPFS OTA updates (signature-verified, Tor-routed)

Firmware updates fetched via IPFS, not HTTP. The device runs a lightweight
IPFS client (no DHT serving) with all swarm traffic routed through Tor
SOCKS. Update manifests are signed with Ed25519 and verified on-device.

**Components:**
- `overlays/ipfs-ota.conf` — IPFS client config + update policy
- `init.lethe-ipfs.rc` — IPFS daemon + periodic IPNS update checker
- OSmosis publishes signed manifests to IPNS channel `lethe-updates`
- Security patches auto-install on reboot; feature updates prompt user
- Offline updates via .car archives over OSmosis USB

---

## P3 — Long-term research

### Scoped storage hardening
Tighten app access to shared storage beyond AOSP defaults. Evaluate
GrapheneOS's storage scopes patches for portability.

### Network attestation (IMSI catcher detection) — promoted to P1 (tracked under issue #105)

Moved up to P1 / next-release blocking. See [journalist-audit/imsi-catcher-detection.md](journalist-audit/imsi-catcher-detection.md)
for the full design, including the device support matrix (Qualcomm DIAG
required for full coverage; tier-aware UI for the rest) and the
declarative rule format that lifts SnoopSnitch's detection logic without
inheriting its bit-rot.

### Secure element integration
On devices with hardware secure elements (Pixels, newer Samsung), store
dead man's switch passphrase and encryption keys in hardware. Currently
everything lives in software on `/persist`.

### Decoy user profiles (plausible deniability)
Two Android user profiles behind different PINs. Decoy profile has innocent
apps/data. Real profile is hidden. At border crossings or police stops,
unlock decoy. Real profile's encryption key is separate — existence not obvious.
Research: dm-crypt hidden volume challenges on flash (wear leveling leaks).

### BLE proximity dead man's switch
BusKill concept adapted for phones: pair Lethe with a BLE beacon (keychain,
watch, another phone). If beacon goes out of range → trigger lock/wipe.
Like USB kill cord but wireless.

### Warrant canary via IPNS
OSmosis publishes a signed "we have NOT been served a secret court order"
alongside OTA manifests. Lethe checks on the same 6h cycle. If canary
disappears or signature is invalid → alert user.

### Document quarantine (Dangerzone port)
Sanitize untrusted PDFs/docs by rendering to pixels in sandbox, reconstruct
as clean PDF. Kills embedded malware, macros, tracking pixels. Needs Android
port (gVisor sandbox or isolated WebView). Freedom of the Press Foundation project.

### Anti-forensic background service
Continuous shredding of temp files, logs, clipboard history, recently-used
lists. Not just on panic trigger — as an ongoing background operation.
Evaluate battery impact. Reference: Android-AntiForensic-Tools project
(github.com/bakad3v — successor to Wasted, works on Android 14+).
Integrate mFSTRIM for forced TRIM after deletion (no root required).

### Shufflecake hidden volumes
Port dm-sflc kernel module for plausible deniability. Multiple nested hidden
encrypted filesystems. Decoy volume reveals only decoy data. Published ACM
CCS 2023. Only modern maintained tool for this on Linux.

### Keystroke anonymization (Kloak port)
Port Kloak (github.com/vmonaco/kloak) to Android's InputReader/InputDispatcher.
Obfuscates typing timing with random delays. Prevents user identification via
typing biometrics across Tor sessions — a real deanonymization vector.

### Boot clock randomization (Kicksecure)
Port from Kicksecure (kicksecure.com). Prevents timing-based fingerprinting.
Also: sdwdate for anonymous time sync. No Android equivalents exist today.

### Ultrasonic beacon detection (Skewy)
Integrate Skewy (github.com/skewyapp) as background service. Detects AND
jams 18-20kHz tracking beacons (SilverPush). 223 Android apps found
listening for ultrasonic beacons. Only open-source Android tool for this.

### Katzenpost post-quantum mixnet
World's first PQ mixnet (katzenpost.network). Loopix-based with decoy
traffic. Fundamentally stronger than onion routing against global adversaries.
Go thin_client compilable via gomobile for Android integration.

---

## Legal & Regulatory Awareness

LETHE's security features are its strength — but some directly conflict with
laws in certain jurisdictions. This doesn't mean we weaken them. It means we
document the risks honestly so users and the maintainer stay informed.

See `lethe/docs/research/legal-compliance.md` for the full legal analysis.

### Features with legal implications

| Feature | Legal Risk | Jurisdictions |
|---------|-----------|---------------|
| **Tor enforcement** | VPN/proxy bans, lawful interception laws | China, Russia, Iran, Belarus, Turkmenistan, UAE |
| **Burner mode** (identity rotation) | May conflict with device registration laws | China (real-name registration), India (SIM linking) |
| **Dead man's switch** (wipe/brick) | Evidence destruction laws | Most jurisdictions if triggered during investigation |
| **Panic wipe** | Evidence destruction laws | Same as above |
| **Decoy profiles** (P3) | Obstruction of justice in some jurisdictions | US, UK, EU (depends on context) |
| **Anti-forensic background service** (P3) | Evidence spoliation | Broad — document risk prominently |
| **Warrant canary** (P3) | Gag order compliance varies | US (NSL), Australia (TOLA Act) |
| **Encryption** (FBE, per-session keys) | Decryption-on-demand laws | UK (RIPA s.49), Australia (TOLA), India (IT Act s.69) |

### What we do about it

1. **We do not weaken features.** The architecture serves users who need it.
2. **We document geographic restrictions.** Users must know where LETHE's
   features conflict with local law.
3. **We add disclaimers** to the first-boot wizard, release notes, and every
   public communication.
4. **We file export control notifications** (EAR for encryption).
5. **We do not actively distribute** to comprehensively sanctioned countries
   (DPRK, Iran, Syria, Cuba).

### Export control status

LETHE includes encryption software subject to:
- **US EAR** (ECCN 5D002) — open-source exemption (740.13(e)) covers publicly
  available source code.
- **EU Dual-Use Regulation** (2021/821) — "public domain" exemption, narrower
  than US. Verify applicability.
- **Wassenaar Arrangement** — Category 5 Part 2 (information security). 42 states
  coordinate these controls.

---

## What we deliberately do NOT port

- **Sandboxed Google Play.** LETHE's identity is full degoogling. Users who
  want Google compatibility should use GrapheneOS on a Pixel.
- **Pixel-only features.** Titan M2 integration, camera/mic hardware kill
  switches — these are silicon-specific. We document them as reasons to
  choose GrapheneOS on supported hardware.

---

## Decision framework

When evaluating whether to port a GrapheneOS feature:

1. **Does it work without hardware support?** If yes, it's a candidate.
2. **Does it break on any device in our list?** If yes, make it per-device.
3. **Does it conflict with LETHE's identity?** (Burner mode, degoogling, device breadth.) If yes, skip it.
4. **Is the maintenance burden sustainable?** A patch that needs rebasing every sync is fine. A fork of the Android runtime is not — unless the security gain justifies it.
