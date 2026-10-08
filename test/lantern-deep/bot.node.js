/* A sensible adventurer goes down the Lantern Deep, again and again.

   A bot plays whole delves in Node through the real verbs: it only ever calls act() with
   an id from choices(), the same list the buttons are made from. The bot is
   lantern-deep/player.js, which also plays the hero in the Dungeon Master's mode. It
   explores the nearest unexplored room first, drinks a potion when it is hurt, talks or
   sneaks when its class is good at that, searches a chest before opening it, rests at a
   camp when it is worn down, buys potions from the pedlar, and takes the stair once the
   floor is mostly explored.

   The bar: no delve gets stuck (every state has a choice, every choice resolves, no run
   goes past 2000 actions), and the dungeon is neither a walkover nor a wall: across 160
   delves, 40 per class, between 10% and 85% reach the Hollow King and kill him, and every
   class wins at least once. The numbers per class go in PLAN.md. */
import { createDelve } from '../../lantern-deep/sim.js';
import { createPlayer } from '../../lantern-deep/player.js';
import { mulberry32 } from '../../lib/rng.js';

const CLASSES = ['fighter', 'wizard', 'rogue', 'cleric'];

export default function () {
  const problems = [], per = {};
  let wins = 0, runs = 0, acts = 0;
  const deaths = {};
  for (let k = 0; k < 160; k++) {
    const cls = CLASSES[k % 4];
    const g = createDelve({ seed: 1000 + k, rnd: mulberry32(77 + k) });
    const player = createPlayer();
    g.act('class:' + cls);
    let n = 0;
    for (; n < 2000; n++) {
      const cs = g.choices();
      if (!cs.length) { problems.push(`seed ${1000 + k}: no choices in mode ${g.S.mode}`); break; }
      const id = player.choose(g, cs);
      if (id == null) break;
      const res = g.act(id);
      if (!res.ok) { problems.push(`seed ${1000 + k}: ${id} refused in ${g.S.mode}`); break; }
    }
    if (n >= 2000) problems.push(`seed ${1000 + k} (${cls}) stuck on floor ${g.S.floor}, mode ${g.S.mode}`);
    acts += n; runs++;
    const p = per[cls] || (per[cls] = { wins: 0, floors: 0, lvl: 0, n: 0 });
    p.n++; p.floors += g.S.floor; p.lvl += g.S.hero.lvl;
    if (g.S.mode === 'won') { wins++; p.wins++; }
    else { const last = [...g.S.log].reverse().find(() => true); const key = `f${g.S.floor}`; deaths[key] = (deaths[key] || 0) + 1; void last; }
  }
  const rate = wins / runs;
  if (rate < 0.1 || rate > 0.85) problems.push(`win rate ${(rate * 100).toFixed(0)}% is outside 10-85%`);
  for (const c of CLASSES) if (!per[c].wins) problems.push(`no ${c} ever won`);
  const table = CLASSES.map((c) => `${c} ${per[c].wins}/${per[c].n} won, floor ${(per[c].floors / per[c].n).toFixed(1)}, lvl ${(per[c].lvl / per[c].n).toFixed(1)}`).join('; ');
  return {
    pass: !problems.length,
    detail: (problems.length ? problems.join(' | ') + ' -- ' : '') +
      `${wins}/${runs} delves won (${(rate * 100).toFixed(0)}%); ${table}; deaths by floor ${JSON.stringify(deaths)}; ${(acts / runs).toFixed(0)} actions a delve`,
  };
}
