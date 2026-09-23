/* Under the alarm the game is still about the dark.

   The alarm used to turn every guard "alert", and an alert guard fired whenever he had a
   straight line to you inside nine tiles, with no question of whether he could see you.
   So the walk back out after the download was a shooting gallery: stand anywhere in sight
   of a guard, in the blackest corner of the yard, and he opened up. It played as "they
   spot you instantly and it cannot be done", and nothing in the code looked wrong — the
   guards were doing exactly what "alert" said.

   Now the alarm starts a search. What this pins down:
     - after the download nobody is shooting yet: they are all looking;
     - a searching guard with a clear line to you in the dark, outside his torch, never
       makes you out and never fires;
     - stand in lamplight in front of him and he does make you out, fast, and fires;
     - get back into the dark and he loses you, and goes back to searching. */
const B = window.__blackout;
const notes = [];
const checks = [];
const check = (name, got) => { checks.push(got); notes.push(name + ' ' + (got ? 'ok' : 'FAILED')); };

B.newGame();
B.start();
B.giveCard();
B.openDoor();
B.alarm();
check('the alarm starts a search, not a firefight',
  B.guards.filter((g) => !g.down).every((g) => g.state === 'search'));

// one searcher out in the yard, facing the duct you would come back through
const g = B.guards.find((q) => q.id === 'yard');
B.guards.forEach((q) => { if (q !== g) q.down = true; });
g.down = false;
const pin = () => { g.x = 34; g.y = 15; g.dir = -1; };
pin();
g.state = 'sweep';
g.timer = 99;                                     // stood still, looking your way
B.teleport(27.8, 15);                             // just inside the duct: dark, six tiles off
B.player.hp = 99;

let fired = 0, wentAlert = false;
for (let i = 0; i < 180; i++) {                  // three seconds, stood in plain line of him
  pin();
  B.tick(1 / 60, 1);
  fired += B.state.bullets.length;
  if (g.state === 'alert') wentAlert = true;
}
const darkLight = B.player.light;
check('in the dark he never makes you out', !wentAlert);
check('and never fires', fired === 0);

// now stand under the yard lamp, with him a few paces off facing you
const pinFacing = () => { g.x = 39; g.y = 15; g.dir = -1; };
B.teleport(36.2, 15);
let tSpotted = null;
for (let i = 0; i < 120 && tSpotted === null; i++) {
  pinFacing();
  B.tick(1 / 60, 1);
  if (g.state === 'alert') tSpotted = (i + 1) / 60;
}
let shot = false;
for (let i = 0; i < 120 && !shot; i++) {
  pinFacing();
  B.tick(1 / 60, 1);
  if (B.state.bullets.length) shot = true;
}
check('in the lamplight he makes you out, fast', tSpotted !== null && tSpotted < 1);
check('and fires', shot);

// and back into the dark, well away: he loses you and goes back to looking
B.teleport(27.8, 15);
B.state.bullets.length = 0;
let lostAfter = null;
for (let i = 0; i < 60 * 6 && lostAfter === null; i++) {
  g.x = 34; g.y = 15;                             // held in place, free to turn
  B.tick(1 / 60, 1);
  if (g.state !== 'alert') lostAfter = (i + 1) / 60;
}
check('in the dark again he loses you', lostAfter !== null);

const pass = checks.every(Boolean);
return JSON.stringify({
  pass,
  detail: notes.join(' | ') + ' | light in the dark ' + darkLight.toFixed(2)
    + ', spotted in the lamp after ' + (tSpotted === null ? 'never' : tSpotted.toFixed(2) + 's')
    + ', lost after ' + (lostAfter === null ? 'never' : lostAfter.toFixed(1) + 's'),
});
