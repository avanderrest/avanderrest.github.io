/* A sensible shopkeeper keeps the shop open for a fortnight and ends up ahead.

   A bot runs the real shop in Node with seeded dice: every evening it orders enough boxes
   to cover what sold today plus a little (fresh things only as much as one day needs), puts
   the stock out in the morning, opens, and works the till perfectly, restocking a shelf
   between customers when it runs low. Fourteen days, three seeds. The shop must never be
   locked out, the cash has to end above where it started, and every day has to close on
   its own.

   What this guards is the economy as a whole: prices against wholesale costs, rent, the
   overnight bin and the number of customers a day. A change to any of them can make a
   well-run shop lose money every week without anything on screen looking wrong. */
import { createShop, PRODUCTS, prod, START_CASH } from '../../the-corner-shop/sim.js';
import { mulberry32 } from '../../lib/rng.js';

function run(seed) {
  const shop = createShop({ rnd: mulberry32(seed) });
  const S = () => shop.state;
  const days = [];
  let stuck = null;
  for (let d = 0; d < 14 && !stuck; d++) {
    // order: what sold yesterday (or a box of everything on day one), more for long-life goods
    const order = {};
    for (const pid of S().slots.filter(Boolean)) {
      const p = prod(pid);
      const sold = S().report ? S().report.stats[pid].bought : p.box;
      const have = shop.roomQty(pid) + S().shelf[pid];
      const want = Math.max(0, Math.ceil((sold * (p.life === 1 ? 1 : 1.3) - have) / p.box));
      if (want) order[pid] = Math.min(3, want);
    }
    if (Object.keys(order).length) {
      const total = shop.orderTotal(order);
      if (S().cash >= total.cost + total.fee) shop.confirmOrder(order);
    }
    if (S().phase === 'closed') shop.fillAll();
    // nothing to sell is a day lost, not a stuck game: morning() comes round all the same
    if (!shop.openShop().ok) days.push('shut');
    let t = 0;
    while (S().phase === 'open' && t < 400) {
      const day = shop.day;
      const c = day && day.till;
      if (c && c.state === 'till') {
        for (const it of day.belt.slice()) shop.scanItem(it.uid);
        for (const it of day.belt.slice()) shop.bagItem(it.uid);
      }
      if (c && c.state === 'paying') for (const m of day.coins.slice()) shop.takeCoin(m.uid);
      // restock the emptiest shelf when nobody is at the till
      if (day && !day.till && !(day.away > 0)) {
        const low = S().slots.filter((pid) => pid && S().shelf[pid] < prod(pid).cap / 2 && shop.roomQty(pid) > 0)[0];
        if (low) shop.restock(low);
      }
      shop.tick(0.1);
      t += 0.1;
    }
    if (S().phase === 'open') { stuck = `day ${S().day} never closed`; break; }
    if (S().phase === 'evening') days.push(Math.round((S().days[S().days.length - 1] || { profit: 0 }).profit * 100) / 100);
    shop.morning();
    if (S().phase === 'over') { stuck = `locked out on day ${S().day}`; break; }
  }
  return { seed, cash: Math.round(S().cash * 100) / 100, rep: Math.round(S().rep), days, stuck, sold: S().sold };
}

export default function () {
  const runs = [1, 2, 3].map(run);
  const problems = [];
  for (const r of runs) {
    if (r.stuck) problems.push(`seed ${r.seed}: ${r.stuck}`);
    else if (r.cash <= START_CASH) problems.push(`seed ${r.seed}: a fortnight of careful trading left £${r.cash} from £${START_CASH}`);
  }
  return {
    pass: !problems.length,
    detail: (problems.length ? problems.join(' | ') + ' -- ' : '') +
      runs.map((r) => `seed ${r.seed}: £${r.cash}, ${r.sold} sold, reputation ${r.rep}, daily profit ${r.days.join(' ')}`).join('; '),
  };
}
