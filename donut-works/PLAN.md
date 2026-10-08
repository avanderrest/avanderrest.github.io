# Donut Works: plan

A small donut factory on a painted isometric floor. Lay machines and belts, dough goes in
one end and money comes out the other; orders from the shop unlock glazes, fillings and
toppings, and a splitter lets one line fan out into several silly variants.

## The one loop

**Build a line, watch it run, see what it is short of, change one thing.** The fryer is
slow, so a second fryer doubles the rate; a recipe needs a glazer *and* a topper; two
toppings means two toppers in a row. The satisfaction is a line that runs clean, and the
comedy is what the customers say about a donut with a whole pickle on it.

What good feels like: placing a machine shows exactly where it will push (arrows on the
floor), a jam shows a red badge that says *why* on hover, and every sale floats its price
and a quip. Nothing should ever be stuck without the game saying so.

## Rules that are deliberate

- Placing anything over an occupied tile replaces it, with the same half refund as a
  take-back. Painting a belt run never swallows a machine.
- Counters must touch each other: the shop front is one bank of tills.
- A second fry chars a donut; a second filling or topping pass only nudges the price
  (`DOUBLE_PASS` in `sim.js`).
- Below `CASH_FLOOR` (-£3) the mixer stops: the factory cannot dig an endless hole.
- After the twelfth order the shop keeps issuing ever-larger standing orders.

## Art bible

- **Projection:** isometric, on Amber's painted room plate. The floor was re-laid as
  75 x 37.5px quarry tiles on the game's own 12 x 8 grid (`OX`/`OY` in `view.js` must agree
  with `notes/donut-works-assets/slice.py`).
- **Light:** warm, soft daylight from the window on the right; terracotta floor, cream
  plaster, timber frame, fairy lights.
- **Palette:** `PAL` in `view.js` (ink `#5d4030`, wood, sage rails, rose accents);
  `style.css` `:root` for the chrome.
- **Type:** Nunito for the interface, Patrick Hand for hand-written tags and quips.
- **Sprites:** Amber's own sheets, in `images/` (machines, donut stages, toppings). Machines
  face down-left by default; `LOOK[type].nat` lists the facings each is drawn in, and
  anything else is mirrored. Shown at about 50–100 scene px wide.
- **No people.** Bakers were tried and removed at Amber's request (2026-10-02).
- **A new sheet:** isometric, same down-left facing, on a solid background far from cream
  and terracotta (mid grey works), laid out in a grid.

## Open questions

- The specials board pays double for one recipe at a time; there is no sign yet of
  whether players notice it.
- Free play after the twelfth order is standing orders only.

## Code

- `sim.js`: the factory (`createFactory({ saved, rnd, on })`), no page access.
- `view.js`: the room, belts, machines, panels and input. Steam is decoration and lives here.
- Debug handle `window.__donut` (also `window.__game`).
- Tests: `bot.node.js` (one line through the first six orders), `save.node.js` in Node;
  `levels.js`, `line.js`, `look.js` in the page.
