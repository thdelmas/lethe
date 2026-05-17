# ZXing core prebuilt — spike for #168

This directory becomes a sibling Android.mk module (`zxing-core`,
`JAVA_LIBRARIES`) when `apply-overlays.sh` runs with
`LETHE_BUILD_PAIR_SCAN_SPIKE=1`. The Lethe system-app Android.mk picks
it up via `LOCAL_STATIC_JAVA_LIBRARIES`, and a tiny probe class
(`PairScanProbe.java`) references `com.google.zxing.Result` so any
link failure surfaces at compile time.

## Fetching the JAR

The JAR is intentionally **not committed** — the spike PR is build-glue
only. Drop `core-3.3.3.jar` here before running the spike build:

```sh
curl -fLo core-3.3.3.jar \
  https://repo1.maven.org/maven2/com/google/zxing/core/3.3.3/core-3.3.3.jar
sha256sum core-3.3.3.jar > core-3.3.3.jar.sha256
```

Record the SHA-256 in `docs/security/journalist-audit/168-pair-scan-spike.md`
and in the follow-up vendoring PR's description.

3.3.3 is the last ZXing release fully compatible with Java 7 source
and target, which is what the cm-14.1 system-app build uses.

Licence: Apache-2.0 — <https://www.apache.org/licenses/LICENSE-2.0>.
A follow-up PR will vendor the JAR with LICENSE + NOTICE files once
the build path is confirmed.
