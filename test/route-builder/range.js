/* A bigger platform reaches further. A house just past a small station's
   ring walks in; once the station is built out it should be fed instead —
   counted for demand, and no longer sent on foot. And hovering a station with
   no tool in hand paints its catchment, at the ring for its level, without
   having to click it first. */
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
  S.trees = []; S.growTimer = 1e9; S.neighborhoods = [];
  S.inv.stations = 10;
  RB.setSpeed(0);
  const a = RB.spawnStation('house'); a.x = 800; a.y = 500;
  a.pegTimer = 1e9; a.walkTimer = 1e9;
  RB.addHouse(800 + 195, 500); // past level 0's reach, inside level 1's
  RB.addHouse(800, 500 + 240); // inside level 2's only

  const r0 = RB.stationRange(a.id);
  check('a new station feeds neither', RB.stationHouses(a.id) === 0 && RB.walkersFor(a.id) === 2,
    `range ${r0}, fed ${RB.stationHouses(a.id)}, walk ${RB.walkersFor(a.id)}`);
  RB.upgradeStation(a.id);
  const r1 = RB.stationRange(a.id);
  check('one upgrade reaches the nearer', r1 > r0 && RB.stationHouses(a.id) === 1 && RB.walkersFor(a.id) === 1,
    `range ${r1}, fed ${RB.stationHouses(a.id)}, walk ${RB.walkersFor(a.id)}`);
  RB.upgradeStation(a.id);
  const r2 = RB.stationRange(a.id);
  check('the second reaches both', r2 > r1 && RB.stationHouses(a.id) === 2 && RB.walkersFor(a.id) === 0,
    `range ${r2}, fed ${RB.stationHouses(a.id)}, walk ${RB.walkersFor(a.id)}`);

  // Hover with no tool: the dashed ring is painted at the level-2 reach.
  RB.setTool(null);
  const cam = RB.camera;
  cam.manual = true; cam.cx = 800; cam.cy = 500; cam.scale = 1;
  await frame();
  const rect = canvas.getBoundingClientRect();
  const g = canvas.getContext('2d');
  const dpr = canvas.width / rect.width;
  const fire = (x, y) => { const p = RB.worldToScreen(x, y); canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: rect.left + p.x, clientY: rect.top + p.y, pointerId: 1, pointerType: 'mouse', bubbles: true })); };
  // brightness summed round the ring, so a dash gap can't hide it
  const ringLight = (R) => {
    let sum = 0;
    for (let i = 0; i < 48; i++) {
      const q = RB.worldToScreen(800 + Math.cos(i / 48 * 6.283) * R, 500 + Math.sin(i / 48 * 6.283) * R);
      const d = g.getImageData(Math.round(q.x * dpr), Math.round(q.y * dpr), 1, 1).data;
      sum += d[0] + d[1] + d[2];
    }
    return sum / 48;
  };
  fire(1400, 900); await frame();
  const bare = ringLight(r2);
  fire(800, 500); await frame();
  const lit = ringLight(r2);
  check('hovering a station paints its catchment', lit > bare + 15, `ring ${bare.toFixed(0)} → ${lit.toFixed(0)}`);
  check('hovering does not select it', RB.selected === null);

  return JSON.stringify({ pass: checks.every(Boolean), detail: notes.join('; ') });
})();
