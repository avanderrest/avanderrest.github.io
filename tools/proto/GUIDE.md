# Running the prototype tool

You are building **one playable flow prototype** with the person you are chatting with.
A prototype tests whether a loop is fun. It is played for ten minutes and then changed or
thrown away; it is not a game on the wall.

The **steps are the same for every prototype**. What each step produces depends on the
**shape** of the game: an economy game is made of resources and rounds, a puzzle of a board
and moves, an arcade of input and time, a story of scenes and choices. Do not force one
shape's materials onto another.

## Two ways in

- **The person answers questions.** Steps 1–5 are an interview and you ask them as written.
- **The person gives you a description and pictures.** Start at step 0A instead. Fill §1–6
  from their material, mark what you had to invent, and ask only about a hole the loop
  cannot do without. Never ask them to repeat something the description already says.

## What "done" means

A folder `tools/proto/prototypes/<slug>/` where:

- the page opens at `http://localhost:8010/tools/proto/prototypes/<slug>/` and plays;
- `sim.js` follows the interface below, so the rules run in Node;
- the loop and the words on the buttons are the person's, not the template's;
- `node tools/proto/check.js <slug>` ends with `ok`;
- `BRIEF.md` holds the answers — from the interview, or from the material they gave;
- the Graph button opens the loop, and its sliders change the run where the game has any;
- if they gave a description, `SPEC.md` is it verbatim and `BRIEF.md` §7 lists every
  assumption you made filling the gaps.

## The interface (the only fixed part)

Every shape's `sim.js` exposes this and nothing more is required:

```js
export function createGame({ seed = 1, on = () => {} }) {
  // ... the game ...
  return {
    S,               // the live state: whatever shape this game needs
    actions(),       // [{ id, label, note?, ok, why? }] — what can be done right now
    act(id),         // do one: { ok: true } or { ok: false, why }
    step(dt),        // run real time forward; a no-op for turn-based games
    text(),          // one line of JSON summarising the run, for the checker
  };
}
```

There is **no schema for state**. `S` can be resources, a board, lanes, flags, an inventory,
or a mixture. `actions()` is the only place that decides what is possible; `act()` enforces
it. If a verb needs a target, put it in the id (`'serve:broth'`, `'go:left'`) rather than
changing the signature.

Emit to the page through `on`: `on('say', { text, tone })` for the log,
`on('ending', { id, name, text, win })` when the run ends. Randomness comes from
`mulberry32(seed)` in `lib/rng.js`, never `Math.random()`. No `document`, `window`,
`localStorage` or clock in `sim.js`.

## The graph (optional, and worth having)

The shell's **Graph** button draws the loop from a `MAP` export and, if the sim offers
`knobs()`, sliders that change the live rules. Every prototype should have a map; a game
with numbers worth arguing about should have knobs.

```js
export const MAP = {
  title: 'One day, one week',
  nodes: [
    { id: 'morning', kind: 'phase', col: 0, label: 'Morning', note: 'buy and borrow' },
    { id: 'buy', kind: 'action', col: 0, label: 'Buy supplies', note: '−money → +stock' },
    { id: 'debt', kind: 'state', col: 2, label: 'Debt', note: 'grows each night' },
    { id: 'week', kind: 'ending', col: 3, label: 'A week, still open', win: true },
  ],
  edges: [
    { from: 'morning', to: 'buy' },
    { from: 'debt', to: 'week', label: 'cleared' },
  ],
};
```

`col` is the column, left to right; nodes stack in the order listed. Kinds: `phase`,
`action`, `state`, `ending` (add `win: true` to the good one). Every edge needs `from` and
`to`; `label` is optional.

Then return knobs from `createGame`; each is one number that changes the rules immediately:

```js
export function createGame({ seed, on }) {
  // ...
  return {
    S, actions, act, step, text,
    knobs() {
      return [
        {
          id: 'rent', label: 'Rent each night', value: rent,
          min: 5, max: 40, step: 1, unit: ' money',
          set(v) { rent = v; },
        },
      ];
    },
  };
}
```

