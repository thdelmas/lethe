#!/usr/bin/env bash
# Lethe — Apply privacy overlays to a LineageOS source tree.
#
# Usage: lethe/apply-overlays.sh [codename]
#
# This script is called during the build process after repo sync.
# It copies overlay files into the right places in the Android source tree.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OVERLAY_DIR="$SCRIPT_DIR/overlays"
INITRC_DIR="$SCRIPT_DIR/initrc"
CODENAME="${1:-}"

# Per-build tag suffixed to ro.build.display.id so Settings → About phone
# reflects the actual artifact (YYYYMMDD-shortsha; "dev" on no-git). Override
# LETHE_BUILD_TAG to pin (release tagging, reproducible builds).
LETHE_BUILD_TAG="${LETHE_BUILD_TAG:-$(date +%Y%m%d)-$(git -C "$SCRIPT_DIR" rev-parse --short HEAD 2>/dev/null || echo dev)}"

# Map Rust/build target names to Android ABI directory names used by prebuilt/.
# TARGET_ARCH may be set by the build environment or defaults later.
# PREBUILT_ARCH is the directory name under prebuilt/{tor,ipfs}/.
case "${TARGET_ARCH:-}" in
    armv7-linux-androideabi|armeabi-v7a|armv7*)
        PREBUILT_ARCH="armeabi-v7a"
        ;;
    arm64-v8a|aarch64*)
        PREBUILT_ARCH="arm64-v8a"
        ;;
    *)
        # When TARGET_ARCH isn't set explicitly, pick the era-appropriate ABI
        # from the source-tree signal. cm-14.1 devices in our manifest (t0lte,
        # t03g, Exynos 4412) are all 32-bit ARMv7; LOS 22.1+ targets are arm64.
        # Without this, cm-14.1 builds silently shipped the arm64 tor binary
        # and init died with ENOEXEC at runtime.
        if [ -d "vendor/cm" ]; then
            PREBUILT_ARCH="armeabi-v7a"
        else
            PREBUILT_ARCH="arm64-v8a"
        fi
        ;;
esac

echo "=== Lethe overlay applicator ==="
echo "Overlay dir: $OVERLAY_DIR"
echo "Codename:    ${CODENAME:-<all>}"
echo "Prebuilt:    $PREBUILT_ARCH"

# Detect the LineageOS / cm-14.1 props target up front. Both the prop
# applicator (step 1) and the add_to_system helper need it.
if [ -f "vendor/lineage/config/common.mk" ]; then
    PROPS_TARGET="vendor/lineage/config/common.mk"
elif [ -f "vendor/cm/config/common.mk" ]; then
    PROPS_TARGET="vendor/cm/config/common.mk"
else
    PROPS_TARGET=""
fi

# Stage a file under lethe-staging/<dest> in the LOS tree and append a
# PRODUCT_COPY_FILES entry to common.mk so the build packages it into the
# system image. Without this, files dropped into source-tree paths like
# system/bin/ are silently ignored and the OTA ships without them.
# Args: <src absolute path> <dest relative to system root, e.g. system/bin/tor>
add_to_system() {
    local src="$1"
    local dest="$2"
    if [ -z "$PROPS_TARGET" ]; then
        echo "     WARNING: no props target — cannot register $dest, skipping."
        return 0
    fi
    if [ ! -f "$src" ]; then
        echo "     WARNING: source missing for $dest at $src, skipping."
        return 0
    fi
    local stage="lethe-staging/$dest"
    mkdir -p "$(dirname "$stage")"
    cp "$src" "$stage"
    chmod --reference="$src" "$stage" 2>/dev/null || true
    # Idempotent: only append if not already present (re-runs of
    # apply-overlays.sh shouldn't accumulate duplicate entries).
    local entry="PRODUCT_COPY_FILES += $stage:$dest"
    grep -qF -- "$entry" "$PROPS_TARGET" 2>/dev/null || echo "$entry" >> "$PROPS_TARGET"
}

# Install a LETHE init.rc into /system/etc/init/ (loaded by Android init
# after /system mounts). Uses add_to_system so the file actually ships.
# Args: <rc filename> [<label for log>]
install_initrc() {
    local rc="$1"
    local label="${2:-${rc#init.lethe-}}"
    label="${label%.rc}"
    add_to_system "$INITRC_DIR/$rc" "system/etc/init/$rc"
    echo "  -> $label init service registered for /system/etc/init/$rc."
}

