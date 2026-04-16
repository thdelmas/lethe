# Octopus Search Tracker

Tracks which GitHub profiles and repos have been explored via octopus search
to avoid re-crawling the same networks. Each entry records the origin,
what was explored, and which issues were created.

**Last updated:** 2026-04-14

---

## Search Origins

### Search 1: obra (Jesse Vincent) — AI agents, memory, voice
**Date:** 2026-04-11
**Origin:** https://github.com/obra

**Explored:**
- obra's repos (direct)
- obra's starred repos (30 repos)
- obra's following (91 users, 2 pages)
- obra's followers (600 users, 12 pages)

**Profiles deep-dived:**
| User | Focus | Issue |
|------|-------|-------|
| [nischalj10](https://github.com/nischalj10) | Embedded voice AI, memory, ESP32 | [#34](https://github.com/thdelmas/lethe/issues/34) |
| [dylanworrall](https://github.com/dylanworrall) | Offline STT (Rust), inference engine | [#35](https://github.com/thdelmas/lethe/issues/35), [#36](https://github.com/thdelmas/lethe/issues/36) |
| [harperreed](https://github.com/harperreed) | Go+SQLite+MCP toolkit, HMLR memory | [#37](https://github.com/thdelmas/lethe/issues/37) |
| [rcosteira79](https://github.com/rcosteira79) | Android skills, SSL pinning WebViews | [#38](https://github.com/thdelmas/lethe/issues/38) |
| [simonw](https://github.com/simonw) | Datasette, LLM plugin ecosystem | [#39](https://github.com/thdelmas/lethe/issues/39) |
| [bcherny](https://github.com/bcherny) | openclaw cross-platform AI assistant | [#46](https://github.com/thdelmas/lethe/issues/46) |
| [calcosmic](https://github.com/calcosmic) | Aether Go agent colony | [#43](https://github.com/thdelmas/lethe/issues/43) |
| [cketti](https://github.com/cketti) | Thunderbird Android, OpenPGP | (covered in #31) |

**Projects deep-dived:**
| Project | What | Issue |
|---------|------|-------|
| [taylorsatula/mira-OSS](https://github.com/taylorsatula/mira-OSS) | AI OS, memory decay, Text-Based LoRA | [#47](https://github.com/thdelmas/lethe/issues/47) |
| [pipecat-ai/pipecat](https://github.com/pipecat-ai/pipecat) | Voice AI pipeline framework | [#40](https://github.com/thdelmas/lethe/issues/40) |
| [m-bain/whisperX](https://github.com/m-bain/whisperX) | STT with timestamps + diarization | [#41](https://github.com/thdelmas/lethe/issues/41) |
| mempalace | AI memory system benchmarks | [#42](https://github.com/thdelmas/lethe/issues/42) |
| [Ryandonofrio3/osgrep](https://github.com/Ryandonofrio3/osgrep) | Semantic search for agents | [#44](https://github.com/thdelmas/lethe/issues/44) |
| libpeer | WebRTC for IoT/embedded | [#45](https://github.com/thdelmas/lethe/issues/45) |
| [RYOITABASHI/Nacre](https://github.com/RYOITABASHI/Nacre) | Android IME | [#48](https://github.com/thdelmas/lethe/issues/48) |

**Grouped theme issues (superseded by per-project issues):**
- [#29](https://github.com/thdelmas/lethe/issues/29) — Voice/Speech (grouped)
- [#30](https://github.com/thdelmas/lethe/issues/30) — Memory systems (grouped)
- [#31](https://github.com/thdelmas/lethe/issues/31) — Android tooling (grouped)
- [#32](https://github.com/thdelmas/lethe/issues/32) — Agent & inference (grouped)

---

### Search 2: Tor/mesh/privacy ecosystem
**Date:** 2026-04-11
**Origin:** LETHE's research docs (SECURITY-ROADMAP, gems-*, competitive-gaps)

**Explored:**

#### Tentacle A: Tor/Arti + Reticulum + Meshtastic + SimpleX
| User/Org | Focus | Issue |
|----------|-------|-------|
| [torproject](https://gitlab.torproject.org/tpo/core/arti) | Arti (Rust Tor) | [#49](https://github.com/thdelmas/lethe/issues/49) |
| [guardianproject](https://github.com/guardianproject) (tor-android) | C Tor for Android | [#49](https://github.com/thdelmas/lethe/issues/49) |
| [blueprint-freespeech/gosling](https://github.com/blueprint-freespeech/gosling) | P2P via Tor onion + JNI | [#49](https://github.com/thdelmas/lethe/issues/49) |
| [JonForShort](https://github.com/JonForShort) | Rust Android VPN | [#49](https://github.com/thdelmas/lethe/issues/49) |
| [markqvist](https://github.com/markqvist) | Reticulum, Sideband, NomadNet, LXMF, codec2 | [#50](https://github.com/thdelmas/lethe/issues/50) |
| [torlando-tech/columba](https://github.com/torlando-tech/columba) | Native Kotlin Reticulum messenger | [#50](https://github.com/thdelmas/lethe/issues/50) |
| [attermann/microReticulum](https://github.com/attermann/microReticulum) | C++ Reticulum for ESP32 | [#50](https://github.com/thdelmas/lethe/issues/50) |
| [meshtastic](https://github.com/meshtastic) | LoRa mesh (firmware, Android, Rust lib) | [#50](https://github.com/thdelmas/lethe/issues/50) |
| [meshcore-dev/MeshCore](https://github.com/meshcore-dev/MeshCore) | Lightweight C mesh protocol | [#50](https://github.com/thdelmas/lethe/issues/50) |
| [simplex-chat](https://github.com/simplex-chat) | No-identifier messenger | [#51](https://github.com/thdelmas/lethe/issues/51) |
| [liamcottle](https://github.com/liamcottle) | reticulum-meshchat, rns.js, meshtastic-map | [#50](https://github.com/thdelmas/lethe/issues/50) |

#### Tentacle B: Yggdrasil/CJDNS + anti-forensics
| User/Org | Focus | Issue |
|----------|-------|-------|
| [yggdrasil-network](https://github.com/yggdrasil-network) | Encrypted IPv6 overlay | [#52](https://github.com/thdelmas/lethe/issues/52) |
| [neilalexander](https://github.com/neilalexander) | Yggdrasil core, sigmavpn, yggmail, jnacl | [#52](https://github.com/thdelmas/lethe/issues/52) |
| [Arceliar](https://github.com/Arceliar) | ironwood routing lib | [#52](https://github.com/thdelmas/lethe/issues/52) |
| [Revertron](https://github.com/Revertron) | Yggdrasil-ng (Rust), Alfis (decentralized DNS) | [#52](https://github.com/thdelmas/lethe/issues/52) |
| [JB-SelfCompany](https://github.com/JB-SelfCompany) | Tyr (P2P email on Yggdrasil, Kotlin) | [#52](https://github.com/thdelmas/lethe/issues/52) |
| [Mimir-IM](https://github.com/Mimir-IM) | MimirForAndroid (P2P messenger on Yggdrasil) | [#52](https://github.com/thdelmas/lethe/issues/52) |
| [cjdelisle](https://github.com/cjdelisle) | CJDNS (5.3K stars, now focused on routers/PKT) | (no issue — low priority) |
| [bakad3v](https://github.com/bakad3v) | Android-AntiForensic-Tools | [#53](https://github.com/thdelmas/lethe/issues/53) |
| [x13a](https://github.com/x13a) | Wasted (predecessor, broken Android 14+) | [#53](https://github.com/thdelmas/lethe/issues/53) |
| [vmonaco](https://github.com/vmonaco) | kloak keystroke anonymization | [#54](https://github.com/thdelmas/lethe/issues/54) |
| [EFForg](https://github.com/EFForg) | rayhunter IMSI detection | [#54](https://github.com/thdelmas/lethe/issues/54) |
| [skewyapp](https://github.com/skewyapp) | Ultrasonic beacon detection | [#54](https://github.com/thdelmas/lethe/issues/54) |
| [giovantenne/lastsignal](https://github.com/giovantenne/lastsignal) | E2E encrypted DMS | [#55](https://github.com/thdelmas/lethe/issues/55) |
| [bkupidura/dead-man-hand](https://github.com/bkupidura/dead-man-hand) | Privacy-focused DMS | [#55](https://github.com/thdelmas/lethe/issues/55) |
| [adamdecaf/deadcheck](https://github.com/adamdecaf/deadcheck) | Infrastructure-independent DMS | [#55](https://github.com/thdelmas/lethe/issues/55) |

#### Tentacle C: Iroh/Willow/Earthstar
| User/Org | Focus | Issue |
|----------|-------|-------|
| [n0-computer](https://github.com/n0-computer) | Iroh (8.2K stars), sendme, noq, gossip, willow, live, callme | [#56](https://github.com/thdelmas/lethe/issues/56) |
| [earthstar-project](https://github.com/earthstar-project) | Earthstar (911 stars), willow-js, meadowcap-js | [#58](https://github.com/thdelmas/lethe/issues/58) |
| [Frando](https://github.com/Frando) | deltachat, sonar, hypercore-protocol-rs | [#56](https://github.com/thdelmas/lethe/issues/56) |
| [matheus23](https://github.com/matheus23) | rs-wnfs encrypted FS, UCAN working group | [#56](https://github.com/thdelmas/lethe/issues/56) |
| [wmaslonek/guardian-db](https://github.com/wmaslonek/guardian-db) | Local-first DB on iroh+Willow | [#56](https://github.com/thdelmas/lethe/issues/56) |
| [whisperbit-labs/zemzeme-android](https://github.com/whisperbit-labs/zemzeme-android) | BLE+libp2p+Nostr Android mesh | [#57](https://github.com/thdelmas/lethe/issues/57) |
| [UstadMobile/Meshrabiya](https://github.com/UstadMobile/Meshrabiya) | Android WiFi mesh, BATMAN | [#57](https://github.com/thdelmas/lethe/issues/57) |
| [ShilohEye/bitchat-terminal](https://github.com/ShilohEye/bitchat-terminal) | BLE mesh chat (Rust) | [#57](https://github.com/thdelmas/lethe/issues/57) |
| [p2panda](https://github.com/p2panda) | P2P blocks for LoRa, radio, BLE, shortwave | [#56](https://github.com/thdelmas/lethe/issues/56) |
| [osvauld](https://github.com/osvauld) | E2E P2P app platform, CRDT, UCAN | [#56](https://github.com/thdelmas/lethe/issues/56) |
| [OpenArchive/save-dweb-backend](https://github.com/OpenArchive/save-dweb-backend) | Iroh tunneled through Veilid | [#56](https://github.com/thdelmas/lethe/issues/56) |

#### Tentacle D: Guardian Project
**Status:** Agent stalled (hit rate limit or timeout after ~90min, 124KB output). Partial data recovered — x13a/Wasted was last fetch. **Re-run needed** as a future octopus origin.

---

---

### Search 3: Featured repos from LETHE docs
**Date:** 2026-04-11
**Origin:** All repos referenced in LETHE's docs/ that weren't yet explored

#### Tentacle A: Inference engine authors
| User/Org | Focus | Issue |
|----------|-------|-------|
| [ggerganov](https://github.com/ggerganov) + [ggml-org](https://github.com/ggml-org) | llama.cpp (103K stars), whisper.cpp (48K), ggwave, kbd-audio | [#68](https://github.com/thdelmas/lethe/issues/68) |
| [EricLBuehler](https://github.com/EricLBuehler) | mistral.rs (7K), edge-u-cation, float4/float8 | [#70](https://github.com/thdelmas/lethe/issues/70) |
| [k2-fsa](https://github.com/k2-fsa) | sherpa-onnx (11.5K), sherpa-ncnn (1.7K), OmniVoice, ZipVoice | [#69](https://github.com/thdelmas/lethe/issues/69) |
| [sonos](https://github.com/sonos) | tract (2.9K), dinghy (cross-compile) | (covered in #69) |
| [Tencent](https://github.com/Tencent) | ncnn (23K stars) | (covered in #64) |
| [cactus-compute](https://github.com/cactus-compute) | cactus (4.6K, ggerganov-starred) | [#67](https://github.com/thdelmas/lethe/issues/67) |
| [shubham0204/SmolChat-Android](https://github.com/shubham0204/SmolChat-Android) | GGUF on Android (770 stars) | [#68](https://github.com/thdelmas/lethe/issues/68) |
| [mmwillet/TTS.cpp](https://github.com/mmwillet/TTS.cpp) | TTS with GGML (231 stars) | [#68](https://github.com/thdelmas/lethe/issues/68) |

#### Tentacle B: Privacy/hardening authors
| User/Org | Focus | Issue |
|----------|-------|-------|
| [GrapheneOS](https://github.com/GrapheneOS) | 155 repos, hardened_malloc, Vanadium, Camera, PdfViewer, Auditor | [#71](https://github.com/thdelmas/lethe/issues/71) |
| [thestinger](https://github.com/thestinger) | GrapheneOS founder, playpen (sandboxing), allocator | [#71](https://github.com/thdelmas/lethe/issues/71) |
| [Divested-Mobile](https://github.com/Divested-Mobile) | Hypatia (malware), Extirpater (free space eraser), DivestOS, Mull | [#73](https://github.com/thdelmas/lethe/issues/73) |
| [Gedsh](https://github.com/Gedsh) | InviZible (Tor+DNSCrypt+I2P, 2.5K), Nflog-android | [#72](https://github.com/thdelmas/lethe/issues/72) |
| [freedomofpress](https://github.com/freedomofpress) | Dangerzone (5.3K), SecureDrop (3.8K) | [#73](https://github.com/thdelmas/lethe/issues/73) |
| [FiloSottile](https://github.com/FiloSottile) | age (21.9K), mkcert (58K), mlkem768 (post-quantum), passage | [#73](https://github.com/thdelmas/lethe/issues/73) |
| [mirfatif](https://github.com/mirfatif) | PermissionManagerX (646), Fyrypt (firewall), WhatsRunning | [#73](https://github.com/thdelmas/lethe/issues/73) |
| [d3cim](https://github.com/d3cim) | dnscrypt-proxy-android (163) | [#73](https://github.com/thdelmas/lethe/issues/73) |
| [sepfy](https://github.com/sepfy) | libpeer (1.5K) — correct author (not nicholasgasior) | [#45](https://github.com/thdelmas/lethe/issues/45) |

#### Tentacle C: Mesh/P2P/decentralized authors
| User/Org | Focus | Issue |
|----------|-------|-------|
| [ssbc](https://github.com/ssbc) | tinySSB (LoRa+BLE), go-ssb-room, ssb-db2 | [#63](https://github.com/thdelmas/lethe/issues/63) |
| [servalproject](https://github.com/servalproject) | batphone (419), serval-dna, Rhizome, MeshMS, VoMP | [#63](https://github.com/thdelmas/lethe/issues/63) |
| [GladysAssistant](https://github.com/GladysAssistant) | Gladys (3K), E2E gateway | (covered in competitive-gaps) |
| [ImranR98](https://github.com/ImranR98) | Obtainium (16.4K), SMStfy, android_package_installer | [#62](https://github.com/thdelmas/lethe/issues/62) |
| [EasyTier](https://github.com/EasyTier) | EasyTier mesh VPN (10.8K, Rust) | [#61](https://github.com/thdelmas/lethe/issues/61) |
| [dessalines](https://github.com/dessalines) | thumb-key (1.4K), Lemmy creator | (noted, low priority) |
| [sh123](https://github.com/sh123) | codec2_talkie (281), esp32_loraprs (262), esp32_loradv (98) | [#60](https://github.com/thdelmas/lethe/issues/60) |
| [psytraxx](https://github.com/psytraxx) | android-lora-ble-bridge (10km LoRa, 70-100h battery) | [#60](https://github.com/thdelmas/lethe/issues/60) |

#### Tentacle D: UX/rendering/audio authors
| User/Org | Focus | Issue |
|----------|-------|-------|
| [oframe](https://github.com/oframe) | OGL (4.5K), ogpu (WebGPU) | [#66](https://github.com/thdelmas/lethe/issues/66) |
| [Tonejs](https://github.com/Tonejs) | Tone.js (14.6K), Midi, Presets, unmute | [#66](https://github.com/thdelmas/lethe/issues/66) |
| [resonance-audio](https://github.com/resonance-audio) | Web SDK (219), C++ core (532) | [#66](https://github.com/thdelmas/lethe/issues/66) |
| [tmf-code](https://github.com/tmf-code) | inverse-kinematics TypeScript solver (23) | [#66](https://github.com/thdelmas/lethe/issues/66) |
| [dscripka](https://github.com/dscripka) | openWakeWord (2.1K), piper-sample-generator, openSpeechToIntent | [#65](https://github.com/thdelmas/lethe/issues/65) |
| [nihui](https://github.com/nihui) | ncnn-android-piper (59), opencv-mobile (3.3K), 40+ ncnn Android repos | [#64](https://github.com/thdelmas/lethe/issues/64) |
| [automerge](https://github.com/automerge) | automerge CRDT (6.2K), automerge-java (42) | [#66](https://github.com/thdelmas/lethe/issues/66) |

---

### Pre-search origins (individual profile checks)

| User | Focus | Issue | Date |
|------|-------|-------|------|
| [GoldenGrapeGentleman](https://github.com/GoldenGrapeGentleman) | AMD ROCm, LLM inference forks | [#24](https://github.com/thdelmas/lethe/issues/24) | 2026-04-11 |
| [vokimon](https://github.com/vokimon) | Android/Kotlin tools, Godot | [#25](https://github.com/thdelmas/lethe/issues/25) | 2026-04-11 |
| [tkoyama010](https://github.com/tkoyama010) | PyVista, VTK, 3D rendering (WASM) | [#27](https://github.com/thdelmas/lethe/issues/27) | 2026-04-11 |
| [obra](https://github.com/obra) | AI agents, memory, voice (see Search 1) | [#28](https://github.com/thdelmas/lethe/issues/28) | 2026-04-11 |

---

---

### Search 4: High-priority unexplored leads
**Date:** 2026-04-11
**Origin:** Remaining high-priority leads from Searches 1-3

#### Tentacle A: Privacy infrastructure
| User/Org | Focus | Issue |
|----------|-------|-------|
| [guardianproject](https://github.com/guardianproject) | ~130 repos: haven, orbot, PanicKit, ripple, ProofMode, NetCipher, IOCipher, PixelKnot | [#74](https://github.com/thdelmas/lethe/issues/74) |
| [uazo](https://github.com/uazo) | Cromite (7.1K stars) — hardened Chromium/WebView | [#75](https://github.com/thdelmas/lethe/issues/75) |
| [katzenpost](https://github.com/katzenpost) | Post-quantum mixnet (Go), hpqc, thin_client (Rust) | [#76](https://github.com/thdelmas/lethe/issues/76) |
| [veilid](https://veilid.com) | Anonymous P2P framework (Rust), GitLab-hosted, zero GitHub repos | [#77](https://github.com/thdelmas/lethe/issues/77) |

#### Tentacle B: Decentralized protocols
| User/Org | Focus | Issue |
|----------|-------|-------|
| [deltachat](https://github.com/deltachat) | 67 repos: Rust core (867 stars), Android (1.6K), yggmail, WebXDC | [#78](https://github.com/thdelmas/lethe/issues/78) |
| [holochain](https://github.com/holochain) | 200+ repos: agent-centric DHT (1.4K), android-service-runtime, kitsune2, deepkey | [#79](https://github.com/thdelmas/lethe/issues/79) |
| [ocapn](https://github.com/ocapn) + [spritely](https://codeberg.org/spritely) | OCapN spec (229 stars), Goblins, capability-based security | [#80](https://github.com/thdelmas/lethe/issues/80) |

---

### Search 5: Awesome lists sweep
**Date:** 2026-04-12
**Origin:** Curated GitHub awesome-* lists (8 tentacles in parallel)
**Full results:** [awesome-lists-full-results.md](awesome-lists-full-results.md)

#### Tentacle A: Privacy (pluja/awesome-privacy, Lissy93/awesome-privacy)
| Project | What | Issue |
|---------|------|-------|
| [celzero/rethink-app](https://github.com/celzero/rethink-app) | No-root firewall + DoH/DoT — replaces multiple LETHE components | [#85](https://github.com/thdelmas/lethe/issues/85) |
| [briarproject/briar](https://briarproject.org/) | P2P messenger over Tor/WiFi/BLE — mesh-native | [#85](https://github.com/thdelmas/lethe/issues/85) |
| [mollyim/mollyim-android](https://github.com/mollyim/mollyim-android) | Hardened Signal fork (Tor, encrypted DB) | [#85](https://github.com/thdelmas/lethe/issues/85) |
| [shufflecake](https://shufflecake.net) | Plausible deniability hidden volumes — extends burner mode | [#85](https://github.com/thdelmas/lethe/issues/85) |
| [sgasser/pasteguard](https://github.com/sgasser/pasteguard) | PII scrubbing before LLM queries | [#85](https://github.com/thdelmas/lethe/issues/85) |
| [SnoopSnitch](https://opensource.srlabs.de/projects/snoopsnitch) | IMSI catcher / SS7 attack detection | [#85](https://github.com/thdelmas/lethe/issues/85) |
| [Helium314/HeliBoard](https://github.com/Helium314/HeliBoard) | Fully offline FOSS keyboard | [#85](https://github.com/thdelmas/lethe/issues/85) |

#### Tentacle B: Self-Hosted (awesome-selfhosted)
| Project | What | Issue |
|---------|------|-------|
| [ollama/ollama](https://github.com/ollama/ollama) | Local LLM runtime — core inference layer | [#83](https://github.com/thdelmas/lethe/issues/83) |
| [mudler/LocalAI](https://github.com/mudler/LocalAI) | OpenAI-compatible multi-model local API | [#83](https://github.com/thdelmas/lethe/issues/83) |
| [actualbudget/actual](https://github.com/actualbudget/actual) | Local-first budgeting + bank sync (PreuJust) | — |
| [cfu288/mere-medical](https://github.com/cfu288/mere-medical) | Offline-first medical records (Bios) | — |
| [dani-garcia/vaultwarden](https://github.com/dani-garcia/vaultwarden) | Lightweight Bitwarden server (Rust, ARM) | [#85](https://github.com/thdelmas/lethe/issues/85) |
| [openziti/ziti](https://github.com/openziti/ziti) | Zero-trust mesh overlay network | [#85](https://github.com/thdelmas/lethe/issues/85) |
| [Start9Labs/start-os](https://github.com/Start9Labs/start-os) | Personal server OS — closest philosophical sibling | — |

#### Tentacle C: LLM / AI (Awesome-LLM, Awesome-AITools)
| Project | What | Issue |
|---------|------|-------|
| [alibaba/MNN](https://github.com/alibaba/MNN) | ~800KB mobile inference with LLM pipeline (14.9K) | [#82](https://github.com/thdelmas/lethe/issues/82) |
| [microsoft/T-MAC](https://github.com/microsoft/T-MAC) | 20 tok/s on single ARM core for 3B models | [#82](https://github.com/thdelmas/lethe/issues/82) |
| [BerriAI/litellm](https://github.com/BerriAI/litellm) | Unified SDK for 100+ LLM providers (43K) | [#83](https://github.com/thdelmas/lethe/issues/83) |
| [Portkey-AI/gateway](https://github.com/Portkey-AI/gateway) | 122KB LLM gateway with fallbacks (11.3K) | [#83](https://github.com/thdelmas/lethe/issues/83) |
| [cpacker/MemGPT](https://github.com/cpacker/MemGPT) | Letta — tiered memory for stateful agents (22K) | [#83](https://github.com/thdelmas/lethe/issues/83) |
| [mem0ai/mem0](https://github.com/mem0ai/mem0) | Universal memory layer, self-hostable (52.7K) | [#83](https://github.com/thdelmas/lethe/issues/83) |
| [agiresearch/AIOS](https://github.com/agiresearch/AIOS) | LLM-embedded OS with agent scheduling (5.5K) | [#83](https://github.com/thdelmas/lethe/issues/83) |
| [saharNooby/rwkv.cpp](https://github.com/saharNooby/rwkv.cpp) | Linear-attention = constant memory (1.6K) | [#83](https://github.com/thdelmas/lethe/issues/83) |

#### Tentacle D: Security (awesome-security, android-security-awesome)
| Project | What | Issue |
|---------|------|-------|
| [mvt-project/mvt](https://github.com/mvt-project/mvt) | Anti-stalkerware/Pegasus detection (12.3K) | [#86](https://github.com/thdelmas/lethe/issues/86) |
| [cossacklabs/themis](https://github.com/cossacklabs/themis) | Multi-platform crypto with forward secrecy (2K) | [#86](https://github.com/thdelmas/lethe/issues/86) |
| [cossacklabs/acra](https://github.com/cossacklabs/acra) | DB-level encryption for sensitive data (1.5K) | [#86](https://github.com/thdelmas/lethe/issues/86) |
| [evilsocket/opensnitch](https://github.com/evilsocket/opensnitch) | Interactive application firewall (13.4K) | [#86](https://github.com/thdelmas/lethe/issues/86) |
| [quark-engine](https://github.com/quark-engine/quark-engine) | Android malware scoring (1.7K) | [#86](https://github.com/thdelmas/lethe/issues/86) |
| [aquasecurity/trivy](https://github.com/aquasecurity/trivy) | Build pipeline CVE scanning (34.5K) | [#86](https://github.com/thdelmas/lethe/issues/86) |

#### Tentacle E: Android (awesome-android, awesome-android-ui)
| Project | What | Issue |
|---------|------|-------|
| [airbnb/lottie-android](https://github.com/airbnb/lottie-android) | Render animations from JSON (35.6K) — mascot | [#87](https://github.com/thdelmas/lethe/issues/87) |
| [ionic-team/capacitor](https://github.com/ionic-team/capacitor) | Production WebView-native bridge (15.4K) | [#87](https://github.com/thdelmas/lethe/issues/87) |
| [coshx/drekkar](https://github.com/coshx/drekkar) | WebView-to-JS event bus — exact launcher fit | [#87](https://github.com/thdelmas/lethe/issues/87) |
| [nisrulz/sensey](https://github.com/nisrulz/sensey) | Sensor-to-gesture for mascot interaction (2.7K) | [#87](https://github.com/thdelmas/lethe/issues/87) |
| [signalapp/libsignal-protocol-java](https://github.com/signalapp/libsignal-protocol-java) | Forward-secrecy messaging protocol (1.8K) | [#87](https://github.com/thdelmas/lethe/issues/87) |
| [facebook/rebound](https://github.com/facebook/rebound) | Spring physics for organic mascot motion (5.4K) | [#87](https://github.com/thdelmas/lethe/issues/87) |

#### Tentacle F: Embedded / ARM (awesome-embedded, awesome-iot)
| Project | What | Issue |
|---------|------|-------|
| [Samsung/jerryscript](https://github.com/Samsung/jerryscript) | JS engine <64KB RAM — same hardware class (7.4K) | [#88](https://github.com/thdelmas/lethe/issues/88) |
| [ARMmbed/mbedtls](https://github.com/ARMmbed/mbedtls) | ARM-native TLS library (6.6K) | [#88](https://github.com/thdelmas/lethe/issues/88) |
| [seemoo-lab/nexmon](https://github.com/seemoo-lab/nexmon) | Broadcom WiFi firmware patching — Note 2 (2.8K) | [#88](https://github.com/thdelmas/lethe/issues/88) |
| [nanomq/nanomq](https://github.com/nanomq/nanomq) | Sub-1MB MQTT broker (2.5K) | [#88](https://github.com/thdelmas/lethe/issues/88) |
| [seL4/seL4](https://github.com/seL4/seL4) | Formally verified microkernel (5.4K) | [#88](https://github.com/thdelmas/lethe/issues/88) |
| [Microsoft/ELL](https://github.com/Microsoft/ELL) | Compile ML to C++ for ARM Cortex (2.3K) | [#88](https://github.com/thdelmas/lethe/issues/88) |

#### Tentacle G: Health / Fintech (awesome-healthcare, awesome-fintech)
| Project | What | Issue |
|---------|------|-------|
| [google/android-fhir](https://github.com/google/android-fhir) | Android FHIR SDK (Bios) | — |
| [the-momentum/open-wearables](https://github.com/the-momentum/open-wearables) | Self-hosted unified wearable API (Bios) | — |
| [quirk.fyi](https://www.quirk.fyi/) | Open-source CBT app (Bios wellness) | — |
| [yzhao062/pyod](https://github.com/yzhao062/pyod) | Anomaly detection engine (PreuJust, 9.8K) | — |
| [checkmarble/marble](https://github.com/checkmarble/marble) | Real-time fraud + AML engine (PreuJust) | — |
| [atenreiro/opensquat](https://github.com/atenreiro/opensquat) | Phishing domain detection (PreuJust) | — |
| [MISP/MISP](https://github.com/MISP/MISP) | Threat intelligence sharing (PreuJust, 6.2K) | — |
| [pudo/opensanctions](https://github.com/pudo/opensanctions) | Sanctions screening database (PreuJust) | — |

#### Tentacle H: Voice / Speech (awesome-tts, awesome-speech)
| Project | What | Issue |
|---------|------|-------|
| [alphacep/vosk-api](https://github.com/alphacep/vosk-api) | Offline STT, ~50MB, Android, 20+ languages (14.5K) | [#84](https://github.com/thdelmas/lethe/issues/84) |
| [2noise/ChatTTS](https://github.com/2noise/ChatTTS) | Dialogue TTS with emotion tokens (39.1K) | [#84](https://github.com/thdelmas/lethe/issues/84) |
| [myshell-ai/OpenVoice](https://github.com/myshell-ai/OpenVoice) | Voice cloning + emotion, MIT (36.2K) | [#84](https://github.com/thdelmas/lethe/issues/84) |
| [snakers4/silero-vad](https://github.com/snakers4/silero-vad) | ONNX VAD, enterprise-grade (8.8K) | [#84](https://github.com/thdelmas/lethe/issues/84) |
| [Picovoice/porcupine](https://github.com/Picovoice/porcupine) | Custom wake words, Android SDK (4.8K) | [#84](https://github.com/thdelmas/lethe/issues/84) |
| [xiph/rnnoise](https://github.com/xiph/rnnoise) | C real-time noise suppression | [#84](https://github.com/thdelmas/lethe/issues/84) |
| [FunAudioLLM/SenseVoice](https://github.com/FunAudioLLM/SenseVoice) | ASR + emotion + events in one model (8K) | [#84](https://github.com/thdelmas/lethe/issues/84) |

---

### Search 6: ANSSI-FR (French National Cybersecurity Agency)
**Date:** 2026-04-14
**Origin:** https://github.com/ANSSI-FR (74 public repos)

#### Tentacle A: Cryptography
| User/Org | Focus | Issue |
|----------|-------|-------|
| [ANSSI-FR/MLA](https://github.com/ANSSI-FR/MLA) | Pure Rust archive format with PQC encryption, compression, signatures (368 stars) | [#89](https://github.com/thdelmas/lethe/issues/89) |
| [ANSSI-FR/libecc](https://github.com/ANSSI-FR/libecc) | Side-channel resistant ECC library in C (263 stars, archived) | [#89](https://github.com/thdelmas/lethe/issues/89) |
| [ANSSI-FR/libdrbg](https://github.com/ANSSI-FR/libdrbg) | NIST SP 800-90A DRBG implementation (18 stars, archived) | [#89](https://github.com/thdelmas/lethe/issues/89) |
| [ANSSI-FR/IPECC](https://github.com/ANSSI-FR/IPECC) | ECC hardware acceleration in VHDL (46 stars) | [#89](https://github.com/thdelmas/lethe/issues/89) |
| [cryspen/libcrux](https://github.com/cryspen/libcrux) | Formally verified crypto, PQ-ready, Rust (218 stars) | [#89](https://github.com/thdelmas/lethe/issues/89) |
| [rustpq/pqcrypto](https://github.com/rustpq/pqcrypto) | Rust post-quantum crypto bindings (393 stars) | [#89](https://github.com/thdelmas/lethe/issues/89) |

#### Tentacle B: Android & Mobile
| User/Org | Focus | Issue |
|----------|-------|-------|
| [ANSSI-FR/cry-me](https://github.com/ANSSI-FR/cry-me) | Kotlin Android crypto messaging app (180 stars) | [#90](https://github.com/thdelmas/lethe/issues/90) |
| [ANSSI-FR/ultrablue](https://github.com/ANSSI-FR/ultrablue) | Kotlin TPM attestation over Bluetooth (174 stars) | [#90](https://github.com/thdelmas/lethe/issues/90) |
| [ANSSI-FR/DroidWorks](https://github.com/ANSSI-FR/DroidWorks) | Rust Android analysis/manipulation tooling (5 stars, archived) | [#90](https://github.com/thdelmas/lethe/issues/90) |
| [seemoo-lab/CellGuard](https://github.com/seemoo-lab/CellGuard) | Cellular surveillance detection (362 stars) — starred by e2r3p13 | [#90](https://github.com/thdelmas/lethe/issues/90) |

#### Tentacle C: Data diodes & Network security
| User/Org | Focus | Issue |
|----------|-------|-------|
| [ANSSI-FR/lidi](https://github.com/ANSSI-FR/lidi) | Rust unidirectional data transfer with FEC (92 stars) | [#91](https://github.com/thdelmas/lethe/issues/91) |
| [ANSSI-FR/eurydice](https://github.com/ANSSI-FR/eurydice) | Python data diode file transfer with web UI (154 stars) | [#91](https://github.com/thdelmas/lethe/issues/91) |
| [ANSSI-FR/py5sig](https://github.com/ANSSI-FR/py5sig) | 5G signalling fuzzer (11 stars) | [#91](https://github.com/thdelmas/lethe/issues/91) |
| [FCSC-FR/couic](https://github.com/FCSC-FR/couic) | XDP network filtering with REST API, Rust (27 stars) | [#91](https://github.com/thdelmas/lethe/issues/91) |

#### Tentacle D: Hardware & Firmware security
| User/Org | Focus | Issue |
|----------|-------|-------|
| [ANSSI-FR/chipsec-check](https://github.com/ANSSI-FR/chipsec-check) | Hardware security requirement testing (50 stars) | [#92](https://github.com/thdelmas/lethe/issues/92) |
| [ANSSI-FR/bootcode_parser](https://github.com/ANSSI-FR/bootcode_parser) | Boot record integrity parser (96 stars) | [#92](https://github.com/thdelmas/lethe/issues/92) |
| [ANSSI-FR/pciemem](https://github.com/ANSSI-FR/pciemem) | Physical memory access via PCIe/USB3380 (15 stars) | [#92](https://github.com/thdelmas/lethe/issues/92) |
| [ANSSI-FR/usb_authentication](https://github.com/ANSSI-FR/usb_authentication) | USB device authentication in kernel (5 stars) | [#92](https://github.com/thdelmas/lethe/issues/92) |
| [ANSSI-FR/scep](https://github.com/ANSSI-FR/scep) | Linux Security Module (8 stars, archived) | [#92](https://github.com/thdelmas/lethe/issues/92) |

#### Tentacle E: Sister agency (CEA-SEC)
| User/Org | Focus | Issue |
|----------|-------|-------|
| [cea-sec/usbsas](https://github.com/cea-sec/usbsas) | Secure USB mass storage reading, Rust (370 stars) | [#93](https://github.com/thdelmas/lethe/issues/93) |
| [cea-sec/TorPylle](https://github.com/cea-sec/TorPylle) | Python/Scapy Tor protocol implementation (98 stars) | [#93](https://github.com/thdelmas/lethe/issues/93) |
| [cea-sec/miasm](https://github.com/cea-sec/miasm) | Reverse engineering framework (3855 stars) | [#93](https://github.com/thdelmas/lethe/issues/93) |

#### Tentacle F: Contributor star networks
| User/Org | Focus | Issue |
|----------|-------|-------|
| [dsprenkels/sss-rs](https://github.com/dsprenkels/sss-rs) | Shamir Secret Sharing in Rust (50 stars) — dead man's switch key splitting | [#94](https://github.com/thdelmas/lethe/issues/94) |
| [landlock-lsm/rust-landlock](https://github.com/landlock-lsm/rust-landlock) | Rust Landlock sandboxing bindings (234 stars) | [#92](https://github.com/thdelmas/lethe/issues/92) |
| [ANSSI-FR/rust-guide](https://github.com/ANSSI-FR/rust-guide) | Secure Rust development recommendations (637 stars) | [#92](https://github.com/thdelmas/lethe/issues/92) |
| [ANSSI-FR/ASCAD](https://github.com/ANSSI-FR/ASCAD) | Side-channel analysis with deep learning (239 stars, archived) | [#89](https://github.com/thdelmas/lethe/issues/89) |

**Key contributors (tentacles for future exploration):**
| Contributor | Expertise | Priority |
|-------------|-----------|----------|
| [rben-dev](https://github.com/rben-dev) | ANSSI crypto lead — ECC, PQC, side-channels, embedded crypto, DRBG, hardware (Wookey USB) | CRITICAL |
| [extiop](https://github.com/extiop) | MLA lead — PQC archives, Rust security. Stars: GrapheneOS, libcrux, Landlock, SimpleXMQ | HIGH |
| [commial](https://github.com/commial) | MLA + AD — binary analysis (miasm, angr), network recon (IVRE), Rust | HIGH |
| [e2r3p13](https://github.com/e2r3p13) | ultrablue lead — mobile security, jailbreaks, forensics, kernel exploitation, MVT | HIGH |
| [r3dlight](https://github.com/r3dlight) | lidi — embedded Rust (STM32, RISC-V), seL4, Landlock, PQ crypto, Creusot, Rust bootloaders | HIGH |
| [ad-anssi](https://github.com/ad-anssi) | DroidWorks + lidi — Rust Android tooling, formal verification (Creusot) | MEDIUM |
| [kerneis-anssi](https://github.com/kerneis-anssi) | ultrablue + chipsec — TPM, firmware, hardware verification | MEDIUM |

---

## Unexplored leads (future searches)

Profiles/orgs discovered but not yet explored as octopus origins:

### From Search 1 (obra network)
- [taylorsatula](https://github.com/taylorsatula) — MIRA author. Check followers/stars.
- [craigsc](https://github.com/craigsc) — cmux author, Pastmaps. Check repos.
- [erans](https://github.com/erans) — lunaroute AI proxy, lsp-mcp. Check repos.
- [audreyt](https://github.com/audreyt) — Former Taiwan Digital Minister. Check repos.
- [pfrazee](https://github.com/pfrazee) — Bluesky developer. Check repos.
- [jackhumbert](https://github.com/jackhumbert) — QMK/OLKB. Check repos for input devices.

### From Search 2 (mesh/privacy)
- [liberatedsystems](https://github.com/liberatedsystems) — RNode firmware community edition
- [Rhizomatica](https://github.com/Rhizomatica) — HF radio protocols (mercury)
- [drowe67](https://github.com/drowe67) — Radio autoencoder, codec2 upstream
- [OpenArchive](https://github.com/OpenArchive) — Save project, censorship-resistant archiving
- [kc1awv](https://github.com/kc1awv) — RetiBBS, lxst_phone (voice over Reticulum)

### From Search 4
- [dignifiedquire](https://github.com/dignifiedquire) — bridges deltachat + iroh ecosystems
- [hpk42](https://github.com/hpk42) — Delta Chat founder, pytest creator
- [sepfy](https://github.com/sepfy) — libpeer author (correct handle), xiaopi, ESP32 WebRTC
- [thestinger](https://github.com/thestinger) — GrapheneOS founder, allocator, sandboxing

### From Search 6 (ANSSI-FR)
- [rben-dev](https://github.com/rben-dev) — ANSSI crypto lead. ECC, PQC, Wookey secure USB, DRBG. CRITICAL priority.
- [extiop](https://github.com/extiop) — MLA lead. Stars GrapheneOS, libcrux, Landlock, SimpleXMQ.
- [commial](https://github.com/commial) — Binary analysis, miasm, angr, IVRE network recon.
- [e2r3p13](https://github.com/e2r3p13) — Mobile security, jailbreaks, forensics. Stars MVT, CellGuard.
- [r3dlight](https://github.com/r3dlight) — Embedded Rust, seL4, Landlock, PQ crypto, Rust bootloaders.
- [cea-sec](https://github.com/cea-sec) — Sister agency. TorPylle, miasm, usbsas. Full org sweep needed.
