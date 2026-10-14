# My Little Kitchen: plan

A very small cooking game for a small child. Fetch a bowl and put anything in it from the
fridge, the wall shelves, the cupboards by the sink and the tap; mix it and see what you
made (Little Alchemy style), or follow a recipe you have found from the book. Then mix,
roll, bake, decorate and eat it.

## The one loop

**Tap things, make something, eat it.** There is no timer you can fail and no score. The
only way to go wrong is to tap the bowl before everything is in, and then the helper says
what is still missing.

Good feels like: shaking far too many sprinkles onto a cake you made yourself, then
eating it in six bites.

## Rules that are deliberate

- Nothing can fail. Mixing, rolling and baking finish however you do them.
- **Finding recipes by mixing** (Amber, 2026-10-14). With no recipe picked the bowl takes
  anything; tapping it mixes. Exactly a recipe's things (a flavour too, where it takes one)
  finds that recipe: it goes in the book and you go on and make it. Two things or more right
  and no more than two out (`nearest`) puts that recipe in the book with what you got right
  and a question mark for the rest. The cake and the pizza are known from the start, and
  anything already made counts as found. Saved as `mlk-book` ({ known, hints }).
- The bin on the floor by the sink empties the bowl, or takes back what you are holding.
- **The book is put away in the kitchen**: a little closed book in the corner (found/11),
  opening over the room. A found recipe can be followed; a card in the corner then ticks
  off what it needs, and its cross goes back to mixing freely. In the close-ups the book is
  the tool tray as before.
- Everything is always out, in the same places (`STOCK`): six dry goods on the left wall
  boards, seven cold things in the fridge, yeast, spices and the four flavours in the pair
  of cupboards by the sink.
- **Stirring** follows your finger round the bowl; what counts is how far round it goes
  (about two turns), and the things in the bowl swirl round with it before they vanish into
  the batter. The Stir! button stirs by itself while held.
- **Baking is in the room's own oven**: the camera goes to it with the worktop in view, the
  painted door drops open, the tin slides in, the door shuts, the window glows (the food
  shows through it) and a kitchen timer on the worktop ticks round.
- Following a recipe, the bowl takes only what it needs, each thing once, and a flavour
  where there is one to pick (`bot.node.js` checks every recipe can be made from STOCK).
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
  including the first version's keys) in Node; `doors`, `eating`, `mixing` (finding recipes,
  clues, the bin, following one from the book), `stocked` in the page.
