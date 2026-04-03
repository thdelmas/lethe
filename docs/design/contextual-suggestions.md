# Contextual Suggestions

> LETHE notices what's happening on-screen and surfaces protection alerts
> or freedom-oriented alternatives — without coaching, nudging, or optimizing the user.

**Priority:** P1 (protection triggers), P2 (freedom alternatives)
**Depends on:** Proactive Heartbeat (gap #1), Accessibility Service Bridge (gap #2), Visual Understanding (gap #8)

---

## 1. Philosophy

A guardian that can see a threat but stays silent isn't guarding.
A guardian that knows a freer path but doesn't mention it isn't liberating.

Contextual suggestions extend the Proactive Heartbeat from system-level health checks
to **screen-level awareness**. Two categories only:

| Category | Purpose | Example |
|----------|---------|---------|
| **Protection** | Warn about threats the user may not see | "This permission dialog is requesting microphone access — this app doesn't need it" |
| **Freedom** | Surface privacy-respecting or libre alternatives | "This app is available on F-Droid without trackers" |

What this is NOT:
- Not productivity suggestions ("you have 3 unread emails")
- Not behavioral nudges ("you've been scrolling for 20 minutes")
- Not general assistance ("want me to summarize this page?")

The test: **would a bodyguard say it?** A bodyguard says "that door is unlocked" or
"there's a safer route." A bodyguard does not say "you should eat more vegetables."

---

## 2. Trigger taxonomy

### 2.1 Protection triggers (P1)

| Trigger | Detection method | Suggestion |
|---------|-----------------|------------|
| **Suspicious permission dialog** | Accessibility tree: permission prompt + app manifest mismatch | "This app is asking for [permission] — its declared purpose doesn't require it" |
| **Phishing indicators** | Vision model: fake login page, URL mismatch, brand impersonation | "This page looks like [brand] but the URL doesn't match" |
| **Tracker-heavy page** | Network layer: blocked tracker count on current page | Mascot glow shifts amber, eye glances at address bar |
| **Deceptive dark patterns** | Vision model: hidden checkboxes, confusing opt-out flows | "There's a pre-checked box here that signs you up for [thing]" |
| **Clipboard exposure** | Clipboard monitor: sensitive data (passwords, tokens) copied to clipboard in non-isolated app | "Your clipboard contains what looks like a password — it's accessible to other apps" |
| **Unencrypted connection** | Network layer: HTTP on a page with input fields | "This page isn't encrypted — anything you type can be intercepted" |
| **Payment screen** | Vision model + URL heuristics: checkout page detected | Posture shifts to alert; glow brightens — heightened vigilance, no interruption unless threat detected |

### 2.2 Freedom triggers (P2)

| Trigger | Detection method | Suggestion |
|---------|-----------------|------------|
| **Proprietary app in use** | Foreground app package name → F-Droid/IzzyOnDroid index lookup | "There's a libre alternative: [app] on F-Droid — [key difference]" |
| **Sharing to a tracker-heavy app** | Share intent intercepted + app tracker profile | "You can share this via [privacy-respecting app] instead" |
| **Cloud storage upload** | Intent/URL: Google Drive, Dropbox, iCloud detected | "You can store this locally or on your own Nextcloud" |
| **App install from Play Store** | Accessibility: Play Store foreground + install intent | "[App] is also on F-Droid without Google dependencies" |
| **Non-private search** | URL: Google/Bing search detected | Subtle glow shift — no interruption unless user has opted into search suggestions |
| **Captive portal / walled garden** | Network: captive portal detected on public WiFi | "This network requires a portal. Tor is paused — resume after you authenticate" |

### 2.3 Trigger suppression

Not every trigger should fire every time. Suppression rules prevent the guardian
from becoming noise:

- **Cooldown:** Same suggestion type suppressed for 1 hour after dismissal
- **Frequency cap:** Max 3 suggestions per hour across all types
- **User dismissal learning:** If a user dismisses the same trigger class 3 times,
  downgrade its escalation level permanently (until user resets in settings)
- **Quiet hours:** Respect the Proactive Heartbeat quiet hours config
- **Focus heuristic:** If the user is actively typing (keyboard visible + input focused),
  defer non-critical suggestions until typing stops
- **First-seen only:** Freedom alternatives surface once per app, not every launch

---

## 3. Delivery: the mascot speaks

Contextual suggestions use the existing **Ambient Escalation Ladder** — they don't
invent a new notification system.

### 3.1 Escalation mapping

| Severity | Ladder level | Mascot behavior | User action needed |
|----------|-------------|-----------------|-------------------|
| **Ambient** | L1 — glow shift | Glow shifts from teal toward amber | None — peripheral awareness only |
| **Notable** | L2 — posture change | Eyes glance toward relevant screen area, posture stiffens | None — user notices if they look |
| **Important** | L3 — gentle animation | Antenna tilt + subtle vein pulse, tooltip appears on tap | Tap mascot to read suggestion |
| **Urgent** | L4 — haptic | Short vibration pattern + mascot leans toward threat | Suggestion appears as ember (floating badge) |
| **Critical** | L5 — interruption | Full alert: mascot blocks interaction area with shield animation | User must acknowledge before proceeding |

Most contextual suggestions should live at **L1–L3**. Only active phishing or
deceptive permission dialogs reach L4–L5.

### 3.2 Suggestion UI

When the user taps the mascot or an ember to read a suggestion:

```
┌──────────────────────────────────┐
│  ⚠  Permission mismatch         │
│                                  │
│  This app is asking for camera   │
│  access. Its manifest declares   │
│  no camera features.             │
│                                  │
│  [Deny]  [Allow anyway]  [Why?]  │
└──────────────────────────────────┘
```

- **Short text** — max 2 sentences describing the observation
- **Action buttons** — concrete actions, not just "OK"
- **"Why?"** — expands to explain how LETHE detected the issue (transparency principle)
- **No judgment** — facts only. "This app has 12 trackers" not "This app is bad"

### 3.3 New micro-expressions

| Event | Animation | Duration |
|-------|-----------|----------|
| `suggestion_protection` | Eyes narrow + shield shimmer | 0.8s |
| `suggestion_freedom` | Eyes brighten + gentle nod | 0.6s |
| `suggestion_dismissed` | Eyes close briefly + slight lean back | 0.4s |
| `suggestion_accepted` | Firm nod + glow brightens | 0.5s |

---

## 4. Detection stack

### 4.1 By hardware tier

| Tier | Protection triggers | Freedom triggers |
|------|-------------------|-----------------|
| **Shallow** (low-end, no GPU) | Heuristic only: URL patterns, permission manifest mismatch, network-layer checks | Package name lookups against local F-Droid index |
| **Taproot** (mid-range) | Heuristics + accessibility tree analysis | Same + share intent interception |
| **Deeproot** (high-end, GPU) | All above + vision model (SmolVLM 256M / Moondream 0.5B) for phishing, dark patterns, deceptive UI | All above + UI element localization for richer context |

### 4.2 Detection pipeline

```
Screen event (accessibility tree change / URL change / intent fired)
  │
  ├─ Heuristic filters (all tiers, <5ms)
  │   ├─ Permission manifest mismatch?
  │   ├─ URL in known-phishing list?
  │   ├─ HTTP + input field?
  │   └─ Package in F-Droid index?
  │
  ├─ Accessibility analysis (taproot+, <50ms)
  │   ├─ Hidden checkboxes in view tree?
  │   ├─ Permission dialog active?
  │   └─ Share intent target tracker profile?
  │
  └─ Vision analysis (deeproot only, <500ms, budget: 2 inferences/min)
      ├─ Screenshot → SmolVLM 256M
      ├─ Brand impersonation check
      ├─ Dark pattern detection
      └─ Deceptive UI element localization
```

### 4.3 Privacy constraints

- **No screenshots stored** — processed in-memory, discarded immediately
- **No screen content logged** — LETHE never records what the user was looking at
- **No cloud processing** — screen analysis is always local
- **Accessibility tree read-only by default** — LETHE reads but does not act unless
  the user explicitly requests an action
- **User can disable entirely** — Settings > LETHE > Contextual Awareness > Off

---

## 5. Data sources

Contextual suggestions need reference data to be useful. All data is local:

| Dataset | Purpose | Update mechanism |
|---------|---------|-----------------|
| **F-Droid index** | Libre alternative lookups | Synced with F-Droid repo updates |
| **Exodus Privacy tracker database** | App tracker profiles | Periodic local sync |
| **Known phishing domains** | URL matching | Updated via Tor-fetched blocklists |
| **Permission-to-purpose mapping** | Permission mismatch detection | Bundled with LETHE, curated |
| **Dark pattern signatures** | Vision model prompt templates | Bundled with LETHE, versioned |

---

## 6. Boundaries

This feature lives inside `boundaries.yaml`. These rules are not guidelines — they
are hard constraints enforced in code:

| Boundary | Rule |
|----------|------|
| **No behavioral nudges** | Never suggest the user change what they're doing — only how they're protected while doing it |
| **No productivity commentary** | Never reference time spent, frequency of use, or usage patterns |
| **No judgment** | State facts ("12 trackers blocked") not opinions ("too many trackers") |
| **No persistence** | Suggestion history is ephemeral — not stored across sessions |
| **No passive surveillance** | Screen analysis triggers on events (permission dialog, URL change), not continuous capture |
| **User override is final** | "Allow anyway" means allow. No second-guessing, no "are you sure?" loops |
| **Transparent triggers** | User can always ask "why did you show this?" and get a factual answer |
| **Suppressible** | Every suggestion type can be individually disabled |

---

## 7. Open questions

- **Alternative quality:** How do we ensure suggested F-Droid alternatives are actually
  functional and maintained? Stale suggestions erode trust.
- **Vision model accuracy:** SmolVLM at 256M params — is phishing detection reliable
  enough to avoid false positives? A false alarm is worse than no alarm.
- **Accessibility service abuse surface:** Even with framework-level whitelisting,
  reading the accessibility tree is powerful. Audit trail needed.
- **Localization:** Dark pattern detection is language-dependent. Priority languages?
- **First-run calibration:** Should the onboarding wizard let users set their
  suggestion sensitivity (minimal / balanced / vigilant)?
