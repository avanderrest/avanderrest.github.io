// Every built-in preset loads whole - no style it names has gone missing - and
// visibly changes the demo photo; and a preset saved from the live stacks
// comes back identical, so Save current keeps exactly what is on screen.
return (async () => {
  const S = window.__studio;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 100 && !(S.state.data && window.cv && window.cv.Mat); i++) await wait(100);

  const REG = { both: 'bothLayers', fg: 'fgLayers', bg: 'bgLayers' };
  const regionOf = (p, r) => p.regions[r];
  const styleOnly = (list) => (list || []).filter((l) => l.kind !== 'colormap');
  const problems = [];
  const seen = [];

  for (const p of S.presets().filter((x) => x.builtin)) {
    S.applyPreset(p);
    for (const r in REG) {
      const want = styleOnly(regionOf(p, r)).length;
      const got = S.state[REG[r]].filter((l) => l.kind === 'style').length;
      if (want !== got) problems.push(p.name + '/' + r + ': ' + got + ' of ' + want + ' layers loaded');
    }
    // The debounced render, then its two animation frames.
    await wait(400);
    for (let i = 0; i < 100 && !document.getElementById('resultBusy').hidden; i++) await wait(100);
    await wait(1200);
    const a = document.getElementById('originalCanvas').getContext('2d').getImageData(0, 0, S.state.w, S.state.h).data;
    const b = document.getElementById('resultCanvas').getContext('2d').getImageData(0, 0, S.state.w, S.state.h).data;
    let diff = 0;
    for (let i = 0; i < a.length; i += 16) diff += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    diff /= (a.length / 16) * 3;
    seen.push(p.name + ' moves ' + diff.toFixed(1));
    if (diff < 8) problems.push(p.name + ' barely changes the photo (mean diff ' + diff.toFixed(1) + ')');

    // Round trip through a save.
    const snap = S.snapshotPreset('roundtrip');
    for (const r in REG) {
      const want = styleOnly(regionOf(p, r));
      const got = styleOnly(snap.regions[r]);
      want.forEach((l, k) => {
        const g = got[k];
        if (!g || g.filter !== l.filter) { problems.push(p.name + '/' + r + ' #' + k + ' came back as ' + (g && g.filter)); return; }
        for (const key in l.params || {}) {
          if (g.params[key] !== l.params[key]) problems.push(p.name + '/' + r + ' ' + l.filter + '.' + key + ' ' + l.params[key] + ' -> ' + g.params[key]);
        }
      });
    }
  }

  S.saveCurrentAsPreset('Test preset');
  const saved = S.presetByName('Test preset');
  if (!saved || saved.builtin) problems.push('saved preset not listed');
  S.state.userPresets = S.state.userPresets.filter((u) => u.name !== 'Test preset');
  try { localStorage.removeItem('image-studio-presets-v1'); } catch (e) { /* ignore */ }

  return JSON.stringify({ pass: problems.length === 0, detail: (problems.length ? problems.slice(0, 6).join('; ') + ' | ' : '') + seen.join(', ') });
})();
