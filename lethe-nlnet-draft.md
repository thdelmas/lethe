# LETHE — NLnet proposal draft

Status: brain-dump. Not submission-ready. Clean up in later passes.

Target call: **NGI Zero Commons Fund** (5k–50k €, broad FOSS/privacy/open-AI
scope). NGI Zero Core is closed — last call Oct 2024 — so Commons is the
only live option in this family.

**Deadline: June 1, 2026, 12:00 CEST.** ~7 weeks out.

Reference precedents on NLnet:
- Replicant (fully-free Android, Android 9 port)  — same family, older
- DivestOS (privacy-hardened LOS)                 — closest sibling
- CalyxOS, mobile-nixos, Maemo Leste, F-Droid     — ecosystem neighbours

The Replicant page is 80% essay on *why this matters*, ~20% technical.
NLnet pages read as advocacy + problem framing, not as Gantt charts.
Milestones live in the internal MoU, not the public page. Form itself
asks for: abstract, challenges, ecosystem, budget breakdown, comparison
with existing efforts.

---

## 1. Contact / org

- Name: Théophile Delmas
- Org: OSmosis (project) — legal entity TBD (sole trader? assoc. loi 1901?)
- Country: France
- Website: theophile.world → GitHub (OSmosis, lethe)
- Prior: OSmosis (firmware liberation toolkit), 42 Paris background

Open question: legal entity vs individual. NLnet's public form has an
"Organisation" field but no explicit toggle. No dedicated FAQ URL found.
**Action: email contact@nlnet.nl directly** — they are known to reply
quickly and to fund individuals under their own name. Historically
Calyx had Calyx Institute, Replicant had FSF-France, but smaller NGI0
Commons grants routinely go to individuals.

## 2. Proposal name

Working title: "LETHE — a forgetful, guardian-style mobile OS for
everyone, on any Android phone"

Alternatives to try:
- "LETHE: amnesiac Android for ~25 devices today (targeting 300+ via LineageOS inheritance)"
- "LETHE: privacy-by-default Android with an on-device guardian agent"

The "guardian agent" framing is what separates us from DivestOS / Calyx /
GrapheneOS. Lead with that.

## 3. Abstract (the whole project in one block)

Draft v1 (~150 words):

> LETHE is a privacy-hardened Android built on LineageOS that treats
> forgetting as the default. Every reboot wipes state. All traffic is
> routed through Tor at the firewall level. A duress PIN and panic wipe
> are built in. Unlike existing privacy ROMs, LETHE is not Pixel-locked
> — it targets ~25 devices today (targeting 300+ via LineageOS inheritance) including a 2012 Galaxy Note II that would
> otherwise be e-waste.
>
> LETHE is also the agent. The system ships with a guardian persona
> rendered as an in-OS 3D avatar, routing tasks across user-supplied
> cloud LLM keys or local models on capable hardware. Opt-in protection
> modules cover financial scam defence (PreuJust) and wellness (Bios),
> with the OS — not a third-party app — as the trust boundary.
>
> The goal: move from device guardian to life guardian without ever
> selling the user out. Release target: May 4, 2026.

~155 words. Close enough. Tighten more only if form has a hard limit.

## 4. Why this matters (Replicant-style essay section)

Points to land, in order:

1. Old phones are not trash. They have screens, radios, mics, batteries.
   Replacing a working phone every 2-3 years is an environmental and
   economic violence, and it's driven by software abandonment, not
   hardware failure. LETHE runs on a 2012 Note II.
2. Privacy ROMs today require you to *buy a new Pixel*. That's backwards.
   The people most in need of privacy (journalists, survivors of abuse,
   activists, the economically precarious) are the ones who can least
   afford a €800 flagship. LETHE targets the drawer phone.
3. Burner-by-default inverts the current model. Today the OS remembers
   everything unless you fight it. LETHE forgets everything unless you
   opt in. This matters for domestic abuse, border crossings, protest,
   and ordinary dignity.
4. The agent layer is not a gimmick. Users *already* talk to AIs about
   their health, their money, their relationships. Right now that data
   goes to OpenAI / Google / Meta. LETHE gives them the same affordance
   with local inference on capable hardware and user-held keys otherwise.
   The OS is the trust boundary, not a third-party app.
