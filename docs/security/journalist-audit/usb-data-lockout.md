# USB data lockout backport — design

**Tracks:** [#99](https://github.com/thdelmas/lethe/issues/99)  ·  **Status:** before next release

## Threat model

A locked phone connected to forensic hardware (Cellebrite Premium, GrayKey,
Magnet GrayKey, XRY) over USB. The Feb-2025 Cellebrite leak documented that
GrapheneOS-on-Pixel was inaccessible while every locked stock-Android device
yielded data. The dividing line was Android 16 Advanced Protection Mode
("USB data off when locked"), shipped on Pixel 8+ in late 2025. LineageOS
22.1 (Android 15) does not yet inherit it — every LETHE v1.0.0 device is
exposed.

Adjacent attack surface served by the same fix:

* USB-keyboard brute-force ("PIN bruter" cables that drop in HID PIN entry).
* USB-payload injection (Rubber Ducky / Bash Bunny class).
* USB DMA pivots through accessory-protocol drivers.

## Approach

Three layers, top-down — drop USB data at framework level (cheap), at HAL
level (defense-in-depth), and at kernel level (the only one a sufficiently
local attacker cannot bypass).

### Layer 1 — Framework gadget mode

Android sets the USB function set via
`UsbDeviceManager.setCurrentFunctions()`. Patch
`frameworks/base/services/usb/UsbDeviceManager.java` so that whenever the
keyguard is locked **and** the user has not explicitly authorized USB this
session, the gadget configuration is forced to `charging` (no MTP, no PTP,
no ADB, no MIDI, no accessory).

This is the patch GrapheneOS uses; it is roughly 200 lines and applies
cleanly to LineageOS 22.1.

### Layer 2 — `configfs` USB gadget guard

A native helper at `/system/bin/lethe-usbguard` watches the keyguard state
(via Binder to `KeyguardManager`) and, on lock, writes
`none` to
`/config/usb_gadget/g1/UDC` while clearing function symlinks. This prevents
a userspace race where the Java framework would re-enable a function before
keyguard returns. Unblocks again on first unlock-with-credential.

### Layer 3 — Kernel-level USB drop

Most invasive, most thorough. Add a hook in the configfs gadget driver
(`drivers/usb/gadget/configfs.c`) that consults a sysfs flag
`/sys/kernel/lethe/usb_locked`. When set, the gadget refuses to enumerate
beyond a no-function `charging` configuration regardless of what userspace
asks for. `init.lethe-deadman.rc` and the panic-wipe path can also flip
this flag directly, removing the need to coordinate with the framework
during emergencies.

### USB-debugging full lockdown

In LETHE's "lockdown mode" Quick Settings tile (already present per
`SECURITY-ROADMAP.md:42-50`), additionally disable ADB by writing
`adbd` out of its enabled state regardless of `ro.adb.secure`. This closes
the gap the issue calls out — "Go further: require explicit confirmation
for USB data even when unlocked."

## Device support matrix

| Tier | Devices | Layer 1 | Layer 2 | Layer 3 |
|---|---|---|---|---|
| 1 | Pixel 6/7/7a/8 | ✓ | ✓ | ✓ (Pixel kernel sources) |
| 2 | Fairphone 5, OnePlus Nord | ✓ | ✓ | best-effort (vendor kernel) |
| 3 | older Samsung, t03g | ✓ | ✓ | not attempted (no kernel source) |

Tier-3 devices ship with layers 1+2 only. Document the residual risk
honestly in the device matrix.

## Test plan

1. Pixel 7a — locked, plug into a Cellebrite-class extraction rig (or, for
   our purposes, a USB protocol analyzer sniffing enumeration). Expected:
   only a charging configuration enumerates, no MTP/PTP/ADB descriptors
   visible.
2. Fairphone 5 — same, but with layer 2 only.
3. Negative test: with screen on and unlocked, MTP returns. Re-lock,
   re-test — MTP disappears within 250 ms.
4. Bypass attempts: spam USB suspend/resume to race the framework
   (caught by layer 2); attempt vendor-mode jump via `adbd` reload (caught
   by layer 3 sysfs flag).

## Acceptance mapping

| Issue criterion | Lands in |
|---|---|
| Kernel / framework patches cherry-picked or reimplemented | Layers 1–3 above; branch `feat/usb-data-lockout` |
| Test on a Pixel + one non-Pixel device | Pixel 7a + Fairphone 5 |
| Documented in FEATURES.md | Add row "USB data lockout when locked — yes (tier-1/2 full, tier-3 best-effort)" |

## Residual risks

* Layer-3-less devices remain vulnerable to a vendor-USB-mode pivot.
  Not papered over; documented per device.
* USB-charging-only mode still exposes the VBUS power interface — does not
  defend against juice-jacking that exploits charging-only USB peripherals
  (rare, but real). Mitigated by user policy, not by this change.
* If the device is unlocked at the moment it is plugged in, the attacker
  gets one full USB session until lock. Auto-reboot-to-BFU
  (`SECURITY-ROADMAP.md:101-112`) and short auto-lock timeout shrink that
  window; don't eliminate it.
