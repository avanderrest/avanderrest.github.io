/* What the kitchen keeps between visits, it keeps right.

   The kitchen saves nothing but how many of each thing you have made, one key per recipe
   (mlk-count-<id>), and the cooking level comes from the total. In Node, against a
   pretend storage: an old visitor's counts from the first version (mlk-cakes and
   mlk-pizzas) come across; make a few things and every count is written under its own
   key; a fresh kitchen reading that storage back has the same counts and the same level;
   a junk value reads as nothing made. */
import { createKitchen, readCounts, countKey, RECIPES } from '../../my-little-kitchen/sim.js';

export default function () {
  const problems = [];
  const store = new Map([['mlk-cakes', '4'], ['mlk-pizzas', '2'], ['mlk-count-scone', 'lots']]);
  const get = (key) => (store.has(key) ? store.get(key) : null);
  const counts = readCounts(get);
  if (counts.cake !== 4 || counts.pizza !== 2) problems.push(`the first version's counts read as cake ${counts.cake}, pizza ${counts.pizza}`);
  if (counts.scone !== 0) problems.push(`a junk count read as ${counts.scone}`);
  if (Object.keys(counts).length !== Object.keys(RECIPES).length) problems.push(`${Object.keys(counts).length} counts for ${Object.keys(RECIPES).length} recipes`);

  const kit = createKitchen({ counts, on: (ev, id) => { if (ev === 'save') store.set(countKey(id), String(counts[id])); } });
  for (const id of ['cake', 'tart', 'tart', 'flapjack']) {
    kit.state = kit.freshState();
    kit.choose(id);
    kit.finished();
  }
  const level = kit.cookLevel();

  const again = readCounts(get);
  for (const id of Object.keys(RECIPES)) {
    if (again[id] !== counts[id]) problems.push(`${id}: ${counts[id]} made, ${again[id]} read back`);
  }
  if (store.get('mlk-count-cake') !== '5') problems.push(`cakes stored as ${store.get('mlk-count-cake')}`);
  const fresh = createKitchen({ counts: again });
  if (fresh.cookLevel() !== level) problems.push(`level ${level} came back as ${fresh.cookLevel()}`);

  return {
    pass: !problems.length,
    detail: (problems.length ? problems.join(' | ') + ' -- ' : '') +
      `read back cake ${again.cake}, pizza ${again.pizza}, tart ${again.tart}, flapjack ${again.flapjack}, ` +
      `${fresh.bakedTotal()} made in all, cooking level ${fresh.cookLevel()}`,
  };
}