5. Compliance-as-code. OSmosis already ships an audit engine for mobile
   security posture. LETHE extends this: the OS can explain, in natural
   language and with receipts, *why* it's configured the way it is. This
   matters for EU AI Act, GDPR, and regulated sectors.

Cut to 2-3 of these for the real form. #1, #2, #3 are strongest.

**Trimmed version (~400 words) for submission:**

> Most people throw away working phones every two to three years. The
> hardware is fine — the software has been abandoned. A 2012 Galaxy
> Note II has a working screen, mic, speaker, battery, and two radios,
> and it is sitting in a drawer because Samsung and Google decided its
> life was over. This is environmental and economic violence dressed
> up as product cycles. LETHE runs on that phone, and the architecture
> inherits from LineageOS device trees so adding a supported device is
> a packaging problem, not a porting problem. ~25 devices are currently
> listed and tested; the LineageOS base covers hundreds more.
>
> Privacy ROMs today have a second problem: they tend to require a
> recent Pixel. GrapheneOS, the gold standard, only ships for Google's
> own phones. CalyxOS is similar. This means the people who need
> privacy most — journalists, survivors of domestic abuse, activists,
> the economically precarious — are precisely the ones who can't
> afford the €800 flagship needed to get it. LETHE targets the drawer
> phone because that's what most of the world actually has.
>
> The third inversion is default behaviour. Every mainstream OS
> remembers everything unless the user fights it. LETHE forgets
> everything unless the user opts in. Burner Mode is on by default:
> reboot and you are a new device. This matters concretely at
> borders, at protests, in coercive relationships, and in the
> ordinary case of selling or giving away a phone without worrying
> what's still on it. The duress PIN looks normal and wipes on entry.
> The panic gesture wipes in under a second.
>
> The fourth axis is the agent. People already talk to AI systems
> about their health, their money, and their relationships. Today
> that data flows to OpenAI, Google, and Meta by default. LETHE gives
> the same affordance with the OS itself as the trust boundary:
> user-held API keys, local inference on capable hardware, and an
> explicit guardian persona whose job is to protect the user, not
> upsell them. Protection modules (scam defence, wellness) are opt-in
> and local.
>
> None of the four — old-device reach, non-Pixel privacy, amnesia by
> default, integrated guardian — is novel alone. No existing project
> combines all four. That is the gap LETHE fills.

## 5. Technical challenges

Real hard problems, not fluff:

- **Old-kernel support.** Exynos 4412 (2012), kernel 3.4.x, no FBE,
  broken on LOS 13+. Keeping an Android 7.1 branch alive alongside
  LOS 22.1 (Android 15). Non-trivial build matrix.
- **Tor-at-firewall enforcement** without leaks on reboot, on modem
  state changes, on captive portals. iptables/nftables + netd hooks.
- **Burner Mode integrity.** Wiping state on every boot while keeping
  the OS itself verified and the user's opt-in data (keys, contacts
  they marked persistent) intact. FBE-style keyed storage on top of
  LOS's existing encryption.
- **Agent inference on ARMv7.** Getting a meaningful local model onto
  a 2012 phone is probably impossible — but *routing* is tractable:
  quantized tiny models for intent classification + remote for the
  heavy lift, with the OS mediating.
- **3D avatar → APNG pipeline.** We render a 3D guardian, bake it
  to APNG sequences to avoid running a GL pipeline on weak GPUs
  (Mali-400 caps at GLES 2.0). Already prototyped; needs hardening.
- **Compliance-as-code audit engine.** Already shipping in OSmosis.
  Extending it so LETHE can self-audit at runtime (permissions,
  network egress, model calls) and produce a human-readable report.

## 6. Ecosystem & promotion

- Upstream: LineageOS (base), Robotnix / Nix (reproducible builds),
  F-Droid (app distribution), Tor Project (network layer), Replicant
  (spiritual sibling — reach out).
- Adjacent: DivestOS, CalyxOS, GrapheneOS, /e/OS. Position LETHE as
  *complementary*, not competing — our niche is **old devices + agent**.
- Channels: Discord (OSmosis main + LETHE dedicated), theophile.world
  funnel, GitHub.
- Launch com plan (already drafted in docs/COMPLAN-v1.0.0.md): submit
  to awesome-* lists on GitHub for organic reach rather than paid.
- Release target: May 4, 2026.

## 7. Budget

Requested amount: draft at **€50,000** (midrange NGI0 Commons grant).

