/* The painted room has to stay playable when the shed is full.

   On a desktop screen the shed is Amber's painted plate, and everything you use
   is set on it at fixed places: eight pots on two shelves, the pinboard on the
   boards by the door, the pantry along the back of the table, the board, the
   cookbook and the can along the front. Nothing about that fails loudly — a
   pot that stands in mid-air, a pinboard pushed under the table, a can cropped
   off the edge, or a painting that never loaded all still leave a working page.

   So, with every pot in use and the table crowded: the plate is on, each pot
   stands on its shelf, everything you click is fully on screen, no two of them
   sit on top of each other, and every picture the room uses actually loaded. */
return (async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const G = window.__cottage;
  if (!G) return JSON.stringify({ pass: false, detail: 'window.__cottage is not exposed' });

  // move in, if the intro is up
  const name = document.querySelector('.sheet input[type="text"]');
  if (name) { name.value = 'Test'; name.dispatchEvent(new Event('input', { bubbles: true })); }
  const begin = [...document.querySelectorAll('.sheet button')].find((b) => /move in|carry on|continue/i.test(b.textContent));
  if (begin) begin.click();
  await sleep(600);
  const S = G.S;
  if (!S) return JSON.stringify({ pass: false, detail: 'no game state after the intro' });

  // a full shed: eight pots in every state, a big pantry, notes, cards and packets
  const pot = (crop, progress, extra) => ({ crop, progress, dry: 0, wilted: false, picks: 0, ...extra });
  S.pots = [
    pot('strawberry', G.ITEMS.strawberry.days), pot('potato', 0), pot('lettuce', G.ITEMS.lettuce.days),
    pot('carrot', 2, { dry: 2 }), pot('courgette', 3), pot('tomato', 2, { wilted: true, dry: 3 }),
    { crop: null, progress: 0, dry: 0, wilted: false, picks: 0 }, pot('onion', G.ITEMS.onion.days),
  ];
  Object.assign(S.pantry, { carrot: 4, tomato: 2, garlic: 1, onion: 3, apple: 2, courgette: 1, lettuce: 2, honey: 1, milk: 1 });
  S.table = { potato: 1, carrot: 1 };
  S.sill.push({ id: 't-n1', kind: 'note', text: 'Two carrots, when you can', done: false });
  S.sill.push({ id: 't-r1', kind: 'recipe', recipe: 'onion_soup', from: 'Wren' });
  S.sill.push({ id: 't-s1', kind: 'seeds', crop: 'onion', from: 'Wren', n: 2 });
  S.shelf = ['jacket_potato'];
  document.querySelector('#goals')?.classList.add('hidden');
  G.render();
  await sleep(300);

  const problems = [];
  const shed = document.getElementById('sill-scene');
  if (!shed.classList.contains('gs-plate')) {
    return JSON.stringify({ pass: false, detail: `the painted plate is off at ${innerWidth}x${innerHeight}` });
  }

  // every picture: the <img>s in the room, and the plate and props drawn as CSS backgrounds
  const urls = new Set([...shed.querySelectorAll('img')].map((i) => i.getAttribute('src')));
  for (const sheet of document.styleSheets) {
    let rules = [];
    try { rules = [...sheet.cssRules]; } catch (_) { continue; }
    for (const r of rules) {
      for (const m of (r.cssText || '').matchAll(/url\("?(assets\/[^")]+\.(?:png|jpe?g|webp))"?\)/g)) urls.add(m[1]);
    }
  }
  const broken = [];
  await Promise.all([...urls].map((u) => new Promise((res) => {
    const im = new Image();
    im.onload = () => { if (!im.naturalWidth) broken.push(u); res(); };
    im.onerror = () => { broken.push(u); res(); };
    im.src = u;
  })));
  if (broken.length) problems.push(`did not load: ${broken.join(', ')}`);

  // each pot stands on its shelf: row one on y=152, row two on y=260, in plate pixels
  const k = shed.getBoundingClientRect().width / 1376;
  const top = shed.getBoundingClientRect().top;
  const pots = [...document.querySelectorAll('#pots .pot')];
  let worstShelf = 0;
  pots.forEach((p, i) => {
    const art = p.querySelector('.gs-pot .gs-p');
    const foot = (art.getBoundingClientRect().bottom - top) / k;
    const off = Math.abs(foot - (i < 4 ? 152 : 260));
    worstShelf = Math.max(worstShelf, off);
    if (off > 4) problems.push(`pot ${i} stands ${Math.round(foot)}px down, not on its shelf`);
  });

  // everything you click: on screen, and not on top of anything else you click
  const stage = document.getElementById('stage').getBoundingClientRect();
  const tray = document.querySelector('#counter .tray').getBoundingClientRect();
  const things = [
    ...pots.map((p, i) => [`pot ${i}`, p]),
    ['door', document.getElementById('btn-door')],
    ['pinboard', document.getElementById('pinboard')],
    ['pantry', document.querySelector('#counter .tray')],
    ['board', document.querySelector('.prep .board')],
    ['make', document.getElementById('btn-make')],
    ['cookbook', document.getElementById('btn-cook')],
    ['can', document.getElementById('can')],
    ...[...document.querySelectorAll('.packet')].map((p, i) => [`packet ${i}`, p]),
    ...[...document.querySelectorAll('.tcard')].map((p, i) => [`card ${i}`, p]),
  ];
  const boxes = things.map(([n, el]) => [n, el.getBoundingClientRect()]);
  for (const [n, b] of boxes) {
    if (b.width < 2 || b.height < 2) { problems.push(`${n} has no size`); continue; }
    // The doorway runs up to the ceiling, which the fit is allowed to crop a little;
    // it only has to be clickable. Everything else has to be wholly on screen.
    if (n === 'door') {
      const seen = (Math.min(b.bottom, stage.bottom) - Math.max(b.top, stage.top)) / b.height;
      if (seen < 0.85) problems.push(`only ${Math.round(seen * 100)}% of the door is on screen`);
    } else if (b.left < stage.left - 1 || b.right > stage.right + 1 || b.top < stage.top - 1 || b.bottom > stage.bottom + 1) {
      problems.push(`${n} runs off the screen`);
    }
  }
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const [a, p] = boxes[i], [b, q] = boxes[j];
      // the pots' own buttons are wider than the paintings and meet across the shelf
      if (a.startsWith('pot') && b.startsWith('pot')) continue;
      const ox = Math.min(p.right, q.right) - Math.max(p.left, q.left);
      const oy = Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top);
      if (ox > 3 && oy > 3) problems.push(`${a} overlaps ${b}`);
    }
  }
  // the pantry scrolls sideways, but nothing may be cut off along its top edge
  const items = [...document.querySelectorAll('#counter .counter-item, #counter .dish')];
  const clipped = items.filter((el) => el.getBoundingClientRect().top < tray.top).length;
  if (clipped) problems.push(`${clipped} pantry item(s) poke out of the top of the tray`);

  return JSON.stringify({
    pass: problems.length === 0,
    detail: problems.length
      ? problems.slice(0, 8).join('; ')
      : `${innerWidth}x${innerHeight}, scale ${k.toFixed(2)}: ${urls.size} pictures loaded, ${pots.length} pots within ${worstShelf.toFixed(1)}px of their shelves, ${boxes.length} clickable things on screen and clear of each other`,
  });
})();
