#!/system/bin/sh
# Lethe dead man's switch — duress PIN handler.
# Silently wipes all user data when duress PIN is entered.
# Installed to /system/bin/ at build time.

log -t lethe-deadman "DURESS PIN — silent wipe"
rm -rf /data/app /data/data /data/user /data/user_de
rm -rf /data/misc/wifi /data/misc/bluedroid
rm -rf /data/media/0/*
setprop persist.lethe.deadman.duress_triggered false
log -t lethe-deadman "Duress wipe complete"
