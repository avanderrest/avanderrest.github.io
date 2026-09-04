/* Paddock — bolt a car together from parts, race it on isometric tracks, draw your own tracks.
   Plain canvas + DOM, nothing to build. Saves to localStorage. */
(() => {
  'use strict';

  // ---------- constants ----------
  const SAVE_KEY = 'paddock-save-v1';
  const TW = 64, TH = 32;                       // isometric tile footprint in px at zoom 1
  const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // east, south, west, north
  const START_CHARS = { '>': 0, 'v': 1, '<': 2, '^': 3 };
  const ROADLIKE = { '#': true, 'B': true };
  const SOLID = { 'T': true, 'W': true };
  // speed = share of top speed (and acceleration) left when all four wheels sit on it,
  // before off-road parts soften it a touch. Leaving the tarmac is meant to hurt.
  const SURFACE = {
    '.': { name: 'grass',  speed: 0.22, grip: 0.55, turn: 0.85, dust: ['#3e6b2a', '#a5d45a', '#d9e8a0', '#5a3f28'] },
    'g': { name: 'gravel', speed: 0.38, grip: 0.40, turn: 0.90, dust: ['#d8c9a2', '#c2ab80', '#efe4c8'] },
    'm': { name: 'mud',    speed: 0.12, grip: 1.30, turn: 0.70, dust: ['#5a3f28', '#6e4f33', '#3e2a18'] },
    '#': { name: 'road',   speed: 1.00, grip: 1.00, turn: 1.00 },
    'B': { name: 'boost',  speed: 1.00, grip: 1.00, turn: 1.00, boost: true },
  };
  // wheel positions in car-local tiles; drawCar draws the wheels at exactly these spots
  const WHEELS = [[-0.17, -0.16], [0.17, -0.16], [-0.17, 0.16], [0.17, 0.16]];
  const TILE_TOOLS = [
    { ch: '#', name: 'Road',      color: '#5d5f63' },
    { ch: 'B', name: 'Boost pad', color: '#e9b63a' },
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
  const BUILTIN = [
    { id: 'b:oval', name: 'Paddock Oval', rows: [
      '..................',
      '..TT..........TT..',
      '..#####>######....',
      '..#..........###..',
      '..#.TT.........#..',
      '..#............#..',
      '..#....TT......#..',
      '..#............#..',
      '..###.........##..',
      '....######B####...',
      '..TT..........TT..',
      '..................',
    ] },
    { id: 'b:willow', name: 'Willow Bends', rows: [
      '......................',
      '.TT..............TT...',
      '..###B####<########...',
      '..#..gg..........#....',
      '..#..............##...',
      '..#..TT...#####...#...',
      '..#.......#...#...#...',
      '..#.......#.T.#...#...',
      '..##......#...#...#...',
      '...#......#...#####...',
      '...#......#..gg.......',
      '...####gg.#...TT......',
      '......#####...........',
      '..TT..................',
      '......................',
    ] },
    { id: 'b:scrapyard', name: 'Scrapyard', rows: [
      '....................',
      '.WWWWWWWWWWWWWWWWWW.',
      '.W################W.',
      '.W######W#####W###W.',
      '.W##............##W.',
      '.W##.TT.........##W.',
      '.W##............W#W.',
      '.W##....mm......##W.',
      '.W#W............##W.',
      '.W##............##W.',
      '.W##..W.T.......##W.',
      '.W##............B#W.',
      '.W####W######W####W.',
      '.W######>#########W.',
      '.WWWWWWWWWWWWWWWWWW.',
      '....................',
    ] },
    { id: 'b:hairpin', name: 'Hairpin Hill', rows: [
      '........................',
      '.TT.................TT..',
      '..##########<#########..',
      '..#..................#..',
      '..#..gg..............#..',
      '..#..................#..',
      '..#....######........#..',
      '..#....#....#........#..',
      '..#....#.TT.#..mm....#..',
      '..#....#....#........#..',
      '..#....#....##########..',
      '..#....#................',
      '..#....#....TT..........',
      '..######................',
      '.TT.....................',
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
  function carParams(stats) {
    return {
      maxSpeed: 3.2 + 0.42 * stats.speed,
      accel: 1.7 + 0.5 * stats.accel,
      turn: 1.5 + 0.22 * stats.handling,
      grip: 1.6 + 0.85 * stats.grip,
      brake: 7,
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
      if (ROADLIKE[ch]) fill = n < 0.5 ? '#5b5d61' : '#5f6165';
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
      if (ROADLIKE[ch]) {
        // kerbs on edges facing non-road
        const edges = [[x, y, x + 1, y, 0, -1], [x + 1, y, x + 1, y + 1, 1, 0], [x + 1, y + 1, x, y + 1, 0, 1], [x, y + 1, x, y, -1, 0]];
        for (const [ax, ay, bx, by, ox, oy] of edges) {
          if (ROADLIKE[cellAt(tr, x + ox, y + oy)]) continue;
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

  function drawCar(ctx, cam, car, label) {
    const z = cam.z;
    const hex = car.paint;
    const cs = Math.cos(car.angle), sn = Math.sin(car.angle);
    const W = (lx, ly) => [car.x + lx * cs - ly * sn, car.y + lx * sn + ly * cs];
    const rect = (l, w, h, back, front) => {
      const b = back == null ? -l / 2 : back, f = front == null ? l / 2 : front;
      return [W(b, -w / 2), W(f, -w / 2), W(f, w / 2), W(b, w / 2)].map(([x, y]) => P(cam, x, y, h));
    };
    const bodyL = 0.5, bodyW = 0.28, hb = 7, hr = 6;
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    poly(ctx, rect(bodyL + 0.05, bodyW + 0.08, -1), 'rgba(0,0,0,0.22)');
    // wheels
    ctx.fillStyle = '#222';
    for (const [lx, ly] of WHEELS) {
      const [wx, wy] = W(lx, ly); const p = P(cam, wx, wy, 1.5);
      ctx.beginPath(); ctx.ellipse(p[0], p[1], 3.2 * z, 2.2 * z, 0, 0, Math.PI * 2); ctx.fill();
    }
    // body block: ground rect in dark, sides, then top
    const g = rect(bodyL, bodyW, 1), t = rect(bodyL, bodyW, hb);
    poly(ctx, g, shade(hex, 0.55));
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      poly(ctx, [g[i], g[j], t[j], t[i]], shade(hex, i % 2 ? 0.72 : 0.82));
    }
    poly(ctx, t, hex, 'rgba(0,0,0,0.25)', 1);
    // cabin
    const cg = rect(0.26, 0.22, hb, -0.16, 0.1), ct = rect(0.2, 0.18, hb + hr, -0.14, 0.05);
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      poly(ctx, [cg[i], cg[j], ct[j], ct[i]], i === 1 ? '#bfe3f2' : (i === 3 ? '#9cc5d6' : shade(hex, 0.7)));
    }
    poly(ctx, ct, shade(hex, 1.15), 'rgba(0,0,0,0.2)', 1);
    // lights
    for (const s of [-1, 1]) {
      const [hx, hy] = W(bodyL / 2 - 0.02, s * 0.09); const hp = P(cam, hx, hy, hb - 2);
      ctx.fillStyle = '#fff4b0'; ctx.beginPath(); ctx.arc(hp[0], hp[1], 1.8 * z, 0, Math.PI * 2); ctx.fill();
      const [tx, ty] = W(-bodyL / 2 + 0.02, s * 0.09); const tp = P(cam, tx, ty, hb - 2);
      ctx.fillStyle = car.ctl && car.ctl.throttle < 0 ? '#ff3b2e' : '#8a1f18'; ctx.beginPath(); ctx.arc(tp[0], tp[1], 1.6 * z, 0, Math.PI * 2); ctx.fill();
    }
    // nitro flame
    if (car.nitroT > 0) {
      const [fx, fy] = W(-bodyL / 2 - 0.12, 0); const fp = P(cam, fx, fy, hb - 3);
      ctx.fillStyle = 'rgba(255,170,40,0.9)'; ctx.beginPath(); ctx.arc(fp[0], fp[1], (4 + Math.random() * 3) * z, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(120,190,255,0.9)'; ctx.beginPath(); ctx.arc(fp[0], fp[1], 2 * z, 0, Math.PI * 2); ctx.fill();
    }
    if (label) {
      const lp = P(cam, car.x, car.y, hb + hr + 16);
      ctx.font = `${Math.max(10, 11 * z)}px ${getComputedStyle(document.body).fontFamily}`;
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
    if (!car.surfKind || car.offFrac <= 0 || car.speed < 0.5) return;
    // more spray the faster you are going and the more wheels are off
    car.dustT += dt * 48 * car.offFrac * Math.min(1, car.speed / 2);
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
      const col = ROADLIKE[ch] ? (ch === 'B' ? '#e9b63a' : '#5d5f63') : ch === 'g' ? '#c9b48a' : ch === 'm' ? '#6e4f33' : ch === 'T' ? '#3f7a3a' : ch === 'W' ? '#b8b3aa' : null;
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
      build, stats, p: carParams(stats), paint: (PAINTS.find((p) => p.id === build.paint) || PAINTS[0]).hex,
      x: 0, y: 0, angle: 0, vx: 0, vy: 0, speed: 0, drift: 0,
      ctl: { throttle: 0, steer: 0, nitro: false },
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
  function stepCar(car, tr, dt) {
    const p = car.p, c = car.ctl;
    const ws = wheelSurface(car, tr);
    const boostPad = !!surfaceAt(tr, car.x, car.y).boost;
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
    let cap = p.maxSpeed * car.pace * (boostPad ? 1.45 : off) * (boosting ? 1.35 : 1);
    if (boostPad) vf += 9 * dt;
    if (c.throttle > 0) vf += p.accel * car.pace * c.throttle * (boosting ? 1.8 : 1) * off * dt;
    else if (c.throttle < 0) {
      if (vf > 0.2) vf += p.brake * c.throttle * dt;
      else { vf += p.accel * 0.6 * c.throttle * dt; cap = p.maxSpeed * 0.35; }
    }
    // rolling drag, plus the grass and mud dragging at the wheels
    vf -= vf * (0.3 + 0.9 * car.offPen) * dt;
    // over the cap: bleed off fast, faster still when it is the ground doing the slowing
    if (vf > cap) vf -= (vf - cap) * Math.min(1, (ws.offFrac > 0 ? 12 : 5) * dt);
    if (vf < -p.maxSpeed * 0.35) vf = -p.maxSpeed * 0.35;
    let gripK = p.grip * ws.grip;
    if (p.spoiler) gripK += Math.abs(vf) * 0.6;
    vl *= Math.exp(-gripK * dt);
    car.vx = fx * vf + lx * vl; car.vy = fy * vf + ly * vl;
    const spd = Math.abs(vf);
    const turnEff = p.turn * clamp(spd / 1.2, 0, 1) / (1 + (spd / p.maxSpeed) * 0.7) * ws.turn;
    car.angle += c.steer * turnEff * dt * (vf < 0 ? -1 : 1);
    // move, axis by axis, bouncing off solid cells
    const r = 0.17;
    const nx = car.x + car.vx * dt;
    if (!hitsSolid(tr, nx, car.y, r)) car.x = nx; else { car.vx *= -0.3; car.vy *= 0.75; car.bump = 0.25; }
    const ny = car.y + car.vy * dt;
    if (!hitsSolid(tr, car.x, ny, r)) car.y = ny; else { car.vy *= -0.3; car.vx *= 0.75; car.bump = 0.25; }
    car.drift = Math.abs(vl);
    car.speed = Math.hypot(car.vx, car.vy);
  }
  function collideCars(cars) {
    const R = 0.42;
    for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d >= R || d === 0) continue;
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
      if (!ROADLIKE[ch]) worst = 1;
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
      return;
    }
  }
  function aiControl(car, tr, tk, dt) {
    const n = tk.n, sp = car.speed;
    const L = 2 + Math.round(sp * 0.5 * car.skill);
    const t1 = tk.wps[(car.idx + L) % n], t2 = tk.wps[(car.idx + L + 3) % n];
    const a1 = angleDiff(Math.atan2(t1[1] - car.y, t1[0] - car.x), car.angle);
    const a2 = angleDiff(Math.atan2(t2[1] - car.y, t2[0] - car.x), car.angle);
    car.noise = Math.sin(car.raceT * 1.7 + car.seed) * 0.08;
    let steer = clamp(a1 * 2.6 + car.noise, -1, 1);
    const corner = Math.max(Math.abs(a1) * 0.6, Math.abs(a2));
    const want = car.p.maxSpeed * clamp(1.2 - corner * 0.95 * car.caution, 0.35, 1.2);
    let throttle = sp > want + 0.25 ? -0.7 : 1;
    // feelers: dodge trees, walls and the edge of the road
    const look = 1.1 + sp * 0.3;
    const f = probe(tr, car.x, car.y, car.angle, look);
    const l = probe(tr, car.x, car.y, car.angle - 0.55, look * 0.85);
    const r = probe(tr, car.x, car.y, car.angle + 0.55, look * 0.85);
    if (f === 2) {
      const side = l < r ? -1 : r < l ? 1 : (car.seed > 3 ? 1 : -1);
      steer = clamp(steer + side * 1.2, -1, 1);
      if (sp > 2) throttle = -0.6;
    } else if (f === 1 && l !== r) {
      steer = clamp(steer + (l < r ? -0.6 : 0.6), -1, 1);
    }
    car.ctl.steer = steer; car.ctl.throttle = throttle;
    car.ctl.nitro = car.nitro > 0 && corner < 0.25 && f === 0 && car.raceT > 2 + car.seed * 2;
    // stuck against something (no speed, or no lap progress for a while): back out,
    // and if that keeps failing, drop back onto the road
    if (sp < 0.35 && car.raceT > 2) car.stuckT += dt; else car.stuckT = Math.max(0, car.stuckT - dt * 0.5);
    if (car.progMark == null || car.prog > car.progMark + 1.5) { car.progMark = car.prog; car.progMarkT = car.raceT; }
    const noProgress = car.raceT > 4 && car.raceT - car.progMarkT > 4;
    if (car.stuckT > 1.0 || noProgress) {
      car.stuckT = 0; car.progMarkT = car.raceT; car.unstickTries = (car.unstickTries || 0) + 1;
      if (car.unstickTries > 2) { resetToTrack(car, tr, tk); car.progMark = null; return; }
      car.unstick = 1.0; car.unstickSteer = car.unstickTries % 2 ? -Math.sign(steer || 1) : Math.sign(steer || 1);
    }
    if (car.unstick > 0) { car.unstick -= dt; car.ctl.throttle = -1; car.ctl.steer = car.unstickSteer; car.ctl.nitro = false; }
    else if (sp > 2 && car.raceT - car.progMarkT < 1.5) car.unstickTries = 0;
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
    $('#garage-summary').textContent = `${b.name} · ${e.name} · ${t.name}` + (st.nitro ? ' · nitro' : '');
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
  function validateEditor() {
    const tk = buildTrack(ed.track);
    const el = $('#editor-status');
    el.classList.toggle('bad', !tk.ok);
    el.textContent = tk.ok ? `Loop found: ${tk.max + 2} cells round. Ready to race.` : tk.error;
    ed.tk = tk.ok ? tk : null;
    ed.dirty = true;
    return tk.ok;
  }
  function paintCell(cx, cy) {
    const t = ed.track;
    if (cx < 0 || cy < 0 || cx >= t.w || cy >= t.h) return;
    const i = cy * t.w + cx;
    if (ed.tool === 'S') {
      if (!ROADLIKE[t.cells[i]]) return;
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
      if (t.start && t.start.x === cx && t.start.y === cy && !ROADLIKE[ed.tool]) t.start = null;
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
    paintCell(Math.floor(wx), Math.floor(wy));
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
    paintCell(cx, cy);
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
      const [hx, hy] = ed.hover;
      if (hx >= 0 && hy >= 0 && hx < ed.track.w && hy < ed.track.h) poly(ed.ctx, diamond(ed.cam, hx, hy, 0), 'rgba(255,255,255,0.25)', '#fff', 2);
    }
  }

  // ---------- race ----------
  const race = {
    canvas: $('#race-canvas'), ctx: null, cam: null, mini: $('#minimap'),
    track: null, tk: null, cars: [], player: null, state: 'idle', t: 0, msg: '', msgT: 0, endT: 0, ranked: [], fx: [],
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
    car.ctl.nitro = !!(keys.shift || keys[' '] || touch.nitro);
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
    const cars = [player].concat(rivals);
    // starting grid: behind the line, back along the road
    const [dx, dy] = DIRS[tk.dir];
    const slots = [];
    for (let k = 1; k < 8 && slots.length < cars.length + 2; k++) {
      for (const [sx, sy] of tk.startCells) {
        const x = sx - dx * k, y = sy - dy * k;
        if (ROADLIKE[cellAt(tr, x, y)]) slots.push([x + 0.5, y + 0.5]);
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
    race.state = 'countdown'; race.t = -3.2; race.msg = ''; race.endT = 0; race.finishOrder = []; race.fx = [];
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
    for (const car of cars) {
      car.raceT += dt;
      if (car.isPlayer && !car.finished) playerControl(car); else aiControl(car, tr, tk, dt);
      stepCar(car, tr, dt);
      spawnDust(race.fx, car, dt);
    }
    stepDust(race.fx, dt);
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
    if (!p.finished && p.wrongT > 2 && p.speed > 1) { if (race.msgT <= 0) setMsg('Wrong way!', true); } else if (race.msgT <= 0 && $('#hud-msg').textContent === 'Wrong way!') setMsg('');
    if (p.finished) {
      race.endT += dt;
      const allDone = cars.every((c) => c.finished);
      if (allDone || race.endT > 10) finishRace();
    }
    // camera: follow player, slightly ahead
    const ax = p.x + Math.cos(p.angle) * Math.min(p.speed, 5) * 0.25, ay = p.y + Math.sin(p.angle) * Math.min(p.speed, 5) * 0.25;
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
    if (offNow && p.speed > 0.6) {
      const a = (2 + 3 * p.offFrac) * Math.min(1, p.speed / 2.5) * cam.z;
      cam.ox += (Math.random() - 0.5) * a; cam.oy += (Math.random() - 0.5) * a;
    }
    drawScene(race.ctx, cam, race.track, race.tk, race.cars, { labels: true, fx: race.fx });
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
    $('#hud-speed').textContent = Math.round(p.speed * 22);
    const nit = $('#hud-nitro');
    if (p.stats.nitro) nit.innerHTML = Array.from({ length: p.stats.nitro }, (_, i) => `<i class="${i < p.nitro ? '' : 'off'}"></i>`).join(''); else nit.innerHTML = '';
    const st = $('#standings'); st.innerHTML = '';
    race.ranked.forEach((c, i) => {
      const gap = c.finished ? fmtTime(c.finishTime) : `lap ${clamp(c.lap, 1, race.laps)}`;
      st.insertAdjacentHTML('beforeend', `<li class="${c.isPlayer ? 'me' : ''}"><span class="pos">${i + 1}</span><span class="dot" style="background:${c.paint}"></span><span>${escapeHtml(c.driver)} <span class="sub">${escapeHtml(c.carName)}</span></span><span class="sub">${gap}</span></li>`);
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
