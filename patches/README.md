# LineageOS source patches

Unified-diff patches applied to the LineageOS source tree during `apply-overlays.sh` step 17. Use this when LETHE behavior needs framework-side code changes that overlays can't express — e.g. patching `frameworks/base` to honor a privacy prop.

## Layout

```
patches/
  <base>/                # e.g. cm-14.1
    <subdir_with_underscores>/   # e.g. frameworks_base → frameworks/base
      000N-<topic>.patch
```

`<base>` is gated by `PROPS_TARGET` shape in `apply-overlays.sh` (`vendor/cm/config/common.mk` → `cm-14.1`). Add a new base when a newer LineageOS tree needs different patches.

`<subdir_with_underscores>` is the LineageOS tree subdirectory with `/` replaced by `_`. The script substitutes back at apply time so the patch hunks can use plain `--- a/<path>` headers relative to that subdir.

## Patch format

Standard unified diff with `-p1` headers. Free-form prose above the first `--- a/` line is ignored by `patch` and used for the commit-message-style explanation.

```
LETHE — short summary line.

Paragraph of why this is needed.

Closes lethe#NNN.

--- a/path/to/file
+++ b/path/to/file
@@ -L,N +L,N @@
 ...
```

Generate with `diff -u original modified` against the lineage tree, then prepend the prose header.

## Idempotency

`apply_patch` in `apply-overlays.sh` reverse-applies in dry-run mode first. If the reverse succeeds, the patch is already on the tree and the apply is skipped. So `apply-overlays.sh` can run repeatedly on the same tree.
