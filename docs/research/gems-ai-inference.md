# Hidden Gems: On-Device AI & Inference

> Research compiled 2026-03-31. Part of the hidden-gems series.
> Priority: P0 (ship-blocking), P1 (next release), P2 (3-6mo), P3 (long-term).

Already in LETHE: llama.cpp, Qwen 3, Whisper, eSpeak.

---

## 0. Model Taxonomy — What LETHE Uses and Needs

> Reference: acronyms that appear in AI research and how they map to
> LETHE's architecture. Updated 2026-04-01.

### Already covered by LETHE's stack

| Type | Full Name | LETHE Component | Notes |
|------|-----------|-----------------|-------|
| **LLM** | Large Language Model | Cloud tier: Claude Opus/Sonnet, Qwen 72B, Gemini 2.5 Pro | Text understanding, code, reasoning. Too large for on-device. |
| **SLM** | Small Language Model | Local tier: Qwen 3 0.6B/1.7B, Gemma 3n E2B/E4B | On-device chat, offline privacy tasks. Core to max-hardware goal. |
| **VLM** | Vision-Language Model | SmolVLM 256M (local), Claude/Gemini (cloud) | Screenshot analysis, phishing detection, camera input. |
| **MoE** | Mixture of Experts | Qwen 3 72B, Llama 4 Maverick (via OpenRouter) | Only relevant experts activate per query — saves compute. LETHE benefits passively through provider routing. |

### Relevant — worth tracking or adopting

| Type | Full Name | LETHE Relevance | Status |
|------|-----------|-----------------|--------|
| **LAM** | Large Action Model | **High.** FunctionGemma 270M is LETHE's proto-LAM — translates NL to system API actions. 85% accuracy is the ceiling right now. Track LAM research for better local action models as they shrink. | P1: watch for sub-500M LAMs that beat 85% accuracy |
| **SAM** | Segment Anything Model | **Medium.** Could power accessibility: segment UI elements for screen reading, identify objects through camera. Fits "phone IS LETHE" vision. Heavy for ARMv7 — arm64 deeproot tier only. | P2: evaluate MobileSAM / EfficientSAM for on-device |
| **LCM** | Latent Consistency Model | **Low.** Fast image generation (1-4 diffusion steps). Not core to privacy OS / guardian agent. Possible future use: dynamic avatar rendering. Current APNG pipeline already handles this. | P3: revisit if avatar system needs real-time generation |

### Training techniques (not deployable model types)

| Type | Full Name | Notes |
|------|-----------|-------|
| **MLM** | Masked Language Modeling | Training technique (BERT-style). Not a model you deploy. Relevant only if fine-tuning custom models for LETHE. |

### Key insight: LAM is the biggest gap

FunctionGemma at 85% accuracy means ~1 in 7 system actions could
misfire. As purpose-built LAMs shrink below 500M params with higher
accuracy, swapping into the `tool_calling` routing tier is the
highest-value upgrade. Watch:
- Google's function-calling Gemma variants
- Rabbit R1's LAM approach (proprietary but architecturally informative)
- Gorilla LLM (UC Berkeley) — API call generation, open-source
- NexusRaven — function calling specialist, Apache 2.0

---

## 1. Inference Engines

### MLLM (UbiquitousLearning) — P1
- **URL**: https://github.com/UbiquitousLearning/mllm
- **What**: Multimodal LLM inference for mobile/edge. ARM CPU, OpenCL
  GPU, and Qualcomm QNN NPU in unified runtime. 1000+ tok/s prefilling
  on Qwen1.5-1.8B via NPU offloading. ASPLOS'25 PowerNPU paper: 22x
  faster prefill, 30x energy savings vs CPU.
- **Why**: Only engine with native NPU dispatch on mobile. Old
  Snapdragon 600/800 phones have idle Hexagon DSPs that MLLM can unlock.

### Cactus Compute — P2
- **URL**: https://github.com/cactus-compute/cactus
- **What**: YC S25 on-device inference SDK. Sub-50ms TTFT. Bundles tool
  calling + voice transcription + RAG. Kotlin/Flutter/RN. Free for
  non-profits. 2-bit to FP32 quantization.
