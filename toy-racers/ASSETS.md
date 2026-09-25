# Assets used by Toy Racers

All of it is Amber's own art. Nothing is fetched from a third party at runtime and
no CC0 pack is used — the shared library in `images/minigames/cc0/` has nothing in
the right projection, and the `toy-car-kit` and `mini-arcade` packs sitting in
`images/minigames/toy-racers/assets/` are 3D models (GLB/FBX/OBJ) for an engine this
site does not have. They were left alone.

The sheets live in `images/minigames/toy-racers/reference/` (gitignored) and the
scripts that cut them are in `notes/toy-racers-assets/`. Re-run either from the repo
root; they write straight into `toy-racers/assets/` (26 files, ~900K).

`Toy racers.jpg` is the target — the framing mockup with the logo, the desk
circuit and the standings panel. It is the thing being matched, not a source.

## Where each thing came from

| Sheet | What it gave | Cut by |
| --- | --- | --- |
| `Toy Racers - objects (2)_inspyrenet.png` | 25 props — lamps, the rule, the floppy stack, the mug and its spill, pliers, bolts, toolbox, cables, pens, pencils, poker chips, paperclip, both gamepads, plants, chequered flags | `cut_objects.py` |
| `Toy racers - background.jpg` | `desk.jpg`, the pine the whole game is played on | `cut_desk.py` |

`Toy racers - background (2).jpg` is the second, more saturated plank plate. It is
not used: its grain runs at a different angle from the mockup's and the props were
lit for the paler one.

## Cutting the objects sheet

`label.py` prints a box per opaque island and `contact.py` crops every island into
a numbered contact sheet, so the 25 pieces get named **by eye, once**, instead of
reasoned about from coordinates. `NAMES` in `cut_objects.py` is that reading.

Two things the cut has to do that a plain bbox crop does not:

- **Crop by the island's own mask, not its box.** The props are laid out tightly
  and several boxes overlap a neighbour — the pencil's box clips the blue eraser,
  and the rule's box catches two crumbs and a corner of the floppy stack. Copying
  only the pixels whose label matches keeps each prop clean.
- **Kill the halo.** The background remover leaves a rim of near-transparent
  pixels that reads as grey fringe once a prop sits on pale pine. Alpha at or
  under 24 goes to zero before the trim.

Her props already carry their own drop shadows, so the game adds none — only the
cars get a drawn shadow.

## What is *not* art

A good deal of what reads as objects on the desk is drawn in code, because it has
to follow a spline that changes per track:

- **the clear tubing** — a pale channel with two bright rims and a highlight down
  the inside, stroked along the centreline;
- **the steel rule** — a brushed-metal strip with tick marks along its far edge;
- **the ramp** — the rule again, lightening towards the take-off, with orange
  chevrons. The floppy stack the rule is propped on *is* her sprite, drawn
  underneath the track rather than over it (`under: true`);
- **the worn lane over bare wood**, chalked at both edges;
- **the boost strip** — the rainbow smear the plate shows behind a car;
- **the spilt coffee** — a wobbly-edged stain with a sheen, so it can be dropped
  anywhere a track passes;
- **the cars, the chequered start line and the logo.** The logo is type, not an
  image: `.marque` in `style.css`.

## The desk

`desk.jpg` is 1600x1000, cropped from the background plate: the right-hand fifth
of that plate is the mockup's HUD panel, which is HTML in the game, so the crop
stops at x=1126 and the wood is stretched to the desk's 1.6 aspect. The grain
runs diagonally and the crop cannot be tiled without a seam.

The world is 2400x1500 — half as big again as the plate, which is stretched over
it. The race camera follows your car and shows about 760x475 of it, so the desk
no longer has to fit on screen whole, and the extra room lets the props lie
along the lap instead of being packed between the bends. The cost is softer
grain up close; the props and cars are drawn at their own size and are not
affected.
