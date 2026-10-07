# Coffee Rush: plan

Run the counter of a little cafe, after Diner Dash and Overcooked. Customers queue at the
counter; you pull the shots and bake the treats they ask for; between days you spend the
takings on kit and drag the machines wherever you want them on the floor.

## The one loop

**Read the queue, start the right machines, run what is ready to the counter.** Some
things take two steps (an espresso carried to the milk bar is a latte; a latte to the ice
well is an iced latte; a roll to the press is a toastie). Ninety seconds a day; three
walkouts end it early, and you play the day again.

Good feels like: three machines going at once, a tray of the right things, and a tip.

## Rules that are deliberate

- The room is Amber's painted plate, fixed at 21 x 12 tiles of 48px; the window
  letterboxes round it. Customers come in at the painted door and queue down the left of
  a counter that runs from the back wall to the front.
- Nothing is placed for you: the machines arrive in crates and you drag each onto the
  floor. Every machine has to stay reachable, and nobody orders what is still crated.
- New kit arrives on set days (`UNLOCKS`); upgrades for kit you do not own stay out of
  the shop until it does.
- Sam (the hired helper) starts wanted orders, collects what is ready and runs it to the
  counter; level 2 is roller skates.

## Art bible

- **Projection:** front-on three-quarter view, Amber's painted room (`assets/room.jpg`) at
  three-quarter size, back wall rows 0-3.
- **Machines:** stand on cabinets one tile deep, drawn well above their footprint, with a
  brass-and-wood plaque; the counter is her sprite in three slices so only the top
  stretches.
- **People:** her four character sheets, each person in three moods (happy, checking a
  watch, arms folded).
- **HUD:** cream card, dark green edges, rounded display face.

## Open questions

- **Sam cannot carry the cafe past day six.** In the bot test (Sam hired from the start,
  every machine on the back wall, the player standing still, takings spent on Sam's
  skates, patience, speed and capacity) both cafes stalled: one reached day 8 after
  replaying days 5, 6 and failing 8; the other failed day 6 five times running. That may
  be right (the player is meant to work), but if Sam is a reward it could do with a third
  level, or the shop could say what he cannot do.

## Code

- `sim.js`: the data as plain exports (items, machines, upgrades, the room's size, the
  counter's measurements, `freshSave`), and `createCafe({ save, best, keys, rnd, on })`
  for the running cafe: the floor layout and its reachability, customers, the machines,
  you and Sam, the day, buying. No page access.
- `view.js`: drawing, the HUD, popups, pausing, rearranging the floor, the shop, keys and
  pointer, saving (`coffee-rush-save`, `coffee-rush-best`).
- Debug handle `window.__coffeeRush` (also `window.__game`).
- Tests: `bot.node.js` (ten shifts with Sam) and `save.node.js` (a save rebuilds the same
  cafe) in Node; `service.js` in the page.
