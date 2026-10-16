/* Marble Run: the rules, with no page in sight.

   A level is an upright pegboard of square cells. The marble rolls in the plane of the
   board (x to the right, y up, one cell = 1), so the physics is two-dimensional even
   though the page draws it in 3D: a circle under gravity against the rails of every
   piece, each rail a capsule. The player hangs pieces from the level's box on empty
   cells, then releases the marble; it has to end in the cup. Bells rung on the way and
   using no more pieces than the level's par are the other two stars.

     createRun({ saved, on })      the game: the level in hand, its pieces, the run
     simulate(level, placed)       one release run to its end, for solve.js and the tests

   Everything is fixed-step and dice-free, so the same pieces always give the same run:
   that is what lets the solver prove every level, and what makes a run worth repeating. */

import { LEVELS } from './levels.js';
export { LEVELS };

// ---------- constants ----------
export const R = 0.14;            // the marble's radius, in cells
export const T = 0.035;           // half the thickness of a rail
export const DT = 1 / 60;         // one step; the page and the tests both use it
const G = 12;                     // gravity, cells/s/s
const SUB = 8;                    // physics substeps per step
const BOUNCE = 0.3;               // what a hard landing on wood gives back
const BOUNCE_MIN = 0.9;           // slower than this into a rail and the marble just lands
const LAND_SCUFF = 0.04, LAND_KEEP = 0.75;  // a hard landing keeps 1 - 0.04 per cell/s of its speed along, at least 75%
const ROLL_DRAG = 0.08, ROLL_DRAG2 = 0.14;  // while it rolls: per second, and per second per cell/s,
                                  // so a long gentle rail keeps rolling and a steep one does not fly
export const FRAME = 0.35;        // the frame's inside edge stands this far out from the cells
const AIR_DRAG = 0.01;
const MAX_V = 9;
const SPRING_V = 6.4;             // a spring sends a marble off at least this fast
const STALL_V = 0.12, STALL_T = 1.5;
const RUN_LIMIT = 45;             // seconds before a run is called off
const MARBLE_GAP = 1.8;           // seconds between marbles on a level with more than one
const FAIL_HOLD = 1.4;            // seconds a failed run stays on screen before the board resets
const SAVE_VERSION = 1;

// ---------- pieces ----------
// Each piece is a few polylines in its own cell (0..1 both ways, y up), drawn facing
// right; `flip` mirrors it. A piece the player can place is in the level's box; the
// letter is how a level map writes one fixed in place (upper case is flipped).
const P = (...pts) => pts;
export const PIECES = {
  slope: {
    name: 'Slope', letter: 's',
    tip: 'A gentle ramp. The marble rolls off its low end and drops. Slopes side by side facing the same way join into one long rail, and one next to the hopper carries on from its ledge, so they tilt to meet.',
    lines: () => [P([0, 0.72], [1, 0.32])],
  },
  steep: {
    name: 'Steep', letter: 'e',
    tip: 'Drops nearly a whole cell, so the marble leaves it fast.',
    lines: () => [P([0, 0.92], [1, 0.1])],
  },
  turn: {
    name: 'Turn', letter: 't',
    tip: 'A wall with a hook at its foot: catches a marble and drops it into the cell below, heading back the other way.',
    lines: () => [P([0.9, 0.97], [0.9, 0.42], [0.86, 0.26], [0.77, 0.15], [0.64, 0.09], [0.42, 0.0])],
  },
  funnel: {
    name: 'Funnel', letter: 'f', sym: true,
    tip: 'Catches anything falling across its mouth and drops it straight down the middle.',
    lines: () => [P([0.02, 0.98], [0.29, 0.46], [0.29, 0.02]), P([0.98, 0.98], [0.71, 0.46], [0.71, 0.02])],
  },
  stop: {
    name: 'Stop', letter: 'w',
    tip: 'A post. A marble flying into it drops straight down.',
    lines: () => [P([0.86, 0.96], [0.86, 0.06])],
  },
  jump: {
    name: 'Jump', letter: 'j',
    tip: 'A ramp with a kick at the end that throws the marble up and across a gap.',
    lines: () => [P([0, 0.66], [0.42, 0.36], [0.64, 0.3], [0.84, 0.38], [0.97, 0.56])],
  },
  spring: {
    name: 'Spring', letter: 'p', spring: true,
    tip: 'A rubber pad on a spring. Anything that lands on it is thrown up and away.',
    lines: () => [P([0.12, 0.5], [0.86, 0.16])],
  },
  toggle: {
    name: 'Toggle', letter: 'g', sym: false,
    tip: 'A flap that tips each marble the way it leans, then swings over for the next.',
    lines: (state) => [state ? P([0.3, 0.72], [0.92, 0.22]) : P([0.7, 0.72], [0.08, 0.22])],
  },
};
const BY_LETTER = {};
for (const [kind, p] of Object.entries(PIECES)) BY_LETTER[p.letter] = kind;

