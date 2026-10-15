/* Physics Playground: the rules. Four toys, each a small physics of its own, none of them
   touching the page, so all of them run in Node:

     gummy     soft-body gummy bears: mass points held in shape by volume-preserving
               shape matching (Müller et al. 2005), so they squash, wobble and spring back
     lava      a gooey particle fluid (Clavet et al. 2005, double density relaxation),
               which gives it surface tension: slice a blob and it pulls itself back
               together. Heat at the bottom turns it into a lava lamp
     sand      kinetic sand in a tray: a height field that slumps past its angle of
               repose, and heavy shapes that sink in by the volume they push aside and
               leave their print behind
     pendulum  a double pendulum (RK4), with ghost copies started a hair apart to show
               how fast chaos pulls them away from each other

   const pg = createPlayground({ saved, rnd, on })
     saved   what pg.toSave() returned last time (or null)
     rnd     the dice, a function giving [0, 1)
     on      on(event, data): 'gummy:bounce', 'sand:land', ... the page plays a sound,
             saves
   pg.toys.gummy / .lava / .sand / .pendulum each have step(dt) and verbs.
   Time is only ever what step(dt) is given. */

// ---------- constants ----------
export const TOYS = ['gummy', 'lava', 'sand', 'pendulum'];
export const SAVE_VERSION = 1;
const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * t;
const wrapAngle = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };

// =====================================================================================
// ---------- gummy bears ----------
// =====================================================================================
// The bear's mass points, in its own frame (y down, origin at the belly): name, x, y, r.
// r is how fat the candy is round that point; the picture is a smooth field over them.
export const BEAR = [
  ['head', 0, -56, 25], ['earL', -21, -79, 9], ['earR', 21, -79, 9], ['snout', 0, -46, 11],
  ['chest', 0, -25, 20], ['belly', 0, 2, 28], ['rump', 0, 22, 25],
  ['shoulderL', -19, -20, 12], ['handL', -38, -5, 10], ['shoulderR', 19, -20, 12], ['handR', 38, -5, 10],
  ['hipL', -14, 28, 14], ['footL', -20, 49, 13], ['hipR', 14, 28, 14], ['footR', 20, 49, 13],
];
const BI = Object.fromEntries(BEAR.map((b, i) => [b[0], i]));
// Stretchy strands: drawn as capsules between two points whose radius thins as they are
// pulled out (keeping their area, as candy does). name, from, to, radius at rest.
export const STRANDS = [
  ['neck', BI.chest, BI.head, 15], ['armL', BI.shoulderL, BI.handL, 9], ['armR', BI.shoulderR, BI.handR, 9],
  ['legL', BI.hipL, BI.footL, 12], ['legR', BI.hipR, BI.footR, 12],
  // the joints between the round parts: invisible at rest (the parts overlap), they keep
  // the candy in one piece, drawn out thin, when a bear is shaken hard
  ['earL', BI.head, BI.earL, 7], ['earR', BI.head, BI.earR, 7], ['snout', BI.head, BI.snout, 8],
  ['waist', BI.chest, BI.belly, 16], ['seat', BI.belly, BI.rump, 18],
  ['shoulderL', BI.chest, BI.shoulderL, 9], ['shoulderR', BI.chest, BI.shoulderR, 9],
  ['hipL', BI.rump, BI.hipL, 11], ['hipR', BI.rump, BI.hipR, 11],
];
// Shape-matching clusters: the whole bear (soft, so it squashes as one), and smaller
// groups that keep a head a head and a leg a leg. 'body' takes the jiggle setting.
const CLUSTERS = [
  { pts: BEAR.map((_, i) => i), kind: 'body' },
  { pts: [BI.head, BI.earL, BI.earR, BI.snout, BI.chest], kind: 'part' },
  { pts: [BI.chest, BI.belly, BI.rump, BI.shoulderL, BI.shoulderR, BI.hipL, BI.hipR], kind: 'part' },
  { pts: [BI.chest, BI.shoulderL, BI.handL], kind: 'limb' },
  { pts: [BI.chest, BI.shoulderR, BI.handR], kind: 'limb' },
  { pts: [BI.rump, BI.hipL, BI.footL], kind: 'limb' },
  { pts: [BI.rump, BI.hipR, BI.footR], kind: 'limb' },
];
export const GUMMY_COLOURS = [
  { name: 'cherry', rgb: [214, 22, 40], absorb: 1.0 },
  { name: 'orange', rgb: [255, 118, 12], absorb: 0.85 },
  { name: 'lemon', rgb: [255, 214, 30], absorb: 0.6 },
  { name: 'apple', rgb: [92, 200, 40], absorb: 0.85 },
  { name: 'pineapple', rgb: [255, 246, 214], absorb: 0.25 },
];

