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

echo "=== Lethe overlay applicator ==="
echo "Overlay dir: $OVERLAY_DIR"
echo "Codename:    ${CODENAME:-<all>}"

# ── 1. System properties (privacy defaults) ──
if [ -f "$OVERLAY_DIR/privacy-defaults.conf" ]; then
    echo "[1/13] Applying privacy system properties..."
    # Append to device-specific system.prop or vendor build.prop
    PROPS_TARGET="vendor/lineage/config/common.mk"
    if [ -f "$PROPS_TARGET" ]; then
        # Add Lethe product info
        cat >> "$PROPS_TARGET" <<'PROPS'

# Lethe privacy defaults
PRODUCT_PROPERTY_OVERRIDES += \
    ro.lethe=true \
    ro.lethe.version=1.0.0 \
    ro.lethe.base=lineageos \
    ro.build.display.id=LETHE\ 1.0.0 \
    ro.lineage.display.version=LETHE\ 1.0.0 \
    ro.modversion=LETHE-1.0.0
PROPS
    fi
    echo "  -> System properties applied."
fi

# ── 2. Hosts file (tracker blocking) ──
if [ -f "$OVERLAY_DIR/hosts" ]; then
    echo "[2/13] Installing tracker-blocking hosts file..."
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
    echo "[3/13] Installing default firewall rules..."
    mkdir -p "system/extras/lethe"
    cp "$OVERLAY_DIR/firewall-rules.conf" "system/extras/lethe/"
    echo "  -> Firewall rules installed."
fi

# ── 4. Burner mode ──
if [ -f "$OVERLAY_DIR/burner-mode.conf" ]; then
    echo "[4/13] Installing burner mode configuration..."
    mkdir -p "system/extras/lethe"
    cp "$OVERLAY_DIR/burner-mode.conf" "system/extras/lethe/"

    # Install the early-init wipe service (template in initrc/).
    INIT_DIR="system/core/rootdir"
    if [ -d "$INIT_DIR" ]; then
        cp "$INITRC_DIR/init.lethe-burner.rc" "$INIT_DIR/"
        echo "  -> Burner init service installed."
    else
        echo "  -> WARNING: init dir not found, skipping burner init service."
    fi
    echo "  -> Burner mode config installed."
fi

# ── 5. Dead man's switch ──
if [ -f "$OVERLAY_DIR/dead-mans-switch.conf" ]; then
    echo "[5/13] Installing dead man's switch configuration..."
    mkdir -p "system/extras/lethe"
    cp "$OVERLAY_DIR/dead-mans-switch.conf" "system/extras/lethe/"

    INIT_DIR="system/core/rootdir"
    if [ -d "$INIT_DIR" ]; then
        cp "$INITRC_DIR/init.lethe-deadman.rc" "$INIT_DIR/"
        echo "  -> Dead man init service installed."
    else
        echo "  -> WARNING: init dir not found, skipping dead man init service."
    fi
    echo "  -> Dead man's switch config installed."
fi

# ── 6. Debloat — remove Google and analytics packages from build ──
echo "[6/13] Applying debloat list..."
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
echo "[7/13] Installing boot animation..."
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
    echo "[8/13] Installing Void launcher overlay..."
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
    echo "[9/13] Installing Tor transparent proxy..."
    mkdir -p "system/extras/lethe"
    mkdir -p "system/etc/tor"
    cp "$OVERLAY_DIR/tor.conf" "system/etc/tor/torrc"

    INIT_DIR="system/core/rootdir"
    if [ -d "$INIT_DIR" ]; then
        cp "$INITRC_DIR/init.lethe-tor.rc" "$INIT_DIR/"
        echo "  -> Tor init service installed."
    else
        echo "  -> WARNING: init dir not found, skipping Tor init service."
    fi
    echo "  -> Tor overlay installed."
fi

