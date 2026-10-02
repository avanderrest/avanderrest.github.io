/* The isometric factory still means what it shows.

   Since 2026-10-02 the floor is Amber's room plate seen isometrically and every
   machine is one of her sprites. None of that is checked by the sim cases, and all of it can go wrong
   while the game keeps working underneath:

   1. Every sprite loads. A missing machine picture falls back to a flat box,
      which still plays, so nobody would notice the art had gone.
   2. Every tile picks back to itself. Placement turns a pointer into a tile
      through the iso transform and the camera fit; get either wrong by half a
      tile and things land next to where you clicked, which reads as fumbling.
   3. A tall machine can be clicked anywhere on its picture, even where the
      picture stands over the tile behind it.
   4. The canvas shows what the grid says: bare floor is terracotta, a belt
      tile is a wooden belt. This catches the room's floor and the grid's
      origin drifting apart (the plate's floor was re-laid on OX/OY, and the
      two have to agree). */
return (async () => {
  const D = window.__donut;
  const problems = [];
  const notes = [];
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  // 1. sprites
  const t0 = performance.now();
  while (Object.values(D.sprites).some((im) => !im.complete) && performance.now() - t0 < 8000) await new Promise((r) => setTimeout(r, 50));
  const bad = Object.entries(D.sprites).filter(([, im]) => !(im.naturalWidth > 0)).map(([k]) => k);
  if (bad.length) problems.push(`sprites missing: ${bad.join(', ')}`);
  notes.push(`${Object.keys(D.sprites).length} sprites`);

  // a small line to look at
  D.setSpeed(0);
  D.fresh();
  D.grant(100000);
  D.place(1, 3, 'mixer', 0); D.belt(2, 3, 0); D.place(3, 3, 'press', 0); D.belt(4, 3, 0);
  D.place(5, 3, 'fryer', 0); D.belt(6, 3, 0); D.belt(7, 3, 0); D.place(8, 3, 'counter', 0);
  await frame();

  // 2. picking
  let wrong = 0, worst = '';
  for (let r = 0; r < 8; r++) for (let c = 0; c < 12; c++) {
    const p = D.tileToClient(c, r);
    const f = D.pickAt(p.x, p.y).floor;
    if (!f || f.c !== c || f.r !== r) { wrong++; worst = `(${c},${r}) picked ${f ? `(${f.c},${f.r})` : 'nothing'}`; }
  }
  if (wrong) problems.push(`${wrong}/96 tiles do not pick back to themselves, e.g. ${worst}`);

  // 3. clicking high on the fryer's picture
  const box = D.machineBox(5, 3);
  const cv = document.getElementById('floor').getBoundingClientRect();
  const hi = D.sceneToClient(box.p.x, box.y0 + box.h * 0.25);
  const hit = D.pickAt(hi.x, hi.y);
  if (!hit.thing || hit.thing.c !== 5 || hit.thing.r !== 3) problems.push(`clicking the top of the fryer picked ${JSON.stringify(hit.thing)} (floor there is ${JSON.stringify(hit.floor)})`);
  else if (hit.floor && hit.floor.c === 5 && hit.floor.r === 3) notes.push('fryer top is over its own tile (weak check)');

  // 4. the canvas shows floor and belt where the grid says
  const canvas = document.getElementById('floor');
  const g = canvas.getContext('2d');
  const dpr = canvas.width / cv.width;
  const px = (x, y) => { const d = g.getImageData(Math.round((x - cv.left) * dpr), Math.round((y - cv.top) * dpr), 1, 1).data; return [d[0], d[1], d[2]]; };
  const lift = (D.tileToClient(1, 0).x - D.tileToClient(0, 0).x) / 37.5 * 7;   // the belt top stands BELT_H off the floor
  const floorPx = px(D.tileToClient(10, 6).x, D.tileToClient(10, 6).y);
  const beltPt = D.tileToClient(6, 3);   // (7,3) is behind the counter's picture
  const beltPx = px(beltPt.x, beltPt.y - lift);
  const terracotta = ([r, gg, b]) => r > 150 && r - gg > 40 && gg - b > 0;
  const wood = ([r, gg, b]) => r > 180 && gg > 140 && r - b > 50 && gg - b > 25;
  if (!terracotta(floorPx)) problems.push(`empty tile (10,6) is rgb(${floorPx}) — not floor`);
  if (!wood(beltPx)) problems.push(`belt tile (6,3) is rgb(${beltPx}) — not a belt`);
  notes.push(`floor rgb(${floorPx}), belt rgb(${beltPx})`);
  // and the room's own grout crosses where the grid's tile corners are: the
  // corner between (c, r) and (c-1, r+1) is halfway between their centres
  const lum = ([r, gg, b]) => (r + gg + b) / 3;
  let darker = 0, tried = 0;
  for (const [c, r] of [[10, 1], [11, 2], [9, 6], [10, 5], [3, 6], [5, 6], [2, 7], [11, 6]]) {
    if (D.grid[r][c] || D.grid[r + 1] && D.grid[r + 1][c - 1]) continue;
    const a = D.tileToClient(c, r), b = D.tileToClient(c - 1, r + 1);
    const mid = px(a.x, a.y), corner = px((a.x + b.x) / 2, (a.y + b.y) / 2);
    tried++;
    if (lum(corner) < lum(mid) - 8) darker++;
  }
  if (darker < tried - 1) problems.push(`the room's grout is not on the grid: only ${darker}/${tried} tile corners are darker than their tile`);
  notes.push(`grout on the grid at ${darker}/${tried} corners`);

  return JSON.stringify({ pass: !problems.length, detail: problems.length ? problems.join(' | ') : `all 96 tiles pick back; fryer clickable on its picture; ${notes.join('; ')}` });
})();
