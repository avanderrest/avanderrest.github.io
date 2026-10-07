/* A cafe run by Sam pays its way, day after day.

   A bot runs ten days of the real cafe in Node. It starts with what it takes to hire Sam
   (a player who saved up for the helper), lays every machine out along the back wall, the
   bin by the front, and then stands still: Sam starts the orders, collects what is ready
   and runs it to the counter, so a day is the helper's AI, the queue, the machines and
   the money together. Between days it spends the takings in the shop, Sam's skates first,
   then patience, speed and capacity, and lays out whatever new kit has arrived.

   Two cafes, different dice. Each has to reach day six inside ten shifts (a shift ends
   early on three walkouts, and a day that ends early is played again) and finish with
   money in the bank. What this guards is the economy end to end: orders the cafe can make,
   a helper who keeps up with the queue the days bring, and kit that pays for itself. */
import { createCafe, freshSave, UPGRADES, COLS } from '../../coffee-rush/sim.js';
import { mulberry32 } from '../../lib/rng.js';

const SHIFTS = 10;
const WANT = ['helper', 'seating', 'turbo', 'espresso', 'cookieOvens', 'tables', 'tips', 'milkbar', 'brownieOvens', 'tray', 'soupkettle', 'breadOvens', 'shoes'];

function run(seed) {
  const save = freshSave();
  let over = null;
  const cr = createCafe({ save, best: 0, rnd: mulberry32(seed), on: (ev, d) => { if (ev === 'shift-over') over = d; } });
  save.bank = 250;
  cr.buyUpgrade(UPGRADES.find((u) => u.id === 'helper'));
  const days = [];
  for (let shift = 0; shift < SHIFTS; shift++) {
    // everything along the back wall, left to right; the bin by the front
    save.layout = {};
    let c = 7;
    for (const m of cr.machineList()) {
      if (m.type === 'bin') { save.layout[m.id] = [COLS - 1, 10]; continue; }
      const w = cr.machineSize(m.type).w;
      if (c + w <= COLS) { save.layout[m.id] = [c, 4]; c += w; }
    }
    cr.reset();
    cr.S.running = true;
    over = null;
    let guard = 0;
    while (!over && guard++ < 30 * 200) cr.update(1 / 30);
    days.push({ day: over ? over.completedDay : save.day, ok: !!(over && over.closedOnTime), served: cr.S.served, coins: cr.S.coins, out: cr.S.strikes, unplaced: cr.UNPLACED.length });
    // the shop: the first thing on the list it can afford, as many times as it can
    for (let bought = true; bought;) {
      bought = false;
      for (const id of WANT) {
        const u = cr.shopUpgrades().find((x) => x.id === id);
        if (u && cr.buyUpgrade(u) === 'ok') { bought = true; break; }
      }
    }
  }
  return { seed, reached: save.day, bank: save.bank, days, ups: Object.entries(save.upgrades).filter(([, l]) => l).map(([k, l]) => `${k} ${l}`).join(', ') };
}

export default function () {
  const runs = [1, 2].map((s) => run(s));
  const problems = [];
  for (const r of runs) {
    if (r.reached < 6) problems.push(`seed ${r.seed}: only reached day ${r.reached} in ${SHIFTS} shifts`);
    if (r.bank <= 0) problems.push(`seed ${r.seed}: nothing in the bank`);
  }
  return {
    pass: !problems.length,
    detail: (problems.length ? problems.join(' | ') + ' -- ' : '') + runs.map((r) =>
      `seed ${r.seed}: day ${r.reached} after ${SHIFTS} shifts, bank ${r.bank} [` +
      r.days.map((d) => `d${d.day}${d.ok ? '' : '✗'} ${d.served}/${d.out}`).join(' ') + `] kit: ${r.ups}`).join('; '),
  };
}