# ── 1. System properties (privacy defaults) ──
if [ -f "$OVERLAY_DIR/privacy-defaults.conf" ]; then
    echo "[1/17] Applying privacy system properties..."
    # PROPS_TARGET is detected up front; both this block and add_to_system use it.
    # Versioned idempotency marker. Bump LETHE_PROPS_VERSION whenever the
    # identity block changes (as in #124's PRODUCT_DEFAULT_PROPERTY_OVERRIDES
    # split). Old marker → strip the prior block and re-apply.
    LETHE_PROPS_VERSION="3"
    # Marker embeds BUILD_TAG so a SHA change re-triggers strip-and-rewrite.
    LETHE_PROPS_MARKER="# Lethe identity v${LETHE_PROPS_VERSION}-${LETHE_BUILD_TAG}"
    if [ -n "$PROPS_TARGET" ] && [ -f "$PROPS_TARGET" ] && grep -qF "$LETHE_PROPS_MARKER" "$PROPS_TARGET"; then
        echo "  -> Properties already applied to $PROPS_TARGET (idempotent, $LETHE_PROPS_MARKER)."
    elif [ -n "$PROPS_TARGET" ] && [ -f "$PROPS_TARGET" ]; then
        # Strip any previous LETHE identity block (any version/tag, or the old
        # un-versioned marker). Block runs from "# Lethe identity" through
        # the next blank line — covers both the LETHE_PROPS and the privacy
        # defaults we appended in the same step.
        if grep -q "^# Lethe identity" "$PROPS_TARGET"; then
            echo "  -> Found prior LETHE identity block; rewriting for $LETHE_PROPS_MARKER."
            # Delete from the first "# Lethe identity" line through the end
            # of file. Step 1 always wrote the LETHE block at the file's
            # tail, so this cleanup is safe.
            sed -i '/^# Lethe identity/,$d' "$PROPS_TARGET"
        fi
        # LETHE identity props (not in conf — fixed at build time).
        # The heredoc preamble below carries the #124 read-only-prop explainer.
        cat >> "$PROPS_TARGET" <<PROPS

# Lethe identity v${LETHE_PROPS_VERSION}-${LETHE_BUILD_TAG} — display-id overrides.
# These MUST be PRODUCT_DEFAULT_PROPERTY_OVERRIDES — they go to /default.prop
# in the ramdisk and lock before /system/build.prop is loaded. Otherwise
# LineageOS's buildinfo line wins (read-only-prop semantics, see #124).
PRODUCT_DEFAULT_PROPERTY_OVERRIDES += \\
    ro.build.display.id=LETHE-1.0.0-${LETHE_BUILD_TAG} \\
    ro.lineage.display.version=LETHE-1.0.0-${LETHE_BUILD_TAG} \\
    ro.modversion=LETHE-1.0.0-${LETHE_BUILD_TAG}

# Lethe identity (LETHE-only namespace, no LineageOS conflict).
PRODUCT_PROPERTY_OVERRIDES += \\
    ro.lethe=true \\
    ro.lethe.version=1.0.0 \\
    ro.lethe.base=lineageos

