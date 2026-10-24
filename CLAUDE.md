# avanderrest.github.io — the project wall

A hand-written static site: a tile wall at the root plus a folder per small
browser project. Pushing to `main` publishes it to https://avanderrest.github.io/.

**The one hard rule is that it is hosted on GitHub Pages**: static files only,
no server code, no secrets in the page. Everything else serves that rule.

The deployed site has no build step and no runtime dependencies: pages are
served exactly as written, and libraries are vendored (three.js, opencv.js).
That is the simplest thing Pages can serve. If a project ever needs npm
packages, TypeScript, a bundler or deploy-time generated files, it can have
them, as long as the output still deploys to Pages. The route is a GitHub
Actions workflow that builds only the folders that need it and copies the rest
as-is; see the build-step entry in `ideas/for later`. A peer-to-peer library or
a free third-party service (e.g. a TURN relay for multiplayer) is fine too;
anything that needs a server of our own is not.

Development is different: `test/` drives the real pages in a headless browser,
and `tools/` holds the reusable workbench scripts (the wall builder, `shoot.js`
for screenshots of a driven page, the art-sheet cutters, and `tools/proto/` for
playable flow prototypes a local model builds from an interview; see
`tools/README.md`, which is public and explains the process). **Use npm
dependencies for dev work and tools when they are the appropriate choice** —
headless-browser plumbing, image processing, asset generation, test helpers —
instead of hand-rolling it or reaching for system installs. Keep them in
`package.json` as `devDependencies` (`node_modules/` is gitignored), pin what
matters, and commit the lockfile. Nothing the site serves may import from
`node_modules` or require a build; generated output (thumbnails, sprites, cut
sheets) is committed as ordinary static files. Put a reusable script in `tools/`,
not in `notes/`, once it is general enough to use twice.

## Layout

- `package.json` — dev-only scripts (`npm test`, `npm run wall`, `npm run shoot`, …) and
  any devDependencies; nothing the site serves loads them.
- `index.html` / `style.css` / `main.js` — the wall itself. `main.js` is a stack
  of independent IIFEs, one per interactive tile (bokeh canvas, pond, etc.).
- `wall/tiles.json` — the wall's tiles, in order, one per line; `wall/partials/`
  holds the HTML of the interactive tiles. `node tools/build-wall.js` writes them
  into `index.html` between the `wall:begin` / `wall:end` markers (see below).
- `lib/` — small ES modules every game shares: dice and seeds, the URL seed,
  saving, audio, loops, the debug handle. See `lib/README.md`. Import, never copy.
