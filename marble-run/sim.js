/* Marble Run: the rules, with no page in sight.

   A level is an upright pegboard of square cells. The marble rolls in the plane of the
   board (x to the right, y up, one cell = 1), so the physics is two-dimensional even
   though the page draws it in 3D: a circle under gravity against the rails of every
   piece, each rail a capsule. The player hangs pieces from the level's box on empty
   cells, then releases the marble; it has to end in the cup. Bells rung on the way and
   using no more pieces than the level's par are the other two stars.

     createRun({ saved, on })      the game: the level in hand, its pieces, the run
     simulate(level, placed)       one release run to its end, for solve.js and the tests

   The sandbox is a level of its own (SANDBOX): a big empty board, every piece without
   limit, and four that only it has: a paddle wheel that spins when hit, a motor wheel that
   turns by itself, a chime and a bucket. Release keeps feeding marbles until Stop; a marble
   that comes to rest, lands on the frame's floor or falls in a bucket is taken away.

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
const SPRING_V = 5.25;            // a spring sends a marble off at least this fast (5.1-5.4 makes Boing's answer a spring facing forward, not one turned round to bank off the pipe)
const STALL_V = 0.12, STALL_T = 1.5;
const RUN_LIMIT = 45;             // seconds before a run is called off
const MARBLE_GAP = 1.8;           // seconds between marbles on a level with more than one
const FAIL_HOLD = 1.4;            // seconds a failed run stays on screen before the board resets
const SAVE_VERSION = 1;
const WHEEL_I = 0.35;             // a paddle wheel's inertia, against a marble's mass of 1
const WHEEL_DRAG = 0.6;           // per second: a free wheel spins down
const WHEEL_BOUNCE = 0.2;
const MOTOR_GRIP = 0.35;          // per touch: how much of a marble's slide along a motor's scoop it loses, so it rides up with it
export const MOTOR_W = 2.4;              // a motor wheel's turn, radians per second
const SAND_LIVE = 7;              // marbles on the sandbox board at once
const SAND_GAP = 1.1;             // seconds between them
const SAND_FLOOR = 1.0;           // seconds on the frame's floor before a marble is taken away
const CHIME_REST = 0.35;          // seconds before a chime can ring again
const SEESAW_I = 0.12, SEESAW_K = 2.5, SEESAW_DAMP = 2.2, SEESAW_MAX = 0.42;  // inertia, pull back to level, damping, tilt limit
const BUMP_V = 4.6;               // a bumper sends a marble off at least this fast
const BOOST_V = 6.5, BOOST_ACC = 14;  // a booster speeds a marble along it up to this, this fast
const SPIRAL_T = 1.6, SPIRAL_TURNS = 2;  // seconds and turns down a spiral
const SPIRAL_R = 0.26;            // the spiral's radius, round its pole
export const CRUMBLE_SHAKE = 0.35, CRUMBLE_GONE = 3;  // a crumbling ledge shakes this long once touched, then is gone this long
// flipper and catapult: where they rest, how far they swing, how fast up and back, how
// long after a marble lands they fire
const KICK = {
  flipper: { rest: -0.45, up: 0.55, wUp: 13, wDown: 3.5, delay: 0.06 },
  catapult: { rest: -0.08, up: 1.25, wUp: 9.5, wDown: 2.2, delay: 0.4 },
};

// ---------- pieces ----------
// Each piece is a few polylines in its own cell (0..1 both ways, y up), drawn facing
// right; `flip` mirrors it. A piece the player can place is in the level's box; the
// letter is how a level map writes one fixed in place (upper case is flipped).
const P = (...pts) => pts;
// Paddles round the middle of a cell, turned by angle a. A motor's have a lip on their
// leading side, so they scoop a marble up rather than knock it away.
function paddles(n, a, r0, r1, lip) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const t = a + (k * Math.PI * 2) / n, c = Math.cos(t), sn = Math.sin(t);
    const l = [[0.5 + c * r0, 0.5 + sn * r0], [0.5 + c * r1, 0.5 + sn * r1]];
    if (lip) l.push([0.5 + Math.cos(t + lip) * (r1 - 0.02), 0.5 + Math.sin(t + lip) * (r1 - 0.02)], [0.5 + Math.cos(t + lip * 1.6) * (r1 - 0.14), 0.5 + Math.sin(t + lip * 1.6) * (r1 - 0.14)]);
    out.push(l);
  }
  return out;
}
export const PIECES = {
  /* Slopes come in two halves of one gentle line (Amber, 2026-10-16): a low slope runs
     across the bottom half of its cell, a high slope across the top half, at the same
     angle. High then low, side by side, is one smooth rail a cell long; the next high slope
     goes one row down and carries on. A low slope beside the hopper carries on from its
     ledge. They come out of the same pile in the box ('pool'). Every ramp meets these
     heights: a cell's top, middle or bottom at its edges. */
  slope: {
    face: 'up',   // meant to be landed on and rolled along from above
    name: 'Low slope', letter: 's',
    tip: 'A gentle ramp across the bottom half of its cell. One beside the hopper carries straight on from its ledge; a high slope before it makes one smooth rail.',
    lines: () => [P([0, 0.5], [1, 0])],
  },
  slopehigh: {
    face: 'up',   // meant to be landed on and rolled along from above
    name: 'High slope', letter: 'd', pool: 'slope',
    tip: 'The same ramp across the top half of its cell. Hang a low slope after it, then the next high slope one row down, for a long smooth run. Comes from the same pile as low slopes.',
    lines: () => [P([0, 1], [1, 0.5])],
  },
  steep: {
    face: 'up',   // meant to be landed on and rolled along from above
    name: 'Steep', letter: 'e',
    tip: 'Corner to corner, a whole cell down, so the marble leaves it fast. Steeps hung down a diagonal meet.',
    lines: () => [P([0, 1], [1, 0])],
  },
  turn: {
    face: [0.55, 0.6],   // meant to be met from inside the hook
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
    face: 'up',   // meant to be landed on and rolled along from above
    name: 'Jump', letter: 'j',
    tip: 'A ramp with a kick at the end that throws the marble up and across a gap.',
    lines: () => [P([0, 0.5], [0.42, 0.2], [0.64, 0.14], [0.84, 0.22], [0.97, 0.4])],
  },
  spring: {
    face: 'up',   // meant to be landed on and rolled along from above
    name: 'Spring', letter: 'p', spring: true,
    tip: 'A rubber pad on a spring. Anything that lands on it is thrown up and away.',
    lines: () => [P([0.12, 0.5], [0.86, 0.16])],
  },
  toggle: {
    name: 'Toggle', letter: 'g', sym: false,
    tip: 'A flap that tips each marble the way it leans, then swings over for the next.',
    lines: (state) => [state ? P([0.3, 0.72], [0.92, 0.22]) : P([0.7, 0.72], [0.08, 0.22])],
  },
  // the sandbox's own. A marble release goes in a cell at the board's edge, and marbles
  // come out of it: down from the top edge, in from a side. With more than one, they take
  // turns. The starter slope is the hopper's ledge, to catch them and start them rolling.
  feeder: {
    name: 'Marble release', letter: '1', sym: true, edge: true, sandbox: true,
    tip: 'Where the marbles come in. Hang it in a cell at the edge of the board: from the top they drop, from a side they roll in. With more than one, they take turns.',
    lines: () => [],
  },
  starter: {
    name: 'Starter slope', letter: '2', sandbox: true,
    tip: 'The hopper\u2019s ledge: a back wall and a short ramp. Hang it under a release to catch each marble and set it rolling. Flip it to send them the other way.',
    lines: () => [P([0.12, 0.97], [0.12, 0.7], [0.22, 0.64], [1, 0.5])],
  },
  wheel: {
    name: 'Paddle wheel', letter: 'r', sym: true, spin: 'free', sandbox: true,
    tip: 'Six paddles on a free axle. A marble landing on it sets it turning, and it carries the marble round.',
    lines: (a = 0) => paddles(6, a, 0.07, 0.43, 0),
  },
  motor: {
    name: 'Motor wheel', letter: 'm', spin: 'motor', sandbox: true,
    tip: 'Turns on its own, scooping marbles up and flinging them off. Flip it to turn it the other way.',
    lines: (a = 0) => paddles(3, a, 0.06, 0.45, 0.45),
  },
  chime: {
    name: 'Chime', letter: 'c', sym: true, sandbox: true,
    tip: 'Rings when a marble passes through its cell. The higher you hang it, the higher the note.',
    lines: () => [],
  },
  bucket: {
    name: 'Bucket', letter: 'k', sym: true, sandbox: true,
    tip: 'A glass bowl that catches marbles and counts them.',
    lines: () => [P([0.12, 0.8], [0.17, 0.1], [0.83, 0.1], [0.88, 0.8])],
  },
};

