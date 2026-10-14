/* Two of Amber's notes from 2026-10-14, in Node.

   "Three tracks off a station, only two of them are used. Oddly if there's 4 tracks then it
   works." The points used to flip on every train whichever way it came in, so one train
   round a three-way junction settled into two of the arms for good. Now a train takes the
   way out that was taken longest ago: this lays three dead-end arms off one station, puts
   ONE train on, and checks every arm is reached, and reached about as often as the others.

   "If a track or station goes over a house the house should move." This puts a row of
   houses across where track will go and a house where a station will go, builds both, and
   checks no house was lost and none is left standing on the track or the station. */
import { createRouteBuilder } from '../../route-builder/sim.js';

export default function () {
  const notes = [], checks = [];
  const check = (name, ok, extra) => { checks.push(ok); notes.push(`${name}: ${ok ? 'ok' : 'FAILED'}${extra ? ` (${extra})` : ''}`); };

  // ---- the junction
  const rb = createRouteBuilder({});
  rb.seedDice(5);
  rb.newGame('calm', 77);
  const S = rb.state;
  S.week = rb.OPEN_FULL_WEEK;
  S.river = [{ x: 0, y: 1740 }, { x: rb.WORLD.w, y: 1740 }];
  S.inv.track = 999; S.growTimer = 1e9; S.houses = []; S.trees = [];
  const mk = (type, x, y) => { const s = rb.createStation({ x, y }, type); s.pegTimer = 1e9; s.walkTimer = 1e9; return s; };
  const hub = mk('house', 1400, 800);
  const arms = [mk('shop', 1400, 450), mk('school', 1700, 1000), mk('park', 1100, 1000)];
  arms.forEach((a) => { rb.beginDraft(hub.id); rb.tryAppendDraft(a.id); rb.commitDraft(); });
  check('three runs of track off one station', rb.routing.adj.get(hub.id).length === 3);
  rb.newTrain(rb.lines[0], 1);
  const train = rb.trains[0];
  const seen = new Map(arms.map((a) => [a.id, 0]));
  let last = train.at;
  for (let t = 0; t < 20 * 400; t++) {
    rb.step(1 / 20);
    if (train.at !== last) { last = train.at; if (seen.has(last)) seen.set(last, seen.get(last) + 1); }
  }
  const counts = [...seen.values()];
  check('one train reaches every arm', counts.every((n) => n > 0), counts.join(' / '));
  check('and each about as often as the others', Math.max(...counts) - Math.min(...counts) <= 1, counts.join(' / '));

  // ---- moving houses out of the way
  const rb2 = createRouteBuilder({});
  rb2.seedDice(9);
  rb2.newGame('calm', 78);
  const T = rb2.state;
  T.week = rb2.OPEN_FULL_WEEK;
  T.river = [{ x: 0, y: 1740 }, { x: rb2.WORLD.w, y: 1740 }];
  T.inv.track = 999; T.inv.stations = 9; T.growTimer = 1e9; T.houses = []; T.trees = [];
  const a = rb2.createStation({ x: 900, y: 800 }, 'house'), b = rb2.createStation({ x: 1700, y: 800 }, 'shop');
  for (let x = 1050; x <= 1550; x += 60) rb2.addHouse({ x, y: 812 }, null);
  rb2.addHouse({ x: 1300, y: 420 }, null);
  const before = T.houses.length;
  rb2.beginDraft(a.id); rb2.tryAppendDraft(b.id); rb2.commitDraft();
  rb2.placeStation({ x: 1300, y: 430 });
  const s3 = rb2.stations[2];
  const onTrack = T.houses.filter((h) => rb2.houseOnTrack(h, a, b)).length;
  const onStation = T.houses.filter((h) => rb2.stations.some((s) => rb2.houseOnStation(h, s))).length;
  const moved = T.houses.filter((h) => h.movedAt !== undefined).length;
  check('the track and the station went down', rb2.lines.length === 1 && !!s3);
  check('no house was lost', T.houses.length === before, `${before} → ${T.houses.length}`);
  check('the ones in the way were moved', moved >= before - 1, `${moved} moved`);
  check('none is left on the track or the station', onTrack === 0 && onStation === 0, `${onTrack} on track, ${onStation} on a station`);
  const clash = T.houses.some((h, i) => T.houses.some((o, j) => j > i && rb2.houseClash(h, o)));
  check('and none was set down on top of another', !clash);

  return { pass: checks.every(Boolean), detail: notes.join('; ') };
}
