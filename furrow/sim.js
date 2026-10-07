/* Furrow: the village itself. Everything the villagers do and everything you build, with no
   page access, so the tests can run whole days of it in Node.

     const w = createVillage({ rnd, on })
       rnd   the dice for the villagers' choices; w.seedDice(n) swaps in a seeded one.
             The valley itself is always generated from S.seed (w.newGame(seed)), which is
             what the URL carries.
       on    on(event, data):
               'sfx' { name, mine }   a sound; mine: it was something you did
               'notice' list|null     what would stop anyone new arriving tomorrow
               'style' kind           you asked the barber or the tailor ('barber' | 'tailor')
               'mode' { snap, quiet } you stepped into someone's boots, or back out
               'new-game'             a fresh valley
               'save'                 a good moment to save (w.serialize())

   w.S is the state (some of it, like the tool in hand, is the page's, as it always was);
   w.B and w.V are the buildings and villagers, always the same two arrays. Toasts and the
   banner are queued on S for the view to show. */

export function createVillage({ rnd, on = () => {} } = {}) {

  // ---------- constants ----------
  const T = 16;                            // pixels per tile
  const MW = 90, MH = 62, N = MW * MH;     // the valley, in tiles
  const HOME = { x: 34, y: 30 };           // the village green
  const ROAD_Y = HOME.y + 9;               // the road in from the east, over the bridge
  const RIVER_X = 72;                      // where the river winds down the valley
  const WELL_SERVES = 8;                   // people one well keeps in water
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
  // food is fullness restored
  const GOODS = {
    logs:    { name: 'Logs' },
    stone:   { name: 'Stone' },
    wheat:   { name: 'Wheat',    farm: 68 },
    carrot:  { name: 'Carrots',  food: 25, farm: 8 },
    beet:    { name: 'Beets',    food: 25, farm: 20 },
    cabbage: { name: 'Cabbages', food: 30, farm: 56 },
    tomato:  { name: 'Tomatoes', food: 22, farm: 44 },
    corn:    { name: 'Corn',     food: 30, farm: 32 },
    egg:     { name: 'Eggs',     food: 20 },
    milk:    { name: 'Milk',     food: 20, farm: 124 },
    bread:   { name: 'Bread',    food: 45, farm: 125 },
    wool:    { name: 'Wool' },
    tools:   { name: 'Tools' },
    clothes: { name: 'Clothes' },
  };
  const FOODS = Object.keys(GOODS).filter((g) => GOODS[g].food);

  // Every building. `cost` is logs (t) and stone (s), taken from the barn; `pop` is how many
  // villagers it takes before one can be laid out at all, and `star` the renown.
  // The entrance is a tile outside the footprint, where people stand to use it: by default
  // below `door` (a column of the bottom row); R turns it round to the other sides.
  const BT = {
    house:  { name: 'House', w: 3, h: 3, cost: { t: 8 }, pop: 0, star: 0, beds: 2, door: 1, work: 14,
      blurb: 'Two beds. Somebody new comes down the road when there is a bed going spare and the village is happy.' },
    field:  { name: 'Field', w: 5, h: 4, cost: { t: 2 }, pop: 0, star: 0, jobs: 2, job: 'farmer', walk: true, door: 2, work: 6,
      blurb: 'Sown, watered every day, and harvested. Farmers fill their cans at a well or the river.' },
    wood:   { name: 'Woodcutter', w: 3, h: 3, cost: { t: 0 }, pop: 0, star: 0, jobs: 1, job: 'woodcutter', door: 1, work: 10,
      blurb: 'Fells the trees round about for logs, and clears any tree you mark. Felled trees do not grow back on their own.' },
    well:   { name: 'Well', w: 1, h: 2, cost: { t: 3 }, pop: 0, star: 0, door: 0, work: 5,
      blurb: 'Water for ' + WELL_SERVES + ' people. Fills a watering can, or a bucket for the house.' },
    camp:   { name: 'Camp', w: 2, h: 1, cost: { t: 0 }, pop: 0, star: 99, door: 0, work: 1,
      blurb: 'The handcart the villagers came with — their stores, a fire and their bedrolls. It is packed away once a barn is up.' },
    barn:   { name: 'Barn', w: 3, h: 5, cost: { t: 10 }, pop: 0, star: 0, door: 1, store: 100, work: 16,
      blurb: 'Where everything is carried to, and where the food comes from. Each barn holds 100.' },
    forester: { name: 'Forester', w: 3, h: 3, cost: { t: 6 }, pop: 4, star: 0, jobs: 1, job: 'forester', door: 1, work: 10,
      blurb: 'Plants saplings round the lodge, which grow into trees for the woodcutter in a day or so.' },
    quarry: { name: 'Quarry', w: 3, h: 3, cost: { t: 8 }, pop: 4, star: 0, jobs: 1, job: 'miner', door: 1, work: 12,
      blurb: 'Breaks up the rocks round about for stone, and any rock you mark. Stone walls need stone.' },
    coop:   { name: 'Hen coop', w: 5, h: 3, cost: { t: 8 }, pop: 5, star: 1, jobs: 1, job: 'henwife', door: 0, animals: ['hen', 4], work: 10,
      blurb: 'Four hens and whatever they lay. Someone has to go and pick the eggs up.' },
    bakery: { name: 'Bakery', w: 4, h: 3, cost: { t: 10, s: 4 }, pop: 6, star: 3, jobs: 1, job: 'baker', door: 1, work: 16,
      blurb: 'Two wheat make three loaves, and bread fills you up better than anything.' },
    smith:  { name: 'Blacksmith', w: 4, h: 3, cost: { t: 8, s: 6 }, pop: 7, star: 4, jobs: 1, job: 'smith', door: 1, work: 18,
      blurb: 'Burns logs to forge tools. And scissors — no barber without a smith.' },
    sheep:  { name: 'Sheep pen', w: 6, h: 4, cost: { t: 10 }, pop: 7, star: 4, jobs: 1, job: 'shepherd', door: 0, animals: ['sheep', 3], work: 12,
      blurb: 'Three sheep to shear for wool. A clothes shop needs the wool.' },
    tavern: { name: 'Tavern', w: 5, h: 3, cost: { t: 16 }, pop: 9, star: 5, jobs: 1, job: 'cook', door: 2, work: 20,
      blurb: 'The cook turns two of anything into three hot stews. A hot supper cheers anyone, and the evenings are spent here.' },
    barber: { name: 'Barber', w: 3, h: 3, cost: { t: 6, s: 4 }, pop: 9, star: 5, jobs: 1, job: 'barber', door: 1, needs: 'smith', work: 12,
      blurb: 'Needs a blacksmith for the scissors. Anyone can come in for a new cut and colour.' },
    tailor: { name: 'Clothes shop', w: 4, h: 3, cost: { t: 10 }, pop: 10, star: 6, jobs: 1, job: 'tailor', door: 1, needs: 'sheep', work: 16,
      blurb: 'Needs a sheep pen for the wool. Sews clothes, and anyone can come in for a new outfit.' },
    cows:   { name: 'Cowshed', w: 6, h: 5, cost: { t: 14 }, pop: 11, star: 7, jobs: 1, job: 'dairy', door: 1, animals: ['cow', 2], work: 18,
      blurb: 'Two cows, milked once a day.' },
  };
  // the build bar, in tabs, so there is room for more
  const BUILD_TABS = [
    { name: 'Homes', items: ['house', 'well', 'barn'] },
    { name: 'Food', items: ['field', 'coop', 'bakery', 'cows'] },
    { name: 'Work', items: ['wood', 'forester', 'quarry', 'smith', 'sheep'] },
    { name: 'Village', items: ['tavern', 'barber', 'tailor'] },
    { name: 'Land', items: ['path', 'clear'] },
  ];
  const SIDES = ['south', 'west', 'north', 'east'];   // where the entrance is, by turn
  const JOBS = {
    farmer:     { name: 'Farmer',      at: 'field',  task: 'Tend the field',        unit: 'jobs',    need: 8, verb: 'farm' },
    woodcutter: { name: 'Woodcutter',  at: 'wood',   task: 'Bring logs to the barn', unit: 'logs',   need: 6, verb: 'logs' },
    forester:   { name: 'Forester',    at: 'forester', task: 'Plant saplings',       unit: 'saplings', need: 4, verb: 'plant' },
    miner:      { name: 'Miner',       at: 'quarry', task: 'Break up rocks',         unit: 'rocks',  need: 2, verb: 'mine' },
    henwife:    { name: 'Hen-keeper',  at: 'coop',   task: 'Collect eggs',           unit: 'eggs',   need: 4, verb: 'egg' },
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
  let R = rnd || Math.random;   // gameplay dice; seedDice(n) swaps in a seeded one for the tests

  // ---------- the valley ----------
  const ground = new Uint8Array(N);          // G.*
  const tree = new Uint8Array(N);            // TR.*
  const treeT = new Float32Array(N);         // hours until a stump or sapling moves on
  const sid = new Int16Array(N).fill(-1);    // which building covers the cell
  const mark = new Uint8Array(N);            // 1: marked for a woodcutter or a miner to clear
  const B = [];                              // buildings, by id (a demolished one leaves null); always this array
  const V = [];                              // villagers; always this array, so the view can hold on to it
  let riverPhase = 0;
  const riverCx = (y) => RIVER_X + 2.4 * Math.sin(y * 0.16 + riverPhase);

  const S = {
    mode: 'title', seed: 1, day: 1, t: WAKE, renown: 0, store: {}, speed: 1,
    tool: null, sel: null, selB: null, selT: -1, follow: null, me: null, toasts: [], banner: null, turn: 0, tab: 0,
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
  // A field turned a quarter is 4x5 instead of 5x4; everything else keeps its shape (the
  // art is drawn face-on) and only its entrance moves round.
  function footprint(type, turn) {
    const d = BT[type], swap = type === 'field' && turn % 2;
    return { w: swap ? d.h : d.w, h: swap ? d.w : d.h };
  }
  function entryAt(type, x, y, w, h, turn) {
    const col = x + Math.min(BT[type].door, w - 1);
    if (turn === 1) return { x: x - 1, y: y + h - 1 };
    if (turn === 2) return { x: col, y: y - 1 };
    if (turn === 3) return { x: x + w, y: y + h - 1 };
    return { x: col, y: y + h };
  }
  const entry = (b) => entryAt(b.type, b.x, b.y, b.w, b.h, b.turn || 0);
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

  function genWorld(seed) {
    const Rg = rng(seed);
    riverPhase = (seed % 97) / 15;
    ground.fill(G.GRASS); tree.fill(0); treeT.fill(0); sid.fill(-1); mark.fill(0); B.length = 0;
    for (let y = 0; y < MH; y++) {
      const cx = riverCx(y);
      for (let x = 0; x < MW; x++) if (Math.abs(x + 0.5 - cx) < 2.1) ground[idx(x, y)] = G.WATER;
    }
    // the road, from the green out over the bridge to the east edge
    for (let x = HOME.x - 12; x < MW; x++) for (const y of [ROAD_Y, ROAD_Y + 1]) ground[idx(x, y)] = ground[idx(x, y)] === G.WATER ? G.BRIDGE : G.PATH;
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
    const at = [['barn', -6, -6], ['house', 3, -4], ['house', 7, -4], ['field', -7, 2], ['wood', 5, 1], ['well', 3, 0]]
      .map(([ty, dx, dy]) => [ty, HOME.x + dx, HOME.y + dy]);
    const out = at.map(([ty, x, y]) => {
      for (let j = y - 1; j <= y + BT[ty].h + 1; j++) for (let i = x - 1; i <= x + BT[ty].w; i++) if (inb(i, j) && tree[idx(i, j)]) tree[idx(i, j)] = TR.NONE;
      return addBuilding(ty, x, y, true);
    });
    for (let x = HOME.x - 6; x <= HOME.x + 10; x++) if (sid[idx(x, HOME.y - 1)] < 0) ground[idx(x, HOME.y - 1)] = G.PATH;
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

  function addBuilding(type, x, y, built, turn) {
    const d = BT[type], f = footprint(type, turn || 0);
    const b = { id: B.length, type, x, y, w: f.w, h: f.h, turn: turn || 0, built: !!built, work: 0, need: d.work * 3, workers: [], stock: 0, q: [], eggs: [], animals: [], crop: 'carrot', cells: null, ageH: 0 };
    B.push(b);
    for (let j = 0; j < b.h; j++) for (let i = 0; i < b.w; i++) {
      const c = idx(x + i, y + j);
      sid[c] = b.id;
      tree[c] = TR.NONE; mark[c] = 0;
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
  const waterFor = () => B.reduce((n, b) => n + (b && b.built && b.type === 'well' ? WELL_SERVES : 0), 0);
  const pop = () => V.filter((v) => !v.gone).length;
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
  const GROWTH_NAMES = { [TR.TREE]: 'tree', [TR.STUMP]: 'stump', [TR.SAPLING]: 'sapling', [TR.ROCK]: 'rock', [TR.BUSH]: 'bush' };
  // who clears what: rocks are the miner's, anything that grows the woodcutter's
  const clearer = (c) => (tree[c] === TR.ROCK ? 'miner' : 'woodcutter');
  function whyNot(type, x, y, turn) {
    turn = turn || 0;
    const d = BT[type], f = footprint(type, turn);
    if (pop() < d.pop) return 'Needs ' + d.pop + ' villagers';
    if (S.renown < d.star) return 'Needs ' + d.star + ' renown';
    if (d.needs && !built(d.needs)) return 'Needs a ' + BT[d.needs].name.toLowerCase() + ' first';
    if ((S.store.logs || 0) < d.cost.t) return 'Not enough logs';
    if ((S.store.stone || 0) < (d.cost.s || 0)) return 'Not enough stone';
    if (x < 0 || y < 0 || x + f.w > MW || y + f.h >= MH) return 'Off the edge';
    for (let j = 0; j < f.h; j++) for (let i = 0; i < f.w; i++) {
      const c = idx(x + i, y + j);
      if (sid[c] >= 0) return 'Something is in the way';
      if (ground[c] !== G.GRASS && ground[c] !== G.PATH) return ground[c] === G.WATER || ground[c] === G.BRIDGE ? 'Not on the water' : 'Something is in the way';
      if (tree[c]) return 'A ' + GROWTH_NAMES[tree[c]] + ' is in the way — mark it for the ' + clearer(c);
    }
    const e = entryAt(type, x, y, f.w, f.h, turn), ec = idx(e.x, e.y);
    if (!inb(e.x, e.y) || ground[ec] === G.WATER || sid[ec] >= 0 || tree[ec]) return 'The entrance needs open ground';
    // would it cut anything off?
    const inFoot = (i, j) => type !== 'field' && i >= x && j >= y && i < x + f.w && j < y + f.h;
    const sn = flood(inFoot);
    if (!sn[ec]) return 'Nobody could reach the entrance';
    for (const b of B) {
      if (!b) continue;
      const be = entry(b), c = idx(be.x, be.y);
      if (!sn[c]) return 'It would cut off the ' + BT[b.type].name.toLowerCase();
    }
    return null;
  }
  function place(type, x, y, turn) {
    const why = whyNot(type, x, y, turn);
    if (why) return why;
    const d = BT[type];
    S.store.logs -= d.cost.t;
    if (d.cost.s) S.store.stone -= d.cost.s;
    const b = addBuilding(type, x, y, false, turn);
    // anyone standing where it goes steps out of the way
    for (const v of V) {
      if (v.gone || v.inside) continue;
      const c = cellOfXY(v.x, v.y);
      if (sid[c] !== b.id || walkable(c)) continue;
      const to = nearestWalkable(v.x, v.y, 10);
      if (to) { v.x = to.x; v.y = to.y; }
      v.path = null;
    }
    sfx('place');
    return b;
  }
  function paveWhy(x, y) {
    if (!inb(x, y)) return 'Off the edge';
    const c = idx(x, y);
    if (ground[c] !== G.GRASS || sid[c] >= 0) return 'Only on grass';
    if (tree[c] && tree[c] !== TR.SAPLING) return 'Mark the ' + GROWTH_NAMES[tree[c]] + ' for clearing first';
    return null;
  }
  function pave(x, y) {
    if (paveWhy(x, y)) return false;
    const c = idx(x, y);
    ground[c] = G.PATH; tree[c] = TR.NONE; S.dirty = true;
    return true;
  }
  // Somewhere the forester may put a sapling: bare grass, not hard by a building, a path or
  // an entrance — and nowhere a grown tree would wall a door off.
  function plantOk(x, y, noFlood) {
    if (!inb(x, y)) return false;
    const c = idx(x, y);
    if (ground[c] !== G.GRASS || sid[c] >= 0 || tree[c] !== TR.NONE || mark[c]) return false;
    for (let j = y - 1; j <= y + 1; j++) for (let i = x - 1; i <= x + 1; i++) {
      if (!inb(i, j)) continue;
      const n = idx(i, j);
      if (sid[n] >= 0 || ground[n] === G.PATH || ground[n] === G.BRIDGE) return false;
    }
    for (const b of B) if (b) { const e = entry(b); if (Math.abs(e.x - x) <= 1 && Math.abs(e.y - y) <= 1) return false; }
    if (V.some((v) => !v.gone && cellOfXY(v.x, v.y) === c)) return false;
    if (noFlood) return true;
    const sn = flood((i, j) => i === x && j === y);
    for (const b of B) if (b) { const e = entry(b); if (!sn[idx(e.x, e.y)]) return false; }
    return true;
  }
  // Clearing: a building comes down at once, for half its logs and stone back (all of them if
  // it was never finished). Trees, stumps, bushes and rocks are only marked: they go when a
  // woodcutter or a miner gets round to them. `want` sets the mark; left out, it toggles.
  function clearWhat(x, y) {
    if (!inb(x, y)) return null;
    const c = idx(x, y);
    if (sid[c] >= 0) {
      const b = B[sid[c]];
      if (b.type === 'camp') return { why: 'That is the villagers’ camp — it goes when a barn is up' };
      return { b, label: 'Pull down the ' + BT[b.type].name.toLowerCase() + (b.built ? ' (half its logs back)' : ' (all its logs back)') };
    }
    if (tree[c]) return { grow: c, label: mark[c] ? 'Leave the ' + GROWTH_NAMES[tree[c]] + ' be' : 'Mark the ' + GROWTH_NAMES[tree[c]] + ' for the ' + clearer(c) };
    if (ground[c] === G.PATH && !(y === ROAD_Y || y === ROAD_Y + 1)) return { path: c, label: 'Take up the path' };
    return null;
  }
  function clearAt(x, y, want) {
    const w = clearWhat(x, y);
    if (!w || w.why) return w ? w.why : 'Nothing to clear';
    if (w.b) {
      const d = BT[w.b.type], k = w.b.built ? 0.5 : 1;
      S.store.logs = (S.store.logs || 0) + Math.floor(d.cost.t * k);
      if (d.cost.s) S.store.stone = (S.store.stone || 0) + Math.floor(d.cost.s * k);
      removeBuilding(w.b);
    } else if (w.grow !== undefined) {
      setMark(w.grow, want === undefined ? !mark[w.grow] : want);
      return null;
    } else if (w.path !== undefined) ground[w.path] = G.GRASS;
    S.dirty = true;
    sfx('place');
    return null;
  }
  function setMark(c, on) {
    if (!!mark[c] === !!on) return;
    mark[c] = on ? 1 : 0;
    if (!on) treeClaim.delete(c);
    sfx('place');
  }
  // is anybody actually employed to clear this?
  const anyoneFor = (job) => V.some((v) => !v.gone && jobKind(v) === job);

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
      if (++steps > 9000) return null;
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

  const STYLES = ['short', 'crop', 'long', 'bun', 'bald'];
  const HAIR_COLS = ['#3a2a1c', '#5a3a22', '#8a6a3a', '#c8a060', '#2a2420', '#8a8a8a', '#a85a30', '#e0d8c8', '#b04a6a', '#4a6ab0', '#5a8a4a'];
  const SKINS = ['#f0c8a0', '#e3b48f', '#c98f68', '#a8704c', '#7a4e34', '#e7bf9a'];
  const COATS = ['#8a5a3a', '#6a7a4a', '#4a5f7a', '#9a6a5a', '#b89a5a', '#7a4a5a', '#5a6a6a', '#a8a090', '#8a3a3a', '#4a6a5a', '#c0703a', '#6a4a8a', '#3a7a8a', '#c8b060'];
  const LEG_COLS = ['#4a3a2a', '#3e4450', '#5a4a3a', '#2f3a5a', '#6a5a48', '#6a3a3a'];
  function randomLook(Rl) {
    const dress = Rl() < 0.4;
    return {
      style: dress ? ['long', 'bun', 'short'][(Rl() * 3) | 0] : ['short', 'crop', 'short', 'bald', 'long'][(Rl() * 5) | 0],
      hair: (Rl() * 8) | 0, skin: (Rl() * SKINS.length) | 0, coat: (Rl() * COATS.length) | 0, legs: (Rl() * LEG_COLS.length) | 0, dress,
    };
  }

  // ---------- the villagers ----------
  function makeVillager(name, x, y, look) {
    const v = {
      id: S.nextId++, name, look: look || randomLook(R), x, y, ang: Math.PI / 2, dir: 0, anim: 0, moving: false,
      home: -1, job: -1, thief: false, lifts: 0, caughtN: 0, idleDays: 0,
      hunger: 75 + R() * 20, energy: 85 + R() * 15, mood: 62, joy: 0, pocket: null,
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
    tasks.push({ k: 'meal', m: 'b', label: 'Eat breakfast', until: 10, reward: { mood: 4 } });
    const jk = jobKind(v);
    if (jk === 'thief') tasks.push(liftTask());
    else if (jk && jk !== 'waiting') tasks.push(workTask(jk));
    else if (B.some((b) => b && !b.built)) tasks.push({ k: 'work', verb: 'hammer', label: 'Help raise a building: 8 blows', need: 8, have: 0, reward: { star: 1, mood: 4 } });
    else if (!jk) tasks.push({ k: 'job', label: 'Find work: ask at a door', reward: { star: 1 } });
    tasks.push({ k: 'meal', m: 'l', label: 'Eat lunch', until: 14.5, reward: { mood: 4 } });
    const errands = [];
    if (v.home >= 0 && built('well')) errands.push('water');
    if (others.length >= 2) errands.push('hello');
    if (others.length >= 1) errands.push('gift');
    if (built('tavern')) errands.push('tavern');
    const e = errands[(R() * errands.length) | 0];
    if (e === 'water') tasks.push({ k: 'water', label: 'Fetch water home from the well', reward: { star: 1 } });
    if (e === 'hello') {
      const pick = others.slice().sort(() => R() - 0.5).slice(0, Math.min(3, others.length)).map((o) => o.id);
      tasks.push({ k: 'hello', who: pick, done_: [], label: 'Say hello to ' + pick.map((id) => vById(id).name).join(', '), reward: { star: 1, mood: 6 } });
    }
    if (e === 'gift') {
      const o = others[(R() * others.length) | 0];
      tasks.push({ k: 'gift', who: o.id, label: 'Take ' + o.name + ' something to eat', reward: { star: 1, mood: 6 } });
    }
    if (e === 'tavern') tasks.push({ k: 'tavern', label: 'An evening at the tavern', reward: { mood: 10 } });
    tasks.push({ k: 'meal', m: 's', label: 'Eat supper', until: 21, reward: { mood: 4 } });
    tasks.push({ k: 'bed', label: v.home >= 0 ? 'In bed by 23:00' : 'Asleep by 23:00', until: 23, reward: { star: 1, mood: 5 } });
    v.tasks = tasks; v.taskDay = S.day; v.hello = []; v.gift = null; v.bucket = false; v.visited = false;
  }
  function workTask(jk) {
    const J = JOBS[jk];
    return { k: 'work', verb: J.verb, label: J.task + ': ' + J.need + ' ' + J.unit, need: J.need, have: 0, reward: { star: 1, mood: 6 } };
  }
  const liftTask = () => ({ k: 'lift', label: 'Lift 3 pockets unseen', need: 3, have: 0, reward: { mood: 8 } });
  function payTask(v, t) {
    if (t.done || t.failed) return;
    t.done = true;
    const r = t.reward, bits = [];
    if (r.star) { gainRenown(r.star, null); bits.push('+' + r.star + ' renown'); }
    if (r.mood) { v.joy += r.mood; bits.push('+' + r.mood + ' mood'); }
    S.stats.tasks++;
    toast('✓ ' + t.label + (bits.length ? '  ' + bits.join(', ') : ''), '#bfe39a', 3.2);
    sfx('task');
    if (v.tasks.every((x) => x.done)) {
      gainRenown(2, null);
      banner('A GOOD DAY', v.name + ' did everything on the list', '+2 renown');
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
    if (k < n && !S.fullWarned) { S.fullWarned = true; toast('The barn is full — build another', '#ffb03b', 4); }
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
    // a marked tree goes stump and all; a stump, sapling or bush is just grubbed up
    grub: (v, c) => ({ label: tree[c] === TR.TREE ? 'Fell the tree, stump and all' : 'Grub up the ' + (GROWTH_NAMES[tree[c]] || 'stump'), dur: tree[c] === TR.TREE ? 0.4 : 0.2, anim: 'chop',
      ok: () => !!tree[c] && tree[c] !== TR.ROCK && (tree[c] !== TR.TREE || canCarry(v, 'logs')),
      run: () => {
        if (tree[c] === TR.TREE) addCarry(v, 'logs', 2);
        tree[c] = TR.NONE; mark[c] = 0; treeClaim.delete(c); sfx('fell');
      } }),
    mine: (v, c) => ({ label: 'Break up the rock', dur: 0.5, anim: 'chop', ok: () => tree[c] === TR.ROCK && canCarry(v, 'stone'),
      run: () => { tree[c] = TR.NONE; mark[c] = 0; treeClaim.delete(c); addCarry(v, 'stone', 2); workUnit(v, 'mine'); S.dirty = true; sfx('fell'); } }),
    plant: (v, c) => ({ label: 'Plant a sapling', dur: 0.2, anim: 'bend', ok: () => plantOk(c % MW, (c / MW) | 0, true),
      run: () => { tree[c] = TR.SAPLING; treeT[c] = 30; treeClaim.delete(c); workUnit(v, 'plant'); sfx('dig'); } }),
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
    cut: (v, b) => ({ label: 'Cut ' + (b.q.length && vById(b.q[0]) ? vById(b.q[0]).name + '’s' : 'someone’s') + ' hair', dur: 0.3, anim: 'work', ok: () => b.q.length > 0,
      run: () => {
        const c = vById(b.q.shift());
        if (c) {
          c.look = Object.assign({}, c.look, { style: STYLES[(R() * STYLES.length) | 0], hair: R() < 0.5 ? c.look.hair : (R() * HAIR_COLS.length) | 0 });
          c.joy += 12; c.act = null; c.lastCut = S.day;
          say(c, 'Lovely, thank you!');
        }
        workUnit(v, 'cut'); sfx('snip');
      } }),
    hammer: (v, site) => ({ label: 'Hammer at the ' + BT[site.type].name.toLowerCase(), dur: 0.1, anim: 'chop', ok: () => !site.built && B[site.id] === site,
      run: () => {
        site.work += 1.5 * (0.6 + v.mood / 150);
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
        // and a bite for later, in a pocket — which is what a thief is after
        const bite = m === 'b' && !v.pocket ? takeFood() : null;
        if (bite) v.pocket = bite;
        if (v === S.me) toast('You eat some ' + GOODS[g].name.toLowerCase() + (bite ? ', and pocket some ' + GOODS[bite].name.toLowerCase() + ' for later' : ''), '#f3ead6');
      } }),
    eatPocket: (v) => ({ label: 'Eat the ' + (v.pocket ? GOODS[v.pocket].name.toLowerCase() : 'food') + ' in your pocket', dur: 0.25, anim: 'eat', ok: () => !!v.pocket,
      run: () => {
        v.hunger = Math.min(100, v.hunger + GOODS[v.pocket].food + 15); v.pocket = null;
        const m = mealNow(S.t) || 'snack';
        v.ate[m] = true; progress(v, 'meal', m); sfx('eat');
      } }),
    eatTavern: (v, b) => ({ label: 'Hot stew at the tavern', dur: 0.4, anim: 'eat', ok: () => b.stock > 0,
      run: () => {
        b.stock--;
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
    v.tasks[i] = workTask(jk);
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
      else if (S.mode !== 'live' || dist(thief, S.me) < 12) toast(who.name + ' caught ' + thief.name + ' at ' + victim.name + '’s pocket', '#ffb03b', 3);
      if (thief !== S.me && thief.caughtN >= 4 && !thief.leaving) { thief.leaving = true; toast(thief.name + ' has been run out of the village', '#ffb03b', 4); }
      return false;
    }
    // whatever they pocketed at breakfast: kept for later, or eaten on the spot if your own pocket is full
    const g = victim.pocket;
    victim.pocket = null;
    if (g) { victim.joy -= 6; if (!thief.pocket) thief.pocket = g; else thief.hunger = Math.min(100, thief.hunger + GOODS[g].food); }
    thief.lifts++; S.stats.lifts++;
    if (thief === S.me) { progress(thief, 'lift'); toast(g ? 'Lifted some ' + GOODS[g].name.toLowerCase() + ' from ' + victim.name : victim.name + '’s pockets were empty', g ? '#f0d27a' : '#cfc6b4'); sfx('coin'); }
    if (!thief.thief && thief.job < 0 && thief.lifts >= 3) {
      thief.thief = true;
      toast(thief.name + ' has taken up thieving', '#ff9a6b', 4);
      if (thief === S.me) retaskThief(thief);
    }
    return true;
  }
  function retaskThief(v) {
    const i = v.tasks.findIndex((t) => (t.k === 'work' || t.k === 'job') && !t.done);
    if (i >= 0) v.tasks[i] = liftTask();
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
    // lunch is what was pocketed at breakfast, eaten wherever they are
    if (v.pocket && (mealNow(S.t) === 'l' || foodInStore() <= 0)) return startAct(v, A.eatPocket(v));
    const tav = B.find((b) => b && b.built && b.type === 'tavern' && b.stock > 0);
    if (tav && (S.t > 12 || v.hunger < 30)) return doAt(v, [entryCell(tav)], A.eatTavern(v, tav));
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

  function siteAI(v) {
    const site = B.find((s) => s && !s.built);
    return !!site && !v.thief && doAt(v, [entryCell(site)], A.hammer(v, site));
  }
  function workAI(v) {
    const b = jobB(v);
    const jk = jobKind(v);
    if (!jk || jk === 'waiting') {
      // out of work: raise whatever is going up, or loiter — and maybe pick a pocket
      if (siteAI(v)) return true;
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
      case 'woodcutter':
      case 'miner': {
        // whatever has been marked for clearing comes first, wherever it is; then whatever is
        // nearest the hut. Rocks do not come back, so a miner with none left lends a hand.
        const cutter = jk === 'woodcutter', good = cutter ? 'logs' : 'stone';
        if (carrying && (carrying.n >= CARRY || carrying.g !== good)) return deliverAI(v);
        const mine = (c) => !(treeClaim.get(c) && treeClaim.get(c) !== v.id + 1) && !(giveUp.get(c) > clock());
        const want = cutter ? (c) => tree[c] && tree[c] !== TR.ROCK : (c) => tree[c] === TR.ROCK;
        let best = nearestCell(v.x, v.y, 0, (c) => mark[c] && want(c) && mine(c)), marked = best >= 0;
        if (!marked) {
          const e = entry(b);
          best = nearestCell(e.x, e.y, 16, (c) => (cutter ? tree[c] === TR.TREE : tree[c] === TR.ROCK) && mine(c));
        }
        if (best < 0) return carrying ? deliverAI(v) : idleAtWork(v, b, 2);
        if (cutter && tree[best] === TR.TREE && !canCarry(v, 'logs')) return deliverAI(v);
        treeClaim.set(best, v.id + 1);
        const a = !cutter ? A.mine(v, best) : marked ? A.grub(v, best) : A.chop(v, best);
        const r = doAt(v, besideCells(best % MW, (best / MW) | 0), a);
        if (!r) { treeClaim.delete(best); giveUp.set(best, clock() + 6); }
        return r;
      }
      case 'forester': {
        if (carrying) return deliverAI(v);
        // the spot already chosen, if it is still good; else a few guesses round the lodge
        const e = entry(b);
        let spot = v.plantAt >= 0 && treeClaim.get(v.plantAt) === v.id + 1 && plantOk(v.plantAt % MW, (v.plantAt / MW) | 0, true) ? v.plantAt : -1;
        for (let k = 0; k < 14 && spot < 0; k++) {
          const x = (e.x + (R() * 2 - 1) * 7) | 0, y = (e.y + (R() * 2 - 1) * 7) | 0;
          if (inb(x, y) && !treeClaim.get(idx(x, y)) && plantOk(x, y)) spot = idx(x, y);
        }
        if (spot < 0) return idleAtWork(v, b, 2);
        treeClaim.set(spot, v.id + 1); v.plantAt = spot;
        const r = doAt(v, besideCells(spot % MW, (spot / MW) | 0), A.plant(v, spot));
        if (!r) { treeClaim.delete(spot); v.plantAt = -1; }
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
      case 'barber': {
        const a = A.cut(v, b);
        if (!a.ok()) return doAt(v, [entryCell(b)], { label: 'wait', dur: 0.3, anim: 'idle', ok: () => true, run: () => {} });
        return doAt(v, [entryCell(b)], a);
      }
    }
    return false;
  }
  const treeClaim = new Map();   // cell -> villager id + 1, for a tree, rock or sapling spot someone is seeing to
  const giveUp = new Map();      // cell -> clock: could not get to it, so leave it be until then
  // the nearest cell within r of (x,y) (anywhere, if r is 0) that pred likes and someone could stand beside
  function nearestCell(x, y, r, pred) {
    const cx = x | 0, cy = y | 0;
    const x0 = r ? Math.max(0, cx - r) : 0, x1 = r ? Math.min(MW, cx + r) : MW, y0 = r ? Math.max(0, cy - r) : 0, y1 = r ? Math.min(MH, cy + r) : MH;
    let best = -1, bd = 1e9;
    for (let j = y0; j < y1; j++) for (let i = x0; i < x1; i++) {
      const c = idx(i, j);
      if (!pred(c)) continue;
      const d = Math.hypot(i - x, j - y);
      if (d < bd && besideCells(i, j).length) { bd = d; best = c; }
    }
    return best;
  }

  function criminalAI(v) {
    const tempted = v.thief || (v.job < 0 && (v.idleDays >= 1 || v.hunger < 50) && v.mood < 62);
    if (tempted && clock() >= v.nextLift) {
      // someone out in the open with something in their pocket, preferably with their back to us
      let mark = null, md = 1e9;
      for (const o of V) {
        if (o === v || o.gone || o.inside || o.asleep || !o.pocket || o.thief) continue;
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
    // the barber and the clothes shop, now and then
    if (!v.shopped && R() < 0.3) {
      v.shopped = true;
      const bar = B.find((b) => b && b.built && b.type === 'barber' && b.workers.length);
      const tai = B.find((b) => b && b.built && b.type === 'tailor' && b.workers.length && (S.store.clothes || 0) > 0);
      if (bar && (v.lastCut || 0) < S.day - 2 && R() < 0.6) {
        return doAt(v, [entryCell(bar)], { label: 'Wait for a haircut', dur: 1.2, anim: 'idle', ok: () => true,
          run: () => { bar.q = bar.q.filter((id) => id !== v.id); } , start: () => { if (!bar.q.includes(v.id)) bar.q.push(v.id); } });
      }
      if (tai) {
        return doAt(v, [entryCell(tai)], { label: 'Pick out new clothes', dur: 0.25, anim: 'talk', ok: () => (S.store.clothes || 0) > 0,
          run: () => { S.store.clothes--; v.look = Object.assign({}, v.look, { coat: (R() * COATS.length) | 0, legs: (R() * LEG_COLS.length) | 0 }); v.joy += 12; say(v, 'Do you like it?'); } });
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
    // the jobless don't keep hours: a site going up gets hammered from breakfast to supper
    else if (!jobKind(v) && t < SUPPER && siteAI(v)) return;
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
      // a stump rots away to grass; nothing comes back unless the forester plants it
      if (tr === TR.STUMP) { tree[c] = TR.NONE; treeClaim.delete(c); }
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
    // one or two new people, if there is room for them
    let k = R() < 0.5 ? 2 : 1;
    while (k > 0 && wants(k).length) k--;
    for (let i = 0; i < k; i++) arrive();
    on('notice', null);
    on('save');
  }
  // What stands between the village and k more people: a bed each, food in the barn, a
  // well's worth of water, and folk cheerful enough to make the place sound good.
  function wants(k) {
    const n = pop(), out = [];
    const living = V.filter((v) => !v.gone);
    const avgMood = living.reduce((s, v) => s + v.mood, 0) / Math.max(1, living.length);
    const spare = beds() - n, food = foodInStore(), water = waterFor();
    if (spare < k) out.push({ k: 'beds', text: spare <= 0 ? 'No spare bed — build a house' : 'Only ' + spare + ' spare bed' });
    if (food < n + k) out.push({ k: 'food', text: 'Not enough food in store (' + food + ' for ' + n + ' people)' });
    if (water < n + k) out.push({ k: 'water', text: water ? 'Not enough water — each well serves ' + WELL_SERVES : 'No water — dig a well' });
    if (avgMood < 45) out.push({ k: 'mood', text: 'Folk are too glum to draw anyone new' });
    return out;
  }
  function arrive() {
    const used = new Set(V.map((v) => v.name));
    const name = NAMES.find((n) => !used.has(n)) || 'Newcomer ' + (V.length + 1);
    const v = makeVillager(name, MW - 0.5, ROAD_Y + 0.5 + (V.length % 2));
    v.hunger = 70;
    makeTasks(v);
    housePeople();
    S.stats.arrived++;
    gainRenown(1);
    toast(name + ' has come down the road to live here', '#8fd0ff', 4);
    sfx('arrive');
    return v;
  }
  // every evening: if nobody new could come in the morning, say why
  function dusk() {
    const short = wants(1);
    on('notice', short.length ? short : null);
  }


  // ---------- messages ----------
  function toast(text, col, dur) { S.toasts.push({ text, col: col || '#f3ead6', t: dur || 2.6 }); if (S.toasts.length > 4) S.toasts.shift(); }
  function banner(title, sub, extra) { S.banner = { title, sub: sub || '', extra: extra || '', t: 4 }; }

  // ---------- living as someone ----------
  function openTask(v, k) { return v.tasks.find((t) => t.k === k && !t.done && !t.failed); }
  function chatLine(o) {
    const jk = jobKind(o), lines = [];
    if (o.hunger < 30) lines.push('I could eat a horse.', 'Is there anything in the barn?');
    if (o.energy < 25) lines.push('I’m dead on my feet.');
    if (o.thief) lines.push('Nothing to see here.', 'Anything good in your pockets?');
    else if (!jk) lines.push('Know anyone who’s hiring?', 'Idle hands, they say…');
    if (jk === 'farmer') { const b = jobB(o); lines.push('The ' + CROPS[b.crop].name.toLowerCase() + ' want water.', 'Rain would be nice.'); }
    if (jk === 'woodcutter') lines.push('Mind the stumps.', 'Plenty of oak out east.');
    if (jk === 'baker') lines.push('Wheat, wheat and more wheat.', 'Bread’s up!');
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
      ? { label: 'Get a haircut', dur: 0, anim: 'idle', ok: () => true, run: () => on('style', 'barber') }
      : { label: 'Pick out new clothes', dur: 0, anim: 'idle', ok: () => (S.store.clothes || 0) > 0, run: () => on('style', 'tailor') };
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
        if (jk === 'barber') { add(A.cut(v, b)); if (!b.q.length) S.hint = 'Nobody waiting for a cut just now'; }
        if (!out.length && !S.hint) S.hint = jk === 'baker' ? 'No wheat in the barn to bake with' : jk === 'smith' ? 'Needs 2 logs in the barn' : jk === 'tailor' ? 'Needs 2 wool in the barn' : jk === 'cook' ? 'Needs food in the barn, and room in the pot' : null;
      }
      if (b.type === 'barn' || b.type === 'camp') {
        if (b.type === 'camp' && v.home < 0) add(sleepRough(v));
        add(A.deliver(v, b));
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
    if (jk === 'woodcutter' || jk === 'miner') {
      // the tree (or rock) within reach, preferring the one you face
      const cutter = jk === 'woodcutter';
      const want = cutter ? (c) => tree[c] === TR.TREE || (mark[c] && tree[c] && tree[c] !== TR.ROCK) : (c) => tree[c] === TR.ROCK;
      let best = -1, bd = 1.35;
      for (let j = (v.y | 0) - 1; j <= (v.y | 0) + 1; j++) for (let i = (v.x | 0) - 1; i <= (v.x | 0) + 1; i++) {
        if (!inb(i, j) || !want(idx(i, j))) continue;
        const d = Math.hypot(i + 0.5 - v.x, j + 0.5 - v.y) - (Math.abs(angDiff(v.ang, Math.atan2(j + 0.5 - v.y, i + 0.5 - v.x))) < 0.8 ? 0.3 : 0);
        if (d < bd) { bd = d; best = idx(i, j); }
      }
      if (best >= 0) {
        add(!cutter ? A.mine(v, best) : mark[best] ? A.grub(v, best) : A.chop(v, best));
        if (!canCarry(v, cutter ? 'logs' : 'stone')) S.hint = 'Your arms are full: take it to the barn';
      }
    }
    if (jk === 'forester' && jb && dist(v, entryC(jb)) < 12) {
      // the patch of grass in front of you
      const fx = Math.floor(v.x + Math.cos(v.ang) * 0.9), fy = Math.floor(v.y + Math.sin(v.ang) * 0.9);
      const fc = inb(fx, fy) ? idx(fx, fy) : -1;
      // the full check floods the valley, so only redo it when the cell in front changes
      if (!S.plantMemo || S.plantMemo.c !== fc || S.real - S.plantMemo.t > 1) S.plantMemo = { c: fc, t: S.real, ok: fc >= 0 && plantOk(fx, fy) };
      if (S.plantMemo.ok) add(A.plant(v, fc));
      else if (!out.length) S.hint = 'Face some open grass near the lodge to plant a sapling';
    }
    if (v.pocket && v.hunger < 90) add(A.eatPocket(v));
    if (jb && jk === 'henwife') { const e = jb.eggs.find((x) => dist(x, v) < 0.9); if (e) add(A.egg(v, jb, e)); }
    if (jb && (jk === 'dairy' || jk === 'shepherd')) {
      const a = jb.animals.find((x) => x.ready && dist(x, v) < 1.3);
      if (a) { const act = (jk === 'dairy' ? A.milk : A.shear)(v, jb, a); act.hold = a; add(act); }
    }
    // people
    let o = null, od = 1.3;
    for (const w of V) { if (w === v || w.gone || w.inside) continue; const d = dist(w, v); if (d < od) { od = d; o = w; } }
    if (o && !o.asleep) out.push(talkA(v, o));
    S.liftable = o && (!jk || jk === 'thief') && od < 1.1 ? o : null;
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
      if (v.act.t >= v.act.a.dur) { const a = v.act.a; v.act = null; if (a.ok()) { sfxMine = true; a.run(); sfxMine = false; } }
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
    banner(v.name.toUpperCase(), jobTitle(v), 'Today’s list is on the right. Esc to step back.');
    on('mode', { snap: true });
    on('save');
  }
  function stepBack(quiet) {
    const v = S.me;
    if (!v) return;
    v.path = null; v.act = null;
    S.me = null; S.mode = 'build'; S.follow = v;
    on('mode', { quiet: !!quiet });
    if (!quiet) on('save');
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
      for (let i = V.length - 1; i >= 0; i--) if (V[i].gone) V.splice(i, 1);
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

  // ---------- saving ----------
  function serialize() {
    const r1 = (n) => Math.round(n * 10) / 10;
    const trees = {};
    for (let c = 0; c < N; c++) if (treeT[c] > 0 && (tree[c] === TR.STUMP || tree[c] === TR.SAPLING)) trees[c] = r1(treeT[c]);
    const data = {
      v: 5, seed: S.seed, day: S.day, t: r1(S.t), renown: S.renown, store: S.store, stats: S.stats, nextId: S.nextId,
      ground: Array.from(ground).join(''), tree: Array.from(tree).join(''), treeT: trees,
      marks: Array.from(mark.keys()).filter((c) => mark[c]),
      B: B.map((b) => b && {
        type: b.type, x: b.x, y: b.y, turn: b.turn || 0, built: b.built, work: r1(b.work), workers: b.workers, stock: b.stock, crop: b.crop,
        cells: b.cells && b.cells.map((c) => [c.st, c.wet, r1(c.g), c.crop || '']),
        animals: b.animals.map((a) => [a.kind, r1(a.x), r1(a.y), a.ready ? 1 : 0, r1(a.woolT || 0), r1(a.layT || 0)]),
        eggs: b.eggs.map((e) => [r1(e.x), r1(e.y)]),
      }),
      V: V.map((v) => ({
        id: v.id, name: v.name, look: v.look, x: r1(v.x), y: r1(v.y), home: v.home, job: v.job, thief: v.thief, lifts: v.lifts, caughtN: v.caughtN,
        idleDays: v.idleDays, hunger: r1(v.hunger), energy: r1(v.energy), mood: r1(v.mood), joy: r1(v.joy), pocket: v.pocket, carry: v.carry, can: v.can,
        asleep: !!v.asleep, inside: v.inside, tasks: v.tasks, taskDay: v.taskDay, ate: v.ate, wakeAt: v.wakeAt, bedAt: v.bedAt, lastCut: v.lastCut || 0,
        bucket: v.bucket, gift: v.gift, leaving: v.leaving, lowDays: v.lowDays,
      })),
      me: S.me ? S.me.id : null, follow: S.follow ? S.follow.id : null,
    };
    return data;
  }
  function restore(d) {
    S.seed = d.seed; riverPhase = (d.seed % 97) / 15;
    Object.assign(S, { day: d.day, t: d.t, renown: d.renown, store: d.store || {}, stats: Object.assign(S.stats, d.stats), nextId: d.nextId });
    for (let c = 0; c < N; c++) { ground[c] = +d.ground[c] || 0; tree[c] = +d.tree[c] || 0; treeT[c] = 0; }
    for (const k in d.treeT) treeT[+k] = d.treeT[k];
    mark.fill(0);
    for (const c of d.marks || []) mark[c] = 1;
    sid.fill(-1); B.length = 0;
    d.B.forEach((o, i) => {
      if (!o) { B.push(null); return; }
      const bt = BT[o.type], f = footprint(o.type, o.turn || 0);
      const b = { id: i, type: o.type, x: o.x, y: o.y, w: f.w, h: f.h, turn: o.turn || 0, built: o.built, work: o.work, need: bt.work * 3, workers: o.workers || [], stock: o.stock || 0, q: [], eggs: [], animals: [], crop: o.crop || 'wheat', cells: null };
      B.push(b);
      for (let j = 0; j < b.h; j++) for (let k = 0; k < b.w; k++) sid[idx(b.x + k, b.y + j)] = i;
      if (o.cells) b.cells = o.cells.map((c) => ({ st: c[0], wet: c[1], g: c[2], crop: c[3] || null, claim: 0 }));
      b.animals = (o.animals || []).map((a) => ({ kind: a[0], x: a[1], y: a[2], ready: !!a[3], woolT: a[4], layT: a[5], tx: 0, ty: 0, wait: 1, flip: false, claim: 0 }));
      b.eggs = (o.eggs || []).map((e) => ({ x: e[0], y: e[1], claim: 0 }));
    });
    V.splice(0, V.length, ...d.V.map((o) => Object.assign({
      ang: Math.PI / 2, dir: 0, anim: 0, moving: false, path: null, pi: 0, act: null, wait: 0, bubble: null, nextLift: 0, claim: null, hello: [], ate: {}, gone: false,
    }, o)));
    S.me = d.me !== null ? vById(d.me) || null : null;
    S.follow = d.follow !== null ? vById(d.follow) || null : null;
    S.mode = S.me ? 'live' : 'build';
    S.dirty = true;
  }

  function newGame(seed) {
    S.seed = seed != null ? seed >>> 0 : (Math.random() * 1e9) | 0;
    Object.assign(S, {
      day: 1, t: WAKE + 1, renown: 0, store: { logs: 40, stone: 8, carrot: 24, bread: 16 }, tool: null, sel: null, selB: null, selT: -1, follow: null, me: null, turn: 0,
      toasts: [], banner: null, stats: { lifts: 0, caught: 0, tasks: 0, arrived: 0, left: 0 }, nextId: 0, speed: 1, paused: false, fullWarned: false,
    });
    V.length = 0;
    genWorld(S.seed);
    const Rs = rng(S.seed + 11);
    ['Nell', 'Bram', 'Tobin', 'Hester'].forEach((name, i) => {
      const v = makeVillager(name, HOME.x - 0.5 + i, HOME.y + 2.5 + (Rs() - 0.5) * 0.6, randomLook(Rs));
      makeTasks(v);
    });
    S.mode = 'build';
    S.follow = null;
    on('notice', null);
    on('new-game');
    banner('FURROW', 'Four villagers and a handcart', 'Build them a barn, houses and a field — then give them work');
    on('save');
  }

  let sfxMine = false;   // set while you are the one doing it
  function sfx(name) { on('sfx', { name, mine: sfxMine }); }
  const keys = {}, pressed = {};   // what is held, and what went down this step; the view fills them

  return {
    T, MW, HOME, ROAD_Y, RIVER_X, WELL_SERVES, SEC_PER_HOUR, NIGHT_SPEED, WAKE, CARRY, CAN, GROW_HOURS, WALK, G, TR, CROPS, GOODS, FOODS, BT, BUILD_TABS, SIDES, JOBS, NAMES, clamp, idx, inb, dist, angDiff, rng, cellHash, hhmm, ground, tree, treeT, sid, mark, B, V, riverCx, S, solidAt, penOf, footprint, entryAt, entry, entryC, walkable, stepCost, noise2, genWorld, quickStart, addBuilding, finishBuilding, removeBuilding, built, beds, waterFor, pop, storeCap, storeUsed, foodInStore, seen, bfsQ, flood, GROWTH_NAMES, clearer, whyNot, place, paveWhy, pave, plantOk, clearWhat, clearAt, setMark, anyoneFor, gScore, heap, hpush, hpop, findPath, besideCells, nearestWalkable, waterSpots, bankCells, nearWater, STYLES, HAIR_COLS, SKINS, COATS, LEG_COLS, randomLook, makeVillager, vById, jobB, jobKind, jobTitle, openings, assignJob, housemates, housePeople, say, dropClaims, claimIt, claimedByOther, mealNow, workHours, MEAL_NAMES, makeTasks, workTask, liftTask, payTask, progress, expireTasks, gainRenown, clock, addCarry, canCarry, storeAdd, takeFood, workUnit, A, retask, witnessOf, behindOf, lift, retaskThief, goTo, cellOfXY, entryCell, startAct, doAt, nearestBarn, deliverAI, goSleep, deliverLater, goEat, wander, idleAtWork, jobAnchor, siteAI, workAI, treeClaim, giveUp, nearestCell, criminalAI, evening, think, speedOf, faceTo, followPath, updVillager, wake, updWorld, updAnimal, dawn, wants, arrive, dusk, toast, banner, openTask, chatLine, talkA, sleepA, sleepRough, styleA, actionsFor, moveMe, updMe, liveAs, stepBack, step, tick, serialize, restore, newGame, MH, N, WORK_START, LUNCH, WORK_AGAIN, SUPPER, BED, PATH_BONUS, RUN, came, stamp, closed, heapF, keys, pressed, serialize,
    seedDice(n) { R = rng(n); },
  };
}
