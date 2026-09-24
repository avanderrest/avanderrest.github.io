/* Save and load. A day and a half of village, some of it built by hand, then saved,
   thrown away for a fresh valley and loaded back. The thing that goes wrong silently is
   a field, a pen or a half-built site coming back with its footprint missing from the
   map — it draws, but people walk through it and nobody works it. */
const F = window.furrow;
F.seed(21);
F.newGame(777);
F.quickStart();
const S = F.S;
const notes = [], checks = [];
const check = (name, ok, extra) => { checks.push(ok); notes.push(name + (ok ? ' ok' : ' FAILED') + (extra ? ' (' + extra + ')' : '')); };
S.renown = 5; S.coins = 300; S.store.logs = 60;
let coop = null, site = null;
for (let y = 8; y < 34 && !coop; y++) for (let x = 8; x < 44 && !coop; x++) if (!F.whyNot('coop', x, y)) { coop = F.place('coop', x, y); F.finishBuilding(coop, true); }
for (let y = 8; y < 34 && !site; y++) for (let x = 8; x < 44 && !site; x++) if (!F.whyNot('house', x, y)) site = F.place('house', x, y);
F.hours(30);
const nell = F.V.find((v) => v.name === 'Nell');
F.liveAs(nell);
const snap = () => JSON.stringify({
  day: S.day, coins: S.coins, renown: S.renown, store: S.store,
  B: F.B.map((b) => b && [b.type, b.x, b.y, b.built, Math.round(b.work), b.workers.join('.'), b.cells && b.cells.map((c) => c.st).join(''), b.animals.length]),
  V: F.V.map((v) => [v.name, v.job, v.home, Math.round(v.x * 10), Math.round(v.y * 10), v.purse, v.look.style]),
  sid: Array.from(F.map.sid).join(','), tree: Array.from(F.map.tree).join(''), me: S.me && S.me.name,
});
F.save();
const a = snap();
const saved = F.loadSave();
F.newGame(12345);
const other = snap();
check('a new valley is different', other !== a);
F.restore(saved);
const b = snap();
check('loaded back exactly', a === b, a.length + ' vs ' + b.length + ' chars');
check('still living as Nell', S.mode === 'live' && S.me && S.me.name === 'Nell');
const s2 = F.B.find((x) => x && x.type === 'house' && x.x === site.x && x.y === site.y);
check('the site is still standing in the way', s2 && !F.walkable(s2.y * F.MW + s2.x), s2 ? 'site at ' + s2.x + ',' + s2.y + ' built ' + s2.built : 'missing');
F.hours(6);
check('and the village carries on', S.day >= 2 && S.t > 12 && F.V.every((v) => v.hunger > 0), 'day ' + S.day);
F.stepBack();
return JSON.stringify({ pass: checks.every(Boolean), detail: notes.filter((s) => s.includes('FAILED')).join(' | ') + ' || ' + notes.join(' | ') });
