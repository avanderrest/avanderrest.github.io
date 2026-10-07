/* A run can be played to its end, and building well is worth something.

   A plain bot plays whole games against the real sim, in Node, with seeded dice. It plays
   the way the help screen says to: walls bend the road the long way round (never sealing
   it), towers go where they cover the most road, farms where the road cannot reach, a
   barracks beside the road near the keep once there is one to spare. Every wave has to
   finish, the run has to end (a keep that can never fall is a game with no stakes), and
   building must never do worse than the do-nothing village of teeth.js, which falls on
   wave 3. Three seeds, so one lucky gate order cannot carry it.

   On 2026-10-07 this bot, and every variation tried on it (towers only, up to 20 walls),
   fell on wave 3 or 4: the waves outgrow a starting economy of one farm very fast. That is
   a balance question for the game, recorded in hollowmarch/PLAN.md, not something this
   case enforces. The wave reached is in the detail so a rebalance shows up here. */
import { createGame, W, H, CASTLE, GATES, BUILD, isBuilding } from '../../hollowmarch/sim.js';
import { mulberry32 } from '../../lib/rng.js';

const d = (i, j) => Math.hypot(i % W - j % W, Math.floor(i / W) - Math.floor(j / W));

// Steps from every gate to the keep along the flow field, and whether any of it runs
// through a building (a sealed road the horde would have to batter).
function roads(game) {
  let steps = 0, sealed = false;
  const cells = new Set();
  for (const g of GATES) {
    for (let c = g, n = 0; c >= 0 && c !== CASTLE && n < W * H; c = game.flow.next[c], n++) {
      steps++; cells.add(c);
      if (isBuilding(game.state.grid[c])) sealed = true;
    }
  }
  return { steps, sealed, cells };
}

function play(seed) {
  const game = createGame({ rnd: mulberry32(seed) });
  const s = () => game.state;
  const free = () => [...Array(W * H).keys()].filter((i) => !s().grid[i]);
  const trial = (i, t) => { const g = createGame({ saved: game.serialize() }); return g.place(i, t).ok ? g : null; };

  function bestWall() {
    const base = roads(game).steps;
    let best = null, gain = 0;
    for (const i of free()) {
      const g = trial(i, 'wall');
      if (!g) continue;
      const r = roads(g);
      if (!r.sealed && r.steps - base > gain) { gain = r.steps - base; best = i; }
    }
    return best;
  }
  function bestTower() {
    const road = roads(game).cells;
    let best = null, cover = 0;
    for (const i of free()) {
      if (road.has(i)) continue;
      const c = [...road].filter((r) => d(r, i) <= 2.6).length;
      if (c > cover) { cover = c; best = i; }
    }
    return best;
  }

  function spend() {
    for (let guard = 0; guard < 60; guard++) {
      const g = s().gold;
      const count = (t) => s().grid.filter((x) => x === t).length;
      const road = roads(game).cells;
      let want = null;
      if (count('farm') < Math.min(4, 1 + count('tower') / 2) && g >= BUILD.farm.cost) {
        const c = free().filter((i) => !road.has(i)).sort((a, b) =>
          Math.min(...[...road].map((r) => d(r, b))) - Math.min(...[...road].map((r) => d(r, a))))[0];
        if (c !== undefined) want = [c, 'farm'];
      }
      if (!want && !count('tower')) {
        // the first wave will not start without one
        if (g < BUILD.tower.cost) return;
        const c = bestTower();
        if (c !== null) want = [c, 'tower'];
      }
      if (!want && g >= BUILD.wall.cost && count('wall') < 12) {
        const c = bestWall();
        if (c !== null) want = [c, 'wall'];
      }
      if (!want && count('tower') >= 3 && !count('barracks') && g >= BUILD.barracks.cost) {
        const c = free().filter((i) => !road.has(i) && [...road].some((r) => d(r, i) <= 1)).sort((a, b) => d(a, CASTLE) - d(b, CASTLE))[0];
        if (c !== undefined) want = [c, 'barracks'];
      }
      if (!want && g >= BUILD.tower.cost) {
        const c = bestTower();
        if (c !== null) want = [c, 'tower'];
      }
      if (!want) return;
      if (!game.place(want[0], want[1]).ok) return;
    }
  }

  let stuck = null;
  while (!s().fallen && s().wave <= 80) {
    spend();
    if (!game.startWave().ok) { stuck = `wave ${s().wave} would not start`; break; }
    let t = 0;
    while (game.sim && t < 900) { game.step(1); t++; }
    if (game.sim) { stuck = `wave ${s().wave} still running after ${t}s`; break; }
  }
  const count = (t) => s().grid.filter((x) => x === t).length;
  return { seed, reached: s().wave, fell: s().fallen, stuck, kit: `${count('tower')} towers, ${count('wall')} walls, ${count('farm')} farms, path ${roads(game).steps}` };
}

export default function () {
  const runs = [11, 22, 33].map(play);
  const problems = [];
  for (const r of runs) {
    if (r.stuck) problems.push(`seed ${r.seed}: ${r.stuck}`);
    else if (!r.fell) problems.push(`seed ${r.seed}: still standing at wave ${r.reached}; the horde never wins`);
    else if (r.reached < 3) problems.push(`seed ${r.seed}: a built-up village fell on wave ${r.reached}, sooner than one that builds nothing`);
  }
  return {
    pass: !problems.length,
    detail: (problems.length ? problems.join(' | ') + ' -- ' : '') +
      runs.map((r) => `seed ${r.seed}: fell on wave ${r.reached} (${r.kit})`).join('; '),
  };
}
