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
| `cdp.js` | The headless-Chrome plumbing as a module: serve the repo, start a private Chrome (optionally with the real GPU and WebGPU, and a fixed profile so big downloads are kept), evaluate scripts, take screenshots. `photo-splat.js` uses it. | Node, Chrome or Edge |
| `photo-splat.js` | Turns a photo into a Photo Splats gallery scene through the real page: SHARP on the GPU (or the quick depth guess with `--how depth`), pruned to the most visible splats and saved as `.splat`. Prints the `gallery.json` fields. | Node, Chrome, a WebGPU graphics card with 8 GB+ |
| `splat-pack.js` | Shrinks any Gaussian splat `.ply` (SHARP's own CLI, LGM, Brush, a phone scan) to a `.splat` small enough to commit. `--flip` for y-up scenes. | Node |
| `splat-pull-surround.js` | Pulls a baked surround (the sphere of splats already inside a `.splat`) in to the photo's own background depth, or removes it with `--strip` so the page builds the photo-derived one. For a gallery scene baked before the surround depth rule changed. | Node |
| `sheetcut.py` | Finds the separate pictures on a background-removed art sheet (alpha islands), writes a numbered preview to read by eye, and saves trimmed sprites. A module for per-game cutting scripts, and a command line. | Python, Pillow, NumPy |
| `key-background.py` | Makes the flat page round a JPEG art sheet transparent by flooding in from the border, so pale things inside sprites survive. Run before `sheetcut.py` on sheets with no alpha. | Python, Pillow, NumPy |
| `contact-sheet.py` | Lays a set of finished sprites out on one labelled sheet, to spot the wrong size, a leftover halo or a duplicate before it reaches a game. | Python, Pillow |
| `pixel-art.py` | Makes a neon pixel-art scene: SDXL plus the `pixel-art-xl` LoRA, then bloom, NEAREST downscale and palette-quantise with dithering. `--from <png>` re-cuts an existing render with only Pillow, no GPU. | Python, Pillow, torch + diffusers built for the card (cu128 for a 50-series), a CUDA card with 8 GB+ |

The test runner lives in `test/` (see `test/README.md`): `node test/run.js <game>` drives
the real page in headless Chrome and plays each game's rules in Node.

The scripts that start a headless browser (`test/run.js`, `shoot.js`, `cdp.js`) give it a
throwaway profile in the system temp folder and delete it when the browser stops, so runs
do not leave gigabytes of Chrome profiles behind. `profiles.js` also sweeps profiles a
killed run left, once they are a day old. `cdp.js`'s named `profile:` is deliberately kept.
`node tools/profiles.js` clears out the old ones without starting a browser.

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