export function createGummies({ rnd = Math.random, on = () => {}, W = 1200, H = 750 } = {}) {
  const FLOOR = H - 46;
  const SUB = 6;
  const G = 1600;
  const MAX_BEARS = 14;
  const STRETCH = 34;            // the furthest a point may stray from its place in the body's shape (x size)
  // x0, x1: the side walls. The page sets them to the edges of the screen (setBounds).
  const gm = { W, H, FLOOR, x0: 0, x1: W, bears: [], jiggle: 0.55, held: null, t: 0, nextId: 1, nextColour: 0 };

  function prepCluster(c, pts, s) {
    let cx = 0, cy = 0;
    for (const i of c.pts) { cx += pts[i][1] * s; cy += pts[i][2] * s; }
    cx /= c.pts.length; cy /= c.pts.length;
    const q = c.pts.map((i) => [pts[i][1] * s - cx, pts[i][2] * s - cy]);
    let a = 0, b = 0, d = 0;
    for (const [x, y] of q) { a += x * x; b += x * y; d += y * y; }
    const det = a * d - b * b || 1;
    return { pts: c.pts, kind: c.kind, q, inv: [d / det, -b / det, -b / det, a / det] };
  }

  function addBear({ x, y, colour, size, angle } = {}) {
    if (gm.bears.length >= MAX_BEARS) gm.bears.shift();
    const s = size || 1.3 + rnd() * 0.25;
    const ci = colour != null ? colour : gm.nextColour++ % GUMMY_COLOURS.length;
    const half = 62 * s;                // never start a bear inside a wall
    const bx = clamp(x != null ? x : gm.x0 + 120 + rnd() * Math.max(0, gm.x1 - gm.x0 - 240), gm.x0 + half, Math.max(gm.x0 + half, gm.x1 - half));
    const by = y != null ? y : -90 - rnd() * 60;
    const a = angle != null ? angle : (rnd() - 0.5) * 1.2;
    const ca = Math.cos(a), sa = Math.sin(a);
    const p = BEAR.map(([, lx, ly, r]) => {
      const X = bx + (lx * ca - ly * sa) * s, Y = by + (lx * sa + ly * ca) * s;
      return { x: X, y: Y, px: X, py: Y, vx: (rnd() - 0.5) * 60, vy: 0, r: r * s };
    });
    const bear = {
      id: gm.nextId++, colour: ci, s, p, angle: a, lastBounce: -1, goal: p.map(() => [0, 0]),
      clusters: CLUSTERS.map((c) => prepCluster(c, BEAR, s)),
      strandRest: STRANDS.map(([, i, j]) => Math.hypot(BEAR[i][1] - BEAR[j][1], BEAR[i][2] - BEAR[j][2]) * s),
    };
    gm.bears.push(bear);
    return bear;
  }

  // match one cluster: rotation plus a share of the area-preserving linear fit
  function match(bear, c, k, beta, goal) {
    const P = bear.p;
    let cx = 0, cy = 0;
    for (const i of c.pts) { cx += P[i].x; cy += P[i].y; }
    cx /= c.pts.length; cy /= c.pts.length;
    let a = 0, b = 0, cc = 0, d = 0;
    for (let n = 0; n < c.pts.length; n++) {
      const p = P[c.pts[n]], [qx, qy] = c.q[n];
      const px = p.x - cx, py = p.y - cy;
      a += px * qx; b += px * qy; cc += py * qx; d += py * qy;
    }
    const th = Math.atan2(cc - b, a + d);
    const ct = Math.cos(th), st = Math.sin(th);
    // linear part A = Apq * Aqq^-1, scaled to determinant 1 so the area is kept
    const [i0, i1, i2, i3] = c.inv;
    let A0 = a * i0 + b * i2, A1 = a * i1 + b * i3, A2 = cc * i0 + d * i2, A3 = cc * i1 + d * i3;
    const det = A0 * A3 - A1 * A2;
    let g0 = ct, g1 = -st, g2 = st, g3 = ct;
    if (det > 0.05) {
      const sc = 1 / Math.sqrt(det);
      A0 *= sc; A1 *= sc; A2 *= sc; A3 *= sc;
      g0 = lerp(ct, A0, beta); g1 = lerp(-st, A1, beta); g2 = lerp(st, A2, beta); g3 = lerp(ct, A3, beta);
    }
    for (let n = 0; n < c.pts.length; n++) {
      const p = P[c.pts[n]], [qx, qy] = c.q[n];
      const gx = g0 * qx + g1 * qy + cx, gy = g2 * qx + g3 * qy + cy;
      // the limit is measured from the rigid shape: the stretchy linear part can shear far
      if (goal) { goal[c.pts[n]][0] = ct * qx - st * qy + cx; goal[c.pts[n]][1] = st * qx + ct * qy + cy; }
      p.x += (gx - p.x) * k; p.y += (gy - p.y) * k;
    }
    return th;
  }

  const perSub = (k) => 1 - Math.pow(1 - k, 1 / SUB);

  function step(dt) {
    gm.t += dt;
    const h = dt / SUB;
    const j = gm.jiggle;
    const kBody = perSub(lerp(0.55, 0.12, j)), kPart = perSub(lerp(0.8, 0.45, j)), kLimb = perSub(lerp(0.75, 0.35, j));
    const beta = lerp(0.15, 0.45, j);
    const damp = Math.pow(lerp(0.4, 0.75, j), h);     // velocity kept per second, softened per substep
    const bounces = new Map();
    for (let sub = 0; sub < SUB; sub++) {
      for (const b of gm.bears) for (const p of b.p) {
        p.px = p.x; p.py = p.y;
        p.vy += G * h;
        p.vx *= damp; p.vy *= damp;
        p.x += p.vx * h; p.y += p.vy * h;
      }
      if (gm.held) {
        const { bear, i, tx, ty } = gm.held;
        const p = bear.p[i];
        p.x += (tx - p.x) * 0.55; p.y += (ty - p.y) * 0.55;
      }
      const held = gm.held;
      for (const b of gm.bears) {
        for (const c of b.clusters) {
          let k = c.kind === 'body' ? kBody : c.kind === 'part' ? kPart : kLimb;
          // whatever you hold by goes soft, so the limb stretches out under the bear's weight
          if (held && held.bear === b && c.pts.includes(held.i)) k *= c.kind === 'limb' ? 0.06 : 0.25;
          const th = match(b, c, k, c.kind === 'body' ? beta : beta * 0.5, c.kind === 'body' ? b.goal : null);
          if (c.kind === 'body') b.angle = th;
        }
        // however hard it is shaken, no point strays further than STRETCH from its place
        // in the body's shape: past that the whole bear is dragged along instead of tearing
        const lim = STRETCH * b.s;
        b.p.forEach((p, i) => {
          const [gx, gy] = b.goal[i], dx = p.x - gx, dy = p.y - gy, d = Math.hypot(dx, dy);
          if (d > lim) { const f = (d - lim) / d; p.x -= dx * f; p.y -= dy * f; }
        });
      }
      // bear against bear: circles round every point push apart
      const bs = gm.bears;
      for (let m = 0; m < bs.length; m++) {
        const A = bs[m];
        const ba = bbox(A);
        for (let n = m + 1; n < bs.length; n++) {
          const B = bs[n];
          const bb = bbox(B);
          if (ba[0] > bb[2] || bb[0] > ba[2] || ba[1] > bb[3] || bb[1] > ba[3]) continue;
          for (const p of A.p) for (const q of B.p) {
            const dx = q.x - p.x, dy = q.y - p.y, rr = (p.r + q.r) * 0.82;
            const d2 = dx * dx + dy * dy;
            if (d2 >= rr * rr || d2 < 1e-6) continue;
            const d = Math.sqrt(d2), push = (rr - d) * 0.5 / d;
            p.x -= dx * push; p.y -= dy * push; q.x += dx * push; q.y += dy * push;
          }
        }
      }
      // the table and the sides
      for (const b of gm.bears) for (const p of b.p) {
        const r = p.r * 0.85;
        if (p.y > FLOOR - r) {
          const vy = (p.y - p.py) / h;
          if (vy > 380) bounces.set(b, Math.max(bounces.get(b) || 0, vy));
          p.y = FLOOR - r;
          p.x = p.px + (p.x - p.px) * 0.55;       // friction on the table
        }
        // a wall stops a point dead: the push out must not turn into speed the other way
        if (p.x < gm.x0 + r) { p.x = p.px = gm.x0 + r; p.y = p.py + (p.y - p.py) * 0.7; }
        if (p.x > gm.x1 - r) { p.x = p.px = gm.x1 - r; p.y = p.py + (p.y - p.py) * 0.7; }
      }
      for (const b of gm.bears) for (const p of b.p) { p.vx = (p.x - p.px) / h; p.vy = (p.y - p.py) / h; }
    }
    for (const [b, v] of bounces) {
      if (gm.t - b.lastBounce < 0.18) continue;
      b.lastBounce = gm.t;
      on('bounce', { id: b.id, colour: b.colour, speed: v, x: centre(b)[0] });
    }
  }
  function bbox(b) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of b.p) {
      if (p.x - p.r < x0) x0 = p.x - p.r; if (p.y - p.r < y0) y0 = p.y - p.r;
      if (p.x + p.r > x1) x1 = p.x + p.r; if (p.y + p.r > y1) y1 = p.y + p.r;
    }
    return [x0, y0, x1, y1];
  }
  function centre(b) {
    let x = 0, y = 0;
    for (const p of b.p) { x += p.x; y += p.y; }
    return [x / b.p.length, y / b.p.length];
  }

  // pick up the nearest point of the top-most bear under the finger
  function grab(x, y) {
    for (let m = gm.bears.length - 1; m >= 0; m--) {
      const b = gm.bears[m];
      let best = -1, bd = Infinity;
      b.p.forEach((p, i) => {
        const d = Math.hypot(p.x - x, p.y - y) - p.r;
        if (d < bd) { bd = d; best = i; }
      });
      if (bd < 14) {
        gm.held = { bear: b, i: best, tx: x, ty: y };
        gm.bears.splice(m, 1); gm.bears.push(b);   // the held bear comes to the front
        on('grab', { id: b.id, part: BEAR[best][0] });
        return true;
      }
    }
    return false;
  }
  function drag(x, y) { if (gm.held) { gm.held.tx = x; gm.held.ty = y; } }
  function release() {
    if (!gm.held) return;
    const b = gm.held.bear;
    gm.held = null;
    // a fast fling would otherwise fly off: cap it
    for (const p of b.p) { p.vx = clamp(p.vx, -2600, 2600); p.vy = clamp(p.vy, -2600, 2600); }
    on('drop', { id: b.id });
  }
  // the table gets a thump: every bear hops
  function thump(power = 1) {
    for (const b of gm.bears) {
      const kick = -(500 + rnd() * 300) * power, spin = (rnd() - 0.5) * 300 * power;
      const [cx] = centre(b);
      for (const p of b.p) { p.vy += kick; p.vx += spin * ((p.y - b.p[BI.belly].y) / 60) + (p.x - cx) * 0.6; }
    }
    on('thump', { power });
  }
  function clear() { gm.bears.length = 0; gm.held = null; }
  // the strands' radius right now: thinner as they stretch, keeping their area
  function strandRadius(b, s) {
    const [, i, j, r] = STRANDS[s];
    const len = Math.hypot(b.p[i].x - b.p[j].x, b.p[i].y - b.p[j].y);
    return r * b.s * Math.sqrt(clamp(b.strandRest[s] / Math.max(1, len), 0.12, 1.4));
  }
  // how far a bear is from its own rest shape: the test's measure of "springs back"
  function strain(b) {
    const c = b.clusters[0];
    let cx = 0, cy = 0;
    for (const i of c.pts) { cx += b.p[i].x; cy += b.p[i].y; }
    cx /= c.pts.length; cy /= c.pts.length;
    const ct = Math.cos(b.angle), st = Math.sin(b.angle);
    let e = 0;
    c.pts.forEach((i, n) => {
      const [qx, qy] = c.q[n];
      e += Math.hypot(ct * qx - st * qy + cx - b.p[i].x, st * qx + ct * qy + cy - b.p[i].y);
    });
    return e / c.pts.length;
  }
  function area(b) {
    // the outline's area through the outer points, a check that squashing keeps volume
    const ring = [BI.earL, BI.head, BI.earR, BI.handR, BI.footR, BI.footL, BI.handL].map((i) => b.p[i]);
    let A = 0;
    for (let i = 0; i < ring.length; i++) { const a = ring[i], c = ring[(i + 1) % ring.length]; A += a.x * c.y - c.x * a.y; }
    return Math.abs(A / 2);
  }
  function setJiggle(v) { gm.jiggle = clamp(+v || 0, 0, 1); }
  function setBounds(x0, x1) { if (x1 - x0 > 200) { gm.x0 = x0; gm.x1 = x1; } }
  Object.assign(gm, { addBear, step, grab, drag, release, thump, clear, strandRadius, strain, area, centre, bbox, setJiggle, setBounds });
  return gm;
}

