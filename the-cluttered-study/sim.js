/* The Cluttered Study: the rules. A wizard's study after the cat has been through it:
   ninety things strewn over the floor, the desk and the shelves, never more than three
   deep anywhere. The owl sets a riddle ("I spy something that keeps time, but has no
   hands"); a tap on a thing that is not it pings the detector, which beeps hotter the
   nearer the tap is. A thing can lie under others, so moving things aside is part of
   searching. Anything can be dragged anywhere, and put away wherever the player likes: let
   go of it over a shelf, the sill or the desk and it stands there; nothing has a slot.
   Nothing is timed and nothing is lost.

   The other way round, you pick a thing and describe it, and the owl guesses from the
   words (guess()).

   No page access in here: dice come in as `rnd` and the seed, time as step(dt), and what
   the page should react to goes out through on(event, data). */

import { THINGS, SYNONYMS, LOOKS } from './content.js';
import { streamFor, shuffle, pick, hashString } from '../lib/rng.js';

// ---------- constants ----------
export const W = 1200, H = 760;
export const FLOOR = { y0: 630, y1: 742 };           // where a thing's foot can rest on the floor
export const CASE_L = { x0: 22, x1: 292 }, CASE_R = { x0: 908, x1: 1178 };
export const CASE_TOP = 100;                          // the top of both bookcases
export const PLANKS = [214, 326, 438, 550];           // shelf tops, top to bottom
export const INSET = 12;                              // bookcase side boards
export const LEDGE = { x0: 452, x1: 748, y: 318 };    // the window sill
export const DESK = { x0: 334, x1: 640, y: 522 };
export const CAULDRON = { x: 790, y: 690, r: 92 };
export const WALL = { x0: 744, x1: 900, ys: [262, 392] };   // the little shelves above the cauldron
export const HUNT = 8;              // riddles per mess
export const CHARGE = 5;            // detector pings held
export const RECHARGE = 1.8;        // seconds per ping refilled
export const DEPTH = 3;             // the most things the mess ever has on top of each other
const CELL = 8;                     // the grid the mess counts depth on
const ZONES = [['floor', 0.74], ['shelf', 0.17], ['desk', 0.09]];
const HEAT = [[55, 'here'], [120, 'hot'], [220, 'warm'], [360, 'cool'], [Infinity, 'cold']];

export const KINDS = THINGS.map((t) => t.kind);
export const THING = Object.fromEntries(THINGS.map((t) => [t.kind, t]));
export { THINGS };
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ---------- the room ----------
// The surfaces a thing can stand on, besides the floor.
export const SURFACES = [
  ...[CASE_L, CASE_R].flatMap((c) => [
    { x0: c.x0 + 6, x1: c.x1 - 6, y: CASE_TOP, top: true },
    ...PLANKS.map((y) => ({ x0: c.x0 + INSET, x1: c.x1 - INSET, y })),
  ]),
  { x0: LEDGE.x0 + 4, x1: LEDGE.x1 - 4, y: LEDGE.y },
  ...WALL.ys.map((y) => ({ x0: WALL.x0 + 2, x1: WALL.x1 - 2, y })),
  { x0: DESK.x0, x1: DESK.x1, y: DESK.y, desk: true },
];
export const onFloor = (it) => it.y >= FLOOR.y0 - 1;

// The cauldron stands on the floor: a thing put down behind it comes round to the front.
function offCauldron(x, y, w) {
  return Math.abs(x - CAULDRON.x) < CAULDRON.r + w / 2 - 6 && y < CAULDRON.y + 44 ? Math.min(FLOOR.y1, CAULDRON.y + 46) : y;
}

// Where a thing's middle is, standing at (x, y) by its foot and leaning by rot.
export function centre(it) {
  const t = THING[it.kind];
  return { x: it.x + Math.sin(it.rot) * t.h / 2, y: it.y - Math.cos(it.rot) * t.h / 2 };
}

// Is the point on the thing? (Its box, a little inside the corners, turned with it.)
export function contains(it, px, py, pad = 0) {
  const t = THING[it.kind];
  const dx = px - it.x, dy = py - it.y, c = Math.cos(it.rot), s = Math.sin(it.rot);
  const lx = dx * c + dy * s, ly = -dx * s + dy * c;
  return Math.abs(lx) <= t.w * 0.46 + pad && ly >= -t.h * 0.96 - pad && ly <= pad + 2;
}

