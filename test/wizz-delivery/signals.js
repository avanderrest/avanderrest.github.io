/* Traffic signals have to be obeyed, by the traffic and by the till.

   The phasing itself is checked in maps.js — this is about behaviour, which is
   the part that cannot be seen in a screenshot and breaks quietly. Two claims:

   1. No NPC car crosses a stop line while its signal is red. The hold is easy
      to get subtly wrong, because the same code path that keeps a car waiting
      also runs the stuck-car timer that teleports a car which has been still
      for four seconds — a queue at a red is exactly that, so an unguarded hold
      makes cars vanish from the front of the queue instead of stopping.
   2. The player is charged for running one. Nothing else in the game reads
      `redLights`, so a broken fine is invisible until someone checks the books.

   Driven in an iframe on the village map, which is the one with curved
   junctions where the approach geometry is worked out from the road curves. */
return (async () => {
  const MAP_KEY = 'dash-map-v1';
  const before = localStorage.getItem(MAP_KEY);
  localStorage.setItem(MAP_KEY, 'village');

  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;left:-9999px;width:900px;height:600px';
  frame.src = '/wizz-delivery/index.html?case=signals';
  const w = await new Promise((resolve, reject) => {
    frame.onload = () => setTimeout(() => resolve(frame.contentWindow), 600);
    frame.onerror = () => reject(new Error('iframe failed'));
    document.body.appendChild(frame);
  });
  const D = w.__wizz;
  const problems = [];
  const notes = [];

  const tick = () => new Promise((r) => w.requestAnimationFrame(() => r()));
  const finish = () => {
    frame.remove();
    if (before === null) localStorage.removeItem(MAP_KEY); else localStorage.setItem(MAP_KEY, before);
  };

  if (!D || !D.junctions().length) {
    finish();
    return JSON.stringify({ pass: false, detail: 'no signalised junctions on the village map' });
  }
  const js = D.junctions();

  // ---- 1. nobody jumps a red ----
  const aligned = (arm, t) => {
    const ux = Math.sin(t.heading), uy = -Math.cos(t.heading);
    return arm.ux * ux + arm.uy * uy > 0.55 && D.armOff(arm, t.x, t.y) <= arm.w * 0.75;
  };
  // Don't wait for a car to wander into a junction — there are only fourteen on
  // the whole village and two signals, so an unlucky run proves nothing. Park
  // one on each approach, pointed at its stop line, and watch what it does.
  const park = (t, arm) => {
    t.curve = null;
    t.wait = 0;
    t.x = arm.x - arm.ux * 1.0;
    t.y = arm.y - arm.uy * 1.0;
    t.dirX = Math.round(arm.ux); t.dirY = Math.round(arm.uy);
    t.previous = null;
    t.target = { x: arm.x + arm.ux * 2.5, y: arm.y + arm.uy * 2.5 };
    t.heading = Math.atan2(arm.ux, -arm.uy);
  };
  const j0 = js[0];
  const staged = [];
  for (let i = 0; i < Math.min(j0.arms.length, D.traffic.length); i++) {
    park(D.traffic[i], j0.arms[i]);
    staged.push({ t: D.traffic[i], arm: j0.arms[i] });
  }

  let jumped = 0, heldFrames = 0, released = 0;
  const wasReleased = new Set();
  for (let sample = 0; sample < 160; sample++) {
    for (const s of staged) {
      const red = D.armState(j0, s.arm) !== 'green';
      const gap = D.armGap(s.arm, s.t.x, s.t.y);
      if (red && gap < -0.25 && !wasReleased.has(s.arm)) jumped++;
      if (red && gap > 0.02 && gap < 1.15) heldFrames++;
      if (!red && gap < -0.25) { if (!wasReleased.has(s.arm)) released++; wasReleased.add(s.arm); }
    }
    await tick();
    await new Promise((r) => setTimeout(r, 30));
  }
  if (jumped) problems.push(jumped + ' frames show an NPC past a stop line that was not green');
  if (!heldFrames) problems.push('no car was ever seen waiting at a red — the hold is not engaging');
  if (!released) problems.push('no car ever pulled away on green — the hold never lets go');
  notes.push(heldFrames + ' frames waiting at red, ' + released + ' approaches released on green, '
    + jumped + ' reds jumped');

  // ---- 2. the player is fined for running one ----
  // Find an approach that is red, put the car just short of its line doing a
  // sensible speed, then carry it across. Two frames: the watcher needs to see
  // the car short of the line before it sees it past.
  let fined = false, tried = 0;
  for (let attempt = 0; attempt < 400 && !fined; attempt++) {
    const j = js[0];
    const arm = j.arms.find((a) => D.armState(j, a) === 'red');
    if (!arm) { await tick(); continue; }
    tried++;
    const before2 = D.stats.redLights;
    const h = Math.atan2(arm.ux, -arm.uy);
    D.car.h = h; D.car.v = 1.4;
    D.car.x = arm.x - arm.ux * 0.55; D.car.y = arm.y - arm.uy * 0.55;
    await tick();
    if (D.armState(j, arm) !== 'red') continue;   // it changed under us; try again
    D.car.v = 1.4;
    D.car.x = arm.x + arm.ux * 0.5; D.car.y = arm.y + arm.uy * 0.5;
    await tick();
    if (D.stats.redLights > before2) fined = true;
  }
  if (!fined) problems.push('drove the player across a red stop line ' + tried + ' times and was never fined');
  else notes.push('player fined for running a red');

  finish();
  return JSON.stringify({
    pass: !problems.length,
    detail: problems.length ? problems.join('; ') : notes.join(' | '),
  });
})();
