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

# Wiping settings provider DBs forces Android to regenerate a fresh
# Settings.Secure.ANDROID_ID on next boot. We deliberately do NOT call
# `settings put secure android_id` here — that command talks to the
# settings ContentProvider in system_server, which is not running during
# post-fs-data, so the call would deadlock and prevent boot.
rm -f /data/system/users/0/settings_secure.xml
rm -f /data/system/users/0/settings_ssaid.xml

# Restore agent config after wipe
if [ -f "$LETHE_BAK" ]; then
    mkdir -p /data/data/org.osmosis.lethe.agent/files
    cp "$LETHE_BAK" "$LETHE_CFG"
    rm "$LETHE_BAK"
    log -t lethe-burner "Agent config restored"
fi

log -t lethe-burner "Wipe complete — settings DB cleared so Android ID regenerates"