// The fittings a level map can hold besides pieces. Lines in the same cell space.
export const FITTINGS = {
  start: () => [P([0.12, 0.97], [0.12, 0.7], [0.22, 0.64], [1, 0.5])],
  cup: () => [P([0.12, 0.8], [0.17, 0.1], [0.83, 0.1], [0.88, 0.8])],
  lid: () => [P([0.12, 0.8], [0.88, 0.8])],
  block: () => [P([0.05, 0.05], [0.95, 0.05], [0.95, 0.95], [0.05, 0.95], [0.05, 0.05])],
};
const START_AT = [0.32, 0.86];             // where a marble is set down in the hopper
const SLOPE_HI = 0.72, SLOPE_DROP = 0.4;   // a slope on its own: 0.72 down to 0.32
const RAIL_TOP = 0.85, RAIL_LOW = 0.08;    // where a rail of two or more cells starts and ends
const HOPPER_LIP = 0.5;                    // the height the hopper's ledge ends at
const CUP_IN = [0.19, 0.81, 0.1, 0.66];    // x0, x1, y0, y1: a marble in here is home

const mirror = (lines, flip) => (flip ? lines.map((l) => l.map(([x, y]) => [1 - x, y])) : lines);
export function pieceLines(kind, flip, state = 0) { return mirror(PIECES[kind].lines(state), flip); }

// ---------- levels ----------
/* A level map is a list of rows, top row first, one character per cell:
     .  empty, a piece can go here        x  empty, but nothing can be hung here
     >  the start, rolling right          <  the start, rolling left
     U  a cup                             b  a bell
     #  a block of wood
     a piece's letter, fixed in place (s slope, e steep, t turn, f funnel, w stop,
     j jump, p spring, g toggle); upper case faces left.
   `give` is the box of pieces to place, `par` the fewest the solver needed for all
   three stars, and `solution` one way to get them (solve.js finds them; the hint uses it). */
export function parseLevel(def) {
  const h = def.map.length, w = def.map[0].length;
  const L = {
    id: def.id, name: def.name, note: def.note || '', w, h,
    cells: new Array(w * h).fill('empty'), fixed: [], start: null, cups: [], bells: [],
    give: { ...(def.give || {}) }, marbles: def.marbles || 1, par: def.par || 0,
    solution: def.solution || [],
  };
  for (let row = 0; row < h; row++) {
    const line = def.map[row];
    if (line.length !== w) throw new Error(`${def.id}: row ${row} is ${line.length} wide, not ${w}`);
    for (let x = 0; x < w; x++) {
      const ch = line[x], y = h - 1 - row, i = y * w + x;
      if (ch === '.') continue;
      if (ch === 'x') L.cells[i] = 'nope';
      else if (ch === '#') L.cells[i] = 'block';
      else if (ch === '>' || ch === '<') { L.cells[i] = 'start'; L.start = { x, y, flip: ch === '<' }; }
      else if (ch === 'U') { L.cells[i] = 'cup'; L.cups.push({ x, y }); }
      else if (ch === 'b') { L.cells[i] = 'bell'; L.bells.push({ x, y }); }
      else if (BY_LETTER[ch.toLowerCase()]) {
        L.cells[i] = 'fixed';
        L.fixed.push({ kind: BY_LETTER[ch.toLowerCase()], x, y, flip: ch !== ch.toLowerCase(), fixed: true });
      } else throw new Error(`${def.id}: what is '${ch}'?`);
    }
  }
  if (!L.start) throw new Error(`${def.id}: no start`);
  if (L.cups.length < L.marbles) throw new Error(`${def.id}: ${L.marbles} marbles but ${L.cups.length} cups`);
  return L;
}

