# Warrant canary

LETHE publishes a periodic signed canary to IPNS asserting that the
project has not received court orders, gag orders, or key-disclosure
demands. Devices fetch the canary on every OTA-check cycle and surface
its status in Settings → About.

**Absence of a fresh canary is the signal.** Coercion is not designed
to produce a positive announcement; it's designed to silence one. The
canary's job is to make that silence visible.

Tracks [issue #114](https://github.com/thdelmas/lethe/issues/114).

## Wire format

```json
{
  "as_of": "2026-05-01",
  "current_event": "Bitcoin block 891234 hash 0000…",
  "statement": "No court orders, gag orders, or key-disclosure demands received as of 2026-05-01.",
  "next_due": "2026-06-01",
  "signers": ["maintainer-id-1", "maintainer-id-2"]
}
```

- `as_of` — date the signers asserted this. Must be within the staleness
  window (default 35 days) for the device to consider the canary fresh.
- `current_event` — public reference fresh enough that the statement
  could only have been written on or after `as_of`. We use the latest
  Bitcoin block hash because it's globally agreed and unforge-able by
  the canary signers themselves; alternatives include front-page
  newspaper text. The device does not verify `current_event` — it's a
  human-readable freshness assurance for someone investigating after
  the fact.
- `statement` — plain-text assertion. The schema is closed; new
  statement variants would need a schema bump.
- `next_due` — the date the next canary is expected. If the published
  canary's `next_due` has passed and no fresher one has appeared, the
  device flags STALE.
- `signers` — list of maintainer IDs who signed. The device verifies
  the *aggregated* signature, not individual signers; the list is
  human-readable trace.

The canary file is published as `canary.json` + `canary.json.sig`
(detached Ed25519 signature, base64) under the `lethe-canary` IPNS key.

## Device side

`scripts/runtime/lethe-canary-fetch.sh` runs on the same cadence as
the OTA check (every 6 hours, plus once shortly after boot). It:

1. Resolves IPNS `lethe-canary` to a CID.
2. Fetches `canary.json` and `canary.json.sig` from that CID.
3. Verifies the signature against
   `/system/etc/lethe/canary-pubkey.pem`.
4. Parses `as_of` and `next_due`, checks freshness against
   `LETHE_CANARY_STALE_DAYS` (default 35).
5. Writes `/data/lethe/canary/state.json` with one of:
   - `fresh` — signature valid, `as_of` recent, `next_due` not passed.
   - `stale` — signature invalid, `as_of` older than the stale window,
     or `next_due` passed.
   - `missing` — fetch failed and no prior state exists.

The script never overwrites a known-fresh state with `missing` on a
transient network failure — the Settings UI shows `checked_at` so a
long gap since the last successful check is visible.

## Settings UI

`static/settings-canary.js` reads `state.json` and shows:

- **Green dot, "fresh — as of 2026-05-01"** — most recent successful
  fetch was within the stale window and the signature verified.
- **Yellow dot, "STALE"** — signature failed, `as_of` is older than the
  window, or `next_due` has passed. The detail line names the specific
  failure.
- **Red dot, "missing"** — never had a successful fetch, or the IPFS
  daemon isn't running on this device build.

The user can't dismiss or hide this. It sits in the About section
permanently.

## Signing ceremony (project-side)

Out of scope for the device — but documented here so the protocol on
both sides is traceable from one place.

1. Threshold signature: 2-of-3 (or larger) maintainers, geographically
   distributed and operationally independent. Any single coerced
   maintainer cannot produce a valid canary alone.
2. Signing happens on air-gapped hardware with a YubiKey-backed
   Ed25519 key per maintainer. The threshold combine step happens on
   one maintainer's machine, signature posted alongside the canary.
3. Cadence: monthly. `next_due` is set to (`as_of` + 30 days). A
   delay of more than 5 days past `next_due` should be considered
   the alarm.
4. The canary file is committed to the public lethe-canary repo
   alongside this document for audit. The IPNS publish step is the
   canonical channel; the public repo is for verifiable history.

## What this canary does NOT cover

- Lawful intercept of network traffic by a country-level adversary.
  The canary is silent on that — it only covers project-directed
  legal demands.
- Coercion of a single maintainer (the threshold-signature design
  defends against this).
- Subpoenas in jurisdictions where the recipient must affirmatively
  comply. The canary is silent on this kind of compelled cooperation
  precisely so that compliance does not require lying.
- Code signing key compromise. Verifying the canary tells you the
  project hasn't been served a legal demand; verifying the OTA
  signature tells you the OTA was signed by the build key. Both are
  separate trust relationships.

## Verifying yourself

If the device shows fresh, you can independently verify:

```sh
ipfs cat /ipns/lethe-canary/canary.json > canary.json
ipfs cat /ipns/lethe-canary/canary.json.sig | base64 -d > canary.sig
openssl pkeyutl -verify \
    -pubin -inkey canary-pubkey.pem \
    -rawin -in canary.json -sigfile canary.sig
```

The pubkey is included in this repo at
`keys/canary-pubkey.pem` (planned — not committed until the signing
ceremony is set up).