// =====================================================================================
// ---------- lava ----------
// =====================================================================================
// Particles under double density relaxation: each one is pushed by the crowding of its
// neighbours within H (pressure) and pulled when there are too few (which, with the "near"
// pressure stopping them clumping to a point, is what gives the surface its tension).
// Units are pixels and 1/60s frames, as in the paper, so its constants carry over.
export function createLava({ rnd = Math.random, on = () => {}, W = 1200, H = 750, count = 650 } = {}) {
  const R = 24;                  // interaction radius
  let REST = 10, K = 0.1, KNEAR = 0.6;
  let SIGMA = 0.02, BETA = 0.05;
  const SUB = 2;
  const MAX = 1400;
  const lv = {
    W, H, R, n: 0, x: new Float32Array(MAX), y: new Float32Array(MAX), px: new Float32Array(MAX), py: new Float32Array(MAX),
    vx: new Float32Array(MAX), vy: new Float32Array(MAX), heat: new Float32Array(MAX),
    lamp: true, gravity: 0.5, t: 0, knife: null, slices: 0, conduct: 0.02, lift: 0.28, cohesion: 2, pull: 0.06,
    tune(o) { ({ REST = REST, K = K, KNEAR = KNEAR, SIGMA = SIGMA, BETA = BETA } = o); },
  };
  const cell = R;
  const gw = Math.ceil(W / cell) + 1, gh = Math.ceil(H / cell) + 1;
  const head = new Int32Array(gw * gh), next = new Int32Array(MAX);

  function add(x, y, vx = 0, vy = 0, heat = 0.5) {
    if (lv.n >= MAX) return -1;
    const i = lv.n++;
    lv.x[i] = lv.px[i] = clamp(x, 4, W - 4); lv.y[i] = lv.py[i] = clamp(y, 4, H - 4);
    lv.vx[i] = vx; lv.vy[i] = vy; lv.heat[i] = heat;
    return i;
  }
  // a round blob of n particles at (x, y)
  function blob(x, y, n = 120, heat = 0.5) {
    const r = Math.sqrt(n) * 4.6;
    for (let k = 0; k < n; k++) {
      const a = rnd() * TAU, d = Math.sqrt(rnd()) * r;
      add(x + Math.cos(a) * d, y + Math.sin(a) * d, 0, 0, heat + (rnd() - 0.5) * 0.1);
    }
  }
  function reset() {
    lv.n = 0; pullAcc = null;
    const blobs = 5;
    const per = Math.floor(count / blobs);
    for (let b = 0; b < blobs; b++) blob(W * (0.15 + 0.7 * (b / (blobs - 1))) + (rnd() - 0.5) * 60, H * (0.3 + rnd() * 0.5), per, rnd());
  }

  function grid() {
    head.fill(-1);
    for (let i = 0; i < lv.n; i++) {
      const gx = clamp((lv.x[i] / cell) | 0, 0, gw - 1), gy = clamp((lv.y[i] / cell) | 0, 0, gh - 1);
      const c = gy * gw + gx;
      next[i] = head[c]; head[c] = i;
    }
  }
  function neighbours(i, f) {
    const gx = clamp((lv.x[i] / cell) | 0, 0, gw - 1), gy = clamp((lv.y[i] / cell) | 0, 0, gh - 1);
    for (let y = Math.max(0, gy - 1); y <= Math.min(gh - 1, gy + 1); y++)
      for (let x = Math.max(0, gx - 1); x <= Math.min(gw - 1, gx + 1); x++)
        for (let j = head[y * gw + x]; j !== -1; j = next[j]) if (j > i) f(j);
  }

  function substep(dt) {
    const n = lv.n, X = lv.x, Y = lv.y, VX = lv.vx, VY = lv.vy, PX = lv.px, PY = lv.py, T = lv.heat;
    const g = lv.gravity * 0.22;
    // forces: gravity, and in the lamp, heat lifting the hot and cold sinking
    for (let i = 0; i < n; i++) {
      let ay = g;
      if (lv.lamp) {
        const bottom = Y[i] > H - 70, top = Y[i] < 90;
        T[i] = clamp(T[i] + (bottom ? 0.006 : top ? -0.006 : -0.0009) * dt, 0, 1);
        ay -= (T[i] - 0.45) * lv.lift;
        VX[i] *= 0.995; VY[i] *= 0.995;
      } else T[i] += (0.35 - T[i]) * 0.002 * dt;
      VY[i] += ay * dt;
      if (pullAcc && i < pullLabel.length) { const p = pullAcc[pullLabel[i]]; VX[i] += p[0] * dt; VY[i] += p[1] * dt; }
    }
    // viscosity: neighbours closing on each other share their speed
    grid();
    for (let i = 0; i < n; i++) neighbours(i, (j) => {
      const dx = X[j] - X[i], dy = Y[j] - Y[i], r = Math.hypot(dx, dy);
      if (r >= R || r < 1e-4) return;
      const q = r / R, ux = dx / r, uy = dy / r;
      // heat flows between neighbours, so a blob warms and rises as one piece
      const dT = (T[j] - T[i]) * lv.conduct * (1 - q) * dt;
      T[i] += dT; T[j] -= dT;
      const u = (VX[i] - VX[j]) * ux + (VY[i] - VY[j]) * uy;
      if (u <= 0) return;
      const I = dt * (1 - q) * (SIGMA * u + BETA * u * u) * 0.5;
      VX[i] -= I * ux; VY[i] -= I * uy; VX[j] += I * ux; VY[j] += I * uy;
    });
    for (let i = 0; i < n; i++) { PX[i] = X[i]; PY[i] = Y[i]; X[i] += VX[i] * dt; Y[i] += VY[i] * dt; }
    // the blade pushes everything near it aside
    if (lv.knife) cut(lv.knife);
    // double density relaxation
    grid();
    const rho = new Float32Array(n), rhoN = new Float32Array(n);
    for (let i = 0; i < n; i++) neighbours(i, (j) => {
      const r = Math.hypot(X[j] - X[i], Y[j] - Y[i]);
      if (r >= R) return;
      const q = 1 - r / R, q2 = q * q;
      rho[i] += q2; rho[j] += q2; rhoN[i] += q2 * q; rhoN[j] += q2 * q;
    });
    for (let i = 0; i < n; i++) {
      const P = K * (rho[i] - REST), PN = KNEAR * rhoN[i];
      let dx0 = 0, dy0 = 0;
      neighbours(i, (j) => {
        const dx = X[j] - X[i], dy = Y[j] - Y[i], r = Math.hypot(dx, dy);
        if (r >= R || r < 1e-4) return;
        const q = 1 - r / R;
        const Pj = K * (rho[j] - REST), PNj = KNEAR * rhoN[j];
        // pressure pushes apart; cohesion pulls neighbours at mid range together, which is
        // what rounds a blob off and pulls two halves back into one
        const D = dt * dt * ((P + Pj) * 0.5 * q + (PN + PNj) * 0.5 * q * q - lv.cohesion * q * (1 - q)) * 0.5;
        const ux = dx / r * D, uy = dy / r * D;
        X[j] += ux; Y[j] += uy; dx0 -= ux; dy0 -= uy;
      });
      X[i] += dx0; Y[i] += dy0;
    }
    // walls
    for (let i = 0; i < n; i++) {
      if (X[i] < 6) X[i] = 6 + (6 - X[i]) * 0.2; else if (X[i] > W - 6) X[i] = W - 6 - (X[i] - W + 6) * 0.2;
      if (Y[i] < 6) Y[i] = 6 + (6 - Y[i]) * 0.2; else if (Y[i] > H - 6) { Y[i] = H - 6 - (Y[i] - H + 6) * 0.2; X[i] = PX[i] + (X[i] - PX[i]) * 0.96; }
      VX[i] = clamp((X[i] - PX[i]) / dt, -40, 40); VY[i] = clamp((Y[i] - PY[i]) / dt, -40, 40);
    }
  }
  // one sweep of the blade from (x0, y0) to (x1, y1): everything within reach is moved
  // out to either side, without being given any speed
  function cut({ x0, y0, x1, y1, w }) {
    const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy;
    let moved = 0;
    for (let i = 0; i < lv.n; i++) {
      const X = lv.x[i], Y = lv.y[i];
      const t = L2 ? clamp(((X - x0) * dx + (Y - y0) * dy) / L2, 0, 1) : 0;
      const cx = x0 + dx * t, cy = y0 + dy * t;
      const ex = X - cx, ey = Y - cy, d = Math.hypot(ex, ey);
      if (d >= w) continue;
      let nx, ny;
      if (d > 1e-3) { nx = ex / d; ny = ey / d; } else { const l = Math.sqrt(L2) || 1; nx = -dy / l; ny = dx / l; }
      const push = (w - d);
      lv.x[i] += nx * push; lv.y[i] += ny * push;
      lv.px[i] += nx * push * 0.6; lv.py[i] += ny * push * 0.6;   // parted, with only a little speed
      moved++;
    }
    if (moved) lv.cutCount = (lv.cutCount || 0) + moved;
  }
  function blade(x0, y0, x1, y1, w = 16) { lv.knife = { x0, y0, x1, y1, w }; }

  function step(dt) {
    lv.t += dt;
    const frames = dt * 60;
    if (++pullTick % 6 === 0 || !pullAcc) pullTogether();
    for (let s = 0; s < SUB; s++) substep(frames / SUB);
    if (lv.knife && lv.cutCount > 30) { lv.slices++; on('slice', { n: lv.cutCount }); }
    lv.cutCount = 0;
    lv.knife = null;
  }
  // the blobs: particles closer than 0.8R count as joined. Returns each particle's blob
  // and every blob's size and centre.
  function components() {
    const n = lv.n, parent = new Int32Array(n);
    for (let i = 0; i < n; i++) parent[i] = i;
    const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    grid();
    for (let i = 0; i < n; i++) neighbours(i, (j) => {
      if (Math.hypot(lv.x[j] - lv.x[i], lv.y[j] - lv.y[i]) < R * 0.8) { const a = find(i), b = find(j); if (a !== b) parent[a] = b; }
    });
    const label = new Int32Array(n), ids = new Map(), list = [];
    for (let i = 0; i < n; i++) {
      const r = find(i);
      if (!ids.has(r)) { ids.set(r, list.length); list.push({ n: 0, x: 0, y: 0, x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }); }
      const c = list[label[i] = ids.get(r)];
      c.n++; c.x += lv.x[i]; c.y += lv.y[i];
      if (lv.x[i] < c.x0) c.x0 = lv.x[i]; if (lv.x[i] > c.x1) c.x1 = lv.x[i];
      if (lv.y[i] < c.y0) c.y0 = lv.y[i]; if (lv.y[i] > c.y1) c.y1 = lv.y[i];
    }
    for (const c of list) { c.x /= c.n; c.y /= c.n; }
    return { label, list };
  }
  function blobs(minSize = 8) { return components().list.filter((c) => c.n >= minSize).length; }
  // Surface tension only reaches R, so two pieces a slice has pushed just out of reach
  // would never meet again. Blobs whose edges are within PULL_GAP drift towards each
  // other instead, the smaller one more, until they touch and the tension takes over.
  const PULL_GAP = 160;
  let pullLabel = null, pullAcc = null, pullTick = 0;
  function pullTogether() {
    const { label, list } = components();
    const acc = list.map(() => [0, 0]);
    for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
      const A = list[a], B = list[b];
      if (A.n < 6 || B.n < 6) continue;
      const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 1;
      // the gap between their outlines, near enough: between their bounding boxes
      const gap = Math.hypot(Math.max(0, A.x0 - B.x1, B.x0 - A.x1), Math.max(0, A.y0 - B.y1, B.y0 - A.y1));
      if (gap > PULL_GAP) continue;
      const f = lv.pull * clamp(1 - gap / PULL_GAP, 0, 1), ux = dx / d, uy = dy / d;
      const wa = B.n / (A.n + B.n), wb = A.n / (A.n + B.n);
      acc[a][0] += ux * f * wa; acc[a][1] += uy * f * wa;
      acc[b][0] -= ux * f * wb; acc[b][1] -= uy * f * wb;
    }
    pullLabel = label; pullAcc = acc;
  }
  function pour(x, y, n = 60) { blob(x, y, n, lv.lamp ? 0.9 : 0.5); on('pour', { n }); }
  function drain(n = 60) { lv.n = Math.max(0, lv.n - n); pullAcc = null; }
  function maxSpeed() { let m = 0; for (let i = 0; i < lv.n; i++) m = Math.max(m, Math.hypot(lv.vx[i], lv.vy[i])); return m; }
  reset();
  Object.assign(lv, { step, blade, blobs, components, pour, drain, reset, add, blob, maxSpeed, MAX });
  return lv;
}

