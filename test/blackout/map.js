/* Is every mission's compound one connected place, and can everybody walk their beat?

   Each map is two floors of hand-typed strings, and the ways they break are all silent:
   a stray character closes a doorway and strands a room, a stair whose top is one tile
   off is a staircase to nowhere, a waypoint on a crate sends a guard's shortest path to
   null so he stands still for the whole game, a lamp post dropped in a one-tile corridor
   walls it off, and a tile on the upper floor outside every region is simply never drawn.
   None of that throws; the page still draws. Runs over all five missions. */
const B = window.__blackout;
const notes = [];
let pass = true;

B.MISSIONS.forEach((m, mi) => {
  const S = B.newGame('normal', mi);
  const C = B.consts;
  const bad = [];
  const fail = (msg) => { pass = false; bad.push(msg); };
  const each = (fn) => { for (let lv = 0; lv < C.LV; lv++) for (let y = 0; y < C.H; y++) for (let x = 0; x < C.W; x++) fn(x, y, lv, B.tile(x, y, lv)); };

  // every walkable node is reachable from the start once the keycard doors are open
  each((x, y, lv, c) => { if (c === 'D') S.doors[B.key(x, y, lv)] = true; });
  const r = B.bfs(B.key(C.START.x, C.START.y, C.START.lv), 'player', 9999, null);
  let walkable = 0;
  const stranded = [];
  each((x, y, lv) => {
    if (!B.passable(x, y, lv, 'player')) return;
    walkable++;
    if (r.dist[B.key(x, y, lv)] < 0) stranded.push(x + ',' + y + ',' + lv);
  });
  if (stranded.length) fail('stranded: ' + stranded.slice(0, 8).join(' '));
  if (B.tile(C.START.x, C.START.y, C.START.lv) !== 'o') fail('the start is not outside the wire');

  // one terminal, upstairs, with a floor tile beside it
  const terms = [], doors = [];
  each((x, y, lv, c) => { if (c === 'T') terms.push([x, y, lv]); if (c === 'D') doors.push([x, y, lv]); });
  if (terms.length !== 1) fail(terms.length + ' terminals');
  const term = terms[0] || [0, 0, 0];
  const steps = [[1, 0], [0, 1], [-1, 0], [0, -1]].map(([dx, dy]) => r.dist[B.key(term[0] + dx, term[1] + dy, term[2])]).filter((d) => d >= 0);
  if (!steps.length) fail('nowhere to stand at the terminal');
  if (term[2] !== 1) fail('the terminal is not upstairs');
  if (!doors.length) fail('no keycard door');

  // and the terminal is behind the door: with every door shut you cannot reach it
  Object.keys(S.doors).forEach((k) => delete S.doors[k]);
  const shut = B.bfs(B.key(C.START.x, C.START.y, C.START.lv), 'player', 9999, null);
  const around = [[1, 0], [0, 1], [-1, 0], [0, -1]].some(([dx, dy]) => shut.dist[B.key(term[0] + dx, term[1] + dy, term[2])] >= 0);
  if (around) fail('the terminal can be reached without the keycard');

  // stairs: every S has an s straight above it, and every s an S below
  let stairs = 0;
  each((x, y, lv, c) => {
    if (c === 'S') { stairs++; if (B.tile(x, y, lv + 1) !== 's') fail('stairs at ' + x + ',' + y + ' lead nowhere'); }
    if (c === 's' && B.tile(x, y, lv - 1) !== 'S') fail('stair top at ' + x + ',' + y + ' has no stairs under it');
  });

  // every tile upstairs lies in exactly one region, or it is never drawn
  each((x, y, lv, c) => {
    if (lv === 0 || c === ' ') return;
    const n = C.UPPER.filter((u) => u.lv === lv && x >= u.x0 && x <= u.x1 && y >= u.y0 && y <= u.y1).length;
    if (n !== 1) fail('upstairs tile ' + x + ',' + y + ' is in ' + n + ' regions');
  });

  // ladders: an L at the top, a yard tile at the foot, one step apart
  C.LADDERS.forEach((l, i) => {
    if (B.tile(...l.top) !== 'L') fail('ladder ' + i + ' top is "' + B.tile(...l.top) + '"');
    if (!B.passable(l.foot[0], l.foot[1], l.foot[2], 'guard')) fail('ladder ' + i + ' foot is not walkable');
    if (Math.abs(l.top[0] - l.foot[0]) + Math.abs(l.top[1] - l.foot[1]) !== 1) fail('ladder ' + i + ' top and foot are not neighbours');
  });

  // every waypoint on every beat is reachable from the guard's own start, and a sentry stands on grating
  C.GUARDS.forEach((g, i) => {
    if (g.looks) { if (B.tile(g.x, g.y, g.lv) !== '_') fail('sentry ' + i + ' is on "' + B.tile(g.x, g.y, g.lv) + '"'); return; }
    if (!B.passable(g.x, g.y, g.lv, 'guard')) fail('guard ' + i + ' starts on "' + B.tile(g.x, g.y, g.lv) + '"');
    const gr = B.bfs(B.key(g.x, g.y, g.lv), 'guard', 9999, null);
    g.route.forEach((w) => { if (gr.dist[B.key(w[0], w[1], g.lv)] < 0) fail('guard ' + i + ' cannot reach ' + w.join(',')); });
  });
  if (C.GUARDS.filter((g) => g.card).length !== 1) fail('not exactly one keycard carrier');

  // lamps: posts stand on floor, wall lamps hang on a wall and shine onto floor
  C.LAMPS.forEach((l, i) => {
    const t = B.tile(l.x, l.y, l.lv);
    if (l.kind === 'post' && '.,_o'.indexOf(t) < 0) fail('lamp ' + i + ' post is on "' + t + '"');
    if (l.kind === 'wall') {
      const w = B.tile(l.mx, l.my, l.lv);
      if ('#W'.indexOf(w) < 0) fail('lamp ' + i + ' is mounted on "' + w + '"');
      if ('.,_'.indexOf(t) < 0) fail('lamp ' + i + ' shines onto "' + t + '"');
    }
  });
  C.CAMERAS.forEach((c, i) => {
    if ('#W'.indexOf(B.tile(c.mx, c.my, c.lv)) < 0) fail('camera ' + i + ' is not on a wall');
    if (B.tile(c.x, c.y, c.lv) === ' ' || B.tile(c.x, c.y, c.lv) === '#') fail('camera ' + i + ' looks out from "' + B.tile(c.x, c.y, c.lv) + '"');
  });

  // the cut in the wire is the way through, and the gate lets the reinforcements into the yard
  if (!C.CUT || r.dist[B.key(C.CUT.x, C.CUT.y, 0)] < 0) fail('the cut in the wire is not reachable');
  if (B.tile(C.GATE.x, C.GATE.y, C.GATE.lv) !== 'G') fail('the gate is on "' + B.tile(C.GATE.x, C.GATE.y, C.GATE.lv) + '"');
  else if (!B.neighbours(B.key(C.GATE.x, C.GATE.y, C.GATE.lv), 'guard').length) fail('the gate opens onto nothing');

  notes.push((mi + 1) + ' ' + m.id + ': ' + (bad.length ? bad.join(', ') : walkable + ' walkable, terminal ' + Math.min(...steps) +
    ' steps in, ' + stairs + ' stairs, ' + C.GUARDS.length + ' guards, ' + C.CAMERAS.length + ' cameras'));
});
B.newGame('normal', 0);

return JSON.stringify({ pass, detail: notes.join('; ') });
