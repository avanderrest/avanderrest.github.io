# Assets used by Marble Tray

All of it is Amber's own art. Nothing is fetched at runtime and no CC0 pack is used —
`images/minigames/cc0/` was weighed first and has nothing for this game: it is all
top-down towns, pixel interiors and UI frames, and what this needed was a photographic
walnut case with green baize in it. The one pack sitting in
`images/minigames/marble-tray/assets/` (Kenney's board-game icons) was not used either;
every control on the page is either drawn in canvas or one of her brass fittings.

The plates live in `images/minigames/marble-tray/reference/` (gitignored) and the script
that cuts them is `notes/marble-tray-assets/cut.py`. Run it from the repo root; it writes
`marble-tray/assets/` (11 files, ~110K) and a contact sheet, and it is safe to re-run.

Two plates, doing different jobs:

- **`Marble tray.jpg`** — the dressed scene. The thing being matched, and the source of
  the brass: the nameplate, a label tag, a knob, and the two ringed holes.
- **`Marble tray - background.jpg`** — the same case, empty. This is where the materials
  come from, because nothing is lying on them.

## What each file is, and where it was cut from

| File | From | Used for |
| --- | --- | --- |
| `felt.jpg` 256² | background, the middle of the baize | the tray's playing surface |
| `walnut.jpg` 336×200 | background, a clean run of the bottom rail | the case, the top bar, every panel and card |
| `walnut-post.jpg` 26×1040 | background, the upright beside the felt | the tray's two side rails, grain running the short way |
| `leather.jpg` 256×240 | scene, the desk mat well inside its stitching | the page background |
| `steel-plate.jpg` 194×166 | background, the blank plate in the left bay | spare — a 9-slice with a screw in each corner |
| `nameplate.png` 614×128 | scene, MARBLE MECHANICAL | the `<h1>`, 9-sliced |
| `tag.png` 213×81 | scene, the SMALL label | every button that is currently in force, 9-sliced |
| `knob.png` 38² | scene, one of the twelve buttons | the four keys of the tilt pad |
| `ring-blue.png` 68², `ring-pink.png` 66² | scene, the two ringed holes | the bezel round a hole in Match |

## The four things that cost a re-run

1. **Flatten a texture before tiling it, and flatten it hard.** Her baize carries a slow
   lighting gradient across the plate. Subtracting a 40px blur left it, and the tile
   showed as blotches once it repeated five times across the tray. A 9px blur — anything
   slower than the weave itself — leaves an even cloth. Same for the leather.
2. **Mirror-tiling is seamless but obviously mirrored.** `tileable()` wrap-blends the
   patch onto a half-offset copy of itself with a cosine mask instead: no seam, no
   symmetry.
3. **Rub out engraving across the whole band, not letter by letter.** The nameplate and
   the label tag are 9-sliced, so their middles have to be blank. `blank_plate()` finds
   the one column of the plate with no ink in it and stretches that across everything
   between the two end caps. Masking pixels that look like ink leaves a ghost where a
   letter faded out, and the caps — notches and screws — have to survive, which is what
   the `keep` argument is.
4. **A ring was painted on felt, so cut it round.** A rectangular crop of a bezel brings
   its background with it. `ring()` takes a square on the measured centre and puts a
   circular alpha mask on it, drawn at 4× and resampled down so the edge is not stepped.

## Where they are used

**The tray** (`game.js`, `paintCase`). Painted once into an offscreen canvas at the device
pixel ratio, and again on resize — never per frame. The walnut fills the whole box, the
two side rails are overdrawn with the post's grain and mitred into the top and bottom
rails, each rail gets its own light, and the baize goes into the well with a vignette and
a sink towards the walls. Four brass screws. **Every texture is optional**: if one has not
loaded, the same routine paints flat colour in the same shape, so the tray is never bare.
That is also why the load handler repaints only once all five have settled.

**A hole** (`drawHole`). The bezel is her painted ring, drawn `BEZEL` times wider than the
hole so that the sprite's own dark middle lands exactly on the hole's radius — the
physics never sees it. The middle hole belongs to nobody and gets plain brass drawn in
code. If a ring sprite is missing it falls back to the band of lacquer that was there
before.

**The page** (`style.css`). Leather on the body, walnut on the top bar and as the frame of
every panel, card and wooden button, and the two brass plates as `border-image`. The
hierarchy is: wood while a thing is only an option, one of her brass tags once it is the
one in force. That is why `button.on`, `.mode.on`, `.chip.on` and `.tab.on` all share one
rule with `.brass`.

## What was retuned to sit on it

The objects are still drawn, not painted — they rotate, and her marble sheet is a set of
fixed three-quarter lights that would spin with them. What changed is what a dark ground
needs:

- **`MARBLE_COLOURS` is saturated.** The old pastels were picked for cream tray wood and
  went grey on baize.
- **`drawMarble` has a bounce.** Under the swirl there is now a band of the marble's own
  pale colour along the bottom edge — light that has gone through the glass, off the
  cloth and back up. Without it a marble reads as a flat disc on a dark ground.
- **Shadows are darker and greener**, wood is oak rather than pale pine, and the fixture
  tints are a few steps down into walnut.
- **Anything picked out is marked in brass.** The selection rings, the turn handle and the
  catch circle were all olive green, which on green baize is invisible.

## Still drawn, not painted

The misc sheet (`marble tray misc_inspyrenet.png`) has a slate puck, cork, block, plank,
die, ball bearing, hex nut, steel bar and magnet on it, one apiece. All nine are things
the tray tumbles, and a sprite cannot tumble, so they stay procedural. If any of them
ever stops rotating, that sheet is the place to look.
