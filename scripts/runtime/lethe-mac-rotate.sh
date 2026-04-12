#!/system/bin/sh
# Lethe MAC address rotation — randomize on each boot if burner mode is on.
# Installed to /system/bin/ at build time.

ENABLED=$(getprop persist.lethe.burner.enabled)
if [ "$ENABLED" != "true" ]; then
    log -t lethe-burner "MAC rotation skipped — burner mode disabled"
    exit 0
fi

# Generate random locally-administered MAC from kernel UUID
RAW=$(cat /proc/sys/kernel/random/uuid | sed 's/-//g' | cut -c1-12)
MAC=$(echo "02${RAW#??}" | sed 's/\(..\)/\1:/g;s/:$//')

ip link set wlan0 down 2>/dev/null
ip link set wlan0 address "$MAC" 2>/dev/null
ip link set wlan0 up 2>/dev/null

log -t lethe-burner "MAC rotated to $MAC"
