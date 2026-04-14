#!/usr/bin/env bash
# Build lethe-p2p sidecar for Android targets.
# Produces static binaries in ../prebuilt/p2p/{arch}/lethe-p2p
set -euo pipefail

cd "$(dirname "$0")"

OUTDIR="../prebuilt/p2p"

build_target() {
    local goarch="$1"
    local outdir="$2"

    mkdir -p "$outdir"
    echo "Building lethe-p2p for linux/${goarch}..."

    CGO_ENABLED=0 GOOS=linux GOARCH="$goarch" \
        go build -ldflags="-s -w" -o "${outdir}/lethe-p2p" .

    echo "  → ${outdir}/lethe-p2p ($(du -h "${outdir}/lethe-p2p" | cut -f1))"
}

# arm64 (arm64-v8a)
build_target "arm64" "${OUTDIR}/arm64-v8a"

# armv7 (armeabi-v7a)
GOARM=7 build_target "arm" "${OUTDIR}/armeabi-v7a"

echo "Done."
