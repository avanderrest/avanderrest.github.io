/* The guards outside: they see along their ledge, not through it.

   The whole outdoor stealth rests on one rule — a guard sees only along his own row — so
   hanging under his cornice is safe and standing in front of him is not. If the row test
   is off by one (hands in one row, feet in the next) either every hang gets you caught or
   nobody ever sees you, and both look fine until you play.

   - standing on his ledge in front of him, within his sight, gets you spotted;
   - hanging from the ledge he walks on, he patrols right over you and never notices;
   - standing in the dark alcove, he walks past;
   - from behind, E chokes him out; hanging below him, Q pulls him off and he dies. */
const G = window.__tithe;
const notes = [];
let pass = true;
const check = (name, ok, extra) => { notes.push(name + (ok ? ' ok' : ' FAILED') + (extra ? ' (' + extra + ')' : '')); if (!ok) pass = false; };
const fresh = () => { localStorage.clear(); G.newGame(); G.hideCard(); G.startLevel(0); return G.guards[0]; };

// 1. in front of him
let g = fresh();
g.x = 20; g.f = 1; g.min = 16; g.max = 27; g.pause = 0;
G.teleport(24, 9, -1);
let t = 0;
while (t < 4 && g.state !== 'alert') { G.tick(0.1); t += 0.1; }
check('standing in his sight line he spots you', g.state === 'alert', 'after ' + t.toFixed(1) + 's');

// 2. hanging below his ledge while he walks the length of it
g = fresh();
g.x = 16; g.f = 1; g.pause = 0;
G.teleport(22, 9, 1);
G.act('down'); G.tick(0.6);
const hanging = G.player.m === 'h' && G.player.y === 10;
let maxSus = 0, crossed = false;
for (let i = 0; i < 120; i++) { G.tick(0.1); maxSus = Math.max(maxSus, g.sus); if (g.x > 22.5) crossed = true; }
check('hanging under his cornice he walks over you unseen', hanging && crossed && g.state !== 'alert' && maxSus < 0.05, 'max suspicion ' + maxSus.toFixed(2) + ', crossed ' + crossed);

// 3. the alcove
g = fresh();
g.x = 18; g.f = 1; g.pause = 0;
G.teleport(23, 9, 1); // the S cell
let alcoveSus = 0, passed = false;
for (let i = 0; i < 80; i++) { G.tick(0.1); alcoveSus = Math.max(alcoveSus, g.sus); if (g.x > 24) passed = true; }
check('in the alcove he walks past', passed && g.state !== 'alert', 'max suspicion ' + alcoveSus.toFixed(2));

// 4. choke from behind
g = fresh();
g.x = 21; g.f = 1; g.pause = 5;
G.teleport(20, 9, 1);
const choked = G.takedown(false);
check('E from behind chokes him out', choked && g.state === 'ko', g.state);

// 5. pulled off the ledge (only with a knife: she has to have chosen to carry one)
g = fresh();
G.S.run.knife = true;
g.x = 22; g.f = -1; g.pause = 5;
G.teleport(22, 9, 1);
G.act('down'); G.tick(0.6);
const pulled = G.takedown(true);
G.tick(2);
check('Q from below pulls him off, and he dies', pulled && g.state === 'dead' && g.y > 9, g.state + ' at row ' + g.y);

return JSON.stringify({ pass, detail: notes.join('; ') });
