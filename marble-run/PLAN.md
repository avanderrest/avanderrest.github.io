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
- **Steampunk** (her third reference; walnut and pewter came before it): see the art bible.
- **Every board is 12x10**, the sandbox's size, so it never changes size on screen. A
  level's map sits in the middle; a **glass feed tube** runs from the top of the frame down
  to its hopper (her idea, so the level sits centred), and the marbles still to come wait
  in it, where you can see them.
- **Plumbing round a level is decoration**: pipes in from under the frame on the sides and
  the bottom, some joined in loops, with gaps; nothing hangs out there. A pipe border round
  the level was tried and taken out, and yellow walls before that. Pipes go in under the
  frame, never over it (the frame is deep, `FRAME_D`, for that).
- **Touching a pipe is a miss**, and solutions may not bounce off a funnel's rim (the solver
  only accepts a `clean` run): she found Boing's answer (a spring turned round to bank off
  the edge) and Both sides' (using a funnel's edge) too odd. The spring is 5.25 so Boing's
  answer is a spring facing forward.
- **Slopes keep one angle** and come in two halves (high, low) that join into a smooth rail;
  joined slopes that re-tilted to meet confused her. Steep is corner to corner; jump and
  booster start at mid-height, so ramps meet at a cell's top, middle or bottom.
- **Peg holes everywhere a piece can go**, round a level too, wherever no pipe runs; none
  where a level leaves a gap on purpose (no pipe drawn over a gap: a marble passing
  "through" a pipe confused her). With the board open round a level, a level that relied on
  the board's edge needs its own walls: Zig-zag is walled in crates; Both sides has a gap
  over its crates.
- **Pieces are used the way you'd expect**: "the challenge is placing them in the right
  place and piecing together the path". The solver only accepts a `clean` run (`judge` in
  sim.js): no pipe touched, every funnel gone through, a marble's first touch on a piece
  never on its tip's rounded end, no ramp met from underneath, no turn from behind.
- **The marble stays in the frame**; a miss drops to the frame's floor and ends the run.
- **Not heavy**: rolling drag and landing scuff were cut to a third; keep rails lively. The
  rolling sound is a light whir, silent while the marble creeps (a low rumble sounded like
  a dragged carpet).
- **The toggle is brass on both faces**, since after it flips its other face is the one in use.
- **Fits the window**: levels a row in the top bar, Release under the level's card in the
  left column, the box on the right (wide enough for four tiles across), the board all the
  height between. No scroll bars but the page's own.
- The flat top-down tray was never a choice, just where the first version started; its 2D
  rolling looked wrong to her, which is how this began.

## Rules found by building it

- **Rolling drag grows with speed** (`ROLL_DRAG + ROLL_DRAG2 * v`): linear drag that kept
  short ramps from flinging the marble made a long rail crawl. Now 0.08 + 0.14 v.
- **A hard landing scuffs off speed along the rail too** (`LAND_SCUFF`). Without it the
  marble kept a fall's speed and shot past anything one cell wide.
- **A turn's lowest point is its tip**, so nothing can rest in it.
- **A toggle is one wide flap**, no guides: a marble dropped dead centre balanced on the
  pivot, then wedged between the flap and a guide.
- **A cup has to be dropped into from above**; a rail running into its side stops dead.
  Twice a level had its cup roofed over by blocks: check that before solving.
- **A bell rings when the marble touches its cell.**
- **Padding a level with open cells breaks it** (zig-zag became one piece): the cells round a
  level's map are off limits.
- Stars: in the cup, every bell, no more pieces than par. They add up across runs.

## The sandbox (her ask, 2026-10-16)

