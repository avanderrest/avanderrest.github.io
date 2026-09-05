/* Paddock — bolt a car together from parts, race it on isometric tracks, draw your own tracks.
   Plain canvas + DOM, nothing to build. Saves to localStorage. */
(() => {
  'use strict';

  // ---------- constants ----------
  const SAVE_KEY = 'paddock-save-v1';
  const TW = 64, TH = 32;                       // isometric tile footprint in px at zoom 1
  const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // east, south, west, north
  const START_CHARS = { '>': 0, 'v': 1, '<': 2, '^': 3 };
  // ROADLIKE is everything the lap tracer will route through; TARMAC is the bit you actually
  // want to be on. Water is lap-able so a jump gap does not break the loop, but it is not road.
  const ROADLIKE = { '#': true, 'B': true, 'J': true, 'X': true };
  const TARMAC = { '#': true, 'B': true, 'J': true };
  const SOLID = { 'T': true, 'W': true };
  // speed = share of top speed (and acceleration) left when all four wheels sit on it,
  // before off-road parts soften it a touch. Leaving the tarmac is meant to hurt.
  const SURFACE = {
    '.': { name: 'grass',  speed: 0.22, grip: 0.55, turn: 0.85, dust: ['#3e6b2a', '#a5d45a', '#d9e8a0', '#5a3f28'] },
    'g': { name: 'gravel', speed: 0.38, grip: 0.40, turn: 0.90, dust: ['#d8c9a2', '#c2ab80', '#efe4c8'] },
    'm': { name: 'mud',    speed: 0.12, grip: 1.30, turn: 0.70, dust: ['#5a3f28', '#6e4f33', '#3e2a18'] },
    '#': { name: 'road',   speed: 1.00, grip: 1.00, turn: 1.00 },
    'B': { name: 'boost',  speed: 1.00, grip: 1.00, turn: 1.00, boost: true },
    'J': { name: 'ramp',   speed: 1.00, grip: 1.00, turn: 0.92, jump: true },
    'X': { name: 'water',  speed: 0.14, grip: 2.20, turn: 0.60, dust: ['#cfe6f2', '#eef7fc', '#93bcd2'] },
  };
  const SMOKE = ['rgba(214,214,218,0.85)', 'rgba(188,188,196,0.75)', 'rgba(236,236,238,0.8)'];
  // wheel positions in car-local tiles; drawCar draws the wheels at exactly these spots
  const WHEELS = [[-0.17, -0.16], [0.17, -0.16], [-0.17, 0.16], [0.17, 0.16]];
  const TILE_TOOLS = [
    { ch: '#', name: 'Road',      color: '#5d5f63' },
    { ch: 'B', name: 'Boost pad', color: '#e9b63a' },
    { ch: 'J', name: 'Ramp',      color: '#b8823f' },
    { ch: 'X', name: 'Water',     color: '#4a7f9c' },
    { ch: 'g', name: 'Gravel',    color: '#c9b48a' },
    { ch: 'm', name: 'Mud',       color: '#6e4f33' },
    { ch: '.', name: 'Grass',     color: '#7fb069' },
    { ch: 'T', name: 'Tree',      color: '#3f7a3a' },
    { ch: 'W', name: 'Wall',      color: '#a8a39a' },
    { ch: 'S', name: 'Start line', color: '#ffffff' },
    { ch: 'P', name: 'Pan',       color: 'transparent' },
  ];

  const PARTS = {
    engine: { label: 'Engine', items: [
      { id: 'putt',  name: 'Putt-Putt 900',  blurb: 'Cheerful, cheap, and not in a hurry.',                 speed: 3,  accel: 3, weight: 2 },
      { id: 'daily', name: 'Everyday 1.6',   blurb: 'Does the school run. Does the track. Does fine.',      speed: 5,  accel: 5, weight: 4 },
      { id: 'ev',    name: 'Zap Electric',   blurb: 'Instant shove off the line. Runs out of puff up top.', speed: 6,  accel: 9, weight: 6 },
      { id: 'turbo', name: 'Whistler Turbo', blurb: 'Spools up, then really goes.',                        speed: 8,  accel: 6, weight: 5 },
      { id: 'v8',    name: 'Thunder V8',     blurb: 'Enormous top speed. Enormous everything.',            speed: 10, accel: 7, weight: 8 },
    ] },
    gearbox: { label: 'Gearbox', items: [
      { id: 'short', name: 'Short ratios', blurb: 'Quick off the line, breathless on straights.',     accel: 2,    speed: -1.5 },
      { id: 'even',  name: 'Even ratios',  blurb: 'A bit of everything.',                             accel: 0.5,  speed: 0 },
      { id: 'long',  name: 'Long ratios',  blurb: 'Slow to wind up, then it keeps on pulling.',       accel: -1.5, speed: 2 },
    ] },
    tyres: { label: 'Tyres', items: [
      { id: 'slick', name: 'Slicks',        blurb: 'Glued to tarmac. Hopeless on grass.',                          grip: 9, offroad: 1 },
      { id: 'road',  name: 'Road tyres',    blurb: 'Sensible tread for most things.',                              grip: 6, offroad: 4 },
      { id: 'allt',  name: 'All-terrain',   blurb: 'Knobbly. Happy in the mud, vague on the road.',                grip: 4, offroad: 8, speed: -0.5 },
      { id: 'soft',  name: 'Soft compound', blurb: 'Sticky and keen to turn in. Scrubs off a little speed.',       grip: 8, offroad: 3, speed: -0.5, handling: 1 },
    ] },
    body: { label: 'Body', items: [
      { id: 'feather', name: 'Featherweight', blurb: 'A bathtub with a roll cage. Darts about, gets shoved.', weight: 2, handling: 2,    tough: 2 },
      { id: 'coupe',   name: 'Coupe',         blurb: 'Low and nimble.',                                       weight: 4, handling: 1,    tough: 4 },
      { id: 'saloon',  name: 'Saloon',        blurb: 'Comfortable, solid, forgiving.',                        weight: 6, handling: 0,    tough: 6 },
      { id: 'pickup',  name: 'Pickup',        blurb: 'Built like a shed. Wins arguments at corners.',         weight: 9, handling: -1.5, tough: 9 },
    ] },
    suspension: { label: 'Suspension', items: [
      { id: 'stock', name: 'Stock', blurb: 'Whatever it came with.',                                  handling: 0,    offroad: 0 },
      { id: 'sport', name: 'Sport', blurb: 'Stiff and sharp. Rattles your teeth off the tarmac.',    handling: 2,    offroad: -1 },
      { id: 'rally', name: 'Rally', blurb: 'Long travel. Floats over the rough stuff.',              handling: 0.5,  offroad: 3 },
      { id: 'soft',  name: 'Soft',  blurb: 'Wallowy but forgiving.',                                 handling: -0.5, offroad: 1, grip: 1 },
    ] },
    extra: { label: 'Extra', items: [
      { id: 'none',    name: 'Nothing',      blurb: 'Keep it simple.' },
      { id: 'nitro',   name: 'Nitro bottle', blurb: 'Three big shoves per race. Press Shift.',      nitro: 3 },
      { id: 'spoiler', name: 'Spoiler',      blurb: 'Extra grip once you are going fast.',          grip: 2, speed: -0.5 },
      { id: 'bullbar', name: 'Bull bars',    blurb: 'For pushing past people.',                     tough: 3, weight: 1 },
    ] },
  };
  const PAINTS = [
    { id: 'red',   name: 'Postbox red', hex: '#c93a2e' },
    { id: 'sky',   name: 'Sky blue',    hex: '#4a9bd6' },
    { id: 'lime',  name: 'Lime',        hex: '#8cc63f' },
    { id: 'sun',   name: 'Sunflower',   hex: '#e9b63a' },
    { id: 'plum',  name: 'Plum',        hex: '#7a4a8c' },
    { id: 'cream', name: 'Cream',       hex: '#efe4c8' },
    { id: 'soot',  name: 'Soot',        hex: '#3a3a40' },
    { id: 'teal',  name: 'Teal',        hex: '#2f9c8c' },
  ];
  const STAT_LABELS = [
    ['speed', 'Top speed'], ['accel', 'Acceleration'], ['handling', 'Handling'],
    ['grip', 'Grip'], ['offroad', 'Off-road'], ['tough', 'Toughness'], ['weight', 'Weight'],
  ];
  const RIVALS = [
    { name: 'Bram',   car: 'The Kettle' },
    { name: 'Dot',    car: 'Marigold' },
    { name: 'Kit',    car: 'Sparrow' },
    { name: 'Nadia',  car: 'Big Ron' },
    { name: 'Ola',    car: 'Wasp' },
    { name: 'Fenn',   car: 'Old Reliable' },
    { name: 'Priya',  car: 'Thunderbox' },
  ];

  // Built-in tracks. '.' grass, '#' road, 'g' gravel, 'm' mud, 'B' boost, 'T' tree, 'W' wall,
  // and one of > v < ^ marks the start line (on the road) and the direction of travel.
  // The road is two cells wide throughout so there is room to get a corner wrong.
  const BUILTIN = [
    { id: 'b:oval', name: 'Paddock Oval', rows: [
      '....................',
      '..TT............TT..',
      '..######<#########..',
      '..################..',
      '..##............##..',
      '..##....TT......##..',
      '..##............##..',
      '..##............##..',
      '..##..TT........##..',
      '..##............##..',
      '..######BB########..',
      '..######BB########..',
      '..TT............TT..',
      '....................',
    ] },
    { id: 'b:willow', name: 'Willow Bends', rows: [
      '.........................',
      '.T.....................T.',
      '...#######>##BB########..',
      '...##########BB########..',
      '...##................##..',
      '...##gg...........T..##..',
      '...##gg..............##..',
      '...##....#######.....##..',
      '...##....#######.....##..',
      '...##....##...##.....##..',
      '...##....##TT.##...T.##..',
      '...##....##T..##.....##..',
      '...##....##...##.....##..',
      '...##....##...##.....##..',
      '...########...#########..',
      '...########...#########..',
      '.T..............ggg....T.',
      '................ggg......',
    ] },
    { id: 'b:scrapyard', name: 'Scrapyard', rows: [
      '......................',
      '.WWWWWWWWWWWWWWWWWWWW.',
      '.W..................W.',
      '.W.#######T.#######.W.',
      '.W.#######.T#######.W.',
      '.W.##...######...##.W.',
      '.W.##...######...##.W.',
      '.W.##..W.......W.##.W.',
      '.W.##...mmm......##.W.',
      '.W.##...mmm..TT..##.W.',
      '.W.##.T..........##.W.',
      '.W.##............##.W.',
      '.W.BB##########<###.W.',
      '.W.BB##############.W.',
      '.W..................W.',
      '.WWWWWWWWWWWWWWWWWWWW.',
      '......................',
    ] },
    { id: 'b:hairpin', name: 'Hairpin Hill', rows: [
      '.........................',
      '.T.....................T.',
      '...#########<##########..',
      '...####################..',
      '...##.TT...ggg..T....##..',
      '...##......ggg.......##..',
      '...##................##..',
      '...##...###############..',
      '...##...###############..',
      '...##...##...............',
      '...##...##...............',
      '...##...###############..',
      '...##...###############..',
      '...##.......Tgg......##..',
      '...##.......ggg......##..',
      '...##############BB####..',
      '...##############BB####..',
      '.T...............TT....T.',
      '.........................',
    ] },
    // Ramps ('J') fling you over the water ('X'). Every ramp has a boost pad on the run-up, so
    // the jump is always makeable — get it wrong and you paddle.
    { id: 'b:bramble', name: 'Bramble Leap', rows: [
      '........................',
      '.T....................T.',
      '..######>#############..',
      '..####################..',
      '..##................BB..',
      '..##....gg..........BB..',
      '..##....gg..........JJ..',
      '..XX................XX..',
      '..XX...T..T.........XX..',
      '..JJ................##..',
      '..BB................##..',
      '..BB.....TT.........##..',
      '..##................##..',
      '..#######XXJJBB#######..',
      '..#######XXJJBB#######..',
      '.T....................T.',
      '........................',
    ] },
  ];

  // ---------- helpers ----------
  const $ = (s) => document.querySelector(s);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const angleDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
  const hash2 = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >> 13)) * 1274126177; return ((h ^ (h >> 16)) >>> 0) / 4294967296; };
  const fmtTime = (t) => { if (t == null || !isFinite(t)) return '—'; const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1); };
  const ordinal = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : Math.min(n % 10, 4) % 4] || 'th');
  const shade = (hex, k) => {
    const n = parseInt(hex.slice(1), 16);
    const r = clamp(Math.round(((n >> 16) & 255) * k), 0, 255), g = clamp(Math.round(((n >> 8) & 255) * k), 0, 255), b = clamp(Math.round((n & 255) * k), 0, 255);
    return `rgb(${r},${g},${b})`;
  };
  const partOf = (cat, id) => PARTS[cat].items.find((i) => i.id === id) || PARTS[cat].items[0];

  // ---------- save ----------
  const defaultSave = () => ({
    build: { engine: 'daily', gearbox: 'even', tyres: 'road', body: 'coupe', suspension: 'stock', extra: 'none', paint: 'red' },
    carName: 'Marmalade',
    tracks: [],
    bests: {},
    laps: 3,
    rivals: 3,
    brush: 2,
    diff: 'mixed',
  });
  let save = defaultSave();
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) save = Object.assign(defaultSave(), JSON.parse(raw));
  } catch (e) { /* fresh start */ }
  const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } };

  // ---------- car stats ----------
  function computeStats(build) {
    const parts = ['engine', 'gearbox', 'tyres', 'body', 'suspension', 'extra'].map((c) => partOf(c, build[c]));
    const sum = (f) => parts.reduce((a, p) => a + (p[f] || 0), 0);
    const weight = clamp(sum('weight') * 0.6, 1, 10);
    const speed = clamp(sum('speed'), 1, 10);
    const accel = clamp(sum('accel') - (weight - 5) * 0.4, 1, 10);
    const handling = clamp(5 + sum('handling') - (weight - 5) * 0.3, 1, 10);
    const grip = clamp(sum('grip'), 1, 10);
    const offroad = clamp(sum('offroad'), 1, 10);
    const tough = clamp(sum('tough'), 1, 10);
    const extra = partOf('extra', build.extra);
    return { speed, accel, handling, grip, offroad, tough, weight, nitro: extra.nitro || 0, spoiler: extra.id === 'spoiler' };
  }
  // Everything moves at half the pace it used to. Acceleration and braking are halved to match,
  // so a car still takes the same few seconds to wind up to its top speed — it just does the
  // winding up over half the ground, which leaves time to think about a corner.
  function carParams(stats) {
    return {
      maxSpeed: 1.6 + 0.21 * stats.speed,
      accel: 0.85 + 0.25 * stats.accel,
      turn: 1.5 + 0.22 * stats.handling,
      grip: 1.6 + 0.85 * stats.grip,
      brake: 6.5,
      mass: 0.6 + 0.08 * stats.weight,
      offroad: stats.offroad,
      tough: stats.tough,
      nitro: stats.nitro,
      spoiler: stats.spoiler,
    };
  }
  function randomBuild(diff) {
    const b = {};
    for (const c of Object.keys(PARTS)) b[c] = pick(PARTS[c].items).id;
    b.paint = pick(PAINTS).id;
    if (diff === 'easy') { b.engine = pick(['putt', 'daily', 'ev']); b.gearbox = pick(['short', 'even']); }
    if (diff === 'hard') { b.engine = pick(['turbo', 'v8', 'ev']); b.tyres = pick(['slick', 'soft', 'road']); }
    return b;
  }

  // ---------- track data ----------
  function trackFromRows(t) {
    const h = t.rows.length, w = Math.max(...t.rows.map((r) => r.length));
    const cells = [];
    let start = null;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let ch = t.rows[y][x] || '.';
      if (ch in START_CHARS) { start = { x, y, d: START_CHARS[ch] }; ch = '#'; }
      cells.push(ch);
    }
    return { id: t.id, name: t.name, w, h, cells, start, builtin: true };
  }
  const BUILTIN_TRACKS = BUILTIN.map(trackFromRows);
  const allTracks = () => BUILTIN_TRACKS.concat(save.tracks);
  const getTrack = (id) => allTracks().find((t) => t.id === id);
  const cellAt = (tr, x, y) => (x < 0 || y < 0 || x >= tr.w || y >= tr.h) ? 'W' : tr.cells[y * tr.w + x];
  const cellAtF = (tr, x, y) => cellAt(tr, Math.floor(x), Math.floor(y));
  const surfaceAt = (tr, x, y) => SURFACE[cellAtF(tr, x, y)] || SURFACE['.'];

  // Trace the lap: flood-fill road distance from just in front of the start line, with the
  // start cells blocked, so the far side of the loop has the highest distance.
  function buildTrack(tr) {
    const { w, h, cells } = tr;
    const res = { ok: false, error: '', dist: new Int32Array(w * h).fill(-1), wps: [], startCells: [], startSet: new Set(), n: 0 };
    if (!tr.start) { res.error = 'Place a start line on the road.'; return res; }
    const { x: sx, y: sy, d } = tr.start;
    if (!ROADLIKE[cellAt(tr, sx, sy)]) { res.error = 'The start line needs to sit on the road.'; return res; }
    const [dx, dy] = DIRS[d]; const px = -dy, py = dx;
    const sc = [[sx, sy]];
    for (const s of [1, -1]) for (let k = 1; k < 6; k++) {
      const x = sx + px * s * k, y = sy + py * s * k;
      if (ROADLIKE[cellAt(tr, x, y)]) sc.push([x, y]); else break;
    }
    const startSet = new Set(sc.map(([x, y]) => y * w + x));
    const q = [];
    for (const [x, y] of sc) {
      const fx = x + dx, fy = y + dy, i = fy * w + fx;
      if (ROADLIKE[cellAt(tr, fx, fy)] && !startSet.has(i) && res.dist[i] < 0) { res.dist[i] = 0; q.push([fx, fy]); }
    }
    if (!q.length) { res.error = 'The start line must point along the road.'; return res; }
    let head = 0;
    while (head < q.length) {
      const [x, y] = q[head++]; const dd = res.dist[y * w + x];
      for (const [ox, oy] of DIRS) {
        const nx = x + ox, ny = y + oy;
        if (!ROADLIKE[cellAt(tr, nx, ny)]) continue;
        const i = ny * w + nx;
        if (startSet.has(i) || res.dist[i] >= 0) continue;
        res.dist[i] = dd + 1; q.push([nx, ny]);
      }
    }
    let max = 0; for (const v of res.dist) if (v > max) max = v;
    let backOk = false;
    for (const [x, y] of sc) {
      const bx = x - dx, by = y - dy;
      if (ROADLIKE[cellAt(tr, bx, by)] && res.dist[by * w + bx] > 5) backOk = true;
    }
    if (!backOk) { res.error = 'The road does not loop back round to the start line.'; return res; }
    const sums = Array.from({ length: max + 1 }, () => [0, 0, 0]);
    for (let i = 0; i < w * h; i++) {
      const v = res.dist[i]; if (v < 0) continue;
      const s = sums[v]; s[0] += (i % w) + 0.5; s[1] += Math.floor(i / w) + 0.5; s[2]++;
    }
    const startC = [0, 0];
    for (const [x, y] of sc) { startC[0] += x + 0.5; startC[1] += y + 0.5; }
    startC[0] /= sc.length; startC[1] /= sc.length;
    res.wps = [startC].concat(sums.map((s) => [s[0] / s[2], s[1] / s[2]]));
    res.n = res.wps.length;
    res.startCells = sc; res.startSet = startSet; res.dir = d; res.max = max; res.ok = true;
    return res;
  }
  // Progress index of a world position (0 = start line, rising round the lap). -1 when off the road.
  function progressIdx(tr, tk, x, y) {
    const cx = Math.floor(x), cy = Math.floor(y);
    if (cx < 0 || cy < 0 || cx >= tr.w || cy >= tr.h) return -1;
    const i = cy * tr.w + cx;
    if (tk.startSet.has(i)) return 0;
    const d = tk.dist[i];
    return d < 0 ? -1 : d + 1;
  }

  // ---------- isometric camera ----------
  function makeCam(canvas) { return { x: 0, y: 0, z: 1, canvas, ox: 0, oy: 0 }; }
  function camUpdate(cam) {
    const c = cam.canvas;
    cam.ox = c.width / 2 - (cam.x - cam.y) * TW / 2 * cam.z;
    cam.oy = c.height / 2 - (cam.x + cam.y) * TH / 2 * cam.z;
  }
  const P = (cam, x, y, h) => [(x - y) * TW / 2 * cam.z + cam.ox, (x + y) * TH / 2 * cam.z + cam.oy - (h || 0) * cam.z];
  function unproject(cam, sx, sy) {
    const a = (sx - cam.ox) / (TW / 2 * cam.z), b = (sy - cam.oy) / (TH / 2 * cam.z);
    return [(a + b) / 2, (b - a) / 2];
  }
  function fitCam(cam, tr, pad) {
    const c = cam.canvas;
    const zw = c.width / ((tr.w + tr.h) * TW / 2 + pad), zh = c.height / ((tr.w + tr.h) * TH / 2 + pad + 40);
    cam.z = Math.min(zw, zh); cam.x = tr.w / 2; cam.y = tr.h / 2;
    camUpdate(cam);
  }
  function fitCanvas(canvas) {
    const r = canvas.parentElement.getBoundingClientRect();
    const w = Math.max(200, Math.floor(r.width)), h = Math.max(200, Math.floor(r.height));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  }

  // ---------- rendering ----------
  function poly(ctx, pts, fill, stroke, lw) {
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
  }
  const diamond = (cam, x, y, h) => [P(cam, x, y, h), P(cam, x + 1, y, h), P(cam, x + 1, y + 1, h), P(cam, x, y + 1, h)];

  function drawGround(ctx, cam, tr, tk, opts) {
    const c = cam.canvas;
    const grid = opts && opts.grid;
    for (let y = 0; y < tr.h; y++) for (let x = 0; x < tr.w; x++) {
      const [cx, cy] = P(cam, x + 0.5, y + 0.5, 0);
      if (cx < -TW * cam.z || cx > c.width + TW * cam.z || cy < -TH * cam.z * 2 || cy > c.height + TH * cam.z * 2) continue;
      const ch = tr.cells[y * tr.w + x];
      const d = diamond(cam, x, y, 0);
      const n = hash2(x, y);
      let fill;
      if (TARMAC[ch]) fill = n < 0.5 ? '#5b5d61' : '#5f6165';
      else if (ch === 'X') fill = n < 0.5 ? '#3f7691' : '#487f9a';
      else if (ch === 'g') fill = n < 0.5 ? '#c9b48a' : '#c2ab80';
      else if (ch === 'm') fill = n < 0.5 ? '#6e4f33' : '#66492f';
      else fill = ['#7fb069', '#79a963', '#86b56f', '#7cad66'][Math.floor(n * 4)];
      poly(ctx, d, fill);
      if (ch === 'g') {
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        for (let k = 0; k < 4; k++) { const [px, py] = P(cam, x + 0.2 + hash2(x + k, y) * 0.6, y + 0.2 + hash2(x, y + k) * 0.6, 0); ctx.fillRect(px, py, 2 * cam.z, 1.5 * cam.z); }
      }
      if (ch === 'm') {
        const p1 = P(cam, x + 0.15, y + 0.5, 0), p2 = P(cam, x + 0.85, y + 0.5, 0);
        ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1.5 * cam.z; ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke();
      }
      if (ch === 'X') {
        ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1.4 * cam.z;
        for (let k = 0; k < 3; k++) {
          const yy = y + 0.25 + k * 0.25 + (n - 0.5) * 0.08;
          const p1 = P(cam, x + 0.15, yy, 0), p2 = P(cam, x + 0.6, yy, 0);
          ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke();
        }
      }
      if (TARMAC[ch] && ch !== 'J') {
        // kerbs on edges facing non-road. Not on a ramp: those sit at ground level and would
        // slice straight through the raised wedge, which has its own stripes and skirts anyway.
        const edges = [[x, y, x + 1, y, 0, -1], [x + 1, y, x + 1, y + 1, 1, 0], [x + 1, y + 1, x, y + 1, 0, 1], [x, y + 1, x, y, -1, 0]];
        for (const [ax, ay, bx, by, ox, oy] of edges) {
          if (TARMAC[cellAt(tr, x + ox, y + oy)]) continue;
          const mx = (ax + bx) / 2, my = (ay + by) / 2;
          const a = P(cam, ax, ay, 0), m = P(cam, mx, my, 0), b = P(cam, bx, by, 0);
          ctx.lineWidth = 3 * cam.z;
          const par = (x + y) & 1;
          ctx.strokeStyle = par ? '#d4463a' : '#f2efe6'; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(m[0], m[1]); ctx.stroke();
          ctx.strokeStyle = par ? '#f2efe6' : '#d4463a'; ctx.beginPath(); ctx.moveTo(m[0], m[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        }
      }
      if (ch === 'B') {
        // chevrons
        ctx.fillStyle = '#e9b63a';
        for (let k = 0; k < 2; k++) {
          const o = 0.15 + k * 0.4;
          poly(ctx, [P(cam, x + o, y + 0.2, 0), P(cam, x + o + 0.25, y + 0.5, 0), P(cam, x + o, y + 0.8, 0), P(cam, x + o + 0.12, y + 0.5, 0)], '#e9b63a');
        }
      }
      if (ch === 'J') {
        // ridge across the direction of travel, worked out from whichever side the plain road is on
        const road = (dx, dy) => { const c2 = cellAt(tr, x + dx, y + dy); return c2 !== 'J' && TARMAC[c2]; };
        const axis = (road(-1, 0) || road(1, 0)) ? 0 : 1;
        const A = 12 * 1;
        const pp = (u, v, hh) => axis === 0 ? P(cam, x + u, y + v, hh) : P(cam, x + v, y + u, hh);
        poly(ctx, [pp(0, 0, 0), pp(0.5, 0, A), pp(0.5, 1, A), pp(0, 1, 0)], '#b8823f', 'rgba(0,0,0,0.22)', 1);
        poly(ctx, [pp(0.5, 0, A), pp(1, 0, 0), pp(1, 1, 0), pp(0.5, 1, A)], '#a8752f', 'rgba(0,0,0,0.22)', 1);
        for (const v of [0, 1]) {
          const side = axis === 0 ? cellAt(tr, x, y + (v ? 1 : -1)) : cellAt(tr, x + (v ? 1 : -1), y);
          if (side !== 'J') poly(ctx, [pp(0, v, 0), pp(0.5, v, A), pp(1, v, 0)], '#84591f');
        }
        for (let k = 0; k < 4; k++) {
          poly(ctx, [pp(0.46, k / 4, A), pp(0.54, k / 4, A), pp(0.54, (k + 1) / 4, A), pp(0.46, (k + 1) / 4, A)], k % 2 ? '#f2efe6' : '#2b2b30');
        }
      }
      if (tk && tk.startSet.has(y * tr.w + x)) {
        for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
          poly(ctx, [P(cam, x + i / 4, y + j / 4, 0), P(cam, x + (i + 1) / 4, y + j / 4, 0), P(cam, x + (i + 1) / 4, y + (j + 1) / 4, 0), P(cam, x + i / 4, y + (j + 1) / 4, 0)], (i + j) & 1 ? '#222' : '#f4f4f4');
        }
      }
      if (grid) poly(ctx, d, null, 'rgba(0,0,0,0.12)', 1);
    }
    // start arrow in editor
    if (opts && opts.arrow && tr.start) {
      const s = tr.start, [dx, dy] = DIRS[s.d];
      const cx = s.x + 0.5, cy = s.y + 0.5;
      const tip = P(cam, cx + dx * 0.9, cy + dy * 0.9, 6), tail = P(cam, cx - dx * 0.6, cy - dy * 0.6, 6);
      const l = P(cam, cx + dx * 0.4 - dy * 0.35, cy + dy * 0.4 + dx * 0.35, 6), r = P(cam, cx + dx * 0.4 + dy * 0.35, cy + dy * 0.4 - dx * 0.35, 6);
      ctx.strokeStyle = '#ffd23a'; ctx.lineWidth = 4 * cam.z; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(tail[0], tail[1]); ctx.lineTo(tip[0], tip[1]); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(l[0], l[1]); ctx.lineTo(tip[0], tip[1]); ctx.lineTo(r[0], r[1]); ctx.stroke();
      ctx.lineCap = 'butt';
    }
  }

  function drawTree(ctx, cam, x, y) {
    const n = hash2(x * 3, y * 7);
    const cx = x + 0.5 + (n - 0.5) * 0.2, cy = y + 0.5 + (hash2(y, x) - 0.5) * 0.2;
    const base = P(cam, cx, cy, 0);
    const z = cam.z;
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath(); ctx.ellipse(base[0] + 3 * z, base[1] + 2 * z, 12 * z, 6 * z, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#6b4a2b'; ctx.lineWidth = 4 * z;
    ctx.beginPath(); ctx.moveTo(base[0], base[1]); ctx.lineTo(base[0], base[1] - 16 * z); ctx.stroke();
    const r = (13 + n * 4) * z;
    ctx.fillStyle = n < 0.5 ? '#3f7a3a' : '#4a8a3f';
    ctx.beginPath(); ctx.arc(base[0], base[1] - 24 * z, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.beginPath(); ctx.arc(base[0] - r * 0.3, base[1] - 24 * z - r * 0.3, r * 0.45, 0, Math.PI * 2); ctx.fill();
  }
  function drawWall(ctx, cam, x, y) {
    const hgt = 12;
    const top = diamond(cam, x, y, hgt);
    const l = P(cam, x, y + 1, 0), b = P(cam, x + 1, y + 1, 0), r = P(cam, x + 1, y, 0);
    poly(ctx, [l, b, top[2], top[3]], '#8a857c');
    poly(ctx, [b, r, top[1], top[2]], '#9e9990');
    poly(ctx, top, '#b8b3aa', 'rgba(0,0,0,0.25)', 1);
  }

  // ---------- what a build looks like ----------
  // Every part shifts the silhouette: the body sets the block and cabin, the suspension and tyres
  // the ride height, the engine its plumbing, the gearbox a stripe, the extra a bolt-on. The
  // overall vibe of a build then adds one flourish on top — a wonky aerial or a splitter.
  const BODY_LOOK = {
    feather: { len: 0.44, wid: 0.24, hgt: 5, cabB: -0.13, cabF: 0.04, cabW: 0.19, roof: 0 },
    coupe:   { len: 0.50, wid: 0.28, hgt: 6, cabB: -0.17, cabF: 0.09, cabW: 0.22, roof: 6 },
    saloon:  { len: 0.56, wid: 0.31, hgt: 7, cabB: -0.21, cabF: 0.12, cabW: 0.26, roof: 9 },
    pickup:  { len: 0.60, wid: 0.33, hgt: 8, cabB: -0.06, cabF: 0.15, cabW: 0.30, roof: 9, bed: true },
  };
  const TYRE_LOOK = {
    slick: { rw: 4.0, rh: 2.5, lift: 0,   band: null,      knobs: 0 },
    road:  { rw: 3.2, rh: 2.3, lift: 0.4, band: null,      knobs: 3 },
    allt:  { rw: 3.9, rh: 3.1, lift: 2.8, band: null,      knobs: 6 },
    soft:  { rw: 3.5, rh: 2.5, lift: 0.2, band: '#e2564a', knobs: 0 },
  };
  const SUSP_LIFT = { stock: 0, sport: -1.7, rally: 3.2, soft: 1.3 };
  const WACKY_PTS = { engine: { putt: 2, v8: 1 }, tyres: { allt: 2 }, body: { pickup: 2, feather: 1 }, suspension: { rally: 1, soft: 1 }, extra: { bullbar: 2, nitro: 1 } };
  const RACY_PTS = { engine: { turbo: 2, v8: 2, ev: 1 }, tyres: { slick: 2, soft: 2 }, body: { coupe: 1, feather: 1 }, suspension: { sport: 2 }, extra: { spoiler: 2, nitro: 1 }, gearbox: { short: 1, long: 1 } };
  const VIBE_TEXT = { wacky: 'a bit wacky', normal: 'sensible', race: 'proper racecar' };
  const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return (((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) / 255; };
  function carLook(build) {
    const b = build || {};
    const bl = BODY_LOOK[b.body] || BODY_LOOK.coupe;
    const tl = TYRE_LOOK[b.tyres] || TYRE_LOOK.road;
    const score = (tbl) => Object.keys(tbl).reduce((a, c) => a + (tbl[c][b[c]] || 0), 0);
    const wacky = score(WACKY_PTS), racy = score(RACY_PTS);
    const hex = (PAINTS.find((p) => p.id === b.paint) || PAINTS[0]).hex;
    return {
      body: bl, tyre: tl, hex,
      lift: clamp((SUSP_LIFT[b.suspension] || 0) + tl.lift, -1.7, 6.5),
      engine: b.engine || 'daily', gearbox: b.gearbox || 'even', extra: b.extra || 'none',
      trim: lum(hex) > 0.55 ? '#33333a' : '#f2efe6',
      vibe: wacky >= 4 && wacky > racy ? 'wacky' : racy >= 5 && racy > wacky ? 'race' : 'normal',
    };
  }

  function drawCar(ctx, cam, car, label) {
    const z = cam.z;
    const lk = car.look || (car.look = carLook(car.build));
    const hex = car.paint || lk.hex;
    const bl = lk.body, tl = lk.tyre, detail = z > 1.4;
    const cs = Math.cos(car.angle), sn = Math.sin(car.angle);
    const W = (lx, ly) => [car.x + lx * cs - ly * sn, car.y + lx * sn + ly * cs];
    const air = car.z || 0;
    const pt = (lx, ly, h) => { const w = W(lx, ly); return P(cam, w[0], w[1], (h || 0) + air); };
    // a flat quad and an extruded box, both in car-local tiles, optionally offset sideways by c
    const quad = (back, front, halfW, h, c) => {
      const y0 = (c || 0) - halfW, y1 = (c || 0) + halfW;
      return [pt(back, y0, h), pt(front, y0, h), pt(front, y1, h), pt(back, y1, h)];
    };
    const box = (back, front, halfW, h0, h1, topCol, sideA, sideB, c) => {
      const g = quad(back, front, halfW, h0, c), t = quad(back, front, halfW, h1, c);
      poly(ctx, g, sideA);
      for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; poly(ctx, [g[i], g[j], t[j], t[i]], i % 2 ? sideA : sideB); }
      poly(ctx, t, topCol, 'rgba(0,0,0,0.25)', 1);
      return t;
    };
    const line = (a, b, col, w) => { ctx.strokeStyle = col; ctx.lineWidth = w * z; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); };

    const half = bl.len / 2, hw = bl.wid / 2;
    const bonB = bl.cabF + 0.02, bonF = half - 0.03;   // the bonnet, whatever shape the cabin is
    const wheelH = tl.rh * 0.95;
    const base = 1.1 + lk.lift;        // underside of the body, lifted by springs and tyres
    const hb = base + bl.hgt;          // top of the body block
    const hr = hb + bl.roof;           // top of the cabin

    // shadow: it stays on the ground and pulls in as the car climbs, so height reads at a glance
    const shk = 1 / (1 + air * 0.04);
    poly(ctx, [[-half - 0.03, -hw - 0.04], [half + 0.03, -hw - 0.04], [half + 0.03, hw + 0.04], [-half - 0.03, hw + 0.04]]
      .map(([a, b]) => { const w = W(a * shk, b * shk); return P(cam, w[0], w[1], -1); }),
      `rgba(0,0,0,${(0.22 * (0.5 + 0.5 * shk)).toFixed(3)})`);
    // Wheels, drawn at the four spots the physics samples. Each is a disc lying in the ground
    // plane, projected through the same isometric squash as the tiles, so it points where the
    // car points instead of always lying square to the screen — and the front pair steer.
    const steerA = clamp(car.steerVis || 0, -1, 1) * 0.55;
    const rad = tl.rw / (TW / 2), wid = tl.rh / (TW / 2) * 0.78;
    for (const [lx, ly] of WHEELS) {
      const p = pt(lx, ly, wheelH);
      const wa = car.angle + (lx > 0 ? steerA : 0);
      const cw = Math.cos(wa), sw = Math.sin(wa);
      // a world vector (a,b) lands at ((a-b)*TW/2, (a+b)*TH/2): columns are the wheel's own axes
      ctx.save();
      ctx.transform((cw - sw) * TW / 2 * z * rad, (cw + sw) * TH / 2 * z * rad,
                    (-sw - cw) * TW / 2 * z * wid, (-sw + cw) * TH / 2 * z * wid, p[0], p[1]);
      ctx.fillStyle = '#232326';
      ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill();
      if (detail) {
        if (tl.knobs) {
          ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 0.14;
          for (let k = 0; k < tl.knobs; k++) {
            const a = (k / tl.knobs) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * 0.45, Math.sin(a) * 0.45);
            ctx.lineTo(Math.cos(a) * 0.98, Math.sin(a) * 0.98);
            ctx.stroke();
          }
        }
        if (tl.band) { ctx.strokeStyle = tl.band; ctx.lineWidth = 0.16; ctx.beginPath(); ctx.arc(0, 0, 0.72, 0, Math.PI * 2); ctx.stroke(); }
        ctx.fillStyle = '#8f8b84'; ctx.beginPath(); ctx.arc(0, 0, 0.32, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    // body block
    box(-half, half, hw, base, hb, hex, shade(hex, 0.72), shade(hex, 0.82));
    // electric flanks glow instead of an exhaust
    if (lk.engine === 'ev' && detail) {
      const h = (base + hb) / 2;
      for (const s of [-1, 1]) line(pt(-half * 0.8, s * hw, h), pt(half * 0.75, s * hw, h), 'rgba(126,226,255,0.9)', 1.5);
    }
    // gearbox stripe across the bonnet and boot
    if (detail) {
      const stripe = (b2, f2, c, w) => poly(ctx, quad(b2, f2, w, hb + 0.01, c), lk.trim);
      if (lk.gearbox === 'short') { stripe(bl.cabF + 0.03, bl.cabF + 0.06, 0, hw * 0.8); stripe(bl.cabF + 0.09, bl.cabF + 0.12, 0, hw * 0.55); }
      else if (lk.gearbox === 'long') { for (const s of [-1, 1]) stripe(-half + 0.02, half - 0.02, s * hw * 0.36, hw * 0.11); }
      else stripe(-half + 0.02, half - 0.02, 0, hw * 0.15);
    }
    // lights
    const lightH = base + bl.hgt * 0.6;
    for (const s of [-1, 1]) {
      const hp = pt(half - 0.02, s * hw * 0.62, lightH);
      ctx.fillStyle = '#fff4b0'; ctx.beginPath(); ctx.arc(hp[0], hp[1], 1.8 * z, 0, Math.PI * 2); ctx.fill();
      const tp = pt(-half + 0.02, s * hw * 0.62, lightH);
      ctx.fillStyle = car.ctl && car.ctl.throttle < 0 ? '#ff3b2e' : '#8a1f18'; ctx.beginPath(); ctx.arc(tp[0], tp[1], 1.6 * z, 0, Math.PI * 2); ctx.fill();
    }
    // an open bed at the back of the pickup
    if (bl.bed) poly(ctx, quad(-half + 0.03, bl.cabB - 0.02, hw - 0.03, hb + 0.02), shade(hex, 0.42), shade(hex, 0.3), 1);
    // cabin, or an open cockpit and a roll hoop
    if (bl.roof > 0) {
      const cg = quad(bl.cabB, bl.cabF, bl.cabW / 2, hb), ct = quad(bl.cabB + 0.02, bl.cabF - 0.03, bl.cabW / 2 - 0.02, hr);
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4;
        poly(ctx, [cg[i], cg[j], ct[j], ct[i]], i === 1 ? '#bfe3f2' : (i === 3 ? '#9cc5d6' : shade(hex, 0.7)));
      }
      poly(ctx, ct, shade(hex, 1.15), 'rgba(0,0,0,0.2)', 1);
    } else {
      poly(ctx, quad(bl.cabB, bl.cabF, bl.cabW / 2, hb + 0.02), '#2b2b30');
      const hoop = hb + 7;
      ctx.lineCap = 'round';
      for (const s of [-1, 1]) line(pt(bl.cabB, s * bl.cabW / 2, hb), pt(bl.cabB, s * bl.cabW / 2, hoop), '#d8d4cc', 1.8);
      line(pt(bl.cabB, -bl.cabW / 2, hoop), pt(bl.cabB, bl.cabW / 2, hoop), '#d8d4cc', 1.8);
      ctx.lineCap = 'butt';
    }
    // engine plumbing
    if (lk.engine === 'putt') {
      box(bonB + 0.02, bonB + 0.08, 0.03, hb, hb + 6, '#6f6f75', '#4e4e52', '#5c5c60');
      box(bonB, bonB + 0.1, 0.045, hb + 6, hb + 7.5, '#8f8f96', '#68686e', '#75757b');
    } else if (lk.engine === 'v8') {
      box(bonB, Math.min(bonF, bonB + 0.15), hw * 0.55, hb, hb + 4.5, '#43434a', '#2f2f34', '#3a3a40');
      for (const s of [-1, 1]) { const p = pt(-half - 0.02, s * hw * 0.5, base + 1.6); ctx.fillStyle = '#c9c4bb'; ctx.beginPath(); ctx.arc(p[0], p[1], 1.7 * z, 0, Math.PI * 2); ctx.fill(); }
    } else if (lk.engine === 'turbo') {
      box(bonB, bonB + 0.1, 0.05, hb, hb + 5, '#43434a', '#2b2b30', '#33333a');
      line(pt(0, hw + 0.02, base + 1.3), pt(-half - 0.05, hw + 0.02, base + 1.3), '#c9c4bb', 2.2);
    } else if (lk.engine === 'ev') {
      poly(ctx, quad(bonF - 0.06, bonF - 0.01, 0.035, hb + 0.02), '#7fe2ff');
    } else {
      const p = pt(-half - 0.02, 0.05, base + 1.5); ctx.fillStyle = '#b8b3aa'; ctx.beginPath(); ctx.arc(p[0], p[1], 1.4 * z, 0, Math.PI * 2); ctx.fill();
    }
    // the bolt-on extra
    if (lk.extra === 'spoiler') {
      for (const s of [-1, 1]) box(-half + 0.02, -half + 0.06, 0.018, hb, hb + 5, '#43434a', '#26262b', '#2e2e34', s * hw * 0.6);
      box(-half - 0.02, -half + 0.08, hw + 0.05, hb + 5, hb + 6.5, shade(hex, 1.1), shade(hex, 0.6), shade(hex, 0.7));
    } else if (lk.extra === 'nitro') {
      const bf = Math.min(-half + 0.11, bl.cabB - 0.015), bb = bf - 0.075;
      box(bb, bf, hw * 0.72, hb, hb + 4, '#d8483c', '#9e3129', '#b93a30');
      poly(ctx, quad(bf - 0.02, bf, hw * 0.72, hb + 4.05), '#efe4c8');
    } else if (lk.extra === 'bullbar') {
      const f = half + 0.05;
      ctx.lineCap = 'round';
      line(pt(f, -hw - 0.02, base + 2.5), pt(f, hw + 0.02, base + 2.5), '#b9b4ab', 2.4);
      for (const s of [-1, 1]) line(pt(f, s * hw * 0.55, base - 0.5), pt(f, s * hw * 0.55, base + 5.5), '#b9b4ab', 2.2);
      ctx.lineCap = 'butt';
    }
    // one flourish for the overall vibe of the build
    if (lk.vibe === 'race') {
      poly(ctx, quad(half - 0.01, half + 0.07, hw + 0.03, base - 0.6), '#33333a');
      for (const s of [-1, 1]) poly(ctx, quad(-half * 0.55, half * 0.55, 0.014, base + 1, s * (hw + 0.014)), '#33333a');
      if (detail) {
        const rp = pt((bonB + bonF) / 2, 0, hb + 0.05), k = bl.wid / 0.28;
        ctx.fillStyle = '#f4f2ec'; ctx.beginPath(); ctx.ellipse(rp[0], rp[1], 3.4 * k * z, 2.3 * k * z, 0, 0, Math.PI * 2); ctx.fill();
      }
    } else if (lk.vibe === 'wacky') {
      for (const s of [-1, 1]) poly(ctx, quad(-half - 0.06, -half + 0.01, 0.055, base - 0.4, s * hw * 0.72), '#33333a');
      const a = pt(-half + 0.05, hw * 0.6, hb), b = pt(-half + 0.01, hw * 0.6, hb + 14);
      line(a, b, '#4a4a50', 1.2);
      ctx.fillStyle = '#e9b63a'; ctx.beginPath(); ctx.arc(b[0], b[1], 2.4 * z, 0, Math.PI * 2); ctx.fill();
    }
    // nitro flame
    if (car.nitroT > 0) {
      const fp = pt(-half - 0.12, 0, base + 2);
      ctx.fillStyle = 'rgba(255,170,40,0.9)'; ctx.beginPath(); ctx.arc(fp[0], fp[1], (4 + Math.random() * 3) * z, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(120,190,255,0.9)'; ctx.beginPath(); ctx.arc(fp[0], fp[1], 2 * z, 0, Math.PI * 2); ctx.fill();
    }
    if (label) {
      const lp = P(cam, car.x, car.y, hr + 16 + air);
      ctx.font = Math.max(10, 11 * z) + 'px ' + getComputedStyle(document.body).fontFamily;
      ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(0,0,0,0.45)';
      const tw = ctx.measureText(label).width;
      ctx.fillRect(lp[0] - tw / 2 - 4, lp[1] - 10 * z, tw + 8, 13 * z + 1);
      ctx.fillStyle = '#fff'; ctx.fillText(label, lp[0], lp[1]);
    }
  }

  function drawScene(ctx, cam, tr, tk, cars, opts) {
    const c = cam.canvas;
    ctx.fillStyle = '#6fa35b'; ctx.fillRect(0, 0, c.width, c.height);
    drawGround(ctx, cam, tr, tk, opts);
    if (opts && opts.marks) drawMarks(ctx, cam, opts.marks);
    const objs = [];
    for (let y = 0; y < tr.h; y++) for (let x = 0; x < tr.w; x++) {
      const ch = tr.cells[y * tr.w + x];
      if (SOLID[ch]) objs.push({ k: x + y + 1, ch, x, y });
    }
    for (const car of cars) objs.push({ k: car.x + car.y, car });
    if (opts && opts.fx) for (const f of opts.fx) objs.push({ k: f.x + f.y, f });
    objs.sort((a, b) => a.k - b.k);
    for (const o of objs) {
      if (o.car) drawCar(ctx, cam, o.car, opts && opts.labels && !o.car.isPlayer ? o.car.driver : null);
      else if (o.f) drawDust(ctx, cam, o.f);
      else if (o.ch === 'T') drawTree(ctx, cam, o.x, o.y);
      else drawWall(ctx, cam, o.x, o.y);
    }
  }
  // ---------- off-road dust / grass / mud ----------
  function drawDust(ctx, cam, f) {
    const t = f.life / f.ttl;
    const [px, py] = P(cam, f.x, f.y, f.h);
    ctx.globalAlpha = Math.min(1, t * 1.6);
    ctx.fillStyle = f.col;
    ctx.beginPath(); ctx.arc(px, py, f.size * (0.5 + 0.5 * t) * cam.z, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }
  function spawnDust(fx, car, dt) {
    if (!car.surfKind || car.offFrac <= 0 || car.speed < 0.25 || car.air) return;
    // more spray the faster you are going and the more wheels are off
    car.dustT += dt * 48 * car.offFrac * Math.min(1, car.speed);
    const cs = Math.cos(car.angle), sn = Math.sin(car.angle);
    const cols = car.surfKind.dust;
    while (car.dustT >= 1 && fx.length < 400) {
      car.dustT -= 1;
      // throw it up from one of the rear wheels
      const rx = WHEELS[0][0], ry = WHEELS[Math.random() < 0.5 ? 0 : 2][1];
      const x = car.x + rx * cs - ry * sn, y = car.y + rx * sn + ry * cs;
      const back = 0.25 + Math.random() * 0.4;
      fx.push({
        x, y, h: 2, col: cols[Math.floor(Math.random() * cols.length)],
        vx: -car.vx * back + (Math.random() - 0.5) * 0.8, vy: -car.vy * back + (Math.random() - 0.5) * 0.8,
        vh: 50 + Math.random() * 90, life: 0.6 + Math.random() * 0.35, ttl: 0.95, size: 2.5 + Math.random() * 3,
      });
    }
  }
  // Two black stripes off the rear wheels whenever the back end is out. Ground decals, so they
  // are drawn flat under everything else and fade rather than piling up.
  function spawnMarks(marks, car, dt) {
    if (car.air || car.speed < 0.4) return;
    if (car.slip < 0.2 && !car.ctl.handbrake) return;
    car.markT += dt * 26 * clamp(car.speed / 1.2, 0.3, 1);
    const cs = Math.cos(car.angle), sn = Math.sin(car.angle);
    while (car.markT >= 1 && marks.length < 700) {
      car.markT -= 1;
      for (const ly of [WHEELS[0][1], WHEELS[2][1]]) {
        const lx = WHEELS[0][0];
        marks.push({ x: car.x + lx * cs - ly * sn, y: car.y + lx * sn + ly * cs, life: 3.5, ttl: 3.5 });
      }
    }
  }
  function stepMarks(marks, dt) {
    for (let i = marks.length - 1; i >= 0; i--) {
      marks[i].life -= dt;
      if (marks[i].life <= 0) { marks[i] = marks[marks.length - 1]; marks.pop(); }
    }
  }
  function drawMarks(ctx, cam, marks) {
    ctx.fillStyle = '#2b2b30';
    for (const m of marks) {
      const [px, py] = P(cam, m.x, m.y, 0);
      ctx.globalAlpha = 0.42 * clamp(m.life / m.ttl, 0, 1);
      ctx.beginPath(); ctx.ellipse(px, py, 3 * cam.z, 1.9 * cam.z, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  // tyre smoke, thrown up by a slide rather than by the ground
  function spawnSmoke(fx, car, dt) {
    if (car.air || car.speed < 0.5) return;
    const k = clamp((car.slip - 0.18) / 0.5, 0, 1) * (car.ctl.handbrake ? 1.7 : 1);
    if (k <= 0) return;
    car.smokeT += dt * 30 * k;
    const cs = Math.cos(car.angle), sn = Math.sin(car.angle);
    while (car.smokeT >= 1 && fx.length < 400) {
      car.smokeT -= 1;
      const lx = WHEELS[0][0], ly = WHEELS[Math.random() < 0.5 ? 0 : 2][1];
      fx.push({
        x: car.x + lx * cs - ly * sn, y: car.y + lx * sn + ly * cs, h: 2,
        col: SMOKE[Math.floor(Math.random() * SMOKE.length)],
        vx: -car.vx * 0.12 + (Math.random() - 0.5) * 0.5, vy: -car.vy * 0.12 + (Math.random() - 0.5) * 0.5,
        vh: 26 + Math.random() * 34, life: 0.7 + Math.random() * 0.4, ttl: 1.1, size: 3.5 + Math.random() * 4,
      });
    }
  }
  // a puff of whatever you came down on, thrown out sideways by the wheels landing
  function spawnLanding(fx, car, tr) {
    const surf = surfaceAt(tr, car.x, car.y);
    const cols = surf.dust || ['#cfc9bd', '#b8b3aa', '#e6e2d8'];
    for (let k = 0; k < 14 && fx.length < 400; k++) {
      const a = Math.random() * Math.PI * 2;
      fx.push({
        x: car.x, y: car.y, h: 1, col: cols[Math.floor(Math.random() * cols.length)],
        vx: Math.cos(a) * rnd(0.4, 1.5), vy: Math.sin(a) * rnd(0.4, 1.5),
        vh: 30 + Math.random() * 70, life: 0.5 + Math.random() * 0.3, ttl: 0.8, size: 2.5 + Math.random() * 3.5,
      });
    }
  }
  function stepDust(fx, dt) {
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i];
      f.life -= dt;
      if (f.life <= 0) { fx[i] = fx[fx.length - 1]; fx.pop(); continue; }
      f.x += f.vx * dt; f.y += f.vy * dt;
      f.vh -= 260 * dt; f.h = Math.max(0, f.h + f.vh * dt);
      if (f.h === 0) { f.vh = 0; f.vx *= 0.8; f.vy *= 0.8; }
    }
  }

  // top-down thumbnail used for track cards and the minimap
  function drawThumb(canvas, tr, cars) {
    const ctx = canvas.getContext('2d');
    const s = Math.min(canvas.width / tr.w, canvas.height / tr.h);
    const ox = (canvas.width - tr.w * s) / 2, oy = (canvas.height - tr.h * s) / 2;
    ctx.fillStyle = '#7fb069'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < tr.h; y++) for (let x = 0; x < tr.w; x++) {
      const ch = tr.cells[y * tr.w + x];
      const col = ch === 'B' ? '#e9b63a' : ch === 'J' ? '#b8823f' : ch === 'X' ? '#3f7691'
        : TARMAC[ch] ? '#5d5f63' : ch === 'g' ? '#c9b48a' : ch === 'm' ? '#6e4f33' : ch === 'T' ? '#3f7a3a' : ch === 'W' ? '#b8b3aa' : null;
      if (col) { ctx.fillStyle = col; ctx.fillRect(ox + x * s, oy + y * s, s + 0.5, s + 0.5); }
    }
    if (tr.start) { ctx.fillStyle = '#fff'; ctx.fillRect(ox + tr.start.x * s, oy + tr.start.y * s, s, s); }
    if (cars) for (const car of cars) {
      ctx.fillStyle = car.paint; ctx.strokeStyle = car.isPlayer ? '#fff' : 'rgba(0,0,0,0.5)'; ctx.lineWidth = car.isPlayer ? 2 : 1;
      ctx.beginPath(); ctx.arc(ox + car.x * s, oy + car.y * s, car.isPlayer ? 4 : 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  }

  // ---------- physics ----------
  function makeCar(build, opts) {
    const stats = computeStats(build);
    return Object.assign({
      build, stats, p: carParams(stats), look: carLook(build), paint: (PAINTS.find((p) => p.id === build.paint) || PAINTS[0]).hex,
      x: 0, y: 0, angle: 0, vx: 0, vy: 0, speed: 0, drift: 0,
      z: 0, vz: 0, air: false, wasRamp: false, landed: 0,
      slip: 0, steerVis: 0, draft: 0, markT: 0, smokeT: 0,
      ctl: { throttle: 0, steer: 0, nitro: false, handbrake: false },
      nitro: stats.nitro, nitroT: 0,
      lap: 0, idx: 0, maxIdx: 0, prog: 0, lapStart: 0, bestLap: null, lapTimes: [],
      finished: false, finishTime: null, raceT: 0, stuckT: 0, unstick: 0, wrongT: 0,
      offPen: 0, offFrac: 0, surfKind: null, dustT: 0,
      isPlayer: false, isAI: true, driver: '', carName: '', skill: 1, caution: 1, pace: 1, noise: 0,
    }, opts || {});
  }
  // Sample the ground under each drawn wheel. The penalty lands as soon as one wheel leaves the
  // road and is biased toward the worst wheel, so straddling a kerb never beats staying on it.
  function wheelSurface(car, tr) {
    const cs = Math.cos(car.angle), sn = Math.sin(car.angle);
    let sum = 0, grip = 0, turn = 0, minSp = 1, offN = 0, kind = null;
    for (const [lx, ly] of WHEELS) {
      const s = surfaceAt(tr, car.x + lx * cs - ly * sn, car.y + lx * sn + ly * cs);
      sum += s.speed; grip += s.grip; turn += s.turn;
      if (s.speed < 1) { offN++; if (s.speed < minSp) { minSp = s.speed; kind = s; } }
    }
    const speed = offN ? (sum / 4) * 0.5 + minSp * 0.5 : 1;
    return { speed, grip: grip / 4, turn: turn / 4, offFrac: offN / 4, kind };
  }
  function hitsSolid(tr, x, y, r) {
    for (const [ox, oy] of [[-r, -r], [r, -r], [-r, r], [r, r]]) if (SOLID[cellAtF(tr, x + ox, y + oy)]) return true;
    return false;
  }
  // Coming down off a jump. A crooked landing — pointing one way, travelling another — costs
  // speed, so it is worth straightening up in the air before the wheels arrive.
  function landCar(car) {
    car.z = 0; car.vz = 0; car.air = false; car.wasRamp = false; car.landed = 1;
    const skew = Math.abs(angleDiff(Math.atan2(car.vy, car.vx), car.angle));
    const keep = clamp(1 - skew * 0.55, 0.4, 1);
    car.vx *= keep; car.vy *= keep;
  }
  function stepCar(car, tr, dt) {
    const p = car.p, c = car.ctl;
    car.steerVis += (c.steer - car.steerVis) * Math.min(1, 14 * dt);
    if (car.air) {
      // no drive, no drag, no grip: whatever you left the ramp with is what you land with,
      // bar a little air steering to line the car up for the landing
      car.angle += c.steer * 1.0 * dt;
      car.vz -= 190 * dt;
      car.z += car.vz * dt;
      car.x += car.vx * dt; car.y += car.vy * dt;
      car.speed = Math.hypot(car.vx, car.vy);
      car.offPen = 0; car.offFrac = 0; car.surfKind = null; car.slip = 0; car.drift = 0;
      if (car.nitroT > 0) car.nitroT -= dt;
      if (car.z <= 0) landCar(car);
      return;
    }
    const ws = wheelSurface(car, tr);
    const here = surfaceAt(tr, car.x, car.y);
    const boostPad = !!here.boost;
    // off-road tyres and suspension soften the blow (grass: ~22% -> ~36% of top speed), never remove it
    const soften = 1 - clamp(p.offroad - 1, 0, 9) * 0.02;
    // penalty lands the instant a wheel touches grass and lifts over ~0.35s once back on the road
    car.offPen = ws.offFrac > 0 ? (1 - ws.speed) * soften : car.offPen * Math.exp(-8 * dt);
    car.offFrac = ws.offFrac; car.surfKind = ws.kind;
    const off = 1 - car.offPen;
    const fx = Math.cos(car.angle), fy = Math.sin(car.angle), lx = -fy, ly = fx;
    let vf = car.vx * fx + car.vy * fy;
    let vl = car.vx * lx + car.vy * ly;
    if (c.nitro && car.nitro > 0 && car.nitroT <= 0) { car.nitro--; car.nitroT = 1.6; }
    const boosting = car.nitroT > 0;
    if (boosting) car.nitroT -= dt;
    // slipstream: tucked in behind someone the air is already moved out of the way
    let cap = p.maxSpeed * car.pace * (1 + car.draft * 0.17) * (boostPad ? 1.45 : off) * (boosting ? 1.35 : 1);
    if (boostPad) vf += 4.5 * dt;
    if (c.throttle > 0) vf += p.accel * car.pace * c.throttle * (boosting ? 1.8 : 1) * (1 + car.draft * 0.32) * off * dt;
    else if (c.throttle < 0) {
      if (vf > 0.1) vf += p.brake * c.throttle * dt;
      else { vf += p.accel * 0.6 * c.throttle * dt; cap = p.maxSpeed * 0.35; }
    }
    const hb = !!c.handbrake && !car.air;
    if (hb && vf > 0.1) vf -= p.brake * 0.3 * dt;   // locked back wheels scrub a little speed
    // rolling drag. Off the throttle the car sheds speed fast, so a bend can be slowed for
    // without standing on the brakes; under power it stays light or nothing would reach its cap.
    vf -= vf * ((c.throttle > 0 ? 0.28 : 1.5) + 1.1 * car.offPen) * dt;
    // a ramp holds on to whatever you brought to it, or the boost pad on the run-up would be
    // scrubbed off in the last few feet and every jump would land in the water
    if (here.jump) cap = Math.max(cap, Math.abs(vf));
    // over the cap: bleed off fast, faster still when it is the ground doing the slowing
    if (vf > cap) vf -= (vf - cap) * Math.min(1, (ws.offFrac > 0 ? 16 : 9) * dt);
    if (vf < -p.maxSpeed * 0.35) vf = -p.maxSpeed * 0.35;
    let gripK = p.grip * ws.grip;
    if (p.spoiler) gripK += Math.abs(vf) * 1.2;
    // Drifting. Pulling the handbrake drops the rear grip through the floor and the car pivots.
    // Once it is properly sideways it stays there a little more willingly, so a slide can be
    // held and steered instead of snapping straight the moment you stop asking for it.
    const slip = Math.abs(Math.atan2(vl, Math.max(0.2, Math.abs(vf))));
    car.slip = slip;
    if (hb) gripK *= 0.15;
    else gripK *= 1 - 0.42 * clamp((slip - 0.12) / 0.45, 0, 1);
    vl *= Math.exp(-gripK * dt);
    car.vx = fx * vf + lx * vl; car.vy = fy * vf + ly * vl;
    const spd = Math.abs(vf);
    // half the speed means half the threshold, or nothing would ever turn in properly again
    let turnEff = p.turn * clamp(spd / 0.6, 0, 1) / (1 + (spd / p.maxSpeed) * 0.7) * ws.turn;
    turnEff *= hb ? 1.65 : 1 + 0.35 * clamp(slip / 0.5, 0, 1);
    car.angle += c.steer * turnEff * dt * (vf < 0 ? -1 : 1);
    // move, axis by axis, bouncing off solid cells
    const r = 0.17;
    const nx = car.x + car.vx * dt;
    if (!hitsSolid(tr, nx, car.y, r)) car.x = nx; else { car.vx *= -0.3; car.vy *= 0.75; car.bump = 0.25; }
    const ny = car.y + car.vy * dt;
    if (!hitsSolid(tr, car.x, ny, r)) car.y = ny; else { car.vy *= -0.3; car.vx *= 0.75; car.bump = 0.25; }
    car.drift = Math.abs(vl);
    car.speed = Math.hypot(car.vx, car.vy);
    // Ramps. The car rides up the hump, and takes off the moment it runs out of ramp — so
    // trundling onto one and stopping does nothing, and arriving flat out sends you a long way.
    const onRamp = !!surfaceAt(tr, car.x, car.y).jump;
    if (car.wasRamp && !onRamp && vf > 0.7) {
      car.air = true;
      car.vz = 26 + clamp(vf / p.maxSpeed, 0, 1.15) * 52;
    } else if (onRamp) car.z = Math.min(10, car.z + 60 * dt);
    else car.z = Math.max(0, car.z - 40 * dt);
    car.wasRamp = onRamp;
  }
  // Slipstream: the hole another car punches in the air is worth a few mph to whoever sits in it.
  function applyDraft(cars) {
    for (const car of cars) {
      let best = 0;
      const fx = Math.cos(car.angle), fy = Math.sin(car.angle);
      for (const o of cars) {
        if (o === car || o.air || car.air) continue;
        const dx = o.x - car.x, dy = o.y - car.y, d = Math.hypot(dx, dy);
        if (d < 0.35 || d > 2.6) continue;
        const ahead = (dx * fx + dy * fy) / d;                       // 1 = squarely in front
        if (ahead < 0.86) continue;
        const aligned = Math.cos(angleDiff(o.angle, car.angle));     // both pointing the same way
        if (aligned < 0.7) continue;
        const k = (1 - (d - 0.35) / 2.25) * ((ahead - 0.86) / 0.14) * aligned;
        if (k > best) best = k;
      }
      car.draft = clamp(best, 0, 1);
    }
  }
  function collideCars(cars) {
    const R = 0.42;
    for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d >= R || d === 0) continue;
      if (Math.abs(a.z - b.z) > 7) continue;   // one of them is over the top of the other
      const nx = dx / d, ny = dy / d, overlap = R - d;
      const ma = a.p.mass * (0.7 + a.p.tough * 0.06), mb = b.p.mass * (0.7 + b.p.tough * 0.06);
      const ta = mb / (ma + mb), tb = ma / (ma + mb);
      a.x -= nx * overlap * ta; a.y -= ny * overlap * ta;
      b.x += nx * overlap * tb; b.y += ny * overlap * tb;
      const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      if (rel > 0) {
        const imp = rel * 0.75;
        a.vx -= nx * imp * ta * 2 * 0.5; a.vy -= ny * imp * ta * 2 * 0.5;
        b.vx += nx * imp * tb * 2 * 0.5; b.vy += ny * imp * tb * 2 * 0.5;
      }
    }
  }
  function updateProgress(car, tr, tk, now) {
    const idx = progressIdx(tr, tk, car.x, car.y);
    if (idx < 0) return; // off the road: keep last known
    const n = tk.n, prev = car.idx;
    if (idx !== prev) {
      if (idx === 0 && prev > n * 0.5 && car.maxIdx > n * 0.8) {
        // crossed the line forwards
        const lt = now - car.lapStart;
        if (car.lap > 0 || car.lapStart > 0) { car.lapTimes.push(lt); if (car.bestLap == null || lt < car.bestLap) car.bestLap = lt; }
        car.lap++; car.lapStart = now; car.maxIdx = 0;
      } else if (idx > prev && idx - prev < n * 0.3) {
        car.maxIdx = Math.max(car.maxIdx, idx);
      } else if (prev === 0 && idx > n * 0.5) {
        car.maxIdx = 0; // reversed over the line
      }
      car.wrongT = idx < prev && !(idx === 0) ? car.wrongT + 1 : 0;
      car.idx = idx;
    }
    const nxt = tk.wps[(idx + 1) % n];
    const dd = Math.hypot(nxt[0] - car.x, nxt[1] - car.y);
    car.prog = car.lap * n + idx + clamp(1 - dd, 0, 1);
  }
  // Look along a heading: 0 = clear road, 1 = leaves the road, 2 = hits a tree or wall.
  function probe(tr, x, y, ang, dist) {
    let worst = 0;
    const cs = Math.cos(ang), sn = Math.sin(ang);
    for (let s = 0.35; s <= dist; s += 0.25) {
      const ch = cellAtF(tr, x + cs * s, y + sn * s);
      if (SOLID[ch]) return 2;
      if (ch === 'J') return worst;   // stop at the take-off; the gap behind it is the point
      if (!TARMAC[ch]) worst = 1;
    }
    return worst;
  }
  // Drop a car back onto the racing line at its current progress, facing the right way.
  function resetToTrack(car, tr, tk) {
    for (let k = 0; k < 4; k++) {
      const i = ((car.idx - k) % tk.n + tk.n) % tk.n;
      const w = tk.wps[i], nx = tk.wps[(i + 1) % tk.n];
      if (hitsSolid(tr, w[0], w[1], 0.2)) continue;
      car.x = w[0]; car.y = w[1]; car.vx = 0; car.vy = 0;
      car.angle = Math.atan2(nx[1] - w[1], nx[0] - w[0]);
      car.idx = i; car.nitroT = 0; car.stuckT = 0; car.unstick = 0; car.unstickTries = 0;
      car.z = 0; car.vz = 0; car.air = false; car.wasRamp = false; car.draft = 0; car.slip = 0;
      return;
    }
  }
  function aiControl(car, tr, tk, dt, cars) {
    const n = tk.n, sp = car.speed;
    const L = 2 + Math.round(sp * car.skill);
    const t1 = tk.wps[(car.idx + L) % n], t2 = tk.wps[(car.idx + L + 3) % n];
    const a1 = angleDiff(Math.atan2(t1[1] - car.y, t1[0] - car.x), car.angle);
    const a2 = angleDiff(Math.atan2(t2[1] - car.y, t2[0] - car.x), car.angle);
    car.noise = Math.sin(car.raceT * 1.7 + car.seed) * 0.08;
    let steer = clamp(a1 * 2.6 + car.noise, -1, 1);
    // in the air there is nothing to do but point the car at where it is going to come down
    if (car.air) { car.ctl.steer = steer * 0.6; car.ctl.throttle = 1; car.ctl.nitro = false; car.ctl.handbrake = false; return; }
    const corner = Math.max(Math.abs(a1) * 0.6, Math.abs(a2));
    const want = car.p.maxSpeed * clamp(1.2 - corner * 0.95 * car.caution, 0.35, 1.2);
    let throttle = sp > want + 0.12 ? -0.7 : 1;
    // a ramp coming up is not a corner: get on the power or you land in the water
    const ramp = surfaceAt(tr, car.x + Math.cos(car.angle) * 1.2, car.y + Math.sin(car.angle) * 1.2).jump;
    if (ramp || surfaceAt(tr, car.x, car.y).jump) throttle = 1;
    // feelers: dodge trees, walls and the edge of the road
    const look = 1.1 + sp * 0.6;
    const f = probe(tr, car.x, car.y, car.angle, look);
    const l = probe(tr, car.x, car.y, car.angle - 0.55, look * 0.85);
    const r = probe(tr, car.x, car.y, car.angle + 0.55, look * 0.85);
    if (f === 2) {
      const side = l < r ? -1 : r < l ? 1 : (car.seed > 3 ? 1 : -1);
      steer = clamp(steer + side * 1.2, -1, 1);
      if (sp > 1) throttle = -0.6;
    } else if (f === 1 && l !== r && !ramp) {
      steer = clamp(steer + (l < r ? -0.6 : 0.6), -1, 1);
    }
    car.ctl.nitro = car.nitro > 0 && corner < 0.25 && f === 0 && car.raceT > 2 + car.seed * 2;
    car.ctl.handbrake = false;
    // The bruiser. Anyone within reach and roughly in front stops being scenery and becomes a
    // target: it aims at them, keeps its foot in, and saves the nitro for the moment it connects.
    if (car.aggro && cars) {
      let tgt = null, td = 9;
      for (const o of cars) {
        if (o === car || o.finished || o.air) continue;
        const dx = o.x - car.x, dy = o.y - car.y, d = Math.hypot(dx, dy);
        if (d > 2.3 || d >= td) continue;
        if ((dx * Math.cos(car.angle) + dy * Math.sin(car.angle)) / d < 0.35) continue;
        td = d; tgt = o;
      }
      if (tgt && f !== 2) {
        const at = angleDiff(Math.atan2(tgt.y - car.y, tgt.x - car.x), car.angle);
        steer = clamp(steer * 0.4 + at * 3.4, -1, 1);
        throttle = 1;
        car.ctl.nitro = car.nitro > 0 && td < 1.5 && car.raceT > 3;
      }
      // and it throws the car sideways into a proper hairpin rather than tiptoeing round it,
      // with a cooldown so a bad slide does not turn into a whole corner spent spinning
      car.hbCool = Math.max(0, (car.hbCool || 0) - dt);
      if (!tgt && f === 0 && corner > 0.7 && car.slip < 0.25 && sp > car.p.maxSpeed * 0.55 && car.hbCool <= 0) {
        car.ctl.handbrake = true;
        if (car.slip > 0.2) car.hbCool = 2;
      }
    }
    car.ctl.steer = steer; car.ctl.throttle = throttle;
    // stuck against something (no speed, or no lap progress for a while): back out,
    // and if that keeps failing, drop back onto the road
    if (sp < 0.18 && car.raceT > 2) car.stuckT += dt; else car.stuckT = Math.max(0, car.stuckT - dt * 0.5);
    if (car.progMark == null || car.prog > car.progMark + 1.5) { car.progMark = car.prog; car.progMarkT = car.raceT; }
    const noProgress = car.raceT > 4 && car.raceT - car.progMarkT > 4;
    if (car.stuckT > 1.0 || noProgress) {
      car.stuckT = 0; car.progMarkT = car.raceT; car.unstickTries = (car.unstickTries || 0) + 1;
      if (car.unstickTries > 2) { resetToTrack(car, tr, tk); car.progMark = null; return; }
      car.unstick = 1.0; car.unstickSteer = car.unstickTries % 2 ? -Math.sign(steer || 1) : Math.sign(steer || 1);
    }
    if (car.unstick > 0) { car.unstick -= dt; car.ctl.throttle = -1; car.ctl.steer = car.unstickSteer; car.ctl.nitro = false; car.ctl.handbrake = false; }
    else if (sp > 1 && car.raceT - car.progMarkT < 1.5) car.unstickTries = 0;
  }

  // ====================================================================
  // UI state
  // ====================================================================
  let screen = 'garage';
  const screens = { garage: $('#screen-garage'), tracks: $('#screen-tracks'), editor: $('#screen-editor'), race: $('#screen-race') };
  function showScreen(name) {
    screen = name;
    for (const k of Object.keys(screens)) screens[k].hidden = k !== name;
    document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('is-active', b.dataset.screen === name || (name === 'editor' && b.dataset.screen === 'tracks')));
    if (name === 'tracks') renderTracks();
    if (name === 'editor') { requestAnimationFrame(() => { fitCanvas(ed.canvas); fitCam(ed.cam, ed.track, 40); ed.dirty = true; }); }
    if (name === 'race') requestAnimationFrame(() => fitCanvas(race.canvas));
    if (name === 'garage') garageDirty = true;
  }
  document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => showScreen(b.dataset.screen)));
  $('#btn-help').addEventListener('click', () => { $('#help').hidden = false; });
  $('#btn-help-close').addEventListener('click', () => { $('#help').hidden = true; });

  // ---------- garage ----------
  const gCanvas = $('#garage-canvas'), gCtx = gCanvas.getContext('2d');
  let garageDirty = true, garageAngle = 0.6;
  function renderParts() {
    const host = $('#parts');
    host.innerHTML = '';
    for (const cat of Object.keys(PARTS)) {
      const wrap = document.createElement('div'); wrap.className = 'panel part-cat';
      const h = document.createElement('h2'); h.textContent = PARTS[cat].label; wrap.appendChild(h);
      const opts = document.createElement('div'); opts.className = 'options';
      for (const it of PARTS[cat].items) {
        const b = document.createElement('button'); b.className = 'opt-card' + (save.build[cat] === it.id ? ' is-on' : '');
        const mods = Object.keys(it).filter((k) => !['id', 'name', 'blurb'].includes(k)).map((k) => {
          if (k === 'nitro') return 'nitro x' + it[k];
          const v = it[k]; return (v > 0 ? '+' : '') + v + ' ' + k;
        }).join(', ');
        b.innerHTML = `<b>${it.name}</b><small>${it.blurb}</small><span class="mods">${mods || 'no change'}</span>`;
        b.addEventListener('click', () => { save.build[cat] = it.id; persist(); renderParts(); renderStats(); garageDirty = true; });
        opts.appendChild(b);
      }
      wrap.appendChild(opts); host.appendChild(wrap);
    }
    const pw = document.createElement('div'); pw.className = 'panel part-cat';
    pw.innerHTML = '<h2>Paint</h2>';
    const sw = document.createElement('div'); sw.className = 'swatches';
    for (const p of PAINTS) {
      const b = document.createElement('button'); b.className = 'swatch' + (save.build.paint === p.id ? ' is-on' : '');
      b.style.background = p.hex; b.title = p.name;
      b.addEventListener('click', () => { save.build.paint = p.id; persist(); renderParts(); garageDirty = true; });
      sw.appendChild(b);
    }
    pw.appendChild(sw); host.appendChild(pw);
  }
  function renderStats() {
    const st = computeStats(save.build);
    const host = $('#stats'); host.innerHTML = '';
    for (const [k, label] of STAT_LABELS) {
      const v = st[k];
      host.insertAdjacentHTML('beforeend', `<span>${label}</span><div class="bar ${k === 'weight' ? 'g' : ''}"><i style="width:${v * 10}%"></i></div><span class="num">${v.toFixed(1)}</span>`);
    }
    const e = partOf('engine', save.build.engine), t = partOf('tyres', save.build.tyres), b = partOf('body', save.build.body);
    $('#garage-summary').textContent = `${b.name} · ${e.name} · ${t.name} · ${VIBE_TEXT[carLook(save.build).vibe]}`;
  }
  function drawGarage() {
    const cam = makeCam(gCanvas); cam.z = 3.2; cam.x = 0; cam.y = 0; camUpdate(cam);
    cam.oy += 30;
    gCtx.clearRect(0, 0, gCanvas.width, gCanvas.height);
    const pad = diamond(cam, -0.6, -0.6, 0); pad[1] = P(cam, 0.6, -0.6, 0); pad[2] = P(cam, 0.6, 0.6, 0); pad[3] = P(cam, -0.6, 0.6, 0);
    poly(gCtx, pad, '#5d5f63', '#d4463a', 4);
    const car = makeCar(save.build); car.angle = garageAngle;
    drawCar(gCtx, cam, car, null);
  }
  $('#car-name').value = save.carName;
  $('#car-name').addEventListener('input', (e) => { save.carName = e.target.value.trim() || 'My car'; persist(); });
  $('#btn-garage-go').addEventListener('click', () => showScreen('tracks'));

  // ---------- tracks screen ----------
  function seg(hostSel, values, current, onPick, fmt) {
    const host = $(hostSel); host.innerHTML = '';
    for (const v of values) {
      const b = document.createElement('button'); b.textContent = fmt ? fmt(v) : v; b.classList.toggle('is-on', v === current);
      b.addEventListener('click', () => { onPick(v); persist(); renderSetup(); });
      host.appendChild(b);
    }
  }
  function renderSetup() {
    seg('#opt-laps', [1, 2, 3, 5], save.laps, (v) => { save.laps = v; });
    seg('#opt-rivals', [1, 2, 3, 4, 5], save.rivals, (v) => { save.rivals = v; });
    seg('#opt-diff', ['easy', 'mixed', 'hard'], save.diff, (v) => { save.diff = v; }, (v) => ({ easy: 'Gentle', mixed: 'Mixed bag', hard: 'Quick' })[v]);
  }
  function renderTracks() {
    renderSetup();
    const host = $('#track-list'); host.innerHTML = '';
    for (const tr of allTracks()) {
      const card = document.createElement('div'); card.className = 'track-card';
      const cv = document.createElement('canvas'); cv.width = 220; cv.height = 140; drawThumb(cv, tr);
      card.appendChild(cv);
      const tk = buildTrack(tr);
      const nm = document.createElement('div'); nm.className = 'name';
      nm.innerHTML = `<span>${escapeHtml(tr.name)}</span><small>${tr.builtin ? tr.w + '×' + tr.h : 'yours · ' + tr.w + '×' + tr.h}</small>`;
      card.appendChild(nm);
      const acts = document.createElement('div'); acts.className = 'acts';
      const race = document.createElement('button'); race.className = 'primary tiny'; race.textContent = tk.ok ? 'Race' : 'Not raceable'; race.disabled = !tk.ok;
      race.addEventListener('click', () => startRace(tr.id));
      acts.appendChild(race);
      const edit = document.createElement('button'); edit.className = 'tiny'; edit.textContent = tr.builtin ? 'Copy & edit' : 'Edit';
      edit.addEventListener('click', () => openEditor(tr));
      acts.appendChild(edit);
      if (!tr.builtin) {
        const del = document.createElement('button'); del.className = 'tiny'; del.textContent = 'Delete';
        del.addEventListener('click', () => { if (confirm(`Delete "${tr.name}"?`)) { save.tracks = save.tracks.filter((t) => t.id !== tr.id); persist(); renderTracks(); } });
        acts.appendChild(del);
      }
      card.appendChild(acts); host.appendChild(card);
    }
    const bests = $('#bests'); bests.innerHTML = '';
    const entries = allTracks().filter((t) => save.bests[t.id]);
    if (!entries.length) bests.innerHTML = '<div><span>No races yet.</span></div>';
    for (const t of entries) {
      const b = save.bests[t.id];
      bests.insertAdjacentHTML('beforeend', `<div>${escapeHtml(t.name)}<span>lap ${fmtTime(b.lap)} · ${ordinal(b.pos)}</span></div>`);
    }
  }
  const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  $('#btn-new-track').addEventListener('click', () => {
    const w = 16, h = 12;
    openEditor({ id: null, name: 'New track', w, h, cells: Array(w * h).fill('.'), start: null, builtin: false });
  });

  // ---------- editor ----------
  const ed = {
    canvas: $('#editor-canvas'), ctx: null, cam: null, track: null, tool: '#', dirty: true,
    painting: false, panning: false, last: null, lastCell: null,
  };
  ed.ctx = ed.canvas.getContext('2d'); ed.cam = makeCam(ed.canvas);
  function openEditor(src) {
    const t = JSON.parse(JSON.stringify(src));
    if (t.builtin) { t.id = null; t.name = src.name + ' (copy)'; }
    t.builtin = false;
    ed.track = t;
    $('#track-name').value = t.name;
    $('#track-w').value = t.w; $('#track-h').value = t.h;
    renderTools();
    renderBrush();
    showScreen('editor');
    validateEditor();
  }
  function renderTools() {
    const host = $('#tools'); host.innerHTML = '';
    TILE_TOOLS.forEach((t, i) => {
      const b = document.createElement('button'); b.className = 'tool' + (ed.tool === t.ch ? ' is-on' : '');
      b.innerHTML = `<i style="background:${t.color}"></i>${t.name} <small style="opacity:.5">${i + 1}</small>`;
      b.addEventListener('click', () => { ed.tool = t.ch; renderTools(); });
      host.appendChild(b);
    });
  }
  function renderBrush() {
    const host = $('#brush-size'); host.innerHTML = '';
    for (const n of [1, 2, 3]) {
      const b = document.createElement('button');
      b.textContent = n + ' wide'; b.classList.toggle('is-on', save.brush === n);
      b.addEventListener('click', () => { save.brush = n; persist(); renderBrush(); ed.dirty = true; });
      host.appendChild(b);
    }
  }
  function validateEditor() {
    const tk = buildTrack(ed.track);
    const el = $('#editor-status');
    el.classList.toggle('bad', !tk.ok);
    el.textContent = tk.ok ? `Loop found: ${tk.max + 2} cells round. Ready to race.` : tk.error;
    ed.tk = tk.ok ? tk : null;
    ed.dirty = true;
    return tk.ok;
  }
  // the cells the brush covers, hovered cell first
  function brushCells(cx, cy) {
    const n = clamp(save.brush || 1, 1, 3), lo = n === 3 ? -1 : 0, hi = n === 3 ? 1 : n - 1;
    const out = [];
    for (let dy = lo; dy <= hi; dy++) for (let dx = lo; dx <= hi; dx++) out.push([cx + dx, cy + dy]);
    return out;
  }
  function paintAt(cx, cy) {
    if (ed.tool === 'S') { paintCell(cx, cy); return; }
    for (const [x, y] of brushCells(cx, cy)) paintCell(x, y);
  }
  function paintCell(cx, cy) {
    const t = ed.track;
    if (cx < 0 || cy < 0 || cx >= t.w || cy >= t.h) return;
    const i = cy * t.w + cx;
    if (ed.tool === 'S') {
      if (!TARMAC[t.cells[i]]) return;
      if (t.start && t.start.x === cx && t.start.y === cy) t.start.d = (t.start.d + 1) % 4;
      else {
        let d = 0;
        for (let k = 0; k < 4; k++) {
          const [dx, dy] = DIRS[k];
          if (ROADLIKE[cellAt(t, cx + dx, cy + dy)] && ROADLIKE[cellAt(t, cx - dx, cy - dy)]) { d = k; break; }
          if (ROADLIKE[cellAt(t, cx + dx, cy + dy)]) d = k;
        }
        t.start = { x: cx, y: cy, d };
      }
    } else {
      if (t.cells[i] === ed.tool) return;
      t.cells[i] = ed.tool;
      if (t.start && t.start.x === cx && t.start.y === cy && !TARMAC[ed.tool]) t.start = null;
    }
    validateEditor();
  }
  function editorPointer(e) {
    const r = ed.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }
  ed.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  ed.canvas.addEventListener('pointerdown', (e) => {
    ed.canvas.setPointerCapture(e.pointerId);
    const [sx, sy] = editorPointer(e);
    if (e.button === 2 || e.button === 1 || ed.tool === 'P') { ed.panning = true; ed.last = [sx, sy]; return; }
    ed.painting = true; ed.lastCell = null;
    const [wx, wy] = unproject(ed.cam, sx, sy);
    paintAt(Math.floor(wx), Math.floor(wy));
  });
  ed.canvas.addEventListener('pointermove', (e) => {
    const [sx, sy] = editorPointer(e);
    if (ed.panning) {
      const dx = sx - ed.last[0], dy = sy - ed.last[1]; ed.last = [sx, sy];
      const [ax, ay] = unproject(ed.cam, 0, 0), [bx, by] = unproject(ed.cam, dx, dy);
      ed.cam.x -= bx - ax; ed.cam.y -= by - ay; camUpdate(ed.cam); ed.dirty = true;
      return;
    }
    const [wx, wy] = unproject(ed.cam, sx, sy);
    const cx = Math.floor(wx), cy = Math.floor(wy);
    ed.hover = [cx, cy]; ed.dirty = true;
    if (!ed.painting || ed.tool === 'S') return;
    if (ed.lastCell && ed.lastCell[0] === cx && ed.lastCell[1] === cy) return;
    ed.lastCell = [cx, cy];
    paintAt(cx, cy);
  });
  const endPaint = () => { ed.painting = false; ed.panning = false; };
  ed.canvas.addEventListener('pointerup', endPaint);
  ed.canvas.addEventListener('pointercancel', endPaint);
  ed.canvas.addEventListener('pointerleave', () => { ed.hover = null; ed.dirty = true; });
  ed.canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const [sx, sy] = editorPointer(e);
    const [wx, wy] = unproject(ed.cam, sx, sy);
    ed.cam.z = clamp(ed.cam.z * (e.deltaY < 0 ? 1.15 : 1 / 1.15), 0.25, 3);
    camUpdate(ed.cam);
    const [nx, ny] = unproject(ed.cam, sx, sy);
    ed.cam.x += wx - nx; ed.cam.y += wy - ny; camUpdate(ed.cam); ed.dirty = true;
  }, { passive: false });
  $('#track-name').addEventListener('input', (e) => { ed.track.name = e.target.value.trim() || 'Untitled'; });
  $('#btn-resize').addEventListener('click', () => {
    const w = clamp(parseInt($('#track-w').value, 10) || 8, 8, 32), h = clamp(parseInt($('#track-h').value, 10) || 8, 8, 32);
    const t = ed.track, cells = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) cells.push(x < t.w && y < t.h ? t.cells[y * t.w + x] : '.');
    t.cells = cells; t.w = w; t.h = h;
    if (t.start && (t.start.x >= w || t.start.y >= h)) t.start = null;
    $('#track-w').value = w; $('#track-h').value = h;
    fitCam(ed.cam, t, 40); validateEditor();
  });
  $('#btn-clear-track').addEventListener('click', () => {
    if (!confirm('Clear the whole track?')) return;
    ed.track.cells.fill('.'); ed.track.start = null; validateEditor();
  });
  function saveEditorTrack() {
    const t = ed.track;
    if (!t.id) t.id = 'c:' + Date.now().toString(36);
    const copy = { id: t.id, name: t.name, w: t.w, h: t.h, cells: t.cells.slice(), start: t.start ? { ...t.start } : null, builtin: false };
    const i = save.tracks.findIndex((x) => x.id === t.id);
    if (i >= 0) save.tracks[i] = copy; else save.tracks.push(copy);
    persist();
    return copy;
  }
  $('#btn-save-track').addEventListener('click', () => { saveEditorTrack(); showScreen('tracks'); });
  $('#btn-test-track').addEventListener('click', () => {
    if (!validateEditor()) { alert($('#editor-status').textContent); return; }
    const t = saveEditorTrack(); startRace(t.id);
  });
  $('#btn-editor-back').addEventListener('click', () => showScreen('tracks'));
  function drawEditor() {
    fitCanvas(ed.canvas);
    if (!ed.dirty && !ed.painting) return;
    ed.dirty = false;
    camUpdate(ed.cam);
    drawScene(ed.ctx, ed.cam, ed.track, ed.tk, [], { grid: true, arrow: true });
    if (ed.hover) {
      const cells = ed.tool === 'S' ? [ed.hover] : brushCells(ed.hover[0], ed.hover[1]);
      for (const [hx, hy] of cells) {
        if (hx >= 0 && hy >= 0 && hx < ed.track.w && hy < ed.track.h) poly(ed.ctx, diamond(ed.cam, hx, hy, 0), 'rgba(255,255,255,0.25)', '#fff', 2);
      }
    }
  }

  // ---------- race ----------
  const race = {
    canvas: $('#race-canvas'), ctx: null, cam: null, mini: $('#minimap'),
    track: null, tk: null, cars: [], player: null, state: 'idle', t: 0, msg: '', msgT: 0, endT: 0, ranked: [], fx: [], marks: [],
  };
  race.ctx = race.canvas.getContext('2d'); race.cam = makeCam(race.canvas);
  const keys = {};
  window.addEventListener('keydown', (e) => {
    if (screen === 'editor' && !e.target.matches('input') && e.key >= '1' && e.key <= '9') { const t = TILE_TOOLS[+e.key - 1]; if (t) { ed.tool = t.ch; renderTools(); } }
    if (screen !== 'race' || e.target.matches('input')) return;
    keys[e.key.toLowerCase()] = true;
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(e.key.toLowerCase())) e.preventDefault();
    if (e.key === 'r' && race.state === 'done') startRace(race.track.id);
    else if (e.key === 'r' && race.state === 'racing' && !race.player.finished) resetToTrack(race.player, race.track, race.tk);
  });
  window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
  window.addEventListener('blur', () => { for (const k of Object.keys(keys)) keys[k] = false; });
  const touch = {};
  document.querySelectorAll('#touch button').forEach((b) => {
    const on = (e) => { e.preventDefault(); touch[b.dataset.k] = true; };
    const off = (e) => { e.preventDefault(); touch[b.dataset.k] = false; };
    b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
  });
  function playerControl(car) {
    const up = keys.arrowup || keys.w || touch.gas, down = keys.arrowdown || keys.s || touch.brake;
    const left = keys.arrowleft || keys.a || touch.left, right = keys.arrowright || keys.d || touch.right;
    car.ctl.throttle = up ? 1 : down ? -1 : 0;
    car.ctl.steer = (left ? -1 : 0) + (right ? 1 : 0);
    car.ctl.nitro = !!(keys.shift || touch.nitro);
    car.ctl.handbrake = !!(keys[' '] || keys.x || touch.drift);
  }

  function startRace(trackId) {
    const tr = getTrack(trackId); if (!tr) return;
    const tk = buildTrack(tr);
    if (!tk.ok) { alert(tk.error); return; }
    race.track = tr; race.tk = tk; race.laps = save.laps;
    const player = makeCar(save.build, { isPlayer: true, isAI: false, driver: 'You', carName: save.carName });
    const rivals = RIVALS.slice().sort(() => Math.random() - 0.5).slice(0, save.rivals).map((r) => makeCar(randomBuild(save.diff), {
      driver: r.name, carName: r.car, skill: rnd(0.8, 1.05), caution: rnd(0.85, 1.25), pace: save.diff === 'easy' ? rnd(0.82, 0.93) : save.diff === 'hard' ? rnd(0.96, 1.04) : rnd(0.88, 1), seed: Math.random() * 6,
    }));
    // one of them races with their elbows out: a heavy car, no manners, and a bar on the front
    if (rivals.length) {
      const bruiser = rivals[0];
      bruiser.build = Object.assign({}, bruiser.build, { body: pick(['pickup', 'saloon']), extra: 'bullbar' });
      Object.assign(bruiser, makeCar(bruiser.build), {
        driver: bruiser.driver, carName: bruiser.carName, seed: bruiser.seed,
        aggro: true, tagline: 'elbows out', skill: rnd(0.95, 1.1), caution: rnd(0.72, 0.88),
        pace: bruiser.pace * 1.02,   // its edge is commitment, not a free extra helping of engine
      });
    }
    const cars = [player].concat(rivals);
    // starting grid: behind the line, back along the road
    const [dx, dy] = DIRS[tk.dir];
    const slots = [];
    for (let k = 1; k < 8 && slots.length < cars.length + 2; k++) {
      for (const [sx, sy] of tk.startCells) {
        const x = sx - dx * k, y = sy - dy * k;
        if (TARMAC[cellAt(tr, x, y)]) slots.push([x + 0.5, y + 0.5]);
      }
    }
    while (slots.length < cars.length) { const w = tk.wps[tk.n - 1 - slots.length % tk.n]; slots.push([w[0], w[1]]); }
    // player starts at the back so it is a race, not a procession
    const order = rivals.concat([player]);
    order.forEach((car, i) => {
      const s = slots[i];
      car.x = s[0]; car.y = s[1]; car.angle = Math.atan2(dy, dx);
      car.idx = tk.n - 1 - (i / 2 | 0); car.maxIdx = 0; car.lap = 0; car.raceT = 0; car.lapStart = 0;
      car.seed = car.seed || Math.random() * 6;
    });
    // treat the first line crossing as the start of lap 1
    for (const car of cars) { car.lap = 0; car.maxIdx = tk.n; car.idx = tk.n - 1; car.lapStart = 0; }
    race.cars = cars; race.player = player;
    race.state = 'countdown'; race.t = -3.2; race.msg = ''; race.endT = 0; race.finishOrder = []; race.fx = []; race.marks = [];
    $('#results').hidden = true;
    $('#race-track-name').textContent = tr.name;
    $('#tab-race').disabled = false;
    showScreen('race');
    fitCanvas(race.canvas);
    race.cam.z = clamp(race.canvas.width / (13 * TW), 0.7, 1.6);
    race.cam.x = player.x; race.cam.y = player.y;
    setMsg('3');
  }
  function setMsg(m, small) { const el = $('#hud-msg'); el.textContent = m; el.classList.toggle('small', !!small); }

  function stepRace(dt) {
    const { tk, track: tr, cars } = race;
    if (race.state === 'countdown') {
      race.t += dt;
      const n = Math.ceil(-race.t);
      setMsg(race.t < 0 ? String(n) : 'GO!');
      if (race.t >= 0) { race.state = 'racing'; race.t = 0; race.msgT = 1; for (const c of cars) c.lapStart = 0; }
      return;
    }
    race.t += dt;
    if (race.msgT > 0) { race.msgT -= dt; if (race.msgT <= 0) setMsg(''); }
    applyDraft(cars);
    for (const car of cars) {
      car.raceT += dt;
      if (car.isPlayer && !car.finished) playerControl(car); else aiControl(car, tr, tk, dt, cars);
      stepCar(car, tr, dt);
      if (car.landed) { car.landed = 0; spawnLanding(race.fx, car, tr); }
      spawnDust(race.fx, car, dt);
      spawnSmoke(race.fx, car, dt);
      spawnMarks(race.marks, car, dt);
    }
    stepDust(race.fx, dt);
    stepMarks(race.marks, dt);
    collideCars(cars);
    for (const car of cars) {
      if (car.finished) continue;
      updateProgress(car, tr, tk, race.t);
      if (car.lap > race.laps) {
        car.finished = true; car.finishTime = race.t; car.lap = race.laps; car.isAI = true;
        race.finishOrder.push(car);
        if (car.isPlayer) { setMsg(ordinal(race.finishOrder.length) + '!'); race.msgT = 3; }
      }
    }
    // ranking
    race.ranked = cars.slice().sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      return b.prog - a.prog;
    });
    const p = race.player;
    if (!p.finished && p.wrongT > 2 && p.speed > 0.5) { if (race.msgT <= 0) setMsg('Wrong way!', true); } else if (race.msgT <= 0 && $('#hud-msg').textContent === 'Wrong way!') setMsg('');
    if (p.finished) {
      race.endT += dt;
      const allDone = cars.every((c) => c.finished);
      if (allDone || race.endT > 10) finishRace();
    }
    // camera: follow player, slightly ahead
    const ax = p.x + Math.cos(p.angle) * Math.min(p.speed, 2.5) * 0.5, ay = p.y + Math.sin(p.angle) * Math.min(p.speed, 2.5) * 0.5;
    race.cam.x = lerp(race.cam.x, ax, Math.min(1, 6 * dt)); race.cam.y = lerp(race.cam.y, ay, Math.min(1, 6 * dt));
  }
  function finishRace() {
    if (race.state === 'done') return;
    race.state = 'done';
    const cars = race.ranked;
    const p = race.player, pos = cars.indexOf(p) + 1;
    const prev = save.bests[race.track.id];
    if (p.bestLap != null && (!prev || p.bestLap < prev.lap || pos < prev.pos)) {
      save.bests[race.track.id] = { lap: prev && prev.lap < p.bestLap ? prev.lap : p.bestLap, pos: prev ? Math.min(prev.pos, pos) : pos };
      persist();
    }
    $('#results-title').textContent = pos === 1 ? 'You won!' : `You came ${ordinal(pos)}`;
    const rows = cars.map((c, i) => {
      const e = partOf('engine', c.build.engine), t = partOf('tyres', c.build.tyres), b = partOf('body', c.build.body);
      return `<tr class="${c.isPlayer ? 'me' : ''}"><td>${i + 1}</td><td><span class="dot" style="background:${c.paint}"></span>${escapeHtml(c.driver)} <small>${escapeHtml(c.carName)}</small></td><td><small>${b.name}, ${e.name}, ${t.name}</small></td><td class="t">${c.finished ? fmtTime(c.finishTime) : 'still out there'}</td><td class="t"><small>${fmtTime(c.bestLap)}</small></td></tr>`;
    }).join('');
    $('#results-table').innerHTML = '<tr><th>#</th><th>Driver</th><th>Car</th><th>Time</th><th>Best lap</th></tr>' + rows;
    setMsg('');
    $('#results').hidden = false;
  }
  $('#btn-again').addEventListener('click', () => startRace(race.track.id));
  $('#btn-restart').addEventListener('click', () => startRace(race.track.id));
  $('#btn-quit').addEventListener('click', () => { race.state = 'idle'; showScreen('tracks'); });
  $('#btn-results-garage').addEventListener('click', () => { $('#results').hidden = true; race.state = 'idle'; showScreen('garage'); });
  $('#btn-results-tracks').addEventListener('click', () => { $('#results').hidden = true; race.state = 'idle'; showScreen('tracks'); });

  function drawRace() {
    fitCanvas(race.canvas);
    const cam = race.cam;
    cam.z = clamp(race.canvas.width / (13 * TW), 0.7, 1.6);
    camUpdate(cam);
    const p = race.player;
    // off the road: the camera rattles about, harder the faster you go
    const offNow = race.state === 'racing' && !p.finished && p.offFrac > 0;
    if (offNow && p.speed > 0.3) {
      const a = (2 + 3 * p.offFrac) * Math.min(1, p.speed / 1.25) * cam.z;
      cam.ox += (Math.random() - 0.5) * a; cam.oy += (Math.random() - 0.5) * a;
    }
    drawScene(race.ctx, cam, race.track, race.tk, race.cars, { labels: true, fx: race.fx, marks: race.marks });
    drawThumb(race.mini, race.track, race.cars);
    // HUD
    const rank = race.ranked.indexOf(p) + 1 || race.cars.length;
    const offEl = $('#hud-off');
    if (offNow) { offEl.textContent = 'OFF ROAD · ' + p.surfKind.name; offEl.hidden = false; } else offEl.hidden = true;
    $('#race-wrap').classList.toggle('is-off', offNow);
    $('#race-wrap').dataset.surf = offNow ? p.surfKind.name : '';
    $('#hud-speed').parentElement.classList.toggle('is-off', offNow);
    $('#hud-pos').textContent = ordinal(rank);
    $('#hud-lap').textContent = `Lap ${clamp(p.lap, 1, race.laps)} / ${race.laps}` + (p.finished ? ' · finished' : '');
    $('#hud-time').textContent = fmtTime(race.state === 'countdown' ? 0 : (p.finished ? p.finishTime : race.t));
    $('#hud-best').textContent = 'best ' + fmtTime(p.bestLap);
    $('#hud-speed').textContent = Math.round(p.speed * 44);
    const dr = $('#hud-draft');
    dr.hidden = !(race.state === 'racing' && !p.finished && p.draft > 0.25);
    const nit = $('#hud-nitro');
    if (p.stats.nitro) nit.innerHTML = Array.from({ length: p.stats.nitro }, (_, i) => `<i class="${i < p.nitro ? '' : 'off'}"></i>`).join(''); else nit.innerHTML = '';
    const st = $('#standings'); st.innerHTML = '';
    race.ranked.forEach((c, i) => {
      const gap = c.finished ? fmtTime(c.finishTime) : `lap ${clamp(c.lap, 1, race.laps)}`;
      const sub2 = escapeHtml(c.carName) + (c.tagline ? ' · ' + c.tagline : '');
      st.insertAdjacentHTML('beforeend', `<li class="${c.isPlayer ? 'me' : ''}"><span class="pos">${i + 1}</span><span class="dot" style="background:${c.paint}"></span><span>${escapeHtml(c.driver)} <span class="sub">${sub2}</span></span><span class="sub">${gap}</span></li>`);
    });
  }

  // ---------- main loop ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (screen === 'garage') {
      garageAngle += dt * 0.5; drawGarage();
    } else if (screen === 'editor') {
      drawEditor();
    } else if (screen === 'race' && race.state !== 'idle') {
      if (race.state !== 'done') stepRace(dt);
      drawRace();
    }
    requestAnimationFrame(frame);
  }

  // ---------- boot ----------
  renderParts(); renderStats(); renderTracks(); showScreen('garage');
  requestAnimationFrame(frame);
  window.addEventListener('resize', () => { ed.dirty = true; if (screen === 'editor' && ed.track) { fitCanvas(ed.canvas); fitCam(ed.cam, ed.track, 40); } });

  // small hook for smoke tests
  window.paddockDebug = { startRace, race, buildTrack, allTracks, computeStats, keys, showScreen, ed, openEditor, save };
})();
