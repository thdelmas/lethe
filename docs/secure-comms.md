# Secure-comms apps + SecureDrop workflow

LETHE pre-installs three communication / provenance apps for journalists
and at-risk users. This page is the single place to point a new user at:
what each one is for, when to use which, and how to submit to a
SecureDrop instance from the device.

Tracks [#104](https://github.com/thdelmas/lethe/issues/104) and the
journalist-side of [#109](https://github.com/thdelmas/lethe/issues/109).

## What's pre-installed

### Molly-FOSS (Signal client)

`im.molly.foss`. Hardened fork of the official Signal Android client:

- Encrypted local database; RAM-wipes on screen lock.
- Routes via Tor through Orbot by default.
- No Google Firebase — polls via WebSocket. Trades a little battery for
  no Google dependency.
- Reproducible builds, GPL-3.0.

When to use: existing contacts who already have phone numbers and use
Signal. The network effect is the point.

What it doesn't fix: Signal still needs a phone number, which is itself
a strong identifier in many threat models. If your source must remain
anonymous to you, use Briar instead.

### Briar (BLE + WiFi + Tor mesh)

`org.briarproject.briar.android`. Peer-to-peer messenger with no
servers, no phone number, no email.

- Contacts added by QR scan or Bluetooth proximity — no central directory.
- Three transports: Tor over the internet, WiFi over a LAN, BLE for
  short-range offline.
- Async delivery requires a mutual online contact to relay (no central
  store-and-forward).
- LETHE's DMS heartbeat already uses the same radios — adding Briar
  doesn't add an attack surface, it shares one.

When to use: contacts that mustn't be linked to a phone number, or
anyone you'll meet face-to-face before the first message.

What it doesn't fix: large attachments are slow over BLE; battery is
heavier than Signal.

### ProofMode (cryptographic provenance)

`org.witness.proofmode`. Signs photos/videos at capture time so they
can be verified later as untampered.

When to use: any image or video you intend to publish or hand to an
editor. ProofMode produces a `.proof` file with C2PA-compatible
metadata + an Ed25519 signature.

When NOT to use: photos you'll share casually. ProofMode signs the
*captured* metadata — including GPS — so a ProofMode-signed photo is
the *opposite* of a stripped one. Pair it with the share-sheet EXIF
strip (lethe#109): strip for casual share, ProofMode for evidence.

C2PA notary is an external service. ProofMode works without one (the
local signature alone is verifiable), but the full chain-of-custody
story needs a notary you trust.

## Submitting to SecureDrop from LETHE

SecureDrop is a Tor-only document submission system run by news
organizations. The general flow:

1. **Find the publication's onion address.** Always copy from the
   publication's *primary* domain (not a search result). Examples:
   - The Intercept: `https://intrcept.example/securedrop` redirects to
     a `.onion` link inside the page (always verify the link's
     fingerprint against the publication's other channels).
   - Major publications list their fingerprint in the static page.

2. **Use Tor Browser**, not Mull. SecureDrop is `.onion`-only, and
   Mull's anti-fingerprinting is weaker than Tor Browser's. LETHE
   ships Mull as the default browser for everyday use, but SecureDrop
   submissions go through Tor Browser specifically.

3. **Open Tor Browser and paste the `.onion` URL.** Verify the
   onion fingerprint against the publication's primary site.

4. **Generate a code name on first visit.** Don't save it — write it
   down on paper, store it somewhere only you can reach. If you lose
   the codename you can't reach back into the same submission thread.

5. **Strip metadata before upload.** Tap the share-sheet's "Remove
   location?" prompt or run files through `dangerzone-mobile` (when
   that lands in v1.1, lethe#109). For the current paper trail:

   ```sh
   exiftool -all= file.jpg
   ```

   on a separate machine if you don't trust this device.

6. **Submit.** The publication's journalists check submissions
   manually; expect days to weeks.

7. **After submitting, leave the device in a clean state.** Triple-tap
   the clock → /clear, or in Border Mode (lethe#110), the LLM context
   never persisted in the first place.

### Threat model notes

- LETHE doesn't see the submission content. It transits Tor (via
  Orbot, which the system service already runs). The publication
  receives it.
- The publication's metadata hygiene is their problem. Different
  desks have very different operational discipline. Pick a publication
  with a known-good track record, not the first one you find.
- Journalists frequently ask: "should I delete the photo from my phone
  after submission?" Yes — Burner Mode (default-on) wipes /data on
  every reboot, so a single reboot is the safest answer. If you keep
  the device powered on, manually delete the file and any browser
  download history.

## License notes

- **Molly-FOSS** — GPL-3.0; redistribution permitted; we ship the
  Molly signing-key fingerprint in `keys/molly-fingerprint` for users
  who want to self-verify the bundled APK.
- **Briar** — GPL-3.0; redistribution permitted.
- **ProofMode** — GPLv3; redistribution permitted.

A more thorough license-review note lives in `docs/audit/license-review.md`
(planned).
