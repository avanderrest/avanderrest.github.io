/* Can the whole mission be done on hard — five rounds — with nothing but the keys?

   This plays it. No teleporting, no moving guards, no editing state: it holds and taps the
   same keys a player would, and only reads what a player can see on screen (where a guard
   is, which way he faces, where the bypass marker is). The route is the one the level is
   built around: wait in the dark for a patrol to turn its back, close in silently, choke or
   shoot a man only from behind, put out the lamp a camera needs, crawl the ducts and duck
   the tripwires, and walk out under the alarm.

   A scripted playthrough was tried for another game here and dropped, because it failed
   for its own reasons on random map rolls. This one has no dice in it: the compound is
   hand-built and the guards are clockwork, so it plays the same way every time, and a
   failure here means a change has made hard mode harder than five rounds allow. */
const B = window.__blackout;
const C = B.consts;
B.setDifficulty('hard');
B.newGame();
B.start();
B.state.msgT = 0;

const P = () => B.player;
const mid = () => P().x + P().w / 2;
const feet = () => P().y + P().h;
const G = (id) => B.guards.find((g) => g.id === id);
const ALL = ['left', 'right', 'up', 'down', 'run', 'action', 'fire'];
const log = [];
let t = 0;

function tick() {
  B.tick(1 / 60, 1);
  t += 1 / 60;
  if (B.state.mode === 'dead') throw new Error('died: ' + B.state.ending);
}
function hold(keys) { for (const k of ALL) B.hold(k, keys.includes(k)); }
function until(cond, sec, what) {
  for (let i = 0; i < sec * 60; i++) { if (cond()) return; tick(); }
  throw new Error('gave up waiting: ' + what);
}
function walkTo(x, extra) {
  const dir = x > mid() ? 'right' : 'left';
  hold([dir].concat(extra || []));
  until(() => (dir === 'right' ? mid() >= x : mid() <= x), 40, 'walking to ' + x);
  hold(extra && extra.includes('down') ? ['down'] : []);
}
function face(dir) { hold([dir]); tick(); hold([]); }

/* Under the alarm, standing up is how you get shot, and the crates on the way out
   can only be climbed standing. So cross them the way a player would: wait low
   for the men with a line on you to have just fired — the gun takes a second to
   come round again — then run over. */
function crossUnderFire(x) {
  const standingChest = () => P().y + P().h - P_H_STAND * 0.55;
  const threat = () => B.guards.some((g) => !g.down && g.state === 'alert'
    && Math.abs(g.y - feet()) < 2.5 && Math.abs(g.x - mid()) < 10
    && B.losClear(g.x, g.y - 1.2, mid(), standingChest()) && g.shootCd < 0.75);
  const incoming = () => B.state.bullets.some((b) => Math.abs(b.x - mid()) < 7 && Math.sign(mid() - b.x) === Math.sign(b.vx));
  until(() => !threat() && !incoming(), 15, 'a gap in the shooting');
  const dir = x > mid() ? 'right' : 'left';
  hold([dir, 'run']);
  until(() => (dir === 'right' ? mid() >= x : mid() <= x), 5, 'running the crates at ' + x);
  hold(['down']);
}
const P_H_STAND = C.P_H_STAND;
function tap(k) { B.hold(k, false); tick(); B.tap(k); tick(); B.hold(k, false); }
function note(s) { log.push(s + ' @' + t.toFixed(0) + 's'); }

// a guard is fair game for the pistol when the sight is on him, red: back turned, unaware
const quietShotAt = (g) => {
  const a = B.state.aim;
  return a && a.obj === g && !g.down && g.state !== 'alert' && g.susp < 0.75 && Math.sign(a.ox - g.x) === -g.dir;
};
function shoot(g, what, sec) {
  try {
    until(() => g.down || quietShotAt(g), sec, 'a clean shot at ' + what);
  } catch (e) {
    const a = B.state.aim;
    const s = B.screenOf(g.x, g.y - 1);
    throw new Error(e.message + ' (sight on ' + (a ? a.kind + ' at ' + a.x.toFixed(1) : 'nothing')
      + '; he is at ' + g.x.toFixed(1) + ' facing ' + g.dir + ', ' + g.state + ', depth in fog '
      + B.fogAt(s.x, s.y).toFixed(2) + ')');
  }
  if (!g.down) tap('fire');
  if (!g.down) throw new Error('the shot at ' + what + ' did not drop him');
  note(what + ' shot from behind');
}

