/* A #seed= link in the real page. Opened with no keep saved, the link's seed is the run's.
   Opened over a keep already under way, that keep carries on with its own seed, the hint
   says the link waits for New keep, and New keep then plays the link's seed and writes it
   back to the address. With no seed in the link, the run's own seed is written there. */
const KEY = 'hollowmarch-save-v1';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const bad = [], out = [];
const before = localStorage.getItem(KEY);
const frame = document.createElement('iframe');
frame.style.cssText = 'position:fixed;left:0;top:0;width:1100px;height:760px;border:0;z-index:99999';
document.body.appendChild(frame);
async function open(hash) {
  frame.src = 'about:blank'; await wait(50);
  frame.src = location.pathname + hash;
  for (let i = 0; i < 80; i++) {
    await wait(100);
    const w = frame.contentWindow;
    if (w && w.__game && w.document.readyState === 'complete') return w;
  }
  throw new Error('the page never came up');
}
try {
  localStorage.removeItem(KEY);
  let w = await open('#seed=4242');
  out.push(`fresh visit: seed ${w.__game.state().seed}, ${w.location.hash}`);
  if (w.__game.state().seed !== 4242) bad.push('a fresh visit did not play the link\'s seed');
  if (w.location.hash !== '#seed=4242') bad.push(`the address became ${w.location.hash}`);

  // a keep under way on seed 9
  const k = JSON.parse(localStorage.getItem(KEY));
  k.seed = 9; k.wave = 3; k.grid[10] = 'wall'; k.hp[10] = 12;
  localStorage.setItem(KEY, JSON.stringify(k));
  w = await open('#seed=4242');
  const hint = w.document.getElementById('cell-hint').textContent;
  out.push(`over a keep: seed ${w.__game.state().seed}, hint "${hint.slice(0, 40)}…"`);
  if (w.__game.state().seed !== 9 || w.__game.state().wave !== 3) bad.push('the link replaced a keep under way');
  if (!/somebody else/.test(hint)) bad.push('no word that the link waits for New keep');
  w.confirm = () => true;
  w.document.getElementById('btn-new').click();
  await wait(100);
  out.push(`after New keep: seed ${w.__game.state().seed}, ${w.location.hash}`);
  if (w.__game.state().seed !== 4242 || w.location.hash !== '#seed=4242') bad.push('New keep did not take the link\'s seed');
  w.document.getElementById('btn-new').click();
  await wait(100);
  if (w.__game.state().seed === 4242 || w.location.hash !== '#seed=' + w.__game.state().seed) bad.push('a second New keep did not roll and show a new seed');

  // no seed in the link: the keep's own goes into the address
  w = await open('');
  out.push(`no seed in the link: ${w.location.hash}`);
  if (w.location.hash !== '#seed=' + w.__game.state().seed) bad.push('the keep\'s seed is not in the address');
} finally {
  frame.remove();
  if (before == null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, before);
}
return JSON.stringify({ pass: !bad.length, detail: (bad.length ? bad.join(' | ') + ' -- ' : '') + out.join(' · ') });
