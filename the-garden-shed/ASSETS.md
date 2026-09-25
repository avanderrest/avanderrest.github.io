# Assets used by The Garden Shed

Two sources, for two different jobs:

- **Amber's own art** — the painted room and every prop in it, generated as one
  empty room plate and four sheets, and cut up here. This is the visual upgrade.
- **Free-licence downloads** — three typefaces (OFL) and three texture tiles
  derived from CC0 photographs. These are the type and the paper, used on both
  layouts.

Nothing is fetched from a third party at runtime.

## Amber's art

The sources live in `images/minigames/the-garden-shed/reference/` (gitignored) and
the scripts that cut them in `notes/the-garden-shed-assets/` (also gitignored). Run
them from the repo root.

| Script | Does |
| --- | --- |
| `contact.py` | a numbered contact sheet per source sheet, to match island numbers to names by eye |
| `cut.py` | cuts the named islands into `assets/art/`, and copies the plate to `assets/room.jpg` |
| `ruler.py` | the plate with a 50px grid, for reading positions off |
| `shot.mjs` | photographs the shed over CDP, optionally after a `state-*.js` setup |

### `room.jpg` — the room

`Garden shed - background.jpg`, the empty room: 1376×768. **The scene's logical
pixels are this image's own pixels.** `game.js` (`fitPlate`) sets the scene to that
size and scales it to the stage, so every position in the `gs-` block of
`style.css` is a coordinate read straight off `ruler.py`.

The fit covers the stage, but may only crop what is scenery — the far ends of the
side shelves, the window, the ceiling, the floor under the table (it keeps at least
1150×700 of the plate in view). Past that it letterboxes. Below 700px wide the room
would be too small to play, so the drawn shed underneath — the phone layout from
before the upgrade — takes over. It is untouched, apart from sharing the painted
produce.

Nothing had to be rubbed out of this plate: it is already empty, and the game's
things all stand in places the plate leaves bare.

| Where on the plate | What the game puts there |
| --- | --- |
| right shelf unit, shelves at y=152 and y=260 | the pots, four to a shelf — eight in all, which is `POT_MAX` |
| the bare boards left of the door, x 250–358 | the pinboard, tall and narrow |
| left-hand shelf under the lights, top at y=190, x 0–258 | the four vases (the jars and succulents that stood there came off for them) |
| the doorway, x 428–658 | the shop door: the Open/Closed sign, and the customer standing in it; the sun rides a band across its top |
| back of the table, feet at y=505 | the bucket of cut stems |
| front of the table, y=612 | seed packets, the order ticket, the book (her cookbook, now The Language of Flowers), the can |

### `garden/` — the view through the door, per weather

Amber's own paintings of the doorway (`images/minigames/the-garden-shed/reference/`,
the `Gemini_Generated_Image_*` set, 784x1330), redrawn over `Garden shed outside.jpg`,
which is the plate cut at x 380, y 0, 277x470 — door leaf included. Saved at 2x,
554x940, and laid back over exactly that rectangle (`.gs-garden`), so the leaf frosts
and darkens with the garden.

| file | weather | source |
| --- | --- | --- |
| `sunny.jpg` | sunny, and heatwave under a warm wash | `hetcih…` |
| `windy.jpg` | windy | `1niggw…` |
| `cloudy.jpg` | overcast | `qskulr…` |
| `rain.jpg` | rain | `vkmkxp…` |
| `frost.jpg` | frost | `j0qood…` |
| `fog.jpg` | fog | `75wbph…` |
| `storm.jpg` | storm | `tf3jlc…` |
| `sleet.jpg` | sleet | `85qn8z…` |

The drawn rain and fog (`.fx`) are off on the plate, since the paintings have them.
The phone layout keeps its drawn doorway.

### `art/` — the props

