# LETHE Security Roadmap

Closing the hardening gap with GrapheneOS — without giving up device breadth.

GrapheneOS is deeper security: hardened allocator, verified boot, exec-based spawning.
LETHE is broader reach + operational security: burner mode, dead man's switch, 300+ devices.
This roadmap bridges the two by porting what we can and fixing what we control.

---

## P0 — Ship-blocking (config fixes, no code)

### Fix ADB authentication

`ro.adb.secure=0` and `ro.debuggable=1` give any USB cable full shell access
with zero authentication. This defeats encryption, burner mode, and dead man's
switch — an adversary just plugs in.

**Changes:**
- Set `ro.adb.secure=1` and `ro.debuggable=0` in `privacy-defaults.conf`
- OSmosis USB pairing exchanges ADB RSA keys at pair time
- Unpaired USB connections get nothing

**Why this matters:** Without this fix, every other security feature is theater.

### Switch to `user` builds

`manifest.yaml` builds `lineage_{codename}-userdebug`. Userdebug builds have
relaxed SELinux domains, `adb root` access, and exposed debug interfaces.

**Changes:**
- Build target becomes `lineage_{codename}-user`
- Add a separate `lethe-dev` variant for contributors who need debug access

---

## P1 — Quick wins (low effort, meaningful impact)

### Default-deny input firewall

`firewall-rules.conf` input chain has `policy accept`. Any service listening on
the device is reachable from the local network.

**Changes:**
- Input chain default policy becomes `drop`
- Explicitly allow: DHCP replies, DNS responses, established/related connections, loopback
- These rules already exist — just flip the default

### Per-connection MAC randomization

LETHE randomizes MAC on wipe, but a single MAC per boot session lets networks
correlate all activity within that session. Android 14 supports per-network,
per-connection randomization natively.

**Changes:**
- Enable AOSP's per-connection MAC randomization via system property
- Verify it works on LineageOS 21.0 base across device list

### AVB relock on Pixel builds

Unlocked bootloaders let an attacker flash anything — but on Pixels, you can
relock with custom Android Verified Boot keys. GrapheneOS does exactly this.

**Changes:**
- Generate LETHE AVB signing keys
- Sign Pixel builds with custom AVB keys
- Document the relock flow for users
- Non-Pixel devices stay unlocked — document the tradeoff honestly

---

## P2 — Ported hardening (high effort, high impact)

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

### Network attestation
Detect IMSI catchers and rogue base stations. Warn user when cell tower
behavior is anomalous. Research stage — no existing portable implementation.

### Secure element integration
On devices with hardware secure elements (Pixels, newer Samsung), store
dead man's switch passphrase and encryption keys in hardware. Currently
everything lives in software on `/persist`.

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
