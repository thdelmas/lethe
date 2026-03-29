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
CODENAME="${1:-}"

echo "=== Lethe overlay applicator ==="
echo "Overlay dir: $OVERLAY_DIR"
echo "Codename:    ${CODENAME:-<all>}"

# ── 1. System properties (privacy defaults) ──
if [ -f "$OVERLAY_DIR/privacy-defaults.conf" ]; then
    echo "[1/10] Applying privacy system properties..."
    # Append to device-specific system.prop or vendor build.prop
    PROPS_TARGET="vendor/lineage/config/common.mk"
    if [ -f "$PROPS_TARGET" ]; then
        # Add Lethe product info
        cat >> "$PROPS_TARGET" <<'PROPS'

# Lethe privacy defaults
PRODUCT_PROPERTY_OVERRIDES += \
    ro.lethe=true \
    ro.lethe.version=1.0.0 \
    ro.lethe.base=lineageos
PROPS
    fi
    echo "  -> System properties applied."
fi

# ── 2. Hosts file (tracker blocking) ──
if [ -f "$OVERLAY_DIR/hosts" ]; then
    echo "[2/10] Installing tracker-blocking hosts file..."
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
    echo "[3/10] Installing default firewall rules..."
    mkdir -p "system/extras/lethe"
    cp "$OVERLAY_DIR/firewall-rules.conf" "system/extras/lethe/"
    echo "  -> Firewall rules installed."
fi

# ── 4. Burner mode ──
if [ -f "$OVERLAY_DIR/burner-mode.conf" ]; then
    echo "[4/10] Installing burner mode configuration..."
    mkdir -p "system/extras/lethe"
    cp "$OVERLAY_DIR/burner-mode.conf" "system/extras/lethe/"

    # Install the early-init wipe service.
    # This runs before Android userspace: reads persist.lethe.burner.enabled
    # and wipes /data + /sdcard if true, then rotates device identifiers.
    INIT_DIR="system/core/rootdir"
    if [ -d "$INIT_DIR" ]; then
        cat > "$INIT_DIR/init.lethe-burner.rc" <<'INITRC'
# Lethe burner mode — early-init wipe service
# Runs before zygote. Reads config from /persist partition.

on early-init
    # Mount persist partition to read burner mode preference
    mount ext4 /dev/block/bootdevice/by-name/persist /persist nosuid nodev noatime

on post-fs-data
    # Check burner mode toggle (stored on /persist, survives wipe)
    exec -- /system/bin/sh -c "\
        ENABLED=$(getprop persist.lethe.burner.enabled); \
        if [ \"$ENABLED\" = \"true\" ]; then \
            log -t lethe-burner 'Burner mode active — wiping user data'; \
            rm -rf /data/app /data/data /data/user /data/user_de /data/misc/wifi /data/misc/bluedroid; \
            rm -rf /data/media/0/*; \
            rm -rf /data/system/notification_log; \
            settings put secure android_id $(cat /dev/urandom | tr -dc 'a-f0-9' | head -c 16); \
            log -t lethe-burner 'Wipe complete — booting clean session'; \
        else \
            log -t lethe-burner 'Burner mode disabled — normal boot'; \
        fi"

service lethe-mac-rotate /system/bin/sh -c "\
    ENABLED=$(getprop persist.lethe.burner.enabled); \
    if [ \"$ENABLED\" = \"true\" ]; then \
        MAC=$(cat /dev/urandom | tr -dc 'a-f0-9' | head -c 12 | sed 's/../&:/g;s/:$//'); \
        ip link set wlan0 down; \
        ip link set wlan0 address $MAC; \
        ip link set wlan0 up; \
        log -t lethe-burner \"MAC rotated to $MAC\"; \
    fi"
    class late_start
    oneshot
    disabled

on property:sys.boot_completed=1
    start lethe-mac-rotate
INITRC
        echo "  -> Burner init service installed."
    else
        echo "  -> WARNING: init dir not found, skipping burner init service."
    fi
    echo "  -> Burner mode config installed."
fi

# ── 5. Dead man's switch ──
if [ -f "$OVERLAY_DIR/dead-mans-switch.conf" ]; then
    echo "[5/10] Installing dead man's switch configuration..."
    mkdir -p "system/extras/lethe"
    cp "$OVERLAY_DIR/dead-mans-switch.conf" "system/extras/lethe/"

    INIT_DIR="system/core/rootdir"
    if [ -d "$INIT_DIR" ]; then
        cat > "$INIT_DIR/init.lethe-deadman.rc" <<'INITRC'
