/* Does the compound wake up, and does it then do anything?

   A body in a guard's light is supposed to be an alarm. The alarm is supposed to turn
   every guard into a hunter, bring more men through the gate, and hunters are supposed
   to shoot. The checkpoint at the terminal is supposed to put you back with the data.
   Every one of those is state on a flag that nothing on screen insists on: a hunt with
   no reinforcements, or hunters who never fire, looks just like a quiet night. */
const B = window.__blackout;
const C = B.consts;
const notes = [];
let pass = true;
const check = (name, ok, extra) => { if (!ok) pass = false; notes.push(name + (ok ? ' ok' : ' FAILED') + (extra ? ' (' + extra + ')' : '')); };

// a body left in front of a guard
let S = B.newGame('normal');
B.start();
S.cams.forEach((c) => { c.alive = false; });
const watcher = S.guards.find((g) => g.card);          // 4,13 facing east
const victim = S.guards.find((g) => !g.card && !g.sentry && g.lv === 0);
victim.down = true; victim.dead = true; victim.mode = 'down';
victim.x = watcher.x + 2; victim.y = watcher.y; victim.lv = 0;
B.teleport(3, 20, 0);
B.wait(); B.flush();
check('a guard who finds a dead man raises the alarm', S.alarm);
check('every guard on his feet is hunting', S.guards.filter((g) => !g.down && !g.sentry).every((g) => g.mode === 'hunt' || g.mode === 'search'));

// reinforcements through the gate
const before = S.guards.length;
S.hp = 99;   // this part is about the gate, not about surviving the hunt
for (let i = 0; i < 14; i++) { B.wait(); B.flush(); if (S.mode !== 'play') break; }
const came = S.guards.length - before;
check('more guards came through the gate', came === 2, came + ' came, mode ' + S.mode + ', hp ' + S.hp);

// a hunter who can see you fires
S = B.newGame('normal');
B.start();
S.cams.forEach((c) => { c.alive = false; });
const hunter = S.guards.find((g) => g.card);
S.guards.forEach((g) => { if (g !== hunter) { g.x = 1; g.y = 1; g.lv = 1; } });
S.alarm = true; S.reinforceLeft = 0;
hunter.mode = 'hunt';
B.teleport(hunter.x + 3, hunter.y, 0);        // in his torch, three tiles in front
const hp = S.hp;
B.wait(); B.flush();
check('a hunter who sees you takes aim first', hunter.aiming && S.hp === hp, 'hp ' + S.hp);
B.wait(); B.flush();
check('and fires if you are still there', S.hp < hp, 'hp ' + hp + ' -> ' + S.hp);

// break his line in between and he lowers it
S = B.newGame('normal');
B.start();
S.cams.forEach((c) => { c.alive = false; });
const h2 = S.guards.find((g) => g.card);
S.guards.forEach((g) => { if (g !== h2) { g.x = 1; g.y = 1; g.lv = 1; } });
S.alarm = true; S.reinforceLeft = 0;
h2.mode = 'hunt'; h2.route = null;
B.teleport(h2.x + 3, h2.y, 0);
B.wait(); B.flush();
const aimed = h2.aiming;
S.lastKnown = null;
B.teleport(h2.x, h2.y + 6, 0);                // well out of his cone
B.wait(); B.flush();
check('out of his line he does not fire', aimed && S.hp === 2, 'aimed ' + aimed + ', hp ' + S.hp);

// the checkpoint
S = B.newGame('normal');
B.start();
S.cams.forEach((c) => { c.alive = false; });
S.guards.forEach((g) => { g.x = 1; g.y = 1; g.lv = 1; });
S.hasCard = true; S.doorOpened = true; S.phase = 'terminal';
B.teleport(25, 4, 1);
B.use();
for (let i = 0; i < 3 && S.mode === 'hack'; i++) { S.hack.pos = S.hack.zoneAt + S.hack.zone / 2; B.hackPress(); }
check('the hack lands', S.dataDone && !!S.checkpoint);
S.hp = 1;
const shooter = S.guards[0];
shooter.x = 25; shooter.y = 7; shooter.lv = 1; shooter.face = 3; shooter.mode = 'hunt'; shooter.down = false;
S.reinforceLeft = 0;
B.teleport(25, 5, 1);
B.wait(); B.flush();
B.wait(); B.flush();
check('shot on the way out', S.mode === 'over', 'mode ' + S.mode + ', hp ' + S.hp);
B.restoreCheckpoint();
check('Z puts you back at the terminal with the data', S.mode === 'play' && S.dataDone && S.player.x === 25 && S.player.y === 4 && S.player.lv === 1,
  S.player.x + ',' + S.player.y + ',' + S.player.lv);
document.getElementById('end').hidden = true;

return JSON.stringify({ pass, detail: notes.join('; ') });