export const canHang = (L, x, y) => x >= 0 && y >= 0 && x < L.w && y < L.h && L.cells[y * L.w + x] === 'empty';

// ---------- the world: one release ----------
function segsOf(lines, ox, oy, extra) {
  const out = [];
  for (const l of lines) {
    for (let k = 0; k + 1 < l.length; k++) {
      const ax = ox + l[k][0], ay = oy + l[k][1], bx = ox + l[k + 1][0], by = oy + l[k + 1][1];
      const ex = bx - ax, ey = by - ay;
      out.push({ ax, ay, ex, ey, len2: ex * ex + ey * ey || 1e-9, ...extra });
    }
  }
  return out;
}

/* Every piece on the board with the lines it actually has. Slopes side by side in a row,
   facing the same way, join into one long rail, as the rails of a real pegboard run do:
   it falls SLOPE_DROP over its first cell and CHAIN_DROP over each one after, so a long
   rail is gentler than a short one but never flat. A rail that starts at the hopper's
   open end carries on from the hopper's ledge. */
export function layout(L, placed) {
  const all = [...L.fixed, ...placed].map((p) => ({ kind: p.kind, x: p.x, y: p.y, flip: !!p.flip, fixed: !!p.fixed }));
  const get = (x, y) => (x >= 0 && x < L.w ? all.find((q) => q.x === x && q.y === y) : null);
  const joins = (q, p) => q && q.kind === 'slope' && q.flip === p.flip;
  for (const p of all) p.lines = pieceLines(p.kind, p.flip, 0);
  for (const p of all) {
    if (p.kind !== 'slope' || p.chained != null) continue;
    // walk back to the high end of this rail, then along it
    const dir = p.flip ? -1 : 1;
    let head = p;
    while (joins(get(head.x - dir, head.y), p)) head = get(head.x - dir, head.y);
    const run = [];
    for (let c = head; joins(c, p); c = get(c.x + dir, c.y)) run.push(c);
    const S = L.start;
    const fromHopper = S.y === head.y && S.flip === p.flip && S.x === head.x - dir;
    // one slope on its own is 0.72 down to 0.32; a longer rail runs from near the top of
    // its first cell to near the bottom of its last, so the more cells, the gentler
    const n = run.length;
    const top = fromHopper ? HOPPER_LIP : n === 1 ? SLOPE_HI : RAIL_TOP;
    const fall = (fromHopper || n > 1 ? top - RAIL_LOW : SLOPE_DROP) / n;
    run.forEach((c, i) => {
      c.lines = mirror([P([0, top - fall * i], [1, top - fall * (i + 1)])], c.flip);
      c.chained = n > 1 || fromHopper;
    });
  }
  return all;
}

export function makeWorld(L, placed, emit = () => {}) {
  const W = {
    L, w: L.w, h: L.h, t: 0, emit,
    grid: Array.from({ length: L.w * L.h }, () => []),
    pieces: [], marbles: [], spawned: 0, caught: 0, done: null,
    rung: new Set(), full: new Set(), path: [], pathSeen: new Set(), minD: Infinity,
    bellD: L.bells.map(() => Infinity),
  };
  const put = (x, y, segs) => { W.grid[y * L.w + x].push(...segs); };
  for (const piece of layout(L, placed)) {
    piece.state = 0; piece.touched = -1;
    piece.segs = segsOf(piece.lines, piece.x, piece.y, { piece, spring: !!PIECES[piece.kind].spring });
    put(piece.x, piece.y, piece.segs);
    W.pieces.push(piece);
  }
  const S = L.start;
  put(S.x, S.y, segsOf(mirror(FITTINGS.start(), S.flip), S.x, S.y, { mat: 'walnut' }));
  for (const c of L.cups) put(c.x, c.y, segsOf(FITTINGS.cup(), c.x, c.y, { mat: 'brass' }));
  for (let i = 0; i < L.cells.length; i++) {
    if (L.cells[i] === 'block') put(i % L.w, Math.floor(i / L.w), segsOf(FITTINGS.block(), i % L.w, Math.floor(i / L.w), { mat: 'walnut' }));
  }
  return W;
}

