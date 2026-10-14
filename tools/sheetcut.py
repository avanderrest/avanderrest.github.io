"""Cut a background-removed AI art sheet into game sprites.

Amber paints or generates a sheet of sprites (Gemini, then a background remover such as
InSPyReNet or ToonOut), and a short per-game script cuts it up with this module:

    import sys; sys.path.insert(0, "tools"); from sheetcut import *
    sh = load(REF, "Gemini_..._inspyrenet.png")
    boxes = islands(sh, gap=3)          # alpha islands, reading order
    preview(sh, boxes, "scratch.jpg")   # numbered contact sheet to read by eye
    save(sh, boxes[4], OUT, "enemy/troll.png", maxdim=96)

CLI:  python sheetcut.py <sheet> <preview.jpg> [gap] [min_area] [row_band]
prints each island's box and writes the numbered preview.

The traps: dilate with `gap` so an object and its shadow come back as one island; force the
near-clear halo to zero before trimming (`clean`); always look at the preview before wiring
anything into a game. Needs Pillow and NumPy.
"""
import os, sys
import numpy as np
from PIL import Image, ImageDraw


def load(folder, name=None):
    return Image.open(os.path.join(folder, name) if name else folder).convert("RGBA")


def islands(im, thr=40, min_area=400, gap=3, row_band=60):
    """Boxes (x0, y0, x1, y1) of opaque islands, sorted top-to-bottom in bands
    of `row_band` px, then left to right."""
    from collections import deque
    a = np.array(im)[:, :, 3] > thr
    m = a.copy()
    for d in range(1, gap + 1):
        m[d:, :] |= a[:-d, :]; m[:-d, :] |= a[d:, :]
        m[:, d:] |= a[:, :-d]; m[:, :-d] |= a[:, d:]
    H, W = m.shape
    lab = np.zeros((H, W), np.int32)
    out, n = [], 0
    ys, xs = np.nonzero(m)
    for sy, sx in zip(ys, xs):
        if lab[sy, sx]:
            continue
        n += 1
        lab[sy, sx] = n
        q = deque([(sy, sx)])
        x0 = x1 = sx; y0 = y1 = sy; cnt = 0
        while q:
            y, x = q.popleft(); cnt += 1
            if x < x0: x0 = x
            if x > x1: x1 = x
            if y < y0: y0 = y
            if y > y1: y1 = y
            for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= ny < H and 0 <= nx < W and m[ny, nx] and not lab[ny, nx]:
                    lab[ny, nx] = n
                    q.append((ny, nx))
        if cnt >= min_area:
            out.append((int(x0), int(y0), int(x1) + 1, int(y1) + 1))
    out.sort(key=lambda b: (b[1] // row_band, b[0]))
    return out


def preview(im, boxes, path, cell=150):
    """A numbered contact sheet of every island, on a mid checker so both dark
    and light sprites read."""
    cols = 8
    rows = (len(boxes) + cols - 1) // cols or 1
    sheet = Image.new("RGB", (cols * cell, rows * (cell + 16)), (120, 120, 130))
    d = ImageDraw.Draw(sheet)
    for i, b in enumerate(boxes):
        c = im.crop(b)
        c.thumbnail((cell - 6, cell - 6))
        x, y = (i % cols) * cell, (i // cols) * (cell + 16)
        bg = Image.new("RGBA", c.size, (200, 180, 200, 255))
        bg.alpha_composite(c)
        sheet.paste(bg.convert("RGB"), (x + 3, y + 16))
        d.text((x + 3, y + 2), f"{i} {b[2]-b[0]}x{b[3]-b[1]}", fill=(255, 255, 0))
    sheet.save(path, quality=88)


def clean(im, thr=24):
    r, g, b, a = im.split()
    return Image.merge("RGBA", (r, g, b, a.point(lambda v: 0 if v < thr else v)))


def trim(im, thr=8):
    bb = im.split()[3].point(lambda v: 255 if v > thr else 0).getbbox()
    return im.crop(bb) if bb else im


def key_magenta(im, tol=90):
    """For sheets that still have a flat magenta ground: make it clear."""
    arr = np.array(im.convert("RGBA")).astype(np.int32)
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
    dist = np.abs(r - 255) + g + np.abs(b - 255)
    arr[..., 3] = np.where(dist < tol, 0, arr[..., 3])
    return Image.fromarray(arr.astype(np.uint8), "RGBA")


def fit(im, maxdim=None, maxw=None, maxh=None, pixel=False):
    s = 1.0
    if maxdim: s = min(s, maxdim / max(im.size))
    if maxw: s = min(s, maxw / im.width)
    if maxh: s = min(s, maxh / im.height)
    if s >= 1:
        return im
    size = (max(1, round(im.width * s)), max(1, round(im.height * s)))
    return im.resize(size, Image.NEAREST if pixel else Image.LANCZOS)


def save(im, box, outdir, name, maxdim=None, maxw=None, maxh=None, pixel=False,
         do_trim=True, quiet=False):
    out = im.crop(box) if box else im.copy()
    out = clean(out)
    if do_trim:
        out = trim(out)
    out = fit(out, maxdim, maxw, maxh, pixel)
    path = os.path.join(outdir, name)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    out.save(path, optimize=True)
    if not quiet:
        print(f"{name:36s} {out.width:4d}x{out.height:<4d} {os.path.getsize(path)//1024:4d}KB")
    return out


def contact(paths, path, cell=120, bg=(200, 190, 170)):
    """Re-render the finished sprites so the result can be checked by eye."""
    cols = 8
    rows = (len(paths) + cols - 1) // cols or 1
    sheet = Image.new("RGB", (cols * cell, rows * (cell + 14)), bg)
    d = ImageDraw.Draw(sheet)
    for i, p in enumerate(paths):
        c = Image.open(p).convert("RGBA")
        c.thumbnail((cell - 6, cell - 6))
        x, y = (i % cols) * cell, (i // cols) * (cell + 14)
        tile = Image.new("RGBA", c.size, bg + (255,))
        tile.alpha_composite(c)
        sheet.paste(tile.convert("RGB"), (x + 3, y + 14))
        d.text((x + 3, y + 1), os.path.basename(p)[:18], fill=(40, 20, 20))
    sheet.save(path, quality=88)


if __name__ == "__main__":
    sh = load(sys.argv[1])
    gap = int(sys.argv[3]) if len(sys.argv) > 3 else 3
    mn = int(sys.argv[4]) if len(sys.argv) > 4 else 400
    band = int(sys.argv[5]) if len(sys.argv) > 5 else 60
    bx = islands(sh, gap=gap, min_area=mn, row_band=band)
    print(f"# {sh.size} {len(bx)} islands")
    for i, b in enumerate(bx):
        print(i, b, f"{b[2]-b[0]}x{b[3]-b[1]}")
    preview(sh, bx, sys.argv[2])
