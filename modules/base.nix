# LETHE base module — core configuration for all devices.
#
# Phase 1: wraps the existing apply-overlays.sh as a postPatch hook.
# Phase 2: each overlay step becomes its own Nix module (see plan).
#
{ config, lib, pkgs, ... }:

let
  cfg = config.lethe;
in {
  options.lethe = {
    enable = lib.mkEnableOption "LETHE privacy overlay";

    version = lib.mkOption {
      type = lib.types.str;
      default = "1.1.0";
      description = "LETHE version string baked into the build.";
    };
  };

  config = lib.mkMerge [
    # Always enable LETHE when this module is imported.
    { lethe.enable = lib.mkDefault true; }

    (lib.mkIf cfg.enable {

      # ── Product identity ──
      productNamePrefix = "lineage_";

      # ── Phase 1: run apply-overlays.sh inside the LOS source tree ──
      #
      # The overlay script expects to run from the root of the LOS tree
      # with the lethe/ directory present at vendor/lethe/. The flake.nix
      # already places our source there via source.dirs."vendor/lethe".
      #
      # postPatch runs after the source directory is checked out,
      # giving us a chance to inject all overlays before `mka bacon`.
      source.dirs."vendor/lineage".postPatch = ''
        echo "[lethe/nix] Running apply-overlays.sh from Nix build..."
        if [ -x ../vendor/lethe/apply-overlays.sh ]; then
          bash ../vendor/lethe/apply-overlays.sh
        else
          echo "[lethe/nix] WARNING: apply-overlays.sh not found or not executable"
        fi
      '';

      # ── Init services ──
      # All 5 init.rc files are injected into system/core/rootdir/ so the
      # Android init process picks them up at boot.
      source.dirs."system/core".postPatch = ''
        echo "[lethe/nix] Injecting init.rc services..."
        for rc in ../vendor/lethe/initrc/init.lethe-*.rc; do
          if [ -f "$rc" ]; then
            cp "$rc" rootdir/
            echo "  copied $(basename "$rc")"
          fi
        done
      '';

      # ── Hosts file (tracker blocking) ──
      # Robotnix built-in: copies to system/core/rootdir/etc/hosts
      hosts = ../overlays/hosts;

      # ── Debloat ──
      # Remove Google packages that LETHE replaces with FOSS alternatives.
      removedProductPackages = [
        "Browser2"
        "Trebuchet"                # Replaced by Void launcher
        "Launcher3"
        "GoogleContactsSyncAdapter"
        "GoogleCalendarSyncAdapter"
      ];

      # ── System properties ──
      # Core LETHE identity and privacy defaults injected via makefile.
      product.extraConfig = ''
        PRODUCT_PROPERTY_OVERRIDES += \
          ro.lethe=true \
          ro.lethe.version=${cfg.version} \
          ro.lethe.base=lineageos \
          ro.build.display.id=LETHE\ ${cfg.version}
      '';

      # ── Signing ──
      signing.enable = true;
      # Key store path is relative to the build invocation.
      # Keys are never committed — generated via: nix build .#generateKeysScript
      signing.keyStorePath = lib.mkDefault "/home/mia/OSmosis/keys";
    })
  ];
}
