/* Lantern Deep: the rules. A dungeon five floors deep, made from a seed: each floor is a
   handful of rooms on a grid, joined by passages, with the stair down in the room furthest
   from the one you came in by. Every room is decided before you reach it (who is in it, its
   chest, its altar), which is why the clues in the doorway can be true. Everything you do
   is a choice from choices(); act(id) resolves it with d20 checks and returns what happened
   as a list of events for the storyteller to tell. No page access in here: dice come in as
   `rnd`, and the events also go out through on(event, data).

   A room holds lists: `foes` (creatures, each with a state, and in the Dungeon Master's mode
   a name, who they are, a temper and wits) and `things` (chests, altars and the rest, and
   coins or an item lying loose). Choices about a thing carry its place in the list
   ('open:1'). Several hostile creatures fight together: the one you face takes its swing and
   the others join in, and when it falls the next steps up. An ordinary floor only ever puts
   one of each in a room, so the game plays exactly as it did when a room held one of each.

   In the Dungeon Master's mode (S.role 'dm', 2026-10-08) the player tells the story and an
   AI plays the hero. The dice still lay out each floor (rooms, passages, the stair, the
   throne), but every room starts bare. Before the first floor the Dungeon Master writes the
   opening and the background only the AI reads (mode 'prologue'). Rooms beside the ones the
   hero has seen can be planned on the map (setPlan()), and become real only when the hero
   walks in: at the door the game stops in mode 'furnish' until the Dungeon Master has
   described the room, and act('furnish', { line }) builds what was planned. */

import { streamFor, randInt, pick, shuffle } from '../lib/rng.js';
import { FLOORS, XP_AT, STATS, STAT_NAME, CLASSES, SKILLS, WEAPONS, WEAPON_TIERS, ITEMS, LOOT_TIERS, MONSTERS, FEATURES, THEMES, DIRS, DIR_NAME, OPPOSITE, QUESTS } from './content.js';

// ---------- constants ----------
export const GW = 5, GH = 4;           // the floor's grid of room cells
export const CW = 9, CH = 8;           // one cell, in map tiles
const FOE_CHANCE = 0.42;               // an ordinary room has a foe in it
const FEATURE_CHANCE = 0.58;           // ... and/or something to do
const GOLD_CHANCE = 0.22;              // ... and/or a few coins on the floor
const GUARD_CHANCE = 0.6;              // the stair down has a guard (from floor 2)
const MIMIC_CHANCE = 0.14, TRAP_CHANCE = 0.3;
const WANDERER_CHANCE = 0.2;           // resting at a camp can wake something
const SHORT_REST = 0.35;               // one short rest a floor, anywhere quiet, heals this much
const SHORT_RISK = 0.35;               // ... and is found by something this often
const POISON_MOVES = 3;                // moves you lose 1 HP for, once poisoned
const MAX_LOG = 6;
const START_HP = 8;                    // on top of the class's hit die and twice its CON
const STAIR_REST = 0.3;                // a breather on the stair down heals this much of max HP
const MAX_LINE = 600;                  // characters of the Dungeon Master's description of a room
const MAX_PROLOGUE = 1200;             // ... of their opening (which is also what the AI knows)
const MAX_NAME = 40, MAX_WHO = 240;    // ... of a creature's name, and of who it is
const MAX_FOES = 6, MAX_THINGS = 8;    // what one room may be planned to hold
const MAX_ITEMS = 3;                   // items in one chest, body or statue
const SHARP_TALK = 4, SHARP_ALERT = 2; // a sharp creature is easier to reason with, harder to creep past
const FIERCE_TALK = 3;                 // ... a fierce one harder to talk down
const JOINERS = 1, JOIN_MISS = 2;      // in a crowd, this many others swing each round (taking turns), at this much less to hit
export const TEMPERS = ['friendly', 'wary', 'fierce', 'asleep'];
export const WITS = ['dull', 'average', 'sharp'];
export const TRAPS = ['none', 'needle', 'mimic'];
export const GOLDS = ['dice', 'none', 'some', 'lots'];
export const EFFECTS = ['random', 'heal', 'hardy', 'clarity', 'poison', 'plain'];
export const LOOSE = ['coins', 'item', 'weapon'];   // things that are only lying on the floor
// things only a Dungeon Master places (not in FEATURES, so the dice never put them in a room)
export const DM_THINGS = ['note', 'snare'];
export const SNARES = ['pit', 'darts', 'gas'];
const MAX_NOTE = 400;                  // characters of a note the Dungeon Master leaves

export const mod = (v) => Math.floor((v - 10) / 2);
const clampN = (v, a, b) => (v < a ? a : v > b ? b : v);

// ---------- dice ----------
export function parseDice(s) {
  const m = /^(\d+)d(\d+)([+-]\d+)?$/.exec(s);
  return m ? { n: +m[1], d: +m[2], k: +(m[3] || 0) } : { n: 0, d: 0, k: +s || 0 };
}
export function roll(rnd, s, crit = false) {
  const { n, d, k } = parseDice(s);
  let t = k;
  for (let i = 0; i < n * (crit ? 2 : 1); i++) t += 1 + Math.floor(rnd() * d);
  return t;
}
export const avgDice = (s) => { const { n, d, k } = parseDice(s); return n * (d + 1) / 2 + k; };
const d20 = (rnd) => 1 + Math.floor(rnd() * 20);
// the chance a d20 + bonus meets dc, with advantage if asked
export function chanceOf(bonus, dc, adv = false) {
  const p = clampN((21 - (dc - bonus)) / 20, 0.05, 0.95);
  return adv ? 1 - (1 - p) * (1 - p) : p;
}

// ---------- who and what ----------
export const isLoose = (t) => LOOSE.includes(t.kind);
const theSpecies = (kind) => { const n = MONSTERS[kind].name; return n.startsWith('the ') ? n : 'the ' + n; };
// how the story names a creature: the Dungeon Master's name for it, or "the bandit"
export const callFoe = (f) => f.name || theSpecies(f.kind);
export const canTalk = (f) => !MONSTERS[f.kind].boss && f.wits !== 'dull' && (f.wits === 'sharp' || !!MONSTERS[f.kind].talk);

// ---------- the quest ----------
// The big bad and why you are going down, chosen once at the start of a delve: by the
// Dungeon Master if one is awake (dm.js plans it, prompt.js checks the reply), otherwise by
// the book, deterministically from the seed. Either way the result is the same shape:
// { boss, why, premises } — premises is always a real 5-long array (even a model-chosen boss
// borrows its premises from the matching book quest), so a floor always has a line to show.
export function chooseQuest(seed) { return pick(streamFor(seed, 'quest'), QUESTS); }
export function questFor(boss) { return QUESTS.find((q) => q.boss === boss) || QUESTS[0]; }

// ---------- the floor ----------
// A random-growth tree of rooms over the grid, plus a loop or two so it is not all dead ends.
// questBoss picks which monster sits in the floor-5 throne room; everything else about the
// room shape and what fills it is the seed's own dice, same as always.
export function makeFloor(seed, floor, questBoss = null) {
  const r = streamFor(seed, 'floor' + floor);
  const theme = THEMES[floor - 1];
  const want = Math.min(GW * GH - 4, 7 + floor);
  const grid = new Map(), rooms = [];
  const key = (x, y) => x + ',' + y;
  const add = (gx, gy) => { const room = { id: rooms.length, gx, gy, exits: {} }; rooms.push(room); grid.set(key(gx, gy), room); return room; };
  const link = (a, b, d) => { a.exits[d] = b.id; b.exits[OPPOSITE[d]] = a.id; };
  add(randInt(r, 0, GW - 1), floor === 1 ? GH - 1 : randInt(r, 0, GH - 1));
  for (let guard = 0; rooms.length < want && guard < 2000; guard++) {
    const from = pick(r, rooms), d = pick(r, ['n', 's', 'e', 'w']);
    const gx = from.gx + DIRS[d][0], gy = from.gy + DIRS[d][1];
    if (gx < 0 || gy < 0 || gx >= GW || gy >= GH || grid.has(key(gx, gy))) continue;
    link(from, add(gx, gy), d);
  }
  const loops = 1 + (r() < 0.5 ? 1 : 0);
  for (let k = 0, tries = 0; k < loops && tries < 200; tries++) {
    const a = pick(r, rooms), d = pick(r, ['n', 's', 'e', 'w']);
    const b = grid.get(key(a.gx + DIRS[d][0], a.gy + DIRS[d][1]));
    if (b && a.exits[d] == null) { link(a, b, d); k++; }
  }
  // rectangles in tiles, each inside its cell with a margin for the passages
  for (const room of rooms) {
    room.w = randInt(r, 4, 7); room.h = randInt(r, 3, 5);
    room.x = room.gx * CW + 1 + randInt(r, 0, CW - 2 - room.w);
    room.y = room.gy * CH + 2 + randInt(r, 0, CH - 3 - room.h);
  }
  // distance from the start decides where the stair down goes
  const dist = new Array(rooms.length).fill(-1); dist[0] = 0;
  const q = [0];
  for (let i = 0; i < q.length; i++) for (const id of Object.values(rooms[q[i]].exits)) if (dist[id] < 0) { dist[id] = dist[q[i]] + 1; q.push(id); }
  let far = 0; for (let i = 1; i < rooms.length; i++) if (dist[i] > dist[far]) far = i;

  // every room on a floor gets its own first word, so the names tell apart at a glance
  const adjectives = shuffle(r, theme.rooms[0].slice()), nouns = shuffle(r, theme.rooms[1].slice());
  let merchant = false;
  for (const room of rooms) {
    const rr = streamFor(seed, `f${floor}r${room.id}`);
    const i = room.id, n = adjectives.length;
    const name = `the ${adjectives[i % n]} ${nouns[(i + Math.floor(i / n)) % nouns.length]}`;
    Object.assign(room, { name, dist: dist[room.id], decor: (rr() * 1e9) >>> 0, foes: [], things: [], start: room.id === 0, stairs: false, visited: false, clue: {} });
    for (const d of Object.keys(room.exits)) room.clue[d] = randInt(rr, 1, 20);
    room.props = shuffle(rr, theme.props.slice()).slice(0, 2);
    if (room.start) continue;
    if (room.id === far) {
      if (floor === FLOORS) { room.foes.push(makeFoe(rr, questBoss || 'king', floor)); room.throne = true; continue; }
      room.stairs = true;
      if (floor > 1 && rr() < GUARD_CHANCE) room.foes.push(makeFoe(rr, foeKind(rr, floor, true), floor));
      continue;
    }
    if (rr() < FOE_CHANCE) room.foes.push(makeFoe(rr, foeKind(rr, floor), floor));
    if (rr() < FEATURE_CHANCE) {
      let kind;
      do { kind = weighted(rr, FEATURES); } while ((kind === 'merchant' && (merchant || room.foes.length)) || (kind === 'camp' && room.foes.length));
      if (kind === 'merchant') merchant = true;
      room.things.push(makeFeature(rr, kind, floor));
    }
    if (rr() < GOLD_CHANCE) room.things.push({ kind: 'coins', state: 'new', gold: randInt(rr, 2, 6) * floor });
  }
  return { floor, rooms, revealed: false, premise: null };
}

