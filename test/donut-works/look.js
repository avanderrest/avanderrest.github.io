/* The top-down factory still means what it shows.

   Since 2026-10-08 the factory is seen from straight above and painted in code, with
   only Amber's donut and topping pictures loaded. None of that is checked by the sim
   cases, and all of it can go wrong while the game keeps working underneath:

   1. Every picture loads. A missing donut falls back to a plain disc, which still
      plays, so nobody would notice the art had gone.
   2. Every tile picks back to itself. Placement turns a pointer into a tile through
      the camera fit; get it wrong by half a tile and things land next to where you
      clicked, which reads as fumbling.
   3. The canvas shows what the grid says: bare floor is terracotta, a belt tile is a
      wooden belt, a fryer has its oil, and the floor's grout falls on the grid's tile
      edges, so the squares you see are the squares you build on. */
return (async () => {
  const D = window.__donut;
  const problems = [];
  const notes = [];
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  // 1. pictures
  const t0 = performance.now();
  while (Object.values(D.sprites).some((im) => !im.complete) && performance.now() - t0 < 8000) await new Promise((r) => setTimeout(r, 50));
  const bad = Object.entries(D.sprites).filter(([, im]) => !(im.naturalWidth > 0)).map(([k]) => k);
  if (bad.length) problems.push(`pictures missing: ${bad.join(', ')}`);
  notes.push(`${Object.keys(D.sprites).length} pictures`);

  // a small line to look at
  document.getElementById('overlay').hidden = true;
  D.setSpeed(0);
  D.fresh();
  D.grant(100000);
  D.place(1, 3, 'mixer', 0); D.belt(2, 3, 0); D.place(3, 3, 'press', 0); D.belt(4, 3, 0);
  D.place(5, 3, 'fryer', 0); D.belt(6, 3, 0); D.belt(7, 3, 0); D.place(8, 3, 'counter', 0);
  await frame();

  // 2. picking, at the middle and near the corners of every tile
  let wrong = 0, worst = '';
  const step = D.tileToClient(1, 0).x - D.tileToClient(0, 0).x;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 12; c++) {
    const p = D.tileToClient(c, r);
    for (const [dx, dy] of [[0, 0], [-0.4, -0.4], [0.4, 0.4], [0.4, -0.4], [-0.4, 0.4]]) {
      const hit = D.pickAt(p.x + dx * step, p.y + dy * step).floor;
      if (!hit || hit.c !== c || hit.r !== r) { wrong++; worst = `(${c},${r})+(${dx},${dy}) picked ${hit ? `(${hit.c},${hit.r})` : 'nothing'}`; }
    }
  }
  if (wrong) problems.push(`${wrong}/480 points do not pick their own tile, e.g. ${worst}`);

  // 3. the canvas shows floor, belt and fryer where the grid says
  const canvas = document.getElementById('floor');
  const cv = canvas.getBoundingClientRect();
  const g = canvas.getContext('2d');
  const dpr = canvas.width / cv.width;
  const px = (x, y) => { const d = g.getImageData(Math.round((x - cv.left) * dpr), Math.round((y - cv.top) * dpr), 1, 1).data; return [d[0], d[1], d[2]]; };
  const at = (c, r, fx, fy) => { const p = D.tileToClient(c, r); return px(p.x + fx * step, p.y + fy * step); };
  const terracotta = ([r, gg, b]) => r > 150 && r - gg > 40 && gg - b > 0;
  const wood = ([r, gg, b]) => r > 180 && gg > 140 && r - b > 50 && gg - b > 25;
  const oil = ([r, gg, b]) => r > 180 && gg > 100 && b < 110 && r - b > 100;
  const floorPx = at(10, 6, 0.2, 0.2), beltPx = at(6, 3, 0.07, 0.12), oilPx = at(5, 3, 0.15, -0.12);
  if (!terracotta(floorPx)) problems.push(`empty tile (10,6) is rgb(${floorPx}) — not floor`);
  if (!wood(beltPx)) problems.push(`belt tile (6,3) is rgb(${beltPx}) — not a belt`);
  if (!oil(oilPx)) problems.push(`fryer (5,3) shows rgb(${oilPx}) — not hot oil`);
  notes.push(`floor rgb(${floorPx}), belt rgb(${beltPx}), oil rgb(${oilPx})`);
  // the grout lines are darker than the tiles either side, right on the tile edges
  const lum = ([r, gg, b]) => (r + gg + b) / 3;
  let darker = 0, tried = 0;
  for (const [c, r] of [[10, 1], [11, 2], [9, 6], [10, 5], [3, 6], [5, 6], [2, 0], [11, 6]]) {
    tried++;
    // the darkest pixel within a couple of px of the edge, against the tile either side
    const p = D.tileToClient(c, r), ex = p.x + step / 2, ey = p.y + step / 4;
    let edge = 255;
    for (let d = -2; d <= 2; d++) edge = Math.min(edge, lum(px(ex + d, ey)));
    const inA = at(c, r, 0.38, 0.25), inB = at(c, r, 0.62, 0.25);
    if (edge < Math.min(lum(inA), lum(inB)) - 8) darker++;
  }
  if (darker < tried - 1) problems.push(`the floor's grout is not on the grid: only ${darker}/${tried} tile edges are darker than their tiles`);
  notes.push(`grout on the grid at ${darker}/${tried} edges`);

  return JSON.stringify({ pass: !problems.length, detail: problems.length ? problems.join(' | ') : `every tile picks back; ${notes.join('; ')}` });
})();