# ── 10. IPFS OTA update service ──
if [ -f "$OVERLAY_DIR/ipfs-ota.conf" ]; then
    echo "[10/13] Installing IPFS OTA update service..."
    mkdir -p "system/extras/lethe"
    cp "$OVERLAY_DIR/ipfs-ota.conf" "system/extras/lethe/"

    INIT_DIR="system/core/rootdir"
    if [ -d "$INIT_DIR" ]; then
        cp "$INITRC_DIR/init.lethe-ipfs.rc" "$INIT_DIR/"
        echo "  -> IPFS OTA init service installed."
    else
        echo "  -> WARNING: init dir not found, skipping IPFS OTA init service."
    fi

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

    echo "  -> IPFS OTA overlay installed."
fi

# ── 11. LETHE agent (native AI layer) ──
echo "[11/13] Installing LETHE agent as native system component..."
AGENT_SOURCE="${AGENT_DIR:-${LETHE_DIR:-${BENDER_DIR:-$SCRIPT_DIR/../../bender}}}"
if [ -d "$AGENT_SOURCE" ]; then
    # ── 10a. Backend server (Python, runs as system service) ──
    AGENT_TARGET="system/extras/lethe/agent"
    mkdir -p "$AGENT_TARGET"
    cp "$AGENT_SOURCE/app.py" "$AGENT_TARGET/"
    cp "$AGENT_SOURCE/requirements.txt" "$AGENT_TARGET/"
    cp -r "$AGENT_SOURCE/server" "$AGENT_TARGET/"
    cp -r "$AGENT_SOURCE/templates" "$AGENT_TARGET/"
    cp -r "$AGENT_SOURCE/static" "$AGENT_TARGET/"
    echo "  -> Backend server copied."

    # ── 10b. Native WebView wrapper (system app in /system/app/) ──
    # A minimal Android app that wraps LETHE's localhost UI in a
    # fullscreen WebView. This makes LETHE appear as a native app:
    # - Shows in launcher with icon
    # - Shows in recent apps
    # - Handles the ASSIST intent (long-press home)
    # - Can be a lock screen shortcut
    SYSAPP_DIR="system/app/Lethe"
    mkdir -p "$SYSAPP_DIR"

    # AndroidManifest.xml for the WebView wrapper
    mkdir -p "$SYSAPP_DIR/res/xml"
    cat > "$SYSAPP_DIR/AndroidManifest.xml" <<'MANIFEST'
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="org.osmosis.lethe.agent"
    android:versionCode="1"
    android:versionName="1.0"
    android:sharedUserId="android.uid.system">

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.RECORD_AUDIO" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
    <uses-permission android:name="android.permission.REBOOT" />
    <uses-permission android:name="android.permission.VIBRATE" />

    <application
        android:label="LETHE"
        android:icon="@mipmap/ic_lethe"
        android:theme="@android:style/Theme.NoTitleBar.Fullscreen"
        android:persistent="true">

        <!-- Main activity — WebView wrapper -->
        <activity
            android:name=".LetheActivity"
            android:label="LETHE"
            android:launchMode="singleTask"
            android:screenOrientation="portrait"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

        <!-- Voice assist handler — long-press home triggers LETHE -->
        <activity
            android:name=".LetheAssistActivity"
            android:label="LETHE"
            android:launchMode="singleTask"
            android:theme="@android:style/Theme.Translucent.NoTitleBar"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.ASSIST" />
                <category android:name="android.intent.category.DEFAULT" />
            </intent-filter>
            <intent-filter>
                <action android:name="android.intent.action.VOICE_COMMAND" />
                <category android:name="android.intent.category.DEFAULT" />
            </intent-filter>
            <intent-filter>
                <action android:name="android.intent.action.SEARCH_LONG_PRESS" />
                <category android:name="android.intent.category.DEFAULT" />
            </intent-filter>
        </activity>

        <!-- Persistent notification service — always-on quick access -->
        <service
            android:name=".LetheNotificationService"
            android:exported="false">
        </service>

        <!-- Quick Settings tile -->
        <service
            android:name=".LetheTileService"
            android:label="LETHE"
            android:icon="@mipmap/ic_lethe"
            android:permission="android.permission.BIND_QUICK_SETTINGS_TILE"
            android:exported="true">
            <intent-filter>
                <action android:name="android.service.quicksettings.action.QS_TILE" />
            </intent-filter>
        </service>

        <!-- Boot receiver — start services on boot -->
        <receiver
            android:name=".BootReceiver"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.BOOT_COMPLETED" />
            </intent-filter>
        </receiver>

        <!-- Dead man's switch check-in receiver -->
        <receiver
            android:name=".CheckinReceiver"
            android:exported="true">
            <intent-filter>
                <action android:name="lethe.intent.CHECKIN_DUE" />
            </intent-filter>
        </receiver>

        <!-- Check-in passphrase dialog -->
        <activity
            android:name=".CheckinDialogActivity"
            android:theme="@android:style/Theme.DeviceDefault.Dialog"
            android:excludeFromRecents="true"
            android:exported="false" />

        <!-- DMS settings — passphrase-protected disable -->
        <activity
            android:name=".DeadmanSettingsActivity"
            android:theme="@android:style/Theme.DeviceDefault.Dialog"
            android:excludeFromRecents="true"
            android:exported="true">
            <intent-filter>
                <action android:name="lethe.intent.DEADMAN_SETTINGS" />
                <category android:name="android.intent.category.DEFAULT" />
            </intent-filter>
        </activity>

        <!-- Panic press monitor (5x power = wipe) -->
        <service
            android:name=".PanicPressService"
            android:exported="false" />

        <!-- Duress PIN receiver (silent wipe on fake unlock) -->
        <receiver
            android:name=".DuressPinReceiver"
            android:exported="true">
            <intent-filter>
                <action android:name="lethe.intent.DURESS_UNLOCK" />
            </intent-filter>
        </receiver>

        <!-- OTA update notification receiver -->
        <receiver
            android:name=".OtaReceiver"
            android:exported="true">
            <intent-filter>
                <action android:name="lethe.intent.OTA_AVAILABLE" />
            </intent-filter>
        </receiver>

    </application>
