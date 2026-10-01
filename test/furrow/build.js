/* Laying the village out. What breaks silently here is a building that can be placed but
   never used — a door walled off, a site nobody comes to raise, a workplace nobody can be
   hired into — or a chain that is supposed to gate something and does not.
   So: headcount and renown gate, the barber waits on a smithy and the clothes shop on a sheep
   pen, a house that would cut the barn off is refused, nothing goes on a tree or a rock, a
   building can go down on top of someone (who steps aside), a turned entrance is where people
   actually stand, a new house is raised by the jobless, and the spare bed brings somebody down
   the road the next morning, jobless, to be hired. */
const F = window.furrow;
F.seed(11);
F.newGame(4242);
const S = F.S, H = F.HOME;
const notes = [], checks = [];
const check = (name, ok, extra) => { checks.push(ok); notes.push(name + (ok ? ' ok' : ' FAILED') + (extra ? ' (' + extra + ')' : '')); };
check('a new village has nothing built but the camp', F.B.filter(Boolean).map((b) => b.type).join() === 'camp' && F.V.every((v) => v.job < 0 && v.home < 0), F.B.filter(Boolean).map((b) => b.type).join());
F.quickStart();
check('the first barn packs the camp away', !F.B.some((b) => b && b.type === 'camp'));
check('there is no coin any more', !('coins' in S) && F.V.every((v) => !('purse' in v)));
// somewhere free for a footprint, near the green
function spot(type, turn) {
  for (let r = 3; r < 26; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    const x = H.x + dx, y = H.y + dy;
    if (!F.whyNot(type, x, y, turn)) return [x, y];
  }
  return null;
}
S.store.logs = 200; S.store.stone = 100;
check('the bakery waits on headcount', /villagers/.test(F.whyNot('bakery', H.x + 6, H.y - 12) || ''), F.whyNot('bakery', H.x + 6, H.y - 12));
check('the forester does not', !/villagers|renown/.test(F.whyNot('forester', H.x + 6, H.y - 12) || ''), F.whyNot('forester', H.x + 6, H.y - 12));
for (let i = 0; i < 8; i++) F.arrive();
S.renown = 0;   // each newcomer brought a little
check('then waits on renown', /renown/.test(F.whyNot('bakery', H.x + 6, H.y - 12) || ''), F.whyNot('bakery', H.x + 6, H.y - 12));
S.renown = 20;
check('no barber without a blacksmith', /blacksmith/.test(F.whyNot('barber', H.x + 6, H.y - 12) || ''), F.whyNot('barber', H.x + 6, H.y - 12));
check('no clothes shop without sheep', /sheep/.test(F.whyNot('tailor', H.x + 6, H.y - 12) || ''), F.whyNot('tailor', H.x + 6, H.y - 12));
const barn = F.B.find((b) => b && b.type === 'barn'), e = F.entry(barn);
const cut = F.whyNot('house', e.x - 1, e.y);
check('a house on the barn door is refused', !!cut, cut);

// trees and rocks are in the way until somebody clears them
const MW = F.MW, tree = F.map.tree;
let treeAt = null, rockAt = null;
for (let y = 2; y < F.MH - 4 && !(treeAt && rockAt); y++) for (let x = 2; x < MW - 4; x++) {
  const c = y * MW + x;
  if (!treeAt && tree[c] === F.TR.TREE && F.map.sid[c] < 0) treeAt = [x, y];
  if (!rockAt && tree[c] === F.TR.ROCK && F.map.sid[c] < 0) rockAt = [x, y];
}
check('no well on a tree', /tree/.test(F.whyNot('well', treeAt[0], treeAt[1] - 1) || ''), F.whyNot('well', treeAt[0], treeAt[1] - 1));
check('no well on a rock', /rock/.test(F.whyNot('well', rockAt[0], rockAt[1] - 1) || ''), F.whyNot('well', rockAt[0], rockAt[1] - 1));
F.clearAt(treeAt[0], treeAt[1]);
check('clearing a tree only marks it', tree[treeAt[1] * MW + treeAt[0]] === F.TR.TREE && F.mark[treeAt[1] * MW + treeAt[0]] === 1);
F.clearAt(treeAt[0], treeAt[1]);
check('and again unmarks it', F.mark[treeAt[1] * MW + treeAt[0]] === 0);

