/* Nobody swims (Amber's rule): people only get across the river on a train.
   A house just over the water from a station is close enough to be fed or to
   walk in, and must be neither; a house the same distance away on the same
   bank still is. And a far house with a nearer station across the water walks
   to the one on its own side instead. */
const RB = window.routeBuilder;
const notes = [];
const checks = [];
const check = (name, ok, extra) => { checks.push(ok); notes.push(`${name}: ${ok ? 'ok' : 'FAILED'}${extra ? ` (${extra})` : ''}`); };

RB.newGame('calm');
const S = RB.state;
S.river = [{ x: 0, y: 600 }, { x: 1900, y: 600 }];   // a straight river across the middle
S.trees = []; S.growTimer = 1e9; S.neighborhoods = [];
const mk = (type, x, y) => { const s = RB.spawnStation(type); s.x = x; s.y = y; s.pegTimer = 1e9; s.walkTimer = 1e9; return s; };
const north = mk('house', 500, 480);
RB.addHouse(500, 720);   // 240 away, over the water
RB.addHouse(500, 340);   // 140 away, same bank
check('only the house on its own bank feeds it', RB.stationHouses(north.id) === 1, `fed ${RB.stationHouses(north.id)}`);
check('and the one over the water does not walk to it either', RB.walkersFor(north.id) === 0, `walk ${RB.walkersFor(north.id)}`);

const south = mk('shop', 900, 1000);    // much further, but on the south bank
check('it walks to the station on its own side', RB.walkersFor(south.id) === 1, `south ${RB.walkersFor(south.id)}`);

return JSON.stringify({ pass: checks.every(Boolean), detail: notes.join('; ') });
