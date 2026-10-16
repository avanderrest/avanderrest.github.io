# The Corner Shop: plan

Run a little corner shop on foot. Carry stock out of the stockroom onto the shelves, set the
prices, order for tomorrow, and get back behind the till whenever somebody is waiting to pay.
Nobody says how the day went until closing time.

This is the sequel to the till game (rebuilt 2026-10-14/15 from Amber's mock-up,
`images/minigames/new/Gemini_Generated_Image_7wcoby7wcoby7wco.jpg`). The till game's economy,
notebook, weather, seasons, orders and coin-taking all carried over; its front-view painted
room did not. Its saves load (v1 → v2: its shelves land on the facings a new shop comes with).

## The one loop

**Stocking and serving pull against each other.** You are the only one in the shop. Shelves
empty as people shop them, and the only way to fill one is to walk to the stockroom, pick up a
box, carry it to the shelf and stack it. Meanwhile customers queue at the counter, and the
till only works with you behind it. A good day is one where the shelves never quite ran out
and nobody was kept waiting, because you read the floor and picked your moments.

Good feels like: dashing a box of milk out to a bare shelf while someone stands there with a
thought bubble, and getting it there in time; a queue that moves; an order that was right.

## Rules that are deliberate

- **Stock moves by hand, always** (Amber, 2026-10-15). There is no fill-everything button,
  not even before opening. A box holds what its shelf has room for, a box at most.
- **A box goes on any empty shelf, or tops up its own** (Amber, 2026-10-15). An empty shelf
  (nothing on it, or sold out) takes whatever you carry and becomes its shelf, as well as
  any it already had. A shelf still holding something else refuses it. Every shelf the
  box could go on glows.
- **The till is the keeper's place, not a menu.** Scanning, bagging and taking coins need the
  keeper standing behind the till. Anywhere else the till strip is an information board:
  what to do next (urgent red when someone is waiting: a warning, not a button, Amber
  2026-10-15), the four lowest shelves, and how many are shopping and queueing. Walk back
  yourself.
- **You walk into the stockroom** (Amber, 2026-10-15). No picker: six pallets (four on the
  back wall, one on each side wall, each reached straight on, with a clear way round: she
  found corner pallets hard to reach), two sides each. Tap a stack, or press E beside it, to
  lift a box. With a box in your arms, tap **any free side** (marked) to put it there; a
  product can stand on more than one side. Stacks for shelves running low glow. The side wall
  is on a tile edge, so the walking code knows about it (`inSideWall`, `crossesSideWall`).
- **The keeper serves from the front of the counter** (the bottom, Amber 2026-10-15), back to
  us; customers queue along the far side facing us.
- **Orders only while shut** (evening and morning): the tab hides while the shop is open.
- **The canvas is the building**: side walls on its edges, no street, awning or window
  boxes; cobbles show only through the door.
- **Next to the counter is close enough** to use the till: standing still behind it or at
  either end, not on the customers' side.
- **A product can have several shelves** (Amber, 2026-10-15): stock is counted per facing
  (`state.stock[i]`). Customers go to the nearest shelf of it with stock, and walk to another
  if theirs is bare before waiting.
- **No Shelves tab** (Amber, 2026-10-15): the floor shows what is on each shelf. The side
  panel is Orders, Prices and Notebook.
- **No shelf chooser** (Amber, 2026-10-15). Shelves are arranged by hand: before opening, a
  tap on a stocked shelf with empty arms takes its things off into a box, to stack elsewhere
  or put back. During the day shelves only take stock.
- **Messages go in the box on the counter strip**, not a line of their own: the shut banner
  shows the latest for five seconds, then its standing words; open, the info board does.
- Off-shelf products in the Orders tab are not greyed out: ordering one is how a new line
  comes in, since any empty shelf takes any box.
- **Shut, the morning's word and Open sit on the counter strip**, and the floor stays clear
  and tappable (no dimming). No dotted walking path on the floor.
- **The keeper is never locked in place**: any move interrupts picking up or stacking.
- **Pick up, over the scanner, into the bag.** A click picks a thing up and it follows the
  pointer until the next click (Amber, 2026-10-15: she expected a click to lift it, and the
  old click-to-scan shortcut put a tick on instead); press-and-drag works too.
- Customers go shelf to shelf, nearest first. At a bare shelf they wait a few seconds
  (`SHELF_WAIT` x their patience) with a thought bubble, so a quick restock saves the sale.
