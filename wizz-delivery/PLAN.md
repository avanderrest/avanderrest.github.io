# Wizz Delivery: plan

A food-courier shift, after Crazy Taxi and the delivery apps. Drive a car round a small
keep-left town, take orders off the restaurants' boards, pick up, drop off, and chase tips
before the countdowns run you over. Five minutes a shift.

## The one loop

**Pick an order, drive it, get there before the clock.** An order's clock starts at the
pickup. Get it to the door in the first 60% of its limit for the fare and a tip, inside
the limit for the fare, after it for less and less of the fare (a fine past twice the limit),
and a fifth more for any drop made with another order still in the bag. The town has traffic that keeps left, gives
way, goes round the roundabouts and stops at the lights, and you share the road with it.

Good feels like: a fast drop-off, a tip, and the next order already on the board round
the corner.

## Rules that are deliberate

- **Stacking pays** (2026-10-14). It used to lose money: a late order paid nothing and was
  fined a third of its fare, so the bot ended a shift about +£106 carrying one, +£8 two and
  -£36 three. Now a drop made with another order still in the bag earns 20% of its fare on
  top, a late order pays a share of its fare falling to nothing at twice the limit (fined only
  after that), and limits are 3 s + 1.5 s a tile. Same bot, four shifts: £219 / £283 / £314
  carrying one / two / three, as long as the extra orders go the same way.
- Everybody drives at one speed, you included; E takes you a level over the traffic until
  you slow back down, Q a level under.
- You are never held at a red, only fined for running one. Amber is a warning.
- Paused, the shift stands still: the shift has its own clock (`G.ms`), which drives the
  order deadlines and the signals, so nothing runs on while you are away.
- The board leans towards the restaurant nearest you, so it is rarely bare.
- One fixed town (`MAPS.town`); there is no seed to share. A level made in the editor is
  data rather than a seed, and travels in the URL.
- A house need not stand on the pavement. An off-pavement house keeps its address but
  its door becomes the nearest road tile: the pin, the route and the drop all move
  there, so a cottage in the middle of a field is still a delivery.
- An editor-drawn straight road is tarmac for its whole length. A two-point road used
  to be sampled only at its ends, so the middle was paint over grass; the curve
  sampler now walks the segment. Traffic uses any non-minor road, so a new main road
  or street brings cars with it; an estate lane is drawn but kept clear of them.

## Art bible

- **Projection:** top-down, 44 px tiles. Her painted building sheets (`assets/buildings/`)
  for houses, rows, blocks, gardens, trees and the restaurants; streets drawn as curves.
- **Signs:** two restaurants have painted fronts; the other six get a board drawn in code,
  and all eight a dish badge (see ASSETS.md).
- **HUD:** warm brown wood and cream card; Sour Gummy for signs, Nunito for text.
- **After her mock-up** (`images/minigames/new/Gemini_Generated_Image_i5o4mfi5o4mfi5o4.jpg`,
  2026-10-14): the camera sits closer (`viewZoom`, 1.3x the sprites' native size, 1.1x on a
  phone); yellow centre dashes and a white edge line inside each kerb; every restaurant has her
  orange pin with its dish and its name in white over it, the offer bubble beside the pin; the
  drop you are following gets a red crosshair. Not taken from the mock-up: bigger houses (her
  sheets are painted for one tile each) and lane arrows.

## Open questions

- None from the bot: carrying two orders going the same way out-earns one at a time.

## Code

- `sim.js`: `createWizz({ rnd, on, map })`: the town, lanes, junctions and signals, traffic,
  the car, orders and the shift clock. No page access. `wz.step(dt)` runs it; `wz.input`
  is what the driver is pressing; `wz.G` is the shift. Without `map` it builds Wizzby;
  with one it builds that level (see `level.js`).
- `view.js`: painting the town, the cars, markers, minimap, the order board and bag, keys
  and the touch pad, toasts, the summary, and the save (`dash-save-v1`: best shift and
  tallies only). `?level=draft` or `?level=<base64>` plays a level of your own, and falls
  back to Wizzby if the level is not complete.
- `level.js`: a level as data — roads, grounds, buildings, trees, delivery houses,
  restaurants and the start — plus validation, the URL-safe base64 link, the
  localStorage draft (`wizz-level-draft-v1`) and the shelf of named maps
  (`wizz-levels-v1`).
- `town-level.js`: Wizzby as an editable level. Built from the real sim once, so the
  map the editor opens on is the map the game plays, tile for tile.
- `editor.html` / `editor.js` / `editor.css`: the level editor. It opens on the town
  you are driving (the game's link says `?level=town`), with a picker for the maps on
  the shelf, and the sprite you are about to place follows the pointer. Drag roads,
  parks, ponds, car parks and painted grounds; click houses, buildings, trees, bushes,
  restaurants, lights, roundabouts and the start. Road is its own tool with width, a
  traffic-free estate-lane option, and ends that snap to corners already drawn; the
  wide main road paints a double centre line, so it reads apart from a street. Path
  lays the footpaths (like the one down to the duck pond), and the green, tennis
  court, allotments and playground are each their own tool rather than a dropdown.
  It rebuilds the real sim on every edit, so an invalid house or restaurant is caught
  before Play. The camera is bounded by the roads' own extent, not the 50x34 grid, and
  the map has no drawn border. The top bar's Share menu holds Share link (the Web Share
  API where it exists, a copied link where it does not), Copy link, Download, Open and
  Delete; the tool palette keeps to tools.
- Debug handle `window.__wizz` (also `window.__game`).
- Tests: `bot.node.js` (two full shifts driven through the real car), `save.node.js`
  (the shift's lifecycle and the pause) and `custom.node.js` (a level round-trips through
  the share link and drives) in Node; nine in-page cases.
