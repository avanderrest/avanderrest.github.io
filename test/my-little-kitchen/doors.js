/* The bowl and the cold things are behind Amber's doors, and have to be
   reachable once the door is open -- and not before.

   The doors are pictures laid over the room. A door that doesn't take the
   tap, or an open one that still sits on top of what is behind it (a
   pointer-events slip, or a transition that never finishes), looks right in a
   screenshot and leaves every recipe unfinishable. So this plays the start of
   a cake with real taps at real screen points: the bowl can't be picked up
   through the shut cupboard, can once it is open, goes onto the worktop; the
   eggs can't be reached through the shut fridge, can once it is open, and go
   into the bowl. */
return (async () => {
  const K = window.__kitchen;
  if (!K) return JSON.stringify({ pass: false, detail: 'window.__kitchen is not exposed' });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const problems = [];
  const seen = [];

  const S = K.state;
  S.recipe = 'cake'; S.phase = 'bowl'; S.added = []; S.doors = {};
  K.renderKitchen();
  await sleep(700);

  const centre = (el) => { const b = el.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height * 0.6]; };
  const tapAt = (x, y) => {
    const el = document.elementFromPoint(x, y);
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y }));
    return el;
  };
  const itemAt = (x, y) => { const el = document.elementFromPoint(x, y); return el && el.closest('.k-item'); };
  const item = (id) => document.querySelector(`#svg .k-item[data-id="${id}"]`);

  // --- the bowl, behind the cupboard door ---
  const [bx, by] = centre(item('bowl').querySelector('rect'));
  if (itemAt(bx, by)) problems.push('the bowl can be reached through the shut cupboard');
  tapAt(bx, by);                                   // opens the door
  await sleep(500);
  if (!S.doors.cupboard) problems.push('tapping the cupboard did not open it');
  const got = itemAt(bx, by);
  if (!got || got.dataset.id !== 'bowl') problems.push('the bowl is still covered with the cupboard open');
  tapAt(bx, by);                                   // pick it up
  if (S.carrying !== 'bowl') problems.push(`picked up ${S.carrying}, not the bowl`);
  const counter = document.querySelector('#kcounter path');
  const cb = counter.getBoundingClientRect();
  tapAt(cb.left + cb.width * 0.62, cb.top + cb.height / 2);
  await sleep(200);
  seen.push(`bowl: ${S.phase === 'fill' ? 'on the worktop' : 'phase ' + S.phase}`);
  if (S.phase !== 'fill') problems.push('the bowl did not go onto the worktop');

  // --- the eggs, behind the fridge door ---
  const [ex, ey] = centre(item('eggs').querySelector('rect'));
  if (itemAt(ex, ey)) problems.push('the eggs can be reached through the shut fridge');
  tapAt(ex, ey);
  await sleep(500);
  if (!S.doors.fridge) problems.push('tapping the fridge did not open it');
  const eggs = itemAt(ex, ey);
  if (!eggs || eggs.dataset.id !== 'eggs') problems.push('the eggs are still covered with the fridge open');
  tapAt(ex, ey);
  if (S.carrying !== 'eggs') problems.push(`picked up ${S.carrying}, not the eggs`);
  const [wx, wy] = centre(document.getElementById('bowl') || document.getElementById('kbowl'));
  tapAt(wx, wy);
  await sleep(900);
  seen.push(`added: ${S.added.join(',') || 'nothing'}`);
  if (!S.added.includes('eggs')) problems.push('the eggs did not go into the bowl');

  // --- and shut again: the fridge door covers the milk once more ---
  const fd = document.querySelector('#kopen [data-door="fridge"]');
  const [fx, fy] = centre(fd);
  tapAt(fx, fy);
  await sleep(500);
  const [mx, my] = centre(item('milk').querySelector('rect'));
  if (S.doors.fridge) problems.push('tapping the open fridge door did not shut it');
  else if (itemAt(mx, my)) problems.push('the milk can be reached through the fridge shut again');
  seen.push(`fridge ${S.doors.fridge ? 'open' : 'shut'} again`);

  // --- every door, open and shut again, with a real tap at its own screen point ---
  // The cupboards nothing is kept in (tall, narrow, sink, pair) have no swung-open
  // picture of their own: an open one swings out past its hinge, off the gap, so
  // there has to be a hit rect over the gap that stays put, or the door can be
  // opened but never tapped shut again. This is exactly the kind of thing that looks fine in
  // a screenshot (the open state is correct) and only shows up at a real click.
  K.state.doors = {};
  K.renderKitchen();
  await sleep(500);
  // 'pair' used to fall outside KITCHEN_CLEAR (the zoom fitScene switches to
  // when the recipe book overlaps the room), so it wasn't just covered by the
  // book but not drawn into the shown scene at all -- opening it, then never
  // being able to reach it again to shut it. Now that the whole room stays in
  // that zoom, it belongs in this loop with the rest.
  for (const id of ['tall', 'narrow', 'sink', 'pair', 'cupboard', 'fridge', 'oven']) {
    const g = document.querySelector(`[data-door="${id}"]`);
    if (!g) { problems.push(`${id}: no such door`); continue; }
    const [x, y] = centre(g);
    tapAt(x, y);
    await sleep(400);
    if (!S.doors[id]) { problems.push(`${id}: tapping it did not open it`); continue; }
    tapAt(x, y);
    await sleep(400);
    if (S.doors[id]) problems.push(`${id}: open, but tapping the same spot again did not shut it`);
  }
  seen.push('all 7 doors open and shut again at a real tap');

  // leave it where a player would find it
  K.state.recipe = null; K.state.phase = 'recipe'; K.state.added = []; K.state.doors = {};
  K.renderKitchen();

  return JSON.stringify({ pass: problems.length === 0, detail: seen.join('; ') + (problems.length ? ' -- ' + problems.join('; ') : '') });
})();
