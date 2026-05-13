#!/usr/bin/env bash
# Generate an OTA manifest for a signed LETHE build.
#
# Usage: generate-ota.sh <codename> [--publish]
#
# Creates a JSON manifest that the on-device OTA updater can fetch.
# With --publish, pins to IPFS and publishes to IPNS.

set -euo pipefail

CODENAME="${1:?Usage: generate-ota.sh <codename> [--publish]}"
PUBLISH="${2:-}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="${LETHE_BUILD_DIR:-$HOME/Osmosis-downloads/lethe-builds}"
KEYS_DIR="$SCRIPT_DIR/../../keys"

# Find latest signed build
ZIP=$(ls -t "$BUILD_DIR"/Lethe-*-"$CODENAME".zip 2>/dev/null | head -1)
if [ -z "$ZIP" ]; then
    echo "ERROR: No build found for '$CODENAME' in $BUILD_DIR"
    exit 1
fi

if [ ! -f "$ZIP.sha256" ] || [ ! -f "$ZIP.sig" ]; then
    echo "ERROR: Build not signed. Run sign-build.sh $CODENAME first."
    exit 1
fi

# Extract version from filename: Lethe-1.0.0-codename.zip
BASENAME="$(basename "$ZIP" .zip)"
VERSION=$(echo "$BASENAME" | sed 's/Lethe-\(.*\)-'"$CODENAME"'/\1/')
SHA256=$(cat "$ZIP.sha256")
SIZE=$(stat -c%s "$ZIP" 2>/dev/null || stat -f%z "$ZIP")
DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

echo "Generating OTA manifest for $BASENAME..."

# Pin to IPFS if available
IPFS_CID=""
if command -v ipfs &>/dev/null; then
    echo "  -> Pinning to IPFS..."
    IPFS_CID=$(ipfs add -Q --pin "$ZIP")
    echo "  -> CID: $IPFS_CID"
fi

# Build manifest
MANIFEST="$BUILD_DIR/$BASENAME-ota.json"
cat > "$MANIFEST" <<EOF
{
  "version": "$VERSION",
  "codename": "$CODENAME",
  "date": "$DATE",
  "filename": "$(basename "$ZIP")",
  "size": $SIZE,
  "sha256": "$SHA256",
  "ipfs_cid": "$IPFS_CID",
  "download_urls": [
    ${IPFS_CID:+"\"https://ipfs.io/ipfs/$IPFS_CID\","}
    ${IPFS_CID:+"\"https://dweb.link/ipfs/$IPFS_CID\","}
    "https://github.com/thdelmas/lethe/releases/download/v$VERSION/$(basename "$ZIP")"
  ],
  "changelog": "LETHE $VERSION for $CODENAME"
}
EOF
echo "  -> Manifest: $MANIFEST"

# Sign the manifest. Ed25519 + -rawin signs the raw manifest bytes (no
# pre-hashing) — must match scripts/lethe-ota-update.sh's verifier, which
# also passes -rawin against the manifest content directly. The signed
# output is base64-encoded on the wire so the on-device verifier can pass
# it through a shell variable without binary-truncation issues.
#
# Previous form fed `sha256 hex | openssl ... -rawin` via process
# substitution; pkeyutl reported "Could not allocate 0 bytes" on the
# non-seekable input AND signed a different payload than the verifier
# checks. Both fixed here.
if [ -f "$KEYS_DIR/update-privkey.pem" ]; then
    openssl pkeyutl -sign \
        -inkey "$KEYS_DIR/update-privkey.pem" \
        -rawin \
        -in "$MANIFEST" \
        -out "$MANIFEST.sig.bin"
    base64 -w 0 < "$MANIFEST.sig.bin" > "$MANIFEST.sig"
    rm -f "$MANIFEST.sig.bin"
    echo "  -> Manifest signed (Ed25519, base64-encoded)."
fi

# Publish to IPNS if requested
if [ "$PUBLISH" = "--publish" ] && command -v ipfs &>/dev/null; then
    echo "  -> Publishing manifest to IPNS..."
    MANIFEST_CID=$(ipfs add -Q --pin "$MANIFEST")
    ipfs name publish --key=lethe-ota "$MANIFEST_CID" 2>/dev/null && {
        echo "  -> Published to IPNS."
    } || {
        echo "  -> IPNS key 'lethe-ota' not found. Create with:"
        echo "     ipfs key gen lethe-ota"
    }
fi

echo ""
echo "OTA manifest ready:"
echo "  Version:  $VERSION"
echo "  Device:   $CODENAME"
echo "  SHA256:   $SHA256"
echo "  IPFS:     ${IPFS_CID:-<not pinned>}"
echo "  Manifest: $MANIFEST"
