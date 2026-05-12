#!/usr/bin/env python3
# Generate launcher-icon mipmaps for the Lethe system app.
#
# Source: overlays/mascot.png (the LETHE mascot key art).
# Target: <res_dir>/mipmap-<density>/ic_lethe.png at standard Android sizes.
#
# Called from apply-overlays.sh step 11 (LETHE agent packaging). Mirrors the
# bootanimation/generate-wallpaper.py pattern — PIL is already a build-env
# dependency.

import sys
from pathlib import Path

from PIL import Image

# Standard Android launcher-icon densities. xxxhdpi covers modern devices;
# mdpi keeps the cm-14.1/Android 7.1 path from falling back to scaled-up
# bitmaps.
DENSITIES = {
    "mdpi": 48,
    "hdpi": 72,
    "xhdpi": 96,
    "xxhdpi": 144,
    "xxxhdpi": 192,
}


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: generate-ic-lethe.py <mascot.png> <res_dir>", file=sys.stderr)
        return 2

    src = Path(sys.argv[1])
    res_dir = Path(sys.argv[2])

    if not src.is_file():
        print(f"error: source not found: {src}", file=sys.stderr)
        return 1

    img = Image.open(src).convert("RGBA")

    # mascot.png is 768x1344 portrait — the head/upper body sits in the top
    # square. Crop to a centered square biased toward the top so the launcher
    # tile shows the mascot's face rather than its feet.
    w, h = img.size
    side = min(w, h)
    left = (w - side) // 2
    top = 0  # bias to the top of the portrait
    img = img.crop((left, top, left + side, top + side))

    for name, size in DENSITIES.items():
        out = res_dir / f"mipmap-{name}" / "ic_lethe.png"
        out.parent.mkdir(parents=True, exist_ok=True)
        img.resize((size, size), Image.LANCZOS).save(out, "PNG", optimize=True)
        print(f"  -> {out} ({size}x{size})")

    return 0


if __name__ == "__main__":
    sys.exit(main())
