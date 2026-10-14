# The Corner Shop: plan

Run a little corner shop. Order stock in, set the prices, keep the shelves full, and work
the till: scan, bag, take the coins. Nobody says how the day went until closing time.

## The one loop

**A day at the till, then an evening with the notebook.** During the day it is hands-on:
items over the scanner, into the bag, coins off the counter, a dash to the stockroom when
a shelf runs low (which leaves the queue waiting). In the evening the notebook says what
people thought (too dear, sold out, wished you stocked something) and tomorrow's weather,
and the player orders for the morning. The satisfaction is a day where the order was
right and nobody went without.

Good feels like: a queue that moves because the player is quick, a profit that comes from
reading the notebook, and the weather mattering (umbrellas in the rain, lollies in a
scorcher).

## Rules that are deliberate

- Customers keep their opinions to themselves while they shop; you only see their thought
  bubble and their face. Everything is written up at closing.
- An empty shop can fetch its first order itself (cash and carry), straight into the
  stockroom. Otherwise orders come by van: placed before opening they arrive as you open,
  placed during the day they arrive tomorrow.
- Fresh goods age in the stockroom and are binned when they go off; hot food is binned at
  closing.
- Two mornings in the red and the landlord changes the locks.
- Reputation is earned, not banked (2026-10-14; a perfect clerk used to reach 98): each
  sale adds less the higher it already is, an empty shelf a customer wanted costs a little,
  and it fades overnight by 2 plus 15% of anything over 50. It sets what people will pay
  (0.92x at nothing to 1.10x at 100) and how many come. A perfect clerk settles near 75.
- Seasonal lines (Easter eggs, fireworks, crackers) are only at the wholesaler in season.

## Art bible

- **Projection:** front elevation, a painted room plate (`SCENE_W = 1020` plate px is the
  scene's logical width; every CSS position is read off the plate).
- **Light:** warm daylight through the shop window; the window shows a painted street per
  weather (`assets/window/`).
- **Palette:** `style.css` `:root`: warm wood, cream paper, striped awning.
- **People:** five painted characters off Amber's sheet, plus re-dyed copies (Mia and Leo
  in other clothes) so each of the ten customer types has a look; `faceSvg` in `view.js`
  is the fallback for anyone not covered. Front, side/back and walk poses.
- **Goods:** one painted icon per product in `assets/goods/`, shown at about 40px on the
  shelves and belt, so bold silhouettes.
- **A new sheet:** front elevation like the plate, on a solid mid-grey background, pieces
  in a grid; characters in front, side and back poses.

- **After her mock-up of 2026-10-14** (`images/minigames/new/Gemini_..._42y72342y72342y7.jpg`): a red
  brick wall and two strip lights behind the scene; the till's words go big and green on the
  painted monitor's glass with a progress bar, and the total on the pole display above it (the
  old screen box had drifted off the monitor when the counter was repainted). The receipt
  lines are no longer shown; the prices are on the belt tags. This is a reskin of the till
  game; the shop-floor rework pinned in `ideas/for later` would replace the scene.

## Open questions

- Possible future direction (Amber, 2026-10-14): rework it as a shop-management game seen
  from above. The heart moves from the till to running the shop and restocking. The player
  walks around the floor as the shopkeeper, carrying stock out and putting it on the shelves
  by hand, and lays out the shelves themselves, with customers walking their own paths around
  them (as in the tycoon games, GassedUp, Prison Architect), so where a shelf stands changes
  who finds what. Keep the evening notebook, the weather and the van. The player does
  everything, no staff: the till is often empty, and when someone is waiting there you run
  back before they lose patience, so stocking and serving pull against each other.
  **View (agreed):** a high three-quarter view with the walls cut away, not strictly
  top-down and not isometric: shelf fronts show their goods, so stock levels read at a
  glance, and the floor stays easy to place on and tap. Concept mockup (Gemini, 2026-10-14):
  `images/minigames/new/Gemini_Generated_Image_7wcoby7wcoby7wco.jpg`. Still open: what
  replaces the front-view plate art, and how it stays distinct from Coffee Rush and
  Donut Works. (ideas/reddit)

## Code

- `sim.js`: the shop (`createShop({ saved, rnd, on })`), no page access.
- `view.js`: the painted shop, the lane of customers, the till, panels and overlays.
- Debug handle `window.__shop` (also `window.__game`).
- Tests: `bot.node.js` (a fortnight of careful trading), `save.node.js` in Node; `day.js`
  (a perfect clerk's day adds up), `neglect.js` (an unattended till) in the page.
