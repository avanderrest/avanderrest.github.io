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
  const STUCK_AFTER = 1.2;       // seconds truly blocked before we flag it

  const GLAZES = {
    sugar: { name: 'Sugar glaze', short: 'Sugar', col: '#fbf1dc', edge: '#e6d3ad', cost: 4 },
    pink: { name: 'Pink glaze', short: 'Pink', col: '#f48fb1', edge: '#d8648f', cost: 4 },
    choc: { name: 'Chocolate', short: 'Choc', col: '#5b3a1e', edge: '#3e2712', cost: 5 },
    maple: { name: 'Maple', short: 'Maple', col: '#c8843a', edge: '#a3642a', cost: 5 },
    blue: { name: 'Bubblegum blue', short: 'Blue', col: '#5fb8e8', edge: '#3a8fc0', cost: 6 },
    lemon: { name: 'Lemon curd', short: 'Lemon', col: '#f2dd63', edge: '#c9b333', cost: 6 },
    mint: { name: 'Mint', short: 'Mint', col: '#a7ddb8', edge: '#6fae85', cost: 6 },
    licorice: { name: 'Liquorice', short: 'Liquorice', col: '#2f2b33', edge: '#161418', cost: 7 },
  };
  const FILLINGS = {
    jam: { name: 'Jam', short: 'Jam', col: '#c8323c', cost: 8 },
    custard: { name: 'Custard', short: 'Custard', col: '#f2c94c', cost: 8 },
    beans: { name: 'Baked beans', short: 'Beans', col: '#d9622b', cost: 5, silly: true },
    mystery: { name: 'Mystery filling', short: 'Mystery', col: '#8a5cc4', cost: 10, silly: true },
    cream: { name: 'Clotted cream', short: 'Cream', col: '#f7efd8', cost: 9 },
    marmite: { name: 'Marmite', short: 'Marmite', col: '#3b2410', cost: 6, silly: true },
  };
  const MYSTERIES = [
    'spaghetti', 'a small coin', 'more donut', 'a single sock', 'existential dread',
    'gravy', 'confetti', 'a note that just says "hi"', 'lukewarm soup', 'marbles (do not eat)',
    'a second, smaller donut', 'mashed potato', 'the colour blue', 'jelly and a fork',
    'a receipt for a different donut', 'wasps (asleep)', 'the sound of a fridge',
    'somebody\u2019s house keys', 'unset custard, and regret', 'a very small library',
    'Tuesday', 'three peas in a line', 'warm lemonade', 'a folded map of nowhere',
    'the inside of another donut', 'a promise you made', 'gravel, sorry, granola',
    'one (1) crouton', 'a tooth. not yours.', 'the smell of a swimming pool',
    'a smaller sock', 'an apology, laminated', 'weather', 'half a conversation',
  ];
  // draw: procedural (sprinkles, chips, cereal) or an emoji
  const TOPS = {
    sprinkles: { name: 'Sprinkles', short: 'Sprinkles', cost: 4, draw: 'sprinkles' },
    chocchips: { name: 'Choc chips', short: 'Choc bits', cost: 5, draw: 'chips' },
    cereal: { name: 'Cereal loops', short: 'Cereal', cost: 4, draw: 'cereal' },
    bacon: { name: 'Bacon', short: 'Bacon', ico: '🥓', cost: 9, silly: true },
    worms: { name: 'Gummy worms', short: 'Worms', ico: '🪱', cost: 6, silly: true },
    pickle: { name: 'A whole pickle', short: 'Pickle', ico: '🥒', cost: 6, silly: true },
    fish: { name: 'Gummy fish', short: 'Fish', ico: '🐟', cost: 6, silly: true },
    chips: { name: 'Chips', short: 'Chips', ico: '🍟', cost: 7, silly: true },
    eyes: { name: 'Googly eyes', short: 'Eyes', ico: '👀', cost: 5, silly: true },
    hat: { name: 'A tiny hat', short: 'Tiny hat', ico: '🎩', cost: 8, silly: true },
    glitter: { name: 'Edible glitter', short: 'Glitter', ico: '✨', cost: 7, silly: true },
    popping: { name: 'Popping candy', short: 'Popping', ico: '💥', cost: 6, silly: true },
    dice: { name: 'Lucky dip', short: 'Lucky dip', ico: '🎲', cost: 6, silly: true, random: true },
    bee: { name: 'One bee', short: 'Bee', ico: '🐝', cost: 8, silly: true },
    cress: { name: 'A little cress', short: 'Cress', ico: '🌱', cost: 5, silly: true },
    cheese: { name: 'Grated cheese', short: 'Cheese', ico: '🧀', cost: 7, silly: true },
    candle: { name: 'A lit candle', short: 'Candle', ico: '🕯️', cost: 9, silly: true },
    crown: { name: 'A paper crown', short: 'Crown', ico: '👑', cost: 9, silly: true },
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
    { id: 'cream', name: 'Cream Tea', glaze: 'lemon', filling: 'cream', tops: [], quip: 'Jam first? We do not do that here. We do not do jam at all.' },
    { id: 'lemondrizzle', name: 'Lemon Drizzle', glaze: 'lemon', filling: null, tops: ['sprinkles'], quip: 'The cake got there first, but only just.' },
    { id: 'afterdinner', name: 'After Dinner', glaze: 'mint', filling: null, tops: ['chocchips'], quip: 'The thin one from the box, but round and enormous.' },
    { id: 'lawn', name: 'The Lawn', glaze: 'mint', filling: null, tops: ['cress'], quip: 'Needs mowing.' },
    { id: 'hive', name: 'The Hive', glaze: 'maple', filling: null, tops: ['bee'], quip: 'One bee. That is the whole idea. Do not question the bee.' },
    { id: 'ploughman', name: "Ploughman's", glaze: 'sugar', filling: 'marmite', tops: ['cheese', 'pickle'], quip: 'A lunch, technically, in the way that a shed is a house.' },
    { id: 'cheesetoast', name: 'Cheese On', glaze: null, filling: 'marmite', tops: ['cheese'], quip: 'Love it or hate it, it is on a donut now.' },
    { id: 'midnight', name: 'Midnight', glaze: 'licorice', filling: null, tops: ['glitter'], quip: 'For people who wear a lot of black and mean it.' },
    { id: 'birthday', name: 'Happy Birthday', glaze: 'pink', filling: 'cream', tops: ['sprinkles', 'candle'], quip: 'Blow it out. Make a wish. Eat the wish.' },
    { id: 'coronation', name: 'The Coronation', glaze: 'licorice', filling: 'cream', tops: ['crown', 'glitter'], quip: 'Long may it reign, which will be about four minutes.' },
    { id: 'seaside', name: 'Seaside', glaze: 'blue', filling: 'cream', tops: ['fish', 'chips'], quip: 'Everything the seaside has, on one donut, including the weather.' },
    { id: 'garden', name: 'Garden Party', glaze: 'mint', filling: 'cream', tops: ['bee', 'cress'], quip: 'Bring a hat. There is a bee.' },
  ];
  const RECIPE_MULT = 1.5;
  const VALUE = { donut: 50, blob: 25, charcoal: 5, raw: 2, glaze: 30, filling: 35, top: 25 };

  // What the Mixer can make. One for now; the machine is built to take more.
  const BATCHES = {
    dough: { name: 'Dough', short: 'Dough', stage: 'dough', cost: DOUGH_COST, mix: 'Flour, sugar, yeast, a splash of milk.' },
  };

  const MACHINES = {
    mixer: { name: 'Mixer', ico: '🥣', cost: 200, time: 2.5, col: '#ecd9ad', source: true, cfgKind: 'batch', desc: 'Mixes a batch and plops out one at a time. Click it to pick what goes in.' },
    press: { name: 'Ring Press', ico: '⭕', cost: 250, time: 1.5, col: '#c9d6e8', desc: 'Punches the hole. Dough in, ring out.' },
    fryer: { name: 'Fryer', ico: '🍳', cost: 400, time: 4, col: '#f0b47a', desc: 'Rings in, donuts out. Slow. Fries anything it is given, for better or worse.' },
    splitter: { name: 'Splitter', ico: '🔀', cost: 500, time: 0.15, col: '#dcdcdc', desc: 'Takes one line and deals it out left, ahead and right, wherever there is room.' },
    joiner: { name: 'Joiner', ico: '🔗', cost: 500, time: 0.15, col: '#d6d0e8', join: true, desc: 'The other way round: takes lines in from the back and both sides and feeds them onto one, taking turns so nobody hogs it.' },
    glazer: { name: 'Glazer', ico: '🎨', cost: 600, time: 2, col: '#f6b8d0', cfgKind: 'glaze', desc: 'Dips fried donuts in glaze. Click it to pick the flavour.' },
    topper: { name: 'Topper', ico: '🍬', cost: 800, time: 2, col: '#c9e6b8', cfgKind: 'top', desc: 'Drops a topping on. Two per donut at most. Click it to choose.' },
    filler: { name: 'Filler', ico: '🧴', cost: 1000, time: 2.5, col: '#f2dc9a', cfgKind: 'fill', desc: 'Squirts something into the middle. One filling per donut.' },
    counter: { name: 'Shop Counter', ico: '🛎️', cost: 100, time: 0, col: '#b6dcd4', omni: true, sink: true, group: true, desc: 'Sells whatever arrives, from any side. The shop front is one bank of tills, so each counter has to touch another one.' },
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
      hint: 'Mixer, press, fryer, counter, in that order, joined by belts. Machines push out of the arrow side.',
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
      unlock: { tops: ['cereal'], glazes: ['maple'] }, bonus: 1200,
      hint: 'Pink glaze then sprinkles makes a named recipe worth half again as much. A splitter can feed two lines from one press.',
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
      hint: 'One line will do it: fryer, then a glazer on sugar, then a filler on jam. Keep the topper off that line — anything on top makes it a different donut.',
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
      unlock: { glazes: ['lemon'], fillings: ['cream'] }, bonus: 3000,
      hint: 'Anything from bacon onwards counts. The special on the board pays double while it lasts.',
    },
    {
      name: 'Afters', who: 'The tea rooms up the road',
      blurb: 'We do a cream tea. We would like to do a cream tea that is a donut. Do not ask why.',
      goals: [{ n: 20, filter: { filled: true }, label: 'Sell 20 filled donuts' }],
      unlock: { glazes: ['mint'], tops: ['bee', 'cress'] }, bonus: 3500,
      hint: 'Every filled donut counts, whatever is in it. A filler is slow \u2014 two of them fed by a splitter beats one working twice as hard.',
    },
    {
      name: 'Belt and Braces', who: 'The shop out front',
      blurb: 'Two toppings each. On everything. I have seen the window with one on and it is not enough.',
      goals: [{ n: 30, filter: { tops: 2 }, label: 'Sell 30 donuts with two toppings' }],
      unlock: { fillings: ['marmite'], tops: ['cheese'] }, bonus: 4000,
      hint: 'A topper only ever adds one, so two toppings means two toppers in a row. Long lines want a joiner at the end to bring them back to one counter.',
    },
    {
      name: 'The Long Window', who: 'Everyone, still',
      blurb: 'The whole window filled, and I want to be able to point at eight different things.',
      goals: [{ n: 48, filter: { named: true }, distinct: 8, label: 'Sell 48 named recipes (8+ kinds)' }],
      unlock: { glazes: ['licorice'], tops: ['candle'] }, bonus: 5000,
      hint: 'Eight kinds means eight configurations. A splitter feeds three lines; a splitter into a splitter feeds five.',
    },
    {
      name: 'The Wedding', who: 'A wedding, obviously',
      blurb: 'Sixteen Coronations. Liquorice, cream, a paper crown and glitter. It is a themed wedding.',
      goals: [{ n: 16, filter: { recipe: 'coronation' }, label: 'Sell 16 Coronations' }],
      unlock: { tops: ['crown'] }, bonus: 5500,
      hint: 'Glazer, filler, topper, topper, in any order after the fryer. Every one of those is two seconds, so the line is only as quick as its slowest four.',
    },
    {
      name: 'Quality Street', who: 'The accountant',
      blurb: 'I have looked at the books. We are selling a great many cheap donuts. Sell dear ones instead.',
      goals: [{ n: 40, filter: { worth: 160 }, label: 'Sell 40 donuts worth \u00a31.60 or more' }],
      unlock: {}, bonus: 7000,
      hint: 'A named recipe is worth half again, so the dear ones are the fancy ones. Glaze, filling and two toppings, and pick the expensive version of each.',
    },
  ];

  // Past the last written order the shop keeps taking work: a wall of ever-larger standing
  // orders, each worth more than the last, so free play has a number in it after all.
  const STANDING_FROM = LEVELS.length;
  function standingOrder(i) {
    const n = i - STANDING_FROM;                     // 0, 1, 2, ...
    const count = 40 + n * 15;
    const kinds = Math.min(14, 6 + Math.floor(n / 2));
    return {
      name: 'Standing Order ' + (n + 1), who: 'The wholesaler',
      blurb: n === 0
        ? 'We will take everything you can make, every week, for as long as you can make it. Named recipes only. The lorry is outside.'
        : 'Same again, and a bit more. The lorry has not moved.',
      goals: [{ n: count, filter: { named: true }, distinct: kinds, label: 'Sell ' + count + ' named recipes (' + kinds + '+ kinds)' }],
      unlock: {}, bonus: 6000 + n * 2500, standing: true,
      hint: 'Nothing new arrives now. The only thing left to do is build the line that fills this faster than the last one did.',
    };
  }
  const levelDef = (i) => (i < LEVELS.length ? LEVELS[i] : standingOrder(i));

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
  let speed = 1, tool = null, toolDir = 0, selected = null, hover = null, painting = false, lastPaint = null, drag = null;
  let floats = [], puffs = [], tab = 'build';
  let soundOn = false, audio = null;
  let hudCache = '';

  function freshState() {
    grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    cash = START_CASH; level = 0; sold = 0; binned = 0; simTime = 0;
    discovered = new Set(); saleLog = [];
    unlocked = { machines: ['mixer', 'press', 'fryer', 'splitter', 'joiner', 'counter', 'bin'], glazes: [], tops: [], fillings: [], batches: ['dough'] };
    special = null;
    goals = makeGoals(level);
    selected = null; tool = null; drag = null;
  }
  function makeGoals(li) {
    const L = levelDef(li);
    if (!L) return [];
    return L.goals.map((g) => ({ ...g, count: 0, kinds: new Set() }));
  }
  function newMachine(type, dir) {
    return { kind: 'machine', type, dir, cfg: defaultCfg(type), lvl: 0, inBuf: null, ins: [null, null, null], cur: null, outBuf: null, t: 0, rr: 0, anim: 0, stuck: 0, why: null };
  }
  function defaultCfg(type) {
    const k = MACHINES[type].cfgKind;
    if (k === 'glaze') return unlocked.glazes[0] || 'sugar';
    if (k === 'top') return unlocked.tops[0] || 'sprinkles';
    if (k === 'fill') return unlocked.fillings[0] || 'jam';
    if (k === 'batch') return unlocked.batches[0] || 'dough';
    return null;
  }
  function newBelt(dir) { return { kind: 'belt', dir, items: [] }; }
  function makeBatch(id) {
    const b = BATCHES[id] || BATCHES.dough;
    return { stage: b.stage, glaze: null, filling: null, tops: [], note: null, fillVal: 0, passes: { fry: 0, fill: 0, top: 0 } };
  }

  // DW-3: taking a thing back only ever returns a fraction of what you put in.
  const REFUND_RATE = 0.5;
  // DW-4: what a second trip through a station does to a donut. Every value
  // lives here so the tuning can breathe without touching the per-donut code.
  const DOUBLE_PASS = {
    fry: { from: 2, stage: 'charcoal' },   // a cooked donut's second fry chars it, visibly
    fill: { from: 2, bonus: 2 },           // a second squirt is free and barely moves the value
    top: { bonus: 4 },                     // past the two-topping cap, each extra trip tips the price a little
  };

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
      // second trips through a station nudge the price; see DOUBLE_PASS
      const fp = (it.passes && it.passes.fill) || 0;
      const tp = (it.passes && it.passes.top) || 0;
      if (it.filling && fp >= DOUBLE_PASS.fill.from) total += (fp - DOUBLE_PASS.fill.from + 1) * DOUBLE_PASS.fill.bonus;
      if (tp > MAX_TOPS) total += (tp - MAX_TOPS) * DOUBLE_PASS.top.bonus;
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

  // ---------- belt shape ----------
  // A belt fed only from one side reads far better as a corner piece than as a
  // straight run with donuts popping into being halfway along it. Which shape a
  // belt is depends on its neighbours, so it is worked out once per change.
  let topoDirty = true, bendCache = null;
  function feedsInto(c, r, s) {
    // is the tile behind (c,r), relative to something travelling in direction s,
    // actually pushing that way?
    const pc = c - DX[s], pr = r - DY[s];
    if (pc < 0 || pr < 0 || pc >= COLS || pr >= ROWS) return false;
    const t = grid[pr][pc];
    if (!t) return false;
    if (t.kind === 'belt') return t.dir === s;
    const def = MACHINES[t.type];
    if (def.sink) return false;
    if (t.type === 'splitter') return s === t.dir || s === (t.dir + 1) % 4 || s === (t.dir + 3) % 4;
    return t.dir === s;
  }
  function rebuildBends() {
    bendCache = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const t = grid[r][c];
      if (!t || t.kind !== 'belt') continue;
      if (feedsInto(c, r, t.dir)) continue;                    // fed from behind: a straight run
      const l = (t.dir + 3) % 4, rt = (t.dir + 1) % 4;
      const fl = feedsInto(c, r, l), fr = feedsInto(c, r, rt);
      if (fl && !fr) bendCache[r][c] = l;                      // the travel direction coming in
      else if (fr && !fl) bendCache[r][c] = rt;
    }
    topoDirty = false;
  }
  function bendAt(c, r) {
    if (topoDirty) rebuildBends();
    return bendCache[r][c];
  }
  // the quarter turn a bend belt makes, in tile-local coordinates
  function bendGeom(dir, s) {
    const rad = T / 2;
    const ax = (-DX[s] + DX[dir]) * rad, ay = (-DY[s] + DY[dir]) * rad;
    const a0 = Math.atan2(-DY[s] * rad - ay, -DX[s] * rad - ax);
    const a1 = Math.atan2(DY[dir] * rad - ay, DX[dir] * rad - ax);
    let d = a1 - a0;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return { ax, ay, a0, d, rad };
  }
  const BEND_SLOW = 0.5 / (Math.PI / 4);   // the corner is a longer path than the straight half

  // ---------- machine processing ----------
  function procTime(m) { return MACHINES[m.type].time * Math.pow(0.75, m.lvl); }
  function machineOutput(m, it) {
    const cfg = m.cfg;
    it.passes = it.passes || { fry: 0, fill: 0, top: 0 };
    switch (m.type) {
      case 'press':
        if (it.stage === 'dough') it.stage = 'ring';
        break;
      case 'fryer':
        it.passes.fry++;
        if (it.stage === 'dough') it.stage = 'blob';
        else if (it.stage === 'ring') it.stage = 'donut';
        else if (it.passes.fry >= DOUBLE_PASS.fry.from) it.stage = DOUBLE_PASS.fry.stage;
        break;
      case 'glazer':
        if (isFried(it) && GLAZES[cfg] && it.glaze !== cfg) { it.glaze = cfg; cash -= GLAZES[cfg].cost; }
        break;
      case 'topper': {
        it.passes.top++;
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
        it.passes.fill++;
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
    if (def.join) {
      const s = joinSlot(m, travelDir);
      if (s < 0 || m.ins[s]) return false;
      m.ins[s] = it;
      return true;
    }
    if (m.inBuf) return false;
    m.inBuf = it;
    return true;
  }
  // A joiner keeps one slot per way in — back, left, right — so a busy line
  // cannot sit in the doorway and starve the other two.
  function joinSlot(m, travelDir) {
    if (travelDir === m.dir) return 0;
    if (travelDir === (m.dir + 1) % 4) return 1;
    if (travelDir === (m.dir + 3) % 4) return 2;
    return -1;
  }

  // Why a thing cannot move on. 'busy' is an ordinary queue and clears itself;
  // every other answer never will, and is what the player needs telling about.
  function blockReason(c, r, travelDir) {
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return 'edge';
    const t = grid[r][c];
    if (!t) return 'dead';
    if (t.kind === 'belt') return t.dir === (travelDir + 2) % 4 ? 'wrongbelt' : 'busy';
    const def = MACHINES[t.type];
    if (def.source) return 'nointake';
    if (!def.omni && travelDir === (t.dir + 2) % 4) return 'wrongmachine';
    return 'busy';
  }
  const HARD_BLOCK = { edge: true, dead: true, wrongbelt: true, wrongmachine: true, nointake: true };
  const BLOCK_TEXT = {
    edge: 'The floor runs out here.',
    dead: 'Nothing ahead to take it. Lay a belt, or a machine facing away.',
    wrongbelt: 'The belt ahead runs the other way. Give it a turn.',
    wrongmachine: 'That machine pushes out this way. Turn it, or feed it from behind.',
    nointake: 'That one only makes things, it does not take them.',
  };
  function blockText(why) { return BLOCK_TEXT[why] || 'Waiting for the next machine.'; }

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
      if (m.outBuf) { pushOut(m, c, r, dt); return; }
      if (cash <= CASH_FLOOR) return;
      m.t += dt;
      if (m.t >= procTime(m)) { m.t = 0; m.outBuf = makeBatch(m.cfg); cash -= (BATCHES[m.cfg] || BATCHES.dough).cost; }
      if (m.outBuf) pushOut(m, c, r, dt);
      return;
    }
    if (def.join && !m.cur && !m.inBuf) {
      for (let i = 0; i < 3; i++) {
        const s = (m.rr + i) % 3;
        if (m.ins[s]) { m.inBuf = m.ins[s]; m.ins[s] = null; m.rr = (s + 1) % 3; break; }
      }
    }
    if (m.cur) {
      m.t -= dt;
      if (m.t <= 0 && !m.outBuf) { m.outBuf = machineOutput(m, m.cur); m.cur = null; m.t = 0; }
      else if (m.type === 'fryer' && Math.random() < dt * 3) {
        puffs.push({ x: c * T + 18 + Math.random() * 24, y: r * T + 14, vy: -18 - Math.random() * 10, t: 0, life: 0.9 + Math.random() * 0.5 });
      }
    }
    if (!m.cur && m.inBuf) { m.cur = m.inBuf; m.inBuf = null; m.t = procTime(m); }
    if (m.outBuf) pushOut(m, c, r, dt);
    else { m.stuck = 0; m.why = null; }
  }
  function pushOut(m, c, r, dt) {
    if (m.type === 'splitter') {
      const dirs = [m.dir, (m.dir + 1) % 4, (m.dir + 3) % 4];
      for (let i = 0; i < 3; i++) {
        const d = dirs[(m.rr + i) % 3];
        if (tryEnter(c + DX[d], r + DY[d], m.outBuf, d)) { m.outBuf = null; m.rr = (m.rr + i + 1) % 3; m.stuck = 0; m.why = null; return; }
      }
      // a splitter is only truly stuck when every one of its three ways out is
      const reasons = dirs.map((d) => blockReason(c + DX[d], r + DY[d], d));
      m.why = reasons.some((w) => !HARD_BLOCK[w]) ? 'busy' : reasons[0];
      m.stuck += dt;
      return;
    }
    if (tryEnter(c + DX[m.dir], r + DY[m.dir], m.outBuf, m.dir)) { m.outBuf = null; m.stuck = 0; m.why = null; return; }
    m.why = blockReason(c + DX[m.dir], r + DY[m.dir], m.dir);
    m.stuck += dt;
  }
  function stepBelt(b, c, r, dt) {
    if (!b.items.length) return;
    const spd = BELT_SPEED * (bendAt(c, r) != null ? BEND_SLOW : 1);
    b.items.sort((x, y) => y.p - x.p);
    for (let i = 0; i < b.items.length; i++) {
      const e = b.items[i];
      const cap = i === 0 ? Infinity : b.items[i - 1].p - SPACING;
      let np = Math.min(e.p + spd * dt, cap);
      if (np >= 1) {
        if (tryEnter(c + DX[b.dir], r + DY[b.dir], e.it, b.dir)) { b.items.splice(i, 1); i--; continue; }
        np = 1; e.stuck += dt;
        e.why = blockReason(c + DX[b.dir], r + DY[b.dir], b.dir);
      } else { e.stuck = 0; e.why = null; }
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
    if (f.filled && !(it.stage === 'donut' && it.filling)) return false;
    if (f.tops && !(it.stage === 'donut' && it.tops.length >= f.tops)) return false;
    if (f.worth && valueOf(it).total < f.worth) return false;
    return true;
  }
  function goalDone(g) { return g.count >= g.n && (!g.distinct || g.kinds.size >= g.distinct); }
  function note(text, c, r, col, life) {
    floats.push({ x: c * T + T / 2, y: r * T - 30, text, col: col || '#3b2a24', t: 0, life: life || 1.6, size: 13 });
  }

  function checkLevel() {
    if (!goals.length || !goals.every(goalDone)) return;
    const L = levelDef(level);
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
    const next = levelDef(level);
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
  function isCounter(t) { return !!t && t.kind === 'machine' && MACHINES[t.type].group; }
  // The shop front is one bank of tills, not counters dotted all over the floor:
  // a counter may only go down touching one that is already there. `ignore` is
  // the counter being picked up, when one is on the move.
  function counterOk(c, r, ignore) {
    let any = false;
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      if (!isCounter(grid[y][x])) continue;
      if (ignore && x === ignore.c && y === ignore.r) continue;
      any = true;
      if (Math.abs(x - c) + Math.abs(y - r) === 1) return true;
    }
    return !any;
  }
  // pick a thing up and put it down somewhere else; two things swap places
  function moveTile(from, to) {
    if (from.c === to.c && from.r === to.r) return;
    const a = grid[from.r][from.c];
    if (!a) return;
    const b = grid[to.r][to.c];
    // two counters swapping leaves the shop front exactly as it was; one on its
    // own has to land next to its neighbours
    if (isCounter(a) && !isCounter(b) && !counterOk(to.c, to.r, from)) { note('Counters stay together', to.c, to.r, '#b8483a'); if (soundOn) sfx('bad'); return; }
    if (isCounter(b) && !isCounter(a) && !counterOk(from.c, from.r, to)) { note('Counters stay together', from.c, from.r, '#b8483a'); if (soundOn) sfx('bad'); return; }
    grid[from.r][from.c] = b || null;
    grid[to.r][to.c] = a;
    selected = { c: to.c, r: to.r };
    if (soundOn) sfx('place');
    dirty();
  }
  function placeMachine(c, r, type, dir) {
    const def = MACHINES[type];
    if (!unlocked.machines.includes(type)) return false;
    if (def.group && !counterOk(c, r)) { note('Next to the other counters', c, r, '#b8483a'); if (soundOn) sfx('bad'); return false; }
    if (!canAfford(def.cost)) { note('Not enough cash', c, r, '#b8483a'); if (soundOn) sfx('bad'); return false; }
    // DW-2: placing over an occupied tile removes what is there, refunded the
    // same way a take-back would be.
    if (grid[r][c]) removeTile(c, r);
    cash -= def.cost;
    grid[r][c] = newMachine(type, dir);
    if (soundOn) sfx('place');
    dirty();
    return true;
  }
  function placeBelt(c, r, dir, paint) {
    const t = grid[r][c];
    if (t && t.kind === 'belt') { t.dir = dir; dirty(); return true; }
    if (t && t.kind === 'machine') {
      // painting a run never swallows machines; an explicit click does, the
      // same replacement-and-refund as placing a machine over one
      if (paint) return false;
      if (!canAfford(BELT_COST)) { note('Not enough cash', c, r, '#b8483a'); if (soundOn) sfx('bad'); return false; }
      removeTile(c, r);
    }
    if (grid[r][c]) return false;
    if (!canAfford(BELT_COST)) { note('Not enough cash', c, r, '#b8483a'); if (soundOn) sfx('bad'); return false; }
    cash -= BELT_COST;
    grid[r][c] = newBelt(dir);
    if (soundOn) sfx('tick');
    dirty();
    return true;
  }
  // DW-3: take-back returns only a fraction of what the thing cost, belts at the
  // same rate as machines, never the full amount.
  function refundOf(t) {
    return t.kind === 'belt'
      ? Math.round(BELT_COST * REFUND_RATE)
      : Math.round((MACHINES[t.type].cost + upgradeSpent(t)) * REFUND_RATE);
  }
  function removeTile(c, r) {
    const t = grid[r][c];
    if (!t) return;
    const refund = refundOf(t);
    cash += refund;
    grid[r][c] = null;
    if (selected && selected.c === c && selected.r === r) selected = null;
    if (soundOn) sfx('tick');
    if (refund > 0) floats.push({ x: c * T + T / 2, y: r * T + 8, text: `${pence(refund)} back`, col: '#8a6d2f', t: 0, life: 1.3, size: 13 });
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
  function dirty() { dirtyUI = true; topoDirty = true; }

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
  function chevron() {
    ctx.beginPath(); ctx.moveTo(-5, -10); ctx.lineTo(2, 0); ctx.lineTo(-5, 10); ctx.stroke();
  }
  function drawBelt(c, r, dir, ghost, bend) {
    ctx.save();
    ctx.translate(c * T + T / 2, r * T + T / 2);
    ctx.globalAlpha = ghost ? 0.5 : 1;
    const off = (simTime * BELT_SPEED * T) % 20;
    if (bend == null) {
      ctx.rotate(dir * Math.PI / 2);
      ctx.fillStyle = '#5a5654';
      ctx.fillRect(-T / 2, -18, T, 36);
      ctx.fillStyle = '#3f3c3a';
      ctx.fillRect(-T / 2, -18, T, 3);
      ctx.fillRect(-T / 2, 15, T, 3);
      // chevrons that crawl along
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.lineWidth = 2.5;
      for (let x = -T / 2 - 20 + off; x < T / 2 + 4; x += 20) {
        ctx.save(); ctx.translate(x, 0); chevron(); ctx.restore();
      }
      ctx.restore();
      return;
    }
    // a quarter turn, swinging about the corner between the way in and the way out
    const g = bendGeom(dir, bend);
    const a1 = g.a0 + g.d, ccw = g.d < 0;
    ctx.strokeStyle = '#5a5654'; ctx.lineWidth = 36;
    ctx.beginPath(); ctx.arc(g.ax, g.ay, g.rad, g.a0, a1, ccw); ctx.stroke();
    ctx.strokeStyle = '#3f3c3a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(g.ax, g.ay, g.rad - 16.5, g.a0, a1, ccw); ctx.stroke();
    ctx.beginPath(); ctx.arc(g.ax, g.ay, g.rad + 16.5, g.a0, a1, ccw); ctx.stroke();
    const len = Math.abs(g.d) * g.rad, sgn = g.d < 0 ? -1 : 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 2.5;
    for (let s = off - 20; s < len; s += 20) {
      if (s < 0) continue;
      const a = g.a0 + sgn * (s / g.rad);
      ctx.save();
      ctx.translate(g.ax + Math.cos(a) * g.rad, g.ay + Math.sin(a) * g.rad);
      ctx.rotate(a + sgn * Math.PI / 2);
      chevron();
      ctx.restore();
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
  function drawInArrow(dir, alpha) {
    // sits on the `dir` edge and points back in towards the middle
    ctx.save();
    ctx.rotate(dir * Math.PI / 2);
    ctx.fillStyle = `rgba(59,42,36,${alpha})`;
    ctx.beginPath(); ctx.moveTo(T / 2 + 4, -7); ctx.lineTo(T / 2 - 3, 0); ctx.lineTo(T / 2 + 4, 7); ctx.closePath(); ctx.fill();
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
    const a0 = ctx.globalAlpha;
    if (m.cur) {
      // whatever is being worked on rides in the middle of the machine, bobbing,
      // so a thing in progress never reads as a thing gone missing
      ctx.globalAlpha = a0 * 0.3;
      ctx.fillText(def.ico, 0, 1);
      ctx.globalAlpha = a0;
      drawItem(0, -3 + Math.sin(simTime * 7) * 1.6, m.cur, 0.78);
    } else {
      ctx.fillText(def.ico, 0, m.outBuf ? -2 : 1);
    }
    // output arrow(s)
    if (!def.sink) {
      drawArrow(m.dir, 0.75);
      if (m.type === 'splitter') { drawArrow((m.dir + 1) % 4, 0.45); drawArrow((m.dir + 3) % 4, 0.45); }
      if (def.join) { drawInArrow((m.dir + 2) % 4, 0.5); drawInArrow((m.dir + 1) % 4, 0.5); drawInArrow((m.dir + 3) % 4, 0.5); }
    }
    // config swatch
    if (def.cfgKind && m.cfg) {
      ctx.save(); ctx.translate(16, -16);
      if (def.cfgKind === 'glaze') { ctx.fillStyle = GLAZES[m.cfg].col; ctx.strokeStyle = GLAZES[m.cfg].edge; ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
      else if (def.cfgKind === 'fill') { ctx.fillStyle = FILLINGS[m.cfg].col; ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
      else if (def.cfgKind === 'top') {
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
        drawTopping(m.cfg, 0, 0, 0.8);
      }
      ctx.restore();
    }
    // progress bar
    if (m.cur || (def.source && cash > CASH_FLOOR)) {
      const frac = def.source ? m.t / procTime(m) : 1 - m.t / procTime(m);
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; rr(-18, 11, 36, 5, 2.5); ctx.fill();
      ctx.fillStyle = '#e0568a'; rr(-18, 11, 36 * Math.max(0, Math.min(1, frac)), 5, 2.5); ctx.fill();
    }
    if (def.source && cash <= CASH_FLOOR) {
      ctx.fillStyle = '#b8483a'; ctx.font = 'bold 10px sans-serif'; ctx.fillText('NO FLOUR £', 0, 13);
    }
    // level pips
    for (let i = 0; i < m.lvl; i++) { ctx.fillStyle = '#e0568a'; ctx.beginPath(); ctx.arc(-17 + i * 8, -18, 2.5, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
    // items waiting
    if (def.join) for (let s = 0; s < 3; s++) {
      if (!m.ins[s]) continue;
      const d = s === 0 ? (m.dir + 2) % 4 : s === 1 ? (m.dir + 1) % 4 : (m.dir + 3) % 4;
      drawItem(c * T + T / 2 + DX[d] * 21, r * T + T / 2 + DY[d] * 21, m.ins[s], 0.7);
    }
    if (m.inBuf) drawItem(c * T + T / 2 - DX[m.dir] * 20, r * T + T / 2 - DY[m.dir] * 20, m.inBuf, 0.75);
    if (m.outBuf) drawItem(c * T + T / 2 + DX[m.dir] * 20, r * T + T / 2 + DY[m.dir] * 20, m.outBuf, 0.9);
    // and a tag on the front saying what it is set to
    const lab = cfgLabel(m);
    if (lab) drawTag(c * T + T / 2, r * T + T - 5, lab, ghost);
  }
  function cfgLabel(m) {
    const k = MACHINES[m.type].cfgKind;
    if (!k || !m.cfg) return null;
    const tbl = k === 'glaze' ? GLAZES : k === 'fill' ? FILLINGS : k === 'top' ? TOPS : BATCHES;
    const d = tbl[m.cfg];
    return d ? d.short || d.name : null;
  }
  function drawTag(x, y, text, ghost) {
    ctx.save();
    ctx.globalAlpha = ghost ? 0.55 : 1;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '600 9px ui-sans-serif, system-ui, sans-serif';
    let w = ctx.measureText(text).width;
    if (w > T - 10) { ctx.font = '600 8px ui-sans-serif, system-ui, sans-serif'; w = ctx.measureText(text).width; }
    ctx.fillStyle = 'rgba(255,255,255,0.94)';
    rr(x - w / 2 - 4, y - 6, w + 8, 12, 6); ctx.fill();
    ctx.strokeStyle = 'rgba(59,42,36,0.25)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#3b2a24'; ctx.fillText(text, x, y + 0.5);
    ctx.restore();
  }
  function drawStuckBadge(x, y) {
    ctx.save();
    ctx.fillStyle = '#b8483a';
    ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 12px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('!', x, y + 0.5);
    ctx.restore();
  }
  function drawTip(x, y, text) {
    ctx.save();
    ctx.font = '11.5px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + 18;
    const cx = Math.max(w / 2 + 4, Math.min(canvas.width - w / 2 - 4, x));
    const cy = Math.max(15, y);
    ctx.fillStyle = 'rgba(59,42,36,0.94)';
    rr(cx - w / 2, cy - 12, w, 24, 9); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText(text, cx, cy + 0.5);
    ctx.restore();
  }
  // what, if anything, is genuinely stuck on this tile
  function tileStuck(c, r) {
    const t = grid[r] && grid[r][c];
    if (!t) return null;
    if (t.kind === 'belt') {
      for (const e of t.items) if (e.stuck > STUCK_AFTER && HARD_BLOCK[e.why]) return e.why;
      return null;
    }
    if (t.stuck > STUCK_AFTER && HARD_BLOCK[t.why]) return t.why;
    return null;
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
      ctx.strokeStyle = '#efdcb4'; ctx.lineWidth = 7.5;
      ctx.beginPath(); ctx.arc(0, 0, 7.75, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#cdb383'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(0, 0, 11.5, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.stroke();
    } else {
      const base = it.stage === 'charcoal' ? '#3a3634' : '#c98a3f';
      const edge = it.stage === 'charcoal' ? '#1e1c1b' : '#9a6428';
      if (it.stage === 'blob') {
        ctx.fillStyle = base; ctx.strokeStyle = edge; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        if (it.glaze) { ctx.fillStyle = GLAZES[it.glaze].col; ctx.beginPath(); ctx.arc(0, -1, 8.5, 0, Math.PI * 2); ctx.fill(); }
      } else {
        // same hole the ring went in with — frying does not close it up
        ctx.strokeStyle = base; ctx.lineWidth = 7.5;
        ctx.beginPath(); ctx.arc(0, 0, 7.75, 0, Math.PI * 2); ctx.stroke();
        if (it.glaze) {
          ctx.strokeStyle = GLAZES[it.glaze].col; ctx.lineWidth = 5.5;
          ctx.beginPath(); ctx.arc(0, -0.5, 7.9, 0, Math.PI * 2); ctx.stroke();
          // a drip
          ctx.fillStyle = GLAZES[it.glaze].col;
          ctx.beginPath(); ctx.arc(8.5, 5.5, 2.2, 0, Math.PI * 2); ctx.fill();
        }
        ctx.strokeStyle = edge; ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.arc(0, 0, 11.5, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = 'rgba(0,0,0,0.16)'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(0, 0, 4.7, 0, Math.PI * 2); ctx.stroke();
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
  function beltPos(c, r, dir, p, bend) {
    const cx = c * T + T / 2, cy = r * T + T / 2;
    if (bend != null && p >= 0.5) {
      const g = bendGeom(dir, bend);
      const a = g.a0 + g.d * ((p - 0.5) * 2);
      return { x: cx + g.ax + Math.cos(a) * g.rad, y: cy + g.ay + Math.sin(a) * g.rad };
    }
    return { x: cx + DX[dir] * (p - 0.5) * T, y: cy + DY[dir] * (p - 0.5) * T };
  }
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawFloor();
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const t = grid[r][c];
      if (t && t.kind === 'belt') drawBelt(c, r, t.dir, false, bendAt(c, r));
    }
    // selection + hover
    if (selected && grid[selected.r][selected.c]) {
      ctx.strokeStyle = '#e0568a'; ctx.lineWidth = 3;
      rr(selected.c * T + 2, selected.r * T + 2, T - 4, T - 4, 8); ctx.stroke();
    }
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const t = grid[r][c];
      if (t && t.kind === 'machine') drawMachine(c, r, t, false);
      if (t && t.kind === 'machine' && t.stuck > STUCK_AFTER && HARD_BLOCK[t.why]) drawStuckBadge(c * T + T - 10, r * T + 10);
    }
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const t = grid[r][c];
      if (!t || t.kind !== 'belt') continue;
      const bend = bendAt(c, r);
      for (const e of t.items) {
        const p = beltPos(c, r, t.dir, e.p, bend);
        drawItem(p.x, p.y, e.it, 1);
        if (e.stuck > STUCK_AFTER && HARD_BLOCK[e.why]) drawStuckBadge(p.x + 11, p.y - 12);
      }
    }
    // where the thing in your hand is going
    if (drag && drag.moved) {
      const a = grid[drag.from.r][drag.from.c];
      const { c, r } = drag.at;
      ctx.fillStyle = 'rgba(224,86,138,0.14)'; rr(c * T + 2, r * T + 2, T - 4, T - 4, 8); ctx.fill();
      if (a) { if (a.kind === 'belt') drawBelt(c, r, a.dir, true, null); else drawMachine(c, r, a, true); }
      ctx.strokeStyle = '#e0568a'; ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 4]); rr(c * T + 2, r * T + 2, T - 4, T - 4, 8); ctx.stroke(); ctx.setLineDash([]);
      if (grid[r][c]) drawTag(c * T + T / 2, r * T + 12, 'swap', false);
    }
    // ghost of the tool
    else if (hover && tool && !painting) {
      const { c, r } = hover;
      const occupied = !!grid[r][c];
      if (tool === 'belt') { if (!occupied || grid[r][c].kind === 'belt') drawBelt(c, r, toolDir, true, null); }
      else if (tool === 'remove') {
        ctx.fillStyle = 'rgba(184,72,58,0.28)'; rr(c * T + 2, r * T + 2, T - 4, T - 4, 8); ctx.fill();
      } else if (!occupied) {
        const ghost = newMachine(tool, toolDir);
        drawMachine(c, r, ghost, true);
        const wrongSpot = MACHINES[tool].group && !counterOk(c, r);
        if (!canAfford(MACHINES[tool].cost) || wrongSpot) { ctx.fillStyle = 'rgba(184,72,58,0.3)'; rr(c * T + 2, r * T + 2, T - 4, T - 4, 8); ctx.fill(); }
        if (wrongSpot) drawTip(c * T + T / 2, r * T - 8, 'Counters go next to each other.');
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
    // hover a stuck tile and it tells you what is wrong
    if (hover && !tool) {
      const st = tileStuck(hover.c, hover.r);
      if (st) drawTip(hover.c * T + T / 2, hover.r * T - 8, blockText(st));
    }
    if (speed === 0) {
      ctx.fillStyle = 'rgba(59,42,36,0.75)'; rr(canvas.width / 2 - 44, 10, 88, 26, 13); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.fillText('PAUSED', canvas.width / 2, 23);
    }
  }

  // ---------- main loop ----------
  let last = performance.now(), saveTimer = 0, benchJam = '';
  function frame(now) {
    let dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    let remain = dt * speed;
    while (remain > 0) { const s = Math.min(remain, 1 / 30); simulate(s); remain -= s; }
    // the bench only redraws when something marks it dirty, and a line jamming
    // up is not something the player did, so watch for it here
    if (selected) {
      const j = tileStuck(selected.c, selected.r) || '';
      if (j !== benchJam) { benchJam = j; dirty(); }
    } else if (benchJam) benchJam = '';
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
    const key = `${cash}|${level}|${sold}|${saleLog.length}|${goals.map((g) => `${g.count}.${g.kinds.size}`).join(',')}|${spec ? spec.id : ''}|${spec ? Math.ceil(special.until - simTime) : ''}`;
    if (key === hudCache) return;
    hudCache = key;
    $('hud-cash').textContent = money(cash);
    $('hud-cash').style.color = cash < 0 ? '#b8483a' : '';
    $('hud-level').textContent = `${level + 1} · ${levelDef(level).name}`;
    renderOrderTip();
    $('hud-sold').textContent = sold;
    $('hud-rate').textContent = saleLog.length;
    $('hud-special-wrap').hidden = !spec;
    if (spec) {
      $('hud-special').textContent = `${spec.name} ${fmtTime(special.until - simTime)}`;
      $('hud-special-tip').innerHTML = `<b>${spec.name}</b> — ${recipeParts(spec)}.<br>` +
        `Sell one before the timer runs out and it pays <b>${pence(recipeValue(spec) * 2)}</b> instead of ${pence(recipeValue(spec))}. ` +
        `Any other donut pays as usual.`;
    }
    if (tab === 'goals') updateGoalBars();
  }
  function fmtTime(s) { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
  // The level box doubles as the order board: what is left to do, at a glance.
  function renderOrderTip() {
    const L = levelDef(level);
    const badge = $('tab-goal-badge');
    const parts = [`<b>Order ${level + 1}${L.standing ? '' : ' of ' + LEVELS.length} — ${L.name}</b>`];
    for (const g of goals) {
      parts.push(`<div class="tip-goal${goalDone(g) ? ' done' : ''}"><span class="n">${goalCount(g)}</span><span>${g.label}</span></div>`);
      const needs = goalNeeds(g);
      if (needs && !goalDone(g)) parts.push(`<div style="opacity:.75;margin:-2px 0 4px 0">${needs.replace(/<\/?b>/g, '')}</div>`);
    }
    parts.push(`<div class="tip-foot">Pays ${money(L.bonus)}. Click for the full order board.</div>`);
    $('hud-level-tip').innerHTML = parts.join('');
    const total = goals.reduce((a, g) => a + Math.min(g.count, g.n), 0);
    const need = goals.reduce((a, g) => a + g.n, 0);
    badge.hidden = false;
    badge.textContent = `${total}/${need}`;
    badge.classList.toggle('done', goals.every(goalDone));
  }

  // ---------- side panel ----------
  function renderSide() {
    const body = $('side-body');
    if (tab === 'build') body.innerHTML = buildTab();
    else if (tab === 'goals') body.innerHTML = goalsTab();
    else body.innerHTML = recipesTab();
    if (tab === 'recipes') body.querySelectorAll('canvas[data-recipe]').forEach(drawRecipeThumb);
    if (tab === 'recipes') reanchorTip(); else hideTip();
  }
  function buildTab() {
    const rows = [];
    rows.push(`<p class="hint">Pick a tool, click the floor to place. <kbd>R</kbd> turns it, <kbd>right-click</kbd> takes things back for a partial refund, <kbd>Esc</kbd> puts the tool down. Placing anything over an occupied tile replaces it at the take-back rate. Drag with the belt tool to paint a run.</p>`);
    rows.push(toolBtn('belt', '➡️', 'Belt', 'Carries things along. Runs into the side of another belt to merge.', BELT_COST));
    for (const type of Object.keys(MACHINES)) {
      if (!unlocked.machines.includes(type)) continue;
      const d = MACHINES[type];
      rows.push(toolBtn(type, d.ico, d.name, d.desc, d.cost));
    }
    rows.push(toolBtn('remove', '✖️', 'Take back', 'Remove a belt or machine. Partial refund, the same for both.', null));
    const locked = Object.keys(MACHINES).filter((t) => !unlocked.machines.includes(t));
    if (locked.length) {
      rows.push('<h3>Still to unlock</h3>');
      for (const type of locked) {
        const d = MACHINES[type];
        const lvl = LEVELS.findIndex((L) => (L.unlock.machines || []).includes(type));
        const when = lvl < 0 ? 'Not yet.' : `Fill order ${lvl + 1}, ${levelDef(lvl).name}.`;
        rows.push(`<div class="tool locked"><span class="ico">${d.ico}</span><span class="grow"><span class="name">${d.name}</span><span class="desc">${when}</span></span></div>`);
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
    const L = levelDef(level);
    if (L) {
      parts.push(`<div class="order"><div class="who">Order ${level + 1}${L.standing ? '' : ' of ' + LEVELS.length} · ${L.who}</div><div class="what">${L.name}</div><div class="blurb">&ldquo;${L.blurb}&rdquo;</div>`);
      for (const g of goals) parts.push(goalHtml(g));
      parts.push(`<div class="reward">Pays <b>${money(L.bonus)}</b>${unlockSummary(L.unlock)}</div>`);
      if (L.hint) parts.push(`<p class="hint" style="margin-top:8px">${L.hint}</p>`);
      parts.push('</div>');
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
  function countMachines(type) {
    let n = 0;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const t = grid[r][c];
      if (t && t.kind === 'machine' && t.type === type) n++;
    }
    return n;
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
    const count = goalCount(g);
    const needs = goalNeeds(g);
    return `<div class="goal${done ? ' done' : ''}" data-goal="${g.label}"><span class="count">${count}</span>${g.label}${needs ? `<div class="needs">${needs}</div>` : ''}<div class="bar"><i style="width:${Math.min(100, g.count / g.n * 100)}%"></i></div></div>`;
  }
  function goalCount(g) {
    return g.distinct ? `${Math.min(g.count, g.n)}/${g.n} · ${g.kinds.size}/${g.distinct} kinds` : `${Math.min(g.count, g.n)}/${g.n}`;
  }
  // A one-line "make this" for a goal, so you never have to guess what it wants.
  function recipeLine(r) {
    const bits = [r.glaze ? GLAZES[r.glaze].name : 'no glaze'];
    bits.push(r.filling ? `${FILLINGS[r.filling].name} filling` : 'no filling');
    bits.push(r.tops.length ? r.tops.map((t) => TOPS[t].name).join(' + ') : 'nothing on top');
    return bits.join(', ');
  }
  function goalNeeds(g) {
    const f = g.filter;
    if (f.recipe) {
      const r = RECIPES.find((x) => x.id === f.recipe);
      return r ? `<b>${r.name}</b> = ${recipeLine(r)}.` : '';
    }
    if (f.glazed) return 'Any fried donut that has been through a glazer, whatever flavour.';
    if (f.named) return 'Any exact combination from the recipe book — hover one there to see what it takes.';
    if (f.silly) return `Anything with ${Object.keys(TOPS).filter((t) => TOPS[t].silly).map((t) => TOPS[t].short.toLowerCase()).join(', ')} on top.`;
    if (f.stage === 'donut') return 'Dough, then a ring press, then a fryer, then the counter.';
    return '';
  }
  function updateGoalBars() {
    const els = document.querySelectorAll('.goal');
    goals.forEach((g, i) => {
      const el = els[i]; if (!el) return;
      el.querySelector('i').style.width = `${Math.min(100, g.count / g.n * 100)}%`;
      el.querySelector('.count').textContent = goalCount(g);
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
  // Which machine has to be set to what, in the order a donut meets them.
  function recipeSteps(r) {
    const rows = [
      { k: 'Fryer', v: 'A fried donut to start with (mixer, press, fryer).', ok: true },
      { k: 'Glazer', v: r.glaze ? GLAZES[r.glaze].name : 'None — leave the glaze off entirely.', ok: !r.glaze || unlocked.glazes.includes(r.glaze) },
      { k: 'Filler', v: r.filling ? FILLINGS[r.filling].name : 'None — nothing in the middle.', ok: !r.filling || unlocked.fillings.includes(r.filling) },
    ];
    if (r.tops.length) {
      for (const t of r.tops) rows.push({ k: rows.some((x) => x.k === 'Topper') ? 'and' : 'Topper', v: TOPS[t].name, ok: unlocked.tops.includes(t) });
    } else {
      rows.push({ k: 'Topper', v: 'None — nothing on top.', ok: true });
    }
    return rows;
  }
  function recipeTip(r, known) {
    const parts = [`<div class="t-name">${known ? r.name : 'An undiscovered recipe'}</div>`];
    for (const row of recipeSteps(r)) {
      parts.push(`<div class="t-row"><span class="k">${row.k}</span><span class="v"${row.ok ? '' : ' style="opacity:.6"'}>${row.v}${row.ok ? '' : ' (locked)'}</span></div>`);
    }
    parts.push(`<div class="t-row"><span class="k">Pays</span><span class="v">${pence(recipeValue(r))}, against ${pence(VALUE.donut + (r.glaze ? VALUE.glaze : 0) + (r.filling ? VALUE.filling : 0) + r.tops.length * VALUE.top)} for the same donut unnamed.</span></div>`);
    if (!recipeCraftable(r)) parts.push(`<div class="t-locked">Something in this is still locked — fill more orders.</div>`);
    else if (!known) parts.push(`<div class="t-foot">Everything for it is in the cupboard. Sell one to add it to the book.</div>`);
    if (known && r.quip) parts.push(`<div class="t-foot">${r.quip}</div>`);
    return parts.join('');
  }

  // ---------- floating tooltip ----------
  const TIPS = new Map();
  let tipEl = null, tipKey = null;
  function tipNode() {
    if (!tipEl) {
      tipEl = document.createElement('div');
      tipEl.id = 'tip';
      tipEl.hidden = true;
      document.body.appendChild(tipEl);
    }
    return tipEl;
  }
  function showTip(el, html, key) {
    const n = tipNode();
    tipKey = key || null;
    n.innerHTML = html;
    n.hidden = false;
    const r = el.getBoundingClientRect(), box = n.getBoundingClientRect();
    let left = r.left - box.width - 10;
    if (left < 8) left = Math.min(r.right + 10, window.innerWidth - box.width - 8);
    n.style.left = `${Math.max(8, left)}px`;
    n.style.top = `${Math.max(8, Math.min(r.top, window.innerHeight - box.height - 8))}px`;
  }
  function hideTip() { tipKey = null; if (tipEl) tipEl.hidden = true; }
  // The side panel redraws as donuts sell; put the tooltip back on its row.
  function reanchorTip() {
    if (!tipKey) return;
    const row = document.querySelector(`[data-tip="${tipKey}"]`);
    const html = TIPS.get(tipKey);
    if (row && html) showTip(row, html, tipKey); else hideTip();
  }
  function recipesTab() {
    const parts = [];
    parts.push(`<p class="hint">A plain donut is ${pence(VALUE.donut)}. Glaze adds ${pence(VALUE.glaze)}, a filling ${pence(VALUE.filling)}, each topping ${pence(VALUE.top)}. Exact named recipes pay half again. A second trip through a station changes a donut: a double-fried donut is charred, a second squirt of filling is worth a couple of pence at most, and topper runs past the two-topping cap tip the price a little. Blobs, charcoal and raw dough pay very little and get comments.</p>`);
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
    TIPS.clear();
    for (const r of sorted) {
      const known = discovered.has(r.id);
      const can = recipeCraftable(r);
      const isSpec = special && special.id === r.id && level >= SPECIAL_FROM_LEVEL;
      TIPS.set(r.id, recipeTip(r, known || isSpec));
      if (known) {
        parts.push(`<div class="recipe${isSpec ? ' special-now' : ''}" data-tip="${r.id}"><canvas width="68" height="68" data-recipe="${r.id}"></canvas><div class="grow"><div class="name">${r.name}<span class="val">${pence(recipeValue(r))}${isSpec ? ' ×2' : ''}</span></div><div class="parts">${recipeParts(r)}</div><div class="quip">${r.quip}</div></div></div>`);
      } else {
        const n = 1 + (r.filling ? 1 : 0) + r.tops.length;
        const hint = can ? `${n} thing${n > 1 ? 's' : ''} on a donut. Hover for the recipe.` : `Needs something you have not unlocked yet.`;
        parts.push(`<div class="recipe unknown${isSpec ? ' special-now' : ''}" data-tip="${r.id}"><canvas width="68" height="68" data-recipe="${isSpec ? r.id : ''}"></canvas><div class="grow"><div class="name">${isSpec ? r.name : '? ? ?'}<span class="val">${pence(recipeValue(r))}${isSpec ? ' ×2' : ''}</span></div><div class="parts">${isSpec ? recipeParts(r) : hint}</div>${isSpec ? '<div class="quip">The special. The board tells you how.</div>' : ''}</div></div>`);
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
      const jam = tileStuck(selected.c, selected.r);
      b.innerHTML = `<div class="title"><span class="ico">➡️</span>Belt</div><span class="muted">Facing ${['right', 'down', 'left', 'up'][t.dir]}. ${t.items.length ? `${t.items.length} on it.` : 'Empty.'}</span>${jam ? `<span class="warn">Stuck: ${blockText(jam)}</span>` : ''}<span class="spacer"></span><button type="button" class="tiny" data-act="rotate">Turn</button><button type="button" class="tiny" data-act="remove">Take back (${pence(refundOf(t))})</button>`;
      return;
    }
    const def = MACHINES[t.type];
    const parts = [`<div class="title"><span class="ico">${def.ico}</span>${def.name}</div>`];
    if (def.cfgKind === 'glaze') parts.push(`<div class="group"><span>Glaze</span>${unlocked.glazes.map((g) => `<button type="button" class="chip${t.cfg === g ? ' active' : ''}" data-cfg="${g}"><span class="sw" style="background:${GLAZES[g].col}"></span>${GLAZES[g].name} <small>${GLAZES[g].cost}p</small></button>`).join('')}</div>`);
    if (def.cfgKind === 'fill') parts.push(`<div class="group"><span>Filling</span>${unlocked.fillings.map((f) => `<button type="button" class="chip${t.cfg === f ? ' active' : ''}" data-cfg="${f}"><span class="sw" style="background:${FILLINGS[f].col}"></span>${FILLINGS[f].name} <small>${FILLINGS[f].cost}p</small></button>`).join('')}</div>`);
    if (def.cfgKind === 'batch') parts.push(`<div class="group"><span>Recipe</span>${unlocked.batches.map((x) => `<button type="button" class="chip${t.cfg === x ? ' active' : ''}" data-cfg="${x}" title="${BATCHES[x].mix}">${BATCHES[x].name}</button>`).join('')}<span class="muted">${BATCHES[t.cfg] ? BATCHES[t.cfg].mix : ''}</span></div>`);
    if (def.cfgKind === 'top') parts.push(`<div class="group"><span>Topping</span>${unlocked.tops.map((x) => `<button type="button" class="chip${t.cfg === x ? ' active' : ''}" data-cfg="${x}"><span class="em">${TOPS[x].ico || '•'}</span>${TOPS[x].name} <small>${TOPS[x].cost}p</small></button>`).join('')}</div>`);
    if (!def.sink) {
      const pips = Array.from({ length: MAX_LVL }, (_, i) => `<span class="pip${i < t.lvl ? ' on' : ''}"></span>`).join('');
      const rate = def.source ? `one every ${procTime(t).toFixed(1)}s` : `${procTime(t).toFixed(1)}s each`;
      parts.push(`<div class="group"><span>Speed</span><span class="pip-row">${pips}</span><span class="muted">${rate}</span>${t.lvl < MAX_LVL ? `<button type="button" class="tiny" data-act="upgrade" ${canAfford(upgradeCost(t)) ? '' : 'disabled'}>Tune up (${money(upgradeCost(t))})</button>` : '<span class="muted">Fully tuned.</span>'}</div>`);
    }
    if (t.stuck > STUCK_AFTER && HARD_BLOCK[t.why]) parts.push(`<span class="warn">Stuck: ${blockText(t.why)}</span>`);
    if (t.type === 'counter') parts.push(`<span class="muted">Sells whatever arrives, from any side. ${countMachines('counter')} tills, all in one bank.</span>`);
    if (t.type === 'joiner') parts.push(`<span class="muted">Takes turns between the back and both sides, so one busy line cannot hog it.</span>`);
    parts.push(`<span class="muted">Drag it on the floor to move it.</span>`);
    if (t.type === 'bin') parts.push(`<span class="muted">${binned} thing${binned === 1 ? '' : 's'} binned so far.</span>`);
    parts.push(`<span class="spacer"></span>`);
    if (!def.sink) parts.push(`<button type="button" class="tiny" data-act="rotate">Turn</button>`);
    parts.push(`<button type="button" class="tiny" data-act="remove">Take back (${pence(refundOf(t))})</button>`);
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
    if (g) { selected = { c: t.c, r: t.r }; drag = { from: t, at: t, moved: false }; } else { selected = null; drag = null; }
    dirty();
  });
  canvas.addEventListener('pointermove', (e) => {
    const t = tileAt(e);
    hover = t;
    if (drag) {
      // dragging off the floor puts it back where it came from
      const to = t || drag.from;
      if (to.c !== drag.at.c || to.r !== drag.at.r) {
        drag.at = to;
        drag.moved = !(to.c === drag.from.c && to.r === drag.from.r);
        dirty();
      }
      return;
    }
    if (!painting || !t || !lastPaint) return;
    if (t.c === lastPaint.c && t.r === lastPaint.r) return;
    const dc = t.c - lastPaint.c, dr = t.r - lastPaint.r;
    if (Math.abs(dc) + Math.abs(dr) !== 1) { lastPaint = t; return; }   // jumped; just carry on from here
    const d = dc === 1 ? 0 : dr === 1 ? 1 : dc === -1 ? 2 : 3;
    const prev = grid[lastPaint.r][lastPaint.c];
    if (prev && prev.kind === 'belt') prev.dir = d;
    toolDir = d;
    placeBelt(t.c, t.r, d, true);
    lastPaint = t;
  });
  const stopPaint = () => {
    painting = false; lastPaint = null;
    if (drag) {
      if (drag.moved) moveTile(drag.from, drag.at);
      drag = null;
      dirty();
    }
  };
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
  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
  function setTab(name) {
    tab = name;
    document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('active', x.dataset.tab === name));
    hideTip();
    renderSide();
  }
  // The level box in the header opens the order board.
  const levelBox = $('hud-level-wrap');
  levelBox.addEventListener('click', () => setTab('goals'));
  levelBox.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setTab('goals'); } });

  // Hovering a recipe in the book spells out what goes into it.
  const sideBody = $('side-body');
  sideBody.addEventListener('mouseover', (e) => {
    const row = e.target.closest('[data-tip]');
    if (!row) return;
    const html = TIPS.get(row.dataset.tip);
    if (html) showTip(row, html, row.dataset.tip);
  });
  sideBody.addEventListener('mouseout', (e) => {
    if (!e.relatedTarget || !e.relatedTarget.closest || !e.relatedTarget.closest('[data-tip]')) hideTip();
  });
  sideBody.addEventListener('scroll', reanchorTip);
  sideBody.addEventListener('mouseleave', hideTip);
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
      cash = s.cash; level = Math.max(0, s.level | 0); sold = s.sold || 0; binned = s.binned || 0; simTime = s.simTime || 0;
      discovered = new Set(s.discovered || []);
      unlocked = s.unlocked || unlocked;
      for (const k of ['machines', 'glazes', 'tops', 'fillings']) if (!unlocked[k]) unlocked[k] = [];
      if (!unlocked.batches) unlocked.batches = ['dough'];
      unlocked.machines = unlocked.machines.map((m) => (m === 'hopper' ? 'mixer' : m));
      for (const m of ['mixer', 'splitter', 'joiner']) if (!unlocked.machines.includes(m)) unlocked.machines.push(m);
      special = s.special || null;
      goals = makeGoals(level);
      (s.goals || []).forEach((g, i) => { if (goals[i]) { goals[i].count = g.count; goals[i].kinds = new Set(g.kinds || []); } });
      for (const t of s.tiles || []) {
        if (t.k === 'b') grid[t.r][t.c] = newBelt(t.d);
        else {
          const type = t.t === 'hopper' ? 'mixer' : t.t;
          if (!MACHINES[type]) continue;
          const m = newMachine(type, t.d);
          if (t.cfg && MACHINES[type].cfgKind) m.cfg = t.cfg;
          m.lvl = t.lvl || 0;
          grid[t.r][t.c] = m;
        }
      }
      return true;
    } catch (e) { return false; }
  }
  window.addEventListener('beforeunload', save);

  function welcome() {
    overlay('Welcome to Donut Works', `
      <p>You have a bare floor, <b>${money(START_CASH)}</b> and an order from the shop out front for ten donuts.</p>
      <p>A <b>Mixer</b> plops out dough. A <b>Ring Press</b> punches the hole. A <b>Fryer</b> cooks it. A <b>Shop Counter</b> sells it. Join them with <b>belts</b>, watch the arrows, and the money looks after itself.</p>
      <p>A <b>Splitter</b> and a <b>Joiner</b> are yours from the off, for when one line wants to be three and then one again. Drag anything on the floor to move it. Fill orders to unlock glazers, toppers and fillers, then find out what happens when you put a whole pickle on a donut.</p>`,
      [{ label: 'How to play', fn: () => { $('help').hidden = false; } }, { label: 'Open the factory', primary: true }]);
  }

  // ---------- boot ----------
  try { soundOn = localStorage.getItem(SOUND_KEY) === '1'; } catch (e) { /* ignore */ }
  $('btn-sound').textContent = `Sound: ${soundOn ? 'on' : 'off'}`;
  $('btn-sound').setAttribute('aria-pressed', String(soundOn));
  if (!load()) { freshState(); welcome(); }
  renderSide(); renderBench();
  requestAnimationFrame(frame);

  // Small hook for smoke tests.
  window.__donut = {
    state: () => ({ cash, level, sold, goals, unlocked, discovered, special }),
    levelDef, LEVELS, RECIPES, GLAZES, FILLINGS, TOPS, MYSTERIES,
    setLevel: (i) => { level = i; goals = makeGoals(level); renderSide(); },
    grant: (n) => { cash += n; renderSide(); },
    sellFake: (it) => sell(it, 0, 0),
    valueOf,
  };
})();
