/* Save, restore into a fresh playground, save again: the same. Settings changed on every
   toy (jiggle, lamp and gravity, sand colour and hold, the pendulum's sliders) all come
   back. A save from when the playground had firewood and a synth opens on the bears. A
   save from another version, or a broken one, is ignored rather than thrown on. */
import { createPlayground } from '../../physics-playground/sim.js';
import { mulberry32 } from '../../lib/rng.js';

export default function () {
  const problems = [];
  const a = createPlayground({ rnd: mulberry32(5) });
  const t = a.toys;
  a.setTab('pendulum');
  t.gummy.setJiggle(0.9);
  t.lava.lamp = false; t.lava.gravity = 1.4;
  t.sand.colour = 3; t.sand.setWet(0.2);
  t.pendulum.set('g', 3.7); t.pendulum.set('ghosts', 9); t.pendulum.set('m2', 2.5);
  const first = JSON.stringify(a.toSave());

  const b = createPlayground({ saved: JSON.parse(first), rnd: mulberry32(99) });
  const second = JSON.stringify(b.toSave());
  if (second !== first) {
    const A = JSON.parse(first), B = JSON.parse(second);
    for (const k of Object.keys(A)) if (JSON.stringify(A[k]) !== JSON.stringify(B[k])) problems.push(`${k} came back as ${JSON.stringify(B[k]).slice(0, 120)}`);
  }
  if (b.tab !== 'pendulum') problems.push(`opened on ${b.tab}`);

  let threw = null;
  try {
    createPlayground({ saved: { v: 0, tab: 'nonsense' } });
    const c = createPlayground({ saved: { v: 1, tab: 'wood', lava: { gravity: 'lots' }, pendulum: { g: 'heavy' } } });
    if (c.tab !== 'gummy') problems.push(`a broken tab opened ${c.tab}`);
  } catch (e) { threw = e.message; }
  if (threw) problems.push(`a broken save threw: ${threw}`);

  return { pass: !problems.length, detail: (problems.length ? problems.join(' | ') + ' -- ' : '') + `a ${first.length}-char save came back identical, on the pendulum tab; a broken one fell back` };
}
