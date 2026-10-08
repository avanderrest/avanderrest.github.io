# avanderrest.github.io — the project wall

A hand-written static site: a tile wall at the root plus a folder per small
browser project. Pushing to `main` publishes it to https://avanderrest.github.io/.

**The one hard rule is that it is hosted on GitHub Pages**: static files only,
no server code, no secrets in the page. Everything else serves that rule.

Today nothing has a build step, a package.json or dependencies: pages are
served exactly as written, and libraries are vendored (three.js, opencv.js).
That is the default because it is the simplest thing Pages can serve, not a
rule in itself. If a project needs npm packages, TypeScript, a bundler or
deploy-time generated files, it can have them, as long as the output still
deploys to Pages. The route is a GitHub Actions workflow that builds only the
folders that need it and copies the rest as-is; see
`ideas/build step with github actions`. A peer-to-peer library or a free
third-party service (e.g. a TURN relay for multiplayer) is fine too; anything
that needs a server of our own is not.

All of this is about the deployed site, not about the workbench: `test/` holds a
local, dependency-free test runner that drives the real pages in a headless
browser, and `tools/` a script or two that write files you then commit. Nothing
the site serves loads either.

## Layout

- `index.html` / `style.css` / `main.js` — the wall itself. `main.js` is a stack
  of independent IIFEs, one per interactive tile (bokeh canvas, pond, etc.).
- `wall/tiles.json` — the wall's tiles, in order, one per line; `wall/partials/`
  holds the HTML of the interactive tiles. `node tools/build-wall.js` writes them
  into `index.html` between the `wall:begin` / `wall:end` markers (see below).
- `lib/` — small ES modules every game shares: dice and seeds, the URL seed,
  saving, audio, loops, the debug handle. See `lib/README.md`. Import, never copy.
- `<slug>/` — one project per folder (the two shapes are below).
- `images/thumbs/<slug>.jpg` — the tile thumbnail for that folder.
- `images/journal/<post-slug>.jpg` — photo-album tiles, which are hand-written
  links out to `ambervanderrest.wordpress.com` rather than a runtime feed, so
  they can be interleaved with the projects and still work with JS off.
