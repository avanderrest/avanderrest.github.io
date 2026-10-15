/* Physics Playground: the rules. Seven toys, each a small physics of its own, none of them
   touching the page, so all of them run in Node:

     gummy     soft-body gummy bears: mass points held in shape by volume-preserving
               shape matching (Müller et al. 2005), so they squash, wobble and spring back
     lava      a gooey particle fluid (Clavet et al. 2005, double density relaxation),
               which gives it surface tension: slice a blob and it pulls itself back
               together. Heat at the bottom turns it into a lava lamp
     sand      kinetic sand in a tray: a height field that slumps past its angle of
               repose, and heavy shapes that sink in by the volume they push aside and
               leave their print behind; and a sand pendulum over it that draws figures
     pendulum  a double pendulum (RK4), with ghost copies started a hair apart to show
               how fast chaos pulls them away from each other
     ink       marbling (ebru): stable fluids on a grid carry ink outlines that never blur
     bubbles   soap bubbles from a wand or a breath, sticking together into foam
     curtain   two Verlet cloth curtains on a rail, to billow, tear and cut

   const pg = createPlayground({ saved, rnd, on })
     saved   what pg.toSave() returned last time (or null)
     rnd     the dice, a function giving [0, 1)
     on      on(event, data): 'gummy:bounce', 'sand:land', ... the page plays a sound,
             saves
   pg.toys.gummy / .lava / ... / .curtain each have step(dt) and verbs.
   Time is only ever what step(dt) is given. */

