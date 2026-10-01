/* Does the dark hide you, and does the red on the move grid tell the truth?

   Light is the whole game, and the rule is exact: inside a torch's short reach you are
   seen whatever the light, further out only on a lit tile, and never through a crate.
   The move grid tints red every tile someone is watching, and that tint is computed
   separately from the check that fills the Seen bar — so the two can drift apart and
   the player walks into a blue tile and gets caught. This walks into both. */
const B = window.__blackout;
const C = B.consts;
const notes = [];
let pass = true;
const check = (name, ok, extra) => { if (!ok) pass = false; notes.push(name + (ok ? ' ok' : ' FAILED') + (extra ? ' (' + extra + ')' : '')); };

let S = B.newGame('normal');
B.start();
const g = S.guards.find((q) => q.card);   // starts at 4,13 facing east along row 13
check('the card carrier faces east', g.face === 0, 'face ' + g.face);

// torch reach, dark distance, and light
let near = 0, darkFar = 0, litFar = 0, litSeen = 0, darkSeen = 0, blocked = 0, blockedSeen = 0;
for (let y = 0; y < C.H; y++) for (let x = 0; x < C.W; x++) {
  const d = Math.hypot(x - g.x, y - g.y);
  if (d < 0.5 || d > C.CONE_RANGE) continue;
  const ang = Math.atan2(y - g.y, x - g.x);
  if (Math.abs(ang) > 0.7) continue;                          // well inside the cone
  if ('.,'.indexOf(B.tile(x, y, 0)) < 0) continue;
  const seen = B.seesTile(g, x, y, 0);
  const clear = B.los(g.x, g.y, x, y, 0, false);
  const lit = S.light[B.key(x, y, 0)] >= C.LIT;
  if (!clear) { blocked++; if (seen) blockedSeen++; continue; }
  if (d <= C.TORCH_REACH) { near++; if (!seen) check('seen inside torch reach at ' + x + ',' + y, false); continue; }
  if (lit) { litFar++; if (seen) litSeen++; } else { darkFar++; if (seen) darkSeen++; }
}
check('dark tiles past the torch are safe', darkFar > 0 && darkSeen === 0, darkSeen + '/' + darkFar + ' seen');
check('lit tiles in the cone are not', litFar === 0 || litSeen === litFar, litSeen + '/' + litFar + ' seen');
check('nothing is seen through a crate or wall', blockedSeen === 0, blocked + ' blocked tiles');
notes.push(near + ' tiles inside torch reach');

// the red tiles: stand in the yard with his cone in front of you, then walk into red, and into blue
function setUp() {
  S = B.newGame('normal');
  B.start();
  S.cams.forEach((c) => { c.alive = false; });
  S.guards.forEach((q) => { if (!q.card) { q.x = 1; q.y = 1; q.lv = 1; q.down = false; } });   // off the map, out of the way
  const g = S.guards.find((q) => q.card);
  g.route = [[g.x, g.y]]; g.wp = 0;          // he stands his ground, so red stays red while you walk
  B.teleport(9, 15, 0);
  B.computeReach();
  return g;
}
setUp();
const red = [], blueSafe = [];
for (let k = 0; k < S.reach.dist.length; k++) {
  if (S.reach.dist[k] <= 0 || S.reach.dist[k] > 5) continue;   // the ring drawn around you
  (S.danger[k] ? red : blueSafe).push(k);
}
check('some reachable tiles are red', red.length > 0, red.length + ' red, ' + blueSafe.length + ' blue');

// every tile on the path has to be blue for the blue walk to mean anything
function allBlue(k) {
  const path = [];
  for (let c = k; c !== B.key(S.player.x, S.player.y, S.player.lv); c = S.reach.prev[c]) path.push(c);
  return path.every((c) => !S.danger[c]);
}
const redK = red.sort((a, b) => S.reach.dist[a] - S.reach.dist[b])[0];
B.moveTo(B.kx(redK), B.ky(redK), B.kl(redK));
B.flush();
check('walking into red fills the Seen bar', S.seen > 0, 'seen ' + S.seen + ' at ' + S.player.x + ',' + S.player.y);

setUp();
const blueK = blueSafe.filter(allBlue).sort((a, b) => S.reach.dist[b] - S.reach.dist[a])[0];
B.moveTo(B.kx(blueK), B.ky(blueK), B.kl(blueK));
B.flush();
check('walking through blue does not', S.seen === 0, 'seen ' + S.seen + ' at ' + S.player.x + ',' + S.player.y);

// takedown only from beside or behind
S = B.newGame('normal');
B.start();
const t = S.guards.find((q) => q.card);
B.teleport(t.x - 1, t.y, 0);
const behind = B.contextAction();
check('behind him, Z takes him down', !!behind && behind.kind === 'takedown');
B.teleport(t.x + 1, t.y, 0);
const front = B.contextAction();
check('in front of him, it does not', !front || front.kind !== 'takedown');

// the pistol is a gun: it drops a guard whichever way he faces, and kills him
S = B.newGame('normal');
B.start();
const f = S.guards.find((q) => q.card);
S.cams.forEach((c) => { c.alive = false; });
B.teleport(f.x + 3, f.y, 0);
S.vis[B.key(f.x, f.y, 0)] = 2;
const before = S.seen;
B.fire({ kind: 'guard', o: f });
B.flush();
check('shooting a guard who faces you drops him', f.down && f.dead, 'seen ' + before + ' -> ' + S.seen);
S = B.newGame('normal');
B.start();
const h = S.guards.find((q) => q.card);
B.teleport(h.x - 3, h.y, 0);
S.vis[B.key(h.x, h.y, 0)] = 2;
B.fire({ kind: 'guard', o: h });
B.flush();
check('from behind too', h.down && h.dead);

return JSON.stringify({ pass, detail: notes.join('; ') });
