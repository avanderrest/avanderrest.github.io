"""Render a set of variants of one idea and put them on a single labelled sheet.

    python tools/prototype.py tools/prototypes.example.json
    python tools/prototype.py --new coffee-rush
    python tools/prototype.py --game coffee-rush
    python tools/prototype.py --mode sprite --prompt "a noodle vendor" --seeds 1,2,3
    python tools/prototype.py --mode scene --prompt "a rainy neon street market" --seeds 4,5

Per game, `--new <slug>` asks the questions once — projection, room geometry and colours,
what the game already has, what it still needs, what to keep out — and writes
`tools/prototypes.<slug>.json` without touching the GPU. `--game <slug>` then loads that
file: what that game still needs, in its own style, with its own negative prompt. It is
the place to say what to generate, so a run does not have to be re-described on the
command line:

  {
    "title": "coffee-rush — the cafe, its people and its kit",
    "mode": "prop", "style": "...", "size": "768x768", "seeds": [1, 2],
    "perspective": "front-on, one-point perspective, camera at eye level",
    "negative": "building exterior, shopfront, street scene",   // added to the mode's own
    "compose": true, "stage": "1024x576",                       // a second sheet, all together
    "rows": [
      { "label": "room", "mode": "scene", "role": "background", "size": "1024x576",
        "image": "assets/room.jpg", "strength": 0.45, "prompt": "repaint this room..." },
      { "label": "customer", "mode": "sprite", "role": "person", "prompt": "..." },
      { "label": "crate", "prompt": "...", "style": "...", "cfg": 9, "negative": "..." }
    ]
  }

A row with `image` is rendered as img2img from that picture (an existing plate to restyle,
say), and one with `mockup` is rendered from a blockout. The blockout can be `boxes`
(`{"rect": [x, y, w, h], "color": "#rrggbb"}`, 0..1 of the frame), free `shapes` (`rect`,
`ellipse`, `poly` with normalised points, `line` with a pixel width), or a projection
preset: `{"preset": "grid", "cols": 12, "rows": 9, "tile": "#b98a63"}` for top-down tiles,
`{"preset": "iso", "cols": 8, "rows": 8, "tile_w": 96, "tile_h": 48}` for a diamond floor,
`{"preset": "side", "floor": 0.8}` for a stage. `strength` (0..1) says how far it repaints;
low keeps the layout. A row with `asset` uses art the game already has (its customers, its
kit) instead of rendering it, so the mock is not spent on things that are already drawn.

Rows may mix `mode`s (scene, sprite, prop) and a row's `role` says where it stands in the
composed frame: `background` behind, `person` at the edges, `prop` between them. The
`perspective` line is put into every prompt (a row may override it) so the camera is stated
once. A row may also override `style`, `size`, `cfg`, `steps`, `bloom`, `block`, `colors`,
`negative`, `strength`, `stage_seed` and `cutout`, for the one asset that needs different
words from the rest of the set. `stage_seed` pins that row's picture in the composed frame
while the grid still shows the variants. The isolation wording sits before the prompt, so a
long prompt cannot truncate it away.

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
    ", isolated on a plain flat light grey background, full body, one figure, no scenery"
)
SPRITE_NEG = (
    "multiple people, crowd, scene, interior, room, street, shop, wall, floor, furniture, "
    "background scenery, props, snow, night, text, watermark, cropped, cut off, close up, "
    "photo, 3d render, blurry"
)

PROP_TAIL = (
    ", isolated on a plain flat dark background, one object, product shot, no scenery"
)
PROP_NEG = (
    "multiple objects, duplicate, crowd, character, person, hands, scene, interior, room, "
    "street, shop, wall, floor, furniture, background scenery, product card, pedestal, "
    "display stand, frame, border, panel, surface, drop shadow, text, labels, watermark, "
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


def remove_plate(img, tol=24, share=0.55):
    """Key a flat product card or panel the border flood could not reach.

    A prop generated on its own little plate has a bbox whose edge is mostly one uniform
    colour, while a real cut-out's edge is the object's own varied silhouette. When that is
    true, flood the modal edge colour away, but only inside the bbox. Returns (img, removed).
    """
    img = img.convert("RGBA")
    bbox = img.getchannel("A").getbbox()
    if not bbox:
        return img, False
    l, t, r, b = bbox
    px = img.load()
    ring = []
    for x in range(l, r):
        ring.extend((px[x, t], px[x, b - 1]))
    for y in range(t, b):
        ring.extend((px[l, y], px[r - 1, y]))
    opaque = [p for p in ring if p[3] > 0]
    if len(opaque) < 32 or len(opaque) < 0.4 * len(ring):
        return img, False

    def q(p):
        return (p[0] // 12, p[1] // 12, p[2] // 12)

    counts = {}
    for p in opaque:
        counts[q(p)] = counts.get(q(p), 0) + 1
    key_q, n = max(counts.items(), key=lambda kv: kv[1])
    if n < share * len(opaque):
        return img, False
    key = (key_q[0] * 12 + 6, key_q[1] * 12 + 6, key_q[2] * 12 + 6)

    def near(p):
        return (p[3] == 0 or
                max(abs(p[0] - key[0]), abs(p[1] - key[1]), abs(p[2] - key[2])) <= tol)

    seen = set()
    stack = [(x, y) for (x, y) in ((xx, yy) for xx in range(l, r) for yy in (t, b - 1)) if near(px[x, y])]
    stack += [(x, y) for (x, y) in ((xx, yy) for yy in range(t, b) for xx in (l, r - 1)) if near(px[x, y])]
    removed = 0
    while stack:
        x, y = stack.pop()
        if (x, y) in seen or not (l <= x < r and t <= y < b):
            continue
        p = px[x, y]
        if not near(p):
            continue
        if p[3]:
            removed += 1
        seen.add((x, y))
        px[x, y] = (p[0], p[1], p[2], 0)
        stack.extend(((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)))
    return img, removed > 0


def _mockup_shapes(spec, w, h):
    """Turn {"boxes":...}, {"shapes":...} or a projection preset into flat shapes."""
    if "boxes" in spec:
        return [{"kind": "ellipse" if b.get("ellipse") else "rect",
                 "rect": b["rect"], "color": b.get("color", "#888888")} for b in spec["boxes"]]
    if "shapes" in spec:
        return spec["shapes"]
    preset = spec.get("preset")
    shapes = []
    if preset == "grid":  # top-down tiles
        cols, rows = int(spec.get("cols", 12)), int(spec.get("rows", 9))
        gap = float(spec.get("gap", 0.01))
        tile, tile2 = spec.get("tile", "#b98a63"), spec.get("tile2", spec.get("tile", "#b98a63"))
        for r in range(rows):
            for c in range(cols):
                shapes.append({"kind": "rect",
                               "rect": [c / cols, r / rows,
                                        1 / cols * (1 - gap), 1 / rows * (1 - gap)],
                               "color": tile if (c + r) % 2 == 0 else tile2})
    elif preset == "iso":  # diamond floor, 2:1 tiles by default
        cols, rows = int(spec.get("cols", 8)), int(spec.get("rows", 8))
        tw, th = float(spec.get("tile_w", 96)), float(spec.get("tile_h", 48))
        ox = float(spec.get("origin_x", 0.5)) * w - (cols - rows) * tw / 4
        oy = float(spec.get("origin_y", 0.18)) * h
        tile, tile2 = spec.get("tile", "#c98763"), spec.get("tile2", "#bd7d5b")
        for r in range(rows):
            for c in range(cols):
                cx = ox + (c - r) * tw / 2
                cy = oy + (c + r) * th / 2
                shapes.append({"kind": "poly", "points": [
                    [cx / w, (cy - th / 2) / h], [(cx + tw / 2) / w, cy / h],
                    [cx / w, (cy + th / 2) / h], [(cx - tw / 2) / w, cy / h]],
                    "color": tile if (c + r) % 2 == 0 else tile2})
    elif preset == "side":  # stage: wall above, floor below
        floor = float(spec.get("floor", 0.8))
        shapes.append({"kind": "rect", "rect": [0, 0, 1, floor], "color": spec.get("wall", "#8fae93")})
        shapes.append({"kind": "rect", "rect": [0, floor, 1, 1 - floor],
                       "color": spec.get("ground", "#c98763")})
    return shapes


def make_mockup(spec, w, h):
    """A crude blockout, for img2img to paint over.

    Accepts `boxes` (the old form), `shapes`, or a `preset`: "grid" for top-down tiles,
    "iso" for a diamond floor, "side" for a stage, "front" for a wall over a floor.
    Rects and ellipses use `rect: [x, y, w, h]` in 0..1; polygons use `points` in 0..1;
    lines use `points` plus `width` in pixels. Nothing is drawn that the model can read as
    an object; it is only regions and their colours, so the layout survives and the text
    prompt supplies the content.
    """
    background = spec.get("background", "#121212")
    im = Image.new("RGB", (w, h), background)
    d = ImageDraw.Draw(im)
    for shape in _mockup_shapes(spec, w, h):
        kind = shape.get("kind", "rect")
        colour = shape.get("color", "#888888")
        if kind == "rect":
            x, y, bw, bh = shape["rect"]
            d.rectangle([x * w, y * h, (x + bw) * w, (y + bh) * h], fill=colour)
        elif kind == "ellipse":
            x, y, bw, bh = shape["rect"]
            d.ellipse([x * w, y * h, (x + bw) * w, (y + bh) * h], fill=colour)
        elif kind == "poly":
            d.polygon([(x * w, y * h) for x, y in shape["points"]], fill=colour)
        elif kind == "line":
            d.line([(x * w, y * h) for x, y in shape["points"]],
                   fill=colour, width=int(shape.get("width", 2)))
    return im


def image_pipe(pipe):
    """The same weights, used as img2img: a mockup or a photo becomes the starting point."""
    from diffusers import StableDiffusionXLImg2ImgPipeline
    # diffusers 0.27 has no from_pipe; the components are shared, not copied.
    alt = StableDiffusionXLImg2ImgPipeline(**pipe.components)
    alt.set_progress_bar_config(disable=True)
    return alt


def render_img2img(pipe, prompt, seed, image, strength, steps, cfg, negative=None):
    import torch
    return pipe(
        prompt=prompt,
        negative_prompt=negative or "",
        image=image,
        strength=strength,
        num_inference_steps=steps,
        guidance_scale=cfg,
        generator=torch.Generator("cuda").manual_seed(seed),
    ).images[0]


def checker(w, h, size=8):
    """A dark chessboard, so a cut-out sprite's edge is visible against it."""
    tile = Image.new("RGB", (w, h), (21, 16, 33))
    d = ImageDraw.Draw(tile)
    for y in range(0, h, size):
        for x in range(0, w, size):
            if (x // size + y // size) % 2:
                d.rectangle([x, y, x + size - 1, y + size - 1], fill=(29, 22, 48))
    return tile


def build_sheet(cells, row_labels, col_labels, zoom, title, out_path, background=None):
    """cells[row][col] is a native-size RGBA image. Sprites sit on a shared floor line.

    `background` is a picture to stand them on (a game's room plate, say) instead of the
    checkerboard, so colour and outline are judged against what they will sit on. It is
    cover-cropped into each cell; the cut-out files themselves stay transparent.
    """
    cw = max(c.width for row in cells for c in row)
    ch = max(c.height for row in cells for c in row)
    gutter, head = 220, 30
    W = gutter + cw * zoom * len(col_labels)
    H = head + ch * zoom * len(cells)
    sheet = Image.new("RGB", (W, H), (13, 8, 24))
    d = ImageDraw.Draw(sheet)
    d.text((10, 10), title, fill=(220, 200, 245))
    bg_img = Image.open(background).convert("RGB") if background else None

    def cell_bg(w, h):
        return checker(w, h) if bg_img is None else _cover(bg_img, w, h)

    for r, label in enumerate(col_labels, start=0):
        d.text((gutter + r * cw * zoom + 8, 12), label, fill=(140, 120, 180))
    for ri, row in enumerate(cells):
        top = head + ri * ch * zoom
        d.text((10, top + 16), row_labels[ri], fill=(183, 166, 214))
        for ci, img in enumerate(row):
            left = gutter + ci * cw * zoom
            sheet.paste(cell_bg(cw * zoom, ch * zoom), (left, top))
            big = img.resize((img.width * zoom, img.height * zoom), Image.NEAREST)
            # stood on the floor: bottom-centred, so the shortest figure is visibly short
            x = left + (cw * zoom - big.width) // 2
            y = top + ch * zoom - big.height - 4 * zoom
            sheet.paste(big, (x, y), big)
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    sheet.save(out_path)
    return out_path


def _cover(img, w, h):
    """Scale a picture to fill w x h, cropping the overflow from the middle."""
    scale = max(w / img.width, h / img.height)
    big = img.resize((max(1, round(img.width * scale)),
                      max(1, round(img.height * scale))), Image.LANCZOS)
    left, top = (big.width - w) // 2, (big.height - h) // 2
    return big.crop((left, top, left + w, top + h))


def build_stage(cells, roles, seeds, title, out_path, stage="1024x576",
                floor=0.9, person_height=0.42, prop_height=0.3):
    """One frame per seed with the set together: background behind, people and props on the floor.

    `roles[i]` says what row i is ('background', 'person', 'prop'). People stand at the edges
    and props between them, so the set is judged as a set, not as a row of orphans. The
    placement is a mock, not the game's own floor plan: it shows scale, palette and outline.
    """
    w, h = (int(v) for v in str(stage).lower().split("x"))
    gutter, head = 90, 30
    sheet = Image.new("RGB", (gutter + w * len(seeds), head + h), (13, 8, 24))
    d = ImageDraw.Draw(sheet)
    d.text((10, 10), title + " — in one frame", fill=(220, 200, 245))
    bg_row = next((i for i, role in enumerate(roles) if role == "background"), None)

    def spread(n, lo, hi):
        if n <= 0:
            return []
        return [lo] if n == 1 else [lo + (hi - lo) * i / (n - 1) for i in range(n)]

    for ci, seed in enumerate(seeds):
        left = gutter + ci * w
        label = seed if isinstance(seed, str) else f"seed {seed}"
        d.text((left + 8, 12), label, fill=(140, 120, 180))
        if bg_row is not None:
            frame = _cover(cells[bg_row][ci].convert("RGB"), w, h).convert("RGBA")
        else:
            frame = checker(w, h).convert("RGBA")
        people = [cells[i][ci] for i, role in enumerate(roles) if role == "person"]
        props = [cells[i][ci] for i, role in enumerate(roles) if role == "prop"]
        xs_people = spread(len(people), 0.12, 0.88)
        # props sit between the people when there are any, and use the room otherwise
        xs_props = spread(len(props), 0.26, 0.74) if people else spread(len(props), 0.2, 0.8)
        baseline = int(floor * h)
        figures = [(x, img, person_height) for x, img in zip(xs_people, people)]
        figures += [(x, img, prop_height) for x, img in zip(xs_props, props)]
        for x, img, target in figures:
            s = target * h / img.height
            pic = img.resize((max(1, round(img.width * s)), max(1, round(img.height * s))),
                             Image.LANCZOS)
            shadow = Image.new("RGBA", frame.size, (0, 0, 0, 0))
            ImageDraw.Draw(shadow).ellipse(
                [x * w - pic.width * 0.38, baseline - 7,
                 x * w + pic.width * 0.38, baseline + 7],
                fill=(40, 25, 15, 90))
            frame = Image.alpha_composite(frame, shadow)
            frame.alpha_composite(pic, (round(x * w - pic.width / 2),
                                        baseline - pic.height))
        sheet.paste(frame.convert("RGB"), (left, head))
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    sheet.save(out_path)
    return out_path


def read_spec(path):
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def _ask(question, default=""):
    suffix = f" [{default}]" if default else ""
    try:
        got = input(f"{question}{suffix}: ").strip()
    except EOFError:
        got = ""
    return got or default


def _box(x, y, w, h, colour):
    return {"rect": [round(x, 3), round(y, 3), round(w, 3), round(h, 3)], "color": colour}


def interview(slug):
    """Ask what a game needs, once, and write tools/prototypes.<slug>.json. No GPU.

    The questions are the ones this tool kept having to be told by hand: the room's
    projection and geometry, what is already drawn, what is still missing, and what the
    model must not add. The spec it writes is what --game reads from then on.
    """
    print(f"\nPrototype spec for {slug}. Blank takes the [default].\n")
    title = _ask("Title", slug)
    projection = _ask("Projection (front-on/top-down/isometric/side-on)", "front-on").lower()
    perspectives = {
        "front-on": "front-on, one-point perspective, camera at eye level",
        "top-down": "top-down, straight down, orthographic",
        "isometric": "isometric, 2:1 diamond tiles, camera above",
        "side-on": "side-on, flat elevation",
    }
    perspective = _ask("Perspective", perspectives.get(projection, projection))
    style = _ask("Style line (palette, outlines)",
                 "cosy cartoon illustration, flat soft colours, gentle shading, dark brown ink outlines")
    negative = _ask("Keep out", "building exterior, shopfront, storefront, street scene, text")
    seeds = [int(s) for s in _ask("Seeds", "1,3").replace(" ", "").split(",") if s]
    pixel = _ask("Pixel art? (y/n)", "n").lower().startswith("y")
    rows = []
    room_size = "1024x576"

    if _ask("Background? (y/n)", "y").lower().startswith("y"):
        if projection == "top-down":
            cols, rows_n = int(_ask("Columns", "12")), int(_ask("Rows", "9"))
            mockup = {"preset": "grid", "cols": cols, "rows": rows_n,
                      "tile": _ask("Tile colour", "#b98a63"),
                      "tile2": _ask("Second tile colour", "#ad7f5b"),
                      "gap": float(_ask("Grout width (0..0.05)", "0.01"))}
            room_size = _ask("Room size", "1024x1024")
        elif projection == "isometric":
            mockup = {"preset": "iso",
                      "cols": int(_ask("Columns", "8")), "rows": int(_ask("Rows", "8")),
                      "tile_w": int(_ask("Tile width px", "96")),
                      "tile_h": int(_ask("Tile height px", "48")),
                      "tile": _ask("Tile colour", "#c98763"),
                      "tile2": _ask("Second tile colour", "#bd7d5b")}
            room_size = _ask("Room size", "1024x768")
        elif projection == "side-on":
            mockup = {"preset": "side", "floor": float(_ask("Floor line (0..1)", "0.8")),
                      "wall": _ask("Backdrop colour", "#8fae93"),
                      "ground": _ask("Ground colour", "#c98763")}
            room_size = _ask("Room size", "1344x768")
        else:
            room_size = _ask("Room size", "1344x768")
            wall_f = float(_ask("Wall fraction from the top", "0.335"))
            wall_c = _ask("Wall colour", "#8fae93")
            floor_c = _ask("Floor colour", "#c98763")
            boxes = [_box(0, 0, 1, wall_f, wall_c), _box(0, wall_f, 1, 1 - wall_f, floor_c)]
            door_x = _ask("Door x (0..1, blank for none)", "0.06")
            if door_x:
                dx, dw = float(door_x), float(_ask("Door width", "0.12"))
                top, bottom = float(_ask("Door top", "0.06")), float(_ask("Door bottom", str(wall_f)))
                boxes += [
                    _box(dx - 0.008, top - 0.01, dw + 0.016, bottom - top + 0.01, "#6b4a34"),
                    _box(dx, top, dw, bottom - top, _ask("Door colour", "#4f7657")),
                    _box(dx, bottom - 0.015, dw * 0.8, 0.02, wall_c),
                ]
            mockup = {"boxes": boxes}
        rows.append({
            "label": "room", "mode": "scene", "role": "background", "size": room_size,
            "style": _ask("Room style", "detailed cosy cartoon interior, soft colours, dark ink outlines"),
            "perspective": _ask("Room perspective", perspective),
            "prompt": _ask("Room prompt", "an empty room"),
            "negative": _ask("Room keep out", "counter, table, chair, furniture, people, text"),
            "strength": float(_ask("How far to repaint the mockup", "0.7")),
            "mockup": mockup,
        })

    print("\nPeople. Reuse the game's art where it has some: label=path.")
    while True:
        line = _ask("  label=path (blank to finish)")
        if not line:
            break
        label, _, path = line.partition("=")
        rows.append({"label": label.strip(), "role": "person", "asset": path.strip()})
    while True:
        line = _ask("  label | prompt for a generated person (blank to finish)")
        if not line:
            break
        label, _, prompt = line.partition("|")
        rows.append({"label": label.strip(), "mode": "sprite", "role": "person",
                     "prompt": prompt.strip(),
                     "negative": "counter, bar, table, chair, furniture, cropped, waist up, "
                                 "multiple views, turnaround"})

    print("\nProps still missing: label | prompt.")
    while True:
        line = _ask("  label | prompt (blank to finish)")
        if not line:
            break
        label, _, prompt = line.partition("|")
        rows.append({"label": label.strip(), "mode": "prop", "role": "prop",
                     "prompt": prompt.strip()})

    if not rows:
        print("\nnothing to generate: no room, people or props were given.")
        return

    spec = {
        "title": title,
        "mode": "prop",
        "style": style,
        "perspective": perspective,
        "compose": len(rows) > 1,
        "stage": room_size,
        "floor": 0.9,
        "person_height": 0.45,
        "prop_height": 0.22,
        "size": "768x768",
        "block": 3 if pixel else 1,
        "colors": 64 if pixel else 0,
        "bloom": 0.4 if pixel else 0,
        "lora": 1 if pixel else 0,
        "negative": negative,
        "seeds": seeds,
        "stage_seeds": [seeds[0]],
        "rows": rows,
    }
    path = os.path.join(HERE, f"prototypes.{slug}.json")
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(spec, fh, indent=2, ensure_ascii=False)
        fh.write("\n")
    print(f"\n{path}\n  python tools/prototype.py --game {slug} --cutout")


def main():
    ap = argparse.ArgumentParser(description="Prototype pixel-art variants side by side.")
    ap.add_argument("spec", nargs="?", help="JSON spec: {mode, style, negative, rows: [{label, prompt}], seeds}")
    ap.add_argument("--game", help="load tools/prototypes.<game>.json, the game's own spec")
    ap.add_argument("--new", metavar="SLUG", help="ask what a game needs and write its spec")
    ap.add_argument("--only", help="render only rows whose label contains this")
    ap.add_argument("--mode", choices=["sprite", "prop", "scene"])
    ap.add_argument("--prompt", help="one row, the quick way")
    ap.add_argument("--negative", help="extra things to keep out, on top of the mode's own")
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
    ap.add_argument("--key-tol", type=float, default=24, help="how far from the backdrop colour still counts")
    ap.add_argument("--strength", type=float, default=0.6,
                    help="img2img: how far the mockup is repainted (lower keeps the layout)")
    ap.add_argument("--zoom", type=int, default=2, help="how big the cells are on the sheet")
    ap.add_argument("--out", default="test/_shots/prototype.png")
    ap.add_argument("--keep-raw", action="store_true", help="also save the unbaked render")
    a = ap.parse_args()

    if a.new:
        interview(a.new)
        return

    spec = read_spec(a.spec) if a.spec else {}
    if a.spec and a.game:
        sys.exit("give a spec file or --game, not both")
    if a.game:
        path = os.path.join(HERE, f"prototypes.{a.game}.json")
        if not os.path.exists(path):
            sys.exit(f"no {path}: a game's spec says what that game still needs")
        spec = read_spec(path)
    mode = a.mode or spec.get("mode", "sprite")
    style = spec.get("style", a.style)
    seeds = [int(s) for s in str(spec.get("seeds", a.seeds)).strip("[]").split(",")]
    rows = spec.get("rows") or [{"label": a.label, "prompt": a.prompt or ""}]
    if a.only:
        rows = [r for r in rows if a.only.lower() in (r.get("label") or r.get("prompt", "")).lower()]
        if not rows:
            sys.exit(f"no row matches --only {a.only!r}")
    size = a.size or spec.get("size")

    def row_size(row_mode, row):
        return row.get("size") or size or ("1024x576" if row_mode == "scene" else "768x768")

    knobs = {
        "block": spec.get("block", a.block),
        "colors": spec.get("colors", a.colors),
        "bloom": spec.get("bloom", a.bloom),
    }

    pa = pipeline()
    try:
        pipe = pa.load_pipe(spec.get("lora", a.lora))
    except (ImportError, ValueError) as exc:
        sys.exit(
            "this python cannot run the pipeline "
            f"({exc}). Use one with torch built for this card (cu128 or newer), "
            "diffusers and peft - see tools/README.md."
        )

    cells, labels, roles = [], [], []
    out_dir = os.path.splitext(a.out)[0] + "-cells"
    mock_dir = os.path.splitext(a.out)[0] + "-mockups"
    os.makedirs(out_dir, exist_ok=True)
    key_tol = float(spec.get("key_tol", a.key_tol))
    alt_pipe = None

    for row in rows:
        label = row.get("label") or (row.get("prompt") or "variant")[:28]
        labels.append(label)
        row_mode = row.get("mode", mode)
        roles.append(row.get("role") or
                     {"scene": "background", "sprite": "person"}.get(row_mode, "prop"))
        if row.get("asset"):
            pic = Image.open(row["asset"]).convert("RGBA")
            cells.append([pic.copy() for _ in seeds])
            print(f"  {label}  {pic.width}x{pic.height}  (asset)", flush=True)
            continue
        width, height = pa.size_of(row_size(row_mode, row))
        line = []
        init = None
        if row.get("mockup"):
            init = make_mockup(row["mockup"], width, height)
            os.makedirs(mock_dir, exist_ok=True)
            init.save(os.path.join(mock_dir, label.lower().replace(" ", "-") + ".png"))
        elif row.get("image"):
            init = Image.open(row["image"]).convert("RGB").resize((width, height), Image.LANCZOS)
        strength = float(row.get("strength", spec.get("strength", a.strength)))
        tail = {"sprite": SPRITE_TAIL, "prop": PROP_TAIL}.get(row_mode, "")
        base_neg = {"sprite": SPRITE_NEG, "prop": PROP_NEG}.get(row_mode)
        negative = ", ".join(
            n for n in (base_neg, spec.get("negative"), row.get("negative"), a.negative) if n
        ) or None
        perspective = row.get("perspective", spec.get("perspective", ""))
        prompt = ", ".join(p for p in (row.get("style", style), tail.lstrip(", "),
                                       perspective, row.get("prompt", "")) if p)
        for seed in seeds:
            if init is not None:
                if alt_pipe is None:
                    alt_pipe = image_pipe(pipe)
                img = render_img2img(alt_pipe, prompt, seed, init, strength,
                                     int(row.get("steps", a.steps)), float(row.get("cfg", a.cfg)),
                                     negative)
            else:
                img = pa.render_with(pipe, prompt, seed, width, height,
                                     int(row.get("steps", a.steps)), float(row.get("cfg", a.cfg)),
                                     negative=negative)
            baked = pa.bloom(img, strength=float(row.get("bloom", knobs["bloom"])))
            _, native = pa.pixelate(baked, block=int(row.get("block", knobs["block"])),
                                    colors=int(row.get("colors", knobs["colors"])))
            native = native.convert("RGBA")
            if a.cutout and row_mode != "scene" and row.get("cutout", True):
                native = trim(cut_out(native, tol=key_tol))
                if native.width >= 0.92 * width and native.height >= 0.92 * height:
                    print("    ! not isolated: the render is a scene, try another seed", flush=True)
                if row.get("deplate", spec.get("deplate", False)):
                    native, removed = remove_plate(native, tol=key_tol)
                    if removed:
                        print("    plate keyed out", flush=True)
            stem = f"{label.lower().replace(' ', '-')}-s{seed}"
            native.save(os.path.join(out_dir, stem + ".png"))
            if a.keep_raw:
                img.save(os.path.join(out_dir, stem + "-raw.png"))
            line.append(native)
            print(f"  {label}  seed {seed}  {native.width}x{native.height}", flush=True)
        cells.append(line)

    path = build_sheet(cells, labels, [f"seed {s}" for s in seeds], a.zoom,
                       spec.get("title", "prototype"), a.out,
                       background=spec.get("background"))
    print(path)
    if spec.get("compose"):
        stage_seeds = [int(s) for s in spec.get("stage_seeds", seeds)]
        picked = [seeds.index(s) for s in stage_seeds if s in seeds]
        overrides = any(r.get("stage_seed") is not None for r in rows)
        stage_cells = []
        for ri, row in enumerate(rows):
            if row.get("stage_seed") is not None:
                stage_cells.append([cells[ri][seeds.index(int(row["stage_seed"]))]])
            else:
                stage_cells.append([cells[ri][i] for i in picked])
        col_labels = (["picked"] * len(picked) if overrides
                      else [seeds[i] for i in picked])
        stage_path = build_stage(
            stage_cells, roles, col_labels, spec.get("title", "prototype"),
            os.path.splitext(a.out)[0] + "-stage.png",
            stage=spec.get("stage", "1024x576"),
            floor=float(spec.get("floor", 0.9)),
            person_height=float(spec.get("person_height", 0.42)),
            prop_height=float(spec.get("prop_height", 0.3)))
        print(stage_path)


if __name__ == "__main__":
    main()
