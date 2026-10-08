/* The Corner Shop: the rules. Keep the shelves full, the prices right and the queue
   moving. The stock, the prices, who comes in and what they make of it, the till's
   bookkeeping, deliveries, the overnight bin and the day's report all live here; nothing
   here touches the page. view.js draws the shop and the till and calls the verbs.

     const shop = createShop({ saved, rnd, on })
       saved   a previous shop.serialize() (or a raw save; it is checked like one)
       rnd     the dice, () => [0, 1); Math.random by default
       on      on(event, data) for what the screen has to react to:
               'note' text · 'sfx' name · 'hud' · 'shelves' · 'side' · 'receipt' · 'belt' · 'bag'
               'browser' customer (arrived at the shelves) · 'thought' customer · 'mood' customer
               'browser-gone' { c, leaving }   (leaving: walks off down the lane)
               'queue' · 'till' customer · 'till-turn' customer · 'till-clear'
               'coins' · 'coin-taken' uid · 'paid' { c, text } · 'walkout' { c, text }
               'away' { pid } · 'away-done' · 'closed' profit · 'morning' arrived · 'over' */

// ---------- constants ----------
export const DAY_LENGTH = 100;      // real seconds the shop is open (9am to 5pm on the clock)
export const RENT = 8;
export const DELIVERY_FEE = 4;
export const START_CASH = 80;
export const MAX_QUEUE = 4;         // as many as fit the lane between the shelves and the till
export const MAX_SLOTS = 12;
export const SHELF_COST = 45;
export const RESTOCK_TIME = 2.4;    // seconds away from the till per restock while open
export const THINK_TIME = 0.45;     // seconds before a browser's thought bubble shows
export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// Four seasons of two weeks each. The wholesaler only carries a seasonal line while its
// season is on, so the range in the shop changes over a year without changing a rule.
export const SEASON_LEN = 14;
export const SEASONS = [
  { id: 'spring', name: 'Spring', ico: '🌷' },
  { id: 'summer', name: 'Summer', ico: '☀️' },
  { id: 'autumn', name: 'Autumn', ico: '🍂' },
  { id: 'winter', name: 'Winter', ico: '❄️' },
];
export const seasonOf = (day) => SEASONS[Math.floor((day - 1) / SEASON_LEN) % SEASONS.length];

export const WEATHER = {
  sunny: { ico: '☀️', name: 'sunny', mult: { lolly: 1.8, fizzy: 1.3, apples: 1.2, umbrella: 0.2 } },
  cloudy: { ico: '⛅', name: 'cloudy', mult: {} },
  rain: { ico: '🌧️', name: 'rainy', mult: { umbrella: 9, tea: 1.6, biscuits: 1.3, lolly: 0.15, beans: 1.2 } },
  hot: { ico: '🔥', name: 'scorching', mult: { lolly: 4, fizzy: 2, tea: 0.4, umbrella: 0.1 } },
  cold: { ico: '❄️', name: 'bitterly cold', mult: { tea: 2, beans: 1.5, biscuits: 1.3, lolly: 0.1, fizzy: 0.7 } },
  snow: { ico: '🌨️', name: 'thick with snow', mult: { tea: 2.2, beans: 2, bread: 1.8, milk: 1.8, looroll: 1.6, batteries: 1.5, lolly: 0, umbrella: 0.4, paper: 0.6 }, quiet: 0.7 },
  storm: { ico: '⛈️', name: 'blowing a gale', mult: { umbrella: 4, batteries: 2.6, candles: 3, beans: 1.6, tea: 1.5, lolly: 0.1 }, quiet: 0.85 },
};
const WEATHER_POOL = ['sunny', 'sunny', 'cloudy', 'cloudy', 'cloudy', 'rain', 'rain', 'hot', 'cold', 'storm'];
// Snow only turns up in winter, and a scorcher does not turn up in January.
const WEATHER_SEASON = { snow: ['winter'], hot: ['summer', 'spring'], storm: ['autumn', 'winter'] };