# Lethe privacy defaults (parsed from overlays/privacy-defaults.conf)
PROPS
        # Field-build flag (issue #95). When LETHE_FIELD_BUILD=1 is set, the
        # build pipeline strips cloud-provider code from the agent UI and
        # this prop lets on-device code refuse to enable cloud paths even if
        # something tries to set them at runtime.
        if [ "${LETHE_FIELD_BUILD:-0}" = "1" ]; then
            echo "PRODUCT_PROPERTY_OVERRIDES += ro.lethe.field_build=1" >> "$PROPS_TARGET"
            echo "  -> Field build: ro.lethe.field_build=1"
        else
            echo "PRODUCT_PROPERTY_OVERRIDES += ro.lethe.field_build=0" >> "$PROPS_TARGET"
        fi

        # Parse privacy-defaults.conf and split entries:
        #   - keys containing '.'  → build.prop system properties
        #   - keys without '.'     → Android Settings.Global (runtime applicator)
        SETTINGS_GLOBAL_OUT="system/extras/lethe/settings-global.conf"
        mkdir -p "$(dirname "$SETTINGS_GLOBAL_OUT")"
        : > "$SETTINGS_GLOBAL_OUT"
        sg_count=0
        sp_count=0
        while IFS= read -r line || [ -n "$line" ]; do
            stripped="${line%%#*}"
            stripped="${stripped#"${stripped%%[![:space:]]*}"}"
            stripped="${stripped%"${stripped##*[![:space:]]}"}"
            [ -z "$stripped" ] && continue
            case "$stripped" in *=*) ;; *) continue ;; esac
            key="${stripped%%=*}"
            val="${stripped#*=}"
            key="${key%"${key##*[![:space:]]}"}"
            [ -z "$key" ] && continue
            case "$key" in
                *.*)
                    printf 'PRODUCT_PROPERTY_OVERRIDES += %s=%s\n' \
                        "$key" "$val" >> "$PROPS_TARGET"
                    sp_count=$((sp_count + 1))
                    ;;
                *)
                    printf '%s=%s\n' "$key" "$val" >> "$SETTINGS_GLOBAL_OUT"
                    sg_count=$((sg_count + 1))
                    ;;
            esac
        done < "$OVERLAY_DIR/privacy-defaults.conf"
        echo "  -> $sp_count system properties applied to $PROPS_TARGET."

        if [ "$sg_count" -gt 0 ]; then
            chmod 755 "$SCRIPT_DIR/scripts/runtime/lethe-apply-settings.sh"
            add_to_system "$SCRIPT_DIR/scripts/runtime/lethe-apply-settings.sh" "system/bin/lethe-apply-settings.sh"
            add_to_system "$INITRC_DIR/init.lethe-settings.rc" "system/etc/init/init.lethe-settings.rc"
            add_to_system "$SETTINGS_GLOBAL_OUT" "system/extras/lethe/settings-global.conf"
            echo "  -> $sg_count Settings.Global keys staged for first-boot applicator."
        else
            rm -f "$SETTINGS_GLOBAL_OUT"
        fi
    else
        echo "  -> WARNING: $PROPS_TARGET not found; privacy properties not applied."
    fi
fi

# ── 2. Hosts file (tracker blocking) ──
if [ -f "$OVERLAY_DIR/hosts" ]; then
    echo "[2/17] Installing tracker-blocking hosts file..."
    HOSTS_TARGET="system/core/rootdir/etc/hosts"
    if [ -d "system/core/rootdir/etc" ]; then
        cp "$OVERLAY_DIR/hosts" "$HOSTS_TARGET"
        echo "  -> Hosts file installed."
    else
        echo "  -> WARNING: system/core/rootdir/etc not found, skipping hosts."
    fi
fi

# ── 3. Firewall rules ──
if [ -f "$OVERLAY_DIR/firewall-rules.conf" ]; then
    echo "[3/17] Installing default firewall rules..."
    add_to_system "$OVERLAY_DIR/firewall-rules.conf" "system/extras/lethe/firewall-rules.conf"
    echo "  -> Firewall rules installed."
fi

# ── 4. Burner mode ──
if [ -f "$OVERLAY_DIR/burner-mode.conf" ]; then
    echo "[4/17] Installing burner mode configuration..."
    RUNTIME_DIR="$SCRIPT_DIR/scripts/runtime"
    chmod 755 "$RUNTIME_DIR/lethe-burner-wipe.sh" "$RUNTIME_DIR/lethe-mac-rotate.sh"
    add_to_system "$OVERLAY_DIR/burner-mode.conf"           "system/extras/lethe/burner-mode.conf"
    add_to_system "$RUNTIME_DIR/lethe-burner-wipe.sh"       "system/bin/lethe-burner-wipe.sh"
    add_to_system "$RUNTIME_DIR/lethe-mac-rotate.sh"        "system/bin/lethe-mac-rotate.sh"
    install_initrc init.lethe-burner.rc burner
    echo "  -> Burner mode config installed."
fi

