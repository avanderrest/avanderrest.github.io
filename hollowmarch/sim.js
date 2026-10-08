/* Hollowmarch: the rules. A village at a crossroads, and a keep at the end of the roads.

   Everything that decides what happens lives here and nothing here touches the page: the
   board, the economy, the horde's pathing, waves, knights and the chronicle. view.js draws
   it and feeds it clicks; test/hollowmarch/*.node.js play it in Node at full speed.

     const game = createGame({ saved, rnd, on })
       saved   a previous game.serialize(), or nothing for a new keep
       rnd     the dice, () => [0, 1). Math.random by default; a seeded one makes a wave
               replay exactly (lib/rng.js mulberry32)
       on      on(event, data) for what the view has to react to:
               'wave-end' (the chronicle entry), 'game-over' ({ slain }), 'tile-lost' (index),
               'keep-hit', 'changed' (anything that alters the board or the purse)

   game.state is what gets saved; game.sim is the live wave (null between waves). */

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------
export const W = 8;
export const H = 8;
export const CASTLE_HP = 20;
export const START_GOLD = 80;
export const SUBSTEP = 0.05;      // simulation step in seconds
const BATTER = 3;                 // building damage per second per point of monster strength
const MARAUD = 1.5;               // tiles a ground monster will leave the road for to burn a village
const LOG_MAX = 40;

export const idx = (x, y) => y * W + x;
export const coords = (i) => [i % W, Math.floor(i / W)];
export const CASTLE = idx(W - 1, H - 1);
export const GATES = [idx(0, 0), idx(W - 1, 0), idx(0, H - 1)];
export const GATE_NAMES = { [idx(0, 0)]: 'the old road', [idx(W - 1, 0)]: 'the north road', [idx(0, H - 1)]: 'the west road' };

// Buildable tiles. `kind` decides behaviour: wall (obstacle), defence (shoots),
// barracks (trains knights), village (earns gold), buff (only boosts neighbours).
// What each one looks like is view.js's business (ICON there).
export const BUILD = {
  wall:     { name: 'Wall',         cost: 8,  hp: 120, kind: 'wall', cat: 'defence',
              desc: 'Cheap and stout. The horde walks around it, or batters it down if you seal every road. Wraiths float over.' },
  tower:    { name: 'Archer Tower', cost: 40, hp: 40,  kind: 'defence', cat: 'defence', range: 2.6, dmg: 5, rate: 0.6,
              desc: 'Shoots whatever is nearest the keep within 2½ tiles, in the air or on the ground. Towers spot for each other: each one beside another sees ⅖ of a tile further, and a ballista beside one sees further still.' },
  barracks: { name: 'Barracks',     cost: 50, hp: 60,  kind: 'barracks', cat: 'defence',
              desc: 'Trains 2 knights who march out to meet anything within 2½ tiles and hold it there while they fight. Click a built barracks with this tool to upgrade it (3, then 4 knights).' },
  smithy:   { name: 'Smithy',       cost: 45, hp: 40,  kind: 'buff', cat: 'defence',
              desc: 'Sharpens the blades: each tower, barracks or keep beside it deals +50% damage, a ballista +40%. A well beside the smithy is a quenching trough — it works 20% faster.' },
  tavern:   { name: 'Tavern',       cost: 35, hp: 40,  kind: 'village', cat: 'village', gold: 1,
              desc: 'Ale and song. Knights from a barracks beside it fight 30% faster; houses beside it pay +2g and markets +2g. It drinks well water and buys the farm’s barley, so it earns more with either beside it.' },
  farm:     { name: 'Farm',         cost: 20, hp: 40,  kind: 'village', cat: 'village', gold: 5,
              desc: 'Earns 5g a wave. Each well beside it adds +3g, each market +2g. It pays back what it is given: a market beside a farm earns +2g and a tavern +1g.' },
  house:    { name: 'House',        cost: 25, hp: 40,  kind: 'village', cat: 'village', gold: 3,
              desc: 'Earns 3g a wave. A market, tavern, chapel or well beside it adds more, and the people in it shop: a market beside a house earns +1g.' },
  market:   { name: 'Market',       cost: 40, hp: 40,  kind: 'village', cat: 'village', gold: 2,
              desc: 'Earns 2g, and every farm, house or tavern beside it earns more. It only earns anything itself if there is a farm, a house or a tavern beside it to trade with.' },
  well:     { name: 'Well',         cost: 20, hp: 40,  kind: 'buff', cat: 'village',
              desc: 'Farms beside it earn +3g, houses +1g, taverns +2g, and a smithy beside it works 20% faster. Earns nothing itself.' },
  ballista: { name: 'Ballista',     cost: 70, hp: 40, kind: 'defence', cat: 'defence', range: 4.6, dmg: 30, rate: 2.2, noAir: true,
              desc: 'Sees half the board and hits like a falling tree, once every couple of seconds. Cannot be brought to bear on anything in the air.' },
  mage:     { name: 'Mage Tower',   cost: 60, hp: 40, kind: 'defence', cat: 'defence', range: 3.0, dmg: 3, rate: 1.2, slow: 0.45,
              desc: 'Little damage, but whatever it touches wades for three seconds afterwards. Works on wraiths and dragons.' },
  chapel:   { name: 'Chapel',       cost: 45, hp: 40, kind: 'buff', cat: 'defence',
              desc: 'Knights from a barracks beside it fight for something: +25% damage, and back on their feet in half the time. Houses beside it pay +2g.' },
  demolish: { name: 'Demolish',     cost: 0, cat: 'tool',
              desc: 'Clear a tile. Refunds half the build cost.' },
};
export const FIXED = {
  castle: { name: 'The Keep', kind: 'defence', range: 2.5, dmg: 4, rate: 0.8 },
  gate:   { name: 'Road' },
};
export const info = (t) => BUILD[t] || FIXED[t];

