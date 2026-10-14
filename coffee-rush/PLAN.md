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
  the counter, an L (2026-10-14): a till end beside the queue and a bar across the room,
  with a gap of floor below. Machines go anywhere right of it and behind the bar; what is
  put down sits in a row along the bar's top, reached from behind it.
  A machine may stand partly behind the bar, so long as its cabinet's brown worktop stays
  behind the bar's brown top (Amber); nobody walks through the bar itself.
- Nothing is placed for you: the machines arrive in crates and you drag each onto the
  floor. Every machine has to stay reachable, and nobody orders what is still crated; the
  day will not open on a crated machine without saying so first ("Open anyway").
- No grid (Amber, 2026-10-14): a machine goes anywhere right of the counter, snapped to a
  quarter tile, and is refused (red) only for overlapping another machine or the counter, or
  for leaving something out of reach. Reachability is a quarter-tile walk grid with the
  player's radius (`walkGrid`, `layoutWorks`), and the player and Sam always start on a
  reachable spot (`freeSpawn`), so a machine dropped where they stood cannot trap them.
- Machines turn (tap one, the Turn button, or R): front, right, left. A turned wide machine
  stands two deep; turned machines are drawn side-on, her picture narrowed and mirrored for
  left. Sam uses a machine from the side it faces. Saved as `[c, r, turn]`.
- No plates on the counter: what is put down sits on the wood.
- New kit arrives on set days (`UNLOCKS`); upgrades for kit you do not own stay out of
  the shop until it does.
- Sam (the hired helper) starts wanted orders, collects what is ready and runs it to the
  counter, two things at a time, at 160 (you walk at 200); level 2 is roller skates (220),
  level 3 an apron: three at a time and half the pause at each machine. Until 2026-10-14 he
  carried one at a time at 125 and a Sam-only cafe stalled at day 6; the player is still
  meant to work from about day 8.

## Art bible

- **Projection:** front-on three-quarter view, Amber's painted room (`assets/room.jpg`) at
  three-quarter size, back wall rows 0-3.
- **Machines:** stand on cabinets one tile deep, drawn well above their footprint, with a
  brass-and-wood plaque. The ovens are her front-on sheet (2026-10-14), emptied for idle.
- **Counter:** her picture drawn whole at one scale, never cut or stretched (her rule);
  `CTR.scale` in sim.js sizes it; the top-right corner of its wood touches the
  front-left corner of the worktop of a machine at the top of the first floor column, and the floor follows.
- **People:** her four character sheets, each person in three moods (happy, checking a
  watch, arms folded).
- **HUD:** cream card, dark green edges, rounded display face.

## Open questions

- None from the bot: Sam alone, with the player standing still, gets a cafe to day 9-10 in
  ten shifts.

## Code

- `sim.js`: the data as plain exports (items, machines, upgrades, the room's size, the
  counter's measurements, `freshSave`), and `createCafe({ save, best, keys, rnd, on })`
  for the running cafe: the floor layout and its reachability, customers, the machines,
  you and Sam, the day, buying. No page access.
- `view.js`: drawing, the HUD, popups, pausing, rearranging the floor, the shop, keys and
  pointer, saving (`coffee-rush-save`, `coffee-rush-best`).
- Debug handle `window.__coffeeRush` (also `window.__game`).
- Tests: `bot.node.js` (ten shifts with Sam) and `save.node.js` (a save rebuilds the same
  cafe) in Node; `service.js`, `layout.js` (no grid, turning, the crate warning) and
  `touch.js` in the page.