// every workplace, placed and finished
const placed = {};
for (const type of ['smith', 'sheep', 'barber', 'tailor', 'coop', 'forester', 'quarry', 'bakery', 'tavern', 'cows', 'wood']) {
  const p = spot(type);
  const b = p && F.place(type, p[0], p[1]);
  if (!b || typeof b === 'string') { check('place ' + type, false, b || 'no room'); continue; }
  F.finishBuilding(b, true);
  placed[type] = b;
}
check('every workplace found room', Object.keys(placed).length === 11, Object.keys(placed).join(','));
check('stone was spent on stone walls', S.store.stone === 100 - 6 - 4 - 4, 'stone ' + S.store.stone);

// turned round: the entrance is on the side asked for, and that is where it is used from
const turned = {};
for (let t = 1; t < 4; t++) {
  const p = spot('house', t);
  const b = p && F.place('house', p[0], p[1], t);
  if (!b || typeof b === 'string') { check('a house turned ' + F.SIDES[t], false, b || 'no room'); continue; }
  F.finishBuilding(b, true);
  const en = F.entry(b);
  const side = en.y === b.y - 1 ? 'north' : en.x === b.x - 1 ? 'west' : en.x === b.x + b.w ? 'east' : 'south';
  turned[t] = side;
}
check('entrances turn round the building', turned[1] === 'west' && turned[2] === 'north' && turned[3] === 'east', JSON.stringify(turned));
const fp = spot('field', 1), field = fp && F.place('field', fp[0], fp[1], 1);
check('a turned field is turned', field && field.w === 4 && field.h === 5, field && field.w + 'x' + field.h);
// every door reachable from the road
const seen = F.flood();
const cutOff = F.B.filter((b) => b && !seen[F.entry(b).y * F.MW + F.entry(b).x]).map((b) => b.type);
check('every door can be reached', cutOff.length === 0, cutOff.join(','));

// room enough for more people: beds, water
for (let i = 0; i < 4; i++) { const p = spot('house'); F.finishBuilding(F.place('house', p[0], p[1]), true); }
const wp = spot('well'); F.finishBuilding(F.place('well', wp[0], wp[1]), true);
S.store.bread = 40;   // twelve mouths: this case is about the beds, not the harvest

// a house, on top of whoever is standing there, raised by whoever is idle
const hp = spot('house');
const hester = F.V.find((v) => v.name === 'Hester');
hester.x = hp[0] + 1.5; hester.y = hp[1] + 1.5; hester.path = null; hester.act = null;
const house = F.place('house', hp[0], hp[1]);
check('a house can go down on someone', typeof house !== 'string', typeof house === 'string' ? house : '');
check('and they step out of the way', F.walkable(Math.floor(hester.y) * MW + Math.floor(hester.x)), 'at ' + hester.x.toFixed(1) + ',' + hester.y.toFixed(1));
check('Hester is out of work', hester.job < 0);
let hrs = 0;
while (!house.built && hrs < 30) { F.hours(1); hrs++; }
check('the jobless raise a house', house.built, 'in ' + hrs + ' village hours, ' + house.work.toFixed(1) + '/' + house.need);
// a spare bed and a happy village: someone new in the morning
const pop0 = F.V.length;
while (S.t > 6.5 || S.t < 5.9) F.hours(0.5);
F.hours(1);
const fresh = F.V.slice(pop0);
check('a newcomer comes down the road', fresh.length >= 1 && fresh.length <= 2, (F.V.length - pop0) + ' new, ' + F.V.length + ' villagers, ' + F.beds() + ' beds, water for ' + F.waterFor() + ', food ' + F.foodInStore() + ', wants ' + JSON.stringify(F.wants(1)));
if (fresh.length) {
  const nv = fresh[0];
  check('and arrives with no job', nv.job < 0);
  F.assignJob(nv, placed.coop);
  check('and can be hired', nv.job === placed.coop.id && placed.coop.workers.includes(nv.id));
  F.hours(3);
  check('and walks in to settle', nv.x < F.MW - 3, 'at ' + nv.x.toFixed(1) + ',' + nv.y.toFixed(1));
}
return JSON.stringify({ pass: checks.every(Boolean), detail: notes.filter((s) => s.includes('FAILED')).join(' | ') + ' || ' + notes.join(' | ') });
