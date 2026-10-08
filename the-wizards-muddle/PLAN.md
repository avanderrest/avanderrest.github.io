# The Wizard's Muddle: plan

(Called The Cluttered Study until 2026-10-09.)

A calm I-spy in a wizard's messy study, after *Librarian: Tidy Up the Arcane Library!* and
picture-book hidden-object games. Amber's idea (2026-10-08, `ideas/scavenger hunt.jpg`):
an AI sets riddles, a click beeps like a metal detector, the things can be moved about, and
the AI can take a turn guessing.

## The one loop

**The owl spies something; you read the riddle, look, ping, dig, and tap it.** Between
riddles, and after them, put things away wherever you like. Good feels like the "aha" when
"keeps time but has no hands" turns out to be the hourglass and not the pocket watch you
looked at first, and like arranging a shelf the way you want it.

## Rules that are deliberate

- **The riddle is the puzzle, not the pixels.** Every riddle points at one property, and two
  or three other things nearly answer it (watch/hourglass/candle, ring/bell/coins,
  silver/brass key, feather/quill, scallop/snail shell, toy mouse/cheese). Nothing is hidden
  by being tiny or low-contrast; things hide by being under other things.
- **The detector costs a little.** Five pings, one back every 1.8 s. Without a cost a player
  grids the screen and the riddle stops mattering; with a hard limit it stops being calm.
- **A tap on the answer always counts**, charge or not. A tap where the answer is but
  something lies on top says "right here, underneath": move things aside.
- **No timer, no failing.** Stars per find (three; two after the plain clue; one after the
  glow) are the only score.
- **Nothing has a slot** (Amber, 2026-10-08: "the player chooses if they want to put
  something on the table or a shelf"). Let go of a thing and it falls onto the first shelf,
  sill, desk or bookcase top under it, standing upright, or the floor; a pale copy shows
  where while it is in hand. "Put away" counts everything off the floor; all 180 off is
  "spotless". The surfaces hold about 90 side by side, so a tidy study has things standing
  in front of each other. A thing put
  behind the cauldron comes round to its front. (Until then every thing had one home with
  an outline on a labelled shelf; v1 saves are dropped.)
- **No heaps: never more than three deep** (also hers). The mess is from the seed alone
  (`#seed=` in the URL): each of the 180 things lands at random, about seventy per cent on the
  floor and the rest on the shelves and desk, but never where it would make any spot more
  than three things deep (counted on an 8 px grid). Riddles are picked lazily from their own
  stream per riddle.
- **Turns alternate** (Amber, 2026-10-08): the owl spies, you find it, then it is your turn
  to spy and the owl guesses, with its wings over its eyes while you choose; then the owl's
  next riddle. "Skip my turn" passes. After the owl's eighth riddle and your last turn, the
  card. The "You spy" button only shows once the eight are done.
- **180 things** (doubled twice on her asks): 126 with their own drawing and 54 colour
  variants of the books, potions, toadstools, gems, candles, balls, yarn, socks, feathers,
  scrolls, teacups, apple and key (`VARIANTS` in `content.js`, painted from a `base` in
  `art.js`). Variants are never asked for; they are clutter and near-misses.
- **The owl's turn** (you spy, it guesses) is word matching, not a model: each thing's name,
  tags and everyday synonyms (`content.js`). It reads its own riddles back 95/120 first time,
  111/120 in three.
- **What it looks like counts too** (Amber, 2026-10-08: she thought of the rubber duck as a
  duck). `LOOKS` gives a thing its lookalike's name and words, a little weaker than its
  own (the rubber duck also answers to "quack", the chess knight to "gallop"), and what it
  *wants*: a word after "loves", "likes", "wants" or "eats" is matched only against wants,
  so "something that loves food" is the duck, frog or mouse, never the apple ("you'd like
  to eat" and "looks like" are not wants). A "no" or "not" counts the rest of its clause
  against a thing ("has no hands" rules out the watch and the glove). It is meant to be beatable with a sideways clue.

## Art bible

- **Projection:** a flat front elevation of one room, 1200 x 760 logical px. Floor band at
  the bottom, things stand on their foot.
- **Style:** picture book: ink outlines (`#2a1b2e`, ~2.2px), flat fills, one white
  highlight, gold sparkles. All painted in code (`art.js`); each thing is a sprite cached at
  3x so zoom stays sharp.
- **Palette:** night: plum-blue stone, moonlit window, warm brass, green cauldron glow.
  The painted books at the back of the shelves are kept dark and desaturated so they are
  never mistaken for a thing.
- **A new thing:** add it to `content.js` (size, tags, riddle with near-misses, hint) and
  a `DRAW` entry in `art.js` with its foot at (0, 0). More things means less room to put
  them away: `bot.node.js` prints how many a mess had to overlap.

## Open questions

- **A real model for the owl's turn.** CLIP through Transformers.js (as Pocket Pal runs
  Whisper) would let it match a description against the sprites themselves, not the tags.
- The bot needs ~28 pings a riddle, but it searches blind on a grid; a player who reads the
  riddle should need a handful. Watch whether five pings feels stingy.
- More rooms (a beach, a spaceport) are the same engine with another plate and catalogue.
- On a phone the room is cut at the sides and you drag to look along it; worth a playtest.

## Code

- `content.js`: the things, shelves, riddles, synonyms (words only).
- `sim.js`: `createStudy({ saved, seed, on })`: the room geometry and surfaces, the mess
  (`scatter`, `deepest`), riddles, pings, lift/hold/drop/`restFor`, the owl's `guess()`.
  No page access.
- `art.js`: the room plate, the sprites and their silhouettes, the live bits.
- `view.js`: canvas, camera (wheel, pinch, buttons, drag the wall), input, the landing
  preview, the owl's turn, sound, saving (`the-wizards-muddle-save-v2`, carried from `the-cluttered-study-save-v2`). Debug handle
  `window.__study`.
- Tests: `bot.node.js` (depth over 40 messes; five found and put away), `save.node.js`,
  `play.js` (real pointer events).
