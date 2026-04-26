#!/system/bin/sh
# Lethe — Apply Android Settings.Global keys at first boot.
# Installed to /system/bin/ at build time. Triggered by init.lethe-settings.rc
# on sys.boot_completed=1. Settings.Global keys (e.g. captive_portal_mode)
# live in the Settings provider DB, not build.prop, so they need a runtime
# applicator. Runs once per device — gated on persist.lethe.settings_applied.
set -e

CONF=/system/extras/lethe/settings-global.conf
FLAG=persist.lethe.settings_applied

if [ "$(getprop $FLAG)" = "1" ]; then
    log -t lethe-settings "already applied; skipping"
    exit 0
fi

if [ ! -f "$CONF" ]; then
    log -t lethe-settings "no conf at $CONF; nothing to do"
    exit 0
fi

log -t lethe-settings "applying Settings.Global keys from $CONF"
ok=0
fail=0
while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in ''|\#*) continue ;; esac
    case "$line" in
        *=*)
            key="${line%%=*}"
            val="${line#*=}"
            [ -z "$key" ] && continue
            if settings put global "$key" "$val" 2>/dev/null; then
                ok=$((ok + 1))
            else
                fail=$((fail + 1))
                log -t lethe-settings "failed: $key"
            fi
            ;;
    esac
done < "$CONF"

log -t lethe-settings "applied=$ok failed=$fail"
setprop $FLAG 1
