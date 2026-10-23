# Puzzle shape

Use this when the game is made of **moves on a board**: a grid, a route, a locked room, a
sequence. The player moves or turns something, the position changes, and a budget (moves or
time) closes the run. There are no resources unless the puzzle is about them.

The template is `template/puzzle/sim.js`: three small gardens on a 7x7 grid, keys, a door,
a budget of moves. Replace the three maps and the budget.

## Step 2 — one round (ask these)

> **1. What is the board or the space?** A grid, a map, a set of rooms, a row of pieces?
> **2. What is one move?** What does the player change, and what changes back?
> **3. What is the goal of a level, and what stops them reaching it?**
> **4. When does the run end?** A number of moves, a number of levels, or both?

Propose them back as a concrete level, e.g. "seven by seven, two keys, a door, eighteen
moves". Confirm the budget — it is the whole of the pressure.

## Step 3 — the pressure

> **1. What is the budget?** Moves, time, a resource, or the order of operations?
> **2. What makes a move bad?** A wasted move, a wrong order, a one-way door.
> **3. Can the player get stuck with no move left?** (If yes, give them *wait* or *undo*.)

Do not add money or a shop to a puzzle. The tension is the budget and the arrangement.

## Step 4 — the verbs

> **1. What can the player do on their turn?** Move, turn, push, place, take, open, wait.
> **2. Which of those are free, and which spend the budget?**
> **3. Which verb is the mistake they will make — and how does it show?**

Confirm the list with directions or targets. If a verb needs a target, the id carries it:
`'up'`, `'turn:left'`, `'place:2,3'`.

## Step 5 — the numbers

> **1. How big is a level, and how many levels is a run?**
> **2. How many moves does a careful player need, and how many do they get?**
> **3. Should a first-time player finish the first level?**

Propose: the board, the number of keys/locks, the budget per level, the number of levels.
A careful path plus two or three spare moves is a good budget for a prototype.

## The state

Usually `S.level`, the player's position (or the board itself), `S.moves`, what has been
collected, and `S.over`. The seed can pick a generated board; a fixed board is fine too.

## Writing `sim.js`

- Keep the board in a readable form (an array of strings is fine) and write one `at(x, y)`
  helper; every rule reads through it.
- `actions()` returns one action per direction, with `ok: false, why: 'a hedge'` for a
  blocked move. The page then shows why the button is off.
- `act()` repeats the same test, moves, spends the budget, and checks the ending.
- Always leave a legal move: `wait` (costing one move) stops a bot or a person being stuck
  with nothing to press.
- Level completion resets the board and the budget; the last level sets the ending.
- No `step()` needed unless a level has a clock.

## Writing `view.js`

Draw the board on a canvas in `paint`: tiles, the player, keys, the door, and mark what is
taken. Put moves and collected things in `ui.status`. Map the arrow keys and the buttons to
the direction ids. The board must fit a phone — the shared stylesheet caps the canvas.

## What the checker should show

An ending (usually the budget running out for a random bot), no action ever offered that
`act()` then refuses, and the same board for the same seed. If the bot reaches no ending,
the budget or the ending condition is wrong.
