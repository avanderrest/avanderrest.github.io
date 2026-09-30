/* The town is the clock of the whole game: it sets how busy each station is
   and it is the only thing that refills the toy box. A town that stops
   growing, grows into the river, or piles houses onto the track would each
   break the game without anything on screen looking obviously wrong. This
   runs a real town for a few days from empty grass and checks it grew, that
   every house stands on dry, clear ground, and that the gifts it handed over
   match what the growth table promises for the number of houses built. */
const RB = window.routeBuilder;
RB.newGame('calm');
const S = RB.state;

const notes = [];
const checks = [];
const check = (name, ok, extra) => { checks.push(ok); notes.push(`${name}: ${ok ? 'ok' : 'FAILED'}${extra ? ` (${extra})` : ''}`); };

check('the mat starts with no houses', S.houses.length === 0);

// A station and a line in the middle of it all, so houses have track to avoid.
S.inv.track = 999;
S.inv.bridges = 99;
const a = RB.spawnStation('house'); a.x = 700; a.y = 300;
const b = RB.spawnStation('shop'); b.x = 1200; b.y = 300;
RB.buildDraft([a.id, b.id]);
const inv0 = { ...S.inv };

RB.tick(20 * 30, 1 / 20); // 30 simulated seconds
const early = S.houses.length;
check('houses start going up within half a minute', early >= 8, `${early} houses`);

RB.tick(20 * 32 * 5, 1 / 20); // five more days
check('and keep going up after that', S.houses.length > early + 20, `${early} → ${S.houses.length}`);

// Every house on dry ground, off the track, clear of stations.
const pointSeg = (p, s, e) => {
  const dx = e.x - s.x, dy = e.y - s.y;
  const t = Math.max(0, Math.min(1, ((p.x - s.x) * dx + (p.y - s.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p.x - (s.x + dx * t), p.y - (s.y + dy * t));
};
const wet = S.houses.filter((h) => S.river.some((r, i) => i < S.river.length - 1 && pointSeg(h, r, S.river[i + 1]) < 24));
const onTrack = S.houses.filter((h) => pointSeg(h, a, b) < 14);
const onStation = S.houses.filter((h) => RB.stations.some((s) => Math.hypot(h.x - s.x, h.y - s.y) < 30));
const offMat = S.houses.filter((h) => h.x < 0 || h.y < 0 || h.x > 1900 || h.y > 1200);
check('no house in the river', wet.length === 0, `${wet.length}`);
check('no house on the track', onTrack.length === 0, `${onTrack.length}`);
check('no house on a station', onStation.length === 0, `${onStation.length}`);
check('no house off the mat', offMat.length === 0, `${offMat.length}`);

// Gifts: +2 track every 3 built, +1 station every 9, +1 carriage every 12,
// +1 train every 15, +1 bridge every 20 — and nothing else ever adds to it.
const n = S.housesBuilt;
const want = {
  track: inv0.track + Math.floor(n / 3) * 2,
  stations: inv0.stations + Math.floor(n / 9),
  carriages: inv0.carriages + Math.floor(n / 12),
  trains: inv0.trains + Math.floor(n / 15),
  bridges: inv0.bridges + Math.floor(n / 20),
};
const got = S.inv;
check('the toy box grew exactly as the growth table says', Object.keys(want).every((k) => got[k] === want[k]),
  `${n} built; want ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);

return JSON.stringify({ pass: checks.every(Boolean), detail: notes.join('; ') });