- **Why**: "Ollama for smartphones" with built-in tool calling. Unified
  SDK reduces integration surface for LETHE's agent.

### ExecuTorch (Meta) — P2
- **URL**: https://github.com/pytorch/executorch
- **What**: GA Oct 2025. **50KB base footprint.** 12+ hardware backends
  (Qualcomm, ARM, MediaTek, Vulkan). Powers Instagram/WhatsApp on-device
  AI. 41% memory reduction via quantization.
- **Why**: 50KB base is extraordinary. Qualcomm QNN delegate = 20x
  speedup over CPU on Snapdragon devices.

### NCNN (Tencent) — P1
- **URL**: https://github.com/Tencent/ncnn
- **What**: Neural net inference with hand-tuned ARM NEON assembly. Zero
  deps. Library under 300KB. Vulkan GPU. Production in QQ/WeChat on
  billions of low-end phones.
- **Why**: Fastest non-LLM inference on ARM. Critical for Piper TTS.
  Nobody outside the Chinese dev ecosystem talks about this.

### llama2.c (Karpathy) — P2
- **URL**: https://github.com/karpathy/llama2.c
- **What**: Llama inference in 700 lines of C. 15M TinyStories at 110
  tok/s on M1. Targets custom 15M-1B micro-LLMs.
- **Why**: Foundation for custom-trained 15M-100M domain-specific model
  (settings assistant, privacy advisor) on literally any hardware.
  Every line is auditable.

### Tract (Sonos) — P1
- **URL**: https://github.com/sonos/tract
- **What**: Pure Rust ONNX/NNEF inference. Zero C++ deps. ~70us for CNN
  on Raspberry Pi Zero. 85% ONNX backend tests passing.
- **Why**: Pure Rust = clean cross-compilation, memory safety. The ONNX
  runtime for non-LLM models (embeddings, classification, VAD).

### Candle (HuggingFace) — P2
- **URL**: https://github.com/huggingface/candle
- **What**: Minimalist Rust ML framework. Transformers, Whisper, Stable
  Diffusion. CUDA/Metal/CPU. Quantization.
- **Why**: Whisper in pure Rust = STT without Python dependency.

### mistral.rs — P2
- **URL**: https://github.com/EricLBuehler/mistral.rs
- **What**: Rust LLM engine. PagedAttention, speculative decoding,
  multimodal. `mistralrs tune` auto-benchmarks device, picks optimal
  quantization + device mapping.
- **Why**: Hardware-aware auto-tuning is uniquely valuable for LETHE's
  device diversity. No fixed configs needed.

---

## 2. Tiny Language Models

### FunctionGemma 270M — P0
- **URL**: https://huggingface.co/google/functiongemma-270m-it
- **What**: Gemma 3 270M fine-tuned for function/tool calling. NL to
  executable API actions. 85% accuracy (vs 58% base). ~125MB quantized.
- **Why**: **Key to making LETHE's agent DO things.** Fine-tune for
  LETHE actions (toggle Tor, check IPFS, manage permissions).

### Gemma 3n (E4B / E2B) — P0
- **URL**: https://deepmind.google/models/gemma/gemma-3n/
- **What**: Mobile-first multimodal (text + vision + audio). Per-Layer
  Embeddings for radical RAM reduction. 4B active with nested 2B sub.
  **Runs on <2GB RAM.** Designed with Qualcomm/MediaTek/Samsung.
- **Why**: Multimodal in 2GB = unprecedented. Nested submodel trades
  quality for speed dynamically. THIS is the shallow-tier model.

### SmolLM 135M / 360M — P1
- **URL**: https://github.com/huggingface/smollm
- **What**: 135M in GGUF Q4 is ~80-100MB. Apache 2.0.
- **Why**: FunctionGemma (tool calls) + SmolLM (cheap thinking) = two-
  model pipeline under 300MB total.

