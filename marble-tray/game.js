/* Marble Tray — a calm sandbox. A wooden tray of marbles, blocks and odds and
   ends with a small rigid-body simulation underneath. Drag things, steer one
   with the keys, or tilt the whole tray and watch everything roll. */
(() => {
  'use strict';

  // ---------- constants ----------
  const W = 960, H = 620, RIM = 22;        // canvas size and rim thickness (px)
  const SUBSTEPS = 4;                       // physics substeps per frame
  const ITERATIONS = 8;                     // impulse solver passes per substep
  const SLOP = 0.4, PERCENT = 0.5;          // positional correction
  const REST_THRESH = 40;                   // below this approach speed, no bounce
  const SOUND_MIN = 45;                     // approach speed that makes a sound
  const GRAB_K = 45, GRAB_D = 10;           // spring/damping of the hand
  const HELD_MAX = 1500;                    // px/s cap while held
  const THRUST = 1100, STEER_MAX = 460;     // keyboard steering
  const TILT_G = 380;                       // px/s² at full tilt
  const MAG_ACCEL = 1500;                   // px/s² of pull with the steel right on the magnet
  const MAG_RANGE = 340;                    // px beyond which the magnet does nothing
  const HOLE_R = 30;                        // radius of a hole in the match tray
  const HOLE_PULL = 900;                    // px/s² the lip of a hole draws a marble in by
  const SINK_SPEED = 300;                   // over this, a marble rides straight across
  const SINK_TIME = 0.34;                   // seconds a marble takes to disappear
  const WIN_SCORE = 4;                      // sunk marbles needed to win (out of 6)
  const COUNTDOWN = 4;                      // seconds of 3-2-1-Go before a match is live
  const DIE_ROLL_PX = 34;                   // px of travel that turns a die onto its next face
  const DIE_ROLL_RAD = 2.4;                 // radians of spin that do the same
  const DIE_MIN_SPEED = 26;                 // under this it is sliding, not rolling: the face holds
  const DIE_FLIP_TIME = 0.09;               // seconds a face takes to give way to the next
  const DIE_FLIP_MIN = 1 / DIE_FLIP_TIME;   // ...and the fade never runs slower than that

  const canvas = document.getElementById('tray');
  const ctx = canvas.getContext('2d');
  const $ = id => document.getElementById(id);
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  function seeded(seed) {
    let s = (seed * 9301 + 49297) % 233280;
    return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  }

  // ---------- catalogue ----------
  const MARBLE_COLOURS = [
    { name: 'sea-glass', base: '#7fb9a8', deep: '#3f8a78', swirl: '#dff5ee' },
    { name: 'rose', base: '#e2a2a8', deep: '#b8636c', swirl: '#fbe7e9' },
    { name: 'amber', base: '#e0aa5a', deep: '#b3762a', swirl: '#fbe9c6' },
    { name: 'sky', base: '#8fb7d9', deep: '#4f7fab', swirl: '#e6f1fb' },
    { name: 'lavender', base: '#b3a3d3', deep: '#7a67a8', swirl: '#efe9f9' },
    { name: 'sage', base: '#a7b98a', deep: '#6f8552', swirl: '#eef3e3' },
    { name: 'clear', base: '#d9dfe0', deep: '#a3adb0', swirl: '#ffffff' },
    { name: 'ink', base: '#5a6270', deep: '#2c3138', swirl: '#a9b3c2' },
  ];

  // density is relative (glass ≈ 2.5); roll is the table's braking in px/s²,
  // spin the braking on rotation in rad/s². rest = bounciness, mu = grip.
  const KINDS = {
    'marble-s': { label: 'Small marble', shape: 'circle', r: 11, density: 2.5, rest: 0.82, mu: 0.06, roll: 65, spin: 1.5, material: 'glass', draw: 'marble' },
    'marble-m': { label: 'Marble', shape: 'circle', r: 16, density: 2.5, rest: 0.82, mu: 0.06, roll: 60, spin: 1.5, material: 'glass', draw: 'marble' },
    'marble-l': { label: 'Big marble', shape: 'circle', r: 23, density: 2.5, rest: 0.8, mu: 0.06, roll: 55, spin: 1.5, material: 'glass', draw: 'marble' },
    'shooter':  { label: 'Shooter', shape: 'circle', r: 32, density: 2.5, rest: 0.78, mu: 0.07, roll: 50, spin: 1.5, material: 'glass', draw: 'marble' },
    'puck':     { label: 'Slate puck', shape: 'circle', r: 28, density: 2.4, rest: 0.15, mu: 0.4, roll: 190, spin: 3, material: 'stone', draw: 'puck' },
    'cork':     { label: 'Cork', shape: 'circle', r: 17, density: 0.3, rest: 0.5, mu: 0.45, roll: 260, spin: 4, material: 'cork', draw: 'cork' },
    'block':    { label: 'Wooden block', shape: 'box', w: 48, h: 48, density: 0.7, rest: 0.2, mu: 0.45, roll: 280, spin: 4, material: 'wood', draw: 'wood' },
    'plank':    { label: 'Plank', shape: 'box', w: 134, h: 26, density: 0.7, rest: 0.2, mu: 0.45, roll: 280, spin: 3, material: 'wood', draw: 'wood' },
    'die':      { label: 'Die', shape: 'box', w: 30, h: 30, density: 1.1, rest: 0.3, mu: 0.4, roll: 320, spin: 5, material: 'bone', draw: 'die' },
    // Steel is heavy for its size — a 13px bearing weighs what a 23px marble does.
    // `magnetic` is what the magnet pulls on; `magnet` is what does the pulling.
    'bearing':  { label: 'Ball bearing', shape: 'circle', r: 13, density: 7.8, rest: 0.55, mu: 0.12, roll: 70, spin: 2, material: 'metal', draw: 'bearing', magnetic: true },
    'nut':      { label: 'Hex nut', shape: 'box', w: 26, h: 26, density: 7.8, rest: 0.25, mu: 0.5, roll: 130, spin: 5, material: 'metal', draw: 'nut', magnetic: true },
    'bar':      { label: 'Steel bar', shape: 'box', w: 96, h: 17, density: 7.8, rest: 0.2, mu: 0.42, roll: 140, spin: 3, material: 'metal', draw: 'steel', magnetic: true },
    'magnet':   { label: 'Magnet', shape: 'box', w: 56, h: 40, density: 3.0, rest: 0.25, mu: 0.5, roll: 300, spin: 4, material: 'metal', draw: 'magnet', magnet: true },
  };
  const PALETTE = ['marble-s', 'marble-m', 'marble-l', 'shooter', 'puck', 'cork', 'block', 'plank', 'die',
    'bearing', 'nut', 'bar', 'magnet'];

  // ---------- bodies ----------
  let nextId = 1;
  const bodies = [];   // dynamic
  const walls = [];    // static
  const holes = [];    // { x, y, r, team } — empty in the sandbox, cut into the match tray
  const sinking = [];  // { b, h, t } — marbles part way down a hole, drawn but not simulated

  function makeBody(kind, x, y, opts = {}) {
    const k = KINDS[kind];
    const b = {
      id: nextId++, kind, k, shape: k.shape,
      x, y, vx: 0, vy: 0, angle: opts.angle || 0, w: 0, roll: 0,
      static: false, held: false,
      rest: k.rest, mu: k.mu, material: k.material,
      colour: opts.colour || pick(MARBLE_COLOURS),
      pips: opts.pips || 1 + Math.floor(Math.random() * 6),
      pipsPrev: 0, tumble: 0, flip: 0, flipRate: DIE_FLIP_MIN,   // a die going over its edges
      team: opts.team || null,          // 'you' / 'ai' in a match, else null
      tx: 0, ty: 0, tcap: STEER_MAX,    // steering thrust, set fresh each frame
      wv: [], wn: [],
    };
    if (k.shape === 'circle') {
      b.r = k.r;
      b.mass = k.density * Math.PI * k.r * k.r / 100;
      b.I = 0.5 * b.mass * k.r * k.r;
      b.bound = k.r;
    } else {
      b.hw = k.w / 2; b.hh = k.h / 2;
      b.mass = k.density * k.w * k.h / 100;
      b.I = b.mass * (k.w * k.w + k.h * k.h) / 12;
      b.bound = Math.hypot(b.hw, b.hh);
    }
    b.im = 1 / b.mass; b.iI = 1 / b.I;
    updateVerts(b);
    return b;
  }

  function makeWall(x, y, hw, hh) {
    const b = {
      id: nextId++, static: true, shape: 'box', x, y, hw, hh, angle: 0, vx: 0, vy: 0, w: 0,
      im: 0, iI: 0, mass: Infinity, rest: 0.6, mu: 0.3, material: 'wood',
      bound: Math.hypot(hw, hh), wv: [], wn: [],
    };
    updateVerts(b);
    return b;
  }
  {
    const T = 80;
    walls.push(makeWall(W / 2, RIM - T, W / 2 + T, T));
    walls.push(makeWall(W / 2, H - RIM + T, W / 2 + T, T));
    walls.push(makeWall(RIM - T, H / 2, T, H / 2 + T));
    walls.push(makeWall(W - RIM + T, H / 2, T, H / 2 + T));
  }

  function updateVerts(b) {
    if (b.shape !== 'box') return;
    const c = Math.cos(b.angle), s = Math.sin(b.angle);
    const xs = [-b.hw, b.hw, b.hw, -b.hw], ys = [-b.hh, -b.hh, b.hh, b.hh];
    for (let i = 0; i < 4; i++) {
      b.wv[i] = { x: b.x + xs[i] * c - ys[i] * s, y: b.y + xs[i] * s + ys[i] * c };
    }
    for (let i = 0; i < 4; i++) {
      const a = b.wv[i], d = b.wv[(i + 1) % 4];
      const ex = d.x - a.x, ey = d.y - a.y, l = Math.hypot(ex, ey) || 1;
      b.wn[i] = { x: ey / l, y: -ex / l };
    }
  }

  // ---------- collision detection ----------
  // Every manifold has a normal pointing from a to b and one or two contacts.
  function circleCircle(A, B) {
    const dx = B.x - A.x, dy = B.y - A.y;
    const d2 = dx * dx + dy * dy, rs = A.r + B.r;
    if (d2 >= rs * rs) return null;
    const d = Math.sqrt(d2);
    let nx = 1, ny = 0;
    if (d > 1e-6) { nx = dx / d; ny = dy / d; }
    const depth = rs - d;
    const t = A.r - depth / 2;
    return { a: A, b: B, nx, ny, c: [{ x: A.x + nx * t, y: A.y + ny * t, depth }] };
  }

  // C circle, P polygon. Normal returned from C to P.
  function circlePoly(C, P) {
    let sep = -Infinity, fi = 0;
    for (let i = 0; i < 4; i++) {
      const n = P.wn[i], v = P.wv[i];
      const s = n.x * (C.x - v.x) + n.y * (C.y - v.y);
      if (s > C.r) return null;
      if (s > sep) { sep = s; fi = i; }
    }
    const v1 = P.wv[fi], v2 = P.wv[(fi + 1) % 4], n = P.wn[fi];
    let nx, ny, depth, cx, cy;
    if (sep < 1e-4) {
      nx = n.x; ny = n.y; depth = C.r - sep;
      cx = C.x - nx * C.r; cy = C.y - ny * C.r;
    } else {
      const d1 = (C.x - v1.x) * (v2.x - v1.x) + (C.y - v1.y) * (v2.y - v1.y);
      const d2 = (C.x - v2.x) * (v1.x - v2.x) + (C.y - v2.y) * (v1.y - v2.y);
      let corner = null;
      if (d1 <= 0) corner = v1; else if (d2 <= 0) corner = v2;
      if (corner) {
        const dx = C.x - corner.x, dy = C.y - corner.y, d = Math.hypot(dx, dy);
        if (d >= C.r) return null;
        nx = dx / (d || 1); ny = dy / (d || 1); depth = C.r - d;
        cx = corner.x; cy = corner.y;
      } else {
        nx = n.x; ny = n.y; depth = C.r - sep;
        cx = C.x - nx * C.r; cy = C.y - ny * C.r;
      }
    }
    // n points out of P toward C; we want C -> P
    return { a: C, b: P, nx: -nx, ny: -ny, c: [{ x: cx, y: cy, depth }] };
  }

  function axisLeast(A, B) {
    let best = -Infinity, idx = 0;
    for (let i = 0; i < 4; i++) {
      const n = A.wn[i], v = A.wv[i];
      let s = Infinity;
      for (let j = 0; j < 4; j++) {
        const u = B.wv[j];
        const d = n.x * (u.x - v.x) + n.y * (u.y - v.y);
        if (d < s) s = d;
      }
      if (s > best) { best = s; idx = i; }
    }
    return { sep: best, idx };
  }

  function clip(p1, p2, nx, ny, off) {
    const out = [];
    const d1 = nx * p1.x + ny * p1.y - off, d2 = nx * p2.x + ny * p2.y - off;
    if (d1 <= 0) out.push(p1);
    if (d2 <= 0) out.push(p2);
    if (d1 * d2 < 0) {
      const t = d1 / (d1 - d2);
      out.push({ x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) });
    }
    return out;
  }

  function polyPoly(A, B) {
    const ra = axisLeast(A, B); if (ra.sep > 0) return null;
    const rb = axisLeast(B, A); if (rb.sep > 0) return null;
    let ref, inc, refIdx, flip;
    if (rb.sep > ra.sep * 0.95 + 0.01) { ref = B; inc = A; refIdx = rb.idx; flip = true; }
    else { ref = A; inc = B; refIdx = ra.idx; flip = false; }
    const n = ref.wn[refIdx], v1 = ref.wv[refIdx], v2 = ref.wv[(refIdx + 1) % 4];
    let incIdx = 0, minDot = Infinity;
    for (let i = 0; i < 4; i++) {
      const d = n.x * inc.wn[i].x + n.y * inc.wn[i].y;
      if (d < minDot) { minDot = d; incIdx = i; }
    }
    let pts = [inc.wv[incIdx], inc.wv[(incIdx + 1) % 4]];
    const tl = Math.hypot(v2.x - v1.x, v2.y - v1.y) || 1;
    const tx = (v2.x - v1.x) / tl, ty = (v2.y - v1.y) / tl;
    pts = clip(pts[0], pts[1], -tx, -ty, -(tx * v1.x + ty * v1.y));
    if (pts.length < 2) return null;
    pts = clip(pts[0], pts[1], tx, ty, tx * v2.x + ty * v2.y);
    if (pts.length < 2) return null;
    const c = [];
    for (const p of pts) {
      const s = n.x * (p.x - v1.x) + n.y * (p.y - v1.y);
      if (s <= 0) c.push({ x: p.x, y: p.y, depth: -s });
    }
    if (!c.length) return null;
    return flip ? { a: A, b: B, nx: -n.x, ny: -n.y, c } : { a: A, b: B, nx: n.x, ny: n.y, c };
  }

  function collide(A, B) {
    if (A.shape === 'circle' && B.shape === 'circle') return circleCircle(A, B);
    if (A.shape === 'circle') return circlePoly(A, B);
    if (B.shape === 'circle') {
      const m = circlePoly(B, A);
      if (m) { m.a = A; m.b = B; m.nx = -m.nx; m.ny = -m.ny; }
      return m;
    }
    return polyPoly(A, B);
  }

  function nearWall(b, wall) {
    const dx = Math.max(Math.abs(b.x - wall.x) - wall.hw, 0);
    const dy = Math.max(Math.abs(b.y - wall.y) - wall.hh, 0);
    return dx * dx + dy * dy < b.bound * b.bound;
  }

  // ---------- solver ----------
  function relVel(A, B, c) {
    const rax = c.x - A.x, ray = c.y - A.y, rbx = c.x - B.x, rby = c.y - B.y;
    return {
      x: (B.vx - B.w * rby) - (A.vx - A.w * ray),
      y: (B.vy + B.w * rbx) - (A.vy + A.w * rax),
    };
  }

  function solve(m) {
    const A = m.a, B = m.b, nx = m.nx, ny = m.ny;
    const e = Math.min(A.rest, B.rest), mu = Math.sqrt(A.mu * B.mu);
    const cnt = m.c.length;
    for (const c of m.c) {
      const rax = c.x - A.x, ray = c.y - A.y, rbx = c.x - B.x, rby = c.y - B.y;
      let rvx = (B.vx - B.w * rby) - (A.vx - A.w * ray);
      let rvy = (B.vy + B.w * rbx) - (A.vy + A.w * rax);
      const vn = rvx * nx + rvy * ny;
      if (vn > 0) continue;
      const raN = rax * ny - ray * nx, rbN = rbx * ny - rby * nx;
      const invMass = A.im + B.im + raN * raN * A.iI + rbN * rbN * B.iI;
      if (invMass === 0) continue;
      const eUse = vn < -REST_THRESH ? e : 0;
      const j = -(1 + eUse) * vn / invMass / cnt;
      const jx = j * nx, jy = j * ny;
      A.vx -= jx * A.im; A.vy -= jy * A.im; A.w -= raN * j * A.iI;
      B.vx += jx * B.im; B.vy += jy * B.im; B.w += rbN * j * B.iI;

      rvx = (B.vx - B.w * rby) - (A.vx - A.w * ray);
      rvy = (B.vy + B.w * rbx) - (A.vy + A.w * rax);
      const vn2 = rvx * nx + rvy * ny;
      let tx = rvx - vn2 * nx, ty = rvy - vn2 * ny;
      const tl = Math.hypot(tx, ty);
      if (tl < 1e-6) continue;
      tx /= tl; ty /= tl;
      const raT = rax * ty - ray * tx, rbT = rbx * ty - rby * tx;
      const invMassT = A.im + B.im + raT * raT * A.iI + rbT * rbT * B.iI;
      let jt = -(rvx * tx + rvy * ty) / invMassT / cnt;
      const maxF = mu * j;
      jt = clamp(jt, -maxF, maxF);
      const fx = jt * tx, fy = jt * ty;
      A.vx -= fx * A.im; A.vy -= fy * A.im; A.w -= raT * jt * A.iI;
      B.vx += fx * B.im; B.vy += fy * B.im; B.w += rbT * jt * B.iI;
    }
  }

  function correct(m) {
    const A = m.a, B = m.b, sum = A.im + B.im;
    if (sum === 0) return;
    for (const c of m.c) {
      const corr = Math.max(c.depth - SLOP, 0) * PERCENT / sum / m.c.length;
      A.x -= m.nx * corr * A.im; A.y -= m.ny * corr * A.im;
      B.x += m.nx * corr * B.im; B.y += m.ny * corr * B.im;
    }
  }

  // ---------- input state ----------
  let grab = null;        // { body, lx, ly, px, py, pointerId, moved, x0, y0 }
  let ctrl = null;        // body steered by the keys
  let pending = null;     // palette item being dragged in
  const keys = new Set();
  const KEYMAP = {
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  };
  let kdx = 0, kdy = 0;
  let tiltX = 0, tiltY = 0, gx = 0, gy = 0;

  function keyDir() {
    let x = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0);
    let y = (keys.has('down') ? 1 : 0) - (keys.has('up') ? 1 : 0);
    const l = Math.hypot(x, y);
    if (l > 0) { x /= l; y /= l; }
    kdx = x; kdy = y;
  }

  function applyGrab(b, dt) {
    const c = Math.cos(b.angle), s = Math.sin(b.angle);
    const rx = grab.lx * c - grab.ly * s, ry = grab.lx * s + grab.ly * c;
    const gxw = b.x + rx, gyw = b.y + ry;
    const tx = clamp(grab.px, RIM + 4, W - RIM - 4), ty = clamp(grab.py, RIM + 4, H - RIM - 4);
    const vgx = b.vx - b.w * ry, vgy = b.vy + b.w * rx;
    const ax = (tx - gxw) * GRAB_K - vgx * GRAB_D;
    const ay = (ty - gyw) * GRAB_K - vgy * GRAB_D;
    b.vx += ax * dt; b.vy += ay * dt;
    if (b.shape === 'box') {
      b.w += (rx * ay - ry * ax) * b.mass * b.iI * dt;
      b.w *= Math.max(0, 1 - 5 * dt);
    }
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > HELD_MAX) { b.vx *= HELD_MAX / sp; b.vy *= HELD_MAX / sp; }
  }

  // ---------- step ----------
  const soundQueue = [];
  const lastPairSound = new Map();

  function step(dt, now) {
    const mags = [];
    for (const b of bodies) if (b.k.magnet) mags.push(b);

    for (const b of bodies) {
      if (b.held) applyGrab(b, dt);
      b.vx += gx * dt; b.vy += gy * dt;
      // The magnet pulls steel: softened inverse-square so it never blows up at
      // contact, tapered to nothing at MAG_RANGE so distant bits sit still.
      b.pulled = false;
      if (mags.length && b.k.magnetic) {
        for (const m of mags) {
          const dx = m.x - b.x, dy = m.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 > MAG_RANGE * MAG_RANGE || d2 < 1e-6) continue;
          const d = Math.sqrt(d2);
          const t = 1 - d / MAG_RANGE;
          const a = MAG_ACCEL * t * t;
          const ax = dx / d * a, ay = dy / d * a;
          b.vx += ax * dt; b.vy += ay * dt;
          const back = b.mass / m.mass;          // equal force, so the lighter one moves more
          m.vx -= ax * back * dt; m.vy -= ay * back * dt;
          if (a > b.k.roll) b.pulled = true;     // strong enough to beat the table
        }
      }
      if (holes.length && b.shape === 'circle') {
        for (const h of holes) {
          if (b.r > h.r * 0.92) continue;                  // too fat to feel the dip
          const dx = h.x - b.x, dy = h.y - b.y;
          const d = Math.hypot(dx, dy);
          if (d > h.r + b.r || d < 1e-6) continue;
          const a = HOLE_PULL * Math.min(1, (h.r + b.r - d) / h.r);
          b.vx += dx / d * a * dt; b.vy += dy / d * a * dt;
          b.pulled = true;
        }
      }
      if (b.tx || b.ty) {
        b.vx += b.tx * THRUST * dt; b.vy += b.ty * THRUST * dt;
        const sp = Math.hypot(b.vx, b.vy);
        if (sp > b.tcap) { b.vx *= b.tcap / sp; b.vy *= b.tcap / sp; }
      }
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > 0) {
        const d = b.k.roll * dt;
        if (d >= sp) { b.vx = 0; b.vy = 0; }
        else { const f = (sp - d) / sp; b.vx *= f; b.vy *= f; }
      }
      if (b.w !== 0) {
        const d = b.k.spin * dt;
        if (Math.abs(b.w) <= d) b.w = 0; else b.w -= Math.sign(b.w) * d;
      }
      b.x += b.vx * dt; b.y += b.vy * dt; b.angle += b.w * dt;
      if (b.shape === 'circle') b.roll += sp * dt / b.r;
      updateVerts(b);
    }

    const ms = [];
    const n = bodies.length;
    for (let i = 0; i < n; i++) {
      const A = bodies[i];
      for (let j = i + 1; j < n; j++) {
        const B = bodies[j];
        const dx = B.x - A.x, dy = B.y - A.y, r = A.bound + B.bound;
        if (dx * dx + dy * dy >= r * r) continue;
        const m = collide(A, B);
        if (m) ms.push(m);
      }
      for (const wall of walls) {
        if (!nearWall(A, wall)) continue;
        const m = collide(A, wall);
        if (m) ms.push(m);
      }
    }

    for (const m of ms) {
      const rv = relVel(m.a, m.b, m.c[0]);
      const vn = rv.x * m.nx + rv.y * m.ny;
      if (vn < -SOUND_MIN) {
        // A knock hard enough to be heard is hard enough to turn a die over.
        for (const b of [m.a, m.b]) if (b.k && b.k.draw === 'die') b.tumble += 0.55;
        const key = m.a.id + ':' + m.b.id;
        const last = lastPairSound.get(key) || 0;
        if (now - last > 90) {
          lastPairSound.set(key, now);
          soundQueue.push({ a: m.a, b: m.b, speed: -vn });
        }
      }
    }

    for (let it = 0; it < ITERATIONS; it++) for (const m of ms) solve(m);
    for (const m of ms) correct(m);

    for (const b of bodies) {
      if (b.x < RIM || b.x > W - RIM || b.y < RIM || b.y > H - RIM) {
        b.x = clamp(b.x, RIM + b.bound, W - RIM - b.bound);
        b.y = clamp(b.y, RIM + b.bound, H - RIM - b.bound);
        b.vx *= 0.2; b.vy *= 0.2;
      }
      if (!b.held && !b.tx && !b.ty && !b.pulled && !gx && !gy
        && Math.abs(b.vx) < 2.5 && Math.abs(b.vy) < 2.5) { b.vx = 0; b.vy = 0; }
      if (Math.abs(b.w) < 0.02) b.w = 0;
      if (b.k.draw === 'die') tumbleDie(b, dt);
      if (b.shape === 'box' && (b.vx || b.vy || b.w)) updateVerts(b);
    }

    // Anything round and small enough that has wandered over a hole drops in.
    if (holes.length) {
      for (let i = bodies.length - 1; i >= 0; i--) {
        const b = bodies[i];
        if (b.held || b.shape !== 'circle') continue;
        if (Math.hypot(b.vx, b.vy) > SINK_SPEED) continue;   // going too fast, it skims over
        for (const h of holes) {
          if (b.r > h.r * 0.92) continue;                     // too fat to fit
          if (Math.hypot(b.x - h.x, b.y - h.y) < h.r - b.r * 0.55) { sink(b, h); break; }
        }
      }
    }
  }

  function sink(b, h) {
    const i = bodies.indexOf(b);
    if (i < 0) return;
    bodies.splice(i, 1);
    sinking.push({ b, h, t: 0 });
    if (ctrl === b) setControl(null);
    if (grab && grab.body === b) endGrab();
    if (match.aiBody === b) match.aiBody = null;
    if (b.team) score(h.team || b.team);     // a ringed hole pays its own colour, whoever fell in
    else updateCount();
  }

  // ---------- sound ----------
  const sound = {
    on: false, ac: null, master: null, noise: null, recent: [],
    ensure() {
      if (this.ac) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ac = new AC();
      this.master = this.ac.createGain();
      this.master.gain.value = 0.7;
      this.master.connect(this.ac.destination);
      const len = Math.floor(this.ac.sampleRate * 0.12);
      this.noise = this.ac.createBuffer(1, len, this.ac.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    },
    tone(type, freq, gain, decay, t) {
      const o = this.ac.createOscillator(), g = this.ac.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0005, t + decay);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + decay + 0.02);
    },
    burst(freq, q, gain, decay, t) {
      const s = this.ac.createBufferSource(), f = this.ac.createBiquadFilter(), g = this.ac.createGain();
      s.buffer = this.noise;
      f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0005, t + decay);
      s.connect(f); f.connect(g); g.connect(this.master);
      s.start(t); s.stop(t + decay + 0.02);
    },
    beat(n) {                                            // n counts 3, 2, 1 then 0 for the off
      if (!this.on || !this.ac || n < 0) return;
      const t = this.ac.currentTime;
      if (n === 0) {
        this.tone('sine', 660, 0.2, 0.2, t);
        this.tone('sine', 990, 0.11, 0.34, t + 0.07);
      } else {
        this.tone('sine', 440, 0.15, 0.13, t);
        this.tone('sine', 880, 0.05, 0.09, t);
      }
    },
    hit(a, b, speed) {
      if (!this.on || !this.ac) return;
      const t = this.ac.currentTime;
      this.recent = this.recent.filter(x => t - x < 0.1);
      if (this.recent.length > 6) return;
      this.recent.push(t);
      const v = clamp((speed - SOUND_MIN) / 700, 0.04, 1);
      const mats = [a.material, b.material].sort().join('+');
      const size = (a.bound + b.bound) / 2;
      if (mats === 'glass+glass') {
        const f = clamp(3200 - size * 45, 1400, 3000);
        this.tone('sine', f, v * 0.35, 0.09, t);
        this.tone('sine', f * 2.4, v * 0.12, 0.05, t);
        this.burst(f, 8, v * 0.25, 0.03, t);
      } else if (mats.includes('cork')) {
        this.tone('sine', 220 - size, v * 0.25, 0.07, t);
        this.burst(600, 2, v * 0.1, 0.03, t);
      } else if (mats.includes('glass')) {
        this.tone('triangle', clamp(900 - size * 8, 380, 900), v * 0.3, 0.06, t);
        this.burst(1200, 4, v * 0.18, 0.03, t);
      } else if (mats === 'metal+metal') {
        const f = clamp(2600 - size * 30, 900, 2400);
        this.tone('sine', f, v * 0.3, 0.55, t);            // the ring is the whole character
        this.tone('sine', f * 1.51, v * 0.16, 0.34, t);    // an inharmonic partner keeps it bell-like
        this.tone('triangle', f * 0.5, v * 0.1, 0.18, t);
        this.burst(f * 1.4, 10, v * 0.22, 0.02, t);
      } else if (mats.includes('metal')) {
        this.tone('triangle', clamp(1500 - size * 14, 500, 1400), v * 0.22, 0.12, t);
        this.burst(900, 5, v * 0.3, 0.04, t);
      } else if (mats === 'stone+stone') {
        this.burst(1100, 6, v * 0.35, 0.05, t);
        this.tone('sine', 700, v * 0.12, 0.05, t);
      } else {
        this.burst(clamp(520 - size * 3, 260, 520), 3, v * 0.4, 0.05, t);
        this.tone('triangle', 330, v * 0.08, 0.04, t);
      }
    },
  };

  // ---------- drawing ----------
  let dpr = 1;
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }
  window.addEventListener('resize', resize);
  resize();

  const bg = document.createElement('canvas');
  bg.width = W; bg.height = H;
  {
    const g = bg.getContext('2d');
    const wood = g.createLinearGradient(0, 0, W, H);
    wood.addColorStop(0, '#b6805a'); wood.addColorStop(0.5, '#9e6a42'); wood.addColorStop(1, '#8a5a36');
    g.fillStyle = wood;
    roundRect(g, 0, 0, W, H, 18); g.fill();
    g.save();
    roundRect(g, 0, 0, W, H, 18); g.clip();
    g.strokeStyle = 'rgba(70, 40, 20, 0.16)'; g.lineWidth = 1;
    const rg = seeded(7);
    for (let i = 0; i < 70; i++) {
      const y = rg() * H;
      g.beginPath(); g.moveTo(0, y);
      g.bezierCurveTo(W * 0.3, y + (rg() - 0.5) * 14, W * 0.7, y + (rg() - 0.5) * 14, W, y + (rg() - 0.5) * 8);
      g.stroke();
    }
    g.restore();
    g.fillStyle = '#e9dcc4';
    roundRect(g, RIM, RIM, W - 2 * RIM, H - 2 * RIM, 10); g.fill();
    g.save();
    roundRect(g, RIM, RIM, W - 2 * RIM, H - 2 * RIM, 10); g.clip();
    const rg2 = seeded(11);
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = rg2() < 0.5 ? 'rgba(90, 60, 30, 0.06)' : 'rgba(255, 250, 240, 0.35)';
      g.fillRect(RIM + rg2() * (W - 2 * RIM), RIM + rg2() * (H - 2 * RIM), 1.4, 1.4);
    }
    const shade = 26;
    const sides = [
      [RIM, RIM, RIM, RIM + shade, 0, 1], [RIM, H - RIM, RIM, H - RIM - shade, 0, 1],
      [RIM, RIM, RIM + shade, RIM, 1, 0], [W - RIM, RIM, W - RIM - shade, RIM, 1, 0],
    ];
    for (const [x0, y0, x1, y1] of sides) {
      const lg = g.createLinearGradient(x0, y0, x1, y1);
      lg.addColorStop(0, 'rgba(60, 35, 15, 0.28)'); lg.addColorStop(1, 'rgba(60, 35, 15, 0)');
      g.fillStyle = lg;
      g.fillRect(RIM, RIM, W - 2 * RIM, H - 2 * RIM);
    }
    g.restore();
    g.strokeStyle = 'rgba(255, 235, 200, 0.35)'; g.lineWidth = 1.5;
    roundRect(g, RIM - 1, RIM - 1, W - 2 * RIM + 2, H - 2 * RIM + 2, 11); g.stroke();
    g.strokeStyle = 'rgba(60, 30, 10, 0.35)';
    roundRect(g, 0.75, 0.75, W - 1.5, H - 1.5, 18); g.stroke();
  }

  function roundRect(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const r = clamp(((n >> 16) & 255) + amt, 0, 255), gg = clamp(((n >> 8) & 255) + amt, 0, 255), b = clamp((n & 255) + amt, 0, 255);
    return `rgb(${r},${gg},${b})`;
  }

  function drawShadow(g, b, lift) {
    const ox = 3 + lift * 6, oy = 5 + lift * 8;
    g.fillStyle = `rgba(50, 35, 20, ${0.2 - lift * 0.06})`;
    g.save();
    g.translate(b.x + ox, b.y + oy);
    if (b.shape === 'circle') {
      g.beginPath(); g.arc(0, 0, b.r * (1.02 + lift * 0.08), 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(50, 35, 20, 0.08)';
      g.beginPath(); g.arc(0, 1, b.r * (1.12 + lift * 0.1), 0, Math.PI * 2); g.fill();
    } else {
      g.rotate(b.angle);
      const e = 1 + lift * 3;
      roundRect(g, -b.hw - e, -b.hh - e, 2 * b.hw + 2 * e, 2 * b.hh + 2 * e, 5); g.fill();
      g.fillStyle = 'rgba(50, 35, 20, 0.08)';
      roundRect(g, -b.hw - e - 3, -b.hh - e - 3, 2 * b.hw + 2 * e + 6, 2 * b.hh + 2 * e + 6, 7); g.fill();
    }
    g.restore();
  }

  function drawMarble(g, b) {
    const r = b.r, col = b.colour;
    const grad = g.createRadialGradient(-r * 0.35, -r * 0.38, r * 0.05, 0, 0, r);
    grad.addColorStop(0, shade(col.base, 40));
    grad.addColorStop(0.5, col.base);
    grad.addColorStop(1, col.deep);
    g.fillStyle = grad;
    g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();

    g.save();
    g.beginPath(); g.arc(0, 0, r * 0.97, 0, Math.PI * 2); g.clip();
    g.rotate(b.angle + b.roll);
    g.lineCap = 'round';
    g.strokeStyle = col.swirl; g.globalAlpha = 0.55; g.lineWidth = r * 0.34;
    g.beginPath();
    g.moveTo(-r * 0.85, 0);
    g.bezierCurveTo(-r * 0.3, -r * 0.9, r * 0.3, r * 0.9, r * 0.85, 0);
    g.stroke();
    g.strokeStyle = col.deep; g.globalAlpha = 0.35; g.lineWidth = r * 0.12;
    g.beginPath();
    g.moveTo(-r * 0.8, r * 0.25);
    g.bezierCurveTo(-r * 0.3, -r * 0.6, r * 0.3, r * 1.1, r * 0.8, r * 0.25);
    g.stroke();
    g.restore();

    g.fillStyle = 'rgba(255,255,255,0.22)';
    g.beginPath(); g.ellipse(r * 0.3, r * 0.5, r * 0.36, r * 0.16, 0.5, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.beginPath(); g.ellipse(-r * 0.4, -r * 0.45, r * 0.26, r * 0.16, -0.7, 0, Math.PI * 2); g.fill();
    g.strokeStyle = col.deep; g.globalAlpha = 0.4; g.lineWidth = 1;
    g.beginPath(); g.arc(0, 0, r - 0.5, 0, Math.PI * 2); g.stroke();
    g.globalAlpha = 1;
  }

  function drawPuck(g, b) {
    const r = b.r;
    const grad = g.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
    grad.addColorStop(0, '#6a6e73'); grad.addColorStop(0.7, '#4b4f54'); grad.addColorStop(1, '#2e3135');
    g.fillStyle = grad;
    g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
    g.save(); g.rotate(b.angle);
    const rg = seeded(b.id);
    g.fillStyle = 'rgba(255,255,255,0.08)';
    for (let i = 0; i < 18; i++) {
      const a = rg() * Math.PI * 2, d = rg() * r * 0.85;
      g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d, 0.8 + rg() * 1.4, 0, Math.PI * 2); g.fill();
    }
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      const y = (rg() - 0.5) * r * 1.2;
      g.beginPath(); g.moveTo(-r * 0.7, y); g.quadraticCurveTo(0, y + (rg() - 0.5) * 6, r * 0.7, y); g.stroke();
    }
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 1.5;
    g.beginPath(); g.arc(0, 0, r * 0.82, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 1;
    g.beginPath(); g.arc(0, 0, r - 0.5, 0, Math.PI * 2); g.stroke();
  }

  function drawCork(g, b) {
    const r = b.r;
    const grad = g.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
    grad.addColorStop(0, '#e6cba0'); grad.addColorStop(0.7, '#cfa876'); grad.addColorStop(1, '#a9834f');
    g.fillStyle = grad;
    g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
    g.save(); g.rotate(b.angle);
    const rg = seeded(b.id * 3);
    for (let i = 0; i < 26; i++) {
      const a = rg() * Math.PI * 2, d = rg() * r * 0.88;
      g.fillStyle = rg() < 0.6 ? 'rgba(110, 75, 35, 0.35)' : 'rgba(255, 240, 210, 0.5)';
      g.beginPath(); g.ellipse(Math.cos(a) * d, Math.sin(a) * d, 1 + rg() * 2, 0.7 + rg() * 1.2, rg() * 3, 0, Math.PI * 2); g.fill();
    }
    g.restore();
    g.strokeStyle = 'rgba(90, 60, 25, 0.5)'; g.lineWidth = 1.2;
    g.beginPath(); g.arc(0, 0, r - 0.6, 0, Math.PI * 2); g.stroke();
  }

  function drawWood(g, b) {
    const w = b.hw * 2, h = b.hh * 2;
    g.rotate(b.angle);
    const grad = g.createLinearGradient(-b.hw, -b.hh, b.hw, b.hh);
    grad.addColorStop(0, '#d8ac78'); grad.addColorStop(1, '#b8895a');
    g.fillStyle = grad;
    roundRect(g, -b.hw, -b.hh, w, h, 5); g.fill();
    g.save();
    roundRect(g, -b.hw, -b.hh, w, h, 5); g.clip();
    g.strokeStyle = 'rgba(120, 75, 35, 0.3)'; g.lineWidth = 1.2;
    const rg = seeded(b.id * 5);
    const lines = Math.max(2, Math.round(h / 9));
    for (let i = 0; i < lines; i++) {
      const y = -b.hh + (i + 0.5) * h / lines + (rg() - 0.5) * 4;
      g.beginPath(); g.moveTo(-b.hw, y);
      g.bezierCurveTo(-b.hw / 3, y + (rg() - 0.5) * 6, b.hw / 3, y + (rg() - 0.5) * 6, b.hw, y + (rg() - 0.5) * 3);
      g.stroke();
    }
    g.restore();
    g.strokeStyle = 'rgba(255, 240, 215, 0.45)'; g.lineWidth = 1.5;
    roundRect(g, -b.hw + 2, -b.hh + 2, w - 4, h - 4, 3.5); g.stroke();
    g.strokeStyle = 'rgba(80, 45, 15, 0.45)'; g.lineWidth = 1;
    roundRect(g, -b.hw + 0.5, -b.hh + 0.5, w - 1, h - 1, 5); g.stroke();
  }

  // A die does not spin its face about like a top — it goes over an edge onto a new
  // one. It can't land back on the face it left, nor on that face's opposite, since
  // opposite faces sum to seven: a tumble off 2 lands on 1, 3, 4 or 6.
  function turnDie(b) {
    const from = b.pips;
    let n = 1 + Math.floor(Math.random() * 4);          // one of the four side faces
    for (const skip of [Math.min(from, 7 - from), Math.max(from, 7 - from)]) if (n >= skip) n++;
    b.pipsPrev = from;
    b.pips = n;
    b.flip = 1;
  }

  // Faces turn over at a rate set by how far it has travelled and how hard it is
  // spinning, so a hard-flung die rattles through numbers and a slow one turns over
  // once or twice and settles.
  function tumbleDie(b, dt) {
    if (b.held) { b.tumble = 0; return; }
    const sp = Math.hypot(b.vx, b.vy);
    if (sp < DIE_MIN_SPEED && Math.abs(b.w) < 0.6) return;
    const rate = sp / DIE_ROLL_PX + Math.abs(b.w) / DIE_ROLL_RAD;   // turns per second
    // A die rattling faster than one turn per DIE_FLIP_TIME would otherwise never
    // finish a fade, and would sit there greyed out and half-blank the whole way
    // across the tray. Squeeze the fade to fit the gap instead, so however hard it
    // is going it still lands on each face before it leaves it.
    b.flipRate = Math.max(DIE_FLIP_MIN, rate);
    b.tumble += rate * dt;
    while (b.tumble >= 1) { b.tumble -= 1; turnDie(b); }
  }

  const PIPS = {
    1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]],
    4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
    6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
  };
  function drawDie(g, b) {
    const w = b.hw * 2, h = b.hh * 2;
    g.rotate(b.angle);
    const f = b.flip || 0;                               // 1 just turned, 0 settled
    const p = 1 - f;                                     // how far through the turn
    const grad = g.createLinearGradient(-b.hw, -b.hh, b.hw, b.hh);
    grad.addColorStop(0, '#fbf6ea'); grad.addColorStop(1, '#e6dcc6');
    g.fillStyle = grad;
    roundRect(g, -b.hw, -b.hh, w, h, 6); g.fill();
    g.strokeStyle = 'rgba(100, 80, 50, 0.4)'; g.lineWidth = 1;
    roundRect(g, -b.hw + 0.5, -b.hh + 0.5, w - 1, h - 1, 6); g.stroke();
    if (f) {                                             // a face on its way over takes less light
      g.fillStyle = `rgba(94, 72, 44, ${Math.sin(p * Math.PI) * 0.22})`;
      roundRect(g, -b.hw, -b.hh, w, h, 6); g.fill();
    }
    // A cube turning over shows the change as a swap, not a fold: at this size the
    // honest edge-on geometry only read as a flat picture flipping. So the old face
    // goes out and the new one comes in, overlapping just enough to look continuous
    // and over fast enough that the eye takes it for a tumble.
    const sp = b.hw * 0.52;
    const drawFace = (n, alpha) => {
      if (alpha <= 0.01) return;
      g.globalAlpha = Math.min(1, alpha);
      g.fillStyle = '#3a3230';
      for (const [px, py] of PIPS[n] || PIPS[1]) {
        g.beginPath(); g.arc(px * sp, py * sp, 2.6, 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1;
    };
    if (f && b.pipsPrev && b.pipsPrev !== b.pips) drawFace(b.pipsPrev, 1 - p / 0.55);
    drawFace(b.pips, f ? (p - 0.45) / 0.55 : 1);
  }

  // Chrome: a tight specular dot, a dark equator and a bounced light from below.
  function drawBearing(g, b) {
    const r = b.r;
    const grad = g.createRadialGradient(-r * 0.4, -r * 0.45, r * 0.05, 0, 0, r);
    grad.addColorStop(0, '#fdfefe'); grad.addColorStop(0.28, '#c3cace');
    grad.addColorStop(0.62, '#767e85'); grad.addColorStop(0.86, '#41474d'); grad.addColorStop(1, '#6d757c');
    g.fillStyle = grad;
    g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
    g.save();
    g.beginPath(); g.arc(0, 0, r * 0.98, 0, Math.PI * 2); g.clip();
    g.fillStyle = 'rgba(255,255,255,0.3)';   // the room reflected in a band
    g.beginPath(); g.ellipse(0, r * 0.52, r * 0.9, r * 0.24, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(20,26,32,0.35)';
    g.beginPath(); g.ellipse(0, -r * 0.02, r * 1.1, r * 0.16, 0, 0, Math.PI * 2); g.fill();
    g.restore();
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.beginPath(); g.ellipse(-r * 0.38, -r * 0.42, r * 0.2, r * 0.13, -0.7, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(30,36,42,0.55)'; g.lineWidth = 1;
    g.beginPath(); g.arc(0, 0, r - 0.5, 0, Math.PI * 2); g.stroke();
  }

  function steelFace(g, hw, hh, seed) {
    const grad = g.createLinearGradient(-hw, -hh, hw, hh);
    grad.addColorStop(0, '#d5dbdf'); grad.addColorStop(0.45, '#9aa2a9');
    grad.addColorStop(0.55, '#aeb6bc'); grad.addColorStop(1, '#6e767d');
    g.fillStyle = grad;
    g.fill();
    g.save(); g.clip();
    const rg = seeded(seed);                 // brushed grain
    g.strokeStyle = 'rgba(255,255,255,0.16)'; g.lineWidth = 0.7;
    for (let i = 0; i < 26; i++) {
      const y = -hh + rg() * hh * 2;
      g.beginPath(); g.moveTo(-hw, y); g.lineTo(hw, y + (rg() - 0.5) * 2); g.stroke();
    }
    g.strokeStyle = 'rgba(40,48,54,0.18)';
    for (let i = 0; i < 14; i++) {
      const y = -hh + rg() * hh * 2;
      g.beginPath(); g.moveTo(-hw, y); g.lineTo(hw, y + (rg() - 0.5) * 2); g.stroke();
    }
    g.restore();
  }

  function drawNut(g, b) {
    g.rotate(b.angle);
    const R = b.hw * 1.02, hole = R * 0.46;
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      const x = Math.cos(a) * R, y = Math.sin(a) * R;
      if (i) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.closePath();
    steelFace(g, R, R, b.id * 7);
    g.strokeStyle = 'rgba(255,255,255,0.4)'; g.lineWidth = 1.4; g.stroke();
    g.strokeStyle = 'rgba(35,42,48,0.6)'; g.lineWidth = 1; g.stroke();
    const hg = g.createRadialGradient(-hole * 0.3, -hole * 0.3, 1, 0, 0, hole);
    hg.addColorStop(0, '#2b3237'); hg.addColorStop(0.7, '#454d54'); hg.addColorStop(1, '#7d868d');
    g.fillStyle = hg;
    g.beginPath(); g.arc(0, 0, hole, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(20,26,30,0.6)'; g.lineWidth = 1;
    g.beginPath(); g.arc(0, 0, hole, 0, Math.PI * 2); g.stroke();
  }

  function drawSteel(g, b) {
    g.rotate(b.angle);
    roundRect(g, -b.hw, -b.hh, b.hw * 2, b.hh * 2, 4);
    steelFace(g, b.hw, b.hh, b.id * 11);
    g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 1.4;
    roundRect(g, -b.hw + 2, -b.hh + 2, b.hw * 2 - 4, b.hh * 2 - 4, 2.5); g.stroke();
    g.strokeStyle = 'rgba(35,42,48,0.55)'; g.lineWidth = 1;
    roundRect(g, -b.hw + 0.5, -b.hh + 0.5, b.hw * 2 - 1, b.hh * 2 - 1, 4); g.stroke();
  }

  // A horseshoe: red painted yoke at the top, bare steel pole tips at the bottom.
  function drawMagnet(g, b) {
    g.rotate(b.angle);
    const R = b.hw, r = R * 0.55, legY = b.hh;
    const top = Math.min(-b.hh + R, b.hh - 8);   // arc centre, so the yoke tops out at -hh
    g.beginPath();
    g.moveTo(-R, legY);
    g.lineTo(-R, top);
    g.arc(0, top, R, Math.PI, 0);
    g.lineTo(R, legY);
    g.lineTo(r, legY);
    g.lineTo(r, top);
    g.arc(0, top, r, 0, Math.PI, true);
    g.lineTo(-r, legY);
    g.closePath();
    g.save();
    g.clip();
    const red = g.createLinearGradient(0, top - R, 0, legY);
    red.addColorStop(0, '#d8574f'); red.addColorStop(0.55, '#b3352f'); red.addColorStop(1, '#8d241f');
    g.fillStyle = red;
    g.fillRect(-R - 2, top - R - 2, R * 2 + 4, R * 2 + legY + 4);
    const tip = legY - b.hh * 0.62;                  // bare steel below this line
    const sg = g.createLinearGradient(0, tip, 0, legY);
    sg.addColorStop(0, '#aab2b8'); sg.addColorStop(0.5, '#e2e7ea'); sg.addColorStop(1, '#8b9399');
    g.fillStyle = sg;
    g.fillRect(-R - 2, tip, R * 2 + 4, legY - tip + 2);
    g.fillStyle = 'rgba(255,255,255,0.22)';
    g.fillRect(-R - 2, top - R - 2, R * 2 + 4, R * 0.5);
    g.restore();
    g.strokeStyle = 'rgba(50,20,18,0.5)'; g.lineWidth = 1.2; g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.font = 'bold 9px ui-sans-serif, system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(45,52,58,0.75)';
    g.fillText('N', -(R + r) / 2, legY - b.hh * 0.3);
    g.fillText('S', (R + r) / 2, legY - b.hh * 0.3);
  }

  function drawHole(g, h) {
    if (h.team) {                                   // a band of lacquer painted round the lip
      const c = TEAM[h.team].colour;
      g.save();
      g.globalAlpha = 0.9;
      g.strokeStyle = c.deep; g.lineWidth = 8;
      g.beginPath(); g.arc(h.x, h.y, h.r + 9, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = c.base; g.lineWidth = 5;
      g.beginPath(); g.arc(h.x, h.y, h.r + 9, 0, Math.PI * 2); g.stroke();
      g.globalAlpha = 0.55;                         // the light catches the far side of the band
      g.strokeStyle = c.swirl; g.lineWidth = 1.4;
      g.beginPath(); g.arc(h.x, h.y, h.r + 7.4, Math.PI * 1.08, Math.PI * 1.92); g.stroke();
      g.restore();
    } else {                                        // the middle one belongs to nobody
      g.save();
      g.strokeStyle = 'rgba(252, 246, 232, 0.8)'; g.lineWidth = 3.5;
      g.setLineDash([6, 8]);
      g.beginPath(); g.arc(h.x, h.y, h.r + 9, 0, Math.PI * 2); g.stroke();
      g.restore();
    }
    const grad = g.createRadialGradient(h.x, h.y - h.r * 0.2, h.r * 0.15, h.x, h.y, h.r);
    grad.addColorStop(0, '#0b0906'); grad.addColorStop(0.65, '#16110b'); grad.addColorStop(1, '#3a2a19');
    g.fillStyle = grad;
    g.beginPath(); g.arc(h.x, h.y, h.r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255, 236, 200, 0.4)'; g.lineWidth = 2;   // lit far lip
    g.beginPath(); g.arc(h.x, h.y, h.r - 1, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
    g.strokeStyle = 'rgba(60, 35, 15, 0.55)'; g.lineWidth = 2;
    g.beginPath(); g.arc(h.x, h.y, h.r - 1, Math.PI * 0.1, Math.PI * 0.9); g.stroke();
  }

  function drawBody(g, b, lift = 0) {
    g.save();
    g.translate(b.x, b.y - lift * 5);
    if (lift) g.scale(1 + lift * 0.04, 1 + lift * 0.04);
    switch (b.k.draw) {
      case 'marble': drawMarble(g, b); break;
      case 'puck': drawPuck(g, b); break;
      case 'cork': drawCork(g, b); break;
      case 'wood': drawWood(g, b); break;
      case 'die': drawDie(g, b); break;
      case 'bearing': drawBearing(g, b); break;
      case 'nut': drawNut(g, b); break;
      case 'steel': drawSteel(g, b); break;
      case 'magnet': drawMagnet(g, b); break;
    }
    g.restore();
  }

  let ringPhase = 0;
  function drawRing(g, b, colour, spin) {
    g.save();
    g.translate(b.x, b.y);
    g.rotate(ringPhase * spin);
    g.strokeStyle = colour;
    g.lineWidth = 2;
    g.setLineDash([6, 7]);
    g.beginPath(); g.arc(0, 0, b.bound + 8 + Math.sin(ringPhase) * 1.5, 0, Math.PI * 2); g.stroke();
    g.restore();
  }

  // 3, 2, 1, Go — each beat pops in large and settles while the tray sits still.
  function drawCountdown(g) {
    const n = Math.ceil(match.count) - 1;           // 3 while count is in (3,4], 0 is the off
    const p = Math.ceil(match.count) - match.count; // 0 -> 1 across the beat
    const label = n > 0 ? String(n) : 'Go';
    const pop = p < 0.22 ? 1 + (1 - p / 0.22) * 0.6 : 1;
    const fade = p < 0.08 ? p / 0.08 : p > 0.84 ? (1 - p) / 0.16 : 1;
    g.save();
    g.globalAlpha = 0.3 * fade;
    g.fillStyle = '#2a1c10';
    roundRect(g, 0, 0, W, H, 18); g.fill();
    g.translate(W / 2, H / 2);
    g.globalAlpha = (1 - p) * 0.5 * fade;           // a ring swelling out from behind the numeral
    g.strokeStyle = '#f6efe1'; g.lineWidth = 3;
    g.beginPath(); g.arc(0, 0, 70 + p * 130, 0, Math.PI * 2); g.stroke();
    g.globalAlpha = fade;
    g.scale(pop, pop);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `600 ${n > 0 ? 132 : 96}px Georgia, "Iowan Old Style", "Times New Roman", serif`;
    g.lineWidth = 9; g.lineJoin = 'round'; g.strokeStyle = 'rgba(36, 24, 14, 0.6)';
    g.strokeText(label, 0, 2);
    g.fillStyle = '#f6efe1';
    g.fillText(label, 0, 2);
    g.restore();
  }

  function draw(dt) {
    ringPhase += dt * 1.6;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.drawImage(bg, 0, 0);
    for (const h of holes) drawHole(ctx, h);

    // A marble on its way down is clipped to its hole, so it vanishes into it.
    for (const sk of sinking) {
      const t = Math.min(1, sk.t / SINK_TIME), e = t * t;
      ctx.save();
      ctx.beginPath(); ctx.arc(sk.h.x, sk.h.y, sk.h.r - 1, 0, Math.PI * 2); ctx.clip();
      ctx.globalAlpha = 1 - e * 0.85;
      ctx.translate(sk.h.x + (sk.b.x - sk.h.x) * (1 - e), sk.h.y + (sk.b.y - sk.h.y) * (1 - e) + e * 10);
      ctx.scale(1 - e * 0.7, 1 - e * 0.7);
      ctx.translate(-sk.b.x, -sk.b.y);
      drawBody(ctx, sk.b, 0);
      ctx.restore();
    }

    for (const b of bodies) if (!b.held) drawShadow(ctx, b, b.lift);
    for (const b of bodies) if (b.held) drawShadow(ctx, b, b.lift);
    if (match.on && match.aiBody) drawRing(ctx, match.aiBody, 'rgba(184, 99, 108, 0.8)', -0.4);
    if (ctrl) drawRing(ctx, ctrl, 'rgba(108, 143, 74, 0.75)', 0.4);
    for (const b of bodies) if (!b.held) drawBody(ctx, b, b.lift);
    for (const b of bodies) if (b.held) drawBody(ctx, b, b.lift);
    if (match.on && !match.over && match.count > 0) drawCountdown(ctx);
  }

  // ---------- adding & scenes ----------
  function add(kind, x, y, opts) {
    const b = makeBody(kind, x, y, opts);
    b.lift = 0;
    bodies.push(b);
    updateCount();
    return b;
  }

  function overlapsAny(x, y, r) {
    for (const b of bodies) {
      const d = Math.hypot(b.x - x, b.y - y);
      if (d < r + b.bound + 6) return true;
    }
    return false;
  }

  function addFree(kind) {
    const k = KINDS[kind];
    const bound = k.shape === 'circle' ? k.r : Math.hypot(k.w / 2, k.h / 2);
    let x = W / 2, y = H / 2;
    for (let tries = 0; tries < 60; tries++) {
      const spread = 0.25 + tries / 60 * 0.75;
      const cx = W / 2 + rand(-1, 1) * (W / 2 - RIM - bound - 10) * spread;
      const cy = H / 2 + rand(-1, 1) * (H / 2 - RIM - bound - 10) * spread;
      if (!overlapsAny(cx, cy, bound)) { x = cx; y = cy; break; }
    }
    const b = add(kind, x, y, { angle: k.shape === 'box' ? rand(-0.3, 0.3) : 0 });
    b.lift = 1;
    return b;
  }

  function removeBody(b) {
    const i = bodies.indexOf(b);
    if (i >= 0) bodies.splice(i, 1);
    if (ctrl === b) setControl(null);
    if (grab && grab.body === b) endGrab();
    updateCount();
  }

  function clearAll() {
    bodies.length = 0;
    setControl(null);
    endGrab();
    updateCount();
  }

  const SCENES = [
    ['A few things', () => {
      const cols = [...MARBLE_COLOURS].sort(() => Math.random() - 0.5);
      for (let i = 0; i < 5; i++) addFree(pick(['marble-s', 'marble-m', 'marble-l'])).colour = cols[i];
      addFree('block'); addFree('plank'); addFree('cork');
    }],
    ['Rack', () => {
      const r = KINDS['marble-m'].r, cx = W / 2 + 120, top = H / 2;
      const cols = [...MARBLE_COLOURS];
      let n = 0;
      for (let row = 0; row < 4; row++) {
        for (let i = 0; i <= row; i++) {
          const x = cx + row * r * 1.74, y = top + (i - row / 2) * r * 2.02;
          add('marble-m', x, y, { colour: cols[n++ % cols.length] });
        }
      }
      add('shooter', W / 2 - 220, H / 2, { colour: MARBLE_COLOURS[6] });
    }],
    ['Cradle', () => {
      const r = KINDS['marble-l'].r, y = H / 2;
      const col = MARBLE_COLOURS[3];
      for (let i = 0; i < 6; i++) add('marble-l', W / 2 - 2.5 * r * 2 + i * r * 2.001, y, { colour: col });
      add('marble-l', W / 2 - 220, y, { colour: MARBLE_COLOURS[2] });
      add('plank', W / 2, y - 120, { angle: 0 });
      add('plank', W / 2, y + 120, { angle: 0 });
    }],
    ['Blocks', () => {
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) add('block', W / 2 - 60 + i * 60, H / 2 - 40 + j * 60);
      add('plank', W / 2, H / 2 - 110);
      add('die', W / 2 + 160, H / 2 + 60, { angle: 0.3 });
      add('die', W / 2 + 200, H / 2 + 20, { angle: -0.5 });
      add('puck', W / 2 - 200, H / 2);
      for (let i = 0; i < 3; i++) addFree('marble-m');
    }],
    ['Empty tray', () => {}],
  ];

  function setScene(i) {
    clearAll();
    SCENES[i][1]();
    lastPairSound.clear();
    document.querySelectorAll('#scenes button').forEach((el, j) => el.classList.toggle('on', j === i));
  }

  // ---------- match ----------
  // Both sides own a colour and race to sink four marbles. Four of the five holes
  // are ringed in a colour and pay whoever owns the ring, whatever fell in — so
  // barging the other side's marble into one of yours scores, and letting your own
  // drift into one of theirs is a gift. The middle hole is nobody's and pays the
  // colour of the marble.
  let mode = 'sandbox';
  const TEAM = {
    you: { name: 'You', colour: MARBLE_COLOURS[3] },
    ai: { name: 'Opponent', colour: MARBLE_COLOURS[1] },
  };
  // `ease` is how well it judges the run-in: inside `dist` it brakes towards `speed`,
  // and anything still over SINK_SPEED at the hole rides across instead of dropping.
  const AI_LEVELS = [
    { name: 'Gentle', jitter: 0.35, wait: [1.2, 2.0], cap: 300, ease: { dist: 100, speed: 225 }, cool: [5.0, 7.0], spoil: 0 },
    { name: 'Even', jitter: 0.26, wait: [0.8, 1.4], cap: 400, ease: { dist: 120, speed: 215 }, cool: [3.5, 5.0], spoil: 0.35 },
    { name: 'Sharp', jitter: 0.09, wait: [0.5, 0.9], cap: 460, ease: { dist: 165, speed: 180 }, cool: [1.8, 2.8], spoil: 0.7 },
  ];
  const match = {
    on: false, over: false, you: 0, ai: 0, level: 1, count: 0, beat: -1,
    aiBody: null, aiHole: null, aiSpoil: null, aimFor: null, timer: 0, jitter: 0, cool: 0,
  };

  // Which side a hole pays out to when a marble owned by `team` drops in it.
  function paidBy(h, team) { return h.team || team; }

  function placeIn(kind, x0, x1, y0, y1, opts) {
    const bound = KINDS[kind].r;
    let x = (x0 + x1) / 2, y = (y0 + y1) / 2;
    for (let t = 0; t < 240; t++) {
      const cx = rand(x0, x1), cy = rand(y0, y1);
      if (overlapsAny(cx, cy, bound)) continue;
      let clash = false;
      for (const h of holes) if (Math.hypot(cx - h.x, cy - h.y) < h.r + bound + 26) { clash = true; break; }
      if (clash) continue;
      x = cx; y = cy; break;
    }
    return add(kind, x, y, opts);
  }

  function startMatch() {
    clearAll();
    holes.length = 0; sinking.length = 0;
    match.on = true; match.over = false;
    match.you = 0; match.ai = 0;
    match.aiBody = null; match.aiHole = null; match.aiSpoil = null; match.timer = 0;
    match.cool = 0;
    match.count = COUNTDOWN;                 // 3, 2, 1 before either side may move
    match.beat = -1;
    $('result').hidden = true;
    // Diagonally paired, so each half of the tray holds one of each colour and
    // there is always a hole worth aiming at and one worth steering clear of.
    for (const [hx, hy, team] of [
      [200, 150, 'you'], [W - 200, 150, 'ai'],
      [200, H - 150, 'ai'], [W - 200, H - 150, 'you'],
      [W / 2, H / 2, null],
    ]) holes.push({ x: hx, y: hy, r: HOLE_R, team });
    const y0 = RIM + 46, y1 = H - RIM - 46;
    for (let i = 0; i < 6; i++) placeIn('marble-m', RIM + 46, 330, y0, y1, { team: 'you', colour: TEAM.you.colour });
    for (let i = 0; i < 6; i++) placeIn('marble-m', W - 330, W - RIM - 46, y0, y1, { team: 'ai', colour: TEAM.ai.colour });
    lastPairSound.clear();
    updateMatchUI();
    let first = null, bestD = Infinity;
    for (const b of bodies) {
      if (b.team !== 'you') continue;
      for (const h of holes) {
        const d = Math.hypot(b.x - h.x, b.y - h.y);
        if (d < bestD) { bestD = d; first = b; }
      }
    }
    setControl(first);
  }

  function score(team) {
    if (team === 'you') match.you++; else match.ai++;
    if (team === 'ai') {                     // it takes a breath rather than chaining pots
      const c = AI_LEVELS[match.level].cool;
      match.cool = rand(c[0], c[1]);
    }
    updateMatchUI();
    if (match.over) return;
    if (match.you >= WIN_SCORE || match.ai >= WIN_SCORE) endMatch();
    else if (!bodies.some(b => b.team)) endMatch();
  }

  function endMatch() {
    match.over = true;
    setControl(null);
    match.aiBody = null;
    for (const b of bodies) { b.tx = 0; b.ty = 0; }
    const tie = match.you === match.ai;
    $('result-title').textContent = tie ? 'A draw' : match.you > match.ai ? 'You win' : 'The opponent wins';
    $('result-line').textContent = tie
      ? `${match.you} each. Nothing in it.`
      : `You sank ${match.you}, the opponent sank ${match.ai}.`;
    $('result').hidden = false;
  }

  function updateMatchUI() {
    const left = { you: 0, ai: 0 };
    for (const b of bodies) if (b.team) left[b.team]++;
    $('score-you').textContent = match.you;
    $('score-ai').textContent = match.ai;
    $('left-you').textContent = `${left.you} on the tray`;
    $('left-ai').textContent = `${left.ai} on the tray`;
  }

  function aiThink(dt) {
    if (!match.on || match.over) return;
    const lvl = AI_LEVELS[match.level];
    const mine = bodies.filter(b => b.team === 'ai');
    if (!mine.length) { match.aiBody = null; return; }
    if (match.aiSpoil && bodies.indexOf(match.aiSpoil) < 0) { match.aiSpoil = null; match.timer = 0; }
    if (match.cool > 0) { match.cool -= dt; match.aiBody = null; return; }

    match.timer -= dt;
    if (match.timer <= 0 || !match.aiBody || bodies.indexOf(match.aiBody) < 0) {
      match.timer = rand(lvl.wait[0], lvl.wait[1]);
      match.aiSpoil = null; match.aiHole = null;
      // Spoil first: a blue marble loitering by a hole is either about to score for
      // them — barge it off the line — or sitting by a red ring, in which case the
      // thing to do is drive straight through it and put it down for us.
      if (Math.random() < lvl.spoil) {
        let best = null, bestD = Infinity;
        for (const pm of bodies) {
          if (pm.team !== 'you') continue;
          let h0 = null, near = Infinity;
          for (const h of holes) {
            const d = Math.hypot(pm.x - h.x, pm.y - h.y);
            if (d < near) { near = d; h0 = h; }
          }
          if (near > 110) continue;
          const ours = paidBy(h0, 'you') === 'ai';
          for (const m of mine) {
            const d = Math.hypot(m.x - pm.x, m.y - pm.y);
            if (d > 260 || d >= bestD) continue;
            if (ours) {                              // only a shove if we are behind it
              const ax = pm.x - m.x, ay = pm.y - m.y;
              if (ax * (h0.x - pm.x) + ay * (h0.y - pm.y) <= 0) continue;
              bestD = d; best = { m, pm, h: h0 };
            } else {
              bestD = d; best = { m, pm, h: null };
            }
          }
        }
        if (best) {
          match.aiBody = best.m;
          match.aiSpoil = best.h ? null : best.pm;   // shove it through, or just knock it off
          match.aiHole = best.h;
        }
      }
      if (!match.aiSpoil && !match.aiHole) {         // otherwise take the shortest pot that pays us
        let best = null, bestD = Infinity;
        for (const m of mine) for (const h of holes) {
          if (paidBy(h, 'ai') !== 'ai') continue;
          const d = Math.hypot(m.x - h.x, m.y - h.y);
          if (d < bestD) { bestD = d; best = { m, h }; }
        }
        match.aiBody = best.m; match.aiHole = best.h;
      }
    }

    const b = match.aiBody;
    if (!b || bodies.indexOf(b) < 0) { match.aiBody = null; return; }
    if (match.aimFor !== b) {                 // one aiming error per marble, kept until it swaps
      match.aimFor = b;
      match.jitter = rand(-1, 1) * lvl.jitter;
    }
    const tgt = match.aiSpoil || match.aiHole;
    if (!tgt) return;
    const d = Math.hypot(tgt.x - b.x, tgt.y - b.y), sp = Math.hypot(b.vx, b.vy);
    let a;
    if (!match.aiSpoil && d < lvl.ease.dist && sp > lvl.ease.speed) {
      a = Math.atan2(b.vy, b.vx) + Math.PI;   // stand on the brakes so it drops in rather than skims
    } else {
      a = Math.atan2(tgt.y - b.y, tgt.x - b.x) + match.jitter;
    }
    b.tx = Math.cos(a); b.ty = Math.sin(a); b.tcap = lvl.cap;
  }

  function setLevel(i) {
    match.level = i;
    document.querySelectorAll('#levels button').forEach((el, j) => el.classList.toggle('on', j === i));
  }

  function setMode(m) {
    mode = m;
    $('result').hidden = true;
    $('side-sandbox').hidden = m !== 'sandbox';
    $('side-match').hidden = m !== 'match';
    for (const [id, want] of [['mode-sandbox', 'sandbox'], ['mode-match', 'match']]) {
      $(id).classList.toggle('on', m === want);
      $(id).setAttribute('aria-pressed', String(m === want));
    }
    if (m === 'match') {
      startMatch();
      $('note').textContent = 'A hole pays the colour of its ring, whatever drops in. Steer your marbles into the blue ones, and their marbles too. First to four wins.';
    } else {
      match.on = false; match.over = false; match.aiBody = null;
      holes.length = 0; sinking.length = 0;
      setScene(0);
      $('note').textContent = 'Drag things about. Click one to steer it with WASD or the arrow keys. With nothing picked, the keys tilt the tray.';
    }
  }

  function updateCount() {
    const n = bodies.length;
    $('count').textContent = n === 0 ? 'Nothing on it' : n === 1 ? '1 thing' : `${n} things`;
  }

  // ---------- control ----------
  function describe(b) {
    if (!b) return '';
    if (b.k.draw === 'marble') return `the ${b.colour.name.replace('-', ' ')} ${b.k.label.toLowerCase()}`;
    return `the ${b.k.label.toLowerCase()}`;
  }

  function canControl(b) { return !match.on || (!!b && b.team === 'you'); }

  function setControl(b) {
    if (b && !canControl(b)) return;
    if (ctrl && ctrl !== b) { ctrl.tx = 0; ctrl.ty = 0; }
    ctrl = b;
    $('btn-letgo').disabled = !b;
    $('steer').innerHTML = b
      ? `Steering <b>${describe(b)}</b> with WASD or the arrows.`
      : match.on
        ? 'Nothing picked. Click one of your marbles, or tilt the tray with the arrows.'
        : 'Nothing picked. The arrow keys tilt the tray.';
  }

  function cycleControl() {
    const list = match.on ? bodies.filter(b => b.team === 'you') : bodies;
    if (!list.length) return;
    const i = ctrl ? list.indexOf(ctrl) : -1;
    setControl(list[(i + 1) % list.length]);
  }

  // ---------- pointer ----------
  function toWorld(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
  }

  function pickBody(p) {
    for (let i = bodies.length - 1; i >= 0; i--) {
      const b = bodies[i];
      if (b.shape === 'circle') {
        if (Math.hypot(p.x - b.x, p.y - b.y) <= b.r + 3) return b;
      } else {
        const c = Math.cos(-b.angle), s = Math.sin(-b.angle);
        const dx = p.x - b.x, dy = p.y - b.y;
        const lx = dx * c - dy * s, ly = dx * s + dy * c;
        if (Math.abs(lx) <= b.hw + 3 && Math.abs(ly) <= b.hh + 3) return b;
      }
    }
    return null;
  }

  function startGrab(b, p, pointerId, fromShelf) {
    const c = Math.cos(-b.angle), s = Math.sin(-b.angle);
    const dx = p.x - b.x, dy = p.y - b.y;
    grab = {
      body: b, pointerId, px: p.x, py: p.y, x0: p.x, y0: p.y, moved: !!fromShelf,
      lx: fromShelf ? 0 : dx * c - dy * s, ly: fromShelf ? 0 : dx * s + dy * c,
    };
    b.held = true;
    bodies.splice(bodies.indexOf(b), 1); bodies.push(b);   // draw on top
    canvas.classList.add('holding');
  }

  function endGrab() {
    if (!grab) return;
    grab.body.held = false;
    grab = null;
    canvas.classList.remove('holding');
  }

  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    sound.ensure();
    const p = toWorld(e);
    const b = pickBody(p);
    if (match.on) {
      // Dragging by hand would trivially win a match, so a click only ever picks.
      setControl(b && b.team === 'you' && b !== ctrl ? b : null);
    } else if (b) {
      startGrab(b, p, e.pointerId, false);
      try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    } else {
      setControl(null);
    }
    e.preventDefault();
  });

  window.addEventListener('pointermove', e => {
    if (pending && match.on) { pending = null; return; }
    if (pending && e.pointerId === pending.pointerId) {
      if (Math.hypot(e.clientX - pending.x0, e.clientY - pending.y0) > 8) {
        const p = toWorld(e);
        const k = KINDS[pending.kind];
        const bound = k.shape === 'circle' ? k.r : Math.hypot(k.w / 2, k.h / 2);
        const b = add(pending.kind, clamp(p.x, RIM + bound, W - RIM - bound), clamp(p.y, RIM + bound, H - RIM - bound));
        startGrab(b, p, e.pointerId, true);
        pending = null;
      }
      return;
    }
    if (grab && e.pointerId === grab.pointerId) {
      const p = toWorld(e);
      grab.px = p.x; grab.py = p.y;
      if (!grab.moved && Math.hypot(p.x - grab.x0, p.y - grab.y0) > 5) grab.moved = true;
    }
  });

  function pointerEnd(e) {
    if (pending && e.pointerId === pending.pointerId) {
      if (e.type === 'pointerup') addFree(pending.kind);
      pending = null;
    }
    if (grab && e.pointerId === grab.pointerId) {
      const b = grab.body;
      if (!grab.moved && e.type === 'pointerup') setControl(b === ctrl ? null : b);
      endGrab();
    }
  }
  window.addEventListener('pointerup', pointerEnd);
  window.addEventListener('pointercancel', pointerEnd);
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  // ---------- keyboard ----------
  window.addEventListener('keydown', e => {
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    const k = KEYMAP[e.code];
    if (k) { keys.add(k); keyDir(); e.preventDefault(); return; }
    if (e.code === 'Escape') { setControl(null); return; }
    if (e.code === 'Tab') { cycleControl(); e.preventDefault(); return; }
    if ((e.code === 'Delete' || e.code === 'Backspace') && ctrl && !match.on) { removeBody(ctrl); e.preventDefault(); }
  });
  window.addEventListener('keyup', e => {
    const k = KEYMAP[e.code];
    if (k) { keys.delete(k); keyDir(); }
  });
  window.addEventListener('blur', () => { keys.clear(); keyDir(); });

  // ---------- shelf ----------
  function buildShelf() {
    const wrap = $('items');
    for (const kind of PALETTE) {
      const k = KINDS[kind];
      const btn = document.createElement('button');
      btn.className = 'item'; btn.type = 'button'; btn.dataset.kind = kind; btn.title = k.label;
      const icon = document.createElement('canvas');
      icon.width = 88; icon.height = 88;
      const label = document.createElement('span');
      label.textContent = k.label;
      btn.append(icon, label);
      wrap.appendChild(btn);

      const g = icon.getContext('2d');
      const preview = makeBody(kind, 0, 0, { colour: MARBLE_COLOURS[PALETTE.indexOf(kind) % MARBLE_COLOURS.length], pips: 5, angle: k.shape === 'box' ? -0.35 : 0 });
      preview.lift = 0;
      const scale = Math.min(1.25, 32 / preview.bound);
      g.setTransform(2 * scale, 0, 0, 2 * scale, 88 / 2, 88 / 2);
      drawShadow(g, preview, 0);
      drawBody(g, preview, 0);

      btn.addEventListener('pointerdown', e => {
        if (e.button !== 0 && e.pointerType === 'mouse') return;
        sound.ensure();
        pending = { kind, pointerId: e.pointerId, x0: e.clientX, y0: e.clientY };
        e.preventDefault();
      });
      btn.addEventListener('keydown', e => {
        if (e.code === 'Enter' || e.code === 'Space') { addFree(kind); e.preventDefault(); }
      });
    }
  }

  // ---------- panel buttons ----------
  function buildPanels() {
    const sc = $('scenes');
    SCENES.forEach(([name], i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = name;
      b.addEventListener('click', () => setScene(i));
      sc.appendChild(b);
    });
    $('mode-sandbox').addEventListener('click', () => setMode('sandbox'));
    $('mode-match').addEventListener('click', () => setMode('match'));
    $('btn-rematch').addEventListener('click', startMatch);
    $('btn-result-again').addEventListener('click', startMatch);
    $('btn-result-close').addEventListener('click', () => { $('result').hidden = true; });
    const lv = $('levels');
    AI_LEVELS.forEach((l, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = l.name;
      b.addEventListener('click', () => setLevel(i));
      lv.appendChild(b);
    });
    $('btn-letgo').addEventListener('click', () => setControl(null));
    $('btn-tidy').addEventListener('click', clearAll);
    $('btn-nudge').addEventListener('click', () => {
      for (const b of bodies) {
        const a = rand(0, Math.PI * 2), s = rand(120, 320) / Math.sqrt(b.mass / 5 + 0.3);
        b.vx += Math.cos(a) * s; b.vy += Math.sin(a) * s;
        b.w += rand(-2, 2);
      }
    });
    $('btn-sound').addEventListener('click', () => {
      sound.on = !sound.on;
      if (sound.on) { sound.ensure(); if (sound.ac && sound.ac.state === 'suspended') sound.ac.resume(); }
      $('btn-sound').textContent = sound.on ? 'Sound: on' : 'Sound: off';
      $('btn-sound').setAttribute('aria-pressed', String(sound.on));
    });
    $('btn-help').addEventListener('click', () => { $('help').hidden = false; });
    $('btn-help-close').addEventListener('click', () => { $('help').hidden = true; });
    $('help').addEventListener('click', e => { if (e.target === $('help')) $('help').hidden = true; });
  }

  // ---------- main loop ----------
  let last = performance.now();
  function frame(now) {
    let dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    if (document.hidden) dt = 0;

    // Nobody moves during the 3-2-1 — you may still click the marble you want first.
    const counting = match.on && !match.over && match.count > 0;
    if (counting && dt > 0) {
      match.count = Math.max(0, match.count - dt);
      const n = match.count > 0 ? Math.ceil(match.count) - 1 : -1;
      if (n !== match.beat) { match.beat = n; sound.beat(n); }
    }

    const wantX = counting || ctrl ? 0 : kdx, wantY = counting || ctrl ? 0 : kdy;
    const ease = Math.min(1, 5 * dt);
    tiltX += (wantX - tiltX) * ease; tiltY += (wantY - tiltY) * ease;
    if (Math.abs(tiltX) < 0.002) tiltX = 0;
    if (Math.abs(tiltY) < 0.002) tiltY = 0;
    gx = tiltX * TILT_G; gy = tiltY * TILT_G;
    $('bubble').style.transform = `translate(${(-tiltX * 17).toFixed(1)}px, ${(-tiltY * 17).toFixed(1)}px)`;

    for (const b of bodies) { b.tx = 0; b.ty = 0; }
    if (ctrl && (kdx || kdy) && !counting) { ctrl.tx = kdx; ctrl.ty = kdy; ctrl.tcap = STEER_MAX; }
    if (match.on && dt > 0 && !counting) aiThink(dt);

    if (dt > 0) {
      const sub = dt / SUBSTEPS;
      for (let i = 0; i < SUBSTEPS; i++) step(sub, now);
    }
    for (let i = sinking.length - 1; i >= 0; i--) {
      sinking[i].t += dt;
      if (sinking[i].t >= SINK_TIME) sinking.splice(i, 1);
    }
    for (const b of bodies) {
      const want = b.held ? 1 : 0;
      b.lift += (want - b.lift) * Math.min(1, 10 * dt);
      if (Math.abs(b.lift - want) < 0.01) b.lift = want;
      if (b.flip) b.flip = Math.max(0, b.flip - dt * (b.flipRate || DIE_FLIP_MIN));
    }
    if (soundQueue.length) {
      for (const s of soundQueue) sound.hit(s.a, s.b, s.speed);
      soundQueue.length = 0;
    }
    draw(dt);
    requestAnimationFrame(frame);
  }

  buildShelf();
  buildPanels();
  setLevel(match.level);
  setMode('sandbox');
  requestAnimationFrame(frame);

  // Exposed for testing in a console: window.__tray.bodies etc.
  window.__tray = {
    bodies, holes, sinking, match, add, addFree, setScene, setMode, setLevel, startMatch,
    setControl, aiThink, get ctrl() { return ctrl; }, KINDS,
  };
})();
