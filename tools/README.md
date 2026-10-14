# tools/

The workbench behind the games. Nothing here is loaded by the site; these are the scripts
that were used to make it, kept because they are reusable and because how the games get
made matters as much as the games.

Every game on this site was built by Amber working with an AI coding assistant (Claude
Code): she plays, writes testing notes and makes the art, and the assistant writes the
code, then plays the games itself through bots and a headless browser to check its own
work. The scripts below are the parts of that loop that turned out to be worth keeping.

| Script | What it does | Needs |
| --- | --- | --- |
| `build-wall.js` | Writes the wall's tiles from `wall/tiles.json` into `index.html`, and refuses a layout that leaves a hole in the grid. `--check` only checks. | Node |
| `shoot.js` | Opens any page in its own headless Chrome, runs a script in it (usually through the game's debug handle, `window.__game`), waits and saves a screenshot. For looking at a game mid-run, wall thumbnails, and before/after comparisons. | Node, Chrome or Edge |
| `sheetcut.py` | Finds the separate pictures on a background-removed art sheet (alpha islands), writes a numbered preview to read by eye, and saves trimmed sprites. A module for per-game cutting scripts, and a command line. | Python, Pillow, NumPy |
| `key-background.py` | Makes the flat page round a JPEG art sheet transparent by flooding in from the border, so pale things inside sprites survive. Run before `sheetcut.py` on sheets with no alpha. | Python, Pillow, NumPy |
| `contact-sheet.py` | Lays a set of finished sprites out on one labelled sheet, to spot the wrong size, a leftover halo or a duplicate before it reaches a game. | Python, Pillow |

The test runner lives in `test/` (see `test/README.md`): `node test/run.js <game>` drives
the real page in headless Chrome and plays each game's rules in Node.

## How the art gets into a game

1. Amber paints or generates a sheet of sprites in one style (often Gemini), and removes
   the background (InSPyReNet, ToonOut). A JPEG plate goes through `key-background.py`.
2. `python tools/sheetcut.py sheet.png preview.jpg` numbers every piece on it.
3. A short script per game picks pieces by number and saves them where the game wants
   them (`save(sheet, boxes[4], "<game>/assets", "troll.png", maxdim=96)`).
4. `contact-sheet.py` on the output folder, to check the set as a whole.
5. The game draws them, and `shoot.js` shows how they actually look on screen, which is
   where most mistakes show up: a sprite drawn too big, a halo, the wrong one of two
   lookalikes.

## How the games get checked

- Every game is split into `sim.js` (the rules, no page access) and `view.js` (the screen),
  so the rules run in Node at full speed. A bot plays a whole game through the same verbs a
  player uses; balance changes are measured by running it over several seeds and reading
  the numbers, not by guessing.
- In-page test cases drive the real game through its debug handle and check what a player
  would see (a ring painted round the right houses, no sideways scroll on a phone).
- Screenshots after every visual change, because code that "should" look right often
  doesn't.