// Points about a pivot (px, py) in the cell, turned by angle a.
function turned(pts, px, py, a) {
  const c = Math.cos(a), sn = Math.sin(a);
  return pts.map(([x, y]) => [px + x * c - y * sn, py + x * sn + y * c]);
}
const tiny = (x, y) => P([x, y], [x + 0.001, y]);   // a pin: a segment too short to see
Object.assign(PIECES, {
  seesaw: {
    name: 'See-saw', letter: 'v', sym: true, spin: 'seesaw', pivot: [0.5, 0.42], sandbox: true,
    tip: 'A plank on a pivot. It tips under a marble and rocks back level.',
    lines: (a = 0) => [turned([[-0.47, 0], [0.47, 0]], 0.5, 0.42, a)],
  },
  spiral: {
    name: 'Spiral', letter: 'h', sym: true, sandbox: true,
    tip: 'A brass corkscrew round a pole. A marble dropped in its top rides round it twice and comes out slower at the bottom.',
    lines: () => [P([0.5, 0.05], [0.5, 0.55])],
  },
  flipper: {
    name: 'Flipper', letter: 'l', spin: 'kick', pivot: [0.16, 0.32], sandbox: true,
    tip: 'A pinball flipper. When a marble lands on it, it kicks it back up. Flip it to face the other way.',
    lines: (a = KICK.flipper.rest) => [turned([[0, 0], [0.66, 0]], 0.16, 0.32, a)],
  },
  catapult: {
    name: 'Catapult', letter: 'q', spin: 'kick', pivot: [0.12, 0.2], sandbox: true,
    tip: 'A spoon on a spring. A marble that lands in it is thrown up and back over the pivot a moment later.',
    lines: (a = KICK.catapult.rest) => [turned([[0, 0], [0.64, 0], [0.76, 0.13]], 0.12, 0.2, a)],
  },
  // a lever that flipped switches elsewhere was tried and was too hard to follow; Amber
  // asked for this instead: a flap you set yourself, one way or the other
  // Amber's idea, after crumbling bricks in platformers
  crumble: {
    name: 'Crumbling ledge', letter: 'a', sym: true, sandbox: true,
    tip: 'A brick ledge. A moment after a marble lands on it, it crumbles away, and comes back a few seconds later.',
    lines: () => [P([0.04, 0.5], [0.96, 0.5])],
  },
  flap: {
    face: 'up',   // meant to be landed on and rolled along from above
    name: 'Flap', letter: 'z', sandbox: true,
    tip: 'A gate with two positions: it sends a falling marble down one route or the other. Flip it to change the route, even while the marbles run.',
    lines: () => [P([0.5, 0.92], [0.12, 0.38])],
  },
  plinko: {
    name: 'Plinko pins', letter: 'i', sym: true, sandbox: true,
    tip: 'Five brass pins. A marble bounces through them one way or the other.',
    lines: () => [tiny(0.22, 0.8), tiny(0.78, 0.8), tiny(0.5, 0.5), tiny(0.22, 0.2), tiny(0.78, 0.2)],
  },
  booster: {
    face: 'up',   // meant to be landed on and rolled along from above
    name: 'Booster', letter: 'o', boost: true, sandbox: true,
    tip: 'A powered rail. A marble rolling along it is sped up to a good pace.',
    lines: () => [P([0, 0.5], [1, 0])],
  },
  bumper: {
    name: 'Bumper', letter: 'y', sym: true, kick: BUMP_V, sandbox: true,
    tip: 'A pinball bumper: whatever touches it is knocked away, hard.',
    lines: () => [Array.from({ length: 13 }, (_, k) => [0.5 + Math.cos(k / 12 * Math.PI * 2) * 0.22, 0.5 + Math.sin(k / 12 * Math.PI * 2) * 0.22])],
  },
});

