# EU Telecom Regulation & LETHE's Mesh — Research

> Last updated: 2026-04-26
> Status: Research draft — NOT legal advice. Consult specialized counsel
> before any public release that markets the mesh as a communications
> service. Cross-references: `legal-compliance.md`, `gems-decentralized-mesh.md`.

This note maps the EU telecom regulatory perimeter onto LETHE's BLE mesh
signaling (v1.0 preview) and the planned Briar/Iroh/Yggdrasil expansion
(v1.1+). The goal is to design the feature so it stays clear of
"Public Electronic Communications Network/Service" (PECN/PECS)
obligations without compromising the privacy posture.

---

## 0. What the mesh is for (and what it isn't)

**The LETHE mesh is a dead man's switch transport.** Trusted LETHE
devices broadcast 21-byte HMAC-SHA256-tagged liveness heartbeats; if
the user goes silent (arrested, devices seized, lost-at-sea), the
surviving peers detect the silence and the DMS escalation
(lock → wipe → brick) fires on schedule. The mesh is a distributed
liveness oracle — it carries no user-authored content.

**It is explicitly not a chat, voice, or file-transfer network.** That
job is delegated to apps that already do it well: Molly-FOSS (Signal
fork) for existing contacts, Briar for offline / anonymous /
trust-ring conversations. Both are recommended in `FEATURES.md`'s
Apps section and Briar shares the BLE radio with our DMS mesh.

The "no user content" rule is load-bearing for three reasons, in
order of weight:

1. **Engineering pragmatism.** A LETHE-only mesh would have hundreds
   of users; Briar already has many thousands of EU users and a
   mature codebase. Reinventing chat crypto on a smaller anonymity
   set is worse privacy, not better.
2. **DMS scope sufficiency.** Liveness heartbeats are all the DMS
   needs. Adding chat would not improve dead-man detection.
3. **Regulatory exemption.** Keeping the mesh content-free keeps it
   outside the ECS definition (see §1.2 below). This is a
   downstream consequence of (1) and (2), not the cause — but a
   useful one.

The regulatory analysis in §1–§5 below assumes this scope and
recommends the design tripwires that keep it intact.

---

## 1. The regulatory perimeter

### 1.1 The EECC: who is regulated

The European Electronic Communications Code (Directive (EU) 2018/1972,
"EECC") is the load-bearing instrument. It expanded telecom rules from
"the phone company" to cover three classes of operator:

1. **Network operators** — own the physical infrastructure (Orange,
   Deutsche Telekom). Heaviest obligations (access, build-out, 5G).
2. **Service providers** — resell connectivity (MVNOs). Consumer
   protection, billing transparency, number portability.
3. **OTT players** — split into two:
   - **Number-based** (Skype Out, Viber): treated almost like telcos.
   - **Number-independent** (WhatsApp, Signal): subject to security,
     accessibility, and data-handling rules; exempt from 112 emergency
     calling.

Enforcement runs through BEREC (EU-level) and NRAs (ARCEP/FR,
BNetzA/DE, AGCOM/IT, etc.).

### 1.2 The "remuneration" gatekeeper

Article 2(4) EECC defines an Electronic Communications Service as one
"normally provided for remuneration" via electronic networks. Case
law (notably C-193/18, Google/Gmail) reads "remuneration" broadly —
including data-as-payment — but **a non-commercial, no-data-extraction,
self-hosted tool is generally outside the ECS definition**.

Implication for LETHE: as long as the mesh is shipped as on-device
software with no service contract, no central server, no subscription,
and no telemetry, it is not an ECS and not a PECN.

### 1.3 The Radio Equipment Directive (RED)

Directive 2014/53/EU governs the hardware. LETHE relies entirely on
license-exempt bands (Bluetooth 2.4 GHz; future LoRa 868 MHz; WiFi
2.4/5 GHz). Two constraints matter:

- **Power limits (EIRP)** — 100 mW for 2.4 GHz, 25 mW for LoRa 868.
  Software that lets the user exceed these is a RED violation. Our
  BLE service uses stock Android `BluetoothLeAdvertiser`, which the
  baseband enforces; we cannot exceed limits even if we tried.
- **CE marking + reuse** — we ship software, not hardware. The phone
  vendor's existing CE mark covers the radio. We add no liability.

### 1.4 The Cyber Resilience Act (CRA)

Regulation (EU) 2024/2847 imposes security obligations on "products
with digital elements" placed on the market. Open-source software
"developed or supplied outside the course of a commercial activity"
is exempt (Recital 18, Art. 2(8)). LETHE is GPLv3 with no commercial
distribution channel, no paid support, no SaaS — the exemption covers
us, but the line moves: if LETHE ever takes paid support contracts or
ships through a commercial reseller, CRA obligations attach.

### 1.5 The DSA (intermediary services)

Regulation (EU) 2022/2065 targets "intermediary services" — caching,
hosting, online platforms. A purely peer-to-peer mesh with no
intermediary node is not in scope: there is no provider to serve a
notice on. The DSA's leverage point is the **gateway** (where the
mesh touches the open internet), not the mesh itself.

---

## 2. Why LETHE's v1.0 mesh sits outside the perimeter

| Factor                         | LETHE v1.0 mesh                              | Conclusion             |
|--------------------------------|----------------------------------------------|------------------------|
| Remuneration                   | None. GPLv3, no service.                     | Not an ECS.            |
| Centralized provider           | None. Peer-to-peer, no server.               | Not a PECN.            |
| Spectrum                       | License-exempt (BLE 2.4 GHz).                | RED-compliant.         |
| Power output                   | Baseband-enforced.                           | RED-compliant.         |
| Message content                | None. HMAC-tagged 21-byte heartbeat only.    | No "communication".    |
| Internet gateway               | None in v1.0.                                | DSA out of scope.      |
| Commercial activity            | None.                                        | CRA exempt.            |

