/* A colony with food in the store and a galley standing must end up fed.

   This is the end-to-end property the whole game hangs on, and it broke twice in ways
   that looked nothing like each other:

     1. Crew drank the tank dry irrigating the terraces, because evening() and the
        irrigation haul both draw on S.store.water and only the suppers were budgeted for.
     2. A building placed across a one-tile neck stranded the crew on the far side of it.
        They carried on cutting and hauling inside their pocket, so nothing looked wrong,
        and the galley was never raised.

   Both ended the same way: full store, empty counter, everybody hungry. So the assertion
   is about delivery, not about surviving a hard map — the setup hands the colony
   everything it needs and then checks the food reaches the plate. */

const K = window.__keelfall;
const DAYS = 8, TICKS_PER_DAY = 2800;

function place(type, deck) {
  for (let r = 2; r <= 9; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const b = K.placeBuilding(type, deck.x + 2 + dx, deck.y + 1 + dy);
      if (b) { b.built = true; b.work = 0; return b; }
    }
  }
  return null;
}

const runs = [];
for (let attempt = 0; attempt < 4; attempt++) {
  K.wipe(); K.newState();
  for (const k of Object.keys(K.CLAIMS)) delete K.CLAIMS[k];
  for (const k of Object.keys(K.BLOCKED)) delete K.BLOCKED[k];
  const S = K.S, deck = S.buildings[0];

  // everything the colony could possibly need, so only delivery is under test
  S.store.timber = 300; S.store.scrap = 200; S.store.water = K.waterCap();
  S.store.fern = 200;
  const galley = place('galley', deck);
  place('catch', deck);
  if (!galley) { runs.push({ ok: false, why: 'nowhere to put a galley' }); continue; }

  let peakStock = 0;
  for (let day = 0; day < DAYS; day++) {
    for (let n = 0; n < TICKS_PER_DAY; n++) K.tick(0.05);
    if (galley.stock > peakStock) peakStock = galley.stock;
  }

  // ...and nobody should have been shut out of the colony while it happened
  const reach = K.reachable(), reachWading = K.reachable(true);
  const stranded = S.crew.filter((c) => {
    const i = K.idx(Math.floor(c.px), Math.floor(c.py));
    return !reach[i] && !reachWading[i];
  }).length;

  const hungry = S.crew.filter((c) => c.hunger > 0).length;
  runs.push({
    ok: peakStock > 0 && hungry === 0 && stranded === 0,
    why: `counter peaked at ${peakStock}, ${hungry} hungry of ${S.crew.length}, ${stranded} stranded`,
  });
}

const bad = runs.filter((r) => !r.ok);
return JSON.stringify({
  pass: bad.length === 0,
  detail: bad.length
    ? `${bad.length}/${runs.length} colonies went hungry with a full store: ` + bad.map((r) => r.why).join(' | ')
    : `${runs.length}/${runs.length} fed themselves — ` + runs.map((r) => r.why).join(' | '),
});
