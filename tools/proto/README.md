# tools/proto — game flow prototypes

A **flow prototype** is a small playable game that tests one loop: a few screens, a handful
of verbs, some numbers, an ending. It is not a game on the wall — no art, no save, no
polish — and it exists to be played for ten minutes and then either changed or dropped.

The tool is for a local model (qwen3:14b) to build one from a conversation. The **steps are
fixed** — pitch, one round, pressure, verbs, numbers, build, play — and each step asks
questions. The **material changes with the shape of the game**: an economy game is asked
what runs out and what it costs; a puzzle is asked what a move is and what the budget is; an
arcade game is asked what comes at the player and how the run ends; a story is asked what is
scarce and what the last scene reads. Nothing forces resources onto a puzzle.

The model does not need an API key, and the tool never calls a model: you chat to it and
tell it to run this. Images have their own prototype pipeline (`tools/prototype.py`,
`tools/pixel-art.py`); this is the flow half of the same idea.

There are two ways in. The **interview** asks the questions in `GUIDE.md` and the model
writes the brief from the answers. The **given material** path takes a description of the
game and any pictures that show its look, and the model writes the brief from those instead
— asking only about gaps that block the loop. Both end in the same folder, the same
interface and the same checker; the difference is where `BRIEF.md` comes from.

## The four shapes

| Shape | Made of | Likes | Template |
| --- | --- | --- | --- |
| `economy` | rounds, resources, costs, a clock, upkeep | neon-dark, the-corner-shop, furrow | a stall: buy, serve, pay |
| `puzzle` | a board, discrete moves, a budget | marble-run, the-wizards-muddle, letters-to-ashfield | three locked gardens |
| `arcade` | real time, input, lives, a score | wizz-delivery, toy-racers, hollowmarch | three lanes, falling crates |
| `story` | scenes, choices, what is carried | lantern-deep, wayside, willow-mere | a lighthouse and one night |

A shape is about the *material* of the game, not its setting. A shop and a farm are both
economy; a detective and a dungeon are both story if the choice is the game, puzzle if the
board is.

## Starting one

Serve the repo once and leave it up:

```sh
npm run serve            # python -m http.server 8010
```

Make the folder:

```sh
node tools/proto/new.js night-bus "The Night Bus" --shape economy
# or: npm run proto:new -- night-bus "The Night Bus" --shape puzzle
```

Then, in the chat with the model:

> Read `tools/proto/GUIDE.md` and follow it. Prototype slug: `night-bus`, title: `The Night Bus`, shape: `economy`.

If the model cannot run shell commands in your chat, run the commands it shows you and paste
the output back. Everything else happens in the conversation.

### Starting from a description and pictures

If you already have the game written down, skip the interview:

```sh
node tools/proto/new.js --spec my-game.md --ref street.png --ref stall.jpg
# or: --shape puzzle if the guess is wrong, --slug / --title to override the heading
```

- `SPEC.md` is your description, verbatim.
- `refs/` holds the pictures; `LOOK.md` is a measurement of them — palette by area, the
  loud (neon) colours the area palette misses, region averages, brightness/saturation, and
  starting CSS tokens. Nothing is redrawn and no image is shipped.
- `BRIEF.md` arrives with the shape already filled in. The model fills §1–6 from `SPEC.md`
  and `LOOK.md`, and has to list what it invented in §7.
- The shape comes from the words in the description (the print says the scores); pass
  `--shape` when the guess is wrong.

Then the chat prompt is the same:

> Read `tools/proto/GUIDE.md` and follow it. Prototype slug: `night-cafe`. The material is in `SPEC.md`, `LOOK.md` and `refs/`.

Open it while you build:

```
http://localhost:8010/tools/proto/prototypes/night-bus/
```

## What the model writes

Every shape starts from a small, playable example (`template/<shape>/`) plus a shared shell
(`template/_shared/`): the page, the stylesheet, the action buttons, the log, the clock, the
ending card, the debug handle. The model replaces the shape's `sim.js` (the rules) and
`view.js` (how the shape draws), and leaves the shell alone.

