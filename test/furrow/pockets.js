/* The criminal career. Nobody gets a job automatically, so a village that grows without
   anyone handing out work fills up with the idle, and the idle start lifting purses.
   Checked: left alone, a jobless villager does lift (and gets caught some of the time);
   three lifts make a thief; a job — given in build mode, or asked for at a door in live
   mode — puts them straight; and you, living as someone out of work, can lift a purse
   from behind with Q but are seen doing it from the front. */
const F = window.furrow;
F.seed(5);
F.newGame(4242);
F.quickStart();                                  // a small working village, raised at once
const S = F.S;
const notes = [], checks = [];
const check = (name, ok, extra) => { checks.push(ok); notes.push(name + (ok ? ' ok' : ' FAILED') + (extra ? ' (' + extra + ')' : '')); };
const hester = F.V.find((v) => v.name === 'Hester');
hester.idleDays = 2; hester.purse = 0;
for (const v of F.V) v.purse = Math.max(v.purse, 20);
let h = 0;
while (S.stats.lifts + hester.caughtN < 2 && h < 72) { F.hours(1); h++; hester.mood = Math.min(hester.mood, 45); }
check('an idle villager tries a purse', S.stats.lifts + hester.caughtN >= 1, S.stats.lifts + ' lifted, ' + hester.caughtN + ' caught, in ' + h + 'h');

// three clean lifts make a thief
const bram = F.V.find((v) => v.name === 'Bram');
const alone = () => { for (const v of F.V) if (v !== hester && v !== bram) { v.x = 2.5; v.y = 2.5; v.path = null; } };
hester.lifts = 0; hester.thief = false; hester.job = -1;
for (let i = 0; i < 3; i++) {
  alone();
  bram.x = 24.5; bram.y = 22.5; bram.ang = 0; bram.asleep = false; bram.inside = false; bram.purse = 10;   // facing east
  hester.x = 23.7; hester.y = 22.5;                                                                           // behind him
  F.lift(hester, bram);
}
check('three lifts make a thief', hester.thief && hester.lifts === 3, 'lifts ' + hester.lifts);
// somewhere with an opening
S.renown = 5; S.coins = 500; S.store.logs = 50;
let placed = null;
for (let y = 8; y < 34 && !placed; y++) for (let x = 6; x < 44 && !placed; x++) if (!F.whyNot('coop', x, y)) { placed = F.place('coop', x, y); F.finishBuilding(placed, true); }
F.assignJob(hester, placed);
check('a job puts a thief straight', !hester.thief && hester.job === placed.id);

// you, out of work: ask at a door, or lift a purse
F.assignJob(hester, null);
F.setTime(10);
F.liveAs(hester);
const e = F.entryC(placed);
F.teleport(hester, e.x, e.y);
const asks = F.actionsFor(hester).map((a) => a.label);
check('a door with an opening offers work', asks.includes('Ask for work here'), asks.join('/'));
alone();
bram.x = 24.5; bram.y = 22.5; bram.ang = 0; bram.purse = 10; bram.act = null;
F.teleport(hester, 23.7, 22.5);
hester.nextLift = 0;
const purse0 = hester.purse;
F.actionsFor(hester);
F.press('lift'); F.step(0.02); F.release('lift');
check('Q behind someone lifts their purse', hester.purse > purse0, purse0 + ' → ' + hester.purse);
// from the front he sees you
const star0 = S.renown;
bram.ang = Math.PI; bram.purse = 10;
hester.nextLift = 0;
let seen = 0;
for (let i = 0; i < 12; i++) { bram.ang = Math.PI; bram.act = null; bram.path = null; bram.x = 24.5; bram.y = 22.5; F.teleport(hester, 23.7, 22.5); hester.nextLift = 0; if (!F.lift(hester, bram)) seen++; }
check('from the front you get caught', seen >= 3 && S.renown < star0, seen + '/12 caught, renown ' + star0 + ' → ' + S.renown);
// and taking the job there
F.teleport(hester, e.x, e.y);
const acts = F.actionsFor(hester);
const i = acts.findIndex((a) => a.label === 'Ask for work here');
if (i === 0 || i === 1) { const k = i ? 'alt' : 'use'; F.press(k); F.step(0.05); F.release(k); for (let n = 0; n < 100 && hester.act; n++) F.step(0.05); }
check('asking at the door gets the job', hester.job === placed.id && !hester.thief, 'job ' + hester.job + ', offered at ' + i);
const liftT = hester.tasks.find((t) => t.k === 'lift');
check('the list swaps to the new work (unless the lifting was already done)', hester.tasks.some((t) => t.k === 'work' && t.verb === 'egg') || (liftT && liftT.done), hester.tasks.map((t) => t.label + (t.done ? '✓' : '')).join('/'));
F.stepBack();
return JSON.stringify({ pass: checks.every(Boolean), detail: notes.filter((s) => s.includes('FAILED')).join(' | ') + ' || ' + notes.join(' | ') });
