/* Does the compound wait for you?

   There are no turns: the guards take one step for every GUARD_EVERY (two) moves of
   yours, every move once the alarm is up, a move being a step or anything else you do. A running step counts half and a
   step dragging a body counts double. Get the counting wrong and nothing on screen says
   so — the guards just walk a little faster or slower than they should — so this counts
   guard steps against your moves directly. */
const B = window.__blackout;
const notes = [];
let pass = true;
const check = (name, ok, extra) => { if (!ok) pass = false; notes.push(name + (ok ? ' ok' : ' FAILED') + (extra ? ' (' + extra + ')' : '')); };

const S = B.newGame('normal');
B.start();
S.cams.forEach((c) => { c.alive = false; });
S.guards = S.guards.filter((g) => g.card);
const g = S.guards[0];
g.route = [[4, 13], [12, 13]];                   // a straight beat, so every tick is a step
const pos = () => g.x + ',' + g.y;
const step = (x, y) => { B.moveTo(x, y, 0); B.flush(); };

// nothing moves while you stand there
const t0 = S.ticks, p0 = pos();
check('standing still, nothing moves', S.ticks === t0 && pos() === p0);

B.teleport(20, 19, 0);
step(21, 19);
check('one move: the guards wait', S.ticks === t0 && pos() === p0, 'ticks ' + S.ticks);
step(22, 19);
check('two moves: they take a step', S.ticks === t0 + 1, 'ticks ' + S.ticks + ', guard ' + p0 + ' -> ' + pos());

// running: a step counts half, so four running steps are two moves
B.toggleRun();
const t1 = S.ticks;
step(26, 19);
check('four running steps are two moves: one guard step', S.ticks === t1 + 1, 'ticks ' + (S.ticks - t1));
B.toggleRun();

// doing a thing counts like a step
const t2 = S.ticks, m2 = S.moves;
const lamp = S.lamps.find((l) => l.x === 20 && l.y === 18);
B.teleport(22, 19, 0);
S.vis[B.key(20, 18, 0)] = 2;
B.fire({ kind: 'lamp', o: lamp });
B.flush();
check('a shot counts as a move', S.moves === m2 + 1 && !lamp.alive, 'moves ' + m2 + ' -> ' + S.moves);
step(23, 19);
check('and with the next step the guards move', S.ticks === t2 + 1, 'ticks ' + (S.ticks - t2));
// in the alarm they keep up: a step every move
S.alarm = true; S.reinforceLeft = 0;
g.mode = 'patrol';                                // the beat keeps him stepping; the count is what is under test
const t3 = S.ticks;
B.teleport(20, 19, 0); S.pace = 0;
step(21, 19);
check('in the alarm one move is a guard step', S.ticks === t3 + 1, 'ticks ' + (S.ticks - t3));
// staying put is a move too, so you can wait without walking in circles
S.alarm = false; S.pace = 0;
const t4 = S.ticks, at4 = S.player.x + ',' + S.player.y;
B.stay(); B.flush();
B.stay(); B.flush();
check('two stays are one guard step, and you have not moved', S.ticks === t4 + 1 && S.player.x + ',' + S.player.y === at4, 'ticks ' + (S.ticks - t4));
notes.push(S.moves + ' moves, ' + S.ticks + ' guard steps');

return JSON.stringify({ pass, detail: notes.join('; ') });
