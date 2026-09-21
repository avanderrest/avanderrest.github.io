/* Both maps have to be drivable, not just look right.

   The English village is authored as stroked curves that get rasterised to
   tiles. That is a generator, and generators fail quietly: a lane can be laid a
   hair too narrow and rasterise to a broken string of tiles, cutting the road
   network into islands. Nothing on screen says so — you only find out when the
   traffic piles up in a corner, or when a delivery is accepted for a house that
   no route can reach. The ponds are the same hazard from the other side: they
   are carved out of the road set, so a pond laid over a junction silently
   deletes it.

   So for each map: flood the road network from the spot the shift starts on,
   and insist that it is one piece, that every restaurant and every delivery
   address sits against a road inside it, and that nothing drivable overlaps
   water.

   Each map is loaded in its own iframe — the map is chosen from localStorage at
   load time, and the runner navigates a suite once, so reloading the page here
   would kill the very context this case is running in. */
return (async () => {
  const MAP_KEY = 'dash-map-v1';
  const before = localStorage.getItem(MAP_KEY);
  const frames = [];

  const load = (map) => new Promise((resolve, reject) => {
    localStorage.setItem(MAP_KEY, map);
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;left:-9999px;width:900px;height:600px';
    f.src = '/wizz-delivery/index.html?case=maps-' + map;
    f.onload = () => setTimeout(() => resolve(f.contentWindow), 500);
    f.onerror = () => reject(new Error('iframe failed for ' + map));
    frames.push(f);
    document.body.appendChild(f);
  });

  const problems = [];
  const notes = [];

  for (const map of ['grid', 'village']) {
    const w = await load(map);
    const D = w.__dash;
    if (!D) { problems.push(map + ': no debug handle'); continue; }
    if (D.map !== map) { problems.push(map + ': loaded as ' + D.map); continue; }

    const road = D.roadTiles;
    const key = (x, y) => x + ',' + y;
    const start = key(Math.floor(D.START.x), Math.floor(D.START.y));
    if (!road.has(start)) problems.push(map + ': the shift starts at ' + start + ', which is not road');

    // flood the network from the starting tile
    const seen = new Set();
    if (road.has(start)) {
      const stack = [start];
      seen.add(start);
      while (stack.length) {
        const [cx, cy] = stack.pop().split(',').map(Number);
        for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
          const k = key(nx, ny);
          if (road.has(k) && !seen.has(k)) { seen.add(k); stack.push(k); }
        }
      }
    }
    const stranded = road.size - seen.size;
    if (stranded > road.size * 0.02) {
      problems.push(map + ': road network is in pieces — ' + stranded + ' of ' + road.size + ' tiles cannot be driven to');
    }

    // everything you have to reach must sit against the reachable network
    const touchesNetwork = (x, y) => [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]
      .some(([nx, ny]) => seen.has(key(nx, ny)));
    const cutOffShops = D.restaurants.filter((r) => !touchesNetwork(r.x, r.y));
    const cutOffHouses = D.houses.filter((h) => !touchesNetwork(h.x, h.y));
    if (cutOffShops.length) problems.push(map + ': ' + cutOffShops.length + ' restaurants are off the network (' + cutOffShops.map((r) => r.name).join(', ') + ')');
    if (cutOffHouses.length > D.houses.length * 0.02) problems.push(map + ': ' + cutOffHouses.length + ' of ' + D.houses.length + ' addresses are off the network');

    // no two shops sharing a doorway, and none of them standing in a lane
    const spots = new Set(D.restaurants.map((r) => key(r.x, r.y)));
    if (spots.size !== D.restaurants.length) problems.push(map + ': two restaurants are on the same tile');
    const paved = D.restaurants.filter((r) => D.kindAt(r.x, r.y) !== 's');
    if (paved.length) problems.push(map + ': ' + paved.length + ' restaurants are not on pavement');

    // water is carved out of the road set, so the two must never overlap
    let wet = 0;
    for (const k of D.waterTiles) if (road.has(k)) wet++;
    if (wet) problems.push(map + ': ' + wet + ' road tiles are under water');

    // A roundabout you cannot get round is not a roundabout. The island is
    // solid and the collision grid is per tile, so a ring drawn as a smooth
    // annulus can still pinch shut at the island's diagonal corners — where two
    // solid squares meet at a point, the gap between them is zero. Sweep the
    // ring in polar coordinates and insist a car-sized disc can make the lap.
    const CAR_R = 0.3;
    const solidTile = new Set();
    for (let y = 0; y < 34; y++) for (let x = 0; x < 50; x++) {
      if (['B', 'T', 'W', 'I'].includes(D.kindAt(x, y))) solidTile.add(key(x, y));
    }
    for (const h of D.houses) solidTile.add(key(h.x, h.y));
    for (const r of D.restaurants) solidTile.add(key(r.x, r.y));
    const clearAt = (px, py) => {
      for (let ty = Math.floor(py - CAR_R); ty <= Math.floor(py + CAR_R); ty++) {
        for (let tx = Math.floor(px - CAR_R); tx <= Math.floor(px + CAR_R); tx++) {
          if (!solidTile.has(key(tx, ty))) continue;
          const nx = Math.max(tx, Math.min(px, tx + 1)), ny = Math.max(ty, Math.min(py, ty + 1));
          if (Math.hypot(px - nx, py - ny) < CAR_R) return false;
        }
      }
      return true;
    };
    const MIN_LANE = 0.9;   // a car is 0.6 wide; under 1.5x that it cannot be steered
    for (const [rx, ry] of D.roundabouts || []) {
      const cx = rx + 0.5, cy = ry + 0.5;
      const STEPS = 120, RADII = 60, R0 = 0.7, DR = 0.045;
      let narrowest = Infinity;
      const open = [];
      for (let a = 0; a < STEPS; a++) {
        const th = (a / STEPS) * Math.PI * 2;
        open.push([]);
        for (let i = 0; i < RADII; i++) {
          const r = R0 + i * DR;
          open[a][i] = clearAt(cx + Math.cos(th) * r, cy + Math.sin(th) * r);
        }
      }
      // flood the open polar cells, wrapping in angle, and see how far round it gets
      let lap = 0;
      const start = open[0].findIndex(Boolean);
      if (start >= 0) {
        const hit = new Set([0 + ',' + start]);
        const stack = [[0, start]];
        const reached = new Set([0]);
        while (stack.length) {
          const [a, i] = stack.pop();
          for (const [da, di] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const na = (a + da + STEPS) % STEPS, ni = i + di;
            if (ni < 0 || ni >= RADII || !open[na][ni] || hit.has(na + ',' + ni)) continue;
            hit.add(na + ',' + ni); reached.add(na); stack.push([na, ni]);
          }
        }
        lap = reached.size;
        // how wide the lane actually is at its meanest point, not merely
        // whether a disc fits: a lane the exact width of the car cannot be
        // steered round a bend, only threaded
        for (let a = 0; a < STEPS; a++) {
          let n = 0;
          for (let i = 0; i < RADII; i++) if (hit.has(a + ',' + i)) n++;
          narrowest = Math.min(narrowest, n * DR);
        }
      }
      if (lap < STEPS) {
        problems.push(map + ': the roundabout at ' + rx + ',' + ry + ' cannot be driven round — '
          + 'a car-width lane exists for only ' + Math.round((lap / STEPS) * 360) + ' of 360 degrees');
      } else if (narrowest < MIN_LANE) {
        problems.push(map + ': the roundabout at ' + rx + ',' + ry + ' laps, but pinches to '
          + narrowest.toFixed(2) + ' tiles — a car is ' + (CAR_R * 2).toFixed(2) + ' wide, so there is no room to steer');
      } else {
        notes.push(map + ': roundabout ' + rx + ',' + ry + ' laps clean, narrowest ' + narrowest.toFixed(2));
      }
    }

    // Signals. Two properties matter and neither is visible in a screenshot:
    // opposing roads must never both be green (that is a crash, not a junction),
    // and every approach must get a turn — a group that never comes up leaves a
    // queue sitting at a permanent red for the whole shift.
    const js = D.junctions();
    if (!js.length) problems.push(map + ': no signalised junctions were built from ' + D.lights.length + ' lights');
    for (const j of js) {
      const armsPerGroup = new Array(j.groups).fill(0);
      for (const a of j.arms) armsPerGroup[a.group]++;
      if (armsPerGroup.some((n) => !n)) problems.push(map + ': a junction has an empty signal group');
      const slot = D.SIG.green + D.SIG.amber + D.SIG.allRed;
      let everGreen = new Set(), clash = 0, samples = 0;
      for (let ms = 0; ms < j.groups * slot * 1000; ms += 200) {
        // replicate the cycle exactly as the game computes it
        const cyc = ((ms / 1000) + j.offset) % (j.groups * slot);
        const active = Math.floor(cyc / slot);
        const w = cyc % slot;
        const phase = w < D.SIG.green ? 'green' : w < D.SIG.green + D.SIG.amber ? 'amber' : 'red';
        const greens = j.arms.filter((a) => a.group === active && phase === 'green');
        for (const a of greens) everGreen.add(j.arms.indexOf(a));
        samples++;
        // any two greens whose approaches are not opposed are a conflict
        for (let p = 0; p < greens.length; p++) for (let q = p + 1; q < greens.length; q++) {
          const dot = greens[p].ux * greens[q].ux + greens[p].uy * greens[q].uy;
          if (dot > -0.75) clash++;
        }
      }
      if (clash) problems.push(map + ': ' + clash + ' sampled moments give green to crossing approaches');
      if (everGreen.size !== j.arms.length) {
        problems.push(map + ': ' + (j.arms.length - everGreen.size) + ' of ' + j.arms.length
          + ' approaches never go green in a full cycle');
      }
    }
    if (js.length) notes.push(map + ': ' + js.length + ' signals, '
      + js.map((j) => j.arms.length + ' arms/' + j.groups + ' phases').join(' + '));

    if (map === 'village') {
      if (!D.waterTiles.size) problems.push('village: the ponds did not rasterise');
      if (!D.parkTiles.size) problems.push('village: the green did not rasterise');
      if (!D.geo) problems.push('village: no curve geometry');
      else {
        const thin = D.geo.curves.filter((c) => c.w < 1.6);
        if (thin.length) problems.push('village: ' + thin.length + ' lanes are too narrow to rasterise cleanly (' + thin.map((c) => c.name).join(', ') + ')');
      }
    }

    // Traffic is the other half of "drivable". The lane-offset maths was
    // written for square junctions, so a curved network is exactly where cars
    // would wedge — and a wedged car looks identical to a car at a red light.
    const was = D.traffic.map((t) => ({ x: t.x, y: t.y }));
    await new Promise((r) => setTimeout(r, 1800));
    const moved = D.traffic.filter((t, i) => Math.hypot(t.x - was[i].x, t.y - was[i].y) > 0.25).length;
    if (D.traffic.length && moved < D.traffic.length * 0.6) {
      problems.push(map + ': only ' + moved + ' of ' + D.traffic.length + ' cars moved in 1.8s — traffic is wedged');
    }

    // Which side of the road the traffic is on. England drives on the left, so
    // for a car heading (ux,uy) on a screen whose y runs downward, its offset
    // from the centre of its road must lie along (uy,-ux). Measured rather than
    // asserted from the map's own trafficSide flag, because the flag was
    // already set to 'left' while the cars were visibly on the wrong side.
    if (D.geo) {
      let correct = 0, judged = 0;
      for (const t of D.traffic) {
        const s = D.nearestLane(t.x, t.y);
        if (!s) continue;
        const ux = Math.sin(t.heading), uy = -Math.cos(t.heading);
        const offx = t.x - s.x, offy = t.y - s.y;
        const side = offx * uy + offy * -ux;      // positive means to its left
        if (Math.abs(side) < 0.12) continue;      // dead centre: not evidence either way
        judged++;
        if (side > 0) correct++;
      }
      if (judged >= 4 && correct < judged * 0.75) {
        problems.push(map + ': traffic is driving on the right — only ' + correct + ' of ' + judged + ' cars are on the left');
      } else {
        notes.push(map + ': ' + correct + '/' + judged + ' cars keeping left');
      }
    }

    // And the player's own car, which is placed by hand rather than by the lane
    // maths: it sets off facing north, so keeping left means the west half of
    // the road and keeping right the east. The middle of the road is the curve
    // itself where there is one — the tile run is too coarse there, and read
    // a car sitting on the centre line as keeping left — and otherwise the run
    // of road tiles across the start.
    {
      const sy = Math.floor(D.START.y);
      let lo = Math.floor(D.START.x), hi = lo;
      while (road.has(key(lo - 1, sy))) lo--;
      while (road.has(key(hi + 1, sy))) hi++;
      const s = D.geo && D.nearestLane(D.START.x, D.START.y);
      const mid = s ? s.x : (lo + hi + 1) / 2;
      const want = map === 'village' ? 'left' : 'right';
      const off = D.START.x - mid;
      const got = off < -0.15 ? 'left' : off > 0.15 ? 'right' : 'the middle';
      if (D.car.h !== 0) problems.push(map + ': the car no longer starts facing north (h=' + D.car.h + '), so this side check is stale');
      else if (got !== want) problems.push(map + ': the car starts ' + (got === 'the middle' ? 'in the middle' : 'on the ' + got) + ' of the road, should keep ' + want
        + ' (x=' + D.START.x.toFixed(2) + ', road ' + lo + '..' + hi + ')');
      else notes.push(map + ': starts keeping ' + got + ' (' + off.toFixed(2) + ' off centre)');
    }

    notes.push(`${map}: ${road.size} road (${stranded} stranded), ${D.houses.length} addresses, `
      + `${D.waterTiles.size} water, ${D.parkTiles.size} green, ${D.lots.size} lots, `
      + `${moved}/${D.traffic.length} cars rolling`);
  }

  for (const f of frames) f.remove();
  if (before === null) localStorage.removeItem(MAP_KEY); else localStorage.setItem(MAP_KEY, before);

  return JSON.stringify({
    pass: !problems.length,
    detail: problems.length ? problems.join('; ') : notes.join(' | '),
  });
})();
