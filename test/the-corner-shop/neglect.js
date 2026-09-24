/* An unattended till still ends the day, and nothing goes missing.

   The other half of the day case. Nobody works the till: every basket that reaches
   it has to walk out when patience runs dry, with its goods put back — on the shelf
   if there is room, in the stockroom if not. That return is the path that loses stock
   when it goes wrong, and a shop that quietly leaks tins looks exactly like a shop
   that sold them.

   So the stock is counted when the door opens and again after closing: shelf plus
   stockroom plus anything binned overnight has to come to the same number, since
   nothing was sold. The shop must still close on its own, reputation must fall, and
   two mornings in the red after that must see the landlord change the locks. */
return (() => {
  const H = window.__shop;
  const problems = [];
  const $ = (sel) => document.querySelector(sel);
  H.freeze(true);
  H.resetGame();
  const st = () => H.state;
  const starting = st().slots.filter(Boolean);

  H.setTab('orders');
  for (const pid of starting) $(`[data-order="${pid}"][data-d="1"]`).click();
  $('#btn-order').click();
  H.setTab('stock');
  $('#btn-fill').click();
  const count = () => starting.reduce((a, pid) => a + st().shelf[pid] + st().room[pid].reduce((x, b) => x + b.q, 0), 0);
  const before = count();
  const rep0 = st().rep;
  $('#btn-open').click();
  if (st().phase !== 'open') return JSON.stringify({ pass: false, detail: 'the shop would not open' });
  const came = H.day.spawnAt.length;

  let t = 0;
  while (st().phase === 'open' && t < 400) { H.tick(0.1); t += 0.1; }
  const td = st().today;
  if (st().phase !== 'evening') problems.push(`the shop never closed (${st().phase} after ${t.toFixed(0)}s)`);
  if (td.served) problems.push(`${td.served} served with nobody on the till`);
  if (!td.walked) problems.push('nobody walked out of an unattended queue');
  const binned = td.binned.filter((b) => starting.includes(b.pid)).reduce((a, b) => a + b.q, 0);
  const after = count() + binned;
  if (after !== before) problems.push(`${before} things in the shop at opening, ${after} after closing (${binned} of them binned overnight)`);
  if (st().rep >= rep0) problems.push(`reputation ${rep0} -> ${st().rep} after a day of walkouts`);

  // the landlord: in the red on two mornings running
  const rep1 = st().rep;
  st().cash = -5;
  H.morning();
  const firstWarning = st().phase;
  st().cash = -5;
  st().phase = 'evening';
  H.morning();
  if (firstWarning !== 'closed') problems.push(`one morning in the red already ended the game (${firstWarning})`);
  if (st().phase !== 'over') problems.push(`two mornings in the red and the phase is still ${st().phase}`);
  const locked = [...document.querySelectorAll('h2')].some((h) => /changed the locks/.test(h.textContent));
  if (!locked) problems.push('no game-over card after the second morning in the red');

  return JSON.stringify({
    pass: !problems.length,
    detail: (problems.length ? problems.join(' | ') + ' — ' : '')
      + `${came} came in, ${td.walked} walked out, ${td.busy} put off, ${td.nothing} found nothing; `
      + `stock ${before} -> ${after}; reputation ${rep0} -> ${rep1}; closed after ${t.toFixed(0)}s; locked out on the second red morning`,
  });
})();