The "no message content" point is load-bearing. The mesh signals
liveness; it carries no user-authored data. Even under an aggressive
re-reading of "communications service", a network that cannot transmit
arbitrary content is closer to a beacon than a telco.

This is also why **`docs/research/gems-decentralized-mesh.md` records
the no-conversation rule as load-bearing** (commit c1edadf). It is
not just a privacy property; it is a regulatory one.

---

## 3. Fragility points (v1.1+ planning)

### 3.1 The Telegram precedent

The August 2024 indictment of Pavel Durov in France marks a shift in
how Article 6 LCEN (FR Digital Economy Law) is applied:

- **Old reading**: a host is shielded unless they refuse a takedown.
- **New reading**: a system that *intentionally lacks* moderation or
  intercept tooling is "complicit" in whatever crimes flow through it.

The mesh parallel: a network that is "dark by design" with no
administrator, no logs, and no way to respond to a legal-intercept
order may be argued to constitute a "criminal tool" rather than a
communications service. This is theoretical for a peer-to-peer mesh
(no Durov to arrest), but the developers and top contributors of the
protocol become the surrogate target.

**Mitigation**: keep the mesh signaling-only. The further v1.1+ goes
toward arbitrary message relay, the closer it walks to this precedent.
Briar bramble-core integration must inherit Briar's contact-graph
gating (no relay for non-trust-ring peers).

### 3.2 The CRA exemption boundary

CRA's open-source exemption is stable for now, but two scenarios break
it:

- LETHE accepts **paid support contracts** (e.g. for governments or
  NGOs) → "commercial activity" → CRA applies → mandatory CE marking,
  vulnerability disclosure, security updates for the support period.
- A **third party redistributes LETHE commercially** (preloaded on
  hardware they sell) → that third party becomes the manufacturer
  under CRA, not us.

**Mitigation**: keep distribution non-commercial. If we ever take
funding tied to delivery commitments (NLnet milestones don't count;
paid B2B does), revisit.

### 3.3 RED for LoRa (v1.1+)

LoRa moves us into 868 MHz, also license-exempt but with a duty cycle
limit (1% per hour on most sub-bands). Meshtastic firmware enforces
this; if we vendor it we inherit that compliance. If we write our
own LoRa stack, we own the duty-cycle correctness.

### 3.4 The gateway problem (v1.2 — Iroh/Yggdrasil)

The moment the mesh touches the open internet (an exit node, an Iroh
relay, a Yggdrasil peer with an IPv4 uplink), the gateway operator
becomes the "librarian" — the IP address shows up in any abuse
complaint sourced from the mesh. The DSA's "mere conduit" defence
(Art. 4) protects them only if they don't initiate, select, or modify
the traffic.

**Mitigation**: gateways must be opt-in and clearly documented as
making the operator a *de facto* service provider. The default LETHE
config in v1.2 must NOT auto-elect any device as a gateway.

---

## 4. Design choices that follow

These are direct consequences for the codebase:

1. **No content in mesh frames, ever.** v1.0: HMAC-tagged liveness
   only. v1.1 (Briar bridge): only structured deadman alarms ride
   the bridge under a dedicated `deadman-signal` ClientId — no
   chat, no files, no attachments, no piggybacking. v1.2
   (Iroh/Yggdrasil): same boundary holds. Enforce in protocol with
   a fixed payload schema, not policy. The "thin line" question
   was considered and rejected: see §0.
2. **No central server, no telemetry.** Anywhere. The "no remuneration"
   shield holds only if there is genuinely nothing to monetize.
3. **Trust ring is local.** Pairing by QR or out-of-band file copy.
   No directory service, no discovery server.
4. **Gateway = explicit user action.** No auto-election in v1.2.
   `persist.lethe.mesh.gateway_enabled` defaults to false.
5. **Document the regulatory frame in-product.** First-boot onboarding
   states clearly: this is signaling-only, not a chat/SMS replacement,
   and the user is operating their own equipment.
6. **Sybil resistance via Web of Trust, not Proof-of-Stake.** Tokens
   would re-introduce remuneration and trip ECS/MiCA territory.
   Pairing-based vouching keeps the mesh free of financial flows.

---

## 5. Open questions

- **Briar's own status.** Briar is shipped by a UK non-profit and runs
  on user devices with no server. Has any EU NRA classified it? If
  not, the LETHE+bramble-core combination should inherit that
  silence. (TODO: check Briar's own legal posture, noyb.eu cases.)
- **EDPB position on offline mesh.** The EDPB has guidance on E2EE
  messaging (15/2021) but nothing yet on offline meshes. Watch for
  2026 updates tied to Chat Control / CSAR.
- **Member-state divergence.** France's loi SREN (2024) and Germany's
  TKG amendments may impose obligations beyond the EECC floor. Audit
  the top-3 markets before any v1.0 release.
- **Hardware-bundle scenario.** If a partner ever ships LETHE
  preloaded on a phone, who is the "manufacturer" under CRA? Likely
  them, but written agreement should make this explicit.

---

## 6. Provenance

Section 1 and Section 3 build on a Gemini sparring session
(2026-04-26) on EU telecom regulation, the Telegram case, and
mesh-network exemptions. The original transcript is archived in the
project's AI provenance log if needed; this note keeps only the
load-bearing arguments and applies them to the v1.0 mesh design.
Citations to specific articles and case numbers were verified
against EUR-Lex; the regulatory dates and case references are factual
and not AI-generated.