# ── 5. Dead man's switch ──
# Deferred to v1.1: DMS needs full state-machine validation that did not fit
# in the v1.0 window. Configuration files and scripts exist in the repo but
# are not packaged into the v1.0 system image.
echo "[5/17] Dead man's switch — deferred to v1.1, not packaged."

# ── 6. Debloat — remove Google and analytics packages from build ──
echo "[6/17] Applying debloat list..."
DEBLOAT_PACKAGES=(
    "packages/apps/GoogleContactsSyncAdapter"
    "packages/apps/GoogleCalendarSyncAdapter"
    "vendor/google"
    "vendor/gms"
    "packages/apps/Browser2"
)

for pkg in "${DEBLOAT_PACKAGES[@]}"; do
    if [ -d "$pkg" ]; then
        echo "  -> Removing: $pkg"
        rm -rf "$pkg"
    fi
done

# WebView workaround. Two-part fix because the chromium-webview prebuilts
# (the apk + libwebviewchromium.so) aren't synced — LFS blobs missing — but
# LineageOS 14.1's core_minimal.mk still declares the feature, and worse,
# system_server's PathClassLoaderFactory hardcodes a reference to
# libwebviewchromium_plat_support.so during classloader namespace setup.
# Without that lib, system_server crashes with UnsatisfiedLinkError on every
# zygote fork, in a tight loop. The plat_support lib is `LOCAL_MODULE_TAGS :=
# optional` so it only builds when webview.apk pulls it in via REQUIRED_MODULES
# — which doesn't happen because webview.apk itself can't build. We need both:
#   (a) strip the feature decl so PM doesn't think WebView is available, and
#   (b) explicitly request the loader/plat_support libs so they build from
#       source (frameworks/webview/chromium/Android.mk) and land in /system/lib
#       to satisfy the namespace setup. (a) without (b) is insufficient — the
#       linker references the lib regardless of feature decl.
# Both are idempotent.
CORE_MINIMAL="build/target/product/core_minimal.mk"
if [ -f "$CORE_MINIMAL" ] && grep -q 'android.software.webview.xml' "$CORE_MINIMAL"; then
    echo "  -> Stripping android.software.webview.xml from $CORE_MINIMAL"
    sed -i '\|android.software.webview.xml|d' "$CORE_MINIMAL"
fi
WEBVIEW_LIBS_LINE="PRODUCT_PACKAGES += libwebviewchromium_plat_support libwebviewchromium_loader"
if [ -n "$PROPS_TARGET" ] && [ -f "$PROPS_TARGET" ] && ! grep -qF "$WEBVIEW_LIBS_LINE" "$PROPS_TARGET"; then
    echo "  -> Adding webview namespace-stub libs to $PROPS_TARGET"
    {
        echo ""
        echo "# Lethe webview-stub: build the plat_support + loader libs from source"
        echo "# (frameworks/webview/chromium) so system_server's classloader"
        echo "# namespace setup succeeds even without the chromium-webview prebuilts."
        echo "$WEBVIEW_LIBS_LINE"
    } >> "$PROPS_TARGET"
fi

echo "  -> Debloat complete."

# ── 7. Boot animation ──
echo "[7/17] Installing boot animation..."
BOOTANIM_ZIP="$SCRIPT_DIR/bootanimation/bootanimation.zip"
if [ ! -f "$BOOTANIM_ZIP" ]; then
    GENERATOR="$SCRIPT_DIR/bootanimation/generate-bootanimation.py"
    if [ -f "$GENERATOR" ] && command -v python3 >/dev/null 2>&1; then
        echo "  -> Generating boot animation from lockscreen..."
        python3 "$GENERATOR" || echo "  -> WARNING: boot animation generation failed."
    fi
fi
if [ -f "$BOOTANIM_ZIP" ]; then
    add_to_system "$BOOTANIM_ZIP" "system/media/bootanimation.zip"
    echo "  -> Boot animation installed."
else
    echo "  -> WARNING: bootanimation.zip not available, skipping."
fi

