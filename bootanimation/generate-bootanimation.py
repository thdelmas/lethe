#!/usr/bin/env python3
"""Generate a discreet Lethe boot animation from the lockscreen image.

Produces an Android-format bootanimation.zip:
  - part0: fade-in from black to a dimmed version of the lockscreen (20 frames)
  - part1: gentle breathing pulse loop on the dimmed lockscreen (30 frames)

The red accents are kept but the overall image is darkened to ~40% opacity
so the animation feels quiet and understated — no flashy branding.

Usage:
    python3 generate-bootanimation.py [--source PATH] [--output PATH]

Requires: Pillow (pip install Pillow)
"""

import argparse
import math
import shutil
import zipfile
from pathlib import Path

from PIL import Image

SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_SOURCE = SCRIPT_DIR.parent / "overlays" / "lockscreen.png"
DEFAULT_OUTPUT = SCRIPT_DIR / "bootanimation.zip"

# Animation parameters
WIDTH, HEIGHT = 720, 1280
FPS = 15

# Fade-in: 20 frames, black -> dimmed image
FADEIN_FRAMES = 20
# Breathing loop: 30 frames, subtle opacity oscillation
BREATH_FRAMES = 30

# How dim the final hold image is (0.0 = black, 1.0 = original)
MAX_BRIGHTNESS = 0.35
# Breathing oscillation range around MAX_BRIGHTNESS
BREATH_AMPLITUDE = 0.08


def make_dimmed(source_img, brightness):
    """Return a copy of source_img blended toward black by brightness factor."""
    black = Image.new("RGB", source_img.size, (0, 0, 0))
    return Image.blend(black, source_img, brightness)


def generate_frames(source_path):
    """Generate all animation frames as PIL Images."""
    source = Image.open(source_path).convert("RGB")
    if source.size != (WIDTH, HEIGHT):
        source = source.resize((WIDTH, HEIGHT), Image.LANCZOS)

    frames_part0 = []
    frames_part1 = []

    # Part 0: fade in from black to MAX_BRIGHTNESS
    for i in range(FADEIN_FRAMES):
        # Ease-in-out curve for smooth fade
        t = i / (FADEIN_FRAMES - 1)
        eased = t * t * (3 - 2 * t)  # smoothstep
        brightness = eased * MAX_BRIGHTNESS
        frames_part0.append(make_dimmed(source, brightness))

    # Part 1: breathing pulse loop
    for i in range(BREATH_FRAMES):
        t = i / BREATH_FRAMES
        # Sinusoidal breathing: oscillates around MAX_BRIGHTNESS
        brightness = MAX_BRIGHTNESS + BREATH_AMPLITUDE * math.sin(2 * math.pi * t)
        frames_part1.append(make_dimmed(source, brightness))

    return frames_part0, frames_part1


def write_bootanimation_zip(frames_part0, frames_part1, output_path):
    """Package frames into an Android bootanimation.zip."""
    tmp_dir = output_path.parent / "_bootanim_tmp"
    if tmp_dir.exists():
        shutil.rmtree(tmp_dir)

    part0_dir = tmp_dir / "part0"
    part1_dir = tmp_dir / "part1"
    part0_dir.mkdir(parents=True)
    part1_dir.mkdir(parents=True)

    # Save frames as PNG
    for i, frame in enumerate(frames_part0):
        frame.save(part0_dir / f"{i:05d}.png", "PNG", optimize=True)
    for i, frame in enumerate(frames_part1):
        frame.save(part1_dir / f"{i:05d}.png", "PNG", optimize=True)

    # desc.txt
    # Format: WIDTH HEIGHT FPS
    #         p COUNT PAUSE FOLDER
    # part0: play once (count=1), no pause
    # part1: loop forever (count=0), no pause
    desc = f"{WIDTH} {HEIGHT} {FPS}\n"
    desc += "p 1 0 part0\n"
    desc += "p 0 0 part1\n"

    desc_path = tmp_dir / "desc.txt"
    desc_path.write_text(desc)

    # Create ZIP (must use STORED, not DEFLATED — Android requires it)
    with zipfile.ZipFile(output_path, "w", zipfile.ZIP_STORED) as zf:
        zf.write(desc_path, "desc.txt")
        for part_name, part_dir in [("part0", part0_dir), ("part1", part1_dir)]:
            for png in sorted(part_dir.glob("*.png")):
                zf.write(png, f"{part_name}/{png.name}")

    # Clean up
    shutil.rmtree(tmp_dir)
    print(f"Boot animation written to {output_path}")
    size_mb = output_path.stat().st_size / (1024 * 1024)
    print(
        f"Size: {size_mb:.1f} MB ({len(frames_part0)} + {len(frames_part1)} frames @ {FPS} fps)"
    )


def main():
    parser = argparse.ArgumentParser(description="Generate Lethe boot animation")
    parser.add_argument(
        "--source",
        type=Path,
        default=DEFAULT_SOURCE,
        help="Source image (default: overlays/lockscreen.png)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help="Output ZIP path (default: bootanimation/bootanimation.zip)",
    )
    args = parser.parse_args()

    if not args.source.exists():
        print(f"Error: source image not found: {args.source}")
        return 1

    print(f"Source: {args.source}")
    print(
        f"Animation: {FADEIN_FRAMES} fade-in + {BREATH_FRAMES} breathing loop @ {FPS} fps"
    )
    print(f"Brightness: {MAX_BRIGHTNESS:.0%} hold, ±{BREATH_AMPLITUDE:.0%} pulse")

    frames_part0, frames_part1 = generate_frames(args.source)
    write_bootanimation_zip(frames_part0, frames_part1, args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
