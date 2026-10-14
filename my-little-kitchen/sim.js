/* My Little Kitchen: the rules. What each recipe needs and the order it is made in, the
   state of the one thing being made, and how many of each you have made. No page access,
   so a whole bake can be played in Node:

     const kit = createKitchen({ counts, on })
       counts  how many of each recipe you have made (readCounts(get) loads them)
       on      on(event, data): 'save' recipe id (a count went up)

   The state is kit.state, a plain object (kit.state = kit.freshState() starts over). The
   recipes name their icons ('cakeCard'); the page swaps in the drawings. */

// ---------- constants ----------
export const BITES = 6;                 // bites to finish anything
const COUNT_KEY = (id) => 'mlk-count-' + id;

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const hex = (c) => c.match(/\w\w/g).map((h) => parseInt(h, 16));
export const mixHex = (a, b, t) => {
  const A = hex(a), B = hex(b);
  return '#' + A.map((v, i) => Math.round(lerp(v, B[i], t)).toString(16).padStart(2, '0')).join('');
};
export const listWords = (arr) => arr.length < 2 ? arr.join('') : arr.slice(0, -1).join(', ') + ' and ' + arr[arr.length - 1];

export const INGREDIENTS = {
  flour: { name: 'Flour' },
  sugar: { name: 'Sugar' },
  eggs: { name: 'Eggs' },
  butter: { name: 'Butter' },
  milk: { name: 'Milk' },
  yeast: { name: 'Yeast' },
  salt: { name: 'Salt' },
  oil: { name: 'Oil' },
  water: { name: 'Water' },
  honey: { name: 'Honey' },
  ginger: { name: 'Ginger' },
  treacle: { name: 'Treacle' },
  cocoa: { name: 'Cocoa' },
  garlic: { name: 'Garlic' },
  oats: { name: 'Oats' },
  banana: { name: 'Banana' },
  berries: { name: 'Berries' },
};
/* Everything is always out, in the same places, so you can mix whatever you like (Amber,
   2026-10-14): the dry goods on the two left-hand wall boards, three to a board; the cold
   things in the fridge; the yeast, the spices and the four flavours in the pair of cupboards
   by the sink; water from the tap. */
