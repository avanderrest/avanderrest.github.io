# Furrow: plan

A village you lay out from above, then live in, after Banished and Stardew Valley. Four
people and a handcart on a green by a river; everything you mark out, they raise. Then
take anyone's place for a day and walk it in their boots.

## The one loop

**Mark it out, watch them build it, then go and live in it.** From above you place
buildings and hire people into them; the villagers keep their own day (up at six, work,
lunch, work, supper, the tavern, bed) and the whole village runs on what they carry to the
barn. Living as someone, you eat when hungry and work through today's list, and every task
done earns renown, which with headcount opens the better buildings.

Good feels like: a newcomer walking down the road because there was a spare bed, food in
the barn and water at the well, and you having made all three happen.

## Rules that are deliberate

- No money. Logs and stone come out of the barn; food comes out of it too.
- Newcomers need a bed each, food in store, a well's worth of water, and folk cheerful
  enough; `wants()` says which is short, and the evening notice shows it.
- The jobless pick pockets; three lifts make a thief, and a thief caught four times is run
  out. A job puts a thief straight.
- Felled trees do not regrow on their own: that is the forester's job.
- The valley is the seed's (`#seed=` in the address): ground, river and trees. What the
  villagers decide comes from separate dice.

## Art bible

- **Projection:** top-down, 16 px tiles; Kenney's Tiny Town and Tiny Farm (CC0) in
  `assets/`. People, water, path edges, pens, stalls, the camp and the HUD are painted in
  code to sit with them (see ASSETS.md).
- **People:** 12x18, head + body + legs templates, coloured from palettes; five haircuts,
  which is what the barber changes.
- **Light:** day and night tint over the whole valley; the small hours run fast when
  everyone is abed.

## Open questions

- **Newcomers arrive with nothing to do.** In the bot test (three valleys, twenty days,
  building for whatever the village says it is short of) every village grew to 22-24 and
  nobody went hungry, but 3 to 6 people a valley turned thief for want of work and were run
  out. `wants()` counts beds, food, water and mood, not jobs: an opening or two could be
  one of the things that draws people down the road.
- `wants()` only reports food once the barn is already low. One field feeds about a dozen
  (a crop every day and a half), so a player who builds houses for every "no spare bed"
  starves the village about day 12. The notice could warn on food per head instead.

## Code

- `sim.js`: `createVillage({ rnd, on })`, the valley, buildings, villagers, their AI, living
  as someone, the clock, and `serialize()` / `restore()`. No page access.
  `w.B` and `w.V` are always the same two arrays, so the view holds on to them.
- `view.js`: painting the valley, people and HUD, the tools, input (keys go into `w.keys`
  and `w.pressed`), sound, the panels, the evening notice, the barber's and tailor's chair.
- Debug handle `window.furrow` (also `window.__game`).
- Tests: `bot.node.js` (twenty days of building for what the village asks for) and
  `save.node.js` (round trip, same seed same valley) in Node; twelve in-page cases.
