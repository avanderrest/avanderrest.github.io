/* Dash — a food-courier game. Drive a car between restaurants and houses,
   stack up deliveries, and chase tips before the countdowns run you over.
   Plain canvas + DOM, nothing to build. Saves the best shift to localStorage. */
(() => {
  'use strict';

  // ---------- constants ----------
  const SAVE_KEY = 'dash-save-v1';
  const W = 50, H = 34;              // city grid, in tiles
  const TILE = 30;                   // px per tile at zoom 1
  const SHIFT_S = 300;               // length of one shift, seconds
  const FLOAT = 25;                  // starting cash
  const START = { x: 17.5, y: 18.5 };  // on the road beside Curry Corner
  const NEAR_R = 5;                  // restaurant catch radius, tiles
  const DELIVER_R = 1.45;            // you are "at the door" inside this
  const CAR_R = 0.3;                 // collision circle
  const MAPS = {
    grid: { name: 'American grid', traffic: 0.9, trafficSide: 'right', roads: { vertical: [3, 10, 17, 24, 31, 38, 44], horizontal: [3, 10, 17, 24, 30] }, lights: [[10, 10], [17, 17], [31, 17], [38, 24]], roundabouts: [] },
    village: { name: 'English villages', traffic: 0.45, trafficSide: 'left', roads: { segments: [[3, 8, 31, 8], [8, 8, 8, 24], [8, 24, 44, 24], [31, 8, 31, 30], [31, 17, 44, 17], [44, 17, 44, 30], [18, 30, 31, 30]] }, lights: [[31, 17]], roundabouts: [[8, 24], [31, 17]] },
  };
  const MAP_KEY = 'dash-map-v1';
  const activeMapKey = localStorage.getItem(MAP_KEY) || 'grid';
  const activeMap = MAPS[activeMapKey] || MAPS.grid;
  const roadTiles = new Set();
  const addRoad = (x, y) => { if (x >= 0 && y >= 0 && x < W && y < H) roadTiles.add(x + ',' + y); };
  if (activeMap.roads.vertical) for (const x of activeMap.roads.vertical) for (let y = 0; y < H; y++) { addRoad(x, y); addRoad(x + 1, y); }
  if (activeMap.roads.horizontal) for (const y of activeMap.roads.horizontal) for (let x = 0; x < W; x++) { addRoad(x, y); addRoad(x, y + 1); }
  if (activeMap.roads.segments) for (const [x1, y1, x2, y2] of activeMap.roads.segments) {
    const dx = Math.sign(x2 - x1), dy = Math.sign(y2 - y1);
    for (let x = x1, y = y1; x !== x2 + dx || y !== y2 + dy; x += dx, y += dy) addRoad(x, y);
  }
  for (const [cx, cy] of activeMap.roundabouts) for (let x = cx - 1; x <= cx + 1; x++) for (let y = cy - 1; y <= cy + 1; y++) {
    if (Math.abs(x - cx) + Math.abs(y - cy) >= 1) addRoad(x, y);
  }
  const isRoad = (x, y) => roadTiles.has(x + ',' + y);
  const isTrafficLight = (x, y) => activeMap.lights.some(([lx, ly]) => Math.abs(x - lx) <= 1 && Math.abs(y - ly) <= 1);
  const isRoundabout = (x, y) => activeMap.roundabouts.some(([rx, ry]) => Math.abs(x - rx) <= 1 && Math.abs(y - ry) <= 1);

  // (name, grid cell). Pairs sit a stone's throw apart so stacking is a real move.
  const RESTAURANTS = [
    { name: "Bella's Diner", x: 5, y: 5, roof: '#c9543f' },
    { name: 'Wok & Roll', x: 5, y: 6, roof: '#c96f2f' },
    { name: 'Pizza Slice', x: 12, y: 12, roof: '#c9ac3f' },
    { name: 'Burger Barn', x: 12, y: 13, roof: '#8fc93f' },
    { name: 'Taco Tuesday', x: 26, y: 12, roof: '#3fc990' },
    { name: 'Sushi Sakura', x: 26, y: 13, roof: '#3f8fc9' },
    { name: 'Curry Corner', x: 19, y: 19, roof: '#8c3fc9' },
    { name: 'Noodle Box', x: 19, y: 20, roof: '#c93f8f' },
  ];
  const SURF = { '#': 1, 's': 0.6, '.': 0.4 };  // road / sidewalk / grass

  // ---------- helpers ----------
  const $ = (s) => document.querySelector(s);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  const money = (n) => (n < 0 ? '-\u0024' : '\u0024') + Math.abs(n).toFixed(2);
  const meters = (t) => Math.round(t * 10) + 'm';
  const fmt = (s) => Math.floor(s / 60) + ':' + ('0' + Math.floor(s % 60)).slice(-2);
  // deterministic value in [0,1) per x,y — the paddock trick, kept for the city texture
  const hash2 = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >> 13)) * 1274126177; return ((h ^ (h >> 16)) >>> 0) / 4294967296; };
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
    if (isRoad(x, y)) return '#';
    const nearRoad = (x > 0 && isRoad(x - 1, y)) || (x < W - 1 && isRoad(x + 1, y)) ||
      (y > 0 && isRoad(x, y - 1)) || (y < H - 1 && isRoad(x, y + 1));
    if (nearRoad) return 's';
    const h = hash2(x, y);
    if (h < 0.52) return 'B';   // building footprint
    if (h < 0.57) return 'T';   // tree
    return '.';                 // park / empty lot
  };

  // houses go along the pavements, so deliveries are always reachable by car
  const houses = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = kindAt(x, y);
    if (k === 's' && hash2(x + 41, y + 13) < 0.55 && !RESTAURANTS.some((r) => r.x === x && r.y === y)) {
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
    return k === 'B' || k === 'T' || restaurantAt(x, y) || houseAt(x, y);
  };
  // precompute the collision grid once; buildings never move
  const SOLID = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (solidOf(x, y)) SOLID.push({ x, y });

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
  const ST = { fare: 0, tip: 0, fine: 0, done: 0, bonus: 0, late: 0, expired: 0, streak: 0, bestStreak: 0 };

  const bag = [];
  const toasts = [];
  const routeCache = { target: null, sx: -1, sy: -1, path: null };
  const roadNeighbours = (x, y) => [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]
    .filter(([nx, ny]) => isRoad(nx, ny));
  const roadList = [...roadTiles];
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
  const trafficNext = (t) => {
    const hereX = Math.floor(t.x), hereY = Math.floor(t.y);
    const options = roadNeighbours(hereX, hereY);
    if (!options.length) return { x: hereX + 0.5, y: hereY + 0.5 };
    const previous = t.previous;
    const straight = t.dirX === undefined ? null : [hereX + t.dirX, hereY + t.dirY];
    const canContinue = straight && options.some(([x, y]) => x === straight[0] && y === straight[1]);
    const forward = options.filter(([x, y]) => !previous || x !== previous.x || y !== previous.y);
    const next = canContinue ? straight : pick(forward.length ? forward : options);
    t.dirX = next[0] - hereX;
    t.dirY = next[1] - hereY;
    t.previous = { x: hereX, y: hereY };
    return trafficLanePoint(next[0], next[1], next[0] + next[0] - hereX, next[1] + next[1] - hereY);
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
      t.previous = null; t.dirX = undefined; t.dirY = undefined; t.curve = null; t.wait = 0;
      t.target = trafficNext(t);
      const laneStart = trafficLanePoint(x, y, x + t.dirX, y + t.dirY);
      t.x = laneStart.x; t.y = laneStart.y;
      return;
    }
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
  function updateTraffic(dt) {
    for (const t of traffic) {
      if (t.curve) continue;
      const dx = t.target.x - t.x, dy = t.target.y - t.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.08) {
        t.x = t.target.x; t.y = t.target.y;
        const oldDirX = t.dirX, oldDirY = t.dirY;
        t.target = trafficNext(t);
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
  window.__dash = { car, bag, traffic, trafficCollisions, restaurants: REST, nearestRestaurant };
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
  function routePath(target) {
    const sx = clamp(Math.floor(car.x), 0, W - 1), sy = clamp(Math.floor(car.y), 0, H - 1);
    const destination = destinationOf(target);
    const tx = Math.floor(destination.x), ty = Math.floor(destination.y);
    if (routeCache.target === target && routeCache.sx === sx && routeCache.sy === sy) return routeCache.path;
    const key = (x, y) => y * W + x;
    const queue = [{ x: sx, y: sy, cost: 0 }], came = new Map([[key(sx, sy), null]]), costs = new Map([[key(sx, sy), 0]]);
    const open = (x, y) => x >= 0 && y >= 0 && x < W && y < H &&
      (kindAt(x, y) === '#' || kindAt(x, y) === 's' || (x === tx && y === ty));
    while (queue.length) {
      queue.sort((a, b) => a.cost - b.cost);
      const p = queue.shift();
      if (p.cost !== costs.get(key(p.x, p.y))) continue;
      if (p.x === tx && p.y === ty) break;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = p.x + dx, y = p.y + dy, k = key(x, y);
        if (!open(x, y)) continue;
        const step = kindAt(x, y) === '#' ? 1 : 8;
        const cost = p.cost + step;
        if (!costs.has(k) || cost < costs.get(k)) {
          costs.set(k, cost);
          came.set(k, p);
          queue.push({ x, y, cost });
        }
      }
    }
    if (!came.has(key(tx, ty))) {
      routeCache.target = target; routeCache.sx = sx; routeCache.sy = sy; routeCache.path = null;
      return null;
    }
    const path = [];
    for (let p = { x: tx, y: ty }; p; p = came.get(key(p.x, p.y))) path.push(p);
    routeCache.target = target; routeCache.sx = sx; routeCache.sy = sy; routeCache.path = path.reverse();
    return routeCache.path;
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
  const ctx = canvas.getContext('2d');
  const mm = $('#minimap');
  const mmCtx = mm.getContext('2d');
  const mmBase = document.createElement('canvas');
  mmBase.width = mm.width; mmBase.height = mm.height;
  const mW = mm.width / W, mH = mm.height / H;
  {
    const b = mmBase.getContext('2d');
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const k = kindAt(x, y);
      b.fillStyle = k === '#' ? '#9b9790' : k === 's' ? '#d6cbb2' : k === 'B' ? '#8d8a85' : k === 'T' ? '#6a9459' : k === 'R' ? '#c9543f' : k === 'H' ? '#caa95e' : '#7fa564';
      b.fillRect(x * mW, y * mH, mW + 0.5, mH + 0.5);
    }
  }
  function fitCanvas() {
    const r = canvas.parentElement.getBoundingClientRect();
    const w = Math.max(240, Math.floor(r.width)), h = Math.max(240, Math.floor(r.height));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  }
  window.addEventListener('resize', fitCanvas);
  fitCanvas();

  // world transform: screenX = (wx - cam.x + cx/TILE) * TILE ... we use setTransform below
  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(TILE, 0, 0, TILE, canvas.width / 2 - cam.x * TILE, canvas.height / 2 - cam.y * TILE);

    const pad = 2;
    const x0 = Math.max(0, Math.floor(cam.x - canvas.width / (2 * TILE) - pad));
    const x1 = Math.min(W - 1, Math.ceil(cam.x + canvas.width / (2 * TILE) + pad));
    const y0 = Math.max(0, Math.floor(cam.y - canvas.height / (2 * TILE) - pad));
    const y1 = Math.min(H - 1, Math.ceil(cam.y + canvas.height / (2 * TILE) + pad));

    // ground
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const k = kindAt(x, y), n = hash2(x, y);
      let fill;
      if (k === '#') fill = n < 0.5 ? '#5f6064' : '#5a5b60';
      else if (k === 's') fill = n < 0.5 ? '#d9ceb5' : '#d6cbb2';
      else if (k === 'B') fill = n < 0.5 ? '#7e7c76' : '#79776f';
      else fill = ['#79a563', '#73a05d', '#81ab6b', '#6c9b57'][Math.floor(n * 4)];
      ctx.fillStyle = fill;
      ctx.fillRect(x, y, 1, 1);
      if (k === '#') {
        const hh = kindAt(x + 1, y) === '#' || kindAt(x - 1, y) === '#';
        const vv = kindAt(x, y + 1) === '#' || kindAt(x, y - 1) === '#';
        if (hh && vv) { ctx.fillStyle = '#52535a'; ctx.fillRect(x + 0.4, y + 0.4, 0.2, 0.2); }
        else if (hh) { ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fillRect(x + ((x + y) & 1 ? 0.4 : 0.02), y + 0.48, 0.58, 0.045); }
        else if (vv) { ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fillRect(x + 0.48, y + ((x + y) & 1 ? 0.4 : 0.02), 0.045, 0.58); }
      }
    }

    for (const t of traffic) {
      if (t.x < x0 - 1 || t.x > x1 + 1 || t.y < y0 - 1 || t.y > y1 + 1) continue;
      ctx.save(); ctx.translate(t.x, t.y); ctx.rotate(t.heading);
      ctx.fillStyle = '#e7d7ac'; ctx.fillRect(-0.13, -0.28, 0.26, 0.56);
      ctx.fillStyle = '#d66a43'; ctx.fillRect(-0.11, -0.2, 0.22, 0.16);
      ctx.restore();
    }
    for (const [x, y] of activeMap.roundabouts) {
      ctx.strokeStyle = 'rgba(218, 195, 119, 0.8)'; ctx.lineWidth = 0.12; ctx.beginPath(); ctx.arc(x + 0.5, y + 0.5, 0.34, 0, Math.PI * 2); ctx.stroke();
    }

    // buildings, trees, restaurants and houses, roughly front-to-back
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const k = kindAt(x, y);
      if (restaurantAt(x, y)) drawShop(x, y, true);
      else if (houseAt(x, y)) drawShop(x, y, false);
      else if (k === 'B') drawBuilding(x, y, 0.42, '#6d6b64', ['#b7b5aa', '#aeaCb0', '#c1bfb4', '#a9a79c'][Math.floor(hash2(x + 9, y + 9) * 4)]);
      else if (k === 'T') drawTree(x, y);
    }

    for (const [x, y] of activeMap.lights) {
      const signalSpots = [[x - 0.28, y - 0.28], [x + 1.28, y - 0.28], [x - 0.28, y + 1.28], [x + 1.28, y + 1.28]];
      const signalSpot = signalSpots.find(([sx, sy]) => kindAt(Math.floor(sx), Math.floor(sy)) === 's') ||
        signalSpots.find(([sx, sy]) => !['B', 'T'].includes(kindAt(Math.floor(sx), Math.floor(sy)))) || signalSpots[0];
      const lx = signalSpot[0], ly = signalSpot[1];
      ctx.save();
      ctx.translate(lx, ly);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(-0.04, -0.42, 0.3, 0.86);
      ctx.fillStyle = '#25262a'; ctx.fillRect(-0.08, -0.5, 0.3, 0.72);
      ctx.fillStyle = '#e84f43'; ctx.beginPath(); ctx.arc(0.07, -0.37, 0.07, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e8c94a'; ctx.beginPath(); ctx.arc(0.07, -0.14, 0.07, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#52bd67'; ctx.beginPath(); ctx.arc(0.07, 0.09, 0.07, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3d3a35'; ctx.fillRect(0.03, 0.22, 0.08, 0.58);
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x + 0.06, y + 0.06, 0.88, 0.06);
    }

    // the catch-zone round wherever you are parked
    const nr = nearestRestaurant();
    if (nr) {
      ctx.strokeStyle = 'rgba(201,119,47,0.35)'; ctx.lineWidth = 0.04;
      ctx.beginPath(); ctx.arc(nr.x + 0.5, nr.y + 0.5, NEAR_R, 0, Math.PI * 2); ctx.stroke();
    }

    const routeTarget = closestAccepted();
    const route = routeTarget && routePath(routeTarget);
    if (route) {
      ctx.save();
      ctx.strokeStyle = 'rgba(246,213,107,0.9)';
      ctx.lineWidth = 0.16;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.setLineDash([0.32, 0.22]);
      ctx.beginPath();
      ctx.moveTo(car.x, car.y);
      for (const p of route) ctx.lineTo(p.x + 0.5, p.y + 0.5);
      ctx.stroke();
      ctx.restore();
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

  function drawBuilding(x, y, elev, side, roof) {
    const n = hash2(x + 1, y + 7);
    ctx.fillStyle = 'rgba(0,0,0,' + (0.13 + n * 0.08) + ')';
    ctx.fillRect(x + 0.035, y + 0.06, 0.94, 0.95);
    ctx.fillStyle = side;
    ctx.fillRect(x + 0.03, y + 0.03, 0.94, 0.94);
    ctx.fillStyle = roof;
    ctx.fillRect(x + 0.03, y + 0.03 - elev, 0.94, 0.94);
  }
  function drawTree(x, y) {
    const n = hash2(x * 3, y * 5);
    const cx = x + 0.5 + (n - 0.5) * 0.12, cy = y + 0.5 + (hash2(y, x) - 0.5) * 0.12;
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.beginPath(); ctx.ellipse(cx + 0.05, cy + 0.08, 0.32, 0.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#6b4a2b'; ctx.lineWidth = 0.07;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - 0.28); ctx.stroke();
    ctx.fillStyle = n < 0.5 ? '#3f7a3a' : '#46863f';
    ctx.beginPath(); ctx.arc(cx, cy - 0.34, 0.34, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.beginPath(); ctx.arc(cx - 0.12, cy - 0.42, 0.12, 0, Math.PI * 2); ctx.fill();
  }
  // one little shop that happens to be a restaurant (or a house)
  function drawShop(x, y, rest) {
    const elev = rest ? 0.46 : 0.34;
    const side = rest ? '#8c5a3a' : '#b3a893';
    const n = hash2(x + 31, y + 19);
    ctx.fillStyle = 'rgba(0,0,0,0.14)';
    ctx.fillRect(x + 0.05, y + 0.08, 0.9, 0.92);
    ctx.fillStyle = side;
    ctx.fillRect(x + 0.04, y + 0.04, 0.92, 0.92);
    ctx.fillStyle = rest ? REST.find((r) => r.x === x && r.y === y).roof : (n < 0.5 ? '#e2d6ba' : '#d9ccae');
    ctx.fillRect(x + 0.04, y + 0.04 - elev, 0.92, 0.92);
    // awning or porch across the street-facing edge
    ctx.fillStyle = rest ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.28)';
    ctx.fillRect(x + 0.22, y + 0.04 - elev + 0.12, 0.56, 0.12);
    if (rest) {
      ctx.fillStyle = 'rgba(59,47,36,0.75)';
      ctx.font = '600 0.44px ui-sans-serif, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText('R', x + 0.5, y + 0.5 - elev + 0.22);
    } else {
      ctx.fillStyle = '#6b4a2b'; ctx.fillRect(x + 0.3, y + 0.5, 0.4, 0.24);
    }
  }
  function drawBubble(r) {
    const bob = Math.sin(performance.now() / 300 + r.x) * 0.06;
    const cx = r.x + 0.5, cy = r.y + 0.5 - 0.62 + bob;
    ctx.font = '700 0.4px ui-sans-serif, sans-serif';
    const tw = ctx.measureText(String(r.offers.length)).width;
    poly(ctx, [[cx - 0.16, cy + 0.18], [cx + 0.16, cy + 0.18], [cx + 0.16, cy - 0.18], [cx + 0.1 + tw / 2, cy - 0.18], [cx, cy - 0.34], [cx - 0.1 - tw / 2, cy - 0.18], [cx - 0.16, cy - 0.18]],
      '#c9772f', '#fff', 0.02);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff'; ctx.font = '700 0.34px ui-sans-serif, sans-serif';
    ctx.fillText(r.offers.length, cx, cy - 0.07);
  }
  function drawTarget(b) {
    const destination = destinationOf(b);
    const cx = destination.x, cy = destination.y - 0.05;
    const isT = tracked === b.id;
    const bob = Math.sin(performance.now() / 220) * 0.05;
    const d = dist(car.x, car.y, cx, destination.y);
    // little flag on a pole
    ctx.strokeStyle = isT ? '#fff' : 'rgba(255,255,255,0.75)'; ctx.lineWidth = isT ? 0.045 : 0.03;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - 0.5 + bob); ctx.stroke();
    ctx.fillStyle = b.pickedUp ? (b.hm.door ? '#c9772f' : '#3f8fc9') : '#c9772f';
    poly(ctx, [[cx, cy - 0.5 + bob], [cx + 0.22, cy - 0.42 + bob], [cx, cy - 0.34 + bob]], ctx.fillStyle);
    if (!isT) return;
    ctx.font = '600 0.32px ui-sans-serif, sans-serif';
    const lab = (b.pickedUp ? '#' + b.hm.id : b.r.name + ' pickup') + ' \u00b7 ' + meters(d) + (b.pickedUp ? ' \u00b7 ' + fmt(Math.max(0, orderLeft(b))) : '');
    const w = ctx.measureText(lab).width + 0.14;
    ctx.fillStyle = 'rgba(59,47,36,0.82)';
    ctx.fillRect(cx - w / 2, cy - 0.62 + bob, w, 0.3);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(lab, cx, cy - 0.47 + bob);
  }
  function drawCar() {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.h);
    const L = 0.18; // local half-length
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath(); ctx.ellipse(0, 0.07, 0.34, 0.2, 0, 0, Math.PI * 2); ctx.fill();
    // wheels
    ctx.fillStyle = '#222';
    for (const [px, py, w, h] of [[-0.17, -L + 0.05, 0.07, 0.18], [0.17, -L + 0.05, 0.07, 0.18], [-0.17, L - 0.05, 0.07, 0.18], [0.17, L - 0.05, 0.07, 0.18]]) {
      ctx.fillRect(px - w / 2, py - h / 2, w, h);
    }
    // body
    ctx.fillStyle = '#d94f30';
    ctx.beginPath();
    ctx.moveTo(0, -L - 0.02);
    ctx.quadraticCurveTo(0.22, -L + 0.02, 0.2, L * 0.35);
    ctx.lineTo(0.16, L);
    ctx.lineTo(-0.16, L);
    ctx.lineTo(-0.2, L * 0.35);
    ctx.quadraticCurveTo(-0.22, -L + 0.02, 0, -L - 0.02);
    ctx.fill();
    // cabin
    ctx.fillStyle = '#f2a45a';
    ctx.beginPath(); ctx.moveTo(-0.12, -L + 0.18); ctx.lineTo(0.12, -L + 0.18); ctx.lineTo(0.13, L * 0.1); ctx.lineTo(-0.13, L * 0.1); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(-0.03, -L + 0.2, 0.06, 0.1);
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
    if (near.length) {
      nearbySub.textContent = near.length + ' available';
      nearbyHint.textContent = '';
      nearbyEl.innerHTML = '';
      for (const o of near) {
        const row = document.createElement('div');
        row.className = 'order';
        const d = dist(o.r.x + 0.5, o.r.y + 0.5, o.hm.x + 0.5, o.hm.y + 0.5);
        row.innerHTML = '<div><div class="who">House #' + o.hm.id + ' <small>\u00b7 ' + o.r.name + '</small></div>' +
          '<div class="dist">' + meters(d) + ' away \u00b7 +' + money(o.tip) + ' if fast</div></div>' +
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
    Object.assign(ST, { fare: 0, tip: 0, fine: 0, done: 0, bonus: 0, late: 0, expired: 0, streak: 0, bestStreak: 0 });
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
    if (!over && !paused) { drive(dt); updateTraffic(dt); }
    if (!over && !paused) update(dt);
    draw();
    render();
  }
  startShift();
  requestAnimationFrame(frame);
})();