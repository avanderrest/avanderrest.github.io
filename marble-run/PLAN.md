# Marble Run: plan

Puzzles on an upright walnut pegboard: hang brass pieces from a small box so a glass marble
rolls from the hopper at the top into the brass cup at the bottom. It replaced Marble Tray
(match, maze and bowls on a flat tray) outright on 2026-10-16, with a fresh save.

## The one loop

**Look, hang a piece, release, watch, change one thing.** The physics is the puzzle: where
the marble leaves a rail, how far it flies, what catches it.

Good feels like: the marble drops off the last piece you hung and lands in the cup with a clack.

## Rules that are deliberate (Amber's calls, 2026-10-16)

- **Build the run**, not steer it: fixed start and cup, fixed pieces and blocks, a limited
  box. She wanted it to stay puzzle-like.
- **An upright pegboard**, not a tabletop: placing is a flat grid, easy with touch and pen,
  and it still shows drops and height in 3D.
- **Walnut, brass and leather** (her second mockup, 2026-10-16; the first had been
  pewter and steel, built and then replaced the same day): a warm walnut board in a wooden
  frame with a brass inlay, on a stitched leather desk mat; bright brass rails for your
  pieces, dark bronze for the level's own, wooden crates for blocks, a hammered brass cup,
  brass-ringed peg holes. Glass marbles that really roll.
- **The marble stays in the frame** (her question, 2026-10-16): the frame is solid on all
  four sides. A marble that misses rattles down to its bottom, and that ends the run.
- **Not heavy**: she found the first tuning heavy, the marble dropping fast and then crawling
  along rails. Rolling drag and landing scuff were cut to a third; keep rails lively.
- The flat top-down tray was never a choice, just where the first version started; its 2D
  rolling looked wrong to her, which is how this began.

## Rules found by building it

- **Slopes side by side join into one long rail**, and one beside the hopper's open end
  carries on from its ledge. Without that, a second slope's high end was a wall, and nothing
  could cross the board. A joined rail runs from near the top of its first cell to near the
  bottom of its last, so a long rail is gentler but never flat (flat stalls).
- **Rolling drag grows with speed** (`ROLL_DRAG + ROLL_DRAG2 * v`): linear drag that kept
  short ramps from flinging the marble made a long rail crawl (27 s for a zig-zag). It was
  still too much (about 1 cell/s on a long rail, which felt heavy); now 0.08 + 0.14 v.
- **A hard landing scuffs off speed along the rail too** (`LAND_SCUFF`). Without it the
  marble kept a fall's speed and shot past anything one cell wide.
- **A turn's lowest point is its tip**, so nothing can rest in it; the first shape had a dip
  between it and the rail feeding it, and marbles settled there.
- **A toggle is one wide flap**, no guides: a marble dropped dead centre balanced on the
  pivot, then wedged between the flap and a guide.
- **A cup has to be dropped into from above**; a rail running into its side stops dead.
  Twice a level had its cup roofed over by blocks: check that before solving.
- **A bell rings when the marble touches its cell.**
- Stars: in the cup, every bell, no more pieces than par. They add up across runs.

## Levels

Twelve, in `levels.js`, each with `par` and a `solution` from `solve.js` (a beam search over
cells on or beside the marble's path). Two of them have two marbles (`one-each`, `two-by-two`).
The solver cannot plan the second marble's route before the first is home, so
`two-by-two`'s solution was made by hand and checked by the same simulation. To add or change a level: write its map
and box in `levels.js` (with `par: 0, solution: []`), make sure its cups are open from above,
then run `node notes/marble-run-levels/build.mjs <id>`. It solves it, keeps a hand-made
solution if the solver does worse, draws the run to `notes/marble-run-levels/out/<id>.png`
and writes `par` and `solution` back. Then `node test/run.js marble-run`. After a physics
change, run it with no ids to re-solve every level.

## Art bible

- **Projection:** perspective, nearly straight on, from a little above and to the right
  so rail tops show (`fitCamera`). The board fits the stage whatever its shape.
- **Materials:** board and frame `beech.jpg` turned sideways and tinted to walnut (the
  real walnut textures read too dark under the tone mapping), a thin brass inlay inside the
  frame; the player's pieces bright brass, the level's own dark bronze; blocks are crates
  (face painted on a canvas in `view.js`: planks, a diagonal brace, an iron band and
  rivets); the cup hammered brass (a canvas bump map of dimples, kept subtle or it
  glitters); hopper, bells, screws and the bracket each piece hangs from, brass. Brass rings
  round the peg holes at the cell corners; cells nothing can hang in are a dark recess, bell
  cells a faint brass wash.
- **Page:** leather desk with a compass pressed into it (inline SVG); under the board a
  desk mat, its shadowed edge just outside dashed stitching round the board (both placed
  from the camera by `placeStitching`), Release below the mat; the nameplate a brass plate with corner screws (CSS); brass pill buttons; Release a
  stitched leather handle under the board; panels dark walnut with a brass edge and brass
  scrollwork in the corners (inline SVG, mirrored for the right side). Her mockup's spanner
  and hammer, laurel badge and side stars are not built.
- **Marbles:** glass with three ribbons painted on a canvas texture, a slight fixed tilt,
  rolling about the board's normal (`rotation.order = 'ZYX'`). Sky with a gold thread,
  rose with a green one.
- **Light:** one warm sun from top left and front with soft shadows on the board, plus a
  warm room for reflections (PMREM), so brass and glass read.

## Open questions

- The solver's runs are precise in a way a person's are not: a par it found by an exact
  arc can be hard to match by eye. Hints show its layout, so it is reachable.
- Levels 1 to 4 are easy (par 1 to 4); the funnel level does not need its funnel.
- No sideways view or zoom; on a phone an 8-wide board's cells are about 40 px.

## Code

- `sim.js` — `createRun({ saved, on })`: the level, the pieces hung, release / stop / step,
  stars and the store. `layout()`, `makeWorld()`, `stepWorld()`, `simulate()` are the
  physics, used by everything. No page access.
- `solve.js` — the beam-search solver (Node only, never loaded by the page).
- `levels.js` — the twelve levels.
- `view.js` — three.js scene built from the same lines the physics collides with, the box
  and level panels, pointer and keys, sound, the store (`marble-run-save-v1`) and the debug
  handle `window.__run` (also `__game`): `goLevel`, `solve()` hangs the level's solution,
  `release`, `step(n)`.
- `vendor/three/` — three.js r186, the same build as Physics Playground's.
- Tests in `test/marble-run/`: `levels`, `bot`, `save`, `solve` in Node; `play` (taps the
  canvas through the camera) and `scene` in the page.
