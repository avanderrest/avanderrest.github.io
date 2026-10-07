/* Wizz Delivery: the rules. A food courier's shift in a keep-left town: orders on the
   restaurants' boards, a bag of up to several at once, countdowns, tips and fines, and the
   town's traffic with its give-ways, roundabouts and signals. No page access, and its own
   clock (G.ms), so a whole shift can be driven in Node in a moment.

     const wz = createWizz({ rnd, on })
       rnd   the dice for orders and traffic (wz.seedDice(n) for tests). The town is fixed.
       on    on(event, data): 'toast' { msg, cls }, 'shift-over' reason

   wz.step(dt) runs the world; wz.input is what the driver is pressing; wz.G is the shift. */
import { mulberry32 } from '../lib/rng.js';

export function createWizz({ rnd: rnd_, on = () => {} } = {}) {
  const toast = (msg, cls) => on('toast', { msg, cls });

  // ---------- constants ----------
  const W = 50, H = 34;              // city grid, in tiles
  const TILE = 44;                   // css px per tile — the art wants the room
  const SHIFT_S = 300;               // length of one shift, seconds
  const FLOAT = 25;                  // starting cash
  const NEAR_R = 5;                  // restaurant catch radius, tiles
  const DELIVER_R = 1.45;            // you are "at the door" inside this
  const CAR_R = 0.3;                 // collision circle
  // Everybody on the road drives at the one speed, you included. E takes you a
  // level faster than the traffic and Q a level slower; slow back down to the
  // traffic's pace (or below it) and a faster level drops back to normal.
  const TRAFFIC_SPEED = 1.1;         // tiles a second, on tarmac (the cars once ranged 0.8-1.4)
  const SPEED_LEVELS = [0.7, 1, 1.6, 2.45]; // flat out is the 2.7 the car always topped out at
  const SPEED_NAMES = ['Easy does it', 'With the traffic', 'Faster', 'Flat out'];
  const NORMAL_LEVEL = 1;
  // One town, after Amber's delivery-map mock (reference/Gemini_..._vctlok...):
  // a crossroads of two main roads with a roundabout where they meet and a mini
  // one up the London Road, side streets squaring it into big garden blocks,
  // the pond and the green down the left. British: everyone keeps left.
  //
  // It is authored as curves even where the roads run straight, because the
  // curve painter gives the kerbs, paving and junction mouths their round
  // corners, and the same lines are rasterised to tiles for collision and
  // routing — the two can never disagree about where a lane is.
  const MAPS = {
    town: {
      name: 'Wizzby', traffic: 0.6, trafficSide: 'left',
      // northbound on the London Road, in the left-hand lane
      start: { x: 24.0, y: 22.5 },
      lights: [[12, 16], [37, 16], [24, 28]],
      roundabouts: [[24, 16], [24, 4]],
      geo: {
        // Control points for a Catmull-Rom through them; `w` is the carriageway
        // in tiles. Roads run off the edge of the map so nothing dead-ends at it.
        // A road centred on a tile edge wants w 2.1, not 2.0: at exactly 2.0 its
        // outer rows sit on the rasteriser's boundary and come out as covered
        // paving, which leaves the row behind with no kerb to build a house on.
        roads: [
          { name: 'High Street', w: 2.3, pts: [[-3, 16.5], [6, 16.5], [12.5, 16.5], [24.5, 16.5], [37.5, 16.5], [45, 16.5], [53, 16.5]] },
          { name: 'London Road', w: 2.3, pts: [[24.5, -3], [24.5, 4.5], [24.5, 10.5], [24.5, 16.5], [24.5, 22.5], [24.5, 28.5], [24.5, 37]] },
          { name: 'North Road', w: 2.1, pts: [[-3, 4.5], [6, 4.5], [12.5, 4.5], [24.5, 4.5], [37.5, 4.5], [45, 4.5], [53, 4.5]] },
          { name: 'South Road', w: 2.1, pts: [[-3, 28.5], [6, 28.5], [12.5, 28.5], [24.5, 28.5], [37.5, 28.5], [45, 28.5], [53, 28.5]] },
          { name: 'West Street', w: 2.1, pts: [[12.5, -3], [12.5, 4.5], [12.5, 10.5], [12.5, 16.5], [12.5, 22.5], [12.5, 28.5], [12.5, 37]] },
          { name: 'East Street', w: 2.1, pts: [[37.5, -3], [37.5, 4.5], [37.5, 10.5], [37.5, 16.5], [37.5, 22.5], [37.5, 28.5], [37.5, 37]] },
          // The estates. `minor` roads are narrow, unlined, and the traffic never
          // turns into them: they are there for the houses and for you. 1.5 is
          // as narrow as one can go and still rasterise to tiles that touch
          // edge to edge where it runs at an angle.
          { name: 'The Crescent', w: 1.5, minor: true, pts: [[12.5, 7.6], [8.4, 7.4], [5.6, 10.0], [8.2, 12.9], [12.5, 13.2]] },
          { name: 'Orchard Close', w: 1.5, minor: true, pts: [[37.5, 7.6], [41.6, 7.4], [44.6, 10.0], [41.8, 12.9], [37.5, 13.2]] },
          { name: 'Elm Close', w: 1.5, minor: true, pts: [[30.5, 4.5], [30.5, 8.5], [30.5, 11.6]] },
          { name: 'Meadow Close', w: 1.5, minor: true, pts: [[18.5, 28.5], [18.5, 24.5], [18.5, 21.4]] },
          { name: 'Depot Lane', w: 1.9, pts: [[43.4, 16.5], [43.4, 18.2], [43.4, 19.8]] },
        ],
        // turning circles at the closed end of each cul-de-sac
        bulbs: [[30.5, 11.6], [18.5, 21.4]],
        // the duck pond in the green
        water: [
          [[2.0, 20.2], [5.0, 19.5], [7.8, 20.4], [8.3, 22.8], [5.6, 24.2], [2.6, 23.7], [1.4, 22.0]],
        ],
        park: [[-2, 17.8], [10.6, 17.8], [10.6, 36], [-2, 36]],
        footpaths: [{ w: 0.55, pts: [[10.2, 18.6], [9.6, 21.5], [8.8, 24.6], [5.5, 25.6], [1.5, 25.2], [-1, 25.6]] }],
        benches: [[9.1, 20.2, 0.25], [8.0, 25.5, 0.1], [3.4, 25.9, 0]],
        carparks: [[41.6, 19.6, 3.6, 4.6]],
        van: { x: 43.4, y: 22.9, h: 0 },
        // Her painted grounds. Tiles under one are open ground: nothing is
        // built on it and no tree grows there, kerbside or not.
        features: [
          { art: 'green', x: 15.6, y: 8.0, w: 5.4, h: 3.6 },
          { art: 'tennis', x: 27.8, y: 21.4, w: 5.6, h: 3.3 },
          { art: 'allotment', x: 0.4, y: 30.7, w: 5.6, h: 3.05 },
          { art: 'playground', x: 6.5, y: 30.7, w: 3.75, h: 3.05 },
        ],
      },
      // pairs a stone's throw apart, so stacking two pickups is a real move;
      // three tiles, not two, or their name boards run into each other
      restaurants: [[18, 14.6], [21, 14.6], [27.5, 6.4], [33.5, 6.4], [28, 18.4], [31, 18.4], [40, 14.6], [43, 14.6]],
      // Every house faces a street; the backs of the blocks are all garden.
      // `built` 0 means no loose building in the middle of a block, and
      // `frontage` is how much of the kerb gets a house on it.
      density: { built: 0, treed: 0.12, frontage: 0.8 },
    },
  };
  const activeMapKey = 'town';
  const activeMap = MAPS.town;
  const geo = activeMap.geo || null;
  const BULB_R = 1.25;   // a cul-de-sac's turning circle, to the kerb

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
  const featureTiles = new Set();
  // Road that only the estates use. The traffic keeps off it.
  const minorTiles = new Set();
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
    const majorTiles = new Set();
    for (const r of geo.curves) for (const [cx, cy] of r.line) {
      stampDisc(roadTiles, cx, cy, r.w / 2);
      stampDisc(r.minor ? minorTiles : majorTiles, cx, cy, r.w / 2);
      stampDisc(tarmacTiles, cx, cy, r.w / 2 + 0.5);
    }
    for (const [bx, by] of geo.bulbs || []) {
      stampDisc(roadTiles, bx, by, BULB_R);
      stampDisc(minorTiles, bx, by, BULB_R);
      stampDisc(tarmacTiles, bx, by, BULB_R + 0.5);
    }
    // where an estate road meets a main one, the mouth belongs to the main road
    for (const k of majorTiles) minorTiles.delete(k);
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
    for (const f of geo.features || []) {
      for (let y = Math.floor(f.y); y < f.y + f.h; y++) for (let x = Math.floor(f.x); x < f.x + f.w; x++) featureTiles.add(x + ',' + y);
    }
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
  // `food` names the painted dish badge; `icon` is its stand-in until that loads
  const RESTAURANTS = [
    { name: "Bella's Diner", roof: '#c9543f', icon: '\u{1F373}', food: 'egg', art: 'shop-diner', signed: true },
    { name: 'Wok & Roll', roof: '#c96f2f', icon: '\u{1F961}', food: 'takeaway', art: 'shop-wok' },
    { name: 'Pizza Slice', roof: '#c9ac3f', icon: '\u{1F355}', food: 'pizza', art: 'shop-pizza' },
    { name: 'Burger Barn', roof: '#8fc93f', icon: '\u{1F354}', food: 'burger', art: 'shop-barn' },
    { name: 'Taco Tuesday', roof: '#3fc990', icon: '\u{1F32E}', food: 'taco', art: 'shop-taco' },
    { name: 'Sushi Sakura', roof: '#3f8fc9', icon: '\u{1F363}', food: 'sushi', art: 'shop-sushi' },
    { name: 'Curry Corner', roof: '#8c3fc9', icon: '\u{1F35B}', food: 'curry', art: 'shop-curry', signed: true },
    { name: 'Noodle Box', roof: '#c93f8f', icon: '\u{1F35C}', food: 'ramen', art: 'shop-noodle' },
  ];
  const SURF = { '#': 1, 's': 0.6, '.': 0.4, 'P': 0.45 };  // road / pavement / grass / park


  // ---------- helpers ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  let R = rnd_ || Math.random;     // the dice: seedDice(n) swaps in a seeded one for tests
  const rnd = (a, b) => a + R() * (b - a);
  const pick = (arr) => arr[Math.floor(R() * arr.length)];
  const shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  };
  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  const money = (n) => (n < 0 ? '-\u00a3' : '\u00a3') + Math.abs(n).toFixed(2);
  const meters = (t) => Math.round(t * 10) + 'm';
  const fmt = (s) => Math.floor(s / 60) + ':' + ('0' + Math.floor(s % 60)).slice(-2);
  // deterministic value in [0,1) per x,y — the Toy Racers trick, kept for the city texture
  // Math.imul, not `*`: the mixing step overflows 2^53 as a float multiply, the
  // low bits get rounded away and the result never once comes out above 0.5.
  // That is why the city used to be wall-to-wall buildings with no park or tree
  // anywhere — every threshold below was being read against a broken half.
  const hash2 = (x, y) => {
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };

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
    if (featureTiles.has(x + ',' + y)) return 'P';   // under a painted ground: open, and kept clear
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
    if (buildable(x, y) && hash2(x + 41, y + 13) < (DENSITY.frontage || 0.55) && !RESTAURANTS.some((r) => r.x === x && r.y === y)) {
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


  // ---------- game state ----------
  const car = { x: START.x, y: START.y, h: 0, v: 0, level: NORMAL_LEVEL };
  const input = { gas: false, brake: false, left: false, right: false, steerTime: 0, steerDir: 0 };
  // the shift: money is the float, paid in and out; earned is fares + tips - fines; ms is the
  // shift's own clock, which only runs while the shift does (order deadlines, signals)
  const G = { money: FLOAT, earned: 0, shiftLeft: SHIFT_S, over: false, paused: false, tracked: null, oid: 1, spawnT: 0, ms: 0 };
  const ST = { fare: 0, tip: 0, fine: 0, done: 0, bonus: 0, late: 0, expired: 0, streak: 0, bestStreak: 0, redLights: 0 };

  const bag = [];
  const toasts = [];
  const routeCache = { target: null, sx: -1, sy: -1, path: null };
  // Traffic only: the estate roads are left out, so no car turns into them,
  // starts on them or comes back in through them.
  const trafficRoad = (x, y) => isRoad(x, y) && !minorTiles.has(x + ',' + y);
  const roadNeighbours = (x, y) => [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]
    .filter(([nx, ny]) => trafficRoad(nx, ny));
  const roadList = [...roadTiles].filter((k) => !minorTiles.has(k));
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
  // (ux,uy), when given, is the way the car means to go. In the middle of a
  // crossroads the crossing road's centreline is as near as your own, and
  // snapping to it sent a car going straight over swerving out along the other
  // road and back. So a lane running your way wins if there is one close by.
  function nearestLane(px, py, ux, uy) {
    let best = null, bd = Infinity, along = null, ad = Infinity;
    const bx = Math.floor(px), by = Math.floor(py);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const list = laneBuckets.get((bx + dx) + ',' + (by + dy));
      if (!list) continue;
      for (const i of list) {
        const s = laneSamples[i];
        const d = (s.x - px) * (s.x - px) + (s.y - py) * (s.y - py);
        if (d < bd) { bd = d; best = s; }
        if (ux !== undefined && d < ad && Math.abs(ux * s.tx + uy * s.ty) > 0.8) { ad = d; along = s; }
      }
    }
    // close enough to be the same carriageway, not a parallel street
    return along && ad < (along.w / 2 + 0.6) ** 2 ? along : best;
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
    // (tx,ty) on the result is the way the lane runs there, in the direction of
    // travel, so traffic can arrive already lined up with the road.
    if (ring) return { x: ring.mx + ring.ux * RING_LANE_R, y: ring.my + ring.uy * RING_LANE_R, tx: ring.tx, ty: ring.ty };
    const m = Math.hypot(dx, dy) || 1;
    const s = nearestLane(cx, cy, dx / m, dy / m);
    if (!s) return { x: cx, y: cy, tx: dx, ty: dy };
    let ux = dx / m, uy = dy / m;
    let along = ux * s.tx + uy * s.ty;
    if (Math.abs(along) < 0.35 && hx !== undefined) along = hx * s.tx + hy * s.ty;
    if (Math.abs(along) >= 0.35) { const k = along > 0 ? 1 : -1; ux = s.tx * k; uy = s.ty * k; }
    const off = Math.min(s.w * 0.25, 0.6);
    return { x: s.x + uy * off * KEEP_LEFT, y: s.y - ux * off * KEEP_LEFT, tx: ux, ty: uy };
  }
  // Give way at a roundabout: a car about to join the ring waits while anything is
  // already on the ring in the quarter coming round towards where it joins (or just
  // past it). Cars pulling out into a car on the ring is what jammed them.
  function mustGiveWay(t) {
    if (!t.target || ringAt(t.x, t.y)) return false;            // not joining, or already on
    const ring = ringAt(t.target.x, t.target.y);
    if (!ring) return false;
    const at = Math.atan2(ring.uy, ring.ux);
    const onRing = (x, y) => {
      const r = Math.hypot(x - ring.mx, y - ring.my);
      if (r > RING_TILE_R + 0.15 || r < 0.6) return false;
      const a = Math.atan2(y - ring.my, x - ring.mx);
      const back = Math.atan2(Math.sin((at - a) * KEEP_LEFT), Math.cos((at - a) * KEEP_LEFT));
      return back > -0.3 && back < 1.2;
    };
    if (onRing(car.x, car.y)) return true;
    return traffic.some((o) => o !== t && onRing(o.x, o.y));
  }

  // ---------- unsignalled junctions ----------
  // Where two traffic roads meet with no lights and no roundabout, the rule is
  // the one drivers use: don't pull into the box until it is clear. Without
  // it, two cars arriving together both went in, met in the middle and sat
  // nose to nose until the stuck timer lifted one of them off the map.
  // Found from the curves themselves — wherever two main roads' centrelines
  // pass within a fifth of a tile — so a new road brings its junctions with it.
  const crossings = [];
  if (geo) {
    const main = geo.curves.filter((r) => !r.minor);
    for (let a = 0; a < main.length; a++) for (let b = a + 1; b < main.length; b++) {
      for (const [ax, ay] of main[a].line) {
        if (ax < 0 || ay < 0 || ax > W || ay > H) continue;
        if (!main[b].line.some(([bx, by]) => Math.abs(bx - ax) < 0.2 && Math.abs(by - ay) < 0.2)) continue;
        if (crossings.some((c) => Math.hypot(c.x - ax, c.y - ay) < 2)) continue;
        if (activeMap.roundabouts.some(([rx, ry]) => Math.hypot(rx + 0.5 - ax, ry + 0.5 - ay) < 3)) continue;
        if (activeMap.lights.some(([lx, ly]) => Math.hypot(lx + 0.5 - ax, ly + 0.5 - ay) < 2)) continue;
        crossings.push({ x: ax, y: ay, r: Math.max(main[a].w, main[b].w) / 2 + 0.45 });
      }
    }
  }
  // Wait outside a box someone else is in. Once in, carry on: a car stopping
  // in the middle is what blocked it in the first place.
  function waitForBox(t) {
    const hx = Math.sin(t.heading), hy = -Math.cos(t.heading);
    for (const c of crossings) {
      if (Math.hypot(t.x - c.x, t.y - c.y) < c.r) return false;
      if (Math.hypot(t.x + hx * 0.4 - c.x, t.y + hy * 0.4 - c.y) >= c.r) continue;
      if (Math.hypot(car.x - c.x, car.y - c.y) < c.r) return true;
      if (traffic.some((o) => o !== t && Math.hypot(o.x - c.x, o.y - c.y) < c.r)) return true;
    }
    return false;
  }

  // A curve map gives its start as a point on the road, since only the curve
  // knows where the middle is; move it into the near-side lane for a car
  // setting off north (h = 0), which is the west half when you keep left.
  if (geo) {
    const p = lanePoint(Math.floor(START.x), Math.floor(START.y), 0, -1);
    START.x = car.x = p.x;
    START.y = car.y = p.y;
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
  const junctions = [];
  const armState = (j, arm) => {
    const cyc = (G.ms / 1000 + j.offset) % (j.groups * SIG_SLOT);
    if (arm.group !== Math.floor(cyc / SIG_SLOT)) return 'red';
    const w = cyc % SIG_SLOT;
    return w < SIG.green ? 'green' : w < SIG.green + SIG.amber ? 'amber' : 'red';
  };
  // Signed distance from a point to the stop line, positive while still short
  // of it, plus how far off the middle of the approach lane the point sits.
  const armGap = (arm, px, py) => (arm.x - px) * arm.ux + (arm.y - py) * arm.uy;
  const armOff = (arm, px, py) => Math.abs((px - arm.x) * arm.lx + (py - arm.y) * arm.ly);

  // The middle of a grid road is where its line says, not what the neighbouring
  // tiles suggest: inside a junction every neighbour is tarmac, the probe picked
  // the wrong edge, and cars turning there slid across the box at 45 degrees.
  const gridRoadMiddle = (lines, v) => {
    const r = lines && lines.find((l) => v === l || v === l + 1);
    return r === undefined ? null : r + 1;
  };
  const trafficLanePoint = (x, y, nx, ny) => {
    const laneOffset = activeMap.trafficSide === 'left' ? -0.22 : 0.22;
    const dx = nx - x, dy = ny - y;
    const roads = activeMap.roads || {};
    if (dx !== 0) {
      const roadCenterY = gridRoadMiddle(roads.horizontal, y)
        ?? (isRoad(x, y - 1) ? y : isRoad(x, y + 1) ? y + 1 : y + 0.5);
      return { x: x + 0.5, y: roadCenterY + dx * laneOffset, tx: dx, ty: 0 };
    }
    if (dy !== 0) {
      const roadCenterX = gridRoadMiddle(roads.vertical, x)
        ?? (isRoad(x - 1, y) ? x : isRoad(x + 1, y) ? x + 1 : x + 0.5);
      return { x: roadCenterX - dy * laneOffset, y: y + 0.5, tx: 0, ty: dy };
    }
    return { x: x + 0.5 - dy * laneOffset, y: y + 0.5 + dx * laneOffset, tx: dx, ty: dy };
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
    // A step can also snap to a lane point beside or behind the car, from a tile
    // across a wide carriageway or a curve sample it has already passed — or, on
    // a lane at an angle, where one step of the tile staircase points back along
    // the road, to the far lane facing the other way. Each sends the car sideways
    // or backwards for a moment, which is the weave, so they are only a fallback
    // for a dead end, where turning round is the point.
    const ring = geo && ringAt(hereX + 0.5, hereY + 0.5);
    const hx = Math.sin(t.heading), hy = -Math.cos(t.heading);
    let fallback = null;
    for (const next of order) {
      const dx = next[0] - hereX, dy = next[1] - hereY;
      // on the ring, only ever with the flow or out of it
      if (ring && dx * ring.tx + dy * ring.ty < -0.1 && dx * ring.ux + dy * ring.uy <= 0.5) continue;
      const p = lanePoint(next[0], next[1], dx, dy, hx, hy);
      const d = Math.hypot(p.x - t.x, p.y - t.y);
      if (d < 0.3) continue;
      if (t.dirX !== undefined && (((p.x - t.x) * hx + (p.y - t.y) * hy) / d < 0.3
        || (p.tx ?? dx) * hx + (p.ty ?? dy) * hy < -0.3)) {
        if (!fallback) fallback = { p, dx, dy };
        continue;
      }
      t.dirX = dx; t.dirY = dy;
      t.previous = { x: hereX, y: hereY };
      return p;
    }
    if (fallback) {
      t.dirX = fallback.dx; t.dirY = fallback.dy;
      t.previous = { x: hereX, y: hereY };
      return fallback.p;
    }
    return { x: t.x, y: t.y };
  };
  const traffic = [];
  const maxTraffic = Math.round(30 + activeMap.traffic * 20);
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
      // face the way it is about to drive, not the way it was going before
      t.heading = Math.atan2(t.target.x - t.x, -(t.target.y - t.y));
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
      t.heading = Math.atan2(e.dx, -e.dy);
      return;
    }
    resetTrafficCar(t);
  };
  for (const tile of roadList) {
    if (traffic.length >= maxTraffic) break;
    const [x, y] = tile.split(',').map(Number);
    if (hash2(x + 73, y + 19) < activeMap.traffic * 0.09) {
      if (dist(x + 0.5, y + 0.5, START.x, START.y) < 1.2) continue;
      const trafficCar = { id: traffic.length, x: 0, y: 0, previous: null, target: null, heading: 0, dirX: undefined, dirY: undefined, speed: TRAFFIC_SPEED, bumpAt: 0, wait: 0 };
      traffic.push(trafficCar);
      resetTrafficCar(trafficCar);
    }
  }

  // ---------- orders ----------
  function makeOffer(r) {
    const hm = pick(HOUSES);
    const d = dist(r.x + 0.5, r.y + 0.5, hm.x + 0.5, hm.y + 0.5);
    const shake = 0.9 + hash2(hm.id, G.oid) * 0.25;
    const base = 3.5 + d * 1.2 * shake;
    const limit = 2.0 + d * 1.3;
    return { id: G.oid++, r, hm, d, base, limit, fine: base * 0.35, bonusUntil: limit * 0.6, tip: 0.45 * base, expiry: G.ms + rnd(45, 85) * 1000 };
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
    o.acceptedAt = o.pickedUp ? G.ms : null;
    bag.push(o);
    if (!G.tracked || !bag.some((b) => b.id === G.tracked)) G.tracked = o.id;
    toast(o.pickedUp ? 'Accepted \u00b7 ' + money(o.base) + ' to House #' + o.hm.id : 'Accepted \u00b7 drive to ' + r.name + ' for pickup', 'good');
    ST.streak = 0;
  }
  function settle(b) {
    const t = (G.ms - b.acceptedAt) / 1000;
    const onTime = t <= b.limit;
    const quick = t <= b.bonusUntil;
    bag.splice(bag.indexOf(b), 1);
    if (G.tracked === b.id) {
      G.tracked = bag.length ? bag.reduce((a, c) => (orderLeft(c) < orderLeft(a) ? c : a), bag[0]).id : null;
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
    G.money += diff;
    G.earned += diff;
  }
  const orderLeft = (b) => b.pickedUp ? b.limit - (G.ms - b.acceptedAt) / 1000 : b.limit;


  function shiftLevel(d) {
    const to = clamp(car.level + d, 0, SPEED_LEVELS.length - 1);
    if (to === car.level) return;
    car.level = to;
    toast(SPEED_NAMES[to]);
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
    // Only a car in the way you are going holds you up. This used to be measured along
    // the other car's heading, so one pulling up behind you while you stood at a door
    // pinned you to a crawl, and it sat waiting for you: both stuck.
    const goX = Math.sin(car.h) * (car.v < 0 ? -1 : 1), goY = -Math.cos(car.h) * (car.v < 0 ? -1 : 1);
    const trafficAhead = traffic.reduce((closest, t) => {
      const dx = t.x - car.x, dy = t.y - car.y;
      const distance = Math.hypot(dx, dy);
      const ahead = dx * goX + dy * goY;
      const across = Math.abs(dx * goY - dy * goX);
      return ahead > 0 && ahead < 1.3 && across < 0.48 ? Math.min(closest, distance) : closest;
    }, Infinity);
    const trafficSlow = trafficAhead < Infinity ? clamp((trafficAhead - 0.35) / 0.95, 0.18, 1) : 1;
    // a faster level lasts until you slow back to the traffic's pace
    if (car.level > NORMAL_LEVEL && car.v <= TRAFFIC_SPEED * sf * 0.98 && !input.gas) car.level = NORMAL_LEVEL;
    const maxSp = TRAFFIC_SPEED * SPEED_LEVELS[car.level] * sf * trafficSlow, acc = 2.15;
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
      // backing or pulling away from a car you are touching is how you get unstuck
      const into = (t.x - car.x) * Math.sin(car.h) * car.v - (t.y - car.y) * Math.cos(car.h) * car.v;
      if (into <= 0) continue;
      const wasMoving = Math.abs(car.v) >= 0.25;
      car.v *= 0.25;
      if (!wasMoving) continue;
      if (G.ms < t.bumpAt) continue;
      t.bumpAt = G.ms + 1800;
      const fine = 2.5;
      G.money -= fine;
      G.earned -= fine;
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
    const now = G.ms;
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
        G.money -= fine; G.earned -= fine; ST.fine += fine; ST.redLights++; ST.streak = 0;
        toast('Ran a red light · −' + money(fine) + ' fine', 'bad');
      }
    }
  }

  // A car that cannot go on is lifted off and put down somewhere else. That is
  // a safety net, not traffic, so every use is logged: the tests read the log,
  // and a junction that keeps needing it is a junction that jams.
  const stuckLog = [];
  function giveUp(t, why) {
    stuckLog.push({ x: t.x, y: t.y, why, at: G.ms });
    if (stuckLog.length > 200) stuckLog.shift();
    resetTrafficCar(t);
  }
  function updateTraffic(dt) {
    for (const t of traffic) {
      if (t.curve) continue;
      const dx = t.target.x - t.x, dy = t.target.y - t.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.08) {
        t.x = t.target.x; t.y = t.target.y;
        if (t.exiting) { enterFromEdge(t); continue; }
        const moved = t.dirX !== undefined;
        t.target = trafficNext(t);
        const chord = Math.hypot(t.target.x - t.x, t.target.y - t.y);
        // nowhere to go from here: let the stuck timer see it, not sit forever
        if (chord < 0.08) {
          t.wait += dt;
          if (t.wait > 2) giveUp(t, 'nowhere');
          continue;
        }
        // Every step is a curve that leaves the way the car is pointing and
        // arrives lined up with the lane. The handles used to run along the tile
        // step instead, and a road at an angle is a staircase of tile steps, so
        // the car pointed east, south, east, south all the way down it.
        const k = chord * 0.38;
        const ax = t.target.tx ?? t.dirX, ay = t.target.ty ?? t.dirY;
        const hx = moved ? Math.sin(t.heading) : (t.target.x - t.x) / chord;
        const hy = moved ? -Math.cos(t.heading) : (t.target.y - t.y) / chord;
        t.curve = {
          p0: { x: t.x, y: t.y },
          p1: { x: t.x + hx * k, y: t.y + hy * k },
          p2: { x: t.target.x - ax * k, y: t.target.y - ay * k },
          p3: { x: t.target.x, y: t.target.y },
          u: 0,
          len: (chord + k * 2 + Math.hypot(t.target.x - ax * k - t.x - hx * k, t.target.y - ay * k - t.y - hy * k)) / 2,
        };
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
      // `held` marks a car that is waiting because the road says so — a red, a
      // roundabout, a busy junction — and the cars queued behind it inherit it.
      t.held = false;
      if (heldAtSignal(t.x, t.y, dx / d, dy / d)) { t.wait = 0; t.held = true; continue; }
      if (mustGiveWay(t)) { t.wait = 0; t.held = true; continue; }
      t.boxWait = waitForBox(t);
      if (t.boxWait) { t.wait = 0; t.held = true; continue; }
      const playerDx = car.x - t.x, playerDy = car.y - t.y;
      const playerAhead = playerDx * Math.sin(t.heading) - playerDy * Math.cos(t.heading);
      const playerAcross = Math.abs(playerDx * Math.cos(t.heading) + playerDy * Math.sin(t.heading));
      // A car held up by you waits, but not for ever: you stopped at a door is not
      // traffic, and both of you sitting there nose to nose was a jam nobody could
      // clear. After a while it squeezes past.
      const squeezing = G.ms < (t.squeezeUntil || 0);
      const blockedByPlayer = !squeezing && playerAhead > -0.35 && playerAhead < 0.95 && playerAcross < 0.42;
      let blocked = blockedByPlayer, blocker = null;
      for (const other of traffic) {
        if (other === t) continue;
        const otherDx = other.x - t.x, otherDy = other.y - t.y;
        const otherDistance = Math.hypot(otherDx, otherDy);
        const otherAhead = otherDx * Math.sin(t.heading) - otherDy * Math.cos(t.heading);
        const otherAcross = Math.abs(otherDx * Math.cos(t.heading) + otherDy * Math.sin(t.heading));
        // a car waiting at a junction's edge only blocks you if it is in your way
        const nudging = otherDistance < 0.55 && other.id < t.id && !other.boxWait;
        if (nudging || (otherAhead > 0 && otherAhead < 0.78 && otherAcross < 0.45)) {
          blocked = true;
          blocker = other;
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
          t.playerWait = Math.abs(car.v) < 0.2 ? (t.playerWait || 0) + dt : 0;
          if (t.playerWait > 2.5) { t.playerWait = 0; t.squeezeUntil = G.ms + 2500; }
          continue;
        }
        // Queued behind a car that is waiting its turn is a queue, not a jam:
        // the stuck timer is for cars that will never move, and lifting the
        // back of every queue off the map after four seconds emptied the roads.
        if (blocker && blocker.held) { t.wait = 0; t.held = true; continue; }
        t.wait += dt;
        if (t.wait > 4) giveUp(t, 'jammed');
        continue;
      }
      t.wait = 0;
      if (t.curve) {
        const nextU = Math.min(1, t.curve.u + t.speed * dt / Math.max(0.2, t.curve.len || 0.95));
        const c = t.curve, u = nextU, v = 1 - u;
        const nextX = v * v * v * c.p0.x + 3 * v * v * u * c.p1.x + 3 * v * u * u * c.p2.x + u * u * u * c.p3.x;
        const nextY = v * v * v * c.p0.y + 3 * v * v * u * c.p1.y + 3 * v * u * u * c.p2.y + u * u * u * c.p3.y;
        if (trafficTooClose(t, nextX, nextY)) {
          t.wait += dt;
          if (t.wait > 4) giveUp(t, 'jammed');
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
          if (t.wait > 4) giveUp(t, 'jammed');
          continue;
        }
        t.x = nextX;
        t.y = nextY;
      }
    }
    for (let i = 0; i < traffic.length; i++) for (let j = i + 1; j < traffic.length; j++) {
      const first = traffic[i], second = traffic[j];
      const distance = dist(first.x, first.y, second.x, second.y);
      const angleGap = Math.abs(Math.atan2(Math.sin(first.heading - second.heading), Math.cos(first.heading - second.heading)));
      const crossing = angleGap > 0.6 && angleGap < 2.55;
      const clearance = crossing ? 0.72 : 0.42;
      if (distance >= clearance) continue;
      const retreat = first.id > second.id ? first : second;
      const safeX = retreat.lastX, safeY = retreat.lastY;
      giveUp(retreat, 'overlap');
      if (retreat.x === safeX && retreat.y === safeY) {
        const other = retreat === first ? second : first;
        const awayX = retreat.x - other.x, awayY = retreat.y - other.y;
        const awayDistance = Math.hypot(awayX, awayY) || 1;
        retreat.x = other.x + awayX / awayDistance * 0.75;
        retreat.y = other.y + awayY / awayDistance * 0.75;
        retreat.curve = null;
      }
    }
  }
  function nearestRestaurant() {
    let best = null, bd = NEAR_R;
    for (const r of REST) {
      const d = dist(car.x, car.y, r.x + 0.5, r.y + 0.5);
      if (d < bd) { bd = d; best = r; }
    }
    return best;
  }

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
    // pavement is open only where nothing stands on it: a house or shop on the pavement is
    // a wall, and the arrow once led straight into one (found by the bot, 2026-10-07)
    const open = (x, y) => x >= 0 && y >= 0 && x < W && y < H &&
      (kindAt(x, y) === '#' || (kindAt(x, y) === 's' && !solidOf(x, y)) || (x === tx && y === ty));
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
        // round a roundabout the way the traffic goes, as traffic does, or off it
        const ring = geo && ringAt(p.x + 0.5, p.y + 0.5);
        if (ring && dx * ring.tx + dy * ring.ty < -0.1 && dx * ring.ux + dy * ring.uy <= 0.5) continue;
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
    if (G.shiftLeft <= 0 && !G.over) { endShift('Shift over'); return; }
    G.shiftLeft -= dt;
    G.spawnT -= dt;
    if (G.spawnT <= 0) {
      G.spawnT = 8;
      let r = REST[Math.floor(R() * REST.length)];
      // lean towards where the player is parked so the board is rarely bare
      const near = nearestRestaurant();
      if (near && R() < 0.45) r = near;
      if (r.offers.length < 4) r.offers.push(makeOffer(r));
    }
    for (const r of REST) {
      for (let i = r.offers.length - 1; i >= 0; i--) {
        const o = r.offers[i];
        if (G.ms > o.expiry) { r.offers.splice(i, 1); ST.expired++; }
      }
    }
    // anything at your feet settles by itself
    for (let i = bag.length - 1; i >= 0; i--) {
      const b = bag[i];
      if (!b.pickedUp && dist(car.x, car.y, b.r.x + 0.5, b.r.y + 0.5) < DELIVER_R) {
        b.pickedUp = true;
        b.acceptedAt = G.ms;
        toast('Picked up · now deliver to House #' + b.hm.id, 'good');
      } else if (b.pickedUp && dist(car.x, car.y, b.hm.x + 0.5, b.hm.y + 0.5) < DELIVER_R) settle(b);
    }
  }


  // ---------- the shift ----------
  // One step of the world: you, the signals, the traffic, then the orders and the clock.
  function step(dt) {
    if (G.over || G.paused) return;
    G.ms += dt * 1000;
    drive(dt); policeSignals(); updateTraffic(dt);
    update(dt);
  }
  function endShift(reason) {
    G.over = true;
    on('shift-over', reason);
  }
  function startShift() {
    G.money = FLOAT; G.earned = 0; G.shiftLeft = SHIFT_S; G.over = false; G.tracked = null;
    Object.assign(ST, { fare: 0, tip: 0, fine: 0, done: 0, bonus: 0, late: 0, expired: 0, streak: 0, bestStreak: 0, redLights: 0 });
    bag.length = 0;
    for (const r of REST) r.offers.length = 0;
    car.x = START.x; car.y = START.y; car.h = 0; car.v = 0; car.level = NORMAL_LEVEL;
    seedOffers();
  }
  function setPaused(on) {
    if (on === G.paused) return;
    G.paused = on;
    if (!on) input.gas = input.brake = input.left = input.right = false;
  }

  junctions.push(...buildJunctions());
  return {
    smoothPath, nearestLane, ringAt, lanePoint, mustGiveWay, waitForBox, makeArm, buildJunctions, makeOffer, seedOffers, acceptOffer, settle, shiftLevel, collide, drive, heldAtSignal, policeSignals, giveUp, updateTraffic, nearestRestaurant, destinationOf, closestAccepted, searchRoute, carDir, routePath, update, step, endShift, startShift, setPaused, W, H, TILE, SHIFT_S, FLOAT, NEAR_R, DELIVER_R, CAR_R, TRAFFIC_SPEED, SPEED_LEVELS, SPEED_NAMES, NORMAL_LEVEL, MAPS, activeMapKey, activeMap, geo, BULB_R, pointInPoly, roadTiles, tarmacTiles, waterTiles, parkTiles, carparkTiles, islandTiles, featureTiles, minorTiles, addRoad, stampDisc, fillPoly, isRoad, onTarmac, isWater, isPark, isCarpark, isIsland, isTrafficLight, isRoundabout, START, DENSITY, RESTAURANTS, SURF, clamp, lerp, rnd, pick, shuffle, dist, money, meters, fmt, hash2, kindAt, takenShop, buildable, snapToPavement, houses, HOUSES, REST, restaurantAt, houseAt, solidOf, SOLID, car, input, G, ST, bag, toasts, routeCache, trafficRoad, roadNeighbours, roadList, laneSamples, laneBuckets, KEEP_LEFT, RING_TILE_R, RING_LANE_R, crossings, SIG, SIG_SLOT, STOP_BACK, junctions, armState, armGap, armOff, gridRoadMiddle, trafficLanePoint, offGrid, trafficNext, traffic, maxTraffic, resetTrafficCar, edgeEntries, enterFromEdge, orderLeft, trafficTooClose, stuckLog, DIRS, canTurnRound,
    seedDice(n) { R = mulberry32(n); },
  };
}
