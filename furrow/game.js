/* Furrow — a village you lay out from above, and then live in.
   It starts with nothing built: four people and a handcart on the green, camping
   by its fire and eating from its sacks. Everything you place, they raise.
   Place houses, fields, a woodcutter's hut, a barn; later a bakery, a coop, a
   market, a tavern, a smithy, sheep and cows, a barber and a clothes shop. The
   villagers keep their own day — up at six, breakfast, work, lunch, work,
   supper, the tavern, bed — and the whole village runs on what they carry.
   Click anyone and follow them. Then take their place: walk their day in their
   boots, eat when you are hungry, and pick up today's tasks — the work their job
   asks for, an errand or two, bed at a decent hour. Nothing is compulsory, but
   every task done pays the village coin and renown, and renown is what opens up
   the better buildings. Anyone out of work may take to lifting purses instead,
   and a few lifts makes a thief of them — until somebody gives them a job.

   Tiles are Kenney's Tiny Town and Tiny Farm (CC0), vendored in assets/. The
   people, water, paths' edges, pens, stalls, the camp and HUD are painted here in code to
   sit alongside them — the same approach as Harrowgate. See ASSETS.md. */
(() => {
  'use strict';

  // ---------- constants ----------
  const SAVE_KEY = 'furrow-save-v4';
  const DEAD_KEYS = ['furrow-save-v3', 'furrow-save-v2', 'furrow-save-v1'];   // the castaway island, before the village
  const SOUND_KEY = 'furrow-sound';
  const T = 16;                            // pixels per tile
  const MW = 64, MH = 44, N = MW * MH;     // the valley, in tiles
  const ROAD_Y = 30;                       // the road in from the east, over the bridge
  const SEC_PER_HOUR = 14;                 // real seconds in a village hour, at normal speed
  const NIGHT_SPEED = 6;                   // how much faster the small hours go when everyone is abed
  const WAKE = 6, WORK_START = 8.5, LUNCH = 12, WORK_AGAIN = 13.5, SUPPER = 18, BED = 22;
  const CARRY = 4;                         // what anyone can carry at once
  const CAN = 8;                           // waterings in a full can
  const GROW_HOURS = 4;                    // watered hours from one crop stage to the next
  const WALK = 2.3, PATH_BONUS = 1.35, RUN = 1.65;

  // ground kinds
  const G = { GRASS: 0, PATH: 1, WATER: 2, BRIDGE: 3, SOIL: 4 };
  // what grows on a tile
  const TR = { NONE: 0, TREE: 1, STUMP: 2, SAPLING: 3, ROCK: 4, BUSH: 5 };

  const CROPS = {
    carrot:  { name: 'Carrots',  stages: [4, 5, 6],    yield: 3, star: 0 },
    wheat:   { name: 'Wheat',    stages: [64, 65, 66], yield: 4, star: 0 },
    beet:    { name: 'Beets',    stages: [16, 17, 18], yield: 3, star: 0 },
    cabbage: { name: 'Cabbages', stages: [52, 53, 54], yield: 3, star: 2 },
    tomato:  { name: 'Tomatoes', stages: [40, 41, 42], yield: 4, star: 3 },
    corn:    { name: 'Corn',     stages: [28, 29, 30], yield: 3, star: 4 },
  };
  // food is fullness restored; price is what the market gets for it
  const GOODS = {
    logs:    { name: 'Logs',     price: 2 },
    wheat:   { name: 'Wheat',    price: 1, farm: 68 },
    carrot:  { name: 'Carrots',  price: 2, food: 25, farm: 8 },
    beet:    { name: 'Beets',    price: 3, food: 25, farm: 20 },
    cabbage: { name: 'Cabbages', price: 3, food: 30, farm: 56 },
    tomato:  { name: 'Tomatoes', price: 3, food: 22, farm: 44 },
    corn:    { name: 'Corn',     price: 3, food: 30, farm: 32 },
    egg:     { name: 'Eggs',     price: 2, food: 20 },
    milk:    { name: 'Milk',     price: 3, food: 20, farm: 124 },
    bread:   { name: 'Bread',    price: 5, food: 45, farm: 125 },
    wool:    { name: 'Wool',     price: 3 },
    tools:   { name: 'Tools',    price: 8 },
    clothes: { name: 'Clothes',  price: 10 },
  };
  const FOODS = Object.keys(GOODS).filter((g) => GOODS[g].food);

  // Every building. `solid` rows: # blocks, . can be walked on (pens, fields).
  // The door is a column of the bottom row; the tile below it is where people stand to use it.
  const BT = {
    house:  { name: 'House', w: 3, h: 3, cost: { c: 25, t: 8 }, star: 0, beds: 2, door: 1, work: 14,
      blurb: 'Two beds. Somebody new comes down the road when there is a bed going spare and the village is happy.' },
    field:  { name: 'Field', w: 5, h: 4, cost: { c: 8, t: 2 }, star: 0, jobs: 2, job: 'farmer', walk: true, door: 2, work: 6,
      blurb: 'Sown, watered every day, and harvested. Farmers fill their cans at a well or the river.' },
    wood:   { name: 'Woodcutter', w: 3, h: 3, cost: { c: 15, t: 0 }, star: 0, jobs: 1, job: 'woodcutter', door: 1, work: 10,
      blurb: 'Fells the trees round about for logs. Stumps grow back in a few days.' },
    well:   { name: 'Well', w: 1, h: 2, cost: { c: 10, t: 3 }, star: 0, door: 0, work: 5,
      blurb: 'Fills a watering can, or a bucket for the house.' },
    camp:   { name: 'Camp', w: 2, h: 1, cost: { c: 0, t: 0 }, star: 99, door: 0, work: 1,
      blurb: 'The handcart the villagers came with — their stores, a fire and their bedrolls. It is packed away once a barn is up.' },
    barn:   { name: 'Barn', w: 3, h: 5, cost: { c: 30, t: 10 }, star: 0, door: 1, store: 100, work: 16,
      blurb: 'Where everything is carried to, and where the food comes from. Each barn holds 100.' },
    coop:   { name: 'Hen coop', w: 5, h: 3, cost: { c: 25, t: 8 }, star: 1, jobs: 1, job: 'henwife', door: 0, animals: ['hen', 4], work: 10,
      blurb: 'Four hens and whatever they lay. Someone has to go and pick the eggs up.' },
    market: { name: 'Market stall', w: 3, h: 2, cost: { c: 20, t: 6 }, star: 2, jobs: 1, job: 'trader', door: 1, work: 8,
      blurb: 'Carries the surplus from the barn and sells it to travellers for coin.' },
    bakery: { name: 'Bakery', w: 4, h: 3, cost: { c: 35, t: 12 }, star: 3, jobs: 1, job: 'baker', door: 1, work: 16,
      blurb: 'Two wheat make three loaves, and bread fills you up better than anything.' },
    smith:  { name: 'Blacksmith', w: 4, h: 3, cost: { c: 40, t: 10 }, star: 4, jobs: 1, job: 'smith', door: 1, work: 18,
      blurb: 'Burns logs to forge tools, which sell well. And scissors — no barber without a smith.' },
    sheep:  { name: 'Sheep pen', w: 6, h: 4, cost: { c: 35, t: 10 }, star: 4, jobs: 1, job: 'shepherd', door: 0, animals: ['sheep', 3], work: 12,
      blurb: 'Three sheep to shear for wool. A clothes shop needs the wool.' },
    tavern: { name: 'Tavern', w: 5, h: 3, cost: { c: 50, t: 16 }, star: 5, jobs: 1, job: 'cook', door: 2, work: 20,
      blurb: 'The cook turns two of anything into three hot stews. A hot supper cheers anyone, and the evenings are spent here.' },
    barber: { name: 'Barber', w: 3, h: 3, cost: { c: 30, t: 8 }, star: 5, jobs: 1, job: 'barber', door: 1, needs: 'smith', work: 12,
      blurb: 'Needs a blacksmith for the scissors. Anyone can come in for a new cut and colour.' },
    tailor: { name: 'Clothes shop', w: 4, h: 3, cost: { c: 40, t: 10 }, star: 6, jobs: 1, job: 'tailor', door: 1, needs: 'sheep', work: 16,
      blurb: 'Needs a sheep pen for the wool. Sews clothes, and anyone can buy a new outfit.' },
    cows:   { name: 'Cowshed', w: 6, h: 5, cost: { c: 45, t: 14 }, star: 7, jobs: 1, job: 'dairy', door: 1, animals: ['cow', 2], work: 18,
      blurb: 'Two cows, milked once a day.' },
  };
  const BUILD_ORDER = ['house', 'field', 'wood', 'well', 'barn', 'coop', 'market', 'bakery', 'smith', 'sheep', 'tavern', 'barber', 'tailor', 'cows'];
  const JOBS = {
    farmer:     { name: 'Farmer',      at: 'field',  task: 'Tend the field',        unit: 'jobs',    need: 8, verb: 'farm' },
    woodcutter: { name: 'Woodcutter',  at: 'wood',   task: 'Bring logs to the barn', unit: 'logs',   need: 6, verb: 'logs' },
    henwife:    { name: 'Hen-keeper',  at: 'coop',   task: 'Collect eggs',           unit: 'eggs',   need: 4, verb: 'egg' },
    trader:     { name: 'Trader',      at: 'market', task: 'Sell at the market',     unit: 'sold',   need: 6, verb: 'sell' },
    baker:      { name: 'Baker',       at: 'bakery', task: 'Bake bread',             unit: 'loaves', need: 4, verb: 'bake' },
    smith:      { name: 'Blacksmith',  at: 'smith',  task: 'Forge tools',            unit: 'tools',  need: 2, verb: 'forge' },
    shepherd:   { name: 'Shepherd',    at: 'sheep',  task: 'Shear the sheep',        unit: 'fleeces', need: 3, verb: 'shear' },
    cook:       { name: 'Cook',        at: 'tavern', task: 'Cook stew',              unit: 'pots',   need: 2, verb: 'cook' },
    barber:     { name: 'Barber',      at: 'barber', task: 'Give haircuts',          unit: 'cuts',   need: 2, verb: 'cut' },
    tailor:     { name: 'Tailor',      at: 'tailor', task: 'Sew clothes',            unit: 'sets',   need: 2, verb: 'sew' },
    dairy:      { name: 'Dairymaid',   at: 'cows',   task: 'Milk the cows',          unit: 'pails',  need: 2, verb: 'milk' },
  };
  const NAMES = ['Nell', 'Bram', 'Hester', 'Tobin', 'Maud', 'Wren', 'Alfie', 'Iris', 'Cob', 'Edith', 'Joss', 'Ada', 'Silas', 'Poppy',
    'Ned', 'Rosa', 'Hugh', 'Mabel', 'Otto', 'Lettie', 'Perrin', 'Clem', 'Ivy', 'Walt', 'Dora', 'Fen', 'Greta', 'Hal', 'Jem', 'Kit'];

  // ---------- small helpers ----------
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const idx = (x, y) => y * MW + x;
  const inb = (x, y) => x >= 0 && y >= 0 && x < MW && y < MH;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
  function rng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const cellHash = (x, y, k) => {
    let h = (x * 374761393 + y * 668265263 + (k || 0) * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const hhmm = (t) => { const h = Math.floor(t) % 24, m = Math.floor((t % 1) * 60 / 10) * 10; return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0'); };
  let R = Math.random;   // gameplay dice; swapped for a seeded one by the tests

  // ---------- the valley ----------
  const ground = new Uint8Array(N);          // G.*
  const tree = new Uint8Array(N);            // TR.*
  const treeT = new Float32Array(N);         // hours until a stump or sapling moves on
  const sid = new Int16Array(N).fill(-1);    // which building covers the cell
  let B = [];                                // buildings, by id (a demolished one leaves null)
  let V = [];                                // villagers
  let riverPhase = 0;
  const riverCx = (y) => 51 + 2.4 * Math.sin(y * 0.16 + riverPhase);

  const S = {
    mode: 'title', seed: 1, day: 1, t: WAKE, coins: 60, renown: 0, store: {}, speed: 1,
    tool: null, sel: null, selB: null, follow: null, me: null, toasts: [], banner: null,
    stats: { lifts: 0, caught: 0, tasks: 0, arrived: 0, left: 0 }, dirty: true, fullWarned: false, nextId: 0,
    real: 0, pathBudget: 8, paused: false, modal: false, lastSpeed: 1, showTasks: false, hint: null, acts: [], liftable: null,
  };

  function solidAt(b, i, j) {
    const ty = b.type;
    if (ty === 'field') return false;
    if (ty === 'coop') return i < 2;
    if (ty === 'sheep') return i < 2 && j >= 1;
    if (ty === 'cows') return i < 3;
    return true;
  }
  function penOf(b) {
    if (b.type === 'coop') return { x: b.x + 2, y: b.y, w: 3, h: 3 };
    if (b.type === 'sheep') return { x: b.x + 2, y: b.y, w: 4, h: 4 };
    if (b.type === 'cows') return { x: b.x + 3, y: b.y, w: 3, h: 5 };
    return null;
  }
  const entry = (b) => ({ x: b.x + BT[b.type].door, y: b.y + b.h });
  const entryC = (b) => { const e = entry(b); return { x: e.x + 0.5, y: e.y + 0.5 }; };

  // can a person stand here?
  function walkable(c) {
    const g = ground[c];
    if (g === G.WATER) return false;
    const tr = tree[c];
    if (tr === TR.TREE || tr === TR.STUMP || tr === TR.ROCK || tr === TR.BUSH) return false;
    const s = sid[c];
    if (s >= 0) { const b = B[s]; return !solidAt(b, c % MW - b.x, ((c / MW) | 0) - b.y); }
    return true;
  }
  function stepCost(c) {
    const g = ground[c];
    if (g === G.PATH || g === G.BRIDGE) return 0.72;
    const s = sid[c];
    if (s >= 0) return B[s].type === 'field' ? 1.4 : 3;   // round the crops, not through the pens
    return 1;
  }

  function noise2(x, y, sc, k) {
    const gx = x / sc, gy = y / sc, x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0;
    const sm = (t) => t * t * (3 - 2 * t);
    const a = cellHash(x0, y0, k), b = cellHash(x0 + 1, y0, k), c = cellHash(x0, y0 + 1, k), d = cellHash(x0 + 1, y0 + 1, k);
    const u = sm(fx), v = sm(fy);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }

  const HOME = { x: 24, y: 21 };   // the village green
  function genWorld(seed) {
    const Rg = rng(seed);
    riverPhase = (seed % 97) / 15;
    ground.fill(G.GRASS); tree.fill(0); treeT.fill(0); sid.fill(-1); B = [];
    for (let y = 0; y < MH; y++) {
      const cx = riverCx(y);
      for (let x = 0; x < MW; x++) if (Math.abs(x + 0.5 - cx) < 2.1) ground[idx(x, y)] = G.WATER;
    }
    // the road, from the green out over the bridge to the east edge
    for (let x = 12; x < MW; x++) for (const y of [ROAD_Y, ROAD_Y + 1]) ground[idx(x, y)] = ground[idx(x, y)] === G.WATER ? G.BRIDGE : G.PATH;
    for (let y = HOME.y + 1; y < ROAD_Y; y++) ground[idx(HOME.x, y)] = G.PATH;
    // woods thicken towards the edges; a few copses nearer in
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const c = idx(x, y);
      if (ground[c] !== G.GRASS) continue;
      const d = Math.hypot((x - HOME.x) * 0.8, y - HOME.y);
      const n = noise2(x, y, 5, seed) * 0.6 + noise2(x, y, 2, seed + 3) * 0.4;
      const edge = Math.min(x, y, MW - 1 - x, MH - 1 - y);
      let p = d < 7 ? 0 : d < 13 ? (n > 0.62 ? 0.5 : 0.02) : clamp((d - 13) / 10, 0, 1) * (n > 0.42 ? 0.85 : 0.15);
      if (edge < 2) p = Math.max(p, 0.7);
      if (Math.abs(x + 0.5 - riverCx(y)) < 3.3) p *= 0.3;
      if (Rg() < p) tree[c] = TR.TREE;
      else if (d > 6 && Rg() < 0.012) tree[c] = TR.ROCK;
      else if (d > 5 && Rg() < 0.02) tree[c] = TR.BUSH;
    }
    // nothing built: the villagers' handcart on the green, and that is all
    addBuilding('camp', HOME.x, HOME.y, true);
  }
  // A small working village, raised at once — for the tests, which want something to poke at.
  function quickStart() {
    const at = [['barn', 18, 15], ['house', 27, 17], ['house', 31, 17], ['field', 17, 23], ['wood', 29, 22], ['well', 27, 21]];
    const out = at.map(([ty, x, y]) => {
      for (let j = y - 1; j <= y + BT[ty].h + 1; j++) for (let i = x - 1; i <= x + BT[ty].w; i++) if (inb(i, j) && tree[idx(i, j)]) tree[idx(i, j)] = TR.NONE;
      return addBuilding(ty, x, y, true);
    });
    for (let x = 18; x <= 34; x++) if (sid[idx(x, 20)] < 0) ground[idx(x, 20)] = G.PATH;
    const [, h1, h2, field, wood] = out;
    [['Nell', field, h1], ['Bram', field, h1], ['Tobin', wood, h2], ['Hester', null, h2]].forEach(([n, job, home]) => {
      const v = V.find((w) => w.name === n);
      if (!v) return;
      v.home = home.id; const e = entryC(home); v.x = e.x; v.y = e.y; v.path = null;
      if (job) assignJob(v, job);
      makeTasks(v);
    });
    S.dirty = true;
    return out;
  }

  function addBuilding(type, x, y, built) {
    const d = BT[type];
    const b = { id: B.length, type, x, y, w: d.w, h: d.h, built: !!built, work: 0, need: d.work * 3, workers: [], stock: 0, q: [], eggs: [], animals: [], crop: 'carrot', cells: null, ageH: 0 };
    B.push(b);
    for (let j = 0; j < b.h; j++) for (let i = 0; i < b.w; i++) {
      const c = idx(x + i, y + j);
      sid[c] = b.id;
      if (tree[c] === TR.TREE) S.store.logs = (S.store.logs || 0) + 1;
      tree[c] = TR.NONE;
      if (type === 'field') ground[c] = G.SOIL;
    }
    if (type === 'field') b.cells = Array.from({ length: b.w * b.h }, () => ({ st: -1, wet: 0, g: 0, claim: 0 }));
    if (built) finishBuilding(b, true);
    S.dirty = true;
    return b;
  }
  function finishBuilding(b, quiet) {
    b.built = true; b.work = b.need;
    const d = BT[b.type];
    if (d.animals) {
      const pen = penOf(b);
      b.animals = [];
      for (let k = 0; k < d.animals[1]; k++) {
        b.animals.push({ kind: d.animals[0], x: pen.x + 0.6 + R() * (pen.w - 1.2), y: pen.y + 0.8 + R() * (pen.h - 1.4), tx: 0, ty: 0, wait: R() * 3, flip: R() < 0.5, ready: true, layT: 2 + R() * 6, claim: 0 });
      }
    }
    if (b.type === 'house') housePeople();
    if (b.type === 'barn') {
      const camp = B.find((o) => o && o.type === 'camp');
      if (camp) { removeBuilding(camp); if (!quiet) toast('The barn is up — the camp is packed away', '#bfe39a', 4); }
    }
    if (!quiet) {
      toast(d.name + ' is finished', '#bfe39a');
      gainRenown(1, null);
      sfx('built');
    }
    S.dirty = true;
  }
  function removeBuilding(b) {
    for (const v of V) {
      if (v.job === b.id) { v.job = -1; v.jobKind = null; }
      if (v.home === b.id) v.home = -1;
    }
    for (let j = 0; j < b.h; j++) for (let i = 0; i < b.w; i++) {
      const c = idx(b.x + i, b.y + j);
      sid[c] = -1;
      if (ground[c] === G.SOIL) ground[c] = G.GRASS;
    }
    B[b.id] = null;
    if (S.selB === b) S.selB = null;
    S.dirty = true;
  }
  const built = (type) => B.some((b) => b && b.built && b.type === type);
  const beds = () => B.reduce((n, b) => n + (b && b.built && b.type === 'house' ? BT.house.beds : 0), 0);
  const storeCap = () => B.reduce((n, b) => n + (b && b.built && b.type === 'barn' ? BT.barn.store : 0), 0) || 100;   // the handcart holds a fair bit
  const storeUsed = () => Object.keys(S.store).reduce((n, g) => n + (S.store[g] || 0), 0);
  const foodInStore = () => FOODS.reduce((n, g) => n + (S.store[g] || 0), 0);

  // ---------- where things may go ----------
  // Reachability from the road's end, with some cells pretended solid — so nothing
  // can be placed that walls a door off from the rest of the village.
  const seen = new Uint8Array(N);
  const bfsQ = new Int32Array(N);
  function flood(extraSolid) {
    seen.fill(0);
    const s0 = idx(MW - 1, ROAD_Y);
    let h = 0, t = 0;
    bfsQ[t++] = s0; seen[s0] = 1;
    while (h < t) {
      const c = bfsQ[h++], x = c % MW, y = (c / MW) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (!inb(nx, ny)) continue;
        const n = idx(nx, ny);
        if (seen[n] || !walkable(n) || (extraSolid && extraSolid(nx, ny))) continue;
        seen[n] = 1; bfsQ[t++] = n;
      }
    }
    return seen;
  }
  function whyNot(type, x, y) {
    const d = BT[type];
    if (S.renown < d.star) return 'Needs ' + d.star + ' renown';
    if (d.needs && !built(d.needs)) return 'Needs a ' + BT[d.needs].name.toLowerCase() + ' first';
    if (S.coins < d.cost.c) return 'Not enough coin';
    if ((S.store.logs || 0) < d.cost.t) return 'Not enough logs';
    if (x < 0 || y < 0 || x + d.w > MW || y + d.h >= MH) return 'Off the edge';
    for (let j = 0; j < d.h; j++) for (let i = 0; i < d.w; i++) {
      const c = idx(x + i, y + j);
      if (sid[c] >= 0) return 'Something is in the way';
      if (ground[c] !== G.GRASS && ground[c] !== G.PATH) return ground[c] === G.WATER || ground[c] === G.BRIDGE ? 'Not on the water' : 'Something is in the way';
      if (tree[c] === TR.ROCK) return 'A rock is in the way';
      if (V.some((v) => !v.gone && Math.floor(v.x) === x + i && Math.floor(v.y) === y + j && !v.inside)) return 'Someone is standing there';
    }
    const ex = x + d.door, ey = y + d.h, ec = idx(ex, ey);
    if (!inb(ex, ey) || ground[ec] === G.WATER || sid[ec] >= 0 || tree[ec] === TR.ROCK) return 'The door needs open ground in front';
    // would it cut anything off?
    const inFoot = (i, j) => i >= x && j >= y && i < x + d.w && j < y + d.h && (type === 'field' ? false : true);
    const sn = flood((i, j) => inFoot(i, j) && (i !== ex || j !== ey));
    const ok = (c) => sn[c] || tree[c] === TR.TREE;   // a tree in front of a door gets felled
    if (!ok(ec) && !(tree[ec] === TR.TREE || tree[ec] === TR.BUSH)) return 'Nobody could reach the door';
    for (const b of B) {
      if (!b) continue;
      const e = entry(b), c = idx(e.x, e.y);
      if (!sn[c]) return 'It would cut off the ' + BT[b.type].name.toLowerCase();
    }
    return null;
  }
  function place(type, x, y) {
    const why = whyNot(type, x, y);
    if (why) return why;
    const d = BT[type];
    S.coins -= d.cost.c; S.store.logs -= d.cost.t;
    const e = idx(x + d.door, y + d.h);
    if (tree[e] === TR.TREE || tree[e] === TR.BUSH) tree[e] = TR.NONE;
    const b = addBuilding(type, x, y, false);
    sfx('place');
    return b;
  }
  function paveWhy(x, y) {
    if (!inb(x, y)) return 'Off the edge';
    const c = idx(x, y);
    if (ground[c] !== G.GRASS || sid[c] >= 0) return 'Only on grass';
    if (tree[c] === TR.TREE || tree[c] === TR.ROCK || tree[c] === TR.STUMP) return 'Clear it first';
    if (S.coins < 1) return 'Not enough coin';
    return null;
  }
  function pave(x, y) {
    if (paveWhy(x, y)) return false;
    const c = idx(x, y);
    ground[c] = G.PATH; tree[c] = TR.NONE; S.coins -= 1; S.dirty = true;
    return true;
  }
  function plantWhy(x, y) {
    if (!inb(x, y)) return 'Off the edge';
    const c = idx(x, y);
    if (ground[c] !== G.GRASS || sid[c] >= 0 || tree[c] !== TR.NONE) return 'Only on bare grass';
    if (S.coins < 2) return 'Not enough coin';
    if (V.some((v) => !v.gone && Math.floor(v.x) === x && Math.floor(v.y) === y)) return 'Someone is standing there';
    const sn = flood((i, j) => i === x && j === y);
    for (const b of B) if (b) { const e = entry(b); if (!sn[idx(e.x, e.y)]) return 'It would block a door'; }
    return null;
  }
  function plant(x, y) {
    if (plantWhy(x, y)) return false;
    const c = idx(x, y);
    tree[c] = TR.SAPLING; treeT[c] = 30; S.coins -= 2;
    return true;
  }
  // clearing: a building comes down for half its coin back; trees give logs; rocks cost to shift
  function clearWhat(x, y) {
    if (!inb(x, y)) return null;
    const c = idx(x, y);
    if (sid[c] >= 0) {
      const b = B[sid[c]];
      if (b.type === 'camp') return { why: 'That is the villagers’ camp — it goes when a barn is up' };
      return { b, label: 'Pull down the ' + BT[b.type].name.toLowerCase() + (b.built ? ' (+' + Math.floor(BT[b.type].cost.c / 2) + ' coin)' : ' (full refund)') };
    }
    const tr = tree[c];
    if (tr === TR.TREE) return { tree: c, label: 'Fell the tree (+2 logs)' };
    if (tr === TR.STUMP || tr === TR.SAPLING || tr === TR.BUSH) return { tree: c, label: 'Clear it' };
    if (tr === TR.ROCK) return { tree: c, label: 'Shift the rock (3 coin)', cost: 3 };
    if (ground[c] === G.PATH && !(y === ROAD_Y || y === ROAD_Y + 1)) return { path: c, label: 'Take up the path' };
    return null;
  }
  function clearAt(x, y) {
    const w = clearWhat(x, y);
    if (!w || w.why) return w ? w.why : 'Nothing to clear';
    if (w.b) {
      const d = BT[w.b.type];
      S.coins += w.b.built ? Math.floor(d.cost.c / 2) : d.cost.c;
      if (!w.b.built) S.store.logs = (S.store.logs || 0) + d.cost.t;
      removeBuilding(w.b);
    } else if (w.tree !== undefined) {
      if (w.cost && S.coins < w.cost) return 'Not enough coin';
      if (w.cost) S.coins -= w.cost;
      if (tree[w.tree] === TR.TREE) S.store.logs = (S.store.logs || 0) + 2;
      tree[w.tree] = TR.NONE;
    } else if (w.path !== undefined) ground[w.path] = G.GRASS;
    S.dirty = true;
    sfx('place');
    return null;
  }

  // ---------- paths ----------
  const gScore = new Float32Array(N), came = new Int32Array(N), stamp = new Int32Array(N), closed = new Int32Array(N);
  let stampN = 0;
  const heap = [], heapF = [];
  function hpush(n, f) {
    heap.push(n); heapF.push(f);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heapF[p] <= f) break;
      heap[i] = heap[p]; heapF[i] = heapF[p]; i = p;
    }
    heap[i] = n; heapF[i] = f;
  }
  function hpop() {
    const top = heap[0], ln = heap.pop(), lf = heapF.pop();
    if (heap.length) {
      let i = 0;
      const n = heap.length;
      for (;;) {
        let l = i * 2 + 1, r = l + 1, m = i;
        let mf = lf;
        if (l < n && heapF[l] < mf) { m = l; mf = heapF[l]; }
        if (r < n && heapF[r] < mf) { m = r; }
        if (m === i) break;
        heap[i] = heap[m]; heapF[i] = heapF[m]; i = m;
      }
      heap[i] = ln; heapF[i] = lf;
    }
    return top;
  }
  // A path from (sx,sy) to any of the goal cells, as a list of cells, or null.
  function findPath(sx, sy, goals) {
    if (!goals.length) return null;
    const s = idx(clamp(sx | 0, 0, MW - 1), clamp(sy | 0, 0, MH - 1));
    const goal = new Set(goals);
    if (goal.has(s)) return [s];
    stampN++;
    heap.length = 0; heapF.length = 0;
    const gx = goals[0] % MW, gy = (goals[0] / MW) | 0;
    const hf = (c) => { const dx = Math.abs(c % MW - gx), dy = Math.abs(((c / MW) | 0) - gy); return (Math.max(dx, dy) + 0.41 * Math.min(dx, dy)) * 0.7; };
    stamp[s] = stampN; gScore[s] = 0; came[s] = -1;
    hpush(s, hf(s));
    let steps = 0;
    while (heap.length) {
      const c = hpop();
      if (closed[c] === stampN) continue;
      closed[c] = stampN;
      if (goal.has(c)) {
        const out = [];
        for (let k = c; k !== -1; k = came[k]) out.push(k);
        return out.reverse();
      }
      if (++steps > 4000) return null;
      const x = c % MW, y = (c / MW) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (!inb(nx, ny)) continue;
        const n = idx(nx, ny);
        if (closed[n] === stampN) continue;
        if (!walkable(n)) continue;
        if (dx && dy && (!walkable(idx(x + dx, y)) || !walkable(idx(x, y + dy)))) continue;
        const g = gScore[c] + stepCost(n) * (dx && dy ? 1.414 : 1);
        if (stamp[n] === stampN && g >= gScore[n]) continue;
        stamp[n] = stampN; gScore[n] = g; came[n] = c;
        hpush(n, g + hf(n));
      }
    }
    return null;
  }
  // the walkable cells beside a solid one, for standing at a tree or an animal
  function besideCells(x, y) {
    const out = [];
    for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (inb(nx, ny) && walkable(idx(nx, ny))) out.push(idx(nx, ny));
    }
    return out;
  }
  function nearestWalkable(x, y, maxR) {
    const cx = x | 0, cy = y | 0;
    for (let r = 0; r <= (maxR || 8); r++) {
      let best = null, bd = 1e9;
      for (let j = cy - r; j <= cy + r; j++) for (let i = cx - r; i <= cx + r; i++) {
        if (Math.max(Math.abs(i - cx), Math.abs(j - cy)) !== r || !inb(i, j) || !walkable(idx(i, j))) continue;
        const d = Math.hypot(i + 0.5 - x, j + 0.5 - y);
        if (d < bd) { bd = d; best = { x: i + 0.5, y: j + 0.5 }; }
      }
      if (best) return best;
    }
    return null;
  }
  // where to fill a can: at a well, or standing on the river bank
  function waterSpots() {
    const out = [];
    for (const b of B) if (b && b.built && b.type === 'well') { const e = entry(b); out.push(idx(e.x, e.y)); }
    return out;
  }
  function bankCells(near, r) {
    const out = [];
    for (let y = Math.max(0, (near.y | 0) - r); y < Math.min(MH, (near.y | 0) + r); y++) for (let x = Math.max(0, (near.x | 0) - r); x < Math.min(MW, (near.x | 0) + r); x++) {
      const c = idx(x, y);
      if (!walkable(c) || ground[c] === G.BRIDGE) continue;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => inb(x + dx, y + dy) && ground[idx(x + dx, y + dy)] === G.WATER)) out.push(c);
    }
    return out;
  }
  function nearWater(x, y) {
    const cx = x | 0, cy = y | 0;
    for (let j = cy - 1; j <= cy + 1; j++) for (let i = cx - 1; i <= cx + 1; i++) if (inb(i, j) && ground[idx(i, j)] === G.WATER) return true;
    return false;
  }

  // ---------- sheets ----------
  const town = new Image(), farm = new Image();
  let townOk = false, farmOk = false;
  function tile(ctx, n, dx, dy, which, sx, sy, sw, sh) {
    const img = which === 'farm' ? farm : town;
    if (!(which === 'farm' ? farmOk : townOk)) return false;
    sx = sx || 0; sy = sy || 0; sw = sw || 16; sh = sh || 16;
    ctx.drawImage(img, (n % 12) * 16 + sx, ((n / 12) | 0) * 16 + sy, sw, sh, dx + sx, dy + sy, sw, sh);
    return true;
  }
  const ftile = (ctx, n, dx, dy) => tile(ctx, n, dx, dy, 'farm');
  const OUT = '#2b1d24';   // the Tiny Town outline, borrowed for everything drawn here

  // ---------- people ----------
  // Painted like Harrowgate's crowd: a head, a body and legs from 12-wide templates,
  // coloured by a palette. Letters are palette slots:
  //   o outline  H/h hair  S skin  E eye  C/D coat  A sleeve  W collar  B belt  L legs  K boots
  // The head comes in five cuts, which is what the barber changes.
  const HEADS = {
    short: {
      front: ['', '...oHHHHo...', '..oHHHHHHo..', '..oHSSSSHo..', '..oSESSESo..', '..oSSSSSSo..', '...oSSSSo...'],
      back: ['', '...oHHHHo...', '..oHHHHHHo..', '..oHHHHHHo..', '..oHHHHHHo..', '..ohSSSSho..', '...oSSSSo...'],
      side: ['', '...oHHHHo...', '..oHHHHHHo..', '..oHHHSSSo..', '..oHHSSESo..', '..ohSSSSSo..', '...oSSSSo...'],
    },
    crop: {
      front: ['', '...ohhhho...', '..ohSSSSho..', '..oSSSSSSo..', '..oSESSESo..', '..oSSSSSSo..', '...oSSSSo...'],
      back: ['', '...ohhhho...', '..ohhhhhho..', '..ohhhhhho..', '..oSSSSSSo..', '..oSSSSSSo..', '...oSSSSo...'],
      side: ['', '...ohhhho...', '..ohhhSSSo..', '..ohSSSSSo..', '..oSSSSESo..', '..oSSSSSSo..', '...oSSSSo...'],
    },
    long: {
      front: ['', '...oHHHHo...', '..oHHHHHHo..', '..oHSSSSHo..', '..oHESSEHo..', '..oHSSSSHo..', '..oHhSShHo..'],
      back: ['', '...oHHHHo...', '..oHHHHHHo..', '..oHHHHHHo..', '..oHHHHHHo..', '..oHHHHHHo..', '..ohHHHHho..'],
      side: ['', '...oHHHHo...', '..oHHHHHHo..', '..oHHHSSSo..', '..oHHSSESo..', '..oHHSSSSo..', '..oHHSSSo...'],
      body: { front: ['..oHCWWCHo..', '.oAHCCCCHAo.'], back: ['..oCHHHHCo..', '.oACHHHHCAo.'], side: ['..oHCCWWo...', '..oHCCACCo..'] },
    },
    bun: {
      front: ['....oHHo....', '...oHHHHo...', '..oHHHHHHo..', '..oHSSSSHo..', '..oSESSESo..', '..oSSSSSSo..', '...oSSSSo...'],
      back: ['....oHHo....', '...oHHHHo...', '..oHHHHHHo..', '..oHHHHHHo..', '..oHHHHHHo..', '..oSSSSSSo..', '...oSSSSo...'],
      side: ['..oHHo......', '..oHHHHHo...', '..oHHHHHHo..', '..oHHHSSSo..', '..oHHSSESo..', '..ohSSSSSo..', '...oSSSSo...'],
    },
    bald: {
      front: ['', '...oSSSSo...', '..oSSSSSSo..', '..oSSSSSSo..', '..oSESSESo..', '..ohSSSSho..', '...ohhhho...'],
      back: ['', '...oSSSSo...', '..oSSSSSSo..', '..oSSSSSSo..', '..oSSSSSSo..', '..oSSSSSSo..', '...oSSSSo...'],
      side: ['', '...oSSSSo...', '..oSSSSSSo..', '..oSSSSSSo..', '..oSSSSESo..', '..oSSSShho..', '...oShhho...'],
    },
  };
  const STYLES = ['short', 'crop', 'long', 'bun', 'bald'];
  const STYLE_NAMES = { short: 'Short', crop: 'Cropped', long: 'Long', bun: 'Bun', bald: 'Shaved' };
  const BODY = {
    front: ['..oCCWWCCo..', '.oACCCCCCAo.', '.oACCCCCCAo.', '.oADCBBCDAo.', '.oSoCCCCoSo.', '..ooCDDCoo..', '...oCCCCo...'],
    back: ['..oCCCCCCo..', '.oACCCCCCAo.', '.oACCCCCCAo.', '.oADCBBCDAo.', '.oSoCCCCoSo.', '..ooCDDCoo..', '...oCCCCo...'],
    side: ['...oCCWWo...', '..oCCCACCo..', '..oCCCACCo..', '..oDCBABDo..', '...oCCSCo...', '...oCDDCo...', '...oCCCCo...'],
  };
  const LEGS = {
    front: [
      ['...oLLLLo...', '...oLLLLo...', '...oKKKKo...', '...oooooo...'],
      ['...oLLLLo...', '...oKKLLo...', '...oooKKo...', '......ooo...'],
      ['...oLLLLo...', '...oLLLLo...', '...oKKKKo...', '...oooooo...'],
      ['...oLLLLo...', '...oLLKKo...', '...oKKooo...', '...ooo......'],
    ],
    side: [
      ['....oLLo....', '....oLLo....', '....oKKKo...', '....ooooo...'],
      ['...oLLLLo...', '..oLLooLLo..', '.oKKo..oKKo.', '.ooo....ooo.'],
      ['....oLLo....', '....oLLo....', '...oKKKo....', '...oooo.....'],
      ['...oLLLLo...', '..oLLooLLo..', '.oKKo..oKKo.', '.ooo....ooo.'],
    ],
    skirt: [
      ['..oLLLLLLo..', '..oLLLLLLo..', '...oKooKo...', '...oo..oo...'],
      ['..oLLLLLLo..', '..oLLLLLLo..', '...oKo.oKo..', '...oo...oo..'],
      ['..oLLLLLLo..', '..oLLLLLLo..', '...oKooKo...', '...oo..oo...'],
      ['..oLLLLLLo..', '..oLLLLLLo..', '..oKo.oKo...', '..oo...oo...'],
    ],
  };
  const HAIR_COLS = ['#3a2a1c', '#5a3a22', '#8a6a3a', '#c8a060', '#2a2420', '#8a8a8a', '#a85a30', '#e0d8c8', '#b04a6a', '#4a6ab0', '#5a8a4a'];
  const SKINS = ['#f0c8a0', '#e3b48f', '#c98f68', '#a8704c', '#7a4e34', '#e7bf9a'];
  const COATS = ['#8a5a3a', '#6a7a4a', '#4a5f7a', '#9a6a5a', '#b89a5a', '#7a4a5a', '#5a6a6a', '#a8a090', '#8a3a3a', '#4a6a5a', '#c0703a', '#6a4a8a', '#3a7a8a', '#c8b060'];
  const LEG_COLS = ['#4a3a2a', '#3e4450', '#5a4a3a', '#2f3a5a', '#6a5a48', '#6a3a3a'];
  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => clamp(Math.round(v * k), 0, 255);
    return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, '0')).join('');
  }
  function randomLook(Rl) {
    const dress = Rl() < 0.4;
    return {
      style: dress ? ['long', 'bun', 'short'][(Rl() * 3) | 0] : ['short', 'crop', 'short', 'bald', 'long'][(Rl() * 5) | 0],
      hair: (Rl() * 8) | 0, skin: (Rl() * SKINS.length) | 0, coat: (Rl() * COATS.length) | 0, legs: (Rl() * LEG_COLS.length) | 0, dress,
    };
  }
  const lookKey = (l) => [l.style, l.hair, l.skin, l.coat, l.legs, l.dress ? 1 : 0].join('.');
  function palOf(l) {
    const C = COATS[l.coat], H = HAIR_COLS[l.hair], Sk = SKINS[l.skin];
    return {
      H, h: shade(H, 0.72), S: Sk, E: '#2a1d1a', C, D: shade(C, 0.74), A: C, W: l.dress ? '#e8e0d0' : shade(C, 0.74), B: l.dress ? shade(C, 0.74) : '#3a2a20',
      L: l.dress ? shade(C, 0.9) : LEG_COLS[l.legs], K: l.dress ? shade(C, 0.6) : '#2a1f14',
    };
  }
  const spriteCache = new Map();
  // dir: 0 down, 1 left, 2 right, 3 up
  function sprite(look, dir, frame) {
    const ck = lookKey(look) + '|' + dir + '|' + frame;
    let cv = spriteCache.get(ck);
    if (cv) return cv;
    cv = document.createElement('canvas');
    cv.width = 12; cv.height = 18;
    const g = cv.getContext('2d');
    const pal = palOf(look);
    const view = dir === 0 ? 'front' : dir === 3 ? 'back' : 'side';
    const head = HEADS[look.style] || HEADS.short;
    const body = BODY[view].slice();
    if (head.body) { body[0] = head.body[view][0]; body[1] = head.body[view][1]; }
    const legs = (look.dress ? LEGS.skirt : view === 'side' ? LEGS.side : LEGS.front)[frame & 3];
    const rows = head[view].concat(body, legs);
    const bob = frame === 1 || frame === 3 ? 1 : 0;
    for (let j = 0; j < rows.length; j++) {
      const row = rows[j];
      for (let i = 0; i < row.length; i++) {
        const ch = row[i];
        if (ch === '.') continue;
        const col = ch === 'o' ? OUT : pal[ch];
        if (!col) continue;
        g.fillStyle = col;
        const x = dir === 1 ? 11 - i : i;
        g.fillRect(x, j + (j < 14 ? bob : 0), 1, 1);
      }
    }
    spriteCache.set(ck, cv);
    return cv;
  }
  // you, picked out of the crowd by a faint pale rim
  const rims = new WeakMap();
  function outlined(spr) {
    let cv = rims.get(spr);
    if (cv) return cv;
    cv = document.createElement('canvas');
    cv.width = spr.width + 2; cv.height = spr.height + 2;
    const g = cv.getContext('2d');
    for (const [x, y] of [[0, 1], [2, 1], [1, 0], [1, 2]]) g.drawImage(spr, x, y);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = 'rgba(255,244,214,0.85)'; g.fillRect(0, 0, cv.width, cv.height);
    g.globalCompositeOperation = 'source-over';
    g.drawImage(spr, 1, 1);
    rims.set(spr, cv);
    return cv;
  }

  // ---------- icons ----------
  function bitmap(rows, pal) {
    const cv = document.createElement('canvas');
    cv.width = rows[0].length; cv.height = rows.length;
    const g = cv.getContext('2d');
    rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (pal[r[i]]) { g.fillStyle = pal[r[i]]; g.fillRect(i, j, 1, 1); } });
    return cv;
  }
  const O = '#1a1014';
  const ICON = {
    coin: bitmap(['.ooo.', 'oYWYo', 'oYYYo', 'oYYYo', '.ooo.'], { o: O, Y: '#e0b43a', W: '#fff0a0' }),
    star: bitmap(['...o...', '..oYo..', 'ooYYYoo', 'oYYWYYo', '.oYYYo.', '.oYoYo.', '.oo.oo.'], { o: O, Y: '#f0c43a', W: '#fff4b0' }),
    heart: bitmap(['.oo.oo.', 'oRRoRRo', 'oRWRRRo', '.oRRRo.', '..oRo..', '...o...'], { o: O, R: '#d8323c', W: '#ff9a9a' }),
    bowl: bitmap(['.o.o.o.', '..o.o..', 'ooooooo', 'oYYYYYo', '.oBBBo.', '..ooo..'], { o: O, Y: '#d88a3a', B: '#8a5a3a' }),
    bolt: bitmap(['...oo', '..oYo', '.oYo.', 'oYYYo', '.oYo.', 'oYo..', 'oo...'], { o: O, Y: '#8fd0ff' }),
    person: bitmap(['.ooo.', 'oSSSo', '.ooo.', 'oCCCo', 'oCCCo', '.o.o.'], { o: O, S: '#e3b48f', C: '#8fd0ff' }),
    bed: bitmap(['o.....', 'oWWooo', 'oRRRRo', 'oooooo', 'o....o'], { o: O, W: '#f0ead8', R: '#b8433a' }),
    mask: bitmap(['.ooooo.', 'oKKKKKo', 'oKWKWKo', '.oKKKo.', '..ooo..'], { o: O, K: '#3a3040', W: '#f0ead8' }),
    tick: bitmap(['.....o', '....oG', 'o..oGo', 'GooGo.', '.oGo..', '..o...'], { o: O, G: '#8fe08f' }),
    logs: bitmap(['..........', '.oooooooo.', 'oWBBBBBBBo', 'oWBBBBBBBo', '.oooooooo.', 'oWBBBBBBBo', 'oWBBBBBBBo', '.oooooooo.'], { o: O, W: '#e8c890', B: '#9a6a3a' }),
    egg: bitmap(['.oo.', 'oWWo', 'oWWo', 'oWEo', '.oo.'], { o: O, W: '#f4ecd8', E: '#d8cbb0' }),
    wool: bitmap(['.o.oo.', 'oWoWWo', 'oWWWWWo', 'oWWEWWo', '.oWWWo.', '..ooo..'].map((r) => r.padEnd(7, '.')), { o: O, W: '#f4f0e6', E: '#d8d0c0' }),
    clothes: bitmap(['.oo.oo.', 'oCCoCCo', 'oCCCCCo', '.oCCCo.', '.oCCCo.', '.ooooo.'], { o: O, C: '#b06a8a' }),
    tools: bitmap(['oooo...', 'oGGGo..', 'oooGGo.', '...oHo.', '....oHo', '.....oo'], { o: O, G: '#aab3bf', H: '#8a5a2e' }),
    scissors: bitmap(['o...o', '.o.o.', '..o..', '.oRo.', 'oR.Ro', 'oo.oo'], { o: O, R: '#c83a3a' }),
  };
  const goodIconCache = {};
  function goodIcon(g) {
    if (goodIconCache[g]) return goodIconCache[g];
    const d = GOODS[g];
    if (d && d.farm !== undefined) {
      if (!farmOk) return ICON.coin;
      const cv = document.createElement('canvas');
      cv.width = 16; cv.height = 16;
      ftile(cv.getContext('2d'), d.farm, 0, 0);
      return (goodIconCache[g] = cv);
    }
    return ICON[g] || ICON.coin;
  }

  // ---------- the villagers ----------
  function makeVillager(name, x, y, look) {
    const v = {
      id: S.nextId++, name, look: look || randomLook(R), x, y, ang: Math.PI / 2, dir: 0, anim: 0, moving: false,
      home: -1, job: -1, thief: false, lifts: 0, caughtN: 0, idleDays: 0,
      hunger: 75 + R() * 20, energy: 85 + R() * 15, mood: 62, joy: 0, purse: 4 + ((R() * 10) | 0),
      carry: null, can: 0, inside: false, path: null, pi: 0, act: null, goal: '', ate: {}, tasks: [], taskDay: 0,
      gone: false, leaving: false, lowDays: 0, bubble: null, nextLift: 0, wait: 0, wakeAt: WAKE + R() * 0.8, bedAt: BED + R() * 0.8,
      claim: null, gift: null, bucket: false, hello: [], served: false, queued: -1, visited: false,
    };
    V.push(v);
    return v;
  }
  const vById = (id) => V.find((v) => v.id === id);
  const jobB = (v) => (v.job >= 0 ? B[v.job] : null);
  function jobKind(v) {
    const b = jobB(v);
    if (b && b.built) return BT[b.type].job;
    if (b) return 'waiting';
    return v.thief ? 'thief' : null;
  }
  function jobTitle(v) {
    const k = jobKind(v);
    if (k === 'thief') return 'Thief';
    if (k === 'waiting') return BT[B[v.job].type].name + ' (being built)';
    return k ? JOBS[k].name : 'Out of work';
  }
  const openings = (b) => (b && b.built && BT[b.type].jobs ? BT[b.type].jobs - b.workers.length : 0);
  function assignJob(v, b) {
    const old = jobB(v);
    if (old) old.workers = old.workers.filter((id) => id !== v.id);
    if (!b) { v.job = -1; return; }
    v.job = b.id;
    if (!b.workers.includes(v.id)) b.workers.push(v.id);
    v.idleDays = 0;
    if (v.thief) { v.thief = false; toast(v.name + ' has given up thieving', '#bfe39a'); }
    dropClaims(v);
    v.path = null; v.act = null;
  }
  function housemates(b) { return V.filter((v) => !v.gone && v.home === b.id); }
  function housePeople() {
    for (const v of V) {
      if (v.gone || v.home >= 0 && B[v.home] && B[v.home].built) continue;
      const h = B.find((b) => b && b.built && b.type === 'house' && housemates(b).length < BT.house.beds);
      if (h) v.home = h.id;
    }
  }
  function say(v, text, dur) { v.bubble = { text, t: dur || 2.6 }; }
  function dropClaims(v) {
    if (v.claim) { v.claim.claim = 0; v.claim = null; }
  }
  function claimIt(v, o) { dropClaims(v); o.claim = v.id + 1; v.claim = o; }
  const claimedByOther = (v, o) => o.claim && o.claim !== v.id + 1;

  // ---------- the clock ----------
  function mealNow(t) {
    if (t >= WAKE && t < 9.5) return 'b';
    if (t >= LUNCH - 0.5 && t < 14.5) return 'l';
    if (t >= SUPPER - 0.5 && t < 21) return 's';
    return null;
  }
  const workHours = (t) => (t >= WORK_START && t < LUNCH) || (t >= WORK_AGAIN && t < SUPPER);
  const MEAL_NAMES = { b: 'breakfast', l: 'lunch', s: 'supper' };

  // ---------- tasks ----------
  // Everyone gets a list each morning. Only what you do while living as them counts.
  function makeTasks(v) {
    const tasks = [];
    const others = V.filter((o) => o !== v && !o.gone && !o.leaving);
    tasks.push({ k: 'meal', m: 'b', label: 'Eat breakfast', until: 10, reward: { c: 2, mood: 4 } });
    const jk = jobKind(v);
    if (jk === 'thief') tasks.push({ k: 'lift', label: 'Lift 3 purses unseen', need: 3, have: 0, reward: { purse: 8 } });
    else if (jk && jk !== 'waiting') {
      const J = JOBS[jk];
      tasks.push({ k: 'work', verb: J.verb, label: J.task + ': ' + J.need + ' ' + J.unit, need: J.need, have: 0, reward: { c: 12, star: 1, purse: 4 } });
    } else if (B.some((b) => b && !b.built)) tasks.push({ k: 'work', verb: 'hammer', label: 'Help raise a building: 8 blows', need: 8, have: 0, reward: { c: 8, star: 1, purse: 3 } });
    else if (!jk) tasks.push({ k: 'job', label: 'Find work: ask at a door', reward: { c: 5, star: 1 } });
    tasks.push({ k: 'meal', m: 'l', label: 'Eat lunch', until: 14.5, reward: { c: 2, mood: 4 } });
    const errands = [];
    if (v.home >= 0 && built('well')) errands.push('water');
    if (others.length >= 2) errands.push('hello');
    if (others.length >= 1) errands.push('gift');
    if (built('tavern')) errands.push('tavern');
    const e = errands[(R() * errands.length) | 0];
    if (e === 'water') tasks.push({ k: 'water', label: 'Fetch water home from the well', reward: { c: 6, star: 1 } });
    if (e === 'hello') {
      const pick = others.slice().sort(() => R() - 0.5).slice(0, Math.min(3, others.length)).map((o) => o.id);
      tasks.push({ k: 'hello', who: pick, done_: [], label: 'Say hello to ' + pick.map((id) => vById(id).name).join(', '), reward: { c: 4, star: 1, mood: 6 } });
    }
    if (e === 'gift') {
      const o = others[(R() * others.length) | 0];
      tasks.push({ k: 'gift', who: o.id, label: 'Take ' + o.name + ' something to eat', reward: { c: 6, star: 1, mood: 6 } });
    }
    if (e === 'tavern') tasks.push({ k: 'tavern', label: 'An evening at the tavern', reward: { c: 3, mood: 10 } });
    tasks.push({ k: 'meal', m: 's', label: 'Eat supper', until: 21, reward: { c: 2, mood: 4 } });
    tasks.push({ k: 'bed', label: v.home >= 0 ? 'In bed by 23:00' : 'Asleep by 23:00', until: 23, reward: { star: 1, mood: 5 } });
    v.tasks = tasks; v.taskDay = S.day; v.hello = []; v.gift = null; v.bucket = false; v.visited = false;
  }
  function payTask(v, t) {
    if (t.done || t.failed) return;
    t.done = true;
    const r = t.reward, bits = [];
    if (r.c) { S.coins += r.c; bits.push('+' + r.c + ' coin'); }
    if (r.purse) { v.purse += r.purse; bits.push('+' + r.purse + ' purse'); }
    if (r.star) { gainRenown(r.star, null); bits.push('+' + r.star + ' renown'); }
    if (r.mood) v.joy += r.mood;
    S.stats.tasks++;
    toast('✓ ' + t.label + (bits.length ? '  ' + bits.join(', ') : ''), '#bfe39a', 3.2);
    sfx('task');
    if (v.tasks.every((x) => x.done)) {
      S.coins += 10; gainRenown(1, null);
      banner('A GOOD DAY', v.name + ' did everything on the list', '+10 coin, +1 renown');
    }
  }
  // something happened that a task might care about; only the one you are living counts
  function progress(v, kind, arg) {
    if (v !== S.me) return;
    for (const t of v.tasks) {
      if (t.done || t.failed) continue;
      if (kind === 'meal' && t.k === 'meal' && t.m === arg) payTask(v, t);
      else if (kind === 'work' && t.k === 'work' && t.verb === arg.verb) { t.have = Math.min(t.need, t.have + (arg.n || 1)); if (t.have >= t.need) payTask(v, t); }
      else if (kind === 'lift' && t.k === 'lift') { t.have++; if (t.have >= t.need) payTask(v, t); }
      else if (kind === 'job' && t.k === 'job') payTask(v, t);
      else if (kind === 'water' && t.k === 'water') payTask(v, t);
      else if (kind === 'hello' && t.k === 'hello' && t.who.includes(arg) && !t.done_.includes(arg)) { t.done_.push(arg); if (t.done_.length >= t.who.length) payTask(v, t); }
      else if (kind === 'gift' && t.k === 'gift' && t.who === arg) payTask(v, t);
      else if (kind === 'tavern' && t.k === 'tavern') payTask(v, t);
      else if (kind === 'bed' && t.k === 'bed') payTask(v, t);
    }
  }
  function expireTasks(v) {
    for (const t of v.tasks) if (!t.done && !t.failed && t.until && S.t >= t.until && S.t > WAKE) t.failed = true;
  }
  function gainRenown(n) { S.renown = Math.max(0, S.renown + n); }

  // ---------- doing things ----------
  // Every verb in the village is one of these, and the villagers and you use the same ones:
  // { label, dur (in village hours), ok() (can it be done now), run() }. `anim` is how it looks.
  const clock = () => S.day * 24 + S.t;
  function addCarry(v, g, n) {
    if (v.carry && v.carry.g !== g) return false;
    v.carry = v.carry ? { g, n: v.carry.n + n } : { g, n };
    return true;
  }
  const canCarry = (v, g) => !v.carry || (v.carry.g === g && v.carry.n < CARRY);
  function storeAdd(g, n) {
    const room = Math.max(0, storeCap() - storeUsed());
    const k = Math.min(room, n);
    S.store[g] = (S.store[g] || 0) + k;
    if (k < n && !S.fullWarned) { S.fullWarned = true; toast('The barn is full — build another, or a market', '#ffb03b', 4); }
    if (k === n) S.fullWarned = false;
    return k;
  }
  function takeFood(prefer) {
    // the most plentiful thing that fills you, so the stores stay varied
    let best = null, bn = 0;
    for (const g of FOODS) { const n = S.store[g] || 0; if (n > bn || (n === bn && n > 0 && g === prefer)) { bn = n; best = g; } }
    if (!best) return null;
    S.store[best]--;
    return best;
  }
  function workUnit(v, verb, n) { progress(v, 'work', { verb, n: n || 1 }); v.worked = (v.worked || 0) + (n || 1); }

  const A = {
    sow: (v, b, cell) => ({ label: 'Sow ' + CROPS[b.crop].name.toLowerCase(), dur: 0.08, anim: 'bend', ok: () => cell.st < 0,
      run: () => { cell.st = 0; cell.crop = b.crop; cell.g = 0; cell.wet = 0; workUnit(v, 'farm'); sfx('dig'); } }),
    water: (v, b, cell) => ({ label: 'Water the ' + CROPS[cell.crop].name.toLowerCase(), dur: 0.06, anim: 'can', ok: () => cell.st >= 0 && cell.st < 3 && !cell.wet && v.can > 0,
      run: () => { cell.wet = 1; v.can--; workUnit(v, 'farm'); sfx('water'); } }),
    harvest: (v, b, cell) => ({ label: 'Harvest ' + CROPS[cell.crop].name.toLowerCase(), dur: 0.12, anim: 'bend', ok: () => cell.st === 3 && canCarry(v, cell.crop),
      run: () => { addCarry(v, cell.crop, CROPS[cell.crop].yield); cell.st = -1; cell.wet = 0; workUnit(v, 'farm'); sfx('pick'); } }),
    fill: (v) => ({ label: 'Fill the watering can', dur: 0.08, anim: 'bend', ok: () => v.can < CAN, run: () => { v.can = CAN; sfx('water'); } }),
    chop: (v, c) => ({ label: 'Fell the tree', dur: 0.3, anim: 'chop', ok: () => tree[c] === TR.TREE && canCarry(v, 'logs'),
      run: () => { tree[c] = TR.STUMP; treeT[c] = 36; addCarry(v, 'logs', 2); sfx('fell'); } }),
    deliver: (v, b) => ({ label: 'Put ' + (v.carry ? GOODS[v.carry.g].name.toLowerCase() : 'it') + (b.type === 'camp' ? ' on the cart' : ' in the barn'), dur: 0.05, anim: 'bend', ok: () => !!v.carry && v.carry.g !== 'water',
      run: () => {
        const { g, n } = v.carry;
        storeAdd(g, n);
        if (g === 'logs') workUnit(v, 'logs', n);
        v.carry = null; sfx('drop');
      } }),
    egg: (v, b, e) => ({ label: 'Pick up the egg', dur: 0.05, anim: 'bend', ok: () => b.eggs.includes(e) && canCarry(v, 'egg'),
      run: () => { b.eggs.splice(b.eggs.indexOf(e), 1); addCarry(v, 'egg', 1); workUnit(v, 'egg'); sfx('pick'); } }),
    milk: (v, b, a) => ({ label: 'Milk the cow', dur: 0.2, anim: 'bend', ok: () => a.ready && canCarry(v, 'milk'),
      run: () => { a.ready = false; addCarry(v, 'milk', 1); workUnit(v, 'milk'); sfx('milk'); } }),
    shear: (v, b, a) => ({ label: 'Shear the sheep', dur: 0.2, anim: 'bend', ok: () => a.ready && canCarry(v, 'wool'),
      run: () => { a.ready = false; a.woolT = 30; addCarry(v, 'wool', 1); workUnit(v, 'shear'); sfx('snip'); } }),
    bake: (v, b) => ({ label: 'Bake (2 wheat → 3 loaves)', dur: 0.35, anim: 'work', ok: () => (S.store.wheat || 0) >= 2 && !v.carry,
      run: () => { S.store.wheat -= 2; addCarry(v, 'bread', 3); workUnit(v, 'bake', 3); b.smokeT = 2; sfx('work'); } }),
    forge: (v, b) => ({ label: 'Forge tools (2 logs)', dur: 0.45, anim: 'work', ok: () => (S.store.logs || 0) >= 2 && !v.carry,
      run: () => { S.store.logs -= 2; addCarry(v, 'tools', 1); workUnit(v, 'forge'); b.smokeT = 2; sfx('anvil'); } }),
    sew: (v, b) => ({ label: 'Sew clothes (2 wool)', dur: 0.45, anim: 'work', ok: () => (S.store.wool || 0) >= 2 && !v.carry,
      run: () => { S.store.wool -= 2; addCarry(v, 'clothes', 1); workUnit(v, 'sew'); sfx('snip'); } }),
    cook: (v, b) => ({ label: 'Cook a pot of stew (2 food)', dur: 0.35, anim: 'work', ok: () => foodInStore() >= 2 && b.stock < 12,
      run: () => { takeFood(); takeFood(); b.stock += 3; workUnit(v, 'cook'); b.smokeT = 2; sfx('work'); } }),
    take: (v, barn) => ({ label: 'Take goods to sell', dur: 0.05, anim: 'bend', ok: () => !v.carry && !!surplus(),
      run: () => { const g = surplus(); const n = Math.min(CARRY, (S.store[g] || 0) - keepOf(g)); S.store[g] -= n; v.carry = { g, n }; sfx('drop'); } }),
    sell: (v, b) => ({ label: 'Sell ' + (v.carry ? GOODS[v.carry.g].name.toLowerCase() : ''), dur: 0.12, anim: 'work', ok: () => !!v.carry && !!GOODS[v.carry.g],
      run: () => {
        const p = GOODS[v.carry.g].price;
        S.coins += p; v.carry.n--; if (v.carry.n <= 0) v.carry = null;
        workUnit(v, 'sell'); sfx('coin'); coinPop(v, p);
      } }),
    cut: (v, b) => ({ label: 'Cut ' + (b.q.length && vById(b.q[0]) ? vById(b.q[0]).name + '’s' : 'someone’s') + ' hair', dur: 0.3, anim: 'work', ok: () => b.q.length > 0,
      run: () => {
        const c = vById(b.q.shift());
        if (c) {
          c.look = Object.assign({}, c.look, { style: STYLES[(R() * STYLES.length) | 0], hair: R() < 0.5 ? c.look.hair : (R() * HAIR_COLS.length) | 0 });
          c.purse = Math.max(0, c.purse - 4); S.coins += 4; c.joy += 12; c.act = null; c.lastCut = S.day;
          say(c, 'Lovely, thank you!');
        }
        workUnit(v, 'cut'); sfx('snip');
      } }),
    hammer: (v, site) => ({ label: 'Hammer at the ' + BT[site.type].name.toLowerCase(), dur: 0.1, anim: 'chop', ok: () => !site.built && B[site.id] === site,
      run: () => {
        site.work += 1 * (0.6 + v.mood / 150);
        workUnit(v, 'hammer'); sfx('hammer');
        if (site.work >= site.need) finishBuilding(site);
      } }),
    eatHome: (v) => ({ label: 'Eat at home', dur: 0.35, anim: 'eat', ok: () => foodInStore() > 0,
      run: () => {
        const g = takeFood();
        if (!g) return;
        v.hunger = Math.min(100, v.hunger + GOODS[g].food + 15);
        const m = mealNow(S.t) || 'snack';
        v.ate[m] = true; progress(v, 'meal', m); sfx('eat');
        if (v === S.me) toast('You eat some ' + GOODS[g].name.toLowerCase(), '#f3ead6');
      } }),
    eatTavern: (v, b) => ({ label: 'Hot stew at the tavern (2 coin)', dur: 0.4, anim: 'eat', ok: () => b.stock > 0 && v.purse >= 2,
      run: () => {
        b.stock--; v.purse -= 2; S.coins += 2;
        v.hunger = Math.min(100, v.hunger + 55); v.joy += 6;
        const m = mealNow(S.t) || 'snack';
        v.ate[m] = true; progress(v, 'meal', m); sfx('eat');
      } }),
    bucket: (v) => ({ label: 'Draw a bucket of water', dur: 0.08, anim: 'bend', ok: () => !v.bucket && !v.carry, run: () => { v.bucket = true; sfx('water'); } }),
    pourHome: (v) => ({ label: 'Take the water in', dur: 0.05, anim: 'bend', ok: () => v.bucket, run: () => { v.bucket = false; v.joy += 3; progress(v, 'water'); } }),
    takeGift: (v) => ({ label: 'Take something to give away', dur: 0.05, anim: 'bend', ok: () => !v.gift && foodInStore() > 0,
      run: () => { v.gift = takeFood(); toast('You wrap up some ' + GOODS[v.gift].name.toLowerCase(), '#f3ead6'); } }),
    ask: (v, b) => ({ label: 'Ask for work here', dur: 0.1, anim: 'talk', ok: () => openings(b) > 0 && v.job !== b.id,
      run: () => {
        const had = jobKind(v);
        assignJob(v, b);
        toast(v.name + ' is the new ' + JOBS[BT[b.type].job].name.toLowerCase() + (had && had !== 'thief' ? '' : ''), '#bfe39a', 3);
        progress(v, 'job');
        if (v === S.me) retask(v);
        sfx('task');
      } }),
  };
  // a job changed mid-day: swap the work line for the new one, keep the rest
  function retask(v) {
    const jk = jobKind(v);
    const i = v.tasks.findIndex((t) => (t.k === 'work' || t.k === 'lift') && !t.done);
    if (i < 0 || !jk || jk === 'thief' || jk === 'waiting') return;
    const J = JOBS[jk];
    v.tasks[i] = { k: 'work', verb: J.verb, label: J.task + ': ' + J.need + ' ' + J.unit, need: J.need, have: 0, reward: { c: 12, star: 1, purse: 4 } };
  }

  // the market sells what the village can spare
  const pop = () => V.filter((v) => !v.gone).length;
  function keepOf(g) {
    if (g === 'logs') return 25;
    if (g === 'wheat') return built('bakery') ? 12 : 4;
    if (g === 'wool') return built('tailor') ? 6 : 0;
    if (g === 'clothes' || g === 'tools') return 2;
    if (GOODS[g].food) return Math.ceil(pop() * 4 / FOODS.length) + 2;
    return 0;
  }
  function surplus() {
    let best = null, bn = 0;
    for (const g in GOODS) {
      const over = (S.store[g] || 0) - keepOf(g);
      if (over > 0 && over * GOODS[g].price > bn) { bn = over * GOODS[g].price; best = g; }
    }
    if (best && GOODS[best].food && foodInStore() <= pop() * 4) return null;
    return best;
  }

  // ---------- pockets ----------
  function witnessOf(thief, victim) {
    for (const o of V) {
      if (o === thief || o === victim || o.gone || o.inside || o.asleep || o.thief) continue;
      const d = dist(o, thief);
      if (d > 5) continue;
      if (Math.abs(angDiff(o.ang, Math.atan2(thief.y - o.y, thief.x - o.x))) < 1.15 || d < 1.4) return o;
    }
    return null;
  }
  const behindOf = (thief, victim) => Math.abs(angDiff(victim.ang, Math.atan2(thief.y - victim.y, thief.x - victim.x))) > 1.9;
  function lift(thief, victim) {
    const behind = behindOf(thief, victim);
    const felt = !victim.asleep && !behind && R() < 0.6;
    const wit = witnessOf(thief, victim);
    thief.nextLift = clock() + 1.2;
    if (felt || wit) {
      const who = felt ? victim : wit;
      say(who, 'Thief! Hands off!', 3);
      victim.joy -= 4; thief.joy -= 5; thief.caughtN++;
      if (thief === S.me) { gainRenown(-1); S.stats.caught++; toast('Caught by ' + who.name + '! -1 renown', '#ff6b6b', 3.5); sfx('caught'); }
      else if (S.mode !== 'live' || dist(thief, S.me) < 12) toast(who.name + ' caught ' + thief.name + ' at ' + victim.name + '’s purse', '#ffb03b', 3);
      if (thief !== S.me && thief.caughtN >= 4 && !thief.leaving) { thief.leaving = true; toast(thief.name + ' has been run out of the village', '#ffb03b', 4); }
      return false;
    }
    const n = Math.min(victim.purse, 1 + ((R() * 4) | 0));
    victim.purse -= n; thief.purse += n; victim.joy -= 6;
    thief.lifts++; S.stats.lifts++;
    if (thief === S.me) { progress(thief, 'lift'); toast(n ? 'Lifted ' + n + ' coin from ' + victim.name : victim.name + '’s purse was empty', n ? '#f0d27a' : '#cfc6b4'); sfx('coin'); }
    if (!thief.thief && thief.job < 0 && thief.lifts >= 3) {
      thief.thief = true;
      toast(thief.name + ' has taken up thieving', '#ff9a6b', 4);
      if (thief === S.me) retaskThief(thief);
    }
    return true;
  }
  function retaskThief(v) {
    const i = v.tasks.findIndex((t) => (t.k === 'work' || t.k === 'job') && !t.done);
    if (i >= 0) v.tasks[i] = { k: 'lift', label: 'Lift 3 purses unseen', need: 3, have: 0, reward: { purse: 8 } };
  }

  // ---------- the villagers' own days ----------
  function goTo(v, goals) {
    if (!goals || !goals.length) return 'fail';
    const here = idx(clamp(v.x | 0, 0, MW - 1), clamp(v.y | 0, 0, MH - 1));
    if (goals.includes(here)) return 'here';
    if (S.pathBudget <= 0) { v.wait = 0.2; return 'wait'; }
    S.pathBudget--;
    const p = findPath(v.x, v.y, goals);
    if (!p) return 'fail';
    v.path = p; v.pi = 1;
    return 'going';
  }
  const cellOfXY = (x, y) => idx(clamp(x | 0, 0, MW - 1), clamp(y | 0, 0, MH - 1));
  const entryCell = (b) => { const e = entry(b); return idx(e.x, e.y); };
  function startAct(v, a) {
    if (!a.ok()) return false;
    v.act = { a, t: 0 };
    v.moving = false;
    return true;
  }
  // go and do `a` at one of `goals`; true if that is now what they are doing
  function doAt(v, goals, a) {
    const r = goTo(v, goals);
    if (r === 'here') return startAct(v, a);
    return r === 'going' || r === 'wait';
  }
  function nearestBarn(v) {
    let best = null, bd = 1e9;
    for (const b of B) if (b && b.built && (b.type === 'barn' || b.type === 'camp')) { const d = dist(v, entryC(b)); if (d < bd) { bd = d; best = b; } }
    return best;
  }
  function deliverAI(v) {
    const barn = nearestBarn(v);
    return barn ? doAt(v, [entryCell(barn)], A.deliver(v, barn)) : false;
  }
  function goSleep(v) {
    const h = v.home >= 0 ? B[v.home] : null;
    if (h && h.built) {
      const r = goTo(v, [entryCell(h)]);
      if (r === 'here') { v.inside = true; v.asleep = true; if (v.carry && v.carry.g !== 'water') deliverLater(v); return true; }
      return r !== 'fail';
    }
    // nowhere to sleep: a blanket on the green
    const r = goTo(v, [cellOfXY(HOME.x + (v.id % 5) - 1, HOME.y + 2 + ((v.id / 5) | 0) % 2)]);
    if (r === 'here' || r === 'fail') { v.asleep = true; return true; }
    return true;
  }
  function deliverLater(v) { if (v.carry) { storeAdd(v.carry.g, v.carry.n); v.carry = null; } }
  function goEat(v) {
    const tav = B.find((b) => b && b.built && b.type === 'tavern' && b.stock > 0);
    if (tav && v.purse >= 2 && (S.t > 12 || v.hunger < 30)) return doAt(v, [entryCell(tav)], A.eatTavern(v, tav));
    if (foodInStore() <= 0) { if (R() < 0.02) say(v, 'Is there nothing to eat?'); return false; }
    const h = v.home >= 0 ? B[v.home] : null;
    const at = h && h.built ? h : nearestBarn(v);
    if (!at) return false;
    return doAt(v, [entryCell(at)], A.eatHome(v));
  }
  function wander(v, anchor, r) {
    anchor = anchor || HOME; r = r || 3;
    for (let k = 0; k < 6; k++) {
      const x = (anchor.x + (R() * 2 - 1) * r) | 0, y = (anchor.y + (R() * 2 - 1) * r) | 0;
      if (!inb(x, y) || !walkable(idx(x, y))) continue;
      if (goTo(v, [idx(x, y)]) === 'going') { v.wait = 1 + R() * 4; return true; }
    }
    v.wait = 1 + R() * 2;
    return true;
  }
  // nothing to do at work: lend a hand at a building site, or loiter by the door
  function idleAtWork(v, b, r) {
    const site = B.find((s) => s && !s.built);
    if (site && !v.carry && doAt(v, [entryCell(site)], A.hammer(v, site))) return true;
    return wander(v, entryC(b), r || 1.5);
  }
  function jobAnchor(v) {
    const b = jobB(v);
    return b ? entryC(b) : HOME;
  }

  function workAI(v) {
    const b = jobB(v);
    const jk = jobKind(v);
    if (!jk || jk === 'waiting') {
      // out of work: raise whatever is going up, or loiter — and maybe lift a purse
      const site = B.find((s) => s && !s.built);
      if (site && !v.thief && doAt(v, [entryCell(site)], A.hammer(v, site))) return true;
      return criminalAI(v);
    }
    if (jk === 'thief') return criminalAI(v);
    const carrying = v.carry;
    switch (jk) {
      case 'farmer': {
        const cells = b.cells, cx = (i) => b.x + (i % b.w), cy = (i) => b.y + ((i / b.w) | 0);
        const pick = (pred) => {
          let bi = -1, bd = 1e9;
          cells.forEach((c, i) => { if (pred(c) && !claimedByOther(v, c)) { const d = Math.hypot(cx(i) + 0.5 - v.x, cy(i) + 0.5 - v.y); if (d < bd) { bd = d; bi = i; } } });
          return bi;
        };
        if (carrying && (carrying.n >= CARRY || pick((c) => c.st === 3 && canCarry(v, c.crop)) < 0)) return deliverAI(v);
        let i = pick((c) => c.st === 3 && canCarry(v, c.crop));
        if (i >= 0) { claimIt(v, cells[i]); return doAt(v, [idx(cx(i), cy(i))], A.harvest(v, b, cells[i])); }
        i = pick((c) => c.st >= 0 && c.st < 3 && !c.wet);
        if (i >= 0) {
          if (v.can <= 0) {
            const spots = waterSpots().concat(bankCells(entryC(b), 12));
            return doAt(v, spots.length ? spots : [], A.fill(v));
          }
          claimIt(v, cells[i]); return doAt(v, [idx(cx(i), cy(i))], A.water(v, b, cells[i]));
        }
        i = pick((c) => c.st < 0);
        if (i >= 0) { claimIt(v, cells[i]); return doAt(v, [idx(cx(i), cy(i))], A.sow(v, b, cells[i])); }
        if (carrying) return deliverAI(v);
        return idleAtWork(v, b, 2);
      }
      case 'woodcutter': {
        if (carrying && carrying.n >= CARRY) return deliverAI(v);
        const e = entry(b);
        let best = -1, bd = 1e9;
        for (let y = Math.max(0, e.y - 16); y < Math.min(MH, e.y + 16); y++) for (let x = Math.max(0, e.x - 16); x < Math.min(MW, e.x + 16); x++) {
          const c = idx(x, y);
          if (tree[c] !== TR.TREE || treeClaim.get(c) && treeClaim.get(c) !== v.id + 1) continue;
          const d = Math.hypot(x - e.x, y - e.y);
          if (d < bd && besideCells(x, y).length) { bd = d; best = c; }
        }
        if (best < 0) return carrying ? deliverAI(v) : idleAtWork(v, b, 2);
        treeClaim.set(best, v.id + 1);
        const r = doAt(v, besideCells(best % MW, (best / MW) | 0), A.chop(v, best));
        if (!r) treeClaim.delete(best);
        return r;
      }
      case 'henwife': {
        if (carrying && (carrying.n >= CARRY || !b.eggs.length)) return deliverAI(v);
        const e = b.eggs.find((x) => !claimedByOther(v, x));
        if (e) { claimIt(v, e); return doAt(v, [cellOfXY(e.x, e.y)], A.egg(v, b, e)); }
        return idleAtWork(v, b);
      }
      case 'dairy':
      case 'shepherd': {
        const verb = jk === 'dairy' ? A.milk : A.shear;
        const a = b.animals.find((x) => x.ready);
        if (carrying && (carrying.n >= CARRY || !a)) return deliverAI(v);
        if (!a) return idleAtWork(v, b);
        if (dist(v, a) < 1.3) { a.hold = 0.5; return startAct(v, verb(v, b, a)); }
        a.hold = 0.3;
        const r = goTo(v, [cellOfXY(a.x, a.y)].concat(besideCells(a.x | 0, a.y | 0)));
        if (r === 'here') { a.hold = 0.5; return startAct(v, verb(v, b, a)); }
        return r !== 'fail';
      }
      case 'baker': case 'smith': case 'tailor': {
        if (carrying) return deliverAI(v);
        const a = (jk === 'baker' ? A.bake : jk === 'smith' ? A.forge : A.sew)(v, b);
        if (!a.ok()) return idleAtWork(v, b);
        return doAt(v, [entryCell(b)], a);
      }
      case 'cook': {
        if (carrying) return deliverAI(v);
        const a = A.cook(v, b);
        if (!a.ok()) return idleAtWork(v, b);
        return doAt(v, [entryCell(b)], a);
      }
      case 'trader': {
        if (carrying && GOODS[carrying.g]) return doAt(v, [entryCell(b)], A.sell(v, b));
        const barn = nearestBarn(v);
        if (!barn || !surplus()) return idleAtWork(v, b);
        return doAt(v, [entryCell(barn)], A.take(v, barn));
      }
      case 'barber': {
        const a = A.cut(v, b);
        if (!a.ok()) return doAt(v, [entryCell(b)], { label: 'wait', dur: 0.3, anim: 'idle', ok: () => true, run: () => {} });
        return doAt(v, [entryCell(b)], a);
      }
    }
    return false;
  }
  const treeClaim = new Map();

  function criminalAI(v) {
    const tempted = v.thief || (v.job < 0 && (v.idleDays >= 1 || v.purse < 3) && v.mood < 62);
    if (tempted && clock() >= v.nextLift) {
      // someone out in the open, with a purse, preferably with their back to us
      let mark = null, md = 1e9;
      for (const o of V) {
        if (o === v || o.gone || o.inside || o.asleep || o.purse <= 0 || o.thief) continue;
        const d = dist(o, v);
        if (d < md && d < 18) { md = d; mark = o; }
      }
      if (mark) {
        if (md < 1.1) { lift(v, mark); v.wait = 1.5; return true; }
        // come up behind them
        const bx = mark.x - Math.cos(mark.ang) * 0.8, by = mark.y - Math.sin(mark.ang) * 0.8;
        const c = cellOfXY(bx, by);
        const r = goTo(v, walkable(c) ? [c] : [cellOfXY(mark.x, mark.y)]);
        if (r === 'going') { v.path.length = Math.min(v.path.length, v.pi + 6); v.hunt = mark.id; }
        if (r === 'here') { lift(v, mark); v.wait = 1.5; }
        return r !== 'fail';
      }
    }
    return wander(v, HOME, 5);
  }

  function evening(v) {
    // the barber and the clothes shop, for anyone with a purse to spend
    if (v.purse >= 8 && !v.shopped && R() < 0.3) {
      v.shopped = true;
      const bar = B.find((b) => b && b.built && b.type === 'barber' && b.workers.length);
      const tai = B.find((b) => b && b.built && b.type === 'tailor' && b.workers.length && (S.store.clothes || 0) > 0);
      if (bar && (v.lastCut || 0) < S.day - 2 && R() < 0.6) {
        return doAt(v, [entryCell(bar)], { label: 'Wait for a haircut', dur: 1.2, anim: 'idle', ok: () => true,
          run: () => { bar.q = bar.q.filter((id) => id !== v.id); } , start: () => { if (!bar.q.includes(v.id)) bar.q.push(v.id); } });
      }
      if (tai) {
        return doAt(v, [entryCell(tai)], { label: 'Buy clothes', dur: 0.25, anim: 'talk', ok: () => (S.store.clothes || 0) > 0 && v.purse >= 8,
          run: () => { S.store.clothes--; v.purse -= 8; S.coins += 8; v.look = Object.assign({}, v.look, { coat: (R() * COATS.length) | 0, legs: (R() * LEG_COLS.length) | 0 }); v.joy += 12; say(v, 'Do you like it?'); } });
      }
    }
    const tav = B.find((b) => b && b.built && b.type === 'tavern');
    if (tav) return wander(v, entryC(tav), 2);
    return wander(v, HOME, 3);
  }

  function think(v) {
    if (v.leaving) {
      const r = goTo(v, [idx(MW - 1, ROAD_Y), idx(MW - 1, ROAD_Y + 1)]);
      if (r === 'here' || r === 'fail') { v.gone = true; dropClaims(v); assignJob(v, null); v.home = -1; S.stats.left++; }
      return;
    }
    const t = S.t;
    if (t >= v.bedAt || t < v.wakeAt) { goSleep(v); return; }
    const m = mealNow(t);
    if (v.hunger < 22 || (m && !v.ate[m] && v.hunger < 72)) { if (goEat(v)) return; }
    if (workHours(t)) { if (workAI(v)) return; }
    else if (v.carry) { if (deliverAI(v)) return; }
    if (t >= SUPPER + 0.5) { evening(v); return; }
    wander(v, workHours(t) ? jobAnchor(v) : HOME, 3);
  }

  // ---------- moving ----------
  function speedOf(v) {
    const c = cellOfXY(v.x, v.y), g = ground[c];
    let s = WALK * (g === G.PATH || g === G.BRIDGE ? PATH_BONUS : 1);
    if (v.energy < 15) s *= 0.7;
    if (v.hunger < 10) s *= 0.8;
    return s;
  }
  function faceTo(v, dx, dy) {
    if (!dx && !dy) return;
    v.ang = Math.atan2(dy, dx);
    v.dir = Math.abs(dx) > Math.abs(dy) * 1.1 ? (dx < 0 ? 1 : 2) : dy < 0 ? 3 : 0;
  }
  function followPath(v, secs) {
    if (!v.path) return;
    let left = speedOf(v) * secs;
    v.moving = true;
    while (left > 0 && v.path) {
      if (v.pi >= v.path.length) { v.path = null; v.moving = false; break; }
      const c = v.path[v.pi];
      if (!walkable(c)) { v.path = null; v.moving = false; break; }   // something was built across it
      const tx = (c % MW) + 0.5, ty = ((c / MW) | 0) + 0.5;
      const dx = tx - v.x, dy = ty - v.y, d = Math.hypot(dx, dy);
      faceTo(v, dx, dy);
      if (d <= left) { v.x = tx; v.y = ty; left -= d; v.pi++; }
      else { v.x += dx / d * left; v.y += dy / d * left; left = 0; }
    }
    v.anim += secs * 7;
  }

  function updVillager(v, secs, dh) {
    if (v.gone) return;
    // needs
    const awake = !v.asleep;
    v.hunger = clamp(v.hunger - dh * (awake ? 4.2 : 1.6), 0, 100);
    v.energy = clamp(v.energy + dh * (awake ? (v.act && v.act.a.anim !== 'idle' ? -5 : -2.6) : 13), 0, 100);
    v.joy = v.joy > 0 ? Math.max(0, v.joy - dh * 1.5) : Math.min(0, v.joy + dh * 1.5);
    const home = v.home >= 0 && B[v.home] && B[v.home].built;
    const target = 52 + (v.hunger > 50 ? 10 : v.hunger < 20 ? -22 : 0) + (home ? 8 : -16) + (v.energy < 20 ? -10 : 0)
      + (jobKind(v) && jobKind(v) !== 'thief' ? 5 : -6) + clamp(v.joy, -30, 30);
    v.mood += (target - v.mood) * Math.min(1, dh * 0.3);
    if (v.bubble) { v.bubble.t -= secs / Math.max(1, S.speed); if (v.bubble.t <= 0) v.bubble = null; }

    if (v === S.me) return;   // you are walking this one
    if (v.asleep) {
      if (S.t >= v.wakeAt && S.t < v.bedAt) wake(v);
      else return;
    }
    if (v.act) {
      if (v.act.a.start && !v.act.started) { v.act.started = true; v.act.a.start(); }
      v.act.t += dh;
      if (v.act.t >= v.act.a.dur) {
        const a = v.act.a;
        v.act = null;
        if (a.ok()) a.run();
        dropClaims(v);
      }
      return;
    }
    if (v.path) { followPath(v, secs); if (!v.path) v.moving = false; return; }
    v.moving = false;
    if (v.wait > 0) { v.wait -= secs; return; }
    think(v);
  }
  function wake(v) {
    v.asleep = false;
    if (v.inside) {
      v.inside = false;
      const h = B[v.home];
      if (h) { const e = entryC(h); v.x = e.x; v.y = e.y; }
    }
    v.dir = 0; v.ang = Math.PI / 2;
  }

  // ---------- fields, trees and beasts ----------
  function updWorld(dh) {
    for (const b of B) {
      if (!b || !b.built) continue;
      if (b.smokeT > 0) b.smokeT -= dh;
      if (b.cells) for (const c of b.cells) {
        if (c.st >= 0 && c.st < 3 && c.wet) { c.g += dh; if (c.g >= GROW_HOURS) { c.st++; c.g = 0; } }
      }
      const pen = penOf(b);
      if (pen) for (const a of b.animals) updAnimal(b, pen, a, dh);
    }
    for (let c = 0; c < N; c++) {
      const tr = tree[c];
      if (tr !== TR.STUMP && tr !== TR.SAPLING) continue;
      treeT[c] -= dh;
      if (treeT[c] > 0) continue;
      if (tr === TR.STUMP) { tree[c] = TR.SAPLING; treeT[c] = 30; }
      else if (!V.some((v) => !v.gone && cellOfXY(v.x, v.y) === c)) { tree[c] = TR.TREE; treeClaim.delete(c); }
    }
  }
  function updAnimal(b, pen, a, dh) {
    const secs = dh * SEC_PER_HOUR;
    if (a.hold > 0) { a.hold -= secs; }
    else if (a.wait > 0) a.wait -= secs;
    else {
      if (!a.tx) { a.tx = pen.x + 0.6 + R() * (pen.w - 1.2); a.ty = pen.y + 0.8 + R() * (pen.h - 1.3); }
      const dx = a.tx - a.x, dy = a.ty - a.y, d = Math.hypot(dx, dy);
      const sp = (a.kind === 'hen' ? 1.1 : 0.55) * secs;
      if (d < sp) { a.x = a.tx; a.y = a.ty; a.tx = 0; a.wait = 1 + R() * (a.kind === 'hen' ? 3 : 6); }
      else { a.x += dx / d * sp; a.y += dy / d * sp; a.flip = dx < 0; }
    }
    if (a.kind === 'hen') {
      a.layT -= dh;
      if (a.layT <= 0 && S.t > WAKE && S.t < 20) {
        a.layT = 5 + R() * 5;
        if (b.eggs.length < 6) b.eggs.push({ x: a.x, y: a.y + 0.1, claim: 0 });
      }
    }
    if (a.kind === 'sheep' && !a.ready) { a.woolT = (a.woolT || 0) - dh; if (a.woolT <= 0) a.ready = true; }
  }

  // ---------- the day turning ----------
  function dawn() {
    S.day++;
    for (const b of B) {
      if (!b) continue;
      if (b.cells) for (const c of b.cells) c.wet = 0;
      for (const a of b.animals) if (a.kind === 'cow') a.ready = true;
      b.q = [];
    }
    housePeople();
    const living = V.filter((v) => !v.gone);
    for (const v of living) {
      v.ate = {}; v.shopped = false; v.worked = 0;
      if (jobKind(v) === null || jobKind(v) === 'thief') v.idleDays++;
      if (v.mood < 18 && v !== S.me) { v.lowDays++; if (v.lowDays >= 2 && !v.leaving) { v.leaving = true; toast(v.name + ' has had enough and is leaving', '#ffb03b', 4); } }
      else v.lowDays = 0;
      makeTasks(v);
    }
    // somebody new, if there is a bed and the place is doing well
    const spare = beds() - living.filter((v) => v.home >= 0).length;
    const avgMood = living.reduce((n, v) => n + v.mood, 0) / Math.max(1, living.length);
    if (spare > 0 && avgMood >= 45 && foodInStore() >= living.length) {
      const k = spare >= 3 ? 2 : 1;
      for (let i = 0; i < k; i++) arrive();
    }
    save();
  }
  function arrive() {
    const used = new Set(V.map((v) => v.name));
    const name = NAMES.find((n) => !used.has(n)) || 'Newcomer ' + (V.length + 1);
    const v = makeVillager(name, MW - 0.5, ROAD_Y + 0.5 + (V.length % 2));
    v.hunger = 70; v.purse = 3 + ((R() * 6) | 0);
    makeTasks(v);
    housePeople();
    S.stats.arrived++;
    gainRenown(1);
    toast(name + ' has come down the road to live here', '#8fd0ff', 4);
    sfx('arrive');
    return v;
  }
  function dusk() {
    // wages for a day's work, and two coin from each to the village chest
    let tithe = 0;
    for (const v of V) if (!v.gone && (v.worked || 0) >= 3) { v.purse += 3; tithe += 2; }
    S.coins += tithe;
  }

  // ---------- painting the valley ----------
  const baseCv = document.createElement('canvas');
  const miniCv = document.createElement('canvas');
  baseCv.width = MW * T; baseCv.height = MH * T;
  miniCv.width = MW; miniCv.height = MH;

  function paintGround(b, x, y) {
    const c = idx(x, y), g = ground[c], px = x * T, py = y * T;
    const hsh = (k) => cellHash(x, y, k);
    // grass under everything that is not water
    if (g !== G.WATER) {
      const r = hsh(1);
      if (!tile(b, r < 0.05 ? 2 : r < 0.2 ? 1 : 0, px, py)) { b.fillStyle = '#6fae4a'; b.fillRect(px, py, T, T); }
    }
    if (g === G.PATH) {
      // Tiny Town's dirt, with its grassy lip borrowed off the edge tiles wherever the path ends
      const isP = (i, j) => inb(i, j) && (ground[idx(i, j)] === G.PATH || ground[idx(i, j)] === G.BRIDGE);
      if (!tile(b, 25, px, py)) { b.fillStyle = '#e4a672'; b.fillRect(px, py, T, T); }
      if (!isP(x, y - 1)) tile(b, 13, px, py, 'town', 0, 0, 16, 4);
      if (!isP(x, y + 1)) tile(b, 37, px, py, 'town', 0, 12, 16, 4);
      if (!isP(x - 1, y)) tile(b, 24, px, py, 'town', 0, 0, 4, 16);
      if (!isP(x + 1, y)) tile(b, 26, px, py, 'town', 12, 0, 4, 16);
      if (!isP(x - 1, y) && !isP(x, y - 1)) tile(b, 12, px, py, 'town', 0, 0, 5, 5);
      if (!isP(x + 1, y) && !isP(x, y - 1)) tile(b, 14, px, py, 'town', 11, 0, 5, 5);
      if (!isP(x - 1, y) && !isP(x, y + 1)) tile(b, 36, px, py, 'town', 0, 11, 5, 5);
      if (!isP(x + 1, y) && !isP(x, y + 1)) tile(b, 38, px, py, 'town', 11, 11, 5, 5);
      if (hsh(4) < 0.15) tile(b, 39 + ((hsh(5) * 3) | 0), px, py, 'town', 4, 4, 8, 8);
      return;
    }
    if (g === G.WATER || g === G.BRIDGE) {
      const dc = Math.abs(x + 0.5 - riverCx(y)) / 2.1;
      b.fillStyle = dc < 0.45 ? '#3a78a8' : dc < 0.8 ? '#4388b8' : '#4f96c4';
      b.fillRect(px, py, T, T);
      b.fillStyle = 'rgba(255,255,255,0.06)';
      for (let r = 0; r < 4; r++) b.fillRect(px + ((hsh(60 + r) * 10) | 0), py + r * 4 + 1, 4 + ((hsh(70 + r) * 5) | 0), 1);
      // grassy banks with a dark lip
      const land = (i, j) => inb(i, j) && ground[idx(i, j)] !== G.WATER && ground[idx(i, j)] !== G.BRIDGE;
      if (land(x - 1, y)) { b.fillStyle = '#5c9a3e'; b.fillRect(px, py, 2, T); b.fillStyle = OUT; b.fillRect(px + 2, py, 1, T); }
      if (land(x + 1, y)) { b.fillStyle = '#5c9a3e'; b.fillRect(px + T - 2, py, 2, T); b.fillStyle = OUT; b.fillRect(px + T - 3, py, 1, T); }
      if (g === G.BRIDGE) {
        b.fillStyle = OUT; b.fillRect(px, py, T, T);
        for (let i = 0; i < 4; i++) {
          b.fillStyle = i % 2 ? '#a0714a' : '#94673f';
          b.fillRect(px + i * 4, py + 1, 3, 14);
          b.fillStyle = '#b8875a'; b.fillRect(px + i * 4, py + 1, 3, 1);
        }
        const rail = (yy) => { b.fillStyle = OUT; b.fillRect(px, py + yy, T, 3); b.fillStyle = '#7a5433'; b.fillRect(px, py + yy + 1, T, 1); };
        if (!(inb(x, y - 1) && ground[idx(x, y - 1)] === G.BRIDGE)) rail(0);
        if (!(inb(x, y + 1) && ground[idx(x, y + 1)] === G.BRIDGE)) rail(13);
      }
    }
  }

  // ---------- the buildings ----------
  // Each is painted once onto its own canvas, a tile taller than it stands so the
  // chimneys and signs have somewhere to go; the bake and the ghosts both use it.
  const ROOF = { red: [52, 53, 54, 64, 65, 66, 67], grey: [48, 49, 50, 60, 61, 62, 63] };
  const WALL = { wood: { l: 72, m: 73, r: 75, win: 84, door: 85, open: 74 }, stone: { l: 76, m: 77, r: 79, win: 88, door: 89, open: 78 } };
  const LOOKS = {
    house: { roof: 'red', wall: 'wood', chimney: true },
    wood: { roof: 'grey', wall: 'wood', open: true, sign: 'logs' },
    bakery: { roof: 'grey', wall: 'stone', chimney: true, sign: 'bread' },
    smith: { roof: 'grey', wall: 'stone', chimney: true, sign: 'tools', open: true },
    tavern: { roof: 'red', wall: 'wood', chimney: true, sign: 'bowl' },
    barber: { roof: 'red', wall: 'stone', sign: 'scissors', pole: true },
    tailor: { roof: 'grey', wall: 'wood', sign: 'clothes' },
  };
  function paintHouse(g, ox, oy, w, h, lk, door, v) {
    const roof = ROOF[lk.roof], wall = WALL[lk.wall];
    const gable = lk.gable !== false ? door : -1;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const x = ox + i * T, y = oy + j * T;
      const col = i === 0 ? 0 : i === w - 1 ? 2 : 1;
      let n;
      if (j < h - 1) {
        n = j < h - 2 ? roof[col] : roof[3 + col];
        if (j === h - 2 && i === gable && col === 1) n = roof[6];
      } else n = col === 0 ? wall.l : col === 2 ? wall.r : i === door ? (lk.open ? wall.open : wall.door) : ((i + v) % 2 ? wall.win : wall.m);
      if (w === 1 || (w === 2 && j === h - 1 && i === door)) n = j < h - 1 ? n : wall.door;
      if (!tile(g, n, x, y)) { g.fillStyle = j < h - 1 ? (lk.roof === 'red' ? '#c0543f' : '#61718a') : '#c98a52'; g.fillRect(x, y, T, T); }
    }
    if (lk.chimney) {
      const cx = ox + (door === w - 1 ? 0 : w - 1) * T + 5, cy = oy - 3;
      g.fillStyle = OUT; g.fillRect(cx - 1, cy - 1, 7, 10);
      g.fillStyle = '#8a5a44'; g.fillRect(cx, cy, 5, 8);
      g.fillStyle = '#a87058'; g.fillRect(cx, cy, 5, 2);
      g.fillStyle = '#3a2a2a'; g.fillRect(cx + 1, cy, 3, 1);
    }
    if (lk.sign) {
      // a board hung by the door, with what they make on it
      const sx = ox + (door + 1) * T - (door === w - 1 ? T + 8 : 2), sy = oy + (h - 1) * T - 3;
      g.fillStyle = OUT; g.fillRect(sx - 1, sy - 1, 12, 11);
      g.fillStyle = '#c89a62'; g.fillRect(sx, sy, 10, 9);
      const ic = lk.sign === 'bread' ? goodIcon('bread') : ICON[lk.sign];
      if (ic) g.drawImage(ic, sx + 1, sy + 1, 8, 7);
    }
    if (lk.pole) {
      const px = ox + (door + 1) * T + 2, py = oy + (h - 1) * T + 1;
      g.fillStyle = OUT; g.fillRect(px - 1, py - 1, 5, 15);
      for (let k = 0; k < 13; k++) { g.fillStyle = k % 4 < 2 ? '#e8e0d0' : '#c83a3a'; g.fillRect(px, py + k, 3, 1); }
      g.fillStyle = '#4a6ab0'; g.fillRect(px, py + 12, 3, 1);
    }
  }
  function paintFence(g, x0, y0, w, h, gate) {
    // posts on every tile corner, two rails between; the gate is a gap on the bottom edge
    const W = w * T, H = h * T;
    const post = (x, y) => { g.fillStyle = OUT; g.fillRect(x - 2, y - 7, 5, 9); g.fillStyle = '#b8753f'; g.fillRect(x - 1, y - 6, 3, 7); g.fillStyle = '#d8955a'; g.fillRect(x - 1, y - 6, 3, 1); };
    const railH = (x1, x2, y) => { g.fillStyle = OUT; g.fillRect(x1, y - 6, x2 - x1, 5); g.fillStyle = '#a8683a'; g.fillRect(x1, y - 5, x2 - x1, 1); g.fillRect(x1, y - 3, x2 - x1, 1); };
    const railV = (x, y1, y2) => { g.fillStyle = OUT; g.fillRect(x - 2, y1, 5, y2 - y1); g.fillStyle = '#a8683a'; g.fillRect(x - 1, y1, 3, y2 - y1); };
    railH(x0 + 1, x0 + W - 1, y0 + 4);
    railV(x0 + 2, y0 + 4, y0 + H - 2);
    railV(x0 + W - 3, y0 + 4, y0 + H - 2);
    for (let i = 0; i < w; i++) if (i !== gate) railH(x0 + i * T + (i === 0 ? 1 : 0), x0 + (i + 1) * T - (i === w - 1 ? 1 : 0), y0 + H);
    for (let i = 0; i <= w; i++) { post(x0 + Math.min(W - 3, Math.max(2, i * T)), y0 + 4); post(x0 + Math.min(W - 3, Math.max(2, i * T)), y0 + H); }
    for (let j = 1; j < h; j++) { post(x0 + 2, y0 + j * T + 4); post(x0 + W - 3, y0 + j * T + 4); }
  }
  function paintPenFloor(g, x0, y0, w, h, kind) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const x = x0 + i * T, y = y0 + j * T;
      if (kind === 'hen') {
        g.fillStyle = 'rgba(214,174,69,0.35)';
        for (let k = 0; k < 6; k++) g.fillRect(x + ((cellHash(i, j, k) * 14) | 0), y + ((cellHash(i, j, k + 9) * 14) | 0), 3, 1);
      }
    }
  }
  function paintBarn(g, ox, oy) {
    // Tiny Farm's barn: the green gable, and the red end wall under it
    const rows = [[93, 94, 95], [105, 106, 107], [117, 118, 119]];
    rows.forEach((r, j) => r.forEach((n, i) => { if (!ftile(g, n, ox + i * T, oy + j * T)) { g.fillStyle = '#4f9a3a'; g.fillRect(ox + i * T, oy + j * T, T, T); } }));
    [90, 91, 92].forEach((n, i) => ftile(g, n, ox + i * T, oy + 3 * T));
    [129, 130, 131].forEach((n, i) => ftile(g, n, ox + i * T, oy + 3 * T));
    [126, 127, 128].forEach((n, i) => { if (!ftile(g, n, ox + i * T, oy + 4 * T)) { g.fillStyle = '#b8433a'; g.fillRect(ox + i * T, oy + 4 * T, T, T); } });
  }
  function paintCamp(g, px, py) {
    // a handcart heaped with sacks and a barrel
    g.fillStyle = 'rgba(20,15,30,0.25)'; g.fillRect(px + 2, py + 13, 22, 3);
    g.fillStyle = OUT; g.fillRect(px + 1, py + 5, 22, 8); g.fillRect(px + 22, py + 8, 9, 2);
    g.fillStyle = '#7a5230'; g.fillRect(px + 2, py + 6, 20, 6);
    g.fillStyle = '#946640'; g.fillRect(px + 2, py + 6, 20, 1); g.fillRect(px + 23, py + 8, 7, 1);
    for (const wx of [6, 18]) {
      g.fillStyle = OUT; g.beginPath(); g.arc(px + wx, py + 12, 3.5, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#5a3b22'; g.beginPath(); g.arc(px + wx, py + 12, 2.2, 0, Math.PI * 2); g.fill();
    }
    const sack = (x, y) => { g.fillStyle = OUT; g.fillRect(x - 1, y - 1, 8, 8); g.fillStyle = '#d8c090'; g.fillRect(x, y, 6, 6); g.fillStyle = '#b89a68'; g.fillRect(x, y + 4, 6, 2); g.fillStyle = '#8a6a3a'; g.fillRect(x + 2, y, 2, 1); };
    sack(px + 3, py); sack(px + 9, py - 2); sack(px + 15, py);
    g.fillStyle = OUT; g.fillRect(px + 20, py - 4, 7, 10); g.fillStyle = '#8a5a34'; g.fillRect(px + 21, py - 3, 5, 8);
    g.fillStyle = '#5a3a22'; g.fillRect(px + 21, py - 1, 5, 1); g.fillRect(px + 21, py + 3, 5, 1);
  }
  function paintStall(g, px, py, awning) {
    const W = 3 * T;
    g.fillStyle = 'rgba(20,15,30,0.25)'; g.fillRect(px + 2, py + 2 * T - 2, W, 3);
    g.fillStyle = OUT; g.fillRect(px + 1, py + T + 2, W - 2, 12);
    g.fillStyle = '#8b5e3c'; g.fillRect(px + 2, py + T + 3, W - 4, 10);
    g.fillStyle = '#a8764e'; g.fillRect(px + 2, py + T + 3, W - 4, 3);
    const goods = ['carrot', 'bread', 'tomato', 'cabbage'];
    goods.forEach((k, i) => { const ic = goodIcon(k); g.drawImage(ic, px + 4 + i * 10, py + T - 1, 10, 10); });
    g.fillStyle = OUT; g.fillRect(px + 2, py + 4, 2, T + 4); g.fillRect(px + W - 4, py + 4, 2, T + 4);
    g.fillStyle = OUT; g.fillRect(px, py, W, 13);
    for (let i = 0; i < W - 2; i += 4) { g.fillStyle = (i / 4) % 2 ? '#ece3d0' : awning; g.fillRect(px + 1 + i, py + 1, Math.min(4, W - 2 - i), 10); }
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(px + 1, py + 1, W - 2, 2);
    for (let i = 0; i < W - 2; i += 4) { g.fillStyle = (i / 4) % 2 ? '#ece3d0' : awning; g.fillRect(px + 2 + i, py + 11, 2, 2); }
  }
  function paintBuilding(b) {
    const cv = document.createElement('canvas');
    cv.width = b.w * T; cv.height = (b.h + 1) * T;
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    const oy = T, d = BT[b.type], v = (b.x * 7 + b.y * 3) % 2;
    const lk = LOOKS[b.type];
    if (lk) paintHouse(g, 0, oy, b.w, b.h, lk, d.door, v);
    else if (b.type === 'barn') paintBarn(g, 0, oy);
    else if (b.type === 'camp') paintCamp(g, 0, oy);
    else if (b.type === 'well') { if (!tile(g, 92, 0, oy)) { g.fillStyle = '#8a5a3a'; g.fillRect(0, oy, T, T); } if (!tile(g, 104, 0, oy + T)) { g.fillStyle = '#888'; g.fillRect(2, oy + T + 2, 12, 12); } }
    else if (b.type === 'market') paintStall(g, 0, oy, ['#b8433a', '#3f7a52', '#35608f', '#c08a2e'][b.id % 4]);
    else if (b.type === 'coop') {
      paintPenFloor(g, 2 * T, oy, 3, 3, 'hen');
      paintHouse(g, 0, oy, 2, 3, { roof: 'red', wall: 'wood', gable: false }, 1, 0);
      paintFence(g, 2 * T, oy, 3, 3, 1);
    } else if (b.type === 'sheep') {
      paintHouse(g, 0, oy + T, 2, 3, { roof: 'grey', wall: 'wood', gable: false }, 0, 0);
      ftile(g, 96, 0, oy); ftile(g, 97, T, oy);
      paintFence(g, 2 * T, oy, 4, 4, 1);
    } else if (b.type === 'cows') {
      paintBarn(g, 0, oy);
      ftile(g, 110, 3 * T + 8, oy + 6); ftile(g, 111, 4 * T + 8, oy + 6);
      paintFence(g, 3 * T, oy, 3, 5, 1);
    }
    return cv;
  }
  function buildingArt(b) {
    const key = b.type + (townOk ? 't' : '') + (farmOk ? 'f' : '');
    if (b.cvKey !== key) { b.cv = paintBuilding(b); b.cvKey = key; }
    return b.cv;
  }
  const ghostArt = {};
  function ghostOf(type) {
    const key = type + (townOk ? 't' : '') + (farmOk ? 'f' : '');
    if (!ghostArt[key]) ghostArt[key] = paintBuilding({ type, x: 0, y: 0, w: BT[type].w, h: BT[type].h, id: 0 });
    return ghostArt[key];
  }

  function bake() {
    const b = baseCv.getContext('2d');
    b.imageSmoothingEnabled = false;
    b.clearRect(0, 0, baseCv.width, baseCv.height);
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) paintGround(b, x, y);
    // shadows fall south-east of anything standing
    b.fillStyle = 'rgba(25,18,35,0.22)';
    for (const s of B) {
      if (!s || !s.built || s.type === 'field') continue;
      b.fillRect((s.x + s.w) * T, s.y * T + 6, 4, s.h * T - 4);
    }
    for (const s of B) if (s && s.built && s.type !== 'field') b.drawImage(buildingArt(s), s.x * T, (s.y - 1) * T);
    // the minimap: one pixel a tile
    const m = miniCv.getContext('2d');
    const img = m.createImageData(MW, MH);
    const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    const GC = ['#6fae4a', '#e0a46e', '#4388b8', '#9a6d44', '#9a6a3e'].map(hex);
    const MC = { camp: '#d8c090', house: '#c0543f', barn: '#b8433a', field: '#9a6a3e', well: '#8a8f98', tavern: '#d8703a', market: '#e0b43a' };
    for (let c = 0; c < N; c++) {
      let col = GC[ground[c]];
      if (tree[c] === TR.TREE) col = hex('#2f6a36');
      else if (tree[c] === TR.ROCK) col = hex('#9aa2aa');
      if (sid[c] >= 0) col = hex(MC[B[sid[c]].type] || '#7a8494');
      img.data.set([col[0], col[1], col[2], 255], c * 4);
    }
    m.putImageData(img, 0, 0);
    S.dirty = false;
  }

  // ---------- trees and things ----------
  function treeKind(c) { const h = cellHash(c % MW, (c / MW) | 0, 7); return h < 0.62 ? 'green' : h < 0.8 ? 'autumn' : 'pine'; }
  function drawTreeAt(g, c, sx, sy) {
    const tr = tree[c];
    if (tr === TR.TREE) {
      const k = treeKind(c);
      g.fillStyle = 'rgba(20,15,30,0.22)'; g.beginPath(); g.ellipse(sx + 9, sy + 14, 7, 3, 0, 0, Math.PI * 2); g.fill();
      if (k === 'pine') { if (!ftile(g, 15, sx, sy)) { g.fillStyle = '#2f7a3a'; g.fillRect(sx + 3, sy, 10, 14); } ftile(g, 3, sx, sy - T + 4); return; }
      const top = k === 'autumn' ? 3 : 4, bot = k === 'autumn' ? 15 : 16;
      if (!tile(g, bot, sx, sy)) { g.fillStyle = '#2f7a3a'; g.fillRect(sx + 3, sy, 10, 14); }
      tile(g, top, sx, sy - T);
    } else if (tr === TR.STUMP) {
      // a round stump: bark below, the cut face on top with its rings
      const el = (x, y, rx, ry, col) => { g.fillStyle = col; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill(); };
      el(sx + 8.5, sy + 13, 5.5, 2.5, OUT);
      g.fillStyle = OUT; g.fillRect(sx + 3, sy + 8, 11, 5);
      g.fillStyle = '#7a4e2e'; g.fillRect(sx + 4, sy + 9, 9, 4);
      el(sx + 8.5, sy + 12.5, 4.5, 1.8, '#7a4e2e');
      g.fillStyle = '#5e3a22'; g.fillRect(sx + 6, sy + 10, 1, 3); g.fillRect(sx + 10, sy + 10, 1, 3);
      el(sx + 8.5, sy + 8.5, 5.5, 2.8, OUT);
      el(sx + 8.5, sy + 8.5, 4.5, 2, '#e0bb82');
      el(sx + 8.5, sy + 8.5, 2.5, 1.1, '#c49460');
      g.fillStyle = '#8a5a34'; g.fillRect(sx + 8, sy + 8, 1, 1);
    } else if (tr === TR.SAPLING) { if (!ftile(g, 81, sx, sy)) { g.fillStyle = '#5a9a3a'; g.fillRect(sx + 6, sy + 6, 4, 8); } }
    else if (tr === TR.ROCK) { if (!ftile(g, cellHash(c, 1, 3) < 0.6 ? 89 : 77, sx, sy)) { g.fillStyle = '#9aa2aa'; g.fillRect(sx + 3, sy + 5, 10, 9); } }
    else if (tr === TR.BUSH) { if (!(cellHash(c, 2, 5) < 0.3 ? ftile(g, 78, sx, sy) : tile(g, 5, sx, sy))) { g.fillStyle = '#3f8a3a'; g.fillRect(sx + 2, sy + 3, 12, 11); } }
  }
  const ANIMAL_TILE = { hen: 122, sheep: 120, cow: 121 };
  function drawAnimal(g, a, sx, sy) {
    const n = ANIMAL_TILE[a.kind];
    g.fillStyle = 'rgba(20,15,30,0.25)'; g.fillRect(sx - 5, sy - 1, 10, 2);
    const bob = a.wait > 0 || a.hold > 0 ? 0 : Math.round(Math.sin(S.real * 12 + a.x) * 0.6);
    g.save();
    if (a.flip) { g.translate(sx * 2, 0); g.scale(-1, 1); }
    if (a.kind === 'sheep' && !a.ready) { g.globalAlpha = 1; }
    if (!ftile(g, n, sx - 8, sy - 14 + bob)) { g.fillStyle = '#f0ead8'; g.fillRect(sx - 5, sy - 8, 10, 7); }
    g.restore();
    if (a.kind === 'sheep' && !a.ready) {
      // freshly shorn: pinker, thinner
      g.fillStyle = 'rgba(232,170,160,0.55)'; g.fillRect(sx - 5, sy - 9 + bob, 10, 6);
    }
  }
  function drawEgg(g, sx, sy) { g.drawImage(ICON.egg, sx - 2, sy - 4); }

  // ---------- drawing ----------
  const cv = document.getElementById('screen');
  const ctx = cv.getContext('2d');
  const view = document.createElement('canvas');
  const vx = view.getContext('2d');
  let zoom = 3, u = 2, liveZoom = 3, buildZoom = 2;
  const cam = { x: 0, y: 0 };
  let vignette = null;
  function fitView() {
    zoom = S.mode === 'live' ? liveZoom : buildZoom;
    const w = Math.ceil(cv.width / zoom), h = Math.ceil(cv.height / zoom);
    if (view.width !== w || view.height !== h) { view.width = w; view.height = h; }
  }
  function resize() {
    const r = document.getElementById('stage').getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.max(1, Math.round(r.width * dpr)); cv.height = Math.max(1, Math.round(r.height * dpr));
    cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px';
    liveZoom = Math.max(1, Math.round(Math.min(cv.width / ((r.width < 600 ? 15 : 24) * T), cv.height / (14 * T))));
    const bz = Math.max(1, liveZoom - 1);
    if (!resize.done) { buildZoom = bz; resize.done = true; }
    buildZoom = clamp(buildZoom, 1, liveZoom + 1);
    u = Math.max(1, Math.round(dpr * clamp(Math.min(r.width / 480, r.height / 300), 1, 2)));
    const g = ctx.createRadialGradient(cv.width / 2, cv.height / 2, Math.min(cv.width, cv.height) * 0.5, cv.width / 2, cv.height / 2, Math.max(cv.width, cv.height) * 0.8);
    g.addColorStop(0, 'rgba(10,6,14,0)'); g.addColorStop(1, 'rgba(10,6,14,0.35)');
    vignette = g;
    fitView();
    snapCam();
  }
  function camTarget() {
    const who = S.mode === 'live' ? S.me : S.follow;
    let x = cam.x, y = cam.y;
    if (who && !who.gone) {
      const h = who.inside && who.home >= 0 && B[who.home] ? entryC(B[who.home]) : who;
      x = h.x * T - view.width / 2; y = (h.y - 0.5) * T - view.height / 2;
    }
    const mx = Math.max(0, MW * T - view.width), my = Math.max(0, MH * T - view.height);
    return { x: view.width > MW * T ? (MW * T - view.width) / 2 : clamp(x, 0, mx), y: view.height > MH * T ? (MH * T - view.height) / 2 : clamp(y, 0, my) };
  }
  function snapCam() { const t = camTarget(); cam.x = t.x; cam.y = t.y; }
  function centreOn(x, y) { cam.x = x * T - view.width / 2; cam.y = y * T - view.height / 2; const t = camTarget(); cam.x = t.x; cam.y = t.y; }

  // light: full by day, blue at night, warm at the ends of it
  function nightness(t) {
    if (t >= 7 && t < 18.5) return 0;
    if (t >= 18.5 && t < 21) return (t - 18.5) / 2.5 * 0.55;
    if (t >= 5 && t < 7) return (7 - t) / 2 * 0.55;
    return 0.55;
  }

  function drawField(b, cx, cy) {
    const alpha = b.built ? 1 : 0.45;
    vx.globalAlpha = alpha;
    for (let j = 0; j < b.h; j++) for (let i = 0; i < b.w; i++) {
      const c = b.cells[j * b.w + i];
      const x = (b.x + i) * T - cx, y = (b.y + j) * T - cy;
      const base = j === 0 ? 12 : j === b.h - 1 ? 36 : 24;
      if (!ftile(vx, base + (c.wet ? 1 : 0), x, y)) { vx.fillStyle = c.wet ? '#8a5a34' : '#c08a5a'; vx.fillRect(x + 2, y, 12, T); }
      if (c.st === 0) {
        vx.fillStyle = '#5a3a22';
        vx.fillRect(x + 5, y + 7, 2, 2); vx.fillRect(x + 9, y + 9, 2, 2);
      } else if (c.st > 0) {
        const n = CROPS[c.crop].stages[c.st - 1];
        ftile(vx, n, x, y - (c.st === 3 ? 1 : 0));
        if (c.st === 3 && Math.sin(S.real * 3 + i + j * 2) > 0.85) { vx.fillStyle = '#fff4b0'; vx.fillRect(x + 12, y + 2, 1, 3); vx.fillRect(x + 11, y + 3, 3, 1); }
      }
    }
    vx.globalAlpha = 1;
  }
  function drawSite(b, cx, cy) {
    const x = b.x * T - cx, y = b.y * T - cy, W = b.w * T, H = b.h * T;
    const f = clamp(b.work / b.need, 0, 1);
    vx.fillStyle = '#c8905c'; vx.fillRect(x, y, W, H);
    vx.fillStyle = 'rgba(90,58,34,0.25)';
    for (let k = 0; k < b.w * b.h; k++) vx.fillRect(x + ((cellHash(b.x, k, 3) * (W - 3)) | 0), y + ((cellHash(b.y, k, 4) * (H - 2)) | 0), 3, 1);
    // what is up so far rises from the ground
    const art = buildingArt(b), shown = Math.round((art.height) * f);
    if (shown > 0) {
      vx.globalAlpha = 0.9;
      vx.drawImage(art, 0, art.height - shown, art.width, shown, x, y - T + art.height - shown, art.width, shown);
      vx.globalAlpha = 1;
    }
    // scaffold
    vx.fillStyle = OUT;
    for (let i = 0; i <= b.w; i++) vx.fillRect(x + Math.min(W - 2, i * T), y - 4, 2, H + 4);
    vx.fillRect(x, y - 4, W, 2); vx.fillRect(x, y + (H >> 1), W, 2);
    vx.fillStyle = '#c89a62';
    for (let i = 0; i <= b.w; i++) vx.fillRect(x + Math.min(W - 2, i * T), y - 3, 1, H + 2);
    // progress
    vx.fillStyle = OUT; vx.fillRect(x + 2, y + H - 5, W - 4, 4);
    vx.fillStyle = '#8fe08f'; vx.fillRect(x + 3, y + H - 4, Math.round((W - 6) * f), 2);
  }

  const PERSON_TOOL = { can: 84, chop: 87 };
  function drawPerson(v, cx, cy, isMe) {
    const sx = Math.round(v.x * T - cx), sy = Math.round(v.y * T - cy);
    if (sx < -20 || sy < -30 || sx > view.width + 20 || sy > view.height + 30) return;
    const spr0 = sprite(v.look, 2, 0);
    if (v.asleep) {
      // asleep out on the green
      vx.save(); vx.translate(sx, sy - 4); vx.rotate(-Math.PI / 2); vx.drawImage(spr0, -9, -6); vx.restore();
      vx.fillStyle = '#e8e0ff';
      const zz = Math.floor(S.real * 1.5) % 3;
      vx.fillRect(sx + 6 + zz * 2, sy - 12 - zz * 3, 3, 1); vx.fillRect(sx + 8 + zz * 2, sy - 11 - zz * 3, 1, 1); vx.fillRect(sx + 6 + zz * 2, sy - 10 - zz * 3, 3, 1);
      return;
    }
    vx.fillStyle = 'rgba(20,12,28,0.3)';
    vx.fillRect(sx - 4, sy - 1, 8, 2); vx.fillRect(sx - 3, sy - 2, 6, 4);
    let frame = v.moving ? (Math.floor(v.anim) % 4) : 0, dy = 0;
    const an = v.act ? v.act.a.anim : null;
    if (an === 'bend') dy = Math.floor(S.real * 4) % 2 ? 1 : 2;
    else if (an === 'chop' || an === 'work') dy = Math.floor(S.real * 6) % 2;
    else if (an === 'eat' || an === 'talk') dy = Math.floor(S.real * 3) % 2;
    const spr = sprite(v.look, v.dir, frame);
    const pic = isMe ? outlined(spr) : spr;
    const o = isMe ? 1 : 0;
    vx.drawImage(pic, sx - 6 - o, sy - 17 + dy - o);
    // what is in their hands
    const hx = v.dir === 1 ? sx - 9 : v.dir === 2 ? sx + 1 : sx - 4;
    if (an && PERSON_TOOL[an] !== undefined) {
      const n = PERSON_TOOL[an];
      const sw = an === 'chop' ? (Math.floor(S.real * 6) % 2 ? -3 : 0) : 0;
      vx.save(); vx.beginPath(); vx.rect(hx - 2, sy - 16, 14, 14); vx.clip();
      vx.drawImage(farm, (n % 12) * 16, ((n / 12) | 0) * 16, 16, 16, hx - 1, sy - 13 + sw, 10, 10);
      vx.restore();
    }
    if (v.carry) {
      const ic = goodIcon(v.carry.g);
      vx.drawImage(ic, sx - 5, sy - 25 + dy, 10, 10);
      if (v.carry.n > 1) { vx.fillStyle = OUT; vx.fillRect(sx + 3, sy - 20 + dy, 5, 6); vx.fillStyle = '#f3ead6'; tinyNum(v.carry.n, sx + 4, sy - 19 + dy); }
    } else if (v.bucket) ftile(vx, 73, sx - (v.dir === 1 ? 10 : -2), sy - 11) || vx.fillRect(sx + 3, sy - 8, 4, 4);
    else if (v.gift) vx.drawImage(goodIcon(v.gift), sx - 4, sy - 22 + dy, 8, 8);
    if (v === S.follow && S.mode === 'build' || isMe) {
      const bob = Math.round(Math.sin(S.real * 4) * 1.5);
      vx.fillStyle = OUT; vx.fillRect(sx - 3, sy - 26 + bob - (v.carry ? 9 : 0), 7, 4);
      vx.fillStyle = isMe ? '#f0d27a' : '#8fd0ff'; vx.fillRect(sx - 2, sy - 25 + bob - (v.carry ? 9 : 0), 5, 2);
      vx.fillRect(sx - 1, sy - 23 + bob - (v.carry ? 9 : 0), 3, 1);
    }
  }
  // three-by-five digits, for the numbers on carried bundles
  const DIG = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001', '111100111001111', '111100111101111', '111001001001001', '111101111101111', '111101111001111'];
  function tinyNum(n, x, y) {
    const s = String(n);
    for (let k = 0; k < s.length; k++) {
      const d = DIG[+s[k]];
      for (let i = 0; i < 15; i++) if (d[i] === '1') vx.fillRect(x + k * 4 + (i % 3), y + ((i / 3) | 0), 1, 1);
    }
  }

  function drawWorld(dt) {
    fitView();
    const t = camTarget();
    const k = S.mode === 'live' || S.follow ? 1 - Math.exp(-dt * 8) : 1;
    cam.x += (t.x - cam.x) * k; cam.y += (t.y - cam.y) * k;
    const cx = Math.round(cam.x), cy = Math.round(cam.y);
    vx.imageSmoothingEnabled = false;
    vx.fillStyle = '#2f6a36'; vx.fillRect(0, 0, view.width, view.height);
    if (S.dirty) bake();
    vx.drawImage(baseCv, -cx, -cy);
    const x0 = Math.max(0, Math.floor(cx / T) - 1), y0 = Math.max(0, Math.floor(cy / T) - 1);
    const x1 = Math.min(MW, Math.ceil((cx + view.width) / T) + 1), y1 = Math.min(MH, Math.ceil((cy + view.height) / T) + 2);
    // the river moves
    vx.fillStyle = 'rgba(220,240,255,0.35)';
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      if (ground[idx(x, y)] !== G.WATER) continue;
      const h = cellHash(x, y, 90);
      const ph = (S.real * (0.3 + h * 0.4) + h * 7) % 1;
      if (ph < 0.5) vx.fillRect(x * T - cx + ((h * 13 + ph * 6) | 0) % 12, y * T - cy + ((h * 5 + S.real * 3) % 16 | 0), 3, 1);
    }
    for (const b of B) {
      if (!b || b.x > x1 || b.y > y1 || b.x + b.w < x0 || b.y + b.h < y0) continue;
      if (b.type === 'field') drawField(b, cx, cy);
      else if (!b.built) drawSite(b, cx, cy);
      for (const e of b.eggs) drawEgg(vx, Math.round(e.x * T - cx), Math.round(e.y * T - cy));
    }
    // the campfire, drawn live so it flickers; bedrolls round it for anyone without a house
    const camp = B.find((o) => o && o.type === 'camp');
    if (camp) {
      for (const v of V) if (!v.gone && v.asleep && !v.inside && v.home < 0 && dist(v, entryC(camp)) < 4) {
        vx.fillStyle = OUT; vx.fillRect(Math.round(v.x * T - cx) - 8, Math.round(v.y * T - cy) - 5, 16, 7);
        vx.fillStyle = '#6a7aa8'; vx.fillRect(Math.round(v.x * T - cx) - 7, Math.round(v.y * T - cy) - 4, 14, 5);
      }
      const fx = (camp.x + 1) * T - cx + 8, fy = (camp.y + 1) * T - cy + 10;
      vx.fillStyle = OUT; vx.fillRect(fx - 6, fy - 2, 12, 4);
      vx.fillStyle = '#6a4428'; vx.fillRect(fx - 5, fy - 1, 10, 2);
      const fl = Math.floor(S.real * 8) % 3;
      vx.fillStyle = '#e0662a'; vx.fillRect(fx - 3, fy - 6 + (fl === 1 ? 1 : 0), 6, 5);
      vx.fillStyle = '#f0b43a'; vx.fillRect(fx - 2 + (fl === 2 ? 1 : 0), fy - 8 + fl % 2, 3, 6);
      vx.fillStyle = '#fff0a0'; vx.fillRect(fx - 1, fy - 4, 2, 3);
    }
    // everything that stands up, back to front
    const list = [];
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const c = idx(x, y); if (tree[c]) list.push({ y: y + 0.95, tree: c }); }
    for (const b of B) if (b && b.built) for (const a of b.animals) list.push({ y: a.y, a });
    for (const v of V) if (!v.gone && !v.inside) list.push({ y: v.y + (v === S.me ? 0.001 : 0), v });
    list.sort((p, q) => p.y - q.y);
    for (const d of list) {
      if (d.tree !== undefined) drawTreeAt(vx, d.tree, (d.tree % MW) * T - cx, ((d.tree / MW) | 0) * T - cy);
      else if (d.a) drawAnimal(vx, d.a, Math.round(d.a.x * T - cx), Math.round(d.a.y * T - cy));
      else drawPerson(d.v, cx, cy, d.v === S.me);
    }
    // smoke from busy chimneys
    for (const b of B) {
      if (!b || !b.built || !LOOKS[b.type] || !LOOKS[b.type].chimney) continue;
      const busy = b.smokeT > 0 || (b.type === 'house' && housemates(b).some((v) => v.inside) && (S.t < 8 || S.t > 17)) || (b.type === 'tavern' && S.t > 17);
      if (!busy) continue;
      const d = BT[b.type].door;
      const sx = (b.x + (d === b.w - 1 ? 0 : b.w - 1)) * T + 7 - cx, sy = b.y * T - 4 - cy;
      for (let q = 0; q < 3; q++) {
        const ph = (S.real * 0.5 + q / 3) % 1;
        vx.fillStyle = 'rgba(230,230,235,' + (0.55 * (1 - ph)).toFixed(2) + ')';
        const r = 2 + ph * 3;
        vx.fillRect(Math.round(sx + Math.sin(ph * 5 + q) * 3 - r / 2), Math.round(sy - ph * 18), Math.round(r), Math.round(r));
      }
    }
    // night, and the windows that are lit against it
    const nt = nightness(S.t);
    if (nt > 0) {
      vx.fillStyle = 'rgba(16,20,58,' + nt.toFixed(2) + ')'; vx.fillRect(0, 0, view.width, view.height);
      if (camp) {
        const fx = (camp.x + 1) * T - cx + 8, fy = (camp.y + 1) * T - cy + 6;
        const gl = vx.createRadialGradient(fx, fy, 2, fx, fy, 34 + Math.sin(S.real * 9) * 2);
        gl.addColorStop(0, 'rgba(255,180,90,' + (nt * 0.9).toFixed(2) + ')'); gl.addColorStop(1, 'rgba(255,180,90,0)');
        vx.fillStyle = gl; vx.fillRect(fx - 40, fy - 40, 80, 80);
      }
      for (const b of B) {
        if (!b || !b.built || !LOOKS[b.type]) continue;
        const lit = b.type === 'house' ? housemates(b).some((v) => v.inside) && (S.t < 23.5 && S.t > 17 || S.t < 6.5 && S.t > 5)
          : b.type === 'tavern' ? S.t > 17 && S.t < 23.5 : b.workers.some((id) => { const v = vById(id); return v && v.act; });
        if (!lit) continue;
        const wy = (b.y + b.h - 1) * T - cy;
        for (let i = 0; i < b.w; i++) {
          const wx = (b.x + i) * T - cx;
          if (i === BT[b.type].door) { vx.fillStyle = 'rgba(255,196,110,0.5)'; vx.fillRect(wx + 5, wy + 6, 6, 9); }
          else if (i > 0 && i < b.w - 1 || b.w < 3) { vx.fillStyle = 'rgba(255,210,120,0.45)'; vx.fillRect(wx + 4, wy + 4, 8, 7); }
        }
      }
    }
    // the ghost of whatever is about to be placed
    if (S.mode === 'build' && S.tool && hover) drawGhost(cx, cy);
  }

  let hover = null;   // tile under the pointer, in build mode
  function drawGhost(cx, cy) {
    const tool = S.tool;
    if (BT[tool]) {
      const d = BT[tool], gx = hover.x - Math.floor((d.w - 1) / 2), gy = hover.y - Math.floor((d.h - 1) / 2);
      const why = whyNot(tool, gx, gy);
      const x = gx * T - cx, y = gy * T - cy;
      vx.globalAlpha = 0.6;
      if (tool === 'field') { vx.fillStyle = '#b07a4a'; vx.fillRect(x, y, d.w * T, d.h * T); }
      else vx.drawImage(ghostOf(tool), x, y - T);
      vx.globalAlpha = 1;
      vx.strokeStyle = why ? '#ff5a5a' : '#8fe08f'; vx.lineWidth = 1;
      vx.strokeRect(x + 0.5, y + 0.5, d.w * T - 1, d.h * T - 1);
      // where the door opens
      vx.fillStyle = why ? 'rgba(255,90,90,0.5)' : 'rgba(143,224,143,0.5)';
      vx.fillRect((gx + d.door) * T - cx + 3, (gy + d.h) * T - cy + 3, T - 6, T - 6);
      S.hoverWhy = why;
    } else {
      const why = tool === 'path' ? paveWhy(hover.x, hover.y) : tool === 'tree' ? plantWhy(hover.x, hover.y) : (() => { const w = clearWhat(hover.x, hover.y); return !w ? 'Nothing to clear' : w.why || null; })();
      vx.strokeStyle = why ? '#ff5a5a' : tool === 'clear' ? '#ffb03b' : '#8fe08f';
      if (tool === 'clear' && !why) {
        const w = clearWhat(hover.x, hover.y);
        if (w.b) { vx.strokeRect(w.b.x * T - cx + 0.5, w.b.y * T - cy + 0.5, w.b.w * T - 1, w.b.h * T - 1); S.hoverWhy = null; S.hoverLabel = w.label; return; }
        S.hoverLabel = w.label;
      } else S.hoverLabel = null;
      vx.strokeRect(hover.x * T - cx + 0.5, hover.y * T - cy + 0.5, T - 1, T - 1);
      S.hoverWhy = why;
    }
  }

  // ---------- the HUD ----------
  const FONT = 'Silkscreen, ui-monospace, monospace';
  function txt(s, x, y, size, col, align, weight) {
    ctx.font = (weight || 700) + ' ' + Math.round(size * u) + 'px ' + FONT;
    ctx.textAlign = align || 'left'; ctx.textBaseline = 'top';
    ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(2, u * 2);
    ctx.strokeStyle = '#140c10'; ctx.strokeText(s, x, y);
    ctx.fillStyle = col || '#f3ead6'; ctx.fillText(s, x, y);
    return ctx.measureText(s).width;
  }
  function tw(s, size, weight) { ctx.font = (weight || 700) + ' ' + Math.round(size * u) + 'px ' + FONT; return ctx.measureText(s).width; }
  function icon(img, x, y, sc) { ctx.imageSmoothingEnabled = false; ctx.drawImage(img, Math.round(x), Math.round(y), Math.round(img.width * sc * u), Math.round(img.height * sc * u)); }
  function iconSz(img, x, y, s) { ctx.imageSmoothingEnabled = false; ctx.drawImage(img, Math.round(x), Math.round(y), Math.round(s), Math.round(s)); }
  function panel(x, y, w, h) {
    ctx.fillStyle = '#140c10'; ctx.fillRect(x - 2 * u, y - 2 * u, w + 4 * u, h + 4 * u);
    ctx.fillStyle = '#c9b99a'; ctx.fillRect(x - u, y - u, w + 2 * u, h + 2 * u);
    ctx.fillStyle = 'rgba(30,21,25,0.92)'; ctx.fillRect(x, y, w, h);
  }
  function bar(x, y, w, h, f, col, hi) {
    ctx.fillStyle = '#140c10'; ctx.fillRect(x - u, y - u, w + 2 * u, h + 2 * u);
    ctx.fillStyle = '#3a2a30'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = col; ctx.fillRect(x, y, Math.round(w * clamp(f, 0, 1)), h);
    ctx.fillStyle = hi; ctx.fillRect(x, y, Math.round(w * clamp(f, 0, 1)), u);
  }
  const toScreen = (wx, wy) => [(wx * T - cam.x) * zoom, (wy * T - cam.y) * zoom];

  function drawHud(dt) {
    const W = cv.width, H = cv.height, m = 6 * u;
    ctx.fillStyle = vignette; ctx.fillRect(0, 0, W, H);
    // speech, over people's heads
    for (const v of V) {
      if (v.gone || v.inside || !v.bubble) continue;
      const [sx, sy] = toScreen(v.x, v.y - 1.6);
      if (sx < -80 || sx > W + 80 || sy < -20 || sy > H) continue;
      const w = tw(v.bubble.text, 7, 400) + 8 * u;
      ctx.fillStyle = '#140c10'; ctx.fillRect(sx - w / 2 - u, sy - 12 * u - u, w + 2 * u, 12 * u + 2 * u);
      ctx.fillStyle = '#f3ead6'; ctx.fillRect(sx - w / 2, sy - 12 * u, w, 12 * u);
      ctx.fillRect(sx - 2 * u, sy, 4 * u, 2 * u);
      ctx.font = '400 ' + Math.round(7 * u) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillStyle = '#2b1d24'; ctx.fillText(v.bubble.text, sx, sy - 10 * u);
    }
    // the clock, top centre
    const cxm = W / 2;
    const clockLine = 'DAY ' + S.day + '  ' + hhmm(S.t);
    const narrow = W < 520 * u;
    const topY = narrow ? m + 70 * u : m;
    txt(clockLine, cxm, topY, 10, '#f3ead6', 'center');
    const part = S.t < WAKE ? 'night' : S.t < WORK_START ? 'breakfast' : S.t < LUNCH ? 'working' : S.t < WORK_AGAIN ? 'lunch' : S.t < SUPPER ? 'working' : S.t < BED ? 'evening' : 'night';
    txt(S.mode === 'live' ? part : (S.speed === 0 ? 'paused' : part + (S.speed > 1 ? '  ×' + S.speed : '')), cxm, topY + 13 * u, 7, '#cfc6b4', 'center', 400);
    if (S.mode === 'live') drawLiveHud(W, H, m, narrow); else drawBuildHud(W, H, m, narrow);
    drawMinimap(W - m - 110 * u, m, 110 * u, 76 * u);
    // messages
    let ty = topY + 28 * u;
    for (const t of S.toasts) {
      t.t -= dt;
      ctx.globalAlpha = clamp(t.t * 2, 0, 1);
      txt(t.text, cxm, ty, 7, t.col, 'center');
      ctx.globalAlpha = 1;
      ty += 11 * u;
    }
    S.toasts = S.toasts.filter((t) => t.t > 0);
    if (S.banner) {
      const b = S.banner;
      b.t -= dt;
      ctx.globalAlpha = clamp(Math.min(b.t, 4 - b.t) * 2, 0, 1);
      const yy = H * 0.32;
      ctx.fillStyle = 'rgba(20,12,16,0.6)'; ctx.fillRect(0, yy - 8 * u, W, 48 * u);
      txt(b.title, cxm, yy - 3 * u, 14, '#f0d27a', 'center');
      txt(b.sub, cxm, yy + 14 * u, 8, '#f3ead6', 'center', 400);
      txt(b.extra, cxm, yy + 26 * u, 7, '#bfe39a', 'center', 400);
      ctx.globalAlpha = 1;
      if (b.t <= 0) S.banner = null;
    }
    if (S.paused) {
      ctx.fillStyle = 'rgba(10,6,14,0.5)'; ctx.fillRect(0, 0, W, H);
      txt('PAUSED', W / 2, H / 2 - 10 * u, 16, '#f3ead6', 'center');
      txt('P TO CARRY ON', W / 2, H / 2 + 10 * u, 8, '#cfc6b4', 'center');
    }
  }

  function drawBuildHud(W, H, m) {
    // the village's purse and stores, top left
    const rows = [
      [ICON.coin, S.coins + ' coin'],
      [ICON.star, S.renown + ' renown'],
      [ICON.logs, (S.store.logs || 0) + ' logs'],
      [ICON.bowl, foodInStore() + ' food'],
      [ICON.person, pop() + ' / ' + beds() + ' beds'],
    ];
    const w = 92 * u, h = rows.length * 12 * u + 16 * u;
    panel(m, m, w, h);
    rows.forEach(([ic, s], i) => {
      const y = m + 4 * u + i * 12 * u;
      iconSz(ic, m + 4 * u, y + u, 8 * u);
      txt(s, m + 16 * u, y, 8, '#f3ead6');
    });
    const used = storeUsed(), cap = storeCap();
    txt((built('barn') ? 'BARN ' : 'STORES ') + used + '/' + cap, m + 4 * u, m + h - 11 * u, 7, used >= cap ? '#ff8a6b' : '#cfc6b4', 'left', 400);
    // why the thing in hand cannot go here
    if (S.tool && hover && (S.hoverWhy || S.hoverLabel) && pointer) {
      const s = S.hoverWhy || S.hoverLabel;
      const x = clamp(pointer.x * (cv.width / cv.clientWidth), 60 * u, W - 60 * u), y = pointer.y * (cv.height / cv.clientHeight) + 18 * u;
      const ww = tw(s, 7, 700) + 10 * u;
      ctx.fillStyle = 'rgba(20,12,16,0.85)'; ctx.fillRect(x - ww / 2, y - 2 * u, ww, 13 * u);
      txt(s, x, y, 7, S.hoverWhy ? '#ff8a6b' : '#ffd27a', 'center');
    }
  }

  function drawLiveHud(W, H, m, narrow) {
    const v = S.me;
    // who you are, and how you are
    const w = 118 * u;
    panel(m, m, w, (jobKind(v) === 'farmer' ? 96 : 85) * u);
    const pic = sprite(v.look, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(pic, 0, 0, 12, 14, m + 3 * u, m + 3 * u, 12 * 2 * u, 14 * 2 * u);
    txt(v.name.toUpperCase(), m + 30 * u, m + 3 * u, 9, '#f0d27a');
    txt(jobTitle(v), m + 30 * u, m + 15 * u, 7, v.thief ? '#ff9a6b' : '#cfc6b4', 'left', 400);
    iconSz(ICON.bowl, m + 4 * u, m + 34 * u, 8 * u);
    bar(m + 16 * u, m + 36 * u, w - 20 * u, 4 * u, v.hunger / 100, v.hunger < 25 ? '#e0663a' : '#d8a13a', '#f0c870');
    iconSz(ICON.bolt, m + 5 * u, m + 45 * u, 7 * u);
    bar(m + 16 * u, m + 47 * u, w - 20 * u, 4 * u, v.energy / 100, v.energy < 20 ? '#6a7aa8' : '#6ab0e0', '#a8d8ff');
    let ry = m + 57 * u;
    iconSz(ICON.coin, m + 2 * u, ry + u, 7 * u); txt(v.purse + ' in purse', m + 12 * u, ry, 7, '#f3ead6');
    ry += 11 * u;
    iconSz(ICON.heart, m + 2 * u, ry + u, 7 * u); txt('mood ' + Math.round(v.mood), m + 12 * u, ry, 7, v.mood < 30 ? '#ff8a6b' : '#f3ead6', 'left', 400);
    if (jobKind(v) === 'farmer') { ry += 11 * u; ftileHud(84, m + u, ry - u, 9 * u); txt('can ' + v.can + '/' + CAN, m + 12 * u, ry, 7, v.can ? '#8fd0ff' : '#ff8a6b', 'left', 400); }
    // today's list, down the right under the map
    const lx = W - m - 150 * u, ly = m + 84 * u;
    const lines = v.tasks;
    const lh = 12 * u;
    if (!narrow || S.showTasks) {
      panel(lx, ly, 150 * u, lines.length * lh + 16 * u);
      txt('TODAY', lx + 4 * u, ly + 3 * u, 8, '#f0d27a');
      lines.forEach((t, i) => {
        const y = ly + 15 * u + i * lh;
        const col = t.done ? '#8fe08f' : t.failed ? '#7a6a70' : '#f3ead6';
        if (t.done) iconSz(ICON.tick, lx + 3 * u, y + u, 6 * u);
        else { ctx.fillStyle = t.failed ? '#5a4a50' : '#c9b99a'; ctx.fillRect(lx + 3 * u, y + u, 6 * u, 6 * u); ctx.fillStyle = '#1e1519'; ctx.fillRect(lx + 4 * u, y + 2 * u, 4 * u, 4 * u); }
        let label = t.label + (t.need && !t.done ? ' ' + t.have + '/' + t.need : '');
        const max = 136 * u;
        while (tw(label, 6, 400) > max && label.length > 4) label = label.slice(0, -2);
        if (label !== t.label + (t.need && !t.done ? ' ' + t.have + '/' + t.need : '')) label += '…';
        txt(label, lx + 12 * u, y, 6, col, 'left', 400);
      });
    } else txt('[T] TODAY', W - m, m + 84 * u, 7, '#f0d27a', 'right');
    // what is in your hands
    const sz = 30 * u, sx = W - m - sz, sy = H - m - sz;
    panel(sx, sy, sz, sz);
    if (v.carry) { iconSz(goodIcon(v.carry.g), sx + 3 * u, sy + 3 * u, sz - 6 * u); txt('x' + v.carry.n, sx + sz - u, sy + sz - 10 * u, 7, '#f3ead6', 'right'); }
    else if (v.bucket) ftileHud(73, sx + 3 * u, sy + 3 * u, sz - 6 * u);
    else if (v.gift) iconSz(goodIcon(v.gift), sx + 3 * u, sy + 3 * u, sz - 6 * u);
    else txt('EMPTY', sx + sz / 2, sy + sz / 2 - 4 * u, 6, '#7a6a70', 'center', 400);
    // what you could do right here
    if (v.act) {
      const [px, py] = toScreen(v.x, v.y - 1.7);
      bar(px - 14 * u, py, 28 * u, 3 * u, v.act.t / v.act.a.dur, '#8fe08f', '#c8ffc8');
      txt(v.act.a.label, W / 2, H - m - 14 * u, 8, '#cfc6b4', 'center', 400);
    } else if (!v.asleep) {
      const acts = S.acts || [];
      const bits = [];
      if (acts[0]) bits.push('[E] ' + acts[0].label);
      if (acts[1]) bits.push('[R] ' + acts[1].label);
      if (S.liftable) bits.push('[Q] Pick ' + S.liftable.name + '’s pocket');
      if (bits.length) {
        const y0 = H - m - 14 * u - (bits.length - 1) * 12 * u;
        bits.forEach((s, i) => txt(s, W / 2, y0 + i * 12 * u, 8, i === 0 ? '#f3ead6' : '#cfc6b4', 'center'));
      } else if (S.hint) txt(S.hint, W / 2, H - m - 14 * u, 7, '#cfc6b4', 'center', 400);
    } else txt('ASLEEP…', W / 2, H - m - 14 * u, 9, '#cfc6ff', 'center');
  }
  function ftileHud(n, x, y, s) { if (farmOk) { ctx.imageSmoothingEnabled = false; ctx.drawImage(farm, (n % 12) * 16, ((n / 12) | 0) * 16, 16, 16, Math.round(x), Math.round(y), Math.round(s), Math.round(s)); } }

  function drawMinimap(x, y, w, h) {
    panel(x, y, w, h);
    const per = Math.min(w / MW, h / MH);
    const dx = x + (w - MW * per) / 2, dy = y + (h - MH * per) / 2;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(miniCv, 0, 0, MW, MH, dx, dy, MW * per, MH * per);
    for (const v of V) {
      if (v.gone || v.inside) continue;
      ctx.fillStyle = v === S.me ? '#f0d27a' : v === S.follow ? '#8fd0ff' : v.thief ? '#ff6b6b' : '#f3ead6';
      const s = v === S.me || v === S.follow ? 3 * u : 1.5 * u;
      ctx.fillRect(Math.round(dx + v.x * per - s / 2), Math.round(dy + v.y * per - s / 2), Math.ceil(s), Math.ceil(s));
    }
    // the view
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = Math.max(1, u / 2);
    ctx.strokeRect(dx + cam.x / T * per, dy + cam.y / T * per, view.width / T * per, view.height / T * per);
    miniRect = { x: dx, y: dy, per };
  }
  let miniRect = null;

  function render(dt) {
    ctx.imageSmoothingEnabled = false;
    drawWorld(dt);
    ctx.drawImage(view, 0, 0, view.width, view.height, 0, 0, view.width * zoom, view.height * zoom);
    if (S.mode !== 'title') drawHud(dt);
  }

  // ---------- messages ----------
  function toast(text, col, dur) { S.toasts.push({ text, col: col || '#f3ead6', t: dur || 2.6 }); if (S.toasts.length > 4) S.toasts.shift(); }
  function banner(title, sub, extra) { S.banner = { title, sub: sub || '', extra: extra || '', t: 4 }; }
  function coinPop(v, n) { if (v === S.me) toast('+' + n + ' coin for the village', '#f0d27a', 1.6); }

  // ---------- living as someone ----------
  function openTask(v, k) { return v.tasks.find((t) => t.k === k && !t.done && !t.failed); }
  function chatLine(o) {
    const jk = jobKind(o), lines = [];
    if (o.hunger < 30) lines.push('I could eat a horse.', 'Is there anything in the barn?');
    if (o.energy < 25) lines.push('I’m dead on my feet.');
    if (o.thief) lines.push('Nothing to see here.', 'Lovely purse you’ve got.');
    else if (!jk) lines.push('Know anyone who’s hiring?', 'Idle hands, they say…');
    if (jk === 'farmer') { const b = jobB(o); lines.push('The ' + CROPS[b.crop].name.toLowerCase() + ' want water.', 'Rain would be nice.'); }
    if (jk === 'woodcutter') lines.push('Mind the stumps.', 'Plenty of oak out east.');
    if (jk === 'baker') lines.push('Wheat, wheat and more wheat.', 'Bread’s up!');
    if (jk === 'trader') lines.push('Travellers pay well for good tools.');
    if (o.mood > 70) lines.push('Lovely day for it!', 'Morning!');
    if (o.mood < 35) lines.push('Leave me be.', 'I’ve had better days.');
    lines.push('Hello there.', 'All right?', 'Evening.'.replace('Evening', S.t > 17 ? 'Evening' : 'Afternoon'));
    return lines[(R() * lines.length) | 0];
  }
  function talkA(v, o) {
    const gt = openTask(v, 'gift');
    const giving = v.gift && (!gt || gt.who === o.id);
    return {
      label: giving ? 'Give ' + o.name + ' the ' + GOODS[v.gift].name.toLowerCase() : 'Talk to ' + o.name, dur: 0.05, anim: 'talk', ok: () => !o.gone,
      run: () => {
        faceTo(o, v.x - o.x, v.y - o.y);
        if (giving) {
          o.hunger = Math.min(100, o.hunger + GOODS[v.gift].food); o.joy += 10; v.gift = null;
          say(o, 'For me? That’s kind!'); progress(v, 'gift', o.id);
        } else say(o, chatLine(o));
        v.joy += 1;
        progress(v, 'hello', o.id);
      },
    };
  }
  function sleepA(v) {
    return { label: 'Go to bed', dur: 0.02, anim: 'idle', ok: () => S.t >= 19.5 || S.t < WAKE,
      run: () => {
        if (S.t >= 19 && S.t < 23) progress(v, 'bed');
        v.inside = true; v.asleep = true; v.wakeAt = WAKE + 0.25;
        toast('Goodnight, ' + v.name, '#cfc6ff');
      } };
  }
  function sleepRough(v) {
    return { label: 'Sleep by the fire', dur: 0.02, anim: 'idle', ok: () => S.t >= 19.5 || S.t < WAKE,
      run: () => {
        if (S.t >= 19 && S.t < 23) progress(v, 'bed');
        v.asleep = true; v.wakeAt = WAKE + 0.25;
        toast('Goodnight, ' + v.name + ' — a bed would be better', '#cfc6ff');
      } };
  }
  function styleA(v, kind) {
    return kind === 'barber'
      ? { label: 'Get a haircut (4 coin)', dur: 0, anim: 'idle', ok: () => v.purse >= 4, run: () => openStyle('barber') }
      : { label: 'Buy new clothes (8 coin)', dur: 0, anim: 'idle', ok: () => v.purse >= 8 && (S.store.clothes || 0) > 0, run: () => openStyle('tailor') };
  }
  function actionsFor(v) {
    const out = [];
    const add = (a) => { if (a && a.ok()) out.push(a); };
    const jb = jobB(v), jk = jobKind(v);
    const here = cellOfXY(v.x, v.y);
    S.hint = null;
    for (const b of B) {
      if (!b) continue;
      const e = entryC(b);
      if (Math.abs(e.x - v.x) > 0.95 || Math.abs(e.y - v.y) > 0.95) continue;
      if (!b.built) { add(A.hammer(v, b)); continue; }
      if (b === jb) {
        if (jk === 'baker') add(A.bake(v, b));
        if (jk === 'smith') add(A.forge(v, b));
        if (jk === 'tailor') add(A.sew(v, b));
        if (jk === 'cook') add(A.cook(v, b));
        if (jk === 'trader' && v.carry) add(A.sell(v, b));
        if (jk === 'barber') { add(A.cut(v, b)); if (!b.q.length) S.hint = 'Nobody waiting for a cut just now'; }
        if (!out.length && !S.hint) S.hint = jk === 'baker' ? 'No wheat in the barn to bake with' : jk === 'smith' ? 'Needs 2 logs in the barn' : jk === 'tailor' ? 'Needs 2 wool in the barn' : jk === 'cook' ? 'Needs food in the barn, and room in the pot' : jk === 'trader' ? 'Fetch goods from the barn to sell' : null;
      }
      if (b.type === 'barn' || b.type === 'camp') {
        if (b.type === 'camp' && v.home < 0) add(sleepRough(v));
        add(A.deliver(v, b));
        if (jk === 'trader') add(A.take(v, b));
        if (openTask(v, 'gift')) add(A.takeGift(v));
        if (v.home < 0 && v.hunger < 90) add(A.eatHome(v));
      }
      if (b.type === 'house' && b.id === v.home) {
        add(A.pourHome(v));
        if (v.hunger < 90) add(A.eatHome(v));
        add(sleepA(v));
      }
      if (b.type === 'well') { if (jk === 'farmer') add(A.fill(v)); if (openTask(v, 'water')) add(A.bucket(v)); }
      if (b.type === 'tavern' && v.hunger < 92) add(A.eatTavern(v, b));
      if ((b.type === 'barber' || b.type === 'tailor') && b.workers.length && b !== jb) add(styleA(v, b.type));
      if (openings(b) > 0 && b !== jb) add(A.ask(v, b));
    }
    if (jk === 'farmer' && jb && sid[here] === jb.id) {
      const c = jb.cells[(((here / MW) | 0) - jb.y) * jb.w + (here % MW - jb.x)];
      if (c) {
        add(A.harvest(v, jb, c)); add(A.water(v, jb, c)); add(A.sow(v, jb, c));
        if (c.st >= 0 && c.st < 3 && !c.wet && v.can <= 0) S.hint = 'Your can is empty: fill it at a well or the river';
        if (c.st === 3 && !canCarry(v, c.crop)) S.hint = 'Your hands are full: take it to the barn';
      }
    }
    if (jk === 'farmer' && nearWater(v.x, v.y)) add(A.fill(v));
    if (jk === 'woodcutter') {
      let best = -1, bd = 1.35;
      for (let j = (v.y | 0) - 1; j <= (v.y | 0) + 1; j++) for (let i = (v.x | 0) - 1; i <= (v.x | 0) + 1; i++) {
        if (!inb(i, j) || tree[idx(i, j)] !== TR.TREE) continue;
        const d = Math.hypot(i + 0.5 - v.x, j + 0.5 - v.y) - (Math.abs(angDiff(v.ang, Math.atan2(j + 0.5 - v.y, i + 0.5 - v.x))) < 0.8 ? 0.3 : 0);
        if (d < bd) { bd = d; best = idx(i, j); }
      }
      if (best >= 0) { add(A.chop(v, best)); if (!canCarry(v, 'logs')) S.hint = 'Your arms are full: take the logs to the barn'; }
    }
    if (jb && jk === 'henwife') { const e = jb.eggs.find((x) => dist(x, v) < 0.9); if (e) add(A.egg(v, jb, e)); }
    if (jb && (jk === 'dairy' || jk === 'shepherd')) {
      const a = jb.animals.find((x) => x.ready && dist(x, v) < 1.3);
      if (a) { const act = (jk === 'dairy' ? A.milk : A.shear)(v, jb, a); act.hold = a; add(act); }
    }
    // people
    let o = null, od = 1.3;
    for (const w of V) { if (w === v || w.gone || w.inside) continue; const d = dist(w, v); if (d < od) { od = d; o = w; } }
    if (o && !o.asleep) out.push(talkA(v, o));
    S.liftable = o && (!jk || jk === 'thief') && o.purse >= 0 && od < 1.1 ? o : null;
    return out;
  }

  function moveMe(v, dx, dy) {
    const r = 0.26;
    const free = (x, y) => {
      for (const [ox, oy] of [[-r, -0.18], [r, -0.18], [-r, 0.18], [r, 0.18]]) {
        const cx = Math.floor(x + ox), cy = Math.floor(y + oy);
        if (!inb(cx, cy) || !walkable(idx(cx, cy))) return false;
      }
      return true;
    };
    if (free(v.x + dx, v.y)) v.x += dx;
    if (free(v.x, v.y + dy)) v.y += dy;
  }
  function updMe(secs, dh) {
    const v = S.me;
    if (v.asleep) {
      if (S.t >= v.wakeAt && S.t < 12) {
        wake(v); v.wakeAt = WAKE + R() * 0.8;
        banner('DAY ' + S.day, 'Good morning, ' + v.name, v.tasks.length + ' things on today’s list');
        sfx('bell');
      }
      return;
    }
    if (v.act) {
      if (v.act.a.hold) v.act.a.hold.hold = 0.5;
      v.act.t += dh;
      if (v.act.t >= v.act.a.dur) { const a = v.act.a; v.act = null; if (a.ok()) { sfx.mine = true; a.run(); sfx.mine = false; } }
      return;
    }
    let dx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0), dy = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
    if (dx || dy) {
      v.path = null;
      const l = Math.hypot(dx, dy); dx /= l; dy /= l;
      const run = keys.run && v.energy > 5;
      const sp = speedOf(v) * (run ? RUN : 1) * secs;
      moveMe(v, dx * sp, dy * sp);
      faceTo(v, dx, dy);
      v.moving = true; v.anim += secs * (run ? 10 : 7);
      if (run) v.energy = Math.max(0, v.energy - dh * 5);
    } else if (v.path) followPath(v, secs);
    else v.moving = false;
    if (S.t >= 2 && S.t < WAKE) {
      v.asleep = true; v.joy -= 10; v.energy = Math.min(v.energy, 20); v.wakeAt = WAKE + 1.5;
      toast(v.name + ' nods off where they stand', '#cfc6ff', 4);
    }
    if (S.t >= 19 && S.t < 23.5) { const tav = B.find((b) => b && b.built && b.type === 'tavern'); if (tav && dist(v, entryC(tav)) < 2.5) progress(v, 'tavern'); }
    S.acts = actionsFor(v);
    const pick = pressed.use ? S.acts[0] : pressed.alt ? S.acts[1] : null;
    if (pick) { startAct(v, pick); v.path = null; }
    if (pressed.lift && S.liftable) {
      if (clock() < v.nextLift - 1.1) toast('Wait a moment — they are still looking about', '#cfc6b4');
      else { faceTo(v, S.liftable.x - v.x, S.liftable.y - v.y); lift(v, S.liftable); v.nextLift = clock() + 0.15; }
    }
  }
  function liveAs(v) {
    if (!v || v.gone) return;
    if (S.me && S.me !== v) stepBack(true);
    S.me = v; S.follow = v; S.mode = 'live'; S.tool = null; S.selB = null;
    v.path = null; v.act = null; v.wait = 0; dropClaims(v);
    if (v.asleep && S.t >= WAKE && S.t < BED) wake(v);
    if (v.taskDay !== S.day) makeTasks(v);
    fitView(); snapCam();
    banner(v.name.toUpperCase(), jobTitle(v), 'Today’s list is on the right. Esc to step back.');
    refreshUi();
    save();
  }
  function stepBack(quiet) {
    const v = S.me;
    if (!v) return;
    v.path = null; v.act = null;
    S.me = null; S.mode = 'build'; S.follow = v;
    fitView();
    if (!quiet) { refreshUi(); save(); }
  }

  // ---------- time ----------
  function step(secs) {
    const dh = secs / SEC_PER_HOUR;
    const t0 = S.t;
    S.t += dh;
    if (S.t >= 24) S.t -= 24;
    if (t0 < WAKE && S.t >= WAKE) dawn();
    if (t0 < SUPPER && S.t >= SUPPER) dusk();
    S.pathBudget = 8;
    updWorld(dh);
    for (const v of V) updVillager(v, secs, dh);
    if (S.me) { updMe(secs, dh); expireTasks(S.me); }
    if (V.some((v) => v.gone)) {
      V = V.filter((v) => !v.gone);
      if (S.follow && S.follow.gone) S.follow = null;
    }
    for (const k in pressed) delete pressed[k];
  }
  function tick(dt) {
    S.real += dt;
    if (S.mode === 'title' || S.paused || S.modal) { for (const k in pressed) delete pressed[k]; return; }
    let speed = S.mode === 'live' ? 1 : S.speed;
    if (!speed) return;
    if (S.me && S.me.asleep) speed = 36;
    else if (V.every((v) => v.asleep || v.gone)) speed *= NIGHT_SPEED;
    let secs = dt * speed;
    while (secs > 1e-6) { const s = Math.min(secs, 0.2); step(s); secs -= s; }
  }

  // ---------- sound ----------
  let soundOn = true;
  try { soundOn = localStorage.getItem(SOUND_KEY) !== 'off'; } catch (e) { /* storage blocked */ }
  let actx = null;
  function tone(f, dur, type, vol, f2, delay) {
    const t0 = actx.currentTime + (delay || 0);
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f, t0);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    g.gain.setValueAtTime(vol || 0.1, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(actx.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function noise(dur, vol, freq, type) {
    const len = Math.max(1, (actx.sampleRate * dur) | 0);
    const buf = actx.createBuffer(1, len, actx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
    s.buffer = buf; f.type = type || 'lowpass'; f.frequency.value = freq || 2000; g.gain.value = vol || 0.1;
    s.connect(f); f.connect(g); g.connect(actx.destination); s.start();
  }
  function sfx(name) {
    if (!soundOn || S.mode === 'title') return;
    // the village is busy: only what happens near you, or what you did, makes a sound
    if (S.mode === 'live' && ['dig', 'water', 'pick', 'fell', 'drop', 'milk', 'snip', 'work', 'anvil', 'hammer', 'eat'].includes(name) && !sfx.mine) return;
    if (S.mode === 'build' && ['dig', 'water', 'pick', 'fell', 'drop', 'milk', 'snip', 'work', 'anvil', 'hammer', 'eat', 'coin'].includes(name)) return;
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      switch (name) {
        case 'place': noise(0.12, 0.1, 900); tone(220, 0.1, 'triangle', 0.06); break;
        case 'built': tone(523, 0.15, 'triangle', 0.07); tone(659, 0.15, 'triangle', 0.07, null, 0.12); tone(784, 0.3, 'triangle', 0.07, null, 0.24); break;
        case 'task': tone(880, 0.1, 'square', 0.035); tone(1175, 0.18, 'square', 0.035, null, 0.08); break;
        case 'coin': tone(1200, 0.08, 'square', 0.03); tone(1600, 0.12, 'square', 0.03, null, 0.07); break;
        case 'dig': noise(0.12, 0.1, 500); break;
        case 'water': noise(0.25, 0.08, 1400, 'bandpass'); break;
        case 'pick': tone(600, 0.06, 'triangle', 0.06, 900); break;
        case 'fell': noise(0.4, 0.16, 400); tone(90, 0.3, 'triangle', 0.1, 50); break;
        case 'drop': noise(0.08, 0.08, 700); break;
        case 'milk': noise(0.2, 0.06, 2200, 'bandpass'); break;
        case 'snip': tone(2400, 0.04, 'square', 0.03); tone(2600, 0.04, 'square', 0.03, null, 0.08); break;
        case 'work': noise(0.15, 0.06, 1200, 'bandpass'); break;
        case 'anvil': tone(1400, 0.2, 'triangle', 0.06, 1300); tone(2100, 0.12, 'sine', 0.03); break;
        case 'hammer': tone(300, 0.05, 'square', 0.05, 200); noise(0.05, 0.08, 1500); break;
        case 'eat': noise(0.06, 0.05, 1800); noise(0.06, 0.05, 1600); break;
        case 'caught': tone(440, 0.12, 'sawtooth', 0.06); tone(330, 0.25, 'sawtooth', 0.06, null, 0.12); break;
        case 'arrive': tone(392, 0.2, 'sine', 0.06); tone(523, 0.3, 'sine', 0.06, null, 0.15); break;
        case 'bell': tone(523, 1.2, 'sine', 0.07); tone(1046, 0.9, 'sine', 0.025); break;
      }
    } catch (e) { /* no audio here */ }
  }

  // ---------- saving ----------
  function save() {
    if (S.mode === 'title' || S.noSave) return;
    const r1 = (n) => Math.round(n * 10) / 10;
    const trees = {};
    for (let c = 0; c < N; c++) if (treeT[c] > 0 && (tree[c] === TR.STUMP || tree[c] === TR.SAPLING)) trees[c] = r1(treeT[c]);
    const data = {
      v: 4, seed: S.seed, day: S.day, t: r1(S.t), coins: S.coins, renown: S.renown, store: S.store, stats: S.stats, nextId: S.nextId,
      ground: Array.from(ground).join(''), tree: Array.from(tree).join(''), treeT: trees,
      B: B.map((b) => b && {
        type: b.type, x: b.x, y: b.y, built: b.built, work: r1(b.work), workers: b.workers, stock: b.stock, crop: b.crop,
        cells: b.cells && b.cells.map((c) => [c.st, c.wet, r1(c.g), c.crop || '']),
        animals: b.animals.map((a) => [a.kind, r1(a.x), r1(a.y), a.ready ? 1 : 0, r1(a.woolT || 0), r1(a.layT || 0)]),
        eggs: b.eggs.map((e) => [r1(e.x), r1(e.y)]),
      }),
      V: V.map((v) => ({
        id: v.id, name: v.name, look: v.look, x: r1(v.x), y: r1(v.y), home: v.home, job: v.job, thief: v.thief, lifts: v.lifts, caughtN: v.caughtN,
        idleDays: v.idleDays, hunger: r1(v.hunger), energy: r1(v.energy), mood: r1(v.mood), joy: r1(v.joy), purse: v.purse, carry: v.carry, can: v.can,
        asleep: !!v.asleep, inside: v.inside, tasks: v.tasks, taskDay: v.taskDay, ate: v.ate, wakeAt: v.wakeAt, bedAt: v.bedAt, lastCut: v.lastCut || 0,
        bucket: v.bucket, gift: v.gift, leaving: v.leaving, lowDays: v.lowDays,
      })),
      me: S.me ? S.me.id : null, follow: S.follow ? S.follow.id : null,
    };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (e) { /* storage blocked or full */ }
  }
  function loadSave() {
    try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); return s && s.v === 4 ? s : null; } catch (e) { return null; }
  }
  function restore(d) {
    S.seed = d.seed; riverPhase = (d.seed % 97) / 15;
    Object.assign(S, { day: d.day, t: d.t, coins: d.coins, renown: d.renown, store: d.store || {}, stats: Object.assign(S.stats, d.stats), nextId: d.nextId });
    for (let c = 0; c < N; c++) { ground[c] = +d.ground[c] || 0; tree[c] = +d.tree[c] || 0; treeT[c] = 0; }
    for (const k in d.treeT) treeT[+k] = d.treeT[k];
    sid.fill(-1); B = [];
    d.B.forEach((o, i) => {
      if (!o) { B.push(null); return; }
      const bt = BT[o.type];
      const b = { id: i, type: o.type, x: o.x, y: o.y, w: bt.w, h: bt.h, built: o.built, work: o.work, need: bt.work * 3, workers: o.workers || [], stock: o.stock || 0, q: [], eggs: [], animals: [], crop: o.crop || 'wheat', cells: null };
      B.push(b);
      for (let j = 0; j < b.h; j++) for (let k = 0; k < b.w; k++) sid[idx(b.x + k, b.y + j)] = i;
      if (o.cells) b.cells = o.cells.map((c) => ({ st: c[0], wet: c[1], g: c[2], crop: c[3] || null, claim: 0 }));
      b.animals = (o.animals || []).map((a) => ({ kind: a[0], x: a[1], y: a[2], ready: !!a[3], woolT: a[4], layT: a[5], tx: 0, ty: 0, wait: 1, flip: false, claim: 0 }));
      b.eggs = (o.eggs || []).map((e) => ({ x: e[0], y: e[1], claim: 0 }));
    });
    V = d.V.map((o) => Object.assign({
      ang: Math.PI / 2, dir: 0, anim: 0, moving: false, path: null, pi: 0, act: null, wait: 0, bubble: null, nextLift: 0, claim: null, hello: [], ate: {}, gone: false,
    }, o));
    S.me = d.me !== null ? vById(d.me) || null : null;
    S.follow = d.follow !== null ? vById(d.follow) || null : null;
    S.mode = S.me ? 'live' : 'build';
    S.dirty = true;
  }

  function newGame(seed) {
    S.seed = seed || ((Math.random() * 1e9) | 0);
    Object.assign(S, {
      day: 1, t: WAKE + 1, coins: 200, renown: 0, store: { logs: 40, carrot: 24, bread: 16 }, tool: null, sel: null, selB: null, follow: null, me: null,
      toasts: [], banner: null, stats: { lifts: 0, caught: 0, tasks: 0, arrived: 0, left: 0 }, nextId: 0, speed: 1, paused: false, fullWarned: false,
    });
    V = [];
    genWorld(S.seed);
    const Rs = rng(S.seed + 11);
    ['Nell', 'Bram', 'Tobin', 'Hester'].forEach((name, i) => {
      const v = makeVillager(name, HOME.x - 0.5 + i, HOME.y + 2.5 + (Rs() - 0.5) * 0.6, randomLook(Rs));
      makeTasks(v);
    });
    S.mode = 'build';
    S.follow = null;
    centreOn(HOME.x, HOME.y + 1);
    hideAll();
    refreshUi();
    banner('FURROW', 'Four villagers and a handcart', 'Build them a barn, houses and a field — then give them work');
    save();
  }

  // ---------- input ----------
  const keys = {}, pressed = {};
  const KEYMAP = {
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    ShiftLeft: 'run', ShiftRight: 'run', KeyE: 'use', Enter: 'use', KeyR: 'alt', KeyQ: 'lift', KeyT: 'tasks', KeyP: 'pause', Escape: 'back', KeyB: 'back',
    Space: 'space', KeyL: 'live', Equal: 'zoomin', NumpadAdd: 'zoomin', Minus: 'zoomout', NumpadSubtract: 'zoomout',
    Digit1: 's1', Digit2: 's2', Digit3: 's3',
  };
  function press(k) {
    if (S.mode === 'title' || S.modal) return;
    if (k === 'pause' || (k === 'space' && S.mode === 'build')) {
      if (S.mode === 'build' && k === 'space') { S.speed = S.speed ? 0 : S.lastSpeed || 1; if (S.speed) S.lastSpeed = S.speed; refreshUi(); return; }
      S.paused = !S.paused; return;
    }
    if (k === 'back') {
      if (S.paused) { S.paused = false; return; }
      if (S.mode === 'live') { stepBack(); return; }
      if (S.tool) { S.tool = null; refreshUi(); return; }
      S.follow = null; S.selB = null; refreshUi(); return;
    }
    if (k === 'tasks') { S.showTasks = !S.showTasks; return; }
    if (k === 'live' && S.mode === 'build' && S.follow) { liveAs(S.follow); return; }
    if (k === 'zoomin' || k === 'zoomout') { if (S.mode === 'build') setZoom(buildZoom + (k === 'zoomin' ? 1 : -1)); return; }
    if (S.mode === 'build' && (k === 's1' || k === 's2' || k === 's3')) { S.speed = { s1: 1, s2: 2, s3: 4 }[k]; refreshUi(); return; }
    if (!keys[k]) pressed[k] = true;
    keys[k] = true;
    lightCtl(k, true);
  }
  function release(k) { keys[k] = false; lightCtl(k, false); }
  function lightCtl(k, on) { document.querySelectorAll('.ctl[data-key="' + k + '"]').forEach((b) => b.classList.toggle('down', on)); }
  const overlayOpen = () => [...document.querySelectorAll('.overlay')].some((o) => !o.hidden);
  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT')) return;
    if (overlayOpen()) {
      if (e.code === 'Escape') { if (!document.getElementById('style').hidden) closeStyle(); else if (S.mode !== 'title') { hideAll(); } }
      return;
    }
    const k = KEYMAP[e.code];
    if (!k) return;
    e.preventDefault();
    if (e.repeat && !['up', 'down', 'left', 'right', 'run'].includes(k)) return;
    press(k);
  });
  window.addEventListener('keyup', (e) => { const k = KEYMAP[e.code]; if (k) release(k); });
  window.addEventListener('blur', () => { for (const k in keys) release(k); });
  document.querySelectorAll('.ctl[data-key]').forEach((b) => {
    const k = b.dataset.key;
    const down = (e) => { e.preventDefault(); b.setPointerCapture && b.setPointerCapture(e.pointerId); press(k); };
    const up = (e) => { e.preventDefault(); release(k); };
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('lostpointercapture', up);
  });

  function setZoom(z) {
    const cxw = (cam.x + view.width / 2) / T, cyw = (cam.y + view.height / 2) / T;
    buildZoom = clamp(z, 1, liveZoom + 1);
    fitView();
    if (!S.follow) centreOn(cxw, cyw);
  }
  // build-mode panning, from the keys
  function panKeys(dt) {
    if (S.mode !== 'build') return;
    const dx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0), dy = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
    if (!dx && !dy) return;
    S.follow = null;
    cam.x += dx * dt * 22 * T; cam.y += dy * dt * 22 * T;
    const t = camTarget(); cam.x = t.x; cam.y = t.y;
  }

  // the pointer: place and select in build mode, click-to-walk in live mode
  let pointer = null, drag = null;
  const worldAt = (e) => {
    const r = cv.getBoundingClientRect();
    const px = (e.clientX - r.left) * (cv.width / r.width), py = (e.clientY - r.top) * (cv.height / r.height);
    return { sx: px, sy: py, x: (px / zoom + cam.x) / T, y: (py / zoom + cam.y) / T };
  };
  function onMini(w) {
    if (!miniRect) return null;
    const x = (w.sx - miniRect.x) / miniRect.per, y = (w.sy - miniRect.y) / miniRect.per;
    return x >= 0 && y >= 0 && x < MW && y < MH ? { x, y } : null;
  }
  function useTool(tx, ty) {
    const tool = S.tool;
    if (BT[tool]) {
      const d = BT[tool], gx = tx - Math.floor((d.w - 1) / 2), gy = ty - Math.floor((d.h - 1) / 2);
      const r = place(tool, gx, gy);
      if (typeof r === 'string') { toast(r, '#ff8a6b'); return; }
      if (tool === 'field') { r.crop = 'wheat'; }
      toast(d.name + ' marked out — the jobless and anyone free will raise it', '#bfe39a');
      if (!e2shift) S.tool = null;
      S.selB = r; S.follow = null;
    } else if (tool === 'path') { const why = paveWhy(tx, ty); if (!why) pave(tx, ty); else if (!drag || !drag.moved) toast(why, '#ff8a6b'); }
    else if (tool === 'tree') { const why = plantWhy(tx, ty); if (!why) plant(tx, ty); else toast(why, '#ff8a6b'); }
    else if (tool === 'clear') { const why = clearAt(tx, ty); if (why && (!drag || !drag.moved)) toast(why, '#ff8a6b'); }
    refreshUi();
  }
  let e2shift = false;
  cv.addEventListener('pointerdown', (e) => {
    if (S.mode === 'title' || S.modal) return;
    const w = worldAt(e);
    pointer = { x: e.clientX - cv.getBoundingClientRect().left, y: e.clientY - cv.getBoundingClientRect().top };
    e2shift = e.shiftKey;
    const mm = onMini(w);
    if (mm) { if (S.mode === 'build') { S.follow = null; centreOn(mm.x, mm.y); } return; }
    if (e.button === 2) { if (S.tool) { S.tool = null; refreshUi(); } return; }
    cv.setPointerCapture(e.pointerId);
    drag = { sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y, moved: false, last: null };
    if (S.mode === 'build' && S.tool && (S.tool === 'path' || S.tool === 'clear')) { useTool(w.x | 0, w.y | 0); drag.last = (w.x | 0) + ',' + (w.y | 0); drag.paint = true; }
  });
  cv.addEventListener('pointermove', (e) => {
    const w = worldAt(e);
    pointer = { x: e.clientX - cv.getBoundingClientRect().left, y: e.clientY - cv.getBoundingClientRect().top };
    hover = { x: Math.floor(w.x), y: Math.floor(w.y) };
    if (!drag) return;
    const mx = e.clientX - drag.sx, my = e.clientY - drag.sy;
    if (Math.hypot(mx, my) > 6) drag.moved = true;
    if (drag.paint) {
      const key = (w.x | 0) + ',' + (w.y | 0);
      if (key !== drag.last) { drag.last = key; useTool(w.x | 0, w.y | 0); }
      return;
    }
    if (S.mode === 'build' && drag.moved) {
      const k = cv.width / cv.getBoundingClientRect().width / zoom;
      S.follow = null;
      cam.x = drag.cx - mx * k; cam.y = drag.cy - my * k;
      const t = camTarget(); cam.x = t.x; cam.y = t.y;
    }
  });
  cv.addEventListener('pointerleave', () => { hover = null; });
  cv.addEventListener('pointerup', (e) => {
    const d = drag; drag = null;
    if (!d || d.moved || d.paint) return;
    const w = worldAt(e);
    if (S.mode === 'live') {
      // click to walk there
      const v = S.me, c = cellOfXY(w.x, w.y);
      if (!v.act && !v.asleep && walkable(c)) { const p = findPath(v.x, v.y, [c]); if (p) { v.path = p; v.pi = 1; } }
      return;
    }
    if (S.tool) { useTool(w.x | 0, w.y | 0); return; }
    // pick someone, or something
    let best = null, bd = 0.9;
    for (const v of V) {
      if (v.gone || v.inside) continue;
      const d2 = Math.hypot(v.x - w.x, (v.y - 0.55) - w.y);
      if (d2 < bd) { bd = d2; best = v; }
    }
    if (best) { S.follow = best; S.selB = null; sfx('pick'); refreshUi(); return; }
    const s = inb(w.x | 0, w.y | 0) ? sid[idx(w.x | 0, w.y | 0)] : -1;
    S.selB = s >= 0 ? B[s] : null; S.follow = null;
    refreshUi();
  });
  cv.addEventListener('wheel', (e) => { if (S.mode !== 'build') return; e.preventDefault(); setZoom(buildZoom + (e.deltaY < 0 ? 1 : -1)); }, { passive: false });
  cv.addEventListener('contextmenu', (e) => e.preventDefault());

  // ---------- the panels ----------
  const $ = (id) => document.getElementById(id);
  function show(id) { $(id).hidden = false; }
  function hideAll() { document.querySelectorAll('.overlay').forEach((o) => { o.hidden = true; }); S.modal = false; }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const TOOLS = BUILD_ORDER.concat(['path', 'tree', 'clear']);
  const TOOL_INFO = {
    path: { name: 'Path', cost: '1 coin a tile', blurb: 'Drag to lay a path. Everyone walks faster on one.' },
    tree: { name: 'Sapling', cost: '2 coin', blurb: 'Plant a tree for the woodcutter. Grows in a couple of days.' },
    clear: { name: 'Clear', cost: '', blurb: 'Pull down a building (half its coin back), fell a tree, shift a rock or take up a path.' },
  };
  function buildToolbar() {
    const bar = $('tools');
    bar.innerHTML = '';
    for (const k of TOOLS) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'tool'; b.dataset.tool = k;
      const d = BT[k];
      b.innerHTML = '<span class="nm">' + esc(d ? d.name : TOOL_INFO[k].name) + '</span><span class="cost"></span>';
      b.title = d ? d.blurb : TOOL_INFO[k].blurb;
      b.addEventListener('click', () => { S.tool = S.tool === k ? null : k; S.follow = null; S.selB = null; refreshUi(); b.blur(); });
      bar.appendChild(b);
    }
  }
  function lockOf(k) {
    const d = BT[k];
    if (!d) return null;
    if (S.renown < d.star) return '★' + d.star;
    if (d.needs && !built(d.needs)) return 'needs ' + BT[d.needs].name.toLowerCase();
    return null;
  }
  let uiStamp = '';
  function refreshToolbar() {
    for (const b of document.querySelectorAll('#tools .tool')) {
      const k = b.dataset.tool, d = BT[k];
      const lock = lockOf(k);
      const poor = d && (S.coins < d.cost.c || (S.store.logs || 0) < d.cost.t);
      b.classList.toggle('on', S.tool === k);
      b.classList.toggle('locked', !!lock);
      b.classList.toggle('poor', !lock && !!poor);
      b.querySelector('.cost').textContent = lock || (d ? d.cost.c + ' coin' + (d.cost.t ? ', ' + d.cost.t + ' logs' : '') : TOOL_INFO[k].cost);
      b.disabled = !!lock;
    }
    document.querySelectorAll('[data-speed]').forEach((b) => b.classList.toggle('on', +b.dataset.speed === S.speed));
  }
  function refreshUi() {
    const live = S.mode === 'live';
    document.body.classList.toggle('is-live', live);
    document.body.classList.toggle('is-build', S.mode === 'build');
    if (refreshUi.mode !== S.mode) { refreshUi.mode = S.mode; resize(); }
    refreshToolbar();
    renderInfo();
  }
  function jobOptions(v) {
    let h = '<option value="-1"' + (v.job < 0 ? ' selected' : '') + '>' + (v.thief ? 'No job (thieving)' : 'No job') + '</option>';
    for (const b of B) {
      if (!b || !BT[b.type].jobs) continue;
      const mine = v.job === b.id;
      const free = BT[b.type].jobs - b.workers.length;
      if (!mine && free <= 0) continue;
      h += '<option value="' + b.id + '"' + (mine ? ' selected' : '') + '>' + esc(JOBS[BT[b.type].job].name + ' — ' + BT[b.type].name + ' #' + b.id + (b.built ? '' : ' (being built)') + (mine ? '' : ' · ' + free + ' free')) + '</option>';
    }
    return h;
  }
  function meter(label, n, col) {
    return '<div class="meter"><span>' + label + '</span><i><b style="width:' + clamp(Math.round(n), 0, 100) + '%;background:' + col + '"></b></i></div>';
  }
  function renderInfo() {
    const box = $('info');
    if (S.mode !== 'build' || (!S.follow && !S.selB)) { box.hidden = true; box.dataset.key = ''; return; }
    box.hidden = false;
    if (S.follow) {
      const v = S.follow;
      const home = v.home >= 0 && B[v.home] ? 'House #' + v.home : 'Nowhere to sleep';
      const doing = v.asleep ? 'Asleep' : v.act ? v.act.a.label : v.path ? 'Walking' : 'Idle';
      box.innerHTML =
        '<div class="who"><canvas class="face" width="12" height="14"></canvas><div><h2>' + esc(v.name) + '</h2><p class="sub' + (v.thief ? ' bad' : '') + '">' + esc(jobTitle(v)) + '</p></div></div>' +
        meter('Food', v.hunger, '#d8a13a') + meter('Rest', v.energy, '#6ab0e0') + meter('Mood', v.mood, v.mood < 30 ? '#e0663a' : '#8fc86a') +
        '<p class="line">' + esc(home) + ' · purse ' + v.purse + (v.lifts ? ' · ' + v.lifts + ' purses lifted' : '') + '</p>' +
        '<p class="line doing">' + esc(doing) + '</p>' +
        '<label class="line">Job <select id="info-job">' + jobOptions(v) + '</select></label>' +
        '<div class="row"><button type="button" class="tiny primary" id="info-live">Live as ' + esc(v.name) + '</button><button type="button" class="tiny" id="info-close">Close</button></div>';
      const f = box.querySelector('.face').getContext('2d');
      f.drawImage(sprite(v.look, 0, 0), 0, 0);
      $('info-job').addEventListener('change', (e) => { const id = +e.target.value; assignJob(v, id >= 0 ? B[id] : null); if (id >= 0) toast(v.name + ' is now the ' + JOBS[BT[B[id].type].job].name.toLowerCase(), '#bfe39a'); renderInfo(); });
      $('info-live').addEventListener('click', () => liveAs(v));
      $('info-close').addEventListener('click', () => { S.follow = null; refreshUi(); });
      return;
    }
    const b = S.selB, d = BT[b.type];
    let h = '<h2>' + esc(d.name) + '</h2><p class="sub">' + esc(d.blurb) + '</p>';
    if (!b.built) h += '<p class="line">Being built: ' + Math.floor(100 * b.work / b.need) + '% — the jobless raise it, or live as anyone and hammer.</p>';
    if (d.jobs) {
      const names = b.workers.map((id) => vById(id)).filter(Boolean).map((v) => v.name);
      h += '<p class="line">' + esc(JOBS[d.job].name) + ': ' + (names.length ? esc(names.join(', ')) : '<i>nobody</i>') + ' (' + b.workers.length + '/' + d.jobs + ')</p>';
      const idle = V.filter((v) => !v.gone && v.job !== b.id && !b.workers.includes(v.id));
      if (b.workers.length < d.jobs && idle.length) {
        h += '<label class="line">Hire <select id="info-hire"><option value="">choose…</option>' + idle.sort((p, q) => (p.job >= 0) - (q.job >= 0)).map((v) => '<option value="' + v.id + '">' + esc(v.name + ' — ' + jobTitle(v)) + '</option>').join('') + '</select></label>';
      }
    }
    if (b.type === 'house') { const hm = housemates(b); h += '<p class="line">Beds: ' + hm.length + '/2' + (hm.length ? ' — ' + esc(hm.map((v) => v.name).join(', ')) : '') + '</p>'; }
    if (b.type === 'field') {
      h += '<label class="line">Sow <select id="info-crop">' + Object.keys(CROPS).map((k) => '<option value="' + k + '"' + (b.crop === k ? ' selected' : '') + (S.renown < CROPS[k].star ? ' disabled' : '') + '>' + CROPS[k].name + (S.renown < CROPS[k].star ? ' (★' + CROPS[k].star + ')' : '') + '</option>').join('') + '</select></label>';
      const ripe = b.cells.filter((c) => c.st === 3).length, dry = b.cells.filter((c) => c.st >= 0 && c.st < 3 && !c.wet).length;
      h += '<p class="line">' + ripe + ' ripe · ' + dry + ' need water</p>';
    }
    if (b.type === 'tavern') h += '<p class="line">Stew in the pot: ' + b.stock + '</p>';
    if (b.type === 'barn' || b.type === 'camp') {
      const list = Object.keys(GOODS).filter((g) => S.store[g] > 0).map((g) => GOODS[g].name + ' ' + S.store[g]);
      h += '<p class="line">Holding ' + storeUsed() + ' of ' + storeCap() + ':</p><p class="line small">' + esc(list.join(' · ') || 'nothing') + '</p>';
    }
    if (b.type === 'barber' || b.type === 'tailor') h += '<p class="line">Live as anyone and walk in to change how they look.</p>';
    h += '<div class="row"><button type="button" class="tiny" id="info-close">Close</button></div>';
    box.innerHTML = h;
    const hire = $('info-hire');
    if (hire) hire.addEventListener('change', (e) => { const v = vById(+e.target.value); if (v) { assignJob(v, b); toast(v.name + ' is now the ' + JOBS[d.job].name.toLowerCase(), '#bfe39a'); } renderInfo(); });
    const crop = $('info-crop');
    if (crop) crop.addEventListener('change', (e) => { b.crop = e.target.value; });
    $('info-close').addEventListener('click', () => { S.selB = null; refreshUi(); });
  }
  // the panel is live: redraw it now and then, unless someone is using a select in it
  function infoKey() {
    const v = S.follow, b = S.selB;
    if (v) return [v.id, v.job, v.thief, Math.round(v.hunger / 5), Math.round(v.energy / 5), Math.round(v.mood / 5), v.purse, v.asleep, v.act && v.act.a.label, !!v.path, V.length, B.length].join('|');
    if (b) return [b.id, b.built, Math.floor(10 * b.work / b.need), b.workers.join(','), b.stock, storeUsed(), b.cells && b.cells.map((c) => c.st + '' + c.wet).join(''), V.length].join('|');
    return '';
  }

  // ---------- the barber and the clothes shop ----------
  let draft = null, styleKind = null;
  function openStyle(kind) {
    styleKind = kind; draft = Object.assign({}, S.me.look);
    S.modal = true;
    $('style-title').textContent = kind === 'barber' ? 'The barber' : 'The clothes shop';
    const opts = $('style-opts');
    let h = '';
    if (kind === 'barber') {
      h += '<h3>Cut</h3><div class="swatches">' + STYLES.map((s) => '<button type="button" class="pill" data-k="style" data-v="' + s + '">' + STYLE_NAMES[s] + '</button>').join('') + '</div>';
      h += '<h3>Colour</h3><div class="swatches">' + HAIR_COLS.map((c, i) => '<button type="button" class="sw" data-k="hair" data-v="' + i + '" style="background:' + c + '" aria-label="hair colour ' + (i + 1) + '"></button>').join('') + '</div>';
    } else {
      h += '<h3>Coat</h3><div class="swatches">' + COATS.map((c, i) => '<button type="button" class="sw" data-k="coat" data-v="' + i + '" style="background:' + c + '" aria-label="coat colour ' + (i + 1) + '"></button>').join('') + '</div>';
      h += '<h3>Below</h3><div class="swatches"><button type="button" class="pill" data-k="dress" data-v="0">Trousers</button><button type="button" class="pill" data-k="dress" data-v="1">Skirt</button></div>';
      h += '<h3>Trousers</h3><div class="swatches">' + LEG_COLS.map((c, i) => '<button type="button" class="sw" data-k="legs" data-v="' + i + '" style="background:' + c + '" aria-label="trouser colour ' + (i + 1) + '"></button>').join('') + '</div>';
    }
    opts.innerHTML = h;
    opts.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.k, val = b.dataset.v;
      draft[k] = k === 'style' ? val : k === 'dress' ? val === '1' : +val;
      paintStyle();
    }));
    paintStyle();
    show('style');
  }
  function paintStyle() {
    const cost = styleKind === 'barber' ? 4 : 8;
    const g = $('style-preview').getContext('2d');
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, 96, 72);
    g.drawImage(sprite(draft, 0, 0), 4, 0, 36, 54);
    g.drawImage(sprite(draft, 2, 1), 52, 0, 36, 54);
    document.querySelectorAll('#style-opts [data-k]').forEach((b) => {
      const k = b.dataset.k, val = b.dataset.v;
      b.classList.toggle('on', k === 'style' ? draft.style === val : k === 'dress' ? draft.dress === (val === '1') : draft[k] === +val);
    });
    const same = lookKey(draft) === lookKey(S.me.look);
    $('style-pay').disabled = same || S.me.purse < cost;
    $('style-pay').textContent = 'Pay ' + cost + ' coin';
    $('style-note').textContent = S.me.name + ' has ' + S.me.purse + ' coin in their purse.' + (styleKind === 'tailor' ? ' The shop has ' + (S.store.clothes || 0) + ' outfits sewn.' : '');
  }
  function closeStyle() { $('style').hidden = true; S.modal = false; draft = null; }
  $('style-pay').addEventListener('click', () => {
    const v = S.me, cost = styleKind === 'barber' ? 4 : 8;
    if (!v || v.purse < cost) return;
    if (styleKind === 'tailor') { if ((S.store.clothes || 0) < 1) return; S.store.clothes--; }
    v.purse -= cost; S.coins += cost; v.look = draft; v.joy += 15;
    if (styleKind === 'barber') v.lastCut = S.day;
    toast(styleKind === 'barber' ? 'A new cut — ' + STYLE_NAMES[draft.style].toLowerCase() : 'New clothes!', '#bfe39a');
    sfx('snip');
    closeStyle();
  });
  $('style-cancel').addEventListener('click', closeStyle);

  $('btn-new').addEventListener('click', () => { newGame(); });
  $('btn-continue').addEventListener('click', () => { const d = loadSave(); if (d) { restore(d); hideAll(); refreshUi(); snapCam(); } else newGame(); });
  $('btn-help').addEventListener('click', () => { show('help'); S.modal = true; });
  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => { $(b.dataset.close).hidden = true; S.modal = overlayOpen(); }));
  $('btn-restart').addEventListener('click', () => { if (confirm('Start a new village? This one will be lost.')) { hideAll(); newGame(); } });
  document.querySelectorAll('[data-speed]').forEach((b) => b.addEventListener('click', () => { S.speed = +b.dataset.speed; if (S.speed) S.lastSpeed = S.speed; refreshUi(); b.blur(); }));
  document.querySelectorAll('[data-zoom]').forEach((b) => b.addEventListener('click', () => { setZoom(buildZoom + +b.dataset.zoom); b.blur(); }));
  $('btn-back').addEventListener('click', () => stepBack());
  const btnSound = $('btn-sound');
  const paintSound = () => { btnSound.textContent = 'Sound: ' + (soundOn ? 'on' : 'off'); btnSound.setAttribute('aria-pressed', String(soundOn)); };
  btnSound.addEventListener('click', () => {
    soundOn = !soundOn;
    try { localStorage.setItem(SOUND_KEY, soundOn ? 'on' : 'off'); } catch (e) { /* blocked */ }
    paintSound(); btnSound.blur();
  });
  paintSound();

  // ---------- start ----------
  try { for (const k of DEAD_KEYS) localStorage.removeItem(k); } catch (e) { /* blocked */ }
  buildToolbar();
  // the valley behind the title card
  S.seed = 20260924;
  genWorld(S.seed);
  centreOn(HOME.x, HOME.y + 1);
  const sv = loadSave();
  if (sv) { $('btn-continue').hidden = false; $('btn-continue').textContent = 'Carry on — day ' + sv.day; $('btn-new').classList.remove('primary'); $('btn-continue').classList.add('primary'); }
  let loaded = 0;
  const ready = () => { if (++loaded === 2) { S.dirty = true; for (const k in goodIconCache) delete goodIconCache[k]; for (const b of B) if (b) b.cvKey = null; } };
  town.onload = () => { townOk = true; ready(); };
  farm.onload = () => { farmOk = true; ready(); };
  town.onerror = farm.onerror = () => ready();
  town.src = 'assets/tiny-town.png';
  farm.src = 'assets/tiny-farm.png';
  window.addEventListener('resize', resize);
  window.addEventListener('beforeunload', save);
  setInterval(() => { if (S.mode !== 'title') save(); }, 30000);
  resize();
  let lastT = performance.now(), uiT = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    panKeys(dt);
    tick(dt);
    render(dt);
    uiT -= dt;
    if (uiT <= 0) {
      uiT = 0.4;
      refreshToolbar();
      const k = infoKey();
      const busy = document.activeElement && document.activeElement.tagName === 'SELECT';
      if (k !== $('info').dataset.key && !busy) { renderInfo(); $('info').dataset.key = k; }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // the debug handle, for the tests and for poking at the village from the console
  window.furrow = {
    S, BT, JOBS, CROPS, GOODS, G, TR, MW, MH, keys, pressed, A,
    get V() { return V; }, get B() { return B; },
    map: { ground, tree, treeT, sid },
    get sheetsOk() { return townOk && farmOk; },
    seed(n) { R = rng(n); },
    step(secs, n) { for (let i = 0; i < (n || 1); i++) step(secs); },
    hours(h) { const n = Math.ceil(h * SEC_PER_HOUR / 0.2); for (let i = 0; i < n; i++) step(0.2); },
    newGame, quickStart, place, whyNot, clearAt, pave, plant, finishBuilding, assignJob, liveAs, stepBack, actionsFor, lift, arrive, dawn,
    findPath, walkable, entry, entryC, flood, makeTasks, save, loadSave, restore, press, release, openStyle, closeStyle,
    foodInStore, storeCap, beds, render: () => render(0.016), camTarget,
    setTime(t) { S.t = t; },
    teleport(v, x, y) { v.x = x; v.y = y; v.path = null; v.act = null; },
  };
})();