// ---------- constants ----------
export const TOYS = ['gummy', 'lava', 'sand', 'pendulum', 'ink', 'bubbles', 'curtain'];
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
// moves. Volume is kept exactly: sand in the tray plus grains in the air (plus whatever is
// left in the sand pendulum's funnel).
//
// The sand pendulum hangs over the tray from a Y of string (a Blackburn pendulum): it
// swings across with one length and along with another, so its path is a Lissajous figure
// that shrinks as friction takes it. Its funnel leaks sand of a second colour (the `tint`
// field, painted where it lands) in a line that draws the figure.
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
    N, h: new Float32Array(N * N), tint: new Float32Array(N * N), shapes: [], grains: [], t: 0, wet: 0.7, colour: 0, nextId: 1, volume0: 0, ver: 0,
    WALL: 30, DROP: 70,
    swing: { on: false, held: false, x: (N - 1) / 2, z: (N - 1) / 2, vx: 0, vz: 0, load: 0, ratio: 1.12, poured: 0 },
  };
  const SWING_W = 2.2;          // radians a second across; along is that times the ratio
  const SWING_DAMP = 0.045;     // per second
  const LOAD = 900;             // sand a full funnel holds
  const LEAK = 7;               // sand a second out of the funnel
  const TINT = 7;               // how much a unit of pendulum sand colours a cell (a pass or two covers it)
  const I = (x, z) => z * N + x;
  function reset() {
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      sb.h[I(x, z)] = BASE + 0.6 * Math.sin(x * 0.21 + 1.3) * Math.sin(z * 0.17) + (rnd() - 0.5) * 0.25;
    }
    sb.shapes.length = 0; sb.grains.length = 0; sb.tint.fill(0);
    sb.swing.load = 0; sb.swing.held = false;
    sb.volume0 = volume();
    sb.ver++;
  }
  function volume() {
    let v = 0;
    for (let i = 0; i < N * N; i++) v += sb.h[i];
    for (const g of sb.grains) v += g.vol;
    return v + sb.swing.load;
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
    const v = volume() - sb.grains.reduce((a, g) => a + g.vol, 0) - sb.swing.load;
    const lvl = v / (N * N);
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) sb.h[I(x, z)] = lvl + 0.35 * Math.sin(z * 0.9) * Math.sin(x * 0.05 + 0.4);
    // the wave is a raked pattern; put back the tiny volume it moved
    let now = 0; for (let i = 0; i < N * N; i++) now += sb.h[i];
    const fix = (v - now) / (N * N);
    for (let i = 0; i < N * N; i++) sb.h[i] += fix;
    for (const s of sb.shapes) if (s.state !== 'lift') lift(s.id);
    sb.tint.fill(0);
    sb.ver++;
    on('rake', {});
  }
  // ---------- the sand pendulum ----------
  const C = (N - 1) / 2;
  function hangSwing(onOff) {
    const w = sb.swing;
    w.on = !!onOff;
    if (!w.on) { w.held = false; return; }
    w.x = C; w.z = C; w.vx = w.vz = 0;
  }
  // hold the funnel at (x, z): it is topped up (that sand is new to the tray, so the
  // volume the tray should hold goes up with it)
  function swingHold(x, z) {
    const w = sb.swing;
    if (!w.on) hangSwing(true);
    w.held = true;
    w.x = clamp(x, 3, N - 4); w.z = clamp(z, 3, N - 4); w.vx = w.vz = 0;
    if (w.load < LOAD) { sb.volume0 += LOAD - w.load; w.load = LOAD; on('fill', {}); }
  }
  function swingLet(vx = 0, vz = 0) {
    const w = sb.swing;
    if (!w.held) return;
    w.held = false;
    w.vx = clamp(vx, -60, 60); w.vz = clamp(vz, -60, 60);
    on('swing', {});
  }
  function stepSwing(dt) {
    const w = sb.swing;
    if (!w.on || w.held) return;
    const wx = SWING_W, wz = SWING_W * w.ratio;
    w.vx += (-wx * wx * (w.x - C) - SWING_DAMP * 2 * w.vx) * dt;
    w.vz += (-wz * wz * (w.z - C) - SWING_DAMP * 2 * w.vz) * dt;
    w.x = clamp(w.x + w.vx * dt, 2, N - 3); w.z = clamp(w.z + w.vz * dt, 2, N - 3);
    const out = Math.min(w.load, LEAK * dt);
    if (out <= 0) return;
    w.load -= out; w.poured += out;
    const x0 = clamp(Math.floor(w.x), 1, N - 3), z0 = clamp(Math.floor(w.z), 1, N - 3), fx = clamp(w.x - x0, 0, 1), fz = clamp(w.z - z0, 0, 1);
    const cells = [[x0, z0, (1 - fx) * (1 - fz)], [x0 + 1, z0, fx * (1 - fz)], [x0, z0 + 1, (1 - fx) * fz], [x0 + 1, z0 + 1, fx * fz]];
    for (const [x, z, k] of cells) {
      const i = I(x, z);
      sb.h[i] += out * k;
      sb.tint[i] = Math.min(1, sb.tint[i] + out * k * TINT);
    }
    sb.ver++;
  }
  function setRatio(v) { sb.swing.ratio = clamp(+v || 1, 1, 1.6); }

  function step(dt) {
    sb.t += dt;
    stepSwing(dt);
    for (const s of sb.shapes) stepShape(s, dt);
    if (sb.shapes.some((s) => s.gone)) sb.shapes = sb.shapes.filter((s) => !s.gone);
    stepGrains(dt);
    relax(2);
  }
  function setWet(v) { sb.wet = clamp(+v || 0, 0, 1); }
  reset();
  Object.assign(sb, { step, drop, lift, shapeAt, press, rake, reset, volume, heightAt, under, setWet, talus, hangSwing, swingHold, swingLet, setRatio });
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
// ---------- marbled ink (ebru) ----------
// =====================================================================================
// Ink floats on thickened water. The water is Stam's stable fluids (1999) on a 120x75
// grid: a stylus or comb drawn through it sets the water moving, the velocity is carried
// along by itself and projected so it never piles up, and the size (the carrageenan that
// thickens real ebru water) stills it within a second or so. The ink is not a dye on the
// grid, which would blur within seconds: every drop is an outline whose corners ride the
// water, with corners added wherever an edge stretches, so a feathered line stays as sharp
// as the first drop. A new drop pushes every outline round it outward by exactly the area
// it takes up (Lu, Jaffer et al., "Mathematical marbling", 2012), which is what turns the
// drops under it into rings.
export const INK_COLOURS = [
  { name: 'Indigo', rgb: [42, 62, 128] },
  { name: 'Madder', rgb: [176, 44, 40] },
  { name: 'Ochre', rgb: [218, 160, 56] },
  { name: 'Olive', rgb: [98, 122, 60] },
  { name: 'Rose', rgb: [224, 136, 142] },
  { name: 'Lamp black', rgb: [34, 31, 34] },
  { name: 'Chalk', rgb: [248, 243, 230] },
];
export function createInk({ rnd = Math.random, on = () => {}, W = 1200, H = 750 } = {}) {
  const CELL = 10, NX = Math.round(W / CELL), NY = Math.round(H / CELL), SX = NX + 2;
  const SIZE = SX * (NY + 2);
  const ITER = 24;               // Gauss-Seidel passes in the projection
  const DAMP = 2.2;              // per second: how quickly the size stills the water
  const MAXE = 4.5, MINE = 1.2;  // the corner spacing kept along every outline
  const MAX_PTS = 90000;         // past this, outlines stop gaining corners
  const MAX_INKS = 500;
  const MAX_SPEED = 1500;
  const GROW = 70;               // a held drop's radius grows this much a second
  const MAX_R = 140;
  const ik = {
    W, H, NX, NY, CELL, u: new Float32Array(SIZE), v: new Float32Array(SIZE),
    inks: [], colour: 0, t: 0, nextId: 1, growing: null, points: 0, still: true, sweeping: null, queue: [],
  };
  const u0 = new Float32Array(SIZE), v0 = new Float32Array(SIZE), p = new Float32Array(SIZE), div = new Float32Array(SIZE);
  const IX = (i, j) => i + SX * j;
  let strokes = [];

  function bound(b, x) {
    for (let i = 1; i <= NX; i++) {
      x[IX(i, 0)] = b === 2 ? -x[IX(i, 1)] : x[IX(i, 1)];
      x[IX(i, NY + 1)] = b === 2 ? -x[IX(i, NY)] : x[IX(i, NY)];
    }
    for (let j = 1; j <= NY; j++) {
      x[IX(0, j)] = b === 1 ? -x[IX(1, j)] : x[IX(1, j)];
      x[IX(NX + 1, j)] = b === 1 ? -x[IX(NX, j)] : x[IX(NX, j)];
    }
    x[IX(0, 0)] = 0.5 * (x[IX(1, 0)] + x[IX(0, 1)]);
    x[IX(0, NY + 1)] = 0.5 * (x[IX(1, NY + 1)] + x[IX(0, NY)]);
    x[IX(NX + 1, 0)] = 0.5 * (x[IX(NX, 0)] + x[IX(NX + 1, 1)]);
    x[IX(NX + 1, NY + 1)] = 0.5 * (x[IX(NX, NY + 1)] + x[IX(NX + 1, NY)]);
  }
  // grid units: cell (i, j) has its centre at ((i - 0.5) * CELL, (j - 0.5) * CELL)
  function sample(f, gx, gy) {
    gx = clamp(gx, 0.5, NX + 0.5); gy = clamp(gy, 0.5, NY + 0.5);
    const i0 = gx | 0, j0 = gy | 0, s = gx - i0, t = gy - j0;
    return (1 - s) * ((1 - t) * f[IX(i0, j0)] + t * f[IX(i0, j0 + 1)]) + s * ((1 - t) * f[IX(i0 + 1, j0)] + t * f[IX(i0 + 1, j0 + 1)]);
  }
  function advect(b, d, d0, dt) {
    const k = dt / CELL;
    for (let j = 1; j <= NY; j++) for (let i = 1; i <= NX; i++) {
      const c = IX(i, j);
      d[c] = sample(d0, i - k * u0[c], j - k * v0[c]);
    }
    bound(b, d);
  }
  function project() {
    const { u, v } = ik;
    for (let j = 1; j <= NY; j++) for (let i = 1; i <= NX; i++) {
      const c = IX(i, j);
      div[c] = -0.5 * (u[c + 1] - u[c - 1] + v[c + SX] - v[c - SX]);
      p[c] = 0;
    }
    bound(0, div); bound(0, p);
    for (let k = 0; k < ITER; k++) {
      for (let j = 1; j <= NY; j++) for (let i = 1; i <= NX; i++) {
        const c = IX(i, j);
        p[c] = (div[c] + p[c - 1] + p[c + 1] + p[c - SX] + p[c + SX]) / 4;
      }
      bound(0, p);
    }
    for (let j = 1; j <= NY; j++) for (let i = 1; i <= NX; i++) {
      const c = IX(i, j);
      u[c] -= 0.5 * (p[c + 1] - p[c - 1]); v[c] -= 0.5 * (p[c + SX] - p[c - SX]);
    }
    bound(1, u); bound(2, v);
  }
  // the water's velocity at a point, in world units a second
  function velocity(x, y) { const gx = x / CELL + 0.5, gy = y / CELL + 0.5; return [sample(ik.u, gx, gy), sample(ik.v, gx, gy)]; }

  // a stylus tip drawn from (x0, y0) to (x1, y1): the water within r goes along with it
  function stylus(x0, y0, x1, y1, r = 11) { strokes.push([x0, y0, x1, y1, r]); }
  // a comb: tines `gap` apart across the direction it is drawn
  function comb(x0, y0, x1, y1, tines = 9, gap = 46, r = 9) {
    const dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy);
    if (d < 1e-3) return;
    const nx = -dy / d, ny = dx / d;
    for (let k = 0; k < tines; k++) {
      const o = (k - (tines - 1) / 2) * gap;
      stylus(x0 + nx * o, y0 + ny * o, x1 + nx * o, y1 + ny * o, r);
    }
  }
  function applyStrokes(dt) {
    const { u, v } = ik;
    for (const [x0, y0, x1, y1, r] of strokes) {
      let sx = (x1 - x0) / dt, sy = (y1 - y0) / dt;
      const sp = Math.hypot(sx, sy);
      if (sp > MAX_SPEED) { sx *= MAX_SPEED / sp; sy *= MAX_SPEED / sp; }
      const L2 = (x1 - x0) ** 2 + (y1 - y0) ** 2;
      const i0 = Math.max(1, Math.floor((Math.min(x0, x1) - r) / CELL)), i1 = Math.min(NX, Math.ceil((Math.max(x0, x1) + r) / CELL) + 1);
      const j0 = Math.max(1, Math.floor((Math.min(y0, y1) - r) / CELL)), j1 = Math.min(NY, Math.ceil((Math.max(y0, y1) + r) / CELL) + 1);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const cx = (i - 0.5) * CELL, cy = (j - 0.5) * CELL;
        const t = L2 ? clamp(((cx - x0) * (x1 - x0) + (cy - y0) * (y1 - y0)) / L2, 0, 1) : 0;
        const d = Math.hypot(cx - (x0 + (x1 - x0) * t), cy - (y0 + (y1 - y0) * t));
        if (d >= r + CELL * 0.5) continue;
        const w = clamp(1 - d / (r + CELL * 0.5), 0, 1);
        const c = IX(i, j), k = 0.9 * w * w * (3 - 2 * w);
        u[c] += (sx - u[c]) * k; v[c] += (sy - v[c]) * k;
      }
    }
    strokes = [];
  }

  // ---------- the ink ----------
  function circle(cx, cy, r) {
    const n = Math.max(40, Math.ceil(TAU * r / 3.2)), pts = new Array(n * 2);
    for (let k = 0; k < n; k++) { const a = k / n * TAU; pts[k * 2] = cx + Math.cos(a) * r; pts[k * 2 + 1] = cy + Math.sin(a) * r; }
    return pts;
  }
  // push every outline (but `skip`) out from (cx, cy) as a drop of area pi*dA lands there
  function spread(cx, cy, dA, skip) {
    for (const ink of ik.inks) {
      if (ink === skip) continue;
      const P = ink.pts;
      for (let k = 0; k < P.length; k += 2) {
        const dx = P[k] - cx, dy = P[k + 1] - cy;
        const d2 = Math.max(1e-6, dx * dx + dy * dy), f = Math.sqrt(1 + dA / d2);
        P[k] = clamp(cx + dx * f, 0, W); P[k + 1] = clamp(cy + dy * f, 0, H);
      }
    }
  }
  function drop(x, y, r = 18, colour = ik.colour) {
    release();
    x = clamp(x, 2, W - 2); y = clamp(y, 2, H - 2);
    spread(x, y, r * r, null);
    const ink = { id: ik.nextId++, c: clamp(colour | 0, 0, INK_COLOURS.length - 1), pts: circle(x, y, r) };
    ik.inks.push(ink);
    while (ik.inks.length > MAX_INKS) ik.inks.shift();
    ik.growing = { ink, x, y, r };
    on('drop', { x, y, r, colour: ink.c });
    return ink;
  }
  // a held drop keeps spreading
  function grow(dt) {
    const gr = ik.growing;
    if (!gr) return;
    const r = Math.min(MAX_R, gr.r + GROW * dt * (40 / (gr.r + 22)));
    if (r <= gr.r) return;
    spread(gr.x, gr.y, r * r - gr.r * gr.r, gr.ink);
    gr.r = r; gr.ink.pts = circle(gr.x, gr.y, r);
  }
  function release() { ik.growing = null; }
  // keep every outline's corners between MINE and MAXE apart
  function refine() {
    let total = 0;
    for (const ink of ik.inks) total += ink.pts.length / 2;
    for (const ink of ik.inks) {
      const P = ink.pts, n = P.length / 2;
      let need = false;
      for (let k = 0; k < n && !need; k++) {
        const a = k * 2, b = ((k + 1) % n) * 2;
        const d = Math.hypot(P[b] - P[a], P[b + 1] - P[a + 1]);
        if (d > MAXE && total < MAX_PTS) need = true; else if (d < MINE && n > 24) need = true;
      }
      if (!need) continue;
      const out = [];
      for (let k = 0; k < n; k++) {
        const a = k * 2, b = ((k + 1) % n) * 2;
        const ax = P[a], ay = P[a + 1];
        const d = Math.hypot(P[b] - ax, P[b + 1] - ay);
        if (d < MINE && n > 24 && k + 1 < n) {
          // drop the next corner if that leaves no long edge
          const c = ((k + 2) % n) * 2;
          if (Math.hypot(P[c] - ax, P[c + 1] - ay) < MAXE) { out.push(ax, ay); k++; continue; }
        }
        out.push(ax, ay);
        if (d > MAXE && total < MAX_PTS) {
          const m = Math.min(8, Math.ceil(d / MAXE));
          for (let s = 1; s < m; s++) out.push(ax + (P[b] - ax) * s / m, ay + (P[b + 1] - ay) * s / m);
          total += m - 1;
        }
      }
      ink.pts = out;
    }
    ik.points = 0;
    for (const ink of ik.inks) ik.points += ink.pts.length / 2;
  }
  // the corners ride the water (midpoint rule). This is the hot loop, so the lookup is
  // written out here with no arrays made
  function carry(dt) {
    const { u, v } = ik;
    let vx = 0, vy = 0;
    const look = (x, y) => {
      const gx = clamp(x / CELL + 0.5, 0.5, NX + 0.5), gy = clamp(y / CELL + 0.5, 0.5, NY + 0.5);
      const i0 = gx | 0, j0 = gy | 0, s = gx - i0, t = gy - j0, c = i0 + SX * j0;
      const w00 = (1 - s) * (1 - t), w01 = (1 - s) * t, w10 = s * (1 - t), w11 = s * t;
      vx = w00 * u[c] + w01 * u[c + SX] + w10 * u[c + 1] + w11 * u[c + SX + 1];
      vy = w00 * v[c] + w01 * v[c + SX] + w10 * v[c + 1] + w11 * v[c + SX + 1];
    };
    for (const ink of ik.inks) {
      const P = ink.pts;
      for (let k = 0; k < P.length; k += 2) {
        const x = P[k], y = P[k + 1];
        look(x, y);
        if (vx * vx + vy * vy < 1e-4) continue;
        look(x + vx * dt * 0.5, y + vy * dt * 0.5);
        P[k] = clamp(x + vx * dt, 0, W); P[k + 1] = clamp(y + vy * dt, 0, H);
      }
    }
  }
  // a comb drawn across the whole tray by itself, the way a gelgit or a nonpareil is made
  function sweep(dir = 'down', gap = 50) {
    ik.sweeping = { dir, gap, pos: -20, speed: 520 };
    on('sweep', { dir });
  }
  function stepSweep(dt) {
    const s = ik.sweeping;
    if (!s) return;
    const from = s.pos, to = s.pos + s.speed * dt;
    s.pos = to;
    if (s.dir === 'down' || s.dir === 'up') {
      const f = s.dir === 'down' ? (y) => y : (y) => H - y;
      for (let x = s.gap / 2; x < W; x += s.gap) stylus(x, f(from), x, f(to), 8);
      if (to > H + 20) ik.sweeping = null;
    } else {
      const f = s.dir === 'right' ? (x) => x : (x) => W - x;
      for (let y = s.gap / 2; y < H; y += s.gap) stylus(f(from), y, f(to), y, 8);
      if (to > W + 20) ik.sweeping = null;
    }
  }
  // a stone (battal) ground: drops of a few colours scattered over the tray, a few at a time
  function sprinkle(n = 40, colours) {
    const pal = colours || [ik.colour, (ik.colour + 2) % 5, (ik.colour + 4) % 5];
    for (let k = 0; k < n; k++) ik.queue.push({ at: k * 0.03, x: 30 + rnd() * (W - 60), y: 30 + rnd() * (H - 60), r: 34 + rnd() * 40, c: pal[k % pal.length] });
    ik.queueT = 0;
  }
  function clear() {
    ik.inks = []; ik.growing = null; ik.queue = []; ik.sweeping = null;
    ik.u.fill(0); ik.v.fill(0); ik.points = 0;
    on('clear', {});
  }
  function maxSpeed() { let m = 0; for (let c = 0; c < SIZE; c++) m = Math.max(m, Math.abs(ik.u[c]), Math.abs(ik.v[c])); return m; }
  function area(ink) {
    const P = ink.pts; let A = 0;
    for (let k = 0; k < P.length; k += 2) { const b = (k + 2) % P.length; A += P[k] * P[b + 1] - P[b] * P[k + 1]; }
    return Math.abs(A / 2);
  }
  function perimeter(ink) {
    const P = ink.pts; let L = 0;
    for (let k = 0; k < P.length; k += 2) { const b = (k + 2) % P.length; L += Math.hypot(P[b] - P[k], P[b + 1] - P[k + 1]); }
    return L;
  }

  function step(dt) {
    ik.t += dt;
    if (ik.queue.length) {
      ik.queueT = (ik.queueT || 0) + dt;
      while (ik.queue.length && ik.queue[0].at <= ik.queueT) { const q = ik.queue.shift(); drop(q.x, q.y, q.r, q.c); release(); }
    }
    grow(dt);
    stepSweep(dt);
    const moving = strokes.length > 0 || !ik.still;
    if (!moving) return;
    applyStrokes(dt);
    const { u, v } = ik;
    const k = Math.exp(-DAMP * dt);
    for (let c = 0; c < SIZE; c++) { u[c] *= k; v[c] *= k; }
    project();
    u0.set(u); v0.set(v);
    advect(1, u, u0, dt); advect(2, v, v0, dt);
    project();
    carry(dt);
    refine();
    // when the water has all but stopped, stop stepping it
    const m = maxSpeed();
    ik.still = m < 0.6;
    if (ik.still) { u.fill(0); v.fill(0); }
  }
  Object.assign(ik, { step, drop, grow, release, stylus, comb, sweep, sprinkle, clear, velocity, maxSpeed, area, perimeter });
  return ik;
}

