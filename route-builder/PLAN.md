# Route Builder: plan

A wooden train set on a felt playmat, after Mini Metro. The town starts as empty grass and
grows a house at a time; you place stations where it is growing, lay track between them
and run trains, and keep up with a peg-person population that never stops growing.

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
- Station colours take turns, not chance. Points at a junction flip every train.
- The mat is the seed's (`#seed=` in the address): river, neighbourhoods, trees. A shared
  link never replaces a run in progress; it waits for the next restart.

## Art bible

- **Projection:** top-down toy set on felt, soft shadows, everything a wooden toy.
- **Textures:** her felt, wood and sprite sheets in `assets/`; track drawn as wooden pieces
  in code, bridges as planked decks at the true crossing point.
- **Colour:** five station colours (red, yellow, blue, green, purple), six train paints;
  the HUD is cream card with wooden buttons.

## Open questions

- **How long is a run?** In the bot test a single line of a dozen stations, given every
  train and carriage the town hands out, lasted to day 38, day 66 and past day 80 on three
  mats. The town stops at 240 houses around day 30, so from then on only the passenger rate
  climbs. If survival should end sooner, the house cap is the lever.
- The bot never builds a second line and still lasts weeks: transfers and branching are
  not yet needed to survive, which is most of what makes Mini Metro interesting.

## Code

- `sim.js`: `createRouteBuilder({ rnd, on, measure })`. The town, stations, the toy box,
  drafting track, routing, trains, walkers, happiness, the calendar. No page access.
  `rb.state`, `rb.routing`, `rb.draft` are getters; the lists are stable arrays.
- `view.js`: the mat, drawing, camera, pointer input, HUD, menu, saving (`route-builder-save-v2`
  and its `-run`).
- Debug handle `window.routeBuilder` (also `window.__game`).
- Tests: `bot.node.js` (fifteen days of survival on three mats) and `save.node.js` (resume
  round trip, same seed same mat) in Node; eighteen in-page cases.
