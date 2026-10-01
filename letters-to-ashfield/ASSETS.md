# Assets used by Letters to Ashfield

Nearly everything on screen is drawn in code — `art.js` builds the people, the shelves
and what stands on them, the forge pegboard, the churchyard and the kettle as SVG. Nothing
is fetched from a third party at runtime except the Google Fonts (Caveat, IM Fell English,
Lora, Special Elite).

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
