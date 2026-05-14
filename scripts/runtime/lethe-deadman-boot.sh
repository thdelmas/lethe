#!/system/bin/sh
# Lethe dead man's switch — boot-time enforcement.
# Checks elapsed time since last check-in. Escalates: lock → wipe → brick.
# Installed to /system/bin/ at build time.

ENABLED=$(getprop persist.lethe.deadman.enabled)
if [ "$ENABLED" != "true" ]; then
    log -t lethe-deadman "Dead man switch disabled — skipping"
    exit 0
fi

# Parse interval
INTERVAL_RAW=$(getprop persist.lethe.deadman.interval)
INTERVAL_RAW=${INTERVAL_RAW:-24h}
case "$INTERVAL_RAW" in
    12h) INTERVAL=43200 ;;
    24h) INTERVAL=86400 ;;
    48h) INTERVAL=172800 ;;
    72h) INTERVAL=259200 ;;
    7d)  INTERVAL=604800 ;;
    *)   INTERVAL=86400 ;;
esac

GRACE_S=14400
DEADLINE=$((INTERVAL + GRACE_S))

HEARTBEAT_DIR=/data/lethe/deadman
HEARTBEAT_FILE=$HEARTBEAT_DIR/last_checkin

# First boot: write initial check-in
if [ ! -f "$HEARTBEAT_FILE" ]; then
    log -t lethe-deadman "No heartbeat — first boot, writing initial checkin"
    mkdir -p "$HEARTBEAT_DIR"
    date +%s > "$HEARTBEAT_FILE"
    exit 0
fi

LAST_CHECKIN=$(cat "$HEARTBEAT_FILE" 2>/dev/null)
NOW=$(date +%s)
ELAPSED=$((NOW - LAST_CHECKIN))

log -t lethe-deadman "Elapsed: ${ELAPSED}s, deadline: ${DEADLINE}s"

if [ $ELAPSED -le $DEADLINE ]; then
    log -t lethe-deadman "OK — $((DEADLINE - ELAPSED))s remaining"
    exit 0
fi

# Stage 1: Lock
log -t lethe-deadman "DEADLINE EXCEEDED — locking"
setprop persist.lethe.deadman.stage locked

# Stage 2: Wipe (1 hour past deadline)
WIPE_DEADLINE=$((DEADLINE + 3600))
if [ $ELAPSED -gt $WIPE_DEADLINE ]; then
    log -t lethe-deadman "Stage 2: WIPING"
    setprop persist.lethe.deadman.stage wiped
    rm -rf /data/app /data/data /data/user /data/user_de
    rm -rf /data/misc/wifi /data/misc/bluedroid
    rm -rf /data/media/0/*

    # Stage 3: Brick (3 hours past deadline, opt-in only).
    # Prop name kept <=31 chars so it fits Android 7.1's PROP_NAME_MAX
    # (32 bytes incl. null) — the prior persist.lethe.deadman.stage3.enabled
    # was 36 chars, so __system_property_set silently dropped the overlay
    # default and this read always returned "" → Stage 3 was effectively
    # OFF on every cm-14.1 shipped build. See lethe#154.
    STAGE3_ENABLED=$(getprop persist.lethe.deadman.stage3)
    BRICK_DEADLINE=$((WIPE_DEADLINE + 7200))
    if [ "$STAGE3_ENABLED" = "true" ] && [ $ELAPSED -gt $BRICK_DEADLINE ]; then
        log -t lethe-deadman "Stage 3: BRICKING"
        dd if=/dev/urandom of=/dev/block/bootdevice/by-name/boot bs=4096 count=1024 2>/dev/null
        dd if=/dev/urandom of=/dev/block/bootdevice/by-name/recovery bs=4096 count=1024 2>/dev/null
        rm -rf /data/lethe
        reboot
    fi
fi
