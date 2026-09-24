/* Traffic has to drive along the road, not weave across it.

   Traffic picks its way tile by tile, and each tile's target is snapped to the
   near-side lane. On the village the roads are curves rasterised two or three
   tiles wide, so a step to a tile beside the one ahead, or a lane point taken
   from a curve sample behind the car, sends it sideways or backwards for a
   moment. Each glitch lasts a fraction of a second and nothing logs it — the cars
   just wobble.

   Worse, every step used to be driven as a curve whose handles ran along the
   tile step, so down a road at an angle the car pointed east, south, east,
   south; and on the grid the middle of the road was guessed from neighbouring
   tarmac, which inside a junction is all tarmac, so turning cars slid across the
   box at 45 degrees. Before the fix: 2-4% of frames jerked, cars reversed 8-12
   times in six seconds, and the village was off-lane on 3.7% of frames.

   So watch every car for ten seconds per map and measure how far it strays from
   its near-side lane, how hard its heading jerks from one frame to the next, and
   whether it ever flips round — leaving out roundabouts, junctions and the car
   park, where turning is the job. The page's own loop drives; we just read. */
return (async () => {
  const MAP_KEY = 'dash-map-v1';
  const before = localStorage.getItem(MAP_KEY);
  const frames = [];
  const load = (map) => new Promise((resolve, reject) => {
    localStorage.setItem(MAP_KEY, map);
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;left:-9999px;width:900px;height:600px';
    f.src = '/wizz-delivery/index.html?case=swerve-' + map;
    f.onload = () => setTimeout(() => resolve(f.contentWindow), 500);
    f.onerror = () => reject(new Error('iframe failed for ' + map));
    frames.push(f);
    document.body.appendChild(f);
  });
  const raf = (w) => new Promise((r) => w.requestAnimationFrame(r));

  const problems = [], notes = [];
  for (const map of ['grid', 'village']) {
    const w = await load(map);
    const D = w.__wizz;
    const KEEP = map === 'village' ? 1 : -1;
    const prev = new Map();
    // Turning is allowed where roads meet, unlit or not, and a car park has no
    // lanes to keep to. On the grid, a junction is where both axes are road.
    const nearJunction = (x, y) => {
      if (!D.geo) {
        const fx = Math.floor(x), fy = Math.floor(y);
        const road = (a, b) => D.roadTiles.has(a + ',' + b);
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          const a = fx + dx, b = fy + dy;
          if (road(a, b) && road(a - 1, b) && road(a + 1, b) && road(a, b - 1) && road(a, b + 1)) return true;
        }
        return false;
      }
      if (D.geo.carparks.some(([px, py, pw, ph]) => x > px - 1 && y > py - 1 && x < px + pw + 1 && y < py + ph + 1)) return true;
      let near = 0;
      for (const r of D.geo.curves) {
        if (r.line.some(([lx, ly]) => (lx - x) ** 2 + (ly - y) ** 2 < (r.w / 2 + 1.6) ** 2)) near++;
      }
      return near > 1;
    };
    let samples = 0, jerks = 0, reversals = 0, stray = 0, worstStray = 0, worstJerk = 0;
    for (let i = 0; i < 600; i++) {
      await raf(w);
      for (const t of D.traffic) {
        const p = prev.get(t.id);
        prev.set(t.id, { x: t.x, y: t.y, h: t.heading });
        if (!p) continue;
        const mv = Math.hypot(t.x - p.x, t.y - p.y);
        if (mv > 0.5) continue;                 // respawned
        if (mv < 1e-4) continue;                // waiting
        if (t.x < 0 || t.y < 0 || t.x > 50 || t.y > 34) continue;   // driving off the map
        const onRing = D.roundabouts.some(([cx, cy]) => Math.hypot(t.x - cx - 0.5, t.y - cy - 0.5) < 4);
        const nearLight = D.lights.some(([lx, ly]) => Math.hypot(t.x - lx - 0.5, t.y - ly - 0.5) < 3);
        if (onRing || nearLight || nearJunction(t.x, t.y)) continue;
        samples++;
        const dh = Math.abs(Math.atan2(Math.sin(t.heading - p.h), Math.cos(t.heading - p.h)));
        if (dh > Math.PI * 0.75) reversals++;
        else if (dh > 0.25) { jerks++; worstJerk = Math.max(worstJerk, dh); }
        if (D.geo) {
          const s = D.nearestLane(t.x, t.y);
          if (!s) continue;
          // side of the centre line: positive when on the near side for the way it faces
          const ux = Math.sin(t.heading), uy = -Math.cos(t.heading);
          const along = ux * s.tx + uy * s.ty;
          if (Math.abs(along) < 0.8) continue;     // mid-turn, crossing roads
          const k = along > 0 ? 1 : -1;
          const lx = s.ty * k * KEEP, ly = -s.tx * k * KEEP;
          const side = (t.x - s.x) * lx + (t.y - s.y) * ly;
          const want = Math.min(s.w * 0.25, 0.6);
          const off = Math.abs(side - want);
          worstStray = Math.max(worstStray, off);
          if (off > 0.3) stray++;
        }
      }
    }
    const jr = jerks / Math.max(1, samples), sr = stray / Math.max(1, samples);
    notes.push(`${map}: ${samples} samples, jerks ${(jr * 100).toFixed(2)}% (worst ${worstJerk.toFixed(2)} rad), `
      + `reversals ${reversals}, off-lane ${(sr * 100).toFixed(2)}% (worst ${worstStray.toFixed(2)})`);
    if (jr > 0.015) problems.push(`${map} heading jerks on ${(jr * 100).toFixed(1)}% of frames`);
    if (reversals) problems.push(`${map} cars reversed ${reversals} times`);
    if (sr > 0.03) problems.push(`${map} off its lane on ${(sr * 100).toFixed(1)}% of frames`);
  }
  for (const f of frames) f.remove();
  if (before === null) localStorage.removeItem(MAP_KEY); else localStorage.setItem(MAP_KEY, before);
  return JSON.stringify({ pass: !problems.length, detail: (problems.length ? problems.join('; ') + ' — ' : '') + notes.join(' | ') });
})();