// =====================================================================================
// ---------- kinetic sand ----------
// =====================================================================================
// The tray is an N x N height field (one unit a cell). Sand slumps wherever a slope is
// steeper than its angle of repose (kinetic sand's is steep, which is why it holds a
// print). A shape falls, and every cell of its footprint that sits higher than the
// shape's underside is pushed out of the way: that volume goes to a ring round the
// footprint, a little flies off as grains, and the shape loses speed for every unit it
// moves. Volume is kept exactly: sand in the tray plus grains in the air.
export const SAND_SHAPES = {
  ball: { name: 'Steel ball', size: 9, density: 7.8 },
  cube: { name: 'Brass cube', size: 14, density: 8.5 },
  cylinder: { name: 'Puck', size: 9, density: 5 },
  pyramid: { name: 'Pyramid', size: 16, density: 6 },
  star: { name: 'Star', size: 11, density: 6 },
  ring: { name: 'Ring', size: 9, density: 7 },
};
export const SAND_COLOURS = [
  { name: 'Beach', rgb: [222, 190, 140] }, { name: 'Pink', rgb: [240, 150, 170] }, { name: 'Lagoon', rgb: [110, 190, 210] },
  { name: 'Moss', rgb: [140, 190, 110] }, { name: 'Lilac', rgb: [180, 150, 220] },
];
export function createSandbox({ rnd = Math.random, on = () => {}, N = 96 } = {}) {
  const BASE = 14;
  const G = 900;
  const RESIST = 900;         // speed^2 lost per unit volume pushed, times mass
  const BEARING = 150;        // weight one cell of contact holds up
  const sb = {
    N, h: new Float32Array(N * N), shapes: [], grains: [], t: 0, wet: 0.7, colour: 0, nextId: 1, volume0: 0, ver: 0,
    WALL: 30, DROP: 70,
  };
  const I = (x, z) => z * N + x;
  function reset() {
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      sb.h[I(x, z)] = BASE + 0.6 * Math.sin(x * 0.21 + 1.3) * Math.sin(z * 0.17) + (rnd() - 0.5) * 0.25;
    }
    sb.shapes.length = 0; sb.grains.length = 0;
    sb.volume0 = volume();
    sb.ver++;
  }
  function volume() {
    let v = 0;
    for (let i = 0; i < N * N; i++) v += sb.h[i];
    for (const g of sb.grains) v += g.vol;
    return v;
  }
  const talus = () => lerp(0.7, 2.6, sb.wet);

  // the underside of a shape at a point: its height there, or Infinity if not under it
  function under(s, x, z) {
    const dx = x - s.x, dz = z - s.z;
    const c = Math.cos(-s.yaw), sn = Math.sin(-s.yaw);
    const lx = dx * c - dz * sn, lz = dx * sn + dz * c;
    const R = s.size;
    switch (s.kind) {
      case 'ball': { const d2 = dx * dx + dz * dz; return d2 < R * R ? s.y + R - Math.sqrt(R * R - d2) : Infinity; }
      case 'cube': return Math.abs(lx) < R / 2 && Math.abs(lz) < R / 2 ? s.y : Infinity;
      case 'pyramid': return Math.abs(lx) < R / 2 && Math.abs(lz) < R / 2 ? s.y : Infinity;
      case 'cylinder': return dx * dx + dz * dz < R * R ? s.y : Infinity;
      case 'star': {
        const r = Math.hypot(lx, lz);
        if (r > R) return Infinity;
        const a = Math.atan2(lz, lx);
        const k = ((a / TAU) * 5 % 1 + 1) % 1;               // 0..1 across one point
        const edge = lerp(R * 0.42, R, 1 - Math.abs(k - 0.5) * 2);
        return r < edge ? s.y : Infinity;
      }
      case 'ring': {
        const minor = R * 0.38, q = Math.abs(Math.hypot(dx, dz) - R * 0.72);
        return q < minor ? s.y + minor - Math.sqrt(minor * minor - q * q) : Infinity;
      }
    }
    return Infinity;
  }
  function footprint(s) {
    const r = Math.ceil(s.size * (s.kind === 'cube' || s.kind === 'pyramid' ? 0.75 : 1.15)) + 1;
    return [Math.max(1, Math.floor(s.x - r)), Math.max(1, Math.floor(s.z - r)), Math.min(N - 2, Math.ceil(s.x + r)), Math.min(N - 2, Math.ceil(s.z + r))];
  }
  function heightAt(x, z) {
    const X = clamp(x, 0, N - 1.001), Z = clamp(z, 0, N - 1.001);
    const x0 = X | 0, z0 = Z | 0, fx = X - x0, fz = Z - z0;
    const a = sb.h[I(x0, z0)], b = sb.h[I(x0 + 1, z0)], c = sb.h[I(x0, z0 + 1)], d = sb.h[I(x0 + 1, z0 + 1)];
    return lerp(lerp(a, b, fx), lerp(c, d, fx), fz);
  }

  function drop(kind, x, z, opts = {}) {
    const k = SAND_SHAPES[kind] ? kind : 'ball';
    const def = SAND_SHAPES[k];
    // one shape at a time in any spot: whatever is already there is lifted out first
    for (const s of sb.shapes) if (s.state !== 'lift' && Math.hypot(s.x - x, s.z - z) < s.size + def.size * 0.8) lift(s.id);
    const size = def.size * (opts.scale || 1);
    const vol = k === 'ball' ? 4 / 3 * Math.PI * size ** 3 : k === 'ring' ? 2 * Math.PI ** 2 * (size * 0.72) * (size * 0.38) ** 2 : size ** 3;
    const s = {
      id: sb.nextId++, kind: k, x: clamp(x, size + 1, N - size - 1), z: clamp(z, size + 1, N - size - 1),
      y: (opts.height != null ? opts.height : sb.DROP), vy: 0, yaw: opts.yaw != null ? opts.yaw : (k === 'ball' ? 0 : rnd() * TAU),
      size, mass: vol * def.density * 0.001, state: 'fall', sunk: 0, landed: false,
    };
    sb.shapes.push(s);
    while (sb.shapes.length > 9) sb.shapes.shift();
    return s;
  }
  function lift(id) {
    const s = sb.shapes.find((q) => q.id === id);
    if (!s || s.state === 'lift') return false;
    s.state = 'lift'; s.vy = 90;
    on('lift', { id, kind: s.kind });
    return true;
  }
  function shapeAt(x, z) {
    for (let i = sb.shapes.length - 1; i >= 0; i--) {
      const s = sb.shapes[i];
      if (s.state !== 'lift' && Math.hypot(s.x - x, s.z - z) < s.size * 1.05) return s;
    }
    return null;
  }

  // push the sand under a footprint down to `bottom(x, z)`; the rest goes round the rim.
  // Returns the volume moved and how many cells were touching.
  function displace(bottom, box, splash, cx, cz) {
    const [x0, z0, x1, z1] = box;
    let moved = 0, contact = 0;
    const rim = [];
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const b = bottom(x + 0.5, z + 0.5);
      const i = I(x, z);
      if (b === Infinity) { rim.push(i); continue; }
      if (sb.h[i] > b - 0.15) contact++;
      if (sb.h[i] > b) { moved += sb.h[i] - Math.max(0, b); sb.h[i] = Math.max(0, b); }
    }
    if (moved <= 0) return [0, contact];
    sb.ver++;
    // grains thrown up, by how hard it came down
    let thrown = moved * clamp(splash, 0, 0.2);
    const n = Math.min(60, Math.ceil(thrown / 0.4));
    if (thrown > 0.05 && sb.grains.length < 2500) {
      const each = thrown / n;
      for (let k = 0; k < n; k++) {
        const a = rnd() * TAU, sp = 15 + rnd() * 40 * (0.5 + splash * 3);
        const rr = (box[2] - box[0]) / 2;
        sb.grains.push({ x: cx + Math.cos(a) * rr * 0.8, z: cz + Math.sin(a) * rr * 0.8, y: heightAt(cx, cz) + 1, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: 30 + rnd() * 60 * (0.4 + splash * 2), vol: each });
      }
    } else thrown = 0;
    const rest = moved - thrown;
    // the rim: cells just outside the footprint, inside the box (which has a margin)
    if (rim.length) { const each = rest / rim.length; for (const i of rim) sb.h[i] += each; }
    else { const i = I(clamp(Math.round(cx), 1, N - 2), clamp(Math.round(cz), 1, N - 2)); sb.h[i] += rest; }
    return [moved, contact];
  }

  function stepShape(s, dt) {
    if (s.state === 'lift') { s.y += s.vy * dt; s.vy += 200 * dt; if (s.y > 140) s.gone = true; return; }
    if (s.state === 'rest') return;
    const v0 = -s.vy;
    s.vy -= G * dt;
    s.y += s.vy * dt;
    if (s.y < 0) { s.y = 0; s.vy = 0; }
    const box = footprint(s);
    const grow = [box[0] - 2, box[1] - 2, box[2] + 2, box[3] + 2].map((v, i) => clamp(v, 1, N - 2));
    const speed = Math.max(0, -s.vy);
    const [moved, contact] = displace((x, z) => under(s, x, z), grow, speed / 220, s.x, s.z);
    if (moved > 0 || contact > 0) {
      if (!s.landed) { s.landed = true; on('land', { id: s.id, kind: s.kind, speed: v0, x: s.x, z: s.z }); }
      const v2 = s.vy * s.vy - 2 * RESIST * moved / Math.max(0.05, s.mass);
      s.vy = v2 > 0 ? -Math.sqrt(v2) : 0;
      s.sunk += moved;
      // once stopped, does the contact bear the weight?
      if (s.vy === 0) {
        if (contact * BEARING * (0.4 + sb.wet) >= s.mass * G || s.y <= 0) s.state = 'rest';
        else s.vy = -3;   // creeping down
      }
    }
  }

  function relax(passes = 2) {
    const T = talus(), TD = T * Math.SQRT2;
    const h = sb.h;
    // nothing flows into a resting shape: cells under one are capped at its underside
    const caps = [];
    for (const s of sb.shapes) if (s.state !== 'lift') caps.push(s);
    for (let p = 0; p < passes; p++) {
      for (let z = 1; z < N - 1; z++) for (let x = 1; x < N - 1; x++) {
        const i = I(x, z);
        // right, down, and the two diagonals below: every pair once
        flow(i, i + 1, T); flow(i, i + N, T); flow(i, i + N + 1, TD); if (x > 1) flow(i, i + N - 1, TD);
      }
    }
    for (const s of caps) {
      const box = footprint(s), grow = [box[0] - 2, box[1] - 2, box[2] + 2, box[3] + 2].map((v) => clamp(v, 1, N - 2));
      displace((x, z) => under(s, x, z), grow, 0, s.x, s.z);
    }
    function flow(i, j, lim) {
      const d = h[i] - h[j];
      if (d > lim) { const m = (d - lim) * 0.25; h[i] -= m; h[j] += m; sb.ver++; }
      else if (-d > lim) { const m = (-d - lim) * 0.25; h[j] -= m; h[i] += m; sb.ver++; }
    }
  }

  function stepGrains(dt) {
    const keep = [];
    for (const g of sb.grains) {
      g.vy -= G * 0.6 * dt;
      g.x += g.vx * dt; g.z += g.vz * dt; g.y += g.vy * dt;
      if (g.x < 1 || g.x > N - 2) { g.vx = -g.vx * 0.3; g.x = clamp(g.x, 1, N - 2); }
      if (g.z < 1 || g.z > N - 2) { g.vz = -g.vz * 0.3; g.z = clamp(g.z, 1, N - 2); }
      const ground = heightAt(g.x, g.z);
      if (g.y <= ground && g.vy < 0) {
        const x0 = clamp(Math.floor(g.x), 1, N - 3), z0 = clamp(Math.floor(g.z), 1, N - 3), fx = clamp(g.x - x0, 0, 1), fz = clamp(g.z - z0, 0, 1);
        sb.h[I(x0, z0)] += g.vol * (1 - fx) * (1 - fz); sb.h[I(x0 + 1, z0)] += g.vol * fx * (1 - fz);
        sb.h[I(x0, z0 + 1)] += g.vol * (1 - fx) * fz; sb.h[I(x0 + 1, z0 + 1)] += g.vol * fx * fz;
        sb.ver++;
      } else keep.push(g);
    }
    sb.grains = keep;
  }

  // a finger pressed in: a round dent of radius r, depth d, pushed out to the rim
  function press(x, z, r = 4, d = 2.5) {
    const top = heightAt(x, z) - d + r;
    const bottom = (px, pz) => { const q = (px - x) ** 2 + (pz - z) ** 2; return q < r * r ? top - Math.sqrt(r * r - q) : Infinity; };
    const box = [x - r - 2, z - r - 2, x + r + 2, z + r + 2].map((v) => clamp(Math.round(v), 1, N - 2));
    const [moved] = displace(bottom, box, 0, x, z);
    if (moved > 0.5) on('press', { moved });
    return moved;
  }
  // smooth it all flat again (keeping the volume)
  function rake() {
    const v = volume() - sb.grains.reduce((a, g) => a + g.vol, 0);
    const lvl = v / (N * N);
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) sb.h[I(x, z)] = lvl + 0.35 * Math.sin(z * 0.9) * Math.sin(x * 0.05 + 0.4);
    // the wave is a raked pattern; put back the tiny volume it moved
    let now = 0; for (let i = 0; i < N * N; i++) now += sb.h[i];
    const fix = (v - now) / (N * N);
    for (let i = 0; i < N * N; i++) sb.h[i] += fix;
    for (const s of sb.shapes) if (s.state !== 'lift') lift(s.id);
    sb.ver++;
    on('rake', {});
  }
  function step(dt) {
    sb.t += dt;
    for (const s of sb.shapes) stepShape(s, dt);
    if (sb.shapes.some((s) => s.gone)) sb.shapes = sb.shapes.filter((s) => !s.gone);
    stepGrains(dt);
    relax(2);
  }
  function setWet(v) { sb.wet = clamp(+v || 0, 0, 1); }
  reset();
  Object.assign(sb, { step, drop, lift, shapeAt, press, rake, reset, volume, heightAt, under, setWet, talus });
  return sb;
}

