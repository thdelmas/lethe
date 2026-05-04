# Hidden volumes / plausible deniability — feasibility

**Tracks:** [#102](https://github.com/thdelmas/lethe/issues/102)  ·  **Tentative status:** opt-in, tier-1 devices only, with prominent honest caveats

## Threat model

Border official, customs officer, or police compels the user to unlock the
device. The user wants to surrender a credential that yields a plausibly
"clean" device — a decoy — while a separate, hidden volume containing
sensitive material remains undisclosed and indistinguishable from
free space.

This is the classic VeraCrypt / TrueCrypt hidden-volume model. It is
**genuinely hard on flash storage** — and we should be honest with users
about what we can and cannot deliver.

## What honestly does not work

* **Android multi-user profiles (decoy profiles).** Already documented in
  `SECURITY-ROADMAP.md:379-384`. Forensic tools enumerate user profiles
  trivially via `pm list users`, the userdata layout, or the existence of
  an `/data/system/users/N` directory. No deniability.
* **Plain dm-crypt hidden volume on raw flash.** Wear leveling and
  garbage collection mean the FTL knows about all written blocks. A
  forensic image of the *raw NAND* (chip-off) reveals two distinct
  populations of high-entropy blocks corresponding to two encrypted
  volumes, even when the file-system layer cannot. This is well-documented
  in the Shufflecake paper.
* **Encrypted file containers (Veracrypt-style).** A single high-entropy
  file of ~/data sized capacity is itself a tell.

## What plausibly works (and where it breaks)

### Shufflecake (ACM CCS 2023)

Linux kernel module `dm-sflc`. Multiple nested encrypted layers; each
unlock reveals one layer; remaining layers are indistinguishable from
free space within that mapping. Defeats the *file-system-level* forensic
tool. Does **not** defeat:

* **Chip-off / FTL-level analysis.** Same wear-leveling tell.
* **Timing analysis.** Block writes to the hidden layer perturb the
  decoy layer's free-space map in observable ways over time.
* **Coercion of the schema itself.** If the adversary knows the device
  *might* run Shufflecake, the existence of a hidden layer is a
  reasonable suspicion. Plausible deniability degenerates into
  "you can't prove it but you suspect it."

The Shufflecake authors are explicit: this is plausible deniability
against forensic *software*, not against forensic *hardware*.

### What changes on Android specifically

* Android FBE / dm-default-key already wraps the whole filesystem.
  Adding a Shufflecake layer means **two** encryption layers, with
  performance impact (~15-20% on sequential writes per the paper, more
  on slower flash).
* Android's vold has strong assumptions about a single userdata
  partition. We'd need a custom mount path that vold isn't aware of —
  workable, but invasive.
* The TRIM caveats are severe. Default TRIM on `/data` would tell the
  FTL to reclaim hidden-layer blocks as free, corrupting them. Have to
  disable TRIM on the userdata block device entirely while a hidden
  layer is mounted. This *itself* is a side-channel signal.

## Proposed scope (if we proceed)

Tier-1 devices only (Pixel 7a, Pixel 8 — known kernel, decent
performance headroom). Opt-in flag at first-boot wizard, hidden behind
"Advanced — hidden volume (read warnings first)." Prototype:

1. Build `dm-sflc` against the LETHE Pixel kernel. Modify
   `KSPP`/`KSPP-extra` config; ensure CFI doesn't trip.
2. Create a separate unlock path: the lock screen accepts a
   *decoy* PIN that mounts the outer Shufflecake layer (which is the
   user's everyday LETHE), and a *real* PIN that mounts both outer +
   hidden. Crucially: entering the decoy PIN must not change the hidden
   layer's free-space map in observable ways. This requires Shufflecake's
   "shadow journal" feature.
3. Ensure burner mode wipes both layers cleanly.
4. Disable TRIM on the userdata block while hidden layer is configured
   — and document the wear cost.

## Acceptance mapping

| Issue criterion | Lands in |
|---|---|
| Feasibility write-up | this file |
| Prototype encrypted hidden volume mountable from a separate unlock path | "Proposed scope" — branch `feat/shufflecake-prototype`, tier-1 only |
| Docs covering residual risks (timing, free-space analysis) | "What honestly does not work" + "Residual risks" sections |

## Recommendation

**Proceed cautiously, not as a flagship feature.** We should ship the
Shufflecake prototype as opt-in for users who explicitly accept the
caveats, and we should *not* market plausible deniability as a primary
selling point. The strongest version of LETHE's pitch is "if seized, the
device is BFU / data is keyless noise" — that's #101. Hidden volumes
help in a narrow scenario (compelled unlock + the adversary uses
software-level forensics only), and overstating them puts users at
risk.

If we ship without the honest caveats above, we risk the kind of
"plausible deniability" that has put activists in prison: it works
until it doesn't, and the user does not know in advance which case
they are in.

## Residual risks (must appear in user-facing docs)

* Chip-off / NAND dump defeats this entirely. State law-enforcement
  forensic services (FBI, BKA, DGSI) have this capability.
* Persistent timing / free-space patterns leak the existence of a
  hidden layer to an adversary doing repeated forensic snapshots.
* Coercion of the user is unaddressed — this is a technical
  countermeasure to a technical attack; it doesn't help against
  rubber-hose cryptanalysis.
* TRIM-disabled userdata wears out flash faster; document the SSD
  lifetime impact for tier-1 devices.
