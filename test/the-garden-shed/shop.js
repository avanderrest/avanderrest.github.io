/* A customer has to be servable, and serving them has to pay.

   The order generator only ever asks for things the shed could have to hand, and
   picks extras (all yellow, no roses, something blue...) at random on top. Nothing
   stops those extras contradicting the meaning they asked for: "sympathy, all red"
   is an order nobody can fill well, and the only symptom is a player getting one
   star and not knowing why. So, for a few hundred orders over the first week and
   a half, search every bunch that could be made from what is in the bucket and
   the pots, in every vase, for the best it could score — and count the ones where
   the best possible is under two stars.

   Then play one through as a player would: open up, take the order off the screen,
   drag a jug onto the table and the flowers and a ribbon into it, drag one back
   out, hand it over — and check the stems, the vase and the money all moved. */
return (async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const G = window.__gardenShed;
  if (!G) return JSON.stringify({ pass: false, detail: 'window.__gardenShed is not exposed' });

  // a fresh shop: cases share one page, and an earlier one may have left it crowded
  const S = G.fresh('Test');
  if (!S) return JSON.stringify({ pass: false, detail: 'no game state' });
  // a new shop starts with the stall closed
  const startsClosed = S.shop.paused === true && document.getElementById('btn-pause').textContent === 'Stall closed';
  G.togglePause();
  const problems = [];
  if (!startsClosed) problems.push('a new shop did not start with the stall closed');

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
  const rep0 = S.rep;
  let extrasAtTop = 0;
  for (const rep of [5, 15, 25, 35, 45, 55, 65, 75, 85, 95]) {
    S.rep = rep;
    for (let k = 0; k < 30; k++) {
      const o = G.newOrder();
      // a stretch order wants a feeling nothing on the shelf says: that is a reason to
      // buy seed, not a broken order, so it is judged on the extras alone
      const reachableWant = !o.want || have.some((h) => G.FLOWERS[h.split('-')[0]].tag === o.want);
      const b = best(reachableWant ? o : { ...o, want: null });
      tally[b] += 1;
      orders += 1;
      if (b < 2) under.push(`${o.want || 'any'}+${o.extras.map((x) => `${x.t}:${x.v || ''}`).join('+') || 'nothing'}`);
      if (rep === 95) extrasAtTop += o.extras.length;
    }
  }
  S.rep = rep0;
  // a happy lane asks for more, and pays a higher base for it
  const lowBase = (() => { S.rep = 5; const o = G.newOrder(); S.rep = rep0; return o.base; })();
  const highBase = (() => { S.rep = 95; const o = G.newOrder(); S.rep = rep0; return o.base; })();
  if (extrasAtTop / 30 < 1) problems.push(`at 95% satisfaction orders average only ${(extrasAtTop / 30).toFixed(1)} extras`);
  if (!(highBase > lowBase)) problems.push(`base price at 95% (${highBase}) is not above 5% (${lowBase})`);
  const underShare = under.length / orders;
  if (underShare > 0.03) problems.push(`${under.length} of ${orders} orders can't be made to two stars: ${[...new Set(under)].slice(0, 5).join(', ')}`);

  // ---- one order, played through ----
  const coins0 = S.coins;
  const roses0 = S.bucket.filter((b) => b.k === 'rose-red').reduce((a, b) => a + b.n, 0);
  G.nextCustomer(false);
  const o = S.shop.cust;
  if (!o) problems.push('nobody came to the counter');
  else {
    // what they said is on screen at the stall, not in a popup
    const dlg = document.getElementById('dialog');
    if (!dlg || dlg.classList.contains('hidden')) problems.push('no words on screen at the stall');
    if (!document.getElementById('overlay').classList.contains('hidden')) problems.push('a popup opened for the customer');
    // a new id too, so the bubble is drawn afresh for the customer as rewritten here
    Object.assign(o, { id: `${o.id}-t`, want: 'love', extras: [], said: null, pages: null, qs: ['say', 'who'] });
    // the conversation: ask a question, page back to the first thing they said
    G.goTo(2);
    G.render();
    const bubble = () => document.querySelector('#dialog .dlg-text')?.textContent || '';
    document.getElementById('dialog').click(); // skip the typing
    const asked = bubble();
    document.getElementById('dlg-q-say')?.click();
    await sleep(50);
    document.getElementById('dialog').click();
    const you = document.querySelector('#dialog .dlg-you')?.textContent || '';
    const answer = bubble();
    if (!/what should it say/i.test(you) || !/love/i.test(answer)) problems.push(`asking what it should say got "${you}" / ${answer}`);
    if (document.getElementById('dlg-q-say')) problems.push('the question could be asked twice');
    document.getElementById('dlg-prev')?.click();
    await sleep(50);
    if (bubble() !== asked) problems.push(`the back arrow showed ${bubble()}, not what they first asked`);
    G.acceptOrder();
    await sleep(400);
    if (G.place !== 'view-sill') problems.push(`taking the order left you in ${G.place}, not the shed`);
    // back at the stall, they tell you again what they asked
    G.goTo(2);
    await sleep(100);
    document.getElementById('dialog').click();
    if (bubble() !== asked) problems.push(`going back to the stall showed ${bubble()}, not what they asked`);
    G.goTo(1);
    await sleep(300);
    // drag a jug off the shelf onto the table, two red roses and a red tulip into it, and a red ribbon
    const at = (el) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
    const dragTo = async (from, to) => {
      if (!from || !to) return false;
      const [x0, y0] = at(from);
      const [x1, y1] = at(to);
      from.dispatchEvent(new PointerEvent('pointerdown', { clientX: x0, clientY: y0, button: 0, bubbles: true, pointerId: 1 }));
      for (let i = 1; i <= 6; i++) document.dispatchEvent(new PointerEvent('pointermove', { clientX: x0 + ((x1 - x0) * i) / 6, clientY: y0 + ((y1 - y0) * i) / 6, bubbles: true, pointerId: 1 }));
      document.dispatchEvent(new PointerEvent('pointerup', { clientX: x1, clientY: y1, bubbles: true, pointerId: 1 }));
      await sleep(40);
      return true;
    };
    await dragTo(document.querySelector('[data-vase="jug"]'), document.getElementById('bench'));
    if (!S.bench || S.bench.vase !== 'jug') problems.push('dragging the jug onto the table did not put it there');
    for (const k of ['rose-red', 'rose-red', 'tulip-red']) {
      await dragTo(document.querySelector(`[data-stems="${k}"]`), document.querySelector('.bench-vase'));
    }
    await dragTo(document.querySelector('[data-ribbon="red"]'), document.querySelector('.bench-vase'));
    const inVase = S.bench ? `${S.bench.stems.join('+')}${S.bench.ribbon ? ` with ${S.bench.ribbon} ribbon` : ''}` : 'no vase';
    if (!S.bench || S.bench.stems.length !== 3 || S.bench.ribbon !== 'red') problems.push(`dragging into the vase gave ${inVase}`);
    // and a stem dragged back out comes out
    await dragTo(document.querySelector('.bench-vase [data-stem="2"]'), document.querySelector('[data-stems="daisy-white"]') || document.getElementById('btn-cook'));
    if (S.bench && S.bench.stems.length !== 2) problems.push(`dragging a stem out left ${S.bench.stems.length} in the vase`);
    await dragTo(document.querySelector('[data-stems="tulip-red"]'), document.querySelector('.bench-vase'));
    await sleep(350); // the click that follows a drag is swallowed for a moment
    document.getElementById('bench-give')?.click();
    await sleep(400);
    const last = S.shop.last;
    const roses1 = S.bucket.filter((b) => b.k === 'rose-red').reduce((a, b) => a + b.n, 0);
    if (!last) problems.push('handing it over left no result at the counter');
    if (G.place !== 'view-stall') problems.push(`handing it over left you in ${G.place}, not at the stall`);
    if (S.coins <= coins0) problems.push(`handing over paid nothing (${coins0} -> ${S.coins})`);
    if (!document.querySelector('[data-vase="jug"]')) problems.push('the jug went from the shelf; vases never run out');
    if (roses1 !== roses0 - 2) problems.push(`two roses went in but the shelf went ${roses0} -> ${roses1}`);
    if (last && last.stars !== 3) problems.push(`two red roses, a red tulip and a red ribbon for love scored ${last.stars}`);
    const shown = document.querySelector('#dialog .stars')?.getAttribute('aria-label') || 'nothing on screen';
    document.getElementById('dialog').click();
    const reply = bubble();
    if (!last || reply !== `"${last.line}"` || !last.pages[last.pages.length - 1].result) problems.push(`their reply on screen was ${reply}`);
    var played = `asked ${answer}; dragged ${inVase}: ${shown}, paid ${S.coins - coins0}, and they said ${reply}`;
    G.nextPlease();

    // ---- made with no order, put out on the stall, and given to the next one to come ----
    G.goTo(1);
    await sleep(300);
    const k = S.bucket.map((b) => b.k)[0];
    G.vaseDown('jar');
    G.addStem(k);
    G.addStem(S.bucket.map((b) => b.k)[1] || k);
    const label = document.getElementById('bench-give')?.textContent || '';
    if (!/out on the stall/i.test(label)) problems.push(`with nobody waiting the table button says "${label}"`);
    await sleep(350);
    document.getElementById('bench-give')?.click();
    if (S.made.length !== 1) problems.push(`putting it out left ${S.made.length} on the stall`);
    if (S.bench) problems.push('the vase was still on the table after putting it out');
    G.nextCustomer(false); // the next one comes up the lane with an order of their own
    G.goTo(2);
    await sleep(100);
    if (!document.querySelector('#stall-made .made-item .price-tag')) problems.push('no price tag on the arrangement out on the stall');
    await sleep(400);
    const coins1 = S.coins;
    await dragTo(document.querySelector('#stall-made .made-item'), document.getElementById('customer'));
    await sleep(100);
    if (S.made.length) problems.push('dragging the set-aside vase onto the customer did not give it to them');
    if (!S.shop.last) problems.push('no reaction after giving them the set-aside vase');
    if (S.coins <= coins1) problems.push(`the set-aside vase paid nothing (${coins1} -> ${S.coins})`);
    var aside = S.shop.last ? `put out ${bunchOf(S.shop.last)} and gave it to ${S.shop.last.who}: ${S.shop.last.stars}★` : 'not given';
    G.nextPlease();

    // ---- somebody just wants the one on the stall ----
    G.boardMarkup(-9); // cheap, so nobody balks at it
    G.goTo(1);
    G.vaseDown('jug');
    for (const kk of S.bucket.map((b) => b.k).slice(0, 3)) G.addStem(kk);
    G.handOver();
    const sat0 = S.rep;
    G.nextCustomer(true);
    const br = S.shop.cust;
    G.goTo(2);
    await sleep(100);
    document.getElementById('dialog').click();
    const pitch = document.querySelector('#dialog .dlg-text')?.textContent || '';
    if (!br || !br.browse) problems.push('no browser for the arrangement on the stall');
    document.getElementById('dlg-sell')?.click();
    await sleep(100);
    if (S.made.length) problems.push('saying yes to a browser did not sell it');
    if (!(S.rep > sat0)) problems.push(`a cheap, well-liked sale did not lift satisfaction (${sat0} -> ${S.rep})`);
    var browsed = `${br ? br.who : 'nobody'} asked ${pitch} and it sold for ${S.shop.last ? S.shop.last.pay : 0} at ${S.shop.last ? S.shop.last.stars : 0}★`;
    G.nextPlease();
    G.boardMarkup(1); // back to fair

    // ---- closed: nobody new comes up the lane ----
    G.togglePause();
    const before = S.shop.cust;
    await sleep(2300); // two of the once-a-second checks
    if (S.shop.cust !== before) problems.push('a customer came up the lane while the stall was closed');
    if (document.getElementById('btn-pause').textContent !== 'Stall closed') problems.push('the pause button does not say Stall closed');
    G.togglePause();
  }

  function bunchOf(m) { return m.stems.join('+'); }

  // ---- the garden keeps customer time: two customers, one growing spell ----
  const growing = S.pots.find((p) => p.crop && !p.wilted && p.progress < G.FLOWERS[p.crop.split('-')[0]].days);
  let grewBy = 'no pot growing';
  if (growing) {
    growing.dry = 0;
    S.slots = 0;
    const p0 = growing.progress;
    G.slotPassed();
    const afterOne = growing.progress;
    G.slotPassed();
    grewBy = `${p0} -> ${afterOne} -> ${growing.progress}`;
    if (afterOne !== p0 || growing.progress !== p0 + 1) problems.push(`two customer slots grew a watered pot ${grewBy}, not by one step`);
  }

  // ---- six customer slots make a day, and nobody at the counter is sent away ----
  G.nextCustomer(false);
  const waiting = S.shop.cust;
  const day0 = S.day, season0 = S.season;
  S.daySlots = 0;
  for (let n = 0; n < 6; n++) G.slotPassed();
  const turned = S.day !== day0 || S.season !== season0;
  if (!turned) problems.push(`six customer slots did not turn the day (still day ${S.day})`);
  if (S.shop.cust !== waiting) problems.push('the day turning sent the customer at the counter away');
  if (document.getElementById('btn-sleep')) problems.push('there is still a Go to bed button');

  // ---- a cut stem ages on its own clock: a step every six slots from its cutting ----
  S.bucket.push({ k: 'daisy-white', n: 1, age: 0, slots: 0 }, { k: 'tulip-red', n: 1, age: 0, slots: 3 });
  const [fresh, older] = S.bucket.slice(-2);
  for (let n = 0; n < 3; n++) G.ageStems();
  const ageAfter3 = `${fresh.age}/${older.age}`;
  if (fresh.age !== 0 || older.age !== 1) problems.push(`three slots on, stems cut 0 and 3 slots ago are ${ageAfter3} steps old (want 0/1)`);

  // ---- saying the one thing they asked not to caps it at a star ----
  const capped = G.judge({ want: 'love', extras: [{ t: 'noColour', v: 'red' }] }, ['rose-red', 'rose-red', 'rose-red'], 'jar', false).stars;
  if (capped > 1) problems.push(`red roses for "nothing red" still scored ${capped} stars`);

  // ---- the Start over button: asks, and only then starts a new shop ----
  const realConfirm = window.confirm;
  let asked = 0;
  window.confirm = () => { asked += 1; return false; };
  document.getElementById('btn-restart').click();
  if (G.S !== S) problems.push('Start over went ahead when told no');
  window.confirm = () => { asked += 1; return true; };
  document.getElementById('btn-restart').click();
  window.confirm = realConfirm;
  const restarted = G.S !== S && G.S.coins === 15 && G.S.pots.every((pt) => pt.crop) && !document.getElementById('intro-begin') && document.getElementById('overlay').classList.contains('hidden');
  if (asked !== 2 || !restarted) problems.push(`Start over: asked ${asked} times, straight into a new shop with no intro: ${restarted}`);
  G.fresh('Test');

  return JSON.stringify({
    pass: problems.length === 0,
    detail: (problems.length ? problems.join('; ') + ' | ' : '')
      + `${orders} orders from 5% to 95% satisfaction (base ${lowBase} -> ${highBase}) from ${have.length} varieties: best possible ${tally.map((n, i) => `${i}★ ${n}`).join(', ')}; ${played || 'not played'}; ${typeof aside === 'string' ? aside : 'nothing put out'}; ${typeof browsed === 'string' ? browsed : ''}; growing ${grewBy}; day ${day0} -> ${S.day} after six slots; stems cut 0 and 3 slots ago are ${ageAfter3} steps old three slots later; forbidden colour capped at ${capped}★; start over asked, then straight into a new shop: ${restarted}; starts closed: ${startsClosed}`,
  });
})();