// cost = wholesale per unit, ref = the price people think is fair, cap = shelf space,
// life = days it keeps in the stockroom (0 = forever), pop = base popularity,
// box = units per wholesale box.
export const PRODUCTS = [
  { id: 'milk', name: 'Milk', ico: '🥛', cost: 0.6, ref: 1.1, cap: 8, life: 2, pop: 0.7, box: 8 },
  { id: 'bread', name: 'Bread', ico: '🍞', cost: 0.55, ref: 1.2, cap: 6, life: 2, pop: 0.6, box: 6 },
  { id: 'eggs', name: 'Eggs', ico: '🥚', cost: 0.9, ref: 1.8, cap: 6, life: 5, pop: 0.35, box: 6 },
  { id: 'apples', name: 'Apples', ico: '🍎', cost: 0.25, ref: 0.5, cap: 10, life: 4, pop: 0.4, box: 10 },
  { id: 'bananas', name: 'Bananas', ico: '🍌', cost: 0.3, ref: 0.6, cap: 8, life: 2, pop: 0.4, box: 8 },
  { id: 'cheese', name: 'Cheese', ico: '🧀', cost: 1.1, ref: 2.2, cap: 5, life: 4, pop: 0.3, box: 5 },
  { id: 'beans', name: 'Beans', ico: '🥫', cost: 0.4, ref: 0.8, cap: 8, life: 0, pop: 0.35, box: 8 },
  { id: 'choc', name: 'Chocolate', ico: '🍫', cost: 0.45, ref: 1.0, cap: 10, life: 0, pop: 0.55, box: 10 },
  { id: 'sweets', name: 'Sweets', ico: '🍬', cost: 0.2, ref: 0.5, cap: 12, life: 0, pop: 0.45, box: 12 },
  { id: 'biscuits', name: 'Biscuits', ico: '🍪', cost: 0.6, ref: 1.3, cap: 8, life: 0, pop: 0.4, box: 8 },
  { id: 'popcorn', name: 'Popcorn', ico: '🍿', cost: 0.35, ref: 0.9, cap: 8, life: 0, pop: 0.35, box: 8 },
  { id: 'fizzy', name: 'Fizzy pop', ico: '🥤', cost: 0.5, ref: 1.2, cap: 8, life: 0, pop: 0.5, box: 8 },
  { id: 'lolly', name: 'Ice lollies', ico: '🍦', cost: 0.4, ref: 1.0, cap: 8, life: 0, pop: 0.25, box: 8 },
  { id: 'tea', name: 'Tea', ico: '🫖', cost: 1.2, ref: 2.2, cap: 5, life: 0, pop: 0.3, box: 5 },
  { id: 'paper', name: 'Newspaper', ico: '📰', cost: 0.7, ref: 1.2, cap: 6, life: 1, pop: 0.4, box: 6 },
  { id: 'looroll', name: 'Loo roll', ico: '🧻', cost: 1.0, ref: 2.0, cap: 5, life: 0, pop: 0.3, box: 5 },
  { id: 'umbrella', name: 'Umbrellas', ico: '☂️', cost: 2.5, ref: 6.0, cap: 3, life: 0, pop: 0.08, box: 3 },
  { id: 'crisps', name: 'Crisps', ico: '🥔', cost: 0.3, ref: 0.8, cap: 12, life: 0, pop: 0.5, box: 12 },
  { id: 'coffee', name: 'Coffee', ico: '☕', cost: 1.6, ref: 3.0, cap: 5, life: 0, pop: 0.3, box: 5 },
  { id: 'petfood', name: 'Pet food', ico: '🐕', cost: 0.5, ref: 1.1, cap: 8, life: 0, pop: 0.25, box: 8 },
  { id: 'batteries', name: 'Batteries', ico: '🔋', cost: 0.9, ref: 2.4, cap: 6, life: 0, pop: 0.12, box: 6 },
  { id: 'candles', name: 'Candles', ico: '🕯️', cost: 0.5, ref: 1.4, cap: 6, life: 0, pop: 0.07, box: 6 },
  { id: 'cards', name: 'Birthday cards', ico: '💌', cost: 0.6, ref: 2.2, cap: 6, life: 0, pop: 0.14, box: 6 },
  { id: 'flowers', name: 'Flowers', ico: '💐', cost: 1.4, ref: 3.5, cap: 4, life: 3, pop: 0.16, box: 4 },
  { id: 'lottery', name: 'Lottery tickets', ico: '🎟️', cost: 1.8, ref: 2.0, cap: 10, life: 1, pop: 0.35, box: 10 },
  { id: 'plasters', name: 'Plasters', ico: '🩹', cost: 0.7, ref: 1.8, cap: 5, life: 0, pop: 0.08, box: 5 },
  // The hot counter. One day only: whatever is left at five goes in the bin, so the whole
  // trick is ordering exactly enough.
  { id: 'pies', name: 'Hot pies', ico: '🥧', cost: 0.9, ref: 2.2, cap: 6, life: 1, pop: 0.45, box: 6 },
  { id: 'sausage', name: 'Sausage rolls', ico: '🌭', cost: 0.5, ref: 1.4, cap: 8, life: 1, pop: 0.5, box: 8 },
  // and the seasonal range, in and out of the wholesaler with the calendar
  { id: 'eggschoc', name: 'Chocolate eggs', ico: '🥚', cost: 1.0, ref: 2.8, cap: 6, life: 0, pop: 0.5, box: 6, season: ['spring'] },
  { id: 'sunlotion', name: 'Sun lotion', ico: '🧴', cost: 1.8, ref: 4.5, cap: 4, life: 0, pop: 0.3, box: 4, season: ['summer'] },
  { id: 'icecream', name: 'Ice cream', ico: '🍨', cost: 0.9, ref: 2.4, cap: 6, life: 0, pop: 0.5, box: 6, season: ['summer'] },
  { id: 'fireworks', name: 'Fireworks', ico: '🎆', cost: 2.2, ref: 5.5, cap: 4, life: 0, pop: 0.4, box: 4, season: ['autumn'] },
  { id: 'pumpkins', name: 'Pumpkins', ico: '🎃', cost: 1.2, ref: 3.0, cap: 4, life: 4, pop: 0.35, box: 4, season: ['autumn'] },
  { id: 'mince', name: 'Mince pies', ico: '🥮', cost: 0.8, ref: 2.0, cap: 8, life: 4, pop: 0.55, box: 8, season: ['winter'] },
  { id: 'crackers', name: 'Crackers', ico: '🎉', cost: 1.6, ref: 4.0, cap: 4, life: 0, pop: 0.3, box: 4, season: ['winter'] },
];
const START_SLOTS = ['milk', 'bread', 'eggs', 'apples', 'choc', 'fizzy', 'paper', 'biscuits'];
export const prod = (id) => PRODUCTS.find((p) => p.id === id);

// Nobody is an emoji: `look` says which hair, clothes and bits and pieces this sort of
// person turns up in, and makeLook() rolls one of each.
const SKINS = ['#f8d7b8', '#f2c193', '#e3a870', '#c9884f', '#a8663a', '#7f4a28', '#5d3419'];
const HAIRS = ['#241a14', '#3f2a1b', '#6b4423', '#a2662a', '#d3a03c', '#c05a34', '#4a4a52'];
const GREYS = ['#c9c3ba', '#e6e1d9', '#9d968d'];

