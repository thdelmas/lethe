#!/system/bin/sh
# LETHE — Initialize default channel subscriptions on first boot.
# Creates channel config files in /persist/lethe/channels/ if they
# don't already exist. Only runs once (checks for sentinel file).

set -eu

CHANNELS_DIR="/persist/lethe/channels"
SENTINEL="$CHANNELS_DIR/.initialized"

if [ -f "$SENTINEL" ]; then
    exit 0
fi

mkdir -p "$CHANNELS_DIR"

# Default hosts file channel (tracker/ad blocking)
cat > "$CHANNELS_DIR/hosts.json" <<'HOSTS'
{
  "name": "hosts",
  "type": "hosts",
  "description": "Tracker and ad blocking hosts file",
  "ipns_name": "",
  "target_path": "/system/etc/hosts",
  "verify_key": "/system/etc/lethe/update-pubkey.pem",
  "enabled": false
}
HOSTS

# Security advisories channel
cat > "$CHANNELS_DIR/advisories.json" <<'ADV'
{
  "name": "advisories",
  "type": "advisory",
  "description": "Security advisories for LETHE devices",
  "ipns_name": "",
  "target_path": "",
  "verify_key": "/system/etc/lethe/update-pubkey.pem",
  "enabled": false
}
ADV

# Model registry channel
cat > "$CHANNELS_DIR/models.json" <<'MODELS'
{
  "name": "models",
  "type": "models",
  "description": "Available GGUF models for local inference",
  "ipns_name": "",
  "target_path": "",
  "verify_key": "/system/etc/lethe/update-pubkey.pem",
  "enabled": false
}
MODELS

touch "$SENTINEL"