// The sandbox: a big empty board and every piece without limit.
export const SANDBOX = {
  id: 'sandbox', name: 'Sandbox', sandbox: true,
  note: 'No goal: build whatever you like. Hang a marble release at the edge of the board, then Release keeps the marbles coming until you press Stop.',
  // no start: you hang your own marble releases (Amber)
  map: Array.from({ length: 10 }, () => '............'),
};
const BY_LETTER = {};
for (const [kind, p] of Object.entries(PIECES)) BY_LETTER[p.letter] = kind;

// The fittings a level map can hold besides pieces. Lines in the same cell space.
export const FITTINGS = {
  start: () => [P([0.12, 0.97], [0.12, 0.7], [0.22, 0.64], [1, 0.5])],
  cup: () => [P([0.12, 0.8], [0.17, 0.1], [0.83, 0.1], [0.88, 0.8])],
  stand: () => [P([0.36, 1], [0.36, 0]), P([0.64, 1], [0.64, 0])],   // a cup's copper column
  tube: () => [P([0.15, 1], [0.15, 0]), P([0.49, 1], [0.49, 0])],     // the glass feed tube, round x 0.32
  lid: () => [P([0.12, 0.8], [0.88, 0.8])],
  block: () => [P([0.05, 0.05], [0.95, 0.05], [0.95, 0.95], [0.05, 0.95], [0.05, 0.05])],
};
const START_AT = [0.32, 0.86];             // where a marble is set down in the hopper
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
/* Every board is the sandbox's size (Amber, 2026-10-16), so the board never changes size on
   screen. A level's map is smaller: it is set in the middle of the board, a glass tube
   feeding its hopper from the top of the frame (Amber's idea, so the level sits centred).
   The board round it is plumbing, for decoration (her idea too): pipes come in from under
   the frame on the sides and the bottom, some joined to their neighbours in loops, some on
   their own, with gaps between. They keep a cell clear of the level's own cells. Every cell
   round the level that no pipe runs through has peg holes and takes pieces like any other
   (Amber); the cells the pipes cover do not ('pipe'). The pipes are solid, and a marble that
   touches one has missed, so no answer banks off them (Boing's once did, and Amber found it odd). A marble
   that leaves the level drops to the frame's floor. Each cup stands on a copper column
   down to the frame; nothing can hang in its cells either. (A pipe all round the level, as
   a border, was tried first; she had it taken out.) */
