# Blackout: plan

A stealth infiltration seen from above on an isometric grid, where nothing moves until you
do. Cut through the wire, take the keycard off its carrier, open the service door, hack
the terminal, and get back out. Five missions: compound, depot, relay, villa, blacksite.

## The one loop

**Read the light, then move.** Every guard's torch is an exact cone you can read, and
every lamp pool is a place you will be seen from across the yard. A move is a choice of
where to stand when the guards next step.

Good feels like: slipping behind the carrier one tile ahead of his torch.

## Rules that are deliberate (Amber's calls, see the blackout notes)

- No turns and no End turn button. Guards step only when you act: one guard step every
  `GUARD_EVERY` (2) moves, every move once the alarm is up. A running step is half a
  move, dragging a body is double. Space is "stay", a move spent standing still.
- Guards never sprint. Everyone moves one tile a tick.
- A guard who glimpses you leaves his route to check the spot, looks about, and walks
  back. The tower sentry climbs down the ladder (the only way on or off) and back up.
- The pistol kills outright. A takedown only knocks out; a guard who finds a knocked-out
  man wakes him (no alarm). A dead man found raises the alarm. Hunters aim before they
  fire.
- The arrow keys are grid steps turned 45 degrees: up is up-left, right is up-right.
  No dotted path to the cursor.
- Every terminal room can be passed without shooting its camera, but only just
  (`terminal.js` searches every timing to prove it).
- The download raises the alarm and is a checkpoint.

## Art bible

- **Projection:** isometric, a tile is a 64x32 diamond; one storey is 54px up. Walls
  stop short of the floor above, and walls between you and the camera are cut down.
  A roofed floor is cut away until you climb to it.
- **Drawing:** all in canvas code from Amber's mockup (`notes/testing notes/blackout
  mockup.jpg`); no sprites.
- **Light:** night. Lamp pools are painted into a light map (4 cells a tile) with real
  shadows; past a short reach everything is fog, and only light gets through it.
  Ceiling lamps are cool, posts and wall lamps warm.
- **Danger reads as colour:** the move grid shows red where you would be seen and blue
  where you would not.

## Open questions

- Seeded run of the bot (`bot.node.js`, dice 7): the relay let it out 4 times in 6 and
  the blacksite 5 in 6, where the unseeded page run got out every time. Both are inside
  the bar (half), but they are the two missions to look at if one feels unfair.

## Code

- `sim.js`: `createBlackout({ records, rnd, on, anchor })`: the five missions as data
  (`loadMission` swaps the map's names: `LEVELS`, `GUARDS`, ...), walls and sight lines,
  the light values, who sees what, your moves, actions, the pistol, noise, the guards'
  tick, the terminal, win / lose / checkpoint, `begin()` and `use()`. A turn is a queue
  of steps that `pump(dt)` plays out (`flush()` all at once). No page access. The map's
  names, `state`, `difficulty`, `mission` and `missionI` are getters and setters.
  `freshRecords()` and `fromV3()` for the save.
- `view.js`: the canvas (floors, walls, light maps, fog), people, previews and tracers,
  the HUD, title and end cards, the terminal's bar, keys and pointer, the camera, sound,
  and the save (`blackout-save-v4`, `blackout-difficulty`, `blackout-sound`).
- Debug handle `window.__blackout` (also `window.__game`), with the sim as
  `__blackout.sim`; `__blackout.seedDice(n)` pins the dice.
- Tests: `bot.node.js` (the look-ahead bot from `playable.js`, run against the sim) and
  `save.node.js` (the record and the checkpoint) in Node; eight page cases.
