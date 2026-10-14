/* A train bends at its couplings: round a corner the engine turns onto the
   new stretch while the carriages behind are still on the old one, each
   piece sitting on the track rather than the whole train swinging out over
   the grass as one stick. And at the end of the track it turns round where
   it stands (Amber's rule): the engine's nose ends up where the last
   carriage's tail was, and the train sets off back down the same track.
   The track comes in from the left and turns up, as she described it. */
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
  RB.addTrain(RB.lines[0].id, 3, a);
  const train = RB.trains[0];
  const ends = (p) => {
    const dx = Math.cos(p.ang) * p.len / 2, dy = Math.sin(p.ang) * p.len / 2;
    return { front: { x: p.x + dx, y: p.y + dy }, back: { x: p.x - dx, y: p.y - dy } };
  };
  // distance from the track as drawn: along the front of each station, then
  // curving off from the platform's end (so at the corner it leaves b's
  // right-hand end and swings up to c)
  const paths = RB.trackPaths();
  const segDist = (p, a, b) => {
    const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
    return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
  };
  const offTrack = (p) => Math.min(...paths.flatMap((path) => path.slice(1).map((q, i) => segDist(p, path[i], q))));
  const deg = (r) => Math.round(r * 180 / Math.PI);

  // Ride until the engine is well round the corner and climbing.
  let pieces = null, guard = 0;
  while (guard++ < 2000) {
    RB.tick(1, 1 / 20); await frame();
    pieces = RB.trainPieces(train.id);
    if (train.at === b.id && train.to === c.id && !train.atStation && pieces[0].y < 630) break;
  }
  const angs = pieces.map((p) => deg(p.ang));
  check('round the corner the engine points up', Math.abs(angs[0] + 90) < 30, `angles ${angs.join(', ')}`);
  check('while the last carriage is still on the straight', Math.abs(angs[angs.length - 1]) < 15);
  const worst = Math.max(...pieces.flatMap((p) => { const e = ends(p); return [offTrack(e.front), offTrack(e.back)]; }));
  check('every coupling sits on the track', worst < 12, `worst ${worst.toFixed(1)} off`);

  // On to the end of the track and the turn.
  let before = null;
  guard = 0;
  while (guard++ < 2000) {
    RB.tick(1, 1 / 20); await frame();
    if (train.at === c.id && train.atStation) before = RB.trainPieces(train.id);
    if (before && !train.atStation) break;
  }
  RB.tick(1, 1 / 20); await frame();
  const after = RB.trainPieces(train.id);
  const tail = ends(before[before.length - 1]).back, nose = ends(after[0]).front;
  const gap = Math.hypot(tail.x - nose.x, tail.y - nose.y);
  check('after turning round the nose is where the tail was', gap < 14, `${gap.toFixed(1)} apart`);
  // it sets off where its tail was, facing the other way to it
  const turned = Math.abs(((deg(after[0].ang) - deg(before[before.length - 1].ang) + 540) % 360) - 180);
  check('and the engine faces back down the track', turned > 165, `${deg(after[0].ang)}° against ${deg(before[before.length - 1].ang)}°`);
  const lastAfter = ends(after[after.length - 1]).back;
  check('with its last carriage at the end of the line', Math.hypot(lastAfter.x - 800, lastAfter.y - 250) < 30,
    `(${lastAfter.x.toFixed(0)}, ${lastAfter.y.toFixed(0)})`);

  return JSON.stringify({ pass: checks.every(Boolean), detail: notes.join('; ') });
})();
