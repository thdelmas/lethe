#!/usr/bin/env bash
# Cross-compile whisper-cli for arm64-v8a with the Android NDK.
# Output: dist/android/whisper-cli (sideload with push-device.sh).
set -euo pipefail

cd "$(dirname "$0")"

NDK="${ANDROID_NDK_HOME:-$HOME/Android/Sdk/ndk/27.0.12077973}"
TOOLCHAIN="$NDK/build/cmake/android.toolchain.cmake"
if [[ ! -f "$TOOLCHAIN" ]]; then
    echo "No NDK cmake toolchain at $TOOLCHAIN — set ANDROID_NDK_HOME" >&2
    exit 1
fi

mkdir -p work dist/android
if [[ ! -d work/whisper.cpp ]]; then
    git clone --depth 1 https://github.com/ggml-org/whisper.cpp work/whisper.cpp
fi

cmake -S work/whisper.cpp -B work/build-android \
    -DCMAKE_TOOLCHAIN_FILE="$TOOLCHAIN" \
    -DANDROID_ABI=arm64-v8a \
    -DANDROID_PLATFORM=android-28 \
    -DCMAKE_BUILD_TYPE=Release \
    -DBUILD_SHARED_LIBS=OFF \
    -DGGML_OPENMP=OFF \
    -DWHISPER_BUILD_TESTS=OFF \
    -DWHISPER_BUILD_SERVER=OFF
cmake --build work/build-android -j"$(nproc)" --target whisper-cli

cp work/build-android/bin/whisper-cli dist/android/whisper-cli
echo
echo "Built:"
file dist/android/whisper-cli