</manifest>
MANIFEST
    echo "  -> AndroidManifest.xml created."

    # Copy icon to mipmap directories
    if [ -f "$AGENT_SOURCE/static/icon-192.png" ]; then
        for DPI in mdpi hdpi xhdpi xxhdpi xxxhdpi; do
            mkdir -p "$SYSAPP_DIR/res/mipmap-$DPI"
            cp "$AGENT_SOURCE/static/icon-192.png" "$SYSAPP_DIR/res/mipmap-$DPI/ic_lethe.png"
        done
        echo "  -> App icon installed."
    fi

    # ── 10b2. Java source files (security features) ──
    JAVA_SOURCE="$SCRIPT_DIR/java/org/osmosis/lethe"
    if [ -d "$JAVA_SOURCE" ]; then
        JAVA_TARGET="$SYSAPP_DIR/src/org/osmosis/lethe/agent"
        mkdir -p "$JAVA_TARGET"
        cp "$JAVA_SOURCE"/*.java "$JAVA_TARGET/"
        JAVA_COUNT=$(find "$JAVA_SOURCE" -maxdepth 1 -name '*.java' 2>/dev/null | wc -l)
        echo "  -> Java source files copied ($JAVA_COUNT files)."
    fi

    # ── 10c. Init service — backend + default assist registration ──
    INIT_DIR="system/core/rootdir"
    if [ -d "$INIT_DIR" ]; then
        cp "$INITRC_DIR/init.lethe-agent.rc" "$INIT_DIR/"
        echo "  -> Init service installed (backend + assist + notification)."
    fi
    echo "  -> LETHE agent installed as native system component."
else
    echo "  -> WARNING: Agent source not found at $AGENT_SOURCE, skipping."
    echo "     Set AGENT_DIR or LETHE_DIR to override, or place bender/ alongside OSmosis."
fi

# ── 12. Build fingerprint ──
echo "[12/13] Setting Lethe build fingerprint..."
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

# ── 13. Summary ──
echo "[13/13] Overlay summary..."
echo "  Overlays installed:"
for f in "$OVERLAY_DIR"/*; do
    [ -f "$f" ] && echo "    - $(basename "$f")"
done

echo ""
echo "=== Lethe overlays applied successfully ==="
