# Assets used by Furrow

All of it is Amber's own art, generated as four big sheets and cut up here. Nothing is
fetched from a third party at runtime, and no CC0 pack is used. The shared library in
`images/minigames/cc0/` was weighed first — `tiny-town` and `isometric-miniature-farm` are
the two it offers for this game — and lost on both counts: the projection is wrong
(Furrow's map is straight top-down with buildings in three-quarter view, `tiny-town` is
flat front elevation) and her own sheets already cover every building the game has.

The sheets live in `images/minigames/furrow/reference/` (gitignored) and the scripts that
cut them are in `notes/furrow-assets/`. Re-run any of them from the repo root; they write
straight into `furrow/assets/` (113 files, ~960K).

The target is `Furrow (2).jpg` — the island picture. It is the thing being matched, not a
source.

## Where each thing came from

| Sheet | What it gave | Cut by |
| --- | --- | --- |
| `furrow.png` | buildings, the fence, windmill, well, fountain, wagon, stalls, tent | `cut_buildings.py` |
| `furrow produce_inspyrenet.png` | `crop-<crop>-<0..3>.png` — four growth stages for each of the seven crops — and the pen-sized sheds | `cut_crops.py` |
| `furrow people_birefnet.png` | `vil-<m\|f>-<idle\|walk>-<0..3>.png` — sixteen villagers | `cut_people.py` |
| `Furrow - floor.jpg` | trees in three seasons, boulders, stone clusters, scrub, flowers, ducks, a deer, and the dirt texture | `cut_floor.py` |

## Cutting a PNG sheet

`label.py` (from `notes/hollowmarch-assets/`) flood-fills the alpha channel and prints a
box per island; `contact.py` crops every island into a numbered contact sheet so the
pieces get identified **by eye, once**, instead of reasoned about from coordinates.

- **Dilate before labelling.** A `gap` of 3 merges a roof with its drop shadow; without it
  they come back as two objects.
- **Kill the halo.** The background removers leave a rim of near-transparent pixels that
  reads as grey fringe over grass. Alpha under 24 is forced to zero before the trim, and
  again after any resample, because LANCZOS smears the edge back out.

## Cutting the terrain sheet — four traps, all paid for

`Furrow - floor.jpg` is a design plate, not a tileset: labelled swatches and loose props on
a light grey page, saved as JPEG. It needed its own script.

1. **Key the page by flooding in from the border**, not by colour. The sheet has pale
   things on it — a white duck, grey rocks — and a flat colour key eats them.
2. **But the flood cannot reach an enclosed gap.** The five stones of a cluster ring little
   pockets of page between them, and left alone those came out as a white slash through
   the middle of the rock. Sprites with no near-white content of their own (`HARD_KEY`)
   get a flat colour key as well, which clears them. The duck and the flowers must not.
3. **Keep the tolerance tight** in the flood. At 26 it walked in through the rocks' own
   light edge pixels and ate them from the top down, leaving eight-pixel slivers.
4. **Use explicit boxes, not island indices.** The index of a piece depends on how the page
   was keyed, so it silently shifts the moment the keying is touched — a stale index
   quietly hands you the word "Rocks" where you asked for a rock. `BOXES` is the contact
   sheet written down.

Then `despeckle()` takes off the JPEG ringing: a pixel much brighter than the median of
its neighbours, with no equally bright neighbour, is noise, so it takes the median instead.

## Scale — the part that isn't obvious

Her art is **1:1 with Furrow's map space**: one image pixel is one map pixel, and a `TILE`
is 32 of them. That was measured, not assumed (adjacent identical columns run at about
0.13, so the art is not a 2× upscale). Buildings draw at native size, centred on the
footprint with the base at the bottom of it.

The exceptions are the sheets drawn as **hero art**, three or four times map size: the
crops (a single plant about three tiles wide) and the villagers (about 80px for somebody
who should stand 26). Those are resampled **once, here, with LANCZOS**, never squashed at
draw time. Four buildings were simply bigger than the plot they stand on and come down to
about 1.25× their footprint width, which is the overhang that reads as a building sitting
on its ground rather than a hat two sizes too big:

