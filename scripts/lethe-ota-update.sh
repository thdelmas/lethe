#!/system/bin/sh
# shellcheck shell=bash
# (cm-14.1+ /system/bin/sh is mksh, which accepts `local` and other
#  ksh-isms shellcheck flags as POSIX-incompatible. shell=bash silences
#  the spurious SC3043/SC3011 warnings.)
# Lethe OTA updater — fetches, verifies, and applies updates via IPFS.
#
# Called by the lethe-ota-check init service every 6 hours.
# All IPFS traffic goes through Tor (SOCKS5 proxy on 127.0.0.1:9050).
#
# Flow:
#   1. Resolve IPNS channel → signed manifest
#   2. Verify Ed25519 signature (openssl)
#   3. Filter by device codename
#   4. Download OTA ZIP via IPFS
#   5. SHA256 verification
#   6. Apply based on update_policy (download / prompt / auto)

set -eu

TAG="lethe-ota"
log() { /system/bin/log -t "$TAG" "$1"; }

# ── Load config ──
CONF="/system/etc/lethe/ipfs-ota.conf"
if [ ! -f "$CONF" ]; then
    log "ERROR: config not found at $CONF"
    exit 1
fi

cfg() { grep "^$1=" "$CONF" 2>/dev/null | cut -d= -f2- | tr -d ' '; }

IPNS_CHANNEL=$(cfg ipns_channel)
TRUST_PUBKEY=$(cfg trust_pubkey_file)
IPFS_PATH=$(cfg ipfs_repo)
UPDATE_POLICY=$(cfg update_policy)
SECURITY_PATCH_POLICY=$(cfg security_patch_policy)
HTTP_MIRRORS=$(cfg http_mirrors)
HTTP_PROXY=$(cfg http_proxy)
OTA_DIR="/data/lethe/ota"

export IPFS_PATH

# ── Sanity checks ──
if [ ! -f "$TRUST_PUBKEY" ]; then
    log "ERROR: trust pubkey not found at $TRUST_PUBKEY"
    exit 1
fi

# ── Transport selection ──
# Try IPFS first. If the daemon isn't reachable, fall back to HTTP mirrors.
USE_IPFS=false
if command -v ipfs >/dev/null 2>&1; then
    if ipfs swarm peers >/dev/null 2>&1; then
        USE_IPFS=true
        log "Transport: IPFS (daemon running)"
    else
        log "WARN: IPFS binary found but daemon not reachable"
    fi
else
    log "WARN: IPFS binary not installed"
fi

if [ "$USE_IPFS" = "false" ]; then
    if [ -n "$HTTP_MIRRORS" ]; then
        log "Transport: HTTP fallback via mirrors"
    else
        log "ERROR: no IPFS and no HTTP mirrors configured"
        exit 1
    fi
fi

# ── HTTP helper ──
# Downloads a URL via Tor SOCKS proxy. Returns content on stdout.
http_fetch() {
    local url="$1"
    local proxy_flag=""
    if [ -n "$HTTP_PROXY" ]; then
        proxy_flag="--proxy $HTTP_PROXY"
    fi
    # shellcheck disable=SC2086  # $proxy_flag must word-split when set
    curl -sfL --max-time 60 $proxy_flag "$url" 2>/dev/null
}

# ── Device identity ──
DEVICE_CODENAME=$(getprop ro.product.device 2>/dev/null)
if [ -z "$DEVICE_CODENAME" ]; then
    DEVICE_CODENAME=$(getprop ro.build.product 2>/dev/null)
fi
if [ -z "$DEVICE_CODENAME" ]; then
    log "ERROR: cannot determine device codename"
    exit 1
fi
log "Device: $DEVICE_CODENAME"

# ── Current version ──
CURRENT_VERSION=$(getprop ro.lethe.version 2>/dev/null)
CURRENT_SECURITY_PATCH=$(getprop ro.build.version.security_patch 2>/dev/null)
log "Current version: ${CURRENT_VERSION:-unknown}, security patch: ${CURRENT_SECURITY_PATCH:-unknown}"