// The village economy: the soft gold farms the horde stops to pillage.
export const VILLAGE_TYPES = new Set(['farm', 'tavern', 'house', 'market', 'well']);

// A bonus as a little badge on the board: a class for its colour and the text.
export function toTokens(bf) {
  const out = [];
  if (bf.gold) out.push({ cls: 'g', label: `+${bf.gold}g` });
  if (bf.power) out.push({ cls: 'p', label: `+${Math.round(bf.power * 100)}%` });
  if (bf.haste) out.push({ cls: 'h', label: `+${Math.round(bf.haste * 100)}%` });
  if (bf.range) out.push({ cls: 'r', label: `+${bf.range}` });
  if (bf.revive) out.push({ cls: 'v', label: '½' });
  return out;
}

// Adjacency buffs: a tile of type `from` boosts every neighbouring tile whose
// type is in `to`. Buffs stack per neighbour.
export const BUFFS = [
  // the village pays the village
  { from: 'well',     to: ['farm'],                          gold: 3 },
  { from: 'well',     to: ['house'],                         gold: 1 },
  { from: 'well',     to: ['tavern'],                        gold: 2 },
  { from: 'market',   to: ['farm', 'house'],                 gold: 2 },
  { from: 'market',   to: ['tavern'],                        gold: 3 },
  { from: 'tavern',   to: ['house'],                         gold: 2 },
  { from: 'tavern',   to: ['market'],                        gold: 2 },
  { from: 'farm',     to: ['market'],                        gold: 2 },
  { from: 'farm',     to: ['tavern'],                        gold: 1 },
  { from: 'house',    to: ['market'],                        gold: 1 },
  { from: 'chapel',   to: ['house'],                         gold: 2 },
  // the smithy sharpens, the well quenches
  { from: 'smithy',   to: ['tower', 'barracks', 'castle'],   power: 0.5 },
  { from: 'smithy',   to: ['ballista'],                      power: 0.4 },
  { from: 'well',     to: ['smithy'],                        haste: 0.2 },
  // and the chapel is what the knights are for
  { from: 'chapel',   to: ['barracks'],                      power: 0.25, revive: 0.5 },
  { from: 'chapel',   to: ['castle'],                        power: 0.25 },
  { from: 'tavern',   to: ['barracks'],                      haste: 0.3 },
  // towers spot for each other, and the mage tower speeds the loosing
  { from: 'tower',    to: ['tower'],                         range: 0.4 },
  { from: 'tower',    to: ['ballista'],                      range: 0.6 },
  { from: 'mage',     to: ['tower', 'ballista'],             haste: 0.25 },
  { from: 'mage',     to: ['castle'],                        haste: 0.2 },
];

// Knights: trained by a barracks, march to anything within `rally` tiles of
// home, hold it in place while they fight, retreat when hurt, respawn when killed.
export const KNIGHT = { hp: 45, hpPerLevel: 15, dmg: 6, dmgPerLevel: 2, rate: 0.7, speed: 1.7, rally: 2.5, leash: 3.3,
                        respawn: 7, heal: 6, retreatAt: 0.2, engage: 0.42, maxPer: 3 };
const SQUAD = [0, 2, 3, 4];               // knights per barracks level
export const UPGRADE_COST = [0, 40, 60];  // cost to reach level 2, level 3
export const MAX_LEVEL = 3;
export const SLOTS = [[-0.24, -0.2], [0.24, -0.2], [-0.24, 0.22], [0.24, 0.22]];

export const ENEMIES = {
  goblin:   { name: 'Goblin',    icon: '👺', hp: 14,  speed: 1.9,  dmg: 1,  bounty: 3,  pack: 3, note: 'fast and weak, comes in packs of 3' },
  orc:      { name: 'Orc',       icon: '🧌', hp: 48,  speed: 0.85, dmg: 2,  bounty: 6,  note: 'slow and tough' },
  skeleton: { name: 'Skeleton',  icon: '💀', hp: 30,  speed: 1.0,  dmg: 1,  bounty: 5,  reassemble: true, note: 'gets back up once when cut down' },
  troll:    { name: 'Troll',     icon: '👹', hp: 120, speed: 0.6,  dmg: 3,  bounty: 14, regen: 2, batter: 3, note: 'regenerates, batters walls hard' },
  wraith:   { name: 'Wraith',    icon: '👻', hp: 40,  speed: 1.3,  dmg: 2,  bounty: 12, flying: true, note: 'floats over walls; only arrows touch it' },
  ogre:     { name: 'Ogre Lord', icon: '👿', hp: 200, speed: 0.55, dmg: 6,  bounty: 60, batter: 3, boss: true, note: 'the boss: huge, slow, smashes walls' },
  dragon:   { name: 'Dragon',    icon: '🐉', hp: 160, speed: 0.5,  dmg: 8, bounty: 70, flying: true, boss: true, note: 'the boss: flies over everything; only arrows touch it' },
  wolf:     { name: 'Wolf',      icon: '🐺', hp: 18,  speed: 2.4,  dmg: 1,  bounty: 4,  pack: 5, note: 'very fast, comes in fives, does not stop for walls it can run round' },
  sapper:   { name: 'Sapper',    icon: '⛏️', hp: 55,  speed: 1.1,  dmg: 2,  bounty: 16, batter: 8, sapper: true, note: 'ignores the long way round: walks at your walls and takes them apart' },
  shaman:   { name: 'Shaman',    icon: '🧙', hp: 45,  speed: 1.0,  dmg: 1,  bounty: 20, healAura: 7, note: 'heals everything within two tiles of it; kill it first' },
  siege:    { name: 'Siege Ram', icon: '🛞', hp: 150, speed: 0.45, dmg: 3,  bounty: 34, batter: 2, reach: 3.2, note: 'stands off and pounds your buildings from further than a tower can shoot' },
};

