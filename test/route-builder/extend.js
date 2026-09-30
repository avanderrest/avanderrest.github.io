/* Track added after a train is running has to be used by it. Trains belong
   to the network, not to a line, so extending a line at either end must
   leave a running train where it is and let it reach the new stations —
   including one standing at the old end, which would otherwise turn round
   and ignore the new stretch. */
const RB = window.routeBuilder;
const notes = [];
const checks = [];
const check = (name, ok, extra) => { checks.push(ok); notes.push(`${name}: ${ok ? 'ok' : 'FAILED'}${extra ? ` (${extra})` : ''}`); };

RB.newGame('calm');
const S = RB.state;
S.river = [{ x: 0, y: 1180 }, { x: 1900, y: 1180 }];
S.inv.track = 999; S.inv.trains = 2; S.growTimer = 1e9;
const mk = (type, x, y) => { const s = RB.spawnStation(type); s.x = x; s.y = y; s.pegTimer = 1e9; s.walkTimer = 1e9; return s; };
const a = mk('house', 700, 500), b = mk('shop', 1000, 500);
RB.buildDraft([a.id, b.id]);
const line = RB.lines[0];
RB.placeTrain(line.id);
const train = RB.trains[0];

const byId = (id) => RB.stations.find((s) => s.id === id);
const pos = () => {
  const from = byId(train.at);
  if (train.to === null || train.atStation) return { x: from.x, y: from.y };
  const to = byId(train.to);
  return { x: from.x + (to.x - from.x) * train.prog, y: from.y + (to.y - from.y) * train.prog };
};
const visits = (st, secs) => {
  for (let t = 0; t < secs * 20; t++) {
    RB.tick(1, 1 / 20);
    if (train.at === st.id) return true;
  }
  return false;
};

RB.tick(20 * 2, 1 / 20); // get it moving, part way along
const before = pos();

// Extend at the START (drag from a, the line's first station, out to z).
const z = mk('school', 400, 500);
RB.buildDraft([a.id, z.id]);
const after = pos();
check('the line grew at the start', line.stationIds[0] === z.id, JSON.stringify(line.stationIds));
check('the train did not jump when it did', Math.hypot(after.x - before.x, after.y - before.y) < 1,
  `(${before.x.toFixed(0)},${before.y.toFixed(0)}) → (${after.x.toFixed(0)},${after.y.toFixed(0)})`);
check('and it reaches the new first station', visits(z, 40));

// Extend at the END, and it gets there too.
const e = mk('park', 1300, 500);
RB.buildDraft([b.id, e.id]);
check('the line grew at the end', line.stationIds[line.stationIds.length - 1] === e.id);
check('and the train reaches the new last station', visits(e, 40));

// A train standing at the end when the line is extended goes straight out.
const f = mk('house', 1600, 500);
RB.buildDraft([e.id, f.id]);
check('a train at the old end heads onto the new stretch', visits(f, 12), 'within 12s');

return JSON.stringify({ pass: checks.every(Boolean), detail: notes.join('; ') });
