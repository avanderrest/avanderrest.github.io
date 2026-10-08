# Pocket Pal

A virtual pet in a little room: 90s Tamagotchi care, a hand for a cursor, and tricks taught
the *Nintendogs* way, with a drawn gesture and a spoken word.

## The one loop

Look after it (four bars), stroke it, and teach it tricks. Teaching works like this. Pick a
trick, **draw its gesture** anywhere off the pet, and it strikes the pose and holds it for
seven seconds. **Say the word** while it holds, and that's one good try. Three good tries
and the word is learned for good. A learned trick then fires on the word alone or the
gesture alone, if the pet is in the mood. Learning a trick unlocks the next.

## Rules that are deliberate

- **Nothing dies, nothing is lost.** Bars fall in real time while the page is open: tummy
  empties in about 80 minutes, happiness in about 2 hours. Time away counts half-rate,
  never below 18%, and at most 10 hours; the pet naps meanwhile, so energy comes back. A
  pet below 6 energy puts itself to bed.
- **Obedience depends on mood.** Below 12 energy or 12 tummy it refuses and says why.
  Otherwise the chance is 0.55 + 0.45·(its lowest of happy, energy+20, tummy+20) +
  bond/400 (capped +0.15). The bot's cared-for pet obeys about 96%.
- **A drag that starts on the pet is a stroke; a drag anywhere else is a gesture.** A tap on
  the floor calls it over; a tap on the pet is a pat. Round-and-round strokes count up to
  double. In the bath the hand is a sponge and strokes clean instead.
- **Words are matched loosely**, because recognisers mishear one short word: exact, a
  trailing s, one letter off, the same rough sound-shape (`soundKey`), a small list of
  heard-for-real aliases ("Paul" for paw, "Big." for beg), run-together words ("Rollover."),
  or just the first word of a long command. Noise ("Thank you.", "[BLANK_AUDIO]") matches
  nothing. You can choose your own word for a trick that isn't learned yet; changing it
  restarts that trick's lessons.
- **Its name is a command too**: saying it makes the pet come running, and wakes it.

## Voice

`voice.js` opens the mic through Web Audio only for one utterance at a time. It has a
level meter and an adaptive noise gate: speech has to be 0.12s above 3.2× the noise floor,
it ends after 0.55s of quiet, and it gives up after 4.5s of nothing. So silence is never
sent to be transcribed, which is where Whisper invents "Thank you." Two engines:

- **Whisper tiny.en** (`onnx-community/whisper-tiny.en`, q8, WASM) through Transformers.js
  4.3.1 from jsDelivr, in `voice-worker.js`. This is the default: private, about 40 MB once,
  then cached. Measured 2026-10-08 in headless Chrome: about 9s to load from a cold cache,
  about 1.5s per word. With Windows' SAPI voice it heard "Sit." "Spin." "Dance."
  "Rollover." "Big." (beg) "Moshi" (Mochi), all matched, and "Cool." for paw, which is not.
- **The browser's Web Speech API**, where there is one. Quicker, but Chrome and Edge send
  the audio to their speech service. Offered in the "Ears" box.

The "Say …" button stands in for the mic everywhere, so the game is fully playable without
one. TensorFlow.js Speech Commands was considered and left out: its vocabulary is fixed (yes,
no, up, down, digits…), so it couldn't learn "sit" or a player's own word.

## Art bible

- **No image files.** Everything is canvas paths in `art.js`, in room px (960×600, 8:5).
  The room is painted once into an offscreen canvas and repainted every quarter hour. The
  window shows the real local sky (dawn, day, sunset, stars and a moon), and at night the
  room dims with a warm lamp glow; it dims further while the pet sleeps.
- **Look**: soft storybook flat colour with a warm brown outline (`#6b4a3a`) on the pet and
  the HUD. The palette is pastel blue wall, honey floorboards, cream rug, sage-mint UI frame
  (`--mint`), honey accent buttons. Fonts are Baloo 2 for titles and Nunito for the body.
- **The pet** is a chibi puppy: a big head, a scalloped fur edge (`fluff`: an ellipse plus
  tufts, outline then an inset fill), floppy ears over the sides of the head, and a plume
  tail. The shading is a radial light top-left. Five coats are in `COLOURS`. Every movement
  is a **pose** (`REST` in art.js, `poseFor` in view.js): lift, roll, x-turn for spins,
  body squash, head offset and tilt, ears, eyes (open, happy, closed, half, wide, squint),
  mouth (smile, open, tongue, chomp, o, yawn, flat, frown), paw and foot offsets, and tail.
  A new trick is a new branch in `trickPose`, not new art.
- The pet is scaled 1.3 × depth (0.82 at the back of the floor to 1.1 at the front).

## Open questions

- The bot's cared-for pet never drops below 75 happiness: stroking and lessons are
  generous. That's fine for a cosy pet, but there's room for happiness to matter more.
- A neglected pet with the tab open reaches 0 tummy and happiness in 4 hours, though it
  sleeps itself back to energy. Nothing bad happens at 0; maybe it should sulk visibly.
- Whisper on WebGPU would be faster than WASM's 1.5s, but it's untested here.
- More tricks (play dead, high five), and toys beyond the ball.

## Code layout

- `sim.js`: the rules (`createPal`), the gesture reader (`readGesture`) and word matching
  (`bestCommand`). Runs in Node.
- `view.js`: the canvas, the pointer (stroke vs gesture), the panels, sounds, saving
  (`pocket-pal-save-v1`, `{ state, at }`; `at` feeds `away()`), and the debug handle
  `window.__pal`.
- `art.js`: room, pet, hand, bowl, ball, particles.
- `voice.js` + `voice-worker.js`: the mic and the two engines.
- Tests in `test/pocket-pal/`:
  - `bot.node.js`: six hours of care and every trick taught
  - `save.node.js`: a save round-trip and time away
  - `gesture.node.js`: shapes and misheard words
  - `controls.js`: the real pointer and buttons
