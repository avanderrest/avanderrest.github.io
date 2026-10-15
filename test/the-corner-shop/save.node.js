/* A saved shop comes back as it was, and so does one from the till game before it.

   Plays two days, saves through JSON the way localStorage does, and loads the copy into a
   new shop. Everything the save holds (cash, reputation, which product is on which
   facing, the stockroom's batches and their ages, prices, the vans on order, the
   notebook) has to come back identical, and the reloaded shop has to trade the next day
   with the same dice as the original. A box in the keeper's arms goes back on the
   stockroom pile on load, so nothing is lost or doubled.

   Then a save in the first game's shape (v1: a plain list of eight products) loads with
   those products on the facings a new shop comes with, in order, and the rest unfitted. */
import { createShop, prod, MAX_SLOTS } from '../../the-corner-shop/sim.js';
import { mulberry32 } from '../../lib/rng.js';
import { stockUp, STARTER } from './_hands.mjs';

function playDay(shop) {
  const S = () => shop.state;
  const order = {};
  for (const pid of S().slots.some(Boolean) ? S().slots.filter(Boolean) : STARTER) order[pid] = 1;
  shop.confirmOrder(order);
  stockUp(shop);
  shop.openShop();
  let t = 0;
  while (S().phase === 'open' && t < 600) {
    const day = shop.day, c = day && day.till;
    if (c && !shop.atTill() && !shop.keeper.job) shop.goTill();
    if (c && c.state === 'till') { for (const it of day.belt.slice()) shop.scanItem(it.uid); for (const it of day.belt.slice()) shop.bagItem(it.uid); }
    if (c && c.state === 'paying') for (const m of day.coins.slice()) shop.takeCoin(m.uid);
    shop.tick(0.05); t += 0.05;
  }
  shop.morning();
}
const units = (s) => Object.values(s.room).reduce((a, bs) => a + bs.reduce((x, b) => x + b.q, 0), 0) +
  s.stock.reduce((a, q) => a + q, 0) + (s.carry ? s.carry.q : 0);

export default function () {
  const problems = [];
  const a = createShop({ rnd: mulberry32(9) });
  playDay(a); playDay(a);
  a.nudgePrice('milk', 3);
  const saved = JSON.parse(JSON.stringify(a.serialize()));
  const b = createShop({ saved, rnd: mulberry32(1) });
  if (JSON.stringify(b.serialize()) !== JSON.stringify(a.serialize())) problems.push('the reloaded shop saves back differently');
  const a2 = createShop({ saved: a.serialize(), rnd: mulberry32(77) });
  const b2 = createShop({ saved: b.serialize(), rnd: mulberry32(77) });
  playDay(a2); playDay(b2);
  if (JSON.stringify(a2.serialize()) !== JSON.stringify(b2.serialize())) problems.push(`the next day diverged: cash ${a2.state.cash} vs ${b2.state.cash}`);

  // a box in the arms survives a reload, back on the pile
  const c = createShop({ saved: a.serialize(), rnd: mulberry32(3) });
  const pid = c.state.slots[0];
  c.state.room[pid].push({ q: 5, age: 0 });
  c.state.carry = { pid, q: 3 };
  c.state.room[pid][0].q -= 3;
  const before = units(c.state);
  const c2 = createShop({ saved: JSON.parse(JSON.stringify(c.serialize())) });
  if (c2.state.carry) problems.push('the carried box came back in the keeper\'s arms');
  if (units(c2.state) !== before) problems.push(`carried stock changed on reload: ${before} -> ${units(c2.state)}`);

  // the till game's save
  const v1 = { v: 1, day: 6, cash: 123.45, rep: 61, weather: 'rain', nextWeather: 'sunny', slots: ['milk', 'bread', 'tea', 'choc', null, 'paper', 'crisps', 'beans', 'umbrella'],
    shelf: { milk: 4, umbrella: 2 }, room: { milk: [{ q: 6, age: 1 }] }, prices: { milk: 1.25 }, pending: [], arriving: [], phase: 'closed', days: [] };
  const old = createShop({ saved: v1 });
  const sl = old.state.slots;
  if (sl.length !== MAX_SLOTS) problems.push(`v1 load has ${sl.length} facings`);
  if (sl[0] !== 'milk' || sl[2] !== 'tea' || sl[4] !== null || sl[7] !== 'umbrella' || sl[9] !== false) problems.push('v1 shelves did not land on the first facings: ' + JSON.stringify(sl));
  if (old.state.cash !== 123.45 || old.state.prices.milk !== 1.25 || old.state.stock[0] !== 4) problems.push('v1 cash, prices or shelves were not carried across');

  return {
    pass: !problems.length,
    detail: (problems.length ? problems.join(' | ') + ' -- ' : '') +
      `saved on day ${saved.day} with £${saved.cash.toFixed(2)}, reputation ${Math.round(saved.rep)}, milk at £${saved.prices.milk.toFixed(2)}; the next day played the same from the save (£${a2.state.cash.toFixed(2)}); a v1 shop loaded with ${sl.filter((x) => x !== false).length} fitted facings (${prod(sl[0]).name} first)`,
  };
}
