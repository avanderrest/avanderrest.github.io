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
- Newcomers need a bed each, food in store, a well's worth of water, **work** (an opening, or
  two hands per building site, over and above anyone already idle), and folk cheerful
  enough; `wants()` says which is short, and the evening notice shows it. Before 2026-10-14
  work was not counted, and 3-6 a valley turned thief and were run out.
- Food is warned about ahead of time: a staffed field feeds about five (`FEEDS`, measured),
  and the notice says so once headcount passes what the farms feed and the barn holds under
  three meals a head. It used to speak only once the barn was nearly empty (starving about
  day 12 for a player who built only houses).
- The evening notice also names anyone out of work ("Idle hands"), so a thief is the price of
  not keeping up, not a surprise. Amber wants the thieving kept as that consequence.
- Anyone hired spends the first hour after lunch on a building site, if one is going up; else
  a fully hired village never raises what is marked out.
- The jobless pick pockets; three lifts make a thief, and a thief caught four times is run
  out. A job puts a thief straight.
- Felled trees do not regrow on their own: that is the forester's job.
- **Indoors (2026-10-14).** Living as someone, walking into the door of a house or a walled
  workplace takes you inside (`goIn`; fields, pens, the well and the camp have no room). A room
  is `max(6, w*2+1)` by `max(5, h*2)` floor squares (`roomOf`, made on first visit with the
  building's own fixtures: oven, anvil, loom...). Indoors only that building's business is on
  offer, as if you stood at its door; you leave by walking out of the doorway.
- **Furniture** is bought with logs, stone or wool from the barn (`FURN`, `buyFurn`), set down on
  the free floor nearest you, picked up and moved (`moveFurn`), or put back for what it cost
  (`sellFurn`). Fixtures and the beds stay. A home's **comfort** is how many different kinds of
  furniture it has beside its beds (up to 5), worth 1.5 mood each to the people who live there.
  Furniture in a workplace is for show.
- **Friends**, kept simple (Amber: "don't want something too complicated"): a number per pair,
  -50 to 100 (`befriend`, `v.rel`). A chat (once a day a pair, +8), a gift (+10), sharing a house
  (+3 a morning) or a workplace (+2) warm it; being caught at someone's pocket costs -20 with
  them, -10 with the witness. 30 is a friend, 60 a close friend; each friend is +2 mood (up to
  6), friends greet you by name, and the wary say so. The villager card lists who they know.
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

- Villagers never go indoors themselves (only you do), so rooms are empty but for you. Seeing
  housemates asleep in their beds, or the baker at the oven, would make them feel lived in.
- Friendship has no story yet beyond mood and greetings: moving in together, or gossip about a
  thief (pinned in `ideas/for later`), are the obvious next steps if it wants more.

- None from the bot: three valleys grow to 13-15 in twenty days with nobody hungry, when
  the player builds for what the evening notice asks for.

## Code

- `sim.js`: `createVillage({ rnd, on })`, the valley, buildings, villagers, their AI, living
  as someone, the clock, and `serialize()` / `restore()`. No page access.
  `w.B` and `w.V` are always the same two arrays, so the view holds on to them.
- `view.js`: painting the valley, people and HUD, the tools, input (keys go into `w.keys`
  and `w.pressed`), sound, the panels, the evening notice, the barber's and tailor's chair.
- Debug handle `window.furrow` (also `window.__game`).
- Tests: `bot.node.js` (twenty days of building for what the village asks for) and
  `save.node.js` (round trip, same seed same valley) in Node; in-page cases, `indoors.js` for
  rooms, furniture and friends.
