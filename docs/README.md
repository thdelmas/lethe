# Lethe — Internal Docs

## agent/
LETHE agent personality, safety constraints, LLM routing, and onboarding.

- [agent.yaml](agent/agent.yaml) — Personality, voice, mascot animation states, conversation behavior
- [boundaries.yaml](agent/boundaries.yaml) — Hard safety constraints derived from cautionary AI stories
- [providers.yaml](agent/providers.yaml) — Multi-provider LLM routing (local Qwen, Claude, OpenRouter)
- [first-boot-wizard.yaml](agent/first-boot-wizard.yaml) — 5-phase onboarding flow, <3 min target

## design/
Hardware tiers, mascot visuals, competitive positioning.

- [device-tiers.yaml](design/device-tiers.yaml) — Shallow/taproot/deeproot tiers, 40+ device mappings
- [mascot-layers.md](design/mascot-layers.md) — SVG layer decomposition, animation states, 3D/FBX retargeting pipeline, context-aware animation pools
- [competitive-gaps.md](design/competitive-gaps.md) — Gap analysis vs 2026 AI agents (P0-P3 priorities)

## security/
Hardening roadmap bridging GrapheneOS depth with Lethe's device breadth.

- [SECURITY-ROADMAP.md](security/SECURITY-ROADMAP.md) — P0 done, P1 sensor perms/lockdown/EXIF/PanicKit, P2 hardened_malloc/per-session keys, P3 IMSI/decoy profiles/warrant canary

## research/
Protocol surveys and ecosystem analysis. Reference docs, not specs.

- [ipfs.md](research/ipfs.md) — IPFS primitives, OTA pipeline, planned features, Web2 alternatives
- [anonymous-routing.md](research/anonymous-routing.md) — Anonymity protocols + complete messaging stack (Tor, I2P, Briar, Session, Tox, Ricochet...)
- [niche-protocols.md](research/niche-protocols.md) — Off-grid tech + Guardian Project tools (Reticulum, Meshtastic, Haven, ProofMode, age...)
- [counter-surveillance.md](research/counter-surveillance.md) — IMSI catchers, steganography, anti-forensics, sensor fingerprinting, Guardian Project toolkit, physical dead man's switches
- [pop-culture.md](research/pop-culture.md) — Robot/AI portrayals in film → LETHE personality lessons
- [gladys-assistant.md](research/gladys-assistant.md) — Gladys Assistant: privacy-first home automation as IoT control layer for LETHE
- [hidden-gems.md](research/hidden-gems.md) — **102 lesser-known technologies** across 5 domains (index + gap closure matrix)
  - [gems-ai-inference.md](research/gems-ai-inference.md) — On-device inference engines, tiny models, speech, vision, embeddings, RAG
  - [gems-privacy-forensics.md](research/gems-privacy-forensics.md) — Anti-forensics, metadata, anonymity networks, traffic resistance
  - [gems-decentralized-mesh.md](research/gems-decentralized-mesh.md) — P2P storage/sync, identity, messaging, mesh, DTN, radio
  - [gems-os-hardening.md](research/gems-os-hardening.md) — Kernel security, verified boot, sandboxing, eBPF, firewalling
  - [gems-ux-interaction.md](research/gems-ux-interaction.md) — Rendering, animation, calm tech, haptics, sound design, keyboards
