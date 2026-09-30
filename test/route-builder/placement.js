/* Stations are the player's to place, and "build where the buildings are" is
   a promise the code has to keep — a town that only changed the scenery would
   be a lie the moment someone built in it for the payoff. This checks the
   placement rules (out of the toy box, water and overlap refused without
   using one up) and then proves the payoff: a station surrounded by houses
   fills up faster than one out on empty grass. */
const RB = window.routeBuilder;
RB.newGame('calm');
const S = RB.state;
S.river = [{ x: 0, y: 900 }, { x: 1900, y: 900 }];
S.inv.stations = 2;

const notes = [];
const checks = [];
const check = (name, ok, extra) => { checks.push(ok); notes.push(`${name}: ${ok ? 'ok' : 'FAILED'}${extra ? ` (${extra})` : ''}`); };

check('a new town has no houses and no stations', S.houses.length === 0 && RB.stations.length === 0);

RB.placeStation(300, 300);
check('placing takes one station from the box', RB.stations.length === 1 && S.inv.stations === 1);

RB.placeStation(305, 302);
check('placing on top of a station is refused and costs nothing', RB.stations.length === 1 && S.inv.stations === 1);

RB.placeStation(1000, 900);
check('placing in the water is refused and costs nothing', RB.stations.length === 1 && S.inv.stations === 1);

RB.placeStation(10, 10);
check('placing off the edge of the mat is refused', RB.stations.length === 1 && S.inv.stations === 1);

RB.placeStation(800, 300);
RB.placeStation(1300, 300);
check('an empty box places nothing', RB.stations.length === 2 && S.inv.stations === 0);

// Houses under a new station are cleared for it.
S.inv.stations = 1;
RB.addHouse(1500, 500);
RB.placeStation(1502, 498);
check('building over a house clears it', !S.houses.some((h) => Math.hypot(h.x - 1500, h.y - 500) < 20));

// The payoff. Twenty houses round one station, none round the other, and no
// growth during the run so the difference is all down to where they stand.
RB.newGame('calm');
RB.state.river = [{ x: 0, y: 1150 }, { x: 1900, y: 1150 }];
const hot = RB.spawnStation('house'); hot.x = 600; hot.y = 500;
const cold = RB.spawnStation('shop'); cold.x = 1500; cold.y = 300; // a different colour, so each has somewhere to send people
for (let i = 0; i < 20; i++) {
  const a = (i / 20) * Math.PI * 2, r = 60 + (i % 3) * 30;
  RB.addHouse(600 + Math.cos(a) * r, 500 + Math.sin(a) * r);
}
RB.state.growTimer = 1e9;
hot.pegTimer = cold.pegTimer = 0.1;
check('the ring counts the houses round a spot', RB.housesNear(600, 500) >= 18 && RB.housesNear(1500, 300) === 0,
  `hot ${RB.housesNear(600, 500)}, cold ${RB.housesNear(1500, 300)}`);

RB.tick(800, 1 / 20); // 40 simulated seconds — short enough that neither hits the gridlock ceiling
check('the station among the houses filled up faster', hot.pegs.length > cold.pegs.length * 2,
  `hot ${hot.pegs.length}, cold ${cold.pegs.length}`);

// Colours take turns rather than coming up at random: red, yellow, blue,
// green, round again — and pulling one up makes that colour the next back.
RB.newGame('calm');
RB.state.river = [{ x: 0, y: 1180 }, { x: 1900, y: 1180 }];
RB.state.inv.stations = 9;
[[200, 200], [500, 200], [800, 200], [1100, 200], [1400, 200]].forEach(([x, y]) => RB.placeStation(x, y));
const order = RB.stations.map((s) => s.type).join(' ');
check('station colours take turns', order === 'house shop school park house', order);
RB.removeStation(RB.stations[2].id); // the blue one
RB.placeStation(800, 600);
const back = RB.stations[RB.stations.length - 1].type;
check('a colour pulled up is the next one back', back === 'school', back);

return JSON.stringify({ pass: checks.every(Boolean), detail: notes.join('; ') });
