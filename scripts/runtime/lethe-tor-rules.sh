#!/system/bin/sh
# Lethe — apply Tor transparent proxy iptables rules.
# Called after Tor bootstraps. Installed to /system/bin/ at build time.

log -t lethe-tor "Applying transparent proxy rules..."

# Phase 1: Block all user app traffic immediately (no leak window)
iptables -A OUTPUT -m owner --uid-owner 10000-99999 -j DROP
log -t lethe-tor "User app traffic blocked (pre-Tor)"

# Wait for Tor to bootstrap
sleep 10

# Phase 2: Replace blanket DROP with Tor redirect
iptables -D OUTPUT -m owner --uid-owner 10000-99999 -j DROP

# DNS → Tor DNS port
iptables -t nat -A OUTPUT -m owner --uid-owner 10000-99999 -p udp --dport 53 \
    -j REDIRECT --to-ports 5400
iptables -t nat -A OUTPUT -m owner --uid-owner 10000-99999 -p tcp --dport 53 \
    -j REDIRECT --to-ports 5400

# All TCP → Tor TransPort
iptables -t nat -A OUTPUT -m owner --uid-owner 10000-99999 -p tcp \
    -j REDIRECT --to-ports 9040

# Drop non-DNS UDP (Tor is TCP only)
iptables -A OUTPUT -m owner --uid-owner 10000-99999 -p udp ! --dport 53 -j DROP

# Allow Tor daemon direct access
iptables -A OUTPUT -m owner --uid-owner 0 -j ACCEPT

# Allow IPFS daemon loopback only (routes through Tor SOCKS)
iptables -A OUTPUT -m owner --uid-owner 9051 -o lo -j ACCEPT
iptables -A OUTPUT -m owner --uid-owner 9051 -j DROP

log -t lethe-tor "Transparent proxy rules applied"