# ── Step 1+2: Fetch manifest + signature ──
MANIFEST_RAW=""
SIGNATURE_RAW=""

if [ "$USE_IPFS" = "true" ]; then
    # Try IPFS: resolve IPNS channel, then fetch manifest
    log "Resolving IPNS channel: $IPNS_CHANNEL"
    CID=$(ipfs name resolve "$IPNS_CHANNEL" 2>/dev/null)
    if [ -n "$CID" ]; then
        log "IPNS resolved to: $CID"
        MANIFEST_RAW=$(ipfs cat "$CID/manifest.json" 2>/dev/null)
        SIGNATURE_RAW=$(ipfs cat "$CID/manifest.json.sig" 2>/dev/null)
    else
        log "WARN: IPNS resolution failed, trying HTTP fallback..."
    fi
fi

# HTTP fallback if IPFS didn't produce a manifest
if [ -z "$MANIFEST_RAW" ] && [ -n "$HTTP_MIRRORS" ]; then
    # Try each mirror (comma-separated list)
    OLD_IFS="$IFS"; IFS=","
    for mirror in $HTTP_MIRRORS; do
        mirror=$(echo "$mirror" | tr -d ' ')
        log "Trying HTTP mirror: $mirror"
        MANIFEST_RAW=$(http_fetch "$mirror/manifest.json")
        if [ -n "$MANIFEST_RAW" ]; then
            SIGNATURE_RAW=$(http_fetch "$mirror/manifest.json.sig")
            ACTIVE_MIRROR="$mirror"
            log "Manifest fetched from $mirror"
            break
        fi
        log "WARN: mirror $mirror unreachable"
    done
    IFS="$OLD_IFS"
fi

if [ -z "$MANIFEST_RAW" ]; then
    log "ERROR: failed to fetch manifest from any source"
    exit 1
fi

if [ -z "$SIGNATURE_RAW" ]; then
    log "ERROR: no detached signature found for manifest"
    exit 1
fi

# ── Step 3: Verify Ed25519 signature ──
log "Verifying manifest signature..."
mkdir -p "$OTA_DIR/tmp"
echo "$MANIFEST_RAW" > "$OTA_DIR/tmp/manifest.json"
echo "$SIGNATURE_RAW" | base64 -d > "$OTA_DIR/tmp/manifest.sig" 2>/dev/null

if ! openssl pkeyutl -verify \
    -pubin -inkey "$TRUST_PUBKEY" \
    -sigfile "$OTA_DIR/tmp/manifest.sig" \
    -in "$OTA_DIR/tmp/manifest.json" \
    -rawin 2>/dev/null; then
    log "ERROR: manifest signature verification FAILED — rejecting update"
    rm -rf "$OTA_DIR/tmp"
    exit 1
fi
log "Signature verified OK"

# ── Step 4: Parse manifest and filter by device ──
# Manifest JSON structure:
# {
#   "version": 2,
#   "timestamp": "...",
#   "builds": {
#     "codename": {
#       "cid": "Qm...",
#       "filename": "Lethe-1.0.0-codename.zip",
#       "size": 123456,
#       "sha256": "abc...",
#       "lethe_version": "1.0.0",
#       "security_patch": "2026-03-05",
#       "is_security_patch": false
#     }
#   }
# }
#
# We use grep/sed for JSON parsing since jq isn't available on most Android.
# The server guarantees one build entry per line for grep-friendly parsing.

# Check if our device has a build in the manifest.
# The server outputs each build key on its own line: "codename": {
if ! echo "$MANIFEST_RAW" | grep -q "\"$DEVICE_CODENAME\""; then
    log "No update available for $DEVICE_CODENAME"
    rm -rf "$OTA_DIR/tmp"
    exit 0
fi

