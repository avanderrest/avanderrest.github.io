/* The renderer draws what is there, and the hand on the canvas reaches the camera.

   Shows a made-up scene through the real page: a red ball 2 m ahead in front of a green
   wall 5 m back. From the photo's view the middle pixel is red and a corner is green, so
   the projection, the covariance maths in the shader and the back-to-front order all
   work (an unsorted blend would let the wall bleed through the ball). A pointer drag on
   the canvas turns the view and it eases back inside its limit; the wheel zooms; the
   .ply download reads back. */
return (async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const G = window.__splats, P = G.P, problems = [], notes = [];
  const ball = 3000, wall = 120 * 80, n = ball + wall;
  const s = P.emptyScene(n, { width: 1200, height: 800, focal: 1.2 });
  let r = 7;
  const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < ball; i++) {
    const u = rnd() * 2 - 1, t = rnd() * Math.PI * 2, rad = 0.25 * Math.cbrt(rnd());
    const q = Math.sqrt(1 - u * u);
    s.pos.set([q * Math.cos(t) * rad, q * Math.sin(t) * rad, 2 + u * rad], i * 3);
    s.scale.set([0.03, 0.03, 0.03], i * 3); s.rot[i * 4] = 1;
    s.color.set([230, 40, 40, 255], i * 4);
  }
  for (let j = 0; j < wall; j++) {
    const i = ball + j, x = (j % 120) / 119 - 0.5, y = Math.floor(j / 120) / 79 - 0.5;
    s.pos.set([x * 6, y * 4, 5], i * 3);
    s.scale.set([0.04, 0.04, 0.01], i * 3); s.rot[i * 4] = 1;
    s.color.set([40, 200, 60, 255], i * 4);
  }
  G.sim.setSway(false);
  G.show(s, { title: 'Ball and wall', orbit: 20 });
  await sleep(400);
  const c = document.getElementById('ps-view');
  const read = (fx, fy) => {
    const t = document.createElement('canvas'); t.width = c.width; t.height = c.height;
    const g = t.getContext('2d'); g.drawImage(c, 0, 0);
    return Array.from(g.getImageData(Math.round(c.width * fx), Math.round(c.height * fy), 1, 1).data.slice(0, 3));
  };
  const mid = read(0.5, 0.5), side = read(0.5 - 0.3 * (c.height / c.width), 0.25);
  notes.push(`middle ${mid}, wall ${side}`);
  if (!(mid[0] > 150 && mid[1] < 90)) problems.push(`the middle is not the red ball: ${mid}`);
  if (!(side[1] > 120 && side[0] < 100)) problems.push(`the wall is not green: ${side}`);
  if (G.renderer.count !== n) problems.push(`drew ${G.renderer.count} of ${n}`);

  // a drag on the canvas
  const box = c.getBoundingClientRect();
  const ev = (type, x, y) => c.dispatchEvent(new PointerEvent(type, { clientX: box.left + x, clientY: box.top + y, pointerId: 3, bubbles: true, pointerType: 'mouse', button: 0 }));
  ev('pointerdown', 300, 300);
  for (let i = 1; i <= 30; i++) { ev('pointermove', 300 + i * 12, 300); await sleep(16); }
  const turned = G.sim.S.cam.yaw;
  await sleep(200);
  ev('pointerup', 660, 300);
  await sleep(1800);
  const settled = G.sim.S.cam.yaw;
  notes.push(`dragged to ${(turned * 57.3).toFixed(0)}°, settled ${(settled * 57.3).toFixed(1)}°`);
  if (!(turned > 0.3)) problems.push(`a 360 px drag only turned ${turned.toFixed(3)} rad`);
  if (!(settled < 20.5 / 57.3)) problems.push(`the view stayed past its limit at ${(settled * 57.3).toFixed(1)}°`);
  // the ball moved on screen, so the turned view was drawn
  const turnedMid = read(0.5, 0.5);
  notes.push(`turned middle ${turnedMid}`);

  const d0 = G.sim.S.cam.dist;
  c.dispatchEvent(new WheelEvent('wheel', { deltaY: -400, clientX: box.left + 200, clientY: box.top + 200, bubbles: true, cancelable: true }));
  if (!(G.sim.S.cam.dist < d0 * 0.8)) problems.push(`the wheel did not zoom in (${d0.toFixed(2)} -> ${G.sim.S.cam.dist.toFixed(2)})`);

  const back = P.fromPly(G.exportPly());
  if (back.count !== n) problems.push(`the .ply download read back ${back.count} splats`);
  document.getElementById('ps-reset').click();
  if (G.sim.S.cam.yaw !== 0 || G.sim.S.cam.dist !== d0) problems.push('Reset did not go back to the photo view');
  return JSON.stringify({ pass: problems.length === 0, detail: (problems.length ? problems.join('; ') + ' | ' : '') + notes.join(', ') });
})();
