# Willow Mere

A cosy rowing game on a storybook lake. Built 2026-10-08 from the lake idea in `ideas/`
(Wind in the Willows, A Short Hike). No failure states, no timers, no combat.

## The one loop

Row about. Fish litter out as you pass over it; when the boat is full (8, an old tyre
counts 2) row back and she empties into the crate on the jetty. Glide gently up to lost
ducklings and cygnets and they fall in behind your wake; lead them to their mothers by
the reeds. Come alongside an animal adrift on a log, crate or branch and it hops aboard;
take it home. Stop beside a bird caught in fishing line and hold E to free it. When all
of that is done the mere is tidy and you can row on to a new lake (a new seed). The
light goes round meanwhile: misty dawn, day, golden hour, dusk, a starlit night with a
lantern on the bow, every ten minutes.

## Rules that are deliberate

- **Each oar is its own stroke.** A stroke is 1.05 s: 0.42 s of pull (thrust shaped like
  half a sine) then the recovery. Holding a key keeps an oar stroking; holding both keeps
  them together (an oar joins the other if it is early in its pull, otherwise waits for
  the next catch). Pressing again in the last 0.3 s before the catch pulls 1.2x: the
  rhythm is rewarded, never required. Forward drag is light (the glide); sideways drag is
  heavy (the keel), so she goes where she points.
- **A/← turns left by pulling the right-hand oar**, and the other way round. With W held
  too, the inside oar rests, so you turn while making way.
- **The young startle only if you row straight at them** faster than 58 px/s within
  105 px. One stroke from rest already peaks near 60, so a player who stops rowing and
  glides in is fine, and passing alongside is fine. The first rule (any speed over 50
  within 120 px) gave the bot 114-140 startles a lake.
- **The young are collected, not handed over** (Amber, 2026-10-08: "the ducks shouldn't
  always follow the boat"; "you collect the ducklings then take them to mum"). None starts
  within about 440 px of the boat. One only follows a boat that waits beside it (within
  80 px, under 30 px/s) for 1.2 s, turning to look at her while it decides, with a ring
  filling over its head. Following, it paddles at most 82 px/s, so racing off flat out
  leaves the tail behind: over 120 px back for 2.5 s and it is lost again where it stopped.
- **Followers keep 40 px off the boat** and 13 px off each other: they chase points along
  the boat's trail, and a boat bouncing back off a bank reverses over her own trail,
  which once parked all three under the hull.
- **Banks bump, never stop.** The boat checks three points along her keel against the
  distance field and is pushed out with a little spin.
- **Nothing is lost.** Untangling progress stays when you let go; a full boat just leaves
  the litter in the water; a shared `#seed=` link starts that lake fresh but keeps your
  count of lakes tidied.

## The lake

Every body of water and island is a wobbly ellipse (a radius with harmonics 2-6). The
lake is the main one plus two or three bays, less one or two islands. One 8 px grid holds
a signed distance to the bank (positive on the water), from which come collisions, depth
colour, placement and which water the boat can reach from the jetty. Everything placed
(litter, the young, rafts, tangled birds, nest anchors, homes) is checked against that
reachable set. Streams: `lake`, `litter`, `young`, `friends` in the sim; `decor`, `water`,
`life`, `bank` for the paint, so the look is part of the seed too.

## Art bible

- **Projection:** straight down for anything on the water, with the land seen a little
  from the south: trees stand up the screen, far banks show a 9 px earth face, and trees
  close above the water hang a soft, foreshortened (x0.55) reflection below them.
- **Paint, not pixels:** layered circles in four tones (shadow, mid, light, highlight)
  for canopies and bushes, thousands of low-alpha dabs for grass and water, nothing
  outlined in black. Litter is the only bright, saturated colour, so it reads.
- **Palette:** grass `#7ea459` with `#a7c574` lip; earth `#8b6343`; water from
  `#a1c6ae` in the shallows to `#467f8f` deep; wood `#7b4f2e`; paper HUD `#f6edd9` with
  ink `#4a3a2a`. Fonts: Fraunces for titles, Patrick Hand for everything else.
- **Light:** a multiply tint per time of day (keyframes in `SKY` in `view.js`), a screen
  glow at dawn and golden hour, drifting mist in the morning, and at night warm lights
  added back into the tint (lantern, cottage windows, the jetty), then stars in the water
  and fireflies drawn additively over the top.
- **Scale:** the boat is 64 px long; a duckling 13, a swan 44. The camera shows about
  560 world px across the window's shorter side.

## Sound

All synthesised through `lib/audio.js`: a splash, a creak and a drip per stroke (and a
chime on a stroke in time), brown-noise water that swells with speed, quacks, peeps,
plops from frogs, chimes for every homecoming. The music is a slow D-major pentatonic
wander over D-Bm-G-A whose tempo (62-92) and density follow how fast you are rowing,
an octave lower and sparser at night; birdsong by day, crickets and an owl by night.

## Open questions

- The bot tidies a lake in 4-6 minutes of game time; a person will take longer. Is one
  lake the right size, or should a lake have a second, smaller round (litter washes in
  overnight)?
- Phones row by holding a finger on the water. Two on-screen oars would be more tactile;
  worth trying if it plays flat on a phone.
- The young of a finished family circle their mother forever; they could go up onto
  the bank to sleep at night.
- Ideas for more to find: a missing lure, a message in a bottle, a heron that only
  fishes at dawn.

## Code layout

- `sim.js`: the lake (`buildLake`), what lives on it (`populate`), and `createMere`
  with the verbs `row({ L, R, back })`, `help(on)`, `newLake(seed)`, `step(dt)`.
- `art.js`: `paintLand` and `paintWater` (once per lake), then small per-frame painters
  for the boat, birds, litter, rafts, lilies and the edge badges.
- `view.js`: camera, frame, water effects, the light, input, sound, HUD and dialogs.
  Debug handle `window.__mere` (`teleport`, `setClock`, `freeze`, `toScreen`, `text()`).
- Tests: `test/willow-mere/` has the bot (three lakes finished through `row()`), the
  save case, `rules.node.js` (the young are collected: trust, keeping up, a far start) and
  `controls.js` (real keys and a held pointer in the page).