// wtp = how far over the fair price they will stretch, patience = multiplier on their
// time at the till, max = most things they will look for, weekend = how much more (or
// less) often they show up on Saturday and Sunday.
export const PERSONAS = [
  {
    id: 'kid', names: ['Alfie', 'Poppy', 'Reggie', 'Elsie', 'Kai', 'Nell'],
    likes: { sweets: 2.4, choc: 1.9, fizzy: 1.6, lolly: 2, popcorn: 1.5 },
    wtp: 0.9, patience: 0.9, max: 3, weekend: 1.8,
    look: { small: true, hair: ['spiky', 'pigtails', 'bob', 'curly', 'crop'], cloth: ['#e0574f', '#4f9de0', '#f0b429', '#6cbf6a', '#b071c9'], hat: ['none', 'none', 'bobble', 'cap'], glasses: 0.12, freckles: 0.6, collar: 'tee' },
  },
  {
    id: 'parent', names: ['Sarah', 'Dev', 'Marie', 'Tom', 'Priya', 'Jon'],
    likes: { milk: 2.2, bread: 2, eggs: 1.5, bananas: 1.5, apples: 1.3, looroll: 1.3, cheese: 1.3, beans: 1.1, choc: 0.8 },
    wtp: 1.0, patience: 1.0, max: 5, weekend: 1.2,
    look: { hair: ['bun', 'bob', 'crop', 'long', 'curly'], cloth: ['#7f8fa6', '#a8735a', '#6f9b7a', '#9a6f9b', '#c4785f'], hat: ['none'], glasses: 0.2, stubble: 0.3, collar: 'jumper' },
  },
  {
    id: 'builder', names: ['Dave', 'Kath', 'Mick', 'Lee'],
    likes: { fizzy: 2.2, paper: 1.5, choc: 1.3, beans: 1.2, popcorn: 1.4, milk: 0.8 },
    wtp: 1.15, patience: 0.7, max: 3, weekend: 0.3,
    look: { hair: ['crop', 'bun', 'spiky'], cloth: ['#f07d1e', '#f5a623'], hat: ['hardhat', 'hardhat', 'beanie'], glasses: 0.05, stubble: 0.75, collar: 'hivis' },
  },
  {
    id: 'pensioner', names: ['Bill', 'Edna', 'Ron', 'Peggy', 'Arthur', 'Joan'],
    likes: { paper: 2.4, tea: 2.1, biscuits: 1.9, milk: 1.3, bread: 1.2, eggs: 0.9 },
    wtp: 0.95, patience: 1.5, max: 4, weekend: 1,
    look: { grey: true, lines: true, hair: ['bald', 'crop', 'bun', 'curly'], cloth: ['#8d7f6a', '#7b6a86', '#6d8288', '#9c6b62'], hat: ['none', 'flatcap', 'none'], glasses: 0.7, collar: 'cardigan' },
  },
  {
    id: 'student', names: ['Zoe', 'Ben', 'Amara', 'Josh', 'Flo'],
    likes: { beans: 1.9, bread: 1.3, fizzy: 1.4, choc: 1.3, sweets: 1.1, popcorn: 1.6, milk: 0.9 },
    wtp: 0.85, patience: 1.0, max: 4, weekend: 1.1,
    look: { hair: ['messy', 'long', 'bun', 'curly', 'crop'], cloth: ['#4a5568', '#5b7f5b', '#7a4f7a', '#3f6f8f'], hat: ['beanie', 'none', 'none'], glasses: 0.25, cans: 0.45, collar: 'hoodie' },
  },
  {
    id: 'walker', names: ['Sue', 'Gordon', 'Yaz', 'Micky', 'Bridget'],
    likes: { petfood: 3, paper: 1.4, sweets: 1.2, plasters: 1.1, flowers: 1.1, biscuits: 1.2 },
    wtp: 1.05, patience: 1.2, max: 3, weekend: 1.4,
    look: { hair: ['crop', 'bun', 'curly', 'bob'], cloth: ['#6d7f53', '#8a6a45', '#4a5c6a', '#7a5a5a'], hat: ['none', 'none', 'beanie'], glasses: 0.2, collar: 'coat' },
  },
  {
    id: 'nurse', names: ['Ola', 'Fran', 'Deji', 'Anita', 'Callum'],
    likes: { coffee: 2.6, sausage: 2, crisps: 1.6, choc: 1.5, fizzy: 1.3, plasters: 1.4, pies: 1.6 },
    wtp: 1.15, patience: 0.7, max: 3, weekend: 1.0,
    look: { hair: ['bun', 'crop', 'bob'], cloth: ['#4f8fb0', '#5aa89a', '#6f7fb8'], hat: ['none'], glasses: 0.25, collar: 'tee' },
  },
  {
    id: 'driver', names: ['Sanj', 'Wayne', 'Marta', 'Kev', 'Bex'],
    likes: { coffee: 2.2, sausage: 2.2, pies: 2, crisps: 1.8, fizzy: 1.6, choc: 1.4, lottery: 1.3 },
    wtp: 1.1, patience: 0.6, max: 3, weekend: 0.7,
    look: { hair: ['crop', 'spiky', 'bald'], cloth: ['#c9772f', '#d8a33a', '#4a4a52'], hat: ['cap', 'cap', 'none'], glasses: 0.1, collar: 'tee' },
  },
  {
    id: 'tourist', names: ['Ingrid', 'Paolo', 'Hana', 'Matteo', 'Freja'],
    likes: { umbrella: 3.4, paper: 1.2, sweets: 1.5, fizzy: 1.4, biscuits: 1.5, cards: 1.6, sunlotion: 2, icecream: 1.8 },
    wtp: 1.35, patience: 1.4, max: 4, weekend: 1.6,
    look: { hair: ['bob', 'curly', 'long', 'crop'], cloth: ['#e0574f', '#f0b429', '#4f9de0', '#6cbf6a'], hat: ['none', 'cap', 'sun'], glasses: 0.35, collar: 'tee' },
  },
  {
    id: 'office', names: ['Claire', 'Raj', 'Helen', 'Oscar', 'Nadia'],
    likes: { paper: 1.7, fizzy: 1.3, choc: 1.4, apples: 1.4, tea: 1.1, bananas: 1.1 },
    wtp: 1.25, patience: 0.75, max: 3, weekend: 0.35,
    look: { hair: ['crop', 'bun', 'bob', 'short'], cloth: ['#3b4a63', '#4b3b5f', '#2f4f4a', '#5a4a3b'], hat: ['none'], glasses: 0.4, stubble: 0.2, collar: 'tie' },
  },
];

// Every sort of customer is one of the painted characters (view.js draws them). Five came
// off the sheet; the other five are Mia and Leo in other clothes.
export const CAST = {
  pensioner: 'edna', office: 'arthur', student: 'leo', walker: 'silas',
  driver: 'mia', builder: 'mia-orange', nurse: 'mia-teal', parent: 'mia-rust',
  kid: 'leo-red', tourist: 'leo-gold',
};
export const castOf = (c) => CAST[c.persona.id] || null;

const LINES = {
  buy: ['Ooh, {n}!', 'Lovely, {n}.', '{n}, just the job.', 'Grabbing some {n}.'],
  weather: ['Just the thing in this weather, {n}.', 'Everyone will be after {n} today.', 'Glad you had {n} in.'],
  bargain: ['{n} at that price? Two, please.', 'Cheap {n}! Bargain.'],
  dear: ['{p} for {n}? No thanks.', 'Bit steep for {n}.', '{n} has gone up. I\'ll leave it.', 'I can get {n} cheaper up the road.'],
  empty: ['No {n} left?', 'Shelf\'s bare. Wanted {n}.', 'Sold out of {n} again.', 'Typical. No {n}.'],
  missing: ['Do you not sell {n}?', 'Shame you don\'t do {n}.', 'I was hoping for {n}.'],
  nothing: ['Nothing for me today.', 'Just looking.', 'Maybe tomorrow.'],
  busy: ['What a queue! I\'ll come back.', 'Not waiting in that line.'],
  walkout: ['I haven\'t got all day!', 'Forget it, I\'m off.', 'This is taking forever.'],
  quick: ['Thanks, that was quick!', 'Cheers! Speedy.', 'Lovely, ta.'],
  thanks: ['Thanks, see you.', 'Ta. Bye now.', 'Cheers.'],
  slow: ['Finally. Bye.', 'Took your time.'],
};

