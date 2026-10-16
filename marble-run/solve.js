/* Marble Run: the solver. No page access; the tests and the level work use it.

   A beam search over placements. Each step it releases the marble on every layout in the
   beam, and tries every piece left in the box, both ways round, in every empty cell the
   marble passed through or beside it (beside, so a catcher can go where the marble only
   nearly went). Layouts are ranked
   by bells rung (when they count), then marbles home, then how close a marble came to a
   cup and to the bells still silent, and the best
   `beam` go on to the next step. The first layout that wins with every bell rung is the
   answer, and its size is the level's par.

     solve(def, { beam, depth, bells })  ->  { placed, used, sims } or { placed: null, ... }

   It is not exhaustive (a narrow beam can miss a layout), so a par it finds is an upper
   bound: a player who beats it has found something the solver did not. */
import { parseLevel, simulate, canHang, PIECES } from './sim.js';

const keyOf = (placed) => placed.map((p) => `${p.kind}${p.x},${p.y}${p.flip ? 'F' : ''}`).sort().join('|');

function score(r, bells) {
  // when the bells count, a run that rang more of them beats one that reached the cup
  // without: pieces only add on, so a route that skipped a bell rarely comes back for it
  return r.caught * 1000 + (r.won ? 500 : 0) + r.bells * (bells ? 3000 : 40) - Math.min(r.minD, 20) * 10 +
    Math.min(r.path.length, 40) - (bells ? r.bellD * 40 : 0);
}

export function solve(def, { beam = 24, depth = 0, bells = true, budget = 60000, wide = true } = {}) {
  const near = wide ? [[0, 0], [1, 0], [-1, 0], [0, -1]] : [[0, 0]];
  const L = parseLevel(def);
  const box = Object.entries(L.give).filter(([, n]) => n > 0);
  const total = box.reduce((n, [, c]) => n + c, 0);
  const maxDepth = depth || total;
  const seen = new Set();
  let sims = 0, firstWin = null, best = null;
  const done = (placed) => ({ placed, used: placed.length, sims, firstWin });

  let frontier = [{ placed: [], r: simulate(L, []) }];
  sims++;
  if (frontier[0].r.won && (!bells || frontier[0].r.bellsAll)) return done([]);

  for (let d = 1; d <= maxDepth; d++) {
    const next = [];
    for (const st of frontier) {
      const left = {};
      for (const [k, n] of box) left[k] = n - st.placed.filter((p) => p.kind === k).length;
      const cells = new Set();
      for (const ci of st.r.path) {
        const x = ci % L.w, y = Math.floor(ci / L.w);
        for (const [dx, dy] of near) if (canHang(L, x + dx, y + dy)) cells.add((y + dy) * L.w + x + dx);
      }
      for (const ci of cells) {
        const x = ci % L.w, y = Math.floor(ci / L.w);
        if (!canHang(L, x, y) || st.placed.some((p) => p.x === x && p.y === y)) continue;
        for (const [kind] of box) {
          if (left[kind] <= 0) continue;
          for (const flip of PIECES[kind].sym ? [false] : [false, true]) {
            const placed = [...st.placed, { kind, x, y, flip }];
            const key = keyOf(placed);
            if (seen.has(key)) continue;
            seen.add(key);
            const r = simulate(L, placed);
            sims++;
            if (r.won && !firstWin) firstWin = placed;
            if (r.won && (!bells || r.bellsAll)) return done(placed);
            next.push({ placed, r, s: score(r, bells) });
            if (sims > budget) return { placed: null, used: 0, sims, firstWin, best };
          }
        }
      }
    }
    next.sort((a, b) => b.s - a.s);
    frontier = next.slice(0, beam);
    if (frontier.length) best = frontier[0];
    if (!frontier.length) break;
  }
  return { placed: null, used: 0, sims, firstWin, best };
}

// For a level's `solution` field: [kind, x, y, flip] in the order the solver placed them.
export const asList = (placed) => placed.map((p) => [p.kind, p.x, p.y, p.flip ? 1 : 0]);
