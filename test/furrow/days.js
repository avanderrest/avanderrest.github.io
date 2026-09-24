/* The village left to itself. Four days with nobody at the controls: the farmers have to
   sow, water and harvest (a dry field never grows, so a farmer who cannot reach water
   leaves the village eating nothing), the woodcutter has to fell and carry, and everyone
   has to find their way to breakfast, lunch, supper and bed.

   It breaks silently if a job loop stalls — people still wander about and it all looks
   alive — so the assertions are on what reached the barn and on everyone still being fed. */
const F = window.furrow;
F.seed(7);
F.newGame(4242);
F.quickStart();                                  // a small working village, raised at once
const S = F.S;
const notes = [], checks = [];
const check = (name, ok, extra) => { checks.push(ok); notes.push(name + (ok ? ' ok' : ' FAILED') + (extra ? ' (' + extra + ')' : '')); };

const logs0 = S.store.logs || 0;
const field = F.B.find((b) => b && b.type === 'field');
let harvested = 0, sown = 0, minHunger = 100, asleepAtNight = 0, nightChecks = 0;
const moved = new Map(F.V.map((v) => [v.id, 0]));
const last = new Map(F.V.map((v) => [v.id, { x: v.x, y: v.y }]));
let lastSt = field.cells.map((c) => c.st);
for (let h = 0; h < 24 * 4; h++) {
  F.hours(1);
  field.cells.forEach((c, i) => { if (lastSt[i] === 3 && c.st === -1) harvested++; if (lastSt[i] === -1 && c.st === 0) sown++; });
  lastSt = field.cells.map((c) => c.st);
  for (const v of F.V) {
    minHunger = Math.min(minHunger, v.hunger);
    const l = last.get(v.id);
    if (l) { moved.set(v.id, (moved.get(v.id) || 0) + Math.hypot(v.x - l.x, v.y - l.y)); l.x = v.x; l.y = v.y; }
  }
  if (S.t > 23.2 || S.t < 4) { nightChecks++; asleepAtNight += F.V.every((v) => v.asleep) ? 1 : 0; }
}
check('the day count moved on', S.day === 5, 'day ' + S.day);
check('the field was sown', sown >= 10, sown + ' sown');
check('and harvested', harvested >= 5, harvested + ' harvested');
check('logs reached the barn', (S.store.logs || 0) > logs0 + 6, logs0 + ' → ' + (S.store.logs || 0));
check('nobody starved', minHunger > 5, 'lowest hunger ' + minHunger.toFixed(0));
check('everyone got about', [...moved.values()].every((d) => d > 40), [...moved.entries()].map(([id, d]) => F.V.find((v) => v.id === id).name + ' ' + d.toFixed(0)).join(', '));
check('everyone abed in the small hours', asleepAtNight >= nightChecks - 1, asleepAtNight + '/' + nightChecks);
const food = F.foodInStore();
check('food left in the barn', food > 0, food + ' food, ' + JSON.stringify(S.store));
return JSON.stringify({
  pass: checks.every(Boolean),
  detail: notes.join(' | ') + ' | pop ' + F.V.length + ', moods ' + F.V.map((v) => v.name + ' ' + v.mood.toFixed(0)).join(' '),
});
