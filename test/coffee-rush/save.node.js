/* The cafe a save describes is the cafe you get back.

   Coffee Rush saves progress, not a shift in progress: the day, the bank, the upgrades and
   where you dragged every machine. In Node: lay a floor out, play a day, buy something, and
   then build a second cafe from a JSON copy of the save. The two floors must be the same
   machines in the same places, the shop must offer the same things at the same prices,
   and what can be ordered must match. A machine saved somewhere it no longer fits (a
   floor plan from the old room) goes back in its crate rather than being placed badly. */
import { createCafe, freshSave } from '../../coffee-rush/sim.js';
import { mulberry32 } from '../../lib/rng.js';

const floor = (cr) => JSON.stringify(cr.APPLIANCES.map((a) => [a.id, a.c, a.r]).sort());

export default function () {
  const problems = [];
  const save = freshSave();
  const a = createCafe({ save, best: 0, rnd: mulberry32(3) });
  save.day = 7; save.bank = 300;
  save.layout = { 'espresso-1': [8, 4], 'cookie-1': [10, 4], 'brownie-1': [12, 4], 'milk-1': [14, 4], 'muffin-1': [15, 4], 'ice-1': [16, 4], bin: [20, 10] };
  a.reset();
  a.S.running = true;
  for (let i = 0; i < 30 * 30; i++) a.update(1 / 30);
  a.buyUpgrade(a.shopUpgrades().find((u) => u.id === 'seating'));
  const copy = JSON.parse(JSON.stringify(save));

  const b = createCafe({ save: copy, best: 0, rnd: mulberry32(3) });
  b.reset();
  a.reset();
  if (floor(a) !== floor(b)) problems.push(`the floor came back different:\n${floor(a)}\n${floor(b)}`);
  if (a.UNPLACED.length !== b.UNPLACED.length) problems.push('a different number of machines in crates');
  const shop = (cr) => cr.shopUpgrades().map((u) => u.id + ':' + cr.upgradeCost(u)).join(',');
  if (shop(a) !== shop(b)) problems.push('the shop offers different things');
  if (a.POOL.join() !== b.POOL.join()) problems.push('what can be ordered differs');

  // a spot that no longer fits: on the counter's side of the room
  const bad = JSON.parse(JSON.stringify(save));
  bad.layout['espresso-1'] = [2, 6];
  const c = createCafe({ save: bad, best: 0 });
  c.reset();
  if (c.APPLIANCES.some((x) => x.id === 'espresso-1')) problems.push('a machine saved on the customers\' side was placed there');
  if (!c.UNPLACED.some((m) => m.id === 'espresso-1')) problems.push('a machine that no longer fits did not go back in its crate');

  return {
    pass: !problems.length,
    detail: (problems.length ? problems.join(' | ') + ' -- ' : '') +
      `${a.APPLIANCES.length - 1} machines placed the same, ${a.shopUpgrades().length} upgrades on offer, ${new Set(a.POOL).size} things to order; a misplaced machine went back in its crate`,
  };
}
