/* A cafe laid out in the painted room still gets served.

   The room is Amber's plate: customers come in at the painted door and queue
   down the left of a counter that runs from the back wall to the front. The
   queue positions, the counter and the art are all new with that room, and
   each can go wrong without anything visibly breaking -- a queue spot inside
   the counter, a picture that 404s and just never draws.

   So: machines placed along the back wall, Sam hired on skates, a patient
   queue, the player standing still, sixty seconds at a fixed step. Sam alone
   has to get orders served, every customer who reaches the queue has to stand
   on the customers' side of the counter, and every picture has to load. (Sam
   walks in straight lines through anything, so this does not test pathing.) */
return (async () => {
  const C = window.__coffeeRush;
  if (!C || !C.step) return JSON.stringify({ pass: false, detail: 'window.__coffeeRush.step is not exposed' });
  const problems = [];

  // an easy day with a patient queue, so the only way to fail is delivery
  C.setDay(8);
  C.grant(4000);
  for (const id of ['helper', 'helper', 'seating', 'seating', 'seating', 'seating']) C.buy(id);
  C.openLayout();
  const spots = {
    'espresso-1': [7, 4], 'cookie-1': [9, 4], 'brownie-1': [11, 4], 'muffin-1': [13, 4], 'milk-1': [15, 4],
    'ice-1': [16, 4], bin: [20, 10],
  };
  for (const m of C.unplaced()) {
    const s = spots[m.id];
    if (!s) problems.push(`no spot for ${m.id}`);
    else if (!C.place(m.id, s[0], s[1])) problems.push(`could not place ${m.id} at ${s}`);
  }
  C.closeLayout();
  document.getElementById('btn-start').click();
  const S = C.state();
  if (!S.running) return JSON.stringify({ pass: false, detail: 'the shift did not start. ' + problems.join('; ') });

  const counter = C.counter();
  const floorTop = 4 * 48;
  let widest = 0;
  let queued = 0;
  for (let t = 0; t < 60 && S.running; t++) {
    C.step(1);
    C.state().customers.forEach((c) => {
      if (c.leaving) return;
      const i = S.customers.filter((x) => !x.leaving).indexOf(c);
      const spot = C.queueSpot(i);
      if (Math.hypot(spot.x - c.x, spot.y - c.y) > 2) return; // still walking in
      queued++;
      widest = Math.max(widest, c.x);
      // a customer is ~70px wide at most; they must stand clear of the counter's side
      if (c.x + 35 > counter.x - 25) problems.push(`customer at x=${Math.round(c.x)} stands in the counter`);
      if (c.y < floorTop || c.y > 576) problems.push(`customer at y=${Math.round(c.y)} is off the floor`);
    });
  }

  const missing = C.images().filter(([, ok]) => !ok).map(([k]) => k);
  if (missing.length) problems.push('did not load: ' + missing.join(', '));
  if (S.served < 3) problems.push(`Sam served only ${S.served}`);

  return JSON.stringify({
    pass: problems.length === 0,
    detail: `served ${S.served}, walkouts ${S.strikes}, ${queued} queue samples, furthest right ${Math.round(widest)} ` +
      `(counter side at ${counter.x - 25}), ${C.images().length} pictures` + (problems.length ? ' -- ' + [...new Set(problems)].slice(0, 6).join('; ') : ''),
  });
})();
