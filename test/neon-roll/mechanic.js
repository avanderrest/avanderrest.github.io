/* Flow has to pay, and a player who lands well has to survive.

   The ball always rolls on at a cruising speed; each Perfect in a row raises
   the flow level, which raises that speed and the lift off every lip, and a
   slam drops it back to plain cruising. If the numbers drift — lift too small,
   landing window too tight, the landings after lips shaped for the wrong
   flight — landing well gets you nowhere and nothing on screen says so. This
   plays each seed twice with the blackout held off:

   - idle: never presses. It must keep rolling and never fall in a gap (gaps
     are sized for a ball that never pressed anything).
   - pump: holds on every descent, lets go on every rise, and in the air flies
     both arcs forward and dives only when that lands closer to the slope's
     angle — what a decent player reads off the screen. It must go clearly
     further, reach a real flow level, spend a good part of the run in the air,
     and land more Perfects than slams.

   Tuning history: at HOLD_G 2.5 / DRAG 0.00009 the pumped ball hit 2300 px/s,
   overflew whole valleys and slammed onto upslopes 15 times a run, including
   onto kicker ramps, which then left it too slow for the gap. Then speed came
   from pumping and an idle ball stalled for good in the first valley; since
   the cruise/flow model the idle ball rolls on and the difference is flow.
   The airtime bar dropped from 25s to 20s of 90 when Amber asked for a slower,
   level track, and to 6s when flights were reined in so a player who never
   dives stops sailing over whole hills — slams broke the flow worse than
   shorter flights do. Big hills now only throw a ball going faster than plain
   cruising, so air is earned by flow. For the same reason the distance margin
   over a ball that never presses is 1.15x: speed comes from flow, not pumping. */
