#!/system/bin/sh
# Lethe warrant canary fetcher (lethe#114).
#
# Pulls the signed canary statement from IPNS, verifies the Ed25519
# signature against /system/etc/lethe/canary-pubkey.pem, and writes the
# state to /data/lethe/canary/state.json so the Settings UI can surface
# fresh / stale / missing.
#
# Schema of the published statement:
#   {
#     "as_of": "YYYY-MM-DD",          # date the signers asserted this
#     "current_event": "<news ref>",  # proves the statement was written
#                                     # on or after as_of (Bitcoin block,
#                                     # newspaper headline, etc.)
#     "statement": "No court orders / gag orders / key-disclosure
#                   demands received as of <as_of>.",
#     "next_due": "YYYY-MM-DD",       # if the canary doesn't refresh by
#                                     # this date, treat as silenced
#     "signers": ["maintainer-id-1", "maintainer-id-2"]
#   }
#
# Anything that fails verification or freshness writes status="stale" or
# "missing" to state.json — the absence of a fresh signed canary is the
# signal, not the presence.

set -eu

TAG="lethe-canary"
log() { /system/bin/log -t "$TAG" "$1"; }

CANARY_DIR="/data/lethe/canary"
STATE_FILE="$CANARY_DIR/state.json"
PUBKEY="/system/etc/lethe/canary-pubkey.pem"
IPNS_KEY="${LETHE_CANARY_IPNS:-lethe-canary}"
STALE_DAYS="${LETHE_CANARY_STALE_DAYS:-35}"

mkdir -p "$CANARY_DIR"

write_state() {
    local status="$1" message="$2" as_of="${3:-}" next_due="${4:-}"
    local now
    now=$(date -Iseconds 2>/dev/null || date +%s)
    cat > "$STATE_FILE.tmp" <<EOF
{
  "status": "$status",
  "message": "$message",
  "as_of": "$as_of",
  "next_due": "$next_due",
  "checked_at": "$now"
}
EOF
    mv "$STATE_FILE.tmp" "$STATE_FILE"
}

if ! command -v ipfs >/dev/null 2>&1; then
    log "IPFS not installed — canary check skipped"
    write_state "missing" "IPFS daemon not available on this device"
    exit 0
fi

if [ ! -f "$PUBKEY" ]; then
    log "ERROR: canary pubkey missing at $PUBKEY"
    write_state "missing" "canary pubkey not provisioned"
    exit 0
fi

log "Resolving IPNS canary channel: $IPNS_KEY"
CID=$(ipfs name resolve "$IPNS_KEY" 2>/dev/null || true)
if [ -z "$CID" ]; then
    log "WARN: IPNS resolve failed — keeping last known state"
    # Don't overwrite state.json — a transient network failure shouldn't
    # erase a previously-known-fresh state. The Settings UI shows
    # checked_at staleness from the previous run.
    exit 0
fi

STATEMENT=$(ipfs cat "$CID/canary.json" 2>/dev/null || true)
SIG_B64=$(ipfs cat "$CID/canary.json.sig" 2>/dev/null || true)
if [ -z "$STATEMENT" ] || [ -z "$SIG_B64" ]; then
    log "ERROR: empty canary or signature at $CID"
    write_state "stale" "canary fetched but missing fields"
    exit 0
fi

TMP=$(mktemp)
SIG="$TMP.sig"
echo "$STATEMENT" > "$TMP"
echo "$SIG_B64" | base64 -d > "$SIG" 2>/dev/null || true

if ! openssl pkeyutl -verify \
    -pubin -inkey "$PUBKEY" \
    -rawin -in "$TMP" -sigfile "$SIG" >/dev/null 2>&1; then
    log "ERROR: canary signature verification FAILED"
    write_state "stale" "canary signature did not verify — investigate"
    rm -f "$TMP" "$SIG"
    exit 0
fi
rm -f "$TMP" "$SIG"

# Parse as_of + next_due via grep — jq isn't on most Android targets.
extract() {
    echo "$STATEMENT" | grep "\"$1\"" | head -1 \
        | sed 's/.*: *"\([^"]*\)".*/\1/'
}
AS_OF=$(extract as_of)
NEXT_DUE=$(extract next_due)
STMT=$(extract statement)

# Freshness check. as_of must be within STALE_DAYS of today, and next_due
# must not have passed.
NOW_EPOCH=$(date +%s)
AS_OF_EPOCH=$(date -d "$AS_OF" +%s 2>/dev/null || echo 0)
NEXT_DUE_EPOCH=$(date -d "$NEXT_DUE" +%s 2>/dev/null || echo 0)

if [ "$AS_OF_EPOCH" -eq 0 ]; then
    write_state "stale" "could not parse as_of=$AS_OF" "$AS_OF" "$NEXT_DUE"
    exit 0
fi

ELAPSED=$(( (NOW_EPOCH - AS_OF_EPOCH) / 86400 ))
if [ "$ELAPSED" -gt "$STALE_DAYS" ]; then
    write_state "stale" "canary is $ELAPSED days old (limit $STALE_DAYS)" \
        "$AS_OF" "$NEXT_DUE"
    log "Canary stale: $ELAPSED days since $AS_OF"
    exit 0
fi

if [ "$NEXT_DUE_EPOCH" -gt 0 ] && [ "$NOW_EPOCH" -gt "$NEXT_DUE_EPOCH" ]; then
    write_state "stale" "canary's own next_due ($NEXT_DUE) has passed" \
        "$AS_OF" "$NEXT_DUE"
    log "Canary past its own next_due ($NEXT_DUE)"
    exit 0
fi

write_state "fresh" "$STMT" "$AS_OF" "$NEXT_DUE"
log "Canary fresh: as_of=$AS_OF, next_due=$NEXT_DUE"