export const PIPE_R = 0.13;
export const BOARD_W = 12, BOARD_H = 10;
function onBoard(map) {
  const w = map[0].length, h = map.length;
  if (w > BOARD_W || h > BOARD_H) throw new Error(`a map of ${w}x${h} is bigger than the board`);
  const left = Math.floor((BOARD_W - w) / 2), top = Math.floor((BOARD_H - h) / 2);
  const rows = map.map((r) => 'o'.repeat(left) + r + 'o'.repeat(BOARD_W - w - left));
  for (let k = 0; k < top; k++) rows.unshift('o'.repeat(BOARD_W));
  while (rows.length < BOARD_H) rows.push('o'.repeat(BOARD_W));
  // the level's cells run x0..x1, y0..y1 (cell edges); the pipes are in cell coordinates
  const x0 = left, x1 = left + w, y1 = BOARD_H - top, y0 = y1 - h;
  const out = FRAME + 0.45;                // how far a pipe runs on under the frame
  // the same map always gets the same plumbing
  let seed = 7;
  for (const r of map) for (const ch of r) seed = (seed * 31 + ch.charCodeAt(0)) % 2147483647;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pipes = [];
  // the sides: pipes in from the frame at every other row or so, ending a cell short of the
  // level; now and then one turns down and joins the next one, a loop out of the frame
  for (const side of [-1, 1]) {
    const room = side < 0 ? x0 : BOARD_W - x1;
    if (room < 2) continue;
    const edge = side < 0 ? -out : BOARD_W + out;
    const end = side < 0 ? x0 - 1 : x1 + 1;                 // a cell clear of the level
    const bend = side < 0 ? Math.max(0.5, x0 - 1.5) : Math.min(BOARD_W - 0.5, x1 + 1.5);
    const ys = [];
    for (let y = 0.5 + Math.floor(rnd() * 2); y < BOARD_H; y += 2 + Math.floor(rnd() * 2)) ys.push(y);
    for (let k = 0; k < ys.length; k++) {
      if (k + 1 < ys.length && rnd() < 0.45) {
        pipes.push({ pts: [[edge, ys[k]], [bend, ys[k]], [bend, ys[k + 1]], [edge, ys[k + 1]]] });
        k++;
      } else pipes.push({ pts: [[edge, ys[k]], [end, ys[k]]], feeder: true, cap: true });
    }
  }
  // the bottom: pipes up from under the frame, between the cups' columns, stopping a cell
  // below the level; now and then two join across
  if (y0 >= 2) {
    const cups = [];
    map.forEach((r) => [...r].forEach((ch, i) => { if (ch === 'U') cups.push(left + i + 0.5); }));
    const xs = [];
    for (let x = x0 + 0.5 + Math.floor(rnd() * 2); x < x1; x += 2 + Math.floor(rnd() * 2)) {
      if (cups.every((c) => Math.abs(c - x) > 0.9)) xs.push(x);
    }
    const reach = y0 - 1, across = Math.max(0.5, y0 - 1.5);
    for (let k = 0; k < xs.length; k++) {
      const between = k + 1 < xs.length && cups.every((c) => c < xs[k] || c > xs[k + 1]);
      if (between && rnd() < 0.5) {
        pipes.push({ pts: [[xs[k], -out], [xs[k], across], [xs[k + 1], across], [xs[k + 1], -out]] });
        k++;
      } else pipes.push({ pts: [[xs[k], -out], [xs[k], reach]], feeder: true, cap: true });
    }
  }
  // cells round the level that no pipe runs through are open, like the level's own
  const covered = (cx, cy) => pipes.some(({ pts }) => pts.slice(1).some(([bx, by], k) => {
    const [ax, ay] = pts[k];
    // the pipe's centre line, fattened by its radius, crosses the cell's square
    const lo = (a, b) => Math.min(a, b) - PIPE_R, hi = (a, b) => Math.max(a, b) + PIPE_R;
    return lo(ax, bx) < cx + 1 && hi(ax, bx) > cx && lo(ay, by) < cy + 1 && hi(ay, by) > cy;
  }));
  for (let r = 0; r < BOARD_H; r++) {
    const y = BOARD_H - 1 - r;
    rows[r] = [...rows[r]].map((ch, x) => (ch === 'o' && !covered(x, y) ? '.' : ch)).join('');
  }
  return { map: rows, pipes };
}
export function parseLevel(def) {
  if (!def.sandbox) def = { ...def, ...onBoard(def.map) };
  const h = def.map.length, w = def.map[0].length;
  const L = {
    id: def.id, name: def.name, note: def.note || '', w, h,
    cells: new Array(w * h).fill('empty'), fixed: [], start: null, cups: [], bells: [],
    give: { ...(def.give || {}) }, marbles: def.marbles || 1, par: def.par || 0,
    solution: def.solution || [], sandbox: !!def.sandbox,
    // the walls the marble cannot leave: the frame
    box: { x0: -FRAME, x1: w + FRAME, y0: -FRAME, y1: h + FRAME },
    pipes: def.pipes || [],
  };
  if (L.sandbox) { for (const k of Object.keys(PIECES)) L.give[k] = Infinity; L.marbles = Infinity; }
  for (let row = 0; row < h; row++) {
    const line = def.map[row];
    if (line.length !== w) throw new Error(`${def.id}: row ${row} is ${line.length} wide, not ${w}`);
    for (let x = 0; x < w; x++) {
      const ch = line[x], y = h - 1 - row, i = y * w + x;
      if (ch === '.') continue;
      if (ch === 'x') L.cells[i] = 'nope';
      else if (ch === 'o') L.cells[i] = 'pipe';
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
  if (!L.start && !L.sandbox) throw new Error(`${def.id}: no start`);
  // the feed tube runs up from the hopper to the top of the frame: solid, nothing hangs there
  if (L.start) for (let y = L.start.y + 1; y < h; y++) L.cells[y * w + L.start.x] = 'tube';
  for (const c of L.cups) {
    for (let y = c.y - 1; y >= 0 && ['empty', 'pipe'].includes(L.cells[y * w + c.x]); y--) L.cells[y * w + c.x] = 'stand';
  }
  if (!L.sandbox && L.cups.length < L.marbles) throw new Error(`${def.id}: ${L.marbles} marbles but ${L.cups.length} cups`);
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
      // tip0 / tip1: this segment's ends are the ends of the whole piece
      out.push({ ax, ay, ex, ey, len2: ex * ex + ey * ey || 1e-9, tip0: k === 0, tip1: k + 2 === l.length, ...extra });
    }
  }
  return out;
}

/* Every piece on the board with the lines it has. Each piece keeps its own shape wherever
   it hangs: slopes used to join into one long rail and tilt to meet, which Amber found
   confusing (2026-10-16), so a slope is always the same angle, and a long run is a
   staircase of them. */
