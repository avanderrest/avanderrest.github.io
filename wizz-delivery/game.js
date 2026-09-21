/* Dash — a food-courier game. Drive a car between restaurants and houses,
   stack up deliveries, and chase tips before the countdowns run you over.
   Plain canvas + DOM, nothing to build. Saves the best shift to localStorage. */
(() => {
  'use strict';

  // ---------- constants ----------
  const SAVE_KEY = 'dash-save-v1';
  const W = 50, H = 34;              // city grid, in tiles
  const TILE = 44;                   // css px per tile — the art wants the room
  const SHIFT_S = 300;               // length of one shift, seconds
  const FLOAT = 25;                  // starting cash
  const NEAR_R = 5;                  // restaurant catch radius, tiles
  const DELIVER_R = 1.45;            // you are "at the door" inside this
  const CAR_R = 0.3;                 // collision circle
  // The two maps are laid out in different languages on purpose. The American
  // grid is a lattice — whole rows and columns of tarmac, so it is spelled as
  // the lines it is made of. The English village has no straight line in it:
  // it is drawn as stroked curves, rasterised to tiles for collision and
  // pathfinding and stroked again for paint, which is what lets a lane bend.
  const MAPS = {
    grid: {
      name: 'American grid', traffic: 0.9, trafficSide: 'right',
      // facing north in the east half of the road, driving on the right, and
      // short of the junction's stop line rather than parked in the box
      start: { x: 18.5, y: 21.5 },
      roads: { vertical: [3, 10, 17, 24, 31, 38, 44], horizontal: [3, 10, 17, 24, 30] },
      lights: [[10, 10], [17, 17], [31, 17], [38, 24]], roundabouts: [],
      restaurants: [[5, 5], [5, 6], [12, 12], [12, 13], [26, 12], [26, 13], [19, 19], [19, 20]],
      density: { built: 0.64, treed: 0.76 },
    },
    village: {
      name: 'English villages', traffic: 0.45, trafficSide: 'left',
      start: { x: 25.7, y: 12.5 },
      lights: [[25, 7], [36, 15]],
      roundabouts: [[13, 6]],
      geo: {
        // Control points for a Catmull-Rom through them; `w` is the carriageway
        // in tiles. Everything else on the map is hung off these.
        roads: [
          { name: 'High Street', w: 2.3, pts: [[-3, 5.2], [8, 6.2], [17, 7.0], [26, 7.2], [34, 6.4], [42, 5.4], [53, 5.6]] },
          { name: 'Mill Lane', w: 2.0, pts: [[14.5, -3], [13.6, 3], [13.0, 9], [12.4, 15], [13.4, 21], [16.0, 26], [18.6, 31], [19.6, 37]] },
          { name: 'Church Road', w: 2.0, pts: [[25.6, 3], [25.6, 10], [25.9, 16], [24.8, 22], [24.0, 28], [24.6, 37]] },
          { name: 'Orchard Way', w: 1.9, pts: [[38.6, 2], [37.6, 8], [36.4, 14], [35.2, 20], [34.2, 26], [33.9, 32], [34.4, 37]] },
          { name: 'Station Road', w: 2.0, pts: [[11.8, 17.6], [18, 16.8], [25.8, 16.8], [31, 16.0], [36.0, 16.3], [41, 15.5], [45.4, 15.9], [53, 15.4]] },
          { name: 'East Lane', w: 1.8, pts: [[44.0, 5.2], [45.0, 11], [44.8, 17], [43.9, 23], [43.0, 29], [43.3, 37]] },
          { name: 'Low Road', w: 1.9, pts: [[16.4, 26.4], [20, 27.0], [24.2, 26.6], [29, 27.2], [34.0, 26.8], [39, 27.3], [44, 26.8], [53, 27.2]] },
          { name: 'The Crescent', w: 1.75, pts: [[6.0, 6.0], [4.2, 9.2], [4.6, 12.4], [7.4, 13.6], [9.4, 11.4], [9.8, 7.0]] },
          { name: 'Bakers Close', w: 1.7, pts: [[25.9, 20.5], [29, 20.8], [31.4, 21.6], [32.0, 23.0]] },
          { name: 'Hub Approach', w: 1.75, pts: [[39.6, 15.8], [39.6, 13.0], [40.4, 11.4]] },
        ],
        // Ponds and the green they sit in, bottom-left, the way the mock has it.
        water: [
          [[1.4, 17.8], [3.4, 16.5], [5.6, 17.5], [6.5, 19.4], [4.9, 20.1], [5.9, 21.9], [3.5, 22.7], [1.7, 21.3], [1.1, 19.5]],
          [[0.6, 27.5], [2.9, 25.3], [5.9, 25.7], [7.3, 27.1], [9.7, 28.3], [8.9, 30.7], [6.9, 31.5], [6.1, 33.7], [3.3, 34.5], [0.8, 33.0], [-0.6, 30.1]],
        ],
        park: [[-2, 13], [4, 12.4], [8.6, 13.2], [10.2, 16.5], [10.4, 20.5], [11.8, 24.5], [13.6, 28.5], [15.0, 32], [15.4, 36], [-2, 36]],
        footpaths: [{ w: 0.55, pts: [[9.8, 13.6], [7.6, 16.2], [8.2, 19.4], [6.6, 22.6], [8.4, 25.0], [10.6, 27.4], [11.8, 30.6], [13.4, 34]] }],
        benches: [[8.4, 15.4, 0.6], [7.9, 18.8, -0.3], [7.0, 22.0, 0.4], [9.4, 25.8, -0.5], [11.4, 29.4, 0.2]],
        carparks: [[39.0, 9.4, 3.6, 4.6]],
        // the hub van, parked up at the top of its own car park
        van: { x: 40.8, y: 10.4, h: 0 },
      },
      restaurants: [[8.0, 8.8], [10.2, 8.8], [28.0, 9.2], [30.5, 9.2], [41.2, 18.0], [38.6, 18.0], [27.6, 18.6], [22.2, 18.6]],
      density: { built: 0.74, treed: 0.84 },
    },
  };
  const MAP_KEY = 'dash-map-v1';
  const activeMapKey = localStorage.getItem(MAP_KEY) || 'village';
  const activeMap = MAPS[activeMapKey] || MAPS.village;
  const geo = activeMap.geo || null;

  // ---------- curves ----------
  // One spline routine, used by both the rasteriser and the painter. If they
  // disagreed about where a road ran you would drive into invisible kerbs, so
  // the tiles and the tarmac are generated from the very same samples.
  function smoothPath(pts, closed) {
    if (pts.length < 3) return pts.slice();
    const p = closed
      ? [pts[pts.length - 1], ...pts, pts[0], pts[1]]
      : [pts[0], ...pts, pts[pts.length - 1]];
    const out = [];
    for (let i = 1; i < p.length - 2; i++) {
      const a = p[i - 1], b = p[i], c = p[i + 1], d = p[i + 2];
      const seg = Math.max(3, Math.ceil(Math.hypot(c[0] - b[0], c[1] - b[1]) / 0.2));
      for (let s = 0; s < seg; s++) {
        const t = s / seg, t2 = t * t, t3 = t2 * t;
        out.push([
          0.5 * (2 * b[0] + (c[0] - a[0]) * t + (2 * a[0] - 5 * b[0] + 4 * c[0] - d[0]) * t2 + (-a[0] + 3 * b[0] - 3 * c[0] + d[0]) * t3),
          0.5 * (2 * b[1] + (c[1] - a[1]) * t + (2 * a[1] - 5 * b[1] + 4 * c[1] - d[1]) * t2 + (-a[1] + 3 * b[1] - 3 * c[1] + d[1]) * t3),
        ]);
      }
    }
    if (!closed) out.push(pts[pts.length - 1]);
    return out;
  }
  const pointInPoly = (px, py, poly) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };

  const roadTiles = new Set();
  // Tiles the painted tarmac actually reaches. A tile is "road" when its CENTRE
  // falls inside the carriageway, so a tile just outside that is pavement by
  // the rules and still half covered in tarmac by the paint. Anything that
  // stands up — a house, a shopfront — has to keep off these, or it is built in
  // the middle of the lane.
  const tarmacTiles = new Set();
  const waterTiles = new Set();
  const parkTiles = new Set();
  const carparkTiles = new Set();
  const islandTiles = new Set();
  const addRoad = (x, y) => { if (x >= 0 && y >= 0 && x < W && y < H) roadTiles.add(x + ',' + y); };
  const stampDisc = (set, cx, cy, r) => {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r) set.add(x + ',' + y);
      }
    }
  };
  const fillPoly = (set, poly) => {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (pointInPoly(x + 0.5, y + 0.5, poly)) set.add(x + ',' + y);
    }
  };

  if (geo) {
    geo.curves = geo.roads.map((r) => Object.assign({}, r, { line: smoothPath(r.pts) }));
    for (const r of geo.curves) for (const [cx, cy] of r.line) {
      stampDisc(roadTiles, cx, cy, r.w / 2);
      stampDisc(tarmacTiles, cx, cy, r.w / 2 + 0.5);
    }
    geo.waterRings = geo.water.map((p) => smoothPath(p, true));
    for (const ring of geo.waterRings) fillPoly(waterTiles, ring);
    geo.parkRing = smoothPath(geo.park, true);
    fillPoly(parkTiles, geo.parkRing);
    geo.pathLines = geo.footpaths.map((p) => Object.assign({}, p, { line: smoothPath(p.pts) }));
    for (const [px, py, pw, ph] of geo.carparks) {
      for (let y = Math.floor(py); y < py + ph; y++) for (let x = Math.floor(px); x < px + pw; x++) {
        if (x >= 0 && y >= 0 && x < W && y < H) carparkTiles.add(x + ',' + y);
      }
    }
    // A roundabout is tarmac all the way round with a planted island in the
    // middle; the island has to be solid or the traffic drives over the flowers.
    for (const [cx, cy] of activeMap.roundabouts) {
      stampDisc(roadTiles, cx + 0.5, cy + 0.5, 2.0);
      stampDisc(islandTiles, cx + 0.5, cy + 0.5, 0.6);
      // and keep the houses off it — the lane pinched to 0.81 tiles because
      // front gardens were being built right up against the circulating ring
      stampDisc(tarmacTiles, cx + 0.5, cy + 0.5, 3.0);
      for (const k of islandTiles) roadTiles.delete(k);
    }
    for (const k of waterTiles) roadTiles.delete(k);
  } else {
    if (activeMap.roads.vertical) for (const x of activeMap.roads.vertical) for (let y = 0; y < H; y++) { addRoad(x, y); addRoad(x + 1, y); }
    if (activeMap.roads.horizontal) for (const y of activeMap.roads.horizontal) for (let x = 0; x < W; x++) { addRoad(x, y); addRoad(x, y + 1); }
    if (activeMap.roads.segments) for (const [x1, y1, x2, y2] of activeMap.roads.segments) {
      const dx = Math.sign(x2 - x1), dy = Math.sign(y2 - y1);
      for (let x = x1, y = y1; x !== x2 + dx || y !== y2 + dy; x += dx, y += dy) addRoad(x, y);
    }
    for (const [cx, cy] of activeMap.roundabouts) for (let x = cx - 1; x <= cx + 1; x++) for (let y = cy - 1; y <= cy + 1; y++) {
      if (Math.abs(x - cx) + Math.abs(y - cy) >= 1) addRoad(x, y);
    }
  }
  for (const k of carparkTiles) { roadTiles.add(k); tarmacTiles.add(k); }
  // a bay's width of clearance round a car park, for the same reason
  for (const [px, py, pw, ph] of (geo ? geo.carparks : [])) {
    for (let y = Math.floor(py) - 1; y <= py + ph; y++) for (let x = Math.floor(px) - 1; x <= px + pw; x++) {
      if (x >= 0 && y >= 0 && x < W && y < H) tarmacTiles.add(x + ',' + y);
    }
  }
  const isRoad = (x, y) => roadTiles.has(x + ',' + y);
  // What the paint covers, as opposed to what the rules call a road. On the
  // grid map the two are the same thing, because its tarmac is drawn per tile.
  const onTarmac = (x, y) => (geo ? tarmacTiles.has(x + ',' + y) : isRoad(x, y));
  const isWater = (x, y) => waterTiles.has(x + ',' + y);
  const isPark = (x, y) => parkTiles.has(x + ',' + y);
  const isCarpark = (x, y) => carparkTiles.has(x + ',' + y);
  const isIsland = (x, y) => islandTiles.has(x + ',' + y);
  const isTrafficLight = (x, y) => activeMap.lights.some(([lx, ly]) => Math.abs(x - lx) <= 1 && Math.abs(y - ly) <= 1);
  const isRoundabout = (x, y) => activeMap.roundabouts.some(([rx, ry]) => Math.abs(x - rx) <= 2 && Math.abs(y - ry) <= 2);
  const START = activeMap.start;
  const DENSITY = activeMap.density;

  // (name, dish, shopfront). Pairs sit a stone's throw apart so stacking is a
  // real move; where they stand is the map's business, and the two shops with
  // their name lettered on the sheet itself always get the shop that says so.
  const RESTAURANTS = [
    { name: "Bella's Diner", roof: '#c9543f', icon: '\u{1F373}', art: 'shop-diner', signed: true },
    { name: 'Wok & Roll', roof: '#c96f2f', icon: '\u{1F961}', art: 'shop-awning' },
    { name: 'Pizza Slice', roof: '#c9ac3f', icon: '\u{1F355}', art: 'shop-market' },
    { name: 'Burger Barn', roof: '#8fc93f', icon: '\u{1F354}', art: 'shop-manor' },
    { name: 'Taco Tuesday', roof: '#3fc990', icon: '\u{1F32E}', art: 'shop-awning' },
    { name: 'Sushi Sakura', roof: '#3f8fc9', icon: '\u{1F363}', art: 'shop-market' },
    { name: 'Curry Corner', roof: '#8c3fc9', icon: '\u{1F35B}', art: 'shop-curry', signed: true },
    { name: 'Noodle Box', roof: '#c93f8f', icon: '\u{1F35C}', art: 'shop-manor' },
  ];
  const SURF = { '#': 1, 's': 0.6, '.': 0.4, 'P': 0.45 };  // road / pavement / grass / park

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
  const SIGN_FONT = '"Baloo 2", ui-sans-serif, system-ui, sans-serif';
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
  const art = {};
  for (const n of ART_NAMES) { const img = new Image(); img.src = ART_DIR + n + '.png'; art[n] = img; }
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

  // ---------- helpers ----------
  const $ = (s) => document.querySelector(s);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  };
  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  const money = (n) => (n < 0 ? '-\u00a3' : '\u00a3') + Math.abs(n).toFixed(2);
  const meters = (t) => Math.round(t * 10) + 'm';
  const fmt = (s) => Math.floor(s / 60) + ':' + ('0' + Math.floor(s % 60)).slice(-2);
  // deterministic value in [0,1) per x,y — the paddock trick, kept for the city texture
  // Math.imul, not `*`: the mixing step overflows 2^53 as a float multiply, the
  // low bits get rounded away and the result never once comes out above 0.5.
  // That is why the city used to be wall-to-wall buildings with no park or tree
  // anywhere — every threshold below was being read against a broken half.
  const hash2 = (x, y) => {
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
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

  // ---------- the city ----------
  const kindAt = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return '.';   // beyond the edge: grass
    if (isWater(x, y)) return 'W';    // pond — nothing stands in it, nothing drives in it
    if (isCarpark(x, y)) return '#';
    if (isRoad(x, y)) return '#';
    if (isIsland(x, y)) return 'I';   // the planted middle of a roundabout
    // Anything the paint reaches is paving, whatever the hash would have made
    // of it. Trees are solid too, so without this a roundabout grows an oak on
    // the circulating lane.
    if (onTarmac(x, y)) return 's';
    const nearRoad = (x > 0 && isRoad(x - 1, y)) || (x < W - 1 && isRoad(x + 1, y)) ||
      (y > 0 && isRoad(x, y - 1)) || (y < H - 1 && isRoad(x, y + 1));
    if (nearRoad) return 's';
    // The green is kept clear of housing on purpose — it is the one part of the
    // village you can see across, and the ponds and the path need the room.
    if (isPark(x, y)) return hash2(x + 13, y + 5) < 0.18 ? 'T' : 'P';
    // Retuned once hash2 was fixed: against the broken hash 0.52 swallowed every
    // interior tile, so these read as "most of a block built up, the rest garden".
    const h = hash2(x, y);
    if (h < DENSITY.built) return 'B';   // building footprint
    if (h < DENSITY.treed) return 'T';   // tree
    return '.';                          // garden / empty lot
  };

  // Restaurants are placed by the map as a rough spot on a street; snap each one
  // to the nearest free pavement tile so a hand-drawn position can never land a
  // shopfront in the middle of a carriageway or inside a pond.
  const takenShop = new Set();
  // A plot has to be pavement the paint does not cover, or the building stands
  // in the lane however carefully it is drawn.
  const buildable = (x, y) => kindAt(x, y) === 's' && !onTarmac(x, y);
  const snapToPavement = (wx, wy) => {
    let best = null, bestD = Infinity;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!buildable(x, y) || takenShop.has(x + ',' + y)) continue;
      const d = Math.hypot(x + 0.5 - wx, y + 0.5 - wy);
      if (d < bestD) { bestD = d; best = { x, y }; }
    }
    return best;
  };
  RESTAURANTS.forEach((r, i) => {
    const want = activeMap.restaurants[i];
    const spot = snapToPavement(want[0], want[1]) || { x: Math.round(want[0]), y: Math.round(want[1]) };
    r.x = spot.x; r.y = spot.y;
    // keep its immediate neighbours clear so two shops never share a doorway
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) takenShop.add((spot.x + dx) + ',' + (spot.y + dy));
  });

  // houses go along the pavements, so deliveries are always reachable by car
  const houses = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (buildable(x, y) && hash2(x + 41, y + 13) < 0.55 && !RESTAURANTS.some((r) => r.x === x && r.y === y)) {
      houses.push({ id: houses.length + 1, x, y, door: hash2(x + 3, y + 7) > 0.5 });
    }
  }
  // bump any restaurant so it cannot also be (and cannot touch) a house
  for (const r of RESTAURANTS) {
    for (const hm of houses) { if (dist(hm.x, hm.y, r.x, r.y) < 1.2) { hm.locked = true; } }
  }
  const HOUSES = houses.filter((hm) => !hm.locked);

  const REST = RESTAURANTS.map((r) => Object.assign({}, r, { offers: [] }));
  const restaurantAt = (x, y) => RESTAURANTS.some((r) => r.x === x && r.y === y);
  const houseAt = (x, y) => HOUSES.some((hm) => hm.x === x && hm.y === y);
  const solidOf = (x, y) => {
    const k = kindAt(x, y);
    return k === 'B' || k === 'T' || k === 'W' || k === 'I' || restaurantAt(x, y) || houseAt(x, y);
  };
  // precompute the collision grid once; buildings never move
  const SOLID = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (solidOf(x, y)) SOLID.push({ x, y });

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
  const HOUSE_ART = ['house-a', 'house-b', 'house-c', 'house-d', 'house-e', 'house-f', 'house-g', 'house-h', 'garage'];
  const TREE_ART = ['tree-a', 'tree-b', 'tree-c'];
  const BED_ART = ['flowerbed-a', 'flowerbed-b', 'flowerbed-c'];
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
  // street furniture on the open ground — beds along pavements, trees anywhere
  const props = new Map();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = kindAt(x, y);
    if (k === 'T') { props.set(key(x, y), { name: TREE_ART[Math.floor(hash2(x * 3, y * 5) * TREE_ART.length)], kind: 'tree' }); continue; }
    if (k !== '.') continue;
    const h = hash2(x + 61, y + 7);
    if (h < 0.22) props.set(key(x, y), { name: BED_ART[Math.floor(hash2(x + 5, y) * BED_ART.length)], kind: 'bed' });
    else if (h < 0.48) props.set(key(x, y), { name: TREE_ART[Math.floor(hash2(x, y * 7) * TREE_ART.length)], kind: 'tree' });
  }

  // ---------- game state ----------
  const car = { x: START.x, y: START.y, h: 0, v: 0 };
  const cam = { x: START.x, y: START.y };
  const input = { gas: false, brake: false, left: false, right: false, steerTime: 0, steerDir: 0 };
  let money_ = FLOAT;         // the float, paid in and out
  let earned = 0;             // fares + tips - fines, this shift
  let shiftLeft = SHIFT_S;
  let over = false, paused = false;
  let tracked = null;         // order id we are aiming at
  let oid = 1;                // order id counter
  let spawnT = 0, toastSeq = 0;
  const ST = { fare: 0, tip: 0, fine: 0, done: 0, bonus: 0, late: 0, expired: 0, streak: 0, bestStreak: 0, redLights: 0 };

  const bag = [];
  const toasts = [];
  const routeCache = { target: null, sx: -1, sy: -1, path: null };
  const roadNeighbours = (x, y) => [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]
    .filter(([nx, ny]) => isRoad(nx, ny));
  const roadList = [...roadTiles];
  // ---------- lanes ----------
  // Which side of the road to be on is a question about the ROAD, not about
  // which neighbouring tiles happen to be tarmac. The tile probe below works on
  // a tidy two-wide grid and falls apart on a curve: where a lane rasterises
  // three tiles wide, "is there road above me?" and "is there road below me?"
  // are both true, so the answer flips from tile to tile and the line sawtooths.
  // On a curve-drawn map, ask the curve instead.
  const laneSamples = [];
  const laneBuckets = new Map();
  if (geo) {
    for (const r of geo.curves) {
      for (let i = 0; i < r.line.length; i++) {
        const p = r.line[i];
        const a = r.line[Math.max(0, i - 1)], b = r.line[Math.min(r.line.length - 1, i + 1)];
        const tx = b[0] - a[0], ty = b[1] - a[1];
        const m = Math.hypot(tx, ty) || 1;
        const idx = laneSamples.push({ x: p[0], y: p[1], tx: tx / m, ty: ty / m, w: r.w }) - 1;
        const bk = Math.floor(p[0]) + ',' + Math.floor(p[1]);
        if (!laneBuckets.has(bk)) laneBuckets.set(bk, []);
        laneBuckets.get(bk).push(idx);
      }
    }
  }
  function nearestLane(px, py) {
    let best = null, bd = Infinity;
    const bx = Math.floor(px), by = Math.floor(py);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const list = laneBuckets.get((bx + dx) + ',' + (by + dy));
      if (!list) continue;
      for (const i of list) {
        const s = laneSamples[i];
        const d = (s.x - px) * (s.x - px) + (s.y - py) * (s.y - py);
        if (d < bd) { bd = d; best = s; }
      }
    }
    return best;
  }
  // On screen y runs downward, so the left of a heading (ux,uy) is (uy,-ux).
  const KEEP_LEFT = activeMap.trafficSide === 'left' ? 1 : -1;
  // A roundabout is not a lane curve, so on its ring the nearest lane is one of
  // the roads crossing its middle and traffic drove straight over the island.
  // On the ring, a lane point is on the circle instead, and `ringAt` gives the
  // way round it: clockwise when you keep left, anticlockwise when you keep right.
  const RING_TILE_R = 2.05, RING_LANE_R = 1.5;
  function ringAt(px, py) {
    for (const [cx, cy] of activeMap.roundabouts) {
      const rx = px - (cx + 0.5), ry = py - (cy + 0.5), r = Math.hypot(rx, ry);
      if (r <= RING_TILE_R && r > 0.01) return { mx: cx + 0.5, my: cy + 0.5, ux: rx / r, uy: ry / r, tx: -ry / r * KEEP_LEFT, ty: rx / r * KEEP_LEFT };
    }
    return null;
  }
  // (hx,hy), when given, is the way the car was already going. A tile step
  // sideways across a wide carriageway says nothing about which way along the
  // road the car is headed, and offsetting from the step itself put it on the
  // centre line, nose to nose with the oncoming lane — so a step that is mostly
  // across the road takes its direction from the road and the hint instead.
  function lanePoint(tileX, tileY, dx, dy, hx, hy) {
    if (!geo) return trafficLanePoint(tileX, tileY, tileX + dx, tileY + dy);
    const cx = tileX + 0.5, cy = tileY + 0.5;
    const ring = ringAt(cx, cy);
    if (ring) return { x: ring.mx + ring.ux * RING_LANE_R, y: ring.my + ring.uy * RING_LANE_R };
    const s = nearestLane(cx, cy);
    if (!s) return { x: cx, y: cy };
    const m = Math.hypot(dx, dy) || 1;
    let ux = dx / m, uy = dy / m;
    let along = ux * s.tx + uy * s.ty;
    if (Math.abs(along) < 0.35 && hx !== undefined) along = hx * s.tx + hy * s.ty;
    if (Math.abs(along) >= 0.35) { const k = along > 0 ? 1 : -1; ux = s.tx * k; uy = s.ty * k; }
    const off = Math.min(s.w * 0.25, 0.6);
    return { x: s.x + uy * off * KEEP_LEFT, y: s.y - ux * off * KEEP_LEFT };
  }
  // A curve map gives its start as a point on the road, since only the curve
  // knows where the middle is; move it into the near-side lane for a car
  // setting off north (h = 0), which is the west half when you keep left.
  if (geo) {
    const p = lanePoint(Math.floor(START.x), Math.floor(START.y), 0, -1);
    START.x = car.x = cam.x = p.x;
    START.y = car.y = cam.y = p.y;
  }

  // ---------- signalised junctions ----------
  // A junction is not one post in the middle: it is one signal per approach,
  // each with a stop line across the lane traffic arrives on, and the approaches
  // are grouped by the road they belong to so that one road runs at a time.
  const SIG = { green: 6.2, amber: 2.0, allRed: 1.3 };
  const SIG_SLOT = SIG.green + SIG.amber + SIG.allRed;
  const STOP_BACK = 2.4;   // how far back from the middle the line is painted

  function makeArm(px, py, ux, uy, w, group) {
    // The lane a car arrives on is the near side: left here, right in America.
    const lx = uy * KEEP_LEFT, ly = -ux * KEEP_LEFT;
    return {
      x: px + lx * w * 0.25, y: py + ly * w * 0.25,   // middle of the approach lane
      postX: px + lx * (w * 0.5 + 0.5), postY: py + ly * (w * 0.5 + 0.5),
      ux, uy, lx, ly, w, group, playerS: null, lastFine: 0,
    };
  }

  function buildJunctions() {
    const out = [];
    for (const [lx, ly] of activeMap.lights) {
      const cx = lx + 0.5, cy = ly + 0.5;
      const arms = [];
      const groupIds = [];
      if (geo) {
        geo.curves.forEach((r, gi) => {
          let bi = -1, bd = Infinity;
          for (let i = 0; i < r.line.length; i++) {
            const d = (r.line[i][0] - cx) ** 2 + (r.line[i][1] - cy) ** 2;
            if (d < bd) { bd = d; bi = i; }
          }
          if (Math.sqrt(bd) > 1.9) return;           // this road misses the junction
          for (const step of [-1, 1]) {
            let i = bi;
            while (i + step >= 0 && i + step < r.line.length
              && Math.hypot(r.line[i][0] - cx, r.line[i][1] - cy) < STOP_BACK) i += step;
            const p = r.line[i];
            const reach = Math.hypot(p[0] - cx, p[1] - cy);
            if (reach < STOP_BACK * 0.75) continue;  // the road ends before the stop line
            const m = reach || 1;
            arms.push(makeArm(p[0], p[1], (cx - p[0]) / m, (cy - p[1]) / m, r.w, gi));
            if (!groupIds.includes(gi)) groupIds.push(gi);
          }
        });
      } else {
        for (const [dx, dy] of DIRS) {
          if (!isRoad(lx + dx * 2, ly + dy * 2)) continue;
          const gi = dx !== 0 ? 0 : 1;
          arms.push(makeArm(cx + dx * STOP_BACK, cy + dy * STOP_BACK, -dx, -dy, 2, gi));
          if (!groupIds.includes(gi)) groupIds.push(gi);
        }
      }
      if (arms.length < 3 || groupIds.length < 2) continue;   // not worth signalling
      for (const a of arms) a.group = groupIds.indexOf(a.group);
      out.push({ x: cx, y: cy, arms, groups: groupIds.length, offset: out.length * 4.3 });
    }
    return out;
  }
  let junctions = [];
  const armState = (j, arm) => {
    const cyc = (performance.now() / 1000 + j.offset) % (j.groups * SIG_SLOT);
    if (arm.group !== Math.floor(cyc / SIG_SLOT)) return 'red';
    const w = cyc % SIG_SLOT;
    return w < SIG.green ? 'green' : w < SIG.green + SIG.amber ? 'amber' : 'red';
  };
  // Signed distance from a point to the stop line, positive while still short
  // of it, plus how far off the middle of the approach lane the point sits.
  const armGap = (arm, px, py) => (arm.x - px) * arm.ux + (arm.y - py) * arm.uy;
  const armOff = (arm, px, py) => Math.abs((px - arm.x) * arm.lx + (py - arm.y) * arm.ly);

  const trafficLanePoint = (x, y, nx, ny) => {
    const laneOffset = activeMap.trafficSide === 'left' ? -0.22 : 0.22;
    const dx = nx - x, dy = ny - y;
    if (dx !== 0) {
      const roadCenterY = isRoad(x, y - 1) ? y : isRoad(x, y + 1) ? y + 1 : y + 0.5;
      return { x: x + 0.5, y: roadCenterY + dx * laneOffset };
    }
    if (dy !== 0) {
      const roadCenterX = isRoad(x - 1, y) ? x : isRoad(x + 1, y) ? x + 1 : x + 0.5;
      return { x: roadCenterX - dy * laneOffset, y: y + 0.5 };
    }
    return { x: x + 0.5 - dy * laneOffset, y: y + 0.5 + dx * laneOffset };
  };
  const offGrid = (x, y) => x < 0 || y < 0 || x >= W || y >= H;
  const trafficNext = (t) => {
    const hereX = Math.floor(t.x), hereY = Math.floor(t.y);
    const previous = t.previous;
    const straight = t.dirX === undefined ? null : [hereX + t.dirX, hereY + t.dirY];
    // The lanes run on past the edge of the map, so a car that gets there keeps
    // going and leaves; updateTraffic brings it back in on some other road.
    if (straight && offGrid(straight[0], straight[1])) {
      t.exiting = true;
      return { x: t.x + t.dirX * 1.6, y: t.y + t.dirY * 1.6 };
    }
    const options = roadNeighbours(hereX, hereY);
    if (!options.length) return { x: hereX + 0.5, y: hereY + 0.5 };
    const forward = shuffle(options.filter(([x, y]) => !previous || x !== previous.x || y !== previous.y));
    const back = options.filter((o) => !forward.includes(o));
    const order = [...forward, ...back];
    if (straight) {
      const s = order.findIndex(([x, y]) => x === straight[0] && y === straight[1]);
      if (s > 0) order.unshift(order.splice(s, 1)[0]);
    }
    // On a curve map the next tile is snapped onto its lane, and a sideways
    // step across a wide carriageway — or a dead end at the map's rim — can
    // snap straight back to where the car already is. Taking that step means
    // arriving every frame and never moving, with no wait for the stuck timer
    // to count, so skip any step that goes nowhere.
    const ring = geo && ringAt(hereX + 0.5, hereY + 0.5);
    for (const next of order) {
      const dx = next[0] - hereX, dy = next[1] - hereY;
      // on the ring, only ever with the flow or out of it
      if (ring && dx * ring.tx + dy * ring.ty < -0.1 && dx * ring.ux + dy * ring.uy <= 0.5) continue;
      const p = lanePoint(next[0], next[1], dx, dy, Math.sin(t.heading), -Math.cos(t.heading));
      if (Math.hypot(p.x - t.x, p.y - t.y) < 0.3) continue;
      t.dirX = dx; t.dirY = dy;
      t.previous = { x: hereX, y: hereY };
      return p;
    }
    return { x: t.x, y: t.y };
  };
  const traffic = [];
  const maxTraffic = Math.round(30 + activeMap.traffic * 20);
  const trafficCollisions = [];
  const trafficContacts = new Set();
  const resetTrafficCar = (t) => {
    for (let attempt = 0; attempt < 60; attempt++) {
      const [x, y] = pick(roadList).split(',').map(Number);
      if (dist(x + 0.5, y + 0.5, car.x, car.y) < 3) continue;
      if (traffic.some((other) => other !== t && dist(x + 0.5, y + 0.5, other.x, other.y) < 1)) continue;
      t.x = x + 0.5; t.y = y + 0.5;
      t.previous = null; t.dirX = undefined; t.dirY = undefined; t.curve = null; t.wait = 0; t.exiting = false;
      t.target = trafficNext(t);
      const laneStart = lanePoint(x, y, t.dirX, t.dirY);
      t.x = laneStart.x; t.y = laneStart.y;
      return;
    }
  };
  // Where a road runs off the map, with the way back in: every rim tile whose
  // inward neighbour is road too. A car that drove off one comes back through
  // another, well away from the player so nobody sees it appear.
  const edgeEntries = roadList.map((k) => k.split(',').map(Number)).map(([x, y]) => {
    const dx = x === 0 ? 1 : x === W - 1 ? -1 : 0, dy = y === 0 ? 1 : y === H - 1 ? -1 : 0;
    return (dx === 0) === (dy === 0) || !isRoad(x + dx, y + dy) ? null : { x, y, dx, dy };
  }).filter(Boolean);
  const enterFromEdge = (t) => {
    t.exiting = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      const e = pick(edgeEntries);
      if (!e) break;
      const p = lanePoint(e.x, e.y, e.dx, e.dy);
      if (dist(p.x, p.y, car.x, car.y) < 12) continue;
      if (traffic.some((other) => other !== t && dist(p.x, p.y, other.x, other.y) < 2)) continue;
      t.x = p.x - e.dx * 1.4; t.y = p.y - e.dy * 1.4;
      t.dirX = e.dx; t.dirY = e.dy;
      t.previous = { x: e.x - e.dx, y: e.y - e.dy };
      t.curve = null; t.wait = 0;
      t.target = p;
      return;
    }
    resetTrafficCar(t);
  };
  for (const tile of roadTiles) {
    if (traffic.length >= maxTraffic) break;
    const [x, y] = tile.split(',').map(Number);
    if (hash2(x + 73, y + 19) < activeMap.traffic * 0.09) {
      if (dist(x + 0.5, y + 0.5, START.x, START.y) < 1.2) continue;
      const trafficCar = { id: traffic.length, x: 0, y: 0, previous: null, target: null, heading: 0, dirX: undefined, dirY: undefined, speed: rnd(0.8, 1.4), bumpAt: 0, wait: 0 };
      traffic.push(trafficCar);
      resetTrafficCar(trafficCar);
    }
  }

  // ---------- orders ----------
  function makeOffer(r) {
    const hm = pick(HOUSES);
    const d = dist(r.x + 0.5, r.y + 0.5, hm.x + 0.5, hm.y + 0.5);
    const shake = 0.9 + hash2(hm.id, oid) * 0.25;
    const base = 3.5 + d * 1.2 * shake;
    const limit = 2.0 + d * 1.3;
    return { id: oid++, r, hm, d, base, limit, fine: base * 0.35, bonusUntil: limit * 0.6, tip: 0.45 * base, expiry: Date.now() + rnd(45, 85) * 1000 };
  }
  // spread the first board so you are not waiting on an empty street
  function seedOffers() {
    const startRestaurant = REST.reduce((best, r) => {
      if (!best) return r;
      return dist(START.x, START.y, r.x + 0.5, r.y + 0.5) < dist(START.x, START.y, best.x + 0.5, best.y + 0.5) ? r : best;
    }, null);
    startRestaurant.offers.push(makeOffer(startRestaurant));
    for (let i = 0; i < 6; i++) {
      const r = pick(REST);
      if (r.offers.length >= 4) continue;
      r.offers.push(makeOffer(r));
    }
  }
  function acceptOffer(o) {
    const r = o.r;
    const i = r.offers.indexOf(o);
    if (i >= 0) r.offers.splice(i, 1);
    o.pickedUp = dist(car.x, car.y, r.x + 0.5, r.y + 0.5) < DELIVER_R;
    o.acceptedAt = o.pickedUp ? Date.now() : null;
    bag.push(o);
    if (!tracked || !bag.some((b) => b.id === tracked)) tracked = o.id;
    toast(o.pickedUp ? 'Accepted \u00b7 ' + money(o.base) + ' to House #' + o.hm.id : 'Accepted \u00b7 drive to ' + r.name + ' for pickup', 'good');
    ST.streak = 0;
  }
  function settle(b) {
    const t = (Date.now() - b.acceptedAt) / 1000;
    const onTime = t <= b.limit;
    const quick = t <= b.bonusUntil;
    bag.splice(bag.indexOf(b), 1);
    if (tracked === b.id) {
      tracked = bag.length ? bag.reduce((a, c) => (orderLeft(c) < orderLeft(a) ? c : a), bag[0]).id : null;
    }
    let diff = 0;
    if (quick) {
      diff = b.base + b.tip; ST.fare += b.base; ST.tip += b.tip; ST.done++; ST.bonus++; ST.streak++;
      ST.bestStreak = Math.max(ST.bestStreak, ST.streak);
      toast('Fast \u00b7 +' + money(diff) + ' (incl. ' + money(b.tip) + ' tip)', 'gold');
    } else if (onTime) {
      diff = b.base; ST.fare += b.base; ST.done++; ST.streak++;
      ST.bestStreak = Math.max(ST.bestStreak, ST.streak);
      toast('Delivered \u00b7 +' + money(diff), 'good');
    } else {
      diff = -b.fine; ST.fine += b.fine; ST.done++; ST.late++; ST.streak = 0;
      toast('Late \u00b7 \u2013' + money(b.fine) + ' fine', 'bad');
    }
    money_ += diff;
    earned += diff;
  }
  const orderLeft = (b) => b.pickedUp ? b.limit - (Date.now() - b.acceptedAt) / 1000 : b.limit;

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
  window.addEventListener('keydown', (e) => setKey(e, true));
  window.addEventListener('keyup', (e) => setKey(e, false));
  // on-screen pad for fingers
  for (const b of document.querySelectorAll('#touch button')) {
    const k = b.dataset.k;
    const on = (e) => { e.preventDefault(); input[k] = true; };
    const off = (e) => { e.preventDefault(); input[k] = false; };
    b.addEventListener('pointerdown', on);
    b.addEventListener('pointerup', off);
    b.addEventListener('pointerleave', off);
  }

  // ---------- driving ----------
  function collide() {
    let done = false;
    for (let guard = 0; guard < 3 && !done; guard++) {
      done = true;
      for (const s of SOLID) {
        const cx = clamp(car.x, s.x, s.x + 1), cy = clamp(car.y, s.y, s.y + 1);
        const dx = car.x - cx, dy = car.y - cy, d2 = dx * dx + dy * dy;
        if (d2 >= CAR_R * CAR_R) continue;
        done = false;
        if (d2 < 1e-9) { car.y -= (s.x + 0.5 - car.x) * 0.01; car.x += (s.y + 0.5 - car.y) * 0.01; continue; }
        const d = Math.sqrt(d2);
        car.x += (dx / d) * (CAR_R - d);
        car.y += (dy / d) * (CAR_R - d);
      }
    }
    car.x = clamp(car.x, 0.5, W - 0.5);
    car.y = clamp(car.y, 0.5, H - 0.5);
  }
  function drive(dt) {
    const k = kindAt(Math.floor(car.x), Math.floor(car.y));
    const sf = SURF[k] !== undefined ? SURF[k] : 0.4;
    const trafficAhead = traffic.reduce((closest, t) => {
      const dx = car.x - t.x, dy = car.y - t.y;
      const distance = Math.hypot(dx, dy);
      const headingX = Math.sin(t.heading), headingY = -Math.cos(t.heading);
      const ahead = dx * headingX + dy * headingY;
      const across = Math.abs(dx * headingY - dy * headingX);
      return ahead > -0.35 && ahead < 1.3 && across < 0.48 ? Math.min(closest, distance) : closest;
    }, Infinity);
    const trafficSlow = trafficAhead < Infinity ? clamp((trafficAhead - 0.35) / 0.95, 0.18, 1) : 1;
    const maxSp = 2.7 * sf * trafficSlow, acc = 2.15;
    if (input.gas && !input.brake) {
      car.v = Math.min(maxSp, car.v + (acc + (maxSp < car.v ? -6 : 0)) * dt);
    } else if (input.brake && !input.gas) {
      if (car.v > 0) car.v = Math.max(0, car.v - 7 * dt);
      else car.v = Math.max(-0.9, car.v - 2.1 * dt);
    } else {
      car.v *= Math.exp(-3.4 * dt);
      if (Math.abs(car.v) < 0.01) car.v = 0;
    }
    const tw = Math.abs(car.v) / 1.4;
    const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (!steer || steer !== input.steerDir) input.steerTime = 0;
    if (steer) input.steerTime = Math.min(1.2, input.steerTime + dt);
    input.steerDir = steer;
    const heldRamp = 1 + 0.75 * clamp(input.steerTime / 0.8, 0, 1);
    car.h += steer * (1.0 + 0.6 * clamp(tw, 0, 1)) * heldRamp * dt;
    car.x += Math.sin(car.h) * car.v * dt;
    car.y -= Math.cos(car.h) * car.v * dt;
    collide();
    for (const t of traffic) {
      const d = dist(car.x, car.y, t.x, t.y);
      if (d >= CAR_R + 0.2) continue;
      const wasMoving = Math.abs(car.v) >= 0.25;
      car.v *= 0.25;
      if (!wasMoving) continue;
      if (performance.now() < t.bumpAt) continue;
      t.bumpAt = performance.now() + 1800;
      const fine = 2.5;
      money_ -= fine;
      earned -= fine;
      ST.fine += fine;
      ST.streak = 0;
      toast('Traffic bump \u00b7 \u2212' + money(fine) + ' fine', 'bad');
    }
  }
  const trafficTooClose = (t, x, y) => traffic.some((other) => {
    if (other === t) return false;
    const angleGap = Math.abs(Math.atan2(Math.sin(t.heading - other.heading), Math.cos(t.heading - other.heading)));
    const clearance = angleGap > 0.6 && angleGap < 2.55 ? 0.72 : 0.42;
    return dist(x, y, other.x, other.y) < clearance;
  });
  // Is there a red or amber stop line just ahead of something travelling
  // (ux,uy)? Amber counts: a signal that only stops you once it is already red
  // would have cars still crossing when the other road pulls away.
  function heldAtSignal(px, py, ux, uy) {
    for (const j of junctions) {
      for (const arm of j.arms) {
        if (arm.ux * ux + arm.uy * uy < 0.65) continue;     // not on this approach
        const gap = armGap(arm, px, py);
        if (gap < 0.02 || gap > 1.15) continue;             // past it, or not near it yet
        if (armOff(arm, px, py) > arm.w * 0.6) continue;    // on some other lane
        if (armState(j, arm) !== 'green') return true;
      }
    }
    return false;
  }

  // The player is not held, only fined. Watch each stop line for the frame the
  // car crosses it and charge for the ones that were red — amber is a warning,
  // not a ticket, or every yellow-light judgement call costs money.
  function policeSignals() {
    const now = performance.now();
    const ux = Math.sin(car.h), uy = -Math.cos(car.h);
    for (const j of junctions) {
      for (const arm of j.arms) {
        const aligned = arm.ux * ux + arm.uy * uy > 0.55 && Math.abs(car.v) > 0.35;
        const near = armOff(arm, car.x, car.y) <= arm.w * 0.75;
        const gap = armGap(arm, car.x, car.y);
        const was = arm.playerS;
        arm.playerS = aligned && near && gap > -1.6 && gap < 2.6 ? gap : null;
        if (was === null || arm.playerS === null) continue;
        if (!(was > 0 && arm.playerS <= 0)) continue;        // has not just crossed
        if (armState(j, arm) !== 'red') continue;
        if (now - arm.lastFine < 2500) continue;
        arm.lastFine = now;
        const fine = 8;
        money_ -= fine; earned -= fine; ST.fine += fine; ST.redLights++; ST.streak = 0;
        toast('Ran a red light · −' + money(fine) + ' fine', 'bad');
      }
    }
  }

  function updateTraffic(dt) {
    for (const t of traffic) {
      if (t.curve) continue;
      const dx = t.target.x - t.x, dy = t.target.y - t.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.08) {
        t.x = t.target.x; t.y = t.target.y;
        if (t.exiting) { enterFromEdge(t); continue; }
        const oldDirX = t.dirX, oldDirY = t.dirY;
        t.target = trafficNext(t);
        // nowhere to go from here: let the stuck timer see it, not sit forever
        if (Math.hypot(t.target.x - t.x, t.target.y - t.y) < 0.08) {
          t.wait += dt;
          if (t.wait > 2) resetTrafficCar(t);
          continue;
        }
        if (t.dirX !== oldDirX || t.dirY !== oldDirY) {
          t.curve = {
            p0: { x: t.x, y: t.y },
            p1: { x: t.x + oldDirX * 0.32, y: t.y + oldDirY * 0.32 },
            p2: { x: t.target.x - t.dirX * 0.32, y: t.target.y - t.dirY * 0.32 },
            p3: { x: t.target.x, y: t.target.y },
            u: 0,
          };
        }
      }
    }
    for (const t of traffic) {
      t.lastX = t.x;
      t.lastY = t.y;
      t.lastCurveU = t.curve ? t.curve.u : null;
      let dx, dy, d;
      if (t.curve) {
        const c = t.curve, u = c.u, v = 1 - u;
        dx = 3 * v * v * (c.p1.x - c.p0.x) + 6 * v * u * (c.p2.x - c.p1.x) + 3 * u * u * (c.p3.x - c.p2.x);
        dy = 3 * v * v * (c.p1.y - c.p0.y) + 6 * v * u * (c.p2.y - c.p1.y) + 3 * u * u * (c.p3.y - c.p2.y);
      } else {
        dx = t.target.x - t.x;
        dy = t.target.y - t.y;
      }
      d = Math.hypot(dx, dy);
      if (d < 0.001) continue;
      t.heading = Math.atan2(dx, -dy);
      // Held at a red. Deliberately before the "blocked" handling below, and it
      // clears t.wait rather than adding to it: a queue at a signal is supposed
      // to sit there, and the stuck-car timer would teleport it away.
      if (heldAtSignal(t.x, t.y, dx / d, dy / d)) { t.wait = 0; continue; }
      const playerDx = car.x - t.x, playerDy = car.y - t.y;
      const playerAhead = playerDx * Math.sin(t.heading) - playerDy * Math.cos(t.heading);
      const playerAcross = Math.abs(playerDx * Math.cos(t.heading) + playerDy * Math.sin(t.heading));
      const blockedByPlayer = playerAhead > -0.35 && playerAhead < 0.95 && playerAcross < 0.42;
      let blocked = blockedByPlayer;
      for (const other of traffic) {
        if (other === t) continue;
        const otherDx = other.x - t.x, otherDy = other.y - t.y;
        const otherDistance = Math.hypot(otherDx, otherDy);
        const otherAhead = otherDx * Math.sin(t.heading) - otherDy * Math.cos(t.heading);
        const otherAcross = Math.abs(otherDx * Math.cos(t.heading) + otherDy * Math.sin(t.heading));
        if ((otherDistance < 0.55 && other.id < t.id) || (otherAhead > 0 && otherAhead < 0.78 && otherAcross < 0.45)) {
          blocked = true;
          break;
        }
      }
      if (blocked) {
        const hasCarAhead = traffic.some((other) => {
          if (other === t) return false;
          const otherDx = other.x - t.x, otherDy = other.y - t.y;
          const otherAhead = otherDx * Math.sin(t.heading) - otherDy * Math.cos(t.heading);
          const otherAcross = Math.abs(otherDx * Math.cos(t.heading) + otherDy * Math.sin(t.heading));
          return otherAhead > 0 && otherAhead < 0.9 && otherAcross < 0.38;
        });
        if (blockedByPlayer && !hasCarAhead) {
          t.wait = 0;
          continue;
        }
        t.wait += dt;
        if (t.wait > 4) resetTrafficCar(t);
        continue;
      }
      t.wait = 0;
      if (t.curve) {
        const nextU = Math.min(1, t.curve.u + t.speed * dt / 0.95);
        const c = t.curve, u = nextU, v = 1 - u;
        const nextX = v * v * v * c.p0.x + 3 * v * v * u * c.p1.x + 3 * v * u * u * c.p2.x + u * u * u * c.p3.x;
        const nextY = v * v * v * c.p0.y + 3 * v * v * u * c.p1.y + 3 * v * u * u * c.p2.y + u * u * u * c.p3.y;
        if (trafficTooClose(t, nextX, nextY)) {
          t.wait += dt;
          if (t.wait > 4) resetTrafficCar(t);
          continue;
        }
        t.curve.u = nextU;
        t.x = nextX;
        t.y = nextY;
        if (nextU >= 1) t.curve = null;
      } else {
        const step = Math.min(d, t.speed * dt);
        const nextX = t.x + dx / d * step, nextY = t.y + dy / d * step;
        if (trafficTooClose(t, nextX, nextY)) {
          t.wait += dt;
          if (t.wait > 4) resetTrafficCar(t);
          continue;
        }
        t.x = nextX;
        t.y = nextY;
      }
    }
    const currentContacts = new Set();
    const now = performance.now();
    for (let i = 0; i < traffic.length; i++) for (let j = i + 1; j < traffic.length; j++) {
      const first = traffic[i], second = traffic[j];
      const distance = dist(first.x, first.y, second.x, second.y);
      const angleGap = Math.abs(Math.atan2(Math.sin(first.heading - second.heading), Math.cos(first.heading - second.heading)));
      const crossing = angleGap > 0.6 && angleGap < 2.55;
      const clearance = crossing ? 0.72 : 0.42;
      if (distance >= clearance) continue;
      const key = first.id + ':' + second.id;
      if (distance < 0.42) {
        currentContacts.add(key);
        if (!trafficContacts.has(key)) {
          const event = {
            time: new Date().toISOString(),
            pair: [first.id, second.id],
            position: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
            distance,
            cars: [
              { id: first.id, x: first.x, y: first.y, angleRadians: first.heading, angleDegrees: first.heading * 180 / Math.PI, wait: first.wait },
              { id: second.id, x: second.x, y: second.y, angleRadians: second.heading, angleDegrees: second.heading * 180 / Math.PI, wait: second.wait },
            ],
          };
          trafficCollisions.push(event);
          if (trafficCollisions.length > 100) trafficCollisions.shift();
          console.warn('[Wizz Delivery] traffic collision', event);
        }
      }
      const retreat = first.id > second.id ? first : second;
      const safeX = retreat.lastX, safeY = retreat.lastY;
      resetTrafficCar(retreat);
      if (retreat.x === safeX && retreat.y === safeY) {
        const other = retreat === first ? second : first;
        const awayX = retreat.x - other.x, awayY = retreat.y - other.y;
        const awayDistance = Math.hypot(awayX, awayY) || 1;
        retreat.x = other.x + awayX / awayDistance * 0.75;
        retreat.y = other.y + awayY / awayDistance * 0.75;
        retreat.curve = null;
      }
    }
    trafficContacts.clear();
    for (const key of currentContacts) trafficContacts.add(key);
  }
  function nearestRestaurant() {
    let best = null, bd = NEAR_R;
    for (const r of REST) {
      const d = dist(car.x, car.y, r.x + 0.5, r.y + 0.5);
      if (d < bd) { bd = d; best = r; }
    }
    return best;
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

  window.__dash = {
    car, bag, traffic, trafficCollisions, restaurants: REST, nearestRestaurant,
    houses: HOUSES, lots, props, art, artNames: ART_NAMES, overview,
    map: activeMapKey, geo, roadTiles, waterTiles, parkTiles, tarmacTiles, kindAt, START,
    roundabouts: activeMap.roundabouts, lights: activeMap.lights,
    searchRoute, lanePoint, nearestLane,
    junctions: () => junctions, armState, armGap, armOff, SIG, stats: ST,
    canTurnRound: (x, y) => canTurnRound(x, y),
    dirs: () => DIRS,

    artLoaded: () => ART_NAMES.filter((n) => art[n].complete && art[n].naturalWidth > 0),
    artMissing: () => ART_NAMES.filter((n) => !(art[n].complete && art[n].naturalWidth > 0)),
  };
  function destinationOf(b) {
    return b.pickedUp ? { x: b.hm.x + 0.5, y: b.hm.y + 0.5 } : { x: b.r.x + 0.5, y: b.r.y + 0.5 };
  }
  function closestAccepted() {
    return bag.reduce((best, b) => {
      if (!best) return b;
      const d = destinationOf(b), bd = destinationOf(best);
      return dist(car.x, car.y, d.x, d.y) < dist(car.x, car.y, bd.x, bd.y) ? b : best;
    }, null);
  }
  // A route is driven, not walked. Searching over tiles alone lets the line
  // hop the carriageway wherever it likes, which is both wrong and what made it
  // look like it was weaving: every lane of a three-wide road costs the same, so
  // the search wandered between them. Search over (tile, heading) instead, and
  // forbid the reversal unless you are somewhere you could actually turn round —
  // a junction, a roundabout, a dead end, or off the carriageway altogether.
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const canTurnRound = (x, y) => {
    if (kindAt(x, y) !== '#') return true;                  // a driveway or forecourt
    if (isRoundabout(x, y)) return true;
    const arms = DIRS.filter(([dx, dy]) => isRoad(x + dx, y + dy)).length;
    return arms !== 2;                                      // a junction, or a dead end
  };
  function searchRoute(sx, sy, sdir, tx, ty) {
    const key = (x, y, d) => (y * W + x) * 4 + d;
    const open = (x, y) => x >= 0 && y >= 0 && x < W && y < H &&
      (kindAt(x, y) === '#' || kindAt(x, y) === 's' || (x === tx && y === ty));
    const start = { x: sx, y: sy, d: sdir, cost: 0 };
    const queue = [start];
    const came = new Map([[key(sx, sy, sdir), null]]);
    const costs = new Map([[key(sx, sy, sdir), 0]]);
    let end = null;
    while (queue.length) {
      queue.sort((a, b) => a.cost - b.cost);
      const p = queue.shift();
      if (p.cost !== costs.get(key(p.x, p.y, p.d))) continue;
      if (p.x === tx && p.y === ty) { end = p; break; }
      for (let d = 0; d < 4; d++) {
        const [dx, dy] = DIRS[d];
        const x = p.x + dx, y = p.y + dy;
        if (!open(x, y)) continue;
        // 0<->1 and 2<->3 are the reversals; the rest are turns
        const reversing = (d ^ 1) === p.d;
        if (reversing && !canTurnRound(p.x, p.y)) continue;
        const step = (kindAt(x, y) === '#' ? 1 : 8)
          + (d === p.d ? 0 : reversing ? 6 : 0.7);   // prefer straight, U-turns last
        const k = key(x, y, d);
        const cost = p.cost + step;
        if (!costs.has(k) || cost < costs.get(k)) {
          costs.set(k, cost);
          came.set(k, p);
          queue.push({ x, y, d, cost });
        }
      }
    }
    if (!end) return null;
    const path = [];
    for (let p = end; p; p = came.get(key(p.x, p.y, p.d))) path.push({ x: p.x, y: p.y, d: p.d });
    return path.reverse();
  }
  // which way the car is pointing now, to the nearest quarter turn
  function carDir() {
    const dx = Math.round(Math.sin(car.h)), dy = -Math.round(Math.cos(car.h));
    const i = DIRS.findIndex((d) => d[0] === dx && d[1] === dy);
    return i < 0 ? 3 : i;
  }
  function routePath(target) {
    const sx = clamp(Math.floor(car.x), 0, W - 1), sy = clamp(Math.floor(car.y), 0, H - 1);
    const destination = destinationOf(target);
    const tx = Math.floor(destination.x), ty = Math.floor(destination.y);
    const sdir = carDir();
    if (routeCache.target === target && routeCache.sx === sx && routeCache.sy === sy
      && routeCache.dir === sdir) return routeCache.path;
    const path = searchRoute(sx, sy, sdir, tx, ty);
    routeCache.target = target; routeCache.sx = sx; routeCache.sy = sy;
    routeCache.dir = sdir; routeCache.path = path;
    return path;
  }
  function update(dt) {
    if (shiftLeft <= 0 && !over) { endShift('Shift over'); return; }
    shiftLeft -= dt;
    spawnT -= dt;
    if (spawnT <= 0) {
      spawnT = 8;
      let r = REST[Math.floor(Math.random() * REST.length)];
      // lean towards where the player is parked so the board is rarely bare
      const near = nearestRestaurant();
      if (near && Math.random() < 0.45) r = near;
      if (r.offers.length < 4) r.offers.push(makeOffer(r));
    }
    for (const r of REST) {
      for (let i = r.offers.length - 1; i >= 0; i--) {
        const o = r.offers[i];
        if (Date.now() > o.expiry) { r.offers.splice(i, 1); ST.expired++; }
      }
    }
    // anything at your feet settles by itself
    for (let i = bag.length - 1; i >= 0; i--) {
      const b = bag[i];
      if (!b.pickedUp && dist(car.x, car.y, b.r.x + 0.5, b.r.y + 0.5) < DELIVER_R) {
        b.pickedUp = true;
        b.acceptedAt = Date.now();
        toast('Picked up · now deliver to House #' + b.hm.id, 'good');
      } else if (b.pickedUp && dist(car.x, car.y, b.hm.x + 0.5, b.hm.y + 0.5) < DELIVER_R) settle(b);
    }
    cam.x = lerp(cam.x, car.x, 1 - Math.exp(-6 * dt));
    cam.y = lerp(cam.y, car.y, 1 - Math.exp(-6 * dt));
  }

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
    // Chaikin, twice: corner-cutting turns the remaining tile-to-tile steps into
    // something that reads as a driven line rather than a staircase.
    let line = pts;
    for (let pass = 0; pass < 2 && line.length > 2; pass++) {
      const out = [line[0]];
      for (let i = 0; i < line.length - 1; i++) {
        const a = line[i], b = line[i + 1];
        out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
        out.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
      }
      out.push(line[line.length - 1]);
      line = out;
    }
    ctx.beginPath();
    ctx.moveTo(line[0][0], line[0][1]);
    for (let i = 1; i < line.length; i++) ctx.lineTo(line[i][0], line[i][1]);
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
    strokeRoads(PAVE_BAND, PAL.pave[0]); ringDiscs(2.68, PAL.pave[0]);
    strokeRoads(0.26, PAL.kerb); ringDiscs(2.30, PAL.kerb);
    strokeRoads(0.10, PAL.kerbLip); ringDiscs(2.25, PAL.kerbLip);
    strokeRoads(0, PAL.asphalt[1]); ringDiscs(2.20, PAL.asphalt[1]);

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
      disc(0.78, PAL.kerb);
      disc(0.66, PAL.parkFill);
      disc(0.38, PAL.hedge);
    }
    ctx.restore();
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
  // trees and flowerbeds on the open ground
  function drawProp(x, y) {
    const p = props.get(key(x, y));
    if (!p) return;
    const n = hash2(x * 3, y * 5);
    const jx = (n - 0.5) * 0.16, jy = (hash2(y, x) - 0.5) * 0.16;
    if (p.kind === 'bed') {
      ctx.fillStyle = 'rgba(38,32,22,0.16)';
      ctx.beginPath(); ctx.ellipse(x + 0.52 + jx, y + 0.72 + jy, 0.34, 0.1, 0, 0, Math.PI * 2); ctx.fill();
      if (blit(p.name, x + jx, y + 0.24 + jy, 0.86, 0.42)) return;
      ctx.fillStyle = '#8a6a44'; ctx.fillRect(x + 0.1 + jx, y + 0.5 + jy, 0.8, 0.2);
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
    // the bag: folded top, body, handle
    ctx.fillStyle = '#c2884b';
    ctx.beginPath(); ctx.roundRect(cx - 0.15, cy - 0.12, 0.3, 0.3, 0.035); ctx.fill();
    ctx.fillStyle = '#d79f60';
    ctx.beginPath(); ctx.roundRect(cx - 0.15, cy - 0.19, 0.3, 0.1, 0.03); ctx.fill();
    ctx.strokeStyle = '#a06f3a'; ctx.lineWidth = 0.028;
    ctx.beginPath(); ctx.arc(cx, cy - 0.19, 0.075, Math.PI, 0); ctx.stroke();
    ctx.fillStyle = 'rgba(120,80,40,0.35)';
    ctx.fillRect(cx - 0.15, cy - 0.09, 0.3, 0.018);
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
    const isT = tracked === b.id;
    const bob = Math.sin(performance.now() / 260 + b.id) * 0.045;
    const d = dist(car.x, car.y, cx, destination.y);
    const R = isT ? 0.26 : 0.21;
    const top = cy - 0.66 + bob;
    const body = isT ? '#e3922f' : b.pickedUp ? '#4b8f5f' : 'rgba(150,120,86,0.85)';

    ctx.fillStyle = 'rgba(38,30,20,0.22)';
    ctx.beginPath(); ctx.ellipse(cx + 0.03, cy + 0.02, R * 0.7, R * 0.3, 0, 0, Math.PI * 2); ctx.fill();
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
      const active = tracked === b.id;
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
    $('#sum-cash').textContent = money(money_);
    $('#sum-earned').textContent = money(earned);
    $('#sum-time').textContent = fmt(Math.max(0, shiftLeft));
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
          '<div class="acts"><span class="dist">order ' + fmt(Math.max(0, (o.expiry - Date.now()) / 1000)) + '</span><span class="spacer"></span><button class="act primary" data-accept="' + o.id + '">Accept</button></div>';
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
      row.className = 'order' + (tracked === b.id ? ' is-tracked' : '');
      const destination = destinationOf(b);
      const d = dist(car.x, car.y, destination.x, destination.y);
      const label = b.pickedUp ? 'House #' + b.hm.id : 'Pick up at ' + b.r.name;
      const status = b.pickedUp ? (sec < 0 ? 'LATE' : fmt(sec)) : 'PICKUP';
      row.innerHTML = '<div><div class="who">' + label + '</div>' +
        '<div class="dist">' + meters(d) + ' away</div></div>' +
        '<div class="timer' + (b.pickedUp ? (sec < 0 ? ' bad' : sec < 10 ? ' warn' : ' good') : ' warn') + '">' + status + '</div>' +
        '<div class="acts"><span class="dist">' + (b.pickedUp ? 'pays ' + money(b.base) + (sec > 0 && sec < 12 ? ' \u00b7 hurry, tip is on the line' : '') : 'drive to restaurant to start the timer') + '</span>' +
        '<span class="spacer"></span><button class="act" data-track="' + b.id + '">' + (tracked === b.id ? 'Following' : 'Follow') + '</button></div>';
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
      tracked = +trk.dataset.track;
      return;
    }
  });

  // ---------- shift lifecycle ----------
  function endShift(reason) {
    over = true;
    save.best = Math.max(save.best, earned);
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
      '<tr><td>Earned this shift</td><td class="t" style="font-weight:700;color:' + (earned < 0 ? 'var(--bad)' : 'var(--green)') + '">' + money(earned) + '</td></tr>' +
      (ST.bestStreak > 1 ? '<tr><td>Longest bonus streak</td><td class="t">' + ST.bestStreak + '</td></tr>' : '') +
      ('<tr><td>Best shift ever</td><td class="t">' + money(save.best) + '</td></tr>');
    $('#summary').hidden = false;
  }
  function startShift() {
    money_ = FLOAT; earned = 0; shiftLeft = SHIFT_S; over = false; tracked = null;
    Object.assign(ST, { fare: 0, tip: 0, fine: 0, done: 0, bonus: 0, late: 0, expired: 0, streak: 0, bestStreak: 0, redLights: 0 });
    bag.length = 0;
    for (const r of REST) r.offers.length = 0;
    car.x = START.x; car.y = START.y; car.h = 0; car.v = 0;
    cam.x = START.x; cam.y = START.y;
    seedOffers();
    $('#summary').hidden = true;
    $('#toasts').innerHTML = '';
  }
  $('#btn-end').addEventListener('click', () => { if (!over) endShift('Shift ended early'); });
  $('#btn-new-shift').addEventListener('click', startShift);
  $('#btn-help').addEventListener('click', () => { $('#help').hidden = false; paused = true; });
  $('#btn-help-close').addEventListener('click', () => { $('#help').hidden = true; paused = false; });
  const mapSelect = $('#map-select');
  mapSelect.value = activeMapKey;
  mapSelect.addEventListener('change', () => {
    localStorage.setItem(MAP_KEY, mapSelect.value);
    window.location.reload();
  });

  // ---------- main loop ----------
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!over && !paused) { drive(dt); policeSignals(); updateTraffic(dt); }
    if (!over && !paused) update(dt);
    draw();
    render();
  }
  junctions = buildJunctions();
  startShift();
  requestAnimationFrame(frame);
})();