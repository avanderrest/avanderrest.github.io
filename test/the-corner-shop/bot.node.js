/* A sensible shopkeeper keeps the shop open for a fortnight and ends up ahead.

   A bot runs the real shop in Node with seeded dice, through the same verbs the screen
   calls: every evening it orders enough boxes to cover what sold today plus a little
   (fresh things only as much as one day needs), carries the stock out to the shelves box by box before opening, and
   then works the day on foot. Whenever someone is at the counter it walks back to the
   till and serves them perfectly; otherwise it walks to the stockroom, lifts a box for
   the emptiest shelf, carries it out and stacks it. Fourteen days, three seeds.

   The shop must never be locked out, the cash has to end above where it started, every
   day has to close on its own, and a keeper who keeps an eye on the till loses almost
   nobody to it. The walking is the new cost: if the floor gets bigger or the keeper
   slower, this is where it shows. */
import { createShop, prod, START_CASH } from '../../the-corner-shop/sim.js';
import { mulberry32 } from '../../lib/rng.js';
import { stockUp, shelfFor, STARTER } from './_hands.mjs';

const DT = 0.05;

function work(shop) {
  const S = () => shop.state;
  const day = shop.day;
  const k = shop.keeper;
  const c = day && day.till;
  // someone at the counter comes first
  if (c && (c.state === 'till' || c.state === 'paying' || c.state === 'approach')) {
    if (!shop.atTill()) { if (!k.job || k.job.kind !== 'till') { if (k.job && (k.job.kind === 'pick' || k.job.kind === 'stack')) return; shop.goTill(); } return; }
    if (c.state === 'till') {
      for (const it of day.belt.slice()) shop.scanItem(it.uid);
      for (const it of day.belt.slice()) shop.bagItem(it.uid);
    }
    if (c.state === 'paying') for (const m of day.coins.slice()) shop.takeCoin(m.uid);
    return;
  }
  if (k.job) return;
  // carrying something: take it to its shelf, or put it back
  if (S().carry) {
    const i = shelfFor(shop, S().carry.pid);
    const r = i >= 0 ? shop.restock(i) : { ok: false };
    if (!r.ok) shop.putDown();
    return;
  }
  // the emptiest shelf with stock in the back
  let best = null, bf = 0.6;
  S().slots.forEach((pid) => {
    if (!pid || !shop.roomQty(pid)) return;
    const f = shop.shelfOf(pid) / (prod(pid).cap * shop.facingsOf(pid).length);
    if (f < bf) { bf = f; best = pid; }
  });
  if (best) {
    shop.pickUp(best);
    return;
  }
  if (!shop.atTill()) shop.goTill();
}

function run(seed) {
  const shop = createShop({ rnd: mulberry32(seed) });
  const S = () => shop.state;
  const days = [];
  let stuck = null, walked = 0, waits = 0;
  for (let d = 0; d < 14 && !stuck; d++) {
    const order = {};
    for (const pid of S().slots.some(Boolean) ? [...new Set(S().slots.filter(Boolean))] : STARTER) {
      const p = prod(pid);
      const sold = S().report ? S().report.stats[pid].bought : p.box;
      const have = shop.roomQty(pid) + shop.shelfOf(pid);
      const want = Math.max(0, Math.ceil((sold * (p.life === 1 ? 1 : 1.3) - have) / p.box));
      if (want) order[pid] = Math.min(3, want);
    }
    if (Object.keys(order).length) {
      const total = shop.orderTotal(order);
      if (S().cash >= total.cost + total.fee) shop.confirmOrder(order);
    }
    if (S().phase === 'closed') stockUp(shop);
    if (!shop.openShop().ok) days.push('shut');
    let t = 0;
    while (S().phase === 'open' && t < 600) {
      work(shop);
      shop.tick(DT);
      t += DT;
    }
    if (S().phase === 'open') { stuck = `day ${S().day} never closed`; break; }
    if (S().phase === 'evening') {
      days.push(Math.round((S().days[S().days.length - 1] || { profit: 0 }).profit));
      walked += S().today.walked;
      waits += S().report.notes.filter((n) => /bare/.test(n)).length;
    }
    shop.morning();
    if (S().phase === 'over') { stuck = `locked out on day ${S().day}`; break; }
  }
  return { seed, cash: Math.round(S().cash * 100) / 100, rep: Math.round(S().rep), days, stuck, sold: S().sold, walked, waits };
}

export default function () {
  const runs = [1, 2, 3].map(run);
  const problems = [];
  for (const r of runs) {
    if (r.stuck) problems.push(`seed ${r.seed}: ${r.stuck}`);
    else if (r.cash <= START_CASH) problems.push(`seed ${r.seed}: a fortnight of careful trading left £${r.cash} from £${START_CASH}`);
    else if (r.rep < 50 || r.rep > 90) problems.push(`seed ${r.seed}: reputation ended at ${r.rep}`);
    else if (r.walked > 6) problems.push(`seed ${r.seed}: ${r.walked} walked out of the till on a careful keeper`);
  }
  return {
    pass: !problems.length,
    detail: (problems.length ? problems.join(' | ') + ' -- ' : '') +
      runs.map((r) => `seed ${r.seed}: £${r.cash}, ${r.sold} sold, rep ${r.rep}, ${r.walked} walkouts, daily profit ${r.days.join(' ')}`).join('; '),
  };
}