function weighted(r, table) {
  let total = 0; for (const k in table) total += table[k].weight;
  let x = r() * total;
  for (const k in table) { x -= table[k].weight; if (x < 0) return k; }
  return Object.keys(table)[0];
}
// every monster that can live on this floor, ordinary monsters only (no bosses, no mimic) —
// the same list foeKind() draws from, exposed so a floor plan has something to choose among.
export function monstersFor(floor) {
  return Object.keys(MONSTERS).filter((k) => !MONSTERS[k].boss && k !== 'mimic' && MONSTERS[k].tiers[0] <= floor && MONSTERS[k].tiers[1] >= floor);
}
export function featuresFor() { return Object.keys(FEATURES); }
function foeKind(r, floor, tough = false) {
  const live = monstersFor(floor);
  if (tough) { const strong = [...live].sort((a, b) => MONSTERS[b].xp - MONSTERS[a].xp); return pick(r, strong.slice(0, 2)); }
  return pick(r, live);
}
const featureOf = (room) => room.things.find((t) => FEATURES[t.kind]) || null;

// ---------- planning a floor ----------
// The dice have already decided the floor's shape — which rooms have a foe, which have a
// feature, which is the stair guard. A plan only ever picks WHICH allowed monster or feature
// fills an already-decided slot; it can't add one, remove one, or touch the throne.
// floorMenu() reads that shape off an already-generated floor (makeFloor's own default pick
// stands for every slot the plan leaves alone), for the Dungeon Master (or a test) to choose
// from. applyFloorPlan() commits a validated choice, re-rolling that slot's numbers fresh
// (a different monster needs its own HP, not the one the dice first rolled).
export function floorMenu(floorObj) {
  const rooms = [];
  for (const room of floorObj.rooms) {
    if (room.start || room.throne) continue;
    if (!room.foes.length && !featureOf(room)) continue;
    rooms.push({ id: room.id, name: room.name, foe: !!room.foes.length, feature: !!featureOf(room), stairs: !!room.stairs });
  }
  return { floor: floorObj.floor, rooms, monsters: monstersFor(floorObj.floor), features: featuresFor() };
}
export function applyFloorPlan(seed, floorObj, plan) {
  if (!plan) return floorObj;
  const floor = floorObj.floor, monsters = monstersFor(floor), features = featuresFor();
  let merchant = floorObj.rooms.some((r) => featureOf(r) && featureOf(r).kind === 'merchant' && !(plan.rooms && plan.rooms[r.id] && plan.rooms[r.id].feature));
  for (const room of floorObj.rooms) {
    const pick1 = plan.rooms && plan.rooms[room.id];
    if (!pick1 || room.start || room.throne) continue;
    if (pick1.foe && room.foes.length && monsters.includes(pick1.foe)) {
      room.foes[0] = makeFoe(streamFor(seed, `f${floor}r${room.id}-plan-${pick1.foe}`), pick1.foe, floor);
    }
    const F = featureOf(room);
    if (pick1.feature && F && features.includes(pick1.feature)) {
      const kind = pick1.feature;
      const clash = (kind === 'merchant' && merchant) || (kind === 'camp' && room.foes.length);
      if (!clash) {
        if (F.kind === 'merchant') merchant = false;
        room.things[room.things.indexOf(F)] = makeFeature(streamFor(seed, `f${floor}r${room.id}-plan-${kind}`), kind, floor);
        if (kind === 'merchant') merchant = true;
      }
    }
  }
  if (plan.premise) floorObj.premise = plan.premise;
  return floorObj;
}
function makeFoe(r, kind, floor) {
  const M = MONSTERS[kind];
  const grow = 1 + 0.15 * Math.max(0, floor - M.tiers[0]);
  const hp = Math.max(3, Math.round(roll(r, M.hp) * grow));
  return { kind, hp, maxHp: hp, ac: M.ac + (floor - M.tiers[0] >= 2 ? 1 : 0), atk: M.atk + Math.floor(Math.max(0, floor - M.tiers[0]) / 2), state: 'hostile' };
}
function makeFeature(r, kind, floor) {
  const f = { kind, state: 'new' };
  if (kind === 'chest') {
    f.mimic = floor >= 2 && r() < MIMIC_CHANCE;
    f.trapped = !f.mimic && r() < TRAP_CHANCE;
    f.gold = roll(r, '3d6') * floor;
    const item = r() < 0.7 ? pick(r, LOOT_TIERS[floor - 1]) : null;
    f.items = item ? [item] : [];
    f.weapon = r() < 0.28 ? pick(r, WEAPON_TIERS[floor - 1]) : null;
  }
  if (kind === 'corpse') { f.gold = roll(r, '2d6') * floor; const item = r() < 0.45 ? pick(r, LOOT_TIERS[floor - 1]) : null; f.items = item ? [item] : []; f.grubs = r() < 0.18; }
  if (kind === 'statue') { f.gold = 10 * floor; f.items = [pick(r, LOOT_TIERS[floor - 1])]; }
  if (kind === 'merchant') {
    const stock = new Set(['potion-heal']);
    while (stock.size < 4) stock.add(pick(r, [...LOOT_TIERS[floor - 1], ...LOOT_TIERS[Math.min(FLOORS - 1, floor)]]));
    f.stock = [...stock];
  }
  return f;
}