| Sheet | Gave |
| --- | --- |
| `garden shed tools_inspyrenet.png` | `pot`, `can`, `board`, `knife`, `cookbook`, `pen`, `cat`, `jars`, `basket`, `basket-tomatoes`, `lettuce-pot`, `hanging-basket`, `sign`, `spade`, `trowel`, `hand-fork`, `shears`, `succulent-a`, `succulent-b` |
| `Garden shed produce_inspyrenet.png` | `carrot`, `tomato`, `lettuce`, `potato`, `courgette`, `garlic`, `onion`, `apple`, and the seedling that became `sprout` |
| `Garden shed plants_inspyrenet.png` | `grow-1a/1b` and `grow-2a–2d` (the pots' growing stages), `fern`, `fern-blue`, `ivy`, `tiny-pot`, `succulent-c`, `stone-planter` |
| `garden shed cooking stuff_inspyrenet.png` | nothing — its board, book and knife are drawn nearer to pixel art than the rest; the tools sheet has the same three in the room's style |

**`sprout.png`** is the seedling with its brown nursery pot cut away at the rim,
so it can stand in the same terracotta pot as everything else on the shelf.

**A pot is drawn whole, not built from parts:** a bare `pot`, then `pot` with the
`sprout` in it, then one of the potted plants, and at ripeness the crop itself
tucked on top. Neighbouring pots take different plants, so a shelf at one stage
is not six copies of one picture. This is also what fixed "the plants sit a little
weird" in the shed notes.

The rest — cat, jars, baskets, plants, hand tools, the sign — is scenery, set in
`index.html` inside `.gs-dress`. None of it is clicked.

### Flowers and vases — drawn, not painted

On 2026-09-25 the shed became a flower shop. None of her sheets has a cut flower or
a vase, so both are drawn in `game.js` as small SVGs in the room's manner: flat
colour inside the same brown ink line. `HEADS` draws each flower's head in a given
colour; `ART` wraps each variety as a stem with a leaf (a data URI, used wherever a
picture of one is needed, including on top of a pot in flower); `VASE_BACK` and
`vaseSvg` draw the four vases and fan the stems out of them. An empty vase is
cropped to its own body so it stands on the shelf at its real size.

No longer used by the game since that rewrite, but kept in `assets/art/`: the
produce paintings (`carrot`, `tomato`, `lettuce`, `potato`, `courgette`, `garlic`,
`onion`, `apple`), `board.png` and `knife.png`. The painted cookbook still is used,
as the book on the table.

## Free-licence downloads

### `fonts/`

| File | Family | Axes | Source | Licence |
| --- | --- | --- | --- | --- |
| `Baloo2.woff2` | Baloo 2 | `wght` 400–800 | [Google Fonts](https://fonts.google.com/specimen/Baloo+2) | OFL 1.1 (`fonts/OFL.txt`) |
| `Nunito.woff2` | Nunito | `wght` 200–1000 | [Google Fonts](https://fonts.google.com/specimen/Nunito) | OFL 1.1 |
| `Nunito-Italic.woff2` | Nunito *italic* | `wght` 200–1000 | [Google Fonts](https://fonts.google.com/specimen/Nunito) | OFL 1.1 |
| `Caveat.woff2` | Caveat | `wght` 400–700 | [Google Fonts](https://fonts.google.com/specimen/Caveat) | OFL 1.1 |

The same three families the page used to pull from the CDN, now served from the
folder. Latin subset only — nothing in the shed's copy needs latin-ext. Italic is
a separate file because Nunito's italic is a real cut, not a slant; without it the
browser fakes one. Declared in `style.css` with a weight *range*, since these are
variable fonts. The OFL allows bundling; the one rule is not to rename a modified
copy back to the original family name.

### The grain tiles

Three seamless greyscale tiles, multiplied over the CSS fills at low opacity. They
carry no colour of their own — each is its source's colour map with the low
frequencies subtracted, so only the tooth survives and the hue still comes from
the palette at the top of `style.css`.

| File | Size | Derived from | Used on |
| --- | --- | --- | --- |
| `wood-grain.png` | 320² | [ambientCG WoodFloor043](https://ambientcg.com/view?id=WoodFloor043) (CC0) | the pinboard frame; the drawn shed's wall, floor, shelf, bench and board in the phone layout |
| `paper-grain.png` | 256² | [ambientCG Paper001](https://ambientcg.com/view?id=Paper001) (CC0) | the parchment behind every dialog |
| `wicker-weave.png` | 256² | [ambientCG Wicker008A](https://ambientcg.com/view?id=Wicker008A) (CC0) | the mat the notes are pinned to |

To rebuild one: high-pass the colour map (blur and subtract), normalise the
contrast, and clamp the darkest tooth so the multiply never goes muddy. Blur on a
3×3 tiling and crop back to the centre — the maps are seamless, and a plain blur's
edge clamp would break that.

### Considered and rejected

- **The CC0 library in `images/minigames/cc0/`** for props. The plant and food
  packs there are flat vector (`generic-items`), white silhouettes
  (`foliage-sprites`), 16px pixel art (`pixel-platformer-farm-expansion`) or 3D
  (`food-kit`). None of them sits beside a painted room; Amber's sheets do. The
  library still has nothing for a painted interior in front elevation, so the room
  had to be hers either way.
- **Wicker013, 004, 006; Planks037A, 023A** (ambientCG, CC0). A bamboo blind rather
  than a basket; blotchy; too dark; and two plank floors in the wrong key — red and
  grey — that fought the warm palette.