# Lethe dead man's switch — boot-time enforcement
# Runs after persist is mounted, before zygote.
# Checks elapsed time since last check-in using hardware RTC.
# If deadline exceeded: lock → wipe → brick (escalating).

on post-fs-data
    exec -- /system/bin/sh -c "\
        ENABLED=$(cat /persist/lethe/deadman.prop 2>/dev/null | grep 'persist.lethe.deadman.enabled=true'); \
        if [ -z \"$ENABLED\" ]; then \
            log -t lethe-deadman 'Dead man switch disabled — skipping'; \
            exit 0; \
        fi; \
        \
        INTERVAL_RAW=$(getprop persist.lethe.deadman.interval); \
        INTERVAL_RAW=${INTERVAL_RAW:-24h}; \
        case \"$INTERVAL_RAW\" in \
            12h) INTERVAL=43200 ;; \
            24h) INTERVAL=86400 ;; \
            48h) INTERVAL=172800 ;; \
            72h) INTERVAL=259200 ;; \
            7d)  INTERVAL=604800 ;; \
            *)   INTERVAL=86400 ;; \
        esac; \
        \
        GRACE_S=14400; \
        DEADLINE=\$((INTERVAL + GRACE_S)); \
        \
        HEARTBEAT_FILE=/persist/lethe/deadman/last_checkin; \
        if [ ! -f \"$HEARTBEAT_FILE\" ]; then \
            log -t lethe-deadman 'No heartbeat — first boot, writing initial checkin'; \
            mkdir -p /persist/lethe/deadman; \
            date +%s > \$HEARTBEAT_FILE; \
            exit 0; \
        fi; \
        \
        LAST_CHECKIN=\$(cat \$HEARTBEAT_FILE 2>/dev/null); \
        NOW=\$(date +%s); \
        ELAPSED=\$((NOW - LAST_CHECKIN)); \
        \
        log -t lethe-deadman \"Elapsed: \${ELAPSED}s, deadline: \${DEADLINE}s\"; \
        \
        if [ \$ELAPSED -gt \$DEADLINE ]; then \
            log -t lethe-deadman 'DEADLINE EXCEEDED'; \
            setprop persist.lethe.deadman.stage locked; \
            \
            WIPE_DEADLINE=\$((DEADLINE + 3600)); \
            if [ \$ELAPSED -gt \$WIPE_DEADLINE ]; then \
                log -t lethe-deadman 'Stage 2: WIPING'; \
                setprop persist.lethe.deadman.stage wiped; \
                rm -rf /data/app /data/data /data/user /data/user_de; \
                rm -rf /data/misc/wifi /data/misc/bluedroid; \
                rm -rf /data/media/0/*; \
                \
                STAGE3_ENABLED=\$(getprop persist.lethe.deadman.stage3.enabled); \
                BRICK_DEADLINE=\$((WIPE_DEADLINE + 7200)); \
                if [ \"\$STAGE3_ENABLED\" = \"true\" ] && [ \$ELAPSED -gt \$BRICK_DEADLINE ]; then \
                    log -t lethe-deadman 'Stage 3: BRICKING'; \
                    dd if=/dev/urandom of=/dev/block/bootdevice/by-name/boot bs=4096 count=1024 2>/dev/null; \
                    dd if=/dev/urandom of=/dev/block/bootdevice/by-name/recovery bs=4096 count=1024 2>/dev/null; \
                    rm -rf /persist/lethe; \
                    reboot; \
                fi; \
            fi; \
        else \
            log -t lethe-deadman \"OK — \$((DEADLINE - ELAPSED))s remaining\"; \
        fi"

# Duress PIN handler
on property:persist.lethe.deadman.duress_triggered=true
    exec -- /system/bin/sh -c "\
        log -t lethe-deadman 'DURESS PIN — silent wipe'; \
        rm -rf /data/app /data/data /data/user /data/user_de; \
        rm -rf /data/misc/wifi /data/misc/bluedroid; \
        rm -rf /data/media/0/*; \
        setprop persist.lethe.deadman.duress_triggered false; \
        log -t lethe-deadman 'Duress wipe complete'"