### BitNet b1.58 / bitnet.cpp — P1 (watch)
- **URL**: https://github.com/microsoft/BitNet
- **What**: 1.58-bit ternary weights (-1, 0, +1). On ARM: 1.37-5.07x
  speedup, 55-70% energy reduction. A 100B model on single CPU at
  human reading speed. 2B model fits ~300-400MB.
- **Why**: **Potentially the most important entry.** Ternary = only
  addition/subtraction, no multiplication. On ARMv7 without NEON FP,
  this is transformative. 2B4T shows competitive quality with FP models.

---

## 3. Speech & Voice

### Sherpa-ONNX — P0
- **URL**: https://github.com/k2-fsa/sherpa-onnx
- **What**: Next-gen Kaldi. STT + TTS + VAD + speaker diarization +
  emotion detection -- all offline. Android, iOS, RPi, RISC-V. 12
  languages. Int8 models for old ARM. Streaming models as small as
  10-30MB.
- **Why**: **Swiss Army knife.** Replaces Whisper AND a separate TTS.
  Int8 on Cortex A7 directly addresses LETHE's max-hardware goal.

### Vosk — P1
- **URL**: https://alphacephei.com/vosk/
- **What**: Offline STT. ~50MB per language. Embedded systems. Streaming.
- **Why**: For ARMv7 where whisper.cpp tiny is too heavy. Lower accuracy
  but dramatically lower latency and RAM.

### Piper (via NCNN on Android) — P1
- **URL**: https://github.com/nihui/ncnn-android-piper
- **What**: Neural TTS (VITS) via NCNN. 35+ languages. 15-60MB voices.
  Active fork at OHF-Voice/piper1-gpl. Also via Sherpa-ONNX TTS.
- **Why**: NCNN = ultra-optimized ARM NEON path.

### openWakeWord — P1
- **URL**: https://github.com/dscripka/openWakeWord
- **What**: Open-source wake word detection. Custom words via synthetic
  speech (Piper TTS). 20+ languages. ONNX. Runs on RPi.
- **Why**: Train "Hey Lethe" with synthetic voices only -- zero user
  voice data even during training. Fully auditable.

### SenseVoice (Alibaba) — P2
- **URL**: https://github.com/FunAudioLLM/SenseVoice
- **What**: ASR + language ID + speech emotion + audio events. Low
  latency. ONNX, runs via sherpa-onnx.
- **Why**: Detect user stress/frustration. Guardian adapts responses.
  All on-device, emotion is a tag not stored audio.

### DaVoice — P2
- **URL**: https://davoice.io
- **What**: On-device wake + VAD + STT + TTS + speaker ID. Zero false
  positives in month-long hospital testing.
- **Why**: Speaker ID authenticates owner by voice without cloud
  biometrics. Model stays on-device.

---

## 4. Vision & Screen Understanding

### SmolVLM 256M / 500M — P2
- **URL**: https://huggingface.co/HuggingFaceTB/SmolVLM-256M-Instruct
- **What**: Smallest VLMs. 256M uses <1GB. Encodes images in 81 tokens
  per 384x384 (vs 16K for Qwen2-VL). Video support. Apache 2.0.
- **Why**: 256M outperforms Idefics-80B (300x larger). Token efficiency
  = screenshots without blowing context. Perfect for phishing detection.

### Moondream 0.5B — P2
- **URL**: https://moondream.ai / https://github.com/vikhyat/moondream
- **What**: 0.5B distilled for edge. MoE with grounded reasoning,
  pointing, counting. ScreenSpot UI localization F1: 80.4.
- **Why**: Understands what's on screen. Critical for agent to interact
  with apps lacking APIs.

---

## 5. Embeddings & RAG

### EmbeddingGemma 300M — P1
- **URL**: https://huggingface.co/google/embeddinggemma-300m
- **What**: 308M params. 100+ languages. Top under-500M on MTEB. <15ms
  per 256 tokens. Flexible output dims (128/256/512/768). <200MB.
- **Why**: Purpose-built for on-device multilingual private embeddings.

### all-MiniLM-L6-v2 — P1
- **URL**: https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2
- **What**: 22M params. 14.7ms per 1K tokens. ~50-80MB.
- **Why**: Runs on ARMv7. For truly old hardware.