export function layout(L, placed) {
  const all = [...L.fixed, ...placed].map((p) => ({ kind: p.kind, x: p.x, y: p.y, flip: !!p.flip, fixed: !!p.fixed }));
  for (const p of all) p.lines = pieceLines(p.kind, p.flip, 0);
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
    piece.state = 0; piece.touched = -1; piece.ringT = 0;
    const def = PIECES[piece.kind], spin = def.spin;
    if (spin) {
      // angle is the lines' own; a flipped piece's lines are mirrored, so it turns the other
      // way. w is how fast it turns as you see it.
      piece.angle = spin === 'kick' ? KICK[piece.kind].rest : 0; piece.sgn = piece.flip ? -1 : 1;
      piece.w = spin === 'motor' ? piece.sgn * MOTOR_W : 0;
      piece.phase = 'rest';
      piece.lines = pieceLines(piece.kind, piece.flip, piece.angle);
    }
    piece.segs = segsOf(piece.lines, piece.x, piece.y, { piece, spring: !!(def.spring || def.kick), kick: def.kick || 0, spin: !!spin, boost: !!def.boost });
    put(piece.x, piece.y, piece.segs);
    W.pieces.push(piece);
  }
  W.spinners = W.pieces.filter((q) => PIECES[q.kind].spin);
  W.crumbles = W.pieces.filter((q) => q.kind === 'crumble');
  for (const q of W.crumbles) { q.crumble = 'solid'; q.timer = 0; }
  // the level's pipes: long, so every marble checks them, not just the ones in its cell
  W.walls = [];
  for (const pp of L.pipes) {
    for (let k = 0; k + 1 < pp.pts.length; k++) {
      const [[ax, ay], [bx, by]] = [pp.pts[k], pp.pts[k + 1]];
      W.walls.push({ ax, ay, ex: bx - ax, ey: by - ay, len2: (bx - ax) ** 2 + (by - ay) ** 2 || 1e-9, t: PIPE_R, mat: 'copper', out: true });
    }
  }
  W.nextSpawn = 0;
  const S = L.start;
  if (S) put(S.x, S.y, segsOf(mirror(FITTINGS.start(), S.flip), S.x, S.y, { mat: 'walnut' }));
  for (const c of L.cups) put(c.x, c.y, segsOf(FITTINGS.cup(), c.x, c.y, { mat: 'brass' }));
  for (let i = 0; i < L.cells.length; i++) {
    if (L.cells[i] === 'stand') put(i % L.w, Math.floor(i / L.w), segsOf(FITTINGS.stand(), i % L.w, Math.floor(i / L.w), { mat: 'copper' }));
    if (L.cells[i] === 'tube') put(i % L.w, Math.floor(i / L.w), segsOf(mirror(FITTINGS.tube(), L.start.flip), i % L.w, Math.floor(i / L.w), { mat: 'glass' }));
  }
  W.feeders = W.pieces.filter((q) => q.kind === 'feeder');
  W.feedTurn = 0;
  {
  }
  for (let i = 0; i < L.cells.length; i++) {
    if (L.cells[i] === 'block') put(i % L.w, Math.floor(i / L.w), segsOf(FITTINGS.block(), i % L.w, Math.floor(i / L.w), { mat: 'walnut' }));
  }
  return W;
}

// Turn a wheel through h seconds and put its paddles where they now are.
function turnWheel(W, piece, h) {
  const spin = PIECES[piece.kind].spin;
  if (spin === 'free') piece.w *= 1 - WHEEL_DRAG * h;
  if (spin === 'seesaw') {
    // rocks back to level, damped, and stops at its limits
    piece.w += (-SEESAW_K * piece.angle - SEESAW_DAMP * piece.w) * h;
  }
  if (spin === 'kick') {
    // flipper and catapult: wait a moment after a marble lands, swing up fast, come back slow
    const K = KICK[piece.kind];
    if (piece.phase === 'wait' && (piece.timer -= h) <= 0) { piece.phase = 'up'; W.emit('kick', { x: piece.x, y: piece.y, kind: piece.kind }); }
    let q = 0;
    if (piece.phase === 'up') { q = K.wUp; if (piece.angle + q * h >= K.up) { piece.angle = K.up; q = 0; piece.phase = 'down'; } }
    else if (piece.phase === 'down') { q = -K.wDown; if (piece.angle + q * h <= K.rest) { piece.angle = K.rest; q = 0; piece.phase = 'rest'; } }
    piece.w = piece.sgn * q;
  }
  piece.angle += piece.sgn * piece.w * h;
  if (spin === 'seesaw' && Math.abs(piece.angle) > SEESAW_MAX) { piece.angle = Math.sign(piece.angle) * SEESAW_MAX; piece.w = 0; }
  const cell = W.grid[piece.y * W.w + piece.x];
  for (const sg of piece.segs) cell.splice(cell.indexOf(sg), 1);
  piece.lines = pieceLines(piece.kind, piece.flip, piece.angle);
  piece.segs = segsOf(piece.lines, piece.x, piece.y, { piece, spin: true });
  cell.push(...piece.segs);
}

// A crumbling ledge: shaking once touched, then gone (its rail out of the grid), then back.
function setLedge(W, piece, there) {
  const cell = W.grid[piece.y * W.w + piece.x];
  for (const sg of piece.segs) { const i = cell.indexOf(sg); if (i >= 0) cell.splice(i, 1); }
  if (there) cell.push(...piece.segs);
}
function crumbleStep(W, p, h) {
  if (p.crumble === 'solid') return;
  if ((p.timer -= h) > 0) return;
  if (p.crumble === 'shake') { p.crumble = 'gone'; p.timer = CRUMBLE_GONE; setLedge(W, p, false); W.emit('crumble', { x: p.x, y: p.y }); }
  else { p.crumble = 'solid'; setLedge(W, p, true); W.emit('mend', { x: p.x, y: p.y }); }
}

function swapToggle(W, piece) {
  const cell = W.grid[piece.y * W.w + piece.x];
  for (const s of piece.segs) cell.splice(cell.indexOf(s), 1);
  piece.state = 1 - piece.state;
  piece.lines = pieceLines(piece.kind, piece.flip, piece.state);
  piece.segs = segsOf(piece.lines, piece.x, piece.y, { piece });
  cell.push(...piece.segs);
}

// Which way a marble release faces: down from the top edge, else in from its side.
export function feederDir(L, f) { return f.y === L.h - 1 ? 'down' : f.x === 0 ? 'right' : 'left'; }
export const onEdge = (L, x, y) => x === 0 || x === L.w - 1 || y === L.h - 1;

function spawn(W) {
  const S = W.L.start;
  let x, y, vx = 0, vy = 0;
  if (S) { x = S.x + (S.flip ? 1 - START_AT[0] : START_AT[0]); y = S.y + START_AT[1]; }
  else {
    // the sandbox: the next marble release in turn
    const f = W.feeders[W.feedTurn++ % W.feeders.length], dir = feederDir(W.L, f);
    if (dir === 'down') { x = f.x + 0.5; y = f.y + 0.75; vy = -0.5; }
    else { x = f.x + (dir === 'right' ? 0.3 : 0.7); y = f.y + 0.5; vx = dir === 'right' ? 1.6 : -1.6; }
  }
  W.marbles.push({
    id: W.spawned, x, y, vx, vy, a: 0, w: 0,
    live: true, home: false, contact: false, still: 0, cell: -1,
  });
  W.spawned++;
  W.emit('spawn', { id: W.spawned - 1 });
}

