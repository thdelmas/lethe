# Device security matrix

Per-device verified-boot status, bootloader policy, and recommendation tier
for the LETHE [supported device list](../manifest.yaml). Addresses
[issue #113](https://github.com/thdelmas/lethe/issues/113) — most non-Pixel
devices ship with unlocked bootloaders and have no path to relock with a
custom AVB key, so a forensic operator with physical access can flash custom
recovery and extract `/data` even when LETHE itself is correctly locked
down.

This is transparency, not a recommendation against these devices for general
privacy use. It exists so high-risk users (journalists, activists, lawyers
handling protected sources) can pick the device tier their threat model
requires.

## Tiers

| Tier | Meaning |
|------|---------|
| **High-risk** | Bootloader can be re-locked with a custom AVB key. Verified Boot enforces LETHE's signature on every boot. Suitable for journalists, activists, anyone with a credible physical-extraction threat. |
| **Standard**  | Bootloader stays unlocked or has no custom-AVB relock path. Software-only attacks blocked, physical-extraction attacks possible. Suitable for everyday privacy use, not border-crossing or seizure scenarios. |
| **Legacy**    | Pre-Treble device on cm-14.1. No verified-boot, no SELinux relock, ARMv7 only. Acceptable as a burner that's expected to be wiped on every boot. |

## Matrix

| Codename | Brand / Model | Base | Bootloader | Custom AVB relock | TEE-backed keys | Tier |
|---|---|---|---|---|---|---|
| **panther**    | Pixel 7         | LOS 22.1 | unlocked at flash | yes  | Titan M2 | High-risk |
| **cheetah**    | Pixel 7 Pro     | LOS 22.1 | unlocked at flash | yes  | Titan M2 | High-risk |
| **lynx**       | Pixel 7a        | LOS 22.1 | unlocked at flash | yes  | Titan M2 | High-risk |
| **shiba**      | Pixel 8         | LOS 22.1 | unlocked at flash | yes  | Titan M2 | High-risk |
| **husky**      | Pixel 8 Pro     | LOS 22.1 | unlocked at flash | yes  | Titan M2 | High-risk |
| **akita**      | Pixel 8a        | LOS 22.1 | unlocked at flash | yes  | Titan M2 | High-risk |
| **caiman**     | Pixel 9         | LOS 22.1 | unlocked at flash | yes  | Titan M2 | High-risk |
| **komodo**     | Pixel 9 Pro     | LOS 22.1 | unlocked at flash | yes  | Titan M2 | High-risk |
| **tokay**      | Pixel 9 Pro Fold| LOS 22.1 | unlocked at flash | yes  | Titan M2 | High-risk |
| **FP4**        | Fairphone 4     | LOS 22.1 | unlocked at flash | yes (Fairphone-signed only) | Qualcomm SPU | Standard+ |
| **FP5**        | Fairphone 5     | LOS 22.1 | unlocked at flash | yes (Fairphone-signed only) | Qualcomm SPU | Standard+ |
| **spacewar**   | Nothing Phone (1) | LOS 22.1 | unlocked at flash | no  | Qualcomm TEE | Standard |
| **pong**       | Nothing Phone (2) | LOS 22.1 | unlocked at flash | no  | Qualcomm TEE | Standard |
| **pacman**     | Nothing Phone (2a)| LOS 22.1 | unlocked at flash | no  | MediaTek TEE | Standard |
| **instantnoodlep** | OnePlus 8 Pro | LOS 22.1 | unlocked at flash | no  | Qualcomm TEE | Standard |
| **lemonades**  | OnePlus 9       | LOS 22.1 | unlocked at flash | no  | Qualcomm TEE | Standard |
| **martini**    | OnePlus 9 Pro   | LOS 22.1 | unlocked at flash | no  | Qualcomm TEE | Standard |
| **courbet**    | Xiaomi Mi 11 Lite 4G | LOS 22.1 | unlocked at flash + permission wait | no | Qualcomm TEE | Standard |
| **renoir**     | Xiaomi Mi 11 Lite 5G | LOS 22.1 | unlocked at flash + permission wait | no | Qualcomm TEE | Standard |
| **hawao**      | Moto G7 Plus    | LOS 22.1 | unlocked at flash + per-device code | no | Qualcomm TEE | Standard |
| **devon**      | Moto G52        | LOS 22.1 | unlocked at flash + per-device code | no | Qualcomm TEE | Standard |
| **pdx206**     | Sony Xperia 1 II  | LOS 22.1 | unlocked at flash + per-device code | no | Qualcomm TEE | Standard |
| **pdx215**     | Sony Xperia 1 III | LOS 22.1 | unlocked at flash + per-device code | no | Qualcomm TEE | Standard |
| **chagalllte** | Galaxy Tab S 10.5 | LOS (unof.) | n/a (Knox-fused; Knox void) | no | none | Standard |
| **t03g**       | Galaxy Note II 3G  | cm-14.1 | n/a (no AVB on cm-14.1) | no | none | Legacy |
| **t0lte**      | Galaxy Note II LTE | cm-14.1 | n/a (no AVB on cm-14.1) | no | none | Legacy |

## What "Custom AVB relock" actually means

On Pixel devices, after `fastboot flashing unlock` and flashing a custom
ROM, you can `fastboot flash avb_custom_key` with the LETHE signing key and
then `fastboot flashing lock`. Verified Boot will subsequently refuse any
boot/system image not signed by that key. A forensic operator can still
unlock the bootloader, but doing so triggers a factory wipe and shows a
visible warning at every boot — the original `/data` doesn't survive.

On most non-Pixel devices, `fastboot flashing lock` after unlock either
fails outright or relocks against the OEM key only (refusing custom ROMs
including LETHE). There is no path to a re-locked state with a custom key.
A physical operator can flash arbitrary recovery and extract `/data` while
the user is detained.

Fairphone is the partial exception: relock works but only against
Fairphone-signed images, so a custom LETHE build can't be relocked. This
is why Fairphone is listed Standard+ rather than High-risk — better than
average physical-attack resistance via the SPU, but not the full Pixel
relock story.

## First-boot warning

Devices not in the High-risk tier surface a one-time first-boot screen:

> **Bootloader cannot be re-locked.**
>
> This device's bootloader stays unlocked. LETHE's privacy hardening still
> applies, but if someone takes physical possession of the phone, they can
> flash a custom recovery and read `/data`. For a privacy-only threat
> model this is fine. For a high-risk threat model (border crossing,
> seizure, search warrant) consider a Pixel.

The user must acknowledge before continuing. The acknowledgement timestamp
is logged locally (and wiped along with `/data` on burner-mode wipe).

## Field-build (lethe#95)

When `LETHE_FIELD_BUILD=1` is set, the build process additionally drops
non-Pixel codenames from the default device-build matrix. Field-build APKs
are only produced for High-risk-tier hardware. Operators wanting a
field-build for a Standard device can override via build flag, but the
warning copy doubles down.

## Updates

This matrix is regenerated as part of the release pipeline; check the
git history before relying on it for an active threat-model decision.
The bootloader columns reflect the situation at the time of writing —
vendors occasionally change policy mid-generation (Xiaomi has tightened
unlock multiple times). Always cross-check with LineageOS upstream for
the device you're considering.
