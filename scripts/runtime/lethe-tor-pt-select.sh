#!/system/bin/sh
# lethe-tor-pt-select — pick the Tor pluggable transport at boot.
#
# Reads persist.lethe.tor.bridge_pt (one of: none|obfs4|meek|webtunnel|snowflake)
# and rewrites /data/lethe/tor/torrc.bridges with the matching
# ClientTransportPlugin + UseBridges directives. The Tor service includes
# this file via `%include /data/lethe/tor/torrc.bridges` in its main torrc.
#
# Default is "none" — direct connection. Users behind a censored network
# choose obfs4 (default fallback) or meek/webtunnel/snowflake when obfs4
# is also blocked. lethe#108. Selection lives under /data so it survives
# burner wipes only if user_data persists; on a fresh boot the
# persist.lethe.tor.bridge_pt prop is read from /persist.

set -e

PT="$(getprop persist.lethe.tor.bridge_pt)"
BRIDGES_FILE="/data/lethe/tor/torrc.bridges"
BRIDGES_DIR="/data/lethe/tor"

mkdir -p "$BRIDGES_DIR"
# DataDirectory ownership: init.lethe-tor.rc runs Tor as `user root` in
# v1.0/v1.1, so the dir stays root-owned. The manifest's tor_uid: 9050
# spec is aspirational — when Tor is moved to drop privileges (v1.2),
# re-add the chown here AND change init.rc to `user lethe-tor` and grant
# setuid/setgid in tor.te. Until then, chowning to 9050:9050 makes Tor
# (as root) misalign with DataDirectory ownership and exit at startup.

case "$PT" in
    obfs4)
        cat > "$BRIDGES_FILE" <<'EOF'
UseBridges 1
ClientTransportPlugin obfs4 exec /system/bin/obfs4proxy
# Add bridge lines via:
#   echo "Bridge obfs4 ..." >> /data/lethe/tor/torrc.bridges
EOF
        log -t lethe-tor "PT: obfs4 enabled"
        ;;
    meek)
        cat > "$BRIDGES_FILE" <<'EOF'
UseBridges 1
ClientTransportPlugin meek_lite exec /system/bin/obfs4proxy
Bridge meek_lite 192.0.2.18:80 url=https://meek.azureedge.net/ front=ajax.aspnetcdn.com
EOF
        log -t lethe-tor "PT: meek-azure enabled"
        ;;
    webtunnel)
        cat > "$BRIDGES_FILE" <<'EOF'
UseBridges 1
ClientTransportPlugin webtunnel exec /system/bin/webtunnel-client
# webtunnel bridges are user-supplied — see https://bridges.torproject.org/options
EOF
        log -t lethe-tor "PT: webtunnel enabled (user must supply bridge lines)"
        ;;
    snowflake)
        cat > "$BRIDGES_FILE" <<'EOF'
UseBridges 1
ClientTransportPlugin snowflake exec /system/bin/snowflake-client \
    -url https://snowflake-broker.torproject.net.global.prod.fastly.net/ \
    -front cdn.sstatic.net \
    -ice stun:stun.l.google.com:19302,stun:stun.altar.com.pl:3478
Bridge snowflake 192.0.2.3:80
EOF
        log -t lethe-tor "PT: snowflake enabled"
        ;;
    none|"")
        : > "$BRIDGES_FILE"
        log -t lethe-tor "PT: direct connection (no bridge)"
        ;;
    *)
        : > "$BRIDGES_FILE"
        log -t lethe-tor "PT: unknown value '$PT' — defaulting to direct"
        ;;
esac

chmod 600 "$BRIDGES_FILE"
# Ownership left as the init.rc-created root:root — see DataDirectory
# note above. Re-introduce chown 9050:9050 when Tor drops privileges.
