/* The painted room has to stay playable when the shed is full.

   On a desktop screen the shed is Amber's painted plate, and everything you use
   is set on it at fixed places: eight pots on two shelves, the pinboard on the
   boards by the door, four vases on the left-hand shelf, the bucket along the
   back of the table, the order ticket, the book and the can along the front. Nothing about that fails loudly — a
   pot that stands in mid-air, a pinboard pushed under the table, a can cropped
   off the edge, or a painting that never loaded all still leave a working page.

   So, with every pot in use and the table crowded: the plate is on, each pot
   stands on its shelf, everything you click is fully on screen, no two of them
   sit on top of each other, and every picture the room uses actually loaded. */
return (async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const G = window.__gardenShed;
  if (!G) return JSON.stringify({ pass: false, detail: 'window.__gardenShed is not exposed' });

  // move in, if the intro is up
  const name = document.querySelector('.sheet input[type="text"]');
  if (name) { name.value = 'Test'; name.dispatchEvent(new Event('input', { bubbles: true })); }
  const begin = [...document.querySelectorAll('.sheet button')].find((b) => /take the key|open up again|move in/i.test(b.textContent));
  if (begin) begin.click();
  await sleep(600);
  const S = G.S;
  if (!S) return JSON.stringify({ pass: false, detail: 'no game state after the intro' });

  // a full shed: eight pots in every state, a full bucket, notes, packets, and a
  // customer at the door whose order is on the table
  const pot = (crop, progress, extra) => ({ crop, progress, dry: 0, wilted: false, picks: 0, ...extra });
  const days = (k) => G.FLOWERS[k.split('-')[0]].days;
  S.pots = [
    pot('rose-red', days('rose-red')), pot('tulip-yellow', 0), pot('daisy-white', days('daisy-white')),
    pot('sweetpea-pink', 2, { dry: 2 }), pot('forgetmenot-blue', 3), pot('tulip-red', 2, { wilted: true, dry: 3 }),
    { crop: null, progress: 0, dry: 0, wilted: false, picks: 0 }, pot('sunflower-yellow', days('sunflower-yellow')),
  ];
  S.bucket = ['rose-red', 'rose-white', 'tulip-yellow', 'tulip-red', 'daisy-white', 'sweetpea-pink', 'forgetmenot-blue', 'sunflower-yellow']
    .map((k, i) => ({ k, n: 2 + (i % 3), age: i % 4 }));
  S.packets = [{ k: 'sweetpea-white', n: 2 }, { k: 'sunflower-yellow', n: 1 }];
  S.notes.push({ id: 't-n1', text: 'More white for funerals', done: false });
  S.shop = { open: true, done: false, left: 2, total: 4, cust: { id: 't-o', who: 'A lady in a good hat', face: '👩‍🦳', want: 'sorry', extras: [{ t: 'noColour', v: 'red' }], story: 'x', accepted: true } };
  S.notes.push({ id: 't-n2', text: 'A lady in a good hat — says sorry', done: false, order: 't-o' });
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
    ['bucket', document.querySelector('#counter .tray')],
    ['ticket', document.getElementById('ticket')],
    ['book', document.getElementById('btn-cook')],
    ...[...document.querySelectorAll('.vase')].map((v, i) => [`vase ${i}`, v]),
    ['can', document.getElementById('can')],
    ...[...document.querySelectorAll('.packet')].map((p, i) => [`packet ${i}`, p]),
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
  // the bucket scrolls sideways, but nothing may be cut off along its top edge
  const items = [...document.querySelectorAll('#counter .counter-item')];
  const clipped = items.filter((el) => el.getBoundingClientRect().top < tray.top).length;
  if (clipped) problems.push(`${clipped} bucket item(s) poke out of the top of the tray`);

  return JSON.stringify({
    pass: problems.length === 0,
    detail: problems.length
      ? problems.slice(0, 8).join('; ')
      : `${innerWidth}x${innerHeight}, scale ${k.toFixed(2)}: ${urls.size} pictures loaded, ${pots.length} pots within ${worstShelf.toFixed(1)}px of their shelves, ${boxes.length} clickable things on screen and clear of each other`,
  });
})();
