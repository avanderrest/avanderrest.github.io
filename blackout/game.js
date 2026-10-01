/* Blackout — a stealth infiltration seen from above on an isometric grid,
   where nothing moves until you do. The spy and every guard
   stand on tiles; the guards walk their beats node by node, and each carries a
   torch that is an exact cone you can read. Lamps still decide everything: in
   the dark a guard only finds you inside his torch's short reach, in a lamp
   pool he finds you across the yard. You see clearly only a little way into
   the night; past that is fog, and all that gets through it is light. The
   building has an upper floor and the yard has a watchtower, both reached by
   stairs, and a floor above you is cut away until you climb up to it. */
(() => {
  'use strict';

  // ---------- constants ----------
  // v3: this Blackout replaced the side-on one on 2026-10-01. Its v2 best times
  // measured a different game, so they are dropped rather than carried.
  const SAVE_KEY = 'blackout-save-v3';
  const SOUND_KEY = 'blackout-sound';
  const DIFF_KEY = 'blackout-difficulty';
  ['blackout-save-v2', 'blackout-scale'].forEach((k) => { try { localStorage.removeItem(k); } catch (e) { /* storage blocked */ } });

  // the isometric projection, in world pixels: a tile is a 64x32 diamond
  const HW = 32, HH = 16;
  const STOREY = 54;          // how far up one floor sits
  const WALL_H = 44;          // a wall stops short of the floor above, and the slab fills the gap
  const WALL_CUT = 12;        // walls between you and the camera are cut down to this
  const SLAB = 22;            // the depth of the ground slab the compound floats on
  const FENCE_H = 34, RAIL_H = 13, CRATE_H = 22, POST_H = 66;
  const WT = 0.11;            // half a wall's thickness, in tiles

  // pace: nothing moves until you do. The guards take one step for every
  // GUARD_EVERY moves of yours; a move is a step, a shot, a takedown or a door.
  const GUARD_EVERY = 2;
  const GUARD_EVERY_ALARM = 1;   // once the alarm is up they keep pace with every move you make
  const MOVE_RUN = 0.5;       // a running step counts half a move: twice as far per guard step, and loud
  const MOVE_DRAG = 2;        // a step dragging a body counts double
  const STEP_T = 0.13;        // seconds a step takes on screen
  const RUN_T = 0.08;         // and a running one
  const CAM_EVERY = 3;        // cameras sweep a notch every this many ticks
  const LOOK_EVERY = 4;       // and the tower sentry turns
  const CORNER_WAIT = 2;      // ticks a patrol stands at each corner
  // Guards never run, not even on the hunt: one step a tick, whatever they are doing.
  const RING = { sneak: 5, run: 8, drag: 3 };   // how far the move grid is drawn around you

  // you
  const START_HP = 2;
  const ROUNDS = { normal: 12, hard: 5 };
  const NV_DRAIN = 3, NV_CHARGE = 1.5;   // goggle battery, percent per tick
  const SIGHT_DARK = 3.2;     // how far you see into the dark
  const SIGHT_NV = 8.5;       // and with the goggles on
  const SIGHT_MAX = 16;       // lamplight carries this far
  const SHOT_RANGE = 9;

  // being seen
  const LAMP_R = 3.8;         // a lamp's reach, in tiles
  const LIT = 0.3;            // light a guard can see you in from anywhere in his cone
  const SEE_LIGHT = 0.18;     // light you can see a tile in from anywhere
  const AMBIENT_OUT = 0.07, AMBIENT_IN = 0.03;
  const CONE_HALF = 0.72;     // half the torch's angle, radians
  const CONE_RANGE = 5.5;
  const TORCH_REACH = 2.5;    // inside this the torch finds you in the dark
  const HUNT_REACH = 3.5;     // and a guard who knows you are here sweeps it further
  const FLOOD_RANGE = 6.5;    // the tower's floodlight
  const CAM_RANGE = 6, CAM_HALF = 0.42;
  const SEEN_GAIN = { normal: 34, hard: 50 };
  const SEEN_CAM = 50;
  const SEEN_DECAY = 6;       // per tick nobody sees you
  const REINFORCE = { normal: 2, hard: 3 };
  const REINFORCE_DELAY = 6;  // ticks after the alarm before the gate opens

  // noise, in tiles
  const NOISE_RUN = 4.5, NOISE_GLASS = 3.5, NOISE_HACK = 6;

  const HACK = {
    normal: { zone: 0.3, speed: 0.8, narrow: 0.8, quicken: 1.15 },
    hard: { zone: 0.24, speed: 1.0, narrow: 0.66, quicken: 1.3 },
  };

  // grid directions: east, south, west, north (x grows down-right on screen, y down-left)
  const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const DIR_A = DIRS.map(([x, y]) => Math.atan2(y, x));

  const PHASES = {
    wire: 'Get inside the wire',
    card: 'Take the keycard off the yard patrol',
    door: 'Open the service door',
    terminal: 'Hack the terminal upstairs',
    escape: 'Get back out through the wire',
  };

  // ---------- the map ----------
  /* Two floors of 31 x 24 tiles. Each character is one node:
       .  yard          ,  indoor floor      o  outside the wire     _  platform grating
       #  wall          W  wall with window  D  keycard door         c/C  crate (indoor/yard)
       F  fence         V  the cut in it     G  the gate reinforcements come in by
       r  railing       S  stairs up         s  their top, a floor higher   T  terminal
       L  the top of a ladder, which drops to the yard tile named in LADDERS
     Stairs join S on one floor to s straight above it; every other edge is a
     step to one of the four neighbours on the same floor. */
  const W = 31, H = 24, LV = 2;
  const N = W * H * LV;
  const LEVELS = [
    [
      '                               ',
      '  FFFFFFFFFFFFFFFFFFFFFFFFFFFF ',
      '  F..........................F ',
      '  F.........CC.#WW###W###WW#.F ',
      '  F..####......#,cc,,#,,,,,#.F ',
      '  F..#  #......#,,,,c#,,,,,#.F ',
      '  F..#  #......W,,,,,,,,,,,W.F ',
      '  F..####......#c,,,,#,,,,c#.F ',
      '  F............###,###,,,,,#.F ',
      '  F.C..........#,,,,,###,###.F ',
      '  F.C..........W,,,,,#,,,,,W.F ',
      '  F............D,,,,,#,,,,,#.F ',
      '  F............#,,,,,,,,,,,#.G ',
      '  F............WS,c,,#,,,S,#.F ',
      '  F.......C....#,,,,,#,,,,,#.F ',
      '  F............##W###W###W##.F ',
      '  F..........................F ',
      '  F..........................F ',
      '  F.......C.............CC...F ',
      '  F..........................F ',
      '  F..........................F ',
      '  FFFFFVFFFFFFFFFFFFFFFFFFFFFF ',
      '   oooooooooooo                ',
      '   oooooooooooo                ',
    ],
    [
      '                               ',
      '                               ',
      '                               ',
      '               #WW##W#W##WW#   ',
      '     rrrr      #,,,,,#,,,,T#   ',
      '     r__L      #,,,,,#,,,,,#   ',
      '     r__r      W,,c,,,,,,,,W   ',
      '     rrrr      #,,,,,#,,,,,#   ',
      '               #,,,,,##,####   ',
      '               ###,###,,,,,#   ',
      '               W,,,,,,,,,,,W   ',
      '               #,,,,,#,,,,,#   ',
      '               #,,,,,#,,c,,#   ',
      '               Ws,,,,#,,,s,#   ',
      '               #,,,,,#,,,,,#   ',
      '               ##W##W###W###   ',
      '                               ',
      '                               ',
      '                               ',
      '                               ',
      '                               ',
      '                               ',
      '                               ',
      '                               ',
    ],
  ];

  const TILE = {
    '.': { floor: 'yard', walk: 1 },
    'o': { floor: 'dirt', walk: 1, outside: 1 },
    ',': { floor: 'tile', walk: 1 },
    '_': { floor: 'grate', walk: 1 },
    'S': { floor: 'tile', walk: 1, stairs: 1 },
    's': { floor: 'tile', walk: 1, stairs: 1, top: 1 },
    '#': { floor: 'tile', wall: 1, opaque: 1 },
    'W': { floor: 'tile', wall: 1, window: 1 },
    'D': { floor: 'tile', wall: 1, door: 1 },
    'F': { floor: 'yard', fence: 1 },
    'V': { floor: 'yard', fence: 1, cut: 1, walk: 1, playerOnly: 1 },
    'G': { floor: 'yard', fence: 1, gate: 1, walk: 1, guardOnly: 1 },
    'r': { floor: 'grate', rail: 1 },
    'L': { floor: 'grate', walk: 1, ladder: 1 },
    'C': { floor: 'yard', crate: 1, opaque: 1 },
    'c': { floor: 'tile', crate: 1, opaque: 1 },
    'T': { floor: 'tile', terminal: 1 },
  };

  /* Floors above the ground. An open one (the tower) is always drawn; a roofed
     one is cut away, so you look down into the rooms beneath, until you are
     standing on it. */
  const UPPER = [
    { name: 'tower', lv: 1, x0: 5, y0: 4, x1: 8, y1: 7, open: true },
    { name: 'building', lv: 1, x0: 15, y0: 3, x1: 27, y1: 15, open: false },
  ];
  const BUILDING = UPPER[1];

  /* Lamps. A post stands on its tile with the lamp on an arm; a wall lamp is
     fixed to (mx,my) and shines over (x,y); a ceiling light hangs over (x,y). */
  const LAMPS = [
    { kind: 'post', x: 9, y: 19, lv: 0, ax: 0, ay: -1 },
    { kind: 'post', x: 12, y: 9, lv: 0, ax: 1, ay: 0 },
    { kind: 'post', x: 3, y: 16, lv: 0, ax: 1, ay: 0 },
    { kind: 'post', x: 20, y: 18, lv: 0, ax: 0, ay: -1 },
    { kind: 'wall', x: 14, y: 12, lv: 0, mx: 15, my: 12 },
    { kind: 'wall', x: 19, y: 2, lv: 0, mx: 19, my: 3 },
    { kind: 'wall', x: 28, y: 8, lv: 0, mx: 27, my: 8 },
    { kind: 'wall', x: 9, y: 6, lv: 0, mx: 8, my: 6 },
    { kind: 'ceil', x: 18, y: 12, lv: 0 },
    { kind: 'ceil', x: 24, y: 6, lv: 0 },
    { kind: 'ceil', x: 24, y: 12, lv: 0 },
    { kind: 'ceil', x: 18, y: 6, lv: 1 },
    { kind: 'ceil', x: 24, y: 5, lv: 1 },
    { kind: 'ceil', x: 24, y: 12, lv: 1 },
    { kind: 'ceil', x: 18, y: 12, lv: 1 },
  ];

  // cameras: fixed to (mx,my), looking out from (x,y), sweeping a0..a1 a notch a turn
  const CAMERAS = [
    { x: 15, y: 16, lv: 0, mx: 15, my: 15, a0: Math.PI * 0.5, a1: Math.PI * 0.95, steps: 3 },
    // The terminal room's camera, on the south wall by the door. Tuned with test/blackout/terminal.js so
    // the terminal can be reached past it unseen, but only from a few entry timings and only by the
    // shortest way: you can do it without shooting it, just.
    { x: 24, y: 7, lv: 1, mx: 24, my: 8, a0: -3.02, a1: -0.82, steps: 3, every: 2 },
  ];

  /* Guards walk their route waypoint to waypoint, taking the shortest path
     between, and pause a step at each corner. The tower sentry never moves: he
     turns through his looks, and his floodlight falls on the yard below. */
  const GUARDS = [
    { x: 4, y: 13, lv: 0, card: true, route: [[4, 13], [12, 13], [12, 17], [4, 17]] },
    { x: 9, y: 2, lv: 0, route: [[9, 2], [28, 2], [28, 17], [16, 17]] },
    { x: 17, y: 13, lv: 0, route: [[17, 13], [25, 11], [24, 5], [18, 5]] },
    { x: 17, y: 12, lv: 1, route: [[17, 12], [25, 11], [23, 6], [18, 5]] },
    { x: 7, y: 6, lv: 1, looks: [1, 0, 1, 2], overlook: true },
  ];

  // Ladders: down the outside of a wall, from a top tile to a foot tile a floor below.
  // The tower's is the only way on or off its platform, for the sentry and for you.
  const LADDERS = [{ top: [8, 5, 1], foot: [9, 5, 0] }];

  const START = { x: 7, y: 23, lv: 0 };
  const GATE = { x: 29, y: 12, lv: 0 };

  LEVELS.forEach((rows, lv) => rows.forEach((r, y) => {
    if (r.length !== W) console.error('blackout-2: floor ' + lv + ' row ' + y + ' is ' + r.length + ' wide');
  }));

  // ---------- grid ----------
  const key = (x, y, lv) => (lv * H + y) * W + x;
  const kx = (k) => k % W;
  const ky = (k) => Math.floor(k / W) % H;
  const kl = (k) => Math.floor(k / (W * H));
  const inb = (x, y, lv) => x >= 0 && y >= 0 && x < W && y < H && lv >= 0 && lv < LV;
  const ch = (x, y, lv) => (inb(x, y, lv) ? LEVELS[lv][y][x] : ' ');
  const tile = (x, y, lv) => TILE[ch(x, y, lv)] || null;
  const inRegion = (r, x, y) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
  const regionOf = (x, y, lv) => (lv === 0 ? null : UPPER.find((r) => r.lv === lv && inRegion(r, x, y)) || null);
  const angDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  const dirIndex = (dx, dy) => (Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 0 : 2) : (dy >= 0 ? 1 : 3));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------- state ----------
  let state = null;
  let difficulty = 'normal';
  try { if (localStorage.getItem(DIFF_KEY) === 'hard') difficulty = 'hard'; } catch (e) { /* storage blocked */ }

  function mkGuard(d, i) {
    return {
      id: i, x: d.x, y: d.y, lv: d.lv, rx: d.x, ry: d.y, rl: d.lv,
      route: d.route || (d.looks ? [[d.x, d.y, d.lv]] : null), wp: d.route ? 1 % d.route.length : 0, wait: 0,
      looks: d.looks || null, lookI: 0, overlook: !!d.overlook, sentry: !!d.looks,
      card: !!d.card, face: d.looks ? d.looks[0] : 0, ra: 0,
      mode: d.looks ? 'sentry' : 'patrol', target: null, marker: null,
      down: false, dead: false, reviving: null, carried: false, found: false, shot: false, saw: false, look: 0, walk: 0, aiming: false,
    };
  }

  function newGame(diff) {
    if (diff) difficulty = diff;
    state = {
      difficulty, mode: 'title', ticks: 0, moves: 0, pace: 0, run: false, nv: false, battery: 100,
      hp: START_HP, rounds: ROUNDS[difficulty], seen: 0, alarm: false, earlyAlarm: false,
      phase: 'wire', hasCard: false, dataDone: false, doors: {},
      player: { x: START.x, y: START.y, lv: START.lv, rx: START.x, ry: START.y, rl: START.lv, face: 3, walk: 0 },
      guards: GUARDS.map(mkGuard),
      lamps: LAMPS.map((l) => Object.assign({ alive: true }, l)),
      cams: CAMERAS.map((c) => Object.assign({ alive: true, t: 0, dir: 1, a: c.a0, ra: c.a0 }, c)),
      posts: new Set(LAMPS.filter((l) => l.kind === 'post').map((l) => key(l.x, l.y, l.lv))),
      dragging: null, lastKnown: null, reinforceIn: -1, reinforceLeft: 0,
      spotted: false, interrupt: false,
      queue: [], busy: 0, skipDelay: false,
      vis: new Uint8Array(N), light: new Float32Array(N), torch: new Uint8Array(N), danger: new Uint8Array(N),
      reach: null, aim: null, hack: null, checkpoint: null,
      fx: [], shots: 0, takedowns: 0, steps: 0,
    };
    state.guards.forEach((g) => {
      if (g.route) {
        const n = nextStep(g, g.route[g.wp]);
        if (n) g.face = dirIndex(kx(n) - g.x, ky(n) - g.y);
      }
      g.ra = DIR_A[g.face];
    });
    computeLight();
    computeVision();
    computeReach();
    return state;
  }

  // ---------- walls, doors and sight lines ----------
  const doorOpen = (x, y, lv) => !!state.doors[key(x, y, lv)];

  function opaque(x, y, lv, high) {
    const t = tile(x, y, lv);
    if (!t) return false;
    if (t.crate) return !high;
    if (t.door) return !doorOpen(x, y, lv);
    return !!t.opaque;
  }

  /* A sight line between two points in tile units, blocked by any opaque tile it
     crosses other than the two it starts and ends in. From high up (the tower)
     crates do not block, nor does the tower's own wall under your feet. */
  function losF(ax, ay, bx, by, lv, high) {
    const sx = Math.floor(ax), sy = Math.floor(ay), ex = Math.floor(bx), ey = Math.floor(by);
    const dx = bx - ax, dy = by - ay;
    const n = Math.ceil(Math.hypot(dx, dy) * 4);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const tx = Math.floor(ax + dx * t), ty = Math.floor(ay + dy * t);
      if ((tx === sx && ty === sy) || (tx === ex && ty === ey)) continue;
      if (high && Math.hypot(tx + 0.5 - ax, ty + 0.5 - ay) < 2.2) continue;
      if (opaque(tx, ty, lv, high)) return false;
    }
    return true;
  }
  const los = (x0, y0, x1, y1, lv, high) => losF(x0 + 0.5, y0 + 0.5, x1 + 0.5, y1 + 0.5, lv, high);

  // ---------- light ----------
  function lampPoint(l) {
    if (l.kind === 'post') return [l.x + 0.5 + l.ax * 0.32, l.y + 0.5 + l.ay * 0.32];
    if (l.kind === 'wall') return [l.mx + 0.5 + (l.x - l.mx) * 0.66, l.my + 0.5 + (l.y - l.my) * 0.66];
    return [l.x + 0.5, l.y + 0.5];
  }
  const lampTile = (l) => [l.x, l.y, l.lv];

  const LM_RES = 4;   // light-map cells per tile, so pools are round and walls cast shadows
  const lmCanvas = [], fogCanvas = [];
  for (let lv = 0; lv < LV; lv++) {
    const a = document.createElement('canvas'); a.width = W * LM_RES; a.height = H * LM_RES; lmCanvas.push(a);
    const b = document.createElement('canvas'); b.width = W; b.height = H; fogCanvas.push(b);
  }

  function computeLight() {
    const L = state.light;
    for (let k = 0; k < N; k++) {
      const x = kx(k), y = ky(k), lv = kl(k);
      const t = tile(x, y, lv);
      L[k] = !t ? 0 : (lv === 0 && !inRegion(BUILDING, x, y) ? AMBIENT_OUT : AMBIENT_IN);
    }
    for (const l of state.lamps) {
      if (!l.alive) continue;
      const [px, py] = lampPoint(l);
      const R = LAMP_R;
      for (let y = Math.floor(py - R); y <= Math.ceil(py + R); y++) {
        for (let x = Math.floor(px - R); x <= Math.ceil(px + R); x++) {
          if (!tile(x, y, l.lv)) continue;
          const d = Math.hypot(x + 0.5 - px, y + 0.5 - py);
          if (d >= R) continue;
          if (d > 0.75 && !losF(px, py, x + 0.5, y + 0.5, l.lv)) continue;
          const v = Math.min(1, (1 - d / R) * 1.25);
          const k = key(x, y, l.lv);
          if (v > L[k]) L[k] = v;
        }
      }
    }
    paintLightmaps();
  }

  function paintLightmaps() {
    for (let lv = 0; lv < LV; lv++) {
      const c = lmCanvas[lv], g = c.getContext('2d');
      const img = g.createImageData(c.width, c.height), d = img.data;
      const lamps = state.lamps.filter((l) => l.alive && l.lv === lv).map((l) => {
        const [px, py] = lampPoint(l);
        return { px, py, col: l.kind === 'ceil' ? [196, 232, 226] : [255, 212, 138] };
      });
      for (let j = 0; j < c.height; j++) {
        for (let i = 0; i < c.width; i++) {
          const tx = Math.floor(i / LM_RES), ty = Math.floor(j / LM_RES);
          const t = tile(tx, ty, lv);
          if (!t || t.wall) continue;
          const u = (i + 0.5) / LM_RES, v = (j + 0.5) / LM_RES;
          let best = 0, col = null;
          for (const l of lamps) {
            const dd = Math.hypot(u - l.px, v - l.py);
            if (dd >= LAMP_R) continue;
            let a = 1 - dd / LAMP_R;
            a = a * a * (1.6 - 0.6 * a);
            if (a <= best) continue;
            if (dd > 0.4 && !losF(l.px, l.py, u, v, lv)) continue;
            best = a; col = l.col;
          }
          if (!col) continue;
          const o = (j * c.width + i) * 4;
          d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = Math.min(255, best * 235);
        }
      }
      g.putImageData(img, 0, 0);
    }
  }

  // ---------- who sees what ----------
  // the floodlight only while he is up at his post
  const flood = (g) => g.overlook && g.mode === 'sentry';
  function coneRangeOf(g) { return flood(g) ? FLOOD_RANGE : CONE_RANGE; }
  // the floor a guard's cone lies on: the tower's floodlight falls on the yard
  function conePlane(g) { return flood(g) ? 0 : g.lv; }

  function inCone(g, x, y, lv, range) {
    const dx = x - g.x, dy = y - g.y;
    const d = Math.hypot(dx, dy);
    if (d > range) return false;
    if (d < 0.1) return true;
    return angDiff(Math.atan2(dy, dx), DIR_A[g.face]) <= CONE_HALF;
  }

  /* Can this guard see (x,y,lv) right now? Inside his torch's reach, yes, dark
     or not; further out only if the tile is lit. The floodlight lights all of
     its cone. The sentry also watches his own platform like anyone else. */
  function seesTile(g, x, y, lv) {
    if (g.down || g.carried) return false;
    // at the two ends of one staircase there is nowhere to hide from each other
    if (lv !== g.lv && x === g.x && y === g.y && stairOther(key(g.x, g.y, g.lv)) === key(x, y, lv)) return true;
    if (lv === g.lv) {
      if (!inCone(g, x, y, lv, CONE_RANGE)) return false;
      if (!los(g.x, g.y, x, y, lv, false)) return false;
      const d = Math.hypot(x - g.x, y - g.y);
      const reach = g.mode === 'hunt' ? HUNT_REACH : TORCH_REACH;
      return d <= reach || state.light[key(x, y, lv)] >= LIT;
    }
    if (flood(g) && lv === 0) {
      if (!inCone(g, x, y, lv, FLOOD_RANGE)) return false;
      return los(g.x, g.y, x, y, 0, true);
    }
    return false;
  }

  function camPoint(c) { return [c.x + 0.5, c.y + 0.5]; }
  function camSees(c, x, y, lv) {
    if (!c.alive || lv !== c.lv) return false;
    const dx = x - c.x, dy = y - c.y, d = Math.hypot(dx, dy);
    if (d > CAM_RANGE) return false;
    if (d > 0.1 && angDiff(Math.atan2(dy, dx), c.a) > (c.half || CAM_HALF)) return false;
    if (!los(c.x, c.y, x, y, lv, false)) return false;
    return d <= 1.5 || state.light[key(x, y, lv)] >= LIT;
  }

  function watchedAt(x, y, lv) {
    for (const g of state.guards) if (seesTile(g, x, y, lv)) return true;
    for (const c of state.cams) if (camSees(c, x, y, lv)) return true;
    return false;
  }

  // tiles a torch is lighting: you can see what is in them however far off they are
  function computeTorch() {
    const T = state.torch;
    T.fill(0);
    for (const g of state.guards) {
      if (g.down || g.carried) continue;
      const lv = conePlane(g), R = flood(g) ? FLOOD_RANGE : TORCH_REACH, high = flood(g);
      for (let y = Math.floor(g.y - R); y <= Math.ceil(g.y + R); y++) {
        for (let x = Math.floor(g.x - R); x <= Math.ceil(g.x + R); x++) {
          if (!tile(x, y, lv) || (x === g.x && y === g.y)) continue;
          if (!inCone(g, x, y, lv, R)) continue;
          if (!los(g.x, g.y, x, y, lv, high)) continue;
          T[key(x, y, lv)] = 1;
        }
      }
    }
  }

  // the first sight of the man with the card is announced, and where he was last seen is kept
  function hintCard() {
    if (state.hasCard) return;
    const g = state.guards.find((q) => q.card);
    if (!g || state.vis[key(g.x, g.y, g.lv)] !== 2) return;
    state.cardSeenAt = [g.x, g.y, g.lv];
    if (!state.cardHinted && state.mode === 'play') { state.cardHinted = true; say('That one has the keycard — the cyan card', 'good'); }
  }

  function computeVision() {
    const V = state.vis;
    for (let k = 0; k < N; k++) if (V[k] === 2) V[k] = 1;
    computeTorch();
    const p = state.player;
    const R = state.nv ? SIGHT_NV : SIGHT_DARK;
    seeFrom(p.x, p.y, p.lv, false, R);
    const reg = regionOf(p.x, p.y, p.lv);
    if (reg && reg.open) seeFrom(p.x, p.y, 0, true, R + 2);   // from the tower you look down on the yard
    // an open platform is seen whenever its foot is
    for (const r of UPPER) {
      if (!r.open) continue;
      let any = false;
      for (let y = r.y0 - 1; y <= r.y1 + 1 && !any; y++) {
        for (let x = r.x0 - 1; x <= r.x1 + 1; x++) if (V[key(x, y, 0)] === 2) { any = true; break; }
      }
      if (!any) continue;
      // and so is the structure it stands on
      for (let y = r.y0; y <= r.y1; y++) {
        for (let x = r.x0; x <= r.x1; x++) {
          if (tile(x, y, r.lv)) V[key(x, y, r.lv)] = 2;
          if (tile(x, y, 0) && tile(x, y, 0).wall) V[key(x, y, 0)] = 2;
        }
      }
    }
    paintFog();
    hintCard();
  }

  function seeFrom(ox, oy, lv, high, R) {
    const V = state.vis;
    for (let y = Math.max(0, oy - SIGHT_MAX); y <= Math.min(H - 1, oy + SIGHT_MAX); y++) {
      for (let x = Math.max(0, ox - SIGHT_MAX); x <= Math.min(W - 1, ox + SIGHT_MAX); x++) {
        if (!tile(x, y, lv)) continue;
        const d = Math.hypot(x - ox, y - oy);
        if (d > SIGHT_MAX) continue;
        const k = key(x, y, lv);
        if (d > 1.5 && !los(ox, oy, x, y, lv, high)) continue;
        if (d <= R || state.light[k] >= SEE_LIGHT || state.torch[k]) V[k] = 2;
      }
    }
  }

  const FOG = [22, 29, 31];
  function paintFog() {
    for (let lv = 0; lv < LV; lv++) {
      const c = fogCanvas[lv], g = c.getContext('2d');
      const img = g.createImageData(W, H), d = img.data;
      const A = new Uint8Array(W * H);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const k = key(x, y, lv);
          if (!tile(x, y, lv)) { A[y * W + x] = 255; continue; }   // decided below
          const v = state.vis[k];
          A[y * W + x] = v === 2 ? 0 : v === 1 ? 128 : 218;
        }
      }
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          let a = A[y * W + x];
          if (!tile(x, y, lv)) {
            // off the map: take the fog of the nearest floor, so its edge does not fade out
            a = 0;
            for (const [dx, dy] of DIRS) {
              const xx = x + dx, yy = y + dy;
              if (xx < 0 || yy < 0 || xx >= W || yy >= H || !tile(xx, yy, lv)) continue;
              a = Math.max(a, A[yy * W + xx]);
            }
          }
          const o = (y * W + x) * 4;
          d[o] = FOG[0]; d[o + 1] = FOG[1]; d[o + 2] = FOG[2]; d[o + 3] = a;
        }
      }
      g.putImageData(img, 0, 0);
    }
  }

  // ---------- the graph ----------
  function passable(x, y, lv, who) {
    const t = tile(x, y, lv);
    if (!t) return false;
    if (t.door) return who === 'guard' || doorOpen(x, y, lv);
    if (t.playerOnly && who !== 'player') return false;
    if (t.guardOnly && who !== 'guard') return false;
    if (t.outside && who === 'guard') return false;
    if (!t.walk) return false;
    if (state.posts.has(key(x, y, lv))) return false;
    return true;
  }

  function neighbours(k, who) {
    const out = [];
    const x = kx(k), y = ky(k), lv = kl(k);
    for (const [dx, dy] of DIRS) if (passable(x + dx, y + dy, lv, who)) out.push(key(x + dx, y + dy, lv));
    const c = ch(x, y, lv);
    if (c === 'S' && ch(x, y, lv + 1) === 's') out.push(key(x, y, lv + 1));
    if (c === 's' && ch(x, y, lv - 1) === 'S') out.push(key(x, y, lv - 1));
    for (const l of LADDERS) {
      if (x === l.top[0] && y === l.top[1] && lv === l.top[2]) out.push(key(l.foot[0], l.foot[1], l.foot[2]));
      if (x === l.foot[0] && y === l.foot[1] && lv === l.foot[2]) out.push(key(l.top[0], l.top[1], l.top[2]));
    }
    return out;
  }

  function stairOther(k) {
    const x = kx(k), y = ky(k), lv = kl(k), c = ch(x, y, lv);
    if (c === 'S' && ch(x, y, lv + 1) === 's') return key(x, y, lv + 1);
    if (c === 's' && ch(x, y, lv - 1) === 'S') return key(x, y, lv - 1);
    return -1;
  }

  function bfs(from, who, maxDepth, blocked) {
    const dist = new Int16Array(N).fill(-1), prev = new Int32Array(N).fill(-1);
    dist[from] = 0;
    const q = [from];
    for (let i = 0; i < q.length; i++) {
      const c = q[i];
      if (dist[c] >= maxDepth) continue;
      for (const n of neighbours(c, who)) {
        if (dist[n] >= 0 || (blocked && blocked.has(n))) continue;
        dist[n] = dist[c] + 1; prev[n] = c; q.push(n);
      }
    }
    return { dist, prev };
  }

  const guardAt = (x, y, lv) => state.guards.find((g) => !g.down && g.x === x && g.y === y && g.lv === lv) || null;
  const bodyAt = (x, y, lv) => state.guards.find((g) => g.down && !g.carried && g.x === x && g.y === y && g.lv === lv) || null;
  const pkey = () => key(state.player.x, state.player.y, state.player.lv);

  // the first step of a guard's shortest path to t, or null
  function nextStep(g, t) {
    const from = key(g.x, g.y, g.lv), to = key(t[0], t[1], t[2] === undefined ? g.lv : t[2]);
    if (from === to) return null;
    const r = bfs(from, 'guard', 400, null);
    if (r.dist[to] < 0) return null;
    let c = to;
    while (r.prev[c] !== from) c = r.prev[c];
    return c;
  }

  // ---------- your move ----------
  /* There are no turns. Nothing moves until you do: every GUARD_EVERY moves
     of yours, the world ticks, each guard takes one step, and the cameras and
     the sentry turn on their own counts. Stand still and the compound waits.
     You can change your mind mid-walk: a new click or key replaces the walk,
     and Space stops it. */
  const canAct = () => !!state && state.mode === 'play';
  const idle = () => canAct() && state.queue.length === 0;
  const ringSize = () => (state.dragging ? RING.drag : state.run ? RING.run : RING.sneak);

  function computeReach() {
    const blocked = new Set(state.guards.filter((g) => !g.down).map((g) => key(g.x, g.y, g.lv)));
    state.reach = bfs(pkey(), 'player', 9999, blocked);
    computeDanger();
  }

  // red on the move grid: tiles near you that someone is watching right now
  function computeDanger() {
    const D = state.danger, r = state.reach, R = ringSize();
    D.fill(0);
    if (!r) return;
    for (let k = 0; k < N; k++) {
      if (r.dist[k] < 0 || r.dist[k] > R) continue;
      if (watchedAt(kx(k), ky(k), kl(k))) D[k] = 1;
    }
  }

  function pathTo(k) {
    const r = state.reach, from = pkey();
    if (!r || r.dist[k] <= 0) return null;
    const path = [];
    for (let c = k; c !== from; c = r.prev[c]) path.push(c);
    return path.reverse();
  }

  // Walking onto stairs takes you up (or down) them.
  function resolveTarget(k) {
    const o = stairOther(k), r = state.reach;
    if (o >= 0 && r && r.dist[o] === r.dist[k] + 1 && k !== pkey()) return o;
    return k;
  }

  function dropMoves() { state.queue = state.queue.filter((q) => q.tag !== 'move'); }

  function cancelMoves() {
    dropMoves();
    state.queue.unshift({ fn: afterAction, delay: 0, tag: 'after' });
    state.skipDelay = true;
  }

  function moveTo(k) {
    if (!canAct()) return false;
    dropMoves();
    computeReach();
    k = resolveTarget(k);
    const path = pathTo(k);
    if (!path) return false;
    state.interrupt = false;
    const t = state.run && !state.dragging ? RUN_T : STEP_T;
    for (const k of path) enqueue(() => walkStep(k), t, 'move');
    enqueue(afterAction, 0, 'move');
    state.aim = null;
    return true;
  }

  /* The tile one grid step in direction d, or -1. At the foot of a ladder, a
     step into the wall climbs it; at the top, a step off the edge climbs down. */
  function stepTarget(d) {
    if (!state.reach) return -1;
    const p = state.player, [dx, dy] = DIRS[d], D = state.reach.dist;
    const nx = p.x + dx, ny = p.y + dy;
    if (inb(nx, ny, p.lv) && D[key(nx, ny, p.lv)] === 1) return key(nx, ny, p.lv);
    for (const l of LADDERS) {
      const [tx, ty, tl] = l.top, [fx, fy, fl] = l.foot;
      if (p.x === fx && p.y === fy && p.lv === fl && nx === tx && ny === ty && D[key(tx, ty, tl)] === 1) return key(tx, ty, tl);
      if (p.x === tx && p.y === ty && p.lv === tl && nx === fx && ny === fy && D[key(fx, fy, fl)] === 1) return key(fx, fy, fl);
    }
    return -1;
  }

  function stepDir(d) {
    if (!canAct() || state.queue.length > 1) return false;   // a held key never runs ahead of the walk
    dropMoves();
    computeReach();
    const p = state.player, [dx, dy] = DIRS[d];
    const k = stepTarget(d);
    if (k < 0) {
      p.face = d;
      if (!guardAt(p.x + dx, p.y + dy, p.lv)) say('Cannot go that way');
      return false;
    }
    return moveTo(k);
  }

  /* The arrow keys step along the grid, which on screen runs diagonally: up is
     up-left, right is up-right, down is down-right and left is down-left. */
  const ARROW_DIR = { up: 2, right: 3, down: 0, left: 1 };
  const arrowTarget = (name) => stepTarget(ARROW_DIR[name]);

  // Esc: stop a walk where you are
  function stopWalk() {
    if (canAct() && state.queue.some((q) => q.tag === 'move' && q.fn !== afterAction)) cancelMoves();
  }

  // Space: stay where you are for one move; the guards carry on as if you had stepped
  function stay() {
    if (!canAct()) return false;
    if (state.queue.some((q) => q.tag === 'move' && q.fn !== afterAction)) { cancelMoves(); return true; }
    if (state.queue.length > 1) return false;
    dropMoves();
    enqueue(() => { if (state.mode !== 'play') return; spend(1); afterAction(); }, STEP_T, 'move');
    return true;
  }

  // For tests only: let the world tick once as if you had moved.
  function wait() {
    if (!canAct()) return false;
    enqueue(() => { worldTick(); afterAction(); }, STEP_T, 'move');
    return true;
  }

  // A move of yours: count it, and when enough have gone by the world ticks.
  function spend(n) {
    state.moves++;
    state.pace += n;
    const every = () => (state.alarm ? GUARD_EVERY_ALARM : GUARD_EVERY);
    while (state.pace >= every() - 1e-6 && state.mode === 'play') {
      state.pace -= every();
      worldTick();
    }
  }

  function walkStep(k) {
    if (state.mode !== 'play') return cancelMoves();
    if (!playerStep(k)) return cancelMoves();
    if (state.mode !== 'play') return;
    const stopped = state.interrupt;
    spend(state.dragging ? MOVE_DRAG : state.run ? MOVE_RUN : 1);
    if (state.interrupt || stopped) { state.interrupt = false; cancelMoves(); }
  }

  function playerStep(k) {
    const p = state.player;
    const x = kx(k), y = ky(k), lv = kl(k);
    if (guardAt(x, y, lv)) return false;
    if (lv === p.lv) p.face = dirIndex(x - p.x, y - p.y);
    p.x = x; p.y = y; p.lv = lv;
    state.steps++;
    sfxStep();
    if (state.run && !state.dragging) makeNoise(x, y, lv, NOISE_RUN, true);
    pickUp();
    advance();
    computeVision();
    detect();
    checkWin();
    return true;
  }

  function afterAction() {
    if (state.mode !== 'play') return;
    computeVision();
    computeReach();
  }

  /* Anything but a step (a shot, a takedown, a door) also takes a tick. Asked
     for mid-walk, it stops the walk and happens when the step in hand is done. */
  function act(fn) {
    if (!canAct()) return false;
    if (state.queue.length) {
      dropMoves();
      enqueue(() => { if (canAct()) fn(); }, 0, 'act');
      return true;
    }
    return fn();
  }

  function pickUp() {
    const p = state.player;
    const b = bodyAt(p.x, p.y, p.lv);
    if (b && b.card) {
      b.card = false;
      state.hasCard = true;
      fxText(p.x, p.y, p.lv, 'KEYCARD', '#8ff0ff');
      say('Keycard taken', 'good');
      sfx(880, 0.08, 0.06, 'square'); sfx(1320, 0.1, 0.05, 'square', 0.08);
    }
  }

  function advance() {
    const p = state.player, t = tile(p.x, p.y, p.lv);
    if (state.phase === 'wire' && t && !t.outside && !t.cut) state.phase = 'card';
    if (state.phase === 'card' && state.hasCard) state.phase = 'door';
    if (state.phase === 'door' && state.doorOpened) state.phase = 'terminal';
    if (state.phase === 'terminal' && state.dataDone) state.phase = 'escape';
  }

  function checkWin() {
    const p = state.player, t = tile(p.x, p.y, p.lv);
    if (state.dataDone && t && t.outside) { win(); return true; }
    return false;
  }

  // ---------- actions ----------
  function adjacent(x, y, lv) {
    const p = state.player;
    return lv === p.lv && Math.abs(x - p.x) + Math.abs(y - p.y) === 1;
  }

  // from beside or behind: anywhere he is not facing
  function canTakedown(g) {
    const p = state.player;
    if (g.down || !adjacent(g.x, g.y, g.lv)) return false;
    return angDiff(Math.atan2(p.y - g.y, p.x - g.x), DIR_A[g.face]) > CONE_HALF + 0.01;
  }

  // What Z would do here, in order of how much it matters.
  function contextAction() {
    if (!state || state.mode !== 'play') return null;
    const p = state.player;
    for (const [dx, dy] of DIRS) {
      const x = p.x + dx, y = p.y + dy;
      if (ch(x, y, p.lv) === 'T' && !state.dataDone) return { kind: 'hack', x, y, lv: p.lv, label: 'Z to hack' };
    }
    for (const g of state.guards) if (canTakedown(g)) return { kind: 'takedown', g, x: g.x, y: g.y, lv: g.lv, label: 'Z take down' };
    for (const [dx, dy] of DIRS) {
      const x = p.x + dx, y = p.y + dy;
      if (ch(x, y, p.lv) === 'D' && !doorOpen(x, y, p.lv)) {
        return state.hasCard
          ? { kind: 'door', x, y, lv: p.lv, label: 'Z to open' }
          : { kind: 'locked', x, y, lv: p.lv, label: 'Locked — needs a keycard' };
      }
    }
    if (state.dragging) return { kind: 'drop', x: p.x, y: p.y, lv: p.lv, label: 'Z put him down' };
    let b = bodyAt(p.x, p.y, p.lv);
    if (!b) for (const [dx, dy] of DIRS) { b = bodyAt(p.x + dx, p.y + dy, p.lv); if (b) break; }
    if (b) return { kind: 'drag', g: b, x: b.x, y: b.y, lv: b.lv, label: 'Z drag the body' };
    return null;
  }

  function doAction(a) {
    if (!a || !canAct()) return false;
    if (a.kind === 'locked') { say('Locked — the patrol carries a keycard'); sfx(140, 0.12, 0.05, 'square'); return false; }
    return act(() => doActionNow(a));
  }

  function doActionNow(a) {
    const p = state.player;
    if (a.kind === 'hack') { startHack(); return true; }
    if (a.kind === 'drop') {
      const g = state.dragging;
      if (!g) return false;
      g.x = p.x; g.y = p.y; g.lv = p.lv; g.rx = p.rx; g.ry = p.ry; g.rl = p.rl; g.carried = false;
      state.dragging = null;
      pickUp();
      say('Put down');
      computeVision(); detect(); afterAction();
      return true;
    }
    if (a.kind === 'door') {
      state.doors[key(a.x, a.y, a.lv)] = true;
      state.doorOpened = true;
      say('Service door open', 'good');
      sfx(420, 0.08, 0.05, 'square'); sfx(640, 0.12, 0.05, 'square', 0.09);
      computeLight();
      advance();
    } else if (a.kind === 'takedown') {
      const g = a.g;
      if (!canTakedown(g)) return false;
      g.down = true; g.dead = false; g.mode = 'down'; g.marker = null; g.aiming = false;
      state.takedowns++;
      p.face = dirIndex(g.x - p.x, g.y - p.y);
      sfxThud();
      say(g.card ? 'Out cold. He has a keycard — step over him' : 'Out cold. If they find him they will wake him', 'good');
    } else if (a.kind === 'drag') {
      state.dragging = a.g; a.g.carried = true;
      say('Dragging — slow going');
      state.run = false;
    }
    computeVision();
    detect();
    spend(1);
    afterAction();
    return true;
  }

  // ---------- the pistol ----------
  function targetPos(t) {
    if (t.kind === 'lamp') return lampTile(t.o);
    if (t.kind === 'cam') return [t.o.x, t.o.y, t.o.lv];
    return [t.o.x, t.o.y, t.o.lv];
  }

  function fireCheck(t) {
    const p = state.player;
    const [x, y, lv] = targetPos(t);
    if (t.kind === 'guard' && (t.o.down || t.o.carried)) return 'Already down';
    if ((t.kind === 'lamp' || t.kind === 'cam') && !t.o.alive) return 'Already out';
    if (lv !== p.lv) return 'Not from this floor';
    if (state.vis[key(x, y, lv)] !== 2) return 'Cannot see it';
    const d = Math.hypot(x - p.x, y - p.y);
    if (d > SHOT_RANGE) return 'Out of range';
    if (d > 0.5 && !los(p.x, p.y, x, y, lv, false)) return 'No clear shot';
    if (state.rounds <= 0) return 'Out of rounds';
    return null;
  }

  function targets() {
    const list = [];
    for (const l of state.lamps) if (l.alive) list.push({ kind: 'lamp', o: l });
    for (const c of state.cams) if (c.alive) list.push({ kind: 'cam', o: c });
    for (const g of state.guards) if (!g.down) list.push({ kind: 'guard', o: g });
    const p = state.player;
    return list.filter((t) => !fireCheck(t)).sort((a, b) => {
      const [ax, ay] = targetPos(a), [bx, by] = targetPos(b);
      return Math.hypot(ax - p.x, ay - p.y) - Math.hypot(bx - p.x, by - p.y);
    });
  }

  function fire(t) {
    if (!canAct() || !t) return false;
    const why = fireCheck(t);
    if (why) { say(why); return false; }
    return act(() => fireNow(t));
  }

  function fireNow(t) {
    if (fireCheck(t)) return false;
    const p = state.player;
    const [x, y, lv] = targetPos(t);
    state.rounds--; state.shots++;
    p.face = dirIndex(x - p.x, y - p.y);
    state.fx.push({ kind: 'tracer', from: [p.x, p.y, p.lv, 22], to: targetAnchor(t), t: 0, life: 0.18, col: '255,236,190' });
    sfxShot();
    if (t.kind === 'lamp') {
      t.o.alive = false;
      sfxGlass();
      makeNoise(x, y, lv, NOISE_GLASS, false);
      computeLight();
      say('Lamp out');
    } else if (t.kind === 'cam') {
      t.o.alive = false;
      sfxGlass();
      say('Camera down');
    } else {
      const g = t.o;
      g.down = true; g.dead = true; g.mode = 'down'; g.marker = null; g.aiming = false;
      sfxThud();
      say(g.card ? 'Dead. He has a keycard — and if they find him, the alarm goes up' : 'Dead. If they find him, the alarm goes up', 'good');
    }
    state.aim = null;
    computeVision();
    detect();
    spend(1);
    afterAction();
    return true;
  }

  function toggleRun() {
    if (!state || state.dragging) { say('Not while dragging a body'); return; }
    state.run = !state.run;
    if (canAct()) computeReach();
    say(state.run ? 'Running — twice as far, and loud' : 'Sneaking');
  }

  function toggleNV() {
    if (!state) return;
    if (!state.nv && state.battery < 10) { say('Goggles flat — let them charge'); return; }
    state.nv = !state.nv;
    sfx(state.nv ? 1200 : 500, 0.06, 0.04, 'sine');
    if (state.mode === 'play') { computeVision(); if (canAct()) computeReach(); }
  }

  // ---------- noise ----------
  function makeNoise(x, y, lv, r, steps) {
    state.fx.push({ kind: 'ring', x, y, lv, t: 0, life: 0.9, r });
    let heard = false;
    for (const g of state.guards) {
      if (g.down || g.mode === 'sentry' || g.lv !== lv) continue;
      if (Math.hypot(g.x - x, g.y - y) > r) continue;
      heard = true;
      if (g.mode === 'hunt') { state.lastKnown = [x, y, lv]; continue; }
      g.mode = 'suspect'; g.target = [x, y, lv]; g.marker = '?';
      if (g.x !== x || g.y !== y) g.face = dirIndex(x - g.x, y - g.y);
    }
    if (heard && steps) say('A guard heard your footsteps');
    if (heard) computeVision();
  }

  // ---------- being seen ----------
  function detect() {
    if (state.mode !== 'play') return;
    const p = state.player;
    for (const g of state.guards) {
      if (g.down) continue;
      if (seesTile(g, p.x, p.y, p.lv)) spottedBy(g, false);
      for (const b of state.guards) {
        if (!b.down || b.carried || b.found) continue;
        if (seesTile(g, b.x, b.y, b.lv)) foundBody(b, g);
      }
    }
    for (const c of state.cams) {
      if (!c.alive) continue;
      if (camSees(c, p.x, p.y, p.lv)) spottedBy(c, true);
      for (const b of state.guards) {
        if (!b.down || b.carried || b.found) continue;
        if (camSees(c, b.x, b.y, b.lv)) foundBody(b, null);
      }
    }
  }

  /* A killed man found is the alarm. A knocked-out one gets walked over to and
     woken: by the guard who saw him, or, if a camera did, the nearest guard on
     that floor. Neither the finder nor the woken man forgets it in a hurry. */
  function foundBody(b, finder) {
    b.found = true;
    if (b.dead) { raiseAlarm(finder ? 'Body found' : 'Body on camera'); return; }
    let g = finder;
    if (!g) {
      let bd = Infinity;
      for (const q of state.guards) {
        if (q.down || q.lv !== b.lv || q.mode === 'sentry') continue;
        const d = Math.hypot(q.x - b.x, q.y - b.y);
        if (d < bd) { bd = d; g = q; }
      }
    }
    if (!g) { b.found = false; return; }
    if (g.mode !== 'hunt') { g.mode = 'suspect'; g.marker = '?'; }
    g.target = [b.x, b.y, b.lv];
    g.reviving = b.id;
    say('A guard has found the man you knocked out', 'bad');
  }

  function spottedBy(src, isCam, loud) {
    const p = state.player;
    state.spotted = true;
    state.interrupt = true;
    if (state.alarm) {
      state.lastKnown = [p.x, p.y, p.lv];
      if (!isCam) { src.mode = 'hunt'; src.marker = '!'; }
      return;
    }
    if (!isCam) {
      src.mode = 'suspect'; src.target = [p.x, p.y, p.lv]; src.marker = '?';
      if (src.x !== p.x || src.y !== p.y) src.face = dirIndex(p.x - src.x, p.y - src.y);
    }
    if (src.saw && !loud) return;       // one jump per watcher per turn
    src.saw = true;
    const d = Math.hypot(src.x - p.x, src.y - p.y);
    const gain = loud ? 50 : isCam ? SEEN_CAM : d <= 1.5 ? 100 : SEEN_GAIN[state.difficulty];
    state.seen = Math.min(100, state.seen + gain);
    fxText(p.x, p.y, p.lv, isCam ? 'CAMERA' : 'SEEN', '#ffd479');
    sfx(660, 0.08, 0.05, 'triangle'); sfx(990, 0.1, 0.04, 'triangle', 0.07);
    if (isCam) {
      for (const g of state.guards) {
        if (g.down || g.mode === 'sentry' || g.lv !== src.lv || Math.hypot(g.x - src.x, g.y - src.y) > 9) continue;
        g.mode = 'suspect'; g.target = [p.x, p.y, p.lv]; g.marker = '?';
      }
    }
    if (state.seen >= 100) raiseAlarm('Spotted');
    else say(isCam ? 'A camera saw you' : 'Seen — he is coming to look', 'bad');
  }

  function raiseAlarm(why) {
    if (state.alarm) return;
    const p = state.player;
    state.alarm = true;
    if (!state.dataDone) state.earlyAlarm = true;
    state.seen = 100;
    state.lastKnown = [p.x, p.y, p.lv];
    for (const g of state.guards) {
      if (g.down) continue;
      g.marker = '!';
      g.mode = 'hunt'; g.target = null;
    }
    state.reinforceIn = REINFORCE_DELAY;
    state.reinforceLeft = REINFORCE[state.difficulty];
    say(why + ' — the alarm is up', 'bad');
    sfxAlarm();
  }

  // ---------- the world's tick ----------
  // each watcher can raise the Seen bar once between ticks, and each hunter fire once a tick
  function tickBegin() {
    for (const g of state.guards) { g.saw = false; g.shot = false; }
    for (const c of state.cams) c.saw = false;
  }

  function worldTick() {
    if (state.mode !== 'play') return;
    state.ticks++;
    for (const g of state.guards) guardStep(g);
    {
      for (const c of state.cams) {
        if (!c.alive || state.ticks % (c.every || CAM_EVERY) !== 0) continue;
        c.t += c.dir;
        if (c.t >= c.steps || c.t <= 0) c.dir = -c.dir;
        c.t = clamp(c.t, 0, c.steps);
        c.a = c.a0 + (c.a1 - c.a0) * (c.t / c.steps);
      }
    }
    if (state.ticks % LOOK_EVERY === 0) {
      for (const g of state.guards) {
        if (g.down || g.mode !== 'sentry') continue;
        g.lookI = (g.lookI + 1) % g.looks.length;
        g.face = g.looks[g.lookI];
      }
    }
    if (state.alarm && state.reinforceLeft > 0) {
      if (state.reinforceIn > 0) state.reinforceIn--;
      else if (!guardAt(GATE.x, GATE.y, GATE.lv)) {
        const g = mkGuard({ x: GATE.x, y: GATE.y, lv: GATE.lv }, state.guards.length);
        g.mode = 'hunt'; g.marker = '!'; g.face = 2; g.ra = Math.PI; g.route = null;
        state.guards.push(g);
        state.reinforceLeft--;
        say('More of them, through the gate', 'bad');
      }
    }
    if (state.nv) {
      state.battery = Math.max(0, state.battery - NV_DRAIN);
      if (state.battery <= 0) { state.nv = false; say('Goggles flat'); }
    } else state.battery = Math.min(100, state.battery + NV_CHARGE);
    computeVision();
    detect();
    if (!state.spotted && !state.alarm) state.seen = Math.max(0, state.seen - SEEN_DECAY);
    state.spotted = false;
    const p = state.player;
    for (const g of state.guards) {
      if (!state.alarm && g.marker === '?' && g.mode === 'patrol') g.marker = null;
      if (g.aiming && (g.down || !seesTile(g, p.x, p.y, p.lv))) g.aiming = false;
    }
    tickBegin();
  }

  function guardStep(g) {
    if (g.down) return false;
    const p = state.player;
    /* A hunter who sees you takes aim first — the red line — and fires on his
       next step only if he can still see you. Break his line and he lowers it. */
    if (g.mode === 'hunt') {
      const sees = seesTile(g, p.x, p.y, p.lv);
      if (g.aiming && sees && !g.shot) {
        guardShoots(g);
        g.shot = true;
        return true;
      }
      if (!sees) g.aiming = false;
      else if (!g.aiming) {
        g.aiming = true;
        g.face = dirIndex(p.x - g.x, p.y - g.y);
        if (!state.aimWarned) { say('He has you in his sights — break his line', 'bad'); state.aimWarned = true; }
        return true;
      }
    }
    if (g.mode === 'sentry') return false;
    const here = (t) => g.x === t[0] && g.y === t[1] && g.lv === (t[2] === undefined ? g.lv : t[2]);
    // the sentry, back up at his post, takes up his sweep again
    if (g.looks && g.mode === 'patrol' && here(g.route[0])) {
      g.mode = 'sentry'; g.marker = null; g.face = g.looks[g.lookI];
      return false;
    }

    if (g.mode === 'patrol') {
      if (g.wait > 0) { g.wait--; return false; }
      const wp = g.route[g.wp];
      if (here(wp)) {
        g.wp = (g.wp + 1) % g.route.length;
        g.wait = CORNER_WAIT;
        const n = nextStep(g, g.route[g.wp]);
        if (n !== null) g.face = dirIndex(kx(n) - g.x, ky(n) - g.y);
        return true;
      }
      return walkToward(g, wp);
    }
    if (g.reviving !== null) {
      const b = state.guards.find((q) => q.id === g.reviving);
      if (!b || !b.down || b.carried) g.reviving = null;
      else if (b.lv === g.lv && Math.abs(b.x - g.x) + Math.abs(b.y - g.y) <= 1) {
        b.down = false; b.found = false; b.mode = state.alarm ? 'hunt' : 'search'; b.look = 4; b.marker = state.alarm ? '!' : '?';
        g.reviving = null;
        if (g.mode !== 'hunt') { g.mode = 'search'; g.look = 3; }
        if (state.vis[key(b.x, b.y, b.lv)] === 2) say('He has been woken up', 'bad');
        return true;
      } else return walkToward(g, [b.x, b.y, b.lv]) || true;
    }
    if (g.mode === 'suspect') {
      if (!g.target || here(g.target) || !walkToward(g, g.target)) {
        if (g.target && !here(g.target) && guardBlockedOnly(g, g.target)) return false;
        g.mode = 'search'; g.look = 3;
        return true;
      }
      return true;
    }
    if (g.mode === 'search') {
      g.face = (g.face + 1) % 4;
      if (--g.look <= 0) {
        g.mode = state.alarm ? 'hunt' : 'patrol';
        g.marker = state.alarm ? '!' : null;
        g.target = null;
        if (g.route) g.wp = nearestWaypoint(g);
      }
      return true;
    }
    if (g.mode === 'hunt') {
      const lk = state.lastKnown;
      if (lk && !here(lk) && nextStep(g, lk) !== null) {
        g.target = null;
        return walkToward(g, lk);
      }
      if (lk && here(lk)) state.lastKnown = null;
      if (!g.target || here(g.target) || nextStep(g, g.target) === null) g.target = wanderTarget(g);
      return g.target ? walkToward(g, g.target) : false;
    }
    return false;
  }

  function guardBlockedOnly(g, t) {
    const n = nextStep(g, t);
    return n !== null && !!guardAt(kx(n), ky(n), kl(n));
  }

  function walkToward(g, t) {
    const n = nextStep(g, t);
    if (n === null) return false;
    const x = kx(n), y = ky(n), lv = kl(n), p = state.player;
    if (x === p.x && y === p.y && lv === p.lv) {
      // walked straight into the spy
      g.face = dirIndex(x - g.x, y - g.y);
      g.saw = false;
      spottedBy(g, false);
      if (!state.alarm) { state.seen = 100; raiseAlarm('Walked into you'); }
      return true;
    }
    if (guardAt(x, y, lv)) return false;
    if (lv === g.lv) g.face = dirIndex(x - g.x, y - g.y);
    g.x = x; g.y = y; g.lv = lv;
    return true;
  }

  function nearestWaypoint(g) {
    let best = 0, bd = Infinity;
    g.route.forEach((w, i) => {
      const d = Math.hypot(w[0] - g.x, w[1] - g.y) + (g.lv === (w[2] === undefined ? g.lv : w[2]) ? 0 : 20);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }

  function wanderTarget(g) {
    const r = bfs(key(g.x, g.y, g.lv), 'guard', 6, null);
    const opts = [];
    for (let k = 0; k < N; k++) if (r.dist[k] >= 3) opts.push(k);
    if (!opts.length) return null;
    const k = opts[Math.floor(Math.random() * opts.length)];
    return [kx(k), ky(k), kl(k)];
  }

  function guardShoots(g) {
    const p = state.player;
    g.face = dirIndex(p.x - g.x, p.y - g.y);
    state.hp--;
    state.fx.push({ kind: 'tracer', from: [g.x, g.y, g.lv, 22], to: [p.x, p.y, p.lv, 20], t: 0, life: 0.22, col: '255,120,100' });
    state.fx.push({ kind: 'flash', t: 0, life: 0.35 });
    fxText(p.x, p.y, p.lv, '-1 HP', '#ff7a7a');
    sfxShot(true);
    if (state.hp <= 0) die('Shot on the way out');
    else say('Hit — one more and you are done', 'bad');
  }

  // ---------- win, lose, checkpoint ----------
  function die(why) {
    state.mode = 'over';
    state.queue = [];
    state.deathWhy = why;
    sfx(110, 0.5, 0.08, 'sawtooth');
    showEnd(false);
  }

  function win() {
    state.mode = 'won';
    state.queue = [];
    const rec = loadSave();
    const prev = rec.best[state.difficulty];
    state.newBest = !prev || state.moves < prev;
    if (state.newBest) rec.best[state.difficulty] = state.moves;
    rec.wins = (rec.wins || 0) + 1;
    writeSave(rec);
    sfx(523, 0.12, 0.06, 'triangle'); sfx(659, 0.12, 0.06, 'triangle', 0.12); sfx(784, 0.3, 0.06, 'triangle', 0.24);
    showEnd(true);
  }

  const SNAP_KEYS = ['player', 'guards', 'lamps', 'cams', 'doors', 'hp', 'rounds', 'battery', 'seen', 'alarm', 'earlyAlarm',
    'phase', 'hasCard', 'cardSeenAt', 'cardHinted', 'doorOpened', 'dataDone', 'ticks', 'moves', 'pace', 'reinforceIn', 'reinforceLeft', 'nv', 'run', 'lastKnown',
    'shots', 'takedowns', 'steps'];

  function takeCheckpoint() {
    const snap = {};
    SNAP_KEYS.forEach((k) => { snap[k] = state[k]; });
    snap.vis = Array.from(state.vis);
    state.checkpoint = JSON.stringify(snap);
  }

  function restoreCheckpoint() {
    if (!state.checkpoint) return;
    const snap = JSON.parse(state.checkpoint);
    const cp = state.checkpoint;
    SNAP_KEYS.forEach((k) => { state[k] = snap[k]; });
    state.vis = Uint8Array.from(snap.vis);
    state.checkpoint = cp;
    state.dragging = null;
    state.guards.forEach((g) => { g.carried = false; });
    state.mode = 'play'; state.queue = []; state.busy = 0;
    state.hp = Math.max(1, state.hp);
    state.fx = [];
    computeLight();
    computeVision();
    computeReach();
    hideEnd();
    say('Back at the terminal — get out', 'good');
  }

  // ---------- the terminal ----------
  function startHack() {
    const k = HACK[state.difficulty];
    state.mode = 'hack';
    state.hack = { round: 0, pos: 0, dir: 1, zone: k.zone, zoneAt: 0.35, speed: k.speed, flash: 0, missed: 0 };
    el.hack.hidden = false;
    hackStatus('> KEY 1 / 3', '');
    sfx(520, 0.05, 0.05, 'square');
  }

  function updateHack(dt) {
    const h = state.hack;
    h.pos += h.dir * h.speed * dt;
    if (h.pos > 1) { h.pos = 1; h.dir = -1; }
    if (h.pos < 0) { h.pos = 0; h.dir = 1; }
    el.hackMark.style.left = (h.pos * 100) + '%';
    el.hackZone.style.left = (h.zoneAt * 100) + '%';
    el.hackZone.style.width = (h.zone * 100) + '%';
  }

  function hackPress() {
    if (!state || state.mode !== 'hack') return;
    const h = state.hack, k = HACK[state.difficulty];
    if (h.pos >= h.zoneAt && h.pos <= h.zoneAt + h.zone) {
      h.round++;
      sfx(700 + h.round * 140, 0.07, 0.06, 'square');
      if (h.round >= 3) { finishHack(); return; }
      h.zone *= k.narrow;
      h.speed *= k.quicken;
      h.zoneAt = 0.08 + Math.random() * (0.84 - h.zone);
      hackStatus('> KEY ' + (h.round + 1) + ' / 3', 'good');
    } else {
      h.missed++;
      sfx(110, 0.14, 0.06, 'sawtooth');
      hackStatus('> ACCESS DENIED — KEY ' + (h.round + 1) + ' / 3', 'bad');
      const p = state.player;
      makeNoise(p.x, p.y, p.lv, NOISE_HACK, false);
    }
  }

  function hackStatus(s, cls) {
    el.hackStatus.textContent = s;
    el.hackStatus.className = 'termline' + (cls ? ' ' + cls : '');
  }

  function finishHack() {
    state.dataDone = true;
    state.mode = 'play';
    state.hack = null;
    el.hack.hidden = true;
    raiseAlarm('Download traced');
    advance();
    takeCheckpoint();
    say('Data secured — get back to the wire', 'good');
    afterAction();
  }

  function leaveHack() {
    if (!state || state.mode !== 'hack') return;
    state.mode = 'play';
    state.hack = null;
    el.hack.hidden = true;
    afterAction();
  }

  // ---------- the action queue ----------
  /* Everything that happens in a turn is a queue of small steps with a pause
     after each, so the logic moves a tile at a time and the drawing eases after
     it. flush() runs the whole queue at once, for tests. */
  function enqueue(fn, delay, tag) { state.queue.push({ fn, delay, tag }); }

  function pump(dt) {
    if (state.busy > 0) { state.busy -= dt; return; }
    let guard = 0;
    while (state.busy <= 0 && state.queue.length && guard++ < 50) {
      const q = state.queue.shift();
      state.skipDelay = false;
      q.fn();
      if (!state.skipDelay) state.busy += q.delay;
    }
    if (!state.queue.length && state.busy < 0) state.busy = 0;
  }

  function flush() {
    let n = 0;
    while (state.queue.length && n++ < 20000) {
      const q = state.queue.shift();
      q.fn();
    }
    state.busy = 0;
    snapAll();
  }

  function snapAll() {
    const p = state.player;
    p.rx = p.x; p.ry = p.y; p.rl = p.lv;
    for (const g of state.guards) { g.rx = g.x; g.ry = g.y; g.rl = g.lv; g.ra = DIR_A[g.face]; }
    for (const c of state.cams) c.ra = c.a;
  }

  // ---------- messages and effects ----------
  let msgTimer = 0;
  function say(text, kind) {
    el.msg.textContent = text;
    el.msg.className = 'msg on' + (kind ? ' ' + kind : '');
    msgTimer = 2.8;
  }

  function fxText(x, y, lv, text, col) {
    state.fx.push({ kind: 'text', x, y, lv, text, col, t: 0, life: 1.3 });
  }

  // ---------- rendering ----------
  const canvas = document.getElementById('screen');
  const ctx = canvas.getContext('2d');
  const cam = { x: 0, y: 0, zoom: 1, free: false, set: false };
  let dpr = 1, CW = 0, CH = 0, time = 0;

  const PX = (x, y) => (x - y) * HW;
  const PY = (x, y, z) => (x + y) * HH - z;

  function fitCanvas() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    CW = Math.max(1, Math.round(r.width * dpr));
    CH = Math.max(1, Math.round(r.height * dpr));
    if (canvas.width !== CW || canvas.height !== CH) { canvas.width = CW; canvas.height = CH; }
    if (!cam.set) { cam.zoom = clamp(r.width / 1250, 0.6, 1.25); cam.set = true; }
  }

  const viewScale = () => cam.zoom * dpr;
  function worldToScreen(wx, wy) {
    const z = viewScale();
    return [(wx - cam.x) * z + CW / 2, (wy - cam.y) * z + CH / 2];
  }
  function screenToWorld(sx, sy) {
    const z = viewScale();
    return [(sx - CW / 2) / z + cam.x, (sy - CH / 2) / z + cam.y];
  }

  // colour helpers: a base colour warmed by lamplight and sunk into fog when out of sight
  function shade(c, k, mul) {
    const L = Math.min(1, state.light[k] || 0);
    const m = (mul || 1) * (0.82 + 0.3 * L);
    let r = c[0] * m, g = c[1] * m, b = c[2] * m;
    r += (255 - r) * L * 0.2; g += (226 - g) * L * 0.16; b += (170 - b) * L * 0.06;
    if (state.vis[k] !== 2) { r += (FOG[0] - r) * 0.6; g += (FOG[1] - g) * 0.6; b += (FOG[2] - b) * 0.6; }
    return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
  }
  const rgba = (c, a) => 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';

  function poly(pts, fill, stroke, lw) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
  }
  const P3 = (x, y, z) => [PX(x, y), PY(x, y, z)];

  // An axis-aligned box in tile units, z in pixels. Only the three faces the
  // camera sees: the top, the one facing +y (lower left) and the one facing +x.
  function box(x0, y0, x1, y1, z0, z1, top, left, right) {
    if (left) poly([P3(x0, y1, z0), P3(x1, y1, z0), P3(x1, y1, z1), P3(x0, y1, z1)], left);
    if (right) poly([P3(x1, y0, z0), P3(x1, y1, z0), P3(x1, y1, z1), P3(x1, y0, z1)], right);
    if (top) poly([P3(x0, y0, z1), P3(x1, y0, z1), P3(x1, y1, z1), P3(x0, y1, z1)], top);
  }
  const diamond = (x, y, z, inset) => {
    const i = inset || 0;
    return [P3(x + i, y + i, z), P3(x + 1 - i, y + i, z), P3(x + 1 - i, y + 1 - i, z), P3(x + i, y + 1 - i, z)];
  };

  // the chain-link mesh
  const meshPattern = (() => {
    const c = document.createElement('canvas'); c.width = 6; c.height = 6;
    const g = c.getContext('2d');
    g.strokeStyle = 'rgba(190,204,202,0.7)'; g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(6, 6); g.moveTo(6, 0); g.lineTo(0, 6); g.stroke();
    return ctx.createPattern(c, 'repeat');
  })();

  // a soft cloud, drawn once and scattered about for the fog the compound floats in
  const cloud = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    let s = 7;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < 26; i++) {
      const x = 60 + rnd() * 136, y = 70 + rnd() * 116, r = 30 + rnd() * 60;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(118,134,136,0.2)');
      gr.addColorStop(1, 'rgba(118,134,136,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 256, 256);
    }
    return c;
  })();
  const CLOUDS = Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2;
    return { x: 15 + Math.cos(a) * 25 + ((i * 37) % 7) - 3, y: 12 + Math.sin(a) * 22 + ((i * 53) % 5) - 2, s: 3.2 + (i % 4) * 0.9, v: 0.05 + (i % 3) * 0.03 };
  });

  const FLOORS = {
    yard: { fill: '#303c3c', line: '#3a4747' },
    tile: { fill: '#36413f', line: '#44504e' },
    dirt: { fill: '#262d2b', line: null },
    grate: { fill: '#3a4245', line: '#4b5458' },
  };

  function regionShown(r) {
    if (r.open) return true;
    const p = state.player;
    return p.lv >= r.lv && inRegion(r, p.x, p.y);
  }

  function render(dt) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const bg = ctx.createRadialGradient(CW / 2, CH / 2, 0, CW / 2, CH / 2, Math.max(CW, CH) * 0.75);
    bg.addColorStop(0, '#263032');
    bg.addColorStop(1, '#111618');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, CW, CH);
    if (!state) return;

    const z = viewScale();
    ctx.setTransform(z, 0, 0, z, CW / 2 - cam.x * z, CH / 2 - cam.y * z);
    drawClouds(0.7, false);

    // the ground floor
    drawFloors(0, null);
    drawOverlay(0, null);
    drawReach(0, null);
    drawCones(0, null);
    drawRings(0);
    const ground = gatherObjects(0, null);
    ground.forEach((it) => it.fn());

    // the floors above, each redrawing anything on the ground that stands in front of it
    for (const r of UPPER) {
      if (!regionShown(r)) continue;
      drawFloors(r.lv, r);
      drawOverlay(r.lv, r);
      drawReach(r.lv, r);
      drawCones(r.lv, r);
      drawRings(r.lv);
      gatherObjects(r.lv, r).forEach((it) => it.fn());
      const bb = regionBox(r);
      ground.forEach((it) => {
        if (!it.front || !(it.x > r.x1 || it.y > r.y1)) return;
        const sx = PX(it.x + 0.5, it.y + 0.5), sy = PY(it.x + 0.5, it.y + 0.5, 0);
        if (sx + 34 < bb[0] || sx - 34 > bb[2] || sy + 10 < bb[1] || sy - 80 > bb[3]) return;
        it.fn();
      });
    }

    drawGlows();
    drawPathPreview();
    drawInvestigations();
    drawCardGhost();
    drawTracers();
    drawClouds(0.1, true);

    // the screen: goggles, a hit, the alarm
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (state.nv) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = '#86ffae';
      ctx.fillRect(0, 0, CW, CH);
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = 'rgba(24,92,48,0.55)';
      ctx.fillRect(0, 0, CW, CH);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      for (let y = 0; y < CH; y += 4 * dpr) ctx.fillRect(0, y, CW, dpr);
    }
    const vg = ctx.createRadialGradient(CW / 2, CH / 2, Math.min(CW, CH) * 0.35, CW / 2, CH / 2, Math.max(CW, CH) * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, state.alarm ? 'rgba(120,10,14,' + (0.35 + 0.15 * Math.sin(time * 5)) + ')' : 'rgba(0,0,0,0.45)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, CW, CH);
    for (const f of state.fx) {
      if (f.kind !== 'flash') continue;
      ctx.fillStyle = 'rgba(255,40,40,' + (0.35 * (1 - f.t / f.life)) + ')';
      ctx.fillRect(0, 0, CW, CH);
    }
    drawScreenUI();
  }

  // an upper floor's outline on screen, walls and all
  function regionBox(r) {
    const zb = r.lv * STOREY;
    return [PX(r.x0, r.y1 + 1), PY(r.x0, r.y0, zb + WALL_H + 10), PX(r.x1 + 1, r.y0), PY(r.x1 + 1, r.y1 + 1, zb)];
  }

  function drawClouds(alpha, over) {
    const tt = time;
    for (const c of CLOUDS) {
      const cx = c.x + Math.sin(tt * c.v + c.s) * 1.5, cy = c.y + Math.cos(tt * c.v * 0.8 + c.s) * 1.2;
      const sx = PX(cx, cy), sy = PY(cx, cy, 0);
      const s = c.s * 110;
      ctx.globalAlpha = over ? alpha : alpha;
      ctx.drawImage(cloud, sx - s / 2, sy - s / 2, s, s * 0.7);
    }
    ctx.globalAlpha = 1;
  }

  function drawFloors(lv, r) {
    const zb = lv * STOREY;
    const groups = {};
    const sides = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const t = tile(x, y, lv);
        if (!t) continue;
        if (r && !inRegion(r, x, y)) continue;
        if (lv > 0 && t.top) continue;               // the stairwell: look down the stairs
        const k = key(x, y, lv);
        if (state.vis[k] === 0 && lv > 0) { /* still drawn; the fog covers it */ }
        (groups[t.floor] = groups[t.floor] || []).push([x, y]);
        if (lv === 0) {
          if (!tile(x + 1, y, 0)) sides.push([x, y, 'x', SLAB]);
          if (!tile(x, y + 1, 0)) sides.push([x, y, 'y', SLAB]);
        } else {
          if (x === r.x1) sides.push([x, y, 'x', STOREY - WALL_H]);
          if (y === r.y1) sides.push([x, y, 'y', STOREY - WALL_H]);
        }
      }
    }
    for (const f in groups) {
      const st = FLOORS[f];
      ctx.beginPath();
      for (const [x, y] of groups[f]) {
        const d = diamond(x, y, zb);
        ctx.moveTo(d[0][0], d[0][1]); ctx.lineTo(d[1][0], d[1][1]); ctx.lineTo(d[2][0], d[2][1]); ctx.lineTo(d[3][0], d[3][1]); ctx.closePath();
      }
      ctx.fillStyle = st.fill;
      ctx.fill();
      if (st.line) { ctx.strokeStyle = st.line; ctx.lineWidth = 1; ctx.stroke(); }
    }
    for (const [x, y, ax, depth] of sides) {
      const k = key(x, y, lv);
      if (ax === 'x') poly([P3(x + 1, y, zb), P3(x + 1, y + 1, zb), P3(x + 1, y + 1, zb - depth), P3(x + 1, y, zb - depth)], shade([30, 38, 40], k, 0.9));
      else poly([P3(x, y + 1, zb), P3(x + 1, y + 1, zb), P3(x + 1, y + 1, zb - depth), P3(x, y + 1, zb - depth)], shade([38, 47, 49], k, 0.9));
    }
  }

  // fog of war and lamplight, each a tile-sized image stretched over the floor
  function drawOverlay(lv, r) {
    ctx.save();
    const zb = lv * STOREY;
    if (r) {
      poly([P3(r.x0, r.y0, zb), P3(r.x1 + 1, r.y0, zb), P3(r.x1 + 1, r.y1 + 1, zb), P3(r.x0, r.y1 + 1, zb)], null);
      ctx.clip();
    }
    ctx.imageSmoothingEnabled = true;
    ctx.save();
    ctx.transform(HW, HH, -HW, HH, 0, -zb);
    ctx.drawImage(fogCanvas[lv], 0, 0);
    ctx.restore();
    ctx.save();
    ctx.transform(HW / LM_RES, HH / LM_RES, -HW / LM_RES, HH / LM_RES, 0, -zb);
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.72;
    ctx.drawImage(lmCanvas[lv], 0, 0);
    ctx.restore();
    ctx.restore();
  }

  function planeOK(lv, r, x, y) {
    if (lv === 0) return !r;
    return r && inRegion(r, x, y);
  }

  let hover = { obj: null, tile: -1 };

  function drawReach(lv, r) {
    if (!canAct() || !state.reach) return;
    const D = state.reach.dist, zb = lv * STOREY, R = ringSize();
    const blue = state.run ? [214, 170, 96] : [110, 162, 214];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (!planeOK(lv, r, x, y) || !idle()) continue;
        const k = key(x, y, lv);
        if (D[k] <= 0 || D[k] > R) continue;
        if (lv > 0 && ch(x, y, lv) === 's') continue;
        const c = state.danger[k] ? [214, 86, 80] : blue;
        poly(diamond(x, y, zb, 0.04), rgba(c, 0.26), rgba(c, 0.42), 1);
      }
    }
    // your own tile: white brackets at its corners, as the mockup marks a unit
    const p = state.player;
    if (p.lv === lv && planeOK(lv, r, p.x, p.y)) brackets(p.x, p.y, zb, 'rgba(240,244,244,0.9)');
  }

  function brackets(x, y, zb, col) {
    const d = diamond(x, y, zb, 0.06);
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = d[i], b = d[(i + 1) % 4], c = d[(i + 3) % 4];
      ctx.moveTo(a[0] + (b[0] - a[0]) * 0.28, a[1] + (b[1] - a[1]) * 0.28);
      ctx.lineTo(a[0], a[1]);
      ctx.lineTo(a[0] + (c[0] - a[0]) * 0.28, a[1] + (c[1] - a[1]) * 0.28);
    }
    ctx.stroke();
  }

  // rays marched out from a point until they meet something that stops sight
  function coneShape(ox, oy, a, half, range, lv, high, inner) {
    const outer = [], near = [];
    const n = 24;
    for (let i = 0; i <= n; i++) {
      const ang = a - half + (2 * half * i) / n;
      const cx = Math.cos(ang), cy = Math.sin(ang);
      let t = 0.35;
      for (; t < range; t += 0.1) {
        const px = ox + cx * t, py = oy + cy * t;
        const tx = Math.floor(px), ty = Math.floor(py);
        if (!tile(tx, ty, lv)) break;
        if (high && Math.hypot(tx + 0.5 - ox, ty + 0.5 - oy) < 2.2) continue;
        if (tx === Math.floor(ox) && ty === Math.floor(oy)) continue;
        if (opaque(tx, ty, lv, high)) break;
      }
      outer.push([ox + cx * t, oy + cy * t]);
      const ti = Math.min(t, inner);
      near.push([ox + cx * ti, oy + cy * ti]);
    }
    return { outer, near };
  }

  function drawCone(ox, oy, zb, shape, col, aOuter, aInner) {
    const o = P3(ox, oy, zb);
    const outer = [o].concat(shape.outer.map(([x, y]) => P3(x, y, zb)));
    const grad = ctx.createRadialGradient(o[0], o[1], 4, o[0], o[1], 260);
    grad.addColorStop(0, rgba(col, aOuter * 1.4));
    grad.addColorStop(1, rgba(col, aOuter * 0.6));
    poly(outer, grad);
    if (aInner) poly([o].concat(shape.near.map(([x, y]) => P3(x, y, zb))), rgba(col, aInner));
    ctx.strokeStyle = rgba(col, aOuter * 1.8);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(o[0], o[1]); ctx.lineTo(outer[1][0], outer[1][1]);
    ctx.moveTo(o[0], o[1]); ctx.lineTo(outer[outer.length - 1][0], outer[outer.length - 1][1]);
    ctx.stroke();
  }

  function drawCones(lv, r) {
    const zb = lv * STOREY;
    for (const g of state.guards) {
      if (g.down || g.carried || conePlane(g) !== lv) continue;
      if (!planeOK(lv, r, g.x, g.y) && !(flood(g) && !r)) continue;
      const seen = state.vis[key(g.x, g.y, g.lv)] === 2;
      const hunting = g.mode === 'hunt';
      const col = hunting ? [236, 96, 84] : flood(g) ? [240, 226, 170] : [236, 200, 116];
      const ox = g.rx + 0.5, oy = g.ry + 0.5;
      const shape = coneShape(ox, oy, g.ra, CONE_HALF, coneRangeOf(g), lv, flood(g), flood(g) ? 99 : hunting ? HUNT_REACH : TORCH_REACH);
      const k = seen ? 1 : 0.55;
      drawCone(ox, oy, zb, shape, col, (flood(g) ? 0.2 : 0.13) * k, flood(g) ? 0 : 0.2 * k);
    }
    for (const c of state.cams) {
      if (!c.alive || c.lv !== lv || !planeOK(lv, r, c.x, c.y)) continue;
      const shape = coneShape(c.x + 0.5, c.y + 0.5, c.ra, c.half || CAM_HALF, CAM_RANGE, lv, false, 1.5);
      drawCone(c.x + 0.5, c.y + 0.5, zb, shape, [150, 214, 240], 0.1, 0.1);
    }
  }

  function drawRings(lv) {
    for (const f of state.fx) {
      if (f.kind !== 'ring' || f.lv !== lv) continue;
      const k = f.t / f.life;
      const c = P3(f.x + 0.5, f.y + 0.5, lv * STOREY);
      ctx.strokeStyle = 'rgba(236,210,150,' + (0.6 * (1 - k)) + ')';
      ctx.lineWidth = 2;
      for (let i = 0; i < 2; i++) {
        const rr = f.r * (k * 0.9 + i * 0.12) * HW * 1.414;
        if (rr <= 0) continue;
        ctx.beginPath();
        ctx.ellipse(c[0], c[1], rr, rr / 2, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  /* The things standing on a floor, sorted back to front. Each item carries its
     tile so the pass over an upper floor can redraw what stands in front of it. */
  function gatherObjects(lv, r) {
    const items = [];
    const push = (x, y, d, fn, front) => items.push({ x, y, d, fn, front });
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (r && !inRegion(r, x, y)) continue;
        if (lv > 0 && !r) continue;
        const t = tile(x, y, lv);
        if (!t) continue;
        const k = key(x, y, lv);
        if (state.vis[k] === 0) continue;
        if (t.wall || t.fence || t.rail || t.crate || t.terminal || (t.stairs && !t.top)) {
          push(x, y, x + y + 0.5, () => drawTileObject(x, y, lv, t, k), !!(t.fence || t.crate));
        }
      }
    }
    for (const l of state.lamps) {
      if (l.lv !== lv) continue;
      const mx = l.kind === 'wall' ? l.mx : l.x, my = l.kind === 'wall' ? l.my : l.y;
      if (r ? !inRegion(r, mx, my) : lv > 0) continue;
      if (state.vis[key(l.x, l.y, lv)] === 0 && state.vis[key(mx, my, lv)] === 0) continue;
      const d = l.kind === 'wall' ? mx + my + 0.62 : l.kind === 'ceil' ? l.x + l.y + 1.2 : l.x + l.y + 0.5;
      push(mx, my, d, () => drawLamp(l), l.kind === 'post');
    }
    if (lv === 0 && !r) {
      for (const l of LADDERS) {
        const [fx, fy] = l.foot;
        if (state.vis[key(fx, fy, 0)] === 0 && state.vis[key(l.top[0], l.top[1], l.top[2])] === 0) continue;
        push(fx, fy, l.top[0] + l.top[1] + 0.9, () => drawLadder(l), true);
      }
    }
    for (const c of state.cams) {
      if (c.lv !== lv || (r ? !inRegion(r, c.mx, c.my) : lv > 0)) continue;
      if (state.vis[key(c.x, c.y, lv)] === 0) continue;
      push(c.mx, c.my, c.mx + c.my + 0.65, () => drawCamera(c), false);
    }
    for (const g of state.guards) {
      if (g.lv !== lv || g.carried) continue;
      if (r ? !inRegion(r, g.x, g.y) : lv > 0) continue;
      const v = state.vis[key(g.x, g.y, lv)];
      if (g.down) { if (v >= 1) push(g.x, g.y, g.rx + g.ry + 0.3, () => drawBody(g), true); continue; }
      if (v !== 2) continue;
      push(g.x, g.y, g.rx + g.ry + 0.51, () => drawGuard(g), true);
    }
    const p = state.player;
    if (p.lv === lv && (r ? inRegion(r, p.x, p.y) : lv === 0 || !regionOf(p.x, p.y, lv))) {
      push(p.x, p.y, p.rx + p.ry + 0.52, drawPlayer, true);
    }
    items.sort((a, b) => a.d - b.d);
    return items;
  }

  function drawTileObject(x, y, lv, t, k) {
    if (t.wall) drawWall(x, y, lv, t, k);
    else if (t.fence) drawFence(x, y, lv, t, k);
    else if (t.rail) drawRail(x, y, lv, k);
    else if (t.crate) drawCrate(x, y, lv, k);
    else if (t.terminal) drawTerminal(x, y, lv, k);
    else if (t.stairs) drawStairs(x, y, lv, k);
  }

  const WALL_TOP = [128, 142, 138], WALL_L = [80, 93, 91], WALL_R = [62, 73, 72];

  function wallHeight(x, y, lv) {
    const p = state.player;
    if (lv !== p.lv) return WALL_H;
    const dd = (x + y) - (p.rx + p.ry), lat = Math.abs((x - y) - (p.rx - p.ry));
    return dd > 0.2 && dd < 6.5 && lat < 4.5 ? WALL_CUT : WALL_H;
  }

  function drawWall(x, y, lv, t, k) {
    const zb = lv * STOREY;
    const isWall = (xx, yy) => { const tt = tile(xx, yy, lv); return !!(tt && tt.wall); };
    const n = isWall(x, y - 1), s = isWall(x, y + 1), w = isWall(x - 1, y), e = isWall(x + 1, y);
    const h = wallHeight(x, y, lv);
    const top = shade(WALL_TOP, k), left = shade(WALL_L, k), right = shade(WALL_R, k);
    const c0 = 0.5 - WT, c1 = 0.5 + WT;

    if (t.door) {
      const open = doorOpen(x, y, lv) || guardAt(x, y, lv) || (state.player.x === x && state.player.y === y && state.player.lv === lv);
      const ns = n || s;
      const bx0 = ns ? x + c0 : x, by0 = ns ? y : y + c0, bx1 = ns ? x + c1 : x + 1, by1 = ns ? y + 1 : y + c1;
      if (open) {
        const ht = Math.min(h, WALL_H);
        if (ht >= WALL_H) box(bx0, by0, bx1, by1, zb + 34, zb + ht, top, left, right);
        const col = shade([70, 80, 84], k);
        if (ns) { box(x + c0, y, x + c1, y + 0.08, zb, zb + Math.min(34, ht), top, col, col); box(x + c0, y + 0.92, x + c1, y + 1, zb, zb + Math.min(34, ht), top, col, col); }
        else { box(x, y + c0, x + 0.08, y + c1, zb, zb + Math.min(34, ht), top, col, col); box(x + 0.92, y + c0, x + 1, y + c1, zb, zb + Math.min(34, ht), top, col, col); }
      } else {
        box(bx0, by0, bx1, by1, zb, zb + h, top, shade([70, 76, 82], k), shade([56, 62, 68], k));
        // the card reader: red until the card opens it
        const lx = ns ? x + c1 + 0.01 : x + 0.78, ly = ns ? y + 0.78 : y + c1 + 0.01;
        const pnt = P3(lx, ly, zb + Math.min(h - 4, 26));
        ctx.fillStyle = state.hasCard ? '#6ef096' : '#ff4d4d';
        ctx.fillRect(pnt[0] - 2, pnt[1] - 2, 4, 4);
      }
      return;
    }

    const parts = [];
    if (n) parts.push([x + c0, y, x + c1, y + c0]);
    if (w) parts.push([x, y + c0, x + c0, y + c1]);
    parts.push([x + c0, y + c0, x + c1, y + c1]);
    if (e) parts.push([x + c1, y + c0, x + 1, y + c1]);
    if (s) parts.push([x + c0, y + c1, x + c1, y + 1]);
    for (const [a0, b0, a1, b1] of parts) {
      if (t.window && h > 30) {
        box(a0, b0, a1, b1, zb, zb + 14, top, left, right);
        const glass = 'rgba(110,160,178,' + (state.vis[k] === 2 ? 0.35 : 0.15) + ')';
        box(a0, b0, a1, b1, zb + 14, zb + 32, null, glass, glass);
        box(a0, b0, a1, b1, zb + 32, zb + h, top, left, right);
      } else {
        box(a0, b0, a1, b1, zb, zb + h, top, left, right);
      }
    }
  }

  function drawFence(x, y, lv, t, k) {
    const zb = lv * STOREY;
    const conn = (xx, yy) => { const tt = tile(xx, yy, lv); return !!(tt && tt.fence); };
    const cx = x + 0.5, cy = y + 0.5;
    const arms = [];
    if (conn(x, y - 1)) arms.push([cx, y, cx, cy]);
    if (conn(x - 1, y)) arms.push([x, cy, cx, cy]);
    if (conn(x + 1, y)) arms.push([cx, cy, x + 1, cy]);
    if (conn(x, y + 1)) arms.push([cx, cy, cx, y + 1]);
    const a = state.vis[k] === 2 ? 1 : 0.5;
    ctx.globalAlpha = a;
    const z0 = t.cut ? FENCE_H * 0.58 : 0;
    for (const [ax, ay, bx, by] of arms) {
      const pts = [P3(ax, ay, zb + z0), P3(bx, by, zb + z0), P3(bx, by, zb + FENCE_H), P3(ax, ay, zb + FENCE_H)];
      poly(pts, 'rgba(120,138,138,0.1)');
      ctx.fillStyle = meshPattern;
      ctx.fill();
      ctx.strokeStyle = t.gate ? '#8a9795' : '#6e7c7a';
      ctx.lineWidth = t.gate ? 2 : 1.4;
      ctx.beginPath();
      ctx.moveTo(pts[3][0], pts[3][1]); ctx.lineTo(pts[2][0], pts[2][1]);
      if (!t.cut) { ctx.moveTo(pts[0][0], pts[0][1]); ctx.lineTo(pts[1][0], pts[1][1]); }
      if (t.gate) { ctx.moveTo(pts[0][0], pts[0][1]); ctx.lineTo(pts[2][0], pts[2][1]); }
      ctx.stroke();
      // wire along the top
      ctx.strokeStyle = 'rgba(160,172,170,0.7)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i <= 6; i++) {
        const u = i / 6, px = ax + (bx - ax) * u, py = ay + (by - ay) * u;
        const q = P3(px, py, zb + FENCE_H + 4 + (i % 2 ? 3 : 0));
        if (i === 0) ctx.moveTo(q[0], q[1]); else ctx.lineTo(q[0], q[1]);
      }
      ctx.stroke();
    }
    if (t.cut) {
      // the flap of wire, peeled back
      const f = [P3(cx - 0.3, cy + 0.1, zb + z0), P3(cx + 0.3, cy + 0.1, zb + z0), P3(cx + 0.18, cy + 0.42, zb + 2), P3(cx - 0.2, cy + 0.4, zb + 2)];
      poly(f, 'rgba(120,138,138,0.12)');
      ctx.fillStyle = meshPattern; ctx.fill();
    }
    const post = shade([96, 106, 106], k), postD = shade([70, 78, 78], k);
    box(cx - 0.04, cy - 0.04, cx + 0.04, cy + 0.04, zb, zb + FENCE_H + 6, post, post, postD);
    if (t.gate) {
      const q = P3(cx, cy, zb + FENCE_H + 10);
      ctx.fillStyle = state.alarm && Math.sin(time * 8) > 0 ? '#ff4040' : '#7a2020';
      ctx.beginPath(); ctx.arc(q[0], q[1], 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawRail(x, y, lv, k) {
    const zb = lv * STOREY;
    const conn = (xx, yy) => { const tt = tile(xx, yy, lv); return !!(tt && tt.rail); };
    const cx = x + 0.5, cy = y + 0.5;
    const col = shade([130, 138, 136], k), dk = shade([90, 96, 96], k);
    // the platform's deck runs under the railing
    const arms = [];
    if (conn(x, y - 1)) arms.push([cx, y, cx, cy]);
    if (conn(x - 1, y)) arms.push([x, cy, cx, cy]);
    if (conn(x + 1, y)) arms.push([cx, cy, x + 1, cy]);
    if (conn(x, y + 1)) arms.push([cx, cy, cx, y + 1]);
    ctx.strokeStyle = col; ctx.lineWidth = 2;
    ctx.beginPath();
    for (const [ax, ay, bx, by] of arms) {
      const a = P3(ax, ay, zb + RAIL_H), b = P3(bx, by, zb + RAIL_H);
      ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
      const c = P3(ax, ay, zb + RAIL_H / 2), d = P3(bx, by, zb + RAIL_H / 2);
      ctx.moveTo(c[0], c[1]); ctx.lineTo(d[0], d[1]);
    }
    ctx.stroke();
    box(cx - 0.035, cy - 0.035, cx + 0.035, cy + 0.035, zb, zb + RAIL_H + 2, col, col, dk);
  }

  function drawCrate(x, y, lv, k) {
    const zb = lv * STOREY;
    const x0 = x + 0.17, y0 = y + 0.17, x1 = x + 0.83, y1 = y + 0.83, z1 = zb + CRATE_H;
    box(x0, y0, x1, y1, zb, z1, shade([116, 108, 92], k), shade([88, 81, 68], k), shade([72, 66, 56], k));
    ctx.strokeStyle = shade([52, 47, 40], k);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    // an X brace on each face we see, and a board line across the lid
    let a = P3(x0, y1, zb), b = P3(x1, y1, z1), c = P3(x1, y1, zb), d = P3(x0, y1, z1);
    ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.moveTo(c[0], c[1]); ctx.lineTo(d[0], d[1]);
    a = P3(x1, y0, zb); b = P3(x1, y1, z1); c = P3(x1, y1, zb); d = P3(x1, y0, z1);
    ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.moveTo(c[0], c[1]); ctx.lineTo(d[0], d[1]);
    a = P3(x0, (y0 + y1) / 2, z1); b = P3(x1, (y0 + y1) / 2, z1);
    ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
    ctx.stroke();
    poly([P3(x0, y0, z1), P3(x1, y0, z1), P3(x1, y1, z1), P3(x0, y1, z1)], null, shade([60, 55, 46], k), 1);
  }

  function drawTerminal(x, y, lv, k) {
    const zb = lv * STOREY;
    box(x + 0.1, y + 0.2, x + 0.9, y + 0.8, zb, zb + 14, shade([96, 104, 106], k), shade([68, 74, 76], k), shade([56, 62, 64], k));
    box(x + 0.28, y + 0.36, x + 0.72, y + 0.46, zb + 14, zb + 33, shade([54, 60, 64], k), shade([40, 46, 50], k), shade([34, 38, 42], k));
    const on = state.dataDone ? [110, 240, 150] : [127, 232, 255];
    const pulse = 0.75 + 0.25 * Math.sin(time * 3);
    poly([P3(x + 0.31, y + 0.461, zb + 17), P3(x + 0.69, y + 0.461, zb + 17), P3(x + 0.69, y + 0.461, zb + 31), P3(x + 0.31, y + 0.461, zb + 31)], rgba(on, 0.85 * pulse));
    box(x + 0.3, y + 0.55, x + 0.7, y + 0.68, zb + 14, zb + 16, shade([70, 76, 80], k), null, null);
  }

  function drawStairs(x, y, lv, k) {
    const zb = lv * STOREY;
    for (let i = 5; i >= 0; i--) {
      const x0 = x + 1 - (i + 1) / 6, x1 = x + 1 - i / 6;
      box(x0, y + 0.1, x1, y + 0.9, zb, zb + ((i + 1) * STOREY) / 6, shade([112, 124, 120], k), shade([74, 84, 82], k), shade([62, 72, 70], k));
    }
  }

  // two rails and rungs up the face between the top tile and the foot, hooks over the edge
  function drawLadder(l) {
    const [tx, ty, tl] = l.top, [fx, fy] = l.foot;
    const k = key(fx, fy, 0);
    const alongX = fx !== tx;                     // the ladder stands on the face between them
    const face = alongX ? Math.max(tx, fx) : Math.max(ty, fy);
    const c = (alongX ? ty : tx) + 0.5;
    const topZ = tl * STOREY + 10;
    const pt = (u, z) => (alongX ? P3(face + 0.02, c + u, z) : P3(c + u, face + 0.02, z));
    const rail = shade([150, 128, 92], k), rung = shade([122, 104, 76], k);
    ctx.lineCap = 'round';
    ctx.strokeStyle = rail; ctx.lineWidth = 2.2;
    ctx.beginPath();
    for (const u of [-0.17, 0.17]) { const a = pt(u, 0), b = pt(u, topZ); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
    ctx.stroke();
    ctx.strokeStyle = rung; ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let z = 6; z < topZ - 2; z += 8) { const a = pt(-0.17, z), b = pt(0.17, z); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
    ctx.stroke();
    ctx.lineCap = 'butt';
  }

  function bulbPoint(l) {
    const zb = l.lv * STOREY;
    if (l.kind === 'post') return P3(l.x + 0.5 + l.ax * 0.32, l.y + 0.5 + l.ay * 0.32, zb + POST_H - 4);
    if (l.kind === 'wall') { const [px, py] = lampPoint(l); const mx = l.mx + 0.5 + (l.x - l.mx) * (WT + 0.1), my = l.my + 0.5 + (l.y - l.my) * (WT + 0.1); return P3(mx, my, zb + 36); }
    return P3(l.x + 0.5, l.y + 0.5, zb + WALL_H + 3);
  }

  function drawLamp(l) {
    const zb = l.lv * STOREY;
    const k = key(l.x, l.y, l.lv);
    const metal = shade([64, 70, 70], k), metalD = shade([48, 53, 53], k);
    const b = bulbPoint(l);
    if (l.kind === 'post') {
      const cx = l.x + 0.5, cy = l.y + 0.5;
      box(cx - 0.05, cy - 0.05, cx + 0.05, cy + 0.05, zb, zb + POST_H, metal, metal, metalD);
      const top = P3(cx, cy, zb + POST_H);
      ctx.strokeStyle = metal; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(top[0], top[1]); ctx.lineTo(b[0], b[1] - 3); ctx.stroke();
      ctx.fillStyle = metalD;
      ctx.beginPath(); ctx.ellipse(b[0], b[1] - 2, 7, 3.5, 0, 0, Math.PI * 2); ctx.fill();
    } else if (l.kind === 'wall') {
      ctx.fillStyle = metalD;
      ctx.fillRect(b[0] - 5, b[1] - 5, 10, 5);
    } else {
      const a = P3(l.x + 0.3, l.y + 0.5, zb + WALL_H + 3), c = P3(l.x + 0.7, l.y + 0.5, zb + WALL_H + 3);
      ctx.strokeStyle = l.alive ? '#e8f4ef' : '#4a5352'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(c[0], c[1]); ctx.stroke();
      return;
    }
    ctx.fillStyle = l.alive ? '#fff1c8' : '#3a3f3e';
    ctx.beginPath(); ctx.ellipse(b[0], b[1], 4, 2, 0, 0, Math.PI * 2); ctx.fill();
  }

  function drawGlows() {
    ctx.globalCompositeOperation = 'lighter';
    for (const l of state.lamps) {
      if (!l.alive) continue;
      const mx = l.kind === 'wall' ? l.mx : l.x, my = l.kind === 'wall' ? l.my : l.y;
      if (l.lv > 0) { const r = regionOf(mx, my, l.lv); if (!r || !regionShown(r)) continue; }
      else if (regionShown(BUILDING) && inRegion(BUILDING, mx, my)) continue;
      const b = bulbPoint(l);
      const warm = l.kind === 'ceil' ? '200,236,230' : '255,214,140';
      const rr = l.kind === 'ceil' ? 22 : 30;
      const g = ctx.createRadialGradient(b[0], b[1], 0, b[0], b[1], rr);
      g.addColorStop(0, 'rgba(' + warm + ',0.55)');
      g.addColorStop(1, 'rgba(' + warm + ',0)');
      ctx.fillStyle = g;
      ctx.fillRect(b[0] - rr, b[1] - rr, rr * 2, rr * 2);
    }
    for (const g of state.guards) {
      if (g.down || g.carried) continue;
      if (g.lv > 0) { const r = regionOf(g.x, g.y, g.lv); if (!r || !regionShown(r)) continue; }
      else if (regionShown(BUILDING) && inRegion(BUILDING, g.x, g.y)) continue;
      const t = torchPoint(g);
      const gr = ctx.createRadialGradient(t[0], t[1], 0, t[0], t[1], 12);
      gr.addColorStop(0, 'rgba(255,236,180,0.8)');
      gr.addColorStop(1, 'rgba(255,236,180,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(t[0] - 12, t[1] - 12, 24, 24);
    }
    if (state.dataDone && state.mode === 'play') {
      // the way out, green through the dark
      const v = P3(7.5, 21.5, 0);
      const rr = 46 + Math.sin(time * 3) * 8;
      const gr = ctx.createRadialGradient(v[0], v[1] - 10, 0, v[0], v[1] - 10, rr);
      gr.addColorStop(0, 'rgba(110,240,150,0.7)');
      gr.addColorStop(1, 'rgba(110,240,150,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(v[0] - rr, v[1] - 10 - rr, rr * 2, rr * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawCamera(c) {
    const zb = c.lv * STOREY, k = key(c.x, c.y, c.lv);
    const bx = c.mx + 0.5 + (c.x - c.mx) * (WT + 0.08), by = c.my + 0.5 + (c.y - c.my) * (WT + 0.08);
    const base = P3(bx, by, zb + 38);
    const tipX = bx + Math.cos(c.ra) * 0.3, tipY = by + Math.sin(c.ra) * 0.3;
    const tip = P3(tipX, tipY, zb + (c.alive ? 36 : 30));
    ctx.strokeStyle = shade([96, 102, 106], k); ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(base[0], base[1]); ctx.lineTo(tip[0], tip[1]); ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.fillStyle = shade([40, 44, 48], k);
    ctx.beginPath(); ctx.arc(tip[0], tip[1], 3, 0, Math.PI * 2); ctx.fill();
    if (c.alive && Math.sin(time * 4 + c.x) > -0.3) {
      ctx.fillStyle = '#ff4646';
      ctx.beginPath(); ctx.arc(base[0], base[1] - 3, 1.8, 0, Math.PI * 2); ctx.fill();
    }
  }

  // ---------- people ----------
  function screenFacing(ang) {
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const sx = (dx - dy) * HW, sy = (dx + dy) * HH;
    const m = Math.hypot(sx, sy) || 1;
    return [sx / m, sy / m];
  }

  function torchPoint(g) {
    const zb = g.rl * STOREY;
    const [fx, fy] = screenFacing(g.ra);
    const f = P3(g.rx + 0.5, g.ry + 0.5, zb);
    return [f[0] + fx * 10, f[1] - 17 + fy * 4];
  }

  function drawPerson(fx0, fy0, ang, look, walk) {
    const [fx, fy] = screenFacing(ang);
    const toward = fy > -0.15;               // turned more to us than away
    const bob = Math.abs(Math.sin(walk * Math.PI)) * 1.5;
    const sw = Math.sin(walk * Math.PI) * 2.2;
    const x = fx0, y = fy0 - bob;
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(fx0, fy0, 11, 5, 0, 0, Math.PI * 2); ctx.fill();
    // legs
    ctx.fillStyle = look.legs;
    ctx.fillRect(x - 5, y - 12 + sw * 0.3, 4, 11 - sw * 0.3);
    ctx.fillRect(x + 1, y - 12 - sw * 0.3, 4, 11 + sw * 0.3);
    ctx.fillStyle = look.boots;
    ctx.fillRect(x - 5.5, y - 2 + Math.max(0, sw) * 0.3, 5, 2.5);
    ctx.fillRect(x + 0.5, y - 2 - Math.min(0, sw) * 0.3, 5, 2.5);
    // arms behind the body when facing away
    const armL = () => { ctx.fillStyle = look.body; ctx.fillRect(x - 10, y - 23, 3.5, 11); };
    const armR = () => { ctx.fillStyle = look.body; ctx.fillRect(x + 6.5, y - 23, 3.5, 11); };
    if (!toward) { armL(); armR(); }
    // body
    ctx.fillStyle = look.body;
    roundRect(x - 7, y - 25, 14, 15, 4); ctx.fill();
    ctx.fillStyle = look.vest;
    roundRect(x - 5.5, y - 23.5, 11, 9, 3); ctx.fill();
    ctx.fillStyle = look.belt;
    ctx.fillRect(x - 7, y - 13.5, 14, 2);
    if (look.pack && !toward) { ctx.fillStyle = look.pack; roundRect(x - 5, y - 24, 10, 10, 2.5); ctx.fill(); }
    if (toward) { armL(); armR(); }
    // what is in the hand, pointing where he faces
    ctx.strokeStyle = look.gear; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(x + fx * 4, y - 17); ctx.lineTo(x + fx * 11, y - 17 + fy * 4); ctx.stroke();
    // head
    const hx = x + fx * 1.2, hy = y - 30;
    ctx.fillStyle = toward ? look.skin : look.hat;
    ctx.beginPath(); ctx.arc(hx, hy, 5.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = look.hat;
    ctx.beginPath(); ctx.arc(hx, hy - 1, 5.9, Math.PI, 0); ctx.fill();
    if (look.brim) {
      ctx.fillRect(hx - 6 + fx * 2, hy - 2, 12, 2);
    }
    if (toward) {
      if (look.goggles) {
        const on = look.goggles === 'on';
        ctx.fillStyle = on ? '#9dffbe' : '#2f7a4a';
        for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.arc(hx + fx * 2.5 + i * 2.6, hy - 2.5, 1.3, 0, Math.PI * 2); ctx.fill(); }
        if (on) {
          ctx.globalCompositeOperation = 'lighter';
          const g = ctx.createRadialGradient(hx + fx * 2.5, hy - 2.5, 0, hx + fx * 2.5, hy - 2.5, 9);
          g.addColorStop(0, 'rgba(120,255,160,0.55)'); g.addColorStop(1, 'rgba(120,255,160,0)');
          ctx.fillStyle = g; ctx.fillRect(hx - 12, hy - 14, 24, 24);
          ctx.globalCompositeOperation = 'source-over';
        }
      } else {
        ctx.fillStyle = '#1d2224';
        ctx.fillRect(hx + fx * 2.4 - 2.6, hy - 0.5, 1.6, 1.6);
        ctx.fillRect(hx + fx * 2.4 + 1, hy - 0.5, 1.6, 1.6);
      }
    }
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  const SPY = { legs: '#1f2d25', boots: '#141a17', body: '#2c4538', vest: '#3a5a48', belt: '#18201c', pack: '#22352b', gear: '#101414', skin: '#c9a080', hat: '#1e2c25', goggles: 'off' };
  const GUARD = { legs: '#3a4448', boots: '#1c2124', body: '#5c6b70', vest: '#46545a', belt: '#262d30', gear: '#20262a', skin: '#c49474', hat: '#2e373b', brim: true };

  function drawPlayer() {
    const p = state.player;
    const f = P3(p.rx + 0.5, p.ry + 0.5, p.rl * STOREY);
    if (state.dragging) {
      const g = state.dragging;
      const [fx, fy] = screenFacing(DIR_A[p.face]);
      drawLying(f[0] - fx * 12, f[1] - fy * 6, DIR_A[p.face], g);
    }
    SPY.goggles = state.nv ? 'on' : 'off';
    drawPerson(f[0], f[1], DIR_A[p.face], SPY, p.walk);
  }

  function drawGuard(g) {
    const f = P3(g.rx + 0.5, g.ry + 0.5, g.rl * STOREY);
    drawPerson(f[0], f[1], g.ra, GUARD, g.walk);
    // the facing caret over his head
    const [fx, fy] = screenFacing(g.ra);
    const cx = f[0], cy = f[1] - 48;
    ctx.fillStyle = 'rgba(16,22,24,0.75)';
    ctx.beginPath(); ctx.arc(cx, cy, 7.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = g.mode === 'hunt' ? '#ff8a80' : '#f2f6f5';
    ctx.lineWidth = 2;
    const px = -fy, py = fx;
    ctx.beginPath();
    ctx.moveTo(cx - fx * 1.5 + px * 4, cy - fy * 1.5 + py * 4);
    ctx.lineTo(cx + fx * 3.5, cy + fy * 3.5);
    ctx.lineTo(cx - fx * 1.5 - px * 4, cy - fy * 1.5 - py * 4);
    ctx.stroke();
    // the keycard he carries: a cyan card beside his caret and a glint at his belt
    if (g.card) {
      const pulse = 0.7 + 0.3 * Math.sin(time * 4);
      ctx.fillStyle = 'rgba(16,22,24,0.8)';
      ctx.fillRect(cx + 9, cy - 6, 14, 11);
      ctx.fillStyle = 'rgba(143,240,255,' + pulse + ')';
      ctx.fillRect(cx + 10.5, cy - 4.5, 11, 8);
      ctx.fillStyle = '#0e2a30';
      ctx.fillRect(cx + 12, cy - 3, 4, 2.5);
      ctx.fillStyle = 'rgba(143,240,255,' + pulse + ')';
      ctx.fillRect(f[0] + 3, f[1] - 14, 4, 3);
    }
  }

  function drawLying(x, y, ang, g) {
    const [fx, fy] = screenFacing(ang + Math.PI / 2);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(x, y, 14, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = GUARD.body; ctx.lineWidth = 8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - fx * 9, y - fy * 5 - 3); ctx.lineTo(x + fx * 5, y + fy * 3 - 3); ctx.stroke();
    ctx.strokeStyle = GUARD.legs; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(x + fx * 5, y + fy * 3 - 3); ctx.lineTo(x + fx * 13, y + fy * 7 - 2); ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.fillStyle = GUARD.hat;
    ctx.beginPath(); ctx.arc(x - fx * 13, y - fy * 7 - 3, 4.5, 0, Math.PI * 2); ctx.fill();
    if (g.card) {
      ctx.fillStyle = '#8ff0ff';
      ctx.fillRect(x + 4, y - 9, 6, 4);
    }
  }

  function drawBody(g) {
    const f = P3(g.rx + 0.5, g.ry + 0.5, g.rl * STOREY);
    ctx.globalAlpha = state.vis[key(g.x, g.y, g.lv)] === 2 ? 1 : 0.5;
    if (g.dead) {
      ctx.fillStyle = 'rgba(96,14,18,0.75)';
      ctx.beginPath(); ctx.ellipse(f[0] + 3, f[1] + 1, 15, 7, 0, 0, Math.PI * 2); ctx.fill();
    }
    drawLying(f[0], f[1], DIR_A[g.face], g);
    if (!g.dead) {
      ctx.fillStyle = 'rgba(220,230,228,' + (0.55 + 0.25 * Math.sin(time * 2 + g.id)) + ')';
      ctx.font = 'bold 10px "Share Tech Mono", monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('z', f[0] + 8, f[1] - 16 - 2 * Math.sin(time * 2));
      ctx.fillText('z', f[0] + 13, f[1] - 23 - 2 * Math.sin(time * 2 + 1));
    }
    ctx.globalAlpha = 1;
  }

  // ---------- previews, tracers and labels ----------
  function drawPathPreview() {
    if (!canAct() || hover.obj || hover.tile < 0) return;
    const k = resolveTarget(hover.tile);
    if (!state.reach || state.reach.dist[k] <= 0) return;
    const e = P3(kx(k) + 0.5, ky(k) + 0.5, kl(k) * STOREY);
    ctx.strokeStyle = state.danger[k] ? '#ff9a90' : '#f2f6f8';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(e[0], e[1], 11, 5.5, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath(); ctx.ellipse(e[0], e[1], 3.5, 1.8, 0, 0, Math.PI * 2); ctx.fill();
  }

  // a faded card where the carrier was last seen, once he has gone back into the dark
  function drawCardGhost() {
    const at = state.cardSeenAt;
    if (!at || state.hasCard) return;
    const g = state.guards.find((q) => q.card);
    if (g && state.vis[key(g.x, g.y, g.lv)] === 2) return;
    const c = P3(at[0] + 0.5, at[1] + 0.5, at[2] * STOREY);
    ctx.globalAlpha = 0.55 + 0.2 * Math.sin(time * 3);
    ctx.fillStyle = 'rgba(16,22,24,0.8)';
    ctx.fillRect(c[0] - 8, c[1] - 16, 16, 12);
    ctx.fillStyle = '#8ff0ff';
    ctx.fillRect(c[0] - 6.5, c[1] - 14.5, 13, 9);
    ctx.fillStyle = '#0e2a30';
    ctx.fillRect(c[0] - 5, c[1] - 13, 4.5, 3);
    ctx.strokeStyle = 'rgba(143,240,255,0.7)';
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.ellipse(c[0], c[1], 14, 7, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  // where a guard who thinks he saw you is going to look
  function drawInvestigations() {
    for (const g of state.guards) {
      if (g.down || g.mode !== 'suspect' || !g.target) continue;
      if (state.vis[key(g.x, g.y, g.lv)] !== 2) continue;
      const [x, y, lv] = g.target;
      if (lv > 0) { const r = regionOf(x, y, lv); if (!r || !regionShown(r)) continue; }
      const c = P3(x + 0.5, y + 0.5, lv * STOREY);
      ctx.strokeStyle = 'rgba(231,185,74,' + (0.55 + 0.25 * Math.sin(time * 4)) + ')';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.ellipse(c[0], c[1], 20, 10, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(231,185,74,0.9)';
      ctx.font = 'bold 14px "Share Tech Mono", monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('?', c[0], c[1] - 1);
    }
  }

  function targetAnchor(t) {
    if (t.kind === 'lamp') {
      const b = bulbPoint(t.o);
      return { sx: b[0], sy: b[1] };
    }
    if (t.kind === 'cam') {
      const c = t.o;
      const bx = c.mx + 0.5 + (c.x - c.mx) * (WT + 0.08), by = c.my + 0.5 + (c.y - c.my) * (WT + 0.08);
      const q = P3(bx, by, c.lv * STOREY + 38);
      return { sx: q[0], sy: q[1] };
    }
    const g = t.o;
    const q = P3(g.rx + 0.5, g.ry + 0.5, g.rl * STOREY + 20);
    return { sx: q[0], sy: q[1] };
  }

  function endPoint(a) {
    if (a.sx !== undefined) return [a.sx, a.sy];
    return P3(a[0] + 0.5, a[1] + 0.5, a[2] * STOREY + a[3]);
  }

  function drawTracers() {
    const p = state.player;
    // the laser onto whatever the next round would hit
    const aimT = state.aim || (hover.obj && !fireCheck(hover.obj) ? hover.obj : null);
    if (aimT && canAct()) {
      const a = P3(p.rx + 0.5, p.ry + 0.5, p.rl * STOREY + 20), b = endPoint(targetAnchor(aimT));
      ctx.strokeStyle = 'rgba(255,70,70,0.6)';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      ctx.fillStyle = '#ff5050';
      ctx.beginPath(); ctx.arc(b[0], b[1], 2.5, 0, Math.PI * 2); ctx.fill();
    }
    for (const g of state.guards) {
      if (!g.aiming || g.down || state.mode !== 'play') continue;
      if (g.lv > 0) { const r = regionOf(g.x, g.y, g.lv); if (!r || !regionShown(r)) continue; }
      const a = P3(g.rx + 0.5, g.ry + 0.5, g.rl * STOREY + 20), b = P3(p.rx + 0.5, p.ry + 0.5, p.rl * STOREY + 20);
      ctx.strokeStyle = 'rgba(255,60,60,' + (0.55 + 0.3 * Math.sin(time * 10)) + ')';
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    }
    for (const f of state.fx) {
      if (f.kind !== 'tracer') continue;
      const a = endPoint(f.from), b = endPoint(f.to);
      const k = 1 - f.t / f.life;
      ctx.strokeStyle = 'rgba(' + f.col + ',' + k + ')';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      ctx.fillStyle = 'rgba(255,240,200,' + k + ')';
      ctx.beginPath(); ctx.arc(a[0], a[1], 4 * k + 1, 0, Math.PI * 2); ctx.fill();
    }
  }

  function bubble(sx, sy, text, tone) {
    ctx.font = Math.round(14 * dpr) + 'px "Share Tech Mono", ui-monospace, monospace';
    const s = text.toUpperCase();
    const w = ctx.measureText(s).width + 18 * dpr, h = 26 * dpr;
    const x = Math.round(sx - w / 2), y = Math.round(sy - h - 10 * dpr);
    ctx.fillStyle = 'rgba(20,26,28,0.92)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = tone === 'bad' ? '#d8474a' : tone === 'good' ? '#6ef096' : '#8c9a97';
    ctx.lineWidth = 1.5 * dpr;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.fillStyle = ctx.fillStyle = 'rgba(20,26,28,0.92)';
    ctx.beginPath(); ctx.moveTo(sx - 6 * dpr, y + h); ctx.lineTo(sx, y + h + 7 * dpr); ctx.lineTo(sx + 6 * dpr, y + h); ctx.fill();
    ctx.beginPath(); ctx.moveTo(sx - 6 * dpr, y + h); ctx.lineTo(sx, y + h + 7 * dpr); ctx.lineTo(sx + 6 * dpr, y + h); ctx.stroke();
    ctx.fillStyle = tone === 'bad' ? '#ffb3b3' : '#e6eeec';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(s, sx, y + h / 2 + dpr);
  }

  function drawScreenUI() {
    const z = viewScale();
    const W2S = (q) => worldToScreen(q[0], q[1]);
    // markers over guards
    for (const g of state.guards) {
      if (g.down || !g.marker) continue;
      if (state.vis[key(g.x, g.y, g.lv)] !== 2) continue;
      if (g.lv > 0) { const r = regionOf(g.x, g.y, g.lv); if (!r || !regionShown(r)) continue; }
      const q = W2S(P3(g.rx + 0.5, g.ry + 0.5, g.rl * STOREY));
      const s = 9 * dpr;
      const x = q[0] + 14 * z, y = q[1] - 50 * z;
      ctx.fillStyle = g.marker === '!' ? '#d8474a' : '#e7b94a';
      ctx.fillRect(x - s, y - s, s * 2, s * 2);
      ctx.fillStyle = '#101416';
      ctx.font = 'bold ' + Math.round(14 * dpr) + 'px "Share Tech Mono", monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(g.marker, x, y + dpr);
    }
    // floating words
    for (const f of state.fx) {
      if (f.kind !== 'text') continue;
      const q = W2S(P3(f.x + 0.5, f.y + 0.5, f.lv * STOREY + 44));
      const k = f.t / f.life;
      ctx.globalAlpha = 1 - k * k;
      ctx.font = Math.round(15 * dpr) + 'px "Share Tech Mono", monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#0b0f10';
      ctx.fillText(f.text, q[0] + dpr, q[1] - k * 26 * dpr + dpr);
      ctx.fillStyle = f.col;
      ctx.fillText(f.text, q[0], q[1] - k * 26 * dpr);
      ctx.globalAlpha = 1;
    }
    if (state.mode !== 'play') return;
    // what Z would do, over the thing it would do it to
    const a = idle() ? contextAction() : null;
    let shown = false;
    if (a) {
      let q;
      if (a.kind === 'takedown') q = P3(a.g.rx + 0.5, a.g.ry + 0.5, a.g.rl * STOREY + 58);
      else if (a.kind === 'hack') q = P3(a.x + 0.5, a.y + 0.5, a.lv * STOREY + 40);
      else q = P3(a.x + 0.5, a.y + 0.5, a.lv * STOREY + 46);
      const s = W2S(q);
      bubble(s[0], s[1], a.label, a.kind === 'locked' ? 'bad' : null);
      shown = true;
    }
    // what a click would do, at the cursor
    if (canAct() && hover.obj) {
      const o = hover.obj;
      let text, tone;
      if (o.kind === 'guard' && canTakedown(o.o)) { text = 'Take down'; }
      else {
        const why = fireCheck(o);
        text = why ? why : 'Fire · ' + state.rounds + ' left';
        tone = why ? 'bad' : null;
      }
      const an = targetAnchor(o);
      const s = W2S([an.sx, an.sy - 10]);
      if (!(shown && o.kind === 'guard' && a && a.kind === 'takedown')) bubble(s[0], s[1], text, tone);
    } else if (canAct() && hover.tile >= 0) {
      const k = resolveTarget(hover.tile);
      if (state.reach.dist[k] > 0 && state.danger[k]) {
        const s = W2S(P3(kx(k) + 0.5, ky(k) + 0.5, kl(k) * STOREY + 8));
        bubble(s[0], s[1], 'Seen here', 'bad');
      }
    }
    // each arrow key's cap, on the tile that key would take you to
    if (idle()) {
      const caps = [['up', '↑'], ['down', '↓'], ['left', '←'], ['right', '→']];
      ctx.font = Math.round(12 * dpr) + 'px "Share Tech Mono", monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const [name, glyph] of caps) {
        const k = arrowTarget(name);
        if (k < 0) continue;
        const q = W2S(P3(kx(k) + 0.5, ky(k) + 0.5, kl(k) * STOREY));
        const h = 8 * dpr;
        ctx.fillStyle = 'rgba(16,22,24,0.7)';
        ctx.fillRect(q[0] - h, q[1] - h, h * 2, h * 2);
        ctx.strokeStyle = 'rgba(200,215,212,0.55)';
        ctx.lineWidth = dpr;
        ctx.strokeRect(q[0] - h + 0.5, q[1] - h + 0.5, h * 2 - 1, h * 2 - 1);
        ctx.fillStyle = 'rgba(230,238,236,0.9)';
        ctx.fillText(glyph, q[0], q[1] + dpr * 0.5);
      }
    }
  }

  // ---------- animation ----------
  function animate(dt) {
    time += dt;
    const ease = (a, b, rate) => a + (b - a) * Math.min(1, dt * rate);
    const move = (e) => {
      const d = Math.hypot(e.x - e.rx, e.y - e.ry) + Math.abs(e.lv - e.rl);
      e.rx = ease(e.rx, e.x, 16); e.ry = ease(e.ry, e.y, 16); e.rl = ease(e.rl, e.lv, 12);
      if (d > 0.03) e.walk += dt * 6; else e.walk = Math.round(e.walk);
    };
    if (!state) return;
    move(state.player);
    for (const g of state.guards) {
      if (!g.carried) move(g);
      const want = DIR_A[g.face];
      g.ra += Math.atan2(Math.sin(want - g.ra), Math.cos(want - g.ra)) * Math.min(1, dt * 12);
    }
    for (const c of state.cams) c.ra += (c.a - c.ra) * Math.min(1, dt * 8);
    for (const f of state.fx) f.t += dt;
    state.fx = state.fx.filter((f) => f.t < f.life);
    if (msgTimer > 0) { msgTimer -= dt; if (msgTimer <= 0) el.msg.className = 'msg'; }
    // the camera follows you, unless you have dragged it away
    const p = state.player;
    const tx = PX(p.rx + 0.5, p.ry + 0.5), ty = PY(p.rx + 0.5, p.ry + 0.5, p.rl * STOREY) - 30;
    if (!cam.free) { cam.x = ease(cam.x, tx, 5); cam.y = ease(cam.y, ty, 5); }
  }

  // ---------- HUD ----------
  const el = {
    hud: document.getElementById('hud'),
    obj: document.getElementById('hud-obj'),
    light: document.getElementById('hud-light'),
    seen: document.getElementById('hud-seen'),
    seenLabel: document.getElementById('hud-seen-label'),
    rounds: document.getElementById('hud-rounds'),
    dots: document.getElementById('hud-dots'),
    hp: document.getElementById('hud-hp'),
    nv: document.getElementById('hud-nv'),
    msg: document.getElementById('msg'),
    turnbar: document.getElementById('turnbar'),
    turn: document.getElementById('tb-turn'),
    ap: document.getElementById('tb-ap'),
    run: document.getElementById('tb-run'),
    nvBtn: document.getElementById('tb-nv'),
    use: document.getElementById('tb-use'),
    fire: document.getElementById('tb-fire'),
    title: document.getElementById('title'),
    titleBest: document.getElementById('title-best'),
    hack: document.getElementById('hack'),
    hackStatus: document.getElementById('hack-status'),
    hackZone: document.getElementById('hack-zone'),
    hackMark: document.getElementById('hack-mark'),
    end_: document.getElementById('end'),
    endTitle: document.getElementById('end-title'),
    endBody: document.getElementById('end-body'),
    endCheckpoint: document.getElementById('end-checkpoint'),
    help: document.getElementById('help'),
    sound: document.getElementById('btn-sound'),
  };

  let hudKey = '';
  function updateHud() {
    if (!state) return;
    const p = state.player;
    const L = state.light[key(p.x, p.y, p.lv)];
    const gait = state.dragging ? 'Dragging' : state.run ? 'Running' : 'Sneaking';
    const sig = [state.phase, Math.round(L * 20), state.seen, state.alarm, state.rounds, state.hp, Math.round(state.battery), state.moves, gait, state.nv, state.mode].join('|');
    if (sig === hudKey) return;
    hudKey = sig;
    el.obj.textContent = PHASES[state.phase];
    el.hud.classList.toggle('escape', state.phase === 'escape');
    el.hud.classList.toggle('alarm', state.alarm);
    const lc = L >= LIT ? '#f2d888' : L >= SEE_LIGHT ? '#9c8f62' : '#3a4442';
    el.light.style.background = lc;
    el.light.style.boxShadow = L >= LIT ? '0 0 10px rgba(242,216,136,0.8)' : 'none';
    el.light.title = L >= LIT ? 'Lit — seen from across a cone' : L >= SEE_LIGHT ? 'Dim' : 'Dark — only a torch close up finds you';
    el.seen.style.width = 'calc(' + state.seen + '% - 2px)';
    el.seenLabel.textContent = state.alarm ? 'Alarm' : 'Seen';
    el.rounds.textContent = state.rounds;
    const max = ROUNDS[state.difficulty];
    if (el.dots.childElementCount !== max) {
      el.dots.innerHTML = '';
      el.dots.style.gridTemplateColumns = 'repeat(' + Math.ceil(max / 2) + ', 7px)';
      for (let i = 0; i < max; i++) el.dots.appendChild(document.createElement('i'));
    }
    Array.from(el.dots.children).forEach((d, i) => d.classList.toggle('spent', i >= state.rounds));
    el.hp.style.width = (100 * state.hp / START_HP) + '%';
    el.nv.style.width = state.battery + '%';
    el.turn.textContent = 'Moves ' + state.moves;
    el.ap.textContent = gait;
    el.ap.classList.toggle('loud', state.run && !state.dragging);
    el.run.setAttribute('aria-pressed', String(state.run));
    el.nvBtn.setAttribute('aria-pressed', String(state.nv));
    const busy = state.mode !== 'play';
    [el.run, el.use, el.fire].forEach((b) => { b.disabled = busy; });
  }

  function showEnd(won) {
    el.end_.hidden = false;
    const rec = loadSave();
    if (won) {
      el.endTitle.textContent = 'Out with the data';
      el.endBody.innerHTML =
        '<p>Back through the wire in <b>' + state.moves + ' moves</b> on ' + state.difficulty + ', with ' + state.rounds + ' of ' +
        ROUNDS[state.difficulty] + ' rounds left.</p>' +
        '<p>' + (state.earlyAlarm ? 'They were already looking for you before the download.' : 'Nobody raised the alarm until the download did. A clean run.') + '</p>' +
        '<p>' + (state.newBest ? '<b>A new best</b> for ' + state.difficulty + '.' : 'Best on ' + state.difficulty + ': ' + rec.best[state.difficulty] + ' moves.') + '</p>';
      el.endCheckpoint.hidden = true;
    } else {
      el.endTitle.textContent = 'Blackout';
      el.endBody.innerHTML = '<p>' + (state.deathWhy || 'Shot') + '. ' +
        (state.checkpoint ? 'The data was yours. The terminal is a checkpoint.' : 'The compound never saw the data leave.') + '</p>';
      el.endCheckpoint.hidden = !state.checkpoint;
    }
  }
  function hideEnd() { el.end_.hidden = true; }

  // ---------- saving ----------
  function loadSave() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (s && s.best) return s;
    } catch (e) { /* storage blocked */ }
    return { best: { normal: null, hard: null }, wins: 0 };
  }
  function writeSave(s) {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch (e) { /* storage blocked */ }
  }

  function showTitle() {
    newGame(difficulty);
    state.mode = 'title';
    el.title.hidden = false;
    hideEnd();
    el.hack.hidden = true;
    document.querySelectorAll('[data-diff]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.diff === difficulty)));
    const rec = loadSave();
    const bits = [];
    if (rec.best.normal) bits.push('Best on normal: ' + rec.best.normal + ' moves');
    if (rec.best.hard) bits.push('Best on hard: ' + rec.best.hard + ' moves');
    el.titleBest.textContent = bits.join(' · ');
  }

  function start() {
    if (!state || state.mode !== 'title') newGame(difficulty);
    state.mode = 'play';
    el.title.hidden = true;
    hideEnd();
    cam.free = false;
    computeVision();
    computeReach();
    say(PHASES.wire + ' — there is a cut in it just ahead');
    state.cardHinted = false;
    ensureAudio();
  }

  // ---------- input ----------
  function pick(sx, sy) {
    const [wx, wy] = screenToWorld(sx, sy);
    let obj = null, bd = 20;
    const near = (q, t) => { const d = Math.hypot(q[0] - wx, q[1] - wy); if (d < bd) { bd = d; obj = t; } };
    for (const g of state.guards) {
      if (g.down || g.carried || state.vis[key(g.x, g.y, g.lv)] !== 2) continue;
      if (g.lv > 0) { const r = regionOf(g.x, g.y, g.lv); if (!r || !regionShown(r)) continue; }
      near(P3(g.rx + 0.5, g.ry + 0.5, g.rl * STOREY + 18), { kind: 'guard', o: g });
    }
    for (const l of state.lamps) {
      if (!l.alive || l.lv !== state.player.lv || state.vis[key(l.x, l.y, l.lv)] === 0) continue;
      if (l.lv > 0 && !regionShown(regionOf(l.x, l.y, l.lv))) continue;
      near(bulbPoint(l), { kind: 'lamp', o: l });
    }
    for (const c of state.cams) {
      if (!c.alive || c.lv !== state.player.lv || state.vis[key(c.x, c.y, c.lv)] === 0) continue;
      const a = targetAnchor({ kind: 'cam', o: c });
      near([a.sx, a.sy], { kind: 'cam', o: c });
    }
    let t = -1;
    const planes = UPPER.filter((r) => regionShown(r)).map((r) => [r.lv, r]).concat([[0, null]]);
    for (const [lv, r] of planes) {
      const yy = wy + lv * STOREY;
      const gx = Math.floor((wx / HW + yy / HH) / 2), gy = Math.floor((yy / HH - wx / HW) / 2);
      if (!inb(gx, gy, lv) || !tile(gx, gy, lv)) continue;
      if (r && !inRegion(r, gx, gy)) continue;
      t = key(gx, gy, lv);
      break;
    }
    return { obj, tile: t };
  }

  function clickPick(pk) {
    if (!canAct()) return;
    if (pk.obj) {
      const o = pk.obj;
      if (o.kind === 'guard' && canTakedown(o.o)) { doAction({ kind: 'takedown', g: o.o }); return; }
      fire(o);
      return;
    }
    const k = pk.tile;
    if (k < 0) return;
    const x = kx(k), y = ky(k), lv = kl(k), c = ch(x, y, lv);
    const a = contextAction();
    if (a && a.x === x && a.y === y && a.lv === lv && a.kind !== 'drop') { doAction(a); return; }
    if (c === 'T' || c === 'D' || bodyAt(x, y, lv)) {
      if (bodyAt(x, y, lv) && state.reach.dist[k] > 0) { moveTo(k); return; }
      // walk to the nearest reachable tile beside it
      let best = -1, bd = 99;
      for (const [dx, dy] of DIRS) {
        const n = key(x + dx, y + dy, lv);
        if (inb(x + dx, y + dy, lv) && state.reach.dist[n] > 0 && state.reach.dist[n] < bd) { bd = state.reach.dist[n]; best = n; }
      }
      if (best >= 0) moveTo(best);
      return;
    }
    if (state.reach.dist[k] > 0) moveTo(k);
    else if (k === pkey() && a) doAction(a);
  }

  let press = null;
  canvas.addEventListener('pointerdown', (e) => {
    press = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, panned: false, type: e.pointerType };
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic */ }
  });
  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    if (press) {
      const dx = e.clientX - press.x, dy = e.clientY - press.y;
      if (!press.panned && Math.hypot(dx, dy) > 7) { press.panned = true; canvas.classList.add('pan'); }
      if (press.panned) {
        cam.free = true;
        cam.x = press.cx - dx / cam.zoom;
        cam.y = press.cy - dy / cam.zoom;
        return;
      }
    }
    if (!state || e.pointerType === 'touch') return;
    hover = pick((e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr);
    canvas.classList.toggle('aim', !!(hover.obj && canAct()));
  });
  canvas.addEventListener('pointerup', (e) => {
    const pr = press;
    press = null;
    canvas.classList.remove('pan');
    if (!pr || pr.panned || !state) return;
    const r = canvas.getBoundingClientRect();
    const pk = pick((e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr);
    if (pr.type === 'touch') {
      // on a touch screen the first tap shows what would happen, the second does it
      const same = hover && ((pk.obj && hover.obj && pk.obj.o === hover.obj.o) || (!pk.obj && !hover.obj && pk.tile === hover.tile));
      hover = pk;
      if (!same) return;
    }
    clickPick(pk);
  });
  canvas.addEventListener('pointerleave', () => { if (!press) hover = { obj: null, tile: -1 }; });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const sx = (e.clientX - r.left) * dpr, sy = (e.clientY - r.top) * dpr;
    const before = screenToWorld(sx, sy);
    cam.zoom = clamp(cam.zoom * Math.exp(-e.deltaY * 0.0015), 0.45, 2.2);
    const after = screenToWorld(sx, sy);
    cam.x += before[0] - after[0];
    cam.y += before[1] - after[1];
    if (Math.abs(before[0] - after[0]) + Math.abs(before[1] - after[1]) > 0.5) cam.free = true;
  }, { passive: false });

  function zoomBy(f) { cam.zoom = clamp(cam.zoom * f, 0.45, 2.2); }

  function useKey() {
    if (!state) return false;
    if (state.mode === 'hack') { hackPress(); return true; }
    if (state.mode === 'over' && state.checkpoint) { restoreCheckpoint(); return true; }
    const a = contextAction();
    if (!a) { say('Nothing to use here'); return false; }
    return doAction(a);
  }

  function fireKey() {
    if (!canAct()) return false;
    const list = targets();
    if (state.aim && !fireCheck(state.aim)) return fire(state.aim);
    if (hover.obj && !fireCheck(hover.obj)) return fire(hover.obj);
    if (!list.length) { say(state.rounds <= 0 ? 'Out of rounds' : 'Nothing in your line of fire'); return false; }
    state.aim = list[0];
    say('X again to fire · Tab for another target');
    return false;
  }

  function cycleTarget() {
    if (!canAct()) return;
    const list = targets();
    if (!list.length) { state.aim = null; say('Nothing in your line of fire'); return; }
    const i = state.aim ? list.findIndex((t) => t.o === state.aim.o) : -1;
    state.aim = list[(i + 1) % list.length];
  }

  const KEYARROW = { ArrowUp: 'up', KeyW: 'up', ArrowRight: 'right', KeyD: 'right', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left' };
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (!el.help.hidden) { if (e.code === 'Escape') el.help.hidden = true; return; }
    if (!state) return;
    if (state.mode === 'title') {
      if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); start(); }
      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') setDifficulty(difficulty === 'normal' ? 'hard' : 'normal');
      return;
    }
    if (state.mode === 'hack') {
      if (e.code === 'KeyZ' || e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); hackPress(); }
      if (e.code === 'Escape') leaveHack();
      return;
    }
    if (state.mode === 'over' || state.mode === 'won') {
      if (e.code === 'KeyZ' && state.checkpoint && state.mode === 'over') restoreCheckpoint();
      if (e.code === 'Enter') showTitle();
      return;
    }
    if (e.code in KEYARROW) { e.preventDefault(); stepDir(ARROW_DIR[KEYARROW[e.code]]); cam.free = false; return; }
    switch (e.code) {
      case 'Space': e.preventDefault(); stay(); break;
      case 'KeyZ': useKey(); break;
      case 'KeyX': fireKey(); break;
      case 'Tab': e.preventDefault(); cycleTarget(); break;
      case 'KeyR': toggleRun(); break;
      case 'KeyC': toggleNV(); break;
      case 'KeyF': cam.free = false; break;
      case 'Escape': state.aim = null; stopWalk(); break;
      case 'Equal': case 'NumpadAdd': zoomBy(1.15); break;
      case 'Minus': case 'NumpadSubtract': zoomBy(1 / 1.15); break;
      default: return;
    }
  });

  el.run.addEventListener('click', toggleRun);
  el.nvBtn.addEventListener('click', toggleNV);
  document.getElementById('tb-stay').addEventListener('click', stay);
  el.use.addEventListener('click', useKey);
  el.fire.addEventListener('click', fireKey);
  document.getElementById('tb-zoomin').addEventListener('click', () => zoomBy(1.2));
  document.getElementById('tb-zoomout').addEventListener('click', () => zoomBy(1 / 1.2));
  document.getElementById('btn-start').addEventListener('click', start);
  document.getElementById('btn-new').addEventListener('click', showTitle);
  document.getElementById('end-again').addEventListener('click', showTitle);
  el.endCheckpoint.addEventListener('click', restoreCheckpoint);
  document.getElementById('hack-press').addEventListener('click', hackPress);
  document.getElementById('hack-leave').addEventListener('click', leaveHack);
  document.getElementById('btn-help').addEventListener('click', () => { el.help.hidden = false; });
  document.querySelectorAll('[data-open="help"]').forEach((b) => b.addEventListener('click', () => { el.help.hidden = false; }));
  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => { document.getElementById(b.dataset.close).hidden = true; }));
  el.help.addEventListener('click', (e) => { if (e.target === el.help) el.help.hidden = true; });
  document.querySelectorAll('[data-diff]').forEach((b) => b.addEventListener('click', () => setDifficulty(b.dataset.diff)));

  function setDifficulty(d) {
    difficulty = d;
    try { localStorage.setItem(DIFF_KEY, d); } catch (e) { /* storage blocked */ }
    document.querySelectorAll('[data-diff]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.diff === d)));
    if (state && state.mode === 'title') { newGame(d); state.mode = 'title'; }
  }

  // ---------- sound ----------
  let soundOn = false, actx = null;
  try { const v = localStorage.getItem(SOUND_KEY); soundOn = v === 'on' || v === '1'; } catch (e) { /* storage blocked */ }
  function ensureAudio() {
    if (!soundOn || actx) return;
    try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; }
  }
  function sfx(freq, dur, vol, type, delay) {
    if (!soundOn) return;
    ensureAudio();
    if (!actx) return;
    const t0 = actx.currentTime + (delay || 0);
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(actx.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function noise(dur, vol, freq) {
    if (!soundOn) return;
    ensureAudio();
    if (!actx) return;
    const n = Math.floor(actx.sampleRate * dur);
    const buf = actx.createBuffer(1, n, actx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
    s.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; g.gain.value = vol;
    s.connect(f).connect(g).connect(actx.destination);
    s.start();
  }
  const sfxStep = () => noise(0.05, state.run ? 0.25 : 0.08, state.run ? 900 : 500);
  const sfxShot = (loud) => noise(loud ? 0.25 : 0.12, loud ? 0.6 : 0.35, loud ? 700 : 1800);
  const sfxGlass = () => { noise(0.25, 0.25, 4200); sfx(2400, 0.1, 0.03, 'triangle', 0.02); };
  const sfxThud = () => { noise(0.15, 0.4, 180); sfx(90, 0.18, 0.08, 'sine'); };
  const sfxAlarm = () => { for (let i = 0; i < 4; i++) { sfx(620, 0.22, 0.05, 'sawtooth', i * 0.45); sfx(880, 0.22, 0.05, 'sawtooth', i * 0.45 + 0.22); } };
  el.sound.textContent = 'Sound: ' + (soundOn ? 'on' : 'off');
  el.sound.setAttribute('aria-pressed', String(soundOn));
  el.sound.addEventListener('click', () => {
    soundOn = !soundOn;
    try { localStorage.setItem(SOUND_KEY, soundOn ? 'on' : 'off'); } catch (e) { /* storage blocked */ }
    el.sound.textContent = 'Sound: ' + (soundOn ? 'on' : 'off');
    el.sound.setAttribute('aria-pressed', String(soundOn));
    if (soundOn) { ensureAudio(); sfx(660, 0.08, 0.05, 'triangle'); }
  });

  // ---------- the loop ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    fitCanvas();
    if (state && state.mode === 'play') pump(dt);
    if (state && state.mode === 'hack') updateHack(dt);
    animate(dt);
    render(dt);
    updateHud();
    requestAnimationFrame(frame);
  }
  window.addEventListener('resize', fitCanvas);

  showTitle();
  snapAll();
  requestAnimationFrame(frame);

  // ---------- debug handle ----------
  window.__blackout = {
    get state() { return state; },
    consts: { W, H, LV, LADDERS, GUARD_EVERY, GUARD_EVERY_ALARM, ROUNDS, SEEN_GAIN, LIT, TORCH_REACH, CONE_RANGE, START, GATE, UPPER, LAMPS, CAMERAS, GUARDS },
    key, kx, ky, kl, tile: ch, passable, los, bfs, neighbours,
    newGame, start, flush, wait, stay, stepDir, arrowTarget, toggleRun, toggleNV,
    moveTo: (x, y, lv) => moveTo(key(x, y, lv === undefined ? state.player.lv : lv)),
    use: useKey, fire, targets, hackPress, contextAction, doAction,
    seesTile, camSees, watchedAt, computeReach, computeVision, computeLight, restoreCheckpoint,
    teleport(x, y, lv) {
      const p = state.player;
      p.x = x; p.y = y; p.lv = lv === undefined ? p.lv : lv;
      p.rx = p.x; p.ry = p.y; p.rl = p.lv;
      pickUp(); advance(); computeVision(); computeReach(); checkWin();
    },
    cam,
  };
})();
