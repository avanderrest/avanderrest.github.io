/* Laying the village out. What breaks silently here is a building that can be placed but
   never used — a door walled off, a site nobody comes to raise, a workplace nobody can be
   hired into — or a chain that is supposed to gate something and does not.
   So: renown gates, the barber waits on a smithy and the clothes shop on a sheep pen, a
   house that would cut the barn off is refused, a new house is raised by the jobless, and
   the spare bed brings somebody down the road the next morning, jobless, to be hired. */
const F = window.furrow;
F.seed(11);
F.newGame(4242);
const S = F.S;
const notes = [], checks = [];
const check = (name, ok, extra) => { checks.push(ok); notes.push(name + (ok ? ' ok' : ' FAILED') + (extra ? ' (' + extra + ')' : '')); };
check('a new village has nothing built but the camp', F.B.filter(Boolean).map((b) => b.type).join() === 'camp' && F.V.every((v) => v.job < 0 && v.home < 0), F.B.filter(Boolean).map((b) => b.type).join());
F.quickStart();
check('the first barn packs the camp away', !F.B.some((b) => b && b.type === 'camp'));
// somewhere free for a footprint, near the green
function spot(type) {
  for (let r = 3; r < 20; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    const x = 24 + dx, y = 21 + dy;
    if (!F.whyNot(type, x, y)) return [x, y];
  }
  return null;
}
check('the bakery waits on renown', /renown/.test(F.whyNot('bakery', 30, 10) || ''), F.whyNot('bakery', 30, 10));
S.renown = 20; S.coins = 1000; S.store.logs = 70;
check('no barber without a blacksmith', /blacksmith/.test(F.whyNot('barber', 30, 10) || ''), F.whyNot('barber', 30, 10));
check('no clothes shop without sheep', /sheep/.test(F.whyNot('tailor', 30, 10) || ''), F.whyNot('tailor', 30, 10));
const barn = F.B.find((b) => b && b.type === 'barn'), e = F.entry(barn);
const cut = F.whyNot('house', e.x - 1, e.y);
check('a house on the barn door is refused', !!cut, cut);

// every workplace, placed and finished
const placed = {};
for (const type of ['smith', 'sheep', 'barber', 'tailor', 'coop', 'market', 'bakery', 'tavern', 'cows', 'wood']) {
  const p = spot(type);
  S.store.logs = Math.max(S.store.logs, 40);
  const b = p && F.place(type, p[0], p[1]);
  if (!b || typeof b === 'string') { check('place ' + type, false, b || 'no room'); continue; }
  F.finishBuilding(b, true);
  placed[type] = b;
}
check('every workplace found room', Object.keys(placed).length === 10, Object.keys(placed).join(','));
// every door reachable from the road
const seen = F.flood();
const cutOff = F.B.filter((b) => b && !seen[F.entry(b).y * F.MW + F.entry(b).x]).map((b) => b.type);
check('every door can be reached', cutOff.length === 0, cutOff.join(','));

// a house, raised by whoever is idle
S.store.logs = Math.max(S.store.logs, 20);
const hp = spot('house');
const house = F.place('house', hp[0], hp[1]);
const hester = F.V.find((v) => v.name === 'Hester');
check('Hester is out of work', hester.job < 0);
let hrs = 0;
while (!house.built && hrs < 30) { F.hours(1); hrs++; }
check('the jobless raise a house', house.built, 'in ' + hrs + ' village hours, ' + house.work.toFixed(1) + '/' + house.need);
// a spare bed and a happy village: someone new in the morning
const pop0 = F.V.length;
while (S.t > 6.5 || S.t < 5.9) F.hours(0.5);
F.hours(1);
const fresh = F.V.slice(pop0);
check('a newcomer comes down the road', fresh.length >= 1, F.V.length + ' villagers, mood ' + (F.V.reduce((n, v) => n + v.mood, 0) / F.V.length).toFixed(0) + ', food ' + F.foodInStore());
if (fresh.length) {
  const nv = fresh[0];
  check('and arrives with no job', nv.job < 0);
  F.assignJob(nv, placed.coop);
  check('and can be hired', nv.job === placed.coop.id && placed.coop.workers.includes(nv.id));
  F.hours(3);
  check('and walks in to settle', nv.x < F.MW - 3, 'at ' + nv.x.toFixed(1) + ',' + nv.y.toFixed(1));
}
return JSON.stringify({ pass: checks.every(Boolean), detail: notes.filter((s) => s.includes('FAILED')).join(' | ') + ' || ' + notes.join(' | ') });