### sqlite-vec — P0
- **URL**: https://github.com/asg017/sqlite-vec
- **What**: Vector search as SQLite extension. Pure C, zero deps. Also
  SQLite-Vector (HNSW, 30MB).
- **Why**: SQLite is on every Android. Load an extension = vector DB
  with no new process, minimal attack surface.

### ObjectBox — P2
- **URL**: https://github.com/objectbox/objectbox-java
- **What**: On-device DB with HNSW vector search. Java/Kotlin. 10x
  faster than SQLite CRUD.
- **Why**: Missing piece for on-device RAG. One library for the vector
  DB layer.

---

## 6. Recommended Stack by Tier

### Shallow (<=2GB RAM, ARMv7)

| Function | Component | RAM |
|---|---|---|
| Agent brain | FunctionGemma 270M (Q4) | ~125MB |
| Chat + Vision | Gemma 3n E2B (Q4, multimodal) | ~500MB |
| Chat fallback | Qwen3 0.6B (Q2_K, text-only) | ~300MB |
| STT | Sherpa-ONNX (int8 streaming) | ~30-50MB |
| TTS | eSpeak-NG (fallback) or Piper/NCNN | 2-60MB |
| Embeddings | all-MiniLM-L6-v2 | ~50MB |
| Vector DB | sqlite-vec | ~5MB |
| Inference | NCNN + Tract (Rust) | ~1-5MB |
| **Total** | | **~510-800MB** |

> **Key change:** Gemma 3n E2B brings vision to the shallow tier — users
> can point their camera or share screenshots even on 2GB devices.

### Taproot (3-6GB RAM, mid ARM64)

| Function | Component | RAM |
|---|---|---|
| Agent brain | FunctionGemma 270M (Q4) | ~125MB |
| Chat + Vision | Gemma 3n E4B (Q4, multimodal) | ~1.5GB |
| Chat fallback | Qwen3 1.7B (Q4, text-only) | ~500MB |
| Vision detail | SmolVLM 256M (swap in/out) | ~300MB |
| STT | Sherpa-ONNX (streaming) | ~50MB |
| TTS | Piper/NCNN (medium voice) | ~30-60MB |
| Embeddings | EmbeddingGemma 300M | ~200MB |
| Vector DB | sqlite-vec or ObjectBox | ~5-30MB |
| Inference | MLLM (if Snapdragon) | ~5MB |
| **Total** | | **~1.2-2.8GB** |

> **Key change:** Gemma 3n E4B is the primary model — one model handles
> chat, vision, and reasoning. SmolVLM swaps in for detailed image work.

### Deeproot (>=8GB RAM, flagship)

| Function | Component | RAM |
|---|---|---|
| Agent brain | FunctionGemma 270M (Q4) | ~125MB |
| Chat + Code | Qwen3 3B (Q4_K_M) | ~2GB |
| Vision | Gemma 3n E4B or Moondream 0.5B | ~1.5GB |
| Screen agent | Moondream 0.5B (UI localization) | ~400MB |
| STT | Sherpa-ONNX + SenseVoice | ~100MB |
| TTS | Piper/NCNN (high voice) | ~60MB |
| Embeddings | EmbeddingGemma 300M | ~200MB |
| Vector DB | ObjectBox | ~30MB |
| Inference | MLLM (QNN/NPU) | ~5MB |
| **Total** | | **~3.5-4.5GB** |

> **Key changes:** Qwen3 3B handles code locally (no cloud needed for
> basic tasks). Moondream enables the agent to understand and interact
> with app UIs that lack APIs — critical for the "phone IS LETHE" vision.

### Future: Rust-Only Stack
- LLM: Candle / Crane / mistral.rs
- Embeddings/Classification: Tract (ONNX)
- STT/TTS: Sherpa-ONNX (Rust bindings)
- Vector DB: sqlite-vec (Rust-wrapped)
- Why: Eliminates Python entirely. Memory-safe. Clean ARM cross-compile.