// The grid cells a thing covers, as indices into a W/CELL x H/CELL grid.
const GW = Math.ceil(W / CELL), GH = Math.ceil(H / CELL);
export function cellsOf(it) {
  const t = THING[it.kind], m = centre(it), r = Math.hypot(t.w, t.h) / 2 + 2;
  const out = [];
  for (let gy = Math.max(0, Math.floor((m.y - r) / CELL)); gy <= Math.min(GH - 1, Math.floor((m.y + r) / CELL)); gy++)
    for (let gx = Math.max(0, Math.floor((m.x - r) / CELL)); gx <= Math.min(GW - 1, Math.floor((m.x + r) / CELL)); gx++)
      if (contains(it, gx * CELL + CELL / 2, gy * CELL + CELL / 2)) out.push(gy * GW + gx);
  return out;
}
// How many things lie at the deepest point of a layout.
export function deepest(items) {
  const grid = new Uint8Array(GW * GH);
  let most = 0;
  for (const it of items) for (const c of cellsOf(it)) most = Math.max(most, ++grid[c]);
  return most;
}

// ---------- the mess ----------
/* The cat's work, from the seed alone. Every thing lands somewhere at random (most on the
   floor, some on the shelves, some on the desk), tipped a little, but never where it would
   make a spot more than three things deep: a thing can be half under another, or under
   two, and no deeper. */
export function scatter(seed) {
  const r = streamFor(seed, 'mess');
  const grid = new Uint8Array(GW * GH);
  const shelves = SURFACES.filter((s) => !s.top && !s.desk);
  const desk = SURFACES.find((s) => s.desk);
  const spot = (t, zone) => {
    const it = { kind: t.kind, x: 0, y: 0, rot: 0 };
    if (zone === 'floor') {
      it.x = t.w / 2 + 8 + r() * (W - t.w - 16);
      it.y = offCauldron(it.x, FLOOR.y0 + r() * (FLOOR.y1 - FLOOR.y0), t.w);
      it.rot = (r() - 0.5) * 0.9;
    } else {
      const s = zone === 'desk' ? desk : pick(r, shelves);
      it.x = s.x0 + t.w / 2 + 2 + r() * Math.max(0, s.x1 - s.x0 - t.w - 4);
      it.y = s.y; it.rot = (r() - 0.5) * (zone === 'desk' ? 0.35 : 0.15);
    }
    return it;
  };
  const out = [];
  for (const idx of shuffle(r, THINGS.map((_, i) => i))) {
    const t = THINGS[idx];
    let best = null, bestDepth = Infinity, bestCells = null;
    for (let tries = 0; tries < 80 && bestDepth >= DEPTH; tries++) {
      const u = r();
      let zone = ZONES[ZONES.length - 1][0];
      for (let a = 0, i = 0; i < ZONES.length; i++) { a += ZONES[i][1]; if (u < a) { zone = ZONES[i][0]; break; } }
      const it = spot(t, zone), cells = cellsOf(it);
      let d = 0;
      for (const c of cells) d = Math.max(d, grid[c]);
      if (d < bestDepth) { best = it; bestDepth = d; bestCells = cells; }
    }
    for (const c of bestCells) grid[c]++;
    best.k = onFloor(best) ? best.y + (r() - 0.5) * 40 : -1000 + out.length;
    out.push(best);
  }
  out.sort((a, b) => a.k - b.k);
  return out.map(({ k, ...it }) => it);
}

