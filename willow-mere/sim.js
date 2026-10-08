/* Willow Mere: the rules. A rowing boat on a lake made from a seed: litter to fish out and
   take back to the crate on the jetty, lost ducklings and cygnets to lead home to their
   mothers, small animals adrift to ferry home, and birds caught in fishing line to free.
   Nothing can be failed. No page access in here: dice come in as `rnd`, time as step(dt),
   and anything the page should hear about goes out through on(event, data). */

import { streamFor } from '../lib/rng.js';

// ---------- constants ----------
export const W = 2400, H = 1800;           // the world, in px; the lake sits in the middle
export const CELL = 8;                     // the distance field's grid
export const DAY = 600;                    // seconds of play in one day, dawn to dawn
export const STROKE = 1.05;                // one stroke, catch to catch, seconds
export const PULL = 0.42;                  // the part of it with the blade in the water
export const RHYTHM_WIN = 0.3;             // pressing again this close to the catch is in time
export const RHYTHM_POWER = 1.2;           // ... and pulls this much harder
const FMAX = 150;                          // peak thrust of one oar, px/s²
const ALPHA = 5.2;                         // peak turn from one oar, rad/s²
const K1 = 0.35, K2 = 0.0035;              // forward drag: the glide
const KLAT = 4, KW = 2.4;                  // sideways and turning drag: the keel
const BACK = -0.7;                         // backing water pushes this hard, the other way
export const TRUST_SPEED = 30;             // the young only come to a boat moving slower than this
export const TRUST_TIME = 1.2;             // ... that stays beside them this long
export const PADDLE = 82;                  // how fast a following duckling can paddle, px/s
export const LAG_TIME = 2.5;               // seconds left far behind before one gives up
export const GENTLE = 58;                  // coming at the young slower than this does not startle them
export const HULL = [24, 0, -22];          // points along the keel checked against the bank
export const HULL_R = 12;
export const STERN = 26;
export const HOLD_CAP = 8;                 // the boat holds this much litter
export const HELP_TIME = 2.4;              // seconds to untangle a bird
const CLEAR = 20;                          // a cell the boat can reach is this far from land
const DRIFT = 3.5;                         // how fast loose things drift, px/s

export const LITTER = {
  bottle: { name: 'a bottle', w: 1 }, can: { name: 'a drinks can', w: 1 }, crisps: { name: 'a crisp packet', w: 1 },
  bag: { name: 'a carrier bag', w: 1 }, boot: { name: 'a lost welly', w: 1 }, ball: { name: 'a football', w: 1 },
  tyre: { name: 'an old tyre', w: 2 },
};
const LITTER_MIX = ['bottle', 'bottle', 'bottle', 'can', 'can', 'can', 'crisps', 'crisps', 'bag', 'bag', 'boot', 'ball', 'tyre'];
export const N_LITTER = 22;
export const YOUNG = { duckling: { mother: 'duck', clusters: [3, 2, 2] }, cygnet: { mother: 'swan', clusters: [2, 2] } };
export const FRIENDS = {
  hedgehog: { name: 'the hedgehog', raft: 'log', home: 'bramble' },
  mouse: { name: 'the field mouse', raft: 'crate', home: 'stump' },
  cat: { name: 'the cottage kitten', raft: 'branch', home: 'cottage' },
};
export const TANGLED = { coot: 'a coot', goose: 'a goose' };

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const hyp = Math.hypot;
export const wrapAngle = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

// ---------- the lake ----------
// Every body of water and every island is a wobbly ellipse: a radius in its own stretched
// space that wanders with a few harmonics. The lake is the main one plus its bays, less
// the islands. The same shapes give the page its outlines and the sim its distance field.
function harmonics(rnd, amp, kmax = 6) {
  const h = [];
  for (let k = 2; k <= kmax; k++) h.push([k, (rnd() * 2 - 1) * amp / Math.sqrt(k), rnd() * Math.PI * 2]);
  return h;
}
const radius = (sh, th) => { let r = 1; for (const [k, a, p] of sh.h) r += a * Math.sin(k * th + p); return r; };
function inside(sh, x, y) {
  const dx = x - sh.x, dy = y - sh.y, c = Math.cos(sh.rot), s = Math.sin(sh.rot);
  const u = (dx * c + dy * s) / sh.sx, v = (-dx * s + dy * c) / sh.sy;
  return hyp(u, v) < radius(sh, Math.atan2(v, u));
}
// A point at angle th round a shape, `f` of the way out to its edge.
export function rimPoint(sh, th, f = 1) {
  const r = radius(sh, th) * f, c = Math.cos(sh.rot), s = Math.sin(sh.rot);
  const u = Math.cos(th) * sh.sx * r, v = Math.sin(th) * sh.sy * r;
  return { x: sh.x + u * c - v * s, y: sh.y + u * s + v * c };
}
export function outline(sh, n = 220) {
  const pts = [];
  for (let i = 0; i < n; i++) pts.push(rimPoint(sh, (i / n) * Math.PI * 2));
  return pts;
}