return (async () => {
  const N = window.__neonRoll;
  N.freeze(true);
  const SECONDS = 90, DT = 1 / 60;
  const seeds = [11, 202, 3003, 40004, 505];
  const rows = [], problems = [];

  // Where would the ball come down, holding or not, and how far off the slope's angle?
  // A decent player reads this off the screen; the bot flies both arcs forward.
  const C = N.constants;
  function landing(p, dive) {
    let { x, y, vx, vy } = p;
    const g = C.AIR_G * (dive ? C.DIVE_G : N.state.streak >= C.GLIDE_STREAK ? C.GLIDE_G : 1), dt = 1 / 60;
    for (let i = 0; i < 300; i++) {
      const sp = Math.hypot(vx, vy);
      vx -= vx * C.DRAG * sp * dt; vy -= (g + vy * C.DRAG * sp) * dt;
      const was = N.ground(x);
      x += vx * dt; y += vy * dt;
      const gr = N.ground(x);
      if (gr && !was && y < gr.y - C.R) return 999;  // into the end of the tube across a gap
      if (gr && y <= gr.y) {
        const vt = (vx + vy * gr.dy) / Math.hypot(1, gr.dy);
        return Math.acos(Math.max(-1, Math.min(1, vt / Math.hypot(vx, vy)))) * 180 / Math.PI;
      }
      if (!gr && y < p.y - 2500) return 999;       // down a gap
    }
    return 999;
  }

  function play(seed, pump) {
    N.start('endless', { seed, noChase: true });
    let airT = 0, topFlow = 0;
    for (let t = 0; t < SECONDS; t += DT) {
      const p = N.probe();
      if (p.phase !== 'run') break;
      let hold = false;
      if (pump && p.on) hold = p.s >= 0 ? p.dy < 0 : p.dy > 0;
      else if (pump) hold = p.air > 0.35 && landing(p, true) < landing(p, false) - 1;   // a player lets a flight get going before diving
      N.hold(hold);
      if (!p.on) airT += DT;
      N.step(DT);
      topFlow = Math.max(topFlow, N.probe().flow);
    }
    const p = N.probe();
    return { topFlow, dist: Math.round(p.dist), phase: p.phase, reason: p.reason, gaps: p.gaps, perfects: p.perfects, slams: p.slams, air: Math.round(airT), lip: p.lastLip };
  }

  // the Gaps mode: gaps are sized for a ball that never pressed, and a good player clears them too
  const gapRows = [];
  for (const seed of [21, 404, 5150]) {
    for (const pump of [false, true]) {
      N.start('gaps', { seed, noChase: true });
      for (let t = 0; t < 60; t += DT) {
        const p = N.probe();
        if (p.phase !== 'run') break;
        let hold = false;
        if (pump && p.on) hold = p.s >= 0 ? p.dy < 0 : p.dy > 0;
        else if (pump) hold = p.air > 0.35 && landing(p, true) < landing(p, false) - 1;   // a player lets a flight get going before diving
        N.hold(hold); N.step(DT);
      }
      const p = N.probe();
      gapRows.push(`${pump ? 'pump' : 'idle'} ${seed}: ${p.gaps} gaps, ${Math.round(p.dist)}m`);
      if (p.phase !== 'run') problems.push(`Gaps seed ${seed}: a ${pump ? 'good player' : 'ball that never pressed'} fell in after ${p.gaps} gaps`);
    }
  }
  rows.push('Gaps mode: ' + gapRows.join(', '));

  // a casual player: presses on the way down, lets go on the way up, never dives. That is
  // how Amber played, and her 16-slam run was long un-dived flights sailing over whole hills.
  // Since near misses stopped costing flow, a clean run builds flow, flies higher and faster,
  // and at high flow you have to dive: the landing ring shows when. So a player who never
  // dives is allowed a few more slams (7 a run) than one who does (see the pump rows).
  let casP = 0, casS = 0;
  for (const seed of [11, 202, 40004]) {
    N.start('endless', { seed, noChase: true });
    for (let t = 0; t < SECONDS; t += DT) {
      const p = N.probe();
      if (p.phase !== 'run') break;
      N.hold(p.on && (p.s >= 0 ? p.dy < 0 : p.dy > 0));
      N.step(DT);
    }
    casP += N.probe().perfects; casS += N.probe().slams;
  }
  rows.push(`casual (never dives): ${casP} Perfects, ${casS} slams over 3 runs`);
  // Reported, not required: since the track became steep launch hills spaced for a cruising
  // flight (Amber's Ski on Neon reference), a ball going faster or slower than cruising lands a
  // whole hill off, and the landing ring and a dive are how you correct it. A player who never
  // dives slams a lot, by design; the player above, who dives when the ring says, must not.

  let idleSum = 0, pumpSum = 0;
  for (const seed of seeds) {
    const idle = play(seed, false), pump = play(seed, true);
    idleSum += idle.dist; pumpSum += pump.dist;
    rows.push(`seed ${seed}: idle ${idle.dist}m (${idle.gaps} gaps, ${idle.perfects}P/${idle.slams}S, air ${idle.air}s)` +
      ` pump ${pump.dist}m (${pump.gaps} gaps, ${pump.perfects}P/${pump.slams}S, air ${pump.air}s, flow up to ${pump.topFlow})`);
    if (idle.phase !== 'run') problems.push(`seed ${seed}: idle run ended (${idle.reason})`);
    if (pump.phase !== 'run') problems.push(`seed ${seed}: pumping run ended (${pump.reason})`);
    if (pump.topFlow < 4) problems.push(`seed ${seed}: a good run only reached flow ${pump.topFlow}`);
    if (pump.air < 6) problems.push(`seed ${seed}: pumping ball was airborne only ${pump.air}s`);
    if (pump.perfects < 5) problems.push(`seed ${seed}: only ${pump.perfects} Perfects from a player who sees the landing coming`);
    if (pump.slams > pump.perfects) problems.push(`seed ${seed}: more slams (${pump.slams}) than Perfects (${pump.perfects})`);
  }
  const ratio = pumpSum / idleSum;
  if (ratio < 1.15) problems.push(`landing well covers only ${ratio.toFixed(2)}x the idle distance`);
  N.hold(false);

  return JSON.stringify({
    pass: problems.length === 0,
    detail: `${problems.join('; ') || 'ok'} | pump/idle ${ratio.toFixed(2)}x over ${SECONDS}s | ${rows.join(' | ')}`,
  });
})();
