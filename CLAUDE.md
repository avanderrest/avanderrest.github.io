# avanderrest.github.io — the project wall

A hand-written static site: a tile wall at the root plus a folder per small
browser project. **No build step, no package.json, no dependencies, no test
suite.** Pushing to `main` publishes it to https://avanderrest.github.io/.

## Layout

- `index.html` / `style.css` / `main.js` — the wall itself. `main.js` is a stack
  of independent IIFEs, one per interactive tile (bokeh canvas, pond, etc.).
- `<slug>/` — one project per folder, each self-contained:
  `index.html` + `style.css` + `game.js`.
- `images/thumbs/<slug>.jpg` — the tile thumbnail for that folder.
- `images/journal/<post-slug>.jpg` — photo-album tiles, which are hand-written
  links out to `ambervanderrest.wordpress.com` rather than a runtime feed, so
  they can be interleaved with the projects and still work with JS off.
- Exceptions: `ashfield/` splits its JS into `js/game.js` + `js/content.js`;
  `image-filters/` has `js/` + a vendored `opencv.js`.

## Conventions for a project folder

Match the existing folders rather than inventing a new shape:

- `index.html`: `<meta name="description">` in the form `Name — one sentence`,
  a `<title>`, a favicon (`../images/duck.png` or an inline emoji SVG data URI),
  its own `style.css`, and `<script src="game.js"></script>` at the end of body.
- A `.topbar` header with `<a class="home" href="../index.html">&larr;</a>`, an
  `<h1>`, any tabs/modes, a `.spacer`, then `.tiny` buttons (sound, How to play).
- `style.css` defines its **own** `:root` palette — projects don't share the
  root site's solarized tokens, each picks colours to suit.
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

The tile's `<h3>` is the display name and may differ from the folder slug
(`crossroads-inn/` shows as "Hollowmarch").

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

There is no test suite. To see a change actually working, drive headless Chrome
over CDP from Node against that local server. Give every run its own
`--remote-debugging-port` and `--user-data-dir` so it can't attach to a stale
browser, and so it can be shut down without touching anyone else's.

Each game exposes a debug handle on `window` (`window.furrow`, `window.__wayside`,
`window.__ashfield`, `window.__shop`, …) holding the live state and its verbs.
Use it rather than synthetic clicks on a canvas, and keep exposing one from new
projects.