| Sprite | Native | Drawn at | On |
| --- | --- | --- | --- |
| `stall-goods` | 97px | 80px | cookhouse, 2×2 |
| `house-grand` | 118px | 82px | bakehouse, 2×2 |
| `house-tiled` | 111px | 80px | dairy, 2×2 |
| `tudor-tall` | 110px | 76px | weaving hut, 2×2 |

## The palette

The grass was the single biggest thing between this and the reference picture. It was
sampled off `Furrow (2).jpg` **by hue class over the whole image**, not picked by eye: the
commonest green there is `#649646`, against `#6cb845` in the game, which is why the plot
read as poster paint beside it. Soil, strand and water came off the same sample —
`#3296aa`/`#50beb4` for the sea, `#f0d282` for sand, `#643c28` for tilled earth.

## Wiring

All of it is additive and can be peeled back. `ART` holds the loaded images and **every
draw site reads it as an override, never as a requirement** — a sprite that has not loaded
yet, or was never made, leaves the drawn version in place, so the plot is never half
painted and half empty. That is why `butt` and `beacon` still look right with no art.

- `artFor(b)` picks the painting; shelters choose one of four cottages off their own id via
  `bnoise`, so a row of them is a row of different shelters and always the same ones.
- `drawPainted` replaces the drawn building but keeps the cast shadow, the chimney smoke
  and the selection ring. `SMOKE_AT` says where each painting's chimney is.
- `drawPen` swaps only the shed; the yard, fence, trough and live animals still draw.
- `drawVillager` swaps the body only. The crate they are carrying, the tired `z` and the
  hungry pip go over the top exactly as before.
- `treeArt()` picks the tree and its season. **Winter returns nothing on purpose** — the
  drawn tree goes bare, and a summer canopy in February is worse than no art at all. The
  spring and autumn canopies are recoloured offline, and only greenish pixels move, so
  trunks stay put; a whole-image tint turns the bark orange and it stops reading as a tree.
  A conifer gets no autumn variant.
- `blit()` puts a prop on the grass — centred, base on the ground, same flat shadow
  everything else casts, on whole pixels so the nearest-neighbour blow-up does not turn one
  row of the sprite into two.
- The scatter thresholds sit in `drawGround`. The reference picture is dense, so they are
  well down on the drawn version, but **one thing to a tile at most** or the clutter piles
  up into a hedge. `PATCH` still clusters it, so there is open meadow between thickets.
- Farms are fenced with `drawFence` — the same fence the pens use, rather than a second
  design.
- Paths tile `tex-dirt`, with the square of the swatch hashed off tile position so a long
  path is not one patch stamped in a row.
- **`ctx.imageSmoothingEnabled = false` is set inside `resize()`**, because assigning
  `canvas.width` resets the whole context.
- The ground is a cached canvas, so the image loader sets `groundDirty = true`; without it
  the scatter never appears until something else invalidates it.

## Which painting is which building

| Type | Shows as | Sprite |
| --- | --- | --- |
| `house` | Shelter | `cottage-a`, `cottage-b`, `tudor-a`, `tudor-b` (by id) |
| `store` | Storehouse | `longhouse` |
| `shop` | Cookhouse | `stall-goods` |
| `well` | Well | `well` |
| `bakery` | Bakehouse | `house-grand` |
| `dairy` | Dairy | `house-tiled` |
| `weaver` | Weaving hut | `tudor-tall` |
| `coop` | Hen house | `pen-coop` (from `hut-orange`) |
| `sty` | Pigsty | `pen-sty` (from `cottage-small`) |
| `byre` | Cow byre | `pen-byre` (from `market-hall`) |
| `fold` | Sheep fold | `pen-fold` (from `hut-green`) |

## Still to do

- **`butt` (Rain barrels) and `beacon` (Signal fire) have no art** and are still drawn.
  Neither sheet has a barrel or a bonfire on it.
- **Painted windows do not light at night.** The drawn buildings had lit panes; the
  paintings have fixed ones. The pooled light around a building still reads.
- The reference island is tropical — palms, coral, shells — and **no sheet has a palm on
  it**. The trees here are her broadleaf and conifer.
- Unused and waiting: `windmill`, `fountain`, `wagon`, `tent`, `stall-blue`, `scarecrow`,
  `scarecrow-small`, `animal-pen`, `farm-large`, `farm-small`, `tex-grass`. The windmill
  and the fountain would need to become building types before they could stand anywhere.
