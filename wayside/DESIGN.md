# Wayside — design note

A walk east along a coast of unlit lighthouses. There is no road, so you lay one:
one card for every step, one step for every card, from a hand of three. Every
lighthouse you light stays lit, forever, and pays you back in cards — the tenth
walk can lay roads the first could only see by signpost.

This note is the plan of record. It describes what is built now (a solo walk and
a collaborative walk with an AI companion) and the competitive walk that is
planned but not yet built. Anything marked *planned* is not in the code.

## The one rule

> **Lay, step; lay, step.** While `phase == place` you may put down exactly one
> card from your hand onto an empty tile beside you. Then `phase == move` and any
> direction key is a step — onto a placed card, old ground, whatever is there.
> Walking is never rationed: you may step anywhere adjacent, and back over old
> ground as often as you like. Only laying is rationed, to one card per step.

Nothing is ever laid for you. If you want another card down, you pick another
card up (1, 2, 3).

## Modes

The walk starts with a choice, made again from "New journey".

- **Walk alone.** The road is yours, and so is every risk on it.
- **Walk together.** Maren walks beside you (see *The partner*). One pad's worth
  of attention, two pairs of hands; she is a helper, not a second hero.
- **A race (planned, WS-6).** An NPC walks the same coast a little faster than
  you would like. See *The competitive walk*.

## The land

The coast runs east. It is generated in **chapters ~8–11 tiles long**, each one
introducing a barrier at its far end, a campfire at its near end, and the means
to pass the barrier scattered face-down in between. Generation is random but was
seeded behind the player: whatever lies ahead of the road is fixed once you have
seen past it, and saves it exactly.

Barriers, and the one way each is meant to open:

| Barrier | Kind | One way through |
| --- | --- | --- |
| River | block (no road) | Feed `oars` to the fisherman for the `boat`; or cross the toll bridge |
| Toll bridge | enemy | 5 coins, or beat the toll keeper in a fight |
| Old wall | block | climb the signpost's hint: the `key` is somewhere back along the road |
| Gorge | block | carry `planks` from the woodcutter (who needs an `axe`) |
| Briar | block | the one gap holds a troll: honey, 7 coins, or a fight |
| Mountain | block | a `lantern` from the miner lights the cave through it |

Every third chapter begins at a **lighthouse**. Lighting it becomes your new
wake-up point; **every lamp ever lit is kept**, and each one permanently adds a
card to the deck on every future walk (see *The deck that grows*).

### Why the river is a chapter barrier and not a road-obstacle (WS-2)

An earlier shape had a river between *every* tile of the road: each step needs a
valid adjacency, so a river threading through every column forces the deck to
hold up a straight bridge of water-friendly cards for the whole walk, river
cards only, forever. Two unwelcome things follow. The hand's three cards rarely
trip over a river, so the river card becomes a dead letter; and the walk stops
being a decision — build x, step x, repeat to the sea.

A river at the *end of a chapter* keeps the "you cannot walk through water"
rule honest (it is a barrier only in one place, on open ground beside it) while
making the barrier a single beat: *listen to the rumour, find the thing, come
back.* Every chapter then reads the same way — one obstacle, one way through,
one reason to look — which is why all chapter barriers use the same shape:
**equi-distance.** Each chapter is a fixed, short span, so the "go back for the
key" journey is always about the same length and never a slog.

## Cards

Each card is a tile and a kind. Kinds: `path`, `item`, `npc`, `enemy`, `block`,
`goal`, `action`.

**Path** — grass you walk on and lay road on: meadow, woods, brook, campfire,
lookout hill.

**Item** — a thing on the ground that hands you something: coin purses, berry
bushes, the mine (ore→sword), reeds (oars), hollow (mushrooms), stump (axe),
shed (pick), beehive (honey), chest (a lamp-card).

**NPC** — somebody to talk to; each knows one thing (see *Rumours and quests*).

