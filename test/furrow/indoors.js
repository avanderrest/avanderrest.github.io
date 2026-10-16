/* Inside buildings, furniture and friends (Amber's note of 2026-10-14: "go inside all
   buildings ... furniture arrangement and purchasing when inside", and relationships kept
   simple).

   Living as Nell, through the real keys: walk into her door and find yourself in her house;
   the house's own business (eat, bed) is still on offer indoors; buy a rug and a chair out
   of the barn, pick the chair up and put it somewhere else, and see the home's comfort go
   up; put the chair back and get its log back; walk out through the door. Then friendship:
   a chat warms two people, a second chat the same day adds nothing, and being caught at
   someone's pocket sours them. */
const F = window.furrow;
F.seed(3);
F.newGame(4242);
F.quickStart();
const S = F.S;
const notes = [], checks = [];
const check = (name, ok, extra) => { checks.push(ok); notes.push(name + (ok ? ' ok' : ' FAILED') + (extra ? ' (' + extra + ')' : '')); };
F.hours(23.5);                                   // day 2, morning
const nell = F.V.find((v) => v.name === 'Nell');
F.liveAs(nell);
const home = F.B[nell.home];
const e = F.entryC(home);
F.teleport(nell, e.x, e.y);
const into = ['up', 'right', 'down', 'left'][home.turn || 0];
F.press(into); for (let i = 0; i < 6; i++) F.step(0.05); F.release(into);
check('walking into the door takes you inside', S.inRoom && S.inRoom.id === home.id);
const room = F.roomOf(home);
check('the house has its beds and a table', room && room.items.filter((o) => o.k === 'bed').length === 2 && room.items.some((o) => o.k === 'table'),
  room && room.items.map((o) => o.k).join(','));
nell.hunger = 40; S.t = 19.6;
const labels = F.actionsFor(nell).map((a) => a.label);
check('the house’s own business is on offer indoors', labels.some((l) => /^Eat/.test(l)) && labels.includes('Go to bed'), labels.join(' / '));
S.t = 8;

// furniture
S.store.logs = 20; S.store.wool = 2;
const c0 = F.comfort(home), logs0 = S.store.logs;
F.buyFurn(home, 'rug'); F.buyFurn(home, 'chair');
check('buying takes from the barn', S.store.logs === logs0 - 1 && S.store.wool === 1);
check('and makes the home more comfortable', F.comfort(home) === c0 + 2, c0 + ' → ' + F.comfort(home));
F.render();
F.setArrange(true);
const ci = room.items.findIndex((o) => o.k === 'chair');
const chair = room.items[ci];
const from = { x: chair.x, y: chair.y };
F.roomTapAt(chair.x + 0.5, chair.y + 0.5);            // pick it up
let spot = null;
for (let y = 0; y < room.h && !spot; y++) for (let x = room.w - 1; x >= 0 && !spot; x--) if (x !== from.x || y !== from.y) {
  // try it the way a finger would: tap the square, see if the chair landed there
  F.roomTapAt(x + 0.5, y + 0.5);
  if (chair.x === x && chair.y === y) spot = { x, y };
}
check('a piece picked up can be put down elsewhere', !!spot, JSON.stringify(from) + ' → ' + JSON.stringify(spot));
F.setArrange(false);
const logs1 = S.store.logs;
F.sellFurn(home, room.items.indexOf(chair));
check('putting it back returns what it cost', S.store.logs === logs1 + 1 && !room.items.includes(chair));
// a bed the house needs: a warning first, and only `sure` puts it back; then they feel it
const bi = room.items.findIndex((o) => o.k === 'bed');
const warned = !!F.sellWarning(home, bi), unsure = F.sellFurn(home, bi);
check('putting back a needed bed warns first', warned && !unsure && room.items.filter((o) => o.k === 'bed').length === 2);
const bedLogs = S.store.logs;
check('and goes when you are sure', F.sellFurn(home, bi, true) && room.items.filter((o) => o.k === 'bed').length === 1 && F.lacking(home) === 1, 'lacking ' + F.lacking(home));
F.buyFurn(home, 'bed');
check('a house sells beds, and the room is whole again', F.lacking(home) === 0 && S.store.logs === bedLogs);
check('each building sells its own things', F.furnFor(home).includes('rug') && !F.furnFor(home).includes('oven')
  && F.furnFor({ type: 'bakery' }).includes('oven'), F.furnFor(home).join(','));

// out through the door
S.inRoom.x = F.roomOf(home).w / 2; S.inRoom.y = room.h - 0.5; S.inRoom.to = null;
// make sure nothing stands in the doorway
F.press('down'); for (let i = 0; i < 40 && S.inRoom; i++) F.step(0.05); F.release('down');
check('walking out through the door leaves', !S.inRoom && Math.hypot(nell.x - e.x, nell.y - e.y) < 0.8, nell.x.toFixed(1) + ',' + nell.y.toFixed(1));

// friends
const bram = F.V.find((v) => v.name === 'Bram');
const r0 = F.relOf(nell, bram);
const talk = () => { F.teleport(bram, nell.x + 0.8, nell.y); bram.act = null; bram.path = null; const a = F.actionsFor(nell).find((x) => /^Talk to Bram/.test(x.label)); if (a) { a.run(); return true; } return false; };
const talked = talk();
const r1 = F.relOf(nell, bram);
talk();
const r2 = F.relOf(nell, bram);
check('a chat warms two people to each other', talked && r1 > r0 && F.relOf(bram, nell) === r1, r0 + ' → ' + r1);
check('a second chat the same day adds nothing', r2 === r1, r1 + ' → ' + r2);
F.befriend(nell, bram, 40);
check('friends cheer each other up', F.friendsOf(nell).includes(bram));
F.befriend(nell, bram, -100);
check('and a caught pickpocket is not a friend', !F.friendsOf(nell).includes(bram) && F.relOf(nell, bram) < 0);
F.stepBack(true);

return JSON.stringify({ pass: checks.every(Boolean), detail: notes.join('; ') });
