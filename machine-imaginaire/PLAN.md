# Machine Imaginaire: plan

Generative pictures after artists who worked by rules: Kelly and LeWitt, Molnár, Nees,
Morellet, Vasarely, Riley (stripes and dots), Escher's tessellations, Coxeter's
kaleidoscope, Mohr's hypercube, Hobbs's flow fields, Reas's process and Knowlton's mosaic.
Not a game: a machine that makes a picture from a seed, or from the colours of a photo
you drop in, and lets you share exactly that picture as a link.

## The one loop

**Roll, tune, keep.** A seed and a style make a picture; the sliders change its settings;
a photo changes its palette; "Watch it draw" builds it up; "Set it moving" runs it on.
Copy the link, or download it as a PNG or an SVG.

Good feels like: a photo of a jumper becoming a Kelly that is unmistakably that jumper.

## Rules that are deliberate (Amber's calls, see the Machine Imaginaire notes)

- Every picture is a pure function of seed, style, settings and palette, and the link
  carries all four in canonical form, so a link renders exactly what was on screen.
- Each style builds its scene once, every random decision up front, and paints with
  paint(ctx, t, upto). Movement is a pure function of t: painting t = 0 after t = 3 is the
  still picture again. Reas's process accumulates and resets when t goes back.
- A photo is analysed in the browser and forgotten: five colours and their shares, a 16x10
  light map and an 80x50 tone map.
- Her movement calls: Kelly panels swap with a neighbour by the shortest straight path,
  the least colourful one underneath, no shadow, no shrinking; Molnár squares spin slowly;
  Morellet grids drift; Riley waves roll right to left; Hobbs strands flow like water off
  the end of their current and new ones grow from a spring (never fade out and back in);
  Vasarely draws flat, then swells. Moving is on by default, off under reduced motion.
- Separate from Image Studio.

## Art bible

- **Canvas:** a fixed 2400x1500, whatever the window. The SVG download is drawn by the
  same paint through a stand-in context (`svgContext`).
- **Colour:** the seed's palette or the photo's; the commonest colour is the ground, the
  rest are inks. Swatches are colour pickers (an edited palette counts as a photo).
- **Each style keeps to its artist's rules** rather than an imitation of the look: the
  rules are the picture.

## Open questions

- The notes describe a third batch (Circle limit, Limit set and a three.js Sculpture tab)
  that is not in the code or in git; three.js is vendored and `three.js` tests it, but no
  style uses it yet.

## Code

- `sim.js`: `createMachine({ makeCanvas, makePath, rnd })`: seeded streams (`rngFor`),
  colour and palettes (`encodePal` / `decodePal`), photo analysis (`analyse`), the
  styles (`STYLES`, `ORDER`), the state (`mi.S`), `buildScene()`, the SVG stand-in and
  `pictureSvg(scene, t)`, and the link and save forms (`toQuery` / `fromQuery`, `toSave` /
  `fromSave`). No page access: Reas's offscreen canvas and Path2D are handed in.
- `view.js`: the canvas, drawing in and moving, the photo drop, tabs, sliders and
  swatches, the URL hash and `localStorage` (`machine-imaginaire-save-v1`), downloads.
- Debug handle `window.__machine` (also `window.__game`), with the sim as
  `__machine.sim`.
- Tests: `bot.node.js` (every style, as SVG, deterministic) and `save.node.js` (link and
  save round trips) in Node; ten page cases on the pixels.
