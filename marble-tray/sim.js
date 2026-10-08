/* Marble Tray: the rules and the physics. Three games on a walnut tray of green baize, on a
   small rigid-body simulation: a match for the coloured holes, a maze to push a little
   marble through with a big one, and bowls rolled at a ring of circles painted on the
   cloth, as at curling. No page access, so whole games can be played in Node:

     const mt = createTray({ store, rnd, on })
       store  what is kept between visits (the last game, the mazes reached, best times)
       rnd    the dice (the computer's choices, the shakes); mt.seedDice(n) for tests
       on     on(event, data): 'sfx' [name, ...args], 'ui' (scores and panels changed),
              'maze-time' text, 'result' { title, line, again } or null, 'later' { ms, fn },
              'jolt' px, 'paint-case', 'save'

   Bodies, holes, the match, maze and bowls are plain objects that never change identity;
   the loose state (mode, the steered marbles, the keys) is read and set through mt. */
import { mulberry32 } from '../lib/rng.js';

export function createTray({ store, rnd, on = () => {} } = {}) {
  // ---------- constants ----------
  const W = 960, H = 620, RIM = 22;        // canvas size and rim thickness (px)
  const SUBSTEPS = 4;                       // physics substeps per frame
  const ITERATIONS = 8;                     // impulse solver passes per substep
  const SLOP = 0.4, PERCENT = 0.5;          // positional correction
  const REST_THRESH = 40;                   // below this approach speed, no bounce
  const SOUND_MIN = 45;                     // approach speed that makes a sound
  const THRUST = 1100, STEER_MAX = 460;     // keyboard steering
  // A key is on or off, so without a wind-up every press was a maximum shot: the shooter hit
  // the cap in under half a second and handed the marble it struck half as much again, well
  // over SINK_SPEED. Holding now winds the cap up from STEER_MIN to STEER_MAX, so a tap is a
  // nudge and only a long hold is a hard drive. STEER_BRAKE is how fast a body comes back down
  // to its cap — a rate, not a snap, so dropping the cap leans on it rather than yanking it.
  const STEER_MIN = 150;                    // px/s a press starts at
  const STEER_RAMP = 0.9;                   // seconds of holding that take it up to STEER_MAX
  const STEER_BRAKE = 1400;                 // px/s² a body sheds speed above its cap at
  const LEAN_K = 200, LEAN_D = 6;           // spring and damping that settle the tray after a shake
  const HOLE_R = 30;                        // radius of a scoring hole
  const HOLE_PULL = 900;                    // px/s² the lip of a hole draws a marble in by
  const SINK_SPEED = 300;                   // over this, a marble rides straight across
  const SINK_TIME = 0.34;                   // seconds a marble takes to disappear
  const TEAM_MARBLES = 6;                   // marbles each side starts a match with
  const COUNTDOWN = 4;                      // seconds of 3-2-1-Go before a match is live
  const MODES = ['match', 'maze', 'bowls'];

  // The mazes, easiest first. A cell has to take the big marble with room to get past the
  // little one, so the grid stops at 9x6: there a cell is 102x96 with 88x82 of it clear, the big
  // marble is 64 across, and it can no longer squeeze by — the little one has to go first.
  // `traps` is how many of the blind ends off the way through have a hole in them.
  const MAZES = [
    { cols: 4, rows: 3, traps: 0 },
    { cols: 5, rows: 3, traps: 0 },
    { cols: 6, rows: 4, traps: 1 },
    { cols: 7, rows: 4, traps: 1 },
    { cols: 7, rows: 5, traps: 2 },
    { cols: 8, rows: 5, traps: 2 },
    { cols: 9, rows: 5, traps: 3 },
    { cols: 9, rows: 6, traps: 4 },
  ];
  const MAZE_WALL = 14;                     // px thickness of a maze rail
  const GOAL_R = 26;                        // the hole at the end of a maze: it has to clear the bends
  const TRAP_R = 24;                        // a trap is a smaller hole than a scoring one
  const LIP_W = 16;                         // px off a maze rail the cloth starts to rise
  const LIP_ACCEL = 170;                    // px/s² it rolls a marble off the foot of the rail at
  const WEDGE_WAIT = 1.2;                   // seconds a little marble sits in a corner before a tap
  const WEDGE_POP = 85;                     // px/s the tap rolls it out at

  const BOWL = 'marble-l';                  // what each side rolls
  const BOWLS_EACH = 4;                     // marbles a side rolls in an end
  const BOWLS_TO = 5;                       // points that win the game
  const MAT_X = RIM + 40;                   // where a marble sits on the mat to be rolled
  const DEAD_X = RIM + 190;                 // a marble that stops short of this is dead
  // The pull is in distance, not speed: twice the pull rolls twice as far. A full pull rolls
  // about 1100px on open cloth, a little past the far rim, so the whole length of the pull is
  // spent on the tray — the old 700px/s rolled over 4000px and every bowl hit the wall.
  const FLICK_MAX = 350;                    // px/s of the hardest roll there is
  const PULL_FULL = 200;                    // px of pull back that gives it
  // The house: rings on the cloth near the far end, the button at their middle. Only a marble
  // touching the outer ring counts, and nearest the button is what scores.
  const HOUSE = { x: W - RIM - 190, y: H / 2, r: 0 };
  const HOUSE_RINGS = [120, 82, 44, 14];    // outer ring in to the button, px
  const END_PAUSE = 3.2;                    // seconds the result of an end stays up

  let R = rnd || Math.random;      // the dice; seedDice(n) swaps in a seeded one for tests
  const rand = (a, b) => a + R() * (b - a);
  const pick = arr => arr[Math.floor(R() * arr.length)];
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  function seeded(seed) {
    let s = (seed * 9301 + 49297) % 233280;
    return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  }

  // ---------- catalogue ----------
  const MARBLE_COLOURS = [
    { name: 'sea-glass', base: '#5fc0a5', deep: '#1c7d67', swirl: '#d8faef' },
    { name: 'rose', base: '#ea8e9b', deep: '#b03c52', swirl: '#ffe2e7' },
    { name: 'amber', base: '#efa73f', deep: '#b0651a', swirl: '#ffe8bd' },
    { name: 'sky', base: '#6ba7e0', deep: '#2b5f9e', swirl: '#dcecfd' },
    { name: 'lavender', base: '#a88fdc', deep: '#654aa4', swirl: '#ece2fc' },
    { name: 'sage', base: '#9dc46f', deep: '#5e8236', swirl: '#eaf6d6' },
    { name: 'clear', base: '#dfe7ea', deep: '#93a2a8', swirl: '#ffffff' },
    { name: 'ink', base: '#5b6a80', deep: '#252c39', swirl: '#a7b7cd' },
  ];

  // density is relative (glass ≈ 2.5); roll is the table's braking in px/s²,
  // spin the braking on rotation in rad/s². rest = bounciness, mu = grip.
  // The shooter is the big one: too fat for any hole, so it can only ever knock things in.
  const KINDS = {
    'marble-s': { label: 'Small marble', shape: 'circle', r: 11, density: 2.5, rest: 0.82, mu: 0.06, roll: 65, spin: 1.5, material: 'glass', draw: 'marble' },
    'marble-m': { label: 'Marble', shape: 'circle', r: 16, density: 2.5, rest: 0.82, mu: 0.06, roll: 60, spin: 1.5, material: 'glass', draw: 'marble' },
    'marble-l': { label: 'Big marble', shape: 'circle', r: 23, density: 2.5, rest: 0.8, mu: 0.06, roll: 55, spin: 1.5, material: 'glass', draw: 'marble' },
    'shooter':  { label: 'Shooter', shape: 'circle', r: 32, density: 2.5, rest: 0.78, mu: 0.07, roll: 50, spin: 1.5, material: 'glass', draw: 'marble' },
  };

  // ---------- bodies ----------
  let nextId = 1;
  const bodies = [];   // dynamic
  const walls = [];    // static
  const holes = [];    // { x, y, r, team, goal?, trap? } — the match's five, or the maze's
  const sinking = [];  // { b, h, t } — marbles part way down a hole, drawn but not simulated

  function makeBody(kind, x, y, opts = {}) {
    const k = KINDS[kind];
    const b = {
      id: nextId++, kind, k, shape: k.shape,
      x, y, vx: 0, vy: 0, angle: opts.angle || 0, w: 0, roll: 0,
      static: false,
      rest: k.rest, mu: k.mu, material: k.material,
      colour: opts.colour || pick(MARBLE_COLOURS),
      team: opts.team || null,          // 'you' / 'ai' in a match or at bowls, else null
      striker: !!opts.striker,          // the shooter a side drives; not worth a point itself
      tx: 0, ty: 0, tcap: STEER_MAX,    // steering thrust, set fresh each frame
      brake: false,                     // hold it under tcap even with no direction pressed
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

  // ---------- the maze ----------
  // Rails of walnut screwed down across the baize. They never move, so the solver sees them as
  // infinite-mass boxes exactly like the rim, and `fixtures` is every one of them. Outside the
  // maze it is empty.
  const fixtures = [];
  const maze = {
    on: false, level: 0, cols: 0, rows: 0, cw: 0, ch: 0,
    open: null,               // open[r][c] = { e, s }: a gap in that cell's east / south side
    segs: [], posts: [],      // the rails as boxes, and the brass pins where runs end
    chamfers: [],             // the 45° rails across the bends
    path: [],                 // [c, r] for every cell from the start to the goal
    shooter: null, marble: null,
    t: 0, running: false, done: false, drops: 0, respawn: 0, stuck: 0,
  };

  const cellX = c => RIM + (c + 0.5) * maze.cw;
  const cellY = r => RIM + (r + 0.5) * maze.ch;

  // A perfect maze off a seed: carved by a depth-first walk, so every cell can be reached and
  // there is exactly one way between any two. The seed is fixed per level, so a best time is
  // always a time on the same maze.
  function carveMaze(cols, rows, seed) {
    const rng = seeded(seed);
    const open = [];
    for (let r = 0; r < rows; r++) {
      open.push([]);
      for (let c = 0; c < cols; c++) open[r].push({ e: false, s: false });
    }
    const seen = new Set([0]);
    const stack = [[0, 0]];
    while (stack.length) {
      const [c, r] = stack[stack.length - 1];
      const next = [[1, 0], [-1, 0], [0, 1], [0, -1]]
        .map(([dc, dr]) => [c + dc, r + dr])
        .filter(([nc, nr]) => nc >= 0 && nr >= 0 && nc < cols && nr < rows && !seen.has(nr * cols + nc));
      if (!next.length) { stack.pop(); continue; }
      const [nc, nr] = next[Math.floor(rng() * next.length)];
      if (nc > c) open[r][c].e = true;
      else if (nc < c) open[r][nc].e = true;
      else if (nr > r) open[r][c].s = true;
      else open[nr][c].s = true;
      seen.add(nr * cols + nc);
      stack.push([nc, nr]);
    }
    return open;
  }

  // The cells you can roll into from (c, r).
  function exits(c, r) {
    const o = maze.open, out = [];
    if (c < maze.cols - 1 && o[r][c].e) out.push([c + 1, r]);
    if (c > 0 && o[r][c - 1].e) out.push([c - 1, r]);
    if (r < maze.rows - 1 && o[r][c].s) out.push([c, r + 1]);
    if (r > 0 && o[r - 1][c].s) out.push([c, r - 1]);
    return out;
  }

  // Breadth-first from the start: the last cell reached is the far end of the longest way in,
  // which makes it the goal, and the trail back from it is the one way through.
  function routeFrom(c0, r0) {
    const prev = new Map([[r0 * maze.cols + c0, null]]);
    const q = [[c0, r0]];
    let last = q[0];
    while (q.length) {
      last = q.shift();
      for (const [nc, nr] of exits(last[0], last[1])) {
        const k = nr * maze.cols + nc;
        if (prev.has(k)) continue;
        prev.set(k, last);
        q.push([nc, nr]);
      }
    }
    const path = [];
    for (let p = last; p; p = prev.get(p[1] * maze.cols + p[0])) path.unshift(p);
    return path;
  }

  // Turns on the way through that leave the side the marble is lying against: the cell goes on
  // ahead, so nothing turns the marble for you, and the side you need it to leave from is a wall.
  function awkwardTurns() {
    const p = maze.path, open = (c, r, dc, dr) => exits(c, r).some(([x, y]) => x === c + dc && y === r + dr);
    let n = 0;
    for (let i = 1; i < p.length - 1; i++) {
      const [c, r] = p[i];
      const ic = c - p[i - 1][0], ir = r - p[i - 1][1], oc = p[i + 1][0] - c, or = p[i + 1][1] - r;
      if (ic === oc && ir === or) continue;
      if (open(c, r, ic, ir) && !open(c, r, -oc, -or)) n++;
    }
    return n;
  }

  function buildMaze(level) {
    const spec = MAZES[level];
    maze.level = level; maze.cols = spec.cols; maze.rows = spec.rows;
    maze.cw = (W - 2 * RIM) / spec.cols; maze.ch = (H - 2 * RIM) / spec.rows;
    // Not every maze is fair to push a marble through. Coming along the bar of a T and turning
    // off up its stem means pushing the little marble away from the wall it is lying against,
    // and the big one cannot get between the two. So the seeds are walked until the way through
    // has no turn like that in it. The side branches can have them; they are where you go wrong.
    let seed = 7919 * (level + 1) + 101, fewest = Infinity, pick = seed;
    for (let tries = 0; tries < 400; tries++, seed++) {
      maze.open = carveMaze(spec.cols, spec.rows, seed);
      maze.path = routeFrom(0, 0);
      const n = awkwardTurns();
      if (n < fewest) { fewest = n; pick = seed; }
      if (!n) break;
    }
    seed = pick;
    maze.open = carveMaze(spec.cols, spec.rows, seed);
    maze.path = routeFrom(0, 0);
    fixtures.length = 0; maze.segs.length = 0; maze.posts.length = 0;

    const half = MAZE_WALL / 2, pins = new Map();
    const pin = (x, y) => {
      // A pin on the rim would be screwed into the frame; only the ones out on the cloth show.
      if (x < RIM + 1 || x > W - RIM - 1 || y < RIM + 1 || y > H - RIM - 1) return;
      pins.set(Math.round(x) + ',' + Math.round(y), { x, y });
    };
    const rail = (x0, y0, x1, y1) => {
      const s = { x0: x0 - half, y0: y0 - half, x1: x1 + half, y1: y1 + half };
      maze.segs.push(s);
      fixtures.push(makeWall((s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2, (s.x1 - s.x0) / 2, (s.y1 - s.y0) / 2));
      pin(x0, y0); pin(x1, y1);
    };
    // Each line of the grid is laid as long runs rather than a rail per cell, so a marble rolling
    // along a wall never meets a seam between two of them.
    for (let r = 0; r < spec.rows - 1; r++) {
      const y = RIM + (r + 1) * maze.ch;
      let from = -1;
      for (let c = 0; c <= spec.cols; c++) {
        const shut = c < spec.cols && !maze.open[r][c].s;
        if (shut && from < 0) from = c;
        if (!shut && from >= 0) { rail(RIM + from * maze.cw, y, RIM + c * maze.cw, y); from = -1; }
      }
    }
    for (let c = 0; c < spec.cols - 1; c++) {
      const x = RIM + (c + 1) * maze.cw;
      let from = -1;
      for (let r = 0; r <= spec.rows; r++) {
        const shut = r < spec.rows && !maze.open[r][c].e;
        if (shut && from < 0) from = r;
        if (!shut && from >= 0) { rail(x, RIM + from * maze.ch, x, RIM + r * maze.ch); from = -1; }
      }
    }
    maze.posts = [...pins.values()];

    // The bends. A little marble against a rail can only be pushed along it, never off it —
    // the big one would have to stand inside the wall — so a square corner was somewhere it
    // could be pushed into and never got out of, and a turning could only be made by bouncing
    // it off something. Every corner where two walls meet has a rail across it at 45°, close
    // enough in that a marble rolled along the middle of the corridor meets it before the end
    // wall and is turned down the next one. They sit only in bends and blind ends: a straight
    // run and a junction have no two walls that meet.
    //
    // A blind end gets smaller ones. Nothing has to turn there, and two full-size rails would
    // meet in a V at the end wall: a square pocket again, only pointing the other way.
    const wx = maze.cw / 2 - half, wy = maze.ch / 2 - half;      // centre to the face of a wall
    maze.chamfers.length = 0;
    for (let r = 0; r < spec.rows; r++) {
      for (let c = 0; c < spec.cols; c++) {
        const o = maze.open[r];
        const shut = {
          w: c === 0 || !o[c - 1].e, e: c === spec.cols - 1 || !o[c].e,
          n: r === 0 || !maze.open[r - 1][c].s, s: r === spec.rows - 1 || !o[c].s,
        };
        const blind = shut.w + shut.e + shut.n + shut.s === 3;
        const leg = Math.min(wx, wy) - (blind ? 22 : 2);         // how far it runs along each wall
        for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          if (!shut[sx > 0 ? 'e' : 'w'] || !shut[sy > 0 ? 's' : 'n']) continue;
          // The face runs from the side wall to the end wall; the box sits behind it, in the corner.
          const ax = wx, ay = wy - leg, bx = wx - leg, by = wy;
          const len = Math.hypot(bx - ax, by - ay);
          const mx = (ax + bx) / 2 + MAZE_WALL / 2 / Math.SQRT2, my = (ay + by) / 2 + MAZE_WALL / 2 / Math.SQRT2;
          const f = makeWall(cellX(c) + sx * mx, cellY(r) + sy * my, len / 2 + half, half);
          f.angle = Math.atan2(sy * (by - ay), sx * (bx - ax));
          updateVerts(f);
          f.bound = Math.hypot(f.hw, f.hh);
          fixtures.push(f);
          maze.chamfers.push(f);
        }
      }
    }

    holes.length = 0; sinking.length = 0;
    // A hole in a blind end sits up against the end wall, like a pocket on a billiard table.
    // In the middle of the cell a marble that came in a little fast rolled over it and stopped
    // against the end wall, where the big one could never get behind it again. Up against the
    // wall, the wall is the backstop: it rides across, comes off the cushion and drops in.
    const pocket = ([c, r], rad) => {
      const [[nc, nr]] = exits(c, r);                      // a blind end has the one way out
      const dc = c - nc, dr = r - nr;                       // ...and the end wall is opposite it
      const reach = (dc ? maze.cw : maze.ch) / 2 - half - rad - 3;
      return { x: cellX(c) + dc * reach, y: cellY(r) + dr * reach };
    };
    const goal = maze.path[maze.path.length - 1];
    holes.push({ ...pocket(goal, GOAL_R), r: GOAL_R, team: null, goal: true });
    // The traps sit at the blind ends off the way through. Taking the marble somewhere to find
    // out where a turning goes can cost it — so scout with the big one first.
    const onPath = new Set(maze.path.map(([c, r]) => r * maze.cols + c));
    const ends = [];
    for (let r = 0; r < spec.rows; r++) {
      for (let c = 0; c < spec.cols; c++) {
        if (!onPath.has(r * maze.cols + c) && exits(c, r).length === 1) ends.push([c, r]);
      }
    }
    const rng = seeded(seed + 1);
    for (let i = ends.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [ends[i], ends[j]] = [ends[j], ends[i]];
    }
    for (const [c, r] of ends.slice(0, spec.traps)) {
      holes.push({ ...pocket([c, r], TRAP_R), r: TRAP_R, team: null, trap: true });
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
  let ctrl = null;        // body steered by the keys
  let ctrl2 = null;       // the second player's marble in a two-player match
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
  // Shift held: a gentle touch, and a brake on its own. Left Shift sits by WASD and right
  // Shift by the arrows, so a two-player match can hand one to each side.
  let softA = false, softB = false;
  // One wind-up per side, so a two-player match gives each of them their own.
  const windA = { t: 0, from: 0 }, windB = { t: 0, from: 0 };

  // The cap for one steered body this frame. The wind-up starts from whatever the body was
  // already doing, so pressing a direction can never pull a rolling shooter up short — that
  // is Shift's job, and Shift's alone.
  function steerCap(w, b, held, dt) {
    if (!held) { w.t = 0; return STEER_MIN; }
    if (w.t === 0) w.from = Math.max(STEER_MIN, Math.hypot(b.vx, b.vy));
    w.t += dt;
    return w.from + (STEER_MAX - w.from) * Math.min(1, w.t / STEER_RAMP);
  }

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

  // ---------- step ----------
  const soundQueue = [];
  const lastPairSound = new Map();

  function step(dt, now) {
    for (const b of bodies) {
      b.pulled = false;
      if (maze.on) lip(b, dt);
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
      }
      if (b.tx || b.ty || b.brake) {
        const sp = Math.hypot(b.vx, b.vy);
        if (sp > b.tcap) {
          const f = Math.max(b.tcap, sp - STEER_BRAKE * dt) / sp;
          b.vx *= f; b.vy *= f;
        }
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
      if (!b.tx && !b.ty && !b.pulled
        && Math.abs(b.vx) < 2.5 && Math.abs(b.vy) < 2.5) { b.vx = 0; b.vy = 0; }
      if (Math.abs(b.w) < 0.02) b.w = 0;
      if (b.shape === 'box' && (b.vx || b.vy || b.w)) updateVerts(b);
    }

    // Anything round and small enough that has wandered over a hole drops in.
    if (holes.length) {
      for (let i = bodies.length - 1; i >= 0; i--) {
        const b = bodies[i];
        if (b.shape !== 'circle') continue;
        if (Math.hypot(b.vx, b.vy) > SINK_SPEED) continue;   // going too fast, it skims over
        for (const h of holes) {
          if (b.r > h.r * 0.92) continue;                     // too fat to fit
          if (Math.hypot(b.x - h.x, b.y - h.y) < h.r - b.r * 0.55) { sink(b, h); break; }
        }
      }
    }
  }

  // In the maze the cloth is tucked up the foot of every rail, so nothing lies against one: a
  // marble at rest by a wall rolls a few px off it. Against the wood, the little marble could
  // only ever be pushed along the wall, never away from it, because the big one would have
  // had to stand inside the rail; a hand's breadth off it there is an angle to come in at.
  function lip(b, dt) {
    for (const f of walls.concat(fixtures)) {
      const c = Math.cos(f.angle), sn = Math.sin(f.angle);
      const lx = (b.x - f.x) * c + (b.y - f.y) * sn, ly = -(b.x - f.x) * sn + (b.y - f.y) * c;
      if (Math.abs(lx) > f.hw + b.r + LIP_W || Math.abs(ly) > f.hh + b.r + LIP_W) continue;
      const qx = clamp(lx, -f.hw, f.hw), qy = clamp(ly, -f.hh, f.hh);
      const ex = lx - qx, ey = ly - qy, d = Math.hypot(ex, ey), g = d - b.r;
      if (g >= LIP_W || d < 1e-6) continue;
      const a = LIP_ACCEL * (1 - Math.max(0, g) / LIP_W);
      const nx = (ex * c - ey * sn) / d, ny = (ex * sn + ey * c) / d;
      b.vx += nx * a * dt; b.vy += ny * a * dt;
      if (a > b.k.roll) b.pulled = true;                // still rolling off it, not at rest
    }
  }

  function sink(b, h) {
    const i = bodies.indexOf(b);
    if (i < 0) return;
    bodies.splice(i, 1);
    sinking.push({ b, h, t: 0 });
    if (ctrl === b) setControl(null);
    if (ctrl2 === b) setControl2(null);
    if (match.shot && match.shot.m === b) match.shot = null;
    if (maze.on && b === maze.marble) { mazeSunk(h); return; }
    // A ringed hole pays its own colour, whoever fell in. Shooters are too fat to fit down
    // one at all, so nothing here ever has to decide what a side scores off itself.
    if (b.team) score(h.team || b.team);
  }


  // ---------- adding ----------
  function add(kind, x, y, opts) {
    const b = makeBody(kind, x, y, opts);
    bodies.push(b);
    return b;
  }

  function overlapsAny(x, y, r, ignore) {
    for (const b of bodies) {
      if (b === ignore) continue;
      const d = Math.hypot(b.x - x, b.y - y);
      if (d < r + b.bound + 6) return true;
    }
    return false;
  }

  function removeBody(b) {
    const i = bodies.indexOf(b);
    if (i >= 0) bodies.splice(i, 1);
    if (ctrl === b) setControl(null);
    if (ctrl2 === b) setControl2(null);
  }

  function clearAll() {
    bodies.length = 0;
    setControl(null);
    setControl2(null);
  }

  // ---------- match ----------
  // Twelve marbles lie on the tray, six of each colour, and neither side owns the one
  // it is steering: each player drives a shooter, a marble too fat to fit down a hole.
  // You cannot put yourself in — the only way to score is to knock a marble in with it.
  // Four of the five holes are ringed in a colour and pay whoever owns the ring, whatever
  // fell in, so barging either colour into one of yours scores. The middle hole is
  // nobody's and pays the colour of the marble.
  let mode = null;                          // 'match' / 'maze' / 'bowls', once one is set out
  const TEAM = {
    you: { name: 'You', colour: MARBLE_COLOURS[3] },
    ai: { name: 'Opponent', colour: MARBLE_COLOURS[1] },
  };
  // `ease` is how well it judges the run-in: inside `dist` of the hole it stops pushing
  // and lets the marble coast, and anything still over SINK_SPEED rides across instead.
  // `best` is how often it takes the shot it rated highest rather than one of the next few,
  // and `reach` how far across the tray it will look for one.
  // `bowl` is the same three at bowls: how far its aim (radians) and its weight (a fraction)
  // wobble on the way out of its hand, and how often it plays the shot it rated best.
  const AI_LEVELS = [
    { name: 'Gentle', jitter: 0.44, wait: [1.8, 2.6], cap: 250, ease: { dist: 90, speed: 250 }, cool: [6.0, 9.0], best: 0.2, reach: 700,
      bowl: { aim: 0.06, power: 0.14, best: 0.3 } },
    { name: 'Even', jitter: 0.18, wait: [1.0, 1.6], cap: 380, ease: { dist: 135, speed: 215 }, cool: [3.5, 5.0], best: 0.6, reach: 950,
      bowl: { aim: 0.03, power: 0.07, best: 0.65 } },
    { name: 'Sharp', jitter: 0.05, wait: [0.6, 1.0], cap: 470, ease: { dist: 170, speed: 190 }, cool: [1.2, 2.0], best: 1, reach: 1400,
      bowl: { aim: 0.012, power: 0.03, best: 1 } },
  ];
  const match = {
    on: false, over: false, you: 0, ai: 0, level: 1, count: 0, beat: -1,
    waiting: false,                    // set out, but nothing runs until Play is pressed
    two: false,                        // two players sharing the keyboard, no computer
    yours: null, theirs: null,         // the two shooters
    shot: null, timer: 0, jitter: 0, cool: 0, idle: 0, shakes: 0,
  };

  // Which side a hole pays out to when a marble owned by `team` drops in it.
  function paidBy(h, team) { return h.team || team; }

  // The loose marbles — the shooters carry a team too, but they are furniture, not points.
  function inPlay() { return bodies.filter(b => b.team && !b.striker); }

  // Somewhere in the box with room around it and no hole within reach.
  function freeSpot(bound, x0, x1, y0, y1, ignore) {
    let x = (x0 + x1) / 2, y = (y0 + y1) / 2;
    for (let t = 0; t < 240; t++) {
      const cx = rand(x0, x1), cy = rand(y0, y1);
      if (overlapsAny(cx, cy, bound, ignore)) continue;
      let clash = false;
      // Well clear of every hole: a marble that starts a hand's breadth from one is a point
      // to whoever gets there first, which is not much of a match.
      for (const h of holes) if (Math.hypot(cx - h.x, cy - h.y) < h.r + bound + 74) { clash = true; break; }
      if (clash) continue;
      x = cx; y = cy; break;
    }
    return { x, y };
  }

  function placeIn(kind, x0, x1, y0, y1, opts) {
    const p = freeSpot(KINDS[kind].r, x0, x1, y0, y1);
    return add(kind, p.x, p.y, opts);
  }

  // A match is set out and then waits, frozen, for the Play button in the middle of the
  // tray; only then do the 3, 2, 1 run. `go` skips the wait, for a rematch off the result card.
  function startMatch(go) {
    clearAll();
    holes.length = 0; sinking.length = 0;
    match.on = true; match.over = false;
    match.you = 0; match.ai = 0;
    match.shot = null; match.timer = 0; match.cool = 0; match.idle = 0; match.shakes = 0;
    match.count = COUNTDOWN;                 // 3, 2, 1 to put the shooters down
    match.beat = -1;
    match.waiting = go !== true;
    on('result', null);
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
    on('ui');
    setControl(match.yours);
    setControl2(match.two ? match.theirs : null);
    if (!match.two) aiPlace();
  }

  // Two marbles tucked against the rim with nobody able to get behind them would sit there
  // for the rest of the afternoon. It is a tray: when the last of it has gone quiet and
  // nothing has dropped for a while, it gets a shake and the marbles come off the sides.
  //
  // A shake alone is not enough, though. A shooter sitting on the last marble in a corner
  // pins it: the shake shoves it, it comes straight back off the shooter and the two walls,
  // and the round can never end. So the shooters are shoved off the sides as well, and if
  // three shakes running still have not put anything down, the tray gets tipped up properly
  // and whatever is against the rim is set down in the middle with room around it.
  const SHAKE_WAIT = 13;    // seconds of nothing happening before the tray is shaken
  const SHAKE_GIVE_UP = 3;  // shakes in a row with no pot before the marbles are lifted out

  function matchIdle(dt) {
    if (!match.on || match.over || match.count > 0) return;
    match.idle += dt;
    if (match.idle < SHAKE_WAIT) return;
    // Only the marbles have to have settled — a shooter still casting about for a shot is
    // exactly the case this is here for.
    for (const b of inPlay()) if (Math.hypot(b.vx, b.vy) > 26) return;
    match.idle = 0;
    match.shakes = (match.shakes || 0) + 1;
    on('jolt', match.shakes >= SHAKE_GIVE_UP ? 200 : 120);

    if (match.shakes >= SHAKE_GIVE_UP) {
      rescueStuck();
      match.shakes = 0;
    } else {
      for (const b of inPlay()) {
        const a = rand(0, Math.PI * 2), sp = rand(150, 280);
        b.vx += Math.cos(a) * sp; b.vy += Math.sin(a) * sp;
        b.w += rand(-2, 2);
      }
    }
    // Whatever is leaning on the rim comes off it, shooters included — otherwise the thing
    // doing the pinning is the one thing the shake never touches.
    for (const b of bodies) shoveInward(b, b.striker ? 260 : 0);
    on('sfx', ['tap']);
  }

  // Push a body away from whichever sides it is up against. `extra` is a shove given even to
  // something not quite touching, which is how a shooter gets moved off a marble.
  function shoveInward(b, extra) {
    const near = b.bound + 26;
    let dx = 0, dy = 0;
    if (b.x - RIM < near) dx += 1;
    if (W - RIM - b.x < near) dx -= 1;
    if (b.y - RIM < near) dy += 1;
    if (H - RIM - b.y < near) dy -= 1;
    if (!dx && !dy) return;
    const d = Math.hypot(dx, dy);
    const sp = 150 + extra;
    b.vx += (dx / d) * sp; b.vy += (dy / d) * sp;
  }

  // The tray tipped up: every marble still hard against the rim is set down again in the
  // middle third, clear of the holes and of everything else, and the shooters are put back
  // in their own halves so neither can simply lean on it again.
  function rescueStuck() {
    const mid = { x0: W * 0.3, x1: W * 0.7, y0: H * 0.3, y1: H * 0.7 };
    for (const b of inPlay()) {
      const near = b.bound + 30;
      const stuck = b.x - RIM < near || W - RIM - b.x < near
        || b.y - RIM < near || H - RIM - b.y < near;
      if (!stuck) continue;
      const p = freeSpot(b.bound, mid.x0, mid.x1, mid.y0, mid.y1, b);
      b.x = p.x; b.y = p.y; b.vx = 0; b.vy = 0; b.w = 0;
      updateVerts(b);
    }
    for (const sh of [match.yours, match.theirs]) {
      if (!sh || bodies.indexOf(sh) < 0) continue;
      const half = halfFor(sh.team, sh.r);
      const p = freeSpot(sh.r, half.x0, half.x1, half.y0, half.y1, sh);
      sh.x = p.x; sh.y = p.y; sh.vx = 0; sh.vy = 0;
      updateVerts(sh);
    }
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
    match.idle = 0; match.shakes = 0;
    if (team === 'ai') {                     // it takes a breath rather than chaining pots
      const c = AI_LEVELS[match.level].cool;
      match.cool = rand(c[0], c[1]);
    }
    on('ui');
    if (match.over) return;
    // Every hole pays its ring, so any marble still on the tray is worth a point to either
    // side. The match runs until the last one is in — the only early finish is a lead the
    // marbles left cannot make up.
    const left = inPlay().length;
    if (!left || Math.abs(match.you - match.ai) > left) endMatch();
  }

  function endMatch() {
    const res = {};
    match.over = true;
    setControl(null); setControl2(null);
    match.shot = null;
    for (const b of bodies) { b.tx = 0; b.ty = 0; }
    const left = inPlay().length;
    const tie = match.you === match.ai;
    const won = match.you > match.ai;
    const [one, two] = match.two ? ['Player one', 'Player two'] : ['You', 'The opponent'];
    res.title = tie ? 'A draw' : won ? `${one} win${match.two ? 's' : ''}` : `${two} wins`;
    const tally = tie
      ? `${match.you} each. Nothing in it.`
      : match.two
        ? `Player one took ${match.you}, player two took ${match.ai}.`
        : `You took ${match.you}, the opponent took ${match.ai}.`;
    res.line = left
      ? `${tally} Settled with ${left === 1 ? 'one marble still' : `${left} marbles still`} on the tray.`
      : tally;
    on('result', res);
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
      const i = R() < lvl.best ? 0 : Math.floor(R() * Math.min(4, shots.length));
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

  // m:ss.t — a maze takes somewhere between ten seconds and a few minutes.
  function clock(t) {
    const m = Math.floor(t / 60), s = t - m * 60;
    return `${m}:${s.toFixed(1).padStart(4, '0')}`;
  }

  // ---------- maze ----------
  // One big marble and one little one in a maze of rails. The big one is yours and too fat for
  // any hole; the little one is the point. Push it through to the brass hole at the far end.
  function startMaze(level) {
    level = clamp(level, 0, MAZES.length - 1);
    clearAll();
    maze.on = true;
    buildMaze(level);
    maze.shooter = add('shooter', 0, 0, { colour: TEAM.you.colour });
    maze.marble = add('marble-s', 0, 0, { colour: MARBLE_COLOURS[2] });
    maze.t = 0; maze.running = false; maze.done = false; maze.drops = 0;
    mazeHome();
    setControl(maze.shooter);
    store.maze.level = level; on('save');
    lastPairSound.clear();
    on('result', null);
    on('paint-case');
    on('ui');
  }

  // Both marbles back to the mouth of the maze: the big one in the first cell, the little one
  // in the next, so the first push is already lined up. The clock is left alone.
  function mazeHome() {
    if (!maze.on || maze.done) return;
    const [c0, r0] = maze.path[0], [c1, r1] = maze.path[1];
    for (let i = sinking.length - 1; i >= 0; i--) if (sinking[i].b === maze.marble) sinking.splice(i, 1);
    for (const [b, x, y] of [[maze.shooter, cellX(c0), cellY(r0)], [maze.marble, cellX(c1), cellY(r1)]]) {
      b.x = x; b.y = y; b.vx = 0; b.vy = 0; b.w = 0;
      if (bodies.indexOf(b) < 0) bodies.push(b);
    }
    maze.respawn = 0; maze.stuck = 0;
  }

  function mazeTick(dt) {
    if (!maze.on || maze.done) return;
    if (!maze.running && (kdx || kdy)) maze.running = true;    // the clock starts on the first push
    if (maze.running) maze.t += dt;
    if (maze.respawn > 0) {
      maze.respawn -= dt;
      if (maze.respawn <= 0) mazeHome();
    }
    unwedge(dt);
    const txt = clock(maze.t);
    on('maze-time', txt);
  }

  // A little marble wedged into a corner, rail on two sides, has nowhere the big one can get
  // behind it and would sit there for good. After a moment the tray gives a tap and it rolls
  // out towards the middle of its cell.
  function unwedge(dt) {
    const m = maze.marble;
    // Barely moving rather than still: the big marble leaning on it keeps it twitching.
    if (bodies.indexOf(m) >= 0 && Math.hypot(m.vx, m.vy) < 20 && wedged(m)) {
      maze.stuck += dt;
      if (maze.stuck > WEDGE_WAIT) {
        maze.stuck = 0;
        const c = clamp(Math.floor((m.x - RIM) / maze.cw), 0, maze.cols - 1);
        const r = clamp(Math.floor((m.y - RIM) / maze.ch), 0, maze.rows - 1);
        const dx = cellX(c) - m.x, dy = cellY(r) - m.y, d = Math.hypot(dx, dy) || 1;
        m.vx = dx / d * WEDGE_POP; m.vy = dy / d * WEDGE_POP;
        on('jolt', 50);
        on('sfx', ['tap']);
      }
    } else maze.stuck = 0;
  }

  // Touching two walls that are not the same way round — a corner. With a rail across every
  // bend this should not happen, but a little marble pinned between a bend's rail and the big
  // one's last push can still end up somewhere awkward, and this costs nothing.
  function wedged(m) {
    const ns = [];
    for (const f of walls.concat(fixtures)) {
      const c = Math.cos(f.angle), sn = Math.sin(f.angle);
      const lx = (m.x - f.x) * c + (m.y - f.y) * sn, ly = -(m.x - f.x) * sn + (m.y - f.y) * c;
      const qx = clamp(lx, -f.hw, f.hw), qy = clamp(ly, -f.hh, f.hh);
      const nx = f.x + qx * c - qy * sn, ny = f.y + qx * sn + qy * c;
      const dx = m.x - nx, dy = m.y - ny, d = Math.hypot(dx, dy);
      if (d > m.r + 1.5 || d < 1e-6) continue;
      const n = { x: dx / d, y: dy / d };
      if (ns.some(o => o.x * n.x + o.y * n.y < 0.5)) return true;
      ns.push(n);
    }
    return false;
  }

  // The little marble went down a hole: the goal ends the maze, a trap sends it home.
  function mazeSunk(h) {
    if (h.goal) {
      maze.done = true; maze.running = false;
      setControl(null);
      const key = String(maze.level), prev = store.maze.best[key];
      const best = prev == null || maze.t < prev;
      if (best) store.maze.best[key] = Math.round(maze.t * 1000) / 1000;
      store.maze.reached = Math.max(store.maze.reached, Math.min(MAZES.length - 1, maze.level + 1));
      on('save');
      on('ui');
      on('sfx', ['beat', 0]);
      const last = maze.level === MAZES.length - 1;
      const lost = maze.drops ? ` It went down a hole ${maze.drops === 1 ? 'once' : maze.drops + ' times'} on the way.` : '';
      const line = prev == null ? `Maze ${maze.level + 1} in ${clock(maze.t)}.`
        : best ? `Maze ${maze.level + 1} in ${clock(maze.t)} — a new best.`
          : `Maze ${maze.level + 1} in ${clock(maze.t)}. Your best is ${clock(prev)}.`;
      // Let it finish dropping out of sight first.
      on('later', { ms: SINK_TIME * 1000 + 250, fn: () => {
        if (!maze.on || !maze.done) return;
        const res = {};
        res.title = last ? 'All eight' : 'Through';
        res.line = line + lost;
        res.again = last ? 'Again' : 'Next maze';
        on('result', res);
      } });
    } else {
      maze.drops++;
      maze.respawn = SINK_TIME + 0.5;
      on('sfx', ['tap']);
    }
  }


  // ---------- bowls ----------
  // Four big marbles a side, rolled from the mat at the left at the house, rings painted on the
  // far end of the cloth as at curling. When all eight are down, whoever lies nearest the
  // button scores one for every marble of theirs in the house nearer than the other side's best. First to BOWLS_TO. It is the sandbox's fling, kept: there are
  // no keys here, you pull back and let go.
  const bowls = {
    on: false, over: false, you: 0, ai: 0, end: 0, first: 'you', turn: 'you',
    left: { you: 0, ai: 0 },
    phase: 'aim',           // 'aim' -> 'rolling' -> (next bowl) ... -> 'scored'
    cur: null,              // the marble sat on the mat waiting to go
    aim: null,              // { id, x0, y0, px, py } while a pointer is pulling back
    plan: null,             // the computer's shot, being weighed and then wound up
    t: 0, think: 0,
    banner: null,           // what the end came to, written across the tray
    scored: [],             // the marbles that counted, ringed while the banner is up
  };
  const other = side => side === 'you' ? 'ai' : 'you';
  const sideName = side => match.two ? (side === 'you' ? 'Player one' : 'Player two') : (side === 'you' ? 'You' : 'The opponent');

  function startBowls() {
    clearAll();
    holes.length = 0; sinking.length = 0;
    Object.assign(bowls, { on: true, over: false, you: 0, ai: 0, end: 0, first: 'you' });
    on('result', null);
    startEnd();
  }

  function startEnd() {
    clearAll();
    bowls.end++;
    bowls.left = { you: BOWLS_EACH, ai: BOWLS_EACH };
    bowls.turn = bowls.first;
    bowls.scored = []; bowls.banner = null;
    lastPairSound.clear();
    nextBowl();
  }

  // The nearest clear spot on the mat to the height asked for.
  function matSpot(y, ignore) {
    const r = KINDS[BOWL].r, lo = RIM + r + 4, hi = H - RIM - r - 4;
    for (let k = 0; k < 40; k++) {
      const yy = clamp(y + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 14, lo, hi);
      if (!overlapsAny(MAT_X, yy, r, ignore)) return yy;
    }
    return clamp(y, lo, hi);
  }

  function nextBowl() {
    if (!bowls.left.you && !bowls.left.ai) { scoreEnd(); return; }
    if (!bowls.left[bowls.turn]) bowls.turn = other(bowls.turn);
    const t = bowls.turn;
    bowls.cur = add(BOWL, MAT_X, matSpot(HOUSE.y), { team: t, colour: TEAM[t].colour });
    bowls.phase = 'aim'; bowls.aim = null; bowls.plan = null;
    bowls.think = rand(0.7, 1.2);
    on('ui');
  }

  function humanTurn() { return bowls.on && bowls.phase === 'aim' && (bowls.turn === 'you' || match.two); }

  // How far a marble let go at `v` rolls on open cloth before the table stops it.
  const rollOut = v => v * v / (2 * KINDS[BOWL].roll);

  // A pull back of `px, py` as a launch: the opposite way, and harder the further it was pulled.
  // Rolling distance goes as speed squared, so the speed goes as the root of the pull.
  function flickFrom(px, py) {
    const len = Math.hypot(px, py);
    if (len < 1e-6) return { vx: 0, vy: 0, v: 0 };
    const v = Math.sqrt(Math.min(1, len / PULL_FULL)) * FLICK_MAX;
    return { vx: -px / len * v, vy: -py / len * v, v };
  }

  function throwBowl(vx, vy) {
    const b = bowls.cur;
    if (!b || bowls.phase !== 'aim') return;
    b.vx = vx; b.vy = vy;
    bowls.left[bowls.turn]--;
    bowls.phase = 'rolling'; bowls.t = 0; bowls.aim = null; bowls.plan = null; bowls.cur = null;
    on('sfx', ['tap']);
    on('ui');
  }

  function bowlsTick(dt) {
    if (!bowls.on || bowls.over) return;
    if (bowls.phase === 'rolling') {
      bowls.t += dt;
      const still = bodies.every(b => !b.vx && !b.vy);
      if ((bowls.t > 0.5 && still) || bowls.t > 14) {
        // Anything that never got over the line is dead and comes off.
        for (const b of bodies.slice()) if (b.team && b.x < DEAD_X) removeBody(b);
        bowls.turn = other(bowls.turn);
        nextBowl();
      }
    } else if (bowls.phase === 'aim' && bowls.turn === 'ai' && !match.two) {
      aiBowl(dt);
    } else if (bowls.phase === 'scored') {
      bowls.t += dt;
      if (bowls.banner) bowls.banner.t += dt;
      if (bowls.t > END_PAUSE) afterEnd();
    }
  }

  // Each marble in the house — touching the outer ring — by its distance to the button, nearest first.
  function standing(list) {
    return list.filter(b => b.team && b.x >= DEAD_X)
      .map(b => ({ b, d: Math.hypot(b.x - HOUSE.x, b.y - HOUSE.y) }))
      .filter(s => s.d < HOUSE_RINGS[0] + s.b.r)
      .sort((a, z) => a.d - z.d);
  }

  function scoreEnd() {
    const list = standing(bodies);
    let side = null, n = 0;
    if (list.length) {
      side = list[0].b.team;
      for (const s of list) { if (s.b.team !== side) break; n++; }
    }
    bowls.scored = list.slice(0, n).map(s => s.b);
    if (side) bowls[side] += n;
    const verb = side === 'you' && !match.two ? 'score' : 'scores';
    bowls.banner = { text: side ? `${sideName(side)} ${verb} ${n}` : 'Nothing counts', t: 0 };
    bowls.phase = 'scored'; bowls.t = 0; bowls.cur = null;
    // Whoever took the end goes first in the next, as on a green. A blank end swaps.
    bowls.first = side || other(bowls.first);
    on('sfx', ['beat', 0]);
    on('ui');
  }

  function afterEnd() {
    if (bowls.phase !== 'scored') return;
    if (bowls.you >= BOWLS_TO || bowls.ai >= BOWLS_TO) endBowls();
    else startEnd();
  }

  function endBowls() {
    const res = {};
    bowls.over = true;
    const won = bowls.you > bowls.ai;
    const [one, two] = match.two ? ['Player one', 'Player two'] : ['You', 'The opponent'];
    res.title = won ? `${one} win${match.two ? 's' : ''}` : `${two} wins`;
    const ends = bowls.end === 1 ? 'one end' : `${bowls.end} ends`;
    res.line = `${Math.max(bowls.you, bowls.ai)} to ${Math.min(bowls.you, bowls.ai)}, over ${ends}.`;
    res.again = 'Play again';
    on('result', res);
  }


  // ---------- the computer's bowl ----------
  // It bowls by trying it first. Each shot it is weighing is run forward on a copy of the tray,
  // with the very same physics, and it takes whichever leaves it best placed — then plays it
  // with a hand as unsteady as its level says. A few shots are tried each frame, so the
  // thinking is a pause rather than a stall.
  function simulate(prep, secs) {
    const real = bodies.slice();
    const copies = real.map(o => Object.assign({}, o, { wv: o.wv.map(p => ({ ...p })), wn: o.wn.map(p => ({ ...p })) }));
    bodies.length = 0; bodies.push(...copies);
    const q = soundQueue.length;
    prep(copies, real);
    const dt = 1 / 240;
    for (let i = 0, n = secs / dt; i < n; i++) {
      step(dt, 0);
      if (i > 20 && copies.every(c => !c.vx && !c.vy)) break;
    }
    bodies.length = 0; bodies.push(...real);
    soundQueue.length = q;
    return copies;
  }

  // How good a finished end looks to `side`: whole points for marbles that would count, and a
  // fraction for simply lying closer, so it prefers a near miss to a wide one.
  function endValue(list, side) {
    const near = { you: 600, ai: 600 }, ds = [];
    for (const s of standing(list)) { ds.push(s); near[s.b.team] = Math.min(near[s.b.team], s.d); }
    const foe = other(side);
    let n = 0;
    if (near[side] < near[foe]) { for (const s of ds) if (s.b.team === side && s.d < near[foe]) n++; }
    else if (near[foe] < near[side]) { for (const s of ds) if (s.b.team === foe && s.d < near[side]) n--; }
    return n + (near[foe] - near[side]) / 1200;
  }

  function planBowl(b) {
    const j = HOUSE, roll = b.k.roll, tries = [];
    const ys = [...new Set([j.y, j.y - 80, j.y + 80].map(y => Math.round(matSpot(y, b))))];
    for (const y of ys) {
      const fx0 = j.x - MAT_X, fy0 = j.y - y, fd = Math.hypot(fx0, fy0) || 1;
      const fx = fx0 / fd, fy = fy0 / fd, nx = -fy, ny = fx;
      const aimAt = (tx, ty, v) => {
        const dx = tx - MAT_X, dy = ty - y, d = Math.hypot(dx, dy) || 1;
        const sp = Math.min(FLICK_MAX, v || Math.sqrt(2 * roll * d));
        tries.push({ y, vx: dx / d * sp, vy: dy / d * sp });
      };
      // Draw shots: rolled to stop on, beside, short of or just past the button.
      for (const side of [-1, 0, 1]) {
        for (const along of [-1.4, -0.6, 0.4]) aimAt(j.x + nx * side * 36 + fx * along * 30, j.y + ny * side * 36 + fy * along * 30);
      }
      // Firing shots: straight through whatever of theirs is in the house, at full and three-quarter weight.
      for (const o of bodies) {
        if (o === b || o.team !== 'you' || Math.hypot(o.x - j.x, o.y - j.y) > HOUSE_RINGS[0] + o.r) continue;
        aimAt(o.x, o.y, FLICK_MAX);
        aimAt(o.x, o.y, FLICK_MAX * 0.9);
      }
    }
    return { tries, i: 0, best: null, all: [], ready: false, t: 0 };
  }

  function aiBowl(dt) {
    const b = bowls.cur;
    if (!b) return;
    if (bowls.think > 0) { bowls.think -= dt; return; }
    if (!bowls.plan) bowls.plan = planBowl(b);
    const plan = bowls.plan;
    if (!plan.ready) {
      const bi = bodies.indexOf(b);
      for (let n = 0; n < 4 && plan.i < plan.tries.length; n++, plan.i++) {
        const t = plan.tries[plan.i];
        const out = simulate(copies => {
          copies[bi].y = t.y; copies[bi].vx = t.vx; copies[bi].vy = t.vy;
        }, 9);
        t.value = endValue(out, 'ai');
        plan.all.push(t);
      }
      if (plan.i < plan.tries.length) return;
      const lvl = AI_LEVELS[match.level].bowl;
      plan.all.sort((a, z) => z.value - a.value);
      const pickI = R() < lvl.best ? 0 : Math.floor(R() * Math.min(3, plan.all.length));
      const t = plan.all[pickI];
      // One wobble of the hand per bowl, in direction and in weight.
      const wob = () => (rand(-1, 1) + rand(-1, 1) + rand(-1, 1)) / 1.7;
      const a = Math.atan2(t.vy, t.vx) + wob() * lvl.aim;
      const v = Math.min(FLICK_MAX, Math.hypot(t.vx, t.vy) * (1 + wob() * lvl.power));
      plan.shot = { vx: Math.cos(a) * v, vy: Math.sin(a) * v };
      b.y = t.y;
      plan.ready = true; plan.t = 0;
      return;
    }
    // Shown winding up for a moment, so you can see where it is going before it goes.
    plan.t += dt;
    if (plan.t > 0.8) throwBowl(plan.shot.vx, plan.shot.vy);
  }

  // ---------- control ----------
  function setControl(b) {
    if (ctrl && ctrl !== b) { ctrl.tx = 0; ctrl.ty = 0; }
    ctrl = b;
    windA.t = 0;
  }

  function setControl2(b) {
    if (ctrl2 && ctrl2 !== b) { ctrl2.tx = 0; ctrl2.ty = 0; }
    ctrl2 = b;
    windB.t = 0;
  }


  // ---------- choosing a game ----------
  // The state half of setMode: whatever was on the tray is put away and the next game set
  // out. The page does the buttons and panels round it.
  function selectMode(m) {
    if (!MODES.includes(m)) m = 'match';
    mode = m;
    match.on = false; match.over = false; match.shot = null;
    match.yours = null; match.theirs = null;
    maze.on = false; maze.done = false;
    bowls.on = false; bowls.over = false; bowls.aim = null; bowls.plan = null;
    clearAll();
    holes.length = 0; sinking.length = 0; fixtures.length = 0;
    store.mode = m; on('save');
    if (m === 'match') startMatch();
    else if (m === 'maze') startMaze(store.maze.level || 0);
    else startBowls();
    return m;
  }


  // ---------- one frame of the tray ----------
  // The countdown, the steering from the keys, the computer's shooter, the maze and the bowls,
  // the physics in SUBSTEPS, and marbles finishing their drop. Returns whether the 3-2-1 is on.
  function tick(dt, now) {
    // Nobody moves during the 3-2-1 — that is the window for setting the shooters down.
    const counting = match.on && !match.over && match.count > 0;
    if (counting && !match.waiting && dt > 0) {
      match.count = Math.max(0, match.count - dt);
      const n = match.count > 0 ? Math.ceil(match.count) - 1 : -1;
      if (n !== match.beat) { match.beat = n; on('sfx', ['beat', n]); }
    }

    for (const b of bodies) { b.tx = 0; b.ty = 0; b.brake = false; }
    // Either half of the keyboard drives your shooter, in a match or a maze. In a two-player
    // match they come apart: WASD is player one's shooter, the arrows player two's. Shift pins
    // the cap to the gentle end instead of letting it wind up, and on its own it is a brake.
    const live = !counting && !(match.on && match.over) && !(maze.on && maze.done);
    const drive = (b, w, dx, dy, gentle) => {
      const held = live && !!(dx || dy);
      if (held) { b.tx = dx; b.ty = dy; }
      const wind = steerCap(w, b, held && !gentle, dt);   // call it either way: it clears the wind-up
      if (gentle && live) { b.tcap = STEER_MIN; b.brake = true; }
      else if (held) b.tcap = wind;
    };
    if (match.on && match.two) {
      // Each player gets the Shift on their own side of the keyboard, or one of them would
      // be braking the other's shooter.
      if (ctrl) drive(ctrl, windA, k1x, k1y, softA);
      if (ctrl2) drive(ctrl2, windB, k2x, k2y, softB);
    } else if (ctrl) {
      drive(ctrl, windA, kdx, kdy, softA || softB);
    }
    if (match.on && dt > 0 && !counting) { aiThink(dt); matchIdle(dt); }
    if (dt > 0) { mazeTick(dt); bowlsTick(dt); }

    if (dt > 0) {
      const sub = dt / SUBSTEPS;
      for (let i = 0; i < SUBSTEPS; i++) step(sub, now);
    }
    for (let i = sinking.length - 1; i >= 0; i--) {
      sinking[i].t += dt;
      if (sinking[i].t >= SINK_TIME) sinking.splice(i, 1);
    }
    return counting;
  }

  return {
    seeded, makeBody, makeWall, updateVerts, carveMaze, exits, routeFrom, awkwardTurns, buildMaze, circleCircle, circlePoly, axisLeast, clip, polyPoly, collide, nearWall, relVel, solve, correct, steerCap, dirOf, keyDir, step, lip, sink, add, overlapsAny, removeBody, clearAll, paidBy, inPlay, freeSpot, placeIn, startMatch, matchIdle, shoveInward, rescueStuck, halfFor, placeShooter, aiPlace, score, endMatch, planShots, aiThink, clock, startMaze, mazeHome, mazeTick, unwedge, wedged, mazeSunk, startBowls, startEnd, matSpot, nextBowl, humanTurn, flickFrom, throwBowl, bowlsTick, standing, scoreEnd, afterEnd, endBowls, simulate, endValue, planBowl, aiBowl, setControl, setControl2, selectMode, W, H, RIM, SUBSTEPS, ITERATIONS, SLOP, PERCENT, REST_THRESH, SOUND_MIN, THRUST, STEER_MAX, STEER_MIN, STEER_RAMP, STEER_BRAKE, LEAN_K, LEAN_D, HOLE_R, HOLE_PULL, SINK_SPEED, SINK_TIME, TEAM_MARBLES, COUNTDOWN, MODES, MAZES, MAZE_WALL, GOAL_R, TRAP_R, LIP_W, LIP_ACCEL, WEDGE_WAIT, WEDGE_POP, BOWL, BOWLS_EACH, BOWLS_TO, MAT_X, DEAD_X, FLICK_MAX, PULL_FULL, HOUSE, HOUSE_RINGS, END_PAUSE, rand, pick, clamp, MARBLE_COLOURS, KINDS, bodies, walls, holes, sinking, fixtures, maze, cellX, cellY, keysA, keysB, KEYMAP, windA, windB, soundQueue, lastPairSound, TEAM, AI_LEVELS, match, SHAKE_WAIT, SHAKE_GIVE_UP, bowls, other, sideName, rollOut,
    get ctrl() { return ctrl; }, set ctrl(v) { ctrl = v; }, get ctrl2() { return ctrl2; }, set ctrl2(v) { ctrl2 = v; }, get k1x() { return k1x; }, set k1x(v) { k1x = v; }, get k1y() { return k1y; }, set k1y(v) { k1y = v; }, get k2x() { return k2x; }, set k2x(v) { k2x = v; }, get k2y() { return k2y; }, set k2y(v) { k2y = v; }, get kdx() { return kdx; }, set kdx(v) { kdx = v; }, get kdy() { return kdy; }, set kdy(v) { kdy = v; }, get mode() { return mode; }, set mode(v) { mode = v; }, get nextId() { return nextId; }, set nextId(v) { nextId = v; }, get softA() { return softA; }, set softA(v) { softA = v; }, get softB() { return softB; }, set softB(v) { softB = v; },
    selectMode, tick,
    seedDice(n) { R = mulberry32(n); },
  };
}
