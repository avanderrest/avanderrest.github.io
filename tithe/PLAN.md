# Tithe: plan

A side-on thief game: a run across the rooftops of a medieval town at night, a window you
step through into a single painted room, and a choice at the end. Three contracts, Abbot
Crane, Magistrate Voss and Countess Marrow, then an ending that weighs the blood you shed
against the silver you gave away.

## The one loop

**Climb, slip in, take, decide.** Outside you run, jump and hang across the roofs past the
guards; at a lit window the game turns into a point-and-click room; at the end of the street
the target waits, and what you do with them and with the silver is the other half.

Good feels like: hanging under an eave while a guard walks over your fingers.

## Rules that are deliberate (Amber's calls, see the Tithe notes)

- The outside is a rooftop platformer: she moves freely over a 16px grid, sprints if you
  keep running, and her hands catch any hold they pass. Walking off a ledge catches it;
  sprinting off flies. A hay cart is soft from any height.
- Every timbered house's windows stack into a ladder from the street to the eave; the
  alleys between houses are what you jump.
- Guards see along their own row. Hang below their feet and they walk over you.
- She only kills if she chose to pick up a knife. Without one, E chokes a guard out.
- Ways to deal with a target are found as intel on the way; the journal lists each with
  what it still needs. The target's window stays shut until you carry what the contract
  requires.
- Each contract ends execute, blackmail or spare, then give or keep the silver; the
  ending reads chaos (kills, innocents, executions, alarms) against given and kept.
- Sparrow marks are checkpoints. A death costs nothing but the way back to the last one.

## Art bible

- **Projection:** side-on, 384x216 game pixels, 16px cells. Rooms are a single wall in
  perspective (`proj`), the window she came in by behind the camera.
- **Drawing:** everything in code. Layers: sky and moon, a far skyline with the level's
  landmark (parallax 0.2), a back row of houses (0.5), then the playing row. Each level's
  `houses: [x, w, eave, roofRows]` is what the painter reads; edit the map and keep the
  list in step.
- **Palette:** moonlit stone and timber, each contract its own (`art` on the level:
  stone, moss, sky, the guards' tabard). Every hold has the same pale top edge.
- **People:** a procedural rig styled after Amber's references: Wren with loose auburn
  hair, a brown leather jacket, satchel and tall boots; guards in kettle hats, mail and the
  level's tabard.

## Open questions

- None from the bot: searching every room that opens finds everything each contract
  requires in two passes, and a gentle run reaches the Sparrow.

## Code

- `sim.js`: `createTithe({ load, on })`: the three contracts (maps, rooms, people,
  methods, finales), the grid (`parseLevel`, `standable`, `reach`), movement (`MV`),
  guards, the window shift, rooms, the confrontation, the fence, consequences and the
  ending, the key state (`keys`, `edge`) and `update(dt)`. Cards go out as data with
  their choices' callbacks. No page access. `S` is the whole state.
- `view.js`: the town art (`buildArt`), people, rooms in perspective, the iris, the cards,
  toasts and HUD, the touch pad and journal, keys, sound, pause, and the save
  (`tithe-save-v1`).
- Debug handle `window.__tithe` (also `window.__game`), with the sim as `__tithe.sim`.
- Tests: `bot.node.js` (three contracts to the ending) and `save.node.js` (the sparrow
  mark, a death, Continue) in Node; seven page cases, `keys` and `reach` among them.
