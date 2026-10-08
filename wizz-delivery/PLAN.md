# Wizz Delivery: plan

A food-courier shift, after Crazy Taxi and the delivery apps. Drive a car round a small
keep-left town, take orders off the restaurants' boards, pick up, drop off, and chase tips
before the countdowns run you over. Five minutes a shift.

## The one loop

**Pick an order, drive it, get there before the clock.** An order's clock starts at the
pickup. Get it to the door in the first 60% of its limit for the fare and a tip, inside
the limit for the fare, after it for a fine. The town has traffic that keeps left, gives
way, goes round the roundabouts and stops at the lights, and you share the road with it.

Good feels like: a fast drop-off, a tip, and the next order already on the board round
the corner.

## Rules that are deliberate

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

## Open questions

- **Stacking orders loses money.** The premise is to stack deliveries, but a late order
  pays nothing and costs a third of its fare, and limits are tight (about 1.3 s per tile
  of straight-line distance). In the bot test the same careful driver ended a shift +£166
  and +£64 carrying one order at a time, -£43 and -£34 carrying two, and -£129 and +£38
  carrying three. A smaller fine, or a late order still paying part of its fare, would make
  the second order in the bag a real choice rather than a mistake.
- Fixed 2026-10-07: the route arrow treated any pavement as open, including the 254
  pavement tiles with a house or shop on them, so it could lead you into a building.

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
