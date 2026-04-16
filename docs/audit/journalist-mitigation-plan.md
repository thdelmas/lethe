# Journalist-Audit Mitigation Plan

Plans to address the 21 findings from the 2026-04-15 frontline-journalist threat-model audit. Each plan lists approach, key steps, effort (S/M/L), and dependencies. Issues are on github.com/thdelmas/lethe #95–#115.

## AI leakage

### #95 — Compile-time flag to disable cloud AI — **S, do first**
**Approach.** Gate provider registration at Nix build time; don't ship provider adapters into the field-build APK.
1. Add `lethe.fieldBuild = true` option in `flake.nix`; thread through to agent build.
2. Move each cloud adapter into its own Go/Kotlin file with a build tag (`//go:build !fieldbuild`).
3. In `agent/providers.yaml`, filter out cloud entries when field tag set; hide Settings sections conditionally.
4. CI: publish two artifacts (`lethe-standard.apk`, `lethe-field.apk`); different signing key and package id to prevent upgrade confusion.
5. Verify with `strings | grep anthropic` and runtime test that no network calls leave the device.

**Dep.** None. Prereq for #96 and #97 being meaningful.

### #96 — Prompt sanitization — **M**
**Approach.** Two-pass redaction (regex + on-device NER) before provider dispatch, never UI-only.
1. Regex pass: phone, email, IBAN, coords, IPs, URLs, common name patterns.
2. NER pass: small on-device model (SmolLM already shipped, prompted as classifier) tags PERSON / ORG / LOC / MISC.
3. Token-stable placeholders (`[PERSON_1]` reused across turns) so responses re-hydrate locally if the user wants.
4. User-visible diff screen: "N redactions — review / approve / edit before send."
5. Telemetry-free test corpus of journalist prompts; track precision/recall.

**Dep.** #95 (defense in depth even when cloud is off).

### #97 — Context limiting for cloud calls — **S**
**Approach.** Separate context policies for local vs. cloud.
1. Default cloud context = system prompt + current turn only.
2. Cloud conversation history becomes opt-in, "Include last N turns", with explicit risk copy.
3. Persistent UI chip: "Cloud: 1-turn" vs. "Cloud: full history" whenever a cloud provider is active.
4. Unit tests over provider router confirm truncation before HTTP.

**Dep.** None. Parallel with #96.

## Coercion / borders

