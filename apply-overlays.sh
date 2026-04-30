#!/usr/bin/env bash
# Lethe — Apply privacy overlays to a LineageOS source tree.
#
# Usage: lethe/apply-overlays.sh [codename]
#
# This script is called during the build process after repo sync.
# It copies overlay files into the right places in the Android source tree.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OVERLAY_DIR="$SCRIPT_DIR/overlays"
INITRC_DIR="$SCRIPT_DIR/initrc"
CODENAME="${1:-}"

# Map Rust/build target names to Android ABI directory names used by prebuilt/.
# TARGET_ARCH may be set by the build environment or defaults later.
# PREBUILT_ARCH is the directory name under prebuilt/{tor,ipfs}/.
case "${TARGET_ARCH:-}" in
    armv7-linux-androideabi|armeabi-v7a|armv7*)
        PREBUILT_ARCH="armeabi-v7a"
        ;;
    *)
        PREBUILT_ARCH="arm64-v8a"
        ;;
esac

echo "=== Lethe overlay applicator ==="
echo "Overlay dir: $OVERLAY_DIR"
echo "Codename:    ${CODENAME:-<all>}"
echo "Prebuilt:    $PREBUILT_ARCH"

# Install an init.rc into the LineageOS init dir, warning if absent.
# Args: <rc filename> [<label for log>]
install_initrc() {
    local rc="$1"
    local label="${2:-${rc#init.lethe-}}"
    label="${label%.rc}"
    if [ -d "system/core/rootdir" ]; then
        cp "$INITRC_DIR/$rc" "system/core/rootdir/"
        echo "  -> $label init service installed."
    else
        echo "  -> WARNING: init dir not found, skipping $label init service."
    fi
}

# ── 1. System properties (privacy defaults) ──
if [ -f "$OVERLAY_DIR/privacy-defaults.conf" ]; then
    echo "[1/17] Applying privacy system properties..."
    # LOS 17+ uses vendor/lineage/, cm-14.1 still uses vendor/cm/.
    if [ -f "vendor/lineage/config/common.mk" ]; then
        PROPS_TARGET="vendor/lineage/config/common.mk"
    elif [ -f "vendor/cm/config/common.mk" ]; then
        PROPS_TARGET="vendor/cm/config/common.mk"
    else
        PROPS_TARGET=""
    fi
    if [ -n "$PROPS_TARGET" ] && [ -f "$PROPS_TARGET" ]; then
        # LETHE identity props (not in conf — fixed at build time).
        cat >> "$PROPS_TARGET" <<'PROPS'

# Lethe identity
PRODUCT_PROPERTY_OVERRIDES += \
    ro.lethe=true \
    ro.lethe.version=1.0.0 \
    ro.lethe.base=lineageos \
    ro.build.display.id=LETHE\ 1.0.0 \
    ro.lineage.display.version=LETHE\ 1.0.0 \
    ro.modversion=LETHE-1.0.0