// =====================================================================================
// ---------- soap bubbles ----------
// =====================================================================================
// Bubbles are circles that drift, sink a little, and catch the air. Two that touch stick
// (a shared wall pulls their centres to a set overlap) and only come apart if pulled well
// past touching, so they gather into foam. A wand waved through the air stretches a film
// that swells with the speed of the wave and lets go when it is as big as that speed
// allows: slow sweeps make big bubbles, quick ones a stream of small ones. Breath (the
// microphone) does the same at the wand on its stand. Each bubble lives a while, then pops.
export function createBubbles({ rnd = Math.random, on = () => {}, W = 1200, H = 750 } = {}) {
  const FLOOR = H - 40;
  const SINK = 10, DRAG = 0.9;
  const STICK = 0.84, LET_GO = 1.22;  // the centres' distance as a share of the radii summed
  const MAX = 140;
  const STAND = { x: 150, y: H - 190 };
  const bb = {
    W, H, FLOOR, STAND, bubbles: [], links: new Set(), wind: 0.25, t: 0, nextId: 1,
    wand: { down: false, x: 0, y: 0, lx: 0, ly: 0, speed: 0, dx: 1, dy: 0 }, film: null, breath: 0, gusts: [], popped: 0, made: 0,
  };
  const key = (a, b) => (a.id < b.id ? a.id + ':' + b.id : b.id + ':' + a.id);
  function make(x, y, r, vx = 0, vy = 0) {
    const b = { id: bb.nextId++, x, y, r, vx, vy, born: bb.t, life: 16 + rnd() * 40 * Math.min(1, 40 / r), landed: false, swirl: rnd() * TAU };
    bb.bubbles.push(b); bb.made++;
    while (bb.bubbles.length > MAX) pop(bb.bubbles[0], true);
    on('made', { r });
    return b;
  }
  function pop(b, quiet = false) {
    const i = bb.bubbles.indexOf(b);
    if (i < 0) return false;
    bb.bubbles.splice(i, 1);
    for (const k of [...bb.links]) { const [a, c] = k.split(':'); if (+a === b.id || +c === b.id) bb.links.delete(k); }
    bb.popped++;
    if (!quiet) on('pop', { x: b.x, y: b.y, r: b.r });
    return true;
  }
  function popAt(x, y) {
    for (let i = bb.bubbles.length - 1; i >= 0; i--) {
      const b = bb.bubbles[i];
      if (Math.hypot(b.x - x, b.y - y) < b.r + 4) return pop(b);
    }
    return false;
  }
  function popAll() { for (const b of [...bb.bubbles]) pop(b); }

  // ---------- the wand ----------
  function wandDown(x, y) { Object.assign(bb.wand, { down: true, x, y, lx: x, ly: y, speed: 0 }); bb.film = null; }
  function wandTo(x, y) { bb.wand.x = x; bb.wand.y = y; }
  function wandUp() {
    bb.wand.down = false;
    const f = bb.film;
    if (f && f.r >= 10) make(f.x, f.y, f.r, bb.wand.dx * bb.wand.speed * 0.2, bb.wand.dy * bb.wand.speed * 0.2);
    bb.film = null;
  }
  function stepWand(dt) {
    const w = bb.wand;
    if (w.down) {
      const dx = w.x - w.lx, dy = w.y - w.ly, d = Math.hypot(dx, dy);
      w.speed += (d / dt - w.speed) * 0.35;
      if (d > 0.5) { w.dx = dx / d; w.dy = dy / d; }
      w.lx = w.x; w.ly = w.y;
      if (d > 0.5) bb.gusts.push({ x: w.x, y: w.y, vx: dx / dt * 0.5, vy: dy / dt * 0.5, r: 70 });
      inflate(w.x, w.y, -w.dx, -w.dy, w.speed, dt, w.dx * w.speed * 0.25, w.dy * w.speed * 0.25);
    }
    // breath at the stand: blows towards the upper right
    if (bb.breath > 0.08 && !w.down) {
      const s = bb.breath * 700;
      inflate(STAND.x, STAND.y, 0.6, -0.8, s, dt, 0.6 * s * 0.35, -0.8 * s * 0.35);
      bb.gusts.push({ x: STAND.x + 40, y: STAND.y - 40, vx: 0.6 * s * 0.6, vy: -0.8 * s * 0.6, r: 160 });
    } else if (!w.down && bb.film && bb.film.atStand) { if (bb.film.r >= 10) make(bb.film.x, bb.film.y, bb.film.r, 30, -40); bb.film = null; }
  }
  // the film in the wand swells with the speed of the air through it; it lets go at the
  // biggest size that speed allows (a slow wave allows a big one)
  function inflate(x, y, bx, by, speed, dt, vx, vy) {
    if (speed < 40) return;
    const atStand = !bb.wand.down;
    if (!bb.film || bb.film.atStand !== atStand) bb.film = { r: 0, x, y, atStand, rmax: atStand ? 26 + rnd() * 70 : 0 };
    const f = bb.film;
    const rmax = atStand ? f.rmax : clamp(11000 / speed, 18, 110);
    f.r += 7 * Math.sqrt(speed) * dt;
    f.x = x + bx * f.r * 0.9; f.y = y + by * f.r * 0.9;
    if (f.r >= rmax) {
      make(f.x, f.y, Math.min(f.r, rmax), vx, vy);
      bb.film = null;
    }
  }

  function step(dt) {
    bb.t += dt;
    stepWand(dt);
    const bs = bb.bubbles;
    const drag = Math.exp(-DRAG * dt);
    for (const b of bs) {
      if (b.landed) { b.vx *= 0.8; b.vy = 0; continue; }
      // the breeze, which wanders
      const gust = bb.wind * 40 * (0.6 + 0.4 * Math.sin(bb.t * 0.7 + b.id * 1.7)), lift = 6 * Math.sin(bb.t * 1.1 + b.id);
      b.vx += (gust - b.vx) * 0.25 * dt;
      b.vy += (SINK - lift * 0.5) * dt;
      for (const g of bb.gusts) {
        const d = Math.hypot(b.x - g.x, b.y - g.y);
        if (d < g.r + b.r) { const k = (1 - d / (g.r + b.r)) * 0.18; b.vx += (g.vx - b.vx) * k; b.vy += (g.vy - b.vy) * k; }
      }
      b.vx *= drag; b.vy *= drag;
    }
    bb.gusts = [];
    for (const b of bs) { b.x += b.vx * dt; b.y += b.vy * dt; }
    // foam: touching bubbles stick, and are held at a shared wall
    for (let it = 0; it < 2; it++) {
      for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
        const a = bs[i], c = bs[j];
        const S = a.r + c.r, dx = c.x - a.x, dy = c.y - a.y;
        if (Math.abs(dx) > S * LET_GO || Math.abs(dy) > S * LET_GO) continue;
        const d = Math.hypot(dx, dy) || 0.01, k = key(a, c);
        const linked = bb.links.has(k);
        if (!linked && d < S) { bb.links.add(k); on('stick', {}); }
        else if (linked && d > S * LET_GO) { bb.links.delete(k); continue; }
        if (!bb.links.has(k)) continue;
        const want = S * STICK, err = (d - want) / d * 0.35;
        // the smaller bubble gives way more
        const ma = a.landed ? 0 : a.r * a.r, mc = c.landed ? 0 : c.r * c.r;
        if (ma + mc === 0) continue;
        const wa = mc / (ma + mc), wc = ma / (ma + mc);
        a.x += dx * err * wa; a.y += dy * err * wa; c.x -= dx * err * wc; c.y -= dy * err * wc;
        if (it === 0) {
          // stuck together, they drift as one
          const mx = (a.vx * ma + c.vx * mc) / (ma + mc || 1), my = (a.vy * ma + c.vy * mc) / (ma + mc || 1);
          if (!a.landed) { a.vx += (mx - a.vx) * 0.08; a.vy += (my - a.vy) * 0.08; }
          if (!c.landed) { c.vx += (mx - c.vx) * 0.08; c.vy += (my - c.vy) * 0.08; }
        }
      }
    }
    // walls, ceiling, and the wet table, where a bubble lands as a dome
    for (const b of [...bs]) {
      if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx) * 0.3; }
      if (b.x > W - b.r) { b.x = W - b.r; b.vx = -Math.abs(b.vx) * 0.3; }
      if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy) * 0.3; }
      if (b.y > FLOOR - b.r * 0.15 && !b.landed) { b.landed = true; b.y = FLOOR; b.life = Math.min(b.life, bb.t - b.born + 6 + rnd() * 10); on('land', { r: b.r }); }
      if (b.landed) b.y = FLOOR;
      if (bb.t - b.born > b.life) pop(b);
    }
  }
  function setWind(v) { bb.wind = clamp(+v || 0, 0, 1); }
  function blow(level) { bb.breath = clamp(+level || 0, 0, 1); }
  // the bubbles in contact with b (for drawing their shared walls)
  function touching(b) { return bb.bubbles.filter((c) => c !== b && Math.hypot(c.x - b.x, c.y - b.y) < (b.r + c.r) * 0.999); }
  Object.assign(bb, { step, make, pop, popAt, popAll, wandDown, wandTo, wandUp, setWind, blow, touching, MAX });
  return bb;
}

