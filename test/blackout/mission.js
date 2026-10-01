/* Can the job be done from start to finish with the real verbs?

   The chain runs through the phase machine, the keycard on a body, the door, a staircase
   that is a graph edge between floors, the terminal's bypass, the alarm the download
   trips, and the win when you are back outside the wire. Each link is a different bit of
   state, and any one of them can stop advancing while every screen still draws. This
   walks it with moveTo, as a player clicking would, with the fighting taken out:
   the other guards and the cameras are removed, and the card carrier stands still. */
const B = window.__blackout;
const notes = [];
let pass = true;
const check = (name, ok, extra) => { if (!ok) pass = false; notes.push(name + (ok ? ' ok' : ' FAILED') + (extra ? ' (' + extra + ')' : '')); };

const S = B.newGame('normal');
B.start();
S.cams.forEach((c) => { c.alive = false; });
S.guards = S.guards.filter((g) => g.card);
const carrier = S.guards[0];
carrier.x = 12; carrier.y = 19; carrier.rx = 12; carrier.ry = 19;
carrier.route = [[12, 19]]; carrier.wp = 0; carrier.face = 1;   // standing still, looking south at the fence
B.computeVision(); B.computeReach();

const at = (x, y, lv) => S.player.x === x && S.player.y === y && S.player.lv === lv;
// click the tile and let the walk play out; if something stops it, wait a moment and click again
function walkTo(x, y, lv) {
  for (let i = 0; i < 40; i++) {
    if (at(x, y, lv)) return true;
    if (S.mode !== 'play') return false;
    if (!B.moveTo(x, y, lv)) B.wait();
    B.flush();
  }
  return at(x, y, lv);
}

check('starts outside the wire', S.phase === 'wire');
check('through the cut', walkTo(7, 20, 0) && S.phase === 'card', 'phase ' + S.phase);

check('behind the carrier', walkTo(12, 18, 0));
const a = B.contextAction();
check('Z would take him down', !!a && a.kind === 'takedown', a && a.kind);
B.use(); B.flush();
check('he is down', carrier.down);
check('stepping over him takes the card', walkTo(12, 19, 0) && S.hasCard && S.phase === 'door', 'phase ' + S.phase);

check('to the service door', walkTo(14, 11, 0));
B.use(); B.flush();
check('the card opens it', S.phase === 'terminal', 'phase ' + S.phase);

check('up the stairs to the terminal', walkTo(25, 4, 1), 'at ' + S.player.x + ',' + S.player.y + ',' + S.player.lv);
B.use();
check('Z opens the bypass', S.mode === 'hack', 'mode ' + S.mode);
S.hack.pos = S.hack.zoneAt > 0.5 ? 0.01 : 0.99;
B.hackPress();
check('a miss costs nothing but noise', S.mode === 'hack' && S.hack.round === 0);
for (let i = 0; i < 3 && S.mode === 'hack'; i++) { S.hack.pos = S.hack.zoneAt + S.hack.zone / 2; B.hackPress(); }
check('three keys take the data', S.dataDone && S.phase === 'escape');
check('the download trips the alarm', S.alarm);
check('and it is a checkpoint', !!S.checkpoint);
check('but it is still a clean run', !S.earlyAlarm);

S.reinforceLeft = 0;   // the gate's reinforcements are alarm.js's business
check('back out through the wire', walkTo(7, 22, 0) || S.mode === 'won', 'mode ' + S.mode);
check('and that is a win', S.mode === 'won', 'mode ' + S.mode);
notes.push(S.ticks + ' moves in all');
document.getElementById('end').hidden = true;

return JSON.stringify({ pass, detail: notes.join('; ') });