# Lethe privacy defaults (parsed from overlays/privacy-defaults.conf)
PROPS

        # Parse privacy-defaults.conf and split entries:
        #   - keys containing '.'  → build.prop system properties
        #   - keys without '.'     → Android Settings.Global (runtime applicator)
        SETTINGS_GLOBAL_OUT="system/extras/lethe/settings-global.conf"
        mkdir -p "$(dirname "$SETTINGS_GLOBAL_OUT")"
        : > "$SETTINGS_GLOBAL_OUT"
        sg_count=0
        sp_count=0
        while IFS= read -r line || [ -n "$line" ]; do
            stripped="${line%%#*}"
            stripped="${stripped#"${stripped%%[![:space:]]*}"}"
            stripped="${stripped%"${stripped##*[![:space:]]}"}"
            [ -z "$stripped" ] && continue
            case "$stripped" in *=*) ;; *) continue ;; esac
            key="${stripped%%=*}"
            val="${stripped#*=}"
            key="${key%"${key##*[![:space:]]}"}"
            [ -z "$key" ] && continue
            case "$key" in
                *.*)
                    printf 'PRODUCT_PROPERTY_OVERRIDES += %s=%s\n' \
                        "$key" "$val" >> "$PROPS_TARGET"
                    sp_count=$((sp_count + 1))
                    ;;
                *)
                    printf '%s=%s\n' "$key" "$val" >> "$SETTINGS_GLOBAL_OUT"
                    sg_count=$((sg_count + 1))
                    ;;
            esac
        done < "$OVERLAY_DIR/privacy-defaults.conf"
        echo "  -> $sp_count system properties applied to $PROPS_TARGET."

        if [ "$sg_count" -gt 0 ]; then
            cp "$SCRIPT_DIR/scripts/runtime/lethe-apply-settings.sh" "system/bin/"
            chmod 755 "system/bin/lethe-apply-settings.sh"
            INIT_DIR="system/core/rootdir"
            if [ -d "$INIT_DIR" ]; then
                cp "$INITRC_DIR/init.lethe-settings.rc" "$INIT_DIR/"
                echo "  -> $sg_count Settings.Global keys staged for first-boot applicator."
            else
                echo "  -> WARNING: init dir not found; Settings.Global keys will not apply."
            fi
        else
            rm -f "$SETTINGS_GLOBAL_OUT"
        fi
    else
        echo "  -> WARNING: $PROPS_TARGET not found; privacy properties not applied."
    fi
fi

# ── 2. Hosts file (tracker blocking) ──
if [ -f "$OVERLAY_DIR/hosts" ]; then
    echo "[2/17] Installing tracker-blocking hosts file..."
    HOSTS_TARGET="system/core/rootdir/etc/hosts"
    if [ -d "system/core/rootdir/etc" ]; then
        cp "$OVERLAY_DIR/hosts" "$HOSTS_TARGET"
        echo "  -> Hosts file installed."
    else
        echo "  -> WARNING: system/core/rootdir/etc not found, skipping hosts."
    fi
fi

# ── 3. Firewall rules ──
if [ -f "$OVERLAY_DIR/firewall-rules.conf" ]; then
    echo "[3/17] Installing default firewall rules..."
    mkdir -p "system/extras/lethe"
    cp "$OVERLAY_DIR/firewall-rules.conf" "system/extras/lethe/"
    echo "  -> Firewall rules installed."
fi

# ── 4. Burner mode ──
if [ -f "$OVERLAY_DIR/burner-mode.conf" ]; then
    echo "[4/17] Installing burner mode configuration..."
    mkdir -p "system/extras/lethe"
    cp "$OVERLAY_DIR/burner-mode.conf" "system/extras/lethe/"

    # Install runtime scripts to /system/bin
    RUNTIME_DIR="$SCRIPT_DIR/scripts/runtime"
    cp "$RUNTIME_DIR/lethe-burner-wipe.sh" "system/bin/"
    cp "$RUNTIME_DIR/lethe-mac-rotate.sh" "system/bin/"
    chmod 755 "system/bin/lethe-burner-wipe.sh" "system/bin/lethe-mac-rotate.sh"
    echo "  -> Burner runtime scripts installed."

    install_initrc init.lethe-burner.rc burner
    echo "  -> Burner mode config installed."
fi

# ── 5. Dead man's switch ──
if [ -f "$OVERLAY_DIR/dead-mans-switch.conf" ]; then
    echo "[5/17] Installing dead man's switch configuration..."
    mkdir -p "system/extras/lethe"
    cp "$OVERLAY_DIR/dead-mans-switch.conf" "system/extras/lethe/"

    # Install runtime scripts
    RUNTIME_DIR="$SCRIPT_DIR/scripts/runtime"
    cp "$RUNTIME_DIR/lethe-deadman-boot.sh" "system/bin/"
    cp "$RUNTIME_DIR/lethe-deadman-monitor.sh" "system/bin/"
    cp "$RUNTIME_DIR/lethe-deadman-duress.sh" "system/bin/"
    chmod 755 "system/bin/lethe-deadman-boot.sh" "system/bin/lethe-deadman-monitor.sh" "system/bin/lethe-deadman-duress.sh"
    echo "  -> Dead man runtime scripts installed."

    install_initrc init.lethe-deadman.rc "dead man"
    echo "  -> Dead man's switch config installed."
