/* Carriages stay on the track. A train lays its carriages along the trail its
   engine has drawn, and a train with no trail yet (just placed, resumed, or
   moved further than one frame takes it) used to get a straight one behind
   it, which ignored the track. A new train at the end of a line stuck its
   carriages out over the grass past the buffers (Amber, 2026-10-14). This
   places trains at both ends and the middle of an L of track, jumps them on
   without drawing, and rides a whole round trip, checking every coupling. */
return (async () => {
  const RB = window.routeBuilder;
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const notes = [];
  const checks = [];
  const check = (name, ok, extra) => { checks.push(ok); notes.push(`${name}: ${ok ? 'ok' : 'FAILED'}${extra ? ` (${extra})` : ''}`); };

  RB.newGame('calm');
  const S = RB.state;
  S.river = [{ x: 0, y: 1180 }, { x: 1900, y: 1180 }];
  S.trees = []; S.inv.track = 999; S.growTimer = 1e9;
  RB.setSpeed(0);
  const mk = (type, x, y) => { const s = RB.spawnStation(type); s.x = x; s.y = y; s.pegTimer = 1e9; s.walkTimer = 1e9; s.pegs.length = 0; return s; };
  const a = mk('house', 300, 700), b = mk('shop', 800, 700), c = mk('school', 800, 250);
  RB.buildDraft([a.id, b.id, c.id]);
  const line = RB.lines[0];
  const ends = (p) => {
    const dx = Math.cos(p.ang) * p.len / 2, dy = Math.sin(p.ang) * p.len / 2;
    return [{ x: p.x + dx, y: p.y + dy }, { x: p.x - dx, y: p.y - dy }];
  };
  // distance from the track as drawn (along each platform, curving off its ends)
  const paths = RB.trackPaths();
  const segDist = (p, a, b) => {
    const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
    return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
  };
  const offTrack = (p) => Math.min(...paths.flatMap((path) => path.slice(1).map((q, i) => segDist(p, path[i], q))));
  // every coupling behind the engine's nose; the nose itself points on past
  // the station it stands at by TRAIN_AHEAD (14), so it gets a little more room
  const worstOf = (t) => {
    const pieces = RB.trainPieces(t.id);
    if (!pieces) return Infinity;
    const couplings = pieces.flatMap((p) => ends(p)).slice(1).map(offTrack);
    return Math.max(...couplings, offTrack(ends(pieces[0])[0]) - 4);
  };
  const clear = () => { RB.trains.slice().forEach((t) => RB.removeTrain(t.id)); };

  // Placed at each end and in the middle, before it has moved at all.
  for (const [name, st] of [['the first stop', a], ['the last stop', c], ['the corner', b]]) {
    clear();
    const t = RB.addTrain(line.id, 3, st);
    await frame();
    const w = worstOf(t);
    check(`a new train at ${name} stands on the track`, w < 12, `worst ${w.toFixed(1)} off`);
  }

  // Ridden there and back, every frame, from the first stop (where it turns
  // round to leave).
  clear();
  const t = RB.addTrain(line.id, 3, a);
  let worst = 0, legs = 0, wasAt = t.at, where = '';
  for (let i = 0; i < 3000 && legs < 4; i++) {
    RB.tick(1, 1 / 20); await frame();
    const w = worstOf(t);
    if (w > worst) { worst = w; where = `at ${t.at}${t.atStation ? ' standing' : ` to ${t.to} ${t.prog.toFixed(2)}`}`; }
    if (t.at !== wasAt) { legs++; wasAt = t.at; }
  }
  check('ridden there and back, every coupling stays on the track', worst < 12 && legs >= 4, `worst ${worst.toFixed(1)} off over ${legs} legs, ${where}`);

  // Jumped on without drawing (a long tick, a backgrounded tab), then drawn.
  let jumpWorst = 0;
  for (let k = 0; k < 12; k++) {
    RB.tick(37 + k * 11, 1 / 20); await frame();
    jumpWorst = Math.max(jumpWorst, worstOf(t));
  }
  check('after jumps with no frames between, it is back on the track', jumpWorst < 12, `worst ${jumpWorst.toFixed(1)} off`);

  return JSON.stringify({ pass: checks.every(Boolean), detail: notes.join('; ') });
})();
