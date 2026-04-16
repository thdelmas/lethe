#!/usr/bin/env bash
# Lethe — Install SELinux policy files into a LineageOS build tree.
#
# Called by apply-overlays.sh during the build. Copies .te files,
# file_contexts, and property_contexts to a location that the
# LineageOS build system picks up via BOARD_SEPOLICY_DIRS.
#
# Usage: install-sepolicy.sh <sepolicy_source_dir>

set -euo pipefail

SEPOLICY_DIR="${1:-}"
if [ -z "$SEPOLICY_DIR" ] || [ ! -d "$SEPOLICY_DIR" ]; then
    echo "  -> No sepolicy/ directory found, skipping SELinux policy."
    exit 0
fi

# Candidate install targets, most-specific first. LineageOS 14.1+ picks
# these up automatically; for older trees we fall back to a standalone
# directory referenced via BOARD_SEPOLICY_DIRS.
SEPOLICY_TARGETS=(
    "device/lineage/sepolicy/vendor"
    "device/lineage/sepolicy/common"
    "device/lineage/sepolicy"
)

INSTALLED=false
for target in "${SEPOLICY_TARGETS[@]}"; do
    if [ -d "$target" ]; then
        cp "$SEPOLICY_DIR"/*.te "$target/" 2>/dev/null || true
        cp "$SEPOLICY_DIR/file_contexts" "$target/" 2>/dev/null || true
        cp "$SEPOLICY_DIR/property_contexts" "$target/" 2>/dev/null || true
        echo "  -> SELinux policy installed to $target"
        INSTALLED=true
        break
    fi
done

if [ "$INSTALLED" = false ]; then
    FALLBACK="vendor/lethe/sepolicy"
    mkdir -p "$FALLBACK"
    cp "$SEPOLICY_DIR"/* "$FALLBACK/"
    echo "  -> SELinux policy installed to $FALLBACK (add to BOARD_SEPOLICY_DIRS)"
fi
