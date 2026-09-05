/* Donut Works — a small donut factory. Lay machines and belts on a grid, dough
   goes in one end and money comes out the other. Later levels hand you a
   splitter so one line can fan out into several silly variants. */
(() => {
  'use strict';

  // ---------- constants ----------
  const SAVE_KEY = 'donut-works-save-v1';
  const SOUND_KEY = 'donut-works-sound';
  const COLS = 12, ROWS = 8, T = 60;
  const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];
  const SPACING = 0.42;          // minimum gap between items on a belt, in tiles
  const BELT_SPEED = 1.1;        // tiles per second
  const START_CASH = 1500;       // pence
  const DOUGH_COST = 5;
  const CASH_FLOOR = -300;       // the hopper stops when you are this far in the red
  const MAX_TOPS = 2;
  const SPECIAL_LENGTH = 90;     // seconds a special stays on the board
  const SPECIAL_FROM_LEVEL = 2;  // index into LEVELS

  const GLAZES = {
    sugar: { name: 'Sugar glaze', col: '#fbf1dc', edge: '#e6d3ad', cost: 4 },
    pink: { name: 'Pink glaze', col: '#f48fb1', edge: '#d8648f', cost: 4 },
    choc: { name: 'Chocolate', col: '#5b3a1e', edge: '#3e2712', cost: 5 },
    maple: { name: 'Maple', col: '#c8843a', edge: '#a3642a', cost: 5 },
    blue: { name: 'Bubblegum blue', col: '#5fb8e8', edge: '#3a8fc0', cost: 6 },
  };
  const FILLINGS = {
    jam: { name: 'Jam', col: '#c8323c', cost: 8 },
    custard: { name: 'Custard', col: '#f2c94c', cost: 8 },
    beans: { name: 'Baked beans', col: '#d9622b', cost: 5, silly: true },
    mystery: { name: 'Mystery filling', col: '#8a5cc4', cost: 10, silly: true },
  };
  const MYSTERIES = [
    'spaghetti', 'a small coin', 'more donut', 'a single sock', 'existential dread',
    'gravy', 'confetti', 'a note that just says "hi"', 'lukewarm soup', 'marbles (do not eat)',
    'a second, smaller donut', 'mashed potato', 'the colour blue', 'jelly and a fork',
  ];
  // draw: procedural (sprinkles, chips, cereal) or an emoji
  const TOPS = {
    sprinkles: { name: 'Sprinkles', cost: 4, draw: 'sprinkles' },
    chocchips: { name: 'Choc chips', cost: 5, draw: 'chips' },
    cereal: { name: 'Cereal loops', cost: 4, draw: 'cereal' },
    bacon: { name: 'Bacon', ico: '🥓', cost: 9, silly: true },
    worms: { name: 'Gummy worms', ico: '🪱', cost: 6, silly: true },
    pickle: { name: 'A whole pickle', ico: '🥒', cost: 6, silly: true },
    fish: { name: 'Gummy fish', ico: '🐟', cost: 6, silly: true },
    chips: { name: 'Chips', ico: '🍟', cost: 7, silly: true },
    eyes: { name: 'Googly eyes', ico: '👀', cost: 5, silly: true },
    hat: { name: 'A tiny hat', ico: '🎩', cost: 8, silly: true },
    glitter: { name: 'Edible glitter', ico: '✨', cost: 7, silly: true },
    popping: { name: 'Popping candy', ico: '💥', cost: 6, silly: true },
    dice: { name: 'Lucky dip', ico: '🎲', cost: 6, silly: true, random: true },
  };

  // Named recipes: exact match on glaze, filling and the set of toppings.
  const RECIPES = [
    { id: 'party', name: 'Party Ring', glaze: 'pink', filling: null, tops: ['sprinkles'], quip: 'Not to be confused with the biscuit. Legally.' },
    { id: 'dchoc', name: 'Double Choc', glaze: 'choc', filling: null, tops: ['chocchips'], quip: 'Chocolate, but more so.' },
    { id: 'jam', name: 'Classic Jam', glaze: 'sugar', filling: 'jam', tops: [], quip: "Someone's nan approves." },
    { id: 'custard', name: 'Custard Cream', glaze: 'choc', filling: 'custard', tops: [], quip: 'Also not a biscuit. Stop asking.' },
    { id: 'cereal', name: 'Breakfast of Champions', glaze: 'maple', filling: null, tops: ['cereal'], quip: 'Part of a balanced breakfast, allegedly.' },
    { id: 'bakesale', name: 'Bake Sale', glaze: 'pink', filling: 'jam', tops: ['sprinkles'], quip: 'Made with love and about a kilo of sugar.' },
    { id: 'baconroll', name: 'Bacon Roll', glaze: 'sugar', filling: null, tops: ['bacon'], quip: 'The bacon is the point.' },
    { id: 'english', name: 'The Full English', glaze: 'maple', filling: 'beans', tops: ['bacon'], quip: "Breakfast, sorted. Please don't think about it." },
    { id: 'compost', name: 'Compost Heap', glaze: 'choc', filling: null, tops: ['worms'], quip: 'Technically organic.' },
    { id: 'dill', name: 'Dill With It', glaze: 'sugar', filling: null, tops: ['pickle'], quip: 'For people who are fine, actually.' },
    { id: 'salad', name: 'The Salad', glaze: null, filling: null, tops: ['pickle', 'worms'], quip: 'Legally a salad in at least one county.' },
    { id: 'aquarium', name: 'Aquarium', glaze: 'blue', filling: null, tops: ['fish'], quip: 'Please do not tap the glaze.' },
    { id: 'fishsupper', name: 'Fish Supper', glaze: 'sugar', filling: null, tops: ['fish', 'chips'], quip: 'The chip shop is closed. This is what is left.' },
    { id: 'fishing', name: 'Gone Fishing', glaze: 'blue', filling: null, tops: ['fish', 'worms'], quip: 'Bait included.' },
    { id: 'judge', name: 'Judgemental', glaze: 'choc', filling: null, tops: ['eyes'], quip: 'It knows what you did.' },
    { id: 'beans', name: 'Beans On', glaze: null, filling: 'beans', tops: ['eyes'], quip: 'It has seen things. Mostly beans.' },
    { id: 'bureaucrat', name: 'The Bureaucrat', glaze: 'sugar', filling: 'custard', tops: ['hat'], quip: 'Forms available on request.' },
    { id: 'magician', name: 'The Magician', glaze: 'pink', filling: 'mystery', tops: ['hat'], quip: "Something's in there. Ta-da." },
    { id: 'disco', name: 'Disco Inferno', glaze: 'pink', filling: null, tops: ['glitter', 'popping'], quip: 'Burn, baby, burn. Edibly.' },
    { id: 'fizzy', name: 'Fizzy Pop', glaze: 'blue', filling: null, tops: ['popping', 'sprinkles'], quip: 'Keep away from open flames and dentists.' },
    { id: 'posh', name: 'Terribly Posh', glaze: 'choc', filling: 'custard', tops: ['glitter', 'hat'], quip: 'Served with a raised eyebrow.' },
  ];
  const RECIPE_MULT = 1.5;
  const VALUE = { donut: 50, blob: 25, charcoal: 5, raw: 2, glaze: 30, filling: 35, top: 25 };

  const MACHINES = {
    hopper: { name: 'Dough Hopper', ico: '🌾', cost: 200, time: 2.5, col: '#ecd9ad', source: true, desc: 'Plops out a ball of dough every few seconds. Flour costs 5p a go.' },
    press: { name: 'Ring Press', ico: '⭕', cost: 250, time: 1.5, col: '#c9d6e8', desc: 'Punches the hole. Dough in, ring out.' },
    fryer: { name: 'Fryer', ico: '🍳', cost: 400, time: 4, col: '#f0b47a', desc: 'Rings in, donuts out. Slow. Fries anything it is given, for better or worse.' },
    glazer: { name: 'Glazer', ico: '🎨', cost: 600, time: 2, col: '#f6b8d0', cfgKind: 'glaze', desc: 'Dips fried donuts in glaze. Click it to pick the flavour.' },
    topper: { name: 'Topper', ico: '🍬', cost: 800, time: 2, col: '#c9e6b8', cfgKind: 'top', desc: 'Drops a topping on. Two per donut at most. Click it to choose.' },
    filler: { name: 'Filler', ico: '🧴', cost: 1000, time: 2.5, col: '#f2dc9a', cfgKind: 'fill', desc: 'Squirts something into the middle. One filling per donut.' },
    splitter: { name: 'Splitter', ico: '🔀', cost: 500, time: 0.15, col: '#dcdcdc', desc: 'Takes one line and deals it out left, ahead and right, wherever there is room.' },
    counter: { name: 'Shop Counter', ico: '🛎️', cost: 100, time: 0, col: '#b6dcd4', omni: true, sink: true, desc: 'Sells whatever arrives. Customers have opinions.' },
    bin: { name: 'Bin', ico: '🗑️', cost: 100, time: 0, col: '#c4c4c4', omni: true, sink: true, desc: 'Eats anything. Handy for mistakes and overflow.' },
  };
  const BELT_COST = 10;
  const MAX_LVL = 3;

  const LEVELS = [
    {
      name: 'First Batch', who: 'The shop out front',
      blurb: 'We open in ten minutes and the shelves are bare. Anything round and fried will do.',
      goals: [{ n: 10, filter: { stage: 'donut' }, label: 'Sell 10 donuts' }],
      unlock: { machines: ['glazer'], glazes: ['sugar', 'pink', 'choc'] }, bonus: 800,
      hint: 'Hopper, press, fryer, counter, in that order, joined by belts. Machines push out of the arrow side.',
    },
    {
      name: 'Glazed Over', who: 'A regular',
      blurb: 'Plain is fine. Plain is also plain. Dip them in something.',
      goals: [{ n: 12, filter: { glazed: true }, label: 'Sell 12 glazed donuts' }],
      unlock: { machines: ['topper'], tops: ['sprinkles', 'chocchips'] }, bonus: 1000,
      hint: 'Put a glazer between the fryer and the counter. The fryer is the slow one; a second fryer doubles your rate.',
    },
    {
      name: 'Party Rings', who: 'A birthday, apparently',
      blurb: 'Pink. Sprinkles. Twelve of them, and no I will not be told they are not biscuits.',
      goals: [{ n: 10, filter: { recipe: 'party' }, label: 'Sell 10 Party Rings' }],
      unlock: { machines: ['splitter'], tops: ['cereal'], glazes: ['maple'] }, bonus: 1200,
      hint: 'Pink glaze then sprinkles makes a named recipe worth half again as much.',
    },
    {
      name: 'Two Lines', who: 'The shop out front',
      blurb: 'Half the queue wants pink, half wants chocolate, and they are all glaring at each other.',
      goals: [
        { n: 8, filter: { recipe: 'party' }, label: 'Sell 8 Party Rings' },
        { n: 8, filter: { recipe: 'dchoc' }, label: 'Sell 8 Double Chocs' },
      ],
      unlock: { machines: ['filler'], fillings: ['jam', 'custard'] }, bonus: 1500,
      hint: 'A splitter after the fryer sends donuts down two belts. Give each belt its own glazer and topper.',
    },
    {
      name: 'Stuffed', who: "Someone's nan",
      blurb: 'In my day a donut had jam in it. Where is the jam. Show me the jam.',
      goals: [{ n: 10, filter: { recipe: 'jam' }, label: 'Sell 10 Classic Jams' }],
      unlock: { tops: ['bacon', 'worms', 'pickle'], fillings: ['beans'] }, bonus: 1500,
      hint: 'Sugar glaze plus jam filling, and nothing on top.',
    },
    {
      name: 'The Full English', who: 'A van driver',
      blurb: 'Maple. Bacon. Beans in the middle. Do not look at me like that, just make it.',
      goals: [{ n: 8, filter: { recipe: 'english' }, label: 'Sell 8 Full Englishes' }],
      unlock: { glazes: ['blue'], tops: ['fish', 'chips', 'eyes'] }, bonus: 2000,
      hint: 'That is a glazer, a filler and a topper in one line. Any order after the fryer works.',
    },
    {
      name: 'Variety Pack', who: 'The shop out front',
      blurb: 'The window needs a spread. Named recipes only, and at least three different kinds.',
      goals: [{ n: 24, filter: { named: true }, distinct: 3, label: 'Sell 24 named recipes (3+ kinds)' }],
      unlock: { tops: ['hat', 'glitter', 'popping', 'dice'], fillings: ['mystery'] }, bonus: 2500,
      hint: 'A splitter with three outputs can run three lines. Check the recipe book for combinations.',
    },
    {
      name: 'Open All Hours', who: 'Everyone, somehow',
      blurb: 'Word has got out about the pickle one. Silly toppings, as many as you can manage.',
      goals: [{ n: 40, filter: { silly: true }, label: 'Sell 40 donuts with a silly topping' }],
      unlock: {}, bonus: 3000,
      hint: 'Anything from bacon onwards counts. The special on the board pays double while it lasts.',
    },
  ];

  const QUIPS = {
    raw: ['That is... raw.', 'Is this a joke?', 'I can see the flour.', 'Ew.'],
    charcoal: ['Is this a coaster?', 'It is still smoking.', 'Bold.', 'I will take it for the cat.'],
    blob: ['Where is the hole?', 'A donut ball. Sure.', 'Round enough.', 'Bit lumpy.'],
    plain: ['Fine.', 'Yep.', 'Classic.', 'Ta.', 'A donut. Lovely.'],
    nice: ['Ooh!', 'Yes please.', 'Lovely.', 'I will take twelve.', 'That is the one.'],
    silly: ['Is that... bacon?', 'I have questions.', 'Why is it looking at me?', 'Brave.', 'My dentist will hear about this.', 'Say nothing.'],
    recipe: ['Oh, the good one!', 'That is the stuff.', 'Finally.', 'Two, actually.'],
  };

  // ---------- state ----------
  let grid, cash, level, goals, sold, discovered, unlocked, special, simTime, saleLog, binned;
  let speed = 1, tool = null, toolDir = 0, selected = null, hover = null, painting = false, lastPaint = null;
  let floats = [], puffs = [], tab = 'build';
  let soundOn = false, audio = null;
  let hudCache = '';

  function freshState() {
    grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    cash = START_CASH; level = 0; sold = 0; binned = 0; simTime = 0;
    discovered = new Set(); saleLog = [];
    unlocked = { machines: ['hopper', 'press', 'fryer', 'counter', 'bin'], glazes: [], tops: [], fillings: [] };
    special = null;
    goals = makeGoals(level);
    selected = null; tool = null;
  }
  function makeGoals(li) {
    const L = LEVELS[li];
    if (!L) return [];
    return L.goals.map((g) => ({ ...g, count: 0, kinds: new Set() }));
  }
  function newMachine(type, dir) {
    return { kind: 'machine', type, dir, cfg: defaultCfg(type), lvl: 0, inBuf: null, cur: null, outBuf: null, t: 0, rr: 0, anim: 0 };
  }
  function defaultCfg(type) {
    const k = MACHINES[type].cfgKind;
    if (k === 'glaze') return unlocked.glazes[0] || 'sugar';
    if (k === 'top') return unlocked.tops[0] || 'sprinkles';
    if (k === 'fill') return unlocked.fillings[0] || 'jam';
    return null;
  }
  function newBelt(dir) { return { kind: 'belt', dir, items: [] }; }
  function makeDough() { return { stage: 'dough', glaze: null, filling: null, tops: [], note: null, fillVal: 0 }; }

  // ---------- items & value ----------
  function isFried(it) { return it.stage === 'donut' || it.stage === 'blob'; }
  function sameSet(a, b) { return a.length === b.length && a.every((x) => b.includes(x)); }
  function matchRecipe(it) {
    if (it.stage !== 'donut') return null;
    return RECIPES.find((r) => r.glaze === it.glaze && r.filling === it.filling && sameSet(r.tops, it.tops)) || null;
  }
  function hasSilly(it) {
    return it.tops.some((t) => TOPS[t].silly) || (it.filling && FILLINGS[it.filling].silly);
  }
  function valueOf(it) {
    let total;
    if (it.stage === 'donut') total = VALUE.donut;
    else if (it.stage === 'blob') total = VALUE.blob;
    else if (it.stage === 'charcoal') total = VALUE.charcoal;
    else total = VALUE.raw;
    let recipe = null;
    if (isFried(it)) {
      if (it.glaze) total += VALUE.glaze;
      if (it.filling) total += it.filling === 'mystery' ? it.fillVal : VALUE.filling;
      total += it.tops.length * VALUE.top;
      recipe = matchRecipe(it);
      if (recipe) total = Math.round(total * RECIPE_MULT);
      if (recipe && special && special.id === recipe.id) total *= 2;
    }
    return { total, recipe };
  }
  function recipeValue(r) {
    const v = VALUE.donut + (r.glaze ? VALUE.glaze : 0) + (r.filling ? VALUE.filling : 0) + r.tops.length * VALUE.top;
    return Math.round(v * RECIPE_MULT);
  }
  function recipeCraftable(r) {
    return (!r.glaze || unlocked.glazes.includes(r.glaze)) &&
      (!r.filling || unlocked.fillings.includes(r.filling)) &&
      r.tops.every((t) => unlocked.tops.includes(t));
  }
  function describe(it) {
    if (it.stage === 'dough') return 'raw dough';
    if (it.stage === 'ring') return 'a raw ring';
    if (it.stage === 'charcoal') return 'charcoal';
    const r = matchRecipe(it);
    if (r) return r.name;
    const bits = [];
    if (it.glaze) bits.push(GLAZES[it.glaze].name.toLowerCase());
    if (it.filling) bits.push(it.filling === 'mystery' ? `${it.note} inside` : `${FILLINGS[it.filling].name.toLowerCase()} filled`);
    for (const t of it.tops) bits.push(TOPS[t].name.toLowerCase());
    const base = it.stage === 'blob' ? 'blob' : 'donut';
    return bits.length ? `${bits.join(', ')} ${base}` : `plain ${base}`;
  }

  // ---------- money ----------
  const money = (p) => `${p < 0 ? '-' : ''}£${(Math.abs(p) / 100).toFixed(2)}`;
  const pence = (p) => (Math.abs(p) >= 100 ? money(p) : `${p}p`);

  // ---------- machine processing ----------
  function procTime(m) { return MACHINES[m.type].time * Math.pow(0.75, m.lvl); }
  function machineOutput(m, it) {
    const cfg = m.cfg;
    switch (m.type) {
      case 'press':
        if (it.stage === 'dough') it.stage = 'ring';
        break;
      case 'fryer':
        if (it.stage === 'dough') it.stage = 'blob';
        else if (it.stage === 'ring') it.stage = 'donut';
        else it.stage = 'charcoal';
        break;
      case 'glazer':
        if (isFried(it) && GLAZES[cfg] && it.glaze !== cfg) { it.glaze = cfg; cash -= GLAZES[cfg].cost; }
        break;
      case 'topper': {
        if (!isFried(it) || it.tops.length >= MAX_TOPS) break;
        let top = cfg;
        if (TOPS[top] && TOPS[top].random) {
          const pool = unlocked.tops.filter((t) => !TOPS[t].random && !it.tops.includes(t));
          top = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
        }
        if (top && TOPS[top] && !it.tops.includes(top)) { it.tops.push(top); cash -= TOPS[top].cost; }
        break;
      }
      case 'filler':
        if (isFried(it) && !it.filling && FILLINGS[cfg]) {
          it.filling = cfg; cash -= FILLINGS[cfg].cost;
          if (cfg === 'mystery') {
            it.note = MYSTERIES[Math.floor(Math.random() * MYSTERIES.length)];
            it.fillVal = 5 + Math.floor(Math.random() * 80);
          }
        }
        break;
    }
    return it;
  }
  function machineAccept(m, it, travelDir, c, r) {
    const def = MACHINES[m.type];
    if (def.source) return false;
    if (!def.omni && travelDir === (m.dir + 2) % 4) return false;   // came in through the front
    if (m.type === 'counter') { sell(it, c, r); m.anim = 0.5; return true; }
    if (m.type === 'bin') { binned++; m.anim = 0.4; return true; }
    if (m.inBuf) return false;
    m.inBuf = it;
    return true;
  }
  function tryEnter(c, r, it, travelDir) {
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return false;
    const t = grid[r][c];
    if (!t) return false;
    if (t.kind === 'belt') {
      if (t.dir === (travelDir + 2) % 4) return false;                // head on
      const entry = t.dir === travelDir ? 0 : 0.5;
      for (const b of t.items) if (Math.abs(b.p - entry) < SPACING) return false;
      t.items.push({ p: entry, it, stuck: 0 });
      return true;
    }
    return machineAccept(t, it, travelDir, c, r);
  }

  function stepMachine(m, c, r, dt) {
    const def = MACHINES[m.type];
    if (m.anim > 0) m.anim -= dt;
    if (def.sink) return;
    if (def.source) {
      if (m.outBuf) { pushOut(m, c, r); return; }
      if (cash <= CASH_FLOOR) return;
      m.t += dt;
      if (m.t >= procTime(m)) { m.t = 0; m.outBuf = makeDough(); cash -= DOUGH_COST; }
      if (m.outBuf) pushOut(m, c, r);
      return;
    }
    if (m.cur) {
      m.t -= dt;
      if (m.t <= 0 && !m.outBuf) { m.outBuf = machineOutput(m, m.cur); m.cur = null; m.t = 0; }
      else if (m.type === 'fryer' && Math.random() < dt * 3) {
        puffs.push({ x: c * T + 18 + Math.random() * 24, y: r * T + 14, vy: -18 - Math.random() * 10, t: 0, life: 0.9 + Math.random() * 0.5 });
      }
    }
    if (!m.cur && m.inBuf) { m.cur = m.inBuf; m.inBuf = null; m.t = procTime(m); }
    if (m.outBuf) pushOut(m, c, r);
  }
  function pushOut(m, c, r) {
    if (m.type === 'splitter') {
      const dirs = [m.dir, (m.dir + 1) % 4, (m.dir + 3) % 4];
      for (let i = 0; i < 3; i++) {
        const d = dirs[(m.rr + i) % 3];
        if (tryEnter(c + DX[d], r + DY[d], m.outBuf, d)) { m.outBuf = null; m.rr = (m.rr + i + 1) % 3; return; }
      }
      return;
    }
    if (tryEnter(c + DX[m.dir], r + DY[m.dir], m.outBuf, m.dir)) m.outBuf = null;
  }
  function stepBelt(b, c, r, dt) {
    if (!b.items.length) return;
    b.items.sort((x, y) => y.p - x.p);
    for (let i = 0; i < b.items.length; i++) {
      const e = b.items[i];
      const cap = i === 0 ? Infinity : b.items[i - 1].p - SPACING;
      let np = Math.min(e.p + BELT_SPEED * dt, cap);
      if (np >= 1) {
        if (tryEnter(c + DX[b.dir], r + DY[b.dir], e.it, b.dir)) { b.items.splice(i, 1); i--; continue; }
        np = 1; e.stuck += dt;
      } else e.stuck = 0;
      e.p = Math.max(e.p, Math.min(np, 1));
    }
  }
  function simulate(dt) {
    simTime += dt;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const t = grid[r][c];
      if (t && t.kind === 'machine') stepMachine(t, c, r, dt);
    }
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const t = grid[r][c];
      if (t && t.kind === 'belt') stepBelt(t, c, r, dt);
    }
    // specials board
    if (level >= SPECIAL_FROM_LEVEL) {
      if (!special || special.until <= simTime) rollSpecial();
    }
    for (const f of floats) f.t += dt;
    floats = floats.filter((f) => f.t < f.life);
    for (const p of puffs) p.t += dt;
    puffs = puffs.filter((p) => p.t < p.life);
  }
  function rollSpecial() {
    const pool = RECIPES.filter((r) => recipeCraftable(r) && (!special || r.id !== special.id));
    if (!pool.length) { special = null; return; }
    const r = pool[Math.floor(Math.random() * pool.length)];
    special = { id: r.id, until: simTime + SPECIAL_LENGTH };
    renderSide();
  }

  // ---------- selling ----------
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function sell(it, c, r) {
    const { total, recipe } = valueOf(it);
    cash += total; sold++;
    saleLog.push(simTime);
    if (recipe && !discovered.has(recipe.id)) { discovered.add(recipe.id); note(`New recipe: ${recipe.name}!`, c, r, '#e0568a', 2.6); }
    for (const g of goals) {
      if (g.count >= g.n && !g.distinct) continue;
      if (goalMatch(g.filter, it, recipe)) { g.count++; if (recipe) g.kinds.add(recipe.id); }
    }
    let quip;
    if (it.stage === 'dough' || it.stage === 'ring') quip = pick(QUIPS.raw);
    else if (it.stage === 'charcoal') quip = pick(QUIPS.charcoal);
    else if (recipe) quip = special && special.id === recipe.id ? 'The special! Double!' : pick(QUIPS.recipe);
    else if (hasSilly(it)) quip = pick(QUIPS.silly);
    else if (it.stage === 'blob') quip = pick(QUIPS.blob);
    else if (it.glaze || it.tops.length || it.filling) quip = pick(QUIPS.nice);
    else quip = pick(QUIPS.plain);
    if (it.filling === 'mystery' && Math.random() < 0.5) quip = `Is this ${it.note}?`;
    const good = total >= VALUE.donut;
    floats.push({ x: c * T + T / 2, y: r * T + 8, text: `+${pence(total)}`, col: good ? '#3f7a2a' : '#b8483a', t: 0, life: 1.4, size: 15 });
    floats.push({ x: c * T + T / 2, y: r * T - 12, text: quip, col: '#3b2a24', t: -0.25, life: 1.9, size: 12, bubble: true });
    if (soundOn) sfx(good ? 'sell' : 'meh');
    checkLevel();
    dirty();
  }
  function goalMatch(f, it, recipe) {
    if (f.stage && it.stage !== f.stage) return false;
    if (f.glazed && !(it.stage === 'donut' && it.glaze)) return false;
    if (f.recipe && (!recipe || recipe.id !== f.recipe)) return false;
    if (f.named && !recipe) return false;
    if (f.silly && !(it.stage === 'donut' && it.tops.some((t) => TOPS[t].silly))) return false;
    return true;
  }
  function goalDone(g) { return g.count >= g.n && (!g.distinct || g.kinds.size >= g.distinct); }
  function note(text, c, r, col, life) {
    floats.push({ x: c * T + T / 2, y: r * T - 30, text, col: col || '#3b2a24', t: 0, life: life || 1.6, size: 13 });
  }

  function checkLevel() {
    if (!goals.length || !goals.every(goalDone)) return;
    const L = LEVELS[level];
    cash += L.bonus;
    const u = L.unlock || {};
    for (const k of ['machines', 'glazes', 'tops', 'fillings']) for (const x of u[k] || []) if (!unlocked[k].includes(x)) unlocked[k].push(x);
    level++;
    goals = makeGoals(level);
    if (level >= SPECIAL_FROM_LEVEL && !special) rollSpecial();
    if (soundOn) sfx('level');
    save();
    showLevelUp(L);
    renderSide();
  }
  function showLevelUp(L) {
    const u = L.unlock || {};
    const chips = [];
    for (const m of u.machines || []) chips.push(`<span class="chip"><span class="em">${MACHINES[m].ico}</span>${MACHINES[m].name}</span>`);
    for (const g of u.glazes || []) chips.push(`<span class="chip"><span class="sw" style="background:${GLAZES[g].col}"></span>${GLAZES[g].name}</span>`);
    for (const f of u.fillings || []) chips.push(`<span class="chip"><span class="sw" style="background:${FILLINGS[f].col}"></span>${FILLINGS[f].name}</span>`);
    for (const t of u.tops || []) chips.push(`<span class="chip"><span class="em">${TOPS[t].ico || '•'}</span>${TOPS[t].name}</span>`);
    const next = LEVELS[level];
    let html = `<p>${L.who} is delighted. Order filled.</p><div class="big-money">+${money(L.bonus)}</div>`;
    if (chips.length) html += `<p>New in the build tab:</p><div class="unlocks">${chips.join('')}</div>`;
    if (next) html += `<p><b>Next order — ${next.name}.</b> ${next.who} says: <i>${next.blurb}</i></p>`;
    else html += `<p><b>That is every order filled.</b> The factory is yours now. The specials board keeps turning, the recipe book still has gaps, and there is always a sillier donut.</p>`;
    const resume = speed || 1;
    speed = 0; syncSpeedButtons();
    overlay(`Order filled: ${L.name}`, html, [{ label: 'Back to work', primary: true, fn: () => { speed = resume; syncSpeedButtons(); } }]);
  }

  // ---------- building ----------
  function canAfford(cost) { return cash >= cost; }
  function placeMachine(c, r, type, dir) {
    if (grid[r][c]) return false;
    const def = MACHINES[type];
    if (!unlocked.machines.includes(type)) return false;
    if (!canAfford(def.cost)) { note('Not enough cash', c, r, '#b8483a'); if (soundOn) sfx('bad'); return false; }
    cash -= def.cost;
    grid[r][c] = newMachine(type, dir);
    if (soundOn) sfx('place');
    dirty();
    return true;
  }
  function placeBelt(c, r, dir) {
    const t = grid[r][c];
    if (t && t.kind === 'machine') return false;
    if (t && t.kind === 'belt') { t.dir = dir; dirty(); return true; }
    if (!canAfford(BELT_COST)) { note('Not enough cash', c, r, '#b8483a'); return false; }
    cash -= BELT_COST;
    grid[r][c] = newBelt(dir);
    if (soundOn) sfx('tick');
    dirty();
    return true;
  }
  function removeTile(c, r) {
    const t = grid[r][c];
    if (!t) return;
    cash += t.kind === 'belt' ? BELT_COST : MACHINES[t.type].cost + upgradeSpent(t);
    grid[r][c] = null;
    if (selected && selected.c === c && selected.r === r) selected = null;
    if (soundOn) sfx('tick');
    dirty();
  }
  function upgradeCost(m) { return Math.round(MACHINES[m.type].cost * 0.6 * (m.lvl + 1)); }
  function upgradeSpent(m) { let s = 0; for (let i = 0; i < m.lvl; i++) s += Math.round(MACHINES[m.type].cost * 0.6 * (i + 1)); return s; }
  function upgrade(m) {
    if (m.lvl >= MAX_LVL) return;
    const cost = upgradeCost(m);
    if (!canAfford(cost)) { if (soundOn) sfx('bad'); return; }
    cash -= cost; m.lvl++;
    if (soundOn) sfx('place');
    dirty();
  }

  // ---------- canvas ----------
  const canvas = document.getElementById('floor');
  let ctx = canvas.getContext('2d');
  let dirtyUI = true;
  function dirty() { dirtyUI = true; }

  function rr(x, y, w, h, rad) {
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }
  function drawFloor() {
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      ctx.fillStyle = (r + c) % 2 ? '#f6ebdc' : '#efe1cd';
      ctx.fillRect(c * T, r * T, T, T);
    }
    ctx.strokeStyle = 'rgba(90, 60, 40, 0.08)';
    ctx.lineWidth = 1;
    for (let c = 1; c < COLS; c++) { ctx.beginPath(); ctx.moveTo(c * T + 0.5, 0); ctx.lineTo(c * T + 0.5, ROWS * T); ctx.stroke(); }
    for (let r = 1; r < ROWS; r++) { ctx.beginPath(); ctx.moveTo(0, r * T + 0.5); ctx.lineTo(COLS * T, r * T + 0.5); ctx.stroke(); }
  }
  function drawBelt(c, r, dir, ghost) {
    ctx.save();
    ctx.translate(c * T + T / 2, r * T + T / 2);
    ctx.rotate(dir * Math.PI / 2);
    ctx.globalAlpha = ghost ? 0.5 : 1;
    ctx.fillStyle = '#5a5654';
    ctx.fillRect(-T / 2, -18, T, 36);
    ctx.fillStyle = '#3f3c3a';
    ctx.fillRect(-T / 2, -18, T, 3);
    ctx.fillRect(-T / 2, 15, T, 3);
    // chevrons that crawl along
    const off = (simTime * BELT_SPEED * T) % 20;
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 2.5;
    for (let x = -T / 2 - 20 + off; x < T / 2 + 4; x += 20) {
      ctx.beginPath(); ctx.moveTo(x - 5, -10); ctx.lineTo(x + 2, 0); ctx.lineTo(x - 5, 10); ctx.stroke();
    }
    ctx.restore();
  }
  function drawArrow(dir, alpha) {
    ctx.save();
    ctx.rotate(dir * Math.PI / 2);
    ctx.fillStyle = `rgba(59,42,36,${alpha})`;
    ctx.beginPath(); ctx.moveTo(T / 2 - 1, -7); ctx.lineTo(T / 2 + 5, 0); ctx.lineTo(T / 2 - 1, 7); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => Math.max(0, Math.min(255, v + amt));
    return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
  }
  function drawMachine(c, r, m, ghost) {
    const def = MACHINES[m.type];
    ctx.save();
    ctx.translate(c * T + T / 2, r * T + T / 2);
    ctx.globalAlpha = ghost ? 0.55 : 1;
    const squash = m.anim > 0 ? 1 + m.anim * 0.12 : 1;
    ctx.scale(squash, 2 - squash);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    rr(-24, -22, 48, 50, 9); ctx.fill();
    ctx.fillStyle = def.col;
    rr(-24, -25, 48, 50, 9); ctx.fill();
    ctx.strokeStyle = shade(def.col, -60);
    ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    rr(-20, -21, 40, 12, 6); ctx.fill();
    ctx.font = '24px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000';
    ctx.fillText(def.ico, 0, m.cur || m.outBuf ? -2 : 1);
    // output arrow(s)
    if (!def.sink) {
      drawArrow(m.dir, 0.75);
      if (m.type === 'splitter') { drawArrow((m.dir + 1) % 4, 0.45); drawArrow((m.dir + 3) % 4, 0.45); }
    }
    // config swatch
    if (def.cfgKind && m.cfg) {
      ctx.save(); ctx.translate(16, -16);
      if (def.cfgKind === 'glaze') { ctx.fillStyle = GLAZES[m.cfg].col; ctx.strokeStyle = GLAZES[m.cfg].edge; ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
      else if (def.cfgKind === 'fill') { ctx.fillStyle = FILLINGS[m.cfg].col; ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
      else {
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
        drawTopping(m.cfg, 0, 0, 0.8);
      }
      ctx.restore();
    }
    // progress bar
    if (m.cur || (def.source && cash > CASH_FLOOR)) {
      const frac = def.source ? m.t / procTime(m) : 1 - m.t / procTime(m);
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; rr(-18, 17, 36, 5, 2.5); ctx.fill();
      ctx.fillStyle = '#e0568a'; rr(-18, 17, 36 * Math.max(0, Math.min(1, frac)), 5, 2.5); ctx.fill();
    }
    if (def.source && cash <= CASH_FLOOR) {
      ctx.fillStyle = '#b8483a'; ctx.font = 'bold 10px sans-serif'; ctx.fillText('NO FLOUR £', 0, 19);
    }
    // level pips
    for (let i = 0; i < m.lvl; i++) { ctx.fillStyle = '#e0568a'; ctx.beginPath(); ctx.arc(-17 + i * 8, -18, 2.5, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
    // items waiting
    if (m.inBuf) drawItem(c * T + T / 2 - DX[m.dir] * 20, r * T + T / 2 - DY[m.dir] * 20, m.inBuf, 0.75);
    if (m.outBuf) drawItem(c * T + T / 2 + DX[m.dir] * 20, r * T + T / 2 + DY[m.dir] * 20, m.outBuf, 0.9);
  }
  function drawTopping(t, x, y, scale) {
    const def = TOPS[t];
    if (!def) return;
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
    if (def.draw === 'sprinkles') {
      const cols = ['#e0568a', '#5fb8e8', '#f2c94c', '#6cbf5a', '#f28c4c'];
      for (let i = 0; i < 7; i++) {
        const a = i * 0.9 + 0.3, rad = 5 + (i % 3) * 2;
        ctx.save(); ctx.translate(Math.cos(a) * rad, Math.sin(a) * rad); ctx.rotate(a * 1.7);
        ctx.fillStyle = cols[i % cols.length]; ctx.fillRect(-2.5, -0.9, 5, 1.8); ctx.restore();
      }
    } else if (def.draw === 'chips') {
      ctx.fillStyle = '#3e2712';
      for (let i = 0; i < 6; i++) { const a = i * 1.05 + 0.5, rad = 4.5 + (i % 2) * 3; ctx.beginPath(); ctx.arc(Math.cos(a) * rad, Math.sin(a) * rad, 1.8, 0, Math.PI * 2); ctx.fill(); }
    } else if (def.draw === 'cereal') {
      const cols = ['#f2c94c', '#f28c4c', '#c86bd9', '#6cbf5a'];
      ctx.lineWidth = 1.8;
      for (let i = 0; i < 4; i++) { const a = i * 1.6 + 0.8; ctx.strokeStyle = cols[i]; ctx.beginPath(); ctx.arc(Math.cos(a) * 6.5, Math.sin(a) * 6.5, 2.3, 0, Math.PI * 2); ctx.stroke(); }
    } else {
      ctx.font = '11px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(def.ico, 0, 0);
    }
    ctx.restore();
  }
  function drawItem(x, y, it, scale) {
    ctx.save();
    ctx.translate(x, y); ctx.scale(scale || 1, scale || 1);
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath(); ctx.ellipse(0, 4, 11, 6, 0, 0, Math.PI * 2); ctx.fill();
    if (it.stage === 'dough') {
      ctx.fillStyle = '#efdcb4'; ctx.strokeStyle = '#cdb383'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    } else if (it.stage === 'ring') {
      ctx.strokeStyle = '#efdcb4'; ctx.lineWidth = 8;
      ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#cdb383'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.stroke();
    } else {
      const base = it.stage === 'charcoal' ? '#3a3634' : '#c98a3f';
      const edge = it.stage === 'charcoal' ? '#1e1c1b' : '#9a6428';
      if (it.stage === 'blob') {
        ctx.fillStyle = base; ctx.strokeStyle = edge; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        if (it.glaze) { ctx.fillStyle = GLAZES[it.glaze].col; ctx.beginPath(); ctx.arc(0, -1, 8.5, 0, Math.PI * 2); ctx.fill(); }
      } else {
        ctx.strokeStyle = base; ctx.lineWidth = 9;
        ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = edge; ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.arc(0, 0, 11.5, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, Math.PI * 2); ctx.stroke();
        if (it.glaze) {
          ctx.strokeStyle = GLAZES[it.glaze].col; ctx.lineWidth = 6;
          ctx.beginPath(); ctx.arc(0, -0.5, 7, 0, Math.PI * 2); ctx.stroke();
          // a drip
          ctx.fillStyle = GLAZES[it.glaze].col;
          ctx.beginPath(); ctx.arc(7.5, 5.5, 2.2, 0, Math.PI * 2); ctx.fill();
        }
      }
      if (it.stage === 'charcoal') {
        ctx.fillStyle = 'rgba(255,120,40,0.7)';
        ctx.beginPath(); ctx.arc(-4, 3, 1.3, 0, Math.PI * 2); ctx.arc(5, -5, 1.1, 0, Math.PI * 2); ctx.fill();
      }
      if (it.filling) {
        ctx.fillStyle = FILLINGS[it.filling].col; ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(-8, 6, 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
      if (it.tops.length === 1) drawTopping(it.tops[0], 0, -1, 1);
      else if (it.tops.length === 2) {
        drawTopping(it.tops[0], -4, -3, 0.8);
        drawTopping(it.tops[1], 5, 2, 0.8);
      }
    }
    ctx.restore();
  }
  function beltPos(c, r, dir, p) {
    const cx = c * T + T / 2, cy = r * T + T / 2;
    return { x: cx + DX[dir] * (p - 0.5) * T, y: cy + DY[dir] * (p - 0.5) * T };
  }
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawFloor();
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const t = grid[r][c];
      if (t && t.kind === 'belt') drawBelt(c, r, t.dir, false);
    }
    // selection + hover
    if (selected && grid[selected.r][selected.c]) {
      ctx.strokeStyle = '#e0568a'; ctx.lineWidth = 3;
      rr(selected.c * T + 2, selected.r * T + 2, T - 4, T - 4, 8); ctx.stroke();
    }
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const t = grid[r][c];
      if (t && t.kind === 'machine') drawMachine(c, r, t, false);
    }
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const t = grid[r][c];
      if (!t || t.kind !== 'belt') continue;
      for (const e of t.items) {
        const p = beltPos(c, r, t.dir, e.p);
        drawItem(p.x, p.y, e.it, 1);
        if (e.stuck > 2.5) {
          ctx.fillStyle = '#b8483a'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('!', p.x + 9, p.y - 11);
        }
      }
    }
    // ghost of the tool
    if (hover && tool && !painting) {
      const { c, r } = hover;
      const occupied = !!grid[r][c];
      if (tool === 'belt') { if (!occupied || grid[r][c].kind === 'belt') drawBelt(c, r, toolDir, true); }
      else if (tool === 'remove') {
        ctx.fillStyle = 'rgba(184,72,58,0.28)'; rr(c * T + 2, r * T + 2, T - 4, T - 4, 8); ctx.fill();
      } else if (!occupied) {
        const ghost = newMachine(tool, toolDir);
        drawMachine(c, r, ghost, true);
        if (!canAfford(MACHINES[tool].cost)) { ctx.fillStyle = 'rgba(184,72,58,0.3)'; rr(c * T + 2, r * T + 2, T - 4, T - 4, 8); ctx.fill(); }
      } else {
        ctx.fillStyle = 'rgba(184,72,58,0.25)'; rr(c * T + 2, r * T + 2, T - 4, T - 4, 8); ctx.fill();
      }
    } else if (hover && !tool) {
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; rr(hover.c * T + 2, hover.r * T + 2, T - 4, T - 4, 8); ctx.fill();
    }
    // steam
    for (const p of puffs) {
      const k = p.t / p.life;
      ctx.fillStyle = `rgba(255,255,255,${0.55 * (1 - k)})`;
      ctx.beginPath(); ctx.arc(p.x, p.y + p.vy * p.t, 3 + k * 6, 0, Math.PI * 2); ctx.fill();
    }
    // floating text
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const f of floats) {
      if (f.t < 0) continue;
      const k = f.t / f.life;
      const y = f.y - k * 34;
      const a = k > 0.7 ? (1 - k) / 0.3 : 1;
      ctx.font = `${f.bubble ? '' : 'bold '}${f.size}px ${f.bubble ? 'ui-sans-serif, system-ui, sans-serif' : 'ui-sans-serif, system-ui, sans-serif'}`;
      if (f.bubble) {
        const w = ctx.measureText(f.text).width + 14;
        const x = Math.max(w / 2 + 2, Math.min(canvas.width - w / 2 - 2, f.x));
        ctx.fillStyle = `rgba(255,255,255,${0.92 * a})`; rr(x - w / 2, y - 10, w, 20, 10); ctx.fill();
        ctx.strokeStyle = `rgba(59,42,36,${0.25 * a})`; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = `rgba(59,42,36,${a})`; ctx.fillText(f.text, x, y + 0.5);
      } else {
        const x = Math.max(30, Math.min(canvas.width - 30, f.x));
        ctx.lineWidth = 3; ctx.strokeStyle = `rgba(255,255,255,${0.85 * a})`; ctx.strokeText(f.text, x, y);
        ctx.fillStyle = f.col; ctx.globalAlpha = a; ctx.fillText(f.text, x, y); ctx.globalAlpha = 1;
      }
    }
    if (speed === 0) {
      ctx.fillStyle = 'rgba(59,42,36,0.75)'; rr(canvas.width / 2 - 44, 10, 88, 26, 13); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.fillText('PAUSED', canvas.width / 2, 23);
    }
  }

  // ---------- main loop ----------
  let last = performance.now(), saveTimer = 0;
  function frame(now) {
    let dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    let remain = dt * speed;
    while (remain > 0) { const s = Math.min(remain, 1 / 30); simulate(s); remain -= s; }
    saveTimer += dt;
    if (saveTimer > 5) { saveTimer = 0; save(); }
    draw();
    if (dirtyUI) { dirtyUI = false; renderSide(); renderBench(); }
    renderHud();
    requestAnimationFrame(frame);
  }

  // ---------- HUD ----------
  const $ = (id) => document.getElementById(id);
  function renderHud() {
    saleLog = saleLog.filter((t) => t > simTime - 60);
    const spec = special && level >= SPECIAL_FROM_LEVEL ? RECIPES.find((r) => r.id === special.id) : null;
    const key = `${cash}|${level}|${sold}|${saleLog.length}|${spec ? spec.id : ''}|${spec ? Math.ceil(special.until - simTime) : ''}`;
    if (key === hudCache) return;
    hudCache = key;
    $('hud-cash').textContent = money(cash);
    $('hud-cash').style.color = cash < 0 ? '#b8483a' : '';
    $('hud-level').textContent = level < LEVELS.length ? `${level + 1} · ${LEVELS[level].name}` : 'Free play';
    $('hud-sold').textContent = sold;
    $('hud-rate').textContent = saleLog.length;
    $('hud-special-wrap').hidden = !spec;
    if (spec) $('hud-special').textContent = `${spec.name} ${fmtTime(special.until - simTime)}`;
    if (tab === 'goals') updateGoalBars();
  }
  function fmtTime(s) { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }

  // ---------- side panel ----------
  function renderSide() {
    const body = $('side-body');
    if (tab === 'build') body.innerHTML = buildTab();
    else if (tab === 'goals') body.innerHTML = goalsTab();
    else body.innerHTML = recipesTab();
    if (tab === 'recipes') body.querySelectorAll('canvas[data-recipe]').forEach(drawRecipeThumb);
  }
  function buildTab() {
    const rows = [];
    rows.push(`<p class="hint">Pick a tool, click the floor to place. <kbd>R</kbd> turns it, <kbd>right-click</kbd> takes things back for a full refund, <kbd>Esc</kbd> puts the tool down. Drag with the belt tool to paint a run.</p>`);
    rows.push(toolBtn('belt', '➡️', 'Belt', 'Carries things along. Runs into the side of another belt to merge.', BELT_COST));
    for (const type of Object.keys(MACHINES)) {
      if (!unlocked.machines.includes(type)) continue;
      const d = MACHINES[type];
      rows.push(toolBtn(type, d.ico, d.name, d.desc, d.cost));
    }
    rows.push(toolBtn('remove', '✖️', 'Take back', 'Remove a belt or machine. Full refund, always.', null));
    const locked = Object.keys(MACHINES).filter((t) => !unlocked.machines.includes(t));
    if (locked.length) {
      rows.push('<h3>Still to unlock</h3>');
      for (const type of locked) {
        const d = MACHINES[type];
        const lvl = LEVELS.findIndex((L) => (L.unlock.machines || []).includes(type));
        rows.push(`<div class="tool locked"><span class="ico">${d.ico}</span><span class="grow"><span class="name">${d.name}</span><span class="desc">Fill order ${lvl + 1}, ${LEVELS[lvl].name}.</span></span></div>`);
      }
    }
    return rows.join('');
  }
  function toolBtn(id, ico, name, desc, cost) {
    const active = tool === id ? ' active' : '';
    const poor = cost != null && !canAfford(cost) ? ' poor' : '';
    return `<button type="button" class="tool${active}${poor}" data-tool="${id}"><span class="ico">${ico}</span><span class="grow"><span class="name">${name}</span><span class="desc">${desc}</span></span>${cost != null ? `<span class="cost">${money(cost)}</span>` : ''}</button>`;
  }
  function goalsTab() {
    const parts = [];
    const L = LEVELS[level];
    if (L) {
      parts.push(`<div class="order"><div class="who">Order ${level + 1} of ${LEVELS.length} · ${L.who}</div><div class="what">${L.name}</div><div class="blurb">&ldquo;${L.blurb}&rdquo;</div>`);
      for (const g of goals) parts.push(goalHtml(g));
      parts.push(`<div class="reward">Pays <b>${money(L.bonus)}</b>${unlockSummary(L.unlock)}</div>`);
      if (L.hint) parts.push(`<p class="hint" style="margin-top:8px">${L.hint}</p>`);
      parts.push('</div>');
    } else {
      parts.push(`<div class="order"><div class="who">Every order filled</div><div class="what">Free play</div><div class="blurb">The factory is yours. Chase the specials, fill the recipe book, and see how silly it gets.</div></div>`);
    }
    const spec = special && level >= SPECIAL_FROM_LEVEL ? RECIPES.find((r) => r.id === special.id) : null;
    if (spec) {
      parts.push(`<div class="special"><span class="timer" id="special-timer">${fmtTime(special.until - simTime)}</span><b>Special: ${spec.name}</b> pays double.<br><span class="hint">${recipeParts(spec)}</span></div>`);
    } else if (level < SPECIAL_FROM_LEVEL) {
      parts.push(`<p class="hint">A specials board turns up once the shop trusts you with a glazer or two.</p>`);
    }
    parts.push(`<h3>Tally</h3><p class="hint">${sold} sold, ${discovered.size} of ${RECIPES.length} recipes found${binned ? `, ${binned} binned` : ''}.</p>`);
    return parts.join('');
  }
  function unlockSummary(u) {
    const n = (u.machines || []).length + (u.glazes || []).length + (u.tops || []).length + (u.fillings || []).length;
    if (!n) return '.';
    const names = [];
    for (const m of u.machines || []) names.push(MACHINES[m].name.toLowerCase());
    for (const g of u.glazes || []) names.push(GLAZES[g].name.toLowerCase());
    for (const f of u.fillings || []) names.push(FILLINGS[f].name.toLowerCase());
    for (const t of u.tops || []) names.push(TOPS[t].name.toLowerCase());
    return ` and unlocks ${names.join(', ')}.`;
  }
  function goalHtml(g) {
    const done = goalDone(g);
    const count = g.distinct ? `${Math.min(g.count, g.n)}/${g.n} · ${g.kinds.size}/${g.distinct} kinds` : `${Math.min(g.count, g.n)}/${g.n}`;
    return `<div class="goal${done ? ' done' : ''}" data-goal="${g.label}"><span class="count">${count}</span>${g.label}<div class="bar"><i style="width:${Math.min(100, g.count / g.n * 100)}%"></i></div></div>`;
  }
  function updateGoalBars() {
    const els = document.querySelectorAll('.goal');
    goals.forEach((g, i) => {
      const el = els[i]; if (!el) return;
      el.querySelector('i').style.width = `${Math.min(100, g.count / g.n * 100)}%`;
      el.querySelector('.count').textContent = g.distinct ? `${Math.min(g.count, g.n)}/${g.n} · ${g.kinds.size}/${g.distinct} kinds` : `${Math.min(g.count, g.n)}/${g.n}`;
      el.classList.toggle('done', goalDone(g));
    });
    const t = $('special-timer');
    if (t && special) t.textContent = fmtTime(special.until - simTime);
  }
  function recipeParts(r) {
    const bits = [];
    bits.push(r.glaze ? GLAZES[r.glaze].name : 'No glaze');
    if (r.filling) bits.push(`${FILLINGS[r.filling].name} filling`);
    for (const t of r.tops) bits.push(TOPS[t].name);
    return bits.join(' · ');
  }
  function recipesTab() {
    const parts = [];
    parts.push(`<p class="hint">A plain donut is ${pence(VALUE.donut)}. Glaze adds ${pence(VALUE.glaze)}, a filling ${pence(VALUE.filling)}, each topping ${pence(VALUE.top)}. Exact named recipes pay half again. Blobs, charcoal and raw dough pay very little and get comments.</p>`);
    parts.push('<h3>In the cupboard</h3><div class="legend">');
    for (const g of Object.keys(GLAZES)) parts.push(`<span class="chip${unlocked.glazes.includes(g) ? '' : ' off'}"><span class="sw" style="background:${GLAZES[g].col}"></span>${GLAZES[g].name}</span>`);
    for (const f of Object.keys(FILLINGS)) parts.push(`<span class="chip${unlocked.fillings.includes(f) ? '' : ' off'}"><span class="sw" style="background:${FILLINGS[f].col}"></span>${FILLINGS[f].name}</span>`);
    for (const t of Object.keys(TOPS)) parts.push(`<span class="chip${unlocked.tops.includes(t) ? '' : ' off'}"><span class="em">${TOPS[t].ico || '•'}</span>${TOPS[t].name}</span>`);
    parts.push('</div>');
    parts.push(`<h3>Named recipes · ${discovered.size}/${RECIPES.length}</h3>`);
    const sorted = RECIPES.slice().sort((a, b) => {
      const ka = discovered.has(a.id) ? 0 : recipeCraftable(a) ? 1 : 2;
      const kb = discovered.has(b.id) ? 0 : recipeCraftable(b) ? 1 : 2;
      return ka - kb || recipeValue(a) - recipeValue(b);
    });
    for (const r of sorted) {
      const known = discovered.has(r.id);
      const can = recipeCraftable(r);
      const isSpec = special && special.id === r.id && level >= SPECIAL_FROM_LEVEL;
      if (known) {
        parts.push(`<div class="recipe${isSpec ? ' special-now' : ''}"><canvas width="68" height="68" data-recipe="${r.id}"></canvas><div class="grow"><div class="name">${r.name}<span class="val">${pence(recipeValue(r))}${isSpec ? ' ×2' : ''}</span></div><div class="parts">${recipeParts(r)}</div><div class="quip">${r.quip}</div></div></div>`);
      } else {
        const n = 1 + (r.filling ? 1 : 0) + r.tops.length;
        const hint = can ? `${n} thing${n > 1 ? 's' : ''} on a donut. Everything for it is in the cupboard.` : `Needs something you have not unlocked yet.`;
        parts.push(`<div class="recipe unknown${isSpec ? ' special-now' : ''}"><canvas width="68" height="68" data-recipe="${isSpec ? r.id : ''}"></canvas><div class="grow"><div class="name">${isSpec ? r.name : '? ? ?'}<span class="val">${pence(recipeValue(r))}${isSpec ? ' ×2' : ''}</span></div><div class="parts">${isSpec ? recipeParts(r) : hint}</div>${isSpec ? '<div class="quip">The special. The board tells you how.</div>' : ''}</div></div>`);
      }
    }
    return parts.join('');
  }
  function drawRecipeThumb(cv) {
    const r = RECIPES.find((x) => x.id === cv.dataset.recipe);
    const c2 = cv.getContext('2d');
    c2.clearRect(0, 0, 68, 68);
    if (!r) { c2.font = '30px sans-serif'; c2.textAlign = 'center'; c2.textBaseline = 'middle'; c2.fillStyle = '#c9b8a8'; c2.fillText('?', 34, 36); return; }
    // draw with the shared item painter by pointing it at this canvas for a moment
    const saved = ctx;
    ctx = c2;
    ctx.save(); ctx.translate(34, 34); ctx.scale(2.4, 2.4);
    drawItem(0, 0, { stage: 'donut', glaze: r.glaze, filling: r.filling, tops: r.tops.slice(), fillVal: 0 }, 1);
    ctx.restore();
    ctx = saved;
  }

  // ---------- bench (selected machine) ----------
  function renderBench() {
    const b = $('bench');
    const t = selected && grid[selected.r][selected.c];
    if (!t) {
      if (tool) {
        const name = tool === 'belt' ? 'Belt' : tool === 'remove' ? 'Take back' : MACHINES[tool].name;
        const ico = tool === 'belt' ? '➡️' : tool === 'remove' ? '✖️' : MACHINES[tool].ico;
        b.innerHTML = `<div class="title"><span class="ico">${ico}</span>${name}</div><span class="muted">Facing ${['right', 'down', 'left', 'up'][toolDir]}. Press <b>R</b> to turn, click the floor to place, <b>Esc</b> to put it down.</span><span class="spacer"></span><button type="button" class="tiny" data-act="rotate-tool">Turn</button><button type="button" class="tiny" data-act="drop-tool">Put down</button>`;
      } else {
        b.innerHTML = `<span class="muted">Click a machine on the floor to open it here. Pick something from the Build tab to place it.</span>`;
      }
      return;
    }
    if (t.kind === 'belt') {
      b.innerHTML = `<div class="title"><span class="ico">➡️</span>Belt</div><span class="muted">Facing ${['right', 'down', 'left', 'up'][t.dir]}. ${t.items.length ? `${t.items.length} on it.` : 'Empty.'}</span><span class="spacer"></span><button type="button" class="tiny" data-act="rotate">Turn</button><button type="button" class="tiny" data-act="remove">Take back (${money(BELT_COST)})</button>`;
      return;
    }
    const def = MACHINES[t.type];
    const parts = [`<div class="title"><span class="ico">${def.ico}</span>${def.name}</div>`];
    if (def.cfgKind === 'glaze') parts.push(`<div class="group"><span>Glaze</span>${unlocked.glazes.map((g) => `<button type="button" class="chip${t.cfg === g ? ' active' : ''}" data-cfg="${g}"><span class="sw" style="background:${GLAZES[g].col}"></span>${GLAZES[g].name} <small>${GLAZES[g].cost}p</small></button>`).join('')}</div>`);
    if (def.cfgKind === 'fill') parts.push(`<div class="group"><span>Filling</span>${unlocked.fillings.map((f) => `<button type="button" class="chip${t.cfg === f ? ' active' : ''}" data-cfg="${f}"><span class="sw" style="background:${FILLINGS[f].col}"></span>${FILLINGS[f].name} <small>${FILLINGS[f].cost}p</small></button>`).join('')}</div>`);
    if (def.cfgKind === 'top') parts.push(`<div class="group"><span>Topping</span>${unlocked.tops.map((x) => `<button type="button" class="chip${t.cfg === x ? ' active' : ''}" data-cfg="${x}"><span class="em">${TOPS[x].ico || '•'}</span>${TOPS[x].name} <small>${TOPS[x].cost}p</small></button>`).join('')}</div>`);
    if (!def.sink) {
      const pips = Array.from({ length: MAX_LVL }, (_, i) => `<span class="pip${i < t.lvl ? ' on' : ''}"></span>`).join('');
      const rate = def.source ? `one every ${procTime(t).toFixed(1)}s` : `${procTime(t).toFixed(1)}s each`;
      parts.push(`<div class="group"><span>Speed</span><span class="pip-row">${pips}</span><span class="muted">${rate}</span>${t.lvl < MAX_LVL ? `<button type="button" class="tiny" data-act="upgrade" ${canAfford(upgradeCost(t)) ? '' : 'disabled'}>Tune up (${money(upgradeCost(t))})</button>` : '<span class="muted">Fully tuned.</span>'}</div>`);
    }
    if (t.type === 'counter') parts.push(`<span class="muted">Sells whatever arrives, from any side.</span>`);
    if (t.type === 'bin') parts.push(`<span class="muted">${binned} thing${binned === 1 ? '' : 's'} binned so far.</span>`);
    parts.push(`<span class="spacer"></span>`);
    if (!def.sink) parts.push(`<button type="button" class="tiny" data-act="rotate">Turn</button>`);
    parts.push(`<button type="button" class="tiny" data-act="remove">Take back (${money(def.cost + upgradeSpent(t))})</button>`);
    b.innerHTML = parts.join('');
  }

  // ---------- overlays ----------
  function overlay(title, html, actions) {
    $('overlay-title').textContent = title;
    $('overlay-body').innerHTML = html;
    const box = $('overlay-actions');
    box.innerHTML = '';
    for (const a of actions) {
      const btn = document.createElement('button');
      btn.type = 'button'; btn.textContent = a.label;
      if (a.primary) btn.className = 'primary';
      btn.addEventListener('click', () => { $('overlay').hidden = true; if (a.fn) a.fn(); });
      box.appendChild(btn);
    }
    $('overlay').hidden = false;
  }

  // ---------- input ----------
  function tileAt(ev) {
    const rect = canvas.getBoundingClientRect();
    const x = (ev.clientX - rect.left) * (canvas.width / rect.width);
    const y = (ev.clientY - rect.top) * (canvas.height / rect.height);
    const c = Math.floor(x / T), r = Math.floor(y / T);
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return null;
    return { c, r };
  }
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    const t = tileAt(e);
    if (!t) return;
    canvas.setPointerCapture(e.pointerId);
    if (e.button === 2) { removeTile(t.c, t.r); return; }
    if (tool === 'belt') { painting = true; lastPaint = t; placeBelt(t.c, t.r, toolDir); return; }
    if (tool === 'remove') { removeTile(t.c, t.r); return; }
    if (tool) { placeMachine(t.c, t.r, tool, toolDir); return; }
    const g = grid[t.r][t.c];
    if (g) { selected = { c: t.c, r: t.r }; } else selected = null;
    dirty();
  });
  canvas.addEventListener('pointermove', (e) => {
    const t = tileAt(e);
    hover = t;
    if (!painting || !t || !lastPaint) return;
    if (t.c === lastPaint.c && t.r === lastPaint.r) return;
    const dc = t.c - lastPaint.c, dr = t.r - lastPaint.r;
    if (Math.abs(dc) + Math.abs(dr) !== 1) { lastPaint = t; return; }   // jumped; just carry on from here
    const d = dc === 1 ? 0 : dr === 1 ? 1 : dc === -1 ? 2 : 3;
    const prev = grid[lastPaint.r][lastPaint.c];
    if (prev && prev.kind === 'belt') prev.dir = d;
    toolDir = d;
    placeBelt(t.c, t.r, d);
    lastPaint = t;
  });
  const stopPaint = () => { painting = false; lastPaint = null; };
  canvas.addEventListener('pointerup', stopPaint);
  canvas.addEventListener('pointercancel', stopPaint);
  canvas.addEventListener('pointerleave', () => { hover = null; });

  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (!$('overlay').hidden || !$('help').hidden) return;
    const k = e.key.toLowerCase();
    if (k === 'r') {
      if (tool) toolDir = (toolDir + 1) % 4;
      else if (selected) { const t = grid[selected.r][selected.c]; if (t && !(t.kind === 'machine' && MACHINES[t.type].sink)) t.dir = (t.dir + 1) % 4; }
      dirty();
    } else if (k === 'escape') { tool = null; selected = null; dirty(); }
    else if (k === 'delete' || k === 'backspace') { if (selected) removeTile(selected.c, selected.r); }
    else if (k === ' ') { e.preventDefault(); speed = speed === 0 ? 1 : 0; syncSpeedButtons(); }
    else if (k === 'b') { tool = 'belt'; selected = null; dirty(); }
    else if (k === 'x') { tool = 'remove'; selected = null; dirty(); }
  });

  $('side-body').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tool]');
    if (!btn) return;
    const id = btn.dataset.tool;
    tool = tool === id ? null : id;
    selected = null;
    dirty();
  });
  $('bench').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const t = selected && grid[selected.r][selected.c];
    if (btn.dataset.cfg && t) { t.cfg = btn.dataset.cfg; if (soundOn) sfx('tick'); dirty(); return; }
    switch (btn.dataset.act) {
      case 'rotate': if (t) t.dir = (t.dir + 1) % 4; break;
      case 'remove': if (selected) removeTile(selected.c, selected.r); break;
      case 'upgrade': if (t) upgrade(t); break;
      case 'rotate-tool': toolDir = (toolDir + 1) % 4; break;
      case 'drop-tool': tool = null; break;
    }
    dirty();
  });
  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => {
    tab = b.dataset.tab;
    document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('active', x === b));
    renderSide();
  }));
  document.querySelectorAll('.speed button').forEach((b) => b.addEventListener('click', () => { speed = Number(b.dataset.speed); syncSpeedButtons(); }));
  function syncSpeedButtons() {
    document.querySelectorAll('.speed button').forEach((b) => b.classList.toggle('active', Number(b.dataset.speed) === speed));
  }
  $('btn-help').addEventListener('click', () => { $('help').hidden = false; });
  $('btn-help-close').addEventListener('click', () => { $('help').hidden = true; });
  $('btn-reset').addEventListener('click', () => {
    overlay('Start a new factory?', '<p>This clears the floor, the cash and every order you have filled. The recipe book is wiped too.</p>', [
      { label: 'Keep going' },
      { label: 'Start over', primary: true, fn: () => { localStorage.removeItem(SAVE_KEY); freshState(); dirty(); save(); welcome(); } },
    ]);
  });
  $('btn-sound').addEventListener('click', () => {
    soundOn = !soundOn;
    $('btn-sound').textContent = `Sound: ${soundOn ? 'on' : 'off'}`;
    $('btn-sound').setAttribute('aria-pressed', String(soundOn));
    try { localStorage.setItem(SOUND_KEY, soundOn ? '1' : '0'); } catch (e) { /* ignore */ }
    if (soundOn) sfx('tick');
  });

  // ---------- sound ----------
  function sfx(kind) {
    try {
      if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
      const t0 = audio.currentTime;
      const tone = (f, start, len, type, vol) => {
        const o = audio.createOscillator(), g = audio.createGain();
        o.type = type || 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0 + start);
        g.gain.exponentialRampToValueAtTime(vol || 0.08, t0 + start + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + start + len);
        o.connect(g).connect(audio.destination);
        o.start(t0 + start); o.stop(t0 + start + len + 0.02);
      };
      if (kind === 'sell') { tone(880, 0, 0.12, 'triangle'); tone(1320, 0.08, 0.16, 'triangle'); }
      else if (kind === 'meh') { tone(220, 0, 0.18, 'sawtooth', 0.04); }
      else if (kind === 'place') { tone(330, 0, 0.06, 'square', 0.05); tone(440, 0.05, 0.08, 'square', 0.05); }
      else if (kind === 'tick') { tone(600, 0, 0.04, 'square', 0.03); }
      else if (kind === 'bad') { tone(160, 0, 0.2, 'sawtooth', 0.05); }
      else if (kind === 'level') { [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.09, 0.22, 'triangle', 0.07)); }
    } catch (e) { /* no audio, no problem */ }
  }

  // ---------- save / load ----------
  function save() {
    try {
      const tiles = [];
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const t = grid[r][c];
        if (!t) continue;
        if (t.kind === 'belt') tiles.push({ c, r, k: 'b', d: t.dir });
        else tiles.push({ c, r, k: 'm', t: t.type, d: t.dir, cfg: t.cfg, lvl: t.lvl });
      }
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        tiles, cash, level, sold, binned, simTime,
        goals: goals.map((g) => ({ count: g.count, kinds: [...g.kinds] })),
        discovered: [...discovered], unlocked, special,
      }));
    } catch (e) { /* ignore */ }
  }
  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const s = JSON.parse(raw);
      freshState();
      cash = s.cash; level = Math.min(s.level, LEVELS.length); sold = s.sold || 0; binned = s.binned || 0; simTime = s.simTime || 0;
      discovered = new Set(s.discovered || []);
      unlocked = s.unlocked || unlocked;
      for (const k of ['machines', 'glazes', 'tops', 'fillings']) if (!unlocked[k]) unlocked[k] = [];
      special = s.special || null;
      goals = makeGoals(level);
      (s.goals || []).forEach((g, i) => { if (goals[i]) { goals[i].count = g.count; goals[i].kinds = new Set(g.kinds || []); } });
      for (const t of s.tiles || []) {
        if (t.k === 'b') grid[t.r][t.c] = newBelt(t.d);
        else if (MACHINES[t.t]) { const m = newMachine(t.t, t.d); m.cfg = t.cfg; m.lvl = t.lvl || 0; grid[t.r][t.c] = m; }
      }
      return true;
    } catch (e) { return false; }
  }
  window.addEventListener('beforeunload', save);

  function welcome() {
    overlay('Welcome to Donut Works', `
      <p>You have a bare floor, <b>${money(START_CASH)}</b> and an order from the shop out front for ten donuts.</p>
      <p>A <b>Dough Hopper</b> plops out dough. A <b>Ring Press</b> punches the hole. A <b>Fryer</b> cooks it. A <b>Shop Counter</b> sells it. Join them with <b>belts</b>, watch the arrows, and the money looks after itself.</p>
      <p>Fill orders to unlock glazers, toppers, fillers and a splitter, then find out what happens when you put a whole pickle on a donut.</p>`,
      [{ label: 'How to play', fn: () => { $('help').hidden = false; } }, { label: 'Open the factory', primary: true }]);
  }

  // ---------- boot ----------
  try { soundOn = localStorage.getItem(SOUND_KEY) === '1'; } catch (e) { /* ignore */ }
  $('btn-sound').textContent = `Sound: ${soundOn ? 'on' : 'off'}`;
  $('btn-sound').setAttribute('aria-pressed', String(soundOn));
  if (!load()) { freshState(); welcome(); }
  renderSide(); renderBench();
  requestAnimationFrame(frame);
})();