### #98 — Duress PIN post-setup + border default — **S**
**Approach.** Move duress PIN out of first-boot-only into a Security settings flow guarded by current lock.
1. New `DuressPinManager` service; add / rotate / remove requires current PIN + 10s cooldown.
2. Settings entry under Security → Duress PIN with clear UX (silent wipe, not silent lock).
3. Border Mode (#110) forces setup.
4. Store duress hash in a separate keystore slot so wipe trigger path doesn't race unlock path.
5. Docs + screenshots in PRIVACY.md.

**Dep.** Consumed by Border Mode (#110).

### #106 — Panic-wipe safeguard — **S**
**Approach.** Configurable trigger profile; don't regress existing opted-in users.
1. Three modes: *Default* (5x press + hold 5th for 3s), *Confirm* (5x press → 10s countdown with PIN to cancel), *Instant* (current).
2. Profile selection in Security settings with explicit risk copy.
3. Default new installs to *Default*; migrate existing to *Instant* (preserve behavior) with a one-time notification.
4. Field-carry test: 48h pocket carry, log accidental triggers.

**Dep.** None.

### #110 — Border Mode wizard — **M, integrator**
**Approach.** Bundle toggles, not a new subsystem.
1. Single `BorderModeProfile` flips: duress PIN required, biometrics off, BFU auto-reboot 15m, DMS 12h, cloud AI disabled, Tor strict, mesh off.
2. Residual-risk briefing acknowledged (checkbox, text logged locally) before activation.
3. Symmetric disable path (also acknowledged).
4. Instrumentation test verifies every sub-setting actually applied.

**Dep.** #95, #98, #99, #100. Ship last in this cluster.

## At-rest / seizure

### #99 — USB-data lockout backport — **L**
**Approach.** Port Android 16 APM behavior to our Android 15 base; limit scope to the lock-state hook.
1. Study AOSP 16 commit history for `UsbDeviceManager` / `UsbPortManager` changes.
2. Backport to LineageOS 22.1 fork as an overlay patch in `overlays/`.
3. HAL-level fallback where framework gating isn't enough: drop USB data roles in `init.lethe-usb.rc` when `keyguard.locked=1`.
4. Test matrix: Pixel 7, one OnePlus, one Fairphone — verify `lsusb` on host shows charging-only.
5. Document devices where this can't be enforced (USB-C alt modes, older kernels).

**Dep.** Prereq for Border Mode (#110).

### #100 — BFU auto-reboot — **S**
**Approach.** Leverage existing inactivity timers plus a power-manager hook.
1. `lethe.bfu.timeout_minutes` system property; default 15 for field build, 60 for standard.
2. Inactivity detection = screen off + no unlock for N minutes.
3. Reboot uses existing safe-reboot (flush, unmount) not `reboot -f`.
4. Exempt: active call, active DMS heartbeat send, OTA in progress.
5. Presets UI in Security.

**Dep.** None.

### #101 — Per-session encryption keys to P0 — **L, research**
**Approach.** Design doc first, then prototype; do not ship until externally reviewed.
1. Threat model: define "session" (per-boot? per-unlock?); scope (FBE class keys? auxiliary?).
2. Derive ephemeral key from TEE-backed boot entropy + optional passphrase; never persist.
3. Bind FBE class keys (DE/CE) to ephemeral root; on reboot, class keys unwrappable only with fresh ephemeral → data at rest becomes noise.
4. Prototype on Pixel first (Titan M2 makes this tractable); non-TEE devices get a documented degraded version.
5. External review (NLnet-friendly cryptographer) before merge.

**Dep.** Design review gates everything. Biggest single item.

### #102 — Hidden volumes — **L, research**
**Approach.** Feasibility first. Be willing to say "not shippable on flash" if that's the honest answer.
1. Literature pass: Shufflecake, HIVE, deniable FS on flash with TRIM.
2. Mobile-specific threat model (wear-leveling, TRIM, eMMC vs UFS, forensic free-space analysis).
3. Decide: port Shufflecake as dm-target, OR ship a second-profile-with-stronger-isolation (honest limitation), OR document that deniable storage isn't achievable and advise travel-with-clean-device.
4. If port: prototype on one device, publish residual-risk doc.

**Dep.** None, long horizon. OK to mark "P3, research ongoing" rather than promise.

### #111 — Browser cache/autofill in burner wipe — **S**
**Approach.** Audit and extend the wipe path; no new mechanism.
1. Enumerate Mull's profile paths (`/data/data/us.spotco.fennec_dos/*`).
2. Add to `init.lethe-burner.rc` wipe list.
3. Also cover WebView data dirs, download history, media scanner cache.
4. Instrumentation test: populate profile → trigger burner → assert empty.

**Dep.** None. Quick win.

### #113 — Bootloader matrix — **S, docs**
**Approach.** Transparency over restriction.
1. Enumerate supported devices from `devices.cfg`; columns: bootloader-relockable, custom-AVB supported, modem-isolated, TEE-backed keys.
2. Publish as `docs/DEVICE-SECURITY.md`.
3. First-boot banner: "This device cannot lock its bootloader — physical attacker can flash custom recovery. OK for privacy, not high-risk."
4. Mark unsuitable devices as "Standard" tier; hide from field-build default list.

**Dep.** None.

## Comms / remote ops

### #103 — Remote-wipe gateway — **L**
**Approach.** Onion hidden service — don't add a cloud account dependency.
1. Device runs a Tor hidden service exposing a minimal command API (HTTP + auth).
2. Pairing: editor scans a QR with `.onion` + Ed25519 pubkey + rotating shared secret.
3. Commands: `status`, `dms-extend`, `dms-trigger`, `lock`, `wipe`, `brick`. All signed; monotonic nonce.
4. Rate-limited; logs stored locally and wiped on trigger.
5. Editor-side: small CLI (`lethe-remote`) and optional simple Android app sharing the keypair.

**Dep.** Tor already present. Good NLnet milestone candidate.

### #104 — Pre-install Signal/Briar + SecureDrop docs — **S**
**Approach.** Ship apps in the image, not install at first boot.
1. Add Signal (F-Droid build) and Briar APKs to `manifest.yaml` pre-installed list.
2. Orbot proxy config pushed via a first-boot script for Signal.
3. SecureDrop workflow doc: Tor Browser + onion URL + fingerprint verification.
4. License / redistribution review for bundling Signal.

**Dep.** Address license review early.

### #107 — Mesh heartbeat → DMS — **S**
**Approach.** Finish the TODO at `p2p/main.go:257`.
1. Whitelist of paired-peer Ed25519 pubkeys in keystore.
2. On signed heartbeat receipt (with monotonic counter), touch the DMS heartbeat file.
3. Replay protection: counter must exceed last-seen per peer.
4. Integration test with two nodes over BLE loopback or libp2p in-memory transport.
5. Settings UI: list paired peers, last-seen, revoke.

**Dep.** None.

## Network

### #105 — IMSI-catcher detection — **L**
**Approach.** Device-capability gated. Be honest about which devices can do it.
1. Device matrix: which basebands expose Qualcomm DIAG or equivalent.
2. Port SnoopSnitch's detection logic or bundle it; Quick Settings tile for status.
3. Alerts: 2G-downgrade, cipher-null, silent SMS, unusual cell-tower churn.
4. For devices without DIAG: reduced signal (2G-presence warning from telephony APIs).
5. Document per-device support level in DEVICE-SECURITY.md (#113).

**Dep.** #113.

### #108 — Newer Tor pluggable transports — **S**
**Approach.** Bundle and expose; let users pick.
1. Add meek-azure, webtunnel, snowflake (via Orbot's PTs or tor-android bundle).
2. Settings UI: bridge selection with "auto-probe" (direct → obfs4 → webtunnel → meek → snowflake).
3. Store last-working PT per network SSID / carrier for fast reconnect.
4. Document tradeoffs (meek slow, snowflake variable).

**Dep.** Upstream tor-android PT availability.

### #112 — mDNS identity leak — **S**
**Approach.** Default off; replace broadcast with consented rendezvous.
1. Remove mDNS from default `peers` config.
2. Rendezvous via short-lived shared code (Magic Wormhole style): both devices enter the same code, libp2p uses it as a rendezvous point.
3. Warn if user enables mDNS; extra warning on public / unknown SSIDs.
4. Docs on privacy properties of each mode.

**Dep.** None. Fast follow.

## Provenance & transparency

### #109 — EXIF strip + ProofMode — **M**
**Approach.** System-wide share interceptor plus bundled ProofMode.
1. Share-sheet hook: any image/video Intent whose target isn't in a small whitelist (Signal, ProofMode, Maps) triggers a "Strip location/metadata?" prompt, default Yes.
2. Strip support: JPEG, PNG, WebP, HEIC, MP4 (libexif + ffmpeg-android or existing tooling).
3. Pre-install ProofMode; first-boot page explains "sign" vs. "strip" (opposite intents).
4. Document C2PA notary dependency honestly.

**Dep.** None. Meaningful journalist win.

### #114 — Warrant canary — **M**
**Approach.** Simple, boring, hard to coerce.
1. Monthly signed statement on IPNS; content references a current news headline to prove freshness.
2. Signing ceremony: threshold signature (2-of-3) across geographically distributed maintainers.
3. Client fetches on OTA check; surfaces in Settings → About with green / yellow / red indicator tied to age.
4. If N days stale → visible warning.
5. Document explicitly what the canary does *not* cover (e.g. gag orders in some jurisdictions).

**Dep.** Maintainer coordination for signing ceremony.

### #115 — SBOM + reproducible builds + agent submodule — **M**
**Approach.** Transparency hygiene.
1. CycloneDX SBOM generated in CI (Nix flake makes this straightforward).
2. `REPRODUCIBLE.md` with exact Nix commands producing bit-identical artifacts; CI builds twice and diffs.
3. Pin agent-backend submodule (bender/) at a specific SHA; include in audit scope; publish its SBOM.
4. Attach SBOM + build attestation (SLSA L2 → L3 over time) to each GitHub release.

**Dep.** Nix already supports reproducible inputs; mostly plumbing.

## Suggested sequencing

- **Week 1–2 (quick wins):** #95, #97, #98, #106, #107, #108, #111, #112, #113
- **Weeks 3–6 (integrator work):** #96, #100, #104, #109, #110, #114, #115
- **Weeks 6+ (research / heavy lifts):** #99, #101, #102, #103, #105