function collide(W, m) {
  const cx = Math.floor(m.x), cy = Math.floor(m.y);
  const cells = [W.walls];
  for (let gy = cy - 1; gy <= cy + 1; gy++) {
    if (gy < 0 || gy >= W.h) continue;
    for (let gx = cx - 1; gx <= cx + 1; gx++) if (gx >= 0 && gx < W.w) cells.push(W.grid[gy * W.w + gx]);
  }
  {
    {
      for (const cell of cells) for (let k = 0; k < cell.length; k++) {
        const s = cell[k], rr = R + (s.t || T);
        let u = ((m.x - s.ax) * s.ex + (m.y - s.ay) * s.ey) / s.len2;
        u = u < 0 ? 0 : u > 1 ? 1 : u;
        const dx = m.x - (s.ax + s.ex * u), dy = m.y - (s.ay + s.ey * u);
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr || d2 < 1e-14) continue;
        const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
        m.x += nx * (rr - d); m.y += ny * (rr - d);
        if (s.spin) {
          spinHit(W, m, s.piece, m.x - nx * rr, m.y - ny * rr, nx, ny);
          m.contact = true; m.nx = nx; m.ny = ny;
          continue;
        }
        const vn = m.vx * nx + m.vy * ny;
        if (vn < 0) {
          const into = -vn;
          let back;
          if (s.spring) {
            back = Math.max(into * (s.kick ? 1.05 : 0.9), s.kick || SPRING_V);
            W.emit(s.kick ? 'bump' : 'spring', { x: m.x, y: m.y, piece: s.piece });
          }
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
        if (s.out) m.floor = true;
        if (s.piece && s.piece.kind === 'funnel') m.funnel = s.piece;
        if (s.piece && !s.spin) judge(W, m, s, u, nx, ny);
        if (s.piece && s.piece.kind === 'toggle') s.piece.touched = m.id;
        if (s.piece && s.piece.kind === 'crumble' && s.piece.crumble === 'solid') { s.piece.crumble = 'shake'; s.piece.timer = CRUMBLE_SHAKE; }
        if (s.boost) { const l = Math.sqrt(s.len2); m.boost = [s.ex / l, s.ey / l]; }
      }
    }
  }
  // the frame (or a level's own walls) is solid all round: a marble that misses ends up
  // rattling along its bottom
  const B = W.L.box, lo = B.x0 + R, hx = B.x1 - R, hy = B.y1 - R, ly = B.y0 + R;
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
  if (m.y < ly) { wall(0, 1, ly - m.y); m.floor = true; }
}

/* Is the marble using this piece the way it is meant? The game never stops it, but the
   solver only counts runs where every piece was (Amber: "the challenge is placing them in
   the right place and piecing together the path", not clipping a slope's very tip). A
   marble's first touch on a piece must not be its tip's rounded end, and a piece with a
   face (a ramp's top, a turn's inside) must not be met from the other side. */
function judge(W, m, s, u, nx, ny) {
  const p = s.piece, def = PIECES[p.kind];
  const met = m.met || (m.met = new Set());
  if (!met.has(p)) {
    met.add(p);
    if ((u <= 0 && s.tip0) || (u >= 1 && s.tip1)) {
      // at a tip, a touch square on the rail (as when rolling on from a ledge) is fine;
      // one on its rounded end is not
      const l = Math.sqrt(s.len2);
      if (Math.abs(nx * -s.ey / l + ny * s.ex / l) < 0.85) W.misused = true;
    }
  }
  if (def.face === 'up' && ny < -0.2) W.misused = true;
  else if (Array.isArray(def.face)) {
    const fx = p.x + (p.flip ? 1 - def.face[0] : def.face[0]), fy = p.y + def.face[1];
    const side = (x, y) => Math.sign(s.ex * (y - s.ay) - s.ey * (x - s.ax));
    if (side(fx, fy) !== side(m.x, m.y)) W.misused = true;
  }
}

/* A marble against a paddle that is moving: the push is worked out against the paddle's own
   speed where they touch. A free wheel takes the opposite push as a turn of its own (so a
   marble landing on one side sets it spinning); a motor wheel is too strong to be slowed. */
function spinHit(W, m, piece, px, py, nx, ny) {
  const def = PIECES[piece.kind];
  const pv = def.pivot || [0.5, 0.5];
  const rx = px - (piece.x + (piece.flip ? 1 - pv[0] : pv[0])), ry = py - (piece.y + pv[1]);
  const svx = -piece.w * ry, svy = piece.w * rx;
  if (def.spin === 'kick' && piece.phase === 'rest') { piece.phase = 'wait'; piece.timer = KICK[piece.kind].delay; }
  const vn = (m.vx - svx) * nx + (m.vy - svy) * ny;
  if (vn >= 0) return;
  const rn = rx * ny - ry * nx;
  const free = def.spin === 'free' || def.spin === 'seesaw';
  const I = def.spin === 'seesaw' ? SEESAW_I : WHEEL_I;
  const j = -(1 + (def.spin === 'free' ? WHEEL_BOUNCE : 0)) * vn / (free ? 1 + (rn * rn) / I : 1);
  m.vx += nx * j; m.vy += ny * j;
  if (def.spin === 'motor') {
    // the scoop holds it: its slide along the scoop, against the scoop's own speed, is cut
    const vt = -(m.vx - svx) * ny + (m.vy - svy) * nx;
    m.vx -= -ny * vt * MOTOR_GRIP; m.vy -= nx * vt * MOTOR_GRIP;
  }
  if (free) piece.w -= (j * rn) / I;
  if (-vn > 0.9) W.emit('hit', { speed: -vn, x: m.x, y: m.y, mat: 'brass' });
}

