# Per-session encryption keys — design

**Tracks:** [#101](https://github.com/thdelmas/lethe/issues/101)  ·  **Roadmap move:** P2 → P0 (next release blocking)

## Threat model

Adversary has physical possession of a powered or recently-powered device.
Capability ranges from JTAG / SWD probing through chip-off forensics through
voltage glitching to cold-boot RAM extraction (Cellebrite Premium, GrayKey,
Magnet Forensics). Standard FBE is insufficient: the unwrap-key lives in TEE,
but once a device has been unlocked since boot (AFU), enough key material is
resident in kernel memory to recover user data with the right toolchain.

Burner mode currently *clears* `/data` on every reboot. On flash storage this
is unreliable — wear leveling and spare blocks retain copies of "deleted"
ciphertext, sometimes for months. A subsequent attacker with chip-off tooling
recovers the unwrap-key from TEE state plus the leftover ciphertext.

The fix is cryptographic, not physical: encrypt all user-visible data with a
key that **never persists** to any non-volatile medium. Reboot or wipe
destroys the key; everything written to flash is then provably noise,
independent of how thoroughly the flash was actually erased.

## Approach

Two-tier key hierarchy:

```
boot entropy (kernel rng, TEE-backed)
  └── session_master_key            (RAM only, zeroed on suspend-to-disk; never persisted)
        ├── data_class_key          (wraps FBE per-file keys for /data/lethe-session)
        ├── tmp_class_key           (wraps tmpfs-on-disk and journal scratch)
        └── messaging_class_key     (wraps Signal/SimpleX state, agent memory)
```

* `session_master_key` is derived at `early-init` from a HKDF over (kernel
  CSPRNG output, TEE attestation nonce, mixing in monotonic counter to defeat
  replay of saved entropy pools).
* The key lives only in a locked, non-swappable kernel keyring slot.
  Userspace cannot read it; only the FBE layer pulls per-file keys via the
  standard `keyctl` ioctl path.
* On reboot, BFU wipe, or panic wipe, the keyring is torn down. There is no
  "unlock" step that recovers prior data — by design.
* Persistent state the user keeps across boots (long-term identity keys,
  Signal pre-keys, paired DMS partners) lives in a separate
  TEE-wrapped class — opt-in, explicitly enumerated. Everything else is
  ephemeral.

## Why HKDF over plain TEE-keyed derivation

Pure TEE-derived keys survive reboot if TEE state survives reboot — and on
Qualcomm devices, parts of QSEE state can be replayed by an attacker with
firmware access. Mixing kernel CSPRNG output gives a forward-secrecy
property even against TEE compromise: an attacker who later replays the TEE
state alone cannot recompute the session key without the boot entropy, which
no longer exists.

## Burner-mode integration

Burner mode today wipes `/data` at `early-init` (see `init.lethe-burner.rc`).
Under per-session keys this becomes a fast operation: tear down the keyring
slot, call `EVICT_KEY` on the FBE master, drop the LRU page cache. The
on-disk ciphertext is left in place — it is already unrecoverable. Boot
proceeds with a fresh `session_master_key`. Wipe time goes from O(/data
size) to O(1).

## Prototype plan

1. **Kernel.** Patch fscrypt to accept an "ephemeral master" mode where the
   master key descriptor is registered as `KEY_FLAG_KEEP` and
   `KEY_FLAG_NON_PERSISTABLE`, with a userspace helper at
   `/system/bin/lethe-session-key` that derives + installs the key during
   `on early-init`. Single supported device first: Pixel 7a (tier-1, has TEE,
   well-documented).
2. **Init.** New service `lethe-session-key` runs before
   `vold` / `keymaster`. Registers the keyring slot, then triggers
   `setprop ro.crypto.session_key.ready 1`. Vold mounts user data classes
   referencing this key.
3. **Eviction path.** Wire `init.lethe-burner.rc` and the panic-wipe
   broadcast to call `keyctl unlink` on the slot before the existing wipe
   sequence. The wipe sequence remains as defense-in-depth but is no longer
   load-bearing.
4. **Validation.** Confirm via dm-crypt mapping table dump that the FBE
   master is gone post-wipe; confirm via `procrank` and `vmtouch` that no
   other process retained a copy; reboot, attempt to mount old `/data` on a
   workstation with a forensic image — must produce ciphertext-noise.

## Acceptance mapping

| Issue criterion | Lands in |
|---|---|
| Design doc with threat model + key-derivation scheme | this file |
| Prototype on one supported device | Pixel 7a — initrc + kernel patch in feature branch `feat/per-session-keys` |
| Path to burner-mode integration | "Burner-mode integration" section above |

## Residual risks

* **Suspend-to-disk.** Android does not by default, but `swapon` on
  configured devices would persist key pages. Block with `swapoff -a` in
  init and add a CTS-style assertion.
* **DMA from unsuspended peripherals.** USB / Thunderbolt-style DMA on a
  warm device can still read kernel memory. Mitigated by USB-data-lockout
  (issue #99) and modem isolation work; not by this change alone.
* **Cold-boot on a running device.** Sub-second power-cycle while keys are
  resident is not addressed — RAM zeroization on shutdown helps but cannot
  defeat liquid-nitrogen attacks. Out of scope.
* **TEE-only fallback on devices without good kernel CSPRNG seeding.**
  Document as a tier-2 limitation; do not silently fall back.

## Roadmap change

Move "Per-session encryption keys" from P2 (line 260) to P0
(next-release blocking) in `SECURITY-ROADMAP.md`. Without this primitive,
the burner-mode marketing claim ("reboot = data is noise") is not actually
true on flash storage.