# ── 8. Theme assets (wallpaper, lockscreen) ──
# v1.0 keeps the LineageOS default launcher (Trebuchet) — Void launcher
# ships in v1.1. Removing Trebuchet without an alternative left the
# system with no Home activity, which crash-loops zygote on boot.
echo "[8/17] Installing theme assets..."
WALLPAPER_GEN="$SCRIPT_DIR/bootanimation/generate-wallpaper.py"
if [ -f "$WALLPAPER_GEN" ] && command -v python3 >/dev/null 2>&1; then
    echo "  -> Generating minimalist wallpapers..."
    python3 "$WALLPAPER_GEN" 2>&1 || echo "  -> WARNING: wallpaper generation failed, using existing."
fi
[ -f "$OVERLAY_DIR/wallpaper.png" ]  && add_to_system "$OVERLAY_DIR/wallpaper.png"  "system/media/wallpaper.png"
[ -f "$OVERLAY_DIR/lockscreen.png" ] && add_to_system "$OVERLAY_DIR/lockscreen.png" "system/media/lockscreen.png"
echo "  -> Theme assets registered."

# ── 9. Tor transparent proxy ──
if [ -f "$OVERLAY_DIR/tor.conf" ]; then
    echo "[9/17] Installing Tor transparent proxy..."
    RUNTIME_DIR="$SCRIPT_DIR/scripts/runtime"
    chmod 755 "$RUNTIME_DIR/lethe-tor-rules.sh"
    chmod 755 "$RUNTIME_DIR/lethe-tor-pt-select.sh"
    add_to_system "$OVERLAY_DIR/tor.conf"             "system/etc/tor/torrc"
    add_to_system "$RUNTIME_DIR/lethe-tor-rules.sh"   "system/bin/lethe-tor-rules.sh"
    # PT selector (lethe#108) — reads persist.lethe.tor.bridge_pt and writes
    # /data/lethe/tor/torrc.bridges before tor starts.
    add_to_system "$RUNTIME_DIR/lethe-tor-pt-select.sh" "system/bin/lethe-tor-pt-select.sh"
    install_initrc init.lethe-tor.rc Tor
    TOR_BINARY="$SCRIPT_DIR/prebuilt/tor/$PREBUILT_ARCH/tor"
    if [ -f "$TOR_BINARY" ]; then
        chmod 755 "$TOR_BINARY"
        add_to_system "$TOR_BINARY" "system/bin/tor"
        echo "  -> Tor binary installed ($PREBUILT_ARCH)."
    else
        echo "  -> WARNING: Tor binary not found at $TOR_BINARY"
        echo "     Extract from Tor Browser APK: lib/<abi>/libTor.so"
    fi
    echo "  -> Tor overlay installed."
fi

# ── 10. IPFS OTA update service ──
# Deferred to v1.1: IPFS binary integration + signed-manifest pipeline did
# not fit in v1.0. Configuration files exist in the repo; no artifacts
# are packaged into the v1.0 system image.
echo "[10/17] IPFS OTA — deferred to v1.1, not packaged."

# ── 11. LETHE agent (system app + init services) ──
# v1.2 Java system app (AutoWipePolicy, LetheDeviceAdmin, panic-press, DMS,
# share-scrubber). Device Owner promotion runs from BootReceiver via
# AutoWipePolicy.ensureDeviceOwner (no dpm shell-out, see #145). Rust
# agent backend (bender/) is NOT bundled; lethe-agent-start.sh idles
# harmlessly if absent so init.lethe-agent.rc can ship as-is.
echo "[11/17] Installing LETHE system app and init services..."
LETHE_APP_SRC="$SCRIPT_DIR/java"
LETHE_APP_DEST="packages/apps/Lethe"
LETHE_ICON_SRC="$OVERLAY_DIR/launcher-icon"
if [ ! -d "$LETHE_APP_SRC/org/osmosis/lethe" ] || [ ! -f "$SCRIPT_DIR/AndroidManifest.xml" ]; then
    echo "  -> ERROR: java/ sources or AndroidManifest.xml missing" >&2; exit 1
