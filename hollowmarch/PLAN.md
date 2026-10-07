# Hollowmarch: plan

A village at a crossroads and a keep at the end of three roads. Build between waves, then
hold the keep while the horde comes down the roads.

## The one loop

**Bend the road, then make it hurt.** Walls make the horde walk the long way; towers,
knights and the keep shoot what walks past. Between waves the village (farms, houses,
taverns, markets, wells) pays for the next wall and tower, and every building boosts its
neighbours, so *where* things go matters as much as what they are. Lose the keep and the
run is over; everything else can be rebuilt.

A good wave feels like watching a plan work: the horde snaking along a road you drew,
knights holding a troll still while arrows finish it. A bad wave should say why on the
board: the red-edged tile they battered through, the farm burnt for standing by the road.

## Rules that are deliberate

- Wave 1 will not start without an archer tower and a farm. That is the opening the game
  teaches, and `opening.js` checks it holds.
- Sealing every road does not stop the horde: it batters through the cheapest tile.
  Sappers ignore the detour and take walls apart; fliers ignore walls entirely.
- Ground monsters leave the road to burn village buildings within 1.5 tiles of it.

## Art bible

- **Projection:** top-down board of 8x8 square cells under a slight tilt (`--tilt: 8deg`);
  buildings are painted in a front-three-quarter view and sit upright on their cell.
- **Light:** dusk. Cold stone and night blue for chrome, banner gold (`--accent #ffc85c`)
  for anything the player owns, a green painted field for the ground.
- **Palette:** `:root` in `style.css`; every building has its own `--tint` / `--edge`,
  shared by its board tile and its hotbar slot.
- **Type:** Cinzel for titles, Alegreya for text.
- **Sprites:** Amber's own sheets, cut into `assets/build/` and `assets/enemy/` (see
  ASSETS.md). Shown at about one cell (30–112px), so a new sprite wants bold shapes that
  read at 40px. The well, ballista, chapel and demolish tool are still drawn SVG in
  `view.js`'s `ART` table.
- **A new sheet:** ask for a solid mid-grey or dark-green background (not "transparent"),
  pieces in a grid, the same three-quarter view, one sprite per building type.

## Open questions

- **Balance (found 2026-10-07):** every bot tried (towers only, up to 20 walls, farms and a
  barracks) falls on wave 3 or 4, and so does the do-nothing village. Waves grow faster than
  a one-farm economy can answer. Worth deciding whether that is the intended difficulty; if
  not, the levers are `START_GOLD`, `hpScale`, the wave formula in `waveComposition`, and
  farm income. `test/hollowmarch/bot.node.js` prints the wave reached, so a change shows up.
- Painting the three roads onto the board instead of the dotted route cells (the terrain
  tiles are cut but unused).

## Code

- `sim.js`: all the rules, no page access. `createGame({ saved, rnd, on })`.
- `view.js`: the board, rails, hotbar and overlays; saves through `lib/save.js`.
- Debug handle `window.__hollowmarch` (also `window.__game`).
- Tests: `bot.node.js`, `save.node.js` (Node, seeded); `opening.js`, `teeth.js`,
  `walled.js` (in the page).
