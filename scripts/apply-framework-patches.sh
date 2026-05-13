#!/usr/bin/env bash
# Apply LETHE framework patches against the current LineageOS source tree.
# Called from apply-overlays.sh step 17. Expects cwd == tree root.
#
# Layout: patches/<base>/<subdir_with_underscores>/*.patch — see patches/README.md.
# The base is selected from $PROPS_TARGET (exported by apply-overlays.sh).
#
# Idempotent: reverse-applies in dry-run mode first; already-applied patches
# short-circuit. Hard fails on any actual apply error so a broken patch isn't
# silently dropped.

set -euo pipefail

LETHE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PROPS_TARGET="${PROPS_TARGET:-}"

case "$PROPS_TARGET" in
    vendor/cm/config/common.mk)        PATCHES_BASE="cm-14.1" ;;
    vendor/lineage/config/common.mk)   PATCHES_BASE="" ;;  # add when a base needs patches
    *)                                  PATCHES_BASE="" ;;
esac

if [ -z "$PATCHES_BASE" ] || [ ! -d "$LETHE_DIR/patches/$PATCHES_BASE" ]; then
    echo "  -> No framework patches for base '${PATCHES_BASE:-unknown}', skipping."
    exit 0
fi

echo "  -> Applying patches from patches/$PATCHES_BASE..."

apply_patch() {
    local subdir="$1" patchfile="$2"
    local name
    name="$(basename "$patchfile")"
    if [ ! -d "$subdir" ]; then
        echo "  -> WARNING: $subdir not present, skipping $name."
        return 0
    fi
    if patch -R -p1 --dry-run -s -d "$subdir" -i "$patchfile" >/dev/null 2>&1; then
        echo "  -> $name already applied (skipping)."
        return 0
    fi
    if patch -p1 -s -d "$subdir" -i "$patchfile"; then
        echo "  -> applied $name to $subdir."
    else
        echo "  -> FAILED to apply $name to $subdir."
        return 1
    fi
}

for subdir_path in "$LETHE_DIR/patches/$PATCHES_BASE"/*/; do
    [ -d "$subdir_path" ] || continue
    # patches/<base>/frameworks_base/ → frameworks/base
    target="${subdir_path%/}"
    target="${target##*/}"
    target="${target//_//}"
    for patchfile in "$subdir_path"*.patch; do
        [ -f "$patchfile" ] || continue
        apply_patch "$target" "$patchfile"
    done
done
