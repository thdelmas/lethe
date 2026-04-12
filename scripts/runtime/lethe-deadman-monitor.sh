#!/system/bin/sh
# Lethe dead man's switch — runtime check-in monitor.
# Runs in background, checks every 15 minutes if check-in is due.
# Installed to /system/bin/ at build time.

while true; do
    ENABLED=$(getprop persist.lethe.deadman.enabled)
    if [ "$ENABLED" != "true" ]; then
        sleep 3600
        continue
    fi

    HEARTBEAT_FILE=/data/lethe/deadman/last_checkin
    LAST=$(cat "$HEARTBEAT_FILE" 2>/dev/null || echo 0)
    NOW=$(date +%s)
    ELAPSED=$((NOW - LAST))

    case "$(getprop persist.lethe.deadman.interval)" in
        12h) I=43200;; 24h) I=86400;; 48h) I=172800;;
        72h) I=259200;; 7d) I=604800;; *) I=86400;;
    esac

    if [ $ELAPSED -ge $I ]; then
        log -t lethe-deadman "Check-in due"
        am broadcast -a lethe.intent.CHECKIN_DUE --ez overdue true 2>/dev/null
    fi

    sleep 900
done
