/* Furrow — a small farming-village sim.
   Start with an empty plot. Lay out farms and paths, build houses,
   a storehouse, a bakery and a shop, and watch the villagers sow,
   harvest, carry, bake and sleep. No build step, no dependencies. */
(() => {
  'use strict';

  // ------------------------------------------------------------ constants
  const TILE = 32, COLS = 26, ROWS = 16;
  const ROAD_ROW = ROWS - 1;
  const CAMP = { x: 13, y: ROWS - 2 };
  const SAVE_KEY = 'furrow-save-v1';
  const START_COINS = 150;
  const GOAL = 1500;
  const WORK_START = 6, WORK_END = 19;
  const SEC_PER_HOUR_DAY = 4, SEC_PER_HOUR_NIGHT = 1.5;
  const CARRY_CAP = 6;
  const MAX_POP = 16;
  const BASE_SPEED = 2.4;          // tiles per second on grass at full energy
  const FARM_COST = 4, PATH_COST = 1;

  const CROPS = {
    carrot:  { name: 'Carrots',  grow: 20, yield: 2, price: 3,  food: true,  blurb: 'Quick and cheap. Feeds people.' },
    wheat:   { name: 'Wheat',    grow: 40, yield: 3, price: 2,  food: false, blurb: 'Worth little raw. A bakery turns 2 wheat into 3 bread.' },
    cabbage: { name: 'Cabbages', grow: 30, yield: 2, price: 5,  food: true,  blurb: 'Slower, but sells for more.' },
    pumpkin: { name: 'Pumpkins', grow: 60, yield: 1, price: 14, food: true,  blurb: 'Three days in the ground. Worth the wait.' },
  };
  const GOODS = {
    wheat:   { name: 'Wheat',    price: 2,  food: false, color: '#d9b64a' },
    bread:   { name: 'Bread',    price: 6,  food: true,  color: '#c58b4a' },
    carrot:  { name: 'Carrots',  price: 3,  food: true,  color: '#e8873a' },
    cabbage: { name: 'Cabbages', price: 5,  food: true,  color: '#7fbf6a' },
    pumpkin: { name: 'Pumpkins', price: 14, food: true,  color: '#e07a2a' },
  };
  const GOOD_ORDER = ['wheat', 'bread', 'carrot', 'cabbage', 'pumpkin'];

  const BUILDINGS = {
    house:  { name: 'House',      w: 2, h: 2, cost: 40, beds: 2, blurb: 'Two beds. Villagers who sleep in a bed wake up rested.' },
    store:  { name: 'Storehouse', w: 3, h: 2, cost: 50, blurb: 'Every harvest ends up here. Sell from it, or keep things for the bakery and the shop.' },
    bakery: { name: 'Bakery',     w: 2, h: 2, cost: 80, blurb: 'Turns 2 wheat into 3 bread. Bread sells for three times what wheat does.' },
    shop:   { name: 'Shop',       w: 2, h: 2, cost: 60, blurb: 'Villagers buy supper here every evening. No shop, no supper.' },
  };
  const BAKERY_CAP = 12, SHOP_CAP = 12;
  const SUPPER_PRICE = 2;
  // Jacking a building up and rolling it somewhere else costs a quarter of its price.
  const moveFee = (type) => Math.max(5, Math.round(BUILDINGS[type].cost / 4));

  const TOOLS = [
    { id: 'select',  label: 'Select',     hint: 'Click a villager, a building or a farm to see what it is up to.' },
    { id: 'farm',    label: 'Farm',       cost: `${FARM_COST}/tile`, hint: 'Drag across the grass to lay out a farm. Bigger farms take longer to work.' },
    { id: 'path',    label: 'Path',       cost: `${PATH_COST}/tile`, hint: 'Drag from one place to another. Villagers walk almost twice as fast on paths.' },
    { id: 'house',   label: 'House',      cost: BUILDINGS.house.cost, hint: 'Click on the grass to build. Two villagers can sleep here.' },
    { id: 'store',   label: 'Storehouse', cost: BUILDINGS.store.cost, hint: 'Click on the grass to build. You need one before anyone can harvest.' },
    { id: 'bakery',  label: 'Bakery',     cost: BUILDINGS.bakery.cost, hint: 'Click on the grass to build. Needs wheat in the storehouse.' },
    { id: 'shop',    label: 'Shop',       cost: BUILDINGS.shop.cost, hint: 'Click on the grass to build. Food is carried here from the storehouse.' },
    { id: 'demolish', label: 'Demolish',  hint: 'Click a building, farm or path tile to remove it. Half the cost comes back.' },
    { id: 'move', label: 'Move', hidden: true, hint: 'Click where the building should stand. Escape leaves it where it is.' },
  ];

  const NAMES = ['Ada', 'Bram', 'Cass', 'Dunstan', 'Elke', 'Fenn', 'Gwen', 'Hal', 'Ida', 'Jory', 'Kit', 'Lise', 'Mab', 'Ned', 'Orla', 'Pip', 'Quill', 'Rook', 'Sula', 'Tam', 'Una', 'Wren'];
  const SHIRTS = ['#d05a4f', '#4f8fd0', '#d0a34f', '#6fbf73', '#b26fd0', '#d07a4f', '#4fb9c9', '#c95f9c'];

  // ------------------------------------------------------------ state
  let S = null;           // saved game state
  const CLAIMS = {};      // task key -> villager id (transient)
  const UI = { tool: 'select', sel: null, drag: null, hover: null, speed: 1, panelKey: '', structure: 0, moving: null };

  const idx = (x, y) => y * COLS + x;
  const inb = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (a) => a[Math.floor(Math.random() * a.length)];
  const plural = (n, s) => `${n} ${s}${n === 1 ? '' : 's'}`;

  function newState() {
    const kind = new Array(COLS * ROWS).fill('g');
    for (let x = 0; x < COLS; x++) kind[idx(x, ROAD_ROW)] = 'r';
    kind[idx(CAMP.x, CAMP.y)] = 'c';
    const st = {
      day: 1, hour: WORK_START, coins: START_COINS, nextId: 1,
      kind, occ: new Array(COLS * ROWS).fill(0), plots: new Array(COLS * ROWS).fill(null),
      farms: [], buildings: [], villagers: [],
      store: { wheat: 0, bread: 0, carrot: 0, cabbage: 0, pumpkin: 0 },
      policy: { wheat: false, bread: false, carrot: false, cabbage: false, pumpkin: false },
      log: [], won: false, earned: 0,
      eatenToday: 0, hungerWarned: false,
    };
    S = st;
    for (let i = 0; i < 3; i++) addVillager(CAMP.x + (i - 1) * 0.6, CAMP.y - 0.4 + (i % 2) * 0.5);
    log('Three villagers have pitched camp by the road. They will sleep rough until there is a house.');
    return st;
  }

  function addVillager(px, py) {
    const used = new Set(S.villagers.map(v => v.name));
    const free = NAMES.filter(n => !used.has(n));
    const v = {
      id: S.nextId++, name: free.length ? rnd(free) : 'Villager', shirt: rnd(SHIRTS),
      px, py, energy: 80, hunger: 0, home: null, task: null, path: null, carry: null,
      sleeping: false, hidden: false, inBed: false, days: 0,
    };
    S.villagers.push(v);
    return v;
  }

  function log(text, kind) {
    S.log.unshift({ day: S.day, text, kind: kind || '' });
    if (S.log.length > 30) S.log.length = 30;
    UI.structure++;
  }

  // ------------------------------------------------------------ save/load
  function save() {
    if (!S) return;
    const copy = {
      ...S,
      villagers: S.villagers.map(v => ({ ...v, task: null, path: null, carry: null, hidden: false })),
    };
    // Goods being carried go back into the storehouse so nothing is lost.
    for (const v of S.villagers) if (v.carry) copy.store[v.carry.good] += v.carry.n;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(copy)); } catch (e) { /* ignore */ }
  }
  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const st = JSON.parse(raw);
      if (!st || !Array.isArray(st.kind) || st.kind.length !== COLS * ROWS) return false;
      S = st;
      if (typeof S.eatenToday !== 'number') S.eatenToday = 0;
      if (typeof S.hungerWarned !== 'boolean') S.hungerWarned = false;
      for (const v of S.villagers) { v.task = null; v.path = null; v.carry = null; v.hidden = false; v.sleeping = false; }
      return true;
    } catch (e) { return false; }
  }

  // ------------------------------------------------------------ helpers
  const isDay = () => S.hour >= WORK_START && S.hour < WORK_END;
  const eff = (v) => (0.35 + 0.65 * v.energy / 100) * (1 - 0.2 * v.hunger);
  const tileOf = (v) => ({ x: clamp(Math.floor(v.px), 0, COLS - 1), y: clamp(Math.floor(v.py), 0, ROWS - 1) });
  const walkable = (x, y) => inb(x, y) && !S.occ[idx(x, y)];
  function tileCost(x, y) {
    const k = S.kind[idx(x, y)];
    return (k === 'p' || k === 'r') ? 0.55 : k === 'f' ? 1.25 : 1;
  }
  const building = (id) => S.buildings.find(b => b.id === id) || null;
  const farmOf = (id) => S.farms.find(f => f.id === id) || null;
  const firstOf = (type) => S.buildings.find(b => b.type === type) || null;
  const freeBeds = () => S.buildings.filter(b => b.type === 'house').reduce((n, b) => n + (BUILDINGS.house.beds - b.residents.length), 0);
  const totalBeds = () => S.buildings.filter(b => b.type === 'house').length * BUILDINGS.house.beds;
  const shopStock = () => S.buildings.filter(b => b.type === 'shop').reduce((n, b) => n + b.stock, 0);

  function entrances(b) {
    const goals = new Set();
    for (let x = b.x - 1; x <= b.x + b.w; x++) for (let y = b.y - 1; y <= b.y + b.h; y++) {
      const inside = x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h;
      const corner = (x < b.x || x >= b.x + b.w) && (y < b.y || y >= b.y + b.h);
      if (!inside && !corner && walkable(x, y)) goals.add(idx(x, y));
    }
    return goals;
  }
  function nearestWalkable(x, y) {
    for (let r = 0; r < COLS; r++) {
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (walkable(x + dx, y + dy)) return { x: x + dx, y: y + dy };
      }
    }
    return { x, y };
  }

  // ------------------------------------------------------------ pathfinding
  function findPath(sx, sy, goals) {
    if (!goals || goals.size === 0) return null;
    const start = idx(sx, sy);
    if (goals.has(start)) return [];
    const N = COLS * ROWS;
    const dist = new Float64Array(N).fill(Infinity);
    const prev = new Int32Array(N).fill(-1);
    dist[start] = 0;
    const heap = [];
    const push = (d, n) => {
      heap.push([d, n]);
      let i = heap.length - 1;
      while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1; let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]]; i = m;
        }
      }
      return top;
    };
    push(0, start);
    while (heap.length) {
      const [d, u] = pop();
      if (d > dist[u]) continue;
      if (goals.has(u)) {
        const out = [];
        for (let c = u; c !== start; c = prev[c]) out.push({ x: c % COLS, y: Math.floor(c / COLS) });
        return out.reverse();
      }
      const ux = u % COLS, uy = Math.floor(u / COLS);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = ux + dx, ny = uy + dy;
        if (!walkable(nx, ny)) continue;
        const n = idx(nx, ny), nd = d + tileCost(nx, ny);
        if (nd < dist[n]) { dist[n] = nd; prev[n] = u; push(nd, n); }
      }
    }
    return null;
  }

  function walk(v, dt) {
    let left = dt;
    while (left > 0 && v.path.length) {
      const n = v.path[0], tx = n.x + 0.5, ty = n.y + 0.5;
      const dx = tx - v.px, dy = ty - v.py, d = Math.hypot(dx, dy);
      const sp = BASE_SPEED * (0.6 + 0.4 * eff(v)) / tileCost(n.x, n.y);
      const step = sp * left;
      if (dx) v.face = dx < 0 ? -1 : 1;
      if (step >= d) { v.px = tx; v.py = ty; v.path.shift(); left -= d / sp; }
      else { v.px += dx / d * step; v.py += dy / d * step; left = 0; }
    }
    v.walking = v.path.length > 0;
    return v.path.length === 0;
  }

  function moveStep(v, goals, dt) {
    if (!v.path) {
      const t = tileOf(v);
      const p = findPath(t.x, t.y, goals);
      if (!p) return 'blocked';
      v.path = p;
    }
    return walk(v, dt) ? 'arrived' : 'moving';
  }

  // ------------------------------------------------------------ tasks
  function claim(key, v) { CLAIMS[key] = v.id; }
  const claimed = (key) => CLAIMS[key] !== undefined;
  function release(task) { for (const k of task.keys || []) delete CLAIMS[k]; }
  function cancelTask(v) { if (v.task) release(v.task); v.task = null; v.path = null; v.working = false; }
  function startTask(v, task) { v.task = task; task.phase = 0; v.path = null; for (const k of task.keys || []) claim(k, v); }

  function pickTask(v) {
    const store = firstOf('store');
    const t = tileOf(v);
    const cands = [];
    const d = (x, y) => Math.abs(x - t.x) + Math.abs(y - t.y);
    for (const f of S.farms) {
      if (!f.crop) continue;
      for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) {
        const i = idx(x, y), p = S.plots[i];
        if (!p || claimed('plot:' + i)) continue;
        if (p.stage === 2 && store) cands.push({ score: d(x, y), task: { kind: 'harvest', plot: i, farm: f.id, keys: ['plot:' + i] } });
        else if (p.stage === 0) cands.push({ score: d(x, y) + 14, task: { kind: 'sow', plot: i, farm: f.id, keys: ['plot:' + i] } });
      }
    }
    if (store) {
      for (const b of S.buildings) {
        if (b.type === 'bakery') {
          if (!claimed('haul:' + b.id) && b.wheat <= BAKERY_CAP - 6 && S.store.wheat >= 2) {
            const n = Math.min(CARRY_CAP, BAKERY_CAP - b.wheat, S.store.wheat);
            cands.push({ score: d(store.x, store.y) + 8, task: { kind: 'haul', good: 'wheat', n, to: b.id, keys: ['haul:' + b.id] } });
          }
          if (!claimed('bake:' + b.id) && b.wheat >= 2) {
            cands.push({ score: d(b.x, b.y) + 4, task: { kind: 'bake', to: b.id, keys: ['bake:' + b.id] } });
          }
        } else if (b.type === 'shop') {
          // Nothing arrives at the shop by itself: someone has to walk it over.
          if (!claimed('stock:' + b.id) && b.stock < SHOP_CAP) {
            const good = cheapestFood();
            const n = good ? Math.min(CARRY_CAP, SHOP_CAP - b.stock, S.store[good]) : 0;
            const short = b.stock < S.villagers.length;   // not enough for tonight's supper
            if (n > 0 && (short || n >= 3)) {               // otherwise it is not worth the walk
              cands.push({ score: d(store.x, store.y) + (short ? -6 : 6), task: { kind: 'haul', good, n, to: b.id, keys: ['stock:' + b.id] } });
            }
          }
        }
      }
    }
    if (!cands.length) return null;
    cands.sort((a, b) => a.score - b.score);
    return cands[0].task;
  }
  function cheapestFood() {
    let best = null;
    for (const g of GOOD_ORDER) {
      if (!GOODS[g].food || S.store[g] <= 0) continue;
      if (!best || GOODS[g].price < GOODS[best].price) best = g;
    }
    return best;
  }

  function addCarry(v, good, n) {
    if (v.carry && v.carry.good === good) v.carry.n += n;
    else v.carry = { good, n };
  }
  function deposit(v) {
    if (!v.carry) return;
    S.store[v.carry.good] += v.carry.n;
    v.carry = null;
  }

  function runTask(v, dt) {
    const t = v.task;
    const store = firstOf('store');
    v.working = false;
    switch (t.kind) {
      case 'sow': {
        const p = S.plots[t.plot], f = farmOf(t.farm);
        if (!p || !f || !f.crop || p.stage !== 0) return cancelTask(v);
        if (t.phase === 0) {
          const r = moveStep(v, new Set([t.plot]), dt);
          if (r === 'blocked') return cancelTask(v);
          if (r === 'arrived') { t.phase = 1; t.timer = 1.4 / eff(v); }
        } else {
          v.working = true;
          t.timer -= dt;
          if (t.timer <= 0) { p.stage = 1; p.growth = 0; p.crop = f.crop; cancelTask(v); }
        }
        break;
      }
      case 'harvest': {
        if (t.phase === 0) {
          const p = S.plots[t.plot];
          if (!p || p.stage !== 2) { t.phase = 2; v.path = null; break; }
          const r = moveStep(v, new Set([t.plot]), dt);
          if (r === 'blocked') { t.phase = 2; v.path = null; break; }
          if (r === 'arrived') { t.phase = 1; t.timer = 1.8 / eff(v); }
        } else if (t.phase === 1) {
          v.working = true;
          t.timer -= dt;
          if (t.timer <= 0) {
            const p = S.plots[t.plot];
            if (p && p.stage === 2) {
              let n = CROPS[p.crop].yield;
              // A villager who missed supper eats in the field. Nobody starves here;
              // the cost of a hungry village is a harvest that never reaches the store.
              if (v.hunger > 0 && CROPS[p.crop].food && n > 0) {
                n--; v.hunger--; S.eatenToday++;
                float(t.plot % COLS + 0.5, Math.floor(t.plot / COLS), '-1', '#e9c46a');
              }
              if (n > 0) addCarry(v, p.crop, n);
              p.stage = 0; p.growth = 0;
            }
            delete CLAIMS['plot:' + t.plot];
            t.keys = [];
            const next = nextRipe(v, t.farm);
            const room = !v.carry || v.carry.n + CROPS[v.carry.good].yield <= CARRY_CAP;
            if (next !== null && room) {
              t.plot = next; t.keys = ['plot:' + next]; claim('plot:' + next, v); t.phase = 0; v.path = null;
            } else { t.phase = 2; v.path = null; }
          }
        } else {
          if (!v.carry) return cancelTask(v);
          if (!store) { v.carry = null; return cancelTask(v); }
          const r = moveStep(v, entrances(store), dt);
          if (r === 'blocked') return cancelTask(v);
          if (r === 'arrived') { deposit(v); cancelTask(v); }
        }
        break;
      }
      case 'haul': {
        const b = building(t.to);
        if (t.phase === 0) {
          if (!store || !b) return cancelTask(v);
          const r = moveStep(v, entrances(store), dt);
          if (r === 'blocked') return cancelTask(v);
          if (r === 'arrived') {
            const take = Math.min(t.n, S.store[t.good]);
            if (take <= 0) return cancelTask(v);
            S.store[t.good] -= take; v.carry = { good: t.good, n: take };
            t.phase = 1; v.path = null;
          }
        } else if (t.phase === 1) {
          if (!b) { t.phase = 2; v.path = null; break; }
          const r = moveStep(v, entrances(b), dt);
          if (r === 'blocked') { t.phase = 2; v.path = null; break; }
          if (r === 'arrived') {
            if (b.type === 'bakery') b.wheat += v.carry.n;
            else if (b.type === 'shop') { b.stock += v.carry.n; float(b.x + b.w / 2, b.y, '+' + v.carry.n, '#7fc28a'); }
            v.carry = null;
            cancelTask(v);
          }
        } else {
          if (!store || !v.carry) { v.carry = null; return cancelTask(v); }
          const r = moveStep(v, entrances(store), dt);
          if (r === 'blocked') { v.carry = null; return cancelTask(v); }
          if (r === 'arrived') { deposit(v); cancelTask(v); }
        }
        break;
      }
      case 'bake': {
        const b = building(t.to);
        if (t.phase === 0) {
          if (!b || b.wheat < 2) return cancelTask(v);
          const r = moveStep(v, entrances(b), dt);
          if (r === 'blocked') return cancelTask(v);
          if (r === 'arrived') { t.phase = 1; t.timer = 2.4 / eff(v); }
        } else if (t.phase === 1) {
          if (!b) { t.phase = 2; v.path = null; break; }
          v.working = true;
          t.timer -= dt;
          if (t.timer <= 0) {
            if (b.wheat >= 2) { b.wheat -= 2; addCarry(v, 'bread', 3); b.baked = (b.baked || 0) + 3; }
            if (b.wheat >= 2 && v.carry.n + 3 <= CARRY_CAP && isDay()) t.timer = 2.4 / eff(v);
            else { t.phase = 2; v.path = null; }
          }
        } else {
          if (!v.carry) return cancelTask(v);
          if (!store) { v.carry = null; return cancelTask(v); }
          const r = moveStep(v, entrances(store), dt);
          if (r === 'blocked') { v.carry = null; return cancelTask(v); }
          if (r === 'arrived') { deposit(v); cancelTask(v); }
        }
        break;
      }
      case 'sleep': {
        const home = v.home ? building(v.home) : null;
        const goals = home ? entrances(home) : new Set([idx(CAMP.x, CAMP.y)]);
        const r = moveStep(v, goals, dt);
        if (r !== 'moving') {
          v.sleeping = true; v.inBed = !!home && r === 'arrived'; v.hidden = v.inBed;
          cancelTask(v);
        }
        break;
      }
      default: cancelTask(v);
    }
  }

  function nextRipe(v, farmId) {
    const f = farmOf(farmId);
    if (!f) return null;
    const t = tileOf(v);
    let best = null, bd = Infinity;
    for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) {
      const i = idx(x, y), p = S.plots[i];
      if (!p || p.stage !== 2 || claimed('plot:' + i)) continue;
      const d = Math.abs(x - t.x) + Math.abs(y - t.y);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  function taskLabel(v) {
    if (v.sleeping) return v.inBed ? 'Asleep at home' : 'Sleeping rough by the fire';
    const t = v.task;
    if (!t) return isDay() ? 'Looking for something to do' : 'Heading to bed';
    const f = t.farm ? farmOf(t.farm) : null;
    const cropName = f && f.crop ? CROPS[f.crop].name.toLowerCase() : 'crops';
    switch (t.kind) {
      case 'sow': return t.phase ? `Sowing ${cropName}` : `Walking to the farm to sow ${cropName}`;
      case 'harvest': return t.phase === 2 ? `Carrying ${v.carry ? v.carry.n + ' ' + GOODS[v.carry.good].name.toLowerCase() : 'the harvest'} to the storehouse` : t.phase ? `Harvesting ${cropName}` : 'Walking to the farm to harvest';
      case 'haul': { const b = building(t.to); const dest = b ? BUILDINGS[b.type].name.toLowerCase() : 'somewhere'; return t.phase === 0 ? `Fetching ${GOODS[t.good].name.toLowerCase()} for the ${dest}` : `Carrying ${GOODS[t.good].name.toLowerCase()} to the ${dest}`; }
      case 'bake': return t.phase === 2 ? 'Carrying bread to the storehouse' : t.phase ? 'Baking' : 'Walking to the bakery';
      case 'sleep': return 'Heading to bed';
    }
    return '';
  }

  // ------------------------------------------------------------ simulation
  function tick(dt) {
    const wasDay = isDay();
    const spd = 1 / (wasDay ? SEC_PER_HOUR_DAY : SEC_PER_HOUR_NIGHT);
    const dh = dt * spd;
    const prev = S.hour;
    S.hour += dh;
    if (prev < WORK_END && S.hour >= WORK_END) evening();
    let wrapped = false;
    if (S.hour >= 24) { S.hour -= 24; wrapped = true; }
    if ((prev < WORK_START || wrapped) && S.hour >= WORK_START) morning();

    for (const p of S.plots) {
      if (p && p.stage === 1) { p.growth += dh / CROPS[p.crop].grow; if (p.growth >= 1) { p.growth = 1; p.stage = 2; } }
    }
    for (const v of S.villagers) updateVillager(v, dt);
  }

  function updateVillager(v, dt) {
    const day = isDay();
    if (v.sleeping) {
      if (!day) return;
      v.sleeping = false; v.hidden = false; v.inBed = false;   // safety net; morning() normally does this
    }
    if (!day) {
      if (v.task && v.task.kind !== 'sleep' && !v.carry) cancelTask(v);
      if (!v.task) startTask(v, { kind: 'sleep', keys: [] });
    } else if (!v.task) {
      const t = pickTask(v);
      if (t) startTask(v, t);
      else v.walking = false;
    }
    if (v.task) {
      runTask(v, dt);
      if (day) v.energy = Math.max(0, v.energy - 1.15 * dt);
    }
  }

  function evening() {
    // Supper from the shop, one unit each, paid for.
    const shops = S.buildings.filter(b => b.type === 'shop');
    const sales = new Map();
    let fed = 0, unfed = 0;
    for (const v of S.villagers) {
      const shop = shops.find(b => b.stock > 0);
      if (shop) {
        shop.stock--; shop.sold = (shop.sold || 0) + 1; S.coins += SUPPER_PRICE; S.earned += SUPPER_PRICE; v.hunger = 0; fed++;
        sales.set(shop, (sales.get(shop) || 0) + 1);
      } else { v.hunger = Math.min(3, v.hunger + 1); unfed++; }
    }
    for (const [shop, n] of sales) float(shop.x + shop.w / 2, shop.y, `+${n * SUPPER_PRICE}c`, '#e0a458');
    if (unfed) {
      log(shops.length ? `${plural(unfed, 'villager')} went without supper. The shop had nothing left.` : `${plural(unfed, 'villager')} went without supper. There is no shop.`, 'bad');
      if (!S.hungerWarned) {
        S.hungerWarned = true;
        log('Nobody starves in Furrow. A hungry villager just works slowly and eats what they pick, so the harvest never reaches the storehouse.', 'warn');
      }
    } else if (fed) log(`Everyone bought supper at the shop (+${fed * SUPPER_PRICE} coins).`, 'good');
    // Auto-sell.
    for (const g of GOOD_ORDER) {
      if (S.policy[g] && S.store[g] > 0) {
        const n = S.store[g], c = n * GOODS[g].price;
        S.store[g] = 0; S.coins += c; S.earned += c;
        log(`The cart took ${n} ${GOODS[g].name.toLowerCase()} for ${c} coins.`, 'good');
      }
    }
    save();
  }

  function morning() {
    S.day++;
    if (S.eatenToday) {
      log(`Hungry villagers ate ${S.eatenToday} of yesterday's harvest in the field rather than wait for supper.`, 'warn');
      S.eatenToday = 0;
    }
    let rough = 0;
    for (const v of S.villagers) {
      // A bed restores most of the night's rest; anyone else (by the fire, or
      // still trudging home at dawn) gets a poor night's worth.
      v.energy = Math.min(100, v.energy + (v.inBed ? 75 : 30));
      if (!v.inBed) rough++;
      if (v.task && v.task.kind === 'sleep') cancelTask(v);
      v.sleeping = false; v.hidden = false; v.days++;
      if (v.inBed) { const h = building(v.home); if (h) { const g = nearestWalkable(h.x, h.y + h.h); v.px = g.x + 0.5; v.py = g.y + 0.5; } }
      v.inBed = false;
    }
    if (rough) log(`${plural(rough, 'villager')} slept rough. They will be slow today.`, 'warn');
    assignHomes();
    const shopFood = shopStock();
    if (S.villagers.length < MAX_POP && freeBeds() > 0 && shopFood >= S.villagers.length && Math.random() < 0.65) {
      const v = addVillager(CAMP.x + 0.5, ROAD_ROW + 0.5);
      log(`${v.name} walked in along the road looking for work. There was a bed, and food in the shop.`, 'good');
      assignHomes();
    } else if (S.villagers.length < MAX_POP && S.day % 3 === 0) {
      if (freeBeds() <= 0) log('Nobody new will settle here without a spare bed.');
      else if (shopFood < S.villagers.length) log('Nobody new will settle here while the shop is bare.');
    }
    if (!S.won && S.coins >= GOAL) { S.won = true; showWin(); }
    save();
  }

  function assignHomes() {
    for (const v of S.villagers) {
      if (v.home && !building(v.home)) v.home = null;
      if (v.home) continue;
      const h = S.buildings.find(b => b.type === 'house' && b.residents.length < BUILDINGS.house.beds);
      if (h) { h.residents.push(v.id); v.home = h.id; }
    }
  }

  // ------------------------------------------------------------ building
  function rectFree(x, y, w, h, ignore) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
      if (!inb(i, j) || S.kind[idx(i, j)] !== 'g') return false;
      const o = S.occ[idx(i, j)];
      if (o && o !== ignore) return false;
    }
    return true;
  }
  function spend(n) {
    if (S.coins < n) { setHint(`That costs ${n} coins and you have ${S.coins}.`, true); return false; }
    S.coins -= n; return true;
  }

  function placeBuilding(type, x, y) {
    const def = BUILDINGS[type];
    if (!rectFree(x, y, def.w, def.h)) { setHint('That needs clear grass.', true); return false; }
    if (!spend(def.cost)) return false;
    const b = { id: S.nextId++, type, x, y, w: def.w, h: def.h };
    if (type === 'house') b.residents = [];
    if (type === 'bakery') { b.wheat = 0; b.baked = 0; }
    if (type === 'shop') { b.stock = 0; b.sold = 0; }
    S.buildings.push(b);
    for (let j = y; j < y + def.h; j++) for (let i = x; i < x + def.w; i++) S.occ[idx(i, j)] = b.id;
    for (const v of S.villagers) {
      const t = tileOf(v);
      if (S.occ[idx(t.x, t.y)]) { const g = nearestWalkable(t.x, t.y); v.px = g.x + 0.5; v.py = g.y + 0.5; v.path = null; }
      else v.path = null;
    }
    if (type === 'house') { assignHomes(); log(`A house went up. ${freeBeds() ? plural(freeBeds(), 'bed') + ' free.' : 'Every bed is taken.'}`); }
    if (type === 'store') log('The storehouse is up. Harvests can be brought in now.');
    if (type === 'bakery') log('The bakery is built. It will take wheat from the storehouse.');
    if (type === 'shop') log('The shop is open. Food will be carried over from the storehouse.');
    UI.sel = { kind: 'building', id: b.id };
    UI.structure++; groundDirty = true;
    return true;
  }

  function moveBuilding(id, x, y) {
    const b = building(id);
    if (!b) { setTool('select'); return false; }
    const def = BUILDINGS[b.type];
    if (x === b.x && y === b.y) { setHint('It is already standing there.'); return false; }
    if (!rectFree(x, y, def.w, def.h, b.id)) { setHint(`The ${def.name.toLowerCase()} needs clear grass to stand on.`, true); return false; }
    const fee = moveFee(b.type);
    if (!spend(fee)) return false;
    for (let j = b.y; j < b.y + b.h; j++) for (let i = b.x; i < b.x + b.w; i++) S.occ[idx(i, j)] = 0;
    b.x = x; b.y = y;
    for (let j = y; j < y + def.h; j++) for (let i = x; i < x + def.w; i++) S.occ[idx(i, j)] = b.id;
    // Anyone standing where it now sits steps aside, and everyone re-plans their walk.
    for (const v of S.villagers) {
      const t = tileOf(v);
      if (S.occ[idx(t.x, t.y)]) { const g = nearestWalkable(t.x, t.y); v.px = g.x + 0.5; v.py = g.y + 0.5; }
      v.path = null;
    }
    log(`The ${def.name.toLowerCase()} was jacked up and rolled to a new spot for ${fee} coins.`);
    UI.sel = { kind: 'building', id: b.id };
    UI.structure++; groundDirty = true;
    setTool('select');
    return true;
  }

  function placeFarm(x0, y0, x1, y1) {
    const x = Math.min(x0, x1), y = Math.min(y0, y1), w = Math.abs(x1 - x0) + 1, h = Math.abs(y1 - y0) + 1;
    if (!rectFree(x, y, w, h)) { setHint('Farms need clear grass.', true); return false; }
    if (!spend(w * h * FARM_COST)) return false;
    const f = { id: S.nextId++, x, y, w, h, crop: 'carrot' };
    S.farms.push(f);
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) { S.kind[idx(i, j)] = 'f'; S.plots[idx(i, j)] = { farm: f.id, stage: 0, growth: 0, crop: null }; }
    UI.sel = { kind: 'farm', id: f.id };
    UI.structure++; groundDirty = true;
    setHint('Pick a crop for the farm in the panel on the right.');
    return true;
  }

  function pathTiles(x0, y0, x1, y1) {
    const out = [];
    const sx = Math.sign(x1 - x0), sy = Math.sign(y1 - y0);
    for (let x = x0; x !== x1 + sx; x += sx || 1) { out.push({ x, y: y0 }); if (!sx) break; }
    for (let y = y0 + (sy || 1); sy && y !== y1 + sy; y += sy) out.push({ x: x1, y });
    return out.filter(t => inb(t.x, t.y));
  }
  function placePath(x0, y0, x1, y1) {
    const tiles = pathTiles(x0, y0, x1, y1).filter(t => S.kind[idx(t.x, t.y)] === 'g' && !S.occ[idx(t.x, t.y)]);
    if (!tiles.length) return false;
    if (!spend(tiles.length * PATH_COST)) return false;
    for (const t of tiles) S.kind[idx(t.x, t.y)] = 'p';
    for (const v of S.villagers) v.path = null;
    UI.structure++; groundDirty = true;
    return true;
  }

  function demolishAt(x, y) {
    const i = idx(x, y);
    const bid = S.occ[i];
    if (bid) {
      const b = building(bid);
      S.buildings = S.buildings.filter(o => o.id !== bid);
      for (let j = b.y; j < b.y + b.h; j++) for (let k = b.x; k < b.x + b.w; k++) S.occ[idx(k, j)] = 0;
      if (b.type === 'house') for (const v of S.villagers) if (v.home === bid) v.home = null;
      if (b.type === 'bakery' && b.wheat) S.store.wheat += b.wheat;
      if (b.type === 'shop' && b.stock) S.store.carrot += 0; // supper stock is spent; nothing comes back
      if (b.type === 'store') for (const g of GOOD_ORDER) S.store[g] = 0;
      S.coins += Math.floor(BUILDINGS[b.type].cost / 2);
      for (const v of S.villagers) { if (v.task && v.task.kind !== 'sleep') cancelTask(v); v.path = null; }
      log(`The ${BUILDINGS[b.type].name.toLowerCase()} was pulled down.`);
      UI.sel = null; UI.structure++; groundDirty = true;
      return true;
    }
    const k = S.kind[i];
    if (k === 'f') {
      const f = farmOf(S.plots[i].farm);
      S.farms = S.farms.filter(o => o.id !== f.id);
      for (let j = f.y; j < f.y + f.h; j++) for (let x2 = f.x; x2 < f.x + f.w; x2++) { S.kind[idx(x2, j)] = 'g'; S.plots[idx(x2, j)] = null; }
      S.coins += Math.floor(f.w * f.h * FARM_COST / 2);
      for (const v of S.villagers) if (v.task && (v.task.kind === 'sow' || (v.task.kind === 'harvest' && v.task.phase < 2))) cancelTask(v);
      UI.sel = null; UI.structure++; groundDirty = true;
      return true;
    }
    if (k === 'p') {
      S.kind[i] = 'g';
      for (const v of S.villagers) v.path = null;
      UI.structure++; groundDirty = true;
      return true;
    }
    return false;
  }

  function sell(good, n) {
    const take = n === 'all' ? S.store[good] : Math.min(n, S.store[good]);
    if (take <= 0) return;
    const c = take * GOODS[good].price;
    S.store[good] -= take; S.coins += c; S.earned += c;
    log(`Sold ${take} ${GOODS[good].name.toLowerCase()} for ${c} coins.`, 'good');
    if (!S.won && S.coins >= GOAL) { S.won = true; showWin(); }
  }

  // ------------------------------------------------------------ drawing
  const canvas = document.getElementById('map');
  const ctx = canvas.getContext('2d');
  const ground = document.createElement('canvas');
  ground.width = COLS * TILE; ground.height = ROWS * TILE;
  const gctx = ground.getContext('2d');
  let groundDirty = true;
  let clockT = 0;
  const FLOATS = [];
  const FLOAT_LIFE = 1.6;
  function float(x, y, text, color) { FLOATS.push({ x, y, text, color, born: clockT }); }
  function drawFloats() {
    const c = ctx;
    c.font = 'bold 11px sans-serif'; c.textAlign = 'center';
    for (let i = FLOATS.length - 1; i >= 0; i--) {
      const f = FLOATS[i], age = (clockT - f.born) / FLOAT_LIFE;
      if (age >= 1 || age < 0) { FLOATS.splice(i, 1); continue; }
      const x = f.x * TILE, y = f.y * TILE - 6 - age * 18;
      c.globalAlpha = 1 - age * age;
      c.strokeStyle = 'rgba(0,0,0,0.7)'; c.lineWidth = 3; c.strokeText(f.text, x, y);
      c.fillStyle = f.color; c.fillText(f.text, x, y);
      c.globalAlpha = 1;
    }
    c.textAlign = 'left';
  }

  // Fixed per-tile noise so tufts and stones do not flicker.
  const NOISE = [];
  {
    let seed = 1234;
    const r = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let i = 0; i < COLS * ROWS; i++) NOISE.push([r(), r(), r(), r(), r(), r()]);
  }

  function drawGround() {
    const g = gctx;
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const i = idx(x, y), k = S.kind[i], n = NOISE[i];
      const px = x * TILE, py = y * TILE;
      if (k === 'g' || k === 'c') {
        g.fillStyle = n[0] < 0.5 ? '#5f9a4d' : '#609c4f';
        g.fillRect(px, py, TILE, TILE);
        g.fillStyle = '#4f8a40';
        for (let t = 0; t < 3; t++) {
          const tx = px + 4 + n[t] * 22, ty = py + 6 + n[(t + 2) % 6] * 20;
          g.fillRect(tx, ty, 2, 4); g.fillRect(tx + 3, ty - 2, 2, 5);
        }
      } else if (k === 'p' || k === 'r') {
        g.fillStyle = k === 'r' ? '#a8865a' : '#c3a06d';
        g.fillRect(px, py, TILE, TILE);
        g.fillStyle = 'rgba(0,0,0,0.08)';
        g.fillRect(px + 6 + n[0] * 14, py + 8 + n[1] * 14, 4, 3);
        g.fillRect(px + 4 + n[2] * 16, py + 4 + n[3] * 18, 3, 2);
        // soften edges against grass
        g.fillStyle = '#5f9a4d';
        const nb = (dx, dy) => { const kk = inb(x + dx, y + dy) ? S.kind[idx(x + dx, y + dy)] : 'r'; return kk === 'p' || kk === 'r'; };
        if (!nb(0, -1)) g.fillRect(px, py, TILE, 2);
        if (!nb(0, 1)) g.fillRect(px, py + TILE - 2, TILE, 2);
        if (!nb(-1, 0)) g.fillRect(px, py, 2, TILE);
        if (!nb(1, 0)) g.fillRect(px + TILE - 2, py, 2, TILE);
      } else if (k === 'f') {
        g.fillStyle = '#6b4a2e';
        g.fillRect(px, py, TILE, TILE);
        g.fillStyle = '#5a3d25';
        for (let r = 0; r < 4; r++) g.fillRect(px, py + 3 + r * 8, TILE, 3);
        g.fillStyle = '#7a5636';
        g.fillRect(px + 8 + n[0] * 10, py + 10 + n[1] * 12, 3, 2);
      }
      if (k === 'c') {
        // campfire ring
        g.fillStyle = '#6a6a6a';
        for (let a = 0; a < 8; a++) { const ang = a / 8 * Math.PI * 2; g.fillRect(px + 16 + Math.cos(ang) * 9 - 2, py + 18 + Math.sin(ang) * 6 - 2, 4, 4); }
      }
    }
    // farm borders
    for (const f of S.farms) {
      g.strokeStyle = '#8b6b3e'; g.lineWidth = 2;
      g.strokeRect(f.x * TILE + 1, f.y * TILE + 1, f.w * TILE - 2, f.h * TILE - 2);
    }
    groundDirty = false;
  }

  function drawCrop(x, y, p) {
    const px = x * TILE, py = y * TILE, n = NOISE[idx(x, y)];
    const stage = p.stage === 2 ? 3 : p.growth < 0.33 ? 0 : p.growth < 0.7 ? 1 : 2;
    const c = ctx;
    for (let r = 0; r < 3; r++) for (let q = 0; q < 3; q++) {
      const cx = px + 6 + q * 10 + (n[(r + q) % 6] - 0.5) * 3, cy = py + 8 + r * 9;
      switch (p.crop) {
        case 'wheat': {
          const h = [3, 7, 11, 13][stage];
          c.fillStyle = stage === 3 ? '#e2c04a' : stage === 2 ? '#b8c24a' : '#7fbf5a';
          c.fillRect(cx, cy - h + 4, 2, h);
          if (stage >= 2) { c.fillStyle = '#e8cf6a'; c.fillRect(cx - 1, cy - h + 3, 4, 4); }
          break;
        }
        case 'carrot': {
          c.fillStyle = '#4f9a3d';
          const s = [2, 4, 5, 6][stage];
          c.fillRect(cx - 1, cy - s + 2, 2, s + 2); c.fillRect(cx - 3, cy - s + 4, 2, s); c.fillRect(cx + 2, cy - s + 4, 2, s);
          if (stage === 3) { c.fillStyle = '#e8873a'; c.fillRect(cx - 2, cy + 3, 5, 3); }
          break;
        }
        case 'cabbage': {
          const rr = [1.5, 2.5, 3.5, 4.5][stage];
          c.fillStyle = stage === 3 ? '#8fd07a' : '#6fae5c';
          c.beginPath(); c.arc(cx + 1, cy + 2, rr, 0, Math.PI * 2); c.fill();
          if (stage >= 2) { c.fillStyle = '#c6ec9a'; c.beginPath(); c.arc(cx, cy + 1, rr * 0.45, 0, Math.PI * 2); c.fill(); }
          break;
        }
        case 'pumpkin': {
          c.fillStyle = '#4f9a3d';
          c.fillRect(cx - 3, cy + 2, 8, 2);
          if (stage >= 1) { c.fillRect(cx - 1, cy - 1, 2, 4); }
          if (stage >= 2) { c.fillStyle = stage === 3 ? '#e07a2a' : '#9ab84a'; const rr = stage === 3 ? 4.5 : 3; c.beginPath(); c.arc(cx + 1, cy + 1, rr, 0, Math.PI * 2); c.fill(); }
          if (stage === 3) { c.fillStyle = '#5a3d25'; c.fillRect(cx, cy - 4, 2, 2); }
          break;
        }
      }
    }
  }

  function drawBuilding(b, night) {
    const c = ctx;
    const px = b.x * TILE, py = b.y * TILE, w = b.w * TILE, h = b.h * TILE;
    const roofH = Math.round(h * 0.42);
    const wallY = py + roofH;
    const wallH = h - roofH;
    const sel = UI.sel && UI.sel.kind === 'building' && UI.sel.id === b.id;
    // shadow
    c.fillStyle = 'rgba(0,0,0,0.18)';
    c.fillRect(px + 3, py + h - 4, w, 6);
    const styles = {
      house:  { wall: '#e9dcc0', roof: '#a5513f', trim: '#6b4a2e' },
      store:  { wall: '#8a5f3a', roof: '#5b5f66', trim: '#4a3320' },
      bakery: { wall: '#e6c9a0', roof: '#7a4a3a', trim: '#5a3d25' },
      shop:   { wall: '#d8d0c0', roof: '#3f6d8a', trim: '#2b4a5e' },
    }[b.type];
    // wall
    c.fillStyle = styles.wall;
    c.fillRect(px + 2, wallY, w - 4, wallH - 2);
    c.fillStyle = styles.trim;
    c.fillRect(px + 2, wallY, w - 4, 2);
    // roof
    c.fillStyle = styles.roof;
    c.beginPath();
    c.moveTo(px - 2, wallY + 1);
    c.lineTo(px + w / 2, py + 2);
    c.lineTo(px + w + 2, wallY + 1);
    c.closePath(); c.fill();
    c.fillStyle = 'rgba(0,0,0,0.12)';
    for (let r = 1; r < 4; r++) { const t = r / 4; c.fillRect(px - 2 + (w / 2 + 2) * t, py + 2 + (wallY - py - 1) * (1 - t) + 4, (w + 4) * (1 - t), 2); }
    // door
    const dx = px + w / 2 - 6, dy = py + h - 16;
    c.fillStyle = styles.trim;
    c.fillRect(dx, dy, 12, 14);
    // type details
    const lit = night ? '#ffd76a' : '#9bc2d8';
    if (b.type === 'house') {
      c.fillStyle = lit; c.fillRect(px + 8, wallY + 8, 8, 8); c.fillRect(px + w - 16, wallY + 8, 8, 8);
      c.fillStyle = '#4a3320'; c.fillRect(px + w - 14, py + 2, 6, 14);
      if (b.residents && b.residents.length) drawSmoke(px + w - 11, py + 2);
    } else if (b.type === 'store') {
      c.fillStyle = '#4a3320';
      c.fillRect(px + 8, wallY + 6, 3, wallH - 12); c.fillRect(px + w - 11, wallY + 6, 3, wallH - 12);
      c.fillStyle = '#c9a15c'; c.fillRect(px + w / 2 - 14, dy - 1, 28, 2);
      c.fillStyle = styles.trim; c.fillRect(dx - 8, dy, 28, 14);
      c.fillStyle = '#6b4a2e'; c.fillRect(dx + 5, dy, 2, 14);
      // crates showing stock
      let tot = 0; for (const g of GOOD_ORDER) tot += S.store[g];
      const crates = Math.min(4, Math.ceil(tot / 12));
      for (let i = 0; i < crates; i++) { c.fillStyle = '#b07a3a'; c.fillRect(px + 6 + i * 9, py + h - 8, 7, 6); c.fillStyle = '#7a5636'; c.fillRect(px + 6 + i * 9, py + h - 8, 7, 1); }
    } else if (b.type === 'bakery') {
      c.fillStyle = '#4a3320'; c.fillRect(px + 8, py + 4, 8, 16);
      c.fillStyle = lit; c.fillRect(px + w - 20, wallY + 8, 12, 8);
      c.fillStyle = '#c58b4a'; c.fillRect(px + w - 18, wallY + 10, 8, 4);
      if (S.villagers.some(v => v.task && v.task.kind === 'bake' && v.task.phase === 1 && v.task.to === b.id)) drawSmoke(px + 12, py + 2);
    } else if (b.type === 'shop') {
      // striped awning
      for (let i = 0; i < w - 4; i += 8) { c.fillStyle = i % 16 ? '#f0ece4' : '#c9503f'; c.fillRect(px + 2 + i, wallY + 2, Math.min(8, w - 4 - i), 8); }
      c.fillStyle = lit; c.fillRect(px + 6, wallY + 14, 14, 10);
      // goods in the window
      const s = b.stock;
      for (let i = 0; i < Math.min(4, Math.ceil(s / 3)); i++) { c.fillStyle = ['#e8873a', '#c58b4a', '#7fbf6a', '#e07a2a'][i]; c.fillRect(px + 8 + i * 3, wallY + 18, 2, 4); }
    }
    if (sel) { c.strokeStyle = '#fff'; c.lineWidth = 2; c.setLineDash([4, 3]); c.strokeRect(px + 1, py + 1, w - 2, h - 2); c.setLineDash([]); }
  }

  function drawSmoke(x, y) {
    const c = ctx;
    for (let i = 0; i < 3; i++) {
      const t = ((clockT * 0.4) + i * 0.33) % 1;
      c.fillStyle = `rgba(230,230,230,${0.5 * (1 - t)})`;
      c.beginPath(); c.arc(x + Math.sin((t + i) * 6) * 3, y - t * 14, 2 + t * 3, 0, Math.PI * 2); c.fill();
    }
  }

  function drawVillager(v) {
    if (v.hidden) return;
    const c = ctx;
    const x = v.px * TILE, y = v.py * TILE;
    const bob = v.walking ? Math.sin(clockT * 14 + v.id) * 1.5 : v.working ? Math.abs(Math.sin(clockT * 8 + v.id)) * 2 : 0;
    const sel = UI.sel && UI.sel.kind === 'villager' && UI.sel.id === v.id;
    c.fillStyle = 'rgba(0,0,0,0.22)';
    c.beginPath(); c.ellipse(x, y + 6, 6, 3, 0, 0, Math.PI * 2); c.fill();
    if (sel) { c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.arc(x, y - 2, 12, 0, Math.PI * 2); c.stroke(); }
    // legs
    c.fillStyle = '#3a2c22';
    c.fillRect(x - 4, y - 1 - bob, 3, 6); c.fillRect(x + 1, y - 1 - bob, 3, 6);
    // body
    c.fillStyle = v.shirt;
    c.fillRect(x - 5, y - 9 - bob, 10, 9);
    // head
    c.fillStyle = '#f0c9a2';
    c.beginPath(); c.arc(x, y - 13 - bob, 4.5, 0, Math.PI * 2); c.fill();
    c.fillStyle = v.id % 3 === 0 ? '#3a2c22' : v.id % 3 === 1 ? '#8a5a2a' : '#d8b04a';
    c.fillRect(x - 4.5, y - 17.5 - bob, 9, 3);
    // tired / hungry markers
    if (v.energy < 30) { c.fillStyle = '#e06c5f'; c.font = 'bold 9px sans-serif'; c.fillText('z', x + 5, y - 17 - bob); }
    if (v.hunger > 0) { c.fillStyle = '#e9c46a'; c.beginPath(); c.arc(x - 7, y - 16 - bob, 2, 0, Math.PI * 2); c.fill(); }
    // carried goods
    if (v.carry) {
      c.fillStyle = GOODS[v.carry.good].color;
      c.fillRect(x - 5, y - 26 - bob, 10, 7);
      c.fillStyle = '#1b1f24'; c.font = 'bold 7px sans-serif'; c.textAlign = 'center';
      c.fillText(String(v.carry.n), x, y - 20 - bob); c.textAlign = 'left';
    }
    if (v.sleeping && !v.hidden) { c.fillStyle = '#e9e4d8'; c.font = 'bold 10px Georgia'; c.fillText('z', x + 6, y - 20); }
    if (sel) {
      c.fillStyle = '#e9e4d8'; c.font = 'bold 10px Georgia'; c.textAlign = 'center';
      c.strokeStyle = 'rgba(0,0,0,0.7)'; c.lineWidth = 3; c.strokeText(v.name, x, y + 16); c.fillText(v.name, x, y + 16); c.textAlign = 'left';
    }
  }

  function nightAlpha() {
    const h = S.hour;
    if (h >= 20 || h < 5) return 0.5;
    if (h >= 17 && h < 20) return (h - 17) / 3 * 0.5;
    if (h >= 5 && h < 7) return 0.5 * (1 - (h - 5) / 2);
    return 0;
  }

  function draw() {
    if (groundDirty) drawGround();
    const c = ctx;
    c.clearRect(0, 0, canvas.width, canvas.height);
    c.drawImage(ground, 0, 0);
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) { const p = S.plots[idx(x, y)]; if (p && p.stage > 0) drawCrop(x, y, p); }
    // campfire
    if (!isDay()) {
      const fx = CAMP.x * TILE + 16, fy = CAMP.y * TILE + 18;
      const fl = 1 + Math.sin(clockT * 12) * 0.2;
      c.fillStyle = '#ff9a3a'; c.beginPath(); c.moveTo(fx - 5, fy + 2); c.lineTo(fx, fy - 10 * fl); c.lineTo(fx + 5, fy + 2); c.fill();
      c.fillStyle = '#ffe07a'; c.beginPath(); c.moveTo(fx - 2, fy + 2); c.lineTo(fx, fy - 5 * fl); c.lineTo(fx + 2, fy + 2); c.fill();
    } else { c.fillStyle = '#3a2c22'; c.fillRect(CAMP.x * TILE + 11, CAMP.y * TILE + 18, 10, 3); }
    // selection outline for farm
    if (UI.sel && UI.sel.kind === 'farm') { const f = farmOf(UI.sel.id); if (f) { c.strokeStyle = '#fff'; c.lineWidth = 2; c.setLineDash([4, 3]); c.strokeRect(f.x * TILE + 1, f.y * TILE + 1, f.w * TILE - 2, f.h * TILE - 2); c.setLineDash([]); } }
    const night = nightAlpha() > 0.25;
    const things = [
      ...S.buildings.map(b => ({ y: (b.y + b.h) * TILE, draw: () => drawBuilding(b, night) })),
      ...S.villagers.map(v => ({ y: v.py * TILE + 6, draw: () => drawVillager(v) })),
    ].sort((a, b) => a.y - b.y);
    for (const t of things) t.draw();
    // ghosts / drag previews
    drawPreview();
    // night tint
    const a = nightAlpha();
    if (a > 0) {
      c.fillStyle = `rgba(18, 26, 64, ${a})`; c.fillRect(0, 0, canvas.width, canvas.height);
      if (a > 0.25) for (const b of S.buildings) {
        const px = b.x * TILE, py = b.y * TILE, w = b.w * TILE, h = b.h * TILE;
        const g = c.createRadialGradient(px + w / 2, py + h * 0.7, 4, px + w / 2, py + h * 0.7, w * 0.9);
        g.addColorStop(0, 'rgba(255,210,120,0.35)'); g.addColorStop(1, 'rgba(255,210,120,0)');
        c.fillStyle = g; c.fillRect(px - w / 2, py - h / 2, w * 2, h * 2);
      }
      if (a > 0.25) { const fx = CAMP.x * TILE + 16, fy = CAMP.y * TILE + 14; const g = c.createRadialGradient(fx, fy, 4, fx, fy, 60); g.addColorStop(0, 'rgba(255,170,80,0.45)'); g.addColorStop(1, 'rgba(255,170,80,0)'); c.fillStyle = g; c.fillRect(fx - 60, fy - 60, 120, 120); }
    }
    drawFloats();
  }

  function drawPreview() {
    const c = ctx;
    const hv = UI.hover;
    if (!hv) return;
    if (UI.tool === 'farm' && UI.drag) {
      const x = Math.min(UI.drag.x0, hv.x), y = Math.min(UI.drag.y0, hv.y), w = Math.abs(hv.x - UI.drag.x0) + 1, h = Math.abs(hv.y - UI.drag.y0) + 1;
      const ok = rectFree(x, y, w, h);
      c.fillStyle = ok ? 'rgba(224,164,88,0.35)' : 'rgba(224,108,95,0.4)';
      c.fillRect(x * TILE, y * TILE, w * TILE, h * TILE);
      c.strokeStyle = ok ? '#e0a458' : '#e06c5f'; c.lineWidth = 2; c.strokeRect(x * TILE + 1, y * TILE + 1, w * TILE - 2, h * TILE - 2);
      label(`${w}×${h} · ${w * h * FARM_COST} coins`, x * TILE + 4, y * TILE - 6);
    } else if (UI.tool === 'path' && UI.drag) {
      const tiles = pathTiles(UI.drag.x0, UI.drag.y0, hv.x, hv.y);
      let n = 0;
      for (const t of tiles) {
        const ok = S.kind[idx(t.x, t.y)] === 'g' && !S.occ[idx(t.x, t.y)];
        if (ok) n++;
        c.fillStyle = ok ? 'rgba(195,160,109,0.7)' : 'rgba(224,108,95,0.3)';
        c.fillRect(t.x * TILE + 2, t.y * TILE + 2, TILE - 4, TILE - 4);
      }
      label(`${n} tiles · ${n * PATH_COST} coins`, hv.x * TILE + 4, hv.y * TILE - 6);
    } else if (BUILDINGS[UI.tool]) {
      const d = BUILDINGS[UI.tool];
      const ok = rectFree(hv.x, hv.y, d.w, d.h);
      c.fillStyle = ok ? 'rgba(224,164,88,0.35)' : 'rgba(224,108,95,0.4)';
      c.fillRect(hv.x * TILE, hv.y * TILE, d.w * TILE, d.h * TILE);
      c.strokeStyle = ok ? '#e0a458' : '#e06c5f'; c.lineWidth = 2; c.strokeRect(hv.x * TILE + 1, hv.y * TILE + 1, d.w * TILE - 2, d.h * TILE - 2);
    } else if (UI.tool === 'move' && UI.moving) {
      const b = building(UI.moving);
      if (b) {
        const ok = rectFree(hv.x, hv.y, b.w, b.h, b.id);
        c.fillStyle = ok ? 'rgba(224,164,88,0.35)' : 'rgba(224,108,95,0.4)';
        c.fillRect(hv.x * TILE, hv.y * TILE, b.w * TILE, b.h * TILE);
        c.strokeStyle = ok ? '#e0a458' : '#e06c5f'; c.lineWidth = 2; c.setLineDash([5, 3]);
        c.strokeRect(hv.x * TILE + 1, hv.y * TILE + 1, b.w * TILE - 2, b.h * TILE - 2);
        c.setLineDash([]);
        label(`Move the ${BUILDINGS[b.type].name.toLowerCase()} here · ${moveFee(b.type)} coins`, hv.x * TILE + 4, hv.y * TILE - 6);
      }
    } else if (UI.tool === 'demolish') {
      c.strokeStyle = '#e06c5f'; c.lineWidth = 2; c.strokeRect(hv.x * TILE + 1, hv.y * TILE + 1, TILE - 2, TILE - 2);
    }
  }
  function label(text, x, y) {
    const c = ctx;
    c.font = 'bold 11px sans-serif';
    const w = c.measureText(text).width + 8;
    const yy = Math.max(12, y);
    c.fillStyle = 'rgba(27,31,36,0.85)'; c.fillRect(x, yy - 11, w, 15);
    c.fillStyle = '#e9e4d8'; c.fillText(text, x + 4, yy);
  }

  // ------------------------------------------------------------ input
  function tileFromEvent(e) {
    const r = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left) / r.width * COLS);
    const y = Math.floor((e.clientY - r.top) / r.height * ROWS);
    return inb(x, y) ? { x, y } : null;
  }
  function pointFromEvent(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * COLS, y: (e.clientY - r.top) / r.height * ROWS };
  }

  canvas.addEventListener('pointerdown', (e) => {
    const t = tileFromEvent(e);
    if (!t) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    UI.hover = t;
    if (UI.tool === 'farm' || UI.tool === 'path') { UI.drag = { x0: t.x, y0: t.y }; return; }
    if (BUILDINGS[UI.tool]) { placeBuilding(UI.tool, t.x, t.y); return; }
    if (UI.tool === 'move') { if (UI.moving) moveBuilding(UI.moving, t.x, t.y); else setTool('select'); return; }
    if (UI.tool === 'demolish') { if (!demolishAt(t.x, t.y)) setHint('Nothing to pull down there.'); return; }
    // select
    const p = pointFromEvent(e);
    let best = null, bd = 0.7;
    for (const v of S.villagers) { if (v.hidden) continue; const d = Math.hypot(v.px - p.x, v.py - p.y + 0.3); if (d < bd) { bd = d; best = v; } }
    if (best) { UI.sel = { kind: 'villager', id: best.id }; return; }
    const bid = S.occ[idx(t.x, t.y)];
    if (bid) { UI.sel = { kind: 'building', id: bid }; return; }
    if (S.kind[idx(t.x, t.y)] === 'f') { UI.sel = { kind: 'farm', id: S.plots[idx(t.x, t.y)].farm }; return; }
    UI.sel = null;
  });
  canvas.addEventListener('pointermove', (e) => { UI.hover = tileFromEvent(e); });
  canvas.addEventListener('pointerleave', () => { if (!UI.drag) UI.hover = null; });
  canvas.addEventListener('pointerup', (e) => {
    const t = tileFromEvent(e) || UI.hover;
    if (UI.drag && t) {
      if (UI.tool === 'farm') placeFarm(UI.drag.x0, UI.drag.y0, t.x, t.y);
      else if (UI.tool === 'path') placePath(UI.drag.x0, UI.drag.y0, t.x, t.y);
    }
    UI.drag = null;
  });
  canvas.addEventListener('pointercancel', () => { UI.drag = null; });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { setTool('select'); UI.sel = null; }
    if (e.key === ' ' && e.target === document.body) { e.preventDefault(); setSpeed(UI.speed ? 0 : 1); }
  });

  // ------------------------------------------------------------ UI
  const $ = (id) => document.getElementById(id);
  const toolbar = $('toolbar'), panel = $('panel'), hintEl = $('hint'), statsEl = $('stats'), clockEl = $('clock'), overlay = $('overlay');
  let hintTimer = 0;

  function setHint(text, bad) {
    hintEl.textContent = text;
    hintEl.classList.toggle('bad', !!bad);
    hintTimer = 4;
  }
  function defaultHint() {
    if (UI.tool === 'move' && UI.moving) {
      const b = building(UI.moving);
      if (b) return `Click where the ${BUILDINGS[b.type].name.toLowerCase()} should stand. ${moveFee(b.type)} coins. Escape leaves it where it is.`;
    }
    if (!firstOf('store')) return 'Start with a storehouse, then drag out a farm. The villagers will do the rest.';
    if (!S.farms.length) return 'Drag across the grass with the Farm tool to lay out your first field.';
    if (!firstOf('house')) return 'Villagers sleeping rough by the fire wake up tired. A house has two beds.';
    if (!firstOf('shop')) return 'Nobody has had supper yet. A shop takes food from the storehouse and sells it to the villagers.';
    return TOOLS.find(t => t.id === UI.tool).hint;
  }

  function setTool(id) {
    if (id !== 'move') UI.moving = null;
    UI.tool = id;
    for (const b of toolbar.querySelectorAll('button[data-tool]')) b.classList.toggle('on', b.dataset.tool === id);
    canvas.className = 'tool-' + id;
    setHint(TOOLS.find(t => t.id === id).hint);
  }
  function setSpeed(n) {
    UI.speed = n;
    for (const b of document.querySelectorAll('[data-speed]')) b.classList.toggle('on', Number(b.dataset.speed) === n);
  }

  function renderToolbar() {
    toolbar.innerHTML = TOOLS.filter(t => !t.hidden).map(t => `<button type="button" data-tool="${t.id}" class="${t.id === UI.tool ? 'on' : ''}"><span>${t.label}</span>${t.cost !== undefined ? `<small>${t.cost}</small>` : ''}</button>`).join('');
  }
  toolbar.addEventListener('click', (e) => { const b = e.target.closest('button[data-tool]'); if (b) setTool(b.dataset.tool); });

  function renderStats() {
    const beds = totalBeds(), pop = S.villagers.length;
    const food = shopStock();
    const tired = S.villagers.filter(v => v.energy < 35).length;
    clockEl.textContent = `Day ${S.day}, ${String(Math.floor(S.hour)).padStart(2, '0')}:${String(Math.floor((S.hour % 1) * 60)).padStart(2, '0')}${isDay() ? '' : ' · night'}`;
    statsEl.innerHTML = [
      `<span class="stat"><b>${S.coins}</b><span class="lbl">coins</span><span class="meter" title="Goal: ${GOAL} coins"><i style="width:${Math.min(100, S.coins / GOAL * 100)}%"></i></span></span>`,
      `<span class="stat ${pop > beds ? 'low' : ''}" title="Villagers and beds"><b>${pop}</b><span class="lbl">villagers</span><span class="cap">/ ${beds} beds</span></span>`,
      `<span class="stat ${food < pop ? 'low' : ''}" title="Food on the shop shelves"><b>${food}</b><span class="lbl">food in shop</span></span>`,
      tired ? `<span class="stat low"><b>${tired}</b><span class="lbl">tired</span></span>` : '',
    ].join('');
  }

  function panelKey() {
    return `${UI.sel ? UI.sel.kind + ':' + UI.sel.id : 'none'}|${UI.structure}`;
  }

  function renderPanel() {
    const key = panelKey();
    if (key === UI.panelKey) return updateLive();
    UI.panelKey = key;
    let html = '';
    const sel = UI.sel;
    if (sel && sel.kind === 'villager') {
      const v = S.villagers.find(o => o.id === sel.id);
      if (!v) { UI.sel = null; return renderPanel(); }
      const home = v.home ? 'Has a bed' : 'Sleeps rough by the fire';
      html = `<h2><i class="dot" style="background:${v.shirt}"></i>${v.name}</h2>
        <p class="muted">${home} · here ${plural(v.days, 'day')}</p>
        <div class="row"><span>Energy</span><div class="bar"><span data-live="energy"></span></div></div>
        <div class="row"><span>Hunger</span><span data-live="hunger"></span></div>
        <div class="row"><span>Working at</span><span data-live="eff"></span></div>
        <p class="doing" data-live="task"></p>
        <p class="muted small">Tired villagers work slowly. A bed restores most of their energy overnight; the campfire much less. Missing supper makes it worse.</p>
        <p class="muted small">Nobody starves here. A villager who missed supper eats one of everything they pick, so a hungry village quietly loses part of its harvest until the shop is stocked again.</p>`;
    } else if (sel && sel.kind === 'farm') {
      const f = farmOf(sel.id);
      if (!f) { UI.sel = null; return renderPanel(); }
      html = `<h2>Farm <span class="muted">${f.w}×${f.h}</span></h2>
        <p class="muted" data-live="farm"></p>
        <h3>Crop</h3>
        <div class="options">${Object.entries(CROPS).map(([id, c]) => `<button type="button" class="option ${f.crop === id ? 'on' : ''}" data-crop="${id}"><span class="opt-label"><i class="sw" style="background:${GOODS[id].color}"></i>${c.name} <em>${c.grow / 24 < 1 ? Math.round(c.grow / 24 * 10) / 10 : Math.round(c.grow / 24 * 10) / 10} day${c.grow === 24 ? '' : 's'} · ${c.yield}/tile · ${c.price} coins each${c.food ? '' : ' · not food'}</em></span><span class="opt-text">${c.blurb}</span></button>`).join('')}</div>
        <p class="muted small">Changing crop only affects tiles sown from now on. Growing tiles finish what they started.</p>
        <button type="button" class="danger" data-demolish-farm="${f.id}">Plough it under (+${Math.floor(f.w * f.h * FARM_COST / 2)} coins)</button>`;
    } else if (sel && sel.kind === 'building') {
      const b = building(sel.id);
      if (!b) { UI.sel = null; return renderPanel(); }
      const def = BUILDINGS[b.type];
      html = `<h2>${def.name}</h2><p class="muted">${def.blurb}</p>`;
      if (b.type === 'store') {
        const bakery = firstOf('bakery'), shop = firstOf('shop');
        html += `<h3>Inside</h3><table class="inv">${GOOD_ORDER.map(g => `<tr>
            <td><i class="sw" style="background:${GOODS[g].color}"></i>${GOODS[g].name}</td>
            <td class="num" data-live="store-${g}"></td>
            <td class="price">${GOODS[g].price}c</td>
            <td class="acts"><button type="button" data-sell="${g}" data-n="10">Sell 10</button><button type="button" data-sell="${g}" data-n="all">Sell all</button></td>
            <td><button type="button" class="tog ${S.policy[g] ? 'on' : ''}" data-policy="${g}" title="Sell everything left each evening">${S.policy[g] ? 'auto-sell' : 'keep'}</button></td>
          </tr>`).join('')}</table>
          <p class="muted small">${bakery ? 'Wheat is carried to the bakery as it comes in, unless you sell it first.' : 'There is no bakery, so wheat can only be sold raw.'} ${shop ? 'Nothing moves on its own: villagers carry the cheapest food from here to the shop, load by load, all day.' : 'Build a shop and villagers will carry food over to it for supper.'} Auto-sell empties that shelf every evening.</p>`;
      } else if (b.type === 'bakery') {
        html += `<div class="row"><span>Wheat inside</span><b data-live="bwheat"></b></div><div class="row"><span>Bread baked so far</span><b data-live="bbaked"></b></div><p class="doing" data-live="bstatus"></p>`;
      } else if (b.type === 'shop') {
        html += `<div class="row"><span>Food on the shelves</span><b data-live="sstock"></b></div>
          <div class="row"><span>Room for</span><b>${SHOP_CAP}</b></div>
          <div class="row"><span>Suppers sold so far</span><b data-live="ssold"></b></div>
          <p class="doing" data-live="sstatus"></p>
          <p class="muted small"><b>The shop does not stock itself.</b> A villager walks food over from the storehouse a load at a time, cheapest food first, and drops everything else to do it when the shelves will not cover supper.</p>
          <p class="muted small">Each villager buys one supper at ${WORK_END}:00 for ${SUPPER_PRICE} coins. Newcomers only settle when the shop holds enough for everyone.</p>`;
      } else if (b.type === 'house') {
        const names = b.residents.map(id => S.villagers.find(v => v.id === id)).filter(Boolean).map(v => v.name);
        html += `<div class="row"><span>Sleeping here</span><b>${names.length ? names.join(' and ') : 'nobody yet'}</b></div><div class="row"><span>Free beds</span><b>${def.beds - b.residents.length}</b></div>`;
      }
      html += `<button type="button" class="link" data-move="${b.id}">Move it (${moveFee(b.type)} coins)</button>
        <button type="button" class="danger" data-demolish-b="${b.id}">Pull it down (+${Math.floor(def.cost / 2)} coins)</button>`;
    } else {
      const store = firstOf('store');
      html = `<h2>The plot</h2>
        <p class="muted">Reach <b>${GOAL} coins</b> to buy the freehold. ${S.won ? 'Done. Keep going as long as you like.' : ''}</p>
        <div class="row"><span>Villagers</span><b data-live="pop"></b></div>
        <div class="row"><span>Beds</span><b data-live="beds"></b></div>
        <div class="row"><span>Farms</span><b data-live="farms"></b></div>
        <div class="row"><span>In the storehouse</span><b data-live="storetotal"></b></div>
        ${store ? `<button type="button" class="link" data-open-store="${store.id}">Open the storehouse</button>` : '<p class="small warn">No storehouse yet. Nothing can be harvested until there is one.</p>'}
        <h3>Notices</h3>
        <ul class="log">${S.log.slice(0, 8).map(l => `<li class="${l.kind}"><small>Day ${l.day}</small> ${l.text}</li>`).join('')}</ul>`;
    }
    panel.innerHTML = html;
    updateLive();
  }

  function updateLive() {
    const sel = UI.sel;
    const set = (k, val) => { const el = panel.querySelector(`[data-live="${k}"]`); if (el) { if (k === 'energy') el.style.width = val + '%'; else el.textContent = val; } };
    if (sel && sel.kind === 'villager') {
      const v = S.villagers.find(o => o.id === sel.id);
      if (!v) return;
      set('energy', Math.round(v.energy));
      const bar = panel.querySelector('.bar span'); if (bar) bar.className = v.energy < 25 ? 'crit' : v.energy < 50 ? 'low' : '';
      set('hunger', ['Fed', 'Missed supper', 'Hungry', 'Ravenous'][v.hunger]);
      set('eff', Math.round(eff(v) * 100) + '% pace');
      set('task', taskLabel(v));
    } else if (sel && sel.kind === 'farm') {
      const f = farmOf(sel.id);
      if (!f) return;
      let e = 0, g = 0, r = 0;
      for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) { const p = S.plots[idx(x, y)]; if (p.stage === 0) e++; else if (p.stage === 1) g++; else r++; }
      set('farm', `${e} bare · ${g} growing · ${r} ready to pick`);
    } else if (sel && sel.kind === 'building') {
      const b = building(sel.id);
      if (!b) return;
      if (b.type === 'store') for (const g of GOOD_ORDER) set('store-' + g, S.store[g]);
      if (b.type === 'bakery') { set('bwheat', b.wheat); set('bbaked', b.baked || 0); set('bstatus', S.villagers.some(v => v.task && v.task.kind === 'bake' && v.task.phase === 1 && v.task.to === b.id) ? 'The oven is lit.' : b.wheat >= 2 ? 'Waiting for a baker.' : S.store.wheat >= 2 ? 'Waiting for wheat to be carried over.' : 'No wheat. Grow some, and do not sell it.'); }
      if (b.type === 'shop') {
        set('sstock', b.stock); set('ssold', b.sold || 0);
        const carrier = S.villagers.find(v => v.task && v.task.kind === 'haul' && v.task.to === b.id);
        const good = cheapestFood();
        set('sstatus',
          carrier && carrier.carry ? `${carrier.name} is carrying ${carrier.carry.n} ${GOODS[carrier.carry.good].name.toLowerCase()} over.`
          : carrier ? `${carrier.name} has gone to the storehouse for ${GOODS[carrier.task.good].name.toLowerCase()}.`
          : b.stock >= SHOP_CAP ? 'The shelves are full.'
          : !firstOf('store') ? 'There is no storehouse to fetch from.'
          : !good ? 'No food in the storehouse to carry over.'
          : 'Nobody is free to fetch a load yet.');
      }
    } else {
      set('pop', S.villagers.length);
      set('beds', `${freeBeds()} free of ${totalBeds()}`);
      set('farms', S.farms.length);
      set('storetotal', GOOD_ORDER.filter(g => S.store[g] > 0).map(g => `${S.store[g]} ${GOODS[g].name.toLowerCase()}`).join(', ') || 'nothing');
    }
  }

  panel.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.crop) { const f = farmOf(UI.sel.id); if (f) { f.crop = b.dataset.crop; UI.structure++; log(`The farm will grow ${CROPS[f.crop].name.toLowerCase()} from now on.`); } }
    else if (b.dataset.sell) sell(b.dataset.sell, b.dataset.n === 'all' ? 'all' : Number(b.dataset.n));
    else if (b.dataset.policy) { S.policy[b.dataset.policy] = !S.policy[b.dataset.policy]; UI.structure++; }
    else if (b.dataset.demolishFarm) { const f = farmOf(Number(b.dataset.demolishFarm)); if (f) demolishAt(f.x, f.y); }
    else if (b.dataset.demolishB) { const bb = building(Number(b.dataset.demolishB)); if (bb) demolishAt(bb.x, bb.y); }
    else if (b.dataset.openStore) UI.sel = { kind: 'building', id: Number(b.dataset.openStore) };
    else if (b.dataset.move) {
      const bb = building(Number(b.dataset.move));
      if (bb) {
        setTool('move');
        UI.moving = bb.id;
        setHint(`Click where the ${BUILDINGS[bb.type].name.toLowerCase()} should stand. ${moveFee(bb.type)} coins. Escape leaves it where it is.`);
      }
    }
    renderPanel();
  });

  document.querySelector('.topbar').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.speed !== undefined) setSpeed(Number(b.dataset.speed));
    if (b.dataset.action === 'help') showHelp();
    if (b.dataset.action === 'new-game') confirmNew();
  });

  // ------------------------------------------------------------ overlays
  function sheet(html) { overlay.innerHTML = `<div class="sheet">${html}</div>`; overlay.hidden = false; }
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.closest('[data-close]')) overlay.hidden = true;
    if (e.target.closest('[data-reset]')) { localStorage.removeItem(SAVE_KEY); newState(); UI.sel = null; UI.structure++; groundDirty = true; overlay.hidden = true; setTool('select'); }
  });
  function showHelp() {
    sheet(`<h2>How to play</h2>
      <p>You have an empty plot, three villagers and ${START_COINS} coins. The villagers will work out what needs doing; your job is to give them somewhere to do it.</p>
      <ul>
        <li><b>Storehouse first.</b> Every harvest is carried there. Without one, nothing gets picked.</li>
        <li><b>Farms</b> are dragged out on the grass. Click a farm to choose its crop. Villagers sow, wait for it to grow, harvest and carry.</li>
        <li><b>Paths</b> are cheap and villagers walk almost twice as fast on them. Run them between the farm, the storehouse and the houses.</li>
        <li><b>Houses</b> have two beds. At ${WORK_END}:00 everyone goes home; anyone without a bed sleeps by the fire and wakes up slow.</li>
        <li><b>Shop.</b> The shop is not stocked for you — a villager carries food over from the storehouse a load at a time, and you can watch them do it. Every evening each villager buys one supper there.</li>
        <li><b>Hunger.</b> Nobody starves in Furrow. A villager who missed supper works slowly and eats one of everything they harvest, so a hungry village quietly loses part of its crop until the shelves are full again.</li>
        <li><b>Second thoughts.</b> Click any building and <b>Move it</b> to jack it up and roll it somewhere better for a quarter of what it cost. Everything inside comes along.</li>
        <li><b>Bakery.</b> Wheat is worth little raw, but the bakery turns two wheat into three bread, and bread sells for three times as much. No bakery? Sell the wheat.</li>
        <li><b>Selling.</b> Open the storehouse to sell anything by hand, or switch a shelf to auto-sell and the cart takes it every evening.</li>
      </ul>
      <p>Reach ${GOAL} coins to buy the freehold. Space pauses; Escape drops the tool.</p>
      <button type="button" class="primary" data-close>Back to the plot</button>`);
  }
  function confirmNew() {
    sheet(`<h2>Start over?</h2><p>This clears the plot and every villager on it.</p>
      <div class="btns"><button type="button" class="primary" data-reset>Clear the plot</button><button type="button" class="ghost" data-close>Keep going</button></div>`);
  }
  function showWin() {
    sheet(`<h2>The freehold is yours</h2>
      <p>${S.coins} coins on day ${S.day}, with ${plural(S.villagers.length, 'villager')} and ${plural(S.farms.length, 'farm')}. The plot is nobody's but yours now.</p>
      <p>You can keep building as long as you like.</p>
      <button type="button" class="primary" data-close>Keep farming</button>`);
  }

  // ------------------------------------------------------------ loop
  let last = performance.now(), uiT = 0;
  function frame(now) {
    const raw = Math.max(0, Math.min(0.1, (now - last) / 1000));
    last = now;
    clockT += raw;
    if (UI.speed && overlay.hidden) {
      const dt = raw * UI.speed;
      const steps = Math.max(1, Math.ceil(dt / 0.05));
      for (let i = 0; i < steps; i++) tick(dt / steps);
    }
    draw();
    uiT += raw;
    if (uiT > 0.2) { uiT = 0; renderStats(); renderPanel(); if (hintTimer > 0 && (hintTimer -= 0.2) <= 0) { hintEl.textContent = defaultHint(); hintEl.classList.remove('bad'); } }
    requestAnimationFrame(frame);
  }

  // ------------------------------------------------------------ boot
  if (!load()) { newState(); }
  renderToolbar();
  setTool('select');
  renderStats();
  renderPanel();
  hintEl.textContent = defaultHint();
  window.addEventListener('beforeunload', save);
  requestAnimationFrame(frame);

  // A few hooks for testing in the console.
  window.furrow = { get S() { return S; }, tick, placeBuilding, placeFarm, placePath, moveBuilding, sell, float, UI, CLAIMS };
})();
