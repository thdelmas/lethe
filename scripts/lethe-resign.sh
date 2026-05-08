#!/usr/bin/env bash
# Strip the codename assertion from an OTA updater-script and re-sign.
# Workaround for TWRP-on-N7105 reporting ro.product.device=t03g while the
# OTA asserts t0lte family — the assertion is the first line of
# META-INF/com/google/android/updater-script.
#
# Usage: lethe-resign.sh <input.zip> <output.zip>
#
# Env (with defaults):
#   LINEAGE_TREE  $HOME/android/lineage
#   SIGNAPK_JAR   $LINEAGE_TREE/prebuilts/sdk/tools/lib/signapk.jar
#   TESTKEY_PEM   $LINEAGE_TREE/build/target/product/security/testkey.x509.pem
#   TESTKEY_PK8   $LINEAGE_TREE/build/target/product/security/testkey.pk8
#   JAVA          /usr/lib/jvm/java-8-openjdk-amd64/bin/java if present, else `java`
#                 (signapk.jar from cm-14.1 needs JDK 8 — Java 17 fails on
#                 conscrypt JNI / sun.security.x509 module access)

set -euo pipefail

IN="${1:?usage: lethe-resign.sh <input.zip> <output.zip>}"
OUT="${2:?usage: lethe-resign.sh <input.zip> <output.zip>}"

LINEAGE_TREE="${LINEAGE_TREE:-$HOME/android/lineage}"
SIGNAPK_JAR="${SIGNAPK_JAR:-$LINEAGE_TREE/prebuilts/sdk/tools/lib/signapk.jar}"
TESTKEY_PEM="${TESTKEY_PEM:-$LINEAGE_TREE/build/target/product/security/testkey.x509.pem}"
TESTKEY_PK8="${TESTKEY_PK8:-$LINEAGE_TREE/build/target/product/security/testkey.pk8}"
# signapk.jar from cm-14.1 reaches into conscrypt for cert parsing, which loads
# libconscrypt_openjdk_jni.so via System.loadLibrary. Without -Djava.library.path
# pointing at the prebuilt JNI dir, signapk dies with UnsatisfiedLinkError.
SIGNAPK_NATIVE_DIR="${SIGNAPK_NATIVE_DIR:-$LINEAGE_TREE/prebuilts/sdk/tools/linux/lib64}"
JAVA8_DEFAULT="/usr/lib/jvm/java-8-openjdk-amd64/bin/java"
JAVA="${JAVA:-$([ -x "$JAVA8_DEFAULT" ] && echo "$JAVA8_DEFAULT" || echo java)}"

[ -f "$IN" ]          || { echo "no such file: $IN" >&2; exit 1; }
[ -f "$SIGNAPK_JAR" ] || { echo "signapk.jar not at $SIGNAPK_JAR" >&2; exit 1; }
[ -f "$TESTKEY_PEM" ] || { echo "no testkey.x509.pem at $TESTKEY_PEM" >&2; exit 1; }
[ -f "$TESTKEY_PK8" ] || { echo "no testkey.pk8 at $TESTKEY_PK8" >&2; exit 1; }
command -v "$JAVA" >/dev/null || { echo "java binary not found: $JAVA" >&2; exit 1; }
command -v zip     >/dev/null || { echo "zip not in PATH"  >&2; exit 1; }
command -v unzip   >/dev/null || { echo "unzip not in PATH">&2; exit 1; }

WORK="$(mktemp -d -t lethe-resign-XXXXXX)"
trap 'rm -rf "$WORK"' EXIT

echo "=> unpack: $IN"
unzip -q -d "$WORK/u" "$IN"

SCRIPT="$WORK/u/META-INF/com/google/android/updater-script"
[ -f "$SCRIPT" ] || { echo "no updater-script in zip" >&2; exit 2; }
# Strip any line that asserts ro.product.device or ro.build.product. Match
# both `assert(getprop("ro.product.device") == "t0lte" || ...)` style and
# the simpler form. Idempotent — no-op if the assert isn't present (e.g.
# already-stripped artifacts).
HITS=$(grep -cE 'assert\(getprop\("ro\.(product\.device|build\.product)"\)' "$SCRIPT" || true)
if [ "$HITS" -gt 0 ]; then
    echo "=> stripping $HITS codename-assert line(s)"
    sed -i -E '/assert\(getprop\("ro\.(product\.device|build\.product)"\)/d' "$SCRIPT"
else
    echo "=> no codename assert found (already stripped or not codename-gated)"
fi

echo "=> repack unsigned"
# Use Python's zipfile module instead of /usr/bin/zip. /usr/bin/zip silently
# fails to write its archive when invoked from a Make recipe (.ONESHELL +
# SHELLFLAGS=-euo pipefail -c) — it emits "zip warning: name not matched:
# <archive>" then "updating:" for every input file, exits rc=0, but never
# creates the archive on disk. Reproduces with positional args AND `zip -@`
# stdin file lists, with absolute and relative archive paths. Same script
# called from `bash -euo pipefail -c` directly produces the archive
# correctly. Root cause unidentified; Python zipfile sidesteps it entirely.
python3 - "$WORK/u" "$WORK/unsigned.zip" <<'PY'
import os, sys, zipfile
src, dst = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as zf:
    for root, dirs, files in os.walk(src):
        for d in sorted(dirs):
            full = os.path.join(root, d)
            arc = os.path.relpath(full, src) + "/"
            zf.write(full, arc)
        for f in sorted(files):
            full = os.path.join(root, f)
            arc = os.path.relpath(full, src)
            zf.write(full, arc)
PY

mkdir -p "$(dirname "$OUT")"
echo "=> signapk (using $JAVA) → $OUT"
"$JAVA" -Xmx2g -Djava.library.path="$SIGNAPK_NATIVE_DIR" \
    -jar "$SIGNAPK_JAR" -w "$TESTKEY_PEM" "$TESTKEY_PK8" \
    "$WORK/unsigned.zip" "$OUT"

echo "=> done"
ls -la "$OUT"
