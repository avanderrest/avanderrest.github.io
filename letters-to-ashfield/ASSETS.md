# Assets used by Letters to Ashfield

The people and the village map are Amber's own art (below). The rest is drawn in code:
`art.js` builds the shelves and what stands on them, the forge pegboard, the churchyard,
the bedroom and the kettle as SVG. Nothing is fetched from a third party at runtime except
the Google Fonts (Caveat, IM Fell English, Lora, Special Elite).

## Her art (added 2026-10-02)

Generated in Gemini from the prompts in `images/minigames/letters-to-ashfield/gemini-prompts.md`,
background-removed, and cut by scripts. The sheets themselves stay in `images/minigames/`,
which is gitignored.

- `assets/who/<key>-<mood>.webp`: 11 people × 5 moods (calm, smile, worried, tense, shock),
  260×390 (2:3). Each sheet was five panels, cut at the emptiest column and cropped to a
  fixed width centred on the head, so every face is at the same scale. `portrait()` wraps
  one in an `<svg viewBox="0 0 200 300">`, so every place that sized the old drawn SVG
  still works. The drawn faces remain only as a fallback for a key without a sheet.
- `assets/who/head/<key>.webp`: round 96px medallions taken from the calm portrait, for
  the map. They are pre-cut rather than clipped in SVG, because the map is drawn twice on
  one page and duplicate `clipPath` ids are fragile.
- `assets/who/full/beatrice.webp`: her full-length Beatrice, who walks the map in the
  afternoon. The other ten figures are on the same sheets, uncut.
- `assets/map/*.webp`: buildings and props. The Black Swan, the Forge, the Tea Shop,
  St Jude's, the Manor, the barn, the bridge and the props are new. The Post Office,
  Henderson's (her old "shop"), the Surgery, the Vicarage, the farmhouse, the cottages,
  the signpost and the trees are reused from the first Ashfield's sheets. The compass rose
  is cut from that game's map-assets sheet, and `parchment.jpg` is its desk parchment.

`villageMap()` keeps only the **land** as SVG: the fields, the river, and the lanes,
which are curves that join particular houses. Everything standing on it is a sprite
placed by the middle of its foot and drawn back to front. `SPRITE` holds each sprite's
height/width, so a placement only needs a width.

The four textures in `assets/` are CC0 from [ambientCG](https://ambientcg.com), taken
from the copies already staged in `images/minigames/cc0/09-textures-ambientcg/`, then
resized and tinted:

| File | Source | Treatment |
| --- | --- | --- |
| `mahogany.jpg` | Wood092 | multiplied toward red-brown, desaturated a touch, 512px |
| `felt.jpg` | Fabric034 | multiplied toward bottle green, 384px |
| `paper.jpg` | Paper006 | multiplied toward cream, lifted, desaturated, 512px |
| `floor.jpg` | WoodFloor064 | darkened slightly, 512px |

The earlier Letters to Ashfield (the map-sorting game this replaced on 2026-10-01) was
built on Amber’s own painted sheets. That art is kept, unused, in `images/letters-to-ashfield/`
with its own README, in case it is wanted again.

The reference mockup in `ideas/murder mystery/` was used for mood only — the brief was
to make it look good rather than match it.
