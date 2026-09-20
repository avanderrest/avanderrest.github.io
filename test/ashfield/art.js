/* Every painted piece the game asks for actually arrives.

   Since the reskin, the village, the pile and the address book are Amber's own sprites
   rather than drawn SVG, and a mistyped or missing file fails silently: a broken <img>
   with alt="" is a zero-by-zero box, so a house, a face or an envelope simply is not
   there and the map still looks plausible. Nothing else would catch it.

   The run walks the days so the pile turns over — a letter only shows its sender's
   envelope on the day it arrives — and checks three things:

   1. Every <img> that has been rendered has decoded to a real bitmap.
   2. Every house the post can go to has art, and every villager a portrait.
   3. Every envelope the sheet was cut for is actually reachable from the pile, so a
      paper nobody is ever sent is caught as dead weight rather than shipped. */
return (async () => {
  const A = window.__ashfield;
  if (!A) return JSON.stringify({ pass: false, detail: 'no window.__ashfield' });

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const seen = new Map();          // src -> ok
  const broken = [];

  function sweep() {
    document.querySelectorAll('img').forEach((im) => {
      const src = im.getAttribute('src') || '';
      if (!src || seen.has(src)) return;
      const ok = im.complete && im.naturalWidth > 0;
      seen.set(src, ok);
      if (!ok) broken.push(src);
    });
  }

  A.startNew('Amber');
  await wait(300);
  sweep();

  // walk the fortnight so every day's post, and every sender's paper, gets rendered
  for (let d = 1; d <= 12; d++) {
    A.goToDay(d);
    await wait(120);
    sweep();
    // open the book at each villager in turn, for the portraits on the tabs
    document.querySelectorAll('.book-tabs .tab').forEach((t) => t.click());
    await wait(60);
    sweep();
  }

  // decoding can lag the sweep on a cold cache; give anything still pending a moment
  await wait(400);
  const stillBroken = [];
  document.querySelectorAll('img').forEach((im) => {
    if (!(im.complete && im.naturalWidth > 0)) stillBroken.push(im.getAttribute('src'));
  });

  const problems = [];
  const missed = broken.filter((s) => stillBroken.indexOf(s) !== -1);
  if (missed.length) problems.push('did not load: ' + missed.join(', '));

  // 2. every door on the map carries art, and every villager a face
  const C = A.content;
  const houses = Array.prototype.slice.call(document.querySelectorAll('.pbhouse'));
  const artless = houses.filter((h) => !h.querySelector('.pbb')).length;
  if (artless) problems.push(artless + ' house(s) on the map have no art at all');
  const faces = Object.keys(C.villagers).filter((k) => !seen.has('assets/who/head/' + k + '.png'));
  if (faces.length) problems.push('no portrait rendered for: ' + faces.join(', '));

  // 3. every envelope cut from her sheet is reachable
  const wanted = ['marion', 'penry', 'tom', 'wren', 'sam', 'edith', 'return', 'plain', 'unsigned'];
  const unused = wanted.filter((w) => !seen.has('assets/env/' + w + '.png'));
  if (unused.length) problems.push('envelope never used: ' + unused.join(', '));

  const imgs = seen.size;
  return JSON.stringify({
    pass: problems.length === 0,
    detail: problems.length
      ? problems.join('; ')
      : imgs + ' distinct images over 12 days, all decoded; '
        + houses.length + ' houses with art, '
        + Object.keys(C.villagers).length + ' portraits, '
        + (wanted.length - unused.length) + '/' + wanted.length + ' envelopes used',
  });
})();
