/* Every recipe can be made from start to finish with what the kitchen has out.

   In Node, through the real rules, for each of the eleven recipes: pick it, then fill the
   bowl the way a child would, only with what is out for it (its shelves, its fridge, the
   tap), trying the bowl after every one. The bowl must refuse until the last thing (and a
   flavour, where there is one) is in, and take it then; the same thing twice must not
   count twice; the close-up stages must end at eating; and six bites must finish it and
   put one on the count. A recipe that needs something nobody put out could never be made.
   (eating.js checks the bites on the real page; doors.js the kitchen's doors.) */
import { createKitchen, RECIPES, FLAVOURS, WHERE, BITES } from '../../my-little-kitchen/sim.js';

export default function () {
  const problems = [], made = [];
  const saved = [];
  const kit = createKitchen({ on: (ev, id) => { if (ev === 'save') saved.push(id); } });
  for (const id of Object.keys(RECIPES)) {
    kit.state = kit.freshState();
    kit.choose(id);
    const r = kit.recipe();
    const out = [...r.cupboard, ...r.fridge, ...Object.keys(WHERE).filter((x) => WHERE[x] === 'tap')];
    const missing = r.ingredients.filter((x) => !out.includes(x));
    if (missing.length) { problems.push(`${id}: needs ${missing.join(', ')}, which is not out`); continue; }
    if (r.flavours && !r.fridge.some((x) => FLAVOURS[x])) { problems.push(`${id}: wants a flavour and the fridge has none`); continue; }

    const wanted = [...r.ingredients, ...(r.flavours ? [r.fridge.find((x) => FLAVOURS[x])] : [])];
    wanted.forEach((x, i) => {
      if (kit.doughReady()) problems.push(`${id}: the bowl was ready with ${i} of ${wanted.length} in`);
      kit.add(x);
      if (i === 0 && kit.add(x)) problems.push(`${id}: ${x} went in twice`);
    });
    if (!kit.doughReady()) problems.push(`${id}: still not ready, missing ${kit.missingList().join(', ')}`);
    if (kit.missingList().length) problems.push(`${id}: says it still needs ${kit.missingList().join(', ')}`);
    const f = kit.flow();
    if (f[0] !== 'mix' || f[f.length - 1] !== 'serve' || !f.includes('bake')) problems.push(`${id}: the stages run ${f.join(' > ')}`);

    const before = kit.counts[id];
    let bites = 0, gone = false;
    while (!gone && bites < 20) { gone = kit.takeBite(); bites++; }
    if (bites !== BITES) problems.push(`${id}: ${bites} bites to finish`);
    kit.finished();
    if (kit.counts[id] !== before + 1) problems.push(`${id}: the count went ${before} to ${kit.counts[id]}`);
    made.push(`${id} (${wanted.length} in, ${f.length} stages)`);
  }
  if (saved.length !== made.length) problems.push(`${saved.length} saves asked for, for ${made.length} made`);
  return {
    pass: !problems.length,
    detail: (problems.length ? problems.join(' | ') + ' -- ' : '') +
      `${made.length} of ${Object.keys(RECIPES).length} made: ${made.join(', ')}; cooking level ${kit.cookLevel()}`,
  };
}
