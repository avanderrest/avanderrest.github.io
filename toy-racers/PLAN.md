# Toy Racers: plan

Five toy cars racing round circuits laid out in the clutter all over the house: the
workbench, the bathroom floor, the bedroom rug, the potting bench, the Christmas table,
the cutting mat and the kitchen counter. Top down, with a follow camera.

## The one loop

**Drive a lap, then drive it better.** Three laps against four rivals, slipstream to pass,
a lap record per track to beat.

Good feels like: a slide round the mug that comes out pointing straight down the ruler.

## Rules that are deliberate (Amber's calls, see the Toy Racers notes)

- A follow camera, zoomed in so you only see part of the track; props are spread along
  the lap where you drive past them, not heaped in the infield.
- One theme per track, off her plates. Physics never varies by theme: tubing, steel rule,
  ramp and boost behave the same everywhere and are only drawn differently.
- Every car is the same toy; the drivers differ, and the AI's skill does the separating.
- A plain driver has to be able to finish in the pack without fighting the wheel
  (`fairness.js`: at most 15% of the lap at full lock, 8% off the track, 24 steering
  reversals a minute).
- The handling lessons, each of which looked fine in a screenshot: no corner tighter than
  1.6x the track's half-width; a wall corrects only the normal component; grip scrubs the
  sideways component rather than turning a crash into speed; the AI looks ahead about
  braking distance (~120 units), not a quarter of a lap.

## Art bible

- **Projection:** straight down onto a 2400x1500 desk, each theme's ground photo
  stretched over it.
- **Materials:** Amber's plates per theme (`images/minigames/toy-racers/reference/`), cut
  by `notes/toy-racers-assets/cut_themes.py`; the desk's sheet is background-removed, the
  themed ones are not (border-flood cutting). See `ASSETS.md`.
- **Baking:** everything static (ground, track surfaces, props) is baked into an offscreen
  layer once a race loads; only cars, skid marks and particles are drawn per frame.
- **Cars:** one toy shape in five colours, drawn in code, with a soft shadow.

## Open questions

- None from the bot: the plain driver finishes every track (P1 to P3 on seed 5) and
  every race is counted.

## Code

- `sim.js`: `createRacers({ save, rnd, on })`: constants, surfaces, the seven tracks and
  their themes as data, `buildTrack`, `layOut` and `setupRace`, the physics (`stepCar`,
  props, other cars, slipstream), laps and standings, the AI, the key map (`keys`) the
  page writes into, particles, skid-mark timing, `endRace` and `tick(dt)`. `readSave()`
  for the save. No page access.
- `view.js`: loading a theme's art, baking the scene, the camera, drawing cars, skid
  marks and particles, the HUD and minimap, the countdown, results, menu, touch pads,
  audio, and the save (`toy-racers-save-v2`).
- Debug handle `window.__toyRacers` (also `window.__game`), with the sim as
  `__toyRacers.sim`; `__toyRacers.seedDice(n)` pins the dice.
- Tests: `bot.node.js` (every track, a race to the flag) and `save.node.js` in Node; five
  page cases, `circuit` and `fairness` among them.
