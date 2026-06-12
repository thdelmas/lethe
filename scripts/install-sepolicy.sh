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

# file_contexts and property_contexts are SHARED files — the device tree
# (e.g. device/samsung/t0lte/selinux/file_contexts) already labels the
# Samsung modem daemons there: /system/bin/qcks -> qcks_exec, qmuxd, ks,
# efsks, plus /dev/mdm and the EFS block devices. A plain `cp` overwrites
# that, dropping those labels; under enforcing SELinux init can then no
# longer execute_no_trans the modem daemons, the external modem fails to
# power up, and the kernel (oops=panic) panics into a reboot loop. So we
# MERGE our entries inside a managed marker block instead of overwriting,
# replacing any prior block in place so rebuilds stay idempotent. This
# also retires the manual file_contexts-strip workaround the v1.0 build
# notes relied on.
LETHE_BEGIN="# LETHE-SEPOLICY-MANAGED-BEGIN"
LETHE_END="# LETHE-SEPOLICY-MANAGED-END"

merge_contexts() {
    local src="$1" dst="$2"
    [ -f "$src" ] || return 0
    if [ -f "$dst" ]; then
        # Drop a previous managed block so we don't accumulate duplicates.
        sed -i "/^${LETHE_BEGIN}\$/,/^${LETHE_END}\$/d" "$dst"
    fi
    {
        printf '\n%s\n' "$LETHE_BEGIN"
        cat "$src"
        printf '%s\n' "$LETHE_END"
    } >> "$dst"
}

copy_policy() {
    local target="$1"
    # Stale lethe.te from a previous run is dropped here: this file is
    # fully ours, so removing it before copy is safe and prevents a
    # disabled-upstream policy from sneaking into a rebuild (#122).
    # The *.te files are uniquely named (lethe.te, tor.te) so they never
    # collide with device .te files — a straight copy is correct.
    rm -f "$target/lethe.te"
    cp "$SEPOLICY_DIR"/*.te "$target/" 2>/dev/null || true
    merge_contexts "$SEPOLICY_DIR/file_contexts" "$target/file_contexts"
    merge_contexts "$SEPOLICY_DIR/property_contexts" "$target/property_contexts"
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
