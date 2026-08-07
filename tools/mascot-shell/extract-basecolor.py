"""Extract image[0] (the stone albedo atlas) out of a GLB.

Step 1 of the crack-shell pipeline — see README.md.
"""

import json
import struct
import sys

src, dst = sys.argv[1], sys.argv[2]
d = open(src, "rb").read()
if d[:4] != b"glTF":
    sys.exit("not a GLB: %s" % src)

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

img = js["images"][0]
bv = js["bufferViews"][img["bufferView"]]
off0, size = bv.get("byteOffset", 0), bv["byteLength"]
open(dst, "wb").write(bin_[off0 : off0 + size])
print("%s -> %s (%s, %d bytes)" % (img.get("name"), dst, img["mimeType"], size))