export const STOCK = {
  boards: [['flour', 'sugar', 'oats'], ['honey', 'cocoa', 'salt']],
  fridge: ['eggs', 'butter', 'milk', 'oil', 'garlic', 'banana', 'berries'],
  pair: ['yeast', 'ginger', 'treacle', 'chocolate', 'strawberry', 'vanilla', 'lemon'],
};
/* Where each thing lives in the kitchen. */
export const WHERE = {
  flour: 'cupboard', sugar: 'cupboard', yeast: 'pair', salt: 'cupboard', honey: 'cupboard',
  ginger: 'pair', treacle: 'pair', cocoa: 'cupboard', oats: 'cupboard',
  eggs: 'fridge', butter: 'fridge', milk: 'fridge', oil: 'fridge',
  garlic: 'fridge', banana: 'fridge', berries: 'fridge',
  water: 'tap',
};
export const FLAVOURS = {
  chocolate: { name: 'Chocolate', batter: '#8a5a3b', crumb: '#7a4a30', crust: '#5b3320', jam: '#f9c8d6' },
  strawberry: { name: 'Strawberry', batter: '#f7a9c0', crumb: '#f4bccb', crust: '#e39cb2', jam: '#ff6b8f' },
  vanilla: { name: 'Vanilla', batter: '#f6e7b4', crumb: '#f5dfa4', crust: '#dfae62', jam: '#ff8fae' },
  lemon: { name: 'Lemon', batter: '#f7e96b', crumb: '#f6e784', crust: '#dcb64f', jam: '#fff3b0' },
};
export const DOUGH = '#f0dcae';
export const ICINGS = [
  { id: 'pink', name: 'Pink', color: '#ff9fb8' },
  { id: 'white', name: 'Vanilla', color: '#fff8f0' },
  { id: 'choc', name: 'Choccy', color: '#6b4029' },
  { id: 'mint', name: 'Mint', color: '#9fe3c9' },
  { id: 'blue', name: 'Berry', color: '#a9c6ff' },
  { id: 'yellow', name: 'Lemon', color: '#ffe08a' },
];
export const BUTTERS = [
  { id: 'garlic', name: 'Garlic', color: '#f7e6ae' },
  { id: 'herb', name: 'Herby', color: '#bfd98a' },
  { id: 'chilli', name: 'Chilli', color: '#e8925a' },
  { id: 'plain', name: 'Plain', color: '#fff2cc' },
];
/* sweet fillings, for a tart: spread on before it bakes */
export const FILLINGS = [
  { id: 'berry', name: 'Berry', color: '#8e3a63' },
  { id: 'custard', name: 'Custard', color: '#f4d886' },
  { id: 'choc', name: 'Choccy', color: '#6b4029' },
  { id: 'apple', name: 'Apple', color: '#cbd884' },
];
export const JAMS = [
  { id: 'strawberry', name: 'Strawberry', color: '#e0455f' },
  { id: 'raspberry', name: 'Raspberry', color: '#b8294c' },
  { id: 'apricot', name: 'Apricot', color: '#efa451' },
  { id: 'blackcurrant', name: 'Blackcurrant', color: '#6a2f63' },
];
export const SAUCES = [
  { id: 'tomato', name: 'Tomato', color: '#e0304e' },
  { id: 'bbq', name: 'BBQ', color: '#7a3b1e' },
  { id: 'pesto', name: 'Pesto', color: '#6aa84f' },
  { id: 'garlic', name: 'Garlic', color: '#fff1cc' },
];
export const CAKE_TOPPINGS = [
  { id: 'strawberry', name: 'Strawberry', plural: 'strawberries' },
  { id: 'cherry', name: 'Cherry', plural: 'cherries' },
  { id: 'candle', name: 'Candle', plural: 'candles' },
  { id: 'chip', name: 'Choc chip', plural: 'choc chips' },
  { id: 'star', name: 'Star', plural: 'stars' },
  { id: 'mallow', name: 'Mallow', plural: 'mallows' },
];
export const COOKIE_TOPPINGS = [
  { id: 'chip', name: 'Choc chip', plural: 'choc chips' },
  { id: 'mallow', name: 'Mallow', plural: 'mallows' },
  { id: 'star', name: 'Star', plural: 'stars' },
  { id: 'cherry', name: 'Cherry', plural: 'cherries' },
  { id: 'strawberry', name: 'Strawberry', plural: 'strawberries' },
];
export const PIZZA_TOPPINGS = [
  { id: 'pepperoni', name: 'Pepperoni', plural: 'pepperonis' },
  { id: 'mushroom', name: 'Mushroom', plural: 'mushrooms' },
  { id: 'olive', name: 'Olive', plural: 'olives' },
  { id: 'pepper', name: 'Pepper', plural: 'peppers' },
  { id: 'basil', name: 'Basil', plural: 'basil leaves' },
  { id: 'pineapple', name: 'Pineapple', plural: 'pineapple chunks' },
];
export const GINGER_TOPPINGS = [
  { id: 'smartie', name: 'Smartie', plural: 'smarties' },
  { id: 'jelly', name: 'Jelly sweet', plural: 'jelly sweets' },
  { id: 'chip', name: 'Choc button', plural: 'choc buttons' },
  { id: 'cherry', name: 'Nose', plural: 'noses' },
  { id: 'star', name: 'Star', plural: 'stars' },
  { id: 'mallow', name: 'Mallow', plural: 'mallows' },
];
export const TART_TOPPINGS = [
  { id: 'strawberry', name: 'Strawberry', plural: 'strawberries' },
  { id: 'cherry', name: 'Cherry', plural: 'cherries' },
  { id: 'chip', name: 'Choc chip', plural: 'choc chips' },
  { id: 'mallow', name: 'Mallow', plural: 'mallows' },
  { id: 'star', name: 'Star', plural: 'stars' },
];
export const GARLIC_TOPPINGS = [
  { id: 'basil', name: 'Herbs', plural: 'herbs' },
  { id: 'olive', name: 'Olive', plural: 'olives' },
  { id: 'mushroom', name: 'Mushroom', plural: 'mushrooms' },
  { id: 'pepper', name: 'Pepper', plural: 'peppers' },
];
export const SPRINKLE_COLORS = ['#ff6b8f', '#ffd166', '#6ec6ff', '#7ee8a2', '#c58cff', '#ff9f6b', '#ffffff'];
/* Sweets come in a bagful of colours, so each one placed picks its own. */
export const SMARTIE_COLORS = ['#e0304e', '#ff8f2e', '#ffd166', '#4aa564', '#4a7fd4', '#a86ce0', '#ff8fb8', '#6b4029'];
export const JELLY_COLORS = ['#e33b5a', '#ff8a3d', '#ffcf3d', '#5ec46a', '#9b5de5'];
export const SWEET_PICKS = { smartie: SMARTIE_COLORS, jelly: JELLY_COLORS };
export const SWEET_SAMPLE = { smartie: '#e0304e', jelly: '#5ec46a' };