const VILLAGERS = ['Old Tam', 'Wren the Tinker', 'Brother Aldous', 'Pip Hollowell', 'Marta Cobb', 'Dunstan the Drover',
  'Nell Ashby', 'Sister Ysolde', 'Barnaby Quill', 'Hob Thatcher', 'Ida Fernsby', 'Corin the Piper', 'Gudrun Pell',
  'Tobin Marsh', 'Lark Dunmore', 'Edda Greenhollow'];
const TRADES = ['farmer', 'miller', 'cooper', 'ostler', 'brewer', 'shepherd', 'weaver', 'reeve', 'smith\'s boy', 'goose girl'];

const LINES = {
  flawless: ['Not one of them reached the gate. The tavern sang till dawn.',
             'We watched from the walls with our arms folded.',
             'Arrows in the morning mist, and then quiet.',
             'The children counted the goblins from the well. Nobody counted ours.'],
  held:     ['They got close enough to smell the bread.',
             'A few reached the gate. The gate held.',
             'We put out the fires and counted heads. All present.'],
  costly:   ['They tore down the {lost}. We will build it back.',
             'Lost the {lost} to the trolls. Rebuilt it by noon, mostly.',
             'The {lost} is kindling. The keep still stands.'],
  bloody:   ['The keep shook. We are still here.',
             'Half the village hid in the cellar. The other half threw stones.',
             'There is blood on the keep\'s door. Not all of it ours.'],
  knights:  ['The knights held the road until the arrows finished it.',
             'Sir Somebody went down twice and got up twice. The barracks cook is furious.'],
  boss:     ['The {boss} fell within sight of the walls.',
             'They say the {boss}\'s roar cracked the chapel bell.'],
};

// ---------------------------------------------------------------------------
// Board geometry and stats (pure functions of a state)
// ---------------------------------------------------------------------------
export function neighbours(i) {
  const x = i % W;
  const y = Math.floor(i / W);
  const out = [];
  if (x > 0) out.push(i - 1);
  if (x < W - 1) out.push(i + 1);
  if (y > 0) out.push(i - W);
  if (y < H - 1) out.push(i + W);
  return out;
}
export const isFixed = (t) => t === 'castle' || t === 'gate';
export const isBuilding = (t) => !!t && !isFixed(t);
const dist2 = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

// Stats of the tile at i (or of `type` placed at i) after adjacency buffs.
export function tileStats(s, i, type) {
  const t = type || s.grid[i];
  if (!t) return null;
  const b = info(t);
  const lvl = t === 'barracks' ? Math.max(1, s.lvl[i] || 1) : 0;
  const st = { type: t, gold: b.gold || 0, dmg: b.dmg || 0, rate: b.rate || 0, range: b.range || 0, slow: b.slow || 0, noAir: !!b.noAir, power: 0, haste: 0, revive: 0, got: [], buffs: [], lvl };
  if (t === 'barracks') {
    st.dmg = KNIGHT.dmg + (lvl - 1) * KNIGHT.dmgPerLevel;
    st.rate = KNIGHT.rate;
    st.range = KNIGHT.rally;
    st.hp = KNIGHT.hp + (lvl - 1) * KNIGHT.hpPerLevel;
    st.squad = SQUAD[lvl];
  }
  for (const j of neighbours(i)) {
    const g = s.grid[j];
    if (!g) continue;
    for (const bf of BUFFS) {
      if (bf.from !== g || !bf.to.includes(t)) continue;
      st.buffs.push(...toTokens(bf));
      if (bf.gold) { st.gold += bf.gold; st.got.push(`+${bf.gold}g from ${info(g).name.toLowerCase()}`); }
      if (bf.power) { st.power += bf.power; st.got.push(`+${Math.round(bf.power * 100)}% damage from ${info(g).name.toLowerCase()}`); }
      if (bf.haste) { st.haste += bf.haste; st.got.push(`+${Math.round(bf.haste * 100)}% speed from ${info(g).name.toLowerCase()}`); }
      if (bf.range) { st.range += bf.range; st.got.push(`+${bf.range} tiles of range from ${info(g).name.toLowerCase()}`); }
      if (bf.revive) { st.revive += bf.revive; st.got.push(`fallen knights back in half the time, from ${info(g).name.toLowerCase()}`); }
    }
  }
  st.dmg = st.dmg * (1 + st.power);
  st.rate = st.rate / (1 + st.haste);
  return st;
}

