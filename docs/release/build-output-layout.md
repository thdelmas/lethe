# Build output directory layout

`~/Osmosis-downloads/lethe-builds/` is the canonical drop point for signed
LETHE OTAs. The OSmosis dashboard's `api_lethe_builds` endpoint and the
`lethe_ota` route both read from here, so what's at the top level is what
gets surfaced as a release candidate.

The May 2 v1.0.0 incident (see `v1.0.0-flash-investigation.md`) traced back
to a vanilla LineageOS OTA being mistaken for a real LETHE build because
they shared a single directory. The layout below enforces separation.

## Top level — release-eligible

Only signed LETHE OTAs that have passed `sign-build.sh` and the dashboard's
`validate_build_zip` content checks belong at the top level:

```
~/Osmosis-downloads/lethe-builds/
  Lethe-<version>-<codename>.zip          # signed LETHE OTA, 250-350 MB
  Lethe-<version>-<codename>.zip.sha256   # written by sign-build.sh
  Lethe-<version>-<codename>.zip.sig      # Ed25519 detached sig
  Lethe-<version>-<codename>-meta.json    # provenance + build metadata
```

`api_lethe_builds` globs `Lethe-*.zip` non-recursively. `_find_lethe_builds`
in the OTA route additionally requires `Lethe-*-meta.json` to match,
recomputes sha256 from the zip on every read, and runs `validate_build_zip`
before advertising. Any zip that fails validation is silently dropped from
the manifest with a logged warning.

## `_reference/` — validation comparators, never released

Vanilla LineageOS OTAs and other comparison artifacts. These exist so a
reviewer can diff against a real LETHE build (file_contexts.bin, build.prop,
etc.) without confusing the dashboard:

```
_reference/
  Vanilla-cm14-t0lte.zip        # stock LineageOS 14.1, no LETHE overlays
```

The non-recursive `Lethe-*.zip` glob skips this directory by virtue of being
in a subdir, and the filename prefix (`Vanilla-`) means the glob would skip
it even if it were at the top level.

## `_quarantine/` — suspect or partial builds, do not release

Builds that failed mid-pipeline, partial-OTA artifacts, pre-fix stubs that
shouldn't ship. Kept for forensics; never advertised:

```
_quarantine/
  Lethe-1.1.0-t0lte.zip         # 5 MB partial — overlay stub, not a real OTA
  Lethe-1.1.0-t0lte.zip.sha256
  Lethe-1.1.0-t0lte.zip.sig
  Lethe-1.1.0-t0lte-meta.json
```

## Failed-build markers at the top level

A handful of pre-fix files survive at the top level with non-`.zip` suffixes
so the glob doesn't pick them up:

```
Lethe-1.0.0-t0lte.zip.MAY2-BROKEN-NO-SEPOLICY    # 320 MB, sepolicy stripped
Lethe-1.0.0-t0lte.zip.MAY1-PRE-D82E555           # pre-property-fix snapshot
Lethe-1.0.0-t03g.zip.STUB-NOT-FOR-RELEASE        # 5 KB overlay-only stub
Lethe-1.0.0-t03g-meta.json.STUB-NOT-FOR-RELEASE
```

These are kept as physical evidence for the post-mortem. Move them to
`_quarantine/` if/when the post-mortem is closed.

## Defense in depth

The layout is one of three independent defenses against the
filename-as-identity class of bug (issue #116):

1. **This layout**: stranger zips can't sit at the canonical path because
   `_reference/` and `_quarantine/` are excluded; failed builds carry
   non-`.zip` suffixes.
2. **`validate_build_zip`** (OSmosis `web/routes/lethe_build.py`): every
   advertised zip must have `system.new.dat`, `ro.lethe*` properties in
   `system/build.prop`, and `lethe` labels in `file_contexts.bin`. This
   is what would have caught the May 2 sepolicy-stripped regression.
3. **`-meta.json` provenance** (`scripts/sign-build.sh`): every build records
   the lethe repo git SHA, `apply-overlays.sh` SHA, `install-sepolicy.sh`
   SHA, builder hostname, and the props/labels actually present in the zip.
   Atomic write via `tempfile + os.replace`. The OTA route refuses to
   advertise if stored sha disagrees with recomputed sha.
