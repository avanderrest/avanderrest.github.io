/* What Pocket Pal keeps, it keeps right.

   Care for it a while, teach it part of a trick, save, restore into a fresh sim, save
   again: identical. Both then run on alike under the same dice. Time away is gentle: an
   afternoon off leaves every bar above the floor and the pet rested, and a week away counts
   no worse than ten hours. */
import { createPal } from '../../pocket-pal/sim.js';
import { mulberry32 } from '../../lib/rng.js';

const copy = (o) => JSON.parse(JSON.stringify(o));

export default function () {
  const problems = [];
  const a = createPal({ name: 'Pip', colour: 'peach', rnd: mulberry32(3) });
  a.feed('apple');
  for (let i = 0; i < 600; i++) a.step(1 / 20);
  a.chooseTrick('sit'); a.gesture('down'); a.step(0.5); a.hear('sit');
  a.stroke(400, 5);
  for (let i = 0; i < 200; i++) a.step(1 / 20);
  if (a.S.tricks.sit.reps !== 1) problems.push(`one good try left sit at ${a.S.tricks.sit.reps}`);

  const saved = copy(a.S);
  const b = createPal({ saved: copy(saved), rnd: mulberry32(1) });
  if (JSON.stringify(b.S) !== JSON.stringify(saved)) problems.push('restoring changed the save');
  if (b.S.name !== 'Pip' || b.S.colour !== 'peach') problems.push('name or coat lost');

  const a2 = createPal({ saved: copy(saved), rnd: mulberry32(9) }), b2 = createPal({ saved: copy(saved), rnd: mulberry32(9) });
  for (let i = 0; i < 3000; i++) {
    if (i === 100) { a2.play(); b2.play(); }
    if (i === 1500) { a2.feed('kibble'); b2.feed('kibble'); }
    a2.step(1 / 20); b2.step(1 / 20);
  }
  if (JSON.stringify(a2.S) !== JSON.stringify(b2.S)) problems.push('two restored sims ran apart');

  const c = createPal({ saved: copy(saved), rnd: mulberry32(2) });
  c.S.stats.energy = 20;
  c.away(5 * 3600);
  const low = Math.min(c.S.stats.tummy, c.S.stats.happy, c.S.stats.clean);
  if (low < 18) problems.push(`five hours away took a bar to ${low.toFixed(0)}`);
  if (c.S.stats.energy < 90) problems.push(`five hours away left energy at ${c.S.stats.energy.toFixed(0)}`);
  const d = createPal({ saved: copy(saved), rnd: mulberry32(2) }), e = createPal({ saved: copy(saved), rnd: mulberry32(2) });
  d.away(7 * 24 * 3600); e.away(10 * 3600);
  if (JSON.stringify(d.S.stats) !== JSON.stringify(e.S.stats)) problems.push('a week away counted worse than ten hours');

  return {
    pass: !problems.length,
    detail: (problems.length ? problems.join(' | ') + ' -- ' : '') +
      `saved with sit ${saved.tricks.sit.reps}/3, bond ${saved.bond.toFixed(1)}; restore identical, runs alike for 150s; 5h away: lowest bar ${low.toFixed(0)}, energy ${c.S.stats.energy.toFixed(0)}`,
  };
}
