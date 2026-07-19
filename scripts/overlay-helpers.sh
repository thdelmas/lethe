#!/usr/bin/env bash
# Lethe — helper functions sourced by apply-overlays.sh.
#
# Kept in a separate module so apply-overlays.sh stays under the repo's
# 500-line limit. These functions read the same globals the main script
# sets ($PROPS_TARGET, $INITRC_DIR) — bash resolves them at call time, so
# this file may be sourced before those are assigned.

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

# Modern-tree debloat guards (no-op on cm-14.1). Two Treble/Soong behaviours
# that cm-14.1 predates and that break the build if unhandled:
#   1. PRODUCT_PACKAGES is parse-time validated — deleting an app's source
#      dir is a hard error while a product config still names it. Browser2
#      comes from AOSP handheld_product.mk; strip the entry, don't delete.
#   2. generic_system.mk artifact-path enforcement hard-errors on any
#      /system file not on its allowlist. Every LETHE artifact needs a
#      PRODUCT_ARTIFACT_PATH_REQUIREMENT_ALLOWED_LIST glob (% is make's
#      filter wildcard).
# Arg: <props_target>
lethe_modern_debloat_guards() {
    local props_target="$1"
    [ "$props_target" = "vendor/lineage/config/common.mk" ] || return 0

    local handheld_mk="build/make/target/product/handheld_product.mk"
    if [ -f "$handheld_mk" ] && grep -qE '^\s*Browser2\s*\\?\s*$' "$handheld_mk"; then
        sed -i -E '/^\s*Browser2\s*\\?\s*$/d' "$handheld_mk"
        echo "  -> Stripped Browser2 from handheld_product.mk (modern debloat)."
    fi

    if ! grep -qF "LETHE artifact-path allowlist" "$props_target"; then
        cat >> "$props_target" <<'LETHE_APR'

# LETHE artifact-path allowlist — staged files + system app.
PRODUCT_ARTIFACT_PATH_REQUIREMENT_ALLOWED_LIST += \
    system/bin/lethe-% \
    system/bin/tor \
    system/etc/init/init.lethe% \
    system/etc/tor/% \
    system/extras/lethe/% \
    system/media/bootanimation.zip \
    system/media/lockscreen.png \
    system/media/wallpaper.png \
    system/priv-app/Lethe/% \
    system/etc/permissions/privapp-permissions-org.osmosis.lethe.agent.xml
LETHE_APR
        echo "  -> LETHE artifact-path allowlist appended."
    fi
}

# Modern-tree board-config fixups (no-op on cm-14.1). Android 15 hard-errors
# on ELF prebuilts shipped through PRODUCT_COPY_FILES (it wants
# cc_prebuilt_binary). LETHE ships two that way — system/bin/tor and the
# bundled system/extras/lethe/agent/lethe-agent — so set the legacy escape
# hatch in the device's Lineage board config, which is in the board-config
# include chain. cm-14.1 predates the check. Tech debt: the "correct" fix is
# per-binary cc_prebuilt_binary modules with check_elf_files handling.
# Args: <props_target> <codename>
lethe_modern_board_fixups() {
    local props_target="$1"
    local codename="$2"
    [ "$props_target" = "vendor/lineage/config/common.mk" ] || return 0
    [ -n "$codename" ] || return 0

    local bc
    bc=$(ls device/*/"$codename"/BoardConfigLineage.mk 2>/dev/null | head -1)
    [ -n "$bc" ] || bc=$(ls device/*/"$codename"/BoardConfig.mk 2>/dev/null | head -1)
    if [ -n "$bc" ] && ! grep -q "BUILD_BROKEN_ELF_PREBUILT_PRODUCT_COPY_FILES" "$bc"; then
        cat >> "$bc" <<'LETHE_BROKEN'

# LETHE: tor + lethe-agent ship as ELF prebuilts via PRODUCT_COPY_FILES.
# Android 15 errors on that (wants cc_prebuilt_binary); this legacy escape
# hatch keeps the copy path working. See docs/release/bramble-modern-port-notes.md.
BUILD_BROKEN_ELF_PREBUILT_PRODUCT_COPY_FILES := true
LETHE_BROKEN
        echo "  -> BUILD_BROKEN_ELF_PREBUILT_PRODUCT_COPY_FILES set in $bc."
    fi
}

# Generate the LETHE system-app build file, LOS-generation-aware:
#   cm-14.1  → Android.mk (Soong can't build API-25 apps)
#   modern   → Android.bp (Android 15 denylists Android.mk under
#              packages/apps/ — androidmk_denylist.go — so an .mk there is
#              silently ignored and PRODUCT_PACKAGES += Lethe then fails)
# LOCAL_PRIVATE_PLATFORM_APIS / platform_apis: silently ignored on cm-14.1
# / Android 7.1 (omitting LOCAL_SDK_VERSION is enough); required on
# Android 9+ to keep DPM hidden methods + sharedUserId reachable.
# Args: <props_target> <app_dest>
lethe_generate_app_buildfile() {
    local props_target="$1"
    local app_dest="$2"
    case "$props_target" in
        *vendor/cm/*)
            cat > "$app_dest/Android.mk" <<'LETHE_MK'
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
# zxing-core: see docs/security/journalist-audit/168-pair-scan-spike.md.
LOCAL_STATIC_JAVA_LIBRARIES := zxing-core
LOCAL_PROGUARD_ENABLED := disabled
LOCAL_DEX_PREOPT := false
include $(BUILD_PACKAGE)
LETHE_MK
            echo "  -> Android.mk generated (cm-14.1 target)."
            ;;
        *)
            cat > "$app_dest/Android.bp" <<'LETHE_BP'
android_app {
    name: "Lethe",
    srcs: ["java/**/*.java"],
    resource_dirs: ["res"],
    manifest: "AndroidManifest.xml",
    certificate: "platform",
    privileged: true,
    platform_apis: true,
    // telephony-common: SmsManager import kept for cm-14.1 parity.
    libs: ["telephony-common"],
    // zxing-core: docs/security/journalist-audit/168-pair-scan-spike.md.
    static_libs: ["zxing-core"],
    optimize: {
        enabled: false,
    },
    dex_preopt: {
        enabled: false,
    },
    // Privileged-permission allowlist. Without it, ro.control_privapp_
    // permissions=enforce makes PackageManagerService abort boot (the app
    // requests REBOOT + WRITE_SECURE_SETTINGS, both signature|privileged),
    // which crash-loops system_server on every boot.
    required: ["privapp-permissions-org.osmosis.lethe.agent.xml"],
}

prebuilt_etc {
    name: "privapp-permissions-org.osmosis.lethe.agent.xml",
    src: "privapp-permissions-org.osmosis.lethe.agent.xml",
    sub_dir: "permissions",
}
LETHE_BP
            echo "  -> Android.bp generated (Soong / modern LOS target)."
            ;;
    esac
}
