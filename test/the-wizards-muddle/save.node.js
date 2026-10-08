/* What the study keeps, it keeps right, and one seed is one mess.

   Find two riddles, move a few things, save, restore into a fresh sim, save again:
   identical, down to the order things are stacked in. Both then play on alike. The same
   seed scatters the same mess and asks the same riddles; another seed does not. A new mess
   keeps the owl's score and the stars. */
import { createStudy, centre, THINGS } from '../../the-wizards-muddle/sim.js';

const copy = (o) => JSON.parse(JSON.stringify(o));
const findAll = (s, k) => { for (let i = 0; i < k; i++) { const c = s.next(); s.lift(s.byKind(c.kind)); const it = s.byKind(c.kind); s.drop(it, 600, 700); const m = centre(it); s.ping(m.x, m.y); } };

export default function () {
  const problems = [];
  const a = createStudy({ seed: 77 });
  findAll(a, 2);
  a.next(); a.hint(); a.hint();
  const moved = a.S.items[3]; a.lift(moved); a.drop(moved, 300, 500);
  a.spyRound(true);
  const saved = copy(a.S);
  const b = createStudy({ saved: copy(saved), seed: 1 });
  if (JSON.stringify(b.S) !== JSON.stringify(saved)) problems.push('restoring changed the save');
  if (b.S.hunt.done.length !== 2 || !b.cur || b.cur.hints !== 2) problems.push('the hunt did not come back as it was');

  const a2 = createStudy({ saved: copy(saved) }), b2 = createStudy({ saved: copy(saved) });
  for (const s of [a2, b2]) { s.ping(100, 100); s.step(3); findAll(s, 3); }
  if (JSON.stringify(a2.S) !== JSON.stringify(b2.S)) problems.push('two restored studies played apart');

  const x = createStudy({ seed: 5 }), y = createStudy({ seed: 5 }), z = createStudy({ seed: 6 });
  if (JSON.stringify(x.S.items) !== JSON.stringify(y.S.items)) problems.push('one seed made two messes');
  if (x.next().kind !== y.next().kind) problems.push('one seed asked two first riddles');
  if (JSON.stringify(x.S.items) === JSON.stringify(z.S.items)) problems.push('two seeds made one mess');

  const bad = createStudy({ saved: { v: 1, items: [{ kind: 'nope' }] }, seed: 9 });
  if (bad.S.items.length !== THINGS.length || bad.S.seed !== 9) problems.push('a broken save was not replaced with a fresh mess');
  const old = createStudy({ saved: { ...copy(saved), v: 1 }, seed: 11 });
  if (old.S.v !== 2 || old.S.seed !== 11) problems.push('a v1 save (slots on shelves) was not replaced');

  a.newMess(1234);
  if (a.S.owl.owl !== 1 || a.S.stars !== saved.stars || a.S.mess !== 2 || a.S.hunt.done.length) problems.push(`a new mess lost the score or kept the hunt (${JSON.stringify(a.S.owl)}, stars ${a.S.stars}, mess ${a.S.mess})`);

  return {
    pass: !problems.length,
    detail: (problems.length ? problems.join(' | ') + ' -- ' : '') + `saved with ${saved.hunt.done.length} found, ${saved.stars} stars, ${b.putAway()} put away; restore identical, plays alike; seeds 5/5 alike, 5/6 differ`,
  };
}
