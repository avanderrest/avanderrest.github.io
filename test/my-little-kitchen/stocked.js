/* Everything is out in the painted room, once each, and nothing stands in anything else.

   Since 2026-10-14 the kitchen is always fully stocked (STOCK in sim.js) so you can mix
   whatever you like: the dry goods on the two left-hand boards, the cold things in the
   fridge, the yeast, spices and flavours in the pair of cupboards by the sink. A thing that
   is missing, doubled, overlapping another or off the picture cannot be tapped, and the
   recipes that need it could never be found. Also: every picture the room uses loads. */
return (async () => {
  const K = window.__kitchen;
  if (!K) return JSON.stringify({ pass: false, detail: 'window.__kitchen is not exposed' });
  const S = K.state;
  const problems = [];
  S.recipe = null; S.phase = 'bowl'; S.added = []; S.doors = {};
  K.renderKitchen();
  const room = document.getElementById('svg');
  const items = [...room.querySelectorAll('.k-item')];
  const want = [...K.STOCK.boards.flat(), ...K.STOCK.fridge, ...K.STOCK.pair, 'bowl'];
  for (const w of want) {
    const n = items.filter((g) => g.dataset.id === w).length;
    if (n !== 1) problems.push(`${w} x${n}`);
  }
  for (const r of Object.values(K.RECIPES)) {
    const gone = r.ingredients.filter((i) => i !== 'water' && !want.includes(i));
    if (gone.length) problems.push(`${r.id} needs ${gone.join(', ')}, which is not out`);
  }
  const frame = room.getBoundingClientRect();
  const boxes = items.map((g) => ({ id: g.dataset.id, b: g.querySelector('rect').getBoundingClientRect() }));
  for (const { id, b } of boxes) {
    if (b.left < frame.left - 1 || b.right > frame.right + 1 || b.top < frame.top - 1 || b.bottom > frame.bottom + 1) problems.push(`${id} off the picture`);
  }
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const p = boxes[i].b, q = boxes[j].b;
      const ox = Math.min(p.right, q.right) - Math.max(p.left, q.left);
      const oy = Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top);
      if (ox > 2 && oy > 2) problems.push(`${boxes[i].id} overlaps ${boxes[j].id}`);
    }
  }
  const hrefs = new Set();
  document.querySelectorAll('#svg image').forEach((im) => hrefs.add(im.getAttribute('href')));
  for (const k of Object.keys(K.ICON)) {
    const m = /href="([^"]+)"/.exec(typeof K.ICON[k] === 'string' ? K.ICON[k] : '');
    if (m) hrefs.add(m[1]);
  }
  hrefs.add('assets/wall.jpg');
  for (const h of hrefs) {
    const ok = await new Promise((res) => { const im = new Image(); im.onload = () => res(im.naturalWidth > 0); im.onerror = () => res(false); im.src = h; });
    if (!ok) problems.push(`did not load: ${h}`);
  }
  S.recipe = null; S.phase = 'bowl'; S.added = []; S.doors = {};
  K.renderKitchen();
  return JSON.stringify({
    pass: problems.length === 0,
    detail: `${items.length} things out (${K.STOCK.fridge.length} in the fridge, ${K.STOCK.boards.flat().length} on the boards, ${K.STOCK.pair.length} by the sink); ${hrefs.size} pictures loaded`
      + (problems.length ? ' -- ' + problems.slice(0, 8).join('; ') : ''),
  });
})();