export function buildLake(seed) {
  const rnd = streamFor(seed, 'lake');
  const main = { kind: 'lake', x: W / 2 + (rnd() - 0.5) * 120, y: H / 2 + (rnd() - 0.5) * 80, sx: 650 + rnd() * 50, sy: 460 + rnd() * 40, rot: (rnd() - 0.5) * 0.3, h: harmonics(rnd, 0.07) };
  const jettyTh = Math.PI / 2 + (rnd() - 0.5) * 0.6;
  const bays = [];
  const nBays = rnd() < 0.5 ? 3 : 2;
  for (let i = 0; i < nBays; i++) {
    const th = jettyTh + 1.15 + i * ((Math.PI * 2 - 2.3) / Math.max(1, nBays - 1)) + (rnd() - 0.5) * 0.3;
    const c = rimPoint(main, th, 0.97);
    bays.push({ kind: 'bay', th, x: c.x, y: c.y, sx: 150 + rnd() * 60, sy: 95 + rnd() * 45, rot: Math.atan2(c.y - main.y, c.x - main.x), h: harmonics(rnd, 0.08) });
  }
  const water = [main, ...bays];
  // keep everything well inside the world, with room for the woods round it
  for (const sh of water) {
    for (let k = 0; k < 20; k++) {
      const out = outline(sh, 90).some((p) => p.x < 190 || p.y < 190 || p.x > W - 190 || p.y > H - 190);
      if (!out) break;
      sh.sx *= 0.95; sh.sy *= 0.95;
    }
  }

  // the jetty: from the bank at jettyTh straight out into the lake
  const shoreFrom = (sh, th) => {
    const c = { x: sh.x, y: sh.y };
    const far = rimPoint(sh, th, 1.6);
    const d = norm(far.x - c.x, far.y - c.y);
    const start = rimPoint(sh, th, sh.kind === 'lake' ? 0.88 : 0.5);
    let x = start.x, y = start.y;
    for (let i = 0; i < 400 && waterRaw(x, y); i++) { x += d.x * 4; y += d.y * 4; }
    return { x, y, dx: d.x, dy: d.y };
  };
  const islands = [];
  const waterRaw = (x, y) => (water.some((sh) => inside(sh, x, y)) && !islands.some((sh) => inside(sh, x, y)));
  const js = shoreFrom(main, jettyTh);
  const jetty = { base: { x: js.x + js.dx * 22, y: js.y + js.dy * 22 }, end: { x: js.x - js.dx * 104, y: js.y - js.dy * 104 }, dx: js.dx, dy: js.dy, shore: { x: js.x, y: js.y } };
  const perp = { x: -js.dy, y: js.dx };
  const nIslands = rnd() < 0.6 ? 2 : 1;
  for (let tries = 0; islands.length < nIslands && tries < 200; tries++) {
    const p = rimPoint(main, rnd() * Math.PI * 2, 0.15 + rnd() * 0.38);
    const isl = { kind: 'island', x: p.x, y: p.y, sx: 70 + rnd() * 50, sy: 55 + rnd() * 40, rot: rnd() * Math.PI, h: harmonics(rnd, 0.1) };
    if (dist(p, jetty.end) < 330) continue;
    if (islands.some((o) => dist(o, p) < 330)) continue;
    islands.push(isl);
  }

  // the grid: water or not, then how far each cell is from the other kind
  const gw = W / CELL, gh = H / CELL, n = gw * gh;
  const wet = new Uint8Array(n);
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const x = (i + 0.5) * CELL, y = (j + 0.5) * CELL;
    wet[j * gw + i] = waterRaw(x, y) && segDist(x, y, jetty.base, jetty.end) > 11 ? 1 : 0;
  }
  const dW = chamfer(wet, gw, gh, 1), dL = chamfer(wet, gw, gh, 0);
  const sd = new Float32Array(n);
  for (let k = 0; k < n; k++) sd[k] = wet[k] ? dW[k] * CELL - CELL / 2 : -(dL[k] * CELL - CELL / 2);

  const lake = { seed, W, H, gw, gh, shapes: [main, ...bays, ...islands], main, bays, islands, jetty, sd, wet };
  lake.sdAt = (x, y) => sdAt(lake, x, y);

  lake.start = { x: jetty.end.x - js.dx * 30 + perp.x * 38, y: jetty.end.y - js.dy * 30 + perp.y * 38, a: Math.atan2(-js.dy, -js.dx) };
  lake.cottage = { x: js.x + js.dx * 150 + perp.x * 70, y: js.y + js.dy * 150 + perp.y * 70 };

  // which cells the boat can actually reach from the jetty
  const reach = new Uint8Array(n);
  const s0 = cellOf(lake.start.x, lake.start.y);
  const q = [s0]; reach[s0] = 1;
  for (let qi = 0; qi < q.length; qi++) {
    const k = q[qi], i = k % gw, j = (k - i) / gw;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= gw || nj >= gh) continue;
      const nk = nj * gw + ni;
      if (reach[nk] || sd[nk] < CLEAR) continue;
      reach[nk] = 1; q.push(nk);
    }
  }
  lake.reach = reach;
  lake.reachAt = (x, y) => { const i = Math.floor(x / CELL), j = Math.floor(y / CELL); return i >= 0 && j >= 0 && i < gw && j < gh && reach[j * gw + i] === 1; };
  lake.windA = rnd() * Math.PI * 2;

  // walk in from a shore point until the water is deep enough and reachable
  const inward = (p, dx, dy, want) => {
    let x = p.x, y = p.y;
    for (let i = 0; i < 160; i++) { if (lake.sdAt(x, y) >= want && lake.reachAt(x, y)) return { x, y }; x -= dx * 4; y -= dy * 4; }
    return null;
  };
  // nests at the head of the first two bays; homes for the hedgehog and the mouse along the main shore
  lake.nests = {};
  ['duck', 'swan'].forEach((who, i) => {
    const b = bays[i];
    const s = shoreFrom(b, 0);
    const anchor = inward(s, s.dx, s.dy, 44) || { x: b.x, y: b.y };
    lake.nests[who] = { nest: { x: s.x + s.dx * 16, y: s.y + s.dy * 16 }, shore: { x: s.x, y: s.y }, anchor, dx: s.dx, dy: s.dy };
  });
  lake.homes = {};
  const taken = [jettyTh, ...bays.map((b) => b.th)];
  for (const who of ['hedgehog', 'mouse']) {
    let best = null;
    for (let t = 0; t < 60; t++) {
      const th = rnd() * Math.PI * 2;
      if (taken.some((o) => Math.abs(wrapAngle(o - th)) < 0.75)) continue;
      const s = shoreFrom(main, th);
      const anchor = inward(s, s.dx, s.dy, 40);
      if (!anchor || dist(anchor, s) > 130) continue;
      best = { th, s, anchor }; break;
    }
    if (!best) { const th = jettyTh + Math.PI + (who === 'mouse' ? 0.5 : -0.5), s = shoreFrom(main, th); best = { th, s, anchor: inward(s, s.dx, s.dy, 30) || lake.start }; }
    taken.push(best.th);
    lake.homes[who] = { home: { x: best.s.x + best.s.dx * 34, y: best.s.y + best.s.dy * 34 }, shore: { x: best.s.x, y: best.s.y }, anchor: best.anchor, dx: best.s.dx, dy: best.s.dy };
  }
  const catAnchor = inward({ x: jetty.end.x + perp.x * 40, y: jetty.end.y + perp.y * 40 }, js.dx, js.dy, 30) || lake.start;
  lake.homes.cat = { home: { ...lake.cottage }, shore: { ...jetty.shore }, anchor: catAnchor, dx: js.dx, dy: js.dy, viaJetty: true };
  return lake;
}