// =====================================================================================
// ---------- the curtain ----------
// =====================================================================================
// Two curtains of Verlet cloth (Jakobsen 2001) on a rail, in 3D seen from the front, so
// the wind can billow them towards you and their folds take the light. Each is a grid of
// points held by threads: along and across (structural), corner to corner (shear) and one
// further on (bending, kept weak so the cloth drapes). The top row are rings that slide
// along the rail, so a curtain can be drawn open and bunches up. A thread pulled to more
// than TEAR times its length snaps, and the blade cuts every thread it crosses; a shear or
// bending thread goes when a structural one it spans has gone.
export function createCurtain({ rnd = Math.random, on = () => {}, W = 1200, H = 750 } = {}) {
  const COLS = 24, ROWS = 30, S = 18, GATHER = 0.82;
  const RAIL = 92, RX0 = 150, RX1 = 1050, FLOOR = H - 22;
  const G = 1300, SUB = 3, ITER = 8, TEAR = 2.4;
  const NP = COLS * ROWS * 2;
  const ct = {
    W, H, COLS, ROWS, S, RAIL, RX0, RX1, FLOOR, n: NP,
    x: new Float32Array(NP), y: new Float32Array(NP), z: new Float32Array(NP), px: new Float32Array(NP), py: new Float32Array(NP), pz: new Float32Array(NP),
    ring: new Uint8Array(NP), pleat: new Float32Array(NP),
    cons: [], quads: [], held: null, wind: 0.3, gust: 0, t: 0, torn: 0, cut: 0,
  };
  const at = (panel, c, r) => panel * COLS * ROWS + r * COLS + c;
  function hang() {
    ct.cons = []; ct.quads = []; ct.held = null; ct.torn = 0; ct.cut = 0;
    const span = (COLS - 1) * S * GATHER;
    for (let panel = 0; panel < 2; panel++) {
      const x0 = panel === 0 ? RX0 + 20 : RX1 - 20 - span;
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const i = at(panel, c, r);
        const pl = (c % 2 ? 1 : -1) * 7;
        ct.ring[i] = r === 0 ? 1 : 0; ct.pleat[i] = pl;
        ct.x[i] = ct.px[i] = x0 + c * S * GATHER;
        ct.y[i] = ct.py[i] = RAIL + r * S * 0.98;
        ct.z[i] = ct.pz[i] = pl * (1 - r / ROWS * 0.4) + (rnd() - 0.5) * 0.5;
      }
      // the cloth is S a square at rest; it hangs gathered to GATHER of that across, so it
      // falls into folds. The rings' rope (kind 3) is S long.
      const link = (a, b, kind, rest, deps) => { ct.cons.push({ a, b, kind, rest, alive: true, deps }); return ct.cons.length - 1; };
      const hz = [], vt = [];
      for (let r = 0; r < ROWS; r++) for (let c = 0; c + 1 < COLS; c++) hz[r * COLS + c] = link(at(panel, c, r), at(panel, c + 1, r), r === 0 ? 3 : 0, S);
      for (let r = 0; r + 1 < ROWS; r++) for (let c = 0; c < COLS; c++) vt[r * COLS + c] = link(at(panel, c, r), at(panel, c, r + 1), 0, S);
      for (let r = 0; r + 1 < ROWS; r++) for (let c = 0; c + 1 < COLS; c++) {
        const e = [hz[r * COLS + c], hz[(r + 1) * COLS + c], vt[r * COLS + c], vt[r * COLS + c + 1]];
        const a = at(panel, c, r), b = at(panel, c + 1, r), d = at(panel, c, r + 1), f = at(panel, c + 1, r + 1);
        link(a, f, 1, S * Math.SQRT2, e); link(b, d, 1, S * Math.SQRT2, e);
        ct.quads.push({ p: [a, b, f, d], e, panel, c, r });
      }
      for (let r = 1; r < ROWS; r++) for (let c = 0; c + 2 < COLS; c++) link(at(panel, c, r), at(panel, c + 2, r), 2, S * 2, [hz[r * COLS + c], hz[r * COLS + c + 1]]);
      for (let r = 0; r + 2 < ROWS; r++) for (let c = 0; c < COLS; c++) link(at(panel, c, r), at(panel, c, r + 2), 2, S * 2, [vt[r * COLS + c], vt[(r + 1) * COLS + c]]);
    }
    on('hang', {});
  }
  const STIFF = [1, 0.5, 0.12, 1];
  const RING = 7;          // how close two rings can bunch
  function solve() {
    const X = ct.x, Y = ct.y, Z = ct.z, held = ct.held;
    for (const k of ct.cons) {
      if (!k.alive) continue;
      const a = k.a, b = k.b;
      const dx = X[b] - X[a], dy = Y[b] - Y[a], dz = Z[b] - Z[a], d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
      let rest = k.rest;
      // the rings' rope only pulls; bunched up, the rings just sit side by side
      if (k.kind === 3) { if (d < RING) rest = RING; else if (d <= k.rest) continue; }
      // the cloth hangs from the rings but cannot slide them: only the rope and a hand can
      const wa = (held && held.i === a) || (ct.ring[a] && k.kind !== 3) ? 0 : 1, wb = (held && held.i === b) || (ct.ring[b] && k.kind !== 3) ? 0 : 1;
      if (!wa && !wb) continue;
      const f = (d - rest) / d * STIFF[k.kind] / (wa + wb);
      X[a] += dx * f * wa; Y[a] += dy * f * wa; Z[a] += dz * f * wa;
      X[b] -= dx * f * wb; Y[b] -= dy * f * wb; Z[b] -= dz * f * wb;
    }
    for (let i = 0; i < NP; i++) if (ct.ring[i]) { Y[i] = RAIL; Z[i] = ct.pleat[i]; X[i] = clamp(X[i], RX0, RX1); }
    if (held) { X[held.i] = held.tx; if (!ct.ring[held.i]) Y[held.i] = held.ty; }
  }
  function kill(k, why) {
    if (!k.alive) return;
    k.alive = false;
    if (why === 'tear') ct.torn++; else ct.cut++;
  }
  function tidy() {
    for (const k of ct.cons) if (k.alive && k.deps && k.deps.some((d) => !ct.cons[d].alive)) k.alive = false;
  }
  function step(dt) {
    ct.t += dt;
    ct.gust = Math.max(0, ct.gust - dt * 0.8);
    const h = dt / SUB, X = ct.x, Y = ct.y, Z = ct.z, PX = ct.px, PY = ct.py, PZ = ct.pz;
    let tore = 0;
    for (let s = 0; s < SUB; s++) {
      const t = ct.t + s * h;
      const blow = (ct.wind + ct.gust) * 900;
      for (let i = 0; i < NP; i++) {
        const vx = (X[i] - PX[i]) * 0.993, vy = (Y[i] - PY[i]) * 0.993, vz = (Z[i] - PZ[i]) * 0.993;
        PX[i] = X[i]; PY[i] = Y[i]; PZ[i] = Z[i];
        if (ct.ring[i]) continue;
        // the breeze comes in at the window, behind the curtains, in waves
        const wave = 0.55 + 0.45 * Math.sin(t * 2.1 + X[i] * 0.011 - Y[i] * 0.006) * Math.sin(t * 0.73 + X[i] * 0.004);
        X[i] += vx + 0.18 * blow * wave * Math.sin(t * 0.9 + Y[i] * 0.01) * h * h;
        Y[i] += vy + G * h * h;
        Z[i] += vz + blow * wave * h * h;
        if (Y[i] > FLOOR) { Y[i] = FLOOR; X[i] = PX[i] + (X[i] - PX[i]) * 0.5; Z[i] = PZ[i] + (Z[i] - PZ[i]) * 0.5; }
      }
      for (let it = 0; it < ITER; it++) solve();
      for (const k of ct.cons) {
        if (!k.alive || k.kind !== 0) continue;
        const d = Math.hypot(X[k.b] - X[k.a], Y[k.b] - Y[k.a], Z[k.b] - Z[k.a]);
        if (d > k.rest * TEAR) { kill(k, 'tear'); tore++; }
      }
    }
    if (tore) { tidy(); on('tear', { n: tore }); }
  }
  // the nearest point to (x, y) on screen within reach, front-most first
  function grab(x, y, reach = 30) {
    const hanging = attached();
    let best = -1, bd = reach;
    for (let i = 0; i < NP; i++) {
      const d = Math.hypot(ct.x[i] - x, ct.y[i] - y) - ct.z[i] * 0.05;
      if (d < bd && hanging[i]) { bd = d; best = i; }
    }
    if (best < 0) return false;
    ct.held = { i: best, tx: x, ty: y };
    on('grab', { ring: !!ct.ring[best] });
    return true;
  }
  // which points still hang by a thread (a loose scrap is not worth grabbing)
  function attached() {
    const ok = new Uint8Array(NP);
    for (const k of ct.cons) if (k.alive && k.kind === 0) { ok[k.a] = 1; ok[k.b] = 1; }
    for (let i = 0; i < NP; i++) if (ct.ring[i]) ok[i] = 1;
    return ok;
  }
  function drag(x, y) { if (ct.held) { ct.held.tx = clamp(x, 0, W); ct.held.ty = clamp(y, 0, H); } }
  function release() { ct.held = null; }
  // the blade from (x0, y0) to (x1, y1) cuts every thread it crosses
  function slash(x0, y0, x1, y1) {
    let n = 0;
    for (const k of ct.cons) {
      if (!k.alive || k.kind === 2) continue;
      if (crosses(x0, y0, x1, y1, ct.x[k.a], ct.y[k.a], ct.x[k.b], ct.y[k.b])) { kill(k, 'cut'); n++; }
    }
    if (n) { tidy(); on('cut', { n }); }
    return n;
  }
  function puff(power = 1) { ct.gust = clamp(power, 0, 2); on('gust', { power }); }
  function setWind(v) { ct.wind = clamp(+v || 0, 0, 1); }
  function maxSpeed() { let m = 0; for (let i = 0; i < NP; i++) m = Math.max(m, Math.hypot(ct.x[i] - ct.px[i], ct.y[i] - ct.py[i], ct.z[i] - ct.pz[i])); return m * 60 * SUB; }
  hang();
  Object.assign(ct, { step, hang, grab, drag, release, slash, puff, setWind, maxSpeed, at, attached });
  return ct;
}
function crosses(ax, ay, bx, by, cx, cy, dx, dy) {
  const d1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax), d2 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
  const d3 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx), d4 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

