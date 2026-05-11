#!/system/bin/sh
# Lethe — promote LetheDeviceAdmin to Device Owner on first boot.
#
# Device Owner is the privilege level that grants:
#   - setMaximumFailedPasswordsForWipe(N)  — iPhone-style failed-unlock wipe
#   - wipeData(flags)                      — works under SELinux enforcing
#     (system_server has the system_data_file neverallow exemption that the
#      lethe domain doesn't; this is what unlocks the v1.2 wipe rework)
#
# Constraint: `dpm set-device-owner` only succeeds while the device has no
# established user accounts. We gate on a one-shot persist property and
# bail if registration already happened.
#
# Installed to /system/bin/ at build time. Invoked from init.lethe-agent.rc
# after sys.boot_completed=1 so PackageManager and the dpm shell tool are up.
set -eu

ADMIN="org.osmosis.lethe.agent/org.osmosis.lethe.LetheDeviceAdmin"
DONE_PROP="persist.lethe.device_owner_set"
TAG="lethe-set-device-owner"

if [ "$(getprop "$DONE_PROP")" = "true" ]; then
    log -t "$TAG" "Device Owner already set; skipping."
    exit 0
fi

# Wait briefly for PackageManager to settle. Repeated polling is cheap;
# the alternative (firing too early) gives "Unknown admin" errors.
for i in 1 2 3 4 5 6 7 8 9 10; do
    if pm path org.osmosis.lethe.agent >/dev/null 2>&1; then
        break
    fi
    sleep 1
done

if ! pm path org.osmosis.lethe.agent >/dev/null 2>&1; then
    log -p e -t "$TAG" "LETHE package not installed; cannot set Device Owner."
    exit 1
fi

# `dpm set-device-owner` exits 0 on success, non-zero with a clear message
# otherwise (e.g. "Not allowed to set the device owner because there are
# already several users on the device"). Capture exit code explicitly —
# piping into `log` would mask dpm's status (mksh on cm-14.1 doesn't
# reliably honor pipefail). Only mark DONE_PROP on success so a future
# boot can retry on transient failure.
OUT=$(dpm set-device-owner "$ADMIN" 2>&1) && RC=0 || RC=$?
echo "$OUT" | log -t "$TAG"
if [ "$RC" -eq 0 ]; then
    setprop "$DONE_PROP" true
    log -t "$TAG" "Device Owner promotion complete."
else
    log -p e -t "$TAG" "Device Owner promotion failed rc=$RC (will retry next boot)."
    exit 2
fi