# Runtime check-in monitor
service lethe-deadman-monitor /system/bin/sh -c "\
    while true; do \
        ENABLED=$(getprop persist.lethe.deadman.enabled); \
        if [ \"$ENABLED\" != \"true\" ]; then sleep 3600; continue; fi; \
        HEARTBEAT_FILE=/persist/lethe/deadman/last_checkin; \
        LAST=$(cat $HEARTBEAT_FILE 2>/dev/null || echo 0); \
        NOW=$(date +%s); ELAPSED=$((NOW - LAST)); \
        case \"$(getprop persist.lethe.deadman.interval)\" in \
            12h) I=43200;; 24h) I=86400;; 48h) I=172800;; 72h) I=259200;; 7d) I=604800;; *) I=86400;; \
        esac; \
        if [ $ELAPSED -ge $I ]; then \
            log -t lethe-deadman 'Check-in due'; \
            am broadcast -a lethe.intent.CHECKIN_DUE --ez overdue true; \
        fi; \
        sleep 900; \
    done"
    class late_start
    oneshot
    disabled

on property:sys.boot_completed=1
    start lethe-deadman-monitor
INITRC
        echo "  -> Dead man init service installed."
    else
        echo "  -> WARNING: init dir not found, skipping dead man init service."
    fi
    echo "  -> Dead man's switch config installed."
fi

# ── 6. Debloat — remove Google and analytics packages from build ──
echo "[6/10] Applying debloat list..."
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
echo "[7/10] Installing boot animation..."
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

# ── 8. Tor transparent proxy ──
if [ -f "$OVERLAY_DIR/tor.conf" ]; then
    echo "[8/13] Installing Tor transparent proxy..."
    mkdir -p "system/extras/lethe"
    mkdir -p "system/etc/tor"
    cp "$OVERLAY_DIR/tor.conf" "system/etc/tor/torrc"

    INIT_DIR="system/core/rootdir"
    if [ -d "$INIT_DIR" ]; then
        cat > "$INIT_DIR/init.lethe-tor.rc" <<'INITRC'
# Lethe — Tor transparent proxy
# Starts Tor daemon and applies iptables NAT rules to redirect
# all user app traffic through Tor. No user app traffic bypasses Tor.

service lethe-tor /system/bin/tor -f /system/etc/tor/torrc
    class main
    user 9050
    group 9050 inet net_admin
    capabilities NET_ADMIN NET_BIND_SERVICE
    disabled

on post-fs-data
    # Create Tor data directory on /persist (survives burner wipe)
    mkdir /persist/lethe/tor 0700 9050 9050

on property:sys.boot_completed=1
    start lethe-tor

    # Apply transparent proxy iptables rules after Tor starts
    exec -- /system/bin/sh -c "\
        sleep 5; \
        \
        # Redirect user app DNS (UDP 53) to Tor DNS port \
        iptables -t nat -A OUTPUT -m owner --uid-owner 10000-99999 -p udp --dport 53 \
            -j REDIRECT --to-ports 5400; \
        iptables -t nat -A OUTPUT -m owner --uid-owner 10000-99999 -p tcp --dport 53 \
            -j REDIRECT --to-ports 5400; \
        \
        # Redirect all user app TCP to Tor TransPort \
        iptables -t nat -A OUTPUT -m owner --uid-owner 10000-99999 -p tcp \
            -j REDIRECT --to-ports 9040; \
        \
        # Drop user app UDP (except DNS, already redirected) — Tor is TCP only \
        iptables -A OUTPUT -m owner --uid-owner 10000-99999 -p udp ! --dport 53 -j DROP; \
        \
        # Allow Tor daemon (UID 9050) direct network access \
        iptables -A OUTPUT -m owner --uid-owner 9050 -j ACCEPT; \
        \
        # Allow IPFS daemon (UID 9051) loopback only (routes through Tor SOCKS) \
        iptables -A OUTPUT -m owner --uid-owner 9051 -o lo -j ACCEPT; \
        iptables -A OUTPUT -m owner --uid-owner 9051 -j DROP; \
        \
        log -t lethe-tor 'Transparent proxy rules applied'"
INITRC
        echo "  -> Tor init service installed."
    else
        echo "  -> WARNING: init dir not found, skipping Tor init service."
    fi
    echo "  -> Tor overlay installed."
