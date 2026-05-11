#!/usr/bin/env bash
# build-all.sh — Build LETHE for every device in manifest.yaml.
#
# Drives the full per-device pipeline: apply overlays, lunch, mka bacon,
# sign, and generate the OTA manifest. cm-14.1 devices (Exynos 4412 et al.)
# are routed through Dockerfile.cm14-build because they need Ubuntu 18.04 +
# JDK 8; everything else builds natively against the host toolchain.
#
# Each unique LineageOS base is synced once into its own source tree and
# reused across all devices on that base.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LETHE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
MANIFEST="$LETHE_DIR/manifest.yaml"

LOS_22_DIR="${LETHE_LOS_22_DIR:-$HOME/lineage-22.1}"
LOS_14_DIR="${LETHE_LOS_14_DIR:-$HOME/lineage-14.1}"
BUILD_DIR="${LETHE_BUILD_DIR:-$HOME/Osmosis-downloads/lethe-builds}"

usage() {
    cat <<'EOF'
build-all.sh — Build LETHE for every device in manifest.yaml.

Usage:
  scripts/build-all.sh                  # build every device
  scripts/build-all.sh panther shiba    # build only the named codenames
  scripts/build-all.sh --list           # print device/base table and exit

Env:
  LETHE_LOS_22_DIR   LOS 22.1 source tree     (default: $HOME/lineage-22.1)
  LETHE_LOS_14_DIR   LOS 14.1 source tree     (default: $HOME/lineage-14.1)
  LETHE_BUILD_DIR    Signed-build output dir  (default: $HOME/Osmosis-downloads/lethe-builds)
  LETHE_SKIP_SYNC=1  Reuse existing source trees as-is (skip repo sync)
  LETHE_DRY_RUN=1    Print actions without executing the build
EOF
}

# Emit "<codename> <base_version>" lines for every device in manifest.yaml.
# Handles both the bare-string form and the {codename, base_version} object form.
parse_devices() {
    python3 - "$MANIFEST" <<'PY'
import sys, yaml
m = yaml.safe_load(open(sys.argv[1]))
default_base = str(m.get("base_version", "22.1"))
for d in m.get("devices", []):
    if isinstance(d, str):
        print(f"{d} {default_base}")
    else:
        print(f"{d['codename']} {d.get('base_version', default_base)}")
PY
}

manifest_version() {
    python3 -c "import yaml; print(yaml.safe_load(open('$MANIFEST'))['version'])"
}

tree_for_base() {
    case "$1" in
        14.1) echo "$LOS_14_DIR" ;;
        *)    echo "$LOS_22_DIR" ;;
    esac
}

branch_for_base() {
    case "$1" in
        14.1) echo "cm-14.1" ;;
        *)    echo "lineage-$1" ;;
    esac
}

sync_tree() {
    local tree="$1" branch="$2"
    [ "${LETHE_SKIP_SYNC:-0}" = "1" ] && return 0
    if [ "${LETHE_DRY_RUN:-0}" = "1" ]; then
        printf '  [dry-run] repo init -b %s && repo sync (in %s)\n' "$branch" "$tree"
        return 0
    fi
    mkdir -p "$tree"
    (
        cd "$tree"
        if [ ! -d ".repo" ]; then
            repo init -u https://github.com/LineageOS/android.git -b "$branch" --depth=1
        fi
        repo sync -c -j"$(nproc)" --force-sync --no-clone-bundle --no-tags
    )
}

# cm-14.1 needs Ubuntu 18.04 + JDK 8 — build inside the dockerized env.
build_in_docker() {
    local tree="$1" codename="$2"
    local image="lethe-cm14-build:latest"
    if ! docker image inspect "$image" >/dev/null 2>&1; then
        docker build -t "$image" -f "$LETHE_DIR/Dockerfile.cm14-build" "$LETHE_DIR"
    fi
    # /lethe must be rw — apply-overlays.sh chmods source files before
    # staging them (and we don't want a chmod side-effect on the host
    # to be the precondition for a build to succeed).
    docker run --rm \
        -v "$tree:/lineage" \
        -v "$LETHE_DIR:/lethe" \
        -v "$HOME/.ccache:/ccache" \
        "$image" \
        bash -c "cd /lineage && /lethe/apply-overlays.sh ${codename} && source build/envsetup.sh && lunch lineage_${codename}-user && mka bacon"
}

# LOS 22.1+ — build natively against the host toolchain.
build_native() {
    local tree="$1" codename="$2"
    (
        cd "$tree"
        "$LETHE_DIR/apply-overlays.sh" "$codename"
        bash -c "source build/envsetup.sh && lunch lineage_${codename}-user && mka bacon"
    )
}

