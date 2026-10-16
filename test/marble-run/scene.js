/* The 3D board shows what the physics has.

   For every level: the board's peg holes, blocks, cups and bells are built, the camera
   fits the whole board inside the canvas (all four corners project inside it), and once
   the solution is hung there is one mesh group per piece. Then a two-marble level is run
   part way, and the marble meshes sit where the sim's marbles are, at the same x and y.
   A blank canvas is the failure this is after: it also reads a pixel row across the middle
   of the board and wants more than one colour in it. */
return (async () => {
  const R = window.__run;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const problems = [];
  const V = R.camera.position.constructor;
  R.game.store.reached = R.game.LEVELS.length - 1;
  for (let i = 0; i < R.game.LEVELS.length; i++) {
    R.goLevel(i);
    R.solve();
    R.render();
    const L = R.game.L;
    for (const [x, y] of [[-0.3, -0.3], [L.w + 0.3, -0.3], [-0.3, L.h + 0.3], [L.w + 0.3, L.h + 0.3]]) {
      const v = new V(x, y, 0).project(R.camera);
      if (Math.abs(v.x) > 1 || Math.abs(v.y) > 1) problems.push(`${L.id}: corner ${x},${y} is off the canvas`);
    }
    const groups = R.scene.children[R.scene.children.length - 3].children.length;
    if (groups !== L.fixed.length + L.solution.length) problems.push(`${L.id}: ${groups} piece groups for ${L.fixed.length + L.solution.length} pieces`);
  }
  R.goLevel(8);
  R.solve();
  R.release();
  R.step(150);
  await wait(50);
  const marbles = R.scene.children[R.scene.children.length - 1].children;
  const sims = R.game.world.marbles;
  sims.forEach((m, i) => {
    const mesh = marbles[i];
    if (!mesh || Math.abs(mesh.position.x - m.x) > 1e-6 || Math.abs(mesh.position.y - m.y) > 1e-6) problems.push(`marble ${i} mesh is not where the sim has it`);
  });
  const gl = R.renderer.getContext();
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  const px = new Uint8Array(w * 4);
  gl.readPixels(0, Math.floor(h / 2), w, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const colours = new Set();
  for (let i = 0; i < w; i += 7) colours.add(`${px[i * 4] >> 4},${px[i * 4 + 1] >> 4},${px[i * 4 + 2] >> 4}`);
  if (colours.size < 4) problems.push(`the middle row of the canvas has ${colours.size} colours`);
  R.game.stop();
  return JSON.stringify({ pass: !problems.length, detail: (problems.length ? problems.join(' | ') + ' -- ' : '') + `${R.game.LEVELS.length} boards fit and match; ${sims.length} marbles in place at ${R.game.world ? 'step 150' : '?'}; ${colours.size} colours across the middle` });
})();