// Which neighbours a tile of `type` at i would boost.
export function givesTo(s, i, type) {
  const names = [];
  for (const j of neighbours(i)) {
    const g = s.grid[j];
    if (g && BUFFS.some((bf) => bf.from === type && bf.to.includes(g))) names.push(info(g).name.toLowerCase());
  }
  return names;
}

export function income(s) {
  let total = 0;
  const from = {};
  for (let i = 0; i < W * H; i++) {
    const st = tileStats(s, i);
    if (st && st.gold) { total += st.gold; from[st.type] = (from[st.type] || 0) + st.gold; }
  }
  return { total, from };
}

// ---------------------------------------------------------------------------
// Pathing: a Dijkstra flow field towards the keep. Empty tiles cost 1, a
// building costs 1 + hp/2 (a wall is dearer than any detour on this board),
// so the horde walks around unless every road is sealed, then batters through.
// Fliers use a second field where everything costs 1.
// ---------------------------------------------------------------------------
function cellCost(s, i) {
  const t = s.grid[i];
  if (!isBuilding(t)) return 1;
  return 1 + Math.ceil(Math.max(0, s.hp[i]) / 2);
}

function computeFlow(s, costFn) {
  const dist = new Array(W * H).fill(Infinity);
  const next = new Array(W * H).fill(-1);
  const done = new Array(W * H).fill(false);
  dist[CASTLE] = 0;
  const open = [CASTLE];
  while (open.length) {
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (dist[open[k]] < dist[open[bi]]) bi = k;
    const u = open.splice(bi, 1)[0];
    if (done[u]) continue;
    done[u] = true;
    const stepCost = costFn(s, u);
    for (const n of neighbours(u)) {
      const cand = dist[u] + stepCost;
      if (cand < dist[n]) { dist[n] = cand; next[n] = u; if (!done[n]) open.push(n); }
    }
  }
  return { dist, next };
}

