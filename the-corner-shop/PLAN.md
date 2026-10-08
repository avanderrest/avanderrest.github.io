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

## Open questions

- Reputation rises quickly with a perfect clerk (98 after a fortnight in the bot test);
  there may be room for it to matter more, or to be harder to keep.

## Code

- `sim.js`: the shop (`createShop({ saved, rnd, on })`), no page access.
- `view.js`: the painted shop, the lane of customers, the till, panels and overlays.
- Debug handle `window.__shop` (also `window.__game`).
- Tests: `bot.node.js` (a fortnight of careful trading), `save.node.js` in Node; `day.js`
  (a perfect clerk's day adds up), `neglect.js` (an unattended till) in the page.
