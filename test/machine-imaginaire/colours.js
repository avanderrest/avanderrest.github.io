/* Clicking a colour in the palette changes it: the colour changes and keeps its share,
   the picture follows, the link carries the change, and "Use the seed" puts the seed's
   colours back. */
return (async () => {
  const M = window.__machine;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  M.clearPhoto();
  M.render({ seed: 'colour-check', style: 'kelly' });
  const before = M.palette(), shares = before.map((c) => c.w);
  const plain = M.fingerprint();
  const problems = [];
  const input = document.querySelectorAll('#swatches input')[1];
  if (!input) return JSON.stringify({ pass: false, detail: 'no colour input on the swatches' });
  input.value = '#ff00aa';
  input.dispatchEvent(new Event('input'));
  await wait(120);
  const after = M.palette();
  if (after[1].hex !== '#ff00aa') problems.push('colour now ' + after[1].hex);
  if (after.map((c) => c.w).join() !== shares.join()) problems.push('shares changed');
  M.render({});
  const changed = M.fingerprint();
  if (changed === plain) problems.push('picture did not change');
  if (!location.hash.includes('ff00aa')) problems.push('not in the link');
  if (!/own colours/.test(document.getElementById('photo-label').textContent)) problems.push('label: ' + document.getElementById('photo-label').textContent);
  M.render({ seed: 'something-else' });
  if (M.palette()[1].hex !== '#ff00aa') problems.push('a new seed lost the chosen colour');
  M.render({ seed: 'colour-check' });
  document.getElementById('btn-unphoto').click();
  await wait(120);
  M.render({});
  if (M.palette()[1].hex !== before[1].hex) problems.push('Use the seed did not restore ' + before[1].hex);
  if (M.fingerprint() !== plain) problems.push('Use the seed did not restore the picture');
  return JSON.stringify({ pass: !problems.length, detail: (problems.join('; ') || 'ok') + ' — ' + before[1].hex + ' to #ff00aa and back, shares ' + shares.join('/') });
})();