// The nearest tile of yours within r of a point, or -1. Used by anything that shoots back.
function nearestBuilding(s, x, y, r) {
  let best = -1, bd = r;
  for (let i = 0; i < W * H; i++) {
    if (!isBuilding(s.grid[i])) continue;   // the keep is not a target: it still has to walk there
    const [bx, by] = coords(i);
    const d = Math.hypot(bx - x, by - y);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

// The nearest village building within maraud range of a point, or -1.
function nearestVillage(s, x, y) {
  let best = -1, bd = MARAUD;
  for (let i = 0; i < W * H; i++) {
    if (!VILLAGE_TYPES.has(s.grid[i])) continue;
    const [bx, by] = coords(i);
    const d = Math.hypot(bx - x, by - y);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Waves
// ---------------------------------------------------------------------------
// The wave's spawn list. `rnd` shuffles the groups; the counts never depend on it, so the
// preview (waveSummary) can be drawn as often as the screen likes without using up dice.
export function waveComposition(n, rnd = Math.random) {
  const groups = [];
  const packs = 1 + Math.floor(n * 0.5);
  for (let i = 0; i < packs; i++) groups.push(['goblin', 'goblin', 'goblin']);
  const add = (type, k) => { for (let i = 0; i < k; i++) groups.push([type]); };
  if (n >= 2) add('orc', 1 + Math.floor(n / 2));
  if (n >= 3) for (let i = 0; i < Math.ceil(n / 6); i++) groups.push(['wolf', 'wolf', 'wolf', 'wolf', 'wolf']);
  if (n >= 4) add('skeleton', Math.floor((n - 2) / 2));
  if (n >= 6) add('troll', Math.floor((n - 4) / 3));
  if (n >= 6) add('sapper', Math.floor((n - 4) / 3));
  if (n >= 7) add('wraith', Math.floor((n - 5) / 3));
  if (n >= 9) add('shaman', Math.ceil((n - 7) / 5));
  if (n >= 12) add('siege', Math.floor((n - 9) / 4));
  for (let i = groups.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [groups[i], groups[j]] = [groups[j], groups[i]]; }
  if (n % 10 === 0) add('dragon', n / 10);
  else if (n % 5 === 0) add('ogre', 1 + Math.floor(n / 10));
  const gap = spawnGap(n);
  const list = [];
  for (const g of groups) g.forEach((type, k) => list.push({ type, gap: k < g.length - 1 ? 0.25 : gap }));
  return list;
}
export const hpScale = (n) => 1 + 0.1 * (n - 1);
const spawnGap = (n) => Math.max(0.5, 1.8 - n * 0.08);

export function waveSummary(n) {
  const counts = {};
  for (const e of waveComposition(n, () => 0)) counts[e.type] = (counts[e.type] || 0) + 1;
  return Object.entries(counts).map(([t, k]) => ({ type: t, count: k, hp: Math.round(ENEMIES[t].hp * hpScale(n)) }));
}

export function freshState() {
  const grid = new Array(W * H).fill(null);
  const hp = new Array(W * H).fill(0);
  const lvl = new Array(W * H).fill(0);
  grid[CASTLE] = 'castle';
  for (const g of GATES) grid[g] = 'gate';
  return { wave: 1, gold: START_GOLD, grid, hp, lvl, castleHp: CASTLE_HP, log: [], best: 0, fallen: false };
}

// A saved state, checked and brought up to date; null if it is not a Hollowmarch save.
export function restoreState(s) {
  if (!s || !Array.isArray(s.grid) || s.grid.length !== W * H || !Array.isArray(s.hp)) return null;
  s.grid[CASTLE] = 'castle';
  for (const g of GATES) s.grid[g] = 'gate';
  if (!Array.isArray(s.log)) s.log = [];
  // Older saves predate barracks levels.
  if (!Array.isArray(s.lvl) || s.lvl.length !== W * H) s.lvl = s.grid.map((t) => (t === 'barracks' ? 1 : 0));
  return s;
}

// ---------------------------------------------------------------------------
// The game
// ---------------------------------------------------------------------------
export function createGame({ saved = null, rnd = Math.random, on = () => {} } = {}) {
  const rand = (a) => a[Math.floor(rnd() * a.length)];
  let state = restoreState(saved) || freshState();
  let sim = null;       // live wave: enemies, shots, spawn queue
  let flow = null;      // path flow field towards the keep (respects buildings)
  let flowAir = null;   // flow field for fliers (ignores buildings)
  let flowSap = null;   // flow field for sappers (walls are a small detour, not a wall)
  let knights = [];     // knight squads, kept between waves
  let knightId = 1;
  let shotId = 1;

  function pathCells() {
    const on_ = new Set();
    for (const g of GATES) {
      let c = g;
      let guard = 0;
      while (c >= 0 && c !== CASTLE && guard++ < W * H) { on_.add(c); c = flow.next[c]; }
    }
    return on_;
  }

  // True when every road's path to the keep runs through a building somewhere.
  function sealedRoad() {
    return GATES.some((g) => {
      let c = g; let guard = 0;
      while (c >= 0 && c !== CASTLE && guard++ < W * H) { if (isBuilding(state.grid[c])) return true; c = flow.next[c]; }
      return false;
    });
  }

  function reflow() {
    flow = computeFlow(state, cellCost);
    // A sapper does not detour. Walls cost it a little more than open ground and nothing like
    // the full hp penalty, so it walks at the shortest line and takes apart whatever is on it.
    flowSap = computeFlow(state, (s, i) => (isBuilding(s.grid[i]) ? 3 : 1));
    if (!flowAir) flowAir = computeFlow(state, () => 1);
    if (sim) {
      for (const e of sim.enemies) e.next = -1;
      refreshDefenders();
    }
    refreshKnights();
  }

  function refreshDefenders() {
    const old = {};
    for (const d of sim.defenders) old[d.i] = d.cd;
    sim.defenders = [];
    for (let i = 0; i < W * H; i++) {
      const t = state.grid[i];
      if (!t || info(t).kind !== 'defence') continue;
      const st = tileStats(state, i);
      sim.defenders.push({ i, type: t, dmg: st.dmg, rate: st.rate, range: st.range, slow: st.slow, noAir: st.noAir, cd: old[i] || 0 });
    }
  }

  // Make the knight roster match the barracks on the board (count and stats).
  function refreshKnights() {
    const keep = [];
    for (let i = 0; i < W * H; i++) {
      if (state.grid[i] !== 'barracks') continue;
      const st = tileStats(state, i);
      const [hx, hy] = coords(i);
      const mine = knights.filter((k) => k.home === i);
      while (mine.length < st.squad) {
        const slot = mine.length;
        mine.push({ id: knightId++, home: i, hx, hy, slot, x: hx + SLOTS[slot][0], y: hy + SLOTS[slot][1], hp: st.hp, maxHp: st.hp,
          dmg: st.dmg, rate: st.rate, cd: 0, state: 'idle', target: null, respawnT: 0, facing: 1, swing: 0,
          respawn: KNIGHT.respawn * (1 - Math.min(0.6, st.revive)) });
      }
      mine.length = Math.min(mine.length, st.squad);
      for (const k of mine) {
        const frac = k.maxHp ? k.hp / k.maxHp : 1;
        k.maxHp = st.hp; k.hp = Math.min(st.hp, Math.max(k.hp, Math.round(frac * st.hp)));
        k.dmg = st.dmg; k.rate = st.rate;
        k.respawn = KNIGHT.respawn * (1 - Math.min(0.6, st.revive));
      }
      keep.push(...mine);
    }
    knights = keep;
  }

  function restKnights() {
    for (const k of knights) {
      k.state = 'idle'; k.target = null; k.hp = k.maxHp; k.cd = 0; k.swing = 0;
      k.x = k.hx + SLOTS[k.slot][0]; k.y = k.hy + SLOTS[k.slot][1];
    }
  }

  function enemyOn(i) {
    if (!sim) return false;
    return sim.enemies.some((e) => !e.dead && !e.flying && (e.cell === i || e.next === i));
  }

  // ----- the player's verbs -----

  // Build, upgrade or demolish with `tool` on cell i. Returns { ok, msg }; msg says why not.
  function place(i, tool) {
    if (state.fallen) return { ok: false, msg: '' };
    const t = state.grid[i];
    if (isFixed(t)) return { ok: false, msg: t === 'castle' ? 'That is the keep. Defend it.' : 'The roads stay open; build beside them.' };
    if (tool === 'demolish') {
      if (!t) return { ok: false, msg: '' };
      state.grid[i] = null;
      state.hp[i] = 0;
      state.lvl[i] = 0;
      state.gold += Math.floor(BUILD[t].cost / 2);
    } else if (t === 'barracks' && tool === 'barracks') {
      const lvl = state.lvl[i] || 1;
      if (lvl >= MAX_LEVEL) return { ok: false, msg: 'This barracks is already at full strength.' };
      const cost = UPGRADE_COST[lvl];
      if (state.gold < cost) return { ok: false, msg: `Not enough gold. The upgrade costs ${cost}g.` };
      state.gold -= cost;
      state.lvl[i] = lvl + 1;
    } else {
      if (t) return { ok: false, msg: 'Demolish it first.' };
      if (enemyOn(i)) return { ok: false, msg: 'Monsters are standing there.' };
      const b = BUILD[tool];
      if (state.gold < b.cost) return { ok: false, msg: `Not enough gold. ${b.name} costs ${b.cost}g.` };
      state.gold -= b.cost;
      state.grid[i] = tool;
      state.hp[i] = b.hp;
      state.lvl[i] = tool === 'barracks' ? 1 : 0;
    }
    reflow();
    on('changed');
    return { ok: true, msg: '' };
  }

  function startWave() {
    if (sim || state.fallen) return { ok: false, msg: '' };
    const n = state.wave;
    if (n === 1) {
      let tower = false, farm = false;
      for (let i = 0; i < W * H; i++) {
        if (state.grid[i] === 'tower') tower = true;
        else if (state.grid[i] === 'farm') farm = true;
      }
      if (!tower || !farm) return { ok: false, msg: 'Raise an archer tower and a farm before you sound the alarm.' };
    }
    sim = {
      queue: waveComposition(n, rnd), spawnT: 0.3, nextId: 1, time: 0,
      enemies: [], shots: [], defenders: [], slain: 0, leaked: 0, bounty: 0, lost: [], bossSlain: null, knightsFallen: 0,
      castleAtStart: state.castleHp, preview: waveSummary(n),
    };
    refreshDefenders();
    return { ok: true, msg: '' };
  }

  function newGame() {
    const best = state ? state.best : 0;
    sim = null;
    knights = [];
    state = freshState();
    state.best = best;
    reflow();
  }

  // ----- the wave, a substep at a time -----

  function spawnEnemy(type) {
    const base = ENEMIES[type];
    const gate = rand(GATES);
    const [x, y] = coords(gate);
    const hp = Math.round(base.hp * hpScale(state.wave));
    sim.enemies.push({
      id: sim.nextId++, type, hp, maxHp: hp, x, y, cell: gate, next: -1, speed: base.speed, dmg: base.dmg, bounty: base.bounty,
      flying: !!base.flying, regen: base.regen || 0, batter: base.batter || 1, reassemble: !!base.reassemble, reassembled: false,
      sapper: !!base.sapper, healAura: base.healAura || 0, reach: base.reach || 0, slowT: 0, slowK: 0,
      pile: 0, swingT: 0.4, attacking: false, blocked: false, blockers: [], dead: false, pillage: -1,
    });
  }

  function destroyTile(i) {
    const t = state.grid[i];
    state.grid[i] = null;
    state.hp[i] = 0;
    state.lvl[i] = 0;
    sim.lost.push(BUILD[t].name);
    reflow();
    on('tile-lost', i);
  }

  const targetable = (e) => !e.dead && e.pile <= 0;

  function enemyDown(e) {
    if (e.reassemble && !e.reassembled) {
      e.reassembled = true;
      e.pile = 2.5;
      e.hp = 0;
      return;
    }
    e.dead = true;
    state.gold += e.bounty;
    sim.bounty += e.bounty;
    sim.slain += 1;
    if (ENEMIES[e.type].boss) sim.bossSlain = ENEMIES[e.type].name.toLowerCase();
  }

  function stepKnights(dt) {
    const sm = sim;
    const byId = {};
    const engaged = {};
    if (sm) for (const e of sm.enemies) if (targetable(e) && !e.flying) byId[e.id] = e;
    for (const k of knights) if (k.target !== null && (k.state === 'march' || k.state === 'fight')) engaged[k.target] = (engaged[k.target] || 0) + 1;

    const moveTo = (k, tx, ty, stopAt) => {
      const dx = tx - k.x;
      const dy = ty - k.y;
      const d = Math.hypot(dx, dy);
      if (d <= stopAt) return true;
      const step = Math.min(KNIGHT.speed * dt, d - stopAt);
      k.x += dx / d * step;
      k.y += dy / d * step;
      if (Math.abs(dx) > 0.05) k.facing = dx < 0 ? -1 : 1;
      return d - step <= stopAt + 0.001;
    };

    for (const k of knights) {
      k.swing = Math.max(0, k.swing - dt);
      if (k.state === 'dead') {
        k.respawnT -= dt;
        if (k.respawnT <= 0) { k.state = 'idle'; k.hp = k.maxHp; k.x = k.hx + SLOTS[k.slot][0]; k.y = k.hy + SLOTS[k.slot][1]; }
        continue;
      }
      if (k.state === 'idle' || k.state === 'return') {
        const homeX = k.hx + SLOTS[k.slot][0];
        const homeY = k.hy + SLOTS[k.slot][1];
        if (moveTo(k, homeX, homeY, 0.02)) {
          k.state = 'idle';
          k.hp = Math.min(k.maxHp, k.hp + KNIGHT.heal * dt);
        }
        if (k.state === 'idle' && sm && k.hp >= k.maxHp * 0.5) {
          let best = null;
          let bestScore = Infinity;
          for (const e of Object.values(byId)) {
            if (dist2(e.x, e.y, k.hx, k.hy) > KNIGHT.rally) continue;
            const n = engaged[e.id] || 0;
            if (n >= KNIGHT.maxPer) continue;
            const rem = e.next >= 0 ? flow.dist[e.next] : flow.dist[e.cell];
            const score = n * 10 + rem;
            if (score < bestScore) { bestScore = score; best = e; }
          }
          if (best) { k.target = best.id; k.state = 'march'; engaged[best.id] = (engaged[best.id] || 0) + 1; }
        }
        continue;
      }
      const e = byId[k.target];
      if (!e || dist2(e.x, e.y, k.hx, k.hy) > KNIGHT.leash) { k.state = 'return'; k.target = null; continue; }
      if (k.state === 'march') {
        if (moveTo(k, e.x, e.y, KNIGHT.engage)) k.state = 'fight';
        continue;
      }
      // fight
      if (dist2(e.x, e.y, k.x, k.y) > KNIGHT.engage + 0.35) { k.state = 'march'; continue; }
      if (Math.abs(e.x - k.x) > 0.05) k.facing = e.x < k.x ? -1 : 1;
      e.blocked = true;
      e.blockers.push(k);
      k.cd -= dt;
      if (k.cd <= 0) {
        k.cd = k.rate;
        k.swing = 0.25;
        e.hp -= k.dmg;
        if (e.hp <= 0) enemyDown(e);
      }
      if (k.hp < k.maxHp * KNIGHT.retreatAt) { k.state = 'return'; k.target = null; }
    }
  }

  function stepSim(dt) {
    const s = state;
    const sm = sim;
    sm.time += dt;

    if (sm.queue.length) {
      sm.spawnT -= dt;
      if (sm.spawnT <= 0) { const q = sm.queue.shift(); spawnEnemy(q.type); sm.spawnT = q.gap; }
    }

    for (const e of sm.enemies) { e.blocked = false; e.blockers = []; }
    stepKnights(dt);

    for (const e of sm.enemies) {
      if (e.dead) continue;
      if (e.pile > 0) {
        e.pile -= dt;
        if (e.pile <= 0) { e.pile = 0; e.hp = Math.round(e.maxHp * 0.5); }
        e.attacking = false;
        continue;
      }
      if (e.regen) e.hp = Math.min(e.maxHp, e.hp + e.regen * dt);
      if (e.slowT > 0) e.slowT -= dt;
      if (e.blocked) {
        // Held by knights: fight them instead of moving on. Heavy blows every 0.8s.
        e.attacking = true;
        e.swingT -= dt;
        if (e.swingT <= 0) {
          e.swingT = 0.8;
          const k = e.blockers[Math.floor(rnd() * e.blockers.length)];
          k.hp -= 3 + e.dmg * 3;
          if (k.hp <= 0) { k.hp = 0; k.state = 'dead'; k.target = null; k.respawnT = k.respawn || KNIGHT.respawn; sm.knightsFallen += 1; }
        }
        continue;
      }
      if (!e.flying) {
        let v = e.pillage;
        if (v < 0 || !VILLAGE_TYPES.has(s.grid[v])) v = nearestVillage(s, e.x, e.y);
        if (v >= 0 && VILLAGE_TYPES.has(s.grid[v])) {
          e.pillage = v;
          e.attacking = true;
          s.hp[v] -= e.dmg * e.batter * BATTER * dt;
          if (s.hp[v] <= 0) destroyTile(v);
          continue;
        }
        e.pillage = -1;
      }
      const field = e.flying ? flowAir : e.sapper ? flowSap : flow;
      if (e.next < 0) e.next = field.next[e.cell];
      if (e.next < 0) continue;
      const t = s.grid[e.next];
      if (isBuilding(t) && !e.flying) {
        e.attacking = true;
        s.hp[e.next] -= e.dmg * e.batter * BATTER * dt;
        if (s.hp[e.next] <= 0) destroyTile(e.next);
        continue;
      }
      // A siege ram never has to arrive. It stops as soon as anything of yours is inside its
      // reach, which is further than a tower can shoot, and starts throwing stones at it.
      if (e.reach) {
        const hit = nearestBuilding(s, e.x, e.y, e.reach);
        if (hit >= 0) {
          e.attacking = true;
          s.hp[hit] -= e.dmg * e.batter * BATTER * dt;
          if (s.hp[hit] <= 0) destroyTile(hit);
          sm.shots.push({ id: shotId++, x0: e.x, y0: e.y, x1: coords(hit)[0], y1: coords(hit)[1], t: 0, dur: 0.3, kind: 'stone' });
          continue;
        }
      }
      e.attacking = false;
      const [tx, ty] = coords(e.next);
      const dx = tx - e.x;
      const dy = ty - e.y;
      const d = Math.hypot(dx, dy);
      const step = e.speed * (e.slowT > 0 ? 1 - e.slowK : 1) * dt;
      if (d <= step) {
        e.x = tx; e.y = ty; e.cell = e.next; e.next = -1;
        if (e.cell === CASTLE) {
          s.castleHp = Math.max(0, s.castleHp - e.dmg);
          e.dead = true;
          sm.leaked += 1;
          on('keep-hit');
        }
      } else {
        e.x += dx / d * step;
        e.y += dy / d * step;
      }
    }

    // Shamans mend whatever is near them, themselves included, which is why they are worth
    // twenty gold and why leaving one alive at the back of a pack is how a wave gets through.
    for (const h of sm.enemies) {
      if (h.dead || !h.healAura || h.pile > 0) continue;
      for (const e of sm.enemies) {
        if (e.dead || e.pile > 0 || e.hp >= e.maxHp) continue;
        if (Math.hypot(e.x - h.x, e.y - h.y) > 2.1) continue;
        e.hp = Math.min(e.maxHp, e.hp + h.healAura * dt);
      }
    }

    for (const d of sm.defenders) {
      d.cd -= dt;
      if (d.cd > 0) continue;
      const [cx, cy] = coords(d.i);
      let best = null;
      let bestRem = Infinity;
      for (const e of sm.enemies) {
        if (!targetable(e)) continue;
        if (d.noAir && e.flying) continue;
        if (Math.hypot(e.x - cx, e.y - cy) > d.range) continue;
        const field = e.flying ? flowAir : flow;
        let rem;
        if (e.next >= 0) { const [nx, ny] = coords(e.next); rem = field.dist[e.next] + Math.hypot(e.x - nx, e.y - ny); }
        else rem = field.dist[e.cell];
        if (rem < bestRem) { bestRem = rem; best = e; }
      }
      if (!best) continue;
      d.cd = d.rate;
      best.hp -= d.dmg;
      if (d.slow) { best.slowT = 3; best.slowK = Math.max(best.slowK, d.slow); }
      sm.shots.push({ id: shotId++, x0: cx, y0: cy, x1: best.x, y1: best.y, t: 0, dur: 0.18, kind: d.slow ? 'hex' : d.type === 'ballista' ? 'bolt' : 'arrow' });
      if (best.hp <= 0 && !best.dead) enemyDown(best);
    }

    sm.enemies = sm.enemies.filter((e) => !e.dead);
    for (const p of sm.shots) p.t += dt;
    sm.shots = sm.shots.filter((p) => p.t < p.dur);

    if (s.castleHp <= 0) { gameOver(); return; }
    if (!sm.queue.length && !sm.enemies.length) endWave();
  }

  function chronicleLine(entry) {
    const lostHp = entry.castleAtStart - entry.castleHp;
    let pool;
    if (lostHp >= 5) pool = LINES.bloody;
    else if (entry.lost.length) pool = LINES.costly;
    else if (entry.leaked) pool = LINES.held;
    else if (entry.knightsFallen >= 2 && rnd() < 0.5) pool = LINES.knights;
    else pool = LINES.flawless;
    let text = rand(pool).replace('{lost}', (entry.lost[0] || 'wall').toLowerCase());
    if (entry.bossSlain) text = `${rand(LINES.boss).replace('{boss}', entry.bossSlain)} ${text}`;
    return text;
  }

  function endWave() {
    const sm = sim;
    sim = null;
    restKnights();
    const inc = income(state);
    state.gold += inc.total;
    const entry = {
      wave: state.wave, slain: sm.slain, leaked: sm.leaked, bounty: sm.bounty, income: inc.total, from: inc.from,
      lost: sm.lost, castleHp: state.castleHp, castleAtStart: sm.castleAtStart, bossSlain: sm.bossSlain, knightsFallen: sm.knightsFallen,
      who: rand(VILLAGERS), trade: rand(TRADES),
    };
    entry.text = chronicleLine(entry);
    state.log = [entry].concat(state.log).slice(0, LOG_MAX);
    state.best = Math.max(state.best, state.wave);
    state.wave += 1;
    on('wave-end', entry);
  }

  function gameOver() {
    const sm = sim;
    sim = null;
    restKnights();
    state.fallen = true;
    state.best = Math.max(state.best, state.wave);
    on('game-over', { slain: sm.slain });
  }

  // Advance the live wave by `sec` seconds, in fixed substeps.
  function step(sec) {
    let total = sec;
    while (total > 1e-9 && sim) {
      const h = Math.min(SUBSTEP, total);
      stepSim(h);
      total -= h;
    }
  }

  reflow();

  return {
    get state() { return state; },
    get sim() { return sim; },
    get flow() { return flow; },
    get knights() { return knights; },
    place, startWave, newGame, step, stepSim, reflow, enemyOn, pathCells, sealedRoad,
    income: () => income(state),
    tileStats: (i, type) => tileStats(state, i, type),
    givesTo: (i, type) => givesTo(state, i, type),
    serialize: () => JSON.parse(JSON.stringify(state)),
  };
}
