# Neon Roll: plan

A one-button roller, after Ski on Neon and Tiny Wings, with a glowing ball for the skier.
Holding presses the ball into the track; letting go lets it fly off the next crest. Land
along the slope for a Perfect; three in a row set it on fire.

## The one loop

**Press into the dip, let go over the crest, land on the downslope.** Every Perfect adds
a level of flow (more cruising speed, more lift); a slam takes it all away. The ring on
screen is where you land if you let go now, the diamond where you land if you dive.

Good feels like: a chain of Perfects where the ball barely touches down between hills.

## Rules that are deliberate

- Five modes: Endless (outrun the blackout), Air Time (two minutes, score is time aloft),
  Sprint (one fixed 1500 m course, race your best), Snakes & Ladders, and Race.
- **Snakes & Ladders** (the Gaps mode until 2026-10-14, Amber's idea): 2000 m to a finish
  line over kickers and breaks. Pads glow on landing hills and some big hills' far sides:
  a Perfect on a lime pad (a ladder) leaps 150 m ahead; landing on a red pad (a snake), or
  falling in a gap, slides 80 m back. Each pad works once. Pads have their own dice, so the
  hills are the old Gaps mode's. Saves on `gaps` move to `ladders`.
- **Race** (two players, 2026-10-14): two sims on one seed, WASD (or the left half of the
  screen) for cyan, the arrows (or the right half) for orange, first to 1500 m. Rubber band
  (`rubberBand`): at 60 m apart the leader cruises 6% slower and the chaser 16% faster, less
  when closer; a perfect bot against one that never presses stays within ~120 m and still
  wins every time (`race.node.js`). One shared camera framing both until that would zoom out
  past 0.55 of the usual view, then a half each, joining again once they are closer.
- **Endless can't be lost by a good player**, and that is fine (Amber, 2026-10-14): the
  blackout tops out at 1000 px/s against a 1300 px/s cruise; a player who never presses is
  caught after about 4.4 km.
- Speed comes from flow, not from pumping: a ball that never presses goes about 0.85x as
  far as one that does (the in-page mechanic case keeps that ratio honest).
- A near miss (Good) keeps speed but gains no flow; only a slam loses it.
- Track pieces know their own height, slope and curvature exactly, so lift-off happens
  where the physics says, not at a polyline kink.
- Every track but Sprint's comes from a seed; the address carries the current one, so
  a link is the track in front of you. Sprint is always `SPRINT_SEED`.
- Shards buy ball skins; nothing else carries between runs.

## Art bible

- **Look:** synthwave. Black-violet sky, a striped sun, a magenta perspective grid, one
  glowing tube per zone colour (`ZONES`), changing every 400 m.
- **Light:** everything is additive glow; the ball leaves a trail, Perfects burst lime,
  slams red, fever orange.
- **Type:** wide display face for the title and grades, mono for numbers.

## Open questions

- None from the bot.

## Code

- `sim.js`: `createRoll({ save, on, pickSeed })`: the track builder, the ball's physics,
  the run rules, `predictLanding`. No page access; effects and sound are events.
- `view.js`: the backdrop, tube, ball, effects, HUD, synth sound, input, the panel and the
  ball shop, and the save (`neon-roll-save-v1`).
- Debug handle `window.__neonRoll` (also `window.__game`).
- Tests: `bot.node.js` (every mode, played well), `race.node.js` (the rubber band) and
  `save.node.js` (bests, same seed same track) in Node; eight in-page cases.
- The page's race: `P1`/`P2` hold each player's sim, camera, trail and skin, and `as(p, fn)`
  swaps them in, so the one-player drawing serves both.
