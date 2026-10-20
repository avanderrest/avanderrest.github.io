# Photo Splats

Photos turned into 3D Gaussian splats you can turn and look around. A gallery made from my
photos, and a maker that does the same to a visitor's own photo, in their browser. On the
wall since 2026-10-17, in band M.

## The one loop

Open a scene, and it sways a little to show it is 3D. Drag to turn it, until you hit the edge
of what the photo saw. Then try your own photo.

## Rules that are deliberate

- **It opens on the photo.** A scene made from a photo starts from the photo's own camera,
  at the photo's own field of view (fitted to the canvas). So the first frame is the photo,
  and turning shows it is 3D. It turns about the subject: the 30th percentile of splat
  distance.
- **An orbit limit, eased, not walled.** A single photo only saw one side. Every photo that
  carries its pixels — all gallery scenes and every photo you make — wraps them into a
  surround, so it turns all the way round into a soft smear of its own colours, not the
  clear. Object scenes (LGM) turn all the way round too; a dropped .ply/.splat without a
  photo keeps a narrow limit. A drag can push past the limit, and the view springs back on
  release.
- **The sway waits.** It starts 3 s after the last touch, grows over 2 s, and is added on top
  of the pose (never into it), so it never fights a hand. Up to 9° or 45% of the limit,
  whichever is less. It can be turned off; that is remembered.
- **Two ways to make one, both in the browser, nothing uploaded.**
  - *Quick*: Depth Anything V2 Small (Apache-2.0, q8, about 27 MB) through Transformers.js
    4.3.1, on WASM so it runs anywhere. One splat per pixel of a 420 (Light) or 760 (Fine)
    grid, pushed back to its depth. Depth is disparity-like, so it is mapped between 1/near
    and 1/far and inverted. Near is 1, far is the Depth slider (1.2 to 8, 3 by default).
    Where depth jumps by more than 7%, three splats in the far pixel's colour are laid along
    its line of sight across the gap, so turning shows a smear, not a hole. Every splat
    faces down its own ray, so from the photo's view a fill splat is a dot, not a streak.
  - *Full 3D*: Apple's SHARP through ONNX Runtime Web 1.30.0 on WebGPU. The weights are
    buildoak/sharp-onnx on Hugging Face, pinned to a revision: a 1.9 MB graph and a 2.6 GB
    sidecar, kept in Cache Storage after the first download. The postprocessing is Apple's
    `predict_image`: the image squashed to 1536², `disparity_factor = f / W`, and the NDC
    output unprojected by diag(W/2f, H/2f, 1). Covariances are squashed, then decomposed
    back to scale + rotation. Colours are linear and go to sRGB, as SHARP's own .ply export
    does. Splats under 2% opacity are dropped, and the most visible million kept.
  - The lens is the photo's EXIF 35mm-equivalent focal length if it has one, else SHARP's
    30 mm guess.
- **Kept, not uploaded.** "Yours" is IndexedDB, the 8 most recent. A depth scene is kept as
  its grid photo and depth map (about 2.5 MB), so the slider can reshape it later. A SHARP
  or dropped-in scene is kept as .splat bytes.
- **Any .ply or .splat dropped on the page opens.** Downloads are .splat (32 bytes a splat,
  every web viewer) or standard 3DGS .ply (SuperSplat, Brush, Blender).
- **Licences.** SHARP's weights are research-use only (Apple's model licence), so the page
  asks before the 2.6 GB download and says so. The gallery files are made from my own photos.

## Art bible

Dark room, warm light: `--bg` #16151c with a plum glow top left, `--glow` #f5b971 to
`--glow-2` #e8875e (a sunset gradient on the title), `--sky` #8fb8e8. Fraunces for titles,
DM Sans for the body, like the wall. The viewer is the picture. Nothing is painted over it
but a hint pill and a toolbar that fades in from the bottom. The canvas background
(#121117) is close to the room, so a scene's ragged edge reads as a vignette, not a hole.

## The renderer

`render.js`, WebGL2, written for this rather than vendored. The splats sit in four
textures, 1024 to a row (centre, covariance in two parts, colour). One instanced quad per
splat. The vertex shader projects the covariance (EWA, with a 0.3 px low-pass), takes the
ellipse's axes, and stretches the quad to 3σ. Blending is premultiplied, back to front. The
order comes from `sort-worker.js`: a 16-bit counting sort, about 80 ms for 1.2 million in
Node. A new sort is asked for whenever the eye moves by 0.4% of the orbit distance, and
the previous order is drawn meanwhile.

## Looks

A Look picker under the viewer repaints the scene live, as you turn it; the choice is saved,
and Picture saves the view as a PNG in its look. Each look is two optional parts
(`STYLES` in `render.js`): a splat footprint, and a screen pass over the finished picture.

- **Oil paint**, after the Corridor video's painted splats: every solid splat (over 30%
  opacity, a little over half of them) becomes a brush stroke, 13 to 90 px long, laid along
  the splat's long axis. A round splat takes its direction from a slow swirl through the
  scene, so neighbours lie the same way. The stroke has a round head, a dry, bristly tail and
  a lighter ridge down the middle. The screen pass lights those ridges from the top left
  (impasto) and lays the picture on a woven canvas.