The rules must read the number **live** from the thing `set` writes — if it is copied into
`S` at creation, the slider only changes its own label. Labels on action buttons should be
built from the same value (`−${rent} money`), so the screen and the slider agree. If a knob
can end the run (a debt limit, the last day), re-check that in `set` and end the run there.
A sim with no `MAP` hides the button; with a map and no knobs the graph is read-only.

### Making the map editable

Add `editable: true` to `MAP`, give every verb node an `action` and a `phase`, and build
`actions()` from the nodes instead of a separate list:

```js
export const MAP = {
  editable: true,
  nodes: [
    { id: 'morning', kind: 'phase', col: 0, label: 'Morning' },
    { id: 'buy:crate', kind: 'action', action: 'buy:crate', phase: 'morning', col: 0,
      label: 'Surplus crate', note: '−8 money → +5 stock' },
    // ...
  ],
  edges: [{ from: 'morning', to: 'buy:crate' }, /* ... */],
};

function actionNodes(phase) {
  return MAP.nodes.filter((n) => n.kind === 'action' && n.action && n.phase === phase);
}

function choices() {
  return actionNodes(S.phase).map(buildAction).filter(Boolean);
}
```

`buildAction(node)` switches on `node.action` for the rules and uses `node.label` as the
button's words. The button's id is `node.id`, so two nodes may share one `action` and still be
two buttons. Then **Edit** in the graph (full screen):
- typing in a verb's field renames the button;
- the phase select moves the verb (and the editor repairs its membership edge);
- ↑/↓ reorder the verbs, which reorders the buttons;
- **+ verb** adds a button that copies the rules of the last non-`advance` verb in that
  phase (mark an advance node `advance: true` in `MAP` so it is not chosen as the source);
- **×** removes a node and its edges; removing a verb removes its button. A phase cannot be
  removed, because the run needs somewhere to stand;
- **+ note** adds a state node, for a part of the map that is not an option;
- **click a node's text** to rename it in place (Enter or leaving the field saves, Esc
  cancels); clicking the small note under the title edits that too;
- **drag the + beside a node** to grow a new node where you release, already linked from it:
  from a verb it is another verb with the same rules, from anything else it is a note;
- **drag a line, or the dot at its arrow end,** to re-attach that end to another node.
  Membership lines (phase → verb) are not draggable: the phase select owns those;
- state/ending labels and notes, and every edge's ends and label, are editable; the other
  edges are notes on the map, not rules;
- any node can be **dragged**; its `x`/`y` is written onto the node, so the layout is part
  of the map (and Reset restores it);
- **Reset map** restores the map as it was when the graph first opened (this page session).

Edges route themselves: an orthogonal shortest path around the other boxes, with rounded
corners and labels nudged apart, so the picture stays readable after nodes move.

The graph is a camera: drag the empty canvas to pan, use the wheel (or −/+ in the header)
to zoom around the pointer, and **Fit** to go back to 100%. The buttons and percentages
work on touch too. The camera stays where it is while you edit or drag nodes.

Two rules keep it honest: the sim holds the same `MAP` object, so `choices()` must read it
live (never copy the verbs at creation), and membership edges are maintained by the editor —
do not build actions from a second table, or the buttons and the graph will disagree. A map
without `editable: true` stays read-only. The economy template's map is derived from `GAME`
and therefore read-only; Night Café is the worked editable example.

## The steps

| Step | What you do | Where the exact questions are |
| --- | --- | --- |
| 0 | pick the shape, make the folder | below |
| 0A | or start from a description and pictures | below, "given material" |
| 1 | the pitch | below, shared |
| 2 | one round | `shapes/<shape>.md` |
| 3 | the pressure | `shapes/<shape>.md` |
| 4 | the verbs | `shapes/<shape>.md` |
| 5 | the numbers | `shapes/<shape>.md` |
| 6 | write `sim.js` | below + `shapes/<shape>.md` |
| 7 | write `view.js` | below + `shapes/<shape>.md` |
| 8 | run the checker | below |
| 9 | play it | below |
| 10 | hand back | below |

