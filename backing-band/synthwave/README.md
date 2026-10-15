# Synthwave machine (parked)

Moved here from the Physics Playground on 2026-10-15 because it is closer to Backing Band
than to the physics toys. **Nothing loads these files yet**: Backing Band does not import
them, and they are not a page of their own. Amber is deciding what to do with it.

- `synth-sim.js` — the rules, no page access: nine knobs (`KNOBS`), twelve voices, sixteen
  pads (a voice and a note each), a four-track sixteen-step sequencer and three grooves
  (`GROOVES`). `createSynth({ on })`.
- `synth-view.js` — the rig as plain DOM: an oscilloscope, SVG knobs (drag, wheel, arrow
  keys), the pads (keys 1–4, Q–R, A–F, Z–V), the sequencer scheduled 120ms ahead on the
  audio clock, and every voice built from oscillators, noise and filters through
  drive → echo → volume → analyser. `createSynthView({ sim, root, audio, save })`, where
  `audio` is `createAudio(...)` from `lib/audio.js`. It also expects buttons with ids
  `sy-play`, `sy-groove`, `sy-bpm`, `sy-bpm-out` and `sy-edit` somewhere on the page.
- `synth.css` — its styles: the sunset, the neon panels, knobs, pads, sequencer.

To bring it back as a page: an `index.html` with `<div class="synth" id="synth">` and that
control bar, `../../lib/touch.css`, a `--mono` font token, and a few lines of `view.js`
calling `createSynthView` and `draw()` / `tick()` each frame. Its save shape was
`{ knobs, pads, bpm, groove, pattern, notes }` in the playground's save.
