/* The solver still finds the early levels, and none of them more cheaply than par.

   In Node: solve.js on the first four levels and Boing, which take it under a second each.
   It has to find a three-star layout on each, and that layout must win when released. If
   it finds one with fewer pieces than the level's par, the par in levels.js is stale (the
   physics changed): this fails and says what the new par would be. The later levels take
   it too long for every run; the levels case checks their stored solutions instead. */
import { LEVELS, parseLevel, simulate } from '../../marble-run/sim.js';
import { solve } from '../../marble-run/solve.js';

const IDS = ['first-drop', 'long-rail', 'about-turn', 'funnel', 'boing'];

export default function () {
  const problems = [], lines = [];
  for (const id of IDS) {
    const def = LEVELS.find((d) => d.id === id);
    const t0 = Date.now();
    const r = solve(def, { beam: 40, budget: 20000 });
    const ms = Date.now() - t0;
    if (!r.placed) { problems.push(`${id}: no layout found in ${r.sims} runs`); continue; }
    const check = simulate(parseLevel(def), r.placed);
    if (!check.won || !check.bellsAll) problems.push(`${id}: its layout did not hold up (${check.end})`);
    if (r.used < def.par) problems.push(`${id}: solved with ${r.used}, under par ${def.par}; re-run the level build`);
    lines.push(`${id} ${r.used}/${def.par} in ${r.sims} runs ${ms}ms`);
  }
  return { pass: !problems.length, detail: (problems.length ? problems.join(' | ') + ' -- ' : '') + lines.join(', ') };
}