// People pay in coins. They put them down, you pick them up: nothing lands in the tin
// until you have taken it off the counter.
export const MONEY = [
  { v: 1000, label: '£10', note: true, fill: '#d19a63', edge: '#a8703c', ink: '#4a2a12', w: 66 },
  { v: 500, label: '£5', note: true, fill: '#9ccfcc', edge: '#5f9d9d', ink: '#123f3e', w: 62 },
  { v: 200, label: '£2', fill: '#dcb14e', edge: '#9c7620', ring: '#dcdcde', ink: '#4a3a10', w: 48 },
  { v: 100, label: '£1', fill: '#e2bc55', edge: '#a37c24', ink: '#4a3a10', w: 39 },
  { v: 50, label: '50p', fill: '#d9d9dd', edge: '#98989e', ink: '#33333a', w: 42 },
  { v: 20, label: '20p', fill: '#d9d9dd', edge: '#98989e', ink: '#33333a', w: 34 },
  { v: 10, label: '10p', fill: '#d9d9dd', edge: '#98989e', ink: '#33333a', w: 35 },
  { v: 5, label: '5p', fill: '#d9d9dd', edge: '#98989e', ink: '#33333a', w: 27 },
];
// where the money lands, spread across the belt tray they just cleared
const COIN_SPOTS = [[40, 30], [112, 22], [186, 32], [252, 24], [36, 76],
                    [106, 82], [178, 72], [250, 78], [146, 52]];

// ---------- small helpers ----------
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const r5 = (n) => Math.round(n * 20) / 20;
export const money = (n) => (n < -0.001 ? '-' : '') + '£' + Math.abs(n).toFixed(2);
export const plural = (n, s, p) => n + ' ' + (n === 1 ? s : p || s + 's');
const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function freshStats() {
  const s = {};
  for (const p of PRODUCTS) s[p.id] = { wanted: 0, bought: 0, dear: 0, empty: 0, missing: 0 };
  return s;
}
function freshToday() {
  return { stats: freshStats(), remarks: [], served: 0, walked: 0, busy: 0, nothing: 0, quick: 0, takings: 0, cogs: 0, spent: 0, binned: [], repStart: 0 };
}

