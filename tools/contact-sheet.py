"""Lay a game's finished sprites out on one labelled sheet, to check them by eye.

    python tools/contact-sheet.py <out.jpg> <file or glob> [more ...] [--cell 150] [--bg 90,140,80]

    python tools/contact-sheet.py houses.jpg "route-builder/assets/house-*.png"

Files are sorted by name with their numbers read as numbers (house-2 before house-10), each
is shrunk into its cell on the given background and captioned with its name. Looking at a
whole set at once is how you spot the one that is the wrong size, still has its halo, or
is a duplicate, before it ends up in a game. Needs Pillow.
"""
import glob
import os
import re
import sys

from PIL import Image, ImageDraw

args = sys.argv[1:]
def opt(name, default):
    if name in args:
        i = args.index(name); v = args[i + 1]; del args[i:i + 2]; return v
    return default
cell = int(opt("--cell", "150"))
bg = tuple(int(v) for v in opt("--bg", "90,140,80").split(","))
if len(args) < 2:
    sys.exit(__doc__)
out, patterns = args[0], args[1:]

files = sorted({f for p in patterns for f in glob.glob(p)},
               key=lambda f: [int(t) if t.isdigit() else t for t in re.split(r"(\d+)", os.path.basename(f))])
if not files:
    sys.exit("no files matched")
cols = max(1, min(10, round(len(files) ** 0.5 * 1.5)))
rows = (len(files) + cols - 1) // cols
sheet = Image.new("RGB", (cols * cell, rows * cell), bg)
d = ImageDraw.Draw(sheet)
for i, f in enumerate(files):
    im = Image.open(f).convert("RGBA")
    size = im.size
    im.thumbnail((cell - 10, cell - 26))
    x, y = (i % cols) * cell, (i // cols) * cell
    sheet.paste(im, (x + 5, y + 5), im)
    d.text((x + 5, y + cell - 18), f"{os.path.splitext(os.path.basename(f))[0]} {size[0]}x{size[1]}", fill=(255, 255, 255))
sheet.save(out, quality=88)
print(f"{len(files)} pictures -> {out}")
