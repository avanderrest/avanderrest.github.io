/* All three places have to stay playable when they are full.

   The shed is Amber's painted plate, with everything you use set on it at fixed
   places: four vases on the left-hand
   shelf, ribbon above them, the cut flowers on the right-hand shelves, the book
   and a mat for the vase being filled along the front of the table. The garden has eight pots on two tiers of staging, the seed
   packets and the can; the stall has the customer, the sign and the counter.
   An arrow at either edge goes between them. Nothing about any of that fails
   loudly — a pot standing in mid-air, a vase under the pinboard, an arrow over
   the can, or a painting that never loaded all still leave a working page.

   So, with every pot in use, a full bucket and a customer waiting: in each place,
   everything you click is fully on screen and no two of them sit on top of each
   other; every pot in the garden stands on its plank; and every picture any of
   the three uses actually loaded. */
return (async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const G = window.__gardenShed;
  if (!G) return JSON.stringify({ pass: false, detail: 'window.__gardenShed is not exposed' });

  // a fresh shop, then crowd it: eight pots in every state, a full bucket, notes,
  // packets, and a customer whose order is on the ticket
  const S = G.fresh('Test');
  const pot = (crop, progress, extra) => ({ crop, progress, dry: 0, wilted: false, picks: 0, ...extra });
  const days = (k) => G.FLOWERS[k.split('-')[0]].days;
  S.pots = [
    pot('rose-red', days('rose-red')), pot('tulip-yellow', 0), pot('daisy-white', days('daisy-white')),
    pot('sweetpea-pink', 2, { dry: 2 }), pot('forgetmenot-blue', 3), pot('tulip-red', 2, { wilted: true, dry: 3 }),
    { crop: null, progress: 0, dry: 0, wilted: false, picks: 0 }, pot('sunflower-yellow', days('sunflower-yellow')),
  ];
  S.bucket = ['rose-red', 'rose-white', 'tulip-yellow', 'tulip-red', 'daisy-white', 'sweetpea-pink', 'forgetmenot-blue', 'sunflower-yellow']
    .map((k, i) => ({ k, n: 2 + (i % 3), age: i % 4 }));
  S.packets = [{ k: 'sweetpea-white', n: 2 }, { k: 'sunflower-yellow', n: 1 }, { k: 'rose-pink', n: 1 }];
  S.shop = { today: 0, paused: false, last: null, cust: { id: 't-o', who: 'A lady in a good hat', face: '👩‍🦳', want: 'sorry', extras: [{ t: 'noColour', v: 'red' }], story: 'x', accepted: true } };
  S.bench = { vase: 'jug', stems: ['rose-red', 'tulip-yellow', 'daisy-white'], ribbon: 'pink' };
  S.made = [
    { id: 'm1', vid: 'jar', stems: ['tulip-red', 'tulip-yellow', 'daisy-white'], ribbon: null, age: 0 },
    { id: 'm2', vid: 'bottle', stems: ['rose-red', 'rose-white'], ribbon: 'red', age: 3 },
    { id: 'm3', vid: 'urn', stems: ['sweetpea-pink', 'rose-red', 'tulip-red', 'daisy-white', 'forgetmenot-blue', 'tulip-yellow', 'rose-white'], ribbon: 'blue', age: 1 },
    { id: 'm4', vid: 'jug', stems: ['sunflower-yellow', 'tulip-yellow'], ribbon: 'yellow', age: 0 },
  ];
  G.render();
  await sleep(300);

  const problems = [];
  const stage = document.getElementById('stage').getBoundingClientRect();
  const byId = (id) => document.getElementById(id);
  const all = (sel) => [...document.querySelectorAll(sel)];

  // everything you click in one place: on screen, and clear of everything else you click
  function checkPlace(label, things) {
    const boxes = things.filter(([, el]) => el).map(([n, el]) => [n, el.getBoundingClientRect()]);
    for (const [n, b] of boxes) {
      if (b.width < 2 || b.height < 2) { problems.push(`${label}: ${n} has no size`); continue; }
      // the shed's doorway runs up to the ceiling, which the fit may crop a little
      if (n === 'door') {
        const seen = (Math.min(b.bottom, stage.bottom) - Math.max(b.top, stage.top)) / b.height;
        if (seen < 0.85) problems.push(`${label}: only ${Math.round(seen * 100)}% of the door is on screen`);
      } else if (b.left < stage.left - 1 || b.right > stage.right + 1 || b.top < stage.top - 1 || b.bottom > stage.bottom + 1) {
        problems.push(`${label}: ${n} runs off the screen`);
      }
    }
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const [a, p] = boxes[i], [b, q] = boxes[j];
        // the pots' own buttons meet across the staging, and the vases' across the shelf
        const same = (w) => a.startsWith(w) && b.startsWith(w);
        if (same('pot') || same('vase') || same('stock') || same('ribbon') || same('bench') || same('made')) continue;
        const ox = Math.min(p.right, q.right) - Math.max(p.left, q.left);
        const oy = Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top);
        if (ox > 3 && oy > 3) problems.push(`${label}: ${a} overlaps ${b}`);
      }
    }
    return boxes.length;
  }
  const arrows = () => [['left arrow', byId('nav-left')], ['right arrow', byId('nav-right')]]
    .filter(([, el]) => !el.classList.contains('hidden'));

  // ---- the shed ----
  G.goTo(1);
  await sleep(450);
  const shed = byId('sill-scene');
  if (!shed.classList.contains('gs-plate')) problems.push(`the painted plate is off at ${innerWidth}x${innerHeight}`);
  const nShed = checkPlace('shed', [
    ['door', byId('btn-door')],
    ...all('#pantry .stock-item').map((el, i) => [`stock ${i}`, el]),
    ...all('#ribbons .spool').map((el, i) => [`ribbon ${i}`, el]),
    ['book', byId('btn-cook')],
    ['bench mat', byId('bench')],
    ['bench vase', document.querySelector('.bench-vase')],
    ['bench give', byId('bench-give')],
    ['bench back', byId('bench-back')],
    ['bench says', document.querySelector('.bench-says')],
    ...all('.vase').map((v, i) => [`vase ${i}`, v]),
    ...arrows(),
    ['goals', byId('goals')],
  ]);
  // the flowers stand on the right-hand shelves: row one on y=152, row two on y=260
  const k = shed.getBoundingClientRect().width / 1376;
  const top = shed.getBoundingClientRect().top;
  all('#pantry .stock-item').forEach((el, i) => {
    const foot = (el.querySelector('.jar').getBoundingClientRect().bottom - top) / k;
    if (Math.abs(foot - (i < 5 ? 152 : 260)) > 4) problems.push(`flowers ${i} stand at y=${Math.round(foot)}, not on their shelf`);
  });

  // ---- the garden: every pot on its plank ----
  G.goTo(0);
  await sleep(450);
  const pots = all('#pots .pot');
  const plankTop = (i) => {
    // the planks are drawn at the bottom of each 132px (or 116px) row of the staging
    const grid = byId('pots');
    const row = parseFloat(getComputedStyle(grid).gridAutoRows);
    return grid.getBoundingClientRect().top + row * (Math.floor(i / 4) + 1) - (row - (row === 116 ? 104 : 118));
  };
  let worstPlank = 0;
  pots.forEach((p, i) => {
    const foot = p.querySelector('.gs-pot .gs-p').getBoundingClientRect().bottom;
    const off = Math.abs(foot - plankTop(i));
    worstPlank = Math.max(worstPlank, off);
    if (off > 4) problems.push(`pot ${i} stands ${Math.round(foot - plankTop(i))}px off its plank`);
  });
  const nGarden = checkPlace('garden', [
    ...pots.map((p, i) => [`pot ${i}`, p]),
    ...all('#packets .packet').map((p, i) => [`packet ${i}`, p]),
    ['can', byId('can')],
    ...arrows(),
  ]);

  // ---- the stall ----
  G.goTo(2);
  await sleep(450);
  const nStall = checkPlace('stall', [
    ['customer', byId('customer')],
    ['dialog', byId('dialog')],
    ...all('#stall-made .made-item').map((el, i) => [`made ${i}`, el]),
    ...arrows(),
    ['goals', byId('goals')],
  ]);
  if (!byId('customer').classList.contains('here')) problems.push('nobody at the stall though an order is waiting');
  if (byId('dialog').classList.contains('hidden')) problems.push('no words on screen from the customer waiting at the stall');
  // the price board and the sign are things you click, too
  checkPlace('stall furniture', [['price board', byId('price-board')], ['sign', byId('door-sign')], ['dialog', byId('dialog')], ['customer', byId('customer')]]);
  G.goTo(1);

  // every picture: the <img>s in all three places, and everything drawn as a CSS background
  const urls = new Set(all('#stage img').map((i) => i.getAttribute('src')).filter((u) => !u.startsWith('data:')));
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

  return JSON.stringify({
    pass: problems.length === 0,
    detail: problems.length
      ? problems.slice(0, 8).join('; ')
      : `${innerWidth}x${innerHeight}: ${urls.size} pictures loaded; shed ${nShed}, garden ${nGarden}, stall ${nStall} clickable things on screen and clear of each other; ${pots.length} pots within ${worstPlank.toFixed(1)}px of their planks`,
  });
})();
