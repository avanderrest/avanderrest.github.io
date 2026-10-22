"""Render a set of variants of one idea and put them on a single labelled sheet.

    python tools/prototype.py tools/prototypes.example.json
    python tools/prototype.py --mode sprite --prompt "a noodle vendor" --seeds 1,2,3
    python tools/prototype.py --mode scene --prompt "a rainy neon street market" --seeds 4,5

Sprites, props or scenes? Each for a different job.

  `sprite` renders ONE person per image: full body, centred, on a flat backdrop, and with
  `--cutout` that backdrop is keyed out so you are looking at the asset the game would use.
  Use it for anything the game composites — a vendor, a customer.

  `prop` renders ONE object per image, whole and centred, on the same flat backdrop (also
  with `--cutout`): a machine, a cup, a crate. The sprite prompts say "character" and
  "full body" and rule out props, which pulls an object shot the wrong way.

  `scene` renders the whole frame, for mood, layout and palette.

  Do not cut sprites out of a scene. They overlap each other, their scale depends on how far
  back they stand, and the backdrop is not flat, so the seam is guesswork: you get a
  souvenir, not an asset. Generate the scene to set the look, then generate the sprite to
  make the thing.

A run makes a grid: one row per prompt (or per setting), one column per seed, every cell
labelled, with the sprites stood on a shared floor line so you can compare them by size.
Each cell is also written out on its own at native pixel size, next to the sheet, so a
winner can go into a game without another render.

Needs Pillow; rendering also needs torch + diffusers built for the card (cu128 or newer on
a 50-series). See tools/README.md.
"""
import argparse
import importlib.util
import json
import os
import sys
from collections import deque

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))

