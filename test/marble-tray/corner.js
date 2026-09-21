/* A match can always be finished — the last marble cannot be pinned in a corner.

   Every hole pays its ring, so the round only ends when the last marble is down. The tray
   already shakes itself when nothing has moved for a while, but a shake only kicks the
   marbles: a shooter parked on the last one in a corner is the one thing it never touched,
   so the marble bounced off the shooter and the two walls and came straight back. The
   round could then never end, and the only way out was to leave the game.

   The worst case, set up exactly: one marble left, jammed into a corner, with the
   opponent's shooter sitting on top of it. Three claims:

   1. A shake shoves the pinning shooter off the rim as well, not just the marble.
   2. Within SHAKE_GIVE_UP shakes the marble is off the rim and clear of that shooter —
      back in open tray where either side can play it.
   3. The round then actually ends: potting it finishes the match. */
return (async () => {
  const T = window.__tray;
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  const settle = async () => {
    for (let i = 0; i < 400; i++) {
      await frame();
      const moving = T.bodies.some((b) => Math.hypot(b.vx, b.vy) > 26);
      if (!moving && i > 30) return;
    }
  };
  const RIM = 22, W = 960, H = 620;

  T.setTwo(false);
  T.setMode('match');
  T.match.count = 0;
  T.match.cool = 999;        // the opponent is not to take a shot mid-test
  await frame();

  // One marble left, hard into the top-left corner, with their shooter leaning on it.
  for (let i = T.bodies.length - 1; i >= 0; i--) if (!T.bodies[i].striker) T.bodies.splice(i, 1);
  T.sinking.length = 0;
  const m = T.add('marble-m', RIM + 16, RIM + 16, { team: 'ai' });
  m.vx = 0; m.vy = 0;
  const theirs = T.match.theirs;
  theirs.x = RIM + 16 + 48; theirs.y = RIM + 16 + 48; theirs.vx = 0; theirs.vy = 0;
  const mine = T.match.yours;
  mine.x = W / 2 - 120; mine.y = H - 120; mine.vx = 0; mine.vy = 0;
  T.match.over = false;
  T.match.shakes = 0;
  await frame();

  const cornered = (b) => b.x - RIM < b.bound + 30 && b.y - RIM < b.bound + 30;
  const startedPinned = cornered(m) && Math.hypot(m.x - theirs.x, m.y - theirs.y) < m.r + theirs.r + 30;

  // Shake it the way the game would, but without sitting through the real wait each time.
  let shookShooter = false;
  let shakes = 0;
  while (shakes < T.SHAKE_GIVE_UP && cornered(m)) {
    const before = { x: theirs.x, y: theirs.y };
    T.match.idle = T.SHAKE_WAIT + 1;
    T.matchIdle(0);
    shakes++;
    if (Math.hypot(theirs.vx, theirs.vy) > 60) shookShooter = true;
    await settle();
    if (Math.hypot(theirs.x - before.x, theirs.y - before.y) > 20) shookShooter = true;
    T.match.cool = 999;
  }

  const free = !cornered(m);
  const apart = Math.hypot(m.x - theirs.x, m.y - theirs.y);
  const where = `${Math.round(m.x)},${Math.round(m.y)}`;

  // Phase two: the opponent that will not give up. Jam it back into the corner under the
  // shooter after every shake, the way a shooter that keeps chasing it would. A shake alone
  // can never win this one — the give-up rule has to lift it out.
  let lifted = null;
  for (let i = 0; i < T.SHAKE_GIVE_UP; i++) {
    m.x = RIM + 16; m.y = RIM + 16; m.vx = 0; m.vy = 0;
    theirs.x = RIM + 16 + 48; theirs.y = RIM + 16 + 48; theirs.vx = 0; theirs.vy = 0;
    await frame();
    T.match.idle = T.SHAKE_WAIT + 1;
    T.matchIdle(0);
    T.match.cool = 999;
    if (!cornered(m) && Math.hypot(m.x - W / 2, m.y - H / 2) < Math.hypot(W, H) / 4) {
      lifted = `${Math.round(m.x)},${Math.round(m.y)} after ${i + 1}`;
      break;
    }
  }
  await settle();

  // And the round can actually be finished off: drop it down the nearest hole by hand.
  const hole = T.holes.slice().sort((a, b) =>
    Math.hypot(a.x - m.x, a.y - m.y) - Math.hypot(b.x - m.x, b.y - m.y))[0];
  m.x = hole.x; m.y = hole.y; m.vx = 0; m.vy = 0;
  for (let i = 0; i < 90 && T.bodies.indexOf(m) >= 0; i++) await frame();
  const ended = T.bodies.indexOf(m) < 0 && T.match.over;

  const problems = [];
  if (!startedPinned) problems.push('the setup did not actually pin the marble — the test proves nothing');
  if (!shookShooter) problems.push('the shake never moved the shooter doing the pinning');
  if (!free) problems.push(`after ${shakes} shakes the marble is still in the corner at ${where}`);
  if (free && apart < m.r + theirs.r + 10) problems.push(`freed but still under their shooter (${Math.round(apart)}px apart)`);
  if (!lifted) problems.push(`kept pinned through ${T.SHAKE_GIVE_UP} shakes — the tray never tipped it back into the middle`);
  if (!ended) problems.push('potting the last marble did not end the round');

  return JSON.stringify({
    pass: problems.length === 0,
    detail: problems.length ? problems.join('; ')
      : `pinned in the corner, free after ${shakes} shake${shakes === 1 ? '' : 's'} `
        + `at ${where}, ${Math.round(apart)}px off their shooter. `
        + `Re-pinned every shake: lifted to the middle at ${lifted}. Round ended.`,
  });
})();
