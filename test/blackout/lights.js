/* Shooting a lamp out has to actually make the room darker, and the tripwires have to be
   something you duck rather than something you walk into.

   Both are end-to-end on purpose. The pistol picks its target by scanning forwards for the
   nearest thing in a cone, so "the lamp goes out" is really a test of that scan: aim past a
   crate, don't hit the camera above your head, don't shoot the guard behind you. And the
   beam is a few tenths of a tile of arithmetic against a standing body and a crouched one —
   get it wrong by a hair and the beam is either impassable or free. */
const B = window.__blackout;
const C = B.consts;
const notes = [];
const checks = [];
const check = (name, got) => { checks.push(got); notes.push(name + ' ' + (got ? 'ok' : 'FAILED')); };
const release = () => ['left', 'right', 'up', 'down', 'run', 'action', 'fire'].forEach((k) => B.hold(k, false));

// --- put a yard lamp out
// The lamp is found on the live list and the player is placed relative to it, so
// retuning the level moves the test with it instead of breaking it.
B.newGame();
B.start();
B.guards.forEach((g) => { g.down = true; });
const lamp = B.state.lamps.filter((l) => l.pole).pop();   // the last one out in the yard
B.teleport(lamp.x - 4, 15);
B.hold('right', true);
B.tick(1 / 60, 4);                                 // a few frames, just to face right
B.hold('right', false);

const before = B.lightAt(lamp.x, 13.9);
const ammoBefore = B.player.ammo;
// the laser sight has to be on the lamp the round is about to go into
const sighted = B.state.aim && B.state.aim.obj === lamp;
B.press('fire');
B.tick(1 / 60, 2);
const after = B.lightAt(lamp.x, 13.9);
release();

check('the sight was on it', sighted);
check('the lamp is out', lamp.on === false);
check('it was lit before', before > C.DARK_ENOUGH * 3);
check('and the pool is dark after', after < C.DARK_ENOUGH);
check('a round was spent', B.player.ammo === ammoBefore - 1);
check('the camera above was not the target', B.state.cameras[0].alive === true);

// --- a man in your line of fire beats a lamp overhead. Ranked by distance alone,
// following the keycard guard under the yard lamp put the lamp nearer every time and
// he could not be shot at all; the round has to go into him, and the lamp stay lit.
B.newGame();
B.start();
const carrier = B.guards.find((g) => g.card);
B.guards.forEach((g) => { if (g !== carrier) g.x = -20; });
const yardLamp = B.state.lamps.filter((l) => l.pole).pop();
B.teleport(yardLamp.x - 3, 15);
B.hold('right', true);
B.tick(1 / 60, 2);
B.hold('right', false);
const pin = () => { carrier.x = yardLamp.x + 1.5; carrier.dir = 1; carrier.state = 'look'; carrier.timer = 0; carrier.susp = 0; };
pin();
B.tick(1 / 60, 1);
pin();
const onHim = B.state.aim && B.state.aim.obj === carrier;
B.press('fire');
B.tick(1 / 60, 1);
release();
check('the sight picks the man over the lamp', onHim);
check('and the shot takes him quietly', carrier.down === true && !B.state.alarm);
check('leaving the lamp alone', yardLamp.on === true);

// --- nothing off the edge of the screen: stand far enough back that the lamp is
// out of view, and there must be nothing to shoot
B.newGame();
B.start();
B.guards.forEach((g) => { g.x = -20; });
B.teleport(yardLamp.x - 7, 15);
B.hold('right', true);
B.tick(1 / 60, 2);
B.hold('right', false);
B.tick(1 / 60, 30);
const offScreen = B.state.aim;
release();
check('an off-screen lamp is not a target', !offScreen || offScreen.obj !== yardLamp);

// --- walk into a tripwire on your feet
B.newGame();
B.start();
B.guards.forEach((g) => { g.down = true; });
B.teleport(53, 15);
B.hold('right', true);
let trippedAt = null;
for (let i = 0; i < 300 && trippedAt === null; i++) {
  B.tick(1 / 60, 1);
  if (B.state.alarm) trippedAt = B.player.x;
}
release();
check('standing trips the beam', trippedAt !== null);

// --- and duck under the same one
B.newGame();
B.start();
B.guards.forEach((g) => { g.down = true; });
B.teleport(53, 15);
B.hold('down', true);
B.hold('right', true);
B.tick(1 / 60, 420);
const crawlPast = B.player.x;
const quiet = !B.state.alarm;
release();
check('crouching does not', quiet);
check('and gets you past it', crawlPast > 57);

const pass = checks.every(Boolean);
return JSON.stringify({
  pass,
  detail: notes.join(' | ') + ' | lamp pool ' + before.toFixed(2) + ' -> ' + after.toFixed(2)
    + ', tripped at x=' + (trippedAt === null ? 'never' : trippedAt.toFixed(2))
    + ', crawled to ' + crawlPast.toFixed(2),
});
