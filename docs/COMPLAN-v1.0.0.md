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

Today we're releasing LETHE v1.0.0 — a privacy-hardened Android designed to forget by default. v1.0 is the foundation: full Google debloat, system-level tracker blocking, hardened DNS defaults, and a bundled Tor daemon listening locally. The runtime that wipes on every reboot, rotates your identity, and forces all app traffic through Tor's TransPort lands in v1.1 — the cm-14.1 sepolicy work to relabel the userspace scripts didn't fit the v1.0 window.

The OS-level guardian — an AI that lives in the system, not as an app, provider-agnostic — is also coming in v1.1.

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

Title: LETHE v1.0 — privacy-first Android overlay on LineageOS, R&D release

We just released LETHE v1.0.0, a LineageOS overlay. v1.0 is R&D — the foundation: full Google debloat, system-level tracker blocking via hosts file, hardened DNS defaults (Quad9 DoT primary), and a bundled Tor daemon listening locally on `127.0.0.1:9050` (SOCKS) so SOCKS-aware apps (Mull, Briar, etc.) route through it today.

Burner mode (every-boot wipe, Android ID + MAC rotation), Tor transparent-proxy enforcement (iptables NAT to the daemon's TransPort), Dead Man's Switch, panic wipe, and the in-OS AI guardian are all in v1.1. The configurations and binaries ship in v1.0; their init services don't run because cm-14.1's stock SELinux blocks `init execute_no_trans` on shell scripts inheriting `system_file`. The v1.1 sepolicy expansion fixes that.

26 device codenames in the manifest. Validated on Galaxy Note II (t0lte) under enforcing SELinux — others in v1.0.x. Built as an overlay so upstream LineageOS updates still apply cleanly.

Check your local laws regarding encryption and privacy software before installing.

[link to GitHub release]

**r/LineageOS:**

Title: LETHE v1.0.0 — privacy overlay for LineageOS, R&D release

LETHE is an overlay applied at build time on top of LineageOS. It doesn't fork the source — all features are additive via PRODUCT_COPY_FILES. v1.0 ships system hosts blocking, hardened DNS defaults, full Google debloat, LETHE theme, and a bundled Tor daemon running under enforcing SELinux in its own `tor` domain (listening on `127.0.0.1:9050`/`:9040`/`:5400`).

Burner mode + Tor transparent-proxy iptables enforcement + MAC rotation + Dead Man's Switch + AI guardian + IPFS OTA are all in v1.1. Their init services ship in the v1.0 image but cm-14.1's stock SELinux blocks the .sh launcher scripts; the v1.1 file_contexts pass relabels them.

26 device codenames in the manifest, LOS 22.1 (Android 15) for most + 14.1 for legacy (Galaxy Note II, 2012). v1.0 validated end-to-end on t0lte under enforcing SELinux; other codenames roll out in v1.0.x as individually validated.

Looking for feedback from anyone who wants to test.

Check your local laws regarding encryption and privacy software before installing.

[link to GitHub release]

**r/opensource + r/selfhosted:**

Title: LETHE — open-source privacy Android overlay on LineageOS, v1.0 R&D release

We just shipped v1.0.0. It's a LineageOS overlay — not a fork — that adds system-level tracker blocking, hardened DNS defaults, full Google debloat, and a bundled Tor daemon listening locally so SOCKS-aware apps can route through it. No Google, no phoning home.

v1.1 brings burner mode (every-boot wipe + identity rotation), Tor transparent-proxy iptables enforcement, the in-OS AI guardian (provider-agnostic — bring your own key), Dead Man's Switch, and IPFS-routed signed updates. Their configs ship in v1.0; the runtime activates after the v1.1 sepolicy expansion.

The goal: old phones in drawers become private devices that actually protect you.

Check your local laws regarding encryption and privacy software before installing.

[link to GitHub release]

---

### 4. Hacker News — Show HN
**When:** May 4th or 5th (weekday morning US time for best visibility)
**Content:**

Title: Show HN: LETHE v1.0 — Privacy-first Android overlay on LineageOS (R&D release)

LETHE is a privacy-hardened Android overlay on LineageOS. v1.0 ships system-level tracker blocking, hardened DNS defaults, full Google debloat, and a bundled Tor daemon running under enforcing SELinux in its own domain (listens on `127.0.0.1:9050`/`:9040`/`:5400` — SOCKS-aware apps route through it today).

v1.1 brings burner mode (every-boot wipe, MAC + Android ID rotation), Tor transparent-proxy iptables enforcement, an in-OS AI guardian as a system service (not a separate app, provider-agnostic), Dead Man's Switch with duress PIN, IPFS-routed signed firmware updates, panic wipe via 5× power. All those have configs and binaries in the v1.0 image; their init services don't run because cm-14.1's stock SELinux blocks `init execute_no_trans` on the userspace launcher scripts. The v1.1 file_contexts pass relabels them.

It started from years of collecting old hardware and finding hard drives full of other people's data. Devices don't forget their owners. We thought they should.

Built as an overlay, not a fork — upstream LineageOS updates still apply cleanly. 26 device codenames in the build manifest, validated on Galaxy Note II (t0lte) under enforcing SELinux for v1.0, others rolling out in v1.0.x.

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

LETHE v1.0.0 is out — R&D release.

Privacy-first Android overlay on LineageOS. v1.0 ships full Google debloat, system-level tracker blocking, hardened DNS defaults, and a bundled Tor daemon listening locally. The runtime that wipes on reboot, rotates identity, and forces all app traffic through Tor — burner mode + transparent-proxy enforcement — lands in v1.1.

Sometimes the best way to protect someone is to forget them.

26 device codenames in the manifest. Validated on Galaxy Note II (t0lte) for v1.0; others in v1.0.x. Old phones in drawers welcome.

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
