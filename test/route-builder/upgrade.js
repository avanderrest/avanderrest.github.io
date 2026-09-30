/* The Station tool does two jobs: on grass it places a station, on a placed
   station it builds the platform out. Both ride the same click, so either can
   swallow the other without anything looking wrong — a click on a station
   that quietly places nothing, or a second station dropped half on top of
   the first. This clicks through both through the real pointer handler, counts
   the toy box at each step, and samples the canvas to check hovering really
   paints the bigger-platform preview. */
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
  S.inv.stations = 4;
  RB.setSpeed(0);
  const cam = RB.camera;
  cam.manual = true; cam.cx = 800; cam.cy = 500; cam.scale = 1;
  await frame();

  const rect = canvas.getBoundingClientRect();
  const at = (x, y) => { const p = RB.worldToScreen(x, y); return { clientX: rect.left + p.x, clientY: rect.top + p.y }; };
  const fire = (type, x, y) => canvas.dispatchEvent(new PointerEvent(type, { ...at(x, y), pointerId: 1, pointerType: 'mouse', bubbles: true }));
  const click = (x, y) => { fire('pointerdown', x, y); fire('pointerup', x, y); };

  RB.setTool('station');
  click(800, 500);
  const s = RB.stations[0];
  check('clicking grass places a station', RB.stations.length === 1 && S.inv.stations === 3);
  s.pegTimer = 1e9; s.walkTimer = 1e9;

  // A house right where the first platform ring will go.
  RB.addHouse(800 + 46, 500);
  // Just outside the station's own clearance, so it's only the upgrade that clears it.

  // Hover: the preview is painted round the station.
  const g = canvas.getContext('2d');
  const dpr = canvas.width / rect.width;
  const redAt = (x, y) => { const p = RB.worldToScreen(x, y); return g.getImageData(Math.round(p.x * dpr), Math.round(p.y * dpr), 1, 1).data[0]; };
  fire('pointermove', 1300, 900);
  await frame();
  const bare = redAt(800 - 37, 500);
  fire('pointermove', 800, 500);
  await frame();
  const hovered = redAt(800 - 37, 500);
  check('hovering a station paints the bigger platform', hovered > bare + 10, `red ${bare} → ${hovered}`);

  click(800, 500);
  check('clicking it upgrades, not places', RB.stations.length === 1 && s.level === 1 && S.inv.stations === 2, `level ${s.level}, box ${S.inv.stations}`);
  check('the new platform clears the house under it', !S.houses.some((h) => Math.hypot(h.x - 846, h.y - 500) < 5));

  click(800, 500);
  check('the second upgrade takes two', s.level === 2 && S.inv.stations === 0, `level ${s.level}, box ${S.inv.stations}`);

  S.inv.stations = 5;
  click(800, 500);
  check('there is no third', s.level === 2 && S.inv.stations === 5);

  // Not enough in the box: refused, and says so.
  click(1300, 500);
  const t = RB.stations[1];
  S.inv.stations = 0;
  click(1300, 500);
  const msg = document.getElementById('toast').textContent;
  check('with nothing in the box it is refused', t.level === 0 && /station/.test(msg), msg);

  // Taking an upgraded station away hands back everything in it: 1 + 1 + 2.
  S.inv.stations = 0;
  RB.removeStation(s.id);
  check('removing an upgraded station returns it and its platform', S.inv.stations === 4, `got ${S.inv.stations}`);

  return JSON.stringify({ pass: checks.every(Boolean), detail: notes.join('; ') });
})();
