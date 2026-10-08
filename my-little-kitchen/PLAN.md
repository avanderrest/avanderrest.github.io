# My Little Kitchen: plan

A very small cooking game for a small child. Pick one of eleven recipes in the book, fetch
a bowl and fill it from the fridge, the wall shelves and the tap, then mix, roll, bake,
decorate and eat it at the bench.

## The one loop

**Tap things, make something, eat it.** There is no timer you can fail and no score. The
only way to go wrong is to tap the bowl before everything is in, and then the helper says
what is still missing.

Good feels like: shaking far too many sprinkles onto a cake you made yourself, then
eating it in six bites.

## Rules that are deliberate

- Nothing can fail. Mixing, rolling and baking finish however you do them.
- The bowl takes only what the recipe needs, each thing once, and a flavour where there
  is one to pick. Everything a recipe needs is out on its shelves, in its fridge or at
  the tap (`bot.node.js` checks every recipe).
- Once you zoom in on the bowl the camera stays close until it is all gone.
- Three shapes of recipe (`flow()`): tin (mix > bake > ice), flat and iced after (mix >
  roll > bake > ice, and cut for the gingerbread man), flat and topped first (mix > roll >
  top > bake).
- The count of each thing made is the only thing kept; the cooking level is 1 + made / 3,
  purely for show.

## Art bible

- **Projection:** a straight-on painted room (`assets/room.jpg`, 1392x786, every door off)
  with the doors as sprites laid over their gaps; the close-ups are 400x300 scenes on a
  softened crop of the same wall.
- **Source:** all of it is Amber's own art (a mockup, an empty plate and three sheets),
  cut by the scripts in `notes/my-little-kitchen-assets/`. See `ASSETS.md`.
- **Palette:** warm cottage: honey wood, cream, copper, sage, with sweet colours for the
  icing and sweets. Food is drawn in SVG in code, coloured from the recipe's tone.
- **Light:** soft and warm from the window; soft shadows under things on shelves.
- **A new sheet:** ask for the same painted, gently outlined storybook style on a plain
  background, items spaced well apart, then cut it with `cut.py` and check for halos.

## Open questions

- The phone view is still small: the kitchen is a wide picture letterboxed into a tall
  screen.

## Code

- `sim.js`: the ingredients, flavours, icings and toppings, `RECIPES`, `readCounts(get)`,
  and `createKitchen({ counts, on })`: the state (`kit.state`), `freshState`, `recipe`,
  `flow`, `missingList`, `doughReady`, `bakeTone`, `cookLevel`, and the verbs `choose`,
  `add`, `takeBite`, `finished` (which asks for a save). No page access. Recipes name their
  icons (`'cakeCard'`); the view swaps the drawings in.
- `view.js`: the kitchen and its doors, carrying, the close-up scenes and their tick loop,
  the sounds, and the counts in `localStorage` (`mlk-count-<id>`, one key a recipe).
- Debug handle `window.__kitchen` (also `window.__game`), with the sim as `__kitchen.sim`.
- Tests: `bot.node.js` (every recipe made start to finish) and `save.node.js` (the counts,
  including the first version's keys) in Node; `doors`, `eating`, `stocked` in the page.
