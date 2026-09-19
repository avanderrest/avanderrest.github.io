# Assets used by Wizz Delivery

Everything here is free to use and vendored into the folder, so the page pulls
nothing from a third party at runtime and still works offline. Total weight of
the folder is about 330 KB.

## Buildings — `assets/buildings/`

**Amber's own art.** 27 sprites cut out of one background-removed sheet she
generated, `images/minigames/wizz-delivery/reference/delivery game - buildings.png`.
No licence question: it is hers, and the staging folder it came from is
gitignored, so the cut pieces are the only copy in the repo.

| Group | Files | Used for |
| --- | --- | --- |
| Shopfronts | `shop-curry`, `shop-diner`, `shop-market`, `shop-awning`, `shop-manor` | the eight restaurants |
| Single houses | `house-a`…`house-h`, `garage` | one-tile footprints, and every delivery address |
| Terraces, 2x2 | `block-a`…`block-d` | a square run of four building tiles |
| Terraces, 1x2 | `row-a`, `row-c` | a run two tiles deep |
| Props | `flowerbed-a`…`flowerbed-c`, `tree-a`…`tree-c` | gardens and the open ground |

`row-b` is cut but deliberately unused — it is the one piece with a flat teal
shopfront on it, and at one sprite in three it tiled the English-villages map in
bright green panels. It stays on disk in case a later map wants a parade of
shops.

Two of the shopfronts have their name lettered on the sheet itself, so
`shop-diner` is always Bella's Diner and `shop-curry` is always Curry Corner.
The other six restaurants get a painted board over the door instead, drawn in
`game.js`; all eight get a dish badge, because a sign has to be read and a
badge does not.

### Rebuilding the cut

`notes/wizz-delivery-assets/` holds the scripts, and they are worth keeping —
the cutting is most of the work.

```sh
python notes/wizz-delivery-assets/slice.py    # boxes -> assets/buildings/*.png
python notes/wizz-delivery-assets/trees.py    # the three trees, by flood fill
python notes/wizz-delivery-assets/grain.py    # normalise the two grain tiles
```

Three things that each cost a re-run to discover:

- **The halo.** The background remover leaves a rim of near-transparent pixels
  that reads as grey fringe against parchment. `slice.py` forces alpha under 24
  to zero before trimming to content.
- **Trees cannot be box-cropped.** Every tree on the sheet overlaps the roof
  behind it, so a rectangle always drags a slice of slate along with it.
  `trees.py` flood-fills the green canopy instead, keeps one ring of dark
  outline, adds the bark directly beneath, and fills the interior holes the fill
  walked around.
- **Palette-quantising is nearly free.** 128 colours via `FASTOCTREE` takes the
  set from 795 KB to 165 KB with no visible difference at any zoom the game
  uses.

## Fonts — `assets/fonts/`

| File | Family | Axes | Licence | Source |
| --- | --- | --- | --- | --- |
| `Baloo2.woff2` | Baloo 2 | `wght` 400–800 | SIL Open Font License 1.1 (`OFL.txt`) | [Google Fonts](https://fonts.google.com/specimen/Baloo+2) |
| `Nunito.woff2` | Nunito | `wght` 200–1000 | SIL Open Font License 1.1 (`OFL.txt`) | [Google Fonts](https://fonts.google.com/specimen/Nunito) |

Baloo 2 does the lettering — headings, the cash strip, the shop boards and the
map pins. Nunito does the running text. Both are the latin subset as variable
files, so one download each covers the whole weight range. Copied across from
`cafe-rush/assets/fonts/`, which had already fetched them, rather than
downloaded again.

The OFL requires the licence to travel with the font, which is what `OFL.txt`
is for. Neither font is renamed, so there is nothing else to do.

## Textures — `assets/textures/`

| File | What it is |
| --- | --- |
| `paper-grain.png` | 256x256 tile, multiplied over the parchment panels |
| `wood-grain.png` | 320x320 tile, multiplied over the desk and the cash strip |

Both derive from CC0 ambientCG photo scans by way of `cafe-rush/assets/` and
`cottage-diary/assets/`, and both were **re-normalised** before use by
`notes/wizz-delivery-assets/grain.py`. That step is not optional: a tile for
`background-blend-mode: multiply` has to sit just under white, and the
cafe-rush paper tile averages 125, so multiplying it halved every panel and the
parchment came out as grey noise. `grain.py` high-passes each tile against its
own blur and rescales it — paper to mean 249 / sd 2.6, wood to mean 246 / sd 4.

## Everything else is drawn in code

The roads are the main one. The network is generated per map, so the tarmac,
kerbs, lane dashes, junction stop lines and zebra crossings are all painted from
the road shape every frame in `drawGround()` — there is no tile set for them and
there could not be. The cars, the offer bubbles, the map pins and the shop
boards are canvas drawing too.

Every sprite draw site goes through `blit()`, which returns false if the image
has not loaded, and every caller falls back to the drawn block it used before
the art existed. A missing PNG costs detail and nothing else.