fi

# ── 9. IPFS OTA update service ──
if [ -f "$OVERLAY_DIR/ipfs-ota.conf" ]; then
    echo "[9/13] Installing IPFS OTA update service..."
    mkdir -p "system/extras/lethe"
    cp "$OVERLAY_DIR/ipfs-ota.conf" "system/extras/lethe/"

    INIT_DIR="system/core/rootdir"
    if [ -d "$INIT_DIR" ]; then
        cat > "$INIT_DIR/init.lethe-ipfs.rc" <<'INITRC'
# Lethe — IPFS OTA update client
# Runs a lightweight IPFS node in client-only mode (no DHT serving).
# All swarm traffic routed through Tor SOCKS proxy.
# Periodically resolves IPNS channel for signed update manifests.

service lethe-ipfs /system/bin/sh -c "\
    export IPFS_PATH=/data/lethe/ipfs; \
    if [ ! -d $IPFS_PATH ]; then \
        ipfs init --profile=lowpower 2>/dev/null; \
        ipfs config Routing.Type dhtclient; \
        ipfs config --json Swarm.DisableNatPortMap true; \
        ipfs config --json Gateway.NoFetch true; \
        ipfs config Addresses.Gateway ''; \
        ipfs config Addresses.API /ip4/127.0.0.1/tcp/5001; \
        ipfs config --json Swarm.ProxyCommand '[\"connect-proxy\", \"-S\", \"127.0.0.1:9050\"]'; \
    fi; \
    ipfs daemon --routing=dhtclient 2>&1 | log -t lethe-ipfs"
    class late_start
    user 9051
    group 9051 inet
    disabled

service lethe-ota-check /system/bin/sh -c "\
    while true; do \
        sleep 21600; \
        ENABLED=$(getprop persist.lethe.ipfs.enabled); \
        if [ \"$ENABLED\" != \"true\" ]; then continue; fi; \
        \
        export IPFS_PATH=/data/lethe/ipfs; \
        log -t lethe-ota 'Checking for updates via IPNS...'; \
        CID=$(ipfs name resolve lethe-updates 2>/dev/null); \
        if [ -n \"$CID\" ]; then \
            MANIFEST=$(ipfs cat $CID/manifest.json 2>/dev/null); \
            if [ -n \"$MANIFEST\" ]; then \
                log -t lethe-ota \"Update manifest found: $CID\"; \
                echo \"$MANIFEST\" > /data/lethe/pending-update.json; \
                am broadcast -a lethe.intent.OTA_AVAILABLE --es cid \"$CID\"; \
            fi; \
        else \
            log -t lethe-ota 'No updates found'; \
        fi; \
    done"
    class late_start
    oneshot
    disabled

on property:sys.boot_completed=1
    mkdir /data/lethe/ipfs 0700 9051 9051
    start lethe-ipfs
    start lethe-ota-check
INITRC
        echo "  -> IPFS OTA init service installed."
    else
        echo "  -> WARNING: init dir not found, skipping IPFS OTA init service."
    fi
    echo "  -> IPFS OTA overlay installed."
fi