// ---------- the Dungeon Master's rooms ----------
// In the 'dm' role a floor keeps its shape but loses its contents: every room is emptied and
// marked bare, keeping what the dice had put there as a suggestion ("roll the dice for me").
// The throne keeps its boss, and neither it nor the start room takes monsters: the hero is
// already standing in the one, and the other is the boss's alone.
//
// A bare room has a plan, { foes, things }, that the Dungeon Master edits on the map while it
// is still ahead of the hero (setPlan(), checked by cleanPlan()); walking in builds it
// (furnishRoom()). Anything not allowed is dropped, so a bad plan can only make a room
// emptier, never break it.
export function bareFloor(floorObj) {
  for (const room of floorObj.rooms) {
    room.bare = true;
    room.plan = { foes: [], things: [] };
    if (room.start || room.throne) { room.suggest = null; continue; }
    const F = featureOf(room), coins = room.things.find((t) => t.kind === 'coins');
    room.suggest = {
      foes: room.foes.map((f) => ({ kind: f.kind })),
      things: [...(F ? [{ kind: F.kind, ...(F.kind === 'chest' ? { trap: F.mimic ? 'mimic' : F.trapped ? 'needle' : 'none' } : {}) }] : []), ...(coins ? [{ kind: 'coins', gold: 'some' }] : [])],
    };
    room.foes = []; room.things = [];
  }
  return floorObj;
}
const roomSize = (rm) => (rm.w * rm.h >= 28 ? 'large' : rm.w * rm.h <= 15 ? 'small' : 'middling');
export function lootFor(floor) { return [...new Set(LOOT_TIERS[floor - 1])]; }
export function weaponsFor(floor) { return [...new Set(WEAPON_TIERS.slice(0, Math.min(FLOORS, floor + 1)).flat())]; }
const tileIn = (room, x, y) => Number.isInteger(x) && Number.isInteger(y) && x >= room.x && x < room.x + room.w && y >= room.y && y < room.y + room.h;
// What may go into one room: the floor's monsters (none in the start room or the throne),
// every feature (a second pedlar on the floor excepted), coins, and any item in the game.
export function furnishMenu(floorObj, roomId) {
  const room = floorObj.rooms[roomId], floor = floorObj.floor;
  const merchant = floorObj.rooms.some((r) => r.id !== roomId && (r.things.some((t) => t.kind === 'merchant') || (r.bare && r.plan && r.plan.things.some((t) => t.kind === 'merchant'))));
  return {
    room: roomId, name: room.name, stairs: !!room.stairs, suggest: room.suggest || null,
    size: roomSize(room), props: room.props, start: !!room.start, throne: !!room.throne,
    boss: room.throne && room.foes[0] ? room.foes[0].kind : null,
    monsters: room.start || room.throne ? [] : monstersFor(floor), features: featuresFor().filter((k) => k !== 'merchant' || !merchant),
    loose: LOOSE, extras: DM_THINGS, snares: SNARES, items: Object.keys(ITEMS), weapons: weaponsFor(floor), loot: lootFor(floor),
    chests: TRAPS, golds: GOLDS, effects: EFFECTS, tempers: TEMPERS, wits: WITS,
    // what cannot share a room with a monster (makeFloor keeps them apart too)
    peaceful: ['merchant', 'camp'],
    tiles: { x: room.x, y: room.y, w: room.w, h: room.h },
  };
}
const text = (s, n) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, n) : '');
const oneOf = (v, list, dflt) => (list.includes(v) ? v : dflt);
// A plan as it may stand: known kinds only, at most MAX_FOES and MAX_THINGS, each on its own
// tile inside the room (a thing with no tile, or a taken one, is given the next free tile),
// options from their lists, and nothing peaceful beside a monster. Also reads the older
// one-of-each spec { foe, feature, chest, gold, item } the first version of this mode used.
export function cleanPlan(floorObj, roomId, plan = {}) {
  const room = floorObj.rooms[roomId], menu = furnishMenu(floorObj, roomId);
  if (plan.foes == null && plan.things == null && (plan.foe || plan.feature || plan.gold || plan.item)) {
    plan = {
      foes: plan.foe ? [{ kind: plan.foe }] : [],
      things: [
        ...(plan.feature ? [{ kind: plan.feature, ...(plan.feature === 'chest' ? { trap: plan.chest === 'trapped' ? 'needle' : plan.chest === 'mimic' ? 'mimic' : 'none' } : {}) }] : []),
        ...(plan.gold ? [{ kind: 'coins', gold: 'some' }] : []),
        ...(plan.item ? [{ kind: 'item', item: plan.item }] : []),
      ],
    };
  }
  const taken = new Set();
  const spot = (x, y) => {
    if (tileIn(room, x, y) && !taken.has(x + ',' + y)) { taken.add(x + ',' + y); return [x, y]; }
    for (let j = room.y + 1; j < room.y + room.h; j++) for (let i = room.x; i < room.x + room.w; i++) if (!taken.has(i + ',' + j)) { taken.add(i + ',' + j); return [i, j]; }
    return null;
  };
  // the throne's boss keeps its own tile
  if (room.throne && room.foes[0]) { const b = room.foes[0]; if (b.x != null) taken.add(b.x + ',' + b.y); }
  const foes = [];
  for (const f of plan.foes || []) {
    if (!f || !menu.monsters.includes(f.kind) || foes.length >= MAX_FOES) continue;
    const at = spot(f.x, f.y); if (!at) continue;
    const temper = oneOf(f.temper, TEMPERS, 'wary');
    foes.push({ kind: f.kind, name: text(f.name, MAX_NAME) || null, who: text(f.who, MAX_WHO) || null, temper, wits: oneOf(f.wits, WITS, 'average'), gift: temper === 'friendly' && menu.items.includes(f.gift) ? f.gift : null, x: at[0], y: at[1] });
  }
  const armed = foes.length > 0 || (room.throne && room.foes.length > 0);
  let merchant = !menu.features.includes('merchant');
  const things = [];
  for (const t of plan.things || []) {
    if (!t || things.length >= MAX_THINGS) continue;
    const feature = menu.features.includes(t.kind), loose = LOOSE.includes(t.kind), extra = DM_THINGS.includes(t.kind);
    if (!feature && !loose && !extra && !(t.kind === 'merchant')) continue;
    if (t.kind === 'merchant' && (merchant || !feature)) continue;
    if (armed && menu.peaceful.includes(t.kind)) continue;
    if (t.kind === 'item' && !menu.items.includes(t.item)) continue;
    if (t.kind === 'weapon' && !menu.weapons.includes(t.weapon)) continue;
    const at = spot(t.x, t.y); if (!at) continue;
    const c = { kind: t.kind, x: at[0], y: at[1] };
    if (t.kind === 'merchant') merchant = true;
    if (t.kind === 'coins') c.gold = oneOf(t.gold, ['some', 'lots'], 'some');
    if (t.kind === 'item') c.item = t.item;
    if (t.kind === 'weapon') c.weapon = t.weapon;
    if (t.kind === 'note') c.text = text(t.text, MAX_NOTE);
    if (t.kind === 'snare') c.snare = oneOf(t.snare, SNARES, 'pit');
    if (t.kind === 'chest') c.trap = oneOf(t.trap, TRAPS, 'none');
    if (t.kind === 'corpse') c.grubs = !!t.grubs;
    if (t.kind === 'fountain') c.effect = oneOf(t.effect, EFFECTS, 'random');
    if (t.kind === 'chest' || t.kind === 'corpse' || t.kind === 'statue') {
      c.gold = oneOf(t.gold, GOLDS, 'dice');
      c.items = Array.isArray(t.items) ? t.items.filter((i) => menu.items.includes(i)).slice(0, MAX_ITEMS) : null;
      c.weapon = t.kind === 'chest' && menu.weapons.includes(t.weapon) ? t.weapon : null;
    }
    things.push(c);
  }
  return { foes, things };
}
// Build a bare room from its plan (or from spec, which wins if it has foes or things), with
// spec.line as the Dungeon Master's description. The dice still roll what was left to them:
// a creature's hit points, a chest's contents when they said "let the dice fill it".
export function furnishRoom(seed, floorObj, roomId, spec = {}) {
  const room = floorObj.rooms[roomId], floor = floorObj.floor;
  const planned = spec.foes || spec.things || spec.foe || spec.feature || spec.gold || spec.item ? spec : (room.plan || {});
  const plan = cleanPlan(floorObj, roomId, planned);
  const r = (what) => streamFor(seed, `f${floor}r${roomId}-dm-${what}`);
  const foes = plan.foes.map((f, i) => {
    const made = makeFoe(r(`foe${i}-${f.kind}`), f.kind, floor);
    return { ...made, name: f.name, who: f.who, temper: f.temper, wits: f.wits, gift: f.gift, x: f.x, y: f.y, state: f.temper === 'friendly' ? 'calm' : f.temper === 'asleep' ? 'passed' : 'hostile' };
  });
  room.foes = room.throne ? [...room.foes, ...foes] : foes;
  room.things = plan.things.map((t, i) => {
    const rr = r(`thing${i}-${t.kind}`);
    if (t.kind === 'coins') return { kind: 'coins', state: 'new', gold: (t.gold === 'lots' ? randInt(rr, 12, 20) : randInt(rr, 3, 7)) * floor, x: t.x, y: t.y };
    if (t.kind === 'item') return { kind: 'item', state: 'new', item: t.item, x: t.x, y: t.y };
    if (t.kind === 'weapon') return { kind: 'weapon', state: 'new', weapon: t.weapon, x: t.x, y: t.y };
    if (t.kind === 'note') return { kind: 'note', state: 'new', text: t.text || '', x: t.x, y: t.y };
    if (t.kind === 'snare') return { kind: 'snare', state: 'new', snare: t.snare, x: t.x, y: t.y };
    const f = makeFeature(rr, t.kind, floor);
    Object.assign(f, { x: t.x, y: t.y });
    if (t.kind === 'chest') { f.mimic = t.trap === 'mimic'; f.trapped = t.trap === 'needle'; }
    if (t.kind === 'corpse') f.grubs = t.grubs;
    if (t.kind === 'fountain') f.effect = t.effect;
    if ('gold' in t && t.gold !== 'dice') f.gold = t.gold === 'none' ? 0 : t.gold === 'lots' ? roll(rr, '6d6') * floor : roll(rr, '3d6') * floor;
    if (t.items) f.items = t.items.slice();
    if (t.kind === 'chest' && (t.items || t.weapon)) f.weapon = t.weapon;
    return f;
  });
  room.line = text(spec.line, MAX_LINE) || null;
  room.bare = false; room.plan = null;
  return room;
}
// The rooms the Dungeon Master can see into and plan: still bare, and beside a room the hero
// has been in (or the room the hero is waiting to have described).
export function editableRooms(floorObj, waitingFor = null) {
  const out = [];
  for (const room of floorObj.rooms) {
    if (!room.bare) continue;
    if (room.id === waitingFor || Object.values(room.exits).some((id) => floorObj.rooms[id].visited)) out.push(room.id);
  }
  return out;
}

