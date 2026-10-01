/* Is the compound one connected place, and can everybody walk their beat?

   The map is two floors of hand-typed strings, and the ways they break are all silent:
   a stray character closes a doorway and strands a room, a stair whose top is one tile
   off is a staircase to nowhere, a waypoint on a crate sends a guard's shortest path to
   null so he stands still for the whole game, and a lamp post dropped in a one-tile
   corridor walls it off. None of that throws; the page still draws. */
const B = window.__blackout;
const C = B.consts;
const S = B.newGame('normal');
const notes = [];
let pass = true;
const fail = (m) => { pass = false; notes.push(m); };

// every walkable node is reachable from the start once the keycard door is open
Object.keys(S.doors).forEach((k) => delete S.doors[k]);
for (let lv = 0; lv < C.LV; lv++) for (let y = 0; y < C.H; y++) for (let x = 0; x < C.W; x++) {
  if (B.tile(x, y, lv) === 'D') S.doors[B.key(x, y, lv)] = true;
}
const from = B.key(C.START.x, C.START.y, C.START.lv);
const r = B.bfs(from, 'player', 9999, null);
let walkable = 0, stranded = [];
for (let k = 0; k < r.dist.length; k++) {
  const x = B.kx(k), y = B.ky(k), lv = B.kl(k);
  if (!B.passable(x, y, lv, 'player')) continue;
  walkable++;
  if (r.dist[k] < 0) stranded.push(x + ',' + y + ',' + lv);
}
if (stranded.length) fail('stranded: ' + stranded.slice(0, 8).join(' '));
notes.push(walkable + ' walkable nodes');

// the terminal is next to a floor tile you can stand on
let term = null;
for (let lv = 0; lv < C.LV; lv++) for (let y = 0; y < C.H; y++) for (let x = 0; x < C.W; x++) if (B.tile(x, y, lv) === 'T') term = [x, y, lv];
const beside = [[1, 0], [0, 1], [-1, 0], [0, -1]].filter(([dx, dy]) => r.dist[B.key(term[0] + dx, term[1] + dy, term[2])] >= 0);
if (!beside.length) fail('nowhere to stand at the terminal');
notes.push('terminal ' + term.join(',') + ' is ' + Math.min(...beside.map(([dx, dy]) => r.dist[B.key(term[0] + dx, term[1] + dy, term[2])])) + ' steps from the start');

// stairs: every S has an s straight above it, and every s an S below
let stairs = 0;
for (let lv = 0; lv < C.LV; lv++) for (let y = 0; y < C.H; y++) for (let x = 0; x < C.W; x++) {
  const c = B.tile(x, y, lv);
  if (c === 'S') { stairs++; if (B.tile(x, y, lv + 1) !== 's') fail('stairs at ' + x + ',' + y + ' lead nowhere'); }
  if (c === 's' && B.tile(x, y, lv - 1) !== 'S') fail('stair top at ' + x + ',' + y + ' has no stairs under it');
}
notes.push(stairs + ' staircases');

// every waypoint on every beat is reachable from the guard's own start
C.GUARDS.forEach((g, i) => {
  if (!g.route) return;
  const gr = B.bfs(B.key(g.x, g.y, g.lv), 'guard', 9999, null);
  g.route.forEach((w) => {
    if (gr.dist[B.key(w[0], w[1], g.lv)] < 0) fail('guard ' + i + ' cannot reach ' + w.join(','));
  });
});

// lamps: posts stand on floor, wall lamps hang on a wall and shine onto floor
C.LAMPS.forEach((l, i) => {
  const t = B.tile(l.x, l.y, l.lv);
  if (l.kind === 'post' && '.,_o'.indexOf(t) < 0) fail('lamp ' + i + ' post is on "' + t + '"');
  if (l.kind === 'wall') {
    const m = B.tile(l.mx, l.my, l.lv);
    if ('#W'.indexOf(m) < 0) fail('lamp ' + i + ' is mounted on "' + m + '"');
    if ('.,_'.indexOf(t) < 0) fail('lamp ' + i + ' shines onto "' + t + '"');
  }
});
C.CAMERAS.forEach((c, i) => {
  if ('#W'.indexOf(B.tile(c.mx, c.my, c.lv)) < 0) fail('camera ' + i + ' is not on a wall');
});

// the start is outside the wire, and the cut in it is the way through
const vent = B.key(7, 21, 0);
if (B.tile(7, 21, 0) !== 'V' || r.dist[vent] < 0) fail('the cut in the wire is not reachable');

return JSON.stringify({ pass, detail: notes.join('; ') });
