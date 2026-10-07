# lib/: what every game shares

Small ES modules that every game imports instead of carrying its own copy. A helper copied
into each game drifts. The broken noise hash that once made Wizz Delivery's city all
buildings was one of those copies.

| module | what it gives |
|---|---|
| `rng.js` | `mulberry32`, `lcg` (both bit-identical to the games' old copies), `hashString`, `streamFor(seed, tag)`, `hash2(x, y, k)`, `randInt`, `pick`, `shuffle`, `newSeed` |
| `seed.js` | `readSeed()` / `writeSeed()` / `seedForPage(fallback)`: the seed lives in the URL (`#seed=123`), so a world can be shared as a link |
| `save.js` | `store(key, { was })`: versioned localStorage that never throws and moves old keys across once; `setting(key, default)`; `legacyFlag` |
| `audio.js` | `createAudio(prefKey)`: one AudioContext, unlocked on first input, `tone()` and `noise()` building blocks, on/off remembered |
| `loop.js` | `fixedLoop({ step, render })` (fixed-rate steps, so Node tests and the screen agree) and `frameLoop(update)` |
| `debug.js` | `expose(name, handle)`: the window debug handle, also aliased as `window.__game` |

Rules:

- **No page access at import time.** Everything here must import cleanly in Node, because
  each game's `sim.js` imports from `lib/` and is tested in Node.
- **Never copy from lib into a game.** Import it. If a game needs something different, add
  an option here or keep that one thing in the game.
- Changing a generator's output changes every seeded world and breaks saved seeds. Add a
  new function instead.