- `<slug>/` — one project per folder (the two shapes are below).
- `images/thumbs/<slug>.jpg` — the tile thumbnail for that folder.
- `images/posters/<slug>.jpg` — an optional 3:4 portrait poster for a game; when present it
  replaces the thumbnail on that game's tile and brings its own title.
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
  `dm-worker.js` (an optional language model run in the browser through WebLLM from jsDelivr),
  `player.js` (the AI hero for its Dungeon Master's mode, and the tests' bot), `editor.js` (that
  mode's map editor) and `art.js`,
  with Kenney's CC0 Tiny Dungeon sheet in `assets/`.
  `the-wizards-muddle/` (The Cluttered Study until 2026-10-09) adds `content.js` (the things and their riddles) and `art.js` (the room and every
  thing painted in code, no image files).
  `the-corner-shop/` adds `art.js` (the shop floor and everyone in it, painted in code; only its goods
  are image files).
  `pocket-pal/` adds `art.js` (all canvas, no image files) and `voice.js` + `voice-worker.js` (the mic
  through Web Audio, and Whisper tiny run in the browser through Transformers.js from jsDelivr).
  `physics-playground/` is four toys in one page: one `sim.js` holds every toy's rules, and the view
  is split per toy (`view.js` the shell, then `view-gummy.js`, `view-lava.js`, `view-sand.js`,
  `view-pendulum.js`); it vendors its own copy of three.js in `vendor/three/`, loaded only by the
  sand tray. Its old synth became Backing Band's Mega Jam.
  `neon-dark/` adds `art.js`: a noodle stall in a rainy neon city, every pixel painted in code
  (no image files), on a 480x270 stage the page stretches with nearest-neighbour. Its look
  comes from three SDXL renders made with `tools/pixel-art.py`.
  `marble-run/` (which replaced Marble Tray outright on 2026-10-16) adds `levels.js` and
  `solve.js` (the beam-search solver that proves every level; Node only, the page never loads
  it), and vendors its own three.js in `vendor/three/`: the whole board is a three.js scene.

## A project folder

Every project is split into a `sim.js` and a `view.js` (since 2026-10-07/08), except
`image-studio`, a photo tool whose styles are classic scripts in `js/` (its `PLAN.md`
says why; what moving it would take is in `ideas/for later`). Make a new project in the split shape, and match
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
  layout. Keep it current; findings from the bots go under open questions. It describes
  what is built: plans for changes not made yet go in `ideas/for later` (the only file in
  `ideas/`), and come out of there once done.
- `index.html` loads `<script type="module" src="view.js"></script>` (after any classic
  scripts it needs first, such as Wayside's `sprites.js`).

**The old shape** (only `image-studio` now): classic scripts, each a block comment saying
what it is, then `(() => { 'use strict'; ... })()`, sharing what they need on `window`.

Either way:

- `index.html`: `<meta name="description">` in the form `Name — one sentence`,
  a `<title>`, a favicon (`../images/duck.png` or an inline emoji SVG data URI),
  `../lib/touch.css` and then its own `style.css`.
- **Touch screens** (tablets, and Amber's Surface with touch and pen): `lib/touch.css`
  makes every control at least 44px whenever the device has a touch screen at all. Test for
  touch with `any-pointer: coarse` or the event's `pointerType`, never `pointer: coarse`
  alone (a Surface with its keyboard attached reports a fine pointer). Every key needs a
  button or gesture; nothing may live only on hover (first tap shows, second tap does, as in
  Blackout and Hollowmarch); a wheel zoom needs a pinch. Size full-height things with
  `dvh` after a `vh` fallback. Games that move with keys show an on-screen pad under
  `.has-touch` (Tithe, Toy Racers, Wizz, Furrow) or `any-pointer: coarse`.
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
  and Neon Roll do this; Hollowmarch's board is fixed, so its seed picks the waves.

## Adding a tile to the wall

Add a line to `wall/tiles.json` and run `node tools/build-wall.js`:

```json
{ "game": "<slug>", "title": "Display Name" },
```

Photo tiles are `{ "photo": "<post-url>", "img": "images/journal/<post-slug>.jpg",
"alt": "...", "title": "..." }`; an interactive tile is `{ "html": "<partial name>" }`
with its markup in `wall/partials/`. Any tile can take a size hint: `"size": "wide"`,
`"wide3"`, `"tall"`, `"lg"`, `"wx"` or `"3"`. `node tools/build-wall.js --check` checks
without writing. `build-wall.js` gives every picture a frame and hanging height from a
hash of its slug, so there is nothing to choose per tile. Photographs carry no caption.
A photo with `"landscape": true` hangs in a 3:2 landscape frame, with the picture contained rather than cropped. A game's title is written on its picture; add `"caption": false` to its tile to hang it
unlabelled (then the tile's own `title` becomes its accessible name). Games hang as
flat portrait posters — a 3:4 crop with a narrow paper margin, no mat or moulding — while
photographs hang in frames with mats. Add `"framed": true` to a game tile to hang that one
landscape in a photograph frame instead of as a poster. A portrait poster dropped at
`images/posters/<slug>.jpg` is used whole as a 3:4 poster, and its title replaces the
caption on the tile.

Every folder is named after its game's display name, so the slug and the tile's `<h3>`
agree: `backing-band`, `blackout`, `coffee-rush`, `donut-works`, `furrow`, `hollowmarch`, `image-studio`, `lantern-deep`,
`letters-to-ashfield`, `machine-imaginaire`, `marble-run`, `my-little-kitchen`, `neon-roll`, `physics-playground`, `pocket-pal`, `route-builder`,
`the-corner-shop`, `the-garden-shed`, `the-wizards-muddle`, `tithe`, `toy-racers`, `wayside`, `willow-mere`, `wizz-delivery`. Name a new folder the same way.

If a game is renamed, rename its folder, thumbnail and `test/` folder with it, and carry its
`localStorage` keys across once on load (`store(newKey, { was: [oldKey] })`). The eight
renamed on 2026-09-24 do this; their old slugs were `spy-assassin` (since replaced outright:
the side-on Blackout was scrapped for the isometric one on 2026-10-01, which starts fresh on
`blackout-save-v3`), `cafe-rush`, `crossroads-inn`, `image-filters`, `ashfield`,
`corner-shop`, `cottage-diary` and `paddock`. Old URLs are not redirected.

Thumbnails are **760x475 JPEG** and are shown whole inside their frame; the wall does not
crop the picture to fill a tile.

### Hanging and the wall's layout

The wall is a freeform hanging, not a flush tile grid. It fills the window width with
2 columns on phones, 6 at ≥720px and 12 at ≥1080px. On phones every picture is one
column wide; only the name card and the forecast take both, and the forecast splits
inside (the painting in one column, the place line, date and forecast card in the
other). Size hints are **widths**: `wide` is 2 of 12 columns (2 of 6; on phones it is
one column like any other picture), `wide3` 4 (3), `lg` 4, `tall` 2, `wx` 2 (the forecast, a normal tile), and a
tile with no class is 2 of 12 (1 of 6, 1 of 2 on phones). The name card is 4 of 12. Heights come from the
photograph's own proportions, plus the frame and mat, so portrait photographs are taller
than the screenshots.

`main.js` measures every frame after layout and writes its height into `--row-span`; the
grid then packs the frames into the columns by height (`grid-auto-rows: 2px`, dense
flow), so the tall forecast can run alongside two rows of pictures instead of pushing
them down. Frames keep their own size — nothing is stretched to square off the bottom —
and the gaps between them are even; the bottom edge is allowed to be ragged. There is no
band rule and no hole check. The order in `wall/tiles.json` is the order the packer tries;
bands remain as authoring groups and their notes are history. Without JavaScript the same
markup falls back to a plain row grid.

`tools/build-wall.js` validates the files and image dimensions and writes the markup.
`test/wall/layout.node.js` checks the data and that `index.html` is current;
`test/wall/masonry.js` measures the real browser at 390, 900, 1400, 1920 and 3840 wide
(every frame measured, no overlaps, nothing outside the wall, no sideways scroll).

## Shared files — append, never rewrite

`wall/tiles.json`, `style.css` and `main.js` collect one entry per tile, and more than
one editor is often adding a tile at the same time. `index.html` is written by
`build-wall.js` between its markers; leave the rest of it alone.

- Append or edit those in place. Never rewrite one of them wholesale.
- Namespace CSS classes and element ids per tile with a short prefix.
- Re-read them at the end of a change to confirm nothing was lost.
- A PreToolUse hook (`.claude/settings.json` → `.claude/hooks/guard-shared-files.js`) refuses a
  whole-file Write to the root `index.html`, `style.css` and `main.js`; Edit is unaffected.

## Running it locally

There's nothing to build — serve the repo root and open the page:

```sh
python -m http.server 8010
```

Then http://localhost:8010/ for the wall, or http://localhost:8010/<slug>/ for
one project. The port is arbitrary; anything free will do. (ES modules need the
server: opening `index.html` from disk will not load `view.js`.)

`test/` drives headless Chrome over CDP from Node against its own server, with its
own `--remote-debugging-port` and a throwaway `--user-data-dir` that it deletes
afterwards, so it can't attach to a stale browser, leaves no profiles behind, and can
be shut down without touching anyone else's. One folder per
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

To tune a game's numbers or place art on a plate by eye, put them through `tune()` from
`lib/tune.js` and open the page with `?tune`: sliders and drag handles, and Copy for the
numbers to paste back. Faster than nudging positions by description.