Rough breakdown (to refine):

| Work package                                     |   Days |   Rate |   Total |
|--------------------------------------------------|-------:|-------:|--------:|
| WP1  Burner Mode + Tor firewall hardening        |     30 |   €400 |  12,000 |
| WP2  Old-device support matrix (Note II + 4 more)|     25 |   €400 |  10,000 |
| WP3  Guardian agent: routing + local inference   |     30 |   €400 |  12,000 |
| WP4  Avatar pipeline + accessibility polish      |     15 |   €400 |   6,000 |
| WP5  Compliance-as-code runtime audit            |     15 |   €400 |   6,000 |
| WP6  Security review + external audit            |     —  |  fixed |   4,000 |
| **Total**                                        |    115 |        |**50,000**|

Each WP = one NLnet milestone. Milestones are what triggers payment.

Day rate €400 is on the low side for EU senior dev; keeps the ask small
and believable for a first grant. Can revise up if scope grows.

No other funding sources today. If this grant lands, it's the first.

**Honesty note for the proposal:** LETHE repo started 2026-03-29, so at
submission (June 1) it will be ~9 weeks old, ~20 workdays of commits.
The €50k / 115-day budget is forward-looking scope for v1.0 → post-v1.0
hardening, not retrospective effort. OSmosis (the parent project) is
older and carries the compliance-as-code engine and device-support work.
Frame the ask as "finish what's started" not "pay me for what I did."

## 8. Comparison with existing efforts

| Project      | Base        | Devices               | Forget-by-default | Agent | Status      |
|--------------|-------------|-----------------------|-------------------|-------|-------------|
| GrapheneOS   | AOSP        | Pixel only            | No                | No    | Mature      |
| CalyxOS      | AOSP        | Pixel + few           | No                | No    | Mature      |
| DivestOS     | LineageOS   | ~100 devices          | Partial           | No    | Maintenance |
| /e/OS        | LineageOS   | ~200 devices          | No                | No    | Mature      |
| Replicant    | AOSP        | Very few (old Samsung)| No                | No    | Slow        |
| **LETHE**    | LineageOS   | **~25 today, inherits LOS tree (incl. 2012)** | **Yes** | **Yes** | **Pre-1.0** |

Two unique axes: forget-by-default + integrated guardian agent. Every
other row is "more Pixel-locked and less amnesiac than us."

## 9. Generative AI disclosure

NLnet's policy (`/foundation/policies/generativeAI/`) requires a
**prompt provenance log** with: model used, dates/times of prompts,
the prompts themselves, and the unedited output. This is heavier than
a one-line disclosure.

Action: start a running log from today (2026-04-14) until submission
in `docs/research/ai-provenance.md`. Claude Opus 4.6 is the primary
model; log each session that produces proposal-text output. This draft
file itself was co-written with Claude on 2026-04-14 and needs to be
in the log.

---

## TODOs before submission (June 1, 2026)

Done:
- [x] Call: **NGI Zero Commons** (Core is closed since Oct 2024)
- [x] Deadline: **June 1, 2026, 12:00 CEST** (~7 weeks out)
- [x] Abstract tightened to ~150 words
- [x] "Why this matters" trimmed to ~400 words
- [x] Budget reality-checked against actual repo age (17 days, 11 workdays)

Action items that need YOU:
- [ ] Email contact@nlnet.nl to confirm individual eligibility
- [ ] Pick final proposal name — shortlist to test in Discord:
      (a) "LETHE: privacy-by-default Android for old phones"
      (b) "LETHE: amnesiac Android with an on-device guardian"
      (c) "LETHE: rescuing old phones with forgetful, guardian-grade Android"
- [ ] Decide legal structure (individual / sole trader / assoc. loi 1901)

Mechanical, do last:
- [ ] Add links: OSmosis repo, lethe repo, theophile.world, Discord
- [ ] Attach: manifest.yaml, RELEASE-v1.0.0.md, EU-AI-ACT-AUDIT.md
- [ ] Start AI prompt provenance log at `docs/research/ai-provenance.md`
- [ ] Complete AI disclosure from that log at submission time

## Notes on tone

Replicant's page reads as a *manifesto*. We should too. The form wants
problem framing more than Gantt. Save the hard dates for the MoU.
Don't oversell the agent — position it as "the OS has a voice, and that
voice is on your side" rather than "LLM-powered assistant."
