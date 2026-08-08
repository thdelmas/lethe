# Voice & text I/O — talking with the phone

State as of 2026-08-08 (V0 built same day — see roadmap). Companion to
[avatar-ui.md](avatar-ui.md) (the doctrine doc — read it first). This
doc covers how the user and the agent exchange words: text, voice, and
eventually calls.

## The frame

Four decisions, taken 2026-08-08:

1. **The interaction model is bidirectional voice — the "Her" model.**
   The user talks to the phone and the phone talks back, full duplex,
   interruptible. Text is the equal sibling, not the fallback.
2. **On-device first, cloud allowed while prototyping.** Every stage
   (STT, brain, TTS) prefers a local engine; a cloud stage is a gated,
   explicit PoC concession, never a silent default — and cloud stages
   are removed, not just disabled, before any enforcing/public build
   (the lethe#96 redaction layer has not been ported).
3. **The chat surface grows toward a messenger, not a terminal.**
   Reference UX: WhatsApp / Claude Android app — one thread holding
   text, voice notes, calls, and later images & documents.
4. **The avatar has an identity the user shapes.** Nickname and chosen
   voice, tamagotchi-adjacent — bounded by the honesty rule below.

## One brain, many transports

`AgentChatClient` → local agent core at `127.0.0.1:8080` stays the
single brain. Voice is a *transport*: STT feeds the same `/api/chat`
history that typing does, TTS reads the same reply stream. No second
conversation state, no voice-only memory.

The split (as built): **capture and playback live in the app**
(`VoiceIo.java` — it holds `RECORD_AUDIO` by user grant; the daemon
never opens the mic); **engines run core-side**
(`agent/src/routes/audio.rs` shells out to them over WAV bytes it is
handed). OpenAI-compatible routes, so any client speaks them:

- `POST /v1/audio/transcriptions` — multipart WAV → `{text}`.
  Engine order: sherpa-onnx → whisper.cpp.
- `POST /v1/audio/speech` — `{input, voice?}` → audio/wav.
  Engine order: piper → sherpa-onnx-offline-tts (sherpa runs piper
  .onnx voices and is the easier Android cross-compile).

Engine binaries/models are **not** packaged in the image yet; paths
default to `/system/extras/lethe/bin` + `/data/lethe/models` and every
one is env-overridable (`LETHE_WHISPER_*`, `LETHE_PIPER_*`,
`LETHE_SHERPA_*`, `LETHE_AUDIO_TMP`) so a sideloaded daemon on the
diag build runs engines from `/data/local/tmp`. Build/fetch/push:
[tools/voice-engines/](../../tools/voice-engines/README.md).

## The pipeline

```
mic → VAD → STT ─→ agent core (/api/chat) ─→ sentence chunker → TTS → speaker
       ▲                                                          │
       └────────────── barge-in: speech while playing ────────────┘
```

| Stage | Local engine | PoC fallback | Gate |
|---|---|---|---|
| VAD | Silero VAD — V1 (calls); V0 is push-to-talk, no VAD | — always local | — |
| STT | sherpa-onnx → whisper.cpp tiny, core-side | host-brain loop (adb reverse) | engine presence + env overrides |
| TTS | piper → sherpa-onnx-tts, core-side | host-brain loop (adb reverse) | engine presence + env overrides |

The PoC "cloud" concession is currently the **host-brain loop**: the
agent core runs on the dev machine with host engines and
`adb reverse tcp:8080 tcp:8080` — self-owned, no third party, and the
app is agnostic to it. Third-party cloud STT/TTS stays unimplemented
until something forces it.

- **Sentence-chunked TTS**: synthesis starts on the first complete
  sentence of the streamed reply, not on `onComplete` — latency to
  first audio is the metric that makes or breaks the Her feel.
- **Barge-in is mandatory, not a refinement.** Mic stays open during
  playback; VAD-detected speech stops TTS and flips the avatar
  speaking → listening. Without it the loop is a walkie-talkie.
- **Power envelope**: whisper tiny/base and Piper are bursty, not
  sustained, loads — but this is bramble, PMIC fault, 15 fps cap.
  Measure a 10-minute call's thermals before tuning model sizes up.

## Surfaces

| Surface | Host | What it does |
|---|---|---|
| Thread | `ChatActivity` | messenger: text + voice notes, later images/docs |
| Call | `MascotActivity` | full-screen avatar, full-duplex voice, "video call where the avatar is the other party's face" |

- **Thread**: hold-to-record voice note → local STT → sent as text into
  the same history (audio kept locally alongside, like any messenger).
  Replies render as text; per-message tap-to-speak via TTS.
- **Call**: the existing behaviour states were built for this —
  listening / thinking / speaking map 1:1 onto pipeline stages, and the
  `session` teal vital already covers "call live". The avatar *is* the
  video side of the call; user-camera-in is out of scope until the
  agent core is multimodal.
- Images & documents in the thread are blocked on agent-core
  multimodality, not on UI — do not build attachment UI ahead of it.

## Mic doctrine

- **Mic open ⇔ listening animation.** No state where audio is captured
  and the avatar does not show listening. This is the audio analogue of
  one-meaning-per-channel and is not tunable.
- **Mic is session-scoped.** Capture exists only inside an open session
  (thread recording or live call). No idle listening, no lock-screen
  mic in any near phase.
- **Wake word comes last and stays local.** The end state — say the
  avatar's nickname to open a session, Her-fully — is an always-on
  on-device keyword spotter, never STT, gated by its own persist prop,
  default off, and lands only after the sepolicy domain rework. The
  vitals rule in avatar-ui.md stands: the *avatar* never holds a
  permission; the mic belongs to the session the user opened.

## Identity — nickname, voice, tamagotchi bounds

- **Nickname**: user names the avatar at setup; stored locally; injected
  into the agent-core system prompt (it answers to the name); becomes
  the wake word in the final phase. Naming it is what makes calling it
  natural — this is one feature wearing three hats.
- **Voice picker**: Piper voice models are the picker, literally — ship
  2–4 voices, expose rate/pitch as knobs. The chosen voice is identity,
  like the stone: pick defaults you can live with.
- **Honesty rule** (extends "the avatar reflects the phone rather than
  being puppeted"): every tamagotchi trait must map to a *real* device
  or relationship state. Battery is hunger, broken tor is illness,
  night is sleep — those exist. Age = time since first boot; growth
  (moss, weathering) = real accumulated use. **No manufactured
  neediness**: nothing decays because you ignored it, nothing begs.
  The avatar is an instrument with a face, not a retention loop.

## Roadmap

| # | Step | Status / depends on |
|---|---|---|
| V0 | Voice notes in thread: hold Rec → STT → text; ▶ tap-to-speak on settled replies | **shipped + verified on bramble 2026-08-08**¹ |
| V1 | Call mode in `MascotActivity`: duplex loop, VAD, barge-in, states bound to pipeline | V0 on-device pass |
| V2 | Identity: nickname + voice picker (piper voices via the `voice` field) + system-prompt injection | V0; agent core alive for the prompt part |
| V3 | Wake word (nickname), mic as vitals input (avatar-ui step 2b), lock-screen voice entry | sepolicy port fix 9 |

¹ V0 as built: `VoiceIo.java` (capture/WAV/STT/TTS/playback, shared
with `VoiceActivity`), Rec button + ▶ glyph in `ChatActivity`, TTS
route in the core, engines via `tools/voice-engines/`.

Measured on bramble, sideloaded daemon as `shell`, `live3d=false`:

- **STT on-device**: a known WAV transcribed **verbatim in 4.3 s**
  (whisper tiny, arm64, 15 s clip). Hold-Rec in a silent room returned
  `[BLANK_AUDIO]` and posted it as a user bubble — the correct answer,
  and proof the whole capture → WAV → POST → send path runs.
- **TTS audible**: playback **witnessed** via `dumpsys audio`
  (`AudioTrack state:started`) — ~1.5 s for a short bubble, 6 s+ for a
  130-char one, so duration tracks text length. Ran through the
  host-brain loop, since no piper binary exists for the device yet.
- **Graceful degradation**: with no TTS engine on-device the ▶ returns
  503, the app logs it and stays alive — zero crashes across the pass.

Open: an on-device TTS binary (sherpa-onnx is the vehicle) and a live
brain — the packaged daemon still restart-loops on sepolicy, and even
the sideloaded one has no LLM provider (`providers.yaml` unpackaged),
so replies currently 502. Neither blocks the voice transport.

## Traps found on device (2026-08-08, bramble)

- **Cleartext to `127.0.0.1` is denied by default** (Android 9+), so
  *every* call to the local core failed — chat, device state and voice
  alike — while the core was serving 200s to `curl`. The surface said
  "I need a thinking core to talk"; the daemon was fine. Fixed with
  `res/xml/network_security_config.xml` (loopback only, base config
  still denies cleartext) + `android:networkSecurityConfig` on
  `<application>`. **The native chat surface had never reached the core
  on a modern build.** Diagnose with
  `adb logcat | grep lethe-voice` — the exception names it exactly.
- **The device ships neither ffmpeg nor sox**, so the STT route's
  converter could never run there. WAV input now bypasses it (the
  native surfaces already send 16 kHz mono PCM); the converter is for
  host/PoC clients posting webm.
- **The status bar overlays the top ~110 px** of the chat surface
  (`Theme.NoTitleBar.Fullscreen`), so `input tap` on a first-row speak
  glyph is swallowed and looks exactly like a dead listener. Test
  glyphs on a lower row.
- **A long reply pushed the ▶ off-screen** — the bubble `TextView` ate
  the full row width. Bubbles are now capped at 76 % of screen width.
- **`live3d=true` + opening `ChatActivity` over the launcher →
  SIGSEGV in `libfilament-jni.so`** within ~15 s, killing the whole
  (persistent) app and taking the chat with it. Reproduced 3×, all on
  the same single-frame `base.apk!libfilament-jni.so (offset
  0x1550000)`. Pre-existing and unrelated to voice — but it makes the
  chat surface unusable at the documented default device state.
  Workaround while it stands: `persist.lethe.mascot.live3d=false`
  (sprite path), under which the whole voice pass ran clean. Needs its
  own investigation.

## Open questions

1. whisper.cpp model size on bramble: tiny-q vs base-q — pick by
   measured latency + thermals, not benchmark tables.
2. Voice-note audio retention: keep forever like a messenger, or
   rolling window? (Storage is real on a 128 GB device full of GLBs.)
3. Does a call get its own vital, or is `session` teal enough? Current
   ruling: `session` is enough — one meaning per channel.
