# Coffee Rush — bundled assets

Everything in this folder is redistributable. Nothing here needs a credit line
in the game itself, but the sources are recorded so they stay traceable.

## room.jpg and art/ — Amber's own

The look is built from Amber's generated sheets in
`images/minigames/coffee-rush/reference/` (gitignored), matched to her mockup
`coffee rush.jpg` in the same folder.

- **`room.jpg`** is her empty room plate, cropped on the right to 1344x768.
  The game's room is this plate at three-quarter size — 21 x 12 tiles of 48px —
  so the wall base is exactly row 4 and the painted door is where customers
  come in. The chalkboard's scribble is painted over at runtime with the day's
  real menu.
- **`art/`** is cut from the four sheets by `notes/coffee-rush-assets/cut.py`
  (gitignored with the rest of `notes/`; run it from the repo root and it
  rewrites this folder). Each sprite takes only its own alpha island, halo
  under alpha 24 removed.
  - `people/` — since 2026-10-02 cut by `notes/coffee-rush-assets/cut-people.py`
    from Amber's later Gemini sheets in the same reference folder (the
    `_inspyrenet` PNGs), not from `cafe rush characters.png`. Twenty-three
    customers in four groups (`a`–`d`), each in three moods: `a0` happy,
    `a0-wait` checking a watch, `a0-cross` arms folded. Every figure in a group
    shares one scale, so their heights relative to each other survive into
    the game's `HEIGHTS`. `barista` and `sam` come off the two-figure staff
    sheet.
  - `machines/` — the espresso, oven, muffin-oven, milk-jug and blender state
    sequences. `brownie-*` are the pastry oven with the bake darkened.
  - `cabinets/` — the green counter modules every machine stands on, and
    `counter`, the service counter, keyed off the white of
    `coffee rush - counter.jpg`. The game draws it in three slices so only
    the wooden top stretches from the back wall to the front of the room.
  - `items/` — what customers order. `iced` is the yellow smoothie cup re-dyed;
    `brownie` and `soup` are drawn to match, as the sheets have neither.

Not on any sheet, so drawn in the game in the same flat-colour-and-ink style:
the ice well, soup kettle, sandwich press, bin and packing crates.

## fonts/

| File | Family | Axes | Source | Licence |
| --- | --- | --- | --- | --- |
| `Baloo2.woff2` | Baloo 2 | `wght` 400–800 | [Google Fonts](https://fonts.google.com/specimen/Baloo+2) | OFL 1.1 (`OFL.txt`) |
| `Nunito.woff2` | Nunito | `wght` 200–1000 | [Google Fonts](https://fonts.google.com/specimen/Nunito) | OFL 1.1 |
| `Fredoka.woff2` | Fredoka | `wght` 300–700, `wdth` 75–125 | [Google Fonts](https://fonts.google.com/specimen/Fredoka) | OFL 1.1 — not used |

Baloo 2 is the HUD, the plaques and the chalkboard; Nunito is body text. Latin
subset only, served as variable fonts — one file covers the whole weight range.
The OFL allows bundling; don't rename a modified copy back to the family name.

## paper-grain.png — not used

A 256x256 tileable grain tile derived from
[ambientCG Paper001](https://ambientcg.com/view?id=Paper001) (CC0). Fetched
before the reskin; the painted room has its own texture, so nothing draws it.

## Considered and rejected

No CC0 pack exists for a cosy interior in front elevation (see
`images/minigames/README.md`). Kenney's Food Kit is flat-shaded low-poly;
the café packs on OpenGameArt and itch.io are pixel art.