function chamfer(wet, gw, gh, want) {
  // distance (in cells) from each cell where wet == want to the nearest cell where it is not
  const INF = 1e9, d = new Float32Array(gw * gh), R2 = Math.SQRT2;
  for (let k = 0; k < d.length; k++) d[k] = wet[k] === want ? INF : 0;
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const k = j * gw + i; if (d[k] === 0) continue;
    let v = d[k];
    if (i > 0) v = Math.min(v, d[k - 1] + 1); else v = Math.min(v, 1);
    if (j > 0) { v = Math.min(v, d[k - gw] + 1); if (i > 0) v = Math.min(v, d[k - gw - 1] + R2); if (i < gw - 1) v = Math.min(v, d[k - gw + 1] + R2); } else v = Math.min(v, 1);
    d[k] = v;
  }
  for (let j = gh - 1; j >= 0; j--) for (let i = gw - 1; i >= 0; i--) {
    const k = j * gw + i; if (d[k] === 0) continue;
    let v = d[k];
    if (i < gw - 1) v = Math.min(v, d[k + 1] + 1); else v = Math.min(v, 1);
    if (j < gh - 1) { v = Math.min(v, d[k + gw] + 1); if (i < gw - 1) v = Math.min(v, d[k + gw + 1] + R2); if (i > 0) v = Math.min(v, d[k + gw - 1] + R2); } else v = Math.min(v, 1);
    d[k] = v;
  }
  return d;
}

