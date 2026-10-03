/* Unserved houses glow orange-to-red, and so does a station with no track —
   the game's only pointer to where the next station or line belongs. If the
   test for "served" drifts (counting a station with no track as serving, or
   missing a station just outside the cluster), the glow lies quietly. This
   walks one cluster through all three states, then samples the painted
   canvas to check the glow is really red-leaning over the unserved cluster
   and gone once it's connected. */
return (async () => {
  const RB = window.routeBuilder;
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const notes = [];
  const checks = [];
  const check = (name, ok, extra) => { checks.push(ok); notes.push(`${name}: ${ok ? 'ok' : 'FAILED'}${extra ? ` (${extra})` : ''}`); };

  RB.newGame('calm');
  const S = RB.state;
  S.river = [{ x: 0, y: 1150 }, { x: 1900, y: 1150 }];
  S.trees = [];
  S.growTimer = 1e9;
  S.inv = { stations: 5, track: 99, trains: 0, carriages: 0 };
  const n = { x: 700, y: 500, r: 240, count: 0 };
  S.neighborhoods = [n];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2, r = 40 + (i % 4) * 28;
    RB.addHouse(700 + Math.cos(a) * r, 500 + Math.sin(a) * r);
  }
  n.count = 24;

  // Where to sample: a ring between the houses, and the canvas behind it.
  const canvas = document.getElementById('mat');
  const g = canvas.getContext('2d');
  const cam = RB.camera;
  const dpr = canvas.width / canvas.getBoundingClientRect().width;
  const redness = () => {
    let r = 0, gg = 0, count = 0;
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2 + 0.13;
      const s = RB.worldToScreen(700 + Math.cos(a) * 160, 500 + Math.sin(a) * 160);
      const px = g.getImageData(Math.round(s.x * dpr), Math.round(s.y * dpr), 1, 1).data;
      r += px[0]; gg += px[1]; count++;
    }
    return (r - gg) / count; // felt is green-leaning (negative); the glow pushes it red
  };
  cam.manual = true; cam.cx = 700; cam.cy = 500; cam.scale = 1;

  check('no station: the cluster is flagged', RB.neighbourhoodService(n) === 'none');
  // The glow pulses (about 2.8s round), and at its faintest the felt shows
  // through green, so a single sample passed or failed on timing. Take its peak.
  let glowNone = -Infinity;
  for (let i = 0; i < 30; i++) { await new Promise((r) => setTimeout(r, 100)); glowNone = Math.max(glowNone, redness()); }

  RB.placeStation(760, 470);
  const st = RB.stations[0];
  check('a station with no track still leaves it flagged', RB.neighbourhoodService(n) === 'unconnected');

  RB.placeStation(1300, 470);
  RB.buildDraft([st.id, RB.stations[1].id]);
  check('once the station has track, the cluster is served', RB.neighbourhoodService(n) === 'served');
  await frame();
  const glowServed = redness();

  check('the unserved cluster is painted red-leaning', glowNone > 0, `red minus green ${glowNone.toFixed(1)}`);
  check('and the glow goes once it is served', glowServed < glowNone - 20, `${glowNone.toFixed(1)} → ${glowServed.toFixed(1)}`);

  return JSON.stringify({ pass: checks.every(Boolean), detail: notes.join('; ') });
})();
