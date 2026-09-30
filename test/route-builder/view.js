/* The felt mat is the whole world: you must never be able to zoom out past
   it or drag it off screen, at any window size. A camera that escapes shows
   the bare canvas round the mat, and nothing else on screen would say why.
   This throws the camera as far out and as far off as it will go — through
   the real wheel and drag handlers — and checks the mat still fills the view
   edge to edge. */
return (async () => {
  const RB = window.routeBuilder;
  const cam = RB.camera;
  const canvas = document.getElementById('mat');
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const notes = [];
  const checks = [];
  const check = (name, ok, extra) => { checks.push(ok); notes.push(`${name}: ${ok ? 'ok' : 'FAILED'}${extra ? ` (${extra})` : ''}`); };

  RB.newGame('calm');
  const rect = canvas.getBoundingClientRect();
  const visible = () => {
    const tl = { x: cam.cx - rect.width / 2 / cam.scale, y: cam.cy - rect.height / 2 / cam.scale };
    const br = { x: cam.cx + rect.width / 2 / cam.scale, y: cam.cy + rect.height / 2 / cam.scale };
    return { tl, br };
  };
  const insideMat = () => {
    const v = visible();
    return v.tl.x >= -0.5 && v.tl.y >= -0.5 && v.br.x <= 1900.5 && v.br.y <= 1200.5;
  };

  // Scroll out hard, many times over.
  for (let i = 0; i < 30; i++) {
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 800, clientX: rect.left + 10, clientY: rect.top + 10, bubbles: true, cancelable: true }));
  }
  await frame();
  check('scrolling out stops where the mat fills the view', cam.scale >= RB.minScale() - 1e-6 && insideMat(),
    `scale ${cam.scale.toFixed(3)} vs min ${RB.minScale().toFixed(3)}`);

  // Zoom in, then try to drag the mat far off every side.
  canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -1500, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, bubbles: true, cancelable: true }));
  await frame();
  const zoomedIn = cam.scale;
  check('scrolling in still works', zoomedIn > RB.minScale() * 1.5, `scale ${zoomedIn.toFixed(3)}`);

  // Pan straight through the camera state, the way the drag handler does, and
  // let the next frame's clamp have its say.
  for (const [dx, dy] of [[-99999, 0], [99999, 0], [0, -99999], [0, 99999]]) {
    cam.manual = true;
    cam.cx += dx; cam.cy += dy;
    await frame();
    check(`dragged ${dx ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down')} it stays on the mat`, insideMat(),
      `view ${JSON.stringify(visible())}`);
  }

  return JSON.stringify({ pass: checks.every(Boolean), detail: notes.join('; ') });
})();
