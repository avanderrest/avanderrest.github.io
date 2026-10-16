# Route Builder: plan

A railway through a growing village, after Mini Metro. The town starts as empty meadow and
grows a house at a time; you place stations where it is growing, lay track between them
and run trains, and keep up with a population that never stops growing.

## The one loop

**The town grows, you run track to it, the town grows faster where you did.** Passengers
want a colour, not a place, so a train works out its own way there across however many
lines it takes. There is no money: the town hands you stations, track, trains, carriages
and bridges as it grows, so the thing that makes the network harder to run is also what
pays for fixing it.

Good feels like: a crowded platform clearing the moment a second train joins the line.

## Rules that are deliberate (Amber's calls, 2026-09-30)

- No coins; a toy box that refills as houses go up (`GROWTH_GIFTS`).
- The town grows from nothing, fastest round stations that are served.
- Nobody swims: a house across the river neither feeds a station nor walks to it.
- Houses outside every catchment send walkers, slowly, who grumble if kept waiting.
- Survival is endless and slow (`PRESSURE_PACE` 1/3): the run ends when happiness does.
- Station colours take turns, not chance. At a junction a train takes the way out that was
  taken longest ago (`pointsPick`), so every branch gets its turn; the way the next train
  won't take is greyed out, not red (2026-10-14: flipping on every train left one of three
  arms unused for ever).
- The mat opens out (2026-10-14): the middle 55% of it in week 1, the whole of it by week 7
  (`openRect`, `OPEN_FULL_WEEK`). Nothing is built or grows outside; the house cap follows
  the open area (`houseCap`, 420 on the whole mat).
- Track or a station laid over a house moves the house to the nearest free ground on its
  own bank (`clearAround`); trees in the way just go. Houses have real footprints
  (`HOUSE_HALF`, `HOUSE_TALL`, `stationBox`), so they no longer pile on top of each other.
- The mat is the seed's (`#seed=` in the address): river, neighbourhoods, trees. A shared
  link never replaces a run in progress; it waits for the next restart.

## Art bible

- **Target look:** her mock-up `images/minigames/new/Gemini_Generated_Image_w08nbgw08nbgw08n.jpg`
  (2026-10-14): a pixel-painted village in a meadow, smoked green glass panels, brass
  buttons, Alegreya titles, news on a parchment scroll.
- **Projection:** top-down meadow, buildings seen from the front, no drop shadows and no
  platforms under stations (her call).
- **Sprites:** her houses in five roof families (orange 0–11, red 13–23, green 26–36,
  purple 38–48, blue 50–60); each neighbourhood builds mostly in its own `roof`. Stations
  `station-<type>.png`, trees/bushes `tree-0..12`, villagers `villager-0..9` (cut from the
  `_toonout` sheet) standing on a disc in the colour they want. Every sprite is drawn from a
  copy pre-shrunk to 3× its drawn size (`sized`), which halved the frame time.
- **Track:** steel rails on wooden sleepers, drawn in code (dashed strokes, so sleepers stay
  even round curves); bridges are her `bridge.png`, wherever the drawn track meets the river.
  It runs along the front of every station, right across (a buffer stop at an unused end), and
  curves off level from the platform's end; stations one above the other both use their
  right-hand ends. Trains ride the same paths (the sim asks the view for `stretchLength`).
  The building stands just behind the rails, and the waiting people are drawn over it with
  their feet on its grey stone platform (her call, 2026-10-14; `STEP_FRONT`/`STEP_TOP`). The sim still plans track as straight lines between
  stations (cost, river crossings, house clearance).
- **Colour:** five station colours (red, yellow, blue, green, purple), six train paints.
- `assets/ui/` holds small copies of the icons for the HTML; the originals stay as she made them.

## Open questions

- **Balance (2026-10-14, after "play till week 7"):** platforms hold 8/12/16, passengers per
  house 0.07, the passenger rate climbs 0.24 a pressure-day. The single-line bot now lives
  to day 41 on most mats and falls in week 3 on some; the town is still growing in week 8
  (~250 houses). A real network with branches should go further. Her "map gets a bit small"
  was read as running out of room; if she meant everything looking tiny when zoomed out,
  the auto-camera now stops at 0.62 zoom and the rest is panning.
- **How long is a run? (before 2026-10-14)** In the bot test a single line of a dozen stations, given every
  train and carriage the town hands out, lasted to day 38, day 66 and past day 80 on three
  mats. The town stops at 240 houses around day 30, so from then on only the passenger rate
  climbs. If survival should end sooner, the house cap is the lever.

## Code

- `sim.js`: `createRouteBuilder({ rnd, on, measure })`. The town, stations, the toy box,
  drafting track, routing, trains, walkers, happiness, the calendar. No page access.
  `rb.state`, `rb.routing`, `rb.draft` are getters; the lists are stable arrays.
- `view.js`: the mat, drawing, camera, pointer input, HUD, menu, saving (`route-builder-save-v3`
  and its `-run`).
- Debug handle `window.routeBuilder` (also `window.__game`).
- Tests: `bot.node.js` (fifteen days of survival on three mats), `save.node.js` (resume
  round trip, same seed same mat) and `junction.node.js` (three arms all used; houses moved,
  not lost) in Node; eighteen in-page cases. Saves are `route-builder-save-v3` since the mat grew.
