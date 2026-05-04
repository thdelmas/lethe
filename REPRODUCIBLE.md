# Reproducible builds

LETHE aims for bit-for-bit reproducible OTAs from public source. This is
the journalist-audit transparency requirement — without it, an
externally-published signed OTA cannot be independently verified to come
from the source you're reading.

This document is the working spec; some steps below are aspirational
(SBOM is shipping, full reproducible parity with a fresh checkout is the
next milestone). Anything still aspirational is marked **(planned)**.

Tracks [issue #115](https://github.com/thdelmas/lethe/issues/115).

## What's in scope

- **The OTA zip** built from `apply-overlays.sh` + LineageOS upstream.
  Two builds from the same commit on different hosts should produce the
  same `Lethe-<v>-<codename>.zip` modulo build-time signature wrapping.
- **The signed manifest + .sig** produced by `sign-build.sh`. The
  signature itself is non-deterministic (Ed25519 deterministic per RFC
  8032 — actually deterministic), but the inputs to it are.
- **The SBOM**, produced by `scripts/generate-sbom.py` from the lock
  files. Always deterministic given the same lock files.

Out of scope: the LineageOS base itself (their problem), prebuilt
binaries (Tor, IPFS) we vendor — see `prebuilt/` for source links and
expected SHA-256s.

## How to verify a build

1. Get the published OTA + meta + sig:

   ```sh
   gh release download v<version> -p 'Lethe-<v>-<codename>.zip*'
   gh release download v<version> -p 'lethe-sbom.json'
   ```

2. Verify the signature against the LETHE update public key:

   ```sh
   openssl pkeyutl -verify \
       -pubin -inkey keys/update-pubkey.pem \
       -rawin -in <(cat Lethe-<v>-<codename>.zip.sha256 | tr -d '\n') \
       -sigfile Lethe-<v>-<codename>.zip.sig
   ```

3. Recompute the SBOM from the same commit and diff:

   ```sh
   git checkout <release-tag>
   python3 scripts/generate-sbom.py > /tmp/lethe-sbom-rebuilt.json
   diff <(jq 'del(.metadata.timestamp, .serialNumber)' /tmp/lethe-sbom-rebuilt.json) \
        <(jq 'del(.metadata.timestamp, .serialNumber)' lethe-sbom.json)
   ```

   `metadata.timestamp` and `serialNumber` are deliberately non-deterministic
   per CycloneDX spec; everything else must match.

4. **(planned)** Rebuild the OTA on a clean Nix host:

   ```sh
   nix build .#robotnixConfigurations.<codename>.ota
   sha256sum result/Lethe-<v>-<codename>.zip
   ```

   Compare to the published `.sha256`.

## SBOM contents

`scripts/generate-sbom.py` aggregates four lock files into a single
CycloneDX-1.5 document:

| Source | Component count (current main) | Ecosystem |
|---|---|---|
| `agent/Cargo.lock`            | ~172 | Rust crates (`pkg:cargo/...`)   |
| `p2p/go.sum`                  | ~429 | Go modules (`pkg:golang/...`)   |
| `static/package-lock.json`    |  ~99 | npm packages (`pkg:npm/...`)    |
| `flake.lock`                  |  ~10 | Nix flake inputs (`pkg:github/...`) |

Counts drift as deps update; CI re-generates and attaches the SBOM to
each release.

## Determinism contracts (planned)

- **`apply-overlays.sh` step ordering** is fixed in `manifest.yaml` and
  must not depend on filesystem-walk ordering. Already true in practice;
  CI assert is open.
- **Build timestamps** in `system/build.prop` are derived from
  `LETHE_BUILD_DATE` (set to the git-committer-date of HEAD if unset),
  not `date(1)`.
- **mtime stripping**: every file copied into the OTA via `add_to_system`
  has its mtime set to the git-committer-date.
- **Compression**: zip uses `DEFLATE` at level 6 (the default) and
  `--strip-zip-comment` style invocation, no per-file extra fields.

These contracts are tracked individually as follow-ups; this doc is the
single source of truth for what reproducible-LETHE means.

## Reporting drift

If you rebuild and the artifact hash differs from the published one,
file an issue with:

- The commit you built against (`git rev-parse HEAD`).
- Your platform (`uname -a`).
- The first 1 KB of `diffoscope <yours> <theirs>` output, if you can.

We treat reproducibility regressions as build-pipeline bugs alongside
the validator class (lethe#117–#121).

## Why not SLSA today

SLSA L2 needs hosted-build-platform attestation; we don't have a CI
runner with that capability set up yet. Roadmap: L1 (provenance file
co-published) → L2 (hosted CI) → L3 (build-isolation guarantees). The
SBOM is the L1 piece; once CI is in place the rest follows.
