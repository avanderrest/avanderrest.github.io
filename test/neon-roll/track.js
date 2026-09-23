/* The generated track has to join up, stay level on average with no flats,
   every lip has to throw, and every gap has to be clearable.

   Built in the Gaps mode, the only one with gaps; the other pieces are shared.
   Level: every height is picked against y = 0, and a run once felt like one long
   slide down because each piece ended a little lower than it began. Flats: a
   level stretch longer than a crest or a valley bottom breaks the flow.

   The ball leaves the ground only where the track's own curvature says so,
   which depends on every piece ending at the same height and slope the next
   one starts at. A join that steps by a few pixels or kinks by a few degrees
   throws the ball in the air for no reason, and on screen it just looks like a
   bumpy bit of tube — and Amber asked for curves everywhere, no pointy angles.
   Jumps used to end in a corner (the lip); now the top of a jump is a rounded
   cap, and the check there is that it is curved tightly enough to throw a
   ball at cruising speed.
   And the landing curve after every lip may only go down: it is shaped
   around a flight path, and once, meeting a flight that passed high over the
   far edge made it climb — a wall that rolled slow balls back into the gap.

   The gaps are sized by a closed-form sum in the generator that ignores air
   drag. This checks it independently: for every gap over 5 km of 20 seeds it
   takes the run-in drop and ramp height straight off the pieces, works out the
   speed a ball that never pressed anything would have at the lip (80% of a
   drop from rest, the generator's own promise), and flies that ball across
   with drag, as the game does. It has to reach the far side no lower than
   one ball radius under the edge, which is where the game counts hitting the
   end of the tube. mechanic.js only reaches the first 2–3 km; difficulty keeps
   rising after that, so the long gaps only show up here. */
