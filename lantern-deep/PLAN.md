# Lantern Deep

A choose-your-own-adventure dungeon crawl, five floors down to the Hollow King. Built
2026-10-08 from the "Lightweight Dungeon Master" idea in `ideas/Game ideas` (and its image,
a scroll, a framed dungeon map and a character sheet on a wooden table).

## The one loop

**Read the page, pick a line.** Every turn the scroll says where you are and what just
happened, and the list under it says what you can do (number keys work). Anything that can
fail shows the stat it tests and your chance; the d20s show up in a strip under the scroll.
Explore a floor room by room on the pixel map, fight or slip past what lives there, open
chests, pray at altars, drink from fountains, rest, trade with the pedlar, and take the
stair down. On floor 5 the stair room is the Hollow King's throne. Death ends the delve;
the next one is a new dungeon.

## Rules that are deliberate

- **The game decides everything; the storyteller only words it.** A floor is laid out from
  the seed before you set foot on it (rooms on a 5x4 grid, a random-growth tree plus a loop
  or two, the stair down in the room furthest from the start), and each room's foe, feature
  and loot come from that room's own stream. The idea had the language model "define clues,
  choices, encounters". It doesn't, because then the clues could not be true, a seed would
  not be a dungeon, saves would depend on a model, and a small model can be argued into
  anything. It gets the facts and rewords them. See *The Dungeon Master* below.
- **Clues are true.** A doorway to a room you haven't been in shows a sign of what is really
  there (the monster's `signs`, the feature's, or a cold draught for the stair), if a d20
  rolled for that doorway plus your WIS modifier reaches 8. A mimic shows as a chest. That is
  the one lie, and the search check (WIS, rogues with advantage) finds it.
- **d20 + modifier against a DC**, natural 20 always succeeds and 1 always fails. DCs are a
  base plus floor x 1.2. Attacks add proficiency (+2, +3 from level 5) and the AC to beat is
  the foe's. Advantage is roll twice, keep the higher: rogues get it sneaking and on traps,
  and an ambush gets it on the first swing.
- **Not fighting is a real choice.** Sneaking past (DEX vs the monster's alertness + floor)
  and talking past (CHA, only things that talk: bandits, cultists, ogres) both give half the
  monster's XP. A sneak leaves it asleep, and you can come back and ambush it with advantage.
  A failed sneak or parley starts the fight with the monster getting the first swing.
- **One round = your action, then its swing.** Dodge (DEX vs its attack + 9) cancels its
  swing and gives +2 to your next attack; a failed dodge still gives +2 AC. Fleeing (DEX)
  goes back to the room you came from and leaves it there, still hurt.
- **Recovery is scarce on purpose**, and every source has a cost: potions (bought, found),
  a level up (a full heal), the stair down (30% of max HP, and your class pool refilled),
  campfires (half HP, once each, 20% something finds you), and one short rest a floor in any
  quiet room (35% HP, 35% something finds you). The short rest exists because without it a
  hurt hero with no potions had no move but to walk into the next fight and die.
- **Classes** (all from the sheet: dwarf fighter 87, human wizard 84, halfling rogue 88, elf
  cleric 99). Fighter: 24 HP, AC 15, Second Wind and Cleave. Wizard: 20 HP, AC 12, Firebolt
  free and Magic Missile, both + level - 1 damage, and Shield (+6 AC for one swing). Rogue:
  +1d6 on every weapon hit, Backstab on the first round, Smoke Bomb to escape. Cleric: AC 16,
  Healing Word, Smite (double against the undead), Turn Undead.
- **Balance, from the bot (160 delves, 40 per class):** 48 won (30%): fighter 15, wizard
  12, rogue 11, cleric 10. Deaths cluster on floor 5 (the King) and floor 3. It took five
  passes to get there: first nobody passed floor 2 (more starting HP, a full heal on level
  up, the stair breather); then wizards never won (Firebolt went free, spells scale with
  level, AC 12, +4 HP); then rogues never won (+1d6 dirty fighting, XP for sneaking).
- **Saves** are the sim's state as is (`lantern-deep-save-v1`), including the page on the
  scroll and the storyteller's labels, so a reload shows the same page.

## The Dungeon Master (an optional language model)

`dm.js` runs a model in the player's own browser on WebGPU through WebLLM 0.2.85 (from
jsDelivr; the weights come from Hugging Face the first time and the browser keeps them). It
runs in a worker. It is off until the player picks one from the button at the top; the book
(`tell.js`) tells every page either way.

