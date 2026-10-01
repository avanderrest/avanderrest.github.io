/* Eating is one bite per tap, for every recipe.

   Pressing Eat used to take the first bite on its own, before the player had
   touched the food. So for each recipe this serves it, presses Eat, waits, and
   checks nothing was eaten yet; then taps the middle of the food with real
   clicks and checks each tap takes exactly one more bite, that a bite hole
   appears in the picture each time, and that it is only "all gone" after the
   last one. Candles are blown first where the food has them. */
return (async () => {
  const K = window.__kitchen;
  if (!K || !K.renderServe) return JSON.stringify({ pass: false, detail: 'window.__kitchen.renderServe is not exposed' });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const problems = [];
  const seen = [];

  // a point that is food: the middle of the food's own picture, nudged until it hits
  const foodSpot = () => {
    const g = document.getElementById('cakeWrap');
    const b = g.getBoundingClientRect();
    return [b.left + b.width / 2, b.top + b.height * 0.55];
  };
  const tap = (x, y) => {
    const el = document.elementFromPoint(x, y);
    if (el) el.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y }));
  };
  const button = (word) => [...document.querySelectorAll('.go-btn')].find((b) => b.textContent.includes(word));

  for (const id of Object.keys(K.RECIPES)) {
    K.state = K.freshState();
    const S = K.state;
    S.recipe = id;
    S.baked = true; S.out = true;
    K.renderServe();
    await sleep(150);

    const blow = button('Blow');
    if (blow) { blow.click(); await sleep(1400); }
    const eat = button('Eat');
    if (!eat) { problems.push(`${id}: no Eat button`); continue; }
    eat.click();
    await sleep(700);
    if (!S.eating) { problems.push(`${id}: Eat did not start eating`); continue; }
    if (S.bites !== 0) problems.push(`${id}: ${S.bites} bite(s) taken before any tap`);

    const holes = () => document.querySelectorAll('#bites circle').length;
    let taps = 0;
    while (!S.gone && taps < 20) {
      // re-measure each time: bites wobble the food
      const [x, y] = foodSpot();
      const before = S.bites;
      tap(x, y);
      taps++;
      await sleep(60);
      if (S.bites !== before + 1) { problems.push(`${id}: tap ${taps} took ${S.bites - before} bites`); break; }
      if (holes() !== S.bites) problems.push(`${id}: ${S.bites} bites but ${holes()} holes drawn`);
      if (S.bites < 6 && S.gone) problems.push(`${id}: all gone after only ${S.bites} bites`);
      await sleep(S.bites >= 6 ? 500 : 0);
    }
    if (!S.gone) problems.push(`${id}: not all gone after ${taps} taps (${S.bites} bites)`);
    seen.push(`${id} ${taps}`);
  }

  return JSON.stringify({
    pass: problems.length === 0,
    detail: (problems.length ? problems.slice(0, 8).join('; ') + ' | ' : '') + 'taps to finish: ' + seen.join(', '),
  });
})();
