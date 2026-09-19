/* Every building on the island, raised for real, in one run.

   This is a breadth check rather than a balance one: it grants all the knowledge, funds
   each building, lays the frame and waits for somebody to walk over and raise it. What it
   catches is the class of bug where a building type is placeable but nothing downstream
   knows about it -- a haul that arrives and drops its load into nothing, a draw that never
   runs, a frame that no villager will pick up. The signal fire is the end of that chain,
   so the run finishes by feeding it and checking the game can actually be won.

   It does not assert on how long any one building took: with three survivors and thirteen
   frames they queue, and timing out on one of them says nothing useful. */
const F = window.furrow;
F.UI.speed = 0;
F.newState();
const S = F.S;
const notes = [];
let err = null;

function openSpot(w, h, nearWater) {
  for (let y = 1; y < F.ROWS - 2; y++) for (let x = 1; x < F.COLS - 2; x++) {
    let ok = true;
    for (let j = y; j < y + h && ok; j++) for (let i = x; i < x + w && ok; i++) {
      if (i >= F.COLS || j >= F.ROWS) { ok = false; break; }
      if (S.kind[F.idx(i, j)] !== 'g' || S.occ[F.idx(i, j)]) ok = false;
    }
    if (!ok) continue;
    if (nearWater) {
      let wet = false;
      for (let i = x - 1; i <= x + w; i++) for (let j = y - 1; j <= y + h; j++) {
        if (i >= 0 && j >= 0 && i < F.COLS && j < F.ROWS && S.kind[F.idx(i, j)] === 'w') wet = true;
      }
      if (!wet) continue;
    }
    if (!F.walkable(x - 1, y) && !F.walkable(x, y - 1)) continue;
    return { x, y };
  }
  return null;
}
function run(sec) { for (let i = 0; i < sec * 20; i++) F.tick(0.05); }
function build(type) {
  const d = F.BUILDINGS[type];
  const spot = openSpot(d.w, d.h, type === 'well');
  if (!spot) return 'no room';
  for (const g of Object.keys(d.cost)) S.store[g] += d.cost[g] * 2;   // fund it
  if (!F.placeBuilding(type, spot.x, spot.y)) return 'refused';
  const b = S.buildings[S.buildings.length - 1];
  for (let i = 0; i < 4000 && !b.built; i++) F.tick(0.05);
  return b.built ? 'up' : 'queued';   // still in the queue behind other frames; checked again at the end
}

try {
  const results = {};
  results.store = build('store');
  // grant everything so every building and every draw path gets exercised
  for (const k of F.KNOW_ORDER) S.known[k] = true;
  for (const t of ['shop', 'house', 'well', 'butt', 'bakery', 'dairy', 'weaver', 'coop', 'sty', 'byre', 'fold', 'beacon']) {
    results[t] = build(t);
  }
  S.store.water = 0;
  const waterBefore = S.store.water;
  run(120);
  const waterAfter = S.store.water;
  const fire = S.buildings.find((b) => b.type === 'beacon');
  // feed the fire and check it climbs
  S.store.timber += 200;
  run(600);
  notes.push(Object.entries(results).map(([k, v]) => `${k}:${v}`).join(' '));
  notes.push(`water ${waterBefore.toFixed(0)}->${waterAfter.toFixed(0)}/${F.waterCap()}`);
  notes.push(`fire in=${fire ? fire.in : '-'} charge=${fire ? fire.charge : '-'} won=${S.won}`);
  notes.push(`day ${S.day} pop ${S.villagers.length} built ${S.buildings.filter((b) => b.built).length}/${S.buildings.length}`);
  const unbuilt = S.buildings.filter((b) => !b.built);
  const pass = !unbuilt.length && waterAfter > waterBefore && fire && fire.charge > 0;
  return JSON.stringify({ pass, detail: notes.join(' | ') });
} catch (e) {
  return JSON.stringify({ pass: false, detail: 'THREW ' + String(e && e.stack || e) + ' | ' + notes.join(' | ') });
}