Each turn the sim resolves the choice, the book writes the page, and the model is given the
book's page as FACTS plus the choices, with one worked example, and asked for
`TITLE / STORY / CHOICES`. `prompt.js` reads the answer and keeps each part only if it
passes (otherwise the book's words stand):

- the story is 30-900 characters, still names the monster in front of you, and names no
  creature or thing of value (gem, key, potion, chest, stair, sword...) the facts don't;
- if the story invented something, none of that answer is used;
- each reworded choice names no direction its own choice doesn't, shares more words with
  its own choice than with any other, and has some word that fits its action.

Pages under 90 characters are left to the book.

Tried on this machine (NVIDIA, headless Chrome, 2026-10-08):

- **Phi-3 mini** (q4f16, 3.7 GB of VRAM): 108 s to download and compile the first time,
  then 5.5 s to load from cache, then 2.5-4.5 s a page. 10 of 12 stories passed the checks.
  The good ones are good ("Your shortsword digs deep, and the bandit grunts, hissing in
  pain"). The rejects: it retold the previous page when given it as memory (so it no longer
  is), invented a bloodstained gemstone, and borrowed the worked example's creature into
  unrelated pages (the example is now a centipede, which cannot appear, and is on the watch
  list).
- **SmolLM2 360M and 1.7B**: dropped. They invent too much for any check (a cougar, a
  hundred-foot drop, rum) and mislabel choices.
- **Llama 3 8B** (q4f16, 5 GB of VRAM): 253 s to download and compile the first time, then
  about 4 s a page. 11 of 12 stories passed and every reworded choice did. It sticks to the
  facts more closely than Phi-3 and writes better choices ("Leave a glint of gold on the
  altar"). The one reject added "forgotten treasures" to a room with none. That run only
  walked back and forth between two rooms, so it has not been seen in a fight yet.

## Art bible

- **Projection:** top-down pixel map, 16px tiles from Kenney's Tiny Dungeon (CC0,
  `assets/tiny-dungeon.png`, the packed 192x176 sheet, 12 cells a row), drawn at a whole-number
  scale (2x on a laptop) with smoothing off. Floors are procedural flagstones per floor
  palette; the north wall of each room is sheet stone (40, 57-59) tinted by the floor's wall
  colour; side walls are 3px outlines.
- **Light:** the lantern (4.6 tiles, 5.4 when blessed) flickers round the hero; two torches
  on the north wall of each room you have been in; campfires, altars and fountains glow.
  Everything else is near-black, with rooms you remember a little lifted.
- **Palette:** walnut table (`--wood-*`), parchment (`--parch`), brass trim (`--brass`).
  Each floor has its own flagstone and light colour in `THEMES`: warm cellars, grey mine,
  blue-cold crypt, green fungus, purple-red throne.
- **Type:** Cinzel for titles and buttons, IM Fell English for the story.
- **Sprites:** heroes 84/87/88/99, monsters 108-112 and 120-124, mimic 92, chests 89/90,
  potions 113-116 and 127/128, weapons 103-107 and 117-119, wands 129-131. The Hollow King
  is the spirit (121) drawn at 2x. Corpses, campfires, coins and torches are drawn in code.
- **Briefing a new sheet:** 16px, top-down with the slight front view Kenney uses, dark
  outline, same 12-wide packed layout, so `sprite(idx)` keeps working.

## Open questions

- Llama 3 8B has only been watched narrating rooms, not fights.
- The guard is a net, not a wall: Phi-3 still slipped in a "halfling sentry" and a
  sunset through a crack. A watch list grows forever; a second, tiny model call ("does
  STORY add anything not in FACTS? yes/no") might be the better check.
- Weapons only ever get swapped up automatically. A choice between, say, a rapier and an
  axe would matter more for a rogue than a fighter.
- Fights are one foe at a time. A pack of rats would want the sim to hold several.
- The idea's "basic pixel images of what's going on" is the map. A close-up vignette (the
  monster big, behind the scroll) would be the next step.

## Code layout

- `content.js`: the tables: classes, skills, weapons, items, monsters, features, the five
  floor themes and their word banks.
- `sim.js`: `createDelve({ saved, seed, rnd, on })` → `{ S, choices(), act(id), facts() }`,
  and `makeFloor(seed, floor)`. Every move is a choice from `choices()`; `act(id)` returns the
  events (`roll`, `hit`, `hurt`, `kill`, `enter`, ...).
- `tell.js`: the book. `tellPage(facts, events, rnd)` → `{ title, text }`.
- `prompt.js`: what the model is told and how its answer is checked (Node-tested).
- `dm.js` + `dm-worker.js`: loading WebLLM and the model, streaming a page, timing out at 45 s.
- `art.js`: the map (`paintFloor` once per change, `drawScene` every frame) and sprite icons.
- `view.js`: the page, the dice strip, choices and their groups, sound, saving, the
  debug handle `window.__lantern`.
- Tests in `test/lantern-deep/`: `bot.node.js`, `save.node.js`, `dm.node.js`, `play.js`.
