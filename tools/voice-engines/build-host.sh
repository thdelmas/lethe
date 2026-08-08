#!/usr/bin/env bash
# Host-side engines for the adb-reverse PoC loop (voice-io.md):
# whisper-cli built natively, piper via pip in a local venv.
# Prints the env exports for running the agent core on this machine.
set -euo pipefail

cd "$(dirname "$0")"
mkdir -p work dist/host

if [[ ! -d work/whisper.cpp ]]; then
    git clone --depth 1 https://github.com/ggml-org/whisper.cpp work/whisper.cpp
fi
cmake -S work/whisper.cpp -B work/build-host \
    -DCMAKE_BUILD_TYPE=Release \
    -DBUILD_SHARED_LIBS=OFF \
    -DWHISPER_BUILD_TESTS=OFF \
    -DWHISPER_BUILD_SERVER=OFF
cmake --build work/build-host -j"$(nproc)" --target whisper-cli
cp work/build-host/bin/whisper-cli dist/host/whisper-cli

if [[ ! -x work/piper-venv/bin/piper ]]; then
    python3 -m venv work/piper-venv
    work/piper-venv/bin/pip install --quiet piper-tts
fi
ln -sf "$(pwd)/work/piper-venv/bin/piper" dist/host/piper

echo
echo "Host engines ready. Run the agent core with:"
echo "  export LETHE_WHISPER_BIN=$(pwd)/dist/host/whisper-cli"
echo "  export LETHE_WHISPER_MODEL=$(pwd)/models/ggml-tiny.bin"
echo "  export LETHE_PIPER_BIN=$(pwd)/dist/host/piper"
echo "  export LETHE_PIPER_MODEL=$(pwd)/models/piper/en_US-amy-medium.onnx"
echo "  cargo run --manifest-path ../../agent/Cargo.toml"
echo "then:  adb reverse tcp:8080 tcp:8080"
