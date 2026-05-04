# Field-build LETHE

A `LETHE_FIELD_BUILD=1` build is for users whose threat model can't tolerate
the existence of cloud-provider code on their device — typically journalists
or activists at borders. It strips the agent UI of any code path that could
reach Anthropic, OpenRouter, or other third-party model providers, sets a
system property the on-device code can refuse to override, and produces an
artifact that is grep-clean of provider names and API endpoints.

This addresses [issue #95](https://github.com/thdelmas/lethe/issues/95).

## What gets stripped

- `static/settings.js` — `modelCatalog`, `providerMeta`, `cloudConsentMessages`
  entries for anthropic and openrouter; the order arrays that reference them;
  and any comment line mentioning the cloud names.
- `static/launcher.html` — the `wizard-provider` cards for anthropic and
  openrouter in the first-boot wizard.

The script verifies the output afterwards with a grep against
`{anthropic, openrouter, sk-ant-, sk-or-, console.anthropic.com,
openrouter.ai, claude, gemini, llama-4, qwen3-72b}`. If any survive, the
build aborts.

## What the system property does

`ro.lethe.field_build=1` is set in `system/build.prop` so the agent backend
(when it ships in v1.1) can refuse to register cloud providers even if a
config file or runtime API tries to enable them. Standard builds set
`ro.lethe.field_build=0`.

## How to build

```sh
LETHE_FIELD_BUILD=1 bash scripts/build-all.sh <codename>
```

`apply-overlays.sh` reads the env var, runs `scripts/apply-field-build.py`
against `static/`, and writes the field_build property to the LineageOS
common.mk. The signed OTA + provenance meta then carry the field-build
flag through to the device.

`scripts/apply-field-build.py` is idempotent — re-running it on an already
stripped tree is a no-op. The strip mutates `static/` in place; if you've
also got a standard-build pipeline running on the same checkout, run it
against a separate working copy.

## Verifying a field build

After the OTA is built but before flashing:

```sh
unzip -p Lethe-<v>-<codename>.zip system/etc/lethe/launcher.html | \
    grep -iE 'anthropic|openrouter|claude|gemini' && echo LEAK
```

Should print nothing. If `LEAK` appears, the strip didn't run or the agent
packaging path bypassed the static/ tree.

The provenance block in `Lethe-<v>-<codename>-meta.json` should also carry
the field-build flag once the v1.1 agent packaging path lands, so an
auditor can read the meta and confirm.

## Caveats

- The agent backend (`bender/` submodule) is deferred to v1.1. When the
  Rust/Go/Kotlin source for that backend lands, each cloud adapter needs a
  build tag (`//go:build !fieldbuild` or equivalent) so the binary itself
  is also clean. The static-strip in this doc covers only the WebView UI.
- LineageOS itself has no cloud-provider code paths to strip; this is
  scoped to LETHE-specific surfaces.
- The field-build APK should ship with a different package id and signing
  key from the standard build to prevent over-the-air upgrade confusion.
  That's CI work, not part of this script.
