# Assets used by Hollowmarch

Everything in `assets/` is Amber's own art, generated for this game and then cut
into sprites. Nothing is fetched at runtime, so the page works offline and owes
nobody a credit line.

## Where it comes from

Three sheets, kept out of the repo in `images/minigames/crossroads-inn/reference/`
(gitignored — together they are about 3 MB, and only the cuttings are needed):

| Sheet | What it holds |
| --- | --- |
| `Hollowmarch background.jpg` | the whole UI plate: wooden table, two parchment sheets, the painted board, empty dock slots |
| `Hollowmarch - Map objects_birefnet.png` | the buildings and terrain, background removed |
| `hollow enemies_inspyrenet.png` | four monsters — portrait medallion, hero pose, walk frames — background removed |

`notes/hollowmarch-assets/slice.py` cuts the second and third into
`assets/build/`, `assets/terrain/` and `assets/enemy/`; the UI pieces were cut
from the first with the short script quoted at the bottom of this file. Both are
re-runnable, so a sprite can be re-cut at a different size or a tighter box
without going back to an image editor.

## `build/` — the tiles on the board

One PNG per building type, keyed by the type name in `game.js`, so
`BUILD.smithy` finds `build/smithy.png` with no mapping table.

| File | Was | Notes |
| --- | --- | --- |
| `castle.png` | the keep | |
| `gate.png` | the three roads | gatehouse with its flanking walls |
| `wall.png` | | one straight run |
| `tower.png` | Archer Tower | the open-topped one |
| `barracks.png` | | the grey-spired garrison tower |
| `mage.png` | Mage Tower | the blue-spired one |
| `smithy.png`, `market.png`, `tavern.png`, `farm.png`, `house.png` | | |

**Not in the sheet:** the well, the ballista and the chapel. They keep the drawn
SVG in the `ART` table at the top of `game.js`, which is why the sprite table
there goes in over `ART` rather than replacing it — with no art for a type the
board still has something to draw. It also means the two look different on the
board, and the flat per-type tint is deliberately left strong behind the SVGs
and dropped to a hint behind the sprites (`.cell.built:has(.spr)` in the CSS).

## `enemy/` — the horde

`portrait-<type>.png` is the round medallion for the "On the road" rail;
`<type>.png` is the small token that walks the board. Only **goblin, orc,
skeleton and wolf** are painted. The other seven — troll, wraith, ogre, dragon,
sapper, shaman, siege ram — still use their emoji, so every render site reads
`portrait || icon` and `sprite || icon` rather than assuming a sprite exists.

## `terrain/` — cut, not yet used

Six grass variants, five trees, four rock clusters, three stretches of dirt road
plus a crossroads and a vertical run. All 67×67 or so, cut on the sheet's own
71.4px grid with a 2px inset to keep neighbouring tiles' borders out of frame.

These are for the next step: painting the three roads onto the board instead of
marking the horde's route with dotted cell borders. Nothing references them yet.

## `ui/` — the table

| File | Used for |
| --- | --- |
| `wood.jpg` | the page background, and the topbar/dock/statusline panels |
| `parchment.jpg` | the two rails, stretched to whatever height the layout gives them |
| `board-grass.jpg` | the board, stretched under the 8×8 grid |
| `slot.jpg` | multiplied into the dock's tool wells |

`wood.jpg` is mirror-tiled — the 265×62 patch cut from the plate, plus its
horizontal, vertical and both-ways flips, so it repeats across a wide page with
no seam. The plank lines that do show are the ones in the art.

The rails are the one place the type has to flip from light-on-dark to
dark-on-parchment; that is what the `.panel.rail` block near the end of
`style.css` is doing, and why the chronicle's empty line needed its own rule.

The night sky, moon and drifting embers that used to sit behind everything are
switched off (`.scene { display: none }`). They were lighting a world the player
stood in; this is a map on a table.

## Rebuilding the UI pieces

```python
from PIL import Image, ImageOps
bg = Image.open("Hollowmarch background.jpg").convert("RGB")
bg.crop((20, 106, 300, 596)).resize((280, 490)).save("ui/parchment.jpg", quality=86)
bg.crop((312, 100, 1064, 660)).resize((752, 560)).save("ui/board-grass.jpg", quality=84)
bg.crop((22, 668, 100, 752)).save("ui/slot.jpg", quality=88)

w = bg.crop((25, 598, 290, 660))                      # mirror-tile the wood
t = Image.new("RGB", (w.width * 2, w.height * 2))
t.paste(w, (0, 0)); t.paste(ImageOps.mirror(w), (w.width, 0))
t.paste(ImageOps.flip(w), (0, w.height))
t.paste(ImageOps.mirror(ImageOps.flip(w)), (w.width, w.height))
t.save("ui/wood.jpg", quality=84)
```

## Considered and rejected

Six CC0 packs were downloaded and judged before these sheets turned up; they are
staged in `notes/hollowmarch-assets/` with the reasoning. The short version:
Kenney's **Fantasy UI Borders** are the best free ornate frames going and would
still be useful if the panels ever want carved corners, **Tiny Town** and **Tiny
Dungeon** are good pixel art whose buildings are side-view facades rather than
top-down, and **Medieval RTS** is a different visual language altogether.

**Tiny Swords** (Pixel Frog) is the closest free pack to this game by a mile —
goblins, towers, castle, terrain, even paper banners for the UI. Its current free
pack forbids redistribution, though, and committing it to a public Pages repo is
redistribution. Only the older upload marked `TS_old version_CC0 Licensed` would
be safe to ship.
