/* The keyboard has to reach the car.

   Everything else here is checked by driving the AI, and the AI does not use the
   key handler at all — it writes `throttle` and `steer` straight onto the car.
   So the entire player input path could be dead (a renamed element id, a
   swallowed keydown, the countdown never releasing the controls) and every other
   check would still pass while the game was unplayable.

   This holds real keys down over the real listeners and asks for three things:

   1. Nothing moves while the lights are still on.
   2. Throttle accelerates, and the brake stops it again.
   3. Steering actually turns the car, in the direction asked.

   It also drives a whole lap on rails — throttle plus a steering correction
   towards the centreline — to confirm a keyboard-driven car can get round
   without help, which is the thing the player will do first. */
return (async () => {
  const P = window.__paddock;
  const problems = [];
  const notes = [];

  const key = (code, down) => window.dispatchEvent(
    new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true }));
  const release = () => ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']
    .forEach((c) => key(c, false));

  P.start('workbench', { laps: 5 });
  // Send the rivals home for the pedal and steering checks. They lap in about
  // twelve seconds, so a car parked on the racing line to measure its brakes
  // gets rear-ended at 150 u/s and appears to accelerate under braking.
  P.state.cars = P.state.cars.filter((c) => c.isPlayer);
  const you = P.state.player;
  const speed = () => Math.hypot(you.vx, you.vy);

  // --- 1. the countdown holds the field ---
  key('ArrowUp', true);
  P.sim(2);                                   // still inside the 3s countdown
  if (speed() > 1) problems.push(`moved at ${speed().toFixed(1)} u/s during the countdown`);
  notes.push(`countdown holds (${speed().toFixed(2)} u/s)`);

  // --- 1b. and the GO! card gets out of the way afterwards ---
  // It is a grid item, and `display: grid` beats the UA stylesheet's
  // `[hidden] { display: none }` — so setting `hidden` on it did nothing and the
  // card sat over the middle of the desk for the whole race.
  P.sim(1.2);                                 // lights out
  await new Promise((r) => setTimeout(r, 900)); // the card clears on a real timer
  const card = document.getElementById('countdown');
  if (getComputedStyle(card).display !== 'none' || card.offsetParent !== null) {
    problems.push(`the countdown card is still on screen (hidden=${card.hidden}, `
      + `display=${getComputedStyle(card).display})`);
  } else {
    notes.push('GO! card clears');
  }

  // --- 2. throttle and brake ---
  // On the straight bit of bare desk after the start, not on the boost strip
  // just before it — a boost pad shoves you along whatever the pedals say, so
  // measuring the brakes there measures the pad.
  release();
  P.put(you, 0.115);
  key('ArrowUp', true);
  P.sim(1.6);
  const rolling = speed();
  if (rolling < 80) problems.push(`throttle only reached ${rolling.toFixed(0)} u/s in 1.6s`);

  // Measure the forward component, not the speed: hold the key long enough and
  // the car stops and reverses, and |v| climbs again while doing it.
  const forward = () => you.vx * Math.cos(you.ang) + you.vy * Math.sin(you.ang);
  key('ArrowUp', false);
  key('ArrowDown', true);
  P.sim(0.35);
  const braked = forward();
  if (braked > rolling * 0.45) {
    problems.push(`brake barely bit: ${rolling.toFixed(0)} -> ${braked.toFixed(0)} u/s forward in 0.35s`);
  }
  // and keeping it down backs the car up
  P.sim(1.2);
  const reversing = forward();
  if (reversing > -20) problems.push(`holding the brake never reversed: ${reversing.toFixed(0)} u/s forward`);
  notes.push(`throttle ${rolling.toFixed(0)} u/s, brake ${braked.toFixed(0)}, reverse ${reversing.toFixed(0)}`);
  release();

  // --- 3. steering turns the car the way it was asked, at a sane rate ---
  // Accumulate the turn in small steps rather than comparing start to finish:
  // a car that can swing more than half a turn in the sample window aliases, and
  // a 180-degree spin reads as a small turn the *other* way.
  for (const [code, want] of [['ArrowLeft', -1], ['ArrowRight', 1]]) {
    P.put(you, 0.115);                        // the same straight bit of desk
    key('ArrowUp', true);
    P.sim(1.2);
    key(code, true);
    let turned = 0;
    let prev = you.ang;
    const SPAN = 0.9;
    for (let t = 0; t < SPAN; t += 0.05) {
      P.sim(0.05);
      let d = you.ang - prev;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      turned += d;
      prev = you.ang;
    }
    release();
    const rate = turned / SPAN;
    if (Math.sign(turned) !== want || Math.abs(turned) < 0.25) {
      problems.push(`${code} turned the car by ${turned.toFixed(2)} rad, wanted `
        + `${want > 0 ? 'right' : 'left'} by at least 0.25`);
    } else if (Math.abs(rate) > 4.2) {
      // A ceiling rather than a feel setting: TURN plus the full drift bonus is
      // about 4.05, so anything past this means the rate is running away. How
      // twitchy it actually feels is measured properly in fairness.js, by
      // counting how much the driver has to saw at the wheel.
      problems.push(`${code} turns at ${rate.toFixed(2)} rad/s — runaway turn rate`);
    } else {
      notes.push(`${code} ${rate.toFixed(2)} rad/s`);
    }
  }

  // --- 4. a whole lap under the keys ---
  P.start('workbench', { laps: 5 });
  const me = P.state.player;
  P.sim(3.1);                                 // let the lights go out
  key('ArrowUp', true);

  // The grid sits *behind* the line, so crossing it the first time only opens
  // lap 1 — a full lap means getting the counter to 2.
  let steps = 0;
  const limit = 60 / 0.05;
  while (me.lap < 2 && steps++ < limit) {
    const tr = P.track;
    const p = tr.pts[(me.si + Math.round(90 / tr.step)) % tr.count];
    let err = Math.atan2(p.y - me.y, p.x - me.x) - me.ang;
    while (err > Math.PI) err -= Math.PI * 2;
    while (err < -Math.PI) err += Math.PI * 2;
    key('ArrowLeft', err < -0.06);
    key('ArrowRight', err > 0.06);
    P.sim(0.05);
  }
  release();

  if (me.lap < 2) {
    problems.push(`no lap under keyboard control in 60s — reached ${Math.round(me.s)}`
      + ` of ${Math.round(P.track.len)} on lap ${me.lap} at ${Math.round(me.x)},${Math.round(me.y)}`);
  } else {
    // the rivals lap in much the same time, so they may not have banked one yet
    const aiBest = Math.min(...P.state.cars.filter((c) => c.ai).map((c) => c.best));
    notes.push(`keyboard lap in ${(me.lapTimes[0] / 1000).toFixed(1)}s`
      + (isFinite(aiBest) ? ` (AI best ${(aiBest / 1000).toFixed(1)}s)` : ' (no rival lap banked yet)'));
  }

  return JSON.stringify({
    pass: !problems.length,
    detail: problems.length ? problems.join(' | ') : notes.join('; '),
  });
})();
