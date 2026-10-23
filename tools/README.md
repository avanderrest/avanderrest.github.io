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
| `prototype.py` | Renders a grid of variants of one idea — a row per prompt, a column per seed — and lays them on one labelled sheet with the sprites or props stood on a shared floor line, so sizes compare honestly. `--mode sprite\|prop\|scene`; `--new <slug>` interviews you once for a game's own spec (`tools/prototypes.<slug>.json`), and `--game <slug>` runs it. A spec can mix the three, rule out what does not belong, start a row from an existing plate or a blockout (`image`, `mockup`, `strength`), with mockup presets for front-on rooms, top-down grids, isometric diamond floors and side-on stages (or free rects, polygons and lines), use art the game already has (`asset`), and with `compose` lay the background, people and props into one frame. `--cutout` keys a sprite's or prop's backdrop out and warns when a render came out as a scene; `--only` renders one row while tuning. Every cell is also saved at native size for the game. | Python, Pillow, torch + diffusers on a CUDA card |
| `proto/new.js` | Starts a playable flow prototype in `tools/proto/prototypes/<slug>/` from one of four shapes — economy, puzzle, arcade, story — each a small game with its own rules and screen. `--spec <description.md>` starts from a written game instead of an interview and guesses the shape from its words; `--ref <image>` (repeatable) copies reference pictures to `refs/` and measures them into `LOOK.md`. | Node |
| `proto/look.py` | Measures reference images: the palette by area, the loud (bright, saturated) colours a neon sign hides in, region averages, brightness and saturation — and starting CSS tokens. `--swatches` saves a palette strip to check by eye. Feeds `LOOK.md`; it never copies the picture into a game. | Python, Pillow |
| `proto/check.js` | Checks that prototype: the brief is filled, `SPEC.md`/`LOOK.md` and `refs/` agree, the sim interface, three seeds of the rules played in Node (the ending reached, the action counts, verbs offered but never taken, template words left in), determinism, then the real page in headless Chrome with screenshots and a phone-width check. Each failure line says what to change. | Node, Chrome or Edge |

`proto/GUIDE.md` is the procedure a local model follows to build one — the steps, the
questions it asks the person, and the interface it writes to. `proto/shapes/` holds the
questions and build notes for each kind of game; `proto/README.md` explains the whole.

The test runner lives in `test/` (see `test/README.md`): `node test/run.js <game>` drives
the real page in headless Chrome and plays each game's rules in Node.

The scripts that start a headless browser (`test/run.js`, `shoot.js`, `cdp.js`) give it a
throwaway profile in the system temp folder and delete it when the browser stops, so runs
do not leave gigabytes of Chrome profiles behind. `profiles.js` also sweeps profiles a
killed run left, once they are a day old. `cdp.js`'s named `profile:` is deliberately kept.
`node tools/profiles.js` clears out the old ones without starting a browser.

## How the art gets into a game

0. To make the art here rather than elsewhere: `python tools/pixel-art.py "…"` renders one
   scene, and `python tools/prototype.py tools/prototypes.example.json` puts several
   versions of one figure, prop or scene on a single labelled sheet, so the choice is made by eye
   before anything is cut or committed.
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
