/* A careful network keeps a growing town happy for a fortnight and more.

   A bot plays survival mode in Node on three mats. Every few seconds of game time it:
   puts a station from the toy box down where the most houses have no station, as close to
   them as the mat allows; joins it on to the end of the nearest line (or starts the first
   line once there are two stations); puts any train in the box on the line with fewest
   trains, and any carriage on the shortest train; and builds out the platform with the most
   people waiting once it has outgrown itself. It never pulls anything up.

   It has to last fifteen days. What this guards is the whole economy at once: a town whose
   gifts keep pace with its growth, passengers that find their way across lines, and trains
   that turn round and come back. The detail says how long each mat lasted and why it
   ended (the most crowded platform, and how many were walking). */
import { createRouteBuilder } from '../../route-builder/sim.js';

const DAYS = 15;
const DT = 1 / 20;

function run(seed) {
  const rb = createRouteBuilder({});
  rb.seedDice(seed);
  rb.newGame('survival', seed * 7919);
  const S = () => rb.state;
  const { stations, lines, trains } = rb;
  const d2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

  // the house with the most other unserved houses round it, and a free spot near it
  function stationSpot() {
    const loose = S().houses.filter((h) => !stations.some((s) => rb.feeds(s, h)));
    if (loose.length < 4) return null;
    let best = null, bn = 0;
    for (const h of loose) {
      const n = loose.filter((o) => d2(o, h) < 150 * 150).length;
      if (n > bn) { bn = n; best = h; }
    }
    for (let r = 0; r <= 160; r += 20) for (let a = 0; a < 12; a++) {
      const p = { x: best.x + Math.cos(a / 12 * Math.PI * 2) * r, y: best.y + Math.sin(a / 12 * Math.PI * 2) * r };
      if (!rb.whyNotStation(p)) return p;
    }
    return null;
  }
  const onLine = (s) => lines.some((l) => l.stationIds.includes(s.id));
  function connect(s) {
    if (!lines.length) {
      const other = stations.filter((o) => o !== s).sort((a, b) => d2(a, s) - d2(b, s))[0];
      if (!other) return;
      rb.beginDraft(other.id); rb.tryAppendDraft(s.id); rb.commitDraft();
      return;
    }
    // the nearest end of any line
    let best = null, bd = Infinity;
    for (const l of lines) {
      if (l.loop) continue;
      for (const id of [l.stationIds[0], l.stationIds[l.stationIds.length - 1]]) {
        const e = rb.stationById(id), d = d2(e, s);
        if (d < bd) { bd = d; best = e; }
      }
    }
    if (!best) return;
    rb.beginDraft(best.id); rb.tryAppendDraft(s.id); rb.commitDraft();
  }
  function manage() {
    const inv = S().inv;
    // stations still waiting for track come first
    for (const s of stations) if (!onLine(s)) connect(s);
    if (inv.stations > 0 && stations.length < 12) {
      const p = stations.length < 2 ? (S().houses.length >= 6 ? stationSpot() || null : null) : stationSpot();
      if (p && rb.placeStation(p)) connect(stations[stations.length - 1]);
    }
    while (S().inv.trains > 0 && lines.length) {
      const l = lines.slice().sort((a, b) => a.stationIds.length / (1 + trains.length) - b.stationIds.length)[0];
      const busiest = lines.map((x) => ({ x, n: x.stationIds.length })).sort((a, b) => b.n - a.n)[0].x;
      rb.placeTrain(busiest || l);
    }
    while (S().inv.carriages > 0 && trains.length) {
      const t = trains.slice().sort((a, b) => a.carriages - b.carriages)[0];
      if (t.carriages >= 4) break;
      rb.addCarriage(t);
    }
    const crowded = stations.slice().sort((a, b) => b.pegs.length - a.pegs.length)[0];
    if (crowded && crowded.pegs.length > 8 && stations.every(onLine)) {
      const u = rb.upgradeInfo(crowded);
      if (u.ok) rb.upgradeStation(crowded);
    }
  }

  // the town needs a few houses before a station is worth placing
  while (S().houses.length < 6) rb.step(DT);
  while (!S().gameOver && S().day <= DAYS) {
    manage();
    for (let i = 0; i < 40 && !S().gameOver; i++) rb.step(DT);   // two seconds
  }
  const worst = stations.slice().sort((a, b) => b.pegs.length - a.pegs.length)[0];
  return {
    seed, day: S().day, over: S().gameOver, delivered: S().stats.delivered, houses: S().houses.length,
    stations: stations.length, lines: lines.length, trains: trains.length, carriages: trains.reduce((n, t) => n + t.carriages, 0),
    worst: worst ? `${worst.pegs.length} waiting at a level-${worst.level} ${worst.type}` : '', walkers: S().walkers.length,
  };
}

export default function () {
  const runs = [1, 2, 3].map((s) => run(s));
  const problems = runs.filter((r) => r.over).map((r) => `seed ${r.seed}: happiness ran out on day ${r.day} (${r.worst}, ${r.walkers} walking)`);
  return {
    pass: !problems.length,
    detail: (problems.length ? problems.join(' | ') + ' -- ' : '') +
      runs.map((r) => `seed ${r.seed}: ${r.over ? 'fell on' : 'still going on'} day ${r.day}, ${r.delivered} delivered, ${r.houses} houses, ${r.stations} stations on ${r.lines} lines, ${r.trains} trains with ${r.carriages} carriages`).join('; '),
  };
}
