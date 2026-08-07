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

# Types that exist on cm-14.1 (Android 7.1) but were REMOVED from modern
# AOSP. A .te referencing one fails the whole policy build with
#   ERROR 'unknown type <t>'
# and, because checkpolicy stops at the first error, hides every later
# problem. The source .te files stay cm-14.1-correct; this strips the
# dead lines on modern trees only.
#
#   urandom_device — merged into random_device; /dev/urandom carries
#                    random_device on modern AOSP, so the surviving
#                    `allow ... random_device` line already covers it.
LEGACY_ONLY_TYPES=(urandom_device)

strip_legacy_types() {
    local target="$1" t
    for t in "${LEGACY_ONLY_TYPES[@]}"; do
        sed -i "/\b${t}\b/d" "$target"/*.te 2>/dev/null || true
    done
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

# ── Modern-tree gate ────────────────────────────────────────────────
# The policy is cm-14.1-era and is NOT yet neverallow-clean on modern
# AOSP. Measured 2026-08-07 against lineage-22.1 (Android 15): once
# correctly wired, `mka selinux_policy` fails with 10 neverallow
# violations across 7 rules — lethe: system_file execute_no_trans,
# system_data_file dir, app_data_file dir, system_prop set,
# self:capability sys_admin/dac_override/…; tor: self:capability,
# system_file. These are deliberate AOSP restrictions tightened after
# Android 7, so clearing them is a domain redesign (split the daemon's
# real needs out of the blanket grants), not a syntax fix.
#
# Installing anyway makes the POLICY BUILD FAIL, which kills `mka bacon`
# ~20 minutes in. So modern installs are skipped by default. The cost of
# skipping is the status quo: no `lethe` domain at runtime, init cannot
# setexeccon('u:r:lethe:s0'), and lethe-agent restart-loops — visible in
# logcat, harmless on a permissive diag build, blocking for enforcing.
#
# Set LETHE_SEPOLICY_MODERN=1 to install once the domain is reworked.
# See docs/release/bramble-modern-port-notes.md.
if [ "${LETHE_SEPOLICY_MODERN:-0}" != "1" ] && [ ! -d vendor/cm ]; then
    echo "  -> SKIP: SELinux policy not installed (not neverallow-clean on"
    echo "     modern AOSP; would fail the policy build). lethe-agent will"
    echo "     restart-loop until the domain is reworked. Override with"
    echo "     LETHE_SEPOLICY_MODERN=1 — see bramble-modern-port-notes.md."
    exit 0
fi

# LineageOS 15.1+ ships device/lineage/sepolicy/ as a board sepolicy
# overlay included by every device (build/make/core/config.mk includes
# common/sepolicy.mk last, for LINEAGE_BUILD).
#
# Target a POLICY dir, never a container. `device/lineage/sepolicy/common`
# is NOT itself on the policy path — common/sepolicy.mk only adds its
# subdirs (public / private / dynamic / vendor+system) to
# SYSTEM_EXT_*_SEPOLICY_DIRS and BOARD_VENDOR_SEPOLICY_DIRS. Installing
# into the container leaves the .te files and the merged file_contexts
# sitting in the tree, never compiled, and the domain silently does not
# exist at runtime: init then dies with
#   cannot setexeccon('u:r:lethe:s0'): Invalid argument
# and the agent restart-loops. That cost 2026-07-19 → 2026-08-07 of
# "the sepolicy is installed, why is there no domain" (lethe#…, see
# docs/release/bramble-modern-port-notes.md).
#
# common/private is where LineageOS labels its own /system/bin binaries
# (fsck.ntfs, mkfs.*), which is what our system-partition daemons and
# scripts are — so it is the right home, not vendor.
SEPOLICY_TARGETS=(
    "device/lineage/sepolicy/common/private"
    "device/lineage/sepolicy/common/vendor"
    "device/lineage/sepolicy"
)

for target in "${SEPOLICY_TARGETS[@]}"; do
    if [ -d "$target" ]; then
        copy_policy "$target"
        strip_legacy_types "$target"     # modern trees only
        echo "  -> SELinux policy installed to $target"
        exit 0
    fi
done

FALLBACK="vendor/lethe/sepolicy"
mkdir -p "$FALLBACK"
cp "$SEPOLICY_DIR"/* "$FALLBACK/"
echo "  -> SELinux policy installed to $FALLBACK (add to BOARD_SEPOLICY_DIRS)"
