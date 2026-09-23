/* Every guard has to walk the beat he was given, and a guard who has seen you has to be
   able to come and get you.

   Both failed silently in the same way. A guard turns round when something is in his
   path, which is right for a wall and wrong for a crate somebody put down in the middle of
   his beat. The keycard guard was written to walk 28 to 42 and in fact walked 33.4 to 36.6
   — three tiles, boxed in between two crates and directly under the camera, so he was
   always either turning or about to. It played as "he turns round the instant I get over
   the boxes", and nothing in the code said anything was wrong. Two more beats upstairs and
   in the hall were cut short the same way.

   The chase is the other half of it: a guard who could not step up a crate stopped dead
   behind one and stood there for the rest of the game.

   So: let every guard patrol for a minute and require each to cover nearly all of his
   declared beat; then raise the alarm with the player on the far side of the yard's crates
   and require the guard to get over them. */
const B = window.__blackout;
const notes = [];
const checks = [];
const check = (name, got) => { checks.push(got); notes.push(name + ' ' + (got ? 'ok' : 'FAILED')); };

// --- beats. The player waits off at the extraction end where nobody can see him.
B.newGame();
B.start();
B.teleport(3, 15);
const span = {};
for (const g of B.guards) span[g.id] = [g.x, g.x];
for (let i = 0; i < 60 * 60; i++) {
  B.tick(1 / 60, 1);
  for (const g of B.guards) {
    const s = span[g.id];
    s[0] = Math.min(s[0], g.x);
    s[1] = Math.max(s[1], g.x);
  }
}
for (const g of B.guards) {
  const walked = span[g.id][1] - span[g.id][0];
  const declared = g.max - g.min;
  const share = walked / declared;
  check(g.id + ' walks ' + Math.round(share * 100) + '% of ' + g.min + '-' + g.max, share >= 0.85);
}

// --- the chase: player beyond the crates, alarm up, the yard guard has to reach him
B.newGame();
B.start();
const yard = B.guards.find((g) => g.card);
B.guards.forEach((g) => { if (g !== yard) g.down = true; });
B.teleport(27.5, 15);
B.player.hp = 99;                                    // the test is his route, not our survival
B.alarm();
B.guards.filter((g) => g.id === 'reinf').forEach((g) => { g.down = true; });
let closest = Infinity;
for (let i = 0; i < 60 * 12; i++) {
  B.tick(1 / 60, 1);
  closest = Math.min(closest, Math.abs(yard.x - (B.player.x + B.player.w / 2)));
}
check('the yard guard gets over the crates to you', closest < 3.5);

const pass = checks.every(Boolean);
return JSON.stringify({
  pass,
  detail: notes.join(' | ') + ' | chase got within ' + closest.toFixed(1),
});
