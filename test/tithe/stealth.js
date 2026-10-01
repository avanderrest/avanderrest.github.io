/* The guards outside: they see along their ledge, not through it.

   The whole outdoor stealth rests on one rule — a guard sees only along his own row — so
   hanging under the eave he walks is safe and standing in front of him is not. If the row
   test is off by one (hands in one row, feet in the next) either every hang gets you caught
   or nobody ever sees you, and both look fine until you play.

   Played on the abbey's long roof (house D, the eave at row 4), whose guard walks it:

   - standing on his eave in front of him, within his sight, gets you spotted;
   - hanging from the eave he walks on, he patrols right over you and never notices;
   - standing behind the chimney stack, he walks past;
   - from behind, E chokes him out; hanging below him, Q pulls him off and he dies. */
const G = window.__tithe;
const notes = [];
let pass = true;
const check = (name, ok, extra) => { notes.push(name + (ok ? ' ok' : ' FAILED') + (extra ? ' (' + extra + ')' : '')); if (!ok) pass = false; };
const fresh = () => {
  localStorage.clear(); G.newGame(); G.hideCard(); G.startLevel(0);
  const g = G.guards.find((q) => q.y === 3 && q.x > 32 && q.x < 44);
  G.guards.forEach((q) => { if (q !== g) q.state = 'ko'; });
  return g;
};
const chimney = (() => { const w = G.S.world || G.parseLevel(G.LEVELS[0]); for (let x = 32; x < 44; x++) if (w.deco[3][x] === 'S') return x; return -1; })();

// 1. in front of him
let g = fresh();
g.x = 37; g.f = 1; g.min = 32; g.max = 43; g.pause = 0;
G.teleport(41, 3, -1);
let t = 0;
while (t < 4 && g.state !== 'alert') { G.tick(0.1); t += 0.1; }
check('standing in his sight line he spots you', g.state === 'alert', 'after ' + t.toFixed(1) + 's');

// 2. hanging below his eave while he walks the length of it
g = fresh();
g.x = 34; g.f = 1; g.pause = 0;
G.teleport(40, 3, 1);
G.act('down'); G.tick(0.6);
const hanging = G.player.m === 'h' && G.player.y === 4;
let maxSus = 0, crossed = false;
for (let i = 0; i < 120; i++) { G.tick(0.1); maxSus = Math.max(maxSus, g.sus); if (g.x > 40.5) crossed = true; }
check('hanging under his eave he walks over you unseen', hanging && crossed && g.state !== 'alert' && maxSus < 0.05, 'max suspicion ' + maxSus.toFixed(2) + ', crossed ' + crossed);

// 3. the chimney
g = fresh();
g.x = 33; g.f = 1; g.pause = 0;
G.teleport(chimney, 3, 1);
let hideSus = 0, passed = false;
for (let i = 0; i < 80; i++) { G.tick(0.1); hideSus = Math.max(hideSus, g.sus); if (g.x > chimney + 1) passed = true; }
check('behind the chimney he walks past', chimney > 0 && passed && g.state !== 'alert', 'chimney at ' + chimney + ', max suspicion ' + hideSus.toFixed(2));

// 4. choke from behind
g = fresh();
g.x = 39; g.f = 1; g.pause = 5;
G.teleport(38, 3, 1);
const choked = G.takedown(false);
check('E from behind chokes him out', choked && g.state === 'ko', g.state);

// 5. pulled off the eave (only with a knife: she has to have chosen to carry one)
g = fresh();
G.S.run.knife = true;
g.x = 40; g.f = -1; g.pause = 5;
G.teleport(40, 3, 1);
G.act('down'); G.tick(0.6);
const pulled = G.takedown(true);
G.tick(2);
check('Q from below pulls him off, and he dies in the street', pulled && g.state === 'dead' && g.y >= 15, g.state + ' at row ' + g.y);

return JSON.stringify({ pass, detail: notes.join('; ') });
