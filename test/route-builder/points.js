/* Where track branches at a station, the station works like the points on a
   toy railway: they flip every time a train goes through, so trains take
   each branch in turn (Amber's rule). Without it a train can settle into
   one branch and a whole arm of the network quietly never sees a train.
   This lays a Y — a stem into a junction with two arms — puts ONE train on
   the stem, and checks it alternates arms at the junction, turns round at
   the ends, and carries a peg from one arm to the other. */
const RB = window.routeBuilder;
const notes = [];
const checks = [];
const check = (name, ok, extra) => { checks.push(ok); notes.push(`${name}: ${ok ? 'ok' : 'FAILED'}${extra ? ` (${extra})` : ''}`); };

RB.newGame('calm');
const S = RB.state;
S.river = [{ x: 0, y: 1180 }, { x: 1900, y: 1180 }];
S.inv.track = 999; S.growTimer = 1e9;
const mk = (type, x, y) => { const s = RB.spawnStation(type); s.x = x; s.y = y; s.pegTimer = 1e9; s.walkTimer = 1e9; s.pegs.length = 0; return s; };
const stem = mk('house', 400, 500);
const junction = mk('shop', 800, 500);
const up = mk('school', 1200, 300);
const down = mk('park', 1200, 700);

RB.buildDraft([stem.id, junction.id, up.id]);   // one line: stem → junction → up
RB.buildDraft([down.id, junction.id]);          // a second colour, branching off at the junction
check('the branch is a line of its own', RB.lines.length === 2);
RB.addTrain(RB.lines[0].id, 1);                 // a single train, on the first line
const train = RB.trains[0];

// Record every station the train arrives at.
const arrivals = [];
let last = train.at;
for (let t = 0; t < 20 * 150; t++) {
  RB.tick(1, 1 / 20);
  if (train.at !== last) { last = train.at; arrivals.push(train.at); }
}
const arms = arrivals.filter((id) => id === up.id || id === down.id);
const alternates = arms.length >= 4 && arms.every((id, i) => i === 0 || id !== arms[i - 1]);
const name = (id) => ({ [stem.id]: 'stem', [junction.id]: 'J', [up.id]: 'up', [down.id]: 'down' }[id]);
check('one train reaches both arms', arms.includes(up.id) && arms.includes(down.id), arrivals.slice(0, 12).map(name).join(' '));
check('and takes them in turn', alternates, `arms: ${arms.map(name).join(' ')}`);
check('it turns round at the end of the stem too', arrivals.includes(stem.id));

// The track shows the points: as the train runs in from the stem, the arm it
// won't take is painted red — and it then really does take the other one.
const predictions = [];
for (let t = 0; t < 20 * 150 && predictions.length < 4; t++) {
  RB.tick(1, 1 / 20);
  if (train.at === stem.id && train.to === junction.id && !train.atStation && train.prog > 0.5) {
    const off = RB.pointsAgainst().filter((k) => k.startsWith(`${junction.id}|`)).map((k) => Number(k.split('|')[1]));
    while (!(train.at === junction.id && train.to !== null)) RB.tick(1, 1 / 20);
    predictions.push({ off, took: train.to });
    while (train.at === junction.id) RB.tick(1, 1 / 20);
  }
}
check('the points preview marks exactly one arm red', predictions.length >= 3 && predictions.every((p) => p.off.length === 1),
  predictions.map((p) => `red ${name(p.off[0])}`).join(', '));
check('and the train always takes the other one', predictions.every((p) => p.off.length === 1 && p.took !== p.off[0] && (p.took === up.id || p.took === down.id)),
  predictions.map((p) => `took ${name(p.took)}`).join(', '));

// A peg on one arm who wants the other arm's colour gets there on that one train.
RB.spawnPeg(up.id, 'park');
const before = S.stats.delivered;
let ticks = 0;
while (S.stats.delivered === before && ticks < 20 * 120) { RB.tick(1, 1 / 20); ticks++; }
check('a peg rides from one arm to the other', S.stats.delivered === before + 1, `${(ticks / 20).toFixed(1)}s`);

return JSON.stringify({ pass: checks.every(Boolean), detail: notes.join('; ') });