// =====================================================================================
// ---------- the double pendulum ----------
// =====================================================================================
// The usual equations for two point masses on light rods, integrated with RK4 at a fixed
// small step. Friction is a drag on each joint. Ghosts are the same pendulum started
// 1e-3 rad apart; how quickly they leave the first one is the picture of chaos.
export function createPendulum({ on = () => {} } = {}) {
  const HZ = 600;
  const HIST = 600;
  const pd = {
    g: 9.81, friction: 0, l1: 1, l2: 1, m1: 1, m2: 1, ghosts: 4, trail: 1,
    bobs: [], t: 0, acc: 0, held: null, hist: [], sep: [], trace: [], paused: false,
  };
  function start(th1 = 2.2, th2 = 2.6) {
    pd.bobs = [];
    for (let k = 0; k <= pd.ghosts; k++) pd.bobs.push({ th1, th2: th2 + k * 1e-3, w1: 0, w2: 0 });
    pd.hist.length = 0; pd.sep.length = 0; pd.trace.length = 0; pd.t = 0;
  }
  function deriv(s) {
    const { g, l1, l2, m1, m2, friction } = pd;
    const d = s.th1 - s.th2, den = 2 * m1 + m2 - m2 * Math.cos(2 * d);
    const a1 = (-g * (2 * m1 + m2) * Math.sin(s.th1) - m2 * g * Math.sin(s.th1 - 2 * s.th2)
      - 2 * Math.sin(d) * m2 * (s.w2 * s.w2 * l2 + s.w1 * s.w1 * l1 * Math.cos(d))) / (l1 * den);
    const a2 = (2 * Math.sin(d) * (s.w1 * s.w1 * l1 * (m1 + m2) + g * (m1 + m2) * Math.cos(s.th1) + s.w2 * s.w2 * l2 * m2 * Math.cos(d))) / (l2 * den);
    return [s.w1, s.w2, a1 - friction * s.w1, a2 - friction * s.w2];
  }
  function rk4(s, h) {
    const add = (s0, k, f) => ({ th1: s0.th1 + k[0] * f, th2: s0.th2 + k[1] * f, w1: s0.w1 + k[2] * f, w2: s0.w2 + k[3] * f });
    const k1 = deriv(s), k2 = deriv(add(s, k1, h / 2)), k3 = deriv(add(s, k2, h / 2)), k4 = deriv(add(s, k3, h));
    s.th1 += h / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
    s.th2 += h / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
    s.w1 += h / 6 * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]);
    s.w2 += h / 6 * (k1[3] + 2 * k2[3] + 2 * k3[3] + k4[3]);
  }
  // positions, with the pivot at 0,0 and y down
  function joints(s) {
    const x1 = pd.l1 * Math.sin(s.th1), y1 = pd.l1 * Math.cos(s.th1);
    return [x1, y1, x1 + pd.l2 * Math.sin(s.th2), y1 + pd.l2 * Math.cos(s.th2)];
  }
  function energy(s = pd.bobs[0]) {
    const { g, l1, l2, m1, m2 } = pd;
    const [, y1, , y2] = joints(s);
    const v1 = l1 * s.w1;
    const v2x = l1 * s.w1 * Math.cos(s.th1) + l2 * s.w2 * Math.cos(s.th2), v2y = -l1 * s.w1 * Math.sin(s.th1) - l2 * s.w2 * Math.sin(s.th2);
    return 0.5 * m1 * v1 * v1 + 0.5 * m2 * (v2x * v2x + v2y * v2y) - m1 * g * y1 - m2 * g * y2;
  }
  let sample = 0;
  function step(dt) {
    if (pd.held || pd.paused) return;
    pd.acc += dt;
    const h = 1 / HZ;
    while (pd.acc >= h) {
      for (const b of pd.bobs) rk4(b, h);
      pd.acc -= h; pd.t += h;
      sample += h;
      if (sample >= 1 / 60) {
        sample = 0;
        const m = pd.bobs[0];
        pd.hist.push([wrapAngle(m.th1), wrapAngle(m.th2)]);
        if (pd.hist.length > HIST) pd.hist.shift();
        if (pd.bobs.length > 1) {
          const g = pd.bobs[1];
          const d = Math.hypot(wrapAngle(g.th1 - m.th1), wrapAngle(g.th2 - m.th2));
          pd.sep.push(Math.log10(Math.max(1e-9, d)));
          if (pd.sep.length > HIST) pd.sep.shift();
        }
        const [, , x2, y2] = joints(m);
        pd.trace.push([x2, y2]);
        if (pd.trace.length > 2400) pd.trace.shift();
      }
    }
  }
  // drag a bob: k is 1 or 2; (x, y) is where it is wanted, in rod lengths from the pivot
  function grab(k) { pd.held = k; }
  function moveTo(x, y) {
    if (!pd.held) return;
    const m = pd.bobs[0];
    if (pd.held === 1) m.th1 = Math.atan2(x, y);
    else { const [x1, y1] = joints(m); m.th2 = Math.atan2(x - x1, y - y1); }
    m.w1 = m.w2 = 0;
    for (let k = 1; k < pd.bobs.length; k++) Object.assign(pd.bobs[k], { th1: m.th1, th2: m.th2 + k * 1e-3, w1: 0, w2: 0 });
    pd.trace.length = 0;
  }
  function let_go() { if (pd.held) { pd.held = null; pd.hist.length = 0; pd.sep.length = 0; pd.t = 0; } }
  function set(k, v) {
    if (!(k in PEND_PARAMS)) return;
    const p = PEND_PARAMS[k];
    pd[k] = clamp(+v, p.min, p.max);
    if (k === 'ghosts') { const m = pd.bobs[0]; start(m.th1, m.th2); pd.bobs.forEach((b) => { b.w1 = m.w1; b.w2 = m.w2; }); }
  }
  start();
  Object.assign(pd, { step, start, joints, energy, grab, moveTo, let_go, set, deriv });
  return pd;
}
export const PEND_PARAMS = {
  g: { name: 'Gravity', min: 0.5, max: 25, step: 0.1, unit: 'm/s²' },
  friction: { name: 'Friction', min: 0, max: 0.6, step: 0.005, unit: '' },
  l2: { name: 'Lower rod', min: 0.3, max: 1.6, step: 0.01, unit: '×' },
  m2: { name: 'Lower mass', min: 0.2, max: 4, step: 0.05, unit: '×' },
  ghosts: { name: 'Ghosts', min: 0, max: 12, step: 1, unit: '' },
  trail: { name: 'Trail', min: 0, max: 1, step: 0.05, unit: '' },
};

