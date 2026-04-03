# Hidden Gems: OS & Kernel Hardening

> Research compiled 2026-03-31. Part of the hidden-gems series.
> Priority: P0 (ship-blocking), P1 (next release), P2 (3-6mo), P3 (long-term).

Already in LETHE: SELinux enforcing, nftables default-deny, ADB secure,
user builds, FBE/FDE, per-session keys, hosts-file blocking.

---

## 1. Kernel Security

### LKRG 1.0 (Linux Kernel Runtime Guard) — P1
- **URL**: https://lkrg.org / https://github.com/lkrg-org/lkrg
- **What**: Loadable kernel module for runtime integrity checking.
  Detects unauthorized kernel modifications, credential escalation,
  exploit attempts. 1.0 stable Sep 2025. ARM64 and ARMv7.
- **Why**: Unlike compile-time hardening (KSPP), LKRG catches exploits
  at runtime. Combined with SELinux, adds detection layer most ROMs lack.

### KSPP Features Audit — P1
- **Source**: https://ssg.aalto.fi/research/projects/kernel-hardening/
- **What**: Upstream features often left off in LineageOS:
  `CONFIG_INIT_ON_FREE_DEFAULT_ON`, `CONFIG_STACKLEAK_PLUGIN`,
  `CONFIG_CFI_CLANG`, `CONFIG_RANDOMIZE_KSTACK_OFFSET_DEFAULT`.
- **Why**: Audit and enable all KSPP kconfig options. Low effort, high
  impact.

### ARM MTE (Memory Tagging Extension) — P1
- **Source**: https://source.android.com/docs/security/test/memory-safety/arm-mte
- **What**: Hardware memory tagging. 4-bit tag per allocation; mismatch
  = immediate fault. Catches 93.75% memory corruption in ASYNC mode.
- **Android**: ARMv9 (Pixel 8+, Snapdragon 8 Gen 2+). Since Android 13.
- **Why**: GrapheneOS enables by default. LETHE should too.

### seccomp-bpf Custom Policies — P2
- **Source**: android-developers.googleblog.com (Seccomp in Android O)
- **What**: Android's default seccomp blocks only 17/271 syscalls on
  arm64. LETHE could tighten per-app based on declared capabilities.
- **Why**: Block syscalls apps should never need. Reduces kernel attack
  surface per-app.

---

## 2. Verified Boot

### AVB Custom Keys + Re-locked Bootloader — P1
- **Source**: AOSP AVB docs / AXP.OS docs
- **What**: Flash own RSA 4096 signing key, re-lock bootloader. Full
  verified boot chain with rollback protection. "Yellow" state but
  FULL integrity.
- **Android**: Pixel native, some OnePlus/Fairphone.
- **Why**: Most custom ROMs disable AVB. LETHE ships with own signing
  keys. Only GrapheneOS does this well today.

### dm-verity with Custom Signing — P1
- **What**: Block-level Merkle hash trees for /system /vendor. Any
  modification causes boot failure, preventing persistent rootkits.
- **Why**: LineageOS disables this by default. Re-enable with LETHE
  keys = significant security upgrade.

### EroFS for Read-Only Partitions — P2
- **What**: Enhanced Read-Only File System for /system /vendor.
  Compressed, integrity guarantees, smaller partitions.
- **Why**: Combined with dm-verity, provides tamper-evident partitions.
  Any modification immediately detectable.

---

## 3. Sandboxing & Isolation

### Droidspaces — P2
- **URL**: https://github.com/ravindu644/Droidspaces-OSS
- **What**: LXC-inspired container runtime for Android. Under 260KB.
  Kernel namespaces (PID, MNT, UTS, IPC, NET, cgroup). Handles SELinux
  automatically.
- **Why**: Run Tor/IPFS in isolated containers. If Tor is compromised,
  attacker is trapped. 260KB = viable on low-end devices.

### Network Namespaces Per App — P1
- **What**: Per-app network namespaces. Only interface is a tunnel.
  Apps physically cannot bypass assigned network. Kernel-enforced,
  unlike VPN-based firewalling (root apps bypass via raw sockets).
- **Why**: Assign apps to Tor / VPN / direct. No userspace bypass.

### Multi-User + Work Profile Isolation — P2
- **What**: Up to 4 secondary users + Work Profiles = 8 isolated
  domains. Each gets separate FBE key, app data, UID range.
- **Why**: User 0 = daily, User 1 = Tor-only burner, Work Profile =
  untrusted apps. Independent encryption keys per user.

### Accessibility Whitelist at Framework Level — P1
- **What**: Hardcode whitelist allowing only LETHE agent for
  Accessibility Services. All others denied at OS level.
- **Why**: Eliminates entire class of accessibility malware. Android 17
  moves this direction with `isAccessibilityTool`.

---

## 4. WebView & Browser

### Cromite SystemWebView — P1
- **URL**: https://github.com/uazo/cromite
- **What**: Privacy-hardened Chromium. Drop-in SystemWebView. Ad
  blocking (EasyList), fingerprint protections. Chrome extension support
  (alpha, Nov 2025). CalyxOS ships this.
- **Why**: System-wide tracker blocking for ALL apps.

### IronFox — P1
- **URL**: https://gitlab.com/ironfox-oss/IronFox
- **What**: Successor to Mull. Hardened Firefox/Gecko. Default
  fingerprinting protections, uBlock Origin, no Mozilla telemetry.
- **Why**: Cromite lacks fingerprinting resistance. Ship both: IronFox
  default browser, Cromite WebView.

---

## 5. Notifications & Push