# Extract our device's build block (grep-friendly flat JSON from server).
# Fields are on individual lines within the device block.
extract_field() {
    echo "$MANIFEST_RAW" | grep -A 20 "\"$DEVICE_CODENAME\"" | \
        grep "\"$1\"" | head -1 | sed 's/.*: *"\{0,1\}\([^",}]*\)"\{0,1\}.*/\1/'
}

BUILD_CID=$(extract_field cid)
BUILD_FILENAME=$(extract_field filename)
BUILD_SHA256=$(extract_field sha256)
BUILD_VERSION=$(extract_field lethe_version)
BUILD_SECURITY_PATCH=$(extract_field security_patch)
IS_SECURITY_PATCH=$(extract_field is_security_patch)

if [ -z "$BUILD_CID" ] || [ -z "$BUILD_SHA256" ]; then
    log "ERROR: incomplete build entry for $DEVICE_CODENAME"
    rm -rf "$OTA_DIR/tmp"
    exit 1
fi

log "Available: $BUILD_FILENAME (v$BUILD_VERSION, patch $BUILD_SECURITY_PATCH)"

# ── Helper functions (defined before first use) ──
write_pending_metadata() {
    cat > "$OTA_DIR/pending-update.json" <<META
{
  "cid": "$BUILD_CID",
  "filename": "$BUILD_FILENAME",
  "filepath": "$PENDING_FILE",
  "sha256": "$BUILD_SHA256",
  "version": "$BUILD_VERSION",
  "security_patch": "$BUILD_SECURITY_PATCH",
  "is_security_patch": $IS_SECURITY_PATCH,
  "codename": "$DEVICE_CODENAME",
  "policy": "$EFFECTIVE_POLICY",
  "fetched_at": "$(date -Iseconds 2>/dev/null || date +%s)"
}
META
}

notify_update() {
    am broadcast \
        -a lethe.intent.OTA_AVAILABLE \
        --es cid "$BUILD_CID" \
        --es version "$BUILD_VERSION" \
        --es filename "$BUILD_FILENAME" \
        --es policy "$EFFECTIVE_POLICY" \
        --ez is_security_patch "$IS_SECURITY_PATCH" \
        2>/dev/null
}

# ── Step 5: Check if we already have this version ──
if [ "$BUILD_VERSION" = "$CURRENT_VERSION" ]; then
    log "Already on $BUILD_VERSION — no update needed"
    rm -rf "$OTA_DIR/tmp"
    exit 0
fi

# Check if this update was already downloaded
PENDING_FILE="$OTA_DIR/$BUILD_FILENAME"
if [ -f "$PENDING_FILE" ]; then
    EXISTING_SHA=$(sha256sum "$PENDING_FILE" 2>/dev/null | cut -d' ' -f1)
    if [ "$EXISTING_SHA" = "$BUILD_SHA256" ]; then
        log "Update already downloaded and verified: $BUILD_FILENAME"
        # Still notify in case user dismissed earlier
        write_pending_metadata
        notify_update
        exit 0
    else
        log "WARN: existing file has wrong hash, re-downloading"
        rm -f "$PENDING_FILE"
    fi
fi

# ── Step 6: Determine update policy ──
EFFECTIVE_POLICY="$UPDATE_POLICY"
if [ "$IS_SECURITY_PATCH" = "true" ] && [ -n "$SECURITY_PATCH_POLICY" ]; then
    EFFECTIVE_POLICY="$SECURITY_PATCH_POLICY"
    log "Security patch — using policy: $EFFECTIVE_POLICY"
else
    log "Update policy: $EFFECTIVE_POLICY"
fi

# ── Step 7: Download OTA ZIP ──
log "Downloading $BUILD_FILENAME..."
mkdir -p "$OTA_DIR"

DOWNLOAD_TMP="${PENDING_FILE}.part"
DOWNLOAD_OK=false

