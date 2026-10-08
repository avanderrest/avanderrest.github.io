/* Belts fork and merge on their own, and the shop is the hatch in the right-hand wall.

   Since 2026-10-08 there is no splitter or joiner: a belt that leads away off the side of
   another belt is a fork, and the hatch at the floor's right-hand edge sells whatever a
   belt runs into it. A boxing station (the old counter) sells the same from anywhere; it
   only costs its price to place. This checks each of those through the real sim:

   1. A line run off the right-hand edge at the hatch's rows sells, at full price, and the
      same line run off the edge anywhere else jams with 'edge'.
   2. A fork deals donuts out fairly: each way gets a good share, and nothing jams.
   3. A boxing station pays the same as the hatch for the same donut.
   4. An old save with a splitter and a joiner on the floor loads them as belts facing the
      same way, refunds part of their price, and drops them from the build list. */
import { createFactory, HATCH_ROWS, COLS } from '../../donut-works/sim.js';
import { mulberry32 } from '../../lib/rng.js';

export default function () {
  const problems = [];
  const notes = [];

  // 1. a raw-dough line straight into the hatch, and one into the wall beside it
  const runTo = (row) => {
    const sales = [];
    const f = createFactory({ rnd: mulberry32(1), on: (ev, d) => { if (ev === 'sale') sales.push(d); } });
    f.cash = 100000;
    f.placeMachine(COLS - 4, row, 'mixer', 0);
    for (let c = COLS - 3; c < COLS; c++) f.placeBelt(c, row, 0);
    f.step(30);
    return { f, sales };
  };
  const hatch = runTo(HATCH_ROWS[0]);
  if (hatch.sales.length < 5) problems.push(`the hatch sold ${hatch.sales.length} in 30s`);
  else if (hatch.sales.some((s) => s.boxed)) problems.push('a hatch sale was charged for a box');
  const wall = runTo(0);
  if (wall.sales.length) problems.push(`running off the floor at row 0 sold ${wall.sales.length}`);
  else if (wall.f.tileStuck(COLS - 1, 0) !== 'edge') problems.push(`the belt into the wall says ${wall.f.tileStuck(COLS - 1, 0)}, not 'edge'`);
  notes.push(`hatch sold ${hatch.sales.length} raw at ${hatch.sales[0] && hatch.sales[0].total}p`);

  // 2. a fork: one belt with branches off both sides, each to its own boxing station
  {
    const sales = [];
    const f = createFactory({ rnd: mulberry32(2), on: (ev, d) => { if (ev === 'sale') sales.push(d); } });
    f.cash = 100000;
    f.placeMachine(0, 3, 'mixer', 0); f.placeMachine(1, 3, 'mixer', 0);
    f.placeBelt(2, 3, 0); f.placeBelt(3, 3, 0);
    f.placeBelt(3, 2, 3); f.placeBelt(3, 4, 1);              // branches off either side
    f.placeMachine(4, 3, 'counter', 0); f.placeMachine(3, 1, 'counter', 0); f.placeMachine(3, 5, 'counter', 0);
    const fk = f.forkAt(3, 3);
    if (!fk || fk.outs.length !== 2 || !fk.ahead) problems.push(`(3,3) is not a three-way fork: ${JSON.stringify(fk)}`);
    f.step(120);
    const by = { ahead: 0, up: 0, down: 0 };
    for (const s of sales) { if (s.r === 3) by.ahead++; else if (s.r === 1) by.up++; else if (s.r === 5) by.down++; }
    const n = sales.length;
    if (n < 30) problems.push(`the fork only passed ${n} in 120s`);
    for (const [k, v] of Object.entries(by)) if (v < n * 0.2) problems.push(`the fork starved ${k}: ${JSON.stringify(by)}`);
    for (const [c, r] of [[2, 3], [3, 3], [3, 2], [3, 4]]) if (f.tileStuck(c, r)) problems.push(`(${c},${r}) jammed: ${f.tileStuck(c, r)}`);
    notes.push(`fork split ${by.ahead}/${by.up}/${by.down}`);

    // 3. a boxing station pays what the hatch does
    const boxed = sales[0];
    if (!boxed || !boxed.boxed) problems.push('a boxing-station sale was not marked boxed');
    else if (hatch.sales[0] && boxed.total !== hatch.sales[0].total) problems.push(`boxed raw dough paid ${boxed.total}p against ${hatch.sales[0].total}p at the hatch`);
  }

  // 2b. the shape in Amber's screenshot: a line down onto a belt with a belt off each side,
  // each of those then turning down. With nothing straight ahead of them, the side belts are
  // corners: everything that comes onto them curves round, none of it straight on.
  {
    const sales = [];
    const f = createFactory({ rnd: mulberry32(4), on: (ev, d) => { if (ev === 'sale') sales.push(d); } });
    f.cash = 100000;
    f.placeMachine(5, 0, 'mixer', 1);
    f.placeBelt(5, 1, 1); f.placeBelt(4, 1, 2); f.placeBelt(6, 1, 0);     // fork: on down, and off left and right
    f.placeBelt(5, 2, 1); f.placeBelt(4, 2, 1); f.placeBelt(6, 2, 1);
    f.placeMachine(5, 3, 'counter', 0); f.placeMachine(4, 3, 'counter', 0); f.placeMachine(6, 3, 'counter', 0);
    const mid = f.forkAt(5, 1), left = f.forkAt(4, 1), right = f.forkAt(6, 1);
    if (!mid || !mid.ahead || mid.outs.length !== 2) problems.push(`the middle is not a three-way fork: ${JSON.stringify(mid)}`);
    for (const [k, v] of [['left', left], ['right', right]]) if (!v || v.ahead || v.outs.length !== 1) problems.push(`the ${k} belt is not a corner: ${JSON.stringify(v)}`);
    f.step(90);
    const by = [4, 5, 6].map((c) => sales.filter((s) => s.c === c).length);
    if (by.some((n) => n < 4)) problems.push(`the three lines sold ${by.join('/')}`);
    for (const [c, r] of [[5, 1], [4, 1], [6, 1]]) if (f.tileStuck(c, r)) problems.push(`(${c},${r}) jammed: ${f.tileStuck(c, r)}`);
    notes.push(`corners off a fork sold ${by.join('/')}`);
  }

  // 2c. her next screenshot: the same Y, carried down both sides and curved back into one
  // belt from both sides with nothing behind it. That belt is a merge, both lines curve into
  // it, and everything reaches the counter below.
  {
    const sales = [];
    const f = createFactory({ rnd: mulberry32(5), on: (ev, d) => { if (ev === 'sale') sales.push(d); } });
    f.cash = 100000;
    f.placeMachine(5, 0, 'mixer', 1);
    f.placeBelt(5, 1, 1); f.placeBelt(4, 1, 2); f.placeBelt(6, 1, 0);
    f.placeBelt(4, 2, 1); f.placeBelt(6, 2, 1);
    f.placeBelt(4, 3, 0); f.placeBelt(6, 3, 2); f.placeBelt(5, 3, 1);
    f.placeMachine(5, 4, 'counter', 0);
    const m = f.mergeAt(5, 3);
    if (!m || m.behind || m.ins.length !== 2) problems.push(`(5,3) is not a two-sided merge: ${JSON.stringify(m)}`);
    const y = f.forkAt(5, 1);
    if (!y || y.ahead || y.outs.length !== 2) problems.push(`(5,1) is not a Y: ${JSON.stringify(y)}`);
    f.step(60);
    if (sales.length < 15) problems.push(`the loop back into one belt sold ${sales.length} in 60s`);
    for (const [c, r] of [[5, 1], [4, 3], [6, 3], [5, 3]]) if (f.tileStuck(c, r)) problems.push(`(${c},${r}) jammed: ${f.tileStuck(c, r)}`);
    const sh = f.shapeIf(5, 3, 1);
    if (!sh.merge) problems.push(`the ghost for (5,3) would not show a merge: ${JSON.stringify(sh)}`);
    notes.push(`Y and merge sold ${sales.length}`);
  }

  // 2d. the ghosts beside the pointer: a belt about to go down off the side of a line's last
  // belt turns that belt into a corner, and the preview says so; one going down straight on
  // from the end changes nothing beside it.
  {
    const f = createFactory({ rnd: mulberry32(6) });
    f.cash = 100000;
    f.placeBelt(4, 5, 0); f.placeBelt(5, 5, 0);
    const turn = f.shapesAround(5, 6, { kind: 'belt', dir: 1, items: [] });
    const end = turn.find((n) => n.c === 5 && n.r === 5);
    if (!end || !end.shape.fork || end.shape.fork.ahead) problems.push(`a belt off the side of the end did not preview a corner: ${JSON.stringify(turn)}`);
    const on = f.shapesAround(6, 5, { kind: 'belt', dir: 0, items: [] });
    if (on.length) problems.push(`carrying straight on previewed changes: ${JSON.stringify(on)}`);
    if (f.grid[6][5] || f.grid[5][6]) problems.push('previewing left something on the floor');
  }

  // 2e. taking back the belt after a corner: dragging round a corner turns the corner tile
  // to face down, so without help it would stay a corner turning into nothing. It goes back
  // to straight, along the line. Replacing that belt with a machine leaves it pointing there.
  {
    const f = createFactory({ rnd: mulberry32(7) });
    f.cash = 100000;
    f.placeBelt(2, 2, 0); f.placeBelt(3, 2, 0); f.placeBelt(4, 2, 1); f.placeBelt(4, 3, 1);
    if (f.bendAt(4, 2) == null) problems.push('(4,2) was not a corner to start with');
    f.removeTile(4, 3);
    if (f.grid[2][4].dir !== 0 || f.bendAt(4, 2) != null) problems.push(`after taking back (4,3) the corner is dir ${f.grid[2][4].dir}, bend ${f.bendAt(4, 2)}`);
    f.placeBelt(4, 2, 1); f.placeBelt(4, 3, 1);
    f.placeMachine(4, 3, 'bin', 0);
    if (f.grid[2][4].dir !== 1) problems.push(`replacing (4,3) with a bin turned the corner to ${f.grid[2][4].dir}`);
  }

  // 4. an old save with a splitter and a joiner
  {
    const saved = {
      tiles: [{ c: 2, r: 2, k: 'm', t: 'splitter', d: 1 }, { c: 5, r: 5, k: 'm', t: 'joiner', d: 0 }],
      cash: 1000, level: 2, sold: 0, binned: 0, simTime: 0, goals: [], discovered: [], special: null,
      unlocked: { machines: ['mixer', 'press', 'fryer', 'splitter', 'joiner', 'counter', 'bin', 'glazer'], glazes: [], tops: [], fillings: [], batches: ['dough'] },
    };
    const f = createFactory({ saved });
    const a = f.grid[2][2], b = f.grid[5][5];
    if (!a || a.kind !== 'belt' || a.dir !== 1) problems.push(`the old splitter came back as ${JSON.stringify(a)}`);
    if (!b || b.kind !== 'belt' || b.dir !== 0) problems.push(`the old joiner came back as ${JSON.stringify(b)}`);
    if (f.cash <= 1000) problems.push(`no refund for the old splitter and joiner: ${f.cash}p`);
    if (f.unlocked.machines.some((m) => m === 'splitter' || m === 'joiner')) problems.push(`still in the build list: ${f.unlocked.machines}`);
    notes.push(`old save refunded ${f.cash - 1000}p`);
  }

  return { pass: !problems.length, detail: problems.length ? problems.join(' | ') : notes.join('; ') };
}
