# Letters to Ashfield: plan

Oakhaven-under-Hill, November 1950. Harriet Vale, the postmistress, was found at the foot of
the vestry steps. You are Beatrice Pym, her replacement, and you have twelve days before the
Inspector closes the post office. One of seven people pushed her, a different one each game.

## The one loop

**Notice, then knit it together.** Each day: sort the morning post and serve the counter;
in the afternoon go somewhere on a postal pretext and tidy what you are left alone with; in
the evening drop the words you have collected into the Knitting Ledger until it tallies.
Day 12 is the Village Hall, where evidence breaks the culprit's story.

Good feels like: a word from a customer's offhand remark finishing a ledger line.

## Rules that are deliberate (Amber's calls, see the Letters to Ashfield notes)

- A cousin of the first Ashfield game, not a sequel: its own place, people and save.
- The morning is two screens: sort the pile onto the village map on the desk, then the view
  lifts to the counter on its own. Customers post things or buy stamps, ink, labels and
  twine, never collect. What they post joins tomorrow's pile.
- No maths, no old money, no pounds and ounces: first- and second-class stamps and a parcel
  stamp. Only parcels go on the scale; incoming post is already paid for.
- Lost and Found is a box on the counter; returnables are dragged to the person.
- Afternoon errands are chosen from cards; post-office searches only open on a clue.
- She dislikes order-by-height puzzles and the "straighten things" churchyard. Shelves go
  back on their marks in the dust; upstairs is unpacking the bed into drawers.
- The writing's rules (content.js): the innocent are vague and own up to small things; the
  guilty one is precise to the minute; every alibi names a witness; the culprit's trace is
  on the torn notice and the unsigned letter, and Harriet's missing page is at their place.

## Art bible

- **Look:** pixel-painterly people (Amber's Gemini reference) and a painted village map
  (`reference/Letters to ashfield.jpg`), cut by `notes/letters-to-ashfield-assets/`.
  See `ASSETS.md`.
- **Drawn in code (art.js):** the counter's people in five moods, the shelf objects, the
  churchyard, the bedroom, all as SVG strings.
- **Palette:** ink brown (#3b2618) on paper, muted wartime-plus-five colours.
- **Type:** letters and ledgers in a hand; the rest plain.

## Open questions

- The churchyard is still a straighten-things puzzle, which she said she dislikes.
- `bot.node.js` fills the ledger from its answers; only `playthrough.js` (five minutes, in
  the page) proves every word can be collected. Moving word collection out of the render
  functions would let the Node bot prove it too.

## Code

- `content.js`: every word, as an ES module (`OAK`): people, the days, the post, the
  counter's visitors, places, the ledger pages as a function of the culprit, statements.
- `art.js`: the SVG drawing (`OAKART`).
- `sim.js`: `createPostOffice({ meta, rnd, on })`: the case (`po.S`), the culprit draw, the
  day's pile from the seed, the morning (sorting, the counter's errands, weighing,
  stamps), the afternoon's places and what they turn up, words and evidence, the ledger
  tally, the Hall (`speakUp`, `present`, `accuse`, `closeCase`) and the endings. No page
  access.
- `view.js`: the screens, the drag and drop, the tidy puzzles, the overlays, sound, and the
  saves (`letters-to-ashfield-save-v4`, `…-meta-v4`, `…-sound`). The view keeps its own
  `S` pointing at the same object as `po.S`.
- Debug handle `window.__oak` (also `window.__game`), with the sim as `__oak.sim`.
- Tests: `bot.node.js` (every culprit through twelve days to the right ending) and
  `save.node.js` in Node; `playthrough.js` in the page.
