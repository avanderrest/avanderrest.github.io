/* Same seed, same waves: what the #seed= link promises.

   Two keeps on one seed, built differently and with different dice handed in, still meet
   the same spawn order in wave 3 and the same chronicle line for a wave played on the same
   board. A different seed brings a different order. The seed is kept in the save, a saved
   keep's own seed wins over one passed in, and New keep without a seed rolls a new one. */
import { createGame, W } from '../../hollowmarch/sim.js';
import { mulberry32 } from '../../lib/rng.js';

const order = (g) => g.sim.queue.map((q) => q.type).join(',');
function playTo(g, n) { while (g.state.wave < n) { g.startWave(); while (g.sim) g.step(1); } }
function village(g, spots) { g.state.gold = 2000; for (const [x, y, t] of spots) g.place(y * W + x, t); }
const A = [[6, 6, 'tower'], [5, 7, 'tower'], [1, 4, 'farm'], [2, 4, 'well']];
const B = [[6, 6, 'tower'], [1, 4, 'farm'], [4, 6, 'wall'], [5, 5, 'barracks'], [2, 5, 'tower']];

export default function () {
  const bad = [], out = [];
  const a = createGame({ seed: 777, rnd: mulberry32(1) });
  const b = createGame({ seed: 777, rnd: mulberry32(2) });
  village(a, A); village(b, B);
  playTo(a, 3); playTo(b, 3);
  a.startWave(); b.startWave();
  out.push(`wave 3 on 777: ${order(a).slice(0, 60)}…`);
  if (order(a) !== order(b)) bad.push('the same seed brought different wave 3s after different builds');

  const c = createGame({ seed: 778, rnd: mulberry32(1) });
  village(c, A); playTo(c, 3); c.startWave();
  if (order(c) === order(a)) bad.push('seeds 777 and 778 brought the same wave 3');

  // the same board, the same seed: the whole night plays out the same, chronicle and all
  const d = createGame({ seed: 5, rnd: mulberry32(10) }), e = createGame({ seed: 5, rnd: mulberry32(20) });
  village(d, A); village(e, A);
  playTo(d, 2); playTo(e, 2);
  const ld = JSON.stringify(d.state.log), le = JSON.stringify(e.state.log);
  out.push(`wave 1 chronicle: ${d.state.log.length} entr${d.state.log.length === 1 ? 'y' : 'ies'}`);
  if (ld !== le || JSON.stringify(d.state.grid) !== JSON.stringify(e.state.grid)) bad.push('the same board and seed played wave 1 differently');

  const saved = JSON.parse(JSON.stringify(a.serialize()));
  if (saved.seed !== 777) bad.push(`the save holds seed ${saved.seed}`);
  const f = createGame({ saved, seed: 999 });
  if (f.state.seed !== 777) bad.push('a seed passed in overrode the saved keep\'s own');
  const old = JSON.parse(JSON.stringify(saved)); delete old.seed;
  if (createGame({ saved: old, seed: 42 }).state.seed !== 42) bad.push('an old save without a seed did not take the one given');
  f.newGame(31337);
  if (f.state.seed !== 31337 || f.state.wave !== 1) bad.push('New keep on a seed did not take it');
  f.newGame();
  out.push(`New keep without one rolled ${f.state.seed}`);
  if (f.state.seed == null || f.state.seed === 31337) bad.push('New keep without a seed kept the old one');
  if (createGame({ rnd: mulberry32(3) }).state.seed != null) bad.push('a keep made with no seed has one');

  return { pass: !bad.length, detail: (bad.length ? bad.join(' | ') + ' -- ' : '') + out.join(' · ') };
}