function swapToggle(W, piece) {
  const cell = W.grid[piece.y * W.w + piece.x];
  for (const s of piece.segs) cell.splice(cell.indexOf(s), 1);
  piece.state = 1 - piece.state;
  piece.lines = pieceLines(piece.kind, piece.flip, piece.state);
  piece.segs = segsOf(piece.lines, piece.x, piece.y, { piece });
  cell.push(...piece.segs);
}

function spawn(W) {
  const S = W.L.start;
  const lx = S.flip ? 1 - START_AT[0] : START_AT[0];
  W.marbles.push({
    id: W.spawned, x: S.x + lx, y: S.y + START_AT[1], vx: 0, vy: 0, a: 0, w: 0,
    live: true, home: false, contact: false, still: 0, cell: -1,
  });
  W.spawned++;
  W.emit('spawn', { id: W.spawned - 1 });
}

function collide(W, m) {
  const cx = Math.floor(m.x), cy = Math.floor(m.y), rr = R + T;
  for (let gy = cy - 1; gy <= cy + 1; gy++) {
    if (gy < 0 || gy >= W.h) continue;
    for (let gx = cx - 1; gx <= cx + 1; gx++) {
      if (gx < 0 || gx >= W.w) continue;
      const cell = W.grid[gy * W.w + gx];
      for (let k = 0; k < cell.length; k++) {
        const s = cell[k];
        let u = ((m.x - s.ax) * s.ex + (m.y - s.ay) * s.ey) / s.len2;
        u = u < 0 ? 0 : u > 1 ? 1 : u;
        const dx = m.x - (s.ax + s.ex * u), dy = m.y - (s.ay + s.ey * u);
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr || d2 < 1e-14) continue;
        const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
        m.x += nx * (rr - d); m.y += ny * (rr - d);
        const vn = m.vx * nx + m.vy * ny;
        if (vn < 0) {
          const into = -vn;
          let back;
          if (s.spring) { back = Math.max(into * 0.9, SPRING_V); W.emit('spring', { x: m.x, y: m.y, piece: s.piece }); }
          else back = into > BOUNCE_MIN ? into * BOUNCE : 0;
          m.vx += nx * (into + back); m.vy += ny * (into + back);
          if (!s.spring && into > BOUNCE_MIN) {
            // a hard landing scuffs off some of the speed along the rail as well
            const keep = Math.max(LAND_KEEP, 1 - LAND_SCUFF * into);
            const vt = -m.vx * ny + m.vy * nx;
            m.vx -= -ny * vt * (1 - keep); m.vy -= nx * vt * (1 - keep);
          }
          if (into > 0.6 && !s.spring) W.emit('hit', { speed: into, x: m.x, y: m.y, mat: s.piece ? (s.piece.fixed ? 'walnut' : 'beech') : s.mat });
        }
        m.contact = true; m.nx = nx; m.ny = ny;
        if (s.piece && s.piece.kind === 'toggle') s.piece.touched = m.id;
      }
    }
  }
  // the frame is solid all round: a marble that misses ends up rattling along its bottom
  const lo = -FRAME + R, hx = W.w + FRAME - R, hy = W.h + FRAME - R;
  const wall = (nx, ny, d) => {
    m.x += nx * d; m.y += ny * d;
    const into = -(m.vx * nx + m.vy * ny);
    if (into <= 0) return;
    const back = into > BOUNCE_MIN ? into * BOUNCE : 0;
    m.vx += nx * (into + back); m.vy += ny * (into + back);
    if (into > 0.6) W.emit('hit', { speed: into, x: m.x, y: m.y, mat: 'walnut' });
    m.contact = true; m.nx = nx; m.ny = ny;
  };
  if (m.x < lo) wall(1, 0, lo - m.x);
  if (m.x > hx) wall(-1, 0, m.x - hx);
  if (m.y > hy) wall(0, -1, m.y - hy);
  if (m.y < lo) { wall(0, 1, lo - m.y); m.floor = true; }
}

