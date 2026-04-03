# Hidden Technological Gems for LETHE

> Research compiled 2026-03-31. Focus: lesser-known, underappreciated
> projects and techniques that fill gaps in LETHE's current stack.

**Priority**: P0 (ship-blocking), P1 (next release), P2 (3-6mo), P3 (long-term).

---

## Sub-Documents

- [gems-ai-inference.md](gems-ai-inference.md) — Model taxonomy (LLM/SLM/VLM/
  MoE/LAM/SAM/LCM/MLM), inference engines, tiny models, speech, vision,
  embeddings, RAG, device-tier stacks
- [gems-privacy-forensics.md](gems-privacy-forensics.md) — Anti-forensics,
  metadata, surveillance, anonymity, traffic resistance, DNS
- [gems-decentralized-mesh.md](gems-decentralized-mesh.md) — P2P storage,
  identity, messaging, mesh networking, DTN, radio, satellites
- [gems-os-hardening.md](gems-os-hardening.md) — Kernel security, verified
  boot, sandboxing, WebView, push, USB, eBPF, Rust, firewalling
- [gems-ux-interaction.md](gems-ux-interaction.md) — Rendering, animation,
  calm tech, voice, haptics, sound design, keyboards, accessibility

---

## Top 15 Highest-Impact Findings

| # | Finding | Priority | Gap Closed |
|---|---|---|---|
| 1 | **FunctionGemma 270M** — 125MB tool-calling model | P0 | Agent can DO things |
| 2 | **Gemma 3n E2B** — multimodal in <2GB RAM | P0 | Shallow-tier AI |
| 3 | **Sherpa-ONNX** — STT+TTS+VAD+emotion, 30MB models | P0 | Voice pipeline |
| 4 | **Auto-reboot to BFU** — encryption keys cleared | P0 | Forensic resistance |
| 5 | **Calm Tech + Mascot-as-dashboard** — body language IS privacy state | P0 | Proactive heartbeat |
| 6 | **SimpleX Chat** — no user identifiers at all | P0 | Messaging gateway |
| 7 | **Iroh + Willow** — IPFS successor, mobile-first, sideloading | P1 | P2P infrastructure |
| 8 | **Arti/Lightarti** — Tor in Rust, 7x less bandwidth | P1 | Battery + efficiency |
| 9 | **AVB custom keys** — verified boot for custom ROM | P1 | Verified boot |
| 10 | **Cromite WebView** — system-wide tracker blocking | P1 | Tracking resistance |
| 11 | **eBPF kernel firewall** — zero-wakeup packet filtering | P1 | Battery + firewall |
| 12 | **BitNet b1.58** — ternary weights, integer-only math | P1 | ARMv7 inference |
| 13 | **Yggdrasil** — cryptographic IPv6 device addressing | P1 | Device reachability |
| 14 | **sqlite-vec** — vector search as SQLite extension | P0 | On-device RAG |
| 15 | **Spritely OCapN** — capability-based permissions | P2 | Plugin security |

---

## Gap Closure Matrix

How findings map to LETHE's critical gaps (from competitive-gaps.md):

### P0: Proactive Heartbeat (Guardian Who Watches)
- Calm Technology principles — framework for non-intrusive alerts
- Mascot-as-dashboard — privacy via body language not pop-ups
- Sherpa-ONNX — unified voice with emotion detection
- openWakeWord — "Hey Lethe" without voice data collection
- Haptic language — feel security without looking
- Tone.js earcons — hear security peripherally
- Compositor-only CSS — always-on mascot at near-zero CPU

### P0: Resource Efficiency (2GB ARMv7)
- FunctionGemma 270M (125MB tool calling)
- Gemma 3n E2B (multimodal in <2GB)
- BitNet b1.58 (ternary = integer-only math on ARMv7)
- MLLM (unlocks idle NPUs on old Snapdragon)
- Sherpa-ONNX (30MB streaming STT)
- NCNN (300KB inference, hand-tuned ARM NEON)
- Tract (pure Rust ONNX, 70us on RPi Zero)
- Arti/Lightarti (Tor in Rust, weekly downloads)
- OGL / CSS 3D (lighter rendering than Three.js)

### P1: App Control (Agent That Acts) — LAM Gap
- FunctionGemma 270M — NL to system API calls (proto-LAM, 85% accuracy)
- LAM (Large Action Model) — formalized name for action-oriented models;
  FunctionGemma is LETHE's current LAM. 85% = 1/7 misfires. Track:
  Gorilla LLM (Berkeley), NexusRaven (Apache 2.0), Google function-call
  Gemma variants, Rabbit R1 architecture (proprietary but informative)