**Enemy** — a fight on arrival: wolf, the bear, the bandit camp, the toll
keeper, the troll. Barriers you must pass *beside* (bridge, troll's gap) still
carry an encounter: they open their dialogue when you try to step onto them.

**Block** — the chapter barriers: no road runs through them until `used`.

**Goal** — 'home' and the lighthouse.

**Action** — never laid down; played from the hand for its effect (1, 2, 3):

- **Rework** — swap one of your hand cards for a fresh card from the deck.
- **Slipline** — swap a card already placed (face up, whole, and not home /
  lighthouse / a barrier or enemy card) with a card in your hand. The board card
  comes to you; one of your cards takes its place.
- **Crossed deck** — swap one of your hand cards with one card from another
  deck: Maren's hand on a collaborative walk, or the deck itself when you walk
  alone. (In the planned competitive walk: the opponent's deck.)

Action cards can be played at any time (moving *or* laying), including to
interrupt nothing — you play the card, its pick targets light up, Esc cancels
unplayed. The selected action card is the one being played; it is spent
(replaced by a fresh draw) when the swap resolves.

### The deck that grows

Starting deck (id, copies): meadow 8, woods 7, brook 4, berries 3, camp 2,
wolf 4, traveller 3, lookout 2, rework 1, slip 1, cross 1. Every
`lampCardsWon()` (sign at 1, mine 2, chest 3, hollow 4, well 5, beehive 6,
shrine 7, pedlar 8, tent 10, smith 12, bear 14, stump 16) is added to the deck
for good once its lamp is lit, *at any* lamps count, across all walks.

## Battles

Small, turn-based scrapes with a Pokémon shape but no menus you have to dig
out of: every move is also a key.

```
you  →  (Maren, if she is alongside)  →  the foe
```

| Foe | Hearts | Damage | Atk | Way |
| --- | --- | --- | --- | --- |
| Wolf | 2 | 1 | Bite | Defeat: +2 coins |
| Bandits | 2 | 1 | Bludgeon | Defeat: +4 coins |
| Bear | 3 | 1 | Swat | Defeat: +3 coins |
| Toll keeper | 2 | 1 | Cudgel | Defeat opens the bridge (chapter `open`) |
| Troll | 4 | 2 | Crush | Defeat opens the gap (chapter `open`) |

Your moves come from what you carry:
**Strike** (1) always; **Slash** (3) once you hold a sword; **Hew** (2) with an
axe; **Swing** (2) with a pick; **Offer the honey** (ends a bear or troll fight
outright); **Run** always (Esc). Losing a fight does not end the walk: you come
round at the last place you rested — but Maren retreats from a lost fight to the
same place and the fight ends.

The fight waits for nobody: the enemy's turn is scheduled on a timer, so a
stolen glance at the map is a free turn, and the fight never locks a second
player out.

## The partner (collaborative mode)

Maren is one intent, expressed simply, in priority order:

1. **Fetch.** If something worth having is revealed, unused and within five
   columns of her, walk to it (coincidentally the same drift the hero would
   have). Goodies in priority: campfire (only when hurt), lookout, mine, reeds,
   hollow, stump, shed, coins, berries.
2. **Keep near.** If the hero is more than two tiles away, walk toward them —
   laying a card into a gap to reach them if the road stops.
3. **Lend a hand.** Beside the hero: lay a card toward the road they are
   building, or help carry the build forward.

She never steps on unrevealed tiles (she reveals ground the hero's way), never
walks over enemies or closed barriers (a river needs the boat, a gate its key,
like the hero), and rests at a fire when she is hurt. In a fight she joins the
moment she is alongside it, and her turn comes before the enemy's, so she never
leaves you waiting on her. Her hearts drain separately and she retreats whole to
the last camp before it costs the walk anything.

She is drawn on the land like the hero, at 16px world scale, with a hurt blink
when struck and a boat under her on river tiles.

## Items

Everything you carry comes from the land and is turned back on the land:
ore→smith→sword (a nastier fight), reeds→fisherman→boat (any river), axe
(fights + woodcutter→planks), pick (fights + a toll paid in gloom), honey (ends
bears and trolls), key (the gate), lantern (the cave), oars and planks are
duties, not treasures. The pedlar sells what the chapter ahead calls for.

## Rumours and quests

Travellers and signposts share *rumours* — where things are, and what the stuff
you find is *for*. The quest rail (the right-hand panel) turns the open council
of the land into two or three "someone should…" lines, updated as the walk goes:
*find the key, mend the bridge, pay the toll.* Rumour order is local to a
chapter; the last of them is general advice. All of it is advice, none of it is
script: every chapter is solvable blind by walking the land.

## The competitive walk (planned, WS-6)

Not in the code. Design in brief, so it can be read off:

- A second walker (`Rival`) holds a second road, a second hand and a second
  progress marker, racing east to a shared finish (e.g. the same lamp count).
  The two roads share the coast: a tile I lay, you may step on and vice versa,
  but the road that opens a chapter barrier belongs to whoever passed it first.
- Turns alternate quickly (the rival acts on the same timer cadence as Maren's
  battle turns) — nobody blocks a screen for long.
- Interaction verbs reuse the existing action-card machinery rather than new
  systems: **Rival's rework** moves a card from *your* deck into theirs;
  **Rival's slip** swaps one of *your* placed cards for theirs; an applied
  counter-slip can hand a river card to a shore that needs oars. Only a placed
  confront cost: pages of the help text already name the mode, the choice screen
  says it is "on the way", and the mode select is the design's front door.

## The feel

One pad's screen is the whole game: WASD/mouse/d-pad, keys 1–3 for the hand and
for dialogs, Esc to cancel. Everything reads at a glance — card kind as a dot,
hearts as icons, your card-of-the-road as a yellow mark on the tile it would be
laid. Text is VT323; the pixel font is "Press Start 2P". No sound (planned:
a small hum of wind, a huff of fire).

## Technical shape

One `index.html`, one `style.css`, one `game.js` (an IIFE), pixel art in
`sprites.js` as a 16×16 grid per sprite, procedurally seeded terrain bases. No
build step, no dependencies.

- **Save.** Versioned, `wayside-save-v4`; carries the whole grid,
  hero/checkpoint/hearts/inventory/hand, mode, partner state, chapters, lamps,
  and `far` bests in `wayside-best-v1`. v3 saves migrate in (they become a solo
  walk with a partner-slot reserved). Battles and in-flight actions are *not*
  saved: they resolve, lapse, or are cancelled on reload.
- **Game feel numbers.** `TILE=16` world pixels; `ROWS=5` walkable rows; cameras
  ease on a `k = 1 - pow(0.001, dt/1000)` spring; hero/Maren lerp between tiles
  in ~200 ms; mist is a soft-texture light stamp.
- **Smoke tests.** `window.__wayside` exposes state and verbs exactly so a
  headless Chrome (CDP from Node) can walk the whole loop — modes, battles,
  action cards, partner join — without synthetic clicks.

## Open design debt

- The rival needs its own portrait, name pool and win/lose treatment (WS-6).
- Action cards have no admission cost; a cost (a heart, a coin, one fewer draw)
  is a balance lever held in reserve if they read too strong.
- Tutorial readings of cards appear only through rumour text; a "How to play"
  page covers modes, action cards and fights, which was enough for phase one.