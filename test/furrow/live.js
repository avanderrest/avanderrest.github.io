/* A day as Nell, through the keys. Everything you do while living as someone goes through
   the same prompt the villagers' own AI uses, so the failure this catches is the prompt
   offering nothing (or the wrong thing) where you stand — the day then cannot be played,
   though the village carries on looking perfectly busy around you.
   It walks with the real key handler, eats at home, waters from the well, works the field,
   carries to the barn, goes to bed, and checks each of those ticked the list and paid. */
const F = window.furrow;
F.seed(3);
F.newGame(4242);
F.quickStart();                                  // a small working village, raised at once
const S = F.S;
const notes = [], checks = [];
const check = (name, ok, extra) => { checks.push(ok); notes.push(name + (ok ? ' ok' : ' FAILED') + (extra ? ' (' + extra + ')' : '')); };
F.hours(23.2);                                   // day 2, 06:15
const nell = F.V.find((v) => v.name === 'Nell');
F.liveAs(nell);
const home = F.B[nell.home], field = F.B.find((b) => b && b.type === 'field'), well = F.B.find((b) => b && b.type === 'well'), barn = F.B.find((b) => b && b.type === 'barn');
const task = (k) => nell.tasks.find((t) => t.k === k);
// press E (or R) for the action whose label starts with `what`
function doIt(what) {
  const acts = F.actionsFor(nell);
  const i = acts.findIndex((a) => a.label.startsWith(what));
  if (i < 0 || i > 1) return 'not offered: ' + acts.map((a) => a.label).join('/');
  const k = i === 0 ? 'use' : 'alt';
  F.press(k); F.step(0.05); F.release(k);
  for (let n = 0; n < 400 && nell.act; n++) F.step(0.05);
  return null;
}
const at = (b) => { const e = F.entryC(b); F.teleport(nell, e.x, e.y); };

// walking, with the keys
const x0 = nell.x;
F.press('left'); F.step(0.1, 10); F.release('left');
const moved = Math.abs(nell.x - x0);
check('left moves you', moved > 0.8, moved.toFixed(2) + ' tiles');

const coins0 = S.coins, star0 = S.renown;
at(home);
let why = doIt('Eat at home');
check('breakfast at home', !why && task('meal').done, why || 'hunger ' + nell.hunger.toFixed(0));

// fill the can at the well, then tend eight cells
at(well);
nell.can = 0;
why = doIt('Fill the watering can');
check('the can fills at the well', !why && nell.can === 8, why || 'can ' + nell.can);
let jobs = 0, tries = 0;
for (let i = 0; i < field.cells.length && jobs < 8; i++) {
  const c = field.cells[i];
  F.teleport(nell, field.x + (i % field.w) + 0.5, field.y + Math.floor(i / field.w) + 0.5);
  if (nell.carry && nell.carry.n >= 3) { at(barn); doIt('Put'); F.teleport(nell, field.x + (i % field.w) + 0.5, field.y + Math.floor(i / field.w) + 0.5); }
  const acts = F.actionsFor(nell).map((a) => a.label);
  const want = acts.find((l) => /^(Sow|Water|Harvest)/.test(l));
  if (!want) continue;
  tries++;
  if (!doIt(want.split(' ')[0])) jobs++;
  if (nell.carry && nell.carry.n >= 3) { at(barn); doIt('Put'); }
  if (c.st === 0 || c.wet) { /* sown or watered */ }
}
const work = task('work');
check('eight jobs in the field', work.done, jobs + ' jobs of ' + tries + ' tried, task ' + work.have + '/' + work.need);
if (nell.carry) { at(barn); why = doIt('Put'); check('the harvest goes in the barn', !why && !nell.carry, why || ''); }
check('work paid the village', S.coins >= coins0 + 14 && S.renown >= star0 + 1, '+' + (S.coins - coins0) + ' coin, +' + (S.renown - star0) + ' renown');

// bed
F.setTime(21);
at(home);
why = doIt('Go to bed');
check('to bed before eleven', !why && nell.asleep && task('bed').done, why || '');
// the night passes for you
let n = 0;
while (nell.asleep && n < 4000) { F.step(0.2 * 36); n++; }
check('you wake in the morning', !nell.asleep && S.day === 3 && S.t < 8, 'day ' + S.day + ' ' + S.t.toFixed(2));
check('a fresh list for the new day', nell.taskDay === 3 && nell.tasks.every((t) => !t.done));

// step back: the AI carries on without you
F.stepBack();
const p0 = { x: nell.x, y: nell.y };
F.hours(2.5);
check('Nell carries on without you', Math.hypot(nell.x - p0.x, nell.y - p0.y) > 1 || nell.act, 'moved ' + Math.hypot(nell.x - p0.x, nell.y - p0.y).toFixed(1));
return JSON.stringify({ pass: checks.every(Boolean), detail: notes.filter((s) => s.includes('FAILED')).join(' | ') + ' || ' + notes.join(' | ') });
