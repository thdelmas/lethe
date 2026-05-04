#!/usr/bin/env bash
# Lethe — Install SELinux policy files into a LineageOS build tree.
#
# Called by apply-overlays.sh during the build. Copies .te files,
# file_contexts, and property_contexts to a location the build picks
# up via BOARD_SEPOLICY_DIRS.
#
# Usage: install-sepolicy.sh <sepolicy_source_dir> [codename]

set -euo pipefail

SEPOLICY_DIR="${1:-}"
CODENAME="${2:-}"
if [ -z "$SEPOLICY_DIR" ] || [ ! -d "$SEPOLICY_DIR" ]; then
    echo "  -> No sepolicy/ directory found, skipping SELinux policy."
    exit 0
fi

copy_policy() {
    local target="$1"
    cp "$SEPOLICY_DIR"/*.te "$target/" 2>/dev/null || true
    cp "$SEPOLICY_DIR/file_contexts" "$target/" 2>/dev/null || true
    cp "$SEPOLICY_DIR/property_contexts" "$target/" 2>/dev/null || true
}

# cm-14.1 device trees have no device/lineage/sepolicy/ overlay. The
# convention there is per-device device/<vendor>/<codename>/selinux/,
# which the device tree's BoardConfig.mk already wires into
# BOARD_SEPOLICY_DIRS. Detect cm-14.1 via vendor/cm/ — same signal
# apply-overlays.sh uses for the props target — and require a codename
# so we know which device tree to write into.
if [ -d "vendor/cm" ]; then
    if [ -z "$CODENAME" ]; then
        echo "  -> ERROR: cm-14.1 tree detected but no codename passed; refusing to" >&2
        echo "     guess. Pass codename as the second argument." >&2
        exit 1
    fi
    VENDOR_DIR=""
    for candidate in device/*/"$CODENAME"; do
        if [ -d "$candidate" ]; then
            VENDOR_DIR="$candidate"
            break
        fi
    done
    if [ -z "$VENDOR_DIR" ]; then
        echo "  -> ERROR: cm-14.1 tree but no device/<vendor>/$CODENAME/ found." >&2
        echo "     Sync the device tree before applying overlays." >&2
        exit 1
    fi
    TARGET="$VENDOR_DIR/selinux"
    mkdir -p "$TARGET"
    copy_policy "$TARGET"
    echo "  -> SELinux policy installed to $TARGET (cm-14.1)"
    exit 0
fi

# LineageOS 15.1+ ships device/lineage/sepolicy/ as a board sepolicy
# overlay included by every device. Most-specific subdir first.
SEPOLICY_TARGETS=(
    "device/lineage/sepolicy/vendor"
    "device/lineage/sepolicy/common"
    "device/lineage/sepolicy"
)

for target in "${SEPOLICY_TARGETS[@]}"; do
    if [ -d "$target" ]; then
        copy_policy "$target"
        echo "  -> SELinux policy installed to $target"
        exit 0
    fi
done

FALLBACK="vendor/lethe/sepolicy"
mkdir -p "$FALLBACK"
cp "$SEPOLICY_DIR"/* "$FALLBACK/"
echo "  -> SELinux policy installed to $FALLBACK (add to BOARD_SEPOLICY_DIRS)"