"Make your own fun contraption with spinning wheels and fun things", then "see-saws,
spirals, flippers, catapult, switching paths, plinko pins and any other ideas". `SANDBOX`
in `sim.js` is the 12x10 board with nothing on it, open from the start (the tile at the end
of the level row), every piece without limit, no goal, no stars, no hint, and no start:
you hang **marble releases** (any edge cell; down from the top, in from a side; several take
turns) and **starter slopes** (the hopper's ledge as a piece, drawn like the other slopes,
as the levels' hoppers now are too). You can hang,
move, flip and take back pieces while it runs (`liveWorld` rebuilds the board under the
running marbles). Its own pieces:

- **Paddle wheel** (free axle; marbles set it spinning, `spinHit`) and **motor wheel**
  (turns by itself at `MOTOR_W`; scoops with grip, `MOTOR_GRIP`, carry a marble over the top).
- **See-saw**: a plank that tips under a marble and rocks back level.
- **Spiral**: a marble dropped in its top rides a corkscrew round its pole (scripted,
  `rideSpiral`, off the board's plane: `m.rz`) and drops out of the bottom.
- **Flipper** and **catapult**: kick when a marble lands (`KICK`): the flipper at once, the
  catapult after a moment, throwing it back over its pivot.
- **Flap**: a gate with two positions, set with Flip, even mid-run. (A lever that flipped
  switches elsewhere was built first; she found it hard to follow.)
- **Crumbling ledge** (her idea): shakes when touched, falls away, back in 3 s.
- **Plinko pins**, **booster** (speeds marbles along it), **bumper** (kicks them away).
- **Chime** (its note set by its row, `CHIME_NOTES`) and **bucket** (catches and counts).

Release feeds a marble every `SAND_GAP` s while fewer than `SAND_LIVE` are on the board,
until Stop. A marble that rests, sits on the frame's floor for `SAND_FLOOR` s or falls in a
bucket is taken away. Tested by `test/marble-run/sandbox.node.js`.

## Levels

Twelve, in `levels.js`, each with `par` and a `solution` from `solve.js` (a beam search over
cells on or beside the marble's path, accepting only clean runs: no pipe touched, every
funnel gone through). Two of them have two marbles (`one-each`, `two-by-two`).
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
- **Steampunk** (her third reference, 2026-10-16, after walnut and before that pewter):
  `oak.jpg` (ambientCG Wood029, CC0, desaturated and lightened) for the board and frame; dark
  iron L-brackets with rivets over the frame's corners and brass filigree inside them (a
  canvas in `view.js`), so the frame is wider (`FRAME_W`). Rails: a dark wooden beam
  (`beam.jpg`, ambientCG Wood051) under a brass cap whose top is where the marble rolls, a
  row of brass teeth along its back edge, hung on a brass L-bracket; steep rails are the
  beam alone with a brass face. The player's pieces lighter wood and bright brass, the
  level's own darker wood and bronze. Cups: a glass bowl on a copper stand down to the
  frame, its copper rim glows when full. Bells: chimes, tall silver and squat brass in turn,
  each under a short oak bar with a brass hammer. The hopper is copper, fed by a glass tube
  from under the top of the frame, the waiting marbles stacked in it. Round a level, copper
  pipes in from under the frame (`plumbing`), brass flanges, red valve wheels and pressure
  gauges on the ones that stop short. Cells a level leaves empty on purpose are plain oak
  with no peg holes. Blocks are still crates. Brass rings round the peg holes; bell cells a
  faint brass wash. The frame is deep (`FRAME_D`) so pipes and tube go in under it.
- **Art still wanted** (prompts in `notes/gemini-prompts/Marble run art prompts.txt`): a
  real oak texture, the marbles' filigree skins, corner fittings, decoration for blocked
  cells.
- **Page:** leather desk with a compass pressed into it (inline SVG); under the board a
  desk mat, its shadowed edge just round the frame (placed from the camera by
  `placeStitching`; the dashed stitching she asked to remove); the nameplate a brass
  plate with corner screws (CSS); brass pill buttons; Release a stitched leather handle at
  the head of the left column; panels dark walnut with a brass edge and brass
  scrollwork in the corners (inline SVG, mirrored for the right side). Her mockup's spanner
  and hammer, laurel badge and side stars are not built.
- **Marbles:** filigree balls, as in the reference: enamel with two metal bands and curls
  of wire painted on a canvas, a metalness map so only the wire shines; blue with silver,
  garnet with gold. A slight fixed tilt, rolling about the board's normal
  (`rotation.order = 'ZYX'`).
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