// ---------- the shop ----------
export function createShop({ saved = null, rnd = Math.random, on = () => {} } = {}) {
  const rand = (a, b) => a + rnd() * (b - a);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const line = (kind, p, price) => cap1(pick(LINES[kind]).replace('{n}', p ? p.name.toLowerCase() : '').replace('{p}', price != null ? money(price) : ''));

  let state = null;   // everything that persists
  let day = null;     // the running day: customers, belt, timers

  function rollWeather(d) {
    const s = seasonOf(d).id;
    const pool = WEATHER_POOL.filter((w) => !WEATHER_SEASON[w] || WEATHER_SEASON[w].includes(s));
    if (s === 'winter') pool.push('cold', 'snow', 'snow');
    if (s === 'summer') pool.push('sunny', 'hot');
    return pick(pool);
  }
  const inSeason = (p, d) => !p.season || p.season.includes(seasonOf(d === undefined ? state.day : d).id);
  const weekdayIndex = () => (state.day - 1) % 7;
  const isWeekend = () => weekdayIndex() >= 5;

  function freshState() {
    const s = {
      v: 1, day: 1, cash: START_CASH, rep: 50, weather: 'cloudy', nextWeather: rollWeather(2),
      slots: START_SLOTS.slice(), shelf: {}, room: {}, prices: {}, pending: [], arriving: [],
      today: freshToday(), totals: freshStats(), warn: 0, phase: 'closed', bestDay: 0, sold: 0, days: [], report: null,
    };
    for (const p of PRODUCTS) { s.prices[p.id] = p.ref; s.shelf[p.id] = 0; s.room[p.id] = []; }
    // Empty shelves, empty stockroom. Nothing to sell until you order it in.
    s.today.repStart = s.rep;
    return s;
  }

  function loadState(raw) {
    if (!raw || raw.v !== 1 || !Array.isArray(raw.slots)) return freshState();
    const s = freshState();
    s.day = Math.max(1, Math.floor(Number(raw.day) || 1));
    s.cash = Number(raw.cash);
    if (!isFinite(s.cash)) s.cash = START_CASH;
    s.rep = clamp(Number(raw.rep) || 50, 0, 100);
    s.weather = WEATHER[raw.weather] ? raw.weather : 'cloudy';
    s.nextWeather = WEATHER[raw.nextWeather] ? raw.nextWeather : rollWeather(s.day + 1);
    s.slots = raw.slots.slice(0, MAX_SLOTS).map((id) => (prod(id) ? id : null));
    for (const p of PRODUCTS) {
      s.prices[p.id] = r5(clamp(Number(raw.prices && raw.prices[p.id]) || p.ref, 0.05, 50));
      s.shelf[p.id] = clamp(Math.floor(Number(raw.shelf && raw.shelf[p.id]) || 0), 0, p.cap);
      const batches = Array.isArray(raw.room && raw.room[p.id]) ? raw.room[p.id] : [];
      s.room[p.id] = batches.map((b) => ({ q: Math.max(0, Math.floor(Number(b.q) || 0)), age: Math.max(0, Math.floor(Number(b.age) || 0)) })).filter((b) => b.q > 0);
    }
    const boxList = (v) => (Array.isArray(v) ? v.filter((o) => prod(o.pid) && o.boxes > 0).map((o) => ({ pid: o.pid, boxes: Math.floor(o.boxes) })) : []);
    s.pending = boxList(raw.pending);
    s.arriving = boxList(raw.arriving);
    if (raw.today && raw.today.stats) s.today = Object.assign(freshToday(), raw.today, { stats: Object.assign(freshStats(), raw.today.stats) });
    if (raw.totals) s.totals = Object.assign(freshStats(), raw.totals);
    s.warn = Math.floor(Number(raw.warn) || 0);
    s.bestDay = Number(raw.bestDay) || 0;
    s.sold = Math.floor(Number(raw.sold) || 0);
    s.days = Array.isArray(raw.days) ? raw.days.slice(-30) : [];
    s.report = raw.report && typeof raw.report === 'object' ? raw.report : null;
    s.phase = raw.phase === 'over' ? 'over' : 'closed';   // reloading mid-day reopens in the morning
    return s;
  }

  const roomQty = (pid) => state.room[pid].reduce((a, b) => a + b.q, 0);
  const roomAge = (pid) => state.room[pid].reduce((a, b) => Math.max(a, b.age), 0);
  function addToRoom(pid, q, age) {
    if (q <= 0) return;
    const b = state.room[pid].find((x) => x.age === age);
    if (b) b.q += q; else state.room[pid].push({ q, age });
  }
  function takeFromRoom(pid, n) {
    let left = n;
    const batches = state.room[pid].sort((a, b) => b.age - a.age); // oldest first
    for (const b of batches) {
      const t = Math.min(b.q, left);
      b.q -= t; left -= t;
      if (left <= 0) break;
    }
    state.room[pid] = batches.filter((b) => b.q > 0);
    return n - left;
  }
  const todayStat = (pid) => state.today.stats[pid];
  const shelfTotal = () => state.slots.reduce((a, pid) => a + (pid ? state.shelf[pid] : 0), 0);
  const stockTotal = () => PRODUCTS.reduce((a, p) => a + state.shelf[p.id] + roomQty(p.id), 0);
  // With nothing in the shop there is no day to be had, so the wholesaler lets you drive
  // over and collect the first order yourself rather than wait for the van. That is how
  // day one starts, and how you dig out of a sell-out.
  const sameDayDelivery = () => state.phase === 'closed' && stockTotal() === 0;

  // ---------- customers ----------
  function makeLook(persona) {
    const cfg = persona.look;
    return {
      skin: pick(SKINS),
      hair: pick(cfg.hair),
      hairCol: cfg.grey ? pick(GREYS) : pick(HAIRS),
      cloth: pick(cfg.cloth),
      hat: cfg.hat ? pick(cfg.hat) : 'none',
      collar: cfg.collar || '',
      specs: rnd() < (cfg.glasses || 0) ? (rnd() < 0.45 ? 'round' : 'square') : '',
      stubble: rnd() < (cfg.stubble || 0),
      freckles: rnd() < (cfg.freckles || 0),
      cans: rnd() < (cfg.cans || 0),
      lines: !!cfg.lines,
      small: !!cfg.small,
      mouth: pick(['smile', 'smile', 'grin', 'line']),
      tilt: Math.round(rand(-5, 5)),
      gaze: Math.round(rand(-1.6, 1.6) * 10) / 10,
    };
  }
  function weightedPersona() {
    const weekend = isWeekend();
    const ws = PERSONAS.map((p) => (weekend ? p.weekend : 1));
    let r = rnd() * ws.reduce((a, b) => a + b, 0);
    for (let i = 0; i < PERSONAS.length; i++) { r -= ws[i]; if (r <= 0) return PERSONAS[i]; }
    return PERSONAS[0];
  }
  function buildWants(persona) {
    const w = WEATHER[state.weather].mult;
    const list = PRODUCTS.map((p) => {
      let d = p.pop * (persona.likes[p.id] || 0.3) * (w[p.id] || 1);
      if (p.id === 'paper' && isWeekend()) d *= 1.7;
      if (!state.slots.includes(p.id)) d *= 0.5;   // people mostly come in for what they know you sell
      return { p, d: d * rand(0.5, 1.5) };
    }).sort((a, b) => b.d - a.d);
    const wants = [];
    for (const x of list) {
      if (wants.length >= persona.max) break;
      if (wants.length === 0 || rnd() < Math.min(0.8, x.d * 0.6)) wants.push(x.p);
    }
    return wants;
  }
  function logRemark(c, kind, text) {
    const r = { name: c.name, look: c.look, who: castOf(c), kind, text };
    c.remarks.push(r);
    if (kind !== 'buy') {
      state.today.remarks.push(r);
      if (state.today.remarks.length > 40) state.today.remarks.shift();
    }
  }
  function shopAround(c) {
    const w = WEATHER[state.weather].mult;
    const loyal = state.rep >= 70 ? 1.06 : state.rep < 30 ? 0.95 : 1;
    for (const p of c.wants) {
      const st = todayStat(p.id);
      const tot = state.totals[p.id];
      st.wanted++; tot.wanted++;
      if (!state.slots.includes(p.id)) { st.missing++; tot.missing++; c.missed.push({ p, why: 'missing' }); logRemark(c, 'missing', line('missing', p)); continue; }
      if (state.shelf[p.id] <= 0) { st.empty++; tot.empty++; c.missed.push({ p, why: 'empty' }); logRemark(c, 'empty', line('empty', p)); continue; }
      const price = state.prices[p.id];
      const wtp = p.ref * c.persona.wtp * loyal * rand(0.92, 1.4);
      if (price > wtp + 0.001) { st.dear++; tot.dear++; c.missed.push({ p, why: 'dear' }); logRemark(c, 'dear', line('dear', p, price)); continue; }
      let q = 1;
      let kind = 'buy';
      if (price < p.ref * 0.8 && rnd() < 0.55) { q = 2; kind = 'bargain'; }
      else if (p.ref < 1 && rnd() < 0.25) q = 2;
      if ((w[p.id] || 1) >= 1.5 && kind === 'buy') kind = 'weather';
      q = Math.min(q, state.shelf[p.id]);
      state.shelf[p.id] -= q;
      st.bought += q; tot.bought += q;
      c.basket.push({ p, q });
      logRemark(c, kind, line(kind, p));
    }
  }
  // Everyone of a sort is drawn as the same painted character, so two of them sharing a
  // name as well read as one person walking out and straight back in. Nobody in the shop,
  // or among the last few through the door, shares a name.
  function freshName(persona) {
    const taken = new Set(day.recent);
    for (const o of [day.browser, day.till, ...day.queue]) if (o) taken.add(o.name);
    const free = persona.names.filter((n) => !taken.has(n));
    const name = pick(free.length ? free : persona.names);
    day.recent.push(name);
    if (day.recent.length > 6) day.recent.shift();
    return name;
  }
  function enterCustomer() {
    const persona = weightedPersona();
    const c = { persona, look: makeLook(persona), name: freshName(persona), wants: [], basket: [], missed: [], remarks: [], t: 0, state: 'browse', tillTime: 0 };
    c.wants = buildWants(persona);
    shopAround(c);
    // they keep their opinions to themselves; you hear about it at closing time. All you
    // get while they browse is the thing on their mind and their face once they have found
    // out whether it is there.
    c.think = c.missed.length ? pick(c.missed) : null;
    c.mood = !c.missed.length ? '' : (c.basket.length && c.missed.length < 2) ? 'flat' : 'sad';
    c.browseTime = rand(2, 3.2);
    c.realiseAt = c.browseTime * 0.55;
    day.browser = c;
    on('browser', c);
    on('shelves');
  }
  function updateBrowser(c, dt) {
    const was = c.t;
    c.t += dt;
    if (c.think && was < THINK_TIME && c.t >= THINK_TIME) on('thought', c);
    if (c.mood && was < c.realiseAt && c.t >= c.realiseAt) { c.look.mood = c.mood; on('mood', c); }
    if (c.t < c.browseTime) return;
    day.browser = null;
    day.cool = 0.5;
    const units = c.basket.reduce((a, b) => a + b.q, 0);
    // someone leaving walks off behind the queue; someone joining it steps straight across
    // into it. Either way the browser spot is free again.
    on('browser-gone', { c, leaving: units === 0 || day.queue.length >= MAX_QUEUE });
    if (units === 0) {
      state.today.nothing++;
      if (!c.remarks.length) logRemark(c, 'nothing', line('nothing'));
      return;
    }
    if (day.queue.length >= MAX_QUEUE) {
      returnBasket(c);
      state.today.busy++;
      bumpRep(-2);
      logRemark(c, 'busy', line('busy'));
      on('note', c.name + ' took one look at the queue and left.');
      return;
    }
    c.state = 'queue';
    day.queue.push(c);
    on('queue');
  }
  function returnBasket(c) {
    for (const b of c.basket) {
      const p = b.p;
      const space = p.cap - state.shelf[p.id];
      const back = Math.min(space, b.q);
      state.shelf[p.id] += back;
      addToRoom(p.id, b.q - back, 0);
      todayStat(p.id).bought -= b.q;
      state.totals[p.id].bought -= b.q;
    }
    c.basket = [];
    on('shelves');
  }
  function bumpRep(n) {
    state.rep = clamp(state.rep + n, 0, 100);
    on('hud');
  }

  // ---------- the till ----------
  function makeMoney(total) {
    let left = Math.round(total * 100);
    const out = [];
    let uid = 0;
    for (const d of MONEY) {
      while (left >= d.v) { left -= d.v; out.push(Object.assign({ uid: 'c' + uid++ }, d)); }
    }
    const spots = COIN_SPOTS.slice().sort(() => rnd() - 0.5);
    out.forEach((c, i) => {
      const sp = spots[i % spots.length];
      c.x = sp[0] + rand(-5, 5);
      c.y = sp[1] + rand(-4, 4);
      c.rot = Math.round(rand(-14, 14));
    });
    return out;
  }
  function offerPayment(c) {
    c.state = 'paying';
    c.t = 0;
    day.coins = makeMoney(day.total);
    day.owed = day.total;
    on('coins');
    on('receipt');
    if (!day.coins.length) complete(c);
  }
  function takeCoin(uid) {
    if (!day || !day.coins) return;
    const i = day.coins.findIndex((m) => m.uid === uid);
    if (i < 0) return;
    const m = day.coins.splice(i, 1)[0];
    const v = m.v / 100;
    state.cash += v;
    state.today.takings += v;
    day.owed = r5(Math.max(0, day.owed - v));
    on('sfx', 'clink');
    on('coin-taken', uid);
    on('hud');
    on('receipt');
    if (!day.coins.length && day.till && day.till.state === 'paying') complete(day.till);
  }
  function clearCoins() {
    if (day) { day.coins = []; day.owed = 0; }
    on('coins');
  }
  function sweepCoins() {
    if (!day || !day.coins) return;
    while (day.coins.length) takeCoin(day.coins[0].uid);
  }
  function startTill(c) {
    day.till = c;
    c.state = 'till';
    c.t = 0;
    c.tillTime = 0;
    const units = c.basket.reduce((a, b) => a + b.q, 0);
    c.maxPatience = (13 + 4 * units) * c.persona.patience;
    c.patience = c.maxPatience;
    day.belt = [];
    let uid = 0;
    for (const b of c.basket) for (let i = 0; i < b.q; i++) day.belt.push({ uid: 'i' + uid++, p: b.p, scanned: false });
    day.belt.sort(() => rnd() - 0.5);
    day.bag = [];
    day.rung = [];
    day.total = 0;
    day.coins = [];
    day.owed = 0;
    on('till', c);
  }
  function updateTill(c, dt) {
    if (c.state === 'till') {
      c.tillTime += dt;
      c.patience -= dt * (day.away > 0 ? 1.6 : 1);
      if (c.patience <= 0) walkout(c);
    } else if (c.state === 'paying') {
      c.t += dt;   // the money is down; they wait while you pick it up
    } else if (c.state === 'done') {
      const was = c.t;
      c.t += dt;
      if (was < 0.6 && c.t >= 0.6) on('till-turn', c);
      if (c.t >= 1.1) {
        day.till = null;
        day.belt = [];
        day.bag = [];
        day.rung = [];
        day.total = 0;
        clearCoins();
        on('till-clear');
      }
    }
  }
  function scanItem(uid) {
    if (!day) return false;
    const it = day.belt.find((x) => x.uid === uid);
    if (!it || it.scanned) return false;
    it.scanned = true;
    day.rung.push(it);
    day.total = r5(day.total + state.prices[it.p.id]);
    on('sfx', 'beep');
    on('scanned', it);
    return true;
  }
  function bagItem(uid) {
    if (!day) return false;
    const i = day.belt.findIndex((x) => x.uid === uid);
    if (i < 0) return false;
    if (!day.belt[i].scanned) { on('note', 'Run it over the scanner before it goes in the bag.'); return false; }
    day.bag.push(day.belt.splice(i, 1)[0]);
    on('sfx', 'pack');
    on('bagged');
    const c = day.till;
    if (c && c.state === 'till' && !day.belt.length) offerPayment(c);
    return true;
  }
  function complete(c) {
    const units = day.bag.length;
    const cogs = day.bag.reduce((a, it) => a + it.p.cost, 0);
    state.today.cogs += cogs;
    state.today.served++;
    state.sold += units;
    const quick = c.tillTime < 6 + 2.4 * units;
    const slow = c.patience < c.maxPatience * 0.25;
    if (quick) state.today.quick++;
    bumpRep(quick ? 1.5 : slow ? 0 : 1);
    on('sfx', 'chime');
    c.state = 'done';
    c.t = 0;
    on('paid', { c, text: line(quick ? 'quick' : slow ? 'slow' : 'thanks'), total: day.total });
  }
  function walkout(c) {
    returnBasket(c);
    state.today.walked++;
    bumpRep(-4);
    logRemark(c, 'walkout', line('walkout'));
    on('sfx', 'thud');
    on('note', c.name + ' walked out. Everything went back on the shelf.');
    c.state = 'done';
    c.t = 0;
    day.belt = [];
    day.bag = [];
    day.rung = [];
    day.total = 0;
    clearCoins();
    on('walkout', { c, text: c.remarks[c.remarks.length - 1].text });
  }

  // ---------- shelves and stock ----------
  // Returns { ok, msg }. While open, a restock takes the clerk away from the till for a
  // few seconds and finishes in tick(); while closed it is immediate.
  function restock(pid) {
    const p = prod(pid);
    const need = p.cap - state.shelf[pid];
    const have = roomQty(pid);
    if (need <= 0) return { ok: false, msg: p.name + ' shelf is already full.' };
    if (have <= 0) return { ok: false, msg: 'No ' + p.name.toLowerCase() + ' in the stockroom. Order some in.' };
    const n = Math.min(need, have);
    if (state.phase === 'open') {
      if (day.away > 0) return { ok: false, msg: 'You are already away from the till.' };
      day.away = RESTOCK_TIME;
      day.awayJob = { pid, n };
      on('away', { pid });
      return { ok: true, away: true };
    }
    doRestock(pid, n);
    return { ok: true };
  }
  function doRestock(pid, n) {
    const got = takeFromRoom(pid, n);
    state.shelf[pid] += got;
    on('note', 'Put ' + plural(got, prod(pid).name.toLowerCase()) + ' on the shelf.');
    on('shelves');
    on('stock');
  }
  function finishRestock() {
    day.away = 0;
    on('away-done');
    if (day.awayJob) doRestock(day.awayJob.pid, day.awayJob.n);
    day.awayJob = null;
  }
  function applyShelves(sel) {
    const slots = state.slots;
    let changed = 0;
    // clear the ones that are no longer wanted first, so their shelves are free
    for (let i = 0; i < slots.length; i++) {
      const pid = slots[i];
      if (!pid || sel.includes(pid)) continue;
      addToRoom(pid, state.shelf[pid], 0);
      state.shelf[pid] = 0;
      slots[i] = null;
      changed++;
    }
    let bare = 0;
    for (const pid of sel) {
      if (slots.includes(pid)) continue;
      const i = slots.indexOf(null);
      if (i < 0) break;
      slots[i] = pid;
      state.shelf[pid] = takeFromRoom(pid, prod(pid).cap);
      if (!state.shelf[pid]) bare++;
      changed++;
    }
    if (!changed) return 'Shelves left as they were.';
    if (bare) return 'Shelves rearranged, but ' + (bare === 1 ? 'one has' : bare + ' have') + ' nothing in the stockroom yet. Order some in.';
    return 'Shelves rearranged.';
  }
  function fillAll() {
    let put = 0;
    for (const pid of state.slots) {
      if (!pid) continue;
      const need = prod(pid).cap - state.shelf[pid];
      if (need <= 0) continue;
      const got = takeFromRoom(pid, Math.min(need, roomQty(pid)));
      state.shelf[pid] += got;
      put += got;
    }
    return put;
  }
  function buyShelf() {
    if (state.slots.length >= MAX_SLOTS) return { ok: false, msg: '' };
    if (state.cash < SHELF_COST) return { ok: false, msg: 'Not enough cash for another shelf.' };
    state.cash -= SHELF_COST;
    state.today.spent += SHELF_COST;
    state.slots.push(null);
    return { ok: true, msg: 'New shelf fitted. ' + (state.phase === 'open' ? 'Choose what goes on it after closing.' : 'Rearrange the shelves to put something on it.') };
  }
  function setPrice(pid, v) { state.prices[pid] = clamp(Math.round(v * 100) / 100, 0.05, 50); }
  function nudgePrice(pid, d) { state.prices[pid] = r5(clamp(state.prices[pid] + 0.05 * d, 0.05, 50)); }

  // ---------- orders ----------
  // `order` is { pid: boxes }, picked in the Orders tab.
  function orderTotal(order) {
    let t = 0;
    let boxes = 0;
    for (const pid in order) { const p = prod(pid); t += order[pid] * p.box * p.cost; boxes += order[pid]; }
    return { cost: r5(t), boxes, fee: boxes ? DELIVERY_FEE : 0 };
  }
  function confirmOrder(order) {
    const t = orderTotal(order);
    if (!t.boxes) return { ok: false, msg: '' };
    const total = t.cost + t.fee;
    if (state.cash < total) return { ok: false, msg: 'Not enough cash for that order.' };
    const now = sameDayDelivery();
    // ordered before you open and the van catches you at opening time; ordered during the
    // day and it waits for tomorrow morning
    const list = state.phase === 'closed' ? state.arriving : state.pending;
    state.cash -= total;
    state.today.spent += total;
    for (const pid in order) {
      if (!order[pid]) continue;
      if (now) addToRoom(pid, order[pid] * prod(pid).box, 0);
      else {
        const ex = list.find((o) => o.pid === pid);
        if (ex) ex.boxes += order[pid]; else list.push({ pid, boxes: order[pid] });
      }
    }
    return {
      ok: true,
      msg: now
        ? 'You fetch it from the cash and carry yourself. It is in the stockroom — get it on the shelves.'
        : state.phase === 'closed'
          ? 'Order placed. The van pulls up as you open the door — it goes in the stockroom, so you will be putting it out between customers.'
          : 'Order placed. The van comes first thing tomorrow.',
    };
  }

  // ---------- the day's report ----------
  // Nobody says a word while they shop. Everything they thought gets written up here once
  // the door is locked, and read back in the notebook tomorrow.
  function buildReport() {
    const t = state.today;
    const st = t.stats;
    const notes = [];
    let best = null;
    for (const p of PRODUCTS) { const s = st[p.id]; if (!best || s.bought > best.n) best = { p, n: s.bought }; }
    if (best && best.n) notes.push('Best seller: ' + best.p.name.toLowerCase() + ' (' + best.n + ' sold).');
    for (const p of PRODUCTS) {
      const s = st[p.id];
      if (s.empty) notes.push(plural(s.empty, 'person', 'people') + ' came in for ' + p.name.toLowerCase() + ' and found the shelf bare.');
    }
    for (const p of PRODUCTS) {
      const s = st[p.id];
      if (s.dear) notes.push(plural(s.dear, 'person', 'people') + ' put ' + p.name.toLowerCase() + ' back at ' + money(state.prices[p.id]) + '.');
    }
    // one line for everything you do not sell, or the list runs off the page
    const asked = PRODUCTS.filter((p) => st[p.id].missing).sort((x, y) => st[y.id].missing - st[x.id].missing);
    if (asked.length) {
      const heads = asked.reduce((a2, p) => a2 + st[p.id].missing, 0);
      notes.push(plural(heads, 'person', 'people') + ' asked for something you do not stock: ' + asked.map((p) => p.name.toLowerCase()).join(', ') + '.');
    }
    const untouched = state.slots.filter((pid) => pid && st[pid].wanted === 0 && state.shelf[pid] > 0).map((pid) => prod(pid).name.toLowerCase());
    if (untouched.length && t.served + t.walked > 3) notes.push('Nobody so much as looked at the ' + untouched.join(', ') + '.');
    const stats = {};
    for (const p of PRODUCTS) stats[p.id] = Object.assign({}, st[p.id]);
    return { day: state.day, weather: state.weather, notes, stats, remarks: t.remarks.slice(-10) };
  }

  // ---------- the day ----------
  // Returns { ok, msg, tab }: tab is where to send the player when the door will not open.
  function openShop() {
    if (state.phase !== 'closed') return { ok: false, msg: '' };
    if (shelfTotal() <= 0) {
      const room = PRODUCTS.some((p) => roomQty(p.id) > 0);
      return {
        ok: false,
        msg: room ? 'The shelves are bare. Put the stock out before you unlock the door.' : 'Nothing to sell. Order some stock in on the Orders tab first.',
        tab: room ? 'stock' : 'orders',
      };
    }
    // Snow and a gale keep people at home; a scorcher and a sunny weekend bring them out.
    const q = WEATHER[state.weather].quiet || 1;
    const n = clamp(Math.round((9 + state.rep / 8 + (isWeekend() ? 2 : 0)) * q), 5, 24);
    const spawnAt = [];
    for (let i = 0; i < n; i++) spawnAt.push(rand(1.5, DAY_LENGTH - 12));
    spawnAt.sort((a, b) => a - b);
    day = { t: 0, spawnAt, spawnIdx: 0, browser: null, queue: [], till: null, recent: [], away: 0, awayJob: null, belt: [], bag: [], rung: [], total: 0, cool: 0 };
    state.phase = 'open';
    state.today.repStart = state.rep;
    const dropped = deliver(state.arriving);
    return {
      ok: true,
      msg: dropped
        ? 'Open for business, and the van has just dropped ' + dropped + ' off in the stockroom.'
        : 'Open for business. ' + WEATHER[state.weather].ico + ' ' + cap1(WEATHER[state.weather].name) + ' out there.',
    };
  }
  function tick(dt) {
    if (!day || state.phase !== 'open') return;
    day.t += dt;
    if (day.cool > 0) day.cool -= dt;
    if (day.away > 0) { day.away -= dt; if (day.away <= 0) finishRestock(); }
    if (!day.browser && day.cool <= 0 && day.spawnIdx < day.spawnAt.length && day.t >= day.spawnAt[day.spawnIdx] && day.t < DAY_LENGTH) {
      day.spawnIdx++;
      enterCustomer();
    }
    if (day.browser) updateBrowser(day.browser, dt);
    if (!day.till && day.queue.length && day.cool <= 0) startTill(day.queue.shift());
    if (day.till) updateTill(day.till, dt);
    const allIn = day.spawnIdx >= day.spawnAt.length || day.t >= DAY_LENGTH;
    if (allIn && !day.browser && !day.queue.length && !day.till && day.cool <= 0) closeShop();
    else if (day.t >= DAY_LENGTH + 60) {
      for (const c of day.queue) returnBasket(c);
      day.queue = [];
      if (day.till && day.till.state === 'paying') sweepCoins();
      if (day.till && day.till.state !== 'done') { returnBasket(day.till); day.till = null; }
      closeShop();
    }
  }
  function closeShop() {
    clearCoins();
    state.phase = 'evening';
    const t = state.today;
    state.report = buildReport();   // cash off first, then work out how the day really went
    // rent, word of mouth fades a little overnight, then the night in the stockroom
    state.cash -= RENT;
    state.rep = clamp(state.rep - 2, 0, 100);
    for (const p of PRODUCTS) {
      if (!p.life) continue;
      let binned = 0;
      for (const b of state.room[p.id]) b.age++;
      state.room[p.id] = state.room[p.id].filter((b) => { if (b.age >= p.life) { binned += b.q; return false; } return true; });
      if (p.life === 1 && state.shelf[p.id]) { binned += state.shelf[p.id]; state.shelf[p.id] = 0; }
      if (binned) t.binned.push({ pid: p.id, q: binned });
    }
    const profit = r5(t.takings - t.cogs - RENT);
    state.days.push({ day: state.day, takings: r5(t.takings), profit });
    if (state.days.length > 30) state.days.shift();
    if (profit > state.bestDay) state.bestDay = profit;
    day = null;
    on('closed', profit);
  }
  // boxes off the van and into the stockroom; returns what was on it
  function deliver(list) {
    if (!list || !list.length) return '';
    const arrived = list.map((o) => {
      const units = o.boxes * prod(o.pid).box;
      addToRoom(o.pid, units, 0);
      return units + ' ' + prod(o.pid).name.toLowerCase();
    });
    list.length = 0;
    return arrived.join(', ');
  }
  function morning() {
    state.day++;
    state.weather = state.nextWeather;
    state.nextWeather = rollWeather(state.day + 1);
    const arrived = deliver(state.pending);
    state.today = freshToday();
    state.today.repStart = state.rep;
    if (state.cash < 0) state.warn++; else state.warn = 0;
    state.phase = state.warn >= 2 ? 'over' : 'closed';
    return arrived;
  }
  function reset() { state = freshState(); day = null; }

  state = saved ? loadState(saved) : freshState();

  return {
    get state() { return state; }, get day() { return day; },
    rollWeather, inSeason, weekdayIndex, isWeekend, weightedPersona, buildWants, makeLook,
    roomQty, roomAge, shelfTotal, stockTotal, sameDayDelivery, orderTotal,
    openShop, tick, morning, reset, closeShop,
    scanItem, bagItem, takeCoin, sweepCoins,
    restock, fillAll, applyShelves, buyShelf, setPrice, nudgePrice, confirmOrder,
    serialize: () => JSON.parse(JSON.stringify(state)),
  };
}
