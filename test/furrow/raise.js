/* A building is a frame until somebody has spent the days on it, and a frame does nothing.
   The failure this guards against is the quiet one: a frame that nobody ever picks up —
   because it was placed where there is no walkable tile against it, or because `raise` lost
   its claim — leaves the camp waiting forever on a storehouse that will never finish, and
   nothing on screen says why.

   It also checks the half-built storehouse is not already acting as a storehouse. */
const F = window.furrow;
F.UI.speed = 0;
F.newState();                         // each case starts on its own island
const S = F.S;

// Somewhere open near the first villager, big enough for the 3x2 storehouse.
const v0 = S.villagers[0];
const cx = Math.floor(v0.px), cy = Math.floor(v0.py);
let spot = null;
for (let r = 1; r < 14 && !spot; r++) {
  for (let dy = -r; dy <= r && !spot; dy++) for (let dx = -r; dx <= r && !spot; dx++) {
    const x = cx + dx, y = cy + dy;
    let ok = true;
    for (let j = y; j < y + 2 && ok; j++) for (let i = x; i < x + 3 && ok; i++) {
      if (i < 0 || j < 0 || i >= F.COLS || j >= F.ROWS) { ok = false; break; }
      if (S.kind[F.idx(i, j)] !== 'g' || S.occ[F.idx(i, j)]) ok = false;
    }
    if (ok && F.walkable(x - 1, y)) spot = { x, y };
  }
}
if (!spot) return JSON.stringify({ pass: false, detail: 'no open 3x2 anywhere near the camp' });

const timberBefore = S.store.timber;
const placed = F.placeBuilding('store', spot.x, spot.y);
const b = S.buildings[S.buildings.length - 1];
const paidUpFront = timberBefore - S.store.timber;
const frameAtFirst = placed && b && b.built === false;
const storeWhileFrame = !!F.S.buildings.find((x) => x.type === 'store' && x.built);

let secs = 0;
while (secs < 90 && b && !b.built) { F.tick(0.05); secs += 0.05; }

const raised = !!(b && b.built);
const workLeft = b ? b.work.toFixed(2) : 'n/a';
const pass = frameAtFirst && paidUpFront === 8 && !storeWhileFrame && raised;
return JSON.stringify({
  pass,
  detail: `placed at ${spot.x},${spot.y}; paid ${paidUpFront} timber up front (want 8); `
    + `frame first: ${frameAtFirst}; counted as a storehouse while a frame: ${storeWhileFrame}; `
    + `raised after ${secs.toFixed(1)}s: ${raised} (work left ${workLeft})`,
});
