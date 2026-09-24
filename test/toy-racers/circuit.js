/* Every track has to be raceable, and none of the ways it stops being raceable
   show up in a screenshot.

   All three of these were real, and all three looked completely fine on the desk:

   1. **A corner tighter than the track is wide.** The centreline is a spline and
      the edges are offset from it by the half-width, so once the radius of
      curvature drops below the half-width the two edges cross and the corridor
      pinches shut. A car arriving there is clamped against both walls at once
      and stops dead at full throttle. `workbench` shipped like this for an hour:
      the coil on the right had R=29 against w=26, and nobody finished a lap.

   2. **A solid prop standing in the road.** The desk dressing is shared between
      the tracks and each track drops the props its route runs over. Miss one and
      you get an invisible wall — the toolbox sat in the middle of `longrule`'s
      back straight, and the whole field piled into it every lap.

   3. **The field not finishing.** Cheapest catch-all: race it and count. If the
      physics, the AI speed profile or the lap counter break, this notices even
      when the geometry is fine.

   `detail` prints the tightest corner on every track as a ratio of the track's
   own half-width, so it says how near the edge each one is, not just that it
   passed. */
return (async () => {
  const P = window.__toyRacers;
  const problems = [];
  const notes = [];

  // Below about 1.2 the corridor is pinched shut; 1.6 leaves room for a car that
  // is 46 long to actually turn through it.
  const MIN_RATIO = 1.6;
  const CAR_R = 17;
  const CAR_W = 26;
  const LAPS = 3;
  // You have to be able to pass somebody. Two cars abreast need two widths plus
  // enough between them that touching is a choice — the first pass at this had
  // 54-unit corridors, which is under two car widths, and there was nowhere on
  // any of the three tracks that an overtake would physically fit.
  const MIN_CARS_ABREAST = 2.6;
  // How much a corner may demand you slow below what that surface is rated for.
  // A lift is fine; needing to halve your speed for a bend you cannot see the
  // end of is not.
  const MAX_LIFT = 0.20;

  for (const def of P.TRACKS) {
    const tr = P.buildTrack(def);

    // --- 1. the corridor stays open all the way round ---
    let tight = { ratio: Infinity };
    for (const p of tr.pts) {
      const R = p.k > 1e-9 ? 1 / p.k : Infinity;
      const ratio = R / p.w;
      if (ratio < tight.ratio) tight = { ratio, R, w: p.w, x: p.x, y: p.y };
    }
    if (tight.ratio < MIN_RATIO) {
      problems.push(`${def.id}: corner at ${Math.round(tight.x)},${Math.round(tight.y)} has radius `
        + `${Math.round(tight.R)} against half-width ${Math.round(tight.w)} `
        + `(${tight.ratio.toFixed(2)}x, needs ${MIN_RATIO})`);
    }

    // --- 2. nothing solid is parked on the racing line ---
    const omit = new Set(def.omit || []);
    const props = P.DRESSING.filter((p) => !omit.has(p.id)).concat(def.extra || []);
    for (const pr of props) {
      if (!pr.r) continue;
      let worst = Infinity;
      let at = null;
      for (const s of tr.pts) {
        const gap = Math.hypot(pr.x - s.x, pr.y - s.y) - (pr.r + s.w + CAR_R);
        if (gap < worst) { worst = gap; at = s; }
      }
      if (worst < 0) {
        problems.push(`${def.id}: ${pr.id || pr.img} at ${pr.x},${pr.y} blocks the track by `
          + `${Math.round(-worst)} units near ${Math.round(at.x)},${Math.round(at.y)}`);
      }
    }

    // --- 1a. every corner can actually be taken ---
    // The real trap is not a corner that is tight, it is a corner that is tight
    // *and* made of something slippery. The turn rate is capped by lateral grip,
    // so the steel rule (a third of the tubing's grip) once carried R=88 bends
    // that needed a 50% speed cut — and the driving logs showed half the lap
    // spent off the road at exactly those corners. A corner may ask for a lift;
    // it may not ask for the car to do something it cannot do.
    const H = P.HANDLING;
    let harsh = { cut: -Infinity };
    for (const p of tr.pts) {
      const R = p.k > 1e-9 ? 1 / p.k : Infinity;
      const surf = P.SURF[p.surf] || P.SURF.desk;
      const latG = H.LAT_FLOOR + surf.grip * (1 - H.LAT_FLOOR);
      const maxV = Math.min(H.TURN * R, Math.sqrt(H.LAT_ACCEL * latG * R));
      const cut = 1 - maxV / (H.TOP_SPEED * surf.top);
      if (cut > harsh.cut) {
        harsh = { cut, R, surf: p.surf, x: p.x, y: p.y, maxV, rated: H.TOP_SPEED * surf.top };
      }
    }
    if (harsh.cut > MAX_LIFT) {
      problems.push(`${def.id}: the ${harsh.surf} corner at ${Math.round(harsh.x)},${Math.round(harsh.y)} `
        + `(R=${Math.round(harsh.R)}) can only be taken at ${Math.round(harsh.maxV)} against a rated `
        + `${Math.round(harsh.rated)} — a ${Math.round(harsh.cut * 100)}% cut, limit is ${Math.round(MAX_LIFT * 100)}%`);
    }

    // --- 1b. there is room to overtake, everywhere ---
    let narrow = { w: Infinity };
    for (const p of tr.pts) if (p.w < narrow.w) narrow = { w: p.w, x: p.x, y: p.y };
    const abreast = (narrow.w * 2) / CAR_W;
    if (abreast < MIN_CARS_ABREAST) {
      problems.push(`${def.id}: only ${abreast.toFixed(1)} car widths at `
        + `${Math.round(narrow.x)},${Math.round(narrow.y)} — no room to pass `
        + `(wants ${MIN_CARS_ABREAST})`);
    }

    // --- 1c. the lap does not run into itself ---
    // Widening the track is what makes this possible: two stretches that used to
    // pass each other comfortably merge into one piece of road, and a car on one
    // of them gets its lap progress yanked onto the other.
    let clash = { gap: Infinity };
    for (let i = 0; i < tr.count; i++) {
      for (let j = i + 1; j < tr.count; j++) {
        const along = Math.min(j - i, tr.count - (j - i));
        if (along < 26) continue;                    // neighbours, not a clash
        const a = tr.pts[i], b = tr.pts[j];
        const gap = Math.hypot(a.x - b.x, a.y - b.y) - (a.w + b.w);
        if (gap < clash.gap) clash = { gap, x: a.x, y: a.y };
      }
    }
    if (clash.gap < 0) {
      problems.push(`${def.id}: the lap overlaps itself by ${Math.round(-clash.gap)} units `
        + `near ${Math.round(clash.x)},${Math.round(clash.y)}`);
    }

    notes.push(`${def.id} ${Math.round(tr.len)}u tightest ${tight.ratio.toFixed(2)}x `
      + `${abreast.toFixed(1)} abreast gap ${Math.round(clash.gap)}`);
  }

  // --- 3. the field can actually get round it ---
  for (const def of P.TRACKS) {
    P.start(def.id, { laps: LAPS });
    const rivals = P.state.cars.filter((c) => !c.isPlayer);
    // three laps at the slowest observed pace is about 50s; 150 is generous
    P.sim(150);

    const unfinished = rivals.filter((c) => !c.done);
    if (unfinished.length) {
      const where = unfinished.map((c) => `${c.name} stuck on lap ${c.lap} at `
        + `${Math.round(c.x)},${Math.round(c.y)} doing ${Math.round(Math.hypot(c.vx, c.vy))}`);
      problems.push(`${def.id}: ${unfinished.length}/${rivals.length} never finished — ${where.join('; ')}`);
    }

    const best = Math.min(...rivals.map((c) => c.best).filter((t) => isFinite(t)));
    const worstLap = Math.max(...rivals.flatMap((c) => c.lapTimes));
    if (isFinite(best)) {
      notes.push(`${def.id} best lap ${(best / 1000).toFixed(1)}s, slowest ${(worstLap / 1000).toFixed(1)}s`);
      // a lap three times the best means somebody is grinding along a wall
      if (worstLap > best * 3) {
        problems.push(`${def.id}: slowest lap ${(worstLap / 1000).toFixed(1)}s against a best of `
          + `${(best / 1000).toFixed(1)}s — something is getting stuck`);
      }
    }
  }

  return JSON.stringify({
    pass: !problems.length,
    detail: problems.length ? problems.join(' | ') : notes.join('; '),
  });
})();
