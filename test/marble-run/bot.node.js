/* A player who only follows the hints gets through every level with three stars.

   In Node, through the real verbs (the ones the page's buttons call): on each level the bot
   asks for a hint, hangs the piece it names (taking back whatever is in its cell first), and
   releases once the hint has nothing left to say, then steps the run frame by frame as the
   page does. Before that it makes a mess first, hanging a piece somewhere the solution does
   not, so the hint has to deal with a wrong piece too.

   Checks: every level ends 'won' with all three stars, the next level opens each time, a
   failed run goes back to building on its own, and the store says 36 stars at the end. */
import { createRun, DT } from '../../marble-run/sim.js';

export default function () {
  const problems = [];
  const saved = {};
  let saves = 0, fails = 0, hints = 0;
  const g = createRun({ saved, on: (ev) => { if (ev === 'save') saves++; if (ev === 'fail') fails++; } });
  const times = [];
  for (let i = 0; i < g.LEVELS.length; i++) {
    if (!g.unlocked(i)) { problems.push(`level ${i + 1} is still locked`); break; }
    g.load(i);
    // a wrong piece first: the first kind in the box, in the first empty cell off the solution
    const kind = Object.keys(g.L.give)[0];
    for (let c = 0; c < g.L.w * g.L.h; c++) {
      const x = c % g.L.w, y = Math.floor(c / g.L.w);
      if (g.L.solution.some((s) => s[1] === x && s[2] === y)) continue;
      if (g.place(kind, x, y)) break;
    }
    // a run with the wrong piece: if it fails it has to come back to building by itself
    g.release();
    let n = 0;
    while (g.mode === 'run' && n++ < 4000) g.step(DT);
    while (g.mode === 'failed' && n++ < 4200) g.step(DT);
    if (g.mode === 'won') g.stop();
    if (g.mode !== 'build') { problems.push(`${g.L.id}: after a try it is '${g.mode}'`); continue; }
    // now the hints
    for (let k = 0; k < 20; k++) {
      const h = g.hint();
      if (!h) break;
      hints++;
      if (g.at(h.x, h.y)) g.remove(h.x, h.y);
      if (!h.spare || g.left(h.kind) <= 0) {
        // that kind is hung somewhere the solution does not want it: take one back
        const off = g.placed.find((p) => p.kind === h.kind && !g.L.solution.some((s) => s[0] === p.kind && s[1] === p.x && s[2] === p.y));
        if (off) g.remove(off.x, off.y);
      }
      if (!g.place(h.kind, h.x, h.y, h.flip)) { problems.push(`${g.L.id}: could not hang the hinted ${h.kind} at ${h.x},${h.y}`); break; }
    }
    // pieces the solution does not use are taken back, for the par star
    for (const p of [...g.placed]) if (!g.L.solution.some((s) => s[0] === p.kind && s[1] === p.x && s[2] === p.y)) g.remove(p.x, p.y);
    g.release();
    n = 0;
    while (g.mode === 'run' && n++ < 4000) g.step(DT);
    if (g.mode !== 'won') { problems.push(`${g.L.id}: the hinted run ended '${g.mode}' (${g.result && g.result.end})`); continue; }
    if (!g.result.stars.every(Boolean)) problems.push(`${g.L.id}: stars ${g.result.stars}`);
    times.push(g.result.t.toFixed(1));
  }
  const total = g.totalStars();
  if (total !== g.LEVELS.length * 3) problems.push(`${total} stars in the store`);
  return {
    pass: !problems.length,
    detail: (problems.length ? problems.join(' | ') + ' -- ' : '') +
      `${times.length} levels won on hints (${hints} hints), runs of ${times.join(', ')}s; ${fails} failed first tries; ${total} stars; ${saves} saves`,
  };
}
