# Assets used by Furrow

Everything here is free to use and vendored into the folder, so the page pulls
nothing from a third party at runtime and still works offline. The look is the
same as Harrowgate's on purpose: Kenney's 16px tiles, and everything the packs
lack painted in code in their outline colour (`#2b1d24`).

## Village tiles — `assets/tiny-town.png`

**Tiny Town** by [Kenney](https://kenney.nl/assets/tiny-town), **CC0 1.0**
(licence travels as `assets/tiny-town-License.txt`). The pack's
`Tilemap/tilemap_packed.png` as shipped: 12 x 11 tiles of 16px, no margin. The
same file Harrowgate uses. By index (row-major, 12 to a row):

| Tiles | What for |
| --- | --- |
| 0, 1, 2 | grass, plain and flowered |
| 3/15, 4/16, 5 | autumn and green trees (two tiles tall), bushes |
| 12–14, 24–26, 36–38, 39–41 | the dirt path, and the grassy lip borrowed off its edge tiles wherever a path ends |
| 48–50, 60–62, 63 | grey slate roofs and their gable |
| 52–54, 64–66, 67 | red tile roofs and their gable |
| 72–79, 84–89 | timber and stone house fronts: walls, windows, doors, the open doorway of the woodcutter and the smithy |
| 92 over 104 | the well |

## Farm tiles — `assets/tiny-farm.png`

**Tiny Farm** by [Kenney](https://kenney.nl), **CC0 1.0** (licence travels as
`assets/tiny-farm-License.txt`), from the CC0 library at
`images/minigames/cc0/02-pixel-town-topdown/tiny-farm/`. Its `tilemap_packed.png`,
same layout as Tiny Town.

| Tiles | What for |
| --- | --- |
| 12/24/36 and 13/25/37 | a field row, dry and watered |
| 4–6, 16–18, 28–30, 40–42, 52–54, 64–66 | carrots, beets, corn, tomatoes, cabbages and wheat, three stages each |
| 8, 20, 32, 44, 56, 68, 124, 125 | the same as produce (carried, on the market stall, in the HUD), a pail of milk, a loaf |
| 93–95, 105–107, 117–119, 129–131 over 90–92, 126–128 | the barn: the green gable over the red end wall. The cowshed uses it too |
| 120, 121, 122 | sheep, cow, hen |
| 3, 15, 81, 77, 89, 78 | pines, a sapling, rocks, a berry bush |
| 73, 84, 87 | a bucket of water, the watering can, the axe |
| 96, 97, 110, 111 | hay bales by the sheep shed, the water trough in the cow pen |

The farmer sprites (108, 109) are not used: front view only, no walk frames.

## Drawn in code

- **People** — Harrowgate's 12x18 templates (facing you, away, side on, with a
  four-frame walk), with the head split out into five cuts — short, cropped,
  long, bun, shaved — so the barber has something to change. Coat, trousers or
  skirt and hair colour come from palettes, which is what the clothes shop changes.
- **Ground** — the river, its banks and moving glints, the plank bridge.
- **Buildings' extras** — chimneys and their smoke, hanging shop signs, the
  barber's pole, fences round the pens, the market stall's striped awning,
  building sites with scaffolding, lit windows at night.
- **The camp** — the handcart heaped with sacks, its campfire and the glow round it at
  night, and bedrolls for anyone without a house.
- **Tree stumps**, eggs, and the HUD icons (coin, renown star, logs, bowl, bolt,
  wool, clothes, tools, scissors).

## Font — `assets/fonts/`

| File | Family | Licence | Source |
| --- | --- | --- | --- |
| `silkscreen-400.woff2`, `silkscreen-700.woff2` | Silkscreen, by Jason Kottke | SIL Open Font License 1.1 (`silkscreen-OFL.txt`) | [Google Fonts](https://fonts.google.com/specimen/Silkscreen) |

Copied from Harrowgate. The HUD lettering on the canvas and the headings on the page.

## What was here before

Until 2026-09-24 Furrow was a castaway-island colony game drawn from Amber's own
sprite sheets, cut into `furrow/assets/`. That game and its cut sprites are in
git history; the source sheets are untouched in `images/minigames/furrow/`.
