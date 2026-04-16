# LETHE — NLnet NGI0 Commons Form — YOUR-VOICE SKELETON

This file is the version you write yourself. NLnet's FAQ explicitly
discourages AI-drafted proposals ("Please grant us the courtesy of
writing the proposal yourself"). Submitting the current
`lethe-nlnet-form-answers.md` as-is risks rejection on form.

How to use this file:
- **Fill in every `[WRITE: ...]` block in your own voice.** Short,
  direct, specific. Reviewer attention is scarce.
- The tables, budget, and facts are preserved — those are neutral
  and don't need rewriting.
- Use `lethe-nlnet-form-answers.md` as a reference for what facts to
  include, but do not copy its prose. Your cadence, your sentences.
- I (Claude) will review and edit, not draft.

---

## Contact

- Name: Théophile Delmas
- Email: contact@theophile.world
- Phone: [decide: real number, Google Voice, or leave blank if form allows]
- Organisation: Théophile Delmas (independent) — per NLnet FAQ,
  individuals can apply; alias available if desired
- Country: France

---

## Proposal name

**LETHE — privacy-first, decentralized Android for old phones, with on-device AI**

---

## Website / wiki

- Project: https://github.com/thdelmas/OSmosis
- Submodule: https://github.com/thdelmas/lethe
- Personal: https://theophile.world

---

## Abstract (~150 words)

[WRITE: in your own voice, ~150 words. Must answer: what is LETHE,
who is it for, what makes it different, what ships on 2026-05-04.
Raw material you can pull from:
  - Privacy-first, decentralized Android built on LineageOS
  - Forgets by default — every reboot wipes state
  - All traffic through Tor at firewall level
  - Runs on devices LineageOS supports, including 2012 Galaxy Note II
  - Ships libp2p peer-to-peer layer: LAN firmware sharing, BLE mesh,
    IPNS config, distributed peer inference
  - Built-in guardian AI (local + cloud keys), in-OS 3D avatar
  - Opt-in modules: PreuJust (scam defence), Bios (wellness)
  - Release target: 2026-05-04
Pick the 3-4 most important, in your cadence. Don't try to fit it all.]

---

## Prior involvement

[WRITE: in your own voice, ~100 words. Who you are, what you've built,
why you are the right person to do this. Raw material:
  - Independent French developer
  - Maintain OSmosis (firmware-liberation toolkit, multi-vendor
    Android device support, compliance-as-code engine)
  - LETHE is a submodule of OSmosis and inherits its infrastructure
  - 42 Paris alumnus, long-time hardware tinkerer, self-taught C
  - No prior grant funding, no institutional affiliation
Your origin story (see memory: 42 Paris, hardware at 10, C at 13) is
a real asset here if you want to use it — reviewers read hundreds of
proposals and the ones written by humans with actual motivation stand
out. But only if you are comfortable sharing.]

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

[WRITE: one short paragraph in your voice. Justify the rate, state
that this is your first grant, note that no other funding sources
exist today. Mention that the LETHE repo is young (first commit
2026-03-29) and the budget is forward-looking scope for v1.0 →
post-v1.0 hardening, not retrospective effort.]

---

## Technical challenges

For each challenge, keep the label I pre-filled (it's a factual
pointer) and [WRITE: the explanation in your voice]. Keep each
under 80 words.

1. **Old-kernel support (Exynos 4412, kernel 3.4.x).**
   [WRITE: why this is hard, why it matters that LETHE tackles it,
   what you will ship to solve it.]

2. **Tor-at-firewall enforcement without leaks.**
   [WRITE: the leak-vector attack surface and your mitigation plan.]

3. **Burner Mode integrity.**
   [WRITE: how you preserve the OS while wiping user state every boot.]

4. **Agent inference on ARMv7.**
   [WRITE: why local inference on a 2012 phone is hard and what your
   routing strategy looks like.]

5. **3D avatar → APNG pipeline.**
   [WRITE: why baking 3D to APNG sequences (rather than running GL
   at runtime) is the right call for weak GPUs.]

6. **Compliance-as-code audit engine, extended to runtime.**
   [WRITE: what the runtime audit does, and how it ties to the EU AI Act.]

7. **Decentralized peer inference on heterogeneous hardware.**
   [WRITE: libp2p already shipped; the open problems are peer trust,
   model-weight verification, and adversarial-peer handling. Carrier
   is LAN + BLE mesh. Explain in your own words.]

---

## Ecosystem

[WRITE: two or three short paragraphs in your voice. Cover:
  - Upstream projects LETHE depends on (LineageOS, Robotnix/Nix,
    F-Droid, Tor Project, libp2p + IPNS) and your policy of
    contributing upstream rather than forking
  - Sibling projects (DivestOS, CalyxOS, GrapheneOS, /e/OS, Replicant)
    and how LETHE is complementary rather than competing
  - How you engage and promote (Discord servers, awesome-* lists,
    theophile.world, v1.0.0 launch 2026-05-04)
  - Who benefits: people who can't afford a €800 Pixel to get
    privacy today. Be specific about who that is without naming
    individuals.]

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

[WRITE: 2-3 sentences naming what makes LETHE different. The table
does most of the work already.]

---

## Generative AI disclosure

[WRITE: honestly, in your own words. Example structure — rewrite:

"I used Claude (Anthropic) during preparation of this proposal for:
research into NLnet precedent projects, assembly of the budget and
comparison tables, and editing passes on text I had written. The
proposal text itself is written by me. A prompt log is maintained at
`docs/research/ai-provenance.md` and can be provided on request."

Keep it short and specific. NLnet's stance: disclosure is mandatory,
and AI-drafted prose is viewed unfavourably. Editing and research
assistance are less fraught than drafting. Be truthful about which
category your use falls into.]

---

## Attachments

- `lethe/manifest.yaml` — device list
- `lethe/docs/RELEASE-v1.0.0.md` — v1.0.0 feature set
- `lethe/docs/EU-AI-ACT-AUDIT.md` — AI Act self-audit
- `lethe/docs/research/ai-provenance.md` — GenAI prompt log

---

## Pre-submission checklist

- [ ] Every `[WRITE: ...]` block filled in
- [ ] Re-read in one sitting — does it sound like you?
- [ ] Phone-number decision made
- [ ] Attachments built and sized (< 50 MB total)
- [ ] AI provenance log up to date
- [ ] Final read: no names of community members, no Discord invite
      codes, no API keys, no internal repo references
