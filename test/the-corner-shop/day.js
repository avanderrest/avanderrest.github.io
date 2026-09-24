/* A first day, played through the real buttons, has to add up.

   A fresh shop has empty shelves and an empty stockroom, and the door will not open
   on nothing — so the first day only works because an order placed on an empty shop
   is fetched from the cash and carry straight into the stockroom, "Fill every shelf"
   puts it out, and only then does Open work. That chain lives in three places and
   breaks without a sound: the door just stays shut.

   So this orders a box of everything on the starting shelves through the Orders tab,
   fills, opens, and works the till perfectly — every item scanned and bagged, every
   coin picked up, the moment each customer arrives — for the whole day. Then:

   - the shop closes by itself, with everyone who came in accounted for;
   - a perfect clerk loses nobody from the queue;
   - the cash in the tin is exactly what it was after the order, plus the takings,
     minus the rent — no money made or lost anywhere else;
   - the takings are exactly the shelf prices of what went in the bags;
   - with the default prices and a perfect clerk, the day turns a profit. */
return (() => {
  const H = window.__shop;
  const problems = [];
  const $ = (sel) => document.querySelector(sel);
  H.freeze(true);
  H.resetGame();
  const help = document.getElementById('btn-help-close');
  if (help && help.offsetParent) help.click();

  const st = () => H.state;
  const starting = st().slots.filter(Boolean);
  H.setTab('orders');
  for (const pid of starting) {
    const b = $(`[data-order="${pid}"][data-d="1"]`);
    if (!b) { problems.push(`no order button for ${pid}`); continue; }
    b.click();
  }
  $('#btn-order').click();
  const cashAfterOrder = st().cash;
  const inRoom = starting.reduce((a, pid) => a + st().room[pid].reduce((x, b) => x + b.q, 0), 0);
  if (!inRoom) return JSON.stringify({ pass: false, detail: `the first order did not reach the stockroom (cash ${st().cash}, arriving ${JSON.stringify(st().arriving)})` });

  H.setTab('stock');
  $('#btn-fill').click();
  const onShelf = starting.reduce((a, pid) => a + st().shelf[pid], 0);
  $('#btn-open').click();
  if (st().phase !== 'open') return JSON.stringify({ pass: false, detail: `the shop would not open with ${onShelf} things on the shelves` });
  const came = H.day.spawnAt.length;

  // a perfect clerk
  let bagged = 0, rung = 0, t = 0;
  const DT = 0.1;
  while (st().phase === 'open' && t < 400) {
    const d = H.day;
    const c = d && d.till;
    if (c && c.state === 'till') {
      for (const it of d.belt.slice()) { if (!it.scanned) { H.scanItem(it.uid); rung += st().prices[it.p.id]; } }
      for (const it of d.belt.slice()) { H.bagItem(it.uid); bagged++; }
    }
    if (c && c.state === 'paying') for (const m of (d.coins || []).slice()) H.takeCoin(m.uid);
    H.tick(DT);
    t += DT;
  }

  const td = st().today;
  const r2 = (x) => Math.round(x * 100) / 100;
  if (st().phase !== 'evening') problems.push(`still ${st().phase} after ${t.toFixed(0)}s`);
  const seen = td.served + td.walked + td.busy + td.nothing;
  if (seen !== came) problems.push(`${came} came in, ${seen} accounted for (served ${td.served}, walked ${td.walked}, queue too long ${td.busy}, found nothing ${td.nothing})`);
  if (td.walked) problems.push(`${td.walked} walked out on a perfect clerk`);
  if (r2(td.takings) !== r2(rung)) problems.push(`takings ${r2(td.takings)} but the till rang up ${r2(rung)}`);
  if (r2(st().cash) !== r2(cashAfterOrder + td.takings - H.RENT)) {
    problems.push(`cash ${r2(st().cash)} is not ${r2(cashAfterOrder)} + ${r2(td.takings)} takings - ${H.RENT} rent`);
  }
  const profit = r2(td.takings - td.cogs - H.RENT);
  if (profit <= 0) problems.push(`the day lost money: ${r2(td.takings)} takings, ${r2(td.cogs)} cost of goods, ${H.RENT} rent`);

  return JSON.stringify({
    pass: !problems.length,
    detail: (problems.length ? problems.join(' | ') + ' — ' : '')
      + `ordered ${starting.length} boxes for ${r2(H.START_CASH - cashAfterOrder)}, ${onShelf} on the shelves; `
      + `${came} came in, ${td.served} served, ${td.busy} put off by the queue, ${td.nothing} found nothing; `
      + `${bagged} bagged, takings ${r2(td.takings)}, profit ${profit}, closed after ${t.toFixed(0)}s`,
  });
})();
