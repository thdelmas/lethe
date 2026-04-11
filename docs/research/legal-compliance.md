# Legal & Regulatory Compliance Research

> Last updated: 2026-04-11
> Status: Research draft — NOT legal advice. Consult specialized counsel before release.

LETHE is a local-first AI agent OS bundling financial protection (PreuJust) and health protection (Bios) modules, with multi-LLM routing and privacy/encryption features. This document maps the legal landscape affecting its production, distribution, and use.

---

## Table of Contents

1. [Countries Where Distribution is Banned or Effectively Impossible](#1-banned--effectively-impossible)
2. [Countries With Severe Restrictions](#2-severe-restrictions)
3. [AI-Specific Regulations](#3-ai-specific-regulations)
4. [Health Module (Bios) — Medical Device Risk](#4-health-module-bios)
5. [Financial Module (PreuJust) — Fintech Regulation](#5-financial-module-preujust)
6. [Encryption & Privacy Tool Restrictions](#6-encryption--privacy-tool-restrictions)
7. [Data Protection Laws](#7-data-protection-laws)
8. [Export Controls & Sanctions](#8-export-controls--sanctions)
9. [Action Items](#9-action-items)

---

## 1. Banned / Effectively Impossible

| Country | Why | Key Laws |
|---------|-----|----------|
| **North Korea (DPRK)** | No civilian internet, all software government-approved, comprehensive sanctions prohibit all exports | UN Security Council resolutions, US/EU sanctions |
| **China** | AI algorithm filing required, content must comply with "socialist core values", encryption licensing, VPN restrictions, data localization, requires Chinese legal entity | Generative AI Measures (2023), Encryption Law (2020), PIPL (2021), Algorithm Recommendations Provisions (2022) |
| **Iran** | US/EU sanctions prohibit distribution; domestic encryption/VPN bans | US OFAC sanctions, Computer Crimes Law (2009) |
| **Syria** | US/EU sanctions prohibit distribution | US OFAC comprehensive sanctions |
| **Cuba** | US sanctions; extremely limited infrastructure | US OFAC comprehensive sanctions |

## 2. Severe Restrictions

| Country | Restrictions | Key Laws |
|---------|-------------|----------|
| **Russia** | Lawful interception requirements, VPN restrictions, data localization, AI registry, extensive sanctions | Yarovaya Law (374-FZ, 2016), VPN Law (2017), Data Localization (242-FZ) |
| **Belarus** | Mirrors Russia's approach; VPN restrictions; sanctions | 2015 VPN decree |
| **Turkmenistan** | VPN ban, heavy censorship | Telecom regulations |
| **Myanmar** | Military regime cybersecurity law, VPN restrictions | Cybersecurity Law (2021) |
| **Eritrea** | Extremely restricted internet access | — |
| **Vietnam** | Data localization, government access, content controls | Cybersecurity Law (2018) |
| **Saudi Arabia** | AI governance framework, content/encryption restrictions | PDPL (2023), AI ethics framework |
| **UAE** | Cybercrime law, privacy-focused tools in grey area | Federal Decree-Law 34/2021 |
| **Pakistan** | Broad surveillance powers, VPN grey area, can demand decryption | PECA (2016) |
| **Egypt** | Broad surveillance powers, encrypted comms viewed with suspicion | Anti-Cyber Crimes Law (2018) |

## 3. AI-Specific Regulations

### EU AI Act (Regulation 2024/1689)

**This is the most comprehensive and unavoidable obligation for a global release.**

- Entered into force August 1, 2024, phased compliance through August 2027
- LETHE's health (Bios) and financial (PreuJust) modules almost certainly trigger **high-risk** classification (Annex III, Categories 6 and 8)
- **Open-source exemption does NOT apply** to high-risk systems (Art. 2(12))
- Multi-LLM routing triggers General-Purpose AI (GPAI) provisions

**High-risk compliance requirements:**
- Risk management system (Art. 9)
- Data governance and quality (Art. 10)
- Technical documentation (Art. 11)
- Record-keeping / logging (Art. 12)
- Transparency to deployers (Art. 13)
- Human oversight capabilities (Art. 14)
- Accuracy, robustness, cybersecurity (Art. 15)
- Conformity assessment + CE marking
- Registration in EU database

**Prohibited practices (Art. 5):** LETHE must NOT implement social scoring, unauthorized real-time biometric ID, manipulation of vulnerable persons, or subliminal techniques.

**Penalties:** Up to EUR 35M or 7% global turnover (prohibited practices); up to EUR 15M or 3% (other violations).

### China — Multiple Overlapping Regulations

Algorithm filing, deep synthesis provisions, generative AI measures — all require Chinese legal entity and content compliance. Effectively blocked (see Section 1).

### US — Fragmented State-Level

- No comprehensive federal AI law as of early 2025
- **Colorado AI Act (SB 24-205):** Impact assessments for high-risk AI in consequential decisions (finance, health) — directly affects PreuJust and Bios
- California, other states have pending/enacted bills
- **Verify:** Whether any federal AI legislation passed in 2025-2026

### Other Jurisdictions Developing AI Laws

- **Canada (AIDA):** Part of Bill C-27, risk-based framework — verify if enacted
- **Brazil (PL 2338/2023):** EU-style risk framework — verify current status
- **South Korea:** AI Basic Act expected 2025
- **Japan:** Lighter principles-based approach, but health/financial sector-specific rules apply
- **India:** Sector-specific AI guidelines emerging
- **UK:** Pro-innovation approach but sector regulators (FCA, MHRA) enforce AI rules

## 4. Health Module (Bios)

**This is the single highest legal risk for LETHE.**

If Bios makes ANY health claims beyond general wellness, it triggers **Software as a Medical Device (SaMD)** regulation in virtually every developed country.

### What triggers SaMD classification

Software intended for: diagnosis, prevention, monitoring, prediction, prognosis, treatment, or alleviation of disease/injury.

### Key jurisdictions

| Jurisdiction | Regulator | Framework | Classification |
|-------------|-----------|-----------|----------------|
| **EU** | Notified Bodies | MDR 2017/745 | Class IIa+ for AI-based tools → CE marking, ISO 13485, clinical evaluation, post-market surveillance |
| **US** | FDA | SaMD guidance, 510(k)/De Novo/PMA | Risk-based; AI/ML-SaMD requires predetermined change control plan |
| **UK** | MHRA | UKCA marking | Similar to MDR |
| **Canada** | Health Canada | IMDRF-aligned | SaMD guidance |
| **Australia** | TGA | Therapeutic Goods Act | SaMD registration |
| **Japan** | PMDA/MHLW | — | SaMD approval required |
| **China** | NMPA | — | Registration required |
| **Brazil** | ANVISA | — | Registration required |
| **South Korea** | MFDS | — | Classification + approval |
| **India** | CDSCO | Medical Device Rules 2017 | Covers SaMD |

### Mitigation

- Scope Bios strictly as **wellness** (general fitness, lifestyle tracking, general information)
- **Never** allow it to: interpret lab results, diagnose conditions, recommend medications, predict disease
- Include prominent disclaimers ("not medical advice")
- Avoid marketing language that implies clinical capability
- Note: regulators look at substance over form — if it functions like a medical device, disclaimers won't help

## 5. Financial Module (PreuJust)

### What triggers financial regulation

Personalized financial advice, investment recommendations, account access, payment initiation, credit assessment, or fraud monitoring.

### Key jurisdictions

| Jurisdiction | Regulator(s) | Key Laws | Trigger |
|-------------|-------------|----------|---------|
| **EU** | National authorities | MiFID II, PSD2/PSD3 | Investment advice → firm authorization; account access → AISP/PISP license |
| **US** | SEC, FINRA, CFPB, state regulators | Investment Advisers Act 1940, Dodd-Frank | Personalized investment advice → SEC registration; payments → state money transmitter licenses |
| **UK** | FCA | Financial Services and Markets Act | Regulated activities require authorization |
| **Singapore** | MAS | Securities and Futures Act | Financial advisory license |
| **Australia** | ASIC | Corporations Act | Australian Financial Services License (AFSL) |
| **Japan** | FSA | FIEA | Registration for financial instruments business |
| **India** | RBI, SEBI | Various | Depending on activity type |
| **Brazil** | Central Bank, CVM | Various | Registration/authorization |

### Mitigation

- Position PreuJust as **information/education tool**, not advice
- Never make specific buy/sell/invest recommendations
- Avoid accessing bank accounts or initiating transactions (unless prepared for licensing)
- Include "not financial advice" disclaimers
- Same caveat: substance over form — if it functions like advice, regulators treat it as advice

## 6. Encryption & Privacy Tool Restrictions

### Countries that ban or severely restrict encryption/privacy tools

| Restriction Level | Countries | Notes |
|-------------------|-----------|-------|
| **Encryption licensing required** | China (FSB certification), Russia (FSB licensing) | Commercial encryption products need government approval |
| **VPN bans** | China, Russia, Iran, Turkmenistan, Belarus, North Korea | Government-approved VPNs only, or total ban |
| **Decryption on demand** | Russia (Yarovaya), India (IT Act s.69), Pakistan (PECA), UK (RIPA/IPA) | Authorities can compel decryption |
| **VPN grey areas** | UAE, Oman, Turkey, Iraq, Egypt | Legal for some uses, restricted/blocked for others |
| **Periodic shutdowns** | Ethiopia, Uganda, Tanzania, Myanmar | VPN/encryption blocked during political unrest |

### Implications for LETHE

LETHE's privacy-first architecture (encryption, local processing, potentially Tor/mesh features from the research docs) directly conflicts with lawful interception requirements in many countries. This is a feature-level legal conflict, not just a distribution issue.

## 7. Data Protection Laws

LETHE's local-first architecture is a **strong foundation** for privacy compliance. The main risk vector is the **multi-LLM API routing** — when user queries containing personal data are sent to external LLM providers.

### Key obligations by jurisdiction

| Law | Jurisdiction | Key Requirements | LETHE-Specific Risk |
|-----|-------------|------------------|---------------------|
| **GDPR** | EU/EEA | DPIA for health/financial processing, DPAs with LLM providers, transfer mechanisms for non-EU providers, breach notification (72h) | LLM API calls sending personal data outside EU |
| **LGPD** | Brazil | Similar to GDPR, separate consent for sensitive data (health, financial) | Same as GDPR |
| **PIPL** | China | Cross-border transfer security assessment, data localization for critical operators | Effectively blocked (see Section 1) |
| **CCPA/CPRA** | California | Consumer rights (access, deletion, opt-out), privacy notices | If developer meets thresholds |
| **DPDPA** | India | Notice and consent, purpose limitation, breach notification | Verify implementation rules status |
| **PIPA** | South Korea | Strengthened cross-border transfer rules (2023 amendment) | Health/financial data = sensitive |
| **APPI** | Japan | Consent for sensitive info, breach notification, cross-border limits | — |
| **POPIA** | South Africa | Operator/responsible party obligations | — |
| **PDPA** | Thailand | Consent for sensitive data, DPO, breach notification | — |

### Privacy by design wins

- Local-first processing minimizes data exposure
- On-device LLM inference (where possible) eliminates provider risk
- Per-task LLM routing should prefer local models for sensitive queries (health, financial)
- Transparent data flow documentation strengthens compliance posture

## 8. Export Controls & Sanctions

### US Export Administration Regulations (EAR)

**Encryption controls (ECCN 5D002):**
- Open-source exemption exists (EAR 740.13(e) / License Exception TSR)
- **Requirements:** Source code publicly available + email notification to BIS and NSA with URL
- This is a real, low-effort filing — many open-source projects comply

**AI-specific controls:**
- BIS expanding controls on AI model weights and parameters (2024-2025)
- Interim Final Rule on AI Diffusion (January 2025) — tiered country access
- If LETHE bundles or distributes AI model weights, verify they don't fall under new controls

**OFAC Sanctioned Countries (comprehensive programs — virtually all transactions prohibited):**
- Cuba, Iran, North Korea (DPRK), Syria
- Russia/Belarus (extensive sectoral sanctions, expanding)
- Crimea/Donetsk/Luhansk regions (Russian-occupied Ukraine)
- Venezuela (certain government entities)
- **SDN List:** Cannot accept contributions from Specially Designated Nationals

### EU Dual-Use Regulation (2021/821)

- Controls encryption software; open-source "public domain" exemption is narrower than US
- Cyber-surveillance technology controls
- AI-specific controls developing under Wassenaar Arrangement

### Wassenaar Arrangement (42 states)

- Category 5 Part 2: Information security (encryption)
- Intrusion software controls
- AI-specific controls under discussion

### Practical distribution rules

1. Do **not** actively market/distribute to comprehensively sanctioned countries
2. Passive open-source repository (GitHub) is lower risk than active distribution
3. GitHub itself blocks access from some sanctioned countries
4. Add geographic disclaimer to project
5. Screen contributors against OFAC SDN list

## 9. Action Items

### Critical (before release)

| # | Action | Why | Owner |
|---|--------|-----|-------|
| 1 | **Scope Bios as wellness-only** | Avoids SaMD classification in all jurisdictions. Any diagnostic/clinical capability requires years of regulatory approval (MDR, FDA, etc.) | Product |
| 2 | **Scope PreuJust as informational** | Avoids financial advisory licensing. Never give personalized investment advice or access bank accounts | Product |
| 3 | **Review export control obligations** | Source code is publicly available. Open-source exemptions apply under both US EAR (740.13(e)) and EU dual-use regulation. No action required at this time. | Legal |
| 4 | **Add geographic restrictions page** | List countries where LETHE may not be legally used + disclaimers for health/financial modules | Docs |
| 5 | **Audit LLM API data flows** | Map what personal data leaves the device, to which providers, in which countries. Needed for GDPR DPIAs and DPAs | Engineering |

### Important (compliance roadmap)

| # | Action | Why |
|---|--------|-----|
| 6 | **EU AI Act conformity assessment** | High-risk classification likely for health/financial modules. Phased deadlines through Aug 2027 but preparation needed now |
| 7 | **GDPR Data Processing Agreements** | Need DPAs with every LLM provider that receives EU personal data |
| 8 | **Privacy policy / transparency docs** | Required by GDPR, LGPD, CCPA, DPDPA, and virtually all data protection laws |
| 9 | **Prefer local inference for sensitive queries** | Route health/financial queries to on-device models when possible to avoid cross-border data transfer issues |
| 10 | **Consult specialized counsel** | (a) EU AI Act conformity, (b) SaMD classification, (c) financial regulatory classification, (d) export control compliance |

### Ongoing monitoring

- EU AI Act implementation timeline and guidance
- US federal AI legislation (fragmented state landscape may consolidate)
- New AI-specific export controls (BIS AI diffusion rules)
- India DPDPA implementation rules
- Canada AIDA, Brazil AI law status
- Any country newly restricting AI agents or privacy tools

---

## Regulatory Risk Heatmap

```
                    Low Risk          Medium Risk        High Risk         Blocked
                    ─────────────────────────────────────────────────────────────
AI Regulation       Japan, most of    US (state-level),  EU (AI Act),      China
                    Latin America     UK, Canada         South Korea

Health (Bios)       (wellness only)   All jurisdictions  EU (MDR),         —
                                      if wellness-scoped US (FDA) if
                                                         clinical claims

Finance (PreuJust)  (info only)       Most jurisdictions EU (MiFID II),    —
                                      if info-scoped     US (SEC/FINRA)
                                                         if advisory

Encryption          Most of world     India, Turkey,     Russia, China     DPRK,
                    (with filing)     UAE                                  Iran

Data Protection     Japan (lighter)   US (patchwork),    EU (GDPR),        China
                                      most of Asia       Brazil (LGPD)     (PIPL)

Export/Sanctions    Most of world     Russia (sectoral)  —                 DPRK, Iran,
                                                                           Syria, Cuba
```

---

*This document is research only. It does not constitute legal advice. Laws change rapidly, especially in the AI space. All assessments should be verified with qualified legal counsel before making compliance decisions.*