# Try IPFS first if available and we have a CID
if [ "$USE_IPFS" = "true" ] && [ -n "$BUILD_CID" ]; then
    log "Downloading via IPFS: $BUILD_CID"
    if ipfs get -o "$DOWNLOAD_TMP" "$BUILD_CID" 2>/dev/null; then
        DOWNLOAD_OK=true
    else
        log "WARN: IPFS download failed, trying HTTP fallback..."
    fi
fi

# HTTP fallback
if [ "$DOWNLOAD_OK" = "false" ] && [ -n "${ACTIVE_MIRROR:-}" ]; then
    log "Downloading via HTTP: ${ACTIVE_MIRROR}/${BUILD_FILENAME}"
    if http_fetch "${ACTIVE_MIRROR}/${BUILD_FILENAME}" > "$DOWNLOAD_TMP"; then
        if [ -s "$DOWNLOAD_TMP" ]; then
            DOWNLOAD_OK=true
        fi
    fi
fi

# Try all mirrors if the active one didn't work
if [ "$DOWNLOAD_OK" = "false" ] && [ -n "$HTTP_MIRRORS" ]; then
    OLD_IFS="$IFS"; IFS=","
    for mirror in $HTTP_MIRRORS; do
        mirror=$(echo "$mirror" | tr -d ' ')
        log "Trying mirror: ${mirror}/${BUILD_FILENAME}"
        if http_fetch "${mirror}/${BUILD_FILENAME}" > "$DOWNLOAD_TMP"; then
            if [ -s "$DOWNLOAD_TMP" ]; then
                DOWNLOAD_OK=true
                break
            fi
        fi
    done
    IFS="$OLD_IFS"
fi

if [ "$DOWNLOAD_OK" = "false" ]; then
    log "ERROR: download failed from all sources"
    rm -f "$DOWNLOAD_TMP"
    rm -rf "$OTA_DIR/tmp"
    exit 1
fi

# ── Step 8: SHA256 verification ──
log "Verifying SHA256..."
ACTUAL_SHA=$(sha256sum "$DOWNLOAD_TMP" | cut -d' ' -f1)
if [ "$ACTUAL_SHA" != "$BUILD_SHA256" ]; then
    log "ERROR: SHA256 mismatch! expected=$BUILD_SHA256 actual=$ACTUAL_SHA"
    rm -f "$DOWNLOAD_TMP"
    rm -rf "$OTA_DIR/tmp"
    exit 1
fi
mv "$DOWNLOAD_TMP" "$PENDING_FILE"
log "SHA256 verified OK"

write_pending_metadata
log "Update ready: $BUILD_FILENAME"

# ── Step 10: Apply based on policy ──
case "$EFFECTIVE_POLICY" in
    download)
        log "Policy=download — file saved, no further action"
        notify_update
        ;;
    prompt)
        log "Policy=prompt — notifying user"
        notify_update
        ;;
    auto)
        log "Policy=auto — scheduling install on next reboot"
        notify_update

        # Write to recovery command file for install-on-reboot.
        # LineageOS/AOSP recovery reads /cache/recovery/command on boot.
        RECOVERY_DIR="/cache/recovery"
        mkdir -p "$RECOVERY_DIR"
        echo "--update_package=$PENDING_FILE" > "$RECOVERY_DIR/command"
        echo "--wipe_cache" >> "$RECOVERY_DIR/command"

        # Also set the BCB (bootloader control block) via bootctl if available,
        # otherwise use the recovery command file approach above.
        if command -v bootctl >/dev/null 2>&1; then
            bootctl set-slot-as-unbootable 2>/dev/null || true
        fi

        log "Recovery command written — update will install on next reboot"

        # For security patches, reboot now (with 60s grace period)
        if [ "$IS_SECURITY_PATCH" = "true" ]; then
            log "Security patch — scheduling reboot in 60 seconds"
            (sleep 60 && reboot recovery) &
        fi
        ;;
    *)
        log "WARN: unknown policy '$EFFECTIVE_POLICY', defaulting to prompt"
        notify_update
        ;;
esac

# ── Cleanup ──
rm -rf "$OTA_DIR/tmp"
log "OTA check complete"
