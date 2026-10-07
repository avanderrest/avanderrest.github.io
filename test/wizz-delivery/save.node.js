/* A shift starts clean, ends once, and stands still when paused.

   Wizz Delivery saves no run, only the best shift and the tallies (the page does that when
   a shift ends), so what has to hold is the shift itself. In Node: a shift left to run
   ends exactly once, at five minutes, with 'Shift over'; a new shift puts the float back,
   empties the bag, zeroes the tallies and parks the car at the start; and while paused the
   shift's clock does not move, so neither does any order's deadline (they used to run off
   the wall clock and be patched up on the way out of a pause). */
import { createWizz } from '../../wizz-delivery/sim.js';
import { mulberry32 } from '../../lib/rng.js';

export default function () {
  const problems = [];
  const ends = [];
  const wz = createWizz({ rnd: mulberry32(4), on: (ev, d) => { if (ev === 'shift-over') ends.push(d); } });
  const { G, ST, bag, car, START, REST } = wz;
  wz.startShift();
  const float = G.money;

  // take an order, then pause for "a minute" of steps: nothing may move
  const o = REST.flatMap((r) => r.offers)[0];
  wz.acceptOffer(o);
  wz.setPaused(true);
  const ms = G.ms, left = G.shiftLeft, expiry = REST.flatMap((r) => r.offers).map((x) => x.expiry).join();
  for (let i = 0; i < 1800; i++) wz.step(1 / 30);
  if (G.ms !== ms || G.shiftLeft !== left) problems.push('the clock ran while paused');
  if (REST.flatMap((r) => r.offers).map((x) => x.expiry).join() !== expiry) problems.push('offer deadlines moved while paused');
  wz.setPaused(false);

  // run the shift out
  for (let i = 0; i < 30 * 320 && !G.over; i++) wz.step(1 / 30);
  for (let i = 0; i < 60; i++) wz.step(1 / 30);
  if (ends.length !== 1) problems.push(`the shift ended ${ends.length} times`);
  if (ends[0] !== 'Shift over') problems.push(`it ended with "${ends[0]}"`);
  if (Math.abs(G.ms / 1000 - 300) > 0.5) problems.push(`it ended at ${(G.ms / 1000).toFixed(1)} s`);

  // and a new one starts clean
  ST.done = 3; ST.fine = 9; car.x += 5;
  wz.startShift();
  if (G.money !== float || G.earned !== 0 || G.over || G.tracked !== null) problems.push('a new shift kept money or state from the last');
  if (bag.length || ST.done || ST.fine) problems.push('a new shift kept the bag or the tallies');
  if (car.x !== START.x || car.y !== START.y) problems.push('a new shift did not park the car at the start');

  return {
    pass: !problems.length,
    detail: (problems.length ? problems.join(' | ') + ' -- ' : '') + `ended once at ${(300).toFixed(0)} s; the pause held the clock and ${REST.flatMap((r) => r.offers).length} deadlines; the next shift started from £${float.toFixed(2)}`,
  };
}
