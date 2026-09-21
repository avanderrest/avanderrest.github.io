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
- **paddock/circuit** — a track has to be raceable, and none of the ways it stops being
  raceable are visible on the desk. The track edges are offset from a spline by the
  half-width, so a corner whose radius drops below that half-width pinches the corridor
  shut and a car arriving there is clamped against both walls and stops dead at full
  throttle — `workbench` shipped like that and nobody finished a lap. The desk dressing is
  shared between the three tracks and each drops the props its route crosses, so a missed
  one is an invisible wall; the toolbox sat in the middle of `longrule`'s back straight.
  The case measures every corner against its own width, checks every solid prop against the
  corridor, then races all three and counts the finishers.
- **paddock/driving** — the AI writes `throttle` and `steer` straight onto a car and never
  touches the key handler, so the entire player input path could be dead with every other
  check still green. This one holds real keys down over the real listeners: the countdown
  holds the field, the throttle pulls and the brake bites, both steering directions turn
  the car, and a keyboard-driven lap completes. It also checks the GO! card actually goes
  away — `.countdown` is `display: grid`, which beats the UA's `[hidden] { display: none }`,
  so setting `hidden` on it did nothing and it sat over the desk for the whole race.
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
- **marble-tray/steering** — the match was unwinnable with the keys. The play log showed
  every shot in a whole match peaking at exactly 460px/s, the steering cap: a key is on or
  off, so the shooter reached the cap in under half a second and there was no such thing as
  a soft shot. A shooter at 460 hands the marble it strikes about 660px/s, and a marble only
  drops in under 300. The case lines shooter, marble and hole up dead straight so aim cannot
  be the variable, and varies only how long the key is held — a tap has to pot it, a lean
  has to ride across, and Shift has to brake a rolling shooter back down.
- **marble-tray/corner** — a match that could never end. The round runs until the last
  marble is down, and the tray shakes itself when nothing has moved for a while, but the
  shake only kicked the marbles: an opposing shooter parked on the last one in a corner was
  the one thing it never touched, so the marble came straight back off it. The case sets up
  that exact pin, then re-pins it after every shake to force the give-up rule, and checks
  the marble ends up back in the middle and the round can be finished.

The pattern worth copying: assert the property, not the implementation, and set the
fixture up so only the thing under test can fail. The colony case hands the colony plenty
of food, water and materials precisely so that a failure means *delivery* is broken rather
than that it drew a hard map.

## What is not worth a case

A scripted "play the whole game" bot was tried and deliberately not kept. It failed often
for its own reasons — bad opening spends on some map rolls — and those false alarms cost
more time than the real bugs it found. A noisy oracle is worse than none.