const cellOf = (x, y) => Math.floor(clamp(y, 0, H - 1) / CELL) * (W / CELL) + Math.floor(clamp(x, 0, W - 1) / CELL);
// signed distance to the bank: positive out on the water, negative inland
export function sdAt(lake, x, y) {
  const gx = x / CELL - 0.5, gy = y / CELL - 0.5;
  const i = Math.floor(gx), j = Math.floor(gy), fx = gx - i, fy = gy - j;
  const g = (a, b) => (a < 0 || b < 0 || a >= lake.gw || b >= lake.gh ? -40 : lake.sd[b * lake.gw + a]);
  return (g(i, j) * (1 - fx) + g(i + 1, j) * fx) * (1 - fy) + (g(i, j + 1) * (1 - fx) + g(i + 1, j + 1) * fx) * fy;
}
// the way to deeper water
export function gradAt(lake, x, y) {
  const e = 5;
  const gx = sdAt(lake, x + e, y) - sdAt(lake, x - e, y), gy = sdAt(lake, x, y + e) - sdAt(lake, x, y - e);
  return norm(gx, gy);
}
function norm(x, y) { const l = hyp(x, y) || 1; return { x: x / l, y: y / l }; }
const dist = (a, b) => hyp(a.x - b.x, a.y - b.y);
function segDist(x, y, a, b) {
  const vx = b.x - a.x, vy = b.y - a.y, t = clamp(((x - a.x) * vx + (y - a.y) * vy) / (vx * vx + vy * vy), 0, 1);
  return hyp(x - a.x - vx * t, y - a.y - vy * t);
}

// A point `s` px back along a trail (newest point first), starting from `from`.
function along(from, trail, s) {
  let px = from.x, py = from.y;
  for (const p of trail) {
    const l = hyp(p.x - px, p.y - py);
    if (l >= s) { const f = s / l; return { x: px + (p.x - px) * f, y: py + (p.y - py) * f }; }
    s -= l; px = p.x; py = p.y;
  }
  return { x: px, y: py };
}
function pushTrail(trail, x, y, t, gap, cap) {
  if (!trail.length || hyp(trail[0].x - x, trail[0].y - y) > gap) { trail.unshift({ x, y, t }); if (trail.length > cap) trail.length = cap; }
}

// ---------- what lives on it ----------
function populate(lake) {
  const S = { v: 1, seed: lake.seed, clock: 0, done: false, tidied: 0, hold: [], chain: [], trail: [], lakes: 0 };
  S.boat = { x: lake.start.x, y: lake.start.y, a: lake.start.a, vx: 0, vy: 0, w: 0 };
  const placed = [];
  const away = (p, r) => placed.every((o) => dist(o, p) >= r);
  function find(rnd, ok, tries = 6000) {
    for (let t = 0; t < tries; t++) {
      const p = { x: 150 + rnd() * (W - 300), y: 150 + rnd() * (H - 300) };
      if (!lake.reachAt(p.x, p.y)) continue;
      if (ok(p, lake.sdAt(p.x, p.y), t / tries)) return p;
    }
    return null;
  }

  // litter: a third tucked in by the reeds, the rest out on open water
  const lr = streamFor(lake.seed, 'litter');
  S.litter = [];
  for (let i = 0; i < N_LITTER; i++) {
    const reeds = i % 3 === 0;
    const p = find(lr, (q, d, slack) => (reeds ? d >= 22 && d <= 46 : d >= 60) && dist(q, lake.jetty.end) > 200 && away(q, 110 * (1 - slack)))
      || find(lr, (q, d) => d >= 22);
    placed.push(p);
    const kind = LITTER_MIX[Math.floor(lr() * LITTER_MIX.length)];
    S.litter.push({ id: i, kind, x: p.x, y: p.y, a: lr() * Math.PI * 2, reeds, ph: lr() * 100, state: 'water' });
  }

  // the young, lost in little clusters a long way from their mothers
  const yr = streamFor(lake.seed, 'young');
  S.young = [];
  S.mothers = {};
  for (const kind of Object.keys(YOUNG)) {
    const m = YOUNG[kind].mother, nest = lake.nests[m];
    S.mothers[m] = { x: nest.anchor.x, y: nest.anchor.y, a: 0, trail: [], brood: [] };
    const centres = [];
    for (const size of YOUNG[kind].clusters) {
      const c = find(yr, (q, d, slack) => d >= 70 && dist(q, nest.anchor) > 520 * (1 - slack) && dist(q, lake.start) > 480 * (1 - slack * 0.5) && centres.every((o) => dist(o, q) > 320 * (1 - slack)) && away(q, 70))
        || find(yr, (q, d) => d >= 50);
      centres.push(c);
      for (let k = 0; k < size; k++) {
        let x = c.x, y = c.y;
        for (let t = 0; t < 20; t++) {
          const a = yr() * Math.PI * 2, r = 12 + yr() * 22;
          if (lake.sdAt(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r) > 40) { x = c.x + Math.cos(a) * r; y = c.y + Math.sin(a) * r; break; }
        }
        S.young.push({ id: S.young.length, kind, x, y, hx: x, hy: y, a: yr() * Math.PI * 2, ph: yr() * 100, state: 'lost', t: 0 });
      }
      placed.push(c);
    }
  }

  // friends adrift on bits of wood, and birds caught in fishing line by the bank
  const fr = streamFor(lake.seed, 'friends');
  S.friends = [];
  for (const kind of Object.keys(FRIENDS)) {
    const p = find(fr, (q, d, slack) => d >= 100 && dist(q, lake.jetty.end) > 360 * (1 - slack) && away(q, 260 * (1 - slack))) || find(fr, (q, d) => d >= 40);
    placed.push(p);
    S.friends.push({ id: S.friends.length, kind, raft: FRIENDS[kind].raft, rx: p.x, ry: p.y, ra: fr() * Math.PI * 2, ph: fr() * 100, x: p.x, y: p.y, state: 'adrift', t: 0 });
  }
  S.tangled = [];
  for (const kind of Object.keys(TANGLED)) {
    const nests = Object.values(lake.nests).map((n) => n.anchor);
    const p = find(fr, (q, d, slack) => d >= 30 && d <= 56 && dist(q, lake.jetty.end) > 300 * (1 - slack) && nests.every((n) => dist(n, q) > 300 * (1 - slack)) && away(q, 240 * (1 - slack)))
      || find(fr, (q, d) => d >= 26);
    placed.push(p);
    S.tangled.push({ id: S.tangled.length, kind, x: p.x, y: p.y, ox: p.x, oy: p.y, a: fr() * Math.PI * 2, ph: fr() * 100, state: 'tangled', p: 0 });
  }
  return S;
}

