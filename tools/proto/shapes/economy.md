# Economy shape

Use this when the game is made of **rounds that spend and earn**: a stall, a farm, a shop,
a household. The player chooses between actions that cost and give, something accumulates,
and the upkeep rises. The heart is the trade-off, not the clicking.

The template is `template/economy/sim.js`: three phases (morning, evening on a 60-second
clock, night), three resources, actions with costs and rewards, events on the clock, two
endings. Replace the `GAME` table at the top first; the engine below it can usually stay.

## Step 2 — one round (ask these)

> **1. Walk me through one round from beginning to end.** Where does it start, what does the
> player do in order, and where does it stop?
> **2. Which part is the heart — the choice that has to be interesting every time?**
> **3. How does a round end?**
> A) a clock runs out · B) the player chooses to stop · C) a fixed list of steps · D) a mix.

Then propose the phases as a numbered table, each with what the player does and how it ends
(a clock, or an action that moves on). Ask them to confirm before writing it down.

Example shape:

```
morning  (waits)   buy, talk, choose      -> an action opens the day
evening  (60s)     serve, build, wait     -> the clock ends it
night    (waits)   pay, upgrade, sleep    -> an action ends it
```

## Step 3 — the pressure

> **1. What runs out?** (money, stock, trust, heat, time — two or three at most)
> **2. What gets worse as the run goes on?** (rent, debt, demand, weather)
> **3. What does a bad round cost?**
> A) nothing but progress · B) money that has to be made back · C) a real ending.

A prototype wants pressure, not a hard fail on round one. If they want a fail, make it an
ending they can watch happen.

## Step 4 — the verbs

> **1. What can the player do?** Four to eight actions, in their words.
> **2. For each: what does it cost, and what does it give?**
> **3. Which will they use most, and which is the risky one?**
> **4. What should they *not* be able to do?** (the exploit to block)

Confirm the table: action, phase, cost, gain.

## Step 5 — the numbers

> **1. What do they start with?**
> **2. How long is a round, and how many rounds is a run?**
> **3. Should a careful player win the first run, lose it, or just see it end?**

Propose: starting values, each action's cost and reward, the clock, the ending threshold.
Income per round should sit within about 20% of that round's costs; starting resources
should cover two or three rounds, not ten.

## The state

Usually `S.res` (resources by id), `S.phase`, `S.left` (seconds in a timed phase), plus
counters for what can only be done once per phase. Keep the log for the person's benefit.

## Writing `sim.js`

- The template's engine already does phases, resources, one-shot actions, timed events and
  endings. Replace `GAME` and keep the engine.
- A cost that cannot be paid is not "ok"; return `{ ok: false, why: 'needs 4 more money' }`.
- `once` means once per visit to the phase, not once per run.
- Timed events roll from `rnd`, so the seed decides them.
- Endings are checked after every change; the first true one wins.
- Keep the `why` texts short — they appear on the disabled button.

## Writing `view.js`

The template's view is nearly all of it: `ui.status` shows the resources, `ui.clock` shows
the phase's countdown, and the buttons come from `actions()`. If the game needs a place to
stand (a counter, a room), paint it in `ui.stage` with a canvas and keep the actions below.

## What the checker should show

A run of several rounds ending on one of the endings, with the action counts spread across
most verbs. If it ends after one round, the pressure is too tight; if it never ends, the
ending threshold is out of reach.
