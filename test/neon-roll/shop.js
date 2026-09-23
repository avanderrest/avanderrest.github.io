/* Shards have to buy balls, and a bought ball has to stay bought.

   The Balls dialog is the only thing shards are for, and it is plain DOM
   written by hand, so it can quietly go wrong in ways no run notices: a price
   not deducted, an unaffordable ball still clickable, a purchase that lives in
   memory but never reaches localStorage and is gone on the next visit. This
   gives the purse a known amount, buys through the real buttons, and reads the
   save back out of storage. The player's real save is put back afterwards. */
return (async () => {
  const N = window.__neonRoll;
  const KEY = 'neon-roll-save-v1';
  const problems = [];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const real = localStorage.getItem(KEY);
  const keep = JSON.parse(JSON.stringify(N.save));

  Object.assign(N.save, { shards: 100, owned: ['cyan'], skin: 'cyan' });
  N.setMode('endless');
  document.getElementById('btn-balls').click();
  await sleep(50);
  const dialog = document.getElementById('balls');
  if (dialog.hidden) problems.push('the Balls button did not open the dialog');
  const button = (name) => [...document.querySelectorAll('#skins .skin')].find((b) => b.querySelector('.name').textContent === name);
  const purse = () => document.getElementById('purse').textContent;

  if (purse() !== '100') problems.push(`the purse shows ${purse()}, not 100`);
  const pink = button('Hot Pink'), lime = button('Laser Lime');
  if (!pink || !lime) problems.push('Hot Pink or Laser Lime is missing from the dialog');
  else {
    if (pink.disabled) problems.push('Hot Pink (60) is disabled with 100 shards');
    if (!lime.disabled) problems.push('Laser Lime (150) is buyable with 100 shards');
    pink.click();
    await sleep(50);
    const stored = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (N.save.shards !== 40) problems.push(`buying Hot Pink left ${N.save.shards} shards, not 40`);
    if (purse() !== '40') problems.push(`the purse did not update (${purse()})`);
    if (!stored || stored.shards !== 40 || !stored.owned.includes('rose') || stored.skin !== 'rose') {
      problems.push(`the purchase did not reach storage (${JSON.stringify(stored && { shards: stored.shards, owned: stored.owned, skin: stored.skin })})`);
    }
    if (!button('Hot Pink').classList.contains('on')) problems.push('Hot Pink was bought but not selected');
    // switching back to an owned ball is free
    button('Cyan').click();
    await sleep(50);
    if (N.save.shards !== 40 || N.save.skin !== 'cyan') problems.push(`switching back to Cyan cost shards or did not select it (${N.save.shards}, ${N.save.skin})`);
    button('Hot Pink').click();
    await sleep(50);
    if (N.save.shards !== 40) problems.push('re-selecting an owned ball charged for it again');
  }
  document.querySelector('#balls .close').click();
  if (!dialog.hidden) problems.push('Close did not close the dialog');

  Object.keys(N.save).forEach((k) => delete N.save[k]);
  Object.assign(N.save, keep);
  if (real === null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, real);
  N.setMode('endless');

  return JSON.stringify({ pass: problems.length === 0, detail: problems.join('; ') || 'ok | 100 shards, bought Hot Pink for 60, 40 left and saved; Laser Lime locked' });
})();
