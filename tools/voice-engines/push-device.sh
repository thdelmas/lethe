#!/usr/bin/env bash
# Sideload voice engines + models to /data/local/tmp/lethe-voice and
# print the env exports for a sideloaded (shell-user) agent daemon.
set -euo pipefail

cd "$(dirname "$0")"
DEST=/data/local/tmp/lethe-voice

[[ -x dist/android/whisper-cli ]] || { echo "run build-android.sh first" >&2; exit 1; }
[[ -s models/ggml-tiny.bin ]] || { echo "run fetch-models.sh first" >&2; exit 1; }

adb shell mkdir -p "$DEST/piper"
adb push dist/android/whisper-cli "$DEST/whisper-cli"
adb shell chmod 755 "$DEST/whisper-cli"
adb push models/ggml-tiny.bin "$DEST/ggml-tiny.bin"
for f in models/piper/*.onnx models/piper/*.onnx.json; do
    adb push "$f" "$DEST/piper/$(basename "$f")"
done

echo
echo "Pushed. Launch the sideloaded daemon with:"
echo "  LETHE_WHISPER_BIN=$DEST/whisper-cli \\"
echo "  LETHE_WHISPER_MODEL=$DEST/ggml-tiny.bin \\"
echo "  LETHE_PIPER_MODEL=$DEST/piper/en_US-amy-medium.onnx \\"
echo "  /data/local/tmp/lethe-agent"
echo
echo "NOTE: no piper binary is pushed yet (Android piper build is an"
echo "open item — sherpa-onnx is the planned on-device TTS). Until"
echo "then, spoken replies work only via the host-brain loop."
