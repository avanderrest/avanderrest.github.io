/* What Willow Mere keeps, it keeps right; and a seed is a lake.

   Row a while (pick something up, gather a duckling), save, restore into a fresh sim,
   save again: the two saves are identical, and both sims then run on alike under the
   same oars. A finished lake's count carries into the next one. One seed is one lake
   (shoreline, litter, the lost and the adrift) and another seed is not. */
import { createMere } from '../../willow-mere/sim.js';
import { mulberry32 } from '../../lib/rng.js';

const lakePrint = (m) => {
  const L = m.lake, S = m.S;
  let s = 0; for (let k = 0; k < L.sd.length; k += 97) s = (s * 31 + Math.round(L.sd[k])) | 0;
  return [s, ...S.litter.map((l) => `${l.kind}@${l.x | 0},${l.y | 0}`), ...S.young.map((y) => `${y.x | 0},${y.y | 0}`), ...S.friends.map((f) => `${f.rx | 0},${f.ry | 0}`)].join('|');
};

export default function () {
  const problems = [];
  const a = createMere({ seed: 515, rnd: mulberry32(1) });
  // row out and about for a minute, turning now and then
  for (let i = 0; i < 1800; i++) { a.row({ L: true, R: i % 300 < 200 }); a.step(1 / 30); }
  // put a duckling right by the boat and drift in on it
  const y = a.S.young[0]; y.x = y.hx = a.S.boat.x + 40; y.y = y.hy = a.S.boat.y;
  for (let i = 0; i < 300; i++) { a.row({}); a.step(1 / 30); }
  const l = a.S.litter.find((q) => q.state === 'water'); l.x = a.S.boat.x; l.y = a.S.boat.y;
  a.step(1 / 30);
  if (!a.S.hold.length) problems.push('the litter under the boat was not picked up');
  if (!a.S.chain.length) problems.push('the duckling by a still boat did not follow');

  const saved = JSON.parse(JSON.stringify(a.S));
  const b = createMere({ saved: JSON.parse(JSON.stringify(saved)), rnd: mulberry32(1) });
  if (JSON.stringify(b.S) !== JSON.stringify(saved)) problems.push('restoring changed the save');
  const a2 = createMere({ saved: JSON.parse(JSON.stringify(saved)), rnd: mulberry32(9) }), b2 = createMere({ saved: JSON.parse(JSON.stringify(saved)), rnd: mulberry32(9) });
  for (let i = 0; i < 900; i++) { const o = { L: i % 90 < 50, R: i % 130 < 70 }; a2.row(o); b2.row(o); a2.step(1 / 30); b2.step(1 / 30); }
  if (JSON.stringify(a2.S) !== JSON.stringify(b2.S)) problems.push('two restored sims ran apart');

  // a finished lake counts toward the next
  const c = createMere({ seed: 9 });
  c.S.done = true; c.newLake(10);
  if (c.S.lakes !== 1 || c.S.done || c.S.seed !== 10) problems.push(`new lake after a finished one: lakes ${c.S.lakes}, done ${c.S.done}`);

  const p1 = lakePrint(createMere({ seed: 4242 })), p2 = lakePrint(createMere({ seed: 4242 })), p3 = lakePrint(createMere({ seed: 4243 }));
  if (p1 !== p2) problems.push('seed 4242 made two different lakes');
  if (p1 === p3) problems.push('seeds 4242 and 4243 made the same lake');

  return {
    pass: !problems.length,
    detail: (problems.length ? problems.join(' | ') + ' -- ' : '') +
      `saved with ${saved.hold.length} in the boat and ${saved.chain.length} following at (${saved.boat.x | 0}, ${saved.boat.y | 0}); restore identical, runs alike for 30s; seed 4242 the same lake twice`,
  };
}
