# Wayside: plan

A road-laying walk, after Loop Hero and Carcassonne. Pick one of three cards, lay it beside
you, step onto it. The coast runs east chapter after chapter, each ending in a barrier with
one way through, and every third chapter has a dark lighthouse to light.

## The one loop

**Lay a card, take a step, find out what was under the mist.** Each chapter is a small
errand puzzle: a river wants a boat (oars → fisherman), a wall wants a key (mushrooms →
hermit), a gorge wants planks (axe → woodcutter), a briar wants honey, a mountain wants a
lantern (pick → miner). Every errand can also be bought from the pedlar or fought through.

Good feels like: reading a signpost, knowing what you are looking for, and laying the road
north for a while because something up there is worth it.

## Rules that are deliberate

- One card laid per step taken. Walking over old ground is never rationed.
- Falling is not losing: you wake at the last campfire or lighthouse, and every card you
  laid is still there.
- The only thing that carries between walks is lamps lit, all told: each milestone adds a
  card kind to the deck for good (`LAMP_CARDS`).
- The land is the seed's. Each chapter is laid out from `streamFor(seed, 'ch' + i)`, so a
  `#seed=` link is the same coast for whoever opens it, however they lay their road.
  Card draws, fights and finds come from separate dice.
- A companion (Maren, Brin, Ivo) lays one card after each of yours, walks only on ground
  that is face up, joins fights when alongside, and opens one kind of barrier for free.

## Art bible

- **Projection:** top-down, 16 px tiles, scaled up by whole numbers only. Sprites are 16x16,
  hand-typed pixel rows in `sprites.js`, drawn at 2 screen pixels per sprite pixel.
- **Palette:** the `ART.PAL` letters in `sprites.js`. Night-blue mist (`#080a16`) over
  everything that is not face up.
- **Standing sprites** sit near the bottom of their tile and smaller than it. Only ground
  cover (flowers, tracks) fills the tile.
- **A new card** needs a sprite, a spent sprite if it can be used up, and a base ground. The
  `art` test fails on any name that draws nothing.

## Open questions

- A hand of three Sliplines can never be played (Slipline needs a non-action card to leave
  on the ground), so laying stops for good. It is about a 1-in-12,000 hand, but it is a
  dead end. A fix: let Slipline swap with the deck when the hand has nothing to give.
- Companions all use Maren's sprite.

## Code

- `sim.js`: `createWayside({ saved, best, seed, rnd, on })`, no page access. Dialogues are
  data (`w.dlg`: title, say, options) and `w.chooseOption(i)` picks one. A fight's pause
  between turns is the view's: the sim emits `battle-wait` and the view calls
  `battleResolve()` after it.
- `view.js`: the canvas, the mist, the tray, the overlays, input, and the two timers (the
  companion's idle turns, and walking them over to a fight).
- Debug handle `window.__wayside` (also `window.__game`); `__wayside.sim` is the sim.
- Tests: `bot.node.js` (five seeds walk six chapters and light a lamp), `save.node.js`
  (round trip, same seed same coast, old saves) in Node; `art.js`, `chapters.js` in the page.
