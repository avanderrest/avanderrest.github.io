/* Wizz Delivery: the screen. Paints the town from her building sheets and the street
   surface as curves, draws the cars, markers and minimap, keeps the order board and the
   bag, and turns keys and the on-screen pad into the driver's input. See sim.js for the
   rules and ASSETS.md for the art. */
import { createWizz } from './sim.js';
import { expose } from '../lib/debug.js';

  const wz = createWizz({ on: onEvent });
  const {
    smoothPath, nearestLane, ringAt, lanePoint, mustGiveWay, waitForBox, makeArm, buildJunctions, makeOffer, seedOffers, acceptOffer, settle, shiftLevel, collide, drive, heldAtSignal, policeSignals, giveUp, updateTraffic, nearestRestaurant, destinationOf, closestAccepted, searchRoute, carDir, routePath, update, step, endShift, W, H, TILE, SHIFT_S, FLOAT, NEAR_R, DELIVER_R, CAR_R, TRAFFIC_SPEED, SPEED_LEVELS, SPEED_NAMES, NORMAL_LEVEL, MAPS, activeMapKey, activeMap, geo, BULB_R, pointInPoly, roadTiles, tarmacTiles, waterTiles, parkTiles, carparkTiles, islandTiles, featureTiles, minorTiles, addRoad, stampDisc, fillPoly, isRoad, onTarmac, isWater, isPark, isCarpark, isIsland, isTrafficLight, isRoundabout, START, DENSITY, RESTAURANTS, SURF, clamp, lerp, rnd, pick, shuffle, dist, money, meters, fmt, hash2, kindAt, takenShop, buildable, snapToPavement, houses, HOUSES, REST, restaurantAt, houseAt, solidOf, SOLID, car, input, G, ST, bag, toasts, routeCache, trafficRoad, roadNeighbours, roadList, laneSamples, laneBuckets, KEEP_LEFT, RING_TILE_R, RING_LANE_R, crossings, SIG, SIG_SLOT, STOP_BACK, junctions, armState, armGap, armOff, gridRoadMiddle, trafficLanePoint, offGrid, trafficNext, traffic, maxTraffic, resetTrafficCar, edgeEntries, enterFromEdge, orderLeft, trafficTooClose, stuckLog, DIRS, canTurnRound,
  } = wz;

  function onEvent(ev, d) {
    if (ev === 'toast') toast(d.msg, d.cls);
    else if (ev === 'shift-over') onShiftOver(d);
  }

  // ---------- constants ----------
  const SAVE_KEY = 'dash-save-v1';
  // ---------- touch screens ----------
  // `pointer: coarse` only describes the main pointer, so a Surface with its keyboard
  // attached would hide the on-screen controls. Any touch screen, or the first finger
  // or pen on the glass, sets <html class="has-touch"> instead, and a long press on a
  // button or the canvas no longer opens the browser's menu.
  (() => {
    const root = document.documentElement;
    let finger = false;
    if (window.matchMedia && matchMedia('(any-pointer: coarse)').matches) root.classList.add('has-touch');
    addEventListener('pointerdown', (e) => { finger = e.pointerType !== 'mouse'; if (finger) root.classList.add('has-touch'); }, true);
    addEventListener('contextmenu', (e) => { if (finger && e.target.closest && e.target.closest('button, canvas')) e.preventDefault(); }, true);
  })();


  // ---------- palette ----------
  // Tarmac, kerb and pavement are painted rather than sprited: the road network
  // is generated, so it has to be drawn from its own shape every frame.
  const PAL = {
    asphalt: ['#575b60', '#53575c', '#5b5f64', '#565a5f'],
    asphaltDark: 'rgba(22,24,27,0.30)',
    line: 'rgba(244,240,224,0.80)',
    lineWorn: 'rgba(244,240,224,0.42)',
    kerb: '#b6ae9c',
    kerbLip: 'rgba(70,62,48,0.35)',
    pave: ['#cfc7b5', '#c9c1af', '#d4ccba', '#c4bcaa'],
    paveSeam: 'rgba(104,95,79,0.16)',
    grass: ['#74904f', '#6d8949', '#7b9756', '#678343'],
    grassTuft: 'rgba(46,72,34,0.2)',
    hedge: 'rgba(54,78,40,0.42)',
    yard: ['#b6ae9b', '#aea695'],
    shadow: 'rgba(38,32,22,0.26)',
    // the village green, its ponds and the verge that edges every lane
    park: ['#83a862', '#7ca05b', '#8bb069', '#779a56'],
    parkFill: 'rgba(146,183,106,0.55)',
    footpath: '#c8bb96',
    shore: '#9a9f72',
    water: '#5b93c4',
    waterRim: 'rgba(210,232,246,0.45)',
    verge: '#84a463',
  };
  const SIGN_FONT = '"Sour Gummy", ui-sans-serif, system-ui, sans-serif';
  const UI_FONT = 'Nunito, ui-sans-serif, system-ui, sans-serif';
  const PAVE_BAND = 0.95;          // paving stroke, added to the carriageway width
  const PAVE_HALF = PAVE_BAND / 2; // ...so this far past the kerb on each side
  const CAR_PAINT = ['#c8483a', '#3f6fa8', '#d8a13c', '#4f8f5c', '#e6e2d6', '#7a6ca8', '#b7603a', '#43595f'];

  // ---------- painted art ----------
  // Cut from Amber's own building sheet — see ASSETS.md. Every draw site falls
  // back to a painted-in-code shape, so a sprite that has not loaded (or one
  // that was never cut) leaves no hole.
  const ART_DIR = 'assets/buildings/';
  const ART_NAMES = [
    'shop-curry', 'shop-diner', 'shop-market', 'shop-awning', 'shop-manor',
    'house-a', 'house-b', 'house-c', 'house-d', 'house-e', 'house-f', 'house-g', 'house-h', 'garage',
    'block-a', 'block-b', 'block-c', 'block-d', 'row-a', 'row-b', 'row-c',
    'flowerbed-a', 'flowerbed-b', 'flowerbed-c', 'tree-a', 'tree-b', 'tree-c',
  ];
  // The second batch (October 2026) is filed by folder: the six restaurants
  // that used to share sprites, the dish badges, the markers, the courier's car
  // and more houses. Each loads under its bare name, like the first batch.
  const COTTAGES = 'abcdefghijkl'.split('').map((c) => 'cottage-' + c);
  const TREES_ROUND = ['round-a', 'round-b', 'round-c', 'round-d', 'round-e'];
  const TREES_PINE = 'abcdefgh'.split('').map((c) => 'pine-' + c);
  const TREES_YOUNG = ['young-a', 'young-b', 'young-c', 'young-d'];
  const BUSHES = [...'abcdefgh'.split('').map((c) => 'bush-' + c), 'shrubs'];
  const ART_MORE = [
    'shops/shop-wok', 'shops/shop-pizza', 'shops/shop-barn', 'shops/shop-taco', 'shops/shop-sushi', 'shops/shop-noodle',
    'food/egg', 'food/takeaway', 'food/pizza', 'food/burger', 'food/taco', 'food/sushi', 'food/curry', 'food/ramen',
    'markers/pin-orange', 'markers/pin-green', 'markers/bag', 'vehicles/car',
    'ground/green', 'ground/allotment', 'ground/playground', 'ground/tennis', 'ground/roundabout',
    ...COTTAGES.map((n) => 'buildings/' + n),
    ...[...TREES_ROUND, 'oak', ...TREES_PINE, ...TREES_YOUNG, ...BUSHES].map((n) => 'trees/' + n),
    ...Array.from({ length: 28 }, (_, i) => 'gardens/garden-' + String(i).padStart(2, '0')),
    'buildings/garage-b', 'buildings/garage-c', 'buildings/garage-d', 'buildings/garage-e',
  ];
  const art = {};
  for (const n of ART_NAMES) { const img = new Image(); img.src = ART_DIR + n + '.png'; art[n] = img; }
  for (const p of ART_MORE) { const img = new Image(); img.src = 'assets/' + p + '.png'; art[p.slice(p.indexOf('/') + 1)] = img; }
  const ready = (name) => { const i = art[name]; return i && i.complete && i.naturalWidth > 0; };
  // Fit a sprite to its footprint: as wide as the lot plus a sliver of overhang,
  // but never so tall that the roof climbs into the road behind it.
  // These are drawn in three-quarter view, so a roof rises out of the back of
  // its lot. Let it, but not over tarmac: work out how much room there is above
  // and below the footprint first, then prefer to sit the building BACK off the
  // kerb rather than shrink it. Only somewhere hemmed in by road on both sides
  // does it lose any size.
  function blit(name, fx, fy, fw, fh, face) {
    const img = art[name];
    if (!ready(name)) return false;
    let above = true, below = true;
    for (let i = 0; i < fw; i++) {
      if (onTarmac(fx + i, fy - 1)) above = false;
      if (onTarmac(fx + i, fy + fh)) below = false;
    }
    const upRoom = above ? 0.34 * fw : 0;
    const downRoom = below ? 0.3 * fw : 0.03;
    const s = Math.min((fw + 0.06) / img.width, (fh + upRoom + downRoom) / img.height);
    const w = img.width * s, h = img.height * s;
    let bottom = fy + fh + 0.03;
    if (bottom - h < fy - upRoom) bottom = Math.min(fy - upRoom + h, fy + fh + downRoom);
    if (!face || (!face.a && !face.ox && !face.oy)) {
      ctx.drawImage(img, fx + (fw - w) / 2, bottom - h, w, h);
      return true;
    }
    ctx.save();
    ctx.translate(fx + fw / 2 + face.ox, bottom + face.oy);
    ctx.rotate(face.a);
    ctx.drawImage(img, -w / 2, -h, w, h);
    ctx.restore();
    return true;
  }

  // A sprite centred on (cx, cy), fitted inside a size x size box. Returns
  // false while it is still loading, so the caller can paint its stand-in.
  function icon(name, cx, cy, size) {
    if (!ready(name)) return false;
    const img = art[name], s = size / Math.max(img.width, img.height);
    ctx.drawImage(img, cx - img.width * s / 2, cy - img.height * s / 2, img.width * s, img.height * s);
    return true;
  }


  const $ = (s) => document.querySelector(s);
  function poly(ctx, pts, fill, stroke, lw) {
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
  }


  // ---------- save ----------
  let save = { best: 0, shifts: 0, deliveries: 0 };
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) save = Object.assign(save, JSON.parse(raw));
  } catch (e) { /* fresh start */ }
  const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } };


  // ---------- the lot plan ----------
  // The sheet has three sizes of painted building: whole 2x2 terraces, rows two
  // tiles deep, and single houses. Walk the footprints once and hand each run
  // the largest piece that fits, so the city reads as blocks rather than as a
  // field of identical huts. Keyed by the run's BOTTOM-left tile, because that
  // is the row the sprite must be drawn on for the roofs to overlap correctly.
  const BLOCK_ART = ['block-a', 'block-b', 'block-c', 'block-d'];
  // row-b is cut but not used: it is the one piece with a flat teal shopfront on
  // it, and at one sprite in three it tiled the village in bright green panels.
  const ROW_ART = ['row-a', 'row-c'];
  const HOUSE_ART = ['house-a', 'house-b', 'house-c', 'house-d', 'house-e', 'house-f', 'house-g', 'house-h', 'garage',
    ...COTTAGES, 'garage-b', 'garage-c', 'garage-d', 'garage-e'];
  // Her tree sheet: broadleaf most of the time, the odd pine, oak or sapling.
  // Weighted by listing a name more than once.
  const TREE_ART = [...TREES_ROUND, ...TREES_ROUND, 'oak', ...TREES_PINE, ...TREES_YOUNG];
  // Gardens get bushes, not the flower boxes: boxes belong by a road, and dotted
  // over every back garden they read as clutter.
  const BUSH_ART = BUSHES;
  const key = (x, y) => x + ',' + y;
  const lots = new Map();        // bottom-left tile -> the sprite standing there
  const takenByLot = new Set();  // every tile a multi-tile lot has claimed
  const plainBuilding = (x, y) => kindAt(x, y) === 'B';
  const addLot = (fx, fy, fw, fh, name) => {
    for (let y = fy; y < fy + fh; y++) for (let x = fx; x < fx + fw; x++) takenByLot.add(key(x, y));
    lots.set(key(fx, fy + fh - 1), { name, fx, fy, fw, fh });
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!plainBuilding(x, y) || takenByLot.has(key(x, y))) continue;
    const free = (ax, ay) => plainBuilding(ax, ay) && !takenByLot.has(key(ax, ay));
    const h = hash2(x + 17, y + 29);
    // Take the big piece only some of the time. There are four terraces and two
    // rows against nine single houses, so always claiming the largest run that
    // fits tiles a dense map with the same four roofs over and over.
    const appetite = hash2(x + 53, y + 91);
    if (appetite < 0.42 && free(x + 1, y) && free(x, y + 1) && free(x + 1, y + 1)) {
      addLot(x, y, 2, 2, BLOCK_ART[Math.floor(h * BLOCK_ART.length)]);
    } else if (appetite < 0.68 && free(x, y + 1)) {
      addLot(x, y, 1, 2, ROW_ART[Math.floor(h * ROW_ART.length)]);
    } else {
      addLot(x, y, 1, 1, HOUSE_ART[Math.floor(h * HOUSE_ART.length)]);
    }
  }
  // trees and bushes on the open ground
  const props = new Map();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = kindAt(x, y);
    if (k === 'T') { props.set(key(x, y), { name: TREE_ART[Math.floor(hash2(x * 3, y * 5) * TREE_ART.length)], kind: 'tree' }); continue; }
    if (k !== '.') continue;
    const h = hash2(x + 61, y + 7) * (geo ? 2.2 : 1);   // sparser where the gardens are painted
    if (h < 0.22) props.set(key(x, y), { name: BUSH_ART[Math.floor(hash2(x + 5, y) * BUSH_ART.length)], kind: 'bush' });
    else if (h < 0.48) props.set(key(x, y), { name: TREE_ART[Math.floor(hash2(x, y * 7) * TREE_ART.length)], kind: 'tree' });
  }

  // ---------- back gardens ----------
  // The middle of every block is gardens, from her sheet of square plots: two
  // tiles square where four open tiles line up on the even grid, one tile
  // otherwise. Trees still stand on top of them, from the prop pass.
  const GARDEN_ART = Array.from({ length: 28 }, (_, i) => 'garden-' + String(i).padStart(2, '0'));
  const gardens = [];
  if (geo) {
    const open = (x, y) => x >= 0 && y >= 0 && x < W && y < H && !isPark(x, y)
      && (kindAt(x, y) === '.' || kindAt(x, y) === 'T');
    const used = new Set();
    const pickG = (x, y) => GARDEN_ART[Math.floor(hash2(x + 7, y + 77) * GARDEN_ART.length)];
    for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
      if (open(x, y) && open(x + 1, y) && open(x, y + 1) && open(x + 1, y + 1)) {
        gardens.push({ x, y, s: 2, name: pickG(x, y) });
        for (const k of [key(x, y), key(x + 1, y), key(x, y + 1), key(x + 1, y + 1)]) used.add(k);
      }
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (open(x, y) && !used.has(key(x, y))) gardens.push({ x, y, s: 1, name: pickG(x, y) });
    }
  }


  const cam = { x: START.x, y: START.y };
  let toastSeq = 0;

  // ---------- input ----------
  const KEYMAP = {
    ArrowUp: 'gas', KeyW: 'gas', ArrowDown: 'brake', KeyS: 'brake',
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  };
  function setKey(e, down) {
    const k = KEYMAP[e.code];
    if (!k) return;
    e.preventDefault();
    input[k] = down;
  }
  window.addEventListener('keydown', (e) => {
    if (!e.repeat && (e.code === 'KeyE' || e.code === 'KeyQ')) { e.preventDefault(); shiftLevel(e.code === 'KeyE' ? 1 : -1); return; }
    setKey(e, true);
  });
  window.addEventListener('keyup', (e) => setKey(e, false));
  // on-screen pad for fingers
  for (const b of document.querySelectorAll('#touch button[data-shift]')) {
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); shiftLevel(Number(b.dataset.shift)); });
  }
  for (const b of document.querySelectorAll('#touch button[data-k]')) {
    const k = b.dataset.k;
    const on = (e) => { e.preventDefault(); input[k] = true; };
    const off = (e) => { e.preventDefault(); input[k] = false; };
    b.addEventListener('pointerdown', on);
    b.addEventListener('pointerup', off);
    b.addEventListener('pointerleave', off);
  }


  // Render the whole map to an offscreen canvas at `ppt` px per tile and hand
  // back a data URL. Layout is the one thing the playing view cannot show — it
  // only ever holds fifteen tiles of a fifty-tile town — so this is how a map
  // gets looked at as a map.
  function overview(ppt) {
    const px = ppt || 20;
    const off = document.createElement('canvas');
    off.width = W * px; off.height = H * px;
    const live = ctx, camX = cam.x, camY = cam.y, seen = { w: view.w, h: view.h, dpr: view.dpr };
    ctx = off.getContext('2d');
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.setTransform(px, 0, 0, px, 0, 0);
    drawGround(0, 0, W - 1, H - 1);
    if (geo) {
      drawFeatures();
      for (const [bx, by, ba] of geo.benches) drawBench(bx, by, ba);
      if (geo.van) drawVan(geo.van);
    }
    signQueue.length = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const k = kindAt(x, y);
      if (restaurantAt(x, y)) drawShop(x, y, true);
      else if (houseAt(x, y)) drawShop(x, y, false);
      else if (k === 'T' || k === '.') drawProp(x, y);
      const lot = lots.get(key(x, y));
      if (lot) drawLot(lot);
    }
    for (const r of signQueue) drawSign(r);
    ctx = live;
    cam.x = camX; cam.y = camY; view.w = seen.w; view.h = seen.h; view.dpr = seen.dpr;
    return off.toDataURL('image/png');
  }

  expose('__wizz', {
    car, bag, traffic, restaurants: REST, nearestRestaurant,
    houses: HOUSES, lots, props, gardens, minorTiles, stuckLog, crossings, art, artNames: Object.keys(art), overview,
    map: activeMapKey, geo, roadTiles, waterTiles, parkTiles, tarmacTiles, kindAt, START,
    roundabouts: activeMap.roundabouts, lights: activeMap.lights,
    searchRoute, lanePoint, nearestLane,
    junctions: () => junctions, armState, armGap, armOff, SIG, stats: ST,
    canTurnRound: (x, y) => canTurnRound(x, y),
    dirs: () => DIRS,

    artLoaded: () => Object.keys(art).filter((n) => ready(n)),
    artMissing: () => Object.keys(art).filter((n) => !ready(n)),
    sim: wz, G,
  });

  // ---------- toasts ----------
  function toast(msg, cls) {
    const d = document.createElement('div');
    d.className = 'toast ' + (cls || '');
    d.textContent = msg;
    const id = ++toastSeq;
    d.dataset.id = id;
    $('#toasts').appendChild(d);
    setTimeout(() => { const el = document.querySelector('.toast[data-id="' + id + '"]'); if (el) { el.style.transition = 'opacity .4s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 400); } }, 3000);
  }

  // ---------- rendering ----------
  const canvas = $('#game-canvas');
  let ctx = canvas.getContext('2d');   // swapped out by overview() to render the whole map
  const mm = $('#minimap');
  const mmCtx = mm.getContext('2d');
  const mmBase = document.createElement('canvas');
  mmBase.width = mm.width; mmBase.height = mm.height;
  const mW = mm.width / W, mH = mm.height / H;
  {
    const b = mmBase.getContext('2d');
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const k = kindAt(x, y);
      b.fillStyle = k === '#' ? '#5a5e63' : k === 's' ? '#cdc6b5' : k === 'B' ? '#8e8776'
        : k === 'W' ? '#5b93c4' : k === 'T' ? '#5f8a4c' : k === 'P' || k === 'I' ? '#8bb069' : '#7ba35c';
      b.fillRect(x * mW, y * mH, mW + 0.5, mH + 0.5);
    }
  }
  // The painted sprites are near their native size at TILE px, so the backing
  // store follows the device pixel ratio — on a retina panel the art is drawn at
  // full resolution instead of being upscaled by the compositor.
  const view = { w: 0, h: 0, dpr: 1 };
  function fitCanvas() {
    const r = canvas.parentElement.getBoundingClientRect();
    view.w = Math.max(240, Math.floor(r.width));
    view.h = Math.max(240, Math.floor(r.height));
    view.dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(view.w * view.dpr), h = Math.round(view.h * view.dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  }
  window.addEventListener('resize', fitCanvas);
  fitCanvas();

  // world transform: screenX = (wx - cam.x + cx/TILE) * TILE ... we use setTransform below
  function draw() {
    const z = TILE * view.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.setTransform(z, 0, 0, z, canvas.width / 2 - cam.x * z, canvas.height / 2 - cam.y * z);

    const pad = 3;
    const halfW = view.w / (2 * TILE), halfH = view.h / (2 * TILE);
    const x0 = Math.max(0, Math.floor(cam.x - halfW - pad));
    const x1 = Math.min(W - 1, Math.ceil(cam.x + halfW + pad));
    const y0 = Math.max(0, Math.floor(cam.y - halfH - pad));
    const y1 = Math.min(H - 1, Math.ceil(cam.y + halfH + pad));

    drawGround(x0, y0, x1, y1);
    // The route is paint on the tarmac, so it belongs under everything that
    // stands up off it — otherwise it draws a stripe across the roofs.
    drawRoute();

    // The curve-drawn map paints its own roundabout islands; the grid map still
    // wants the little painted circle on its junctions.
    if (!geo) for (const [x, y] of activeMap.roundabouts) {
      ctx.strokeStyle = 'rgba(232, 226, 206, 0.55)'; ctx.lineWidth = 0.1;
      ctx.beginPath(); ctx.arc(x + 0.5, y + 0.5, 0.34, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#6f9450'; ctx.beginPath(); ctx.arc(x + 0.5, y + 0.5, 0.24, 0, Math.PI * 2); ctx.fill();
    }
    if (geo) {
      drawFeatures();
      for (const [bx, by, ba] of geo.benches) drawBench(bx, by, ba);
      if (geo.van) drawVan(geo.van);
    }

    // Traffic goes under the buildings: a car passing a shopfront should be
    // overlapped by the roof that leans out over the pavement, not float on it.
    for (const t of traffic) {
      if (t.x < x0 - 1 || t.x > x1 + 1 || t.y < y0 - 1 || t.y > y1 + 1) continue;
      drawTrafficCar(t);
    }

    // Buildings, trees, restaurants and houses, front to back. Painted roofs
    // lean up out of their lot, so a row drawn later has to cover the one above.
    signQueue.length = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const k = kindAt(x, y);
      if (restaurantAt(x, y)) drawShop(x, y, true);
      else if (houseAt(x, y)) drawShop(x, y, false);
      else if (k === 'T' || k === '.') drawProp(x, y);
      const lot = lots.get(key(x, y));
      if (lot) drawLot(lot);
    }
    for (const r of signQueue) drawSign(r);

    for (const j of junctions) for (const arm of j.arms) drawSignal(j, arm);

    // the catch-zone round wherever you are parked
    const nr = nearestRestaurant();
    if (nr) {
      ctx.strokeStyle = 'rgba(201,119,47,0.35)'; ctx.lineWidth = 0.04;
      ctx.beginPath(); ctx.arc(nr.x + 0.5, nr.y + 0.5, NEAR_R, 0, Math.PI * 2); ctx.stroke();
    }

    // destination markers for the whole bag
    for (const b of bag) drawTarget(b);
    // offer bubbles above busy restaurants
    for (const r of REST) if (r.offers.length) drawBubble(r);

    drawCar();

    // vignette in screen space
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const g = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, Math.min(canvas.width, canvas.height) * 0.55, canvas.width / 2, canvas.height / 2, Math.max(canvas.width, canvas.height) * 0.82);
    g.addColorStop(0, 'rgba(30,40,20,0)');
    g.addColorStop(1, 'rgba(30,40,20,0.16)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawMinimap();
  }

  // The line to the next drop, laid along the correct side of the road so it
  // reads as a route a car could actually take rather than a straight hint.
  function drawRoute() {
    const routeTarget = closestAccepted();
    const route = routeTarget && routePath(routeTarget);
    if (!route) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Each step already knows the heading it is driven in, so the lane side
    // comes straight off that instead of being guessed from the neighbours.
    const pts = [[car.x, car.y]];
    for (const p of route) {
      const [dx, dy] = DIRS[p.d];
      const g = isRoad(p.x, p.y) ? lanePoint(p.x, p.y, dx, dy) : { x: p.x + 0.5, y: p.y + 0.5 };
      pts.push([g.x, g.y]);
    }
    // Drop the points a straight run passes through, so a turn is one corner between
    // two long legs rather than a staircase of tile steps; then round each corner off
    // with a radius up to a tile and a bit. Cutting a quarter off every tile step (what
    // this used to do) left turns at a junction as near as square.
    const line = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const a = line[line.length - 1], b = pts[i], c = pts[i + 1];
      const t1 = Math.atan2(b[1] - a[1], b[0] - a[0]), t2 = Math.atan2(c[1] - b[1], c[0] - b[0]);
      if (Math.abs(Math.atan2(Math.sin(t2 - t1), Math.cos(t2 - t1))) > 0.12) line.push(b);
    }
    if (pts.length > 1) line.push(pts[pts.length - 1]);
    const ROUTE_TURN_R = 1.25;
    ctx.beginPath();
    ctx.moveTo(line[0][0], line[0][1]);
    for (let i = 1; i < line.length - 1; i++) {
      const a = line[i - 1], b = line[i], c = line[i + 1];
      const r = Math.min(ROUTE_TURN_R, Math.hypot(b[0] - a[0], b[1] - a[1]) / 2, Math.hypot(c[0] - b[0], c[1] - b[1]) / 2);
      ctx.arcTo(b[0], b[1], c[0], c[1], r);
    }
    ctx.lineTo(line[line.length - 1][0], line[line.length - 1][1]);
    ctx.strokeStyle = 'rgba(58,44,26,0.28)'; ctx.lineWidth = 0.26; ctx.stroke();
    ctx.strokeStyle = 'rgba(248,206,86,0.95)'; ctx.lineWidth = 0.15; ctx.stroke();
    ctx.restore();
  }

  // ---------- the street surface ----------
  // A carriageway is a tile with road on BOTH sides along one axis. That test
  // matters: every tile of a two-wide road has a road neighbour, so "has a road
  // beside it" would call the whole network a junction.
  const laneH = (x, y) => isRoad(x, y) && isRoad(x - 1, y) && isRoad(x + 1, y);
  const laneV = (x, y) => isRoad(x, y) && isRoad(x, y - 1) && isRoad(x, y + 1);
  const junctionAt = (x, y) => laneH(x, y) && laneV(x, y);

  function drawGround(x0, y0, x1, y1) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const k = kindAt(x, y), n = hash2(x, y);
      if (k === '#') { ctx.fillStyle = PAL.asphalt[Math.floor(n * 4)]; ctx.fillRect(x, y, 1, 1); continue; }
      // The pond and the green are painted as smooth shapes further down; the
      // tiles under them only need to be the grass they sit in.
      if (k === 'W' || k === 'P' || k === 'I') {
        ctx.fillStyle = PAL.park[Math.floor(n * 4)];
        ctx.fillRect(x, y, 1, 1);
        if (n > 0.8) { ctx.fillStyle = PAL.grassTuft; ctx.fillRect(x + 0.2 + n * 0.4, y + 0.3 + hash2(y, x) * 0.4, 0.14, 0.05); }
        continue;
      }
      // On a curve-drawn map the paving is a stroke that follows the lane, so
      // the square ring of 's' tiles under it is painted as the front gardens
      // it actually is. Paint both and every street grows a beige margin the
      // width of a whole tile.
      if (k === 's' && geo) {
        ctx.fillStyle = PAL.grass[Math.floor(n * 4)];
        ctx.fillRect(x, y, 1, 1);
        const g = hash2(y + 3, x + 11);
        ctx.fillStyle = PAL.grass[Math.floor(g * 4)];
        ctx.globalAlpha = 0.3;
        ctx.beginPath(); ctx.ellipse(x + 0.2 + n * 0.6, y + 0.2 + g * 0.6, 0.34, 0.26, 0, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        continue;
      }
      if (k === 's') {
        ctx.fillStyle = PAL.pave[Math.floor(n * 4)];
        ctx.fillRect(x, y, 1, 1);
        // slab seams, so the pavement reads as paving and not as a beige field
        ctx.fillStyle = PAL.paveSeam;
        ctx.fillRect(x, y + 0.5, 1, 0.03);
        ctx.fillRect(x + (n < 0.5 ? 0.33 : 0.66), y, 0.03, 0.5);
        ctx.fillRect(x + (n < 0.5 ? 0.66 : 0.33), y + 0.5, 0.03, 0.5);
        continue;
      }
      if (k === 'B') { ctx.fillStyle = PAL.yard[n < 0.5 ? 0 : 1]; ctx.fillRect(x, y, 1, 1); continue; }
      // Garden. Two soft patches inside the tile and a hedge on whichever side
      // faces paving, so a run of them reads as planting rather than as squares.
      ctx.fillStyle = PAL.grass[Math.floor(n * 4)];
      ctx.fillRect(x, y, 1, 1);
      const m = hash2(y + 3, x + 11);
      ctx.fillStyle = PAL.grass[Math.floor(m * 4)];
      ctx.globalAlpha = 0.3;
      ctx.beginPath(); ctx.ellipse(x + 0.2 + n * 0.6, y + 0.2 + m * 0.6, 0.34, 0.26, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = PAL.grassTuft;
      ctx.fillRect(x + 0.15 + n * 0.5, y + 0.25 + m * 0.5, 0.12, 0.045);
      ctx.fillRect(x + 0.3 + m * 0.4, y + 0.6 + n * 0.25, 0.1, 0.04);
      // a clipped hedge wherever the garden meets paving or tarmac
      const hedged = (hx, hy) => kindAt(hx, hy) === 's' || isRoad(hx, hy);
      for (const [ex, ey, ew, eh, on] of [
        [x, y, 1, 0.12, hedged(x, y - 1)],
        [x, y + 0.88, 1, 0.12, hedged(x, y + 1)],
        [x, y, 0.12, 1, hedged(x - 1, y)],
        [x + 0.88, y, 0.12, 1, hedged(x + 1, y)],
      ]) {
        if (!on) continue;
        ctx.fillStyle = PAL.hedge; ctx.fillRect(ex, ey, ew, eh);
        ctx.fillStyle = 'rgba(160,196,130,0.28)';
        ctx.fillRect(ex, ey, ew > eh ? ew : 0.045, ew > eh ? 0.045 : eh);
      }
    }

    // A map drawn as curves paints its streets as curves. The tile passes below
    // square every edge off, which is right for the grid and wrong for a lane.
    if (geo) { drawGeoStreets(); return; }

    // kerbs, drawn on the road side of every edge where the tarmac stops
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (!isRoad(x, y)) continue;
      const edges = [
        [isRoad(x, y - 1), x, y, 1, 0.075],
        [isRoad(x, y + 1), x, y + 0.925, 1, 0.075],
        [isRoad(x - 1, y), x, y, 0.075, 1],
        [isRoad(x + 1, y), x + 0.925, y, 0.075, 1],
      ];
      for (const [hasRoad, ex, ey, ew, eh] of edges) {
        if (hasRoad) continue;
        ctx.fillStyle = PAL.kerb; ctx.fillRect(ex, ey, ew, eh);
        ctx.fillStyle = PAL.kerbLip;
        ctx.fillRect(ew > eh ? ex : ex + (ex > x ? 0 : ew - 0.02), eh > ew ? ey : ey + (ey > y ? 0 : eh - 0.02),
          ew > eh ? ew : 0.02, eh > ew ? eh : 0.02);
      }
    }

    // lane markings: a dashed centre down every carriageway, skipped at junctions
    ctx.fillStyle = PAL.line;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (!isRoad(x, y) || junctionAt(x, y)) continue;
      const dash = (ax, ay, aw, ah) => { if ((x + y) & 1) ctx.fillRect(ax, ay, aw, ah); };
      if (laneH(x, y)) {
        if (isRoad(x, y + 1) && !isRoad(x, y - 1)) dash(x + 0.12, y + 0.972, 0.62, 0.055);
        else if (!isRoad(x, y + 1) && !isRoad(x, y - 1)) dash(x + 0.12, y + 0.472, 0.62, 0.055);
      } else if (laneV(x, y)) {
        if (isRoad(x + 1, y) && !isRoad(x - 1, y)) dash(x + 0.972, y + 0.12, 0.055, 0.62);
        else if (!isRoad(x + 1, y) && !isRoad(x - 1, y)) dash(x + 0.472, y + 0.12, 0.055, 0.62);
      }
    }

    // stop lines on every junction approach, zebras only where there are lights
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (!isRoad(x, y) || junctionAt(x, y)) continue;
      const lit = isTrafficLight(x, y);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (!junctionAt(x + dx, y + dy)) continue;
        const across = dx !== 0;                       // the bar runs across the lane
        const at = dx > 0 ? x + 0.88 : dx < 0 ? x + 0.05 : dy > 0 ? y + 0.88 : y + 0.05;
        if (lit) {
          ctx.fillStyle = PAL.line;
          for (let i = 0; i < 5; i++) {
            const o = 0.08 + i * 0.18;
            if (across) ctx.fillRect(at, y + o, 0.07, 0.14);
            else ctx.fillRect(x + o, at, 0.14, 0.07);
          }
        } else {
          ctx.fillStyle = PAL.lineWorn;
          if (across) ctx.fillRect(at, y + 0.06, 0.06, 0.88);
          else ctx.fillRect(x + 0.06, at, 0.88, 0.06);
        }
      }
    }
  }

  // One signal head per approach, standing on the footway beside its own stop
  // line, facing the traffic it is stopping.
  function drawSignal(j, arm) {
    const state = armState(j, arm);
    // stop line, painted across the approach lane only
    ctx.save();
    ctx.translate(arm.x, arm.y);
    ctx.rotate(Math.atan2(arm.uy, arm.ux));
    ctx.fillStyle = state === 'red' ? 'rgba(255,236,214,0.85)' : 'rgba(244,240,224,0.5)';
    ctx.fillRect(-0.05, -arm.w * 0.26, 0.11, arm.w * 0.52);
    ctx.restore();

    ctx.save();
    ctx.translate(arm.postX, arm.postY);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath(); ctx.ellipse(0.06, 0.1, 0.2, 0.12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3d3a35'; ctx.fillRect(-0.04, -0.12, 0.08, 0.5);
    ctx.fillStyle = '#25262a';
    ctx.beginPath(); ctx.roundRect(-0.13, -0.78, 0.26, 0.68, 0.07); ctx.fill();
    const lamps = [['red', '#e84f43', -0.6], ['amber', '#e8c94a', -0.44], ['green', '#52bd67', -0.28]];
    for (const [name, colour, ly] of lamps) {
      const on = state === name;
      ctx.fillStyle = on ? colour : 'rgba(255,255,255,0.09)';
      ctx.beginPath(); ctx.arc(0, ly, 0.062, 0, Math.PI * 2); ctx.fill();
      if (!on) continue;
      ctx.globalAlpha = 0.3;
      ctx.beginPath(); ctx.arc(0, ly, 0.14, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  // ---------- streets drawn as curves ----------
  // Stroked in bands, widest first: verge, pavement, kerb, tarmac, paint. Round
  // caps and joins are what turn a list of points into a lane that bends, and
  // they close every junction for free where two strokes cross.
  function tracePath(line) {
    ctx.beginPath();
    ctx.moveTo(line[0][0], line[0][1]);
    for (let i = 1; i < line.length; i++) ctx.lineTo(line[i][0], line[i][1]);
  }
  function traceRing(ring) {
    ctx.beginPath();
    ctx.moveTo(ring[0][0], ring[0][1]);
    for (let i = 1; i < ring.length; i++) ctx.lineTo(ring[i][0], ring[i][1]);
    ctx.closePath();
  }
  function strokeRoads(width, style, extra) {
    ctx.strokeStyle = style; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const r of geo.curves) {
      ctx.lineWidth = r.w + width;
      tracePath(r.line);
      if (extra) extra(r);
      ctx.stroke();
    }
  }

  function drawGeoStreets() {
    ctx.save();

    // the green, then the ponds that sit in it
    ctx.fillStyle = PAL.parkFill;
    traceRing(geo.parkRing); ctx.fill();
    for (const p of geo.pathLines) {
      ctx.strokeStyle = PAL.footpath; ctx.lineWidth = p.w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      tracePath(p.line); ctx.stroke();
    }
    for (const ring of geo.waterRings) {
      traceRing(ring);
      ctx.fillStyle = PAL.shore; ctx.fill();
      ctx.save(); ctx.clip();
      traceRing(ring);
      ctx.translate(0, 0.16); ctx.fillStyle = PAL.water; ctx.fill();
      ctx.restore();
      // a rim of light on the far shore, so the pond reads as water not paint
      traceRing(ring);
      ctx.strokeStyle = PAL.waterRim; ctx.lineWidth = 0.1; ctx.stroke();
    }

    // Each roundabout is laid in the same passes as the lanes, band for band.
    // Painted as a stack of discs on top of the finished streets, its pavement
    // and kerb rings cut across every road that met it, so the approaches ended
    // at a kerb instead of running onto the circle.
    const ringDiscs = (r, fill) => {
      ctx.fillStyle = fill;
      for (const [cx, cy] of activeMap.roundabouts) { ctx.beginPath(); ctx.arc(cx + 0.5, cy + 0.5, r, 0, Math.PI * 2); ctx.fill(); }
    };
    // and a cul-de-sac's turning circle the same way, a size smaller
    const bulbDiscs = (r, fill) => {
      ctx.fillStyle = fill;
      for (const [bx, by] of geo.bulbs || []) { ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2); ctx.fill(); }
    };
    strokeRoads(PAVE_BAND, PAL.pave[0]); ringDiscs(2.68, PAL.pave[0]); bulbDiscs(BULB_R + 0.48, PAL.pave[0]);
    strokeRoads(0.26, PAL.kerb); ringDiscs(2.30, PAL.kerb); bulbDiscs(BULB_R + 0.1, PAL.kerb);
    strokeRoads(0.10, PAL.kerbLip); ringDiscs(2.25, PAL.kerbLip); bulbDiscs(BULB_R + 0.05, PAL.kerbLip);
    strokeRoads(0, PAL.asphalt[1]); ringDiscs(2.20, PAL.asphalt[1]); bulbDiscs(BULB_R, PAL.asphalt[1]);

    // Car parks go on after the strokes, not before: the verge band is wider
    // than the lane it edges, and laid second it mowed a green stripe straight
    // across the hub.
    for (const [px, py, pw, ph] of geo.carparks) {
      ctx.fillStyle = PAL.kerb;
      ctx.beginPath(); ctx.roundRect(px - 0.14, py - 0.14, pw + 0.28, ph + 0.28, 0.5); ctx.fill();
      ctx.fillStyle = PAL.asphalt[1];
      ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 0.4); ctx.fill();
      ctx.strokeStyle = PAL.lineWorn; ctx.lineWidth = 0.06;
      for (let i = 1; i * 1.1 < ph - 0.4; i++) {
        ctx.beginPath();
        ctx.moveTo(px + 0.25, py + 0.4 + i * 1.1); ctx.lineTo(px + pw * 0.45, py + 0.4 + i * 1.1);
        ctx.moveTo(px + pw * 0.55, py + 0.4 + i * 1.1); ctx.lineTo(px + pw - 0.25, py + 0.4 + i * 1.1);
        ctx.stroke();
      }
    }

    // centre lines, and a solid edge line where the lane is wide enough for one
    ctx.save();
    ctx.lineCap = 'butt';
    ctx.setLineDash([0.5, 0.58]);
    ctx.strokeStyle = PAL.line; ctx.lineWidth = 0.062;
    for (const r of geo.curves) { if (r.w >= 1.9) { tracePath(r.line); ctx.stroke(); } }
    ctx.restore();

    // the roundabout: fresh tarmac over the centre lines that ran into it, the
    // lane line round it, then the planted middle
    for (const [cx, cy] of activeMap.roundabouts) {
      const mx = cx + 0.5, my = cy + 0.5;
      const disc = (r, fill) => { ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(mx, my, r, 0, Math.PI * 2); ctx.fill(); };
      disc(2.20, PAL.asphalt[1]);
      ctx.strokeStyle = PAL.line; ctx.lineWidth = 0.08; ctx.setLineDash([0.32, 0.28]);
      ctx.beginPath(); ctx.arc(mx, my, 1.36, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      if (ready('roundabout')) {
        const img = art.roundabout, rw = 1.7, rh = rw * img.height / img.width;
        ctx.drawImage(img, mx - rw / 2, my - rh / 2, rw, rh);
        continue;
      }
      disc(0.78, PAL.kerb);
      disc(0.66, PAL.parkFill);
      disc(0.38, PAL.hedge);
    }
    ctx.restore();
  }

  // The painted grounds: allotment, playground, tennis court, the green, and
  // under them all the back gardens.
  function drawFeatures() {
    for (const g of gardens) {
      if (!ready(g.name)) continue;
      ctx.drawImage(art[g.name], g.x + 0.03, g.y + 0.03, g.s - 0.06, g.s - 0.06);
    }
    for (const f of geo.features || []) {
      if (!ready(f.art)) continue;
      ctx.fillStyle = PAL.shadow;
      ctx.fillRect(f.x + 0.08, f.y + 0.1, f.w, f.h);
      ctx.drawImage(art[f.art], f.x, f.y, f.w, f.h);
    }
  }

  // Benches face the footpath; `a` is the angle the seat back is turned to.
  function drawBench(bx, by, a) {
    ctx.save(); ctx.translate(bx, by); ctx.rotate(a);
    ctx.fillStyle = PAL.shadow;
    ctx.fillRect(-0.32, -0.08, 0.68, 0.26);
    ctx.fillStyle = '#8a6a44'; ctx.fillRect(-0.34, -0.14, 0.68, 0.14);
    ctx.fillStyle = '#6f5335'; ctx.fillRect(-0.34, -0.24, 0.68, 0.08);
    ctx.fillStyle = 'rgba(255,240,210,0.22)'; ctx.fillRect(-0.34, -0.14, 0.68, 0.035);
    ctx.restore();
  }

  // The hub van, parked at the top of its car park — the one bit of the mock
  // that is a vehicle rather than a building.
  function drawVan(v) {
    ctx.save(); ctx.translate(v.x, v.y); ctx.rotate(v.h);
    ctx.fillStyle = PAL.shadow;
    ctx.beginPath(); ctx.roundRect(-0.52, -1.02, 1.12, 2.2, 0.2); ctx.fill();
    ctx.fillStyle = '#e8b45a';
    ctx.beginPath(); ctx.roundRect(-0.55, -1.1, 1.1, 2.2, 0.2); ctx.fill();
    ctx.fillStyle = '#d99c3e';
    ctx.beginPath(); ctx.roundRect(-0.55, 0.42, 1.1, 0.68, 0.18); ctx.fill();
    ctx.fillStyle = '#f3ddb0'; ctx.fillRect(-0.44, -0.62, 0.88, 0.74);
    ctx.fillStyle = '#8c5a3a'; ctx.fillRect(-0.44, -0.62, 0.88, 0.14);
    ctx.fillStyle = '#4b5560';
    ctx.beginPath(); ctx.roundRect(-0.42, -1.0, 0.84, 0.3, 0.1); ctx.fill();
    ctx.fillStyle = '#2b2d31';
    for (const oy of [-0.7, 0.66]) { ctx.fillRect(-0.62, oy - 0.16, 0.1, 0.34); ctx.fillRect(0.52, oy - 0.16, 0.1, 0.34); }
    ctx.fillStyle = '#b4472f'; ctx.font = '700 0.26px ' + SIGN_FONT;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('WIZZ', 0, -0.34);
    ctx.restore();
  }

  // ---------- buildings ----------
  // Every one of these paints a sprite if the sheet has it and falls back to the
  // drawn block if it does not, so a missing PNG costs detail and nothing else.
  const signQueue = [];
  function footprintShadow(fx, fy, fw, fh, face) {
    ctx.save();
    // the shadow has to move and turn with the building, or a set-back house
    // leaves its own footprint sitting out on the pavement
    if (face && (face.a || face.ox || face.oy)) {
      ctx.translate(fx + fw / 2 + face.ox, fy + fh / 2 + face.oy);
      ctx.rotate(face.a);
      ctx.translate(-(fx + fw / 2), -(fy + fh / 2));
    }
    ctx.fillStyle = PAL.shadow;
    ctx.beginPath(); ctx.roundRect(fx + 0.06, fy + 0.1, fw - 0.06, fh - 0.06, 0.1); ctx.fill();
    ctx.restore();
  }
  function drawnBlock(fx, fy, fw, fh, side, roof, elev) {
    ctx.fillStyle = side;
    ctx.beginPath(); ctx.roundRect(fx + 0.03, fy + 0.03, fw - 0.06, fh - 0.06, 0.08); ctx.fill();
    ctx.fillStyle = roof;
    ctx.beginPath(); ctx.roundRect(fx + 0.03, fy + 0.03 - elev, fw - 0.06, fh - 0.06, 0.08); ctx.fill();
    ctx.strokeStyle = '#4a3524'; ctx.lineWidth = 0.055;
    ctx.beginPath(); ctx.roundRect(fx + 0.03, fy + 0.03 - elev, fw - 0.06, fh - 0.06, 0.08); ctx.stroke();
  }
  function drawLot(lot) {
    footprintShadow(lot.fx, lot.fy, lot.fw, lot.fh);
    if (blit(lot.name, lot.fx, lot.fy, lot.fw, lot.fh)) return;
    const n = hash2(lot.fx + 9, lot.fy + 9);
    drawnBlock(lot.fx, lot.fy, lot.fw, lot.fh, '#6d6b64',
      ['#b7b5aa', '#aeacb0', '#c1bfb4', '#a9a79c'][Math.floor(n * 4)], 0.42);
  }
  // trees and bushes on the open ground
  function drawProp(x, y) {
    const p = props.get(key(x, y));
    if (!p) return;
    const n = hash2(x * 3, y * 5);
    const jx = (n - 0.5) * 0.16, jy = (hash2(y, x) - 0.5) * 0.16;
    if (p.kind === 'bush') {
      ctx.fillStyle = 'rgba(38,32,22,0.18)';
      ctx.beginPath(); ctx.ellipse(x + 0.52 + jx, y + 0.76 + jy, 0.28, 0.1, 0, 0, Math.PI * 2); ctx.fill();
      if (blit(p.name, x + 0.15 + jx, y + 0.2 + jy, 0.62, 0.6)) return;
      ctx.fillStyle = '#4f8442';
      ctx.beginPath(); ctx.arc(x + 0.5 + jx, y + 0.55 + jy, 0.26, 0, Math.PI * 2); ctx.fill();
      return;
    }
    ctx.fillStyle = 'rgba(38,32,22,0.2)';
    ctx.beginPath(); ctx.ellipse(x + 0.55 + jx, y + 0.78 + jy, 0.3, 0.13, 0, 0, Math.PI * 2); ctx.fill();
    if (blit(p.name, x + jx, y - 0.18 + jy, 0.92, 1.05)) return;
    ctx.strokeStyle = '#6b4a2b'; ctx.lineWidth = 0.07;
    ctx.beginPath(); ctx.moveTo(x + 0.5 + jx, y + 0.8 + jy); ctx.lineTo(x + 0.5 + jx, y + 0.45 + jy); ctx.stroke();
    ctx.fillStyle = n < 0.5 ? '#3f7a3a' : '#46863f';
    ctx.beginPath(); ctx.arc(x + 0.5 + jx, y + 0.4 + jy, 0.34, 0, Math.PI * 2); ctx.fill();
  }
  // one little shop that happens to be a restaurant (or a house)
  // How a kerbside building meets its street. Two things come out of the road's
  // own geometry: how far back off the footway the plot starts, and which way
  // the street is running so the building can be squared up to it.
  //
  // The rotation is deliberately the street's deviation from the nearest
  // cardinal, not its bearing. These are three-quarter sprites with a front
  // door and a roof ridge, so turning one through 90 degrees would show a house
  // from an angle the art does not have. Deviation keeps a house upright on a
  // north-south or east-west street — exactly as before — and leans it only by
  // however much its street leans.
  const kerbCache = new Map();
  function kerbInfo(x, y) {
    const ck = x + ',' + y;
    if (kerbCache.has(ck)) return kerbCache.get(ck);
    let info = { ox: 0, oy: 0, a: 0 };
    const s = geo && nearestLane(x + 0.5, y + 0.5);
    if (s) {
      const vx = x + 0.5 - s.x, vy = y + 0.5 - s.y;
      const d = Math.hypot(vx, vy) || 1;
      // the paving reaches this far past the centreline; anything nearer than
      // that is footway, and the building has to start behind it
      const setback = clamp((s.w / 2 + PAVE_HALF) - (d - 0.5), 0, 0.55);
      let a = Math.atan2(s.ty, s.tx) % (Math.PI / 2);
      if (a > Math.PI / 4) a -= Math.PI / 2;
      if (a < -Math.PI / 4) a += Math.PI / 2;
      info = { ox: (vx / d) * setback, oy: (vy / d) * setback, a };
    }
    kerbCache.set(ck, info);
    return info;
  }

  function drawShop(x, y, rest) {
    const face = kerbInfo(x, y);
    footprintShadow(x, y, 1, 1, face);
    const r = rest ? REST.find((q) => q.x === x && q.y === y) : null;
    if (rest) {
      if (!blit(r.art, x, y, 1, 1, face)) drawnBlock(x, y, 1, 1, '#8c5a3a', r.roof, 0.46);
      signQueue.push(r);   // flushed after the whole row pass, or a neighbour's roof buries it
      return;
    }
    const name = HOUSE_ART[Math.floor(hash2(x + 31, y + 19) * HOUSE_ART.length)];
    if (blit(name, x, y, 1, 1, face)) return;
    const n = hash2(x + 31, y + 19);
    drawnBlock(x, y, 1, 1, '#b3a893', n < 0.5 ? '#e2d6ba' : '#d9ccae', 0.34);
    ctx.fillStyle = '#6b4a2b'; ctx.fillRect(x + 0.3, y + 0.5, 0.4, 0.24);
  }
  // A hanging board over the door. Bella's and Curry Corner already have their
  // name lettered on the sheet, so those two only get the dish badge.
  function drawSign(r) {
    // Paired shops share a column; drop the lower one's board so the two boards
    // do not land on each other.
    const paired = REST.some((q) => q !== r && q.x === r.x && q.y === r.y - 1);
    const cx = r.x + 0.5, cy = r.y + (paired ? 0.94 : 0.06);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    let bx = cx, by = cy - 0.06;          // where the dish badge ends up
    if (!r.signed) {
      ctx.font = '700 0.26px ' + SIGN_FONT;
      // the board carries the name, with the badge let into its left end
      const text = ctx.measureText(r.name).width;
      const w = Math.max(0.95, text + 0.62);
      const left = cx - w / 2;
      ctx.fillStyle = 'rgba(38,30,20,0.3)';
      ctx.beginPath(); ctx.roundRect(left + 0.02, cy - 0.16, w, 0.36, 0.09); ctx.fill();
      ctx.fillStyle = '#f2e9d2';
      ctx.beginPath(); ctx.roundRect(left, cy - 0.18, w, 0.36, 0.09); ctx.fill();
      ctx.strokeStyle = 'rgba(92,66,40,0.55)'; ctx.lineWidth = 0.03;
      ctx.beginPath(); ctx.roundRect(left, cy - 0.18, w, 0.36, 0.09); ctx.stroke();
      ctx.fillStyle = '#4a3524';
      ctx.fillText(r.name, cx + 0.16, cy + 0.01);
      bx = left + 0.2; by = cy;
    }
    // the dish badge, so a shop is told apart at a glance and not by reading
    ctx.fillStyle = '#fbf6ea';
    ctx.beginPath(); ctx.arc(bx, by, 0.185, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(92,66,40,0.5)'; ctx.lineWidth = 0.03; ctx.stroke();
    if (icon(r.food, bx, by, 0.3)) return;
    ctx.font = '0.24px ' + SIGN_FONT;
    ctx.fillText(r.icon, bx, by + 0.015);
  }
  // ---------- markers ----------
  // A takeaway bag in a speech bubble over any restaurant with work on the board.
  function drawBubble(r) {
    const bob = Math.sin(performance.now() / 300 + r.x) * 0.05;
    // Restaurants are seeded in pairs a tile apart, so the lower one's bubble
    // would sit exactly on its neighbour's shopfront. Lean them apart instead.
    const paired = REST.some((q) => q !== r && q.x === r.x && q.y === r.y - 1);
    const cx = r.x + 0.5 + (paired ? 0.62 : 0), cy = r.y - (paired ? 0.2 : 0.46) + bob;
    const w = 0.56, h = 0.56;
    ctx.fillStyle = 'rgba(38,30,20,0.28)';
    ctx.beginPath(); ctx.roundRect(cx - w / 2 + 0.02, cy - h / 2 + 0.04, w, h, 0.12); ctx.fill();
    ctx.fillStyle = '#fdf8ec';
    ctx.beginPath(); ctx.roundRect(cx - w / 2, cy - h / 2, w, h, 0.12); ctx.fill();
    poly(ctx, [[cx - 0.09, cy + h / 2 - 0.01], [cx + 0.07, cy + h / 2 - 0.01], [cx - 0.02, cy + h / 2 + 0.15]], '#fdf8ec');
    // the bag: her painted one, or folded top, body and handle until it loads
    if (!icon('bag', cx, cy - 0.01, 0.42)) {
    ctx.fillStyle = '#c2884b';
    ctx.beginPath(); ctx.roundRect(cx - 0.15, cy - 0.12, 0.3, 0.3, 0.035); ctx.fill();
    ctx.fillStyle = '#d79f60';
    ctx.beginPath(); ctx.roundRect(cx - 0.15, cy - 0.19, 0.3, 0.1, 0.03); ctx.fill();
    ctx.strokeStyle = '#a06f3a'; ctx.lineWidth = 0.028;
    ctx.beginPath(); ctx.arc(cx, cy - 0.19, 0.075, Math.PI, 0); ctx.stroke();
    ctx.fillStyle = 'rgba(120,80,40,0.35)';
    ctx.fillRect(cx - 0.15, cy - 0.09, 0.3, 0.018);
    }
    // count badge
    ctx.fillStyle = '#c9772f';
    ctx.beginPath(); ctx.arc(cx + 0.24, cy - 0.23, 0.14, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fdf8ec'; ctx.lineWidth = 0.035; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = '700 0.19px ' + SIGN_FONT;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(r.offers.length, cx + 0.24, cy - 0.215);
  }
  // A map pin over every destination in the bag: the dish for a pickup still to
  // be made, the house number once the food is actually in the car.
  function drawTarget(b) {
    const destination = destinationOf(b);
    const cx = destination.x, cy = destination.y - 0.1;
    const isT = G.tracked === b.id;
    const bob = Math.sin(performance.now() / 260 + b.id) * 0.045;
    const d = dist(car.x, car.y, cx, destination.y);
    const R = isT ? 0.26 : 0.21;
    const top = cy - 0.66 + bob;
    const body = isT ? '#e3922f' : b.pickedUp ? '#4b8f5f' : 'rgba(150,120,86,0.85)';

    ctx.fillStyle = 'rgba(38,30,20,0.22)';
    ctx.beginPath(); ctx.ellipse(cx + 0.03, cy + 0.02, R * 0.7, R * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    // Her painted pin: orange for the one being tracked, green once the food is
    // aboard, and a faded orange for a pickup still waiting. The sprite's point
    // is its bottom edge and its hole sits 36% of the way down.
    const pin = b.pickedUp && !isT ? 'pin-green' : 'pin-orange';
    if (ready(pin)) {
      const img = art[pin], pw = R * 2.6, ph = pw * img.height / img.width;
      const tip = cy + bob * 0.5, hy = tip - ph * 0.64;
      ctx.globalAlpha = isT || b.pickedUp ? 1 : 0.8;
      ctx.drawImage(img, cx - pw / 2, tip - ph, pw, ph);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#fdf8ec';
      ctx.beginPath(); ctx.arc(cx, hy, pw * 0.31, 0, Math.PI * 2); ctx.fill();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (b.pickedUp) {
        ctx.fillStyle = '#4a3524'; ctx.font = '700 ' + (pw * 0.34).toFixed(3) + 'px ' + SIGN_FONT;
        ctx.fillText(b.hm.id, cx, hy + pw * 0.02);
      } else if (!icon(b.r.food, cx, hy, pw * 0.5)) {
        ctx.font = (pw * 0.4).toFixed(3) + 'px ' + SIGN_FONT;
        ctx.fillText(b.r.icon, cx, hy + pw * 0.02);
      }
    } else {
    // teardrop: a disc with a spike run down to the ground point
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(cx, top, R, Math.PI * 0.82, Math.PI * 0.18);
    ctx.lineTo(cx, cy);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = isT ? 0.045 : 0.03; ctx.stroke();
    ctx.fillStyle = '#fdf8ec';
    ctx.beginPath(); ctx.arc(cx, top, R * 0.62, 0, Math.PI * 2); ctx.fill();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (b.pickedUp) {
      ctx.fillStyle = '#4a3524'; ctx.font = '700 ' + (R * 0.78).toFixed(3) + 'px ' + SIGN_FONT;
      ctx.fillText(b.hm.id, cx, top + R * 0.04);
    } else {
      ctx.font = (R * 0.92).toFixed(3) + 'px ' + SIGN_FONT;
      ctx.fillText(b.r.icon, cx, top + R * 0.04);
    }
    }
    if (!isT) return;
    ctx.font = '600 0.28px ' + UI_FONT;
    const lab = (b.pickedUp ? 'House #' + b.hm.id : b.r.name) + ' \u00b7 ' + meters(d) + (b.pickedUp ? ' \u00b7 ' + fmt(Math.max(0, orderLeft(b))) : '');
    const w = ctx.measureText(lab).width + 0.22;
    ctx.fillStyle = 'rgba(48,38,26,0.86)';
    ctx.beginPath(); ctx.roundRect(cx - w / 2, top - R - 0.36, w, 0.32, 0.09); ctx.fill();
    ctx.fillStyle = '#fdf8ec';
    ctx.fillText(lab, cx, top - R - 0.19);
  }
  // ---------- vehicles ----------
  // One shell, two callers. The body is drawn nose-up in local space: -y is
  // forward, so the caller only has to rotate by the heading it already keeps.
  function carShell(paint, len, wide, opts) {
    const L = len, Wd = wide;
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath(); ctx.ellipse(0.03, 0.08, Wd * 1.5, L * 1.25, 0, 0, Math.PI * 2); ctx.fill();
    // tyres, poking out either side of the sills
    ctx.fillStyle = '#23252a';
    for (const [px, py] of [[-Wd, -L * 0.52], [Wd, -L * 0.52], [-Wd, L * 0.52], [Wd, L * 0.52]]) {
      ctx.beginPath(); ctx.roundRect(px - 0.035, py - 0.085, 0.07, 0.17, 0.025); ctx.fill();
    }
    // body
    ctx.fillStyle = paint;
    ctx.beginPath(); ctx.roundRect(-Wd, -L, Wd * 2, L * 2, [Wd * 0.85, Wd * 0.85, Wd * 0.5, Wd * 0.5]); ctx.fill();
    // a darker skirt down each flank reads as the curve of the roof falling away
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath(); ctx.roundRect(-Wd, -L, Wd * 0.34, L * 2, [Wd * 0.7, 0, 0, Wd * 0.4]); ctx.fill();
    ctx.beginPath(); ctx.roundRect(Wd * 0.66, -L, Wd * 0.34, L * 2, [0, Wd * 0.7, Wd * 0.4, 0]); ctx.fill();
    // glass: windscreen forward, rear screen aft, roof between
    ctx.fillStyle = 'rgba(38,52,64,0.82)';
    ctx.beginPath(); ctx.roundRect(-Wd * 0.72, -L * 0.62, Wd * 1.44, L * 0.42, 0.035); ctx.fill();
    ctx.beginPath(); ctx.roundRect(-Wd * 0.72, L * 0.24, Wd * 1.44, L * 0.34, 0.035); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.beginPath(); ctx.roundRect(-Wd * 0.66, -L * 0.58, Wd * 0.5, L * 0.32, 0.03); ctx.fill();
    // lamps
    ctx.fillStyle = opts && opts.lightsOn ? '#fff4cf' : 'rgba(246,238,206,0.7)';
    ctx.beginPath(); ctx.roundRect(-Wd * 0.78, -L - 0.005, Wd * 0.46, 0.06, 0.02); ctx.fill();
    ctx.beginPath(); ctx.roundRect(Wd * 0.32, -L - 0.005, Wd * 0.46, 0.06, 0.02); ctx.fill();
    ctx.fillStyle = opts && opts.braking ? '#ff4b39' : 'rgba(168,52,40,0.85)';
    ctx.beginPath(); ctx.roundRect(-Wd * 0.8, L - 0.055, Wd * 0.48, 0.06, 0.02); ctx.fill();
    ctx.beginPath(); ctx.roundRect(Wd * 0.32, L - 0.055, Wd * 0.48, 0.06, 0.02); ctx.fill();
    if (opts && opts.braking) {
      ctx.fillStyle = 'rgba(255,75,57,0.22)';
      ctx.beginPath(); ctx.ellipse(0, L + 0.1, Wd * 1.2, 0.14, 0, 0, Math.PI * 2); ctx.fill();
    }
  }
  function drawTrafficCar(t) {
    if (t.paint === undefined) {
      t.paint = CAR_PAINT[Math.floor(hash2(t.id + 11, t.id * 7 + 3) * CAR_PAINT.length)];
      t.len = 0.2 + hash2(t.id + 5, t.id) * 0.06;
    }
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.rotate(t.heading);
    carShell(t.paint, t.len, 0.125, { braking: t.wait > 0 });
    ctx.restore();
  }
  function drawCar() {
    // a ring under the car, so it is never lost against a busy street
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 0.035;
    ctx.beginPath(); ctx.arc(car.x, car.y, 0.42 + Math.sin(performance.now() / 420) * 0.02, 0, Math.PI * 2); ctx.stroke();
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.h);
    // her painted car, nose up like the shell; the shell is only its stand-in
    if (ready('car')) {
      const img = art.car, L = 0.5, Wd = L * img.width / img.height;
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath(); ctx.ellipse(0.03, 0.06, Wd * 0.55, L * 0.55, 0, 0, Math.PI * 2); ctx.fill();
      ctx.drawImage(img, -Wd / 2, -L / 2, Wd, L);
      if (input.brake && car.v > 0.2) {
        ctx.fillStyle = 'rgba(255,75,57,0.3)';
        ctx.beginPath(); ctx.ellipse(0, L / 2 + 0.06, Wd * 0.5, 0.1, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
      return;
    }
    carShell('#d94f30', 0.21, 0.135, { braking: input.brake && car.v > 0.2, lightsOn: true });
    // the courier's topbox — the one thing that says this car is working
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath(); ctx.roundRect(-0.085, 0.045, 0.17, 0.14, 0.03); ctx.fill();
    ctx.fillStyle = '#f0a83c';
    ctx.beginPath(); ctx.roundRect(-0.09, 0.03, 0.18, 0.14, 0.03); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath(); ctx.roundRect(-0.055, 0.065, 0.11, 0.07, 0.02); ctx.fill();
    ctx.restore();
  }

  function drawMinimap() {
    mmCtx.clearRect(0, 0, mm.width, mm.height);
    mmCtx.drawImage(mmBase, 0, 0);
    for (const r of REST) { mmCtx.fillStyle = r.roof; mmCtx.fillRect(r.x * mW - 1, r.y * mH - 1, 3, 3); }
    for (const r of REST) if (r.offers.length) {
      mmCtx.fillStyle = '#c9772f';
      mmCtx.beginPath(); mmCtx.arc(r.x * mW, r.y * mH, 2.3, 0, Math.PI * 2); mmCtx.fill();
    }
    for (const b of bag) {
      const active = G.tracked === b.id;
      const rx = b.r.x * mW, ry = b.r.y * mH;
      const hx = b.hm.x * mW, hy = b.hm.y * mH;
      mmCtx.strokeStyle = active ? '#f6d56b' : '#ffffff';
      mmCtx.lineWidth = active ? 2 : 1;
      mmCtx.strokeRect(rx - 2.5, ry - 2.5, 5, 5);
      mmCtx.fillStyle = active ? '#f6d56b' : '#66cc66';
      mmCtx.fillRect(hx - 1.5, hy - 1.5, 3, 3);
    }
    mmCtx.fillStyle = '#ffffff';
    mmCtx.beginPath(); mmCtx.arc(car.x * mW, car.y * mH, 2, 0, Math.PI * 2); mmCtx.fill();
    mmCtx.strokeStyle = '#c9772f'; mmCtx.lineWidth = 1;
    mmCtx.strokeRect(0.5, 0.5, mm.width - 1, mm.height - 1);
  }

  // ---------- DOM ----------
  const nearbyEl = $('#nearby'), nearbySub = $('#nearby-sub'), nearbyHint = $('#nearby-hint');
  const bagEl = $('#bag'), bagSub = $('#bag-sub'), enroutePanel = $('#enroute-panel');
  const flagNear = $('#flag-near'), flagNext = $('#flag-next');
  function render() {
    $('#sum-cash').textContent = money(G.money);
    $('#sum-earned').textContent = money(G.earned);
    $('#sum-time').textContent = fmt(Math.max(0, G.shiftLeft));
    $('#bestline').textContent = save.best ? 'best shift ' + money(save.best) : '';

    const near = [];
    for (const r of REST) for (const o of r.offers) near.push(o);
    near.sort((a, b) => {
      const pickupA = dist(car.x, car.y, a.r.x + 0.5, a.r.y + 0.5);
      const pickupB = dist(car.x, car.y, b.r.x + 0.5, b.r.y + 0.5);
      return pickupA - pickupB || a.id - b.id;
    });
    if (near.length) {
      nearbySub.textContent = near.length + ' available';
      nearbyHint.textContent = '';
      nearbyEl.innerHTML = '';
      for (const o of near) {
        const row = document.createElement('div');
        row.className = 'order';
        const restaurantDistance = dist(car.x, car.y, o.r.x + 0.5, o.r.y + 0.5);
        const houseDistance = dist(o.r.x + 0.5, o.r.y + 0.5, o.hm.x + 0.5, o.hm.y + 0.5);
        row.innerHTML = '<div><div class="who">House #' + o.hm.id + ' <small>\u00b7 ' + o.r.name + '</small></div>' +
          '<div class="dist">restaurant ' + meters(restaurantDistance) + ' \u00b7 house ' + meters(houseDistance) + ' \u00b7 +' + money(o.tip) + ' if fast</div></div>' +
          '<div class="pay">' + money(o.base) + '</div>' +
          '<div class="acts"><span class="dist">order ' + fmt(Math.max(0, (o.expiry - G.ms) / 1000)) + '</span><span class="spacer"></span><button class="act primary" data-accept="' + o.id + '">Accept</button></div>';
        nearbyEl.appendChild(row);
      }
    } else {
      nearbySub.textContent = '';
      nearbyHint.textContent = 'No open orders right now. Check back soon.';
      nearbyEl.innerHTML = '<div class="no-orders">No open orders</div>';
    }

    const sbag = bag.slice().sort((a, b) => orderLeft(a) - orderLeft(b));
    enroutePanel.hidden = !sbag.length;
    bagSub.textContent = sbag.length ? sbag.length + ' in the bag' : '';
    bagEl.innerHTML = '';
    if (!sbag.length) {
      bagEl.innerHTML = '<div class="no-orders">Bag is empty \u2014 go grab some work.</div>';
    }
    for (const b of sbag) {
      const sec = orderLeft(b);
      const row = document.createElement('div');
      row.className = 'order' + (G.tracked === b.id ? ' is-tracked' : '');
      const destination = destinationOf(b);
      const d = dist(car.x, car.y, destination.x, destination.y);
      const label = b.pickedUp ? 'House #' + b.hm.id : 'Pick up at ' + b.r.name;
      const status = b.pickedUp ? (sec < 0 ? 'LATE' : fmt(sec)) : 'PICKUP';
      row.innerHTML = '<div><div class="who">' + label + '</div>' +
        '<div class="dist">' + meters(d) + ' away</div></div>' +
        '<div class="timer' + (b.pickedUp ? (sec < 0 ? ' bad' : sec < 10 ? ' warn' : ' good') : ' warn') + '">' + status + '</div>' +
        '<div class="acts"><span class="dist">' + (b.pickedUp ? 'pays ' + money(b.base) + (sec > 0 && sec < 12 ? ' \u00b7 hurry, tip is on the line' : '') : 'drive to restaurant to start the timer') + '</span>' +
        '<span class="spacer"></span><button class="act" data-track="' + b.id + '">' + (G.tracked === b.id ? 'Following' : 'Follow') + '</button></div>';
      bagEl.appendChild(row);
    }

    // top corner flags
    const nr = nearestRestaurant();
    if (nr) { flagNear.hidden = false; flagNear.innerHTML = '<small>At</small> <b>' + nr.name + '</b>' + (nr.offers.length ? ' <small>\u00b7 ' + nr.offers.length + ' offer' + (nr.offers.length > 1 ? 's' : '') + '</small>' : ''); }
    else flagNear.hidden = true;
    const tb = sbag[0];
    if (tb) {
      const destination = destinationOf(tb);
      const d0 = dist(car.x, car.y, destination.x, destination.y);
      flagNext.hidden = false;
      const c = orderLeft(tb);
      flagNext.classList.toggle('is-hot', c < 0 || c < 10);
      flagNext.innerHTML = '<small>next</small> <b>' + (tb.pickedUp ? 'House #' + tb.hm.id : tb.r.name + ' pickup') + '</b> <small>\u00b7 ' + meters(d0) + ' \u00b7 ' + (tb.pickedUp ? (c < 0 ? 'LATE' : fmt(c)) : 'no timer yet') + '</small>';
    } else flagNext.hidden = true;
  }

  function acceptFromElement(element) {
    const id = +element.dataset.accept;
    for (const r of REST) for (const o of r.offers) if (o.id === id) acceptOffer(o);
  }
  document.addEventListener('pointerdown', (e) => {
    const acc = e.target.closest('[data-accept]');
    if (acc) {
      e.preventDefault();
      acceptFromElement(acc);
    }
  });
  document.addEventListener('click', (e) => {
    const acc = e.target.closest('[data-accept]');
    if (acc) {
      acceptFromElement(acc);
      return;
    }
    const trk = e.target.closest('[data-track]');
    if (trk) {
      G.tracked = +trk.dataset.track;
      return;
    }
  });

  // ---------- shift lifecycle ----------
  // the sim has stopped the shift; the page records it and shows the summary
  function onShiftOver(reason) {
    save.best = Math.max(save.best, G.earned);
    save.shifts++; save.deliveries += ST.done;
    persist();
    $('#summary-title').textContent = reason;
    $('#summary-record').hidden = true;
    $('#summary-table').innerHTML =
      '<tr><td>Deliveries</td><td class="t">' + ST.done + '</td></tr>' +
      '<tr><td>Bonus deliveries</td><td class="t">' + ST.bonus + '</td></tr>' +
      '<tr><td>Late fines</td><td class="t">' + ST.late + '</td></tr>' +
      (ST.redLights ? '<tr><td>Red lights run</td><td class="t">' + ST.redLights + '</td></tr>' : '') +
      '<tr><td>Offers missed</td><td class="t">' + ST.expired + '</td></tr>' +
      '<tr><td>Fares</td><td class="t">' + money(ST.fare) + '</td></tr>' +
      '<tr><td>Tips</td><td class="t">+' + money(ST.tip) + '</td></tr>' +
      '<tr><td>Fines</td><td class="t">\u2013' + money(ST.fine) + '</td></tr>' +
      '<tr><td></td><td class="t"></td></tr>' +
      '<tr><td>Earned this shift</td><td class="t" style="font-weight:700;color:' + (G.earned < 0 ? 'var(--bad)' : 'var(--green)') + '">' + money(G.earned) + '</td></tr>' +
      (ST.bestStreak > 1 ? '<tr><td>Longest bonus streak</td><td class="t">' + ST.bestStreak + '</td></tr>' : '') +
      ('<tr><td>Best shift ever</td><td class="t">' + money(save.best) + '</td></tr>');
    $('#summary').hidden = false;
  }
  function startShift() {
    wz.startShift();
    cam.x = START.x; cam.y = START.y;
    $('#summary').hidden = true;
    $('#toasts').innerHTML = '';
  }
  $('#btn-end').addEventListener('click', () => { if (!G.over) wz.endShift('Shift ended early'); });
  $('#btn-new-shift').addEventListener('click', startShift);
  // Paused, the shift's clock stops, and with it the traffic and every order deadline.
  const setPaused = (on) => wz.setPaused(on);
  const showPause = (on) => { $('#pause').hidden = !on; setPaused(on); };
  $('#btn-help').addEventListener('click', () => { $('#help').hidden = false; setPaused(true); });
  $('#btn-help-close').addEventListener('click', () => { $('#help').hidden = true; setPaused(!$('#pause').hidden); });
  $('#btn-pause').addEventListener('click', (e) => { e.currentTarget.blur(); if (!G.over) showPause(true); });
  $('#btn-resume').addEventListener('click', () => showPause(false));
  window.addEventListener('keydown', (e) => {
    if ((e.code === 'KeyP' || e.code === 'Escape') && !G.over && $('#help').hidden) { e.preventDefault(); showPause($('#pause').hidden); }
  });
  // as if the page had never been opened: the best shift and the tallies go, the map choice stays
  $('#btn-restart').addEventListener('click', () => {
    if (!confirm('Start over? Your best shift and every tally will be wiped.')) return;
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
    location.reload();
  });
  // ---------- main loop ----------
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    wz.step(dt);
    if (!G.over && !G.paused) {
      cam.x = lerp(cam.x, car.x, 1 - Math.exp(-6 * dt));
      cam.y = lerp(cam.y, car.y, 1 - Math.exp(-6 * dt));
    }
    draw();
    render();
  }
  startShift();
  requestAnimationFrame(frame);
