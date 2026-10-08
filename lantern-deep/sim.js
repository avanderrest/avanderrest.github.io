/* Lantern Deep: the rules. A dungeon five floors deep, made from a seed: each floor is a
   handful of rooms on a grid, joined by passages, with the stair down in the room furthest
   from the one you came in by. Every room is decided before you reach it (its foe, its
   chest, its altar), which is why the clues in the doorway can be true. Everything you do
   is a choice from choices(); act(id) resolves it with d20 checks and returns what happened
   as a list of events for the storyteller to tell. No page access in here: dice come in as
   `rnd`, and the events also go out through on(event, data). */

import { streamFor, randInt, pick, shuffle } from '../lib/rng.js';
import { FLOORS, XP_AT, STATS, STAT_NAME, CLASSES, SKILLS, WEAPONS, WEAPON_TIERS, ITEMS, LOOT_TIERS, MONSTERS, FEATURES, THEMES, DIRS, DIR_NAME, OPPOSITE } from './content.js';

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

// ---------- the floor ----------
// A random-growth tree of rooms over the grid, plus a loop or two so it is not all dead ends.
export function makeFloor(seed, floor) {
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
    Object.assign(room, { name, dist: dist[room.id], decor: (rr() * 1e9) >>> 0, foe: null, feature: null, gold: 0, item: null, start: room.id === 0, stairs: false, visited: false, clue: {} });
    for (const d of Object.keys(room.exits)) room.clue[d] = randInt(rr, 1, 20);
    room.props = shuffle(rr, theme.props.slice()).slice(0, 2);
    if (room.start) continue;
    if (room.id === far) {
      if (floor === FLOORS) { room.foe = makeFoe(rr, 'king', floor); room.throne = true; continue; }
      room.stairs = true;
      if (floor > 1 && rr() < GUARD_CHANCE) room.foe = makeFoe(rr, foeKind(rr, floor, true), floor);
      continue;
    }
    if (rr() < FOE_CHANCE) room.foe = makeFoe(rr, foeKind(rr, floor), floor);
    if (rr() < FEATURE_CHANCE) {
      let kind;
      do { kind = weighted(rr, FEATURES); } while ((kind === 'merchant' && (merchant || room.foe)) || (kind === 'camp' && room.foe));
      if (kind === 'merchant') merchant = true;
      room.feature = makeFeature(rr, kind, floor);
    }
    if (rr() < GOLD_CHANCE) room.gold = randInt(rr, 2, 6) * floor;
  }
  return { floor, rooms, revealed: false };
}

function weighted(r, table) {
  let total = 0; for (const k in table) total += table[k].weight;
  let x = r() * total;
  for (const k in table) { x -= table[k].weight; if (x < 0) return k; }
  return Object.keys(table)[0];
}
function foeKind(r, floor, tough = false) {
  const live = Object.keys(MONSTERS).filter((k) => !MONSTERS[k].boss && k !== 'mimic' && MONSTERS[k].tiers[0] <= floor && MONSTERS[k].tiers[1] >= floor);
  if (tough) { live.sort((a, b) => MONSTERS[b].xp - MONSTERS[a].xp); return pick(r, live.slice(0, 2)); }
  return pick(r, live);
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
    f.item = r() < 0.7 ? pick(r, LOOT_TIERS[floor - 1]) : null;
    f.weapon = r() < 0.28 ? pick(r, WEAPON_TIERS[floor - 1]) : null;
  }
  if (kind === 'corpse') { f.gold = roll(r, '2d6') * floor; f.item = r() < 0.45 ? pick(r, LOOT_TIERS[floor - 1]) : null; f.grubs = r() < 0.18; }
  if (kind === 'statue') { f.gold = 10 * floor; f.item = pick(r, LOOT_TIERS[floor - 1]); }
  if (kind === 'merchant') {
    const stock = new Set(['potion-heal']);
    while (stock.size < 4) stock.add(pick(r, [...LOOT_TIERS[floor - 1], ...LOOT_TIERS[Math.min(FLOORS - 1, floor)]]));
    f.stock = [...stock];
  }
  return f;
}

