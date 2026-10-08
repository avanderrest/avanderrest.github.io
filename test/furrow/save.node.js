/* A saved village comes back exactly, and a seed is a valley.

   In Node: build the first few buildings and run two days, serialize, restore into a fresh
   village, and serialize again: the two must match character for character, and both
   villages must then run on alike under the same dice. Two new games on one seed lay out
   the same valley (ground and trees), and a different seed does not; that is what makes a
   #seed= link worth sending. */
import { createVillage } from '../../furrow/sim.js';

const valley = (w) => Array.from(w.ground).join('') + '|' + Array.from(w.tree).join('');

export default function () {
  const problems = [];
  const a = createVillage({});
  a.seedDice(5);
  a.newGame(777);
  for (const [t, dx, dy] of [['barn', -6, -6], ['house', 3, -4], ['field', -7, 2], ['wood', 5, 1]]) a.place(t, a.HOME.x + dx, a.HOME.y + dy);
  const n = Math.ceil(48 * a.SEC_PER_HOUR / 0.2);
  for (let i = 0; i < n; i++) a.step(0.2);
  const json = JSON.stringify(a.serialize());

  const b = createVillage({});
  b.restore(JSON.parse(json));
  const again = JSON.stringify(b.serialize());
  if (again !== json) problems.push(`restored village saves differently (${again.length} vs ${json.length} chars)`);

  // both carry on alike from here
  a.seedDice(9); b.seedDice(9);
  // a fresh restore resets what is not saved (paths, waits); put a on the same footing
  a.restore(JSON.parse(json));
  for (let i = 0; i < 400; i++) { a.step(0.2); b.step(0.2); }
  const sa = JSON.stringify(a.serialize()), sb = JSON.stringify(b.serialize());
  if (sa !== sb) problems.push('two copies of one save drifted apart under the same dice');

  // a seed is a valley
  const v1 = createVillage({}), v2 = createVillage({}), v3 = createVillage({});
  v1.seedDice(1); v2.seedDice(2); v3.seedDice(1);
  v1.newGame(4242); v2.newGame(4242); v3.newGame(4243);
  if (valley(v1) !== valley(v2)) problems.push('seed 4242 laid out two different valleys');
  if (valley(v1) === valley(v3)) problems.push('seeds 4242 and 4243 gave the same valley');

  return {
    pass: !problems.length,
    detail: (problems.length ? problems.join(' | ') + ' -- ' : '') +
      `round trip on day ${a.S.day} with ${a.V.length} villagers and ${a.B.filter(Boolean).length} buildings (${json.length} chars); seed 4242 gave the same valley twice`,
  };
}
