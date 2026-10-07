/* A florist who reads the book does well: a fortnight of customers, served with care.

   A bot runs the real shed in Node with seeded dice. Every customer: water anything dry,
   cut anything in flower, sow empty pots from what seed there is, then for the order build
   the best bunch it can out of the bucket (searched, in every vase) and hand it over. Five
   seeds, two in-game weeks each. Satisfaction has to climb, the tin has to fill, and the
   average has to be at least one and a half stars (the bot is greedy and ignores how old
   its stems are, so a careful player does better).

   What this guards is the whole loop at once: orders that can be filled from what grows,
   a garden that keeps up with the lane, and pay that covers seed. */
import { createShed, VASES, VASE_ORDER, judge, potRipe, FLOWERS, flowerOf } from '../../the-garden-shed/sim.js';
import { mulberry32 } from '../../lib/rng.js';

function bestBunch(shop, o) {
  const S = shop.S;
  const have = [];
  for (const b of S.bucket) for (let i = 0; i < b.n; i++) have.push(b.k);
  if (!have.length) return null;
  const kinds = [...new Set(have)];
  let best = null;
  // grow a bunch greedily, a stem at a time, keeping whatever scores best in any vase
  for (const vid of VASE_ORDER) {
    const bunch = [];
    const left = {};
    for (const k of have) left[k] = (left[k] || 0) + 1;
    while (bunch.length < VASES[vid].holds) {
      let pick = null, score = -1;
      for (const k of kinds) {
        if (!left[k]) continue;
        const r = judge(o, bunch.concat(k), vid, false);
        const s = r.stars * 100 + r.pay;
        if (s > score) { score = s; pick = k; }
      }
      if (!pick) break;
      bunch.push(pick); left[pick]--;
      const r = judge(o, bunch, vid, false);
      if (!best || r.stars * 100 + r.pay > best.score) best = { vid, stems: bunch.slice(), score: r.stars * 100 + r.pay, stars: r.stars };
    }
  }
  return best;
}

function run(seed) {
  const shop = createShed({ rnd: mulberry32(seed) });
  const S = () => shop.S;
  shop.togglePause();
  const coins0 = S().coins, rep0 = S().rep;
  let served = 0, stars = 0, lost = 0;
  const startDay = S().dayCount;
  while (S().dayCount < startDay + 14) {
    // the garden
    S().pots.forEach((p, i) => { if (p.crop && p.dry > 0) shop.waterPot(i); });
    S().pots.forEach((p, i) => { if (potRipe(p)) shop.cutPot(i); });
    S().pots.forEach((p, i) => { if (!p.crop && S().packets.length) shop.sowPot(i, S().packets[0].k); });
    // seed: a packet of whatever the bucket is short of, if there is money for it
    if (S().packets.length < 2 && S().coins > 20) {
      const k = Object.keys(FLOWERS).filter((f) => S().flags.catalogue.includes(f)).map((f) => `${f}-${FLOWERS[f].colours[0]}`)[(served) % 5];
      if (k) shop.buySeed(k);
    }
    // the counter
    shop.nextCustomer(false);
    const o = S().shop.cust;
    if (!o) { shop.idleSlot(); continue; }
    const b = bestBunch(shop, o);
    if (!b || b.stars < 1) { shop.declineOrder(); lost++; continue; }
    shop.acceptOrder();
    shop.vaseDown(b.vid);
    for (const k of b.stems) shop.addStem(k);
    shop.handOver();
    const last = S().shop.last;
    if (last) { served++; stars += last.stars; }
    shop.nextPlease();
  }
  const dead = S().pots.filter((p) => !p.crop).length;
  return { seed, coins: S().coins - coins0, rep: [rep0, Math.round(S().rep)], served, avg: served ? stars / served : 0, lost, empty: dead };
}

export default function () {
  const runs = [1, 2, 3, 4, 5].map(run);
  const problems = [];
  for (const r of runs) {
    if (r.rep[1] <= r.rep[0]) problems.push(`seed ${r.seed}: satisfaction ${r.rep[0]} -> ${r.rep[1]}`);
    if (r.coins <= 0) problems.push(`seed ${r.seed}: the tin went down by ${-r.coins}`);
    if (r.avg < 1.5) problems.push(`seed ${r.seed}: ${r.avg.toFixed(2)} stars a bunch`);
  }
  return {
    pass: !problems.length,
    detail: (problems.length ? problems.join(' | ') + ' -- ' : '') +
      runs.map((r) => `seed ${r.seed}: ${r.served} served at ${r.avg.toFixed(2)}★, ${r.lost} turned away, +${r.coins} coins, satisfaction ${r.rep[0]}→${r.rep[1]}`).join('; '),
  };
}