On the given-material path the folder also starts with `SPEC.md` (the description verbatim),
`refs/` (the pictures) and `LOOK.md` (their measured palette, accents, regions and light).
Those inform `BRIEF.md` and `style.css`; the page never loads them, and no reference image is
copied into the game.

The shell also has a **Graph** button. A sim that exports `MAP` gets a drawing of its phases,
verbs, states and endings, laid out by `col`; if `createGame` also returns `knobs()`, the
dialog grows sliders that change those numbers in the live run, plus Reset. A sim with no
`MAP` simply hides the button. A map marked `editable: true` whose actions are built from its
nodes gets an **Edit** mode in a full-screen dialog: rename, move between phases, reorder,
add or remove verbs and notes by button, the node's ×, or by dragging its +, rename by
clicking the text, rewire the lines by dragging their ends, and drag the boxes, with the
buttons below following. Edges route around the other boxes by themselves; the canvas pans by dragging
empty space and zooms with the wheel or the header's −/+ and Fit. The economy template derives its map from the `GAME` table (so
it is read-only); Night Café has a hand-written, editable map and fourteen live numbers.

The only fixed contract is the interface, not the state:

```js
createGame({ seed, on }) -> {
  S,               // whatever state this game needs
  actions(),       // [{ id, label, note?, ok, why? }]
  act(id),         // { ok: true } or { ok: false, why }
  step(dt),        // real time, or a no-op
  text(),          // one JSON line for the checker
}
```

`S` can be resources, a board, lanes, flags, anything. That is the point: the checker plays
the game through `actions()`/`act()`/`step()` and never needs to know what a resource is.

## Checking it

```sh
node tools/proto/check.js night-bus
# or: npm run proto:check -- night-bus
```

1. **the material** — `BRIEF.md` is not still empty, `SPEC.md`/`LOOK.md` are consistent with
   each other and with `refs/`, and the shape in the brief is the template the words came
   from;
2. **the interface** — `createGame` and its five parts, and that `actions()` returns
   well-formed actions with unique ids;
3. **the rules in Node** — a plain bot plays three seeds: it uses each verb it is offered,
   steps a timer forward when nothing is available, and must reach an ending without
   throwing, dead-ending or contradicting itself (`actions()` says yes, `act()` says no);
   it prints the ending, the action counts and the final state, then reports which verbs were
   offered but never taken and whether the shape template's own labels are still in the game;
4. **the graph** — `MAP` has unique node ids, known kinds and edges that point at nodes that
   exist; every knob is a number with min < max and a `set`; the page then clicks Graph and
   counts the nodes and sliders it draws;
5. **determinism** — the same seed played twice must be the same run;
6. **the page** — headless Chrome loads it, checks `window.__game`, clicks the first enabled
   `.pf-action` and requires the state to change, fails on console errors, and checks for
   sideways scroll at 390px. It writes `_desktop.png` and `_phone.png` beside the prototype.

`--no-browser` skips 5 while the model is still writing; `--seed 40` starts elsewhere. Exit
code is 0 only when everything passes, and each failure line says what to change — that
feedback loop is what makes a 14B model able to finish.

## Why this and not a fixed schema

The first version of this tool asked every game for resources, costs and phases. That is
right for neon-dark and wrong for a puzzle or a story: it invites a model to bolt a shop onto
a board game. The questions now come from the shape, and the rules are ordinary code with a
thin, testable interface. Four worked examples are enough to show the model what each kind
of game looks like; it is free to diverge, as long as the interface holds.

The cost is that a shape's example is opinionated (a stall, a garden, lanes, a lighthouse).
The guide says plainly: replace every word and every number; keep the engine only if it
fits.

## When a prototype is worth keeping

Nothing in `prototypes/` is committed. If one is good:

1. copy its `sim.js` into a new `<slug>/` folder named after the game;
2. write a `PLAN.md` from its `BRIEF.md` (the loop, the deliberate rules, the art bible);
3. give it the art, the touch pass and the tests the other games have;
4. add the tile to `wall/tiles.json` and run `node tools/build-wall.js`.

The prototype stays as the reference for the rules — the numbers and the loop — while the
real game grows around it.