let result;
try {
  // --- the wire: let the first guard pass, follow him, crawl the last stretch, choke him
  const wire = G('wire');
  until(() => wire.state === 'patrol' && wire.dir > 0 && wire.x > 12.5, 60, 'the wire guard to turn away');
  hold(['right']);
  until(() => wire.x - mid() < 3.4, 20, 'closing on the wire guard');
  hold(['right', 'down']);                              // silent from here in
  until(() => wire.x - mid() < 1.15, 20, 'reaching the wire guard');
  hold(['down']);
  tap('action');
  if (!wire.down) throw new Error('could not choke the wire guard');
  note('wire guard choked');
  hold([]);

  // --- the duct at the foot of the wall
  walkTo(25.3);
  walkTo(27.8, ['down']);
  hold([]);
  tick();

  // --- the yard: the keycard guard, then the lamp the camera needs
  const yard = G('yard');
  const yardLamp = B.state.lamps.find((l) => Math.abs(l.x - 36) < 0.1);
  walkTo(29.2);
  until(() => yard.state === 'patrol' && yard.dir > 0 && yard.x > 34, 60, 'the keycard guard to walk away');
  walkTo(31.2);                                        // up onto the crates
  face('right');
  shoot(yard, 'keycard guard', 8);
  until(() => B.state.aim && B.state.aim.obj === yardLamp, 5, 'the sight on the yard lamp');
  tap('fire');
  if (yardLamp.on) throw new Error('the yard lamp is still lit');
  note('yard lamp out');
  walkTo(yard.x);
  until(() => B.state.hasCard, 3, 'the keycard');
  note('keycard taken');

  // --- the service door
  walkTo(43.2);
  tap('action');
  if (!B.state.doorOpen) throw new Error('the door did not open');
  note('door open');

  // --- the hall. He walks out of the clear view within a few paces of turning away,
  // so the shot has to be taken close: slip in while his back is turned, get down
  // behind the crates by the door (they take his torch), and wait for the next turn.
  const hall = G('hall');
  until(() => hall.state === 'patrol' && hall.dir > 0, 60, 'the hall guard to walk away');
  walkTo(48.3, ['down']);
  until(() => hall.state === 'patrol' && hall.dir < 0, 20, 'the hall guard to come back');
  until(() => hall.state === 'patrol' && hall.dir > 0, 20, 'the hall guard to turn away again');
  hold([]);
  tick();
  face('right');
  shoot(hall, 'hall guard', 3);

  // under the tripwire, and up the ladder
  walkTo(54.2);
  walkTo(57.2, ['down']);
  hold([]);
  tick();
  walkTo(60.6);
  hold(['up']);
  until(() => P().y < 6.3, 10, 'the top of the ladder');
  hold(['right']);
  until(() => mid() > 62.3 && P().onGround && Math.abs(feet() - 10) < 0.05, 10, 'stepping off onto the upper floor');
  hold([]);
  note('upstairs');

  // --- upstairs: through the duct, wait behind the crate, shoot the guard as he turns away
  const upper = G('upper');
  walkTo(69.2);
  walkTo(71.5, ['down']);                              // crouched behind the crate, out of his torch
  until(() => upper.state === 'patrol' && upper.dir > 0 && upper.x < 76, 60, 'the upper guard to walk away');
  hold([]);
  tick();
  face('right');
  shoot(upper, 'upper guard', 3);

  // past the camera without a round to spare for it: at a run, before it can lock
  hold(['right', 'run']);
  until(() => mid() > 79.8, 10, 'running past the camera');
  hold([]);
  walkTo(80.4);
  walkTo(82.6, ['down']);                              // under the tripwire
  hold([]);
  tick();
  walkTo(C.TERMINAL.x);
  if (B.state.alarm) throw new Error('the alarm went before the download');

  // --- the bypass: stop the marker in the green, three times
  tap('action');
  if (B.state.mode !== 'hack') throw new Error('the terminal did not open');
  until(() => {
    const h = B.state.hack;
    if (!h) return true;
    const m = h.zone * 0.2;
    if (h.pos > h.zoneAt + m && h.pos < h.zoneAt + h.zone - m) B.tap('action');
    else B.hold('action', false);
    return false;
  }, 30, 'the bypass');
  hold([]);
  if (!B.state.dataDone) throw new Error('the download did not finish');
  note('data taken, alarm up');

  // --- out: back the way we came, low, under whatever they fire
  walkTo(83, ['down']);
  walkTo(80.5, ['down']);
  hold([]);
  tick();
  walkTo(71.5);
  walkTo(69.2, ['down']);
  hold([]);
  tick();
  walkTo(60.6);
  hold(['down']);
  until(() => Math.abs(feet() - 15) < 0.05 && !P().climbing, 10, 'the foot of the ladder');
  // Crawl it, standing only to get over the crates — you cannot climb on your belly.
  walkTo(51.5, ['down']);                              // up against the crates
  crossUnderFire(48.2);                                // over the hall crates
  walkTo(32.5, ['down']);                              // out of the door and across the yard
  crossUnderFire(29.6);                                // over the yard crates
  hold(['left', 'down']);                              // through the duct and home
  until(() => B.state.mode === 'win', 40, 'being extracted');
  note('out');

  result = { pass: true };
} catch (e) {
  result = { pass: false, why: e.message };
}
for (const k of ALL) B.hold(k, false);
const p = P();
B.setDifficulty('normal');

return JSON.stringify({
  pass: result.pass,
  detail: (result.pass ? 'completed on hard' : 'FAILED: ' + result.why)
    + ' | ' + log.join(', ')
    + ' | rounds left ' + p.ammo + ' of 5, hp ' + p.hp
    + ', alarm before the data: ' + B.state.alarmEarly
    + ', player at ' + mid().toFixed(1) + ',' + feet().toFixed(1) + ', time ' + t.toFixed(0) + 's',
});
