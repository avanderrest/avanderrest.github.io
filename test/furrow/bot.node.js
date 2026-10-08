/* A village that listens to itself grows: three valleys, twenty days each.

   A bot runs the real village in Node. It lays out the same first seven as the growth case
   (barn, three houses, field, woodcutter, well), then every evening reads what the village
   says it is short of (wants(): beds, food, water, mood) and builds for it: a field for
   food (and one per six people regardless, since wants() only notices food once the barn
   is low), a well for water, a house for beds, a tavern once renown allows. It hires anyone
   idle into any opening, every hour. It never lives as anyone and never marks a tree.

   It has to end with at least twelve people, nobody gone hungry (below 15) after the first
   day, and nobody leaving because they were miserable (a thief run out is the game working). What this guards is the long game the growth case stops short
   of: a village that keeps attracting people once the handcart and the easy land are used
   up, with the logs to keep building. */
import { createVillage } from '../../furrow/sim.js';

const DAYS = 20;

function run(seed) {
  const w = createVillage({});
  w.seedDice(seed);
  w.newGame(seed * 1000 + 7);
  const { S, V, B, BT, HOME } = w;
  const hours = (h) => { const n = Math.ceil(h * w.SEC_PER_HOUR / 0.2); for (let i = 0; i < n; i++) w.step(0.2); };
  const put = (type, crop) => {
    for (let r = 2; r < 22; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      if (!w.whyNot(type, HOME.x + dx, HOME.y + dy)) { const b = w.place(type, HOME.x + dx, HOME.y + dy); if (crop) b.crop = crop; return b; }
    }
    return null;
  };
  const hire = () => {
    for (const v of V) if (v.job < 0 && !v.gone) {
      const b = B.find((b) => b && b.built && BT[b.type].jobs && b.workers.length < BT[b.type].jobs);
      if (b) w.assignJob(v, b);
    }
  };
  const sites = () => B.filter((b) => b && !b.built).length;
  ['barn', 'house', 'house', 'house', 'field', 'wood', 'well'].forEach((t) => put(t));
  let hungryDays = 0, lowest = 100, refused = 0;
  const why = new Map();             // villager id -> why they left
  const built = [];
  for (let d = 0; d < DAYS; d++) {
    let dayLow = 100;
    for (let h = 0; h < 24; h++) {
      hours(1); hire();
      for (const v of V) {
        if (!v.gone) dayLow = Math.min(dayLow, v.hunger);
        if (v.leaving && !why.has(v.id)) why.set(v.id, v.caughtN >= 4 ? 'run out for thieving' : 'too glum');
      }
    }
    if (d >= 1) { lowest = Math.min(lowest, dayLow); if (dayLow < 15) hungryDays++; }
    if (sites() >= 2) continue;                 // let them finish what is marked out first
    const short = w.wants(2).map((x) => x.k);
    // a field feeds about a dozen at one crop every day and a half, so plant ahead of the
    // headcount: food first, then water, then beds
    const fields = B.filter((b) => b && b.type === 'field').length;
    const hungry = short.includes('food') || fields * 6 < w.pop() + 2;
    const cutters = B.filter((b) => b && b.type === 'wood').length;
    const want = hungry ? 'field' : (S.store.logs || 0) < 12 && cutters * 8 < w.pop() ? 'wood'
      : short.includes('water') ? 'well' : short.includes('beds') ? 'house' : null;
    if (want) { const b = put(want); if (b) built.push(want); else refused++; }
    if (S.renown >= BT.tavern.star && w.pop() >= BT.tavern.pop && !B.some((b) => b && b.type === 'tavern')) { if (put('tavern')) built.push('tavern'); }
    if (d === 3 && !B.some((b) => b && b.type === 'forester')) put('forester');
  }
  return { seed, pop: w.pop(), day: S.day, lowest, hungryDays, left: S.stats.left, why: [...why.values()], built, refused, logs: S.store.logs | 0, food: w.foodInStore(), renown: S.renown };
}

export default function () {
  const runs = [1, 2, 3].map((s) => run(s));
  const problems = [];
  for (const r of runs) {
    if (r.pop < 12) problems.push(`seed ${r.seed}: only ${r.pop} people by day ${r.day}`);
    if (r.hungryDays) problems.push(`seed ${r.seed}: ${r.hungryDays} hungry days (lowest ${r.lowest.toFixed(0)})`);
    // thieves being run out is the game working; people leaving because they are miserable is not
    const glum = r.why.filter((x) => x === 'too glum').length;
    if (glum) problems.push(`seed ${r.seed}: ${glum} left too glum to stay`);
  }
  const count = (arr) => Object.entries(arr.reduce((m, k) => ((m[k] = (m[k] || 0) + 1), m), {})).map(([k, n]) => `${n} ${k}`).join(', ');
  return {
    pass: !problems.length,
    detail: (problems.length ? problems.join(' | ') + ' -- ' : '') +
      runs.map((r) => `seed ${r.seed}: pop ${r.pop} on day ${r.day}, lowest hunger ${r.lowest.toFixed(0)}, renown ${r.renown}, logs ${r.logs}, food ${r.food}, built ${count(r.built) || 'nothing more'}${r.why.length ? `, left: ${count(r.why)}` : ''}${r.refused ? `, ${r.refused} refused` : ''}`).join('; '),
  };
}