export const RECIPES = {
  cake: {
    id: 'cake', name: 'Cake', thing: 'cake', emoji: '🎂', icon: 'cakeCard',
    form: 'tin', decorateAfter: true,
    ingredients: ['flour', 'sugar', 'eggs', 'butter', 'milk'],
    flavours: true,
    steps: ['recipe', 'gather', 'mix', 'bake', 'decorate', 'serve'],
    cupboard: ['flour', 'sugar'],
    fridge: ['eggs', 'butter', 'milk', 'chocolate', 'strawberry', 'lemon', 'vanilla'],
    paints: ICINGS, paintTitle: 'Icing', paintWord: 'icing',
    shake: { name: 'Shake!', icon: 'sprinkles', colors: SPRINKLE_COLORS, word: 'sprinkles', mode: 'sprinkle' },
    toppings: CAKE_TOPPINGS,
    shapeLabel: 'Pour it in!',
    box: { cx: 200, top: 130, bottom: 250, rx: 100, ry: 24, tinW: 56, plateY: 272, plateRx: 150 },
  },
  cupcake: {
    id: 'cupcake', name: 'Cupcake', thing: 'cupcake', emoji: '🧁', icon: 'cupcakeCard',
    form: 'tin', decorateAfter: true, paperCase: true,
    ingredients: ['flour', 'sugar', 'eggs', 'butter'],
    flavours: true,
    steps: ['recipe', 'gather', 'mix', 'bake', 'decorate', 'serve'],
    cupboard: ['flour', 'sugar'],
    fridge: ['eggs', 'butter', 'chocolate', 'strawberry', 'lemon', 'vanilla'],
    paints: ICINGS, paintTitle: 'Icing', paintWord: 'icing',
    shake: { name: 'Shake!', icon: 'sprinkles', colors: SPRINKLE_COLORS, word: 'sprinkles', mode: 'sprinkle' },
    toppings: CAKE_TOPPINGS,
    shapeLabel: 'Pour it in!',
    box: { cx: 200, top: 128, bottom: 232, rx: 72, ry: 19, tinW: 38, plateY: 258, plateRx: 118 },
  },
  cookie: {
    id: 'cookie', name: 'Big Cookie', thing: 'cookie', emoji: '🍪', icon: 'cookieCard',
    form: 'flat', decorateAfter: true,
    ingredients: ['flour', 'sugar', 'butter', 'honey'],
    flavours: true,
    steps: ['recipe', 'gather', 'mix', 'roll', 'bake', 'decorate', 'serve'],
    cupboard: ['flour', 'sugar', 'honey'],
    fridge: ['butter', 'chocolate', 'strawberry', 'lemon', 'vanilla'],
    paints: ICINGS, paintTitle: 'Icing', paintWord: 'icing',
    shake: { name: 'Shake!', icon: 'sprinkles', colors: SPRINKLE_COLORS, word: 'sprinkles', mode: 'sprinkle' },
    toppings: COOKIE_TOPPINGS,
    shapeLabel: 'Roll it out!',
    paintR: 64,
    base: { raw: '#f0d9a8', done: '#cf9448', innerRaw: '#f6e4bd', innerDone: '#dda963', lineRaw: '#d8bd85', lineDone: '#a86f2f', tint: '#8a4b16', chips: true },
  },
  pizza: {
    id: 'pizza', name: 'Pizza', thing: 'pizza', emoji: '🍕', icon: 'pizzaCard',
    form: 'flat', decorateAfter: false,
    ingredients: ['flour', 'yeast', 'salt', 'water', 'oil'],
    flavours: false,
    steps: ['recipe', 'gather', 'mix', 'roll', 'decorate', 'bake', 'serve'],
    cupboard: ['flour', 'yeast', 'salt'],
    fridge: ['oil', 'tomato', 'cheese'],
    paints: SAUCES, paintTitle: 'Sauce', paintWord: 'sauce',
    shake: { name: 'Cheese!', icon: 'cheese', word: 'cheese', mode: 'layer' },
    toppings: PIZZA_TOPPINGS,
    shapeLabel: 'Roll it out!',
    base: { raw: '#f1dfae', done: '#d9a05a', innerRaw: '#f6e9c6', innerDone: '#efd08e', lineRaw: '#d8c08a', lineDone: '#b07a3a', tint: '#b5651d' },
  },
  gingerbread: {
    id: 'gingerbread', name: 'Gingerbread', thing: 'gingerbread man', emoji: '\ud83c\udf6a', icon: 'gingerCard',
    form: 'flat', decorateAfter: true,
    ingredients: ['flour', 'ginger', 'treacle', 'butter', 'sugar'],
    flavours: false,
    steps: ['recipe', 'gather', 'mix', 'roll', 'cut', 'bake', 'decorate', 'serve'],
    cupboard: ['flour', 'ginger', 'treacle', 'sugar'],
    fridge: ['butter'],
    cutter: true, flatShape: 'man', piping: true,
    paints: ICINGS, paintTitle: 'Icing pens', paintWord: 'icing',
    shake: { name: 'Shake!', icon: 'sprinkles', colors: SPRINKLE_COLORS, word: 'sprinkles', mode: 'sprinkle' },
    toppings: GINGER_TOPPINGS,
    shapeLabel: 'Roll it out!',
    paintR: 64,
    base: { raw: '#e6c48c', done: '#b9762f', innerRaw: '#efd9ac', innerDone: '#cb8b45', lineRaw: '#d2b184', lineDone: '#94571d', tint: '#6f3f10' },
  },
  brownie: {
    id: 'brownie', name: 'Brownies', thing: 'tray of brownies', emoji: '\ud83c\udf6b', icon: 'brownieCard',
    form: 'tin', decorateAfter: true, tone: FLAVOURS.chocolate,
    ingredients: ['flour', 'sugar', 'cocoa', 'eggs', 'butter'],
    flavours: false,
    steps: ['recipe', 'gather', 'mix', 'bake', 'decorate', 'serve'],
    cupboard: ['flour', 'sugar', 'cocoa'],
    fridge: ['eggs', 'butter'],
    paints: ICINGS, paintTitle: 'Icing', paintWord: 'icing',
    shake: { name: 'Shake!', icon: 'sprinkles', colors: SPRINKLE_COLORS, word: 'sprinkles', mode: 'sprinkle' },
    toppings: CAKE_TOPPINGS,
    shapeLabel: 'Pour it in!',
    box: { cx: 200, top: 148, bottom: 240, rx: 96, ry: 20, tinW: 52, plateY: 266, plateRx: 144 },
  },
  garlicbread: {
    id: 'garlicbread', name: 'Garlic Bread', thing: 'garlic bread', emoji: '\ud83e\udd56', icon: 'garlicCard',
    form: 'flat', decorateAfter: false,
    ingredients: ['flour', 'yeast', 'salt', 'water', 'garlic'],
    flavours: false,
    steps: ['recipe', 'gather', 'mix', 'roll', 'decorate', 'bake', 'serve'],
    cupboard: ['flour', 'yeast', 'salt'],
    fridge: ['garlic', 'butter', 'cheese'],
    paints: BUTTERS, paintTitle: 'Butter', paintWord: 'butter',
    shake: { name: 'Cheese!', icon: 'cheese', word: 'cheese', mode: 'layer' },
    toppings: GARLIC_TOPPINGS,
    shapeLabel: 'Roll it out!',
    base: { raw: '#f1dfae', done: '#d9a05a', innerRaw: '#f6e9c6', innerDone: '#efd08e', lineRaw: '#d8c08a', lineDone: '#b07a3a', tint: '#b5651d' },
  },
  bananabread: {
    id: 'bananabread', name: 'Banana Bread', thing: 'banana bread', emoji: '\ud83c\udf4c', icon: 'loafCard',
    form: 'tin', decorateAfter: true,
    tone: { batter: '#eddaa4', crumb: '#e2c98f', crust: '#bd8c4c', jam: '#f6e3b6' },
    ingredients: ['flour', 'sugar', 'eggs', 'butter', 'banana'],
    flavours: false,
    steps: ['recipe', 'gather', 'mix', 'bake', 'decorate', 'serve'],
    cupboard: ['flour', 'sugar'],
    fridge: ['eggs', 'butter', 'banana'],
    paints: ICINGS, paintTitle: 'Icing', paintWord: 'icing',
    shake: { name: 'Shake!', icon: 'sprinkles', colors: SPRINKLE_COLORS, word: 'sprinkles', mode: 'sprinkle' },
    toppings: CAKE_TOPPINGS,
    shapeLabel: 'Pour it in!',
    box: { cx: 200, top: 142, bottom: 246, rx: 92, ry: 22, tinW: 52, plateY: 270, plateRx: 146 },
  },
  tart: {
    id: 'tart', name: 'Berry Tart', thing: 'tart', emoji: '\ud83e\udd67', icon: 'tartCard',
    form: 'flat', decorateAfter: false,
    ingredients: ['flour', 'butter', 'sugar', 'berries'],
    flavours: false,
    steps: ['recipe', 'gather', 'mix', 'roll', 'decorate', 'bake', 'serve'],
    cupboard: ['flour', 'sugar'],
    fridge: ['butter', 'berries'],
    paints: FILLINGS, paintTitle: 'Filling', paintWord: 'filling',
    shake: { name: 'Shake!', icon: 'sprinkles', colors: SPRINKLE_COLORS, word: 'sprinkles', mode: 'sprinkle' },
    toppings: TART_TOPPINGS,
    shapeLabel: 'Roll it out!',
    paintR: 78,
    base: { raw: '#f3e3bd', done: '#ddb376', innerRaw: '#f9eed6', innerDone: '#eccd99', lineRaw: '#dcc79c', lineDone: '#bb9055', tint: '#9c6a2a' },
  },
  scone: {
    id: 'scone', name: 'Jam Scone', thing: 'scone', emoji: '\ud83e\uded3', icon: 'sconeCard',
    form: 'flat', decorateAfter: true,
    ingredients: ['flour', 'butter', 'sugar', 'milk'],
    flavours: false,
    steps: ['recipe', 'gather', 'mix', 'roll', 'bake', 'decorate', 'serve'],
    cupboard: ['flour', 'sugar'],
    fridge: ['butter', 'milk'],
    paints: JAMS, paintTitle: 'Jam', paintWord: 'jam',
    shake: { name: 'Shake!', icon: 'sprinkles', colors: SPRINKLE_COLORS, word: 'sprinkles', mode: 'sprinkle' },
    toppings: COOKIE_TOPPINGS,
    shapeLabel: 'Roll it out!',
    paintR: 68,
    base: { raw: '#f2e2ba', done: '#e0b877', innerRaw: '#f9f0da', innerDone: '#eed3a4', lineRaw: '#dcc79c', lineDone: '#c09659', tint: '#a2712f' },
  },
  flapjack: {
    id: 'flapjack', name: 'Flapjacks', thing: 'tray of flapjacks', emoji: '\ud83c\udf3e', icon: 'flapjackCard',
    form: 'tin', decorateAfter: true,
    tone: { batter: '#e8cd8e', crumb: '#dbb772', crust: '#b8873c', jam: '#f0dcae' },
    ingredients: ['oats', 'sugar', 'honey', 'butter'],
    flavours: false,
    steps: ['recipe', 'gather', 'mix', 'bake', 'decorate', 'serve'],
    cupboard: ['oats', 'sugar', 'honey'],
    fridge: ['butter'],
    paints: ICINGS, paintTitle: 'Drizzle', paintWord: 'drizzle',
    shake: { name: 'Shake!', icon: 'sprinkles', colors: SPRINKLE_COLORS, word: 'sprinkles', mode: 'sprinkle' },
    toppings: CAKE_TOPPINGS,
    shapeLabel: 'Press it in!',
    box: { cx: 200, top: 160, bottom: 240, rx: 96, ry: 18, tinW: 52, plateY: 266, plateRx: 144 },
  },
};

