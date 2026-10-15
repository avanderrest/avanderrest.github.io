/* A first day, played through the real buttons, has to add up.

   A fresh shop has empty shelves and an empty stockroom, and the door will not open on
   nothing, so the first day only works because an order placed on an empty shop is
   fetched straight into the stockroom, the keeper carries it out box by box (the
   boxes in the stockroom, then a tap on each shelf), and only then does Open work. That chain lives in three places and breaks without a sound.

   A new shop's shelves are empty, so this orders a box each of eight everyday things
   through the Orders tab,
   fills, opens, and works the till perfectly: whenever someone is at the counter the
   keeper walks back to the till, then every item is scanned and bagged and every coin
   picked up. Then:

   - the shop closes by itself, with everyone who came in accounted for;
   - a keeper who never leaves the till loses nobody at it;
   - the cash in the tin is exactly what it was after the order, plus the takings,
     minus the rent, with no money made or lost anywhere else;
   - the takings are exactly the shelf prices of what went in the bags. */
return (() => {
  const H = window.__shop;
  const shop = H.shop;
  const problems = [];
  const $ = (sel) => document.querySelector(sel);
  H.freeze(true);
  H.resetGame();
  document.getElementById('help').hidden = true;
  const st = () => H.state;
  if (st().slots.some(Boolean)) problems.push('a new shop came with products on its shelves: ' + st().slots.filter(Boolean).join(', '));
  const starting = ['milk', 'bread', 'eggs', 'paper', 'biscuits', 'fizzy', 'choc', 'apples'];
  H.setTab('orders');
  for (const pid of starting) {
    const b = $(`[data-order="${pid}"][data-d="1"]`);
    if (!b) { problems.push(`no order button for ${pid}`); continue; }
    b.click();
  }
  $('#btn-order').click();
  const cashAfterOrder = st().cash;
  // carry it all out: into the stockroom for a box, then out to its shelf
  const run = (secs) => { for (let i = 0; i < secs * 20; i++) H.tick(0.05); };
  for (let n = 0; n < 30; n++) {
    // the next thing in the back, onto its own shelf or else the first empty one
    const pid = starting.find((p) => shop.roomQty(p) > 0);
    if (!pid) break;
    if (!shop.pickUp(pid).ok) { problems.push('could not pick up ' + pid); break; }
    run(7);
    const i = shop.facingOf(pid) >= 0 ? shop.facingOf(pid) : st().slots.indexOf(null);
    H.tapFacing(i); run(7);
  }
  const bare = st().slots.filter((p, i) => p && !st().stock[i]);
  if (bare.length) problems.push('still bare after carrying out: ' + bare.join(', '));
  $('#btn-open').click();
  if (st().phase !== 'open') return JSON.stringify({ pass: false, detail: `the door did not open (phase ${st().phase})` });

  let rung = 0, t = 0, served = 0;
  while (st().phase === 'open' && t < 400) {
    const d = H.day, c = d && d.till;
    if (c && !shop.atTill() && !shop.keeper.job) shop.goTill();
    if (c && c.state === 'till' && shop.atTill()) {
      for (const it of d.belt.slice()) { if (H.scanItem(it.uid)) rung += st().prices[it.p.id]; }
      for (const it of d.belt.slice()) H.bagItem(it.uid);
    }
    if (c && c.state === 'paying' && shop.atTill()) for (const m of d.coins.slice()) H.takeCoin(m.uid);
    H.tick(0.05);
    t += 0.05;
  }
  const today = st().today;
  if (st().phase !== 'evening') problems.push(`the day did not close by itself (phase ${st().phase} after ${t.toFixed(0)}s)`);
  if (today.walked) problems.push(`${today.walked} walked out on a keeper who never left the till`);
  if (!today.served) problems.push('nobody was served');
  const cash = Math.round(st().cash * 100);
  const want = Math.round((cashAfterOrder + today.takings - 8) * 100);
  if (cash !== want) problems.push(`cash ${cash / 100} but order + takings - rent is ${want / 100}`);
  if (Math.abs(today.takings - rung) > 0.001) problems.push(`takings ${today.takings.toFixed(2)} but the scanner rang up ${rung.toFixed(2)}`);
  // close the overlay so the screenshots that follow show the shop
  document.querySelectorAll('.overlay').forEach((o) => { o.hidden = true; });
  return JSON.stringify({
    pass: !problems.length,
    detail: (problems.length ? problems.join(' | ') + ' -- ' : '') +
      `day closed after ${t.toFixed(0)}s; served ${today.served}, ${today.nothing} found nothing, ${today.busy} turned away by the queue; takings £${today.takings.toFixed(2)}, cash £${st().cash.toFixed(2)}`,
  });
})();
