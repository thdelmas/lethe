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

# ── 8. Bender (voice-first AI companion) ──
echo "[8/11] Installing Bender..."
BENDER_SOURCE="${BENDER_DIR:-$SCRIPT_DIR/../../bender}"
if [ -d "$BENDER_SOURCE" ]; then
    BENDER_TARGET="system/extras/lethe/bender"
    mkdir -p "$BENDER_TARGET"
    # Copy Bender server, templates, and static assets into the system image.
    # At runtime, an init service starts Bender on localhost:8080.
    cp "$BENDER_SOURCE/app.py" "$BENDER_TARGET/"
    cp "$BENDER_SOURCE/requirements.txt" "$BENDER_TARGET/"
    cp -r "$BENDER_SOURCE/server" "$BENDER_TARGET/"
    cp -r "$BENDER_SOURCE/templates" "$BENDER_TARGET/"
    cp -r "$BENDER_SOURCE/static" "$BENDER_TARGET/"

    # Install Bender init service — starts on boot, listens on localhost only.
    INIT_DIR="system/core/rootdir"
    if [ -d "$INIT_DIR" ]; then
        cat > "$INIT_DIR/init.lethe-bender.rc" <<'INITRC'
# Lethe — Bender voice-first AI companion
# Starts after boot as a background service on localhost:8080.
# No network exposure — only reachable from the device itself.

service lethe-bender /system/bin/sh -c "\
    cd /system/extras/lethe/bender && \
    python3 app.py --host 127.0.0.1 --port 8080"
    class late_start
    user system
    group system inet
    disabled
    oneshot

on property:sys.boot_completed=1
    start lethe-bender
INITRC
        echo "  -> Bender init service installed."
    fi
    echo "  -> Bender installed."
else
    echo "  -> WARNING: Bender source not found at $BENDER_SOURCE, skipping."
    echo "     Set BENDER_DIR to override or place bender/ alongside OSmosis."
fi

# ── 9. Build fingerprint ──
echo "[9/11] Setting Lethe build fingerprint..."
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

# ── 10. Summary ──
echo "[10/11] Overlay summary..."
echo "  Overlays installed:"
for f in "$OVERLAY_DIR"/*; do
    [ -f "$f" ] && echo "    - $(basename "$f")"
done

echo ""
echo "=== Lethe overlays applied successfully ==="