return (async () => {
  const N = window.__neonRoll, C = N.constants;
  N.freeze(true);
  const problems = [];
  const o = { y: 0, dy: 0, ddy: 0 };
  const at = (seg, X) => { seg.f(X, o); return { y: o.y, dy: o.dy }; };
  let gaps = 0, joins = 0, lips = 0, crests = 0, gentle = 0, arcs = 0, worstMean = 0, lowest = Infinity, highest = -Infinity, tightest = Infinity, tightestAt = '', longest = 0;

  for (let seed = 1; seed <= 20; seed++) {
    N.start('gaps', { seed: seed * 7717, noChase: true });      // the only mode with gaps; every other piece too
    const T = N.track;
    T.extend(5000 * C.PX_PER_M);
    const segs = T.segs;
    // level on average: waves around 0, never a long slide down (or up)
    // no drift: the first kilometre and the last sit at the same height on average,
    // and the waves stay within bounds in between
    const km = 1000 * C.PX_PER_M;
    const meanOver = (a, b) => { let sum = 0, n = 0; for (let X = a; X < b; X += 100) { const g = N.ground(X); if (g) { sum += g.y; n++; } } return sum / n; };
    let lo = Infinity, hi = -Infinity;
    for (let X = 0; X < 5 * km; X += 100) { const g = N.ground(X); if (g) { lo = Math.min(lo, g.y); hi = Math.max(hi, g.y); } }
    const drift = meanOver(4 * km, 5 * km) - meanOver(0, km);
    worstMean = Math.max(worstMean, Math.abs(drift)); lowest = Math.min(lowest, lo); highest = Math.max(highest, hi);
    if (Math.abs(drift) > 500 || lo < -3000 || hi > 1500) problems.push(`seed ${seed}: not level — drifts ${drift.toFixed(0)}px from the first km to the last, ranges ${lo.toFixed(0)}..${hi.toFixed(0)}px`);
    // no flats: nothing but a valley bottom or a crest top may be level, and not for long
    let flatRun = 0;
    for (let X = 0; X < 5000 * C.PX_PER_M; X += 10) {
      const g = N.ground(X);
      // a valley bottom or a crest is level for a moment but curving; a flat is level and straight
      if (g) T.at(X).f(X, o);
      flatRun = g && Math.abs(g.dy) < 0.05 && Math.abs(o.ddy) < 0.0003 ? flatRun + 10 : 0;
      if (flatRun > 260) { problems.push(`seed ${seed}: a flat ${flatRun}px long at x=${Math.round(X)}`); break; }
    }
    for (let i = 1; i < segs.length; i++) {
      const a = segs[i - 1], b = segs[i];
      if (Math.abs(a.x1 - b.x0) > 1e-6) problems.push(`seed ${seed}: pieces ${i - 1}/${i} overlap or part at x=${Math.round(b.x0)}`);
      if (a.kind === 'gap' || b.kind === 'gap') continue;
      const e = at(a, a.x1 - 1e-6), s = at(b, b.x0);
      if (a.kind === 'cap') {
        // a jump's rounded top: curved tightly enough to throw a ball going at cruising speed
        lips++;
        if (!(C.CRUISE * C.CRUISE * C.LIP_CURVE > C.AIR_G)) problems.push(`the tops of jumps (curve ${C.LIP_CURVE}) are too gentle to throw a cruising ball`);
      }
      joins++;
      if (Math.abs(e.y - s.y) > 0.5 || Math.abs(e.dy - s.dy) > 0.02) {
        problems.push(`seed ${seed}: ${a.kind}->${b.kind} at x=${Math.round(b.x0)} steps ${(s.y - e.y).toFixed(1)}px, slope ${e.dy.toFixed(3)}->${s.dy.toFixed(3)}`);
      }
    }

    // every hill is symmetric about its crest (the same curvature either side) and
    // curved tightly enough there to throw a ball going at cruising speed
    for (let i = 1; i < segs.length; i++) {
      const up = segs[i - 1], down = segs[i];
      if (up.kind !== 'roll' || down.kind !== 'roll' || !up.hill || !down.hill) continue;
      const k1 = at(up, up.x1 - 1e-6) && o.ddy, k2 = at(down, down.x0) && o.ddy;
      if (!(k1 < 0 && k2 < 0)) continue;                  // a valley between two hills, not a crest
      crests++;
      if (Math.abs(k1 - k2) > 0.02 * Math.abs(k1)) problems.push(`seed ${seed}: the hill at x=${Math.round(down.x0)} is lopsided (${k1.toExponential(2)} vs ${k2.toExponential(2)})`);
      if (!(C.CRUISE * C.CRUISE * -k1 > C.AIR_G)) gentle++;
    }

    // the tube after a lip only goes down: any climb there is a wall a slow ball rolls back off
    for (const a of segs) {
      if (!['steep', 'ease'].includes(a.kind)) continue;
      arcs++;
      let prev = at(a, a.x0).y;
      for (let X = a.x0 + 10; X < a.x1; X += 10) {
        const y = at(a, X).y;
        if (y > prev + 0.5) { problems.push(`seed ${seed}: the landing after the lip at x=${Math.round(a.x0)} climbs at x=${Math.round(X)}`); break; }
        prev = y;
      }
    }

    for (let i = 0; i < segs.length; i++) {
      const g = segs[i];
      if (g.kind !== 'gap') continue;
      gaps++;
      const ramp = segs[i - 1], runIn = segs[i - 2], land = segs[i + 1];
      if (!ramp || ramp.kind !== 'ramp' || !runIn || runIn.kind !== 'roll') { problems.push(`seed ${seed}: gap at x=${Math.round(g.x0)} has no ramp and run-in before it`); continue; }
      if (!land || land.kind !== 'steep') { problems.push(`seed ${seed}: gap at x=${Math.round(g.x0)} has no landing after it`); continue; }
      const lip = at(ramp, ramp.x1 - 1e-6);
      if (Math.abs(lip.y - g.yTop) > 0.5 || Math.abs(at(land, land.x0).y - g.yLow) > 0.5) problems.push(`seed ${seed}: gap at x=${Math.round(g.x0)} edges don't meet the tube`);
      const P = at(runIn, runIn.x0).y - runIn.yEnd, h = ramp.yEnd - at(ramp, ramp.x0).y;
      const v = Math.sqrt(2 * C.G * Math.max(40, P - h)) * 0.8;
      const c = 1 / Math.hypot(1, lip.dy);
      let x = g.x0, y = g.yTop, vx = v * c, vy = v * lip.dy * c;
      const dt = C.STEP;
      while (x < g.x1 && y > g.yLow - 2000) {
        const sp = Math.hypot(vx, vy);
        vx -= vx * C.DRAG * sp * dt; vy -= (C.AIR_G + vy * C.DRAG * sp) * dt;
        x += vx * dt; y += vy * dt;
      }
      const margin = y - (g.yLow - C.R);
      longest = Math.max(longest, g.x1 - g.x0);
      if (margin < tightest) { tightest = margin; tightestAt = `seed ${seed} x=${Math.round(g.x0)} (${Math.round((g.x1 - g.x0))}px gap, lip ${Math.round(v)}px/s)`; }
      if (margin < 0) problems.push(`seed ${seed}: an unpressed ball drops ${(-margin).toFixed(0)}px short of the far edge at x=${Math.round(g.x0)}`);
    }
  }
  N.freeze(false);
  N.setMode('endless');

  return JSON.stringify({
    pass: problems.length === 0,
    detail: `${problems.slice(0, 6).join('; ') || 'ok'}${problems.length > 6 ? ` (+${problems.length - 6} more)` : ''} | ${joins} smooth joins, ${crests} symmetric crests (${gentle} too gentle to throw a cruising ball, only a faster one), ${arcs} landings all downhill, ${gaps} gaps, height ${lowest.toFixed(0)}..${highest.toFixed(0)}px (drift at most ${worstMean.toFixed(0)}px over 5 km), longest ${Math.round(longest)}px; tightest clears the edge by ${tightest.toFixed(0)}px at ${tightestAt}`,
  });
})();
