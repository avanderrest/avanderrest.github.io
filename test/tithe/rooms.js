/* Inside a room: you walk about with the arrows, a pebble turns a head, and being seen
   puts you out of the window.

   - Holding the arrow keys walks her about the floor in both directions, and a desk in
     the way stops her rather than letting her walk through it.
   - In the Abbot's study the novice walks the room. Aim a pebble at the far bookshelf
     (1, arrows, E) and he has to walk over and look at it — his back to the desk — and
     the desk can then be searched to the end without his meter filling.
   - The coffer in the counting room is locked until you carry the coffer key.
   - A sleeping sexton is woken by searching right beside him for long enough.
   - The clerk's office: you arrive hidden in the window. A first clear look only makes
     him come over and search; hide and he gives up. A second look while he is searching
     raises the house, and the room resets with you back on the sill: no heart lost, one
     alarm counted. */
return (async () => {
  const G = window.__tithe;
  const notes = [];
  let pass = true;
  const check = (name, ok, extra) => { notes.push(name + (ok ? ' ok' : ' FAILED') + (extra ? ' (' + extra + ')' : '')); if (!ok) pass = false; };
  const key = (code, down) => dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true }));
  const hold = (code, secs) => { key(code, true); G.tick(secs, 1 / 30); key(code, false); };
  const tap = (code) => { key(code, true); G.tick(1 / 30); key(code, false); G.tick(1 / 30); };
  // into a room: the iris, the climb up to the sill, and (unless peek) on over it
  const fresh = (x, y, win, peek) => {
    localStorage.clear(); G.newGame(); G.hideCard(); G.startLevel(0);
    G.guards.forEach((g) => { g.state = 'ko'; });
    G.teleport(x, y, 1); G.tryWindow(win); G.tick(2.4);
    if (!peek) { G.room.peek = false; G.tick(1); }
    return G.room;
  };

  // peeking over the sill: hidden, waiting, until an arrow takes her in or Down takes her back out
  let R = fresh(19, 9, '2', true);
  check('she stops with her head over the sill, hidden, and waits', R.peek && R.hidden && R.hidden.kind === 'window' && R.climbIn > 0);
  tap('ArrowDown'); G.tick(1.5);
  check('Down while peeking drops her back out of the window', G.S.mode === 'ext', G.S.mode);
  R = fresh(19, 9, '2', true);
  tap('ArrowRight'); G.tick(1);
  check('an arrow while peeking takes her over the sill and in', !R.peek && R.climbIn <= 0 && !R.hidden, 'climb ' + R.climbIn.toFixed(2));

  // walking about
  R = fresh(19, 9, '2');
  R.people[0].state = 'ko';
  const u0 = R.u, v0 = R.v;
  check('she climbs in at the middle of the front of the room', R.v >= 0.6 && Math.abs(R.u - 0.5) < 0.05, 'u ' + u0.toFixed(2) + ', v ' + v0.toFixed(2));
  hold('ArrowRight', 0.8); hold('ArrowUp', 0.6);
  check('the arrows walk her across and back into the room', R.u > u0 + 0.1 && R.v < v0 - 0.1, 'u ' + u0.toFixed(2) + '->' + R.u.toFixed(2) + ', v ' + v0.toFixed(2) + '->' + R.v.toFixed(2));
  // Up beside the wardrobe steps into it, and holding Up keeps her there
  const ward = R.spots.find((s) => s.kind === 'wardrobe');
  R.u = ward.u; R.v = 0.12; R.hidden = null;
  key('ArrowUp', true); G.tick(0.6, 1 / 30);
  const hid = R.hidden === ward;
  key('ArrowUp', false); G.tick(1 / 30);
  check('Up beside the wardrobe hides her in it', hid && R.hidden === ward);
  hold('ArrowDown', 0.3);
  check('and moving steps her back out', !R.hidden);
  // walking toward the camera near the sill just walks: it doesn't climb out
  R.u = 0.5; R.v = 0.45; R.hidden = null;
  hold('ArrowDown', 0.3);
  check('Down near the sill walks toward the camera, not out of the window', G.S.mode === 'room' && R.v > 0.5 && R.view === 'front', 'v ' + R.v.toFixed(2) + ', ' + G.S.mode);
  hold('ArrowUp', 0.3);
  check('and Up walks away, seen from behind', R.view === 'back' && R.v < 0.5, 'v ' + R.v.toFixed(2));
  // holding Up while walking up to the wardrobe takes her straight into it
  R.u = ward.u; R.v = 0.3; R.hidden = null;
  hold('ArrowUp', 1.2);
  check('holding Up as she walks up to the wardrobe takes her into it', R.hidden === ward, 'v ' + R.v.toFixed(2));
  hold('ArrowRight', 0.2);
  // coming at it on a slant, Up and Left held together, works the same
  R.u = ward.u + 0.08; R.v = 0.3; R.hidden = null; ward.occupied = false;
  key('ArrowUp', true); key('ArrowLeft', true); G.tick(1.4, 1 / 30); key('ArrowLeft', false);
  const slant = R.hidden === ward;
  key('ArrowUp', false); G.tick(1 / 30);
  check('walking up to it on a slant with Up held takes her in too', slant, 'u ' + R.u.toFixed(2) + ' v ' + R.v.toFixed(2));
  hold('ArrowRight', 0.2);
  // Down on the sill climbs back out
  R.u = 0.5; R.v = 0.66;
  tap('ArrowDown'); G.tick(1.5);
  check('Down on the sill climbs out of the window', G.S.mode === 'ext', G.S.mode);
  R = fresh(19, 9, '2');
  R.people[0].state = 'ko'; R.hidden = null;
  const desk = R.spots.find((s) => s.kind === 'desk');
  R.u = desk.u; R.v = desk.v + desk.dv + 0.04;
  hold('ArrowUp', 1);
  check('the desk is in the way', R.v >= desk.v + desk.dv - 0.001, 'stopped at v ' + R.v.toFixed(3) + ', desk front ' + (desk.v + desk.dv).toFixed(3));

  // the kitchen cupboard: E searches it first, Up hides in it, and once searched E hides too
  R = fresh(25, 17, '4');
  R.hidden = null;
  R.people.forEach((p) => { p.state = 'away'; p.away = 99; }); // the cook works beside it: send her off
  const cup = R.spots.find((sp) => sp.kind === 'cabinet');
  R.u = cup.u; R.v = 0.1;
  tap('KeyE'); G.tick(1);
  check('E searches the cupboard', cup.done && G.S.run.inv.picks >= 1, 'picks ' + G.S.run.inv.picks);
  tap('ArrowUp');
  check('Up hides her in it', R.hidden === cup);
  hold('ArrowDown', 0.3);
  tap('KeyE');
  check('and once it is searched, E hides her in it too', R.hidden === cup);

  // the bell: the cook walks straight across to the door and out through it — never up
  // to the wall first — and comes back the same way
  R = fresh(25, 17, '4');
  const cook = R.people[0];
  G.doSpot(R.spots.find((sp) => sp.kind === 'bell'));
  let worst = 0, gone = false;
  for (let i = 0; i < 30 * 30 && !(gone && cook.state === 'routine' && cook.act); i++) {
    G.tick(1 / 30);
    if (cook.state === 'away') gone = true;
    // past the line of the side wall, she must be inside the doorway
    // anywhere near the right-hand wall, she must be in line with the doorway
    if (cook.state !== 'away' && cook.u > 0.93) worst = Math.max(worst, Math.max(0, 0.03 - cook.v, cook.v - 0.19));
  }
  check('the bell sends the cook out through the door, not the wall', gone && worst === 0, 'went ' + gone + ', worst ' + worst.toFixed(3));
  check('and she comes back in and gets on with her work', cook.state === 'routine' && cook.act && cook.u < 0.93, cook.state + ' ' + cook.act + ' u ' + cook.u.toFixed(2) + ' v ' + cook.v.toFixed(2));

  // the records room clerk goes about his work: busy at a job with his back to the
  // room he doesn't see her standing in plain view behind him, and he moves on to his
  // next job in time
  {
    localStorage.clear(); G.newGame(); G.hideCard(); G.startLevel(1);
    G.guards.forEach((q) => { q.state = 'ko'; });
    G.teleport(9, 12, 1); G.tryWindow('1'); G.tick(2.4);
    const RR = G.room, ck = RR.people[0];
    check('he starts at a job, not pacing', ck.state === 'routine' && !!ck.act, ck.state + ' ' + ck.act);
    const firstAct = ck.act;
    if (ck.act !== 'gaze') {
      RR.hidden = null; RR.u = ck.u + 0.12; RR.v = Math.min(0.6, ck.v + 0.15);
      G.tick(2.5);
      check('busy with his back to the room, he does not see her in plain view', ck.meter === 0 && ck.state === 'routine', 'meter ' + ck.meter.toFixed(2));
    }
    RR.u = 0.5; RR.v = 0.66; RR.hidden = RR.spots[0];
    let moved = false;
    for (let i = 0; i < 30 * 25 && !moved; i++) { G.tick(1 / 30); if (ck.act && ck.act !== firstAct) moved = true; }
    check('and in time he moves on to his next job', moved, 'now ' + ck.act);
  }

  // the pebble in the study
  R = fresh(19, 9, '2');
  const nov = R.people[0];
  nov.u = 0.5; nov.f = 1; nov.state = 'patrol'; nov.pause = 0;
  G.S.run.inv.pebbles = 2;
  const wardrobe = R.spots.find((s) => s.kind === 'wardrobe');
  G.doSpot(wardrobe);
  G.tick(0.2);
  tap('Digit1');
  const shelf = R.spots.find((s) => s.kind === 'shelf');
  for (let i = 0; i < 8 && G.aimTargets()[R.aim.i] !== shelf; i++) tap('ArrowRight');
  const aimed = R.aim && G.aimTargets()[R.aim.i] === shelf;
  tap('KeyE');
  G.tick(1.2);
  check('a pebble aimed with the keys sends him to look', aimed && nov.state === 'investigate' && nov.f === 1, nov.state + ' at u ' + nov.u.toFixed(2));
  const desk2 = R.spots.find((s) => s.kind === 'desk');
  G.useSpot(desk2);
  let maxMeter = 0;
  for (let i = 0; i < 300 && !desk2.done; i++) { G.tick(1 / 30); maxMeter = Math.max(maxMeter, nov.meter); }
  check('the desk is searched behind his back', desk2.done && G.S.run.items.includes('coffer-key'), 'his meter peaked at ' + maxMeter.toFixed(2));
  G.useSpot(R.spots[0]); G.tick(6);
  check('out of the window again', G.S.mode === 'ext', G.S.mode);

  // the locked coffer
  R = fresh(7, 2, '3');
  const box = R.spots.find((s) => s.kind === 'strongbox');
  R.people[0].state = 'ko';
  G.useSpot(box); G.tick(6);
  check('the coffer stays shut without its key', !box.done && !G.S.run.items.includes('tithe'));
  G.S.run.items.push('coffer-key');
  G.doSpot(box); G.tick(2.5);
  check('and opens with it', box.done && G.S.run.items.includes('tithe'), 'silver ' + G.S.run.silver);

  // woken by searching beside him
  R = fresh(7, 2, '3');
  const sexton = R.people[0];
  const shelf3 = R.spots.find((s) => s.kind === 'shelf');
  G.useSpot(shelf3); G.tick(3);
  let stir = 0;
  for (let k = 0; k < 16 && sexton.state === 'sleep'; k++) {
    shelf3.done = false;
    G.doSpot(shelf3);
    for (let i = 0; i < 40; i++) { G.tick(1 / 30); stir = Math.max(stir, sexton.stir); }
  }
  check('searching beside a sleeper wakes him', sexton.state !== 'sleep', 'stir reached ' + stir.toFixed(2) + ', ' + G.S.room && 'searching at distance ' + (G.S.room ? Math.hypot((G.S.room.u - sexton.u) * 300, (G.S.room.v - sexton.v) * 110).toFixed(0) : '-'));
  if (G.S.mode === 'room') { G.useSpot(G.room.spots[0]); G.tick(6); }

  // the clerk: a first look makes him search, hiding makes him give up, and a second
  // look while he's searching raises the house — which resets the room, no heart lost
  R = fresh(16, 17, '1', true);
  check('she arrives hidden in the window', R.hidden && R.hidden.kind === 'window');
  // until she moves, nobody can see her — even someone standing right in front of her
  {
    const c0 = R.people[0];
    const was = { u: c0.u, v: c0.v, f: c0.f, turnT: c0.turnT };
    c0.u = R.u + 0.05; c0.v = R.v - 0.05; c0.f = -1; c0.turnT = 99;
    G.tick(4);
    check('crouched on the sill she cannot be seen, however close they are', c0.meter === 0 && c0.state !== 'search' && R.caught <= 0, 'meter ' + c0.meter.toFixed(2));
    Object.assign(c0, was);
    const d = Math.hypot((c0.u - R.u) * 300, (c0.v - R.v) * 110);
    check('the occupant starts well back from the sill', d > 45, 'distance ' + d.toFixed(0));
  }
  const clerk = R.people[0];
  clerk.state = 'idle'; clerk.act = null; clerk.wp = null; // standing, not at a job
  clerk.f = -1; clerk.turnT = 99;
  R.hidden = null; R.u = clerk.u - 0.2; R.v = clerk.v;
  const hearts = G.S.run.hearts, alarms = G.S.run.stats.alarms;
  let secs = 0;
  while (clerk.state !== 'search' && secs < 8) { G.tick(0.1); secs += 0.1; }
  check('a first look only makes him come and search', clerk.state === 'search' && R.caught <= 0, 'after ' + secs.toFixed(1) + 's');
  const curtain = R.spots.find((sp) => sp.kind === 'curtain');
  G.doSpot(curtain);
  G.tick(12);
  check('out of sight, he gives up', clerk.state !== 'search' && clerk.meter < 0.05, clerk.state);
  clerk.state = 'idle'; clerk.f = -1; clerk.turnT = 99;
  R.hidden = null; curtain.occupied = false; R.u = clerk.u - 0.2; R.v = clerk.v;
  secs = 0;
  while (R.caught <= 0 && secs < 12) { G.tick(0.1); secs += 0.1; }
  check('a second look while he searches raises the house', R.caught > 0, 'after ' + secs.toFixed(1) + 's');
  G.tick(1.5);
  check('and the room resets with her back on the sill, no heart lost',
    G.S.mode === 'room' && R.hidden && R.hidden.kind === 'window' && G.S.run.hearts === hearts && G.S.run.stats.alarms === alarms + 1 && clerk.meter === 0,
    'hearts ' + hearts + ' -> ' + G.S.run.hearts + ', alarms ' + alarms + ' -> ' + G.S.run.stats.alarms);

  return JSON.stringify({ pass, detail: notes.join('; ') });
})();
