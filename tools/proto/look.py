"""Measure reference images: the colours and light a prototype should borrow.

    python tools/proto/look.py refs/a.png refs/b.jpg
    python tools/proto/look.py refs/*.png --swatches refs --json look.json

Prints one JSON object on stdout, so `node tools/proto/new.js --ref <image>` can turn it
into LOOK.md. Each image gets its size, a quantised palette with shares, the average colour
of a 3x3 grid (which reads as "the sky is violet, the street is black, the signs are pink"),
and its brightness and saturation. With `--swatches <dir>` a strip of the palette is saved
there as `<name>-palette.png`, to check by eye that the measurement is not nonsense.

An image is a *reference*, not an asset: this measures it and nothing else. Needs Pillow.

    python tools/proto/look.py picture.png          # JSON only
    python tools/proto/look.py picture.png --pretty # the same, indented
"""
import argparse
import json
import os
import sys

from PIL import Image

REGIONS = [
    "top-left", "top", "top-right",
    "mid-left", "centre", "mid-right",
    "bottom-left", "bottom", "bottom-right",
]
SWATCH_W, SWATCH_H = 96, 48


def hexed(rgb):
    return "#%02x%02x%02x" % tuple(int(v) for v in rgb[:3])


def luma(rgb):
    r, g, b = [v / 255 for v in rgb[:3]]
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def saturation(rgb):
    r, g, b = [v / 255 for v in rgb[:3]]
    hi, lo = max(r, g, b), min(r, g, b)
    return 0.0 if hi == 0 else (hi - lo) / hi


def _colors(im, colors, min_share):
    small = im.convert("RGB")
    q = small.quantize(colors=colors, method=Image.Quantize.MEDIANCUT)
    raw = q.getpalette() or []
    total = max(1, small.width * small.height)
    out = []
    for count, index in (q.getcolors() or []):
        rgb = tuple(raw[index * 3:index * 3 + 3])
        if len(rgb) < 3:
            continue
        share = count / total
        if share < min_share:
            continue
        out.append({
            "hex": hexed(rgb),
            "share": round(share, 3),
            "brightness": round(luma(rgb), 3),
            "saturation": round(saturation(rgb), 3),
        })
    return out


def palette(im):
    """The image's colours, most used first: what it is mostly made of."""
    out = _colors(im, colors=10, min_share=0.005)
    out.sort(key=lambda c: c["share"], reverse=True)
    return out


def accents(im):
    """The loud colours: signs, lamps, food. The main palette is weighted by area, so a
    neon sign vanishes into the dark street it hangs over; this looks only at pixels that
    are bright and saturated, and reports what they are."""
    small = im.convert("RGB").resize((256, 256), Image.Resampling.BOX)
    raw = small.tobytes()
    total = max(1, len(raw) // 3)
    counts = {}
    for i in range(0, len(raw), 3):
        rgb = (raw[i], raw[i + 1], raw[i + 2])
        if luma(rgb) < 0.42 or saturation(rgb) < 0.42:
            continue
        key = (rgb[0] >> 4, rgb[1] >> 4, rgb[2] >> 4)
        counts[key] = counts.get(key, 0) + 1
    found = []
    for (r, g, b), count in counts.items():
        rgb = ((r << 4) + 8, (g << 4) + 8, (b << 4) + 8)
        found.append({
            "hex": hexed(rgb),
            "share": round(count / total, 3),
            "brightness": round(luma(rgb), 3),
            "saturation": round(saturation(rgb), 3),
        })
    found.sort(key=lambda c: c["share"], reverse=True)
    # drop buckets that are a shade of one already picked
    picked = []
    for c in found:
        rgb = tuple(int(c["hex"][j:j + 2], 16) for j in (1, 3, 5))
        if any(sum((a - b) ** 2 for a, b in zip(rgb, tuple(int(p["hex"][j:j + 2], 16) for j in (1, 3, 5)))) < 52 ** 2 for p in picked):
            continue
        picked.append(c)
        if len(picked) == 8:
            break
    if not picked:
        picked = palette(im)[:6]
    return picked


def regions(im):
    """Average colour of each cell of a 3x3 grid: where the light is."""
    small = im.convert("RGB").resize((3, 3), Image.Resampling.BOX)
    cells = []
    for y in range(3):
        for x in range(3):
            cells.append((REGIONS[y * 3 + x], hexed(small.getpixel((x, y)))))
    return dict(cells)


def light(im):
    """Brightness and saturation over a 64x64 sample, for "dark and neon" vs "pale and flat"."""
    small = im.convert("RGB").resize((64, 64), Image.Resampling.BOX)
    raw = small.tobytes()
    n = max(1, len(raw) // 3)
    px = [raw[i:i + 3] for i in range(0, len(raw), 3)]
    return {
        "brightness": round(sum(luma(p) for p in px) / n, 3),
        "saturation": round(sum(saturation(p) for p in px) / n, 3),
    }


def swatches(pal, path):
    strip = Image.new("RGB", (SWATCH_W * max(1, len(pal)), SWATCH_H), (0, 0, 0))
    for i, c in enumerate(pal):
        box = Image.new("RGB", (SWATCH_W, SWATCH_H), tuple(int(c["hex"][j:j + 2], 16) for j in (1, 3, 5)))
        strip.paste(box, (i * SWATCH_W, 0))
    strip.save(path)


def measure(path, swatch_dir=None):
    im = Image.open(path)
    im.load()
    pal = palette(im)
    out = {
        "file": path.replace(os.sep, "/"),
        "width": im.width,
        "height": im.height,
        "palette": pal,
        "accents": accents(im),
        "regions": regions(im),
        **light(im),
    }
    if swatch_dir:
        os.makedirs(swatch_dir, exist_ok=True)
        stem = os.path.splitext(os.path.basename(path))[0]
        out["swatch"] = os.path.join(swatch_dir, stem + "-palette.png").replace(os.sep, "/")
        swatches(pal, out["swatch"])
    return out


def main():
    ap = argparse.ArgumentParser(description="Measure reference images into a palette and light report.")
    ap.add_argument("images", nargs="+", help="the reference images")
    ap.add_argument("--swatches", metavar="DIR", help="save a palette strip per image here")
    ap.add_argument("--json", metavar="FILE", help="also write the report to this file")
    ap.add_argument("--pretty", action="store_true", help="indent the JSON")
    a = ap.parse_args()

    report = {"images": []}
    for path in a.images:
        try:
            report["images"].append(measure(path, a.swatches))
        except Exception as err:  # noqa: BLE001 - one bad file should not lose the rest
            print(f"look.py: {path}: {err}", file=sys.stderr)
            report["images"].append({"file": path.replace(os.sep, "/"), "error": str(err)})

    text = json.dumps(report, indent=2 if a.pretty else None)
    if a.json:
        with open(a.json, "w", encoding="utf-8") as fh:
            fh.write(text + "\n")
    print(text)


if __name__ == "__main__":
    main()
