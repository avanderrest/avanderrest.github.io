/* Route Builder — a wooden train set on a felt playmat. The town starts as
   empty grass and grows a house at a time; you place stations where it is
   growing, lay track between them and run trains, and keep up with a peg-person
   population that never stops growing. The loop is Mini Metro's: passengers
   want a colour, not a place, so a train works out its own way there across
   however many lines it has to use.

   There is no money. You have a toy box of stations, track pieces, trains and
   carriages, and the town hands you more of each as it grows — so the thing
   that makes the network harder to run is also what pays for fixing it.

   Plain DOM/canvas, no build step, no dependencies. Saves to localStorage. */
(() => {
  'use strict';

  // ---------- constants ----------

  // v2: coins gave way to a toy-box inventory and the town now grows house by
  // house, so a v1 run save has nothing this version could resume from.
  const SAVE_KEY = 'route-builder-save-v2';
  try { localStorage.removeItem('route-builder-save-v1'); localStorage.removeItem('route-builder-save-v1-run'); } catch (e) { /* storage blocked */ }

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

  const $ = (sel) => document.querySelector(sel);
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
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

  // ---------- audio ----------

  const audio = (() => {
    let ac = null, master = null;
    let on = true;
    function ensure() {
      if (ac || !on) return ac;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { on = false; return null; }
      ac = new AC();
      master = ac.createGain();
      master.gain.value = 0.5;
      master.connect(ac.destination);
      return ac;
    }
    function blip(freq, durs, type, vol) {
      if (!on || !ensure()) return;
      if (ac.state === 'suspended') ac.resume();
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = type || 'square';
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol || 0.15, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0008, ac.currentTime + durs);
      o.connect(g).connect(master);
      o.start();
      o.stop(ac.currentTime + durs + 0.02);
    }
    return {
      get on() { return on; },
      set on(v) { on = !!v; },
      toggle() { on = !on; return on; },
      clack() { blip(220, 0.07, 'square', 0.12); },
      chime() { blip(880, 0.12, 'triangle', 0.1); setTimeout(() => blip(1320, 0.14, 'triangle', 0.08), 60); },
      whistle() { blip(660, 0.3, 'sine', 0.09); },
      pop() { blip(520, 0.05, 'triangle', 0.05); },
      warn() { blip(180, 0.2, 'sawtooth', 0.1); },
    };
  })();

  // ---------- persistent settings + best scores ----------

  let save = {};
  try { save = JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch (e) { save = {}; }
  save.best = save.best || { days: 0, delivered: 0, houses: 0 };
  audio.on = save.sound !== false;

  function persistSettings() {
    try {
      const out = { best: save.best, sound: audio.on, mode: state ? state.mode : save.mode };
      localStorage.setItem(SAVE_KEY, JSON.stringify(out));
    } catch (e) { /* storage blocked */ }
  }

  const RUN_KEY = SAVE_KEY + '-run';
  const RUN_FIELDS = ['mode', 'day', 'week', 'time', 'totalTime', 'happiness', 'speedIdx', 'lastSpeed',
    'nextStationId', 'nextLineId', 'nextTrainId', 'nextPegId', 'namesUsed', 'stats', 'river',
    'neighborhoods', 'trees', 'houses', 'housesBuilt', 'growTimer', 'inv', 'walkers'];
  function persistRun() {
    if (!state || state.gameOver) return;
    try {
      const out = {};
      RUN_FIELDS.forEach((k) => { out[k] = state[k]; });
      out.bridges = [...state.bridges];
      localStorage.setItem(RUN_KEY, JSON.stringify({ state: out, stations, lines, trains }));
    } catch (e) { /* storage blocked, or quota — just skip autosave */ }
  }
  function loadRun() {
    try {
      const raw = localStorage.getItem(RUN_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }
  function clearRun() {
    try { localStorage.removeItem(RUN_KEY); } catch (e) { /* ignore */ }
  }

  // ---------- world state ----------

  let state = null;
  let stations = [];
  let lines = [];
  let trains = [];
  let routing = { dist: {}, good: {} };
  let fx = []; // floating text: {x,y,text,life,color}

  function stationById(id) { return stations.find((s) => s.id === id); }
  function lineById(id) { return lines.find((l) => l.id === id); }

  function makeRiver(rng) {
    const n = 6;
    const ctrl = [];
    for (let i = 0; i <= n; i++) {
      const x = (i / n) * WORLD.w;
      const y = WORLD.h * (0.3 + 0.4 * rng()) + Math.sin(i * 1.7) * 90;
      ctrl.push({ x, y: clamp(y, WORLD.h * 0.15, WORLD.h * 0.85) });
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

  function segmentCrossesRiver(a, b) {
    const river = state.river;
    for (let i = 0; i < river.length - 1; i++) {
      if (segsCross(a, b, river[i], river[i + 1])) return true;
    }
    return false;
  }

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

  function makeTrees() {
    const out = [];
    for (let i = 0; i < 110; i++) {
      const p = { x: rand(20, WORLD.w - 20), y: rand(20, WORLD.h - 20) };
      if (nearRiver(p, 36)) continue;
      out.push({ x: p.x, y: p.y, scale: rand(0.8, 1.25), rot: rand(-0.2, 0.2) });
    }
    return out;
  }

  function housesNear(p, r = DENSITY_R) {
    let n = 0;
    state.houses.forEach((h) => { if (dist(h, p) < r) n++; });
    return n;
  }

  // How far a neighbourhood has spread, for its ground tint and its warning.
  function neighbourhoodRadius(n) { return clamp(60 + Math.sqrt(n.count) * 34, 60, n.r * 1.1); }

  const isConnected = (s) => lines.some((l) => l.stationIds.includes(s.id));

  // 'served' when a station with track through it reaches the cluster,
  // 'unconnected' when the only stations near it have no track yet,
  // 'none' when nobody has built there at all.
  function neighbourhoodService(n) {
    const reach = neighbourhoodRadius(n) + DENSITY_R * 0.5;
    const near = stations.filter((s) => dist(s, n) < reach);
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
    stations.forEach((s) => out.push({ seed: null, x: s.x, y: s.y, weight: 1.2, radius: 70 + Math.sqrt(housesNear(s)) * 22 }));
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
    let r = Math.random() * total;
    let c = centres[0];
    for (const cc of centres) { r -= cc.weight; if (r <= 0) { c = cc; break; } }
    for (let tries = 0; tries < 14; tries++) {
      const ang = rand(0, Math.PI * 2), rad = Math.sqrt(Math.random()) * c.radius;
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
      pulseInventory(g.item);
      if (g.item === 'stations' || g.item === 'trains') {
        toast(`The town is growing — +${g.amount} ${invName(g.item, g.amount)} in the toy box.`);
        audio.chime();
      } else audio.pop();
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
    audio.clack();
    rebuildRouting();
    persistRun();
    return true;
  }

  function removeStation(s) {
    if (lines.some((l) => l.stationIds.includes(s.id))) { toast(`Pull up the track through ${s.name} first.`); return; }
    stations = stations.filter((x) => x.id !== s.id);
    state.bridges.forEach((k) => { if (k.split('|').map(Number).includes(s.id)) state.bridges.delete(k); });
    // the station itself, plus whatever went into its platform
    const back = 1 + UPGRADE_COST.slice(1, s.level + 1).reduce((a, b) => a + b, 0);
    state.inv.stations += back;
    rebuildRouting();
    toast(`${s.name} back in the toy box${back > 1 ? ` — ${back} stations, platform and all` : ''}.`);
    persistRun();
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
    fx.push({ x: s.x, y: s.y - STATION_WORLD_R - 30, text: `Bigger platform: room for ${u.to}`, life: 2, color: '#2c4a39' });
    audio.chime();
    persistRun();
    return true;
  }

  // ---------- new game / resume ----------

  function newGame(mode) {
    const rng = seeded(Date.now() % 100000);
    state = {
      mode: mode || 'survival',
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
    state.trees = makeTrees();
    stations = []; lines = []; trains = []; fx = [];
    camera.manual = false;
    rebuildRouting();
    clearRun();
    persistRun();
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
    stations = saved.stations || [];
    lines = saved.lines || [];
    // Saves from before trains ran the whole network: stand each at its line's first station.
    trains = (saved.trains || []).map((t) => {
      if (t.at !== undefined) return t;
      const l = lines.find((x) => x.id === t.lineId);
      if (!l) return null;
      return { id: t.id, color: TRAIN_COLORS[(t.id - 1) % TRAIN_COLORS.length], at: l.stationIds[0], prev: null, to: null, prog: 0, atStation: { timer: 0.4 }, pegs: t.pegs || [], carriages: t.carriages || 1 };
    }).filter(Boolean);
    fx = [];
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
    const needBridge = segmentCrossesRiver(a, b) && !state.bridges.has(key);
    return { track, needBridge, key, a, b };
  }

  // The segments a draft of these station ids would lay, loop-closer included.
  function draftSegments(ids, loop) {
    const segs = [];
    for (let i = 0; i < ids.length - 1; i++) segs.push(segmentPieces(ids[i], ids[i + 1]));
    if (loop) segs.push(segmentPieces(ids[ids.length - 1], ids[0]));
    return segs;
  }
  // What a set of segments takes out of the toy box. A draft that crosses
  // the same new stretch of water twice (there and back on one line) only
  // builds the one bridge.
  function costOf(segs) {
    return {
      track: segs.reduce((n, s) => n + s.track, 0),
      bridges: new Set(segs.filter((s) => s.needBridge).map((s) => s.key)).size,
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
        audio.clack();
        rebuildRouting();
        // Trains already on the network run onto new track by themselves; only
        // track that isn't joined to any train needs one put on it.
        if (!stationsWithTrains().has(ids[0])) {
          toast(state.inv.trains > 0
            ? 'Track laid — pick Train and click it to put a train on it.'
            : 'Track laid — it needs a train, and the toy box has none yet.');
        }
        if (ids.length < wantedCount) toast(`${short} Laid as far as the toy box would reach.`);
        persistRun();
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
    audio.whistle();
    persistRun();
  }

  function trainCapacity(train) { return TRAIN_CAP_BASE + (train.carriages - 1) * CARRIAGE_CAP_BONUS; }

  function addCarriage(train) {
    if (train.carriages >= MAX_CARRIAGES) { toast(`That train can't pull more than ${MAX_CARRIAGES} carriages.`); return; }
    if (state.inv.carriages < 1) { toast('No carriages left in the toy box — the town hands you more as it grows.'); return; }
    state.inv.carriages--;
    train.carriages++;
    audio.chime();
    persistRun();
  }

  // Everything pulled up goes back in the toy box whole — track, trains and
  // carriages. Bridges stay where they are, so re-crossing is free.
  function returnTrain(train) {
    state.inv.trains++;
    state.inv.carriages += train.carriages - 1;
    const home = stationById(train.at);
    if (home) train.pegs.forEach((p) => home.pegs.push(p));
    trains = trains.filter((t) => t.id !== train.id);
  }

  function removeTrain(train) {
    returnTrain(train);
    toast('Train back in the toy box.');
    persistRun();
  }

  function removeLine(line) {
    state.inv.track += line.pieces;
    lines = lines.filter((l) => l.id !== line.id);
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
    persistRun();
  }

  // ---------- simulation ----------

  // Busier where the buildings are thick: a station with no houses round it
  // barely sees anyone, one in the middle of a big cluster is flat out.
  function pressureDay() { return 1 + (state.day - 1) * PRESSURE_PACE; }
  const pegBase = () => clamp(9 - pressureDay() * 0.15, 3.2, 9);

  function pegInterval(s) {
    const demand = 0.3 + Math.min(housesNear(s), 24) * 0.09;
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

  function nearestStation(p) {
    let best = null, bd = Infinity;
    stations.forEach((s) => { const d = dist(s, p); if (d < bd) { bd = d; best = s; } });
    return { s: best, d: bd };
  }

  // Houses outside every station's catchment whose nearest station is s,
  // close enough that someone would make the walk.
  function walkersFor(s) {
    return state.houses.filter((h) => {
      const n = nearestStation(h);
      return n.s === s && n.d > DENSITY_R && n.d <= WALK_MAX;
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
    fx = fx.filter((f) => { f.life -= sdt; f.y -= sdt * 20; return f.life > 0; });
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
    setSpeedUI(0);
    clearRun();
    save.best.days = Math.max(save.best.days || 0, state.stats.daysSurvived);
    save.best.delivered = Math.max(save.best.delivered || 0, state.stats.delivered);
    save.best.houses = Math.max(save.best.houses || 0, state.houses.length);
    persistSettings();
    renderResults();
    $('#results').hidden = false;
  }
  function renderResults() {
    $('#res-sub').textContent = `Happiness ran out on day ${state.stats.daysSurvived}, week ${state.week}.`;
    const rows = [
      ['Passengers delivered', state.stats.delivered],
      ['Days survived', state.stats.daysSurvived],
      ['Houses in town', state.houses.length],
      ['Best delivered', save.best.delivered],
      ['Best days', save.best.days],
      ['Biggest town', save.best.houses],
    ];
    const ol = $('#resboard');
    ol.innerHTML = '';
    rows.forEach(([label, val]) => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="who">${label}</span><b>${val}</b>`;
      ol.appendChild(li);
    });
  }

  // ---------- camera ----------
  // The mat always fills the view: you can't zoom out past it or pan off its
  // edge. It auto-fits to the town until you take the wheel yourself, and
  // "Fit view" hands it back.

  const camera = { cx: WORLD.w / 2, cy: WORLD.h / 2, scale: 0.6, manual: false };
  function minScale() { return Math.max(canvasCW / WORLD.w, canvasCH / WORLD.h); }
  function clampCamera() {
    const lo = minScale();
    camera.scale = clamp(camera.scale, lo, Math.max(ZOOM_MAX, lo * 1.5));
    const hw = canvasCW / 2 / camera.scale, hh = canvasCH / 2 / camera.scale;
    camera.cx = clamp(camera.cx, hw, WORLD.w - hw);
    camera.cy = clamp(camera.cy, hh, WORLD.h - hh);
  }
  function updateCamera(dt) {
    if (!camera.manual) {
      const pts = stations.concat(state.houses);
      let targetScale = minScale(), targetCx = WORLD.w / 2, targetCy = WORLD.h / 2;
      if (pts.length) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        pts.forEach((p) => {
          minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
          minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
        });
        const margin = 200;
        minX -= margin; minY -= margin; maxX += margin; maxY += margin;
        const w = Math.max(500, maxX - minX), h = Math.max(340, maxY - minY);
        targetScale = clamp(Math.min(canvasCW / w, canvasCH / h), minScale(), 1.1);
        targetCx = (minX + maxX) / 2; targetCy = (minY + maxY) / 2;
      }
      const k = clamp(dt * 1.4, 0, 1);
      camera.cx += (targetCx - camera.cx) * k;
      camera.cy += (targetCy - camera.cy) * k;
      camera.scale += (targetScale - camera.scale) * k;
    }
    clampCamera();
  }
  function worldToScreen(x, y) {
    return { x: canvasCW / 2 + (x - camera.cx) * camera.scale, y: canvasCH / 2 + (y - camera.cy) * camera.scale };
  }
  function screenToWorld(x, y) {
    return { x: camera.cx + (x - canvasCW / 2) / camera.scale, y: camera.cy + (y - canvasCH / 2) / camera.scale };
  }
  // Zoom by `factor`, keeping the world point under screen (sx, sy) still.
  function zoomAt(sx, sy, factor) {
    const before = screenToWorld(sx, sy);
    camera.scale *= factor;
    camera.manual = true;
    clampCamera();
    const after = screenToWorld(sx, sy);
    camera.cx += before.x - after.x;
    camera.cy += before.y - after.y;
    clampCamera();
  }

  // ---------- rendering ----------

  const canvas = $('#mat');
  const ctx = canvas.getContext('2d');
  const arena = $('#arena');
  let canvasCW = 800, canvasCH = 600, dpr = 1;

  function fitCanvas() {
    const rect = arena.getBoundingClientRect();
    dpr = Math.max(1, window.devicePixelRatio || 1);
    canvasCW = rect.width; canvasCH = rect.height;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (state) clampCamera();
  }

  const textures = {};
  function loadTextures() {
    const files = { felt: 'felt.jpg' };
    const promises = Object.entries(files).map(([key, src]) => new Promise((res) => {
      const img = new Image();
      img.onload = () => { textures[key] = ctx.createPattern(img, 'repeat'); res(); };
      img.onerror = () => res();
      img.src = `assets/${src}`;
    }));
    return Promise.all(promises);
  }

  // What the set is made of. Drawing only — none of this touches the rules.
  const UI_FONT = '"Fredoka", "Nunito", ui-rounded, system-ui, sans-serif';
  const TRACK_W = 18;              // one wooden track piece, side to side, world units
  const WOOD = { light: '#f0d29d', mid: '#d9a864', dark: '#b27b3f', edge: '#7d5530' };
  const PEG_HEAD = '#f3d3a4';
  const TRACK_WOOD = '#dfae6c';
  const POINTS_OFF = '#cf5a44';    // a stretch the next train through a junction won't take
  const ROOF_COLORS = ['#d1533b', '#3f84b0', '#e0ac2a', '#5a9c4e', '#c1602f', '#8a63b0'];
  const WALL_COLORS = ['#fbf1dc', '#f6e2c6', '#eef1ea', '#f8e9b8'];
  const TREE_GREENS = [['#6aae5a', '#4d8b45'], ['#5c9f55', '#3f7a3d'], ['#7ab85e', '#5a9447']];

  // hex colour arithmetic, cached — the same few colours are mixed every frame
  const mixCache = new Map();
  function mix(a, b, t) {
    const key = a + b + t;
    let out = mixCache.get(key);
    if (out) return out;
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const ch = (s) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
    out = `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
    mixCache.set(key, out);
    return out;
  }
  const shade = (hex, t) => (t >= 0 ? mix(hex, '#ffffff', t) : mix(hex, '#000000', -t));
  // A stable number per spot on the mat, so a house keeps its roof colour and
  // a tree its shape from frame to frame without storing either.
  const hashXY = (x, y) => (((Math.round(x) * 73856093) ^ (Math.round(y) * 19349663)) >>> 0);
  const easeOutBack = (t) => 1 + 2.4 * Math.pow(t - 1, 3) + 1.4 * Math.pow(t - 1, 2);

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  // ----- the mat -----

  // Felt appliqué: a few big stitched-on patches of lighter and darker green.
  // They come from the river's shape, so a run keeps the same patches when
  // it's resumed without having to save them.
  let patchCache = { key: null, patches: [] };
  function feltPatches() {
    const key = state.river.map((p) => Math.round(p.y)).join(',');
    if (patchCache.key === key) return patchCache.patches;
    const rng = seeded(state.river.reduce((a, p) => a + Math.round(p.y * 3 + p.x), 0) % 233280);
    const patches = [];
    for (let i = 0; i < 11; i++) {
      const cx = 80 + rng() * (WORLD.w - 160), cy = 80 + rng() * (WORLD.h - 160);
      const r = 90 + rng() * 150, pts = [];
      const n = 9;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2, rr = r * (0.72 + rng() * 0.45);
        pts.push({ x: cx + Math.cos(a) * rr * 1.25, y: cy + Math.sin(a) * rr * 0.85 });
      }
      patches.push({ pts, light: rng() < 0.55 });
    }
    patchCache = { key, patches };
    return patches;
  }
  // A closed shape through the midpoints of its corners — soft, cut-cloth edges.
  function blobPath(pts) {
    ctx.beginPath();
    const n = pts.length;
    const mid = (i) => ({ x: (pts[i % n].x + pts[(i + 1) % n].x) / 2, y: (pts[i % n].y + pts[(i + 1) % n].y) / 2 });
    const m0 = mid(0);
    ctx.moveTo(m0.x, m0.y);
    for (let i = 1; i <= n; i++) {
      const m = mid(i);
      ctx.quadraticCurveTo(pts[i % n].x, pts[i % n].y, m.x, m.y);
    }
    ctx.closePath();
  }

  function drawMat() {
    ctx.fillStyle = textures.felt || '#5f9a55';
    ctx.fillRect(0, 0, WORLD.w, WORLD.h);
    // The ambientCG swatch this pattern comes from is a neutral grey weave —
    // multiply a green tint over it so the weave still shows through but the
    // mat reads as felt/baize rather than a stone floor.
    if (textures.felt) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = '#7dbb68';
      ctx.fillRect(0, 0, WORLD.w, WORLD.h);
      ctx.globalCompositeOperation = 'source-over';
    }
    feltPatches().forEach((p) => {
      blobPath(p.pts);
      ctx.fillStyle = p.light ? 'rgba(196, 226, 128, 0.12)' : 'rgba(40, 80, 40, 0.14)';
      ctx.fill();
      ctx.save();
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = p.light ? 'rgba(255, 250, 215, 0.26)' : 'rgba(30, 60, 30, 0.26)';
      ctx.stroke();
      ctx.restore();
    });
  }

  // The binding round the mat's edge, and its running stitch.
  function drawMatEdge() {
    ctx.save();
    ctx.strokeStyle = '#3f6e3c';
    ctx.lineWidth = 14;
    ctx.strokeRect(0, 0, WORLD.w, WORLD.h);
    ctx.strokeStyle = 'rgba(255, 244, 210, 0.6)';
    ctx.lineWidth = 2.2;
    ctx.setLineDash([10, 8]);
    ctx.strokeRect(16, 16, WORLD.w - 32, WORLD.h - 32);
    ctx.restore();
  }

  function riverPath() {
    ctx.beginPath();
    state.river.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  }
  // Blue felt laid on the green: a shadowed bank, a stitched edge each side,
  // and a few pale ripples down the middle.
  function drawRiver() {
    const w = RIVER_HALFWIDTH * 2;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    riverPath();
    ctx.strokeStyle = 'rgba(30, 55, 25, 0.35)';
    ctx.lineWidth = w + 12;
    ctx.stroke();
    ctx.strokeStyle = '#3f7fb2';
    ctx.lineWidth = w + 2;
    ctx.stroke();
    // stitches: a dashed band just inside each edge, then the water over its middle
    ctx.setLineDash([7, 6]);
    ctx.strokeStyle = 'rgba(230, 244, 255, 0.75)';
    ctx.lineWidth = w - 5;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = '#5ea1d0';
    ctx.lineWidth = w - 9;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(160, 210, 240, 0.55)';
    ctx.lineWidth = w * 0.35;
    ctx.stroke();
    // ripples drift downstream
    ctx.setLineDash([18, 46]);
    ctx.lineDashOffset = -performance.now() / 90;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 2.4;
    ctx.save(); ctx.translate(0, -7); riverPath(); ctx.stroke(); ctx.restore();
    ctx.lineDashOffset = -performance.now() / 90 + 30;
    ctx.save(); ctx.translate(0, 8); riverPath(); ctx.stroke(); ctx.restore();
    ctx.restore();
  }

  // ----- trees and houses -----

  function drawTree(t) {
    const h = hashXY(t.x, t.y);
    const [lite, dark] = TREE_GREENS[h % TREE_GREENS.length];
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.scale(t.scale, t.scale);
    ctx.fillStyle = 'rgba(25, 50, 20, 0.28)';
    ctx.beginPath(); ctx.ellipse(6, 11, 13, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8a5a30';
    ctx.fillRect(-2.5, 2, 5, 10);
    ctx.fillStyle = '#6d4424';
    ctx.fillRect(0.5, 2, 2, 10);
    if (h % 4 === 3) {
      // a round wooden lollipop tree
      ctx.fillStyle = dark;
      ctx.beginPath(); ctx.arc(0, -6, 11.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = lite;
      ctx.beginPath(); ctx.arc(-1.8, -7.8, 9.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 230, 0.35)';
      ctx.beginPath(); ctx.ellipse(-4.5, -11, 3.6, 2.4, -0.6, 0, Math.PI * 2); ctx.fill();
    } else {
      // a stacked fir: each tier lit on the left, in shade on the right
      for (let i = 0; i < 3; i++) {
        const top = -21 + i * 7, base = 3 + i * 3, half = 13 - i * 2.2;
        ctx.fillStyle = dark;
        ctx.beginPath(); ctx.moveTo(0, top); ctx.lineTo(half, base - i * 5); ctx.lineTo(-half, base - i * 5); ctx.closePath(); ctx.fill();
        ctx.fillStyle = lite;
        ctx.beginPath(); ctx.moveTo(0, top); ctx.lineTo(0, base - i * 5); ctx.lineTo(-half, base - i * 5); ctx.closePath(); ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawToyHouse(hs) {
    const h = hashXY(hs.x, hs.y);
    const roof = ROOF_COLORS[h % ROOF_COLORS.length];
    const wall = WALL_COLORS[(h >> 4) % WALL_COLORS.length];
    // a new house pops up out of the felt
    const age = hs.born !== undefined ? (state.totalTime - hs.born) / 0.45 : 1;
    const grow = age >= 1 ? 1 : easeOutBack(clamp(age, 0, 1));
    if (grow <= 0.02) return;
    ctx.save();
    ctx.translate(hs.x, hs.y);
    ctx.scale(hs.scale * grow * 1.2, hs.scale * grow * 1.2);
    ctx.fillStyle = 'rgba(25, 50, 20, 0.3)';
    roundRect(ctx, -8, 1, 24, 14, 3); ctx.fill();
    // walls
    ctx.fillStyle = wall;
    ctx.fillRect(-10, -2, 20, 13);
    ctx.fillStyle = 'rgba(90, 60, 30, 0.14)';
    ctx.fillRect(4, -2, 6, 13);
    ctx.strokeStyle = 'rgba(90, 60, 30, 0.4)';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(-10, -2, 20, 13);
    ctx.fillStyle = '#9a6536';
    ctx.fillRect(-2.2, 4, 4.4, 7);
    ctx.fillStyle = '#a9d3e8';
    ctx.fillRect(-8, 1.5, 4, 3.8);
    ctx.fillRect(4.5, 1.5, 4, 3.8);
    // roof, lit on its near slope
    if (h % 3 === 0) { ctx.fillStyle = '#8a5a30'; ctx.fillRect(4, -15, 3.2, 6); }
    ctx.fillStyle = shade(roof, -0.18);
    ctx.beginPath(); ctx.moveTo(-13, 0); ctx.lineTo(13, 0); ctx.lineTo(9, -13); ctx.lineTo(-9, -13); ctx.closePath(); ctx.fill();
    ctx.fillStyle = roof;
    ctx.beginPath(); ctx.moveTo(-13, 0); ctx.lineTo(13, 0); ctx.lineTo(11, -6); ctx.lineTo(-11, -6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.fillRect(-9, -13, 18, 1.6);
    ctx.restore();
  }

  // ----- station emblems, labels, pegs -----

  function drawGlyph(type, x, y, r, color = '#fff8ec') {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = color;
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 1;
    const s = r * 0.5;
    if (type === 'house') {
      ctx.beginPath();
      ctx.moveTo(-s, s * 0.15); ctx.lineTo(-s, s); ctx.lineTo(s, s); ctx.lineTo(s, s * 0.15);
      ctx.lineTo(0, -s); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (type === 'shop') {
      ctx.beginPath(); ctx.rect(-s, -s * 0.2, s * 2, s * 1.2); ctx.fill(); ctx.stroke();
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.arc(i * s * 0.4, -s * 0.2, s * 0.24, Math.PI, 0);
        ctx.fill();
      }
    } else if (type === 'school') {
      ctx.beginPath(); ctx.rect(-s, -s * 0.3, s * 2, s * 1.3); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(0, -s * 0.3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.6, -s * 0.8); ctx.lineTo(0, -s * 0.62); ctx.closePath(); ctx.fill();
    } else if (type === 'park') {
      ctx.beginPath(); ctx.arc(0, -s * 0.1, s * 0.8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillRect(-s * 0.12, s * 0.4, s * 0.24, s * 0.5);
    } else {
      ctx.beginPath(); ctx.rect(-s, -s * 0.4, s * 2, s * 1.4); ctx.fill(); ctx.stroke();
      ctx.beginPath();
      for (let i = -1; i <= 1; i++) { ctx.rect(i * s * 0.7 - s * 0.18, -s * 0.9, s * 0.36, s * 0.5); }
      ctx.fill();
    }
    ctx.restore();
  }

  // A little cream tag in screen pixels at a world position, so it stays
  // readable at any zoom. It has to drop the world transform first — drawing
  // screen coordinates inside it is what used to throw station names off
  // across the mat whenever the camera wasn't at 1x.
  function drawWorldLabel(text, x, y, color, size = 12) {
    const p = worldToScreen(x, y);
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = `600 ${size}px ${UI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + 14, h = size + 9;
    ctx.fillStyle = 'rgba(58, 40, 20, 0.22)';
    roundRect(ctx, p.x - w / 2, p.y - h / 2 + 2, w, h, h / 2); ctx.fill();
    ctx.fillStyle = 'rgba(255, 249, 236, 0.94)';
    roundRect(ctx, p.x - w / 2, p.y - h / 2, w, h, h / 2); ctx.fill();
    ctx.fillStyle = color || '#3a2c1c';
    ctx.fillText(text, p.x, p.y + 0.5);
    ctx.restore();
  }

  // A station's name board: painted green, framed in wood, on two posts.
  // (x, y) is where the posts meet the platform.
  function drawSign(text, x, y) {
    const p = worldToScreen(x, y);
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const fs = clamp(9 + camera.scale * 4, 11, 17);
    ctx.font = `600 ${fs}px ${UI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + fs * 1.5, h = fs + 9, top = p.y - 7 - h;
    ctx.fillStyle = WOOD.dark;
    ctx.fillRect(p.x - w / 2 + 8, top + h - 2, 3, 9);
    ctx.fillRect(p.x + w / 2 - 11, top + h - 2, 3, 9);
    ctx.fillStyle = 'rgba(30, 40, 20, 0.3)';
    roundRect(ctx, p.x - w / 2 + 1, top + 3, w, h, 5); ctx.fill();
    ctx.fillStyle = WOOD.mid;
    roundRect(ctx, p.x - w / 2, top, w, h, 5); ctx.fill();
    ctx.fillStyle = '#2f5a40';
    roundRect(ctx, p.x - w / 2 + 2.5, top + 2.5, w - 5, h - 5, 3.5); ctx.fill();
    ctx.fillStyle = '#fff1d2';
    ctx.fillText(text, p.x, top + h / 2 + 0.5);
    ctx.restore();
  }

  // A peg person: wooden head, painted body, a little shadow.
  function drawPeg(x, y, color, r) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(25, 45, 20, 0.3)';
    ctx.beginPath(); ctx.ellipse(r * 0.15, r * 0.62, r * 0.55, r * 0.22, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-r * 0.45, r * 0.6);
    ctx.bezierCurveTo(-r * 0.5, r * 0.05, -r * 0.3, -r * 0.12, 0, -r * 0.12);
    ctx.bezierCurveTo(r * 0.3, -r * 0.12, r * 0.5, r * 0.05, r * 0.45, r * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.beginPath(); ctx.ellipse(-r * 0.2, r * 0.22, r * 0.1, r * 0.28, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = PEG_HEAD;
    ctx.beginPath(); ctx.arc(0, -r * 0.42, r * 0.34, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.beginPath(); ctx.arc(-r * 0.12, -r * 0.54, r * 0.1, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // ----- track -----

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
  // Lines sharing a stretch lie side by side, a track's width apart. The
  // sideways direction is taken from the lower station id to the higher, so
  // it agrees whichever way along the stretch a line happens to run.
  function laneOffset(lanes, lineId, a, b) {
    const on = lanes.get(edgeKey(a.id, b.id));
    if (!on || on.length < 2) return { x: 0, y: 0 };
    const off = (on.indexOf(lineId) - (on.length - 1) / 2) * TRACK_W;
    const [p, q] = a.id < b.id ? [a, b] : [b, a];
    const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    return { x: (-(q.y - p.y) / len) * off, y: ((q.x - p.x) / len) * off };
  }
  // Every stretch of track on the board, each shifted into its own lane.
  function trackStretches() {
    const lanes = laneMap(), out = [];
    lines.forEach((line) => {
      const pts = linePathPoints(line), n = pts.length;
      const segs = line.loop && n > 2 ? n : n - 1;
      for (let i = 0; i < segs; i++) {
        const a = pts[i], b = pts[(i + 1) % n];
        const o = laneOffset(lanes, line.id, a, b);
        out.push({ line, a, b, ax: a.x + o.x, ay: a.y + o.y, bx: b.x + o.x, by: b.y + o.y });
      }
    });
    return out;
  }

  // How the points are set at each junction, as the next train through will
  // find them: the stretches it WON'T take, as "stationId|neighbourId" from
  // the junction's side. The next train through is one standing there (its
  // way is already picked), else the nearest one on its way in.
  function pointsAgainst() {
    const off = new Set();
    stations.forEach((s) => {
      if ((routing.adj.get(s.id) || []).length < 3) return;
      let next = null, nextD = Infinity;
      trains.forEach((t) => {
        let d = Infinity;
        if (t.at === s.id && t.atStation && t.to !== null) d = 0;   // standing here, way already picked
        else if (t.to === s.id && !t.atStation) d = (1 - t.prog) * dist(stationById(t.at), s);
        else if (t.to === s.id && t.atStation) d = dist(stationById(t.at), s) + 1;
        if (d < nextD) { nextD = d; next = t; }
      });
      if (!next) return;
      const standing = next.at === s.id;
      const onward = onwardWays(standing ? next.prev : next.at, s);
      if (onward.length < 2) return;
      const taken = standing ? next.to : onward[((s.points || 0) + 1) % onward.length];
      onward.forEach((id) => { if (id !== taken) off.add(`${s.id}|${id}`); });
    });
    return off;
  }

  // Wooden track, all plain maple, with the two grooves the wheels run in
  // and a jigsaw joint between every piece it took from the box. The half of
  // a stretch next to a junction is painted red when the points there are
  // set against it for the next train through.
  function drawTracks() {
    const stretches = trackStretches();
    const running = stationsWithTrains();
    const off = pointsAgainst();
    // the Remove tool shows exactly which run of track a click would pull up
    const doomed = state.tool === 'remove' && hover && !trainAt(hover) && !stationAt(hover) ? lineAt(hover) : null;
    const hw = TRACK_W / 2 - 0.5;
    const frame = (s) => {
      ctx.translate(s.ax, s.ay);
      ctx.rotate(Math.atan2(s.by - s.ay, s.bx - s.ax));
      return Math.hypot(s.bx - s.ax, s.by - s.ay);
    };
    ctx.save();
    stretches.forEach((s) => {
      ctx.save();
      const L = frame(s);
      ctx.fillStyle = 'rgba(25, 45, 20, 0.3)';
      ctx.rotate(-Math.atan2(s.by - s.ay, s.bx - s.ax));
      ctx.translate(3, 4);
      ctx.rotate(Math.atan2(s.by - s.ay, s.bx - s.ax));
      ctx.fillRect(0, -hw, L, hw * 2);
      ctx.restore();
    });
    stretches.forEach((s) => {
      ctx.save();
      const L = frame(s);
      const wood = TRACK_WOOD;
      ctx.fillStyle = shade(wood, -0.2);
      ctx.fillRect(0, -hw, L, hw * 2);
      ctx.fillStyle = wood;
      ctx.fillRect(0, -hw + 1.2, L, hw * 2 - 2.4);
      const paintOff = (x0, x1) => {
        ctx.fillStyle = shade(POINTS_OFF, -0.2);
        ctx.fillRect(x0, -hw, x1 - x0, hw * 2);
        ctx.fillStyle = POINTS_OFF;
        ctx.fillRect(x0, -hw + 1.2, x1 - x0, hw * 2 - 2.4);
      };
      if (off.has(`${s.a.id}|${s.b.id}`)) paintOff(0, L / 2);
      if (off.has(`${s.b.id}|${s.a.id}`)) paintOff(L / 2, L);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.fillRect(0, -1, L, 2);
      ctx.fillStyle = 'rgba(45, 25, 10, 0.5)';
      ctx.fillRect(0, -5.2, L, 2.6);
      ctx.fillRect(0, 2.6, L, 2.6);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.fillRect(0, -2.6, L, 0.8);
      ctx.fillRect(0, 5.2, L, 0.8);
      // joints between pieces: a seam and the round peg that holds them
      const pieces = Math.max(1, segmentPieces(s.a.id, s.b.id).track);
      for (let k = 1; k < pieces; k++) {
        const x = (L * k) / pieces;
        ctx.fillStyle = 'rgba(45, 25, 10, 0.5)';
        ctx.fillRect(x - 0.6, -hw, 1.2, hw * 2);
        ctx.fillStyle = wood;
        ctx.beginPath(); ctx.arc(x + 2.2, 0, 2.6, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(45, 25, 10, 0.45)';
        ctx.lineWidth = 0.9;
        ctx.stroke();
      }
      if (doomed === s.line) {
        ctx.strokeStyle = 'rgba(255, 244, 220, 0.95)';
        ctx.lineWidth = 3;
        ctx.strokeRect(-1, -hw - 1.5, L + 2, hw * 2 + 3);
      }
      if (!running.has(s.a.id)) {
        // No train runs here yet: stripe it pale so it reads as unfinished.
        ctx.strokeStyle = 'rgba(255, 248, 236, 0.85)';
        ctx.lineWidth = 3;
        ctx.setLineDash([9, 9]);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(L, 0); ctx.stroke();
      }
      ctx.restore();
    });
    ctx.restore();
  }

  // One label per stretch of joined-up track that no train can reach.
  function drawLineWarnings() {
    const running = stationsWithTrains();
    const said = new Set();
    lines.forEach((line) => {
      const pts = linePathPoints(line);
      if (pts.length < 2 || running.has(pts[0].id) || said.has(pts[0].id)) return;
      // mark everything joined to this line as already labelled
      const q = [pts[0].id];
      said.add(pts[0].id);
      for (let qi = 0; qi < q.length; qi++) for (const o of routing.adj.get(q[qi]) || []) if (!said.has(o)) { said.add(o); q.push(o); }
      const a = pts[0], b = pts[1];
      drawWorldLabel('no train yet', (a.x + b.x) / 2, (a.y + b.y) / 2 - 18, '#c1602f');
    });
  }

  // A plank bridge where a stretch of track crosses the stream.
  function drawBridges() {
    const lanes = laneMap();
    state.bridges.forEach((key) => {
      const [aId, bId] = key.split('|').map(Number);
      const a = stationById(aId), b = stationById(bId);
      if (!a || !b) return;
      // Where this stretch of track actually meets the river — the two
      // stations' own midpoint is very often nowhere near the real crossing,
      // since the river bends and the track usually doesn't cross it square on.
      let cross = null, seg = 0;
      const river = state.river;
      for (let i = 0; i < river.length - 1 && !cross; i++) { cross = segIntersectPoint(a, b, river[i], river[i + 1]); seg = i; }
      if (!cross) return;
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const rAng = Math.atan2(river[seg + 1].y - river[seg].y, river[seg + 1].x - river[seg].x);
      const len = Math.min(140, (RIVER_HALFWIDTH * 2 + 30) / Math.max(0.35, Math.abs(Math.sin(ang - rAng))));
      const lanesHere = (lanes.get(key) || []).length || 1;
      const half = (lanesHere * TRACK_W) / 2 + 7;
      ctx.save();
      ctx.translate(cross.x, cross.y);
      ctx.rotate(ang);
      ctx.fillStyle = 'rgba(20, 50, 80, 0.35)';
      ctx.fillRect(-len / 2 + 4, -half + 6, len, half * 2);
      const planks = Math.round(len / 7);
      for (let i = 0; i < planks; i++) {
        ctx.fillStyle = i % 2 ? WOOD.mid : shade(WOOD.mid, 0.12);
        ctx.fillRect(-len / 2 + (i * len) / planks, -half, len / planks + 0.5, half * 2);
      }
      ctx.fillStyle = 'rgba(80, 50, 25, 0.35)';
      for (let i = 1; i < planks; i++) ctx.fillRect(-len / 2 + (i * len) / planks - 0.4, -half, 0.8, half * 2);
      // side rails and their posts
      [-half, half].forEach((y) => {
        ctx.fillStyle = WOOD.edge;
        roundRect(ctx, -len / 2 - 3, y - 3, len + 6, 6, 3); ctx.fill();
        ctx.fillStyle = shade(WOOD.dark, 0.2);
        roundRect(ctx, -len / 2 - 3, y - 3, len + 6, 3.4, 2); ctx.fill();
        for (let x = -len / 2; x <= len / 2 + 0.1; x += len / 3) {
          ctx.fillStyle = WOOD.edge;
          ctx.beginPath(); ctx.arc(x, y, 3.6, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = WOOD.light;
          ctx.beginPath(); ctx.arc(x - 0.8, y - 0.8, 1.6, 0, Math.PI * 2); ctx.fill();
        }
      });
      ctx.restore();
    });
  }

  // ----- stations -----

  const coreRadius = (level) => STATION_WORLD_R * (1 + level * 0.12);
  // How far a station's platform reaches, for clearing houses round it and
  // for sizing the platform itself.
  function platformRadius(level) {
    return level ? coreRadius(level) + level * 7 : coreRadius(level);
  }
  // The platform as drawn: a planked rectangle, wider and deeper per upgrade.
  // The station building stands on its back half; people wait on the front.
  function platformRect(level) {
    return { hw: platformRadius(level) + 4, y0: -26 - level * 4, y1: 25 + level * 4 };
  }
  // Top of the station building (the clock tower adds a little), where the
  // name board stands.
  const roofTop = (level) => 35 + (level >= 2 ? 10 : 0);

  function platformPath(p, x = 0, y = 0) {
    roundRect(ctx, x - p.hw, y + p.y0, p.hw * 2, p.y1 - p.y0, 6);
  }

  // The Station tool over a station that's already placed: the bigger
  // platform it would get, and what that takes from the toy box.
  function drawUpgradeGhost(s) {
    const u = upgradeInfo(s);
    let text, color, below;
    ctx.save();
    ctx.lineWidth = 3 / camera.scale;
    if (u.full) {
      const p = platformRect(s.level);
      ctx.strokeStyle = 'rgba(255,248,236,0.85)';
      below = p.y1 + 4;
      roundRect(ctx, s.x - p.hw - 4, s.y + p.y0 - 4, p.hw * 2 + 8, p.y1 - p.y0 + 8, 8); ctx.stroke();
      text = 'Biggest platform already'; color = '#3a2c1c';
    } else {
      // A see-through version of the platform it would get, between the
      // station's current edge and its new one, with a dashed outline.
      const pn = platformRect(s.level + 1), pc = platformRect(s.level);
      below = pn.y1 + 2;
      const pulse = 0.75 + 0.25 * Math.sin(performance.now() / 260);
      ctx.beginPath();
      ctx.rect(s.x - pn.hw, s.y + pn.y0, pn.hw * 2, pn.y1 - pn.y0);
      ctx.rect(s.x - pc.hw, s.y + pc.y0, pc.hw * 2, pc.y1 - pc.y0);
      ctx.fillStyle = u.ok ? `rgba(217,168,100,${0.8 * pulse})` : `rgba(193,96,47,${0.45 * pulse})`;
      ctx.fill('evenodd');
      ctx.setLineDash([7, 5]);
      ctx.strokeStyle = u.ok ? 'rgba(255,248,236,0.95)' : 'rgba(193,96,47,0.95)';
      roundRect(ctx, s.x - pn.hw - 2, s.y + pn.y0 - 2, pn.hw * 2 + 4, pn.y1 - pn.y0 + 4, 7); ctx.stroke();
      text = u.ok
        ? `Upgrade: room for ${u.to} (now ${u.from}) · ${u.cost} ${invName('stations', u.cost)}`
        : `Upgrade needs ${u.cost} ${invName('stations', u.cost)} — you have ${state.inv.stations}`;
      color = u.ok ? '#2c4a39' : '#c1602f';
    }
    ctx.restore();
    // below the station, so it never sits on top of the name board
    drawWorldLabel(text, s.x, s.y + below + 14 / camera.scale, color, 13);
  }

  // A wooden platform with a little station building on it: roof painted in
  // the station's colour, its emblem on a badge, a striped awning over the
  // door. Upgrades make the platform bigger, add benches, then a clock tower.
  function drawStation(s) {
    const lv = s.level;
    const p = platformRect(lv);
    const color = TYPES[s.type].color;
    ctx.save();
    ctx.translate(s.x, s.y);

    // platform: shadow, the thickness of its front edge, then the planked top
    ctx.fillStyle = 'rgba(25, 45, 20, 0.32)';
    platformPath(p, 4, 6); ctx.fill();
    ctx.fillStyle = WOOD.edge;
    platformPath(p, 0, 3); ctx.fill();
    const g = ctx.createLinearGradient(0, p.y0, 0, p.y1);
    g.addColorStop(0, WOOD.light);
    g.addColorStop(1, WOOD.mid);
    ctx.fillStyle = g;
    platformPath(p); ctx.fill();
    ctx.save();
    platformPath(p); ctx.clip();
    ctx.fillStyle = 'rgba(110, 72, 36, 0.28)';
    for (let y = p.y0 + 7; y < p.y1; y += 7) ctx.fillRect(-p.hw, y, p.hw * 2, 0.9);
    ctx.restore();
    // a painted edge in the station's colour, so its type reads from afar
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.6;
    roundRect(ctx, -p.hw + 3, p.y0 + 3, p.hw * 2 - 6, p.y1 - p.y0 - 6, 4); ctx.stroke();

    if (lv >= 1) {
      // benches either side of the building
      [-1, 1].forEach((side) => {
        const bx = side * (p.hw - 10);
        ctx.fillStyle = WOOD.edge;
        ctx.fillRect(bx - 5, -9, 10, 5);
        ctx.fillStyle = WOOD.dark;
        ctx.fillRect(bx - 5, -11, 10, 3);
      });
    }

    // the station building
    const bw = 17 + lv * 3;
    ctx.fillStyle = 'rgba(25, 45, 20, 0.25)';
    ctx.fillRect(-bw + 3, -14, bw * 2, 12);
    ctx.fillStyle = '#fbf1dc';
    ctx.fillRect(-bw, -16, bw * 2, 13);
    ctx.fillStyle = 'rgba(90, 60, 30, 0.12)';
    ctx.fillRect(bw - 6, -16, 6, 13);
    ctx.fillStyle = '#9a6536';
    roundRect(ctx, -3.5, -12, 7, 9, 3); ctx.fill();
    ctx.fillStyle = '#a9d3e8';
    ctx.fillRect(-bw + 4, -12.5, 5, 4.5);
    ctx.fillRect(bw - 9, -12.5, 5, 4.5);
    // roof, lit on its near slope
    ctx.fillStyle = shade(color, -0.22);
    ctx.beginPath(); ctx.moveTo(-bw - 4, -15); ctx.lineTo(bw + 4, -15); ctx.lineTo(bw - 3, -35); ctx.lineTo(-bw + 3, -35); ctx.closePath(); ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(-bw - 4, -15); ctx.lineTo(bw + 4, -15); ctx.lineTo(bw + 0.5, -25); ctx.lineTo(-bw - 0.5, -25); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.fillRect(-bw + 3, -35, bw * 2 - 6, 1.8);
    if (lv >= 2) {
      // clock tower
      ctx.fillStyle = '#fbf1dc';
      ctx.fillRect(-6, -45, 12, 12);
      ctx.fillStyle = shade(color, -0.3);
      ctx.beginPath(); ctx.moveTo(-8, -44); ctx.lineTo(8, -44); ctx.lineTo(0, -50); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(0, -39, 4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#3a2c1c';
      ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.moveTo(0, -39); ctx.lineTo(0, -41.8); ctx.moveTo(0, -39); ctx.lineTo(2, -39); ctx.stroke();
    }
    // striped awning over the front
    const aw = bw + 3, stripes = Math.round(aw / 3);
    for (let i = 0; i < stripes; i++) {
      ctx.fillStyle = i % 2 ? '#fff8ec' : color;
      const x = -aw + (i * aw * 2) / stripes;
      ctx.fillRect(x, -5, (aw * 2) / stripes + 0.3, 3.5);
      ctx.beginPath(); ctx.arc(x + aw / stripes, -1.5, aw / stripes, 0, Math.PI); ctx.fill();
    }
    // the emblem: a cream badge on the roof
    ctx.fillStyle = shade(color, -0.35);
    ctx.beginPath(); ctx.arc(0.6, -23.4, 8.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff8ec';
    ctx.beginPath(); ctx.arc(0, -24, 8.2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    drawGlyph(s.type, s.x, s.y - 24, 13, color);

    // People waiting on the front of the platform, two rows, back row first.
    const shown = Math.min(s.pegs.length, 8);
    const perRow = 4;
    const gap = Math.min(13, (p.hw * 2 - 12) / perRow);
    const order = [];
    for (let i = 0; i < shown; i++) {
      const back = i >= perRow;
      const k = back ? i - perRow : i;
      const px = s.x + (k - (perRow - 1) / 2) * gap + (back ? gap / 2 : 0);
      const py = s.y + (back ? 9 : 18) + lv * 2;
      order[i] = { i, px, py, back };
    }
    order.sort((a, b) => a.py - b.py).forEach(({ i, px, py }) => {
      const peg = s.pegs[i];
      if (peg.walked) {
        // walked here: an orange ring, red once they're past their patience
        ctx.fillStyle = grumbling(peg) ? 'rgba(210,60,40,0.75)' : 'rgba(240,140,40,0.6)';
        ctx.beginPath(); ctx.arc(px, py - 1, 8.5, 0, Math.PI * 2); ctx.fill();
      }
      drawPeg(px, py, TYPES[peg.type].color, 10);
    });
  }

  // Names and queue counts go on after everything else so no train or house
  // is ever drawn over them.
  function drawStationLabels(s) {
    const p = platformRect(s.level);
    const cap = STATION_BASE_CAP[s.level];
    drawSign(s.name, s.x, s.y - roofTop(s.level));
    if (s.pegs.length > 8) drawWorldLabel(`+${s.pegs.length - 8}`, s.x, s.y + p.y1 + 12, '#c1602f');
    if (s.pegs.length > cap) drawWorldLabel(`${s.pegs.length} waiting`, s.x, s.y + p.y1 + (s.pegs.length > 8 ? 30 : 12), '#c1602f');
  }

  // ----- trains -----

  function trainPosition(train) {
    const a = stationById(train.at);
    if (!a) return null;
    const b = train.to !== null && !train.atStation ? stationById(train.to) : null;
    if (!b) {
      // standing at a station, facing the way it's about to go (or came)
      const next = train.to !== null ? stationById(train.to) : null;
      const prev = train.prev !== null ? stationById(train.prev) : null;
      const ang = next ? Math.atan2(next.y - a.y, next.x - a.x) : prev ? Math.atan2(a.y - prev.y, a.x - prev.x) : 0;
      return { x: a.x, y: a.y, ang };
    }
    // ride in the lane of the first line laid along this stretch
    const lanes = laneMap();
    const on = lanes.get(edgeKey(a.id, b.id)) || [];
    const o = on.length ? laneOffset(lanes, on[0], a, b) : { x: 0, y: 0 };
    const t = clamp(train.prog, 0, 1);
    return { x: a.x + (b.x - a.x) * t + o.x, y: a.y + (b.y - a.y) * t + o.y, ang: Math.atan2(b.y - a.y, b.x - a.x) };
  }

  // Seen from above: little wheels peeking out each side.
  function drawWheels(x0, x1, half) {
    ctx.fillStyle = '#2a2018';
    [x0, x1].forEach((x) => {
      roundRect(ctx, x - 3, -half - 2.2, 6, 3, 1.2); ctx.fill();
      roundRect(ctx, x - 3, half - 0.8, 6, 3, 1.2); ctx.fill();
    });
  }

  function drawTrain(train) {
    const pos = trainPosition(train);
    if (!pos) return;
    const body = train.color || TRAIN_COLORS[0];
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(pos.ang);
    // shadow under the whole train, cast down-right whichever way it faces
    ctx.save();
    ctx.rotate(-pos.ang);
    ctx.translate(3, 4);
    ctx.rotate(pos.ang);
    ctx.fillStyle = 'rgba(25, 45, 20, 0.32)';
    roundRect(ctx, -train.carriages * 26 - 10, -8.5, train.carriages * 26 + 37, 17, 5); ctx.fill();
    ctx.restore();
    for (let c = train.carriages - 1; c >= 0; c--) {
      ctx.save();
      ctx.translate(-c * 26 - 22, 0);
      ctx.fillStyle = '#2a2018';
      ctx.beginPath(); ctx.arc(12.5, 0, 2, 0, Math.PI * 2); ctx.fill();   // coupling
      drawWheels(-6, 6, 8);
      const paint = shade(body, 0.22);
      ctx.fillStyle = shade(paint, -0.22);
      roundRect(ctx, -11, -8, 22, 16, 4); ctx.fill();
      ctx.fillStyle = paint;
      roundRect(ctx, -11, -8, 22, 14.5, 4); ctx.fill();
      // the roof, and a row of windows down each side
      ctx.fillStyle = shade(paint, 0.4);
      roundRect(ctx, -8.5, -4.5, 17, 8, 3); ctx.fill();
      ctx.fillStyle = 'rgba(40, 60, 80, 0.55)';
      for (let k = -1; k <= 1; k++) { ctx.fillRect(k * 5.5 - 1.8, -7, 3.6, 1.8); ctx.fillRect(k * 5.5 - 1.8, 4.4, 3.6, 1.6); }
      ctx.restore();
    }
    // the engine: cab behind, boiler in front, chimney on top
    drawWheels(5, 19, 9);
    ctx.fillStyle = shade(body, -0.3);
    roundRect(ctx, 0, -9, 26, 18, 4); ctx.fill();
    ctx.fillStyle = body;
    roundRect(ctx, 0, -9, 11, 17, 3); ctx.fill();
    ctx.fillStyle = shade(body, 0.3);
    roundRect(ctx, 1.5, -6.5, 8, 12, 2); ctx.fill();
    const boiler = ctx.createLinearGradient(0, -6.5, 0, 6.5);
    boiler.addColorStop(0, shade(body, -0.1));
    boiler.addColorStop(0.4, shade(body, 0.3));
    boiler.addColorStop(1, shade(body, -0.2));
    ctx.fillStyle = boiler;
    roundRect(ctx, 10, -6.5, 16, 13, 6); ctx.fill();
    ctx.fillStyle = '#e0ac2a';
    ctx.fillRect(14.5, -6.5, 1.6, 13);
    ctx.fillStyle = '#2a2018';
    ctx.fillRect(26, -6, 2.4, 12);
    ctx.beginPath(); ctx.arc(21, 0, 3.4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#e0ac2a';
    ctx.lineWidth = 1.1;
    ctx.stroke();
    // steam, only while it's moving
    if (train.atStation === null && state.speedIdx > 0) {
      const now = performance.now() / 1000;
      for (let k = 0; k < 3; k++) {
        const ph = (now * 1.6 + k / 3) % 1;
        ctx.fillStyle = `rgba(255, 255, 255, ${0.55 * (1 - ph)})`;
        ctx.beginPath(); ctx.arc(21 - ph * 34, Math.sin((ph + k) * 5) * 2.5, 3 + ph * 5, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }

  // The Station tool's ghost: where it would go, how many houses would feed
  // it, and whether it can go there at all.
  function drawStationGhost(p) {
    const why = state.inv.stations < 1 ? 'none left' : whyNotStation(p);
    const n = housesNear(p);
    ctx.save();
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 2 / camera.scale;
    ctx.strokeStyle = why ? 'rgba(193,96,47,0.55)' : 'rgba(255,248,236,0.75)';
    ctx.beginPath(); ctx.arc(p.x, p.y, DENSITY_R, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = why ? '#c1602f' : WOOD.light;
    platformPath(platformRect(0), p.x, p.y); ctx.fill();
    ctx.strokeStyle = why ? '#8a3a1a' : WOOD.edge;
    ctx.lineWidth = 2;
    ctx.stroke();
    // the building's outline, so it reads as a station before it's placed
    // its roof is already painted the colour it will be
    const next = TYPES[nextStationType()];
    if (!why) ctx.fillStyle = next.color;
    ctx.beginPath(); ctx.moveTo(p.x - 21, p.y - 15); ctx.lineTo(p.x + 21, p.y - 15); ctx.lineTo(p.x + 14, p.y - 35); ctx.lineTo(p.x - 14, p.y - 35); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
    drawWorldLabel(why ? (why === 'none left' ? 'No stations left' : why)
      : `${COLOUR_NAMES[nextStationType()]} station · ${n} ${n === 1 ? 'house' : 'houses'} nearby`,
      p.x, p.y - roofTop(0) - 16, why ? '#c1602f' : '#2c4a39', 13);
  }

  // A draft of track not yet laid: see-through wooden pieces.
  function draftStroke(pts) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.strokeStyle = 'rgba(240, 210, 157, 0.6)';
    ctx.lineWidth = TRACK_W;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(90, 60, 30, 0.6)';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 7]);
    ctx.stroke();
    ctx.restore();
  }

  // The station picked out with no tool in hand (null when none is).
  let selectedId = null;
  function selectStation(id) { selectedId = id; }

  // Its catchment: the ring of houses close enough to feed it, each of those
  // lit up in gold, and the houses further out that walk in to it ringed in
  // orange with a dotted footpath to the platform.
  function drawCatchment(s) {
    const pulse = 0.75 + 0.25 * Math.sin(performance.now() / 300);
    const far = walkersFor(s);
    ctx.save();
    const g = ctx.createRadialGradient(s.x, s.y, DENSITY_R * 0.2, s.x, s.y, DENSITY_R);
    g.addColorStop(0, 'rgba(255, 236, 170, 0.08)');
    g.addColorStop(1, 'rgba(255, 236, 170, 0.3)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(s.x, s.y, DENSITY_R, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 3 / camera.scale;
    ctx.strokeStyle = 'rgba(255, 244, 205, 0.95)';
    ctx.setLineDash([10 / camera.scale, 7 / camera.scale]);
    ctx.stroke();
    ctx.lineWidth = 1.8 / camera.scale;
    ctx.strokeStyle = 'rgba(240, 140, 40, 0.75)';
    ctx.setLineDash([4 / camera.scale, 5 / camera.scale]);
    far.forEach((h) => { ctx.beginPath(); ctx.moveTo(h.x, h.y + 6); ctx.lineTo(s.x, s.y); ctx.stroke(); });
    ctx.setLineDash([]);
    const ring = (h, rgb) => {
      const gl = ctx.createRadialGradient(h.x, h.y + 3, 4, h.x, h.y + 3, 22);
      gl.addColorStop(0, `rgba(${rgb}, ${0.55 * pulse})`);
      gl.addColorStop(1, `rgba(${rgb}, 0)`);
      ctx.fillStyle = gl;
      ctx.beginPath(); ctx.arc(h.x, h.y + 3, 22, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(${rgb}, 0.95)`;
      ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.ellipse(h.x + 1, h.y + 5, 18, 12, 0, 0, Math.PI * 2); ctx.stroke();
    };
    state.houses.forEach((h) => { if (dist(h, s) < DENSITY_R) ring(h, '255, 211, 90'); });
    far.forEach((h) => ring(h, '240, 140, 40'));
    ctx.restore();
  }
  function drawCatchmentLabel(s) {
    const near = housesNear(s), far = walkersFor(s).length;
    const text = `${near} ${near === 1 ? 'house' : 'houses'} close by` + (far ? ` · ${far} walk in` : '')
      + ` · ${s.pegs.length}/${STATION_BASE_CAP[s.level]} waiting`;
    drawWorldLabel(text, s.x, s.y + DENSITY_R, '#2c4a39', 13);
  }

  function draw() {
    ctx.fillStyle = '#3f6e3c';
    ctx.fillRect(0, 0, canvasCW, canvasCH);

    ctx.save();
    ctx.translate(canvasCW / 2, canvasCH / 2);
    ctx.scale(camera.scale, camera.scale);
    ctx.translate(-camera.cx, -camera.cy);

    drawMat();

    // Ground under each neighbourhood, nothing at all until its first house
    // goes up. A served one gets a soft gold "settled" tint. One with no
    // station, or only a station with no track, glows orange instead, going
    // red as it grows — the bigger the town you're ignoring, the louder it is.
    const pulse = 0.85 + 0.15 * Math.sin(performance.now() / 450);
    state.neighborhoods.forEach((n) => {
      if (!n.count) return;
      const r = neighbourhoodRadius(n);
      const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 1.15);
      if (neighbourhoodService(n) === 'served') {
        grad.addColorStop(0, `rgba(217, 158, 43, ${Math.min(0.3, 0.06 + n.count * 0.012)})`);
        grad.addColorStop(1, 'rgba(217, 158, 43, 0)');
      } else {
        const t = clamp(n.count / 25, 0, 1);            // orange → red with size
        const rgb = `${Math.round(240 - 30 * t)}, ${Math.round(140 - 90 * t)}, ${Math.round(40 - 5 * t)}`;
        const a = (0.3 + 0.2 * t) * pulse;
        grad.addColorStop(0, `rgba(${rgb}, ${a})`);
        grad.addColorStop(0.55, `rgba(${rgb}, ${a * 0.6})`);
        grad.addColorStop(1, `rgba(${rgb}, 0)`);
      }
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(n.x, n.y, r * 1.15, 0, Math.PI * 2); ctx.fill();
    });
    // A station with no track through it gets its own warning halo.
    stations.forEach((s) => {
      if (isConnected(s)) return;
      const r = STATION_WORLD_R * 2.6;
      const grad = ctx.createRadialGradient(s.x, s.y, STATION_WORLD_R * 0.6, s.x, s.y, r);
      grad.addColorStop(0, `rgba(215, 70, 40, ${0.45 * pulse})`);
      grad.addColorStop(1, 'rgba(215, 70, 40, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.fill();
    });

    drawRiver();
    drawMatEdge();

    if (selectedId !== null && !stationById(selectedId)) selectedId = null;
    const picked = selectedId !== null ? stationById(selectedId) : null;
    if (picked) drawCatchment(picked);

    // Trees and houses stand up off the mat, so the ones further down the
    // mat are nearer the viewer and go on last.
    const standing = state.trees.map((t) => ({ y: t.y, t })).concat(state.houses.map((h) => ({ y: h.y, h })));
    standing.sort((a, b) => a.y - b.y);
    standing.forEach((o) => (o.t ? drawTree(o.t) : drawToyHouse(o.h)));

    drawBridges();
    drawTracks();

    if (draft) {
      const pts = draft.stations.map(stationById).filter(Boolean);
      if (draft.cursor) pts.push(draft.cursor);
      if (pts.length > 1) draftStroke(pts);
    }

    const armed = armedFrom !== null && state.tool === 'track' ? stationById(armedFrom) : null;
    const armedTo = armed && hover ? stationAt(hover) : null;
    if (armed) {
      const pulseR = 3 * Math.sin(performance.now() / 200);
      ctx.save();
      ctx.strokeStyle = 'rgba(255,248,236,0.95)';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(armed.x, armed.y, platformRadius(armed.level) + 9 + pulseR, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      if (hover) draftStroke([armed, armedTo && armedTo !== armed ? armedTo : hover]);
    }

    // People on foot, heading for the nearest station.
    state.walkers.forEach((w) => {
      if (!stationById(w.stationId)) return;
      const p = walkerPosition(w);
      drawPeg(p.x, p.y + Math.abs(Math.sin(w.t * 9)) * -2, TYPES[w.type].color, 9);
    });

    stations.forEach(drawStation);
    trains.forEach(drawTrain);
    if (state.tool === 'station' && hover && !draft) {
      const over = stationAt(hover);
      if (over) drawUpgradeGhost(over); else drawStationGhost(hover);
    }

    stations.forEach(drawStationLabels);
    if (picked) drawCatchmentLabel(picked);
    drawLineWarnings();
    trains.forEach((t) => {
      if (!t.pegs.length) return;
      const pos = trainPosition(t);
      if (pos) drawWorldLabel(String(t.pegs.length), pos.x, pos.y - 22, '#3a2c1c', 11);
    });
    if (draft && draft.cursor && draft.stations.length) {
      // What the drag so far would cost, following the pointer.
      const ids = draft.stations.slice();
      const loop = ids.length >= 3 && ids[ids.length - 1] === ids[0];
      const need = costOf(draftSegments(loop ? ids.slice(0, -1) : ids, loop));
      if (need.track) {
        const text = `${need.track} / ${state.inv.track} track` + (need.bridges ? ` · ${need.bridges} / ${state.inv.bridges} ${invName('bridges', need.bridges)}` : '');
        drawWorldLabel(text, draft.cursor.x, draft.cursor.y - 26, affordable(need) ? '#2c4a39' : '#c1602f', 13);
      }
    }
    if (armed && armedTo && armedTo !== armed) {
      const need = costOf([segmentPieces(armed.id, armedTo.id)]);
      const text = `${need.track} / ${state.inv.track} track` + (need.bridges ? ` · ${need.bridges} / ${state.inv.bridges} ${invName('bridges', need.bridges)}` : '');
      drawWorldLabel(text, hover.x, hover.y - 26, affordable(need) ? '#2c4a39' : '#c1602f', 13);
    }
    fx.forEach((f) => { ctx.save(); ctx.globalAlpha = clamp(f.life, 0, 1); drawWorldLabel(f.text, f.x, f.y, f.color); ctx.restore(); });

    ctx.restore();
  }

  // ---------- speech bubbles ----------

  const bubbleHost = $('#bubbles');
  const bubbleEls = new Map();
  function updateBubbles() {
    const worst = stations
      .filter((s) => s.pegs.length > STATION_BASE_CAP[s.level] && state.mode !== 'calm')
      .sort((a, b) => b.pegs.length - a.pegs.length)
      .slice(0, 4);
    const keep = new Set(worst.map((s) => s.id));
    bubbleEls.forEach((el, id) => { if (!keep.has(id)) { el.classList.remove('is-on'); setTimeout(() => el.remove(), 260); bubbleEls.delete(id); } });
    worst.forEach((s) => {
      let el = bubbleEls.get(s.id);
      if (!el) { el = document.createElement('div'); el.className = 'bubble'; bubbleHost.appendChild(el); bubbleEls.set(s.id, el); requestAnimationFrame(() => el.classList.add('is-on')); }
      const p = worldToScreen(s.x, s.y);
      el.style.left = `${p.x}px`;
      // above the station's name board, which grows a little with the zoom
      const signTop = worldToScreen(s.x, s.y - roofTop(s.level)).y - clamp(9 + camera.scale * 4, 11, 17) - 16;
      el.style.top = `${signTop - 22}px`;
      el.textContent = `${s.name}: ${s.pegs.length} waiting!`;
    });
  }

  // ---------- HUD ----------

  const shown = {};
  function setText(sel, v) {
    const s = String(v);
    if (shown[sel] === s) return;
    shown[sel] = s;
    const el = $(sel);
    if (el) el.textContent = s;
  }

  function pulseInventory(item) {
    document.querySelectorAll(`[data-inv="${item}"]`).forEach((el) => {
      el.classList.remove('pulse');
      void el.offsetWidth; // restart the animation
      el.classList.add('pulse');
    });
  }

  let lastListUpdate = -1;
  function updateHUD() {
    setText('#hud-happy', `${Math.round(state.happiness)}%`);
    $('#hud-happy').closest('.stat').classList.toggle('is-low', state.happiness < 30);
    setText('#hud-houses', state.houses.length);
    setText('#hud-week', state.week);
    setText('#hud-day', state.day);
    $('#hud-daybar').style.width = `${clamp((state.time / DAY_LEN) * 100, 0, 100)}%`;

    Object.keys(INV_NAMES).forEach((item) => {
      setText(`#tb-${item}`, state.inv[item]);
      setText(`#inv-${item}`, state.inv[item]);
    });
    setText('#inv-carriages-sub', `+${state.inv.carriages} ${invName('carriages', state.inv.carriages)}`);
    setText('#inv-bridges-sub', `+${state.inv.bridges} ${invName('bridges', state.inv.bridges)}`);
    document.querySelectorAll('.tool[data-need]').forEach((btn) => {
      btn.classList.toggle('is-empty', state.inv[btn.dataset.need] < 1);
    });
    const ng = nextGift();
    setText('#tb-next', ng ? `Next: +${ng.g.amount} ${invName(ng.g.item, ng.g.amount)} at ${ng.at} houses built` : '');

    if (Math.abs(state.totalTime - lastListUpdate) > 0.4) {
      lastListUpdate = state.totalTime;
      const ol = $('#stationlist');
      ol.innerHTML = '';
      if (!stations.length) {
        const li = document.createElement('li');
        li.className = 'is-hint';
        li.textContent = 'No stations yet — pick Station and click where the houses are going up.';
        ol.appendChild(li);
      }
      stations.slice().sort((a, b) => b.pegs.length - a.pegs.length).forEach((s) => {
        const li = document.createElement('li');
        const cap = STATION_BASE_CAP[s.level];
        if (s.pegs.length > cap) li.classList.add('is-full');
        if (s.id === selectedId) li.classList.add('is-selected');
        li.dataset.id = s.id;
        li.title = 'Show the houses that use it';
        li.innerHTML = `<i class="dot" style="background:${TYPES[s.type].color}"></i><span class="name">${s.name}</span><span class="wait">${s.pegs.length}</span>`;
        ol.appendChild(li);
      });
    }
  }

  // A name in the list picks that station out and brings it into view.
  $('#stationlist').addEventListener('click', (e) => {
    const li = e.target.closest('li[data-id]');
    if (!li) return;
    const s = stationById(Number(li.dataset.id));
    if (!s) return;
    setTool(null);
    selectStation(s.id);
    camera.manual = true;
    camera.cx = s.x; camera.cy = s.y;
    clampCamera();
    lastListUpdate = -1;
  });

  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add('is-on'));
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.classList.remove('is-on'); setTimeout(() => { el.hidden = true; }, 220); }, 2600);
  }

  // ---------- input ----------

  let hover = null; // world point under the pointer, for the Station ghost
  // Click-to-connect: a click (no drag) on a station with the Track tool arms
  // it, and the next station clicked is joined to it. The joined station is
  // armed in turn, so a line can be laid click by click. Open grass, the same
  // station again, Esc or another tool puts it down.
  let armedFrom = null;

  function connectClick(s) {
    const from = armedFrom;
    beginDraft(from);
    tryAppendDraft(s.id);
    commitDraft();
    const joined = lines.some((l) => {
      const ids = l.stationIds;
      return ids.some((id, i) => id === s.id && (ids[i - 1] === from || ids[i + 1] === from));
    });
    armedFrom = joined ? s.id : null;
  }

  function eventToWorld(e) {
    const rect = canvas.getBoundingClientRect();
    return screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
  }
  // Every hit-test below adds CLICK_FORGIVE_PX worth of extra room, converted
  // to world units at the CURRENT zoom — so the target stays about as easy to
  // hit whether the camera is zoomed all the way in or all the way out.
  function forgive() { return CLICK_FORGIVE_PX / camera.scale; }
  function stationAt(p) { return stations.find((s) => dist(s, p) < STATION_WORLD_R + forgive()); }
  function trainAt(p) {
    return trains.find((t) => {
      const pos = trainPosition(t);
      return pos && Math.hypot(p.x - pos.x, p.y - pos.y) < TRAIN_HIT_R + forgive();
    });
  }
  function lineAt(p) {
    // measured to each line's own lane, so side-by-side lines can be told apart
    let best = null, bestD = 14 + forgive();
    trackStretches().forEach((s) => {
      const d = pointSegDist(p, { x: s.ax, y: s.ay }, { x: s.bx, y: s.by }).dist;
      if (d < bestD) { bestD = d; best = s.line; }
    });
    return best;
  }

  // A single pointer is ever doing one of two things: dragging out a length of
  // track, or — whenever the tool in hand found nothing to act on right where
  // the pointer went down — panning the mat instead of doing nothing at all.
  let dragMode = null; // { kind: 'draft' } | { kind: 'pan', x, y }

  canvas.addEventListener('pointerdown', (e) => {
    if (!state || state.gameOver) return;
    const p = eventToWorld(e);
    let handled = false;
    if (state.tool === 'track') {
      const s = stationAt(p);
      if (armedFrom !== null) {
        if (s && s.id !== armedFrom && stationById(armedFrom)) connectClick(s);
        else armedFrom = null;
        handled = true;
      } else if (s) { beginDraft(s.id); dragMode = { kind: 'draft' }; handled = true; }
    } else if (state.tool === 'station') {
      const s = stationAt(p);
      if (s) upgradeStation(s);
      else placeStation(p);
      handled = true; // placing already says why when it can't
    } else if (state.tool === 'train') {
      const t = trainAt(p);
      if (t) { addCarriage(t); handled = true; } else {
        const l = lineAt(p);
        if (l) { placeTrain(l, p); handled = true; } else toast('Click a line to put a train on it, or a train to hitch a carriage.');
      }
    } else if (!state.tool) {
      // no tool in hand: a click on a station picks it out, showing its catchment
      const s = stationAt(p);
      if (s) { selectStation(selectedId === s.id ? null : s.id); handled = true; }
    } else if (state.tool === 'remove') {
      const t = trainAt(p);
      const s = t ? null : stationAt(p);
      const l = t || s ? null : lineAt(p);
      if (t) removeTrain(t);
      else if (s) removeStation(s);
      else if (l) removeLine(l);
      else toast('Click a train, a line or a station to put it back in the toy box.');
      handled = !!(t || s || l);
    }
    // a pan that turns out to be a click on the grass drops the picked station
    if (!handled) { dragMode = { kind: 'pan', x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY }; }
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic event */ }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'touch') {
      hover = eventToWorld(e);
      canvas.style.cursor = !state.tool && !dragMode && stationAt(hover) ? 'pointer' : '';
    }
    if (!dragMode) return;
    if (dragMode.kind === 'draft') {
      const p = eventToWorld(e);
      draft.cursor = p;
      const s = stationAt(p);
      if (s) tryAppendDraft(s.id);
    } else if (dragMode.kind === 'pan') {
      const dx = e.clientX - dragMode.x, dy = e.clientY - dragMode.y;
      if (dx || dy) camera.manual = true;
      camera.cx -= dx / camera.scale;
      camera.cy -= dy / camera.scale;
      clampCamera();
      dragMode.x = e.clientX; dragMode.y = e.clientY;
    }
  });
  canvas.addEventListener('pointerleave', () => { hover = null; });
  function endDrag(e) {
    if (dragMode && dragMode.kind === 'draft' && draft) {
      if (draft.stations.length < 2) {
        // a click, not a drag: arm the station and wait for the second click
        armedFrom = draft.stations[0];
        draft = null;
        toast('Now click the station to join it to — or drag. Esc to cancel.');
      } else commitDraft();
    }
    if (dragMode && dragMode.kind === 'pan' && Math.hypot(e.clientX - dragMode.sx, e.clientY - dragMode.sy) < 5) selectedId = null;
    dragMode = null;
    if (draft) cancelDraft();
    try { canvas.releasePointerCapture(e.pointerId); } catch (err) { /* not captured */ }
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  // Wheel zooms on whatever world point sits under the cursor, the way a map
  // does, rather than always on the middle of the screen.
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-e.deltaY * 0.0012));
  }, { passive: false });

  // Pinch-to-zoom: two active touches, tracked by pointer id. While a pinch is
  // live it overrides any single-pointer pan/draft that might also be active.
  const activeTouches = new Map(); // pointerId -> {x,y}
  let pinchDist = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activeTouches.size === 2) {
      dragMode = null;
      draft = null;
      const [a, b] = [...activeTouches.values()];
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'touch' || !activeTouches.has(e.pointerId)) return;
    activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activeTouches.size === 2 && pinchDist) {
      const [a, b] = [...activeTouches.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const rect = canvas.getBoundingClientRect();
      zoomAt((a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top, d / pinchDist);
      pinchDist = d;
    }
  });
  function endTouch(e) {
    if (e.pointerType !== 'touch') return;
    activeTouches.delete(e.pointerId);
    if (activeTouches.size < 2) pinchDist = null;
  }
  canvas.addEventListener('pointerup', endTouch);
  canvas.addEventListener('pointercancel', endTouch);

  // ---------- toolbar / UI wiring ----------

  function setTool(id) {
    state.tool = id;
    armedFrom = null;
    if (id) selectedId = null;
    document.querySelectorAll('.tool').forEach((b) => b.classList.toggle('is-on', b.dataset.tool === id));
    arena.classList.remove('tool-track', 'tool-station', 'tool-train', 'tool-remove');
    if (id) arena.classList.add(`tool-${id}`);
  }
  document.querySelectorAll('.tool').forEach((btn) => {
    btn.addEventListener('click', () => setTool(state.tool === btn.dataset.tool ? null : btn.dataset.tool));
  });

  const modalOpen = () => ['#pausemenu', '#results', '#help'].some((sel) => !$(sel).hidden);

  function setSpeedUI(idx) {
    document.querySelectorAll('#speed-seg button').forEach((b) => b.classList.toggle('is-on', Number(b.dataset.speed) === idx));
  }
  function setSpeed(idx) {
    if (!state || state.gameOver || modalOpen()) return;
    if (idx > 0) state.lastSpeed = idx;
    state.speedIdx = idx;
    setSpeedUI(idx);
  }
  function togglePause() { setSpeed(state.speedIdx ? 0 : (state.lastSpeed || 1)); }
  document.querySelectorAll('#speed-seg button').forEach((btn) => {
    btn.addEventListener('click', () => setSpeed(Number(btn.dataset.speed)));
  });

  document.querySelectorAll('#mode-seg button').forEach((btn) => {
    btn.addEventListener('click', () => {
      // Only a genuine mode CHANGE throws the run away — re-clicking the mode
      // you're already in used to silently restart you.
      if (btn.dataset.mode === state.mode) return;
      document.querySelectorAll('#mode-seg button').forEach((b) => b.classList.toggle('is-on', b === btn));
      newGame(btn.dataset.mode);
      setSpeedUI(state.speedIdx);
      $('#results').hidden = true;
    });
  });

  $('#btn-fit').onclick = () => { camera.manual = false; };
  $('#btn-help').onclick = () => { $('#help').hidden = false; };
  $('#btn-help-close').onclick = () => { $('#help').hidden = true; };
  $('#btn-sound').onclick = (e) => {
    const on = audio.toggle();
    e.currentTarget.setAttribute('aria-pressed', String(on));
    persistSettings();
  };
  $('#btn-sound').setAttribute('aria-pressed', String(audio.on));
  $('#btn-again').onclick = () => {
    $('#results').hidden = true;
    newGame(state.mode);
    setSpeedUI(state.speedIdx);
  };

  // ---------- menu (pause + restart) ----------

  function openMenu() {
    if (!state || state.gameOver || modalOpen()) return;
    if (state.speedIdx) state.lastSpeed = state.speedIdx;
    state.speedIdx = 0;
    setSpeedUI(0);
    $('#pause-main').hidden = false;
    $('#pause-confirm').hidden = true;
    $('#pausemenu').hidden = false;
  }
  function closeMenu() {
    $('#pausemenu').hidden = true;
    setSpeed(state.lastSpeed || 1);
  }
  $('#btn-menu').onclick = openMenu;
  $('#btn-resume').onclick = closeMenu;
  $('#btn-restart').onclick = () => { $('#pause-main').hidden = true; $('#pause-confirm').hidden = false; };
  $('#btn-restart-cancel').onclick = () => { $('#pause-confirm').hidden = true; $('#pause-main').hidden = false; };
  $('#btn-restart-confirm').onclick = () => {
    $('#pausemenu').hidden = true;
    newGame(state.mode);
    setSpeedUI(state.speedIdx);
  };

  window.addEventListener('keydown', (e) => {
    if (!state) return;
    if (e.key === 'Escape') {
      if (!$('#pausemenu').hidden) closeMenu();
      else if (!$('#help').hidden) $('#help').hidden = true;
      else if (draft) cancelDraft();
      else if (armedFrom !== null) armedFrom = null;
      else if (selectedId !== null) selectedId = null;
      else openMenu();
      return;
    }
    if (modalOpen()) return;
    if (e.code === 'Space') { e.preventDefault(); togglePause(); }
    else if (e.key === '1' || e.key === '2' || e.key === '3') setSpeed(Number(e.key));
    else if (e.key === 't' || e.key === 'T') setTool(state.tool === 'track' ? null : 'track');
    else if (e.key === 's' || e.key === 'S') setTool(state.tool === 'station' ? null : 'station');
    else if (e.key === 'r' || e.key === 'R') setTool(state.tool === 'train' ? null : 'train');
    else if (e.key === 'x' || e.key === 'X') setTool(state.tool === 'remove' ? null : 'remove');
  });

  window.addEventListener('resize', fitCanvas);
  document.addEventListener('visibilitychange', () => { if (document.hidden) persistRun(); });

  // ---------- boot ----------

  const resumed = loadRun();
  if (resumed && resumed.state && resumed.state.inv) resumeGame(resumed);
  else newGame(save.mode || 'survival');

  document.querySelectorAll('#mode-seg button').forEach((b) => b.classList.toggle('is-on', b.dataset.mode === state.mode));
  setSpeedUI(state.speedIdx);

  fitCanvas();
  camera.scale = minScale();
  clampCamera();
  loadTextures();

  let last = performance.now();
  let autosaveAcc = 0;
  function frame(ts) {
    const dt = clamp((ts - last) / 1000, 0, 0.05);
    last = ts;
    tick(dt);
    updateCamera(dt);
    draw();
    updateBubbles();
    updateHUD();
    autosaveAcc += dt;
    if (autosaveAcc > 5) { autosaveAcc = 0; persistRun(); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ---------- debug handle ----------

  window.routeBuilder = {
    get state() { return state; },
    get stations() { return stations; },
    get lines() { return lines; },
    get trains() { return trains; },
    get routing() { return routing; },
    get camera() { return camera; },
    // Runs the world forward n steps regardless of the speed buttons.
    tick(n = 1, dt = 1 / 20) { for (let i = 0; i < n && !state.gameOver; i++) step(dt); },
    spawnStation(type) { return spawnStation(type); },
    spawnPeg(stationId, type) {
      const s = stationById(stationId);
      const t = type || pick(availableTypes().filter((x) => x !== s.type));
      s.pegs.push({ id: state.nextPegId++, type: t, since: state.totalTime });
      return t;
    },
    layLine(stationIds, loop) {
      const line = { id: state.nextLineId++, stationIds: stationIds.slice(), loop: !!loop, pieces: 0 };
      lines.push(line);
      rebuildRouting();
      return line;
    },
    addTrain(lineId, carriages, near) { return newTrain(lineById(lineId), carriages || 1, near); },
    addHouse(x, y) { addHouse({ x, y }, null); },
    growHouse,
    housesNear: (x, y) => housesNear({ x, y }),
    neighbourhoodService,
    walkersFor: (id) => walkersFor(stationById(id)).length,
    pressureDay: () => pressureDay(),
    setSpeed,
    setTool,
    newGame,
    rebuildRouting,
    worldToScreen,
    minScale,
    // Below: the same functions a real drag/click drives, exposed directly so
    // tests can exercise the real toy-box/routing logic without simulating
    // DOM pointer events (which would fight the real listeners' pointer capture).
    buildDraft(stationIds) {
      if (stationIds.length < 2) return;
      beginDraft(stationIds[0]);
      for (let i = 1; i < stationIds.length; i++) tryAppendDraft(stationIds[i]);
      commitDraft();
    },
    placeStation(x, y) { return placeStation({ x, y }); },
    select(id) { selectStation(id); },
    pointsAgainst() { return [...pointsAgainst()]; },
    get selected() { return selectedId; },
    upgradeStation(id) { const s = stationById(id); return s ? upgradeStation(s) : false; },
    placeTrain(lineId) { const l = lineById(lineId); if (l) placeTrain(l); },
    addCarriage(trainId) { const t = trains.find((x) => x.id === trainId); if (t) addCarriage(t); },
    removeLine(lineId) { const l = lineById(lineId); if (l) removeLine(l); },
    removeTrain(trainId) { const t = trains.find((x) => x.id === trainId); if (t) removeTrain(t); },
    removeStation(id) { const s = stationById(id); if (s) removeStation(s); },
  };
})();
