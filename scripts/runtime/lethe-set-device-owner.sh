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

# Wait for PackageManager to settle. The init service fires on
# sys.boot_completed=1, but on Note II / Exynos 4412 first-boot after a
# wipe PM keeps enumerating priv-apps for ~30-60s after that. Empirically
# 10s was too short — script bailed before pm path could see Lethe.apk
# even though BootReceiver fired moments later (see #143 verification
# 2026-05-12). 60s is comfortable with slack for slower hardware.
i=0
while [ $i -lt 60 ]; do
    if pm path org.osmosis.lethe.agent >/dev/null 2>&1; then
        break
    fi
    sleep 1
    i=$((i + 1))
done

if ! pm path org.osmosis.lethe.agent >/dev/null 2>&1; then
    log -p e -t "$TAG" "LETHE package not installed after ${i}s; cannot set Device Owner."
    exit 1
fi
log -t "$TAG" "PackageManager found LETHE after ${i}s."

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
