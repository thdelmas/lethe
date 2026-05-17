# ZXing core 3.3.3 prebuilt JAR — spike for #168 (PairScanActivity).
# Module is built only when core-3.3.3.jar is present alongside this
# Android.mk; drop the JAR in before running apply-overlays.sh with
# LETHE_BUILD_PAIR_SCAN_SPIKE=1. See README.md for fetch instructions.
LOCAL_PATH := $(call my-dir)

ifneq ($(wildcard $(LOCAL_PATH)/core-3.3.3.jar),)
include $(CLEAR_VARS)
LOCAL_MODULE := zxing-core
LOCAL_MODULE_TAGS := optional
LOCAL_MODULE_CLASS := JAVA_LIBRARIES
LOCAL_MODULE_SUFFIX := .jar
LOCAL_SRC_FILES := core-3.3.3.jar
LOCAL_UNINSTALLABLE_MODULE := true
include $(BUILD_PREBUILT)
endif