- **Watercolour**: wider, thinner washes with a ragged edge where the pigment pools. The
  screen pass wobbles them (bleed), darkens where a wash ends, granulates the shadows, lets
  the lights go to bare paper, and multiplies the lot onto paper.
- **Pointillist**: a saturated round dot for every other solid splat, at least 3.6 px, on
  cream paper.
- **Pencil** and **Comic** are screen passes only. Pencil: Sobel outlines, then three layers
  of hatching by tone. Comic: four flat bands of colour, black outlines, a halftone in the
  darkest band. Both lift the tones first, since photos are mostly dark.

These are filters in the renderer, not a new scene: the research methods that restyle
splats from a style image or a prompt (StyleGaussian, G-Style, CLIPGaussian, Stylos)
retrain the splats on a GPU in Python for minutes per scene, so they could only ever make
gallery scenes ahead of time.

## Making the gallery

`node tools/photo-splat.js <photo> photo-splats/gallery/<id>.splat` runs SHARP through this
page in headless Chrome on the GPU (an RTX 5080 does a photo in about 11 s). It keeps the
350,000 most visible splats (about 11 MB) and prints the `gallery.json` fields. A .ply made
any other way (SHARP's own CLI, LGM, Brush) goes through `tools/splat-pack.js`. An LGM
object wants `--flip` and `"object": true`.

**Invented surround.** A single photo leaves black or white void once you turn. Every photo
turns all the way round into a surround: a sphere of splats just past the rebuilt world, so
the photo sits in front and covers it and the opening frame stays the photo. Two ways:

- *From the photo itself* (`splats.js`: `equirectFromPhoto` + `withPhotoSurround`) — the
  default for every scene that has its pixels, gallery scenes and everything you make alike.
  It edge-extends the photo into a 360° equirect and blurs it, so past the photo is a soft
  smear of the photo's own colours.
- *Painted* — a hand- or LLM-painted equirect under `gallery/surrounds/<id>.jpg`, baked
  ahead of time for a gallery scene that wants something specific:

```
node tools/splat-surround.js gallery/<id>.splat gallery/surrounds/<id>.jpg gallery/<id>.splat
```

  The tool fills the whole sphere (`--front` clears a forward cone instead if a scene needs
  it). Set `"surround": true` on that entry so the page skips the photo-derived one; Lizards
  ships with one. Looks (oil, pointillist, …) restyle the shell the same as the photo splats.

`gallery.json` entries are `{ id, title, img, file, made, width, height, focal, orbit?,
object?, surround? }`; `img` is the photo the photo-derived surround is built from. The
.splat format has no room for the photo's size and lens, so they live in the JSON.

## Open questions

- Gallery files are 10.7 MB each at 350,000 splats. The .spz format would be about a
  quarter of that, but v3/v4 differ in rotation packing and axes, so it was left for now.
- The turn centre is a splat-count percentile, so a scene that is mostly background turns
  about the background (the viewer test's ball-and-wall does).
- SHARP on a phone or a small GPU: the page asks first and says 8 GB, but nothing measures
  the GPU's memory before the 2.6 GB download. `maxBufferSize` is only a hint.
- The photo-derived surround smears a photo's own colours behind it; an in-browser
  inpainting model that imagines (rather than smears) the hinterland is still not to hand.
- A simpler 2D path that reaches a similar oil / pointillist still without Full 3D is parked
  in `ideas/for later`.

## The wall tile

`wall/partials/photo-splats.html`, a partial rather than a plain game tile, so the thumbnail
can be `images/thumbs/photo-splats.webp`: one loop of the page's own sway on the Lizards
scene (56 frames at 125 ms, 760x475, quality 70, about 1.3 MB, lazy-loaded). Anyone who
asks for reduced motion gets the still `photo-splats.jpg` through `<picture>`. The frames
were shot through `tools/cdp.js` with `sim.step` frozen and `cam.t` set per frame, panned
(0.08, -0.01) and zoomed 0.85, so the lizard sits in the left two-thirds the tile shows.

## Code layout

- `splats.js`: the scene format, .ply / .splat read and write, SHARP and depth conversion,
  surround shells, covariances, pruning, the sort, EXIF. Page-free, shared by the page, the
  workers, the tools and the tests.
- `sim.js`: the camera (orbit, limits, flick, sway, zoom, pan) and the saved settings.
- `render.js`: the WebGL2 renderer, and the looks (`STYLES`, the footprints in the splat
  shaders, the screen pass in `POST_FRAG`).
- `view.js`: the page: gallery, maker, IndexedDB shelf, input, downloads, the debug handle
  `window.__splats` (`makeFromUrl(url, 'depth' | 'sharp')`, `show(scene)`, `text()`).
- `sort-worker.js`, `depth-worker.js`, `sharp-worker.js`: the workers.
- `gallery/`: `gallery.json` and the .splat files.
- Tests in `test/photo-splats/`: `formats.node.js`, `bot.node.js` (the camera), `save.node.js`,
  `viewer.js` (pixels and pointer input), `looks.js` (every look draws and differs) and `depth.js` (the real depth model end to end).
