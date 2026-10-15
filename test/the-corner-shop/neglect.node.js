/* A keeper who never comes back to the till loses everyone at it, and nothing else.

   The shop opens with full shelves and the keeper walks off to the stockroom and stays
   there. Everyone who reaches the counter waits out their patience and walks out, and
   whatever they had picked up has to go back: on its shelf if there is room, in the
   stockroom if not. So at closing no unit of stock has gone missing, nobody has paid,
   the queue never jams the day open, and reputation has fallen.

   Then the same day with a keeper who stays behind the till, to show the walkouts were
   the neglect and not the patience numbers. */
import { createShop } from '../../the-corner-shop/sim.js';
import { mulberry32 } from '../../lib/rng.js';
import { stockUp, STARTER } from './_hands.mjs';

const units = (s) => Object.values(s.room).reduce((a, bs) => a + bs.reduce((x, b) => x + b.q, 0), 0) +
  s.stock.reduce((a, q) => a + q, 0) + (s.carry ? s.carry.q : 0);

function day(seed, serve) {
  const shop = createShop({ rnd: mulberry32(seed) });
  const S = () => shop.state;
  const order = {};
  for (const pid of S().slots.some(Boolean) ? S().slots.filter(Boolean) : STARTER) order[pid] = 1;
  shop.confirmOrder(order);
  stockUp(shop);
  const before = units(S());
  const rep0 = S().rep;
  shop.openShop();
  if (serve) shop.goTill(); else shop.goRoom();
  let t = 0;
  while (S().phase === 'open' && t < 600) {
    const d = shop.day, c = d && d.till;
    if (serve && c) {
      if (c.state === 'till') { for (const it of d.belt.slice()) shop.scanItem(it.uid); for (const it of d.belt.slice()) shop.bagItem(it.uid); }
      if (c.state === 'paying') for (const m of d.coins.slice()) shop.takeCoin(m.uid);
    }
    shop.tick(0.05);
    t += 0.05;
  }
  const td = S().today;
  const binned = td.binned.reduce((a, b) => a + b.q, 0);   // papers and the like go in the bin at five
  return { phase: S().phase, t, walked: td.walked, served: td.served, takings: td.takings, before, after: units(S()) + binned, binned, rep0, rep: S().rep };
}

export default function () {
  const problems = [];
  const n = day(4, false);
  const s = day(4, true);
  if (n.phase !== 'evening') problems.push(`the neglected day never closed (${n.phase} after ${n.t.toFixed(0)}s)`);
  if (n.served || n.takings) problems.push(`with nobody at the till, ${n.served} were still served for £${n.takings}`);
  if (!n.walked) problems.push('nobody walked out of an unattended till');
  if (n.after !== n.before) problems.push(`stock went missing in the walkouts: ${n.before} -> ${n.after}`);
  if (n.rep >= n.rep0) problems.push(`reputation did not fall (${n.rep0} -> ${n.rep.toFixed(1)})`);
  if (s.walked) problems.push(`${s.walked} walked out on a keeper who stayed at the till`);
  return {
    pass: !problems.length,
    detail: (problems.length ? problems.join(' | ') + ' -- ' : '') +
      `unattended: ${n.walked} walked out, stock ${n.before} -> ${n.after} (counting ${n.binned} binned at closing), reputation ${n.rep0} -> ${n.rep.toFixed(1)}, closed after ${n.t.toFixed(0)}s; ` +
      `attended: ${s.served} served, ${s.walked} walked out, £${s.takings.toFixed(2)} taken`,
  };
}
