/* Donut Works: the rules. A small donut factory: machines and belts on a grid, dough goes
   in one end and money comes out the other.

   Nothing here touches the page. view.js draws the painted room and feeds clicks in;
   test/donut-works/*.node.js run lines in Node.

     const f = createFactory({ saved, rnd, on })
       saved   a previous f.serialize()
       rnd     the dice ([0, 1)); Math.random by default
       on      on(event, data):
                 'sale'      { c, r, total, quip, good }   something was sold at a counter
                 'note'      { text, c, r, col, life }     a remark to float over a tile
                 'refund'    { c, r, amount }
                 'sfx'       kind ('place', 'tick', 'bad', 'level')
                 'level-up'  the order just filled
                 'changed'   anything the side panel or bench shows has moved */

// ---------- constants ----------
export const COLS = 12, ROWS = 8, T = 60;
export const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];
const SPACING = 0.42;          // minimum gap between items on a belt, in tiles
export const BELT_SPEED = 1.1; // tiles per second
export const START_CASH = 1500;       // pence
const DOUGH_COST = 5;
export const CASH_FLOOR = -300;       // the hopper stops when you are this far in the red
export const MAX_TOPS = 2;
const SPECIAL_LENGTH = 90;     // seconds a special stays on the board
export const SPECIAL_FROM_LEVEL = 2;  // index into LEVELS
export const STUCK_AFTER = 1.2;       // seconds truly blocked before we flag it
export const SIM_STEP = 1 / 30;