// ---------- an older save ----------
// Saves from before rooms held lists (a room had one foe, one feature, gold and an item).
export function upgradeSave(S) {
  if (!S || S.v !== 1) return S;
  const fix = (room) => {
    if (room.foes) return;
    room.foes = room.foe ? [room.foe] : [];
    room.things = [];
    if (room.feature) { const f = room.feature; if (f.item !== undefined) { f.items = f.item ? [f.item] : []; delete f.item; } room.things.push(f); }
    if (room.gold) room.things.push({ kind: 'coins', state: 'new', gold: room.gold });
    if (room.item) room.things.push({ kind: 'item', state: 'new', item: room.item });
    if (room.bare) room.plan = { foes: [], things: [] };
    delete room.foe; delete room.feature; delete room.gold; delete room.item;
  };
  if (S.map) S.map.rooms.forEach(fix);
  if (S.fight) S.fight.target = 0;
  if (S.mode === 'shop' && S.map) S.shop = S.map.rooms[S.at].things.findIndex((t) => t.kind === 'merchant');
  S.v = 2;
  return S;
}

// a hero's hit points on the first step down (the new-game screen shows it before they go)
export function startingHp(cls) { const K = CLASSES[cls]; return K.hitDie + 2 * mod(K.stats.con) + START_HP + (K.hpBonus || 0); }

