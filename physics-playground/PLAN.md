# Physics Playground — plan

Four toys, each with its own small physics, behind one row of tabs. No goal, no score:
the loop is *poke it and watch what it does*. Only the toy on show runs.

## The toys and the rules that are deliberate

- **Gummy bears** — 15 mass points per bear (head, ears, snout, chest, belly, rump,
  shoulders, hands, hips, feet), held in shape by shape matching (Müller 2005): a whole-body
  cluster that mixes rotation with an area-preserving (det 1) linear fit, so a squashed bear
  keeps its volume, plus stiffer head/torso/limb clusters. Whatever you hold by goes soft
  (limb cluster ×0.06), so a pulled arm stretches out and thins instead of the bear just
  lifting rigidly. No point may stray more than 34×size from its place in the rigid shape,
  so a hard shake drags the whole bear instead of tearing it. The side walls are the edges
  of the screen (`setBounds`), not of the 1200-wide world. Drawn as one implicit surface over the points and fourteen stretchy strands
  (limbs, neck and every joint; capsules whose radius goes as √(rest/length), keeping area,
  never under 0.35 of rest, so the candy stays in one piece). Colours from the prompt:
  cherry, orange, lemon, apple, clear pineapple.
- **Lava** — Clavet 2005 double density relaxation (REST 10, K 0.1, KNEAR 0.6) plus an
  explicit mid-range cohesion (2), which is what makes blobs round. Cohesion only reaches
  R = 24, so blobs whose bounding boxes are within 160 drift together (`pull`). The blade moves
  lava aside with only 0.6 of that as speed: a slice parts a blob for a second or two, then
  it draws back (more speed flings the halves apart, less closes the cut at once). The lamp heats the bottom, cools the top; heat
  conducts between neighbours so a blob rises as one piece.
- **Kinetic sand** — 96×96 height field; slumps past the talus slope (0.7–2.6, the *Hold*
  slider). A shape's underside pushes sand to a ring round its footprint; speed² is lost
  per volume moved over mass, and it rests once its contact bears its weight. Volume is
  kept exactly (sand + grains in the air). The 50,000 grains are points riding the mesh,
  lit by the slope under them.
- **Chaos pendulum** — standard double pendulum, RK4 at 600Hz. Ghosts start 1e-3 rad
  apart; the drift graph is log₁₀ of the first ghost's distance.

## Art bible

Each toy paints its own scene; the chrome is a quiet ink-blue with amber buttons.
- Gummy: pink gingham table, cream striped wall, light from the top left. Candy shaded per
  pixel at ≤420k px: thickness and the dome both *saturate* (or the point kernels show as
  creases); absorption deepens colour where thick; gingham refracted through it; small
  fresnel, a sharp clearcoat; shadows tinted by the bear's own colour with a caustic patch.
- Lava: obsidian dark, crust-red edge → orange → yellow core, a soft bloom.
- Sand: warm wood tray on a dark table. Only the shapes reflect the env map; the sand stays
  matte (it washed out white when it reflected too).
- Pendulum: blueprint navy, rainbow trail.

## Open questions

- On a phone the 1200×750 flat worlds letterbox small; a taller world for portrait?
- Bears mostly end up lying down (narrow feet). Fine for gummies, but a wider stance
  would let more of them sit up.
- A bear dropped from high up cartwheels up to ~300px across the table before it settles.
- Removed 2026-10-15 (Amber): Firewood ("boring"), and the Synth, parked unwired in
  `backing-band/synthwave/` for her to decide on.
- Bot numbers (2026-10-15): shaken bear's thinnest joint 4.6; sand volume drift 5e-5%;
  pendulum energy drift 3e-6% over 20s.

## Code layout

- `sim.js` — every toy's rules (`createGummies`, `createLava`, `createSandbox`,
  `createPendulum`) and `createPlayground` (save/restore).
- `view.js` — tabs, the shared 2D canvas fitted to a 1200×750 world, input routing, loop,
  save, `window.__playground`.
- `view-gummy.js`, `view-lava.js`, `view-pendulum.js`;
  `view-sand.js` is imported only when the sand tab first opens (three.js, vendored).
- Tests: `test/physics-playground/` — `bot.node.js` (every toy), `save.node.js`,
  `every-toy.js` (each tab draws in the real page).