# ── 10. Bender (native AI layer) ──
echo "[10/13] Installing Bender as native system component..."
BENDER_SOURCE="${BENDER_DIR:-$SCRIPT_DIR/../../bender}"
if [ -d "$BENDER_SOURCE" ]; then
    # ── 10a. Backend server (Python, runs as system service) ──
    BENDER_TARGET="system/extras/lethe/bender"
    mkdir -p "$BENDER_TARGET"
    cp "$BENDER_SOURCE/app.py" "$BENDER_TARGET/"
    cp "$BENDER_SOURCE/requirements.txt" "$BENDER_TARGET/"
    cp -r "$BENDER_SOURCE/server" "$BENDER_TARGET/"
    cp -r "$BENDER_SOURCE/templates" "$BENDER_TARGET/"
    cp -r "$BENDER_SOURCE/static" "$BENDER_TARGET/"
    echo "  -> Backend server copied."

    # ── 10b. Native WebView wrapper (system app in /system/app/) ──
    # A minimal Android app that wraps Bender's localhost UI in a
    # fullscreen WebView. This makes Bender appear as a native app:
    # - Shows in launcher with icon
    # - Shows in recent apps
    # - Handles the ASSIST intent (long-press home)
    # - Can be a lock screen shortcut
    SYSAPP_DIR="system/app/Bender"
    mkdir -p "$SYSAPP_DIR"

    # AndroidManifest.xml for the WebView wrapper
    mkdir -p "$SYSAPP_DIR/res/xml"
    cat > "$SYSAPP_DIR/AndroidManifest.xml" <<'MANIFEST'
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="org.osmosis.bender"
    android:versionCode="1"
    android:versionName="1.0"
    android:sharedUserId="android.uid.system">

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.RECORD_AUDIO" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />

    <application
        android:label="Bender"
        android:icon="@mipmap/ic_bender"
        android:theme="@android:style/Theme.NoTitleBar.Fullscreen"
        android:persistent="true">

        <!-- Main activity — WebView wrapper -->
        <activity
            android:name=".BenderActivity"
            android:label="Bender"
            android:launchMode="singleTask"
            android:screenOrientation="portrait"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

        <!-- Voice assist handler — long-press home triggers Bender -->
        <activity
            android:name=".BenderAssistActivity"
            android:label="Bender"
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
            android:name=".BenderNotificationService"
            android:exported="false">
        </service>

        <!-- Quick Settings tile -->
        <service
            android:name=".BenderTileService"
            android:label="Bender"
            android:icon="@mipmap/ic_bender"
            android:permission="android.permission.BIND_QUICK_SETTINGS_TILE"
            android:exported="true">
            <intent-filter>
                <action android:name="android.service.quicksettings.action.QS_TILE" />
            </intent-filter>
        </service>

        <!-- Boot receiver — start notification service on boot -->
        <receiver
            android:name=".BootReceiver"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.BOOT_COMPLETED" />
            </intent-filter>
        </receiver>

    </application>
</manifest>
MANIFEST
    echo "  -> AndroidManifest.xml created."

    # Copy icon to mipmap directories
    if [ -f "$BENDER_SOURCE/static/icon-192.png" ]; then
        for DPI in mdpi hdpi xhdpi xxhdpi xxxhdpi; do
            mkdir -p "$SYSAPP_DIR/res/mipmap-$DPI"
            cp "$BENDER_SOURCE/static/icon-192.png" "$SYSAPP_DIR/res/mipmap-$DPI/ic_bender.png"
        done
        echo "  -> App icon installed."
    fi

    # ── 10c. Init service — backend + default assist registration ──
    INIT_DIR="system/core/rootdir"
    if [ -d "$INIT_DIR" ]; then
        cat > "$INIT_DIR/init.lethe-bender.rc" <<'INITRC'
# Lethe — Bender native AI layer
# 1. Starts the Python backend on localhost:8080
# 2. Registers Bender as default assist app (long-press home)
# 3. Posts persistent notification for quick access

service lethe-bender /system/bin/sh -c "\
    cd /system/extras/lethe/bender && \
    python3 -c 'from app import app; app.run(host=\"127.0.0.1\", port=8080, debug=False)'"
    class late_start
    user root
    group root inet
    disabled

on property:sys.boot_completed=1
    start lethe-bender

    # Set Bender as default assist app (long-press home)
    exec -- /system/bin/sh -c "\
        settings put secure assistant org.osmosis.bender/.BenderAssistActivity; \
        settings put secure voice_interaction_service org.osmosis.bender/.BenderAssistActivity; \
        log -t lethe-bender 'Registered as default assist app'"

    # Post persistent notification for quick access
    exec -- /system/bin/sh -c "\
        am startservice -n org.osmosis.bender/.BenderNotificationService 2>/dev/null; \
        log -t lethe-bender 'Persistent notification active'"
INITRC
        echo "  -> Init service installed (backend + assist + notification)."
    fi
    echo "  -> Bender installed as native system component."
else
    echo "  -> WARNING: Bender source not found at $BENDER_SOURCE, skipping."
    echo "     Set BENDER_DIR to override or place bender/ alongside OSmosis."
fi

# ── 11. Build fingerprint ──
echo "[11/13] Setting Lethe build fingerprint..."
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

# ── 12. Summary ──
echo "[12/13] Overlay summary..."
echo "  Overlays installed:"
for f in "$OVERLAY_DIR"/*; do
    [ -f "$f" ] && echo "    - $(basename "$f")"
done

echo ""
echo "=== Lethe overlays applied successfully ==="
