# Donut Works: plan

A small donut factory, seen from straight above. Lay machines and belts, dough goes in
one end and money comes out the other; orders from the shop unlock glazes, fillings and
toppings, and forking a belt lets one line fan out into several silly variants.

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
- Selling is the hatch in the right-hand wall (rows `HATCH_ROWS`): a belt run off the floor
  into it sells, free from the start. A Boxing Station (type `counter`, for old saves) sells
  the same from anywhere; the only price is £1 to place one (Amber: no charge per box).
- No splitter or joiner (removed 2026-10-08, Amber: "it can be handled through the placement
  of the conveyers"). Belt shapes come from neighbours (`shapeOf` in `sim.js`): a belt with
  belts leading away off its side curves into them (a fork if the line also carries on
  ahead, else a corner or a Y), and items pick a way in turn as they come on; a belt fed
  from a side as well as from behind, or from both sides, is a merge with the side lines
  curving in. The ghost under the pointer shows the shape a belt would take (`shapeIf`).
  Old saves turn splitters and joiners into belts and refund 2.40 each.
- A belt that meets a machine, or the hatch, runs on underneath it.
- A second fry chars a donut; a second filling or topping pass only nudges the price
  (`DOUBLE_PASS` in `sim.js`).
- Below `CASH_FLOOR` (-£3) the mixer stops: the factory cannot dig an endless hole.
- After the twelfth order the shop keeps issuing ever-larger standing orders.

## Art bible

- **Projection:** straight top-down (since 2026-10-08; it was isometric on her room plate
  from 2026-10-02, which made the line hard to read). One floor tile is one game tile
  (`T` = 60 scene px), so every machine sits inside its own square and the grout is the
  grid. Machines show a sliver of front face for depth; their bodies never rotate (the
  light stays put), only the chute on the side they push out of.
- **Show the work:** each machine shows what it is doing from above: dough in the mixer
  bowl, the ring cutter coming down, the donut in the oil, the glaze bath in its flavour,
  toppings in the hopper, the piping bag in the filling's colour.
- **Room:** a terracotta floor exactly the size of the grid in a brown timber wall base,
  whitish plaster everywhere round it, and the hatch to the shop standing mostly outside
  the right-hand edge. No back wall. The build panel floats on the right as a cream card
  in a plain timber frame.
- **Palette:** `PAL` in `view.js` (ink `#5d4030`, wood, sage rails, rose accents);
  `style.css` `:root` for the chrome.
- **Type:** Nunito for the interface, Patrick Hand for hand-written tags and quips.
- **Pictures:** only Amber's donut and topping pictures (`images/d`, `images/t`), which were
  drawn from above. Everything else is painted in `view.js`.
- **No people.** Bakers were tried and removed at Amber's request (2026-10-02).
- **A new sheet:** drawn from directly above, on a solid background far from cream and
  terracotta (mid grey works), laid out in a grid. A machine has to read inside one square.

## Open questions

- The specials board pays double for one recipe at a time; there is no sign yet of
  whether players notice it.
- Free play after the twelfth order is standing orders only.

## Code

- `sim.js`: the factory (`createFactory({ saved, rnd, on })`), no page access.
- `view.js`: the room, belts, machines, panels and input. Steam is decoration and lives here.
- Debug handle `window.__donut` (also `window.__game`).
- Tests: `bot.node.js` (one line through the first six orders), `save.node.js` in Node;
  `levels.js`, `line.js`, `look.js` (pictures load, picking, floor/grid agreement) in the page; `shop.node.js` (hatch, forks, boxing, old saves) in Node.
