/* A level played through the page, the way a hand would.

   Picks the slope in the box by clicking its button, taps two cells of the canvas with real
   pointer events (worked out from the camera, so this also checks the picking), releases
   with the button, and steps the run. Claims: both slopes hang where they were tapped, the
   box count drops, a tap on a hung piece chooses it and shows Flip / Take back, the run
   ends in the cup, the result card shows three stars, and Next level opens level 2. */
return (async () => {
  const R = window.__run;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const canvas = document.getElementById('board');
  R.goLevel(0);
  await wait(200);
  const tap = (x, y) => {
    const v = new R.camera.position.constructor(x + 0.5, y + 0.5, 0.19).project(R.camera);
    const r = canvas.getBoundingClientRect();
    const o = { clientX: r.left + (v.x + 1) / 2 * r.width, clientY: r.top + (1 - v.y) / 2 * r.height, pointerId: 7, pointerType: 'touch', bubbles: true, button: 0 };
    canvas.dispatchEvent(new PointerEvent('pointerdown', o));
    canvas.dispatchEvent(new PointerEvent('pointerup', o));
  };
  const box = () => [...document.querySelectorAll('#box button')];
  box()[0].click();
  const tool = R.ui.tool;
  const sol = R.game.L.solution;
  for (const [kind, x, y, flip] of sol) {
    if (!R.ui.tool) box()[0].click();
    tap(x, y);
    if (flip) { tap(x, y); }   // a second tap on the chosen piece flips it
    await wait(50);
  }
  const hung = R.game.placed.map((p) => `${p.kind}@${p.x},${p.y}${p.flip ? 'F' : ''}`).join(' ');
  const want = sol.map(([k, x, y, f]) => `${k}@${x},${y}${f ? 'F' : ''}`).join(' ');
  const count = box()[0].querySelector('.count').textContent;
  tap(sol[0][1], sol[0][2]);
  await wait(50);
  const bar = !document.getElementById('piece-bar').hidden;
  document.getElementById('btn-release').click();
  R.step(600);
  await wait(1200);
  const card = !document.getElementById('result').hidden;
  const stars = document.querySelectorAll('#result-stars .got').length;
  document.getElementById('btn-next').click();
  await wait(100);
  const next = R.game.idx;
  const pass = tool === 'slope' && hung === want && count === String(3 - sol.length) && bar && card && stars === 3 && next === 1;
  return JSON.stringify({ pass, detail: `tool ${tool}; hung '${hung}' (wanted '${want}'), box shows ${count} left; chosen bar ${bar}; result card ${card} with ${stars} stars; Next opened level ${next + 1}` });
})();