// One marble's move through h seconds: gravity, drag, the rails and the frame.
function roll(W, m, h) {
  m.vy -= G * h;
  const sp0 = Math.hypot(m.vx, m.vy);
  const drag = 1 - (m.contact ? ROLL_DRAG + ROLL_DRAG2 * sp0 : AIR_DRAG) * h;
  m.vx *= drag; m.vy *= drag;
  const sp = Math.hypot(m.vx, m.vy);
  if (sp > MAX_V) { m.vx *= MAX_V / sp; m.vy *= MAX_V / sp; }
  m.x += m.vx * h; m.y += m.vy * h;
  m.contact = false;
  collide(W, m);
  if (m.contact) m.w = (m.nx * m.vy - m.ny * m.vx) / R;
  m.a += m.w * h;
}

export function stepWorld(W, dt) {
  if (W.done) return;
  const h = dt / SUB;
  for (let sub = 0; sub < SUB && !W.done; sub++) {
    W.t += h;
    while (W.spawned < W.L.marbles && W.t >= W.spawned * MARBLE_GAP) spawn(W);
    for (const m of W.marbles) {
      if (!m.live) continue;
      roll(W, m, h);
      sense(W, m, h);
    }
    // marbles knock each other, glass on glass
    for (let i = 0; i < W.marbles.length; i++) {
      const a = W.marbles[i]; if (!a.live) continue;
      for (let j = i + 1; j < W.marbles.length; j++) {
        const b = W.marbles[j]; if (!b.live) continue;
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
        if (d >= 2 * R || d < 1e-9) continue;
        const nx = dx / d, ny = dy / d, push = (2 * R - d) / 2;
        a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
        const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rel < 0) {
          const j2 = -rel * 0.95;
          a.vx -= nx * j2; a.vy -= ny * j2; b.vx += nx * j2; b.vy += ny * j2;
          if (-rel > 0.5) W.emit('clink', { speed: -rel, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
        }
      }
    }
    if (!W.done && W.caught >= W.L.marbles) W.done = 'won';
    if (!W.done && W.t > RUN_LIMIT) W.done = 'time';
  }
}

function sense(W, m, h) {
  const L = W.L;
  if (m.floor) {
    W.done = 'floor'; W.emit('floor', { id: m.id, x: m.x, y: m.y });
    return;
  }
  const cx = Math.floor(m.x), cy = Math.floor(m.y);
  const inside = cx >= 0 && cy >= 0 && cx < W.w && cy < W.h;
  const ci = inside ? cy * W.w + cx : -1;
  if (ci !== m.cell) {
    m.cell = ci;
    if (inside && !W.pathSeen.has(ci)) { W.pathSeen.add(ci); W.path.push(ci); }
  }
  for (const c of L.cups) {
    if (W.full.has(c)) continue;
    const d = Math.hypot(m.x - (c.x + 0.5), m.y - (c.y + 0.35));
    if (d < W.minD) W.minD = d;
  }
  for (let i = 0; i < L.bells.length; i++) {
    const d = Math.hypot(m.x - (L.bells[i].x + 0.5), m.y - (L.bells[i].y + 0.5));
    if (d < W.bellD[i]) W.bellD[i] = d;
  }
  for (let i = 0; i < L.bells.length; i++) {
    // a bell rings as soon as the marble touches its cell
    const b = L.bells[i], bi = b.y * W.w + b.x;
    if (W.rung.has(bi)) continue;
    const dx = Math.max(b.x - m.x, 0, m.x - b.x - 1), dy = Math.max(b.y - m.y, 0, m.y - b.y - 1);
    if (dx * dx + dy * dy < R * R) { W.rung.add(bi); W.emit('bell', { x: b.x, y: b.y, i }); }
  }
  if (inside && L.cells[ci] === 'cup') {
    const c = L.cups.find((q) => q.x === cx && q.y === cy);
    const lx = m.x - cx, ly = m.y - cy;
    if (!W.full.has(c) && lx > CUP_IN[0] && lx < CUP_IN[1] && ly > CUP_IN[2] && ly < CUP_IN[3]) {
      W.full.add(c);
      m.live = false; m.home = true; m.cup = c;
      m.x = cx + 0.5; m.y = cy + 0.1 + T + R; m.vx = m.vy = 0;
      W.caught++;
      W.grid[ci].push(...segsOf(FITTINGS.lid(), cx, cy, { mat: 'brass' }));
      W.emit('cup', { id: m.id, x: cx, y: cy });
      return;
    }
  }
  for (const p of W.pieces) {
    if (p.touched === m.id && (cx !== p.x || cy !== p.y)) {
      p.touched = -1;
      swapToggle(W, p);
      W.emit('toggle', { x: p.x, y: p.y, state: p.state });
    }
  }
  if (Math.hypot(m.vx, m.vy) < STALL_V) {
    m.still += h;
    if (m.still > STALL_T) { W.done = 'stuck'; W.emit('stuck', { id: m.id }); }
  } else m.still = 0;
}

// One release, run to its end. What the solver and the tests look at.
export function simulate(L, placed, { limit = RUN_LIMIT } = {}) {
  const W = makeWorld(L, placed);
  while (!W.done && W.t < limit) stepWorld(W, DT);
  return {
    won: W.done === 'won', end: W.done || 'time', t: W.t, caught: W.caught,
    bells: W.rung.size, bellsAll: W.rung.size === L.bells.length,
    path: W.path, minD: W.minD, bellD: W.bellD.reduce((a, d) => a + Math.min(d, 20), 0),
  };
}

// ---------- the game ----------
export function createRun({ saved = null, on = () => {} } = {}) {
  const data = saved && saved.v === SAVE_VERSION ? saved : { v: SAVE_VERSION, level: 0, reached: 0, levels: {} };
  if (saved && saved !== data) { for (const k of Object.keys(saved)) delete saved[k]; Object.assign(saved, data); }
  const store = saved || data;

  const g = {
    LEVELS, PIECES, store,
    idx: 0, L: null, placed: [], mode: 'build', world: null, result: null, failT: 0,
    get record() { return recordFor(g.L.id); },
  };

  function recordFor(id) {
    if (!store.levels[id]) store.levels[id] = { stars: [false, false, false], layout: [] };
    return store.levels[id];
  }
  const save = () => {
    recordFor(g.L.id).layout = g.placed.map((p) => [p.kind, p.x, p.y, p.flip ? 1 : 0]);
    store.level = g.idx;
    on('save', store);
  };
  const quietWorld = () => { g.world = makeWorld(g.L, g.placed, () => {}); };

  g.load = (i) => {
    i = Math.max(0, Math.min(LEVELS.length - 1, i | 0));
    g.idx = i; g.L = parseLevel(LEVELS[i]);
    g.placed = [];
    for (const [kind, x, y, flip] of recordFor(g.L.id).layout || []) {
      if (PIECES[kind] && canHang(g.L, x, y) && !g.at(x, y) && g.left(kind) > 0) g.placed.push({ kind, x, y, flip: !!flip });
    }
    g.mode = 'build'; g.result = null;
    quietWorld();
    store.level = i;
    on('level', { idx: i, L: g.L });
    on('save', store);
    return g;
  };
  g.unlocked = (i) => i <= store.reached;
  g.left = (kind) => (g.L.give[kind] || 0) - g.placed.filter((p) => p.kind === kind).length;
  g.at = (x, y) => g.placed.find((p) => p.x === x && p.y === y) || null;
  g.fixedAt = (x, y) => g.L.fixed.find((p) => p.x === x && p.y === y) || null;
  g.canPlace = (kind, x, y) => g.mode === 'build' && canHang(g.L, x, y) && !g.at(x, y) && g.left(kind) > 0;

  const edited = () => { quietWorld(); g.result = null; save(); on('edit', {}); };
  g.place = (kind, x, y, flip = false) => {
    if (!g.canPlace(kind, x, y)) return false;
    g.placed.push({ kind, x, y, flip: !!flip });
    edited(); on('place', { kind, x, y });
    return true;
  };
  g.remove = (x, y) => {
    if (g.mode !== 'build') return false;
    const p = g.at(x, y); if (!p) return false;
    g.placed.splice(g.placed.indexOf(p), 1);
    edited(); on('remove', { kind: p.kind, x, y });
    return true;
  };
  g.flip = (x, y) => {
    if (g.mode !== 'build') return false;
    const p = g.at(x, y); if (!p || PIECES[p.kind].sym) return false;
    p.flip = !p.flip;
    edited(); on('flip', { x, y });
    return true;
  };
  g.move = (x0, y0, x1, y1) => {
    if (g.mode !== 'build') return false;
    const p = g.at(x0, y0);
    if (!p || (x0 === x1 && y0 === y1) || !canHang(g.L, x1, y1) || g.at(x1, y1)) return false;
    p.x = x1; p.y = y1;
    edited(); on('move', { x0, y0, x1, y1 });
    return true;
  };
  g.clear = () => {
    if (g.mode !== 'build' || !g.placed.length) return false;
    g.placed = []; edited(); return true;
  };
  g.setLayout = (list) => {
    g.placed = [];
    for (const [kind, x, y, flip] of list) if (g.canPlace(kind, x, y)) g.placed.push({ kind, x, y, flip: !!flip });
    edited();
  };

  g.release = () => {
    if (g.mode !== 'build') return false;
    g.world = makeWorld(g.L, g.placed, (ev, d) => on(ev, d));
    g.mode = 'run'; g.result = null;
    on('release', {});
    return true;
  };
  g.stop = () => {
    if (g.mode === 'build') return false;
    g.mode = 'build'; quietWorld(); on('reset', {});
    return true;
  };

  g.step = (dt = DT) => {
    if (g.mode === 'run') {
      stepWorld(g.world, dt);
      if (g.world.done) finish();
    } else if (g.mode === 'failed') {
      // let the marbles that missed roll on and settle before the board is reset
      for (let k = 0; k < SUB; k++) for (const m of g.world.marbles) if (!m.home && m.live) roll(g.world, m, dt / SUB);
      g.failT -= dt;
      if (g.failT <= 0) g.stop();
    }
  };

  function finish() {
    const W = g.world;
    if (W.done === 'won') {
      const stars = [true, W.rung.size === g.L.bells.length, g.placed.length <= g.L.par];
      const rec = recordFor(g.L.id);
      const before = rec.stars.slice();
      rec.stars = rec.stars.map((s, i) => s || stars[i]);
      if (rec.best == null || g.placed.length < rec.best) rec.best = g.placed.length;
      if (g.idx + 1 > store.reached && g.idx + 1 < LEVELS.length) store.reached = g.idx + 1;
      if (g.idx === LEVELS.length - 1) store.done = true;
      g.mode = 'won';
      g.result = { won: true, stars, before, bells: W.rung.size, used: g.placed.length, t: W.t };
      save();
      on('win', g.result);
    } else {
      g.mode = 'failed'; g.failT = FAIL_HOLD;
      g.result = { won: false, end: W.done, bells: W.rung.size, t: W.t };
      on('fail', g.result);
    }
  }

  // A hint: the first piece of the level's own solution that is not hung yet. If the
  // player has used that piece's last one somewhere else, it says so.
  g.hint = () => {
    for (const [kind, x, y, flip] of g.L.solution) {
      const p = g.at(x, y);
      if (p && p.kind === kind && (PIECES[kind].sym || p.flip === !!flip)) continue;
      return { kind, x, y, flip: !!flip, wrong: p ? p.kind : null, spare: g.left(kind) > 0 };
    }
    return null;
  };

  g.totalStars = () => Object.values(store.levels).reduce((n, r) => n + r.stars.filter(Boolean).length, 0);
  g.text = () => JSON.stringify({
    level: g.L.id, mode: g.mode, placed: g.placed.map((p) => `${p.kind}@${p.x},${p.y}${p.flip ? 'F' : ''}`),
    t: g.world && +g.world.t.toFixed(2), marbles: g.world && g.world.marbles.map((m) => [+m.x.toFixed(2), +m.y.toFixed(2), m.home ? 'home' : m.live ? 'live' : 'lost']),
    result: g.result,
  });

  g.load(store.level || 0);
  return g;
}