// =====================================================================================
// ---------- the playground ----------
// =====================================================================================
export function createPlayground({ saved = null, rnd = Math.random, on = () => {} } = {}) {
  const emit = (toy) => (ev, d) => on(toy + ':' + ev, d);
  const toys = {
    gummy: createGummies({ rnd, on: emit('gummy') }),
    lava: createLava({ rnd, on: emit('lava') }),
    sand: createSandbox({ rnd, on: emit('sand') }),
    pendulum: createPendulum({ on: emit('pendulum') }),
  };
  const pg = { tab: 'gummy', toys };
  for (let i = 0; i < 5; i++) toys.gummy.addBear({ x: 170 + i * 215, y: 160 + (i % 2) * 90, colour: i, angle: (rnd() - 0.5) * 0.6 });

  function toSave() {
    const { gummy, lava, sand, pendulum } = toys;
    return {
      v: SAVE_VERSION, tab: pg.tab,
      gummy: { jiggle: gummy.jiggle },
      lava: { lamp: lava.lamp, gravity: lava.gravity },
      sand: { colour: sand.colour, wet: sand.wet },
      pendulum: Object.fromEntries(Object.keys(PEND_PARAMS).map((k) => [k, pendulum[k]])),
    };
  }
  function restore(s) {
    if (!s || s.v !== SAVE_VERSION) return false;
    const { gummy, lava, sand, pendulum } = toys;
    if (TOYS.includes(s.tab)) pg.tab = s.tab;
    if (s.gummy) gummy.setJiggle(s.gummy.jiggle);
    if (s.lava) { lava.lamp = !!s.lava.lamp; lava.gravity = clamp(+s.lava.gravity || 0, 0, 2); }
    if (s.sand) { sand.colour = clamp(s.sand.colour | 0, 0, SAND_COLOURS.length - 1); sand.setWet(s.sand.wet); }
    if (s.pendulum) for (const k of Object.keys(PEND_PARAMS)) if (s.pendulum[k] != null) pendulum.set(k, s.pendulum[k]);
    return true;
  }
  function setTab(t) { if (TOYS.includes(t)) pg.tab = t; }
  // only the toy on show runs
  function step(dt) { toys[pg.tab].step(dt); }
  if (saved) restore(saved);
  Object.assign(pg, { toSave, restore, setTab, step });
  return pg;
}
