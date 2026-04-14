{
  description = "LETHE — privacy-hardened Android overlay on LineageOS";

  inputs = {
    robotnix = {
      url = "github:nix-community/robotnix";
    };
    nixpkgs.follows = "robotnix/nixpkgs";
  };

  outputs = { self, robotnix, nixpkgs }:
    let
      # Build a LETHE configuration for a given device codename.
      # Extra per-device overrides are merged into the base config.
      mkLethe = codename: extraConfig: robotnix.lib.robotnixSystem ({
        imports = [
          ./modules/base.nix
        ] ++ (extraConfig.imports or []);

        device = codename;
        flavor = "lineageos";
        variant = "user";

        # LETHE overlay source — injected into the LOS tree at build time.
        # Phase 1: apply-overlays.sh runs as a postPatch hook in base.nix.
        source.dirs."vendor/lethe" = {
          src = self;
          enable = true;
        };
      } // (builtins.removeAttrs extraConfig [ "imports" ]));

      # ── Modern devices (LineageOS 22.1 / Android 15) ──
      modernDevices = [
        # Samsung
        "chagalllte"
        # Google Pixel
        "panther" "cheetah" "lynx"
        "shiba" "husky" "akita"
        "caiman" "komodo" "tokay"
        # Nothing
        "spacewar" "pong" "pacman"
        # Fairphone
        "FP4" "FP5"
        # OnePlus
        "instantnoodlep" "lemonades" "martini"
        # Xiaomi
        "courbet" "renoir"
        # Motorola
        "hawao" "devon"
        # Sony
        "pdx206" "pdx215"
      ];

      # ── Legacy devices (LineageOS 14.1 / Android 7.1 / ARMv7) ──
      legacyOverrides = {
        imports = [ ./modules/legacy.nix ];
      };

      # Build the full device matrix
      modernConfigs = builtins.listToAttrs (map (d: {
        name = d;
        value = mkLethe d {};
      }) modernDevices);

      legacyConfigs = {
        t03g  = mkLethe "t03g"  legacyOverrides;
        t0lte = mkLethe "t0lte" legacyOverrides;
      };

      allConfigs = modernConfigs // legacyConfigs;

    in {
      # Full robotnix configurations — access any output:
      #   nix build .#robotnixConfigurations.panther.img
      #   nix build .#robotnixConfigurations.panther.ota
      robotnixConfigurations = allConfigs;

      # Convenience: nix build .#packages.x86_64-linux.panther
      # Each package is the device image (.img output from robotnixSystem).
      # These are intentionally lazy — only evaluated when a specific device is built.
      packages.x86_64-linux = builtins.mapAttrs
        (name: cfg: cfg.img)
        allConfigs;

      # Dev shell with Android build tools
      devShells.x86_64-linux.default = import ./shell.nix {
        pkgs = import nixpkgs { system = "x86_64-linux"; };
      };
    };
}
