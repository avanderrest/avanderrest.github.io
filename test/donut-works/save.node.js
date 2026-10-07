/* A saved factory comes back as it was and gets straight back to work.

   Builds a line, runs it past the first order so there are goals, unlocks, a recipe and a
   tuned-up machine to remember, then saves through JSON the way localStorage does and loads
   the copy into a fresh factory. The floor, the cash, the order and every machine's setting
   have to match, and the reloaded line has to sell again within a minute.

   Donuts in flight on the belts are deliberately not saved (the line refills in seconds),
   so this compares what the save is meant to hold, not the belts' contents. */
import { createFactory } from '../../donut-works/sim.js';
import { mulberry32 } from '../../lib/rng.js';

export default function () {
  const a = createFactory({ rnd: mulberry32(3) });
  const R = 3;
  [a.placeMachine(0, R, 'mixer', 0), a.placeBelt(1, R, 0), a.placeMachine(2, R, 'press', 0), a.placeBelt(3, R, 0),
    a.placeMachine(4, R, 'fryer', 0), a.placeBelt(5, R, 0), a.placeBelt(6, R, 0), a.placeMachine(7, R, 'counter', 0)];
  for (let t = 0; t < 300 && a.level < 1; t++) a.step(1);
  a.placeMachine(6, R, 'glazer', 0);
  a.setCfg(6, R, 'pink');
  a.upgrade(a.grid[R][4]);
  for (let t = 0; t < 40; t++) a.step(1);

  const saved = JSON.parse(JSON.stringify(a.serialize()));
  const b = createFactory({ saved });
  const problems = [];
  const same = JSON.stringify(b.serialize()) === JSON.stringify(a.serialize());
  if (!same) problems.push('the reloaded factory does not save back to the same thing');
  if (b.grid[R][6].cfg !== 'pink') problems.push(`the glazer came back set to ${b.grid[R][6].cfg}`);
  if (b.grid[R][4].lvl !== 1) problems.push(`the tuned fryer came back at level ${b.grid[R][4].lvl}`);
  const sold0 = b.sold;
  let t = 0;
  while (b.sold === sold0 && t < 60) { b.step(1); t++; }
  if (b.sold === sold0) problems.push('the reloaded line sold nothing in a minute');
  return {
    pass: !problems.length,
    detail: (problems.length ? problems.join(' | ') + ' -- ' : '') +
      `saved on order ${saved.level + 1} with ${saved.tiles.length} tiles, ${saved.cash}p and ${saved.discovered.length} recipe(s); reloaded line sold again after ${t}s`,
  };
}
