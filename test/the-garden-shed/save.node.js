/* A saved shed comes back as it was, customer at the counter and all.

   Plays a few customers, leaves one standing at the counter mid-conversation with a vase
   half made on the table, saves through JSON the way localStorage does and loads the copy.
   Everything has to come back identical, and the two shops have to carry on identically
   with the same dice: serve the customer, a day of slots, the same diary. */
import { createShed } from '../../the-garden-shed/sim.js';
import { mulberry32 } from '../../lib/rng.js';

export default function () {
  const a = createShed({ rnd: mulberry32(4) });
  a.togglePause();
  a.S.pots.forEach((p, i) => a.cutPot(i));
  for (let n = 0; n < 3; n++) { a.nextCustomer(false); a.declineOrder(); }
  a.nextCustomer(false);
  a.askQ('say'); a.askQ('who'); a.askQ('like');
  a.acceptOrder();
  a.vaseDown('jug');
  a.addStem(a.S.bucket[0].k);
  const saved = JSON.parse(JSON.stringify(a.serialize()));
  const b = createShed({ saved, rnd: mulberry32(1) });
  const problems = [];
  if (JSON.stringify(b.serialize()) !== JSON.stringify(a.serialize())) problems.push('the reloaded shed saves back differently');
  const play = (s) => { s.handOver(); s.nextPlease(); for (let i = 0; i < 6; i++) s.idleSlot(); return JSON.stringify(s.serialize()).replace(/"id":"[^"]*"/g, '"id":"-"'); };
  const a2 = createShed({ saved: a.serialize(), rnd: mulberry32(8) });
  const b2 = createShed({ saved: b.serialize(), rnd: mulberry32(8) });
  if (play(a2) !== play(b2)) problems.push('the two shops diverged after the reload');
  return {
    pass: !problems.length,
    detail: (problems.length ? problems.join(' | ') + ' -- ' : '') +
      `saved on day ${saved.day} with ${saved.coins} coins, ${saved.bucket.length} lots in the bucket, a ${saved.bench && saved.bench.vase} on the table and ${saved.shop.cust ? saved.shop.cust.who : 'nobody'} at the counter; both carried on the same`,
  };
}
