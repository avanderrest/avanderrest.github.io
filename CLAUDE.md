# avanderrest.github.io — the project wall

A hand-written static site: a tile wall at the root plus a folder per small
browser project. **What ships has no build step, no package.json and no
dependencies** — the pages are served exactly as they are written. Pushing to
`main` publishes it to https://avanderrest.github.io/.

That rule is about the deployed site, not about the workbench: `test/` holds a
local, dependency-free test runner that drives the real pages in a headless
browser. It is never loaded by anything the site serves.

## Layout

- `index.html` / `style.css` / `main.js` — the wall itself. `main.js` is a stack
  of independent IIFEs, one per interactive tile (bokeh canvas, pond, etc.).
- `<slug>/` — one project per folder, each self-contained:
  `index.html` + `style.css` + `game.js`.
- `images/thumbs/<slug>.jpg` — the tile thumbnail for that folder.
- `images/journal/<post-slug>.jpg` — photo-album tiles, which are hand-written
  links out to `ambervanderrest.wordpress.com` rather than a runtime feed, so
  they can be interleaved with the projects and still work with JS off.
- Exceptions: `letters-to-ashfield/` splits its JS into `js/game.js` + `js/content.js`;
  `image-studio/` has `js/` + a vendored `opencv.js`.

## Conventions for a project folder

Match the existing folders rather than inventing a new shape:

- `index.html`: `<meta name="description">` in the form `Name — one sentence`,
  a `<title>`, a favicon (`../images/duck.png` or an inline emoji SVG data URI),
  its own `style.css`, and `<script src="game.js"></script>` at the end of body.
- A `.topbar` header with `<a class="home" href="../index.html">&larr;</a>`, an
  `<h1>`, any tabs/modes, a `.spacer`, then `.tiny` buttons (sound, How to play).
- `style.css` defines its **own** `:root` palette — projects don't share the
  root site's plum tokens, each picks colours to suit.
- `game.js`: a block comment saying what the thing is, then
  `(() => { 'use strict'; ... })()`. Constants up top under a
  `// ---------- constants ----------` banner. Plain DOM/canvas — no frameworks.
- Persistence is `localStorage` with a versioned, folder-prefixed key:
  `const SAVE_KEY = 'donut-works-save-v1'`. Bump the version when the shape of
  the saved state changes.

## Adding a tile to the wall

Append to the `#wall` grid in `index.html`:

```html
<a class="tile tile-img tile-game" href="<slug>/index.html">
  <img class="tile-bg" src="images/thumbs/<slug>.jpg" alt="" loading="lazy" />
  <div class="tile-overlay"><h3>Display Name</h3></div>
</a>
```

Every folder is named after its game's display name, so the slug and the tile's `<h3>`
agree: `blackout`, `coffee-rush`, `donut-works`, `furrow`, `hollowmarch`, `image-studio`,
`letters-to-ashfield`, `marble-tray`, `my-little-kitchen`, `neon-roll`, `the-corner-shop`,
`the-garden-shed`, `tithe`, `toy-racers`, `wayside`, `wizz-delivery`. Name a new folder the same way.

If a game is renamed, rename its folder, thumbnail and `test/` folder with it, and carry its
`localStorage` keys across once on load (copy old to new when new is empty, then remove the
old key). The eight renamed on 2026-09-24 each do this near the top of their JS; their old
slugs were `spy-assassin`, `cafe-rush`, `crossroads-inn`, `image-filters`, `ashfield`,
`corner-shop`, `cottage-diary` and `paddock`. Old URLs are not redirected.

Thumbnails are **760x475 JPEG**. The tile crops to roughly the left two-thirds,
so keep the interesting part left of centre.

### Tile sizes and the band rule

The wall is `grid-auto-flow: dense` — 4 columns at ≥1080px, 2 at ≥720px. Size
classes: `t-wide` 2x1, `t-tall` 1x2, `t-lg` 2x2, `t-wx` 2x3 (the weather tile
only); no class is 1x1. Because placement is dense, the markup has to be read as
**bands** that each fill a whole number of 4-column rows:

- every band's cells (`cols x rows` summed) is a multiple of 4, and
- tall tiles come first within their band, so nothing can leave a hole.

Break either and the bottom of the wall goes ragged. One new tile is +1 cell, so
it needs a compensating resize in the same band — or add four at a time. Check
the result by measuring the last row in a real browser, not by eye.

## Shared files — append, never rewrite

`index.html`, `style.css` and `main.js` collect one block per tile, and more than
one editor is often adding a tile at the same time.

- Append or edit those three in place. Never rewrite one of them wholesale.
- Namespace CSS classes and element ids per tile with a short prefix.
- Re-read all three at the end of a change to confirm nothing was lost.

## Running it locally

There's nothing to build — serve the repo root and open the page:

```sh
python -m http.server 8010
```

Then http://localhost:8010/ for the wall, or http://localhost:8010/<slug>/ for
one project. The port is arbitrary; anything free will do.

To see a change actually working, drive headless Chrome over CDP from Node
against that local server. Give every run its own `--remote-debugging-port` and
`--user-data-dir` so it can't attach to a stale browser, and so it can be shut
down without touching anyone else's.

`test/` already does all of that. One folder per project, named after its folder
in the repo, and you normally want one project at a time:

```sh
node test/run.js furrow           # every case for furrow
node test/run.js furrow growth    # one case
```

A case is a script evaluated in the real page that returns
`JSON.stringify({ pass, detail })`; `detail` is always printed, so it should
carry the numbers. Cases are for end-to-end properties that break silently — a
generated world nobody can play, a colony that starves with a full store — not
for unit-testing functions. See `test/README.md`, which also records what was
tried and deliberately not kept.

Each game exposes a debug handle on `window` (`window.furrow`, `window.__wayside`,
`window.__ashfield`, `window.__shop`, …) holding the live state and its verbs.
Use it rather than synthetic clicks on a canvas, and keep exposing one from new
projects.
