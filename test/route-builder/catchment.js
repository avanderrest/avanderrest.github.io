/* With no tool in hand, clicking a station picks it out and shows its
   catchment: the ring of houses close enough to feed it, those houses lit in
   gold, and far houses that walk in ringed in orange. The same click is the
   Track tool's "join" and the Station tool's "upgrade", so it's easy for one
   to swallow the other, or for the highlight to be painted round the wrong
   houses without anything looking broken. This clicks through the real
   pointer handler and samples the canvas where the rings should be. */
return (async () => {
  const RB = window.routeBuilder;
  const canvas = document.getElementById('mat');
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const notes = [];
  const checks = [];
  const check = (name, ok, extra) => { checks.push(ok); notes.push(`${name}: ${ok ? 'ok' : 'FAILED'}${extra ? ` (${extra})` : ''}`); };

  RB.newGame('calm');
  const S = RB.state;
  S.river = [{ x: 0, y: 1180 }, { x: 1900, y: 1180 }];
  S.trees = []; S.growTimer = 1e9;
  RB.setSpeed(0);
  RB.setTool(null);
  const cam = RB.camera;
  cam.manual = true; cam.cx = 800; cam.cy = 500; cam.scale = 1;

  const s = RB.spawnStation('house'); s.x = 800; s.y = 500; s.pegTimer = 1e9; s.walkTimer = 1e9;
  RB.addHouse(900, 520);   // inside the ring: feeds it
  RB.addHouse(1150, 500);  // outside it, nearest to this station: walks in
  await frame();

  const rect = canvas.getBoundingClientRect();
  const g = canvas.getContext('2d');
  const dpr = canvas.width / rect.width;
  const at = (x, y) => { const p = RB.worldToScreen(x, y); return { clientX: rect.left + p.x, clientY: rect.top + p.y }; };
  const fire = (type, x, y) => canvas.dispatchEvent(new PointerEvent(type, { ...at(x, y), pointerId: 1, pointerType: 'mouse', bubbles: true }));
  const click = (x, y) => { fire('pointerdown', x, y); fire('pointerup', x, y); };
  const px = (x, y) => { const p = RB.worldToScreen(x, y); return g.getImageData(Math.round(p.x * dpr), Math.round(p.y * dpr), 1, 1).data; };
  const bright = (d) => d[0] + d[1] + d[2];

  const before = { ring: px(700, 380), near: px(900 - 17, 525), far: px(1150 - 17, 505) };
  click(800, 500);
  await frame();
  check('clicking a station with no tool picks it out', RB.selected === s.id);
  check('nothing was built or spent doing it', RB.stations.length === 1 && S.inv.stations === 3);
  const after = { ring: px(700, 380), near: px(900 - 17, 525), far: px(1150 - 17, 505) };
  check('the catchment ring is shaded in', bright(after.ring) > bright(before.ring) + 15, `${bright(before.ring)} → ${bright(after.ring)}`);
  check('the house close by is lit in gold', after.near[0] > before.near[0] + 40 && after.near[1] > before.near[1] + 25,
    `rgb ${[...before.near.slice(0, 3)]} → ${[...after.near.slice(0, 3)]}`);
  check('the house that walks in is ringed in orange', after.far[0] > before.far[0] + 40 && after.far[0] - after.far[2] > 60,
    `rgb ${[...before.far.slice(0, 3)]} → ${[...after.far.slice(0, 3)]}`);

  click(1300, 900);
  check('a click on the grass puts it away', RB.selected === null);

  click(800, 500);
  RB.setTool('station');
  check('picking up a tool puts it away too', RB.selected === null);
  RB.setTool(null);

  // The station list picks it out as well.
  RB.tick(20, 1 / 20); S.totalTime += 1; // let the list rebuild
  RB.setSpeed(1); await frame(); await frame(); RB.setSpeed(0);
  const li = document.querySelector(`#stationlist li[data-id="${s.id}"]`);
  if (li) li.click();
  check('clicking its name in the list picks it out', !!li && RB.selected === s.id);

  return JSON.stringify({ pass: checks.every(Boolean), detail: notes.join('; ') });
})();
