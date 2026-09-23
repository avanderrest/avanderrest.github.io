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

- **spy-assassin/route** — the compound has to be crossable. The whole game is one long
  level with ducts, a ladder shaft and crates to climb, and every one of those is a place
  it can silently become impassable: a crate stacked two high is a wall, because you can
  haul yourself up one tile and never two. That is exactly what the first draft shipped
  with. The case walks the tile grid using the moves the keys actually give you and
  requires the terminal and the way out to be reachable — and, with crouching taken away,
  requires them *not* to be, so the ducts are load-bearing rather than decorative. The way
  out is searched *from the terminal*: the first version searched from the start, which is
  next to the exit, and so passed for a whole revision in which a crate stair that climbed
  fine going in was a two-tile wall coming home and the escape could not be done.
- **spy-assassin/beats** — every guard has to walk the beat he was given. A crate in a
  beat turns the guard round, and the keycard guard, written to walk 28 to 42, was in
  fact boxed into 33.4 to 36.6 between two crates and under the camera — so he was always
  turning, which played as "he turns round the moment I get over the boxes". The case
  lets every guard patrol for a minute and holds each to 85% of his declared beat, then
  puts the player the far side of the yard crates with the alarm up and requires the
  guard to climb over to him rather than stand behind the first crate for good.
- **spy-assassin/shadow** — past a couple of paces a guard sees a lit man and not a dark
  one, and that one rule is the game. Inverted, the game is unplayable and looks identical:
  torches still sweep, guards still walk their beats. The case holds the geometry still and
  moves only the light level, so a failure is about the rule and not about where anybody
  was standing. It also checks a wall stops a torch, which is the other half of the same
  function and fails just as quietly. And a torch has to count as light: before it did,
  you could stand upright beside the yard crates with the beam full on you and the guard
  walked on. Standing there he must notice you, and crouched behind them he must not.
- **spy-assassin/duct** — the guards walk with different collision from the player, and the
  first version checked theirs with a plain "is it a wall" test. A duct is not a wall, so
  guards strolled through the perimeter wall while patrolling perfectly sensibly. The case
  raises the alarm from the wrong side of that wall and gives every guard in the compound
  thirty seconds to try to reach the player.
- **spy-assassin/lights** — shooting a lamp out has to make the room darker, and a tripwire
  has to be something you duck rather than walk into. The first is really a test of the
  pistol's forward scan: aim past a crate, don't take the camera overhead instead. The
  second is a few tenths of a tile of arithmetic against a standing body and a crouched
  one, and a hair either way makes the beam impassable or free. Both were wrong once. It
  also holds the pistol to shooting a man in your line of fire over a lamp overhead, and to
  nothing off the edge of the screen. Ranked by distance alone, the yard lamp was always
  nearer than the keycard guard walking away under it, so he could not be shot at all.
- **spy-assassin/sneakable** — a stealth level can be beautifully built, beautifully lit and
  completely unplayable, and a screenshot of it looks *better* than one that plays well. The
  first lamp layout put pools ten tiles wide nine tiles apart, which at floor level left a
  strip of dark about one tile across: nowhere to stand, nowhere to wait for a patrol to
  turn. The arithmetic that goes wrong is height — a lamp hung 2.8 tiles up throws a much
  narrower pool on the ground than its radius suggests — so the case measures light along
  the three stretches of floor the route runs on and requires no lit run longer than a
  player can cross in the gap a guard's pause gives them, a real share of dark, and dark
  pockets big enough to stand still in.
- **spy-assassin/fog** — you see clearly only as far as the old phone screen reached, and
  past that only light gets through, blurred. Every part of that can break with the game
  still playing: a mask built for the wrong canvas size, a glow layer composited without
  its mask (a second copy of every lamp in the middle of the view), one drawn at full
  resolution (the fog hides nothing). So the case reads real pixels off a rendered frame: a
  far lamp glows and empty fog is black; the far glow has no hard edge where a near lamp
  does; put the far lamp out and its glow goes; the old screen's edge sits in the fade band.
- **spy-assassin/hard** — the whole mission, on hard, with nothing but the keys. It holds
  and taps keys and only reads what a player can see, and plays the level's intended route:
  wait in the dark for a back to turn, choke or shoot only from behind, put out the lamp a
  camera needs, crawl the ducts, and time the crates on the way out between shots. This is
  the "play the whole game" bot the section below warns against, kept on purpose: that one
  failed on random map rolls, and this compound is hand-built with clockwork guards, so it
  plays the same way every run (the only dice are the bypass zones, which it reads). A
  failure means a change has made five rounds too few. It currently finishes with a round
  to spare and no damage.
- **spy-assassin/alarm** — under the alarm the game is still about the dark. The alarm used
  to make every guard "alert", and an alert guard fired whenever he had a straight line to
  you, with no question of whether he could see you: the walk out after the download was a
  shooting gallery the dark did nothing about, and played as "they spot you instantly, it
  cannot be done". Now the alarm starts a search. The case holds a searching guard facing
  you across the dark yard and requires that he never makes you out or fires; then puts you
  under the lamp in front of him, where he must, inside a second; then back into the dark,
  where he must lose you.
- **spy-assassin/mission** — the rules have to add up to a mission. Card off a guard, door,
  terminal, download, out. The chain runs through four separate pieces of state and any of
  them can stop advancing while every screen still draws correctly. It also pins down the
  scoring the wrong way round: the download is *supposed* to trip the alarm, so a run where
  nothing else did is the clean one.
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
- **neon-roll/log** — the Play log records every take-off, landing and press and survives
  to localStorage. Every tuning pass since it existed was decided by reading one.
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

The pattern worth copying: assert the property, not the implementation, and set the
fixture up so only the thing under test can fail. The colony case hands the colony plenty
of food, water and materials precisely so that a failure means *delivery* is broken rather
than that it drew a hard map.

## What is not worth a case

A scripted "play the whole game" bot was tried and deliberately not kept. It failed often
for its own reasons — bad opening spends on some map rolls — and those false alarms cost
more time than the real bugs it found. A noisy oracle is worse than none.
