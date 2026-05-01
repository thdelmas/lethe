# LETHE v1.0.0 — Communication Plan

**Release date:** May 4th, 2026

## Channels

### 1. GitHub — Release note
**When:** May 4th, tag + release
**Content:** Technical release note. What LETHE is, what ships, device list, install instructions.
**Tone:** Factual, concise.

---

### 2. LinkedIn — Personal story
**When:** May 4th or 5th (Monday morning for visibility)
**Content:**

I built my first computer at 10 with my mother to run a game called Spore. At 13 I got my father's old laptop and just wanted it to say hello to me when it boots. That led me to C, then to putting an IDE on a USB stick to code on locked-down school computers.

I kept collecting old machines. Found hard drives full of data — photos, documents, accounts. People get rid of their devices but their devices don't get rid of them.

I fell in love with open source — the idea that technology should be yours even if you have no money. Got frustrated with Google taking your privacy as payment for good software. Got frustrated with Linux being better but impossible for normal people to use.

Then I got tired of screens. I became a digital nomad thinking it meant freedom, but as a developer before AI you couldn't work properly without two screens — a desk, a power outlet, stuck inside anyway.

OSmosis was built to free hardware from proprietary software.
LETHE is where we're going next — free users from screens.

Today we're releasing LETHE v1.0.0 — a privacy-hardened Android that forgets by default. Every reboot wipes your data and rotates your identity. All traffic goes through Tor. No Google services. The first step toward an OS that protects you instead of profiling you.

The OS-level guardian — an AI that lives in the system, not as an app — is coming in v1.1. v1.0 is the foundation it'll run on.

Sometimes the best way to protect someone is to forget them.

26 device codenames in the manifest, validated on a Galaxy Note II from 2012 — the rest roll out in v1.0.x point releases.

Check your local laws regarding encryption and privacy software before installing. Full disclaimers on GitHub.

Link in comments.

#opensource #privacy #android #AI #lethe

---

### 3. Reddit
**When:** May 4th
**Where:** r/privacy, r/degoogle, r/LineageOS, r/opensource, r/selfhosted
**Content:** Short, no fluff. Each sub gets a slightly different angle.

**r/privacy + r/degoogle:**

Title: LETHE — a privacy-hardened Android that forgets everything on reboot

We just released LETHE v1.0.0, a LineageOS overlay that ships with burner mode on by default. Every reboot wipes data + clipboard + notification log + WiFi/Bluetooth credentials and rotates your Android ID. All traffic forced through Tor via iptables — not a toggle, a rule. No Google services survive the build. System-level tracker blocking via hosts file. Hardened DNS (Quad9 DoT primary).

Dead Man's Switch, panic wipe, and the in-OS AI guardian are in v1.1 — the configuration shipped in v1.0 but the runtime components needed more soak time than we had.

26 device codenames in the manifest, validated on Galaxy Note II — others in v1.0.x. Built as an overlay so it stays compatible with upstream LineageOS updates.

Check your local laws regarding encryption and privacy software before installing.

[link to GitHub release]

**r/LineageOS:**

Title: LETHE v1.0.0 — privacy overlay for LineageOS with burner mode and Tor enforcement

LETHE is an overlay applied at build time on top of LineageOS. It doesn't fork the source — all features are additive via PRODUCT_COPY_FILES. Burner mode (wipe on boot), Tor transparent proxy with iptables enforcement, system hosts blocking, hardened DNS, full Google debloat.

Dead Man's Switch + AI guardian + IPFS OTA are coming in v1.1.

26 device codenames in the manifest, LOS 22.1 (Android 15) targets for most + 14.1 for legacy (Galaxy Note II from 2012). v1.0 has been built and verified on t0lte; other codenames roll out in v1.0.x as they're individually validated.

Looking for feedback from anyone who wants to test.

Check your local laws regarding encryption and privacy software before installing.

[link to GitHub release]

**r/opensource + r/selfhosted:**

Title: LETHE — open source privacy Android with burner mode and Tor enforcement

We just shipped v1.0.0. It's a LineageOS overlay — not a fork — that adds burner mode (every-boot wipe + identity rotation), Tor enforcement (iptables-routed transparent proxy), system-level tracker blocking, and hardened DNS. No Google, no phoning home.