// =====================================================================================
// ---------- the playground ----------
// =====================================================================================
export function createPlayground({ saved = null, rnd = Math.random, on = () => {} } = {}) {
  // quiet while it is being built: the page is not listening yet
  let live = false;
  const emit = (toy) => (ev, d) => { if (live) on(toy + ':' + ev, d); };
  const toys = {
    gummy: createGummies({ rnd, on: emit('gummy') }),
    lava: createLava({ rnd, on: emit('lava') }),
    sand: createSandbox({ rnd, on: emit('sand') }),
    pendulum: createPendulum({ on: emit('pendulum') }),
  };
  const pg = { tab: 'gummy', toys };
  for (let i = 0; i < 5; i++) toys.gummy.addBear({ x: 170 + i * 215, y: 160 + (i % 2) * 90, colour: i, angle: (rnd() - 0.5) * 0.6 });
  // the later toys roll their dice after the bears, so the bears are as they always were
  Object.assign(toys, {
    ink: createInk({ rnd, on: emit('ink') }),
    bubbles: createBubbles({ rnd, on: emit('bubbles') }),
    curtain: createCurtain({ rnd, on: emit('curtain') }),
  });
  // a stone ground in the ink tray to start from, rather than an empty one
  toys.ink.sprinkle(80, [0, 2, 1, 6]);
  toys.ink.step(3);

  function toSave() {
    const { gummy, lava, sand, pendulum, ink, bubbles, curtain } = toys;
    return {
      v: SAVE_VERSION, tab: pg.tab,
      gummy: { jiggle: gummy.jiggle },
      lava: { lamp: lava.lamp, gravity: lava.gravity },
      sand: { colour: sand.colour, wet: sand.wet, ratio: sand.swing.ratio },
      pendulum: Object.fromEntries(Object.keys(PEND_PARAMS).map((k) => [k, pendulum[k]])),
      ink: { colour: ink.colour },
      bubbles: { wind: bubbles.wind },
      curtain: { wind: curtain.wind },
    };
  }
  function restore(s) {
    if (!s || s.v !== SAVE_VERSION) return false;
    const { gummy, lava, sand, pendulum, ink, bubbles, curtain } = toys;
    if (TOYS.includes(s.tab)) pg.tab = s.tab;
    if (s.gummy) gummy.setJiggle(s.gummy.jiggle);
    if (s.lava) { lava.lamp = !!s.lava.lamp; lava.gravity = clamp(+s.lava.gravity || 0, 0, 2); }
    if (s.sand) { sand.colour = clamp(s.sand.colour | 0, 0, SAND_COLOURS.length - 1); sand.setWet(s.sand.wet); if (s.sand.ratio != null) sand.setRatio(s.sand.ratio); }
    if (s.ink) ink.colour = clamp(s.ink.colour | 0, 0, INK_COLOURS.length - 1);
    if (s.bubbles && s.bubbles.wind != null) bubbles.setWind(s.bubbles.wind);
    if (s.curtain && s.curtain.wind != null) curtain.setWind(s.curtain.wind);
    if (s.pendulum) for (const k of Object.keys(PEND_PARAMS)) if (s.pendulum[k] != null) pendulum.set(k, s.pendulum[k]);
    return true;
  }
  function setTab(t) { if (TOYS.includes(t)) pg.tab = t; }
  // only the toy on show runs
  function step(dt) { toys[pg.tab].step(dt); }
  if (saved) restore(saved);
  live = true;
  Object.assign(pg, { toSave, restore, setTab, step });
  return pg;
}
