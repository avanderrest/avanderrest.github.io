/* A saved shop comes back as it was.

   Plays two days, saves through JSON the way localStorage does, and loads the copy into a
   new shop. Everything the save holds (cash, reputation, shelves, the stockroom's batches
   and their ages, prices, the vans on order, the notebook) has to come back identical, and
   the reloaded shop has to open and trade the next day with the same dice as the original. */
import { createShop } from '../../the-corner-shop/sim.js';
import { mulberry32 } from '../../lib/rng.js';

function playDay(shop) {
  const S = () => shop.state;
  const order = {};
  for (const pid of S().slots.filter(Boolean)) order[pid] = 1;
  shop.confirmOrder(order);
  shop.fillAll();
  shop.openShop();
  let t = 0;
  while (S().phase === 'open' && t < 400) {
    const day = shop.day, c = day && day.till;
    if (c && c.state === 'till') { for (const it of day.belt.slice()) shop.scanItem(it.uid); for (const it of day.belt.slice()) shop.bagItem(it.uid); }
    if (c && c.state === 'paying') for (const m of day.coins.slice()) shop.takeCoin(m.uid);
    shop.tick(0.1); t += 0.1;
  }
  shop.morning();
}

export default function () {
  const a = createShop({ rnd: mulberry32(9) });
  playDay(a); playDay(a);
  a.nudgePrice('milk', 3);
  const saved = JSON.parse(JSON.stringify(a.serialize()));
  const b = createShop({ saved, rnd: mulberry32(1) });
  const problems = [];
  if (JSON.stringify(b.serialize()) !== JSON.stringify(a.serialize())) problems.push('the reloaded shop saves back differently');
  // the same next day from both
  const a2 = createShop({ saved: a.serialize(), rnd: mulberry32(77) });
  const b2 = createShop({ saved: b.serialize(), rnd: mulberry32(77) });
  playDay(a2); playDay(b2);
  if (JSON.stringify(a2.serialize()) !== JSON.stringify(b2.serialize())) problems.push(`the next day diverged: cash ${a2.state.cash} vs ${b2.state.cash}`);
  return {
    pass: !problems.length,
    detail: (problems.length ? problems.join(' | ') + ' -- ' : '') +
      `saved on day ${saved.day} with £${saved.cash.toFixed(2)}, reputation ${Math.round(saved.rep)}, milk at £${saved.prices.milk.toFixed(2)}; the next day played the same from the save (£${a2.state.cash.toFixed(2)})`,
  };
}
