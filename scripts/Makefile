# scripts/Makefile — consistent ADB protocol for the Lethe device flow.
#
# Run as: make -C scripts <target>   (or: cd scripts && make <target>)
# `make help` lists targets.
#
# Env (with defaults):
#   ADB              adb
#   LETHE_BUILD_DIR  $HOME/Osmosis-downloads/lethe-builds
#   RESIGN_TMP       /tmp/lethe-resign

SHELL := /bin/bash
.SHELLFLAGS := -euo pipefail -c
.ONESHELL:

SCRIPT_DIR := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))
LETHE_DIR  := $(abspath $(SCRIPT_DIR)/..)
LETHE_BUILD_DIR ?= $(HOME)/Osmosis-downloads/lethe-builds
RESIGN_TMP      ?= /tmp/lethe-resign
ADB             ?= adb

# Detect transport: device | recovery | sideload | unauthorized | (empty)
define detect_mode
$$($(ADB) devices | awk 'NR>1 && NF==2 {print $$2; exit}')
endef

.DEFAULT_GOAL := help
.PHONY: help status device-info wipe-data enter-sideload sideload resign \
        sideload-noassert screencap pull-kmsg reboot-system reboot-recovery \
        boot-status wait-boot \
        _adb-up _need-recovery _need-sideload _need-system

help: ## Show this list
	@printf 'scripts/Makefile — Lethe ADB protocol\n\nTargets:\n'
	@awk 'BEGIN{FS=":.*##"} /^[a-z][a-zA-Z_-]*:.*##/ { \
	    printf "  %-22s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

_adb-up:
	@command -v $(ADB) >/dev/null || { echo "adb not in PATH" >&2; exit 1; }
	MODE=$(call detect_mode)
	if [ -z "$$MODE" ]; then echo "no device attached" >&2; $(ADB) devices >&2; exit 1; fi

status: _adb-up ## Print transport mode + key codename props
	@$(ADB) devices
	MODE=$(call detect_mode)
	echo "mode: $$MODE"
	if [ "$$MODE" = "device" ] || [ "$$MODE" = "recovery" ]; then
	    printf "ro.product.device   : %s\n" "$$($(ADB) shell getprop ro.product.device | tr -d '\r')"
	    printf "ro.bootloader       : %s\n" "$$($(ADB) shell getprop ro.bootloader     | tr -d '\r')"
	    printf "ro.product.model    : %s\n" "$$($(ADB) shell getprop ro.product.model  | tr -d '\r')"
	    printf "ro.build.fingerprint: %s\n" "$$($(ADB) shell getprop ro.build.fingerprint | tr -d '\r')"
	fi

device-info: _adb-up ## Dump LETHE-relevant props (booted system or recovery)
	@$(ADB) shell '
	    for p in ro.product.device ro.product.model ro.bootloader \
	             ro.build.product ro.build.display.id ro.build.fingerprint \
	             ro.cm.version ro.lineage.display.version ro.modversion \
	             ro.lethe ro.lethe.version ro.lethe.base \
	             persist.lethe.burner.enabled persist.lethe.bfu.enabled \
	             persist.lethe.bfu.timeout persist.lethe.tor.enabled \
	             init.svc.lethe_burnwipe init.svc.lethe_tor \
	             init.svc.lethe_settings init.svc.lethe_mac_rotate; do
	        v=$$(getprop $$p)
	        [ -n "$$v" ] && printf "%-38s %s\n" "$$p" "$$v"
	    done
	'

_need-recovery: _adb-up
	@MODE=$(call detect_mode)
	if [ "$$MODE" != "recovery" ]; then echo "need TWRP recovery (current: '$$MODE')" >&2; exit 2; fi

_need-sideload: _adb-up
	@MODE=$(call detect_mode)
	if [ "$$MODE" != "sideload" ]; then echo "need TWRP > Advanced > ADB Sideload (current: '$$MODE')" >&2; exit 2; fi

_need-system: _adb-up
	@MODE=$(call detect_mode)
	if [ "$$MODE" != "device" ]; then echo "need booted system (current: '$$MODE')" >&2; exit 2; fi

wipe-data: _need-recovery ## TWRP Format Data via adb (clears /data + packages.xml)
	@$(ADB) shell twrp wipe data
	@echo "Done. Run 'make enter-sideload', then 'make sideload-noassert ZIP=...'."

enter-sideload: _need-recovery ## Switch TWRP into ADB sideload mode (no UI tap)
	@$(ADB) shell twrp sideload
	@sleep 1
	@MODE=$(call detect_mode)
	@echo "mode: $$MODE"

sideload: _need-sideload ## adb sideload ZIP=path (no resign)
	@[ -f "$(ZIP)" ] || { echo "ZIP unset or missing: '$(ZIP)'" >&2; exit 1; }
	@echo "=> $(notdir $(ZIP)) ($$(stat -c %s '$(ZIP)') bytes)"
	@$(ADB) sideload "$(ZIP)"

