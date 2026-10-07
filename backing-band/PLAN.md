# Backing Band: plan

Hear the band play a simplified pop backing, watch every button light as it is pressed,
then take one instrument at a time and play its part back. Thirty songs and Mega Jam, a
looper over every sound in the band. Grown out of the wall's Pocket Synth.

## The one loop

**Listen, then play it back.** Pick a section, watch an instrument, take its turn and press
what it played, beat by beat. Every part at 100% and the whole band plays your song back.

Good feels like: the riff from a song you know, coming out of your own taps.

## Rules that are deliberate (Amber's calls, see the backing-band notes)

- A song must be **recognisable from the band alone**; Seven Nation Army is the
  benchmark. Prefer a hook that is a rhythm or a riff over a melody that might be wrong.
- Scoring is by order, not timing. Notes on the same beat go in either order. A wrong note
  costs that beat's share and lights the right button, and never sends you back.
- **The singer is flair, not a part**: leads sing by themselves (a distorted,
  vowel-morphing "eeeaaaooo"), with a Vocals switch. They are never scored and never a row
  of buttons. A singer only on a signature vocal (eh-oh, rah rah); no filler oohs.
  Instrumentals (`instrumental: true`) show no switch.
- **Single-note guitar** where the riff allows; chords only for a chord song.
- Ten Easy, ten Medium, ten Hard: a song's load is its three hardest turns, and the songs
  are split into thirds, so the labels stay balanced as songs are added.
- A long note must not look like "hold this": it flashes, then rings half-lit with a
  draining bar, and is one tap.
- Timeline mode never shows where notes belong; its tally says how many are still to
  find, never where.

## Art bible

- **Projection:** a side-on stage, the band drawn in code (`BANDS`, `STAGES`), one look per
  song; below it the rack, a row of rounded pads per instrument.
- **Palette:** each song's stage sets its own colours; the pads take the instrument's.
- **Light:** stage lights in time with the band; a pad lights while its note sounds.
- **Sound is the art:** everything is synthesised (drums from noise and swept sines,
  guitar by Karplus-Strong, the singer by a sawtooth through three formant filters). Next
  step if the guitar is still disliked: real samples (FluidR3 GM, MIT); not yet accepted.

## Open questions

- None from the bot: every song plays through to the whole band, and every part solves
  on the timeline.

## Code

- `sim.js`: `INST`, `SPEEDS`, the songs as data and how they are parsed (`parsePart`,
  `buildVoice`, `problems`), the levels, Mega Jam's buttons (`MEGA`, `byMk`),
  `scoreTimeline`, `freshSave`, `fromV1`, and `createBand({ save, on })`: the state, scores
  (`pctOf`, `sectionDone`, `allDone`) and the verbs `beginTurn`, `pressTurn`, `finishTurn`,
  `keepPct`, `chooseSong`. No page access.
- `view.js`: Web Audio, the band on stage, the rack, lights, playback, the turn on screen,
  the timeline dock and its drafts, the looper, and the save (`backing-band-save-v2`, v1
  carried across).
- Debug handle `window.__band` (also `window.__game`), with the sim as `__band.sim`.
- Tests: `bot.node.js` (every song to the whole band, and on the timeline) and
  `save.node.js` in Node; eight page cases for the sound, the stage and the dock.
