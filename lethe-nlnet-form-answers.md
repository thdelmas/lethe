# LETHE — NLnet NGI0 Commons Form Answers

Status: distilled from `lethe-nlnet-draft.md`. Each section is
submission-ready and standalone. Paste directly into the form.

Target call: **NGI Zero Commons Fund**
Submission deadline: **2026-06-01 12:00 CEST**

---

## Contact

- Name: Théophile Delmas
- Email: contact@theophile.world
- Phone: [to fill — optional?]
- Organisation: [individual — confirm with NLnet reply; fallback "Théophile Delmas (independent)"]
- Country: France

---

## Proposal name

**LETHE — privacy-first, decentralized Android for old phones, with on-device AI**

Rationale: four NGI0 Commons scope keywords in reading order — privacy
(trust), decentralized (p2p / mesh architecture), old phones
(sustainability, digital inclusion), on-device AI (local inference,
not cloud). All four are verifiable against the repository.

---

## Website / wiki

- Project: https://github.com/thdelmas/OSmosis
- Submodule: https://github.com/thdelmas/lethe
- Personal: https://theophile.world

---

## Abstract (~150 words)

LETHE is a privacy-first, decentralized Android built on LineageOS
that treats forgetting as the default. Every reboot wipes state. All
traffic is routed through Tor at the firewall level. A duress PIN and
panic wipe are built in. Unlike existing privacy ROMs, LETHE is not
Pixel-locked — it targets devices LineageOS supports, currently
including a 2012 Galaxy Note II that would otherwise be e-waste.

LETHE ships a libp2p-based peer-to-peer layer: offline LAN firmware
sharing, BLE mesh relay for dead-man's-switch signals, IPNS-based
config channels, and distributed peer inference that lets capable
devices share AI compute with nearby weaker ones. No central server
is required for the OS to function.

LETHE is also the agent. The system ships with a guardian persona
rendered as an in-OS 3D avatar, routing tasks across user-supplied
cloud LLM keys, local on-device models, or peers on the mesh. Opt-in
protection modules cover financial scam defence (PreuJust) and
wellness (Bios), with the OS — not a third-party app — as the trust
boundary.

The goal: move from device guardian to life guardian without ever
selling the user out. Release target: 2026-05-04.

---

## Prior involvement

I am Théophile Delmas, an independent French developer. I maintain
**OSmosis** (https://github.com/thdelmas/OSmosis), a firmware-
liberation toolkit for unlocking, flashing, and repurposing Android
devices across vendors (Samsung, Xiaomi, Motorola, Sony). OSmosis
already ships a compliance-as-code audit engine for mobile security
posture, which LETHE extends at runtime. LETHE is developed as a
submodule of OSmosis and reuses its device-support infrastructure.

Background: 42 Paris alumnus, long-time hardware tinkerer and
self-taught C programmer. No prior grant funding. No institutional
affiliation.

---

## Requested amount

**EUR 50,000** (the NGI0 Commons ceiling).

---

## Budget breakdown

| Work package                                        | Days | Rate (€) | Total (€) |
|-----------------------------------------------------|-----:|---------:|----------:|
| WP1 — Burner Mode + Tor firewall hardening          |   30 |      400 |    12,000 |
| WP2 — Old-device support matrix (Note II + 4 more)  |   25 |      400 |    10,000 |
| WP3 — Guardian agent: LLM routing + local inference |   30 |      400 |    12,000 |
| WP4 — Avatar pipeline + accessibility polish        |   15 |      400 |     6,000 |
| WP5 — Compliance-as-code runtime audit              |   15 |      400 |     6,000 |
| WP6 — External security review                      |    — |    fixed |     4,000 |
| **Total**                                           |  115 |          | **50,000**|

Each WP = one NLnet milestone (payment trigger).

Day rate €400 is conservative for senior EU development. No other
funding sources today. If this grant lands, it is the first.

Honesty note: the LETHE repository is young (first commit 2026-03-29).
The budget is forward-looking scope for v1.0 hardening through
post-v1.0 work, not retrospective effort. The parent project OSmosis
(older) carries the compliance-as-code engine and device-support
infrastructure the WPs build on.

---

## Technical challenges

1. **Old-kernel support.** Exynos 4412 (2012), kernel 3.4.x, no File-
   Based Encryption, broken on LineageOS 13+. Keeping an Android 7.1
   branch alive alongside LineageOS 22.1 (Android 15) is a non-trivial
   build-matrix problem and is what lets us ship to e-waste-tier
   devices that every other privacy ROM writes off.

2. **Tor-at-firewall enforcement without leaks.** iptables/nftables +
   netd hooks must hold under reboot, modem state changes, captive
   portals, and airplane-mode toggles. Leak-free is the only
   acceptable posture for the users this is designed to protect.

3. **Burner Mode integrity.** Wiping state on every boot while keeping
   the OS itself verified and the user's opt-in persistent data (keys,
   flagged contacts) intact. FBE-style keyed storage layered on top of
   LineageOS's existing encryption.

