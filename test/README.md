# Tests

Local only. Nothing here is deployed, nothing is installed, and the site itself still has
no build step and no dependencies — this just drives the real pages in a headless browser
and asks them questions.

```sh
node test/run.js keelfall          # every case for keelfall
node test/run.js keelfall colony   # just test/keelfall/colony.js
node test/run.js                   # everything, every project
```

Needs Chrome or Edge installed, and nothing else. The runner serves the repo on a free
port, starts its own private browser profile, and exits non-zero if any case fails or the
page logs an error.

## Layout

One folder per project, named after its folder in the repo. `test/keelfall/` runs against
`/keelfall/`. Add a project by making `test/<slug>/` and dropping a case in it. A folder
whose name starts with `_` is not a suite and is skipped.

Before writing a case from scratch, look in [`_salvage/`](_salvage/README.md) — it holds
the playtests that used to live in session scratchpads, for thirteen projects. None of it
has been run since, and most of it is standalone Chrome drivers rather than cases, but the
assertions in them are worth lifting.

A case is a plain script evaluated inside the page. It ends by returning a verdict:

```js
const K = window.__keelfall;   // whatever debug handle that game exposes
// ...drive the game...
return JSON.stringify({ pass: true, detail: 'what it saw, pass or fail' });
```

`detail` is always printed, so make it say the numbers. A passing test that prints
`20/20 workable; tightest was reach=81` tells you how close to the edge you are; one that
prints `ok` tells you nothing.

## What is worth a case here

These games have no logic layer to unit-test — the interesting behaviour only exists once
a world is generated and a few hundred simulated days have run. So cases are about
end-to-end properties that break silently:

- **keelfall/generation** — every crash site has to be workable. Twice this broke by
  generating colonies that could not do anything: once the nose cone landed in a 29-tile
  pocket, once the apron-clearing code removed the very growth the first day's timber
  comes from. Neither was visible on screen.
- **keelfall/colony** — given food in the store and a galley standing, the food has to
  reach the plate. This broke three separate ways that all looked identical from outside
  (full store, bare counter, everyone hungry): crew drinking the tank dry irrigating the
  terraces, crew stranded behind a building placed across a one-tile neck, and a haul
  retrying an unreachable destination forever at top priority.
- **marble-tray/case** — the tray is painted from five textures cut out of Amber's plates,
  and `paintCase` falls back to flat colour in the same shapes when one is missing. A
  renamed or undeployed asset therefore leaves a tray that still looks broadly right in a
  screenshot. The case loads every texture, checks it is the size it was cut to, and then
  samples the painted canvas to confirm wood is on the rim, baize in the well and a brass
  screw in each corner.
- **marble-tray/shelf** — every icon on the shelf has to fit its cell. The scale was fitted
  against a constant bigger than the canvas, so the big marble, the shooter and six of the
  nine fixtures were drawn half again as wide as the tile they lived in and arrived cropped.
  Nothing throws and nothing logs. The case reads the icon canvases and fails on any lit
  pixel in the outer ring, and on a tab whose icons have all come out the same size.

The pattern worth copying: assert the property, not the implementation, and set the
fixture up so only the thing under test can fail. The colony case hands the colony plenty
of food, water and materials precisely so that a failure means *delivery* is broken rather
than that it drew a hard map.

## What is not worth a case

A scripted "play the whole game" bot was tried and deliberately not kept. It failed often
for its own reasons — bad opening spends on some map rolls — and those false alarms cost
more time than the real bugs it found. A noisy oracle is worse than none.
