#!/usr/bin/env bash
# Sign a LETHE build ZIP with Ed25519 and write a provenance meta.json.
#
# Usage: sign-build.sh <codename>
#
# Expects:
#   - Build output at ~/Osmosis-downloads/lethe-builds/Lethe-*-<codename>.zip
#   - Signing key at ../keys/update-privkey.pem (Ed25519)
#
# Produces:
#   - .sha256       alongside the ZIP
#   - .sig          Ed25519 detached signature
#   - -meta.json    provenance + version metadata, atomically written

set -euo pipefail

CODENAME="${1:?Usage: sign-build.sh <codename>}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LETHE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
KEYS_DIR="$SCRIPT_DIR/../../keys"
BUILD_DIR="${LETHE_BUILD_DIR:-$HOME/Osmosis-downloads/lethe-builds}"
PRIVKEY="$KEYS_DIR/update-privkey.pem"
MANIFEST="$LETHE_DIR/manifest.yaml"

# Find the latest build for this codename
ZIP=$(ls -t "$BUILD_DIR"/Lethe-*-"$CODENAME".zip 2>/dev/null | head -1)
if [ -z "$ZIP" ]; then
    echo "ERROR: No build found for codename '$CODENAME' in $BUILD_DIR"
    exit 1
fi

echo "Signing: $ZIP"

# Generate key pair if missing
if [ ! -f "$PRIVKEY" ]; then
    echo "No signing key found. Generating Ed25519 key pair..."
    mkdir -p "$KEYS_DIR"
    openssl genpkey -algorithm Ed25519 -out "$PRIVKEY"
    openssl pkey -in "$PRIVKEY" -pubout -out "$KEYS_DIR/update-pubkey.pem"
    chmod 600 "$PRIVKEY"
    echo "  -> Key pair generated in $KEYS_DIR/"
    echo "     KEEP update-privkey.pem SECRET. Never commit it."
fi

# SHA256 checksum
sha256sum "$ZIP" | cut -d' ' -f1 > "$ZIP.sha256"
echo "  -> SHA256: $(cat "$ZIP.sha256")"

# Ed25519 detached signature (use temp file — process substitution unreliable
# with openssl pkeyutl on some systems)
HASH_FILE=$(mktemp)
cat "$ZIP.sha256" | tr -d '\n' > "$HASH_FILE"
openssl pkeyutl -sign \
    -inkey "$PRIVKEY" \
    -rawin \
    -in "$HASH_FILE" \
    -out "$ZIP.sig"
echo "  -> Signature: $ZIP.sig"

# Verify to confirm
PUBKEY="$KEYS_DIR/update-pubkey.pem"
if openssl pkeyutl -verify \
    -pubin -inkey "$PUBKEY" \
    -rawin \
    -in "$HASH_FILE" \
    -sigfile "$ZIP.sig" 2>/dev/null; then
    echo "  -> Signature verified OK."
else
    echo "ERROR: Signature verification failed!"
    exit 1
fi

rm -f "$HASH_FILE"

# Atomic provenance meta.json. Single write (after sha is final) using a temp
# file in the same directory + os.replace, so an aborted run can never leave a
# partial meta.json that downstream tools (api_lethe_builds, _find_lethe_builds)
# would read. The OTA route refuses to advertise on stored/recomputed sha
# mismatch, so swapping the zip after this write also fails closed.
BASENAME="$(basename "$ZIP" .zip)"
META="$BUILD_DIR/$BASENAME-meta.json"
SHA256="$(cat "$ZIP.sha256")"
APPLY_SHA="$(sha256sum "$LETHE_DIR/apply-overlays.sh" 2>/dev/null | cut -d' ' -f1 || true)"
SEPOLICY_SHA="$(sha256sum "$SCRIPT_DIR/install-sepolicy.sh" 2>/dev/null | cut -d' ' -f1 || true)"
LETHE_GIT_SHA="$(git -C "$LETHE_DIR" rev-parse HEAD 2>/dev/null || true)"
LETHE_GIT_DIRTY="$(git -C "$LETHE_DIR" status --porcelain 2>/dev/null | head -1)"
[ -n "$LETHE_GIT_DIRTY" ] && LETHE_GIT_DIRTY="true" || LETHE_GIT_DIRTY="false"

ZIP="$ZIP" \
META="$META" \
SHA256="$SHA256" \
CODENAME="$CODENAME" \
MANIFEST="$MANIFEST" \
APPLY_SHA="$APPLY_SHA" \
SEPOLICY_SHA="$SEPOLICY_SHA" \
LETHE_GIT_SHA="$LETHE_GIT_SHA" \
LETHE_GIT_DIRTY="$LETHE_GIT_DIRTY" \
python3 - <<'PY'
import json, os, socket, sys, tempfile, zipfile
from datetime import datetime, timezone
from pathlib import Path

