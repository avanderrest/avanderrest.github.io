/* Traffic going straight over a crossroads has to drive straight.

   Each lane point is snapped to a road's centreline. In the middle of a
   crossroads the crossing road's centreline is just as near as the car's own,
   and snapping to it sent cars heading east out along the north-south road and
   back again — two tiles off line, on every signalised junction. Nothing breaks
   and no car gets stuck, so only watching the paths shows it.

   Watch the three signalised crossroads for twenty seconds, keep every pass
   that comes out on the far side in line with where it went in, and measure how
   far it strayed sideways on the way. While watching, also make sure no car
   ever turns into an estate road: those are for the houses and the player. */
return (async () => {
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;left:0;top:0;width:900px;height:600px';
  f.src = '/wizz-delivery/index.html?case=junctions';
  document.body.appendChild(f);
  await new Promise((r) => { f.onload = () => setTimeout(r, 500); });
  const D = f.contentWindow.__wizz;
  if (!D) return JSON.stringify({ pass: false, detail: 'no debug handle' });

  const boxes = D.lights.map(([x, y]) => [x + 0.5, y + 0.5]);
  const R = 2.2;
  const passes = new Map();   // car id -> { j, path }
  const done = [];
  const estate = new Set();   // cars seen on an estate road, which they must never use
  const end = performance.now() + 20000;
  while (performance.now() < end) {
    await new Promise((r) => setTimeout(r, 40));
    for (const t of D.traffic) {
      if (D.minorTiles.has(Math.floor(t.x) + ',' + Math.floor(t.y))) estate.add(t.id);
      const j = boxes.findIndex(([jx, jy]) => Math.abs(t.x - jx) < R && Math.abs(t.y - jy) < R);
      const p = passes.get(t.id);
      if (j >= 0) {
        if (!p || p.j !== j) passes.set(t.id, { j, path: [[t.x, t.y]] });
        else p.path.push([t.x, t.y]);
      } else if (p) {
        passes.delete(t.id);
        if (p.path.length > 4) done.push(p);
      }
    }
  }
  f.remove();

  let straight = 0, worst = 0, bad = 0;
  const eg = [];
  for (const p of done) {
    const a = p.path[0], b = p.path[p.path.length - 1];
    const horiz = Math.abs(b[0] - a[0]) > 2.5 && Math.abs(b[1] - a[1]) < 0.6;
    const vert = Math.abs(b[1] - a[1]) > 2.5 && Math.abs(b[0] - a[0]) < 0.6;
    if (!horiz && !vert) continue;
    straight++;
    const lane = horiz ? (a[1] + b[1]) / 2 : (a[0] + b[0]) / 2;
    const dev = Math.max(...p.path.map(([x, y]) => Math.abs((horiz ? y : x) - lane)));
    worst = Math.max(worst, dev);
    if (dev > 0.25) {
      bad++;
      const [jx, jy] = boxes[p.j];
      if (eg.length < 3) eg.push(`${horiz ? 'E-W' : 'N-S'} at ${jx},${jy} strayed ${dev.toFixed(2)}`);
    }
  }
  const problems = [];
  if (straight < 3) problems.push(`only ${straight} straight passes in 20s — too few to judge`);
  if (estate.size) problems.push(`${estate.size} traffic cars drove onto an estate road`);
  if (bad) problems.push(`${bad} of ${straight} wandered: ${eg.join('; ')}`);
  return JSON.stringify({
    pass: !problems.length,
    detail: (problems.length ? problems.join(' | ') + ' | ' : '')
      + `${straight} straight passes over ${boxes.length} crossroads, worst ${worst.toFixed(2)} off line`,
  });
})();
