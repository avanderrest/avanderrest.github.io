/* Walling the keep in must not stop a wave from ever ending.

   The horde follows a flow field in which a building costs its hit points, so it
   walks round walls where it can and batters through them where it cannot. Seal
   the keep completely and there is no way round at all — the case where a pathing
   bug leaves the whole horde standing at a wall, or milling at a gate, forever. The
   wave never ends, the Start button never comes back, and nothing errors.

   So this walls the keep off on both sides, gives the horde the first wave with
   a troll and a sapper in it, and requires that the wave resolves one way or the
   other, and that if anything reached the walls it actually hit them. */
return (() => {
  const K = window.__hollowmarch;
  const problems = [];
  K.setSpeed(0);
  K.newGame();
  const s = () => K.state();
  const W = K.W;
  s().gold = 5000;

  K.place(5, 5, 'tower');
  K.place(1, 4, 'farm');
  const walls = [[6, 7], [7, 6], [6, 6]];            // both cells touching the keep, and the corner
  for (const [x, y] of walls) K.place(x, y, 'wall');
  const sealed = walls.every(([x, y]) => s().grid[y * W + x] === 'wall');
  if (!sealed) return JSON.stringify({ pass: false, detail: 'could not wall the keep in' });

  // every road still has a way to the keep through the flow field, even if it costs a wall
  const flow = K.flow();
  const cut = K.GATES.filter((g) => !isFinite(flow.dist[g]));
  if (cut.length) problems.push(`no path at all from ${cut.length} gate(s) once walled`);

  const WAVE = 7;                                    // the first wave with a troll and a sapper in it
  s().wave = WAVE;
  const kinds = [...new Set(K.waveComposition(WAVE).map((e) => e.type))];
  const hp0 = walls.map(([x, y]) => s().hp[y * W + x]);
  K.startWave();
  let t = 0;
  while (K.running() && t < 900) { K.step(1); t++; }
  const hp1 = walls.map(([x, y]) => (s().grid[y * W + x] === 'wall' ? s().hp[y * W + x] : 0));
  const leaked = s().log[0] && s().log[0].wave === WAVE ? s().log[0].leaked : null;

  if (K.running()) {
    const sm = K.sim();
    const stuck = sm.enemies.map((e) => `${e.type}@${e.cell % W},${Math.floor(e.cell / W)}`).slice(0, 6).join(' ');
    problems.push(`wave ${WAVE} still running after ${t}s with ${sm.enemies.length} left: ${stuck}`);
  }
  const dented = hp1.some((h, i) => h < hp0[i]);
  if (leaked && !dented && !s().fallen) problems.push(`${leaked} reached the keep without touching a wall`);

  return JSON.stringify({
    pass: !problems.length,
    detail: (problems.length ? problems.join(' | ') + ' — ' : '')
      + `wave ${WAVE} (${kinds.join(', ')}) resolved in ${t}s: ${s().fallen ? 'keep fell' : `keep ${s().castleHp}/20`}, `
      + `walls ${hp0.join('/')} -> ${hp1.map(Math.round).join('/')}${leaked != null ? `, ${leaked} leaked` : ''}`,
  });
})();
