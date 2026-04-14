#!/system/bin/sh
# LETHE — Device cluster (EdgeVPN) wrapper.
# Starts the edgevpn daemon with the cluster token and battery-aware
# heartbeat tuning.
#
# Reads config from /system/extras/lethe/edgevpn.conf
# Cluster token stored encrypted in /persist/lethe/cluster/token

set -eu

TAG="lethe-cluster"
log() { /system/bin/log -t "$TAG" "$1"; }

CONF="/system/extras/lethe/edgevpn.conf"
if [ ! -f "$CONF" ]; then
    log "ERROR: config not found at $CONF"
    exit 1
fi

cfg() { grep "^$1=" "$CONF" 2>/dev/null | cut -d= -f2-; }

ENABLED=$(getprop persist.lethe.cluster.enabled)
if [ "$ENABLED" != "true" ]; then
    log "Cluster disabled — exiting"
    exit 0
fi

TOKEN_PATH=$(cfg persist.lethe.cluster.token_path)
TOKEN_PATH=${TOKEN_PATH:-/persist/lethe/cluster/token}

if [ ! -f "$TOKEN_PATH" ]; then
    log "ERROR: no cluster token at $TOKEN_PATH"
    log "       Generate one with 'edgevpn api --generate' or import from another device"
    exit 1
fi

IFACE=$(cfg persist.lethe.cluster.iface)
IFACE=${IFACE:-lethe0}

SUBNET=$(cfg persist.lethe.cluster.subnet)
SUBNET=${SUBNET:-10.42.0.0/16}

# ── Battery-aware heartbeat ──
BATTERY_LEVEL=$(cat /sys/class/power_supply/battery/capacity 2>/dev/null || echo 100)
CHARGING=$(cat /sys/class/power_supply/battery/status 2>/dev/null || echo Unknown)

MIN_BATTERY=$(cfg persist.lethe.cluster.min_battery)
MIN_BATTERY=${MIN_BATTERY:-20}

if [ "$BATTERY_LEVEL" -lt "$MIN_BATTERY" ] && [ "$CHARGING" != "Charging" ]; then
    log "Battery below ${MIN_BATTERY}% and not charging — skipping cluster start"
    exit 0
fi

if [ "$CHARGING" = "Charging" ] || [ "$CHARGING" = "Full" ]; then
    HEARTBEAT=$(cfg persist.lethe.cluster.heartbeat_charging)
    HEARTBEAT=${HEARTBEAT:-30}
else
    HEARTBEAT=$(cfg persist.lethe.cluster.heartbeat_battery)
    HEARTBEAT=${HEARTBEAT:-300}
fi

log "Starting cluster: iface=$IFACE subnet=$SUBNET heartbeat=${HEARTBEAT}s"

# ── Launch edgevpn ──
# Reads token from file, creates tun interface, joins cluster mesh
exec /system/extras/lethe/bin/edgevpn \
    --token-file "$TOKEN_PATH" \
    --interface "$IFACE" \
    --address "$(awk -F/ '{print $1}' <<< "$SUBNET")" \
    --discovery-interval "$HEARTBEAT" \
    2>&1 | log -t lethe-cluster