**Never build before step 6.** Read `shapes/<shape>.md` before step 2 and ask its questions
verbatim. **At most four questions in one message.** Give each a few options and "or say it
in your own words". Write every answer into `BRIEF.md` before the next step.

## The rules of the job

1. **Write only inside `tools/proto/prototypes/<slug>/`.** Never touch `index.html`,
   `style.css`, `main.js`, `wall/`, `lib/`, another game, or this tool.
2. **One step per message**, then stop and wait.
3. **At most four questions at once.** Number them, offer options.
4. **`BRIEF.md` is the memory.** Build from it, not from the conversation.
5. **A prototype is a flow, not content.** One loop, a few verbs, one or two endings, no
   shipped images, no save, no menus, no settings. (`refs/` may hold the person's reference
   pictures; the page never loads them.)
6. **The rules live in `sim.js`.** `view.js` only draws and calls verbs. If the screen needs
   a rule to work, the rule is in the wrong file.
7. **Run the checker yourself** after `sim.js` and again after `view.js`. Fix only the
   lines it prints as `FAIL`.
8. **No new files or libraries** outside the shape's files, unless the game needs one and
   you say why. Nothing imports from `node_modules`.
9. **If you cannot run a command**, print it and ask the person to run it and paste the
   output. Do not guess what it would have said.

---

## Step 0 — shape and folder

Ask exactly this:

> **1. What is the game called?**
> **2. A folder name** — two or three lower-case words with hyphens, e.g. `night-bus`. Or
> say "you pick".
> **3. Which of these is closest to what you want to test?**
> A) an economy — resources, costs, a clock, upkeep
> B) a puzzle — a board or levels, moves, a budget
> C) an arcade game — real time, lives, a score
> D) a story — scenes, choices, what you carry

The shape is about the *material* of the game, not its setting. A shop game and a farm game
are both economy; a detective game and a dungeon are both story if the choice is the game,
puzzle if the board is.

Then:

```sh
node tools/proto/new.js <slug> "<Title>" --shape <shape>
```

If the folder exists, ask for another slug. Tell them the URL
`http://localhost:8010/tools/proto/prototypes/<slug>/` (the repo must be served:
`npm run serve`).

---

## Step 0A — given material (description and pictures)

If the person hands you a description, some pictures, or both, do not run the interview.
Start from them:

```sh
node tools/proto/new.js --spec <description.md> [--ref <image> ...] [--shape <shape>]
```

`new.js` finds the slug and title from the description's first heading (or take `--slug` /
`--title`), guesses the shape from the words in it (print says why; `--shape` overrides),
copies the description to `SPEC.md`, copies the pictures to `refs/`, measures them into
`LOOK.md`, and seeds `BRIEF.md` with the shape.

Then, in this order:

1. **Read `SPEC.md` in full and `LOOK.md`.** The description is the person's own words; the
   look report says what the pictures are made of.
2. **Fill `BRIEF.md` §1–6 from them**, in their words. Where the description is silent and
   you must choose, write the choice into §7 **and mark the line in §1–6 `(assumed)`**.
3. **Ask at most four questions**, and only where a gap blocks the loop — e.g. "does the run
   end after seven days, or when the debt is paid?". Do not ask what the material answers.
4. Go on to the loop below. The shape file's questions are now a checklist to answer from
   the material, not a script to read out.

The pictures are **look, not content**:

- Never copy a reference into the prototype, and never try to redraw it. A prototype has no
  image files; the stage is canvas or DOM.
- `LOOK.md` gives the palette by area, the loud colours (neon signs are small and the area
  palette misses them), region averages, brightness/saturation, and starting CSS tokens.
  Pick four to six and rename them in `style.css`.
