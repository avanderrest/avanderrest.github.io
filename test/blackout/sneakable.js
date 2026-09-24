/* Is there anywhere to hide?

   A stealth level can be perfectly built, perfectly lit and completely unplayable, and it
   is invisible in a screenshot because a screenshot of a lit compound looks great. The
   first pass of this one was exactly that: the lamps were spaced nine tiles apart with
   pools ten tiles wide, so at floor level there was a strip of dark about one tile across
   between them. Nowhere to stand, nowhere to wait for a patrol to turn, and the whole game
   became a matter of walking into a torch and hoping.

   What is actually being asked here is about floor level, because that is the only height
   anybody walks at. A lamp hung 2.8 tiles up throws a much narrower pool on the ground than
   its radius suggests, and that arithmetic is the thing that goes wrong.

   Two properties:
     - no lit stretch is longer than a player can cross in the gap a guard's pause gives
       them, and
     - there is a real amount of dark, in pieces big enough to stand still in. */
const B = window.__blackout;
const C = B.consts;
B.newGame();

const DARK = C.DARK_ENOUGH;
const STEP = 0.25;
const SNEAK = 3.4;                      // tiles per second, walking quietly
const MAX_CROSS = 2.1;                  // seconds you can expect to be unobserved
const MAX_LIT = SNEAK * MAX_CROSS;      // so: the longest lit run we will accept

// the three stretches of floor the route actually runs along
const LEGS = [
  { name: 'approach', y: 13.9, x0: 5, x1: 43.5 },
  { name: 'ground floor', y: 13.9, x0: 45.5, x1: 89 },
  { name: 'upper floor', y: 8.9, x0: 45.5, x1: 89 },
];

const report = [];
const checks = [];
let worstLit = 0, worstLitWhere = '';

for (const leg of LEGS) {
  let run = 0, longestLit = 0, litAt = 0;
  let darkCells = 0, total = 0;
  const darkRuns = [];
  let darkRun = 0;
  for (let x = leg.x0; x <= leg.x1; x += STEP) {
    total++;
    const lit = B.lightAt(x, leg.y) >= DARK;
    if (lit) {
      run += STEP;
      if (run > longestLit) { longestLit = run; litAt = x; }
      if (darkRun > 0) { darkRuns.push(darkRun); darkRun = 0; }
    } else {
      darkCells++;
      run = 0;
      darkRun += STEP;
    }
  }
  if (darkRun > 0) darkRuns.push(darkRun);

  const standable = darkRuns.filter((d) => d >= 2.5).length;   // big enough to wait in
  const darkShare = darkCells / total;
  if (longestLit > worstLit) { worstLit = longestLit; worstLitWhere = leg.name + ' near x=' + litAt.toFixed(1); }

  checks.push(longestLit <= MAX_LIT);
  checks.push(darkShare >= 0.3);
  checks.push(standable >= 2);
  report.push(leg.name + ': longest lit ' + longestLit.toFixed(1)
    + ', dark ' + Math.round(darkShare * 100) + '%'
    + ', ' + standable + ' pockets >=2.5');
}

// and the three places the route has to pass through want to be dark: the duct
// at the foot of the wall, the foot of the ladder, and the service door
const spots = [
  { name: 'the duct', x: 26.5, y: 14.4 },
  { name: 'the ladder foot', x: 60.5, y: 13.9 },
  { name: 'the service door', x: 44.5, y: 13.9 },
];
for (const s of spots) {
  const l = B.lightAt(s.x, s.y);
  checks.push(l < DARK);
  report.push(s.name + ' ' + l.toFixed(2) + (l < DARK ? ' dark' : ' LIT'));
}

const pass = checks.every(Boolean);
return JSON.stringify({
  pass,
  detail: report.join(' | ') + ' | limit ' + MAX_LIT.toFixed(1)
    + ', worst ' + worstLit.toFixed(1) + ' on the ' + worstLitWhere,
});