fi

# ── 6. Debloat — remove Google and analytics packages from build ──
echo "[6/17] Applying debloat list..."
DEBLOAT_PACKAGES=(
    "packages/apps/GoogleContactsSyncAdapter"
    "packages/apps/GoogleCalendarSyncAdapter"
    "vendor/google"
    "vendor/gms"
    "packages/apps/Browser2"
)

for pkg in "${DEBLOAT_PACKAGES[@]}"; do
    if [ -d "$pkg" ]; then
        echo "  -> Removing: $pkg"
        rm -rf "$pkg"
    fi
done
echo "  -> Debloat complete."

# ── 7. Boot animation ──
echo "[7/17] Installing boot animation..."
BOOTANIM_ZIP="$SCRIPT_DIR/bootanimation/bootanimation.zip"
if [ -f "$BOOTANIM_ZIP" ]; then
    MEDIA_TARGET="system/media"
    if [ -d "system" ]; then
        mkdir -p "$MEDIA_TARGET"
        cp "$BOOTANIM_ZIP" "$MEDIA_TARGET/bootanimation.zip"
        echo "  -> Boot animation installed."
    else
        echo "  -> WARNING: system/ not found, skipping boot animation."
    fi
else
    # Try generating on-the-fly if Python + Pillow are available
    GENERATOR="$SCRIPT_DIR/bootanimation/generate-bootanimation.py"
    if [ -f "$GENERATOR" ] && command -v python3 >/dev/null 2>&1; then
        echo "  -> Generating boot animation from lockscreen..."
        python3 "$GENERATOR" && {
            MEDIA_TARGET="system/media"
            mkdir -p "$MEDIA_TARGET"
            cp "$BOOTANIM_ZIP" "$MEDIA_TARGET/bootanimation.zip"
            echo "  -> Boot animation generated and installed."
        } || echo "  -> WARNING: boot animation generation failed, skipping."
    else
        echo "  -> WARNING: bootanimation.zip not found and cannot generate, skipping."
    fi
fi

# ── 8. Void Launcher ──
if [ -f "$OVERLAY_DIR/launcher.conf" ]; then
    echo "[8/17] Installing Void launcher overlay..."
    mkdir -p "system/extras/lethe"
    cp "$OVERLAY_DIR/launcher.conf" "system/extras/lethe/"

    # Remove Trebuchet (LineageOS default launcher) from build
    TREBUCHET_DIRS=(
        "packages/apps/Trebuchet"
        "packages/apps/Launcher3"
    )
    for tdir in "${TREBUCHET_DIRS[@]}"; do
        if [ -d "$tdir" ]; then
            echo "  -> Removing default launcher: $tdir"
            rm -rf "$tdir"
        fi
    done

    # Generate wallpapers if not present or if generator is available
    WALLPAPER_GEN="$SCRIPT_DIR/bootanimation/generate-wallpaper.py"
    if [ -f "$WALLPAPER_GEN" ] && command -v python3 >/dev/null 2>&1; then
        echo "  -> Generating minimalist wallpapers..."
        python3 "$WALLPAPER_GEN" 2>&1 || echo "  -> WARNING: wallpaper generation failed, using existing."
    fi

    # Install wallpapers to system media
    MEDIA_TARGET="system/media"
    if [ -d "system" ]; then
        mkdir -p "$MEDIA_TARGET"
        [ -f "$OVERLAY_DIR/wallpaper.png" ] && cp "$OVERLAY_DIR/wallpaper.png" "$MEDIA_TARGET/"
        [ -f "$OVERLAY_DIR/lockscreen.png" ] && cp "$OVERLAY_DIR/lockscreen.png" "$MEDIA_TARGET/"
        echo "  -> Wallpapers installed."
    fi
    echo "  -> Void launcher overlay installed."
fi