- Use the reference's *shapes* — a counter line, a queue, a skyline — in the canvas, not its
  composition. The prototype is testing the loop.
- If they want the actual art, that is the other pipeline (`tools/prototype.py`,
  `tools/pixel-art.py`, `tools/sheetcut.py`) and a real game on the wall, not this.

---

## Step 1 — the pitch (shared)

> **1. In one sentence, what does the player do?**
> **2. What are they trying to reach, and what is in the way?**
> **3. What should a round feel like?**
> A) busy and rushed · B) tense and careful · C) gentle and cosy · D) strange and funny.
> **4. What is this game *not*?** One thing to avoid.

Write `BRIEF.md` §1.

---

## Steps 2–5 — the loop, pressure, verbs, numbers

Open `tools/proto/shapes/<shape>.md`. It holds this shape's questions, one set per step,
with the options to offer. Ask each step's questions, confirm the answer in a table, and
write it into `BRIEF.md` §2–6.

If an answer does not fit the shape (a puzzle with a shop economy, a story with a score),
say so plainly and ask which one it should be — do not quietly bend the shape.

---

## Step 6 — write `sim.js`

Open the template's `sim.js` and rewrite the game. Keep the engine if it fits; delete what
does not. The shape file says what this shape usually keeps in `S` and which verbs it needs.

Checklist:

- `createGame({ seed, on })` returns `S`, `actions`, `act`, `step`, `text`;
- every action has an `id` and a `label`; `ok` is false with a short `why` when it cannot be
  done;
- `act()` checks feasibility itself and returns `{ ok: false, why }` rather than silently
  doing nothing;
- the run ends: set `S.over = { id, name, text, win }` and call `on('ending', S.over)`;
- a real-time game does its work in `step(dt)` and never reads a clock;
- a turn-based game's `step` is a no-op;
- all randomness comes from the seeded `rnd`;
- `text()` returns a JSON string with the few numbers you would want to see in a bug report;
- no page access at all.

Then:

```sh
node tools/proto/check.js <slug> --no-browser
```

Fix the `FAIL` lines in `sim.js` and run it again until it says `ok`. Warnings are fine.

---

## Step 7 — write `view.js`

Most of the screen already exists: `ui.js` builds the action buttons from `actions()`, the
log from `on('say')`, the ending card, the restart button, the keyboard shortcuts and the
debug handle. A view supplies three things:

```js
import { createGame, RULES, HINT } from './sim.js';
import { startPrototype, pill } from './ui.js';

function paint(S, ui, game) {
  ui.chip('Day ' + S.day);          // the small pill in the topbar (optional)
  ui.head('Morning', 'Buy what you need.');
  ui.clock(S.left, 60);             // a countdown, or ui.clock(null)
  ui.status([pill('Money', S.money)]);   // any pills you need, or []
  ui.stage(canvasOrNode);           // a board, a lane, a scene; null for none
}

function frame(S, ui, game) { /* optional: what changes between actions */ }

startPrototype({ createGame, rules: RULES, hint: HINT, paint, frame, keys: { ArrowLeft: 'left' } });
```

- Keep `.pf-action` buttons as they are; the checker clicks the first one and the person
  uses the number keys.
- A board, lanes or a scene can be a canvas or plain DOM. **No image files.**
- There is **no rules panel beside the game**: the shell has one column, the rules live in
  the How to play dialog, and the card takes the width of the window. Let a board or scene
  grow with it — a canvas can fill the width (`width: 100%; height: auto`) capped by the
  window's height (`max-width: calc(70dvh * 16 / 9)` keeps a 16:9 frame whole).
- **If the game has more than one place, put a tab strip at the top** of the frame, above the
  card: the active tab follows the phase, clicking another looks at it (view only, the rules
  do not change), and a caption says which place you are in. Night Café's `view.js` is the
  worked example.