# The pipeline lives in pixel-art.py. It is hyphenated like every tool here, so it is loaded
# by path rather than imported by name; this keeps one copy of bloom and pixelate.
def pipeline():
    spec = importlib.util.spec_from_file_location("pixel_art", os.path.join(HERE, "pixel-art.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


SPRITE_TAIL = (
    ", character design sheet, one figure, full body, standing, centred, "
    "isolated on a plain solid dark background, no scenery, no environment, no text"
)
SPRITE_NEG = (
    "multiple people, crowd, scene, interior, room, street, shop, wall, floor, furniture, "
    "background scenery, props, text, watermark, cropped, cut off, close up, photo, "
    "3d render, blurry"
)

PROP_TAIL = (
    ", single object, product shot, full object in frame, centred, "
    "isolated on a plain solid dark background, no scenery, no environment, no text"
)
PROP_NEG = (
    "multiple objects, duplicate, crowd, character, person, hands, scene, interior, room, "
    "street, shop, wall, floor, furniture, background scenery, text, labels, watermark, "
    "cropped, cut off, close up, photo, 3d render, blurry"
)


def cut_out(img, tol=24):
    """Key the flat backdrop to transparent by flooding IN FROM THE BORDER.

    Same trick as key-background.py: only backdrop-coloured pixels joined to the edge go
    clear, so a light thing the figure encloses survives.
    """
    img = img.convert("RGBA")
    px = img.load()
    w, h = img.size
    key = px[2, 2][:3]

    def near(p):
        return max(abs(p[0] - key[0]), abs(p[1] - key[1]), abs(p[2] - key[2])) <= tol

    seen = set()
    q = deque()
    for x in range(w):
        q.extend(((x, 0), (x, h - 1)))
    for y in range(h):
        q.extend(((0, y), (w - 1, y)))

    while q:
        x, y = q.pop()
        if (x, y) in seen or not (0 <= x < w and 0 <= y < h):
            continue
        p = px[x, y]
        if not near(p):
            continue
        seen.add((x, y))
        px[x, y] = (p[0], p[1], p[2], 0)
        q.extend(((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)))
    return img


def trim(img, margin=2):
    """Crop to what is left after the cutout, with a pixel or two of air."""
    box = img.getchannel("A").getbbox()
    if not box:
        return img
    l, t, r, b = box
    return img.crop((max(0, l - margin), max(0, t - margin),
                     min(img.width, r + margin), min(img.height, b + margin)))


def checker(w, h, size=8):
    """A dark chessboard, so a cut-out sprite's edge is visible against it."""
    tile = Image.new("RGB", (w, h), (21, 16, 33))
    d = ImageDraw.Draw(tile)
    for y in range(0, h, size):
        for x in range(0, w, size):
            if (x // size + y // size) % 2:
                d.rectangle([x, y, x + size - 1, y + size - 1], fill=(29, 22, 48))
    return tile


def build_sheet(cells, row_labels, col_labels, zoom, title, out_path):
    """cells[row][col] is a native-size RGBA image. Sprites sit on a shared floor line."""
    cw = max(c.width for row in cells for c in row)
    ch = max(c.height for row in cells for c in row)
    gutter, head = 220, 30
    W = gutter + cw * zoom * len(col_labels)
    H = head + ch * zoom * len(cells)
    sheet = Image.new("RGB", (W, H), (13, 8, 24))
    d = ImageDraw.Draw(sheet)
    d.text((10, 10), title, fill=(220, 200, 245))
    for r, label in enumerate(col_labels, start=0):
        d.text((gutter + r * cw * zoom + 8, 12), label, fill=(140, 120, 180))
    for ri, row in enumerate(cells):
        top = head + ri * ch * zoom
        d.text((10, top + 16), row_labels[ri], fill=(183, 166, 214))
        for ci, img in enumerate(row):
            left = gutter + ci * cw * zoom
            sheet.paste(checker(cw * zoom, ch * zoom), (left, top))
            big = img.resize((img.width * zoom, img.height * zoom), Image.NEAREST)
            # stood on the floor: bottom-centred, so the shortest figure is visibly short
            x = left + (cw * zoom - big.width) // 2
            y = top + ch * zoom - big.height - 4 * zoom
            sheet.paste(big, (x, y), big)
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    sheet.save(out_path)
    return out_path


def read_spec(path):
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def main():
    ap = argparse.ArgumentParser(description="Prototype pixel-art variants side by side.")
    ap.add_argument("spec", nargs="?", help="JSON spec: {mode, style, rows: [{label, prompt}], seeds}")
    ap.add_argument("--mode", choices=["sprite", "prop", "scene"])
    ap.add_argument("--prompt", help="one row, the quick way")
    ap.add_argument("--label", default="variant")
    ap.add_argument("--style", default="detailed pixel art, neon cyberpunk")
    ap.add_argument("--seeds", default="1,2")
    ap.add_argument("--size", help="render size, default 768x768 for a sprite, 1024x576 for a scene")
    ap.add_argument("--block", type=int, default=3, help="pixel size: 3 fine, 4-6 chunky")
    ap.add_argument("--colors", type=int, default=64)
    ap.add_argument("--bloom", type=float, default=0.4)
    ap.add_argument("--steps", type=int, default=30)
    ap.add_argument("--cfg", type=float, default=6.5)
    ap.add_argument("--lora", type=float, default=1.0, help="0 turns the LoRA off")
    ap.add_argument("--cutout", action="store_true", help="key the sprite's backdrop out")
    ap.add_argument("--zoom", type=int, default=2, help="how big the cells are on the sheet")
    ap.add_argument("--out", default="test/_shots/prototype.png")
    ap.add_argument("--keep-raw", action="store_true", help="also save the unbaked render")
    a = ap.parse_args()

    spec = read_spec(a.spec) if a.spec else {}
    mode = a.mode or spec.get("mode", "sprite")
    style = spec.get("style", a.style)
    seeds = [int(s) for s in str(spec.get("seeds", a.seeds)).strip("[]").split(",")]
    rows = spec.get("rows") or [{"label": a.label, "prompt": a.prompt or ""}]
    size = a.size or spec.get("size") or ("768x768" if mode != "scene" else "1024x576")

    knobs = {
        "block": spec.get("block", a.block),
        "colors": spec.get("colors", a.colors),
        "bloom": spec.get("bloom", a.bloom),
    }

    pa = pipeline()
    width, height = pa.size_of(size)
    try:
        pipe = pa.load_pipe(spec.get("lora", a.lora))
    except (ImportError, ValueError) as exc:
        sys.exit(
            "this python cannot run the pipeline "
            f"({exc}). Use one with torch built for this card (cu128 or newer), "
            "diffusers and peft - see tools/README.md."
        )

    cells, labels = [], []
    out_dir = os.path.splitext(a.out)[0] + "-cells"
    os.makedirs(out_dir, exist_ok=True)

    for row in rows:
        label = row.get("label") or (row.get("prompt") or "variant")[:28]
        labels.append(label)
        line = []
        tail = {"sprite": SPRITE_TAIL, "prop": PROP_TAIL}.get(mode, "")
        negative = {"sprite": SPRITE_NEG, "prop": PROP_NEG}.get(mode)
        prompt = ", ".join(p for p in (style, row.get("prompt", "")) if p) + tail
        for seed in seeds:
            img = pa.render_with(pipe, prompt, seed, width, height,
                                 int(row.get("steps", a.steps)), float(row.get("cfg", a.cfg)),
                                 negative=negative)
            baked = pa.bloom(img, strength=float(row.get("bloom", knobs["bloom"])))
            _, native = pa.pixelate(baked, block=int(row.get("block", knobs["block"])),
                                    colors=int(row.get("colors", knobs["colors"])))
            native = native.convert("RGBA")
            if a.cutout and mode != "scene":
                native = trim(cut_out(native))
            stem = f"{label.lower().replace(' ', '-')}-s{seed}"
            native.save(os.path.join(out_dir, stem + ".png"))
            if a.keep_raw:
                img.save(os.path.join(out_dir, stem + "-raw.png"))
            line.append(native)
            print(f"  {label}  seed {seed}  {native.width}x{native.height}", flush=True)
        cells.append(line)

    path = build_sheet(cells, labels, [f"seed {s}" for s in seeds], a.zoom,
                       spec.get("title", "prototype"), a.out)
    print(path)


if __name__ == "__main__":
    main()