# ── 9. Tor transparent proxy ──
if [ -f "$OVERLAY_DIR/tor.conf" ]; then
    echo "[9/17] Installing Tor transparent proxy..."
    mkdir -p "system/extras/lethe"
    mkdir -p "system/etc/tor"
    cp "$OVERLAY_DIR/tor.conf" "system/etc/tor/torrc"

    # Install iptables rules script
    RUNTIME_DIR="$SCRIPT_DIR/scripts/runtime"
    cp "$RUNTIME_DIR/lethe-tor-rules.sh" "system/bin/"
    chmod 755 "system/bin/lethe-tor-rules.sh"
    echo "  -> Tor rules script installed."

    install_initrc init.lethe-tor.rc Tor
    # Check for prebuilt Tor binary
    TOR_BINARY="$SCRIPT_DIR/prebuilt/tor/$PREBUILT_ARCH/tor"
    if [ -f "$TOR_BINARY" ]; then
        cp "$TOR_BINARY" "system/bin/tor"
        chmod 755 "system/bin/tor"
        echo "  -> Tor binary installed ($PREBUILT_ARCH)."
    else
        echo "  -> WARNING: Tor binary not found at $TOR_BINARY"
        echo "     Extract from Tor Browser APK: lib/<abi>/libTor.so"
    fi
    echo "  -> Tor overlay installed."
fi

# ── 10. IPFS OTA update service ──
if [ -f "$OVERLAY_DIR/ipfs-ota.conf" ]; then
    echo "[10/17] Installing IPFS OTA update service..."
    mkdir -p "system/extras/lethe"
    cp "$OVERLAY_DIR/ipfs-ota.conf" "system/extras/lethe/"

    install_initrc init.lethe-ipfs.rc "IPFS OTA"

    # Install the OTA update script to /system/bin
    SCRIPTS_DIR="$SCRIPT_DIR/scripts"
    if [ -f "$SCRIPTS_DIR/lethe-ota-update.sh" ]; then
        mkdir -p "system/bin"
        cp "$SCRIPTS_DIR/lethe-ota-update.sh" "system/bin/lethe-ota-update.sh"
        chmod 755 "system/bin/lethe-ota-update.sh"
        echo "  -> OTA update script installed to /system/bin."
    else
        echo "  -> WARNING: lethe-ota-update.sh not found, skipping."
    fi

    # Install trust pubkey placeholder (replaced at build time with real key)
    mkdir -p "system/etc/lethe"
    if [ -f "$SCRIPT_DIR/../keys/update-pubkey.pem" ]; then
        cp "$SCRIPT_DIR/../keys/update-pubkey.pem" "system/etc/lethe/update-pubkey.pem"
        chmod 644 "system/etc/lethe/update-pubkey.pem"
        echo "  -> OTA trust pubkey installed."
    else
        echo "  -> WARNING: update-pubkey.pem not found in keys/. Generate with:"
        echo "     openssl genpkey -algorithm Ed25519 -out keys/update-privkey.pem"
        echo "     openssl pkey -in keys/update-privkey.pem -pubout -out keys/update-pubkey.pem"
    fi

    # Install prebuilt IPFS (Kubo) binary
    IPFS_BINARY="$SCRIPT_DIR/prebuilt/ipfs/$PREBUILT_ARCH/ipfs"
    if [ -f "$IPFS_BINARY" ]; then
        cp "$IPFS_BINARY" "system/bin/ipfs"
        chmod 755 "system/bin/ipfs"
        echo "  -> IPFS binary installed ($PREBUILT_ARCH)."
    else
        echo "  -> WARNING: IPFS binary not found at $IPFS_BINARY"
        echo "     Download from https://github.com/ipfs/kubo/releases"
    fi

    echo "  -> IPFS OTA overlay installed."
fi

