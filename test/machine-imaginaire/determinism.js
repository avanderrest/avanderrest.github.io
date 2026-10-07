/* The whole promise: a seed, a style and its settings always draw the same picture,
   and a different seed draws a different one. Checked on every pixel, every style. */
const M = window.__machine;
M.clearPhoto();
const notes = [];
let pass = true;
for (const style of M.ORDER) {
  const t0 = performance.now();
  M.render({ seed: 'alpha-test', style });
  const ms = Math.round(performance.now() - t0);
  const a = M.fingerprint();
  M.render({ seed: 'beta-test', style });
  const c = M.fingerprint();
  M.render({ seed: 'alpha-test', style });
  const b = M.fingerprint();
  const ok = a === b && a !== c;
  if (!ok) pass = false;
  notes.push(style + (ok ? ' ok' : ' FAILED') + ' (' + a + (a === b ? ' twice' : ' then ' + b) + ', other seed ' + c + ', ' + ms + 'ms)');
}
return JSON.stringify({ pass, detail: notes.join('; ') });
