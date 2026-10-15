/* Stock moves by hand, through the real taps.

   A fresh shop orders a box of milk on the Orders tab (fetched straight into the
   stockroom, as on day one), then: a tap on the milk boxes in the stockroom walks the
   keeper in and lifts one; a tap on the milk shelf walks it out and stacks it. Each step
   is a pointer event on the canvas, with the game's own clock ticked between them.

   It checks the shelf ends full, the stockroom gave up exactly what the shelf gained,
   nothing is left in the keeper's arms, and that a tap on a shelf still holding something
   else (or with empty arms) does not stack anything. Then a box of apples goes onto an
   empty shelf, which becomes the apples' shelf, leaving their old table empty. */
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
  const canvas = $('#floor');
  // a tap on the canvas at scene coordinates
  const tap = (x, y) => {
    const r = canvas.getBoundingClientRect();
    const cx = r.left + x * r.width / H.W, cy = r.top + y * r.height / H.H;
    const o = { clientX: cx, clientY: cy, bubbles: true, pointerId: 1, pointerType: 'mouse' };
    canvas.dispatchEvent(new PointerEvent('pointerdown', o));
    canvas.dispatchEvent(new PointerEvent('pointerup', o));
  };
  // a new shop's shelves are empty: the milk goes on the first one
  if (st().slots.some(Boolean)) problems.push('a new shop came with products on its shelves');
  const milkFacing = 0;
  const F = H.FACINGS[milkFacing];
  const shelfAt = [H.px(F.x + 1), H.py(F.y + 1) - 20];

  H.setTab('orders');
  $('[data-order="milk"][data-d="1"]').click();
  $('#btn-order').click();
  const roomBefore = shop.roomQty('milk');
  if (roomBefore !== 8) problems.push(`the first box of milk should be in the stockroom at once, found ${roomBefore}`);

  // a shelf tapped with empty arms stacks nothing
  tap(shelfAt[0], shelfAt[1]);
  run(3);
  if (shop.shelfOf('milk')) problems.push('tapping the milk shelf with empty arms put milk on it');

  // the stockroom: tap the milk boxes, and the keeper walks in and lifts one
  const cr = shop.crates().find((c) => c.pid === 'milk');
  if (!cr) problems.push('no milk boxes in the stockroom');
  else {
    const r = H.crateRect(cr);
    tap(r.x + r.w / 2, r.y + r.h - 12);
  }
  run(6);
  if (!shop.atRoom()) problems.push(`the keeper did not walk into the stockroom (at ${shop.keeper.x.toFixed(1)}, ${shop.keeper.y.toFixed(1)})`);
  if (!st().carry || st().carry.pid !== 'milk') problems.push('the keeper is not carrying the milk: ' + JSON.stringify(st().carry));
  const carried = st().carry ? st().carry.q : 0;

  // a shelf still holding something else does nothing (an empty one would take it)
  const other = 1;
  st().slots[other] = 'bread';
  st().stock[other] = 2;
  H.tapFacing(other);
  run(3);
  if (!st().carry || st().carry.q !== carried) problems.push('the milk went onto a shelf still holding bread');

  // an empty one: walk out and stack, and it becomes the milk's shelf
  tap(shelfAt[0], shelfAt[1]);
  run(6);
  const shelf = shop.shelfOf('milk');
  if (st().slots[milkFacing] !== 'milk') problems.push('the empty shelf did not become the milk shelf: ' + st().slots[milkFacing]);
  if (shelf !== 8) problems.push(`milk shelf ends at ${shelf}/8`);
  if (st().carry) problems.push('something left in the keeper\'s arms: ' + JSON.stringify(st().carry));
  if (shop.roomQty('milk') + shelf !== roomBefore) problems.push(`milk went missing: ${shop.roomQty('milk')} in back + ${shelf} out != ${roomBefore}`);
  // a box can go on any empty shelf, which then becomes its shelf; not on one still
  // holding something else
  st().room.apples.push({ q: 10, age: 0 });
  // before opening, empty arms take a shelf's things off: clear the fizzy pop by hand and
  // put it back in the stockroom
  const free = 5;
  st().slots[free] = 'fizzy';
  st().stock[free] = 3;
  st().slots[11] = 'apples';
  H.tapFacing(free); run(6);
  if (st().stock[free] || !st().carry || st().carry.pid !== 'fizzy' || st().carry.q !== 3) problems.push('tapping the fizzy shelf with empty arms did not take its 3 off: ' + JSON.stringify(st().carry) + ', shelf ' + st().stock[free]);
  // back in the stockroom, on whichever free pallet side you tap: here the last one
  const side = st().pallets.length - 1;
  if (st().pallets[side]) problems.push('the last pallet side was not free to start with');
  const sr = H.slotRect(side);
  tap(sr.x + sr.w / 2, sr.y + sr.h - 12); run(7);
  if (shop.roomQty('fizzy') !== 3) problems.push(`the fizzy pop did not go back in the stockroom (${shop.roomQty('fizzy')})`);
  if (!st().pallets[side] || st().pallets[side].pid !== 'fizzy') problems.push('the fizzy pop did not go on the tapped pallet side: ' + JSON.stringify(st().pallets[side]));
  const oldApple = st().slots.indexOf('apples');
  shop.pickUp('apples'); run(6);
  const busy = st().slots.indexOf('milk');
  const r = shop.restock(busy);
  if (r.ok) problems.push('a box of apples was allowed onto the full milk shelf');
  tap(H.px(H.FACINGS[free].x + 1), H.py(H.FACINGS[free].y + 1) - 20);
  run(8);
  if (st().slots[free] !== 'apples') problems.push(`the empty shelf did not take the apples: ${st().slots[free]}`);
  // a product can have two shelves: the apples keep their old table as well
  if (st().slots[oldApple] !== 'apples') problems.push(`the apples lost their old table: ${st().slots[oldApple]}`);
  if (st().stock[free] !== 10) problems.push(`apples on their new shelf: ${st().stock[free]}/10`);
  return JSON.stringify({
    pass: !problems.length,
    detail: (problems.length ? problems.join(' | ') + ' -- ' : '') + `carried ${carried} milk from the stockroom (${roomBefore} in) to facing ${milkFacing}; shelf ${shelf}/8, ${shop.roomQty('milk')} left in back; apples carried to empty facing ${free} (${st().stock[free]}/10), keeping their table too, refused on the milk shelf; fizzy taken off its shelf by hand and put on the pallet side tapped`,
  });
})();
