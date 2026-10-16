/* Every level can be done, and is not done already.

   In Node, for each level in marble-run/levels.js:
   - its stored solution, released, lands every marble and rings every bell, so the
     three-star run the hint shows really works (a change to the physics that breaks one
     shows up here first, with the level's name);
   - it uses its pieces as they are meant: it touches no pipe round the level and goes
     through every funnel it touches, rather than bouncing off one's rim (Amber found both
     confusing as hints);
   - par is that solution's size;
   - the solution only uses what is in the box, in cells a piece can hang in;
   - with nothing hung, the marble does not get home: every level needs a piece. */
import { LEVELS, PIECES, parseLevel, simulate, canHang } from '../../marble-run/sim.js';

export default function () {
  const problems = [], lines = [];
  for (const def of LEVELS) {
    const L = parseLevel(def);
    const placed = L.solution.map(([kind, x, y, flip]) => ({ kind, x, y, flip: !!flip }));
    const r = simulate(L, placed);
    const empty = simulate(L, []);
    if (!r.won) problems.push(`${def.id}: the solution ends ${r.end} at ${r.t.toFixed(1)}s`);
    else if (!r.bellsAll) problems.push(`${def.id}: the solution rings ${r.bells} of ${L.bells.length} bells`);
    if (!r.clean) problems.push(`${def.id}: the solution bounces off a funnel instead of going through it`);
    if (L.par !== placed.length) problems.push(`${def.id}: par ${L.par} but the solution has ${placed.length}`);
    const used = {};
    for (const p of placed) {
      const pool = PIECES[p.kind].pool || p.kind;   // high slopes come from the slope pile
      used[pool] = (used[pool] || 0) + 1;
      if (!canHang(L, p.x, p.y)) problems.push(`${def.id}: a ${p.kind} at ${p.x},${p.y}, where nothing can hang`);
    }
    for (const [k, n] of Object.entries(used)) if (n > (L.give[k] || 0)) problems.push(`${def.id}: needs ${n} ${k}, the box has ${L.give[k] || 0}`);
    if (empty.won) problems.push(`${def.id}: wins with nothing hung`);
    lines.push(`${def.id} ${placed.length}pc ${r.t.toFixed(1)}s`);
  }
  return {
    pass: !problems.length,
    detail: (problems.length ? problems.join(' | ') + ' -- ' : '') + `${LEVELS.length} levels: ${lines.join(', ')}`,
  };
}
