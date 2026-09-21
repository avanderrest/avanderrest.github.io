/* A match is winnable with the keys — a tap plays a soft shot, a lean plays a hard one.

   The play log that prompted this said every shot in a whole match peaked at exactly
   460px/s, the steering cap: a key is on or off, and the old code slammed the shooter to
   the cap in under half a second, so there was no such thing as a gentle push. A shooter
   at 460 hands the marble it strikes about half as much again — near 660px/s — and a
   marble only drops in under SINK_SPEED (300). 38% of crossings were "too fast".

   So the claim, set up dead straight so aim cannot be the variable: shooter, marble and
   hole in a line, and the only difference between the runs is how long the key is held.

   1. A tap pots it. The marble arrives under the sink speed and drops in.
   2. Leaning on the key does not. It rides across, as it should — a hard shot is still a
      hard shot, and that is the choice the wind-up gives back.
   3. Shift is the brake: held on a rolling shooter it pulls it down to the gentle cap. */
return (async () => {
  const T = window.__tray;
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  const wait = async (secs) => { const t0 = performance.now(); while (performance.now() - t0 < secs * 1000) await frame(); };
  const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));

  // A real one-player match — the opponent is held off with its own cooldown rather than
  // by switching to two players, so this drives the same path the complaint came from.
  T.setTwo(false);
  T.setMode('match');
  T.match.count = 0;
  await frame();

  const hole = T.holes.find((h) => h.x > 480) || T.holes[0];
  const GAP = 200;   // px of open tray between the marble and the hole

  // Clear the tray down to the two shooters, park theirs out of the way, and line ours up.
  function setup() {
    for (let i = T.bodies.length - 1; i >= 0; i--) {
      if (!T.bodies[i].striker) T.bodies.splice(i, 1);
    }
    T.sinking.length = 0;
    const theirs = T.match.theirs;
    theirs.x = 80; theirs.y = 560; theirs.vx = 0; theirs.vy = 0;
    const m = T.add('marble-m', hole.x - GAP, hole.y, { team: 'you' });
    m.vx = 0; m.vy = 0;
    const me = T.match.yours;
    me.x = hole.x - GAP - 62; me.y = hole.y; me.vx = 0; me.vy = 0;
    T.setControl(me);
    T.match.cool = 999;   // the opponent takes a very long breath
    T.match.idle = 0;
    T.match.over = false; // potting the only marble on the tray ends the round; start it again
    T.match.count = 0;
    return m;
  }

  // Hold the left-to-right key for `hold` seconds, then watch for 3.5s more. The peaks are
  // sampled from the moment the key goes down: a long hold reaches the cap and strikes the
  // marble while it is still down, so measuring only after the release misses the whole shot.
  async function shot(hold) {
    const m = setup();
    await frame();
    let peak = 0, shooterPeak = 0, released = false;
    key('keydown', 'ArrowRight');
    const t0 = performance.now();
    while (performance.now() - t0 < (hold + 3.5) * 1000) {
      if (!released && performance.now() - t0 >= hold * 1000) { key('keyup', 'ArrowRight'); released = true; }
      peak = Math.max(peak, Math.hypot(m.vx, m.vy));
      shooterPeak = Math.max(shooterPeak, Math.hypot(T.match.yours.vx, T.match.yours.vy));
      if (T.bodies.indexOf(m) < 0) break;
      await frame();
    }
    if (!released) key('keyup', 'ArrowRight');
    const sank = T.bodies.indexOf(m) < 0;
    return { hold, sank, peak: Math.round(peak), shooterPeak: Math.round(shooterPeak) };
  }

  const tap = await shot(0.12);
  const lean = await shot(1.6);

  // The brake: wind the shooter right up, then hold Shift with nothing else and see it come
  // down. It starts at the left rim so a long hold has clear tray ahead of it.
  const m3 = setup();
  m3.x = 60; m3.y = 60;                  // the marble out of the way of the run
  T.match.yours.x = 90; T.match.yours.y = 400;
  key('keydown', 'ArrowRight');
  await wait(1.4);
  key('keyup', 'ArrowRight');
  const rolling = Math.round(Math.hypot(T.match.yours.vx, T.match.yours.vy));
  key('keydown', 'ShiftLeft');
  await wait(0.6);
  const braked = Math.round(Math.hypot(T.match.yours.vx, T.match.yours.vy));
  key('keyup', 'ShiftLeft');

  const problems = [];
  if (!tap.sank) problems.push(`a ${tap.hold}s tap did not pot it (marble peaked ${tap.peak}px/s, shooter ${tap.shooterPeak})`);
  if (tap.peak > T.SINK_SPEED) problems.push(`the tapped marble left at ${tap.peak}px/s, over the ${T.SINK_SPEED} sink speed`);
  if (lean.sank) problems.push(`a ${lean.hold}s hold potted it too — the hard shot should ride across`);
  if (lean.shooterPeak < T.STEER_MAX - 20) problems.push(`leaning on the key only reached ${lean.shooterPeak}px/s, not the ${T.STEER_MAX} cap`);
  if (braked > T.STEER_MIN + 30) problems.push(`Shift left the shooter at ${braked}px/s, not down near ${T.STEER_MIN}`);

  return JSON.stringify({
    pass: problems.length === 0,
    detail: problems.length ? problems.join('; ')
      : `tap ${tap.hold}s -> shooter ${tap.shooterPeak}px/s, marble ${tap.peak}px/s, IN. `
        + `hold ${lean.hold}s -> shooter ${lean.shooterPeak}px/s, marble ${lean.peak}px/s, rode over. `
        + `Shift brake ${rolling} -> ${braked}px/s.`,
  });
})();