### UnifiedPush + ntfy.sh — P1
- **URL**: https://unifiedpush.org / https://docs.ntfy.sh
- **What**: Decentralized push notifications. Self-hostable. Zero Google
  code. Growing ecosystem (Tusky, FluffyChat, Element, SchildiChat).
- **Why**: Ship ntfy as system service and default UnifiedPush
  distributor. Google-free push. Route through Tor.

---

## 6. USB Security

### USB Data Lockout (Android 16 Backport) — P1
- **Source**: Android 16 Advanced Protection Mode.
- **What**: USB data disabled when locked. Only charging. Blocks
  Cellebrite/GrayKey, USB keyboard brute-force, payload injection.
- **Why**: Backport + extend: require explicit confirmation for USB data
  even when unlocked.

---

## 7. eBPF & Low-Power Monitoring

### eBPF Kernel-Space Firewall — P1
- **Source**: https://source.android.com/docs/core/data/ebpf-traffic-monitor
- **What**: Since Android 9. Per-UID blocking in kernel. Custom programs
  can fingerprint tracker protocols, enforce DNS, block IPs -- zero
  wakeups.
- **Why**: Supplement/replace nftables. Dramatically more power-efficient
  than userspace packet filtering.

### fanotify Filesystem Monitoring — P1
- **Source**: man7.org/linux/man-pages/man7/fanotify.7.html
- **What**: Kernel filesystem events for entire mount points. One fd
  monitors /data, /system, /vendor. Permission events BLOCK malicious
  writes before completion.
- **Why**: Use instead of inotify. Single fd for everything. Block
  unauthorized APK installs before they happen.

### eBPF kprobes for Syscall Monitoring — P2
- **What**: Attach eBPF to execve, connect, open. Near-zero overhead.
- **Why**: Detect privilege escalation without polling. Catches attempts
  before they succeed.

### BPF-filtered fanotify — P3
- **Source**: Kernel Recipes 2025
- **What**: BPF programs pre-filter fanotify events in-kernel. Only
  matching events generate wakeups.
- **Why**: Always-on integrity monitoring with minimal battery impact.
  Bleeding edge (kernel 6.x+).

---

## 8. Firewalling

### Fyrypt (PID-Level Firewall) — P2
- **URL**: https://github.com/mirfatif/Fyrypt
- **What**: Beyond UID to PID granularity. Integrates dnscrypt-proxy.
  Needs cls_cgroup and xt_cgroup in kernel.
- **Why**: System subprocess phoning home? UID firewalls allow it (same
  UID). Fyrypt blocks the specific subprocess.

### InviZible Pro Architecture — P2
- **URL**: https://github.com/Gedsh/InviZible
- **What**: Tor + DNSCrypt + I2P in single app. Per-app routing rules.
  With or without root.
- **Why**: Study for combining daemons into single process. Per-app
  routing (Tor / I2P / direct) is exactly what LETHE needs.

---

## 9. Encryption

### F2FS Metadata Encryption (dm-default-key) — P1
- **Source**: https://source.android.com/docs/security/features/encryption/metadata
- **What**: Standard FBE encrypts contents/names but leaves metadata
  (sizes, timestamps, file count) exposed. dm-default-key encrypts
  everything else on the block device.
- **Why**: Without this, forensic examiners reconstruct timelines on
  encrypted devices. LineageOS may not configure by default.

---

## 10. System-Level Rust

### AOSP Rust Components — P2
- **Source**: https://source.android.com/docs/setup/build/rust/
- **What**: ~1.5M lines Rust in AOSP: Keystore2, UWB, DNS-over-HTTP3,
  Rust Binder IPC.
- **Why**: LETHE custom services should use AOSP Rust toolchain. Binder
  Rust bindings = safe IPC without C++ memory corruption.

### Rust CLI Replacements — P2
- **What**: ripgrep, fd, bat compiled as static ARM binaries via NDK.
- **Why**: Replace grep/find/sed in init scripts. Eliminates shell
  injection vulnerabilities, reduces startup time.

---

## 11. Malware Detection

### Hypatia / LoveLaceAV — P2
- **URL**: https://github.com/Divested-Mobile/Hypatia
- **What**: FOSS real-time malware scanner. ClamAV signatures. Sub-20ms
  scan time. Under 120MB memory. Community forks continue after DivestOS
  shutdown (Dec 2024).
- **Why**: Integrate into fanotify for real-time scan of all file writes.

---

## 12. Android 16/17 Features to Backport

From Android 16 Advanced Protection Mode:
- USB data lockout when locked (see above)
- **2G network disabling** (prevents IMSI catchers)
- **Auto-reboot after 72h inactivity** (clears memory-resident keys)
- App sideloading restrictions

From Android 17 (beta, Mar 2026):
- `isAccessibilityTool` flag enforcement
- Non-accessibility apps blocked from Accessibility API

LETHE should cherry-pick these and make them **default**, not opt-in.

---

## Integration Priority

**P0:** Auto-reboot to BFU (see gems-privacy-forensics.md)

**P1:** LKRG, KSPP audit, MTE, AVB custom keys, dm-verity, network
namespaces, accessibility whitelist, Cromite WebView, IronFox,
UnifiedPush/ntfy, USB data lockout, eBPF firewall, fanotify,
F2FS metadata encryption

**P2:** Droidspaces containers, Work Profile isolation, seccomp per-app,
Fyrypt PID firewall, InviZible architecture, eBPF kprobes, AOSP Rust,
EroFS, Hypatia/LoveLaceAV

**P3:** BPF-filtered fanotify
