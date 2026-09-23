/* The ducts at the foot of each wall are the only way through, and they only work if the
   game agrees with itself about who fits: you on your belly, yes; you on your feet, no;
   a guard, never.

   The guard half is the one that rots quietly. The collision the guards walk with is not
   the collision the player walks with, and the first version of this game checked theirs
   against a plain "is it a wall" test — which a duct is not. Guards strolled through the
   perimeter wall while patrolling perfectly sensibly, and nothing on screen said so.

   So: walk at the wall standing and expect to be stopped, crawl at it and expect to be
   through, then raise the alarm from the wrong side and let every guard in the compound
   spend half a minute trying to reach you. */
const B = window.__blackout;
const WALL_X = 26;
const notes = [];
const checks = [];
const check = (name, got) => { checks.push(got); notes.push(name + ' ' + (got ? 'ok' : 'FAILED')); };
const release = () => ['left', 'right', 'up', 'down', 'run', 'action', 'fire'].forEach((k) => B.hold(k, false));

// --- on your feet, the wall is a wall
B.newGame();
B.start();
B.guards.forEach((g) => { g.down = true; });      // nobody to interrupt the experiment
B.teleport(24, 15);
B.hold('right', true);
B.tick(1 / 60, 240);                              // four seconds of walking into it
const standingX = B.player.x;
release();
check('standing is stopped by the wall', standingX < WALL_X);

// --- on your belly, it is a door
B.newGame();
B.start();
B.guards.forEach((g) => { g.down = true; });
B.teleport(24, 15);
B.hold('down', true);
B.hold('right', true);
let crawlMarks = 0;
for (let i = 0; i < 420; i++) {                   // crouching is slow
  B.tick(1 / 60, 1);
  crawlMarks = Math.max(crawlMarks, B.state.steps.length);
}
const crawlX = B.player.x;
const crouched = B.player.crouch;
release();
check('crouching gets you through', crawlX > WALL_X + 1);
check('and you are still crouched', crouched);
check('and silent: no footstep marks', crawlMarks === 0);

// --- the footstep marks have to tell the truth: a run past a guard shows as heard,
// and a walk well away from everyone does not
B.newGame();
B.start();
B.guards.forEach((g) => { g.x = -20; });
B.teleport(4, 15);
B.hold('right', true);
let walkHeard = false, walkMarks = 0;
for (let i = 0; i < 90; i++) {
  B.tick(1 / 60, 1);
  for (const s of B.state.steps) { walkMarks++; if (s.heard) walkHeard = true; }
}
release();
check('a walk leaves a mark', walkMarks > 0);
check('unheard when nobody is near', !walkHeard);

B.newGame();
B.start();
B.teleport(8, 15);                                // the wire guard starts at 14
B.hold('right', true);
B.hold('run', true);
let runHeard = false;
for (let i = 0; i < 60 && !runHeard; i++) {
  B.tick(1 / 60, 1);
  for (const s of B.state.steps) if (s.run && s.heard) runHeard = true;
}
release();
check('a run near a guard shows as heard', runHeard);

// --- the guards cannot follow
B.newGame();
B.start();
B.teleport(6, 15);                                // stand outside and make a noise
B.alarm();
const inside = B.guards.filter((g) => g.x > WALL_X);
let leaked = null;
for (let i = 0; i < 1800; i++) {                  // thirty seconds of them hunting you
  B.tick(1 / 60, 1);
  for (const g of inside) if (!g.down && g.x < WALL_X && leaked === null) leaked = g.id + ' at ' + g.x.toFixed(1);
}
release();
check('no guard crawls out after you', leaked === null);

const closest = Math.min.apply(null, inside.map((g) => g.x));
const pass = checks.every(Boolean);
return JSON.stringify({
  pass,
  detail: notes.join(' | ') + ' | standing reached ' + standingX.toFixed(2)
    + ', crawling reached ' + crawlX.toFixed(2)
    + ', nearest guard held at ' + closest.toFixed(2) + (leaked ? ' (leaked: ' + leaked + ')' : ''),
});