// One marble's move through h seconds: gravity, drag, the rails and the frame.
function roll(W, m, h) {
  m.floor = false;
  m.vy -= G * h;
  const sp0 = Math.hypot(m.vx, m.vy);
  const drag = 1 - (m.contact ? ROLL_DRAG + ROLL_DRAG2 * sp0 : AIR_DRAG) * h;
  m.vx *= drag; m.vy *= drag;
  const sp = Math.hypot(m.vx, m.vy);
  if (sp > MAX_V) { m.vx *= MAX_V / sp; m.vy *= MAX_V / sp; }
  m.x += m.vx * h; m.y += m.vy * h;
  m.contact = false;
  m.boost = null;
  collide(W, m);
  if (m.contact) m.w = (m.nx * m.vy - m.ny * m.vx) / R;
  if (m.boost) {
    // a booster pushes it along, downhill, until it is going at BOOST_V
    const along = m.vx * m.boost[0] + m.vy * m.boost[1];
    if (along < BOOST_V) { const dv = Math.min(BOOST_ACC * h, BOOST_V - along); m.vx += m.boost[0] * dv; m.vy += m.boost[1] * dv; }
  }
  m.a += m.w * h;
}

/* Down a spiral: the marble leaves the board's plane and rides the corkscrew round its pole
   (rz is how far in front of its usual plane it is, for the page to draw), then drops out
   of the bottom, slowed. */
function rideSpiral(W, m, h) {
  const r = m.ride;
  r.u = Math.min(1, r.u + h / SPIRAL_T);
  const phi = r.u * SPIRAL_TURNS * Math.PI * 2;
  m.x = r.p.x + 0.5 + Math.sin(phi) * SPIRAL_R * r.dir;
  m.y = r.p.y + 0.86 - 0.72 * r.u;
  m.rz = SPIRAL_R * (1 - Math.cos(phi));
  m.vx = Math.cos(phi) * SPIRAL_R * r.dir * SPIRAL_TURNS * Math.PI * 2 / SPIRAL_T; m.vy = -0.72 / SPIRAL_T;
  m.a += 5 * h; m.contact = true;
  if (r.u >= 1) { m.ride = null; m.rz = 0; m.vx = 0; m.vy = -1.2; W.emit('spiral-out', { x: m.x, y: m.y }); }
}

