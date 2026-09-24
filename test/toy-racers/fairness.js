/* A plain driver has to be able to finish in the pack.

   This is the case that would have caught the thing every other check missed.
   The geometry was legal, the props were clear, the field finished, the keyboard
   worked — and the game was still unplayable, because the corners could not be
   taken. Amber's driving logs read: 34% of the lap at full steering lock, 8-16%
   of it off the track, `widest` twice the half-width, and last place by two
   seconds a lap on all three tracks.

   So this drives each track with a deliberately unremarkable driver — looks a
   fixed distance ahead, steers in whole keypresses through a wide deadband,
   never lifts, never brakes, never uses the slipstream — and asks for three
   things:

   1. it finishes mid-field or better;
   2. it is not sawing at the wheel to do it;
   3. it is not spending the lap in the scenery.

   A real person is slower than this, but a real person can also see a corner
   coming. If *this* cannot get round without fighting the car, nobody can. */
return (async () => {
  const P = window.__toyRacers;
  const problems = [];
  const notes = [];

  const MAX_PLACE = 3;        // of five
  const MAX_LOCK = 0.15;      // share of the lap at full steering lock
  const MAX_OFF = 0.08;       // share of the lap off the track
  // Amber's logs of the unplayable version read 40-47 steering reversals a
  // minute — one correction every second and a half, all race. That is the
  // number that says "fighting it" better than any of the others.
  const MAX_SAW = 24;         // steering reversals a minute
  const LAPS = 3;

  const key = (code, down) => window.dispatchEvent(
    new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true }));
  const release = () => ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']
    .forEach((c) => key(c, false));

  for (const def of P.TRACKS) {
    P.start(def.id, { laps: LAPS, cls: 'mid' });
    const me = P.state.player;
    P.sim(3.1);                                   // let the lights go out
    key('ArrowUp', true);

    // measured here, one sample a step: time at full lock, time off the
    // track, and how often the wheel changes hands
    const DT = 0.07, LOCK = 0.8;
    let total = 0, lockT = 0, offT = 0, flips = 0, lastSteer = 0;
    let steps = 0;
    const cap = 240 / DT;
    while (!me.done && steps++ < cap) {
      const tr = P.track;
      const aim = tr.pts[(me.si + Math.round(200 / tr.step)) % tr.count];
      let err = Math.atan2(aim.y - me.y, aim.x - me.x) - me.ang;
      while (err > Math.PI) err -= Math.PI * 2;
      while (err < -Math.PI) err += Math.PI * 2;
      key('ArrowLeft', err < -0.2);
      key('ArrowRight', err > 0.2);
      P.sim(DT);
      total += DT;
      if (Math.abs(me.steer) > LOCK) lockT += DT;
      if (!me.onTrack && !me.air) offT += DT;
      const st = me.steer > 0.3 ? 1 : me.steer < -0.3 ? -1 : 0;
      if (st && lastSteer && st !== lastSteer) flips++;
      if (st) lastSteer = st;
    }
    release();

    if (!me.done) {
      problems.push(`${def.id}: never finished ${LAPS} laps in 240s — reached lap ${me.lap}`);
      continue;
    }

    const lock = lockT / total;
    const off = offT / total;
    const aiBest = Math.min(...P.state.cars.filter((c) => c.ai).map((c) => c.best));

    if (me.pos > MAX_PLACE) {
      problems.push(`${def.id}: plain driving finished ${me.pos}th of ${P.state.cars.length}`
        + ` (best lap ${(me.best / 1000).toFixed(1)}s against the AI's ${(aiBest / 1000).toFixed(1)}s)`);
    }
    if (lock > MAX_LOCK) {
      problems.push(`${def.id}: ${Math.round(lock * 100)}% of the lap at full steering lock`
        + ` — the car is not turning enough for the track (limit ${Math.round(MAX_LOCK * 100)}%)`);
    }
    const saw = flips / total * 60;
    if (saw > MAX_SAW) {
      problems.push(`${def.id}: ${saw.toFixed(0)} steering reversals a minute`
        + ` — the driver is sawing at the wheel (limit ${MAX_SAW})`);
    }
    if (off > MAX_OFF) {
      problems.push(`${def.id}: ${Math.round(off * 100)}% of the lap off the track`
        + ` (limit ${Math.round(MAX_OFF * 100)}%)`);
    }
    notes.push(`${def.id} P${me.pos} best ${(me.best / 1000).toFixed(1)}s vs AI ${(aiBest / 1000).toFixed(1)}s,`
      + ` lock ${Math.round(lock * 100)}% off ${Math.round(off * 100)}% saw ${saw.toFixed(0)}/min`);
  }

  return JSON.stringify({
    pass: !problems.length,
    detail: problems.length ? problems.join(' | ') : notes.join('; '),
  });
})();
