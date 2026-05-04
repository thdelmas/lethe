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

# Wipe user data — installed apps, app databases, both CE and DE storage.
# Browser profiles (Mull, Fennec, WebView, Chrome) live under /data/data and
# /data/user, so this covers their cookies, localStorage, history, and form
# autofill caches. lethe#111 enumerates the explicit additional paths below
# for cases where data escapes the standard sandbox.
#
# IMPORTANT — preserve the parent directories. Removing /data/data, /data/user/0,
# /data/user_de/0, /data/app wholesale leaves installd unable to recreate the
# per-package subdirs at next boot, and system_server crash-loops zygote on
# cm-14.1 because PackageManagerService can't initialize without those
# parents existing. Wipe contents only.
for d in /data/app /data/data /data/user/0 /data/user_de/0; do
    [ -d "$d" ] && find "$d" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
done
rm -rf /data/misc/wifi/wpa_supplicant.conf
rm -rf /data/misc/bluedroid
rm -rf /data/media/0/*
rm -rf /data/system/notification_log

# Browser/WebView caches and autofill that live OUTSIDE /data/data (lethe#111).
# WebView system instance, ART/PGO usage profiles, system-level autofill,
# Android accounts DB, credential store, and the system cache partition. Each
# of these has been observed to retain browsing-derived state past a
# /data/data wipe on at least one Android version.
rm -rf /data/misc/profiles/cur/0
rm -rf /data/misc/profiles/ref/0
rm -f  /data/system/users/0/accounts.db
rm -f  /data/system/users/0/accounts.db-journal
rm -rf /data/system/users/0/autofill
rm -rf /data/system/users/0/credentials
rm -rf /data/system/users/0/recent_tasks
rm -rf /data/system_ce/0/recent_tasks
rm -rf /data/system_ce/0/snapshots
rm -rf /data/local/tmp/*
rm -rf /data/cache/*
rm -rf /data/dalvik-cache/profiles
rm -rf /data/system/dropbox

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
