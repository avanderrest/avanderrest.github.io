/* Route Builder: the rules. A town that grows a house at a time on a felt mat, stations,
   track, trains and the peg people riding them, with no page access, so whole runs can be
   played in Node.

     const rb = createRouteBuilder({ rnd, on, measure })
       rnd      the dice for the town's growth and the passengers (rb.seedDice(n) for tests).
                The mat itself (river, neighbourhoods, trees) comes from rb.newGame(mode, seed).
       on       on(event, data):
                  'toast' text   say something to the player
                  'sfx' name     clack | chime | whistle | pop | warn
                  'gift' item    the town just put something in the toy box
                  'save'         a good moment to save the run; 'clear-run' forget it
                  'new-game'     a fresh mat; 'game-over' happiness ran out
       measure  { trainLength(train), ahead }: how long a train is drawn, which is how far
                it sets off along the way back when it turns round at the end of the track.

   rb.state, rb.routing and rb.draft are getters (each is replaced as the game goes);
   rb.stations, rb.lines, rb.trains and rb.fx are always the same arrays. */
import { mulberry32, newSeed } from '../lib/rng.js';

export function createRouteBuilder({ rnd, on = () => {}, measure = { trainLength: (t) => 28 + t.carriages * 26, ahead: 14 } } = {}) {
  const toast = (msg) => on('toast', msg);
  const sfx = (name) => on('sfx', name);

  // ---------- constants ----------

  const WORLD = { w: 1900, h: 1200 };
  const RIVER_HALFWIDTH = 24;
  const STATION_MIN_GAP = 110;
  const STATION_WORLD_R = 30;      // hit radius / draw radius, world units
  const TRAIN_HIT_R = 24;
  // A click within this many SCREEN pixels of a target's edge still counts,
  // on top of its world-space radius above — without this, the tolerance
  // shrinks right along with the target the moment the player zooms out, and
  // a perfectly good click on a tiny station reads as "nothing happened".
  const CLICK_FORGIVE_PX = 16;
  const ZOOM_MAX = 2.6;            // the least zoomed-in is whatever keeps the mat filling the view

  const TYPE_ORDER = ['house', 'shop', 'school', 'park', 'castle'];
  const TYPES = {
    house: { label: 'Houses', color: '#d1533b', suffix: 'Station' },
    shop: { label: 'Shop', color: '#e0ac2a', suffix: 'Market' },
    school: { label: 'School', color: '#3f84b0', suffix: 'School' },
    park: { label: 'Park', color: '#5a9c4e', suffix: 'Halt' },
    castle: { label: 'Castle', color: '#8a63b0', suffix: 'Keep' },
  };
  const COLOUR_NAMES = { house: 'Red', shop: 'Yellow', school: 'Blue', park: 'Green', castle: 'Purple' };
  const CASTLE_UNLOCK_DAY = 10;

  // All track is plain wood; a line is just one run of it as it was laid.
  // Enough separate runs to cover the mat, not a colour limit.
  const MAX_LINES = 24;
  // Trains aren't tied to a line, so each has its own paint instead.
  const TRAIN_COLORS = ['#d64534', '#3f7cc0', '#e3a126', '#3f9a5c', '#9160c2', '#2fa39a'];

  // The toy box. A track piece covers TRACK_PIECE_LEN of the mat. Bridges
  // can't be placed on their own: track that crosses the stream somewhere new
  // uses one up. It comes down when the last track over it is pulled up, and
  // isn't handed back — crossing there again takes another.
  const START_INV = { stations: 3, track: 16, trains: 1, carriages: 1, bridges: 1 };
  const INV_NAMES = {
    stations: ['station', 'stations'], track: ['track piece', 'track pieces'],
    trains: ['train', 'trains'], carriages: ['carriage', 'carriages'],
    bridges: ['bridge', 'bridges'],
  };
  const TRACK_PIECE_LEN = 70;
  const MAX_CARRIAGES = 4;         // per train, counting the one it comes with

  // What the town hands over as it grows, counted in houses ever built — so
  // clearing a house for a station never takes a gift back.
  const GROWTH_GIFTS = [
    { item: 'track', every: 3, amount: 2 },
    { item: 'stations', every: 9, amount: 1 },
    { item: 'carriages', every: 12, amount: 1 },
    { item: 'trains', every: 15, amount: 1 },
    { item: 'bridges', every: 20, amount: 1 },
  ];

  const MAX_HOUSES = 240;
  const HOUSE_MIN_GAP = 24;
  const DENSITY_R = 170;           // houses within this of a station feed it passengers
  // A bigger platform reaches further: its catchment by station level.
  const STATION_RANGE = [DENSITY_R, 215, 260];

  const CARRIAGE_CAP_BONUS = 3;
  const TRAIN_CAP_BASE = 6;
  const TRAIN_SPEED = 92;          // world units / second

  const STATION_BASE_CAP = [6, 10, 16];
  const STATION_DWELL = [2.1, 1.55, 1.1];
  // Stations from the toy box it takes to bring a platform up to each level:
  // clicking a placed station with the Station tool builds it out.
  const UPGRADE_COST = [0, 1, 2];
  const MAX_STATIONS = 16;
  const GRIDLOCK_MULT = 2.2;       // hard stop on waiting pegs, relative to cap

  const SPEEDS = [0, 1, 2, 3];     // pause, normal, fast, fastest
  const DAY_LEN = 32;              // seconds of sim time at 1x, per day
  const WEEK_DAYS = 5;

  const HAPPINESS_DRAIN_PER_OVER = 9;  // per second, per full multiple of capacity over
  const HAPPINESS_REGEN = 5;

  // How fast the game gets harder. Everything that ramps with the calendar
  // (passenger rate, the town's growth, when castles turn up) reads
  // pressureDay() instead of the day itself, and it climbs at a third of the
  // calendar's pace — Amber asked for a survival run three times as long.
  const PRESSURE_PACE = 1 / 3;

  // Houses too far from any station still send people: they walk to the
  // nearest one, slowly, and arrive short-tempered. Houses further than
  // WALK_MAX from every station don't bother at all.
  const WALK_SPEED = 35;           // world units / second, a peg on foot
  const WALK_MAX = 700;
  const WALKER_WEIGHT = 1.6;       // how much a walker counts toward a crowded platform
  const WALKER_PATIENCE = 15;      // seconds a walker waits calmly before grumbling
  const GRUMBLE_DRAIN = 0.25;      // happiness / s for each walker kept waiting past that

  const NAME_POOL = [
    'Oak St.', 'Elm Rd.', 'Cedar', 'Pine', 'Birch Yard', 'Maple Ave', 'Mill Pond',
    'Fox Hollow', 'Brook Lane', 'River Bend', 'Hilltop', 'Meadow End', 'Stone Bridge',
    'Willow Row', 'Chestnut', 'Ivy Corner', 'Larch Fields', 'Heron Reach', 'Cider Mill',
    'Thistle Down', 'Rookery', 'Sable Cross', 'Quarry Edge', 'Linden Yard',
  ];

  // ---------- helpers ----------

  let R = rnd || Math.random;    // gameplay dice; seedDice(n) swaps in a seeded one for tests
  const rand = (a, b) => a + R() * (b - a);
  const pick = (arr) => arr[Math.floor(R() * arr.length)];
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  function seeded(seed) {
    let s = (seed * 9301 + 49297) % 233280;
    return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  }
  const edgeKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const invName = (item, n) => INV_NAMES[item][n === 1 ? 0 : 1];

  // Standard segment/segment intersection test (orientation-based), used to
  // decide whether a length of track crosses the river's centreline.
  function segsCross(p1, p2, p3, p4) {
    const d = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    const d1 = d(p3, p4, p1), d2 = d(p3, p4, p2), d3 = d(p1, p2, p3), d4 = d(p1, p2, p4);
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
    return false;
  }
  // Where two segments actually cross, for drawing a bridge deck at the real
  // crossing point rather than guessing (the segment's own midpoint is very
  // often nowhere near where a zigzagging river actually cuts across it).
  function segIntersectPoint(p1, p2, p3, p4) {
    const d1x = p2.x - p1.x, d1y = p2.y - p1.y;
    const d2x = p4.x - p3.x, d2y = p4.y - p3.y;
    const denom = d1x * d2y - d1y * d2x;
    if (Math.abs(denom) < 1e-9) return null;
    const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / denom;
    const u = ((p3.x - p1.x) * d1y - (p3.y - p1.y) * d1x) / denom;
    if (t < 0 || t > 1 || u < 0 || u > 1) return null;
    return { x: p1.x + d1x * t, y: p1.y + d1y * t };
  }
  function pointSegDist(p, a, b) {
    const abx = b.x - a.x, aby = b.y - a.y;
    const len2 = abx * abx + aby * aby || 1e-6;
    let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2;
    t = clamp(t, 0, 1);
    const x = a.x + abx * t, y = a.y + aby * t;
    return { dist: Math.hypot(p.x - x, p.y - y), t };
  }

  // the run save carries these fields of the state
  const RUN_FIELDS = ['seed', 'mode', 'day', 'week', 'time', 'totalTime', 'happiness', 'speedIdx', 'lastSpeed',
    'nextStationId', 'nextLineId', 'nextTrainId', 'nextPegId', 'namesUsed', 'stats', 'river',
    'neighborhoods', 'trees', 'houses', 'housesBuilt', 'growTimer', 'inv', 'walkers'];

  // ---------- world state ----------

  let state = null;
  // the lists are always these same arrays, so the view can hold on to them
  const stations = [];
  const lines = [];
  const trains = [];
  let routing = { dist: {}, good: {} };
  const fx = []; // floating text: {x,y,text,life,color}
  const keep = (arr, pred) => { let j = 0; for (const x of arr) if (pred(x)) arr[j++] = x; arr.length = j; return arr; };

  function stationById(id) { return stations.find((s) => s.id === id); }
  function lineById(id) { return lines.find((l) => l.id === id); }

  function makeRiver(rng) {
    // A gentle meander: each bend swings the other way from the last, and
    // only so far, so a straight run of track rarely meets the water more
    // than once. (Free random heights made a zigzag that cost a bridge per leg.)
    const n = 5;
    const ctrl = [];
    let y = WORLD.h * (0.38 + 0.24 * rng());
    let side = rng() < 0.5 ? -1 : 1;
    for (let i = 0; i <= n; i++) {
      ctrl.push({ x: (i / n) * WORLD.w, y });
      side = -side;
      y = clamp(y + side * WORLD.h * (0.07 + 0.08 * rng()), WORLD.h * 0.22, WORLD.h * 0.78);
    }
    // Bend it into a smooth curve (Catmull-Rom through those points), sampled
    // finely enough that everything reading the river as a polyline —
    // crossings, bridges, clearances — follows the same curve that's drawn.
    const pts = [];
    const cr = (a, b, c, d, t) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t);
    for (let i = 0; i < n; i++) {
      const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(n, i + 2)];
      for (let k = 0; k < 8; k++) {
        const t = k / 8;
        pts.push({ x: cr(p0.x, p1.x, p2.x, p3.x, t), y: cr(p0.y, p1.y, p2.y, p3.y, t) });
      }
    }
    pts.push(ctrl[n]);
    return pts;
  }

  // Every place a straight stretch of track meets the water, each with the
  // river segment it crosses there (for angling the bridge).
  function riverCrossings(a, b) {
    const river = state.river, out = [];
    for (let i = 0; i < river.length - 1; i++) {
      if (!segsCross(a, b, river[i], river[i + 1])) continue;
      const p = segIntersectPoint(a, b, river[i], river[i + 1]);
      if (p) out.push({ x: p.x, y: p.y, seg: i });
    }
    return out;
  }
  function segmentCrossesRiver(a, b) { return riverCrossings(a, b).length > 0; }

  function nearRiver(p, clearance) {
    const river = state.river;
    for (let i = 0; i < river.length - 1; i++) {
      if (pointSegDist(p, river[i], river[i + 1]).dist < clearance) return true;
    }
    return false;
  }

  // Every segment of track on the board, loop-closing ones included.
  function trackSegments() {
    const out = [];
    lines.forEach((line) => {
      const pts = linePathPoints(line);
      for (let i = 0; i < pts.length - 1; i++) out.push([pts[i], pts[i + 1]]);
      if (line.loop && pts.length > 2) out.push([pts[pts.length - 1], pts[0]]);
    });
    return out;
  }
  function nearTrack(p, clearance) {
    return trackSegments().some(([a, b]) => pointSegDist(p, a, b).dist < clearance);
  }

  // ---------- the town ----------
  // The mat starts as empty grass. A handful of hidden seeds are where the town
  // wants to grow, and each growth tick puts one house down near a seed or near
  // one of your stations — seeds that already have a station grow fastest, so
  // building where it's growing makes it grow more.

  function makeNeighborhoods(rng) {
    const rand = (a, b) => a + rng() * (b - a);
    const n = 5 + Math.floor(rng() * 3);
    const out = [];
    for (let i = 0; i < n; i++) {
      let p = { x: WORLD.w / 2, y: WORLD.h / 2 };
      for (let tries = 0; tries < 40; tries++) {
        const cand = { x: rand(200, WORLD.w - 200), y: rand(180, WORLD.h - 180) };
        if (nearRiver(cand, RIVER_HALFWIDTH + 70)) continue;
        if (out.some((o) => dist(o, cand) < 280)) continue;
        p = cand; break;
      }
      out.push({ x: p.x, y: p.y, r: rand(170, 260), count: 0 });
    }
    return out;
  }

  function makeTrees(rng) {
    const rand = (a, b) => a + rng() * (b - a);
    const out = [];
    for (let i = 0; i < 110; i++) {
      const p = { x: rand(20, WORLD.w - 20), y: rand(20, WORLD.h - 20) };
      if (nearRiver(p, 36)) continue;
      out.push({ x: p.x, y: p.y, scale: rand(0.8, 1.25), rot: rand(-0.2, 0.2) });
    }
    return out;
  }

  // Nobody swims: people only get across the river on a train, so a house
  // on the far bank neither feeds a station nor walks to it (Amber's rule).
  // Houses, stations and the river all stay put, so the answer is kept,
  // and thrown away when the river is a new one.
  let bankCache = new Map(), bankRiver = null;
  function sameBank(a, b) {
    if (bankRiver !== state.river) { bankCache = new Map(); bankRiver = state.river; }
    const k = `${a.x},${a.y},${b.x},${b.y}`;
    let v = bankCache.get(k);
    if (v === undefined) { v = !segmentCrossesRiver(a, b); bankCache.set(k, v); }
    return v;
  }

  function housesNear(p, r = DENSITY_R) {
    let n = 0;
    state.houses.forEach((h) => { if (dist(h, p) < r && sameBank(h, p)) n++; });
    return n;
  }
  const stationRange = (s) => STATION_RANGE[s.level];
  const stationHouses = (s) => housesNear(s, stationRange(s));
  // Does station s feed house h directly?
  const feeds = (s, h) => dist(h, s) < stationRange(s) && sameBank(h, s);

  // How far a neighbourhood has spread, for its ground tint and its warning.
  function neighbourhoodRadius(n) { return clamp(60 + Math.sqrt(n.count) * 34, 60, n.r * 1.1); }

  const isConnected = (s) => lines.some((l) => l.stationIds.includes(s.id));

  // 'served' when a station with track through it reaches the cluster,
  // 'unconnected' when the only stations near it have no track yet,
  // 'none' when nobody has built there at all.
  function neighbourhoodService(n) {
    const near = stations.filter((s) => dist(s, n) < neighbourhoodRadius(n) + stationRange(s) * 0.5 && sameBank(s, n));
    if (!near.length) return 'none';
    return near.some(isConnected) ? 'served' : 'unconnected';
  }

  function houseSpotFree(p) {
    if (p.x < 24 || p.y < 24 || p.x > WORLD.w - 24 || p.y > WORLD.h - 24) return false;
    if (nearRiver(p, RIVER_HALFWIDTH + 14)) return false;
    if (stations.some((s) => dist(s, p) < platformRadius(s.level) + 20)) return false;
    if (state.houses.some((h) => dist(h, p) < HOUSE_MIN_GAP)) return false;
    if (nearTrack(p, 18)) return false;
    return true;
  }

  function growthCentres() {
    const out = [];
    state.neighborhoods.forEach((n) => {
      const served = stations.some((s) => dist(s, n) < n.r);
      out.push({ seed: n, x: n.x, y: n.y, weight: served ? 3 : 1, radius: clamp(40 + Math.sqrt(n.count) * 30, 40, n.r) });
    });
    stations.forEach((s) => out.push({ seed: null, x: s.x, y: s.y, weight: 1.2, radius: 70 + Math.sqrt(stationHouses(s)) * 22 }));
    return out;
  }

  function addHouse(p, seed) {
    state.houses.push({ x: p.x, y: p.y, scale: rand(0.8, 1.15), born: state.totalTime });
    state.trees = state.trees.filter((t) => dist(t, p) > 18);
    if (seed) seed.count++;
    state.housesBuilt++;
    grantGrowthGifts(p);
  }

  function growHouse() {
    if (state.houses.length >= MAX_HOUSES) return false;
    const centres = growthCentres();
    const total = centres.reduce((a, c) => a + c.weight, 0);
    let r = R() * total;
    let c = centres[0];
    for (const cc of centres) { r -= cc.weight; if (r <= 0) { c = cc; break; } }
    for (let tries = 0; tries < 14; tries++) {
      const ang = rand(0, Math.PI * 2), rad = Math.sqrt(R()) * c.radius;
      const p = { x: c.x + Math.cos(ang) * rad, y: c.y + Math.sin(ang) * rad };
      if (!houseSpotFree(p)) continue;
      addHouse(p, c.seed);
      return true;
    }
    return false;
  }

  // Quick at first so the first clusters show up while you're still deciding
  // where to build, then steadier as the days go on.
  function houseInterval() {
    if (state.houses.length < 8) return 1.1;
    return clamp(4.2 - pressureDay() * 0.1, 1.4, 4.2);
  }

  function grantGrowthGifts(p) {
    GROWTH_GIFTS.forEach((g) => {
      if (state.housesBuilt % g.every !== 0) return;
      state.inv[g.item] += g.amount;
      fx.push({ x: p.x, y: p.y - 14, text: `+${g.amount} ${invName(g.item, g.amount)}`, life: 2, color: '#2c4a39' });
      on('gift', g.item);
      if (g.item === 'stations' || g.item === 'trains') {
        toast(`The town is growing — +${g.amount} ${invName(g.item, g.amount)} in the toy box.`);
        sfx('chime');
      } else sfx('pop');
    });
  }

  function nextGift() {
    let best = null;
    GROWTH_GIFTS.forEach((g) => {
      const at = (Math.floor(state.housesBuilt / g.every) + 1) * g.every;
      if (!best || at < best.at) best = { at, g };
    });
    return best;
  }

  // Clearing ground for a station or a length of track takes the houses and
  // trees off it — building never has to route around the town.
  function clearAround(test) {
    state.houses = state.houses.filter((h) => !test(h));
    state.trees = state.trees.filter((t) => !test(t));
  }

  // ---------- stations ----------

  function availableTypes() {
    return TYPE_ORDER.filter((t) => t !== 'castle' || pressureDay() >= CASTLE_UNLOCK_DAY);
  }

  // Station colours take turns rather than coming up at random: a new station
  // is whichever colour has fewest on the mat, ties going in TYPE_ORDER. So
  // they go red, yellow, blue, green, round again — and a colour you pulled
  // up is the next one back.
  function nextStationType() {
    const types = availableTypes();
    let best = types[0], fewest = Infinity;
    types.forEach((t) => {
      const n = stations.filter((s) => s.type === t).length;
      if (n < fewest) { fewest = n; best = t; }
    });
    return best;
  }

  function pickName() {
    const unused = NAME_POOL.filter((n) => !state.namesUsed.includes(n));
    const base = unused.length ? pick(unused) : `Siding ${state.namesUsed.length + 1}`;
    state.namesUsed.push(base);
    return base;
  }

  function randomStationSpot() {
    for (let tries = 0; tries < 60; tries++) {
      const p = { x: rand(120, WORLD.w - 120), y: rand(120, WORLD.h - 120) };
      if (nearRiver(p, RIVER_HALFWIDTH + 34)) continue;
      if (stations.some((s) => dist(s, p) < STATION_MIN_GAP)) continue;
      return p;
    }
    return { x: rand(120, WORLD.w - 120), y: rand(120, WORLD.h - 120) };
  }

  function createStation(p, forceType) {
    const type = forceType || nextStationType();
    const s = {
      id: state.nextStationId++, type, name: `${pickName()} ${TYPES[type].suffix}`,
      x: p.x, y: p.y, level: 0, pegs: [], pegTimer: rand(2, 5),
    };
    stations.push(s);
    return s;
  }
  // Free, random-position station creation — kept for tests and the debug
  // handle, which want a station without touching the toy box or geometry.
  function spawnStation(forceType) { return createStation(randomStationSpot(), forceType); }

  // Why a station can't go at p, or null if it can. Shared by the click and
  // by the ghost preview that follows the pointer with the Station tool.
  function whyNotStation(p) {
    if (p.x < 40 || p.y < 40 || p.x > WORLD.w - 40 || p.y > WORLD.h - 40) return 'Too close to the edge of the mat.';
    if (nearRiver(p, RIVER_HALFWIDTH + 20)) return "Can't build in the water.";
    if (stations.some((s) => dist(s, p) < STATION_MIN_GAP)) return 'Too close to another station.';
    if (nearTrack(p, STATION_WORLD_R + 10)) return "There's track here — pull it up first (Remove tool).";
    if (stations.length >= MAX_STATIONS) return 'The mat is full of stations.';
    return null;
  }

  function placeStation(p) {
    if (state.inv.stations < 1) { toast('No stations left in the toy box — the town hands you more as it grows.'); return false; }
    const why = whyNotStation(p);
    if (why) { toast(why); return false; }
    state.inv.stations--;
    clearAround((o) => dist(o, p) < STATION_WORLD_R + 12);
    createStation(p);
    sfx('clack');
    rebuildRouting();
    on('save');
    return true;
  }

  function removeStation(s) {
    if (lines.some((l) => l.stationIds.includes(s.id))) { toast(`Pull up the track through ${s.name} first.`); return; }
    keep(stations, (x) => x.id !== s.id);
    state.bridges.forEach((k) => { if (k.split('|').map(Number).includes(s.id)) state.bridges.delete(k); });
    // the station itself, plus whatever went into its platform
    const back = 1 + UPGRADE_COST.slice(1, s.level + 1).reduce((a, b) => a + b, 0);
    state.inv.stations += back;
    rebuildRouting();
    toast(`${s.name} back in the toy box${back > 1 ? ` — ${back} stations, platform and all` : ''}.`);
    on('save');
  }

  // What upgrading s would take and give, or why it can't — shared by the
  // click and by the hover preview, so the two never disagree.
  function upgradeInfo(s) {
    if (s.level >= STATION_BASE_CAP.length - 1) return { ok: false, full: true, why: `${s.name} has the biggest platform there is.` };
    const cost = UPGRADE_COST[s.level + 1];
    const info = { cost, from: STATION_BASE_CAP[s.level], to: STATION_BASE_CAP[s.level + 1], ok: state.inv.stations >= cost };
    if (!info.ok) info.why = `A bigger platform takes ${cost} ${invName('stations', cost)} from the toy box — you have ${state.inv.stations}.`;
    return info;
  }

  function upgradeStation(s) {
    const u = upgradeInfo(s);
    if (!u.ok) { toast(u.why); return false; }
    state.inv.stations -= u.cost;
    s.level++;
    clearAround((o) => dist(o, s) < platformRadius(s.level) + 12);
    fx.push({ x: s.x, y: s.y - STATION_WORLD_R - 30, text: `Bigger platform: room for ${u.to}, reaches further`, life: 2, color: '#2c4a39' });
    sfx('chime');
    on('save');
    return true;
  }

  // ---------- new game / resume ----------

  // The mat (river, where the town wants to grow, the trees) comes from the seed alone, so a
  // #seed= link is the same town for whoever opens it.
  function newGame(mode, seed) {
    const sd = seed != null ? seed >>> 0 : newSeed();
    const rng = mulberry32(sd);
    state = {
      seed: sd, mode: mode || 'survival',
      day: 1, week: 1, time: 0, totalTime: 0,
      happiness: 100, speedIdx: 1, lastSpeed: 1,
      nextStationId: 1, nextLineId: 1, nextTrainId: 1, nextPegId: 1,
      bridges: new Set(), namesUsed: [],
      stats: { delivered: 0, daysSurvived: 1 },
      river: makeRiver(rng), neighborhoods: [], trees: [],
      houses: [], housesBuilt: 0, growTimer: 1.5, walkers: [],
      inv: { ...START_INV },
      gameOver: false, tool: state ? state.tool : null,
    };
    state.neighborhoods = makeNeighborhoods(rng);
    state.trees = makeTrees(rng);
    stations.length = 0; lines.length = 0; trains.length = 0; fx.length = 0;
    rebuildRouting();
    on('clear-run');
    on('new-game');
    on('save');
  }

  function resumeGame(saved) {
    const s = saved.state;
    state = { gameOver: false, tool: null };
    RUN_FIELDS.forEach((k) => { state[k] = s[k]; });
    state.bridges = new Set(s.bridges || []);
    state.inv = { ...START_INV, ...(s.inv || {}) };
    state.houses = s.houses || [];
    state.trees = s.trees || [];
    state.walkers = s.walkers || [];
    state.lastSpeed = s.lastSpeed || 1;
    stations.splice(0, stations.length, ...(saved.stations || []));
    lines.splice(0, lines.length, ...(saved.lines || []));
    // Saves from before trains ran the whole network: stand each at its line's first station.
    trains.splice(0, trains.length, ...(saved.trains || []).map((t) => {
      if (t.at !== undefined) return t;
      const l = lines.find((x) => x.id === t.lineId);
      if (!l) return null;
      return { id: t.id, color: TRAIN_COLORS[(t.id - 1) % TRAIN_COLORS.length], at: l.stationIds[0], prev: null, to: null, prog: 0, atStation: { timer: 0.4 }, pegs: t.pegs || [], carriages: t.carriages || 1 };
    }).filter(Boolean));
    fx.length = 0;
    rebuildRouting();
  }

  // ---------- routing ----------
  // All the track on the mat is one network: lines are only the colours it
  // was laid in, and any train can run over any stretch it's joined to.
  // `adj` is which stations each station has track to. Passengers want a
  // station COLOUR, not a specific station: `dist[type]` is how many stops it
  // is from each station to the nearest station of that colour. Recomputed
  // whenever the track changes; cheap, because the board never has many stations.
  function rebuildRouting() {
    const adj = new Map();
    stations.forEach((s) => adj.set(s.id, []));
    const link = (a, b) => {
      if (!adj.has(a) || !adj.has(b) || a === b) return;
      if (!adj.get(a).includes(b)) adj.get(a).push(b);
      if (!adj.get(b).includes(a)) adj.get(b).push(a);
    };
    lines.forEach((line) => {
      const ids = line.stationIds, n = ids.length;
      for (let i = 0; i < n - 1; i++) link(ids[i], ids[i + 1]);
      if (line.loop && n > 2) link(ids[n - 1], ids[0]);
    });
    const dist_ = {};
    TYPE_ORDER.forEach((t) => {
      const d = new Map();
      const q = stations.filter((s) => s.type === t).map((s) => s.id);
      q.forEach((id) => d.set(id, 0));
      for (let qi = 0; qi < q.length; qi++) {
        const cur = q[qi];
        for (const other of adj.get(cur)) {
          if (!d.has(other)) { d.set(other, d.get(cur) + 1); q.push(other); }
        }
      }
      dist_[t] = d;
    });
    routing = { dist: dist_, adj };
  }
  const hasTrack = (a, b) => (routing.adj.get(a) || []).includes(b);

  // Stations joined to at least one train by track. Track anywhere else has
  // nothing running on it yet, and says so.
  function stationsWithTrains() {
    const out = new Set();
    const q = trains.map((t) => t.at).filter((id) => routing.adj.has(id));
    q.forEach((id) => out.add(id));
    for (let qi = 0; qi < q.length; qi++) {
      for (const other of routing.adj.get(q[qi])) if (!out.has(other)) { out.add(other); q.push(other); }
    }
    return out;
  }

  // ---------- track drafting ----------

  let draft = null; // { mode:'new'|'extend', lineId, end, stations:[ids], cursor:{x,y} }

  function endpointOf(stationId) {
    for (const line of lines) {
      const ids = line.stationIds;
      if (ids.length < 2 || line.loop) continue; // a loop has no end to extend
      if (ids[0] === stationId) return { line, end: 'start' };
      if (ids[ids.length - 1] === stationId) return { line, end: 'end' };
    }
    return null;
  }

  function beginDraft(stationId) {
    const ep = endpointOf(stationId);
    if (ep) draft = { mode: 'extend', lineId: ep.line.id, end: ep.end, stations: [stationId] };
    else draft = { mode: 'new', stations: [stationId] };
  }

  function tryAppendDraft(stationId) {
    if (!draft) return;
    const last = draft.stations[draft.stations.length - 1];
    if (stationId === last) return;
    if (draft.stations.includes(stationId)) {
      // Only a fresh line can close on itself into a loop, and only by
      // returning to its own first station in one continuous drag.
      if (draft.mode === 'new' && stationId === draft.stations[0] && draft.stations.length >= 3) {
        if (draft.stations[draft.stations.length - 1] !== stationId) draft.stations.push(stationId);
      }
      return;
    }
    draft.stations.push(stationId);
  }

  function segmentPieces(aId, bId) {
    const a = stationById(aId), b = stationById(bId);
    const key = edgeKey(aId, bId);
    const track = Math.ceil(dist(a, b) / TRACK_PIECE_LEN);
    // one bridge for every time this stretch meets the water
    const bridges = state.bridges.has(key) ? 0 : riverCrossings(a, b).length;
    return { track, needBridge: bridges > 0, bridges, key, a, b };
  }

  // The segments a draft of these station ids would lay, loop-closer included.
  function draftSegments(ids, loop) {
    const segs = [];
    for (let i = 0; i < ids.length - 1; i++) segs.push(segmentPieces(ids[i], ids[i + 1]));
    if (loop) segs.push(segmentPieces(ids[ids.length - 1], ids[0]));
    return segs;
  }
  // What a set of segments takes out of the toy box. A stretch that meets
  // the river twice takes two bridges; the same stretch laid twice in one
  // draft (there and back on one line) is only bridged once.
  function costOf(segs) {
    const bridged = new Map();
    segs.forEach((s) => { if (s.needBridge) bridged.set(s.key, s.bridges); });
    return {
      track: segs.reduce((n, s) => n + s.track, 0),
      bridges: [...bridged.values()].reduce((n, k) => n + k, 0),
    };
  }
  const affordable = (c) => c.track <= (state.inv.track || 0) && c.bridges <= (state.inv.bridges || 0);

  // Tries the whole draft; if the toy box can't cover it, drops stations off
  // the far end and tries again, so a drag that outran your track or bridges
  // still lays as much as you have rather than laying nothing.
  function commitDraft() {
    if (!draft) return;
    if (draft.stations.length < 2) {
      toast('Drag from a station to another one to lay track.');
      draft = null;
      return;
    }
    if (draft.mode === 'new' && lines.length >= MAX_LINES) {
      toast("That's all the separate runs of track the set allows — extend one or pull one up.");
      draft = null;
      return;
    }
    let ids = draft.stations.slice();
    let loop = ids.length >= 3 && ids[ids.length - 1] === ids[0];
    if (loop) ids = ids.slice(0, -1);
    const wanted = costOf(draftSegments(ids, loop));
    const wantedCount = ids.length;
    const short = shortfall(wanted); // worded against the box as it stands now

    while (ids.length >= 2) {
      const segs = draftSegments(ids, loop);
      const cost = costOf(segs);
      if (affordable(cost)) {
        state.inv.track -= cost.track;
        state.inv.bridges -= cost.bridges;
        segs.forEach((seg) => {
          if (seg.needBridge) state.bridges.add(seg.key);
          clearAround((o) => pointSegDist(o, seg.a, seg.b).dist < 16);
        });
        if (draft.mode === 'new') {
          lines.push({ id: state.nextLineId++, stationIds: ids, loop, pieces: cost.track });
        } else {
          extendLine(lineById(draft.lineId), draft.end, ids.slice(1)); // ids[0] is the shared endpoint
          lineById(draft.lineId).pieces += cost.track;
        }
        sfx('clack');
        rebuildRouting();
        // Trains already on the network run onto new track by themselves; only
        // track that isn't joined to any train needs one put on it.
        if (!stationsWithTrains().has(ids[0])) {
          toast(state.inv.trains > 0
            ? 'Track laid — pick Train and click it to put a train on it.'
            : 'Track laid — it needs a train, and the toy box has none yet.');
        }
        if (ids.length < wantedCount) toast(`${short} Laid as far as the toy box would reach.`);
        on('save');
        draft = null;
        return;
      }
      ids.pop();
      loop = false;
    }
    toast(short);
    draft = null;
  }

  // Adds stations to one end of a line. Trains live on the network, not on a
  // line, so they carry on where they are and find the new track themselves.
  function extendLine(line, end, add) {
    if (end === 'end') line.stationIds = line.stationIds.concat(add);
    else line.stationIds = add.slice().reverse().concat(line.stationIds);
  }

  // Says exactly what the toy box is short of for a draft — track, a bridge,
  // or both — rather than one vague "can't afford it".
  function shortfall(c) {
    const parts = [];
    if (c.track > state.inv.track) parts.push(`${c.track} ${invName('track', c.track)} (you have ${state.inv.track})`);
    if (c.bridges > state.inv.bridges) {
      parts.push(`${c.bridges} ${invName('bridges', c.bridges)} to cross the stream (you have ${state.inv.bridges})`);
    }
    return parts.length ? `That needs ${parts.join(' and ')}.` : '';
  }

  function cancelDraft() { draft = null; }


  // ---------- trains and removal ----------

  // A train stands at station `at`, or runs from `at` towards `to`, `prog`
  // of the way along; `prev` is where it came from, so it knows which way is
  // onward. It starts at the station of the line nearest where it was put.
  function newTrain(line, carriages = 1, near) {
    let home = line.stationIds[0];
    if (near) {
      let bd = Infinity;
      line.stationIds.forEach((id) => { const s = stationById(id); if (s && dist(s, near) < bd) { bd = dist(s, near); home = id; } });
    }
    const id = state.nextTrainId++;
    const t = {
      id, color: TRAIN_COLORS[(id - 1) % TRAIN_COLORS.length],
      at: home, prev: null, to: null, prog: 0, atStation: { timer: 0.4 }, pegs: [], carriages,
    };
    trains.push(t);
    return t;
  }

  function placeTrain(line, near) {
    if (state.inv.trains < 1) { toast('No trains left in the toy box — the town hands you more as it grows.'); return; }
    state.inv.trains--;
    newTrain(line, 1, near);
    sfx('whistle');
    on('save');
  }

  function trainCapacity(train) { return TRAIN_CAP_BASE + (train.carriages - 1) * CARRIAGE_CAP_BONUS; }

  function addCarriage(train) {
    if (train.carriages >= MAX_CARRIAGES) { toast(`That train can't pull more than ${MAX_CARRIAGES} carriages.`); return; }
    if (state.inv.carriages < 1) { toast('No carriages left in the toy box — the town hands you more as it grows.'); return; }
    state.inv.carriages--;
    train.carriages++;
    sfx('chime');
    on('save');
  }

  // Everything pulled up goes back in the toy box whole — track, trains and
  // carriages. Bridges stay where they are, so re-crossing is free.
  function returnTrain(train) {
    state.inv.trains++;
    state.inv.carriages += train.carriages - 1;
    const home = stationById(train.at);
    if (home) train.pegs.forEach((p) => home.pegs.push(p));
    keep(trains, (t) => t.id !== train.id);
  }

  function removeTrain(train) {
    returnTrain(train);
    toast('Train back in the toy box.');
    on('save');
  }

  function removeLine(line) {
    state.inv.track += line.pieces;
    keep(lines, (l) => l.id !== line.id);
    rebuildRouting();
    // A bridge with no track left over it comes down too. It was used up
    // building it, so it doesn't go back in the box.
    const laid = laneMap();
    const bridgesBefore = state.bridges.size;
    [...state.bridges].forEach((k) => { if (!laid.has(k)) state.bridges.delete(k); });
    const bridgesGone = bridgesBefore - state.bridges.size;
    // A train on a stretch that's gone drops back to the station it left;
    // one left standing on no track at all goes back in the box.
    trains.slice().forEach((t) => {
      if (t.to !== null && !hasTrack(t.at, t.to)) { t.to = null; t.prog = 0; t.atStation = { timer: 0.4 }; }
      if (t.prev !== null && !hasTrack(t.at, t.prev)) t.prev = null;
      if (!(routing.adj.get(t.at) || []).length) returnTrain(t);
    });
    toast(`Line pulled up — ${line.pieces} ${invName('track', line.pieces)} back in the toy box.`
      + (bridgesGone ? ` The ${bridgesGone > 1 ? 'bridges' : 'bridge'} came down with it.` : ''));
    on('save');
  }

  // ---------- simulation ----------

  // Busier where the buildings are thick: a station with no houses round it
  // barely sees anyone, one in the middle of a big cluster is flat out.
  function pressureDay() { return 1 + (state.day - 1) * PRESSURE_PACE; }
  const pegBase = () => clamp(9 - pressureDay() * 0.15, 3.2, 9);

  function pegInterval(s) {
    const demand = 0.3 + Math.min(stationHouses(s), 24) * 0.09;
    return (pegBase() / demand) * rand(0.75, 1.25);
  }

  // Where a peg arriving at this station might want to go.
  function destinationsFrom(s) {
    return availableTypes().filter((t) => t !== s.type && stations.some((o) => o.type === t));
  }
  const platformFull = (s) => s.pegs.length >= STATION_BASE_CAP[s.level] * GRIDLOCK_MULT;

  function spawnPegs(dt) {
    stations.forEach((s) => {
      s.pegTimer -= dt;
      if (s.pegTimer > 0) return;
      s.pegTimer = pegInterval(s);
      if (platformFull(s)) return;
      const choices = destinationsFrom(s);
      if (!choices.length) return;
      s.pegs.push({ id: state.nextPegId++, type: pick(choices), since: state.totalTime });
    });
  }

  // ---------- walkers ----------

  // The nearest station on this side of the river.
  function nearestStation(p) {
    let best = null, bd = Infinity;
    stations.forEach((s) => { const d = dist(s, p); if (d < bd && sameBank(p, s)) { bd = d; best = s; } });
    return { s: best, d: bd };
  }

  // Houses outside every station's catchment whose nearest station is s,
  // close enough that someone would make the walk. Catchments differ by
  // platform size, so "outside" is checked against each station's own reach.
  function walkersFor(s) {
    return state.houses.filter((h) => {
      const n = nearestStation(h);
      return n.s === s && n.d <= WALK_MAX && !stations.some((o) => feeds(o, h));
    });
  }

  function spawnWalkers(dt) {
    stations.forEach((s) => {
      if (s.walkTimer === undefined) s.walkTimer = rand(3, 6);
      s.walkTimer -= dt;
      if (s.walkTimer > 0) return;
      const far = walkersFor(s);
      // Half as keen per house as the ones who live next to a station.
      s.walkTimer = far.length ? (pegBase() / (Math.min(far.length, 30) * 0.045)) * rand(0.75, 1.25) : 5;
      const choices = destinationsFrom(s);
      if (!far.length || !choices.length) return;
      const h = pick(far);
      state.walkers.push({ stationId: s.id, type: pick(choices), fx: h.x, fy: h.y, t: 0, dur: dist(h, s) / WALK_SPEED });
    });
  }

  function updateWalkers(dt) {
    state.walkers = state.walkers.filter((w) => {
      const s = stationById(w.stationId);
      if (!s) return false;
      w.t += dt;
      if (w.t < w.dur) return true;
      if (!platformFull(s)) s.pegs.push({ id: state.nextPegId++, type: w.type, since: state.totalTime, walked: true });
      return false; // a full platform turns them away
    });
  }

  function walkerPosition(w) {
    const s = stationById(w.stationId);
    const k = clamp(w.t / w.dur, 0, 1);
    return { x: w.fx + (s.x - w.fx) * k, y: w.fy + (s.y - w.fy) * k };
  }

  const grumbling = (p) => p.walked && state.totalTime - p.since > WALKER_PATIENCE;

  function growTown(dt) {
    state.growTimer -= dt;
    if (state.growTimer > 0) return;
    growHouse();
    state.growTimer = houseInterval() * rand(0.7, 1.3);
  }

  function deliverPeg() { state.stats.delivered++; }

  // Which way a train leaves a station. It never doubles back unless the
  // track ends there. Where there's more than one way on, the station works
  // like the points on a toy railway: they flip every time a train goes
  // through, so trains take each branch in turn.
  // Only ways a train could actually drive count as onward: nothing sharper
  // than about a right angle from the way it came in, so one back from the
  // arm of a Y runs on down the stem rather than hairpinning into the other arm.
  const MAX_TURN = 1.75; // radians
  function onwardWays(prevId, s) {
    const ways = (routing.adj.get(s.id) || []).slice().sort((a, b) => a - b);
    let onward = ways.filter((id) => id !== prevId);
    const from = prevId !== null ? stationById(prevId) : null;
    if (from && onward.length > 1) {
      const heading = Math.atan2(s.y - from.y, s.x - from.x);
      const smooth = onward.filter((id) => {
        const o = stationById(id);
        const turn = Math.abs(((Math.atan2(o.y - s.y, o.x - s.x) - heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        return turn <= MAX_TURN;
      });
      if (smooth.length) onward = smooth;
    }
    return onward;
  }
  function nextStop(train, s) {
    if (!(routing.adj.get(s.id) || []).length) return null;
    const onward = onwardWays(train.prev, s);
    if (!onward.length) return train.prev;           // end of the line: turn round
    if (onward.length === 1) return onward[0];
    s.points = ((s.points || 0) + 1) % onward.length;
    return onward[s.points];
  }

  // Does riding from station a on to b bring a peg closer to its colour?
  function gets(p, a, b) {
    const d = routing.dist[p.type];
    if (!d || b === null) return false;
    const from = d.get(a), to = d.get(b);
    return to !== undefined && (from === undefined || to < from);
  }

  // Everyone whose stop this is gets off; anyone the train's next leg would
  // take the wrong way gets off to wait for one going their way; then
  // whoever the next leg helps gets on, oldest first.
  function exchange(train, s) {
    train.pegs = train.pegs.filter((p) => {
      if (p.type === s.type) { deliverPeg(); return false; }
      if (gets(p, s.id, train.to)) return true;
      s.pegs.push(p);
      return false;
    });
    board(train, s);
  }
  function board(train, s) {
    const cap = trainCapacity(train);
    while (train.pegs.length < cap) {
      let idx = -1, oldest = Infinity;
      s.pegs.forEach((p, i) => { if (p.since < oldest && gets(p, s.id, train.to)) { oldest = p.since; idx = i; } });
      if (idx === -1) break;
      train.pegs.push(s.pegs.splice(idx, 1)[0]);
    }
  }

  function arrive(train, s) {
    train.to = nextStop(train, s);
    exchange(train, s);
    train.atStation = { timer: STATION_DWELL[s.level] };
  }

  // At the end of the track the train turns round where it stands, like a toy
  // picked up and set back down facing the other way: its nose goes where its
  // last carriage was. So it sets off already a train's length along the way
  // back (the drawing flips its body to match, see drawTrain).
  function turnRound(train, here) {
    const to = stationById(train.to);
    const d = Math.max(0, measure.trainLength(train) - 2 * measure.ahead);
    train.prog = Math.min(d / Math.max(1, dist(here, to)), 0.9);
    train.flips = (train.flips || 0) + 1;
  }

  function updateTrains(dt) {
    trains.forEach((train) => {
      const here = stationById(train.at);
      if (!here) return;
      if (train.atStation) {
        train.atStation.timer -= dt;
        if (train.atStation.timer > 0) return;
        train.atStation = null;
        // Pick the way again if it has none (just placed, or its track was
        // pulled up), or if it was about to turn round at the end of the
        // track and new track has been laid on from there while it stood.
        const stale = train.to === null || !hasTrack(train.at, train.to)
          || (train.to === train.prev && (routing.adj.get(train.at) || []).length > 1);
        if (stale) {
          train.to = nextStop(train, here);
          if (train.to === null) { train.atStation = { timer: 0.4 }; return; }
          exchange(train, here);
        }
        if (train.to !== null && train.to === train.prev) turnRound(train, here);
        board(train, here); // anyone who turned up while it stood there
        return;
      }
      if (train.to === null || !hasTrack(train.at, train.to)) { train.to = null; train.prog = 0; train.atStation = { timer: 0.4 }; return; }
      const to = stationById(train.to);
      train.prog += (TRAIN_SPEED * dt) / Math.max(1, dist(here, to));
      if (train.prog < 1) return;
      train.prev = train.at; train.at = to.id; train.prog = 0;
      arrive(train, to);
    });
  }

  function updateHappiness(dt) {
    if (state.mode === 'calm') { state.happiness = 100; return; }
    // Walkers weigh more on a crowded platform, and grumble on their own once
    // they've waited past their patience, crowded or not.
    let overload = 0, grumblers = 0;
    stations.forEach((s) => {
      const cap = STATION_BASE_CAP[s.level];
      const load = s.pegs.reduce((n, p) => n + (p.walked ? WALKER_WEIGHT : 1), 0);
      if (load > cap) overload += (load - cap) / cap;
      grumblers += s.pegs.filter(grumbling).length;
    });
    const drain = overload * HAPPINESS_DRAIN_PER_OVER + grumblers * GRUMBLE_DRAIN;
    if (drain > 0) state.happiness = clamp(state.happiness - drain * dt, 0, 100);
    else state.happiness = clamp(state.happiness + HAPPINESS_REGEN * dt, 0, 100);
    if (state.happiness <= 0 && !state.gameOver) endGame();
  }

  function maybeAdvanceDay() {
    if (state.time < DAY_LEN) return;
    state.time -= DAY_LEN;
    state.day++;
    state.stats.daysSurvived = state.day;
    // Weeks are just a calendar now: no pause, no pick-a-gift. The run goes
    // on until the network falls too far behind.
    if (state.day > state.week * WEEK_DAYS) state.week++;
  }

  // One fixed-size step of the world. tick() runs 1-3 of these per frame
  // depending on the speed, rather than one step three times as long, so
  // fast-forward never lets a train overshoot a station.
  function step(sdt) {
    state.time += sdt;
    state.totalTime += sdt;
    growTown(sdt);
    spawnPegs(sdt);
    spawnWalkers(sdt);
    updateWalkers(sdt);
    updateTrains(sdt);
    updateHappiness(sdt);
    maybeAdvanceDay();
    keep(fx, (f) => { f.life -= sdt; f.y -= sdt * 20; return f.life > 0; });
  }

  function tick(dt) {
    if (state.gameOver) return;
    const speed = SPEEDS[state.speedIdx];
    const sdt = Math.min(dt, 0.05);
    for (let i = 0; i < speed && !state.gameOver && state.speedIdx > 0; i++) step(sdt);
  }


  // ---------- game over ----------

  function endGame() {
    state.gameOver = true;
    state.speedIdx = 0;
    on('game-over');
  }

  // ---------- track and platform geometry ----------

  function linePathPoints(line) { return line.stationIds.map((id) => stationById(id)).filter(Boolean); }

  // Which lines run along each stretch between two stations, in line order.
  function laneMap() {
    const m = new Map();
    lines.forEach((line) => {
      const ids = line.stationIds, n = ids.length;
      const segs = line.loop && n > 2 ? n : n - 1;
      for (let i = 0; i < segs; i++) {
        const k = edgeKey(ids[i], ids[(i + 1) % n]);
        if (!m.has(k)) m.set(k, []);
        if (!m.get(k).includes(line.id)) m.get(k).push(line.id);
      }
    });
    return m;
  }

  const coreRadius = (level) => STATION_WORLD_R * (1 + level * 0.12);
  // How far a station's platform reaches, for clearing houses round it and
  // for sizing the platform itself.
  function platformRadius(level) {
    return level ? coreRadius(level) + level * 7 : coreRadius(level);
  }

  return {
    seeded, segsCross, segIntersectPoint, pointSegDist, stationById, lineById, makeRiver, riverCrossings, segmentCrossesRiver, nearRiver, trackSegments, nearTrack, makeNeighborhoods, makeTrees, sameBank, housesNear, neighbourhoodRadius, neighbourhoodService, houseSpotFree, growthCentres, addHouse, growHouse, houseInterval, grantGrowthGifts, nextGift, clearAround, availableTypes, nextStationType, pickName, randomStationSpot, createStation, spawnStation, whyNotStation, placeStation, removeStation, upgradeInfo, upgradeStation, newGame, resumeGame, rebuildRouting, stationsWithTrains, endpointOf, beginDraft, tryAppendDraft, segmentPieces, draftSegments, costOf, commitDraft, extendLine, shortfall, cancelDraft, newTrain, placeTrain, trainCapacity, addCarriage, returnTrain, removeTrain, removeLine, pressureDay, pegInterval, destinationsFrom, spawnPegs, nearestStation, walkersFor, spawnWalkers, updateWalkers, walkerPosition, growTown, deliverPeg, onwardWays, nextStop, gets, exchange, board, arrive, turnRound, updateTrains, updateHappiness, maybeAdvanceDay, step, tick, endGame, linePathPoints, laneMap, platformRadius, WORLD, RIVER_HALFWIDTH, STATION_MIN_GAP, STATION_WORLD_R, TRAIN_HIT_R, CLICK_FORGIVE_PX, ZOOM_MAX, TYPE_ORDER, TYPES, COLOUR_NAMES, CASTLE_UNLOCK_DAY, MAX_LINES, TRAIN_COLORS, START_INV, INV_NAMES, TRACK_PIECE_LEN, MAX_CARRIAGES, GROWTH_GIFTS, MAX_HOUSES, HOUSE_MIN_GAP, DENSITY_R, STATION_RANGE, CARRIAGE_CAP_BONUS, TRAIN_CAP_BASE, TRAIN_SPEED, STATION_BASE_CAP, STATION_DWELL, UPGRADE_COST, MAX_STATIONS, GRIDLOCK_MULT, SPEEDS, DAY_LEN, WEEK_DAYS, HAPPINESS_DRAIN_PER_OVER, HAPPINESS_REGEN, PRESSURE_PACE, WALK_SPEED, WALK_MAX, WALKER_WEIGHT, WALKER_PATIENCE, GRUMBLE_DRAIN, NAME_POOL, rand, pick, clamp, dist, edgeKey, invName, RUN_FIELDS, stations, lines, trains, fx, stationRange, stationHouses, feeds, isConnected, hasTrack, affordable, pegBase, platformFull, grumbling, MAX_TURN, coreRadius,
    get state() { return state; }, get routing() { return routing; },
    get draft() { return draft; }, set draft(v) { draft = v; },
    seedDice(n) { R = mulberry32(n); },
  };
}
