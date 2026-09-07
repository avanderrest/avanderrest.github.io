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
  const STEEPS = [['Gentle', 0.5], ['Normal', 1], ['Steep', 1.9]];   // how hard a tilt pulls
  const LEAN_PX = 5;                        // px the whole tray settles downhill at full tilt
  const LEAN_KICK = 150;                    // px/s of lurch per unit of tilt change
  const LEAN_K = 200, LEAN_D = 6;           // spring and damping that pull the lurch back to the lean
  const MAG_ACCEL = 1500;                   // px/s² of pull with the steel right on the magnet
  const MAG_RANGE = 340;                    // px beyond which the magnet does nothing
  const HOLE_R = 30;                        // radius of a hole in the match tray
  const HOLE_PULL = 900;                    // px/s² the lip of a hole draws a marble in by
  const SINK_SPEED = 300;                   // over this, a marble rides straight across
  const SINK_TIME = 0.34;                   // seconds a marble takes to disappear
  const TEAM_MARBLES = 6;                   // marbles each side starts a match with
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
      striker: !!opts.striker,          // the shooter a side drives; not worth a point itself
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

  // ---------- fixtures ----------
  // Furniture: things screwed down to the tray that everything else has to get past. They never
  // move under their own steam, so the solver sees them as infinite-mass bodies exactly like the
  // rim. A compound fixture — the funnel, the chute, the cup — is several parts sharing a group
  // id, so dragging, turning or deleting one takes the whole thing.
  // `catch` marks a fixture that holds on to what lands in it, which is what the puzzles want.
  const FIXTURES = {
    peg: {
      label: 'Peg', rest: 0.68, mu: 0.12, material: 'wood', tint: '#c69b62',
      parts: [{ shape: 'circle', r: 11 }],
    },
    post: {
      label: 'Post', rest: 0.45, mu: 0.26, material: 'wood', tint: '#b08650',
      parts: [{ shape: 'circle', r: 22 }],
    },
    bumper: {
      label: 'Bumper', rest: 1.3, mu: 0.08, material: 'rubber', bouncy: true, tint: '#c25f57',
      parts: [{ shape: 'circle', r: 17 }],
    },
    rail: {
      label: 'Rail', rest: 0.3, mu: 0.3, material: 'wood', turn: true, tint: '#b98a52',
      parts: [{ shape: 'box', w: 168, h: 13 }],
    },
    stub: {
      label: 'Short rail', rest: 0.3, mu: 0.3, material: 'wood', turn: true, tint: '#b98a52',
      parts: [{ shape: 'box', w: 84, h: 13 }],
    },
    kerb: {
      label: 'Kerb', rest: 0.22, mu: 0.36, material: 'stone', turn: true, tint: '#9aa0a4',
      parts: [{ shape: 'box', w: 46, h: 30 }],
    },
    // The neck is a clear 38px, so anything up to an ordinary marble drops through and the big
    // marble, the shooter and the puck sit on top of it. That is the sorter, and it comes free
    // with the geometry rather than with a rule.
    funnel: {
      label: 'Funnel', rest: 0.28, mu: 0.28, material: 'wood', turn: true, tint: '#b98a52',
      parts: [
        { shape: 'box', w: 112, h: 12, x: -68, y: -22, a: 0.62 },
        { shape: 'box', w: 112, h: 12, x: 68, y: -22, a: -0.62 },
      ],
    },
    chute: {
      label: 'Chute', rest: 0.24, mu: 0.26, material: 'wood', turn: true, tint: '#b98a52',
      parts: [
        { shape: 'box', w: 168, h: 12, x: 0, y: -26 },
        { shape: 'box', w: 168, h: 12, x: 0, y: 26 },
      ],
    },
    cup: {
      label: 'Cup', rest: 0.18, mu: 0.42, material: 'wood', turn: true, tint: '#a9763f',
      catch: { x: 0, y: 4, r: 32 },
      parts: [
        { shape: 'box', w: 12, h: 78, x: -40, y: -4 },
        { shape: 'box', w: 12, h: 78, x: 40, y: -4 },
        { shape: 'box', w: 92, h: 12, x: 0, y: 41 },
      ],
    },
  };
  const FIXTURE_LIST = ['peg', 'post', 'bumper', 'rail', 'stub', 'kerb', 'funnel', 'chute', 'cup'];

  const fixtures = [];          // every static part on the tray, rim excluded
  const fixGroups = [];         // ...grouped into the things you actually placed
  let nextGroup = 1;

  // One fixture is a group of parts. `reach` is how far the whole thing extends from its origin,
  // which is what the pointer, the turn handle and the tray clamp all measure against.
  function makeFixture(fkind, x, y, angle = 0, id = 0) {
    const f = FIXTURES[fkind];
    const group = { id: id || nextGroup++, fkind, f, x, y, angle, parts: [], reach: 0, sel: false };
    for (const spec of f.parts) {
      const part = {
        id: nextId++, static: true, fixture: true, group, shape: spec.shape,
        x: 0, y: 0, angle: 0, vx: 0, vy: 0, w: 0,
        im: 0, iI: 0, mass: Infinity, rest: f.rest, mu: f.mu, material: f.material,
        bouncy: !!f.bouncy, spec, wv: [], wn: [],
      };
      if (spec.shape === 'circle') { part.r = spec.r; part.bound = spec.r; }
      else { part.hw = spec.w / 2; part.hh = spec.h / 2; part.bound = Math.hypot(part.hw, part.hh); }
      group.parts.push(part);
    }
    placeFixture(group, x, y, angle);
    return group;
  }

  function placeFixture(g, x, y, angle) {
    g.x = x; g.y = y; g.angle = angle;
    const c = Math.cos(angle), s = Math.sin(angle);
    let reach = 0;
    for (const part of g.parts) {
      const sx = part.spec.x || 0, sy = part.spec.y || 0;
      part.x = x + sx * c - sy * s;
      part.y = y + sx * s + sy * c;
      part.angle = angle + (part.spec.a || 0);
      updateVerts(part);
      reach = Math.max(reach, Math.hypot(sx, sy) + part.bound);
    }
    g.reach = reach;
    if (g.f.catch) {
      const cx = g.f.catch.x, cy = g.f.catch.y;
      g.cx = x + cx * c - cy * s; g.cy = y + cx * s + cy * c;
    }
  }

  function addFixture(fkind, x, y, angle = 0) {
    const g = makeFixture(fkind, x, y, angle);
    clampFixture(g);
    for (const part of g.parts) fixtures.push(part);
    fixGroups.push(g);
    updateCount();
    return g;
  }

  function clampFixture(g) {
    const r = g.reach;
    placeFixture(g, clamp(g.x, RIM + r * 0.35, W - RIM - r * 0.35), clamp(g.y, RIM + r * 0.35, H - RIM - r * 0.35), g.angle);
  }

  function removeFixture(g) {
    for (const part of g.parts) { const i = fixtures.indexOf(part); if (i >= 0) fixtures.splice(i, 1); }
    const j = fixGroups.indexOf(g);
    if (j >= 0) fixGroups.splice(j, 1);
    if (fsel === g) setFixSel(null);
    updateCount();
  }

  function clearFixtures() {
    fixtures.length = 0; fixGroups.length = 0;
    setFixSel(null);
  }

  // The pointer hits a fixture if it is inside any of its parts, with a little slack so the
  // thin rails are not fiddly.
  function pickFixture(p) {
    for (let i = fixGroups.length - 1; i >= 0; i--) {
      const g = fixGroups[i];
      if (Math.hypot(p.x - g.x, p.y - g.y) > g.reach + 12) continue;
      for (const part of g.parts) {
        if (part.shape === 'circle') {
          if (Math.hypot(p.x - part.x, p.y - part.y) <= part.r + 4) return g;
        } else {
          const c = Math.cos(-part.angle), s = Math.sin(-part.angle);
          const dx = p.x - part.x, dy = p.y - part.y;
          const lx = dx * c - dy * s, ly = dx * s + dy * c;
          if (Math.abs(lx) <= part.hw + 5 && Math.abs(ly) <= part.hh + 5) return g;
        }
      }
    }
    return null;
  }

  // The turn handle: a small knob out to one side of whatever is selected. Dragging it swings
  // the fixture round, which is the whole of the rotation interface.
  const HANDLE_OUT = 26, HANDLE_R = 11;
  function handlePos(g) {
    const d = g.reach + HANDLE_OUT;
    return { x: g.x + Math.cos(g.angle) * d, y: g.y + Math.sin(g.angle) * d };
  }
  function overHandle(g, p) {
    if (!g || !g.f.turn) return false;
    const h = handlePos(g);
    return Math.hypot(p.x - h.x, p.y - h.y) <= HANDLE_R + 5;
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
    // Normally the duller of the two decides the bounce. A bumper is the exception: it is
    // rubber under tension and gives back more than it took, so it wins the argument.
    const e = (A.bouncy || B.bouncy) ? Math.max(A.rest, B.rest) : Math.min(A.rest, B.rest);
    const mu = Math.sqrt(A.mu * B.mu);
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
  let ctrl2 = null;       // the second player's marble in a two-player match
  let pending = null;     // palette item being dragged in
  // Two halves of the keyboard, kept apart so a two-player match can give one to each side.
  // Everywhere else they are read together and it makes no difference which was pressed.
  const keysA = new Set(), keysB = new Set();
  const KEYMAP = {
    KeyW: { d: 'up', s: 'a' }, KeyS: { d: 'down', s: 'a' },
    KeyA: { d: 'left', s: 'a' }, KeyD: { d: 'right', s: 'a' },
    ArrowUp: { d: 'up', s: 'b' }, ArrowDown: { d: 'down', s: 'b' },
    ArrowLeft: { d: 'left', s: 'b' }, ArrowRight: { d: 'right', s: 'b' },
  };
  let kdx = 0, kdy = 0;   // both halves together
  let k1x = 0, k1y = 0;   // WASD alone
  let k2x = 0, k2y = 0;   // the arrows alone
  let tiltX = 0, tiltY = 0, gx = 0, gy = 0;
  // The tray leans two ways at once: a lock you set and leave (the pad under the tray, or Shift
  // and an arrow) and whatever you are holding down right now. They add, and the sum is capped at
  // a full tilt. The lock is the thing that makes a marble run run — a held key is not a slope.
  let lockX = 0, lockY = 0;
  let steep = 1;          // index into STEEPS
  // Steering and rotating are switches rather than things that happen to be true. Off, a click
  // drags; on, a click drives or turns. Both start off, so nothing surprises the first click.
  let steerMode = false, rotateMode = false;

  function dirOf(...sets) {
    const has = d => sets.some(s => s.has(d));
    let x = (has('right') ? 1 : 0) - (has('left') ? 1 : 0);
    let y = (has('down') ? 1 : 0) - (has('up') ? 1 : 0);
    const l = Math.hypot(x, y);
    if (l > 0) { x /= l; y /= l; }
    return [x, y];
  }

  function keyDir() {
    [kdx, kdy] = dirOf(keysA, keysB);
    [k1x, k1y] = dirOf(keysA);
    [k2x, k2y] = dirOf(keysB);
  }
  // Set the tilt directly. Only the smoke tests use this; the keys go through keyDir.
  function tiltTo(x, y) { kdx = x; kdy = y; }

  // The lock is one step per axis, so pressing a direction twice takes that lean off again and
  // two directions at once gives a corner. 'flat' levels the whole tray.
  function setLock(dir) {
    if (match.on) return;                       // the holes only sit still on a level tray
    if (dir === 'flat') { lockX = 0; lockY = 0; }
    else if (dir === 'left') lockX = lockX === -1 ? 0 : -1;
    else if (dir === 'right') lockX = lockX === 1 ? 0 : 1;
    else if (dir === 'up') lockY = lockY === -1 ? 0 : -1;
    else if (dir === 'down') lockY = lockY === 1 ? 0 : 1;
    syncTilt();
  }

  function setSteep(i) {
    steep = clamp(i, 0, STEEPS.length - 1);
    document.querySelectorAll('#steeps button').forEach((el, j) => el.classList.toggle('on', j === steep));
  }

  function syncTilt() {
    document.querySelectorAll('#dpad button').forEach(el => {
      const d = el.dataset.tilt;
      const on = d === 'left' ? lockX === -1 : d === 'right' ? lockX === 1
        : d === 'up' ? lockY === -1 : d === 'down' ? lockY === 1 : false;
      el.classList.toggle('on', on);
    });
    const flat = document.querySelector('#dpad .flat');
    if (flat) flat.disabled = !lockX && !lockY;
    updateSteerNote();
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
      for (const part of fixtures) {
        const dx = part.x - A.x, dy = part.y - A.y, r = A.bound + part.bound;
        if (dx * dx + dy * dy >= r * r) continue;
        const m = collide(A, part);
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
    if (ctrl2 === b) setControl2(null);
    if (grab && grab.body === b) endGrab();
    if (match.shot && match.shot.m === b) match.shot = null;
    // A ringed hole pays its own colour, whoever fell in. Shooters are too fat to fit down
    // one at all, so nothing here ever has to decide what a side scores off itself.
    if (b.team) score(h.team || b.team);
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
    tap() {                                              // a shooter being set down on the tray
      if (!this.on || !this.ac) return;
      const t = this.ac.currentTime;
      this.burst(1500, 4, 0.05, 0.05, t);
      this.tone('sine', 300, 0.05, 0.09, t);
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
      } else if (mats.includes('rubber')) {
        this.tone('sine', clamp(260 - size * 2, 120, 260), v * 0.3, 0.1, t);
        this.burst(420, 2.5, v * 0.16, 0.04, t);
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
    // A cube turning over shows the change as a swap, not a fold: at this size the
    // honest edge-on geometry only read as a flat picture flipping. So the old face
    // goes out and the new one comes in, overlapping just enough to look continuous
    // and over fast enough that the eye takes it for a tumble. Only the pips move —
    // shading the whole face through the turn read as the die flashing rather than
    // turning, so the bone stays exactly as lit as it was.
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

  // ---------- drawing fixtures ----------
  // Everything bolted down is drawn a shade darker and flatter than the loose things, so the
  // tray reads at a glance as furniture underneath and toys on top.
  function drawFixturePart(g, part, tint) {
    g.save();
    g.translate(part.x, part.y);
    if (part.shape === 'circle') {
      const r = part.r;
      const grad = g.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.05, 0, 0, r);
      grad.addColorStop(0, shade(tint, 46));
      grad.addColorStop(1, shade(tint, -34));
      g.fillStyle = grad;
      g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(60, 38, 14, 0.5)'; g.lineWidth = 1.2;
      g.beginPath(); g.arc(0, 0, r - 0.6, 0, Math.PI * 2); g.stroke();
      // the screw head that says it is fixed
      g.strokeStyle = 'rgba(60, 38, 14, 0.35)'; g.lineWidth = Math.max(1.2, r * 0.13);
      g.beginPath(); g.moveTo(-r * 0.38, 0); g.lineTo(r * 0.38, 0); g.stroke();
    } else {
      g.rotate(part.angle);
      const w = part.hw * 2, h = part.hh * 2;
      const grad = g.createLinearGradient(0, -part.hh, 0, part.hh);
      grad.addColorStop(0, shade(tint, 34));
      grad.addColorStop(1, shade(tint, -30));
      g.fillStyle = grad;
      roundRect(g, -part.hw, -part.hh, w, h, 4); g.fill();
      g.strokeStyle = 'rgba(255, 240, 215, 0.35)'; g.lineWidth = 1.2;
      roundRect(g, -part.hw + 1.5, -part.hh + 1.5, w - 3, h - 3, 3); g.stroke();
      g.strokeStyle = 'rgba(60, 38, 14, 0.55)'; g.lineWidth = 1;
      roundRect(g, -part.hw + 0.5, -part.hh + 0.5, w - 1, h - 1, 4); g.stroke();
    }
    g.restore();
  }

  function drawFixture(g, grp) {
    // a soft contact shadow, so furniture still sits on the tray rather than floating in it
    g.save();
    g.globalAlpha = 0.16;
    g.fillStyle = '#3a2614';
    for (const part of grp.parts) {
      g.save(); g.translate(part.x + 2, part.y + 3);
      if (part.shape === 'circle') { g.beginPath(); g.arc(0, 0, part.r + 1, 0, Math.PI * 2); g.fill(); }
      else { g.rotate(part.angle); roundRect(g, -part.hw - 1, -part.hh - 1, part.hw * 2 + 2, part.hh * 2 + 2, 5); g.fill(); }
      g.restore();
    }
    g.restore();
    for (const part of grp.parts) drawFixturePart(g, part, grp.f.tint);
    if (grp.f.catch) {
      g.save();
      g.strokeStyle = 'rgba(120, 88, 44, 0.4)'; g.lineWidth = 1.5; g.setLineDash([4, 5]);
      g.beginPath(); g.arc(grp.cx, grp.cy, grp.f.catch.r, 0, Math.PI * 2); g.stroke();
      g.restore();
    }
    if (grp.sel) {
      g.save();
      g.strokeStyle = 'rgba(108, 143, 74, 0.85)'; g.lineWidth = 2; g.setLineDash([6, 5]);
      g.beginPath(); g.arc(grp.x, grp.y, grp.reach + 8, 0, Math.PI * 2); g.stroke();
      g.setLineDash([]);
      if (grp.f.turn && rotateMode) {
        const h = handlePos(grp);
        g.strokeStyle = 'rgba(108, 143, 74, 0.6)';
        g.beginPath(); g.moveTo(grp.x, grp.y); g.lineTo(h.x, h.y); g.stroke();
        g.fillStyle = '#f3ead9'; g.strokeStyle = '#6c8f4a'; g.lineWidth = 2;
        g.beginPath(); g.arc(h.x, h.y, HANDLE_R, 0, Math.PI * 2); g.fill(); g.stroke();
        // two little arrows to say it turns
        g.strokeStyle = '#6c8f4a'; g.lineWidth = 1.6;
        g.beginPath(); g.arc(h.x, h.y, HANDLE_R * 0.48, 0.6, 4.2); g.stroke();
      }
      g.restore();
    }
  }

  // ---------- placing and turning ----------
  let fsel = null;      // the selected fixture group
  let fdrag = null;     // { group, mode: 'move' | 'turn', dx, dy, pointerId, moved }
  let armed = null;     // a fixture kind waiting to be dropped on the tray

  function setFixSel(g) {
    if (fsel) fsel.sel = false;
    fsel = g;
    if (g) g.sel = true;
    updateBuildNote();
  }

  function setArmed(kind) {
    armed = kind;
    document.querySelectorAll('#fixtures .item').forEach(el => el.classList.toggle('armed', el.dataset.fkind === kind));
    canvas.classList.toggle('placing', !!armed);
    if (kind) {
      canvas.classList.remove('turning');
      if (shelfTab !== FIXED_TAB) setShelfTab(FIXED_TAB);
    } else {
      canvas.classList.toggle('turning', rotateMode);
    }
    updateBuildNote();
  }

  function updateBuildNote() {
    const el = $('build-note');
    if (!el) return;
    if (armed) el.textContent = `Click the tray to put down a ${FIXTURES[armed].label.toLowerCase()}. Escape to stop.`;
    else if (fsel && rotateMode) el.textContent = fsel.f.turn
      ? `${fsel.f.label} picked. Drag anywhere to swing it round, [ and ] to nudge the angle, Delete to take it away.`
      : `${fsel.f.label} picked. It does not turn — drag it to move it, Delete to take it away.`;
    else if (fsel) el.textContent = `${fsel.f.label} picked. Drag it about, Rotate to turn it, Delete to take it away.`;
    else if (rotateMode) el.textContent = 'Rotate is on. Click something bolted down, then drag to swing it round.';
    else el.textContent = 'Pick furniture from the Bolt down tab, then click the tray. Click a fixture already down to move it.';
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
    // The halves are marked out while the numbers run: a click in one puts that side's
    // shooter down there, and neither side may set up in the other's half.
    g.globalAlpha = 0.5 * fade;
    g.strokeStyle = '#f6efe1'; g.lineWidth = 2; g.setLineDash([9, 11]);
    g.beginPath(); g.moveTo(W / 2, RIM); g.lineTo(W / 2, H - RIM); g.stroke();
    g.setLineDash([]);
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
    if (n > 0) {
      g.save();
      g.globalAlpha = 0.92 * fade;
      g.translate(W / 2, H - 62);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = '500 21px Georgia, "Iowan Old Style", "Times New Roman", serif';
      g.lineWidth = 6; g.lineJoin = 'round'; g.strokeStyle = 'rgba(36, 24, 14, 0.6)';
      const hint = match.two
        ? 'Click each half to set the shooters down'
        : 'Click your half to set your shooter down';
      g.strokeText(hint, 0, 0);
      g.fillStyle = '#f6efe1';
      g.fillText(hint, 0, 0);
      g.restore();
    }
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

    for (const g of fixGroups) drawFixture(ctx, g);
    for (const b of bodies) if (!b.held) drawShadow(ctx, b, b.lift);
    for (const b of bodies) if (b.held) drawShadow(ctx, b, b.lift);
    if (match.on && match.theirs) drawRing(ctx, match.theirs, 'rgba(184, 99, 108, 0.8)', -0.4);
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

  function clearAll(keepFixtures) {
    bodies.length = 0;
    if (!keepFixtures) clearFixtures();
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
    // The three below are the furniture showing what it is for: a run, a sorter and a wall of
    // pegs. All of them are made only of things on the two shelves, so any of them can be taken
    // apart and rebuilt by hand.
    ['Marble run', () => {
      // Two vees, one above the other, gathering everything into a cup at the bottom. Tilt the
      // tray forwards and the whole tray drains into it.
      addFixture('rail', 258, 170, 0.5);
      addFixture('rail', 702, 170, -0.5);
      addFixture('rail', 382, 320, 0.5);
      addFixture('rail', 578, 320, -0.5);
      addFixture('cup', 480, 470);
      addFixture('peg', 480, 236);
      addFixture('bumper', 148, 330);
      addFixture('bumper', 812, 330);
      const cols = [...MARBLE_COLOURS].sort(() => Math.random() - 0.5);
      for (let i = 0; i < 6; i++) add('marble-m', 300 + i * 76, 70, { colour: cols[i] });
      add('bearing', 480, 120);
    }, 'slope'],
    ['Sorter', () => {
      // A staggered queue of small things over the neck, and the three big ones out on the arms
      // where they arrive last. Tilt forwards: the little ones drain into the cup and the big
      // ones come down and cork the hole.
      addFixture('funnel', W / 2, 290);
      addFixture('cup', W / 2, 486);
      addFixture('rail', W / 2 - 232, 380, 0.55);
      addFixture('rail', W / 2 + 232, 380, -0.55);
      const cols = [...MARBLE_COLOURS];
      add('bearing', W / 2 - 4, 224);
      add('marble-s', W / 2 + 12, 188, { colour: cols[0] });
      add('marble-s', W / 2 - 12, 152, { colour: cols[1] });
      add('bearing', W / 2 + 6, 118);
      add('marble-s', W / 2 - 8, 84, { colour: cols[2] });
      add('marble-s', W / 2 + 10, 50, { colour: cols[3] });
      add('marble-l', W / 2 - 104, 96, { colour: cols[4] });
      add('marble-l', W / 2 + 104, 96, { colour: cols[5] });
      add('shooter', W / 2 - 210, 120, { colour: cols[6] });
    }, 'slope'],
    ['Bagatelle', () => {
      for (let row = 0; row < 4; row++) {
        for (let i = 0; i < 5 + (row % 2); i++) {
          addFixture(row === 3 ? 'bumper' : 'peg', W / 2 - (4 + (row % 2)) * 42 + i * 84 + (row % 2) * 42, 190 + row * 86);
        }
      }
      addFixture('kerb', 180, 520, 0.6);
      addFixture('kerb', W - 180, 520, -0.6);
      addFixture('cup', W / 2, 540);
      const cols = [...MARBLE_COLOURS].sort(() => Math.random() - 0.5);
      for (let i = 0; i < 5; i++) add('marble-m', W / 2 - 80 + i * 40, 88, { colour: cols[i] });
    }, 'slope'],
    ['Empty tray', () => {}],
  ];

  function setScene(i) {
    // Loading a set-out puts every tool down. Coming out of one holding an armed funnel is what
    // made the next click on a marble drop furniture instead of picking it up.
    setArmed(null);
    setFixSel(null);
    setRotateMode(false);
    clearAll();
    SCENES[i][1]();
    lastPairSound.clear();
    document.querySelectorAll('#scenes button').forEach((el, j) => el.classList.toggle('on', j === i));
    // A run, a sorter and a bagatelle all want the tray leaning towards you, and none of them do
    // anything at all on the flat. Set the slope with the scene so it works the moment it loads.
    lockX = 0; lockY = SCENES[i][2] ? 1 : 0;
    syncTilt();
  }

  // ---------- match ----------
  // Twelve marbles lie on the tray, six of each colour, and neither side owns the one
  // it is steering: each player drives a shooter, a marble too fat to fit down a hole.
  // You cannot put yourself in — the only way to score is to knock a marble in with it.
  // Four of the five holes are ringed in a colour and pay whoever owns the ring, whatever
  // fell in, so barging either colour into one of yours scores. The middle hole is
  // nobody's and pays the colour of the marble.
  let mode = 'sandbox';
  const TEAM = {
    you: { name: 'You', colour: MARBLE_COLOURS[3] },
    ai: { name: 'Opponent', colour: MARBLE_COLOURS[1] },
  };
  // `ease` is how well it judges the run-in: inside `dist` of the hole it stops pushing
  // and lets the marble coast, and anything still over SINK_SPEED rides across instead.
  // `best` is how often it takes the shot it rated highest rather than one of the next few,
  // and `reach` how far across the tray it will look for one.
  const AI_LEVELS = [
    { name: 'Gentle', jitter: 0.44, wait: [1.8, 2.6], cap: 250, ease: { dist: 90, speed: 250 }, cool: [6.0, 9.0], best: 0.2, reach: 700 },
    { name: 'Even', jitter: 0.18, wait: [1.0, 1.6], cap: 380, ease: { dist: 135, speed: 215 }, cool: [3.5, 5.0], best: 0.6, reach: 950 },
    { name: 'Sharp', jitter: 0.05, wait: [0.6, 1.0], cap: 470, ease: { dist: 170, speed: 190 }, cool: [1.2, 2.0], best: 1, reach: 1400 },
  ];
  const match = {
    on: false, over: false, you: 0, ai: 0, level: 1, count: 0, beat: -1,
    two: false,                        // two players sharing the keyboard, no computer
    yours: null, theirs: null,         // the two shooters
    shot: null, timer: 0, jitter: 0, cool: 0, idle: 0,
  };

  // Which side a hole pays out to when a marble owned by `team` drops in it.
  function paidBy(h, team) { return h.team || team; }

  // The loose marbles — the shooters carry a team too, but they are furniture, not points.
  function inPlay() { return bodies.filter(b => b.team && !b.striker); }

  function placeIn(kind, x0, x1, y0, y1, opts) {
    const bound = KINDS[kind].r;
    let x = (x0 + x1) / 2, y = (y0 + y1) / 2;
    for (let t = 0; t < 240; t++) {
      const cx = rand(x0, x1), cy = rand(y0, y1);
      if (overlapsAny(cx, cy, bound)) continue;
      let clash = false;
      // Well clear of every hole: a marble that starts a hand's breadth from one is a point
      // to whoever gets there first, which is not much of a match.
      for (const h of holes) if (Math.hypot(cx - h.x, cy - h.y) < h.r + bound + 74) { clash = true; break; }
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
    match.shot = null; match.timer = 0; match.cool = 0; match.idle = 0;
    match.count = COUNTDOWN;                 // 3, 2, 1 to put the shooters down
    match.beat = -1;
    $('result').hidden = true;
    // Diagonally paired, so each half of the tray holds one of each colour and
    // there is always a hole worth aiming at and one worth steering clear of.
    for (const [hx, hy, team] of [
      [200, 150, 'you'], [W - 200, 150, 'ai'],
      [200, H - 150, 'ai'], [W - 200, H - 150, 'you'],
      [W / 2, H / 2, null],
    ]) holes.push({ x: hx, y: hy, r: HOLE_R, team });
    // The marbles share the middle of the tray so neither side starts on top of them.
    const y0 = RIM + 60, y1 = H - RIM - 60;
    for (let i = 0; i < TEAM_MARBLES; i++) {
      placeIn('marble-m', W / 2 - 300, W / 2 - 30, y0, y1, { team: 'you', colour: TEAM.you.colour });
      placeIn('marble-m', W / 2 + 30, W / 2 + 300, y0, y1, { team: 'ai', colour: TEAM.ai.colour });
    }
    // A shooter each, sat in a sensible spot until somebody puts it somewhere better.
    match.yours = add('shooter', RIM + 110, H / 2, { team: 'you', colour: TEAM.you.colour, striker: true });
    match.theirs = add('shooter', W - RIM - 110, H / 2, { team: 'ai', colour: TEAM.ai.colour, striker: true });
    lastPairSound.clear();
    updateMatchUI();
    setControl(match.yours);
    setControl2(match.two ? match.theirs : null);
    if (!match.two) aiPlace();
  }

  // Two marbles tucked against the rim with nobody able to get behind them would sit there
  // for the rest of the afternoon. It is a tray: when the last of it has gone quiet and
  // nothing has dropped for a while, it gets a shake and the marbles come off the sides.
  function matchIdle(dt) {
    if (!match.on || match.over || match.count > 0) return;
    match.idle += dt;
    if (match.idle < 13) return;
    // Only the marbles have to have settled — a shooter still casting about for a shot is
    // exactly the case this is here for.
    for (const b of inPlay()) if (Math.hypot(b.vx, b.vy) > 26) return;
    match.idle = 0;
    jolt(120);
    for (const b of inPlay()) {
      const a = rand(0, Math.PI * 2), sp = rand(150, 280);
      b.vx += Math.cos(a) * sp; b.vy += Math.sin(a) * sp;
      b.w += rand(-2, 2);
    }
    sound.tap();
    $('steer').textContent = 'Nothing was happening, so the tray had a shake.';
  }

  // The half of the tray a side may put its shooter down in, inset by the rim.
  function halfFor(team, r) {
    const pad = RIM + r + 6;
    return team === 'you'
      ? { x0: pad, x1: W / 2 - r - 8, y0: pad, y1: H - pad }
      : { x0: W / 2 + r + 8, x1: W - pad, y0: pad, y1: H - pad };
  }

  // Put a shooter down where it was asked for, shuffled clear of anything it would be
  // sitting inside. Holes push it off too — a shooter parked on one looks like a mistake.
  function placeShooter(sh, x, y) {
    const box = halfFor(sh.team, sh.r);
    sh.x = clamp(x, box.x0, box.x1);
    sh.y = clamp(y, box.y0, box.y1);
    for (let pass = 0; pass < 24; pass++) {
      let moved = false;
      for (const b of bodies) {
        if (b === sh || b.shape !== 'circle') continue;
        const dx = sh.x - b.x, dy = sh.y - b.y;
        const d = Math.hypot(dx, dy), want = sh.r + b.r + 4;
        if (d < want) { const n = d || 1; sh.x += dx / n * (want - d); sh.y += dy / n * (want - d); moved = true; }
      }
      for (const h of holes) {
        const dx = sh.x - h.x, dy = sh.y - h.y;
        const d = Math.hypot(dx, dy), want = h.r + sh.r + 6;
        if (d < want) { const n = d || 1; sh.x += dx / n * (want - d); sh.y += dy / n * (want - d); moved = true; }
      }
      sh.x = clamp(sh.x, box.x0, box.x1);
      sh.y = clamp(sh.y, box.y0, box.y1);
      if (!moved) break;
    }
    sh.vx = 0; sh.vy = 0;
  }

  // The computer sets up behind the marble it fancies most, so it opens on a real shot.
  function aiPlace() {
    const sh = match.theirs;
    if (!sh) return;
    const shots = planShots(sh, AI_LEVELS[match.level]);
    if (shots.length) placeShooter(sh, shots[0].px, shots[0].py);
    else placeShooter(sh, W - RIM - 110, H / 2);
  }

  function score(team) {
    if (team === 'you') match.you++; else match.ai++;
    match.idle = 0;
    if (team === 'ai') {                     // it takes a breath rather than chaining pots
      const c = AI_LEVELS[match.level].cool;
      match.cool = rand(c[0], c[1]);
    }
    updateMatchUI();
    if (match.over) return;
    // Every hole pays its ring, so any marble still on the tray is worth a point to either
    // side. The match runs until the last one is in — the only early finish is a lead the
    // marbles left cannot make up.
    const left = inPlay().length;
    if (!left || Math.abs(match.you - match.ai) > left) endMatch();
  }

  function endMatch() {
    match.over = true;
    setControl(null); setControl2(null);
    match.shot = null;
    for (const b of bodies) { b.tx = 0; b.ty = 0; }
    const left = inPlay().length;
    const tie = match.you === match.ai;
    const won = match.you > match.ai;
    const [one, two] = match.two ? ['Player one', 'Player two'] : ['You', 'The opponent'];
    $('result-title').textContent = tie ? 'A draw' : won ? `${one} win${match.two ? 's' : ''}` : `${two} wins`;
    const tally = tie
      ? `${match.you} each. Nothing in it.`
      : match.two
        ? `Player one took ${match.you}, player two took ${match.ai}.`
        : `You took ${match.you}, the opponent took ${match.ai}.`;
    $('result-line').textContent = left
      ? `${tally} Settled with ${left === 1 ? 'one marble still' : `${left} marbles still`} on the tray.`
      : tally;
    $('result').hidden = false;
  }

  function updateMatchUI() {
    const left = { you: 0, ai: 0 };
    for (const b of inPlay()) left[b.team]++;
    $('score-you').textContent = match.you;
    $('score-ai').textContent = match.ai;
    $('left-you').textContent = `${left.you} on the tray`;
    $('left-ai').textContent = `${left.ai} on the tray`;
  }

  // ---------- the computer's shooter ----------
  // It only ever has the one move: get behind a marble and drive it at a hole that pays it.
  // Either colour will do — a ringed hole pays whoever owns the ring, so putting one of
  // yours down a pink hole is worth as much as one of its own and costs you the marble
  // besides. The middle hole is the exception: that one pays the owner, so it sends only
  // its own colour there.
  function planShots(sh, lvl) {
    const shots = [];
    const pad = RIM + sh.r;
    for (const m of inPlay()) {
      for (const h of holes) {
        if (paidBy(h, m.team) !== 'ai') continue;
        const hx = h.x - m.x, hy = h.y - m.y, hd = Math.hypot(hx, hy) || 1;
        const ux = hx / hd, uy = hy / hd;
        const back = m.r + sh.r + 4;
        let px = m.x - ux * back, py = m.y - uy * back;
        // A marble against a wall wants the shooter outside the tray. Slide the spot back
        // inside and take the worse angle — a glancing hit at least moves it into the open,
        // and only a marble with no room at all behind it is dropped from the list.
        const cx = clamp(px, pad, W - pad), cy = clamp(py, pad, H - pad);
        const off = Math.hypot(cx - px, cy - py);
        if (off > back * 0.75) continue;
        px = cx; py = cy;
        const run = Math.hypot(px - sh.x, py - sh.y);
        if (run > lvl.reach) continue;
        let cost = run + hd * 0.7 + off * 3;
        // Anything sat on the line between the marble and the hole spoils the shot.
        for (const o of bodies) {
          if (o === m || o === sh || o.shape !== 'circle') continue;
          const t = ((o.x - m.x) * ux + (o.y - m.y) * uy) / hd;
          if (t <= 0.02 || t >= 1) continue;
          if (Math.abs((o.x - m.x) * uy - (o.y - m.y) * ux) < o.r + m.r * 0.7) cost += 900;
        }
        shots.push({ m, h, px, py, cost });
      }
    }
    shots.sort((a, b) => a.cost - b.cost);
    return shots;
  }

  function aiThink(dt) {
    if (!match.on || match.over || match.two) return;
    const sh = match.theirs, lvl = AI_LEVELS[match.level];
    if (!sh || bodies.indexOf(sh) < 0) return;
    if (match.cool > 0) { match.cool -= dt; match.shot = null; return; }  // a breath after a pot

    match.timer -= dt;
    if (!match.shot || bodies.indexOf(match.shot.m) < 0 || match.timer <= 0) {
      const shots = planShots(sh, lvl);
      if (!shots.length) {
        // Nothing it can line up — a marble wedged in a corner leaves no room to get behind
        // it. Rather than sit there for the rest of the round it goes and shoves the nearest
        // one out into the open, and looks again.
        match.shot = null;
        let near = null, nd = Infinity;
        for (const m of inPlay()) {
          const d = Math.hypot(m.x - sh.x, m.y - sh.y);
          if (d < nd) { nd = d; near = m; }
        }
        if (near) {
          const a = Math.atan2(near.y - sh.y, near.x - sh.x);
          sh.tx = Math.cos(a); sh.ty = Math.sin(a); sh.tcap = lvl.cap * 0.8;
        }
        return;
      }
      // The keener it is, the more often it takes the shot it rated best.
      const i = Math.random() < lvl.best ? 0 : Math.floor(Math.random() * Math.min(4, shots.length));
      match.shot = shots[i];
      match.timer = rand(lvl.wait[0], lvl.wait[1]);
      match.jitter = rand(-1, 1) * lvl.jitter;    // one aiming error per shot, kept for the shot
    }
    const shot = match.shot;
    if (!shot) return;

    // Where to stand is worked out afresh every frame — both of them are still rolling.
    const m = shot.m, h = shot.h;
    const hx = h.x - m.x, hy = h.y - m.y, hd = Math.hypot(hx, hy) || 1;
    const ux = hx / hd, uy = hy / hd;
    const back = m.r + sh.r + 4;
    const px = m.x - ux * back, py = m.y - uy * back;
    const dx = m.x - sh.x, dy = m.y - sh.y, dm = Math.hypot(dx, dy) || 1;

    // Once the marble is away and heading the right way, stop pushing. Shoving it the last
    // few inches only skims it across the hole — the run-in has to be a coast.
    if ((m.vx * ux + m.vy * uy) > lvl.ease.speed * 0.5 && (hd < lvl.ease.dist || dm > back + 30)) {
      match.timer = Math.min(match.timer, 0.4);
      return;
    }

    const align = (dx / dm) * ux + (dy / dm) * uy;    // 1 when the shooter is dead behind it
    let a, cap = lvl.cap;
    if (align > 0.94 && dm < back + 130) {
      a = Math.atan2(m.y + uy * 6 - sh.y, m.x + ux * 6 - sh.x) + match.jitter;   // straight through it
    } else {
      // Get round behind it. Driving at the spot would mean going through the marble from
      // the wrong side, so swing wide whenever it is in the way.
      const tx = px - sh.x, ty = py - sh.y, td = Math.hypot(tx, ty) || 1;
      a = Math.atan2(ty, tx);
      if (dm < td && (tx / td) * (dx / dm) + (ty / td) * (dy / dm) > 0.7) {
        a += (tx * dy - ty * dx > 0 ? -1 : 1) * 0.85;
      }
      cap = lvl.cap * 0.72;
    }
    sh.tx = Math.cos(a); sh.ty = Math.sin(a); sh.tcap = cap;
  }

  function setLevel(i) {
    match.level = i;
    document.querySelectorAll('#levels button').forEach((el, j) => el.classList.toggle('on', j === i));
  }

  // Who drives the rose shooter: the computer, or somebody sat next to you on the arrow keys.
  function setTwo(on) {
    match.two = !!on;
    $('opp-one').classList.toggle('on', !match.two);
    $('opp-one').setAttribute('aria-pressed', String(!match.two));
    $('opp-two').classList.toggle('on', match.two);
    $('opp-two').setAttribute('aria-pressed', String(match.two));
    $('levels').hidden = match.two;
    $('opp-sub').textContent = match.two ? 'Sharing the keyboard' : 'How keen it is';
    $('two-note').hidden = !match.two;
    $('who-ai').textContent = match.two ? 'Player two' : 'Opponent';
    $('who-you').textContent = match.two ? 'Player one' : 'You';
    $('keys-one').hidden = match.two;
    $('keys-two').hidden = !match.two;
    if (mode === 'match') startMatch();       // the scores so far would mean nothing now
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
      // A match is nothing but steering, and the holes only sit still on a level tray, so the
      // switch goes on, the slope comes off, and neither is yours to fiddle with for the round.
      setArmed(null); setFixSel(null); setRotateMode(false);
      lockX = 0; lockY = 0; syncTilt();
      setSteerMode(true);
      startMatch();
      $('note').textContent = 'A shooter will not fit down a hole, so the only way to score is to knock the marbles in with it. A hole pays the colour of its ring, whatever went in. All twelve go in; the bigger half wins.';
    } else {
      match.on = false; match.over = false; match.shot = null;
      match.yours = null; match.theirs = null;
      setControl2(null);
      holes.length = 0; sinking.length = 0;
      setSteerMode(false);
      setScene(0);
      $('note').textContent = 'Drag things about with the pointer. The switches under the tray change what a click and the keys do.';
    }
    // A match has no furniture and no slope, so the shelf, the tools and the slope pad are
    // all beside the point for the round — they go away rather than sit there greyed out.
    for (const id of ['panel-scenes', 'panel-tools']) $(id).hidden = m === 'match';
    $('keys-build').hidden = m === 'match';
    $('keys-match').hidden = m !== 'match';
    $('btn-steer').disabled = m === 'match';
    $('btn-rotate').disabled = m === 'match';
    $('dpad').classList.toggle('off', m === 'match');
  }

  function updateCount() {
    const n = bodies.length, f = fixGroups.length;
    const things = n === 0 ? 'Nothing on it' : n === 1 ? '1 thing' : `${n} things`;
    $('count').textContent = f ? `${things} · ${f} fixed` : things;
  }

  // ---------- saved trays ----------
  // A tray is the furniture, the loose things and the slope it needs — a run kept flat is not the
  // thing that was built. Nothing is remembered about what was selected. Slots are named by the
  // player and kept in one versioned key; the tilt fields are optional, so a tray kept before
  // there was a slope still loads, level, exactly as it did.
  const SAVE_KEY = 'marble-tray-save-v1';
  let store = { trays: [] };
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) store = Object.assign({ trays: [] }, JSON.parse(raw));
  } catch (_) { /* fresh start */ }
  const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(store)); } catch (_) { /* ignore */ } };

  const r2 = (n) => Math.round(n * 100) / 100;
  function snapshot() {
    return {
      fixtures: fixGroups.map(g => ({ k: g.fkind, x: r2(g.x), y: r2(g.y), a: r2(g.angle) })),
      bodies: bodies.map(b => ({
        k: b.kind, x: r2(b.x), y: r2(b.y), a: r2(b.angle),
        c: b.colour ? b.colour.name : null, p: b.pips,
      })),
      tilt: { x: lockX, y: lockY }, steep,
    };
  }
  function restore(t) {
    clearAll();
    holes.length = 0; sinking.length = 0;
    for (const f of t.fixtures || []) if (FIXTURES[f.k]) addFixture(f.k, f.x, f.y, f.a);
    for (const b of t.bodies || []) {
      if (!KINDS[b.k]) continue;
      const col = MARBLE_COLOURS.find(c => c.name === b.c);
      add(b.k, b.x, b.y, { angle: b.a || 0, colour: col || undefined, pips: b.p });
    }
    lastPairSound.clear();
    setFixSel(null); setArmed(null); setRotateMode(false);
    lockX = (t.tilt && t.tilt.x) || 0; lockY = (t.tilt && t.tilt.y) || 0;
    setSteep(t.steep == null ? 1 : t.steep);
    syncTilt();
    document.querySelectorAll('#scenes button').forEach(el => el.classList.remove('on'));
  }
  function saveTray(name) {
    const t = snapshot();
    t.name = name; t.at = Date.now();
    const i = store.trays.findIndex(x => x.name === name);
    if (i >= 0) store.trays[i] = t; else store.trays.unshift(t);
    store.trays = store.trays.slice(0, 12);
    persist();
    renderSaved();
  }
  function renderSaved() {
    const host = $('saved');
    host.innerHTML = '';
    if (!store.trays.length) {
      host.innerHTML = '<p class="build-note">Nothing kept yet. Build something and give it a name.</p>';
      return;
    }
    for (const t of store.trays) {
      const row = document.createElement('div');
      row.className = 'saved-row';
      const load = document.createElement('button');
      load.type = 'button'; load.className = 'saved-load';
      const lean = t.tilt && (t.tilt.x || t.tilt.y) ? ' · leaning' : '';
      load.innerHTML = `<b></b><span>${(t.fixtures || []).length} fixed · ${(t.bodies || []).length} loose${lean}</span>`;
      load.querySelector('b').textContent = t.name;
      load.addEventListener('click', () => { restore(t); $('tray-name').value = t.name; });
      const del = document.createElement('button');
      del.type = 'button'; del.className = 'tiny saved-del'; del.title = 'Forget this one';
      del.textContent = '×';
      del.addEventListener('click', () => {
        store.trays = store.trays.filter(x => x !== t); persist(); renderSaved();
      });
      row.append(load, del);
      host.appendChild(row);
    }
  }

  // ---------- control ----------
  function describe(b) {
    if (!b) return '';
    if (b.k.draw === 'marble') return `the ${b.colour.name.replace('-', ' ')} ${b.k.label.toLowerCase()}`;
    return `the ${b.k.label.toLowerCase()}`;
  }

  // In a match there is nothing to pick: you are given your shooter and you keep it.
  function canControl(b) { return !match.on || (!!b && b.striker && b.team === 'you'); }

  function setControl(b) {
    if (b && !canControl(b)) return;
    if (b && !steerMode) return;
    if (ctrl && ctrl !== b) { ctrl.tx = 0; ctrl.ty = 0; }
    ctrl = b;
    $('btn-letgo').disabled = !b || match.on;
    updateSteerNote();
  }

  function setControl2(b) {
    if (ctrl2 && ctrl2 !== b) { ctrl2.tx = 0; ctrl2.ty = 0; }
    ctrl2 = b;
    updateSteerNote();
  }

  // One line under the tray saying what the keys will do right now, which changes with the
  // switches rather than with anything the player has to remember.
  function updateSteerNote() {
    const el = $('steer');
    if (!el) return;
    const lock = !lockX && !lockY ? ''
      : ` The tray is leaning ${lockDesc()} and stays that way.`;
    // In a match the keys never change hands, so the standing description lives in the panel
    // below and this line is only ever the one thing that is true right now.
    if (match.on) {
      el.innerHTML = match.over ? 'That is the lot.'
        : match.count > 0 ? '<b>Set your shooter down</b> — it stays where you leave it.'
        : 'Off you go.';
    }
    else if (ctrl) el.innerHTML = `Steering <b>${describe(ctrl)}</b> with WASD or the arrows.${lock}`;
    else if (steerMode) el.innerHTML = `<b>Steer is on</b> — click a thing to drive it with the keys. Until then they tilt the tray.${lock}`;
    else el.innerHTML = `WASD or the arrows tilt the tray while you hold them. <b>Shift</b> and an arrow locks that lean on, <b>T</b> levels up.${lock}`;
  }

  function lockDesc() {
    const ns = [];
    if (lockY === -1) ns.push('away from you');
    if (lockY === 1) ns.push('towards you');
    if (lockX === -1) ns.push('left');
    if (lockX === 1) ns.push('right');
    return ns.join(' and ');
  }

  function setSteerMode(on) {
    steerMode = !!on;
    const btn = $('btn-steer');
    btn.classList.toggle('on', steerMode);
    btn.setAttribute('aria-pressed', String(steerMode));
    if (!steerMode && ctrl) { ctrl.tx = 0; ctrl.ty = 0; ctrl = null; $('btn-letgo').disabled = true; }
    updateSteerNote();
  }

  function setRotateMode(on) {
    rotateMode = !!on;
    const btn = $('btn-rotate');
    btn.classList.toggle('on', rotateMode);
    btn.setAttribute('aria-pressed', String(rotateMode));
    canvas.classList.toggle('turning', rotateMode && !armed);
    if (rotateMode) { endGrab(); setArmed(null); }
    updateBuildNote();
  }

  function cycleControl() {
    if (match.on) return;                   // your shooter is your shooter for the round
    if (!steerMode) setSteerMode(true);
    const list = bodies;
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
      // Dragging by hand would trivially win a match. The one thing a click does is set a
      // shooter down while the numbers run, in that side's half; after the off, nothing.
      if (!match.over && match.count > 0) {
        const side = p.x < W / 2 ? 'you' : 'ai';
        if (side === 'you') placeShooter(match.yours, p.x, p.y);
        else if (match.two) placeShooter(match.theirs, p.x, p.y);
        sound.tap();
      }
    } else if (armed) {
      // The tool stays armed, so a row of pegs is a row of clicks.
      const g = addFixture(armed, p.x, p.y, 0);
      setFixSel(g);
    } else if (rotateMode) {
      // With Rotate on the loose things are left alone entirely, so you can swing a rail round in
      // a tray full of marbles without picking one up by mistake.
      const g = (fsel && overHandle(fsel, p)) ? fsel : pickFixture(p);
      if (g) {
        setFixSel(g);
        const onHandle = overHandle(g, p);
        fdrag = { group: g, mode: g.f.turn ? 'turn' : 'move', pointerId: e.pointerId, moved: false,
          dx: g.x - p.x, dy: g.y - p.y, a0: g.angle,
          rel: onHandle ? null : Math.atan2(p.y - g.y, p.x - g.x) };
        try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      } else {
        setFixSel(null);
      }
    } else if (b) {
      startGrab(b, p, e.pointerId, false);
      try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    } else {
      const g = pickFixture(p);
      if (g) {
        setFixSel(g);
        fdrag = { group: g, mode: 'move', pointerId: e.pointerId, moved: false, dx: g.x - p.x, dy: g.y - p.y };
        try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      } else {
        setFixSel(null);
        setControl(null);
      }
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
    if (fdrag && e.pointerId === fdrag.pointerId) {
      const p = toWorld(e), g = fdrag.group;
      fdrag.moved = true;
      if (fdrag.mode === 'move') placeFixture(g, p.x + fdrag.dx, p.y + fdrag.dy, g.angle);
      else {
        const ang = Math.atan2(p.y - g.y, p.x - g.x);
        placeFixture(g, g.x, g.y, fdrag.rel == null ? ang : fdrag.a0 + (ang - fdrag.rel));
      }
      clampFixture(g);
      return;
    }
    if (grab && e.pointerId === grab.pointerId) {
      const p = toWorld(e);
      grab.px = p.x; grab.py = p.y;
      if (!grab.moved && Math.hypot(p.x - grab.x0, p.y - grab.y0) > 5) grab.moved = true;
    }
  });

  function pointerEnd(e) {
    if (fdrag && e.pointerId === fdrag.pointerId) fdrag = null;
    if (pending && e.pointerId === pending.pointerId) {
      if (e.type === 'pointerup') addFree(pending.kind);
      pending = null;
    }
    if (grab && e.pointerId === grab.pointerId) {
      const b = grab.body;
      if (!grab.moved && e.type === 'pointerup' && steerMode) setControl(b === ctrl ? null : b);
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
    // Shift and a direction locks the lean on instead of leaning for as long as you hold.
    if (k && e.shiftKey) { setLock(k.d); e.preventDefault(); return; }
    if (k) { (k.s === 'a' ? keysA : keysB).add(k.d); keyDir(); e.preventDefault(); return; }
    if (e.code === 'KeyT') { setLock('flat'); e.preventDefault(); return; }
    // Escape drops whatever the keys are holding — except in a match, where letting go of
    // your own shooter would leave you with nothing to play.
    if (e.code === 'Escape') { if (armed) setArmed(null); else if (fsel) setFixSel(null); else if (!match.on) setControl(null); return; }
    if (e.code === 'Tab') { cycleControl(); e.preventDefault(); return; }
    if ((e.code === 'BracketLeft' || e.code === 'BracketRight') && fsel && fsel.f.turn) {
      placeFixture(fsel, fsel.x, fsel.y, fsel.angle + (e.code === 'BracketLeft' ? -1 : 1) * Math.PI / 24);
      e.preventDefault(); return;
    }
    if ((e.code === 'Delete' || e.code === 'Backspace') && !match.on) {
      if (fsel) { removeFixture(fsel); e.preventDefault(); }
      else if (ctrl) { removeBody(ctrl); e.preventDefault(); }
    }
  });
  window.addEventListener('keyup', e => {
    const k = KEYMAP[e.code];
    if (k) { (k.s === 'a' ? keysA : keysB).delete(k.d); keyDir(); }
  });
  window.addEventListener('blur', () => { keysA.clear(); keysB.clear(); keyDir(); });

  // ---------- shelf ----------
  // The shelf is four tabs rather than two long lists, which is what keeps the column short
  // enough not to scroll. Moving off the furniture tab puts the tool down, so a tool can never be
  // left armed while you are clicking about among the marbles.
  const SHELF_TABS = [
    { name: 'Marbles', kinds: ['marble-s', 'marble-m', 'marble-l', 'shooter'] },
    { name: 'Odds', kinds: ['puck', 'cork', 'block', 'plank', 'die'] },
    { name: 'Steel', kinds: ['bearing', 'nut', 'bar', 'magnet'] },
    { name: 'Bolt down', fixed: true },
  ];
  const FIXED_TAB = SHELF_TABS.findIndex(t => t.fixed);
  let shelfTab = 0;

  function setShelfTab(i) {
    shelfTab = i;
    if (!SHELF_TABS[i].fixed && armed) setArmed(null);
    document.querySelectorAll('#shelf-tabs button').forEach((el, j) => {
      el.classList.toggle('on', j === i);
      el.setAttribute('aria-selected', String(j === i));
    });
    document.querySelectorAll('#shelf-panes .items').forEach((el, j) => { el.hidden = j !== i; });
  }

  function buildShelf() {
    const tabs = $('shelf-tabs'), panes = $('shelf-panes');
    SHELF_TABS.forEach((t, i) => {
      const b = document.createElement('button');
      b.className = 'tab'; b.type = 'button'; b.textContent = t.name;
      b.setAttribute('role', 'tab');
      b.addEventListener('click', () => setShelfTab(i));
      tabs.appendChild(b);
      const pane = document.createElement('div');
      pane.className = 'items' + (t.fixed ? ' fixtures' : '');
      if (t.fixed) pane.id = 'fixtures';
      panes.appendChild(pane);
      t.pane = pane;
    });
    for (const t of SHELF_TABS) if (!t.fixed) for (const kind of t.kinds) buildLooseItem(t.pane, kind);
  }

  function buildLooseItem(wrap, kind) {
    {
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

  // The furniture shelf. Each icon is the fixture itself, drawn at whatever scale fits the tile,
  // so the funnel looks like a funnel rather than like a label.
  function buildFixtureShelf() {
    const wrap = SHELF_TABS[FIXED_TAB].pane;
    for (const fkind of FIXTURE_LIST) {
      const f = FIXTURES[fkind];
      const btn = document.createElement('button');
      btn.className = 'item'; btn.type = 'button'; btn.dataset.fkind = fkind; btn.title = f.label;
      const icon = document.createElement('canvas');
      icon.width = 88; icon.height = 88;
      const label = document.createElement('span');
      label.textContent = f.label;
      btn.append(icon, label);
      wrap.appendChild(btn);

      const g = icon.getContext('2d');
      const preview = makeFixture(fkind, 0, 0, 0, -1);
      const scale = Math.min(1.1, 34 / preview.reach);
      g.setTransform(2 * scale, 0, 0, 2 * scale, 88 / 2, 88 / 2);
      for (const part of preview.parts) drawFixturePart(g, part, f.tint);

      btn.addEventListener('click', () => { setRotateMode(false); setArmed(armed === fkind ? null : fkind); });
    }
  }

  // ---------- panel buttons ----------
  function buildPanels() {
    const sc = $('scenes');
    SCENES.forEach(([name], i) => {
      const b = document.createElement('button');
      b.className = 'chip'; b.type = 'button'; b.textContent = name;
      b.addEventListener('click', () => setScene(i));
      sc.appendChild(b);
    });
    $('dpad').addEventListener('click', e => {
      const btn = e.target.closest('button');
      if (btn) setLock(btn.dataset.tilt);
    });
    const st = $('steeps');
    STEEPS.forEach(([name], i) => {
      const b = document.createElement('button');
      b.className = 'chip'; b.type = 'button'; b.textContent = name;
      b.addEventListener('click', () => setSteep(i));
      st.appendChild(b);
    });
    $('btn-steer').addEventListener('click', () => setSteerMode(!steerMode));
    $('btn-rotate').addEventListener('click', () => setRotateMode(!rotateMode));
    $('mode-sandbox').addEventListener('click', () => setMode('sandbox'));
    $('mode-match').addEventListener('click', () => setMode('match'));
    $('opp-one').addEventListener('click', () => { if (match.two) setTwo(false); });
    $('opp-two').addEventListener('click', () => { if (!match.two) setTwo(true); });
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
    $('btn-tidy').addEventListener('click', () => { clearAll(); setArmed(null); });
    $('btn-save-tray').addEventListener('click', () => {
      const name = ($('tray-name').value || '').trim() || 'Tray ' + (store.trays.length + 1);
      $('tray-name').value = name;
      saveTray(name);
    });
    $('tray-name').addEventListener('keydown', e => { if (e.code === 'Enter') $('btn-save-tray').click(); });
    $('btn-nudge').addEventListener('click', () => {
      jolt(110);
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

  // ---------- the tray leans ----------
  // Lift one edge of a real tray and, seen from above, two small things happen: the tray creeps a
  // few px downhill, and its shadow slips out from under the raised side. Neither is worth much
  // alone — what sells it is that the creep arrives as a lurch. A change of tilt kicks the tray
  // past where it is going to sit and a slack spring pulls it back, so it reads as a thing being
  // leaned on rather than a picture sliding across the page. Letting go rebounds the other way.
  // The canvas only ever translates, never rotates in 3D, so a drag still lands under the pointer.
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let leanX = 0, leanY = 0, leanVX = 0, leanVY = 0, leanPX = 0, leanPY = 0;
  function leanTray(dt) {
    if (reduceMotion || dt <= 0) return;
    leanVX += (tiltX - leanPX) * LEAN_KICK; leanPX = tiltX;
    leanVY += (tiltY - leanPY) * LEAN_KICK; leanPY = tiltY;
    leanVX += ((tiltX * LEAN_PX - leanX) * LEAN_K - leanVX * LEAN_D) * dt;
    leanVY += ((tiltY * LEAN_PX - leanY) * LEAN_K - leanVY * LEAN_D) * dt;
    leanX += leanVX * dt; leanY += leanVY * dt;
    canvas.style.setProperty('--lean-x', leanX.toFixed(2) + 'px');
    canvas.style.setProperty('--lean-y', leanY.toFixed(2) + 'px');
  }

  // A shake shakes the tray, not only what is in it.
  function jolt(px) {
    if (reduceMotion) return;
    const a = rand(0, Math.PI * 2);
    leanVX += Math.cos(a) * px; leanVY += Math.sin(a) * px;
  }

  // ---------- main loop ----------
  let last = performance.now();
  function frame(now) {
    let dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    if (document.hidden) dt = 0;

    // Nobody moves during the 3-2-1 — that is the window for setting the shooters down.
    const counting = match.on && !match.over && match.count > 0;
    if (counting && dt > 0) {
      match.count = Math.max(0, match.count - dt);
      const n = match.count > 0 ? Math.ceil(match.count) - 1 : -1;
      if (n !== match.beat) { match.beat = n; sound.beat(n); }
      if (match.count <= 0) updateSteerNote();     // the line loses its 'while the numbers run'
    }

    // The locked lean is always there; a held key adds to it, but only while the keys are not
    // busy driving something. So a marble run keeps running while you steer a marble down it.
    let wantX = lockX, wantY = lockY;
    if (!ctrl && !match.on) { wantX += kdx; wantY += kdy; }
    const want = Math.hypot(wantX, wantY);
    if (want > 1) { wantX /= want; wantY /= want; }
    if (counting) { wantX = 0; wantY = 0; }
    const ease = Math.min(1, 5 * dt);
    tiltX += (wantX - tiltX) * ease; tiltY += (wantY - tiltY) * ease;
    if (Math.abs(tiltX) < 0.002) tiltX = 0;
    if (Math.abs(tiltY) < 0.002) tiltY = 0;
    const gmag = TILT_G * STEEPS[steep][1];
    gx = tiltX * gmag; gy = tiltY * gmag;
    $('bubble').style.transform = `translate(${(-tiltX * 17).toFixed(1)}px, ${(-tiltY * 17).toFixed(1)}px)`;
    leanTray(dt);

    for (const b of bodies) { b.tx = 0; b.ty = 0; }
    // Outside a match either half of the keyboard drives the one thing you picked. In a
    // two-player match they come apart: WASD is player one's shooter, the arrows player two's.
    const live = !counting && !(match.on && match.over);
    if (match.on && match.two) {
      if (ctrl && live && (k1x || k1y)) { ctrl.tx = k1x; ctrl.ty = k1y; ctrl.tcap = STEER_MAX; }
      if (ctrl2 && live && (k2x || k2y)) { ctrl2.tx = k2x; ctrl2.ty = k2y; ctrl2.tcap = STEER_MAX; }
    } else if (ctrl && live && (kdx || kdy)) {
      ctrl.tx = kdx; ctrl.ty = kdy; ctrl.tcap = STEER_MAX;
    }
    if (match.on && dt > 0 && !counting) { aiThink(dt); matchIdle(dt); }

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
  buildFixtureShelf();
  buildPanels();
  setShelfTab(0);
  setSteep(1);
  syncTilt();
  renderSaved();
  updateBuildNote();
  setLevel(match.level);
  setTwo(false);
  setMode('sandbox');
  requestAnimationFrame(frame);

  // Exposed for testing in a console: window.__tray.bodies etc.
  window.__tray = {
    bodies, holes, sinking, match, add, addFree, setScene, setMode, setLevel, startMatch,
    setControl, setTwo, placeShooter, planShots, aiThink, get ctrl() { return ctrl; },
    get ctrl2() { return ctrl2; }, KINDS,
    fixtures, fixGroups, FIXTURES, addFixture, removeFixture, setArmed, setFixSel,
    get armed() { return armed; }, get fsel() { return fsel; },
    snapshot, restore, saveTray, store, SCENES, tiltTo,
    setLock, setSteep, setSteerMode, setRotateMode, setShelfTab,
    get lock() { return { x: lockX, y: lockY }; },
    get steerMode() { return steerMode; }, get rotateMode() { return rotateMode; },
  };
})();
