# LETHE development shell.
#
# Provides all tools needed to build LETHE images.
# Usage:
#   nix develop          (via flake.nix devShells)
#   nix-shell shell.nix  (standalone, without flakes)
#
{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  name = "lethe-dev";

  buildInputs = with pkgs; [
    # Android build system
    git
    gnumake
    python3
    python3Packages.pillow   # Boot animation / wallpaper generation
    jdk17                    # AOSP build requires JDK 17
    curl
    wget
    unzip
    zip
    lz4

    # Repo tool (Android source management)
    gitRepo

    # Rust agent cross-compilation
    rustup
    # cargo-ndk is installed via: cargo install cargo-ndk
    # Android NDK is pulled by the AOSP build system

    # Signing & OTA
    openssl                  # Ed25519 key generation + signing

    # Code quality
    shellcheck               # Shell script linting
    shfmt                    # Shell formatting

    # Optional: IPFS for OTA publishing
    # kubo                   # IPFS daemon (uncomment if needed)
  ];

  shellHook = ''
    echo ""
    echo "  LETHE development shell"
    echo "  ─────────────────────────"
    echo "  Build:   nix build .#robotnixConfigurations.<device>.img"
    echo "  Devices: panther cheetah lynx shiba husky akita ..."
    echo "  Legacy:  t03g t0lte (LOS 14.1 / ARMv7)"
    echo ""
    echo "  Fallback (bash pipeline):"
    echo "    repo init -u https://github.com/LineageOS/android.git -b lineage-22.1"
    echo "    repo sync -c -j\$(nproc) --force-sync"
    echo "    bash lethe/apply-overlays.sh"
    echo "    source build/envsetup.sh && lunch lineage_<device>-user && mka bacon"
    echo ""

    # Ensure Rust targets are available for agent cross-compilation
    if command -v rustup &>/dev/null; then
      rustup target add aarch64-linux-android 2>/dev/null || true
      rustup target add armv7-linux-androideabi 2>/dev/null || true
    fi
  '';
}
