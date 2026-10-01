/* The river should wind, but gently: Amber found the old zigzag made every
   straight run meet the water two or three times, and each meeting costs a
   bridge. And a stretch that does cross twice must take two bridges (it used
   to take one, and draw only the first).
   Generates a batch of real rivers and lays random straight stretches over
   them; then hand-places a V-shaped river and builds across both arms. */
const RB = window.routeBuilder;
const notes = [];
const checks = [];
const check = (name, ok, extra) => { checks.push(ok); notes.push(`${name}: ${ok ? 'ok' : 'FAILED'}${extra ? ` (${extra})` : ''}`); };

const crosses = (p1, p2, p3, p4) => {
  const d = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const d1 = d(p3, p4, p1), d2 = d(p3, p4, p2), d3 = d(p1, p2, p3), d4 = d(p1, p2, p4);
  return d1 * d2 < 0 && d3 * d4 < 0;
};
const crossings = (river, a, b) => {
  let n = 0;
  for (let i = 0; i < river.length - 1; i++) if (crosses(a, b, river[i], river[i + 1])) n++;
  return n;
};

let rng = 12345;
const rand = () => ((rng = (rng * 16807) % 2147483647) / 2147483647);
let wet = 0, multi = 0, minBends = 99, maxBends = 0;
for (let g = 0; g < 30; g++) {
  RB.newGame('calm');
  const river = RB.state.river;
  // bends: how often the river changes between heading up and heading down
  let bends = 0, last = 0;
  for (let i = 1; i < river.length; i++) {
    const dy = Math.sign(river[i].y - river[i - 1].y);
    if (dy && last && dy !== last) bends++;
    if (dy) last = dy;
  }
  minBends = Math.min(minBends, bends); maxBends = Math.max(maxBends, bends);
  // station-to-station stretches of a typical length, anywhere on the mat
  for (let k = 0; k < 200; k++) {
    const a = { x: 60 + rand() * 1780, y: 60 + rand() * 1080 };
    const ang = rand() * Math.PI * 2, len = 250 + rand() * 450;
    const b = { x: a.x + Math.cos(ang) * len, y: a.y + Math.sin(ang) * len };
    const n = crossings(river, a, b);
    if (n) wet++;
    if (n > 1) multi++;
  }
}
check('the river still winds', minBends >= 2, `bends per river ${minBends}-${maxBends}`);
check('a stretch that meets the river rarely meets it twice', multi / Math.max(1, wet) < 0.08,
  `${multi} of ${wet} crossing stretches cross more than once (${((100 * multi) / Math.max(1, wet)).toFixed(1)}%)`);

// A V of water: a straight stretch across its mouth meets it twice.
RB.newGame('calm');
const S = RB.state;
S.river = [{ x: 0, y: 150 }, { x: 600, y: 900 }, { x: 1200, y: 150 }, { x: 1900, y: 150 }];
S.bridges.clear();
S.growTimer = 1e9;
S.inv = { stations: 5, track: 99, trains: 2, carriages: 2, bridges: 1 };
RB.placeStation(150, 600);
RB.placeStation(1050, 600);
const [a, b] = RB.stations;
RB.buildDraft([a.id, b.id]);
check('with one bridge in the box, a double crossing is not laid', RB.lines.length === 0 && S.inv.bridges === 1,
  `lines ${RB.lines.length}, bridges left ${S.inv.bridges}`);
S.inv.bridges = 3;
RB.buildDraft([a.id, b.id]);
check('with three, it is laid and takes two', RB.lines.length === 1 && S.inv.bridges === 1, `bridges left ${S.inv.bridges}`);

return JSON.stringify({ pass: checks.every(Boolean), detail: notes.join('; ') });
