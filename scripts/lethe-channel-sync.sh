#!/system/bin/sh
# LETHE — Multi-channel IPNS subscription sync.
#
# Resolves subscribed IPNS channels, verifies signatures, and applies
# updates to the corresponding system files. Runs alongside the OTA
# updater but handles non-OTA content: hosts file, firewall rules,
# security advisories, and model registry.
#
# Called by init.lethe-ipfs.rc every 6 hours (same schedule as OTA).
# Each channel is defined in /persist/lethe/channels/*.json

set -eu

TAG="lethe-channels"
log() { /system/bin/log -t "$TAG" "$1"; }

CHANNELS_DIR="/persist/lethe/channels"
TRUST_PUBKEY="/system/etc/lethe/update-pubkey.pem"
IPFS_PATH="/data/lethe/ipfs"
CACHE_DIR="/data/lethe/channels"
export IPFS_PATH

# ── Sanity ──
if [ ! -d "$CHANNELS_DIR" ]; then
    log "No channels configured — nothing to sync"
    exit 0
fi

mkdir -p "$CACHE_DIR"

# ── IPFS availability ──
USE_IPFS=false
if command -v ipfs >/dev/null 2>&1; then
    if ipfs swarm peers >/dev/null 2>&1; then
        USE_IPFS=true
    fi
fi

if [ "$USE_IPFS" = "false" ]; then
    log "IPFS not available — skipping channel sync"
    exit 0
fi

# ── Process each channel ──
SYNCED=0
FAILED=0

for channel_file in "$CHANNELS_DIR"/*.json; do
    [ -f "$channel_file" ] || continue

    CHANNEL_NAME=$(basename "$channel_file" .json)
    log "Syncing channel: $CHANNEL_NAME"

    # Parse channel config (grep-friendly flat JSON)
    cfg_field() {
        grep "\"$1\"" "$channel_file" 2>/dev/null | \
            head -1 | sed 's/.*: *"\([^"]*\)".*/\1/'
    }

    IPNS_NAME=$(cfg_field ipns_name)
    CHANNEL_TYPE=$(cfg_field type)
    TARGET_PATH=$(cfg_field target_path)
    VERIFY_KEY=$(cfg_field verify_key)

    if [ -z "$IPNS_NAME" ]; then
        log "WARN: $CHANNEL_NAME has no ipns_name — skipping"
        FAILED=$((FAILED + 1))
        continue
    fi

    # Use channel-specific verify key if provided, else default
    PUBKEY="$TRUST_PUBKEY"
    if [ -n "$VERIFY_KEY" ] && [ -f "$VERIFY_KEY" ]; then
        PUBKEY="$VERIFY_KEY"
    fi

    # ── Resolve IPNS ──
    CID=$(ipfs name resolve "$IPNS_NAME" 2>/dev/null)
    if [ -z "$CID" ]; then
        log "WARN: failed to resolve IPNS for $CHANNEL_NAME"
        FAILED=$((FAILED + 1))
        continue
    fi
    log "  IPNS resolved: $CID"

    # ── Check if CID changed since last sync ──
    LAST_CID_FILE="$CACHE_DIR/${CHANNEL_NAME}.last_cid"
    LAST_CID=""
    if [ -f "$LAST_CID_FILE" ]; then
        LAST_CID=$(cat "$LAST_CID_FILE")
    fi

    if [ "$CID" = "$LAST_CID" ]; then
        log "  No change since last sync — skipping"
        continue
    fi

    # ── Fetch content ──
    CONTENT_FILE="$CACHE_DIR/${CHANNEL_NAME}.content"
    SIG_FILE="$CACHE_DIR/${CHANNEL_NAME}.sig"

    ipfs cat "${CID}/content" > "$CONTENT_FILE" 2>/dev/null || true
    ipfs cat "${CID}/content.sig" > "$SIG_FILE" 2>/dev/null || true

    if [ ! -s "$CONTENT_FILE" ]; then
        log "WARN: empty content for $CHANNEL_NAME"
        FAILED=$((FAILED + 1))
        continue
    fi

    # ── Verify signature ──
    if [ -s "$SIG_FILE" ]; then
        base64 -d "$SIG_FILE" > "$CACHE_DIR/${CHANNEL_NAME}.sig.raw" 2>/dev/null
        if ! openssl pkeyutl -verify \
            -pubin -inkey "$PUBKEY" \
            -sigfile "$CACHE_DIR/${CHANNEL_NAME}.sig.raw" \
            -in "$CONTENT_FILE" \
            -rawin 2>/dev/null; then
            log "ERROR: signature verification FAILED for $CHANNEL_NAME — rejecting"
            rm -f "$CONTENT_FILE" "$SIG_FILE"
            FAILED=$((FAILED + 1))
            continue
        fi
        log "  Signature verified OK"
    else
        log "WARN: no signature for $CHANNEL_NAME — skipping (unsigned channels not allowed)"
        rm -f "$CONTENT_FILE"
        FAILED=$((FAILED + 1))
        continue
    fi

    # ── Apply based on channel type ──
    case "$CHANNEL_TYPE" in
        hosts)
            if [ -n "$TARGET_PATH" ]; then
                cp "$CONTENT_FILE" "$TARGET_PATH"
                chmod 644 "$TARGET_PATH"
                log "  Applied hosts file to $TARGET_PATH"
            fi
            ;;
        firewall)
            if [ -n "$TARGET_PATH" ]; then
                cp "$CONTENT_FILE" "$TARGET_PATH"
                chmod 600 "$TARGET_PATH"
                # Reload nftables if available
                nft -f "$TARGET_PATH" 2>/dev/null && \
                    log "  Firewall rules reloaded" || \
                    log "  WARN: nft reload failed"
            fi
            ;;
        advisory)
            # Security advisories are stored for the agent to read
            mkdir -p "/data/lethe/advisories"
            cp "$CONTENT_FILE" "/data/lethe/advisories/${CHANNEL_NAME}.json"
            chmod 644 "/data/lethe/advisories/${CHANNEL_NAME}.json"
            # Notify the agent
            am broadcast -a lethe.intent.SECURITY_ADVISORY \
                --es channel "$CHANNEL_NAME" \
                --es cid "$CID" 2>/dev/null
            log "  Security advisory stored"
            ;;
        models)
            # Model registry is stored for the agent to read
            mkdir -p "/data/lethe/models"
            cp "$CONTENT_FILE" "/data/lethe/models/registry.json"
            chmod 644 "/data/lethe/models/registry.json"
            log "  Model registry updated"
            ;;
        *)
            log "WARN: unknown channel type '$CHANNEL_TYPE' for $CHANNEL_NAME"
            FAILED=$((FAILED + 1))
            continue
            ;;
    esac

    # ── Record successful sync ──
    echo "$CID" > "$LAST_CID_FILE"
    SYNCED=$((SYNCED + 1))
done

log "Channel sync complete: $SYNCED synced, $FAILED failed"
