#!/system/bin/sh
# Lethe burner mode — wipe user data on boot if enabled.
# Installed to /system/bin/ at build time.
set -e

ENABLED=$(getprop persist.lethe.burner.enabled)
log -t lethe-burner "Burner check: enabled=$ENABLED"

if [ "$ENABLED" != "true" ]; then
    log -t lethe-burner "Burner mode disabled — normal boot"
    exit 0
fi

log -t lethe-burner "Burner mode active — wiping user data"

# Preserve LETHE agent config (API keys) across wipe
LETHE_CFG=/data/data/org.osmosis.lethe.agent/files/config.json
LETHE_BAK=/data/local/tmp/lethe-config-bak.json
[ -f "$LETHE_CFG" ] && cp "$LETHE_CFG" "$LETHE_BAK"

# Wipe user data
rm -rf /data/app /data/data /data/user /data/user_de
rm -rf /data/misc/wifi/wpa_supplicant.conf
rm -rf /data/misc/bluedroid
rm -rf /data/media/0/*
rm -rf /data/system/notification_log

# Restore agent config after wipe
if [ -f "$LETHE_BAK" ]; then
    mkdir -p /data/data/org.osmosis.lethe.agent/files
    cp "$LETHE_BAK" "$LETHE_CFG"
    rm "$LETHE_BAK"
    log -t lethe-burner "Agent config restored"
fi

# Rotate Android ID (uses kernel UUID — works on all Android versions)
NEWID=$(cat /proc/sys/kernel/random/uuid | sed 's/-//g' | cut -c1-16)
settings put secure android_id "$NEWID"

log -t lethe-burner "Wipe complete — Android ID rotated to $NEWID"
