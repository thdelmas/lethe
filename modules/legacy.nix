# Legacy device overrides — LineageOS 14.1 / Android 7.1 / ARMv7.
#
# Used by: t03g (Galaxy Note II 3G), t0lte (Galaxy Note II LTE).
# Both use Exynos 4412 (ARMv7) with Mali-400 GPU.
#
# Key constraints:
# - FBE unsupported on Exynos 4412 — FDE works on LOS 14.1 only
# - Kernel 3.4.x limits modern features
# - Mali-400 caps OpenGL ES at 2.0
# - TWRP required for sideload (not Replicant Recovery)
#
{ config, lib, ... }:

{
  # Override the LineageOS branch for these devices.
  # LOS 22.1 has no Exynos 4412 support — 14.1 is the stable choice.
  androidVersion = lib.mkForce 7;

  # Source manifest points to the 14.1 branch instead of 22.1.
  source.manifest.rev = lib.mkForce "refs/heads/lineage-14.1";

  # Encryption feature is disabled — FBE doesn't work on Exynos 4412
  # and FDE is handled natively by LOS 14.1 without our overlay.
  product.extraConfig = lib.mkAfter ''
    PRODUCT_PROPERTY_OVERRIDES += \
      ro.lethe.encryption.enabled=false \
      ro.lethe.legacy=true \
      ro.lethe.legacy.base_version=14.1
  '';
}
