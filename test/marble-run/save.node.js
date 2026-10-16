/* What a board keeps between visits, it keeps right.

   Marble Run saves the level you were on, how far you have got, your stars on each level
   and the pieces you had hung on each. In Node: hang a layout on level 2, win level 1, come
   back; a fresh game built from a JSON copy of the store is on the same level with the same
   pieces, the same stars and the same levels open. Stars only ever add up: a worse run
   does not take one away. And the same pieces always give the same run, to the frame. */
import { createRun, DT } from '../../marble-run/sim.js';

function playOut(g) {
  g.release();
  let n = 0;
  while (g.mode === 'run' && n++ < 4000) g.step(DT);
  return { mode: g.mode, t: g.world.t, marbles: g.world.marbles.map((m) => [m.x, m.y]) };
}

export default function () {
  const problems = [];
  const saved = {};
  const g = createRun({ saved });
  g.setLayout(g.L.solution);
  const a = playOut(g);
  if (a.mode !== 'won') problems.push(`level 1's solution ended ${a.mode}`);
  g.stop();
  const b = playOut(g);
  if (JSON.stringify(a) !== JSON.stringify(b)) problems.push('the same pieces gave a different run');
  g.stop();
  // a worse run: one slope too many still wins? either way the par star stays
  g.place('slope', 4, 4);
  playOut(g);
  g.stop();
  if (!saved.levels['first-drop'].stars[2]) problems.push('a run over par took the par star away');
  g.load(1);
  g.place('slope', 1, 5); g.place('slope', 2, 5); g.flip(2, 5);
  const copy = JSON.parse(JSON.stringify(saved));
  const again = createRun({ saved: copy });
  if (again.idx !== 1) problems.push(`came back on level ${again.idx + 1}`);
  const lay = again.placed.map((p) => `${p.kind}${p.x},${p.y}${p.flip ? 'F' : ''}`).join(' ');
  if (lay !== 'slope1,5 slope2,5F') problems.push(`came back with '${lay}'`);
  if (!again.unlocked(1) || again.unlocked(2)) problems.push(`levels open: reached ${copy.reached}`);
  if (again.totalStars() !== 3) problems.push(`${again.totalStars()} stars after coming back`);
  // a store from another shape is started fresh, not trusted
  const odd = { v: 0, level: 9, levels: { x: 1 } };
  const fresh = createRun({ saved: odd });
  if (fresh.idx !== 0 || odd.v !== 1) problems.push('an old-shaped store was not started fresh');
  return {
    pass: !problems.length,
    detail: (problems.length ? problems.join(' | ') + ' -- ' : '') +
      `level 1 won in ${a.t.toFixed(2)}s twice alike; back on level ${again.idx + 1} with '${lay}', ${again.totalStars()} stars, reached ${copy.reached}`,
  };
}