4. **Agent inference on ARMv7.** Getting a meaningful local model onto
   a 2012 phone is likely impossible, but *routing* is tractable:
   quantised tiny models for intent classification plus remote for the
   heavy lift, with the OS mediating so the user's data never silently
   leaves the device.

5. **3D avatar → APNG pipeline.** We render a 3D guardian, then bake it
   to APNG sequences to avoid running a GL pipeline on weak GPUs
   (Mali-400 caps at OpenGL ES 2.0). Prototype exists; needs hardening
   and an accessibility pass.

6. **Compliance-as-code audit engine (runtime).** OSmosis already ships
   a build-time audit. Extending it so LETHE can self-audit at
   *runtime* — permissions, network egress, model calls — and produce
   a human-readable, EU-AI-Act-aligned report for the user.

7. **Decentralized peer inference on heterogeneous hardware.** libp2p
   sidecar already shipped; the hard part is making a Mali-400 phone
   on ARMv7 usefully request inference from a Snapdragon 8 Gen 3 peer
   on the same LAN without leaking intent to a central server and
   without degrading gracefully into "just phone the cloud." Model-
   weight verification, peer trust, and adversarial-peer handling are
   all open. BLE mesh relay (already shipped for the dead-man's-switch)
   hints at the carrier; the protocol needs hardening.

---

## Ecosystem

**Upstream LETHE depends on:** LineageOS (base), Robotnix / Nix
(reproducible builds), F-Droid (app distribution), Tor Project
(network layer), libp2p + IPNS (decentralized config and peer-to-peer
layer). We contribute fixes upstream where they land cleanly; we do
not fork projects we can improve in place.

**Siblings in the privacy-mobile space:** DivestOS, CalyxOS,
GrapheneOS, /e/OS, Replicant. LETHE is **complementary, not
competing** — our niche is old devices plus an integrated guardian
agent, two axes none of those projects cover. We plan direct outreach
to Replicant (closest spiritual sibling) and DivestOS (closest
technical sibling).

**Engagement and promotion:**
- Two Discord servers (OSmosis main + LETHE dedicated) for community
  testing and feedback
- Release com plan targeting the GitHub "awesome-*" list ecosystem
  (awesome-privacy, awesome-android, awesome-selfhosted, awesome-foss)
  for organic discoverability at v1.0.0 launch
- Personal channel via https://theophile.world feeding GitHub
- v1.0.0 public release on 2026-05-04

**Beneficiaries:** journalists, survivors of domestic abuse, activists,
and anyone who cannot afford the €800 Pixel flagship currently required
by mainstream privacy ROMs. The drawer-phone demographic is
underserved precisely because it is not commercially attractive.

---

## Comparison with existing efforts

| Project      | Base      | Devices                      | Forget-by-default | Integrated agent | Status      |
|--------------|-----------|------------------------------|:-----------------:|:----------------:|-------------|
| GrapheneOS   | AOSP      | Pixel only                   |        No         |        No        | Mature      |
| CalyxOS      | AOSP      | Pixel + few                  |        No         |        No        | Mature      |
| DivestOS     | LineageOS | ~100 devices                 |      Partial      |        No        | Maintenance |
| /e/OS        | LineageOS | ~200 devices                 |        No         |        No        | Mature      |
| Replicant    | AOSP      | Very few (old Samsung)       |        No         |        No        | Slow        |
| **LETHE**    | LineageOS | inherits LOS tree, incl. 2012|      **Yes**      |     **Yes**      | Pre-1.0     |

Two axes are unique to LETHE: **forget-by-default** and an
**integrated guardian agent**. Every other row is more Pixel-locked
and less amnesiac than LETHE. No existing project combines old-device
reach, non-Pixel privacy, amnesia-by-default, and an integrated
guardian; that is the gap LETHE fills.

---

## Generative AI disclosure

Yes. Generative AI (Claude Opus 4.6, Anthropic) has been used during
the drafting of this proposal and during LETHE development for
documentation, code review, and research synthesis.

A prompt provenance log — model, dates, prompts, unedited output — is
maintained in the repository at `docs/research/ai-provenance.md` and
will be supplied on request. A follow-up question has been sent to
NLnet regarding the required visibility and timestamp granularity of
this log; the format will be adjusted to match NLnet's guidance.

Sanitisation applied: per-day timestamps (not per-minute), third-party
names redacted, credentials and private invites stripped. Rationale:
precise timestamps plus verbatim prompt content form a behavioural
fingerprint, which conflicts with the privacy posture of the project
itself.

---

## Attachments (to prepare)

- `lethe/manifest.yaml` — device list
- `lethe/docs/RELEASE-v1.0.0.md` — v1.0.0 feature set
- `lethe/docs/EU-AI-ACT-AUDIT.md` — AI Act self-audit
- `lethe/docs/research/ai-provenance.md` — GenAI prompt log

---

## Open items before submission

- [ ] Legal-entity line in Contact section (pending NLnet reply)
- [x] Final proposal name chosen — optional Discord community test
- [x] Email set to contact@theophile.world
- [ ] Phone: check whether NLnet form makes it mandatory — skip if optional
- [ ] Provenance-log visibility confirmation (pending NLnet reply)
