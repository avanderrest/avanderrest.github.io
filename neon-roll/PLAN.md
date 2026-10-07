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

- Four modes: Endless (outrun the blackout), Air Time (two minutes, score is time aloft),
  Sprint (one fixed 1500 m course, race your best), Gaps (kickers over breaks in the tube).
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

- **Endless can't be lost by a good player.** The blackout tops out at 1000 px/s
  (`CHASE_MAX`), and the ball cruises at 1300 px/s at no flow at all. A player who never
  presses is caught after about 4.4 km (3.5 minutes); the Node bot, pressing and diving
  well, was still rolling after 20 minutes and 31 km on three tracks. The menu promises
  it "keeps getting faster": letting `CHASE_MAX` climb past cruise after a few minutes
  would make that true.

## Code

- `sim.js`: `createRoll({ save, on, pickSeed })`: the track builder, the ball's physics,
  the run rules, `predictLanding`. No page access; effects and sound are events.
- `view.js`: the backdrop, tube, ball, effects, HUD, synth sound, input, the panel and the
  ball shop, and the save (`neon-roll-save-v1`).
- Debug handle `window.__neonRoll` (also `window.__game`).
- Tests: `bot.node.js` (every mode, played well) and `save.node.js` (bests, same seed same
  track) in Node; seven in-page cases.