- Moondream 0.5B — screen understanding
- SAM (Segment Anything Model) — segment UI elements for accessibility,
  identify objects through camera. Evaluate MobileSAM/EfficientSAM for
  arm64 deeproot tier. Too heavy for ARMv7.
- Accessibility whitelist — OS-level agent permission
- Android 17 `isAccessibilityTool` framework

### P1: Messaging Gateway (Remote Reach)
- SimpleX Chat — gold standard metadata resistance
- Yggdrasil — permanent cryptographic device address
- xx.network — quantum-resistant metadata shredding
- Posthumous — federated dead man's switch

### P1: Persistent Memory (Mnemosyne)
- sqlite-vec — vector search via SQLite extension
- EmbeddingGemma / all-MiniLM — on-device embeddings
- Iroh + Willow — encrypted P2P sync with sideloading
- Automerge — CRDT documents that merge without conflicts
- GuardianDB — Rust + Iroh + Willow embedded database

### P2: Skills/Plugin Ecosystem
- Spritely OCapN — capability-based permissions for plugins
- Holochain — agent-centric DHT for distributed data
- Droidspaces — sandboxed containers for untrusted skills
- Network namespaces — kernel-enforced isolation per skill

### P2: Visual/Screen Understanding
- SmolVLM 256M — vision in <1GB, 81 tokens per image
- Moondream 0.5B — UI localization (F1: 80.4)
- Gemma 3n E4B — multimodal text+vision+audio

### Forensic Resistance (Cross-Cutting)
- Auto-reboot to BFU — AFU vs BFU = cracked vs inaccessible
- USB data lockout — block extraction tools
- Cellebrite resistance matrix — target Pixel, avoid MediaTek
- Shufflecake — plausible deniability hidden volumes
- LKRG — runtime kernel integrity
- AVB custom keys — verified boot for custom ROM
- mFSTRIM — hardware-level secure deletion
- Kloak — keystroke deanonymization resistance
- F2FS metadata encryption — hide filesystem structure

---

## What Was Already Researched vs What's New

### Previously Covered (in existing docs/research/)
- Tor, I2P, Nym, Veilid — anonymous-routing.md
- IPFS architecture — ipfs.md
- Reticulum, Meshtastic, Magic Wormhole — niche-protocols.md
- IMSI catchers, Haven, ProofMode, PixelKnot — counter-surveillance.md
- Robot archetypes, personality design — pop-culture.md
- GrapheneOS feature bridge — SECURITY-ROADMAP.md
- Competitive gap analysis — competitive-gaps.md
- Gladys Assistant (home automation) — gladys-assistant.md

### New in This Research
**AI/Inference (24 entries + taxonomy)**: Model taxonomy (LLM, SLM, VLM,
MoE, LAM, SAM, LCM, MLM mapping to LETHE stack), MLLM, Cactus,
ExecuTorch, NCNN, llama2.c, Tract, Candle, mistral.rs, FunctionGemma,
Gemma 3n, SmolLM, BitNet, Sherpa-ONNX, Vosk, Piper/NCNN, openWakeWord,
SenseVoice, DaVoice, SmolVLM, Moondream, EmbeddingGemma, sqlite-vec,
ObjectBox, all-MiniLM. LAM watch list: Gorilla LLM, NexusRaven.
SAM watch: MobileSAM, EfficientSAM.

**Privacy/Forensics (16 entries)**: Android AntiForensic Tools, mFSTRIM,
Shufflecake, auto-reboot BFU, Cellebrite intel, mat2, Skewy, Posthumous,
Sarcophagus, LastSignal, Kloak, Katzenpost, Arti, DeTorrent, Protozoa,
dnscrypt-proxy

**Decentralized/P2P (22 entries)**: Iroh, Willow, GuardianDB, Automerge,
Peergos, Spritely OCapN, Polygon ID, Halo2, SimpleX, TinySSB, Cabal,
Nostr, Yggdrasil, Qaul, B.A.T.M.A.N., DTN7, Serval, CoMapeo, LoRa
bridges, Holochain, Obtainium, Accrescent

**OS/Kernel (20 entries)**: LKRG, KSPP, MTE, seccomp, AVB keys,
dm-verity, EroFS, Droidspaces, network namespaces, Work Profile,
Cromite, IronFox, UnifiedPush, USB lockout, eBPF, fanotify, Fyrypt,
F2FS metadata encryption, AOSP Rust, Hypatia

**UX/Interaction (20 entries)**: OGL, TWGL, CSS 3D, FABRIK IK,
springTo.js, Motion, Calm Tech, mascot-as-dashboard, escalation ladder,
Tone.js, Resonance Audio, openWakeWord, DaVoice, haptic language, AOD
mascot, MediaPipe gestures, ZingTouch, Thumb-Key, FUTO Keyboard,
compositor-only animation

**Total: 102 new entries across 5 research areas.**
