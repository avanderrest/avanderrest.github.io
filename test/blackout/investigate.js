/* Does a guard who glimpses you go and look, and then go back to his beat?

   Being seen is not the alarm. It should pull the guard off his route toward the tile
   where he saw you, one step per tick like everyone else, and if you are gone when he
   gets there he looks about and walks back to his route. Each part is a mode change in
   guardStep, and any of them can stick: a guard who never leaves his route makes being
   seen free, one who never returns leaves the patrol broken for the rest of the game,
   and one who crosses the yard in a tick is unfair. */
const B = window.__blackout;
const C = B.consts;
const notes = [];
let pass = true;
const check = (name, ok, extra) => { if (!ok) pass = false; notes.push(name + (ok ? ' ok' : ' FAILED') + (extra ? ' (' + extra + ')' : '')); };

const S = B.newGame('normal');
B.start();
S.cams.forEach((c) => { c.alive = false; });
S.guards = S.guards.filter((g) => g.card);
const g = S.guards[0];              // 4,13, walking east along row 13
const route = g.route.map((w) => w.join(','));

// a lit tile well inside his cone, past his torch's reach, that he will see from his next tile
let spot = null;
for (let y = 0; y < C.H && !spot; y++) for (let x = 0; x < C.W && !spot; x++) {
  const d = Math.hypot(x - (g.x + 1), y - g.y);
  if (d < 3.5 || d > 5 || B.tile(x, y, 0) !== '.') continue;
  if (S.light[B.key(x, y, 0)] < C.LIT) continue;
  const probe = { ...g, x: g.x + 1 };
  if (B.seesTile(probe, x, y, 0)) spot = [x, y];
}
check('found a lit spot in his cone', !!spot, spot && spot.join(','));
B.teleport(spot[0], spot[1], 0);
B.wait(); B.flush();
check('he sees you and leaves his beat to look', g.mode === 'suspect' && !!g.target && g.target[0] === spot[0] && g.target[1] === spot[1], g.mode);
check('being seen is not the alarm', !S.alarm, 'seen ' + S.seen);

// slip away into the dark, far off
B.teleport(27, 19, 0);
let maxStep = 0, reached = false, searched = false, back = false, backOnRoute = false;
let px = g.x, py = g.y;
for (let t = 0; t < 60; t++) {
  B.wait(); B.flush();
  maxStep = Math.max(maxStep, Math.abs(g.x - px) + Math.abs(g.y - py));
  px = g.x; py = g.y;
  if (g.x === spot[0] && g.y === spot[1]) reached = true;
  if (g.mode === 'search') searched = true;
  if (searched && g.mode === 'patrol') back = true;
  if (back && route.indexOf(g.x + ',' + g.y) >= 0) { backOnRoute = true; break; }
}
check('one tile a tick, never more', maxStep <= 1, 'largest step ' + maxStep);
check('he walks to where he saw you', reached);
check('finds nobody and looks about', searched);
check('then goes back to his route', back && backOnRoute, 'at ' + g.x + ',' + g.y + ' mode ' + g.mode);
check('and forgets you', !S.alarm && S.seen === 0, 'seen ' + S.seen);

// the tower sentry comes down for a look too, by the ladder (the only way off the platform), and back up after
const T = B.newGame('normal');
B.start();
T.cams.forEach((c) => { c.alive = false; });
T.guards = T.guards.filter((q) => q.looks);
const sentry = T.guards[0];                        // on the platform at 7,6, floodlight on the yard
B.teleport(7, 11, 0);                              // in his floodlight, five tiles out
B.wait(); B.flush();
check('the sentry sees you and leaves his post', sentry.mode === 'suspect', sentry.mode);
B.teleport(27, 19, 0);
let down = false, looked = false, home = false, ladder = false, ticks = 0;
for (; ticks < 120; ticks++) {
  B.wait(); B.flush();
  if (sentry.lv === 0) down = true;
  if (sentry.x === 9 && sentry.y === 5 && sentry.lv === 0) ladder = true;
  if (sentry.mode === 'search') looked = true;
  if (looked && sentry.mode === 'sentry') { home = true; break; }
}
check('he climbs down the ladder', down && ladder);
check('looks where he saw you', looked);
check('and goes back up to sweep again', home && sentry.x === 7 && sentry.y === 6 && sentry.lv === 1, ticks + ' ticks, at ' + sentry.x + ',' + sentry.y + ',' + sentry.lv + ' ' + sentry.mode);

// and the ladder is yours too, with the arrow keys: into the wall at its foot climbs, off the top climbs down
B.newGame('normal');
B.start();
const U = B.state;
U.guards = [];
B.teleport(9, 5, 0);
B.stepDir(2); B.flush();                           // west, into the tower wall
const up = U.player.x === 8 && U.player.y === 5 && U.player.lv === 1;
B.stepDir(0); B.flush();                           // east, off the edge
const downAgain = U.player.x === 9 && U.player.y === 5 && U.player.lv === 0;
check('the arrow keys climb the ladder up and down', up && downAgain, U.player.x + ',' + U.player.y + ',' + U.player.lv);

// a man knocked out is woken by whoever finds him: no alarm
B.newGame('normal');
B.start();
const K = B.state;
K.cams.forEach((c) => { c.alive = false; });
const finder = K.guards.find((q) => q.card);         // 4,13 walking east
const sleeper = K.guards.find((q) => !q.card && !q.looks && q.lv === 0);
K.guards = [finder, sleeper];
sleeper.down = true; sleeper.dead = false; sleeper.mode = 'down';
sleeper.x = finder.x + 2; sleeper.y = finder.y; sleeper.lv = 0;
B.teleport(27, 19, 0);
let woke = -1;
for (let t = 0; t < 12; t++) { B.wait(); B.flush(); if (!sleeper.down) { woke = t; break; } }
check('a knocked-out guard who is found gets woken up', woke >= 0 && !K.alarm, 'woke after ' + woke + ' ticks, alarm ' + K.alarm);
check('and both of them look about', sleeper.mode === 'search' || sleeper.mode === 'patrol', sleeper.mode);

return JSON.stringify({ pass, detail: notes.join('; ') });
