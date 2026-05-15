# Remote DMS / wipe trigger channel — design

**Tracks:** [#103](https://github.com/thdelmas/lethe/issues/103)  ·  **Gap:** competitive-gaps.md §3

## Threat model

Owner is separated from the device after seizure (border, raid, abduction,
hospitalization). A trusted peer — typically an editor, lawyer, or
co-traveller — needs to (a) confirm the device is still in friendly hands,
(b) trigger lock or wipe if not. The channel must:

* be reachable across a network the adversary may control or partition;
* be cryptographically scoped to the pre-paired peer (no random "wipe my
  phone" attacks);
* be replay-resistant — an intercepted command cannot be reused later;
* not require the device to maintain a persistent identity that an
  adversary on the same network can fingerprint.

Out of scope: full remote chat, file transfer, location reporting. Those
are nice-to-have but inflate attack surface; the issue scopes us to a
narrow command subset (wipe, lock, status).

## Approach

Tor hidden service (v3 onion) hosting a tiny request handler. The phone
listens; the peer pushes commands. Reasons over alternatives:

| Option | Why not / why |
|---|---|
| Signal-bot via signal-cli | E2E, but tied to a phone number — burns the journalist's anonymity at registration time. Drop. |
| Matrix homeserver | Federated, fine in principle, but the device must hold a long-lived account credential that survives wipe. Bad fit. |
| Tor v3 onion | Self-issued keypair, no upstream identity, .onion address can be reissued every boot. **Chosen.** |
| Yggdrasil + signed UDP | Good for mesh-only scenarios but won't traverse hostile carrier-grade NAT. Keep as fallback layer. |

### Architecture

Two services, both already in the system image:

* **Rust agent** ([`agent/`](../../../agent/)) hosts the responder on
  `127.0.0.1:<remote_dms_port>`. Signature verification, nonce/timestamp
  checks, heartbeat-state assembly, and pair-state storage all live in
  the agent. Reuses the existing axum router.
* **System app** ([`java/org/osmosis/lethe/`](../../../java/org/osmosis/lethe/))
  executes destructive verbs. For `LOCK_NOW`, `WIPE_NOW`, the agent
  forwards a serialized signed-command intent to a new system-app
  receiver (`RemoteCommandReceiver`), which **re-verifies the signature
  itself** against the stored pairing pubkey before calling
  `AutoWipePolicy.executeWipe` / DPM lock. A malicious local app can't
  spoof the agent because the receiver doesn't trust the broadcaster —
  it trusts the signature.

Non-destructive verbs (`STATUS_PING`, `DMS_RESET`, `DMS_PAUSE_24H`)
never leave the agent process.

The single existing Tor instance ([`initrc/init.lethe-tor.rc`](../../../initrc/init.lethe-tor.rc))
hosts the hidden service via an additive torrc fragment gated by
`persist.lethe.remote_dms.enabled`. When the prop is unset the
directives are absent and Tor behaves exactly as today
(transparent-proxy only). No second `tor` process.

### Pairing

First-boot wizard (or Settings → Trust → Add remote command peer) generates
a fresh Ed25519 keypair on each side and exchanges public keys via QR code
+ short authentication string (similar to Briar / Signal safety numbers).
Stored under the *persistent* class key (per-session-keys design),
explicitly opted-in.

**Post-wipe behavior.** `WIPE_NOW` is terminal: the persistent class key
and the pairing material it wraps both disappear with /data. The
editor's stored onion+pubkey points at a dead onion. **The next pairing
is full-fresh** — no migration path, no "transfer my editor relationship
to a new device" flow in v1. Documented up front so the editor's
expectation matches the threat-model contract: once the wipe lands, the
editor knows the relationship is gone and waits for the user to re-pair.

### Wire format

```
COMMAND := nonce(16) || timestamp(8) || verb(1) || sig(64)
where sig = Ed25519(peer_priv, hash(nonce || timestamp || verb || device_pub))
```

* `nonce` — random; phone keeps a sliding window of ~512 recent nonces in
  RAM, drops duplicates.
* `timestamp` — phone rejects skew >120 s in either direction. (Tor only,
  so timestamp drift is the device's NTP, not the carrier's.) **Post-boot
  tightening:** for the first 60 s after `sys.boot_completed=1`, the
  accepted skew narrows to ±10 s. Closes the replay window that would
  otherwise open between the captured command's original timestamp and
  the empty in-RAM nonce table on a freshly-rebooted device. Documented
  degradation, no on-disk nonce state needed.
* `verb` — one of `STATUS_PING`, `LOCK_NOW`, `WIPE_NOW`, `DMS_RESET`,
  `DMS_PAUSE_24H`.
* `sig` includes the device public key, so a captured command for one
  device cannot be replayed against another paired device.

### Server side

Onion service listens on the device. Three endpoints:

* `POST /cmd` — accepts a signed command, replies with signed ACK.
* `GET /heartbeat` — replies with signed `{last_unlock_ts, battery, dms_state}`.
  Status only, no commands.
* `GET /pubkey` — public key, for pairing-verification only.

All responses signed with the device's Ed25519 key so the peer can detect
a swapped onion impersonating the phone.

### Client side

A pre-built CLI shipped in the OSmosis docs repo:

```
lethe-remote pair  --qr <imagefile>
lethe-remote ping  --peer <onion>
lethe-remote lock  --peer <onion>
lethe-remote wipe  --peer <onion> --confirm <safety-phrase>
```

The wipe command takes a user-typed safety phrase set at pair time. This
is belt-and-suspenders against the trusted peer's machine being
compromised — an attacker needs both the peer's private key and the
phrase.

### Failure modes

* **Tor down.** Phone retries hidden-service publish on a backoff. Peer
  sees no descriptor and can't talk to the device. This is acceptable
  — a silent device is itself a signal to the editor. Document.
* **Network partition.** Same as above; the editor knows the network is
  partitioned, escalates manually.
* **Adversary forces the phone online.** Onion publication is anonymous
  by design; the adversary can't easily derive that the device is
  publishing a service. Even if they do, they can't issue commands
  without the peer key.
* **Peer key compromise.** Pairing is per-peer; revoke and re-pair. The
  pairing list cap (5 peers) keeps the blast radius bounded.

## Pairing flow at first boot

1. First-boot wizard offers "Add a remote partner who can wipe this device
   in an emergency." Skipping is fine — feature is opt-in.
2. Both devices show a QR code containing their public key + short auth
   string.
3. Each scans the other's QR, both screens display the same SAS, both tap
   "yes, this matches" — Briar-style.
4. Phone publishes its onion descriptor; peer stores the onion address +
   public key.
5. Phone displays a printable recovery sheet: peer onion, pubkey, pairing
   nonce. (For when the journalist is offline and needs to verify with
   the editor over a different channel.)

## v1 ship cut — phased plan

The full design above spans five phases. **v1 ships phases 1 and 4 only.**
Each later phase threads into a separate journalist-audit milestone.

| Phase | Scope | Depends on | Ships in |
|---|---|---|---|
| 1 | Rust agent endpoints (`/cmd`, `/heartbeat`, `/pubkey`) + Ed25519 verify + nonce/timestamp + post-boot tightening + Tor torrc fragment. Manual pairing via JSON dropped on the device's persist dir for test devices. Enabled verbs: `STATUS_PING`, `DMS_RESET`, `DMS_PAUSE_24H`. | None — uses existing Tor instance. | **v1** |
| 2 | `RemoteCommandReceiver` in the system app + signed-command bridge intent. Enables `LOCK_NOW` and `WIPE_NOW`. | [#101](https://github.com/thdelmas/lethe/issues/101) (persistent class key for pairing storage that survives reboot but is destroyed by wipe). | v1.x after #101 lands |
| 3 | First-boot wizard pairing flow. Native UI (QR + SAS + recovery sheet). | [#159](https://github.com/thdelmas/lethe/issues/159) — needs a native UI surface; `LetheActivity` WebView is still unreachable on user builds. Pattern follows `AutoWipeSettingsActivity` / `PairEntryActivity`. | v1.x after #159 sub-cases resolve |
| 4 | `lethe-remote` CLI client shipped via the OSmosis docs repo. | None. Can ship alongside phase 1. | **v1** |
| 5 | Optional Android partner app for non-CLI editors. | Phase 4 settled the wire interop. | v1.y |

**v1 = phase 1 + phase 4** gives a functional channel the user can demo
end-to-end (status pings, DMS pause-and-extend) from a real CLI, without
depending on any of the open blockers. Destructive verbs (LOCK / WIPE)
intentionally stay disabled in v1 — the responder rejects them with a
documented error code. This is honest: the wipe path needs #101's
persistent-class-key storage to be threat-model-sound, so wiring it
before then would ship a worse-than-nothing security claim.

The wire format (verb numbering, nonce window, timestamp envelope, sig
binding) is locked across all phases — phase 2 doesn't change the
on-the-wire protocol, just enables more verbs.

## Acceptance mapping

| Issue criterion | Lands in |
|---|---|
| Pairing flow at first boot | "Pairing flow" section above; first-boot wizard hook |
| Replay-resistant signed commands | wire format with nonce + timestamp + sig |
| Tested over Tor with simulated network partition | test plan: `tc qdisc add ... loss 100%` between phone and rendezvous, confirm command queues client-side, no crash, no leak |

## Test plan

1. Pixel 7a + workstation. Pair via QR. Run `lethe-remote ping` — expect
   signed heartbeat with current battery state.
2. Replay test: capture a `LOCK_NOW` packet, replay 3 minutes later,
   expect rejection (nonce-window).
3. Wrong-key test: substitute a different peer key, expect rejection
   (signature fail).
4. Partition test: drop all traffic to/from the device for 30 minutes,
   restore, expect heartbeat resumes; expect editor's CLI to surface
   "device unreachable" warning.
5. Wipe test: in-house only, on a sacrificial device. Confirm wipe
   triggers, confirm device reboots into BFU and `/data` is unrecoverable
   (uses per-session keys path, issue #101).

## Residual risks

* Tor traffic itself is detectable as Tor on hostile networks. Mitigated
  by obfs4 bridge (already supported via Orbot); not eliminated.
* If the adversary holds the device long enough to extract the Ed25519
  pairing keys before wipe, they could *send themselves* a `DMS_PAUSE_24H`
  to keep the dead-man's-switch quiet while they exfiltrate. Mitigated
  by binding the pairing key to the persistent TEE-wrapped class —
  not extractable without TEE compromise. The session-key change (#101)
  makes this much harder.
* The user's editor needs to know how to use the CLI. Provide a
  one-page card; assume the editor is technical.
