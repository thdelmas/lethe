#!/usr/bin/env bash
set -euo pipefail

# Build lethe-agent for Android targets.
# Prerequisites:
#   rustup target add aarch64-linux-android armv7-linux-androideabi
#   cargo install cargo-ndk
#   ANDROID_NDK_HOME set to NDK path (r25+ recommended)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

TARGET="${1:-aarch64-linux-android}"
PROFILE="${2:-release}"

echo "Building lethe-agent for $TARGET ($PROFILE)"

if command -v cargo-ndk &>/dev/null; then
    cargo ndk --target "$TARGET" build --profile "$PROFILE"
else
    cargo build --target "$TARGET" --profile "$PROFILE"
fi

BINARY="target/$TARGET/$PROFILE/lethe-agent"
if [ -f "$BINARY" ]; then
    SIZE=$(du -h "$BINARY" | cut -f1)
    echo "Built: $BINARY ($SIZE)"
else
    echo "Build failed — no binary at $BINARY"
    exit 1
fi
