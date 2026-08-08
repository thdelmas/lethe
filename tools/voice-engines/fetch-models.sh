#!/usr/bin/env bash
# Fetch STT/TTS models for the LETHE voice pipeline (voice-io.md V0).
# Idempotent: skips files that already exist and are non-empty.
set -euo pipefail

cd "$(dirname "$0")"
mkdir -p models/piper

WHISPER_URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin"
PIPER_BASE="https://huggingface.co/rhasspy/piper-voices/resolve/main"
VOICES=(
    "en/en_US/amy/medium/en_US-amy-medium"
    "es/es_ES/davefx/medium/es_ES-davefx-medium"
    "fr/fr_FR/siwis/medium/fr_FR-siwis-medium"
)

fetch() {
    local url="$1" out="$2"
    if [[ -s "$out" ]]; then
        echo "have    $out"
        return
    fi
    echo "fetch   $out"
    curl -fSL --retry 3 -o "$out.part" "$url"
    mv "$out.part" "$out"
}

fetch "$WHISPER_URL" "models/ggml-tiny.bin"

for v in "${VOICES[@]}"; do
    name="$(basename "$v")"
    fetch "$PIPER_BASE/$v.onnx" "models/piper/$name.onnx"
    fetch "$PIPER_BASE/$v.onnx.json" "models/piper/$name.onnx.json"
done

echo
echo "Models ready:"
du -sh models/ggml-tiny.bin models/piper/*.onnx
