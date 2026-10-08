# Image Studio: plan

A photo restyler. Drop in a photo (or use the demo, a bee on a chive flower) and stack
styles on it: ink sketch, watercolour, pixel scene, print effects, optics and dozens more,
each with its own settings, blend and opacity. It can split the photo into the subject and
the backdrop and style them apart. Not a game, so it keeps the old shape (classic scripts
in `js/`) rather than a sim and a view.

## The one loop

**Stack, tweak, download.** Pick a look from the presets or build one layer by layer on
Both, Foreground or Background; watch the live preview; save the look; download the
picture.

Good feels like: one preset turning a snapshot into something you'd frame.

## Rules that are deliberate

- Every style is a plain function over RGBA pixels (`apply(data, w, h, params)`), so
  styles stack and the order is the look.
- A preset is the whole look: every layer on all three regions, with params, blend,
  opacity and colour map. It leaves the separation settings alone, since where the split
  falls depends on the photo, not the look. Save current keeps exactly what is on screen.
- OpenCV (vendored `js/vendor/opencv.js`) is optional: it loads lazily, and anything that
  wants it falls back to plain JS until it lands. Flat Illustration and Pixel Scene wait
  for it.
- Foreground and Background split every pixel exactly; Copy to... makes an independent
  copy of a layer or a whole stack.
- Separate from Machine Imaginaire.

## Art bible

- The photo is the art. The page is a quiet workbench: its own palette in `css/`, the
  preview large, the controls in tabs (Presets, Layers, Styles).
- A style's thumbnail is that style run on the demo photo, so it is right before OpenCV
  has finished loading.

## Open questions

- Eight styles draw through a canvas or need OpenCV, so only the page can run them
  (`bot.node.js` lists them); the other 51 and every built-in look are checked in Node.
- Still the old shape: `filters.js`, `background.js` and `presets.js` hang their exports on
  `window`, and `index.html` loads them as classic scripts with `?v=` cache-busters. Making
  them ES modules would let the page and Node share imports instead of a sandbox.

## Code

- `js/filters.js`: every style (`window.Filters`), the colour maps, and the lazy OpenCV
  loader.
- `js/background.js`: the foreground/background separation (`window.BackgroundSep`).
- `js/presets.js`: the built-in looks (`window.StudioPresets`) and their groups.
- `js/app.js`: the page: loading the image, the three layer stacks, presets (saved ones
  in `image-studio-presets-v1`), the live preview, the download, and the debug handle
  `window.__studio`.
- Tests: `bot.node.js` (every style and every built-in look, in a Node sandbox), and in the
  page `presets`, `copy`, `separation` and `pixel-scene`.
