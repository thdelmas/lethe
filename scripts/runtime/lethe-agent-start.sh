#!/system/bin/sh
# Lethe agent launcher — wraps the Rust binary so init can execute it
# under the shell_exec SELinux context.
exec /system/extras/lethe/agent/lethe-agent