/* ---------- finding recipes by mixing (Amber, 2026-10-14, after Little Alchemy) ----------
   Put anything in the bowl and mix. If what is in it is exactly a recipe's ingredients (a
   flavour as well, for a recipe that takes one), that is what you are making, and it goes in
   your book. If it is nearly something, the book shows that recipe with what you got right
   and a question mark for each thing still to find. */
export const STARTERS = ['cake', 'pizza'];           // in the book from the very first visit
const isFlavour = (id) => !!FLAVOURS[id];
export function matchRecipe(added) {
  const things = added.filter((id) => !isFlavour(id)), flavours = added.filter(isFlavour);
  for (const r of Object.values(RECIPES)) {
    if (flavours.length && !r.flavours) continue;
    if (flavours.length > 1) continue;
    if (things.length === r.ingredients.length && r.ingredients.every((id) => things.includes(id))) return r.id;
  }
  return null;
}
/* The recipe this bowl is nearest to, if any is near: at least two things right and no
   more than two out (missing or extra). { id, have, missing, extra } */
export function nearest(added) {
  const things = added.filter((id) => !isFlavour(id));
  let best = null;
  for (const r of Object.values(RECIPES)) {
    const have = r.ingredients.filter((id) => things.includes(id));
    const missing = r.ingredients.length - have.length;
    const extra = things.length - have.length + (added.some(isFlavour) && !r.flavours ? 1 : 0);
    if (have.length < 2 || missing + extra > 2) continue;
    const score = have.length * 2 - missing - extra;
    if (!best || score > best.score) best = { id: r.id, have, missing, extra, score };
  }
  return best;
}
const BOOK_KEY = 'mlk-book';
/* Which recipes you have found, and the ingredients you have found for the ones you
   have not: get(key) as in readCounts. Anything already made counts as found. */
