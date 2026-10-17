/* The Quick maker, end to end, with the real depth model (about 27 MB, downloaded by the
   test browser each run).

   Makes a scene from one of the journal photos the way a visitor would, checks it has a
   splat per grid pixel plus fill, that the depth spreads from 1 to the slider's range,
   that it was kept in "Yours" (IndexedDB) and opens again from there, and that moving the
   Depth slider reshapes it without running the model again. */
return (async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const G = window.__splats, problems = [], notes = [];
  const t0 = performance.now();
  const made = await G.makeFromUrl('../images/journal/bees.jpg', 'depth');
  notes.push(`made in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  if (!made || !(made.count > 60000)) { problems.push(`made ${JSON.stringify(made)}; hint: ${document.getElementById('ps-hint').textContent}`); }
  else {
    const s = G.current.scene, rec = G.current.record;
    const grid = rec.width * rec.height;
    notes.push(`${rec.width}x${rec.height} grid, ${s.count - grid} fill, depth map ${rec.dw}x${rec.dh}`);
    if (s.count <= grid) problems.push('no fill splats');
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < grid; i++) { const z = s.pos[i * 3 + 2]; if (z < lo) lo = z; if (z > hi) hi = z; }
    notes.push(`z ${lo.toFixed(2)}..${hi.toFixed(2)}`);
    if (Math.abs(lo - 1) > 0.02 || Math.abs(hi - rec.range) > 0.1) problems.push(`depth spans ${lo.toFixed(2)}..${hi.toFixed(2)}, wanted 1..${rec.range}`);
    await sleep(300);
    if (!G.mine.find((m) => m.id === rec.id)) problems.push('not kept in Yours');
    if (!document.querySelector(`#ps-mine .ps-card[data-id="${rec.id}"]`)) problems.push('no card in Yours');

    // the slider reshapes it
    const slider = document.getElementById('ps-range');
    slider.value = '6'; slider.dispatchEvent(new Event('input'));
    await sleep(400);
    let hi2 = -Infinity;
    const s2 = G.current.scene;
    for (let i = 0; i < grid; i++) hi2 = Math.max(hi2, s2.pos[i * 3 + 2]);
    if (Math.abs(hi2 - 6) > 0.2) problems.push(`after Depth 6 the far end is at ${hi2.toFixed(2)}`);

    // and it opens again from IndexedDB
    G.openGallery && document.querySelector(`#ps-mine .ps-card[data-id="${rec.id}"]`).click();
    await sleep(300);
    if (G.current.id !== rec.id || G.current.scene.count !== s2.count) problems.push('reopening from Yours gave a different scene');
  }
  return JSON.stringify({ pass: problems.length === 0, detail: (problems.length ? problems.join('; ') + ' | ' : '') + notes.join(', ') });
})();
