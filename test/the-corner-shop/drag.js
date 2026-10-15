/* At the till you drag each thing across the scanner and drop it in the bag, in one go.

   A customer with milk reaches the counter while the keeper stands behind it, walked
   there with the arrow keys and stopped off-centre (not on the till spot itself). This
   presses on the milk on the belt, moves the pointer in steps across the scanner and on
   to the bag, and lets go there, all as real pointer events on the till strip. The milk
   has to ring up as it crosses the scanner (once, at its price) and be in the bag when
   it is let go. A drag straight to the bag without the scanner must not pack it. */
return (() => {
  const H = window.__shop;
  const shop = H.shop;
  const problems = [];
  const $ = (sel) => document.querySelector(sel);
  H.freeze(true);
  H.resetGame();
  document.getElementById('help').hidden = true;
  const st = () => H.state;
  const run = (secs) => { for (let i = 0; i < secs * 20; i++) H.tick(0.05); };
  // two milk and a bread on the shelves, the door open, the keeper at the till
  shop.confirmOrder({ milk: 1, bread: 1 });
  st().room.milk[0].q -= 8; st().slots[0] = 'milk'; st().stock[0] = 8;
  st().room.bread[0].q -= 6; st().slots[1] = 'bread'; st().stock[1] = 6;
  H.openShop();
  // walk up with the keys and stop off-centre, along the counter from the till: next to the
  // counter is close enough to serve
  shop.goTill(); run(2);
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft', key: 'ArrowLeft', bubbles: true }));
  run(0.45);
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowLeft', key: 'ArrowLeft', bubbles: true }));
  run(0.2);
  const stood = [shop.keeper.x.toFixed(2), shop.keeper.y.toFixed(2)];
  if (Math.abs(shop.keeper.x - H.TILL_SPOT[0]) < 1) problems.push('the keys did not move the keeper off the till spot: ' + stood);
  if (!shop.atTill()) problems.push('standing by the counter at ' + stood + ' does not count as at the till');
  // wait for somebody to reach the counter with something
  let t = 0;
  while (t < 200 && !(H.day && H.day.till && H.day.till.state === 'till')) { run(0.5); t += 0.5; }
  if (!H.day || !H.day.till) return JSON.stringify({ pass: false, detail: 'nobody reached the till in 200s' });
  const centre = (el) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  const ev = (type, el, x, y) => el.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, bubbles: true, pointerId: 7, pointerType: 'mouse', buttons: 1 }));
  const belt = $('#belt'), scanner = $('#scanner'), bag = $('#bag');
  const drag = (item, via) => {
    const [x0, y0] = centre(item);
    ev('pointerdown', item, x0, y0);
    let [x, y] = [x0, y0];
    for (const target of via) {
      const [tx, ty] = centre(target);
      for (let k = 1; k <= 8; k++) ev('pointermove', belt, x + (tx - x) * k / 8, y + (ty - y) * k / 8);
      [x, y] = [tx, ty];
    }
    ev('pointerup', belt, x, y);
  };
  // first: straight to the bag, missing the scanner, goes nowhere. The scanner sits
  // between the belt and the bag, so go round it underneath.
  const first = belt.querySelector('.item');
  const uid = first.dataset.uid;
  const [bx, by] = centre(bag);
  ev('pointerdown', first, ...centre(first));
  ev('pointermove', belt, centre(first)[0], by + 200);
  ev('pointermove', belt, bx, by + 200);
  ev('pointermove', belt, bx, by);
  ev('pointerup', belt, bx, by);
  if (H.day.bag.some((it) => it.uid === uid)) problems.push('an unscanned item went in the bag');
  // a click picks a thing up (Amber expected that): it follows the pointer, rings up as it
  // passes the scanner, and a click over the bag packs it
  let clicked = 0;
  {
    const item = belt.querySelector('.item');
    const cuid = item.dataset.uid;
    const [x0, y0] = centre(item);
    ev('pointerdown', item, x0, y0);
    ev('pointerup', belt, x0, y0);
    if (!document.querySelector('.drag-ghost')) problems.push('a click did not pick the item up');
    const [sx, sy] = centre(scanner);
    for (let k = 1; k <= 8; k++) ev('pointermove', document.body, x0 + (sx - x0) * k / 8, y0 + (sy - y0) * k / 8);
    // the picture in hand is under the pointer (it once sat at the foot of the page instead)
    const g = document.querySelector('.drag-ghost');
    const gr = g && g.getBoundingClientRect();
    if (gr && Math.hypot(gr.left + gr.width / 2 - sx, gr.top + gr.height / 2 - sy) > 3) problems.push(`the item in hand is at ${Math.round(gr.left + gr.width / 2)},${Math.round(gr.top + gr.height / 2)}, not under the pointer at ${Math.round(sx)},${Math.round(sy)}`);
    for (let k = 1; k <= 8; k++) ev('pointermove', document.body, sx + (bx - sx) * k / 8, sy + (by - sy) * k / 8);
    ev('pointerdown', document.body, bx, by);
    ev('pointerup', document.body, bx, by);
    if (!H.day.bag.some((it) => it.uid === cuid)) problems.push('clicked, carried over the scanner and clicked on the bag, but it is not in the bag');
    if (document.querySelector('.drag-ghost')) problems.push('the picked-up item stayed stuck to the pointer');
    else clicked = 1;
  }
  // then every item properly: across the scanner, into the bag
  const n = H.day.belt.length;
  let rung = 0;
  for (let k = 0; k < n; k++) {
    const item = belt.querySelector('.item');
    if (!item) break;
    const it = H.day.belt.find((x) => x.uid === item.dataset.uid);
    const before = H.day.total;
    drag(item, [scanner, bag]);
    if (Math.abs(H.day.total - before - st().prices[it.p.id]) > 0.001 && H.day.till.state === 'till') problems.push(`${it.p.name} rang up ${(H.day.total - before).toFixed(2)}`);
    rung++;
  }
  const c = H.day.till;
  if (!c || c.state !== 'paying') problems.push(`after dragging ${rung} items the customer is ${c ? c.state : 'gone'}, belt ${H.day.belt.length}, bag ${H.day.bag.length}`);
  return JSON.stringify({
    pass: !problems.length,
    detail: (problems.length ? problems.join(' | ') + ' -- ' : '') + `standing at ${stood}, clicked ${clicked} into the bag, dragged ${rung} of ${n} items across the scanner into the bag; ${H.day.bag.length} bagged, £${H.day.total.toFixed(2)} on the till`,
  });
})();