# ── 11. LETHE agent (native AI layer) ──
echo "[11/17] Installing LETHE agent as native system component..."

    # ── 11a. Backend server (Rust binary, runs as system service) ──
    AGENT_TARGET="system/extras/lethe/agent"
    mkdir -p "$AGENT_TARGET"

    # Detect target architecture from the build environment
    TARGET_ARCH="${TARGET_ARCH:-aarch64-linux-android}"
    AGENT_BINARY="$SCRIPT_DIR/agent/target/$TARGET_ARCH/release/lethe-agent"
    if [ -f "$AGENT_BINARY" ]; then
        cp "$AGENT_BINARY" "$AGENT_TARGET/lethe-agent"
        chmod 755 "$AGENT_TARGET/lethe-agent"
        echo "  -> Backend binary installed ($TARGET_ARCH)."
    else
        echo "  -> WARNING: lethe-agent binary not found at $AGENT_BINARY"
        echo "     Build with: cd lethe/agent && ./build.sh $TARGET_ARCH"
    fi

    # Install agent wrapper script (avoids SELinux execute_no_trans on native binary)
    RUNTIME_DIR="$SCRIPT_DIR/scripts/runtime"
    cp "$RUNTIME_DIR/lethe-agent-start.sh" "system/bin/"
    chmod 755 "system/bin/lethe-agent-start.sh"

    # Copy static assets (WebView UI)
    if [ -d "$SCRIPT_DIR/static" ]; then
        cp -r "$SCRIPT_DIR/static" "$AGENT_TARGET/"
        echo "  -> Static assets copied."
    fi

    # ── 11b. Native WebView wrapper (system app in /system/app/) ──
    # A minimal Android app that wraps LETHE's localhost UI in a
    # fullscreen WebView. This makes LETHE appear as a native app:
    # - Shows in launcher with icon
    # - Shows in recent apps
    # - Handles the ASSIST intent (long-press home)
    # - Can be a lock screen shortcut
    SYSAPP_DIR="system/app/Lethe"
    mkdir -p "$SYSAPP_DIR"

    # AndroidManifest.xml for the WebView wrapper — source lives at repo root.
    mkdir -p "$SYSAPP_DIR/res/xml"
    cp "$SCRIPT_DIR/AndroidManifest.xml" "$SYSAPP_DIR/AndroidManifest.xml"
    echo "  -> AndroidManifest.xml installed."

    # Copy icon to mipmap directories
    if [ -f "$SCRIPT_DIR/static/icon-192.png" ]; then
        for DPI in mdpi hdpi xhdpi xxhdpi xxxhdpi; do
            mkdir -p "$SYSAPP_DIR/res/mipmap-$DPI"
            cp "$SCRIPT_DIR/static/icon-192.png" "$SYSAPP_DIR/res/mipmap-$DPI/ic_lethe.png"
        done
        echo "  -> App icon installed."
    fi

    # ── 11c. Java source files (security features) ──
    JAVA_SOURCE="$SCRIPT_DIR/java/org/osmosis/lethe"
    if [ -d "$JAVA_SOURCE" ]; then
        JAVA_TARGET="$SYSAPP_DIR/src/org/osmosis/lethe/agent"
        mkdir -p "$JAVA_TARGET"
        cp "$JAVA_SOURCE"/*.java "$JAVA_TARGET/"
        JAVA_COUNT=$(find "$JAVA_SOURCE" -maxdepth 1 -name '*.java' 2>/dev/null | wc -l)
        echo "  -> Java source files copied ($JAVA_COUNT files)."
    fi

    # ── 11d. Init service — backend + default assist registration ──
    install_initrc init.lethe-agent.rc "agent (backend + assist + notification)"
    echo "  -> LETHE agent installed as native system component."

# ── 12. SELinux policy ──
echo "[12/17] Installing SELinux policy for LETHE services..."
bash "$SCRIPT_DIR/scripts/install-sepolicy.sh" "$SCRIPT_DIR/sepolicy"

# ── 13. Build fingerprint ──
echo "[13/17] Setting Lethe build fingerprint..."
# Detect per-device base version from manifest (default: 21.0)
MANIFEST="$SCRIPT_DIR/manifest.yaml"
BASE_VERSION="21.0"
if [ -n "$CODENAME" ] && [ -f "$MANIFEST" ]; then
    # Check if codename has a per-device override (YAML object form)
    DEVICE_VERSION=$(grep -A3 "codename: $CODENAME" "$MANIFEST" 2>/dev/null | grep "base_version:" | head -1 | sed 's/.*base_version:[[:space:]]*"\{0,1\}\([^"]*\)"\{0,1\}/\1/')
    if [ -n "$DEVICE_VERSION" ]; then
        BASE_VERSION="$DEVICE_VERSION"
        echo "  -> Per-device base override: lineage-$BASE_VERSION"
    fi
fi
BUILD_DESC="lethe/lineage-$BASE_VERSION"
if [ -n "$CODENAME" ]; then
    BUILD_DESC="lethe/$CODENAME/lineage-$BASE_VERSION"
fi
export LETHE_BUILD_DESC="$BUILD_DESC"
echo "  -> Build: $BUILD_DESC"

# ── 14. libp2p peer inference sidecar (optional) ──
echo "[14/17] Installing decentralized config channels..."
mkdir -p "system/extras/lethe"
cp "$OVERLAY_DIR/channels.conf" "system/extras/lethe/"

SCRIPTS_DIR="$SCRIPT_DIR/scripts"
if [ -f "$SCRIPTS_DIR/lethe-channel-sync.sh" ]; then
    mkdir -p "system/bin"
    cp "$SCRIPTS_DIR/lethe-channel-sync.sh" "system/bin/lethe-channel-sync.sh"
    chmod 755 "system/bin/lethe-channel-sync.sh"
    echo "  -> Channel sync script installed."
fi
if [ -f "$SCRIPTS_DIR/lethe-channels-init.sh" ]; then
    cp "$SCRIPTS_DIR/lethe-channels-init.sh" "system/bin/lethe-channels-init.sh"
    chmod 755 "system/bin/lethe-channels-init.sh"
    echo "  -> Channels init script installed."
fi

echo "[15/17] Installing libp2p peer inference sidecar..."
mkdir -p "system/extras/lethe"
cp "$OVERLAY_DIR/p2p.conf" "system/extras/lethe/"

install_initrc init.lethe-p2p.rc P2P

# Install prebuilt lethe-p2p binary
P2P_BINARY="$SCRIPT_DIR/prebuilt/p2p/$PREBUILT_ARCH/lethe-p2p"
if [ -f "$P2P_BINARY" ]; then
    mkdir -p "system/extras/lethe/bin"
    cp "$P2P_BINARY" "system/extras/lethe/bin/lethe-p2p"
    chmod 755 "system/extras/lethe/bin/lethe-p2p"
    echo "  -> lethe-p2p binary installed ($PREBUILT_ARCH)."
else
    echo "  -> NOTE: lethe-p2p binary not found at $P2P_BINARY"
    echo "     Build with: cd lethe/p2p && bash build.sh"
    echo "     Peer inference will be unavailable."
fi

# ── 16. EdgeVPN device cluster ──
echo "[16/17] Installing EdgeVPN device cluster..."
mkdir -p "system/extras/lethe"
cp "$OVERLAY_DIR/edgevpn.conf" "system/extras/lethe/"

install_initrc init.lethe-cluster.rc cluster

if [ -f "$SCRIPT_DIR/scripts/lethe-cluster.sh" ]; then
    cp "$SCRIPT_DIR/scripts/lethe-cluster.sh" "system/bin/"
    chmod 755 "system/bin/lethe-cluster.sh"
    echo "  -> Cluster wrapper script installed."
fi

EDGEVPN_BIN="$SCRIPT_DIR/prebuilt/edgevpn/$PREBUILT_ARCH/edgevpn"
if [ -f "$EDGEVPN_BIN" ]; then
    mkdir -p "system/extras/lethe/bin"
    cp "$EDGEVPN_BIN" "system/extras/lethe/bin/edgevpn"
    chmod 755 "system/extras/lethe/bin/edgevpn"
    echo "  -> edgevpn binary installed ($PREBUILT_ARCH)."
else
    echo "  -> NOTE: edgevpn binary not found at $EDGEVPN_BIN"
    echo "     Download from https://github.com/mudler/edgevpn/releases"
    echo "     Device clustering will be unavailable."
fi

echo "[17/17] Overlay summary..."
echo "  Overlays installed:"
for f in "$OVERLAY_DIR"/*; do
    [ -f "$f" ] && echo "    - $(basename "$f")"
done

echo ""
echo "=== Lethe overlays applied successfully ==="