// ---------- the game ----------
export function createDelve({ saved = null, seed = 1, rnd = Math.random, on = () => {} } = {}) {
  let S = saved && (saved.v === 1 || saved.v === 2) ? upgradeSave(saved) : fresh(seed, null);

  function fresh(seed, record, role = 'hero') {
    const r = streamFor(seed, 'names');
    const names = {}; for (const c in CLASSES) names[c] = pick(r, CLASSES[c].names);
    return {
      v: 2, seed, role, mode: 'create', names, hero: null, quest: null, floor: 1, map: null, at: 0, from: null,
      fight: null, log: [], turn: 0, acts: 0, page: null, intro: null, notes: null,
      tally: { kills: 0, gold: 0, rooms: 0 },
      record: record || { runs: 0, wins: 0, deepest: 0 },
    };
  }

  const room = () => S.map.rooms[S.at];
  const H = () => S.hero;
  const C = () => CLASSES[S.hero.cls];
  const prof = () => 2 + Math.floor((H().lvl - 1) / 4);
  const statMod = (s) => mod(H().stats[s]);
  const weaponStat = () => { const w = WEAPONS[H().weapon]; return w.stat === 'best' ? (statMod('dex') > statMod('str') ? 'dex' : 'str') : w.stat; };
  const ac = () => C().ac + (H().armour || 0);
  const poolMax = () => C().poolBase + (H().lvl - 1) * C().poolPerLvl;
  const has = (id) => H().bag.find((b) => b.id === id && b.n > 0);
  const dc = (base) => base + Math.floor(S.floor * 1.2);
  const hostile = (rm) => rm.foes.filter((f) => f.state === 'hostile');
  const asleep = (rm) => rm.foes.filter((f) => f.state === 'passed');
  // a creature as events carry it: its kind, its name if the Dungeon Master gave it one, and
  // its place in the room (so the map can show the blow land on the right one)
  const fd = (f) => ({ foe: f.kind, fname: f.name || null, fi: S.map ? room().foes.indexOf(f) : -1 });

  // ---- events: kept for the storyteller and sent to the page as they happen
  let events = [];
  function ev(t, data = {}) { const e = { t, ...data }; events.push(e); on(t, e); return e; }
  function check(stat, target, adv = false, what = '') {
    const a = d20(rnd), b = adv ? d20(rnd) : 0, die = Math.max(a, b), m = statMod(stat);
    const ok = die === 20 || (die !== 1 && die + m >= target);
    ev('roll', { what, stat, die, mod: m, dc: target, adv, ok });
    return ok;
  }

  function gainXp(n) {
    H().xp += n;
    while (XP_AT[H().lvl + 1] != null && H().xp >= XP_AT[H().lvl + 1]) {
      H().lvl++;
      const gain = Math.max(2, Math.floor(C().hitDie / 2) + 1 + statMod('con'));
      H().maxHp += gain; H().hp = H().maxHp;
      H().pool = poolMax();
      H().boosts = (H().boosts || 0) + 1;
      ev('level', { lvl: H().lvl, hp: gain });
    }
  }
  function hurt(n, source, fname = null) {
    n = Math.max(1, n);
    H().hp = Math.max(0, H().hp - n);
    ev('hurt', { n, source, fname, hp: H().hp, maxHp: H().maxHp });
    if (H().hp <= 0) die(source);
  }
  function heal(n, source) {
    const before = H().hp; H().hp = Math.min(H().maxHp, H().hp + n);
    ev('heal', { n: H().hp - before, source, hp: H().hp, maxHp: H().maxHp });
  }
  function die(source) {
    S.mode = 'dead'; S.fight = null;
    S.record.runs++; S.record.deepest = Math.max(S.record.deepest, S.floor);
    ev('dead', { source, floor: S.floor });
  }
  function giveItem(id, n = 1) {
    const I = ITEMS[id];
    if (I.use === 'armour') {
      if ((H().armour || 0) >= I.ac) { H().gold += Math.floor(I.price / 2); ev('gold', { n: Math.floor(I.price / 2), from: I.name }); return; }
      H().armour = I.ac; H().shield = id; ev('equip', { item: id, name: I.name }); return;
    }
    const b = H().bag.find((x) => x.id === id);
    if (b) b.n += n; else H().bag.push({ id, n });
    ev('item', { item: id, name: I.name, n });
  }
  function giveWeapon(id) {
    const W = WEAPONS[id], mine = WEAPONS[H().weapon];
    const val = (w) => avgDice(w.dice) + (w.stat === 'best' ? Math.max(statMod('str'), statMod('dex')) : statMod(w.stat));
    if (val(W) > val(mine)) { H().weapon = id; ev('equip', { weapon: id, name: W.name, dice: W.dice }); }
    else { H().gold += 6 * S.floor; ev('gold', { n: 6 * S.floor, from: W.name }); }
  }
  function gold(n, from) { if (n <= 0) return; H().gold += n; S.tally.gold += n; ev('gold', { n, from }); }
  function giveContents(T, from) {
    gold(T.gold || 0, from);
    for (const it of T.items || []) giveItem(it);
    if (T.weapon) giveWeapon(T.weapon);
  }

  // ---- moving about
  function enter(id, how = 'walk') {
    S.from = S.at; S.at = id;
    const rm = room(), first = !rm.visited;
    if (first) { rm.visited = true; S.tally.rooms++; }
    S.turn++;
    ev('enter', { room: id, name: rm.name, first, how });
    if (H().poison > 0) { H().poison--; hurt(1, 'poison'); }
    snares();
    charge();
  }
  // A snare the Dungeon Master hid goes off the first time the hero comes in: a sharp eye
  // (WIS) sees it and steps round it; otherwise a pit or darts hurt (DEX for half), and gas
  // poisons (CON resists). Rogues have advantage spotting one, as with a chest's trap.
  function snares() {
    for (const t of room().things) {
      if (t.kind !== 'snare' || t.state !== 'new' || S.mode === 'dead') continue;
      t.state = 'used';
      if (check('wis', dc(12), C().perks && C().perks.traps, 'spot')) { ev('snareSpotted', { snare: t.snare }); continue; }
      ev('snare', { snare: t.snare });
      if (t.snare === 'gas') { if (!check('con', dc(10), false, 'poison')) { H().poison = POISON_MOVES; ev('poisoned', { foe: 'gas' }); } else ev('retch', {}); continue; }
      const n = roll(rnd, t.snare === 'pit' ? '2d6' : '3d4') + S.floor;
      hurt(check('dex', dc(10), false, t.snare === 'pit' ? 'leap' : 'duck') ? Math.ceil(n / 2) : n, t.snare);
    }
  }
  // a fierce creature does not wait to be asked: it goes for the hero the moment they come in
  function charge() {
    if (S.mode !== 'explore') return;
    const i = room().foes.findIndex((f) => f.state === 'hostile' && f.temper === 'fierce');
    if (i < 0) return;
    ev('charge', fd(room().foes[i]));
    startFight('charge', i); foeTurn(); if (S.fight) S.fight.round++;
  }
  function descend(extra) {
    S.floor++;
    S.map = makeFloor(S.seed, S.floor, S.quest.boss);
    S.map.premise = S.quest.premises[S.floor - 1];
    if (extra && extra.plan) applyFloorPlan(S.seed, S.map, extra.plan);
    if (S.role === 'dm') bareFloor(S.map);
    S.at = 0; S.from = null; S.map.rooms[0].visited = true; S.rested = false;
    S.record.deepest = Math.max(S.record.deepest, S.floor);
    ev('descend', { floor: S.floor, name: THEMES[S.floor - 1].name, premise: S.map.premise });
    heal(Math.ceil(H().maxHp * STAIR_REST), 'stair');
    H().pool = poolMax();
    arrive();
  }
  // At the foot of a stair: the room is described at once, or, for a Dungeon Master, they
  // write it first and the hero waits (mode 'furnish' with here set: no door to walk through).
  function arrive() {
    if (S.role === 'dm' && room().bare) { S.mode = 'furnish'; S.furnish = { to: S.at, dir: null, here: true }; ev('furnish', { room: S.at, dir: null, here: true, name: room().name }); }
    else ev('enter', { room: S.at, name: room().name, first: true, how: 'stairs' });
  }

  // ---- fighting
  // The fight is with one creature at a time (S.fight.target, a place in room().foes); every
  // other hostile one in the room joins in with its own swing.
  function startFight(how = 'fight', idx = null) {
    const rm = room();
    if (idx == null || idx < 0) idx = rm.foes.findIndex((f) => f.state === (how === 'ambush' ? 'passed' : 'hostile'));
    for (const f of rm.foes) if (f.state === 'passed') f.state = 'hostile';
    rm.foes[idx].state = 'hostile';
    S.mode = 'fight';
    S.fight = { round: 1, ward: 0, riposte: 0, ambush: how === 'ambush', target: idx };
    ev('fight', { ...fd(rm.foes[idx]), how });
  }
  function foe() {
    const rm = room();
    if (S.fight) return rm.foes[S.fight.target];
    return hostile(rm)[0] || asleep(rm)[0] || rm.foes[rm.foes.length - 1] || null;
  }
  function damageFoe(n, how) {
    const f = foe(); n = Math.max(1, n);
    f.hp = Math.max(0, f.hp - n);
    ev('hit', { by: 'hero', n, how, ...fd(f), hp: f.hp, maxHp: f.maxHp });
    if (f.hp <= 0) killFoe('dead');
  }
  function killFoe(state) {
    const f = foe(), M = MONSTERS[f.kind];
    f.state = state;
    const xp = state === 'dead' ? M.xp : Math.floor(M.xp / 2);
    S.tally.kills++;
    ev('kill', { ...fd(f), how: state, xp });
    gainXp(xp);
    if (state === 'dead') gold(Math.round(randInt(rnd, M.gold[0], M.gold[1]) * (1 + 0.4 * (S.floor - 1))), M.name);
    if (M.boss) { S.mode = 'won'; S.fight = null; S.record.runs++; S.record.wins++; ev('won', { floor: S.floor, boss: f.kind }); return; }
    // the next one steps up, or the fight is over
    const next = room().foes.findIndex((g) => g.state === 'hostile');
    if (next >= 0 && S.mode === 'fight') { S.fight.target = next; S.fight.riposte = 0; ev('next', fd(room().foes[next])); }
    else { S.mode = 'explore'; S.fight = null; }
  }
  function attackRoll(stat, bonus = 0) {
    const a = d20(rnd), b = S.fight && S.fight.ambush ? d20(rnd) : 0, die = Math.max(a, b);
    const m = statMod(stat) + prof() + bonus + (S.fight.riposte || 0) + (H().bless ? 2 : 0);
    const hit = die === 20 || (die !== 1 && die + m >= foe().ac);
    ev('roll', { what: 'attack', stat, die, mod: m, dc: foe().ac, adv: !!b, ok: hit, crit: die === 20 });
    S.fight.riposte = 0;
    return { hit, crit: die === 20 };
  }
  function weaponHit(extraDice, mult = 1, how = 'weapon') {
    const st = weaponStat(), { hit, crit } = attackRoll(st);
    if (!hit) { ev('miss', { by: 'hero', ...fd(foe()), how }); return; }
    let n = roll(rnd, WEAPONS[H().weapon].dice, crit) + statMod(st) + (H().bless ? 2 : 0);
    if (extraDice) n += roll(rnd, extraDice, crit) * mult;
    if (C().perks && C().perks.dirty) n += roll(rnd, C().perks.dirty, crit);
    damageFoe(n, crit ? 'crit' : how);
  }
  function swing(f, extra, worse = 0) {
    const M = MONSTERS[f.kind];
    const target = ac() + extra + S.fight.ward + worse;
    const die = d20(rnd), hit = die === 20 || (die !== 1 && die + f.atk >= target);
    ev('foeroll', { ...fd(f), die, mod: f.atk, dc: target, ok: hit });
    S.fight.ward = 0;
    if (!hit) { ev('miss', { by: 'foe', ...fd(f) }); return; }
    hurt(roll(rnd, M.dmg, die === 20), f.kind, f.name || null);
    if (M.poison && H().hp > 0 && !H().poison && !check('con', dc(10), false, 'poison')) { H().poison = POISON_MOVES; ev('poisoned', fd(f)); }
  }
  // The one the hero faces swings; then, in a crowd, JOINERS of the others get a swing in too,
  // taking turns round by round and getting in each other's way (JOIN_MISS). Every one of
  // three rats swinging every round killed a fresh fighter in three rounds; this keeps a crowd
  // worse than one, not a wall.
  function foeTurn(extra = 0) {
    if (S.mode !== 'fight' || !foe() || foe().state !== 'hostile') return;
    swing(foe(), extra);
    const others = room().foes.filter((f) => f !== foe() && f.state === 'hostile');
    for (let k = 0; k < Math.min(JOINERS, others.length) && S.mode === 'fight'; k++) {
      const f = others[(S.fight.round - 1 + k) % others.length];
      ev('joins', fd(f));
      swing(f, extra, JOIN_MISS);
    }
  }
  function endRound() {
    if (S.mode === 'fight') { foeTurn(); if (S.fight) S.fight.round++; if (S.fight) S.fight.ambush = false; }
  }
  function useItem(id) {
    const I = ITEMS[id], b = has(id); if (!b) return;
    b.n--; if (!b.n) H().bag = H().bag.filter((x) => x.n > 0);
    ev('use', { item: id, name: I.name });
    if (I.use === 'heal') heal(roll(rnd, I.dice), I.name);
    if (I.use === 'pool') { H().pool = Math.min(poolMax(), H().pool + I.n); ev('pool', { n: I.n, pool: H().pool }); }
    if (I.use === 'cure') { H().poison = 0; heal(roll(rnd, I.dice), I.name); ev('cured', {}); }
    if (I.use === 'blast') damageFoe(roll(rnd, I.dice), I.name);
  }
  function useSkill(id) {
    const K = SKILLS[id];
    H().pool -= K.cost;
    ev('skill', { skill: id, name: K.name });
    if (K.kind === 'heal') return heal(roll(rnd, K.dice) + Math.max(0, statMod(K.stat)), K.name);
    if (K.kind === 'strike') return weaponHit(K.dice, K.undead && MONSTERS[foe().kind].undead ? K.undead : 1, K.name);
    if (K.kind === 'bolt') {
      const { hit, crit } = attackRoll(K.stat);
      if (hit) damageFoe(roll(rnd, K.dice, crit) + Math.max(0, Math.floor(statMod(K.stat) / 2)) + (K.perLvl || 0) * (H().lvl - 1), K.name); else ev('miss', { by: 'hero', ...fd(foe()), how: K.name });
      return;
    }
    if (K.kind === 'auto') return damageFoe(roll(rnd, K.dice) + (K.flat || 0) + (K.perLvl || 0) * (H().lvl - 1), K.name);
    if (K.kind === 'ward') { S.fight.ward = K.ac; return ev('ward', { ac: K.ac }); }
    if (K.kind === 'escape') { S.mode = 'explore'; S.fight = null; ev('escape', { how: K.name }); return enter(S.from, 'flee'); }
    if (K.kind === 'turn') { if (check('wis', dc(10), false, 'turn')) killFoe('fled'); else ev('unmoved', fd(foe())); }
  }

  // ---------- the choices ----------
  // Each is { id, verb, label, tag, check?, chance?, icon, group?, disabled? }. The label is
  // the book's plain wording; a storyteller may reword it, never change what it does.
  const sneakDc = (hs) => Math.max(...hs.map((f) => MONSTERS[f.kind].alert + (f.wits === 'sharp' ? SHARP_ALERT : f.wits === 'dull' ? -SHARP_ALERT : 0))) + S.floor + 2 * (hs.length - 1);
  const parleyDc = (f) => dc(11) - (f.wits === 'sharp' ? SHARP_TALK : 0) + (f.temper === 'fierce' ? FIERCE_TALK : 0);
  // a label for one of several things of a kind: "the chest", or "the second chest"
  const ORD = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'];
  function nth(rm, i, noun) {
    const same = rm.things.filter((t) => t.kind === rm.things[i].kind);
    return same.length > 1 ? `the ${ORD[same.indexOf(rm.things[i])]} ${noun}` : `the ${noun}`;
  }
  function choices() {
    const out = [];
    const add = (c) => { out.push(c); return c; };
    const chk = (stat, target, adv) => ({ check: { stat, dc: target, adv: !!adv }, chance: chanceOf(statMod(stat), target, adv), tag: `${stat.toUpperCase()} check` });
    if (S.mode === 'create') {
      for (const c in CLASSES) add({ id: 'class:' + c, verb: 'class', label: `${S.names[c]}, ${CLASSES[c].race} ${CLASSES[c].name}`, tag: CLASSES[c].blurb, icon: CLASSES[c].sprite });
      return out;
    }
    if (S.mode === 'dead' || S.mode === 'won') { add({ id: 'new', verb: 'new', label: 'Begin a new delve', tag: 'New dungeon', icon: 29 }); return out; }
    // the Dungeon Master's own steps: the view shows its own page for these, and the one
    // choice is what its button calls
    if (S.mode === 'prologue') { add({ id: 'prologue', verb: 'prologue', label: 'Begin the story', tag: 'Dungeon Master', icon: 56 }); return out; }
    if (H().boosts > 0) {
      const order = Object.entries(C().stats).sort((a, b) => b[1] - a[1]).map((e) => e[0]);
      const three = order.slice(0, 2); three.push(three.includes('con') ? order[2] : 'con');
      for (const s of three)
        add({ id: 'boost:' + s, verb: 'boost', label: `Train your ${STAT_NAME[s]}`, tag: `${H().stats[s]} → ${H().stats[s] + 1}`, icon: 41 });
      return out;
    }
    if (S.mode === 'furnish') { add({ id: 'furnish', verb: 'furnish', label: 'Let them in', tag: 'Dungeon Master', icon: 45 }); return out; }
    const rm = room();
    if (S.mode === 'shop') {
      for (const id of rm.things[S.shop].stock) {
        const I = ITEMS[id], price = priceOf(id);
        add({ id: 'buy:' + id, verb: 'buy', label: `Buy ${I.name.toLowerCase()}`, tag: `${price} gold`, icon: I.sprite, disabled: H().gold < price });
      }
      add({ id: 'leave', verb: 'leave', label: 'Done trading', tag: 'Leave', icon: 45 });
      return out;
    }
    if (S.mode === 'fight') {
      const f = foe(), M = MONSTERS[f.kind];
      add({ id: 'attack', verb: 'attack', label: `Attack ${f.name ? f.name + ' ' : ''}with your ${WEAPONS[H().weapon].name.toLowerCase()}`, tag: `Attack · ${WEAPONS[H().weapon].dice}`, icon: WEAPONS[H().weapon].sprite, chance: hitChance(statMod(weaponStat()) + prof()) });
      for (const k of C().skills) {
        const K = SKILLS[k];
        if (K.kind === 'turn' && (!M.undead || M.boss)) continue;
        if (K.firstRound && !(S.fight.round === 1 || S.fight.ambush)) continue;
        if (K.kind === 'escape' && S.from == null) continue;
        if (K.kind === 'heal' && H().hp >= H().maxHp) continue;
        add({ id: 'skill:' + k, verb: 'skill', label: K.name, tag: `${C().pool}: ${K.cost}`, icon: K.icon, group: 'skill', disabled: H().pool < K.cost });
      }
      for (const b of H().bag) if (ITEMS[b.id].fight && !(ITEMS[b.id].use === 'heal' && H().hp >= H().maxHp)) add({ id: 'use:' + b.id, verb: 'use', label: `Use ${ITEMS[b.id].name.toLowerCase()}`, tag: `×${b.n}`, icon: ITEMS[b.id].sprite, group: 'item' });
      add({ id: 'dodge', verb: 'dodge', label: 'Dodge and roll', icon: 102, ...chk('dex', f.atk + 9, C().perks && C().perks.sneak) });
      const boss = room().foes.some((g) => g.state === 'hostile' && MONSTERS[g.kind].boss);
      add({ id: 'flee', verb: 'flee', label: S.from != null ? `Flee back to ${S.map.rooms[S.from].name}` : 'Flee', icon: 45, ...chk('dex', dc(9) + (boss ? 3 : 0)), disabled: S.from == null });
      return out;
    }
    // exploring
    const hs = hostile(rm);
    if (hs.length) {
      const f = hs[0], more = hs.length > 1 ? ` and ${hs.length === 2 ? 'the other' : `the ${hs.length - 1} others`}` : '';
      add({ id: 'fight', verb: 'fight', label: `Fight ${callFoe(f)}${more}`, tag: 'Attack', icon: WEAPONS[H().weapon].sprite });
      if (!hs.some((g) => MONSTERS[g.kind].boss)) add({ id: 'sneak', verb: 'sneak', label: hs.length > 1 ? 'Creep past them in the shadows' : f.name ? `Creep past ${f.name} in the shadows` : 'Creep past in the shadows', icon: 103, ...chk('dex', sneakDc(hs), C().perks && C().perks.sneak) });
      const talker = hs.find(canTalk);
      if (talker) add({ id: 'parley', verb: 'parley', label: `Talk your way past ${callFoe(talker)}`, icon: 86, ...chk('cha', parleyDc(talker)) });
      if (S.from != null) add({ id: 'back', verb: 'back', label: `Back away to ${S.map.rooms[S.from].name}`, icon: 45, ...chk('dex', dc(7)) });
      for (const b of H().bag) if (ITEMS[b.id].use === 'heal' && H().hp < H().maxHp) add({ id: 'use:' + b.id, verb: 'use', label: `Drink a ${ITEMS[b.id].name.toLowerCase()} first`, tag: `×${b.n}`, icon: ITEMS[b.id].sprite, group: 'item' });
      return out;
    }
    const zs = asleep(rm);
    if (zs.length) add({ id: 'ambush', verb: 'ambush', label: zs[0].name ? `Ambush ${zs[0].name} while they doze` : `Ambush the sleeping ${MONSTERS[zs[0].kind].name}`, tag: 'Attack · advantage', icon: 103 });
    const calm = !zs.length;
    const loose = rm.things.filter((t) => isLoose(t) && t.state === 'new');
    if (calm && loose.length) { const g = loose.reduce((a, t) => a + (t.gold || 0), 0); add({ id: 'take', verb: 'take', label: 'Gather up what is lying here', tag: g ? `${g} gold` : 'Loot', icon: 89 }); }
    if (calm) rm.things.forEach((T, i) => {
      if (isLoose(T)) return;
      const k = T.kind;
      if (T.state === 'new') {
        if (k === 'chest') {
          add({ id: 'open:' + i, verb: 'open', label: `Open ${nth(rm, i, 'chest')}`, tag: 'Loot', icon: 89 });
          if (!T.searched) add({ id: 'search:' + i, verb: 'search', label: `Check ${nth(rm, i, 'chest')} for traps`, icon: 41, ...chk('wis', dc(10), C().perks && C().perks.traps) });
        }
        if (k === 'altar') {
          add({ id: 'pray:' + i, verb: 'pray', label: `Kneel and pray at ${nth(rm, i, 'altar')}`, icon: 65, ...chk('wis', dc(10)) });
          add({ id: 'offer:' + i, verb: 'offer', label: `Leave an offering of gold${rm.things.filter((t) => t.kind === 'altar').length > 1 ? ` at ${nth(rm, i, 'altar')}` : ''}`, tag: `${offerCost()} gold`, icon: 65, disabled: H().gold < offerCost() });
        }
        if (k === 'fountain') add({ id: 'drink:' + i, verb: 'drink', label: `Drink from ${nth(rm, i, 'fountain')}`, tag: 'Who knows?', icon: 20 });
        if (k === 'corpse') add({ id: 'search:' + i, verb: 'search', label: `Search ${nth(rm, i, 'body')}`, tag: 'Loot', icon: 0 });
        if (k === 'shelf') add({ id: 'read:' + i, verb: 'read', label: `Read the old books${rm.things.filter((t) => t.kind === 'shelf').length > 1 ? ` on ${nth(rm, i, 'shelf')}` : ''}`, icon: 63, ...chk('int', dc(10)) });
        if (k === 'statue') add({ id: 'inspect:' + i, verb: 'inspect', label: `Look closely at ${nth(rm, i, 'statue')}`, icon: 7, ...chk('int', dc(11)) });
        if (k === 'camp') add({ id: 'rest:' + i, verb: 'rest', label: 'Rest by the old fire', tag: 'Heal · risky', icon: 29 });
      }
      if (k === 'merchant') add({ id: 'trade:' + i, verb: 'trade', label: 'Trade with the pedlar', tag: `${H().gold} gold`, icon: 85 });
      if (k === 'note' && T.state === 'new') add({ id: 'note:' + i, verb: 'note', label: `Read ${nth(rm, i, 'note')}`, tag: 'Words', icon: 63 });
    });
    rm.foes.forEach((f, i) => {
      if (f.state === 'calm' && f.gift) add({ id: 'talk:' + i, verb: 'talk', label: `Talk with ${callFoe(f)}`, tag: 'Friendly', icon: 86 });
    });
    for (const k of C().skills) {
      const K = SKILLS[k];
      if (K.also === 'explore' && H().hp < H().maxHp) add({ id: 'skill:' + k, verb: 'skill', label: K.name, tag: `${C().pool}: ${K.cost}`, icon: K.icon, group: 'skill', disabled: H().pool < K.cost });
    }
    for (const b of H().bag) {
      const I = ITEMS[b.id];
      if (!I.explore) continue;
      if ((I.use === 'heal' && H().hp >= H().maxHp) || (I.use === 'pool' && H().pool >= poolMax()) || (I.use === 'cure' && !H().poison)) continue;
      add({ id: 'use:' + b.id, verb: 'use', label: `Use ${I.name.toLowerCase()}`, tag: `×${b.n}`, icon: I.sprite, group: 'item' });
    }
    if (!S.rested && !rm.start && calm && (H().hp < H().maxHp || H().pool < poolMax()) && !rm.things.some((t) => t.kind === 'camp' && t.state === 'new'))
      add({ id: 'camp', verb: 'camp', label: 'Rest here a while', tag: 'Heal · once a floor · risky', icon: 29 });
    if (rm.stairs) add({ id: 'descend', verb: 'descend', label: `Take the stair down to ${THEMES[S.floor].name}`, tag: `Floor ${S.floor + 1}`, icon: 56 });
    for (const d of ['n', 'e', 's', 'w']) {
      const to = rm.exits[d]; if (to == null) continue;
      const other = S.map.rooms[to];
      add({ id: 'go:' + d, verb: 'go', label: other.visited ? `Back to ${other.name}` : `Take the ${DIR_NAME[d]} passage`, tag: other.visited ? DIR_NAME[d] : (clueFor(rm, d) || 'Unexplored'), icon: 45, group: other.visited ? 'back' : null });
    }
    return out;
  }
  const hitChance = (bonus) => chanceOf(bonus + (H().bless ? 2 : 0), foe().ac, S.fight && S.fight.ambush);
  const priceOf = (id) => Math.round(ITEMS[id].price * (1 + 0.15 * (S.floor - 1)));
  const offerCost = () => 8 * S.floor;

  // What shows through a doorway: a sign of what is really in the next room, if you notice.
  function clueFor(rm, d) {
    const other = S.map.rooms[rm.exits[d]];
    if (other.visited || rm.clue[d] + statMod('wis') < 8) return null;
    const i = (rm.decor + 'nesw'.indexOf(d)) >>> 0;
    const f = hostile(other)[0];
    if (f && MONSTERS[f.kind].signs.length) { const s = MONSTERS[f.kind].signs; return s[i % s.length]; }
    if (other.stairs) return 'a cold draught rising from below';
    const F = other.things.find((t) => FEATURES[t.kind] && t.state === 'new');
    if (F) { const s = FEATURES[F.kind].signs; return s[i % s.length]; }
    return null;
  }

  // ---------- the verbs ----------
  function act(id, extra = null) {
    const c = choices().find((x) => x.id === id);
    if (!c || c.disabled) return { ok: false, id, events: [] };
    events = [];
    const [verb, arg] = id.split(':');
    const rm = S.map ? room() : null;
    const T = rm && arg != null && /^\d+$/.test(arg) ? rm.things[+arg] : null;
    switch (verb) {
      case 'class': begin(arg, extra); break;
      case 'prologue': {
        // one page of the Dungeon Master's: the story's opening, what the AI knows, and the room
        // the hero starts in, all at once (Amber: "it's the same thing")
        S.intro = text(extra && extra.intro, MAX_PROLOGUE) || null;
        S.notes = text(extra && extra.notes, MAX_PROLOGUE) || S.intro;
        S.mode = 'explore';
        ev('begin', { cls: H().cls, name: H().name, why: S.quest.why, boss: S.quest.boss, premise: S.map.premise, intro: S.intro });
        if (room().bare) { furnishRoom(S.seed, S.map, S.at, { line: S.intro }); ev('enter', { room: S.at, name: room().name, first: true, how: 'stairs' }); charge(); }
        else arrive();
        break;
      }
      case 'new': S = fresh((rnd() * 2 ** 32) >>> 0, S.record, S.role); ev('new', { seed: S.seed }); break;
      case 'boost': H().stats[arg]++; H().boosts--; if (arg === 'con') { H().maxHp++; H().hp++; } ev('boost', { stat: arg, to: H().stats[arg] }); break;
      case 'go': {
        const to = rm.exits[arg];
        if (S.role === 'dm' && S.map.rooms[to].bare) { S.mode = 'furnish'; S.furnish = { to, dir: arg }; ev('furnish', { room: to, dir: arg, name: S.map.rooms[to].name, stairs: !!S.map.rooms[to].stairs }); }
        else enter(to);
        break;
      }
      case 'furnish': {
        const { to, here } = S.furnish;
        furnishRoom(S.seed, S.map, to, extra || {});
        S.mode = 'explore'; S.furnish = null;
        if (here) { ev('enter', { room: to, name: room().name, first: true, how: 'stairs' }); charge(); }
        else enter(to);
        break;
      }
      case 'descend': descend(extra); break;
      case 'fight': startFight(); break;
      case 'ambush': startFight('ambush'); break;
      case 'sneak': {
        const hs = hostile(rm);
        if (check('dex', c.check.dc, c.check.adv, 'sneak')) {
          for (const f of hs) f.state = 'passed';
          ev('sneaked', { ...fd(hs[0]), n: hs.length });
          gainXp(hs.reduce((a, f) => a + Math.floor(MONSTERS[f.kind].xp / 2), 0));
        } else { ev('spotted', fd(hs[0])); startFight('spotted'); foeTurn(); if (S.fight) S.fight.round++; }
        break;
      }
      case 'parley': {
        const f = hostile(rm).find(canTalk), M = MONSTERS[f.kind];
        if (check('cha', c.check.dc, false, 'parley')) {
          const toll = (M.toll || 5) * S.floor;
          if (H().gold >= toll && rnd() < 0.5) { H().gold -= toll; ev('toll', { ...fd(f), n: toll }); }
          f.state = 'calm'; ev('calmed', fd(f));
          gainXp(Math.floor(M.xp / 2));
        } else { ev('insulted', fd(f)); startFight('insulted', rm.foes.indexOf(f)); foeTurn(); if (S.fight) S.fight.round++; }
        break;
      }
      case 'back':
        if (!check('dex', c.check.dc, false, 'retreat')) { S.mode = 'fight'; S.fight = { round: 1, ward: 0, riposte: 0, target: rm.foes.indexOf(hostile(rm)[0]) }; foeTurn(); if (S.mode === 'fight') { S.mode = 'explore'; S.fight = null; } }
        if (S.mode !== 'dead') enter(S.from, 'retreat');
        break;
      case 'attack': weaponHit(null); endRound(); break;
      case 'skill': {
        const K = SKILLS[arg];
        useSkill(arg);
        if (S.mode === 'fight' && K.kind !== 'escape') endRound();
        break;
      }
      case 'use': useItem(arg); if (S.mode === 'fight') endRound(); break;
      case 'dodge':
        if (check('dex', c.check.dc, c.check.adv, 'dodge')) { S.fight.riposte = 2; ev('dodged', fd(foe())); S.fight.round++; }
        else { foeTurn(2); if (S.fight) S.fight.round++; }
        break;
      case 'flee':
        if (check('dex', c.check.dc, false, 'flee')) { S.mode = 'explore'; S.fight = null; ev('escape', { how: 'flee' }); enter(S.from, 'flee'); }
        else { ev('cornered', fd(foe())); foeTurn(2); if (S.fight) S.fight.round++; }
        break;
      case 'take':
        for (const t of rm.things) if (t.kind === 'coins' && t.state === 'new') { gold(t.gold, 'floor'); t.state = 'used'; }
        for (const t of rm.things) if (t.kind === 'item' && t.state === 'new') { giveItem(t.item); t.state = 'used'; }
        for (const t of rm.things) if (t.kind === 'weapon' && t.state === 'new') { giveWeapon(t.weapon); t.state = 'used'; }
        break;
      case 'note': T.state = 'used'; ev('note', { text: T.text }); break;
      case 'talk': { const f = rm.foes[+arg]; ev('gift', { ...fd(f), item: f.gift, name: ITEMS[f.gift].name }); giveItem(f.gift); f.gift = null; break; }
      case 'open':
        if (T.mimic) {
          T.state = 'used'; rm.foes.push(makeFoe(rnd, 'mimic', S.floor));
          ev('mimic', {}); startFight('mimic', rm.foes.length - 1); foeTurn(); if (S.fight) S.fight.round++;
          break;
        }
        if (T.trapped && !T.disarmed) {
          ev('trap', {});
          const n = roll(rnd, '2d6') + S.floor;
          hurt(check('dex', dc(11), C().perks && C().perks.traps, 'trap') ? Math.ceil(n / 2) : n, 'trap');
          if (S.mode === 'dead') break;
        }
        T.state = 'used'; ev('opened', {});
        giveContents(T, 'chest');
        break;
      case 'search':
        if (T.kind === 'corpse') {
          T.state = 'used'; ev('searched', { kind: 'corpse' });
          if (T.grubs) { ev('grubs', {}); hurt(roll(rnd, '1d4') + S.floor - 1, 'grubs'); if (S.mode === 'dead') break; }
          gold(T.gold, 'body'); for (const it of T.items || []) giveItem(it);
          break;
        }
        T.searched = true;
        if (check('wis', c.check.dc, c.check.adv, 'search')) {
          if (T.mimic) { T.state = 'used'; rm.foes.push(makeFoe(rnd, 'mimic', S.floor)); ev('mimicFound', {}); }
          else if (T.trapped) { T.disarmed = true; ev('disarmed', {}); }
          else ev('safe', {});
        } else ev('nothingFound', {});
        break;
      case 'pray':
        T.state = 'used';
        if (check('wis', c.check.dc, false, 'pray')) { H().bless = 1; ev('blessed', {}); heal(roll(rnd, '1d6') + S.floor, 'altar'); }
        else ev('silence', {});
        break;
      case 'offer': T.state = 'used'; H().gold -= offerCost(); ev('offered', { n: offerCost() }); H().bless = 1; ev('blessed', {}); heal(roll(rnd, '2d6') + S.floor, 'altar'); break;
      case 'drink': {
        T.state = 'used'; const x = rnd();
        ev('drank', {});
        // the Dungeon Master may have said what the water does; otherwise the dice decide
        const fx = !T.effect || T.effect === 'random' ? (x < 0.35 ? 'heal' : x < 0.55 ? 'hardy' : x < 0.7 ? 'clarity' : x < 0.9 ? 'poison' : 'plain') : T.effect;
        if (fx === 'heal') heal(H().maxHp, 'fountain');
        else if (fx === 'hardy') { H().maxHp += 2; H().hp += 2; ev('hardier', { n: 2 }); }
        else if (fx === 'clarity') { H().pool = poolMax(); ev('pool', { n: poolMax(), pool: H().pool }); }
        else if (fx === 'poison') { if (!check('con', dc(10), false, 'poison')) { H().poison = POISON_MOVES; ev('poisoned', { foe: 'fountain' }); } else ev('retch', {}); }
        else ev('plain', {});
        break;
      }
      case 'read':
        T.state = 'used';
        if (check('int', c.check.dc, false, 'read')) {
          if (!S.map.revealed) { S.map.revealed = true; ev('mapped', {}); } else ev('lore', {});
          gainXp(8 * S.floor);
        } else ev('crumbled', {});
        break;
      case 'inspect':
        T.state = 'used';
        if (check('int', c.check.dc, false, 'inspect')) { ev('cache', {}); gold(T.gold, 'statue'); for (const it of T.items || []) giveItem(it); }
        else ev('stone', {});
        break;
      case 'rest':
        T.state = 'used';
        heal(Math.ceil(H().maxHp / 2), 'rest'); H().pool = poolMax(); ev('rested', { pool: H().pool });
        if (rnd() < WANDERER_CHANCE) { const w = makeFoe(rnd, foeKind(rnd, S.floor), S.floor); rm.foes.push(w); ev('wanderer', fd(w)); }
        break;
      case 'camp':
        S.rested = true;
        heal(Math.ceil(H().maxHp * SHORT_REST), 'rest'); H().pool = Math.min(poolMax(), H().pool + Math.ceil(poolMax() / 2)); ev('rested', { pool: H().pool, short: true });
        if (rnd() < SHORT_RISK) { const w = makeFoe(rnd, foeKind(rnd, S.floor), S.floor); rm.foes.push(w); ev('wanderer', fd(w)); }
        break;
      case 'trade': S.mode = 'shop'; S.shop = +arg; ev('shop', {}); break;
      case 'buy': { const M = rm.things[S.shop]; H().gold -= priceOf(arg); ev('bought', { item: arg, n: priceOf(arg) }); giveItem(arg); M.stock.splice(M.stock.indexOf(arg), 1); break; }
      case 'leave': S.mode = 'explore'; S.shop = null; ev('leftShop', {}); break;
    }
    // a blessing lasts until the end of the next fight
    if (S.mode === 'explore' && H() && H().bless && events.some((e) => e.t === 'kill' || e.t === 'escape')) H().bless = 0;
    S.acts++;
    S.log.push({ id, label: c.label, events: events.map((e) => e.t) }); while (S.log.length > MAX_LOG) S.log.shift();
    ev('save', {});
    return { ok: true, id, choice: c, events };
  }

  function begin(cls, extra) {
    const K = CLASSES[cls];
    const hp = startingHp(cls);
    S.hero = { name: S.names[cls], cls, lvl: 1, xp: 0, hp, maxHp: hp, pool: K.poolBase, stats: { ...K.stats }, weapon: K.weapon, armour: 0, gold: 10, bag: K.kit.map(([id, n]) => ({ id, n })), poison: 0, bless: 0, boosts: 0 };
    S.quest = (extra && extra.quest) || chooseQuest(S.seed);
    S.mode = 'explore'; S.floor = 1;
    S.map = makeFloor(S.seed, 1, S.quest.boss);
    S.map.premise = S.quest.premises[0];
    if (extra && extra.plan) applyFloorPlan(S.seed, S.map, extra.plan);
    if (S.role === 'dm') bareFloor(S.map);
    S.at = 0; S.from = null; S.map.rooms[0].visited = true;
    // a Dungeon Master writes the opening first
    if (S.role === 'dm') { S.mode = 'prologue'; ev('prologue', { cls, name: S.hero.name, boss: S.quest.boss }); return; }
    ev('begin', { cls, name: S.hero.name, why: S.quest.why, boss: S.quest.boss, premise: S.map.premise });
    arrive();
  }

  // ---------- what the storyteller is told ----------
  // Plain facts about where you are and what just happened. Both storytellers (the book in
  // tell.js and a language model in dm.js) are given exactly this and nothing else.
  const foeFact = (f) => ({ kind: f.kind, name: callFoe(f), given: f.name || null, species: MONSTERS[f.kind].name, who: f.who || null, temper: f.temper || null, wits: f.wits || null, state: f.state, hurt: f.hp / f.maxHp, undead: !!MONSTERS[f.kind].undead, boss: !!MONSTERS[f.kind].boss });
  function facts() {
    const out = { mode: S.mode, floor: S.floor, place: THEMES[S.floor - 1].name, tag: THEMES[S.floor - 1].tag };
    if (!S.hero) return out;
    const h = H();
    out.role = S.role || 'hero';
    out.hero = { name: h.name, cls: C().name, race: C().race, lvl: h.lvl, hp: h.hp, maxHp: h.maxHp, hurt: h.hp / h.maxHp, poisoned: h.poison > 0, blessed: !!h.bless, weapon: WEAPONS[h.weapon].name };
    if (S.quest) out.quest = { why: S.quest.why, bossKind: S.quest.boss, bossName: MONSTERS[S.quest.boss].name };
    if (S.intro) out.intro = S.intro;
    if (S.notes) out.notes = S.notes;
    if (!S.map) return out;
    out.floorPremise = S.map.premise || null;
    const rm = room(), front = S.mode === 'prologue' ? null : foe(), F = featureOf(rm);
    out.room = {
      id: rm.id, name: rm.name, line: rm.line || null, start: rm.start, stairs: !!rm.stairs, throne: !!rm.throne, decor: rm.decor, props: rm.props,
      size: roomSize(rm),
      foes: rm.foes.map(foeFact),
      foe: front ? foeFact(front) : null,
      things: rm.things.map((t) => ({ kind: t.kind, state: t.state, searched: !!t.searched })),
      feature: F ? { kind: F.kind, state: F.state, searched: !!F.searched } : null,
      loot: rm.things.some((t) => isLoose(t) && t.state === 'new'),
      exits: Object.keys(rm.exits).map((d) => { const o = S.map.rooms[rm.exits[d]]; return { dir: d, way: DIR_NAME[d], visited: o.visited, name: o.visited ? o.name : null, clue: S.hero ? clueFor(rm, d) : null }; }),
    };
    if (S.mode === 'fight') out.fight = { round: S.fight.round, others: hostile(rm).length - 1 };
    if (S.mode === 'furnish') out.waiting = { dir: S.furnish.dir, here: !!S.furnish.here, way: S.furnish.dir ? DIR_NAME[S.furnish.dir] : null, name: S.map.rooms[S.furnish.to].name, stairs: !!S.map.rooms[S.furnish.to].stairs };
    return out;
  }

  // ---------- the Dungeon Master's map ----------
  const waitingFor = () => (S.mode === 'furnish' ? S.furnish.to : null);
  // nothing can be planned until the story has begun (the opening is written first)
  function editable() { return S.role === 'dm' && S.map && S.mode !== 'prologue' ? editableRooms(S.map, waitingFor()) : []; }
  // Replace one room's plan; returns the plan as it now stands (anything not allowed dropped),
  // or null if that room cannot be planned now.
  function setPlan(roomId, plan) {
    if (!editable().includes(roomId)) return null;
    const rm = S.map.rooms[roomId];
    rm.plan = cleanPlan(S.map, roomId, plan);
    return rm.plan;
  }

  return {
    get S() { return S; }, choices, act, facts, room: () => (S.map ? room() : null),
    ac: () => (S.hero ? ac() : 0), poolMax: () => (S.hero ? poolMax() : 0), prof: () => (S.hero ? prof() : 0),
    xpFor: (lvl) => XP_AT[lvl], note(page) { S.page = page; },
    newRun(seed, role = S.role) { S = fresh(seed, S.record, role); return S; },
    // who tells the story: 'hero' (you play) or 'dm' (you fill the rooms, an AI plays the
    // hero); only before a delve begins
    setRole(role) { if (S.mode === 'create' && (role === 'hero' || role === 'dm')) S.role = role; return S.role; },
    furnishMenu: (roomId = waitingFor()) => (S.map && roomId != null ? furnishMenu(S.map, roomId) : null),
    editable, setPlan,
    // what the hero faces right now (in a fight, the one they are fighting)
    foe: () => (S.map && S.hero && S.mode !== 'prologue' ? foe() : null),
    // a draft of a floor not yet entered, purely to build a menu for the Dungeon Master (or a
    // test) to plan from — touches no live state; bossKind defaults to the current quest's.
    previewFloor(floor, bossKind) { return makeFloor(S.seed, floor, bossKind || (S.quest && S.quest.boss) || null); },
  };
}