resign: ## Strip codename assert + re-sign: ZIP=in OUT=out
	@[ -f "$(ZIP)" ] || { echo "ZIP unset or missing: '$(ZIP)'" >&2; exit 1; }
	@[ -n "$(OUT)" ] || { echo "OUT unset" >&2; exit 1; }
	@bash $(SCRIPT_DIR)/lethe-resign.sh "$(ZIP)" "$(OUT)"

sideload-noassert: _need-sideload ## resign + sideload ZIP=... (t03g/t0lte mismatch fix)
	@[ -f "$(ZIP)" ] || { echo "ZIP unset or missing: '$(ZIP)'" >&2; exit 1; }
	@mkdir -p $(RESIGN_TMP)
	OUT=$(RESIGN_TMP)/$(notdir $(basename $(ZIP)))-noassert.zip
	bash $(SCRIPT_DIR)/lethe-resign.sh "$(ZIP)" "$$OUT"
	echo "=> sideload $$OUT"
	$(ADB) sideload "$$OUT"

screencap: _need-system ## Screenshot to OUT=path.png (booted system only)
	@[ -n "$(OUT)" ] || { echo "OUT unset" >&2; exit 1; }
	@mkdir -p "$$(dirname '$(OUT)')"
	@$(ADB) exec-out screencap -p > "$(OUT)"
	@ls -la "$(OUT)"

pull-kmsg: _need-recovery ## Pull /proc/last_kmsg + pstore + sec_log to OUT=dir
	@OUT="$${OUT:-kmsg-$$(date +%Y%m%d-%H%M%S)}"
	mkdir -p "$$OUT"
	for src in /proc/last_kmsg /proc/sec_log /sys/fs/pstore/console-ramoops-0 /sys/fs/pstore/dmesg-ramoops-0; do
	    dest="$$OUT/$$(echo "$$src" | tr / _)"
	    if $(ADB) shell "[ -r '$$src' ]" 2>/dev/null; then
	        $(ADB) shell "cat '$$src'" > "$$dest" 2>/dev/null && \
	            echo "  pulled $$src ($$(stat -c %s "$$dest") bytes)"
	    fi
	done
	ls -la "$$OUT"

reboot-system: _adb-up ## adb reboot (to booted system)
	@$(ADB) reboot

reboot-recovery: _adb-up ## adb reboot recovery
	@$(ADB) reboot recovery

boot-status: ## One-shot: report transport mode + sys.boot_completed
	@MODE=$(call detect_mode)
	echo "mode: $${MODE:-offline}"
	if [ "$$MODE" = "device" ]; then
	    BC=$$($(ADB) shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')
	    BA=$$($(ADB) shell getprop init.svc.bootanim 2>/dev/null | tr -d '\r')
	    printf "sys.boot_completed: %s\n" "$${BC:-(unset)}"
	    printf "init.svc.bootanim:  %s\n" "$${BA:-(unset)}"
	    if [ "$$BC" = "1" ]; then echo "=> BOOT COMPLETE"; else echo "=> still booting (dexopt likely)"; fi
	fi

# Block until adbd is up in 'device' state and sys.boot_completed=1.
# Default timeout 2700s (45 min) — Note II first-boot dexopt is 25-30 min.
wait-boot: ## Block until boot complete (TIMEOUT_SEC=2700 default)
	@TIMEOUT=$${TIMEOUT_SEC:-2700}
	START=$$(date +%s)
	echo "waiting for adbd in 'device' state (timeout $$TIMEOUT s)..."
	if ! timeout $$TIMEOUT $(ADB) wait-for-device 2>/dev/null; then
	    echo "TIMEOUT waiting for adbd" >&2; exit 3
	fi
	# wait-for-device returns on any transport (including recovery if
	# user reboots into TWRP). Verify we're actually in 'device' mode.
	MODE=$(call detect_mode)
	if [ "$$MODE" != "device" ]; then
	    echo "transport up but mode='$$MODE', not 'device'" >&2; exit 4
	fi
	NOW=$$(date +%s); ELAPSED=$$((NOW - START))
	echo "  adbd up after $$ELAPSED s; polling sys.boot_completed..."
	while :; do
	    BC=$$($(ADB) shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')
	    NOW=$$(date +%s); ELAPSED=$$((NOW - START))
	    if [ "$$BC" = "1" ]; then
	        echo "=> BOOT COMPLETE after $$ELAPSED s"
	        exit 0
	    fi
	    if [ $$ELAPSED -gt $$TIMEOUT ]; then
	        echo "TIMEOUT after $$ELAPSED s; sys.boot_completed='$${BC:-unset}'" >&2; exit 3
	    fi
	    printf '  [%4ds] booting (boot_completed=%s)\n' $$ELAPSED "$${BC:-unset}"
	    sleep 15
	done