export function stepWorld(W, dt) {
  if (W.done) return;
  const h = dt / SUB;
  for (let sub = 0; sub < SUB && !W.done; sub++) {
    W.t += h;
    for (const p of W.spinners) turnWheel(W, p, h);
    for (const p of W.crumbles) crumbleStep(W, p, h);
    if (W.L.sandbox) {
      if (W.feeders.length && W.t >= W.nextSpawn && W.marbles.filter((m) => m.live).length < SAND_LIVE) { spawn(W); W.nextSpawn = W.t + SAND_GAP; }
    } else while (W.spawned < W.L.marbles && W.t >= W.spawned * MARBLE_GAP) spawn(W);
    for (const m of W.marbles) {
      if (!m.live) continue;
      if (m.ride) { rideSpiral(W, m, h); continue; }
      roll(W, m, h);
      sense(W, m, h);
    }
    // marbles knock each other, glass on glass
    for (let i = 0; i < W.marbles.length; i++) {
      const a = W.marbles[i]; if (!a.live) continue;
      for (let j = i + 1; j < W.marbles.length; j++) {
        const b = W.marbles[j]; if (!b.live || a.ride || b.ride) continue;
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
    if (!W.done && !W.L.sandbox && W.t > RUN_LIMIT) W.done = 'time';
  }
  // the sandbox takes away the marbles it is done with, so it can run for ever
  if (W.L.sandbox) W.marbles = W.marbles.filter((m) => m.live);
}

// A marble the sandbox is done with: it leaves the board, and the next one can come.
function takeAway(W, m, why) {
  m.live = false;
  W.emit('gone', { id: m.id, x: m.x, y: m.y, why });
}

function sense(W, m, h) {
  const L = W.L;
  if (m.floor) {
    if (L.sandbox) {
      m.floorT = (m.floorT || 0) + h;
      if (m.floorT > SAND_FLOOR) takeAway(W, m, 'floor');
      return;
    }
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
  // A funnel is for going through: a marble that touches one and leaves without coming out of
  // its neck has been bounced off its rim or its outside. The game lets that be, but the
  // solver does not count such a run (Amber found an answer that used a funnel's edge too
  // confusing), so every hint goes through its funnels.
  if (m.funnel) {
    const f = m.funnel, lx = m.x - f.x, ly = m.y - f.y;
    if (lx > 0.27 && lx < 0.73 && ly < 0.3 && ly > -0.2) m.funnel = null;
    else if (Math.abs(m.x - (f.x + 0.5)) > 0.9 || m.y - f.y > 1.6 || ly < -0.2) { W.misused = true; m.funnel = null; }
  }
  for (const p of W.pieces) {
    if (p.kind === 'bucket' && cx === p.x && cy === p.y) {
      const lx = m.x - cx, ly = m.y - cy;
      if (lx > CUP_IN[0] && lx < CUP_IN[1] && ly > CUP_IN[2] && ly < CUP_IN[3]) {
        W.caught++;
        W.emit('cup', { id: m.id, x: cx, y: cy, bucket: true });
        takeAway(W, m, 'bucket');
        return;
      }
    }
    if (p.kind === 'spiral' && cx === p.x && cy === p.y && !m.ride) {
      const lx = m.x - cx, ly = m.y - cy;
      if (lx > 0.18 && lx < 0.82 && ly > 0.6 && m.vy < 0.5) {
        m.ride = { p, u: 0, dir: m.vx < 0 ? -1 : 1 };
        W.emit('spiral', { x: p.x, y: p.y });
        return;
      }
    }
    if (p.kind === 'chime') {
      if (p.ringT > 0) p.ringT -= h;
      else if (cx === p.x && cy === p.y) { p.ringT = CHIME_REST; W.emit('bell', { x: p.x, y: p.y, chime: true }); }
    }
    if (p.touched === m.id && (cx !== p.x || cy !== p.y)) {
      p.touched = -1;
      swapToggle(W, p);
      W.emit('toggle', { x: p.x, y: p.y, state: p.state });
    }
  }
  if (Math.hypot(m.vx, m.vy) < STALL_V) {
    m.still += h;
    if (m.still > STALL_T) {
      if (L.sandbox) takeAway(W, m, 'still');
      else { W.done = 'stuck'; W.emit('stuck', { id: m.id }); }
    }
  } else m.still = 0;
}

// One release, run to its end. What the solver and the tests look at.
export function simulate(L, placed, { limit = RUN_LIMIT } = {}) {
  const W = makeWorld(L, placed);
  while (!W.done && W.t < limit) stepWorld(W, DT);
  return {
    won: W.done === 'won', end: W.done || 'time', t: W.t, caught: W.caught, clean: !W.misused,
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
    if (!store.levels[id]) store.levels[id] = { stars: [false, false, false], layout: [], board: 2 };
    const rec = store.levels[id];
    if (rec.board !== 2) { rec.layout = []; rec.board = 2; }   // hung on a board before they were all 12x10
    return store.levels[id];
  }
  const save = () => {
    recordFor(g.L.id).layout = g.placed.map((p) => [p.kind, p.x, p.y, p.flip ? 1 : 0]);
    store.level = g.idx;
    on('save', store);
  };
  const quietWorld = () => { g.world = makeWorld(g.L, g.placed, () => {}); };

  g.SANDBOX = LEVELS.length;               // the sandbox's place after the levels
  g.load = (i) => {
    i = Math.max(0, Math.min(LEVELS.length, i | 0));
    g.idx = i; g.L = parseLevel(i === LEVELS.length ? SANDBOX : LEVELS[i]);
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
  g.unlocked = (i) => i <= store.reached || i === LEVELS.length;
  // what is left of a piece's pile: high and low slopes share one
  const pool = (kind) => PIECES[kind].pool || kind;
  g.left = (kind) => (g.L.give[pool(kind)] || 0) - g.placed.filter((p) => pool(p.kind) === pool(kind)).length;
  g.at = (x, y) => g.placed.find((p) => p.x === x && p.y === y) || null;
  g.fixedAt = (x, y) => g.L.fixed.find((p) => p.x === x && p.y === y) || null;
  // pieces can be changed while building, and in the sandbox while it runs too (Amber)
  g.canEdit = () => g.mode === 'build' || (g.L.sandbox && g.mode === 'run');
  g.canPlace = (kind, x, y) => g.canEdit() && canHang(g.L, x, y) && !g.at(x, y) && g.left(kind) > 0 && (!PIECES[kind].edge || onEdge(g.L, x, y));

  const edited = () => {
    if (g.L.sandbox && g.mode === 'run') liveWorld(); else { quietWorld(); g.result = null; }
    save(); on('edit', {});
  };
  // A running sandbox, changed: the board is built afresh with the new pieces, and the run
  // carries on in it: the same marbles, time and catches, wheels still turning, toggles
  // still the way they were tipped.
  function liveWorld() {
    const was = g.world;
    const W = makeWorld(g.L, g.placed, (ev, d) => on(ev, d));
    for (const k of ['t', 'spawned', 'nextSpawn', 'caught', 'marbles', 'rung', 'path', 'pathSeen', 'feedTurn']) W[k] = was[k];
    for (const p of W.pieces) {
      const q = was.pieces.find((o) => o.x === p.x && o.y === p.y && o.kind === p.kind && o.flip === p.flip);
      if (!q) continue;
      p.ringT = q.ringT;
      if (p.kind === 'crumble') { p.crumble = q.crumble; p.timer = q.timer; if (q.crumble === 'gone') setLedge(W, p, false); }
      if (PIECES[p.kind].spin) { p.angle = q.angle; p.w = q.w; turnWheel(W, p, 0); }
      if (q.state !== p.state) swapToggle(W, p);
    }
    for (const m of W.marbles) m.cell = -1;
    g.world = W;
  }
  g.place = (kind, x, y, flip = false) => {
    if (!g.canPlace(kind, x, y)) return false;
    g.placed.push({ kind, x, y, flip: !!flip });
    edited(); on('place', { kind, x, y });
    return true;
  };
  g.remove = (x, y) => {
    if (!g.canEdit()) return false;
    const p = g.at(x, y); if (!p) return false;
    g.placed.splice(g.placed.indexOf(p), 1);
    edited(); on('remove', { kind: p.kind, x, y });
    return true;
  };
  g.flip = (x, y) => {
    if (!g.canEdit()) return false;
    const p = g.at(x, y); if (!p || PIECES[p.kind].sym) return false;
    p.flip = !p.flip;
    edited(); on('flip', { x, y });
    return true;
  };
  g.move = (x0, y0, x1, y1) => {
    if (!g.canEdit()) return false;
    const p = g.at(x0, y0);
    if (!p || (x0 === x1 && y0 === y1) || !canHang(g.L, x1, y1) || g.at(x1, y1)) return false;
    if (PIECES[p.kind].edge && !onEdge(g.L, x1, y1)) return false;
    p.x = x1; p.y = y1;
    edited(); on('move', { x0, y0, x1, y1 });
    return true;
  };
  g.clear = () => {
    if (!g.canEdit() || !g.placed.length) return false;
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