export const GLAZES = {
  sugar: { name: 'Sugar glaze', short: 'Sugar', col: '#fbf1dc', edge: '#e6d3ad', cost: 4 },
  pink: { name: 'Pink glaze', short: 'Pink', col: '#f48fb1', edge: '#d8648f', cost: 4 },
  choc: { name: 'Chocolate', short: 'Choc', col: '#5b3a1e', edge: '#3e2712', cost: 5 },
  maple: { name: 'Maple', short: 'Maple', col: '#c8843a', edge: '#a3642a', cost: 5 },
  blue: { name: 'Bubblegum blue', short: 'Blue', col: '#5fb8e8', edge: '#3a8fc0', cost: 6 },
  lemon: { name: 'Lemon curd', short: 'Lemon', col: '#f2dd63', edge: '#c9b333', cost: 6 },
  mint: { name: 'Mint', short: 'Mint', col: '#a7ddb8', edge: '#6fae85', cost: 6 },
  licorice: { name: 'Liquorice', short: 'Liquorice', col: '#2f2b33', edge: '#161418', cost: 7 },
};
export const FILLINGS = {
  jam: { name: 'Jam', short: 'Jam', col: '#c8323c', cost: 8 },
  custard: { name: 'Custard', short: 'Custard', col: '#f2c94c', cost: 8 },
  beans: { name: 'Baked beans', short: 'Beans', col: '#d9622b', cost: 5, silly: true },
  mystery: { name: 'Mystery filling', short: 'Mystery', col: '#8a5cc4', cost: 10, silly: true },
  cream: { name: 'Clotted cream', short: 'Cream', col: '#f7efd8', cost: 9 },
  marmite: { name: 'Marmite', short: 'Marmite', col: '#3b2410', cost: 6, silly: true },
};
export const MYSTERIES = [
  'spaghetti', 'a small coin', 'more donut', 'a single sock', 'existential dread',
  'gravy', 'confetti', 'a note that just says "hi"', 'lukewarm soup', 'marbles (do not eat)',
  'a second, smaller donut', 'mashed potato', 'the colour blue', 'jelly and a fork',
  'a receipt for a different donut', 'wasps (asleep)', 'the sound of a fridge',
  'somebody’s house keys', 'unset custard, and regret', 'a very small library',
  'Tuesday', 'three peas in a line', 'warm lemonade', 'a folded map of nowhere',
  'the inside of another donut', 'a promise you made', 'gravel, sorry, granola',
  'one (1) crouton', 'a tooth. not yours.', 'the smell of a swimming pool',
  'a smaller sock', 'an apology, laminated', 'weather', 'half a conversation',
];
// draw: procedural (sprinkles, chips, cereal) or an emoji
export const TOPS = {
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
export const RECIPES = [
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
export const VALUE = { donut: 50, blob: 25, charcoal: 5, raw: 2, glaze: 30, filling: 35, top: 25 };

// What the Mixer can make. One for now; the machine is built to take more.
export const BATCHES = {
  dough: { name: 'Dough', short: 'Dough', stage: 'dough', cost: DOUGH_COST, mix: 'Flour, sugar, yeast, a splash of milk.' },
};

export const MACHINES = {
  mixer: { name: 'Mixer', cost: 200, time: 2.5, col: '#efe0c4', source: true, cfgKind: 'batch', desc: 'Mixes a batch and plops out one at a time. Click it to pick what goes in.' },
  press: { name: 'Ring Press', cost: 250, time: 1.5, col: '#d3dbe2', desc: 'Punches the hole. Dough in, ring out.' },
  fryer: { name: 'Fryer', cost: 400, time: 4, col: '#dcd6cc', desc: 'Rings in, donuts out. Slow. Fries anything it is given, for better or worse.' },
  splitter: { name: 'Splitter', cost: 500, time: 0.15, col: '#e7d3b2', desc: 'Takes one line and deals it out left, ahead and right, wherever there is room.' },
  joiner: { name: 'Joiner', cost: 500, time: 0.15, col: '#e7d3b2', join: true, desc: 'The other way round: takes lines in from the back and both sides and feeds them onto one, taking turns so nobody hogs it.' },
  glazer: { name: 'Glazer', cost: 600, time: 2, col: '#f2cfdd', cfgKind: 'glaze', desc: 'Dips fried donuts in glaze. Click it to pick the flavour.' },
  topper: { name: 'Topper', cost: 800, time: 2, col: '#c8ddc9', cfgKind: 'top', desc: 'Drops a topping on. Two per donut at most. Click it to choose.' },
  filler: { name: 'Filler', cost: 1000, time: 2.5, col: '#f0e2bb', cfgKind: 'fill', desc: 'Squirts something into the middle. One filling per donut.' },
  counter: { name: 'Shop Counter', cost: 100, time: 0, col: '#bcd7c9', omni: true, sink: true, group: true, desc: 'Sells whatever arrives, from any side. The shop front is one bank of tills, so each counter has to touch another one.' },
  bin: { name: 'Bin', cost: 100, time: 0, col: '#d2ccc5', omni: true, sink: true, desc: 'Eats anything. Handy for mistakes and overflow.' },
};
export const BELT_COST = 10;
export const MAX_LVL = 3;

export const LEVELS = [
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
    hint: 'Every filled donut counts, whatever is in it. A filler is slow — two of them fed by a splitter beats one working twice as hard.',
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
    unlock: { glazes: ['licorice'], tops: ['candle', 'crown'] }, bonus: 5000,
    hint: 'Eight kinds means eight configurations. A splitter feeds three lines; a splitter into a splitter feeds five.',
  },
  {
    name: 'The Wedding', who: 'A wedding, obviously',
    blurb: 'Sixteen Coronations. Liquorice, cream, a paper crown and glitter. It is a themed wedding.',
    goals: [{ n: 16, filter: { recipe: 'coronation' }, label: 'Sell 16 Coronations' }],
    unlock: {}, bonus: 5500,
    hint: 'Glazer, filler, topper, topper, in any order after the fryer. Every one of those is two seconds, so the line is only as quick as its slowest four.',
  },
  {
    name: 'Quality Street', who: 'The accountant',
    blurb: 'I have looked at the books. We are selling a great many cheap donuts. Sell dear ones instead.',
    goals: [{ n: 40, filter: { worth: 160 }, label: 'Sell 40 donuts worth £1.60 or more' }],
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
export const levelDef = (i) => (i < LEVELS.length ? LEVELS[i] : standingOrder(i));

const QUIPS = {
  raw: ['That is... raw.', 'Is this a joke?', 'I can see the flour.', 'Ew.'],
  charcoal: ['Is this a coaster?', 'It is still smoking.', 'Bold.', 'I will take it for the cat.'],
  blob: ['Where is the hole?', 'A donut ball. Sure.', 'Round enough.', 'Bit lumpy.'],
  plain: ['Fine.', 'Yep.', 'Classic.', 'Ta.', 'A donut. Lovely.'],
  nice: ['Ooh!', 'Yes please.', 'Lovely.', 'I will take twelve.', 'That is the one.'],
  silly: ['Is that... bacon?', 'I have questions.', 'Why is it looking at me?', 'Brave.', 'My dentist will hear about this.', 'Say nothing.'],
  recipe: ['Oh, the good one!', 'That is the stuff.', 'Finally.', 'Two, actually.'],
};

// DW-3: taking a thing back only ever returns a fraction of what you put in.
const REFUND_RATE = 0.5;
// DW-4: what a second trip through a station does to a donut. Every value
// lives here so the tuning can breathe without touching the per-donut code.
const DOUBLE_PASS = {
  fry: { from: 2, stage: 'charcoal' },   // a cooked donut's second fry chars it, visibly
  fill: { from: 2, bonus: 2 },           // a second squirt is free and barely moves the value
  top: { bonus: 4 },                     // past the two-topping cap, each extra trip tips the price a little
};

// ---------- items (pure) ----------
export function isFried(it) { return it.stage === 'donut' || it.stage === 'blob'; }
const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
export function matchRecipe(it) {
  if (it.stage !== 'donut') return null;
  return RECIPES.find((r) => r.glaze === it.glaze && r.filling === it.filling && sameSet(r.tops, it.tops)) || null;
}
export function hasSilly(it) {
  return it.tops.some((t) => TOPS[t].silly) || (it.filling && FILLINGS[it.filling].silly);
}
export function recipeValue(r) {
  const v = VALUE.donut + (r.glaze ? VALUE.glaze : 0) + (r.filling ? VALUE.filling : 0) + r.tops.length * VALUE.top;
  return Math.round(v * RECIPE_MULT);
}
export function procTime(m) { return MACHINES[m.type].time * Math.pow(0.75, m.lvl); }
export function upgradeCost(m) { return Math.round(MACHINES[m.type].cost * 0.6 * (m.lvl + 1)); }
function upgradeSpent(m) { let s = 0; for (let i = 0; i < m.lvl; i++) s += Math.round(MACHINES[m.type].cost * 0.6 * (i + 1)); return s; }
// take-back returns only a fraction of what the thing cost, belts at the same rate as machines
export function refundOf(t) {
  return t.kind === 'belt'
    ? Math.round(BELT_COST * REFUND_RATE)
    : Math.round((MACHINES[t.type].cost + upgradeSpent(t)) * REFUND_RATE);
}
export function goalDone(g) { return g.count >= g.n && (!g.distinct || g.kinds.size >= g.distinct); }
export function makeGoals(li) {
  const L = levelDef(li);
  if (!L) return [];
  return L.goals.map((g) => ({ ...g, count: 0, kinds: new Set() }));
}
export function newBelt(dir) { return { kind: 'belt', dir, items: [] }; }

// Why a thing cannot move on. 'busy' is an ordinary queue and clears itself;
// every other answer never will, and is what the player needs telling about.
export const HARD_BLOCK = { edge: true, dead: true, wrongbelt: true, wrongmachine: true, nointake: true };
const BLOCK_TEXT = {
  edge: 'The floor runs out here.',
  dead: 'Nothing ahead to take it. Lay a belt, or a machine facing away.',
  wrongbelt: 'The belt ahead runs the other way. Give it a turn.',
  wrongmachine: 'That machine pushes out this way. Turn it, or feed it from behind.',
  nointake: 'That one only makes things, it does not take them.',
};
export function blockText(why) { return BLOCK_TEXT[why] || 'Waiting for the next machine.'; }

// the quarter turn a bend belt makes, in tile-local coordinates (pure geometry, shared
// with the view, which draws belts with it)
export function bendGeom(dir, s) {
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

// ---------- the factory ----------
export function createFactory({ saved = null, rnd = Math.random, on = () => {} } = {}) {
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  let grid, cash, level, goals, sold, discovered, unlocked, special, simTime, saleLog, binned;
  let topoDirty = true, bendCache = null;

  function fresh() {
    grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    cash = START_CASH; level = 0; sold = 0; binned = 0; simTime = 0;
    discovered = new Set(); saleLog = [];
    unlocked = { machines: ['mixer', 'press', 'fryer', 'splitter', 'joiner', 'counter', 'bin'], glazes: [], tops: [], fillings: [], batches: ['dough'] };
    special = null;
    goals = makeGoals(level);
    topoDirty = true;
  }
  function changed() { topoDirty = true; on('changed'); }

  function defaultCfg(type) {
    const k = MACHINES[type].cfgKind;
    if (k === 'glaze') return unlocked.glazes[0] || 'sugar';
    if (k === 'top') return unlocked.tops[0] || 'sprinkles';
    if (k === 'fill') return unlocked.fillings[0] || 'jam';
    if (k === 'batch') return unlocked.batches[0] || 'dough';
    return null;
  }
  function newMachine(type, dir) {
    return { kind: 'machine', type, dir, cfg: defaultCfg(type), lvl: 0, inBuf: null, ins: [null, null, null], cur: null, outBuf: null, t: 0, rr: 0, anim: 0, stuck: 0, why: null };
  }
  function makeBatch(id) {
    const b = BATCHES[id] || BATCHES.dough;
    return { stage: b.stage, glaze: null, filling: null, tops: [], note: null, fillVal: 0, passes: { fry: 0, fill: 0, top: 0 } };
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
  function recipeCraftable(r) {
    return (!r.glaze || unlocked.glazes.includes(r.glaze)) &&
      (!r.filling || unlocked.fillings.includes(r.filling)) &&
      r.tops.every((t) => unlocked.tops.includes(t));
  }

  // ---------- belt shape ----------
  // A belt fed only from one side reads far better as a corner piece than as a straight
  // run with donuts popping into being halfway along it. Which shape a belt is depends on
  // its neighbours, so it is worked out once per change.
  function feedsInto(c, r, s) {
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

  // ---------- machine processing ----------
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
          top = pool.length ? pool[Math.floor(rnd() * pool.length)] : null;
        }
        if (top && TOPS[top] && !it.tops.includes(top)) { it.tops.push(top); cash -= TOPS[top].cost; }
        break;
      }
      case 'filler':
        it.passes.fill++;
        if (isFried(it) && !it.filling && FILLINGS[cfg]) {
          it.filling = cfg; cash -= FILLINGS[cfg].cost;
          if (cfg === 'mystery') {
            it.note = MYSTERIES[Math.floor(rnd() * MYSTERIES.length)];
            it.fillVal = 5 + Math.floor(rnd() * 80);
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
  // A joiner keeps one slot per way in (back, left, right) so a busy line cannot sit in
  // the doorway and starve the other two.
  function joinSlot(m, travelDir) {
    if (travelDir === m.dir) return 0;
    if (travelDir === (m.dir + 1) % 4) return 1;
    if (travelDir === (m.dir + 3) % 4) return 2;
    return -1;
  }
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
    saleLog = saleLog.filter((t) => t > simTime - 60);
  }
  // Advance by `sec` seconds in fixed steps.
  function step(sec) {
    let remain = sec;
    while (remain > 1e-9) { const s = Math.min(remain, SIM_STEP); simulate(s); remain -= s; }
  }
  function rollSpecial() {
    const pool = RECIPES.filter((r) => recipeCraftable(r) && (!special || r.id !== special.id));
    if (!pool.length) { special = null; return; }
    const r = pool[Math.floor(rnd() * pool.length)];
    special = { id: r.id, until: simTime + SPECIAL_LENGTH };
    on('changed');
  }

  // ---------- selling ----------
  function sell(it, c, r) {
    const { total, recipe } = valueOf(it);
    cash += total; sold++;
    saleLog.push(simTime);
    if (recipe && !discovered.has(recipe.id)) { discovered.add(recipe.id); on('note', { text: `New recipe: ${recipe.name}!`, c, r, col: '#e0568a', life: 2.6 }); }
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
    if (it.filling === 'mystery' && rnd() < 0.5) quip = `Is this ${it.note}?`;
    on('sale', { c, r, total, quip, good: total >= VALUE.donut });
    checkLevel();
    changed();
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
  function checkLevel() {
    if (!goals.length || !goals.every(goalDone)) return;
    const L = levelDef(level);
    cash += L.bonus;
    const u = L.unlock || {};
    for (const k of ['machines', 'glazes', 'tops', 'fillings']) for (const x of u[k] || []) if (!unlocked[k].includes(x)) unlocked[k].push(x);
    level++;
    goals = makeGoals(level);
    if (level >= SPECIAL_FROM_LEVEL && !special) rollSpecial();
    on('sfx', 'level');
    on('level-up', L);
  }

  // ---------- building ----------
  const canAfford = (cost) => cash >= cost;
  const isCounter = (t) => !!t && t.kind === 'machine' && MACHINES[t.type].group;
  // The shop front is one bank of tills, not counters dotted all over the floor: a
  // counter may only go down touching one that is already there. `ignore` is the counter
  // being picked up, when one is on the move.
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
  const refuse = (text, c, r) => { on('note', { text, c, r, col: '#b8483a' }); on('sfx', 'bad'); return false; };
  // pick a thing up and put it down somewhere else; two things swap places. True if it moved.
  function moveTile(from, to) {
    if (from.c === to.c && from.r === to.r) return false;
    const a = grid[from.r][from.c];
    if (!a) return false;
    const b = grid[to.r][to.c];
    // two counters swapping leaves the shop front exactly as it was; one on its own has to
    // land next to its neighbours
    if (isCounter(a) && !isCounter(b) && !counterOk(to.c, to.r, from)) return refuse('Counters stay together', to.c, to.r);
    if (isCounter(b) && !isCounter(a) && !counterOk(from.c, from.r, to)) return refuse('Counters stay together', from.c, from.r);
    grid[from.r][from.c] = b || null;
    grid[to.r][to.c] = a;
    on('sfx', 'place');
    changed();
    return true;
  }
  function placeMachine(c, r, type, dir) {
    const def = MACHINES[type];
    if (!unlocked.machines.includes(type)) return false;
    if (def.group && !counterOk(c, r)) return refuse('Next to the other counters', c, r);
    if (!canAfford(def.cost)) return refuse('Not enough cash', c, r);
    // DW-2: placing over an occupied tile removes what is there, refunded the same way a
    // take-back would be.
    if (grid[r][c]) removeTile(c, r);
    cash -= def.cost;
    grid[r][c] = newMachine(type, dir);
    on('sfx', 'place');
    changed();
    return true;
  }
  function placeBelt(c, r, dir, paint) {
    const t = grid[r][c];
    if (t && t.kind === 'belt') { t.dir = dir; changed(); return true; }
    if (t && t.kind === 'machine') {
      // painting a run never swallows machines; an explicit click does, the same
      // replacement-and-refund as placing a machine over one
      if (paint) return false;
      if (!canAfford(BELT_COST)) return refuse('Not enough cash', c, r);
      removeTile(c, r);
    }
    if (grid[r][c]) return false;
    if (!canAfford(BELT_COST)) return refuse('Not enough cash', c, r);
    cash -= BELT_COST;
    grid[r][c] = newBelt(dir);
    on('sfx', 'tick');
    changed();
    return true;
  }
  function removeTile(c, r) {
    const t = grid[r][c];
    if (!t) return;
    const refund = refundOf(t);
    cash += refund;
    grid[r][c] = null;
    on('sfx', 'tick');
    if (refund > 0) on('refund', { c, r, amount: refund });
    changed();
  }
  function upgrade(m) {
    if (m.lvl >= MAX_LVL) return;
    const cost = upgradeCost(m);
    if (!canAfford(cost)) { on('sfx', 'bad'); return; }
    cash -= cost; m.lvl++;
    on('sfx', 'place');
    changed();
  }
  function rotate(c, r) {
    const t = grid[r] && grid[r][c];
    if (!t || (t.kind === 'machine' && MACHINES[t.type].sink)) return;
    t.dir = (t.dir + 1) % 4;
    changed();
  }
  function setCfg(c, r, cfg) {
    const t = grid[r] && grid[r][c];
    if (!t || t.kind !== 'machine') return;
    t.cfg = cfg;
    on('sfx', 'tick');
    changed();
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
  function countMachines(type) {
    let n = 0;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const t = grid[r][c];
      if (t && t.kind === 'machine' && t.type === type) n++;
    }
    return n;
  }

  // ---------- save / load ----------
  function serialize() {
    const tiles = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const t = grid[r][c];
      if (!t) continue;
      if (t.kind === 'belt') tiles.push({ c, r, k: 'b', d: t.dir });
      else tiles.push({ c, r, k: 'm', t: t.type, d: t.dir, cfg: t.cfg, lvl: t.lvl });
    }
    return {
      tiles, cash, level, sold, binned, simTime,
      goals: goals.map((g) => ({ count: g.count, kinds: [...g.kinds] })),
      discovered: [...discovered], unlocked, special,
    };
  }
  function restore(s) {
    fresh();
    cash = s.cash; level = Math.max(0, s.level | 0); sold = s.sold || 0; binned = s.binned || 0; simTime = s.simTime || 0;
    discovered = new Set(s.discovered || []);
    unlocked = s.unlocked || unlocked;
    for (const k of ['machines', 'glazes', 'tops', 'fillings']) if (!unlocked[k]) unlocked[k] = [];
    if (!unlocked.batches) unlocked.batches = ['dough'];
    unlocked.machines = unlocked.machines.map((m) => (m === 'hopper' ? 'mixer' : m));
    for (const m of ['mixer', 'splitter', 'joiner']) if (!unlocked.machines.includes(m)) unlocked.machines.push(m);
    // and everything the levels already passed hand out, in case an unlock has moved to an
    // earlier level since this was saved (the crown did, or The Wedding could never be done)
    for (let i = 0; i < level; i++) {
      const u = levelDef(i).unlock || {};
      for (const k of ['machines', 'glazes', 'tops', 'fillings']) for (const x of u[k] || []) if (!unlocked[k].includes(x)) unlocked[k].push(x);
    }
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
    topoDirty = true;
  }

  fresh();
  let loaded = false;
  if (saved) { try { restore(saved); loaded = true; } catch (e) { fresh(); } }

  return {
    get grid() { return grid; }, get cash() { return cash; }, set cash(v) { cash = v; },
    get level() { return level; }, get goals() { return goals; }, get sold() { return sold; }, get binned() { return binned; },
    get discovered() { return discovered; }, get unlocked() { return unlocked; }, get special() { return special; },
    get simTime() { return simTime; }, get perMinute() { return saleLog.length; }, loaded,
    setLevel(i) { level = i; goals = makeGoals(level); on('changed'); },
    fresh() { fresh(); on('changed'); },
    simulate, step, valueOf, recipeCraftable, sell,
    placeMachine, placeBelt, removeTile, moveTile, upgrade, rotate, setCfg,
    counterOk, canAfford, bendAt, tileStuck, countMachines, newMachine,
    serialize, restore,
    state: () => ({ cash, level, sold, goals, unlocked, discovered, special }),
  };
}
