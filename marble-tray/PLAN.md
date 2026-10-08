# Marble Tray: plan

Three games on a walnut tray of green baize, on a small rigid-body simulation: a match for
the coloured holes, a maze to push a little marble through with a big one, and bowls
rolled at a ring of circles painted on the cloth, as at curling.

## The one loop

**Steer one heavy marble to move the others.** In the match you drive a shooter into
marbles to pot them; in the maze you push a little marble through rails with a big one;
at bowls you pull back and flick. The physics is the game: weight, angle and how hard.

Good feels like: a soft tap that rolls a marble the last inch into a hole.

## Rules that are deliberate (Amber's calls, see the marble-tray notes)

- No sandbox since 2026-10-01: three games, each with only the panels it uses.
- A key is on or off, so the shooter's cap winds up the longer you hold: a tap is a soft
  shot, a lean rides across. Shift is gentle, and on its own a brake.
- A ringed hole pays whoever owns the ring, whoever potted the marble.
- A match ends when the last marble is down; if nothing moves for a while the tray shakes
  itself, and after enough shakes a pinned marble is lifted to the middle.
- Mazes need a 45-degree rail across every bend, holes pocketed against blind ends, and no
  turn off the bar of a T (seeds with one on the way are skipped).
- Bowls: first to five; the pull is in distance, not speed.

## Art bible

- **Projection:** straight down onto the tray.
- **Materials:** walnut rim and baize cut from Amber's plates (`assets/`), flattened before
  tiling; brass screws and the brass goal hole; rails in the same walnut.
- **Marbles:** drawn in code with a highlight, a shadow and the team's colour (sky for
  you, rose for the other side).
- **Light:** soft, from the top left; the tray leans a few px when it shakes.

## Open questions

- The page's maze bot gets through mazes 1 to 5 and never 6 to 8, and maze 5 has taken it
  anywhere from 130 s to more than 600 s on different dice. The later mazes may be fine
  for a person, but nothing checks that they can be finished.
- At bowls, a player who only ever draws to the button (the bot) beat the keenest
  computer on one of three seeds.

## Code

- `sim.js`: `createTray({ store, rnd, on })`: bodies, collision and the impulse solver, the
  maze generator, the three games and both computer players, and `tick(dt)` (one frame:
  countdown, steering from the keys, the computer, the physics in substeps). No page access.
  `mt.mode`, `mt.ctrl` and the key state are getters and setters.
- `view.js`: the case and everything on it, sound, the panels and result card, keys and
  pointer, the tray's lean, and the store (`marble-tray-save-v3`).
- Debug handle `window.__tray` (also `window.__game`); `__tray.seedDice(n)` pins the dice.
- Tests: `bot.node.js` (matches and bowls to the end) and `save.node.js` (best times and
  the maze reached) in Node; seven in-page cases, of which `maze` takes about six minutes.