- Exceptions: `letters-to-ashfield/` adds `content.js` (the words) and `art.js` (the SVG) beside its `sim.js` + `view.js`
  at its root (the Oakhaven murder mystery, which replaced the first Ashfield game on
  2026-10-01; that game's painted art is kept, unused, in `images/letters-to-ashfield/`);
  `image-studio/` has `js/` + a vendored `opencv.js`; `machine-imaginaire/` vendors three.js
  in `vendor/three/` (fetched with npm outside the repo and bundled — see its README);
  `willow-mere/` adds `art.js` (all its painting, procedural canvas, no image files);
  `lantern-deep/` adds `content.js`, `tell.js` (the built-in storyteller), `prompt.js` + `dm.js` +
  `dm-worker.js` (an optional language model run in the browser through WebLLM from jsDelivr)
  and `art.js`, with Kenney's CC0 Tiny Dungeon sheet in `assets/`.

## A project folder

Every project is split into a `sim.js` and a `view.js` (since 2026-10-07/08), except
`image-studio`, a photo tool whose styles are classic scripts in `js/` (its `PLAN.md`
says why, and what moving it would take). Make a new project in the split shape, and match
the existing folders rather than inventing a new shape.

**The split shape:**

- `sim.js` — the rules, as an ES module: `export function createX({ saved, rnd, on })`
  returning the state and its verbs. **No page access at all** (no `document`, `window`,
  `localStorage`, canvas or wall clock), so it runs in Node. Dice come in as `rnd`;
  anything the page should react to (a sound, a toast, a dialogue, save now) goes out
  through `on(event, data)`; time is whatever `step(dt)` is given.
- `view.js` — the screen, as an ES module: imports `./sim.js` and `../lib/*`, draws,
  turns input into sim verbs, saves, and exposes the debug handle with `expose()`.
- `PLAN.md` — one page: the one loop, the rules that are deliberate, an art bible
  (projection, palette, light, how to brief a new sheet), open questions, and the code
  layout. Keep it current; findings from the bots go under open questions.
- `index.html` loads `<script type="module" src="view.js"></script>` (after any classic
  scripts it needs first, such as Wayside's `sprites.js`).

**The old shape** (only `image-studio` now): classic scripts, each a block comment saying
what it is, then `(() => { 'use strict'; ... })()`, sharing what they need on `window`.

Either way:

- `index.html`: `<meta name="description">` in the form `Name — one sentence`,
  a `<title>`, a favicon (`../images/duck.png` or an inline emoji SVG data URI),
  and its own `style.css`.
- A `.topbar` header with `<a class="home" href="../index.html">&larr;</a>`, an
  `<h1>`, any tabs/modes, a `.spacer`, then `.tiny` buttons (sound, How to play).
- `style.css` defines its **own** `:root` palette — projects don't share the
  root site's plum tokens, each picks colours to suit.
- Constants up top under a `// ---------- constants ----------` banner. Plain
  DOM/canvas — no frameworks.
- Persistence is `localStorage` with a versioned, folder-prefixed key:
  `store('donut-works-save-v1')` from `lib/save.js`. Bump the version when the shape
  of the saved state changes, and list the old key in `was` to carry saves across.
- A generated world takes its seed from the URL (`lib/seed.js`: `#seed=123`), so a
  world can be shared as a link. Lay each part out from its own stream
  (`streamFor(seed, 'ch' + i)`) when it is generated lazily, so the world depends on
  the seed alone and not on how the player got there. Wayside, Furrow, Route Builder
  and Neon Roll do this.

## Adding a tile to the wall

Add a line to `wall/tiles.json` and run `node tools/build-wall.js`:

```json
{ "game": "<slug>", "title": "Display Name" },
```

Photo tiles are `{ "photo": "<post-url>", "img": "images/journal/<post-slug>.jpg",
"alt": "...", "title": "..." }`; an interactive tile is `{ "html": "<partial name>" }`
with its markup in `wall/partials/`. Any tile can take `"size": "t-wide"` etc.
`node tools/build-wall.js --check` checks without writing.

Every folder is named after its game's display name, so the slug and the tile's `<h3>`
agree: `backing-band`, `blackout`, `coffee-rush`, `donut-works`, `furrow`, `hollowmarch`, `image-studio`, `lantern-deep`,
`letters-to-ashfield`, `machine-imaginaire`, `marble-tray`, `my-little-kitchen`, `neon-roll`, `route-builder`,
`the-corner-shop`, `the-garden-shed`, `tithe`, `toy-racers`, `wayside`, `willow-mere`, `wizz-delivery`. Name a new folder the same way.

If a game is renamed, rename its folder, thumbnail and `test/` folder with it, and carry its
`localStorage` keys across once on load (`store(newKey, { was: [oldKey] })`). The eight
renamed on 2026-09-24 do this; their old slugs were `spy-assassin` (since replaced outright:
the side-on Blackout was scrapped for the isometric one on 2026-10-01, which starts fresh on
`blackout-save-v3`), `cafe-rush`, `crossroads-inn`, `image-filters`, `ashfield`,
`corner-shop`, `cottage-diary` and `paddock`. Old URLs are not redirected.

Thumbnails are **760x475 JPEG**. The tile crops to roughly the left two-thirds,
so keep the interesting part left of centre.

### Tile sizes and the band rule

The wall is `grid-auto-flow: dense` and fills the full window width: 2 columns
at ≥720px, 4 at ≥1080px, 6 at ≥1400px, 12 at ≥3200px. Wide screens get more
columns rather than bigger tiles, and row height follows the column width so a
1x1 tile keeps the thumbnail's shape. Size classes: `t-wide` 2x1, `t-wide3` 3x1 (2x1 at two
columns), `t-tall` 1x2,
`t-lg` 2x2, `t-wx` 1x3 (the weather tile only, 2x3 at two columns); a tile with
no class is 1x1. That includes the name card, which turns into its compact
icon-links layout from 720px up. Because placement is dense, the list has to be read as
**bands** that each fill a whole number of 4-column rows:

- every band's cells (`cols x rows` summed) is a multiple of 4,
- tall tiles come first within their band, so nothing can leave a hole, and
- the whole wall's cells total a **multiple of 12**, so it also ends flush at 6
  and 12 columns (72 on 2026-10-02, when most tiles went to 1x1).

`tools/build-wall.js` plays out the dense placement at 2, 4, 6 and 12 columns and
refuses to write a wall with a hole at 4, 6 or 12 (two columns only warns: the weather
tile is 2x3 there). One new tile is +1 cell, so it needs a compensating resize in the
same band; otherwise add tiles in fours, and in twelves to keep the total right.
`test/wall/` measures the last row in a real browser at 1100, 1920 and 3840 wide.

## Shared files — append, never rewrite

`wall/tiles.json`, `style.css` and `main.js` collect one entry per tile, and more than
one editor is often adding a tile at the same time. `index.html` is written by
`build-wall.js` between its markers; leave the rest of it alone.

- Append or edit those in place. Never rewrite one of them wholesale.
- Namespace CSS classes and element ids per tile with a short prefix.
- Re-read them at the end of a change to confirm nothing was lost.

## Running it locally

There's nothing to build — serve the repo root and open the page:

```sh
python -m http.server 8010
```

Then http://localhost:8010/ for the wall, or http://localhost:8010/<slug>/ for
one project. The port is arbitrary; anything free will do. (ES modules need the
server: opening `index.html` from disk will not load `view.js`.)

`test/` drives headless Chrome over CDP from Node against its own server, with its
own `--remote-debugging-port` and `--user-data-dir`, so it can't attach to a stale
browser and can be shut down without touching anyone else's. One folder per
project, named after its folder in the repo, and you normally want one at a time:

```sh
node test/run.js furrow           # every case for furrow, then screenshots
node test/run.js furrow growth    # one case
node test/run.js furrow --no-shots
node test/run.js wall             # the wall itself
```

Two kinds of case: `name.js` runs inside the real page and returns
`JSON.stringify({ pass, detail })`; `name.node.js` is an ES module run in Node whose
default export returns `{ pass, detail }`, and drives `sim.js` directly. Every split
game has a `bot.node.js` (a bot plays a whole run through the real verbs) and a
`save.node.js` (save, restore, same seed same world). `detail` is always printed, so
it should carry the numbers. After the cases the runner saves `test/_shots/<slug>/`
`desktop.png` and `phone.png` (a first visit, storage cleared) and checks the page
has no sideways scroll at 390px. See `test/README.md`.

Each game exposes a debug handle on `window` (`window.furrow`, `window.__wayside`,
`window.__shop`, …), also as `window.__game`, holding the live state and its verbs.
Use it rather than synthetic clicks on a canvas, and keep exposing one from new
projects (`expose()` from `lib/debug.js`).
