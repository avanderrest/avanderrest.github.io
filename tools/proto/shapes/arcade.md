# Arcade shape

Use this when the game is made of **real time**: something comes at the player, they move,
and the run ends on a clock or on lives. The heart is the feel of the input and the pace,
not the decisions between turns.

The template is `template/arcade/sim.js`: three lanes, crates falling, forty seconds, three
lives. Replace the threat and the input.

## Step 2 — one round (ask these)

> **1. What is the thirty seconds?** What is the player doing, over and over?
> **2. What is coming at them, and how does it get faster or denser?**
> **3. How does the run end?** A timer, three mistakes, or both?

Propose the run length in seconds and the first threat's speed. Confirm both, because they
are the whole feel of the prototype.

## Step 3 — the pressure

> **1. What does a mistake cost?** A life, a second, the score, nothing?
> **2. What makes it harder over time?** Speed, spawn rate, a narrower space.
> **3. Is there a score, and what does it reward — surviving, or risking?**

## Step 4 — the verbs

> **1. What is the input?** Left/right, aim, one button, a direction?
> **2. Is the input instant or does it have momentum?** (For a prototype: instant.)
> **3. What should the player *not* be able to do?** (Stand still forever, leave the lane.)

## Step 5 — the numbers

> **1. How long is the run?**
> **2. How many mistakes can they make?**
> **3. How fast does the first threat come, and how much faster by the end?**

Propose numbers that make the first ten seconds easy and the last ten busy.

## The state

Usually `S.t`, the moving things, the player's position, `S.lives`, `S.score`, `S.over`.
No resources and no phases.

## Writing `sim.js`

- **All motion happens in `step(dt)`.** The page calls it with the real frame time; the
  checker calls it with 0.05. Never read a clock.
- Spawn from `rnd` and move by speed × dt, so the same seed is the same run.
- Collision is a simple overlap test in the same coordinates the view draws in.
- `actions()` is what the player can press now (often just left/right, with an edge
  disabled). `act()` changes the state immediately.
- End at the timer or at zero lives, and call `on('ending', …)` once.
- A hit can `on('say', …)`; do not log every frame.

## Writing `view.js`

Draw the field on a canvas in `frame` (about sixty times a second) and rebuild the status
pills only when their numbers change — the template shows how. Keep the buttons under the
canvas for fingers, and map the arrow keys. The canvas is capped by the shared stylesheet so
the buttons stay on screen.

## What the checker should show

A run that ends within its own clock — usually on lives, since the bot presses blindly.
Determinism across the same seed. If the bot survives forever, the threat never reaches the
player's line.