// ---------- the owl's ears ----------
const STOP = new Set('i spy something thing a an the it its it’s is that this with and of to in on for you your can be has have very little bit kind sort one which who what when where are was like look looks looking at as or but not no by from into thats'.split(' '));
const stem = (w) => {
  w = w.replace(/['’]s$/, '');
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
};
export function words(text) {
  return String(text || '').toLowerCase().replace(/[^a-z’' -]/g, ' ').split(/[\s-]+/).filter((w) => w && !STOP.has(w)).map(stem);
}
// Words that say what a thing wants rather than what it is ("loves food", "eats flies"),
// unless it is the speaker who wants ("you'd like to eat") or it is a likeness ("looks
// like a duck"). The want lasts to the end of the clause. So does a "no": in "keeps time
// but has no hands", hands count against a thing.
const WANTS = new Set('love loves like likes want wants enjoy enjoys adore adores eats chases chase hunts craves needs'.split(' '));
const NOT_WANT = new Set('you i we d would could look looks looked sound sounds feel feels smell smells shaped'.split(' '));
const CLAUSE = new Set(['and', 'but', 'or', ',']);
const NO = new Set(['no', 'not', 'without', 'never', 'isn', 'doesn', 'nothing', 'nor']);
export function parse(text) {
  const raw = String(text || '').toLowerCase().replace(/[,.;!?]/g, ' , ').replace(/[^a-z, -]/g, ' ').split(/[\s-]+/).filter(Boolean);
  const out = [];
  let want = false, not = false;
  raw.forEach((w, i) => {
    if (CLAUSE.has(w)) { want = false; not = false; return; }
    if (NO.has(w)) { not = true; return; }
    if (WANTS.has(w) && !NOT_WANT.has(raw[i - 1]) && !NOT_WANT.has(raw[i - 2])) { want = true; return; }
    if (not && (w === 'stop' || w === 'stops')) { not = false; return; }   // "will not stop bubbling"
    if (STOP.has(w) || WANTS.has(w)) return;
    out.push({ w: stem(w), want, not });
  });
  return out;
}
/* Each thing's vocabulary. What it is: its name (worth most), its tags, the tags' everyday
   words, and a little less for what it looks like (the rubber duck's "duck", "quack").
   What it wants: its lookalike's likes, or a creature's own. */
const IS = {}, WANTED = {};
for (const t of THINGS) {
  const v = new Map(), l = new Map(), look = LOOKS[t.kind] || {};
  const add = (m, w, n) => { const s = stem(w); m.set(s, Math.max(m.get(s) || 0, n)); };
  for (const w of words(t.name)) add(v, w, 3);
  for (const tag of t.tags) { add(v, tag, 2); for (const s of SYNONYMS[tag] || []) add(v, s, 1); }
  if (look.as) for (const w of words(look.as)) add(v, w, 2);
  for (const tag of look.tags || []) { add(v, tag, 1.5); for (const s of SYNONYMS[tag] || []) add(v, s, 1); }
  for (const like of look.likes || []) { add(l, like, 2.5); for (const s of SYNONYMS[like] || []) add(l, s, 1.5); }
  IS[t.kind] = v; WANTED[t.kind] = l;
}
// The owl's guesses for a description, best first: [{ kind, score }]. Every word in the
// description that a thing answers to adds to its score; a word after "loves" counts only
// against what the thing wants. Ties fall in an order the description picks, so a vague
// clue does not always get the same three guesses.
export function guess(text, among = KINDS) {
  const seen = new Set();
  const ws = parse(text).filter((p) => { const k = p.w + p.want + p.not; if (seen.has(k)) return false; seen.add(k); return true; });
  const tie = (kind) => hashString(text + '|' + kind);
  return among.map((kind) => {
    let score = 0;
    for (const { w, want, not } of ws) score += ((want ? WANTED[kind] : IS[kind]).get(w) || 0) * (not ? -1 : 1);
    return { kind, score };
  }).filter((g) => g.score > 0).sort((a, b) => b.score - a.score || tie(a.kind) - tie(b.kind));
}

// ---------- the study ----------
export function createStudy({ saved, seed = 1, on = () => {} } = {}) {
  const fresh = (sd) => ({
    v: 2, seed: sd >>> 0, mess: 1, items: scatter(sd),
    hunt: { done: [], cur: null }, charge: CHARGE, stars: 0, found: 0, owl: { owl: 0, you: 0 },
  });
  const ok = saved && saved.v === 2 && Array.isArray(saved.items) && saved.items.length === THINGS.length &&
    saved.items.every((it) => THING[it.kind]) && new Set(saved.items.map((it) => it.kind)).size === THINGS.length;
  const S = ok ? saved : fresh(seed);

  const byKind = (kind) => S.items.find((it) => it.kind === kind);
  const putAway = () => S.items.filter((it) => !onFloor(it)).length;

  // The thing on top at a point (the last drawn), or null.
  function topAt(x, y, pad = 0) {
    for (let i = S.items.length - 1; i >= 0; i--) if (contains(S.items[i], x, y, pad)) return S.items[i];
    return null;
  }

  function next() {
    const H = S.hunt;
    if (H.cur || H.done.length >= HUNT) return H.cur;
    const asked = new Set(H.done.map((d) => d.kind));
    const all = THINGS.filter((t) => t.clue && !asked.has(t.kind));
    const r = streamFor(S.seed, `clue${S.mess}-${H.done.length}`);
    const t = pick(r, all);
    H.cur = { kind: t.kind, hints: 0, pings: 0, glow: null };
    on('clue', { kind: t.kind, clue: t.clue, n: H.done.length + 1 });
    return H.cur;
  }

  function hint() {
    const c = S.hunt.cur;
    if (!c || c.hints >= 3) return c;
    c.hints++;
    if (c.hints >= 2) {
      const r = streamFor(S.seed, `glow${S.mess}-${S.hunt.done.length}-${c.hints}`);
      const rad = c.hints === 2 ? 170 : 75, a = r() * Math.PI * 2, m = r() * rad * 0.55;
      c.glow = { dx: Math.cos(a) * m, dy: Math.sin(a) * m, r: rad };
    }
    on('hint', { level: c.hints, text: THING[c.kind].hint });
    return c;
  }

  // A tap on the room. On the riddle's answer it is found; anywhere else it pings.
  function ping(x, y) {
    const c = S.hunt.cur;
    if (!c) return { result: 'none' };
    const T = byKind(c.kind), top = topAt(x, y);
    if (top === T || (!top && contains(T, x, y, 10))) {
      const stars = c.hints === 0 ? 3 : c.hints === 1 ? 2 : 1;
      S.hunt.done.push({ kind: c.kind, stars, pings: c.pings });
      S.hunt.cur = null; S.stars += stars; S.found++;
      on('found', { kind: c.kind, stars, n: S.hunt.done.length, last: S.hunt.done.length >= HUNT });
      if (S.hunt.done.length >= HUNT) on('hunt-done', { stars: S.hunt.done.reduce((a, d) => a + d.stars, 0) });
      return { result: 'found', kind: c.kind, stars };
    }
    if (contains(T, x, y, 8)) { on('under', { x, y }); return { result: 'under' }; }
    if (S.charge < 1) { on('resting', { x, y }); return { result: 'resting' }; }
    S.charge -= 1; c.pings++;
    const m = centre(T), d = Math.hypot(x - m.x, y - m.y);
    const level = HEAT.find(([r]) => d < r)[1];
    const heat = clamp(1 - d / 520, 0, 1);
    on('ping', { x, y, d, level, heat });
    return { result: 'heat', level, heat, d };
  }

  // ---- moving things ----
  function lift(it) {
    const i = S.items.indexOf(it);
    if (i < 0) return null;
    S.items.splice(i, 1); S.items.push(it);
    it.rot = 0;
    on('lift', { kind: it.kind });
    return it;
  }
  function hold(it, x, y) { it.x = clamp(x, 0, W); it.y = clamp(y, 0, H); }
  // Where a thing let go of at (x, y) comes to rest: straight down onto the first shelf,
  // sill or desk under it, or the floor. `on` says which.
  function restFor(kind, x, y) {
    const t = THING[kind];
    x = clamp(x, t.w / 2 + 4, W - t.w / 2 - 4);
    if (y >= FLOOR.y0) return { x, y: offCauldron(x, Math.min(y, FLOOR.y1), t.w), on: null };
    let best = null;
    for (const s of SURFACES) if (x >= s.x0 + 2 && x <= s.x1 - 2 && s.y >= y - 16 && (!best || s.y < best.y)) best = s;
    if (!best) return { x, y: offCauldron(x, FLOOR.y0 + 6, t.w), on: null };
    // keep it on the shelf it landed on
    x = clamp(x, Math.min(best.x0 + t.w / 2, (best.x0 + best.x1) / 2), Math.max(best.x1 - t.w / 2, (best.x0 + best.x1) / 2));
    return { x, y: best.y, on: best };
  }
  function drop(it, x, y) {
    const from = { x: it.x, y: it.y }, wasFloor = onFloor(it), before = putAway() - (wasFloor ? 0 : 1);
    const r = restFor(it.kind, x, y);
    it.x = r.x; it.y = r.y; it.rot = 0;
    const away = !!r.on;
    on('drop', { kind: it.kind, from, away });
    if (away) {
      const n = before + 1;
      on('put', { kind: it.kind, n, of: THINGS.length, desk: !!r.on.desk });
      if (n === THINGS.length && wasFloor) on('spotless', {});
    }
    return it;
  }

  function newMess(sd) {
    const owl = S.owl, stars = S.stars, found = S.found, mess = S.mess;
    Object.assign(S, fresh(sd), { owl, stars, found, mess: mess + 1 });
    on('mess', { seed: S.seed });
    return S;
  }

  function step(dt) { if (S.charge < CHARGE) S.charge = Math.min(CHARGE, S.charge + dt / RECHARGE); }

  // The owl's turn: the result of one round of "you spy".
  function spyRound(owlGotIt) { if (owlGotIt) S.owl.owl++; else S.owl.you++; on('spy', { owlGotIt }); }

  return {
    S, step, next, hint, ping, lift, hold, drop, restFor, newMess, topAt, byKind, putAway, spyRound,
    guess: (text, among) => guess(text, among),
    get cur() { return S.hunt.cur; },
    get target() { return S.hunt.cur ? byKind(S.hunt.cur.kind) : null; },
  };
}
