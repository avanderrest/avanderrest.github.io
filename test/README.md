# Tests

Local only. Nothing here is deployed, nothing is installed, and the site itself still has
no build step and no dependencies — this just drives the real pages in a headless browser
and asks them questions.

```sh
node test/run.js furrow           # every case for furrow
node test/run.js furrow growth    # just test/furrow/growth.js
node test/run.js                   # everything, every project
```

Needs Chrome or Edge installed, and nothing else. The runner serves the repo on a free
port, starts its own private browser profile, and exits non-zero if any case fails or the
page logs an error.

## Layout

One folder per project, named after its folder in the repo. `test/furrow/` runs against
`/furrow/`. Add a project by making `test/<slug>/` and dropping a case in it. A folder
whose name starts with `_` is not a suite and is skipped.

Before writing a case from scratch, look in [`_salvage/`](_salvage/README.md) — it holds
the playtests that used to live in session scratchpads, for thirteen projects. None of it
has been run since, and most of it is standalone Chrome drivers rather than cases, but the
assertions in them are worth lifting.

A case is a plain script evaluated inside the page. It ends by returning a verdict:

```js
const F = window.furrow;   // whatever debug handle that game exposes
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

- **toy-racers/circuit** — a track has to be raceable, and none of the ways it stops being
  raceable are visible on the desk. The track edges are offset from a spline by the
  half-width, so a corner whose radius drops below that half-width pinches the corridor
  shut and a car arriving there is clamped against both walls and stops dead at full
  throttle — `workbench` shipped like that and nobody finished a lap. The desk dressing is
  shared between the three tracks and each drops the props its route crosses, so a missed
  one is an invisible wall; the toolbox sat in the middle of `longrule`'s back straight.
  The case measures every corner against its own width, checks every solid prop against the
  corridor, then races all three and counts the finishers.
- **toy-racers/driving** — the AI writes `throttle` and `steer` straight onto a car and never
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

- **blackout/map** — the compound is two floors of hand-typed strings, and they break
  silently: a stray character closes a doorway and strands a room, a stair top one tile off
  leads nowhere, a waypoint on a crate leaves a guard standing still all game. The case
  walks the graph from the start with the keycard door open and fails on any stranded
  node, on stairs without a top, on a beat a guard cannot walk, and on lamps or cameras
  mounted on the wrong kind of tile.
- **blackout/sight** — the dark has to hide you and the red on the move grid has to tell
  the truth. Inside a torch's reach you are seen whatever the light, further out only on a
  lit tile, never through a crate. The red tint is computed apart from the check that fills
  the Seen bar, so the case walks into a red tile (the bar fills) and along an all-blue path
  (it does not), and checks takedowns and shots only work from behind.
- **blackout/investigate** — being seen is not the alarm: the guard should leave his beat,
  walk one tile a tick to where he saw you, look about, and walk back to his route. A guard
  who never leaves makes being seen free; one who never returns breaks the patrol for good. The
  tower sentry is checked the same way: he climbs down (ladder or stairs), looks, and goes back
  up to his floodlight.
- **blackout/mission** — the whole job with the real verbs and the fighting taken out: the
  cut in the wire, the card off a body, the door, a staircase (a graph edge between floors),
  the bypass, the alarm the download trips, and the win back outside.
- **blackout/pace** — nothing moves until you do: the guards take one step per two of your
  moves (steps, shots, doors), every move in the alarm, a running step counts half.
- **blackout/terminal** — the terminal has to be reachable past its camera without shooting
  it, but only just. The first camera, in the room's corner, shut the only lane at every point
  of its sweep, and a nudge to its angle swings it to trivial. The case plays every timing
  against the real camSees and requires a way in from a few entry timings only, by the
  shortest path.
- **blackout/alarm** — a dead man in a guard's light raises the alarm (a knocked-out one is
  woken instead: investigate covers that), hunters take aim before
  they fire and lower it if you break their line, the gate sends reinforcements, and the
  terminal checkpoint puts you back with the data.
- **neon-roll/mechanic** — the one button has to matter and a good player has to survive.
  It plays five seeds twice: a ball that never presses (the gaps are sized for exactly that
  ball, so it must never fall in one), and a player who holds on descents, lets go on rises
  and, in the air, flies both arcs forward and dives only when that meets the slope better.
  The first tuning had the pumped ball at 2300 px/s overflying whole valleys and slamming
  onto upslopes fifteen times a run — onto kicker ramps too, which left it too slow for the
  gap — and every screenshot of it looked great.
- **neon-roll/sprint** — Sprint is one fixed seed, so one bad kicker would be in every run
  forever. A good player has to finish with no falls and the time has to be saved as best.
- **neon-roll/input** — real keys and pointers through the real listeners, the dialog that
  must swallow them, the blackout catching a stalled ball, and a restart that waits long
  enough not to eat the press that ended the run.
- **neon-roll/track** — 20 seeds out to 5 km: every join matches in height and slope (a kink
  launches the ball for no reason), and every gap is flown *with drag* by the ball that never
  pressed anything, since the generator sizes gaps by a formula that ignores it. The long,
  late gaps only exist past where the play-throughs reach.
- **neon-roll/rules** — single hand-placed landings: along the slope is a Perfect and faster,
  60° off is a slam, three Perfects light the fever and shards count double, a skip is not
  judged. In aggregate runs a broken rule only nudges the distances.
- **neon-roll/shop** — shards buy balls through the real dialog, the price comes off, locked
  balls stay locked, and the purchase reaches localStorage. Puts the real save back after.
- **neon-roll/draw** — reads pixels back after a real run: the tube lit where the track is,
  the ball lit where it is, the sky dark above. A wrong camera throws nothing.
- **neon-roll/track** now builds in the Gaps mode (the only one with gaps) and also checks
  the track does not drift: a run once felt like one long slide down because every piece
  ended a little lower than it began. And no flats: a straight level stretch (a curved
  valley bottom is fine) breaks the flow.
- **neon-roll/track** checks every hill is symmetric about its crest and curved tightly enough
  there to throw a ball at cruising speed. After a long run of lopsided jump designs (ramp,
  lip, fitted landing curve) the plain symmetric cosine hill Amber asked for beat all of
  them: 17-24 Perfects a run, 0-2 slams, full flow on every seed.
- **neon-roll/track** (older note) also checked that every jump's lip drops away sharply enough to throw
  the ball, and that the landing curve after a lip only ever goes down. That curve is built
  around the flight path; the first two versions of it dipped and climbed back up, which
  put a small wall right after the lip. A slow ball slammed into it and rolled back into the
  gap, and the only sign was one never-press run in mechanic.js falling in.
- **neon-roll/input** also covers R to restart, the roll-out key (it climbs a stopped ball out
  of a valley but does nothing to a moving one), and the restart offer that appears after a
  few seconds without progress and goes away once the ball gets going.

The neon-roll cases share one page and run alphabetically, so each ends with `setMode`,
which also clears a test's `noChase` — `draw` leaving it on once let `input`'s blackout
never arrive.

- **donut-works/levels** — every order has to be fillable with what the levels before it
  unlocked. Its first run found The Wedding asking for Coronations while the paper crown
  they need was The Wedding's own reward, so nobody could ever finish level 12. The crown
  now comes a level earlier, and loading a save hands out anything a passed level unlocks.
- **donut-works/line** — mixer, press, fryer, counter on the starting cash has to sell ten
  donuts at a profit, and the same line with a glazer dropped over a belt has to finish the
  glazed order. `setSpeed(0)` stops the frame loop so `step()` is the only clock.
- **hollowmarch/opening** — the tower and farm the game insists on before wave 1 have to
  hold it, and the wave has to pay out and be saved. The farm goes on the cell furthest
  from any road: raiders burn village buildings near their path, which is the rule working.
- **hollowmarch/walled** — a keep walled in on every side must not stall a wave forever;
  wave 7 is the first with a troll and a sapper.
- **hollowmarch/teeth** — building only what wave 1 requires has to last two waves and
  fall by wave 12, so the horde neither flattens a sensible start nor has no teeth.
- **the-corner-shop/day** — a first day played through the real Orders, Fill and Open
  buttons with a perfect clerk: everyone accounted for, nobody walks out, the tin matches
  the order plus the takings minus the rent, and the day makes a profit.
- **the-corner-shop/neglect** — nobody on the till: the day still ends, every walked-out
  basket goes back so no stock vanishes, reputation falls, and two red mornings lock you out.
- **wayside/chapters** — a few hundred generated chapters, each with a full barrier and one
  way through, its key pieces and a pedlar actually dealt (the scatter gives up after sixty
  tries, so a crowded chapter could lose its hermit), a campfire, and lighthouses on time.
- **wayside/art** — every sprite, spent sprite and ground the game names draws something;
  a misspelt name is a blank tile, not an error.
- **furrow/growth** — a village from nothing: the game starts with four people and a
  handcart, and the case lays out a barn, houses, a field, a woodcutter and a well, hires
  whoever is idle, adds a forester, bakery, more houses and fields, and runs twelve days
  without doing a single task. The first buildings have to be up by day four (nobody new
  comes until there is a well, and this player lays the well out last), the camp has
  to hand over to the barn, the village has to reach eight, and nobody may go hungry or
  leave. Its first run (on the old ready-made start) found the village starving from day
  nine: once everyone had a job nobody was left to raise the bakery. Anyone whose own work
  has run out now lends a hand at a site. The other Furrow cases start from `quickStart()`,
  a small working village raised at once, since they are about something else.
- **furrow/days** — four days with nobody at the controls: the field sown, watered and
  harvested, logs in the barn, everyone fed and in bed in the small hours.
- **furrow/live** — a day as Nell through the real keys and the same prompt the AI uses:
  breakfast, the can filled at the well, eight jobs in the field, the barn, bed, the night
  skipped, and Nell carrying on without you after you step back. That last check measures
  how far she gets, not where she ends up: breakfast once brought her back to the very door
  she started at, and an end-to-end distance read that as standing still.
- **furrow/pockets** — there is no money, so an idle villager lifts the bite of food folk
  pocket at breakfast; three lifts make a thief and
  a job, given from the panel or asked for at a door, puts them straight; Q from behind
  works and from the front gets you caught.
- **furrow/looks** — the barber and the clothes shop through the real dialog: the cut and
  the coat really change the sprite, and the clothes shop hands over only what is sewn.
- **furrow/build** — a new game has nothing but the camp, and the first barn packs it away;
  headcount and renown gate, the barber waits on a smithy and the clothes shop on a
  sheep pen, a house over the barn door is refused, nothing goes on a tree or a rock (the
  Clear tool only marks them), stone walls spend stone, a turned entrance is on the side
  asked for, a building can go down on someone who then steps aside, every workplace's door
  is reachable, and a spare bed brings a jobless newcomer down the road.
- **furrow/clearing** — a marked tree far from the hut is felled by the woodcutter, a marked
  rock broken up by a miner and its stone carried in, stumps rot away with nothing regrowing
  unplanted, and a forester's saplings take and grow without walling a door off. Its first
  run caught the forester planting once in three days: she picked a fresh random spot every
  time she thought, so walked about for ever. (The test's own first runs filled the barn
  with logs, so the stone had nowhere to go — leave room in the barn.)
- **furrow/needs** — one or two newcomers a morning when there is a bed, food and water
  (eight to a well) and the village is content; an evening note says which is short, and
  says nothing when nothing is; and the view never zooms out past the valley's edge.
- **furrow/save** — saved, thrown away, loaded back identical, including a half-built site
  still standing in the way, a turned entrance and a tree marked for clearing.

The pattern worth copying: assert the property, not the implementation, and set the
fixture up so only the thing under test can fail. The Corner Shop day case works the till
perfectly precisely so that a failure means the money or the stock is wrong, rather than
that the day was played badly.

## What is not worth a case

A scripted "play the whole game" bot was tried and deliberately not kept. It failed often
for its own reasons — bad opening spends on some map rolls — and those false alarms cost
more time than the real bugs it found. A noisy oracle is worse than none.
