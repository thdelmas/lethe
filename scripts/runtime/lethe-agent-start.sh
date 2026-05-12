#!/system/bin/sh
# Lethe agent launcher — wraps the Rust binary so init can execute it
# under the shell_exec SELinux context.
#
# The agent backend (bender/) is not packaged in every build (notably v1.2,
# which ships the Java system app + Device Owner promotion but no native
# backend). If the binary is missing we idle instead of exiting, because
# init.lethe-agent.rc declares lethe-agent without `oneshot` — exiting would
# fail-loop the service forever.
BIN=/system/extras/lethe/agent/lethe-agent
if [ ! -x "$BIN" ]; then
    log -t lethe-agent "backend not installed at $BIN; idling."
    while :; do
        sleep 86400
    done
fi
exec "$BIN"
