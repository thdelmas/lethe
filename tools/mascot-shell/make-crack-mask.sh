#!/usr/bin/env bash
# Step 2 of the crack-shell pipeline: segment the crack/vein network out of the
# stone albedo atlas and emit an RGBA texture (albedo RGB, alpha = crack mask).
#
# The cracks are the BRIGHT COOL lines between the dark plates. Three tests,
# all of them load-bearing:
#   luminance > T      picks the lit veins out of the dark stone
#   (B - R) > 0.05     drops the warm beige lichen specks, which are just as bright
#   (G - B) < 0.06     drops the green moss, which is also cool-ish and bright
#
# Do NOT dilate the result. Diamond:1 on a 512^2 atlas takes coverage from
# 6.9% to 14% and fattens hairline veins into blobs.
set -euo pipefail

SRC="${1:?usage: make-crack-mask.sh <basecolor.jpg> <out.png> [threshold]}"
OUT="${2:?}"
T="${3:-0.62}"

convert "$SRC" \
    -fx "( (0.299*u.r+0.587*u.g+0.114*u.b) > $T && (u.b-u.r) > 0.05 && (u.g-u.b) < 0.06 ) ? 1 : 0" \
    -colorspace Gray "${OUT%.png}.mask.png"

convert "$SRC" "${OUT%.png}.mask.png" -alpha off -compose CopyOpacity -composite "PNG32:$OUT"

convert "$OUT" -format "crack coverage: %[fx:mean.a*100]%% (expect ~7%% at T=$T)\n" info:
