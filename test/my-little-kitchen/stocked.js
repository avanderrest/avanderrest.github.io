/* Every recipe has to be makeable from the painted room.

   The kitchen is Amber's room plate, and things stand in fixed places on it:
   eight spots on the fridge shelves, two wall boards for the dry goods. A recipe
   that asks for more than those hold, or a sprite that fails to load, does not
   break anything you would notice at a glance -- an ingredient simply is not
   there to tap, or two jars stand inside each other, and that recipe can never
   be finished.

   So, for every recipe: each ingredient it needs (and each flavour, where you
   pick one) is in the room exactly once, nothing overlaps anything else, and
   every picture the room uses actually loaded. */
return (async () => {
  const K = window.__kitchen;
  if (!K) return JSON.stringify({ pass: false, detail: 'window.__kitchen is not exposed' });
  const S = K.state;
  const problems = [];
  let most = { fridge: 0, shelf: 0 };

  for (const [id, r] of Object.entries(K.RECIPES)) {
    S.recipe = id;
    S.phase = 'bowl';
    S.added = [];
    K.renderKitchen();
    const room = document.getElementById('svg');
    const items = [...room.querySelectorAll('.k-item')];
    const want = r.ingredients.filter((i) => i !== 'water').concat(r.flavours ? ['chocolate', 'strawberry', 'vanilla', 'lemon'] : [], ['bowl']);
    for (const w of want) {
      const n = items.filter((g) => g.dataset.id === w).length;
      if (n !== 1) problems.push(`${id}: ${w} x${n}`);
    }
    most.fridge = Math.max(most.fridge, room.querySelectorAll('#kfridge .k-item').length);
    most.shelf = Math.max(most.shelf, room.querySelectorAll('#kshelves .k-item').length);

    // each thing's tap box, on screen: none may sit inside another, or off the picture
    const frame = room.getBoundingClientRect();
    const boxes = items.map((g) => ({ id: g.dataset.id, b: g.querySelector('rect').getBoundingClientRect() }));
    for (const { id: a, b } of boxes) {
      if (b.left < frame.left - 1 || b.right > frame.right + 1 || b.top < frame.top - 1 || b.bottom > frame.bottom + 1) problems.push(`${id}: ${a} off the picture`);
    }
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const p = boxes[i].b, q = boxes[j].b;
        const ox = Math.min(p.right, q.right) - Math.max(p.left, q.left);
        const oy = Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top);
        if (ox > 2 && oy > 2) problems.push(`${id}: ${boxes[i].id} overlaps ${boxes[j].id}`);
      }
    }
  }

  // every picture the room and its things draw from has to load
  const hrefs = new Set();
  for (const r of Object.values(K.RECIPES)) {
    S.recipe = r.id; S.phase = 'bowl'; K.renderKitchen();
    document.querySelectorAll('#svg image').forEach((im) => hrefs.add(im.getAttribute('href')));
  }
  for (const k of Object.keys(K.ICON)) {
    const m = /href="([^"]+)"/.exec(typeof K.ICON[k] === 'string' ? K.ICON[k] : '');
    if (m) hrefs.add(m[1]);
  }
  hrefs.add('assets/wall.jpg');
  const bad = [];
  for (const h of hrefs) {
    const ok = await new Promise((res) => { const im = new Image(); im.onload = () => res(im.naturalWidth > 0); im.onerror = () => res(false); im.src = h; });
    if (!ok) bad.push(h);
  }
  bad.forEach((h) => problems.push(`did not load: ${h}`));

  // leave it where a player would find it
  S.recipe = null; S.phase = 'recipe'; S.added = [];
  K.renderKitchen();

  return JSON.stringify({
    pass: problems.length === 0,
    detail: `${Object.keys(K.RECIPES).length} recipes; most on the fridge ${most.fridge}/8, on the boards ${most.shelf}; ${hrefs.size} pictures loaded`
      + (problems.length ? ' -- ' + problems.slice(0, 8).join('; ') : ''),
  });
})();
