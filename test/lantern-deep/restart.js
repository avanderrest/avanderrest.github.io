/* The Start over button: on a living hero it asks first, Keep going changes nothing, and
   Start over gives a fresh dungeon (new seed in the address bar, back to class choice, the
   record kept) with the saved game replaced. */
return (async () => {
  const G = window.__lantern;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const problems = [];
  const dlg = document.querySelector('#ld-dialog');
  if (!dlg.hidden) document.querySelector('#ld-go').click();
  for (let i = 0; i < 40 && !document.querySelector('[data-hero]'); i++) await sleep(50);
  // cases share a page: get back to class choice from wherever play.js left it
  if (G.S.mode !== 'create') { document.querySelector('#ld-restart').click(); if (!dlg.hidden) document.querySelector('#ld-over').click(); await sleep(50); }
  const classBtn = document.querySelector('[data-hero="fighter"]');
  if (!classBtn) return JSON.stringify({ pass: false, detail: 'no Fighter button' });
  classBtn.click(); document.querySelector('#ld-begin').click();
  await sleep(100);
  if (G.S.mode !== 'explore') problems.push(`mode ${G.S.mode} after picking a class`);
  const seed = G.S.seed, record = JSON.stringify(G.S.record);

  document.querySelector('#ld-restart').click();
  if (dlg.hidden) problems.push('no confirm on a living hero');
  document.querySelector('#ld-keep').click();
  if (!dlg.hidden) problems.push('Keep going left the dialog open');
  if (G.S.seed !== seed || G.S.mode !== 'explore') problems.push('Keep going changed the game');

  document.querySelector('#ld-restart').click();
  document.querySelector('#ld-over').click();
  await sleep(50);
  if (G.S.seed === seed) problems.push('same seed after Start over');
  if (G.S.mode !== 'create') problems.push(`mode ${G.S.mode} after Start over`);
  if (!location.hash.includes(String(G.S.seed))) problems.push(`address bar ${location.hash} not the new seed ${G.S.seed}`);
  if (JSON.stringify(G.S.record) !== record) problems.push('record changed');
  const saved = JSON.parse(localStorage.getItem('lantern-deep-save-v2') || 'null');
  if (!saved || saved.seed !== G.S.seed || saved.mode !== 'create') problems.push('save not replaced');
  if (!document.querySelector('[data-hero]') || !/Fighter/.test(document.querySelector('main').textContent)) problems.push('the heroes are not shown');
  if (/undefined|NaN/.test(document.querySelector('#ld-text').textContent)) problems.push('page text has undefined/NaN');

  // straight to a new dungeon, no question, from the class-choice page
  const seed2 = G.S.seed;
  document.querySelector('#ld-restart').click();
  if (!dlg.hidden) problems.push('asked on the class-choice page');
  if (G.S.seed === seed2) problems.push('no new seed from the class-choice page');

  return JSON.stringify({ pass: !problems.length, detail: problems.join('; ') || `seed ${seed} -> ${seed2} -> ${G.S.seed}, record ${record} kept` });
})();
