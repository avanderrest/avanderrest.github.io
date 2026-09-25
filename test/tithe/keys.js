/* The climb works from the keyboard, through the real key listeners — and it can do
   everything the map search in reach.js assumes it can.

   Movement outside is free (momentum, a steerable arc, hands that catch any ledge they
   pass), but the maps are checked with a grid search over resolve(): a standing jump
   clears one square, a running jump two, Up reaches a ledge two rows up, and so on. That
   proof only holds if the real controller can actually do each of those moves. So this
   climbs the abbey with held keys, one grid move at a time, on the real map:

     up to the low cornice from the street (jump up, catch, pull up); across a one-square
     gap; across the two-square gap with a run; up the ivy and off it sideways; walking
     off an edge catches the edge; down to hang and shimmy; up a column of cracks hand
     over hand; the lunge across a missing crack; hands up onto a cornice and over it;
     the two-square gap to the belfry ledge; and holding Down lets the ledges go by. */
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
  // hold a direction until her x passes a mark, then jump and keep holding till she's down
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

  localStorage.clear();
  G.newGame(); G.hideCard(); G.startLevel(0);
  G.guards.forEach((g) => { g.state = 'ko'; }); // nobody interferes with the climb

  walkTo(6.5);
  tap('ArrowUp'); until(() => P().state === 'hang', 2);
  check('Up from the street catches the cornice two rows up', P().state === 'hang' && P().y === 18, cell());
  key('ArrowUp', true); until(() => P().state === 'ground', 2); key('ArrowUp', false); settle();
  check('and pulls up onto it', P().state === 'ground' && P().y === 17, cell());

  runJump('ArrowRight', 12.7);
  check('a running jump clears the one-square gap', P().state === 'ground' && P().y === 17 && P().x >= 14 && P().x <= 18, cell());
  walkTo(16.5);
  tap('ArrowUp'); G.tick(1.2);
  check('Up at a lit window climbs in', G.S.mode === 'room' && G.room.id === '1', G.S.mode);
  if (G.room) { G.useSpot(G.room.spots[0]); G.tick(6); }
  check('and back out of it', G.S.mode === 'ext', G.S.mode);

  runJump('ArrowRight', 18.6);
  check('a run clears the two-square gap', P().state === 'ground' && P().y === 17 && P().x >= 21, cell());

  walkTo(29.5);
  tap('ArrowUp');
  key('ArrowUp', true); until(() => P().y <= 9 && P().state === 'climb', 5); G.tick(0.4); key('ArrowUp', false);
  check('climbs the ivy', P().state === 'climb' && P().y === 9, cell());
  key('ArrowLeft', true); until(() => P().state === 'ground', 2); key('ArrowLeft', false); settle();
  check('and steps off it onto the cornice', P().state === 'ground' && P().y === 9 && P().x === 28, cell());

  // walking off the end of a cornice: she catches its edge
  G.teleport(27, 9, 1);
  key('ArrowRight', true); until(() => P().state !== 'ground' || P().anim, 2); key('ArrowRight', false);
  settle();
  check('walking off a cornice catches its edge', P().state === 'hang' && P().y === 10, cell());

  // down to hang, shimmy
  G.teleport(24, 9, -1);
  tap('ArrowDown'); settle();
  const x0 = P().px;
  key('ArrowLeft', true); G.tick(0.8); key('ArrowLeft', false);
  check('Down hangs from the cornice, and she shimmies along it', P().state === 'hang' && P().y === 10 && P().px < x0 - 20, cell());

  // the cracks: up the column, along, the lunge, onto the high cornice
  G.teleport(15, 9, -1);
  tap('ArrowUp'); until(() => P().state === 'hang', 2);
  check('Up catches the crack two rows up', P().state === 'hang' && P().y === 7, cell());
  key('ArrowUp', true); until(() => P().y === 5 && !P().anim, 2); key('ArrowUp', false);
  check('hand over hand up the column', P().state === 'hang' && P().y === 5, cell());
  key('ArrowLeft', true); until(() => P().px / 16 < 13.2, 3); G.tick(0.3);
  key('Space', true); G.tick(1 / 60); key('Space', false);
  until(() => P().state === 'hang' && P().x <= 11, 2); key('ArrowLeft', false);
  check('the lunge across the missing crack', P().state === 'hang' && P().y === 5 && P().x <= 11, cell());
  key('ArrowUp', true); until(() => P().state === 'ground', 3); key('ArrowUp', false); settle();
  check('up onto the high cornice and over it', P().state === 'ground' && P().y === 2, cell());

  runJump('ArrowRight', 12.7);
  check('a run clears the gap to the belfry ledge', P().state === 'ground' && P().y === 2 && P().x >= 15, cell());

  // a short hop off the end of the high cornice drops her past the two cracks below it:
  // her hands catch them — unless Down is held, and then she falls on by
  const hop = (holdDown) => {
    G.teleport(12, 2, 1);
    G.S.run.hearts = 3;
    key('ArrowRight', true); key('Space', true); G.tick(1 / 60); key('Space', false);
    until(() => P().state === 'air' && P().vy > 0, 1);
    if (holdDown) key('ArrowDown', true);
    until(() => P().state !== 'air' || G.S.mode !== 'ext', 3);
    key('ArrowRight', false); key('ArrowDown', false);
    return cell() + ' ' + G.S.mode;
  };
  let got = hop(false);
  check('falling past a crack, her hands catch it', P().state === 'hang' && P().y === 5, got);
  got = hop(true);
  check('holding Down lets it go by', !(P().state === 'hang' && P().y === 5), got);
  if (G.S.mode === 'dead') { G.hideCard(); G.restore(); }

  return JSON.stringify({ pass, detail: notes.join('; ') });
})();
