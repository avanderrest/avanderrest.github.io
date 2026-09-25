/* A customer has to be servable, and serving them has to pay.

   The order generator only ever asks for things the shed could have to hand, and
   picks extras (all yellow, no roses, something blue...) at random on top. Nothing
   stops those extras contradicting the meaning they asked for: "sympathy, all red"
   is an order nobody can fill well, and the only symptom is a player getting one
   star and not knowing why. So, for a few hundred orders over the first week and
   a half, search every bunch that could be made from what is in the bucket and
   the pots, in every vase, for the best it could score — and count the ones where
   the best possible is under two stars.

   Then play one through the real verbs: cut, open up, take the order, fill a jug,
   hand it over — and check the stems, the vase and the money all moved. */
return (async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const G = window.__gardenShed;
  if (!G) return JSON.stringify({ pass: false, detail: 'window.__gardenShed is not exposed' });

  // a fresh shop: cases share one page, and an earlier one may have left it crowded
  const S = G.fresh('Test');
  if (!S) return JSON.stringify({ pass: false, detail: 'no game state after the intro' });
  const problems = [];

  // ---- every order the first ten days produce can be made to two stars ----
  S.pots.forEach((p, i) => G.cutPot(i));
  const have = [...new Set([...S.bucket.map((b) => b.k), ...S.pots.filter((p) => p.crop).map((p) => p.crop)])];
  // every multiset of `have` of size n, as arrays
  function* bunches(n, from = 0, acc = []) {
    if (acc.length === n) { yield acc; return; }
    for (let i = from; i < have.length; i++) yield* bunches(n, i, acc.concat(have[i]));
  }
  const best = (o) => {
    let top = 0;
    for (const vid of Object.keys(G.VASES)) {
      for (let n = 1; n <= G.VASES[vid].holds; n++) {
        for (const b of bunches(n)) {
          const s = G.judge(o, b, vid, false).stars;
          if (s > top) top = s;
          if (top === 3) return 3;
        }
      }
    }
    return top;
  };
  let orders = 0;
  const under = [];
  const tally = [0, 0, 0, 0];
  for (let day = 1; day <= 10; day++) {
    S.dayCount = day;
    for (let k = 0; k < 30; k++) {
      const o = G.newOrder();
      // a stretch order wants a feeling nothing on the shelf says: that is a reason to
      // buy seed, not a broken order, so it is judged on the extras alone
      const reachableWant = !o.want || have.some((h) => G.FLOWERS[h.split('-')[0]].tag === o.want);
      const b = best(reachableWant ? o : { ...o, want: null });
      tally[b] += 1;
      orders += 1;
      if (b < 2) under.push(`${o.want || 'any'}+${o.extras.map((x) => `${x.t}:${x.v || ''}`).join('+') || 'nothing'}`);
    }
  }
  S.dayCount = 1;
  const underShare = under.length / orders;
  if (underShare > 0.03) problems.push(`${under.length} of ${orders} orders can't be made to two stars: ${[...new Set(under)].slice(0, 5).join(', ')}`);

  // ---- one order, played through ----
  const coins0 = S.coins;
  const jugs0 = S.vases.jug;
  const roses0 = S.bucket.filter((b) => b.k === 'rose-red').reduce((a, b) => a + b.n, 0);
  G.openShop();
  G.nextCustomer();
  const o = S.shop.cust;
  if (!o) problems.push('nobody came to the door after opening up');
  else {
    Object.assign(o, { want: 'love', extras: [], accepted: true });
    G.vaseClick('jug');
    ['rose-red', 'rose-red', 'tulip-red'].forEach(G.addToDraft);
    const give = document.getElementById('arr-give');
    if (!give || give.disabled) problems.push('no "Hand it over" button on the arranging sheet');
    else give.click();
    await sleep(100);
    const stars = document.querySelectorAll('.sheet .stars').length ? document.querySelector('.sheet .stars').getAttribute('aria-label') : 'no result sheet';
    const roses1 = S.bucket.filter((b) => b.k === 'rose-red').reduce((a, b) => a + b.n, 0);
    if (S.coins <= coins0) problems.push(`handing over paid nothing (${coins0} -> ${S.coins})`);
    if (S.vases.jug !== jugs0 - 1) problems.push(`the jug did not go out with the flowers (${jugs0} -> ${S.vases.jug})`);
    if (roses1 !== roses0 - 2) problems.push(`two roses went in but the bucket went ${roses0} -> ${roses1}`);
    if (!/^3 of 3/.test(stars)) problems.push(`two red roses and a red tulip for love scored ${stars}`);
    if (S.shop.cust) problems.push('the customer was still at the door after being served');
    var played = `love bunch: ${stars}, paid ${S.coins - coins0}`;
  }

  // ---- saying the one thing they asked not to caps it at a star ----
  const capped = G.judge({ want: 'love', extras: [{ t: 'noColour', v: 'red' }] }, ['rose-red', 'rose-red', 'rose-red'], 'jar', false).stars;
  if (capped > 1) problems.push(`red roses for "nothing red" still scored ${capped} stars`);

  return JSON.stringify({
    pass: problems.length === 0,
    detail: (problems.length ? problems.join('; ') + ' | ' : '')
      + `${orders} orders over days 1-10 from ${have.length} varieties: best possible ${tally.map((n, i) => `${i}★ ${n}`).join(', ')}; ${played || 'not played'}; forbidden colour capped at ${capped}★`,
  });
})();