- The shared stylesheet gives you the frame, the pills, the canvas border and the phone
  layout. Change colours and spacing in `style.css`, not the structure.
- Keep the game playable on a phone: one column, no fixed widths, no sideways scroll.

Then run the full checker:

```sh
node tools/proto/check.js <slug>
```

It clicks the first action, watches the console, and writes `_desktop.png` and
`_phone.png` beside the prototype. Fix `FAIL` lines only.

---

## Step 8 — what the checker says

| Line | What it means |
| --- | --- |
| `sim.js must export createGame({ seed, on })` | the export is missing or misspelt |
| `BRIEF.md is still mostly empty` | you skipped the brief; answer §1–6 first |
| `BRIEF.md has N empty fields` | a warning, not a failure: finish them before handing back |
| `LOOK.md points at files that are not there` | the references were moved or deleted; run `new.js` again or fix the paths |
| `the game object has no actions()` | return the five parts of the interface |
| `actions() returned "x" more than once` | one id appears twice; ids must be unique |
| `on('ending') fired but S.over is still empty` | set `S.over` before you announce the ending |
| `actions() offered "x" as possible, then act() refused it` | `actions()` and `act()` disagree; both must use the same test |
| `actions() must return an array` | return `[]`, never `undefined` |
| `every action from actions() needs an id` | one item has no id |
| `act("x") must return { ok: true } or { ok: false, why }` | return an object, not `undefined` |
| `text() must return a string` | JSON.stringify it |
| `nothing changed for a long time ... the run is stuck` | a dead end: no action available and time does not move |
| `no ending was reached` | the run never ends; either add an ending or accept the warning for a sandbox |
| `the same seed played twice gave different runs` | `Math.random()` or a clock crept into `sim.js` |
| `window.__game is missing` | `view.js` does not call `startPrototype()` or `expose()` |
| `no .pf-action button` | the actions are not rendered as buttons |
| `clicking an action changed nothing` | a button is not wired to `act()` |
| `sideways scroll on a phone` | a fixed width in `style.css` |

Warnings are worth reading, not ignoring: `offered but never taken in any seed` usually means
a verb is unobtainable, and `the <shape> template's words are still in the game` means a
label was never replaced. The checker also refuses a brief that was never filled in, because
a prototype with an empty brief has nothing to be judged against.

---

## Step 9 — play it

Ask them to play for five minutes, then exactly:

> **1. What did you spend most of your time doing?**
> **2. Where did you get stuck or stop having fun?**
> **3. Which number felt wrong — too easy, too tight, or pointless?**

Change **numbers only** in this pass: costs, rewards, `seconds`, moves, lives, spawn rate,
thresholds. Do not add verbs or scenes in response to playtest notes; write the ideas down
as "next, not now". Run the checker once more.

## Step 10 — hand back

End with a short summary, no code:

- the loop in three lines;
- the verbs in one line;
- the numbers that matter;
- what is deliberately missing: art, save, content, sound;
- where it lives, and the one thing you would test next.

If they want it as a real game afterwards, that is a different job: a new `<slug>/` folder
on the wall with `PLAN.md`, art and tests; the prototype stays as the reference for the
rules.

---

## Common mistakes

- **Bending every game into an economy.** If the answer is "you move a piece", that is a
  puzzle; do not invent money and a shop to make the schema fit.
- **Putting the game in `view.js`** because the buttons are easier than `actions()`. The
  rules must run in Node, or the checker cannot help you.
- **Leaving the template's words in.** Replace the stall, the garden, the alley, the
  lighthouse — every label.
- **`actions()` saying yes when `act()` says no.** Use one helper for both.
- **A dead end:** no action available, no time passing. Always leave the player a move
  (even "wait", even if it costs something).
- **Two endings firing at once.** The first one evaluated wins; order matters.
- **Polishing before the loop plays.** The person is testing the loop.
- **Asking ten questions at once.** Four is the limit.
