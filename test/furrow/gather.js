/* Marking is the whole economy now: nothing enters the storehouse that somebody did not
   walk out to, work, and carry back. This drives one day of that with no buildings at all,
   which also exercises the case where the drop-off is the campfire rather than a storehouse.

   It breaks silently if marks are picked up but never finished (a villager who can reach
   the tile to start but not to stand while working), or if the yield goes in as the wrong
   material, so the assertion is on what actually reached the store. */
const F = window.furrow;
F.UI.speed = 0;                       // drive the clock by hand
F.newState();                         // each case starts on its own island
const S = F.S;

const before = { ...S.store };
const kinds = { t: 0, s: 0, k: 0 };
for (let i = 0; i < S.kind.length; i++) if (kinds[S.kind[i]] !== undefined) kinds[S.kind[i]]++;
if (!kinds.t || !kinds.s || !kinds.k) {
  return JSON.stringify({ pass: false, detail: `island is missing a material: ${kinds.t} trees, ${kinds.s} boulders, ${kinds.k} wreck` });
}

// Mark the six reachable trees nearest the camp, one tile at a time.
const camp = { x: Math.floor(S.villagers[0].px), y: Math.floor(S.villagers[0].py) };
const trees = [];
for (let i = 0; i < S.kind.length; i++) {
  if (S.kind[i] !== 't') continue;
  const x = i % F.COLS, y = Math.floor(i / F.COLS);
  if (!F.beside(x, y).size) continue;
  trees.push({ x, y, d: Math.abs(x - camp.x) + Math.abs(y - camp.y) });
}
trees.sort((a, b) => a.d - b.d);
const want = trees.slice(0, 6);
for (const t of want) F.markArea(t.x, t.y, t.x, t.y, 't');
const marked = F.marksLeft();

// One working day, in small steps.
let secs = 0;
while (secs < 60 && F.marksLeft() > 0) { F.tick(0.05); secs += 0.05; }
// and let whoever is still carrying finish the walk home
for (let i = 0; i < 400 && S.villagers.some((v) => v.carry); i++) F.tick(0.05);

const got = S.store.timber - before.timber;
const left = F.marksLeft();
const stillStanding = want.filter((t) => S.kind[F.idx(t.x, t.y)] === 't').length;
const carrying = S.villagers.filter((v) => v.carry).length;

const pass = marked === 6 && left === 0 && stillStanding === 0 && got === 18;
return JSON.stringify({
  pass,
  detail: `marked ${marked}, ${left} left after ${secs.toFixed(1)}s, ${stillStanding} still standing, `
    + `+${got} timber (want 18), ${carrying} still carrying, store now ${S.store.timber}t/${S.store.stone}s`,
});