fi
# Idempotent re-runs — don't accumulate stale staged files.
rm -rf "$LETHE_APP_DEST"
mkdir -p "$LETHE_APP_DEST/java/org/osmosis/lethe" "$LETHE_APP_DEST/res/xml"
cp "$LETHE_APP_SRC/org/osmosis/lethe"/*.java "$LETHE_APP_DEST/java/org/osmosis/lethe/"
cp "$SCRIPT_DIR/AndroidManifest.xml"                       "$LETHE_APP_DEST/AndroidManifest.xml"
cp "$LETHE_APP_SRC/org/osmosis/lethe/res/xml/device_admin.xml" "$LETHE_APP_DEST/res/xml/device_admin.xml"

# Strip API-29+/31+ manifest attrs on cm-14.1 (API 25 AAPT rejects unknowns):
#   usesPermissionFlags="neverForLocation"  → API 31
#   foregroundServiceType="connectedDevice" → API 29
# Both are runtime metadata; their absence on Android 7.1 is harmless because
# the platform doesn't honor them anyway. Modern LOS builds keep the manifest
# unchanged. PROPS_TARGET path distinguishes the two LOS generations.
case "$PROPS_TARGET" in
    *vendor/cm/*)
        sed -i -e 's| *android:usesPermissionFlags="[^"]*"||g' \
               -e 's| *android:foregroundServiceType="[^"]*"||g' \
               "$LETHE_APP_DEST/AndroidManifest.xml"
        echo "  -> Stripped post-API-25 manifest attrs (cm-14.1 target)."
        ;;
esac

# Launcher icon. Mirror the wallpaper pattern (step 8): regenerate if PIL is
# available, otherwise fall back to the committed PNGs. cm-14.1 docker has
# no python3-pil, so regeneration is opportunistic, not required.
if [ -f "$OVERLAY_DIR/mascot.png" ] && command -v python3 >/dev/null 2>&1; then
    python3 "$SCRIPT_DIR/scripts/generate-ic-lethe.py" "$OVERLAY_DIR/mascot.png" "$LETHE_ICON_SRC" 2>&1 \
        || echo "  -> WARNING: icon regeneration failed, using committed assets."
fi
if ! ls "$LETHE_ICON_SRC"/mipmap-*/ic_lethe.png >/dev/null 2>&1; then
    echo "  -> ERROR: no launcher icons at $LETHE_ICON_SRC; AAPT will fail" >&2; exit 1
fi
for d in "$LETHE_ICON_SRC"/mipmap-*; do
    mkdir -p "$LETHE_APP_DEST/res/$(basename "$d")"
    cp "$d/ic_lethe.png" "$LETHE_APP_DEST/res/$(basename "$d")/ic_lethe.png"
done

# LOCAL_PRIVATE_PLATFORM_APIS: silently ignored on cm-14.1 / Android 7.1
# (omitting LOCAL_SDK_VERSION is enough); required on Android 9+ to keep
# DPM hidden methods + sharedUserId=android.uid.system reachable.
cat > "$LETHE_APP_DEST/Android.mk" <<'LETHE_MK'
LOCAL_PATH := $(call my-dir)
include $(CLEAR_VARS)
LOCAL_MODULE_TAGS := optional
LOCAL_PACKAGE_NAME := Lethe
LOCAL_CERTIFICATE := platform
LOCAL_PRIVILEGED_MODULE := true
LOCAL_PRIVATE_PLATFORM_APIS := true
LOCAL_SRC_FILES := $(call all-java-files-under, java)
LOCAL_RESOURCE_DIR := $(LOCAL_PATH)/res
LOCAL_MANIFEST_FILE := AndroidManifest.xml

# telephony-common: SmsManager (LethePhone.sendSms) lives here on cm-14.1.
# Harmless on modern AOSP where the class moved back into framework.jar.
LOCAL_JAVA_LIBRARIES := telephony-common
LOCAL_PROGUARD_ENABLED := disabled
LOCAL_DEX_PREOPT := false
include $(BUILD_PACKAGE)
LETHE_MK

LETHE_PACKAGE_LINE="PRODUCT_PACKAGES += Lethe"
if [ -n "$PROPS_TARGET" ] && ! grep -qF "$LETHE_PACKAGE_LINE" "$PROPS_TARGET" 2>/dev/null; then
    printf '\n# Lethe system app (org.osmosis.lethe.agent) — v1.2 Auto-Wipe Policy.\n%s\n' \
        "$LETHE_PACKAGE_LINE" >> "$PROPS_TARGET"
fi
echo "  -> System app staged at $LETHE_APP_DEST."