import yaml

zip_path = Path(os.environ["ZIP"])
meta_path = Path(os.environ["META"])
codename = os.environ["CODENAME"]
manifest_path = Path(os.environ["MANIFEST"])

manifest = yaml.safe_load(manifest_path.read_text())
default_base = str(manifest.get("base_version", ""))
default_android = str(manifest.get("android_version", ""))
base_version = default_base
android_version = default_android
for d in manifest.get("devices", []):
    if isinstance(d, dict) and d.get("codename") == codename:
        base_version = str(d.get("base_version", default_base))
        android_version = str(d.get("android_version", default_android))
        break
    if isinstance(d, str) and d == codename:
        break

# Pull cm.version + ro.lethe* + sepolicy-label presence directly from the zip.
# These are the same checks validate_build_zip runs OSmosis-side; baking them
# into the meta lets reviewers spot a regression family without re-extracting.
cm_version = ""
lethe_props = []
sepolicy_labels_present = False
with zipfile.ZipFile(zip_path) as zf:
    names = set(zf.namelist())
    if "system/build.prop" in names:
        bp = zf.read("system/build.prop").decode("utf-8", errors="replace")
        for line in bp.splitlines():
            if line.startswith("ro.cm.version="):
                cm_version = line.split("=", 1)[1].strip()
            if line.strip().startswith("ro.lethe"):
                key = line.split("=", 1)[0].strip()
                if key not in lethe_props:
                    lethe_props.append(key)
    if "file_contexts.bin" in names:
        sepolicy_labels_present = b"lethe" in zf.read("file_contexts.bin")

provenance = {
    "lethe_git_sha": os.environ.get("LETHE_GIT_SHA", "") or None,
    "lethe_git_dirty": os.environ.get("LETHE_GIT_DIRTY", "") == "true",
    "apply_overlays_sha": os.environ.get("APPLY_SHA", "") or None,
    "install_sepolicy_sha": os.environ.get("SEPOLICY_SHA", "") or None,
    "cm_version": cm_version,
    "ro_lethe_props": sorted(lethe_props),
    "sepolicy_labels_present": sepolicy_labels_present,
    "builder_hostname": socket.gethostname(),
}

# Merge with existing meta if present. The build pipeline owns sha256, output,
# built, and provenance; everything else (operator-curated notes, trimmed
# feature lists, deferred_to_* arrays) survives a re-run unchanged.
existing = {}
if meta_path.exists():
    try:
        existing = json.loads(meta_path.read_text())
    except json.JSONDecodeError:
        existing = {}

meta = dict(existing)
meta.setdefault("name", f"Lethe {manifest.get('version', '')}")
meta.setdefault("codename", codename)
meta.setdefault("version", str(manifest.get("version", "")))
meta.setdefault("base", manifest.get("base", "lineageos"))
meta.setdefault("base_version", base_version)
meta.setdefault("android_version", android_version)
meta.setdefault("features", list((manifest.get("features") or {}).keys()))
meta["sha256"] = os.environ["SHA256"]
meta["output"] = str(zip_path)
meta["built"] = datetime.now(timezone.utc).strftime("%Y-%m-%d")
meta["provenance"] = provenance

# Atomic: temp in same dir + os.replace.
fd, tmp = tempfile.mkstemp(prefix=meta_path.name + ".", dir=str(meta_path.parent))
try:
    with os.fdopen(fd, "w") as f:
        json.dump(meta, f, indent=2, sort_keys=True, ensure_ascii=False)
        f.write("\n")
    os.replace(tmp, meta_path)
except BaseException:
    if os.path.exists(tmp):
        os.unlink(tmp)
    raise

print(f"  -> Meta:      {meta_path}")
if not provenance["sepolicy_labels_present"]:
    print("  -> WARN: file_contexts.bin has no lethe labels (May 2 regression family)", file=sys.stderr)
if not provenance["ro_lethe_props"]:
    print("  -> WARN: build.prop has no ro.lethe properties (looks like vanilla LineageOS)", file=sys.stderr)
PY

echo ""
echo "Signed build ready:"
echo "  ZIP:    $ZIP"
echo "  SHA256: $ZIP.sha256"
echo "  SIG:    $ZIP.sig"
echo "  META:   $BUILD_DIR/$BASENAME-meta.json"
