/* The guide line goes round a roundabout the way the traffic does.

   The route search runs over (tile, heading) and used to treat a roundabout's
   tiles like any other tarmac, so the yellow line would happily take the short
   way round against the flow. On the village map, route from every road tile
   near the roundabout to a spread of far addresses, in every starting heading,
   and check each step taken on the ring goes with the flow (clockwise, keeping
   left) or out of it. */
return (async () => {
  const MAP_KEY = 'dash-map-v1';
  const before = localStorage.getItem(MAP_KEY);
  localStorage.setItem(MAP_KEY, 'village');
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;left:-9999px;width:900px;height:600px';
  frame.src = '/wizz-delivery/index.html?case=route';
  const w = await new Promise((resolve, reject) => {
    frame.onload = () => setTimeout(() => resolve(frame.contentWindow), 600);
    frame.onerror = () => reject(new Error('iframe failed'));
    document.body.appendChild(frame);
  });
  const finish = () => {
    frame.remove();
    if (before === null) localStorage.removeItem(MAP_KEY); else localStorage.setItem(MAP_KEY, before);
  };
  const D = w.__wizz;
  const problems = [];
  const [[rx, ry]] = D.roundabouts;
  const mx = rx + 0.5, my = ry + 0.5;
  const KEEP = 1; // the village keeps left: clockwise on screen
  const starts = [...D.roadTiles].map((k) => k.split(',').map(Number))
    .filter(([x, y]) => { const r = Math.hypot(x + 0.5 - mx, y + 0.5 - my); return r > 2.2 && r < 5; });
  const targets = D.houses.filter((_, i) => i % 9 === 0);
  let routes = 0, ringSteps = 0, against = 0;
  for (const [sx, sy] of starts) {
    for (let d = 0; d < 4; d++) {
      for (const h of targets) {
        const path = D.searchRoute(sx, sy, d, h.x, h.y);
        if (!path) continue;
        routes++;
        for (let i = 1; i < path.length; i++) {
          const a = path[i - 1], b = path[i];
          const ax = a.x + 0.5 - mx, ay = a.y + 0.5 - my, r = Math.hypot(ax, ay);
          if (r > 2.05 || r < 0.01) continue;
          const ux = ax / r, uy = ay / r, tx = -uy * KEEP, ty = ux * KEEP;
          const dx = b.x - a.x, dy = b.y - a.y;
          ringSteps++;
          if (dx * tx + dy * ty < -0.1 && dx * ux + dy * uy <= 0.5) {
            against++;
            if (problems.length < 4) problems.push(`from ${sx},${sy} the route steps ${a.x},${a.y} -> ${b.x},${b.y} against the flow`);
          }
        }
      }
    }
  }
  if (!ringSteps) problems.push('no route ever used the roundabout, so nothing was checked');
  finish();
  return JSON.stringify({
    pass: !problems.length,
    detail: (problems.length ? problems.join('; ') + ' | ' : '') + `${routes} routes from ${starts.length} tiles round the roundabout, ${ringSteps} steps on the ring, ${against} against the flow`,
  });
})();