// ---------- the game ----------
export function createDelve({ saved = null, seed = 1, rnd = Math.random, on = () => {} } = {}) {
  let S = saved && saved.v === 1 ? saved : fresh(seed, null);

  function fresh(seed, record) {
    const r = streamFor(seed, 'names');
    const names = {}; for (const c in CLASSES) names[c] = pick(r, CLASSES[c].names);
    return {
      v: 1, seed, mode: 'create', names, hero: null, floor: 1, map: null, at: 0, from: null,
      fight: null, log: [], turn: 0, acts: 0, page: null,
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
  function hurt(n, source) {
    n = Math.max(1, n);
    H().hp = Math.max(0, H().hp - n);
    ev('hurt', { n, source, hp: H().hp, maxHp: H().maxHp });
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

  // ---- moving about
  function enter(id, how = 'walk') {
    S.from = S.at; S.at = id;
    const rm = room(), first = !rm.visited;
    if (first) { rm.visited = true; S.tally.rooms++; }
    S.turn++;
    ev('enter', { room: id, name: rm.name, first, how });
    if (H().poison > 0) { H().poison--; hurt(1, 'poison'); }
  }
  function descend() {
    S.floor++;
    S.map = makeFloor(S.seed, S.floor);
    S.at = 0; S.from = null; S.map.rooms[0].visited = true; S.rested = false;
    S.record.deepest = Math.max(S.record.deepest, S.floor);
    ev('descend', { floor: S.floor, name: THEMES[S.floor - 1].name });
    heal(Math.ceil(H().maxHp * STAIR_REST), 'stair');
    H().pool = poolMax();
    ev('enter', { room: 0, name: room().name, first: true, how: 'stairs' });
  }

  // ---- fighting
  function startFight(how = 'fight') {
    S.mode = 'fight';
    S.fight = { round: 1, ward: 0, riposte: 0, ambush: how === 'ambush' };
    room().foe.state = 'hostile';
    ev('fight', { foe: room().foe.kind, how });
  }
  function foe() { return room().foe; }
  function damageFoe(n, how) {
    const f = foe(); n = Math.max(1, n);
    f.hp = Math.max(0, f.hp - n);
    ev('hit', { by: 'hero', n, how, foe: f.kind, hp: f.hp, maxHp: f.maxHp });
    if (f.hp <= 0) killFoe('dead');
  }
  function killFoe(state) {
    const f = foe(), M = MONSTERS[f.kind];
    f.state = state;
    const xp = state === 'dead' ? M.xp : Math.floor(M.xp / 2);
    S.tally.kills++;
    ev('kill', { foe: f.kind, how: state, xp });
    gainXp(xp);
    if (state === 'dead') gold(Math.round(randInt(rnd, M.gold[0], M.gold[1]) * (1 + 0.4 * (S.floor - 1))), M.name);
    S.mode = 'explore'; S.fight = null;
    if (M.boss) { S.mode = 'won'; S.record.runs++; S.record.wins++; ev('won', { floor: S.floor }); }
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
    if (!hit) { ev('miss', { by: 'hero', foe: foe().kind, how }); return; }
    let n = roll(rnd, WEAPONS[H().weapon].dice, crit) + statMod(st) + (H().bless ? 2 : 0);
    if (extraDice) n += roll(rnd, extraDice, crit) * mult;
    if (C().perks && C().perks.dirty) n += roll(rnd, C().perks.dirty, crit);
    damageFoe(n, crit ? 'crit' : how);
  }
  function foeTurn(extra = 0) {
    if (S.mode !== 'fight' || !foe() || foe().state !== 'hostile') return;
    const f = foe(), M = MONSTERS[f.kind];
    const target = ac() + extra + S.fight.ward;
    const die = d20(rnd), hit = die === 20 || (die !== 1 && die + f.atk >= target);
    ev('foeroll', { foe: f.kind, die, mod: f.atk, dc: target, ok: hit });
    S.fight.ward = 0;
    if (!hit) { ev('miss', { by: 'foe', foe: f.kind }); return; }
    hurt(roll(rnd, M.dmg, die === 20), f.kind);
    if (M.poison && H().hp > 0 && !H().poison && !check('con', dc(10), false, 'poison')) { H().poison = POISON_MOVES; ev('poisoned', { foe: f.kind }); }
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
      if (hit) damageFoe(roll(rnd, K.dice, crit) + Math.max(0, Math.floor(statMod(K.stat) / 2)) + (K.perLvl || 0) * (H().lvl - 1), K.name); else ev('miss', { by: 'hero', foe: foe().kind, how: K.name });
      return;
    }
    if (K.kind === 'auto') return damageFoe(roll(rnd, K.dice) + (K.flat || 0) + (K.perLvl || 0) * (H().lvl - 1), K.name);
    if (K.kind === 'ward') { S.fight.ward = K.ac; return ev('ward', { ac: K.ac }); }
    if (K.kind === 'escape') { S.mode = 'explore'; S.fight = null; ev('escape', { how: K.name }); return enter(S.from, 'flee'); }
    if (K.kind === 'turn') { if (check('wis', dc(10), false, 'turn')) killFoe('fled'); else ev('unmoved', { foe: foe().kind }); }
  }

  // ---------- the choices ----------
  // Each is { id, verb, label, tag, check?, chance?, icon, group?, disabled? }. The label is
  // the book's plain wording; a storyteller may reword it, never change what it does.
  function choices() {
    const out = [];
    const add = (c) => { out.push(c); return c; };
    const chk = (stat, target, adv) => ({ check: { stat, dc: target, adv: !!adv }, chance: chanceOf(statMod(stat), target, adv), tag: `${stat.toUpperCase()} check` });
    if (S.mode === 'create') {
      for (const c in CLASSES) add({ id: 'class:' + c, verb: 'class', label: `${S.names[c]}, ${CLASSES[c].race} ${CLASSES[c].name}`, tag: CLASSES[c].blurb, icon: CLASSES[c].sprite });
      return out;
    }
    if (S.mode === 'dead' || S.mode === 'won') { add({ id: 'new', verb: 'new', label: 'Begin a new delve', tag: 'New dungeon', icon: 29 }); return out; }
    if (H().boosts > 0) {
      const order = Object.entries(C().stats).sort((a, b) => b[1] - a[1]).map((e) => e[0]);
      const three = order.slice(0, 2); three.push(three.includes('con') ? order[2] : 'con');
      for (const s of three)
        add({ id: 'boost:' + s, verb: 'boost', label: `Train your ${STAT_NAME[s]}`, tag: `${H().stats[s]} → ${H().stats[s] + 1}`, icon: 41 });
      return out;
    }
    const rm = room(), f = rm.foe, F = rm.feature;
    if (S.mode === 'shop') {
      for (const id of F.stock) {
        const I = ITEMS[id], price = priceOf(id);
        add({ id: 'buy:' + id, verb: 'buy', label: `Buy ${I.name.toLowerCase()}`, tag: `${price} gold`, icon: I.sprite, disabled: H().gold < price });
      }
      add({ id: 'leave', verb: 'leave', label: 'Done trading', tag: 'Leave', icon: 45 });
      return out;
    }
    if (S.mode === 'fight') {
      const M = MONSTERS[f.kind];
      add({ id: 'attack', verb: 'attack', label: `Attack with your ${WEAPONS[H().weapon].name.toLowerCase()}`, tag: `Attack · ${WEAPONS[H().weapon].dice}`, icon: WEAPONS[H().weapon].sprite, chance: hitChance(statMod(weaponStat()) + prof()) });
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
      add({ id: 'flee', verb: 'flee', label: S.from != null ? `Flee back to ${S.map.rooms[S.from].name}` : 'Flee', icon: 45, ...chk('dex', dc(9) + (M.boss ? 3 : 0)), disabled: S.from == null });
      return out;
    }
    // exploring
    if (f && f.state === 'hostile') {
      const M = MONSTERS[f.kind];
      add({ id: 'fight', verb: 'fight', label: `Fight the ${M.name.replace(/^the /, '')}`, tag: 'Attack', icon: WEAPONS[H().weapon].sprite });
      if (!M.boss) add({ id: 'sneak', verb: 'sneak', label: 'Creep past in the shadows', icon: 103, ...chk('dex', M.alert + S.floor, C().perks && C().perks.sneak) });
      if (M.talk) add({ id: 'parley', verb: 'parley', label: M.boss ? 'Speak to the King' : `Talk your way past the ${M.name}`, icon: 86, ...chk('cha', dc(11)) });
      if (S.from != null) add({ id: 'back', verb: 'back', label: `Back away to ${S.map.rooms[S.from].name}`, icon: 45, ...chk('dex', dc(7)) });
      for (const b of H().bag) if (ITEMS[b.id].use === 'heal' && H().hp < H().maxHp) add({ id: 'use:' + b.id, verb: 'use', label: `Drink a ${ITEMS[b.id].name.toLowerCase()} first`, tag: `×${b.n}`, icon: ITEMS[b.id].sprite, group: 'item' });
      return out;
    }
    if (f && f.state === 'passed') add({ id: 'ambush', verb: 'ambush', label: `Ambush the sleeping ${MONSTERS[f.kind].name}`, tag: 'Attack · advantage', icon: 103 });
    const calm = !f || f.state !== 'passed';
    if (calm && (rm.gold || rm.item)) add({ id: 'take', verb: 'take', label: 'Gather up what is lying here', tag: rm.gold ? `${rm.gold} gold` : 'Loot', icon: 89 });
    if (calm && F && F.state === 'new') {
      const k = F.kind;
      if (k === 'chest') {
        add({ id: 'open', verb: 'open', label: 'Open the chest', tag: 'Loot', icon: 89 });
        if (!F.searched) add({ id: 'search', verb: 'search', label: 'Check the chest for traps', icon: 41, ...chk('wis', dc(10), C().perks && C().perks.traps) });
      }
      if (k === 'altar') {
        add({ id: 'pray', verb: 'pray', label: 'Kneel and pray at the altar', icon: 65, ...chk('wis', dc(10)) });
        add({ id: 'offer', verb: 'offer', label: 'Leave an offering of gold', tag: `${offerCost()} gold`, icon: 65, disabled: H().gold < offerCost() });
      }
      if (k === 'fountain') add({ id: 'drink', verb: 'drink', label: 'Drink from the fountain', tag: 'Who knows?', icon: 20 });
      if (k === 'corpse') add({ id: 'search', verb: 'search', label: 'Search the body', tag: 'Loot', icon: 0 });
      if (k === 'shelf') add({ id: 'read', verb: 'read', label: 'Read the old books', icon: 63, ...chk('int', dc(10)) });
      if (k === 'statue') add({ id: 'inspect', verb: 'inspect', label: 'Look closely at the statue', icon: 7, ...chk('int', dc(11)) });
      if (k === 'camp') add({ id: 'rest', verb: 'rest', label: 'Rest by the old fire', tag: 'Heal · risky', icon: 29 });
    }
    if (calm && F && F.kind === 'merchant') add({ id: 'trade', verb: 'trade', label: 'Trade with the pedlar', tag: `${H().gold} gold`, icon: 85 });
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
    if (!S.rested && !rm.start && (!f || f.state !== 'passed') && (H().hp < H().maxHp || H().pool < poolMax()) && !(F && F.kind === 'camp' && F.state === 'new'))
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
    if (other.foe && other.foe.state === 'hostile' && MONSTERS[other.foe.kind].signs.length) { const s = MONSTERS[other.foe.kind].signs; return s[i % s.length]; }
    if (other.stairs) return 'a cold draught rising from below';
    if (other.feature && other.feature.state === 'new') { const s = FEATURES[other.feature.kind].signs; return s[i % s.length]; }
    return null;
  }

  // ---------- the verbs ----------
  function act(id) {
    const c = choices().find((x) => x.id === id);
    if (!c || c.disabled) return { ok: false, id, events: [] };
    events = [];
    const [verb, arg] = id.split(':');
    const rm = S.map ? room() : null, F = rm && rm.feature;
    switch (verb) {
      case 'class': begin(arg); break;
      case 'new': S = fresh((rnd() * 2 ** 32) >>> 0, S.record); ev('new', { seed: S.seed }); break;
      case 'boost': H().stats[arg]++; H().boosts--; if (arg === 'con') { H().maxHp++; H().hp++; } ev('boost', { stat: arg, to: H().stats[arg] }); break;
      case 'go': enter(rm.exits[arg]); break;
      case 'descend': descend(); break;
      case 'fight': startFight(); break;
      case 'ambush': startFight('ambush'); break;
      case 'sneak':
        if (check('dex', c.check.dc, c.check.adv, 'sneak')) { rm.foe.state = 'passed'; ev('sneaked', { foe: rm.foe.kind }); gainXp(Math.floor(MONSTERS[rm.foe.kind].xp / 2)); }
        else { ev('spotted', { foe: rm.foe.kind }); startFight('spotted'); foeTurn(); if (S.fight) S.fight.round++; }
        break;
      case 'parley': {
        const M = MONSTERS[rm.foe.kind];
        if (check('cha', c.check.dc, false, 'parley')) {
          const toll = M.toll * S.floor;
          if (H().gold >= toll && rnd() < 0.5) { H().gold -= toll; ev('toll', { foe: rm.foe.kind, n: toll }); }
          rm.foe.state = 'calm'; ev('calmed', { foe: rm.foe.kind });
          gainXp(Math.floor(M.xp / 2));
        } else { ev('insulted', { foe: rm.foe.kind }); startFight('insulted'); foeTurn(); if (S.fight) S.fight.round++; }
        break;
      }
      case 'back':
        if (!check('dex', c.check.dc, false, 'retreat')) { S.mode = 'fight'; S.fight = { round: 1, ward: 0, riposte: 0 }; foeTurn(); if (S.mode === 'fight') { S.mode = 'explore'; S.fight = null; } }
        if (S.mode !== 'dead') enter(S.from, 'retreat');
        break;
      case 'attack': weaponHit(null); endRound(); break;
      case 'skill': {
        const K = SKILLS[arg];
        useSkill(arg);
        if (S.mode === 'fight' && K.kind !== 'escape') endRound();
        break;
      }
      case 'use': useItem(arg); if (S.mode === 'fight') endRound(); else if (rm.foe && rm.foe.state === 'hostile' && ITEMS[arg].use === 'heal') { /* drinking under its nose is free once */ } break;
      case 'dodge':
        if (check('dex', c.check.dc, c.check.adv, 'dodge')) { S.fight.riposte = 2; ev('dodged', { foe: foe().kind }); S.fight.round++; }
        else { foeTurn(2); if (S.fight) S.fight.round++; }
        break;
      case 'flee':
        if (check('dex', c.check.dc, false, 'flee')) { S.mode = 'explore'; S.fight = null; ev('escape', { how: 'flee' }); enter(S.from, 'flee'); }
        else { ev('cornered', { foe: foe().kind }); foeTurn(2); if (S.fight) S.fight.round++; }
        break;
      case 'take':
        gold(rm.gold, 'floor'); rm.gold = 0;
        if (rm.item) { giveItem(rm.item); rm.item = null; }
        break;
      case 'open':
        if (F.mimic) {
          F.state = 'used'; rm.foe = makeFoe(rnd, 'mimic', S.floor);
          ev('mimic', {}); startFight('mimic'); foeTurn(); if (S.fight) S.fight.round++;
          break;
        }
        if (F.trapped && !F.disarmed) {
          ev('trap', {});
          const n = roll(rnd, '2d6') + S.floor;
          hurt(check('dex', dc(11), C().perks && C().perks.traps, 'trap') ? Math.ceil(n / 2) : n, 'trap');
          if (S.mode === 'dead') break;
        }
        F.state = 'used'; ev('opened', {});
        gold(F.gold, 'chest');
        if (F.item) giveItem(F.item);
        if (F.weapon) giveWeapon(F.weapon);
        break;
      case 'search':
        if (F.kind === 'corpse') {
          F.state = 'used'; ev('searched', { kind: 'corpse' });
          if (F.grubs) { ev('grubs', {}); hurt(roll(rnd, '1d4') + S.floor - 1, 'grubs'); if (S.mode === 'dead') break; }
          gold(F.gold, 'body'); if (F.item) giveItem(F.item);
          break;
        }
        F.searched = true;
        if (check('wis', c.check.dc, c.check.adv, 'search')) {
          if (F.mimic) { F.state = 'used'; rm.foe = makeFoe(rnd, 'mimic', S.floor); ev('mimicFound', {}); }
          else if (F.trapped) { F.disarmed = true; ev('disarmed', {}); }
          else ev('safe', {});
        } else ev('nothingFound', {});
        break;
      case 'pray':
        F.state = 'used';
        if (check('wis', c.check.dc, false, 'pray')) { H().bless = 1; ev('blessed', {}); heal(roll(rnd, '1d6') + S.floor, 'altar'); }
        else ev('silence', {});
        break;
      case 'offer': F.state = 'used'; H().gold -= offerCost(); ev('offered', { n: offerCost() }); H().bless = 1; ev('blessed', {}); heal(roll(rnd, '2d6') + S.floor, 'altar'); break;
      case 'drink': {
        F.state = 'used'; const x = rnd();
        ev('drank', {});
        if (x < 0.35) heal(H().maxHp, 'fountain');
        else if (x < 0.55) { H().maxHp += 2; H().hp += 2; ev('hardier', { n: 2 }); }
        else if (x < 0.7) { H().pool = poolMax(); ev('pool', { n: poolMax(), pool: H().pool }); }
        else if (x < 0.9) { if (!check('con', dc(10), false, 'poison')) { H().poison = POISON_MOVES; ev('poisoned', { foe: 'fountain' }); } else ev('retch', {}); }
        else ev('plain', {});
        break;
      }
      case 'read':
        F.state = 'used';
        if (check('int', c.check.dc, false, 'read')) {
          if (!S.map.revealed) { S.map.revealed = true; ev('mapped', {}); } else ev('lore', {});
          gainXp(8 * S.floor);
        } else ev('crumbled', {});
        break;
      case 'inspect':
        F.state = 'used';
        if (check('int', c.check.dc, false, 'inspect')) { ev('cache', {}); gold(F.gold, 'statue'); giveItem(F.item); }
        else ev('stone', {});
        break;
      case 'rest':
        F.state = 'used';
        heal(Math.ceil(H().maxHp / 2), 'rest'); H().pool = poolMax(); ev('rested', { pool: H().pool });
        if (rnd() < WANDERER_CHANCE) { rm.foe = makeFoe(rnd, foeKind(rnd, S.floor), S.floor); ev('wanderer', { foe: rm.foe.kind }); }
        break;
      case 'camp':
        S.rested = true;
        heal(Math.ceil(H().maxHp * SHORT_REST), 'rest'); H().pool = Math.min(poolMax(), H().pool + Math.ceil(poolMax() / 2)); ev('rested', { pool: H().pool, short: true });
        if (rnd() < SHORT_RISK) { rm.foe = makeFoe(rnd, foeKind(rnd, S.floor), S.floor); ev('wanderer', { foe: rm.foe.kind }); }
        break;
      case 'trade': S.mode = 'shop'; ev('shop', {}); break;
      case 'buy': H().gold -= priceOf(arg); ev('bought', { item: arg, n: priceOf(arg) }); giveItem(arg); F.stock.splice(F.stock.indexOf(arg), 1); break;
      case 'leave': S.mode = 'explore'; ev('leftShop', {}); break;
    }
    // a blessing lasts until the end of the next fight
    if (S.mode === 'explore' && H() && H().bless && events.some((e) => e.t === 'kill' || e.t === 'escape')) H().bless = 0;
    S.acts++;
    S.log.push({ id, label: c.label, events: events.map((e) => e.t) }); while (S.log.length > MAX_LOG) S.log.shift();
    ev('save', {});
    return { ok: true, id, choice: c, events };
  }

  function begin(cls) {
    const K = CLASSES[cls];
    const hp = K.hitDie + 2 * mod(K.stats.con) + START_HP + (K.hpBonus || 0);
    S.hero = { name: S.names[cls], cls, lvl: 1, xp: 0, hp, maxHp: hp, pool: K.poolBase, stats: { ...K.stats }, weapon: K.weapon, armour: 0, gold: 10, bag: K.kit.map(([id, n]) => ({ id, n })), poison: 0, bless: 0, boosts: 0 };
    S.mode = 'explore'; S.floor = 1;
    S.map = makeFloor(S.seed, 1); S.at = 0; S.from = null; S.map.rooms[0].visited = true;
    ev('begin', { cls, name: S.hero.name });
    ev('enter', { room: 0, name: room().name, first: true, how: 'stairs' });
  }

  // ---------- what the storyteller is told ----------
  // Plain facts about where you are and what just happened. Both storytellers (the book in
  // tell.js and a language model in dm.js) are given exactly this and nothing else.
  function facts() {
    const out = { mode: S.mode, floor: S.floor, place: THEMES[S.floor - 1].name, tag: THEMES[S.floor - 1].tag };
    if (!S.hero) return out;
    const h = H();
    out.hero = { name: h.name, cls: C().name, race: C().race, lvl: h.lvl, hp: h.hp, maxHp: h.maxHp, hurt: h.hp / h.maxHp, poisoned: h.poison > 0, blessed: !!h.bless, weapon: WEAPONS[h.weapon].name };
    if (!S.map) return out;
    const rm = room();
    out.room = {
      id: rm.id, name: rm.name, start: rm.start, stairs: !!rm.stairs, throne: !!rm.throne, decor: rm.decor, props: rm.props,
      size: rm.w * rm.h >= 28 ? 'large' : rm.w * rm.h <= 15 ? 'small' : 'middling',
      foe: rm.foe ? { kind: rm.foe.kind, name: MONSTERS[rm.foe.kind].name, state: rm.foe.state, hurt: rm.foe.hp / rm.foe.maxHp, undead: !!MONSTERS[rm.foe.kind].undead, boss: !!MONSTERS[rm.foe.kind].boss } : null,
      feature: rm.feature ? { kind: rm.feature.kind, state: rm.feature.state, searched: !!rm.feature.searched } : null,
      loot: !!(rm.gold || rm.item),
      exits: Object.keys(rm.exits).map((d) => { const o = S.map.rooms[rm.exits[d]]; return { dir: d, way: DIR_NAME[d], visited: o.visited, name: o.visited ? o.name : null, clue: clueFor(rm, d) }; }),
    };
    if (S.mode === 'fight') out.fight = { round: S.fight.round };
    return out;
  }

  return {
    get S() { return S; }, choices, act, facts, room: () => (S.map ? room() : null),
    ac: () => (S.hero ? ac() : 0), poolMax: () => (S.hero ? poolMax() : 0), prof: () => (S.hero ? prof() : 0),
    xpFor: (lvl) => XP_AT[lvl], note(page) { S.page = page; },
    newRun(seed) { S = fresh(seed, S.record); return S; },
  };
}
