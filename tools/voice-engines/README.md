# voice-engines — STT/TTS engine kit for the agent core

The core's audio routes (`agent/src/routes/audio.rs`) shell out to
engines it does **not** ship: STT = sherpa-onnx → whisper.cpp, TTS =
piper → sherpa-onnx-offline-tts. This kit builds the binaries, fetches
the models, and sideloads both to a device — the missing half of
docs/design/voice-io.md V0.

## Scripts

| Script | What |
|---|---|
| `fetch-models.sh` | whisper ggml-tiny + piper voices (en/es/fr) → `models/` |
| `build-host.sh` | whisper-cli for this machine + piper via pip → `dist/host/` |
| `build-android.sh` | whisper-cli for arm64-v8a via the NDK → `dist/android/` |
| `push-device.sh` | adb-push binaries+models to `/data/local/tmp/lethe-voice`, print the env exports for the sideloaded daemon |

Everything lands under this directory (`work/`, `models/`, `dist/` —
all gitignored). Nothing here ships in an image; packaging engines
into `/system/extras/lethe/bin` is a later, deliberate step.

## Two test loops

**On-device (diag build):** `fetch-models.sh` → `build-android.sh` →
`push-device.sh`, then run the sideloaded daemon with the printed
`LETHE_*` exports. The app talks to `127.0.0.1:8080` as always.

**Host brain (no working daemon on device):** `fetch-models.sh` →
`build-host.sh`, run the agent core on this machine with the printed
exports, and `adb reverse tcp:8080 tcp:8080` so the app's localhost
reaches it. PoC-only posture — see voice-io.md decision 2.

## Notes

- The default voice is `en_US-amy-medium`; `es_ES-davefx-medium` and
  `fr_FR-siwis-medium` are fetched too — the voice picker (V2) chooses
  among them via the `voice` field of `POST /v1/audio/speech`.
- sherpa-onnx binaries (STT fast path + TTS fallback) are not built
  here yet: their Android build drags in an onnxruntime fetch per
  target. whisper+piper cover V0; add sherpa when latency data says so.
- Engine paths are env-overridable in the core (`LETHE_WHISPER_BIN`,
  `LETHE_WHISPER_MODEL`, `LETHE_PIPER_BIN`, `LETHE_PIPER_MODEL`,
  `LETHE_SHERPA_*`) precisely so these sideloaded paths work without a
  system image rebuild.