# Copy the OUT zip into BUILD_DIR using the Lethe-<version>-<codename>.zip
# naming that sign-build.sh and generate-ota.sh both expect.
collect_build() {
    local tree="$1" codename="$2" version="$3"
    local out_dir="$tree/out/target/product/$codename"
    local zip
    zip="$(ls -t "$out_dir"/lineage-*-"$codename".zip 2>/dev/null | head -1 || true)"
    if [ -z "$zip" ]; then
        echo "  -> ERROR: no OUT zip for $codename in $out_dir" >&2
        return 1
    fi
    mkdir -p "$BUILD_DIR"
    cp "$zip" "$BUILD_DIR/Lethe-${version}-${codename}.zip"
}

build_device() {
    local codename="$1" base="$2" version="$3"
    local tree
    tree="$(tree_for_base "$base")"

    echo "=== $codename (LOS $base) ==="
    if [ "${LETHE_DRY_RUN:-0}" = "1" ]; then
        if [ "$base" = "14.1" ]; then
            printf '  [dry-run] docker run lethe-cm14-build (apply-overlays + lunch lineage_%s-user + mka bacon)\n' "$codename"
        else
            printf '  [dry-run] cd %s && apply-overlays.sh %s && lunch lineage_%s-user && mka bacon\n' \
                "$tree" "$codename" "$codename"
        fi
        printf '  [dry-run] collect %s/out/.../lineage-*-%s.zip -> %s/Lethe-%s-%s.zip\n' \
            "$tree" "$codename" "$BUILD_DIR" "$version" "$codename"
        printf '  [dry-run] sign-build.sh %s && generate-ota.sh %s\n' "$codename" "$codename"
        return 0
    fi
    if [ "$base" = "14.1" ]; then
        build_in_docker "$tree" "$codename"
    else
        build_native "$tree" "$codename"
    fi
    collect_build "$tree" "$codename" "$version"
    "$SCRIPT_DIR/sign-build.sh" "$codename"
    "$SCRIPT_DIR/generate-ota.sh" "$codename"
}

main() {
    case "${1:-}" in
        -h|--help) usage; exit 0 ;;
        --list)
            printf '%-20s %s\n' "CODENAME" "BASE"
            parse_devices | while read -r c b; do printf '%-20s %s\n' "$c" "$b"; done
            exit 0
            ;;
    esac

    local -a wanted=("$@")
    local -a devices=()
    local codename base
    while read -r codename base; do
        if [ "${#wanted[@]}" -gt 0 ]; then
            local match=0
            local w
            for w in "${wanted[@]}"; do
                [ "$w" = "$codename" ] && { match=1; break; }
            done
            [ "$match" -eq 0 ] && continue
        fi
        devices+=("$codename:$base")
    done < <(parse_devices)

    if [ "${#devices[@]}" -eq 0 ]; then
        echo "No matching devices in manifest.yaml." >&2
        exit 1
    fi

    # Sync each unique base tree exactly once.
    local -A synced=()
    local entry
    for entry in "${devices[@]}"; do
        base="${entry##*:}"
        if [ -z "${synced[$base]:-}" ]; then
            synced[$base]=1
            local tree branch
            tree="$(tree_for_base "$base")"
            branch="$(branch_for_base "$base")"
            echo "=== Sync $branch -> $tree ==="
            sync_tree "$tree" "$branch"
        fi
    done

    local version
    version="$(manifest_version)"
    local -a failed=()
    local rc
    for entry in "${devices[@]}"; do
        codename="${entry%%:*}"
        base="${entry##*:}"
        # Disable set -e around the call so a failed device doesn't abort the
        # whole batch — but keep set -e active *inside* build_device, which
        # bash would otherwise suppress because of the `if`/`||` test context.
        set +e
        ( set -e; build_device "$codename" "$base" "$version" )
        rc=$?
        set -e
        if [ "$rc" -ne 0 ]; then
            failed+=("$codename")
            echo "  -> $codename FAILED (rc=$rc)" >&2
        fi
    done

    echo ""
    echo "=== Summary ==="
    echo "  Total:  ${#devices[@]}"
    echo "  Built:  $(( ${#devices[@]} - ${#failed[@]} ))"
    echo "  Failed: ${#failed[@]}"
    if [ "${#failed[@]}" -gt 0 ]; then
        printf '    %s\n' "${failed[@]}" >&2
        exit 1
    fi
}

main "$@"