// ---------- the game ----------
export function createMere({ saved = null, seed = 1, rnd = Math.random, on = () => {} } = {}) {
  let lake, S;
  const oars = { L: oar(), R: oar() };
  let input = { L: false, R: false, back: false }, helping = false;
  let dropT = 0, fullT = 0, bumpT = 0;
  function oar() { return { ph: -1, dir: 1, power: 1, held: false, queued: false }; }

  function load(state) {
    lake = buildLake(state.seed);
    S = state;
    oars.L = oar(); oars.R = oar();
  }
  if (saved && saved.v === 1 && saved.boat && Array.isArray(saved.litter)) load(saved);
  else { lake = buildLake(seed >>> 0); S = populate(lake); }

  function newLake(seed2) {
    const finished = S.lakes + (S.done ? 1 : 0);
    lake = buildLake(seed2 >>> 0);
    S = populate(lake);
    S.lakes = finished;
    oars.L = oar(); oars.R = oar();
    on('newlake', { seed: S.seed });
    on('save');
  }

  // ---------- verbs ----------
  // L and R are the oars on the boat's left and right. Pulling the left one alone turns the
  // boat to the right. `back` pushes both the other way. Held, an oar keeps on stroking.
  function row({ L = false, R = false, back = false } = {}) { input = { L: !!L, R: !!R, back: !!back }; }
  function help(on2) { helping = !!on2; }

  const speed = () => hyp(S.boat.vx, S.boat.vy);
  const heading = () => ({ x: Math.cos(S.boat.a), y: Math.sin(S.boat.a) });

  // ---------- the stroke ----------
  function stepOars(dt) {
    const want = { L: input.back || input.L, R: input.back || input.R };
    const started = [];
    let rhythm = false;
    for (const side of ['L', 'R']) {
      const o = oars[side], other = oars[side === 'L' ? 'R' : 'L'], otherWant = want[side === 'L' ? 'R' : 'L'];
      const edge = want[side] && !o.held;
      o.held = want[side];
      if (edge && o.ph >= STROKE - RHYTHM_WIN) o.queued = true;
      if (o.ph >= 0) {
        o.ph += dt;
        if (o.ph >= STROKE) {
          o.ph = -1;
          if (!o.held) o.queued = false;
        }
      }
      if (o.ph < 0 && o.held) {
        // keep the pair together: a second oar joins one that is still early in its pull,
        // and waits for one that is coming round
        if (other.ph >= 0 && otherWant) {
          if (other.ph < PULL * 0.5) start(o, other.ph);
          else continue;
        } else start(o, 0);
        started.push(side);
        if (o.power > 1) rhythm = true;
      }
    }
    if (started.length) on('stroke', { oars: started.length === 2 ? 'both' : started[0], dir: oars[started[0]].dir, rhythm });
    const f = (o) => (o.ph >= 0 && o.ph < PULL ? FMAX * Math.sin(Math.PI * o.ph / PULL) * o.dir * o.power : 0);
    return { fL: f(oars.L), fR: f(oars.R) };
  }
  function start(o, ph) {
    o.ph = ph;
    o.dir = input.back ? BACK : 1;
    o.power = o.queued ? RHYTHM_POWER : 1;
    o.queued = false;
  }

  function stepBoat(dt) {
    const b = S.boat;
    const { fL, fR } = stepOars(dt);
    let hx = Math.cos(b.a), hy = Math.sin(b.a);
    let fwd = b.vx * hx + b.vy * hy, lat = -b.vx * hy + b.vy * hx;
    fwd += (fL + fR - K1 * fwd - K2 * fwd * Math.abs(fwd)) * dt;
    lat *= Math.exp(-KLAT * dt);
    b.w += ((fL - fR) * ALPHA / FMAX - KW * b.w) * dt;
    b.a = wrapAngle(b.a + b.w * dt);
    hx = Math.cos(b.a); hy = Math.sin(b.a);
    b.vx = fwd * hx - lat * hy; b.vy = fwd * hy + lat * hx;
    b.x += b.vx * dt; b.y += b.vy * dt;
    // the bank and the jetty: a soft bump, never a stop
    for (const p of HULL) {
      const px = b.x + hx * p, py = b.y + hy * p, d = sdAt(lake, px, py);
      if (d >= HULL_R) continue;
      const g = gradAt(lake, px, py), pen = HULL_R - d;
      b.x += g.x * pen; b.y += g.y * pen;
      const vn = b.vx * g.x + b.vy * g.y;
      if (vn < 0) {
        b.vx -= g.x * vn * 1.25; b.vy -= g.y * vn * 1.25;
        b.w += p * (hx * g.y - hy * g.x) * -vn * 0.0003;
        if (-vn > 30 && bumpT <= 0) { on('bump', { v: -vn }); bumpT = 0.6; }
      }
    }
    b.x = clamp(b.x, 40, W - 40); b.y = clamp(b.y, 40, H - 40);
    pushTrail(S.trail, b.x - hx * STERN, b.y - hy * STERN, S.clock, 5, 120);
  }

  // ---------- drifting ----------
  function drift(o, xk, yk, dt) {
    const a = lake.windA + 0.6 * Math.sin(S.clock * 0.013) + 0.7 * Math.sin(S.clock * 0.05 + o.ph);
    o[xk] += Math.cos(a) * DRIFT * dt; o[yk] += Math.sin(a) * DRIFT * dt;
    const d = sdAt(lake, o[xk], o[yk]);
    if (d < 44) { const g = gradAt(lake, o[xk], o[yk]); o[xk] += g.x * 12 * dt; o[yk] += g.y * 12 * dt; }
  }
  // move a creature toward a point, staying on the water
  function swim(o, tx, ty, maxV, dt) {
    const dx = tx - o.x, dy = ty - o.y, l = hyp(dx, dy);
    if (l < 0.01) return 0;
    const v = Math.min(maxV, l * 2.5), s = Math.min(l, v * dt);
    o.x += dx / l * s; o.y += dy / l * s;
    const d = sdAt(lake, o.x, o.y);
    if (d < 8) { const g = gradAt(lake, o.x, o.y); o.x += g.x * (8 - d); o.y += g.y * (8 - d); }
    if (v > 4) o.a = turnTo(o.a, Math.atan2(dy, dx), 6 * dt);
    return v;
  }
  const turnTo = (a, b, k) => wrapAngle(a + clamp(wrapAngle(b - a), -k, k));

  function stepLitter(dt) {
    const b = S.boat, hx = Math.cos(b.a), hy = Math.sin(b.a);
    const bow = { x: b.x + hx * 24, y: b.y + hy * 24 }, stern = { x: b.x - hx * 24, y: b.y - hy * 24 };
    for (const l of S.litter) {
      if (l.state !== 'water') continue;
      if (!l.reeds) drift(l, 'x', 'y', dt);
      if (segDist(l.x, l.y, bow, stern) > 20) continue;
      const w = LITTER[l.kind].w;
      if (holdWeight() + w > HOLD_CAP) { if (fullT <= 0) { on('full'); fullT = 8; } continue; }
      l.state = 'boat'; S.hold.push(l.id);
      on('pickup', { kind: l.kind, x: l.x, y: l.y });
      on('save');
    }
    // emptying the boat into the crate on the jetty, one piece at a time
    if (S.hold.length && hyp(b.x - lake.jetty.end.x, b.y - lake.jetty.end.y) < 120) {
      dropT += dt;
      if (dropT >= 0.3) {
        dropT = 0;
        const l = S.litter[S.hold.shift()];
        l.state = 'crate'; S.tidied++;
        on('drop', { kind: l.kind, left: S.hold.length });
        if (!S.hold.length) on('save');
      }
    } else dropT = 0;
  }
  const holdWeight = () => S.hold.reduce((s, id) => s + LITTER[S.litter[id].kind].w, 0);

  function stepYoung(dt) {
    const b = S.boat, v = speed(), stern = S.trail[0] || b;
    for (const y of S.young) {
      const d = hyp(y.x - b.x, y.y - b.y);
      if (y.state === 'lost') {
        // only rowing straight at them is too much: gliding past, or in slowly, is fine
        const toward = d > 1 ? (b.vx * (y.x - b.x) + b.vy * (y.y - b.y)) / d : 0;
        if (d < 105 && toward > GENTLE) {
          const away = norm(y.x - b.x, y.y - b.y), a = Math.atan2(away.y, away.x) + (rnd() - 0.5) * 0.8;
          y.state = 'startle'; y.t = 1.3; y.vx = Math.cos(a) * 75; y.vy = Math.sin(a) * 75;
          on('startle', { kind: y.kind, x: y.x, y: y.y });
        } else {
          // they have to come to trust the boat: sit nearly still beside them for a moment.
          // While they make up their minds they turn to look at her.
          const near = d < 80 && v < TRUST_SPEED;
          y.trust = clamp((y.trust || 0) + (near ? dt : -dt * 0.5), 0, TRUST_TIME);
          if (y.trust >= TRUST_TIME) {
            y.state = 'follow'; y.trust = 0; y.lag = 0; S.chain.push(y.id);
            on('join', { kind: y.kind, x: y.x, y: y.y, n: S.chain.length });
          } else {
            swim(y, y.hx + Math.sin(S.clock * 0.6 + y.ph) * 14, y.hy + Math.cos(S.clock * 0.45 + y.ph) * 10, 22, dt);
            if (y.trust > 0) y.a = turnTo(y.a, Math.atan2(b.y - y.y, b.x - y.x), 4 * dt);
          }
        }
      } else if (y.state === 'startle') {
        y.t -= dt;
        const g = gradAt(lake, y.x, y.y);
        if (sdAt(lake, y.x, y.y) < 34) { const vn = y.vx * g.x + y.vy * g.y; if (vn < 0) { y.vx -= g.x * vn; y.vy -= g.y * vn; } }
        swim(y, y.x + y.vx, y.y + y.vy, hyp(y.vx, y.vy), dt);
        y.vx *= Math.exp(-0.8 * dt); y.vy *= Math.exp(-0.8 * dt);
        if (y.t <= 0) { y.state = 'lost'; y.hx = y.x; y.hy = y.y; }
      } else if (y.state === 'follow') {
        const i = S.chain.indexOf(y.id);
        const p = along(stern, S.trail, 18 + i * 17);
        // never under the boat (she can back over her own trail), and a little room each
        const keep = 40 + i * 5, bx = p.x - b.x, by = p.y - b.y, bl = hyp(bx, by);
        if (bl < keep) { const o = norm(y.x - b.x, y.y - b.y); p.x = b.x + o.x * keep; p.y = b.y + o.y * keep; }
        for (const id of S.chain) {
          if (id === y.id) continue;
          const o = S.young[id], dx = y.x - o.x, dy = y.y - o.y, l = hyp(dx, dy);
          if (l < 13 && l > 0.01) { p.x += dx / l * (13 - l); p.y += dy / l * (13 - l); }
        }
        swim(y, p.x, p.y, PADDLE, dt);
        // a little one paddles slower than a boat rowed flat out: left behind too long, it
        // gives up and is lost again wherever it stopped
        y.lag = hyp(p.x - y.x, p.y - y.y) > 120 ? (y.lag || 0) + dt : 0;
        if (y.lag > LAG_TIME) {
          S.chain.splice(i, 1);
          y.state = 'lost'; y.hx = y.x; y.hy = y.y; y.lag = 0; y.trust = 0;
          on('left', { kind: y.kind, x: y.x, y: y.y, n: S.chain.length });
          continue;
        }
        const m = S.mothers[YOUNG[y.kind].mother];
        if (hyp(b.x - m.x, b.y - m.y) < 160) {
          S.chain.splice(i, 1);
          y.state = 'going';
          on('deliver', { kind: y.kind, x: y.x, y: y.y });
        }
      } else if (y.state === 'going' || y.state === 'home') {
        const m = S.mothers[YOUNG[y.kind].mother];
        if (y.state === 'going') {
          swim(y, m.x, m.y, 80, dt);
          if (hyp(y.x - m.x, y.y - m.y) < 22) {
            y.state = 'home'; m.brood.push(y.id);
            on('home', { kind: y.kind, x: y.x, y: y.y, n: m.brood.length, of: S.young.filter((o) => o.kind === y.kind).length });
            on('save');
            checkDone();
          }
        } else {
          const p = along(m, m.trail, 14 + m.brood.indexOf(y.id) * 12);
          swim(y, p.x, p.y, 60, dt);
        }
      }
    }
    // the mothers paddle lazy loops off their nests
    for (const [who, m] of Object.entries(S.mothers)) {
      const n = lake.nests[who].anchor, k = who === 'duck' ? 0 : 2;
      swim(m, n.x + Math.cos(S.clock * 0.12 + k) * 34, n.y + Math.sin(S.clock * 0.12 + k) * 22, 30, dt);
      pushTrail(m.trail, m.x, m.y, S.clock, 3, 60);
    }
  }

  function stepFriends(dt) {
    const b = S.boat, v = speed();
    for (const f of S.friends) {
      // the raft keeps drifting whoever is on it
      drift(f, 'rx', 'ry', dt);
      f.ra += Math.sin(S.clock * 0.2 + f.ph) * 0.03 * dt;
      if (f.state === 'adrift') {
        f.x = f.rx; f.y = f.ry;
        if (hyp(b.x - f.rx, b.y - f.ry) < 58 && v <= GENTLE + 15) {
          f.state = 'aboard';
          on('board', { kind: f.kind, x: f.x, y: f.y });
          on('save');
        }
      } else if (f.state === 'aboard') {
        f.x = b.x; f.y = b.y;
        const h = lake.homes[f.kind];
        if (hyp(b.x - h.anchor.x, b.y - h.anchor.y) < 130) {
          f.state = 'hop'; f.t = 0; f.fx = b.x; f.fy = b.y;
          on('hop', { kind: f.kind });
        }
      } else if (f.state === 'hop') {
        f.t += dt;
        const h = lake.homes[f.kind], k = clamp(f.t / 1.6, 0, 1);
        f.x = f.fx + (h.home.x - f.fx) * k; f.y = f.fy + (h.home.y - f.fy) * k;
        if (k >= 1) { f.state = 'home'; on('land', { kind: f.kind }); on('save'); checkDone(); }
      }
    }
  }

  function stepTangled(dt) {
    const b = S.boat;
    for (const t of S.tangled) {
      if (t.state === 'tangled') {
        t.a += Math.sin(S.clock * 1.7 + t.ph) * 0.6 * dt;
        if (helping && nearHelp() === t) {
          t.p = Math.min(1, t.p + dt / HELP_TIME);
          if (t.p >= 1) { t.state = 'free'; on('freed', { kind: t.kind, x: t.x, y: t.y }); on('save'); checkDone(); }
        }
      } else {
        swim(t, t.ox + Math.cos(S.clock * 0.08 + t.ph) * 60, t.oy + Math.sin(S.clock * 0.08 + t.ph) * 40, 26, dt);
      }
    }
    void b;
  }
  // the bird you could be helping right now, if you are close and nearly still
  function nearHelp() {
    const b = S.boat;
    if (speed() > 45) return null;
    let best = null, bd = 80;
    for (const t of S.tangled) if (t.state === 'tangled') { const d = hyp(t.x - b.x, t.y - b.y); if (d < bd) { bd = d; best = t; } }
    return best;
  }

  function checkDone() {
    if (S.done) return;
    if (S.tidied < S.litter.length) return;
    if (S.young.some((y) => y.state !== 'home')) return;
    if (S.friends.some((f) => f.state !== 'home')) return;
    if (S.tangled.some((t) => t.state !== 'free')) return;
    S.done = true;
    on('complete', { lakes: S.lakes + 1 });
    on('save');
  }

  function step(dt) {
    S.clock += dt;
    fullT -= dt; bumpT -= dt;
    stepBoat(dt);
    stepLitter(dt);
    stepYoung(dt);
    stepFriends(dt);
    stepTangled(dt);
    if (!S.done && S.tidied === S.litter.length) checkDone();
  }

  function progress() {
    const count = (arr, f) => arr.filter(f).length;
    return {
      tidied: S.tidied, litter: S.litter.length, inBoat: holdWeight(), cap: HOLD_CAP,
      ducklings: count(S.young, (y) => y.kind === 'duckling' && y.state === 'home'), ducklingsOf: count(S.young, (y) => y.kind === 'duckling'),
      cygnets: count(S.young, (y) => y.kind === 'cygnet' && y.state === 'home'), cygnetsOf: count(S.young, (y) => y.kind === 'cygnet'),
      following: S.chain.length,
      helped: count(S.friends, (f) => f.state === 'home') + count(S.tangled, (t) => t.state === 'free'), helpOf: S.friends.length + S.tangled.length,
      aboard: S.friends.filter((f) => f.state === 'aboard').map((f) => f.kind),
      done: S.done,
    };
  }

  return {
    get S() { return S; },
    get lake() { return lake; },
    get oars() { return oars; },
    get helping() { return helping; },
    row, help, newLake, step, speed, heading, nearHelp, progress, holdWeight,
    sdAt: (x, y) => sdAt(lake, x, y),
    gradAt: (x, y) => gradAt(lake, x, y),
  };
}

// the light: 0 is first light, 0.5 midday-ish, night from about 0.8
export const dayPhase = (clock) => ((clock / DAY) + 0.03) % 1;
