# Wizz Delivery: plan

A food-courier shift, after Crazy Taxi and the delivery apps. Drive a car round a small
keep-left town, take orders off the restaurants' boards, pick up, drop off, and chase tips
before the countdowns run you over. Five minutes a shift.

## The one loop

**Pick an order, drive it, get there before the clock.** An order's clock starts at the
pickup. Get it to the door in the first 60% of its limit for the fare and a tip, inside
the limit for the fare, after it for less and less of the fare (a fine past twice the limit),
and a fifth more for any drop made with another order still in the bag. The town has traffic that keeps left, gives
way, goes round the roundabouts and stops at the lights, and you share the road with it.

Good feels like: a fast drop-off, a tip, and the next order already on the board round
the corner.

## Rules that are deliberate

- **Stacking pays** (2026-10-14). It used to lose money: a late order paid nothing and was
  fined a third of its fare, so the bot ended a shift about +£106 carrying one, +£8 two and
  -£36 three. Now a drop made with another order still in the bag earns 20% of its fare on
  top, a late order pays a share of its fare falling to nothing at twice the limit (fined only
  after that), and limits are 3 s + 1.5 s a tile. Same bot, four shifts: £219 / £283 / £314
  carrying one / two / three, as long as the extra orders go the same way.
- Everybody drives at one speed, you included; E takes you a level over the traffic until
  you slow back down, Q a level under.
- You are never held at a red, only fined for running one. Amber is a warning.
- Paused, the shift stands still: the shift has its own clock (`G.ms`), which drives the
  order deadlines and the signals, so nothing runs on while you are away.
- The board leans towards the restaurant nearest you, so it is rarely bare.
- One fixed town (`MAPS.town`); there is no seed to share.

## Art bible

- **Projection:** top-down, 44 px tiles. Her painted building sheets (`assets/buildings/`)
  for houses, rows, blocks, gardens, trees and the restaurants; streets drawn as curves.
- **Signs:** two restaurants have painted fronts; the other six get a board drawn in code,
  and all eight a dish badge (see ASSETS.md).
- **HUD:** warm brown wood and cream card; Sour Gummy for signs, Nunito for text.
- **After her mock-up** (`images/minigames/new/Gemini_Generated_Image_i5o4mfi5o4mfi5o4.jpg`,
  2026-10-14): the camera sits closer (`viewZoom`, 1.3x the sprites' native size, 1.1x on a
  phone); yellow centre dashes and a white edge line inside each kerb; every restaurant has her
  orange pin with its dish and its name in white over it, the offer bubble beside the pin; the
  drop you are following gets a red crosshair. Not taken from the mock-up: bigger houses (her
  sheets are painted for one tile each) and lane arrows.

## Open questions

- None from the bot: carrying two orders going the same way out-earns one at a time.

## Code

- `sim.js`: `createWizz({ rnd, on })`: the town, lanes, junctions and signals, traffic,
  the car, orders and the shift clock. No page access. `wz.step(dt)` runs it; `wz.input`
  is what the driver is pressing; `wz.G` is the shift.
- `view.js`: painting the town, the cars, markers, minimap, the order board and bag, keys
  and the touch pad, toasts, the summary, and the save (`dash-save-v1`: best shift and
  tallies only).
- Debug handle `window.__wizz` (also `window.__game`).
- Tests: `bot.node.js` (two full shifts driven through the real car) and `save.node.js`
  (the shift's lifecycle and the pause) in Node; nine in-page cases.
