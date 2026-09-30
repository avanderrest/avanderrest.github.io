/* There is no money: everything you build comes out of a toy box of stations,
   track pieces, bridges, trains and carriages, and everything you pull up goes
   back in (bar bridges: one comes down with the last track over it, and is
   not handed back).
   A piece lost or duplicated on the way in or out never shows on screen — the
   counter just drifts — so this drives the real build/remove paths with a
   hand-placed river and stations and counts every piece by hand.

   Mirrors the constants in game.js — TRACK_PIECE_LEN=70, one bridge per new
   crossing, GROWTH_GIFTS track every 3 houses (+2). */
const RB = window.routeBuilder;
RB.newGame('calm');
const S = RB.state;
S.river = [{ x: 0, y: 400 }, { x: 1900, y: 400 }]; // one flat crossing, not the random one
S.bridges.clear();
S.inv = { stations: 5, track: 40, trains: 2, carriages: 2, bridges: 1 };

const notes = [];
const checks = [];
const check = (name, ok, extra) => { checks.push(ok); notes.push(`${name}: ${ok ? 'ok' : 'FAILED'}${extra ? ` (${extra})` : ''}`); };

// Stations come out of the box one at a time.
RB.placeStation(300, 200);                      // a — above the river
RB.placeStation(300, 600);                      // b — below it, so a↔b crosses
RB.placeStation(900, 200);                      // c — same side as a
const [a, b, c] = RB.stations;
check('three stations placed, three taken from the box', RB.stations.length === 3 && S.inv.stations === 2, `left ${S.inv.stations}`);

// Plain track: 600 long → ceil(600/70) = 9 pieces.
let before = S.inv.track;
RB.buildDraft([c.id, a.id]);
check('600 of plain track takes 9 pieces', before - S.inv.track === 9, `took ${before - S.inv.track}`);

// Over the stream (extending the same line from a): 400 long → 6 pieces,
// and the one bridge in the box.
before = S.inv.track;
RB.buildDraft([a.id, b.id]);
const firstLine = RB.lines[0];
check('a first crossing takes its track (6) and a bridge', before - S.inv.track === 6 && S.inv.bridges === 0,
  `took ${before - S.inv.track} track, ${1 - S.inv.bridges} bridge`);
check('the bridge is on the books', S.bridges.size === 1);

// Pulling the line up gives back every track piece it used (9 + 6 = 15);
// the bridge comes down with it and was used up, so it isn't handed back.
before = S.inv.track;
RB.removeLine(firstLine.id);
check('pulling a line up returns all its track', S.inv.track - before === 15, `returned ${S.inv.track - before}`);
check('the bridge comes down when its line goes, and is not handed back', S.bridges.size === 0 && RB.lines.length === 0 && S.inv.bridges === 0);

// So crossing the same water again takes the track and a fresh bridge.
S.inv.bridges = 1;
before = S.inv.track;
RB.buildDraft([a.id, b.id]);
check('re-crossing takes its track (6) and another bridge', before - S.inv.track === 6 && S.inv.bridges === 0 && S.bridges.size === 1, `took ${before - S.inv.track}`);

// A new crossing with no bridge in the box: refused, and it says so.
const beforeLines = RB.lines.length;
before = S.inv.track;
RB.buildDraft([c.id, b.id]); // c↔b crosses somewhere new
const msg = document.getElementById('toast').textContent;
check('a new crossing with no bridge left is not laid', RB.lines.length === beforeLines && S.inv.track === before);
check('and the message says it needs a bridge', /bridge/.test(msg), msg);

// Not enough track: nothing laid, nothing taken, and the message says pieces.
S.inv.track = 2;
S.inv.bridges = 1;
const lineCount = RB.lines.length;
RB.buildDraft([c.id, b.id]);
check('a line the box cannot cover is not laid at all', RB.lines.length === lineCount && S.inv.track === 2);
check('the message talks about track, not coins', /track/.test(document.getElementById('toast').textContent) && !/coin/i.test(document.getElementById('toast').textContent),
  document.getElementById('toast').textContent);
S.inv.track = 30;

// Trains and carriages.
const line = RB.lines[0];
RB.placeTrain(line.id);
const train = RB.trains[0];
check('a train comes out of the box', RB.trains.length === 1 && S.inv.trains === 1);
RB.addCarriage(train.id);
check('a carriage comes out of the box and onto the train', train.carriages === 2 && S.inv.carriages === 1);
RB.removeTrain(train.id);
check('removing a train returns the train and its carriage', RB.trains.length === 0 && S.inv.trains === 2 && S.inv.carriages === 2);

S.inv.trains = 0;
RB.placeTrain(line.id);
check('an empty box places no train', RB.trains.length === 0);

// A station still on a line can't be removed; an unused one goes back.
before = S.inv.stations;
RB.removeStation(a.id);
check('a station with track through it stays put', RB.stations.includes(a) && S.inv.stations === before);
RB.placeStation(1400, 200);
const lonely = RB.stations[RB.stations.length - 1];
before = S.inv.stations;
RB.removeStation(lonely.id);
check('an unused station goes back in the box', !RB.stations.includes(lonely) && S.inv.stations === before + 1);

// A station can't go on top of track: refused, costs nothing, and says why.
RB.placeStation(1500, 200);
RB.buildDraft([c.id, RB.stations[RB.stations.length - 1].id]); // c → d, along y = 200
const countBefore = RB.stations.length, boxBefore = S.inv.stations;
RB.placeStation(1200, 204); // right on it, far from every station
const onTrack = document.getElementById('toast').textContent;
check('a station on top of track is refused', RB.stations.length === countBefore && S.inv.stations === boxBefore && /track here/.test(onTrack), onTrack);

// The town pays out as it grows: the 3rd house ever built brings +2 track.
S.housesBuilt = 2;
before = S.inv.track;
RB.addHouse(1500, 900);
check('the third house built hands over 2 track', S.inv.track - before === 2, `got ${S.inv.track - before}`);

return JSON.stringify({ pass: checks.every(Boolean), detail: notes.join('; ') });
