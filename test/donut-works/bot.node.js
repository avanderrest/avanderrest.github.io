/* The first six orders can be filled by one line, rebuilt as a player would.

   A bot plays the real factory in Node: the four-machine line from the first order's hint,
   then a glazer dropped over a belt, a topper for Party Rings, the same line switched
   between pink-and-sprinkles and chocolate-and-chips for Two Lines, a filler for the jam
   order, and the counter moved one along to make room for the Full English's topper. Every
   change goes through the same placement rules as a click (cost, counters together,
   placing over a tile replaces it). Each order has to fill within ten simulated minutes
   and the cash has to stay above the point where the mixer stops.

   This is the long version of line.js: what it catches is an order that the unlocks before
   it cannot actually make, or a price that strands the player below the flour line. */
import { createFactory, CASH_FLOOR } from '../../donut-works/sim.js';
import { mulberry32 } from '../../lib/rng.js';

export default function () {
  const f = createFactory({ rnd: mulberry32(7) });
  const R = 3;
  const problems = [], times = [];
  let low = Infinity, clock = 0;
  const run = (level, cap = 600) => {
    let t = 0;
    while (f.level < level && t < cap) { f.step(1); t++; low = Math.min(low, f.cash); }
    clock += t;
    times.push(`${level}:${t}s`);
    if (f.level < level) problems.push(`order ${level} (${f.goals.map((g) => `${g.label} ${g.count}/${g.n}`).join(', ')}) not filled in ${cap}s`);
    return f.level >= level;
  };
  const cfg = (c, kind) => f.setCfg(c, R, kind);

  // order 1: plain donuts
  const ok = [
    f.placeMachine(0, R, 'mixer', 0), f.placeBelt(1, R, 0), f.placeMachine(2, R, 'press', 0), f.placeBelt(3, R, 0),
    f.placeMachine(4, R, 'fryer', 0), f.placeBelt(5, R, 0), f.placeBelt(6, R, 0), f.placeMachine(7, R, 'counter', 0),
  ];
  if (!ok.every(Boolean)) return { pass: false, detail: `could not build the first line: ${ok.join(',')}` };
  let going = run(1);
  // order 2: glazed
  if (going) { f.placeMachine(6, R, 'glazer', 0); going = run(2); }
  // order 3: Party Rings, pink and sprinkles
  if (going) { f.placeMachine(5, R, 'topper', 0); cfg(5, 'sprinkles'); cfg(6, 'pink'); going = run(3); }
  // order 4: Party Rings then Double Chocs off the same line
  if (going) {
    let t = 0;
    while (f.goals[0].count < f.goals[0].n && t < 600) { f.step(1); t++; }
    cfg(5, 'chocchips'); cfg(6, 'choc');
    going = run(4);
  }
  // order 5: Classic Jam, sugar glaze and jam, nothing on top
  if (going) { f.placeMachine(5, R, 'filler', 0); cfg(5, 'jam'); cfg(6, 'sugar'); going = run(5); }
  // order 6: the Full English; the counter moves one along to make room for a topper
  if (going) {
    const moved = f.placeMachine(8, R, 'counter', 0) && f.placeMachine(7, R, 'topper', 0);
    if (!moved) problems.push(`could not make room for a topper on ${f.cash}p`);
    cfg(5, 'beans'); cfg(6, 'maple'); cfg(7, 'bacon');
    going = run(6);
  }
  if (low <= CASH_FLOOR) problems.push(`cash fell to ${low}p, where the mixer stops`);
  return {
    pass: !problems.length,
    detail: (problems.length ? problems.join(' | ') + ' -- ' : '') +
      `orders filled at ${times.join(' ')}; ${f.sold} sold, ${f.discovered.size} recipes found, lowest cash ${low}p, ${Math.round(clock / 60)} simulated minutes`,
  };
}
