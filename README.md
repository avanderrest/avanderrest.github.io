# avanderrest.github.io — the project wall

A hand-written static site: a tile wall at the root, and one folder per small browser
project. Pushing to `main` publishes it to https://avanderrest.github.io/.

The site is served exactly as written — no build step, no `package.json`, no dependencies.
Libraries are vendored (three.js, opencv.js). The one hard rule is GitHub Pages: static
files only, no server code, no secrets in the page.

## Run it

```sh
python -m http.server 8010
```

Then http://localhost:8010/ for the wall, or http://localhost:8010/<slug>/ for one project.
ES modules need the server: opening `index.html` from disk will not load `view.js`.

## Layout

```
index.html          the wall, with its tiles written in between the wall:begin / wall:end markers
style.css           the wall's styles
main.js             the wall's own interactive tiles, one IIFE each
wall/tiles.json     the tiles, in order, one per line
wall/partials/      the markup of the wall's own interactive tiles
<slug>/             one project per folder
images/thumbs/      the tile thumbnail for each project (760x475 JPEG)
images/journal/     the photo tiles' pictures
lib/                the modules every project shares
test/               the local test runner
tools/              the workbench scripts
ideas/              notes and plans          (local only, not in the repo)
notes/              scratch files            (local only, not in the repo)
```

`test/` and `tools/` are in the repo, so they are deployed as files, but nothing the site
serves loads them.

## The projects

Every folder is named after its game's display name, so the folder and the tile's heading
agree. The 24 game folders:

`backing-band`, `blackout`, `coffee-rush`, `donut-works`, `furrow`, `hollowmarch`,
`image-studio`, `lantern-deep`, `letters-to-ashfield`, `machine-imaginaire`, `marble-run`,
`my-little-kitchen`, `neon-roll`, `physics-playground`, `pocket-pal`, `route-builder`,
`the-corner-shop`, `the-garden-shed`, `the-wizards-muddle`, `tithe`, `toy-racers`,
`wayside`, `willow-mere`, `wizz-delivery`

Plus `photo-splats/`, the photo gallery, which the wall shows as a tile of its own.

The wall itself carries 24 game tiles, 33 photo tiles and 9 interactive tiles (bokeh, pond,
the weather and so on) whose markup lives in `wall/partials/`.

`image-studio` is the one project that isn't split in two: its styles are classic scripts
in `js/`.

## Photo tiles

`images/journal/*.jpg` are the pictures for the photo tiles. Those tiles are hand-written
links out to `ambervanderrest.wordpress.com` rather than a runtime feed, so they can be
interleaved with the projects and still work with JavaScript off.

## How a project is built

Every project is split into two ES modules plus a plan:

- `sim.js` — the rules, with no page access at all (no `document`, `window`, `localStorage`,
  canvas or wall clock), so they run in Node
- `view.js` — the screen: it imports `./sim.js` and `../lib/*`, draws, turns input into sim
  verbs, saves, and exposes the debug handle
- `PLAN.md` — one page on the loop, the deliberate rules, the art bible and the open questions
- `index.html` — loads `view.js` as a module, and `../lib/touch.css` before its own `style.css`

Persisted state is `localStorage` under a versioned, folder-prefixed key (`lib/save.js`), and
a generated world takes its seed from the URL (`#seed=123`, `lib/seed.js`) so a world can be
shared as a link.

## Working in this repo

**[`CLAUDE.md`](CLAUDE.md) is the rulebook** — the layout, the project shape, the wall's band
rule, the touch-screen rules, the test runner, the shared files that must be appended to
rather than rewritten. Read it before changing anything.

Then, as needed:

- [`lib/README.md`](lib/README.md) — the shared modules: dice and seeds, the URL seed,
  saving, audio, loops, the debug handle, the tuning sliders. Import, never copy.
- [`test/README.md`](test/README.md) — `node test/run.js <slug>` drives the real page in
  headless Chrome and plays each split game's rules in Node.
- [`tools/README.md`](tools/README.md) — the workbench: the wall builder, screenshots, the
  art-sheet cutters, and how the art gets into a game.

## Commands

```sh
node tools/build-wall.js            # write the wall's tiles into index.html
node tools/build-wall.js --check    # check the layout without writing
node test/run.js furrow             # every case for furrow, then screenshots
node test/run.js wall               # the wall itself
python -m http.server 8010          # serve the repo
```

## How the site gets made

Amber plays, writes the testing notes and paints the art; an AI coding assistant writes the
code, then plays the games itself through bots and a headless browser to check its own work.
The reusable parts of that loop are the scripts in `tools/`, and the art pipeline — paint a
sheet, cut it into sprites, lay the sprites out on a contact sheet — is written up in
`tools/README.md`.

## License

GNU General Public License v3.0, unless otherwise noted. You may not use, copy, modify or
distribute this software except in the terms of the GPL-3.0.

Full text: https://www.gnu.org/licenses/gpl-3.0.html
