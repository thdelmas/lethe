"""Post-process the Blender-exported shell GLB.

Two fixes the exporter cannot be told to do:
  1. restore the ORIGINAL animation order — clip indices are load-bearing
     (persist.lethe.mascot.clip.<state> resolves by index)
  2. alphaMode BLEND -> MASK, so the crack shell is depth-tested rather than
     alpha-blended (no per-draw sorting, no shell hazing the whole model)
"""

import json
import struct
import sys

SRC_ORIG, SRC_NEW, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
CUTOFF = float(sys.argv[4]) if len(sys.argv) > 4 else 0.5


def split(path):
    d = open(path, "rb").read()
    off, js, bin_ = 12, None, b""
    while off < len(d):
        ln, ty = struct.unpack_from("<II", d, off)
        off += 8
        ch = d[off : off + ln]
        off += ln
        if ty == 0x4E4F534A:
            js = json.loads(ch)
        elif ty == 0x004E4942:
            bin_ = ch
    return js, bin_


orig, _ = split(SRC_ORIG)
js, bin_ = split(SRC_NEW)

# 1. animation order ------------------------------------------------------
want = [a.get("name") for a in orig["animations"]]
have = {a.get("name"): a for a in js["animations"]}
missing = [n for n in want if n not in have]
if missing:
    sys.exit("FATAL: exported GLB is missing animations: %s" % missing[:5])
extra = [n for n in have if n not in want]
js["animations"] = [have[n] for n in want] + [have[n] for n in extra]
print("animations reordered: %d (extra appended: %d)" % (len(want), len(extra)))

# 2. shell material blend mode -------------------------------------------
patched = 0
for m in js["materials"]:
    if m.get("name") == "LetheCrackShell":
        m["alphaMode"] = "MASK"
        m["alphaCutoff"] = CUTOFF
        m["doubleSided"] = False  # shell is an outward offset; backfaces are waste
        patched += 1
print("shell materials patched: %d (cutoff %.2f)" % (patched, CUTOFF))
if patched != 1:
    sys.exit("FATAL: expected exactly one LetheCrackShell material")

# repack ------------------------------------------------------------------
jb = json.dumps(js, separators=(",", ":")).encode()
jb += b" " * ((4 - len(jb) % 4) % 4)
bb = bin_ + b"\0" * ((4 - len(bin_) % 4) % 4)
out = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(jb) + 8 + len(bb))
out += struct.pack("<II", len(jb), 0x4E4F534A) + jb
out += struct.pack("<II", len(bb), 0x004E4942) + bb
open(OUT, "wb").write(out)
print("wrote %s (%d bytes)" % (OUT, len(out)))