export function readBook(get, counts = {}) {
  let raw = null;
  try { raw = JSON.parse(get(BOOK_KEY) || 'null'); } catch (e) { raw = null; }
  const known = new Set(STARTERS);
  for (const id of (raw && raw.known) || []) if (RECIPES[id]) known.add(id);
  for (const [id, n] of Object.entries(counts)) if (n > 0 && RECIPES[id]) known.add(id);
  const hints = {};
  for (const [id, list] of Object.entries((raw && raw.hints) || {})) if (RECIPES[id] && !known.has(id)) hints[id] = list.filter((x) => RECIPES[id].ingredients.includes(x));
  return { known, hints };
}
export { BOOK_KEY as bookKey };

/* How many of each you have made, from wherever they are kept: get(key) returns the
   stored string or null. The first version only counted cakes and pizzas, under its own
   keys. */
export function readCounts(get) {
  const counts = {};
  const old = { cake: 'mlk-cakes', pizza: 'mlk-pizzas' };
  for (const id of Object.keys(RECIPES)) {
    counts[id] = parseInt(get(COUNT_KEY(id)) || (old[id] && get(old[id])) || '0', 10) || 0;
  }
  return counts;
}
export { COUNT_KEY as countKey };

export function createKitchen({ counts = readCounts(() => null), book = readBook(() => null), on = () => {} } = {}) {
  let state;

  function freshState() {
    return {
      recipe: null,          // a RECIPES id, or null while you are mixing freely
      step: 'recipe',
      scene: 'kitchen',      // kitchen | mix | roll | cut | bake | decorate | serve
      phase: 'bowl',         // kitchen phase: bowl (fetch one) | fill
      carrying: null,        // 'bowl' | 'tin' | an ingredient/flavour id
      added: [],
      flavour: null,
      mix: 0,
      stirring: false,
      spoonAngle: 0,
      poured: false,
      roll: 0,
      rolling: false,
      holdRoll: false,
      cut: false,            // has the gingerbread man been pressed out yet
      pipes: [],             // piped icing lines, in the food's own coordinates
      pipe: null,            // the icing pen in hand
      inOven: false,
      bake: 0,
      baked: false,
      out: false,
      icing: null,           // icing (cake, cupcake, cookie) or sauce (pizza) id
      icingT: 0,
      drips: [],
      sprinkles: [],
      cheese: 0,             // 0-3 layers of cheese on a pizza
      cheeseF: [],
      cheeseSpots: [],
      chips: [],             // choc chips baked into a cookie
      toppings: [],
      tool: null,
      blown: false,
      bites: 0,
      gone: false,
      eating: false,
      doors: {},             // kitchen doors standing open, by name
    };
  }
  const recipe = () => RECIPES[state.recipe || 'cake'];
  const isPizza = () => state.recipe === 'pizza';
  const isFlat = () => recipe().form === 'flat';
  const isMan = () => recipe().flatShape === 'man';
  /* The cake / cupcake shape, in the close-up scenes. */
  const box = () => recipe().box || RECIPES.cake.box;

  /* The close-up stages, in order, for the recipe being made. Once you have
     zoomed in on the bowl the camera stays close all the way through these. */
  function flow() {
    const r = recipe();
    if (r.form === 'tin') return ['mix', 'bake', 'decorate', 'serve'];
    if (r.cutter) return ['mix', 'roll', 'cut', 'bake', 'decorate', 'serve'];
    if (r.decorateAfter) return ['mix', 'roll', 'bake', 'decorate', 'serve'];
    return ['mix', 'roll', 'decorate', 'bake', 'serve'];
  }

  function missingList() {
    const m = recipe().ingredients.filter((id) => !state.added.includes(id)).map((id) => INGREDIENTS[id].name.toLowerCase());
    if (recipe().flavours && !state.flavour) m.push('a flavour');
    return m;
  }
  function doughReady() {
    return recipe().ingredients.every((id) => state.added.includes(id)) && (!recipe().flavours || !!state.flavour);
  }

  /* The colour a tin recipe bakes to: the flavour you picked, or the recipe's
     own fixed tone where there is nothing to pick (brownies are chocolate
     whatever you do, banana bread is banana). */
  const bakeTone = () => (state.flavour && FLAVOURS[state.flavour]) || recipe().tone || FLAVOURS.vanilla;

  /* The ribbon over the window says what is being made; under it, how far
     along a baker you are. */
  const bakedTotal = () => Object.values(counts).reduce((n, c) => n + c, 0);
  const cookLevel = () => 1 + Math.floor(bakedTotal() / 3);

  // ---------- the book ----------
  // a recipe found by mixing: true if it is new
  function discover(id) {
    if (!RECIPES[id] || book.known.has(id)) return false;
    book.known.add(id);
    delete book.hints[id];
    on('book');
    return true;
  }
  // what you got right for a recipe you have not found yet: true if that is new to the book
  function hint(id, have) {
    if (!RECIPES[id] || book.known.has(id)) return false;
    const was = book.hints[id] || [];
    const now = [...new Set([...was, ...have])];
    if (now.length === was.length) return false;
    book.hints[id] = now;
    on('book');
    return true;
  }
  // what to keep: the found recipes and the clues, as JSON
  const bookJSON = () => JSON.stringify({ known: [...book.known], hints: book.hints });
  // empty the bowl (the bin)
  function binBowl() {
    state.added = [];
    state.flavour = null;
  }

  // ---------- verbs ----------
  function choose(id) {
    if (!RECIPES[id]) return false;
    state.recipe = id;
    return true;
  }
  /* Something goes in the bowl: it counts once, and a flavour is the flavour. */
  function add(id) {
    if (state.added.includes(id)) return false;
    state.added.push(id);
    if (FLAVOURS[id]) state.flavour = id;
    return true;
  }
  /* One more bite; true when that was the last. */
  function takeBite() {
    state.bites++;
    return state.bites >= BITES;
  }
  /* All gone: one more of these made. */
  function finished() {
    const id = recipe().id;
    counts[id] = (counts[id] || 0) + 1;
    on('save', id);
    discover(id);
    return counts[id];
  }

  state = freshState();
  return {
    get state() { return state; }, set state(v) { state = v; },
    counts, book, freshState, recipe, isPizza, isFlat, isMan, box, flow, missingList, doughReady,
    bakeTone, bakedTotal, cookLevel, choose, add, takeBite, finished, discover, hint, bookJSON, binBowl,
  };
}