chmod 755 "$SCRIPT_DIR/scripts/runtime/lethe-agent-start.sh"
add_to_system "$SCRIPT_DIR/scripts/runtime/lethe-agent-start.sh" "system/bin/lethe-agent-start.sh"
install_initrc init.lethe-agent.rc agent
echo "  -> LETHE agent packaging complete."

# ── 12. SELinux policy ──
# v1.1: tor.te + lethe.te + file_contexts ship active. The lethe domain
# covers the 5 LETHE userspace scripts (burner-wipe, mac-rotate, tor-rules,
# tor-pt-select, apply-settings) — two-domain split per sepolicy/lethe.te
# header. The deferred-service rules (agent, ipfs, p2p, dead-man) in
# lethe.te.disabled-in-v1.0 are NOT re-enabled here; they come with those
# services when each ships.
echo "[12/17] Installing SELinux policy (Tor + LETHE userspace)..."
bash "$SCRIPT_DIR/scripts/install-sepolicy.sh" "$SCRIPT_DIR/sepolicy" "$CODENAME"

# ── 13. Build fingerprint ──
echo "[13/17] Setting Lethe build fingerprint..."
# Detect per-device base version from manifest (default: 21.0)
MANIFEST="$SCRIPT_DIR/manifest.yaml"
BASE_VERSION="21.0"
if [ -n "$CODENAME" ] && [ -f "$MANIFEST" ]; then
    # Check if codename has a per-device override (YAML object form)
    DEVICE_VERSION=$(grep -A3 "codename: $CODENAME" "$MANIFEST" 2>/dev/null | grep "base_version:" | head -1 | sed 's/.*base_version:[[:space:]]*"\{0,1\}\([^"]*\)"\{0,1\}/\1/')
    if [ -n "$DEVICE_VERSION" ]; then
        BASE_VERSION="$DEVICE_VERSION"
        echo "  -> Per-device base override: lineage-$BASE_VERSION"
    fi
fi
BUILD_DESC="lethe/lineage-$BASE_VERSION"
if [ -n "$CODENAME" ]; then
    BUILD_DESC="lethe/$CODENAME/lineage-$BASE_VERSION"
fi
export LETHE_BUILD_DESC="$BUILD_DESC"
echo "  -> Build: $BUILD_DESC"

# ── 14-16. Decentralized config channels / libp2p / EdgeVPN cluster ──
# All deferred to v1.1. Each needs a non-trivial native binary + Android.mk
# glue + validation that did not fit in v1.0. Configuration files exist
# in the repo; no artifacts are packaged into the v1.0 system image.
echo "[14/17] Decentralized channels — deferred to v1.1, not packaged."
echo "[15/17] libp2p peer inference — deferred to v1.1, not packaged."
echo "[16/17] EdgeVPN cluster — deferred to v1.1, not packaged."

# ── Field build: strip cloud providers from the agent UI (issue #95) ──
# When LETHE_FIELD_BUILD=1, post-process the static/ tree so the field-build
# APK has no anthropic/openrouter strings, endpoints, or wizard cards.
# Idempotent — re-running on an already-stripped tree is a no-op.
# Today static/ isn't packaged into the v1.0 image (LETHE agent is deferred
# to v1.1); the strip runs against the source tree so the v1.1 packaging
# step picks up the field-build version automatically.
if [ "${LETHE_FIELD_BUILD:-0}" = "1" ]; then
    echo "[field-build] LETHE_FIELD_BUILD=1 — stripping cloud providers from static/"
    if [ -d "$SCRIPT_DIR/static" ]; then
        if python3 "$SCRIPT_DIR/scripts/apply-field-build.py" "$SCRIPT_DIR/static"; then
            echo "  -> Static UI stripped clean."
        else
            echo "  -> ERROR: field-build strip failed verification" >&2
            exit 1
        fi
    else
        echo "  -> WARNING: $SCRIPT_DIR/static not found, skipping strip."
    fi
fi

echo "[17/17] Overlay summary..."
echo "  Overlays installed:"
for f in "$OVERLAY_DIR"/*; do
    [ -f "$f" ] && echo "    - $(basename "$f")"
done

echo ""
echo "=== Lethe overlays applied successfully ==="
