/* Can the job actually be finished?

   Every other case here checks one rule. This one checks that the rules add up to a
   mission: take the card off a guard, open the door with it, hack the terminal, and be
   credited with getting out. The chain runs through four different bits of state — the
   phase machine, the keycard flag, the door, the download — and any one of them can stop
   advancing without anything looking wrong, because each screen still draws.

   The two places it has been wrong before: the download is supposed to trip the alarm
   itself, and a run where nothing else tripped it is the clean one. Get that backwards and
   a perfect run is scored as a botched one. */
const B = window.__blackout;
const C = B.consts;
const notes = [];
const checks = [];
const check = (name, got) => { checks.push(got); notes.push(name + ' ' + (got ? 'ok' : 'FAILED')); };

B.newGame();
B.start();
B.guards.forEach((g) => { g.down = true; });      // the fight is not what is under test
check('starts on the wire', B.state.phase === 'infiltrate');

// inside the wire
B.teleport(30, 15);
B.tick(1 / 60, 2);
check('inside turns the objective over', B.state.phase === 'keycard');

// take the card off the guard who is carrying it
const carrier = B.guards.find((g) => g.card);
check('somebody is carrying a card', !!carrier);
B.teleport(carrier.x, carrier.y);
B.tick(1 / 60, 3);
check('stepping over him takes it', B.state.hasCard === true);
check('and the objective is the door', B.state.phase === 'door');

// open it
B.teleport(C.DOOR_X + 1.6, 15);
B.tap('action');
B.tick(1 / 60, 2);
check('the card opens the door', B.state.doorOpen === true);
check('and the objective is the terminal', B.state.phase === 'terminal');

// upstairs to the terminal
B.teleport(C.TERMINAL.x, C.TERMINAL.y);
B.tap('action');
B.tick(1 / 60, 2);
check('the terminal opens the bypass', B.state.mode === 'hack');

// A miss on the bypass never loses it, and says so on the terminal screen itself —
// the ticker it used to go to is behind the terminal, so a miss looked like nothing.
B.state.hack.pos = B.state.hack.zoneAt > 0.5 ? 0.02 : 0.98;
B.tap('action');
B.tick(1 / 60, 1);
check('a missed key is shown on the terminal', B.state.mode === 'hack' && B.state.hack.missed > 0);
check('and loses nothing', B.state.hack.round === 0);

// Stop it in the green three times. On normal the last key has to leave a window a
// person can hit: as first tuned it was 0.08s, which is a reflex test.
const bypassWindow = () => B.state.hack.zone / B.state.hack.speed;
let rounds = 0, lastWindow = 0;
for (let i = 0; i < 12 && B.state.mode === 'hack'; i++) {
  const h = B.state.hack;
  if (h.round === 2) lastWindow = bypassWindow();
  h.pos = h.zoneAt + h.zone / 2;                  // stop the marker dead in the green
  B.tap('action');
  B.tick(1 / 60, 1);
  rounds++;
}
check('on normal the last key gives a quarter second', lastWindow >= 0.25);
check('three good keys finish it', B.state.dataDone === true);
check('and it takes three', rounds === 3);
check('back to the game', B.state.mode === 'play');
check('the download trips the alarm', B.state.alarm === true);
check('which does not count against you', B.state.alarmEarly === false);
check('and the objective is the way out', B.state.phase === 'escape');
// The last word on screen has to be where to go. It used to be the alarm's, landing the
// same instant as "get out" and replacing it, and with the upstairs guard dealt with
// nothing came next: it looked as if the game had stopped at the terminal.
check('the last word is where to go', /FENCE/.test(B.state.msg) && B.state.banner && /FENCE/.test(B.state.banner.lines.join(' ')));

// Die on the way out and the terminal is a checkpoint: the data, the alarm, the way out.
check('the download is a checkpoint', !!B.state.checkpoint);
B.teleport(60.5, 15);
B.player.hp = 1;
B.state.bullets.push({ x: B.player.x + B.player.w / 2, y: B.player.y + 0.5, vx: 1, life: 1 });
B.tick(1 / 60, 2);
const diedOnTheWayOut = B.state.mode === 'dead';
B.tap('action');
B.tick(1 / 60, 1);
check('dying on the way out', diedOnTheWayOut);
check('Z puts you back at the terminal',
  B.state.mode === 'play' && B.state.dataDone && B.state.phase === 'escape'
  && Math.abs(B.player.x + B.player.w / 2 - C.TERMINAL.x) < 1.5 && B.player.hp === 2);
check('with the alarm still up, and a retry counted', B.state.alarm && B.state.retries === 1);

// out through the fence
B.guards.forEach((g) => { g.down = true; });      // the reinforcements the alarm called
B.teleport(C.EXTRACT_X - 1, 15);
B.tick(1 / 60, 2);
check('reaching the fence ends it', B.state.mode === 'win');
check('credited as extracted', B.state.ending === 'EXTRACTED');

// hard keeps the old, tight bypass
B.setDifficulty('hard');
B.newGame();
B.start();
B.openDoor();
B.guards.forEach((g) => { g.down = true; });
B.teleport(C.TERMINAL.x, C.TERMINAL.y);
B.tap('action');
B.tick(1 / 60, 1);
for (let i = 0; i < 2; i++) {
  const h = B.state.hack;
  h.pos = h.zoneAt + h.zone / 2;
  B.tap('action');
  B.tick(1 / 60, 1);
}
const hardWindow = bypassWindow();
B.setDifficulty('normal');
check('hard keeps it tight', hardWindow < 0.12);

// and a run where something else went wrong is not clean
B.newGame();
B.start();
B.alarm();
check('an alarm before the download does count', B.state.alarmEarly === true);

// Rounds are the difficulty. Normal has to carry enough for every lamp and camera in
// the compound, or "enough to get through" is not true; hard is five.
B.setDifficulty('hard');
B.newGame();
const hardRounds = B.player.ammo;
B.setDifficulty('normal');
B.newGame();
const normalRounds = B.player.ammo;
const everything = B.state.lamps.length + B.state.cameras.length;
check('hard carries five', hardRounds === 5);
check('normal carries enough for every lamp and camera', normalRounds >= everything);
// switching on the title screen reloads the pistol before the round starts
B.setDifficulty('hard');
const reloaded = B.player.ammo;
B.setDifficulty('normal');
check('choosing on the title screen reloads', reloaded === 5 && B.player.ammo === normalRounds);

const pass = checks.every(Boolean);
return JSON.stringify({
  pass,
  detail: notes.join(' | ') + ' | bypass rounds ' + rounds + ', last-key window '
    + lastWindow.toFixed(2) + 's normal, ' + hardWindow.toFixed(2) + 's hard',
});
