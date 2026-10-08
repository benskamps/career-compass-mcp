"""Shrink the rendered brand PNGs to <= 600 KB each.

    python3 optimize.py RAW_DIR OUT_DIR

Strategy per file: banners try the full 2x render on a 256-colour octree palette with
Floyd-Steinberg dithering (undithered palettes band the lamplight glow); over budget, they fall
back to 1x (the effective size), same treatment. Social cards ship at exact spec size, true colour
if it fits, else the dithered palette. Last resort is an undithered palette.
"""
import io
import sys
from pathlib import Path
from PIL import Image

BUDGET = 600 * 1024
EFFECTIVE = {
    "banner.png": (1600, 560),
    "banner-dark.png": (1600, 560),
    "social-preview.png": (1280, 640),
    "og.png": (1200, 630),
}
# Social cards ship at their exact spec size (og:image width/height and GitHub's 1280x640).
EXACT = {"social-preview.png", "og.png"}


def palette_png(img, dither=False):
    # Fast octree keeps the small brand accents (sage, clay) true; median cut drifts them.
    q = img.quantize(256, method=Image.Quantize.FASTOCTREE)
    if dither:  # re-map onto the octree palette with Floyd-Steinberg to break up banding
        q = img.quantize(palette=q, dither=Image.Dither.FLOYDSTEINBERG)
    buf = io.BytesIO()
    q.save(buf, "PNG", optimize=True)
    return buf.getvalue()


def rgb_png(img):
    buf = io.BytesIO()
    img.save(buf, "PNG", optimize=True)
    return buf.getvalue()


def main(raw_dir, out_dir):
    raw_dir, out_dir = Path(raw_dir), Path(out_dir)
    for name, size in EFFECTIVE.items():
        src = raw_dir / name
        if not src.exists():
            continue
        full = Image.open(src).convert("RGB")
        one = full.resize(size, Image.LANCZOS)
        # At 1x the grain averages out and a palette bands the lamplight glow, so exact-size
        # cards try true-colour first.
        attempts = [("1x rgb", lambda: rgb_png(one))] if name in EXACT else [("2x palette, dithered", lambda: palette_png(full, dither=True))]
        attempts += [
            ("1x palette, dithered", lambda: palette_png(one, dither=True)),
            ("1x palette", lambda: palette_png(one)),
            ("1x rgb", lambda: rgb_png(one)),
        ]
        for label, fn in attempts:
            data = fn()
            if len(data) <= BUDGET:
                break
        (out_dir / name).write_bytes(data)
        print(f"{name}: {label}, {len(data) // 1024} KB")


if __name__ == "__main__":
    main(*sys.argv[1:3])
