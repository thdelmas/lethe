#!/usr/bin/env python3
"""Generate minimalist Lethe wallpaper — red vein fractures on true black.

The aesthetic: obsidian cracked by magma. Hairline red lines emerge from
edges and corners, branching sparsely. 80%+ of the canvas is #000000
(OLED power savings). The cracks glow faintly — a thin bright core with
a soft red bloom around it.

Outputs:
  - wallpaper.png  (home screen)
  - lockscreen.png (lock screen — same art, slightly dimmer)

Usage:
    python3 generate-wallpaper.py [--width 1080] [--height 2400] [--seed 42]

Requires: Pillow (pip install Pillow)
"""

import argparse
import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_WALLPAPER = SCRIPT_DIR.parent / "overlays" / "wallpaper.png"
DEFAULT_LOCKSCREEN = SCRIPT_DIR.parent / "overlays" / "lockscreen.png"

# Crack colors
CORE_COLOR = (200, 30, 30)  # Bright red core of the crack
GLOW_COLOR = (140, 18, 18)  # Dimmer bloom around it
BG_COLOR = (0, 0, 0)  # True OLED black


def fracture_branch(draw, x, y, angle, length, width, depth, max_depth, rng):
    """Recursively draw a branching fracture line."""
    if depth > max_depth or length < 4:
        return

    # Walk along the crack with slight angular drift
    steps = int(length)
    points = [(x, y)]
    cx, cy = x, y

    for _ in range(steps):
        # Subtle random wobble
        angle += rng.gauss(0, 0.08)
        cx += math.cos(angle)
        cy += math.sin(angle)
        points.append((cx, cy))

    if len(points) < 2:
        return

    # Draw the crack — thin bright core
    core_width = max(1, width)
    draw.line(points, fill=CORE_COLOR, width=core_width)

    # Randomly branch
    branch_chance = 0.3 if depth < 2 else 0.15
    for i in range(steps):
        if rng.random() < branch_chance / steps:
            bx, by = points[min(i, len(points) - 1)]
            branch_angle = angle + rng.choice([-1, 1]) * rng.uniform(0.4, 1.2)
            branch_length = length * rng.uniform(0.3, 0.6)
            branch_width = max(1, width - 1)
            fracture_branch(
                draw,
                bx,
                by,
                branch_angle,
                branch_length,
                branch_width,
                depth + 1,
                max_depth,
                rng,
            )


def generate_wallpaper(width, height, seed):
    """Generate the cracked obsidian wallpaper."""
    rng = random.Random(seed)  # noqa: S311
    img = Image.new("RGB", (width, height), BG_COLOR)
    draw = ImageDraw.Draw(img)

    # Create a separate layer for glow
    glow_layer = Image.new("RGB", (width, height), BG_COLOR)
    glow_draw = ImageDraw.Draw(glow_layer)

    # Spawn fractures from edges and corners — sparse
    spawn_points = []

    # Corner origins (most dramatic)
    corners = [
        (0, 0, rng.uniform(0.2, 0.8)),
        (width, 0, rng.uniform(0.2, 0.6)),
        (0, height, rng.uniform(0.3, 0.7)),
        (width, height, rng.uniform(0.4, 0.9)),
    ]
    for cx, cy, prob in corners:
        if rng.random() < prob:
            angle = math.atan2(height / 2 - cy, width / 2 - cx) + rng.gauss(0, 0.5)
            spawn_points.append((cx, cy, angle))

    # Edge origins (subtler)
    for _ in range(rng.randint(2, 5)):
        edge = rng.choice(["top", "bottom", "left", "right"])
        if edge == "top":
            ex, ey = rng.randint(0, width), 0
            angle = rng.uniform(0.3, 2.8)
        elif edge == "bottom":
            ex, ey = rng.randint(0, width), height
            angle = rng.uniform(-2.8, -0.3)
        elif edge == "left":
            ex, ey = 0, rng.randint(0, height)
            angle = rng.uniform(-0.8, 0.8)
        else:
            ex, ey = width, rng.randint(0, height)
            angle = rng.uniform(2.3, 3.9)
        spawn_points.append((ex, ey, angle))

    # Draw fractures on both layers
    for sx, sy, angle in spawn_points:
        length = rng.uniform(min(width, height) * 0.3, min(width, height) * 0.8)
        w = rng.choice([1, 1, 1, 2])  # Mostly hairline

        # Glow layer — slightly thicker, dimmer
        fracture_branch(glow_draw, sx, sy, angle, length, w + 2, 0, 4, rng)
        # Core layer — thin, bright
        fracture_branch(draw, sx, sy, angle, length, w, 0, 4, rng)

    # Blur the glow layer for soft bloom
    glow_layer = glow_layer.filter(ImageFilter.GaussianBlur(radius=6))

    # Composite: glow underneath, core on top (screen blend)
    result = Image.new("RGB", (width, height), BG_COLOR)
    for y_px in range(height):
        for x_px in range(width):
            gr, gg, gb = glow_layer.getpixel((x_px, y_px))
            cr, cg, cb = img.getpixel((x_px, y_px))
            # Screen blend: 1 - (1-a)(1-b)
            r = min(255, cr + gr - (cr * gr) // 255)
            g = min(255, cg + gg - (cg * gg) // 255)
            b = min(255, cb + gb - (cb * gb) // 255)
            result.putpixel((x_px, y_px), (r, g, b))

    return result


def generate_wallpaper_fast(width, height, seed):
    """Generate the cracked obsidian wallpaper using numpy for speed."""
    try:
        import numpy as np
    except ImportError:
        return generate_wallpaper(width, height, seed)

    rng = random.Random(seed)  # noqa: S311
    img = Image.new("RGB", (width, height), BG_COLOR)
    draw = ImageDraw.Draw(img)

    glow_layer = Image.new("RGB", (width, height), BG_COLOR)
    glow_draw = ImageDraw.Draw(glow_layer)

    spawn_points = []

    corners = [
        (0, 0, rng.uniform(0.2, 0.8)),
        (width, 0, rng.uniform(0.2, 0.6)),
        (0, height, rng.uniform(0.3, 0.7)),
        (width, height, rng.uniform(0.4, 0.9)),
    ]
    for cx, cy, prob in corners:
        if rng.random() < prob:
            angle = math.atan2(height / 2 - cy, width / 2 - cx) + rng.gauss(0, 0.5)
            spawn_points.append((cx, cy, angle))

    for _ in range(rng.randint(2, 5)):
        edge = rng.choice(["top", "bottom", "left", "right"])
        if edge == "top":
            ex, ey = rng.randint(0, width), 0
            angle = rng.uniform(0.3, 2.8)
        elif edge == "bottom":
            ex, ey = rng.randint(0, width), height
            angle = rng.uniform(-2.8, -0.3)
        elif edge == "left":
            ex, ey = 0, rng.randint(0, height)
            angle = rng.uniform(-0.8, 0.8)
        else:
            ex, ey = width, rng.randint(0, height)
            angle = rng.uniform(2.3, 3.9)
        spawn_points.append((ex, ey, angle))

    for sx, sy, angle in spawn_points:
        length = rng.uniform(min(width, height) * 0.3, min(width, height) * 0.8)
        w = rng.choice([1, 1, 1, 2])
        fracture_branch(glow_draw, sx, sy, angle, length, w + 2, 0, 4, rng)
        fracture_branch(draw, sx, sy, angle, length, w, 0, 4, rng)

    glow_layer = glow_layer.filter(ImageFilter.GaussianBlur(radius=6))

    # Fast compositing with numpy
    glow_arr = np.array(glow_layer, dtype=np.float32)
    core_arr = np.array(img, dtype=np.float32)

    # Screen blend
    result_arr = core_arr + glow_arr - (core_arr * glow_arr) / 255.0
    result_arr = np.clip(result_arr, 0, 255).astype(np.uint8)

    return Image.fromarray(result_arr)


def main():
    parser = argparse.ArgumentParser(description="Generate Lethe minimalist wallpaper")
    parser.add_argument("--width", type=int, default=1080, help="Width in pixels")
    parser.add_argument("--height", type=int, default=2400, help="Height in pixels")
    parser.add_argument("--seed", type=int, default=42, help="RNG seed for reproducibility")
    parser.add_argument("--wallpaper", type=Path, default=DEFAULT_WALLPAPER)
    parser.add_argument("--lockscreen", type=Path, default=DEFAULT_LOCKSCREEN)
    args = parser.parse_args()

    print(f"Generating {args.width}x{args.height} wallpaper (seed={args.seed})...")

    wallpaper = generate_wallpaper_fast(args.width, args.height, args.seed)
    wallpaper.save(args.wallpaper, "PNG", optimize=True)
    print(f"Wallpaper: {args.wallpaper}")

    # Lockscreen: same art, slightly dimmer (70% brightness)
    from PIL import ImageEnhance

    lockscreen = ImageEnhance.Brightness(wallpaper).enhance(0.7)
    lockscreen.save(args.lockscreen, "PNG", optimize=True)
    print(f"Lockscreen: {args.lockscreen}")

    # Report OLED black percentage
    total = args.width * args.height
    black_pixels = sum(
        1 for x in range(args.width) for y in range(args.height) if wallpaper.getpixel((x, y)) == (0, 0, 0)
    )
    pct = black_pixels / total * 100
    print(f"OLED black: {pct:.0f}% of pixels are #000000")


if __name__ == "__main__":
    raise SystemExit(main())