v1.1 brings the in-OS AI guardian (cloud LLMs via your key, on-device models for capable hardware), Dead Man's Switch, and IPFS-routed signed updates.

The goal: old phones in drawers become private devices that actually protect you.

Check your local laws regarding encryption and privacy software before installing.

[link to GitHub release]

---

### 4. Hacker News — Show HN
**When:** May 4th or 5th (weekday morning US time for best visibility)
**Content:**

Title: Show HN: LETHE — Privacy Android that forgets everything on reboot

LETHE is a privacy-hardened Android overlay on LineageOS. Burner mode is on by default — every reboot wipes user data, internal storage, WiFi/Bluetooth credentials, clipboard, notification log, and rotates the Android ID. All user-app traffic forced through a bundled Tor daemon via iptables (UDP dropped). System hosts file blocks ad/tracker domains for every app. No Google services in the build.

Coming in v1.1: an in-OS AI guardian as a system service (not a separate app), Dead Man's Switch with duress PIN, IPFS-routed signed firmware updates, panic wipe via 5× power.

It started from years of collecting old hardware and finding hard drives full of other people's data. Devices don't forget their owners. We thought they should.

Built as an overlay, not a fork — upstream LineageOS updates still apply cleanly. 26 device codenames in the build manifest, validated on Galaxy Note II for v1.0, others rolling out in v1.0.x.

Check your local laws regarding encryption and privacy software before installing.

[link to GitHub]

---

### 5. XDA Developers
**When:** May 4th
**Where:** Forum thread (ROM section for supported devices)
**Content:** Device list, install instructions, screenshots, what's different from stock LineageOS. Technical, community tone. Link to GitHub for source.

**DONE:** Full thread drafted in `docs/release/XDA-THREAD.md`. Pending: screenshots (need device photos before May 4).

---

### 6. Mastodon / Fediverse
**When:** May 4th
**Content:**

LETHE v1.0.0 is out.

A privacy-hardened Android that forgets by default. Every reboot wipes your data and rotates your identity. All traffic through Tor — firewall-enforced, not a toggle. No Google services. The in-OS AI guardian is coming in v1.1.

Sometimes the best way to protect someone is to forget them.

26 device codenames in the manifest. Validated on Galaxy Note II for v1.0; others in v1.0.x. Old phones in drawers welcome.

Check your local laws regarding encryption and privacy software before installing.

[link]

#privacy #opensource #android #degoogle #lethe

---

### 7. Discord (OSmosis + LETHE servers)
**When:** May 4th
**Content:** Announcement in both servers. Casual, direct. Link to GitHub release + invite people to test and report bugs.

---

### 8. theophile.world
**When:** Before May 4th (prep)
**Content:** Blog post or project page update. The full story (LinkedIn version + technical details). Acts as the hub linking to GitHub, Discord, and all other channels.

---

## Content split

| What | Where |
|---|---|
| Personal story + vision | LinkedIn, theophile.world |
| Technical release note | GitHub |
| Short pitch + privacy angle | Reddit, HN, Mastodon |
| ROM details + install guide | XDA |
| Casual announcement | Discord |

## Timeline

| Date | Action |
|---|---|
| April 18 | Verify all channel content includes legal one-liner |
| April 20 | Finalize GitHub release note (strip claims that didn't ship) |
| April 25 | Prep theophile.world blog post |
| April 28 | Draft XDA thread with install instructions |
| April 30 | Final review all channel content |
| May 4, 00:01 UTC | GitHub release — tag, build artifacts, release note goes live |
| May 4, first work hour | All announcements: Reddit, HN, Mastodon, XDA, Discord, LinkedIn, theophile.world |
| May 4-10 | Monitor comments, respond, iterate |

## Legal disclaimers

Every public post includes one line:

> "Check your local laws regarding encryption and privacy software before installing."

Full disclaimers (health, financial, AI, geographic) live in `PRIVACY.md` on GitHub — not in social media posts. Don't list specific countries. Don't draw attention to what's restricted or where.

---

## Rules

- Don't claim what isn't shipped. Final pass on all content against actual build.
- No engagement bait. Just say what it is.
- Respond to every comment in the first week.
- Link back to GitHub from everywhere. GitHub links to Discord for community.
- **Every post includes the one-line legal disclaimer.** No country lists, no specifics.
