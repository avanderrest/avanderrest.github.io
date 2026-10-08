/* A sensible adventurer goes down the Lantern Deep, again and again.

   A bot plays whole delves in Node through the real verbs: it only ever calls act() with
   an id from choices(), the same list the buttons are made from. It explores the nearest
   unexplored room first, drinks a potion when it is hurt, talks or sneaks when its class is
   good at that, searches a chest before opening it, rests at a camp when it is worn down,
   buys potions from the pedlar, and takes the stair once the floor is mostly explored.

   The bar: no delve gets stuck (every state has a choice, every choice resolves, no run
   goes past 2000 actions), and the dungeon is neither a walkover nor a wall: across 160
   delves, 40 per class, between 10% and 85% reach the Hollow King and kill him, and every
   class wins at least once. The numbers per class go in PLAN.md. */
import { createDelve } from '../../lantern-deep/sim.js';
import { ITEMS, MONSTERS } from '../../lantern-deep/content.js';
import { mulberry32 } from '../../lib/rng.js';

const CLASSES = ['fighter', 'wizard', 'rogue', 'cleric'];

function nextStep(g) {
  const S = g.S, rm = g.room(), rooms = S.map.rooms;
  // breadth-first over visited rooms to the nearest unvisited one (or the stair)
  const prev = new Map([[S.at, null]]), q = [S.at];
  let target = null;
  for (let i = 0; i < q.length && target == null; i++) {
    const r = rooms[q[i]];
    for (const d of 'nesw') {
      const to = r.exits[d]; if (to == null || prev.has(to)) continue;
      prev.set(to, q[i]);
      if (!rooms[to].visited) { target = to; break; }
      q.push(to);
    }
  }
  const explored = rooms.filter((r) => r.visited).length / rooms.length;
  if (target == null || (explored > 0.75 && rm.stairs)) {
    const stair = rooms.find((r) => r.stairs || r.throne);
    if (rm.stairs) return 'descend';
    target = stair.id;
    // walk known rooms to it; the stair room is always reachable through visited ones by now
    const p2 = new Map([[S.at, null]]), q2 = [S.at];
    for (let i = 0; i < q2.length; i++) for (const d of 'nesw') { const to = rooms[q2[i]].exits[d]; if (to != null && !p2.has(to)) { p2.set(to, q2[i]); q2.push(to); } }
    let step = target; while (p2.get(step) !== S.at && p2.get(step) != null) step = p2.get(step);
    return 'go:' + 'nesw'.split('').find((d) => rm.exits[d] === step);
  }
  let step = target; while (prev.get(step) !== S.at) step = prev.get(step);
  return 'go:' + 'nesw'.split('').find((d) => rm.exits[d] === step);
}

function choose(g, cs) {
  const S = g.S, H = S.hero, ids = new Set(cs.filter((c) => !c.disabled).map((c) => c.id));
  const pick = (...xs) => xs.find((x) => ids.has(x));
  const hurt = H ? H.hp / H.maxHp : 1;
  const heals = H ? H.bag.filter((b) => ITEMS[b.id].use === 'heal').map((b) => 'use:' + b.id) : [];
  if (S.mode === 'create') return [...ids][0];
  if (S.mode === 'dead' || S.mode === 'won') return null;
  const boost = cs.find((c) => c.verb === 'boost'); if (boost) return boost.id;
  if (S.mode === 'shop') {
    const n = H.bag.filter((b) => ITEMS[b.id].use === 'heal').reduce((a, b) => a + b.n, 0);
    return (n < 4 && pick('buy:potion-greater', 'buy:potion-heal')) || (H.armour < 2 && pick('buy:shield-rune', 'buy:shield-iron')) || 'leave';
  }
  if (S.mode === 'fight') {
    const f = g.room().foe;
    if (hurt < 0.4) { const h = pick(...heals, 'skill:heal', 'skill:second-wind'); if (h) return h; }
    if (hurt < 0.25 && f.hp / f.maxHp > 0.4) { const r = pick('skill:smoke', 'flee'); if (r && (r !== 'flee' || cs.find((c) => c.id === 'flee').chance > 0.5)) return r; }
    if (f.hp > 6) { const big = pick('skill:turn', 'skill:backstab', 'skill:magic-missile', 'skill:smite', 'skill:cleave', 'use:wand-sparks', 'use:flask-fire'); if (big) return big; }
    return pick('skill:firebolt') || 'attack';
  }
  // exploring
  const rm = g.room();
  if (rm.foe && rm.foe.state === 'hostile') {
    if (hurt < 0.55) { const h = pick(...heals); if (h) return h; }
    const by = (v) => cs.find((c) => c.id === v);
    if (by('parley') && by('parley').chance >= 0.55) return 'parley';
    if (by('sneak') && by('sneak').chance >= 0.6 && (MONSTERS[rm.foe.kind].xp > 25 || hurt < 0.6)) return 'sneak';
    if (hurt < 0.3 && by('back')) return 'back';
    return 'fight';
  }
  if (hurt < 0.5) { const h = pick('skill:heal', 'skill:second-wind'); if (h) return h; }
  if (hurt < 0.35) { const h = pick(...heals); if (h) return h; }
  if (H.poison) { const a = pick('use:antidote'); if (a) return a; }
  if (ids.has('trade') && !g.traded.has(S.floor + ':' + S.at)) { g.traded.add(S.floor + ':' + S.at); return 'trade'; }
  const a = pick('take', 'search', 'open', 'read', 'inspect', 'pray');
  if (a) return a;
  if (ids.has('offer') && H.gold > 60) return 'offer';
  if (ids.has('drink') && hurt < 0.8) return 'drink';
  if (ids.has('rest') && hurt < 0.7) return 'rest';
  if (ids.has('camp') && hurt < 0.45) return 'camp';
  if (ids.has('use:potion-mana') && H.pool < g.poolMax() / 2) return 'use:potion-mana';
  return nextStep(g);
}

export default function () {
  const problems = [], per = {};
  let wins = 0, runs = 0, acts = 0;
  const deaths = {};
  for (let k = 0; k < 160; k++) {
    const cls = CLASSES[k % 4];
    const g = createDelve({ seed: 1000 + k, rnd: mulberry32(77 + k) });
    g.traded = new Set();
    g.act('class:' + cls);
    let n = 0;
    for (; n < 2000; n++) {
      const cs = g.choices();
      if (!cs.length) { problems.push(`seed ${1000 + k}: no choices in mode ${g.S.mode}`); break; }
      const id = choose(g, cs);
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
