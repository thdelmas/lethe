#!/usr/bin/env bash
# Sign a LETHE build ZIP with Ed25519.
#
# Usage: sign-build.sh <codename>
#
# Expects:
#   - Build output at ~/Osmosis-downloads/lethe-builds/Lethe-*-<codename>.zip
#   - Signing key at ../keys/update-privkey.pem (Ed25519)
#
# Produces:
#   - .sha256 alongside the ZIP
#   - .sig   Ed25519 detached signature

set -euo pipefail

CODENAME="${1:?Usage: sign-build.sh <codename>}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
KEYS_DIR="$SCRIPT_DIR/../../keys"
BUILD_DIR="${LETHE_BUILD_DIR:-$HOME/Osmosis-downloads/lethe-builds}"
PRIVKEY="$KEYS_DIR/update-privkey.pem"

# Find the latest build for this codename
ZIP=$(ls -t "$BUILD_DIR"/Lethe-*-"$CODENAME".zip 2>/dev/null | head -1)
if [ -z "$ZIP" ]; then
    echo "ERROR: No build found for codename '$CODENAME' in $BUILD_DIR"
    exit 1
fi

echo "Signing: $ZIP"

# Generate key pair if missing
if [ ! -f "$PRIVKEY" ]; then
    echo "No signing key found. Generating Ed25519 key pair..."
    mkdir -p "$KEYS_DIR"
    openssl genpkey -algorithm Ed25519 -out "$PRIVKEY"
    openssl pkey -in "$PRIVKEY" -pubout -out "$KEYS_DIR/update-pubkey.pem"
    chmod 600 "$PRIVKEY"
    echo "  -> Key pair generated in $KEYS_DIR/"
    echo "     KEEP update-privkey.pem SECRET. Never commit it."
fi

# SHA256 checksum
sha256sum "$ZIP" | cut -d' ' -f1 > "$ZIP.sha256"
echo "  -> SHA256: $(cat "$ZIP.sha256")"

# Ed25519 detached signature
openssl pkeyutl -sign \
    -inkey "$PRIVKEY" \
    -rawin \
    -in <(sha256sum "$ZIP" | cut -d' ' -f1 | tr -d '\n') \
    -out "$ZIP.sig"
echo "  -> Signature: $ZIP.sig"

# Verify to confirm
PUBKEY="$KEYS_DIR/update-pubkey.pem"
if openssl pkeyutl -verify \
    -pubin -inkey "$PUBKEY" \
    -rawin \
    -in <(sha256sum "$ZIP" | cut -d' ' -f1 | tr -d '\n') \
    -sigfile "$ZIP.sig" 2>/dev/null; then
    echo "  -> Signature verified OK."
else
    echo "ERROR: Signature verification failed!"
    exit 1
fi

echo ""
echo "Signed build ready:"
echo "  ZIP:    $ZIP"
echo "  SHA256: $ZIP.sha256"
echo "  SIG:    $ZIP.sig"
