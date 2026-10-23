# Story shape

Use this when the game is made of **situations and choices**: scenes, a room to explore, a
conversation, a mystery. What the player chose is carried, and the last scene reads it.
There is no board, no clock and no resources unless a flag is one.

The template is `template/story/sim.js`: a lighthouse, three scenes of choices, what you
carry, and four ways it ends. Replace the scenes.

## Step 2 — one round (ask these)

> **1. What is the situation, in two sentences?**
> **2. What are the first three things the player can do, and what does each one commit
> them to?**
> **3. How many scenes is one run?** (Five to eight is a prototype.)

There is no "round" here in the economy sense; the whole run *is* the round. Confirm the
scene count and the first scene before writing anything.

## Step 3 — the pressure

> **1. What is scarce?** Time, trust, information, a thing they can only spend once.
> **2. What closes off?** Which choice makes another impossible?
> **3. How does the story end — and does the ending depend on what they carried?**

## Step 4 — the verbs

> **1. What can the player do in a scene?** Two or three choices, or actions like *look*,
> *ask*, *take*?
> **2. Which choices set something down that a later scene reads?**
> **3. What should they *not* be able to do?** (Go back, see the flags as numbers.)

A choice is an action: `{ id: 'open', label: 'Open the door', note: 'see who it is' }`.

## Step 5 — the numbers

> **1. How many scenes, and how many choices in each?**
> **2. How many endings, and what decides between them?**
> **3. Should the first run end well by accident?**

Propose the ending table: the flags each ending needs. Make sure every choice can reach at
least one ending.

## The state

Usually `S.at` (the scene id), `S.flags` (what is carried), `S.path` (what was chosen) and
`S.over`. No randomness is needed; the seed can stay unused.

## Writing `sim.js`

- Keep the scenes in one object: `title`, `text`, `choices[{ id, label, note, set, go }]`.
  A scene with `result(S)` ends the run there.
- `actions()` is the current scene's choices, all `ok: true`. When the run is over, return
  `[]`.
- `act()` applies `set` to the flags, records the choice, says the line, and enters the next
  scene. Entering a scene with `result` evaluates the ending.
- Endings must be reachable from the choices; the checker may not find them all, so walk the
  scene table yourself once and name the path to each.
- `step()` is a no-op.

## Writing `view.js`

Put the prose in `ui.stage` as a scene box; put what the player carries in `ui.status` as a
pill; the choices become the buttons automatically. Do not show flags as keys
(`you_saw_boat`) — write them as words (`you saw the boat`).

## What the checker should show

An ending in as many actions as there are scenes, a different path for another seed only if
the story actually uses `rnd`, and no dead ends. If a run reaches `[]` with no ending, a
scene has no `go` and no `result`.
