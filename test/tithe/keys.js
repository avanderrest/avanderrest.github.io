/* The run works from the keyboard, through the real key listeners — and it can do
   everything the map search in reach.js assumes it can.

   Movement outside is free (momentum, a sprint, a steerable arc, hands that catch any hold
   they pass), but the maps are checked with a grid search over resolve(): a standing jump
   clears one square, a running jump two, Up reaches a hold two rows up, and so on. That
   proof only holds if the real controller can actually do each of those moves. So this runs
   the abbey close with held keys, one move at a time, on the real map:

     up a window ladder from the street (the shop lintel, sill, beam end, sill...) and onto
     the eave; up onto the ridge; a running jump across the alley to the next roof; down
     off the eave onto a balcony and in at its window; walking off the end of the balcony
     catches its edge, sprinting off it does not; a jump across an alley catches the beam
     end of the tall house opposite, and she climbs it to the eave; the plank bridge; the
     rope, walked and then hung from hand over hand; a leap off the roof into the hay cart;
     the ivy from the street; the kitchen window from the street; and the bell tower from the
     nave roof, cornice then parapet. Falling past a ladder, her hands catch it — unless Down is held. */
return (async () => {
  const G = window.__tithe;
  const notes = [];
  let pass = true;
  const check = (name, ok, extra) => { notes.push(name + (ok ? ' ok' : ' FAILED') + (extra ? ' (' + extra + ')' : '')); if (!ok) pass = false; };
  const key = (code, down) => dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true }));
  const P = () => G.player;
  const cell = () => P().state + ' ' + (P().px / 16).toFixed(1) + ',' + P().y;
  const until = (cond, secs) => { for (let i = 0; i < (secs || 4) * 60 && !cond(); i++) G.tick(1 / 60); return cond(); };
  const settle = () => until(() => !P().anim && (P().state === 'ground' || P().state === 'hang' || P().state === 'climb') && Math.abs(P().vx) < 1, 3);
  const tap = (code) => { key(code, true); G.tick(1 / 60); key(code, false); };
  const runJump = (code, markX) => {
    const d = code === 'ArrowRight' ? 1 : -1;
    key(code, true);
    until(() => (P().px / 16) * d >= markX * d, 6);
    key('Space', true);
    G.tick(1 / 60);
    until(() => P().state !== 'air', 3);
    key('Space', false); key(code, false);
    settle();
  };
  const walkTo = (x) => {
    const code = P().px / 16 < x ? 'ArrowRight' : 'ArrowLeft', d = code === 'ArrowRight' ? 1 : -1;
    key(code, true); until(() => (P().px / 16) * d >= x * d, 8); key(code, false); settle();
  };
  const climbUp = (row) => { key('ArrowUp', true); until(() => P().state === 'ground' && P().y === row && !P().anim, 6); key('ArrowUp', false); settle(); };
  const reset = () => { localStorage.clear(); G.newGame(); G.hideCard(); G.startLevel(0); G.guards.forEach((g) => { g.state = 'ko'; }); };

  reset();
  // A's window ladder at column 2: the shop lintel at 14, sills and beam ends to the eave at 7
  walkTo(2.5);
  tap('ArrowUp'); until(() => P().state === 'hang', 2);
  check('Up from the street catches the shop lintel two rows up', P().state === 'hang' && P().y === 14, cell());
  climbUp(6);
  check('hand over hand up the window ladder and onto the eave', P().state === 'ground' && P().y === 6, cell());
  walkTo(4.5);
  tap('ArrowUp'); settle();
  check('Up on the eave pulls her up onto the ridge', P().state === 'ground' && P().y === 4, cell());

  G.teleport(7, 6, 1);
  runJump('ArrowRight', 9.4);
  check('a running jump clears the alley to the next roof', P().state === 'ground' && P().y === 6 && P().x >= 12 && P().x <= 16, cell());

  // down off B's eave onto the clerk's balcony, and in
  G.teleport(14, 6, 1);
  tap('ArrowDown'); settle();
  const hungEave = P().state === 'hang' && P().y === 7;
  tap('ArrowDown'); until(() => P().state === 'ground', 2); settle();
  check('Down hangs from the eave, Down again drops her onto the balcony', hungEave && P().state === 'ground' && P().y === 9, cell());
  walkTo(16.5);
  tap('ArrowUp'); G.tick(1.2);
  check('Up at a lit window climbs in', G.S.mode === 'room' && G.room.id === '1', G.S.mode);
  if (G.room) { G.useSpot(G.room.spots[0]); G.tick(6); }
  check('and back out of it', G.S.mode === 'ext', G.S.mode);

  // walking off the end of the balcony catches its edge; sprinting off it does not
  G.teleport(18, 9, 1);
  key('ArrowRight', true); until(() => P().state !== 'ground' || P().anim, 2); key('ArrowRight', false);
  settle();
  check('walking off a ledge catches its edge', P().state === 'hang' && P().y === 10 && P().x === 18, cell());
  G.teleport(14, 9, 1);
  key('ArrowRight', true); until(() => P().state !== 'ground' || P().anim, 3);
  const speed = Math.abs(P().vx);
  until(() => P().state !== 'air', 3); key('ArrowRight', false); settle();
  check('sprinting off it she flies on instead', speed > G.MV.run + 10 && !(P().state === 'hang' && P().x === 18), 'left at ' + speed.toFixed(0) + 'px/s, ' + cell());

  // B's eave to the tall house C: the jump falls short of the roof, and her hands catch
  // the beam end at the top of C's corner ladder
  reset();
  G.teleport(19, 6, 1);
  runJump('ArrowRight', 20.3);
  check('a jump across the alley catches the house opposite, at its eave or the beam end under it', P().state === 'hang' && P().x === 22 && (P().y === 4 || P().y === 5), cell());
  climbUp(3);
  check('and she climbs it onto the eave', P().state === 'ground' && P().y === 3 && P().x === 22, cell());
  walkTo(33.5);
  check('the plank bridge carries her to the next roof', P().state === 'ground' && P().y === 3 && P().x === 33, cell());

  // the rope over the wide gap: walked, then hung from
  G.teleport(43, 3, 1);
  walkTo(48.5);
  check('she walks the rope across the gap', P().state === 'ground' && P().y === 3 && P().x === 48, cell());
  G.teleport(45, 3, 1);
  tap('ArrowDown'); settle();
  const onRope = P().state === 'hang' && P().y === 4;
  key('ArrowRight', true); G.tick(1.2); key('ArrowRight', false);
  check('Down hangs from the rope, and she goes hand over hand along it', onRope && P().state === 'hang' && P().px / 16 > 46.5, cell());

  // the leap of faith: off E's roof into the hay
  reset();
  G.teleport(55, 3, 1);
  key('ArrowRight', true); key('Space', true); G.tick(1 / 60); key('Space', false);
  until(() => P().px >= 56 * 16 + 2, 2); key('ArrowRight', false);
  key('ArrowDown', true);   // and let every hold on the way down go by
  until(() => P().state !== 'air' || G.S.mode !== 'ext', 4); key('ArrowDown', false); settle();
  check('twelve rows down into the hay, and not a scratch', G.S.mode === 'ext' && P().state === 'ground' && P().y === 15 && G.S.run.hearts === 3, cell() + ' hearts ' + G.S.run.hearts + ' ' + G.S.mode);

  // the kitchen window and the ivy, from the street
  G.teleport(60, 16, 1);
  walkTo(62.5);
  tap('ArrowUp'); G.tick(1.2);
  check('the kitchen window opens off the street', G.S.mode === 'room' && G.room.id === '4', G.S.mode);
  if (G.room) { G.useSpot(G.room.spots[0]); G.tick(6); }
  walkTo(67.5);
  climbUp(6);
  check('up the ivy and onto the eave', P().state === 'ground' && P().y === 6, cell());

  // the bell tower, from the nave roof
  G.teleport(104, 7, 1);
  walkTo(106.5);
  tap('ArrowUp'); until(() => P().state === 'hang', 2);
  climbUp(4);
  check('up from the nave roof onto the tower cornice', P().state === 'ground' && P().y === 4, cell());
  walkTo(108.5);
  tap('ArrowUp'); until(() => P().state === 'hang', 2);
  climbUp(2);
  check('and from the cornice up onto the top of the tower', P().state === 'ground' && P().y === 2, cell());

  // falling down the face of a house past a window ladder: her hands catch it — unless
  // Down is held, and then she falls on by
  const drop = (holdDown) => {
    reset();
    Object.assign(P(), { state: 'air', px: 22 * 16 + 6, py: 7 * 16, vx: 0, vy: 0, anim: null, top: 7 * 16, f: -1, jumped: true, jumpKey: null, skip: null });
    if (holdDown) key('ArrowDown', true);
    until(() => P().state !== 'air' || G.S.mode !== 'ext', 3);
    key('ArrowDown', false);
    return cell() + ' ' + G.S.mode;
  };
  let got = drop(false);
  check('falling past a window ladder, her hands catch it', P().state === 'hang' && P().x === 22 && P().y >= 5 && P().y <= 7, got);
  got = drop(true);
  check('holding Down lets it go by', !(P().state === 'hang' && P().x === 22 && P().y < 12), got);
  if (G.S.mode === 'dead') { G.hideCard(); G.restore(); }

  return JSON.stringify({ pass, detail: notes.join('; ') });
})();
