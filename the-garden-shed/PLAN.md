# The Garden Shed: plan

A flower shop in a potting shed, after Potion Craft and Good Pizza, Great Pizza. Grow
flowers in the garden, make them up in the shed, and sell them at the stall to people who
want to say something with them.

## The one loop

**Somebody asks, you work out what they mean, you say it in a vase.** Every flower means
something (the Language of Flowers on the table) and every colour says something quieter;
a customer says what it is for, and sometimes a good deal more ("no roses, long story").
Making it up is hands-on: drag a vase onto the table, drag stems into it, watch the
"It says" bars move. Between customers the garden wants watering and cutting.

Good feels like: reading a story at the counter and knowing which flowers answer it, and
a customer's reply that shows the bunch said the right thing.

## Rules that are deliberate

- Time is customers, not a clock: a growing spell every two customers, a day every six.
  With the stall closed the garden still gets the time.
- A flower counts twice what its colour does; a ribbon counts like a colour. Close
  feelings count half, opposite ones count against.
- Stars: up to two for saying the right thing, one for a proper bunch; a hard
  requirement missed caps it at one; tired stems cost one.
- No popups for arranging or talking: everything happens on the three screens.
- No order is needed to make something; set-aside bunches sit on the stall for browsers.

## Art bible

- **Projection:** front elevation. The shed is Amber's painted plate (1376 x 768; the
  scene's logical pixels are the plate's). The garden and stall are CSS stand-ins with her
  props, waiting on plates of their own.
- **Light:** warm afternoon, fairy lights, a sleeping cat; the weather shows through the
  door.
- **Flowers and vases:** her painted stems (`assets/flowers/<flower>-<colour>.png`, one
  120x240 canvas each with the cut end at bottom-centre) and painted vases, bows and reels
  (`assets/art/`). Drawn SVG heads remain in `view.js` for anything wanting a head alone.
- **People:** painted from the waist up (`assets/people/`), one per regular and per kind of
  walk-in.
- **A new sheet:** front elevation, solid mid-grey background, pieces in a grid. Stems as
  single upright flowers on their own canvas.

## Open questions

- **Money stops mattering.** In the bot test a careful player banks about 2,000 coins in a
  fortnight, and seed costs 2 to 6. More to spend it on (bigger pots, a cold frame, better
  vases) or tighter pay would keep the tin interesting.
- On a phone the shed shows a lot of empty wall above the table, and "Nothing cut yet"
  appears twice (the table note and the bar).

## Code

- `sim.js`: the shop (`createShed({ saved, rnd, on })`), no page access. The lane's timing
  is wall-clock and lives in the view; the sim says when it wants a customer soon.
- `view.js`: the three places, drawing, dragging, the dialogue bubble.
- Debug handle `window.__gardenShed` (also `window.__game`).
- Tests: `bot.node.js` (a fortnight of careful floristry), `save.node.js` in Node;
  `plate.js`, `shop.js` in the page.