- Patience runs from when they reach the counter, whether you are there or not.
- Customers keep their opinions to themselves; you see bubbles and faces. Everything is
  written up at closing, in the notebook.
- An empty shop can fetch its first order itself (cash and carry), straight into the stockroom.
  Otherwise orders come by van: before opening, they arrive as you open; during the day,
  tomorrow.
- Fresh goods age in the stockroom and are binned when they go off; one-day goods are binned
  at closing. Two mornings in the red and the landlord changes the locks.
- Reputation is earned, not banked: each sale adds less the higher it already is, and it fades
  overnight by 2 plus 15% of anything over 50.
- Shelves are facings: one product each. Fourteen spots on the floor; the shop comes with
  eight, **empty** (Amber, 2026-10-15): whatever you first carry onto one is what goes
  there. The rest are pallets that take a shelf for £45. Where a product sits matters: the far shelves
  are a long walk from the till.

## Art bible

- **Projection:** high three-quarter, walls cut away. A floor tile is 48 x 36 px on screen
  (`TW`, `TH` in `art.js`). Anything with height is a front face standing up from its front
  edge with its top face above. Draw order is by where things touch the floor.
- **Everything is painted in code** (`art.js`), except the goods: Amber's painted icons in
  `assets/goods/`, stood on the shelves one per unit in stock, so levels read at a glance;
  and her decor (`assets/decor/`, 2026-10-15): the back wall's posters, clock (its hands
  are code and follow the day), noticeboard, calendar, ivy and window, the pot plants, the
  stockroom's racking, and the produce stand every table is drawn as, its goods heaped in
  the crates and clipped at each crate's lip. Shelves, counter and people stay in code
  because they change as you play.
- **Palette:** honey floorboards, cream wall tops (`#fbf2df`), striped paper back wall, walnut
  shelves, dark panelled counter front (no plaque: Amber, 2026-10-15), blue-grey cobbles outside, red and
  cream awning. Page chrome (`style.css` `:root`) is unchanged from the till game.
- **Light** comes from the back left: every fixture throws a soft shadow forward and to the
  right, with a dark contact line at its base (`castShadow`), and the floor darkens towards
  the walls. Each floorboard has its own tone and grain. The stockroom is lit by one bare
  bulb, with her grey racking of boxes on its back wall (scenery; only the pallets are stock).
- **A facing with no shelf fitted** is a bare pine plinth inside the shelf's chalked outline,
  tagged with what fitting one costs. It must not look like a fitted empty shelf, which you
  can stock.
- **People** (2026-10-15) are her twelve characters (`assets/walkers/`), each standing front,
  side and back, about 76 px tall. They walk by moving the legs of that one pose (Amber's
  idea, instead of generated walk frames): below the hips, the columns the feet stand in lift
  in turn from in front or behind, and scissor from the hip side on, the far leg darker. Arms
  stay still. `CAST` in `art.js` says which characters play each sort of customer; the keeper
  is the one in the apron. The basket and the keeper's box are still drawn in code over
  them. The code-built people (legs, arms from the shoulder, hair, hats, mood mouths) are the
  fallback while the pictures load. They lose the mood faces: bubbles carry that now.
- The old till game's art (painted room, counter, clock, window, people sheet, HUD) is still
  in `assets/` but nothing loads it any more; see `ASSETS.md`.

## Open questions

- The bot (a keeper who always runs back for the till, and restocks the emptiest shelf
  otherwise) makes £8 to £24 a day and loses nobody at the till. That may be too forgiving
  for a human, or not forgiving enough; watch a real playthrough.

## Code

- `sim.js`: the shop (`createShop({ saved, rnd, on })`), the floor plan, walking (Dijkstra
  over tiles, pulled taut), customers and the till. No page access.
- `art.js`: all the painting.
- `view.js`: the canvas loop, taps and keys (WASD / arrows, E or Space), the stockroom picker,
  the till strip, the side panel and overlays. Debug handle `window.__shop`.
- Tests: `bot.node.js` (a fortnight on foot), `save.node.js` (v2 round trip, v1 import),
  `neglect.node.js` (an unattended till), and in the page `day.js` (a first day adds up),
  `carry.js` (stockroom to shelf by real taps), `drag.js` (milk dragged across the scanner
  into the bag). `_hands.mjs` stocks the shelves on foot for the Node cases.
