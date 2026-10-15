/* The Corner Shop: the rules. The shop floor seen from above: you walk it as the keeper,
   carry boxes out of the stockroom onto the shelves, and get back at the till when
   somebody is waiting to pay. Customers walk in, go shelf to shelf for what they came
   for, queue, and wait at the counter while you scan. The stock, the prices, what people
   make of it, the till's bookkeeping, deliveries, the overnight bin and the day's report
   all live here; nothing here touches the page. view.js draws the shop and calls the verbs.

     const shop = createShop({ saved, rnd, on })
       saved   a previous shop.serialize() (or a raw save; it is checked like one)
       rnd     the dice, () => [0, 1); Math.random by default
       on      on(event, data) for what the screen has to react to:
               'note' text · 'sfx' name · 'hud' · 'side' (stock or shelves changed)
               'till' customer (their shopping is on the belt) · 'scanned' item · 'bagged'
               'coins' · 'coin-taken' uid · 'paid' { c, text, total } · 'walkout' { c, text }
               'till-clear' · 'closed' profit

   Positions are in floor tiles: x across (0..COLS), y down the shop (0 is the back wall,
   ROWS the front). A tile (c, r) has its centre at (c + 0.5, r + 0.5). */

// ---------- constants ----------
export const DAY_LENGTH = 150;      // real seconds the shop is open (9am to 5pm on the clock)
export const RENT = 8;
export const DELIVERY_FEE = 4;
export const START_CASH = 80;
export const MAX_QUEUE = 4;         // people waiting behind whoever is paying
export const MAX_SHOPPING = 4;      // people going round the shelves at once
export const SHELF_COST = 45;
export const KEEPER_SPEED = 4.6;    // tiles a second
export const SHOPPER_SPEED = 2.5;
export const PICK_TIME = 0.15;      // seconds to lift a box in the stockroom
export const STOCK_EACH = 0.14;     // seconds per thing put on a shelf
export const BROWSE_TIME = 0.9;     // seconds a customer looks before taking something
export const SHELF_WAIT = 6;        // seconds they hang about at an empty shelf, times their patience
export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// ---------- the floor plan ----------
// Twenty tiles across, twelve deep. The stockroom is walled off in the back-left corner,
// the shelves run along the back wall, two gondolas stand in the middle, the produce
// tables sit by the window at the front left, and the counter is front right, by the
// door. Every fixture's front faces the door, so its goods face you.
export const COLS = 20;
export const ROWS = 12;
export const STOCKROOM = { x: 0, y: 0, w: 4, h: 5 };
// You walk into the stockroom. Its front wall stands on the tiles either side of a doorway
// two tiles wide. Pallets of boxes stand along the back wall and one on each side wall, each
// reached straight on from the free tile in front of it, with a clear way round between
// them (Amber found the corner pallets hard to reach). Two products to a pallet.
export const ROOM_DOOR = { x: 1, w: 2 };
export const ROOM_WALLS = [[0, 4], [3, 4]];
export const PALLETS = [
  { at: [0, 0], from: [0.5, 1.5] }, { at: [1, 0], from: [1.5, 1.5] }, { at: [2, 0], from: [2.5, 1.5] }, { at: [3, 0], from: [3.5, 1.5] },
  { at: [0, 2], from: [1.5, 2.5] }, { at: [3, 2], from: [2.5, 2.5] },
];
export const ROOM_SPOT = [2, 3.2];      // the middle of the stockroom floor
export const DOOR = { x: 9, w: 2 };     // the gap in the front wall, tiles 9 and 10
export const COUNTER = { x: 13, y: 9, w: 5, h: 1 };
// The keeper serves from the shop side of the counter (Amber: the bottom, not the top),
// back to us; customers queue along the far side, facing us, and the counter hides their legs.
export const TILL_SPOT = [16.5, 10.6];  // in front of the till, the keeper's side
export const PAY_SPOT = [16.5, 8.4];    // across it, where the customer pays
export const QUEUE_SPOTS = [[15.1, 8.4], [13.7, 8.4], [12.3, 8.4], [11.3, 9.4]];
export const PLANTS = [[19, 0], [18, 9], [0, 11]];   // pots: in the way, nothing more

// One product per facing: a two-tile run of shelf (or one produce table) with the spot a
// person stands to reach it. The first eight come with the shop; the rest are bare
// plinths until you fit a shelf on them.
const FACE = (x, y, kind, sy) => ({ x, y, w: 2, kind, spot: [x + 1, sy] });
export const FACINGS = [
  FACE(5, 0, 'wall', 1.55), FACE(7, 0, 'wall', 1.55), FACE(9, 0, 'wall', 1.55),
  FACE(12, 0, 'wall', 1.55), FACE(14, 0, 'wall', 1.55), FACE(16, 0, 'wall', 1.55),
  // the gondolas stand a tile clear of the stockroom, so its doorway is easy to get round
  FACE(6, 4, 'gondola', 5.55), FACE(8, 4, 'gondola', 5.55), FACE(10, 4, 'gondola', 5.55),
  FACE(13, 4, 'gondola', 5.55), FACE(15, 4, 'gondola', 5.55),
  FACE(1, 9, 'table', 8.4), FACE(3, 9, 'table', 8.4), FACE(5, 9, 'table', 8.4),
];
export const MAX_SLOTS = FACINGS.length;

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
// Which facings the shop comes with: the back wall, one gondola and a produce table. They
// start empty: whatever you first carry onto a shelf is what goes there. A v1 save's
// shelves land on them in this order.
const START_FACINGS = [0, 1, 2, 3, 4, 5, 6, 11];
const FIT_ORDER = START_FACINGS.concat(FACINGS.map((f, i) => i).filter((i) => !START_FACINGS.includes(i)));
export const prod = (id) => PRODUCTS.find((p) => p.id === id);

// Nobody is an emoji: `look` says which hair, clothes and bits and pieces this sort of
// person turns up in, and makeLook() rolls one of each.
const SKINS = ['#f8d7b8', '#f2c193', '#e3a870', '#c9884f', '#a8663a', '#7f4a28', '#5d3419'];
const HAIRS = ['#241a14', '#3f2a1b', '#6b4423', '#a2662a', '#d3a03c', '#c05a34', '#4a4a52'];
const GREYS = ['#c9c3ba', '#e6e1d9', '#9d968d'];
const LEGS = ['#3d4a66', '#4a4038', '#2f3640', '#5a5e6a', '#6b5a48'];

// wtp = how far over the fair price they will stretch, patience = multiplier on their
// time at the till, max = most things they will look for, weekend = how much more (or
// less) often they show up on Saturday and Sunday.
export const PERSONAS = [
  {
    id: 'kid', names: ['Alfie', 'Poppy', 'Reggie', 'Elsie', 'Kai', 'Nell'],
    likes: { sweets: 2.4, choc: 1.9, fizzy: 1.6, lolly: 2, popcorn: 1.5 },
    wtp: 0.9, patience: 0.9, max: 3, weekend: 1.8,
    look: { small: true, hair: ['spiky', 'pigtails', 'bob', 'curly', 'crop'], cloth: ['#e0574f', '#4f9de0', '#f0b429', '#6cbf6a', '#b071c9'], hat: ['none', 'none', 'bobble', 'cap'], collar: 'tee' },
  },
  {
    id: 'parent', names: ['Sarah', 'Dev', 'Marie', 'Tom', 'Priya', 'Jon'],
    likes: { milk: 2.2, bread: 2, eggs: 1.5, bananas: 1.5, apples: 1.3, looroll: 1.3, cheese: 1.3, beans: 1.1, choc: 0.8 },
    wtp: 1.0, patience: 1.0, max: 5, weekend: 1.2,
    look: { hair: ['bun', 'bob', 'crop', 'long', 'curly'], cloth: ['#7f8fa6', '#a8735a', '#6f9b7a', '#9a6f9b', '#c4785f'], hat: ['none'], collar: 'jumper' },
  },
  {
    id: 'builder', names: ['Dave', 'Kath', 'Mick', 'Lee'],
    likes: { fizzy: 2.2, paper: 1.5, choc: 1.3, beans: 1.2, popcorn: 1.4, milk: 0.8 },
    wtp: 1.15, patience: 0.7, max: 3, weekend: 0.3,
    look: { hair: ['crop', 'bun', 'spiky'], cloth: ['#f07d1e', '#f5a623'], hat: ['hardhat', 'hardhat', 'beanie'], collar: 'hivis' },
  },
  {
    id: 'pensioner', names: ['Bill', 'Edna', 'Ron', 'Peggy', 'Arthur', 'Joan'],
    likes: { paper: 2.4, tea: 2.1, biscuits: 1.9, milk: 1.3, bread: 1.2, eggs: 0.9 },
    wtp: 0.95, patience: 1.5, max: 4, weekend: 1,
    look: { grey: true, hair: ['bald', 'crop', 'bun', 'curly'], cloth: ['#8d7f6a', '#7b6a86', '#6d8288', '#9c6b62'], hat: ['none', 'flatcap', 'none'], collar: 'cardigan', slow: true },
  },
  {
    id: 'student', names: ['Zoe', 'Ben', 'Amara', 'Josh', 'Flo'],
    likes: { beans: 1.9, bread: 1.3, fizzy: 1.4, choc: 1.3, sweets: 1.1, popcorn: 1.6, milk: 0.9 },
    wtp: 0.85, patience: 1.0, max: 4, weekend: 1.1,
    look: { hair: ['messy', 'long', 'bun', 'curly', 'crop'], cloth: ['#4a5568', '#5b7f5b', '#7a4f7a', '#3f6f8f'], hat: ['beanie', 'none', 'none'], collar: 'hoodie' },
  },
  {
    id: 'walker', names: ['Sue', 'Gordon', 'Yaz', 'Micky', 'Bridget'],
    likes: { petfood: 3, paper: 1.4, sweets: 1.2, plasters: 1.1, flowers: 1.1, biscuits: 1.2 },
    wtp: 1.05, patience: 1.2, max: 3, weekend: 1.4,
    look: { hair: ['crop', 'bun', 'curly', 'bob'], cloth: ['#6d7f53', '#8a6a45', '#4a5c6a', '#7a5a5a'], hat: ['none', 'none', 'beanie'], collar: 'coat', dog: 0.7 },
  },
  {
    id: 'nurse', names: ['Ola', 'Fran', 'Deji', 'Anita', 'Callum'],
    likes: { coffee: 2.6, sausage: 2, crisps: 1.6, choc: 1.5, fizzy: 1.3, plasters: 1.4, pies: 1.6 },
    wtp: 1.15, patience: 0.7, max: 3, weekend: 1.0,
    look: { hair: ['bun', 'crop', 'bob'], cloth: ['#4f8fb0', '#5aa89a', '#6f7fb8'], hat: ['none'], collar: 'tee' },
  },
  {
    id: 'driver', names: ['Sanj', 'Wayne', 'Marta', 'Kev', 'Bex'],
    likes: { coffee: 2.2, sausage: 2.2, pies: 2, crisps: 1.8, fizzy: 1.6, choc: 1.4, lottery: 1.3 },
    wtp: 1.1, patience: 0.6, max: 3, weekend: 0.7,
    look: { hair: ['crop', 'spiky', 'bald'], cloth: ['#c9772f', '#d8a33a', '#4a4a52'], hat: ['cap', 'cap', 'none'], collar: 'tee' },
  },
  {
    id: 'tourist', names: ['Ingrid', 'Paolo', 'Hana', 'Matteo', 'Freja'],
    likes: { umbrella: 3.4, paper: 1.2, sweets: 1.5, fizzy: 1.4, biscuits: 1.5, cards: 1.6, sunlotion: 2, icecream: 1.8 },
    wtp: 1.35, patience: 1.4, max: 4, weekend: 1.6,
    look: { hair: ['bob', 'curly', 'long', 'crop'], cloth: ['#e0574f', '#f0b429', '#4f9de0', '#6cbf6a'], hat: ['none', 'cap', 'sun'], collar: 'tee', pack: 0.8 },
  },
  {
    id: 'office', names: ['Claire', 'Raj', 'Helen', 'Oscar', 'Nadia'],
    likes: { paper: 1.7, fizzy: 1.3, choc: 1.4, apples: 1.4, tea: 1.1, bananas: 1.1 },
    wtp: 1.25, patience: 0.75, max: 3, weekend: 0.35,
    look: { hair: ['crop', 'bun', 'bob', 'short'], cloth: ['#3b4a63', '#4b3b5f', '#2f4f4a', '#5a4a3b'], hat: ['none'], collar: 'tie' },
  },
];

const LINES = {
  buy: ['Ooh, {n}!', 'Lovely, {n}.', '{n}, just the job.', 'Grabbing some {n}.'],
  weather: ['Just the thing in this weather, {n}.', 'Everyone will be after {n} today.', 'Glad you had {n} in.'],
  bargain: ['{n} at that price? Two, please.', 'Cheap {n}! Bargain.'],
  dear: ['{p} for {n}? No thanks.', 'Bit steep for {n}.', '{n} has gone up. I\'ll leave it.', 'I can get {n} cheaper up the road.'],
  empty: ['No {n} left?', 'Shelf\'s bare. Wanted {n}.', 'Stood there ages waiting for {n}.', 'Typical. No {n}.'],
  missing: ['Do you not sell {n}?', 'Shame you don\'t do {n}.', 'I was hoping for {n}.'],
  nothing: ['Nothing for me today.', 'Just looking.', 'Maybe tomorrow.'],
  busy: ['What a queue! I\'ll come back.', 'Not waiting in that line.'],
  walkout: ['I haven\'t got all day!', 'Is anyone serving?', 'Forget it, I\'m off.', 'This is taking forever.'],
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
// where the money lands on the counter mat, as fractions of its width and height
const COIN_SPOTS = [[0.12, 0.3], [0.34, 0.22], [0.56, 0.32], [0.78, 0.24], [0.12, 0.72],
                    [0.32, 0.78], [0.54, 0.7], [0.76, 0.76], [0.45, 0.5]];

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

// ---------- walking ----------
// Which tiles nobody can stand on: the stockroom, every fixture (fitted or not), the
// counter and the plant pots.
const BLOCKED = new Uint8Array(COLS * ROWS);
function blockRect(x, y, w, h) {
  for (let r = y; r < y + h; r++) for (let c = x; c < x + w; c++) BLOCKED[r * COLS + c] = 1;
}
for (const [x, y] of ROOM_WALLS) blockRect(x, y, 1, 1);
for (const pl of PALLETS) blockRect(pl.at[0], pl.at[1], 1, 1);
for (const f of FACINGS) blockRect(f.x, f.y, f.w, 1);
blockRect(COUNTER.x, COUNTER.y, COUNTER.w, COUNTER.h);
for (const [x, y] of PLANTS) blockRect(x, y, 1, 1);
export const walkable = (c, r) => c >= 0 && r >= 0 && c < COLS && r < ROWS && !BLOCKED[r * COLS + c];
// The stockroom's side wall stands on the line between tiles (x = STOCKROOM.w), not on a
// tile, so nothing walks across that line above the stockroom's front.
const inSideWall = (x, y, pad) => Math.abs(x - STOCKROOM.w) < 0.2 + pad && y - pad < STOCKROOM.h;
const crossesSideWall = (uc, ur, c, r) => Math.min(uc, c) === STOCKROOM.w - 1 && Math.max(uc, c) === STOCKROOM.w && Math.min(ur, r) < STOCKROOM.h;

// Can someone walk in a straight line from a to b? Checked along the line and a little
// either side of it, so people do not shave the corners of the shelves.
function clearLine(ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) return true;
  const nx = -dy / d * 0.28, ny = dx / d * 0.28;
  const n = Math.ceil(d / 0.2);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = ax + dx * t, y = ay + dy * t;
    for (const s of [0, 1, -1]) {
      const px = x + nx * s, py = y + ny * s;
      if (py >= ROWS) continue;   // the street side of the door
      if (!walkable(Math.floor(px), Math.floor(py)) || inSideWall(px, py, 0)) return false;
    }
  }
  return true;
}
// The nearest free tile to a point, for anyone who ends up standing somewhere odd.
function freeCell(x, y) {
  let c = clamp(Math.floor(x), 0, COLS - 1), r = clamp(Math.floor(y), 0, ROWS - 1);
  if (walkable(c, r)) return [c, r];
  let best = null, bd = 1e9;
  for (let rr = 0; rr < ROWS; rr++) for (let cc = 0; cc < COLS; cc++) {
    if (!walkable(cc, rr)) continue;
    const d = (cc + 0.5 - x) ** 2 + (rr + 0.5 - y) ** 2;
    if (d < bd) { bd = d; best = [cc, rr]; }
  }
  return best;
}
// Dijkstra over the tiles, eight ways with no corner-cutting, then pulled taut: each
// waypoint is skipped when the one after it can be walked to directly. Returns the
// points to walk through, ending exactly at (tx, ty).
export function findPath(fx, fy, tx, ty) {
  const s = freeCell(fx, fy), g = freeCell(tx, ty);
  const N = COLS * ROWS;
  const dist = new Float64Array(N).fill(Infinity);
  const prev = new Int32Array(N).fill(-1);
  const done = new Uint8Array(N);
  const si = s[1] * COLS + s[0], gi = g[1] * COLS + g[0];
  dist[si] = 0;
  for (;;) {
    let u = -1, ud = Infinity;
    for (let i = 0; i < N; i++) if (!done[i] && dist[i] < ud) { ud = dist[i]; u = i; }
    if (u < 0 || u === gi) break;
    done[u] = 1;
    const uc = u % COLS, ur = (u / COLS) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const c = uc + dx, r = ur + dy;
      if (!walkable(c, r)) continue;
      if (dx && dy && (!walkable(uc + dx, ur) || !walkable(uc, ur + dy))) continue;
      if (crossesSideWall(uc, ur, c, r)) continue;
      const v = r * COLS + c;
      const nd = ud + (dx && dy ? 1.4142 : 1);
      if (nd < dist[v]) { dist[v] = nd; prev[v] = u; }
    }
  }
  const cells = [];
  for (let i = gi; i >= 0 && i !== si; i = prev[i]) cells.push([(i % COLS) + 0.5, ((i / COLS) | 0) + 0.5]);
  cells.reverse();
  cells.push([tx, ty]);
  const out = [];
  let ax = fx, ay = fy, k = 0;
  while (k < cells.length) {
    let j = cells.length - 1;
    while (j > k && !clearLine(ax, ay, cells[j][0], cells[j][1])) j--;
    out.push(cells[j]);
    ax = cells[j][0]; ay = cells[j][1];
    k = j + 1;
  }
  return out;
}
// Moves someone along their path; true once they are at the end of it.
function walkOn(e, dt, speed) {
  let left = speed * dt;
  e.moving = false;
  while (left > 1e-9 && e.path.length) {
    const [tx, ty] = e.path[0];
    const dx = tx - e.x, dy = ty - e.y;
    const d = Math.hypot(dx, dy);
    if (d > 0.02) e.dir = Math.abs(dx) > Math.abs(dy) * 1.2 ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    if (d <= left) { e.x = tx; e.y = ty; e.path.shift(); left -= d; }
    else { e.x += dx / d * left; e.y += dy / d * left; left = 0; }
    if (d > 1e-6) e.moving = true;   // stepping onto where you already stand is not moving
  }
  if (e.moving) e.stride = (e.stride || 0) + speed * dt;
  return !e.path.length;
}
const sendTo = (e, x, y) => { e.path = findPath(e.x, e.y, x, y); };

// ---------- the shop ----------
export function createShop({ saved = null, rnd = Math.random, on = () => {} } = {}) {
  const rand = (a, b) => a + rnd() * (b - a);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const line = (kind, p, price) => cap1(pick(LINES[kind]).replace('{n}', p ? p.name.toLowerCase() : '').replace('{p}', price != null ? money(price) : ''));

  let state = null;   // everything that persists
  let day = null;     // the running day: customers, belt, timers
  // The keeper is on the floor whether the shop is open or not. Where they stand is not
  // saved; what they are carrying is (state.carry), and goes back in the stockroom on load.
  const keeper = { x: TILL_SPOT[0], y: TILL_SPOT[1], path: [], dir: 'up', job: null, moving: false, stride: 0 };

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
      v: 2, day: 1, cash: START_CASH, rep: 50, weather: 'cloudy', nextWeather: rollWeather(2),
      slots: FACINGS.map((f, i) => (START_FACINGS.includes(i) ? null : false)),
      stock: FACINGS.map(() => 0),   // how many are on each facing
      room: {}, prices: {}, pending: [], arriving: [], carry: null,
      pallets: PALLETS.flatMap(() => [null, null]),   // each side of each pallet: { pid, q } or null
      today: freshToday(), totals: freshStats(), warn: 0, phase: 'closed', bestDay: 0, sold: 0, days: [], report: null,
    };
    for (const p of PRODUCTS) { s.prices[p.id] = p.ref; s.room[p.id] = []; }
    // Empty shelves, empty stockroom. Nothing to sell until you order it in.
    s.today.repStart = s.rep;
    return s;
  }

  // Takes this game's saves (v2) and the till game's before it (v1), whose shelves were a
  // list of 8 to 12 products: those land on the first facings in order.
  function loadState(raw) {
    if (!raw || (raw.v !== 1 && raw.v !== 2) || !Array.isArray(raw.slots)) return freshState();
    const s = freshState();
    s.day = Math.max(1, Math.floor(Number(raw.day) || 1));
    s.cash = Number(raw.cash);
    if (!isFinite(s.cash)) s.cash = START_CASH;
    s.rep = clamp(Number(raw.rep) || 50, 0, 100);
    s.weather = WEATHER[raw.weather] ? raw.weather : 'cloudy';
    s.nextWeather = WEATHER[raw.nextWeather] ? raw.nextWeather : rollWeather(s.day + 1);
    // v2 keeps a slot per facing (false where none is fitted); v1 kept a list of shelves
    const list = raw.v === 2 ? raw.slots : FACINGS.map((f, i) => { const k = FIT_ORDER.indexOf(i); return k < raw.slots.length ? raw.slots[k] : false; });
    const seen = new Set();
    s.slots = FACINGS.map((f, i) => {
      const v = list[i];
      if (v === false || v === undefined) return false;
      if (!prod(v) || seen.has(v)) return null;
      seen.add(v);
      return v;
    });
    for (const p of PRODUCTS) {
      s.prices[p.id] = r5(clamp(Number(raw.prices && raw.prices[p.id]) || p.ref, 0.05, 50));
      const batches = Array.isArray(raw.room && raw.room[p.id]) ? raw.room[p.id] : [];
      s.room[p.id] = batches.map((b) => ({ q: Math.max(0, Math.floor(Number(b.q) || 0)), age: Math.max(0, Math.floor(Number(b.age) || 0)) })).filter((b) => b.q > 0);
    }
    // anything on the shelves that no longer has a facing goes back in the stockroom
    // what is on each shelf: v2 saves since 2026-10-15 count per facing (a product can have
    // two shelves); earlier ones counted per product, which goes on its first facing
    if (Array.isArray(raw.stock) && raw.stock.length === FACINGS.length) {
      s.stock = raw.stock.map((q, i) => (s.slots[i] ? clamp(Math.floor(Number(q) || 0), 0, prod(s.slots[i]).cap) : 0));
    } else if (raw.shelf) {
      for (const p of PRODUCTS) {
        const q = Math.max(0, Math.floor(Number(raw.shelf[p.id]) || 0));
        const i = s.slots.indexOf(p.id);
        const put = i >= 0 ? Math.min(q, p.cap) : 0;
        if (i >= 0) s.stock[i] = put;
        if (q > put) s.room[p.id].push({ q: q - put, age: 0 });
      }
    }
    // and so does whatever the keeper had in their arms
    if (raw.carry && prod(raw.carry.pid) && raw.carry.q > 0) s.room[raw.carry.pid].push({ q: Math.floor(raw.carry.q), age: 0 });
    if (Array.isArray(raw.pallets) && raw.pallets.length === PALLETS.length * 2) {
      s.pallets = raw.pallets.map((x) => (x && prod(x.pid) && x.q > 0 ? { pid: x.pid, q: Math.floor(x.q) } : null));
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
    s.phase = raw.phase === 'over' ? 'over' : raw.phase === 'evening' ? 'evening' : 'closed';   // reloading mid-day reopens in the morning
    return s;
  }

  const roomQty = (pid) => state.room[pid].reduce((a, b) => a + b.q, 0);
  const roomAge = (pid) => state.room[pid].reduce((a, b) => Math.max(a, b.age), 0);
  // `slot`: which pallet side it goes on (else the product's own pile, or the first free side)
  function addToRoom(pid, q, age, slot) {
    if (q <= 0) return;
    const b = state.room[pid].find((x) => x.age === age);
    if (b) b.q += q; else state.room[pid].push({ q, age });
    const P = state.pallets;
    if (slot != null && (!P[slot] || P[slot].pid === pid)) P[slot] = { pid, q: (P[slot] ? P[slot].q : 0) + q };
    syncPallets();
  }
  // Where the stockroom's stock stands. The batches (state.room) are the truth; the pallets
  // say which side each product's boxes are on. Anything not on a pallet yet goes on the
  // product's own pile or the first free side; anything gone comes off its last pile.
  function syncPallets() {
    const P = state.pallets;
    for (const p of PRODUCTS) {
      const want = roomQty(p.id);
      let have = 0;
      for (const x of P) if (x && x.pid === p.id) have += x.q;
      if (have < want) {
        let k = P.findIndex((x) => x && x.pid === p.id);
        if (k < 0) k = P.findIndex((x) => !x);
        if (k >= 0) P[k] = { pid: p.id, q: (P[k] ? P[k].q : 0) + want - have };
      } else if (have > want) {
        let extra = have - want;
        for (let k = P.length - 1; k >= 0 && extra > 0; k--) {
          if (!P[k] || P[k].pid !== p.id) continue;
          const t = Math.min(P[k].q, extra);
          P[k].q -= t; extra -= t;
        }
      }
    }
    for (let k = 0; k < P.length; k++) if (P[k] && P[k].q <= 0) P[k] = null;
  }
  function takeFromRoom(pid, n, slot) {
    const P = state.pallets;
    if (slot != null && P[slot] && P[slot].pid === pid) P[slot].q -= Math.min(P[slot].q, n);
    const got = takeBatches(pid, n);
    syncPallets();
    return got;
  }
  function takeBatches(pid, n) {
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
  const facingOf = (pid) => state.slots.indexOf(pid);
  // A product can have more than one shelf (Amber, 2026-10-15): stock is counted per facing.
  const facingsOf = (pid) => state.slots.reduce((a, x, i) => (x === pid ? a.concat(i) : a), []);
  const shelfOf = (pid) => facingsOf(pid).reduce((a, i) => a + state.stock[i], 0);
  const stocked = () => [...new Set(state.slots.filter((x) => x))];
  const shelfTotal = () => state.stock.reduce((a, q) => a + q, 0);
  const stockTotal = () => shelfTotal() + PRODUCTS.reduce((a, p) => a + roomQty(p.id), 0) + (state.carry ? state.carry.q : 0);
  // The facing of pid nearest (x, y), preferring one with something on it; -1 if none.
  function bestFacing(pid, x, y, skip) {
    let best = -1, bd = Infinity;
    for (const i of facingsOf(pid)) {
      if (i === skip) continue;
      const f = FACINGS[i];
      const d = Math.hypot(f.spot[0] - x, f.spot[1] - y) + (state.stock[i] > 0 ? 0 : 100);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  // With nothing in the shop there is no day to be had, so the wholesaler lets you drive
  // over and collect the first order yourself rather than wait for the van. That is how
  // day one starts, and how you dig out of a sell-out.
  const sameDayDelivery = () => state.phase === 'closed' && stockTotal() === 0;
  function bumpRep(n) {
    state.rep = clamp(state.rep + n, 0, 100);
    on('hud');
  }

  // ---------- the keeper ----------
  // You walk the floor yourself: tap where to go, or steer with the keys. Stock moves by
  // hand: in the stockroom you pick a box up, you carry it to its shelf, and you stack it.
  // One job at a time; a new one replaces the old, and whatever is in your arms stays there.
  //   { kind: 'walk' }             just go there
  //   { kind: 'till' }             get to the counter
  //   { kind: 'room' }             walk into the stockroom
  //   { kind: 'crate', pid }       walk up to that product's boxes and lift one
  //   { kind: 'stow' }             walk into the stockroom and put the box down
  //   { kind: 'shelf', i }         carry the box to facing i ('stack' when there)
  //   { kind: 'stack', i, t }      putting things on the shelf, one by one
  //   { kind: 'pick', pid, t }     lifting a box in the stockroom
  const near = (x, y, r) => Math.hypot(keeper.x - x, keeper.y - y) < r;
  // Close enough to serve: standing still anywhere along the front of the counter or at
  // either end of it (Amber: next to the counter is close enough), not on the customers' side.
  const atTill = () => {
    if (keeper.moving || keeper.path.length) return false;
    const C = COUNTER;
    const dx = Math.max(C.x - keeper.x, 0, keeper.x - (C.x + C.w));
    const dy = Math.max(C.y - keeper.y, 0, keeper.y - (C.y + C.h));
    return Math.hypot(dx, dy) < 1.1 && keeper.y > C.y;
  };
  const atRoom = () => keeper.x < STOCKROOM.w && keeper.y < STOCKROOM.h - 0.1;
  const atFacing = (i) => near(FACINGS[i].spot[0], FACINGS[i].spot[1], 1.25);
  function setJob(job, x, y) {
    keeper.job = job;
    keeper.steer = null;
    if (x != null) sendTo(keeper, x, y); else keeper.path = [];
  }
  function walkTo(x, y) {
    if (state.phase === 'over' || state.phase === 'evening') return;
    const [c, r] = freeCell(x, y);
    const fx = walkable(Math.floor(x), Math.floor(y)) ? x : c + 0.5;
    const fy = walkable(Math.floor(x), Math.floor(y)) ? y : r + 0.5;
    setJob({ kind: 'walk' }, fx, fy);
  }
  function goTill() {
    if (atTill() || (near(TILL_SPOT[0], TILL_SPOT[1], 0.05) && !keeper.steer)) { keeper.job = null; keeper.path = []; return; }
    setJob({ kind: 'till' }, TILL_SPOT[0], TILL_SPOT[1]);
  }
  function goRoom() {
    setJob({ kind: 'room' }, ROOM_SPOT[0], ROOM_SPOT[1]);
  }
  // What is in the stockroom, as boxes on pallets: { pid, q, pallet, side, slot } for each
  // pallet side with something on it.
  function crates() {
    const out = [];
    state.pallets.forEach((x, k) => { if (x) out.push({ pid: x.pid, q: x.q, pallet: k >> 1, side: k & 1, slot: k }); });
    return out;
  }
  // Can the box in your arms go on this side? If it is free, or already holds the same.
  const sideTakes = (k) => !!state.carry && (!state.pallets[k] || state.pallets[k].pid === state.carry.pid);
  function faceCrate(cr) {
    const [cx, cy] = PALLETS[cr.pallet].at;
    const dx = cx + 0.5 - keeper.x, dy = cy + 0.5 - keeper.y;
    keeper.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
  }
  // Walk up to a pile of pid in the stockroom (pallet side `slot`, or its first pile) and lift
  // a box (as much as its shelf has room for, a box at most). Whatever you were carrying goes
  // back on its own pile first.
  function pickUp(pid, slot) {
    const p = prod(pid);
    if (!p) return { ok: false, msg: '' };
    if (state.carry && state.carry.pid === pid) return { ok: false, msg: 'You already have the ' + p.name.toLowerCase() + '.' };
    const k = slot != null ? slot : state.pallets.findIndex((x) => x && x.pid === pid);
    if (k < 0 || !state.pallets[k] || state.pallets[k].pid !== pid) return { ok: false, msg: 'No ' + p.name.toLowerCase() + ' in the stockroom.' };
    const [fx, fy] = PALLETS[k >> 1].from;
    if (near(fx, fy, 0.5)) {
      putBackCarry();
      setJob({ kind: 'pick', pid, slot: k, t: 0 });
      faceCrate({ pallet: k >> 1 });
    } else setJob({ kind: 'crate', pid, slot: k }, fx, fy);
    return { ok: true };
  }
  // Put what you are carrying down in the stockroom: on pallet side `slot` if given (any
  // free side, or one with the same thing on it), else on its own pile or the first free
  // side. Walks there to do it.
  function putDown(slot) {
    if (!state.carry) return { ok: false, msg: '' };
    if (slot != null && !sideTakes(slot)) return { ok: false, msg: 'That side of the pallet has ' + prod(state.pallets[slot].pid).name.toLowerCase() + ' on it. Use a free side.' };
    if (slot == null) {
      if (atRoom()) { putBackCarry(); on('sfx', 'box'); keeper.job = null; return { ok: true }; }
      setJob({ kind: 'stow' }, ROOM_SPOT[0], ROOM_SPOT[1]);
      return { ok: true };
    }
    const [fx, fy] = PALLETS[slot >> 1].from;
    if (near(fx, fy, 0.5)) {
      faceCrate({ pallet: slot >> 1 });
      putBackCarry(slot);
      on('sfx', 'box');
      keeper.job = null;
    } else setJob({ kind: 'stow', slot }, fx, fy);
    return { ok: true };
  }
  // Walk your box to facing i and stack it. Any shelf will do: an empty one, or one whose
  // product has sold out, takes what you are carrying (moving it from its old shelf, if it
  // had one). A shelf with something else still on it does not. Returns { ok, msg }.
  function restock(i) {
    const here = state.slots[i];
    if (here === false || here === undefined) return { ok: false, msg: '' };
    if (!state.carry) {
      // before opening, empty arms take a shelf's things off it, to move them somewhere else
      if (here && state.stock[i] > 0 && state.phase !== 'open') { goShelf(i, true); return { ok: true, take: true }; }
      return {
        ok: false,
        msg: here ? 'Fetch a box of ' + prod(here).name.toLowerCase() + ' from the stockroom first.' : 'An empty shelf. Bring a box out of the stockroom and it will take it.',
      };
    }
    const pid = state.carry.pid;
    const p = prod(pid);
    if (here && here !== pid) {
      if (state.stock[i] > 0) return { ok: false, msg: 'That shelf still has ' + prod(here).name.toLowerCase() + ' on it. Use an empty shelf.' };
    }
    if (here === pid && state.stock[i] >= p.cap) return { ok: false, msg: 'That shelf of ' + p.name.toLowerCase() + ' is already full.' };
    goShelf(i, false);
    return { ok: true };
  }
  function goShelf(i, take) {
    const f = FACINGS[i];
    if (atFacing(i)) { if (take) startUnstack(i); else startStack(i); }
    else setJob({ kind: 'shelf', i, take }, f.spot[0], f.spot[1]);
  }
  function startUnstack(i) {
    setJob({ kind: 'unstack', i, t: STOCK_EACH * 0.6 });
    keeper.dir = FACINGS[i].kind === 'table' ? 'down' : 'up';
  }
  // On arriving at a shelf with a box for it: if the shelf is not this product's yet, it
  // becomes so now. Its other shelves stay its too: a product can have several.
  function claimFacing(i) {
    const pid = state.carry && state.carry.pid;
    const here = state.slots[i];
    if (!pid || here === pid) return here === pid;
    if (here === false || (here && state.stock[i] > 0)) return false;
    state.slots[i] = pid;
    on('side');
    return true;
  }
  function startStack(i) {
    if (!claimFacing(i)) { keeper.job = null; return; }
    setJob({ kind: 'stack', i, t: STOCK_EACH * 0.6 });
    keeper.dir = FACINGS[i].kind === 'table' ? 'down' : 'up';
  }
  // E or Space: whatever is in front of you. A stack of boxes in the stockroom, a shelf,
  // or the till.
  function interact() {
    if (atRoom()) {
      let k = -1, kd = 1.35;
      state.pallets.forEach((x, j) => {
        // with a box, the nearest side that takes it; without, the nearest side with boxes
        if (state.carry ? !sideTakes(j) : !x) return;
        const [px0, py0] = PALLETS[j >> 1].at;
        const d = Math.hypot(keeper.x - (px0 + 0.3 + (j & 1) * 0.4), keeper.y - (py0 + 0.5));
        if (d < kd) { kd = d; k = j; }
      });
      if (state.carry) return Object.assign(putDown(k >= 0 ? k : undefined), { what: 'room' });
      if (k >= 0) return Object.assign(pickUp(state.pallets[k].pid, k), { what: 'crate' });
      return { ok: false, msg: 'Walk up to a stack of boxes to pick one up.' };
    }
    let best = -1, bd = 1.6;
    FACINGS.forEach((f, i) => {
      const d = Math.hypot(keeper.x - f.spot[0], keeper.y - f.spot[1]);
      if (d < bd && state.slots[i] !== false) { bd = d; best = i; }
    });
    if (best >= 0) {
      const r = restock(best);
      return Object.assign(r, { what: 'facing', i: best });
    }
    if (near(TILL_SPOT[0], TILL_SPOT[1], 1.6)) { goTill(); return { ok: true, what: 'till' }; }
    return { ok: false, msg: 'Nothing to do here. Walk up to a shelf, the stockroom door or the till.' };
  }
  // Steering with the keys (or a pad): dx, dy in -1..1, or null to stop. It cancels whatever
  // you were doing (half a shelf stacked stays stacked; a box half lifted stays put), and
  // slides along walls rather than sticking to them.
  function steer(dx, dy) {
    if (!dx && !dy) { keeper.steer = null; return; }
    keeper.job = null;
    keeper.path = [];
    const d = Math.hypot(dx, dy);
    keeper.steer = { x: dx / d, y: dy / d };
  }
  const freeAt = (x, y) => {
    const R = 0.26;
    for (const [ox, oy] of [[-R, -R], [R, -R], [-R, R], [R, R]]) {
      if (!walkable(Math.floor(x + ox), Math.floor(y + oy))) return false;
    }
    return !inSideWall(x, y, R);
  };
  function steerOn(dt) {
    const s = keeper.steer;
    const step = KEEPER_SPEED * dt;
    const nx = keeper.x + s.x * step, ny = keeper.y + s.y * step;
    keeper.moving = false;
    if (freeAt(nx, keeper.y)) { keeper.x = nx; keeper.moving = true; }
    if (freeAt(keeper.x, ny)) { keeper.y = ny; keeper.moving = true; }
    keeper.dir = Math.abs(s.x) > Math.abs(s.y) * 1.2 ? (s.x > 0 ? 'right' : 'left') : (s.y > 0 ? 'down' : 'up');
    if (keeper.moving) keeper.stride += step;
  }
  function putBackCarry(slot) {
    if (!state.carry) return;
    addToRoom(state.carry.pid, state.carry.q, 0, slot);
    state.carry = null;
    on('side');
  }
  function updateKeeper(dt) {
    if (keeper.steer) { steerOn(dt); return; }
    const arrived = walkOn(keeper, dt, KEEPER_SPEED);
    const job = keeper.job;
    if (!job || !arrived) return;
    if (job.kind === 'walk') { keeper.job = null; return; }
    if (job.kind === 'till') { keeper.job = null; keeper.dir = 'up'; return; }
    if (job.kind === 'room') { keeper.job = null; keeper.dir = 'up'; return; }
    if (job.kind === 'stow') {
      keeper.job = null;
      if (job.slot != null) faceCrate({ pallet: job.slot >> 1 });
      if (job.slot != null && !sideTakes(job.slot)) { on('note', 'That side of the pallet has something else on it now.'); return; }
      putBackCarry(job.slot);
      on('sfx', 'box');
      return;
    }
    if (job.kind === 'crate') {
      const P = state.pallets[job.slot];
      if (!P || P.pid !== job.pid) { keeper.job = null; return; }
      putBackCarry();
      faceCrate({ pallet: job.slot >> 1 });
      keeper.job = { kind: 'pick', pid: job.pid, slot: job.slot, t: 0 };
      return;
    }
    if (job.kind === 'shelf') {
      if (job.take) startUnstack(job.i);
      else if (state.carry) startStack(job.i);
      else keeper.job = null;
      return;
    }
    if (job.kind === 'pick') {
      job.t += dt;
      if (job.t < PICK_TIME) return;
      const p = prod(job.pid);
      // as much as its shelves have room for, a box at most
      const space = facingsOf(job.pid).reduce((a, i) => a + p.cap - state.stock[i], 0);
      const got = takeFromRoom(job.pid, space > 0 ? Math.min(p.box, space) : p.box, job.slot);
      keeper.job = null;
      if (!got) { on('note', 'No ' + p.name.toLowerCase() + ' left in the stockroom.'); return; }
      state.carry = { pid: job.pid, q: got };
      on('sfx', 'box');
      on('side');
      on('note', 'Carrying ' + got + ' ' + p.name.toLowerCase() + '. ' +
        (facingOf(job.pid) >= 0 ? 'Take it to its shelf.' : 'Put it on any empty shelf.'));
      return;
    }
    if (job.kind === 'unstack') {
      // things off the shelf and into a box in your arms, one at a time
      const pid = state.slots[job.i];
      if (!pid || (state.carry && state.carry.pid !== pid) || state.phase === 'open') { keeper.job = null; return; }
      job.t += dt;
      while (job.t >= STOCK_EACH && state.stock[job.i] > 0) {
        job.t -= STOCK_EACH;
        state.stock[job.i]--;
        state.carry = { pid, q: (state.carry ? state.carry.q : 0) + 1 };
        on('sfx', 'stack');
      }
      if (!state.stock[job.i]) {
        keeper.job = null;
        on('note', 'Took ' + state.carry.q + ' ' + prod(pid).name.toLowerCase() + ' off the shelf. Stack them on another shelf, or put them back in the stockroom.');
        on('side');
      }
      return;
    }
    if (job.kind === 'stack') {
      const pid = state.slots[job.i];
      if (!state.carry || pid !== state.carry.pid) { keeper.job = null; return; }
      const p = prod(pid);
      job.t += dt;
      while (job.t >= STOCK_EACH && state.carry && state.stock[job.i] < p.cap) {
        job.t -= STOCK_EACH;
        state.carry.q--;
        state.stock[job.i]++;
        on('sfx', 'stack');
        if (!state.carry.q) state.carry = null;
      }
      if (!state.carry || state.stock[job.i] >= p.cap) {
        keeper.job = null;
        if (state.carry) on('note', 'Shelf full, with ' + state.carry.q + ' left in the box. Put it back in the stockroom or keep it for later.');
        on('side');
      }
    }
  }
  // ---------- shelves ----------
  function buyShelf(i) {
    if (state.slots[i] !== false) return { ok: false, msg: '' };
    if (state.cash < SHELF_COST) return { ok: false, msg: 'Not enough cash for another shelf.' };
    state.cash -= SHELF_COST;
    state.today.spent += SHELF_COST;
    state.slots[i] = null;
    on('hud');
    on('side');
    return { ok: true, msg: 'New shelf fitted. Bring a box out of the stockroom to fill it.' };
  }
  function setPrice(pid, v) { state.prices[pid] = clamp(Math.round(v * 100) / 100, 0.05, 50); }
  function nudgePrice(pid, d) { state.prices[pid] = r5(clamp(state.prices[pid] + 0.05 * d, 0.05, 50)); }

  // ---------- customers ----------
  function makeLook(persona) {
    const cfg = persona.look;
    return {
      skin: pick(SKINS),
      hair: pick(cfg.hair),
      hairCol: cfg.grey ? pick(GREYS) : pick(HAIRS),
      cloth: pick(cfg.cloth),
      legs: pick(LEGS),
      hat: cfg.hat ? pick(cfg.hat) : 'none',
      collar: cfg.collar || '',
      small: !!cfg.small,
      slow: !!cfg.slow,
      dog: rnd() < (cfg.dog || 0),
      pack: rnd() < (cfg.pack || 0),
      mood: '',
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
    const r = { name: c.name, look: c.look, kind, text };
    c.remarks.push(r);
    if (kind !== 'buy') {
      state.today.remarks.push(r);
      if (state.today.remarks.length > 40) state.today.remarks.shift();
    }
  }
  const bubble = (c, kind, pid, secs) => { c.bubble = { kind, pid: pid || null, until: secs ? day.t + secs : 0 }; };
  function sadden(c) { c.look.mood = c.basket.length || c.look.mood === '' ? 'flat' : 'sad'; }

  // Two of a sort sharing a name as well read as one person walking straight back in, so
  // nobody in the shop, or among the last few through the door, shares one.
  function freshName(persona) {
    const taken = new Set(day.recent);
    for (const o of day.people) taken.add(o.name);
    const free = persona.names.filter((n) => !taken.has(n));
    const name = pick(free.length ? free : persona.names);
    day.recent.push(name);
    if (day.recent.length > 6) day.recent.shift();
    return name;
  }
  function enterCustomer() {
    const persona = weightedPersona();
    const x = DOOR.x + 1 + rand(-0.5, 0.5);
    const c = {
      id: ++day.uid, persona, look: makeLook(persona), name: freshName(persona),
      wants: [], plan: [], basket: [], missed: [], remarks: [],
      x, y: ROWS + 0.5, path: [[x, ROWS - 0.5]], dir: 'up', stride: 0, moving: false,
      state: 'walk', t: 0, bubble: null, tillTime: 0, patience: 0, maxPatience: 1,
      speed: SHOPPER_SPEED * (persona.look.slow ? 0.8 : 1) * rand(0.92, 1.08),
    };
    c.wants = buildWants(persona);
    // anything they came for that you do not sell, they know about as soon as they look round
    for (const p of c.wants) {
      const st = todayStat(p.id), tot = state.totals[p.id];
      st.wanted++; tot.wanted++;
      if (!state.slots.includes(p.id)) {
        st.missing++; tot.missing++;
        c.missed.push({ p, why: 'missing' });
        logRemark(c, 'missing', line('missing', p));
      } else c.plan.push({ p, waited: false });
    }
    if (c.missed.length) bubble(c, 'missing', c.missed[0].p.id, 2.2);
    // round the shop nearest first, from the door
    const ordered = [];
    let px = x, py = ROWS;
    while (c.plan.length) {
      let bi = 0, bd = Infinity;
      c.plan.forEach((it, k) => {
        it.i = bestFacing(it.p.id, px, py);
        const f = FACINGS[it.i];
        const d = Math.hypot(f.spot[0] - px, f.spot[1] - py);
        if (d < bd) { bd = d; bi = k; }
      });
      const it = c.plan.splice(bi, 1)[0];
      const f = FACINGS[it.i];
      px = f.spot[0]; py = f.spot[1];
      ordered.push(it);
    }
    c.plan = ordered;
    day.people.push(c);
    on('sfx', 'bell');
    nextStop(c, true);
  }
  // Off to the next shelf on their list, or to the queue, or home.
  function nextStop(c, first) {
    if (c.plan.length) {
      const it = c.plan[0];
      if (state.slots[it.i] !== it.p.id) it.i = bestFacing(it.p.id, c.x, c.y);
      const i = it.i;
      if (i < 0) { // taken off the shelves while they were on their way
        const p = c.plan.shift().p;
        missEmpty(c, p);
        nextStop(c);
        return;
      }
      const f = FACINGS[i];
      c.state = 'walk';
      const tx = f.spot[0] + rand(-0.45, 0.45), ty = f.spot[1] + rand(-0.08, 0.12);
      if (first) c.path.push(...findPath(c.path[0][0], c.path[0][1], tx, ty));
      else sendTo(c, tx, ty);
      return;
    }
    doneShopping(c);
  }
  function missEmpty(c, p) {
    const st = todayStat(p.id), tot = state.totals[p.id];
    st.empty++; tot.empty++;
    c.missed.push({ p, why: 'empty' });
    logRemark(c, 'empty', line('empty', p));
    bumpRep(-0.6);
    sadden(c);
  }
  // At the shelf: take it if it is there and fair, wait a while if the shelf is bare.
  function tryShelf(c) {
    const it = c.plan[0];
    const p = it.p;
    if (state.slots[it.i] !== p.id) it.i = bestFacing(p.id, c.x, c.y);
    if (it.i < 0 || state.stock[it.i] <= 0) {
      // bare here, but another shelf of it has some: over there instead (once)
      const alt = it.i >= 0 ? bestFacing(p.id, c.x, c.y, it.i) : -1;
      if (alt >= 0 && state.stock[alt] > 0 && !it.moved) {
        it.moved = true;
        it.i = alt;
        c.bubble = null;
        nextStop(c);
        return;
      }
      if (!it.waited && it.i >= 0) {
        it.waited = true;
        c.state = 'wait';
        c.t = 0;
        bubble(c, 'want', p.id);
        return;
      }
      c.plan.shift();
      c.bubble = null;
      missEmpty(c, p);
      nextStop(c);
      return;
    }
    c.bubble = null;
    const st = todayStat(p.id), tot = state.totals[p.id];
    const w = WEATHER[state.weather].mult;
    // a shop people speak well of can charge a little more: 0.92 at nothing to 1.10 at 100
    const loyal = 0.92 + state.rep * 0.0018;
    const price = state.prices[p.id];
    const wtp = p.ref * c.persona.wtp * loyal * rand(0.92, 1.4);
    c.plan.shift();
    if (price > wtp + 0.001) {
      st.dear++; tot.dear++;
      c.missed.push({ p, why: 'dear' });
      logRemark(c, 'dear', line('dear', p, price));
      bubble(c, 'dear', p.id, 1.6);
      sadden(c);
      nextStop(c);
      return;
    }
    let q = 1;
    let kind = 'buy';
    if (price < p.ref * 0.8 && rnd() < 0.55) { q = 2; kind = 'bargain'; }
    else if (p.ref < 1 && rnd() < 0.25) q = 2;
    if ((w[p.id] || 1) >= 1.5 && kind === 'buy') kind = 'weather';
    q = Math.min(q, state.stock[it.i]);
    state.stock[it.i] -= q;
    st.bought += q; tot.bought += q;
    const had = c.basket.find((b) => b.p === p);
    if (had) had.q += q; else c.basket.push({ p, q });
    logRemark(c, kind, line(kind, p));
    on('side');
    nextStop(c);
  }
  function doneShopping(c) {
    const units = c.basket.reduce((a, b) => a + b.q, 0);
    if (!units) {
      state.today.nothing++;
      if (!c.remarks.length) logRemark(c, 'nothing', line('nothing'));
      leave(c);
      return;
    }
    if (day.queue.length >= MAX_QUEUE) {
      returnBasket(c);
      state.today.busy++;
      bumpRep(-2);
      logRemark(c, 'busy', line('busy'));
      on('note', c.name + ' took one look at the queue and left.');
      bubble(c, 'cross', null, 1.6);
      leave(c);
      return;
    }
    c.state = 'queue';
    day.queue.push(c);
    lineUp();
  }
  // Everyone in the queue walks to their place in it; only those whose place changed move.
  function lineUp() {
    day.queue.forEach((c, k) => {
      const [x, y] = QUEUE_SPOTS[k];
      if (c.spot === k) return;
      c.spot = k;
      sendTo(c, x, y);
    });
  }
  function leave(c) {
    c.state = 'out';
    c.spot = -1;
    const x = DOOR.x + 1 + rand(-0.5, 0.5);
    c.path = findPath(c.x, c.y, x, ROWS - 0.5);
    c.path.push([x, ROWS + 0.6]);
  }
  function returnBasket(c) {
    for (const b of c.basket) {
      const p = b.p;
      // back on its shelves while there is room, the rest to the stockroom
      let left = b.q;
      for (const i of facingsOf(p.id)) {
        const put = Math.min(p.cap - state.stock[i], left);
        state.stock[i] += put;
        left -= put;
      }
      addToRoom(p.id, left, 0);
      todayStat(p.id).bought -= b.q;
      state.totals[p.id].bought -= b.q;
    }
    c.basket = [];
    on('side');
  }
  function updateCustomer(c, dt) {
    const arrived = walkOn(c, dt, c.speed);
    if (c.bubble && c.bubble.until && day.t >= c.bubble.until) c.bubble = null;
    switch (c.state) {
      case 'walk':
        if (arrived) { c.state = 'browse'; c.t = 0; c.dir = c.plan[0] && FACINGS[c.plan[0].i] && FACINGS[c.plan[0].i].kind === 'table' ? 'down' : 'up'; }
        break;
      case 'browse':
        c.t += dt;
        if (c.t >= BROWSE_TIME) tryShelf(c);
        break;
      case 'wait': {
        c.t += dt;
        const p = c.plan[0].p;
        if (shelfOf(p.id) > 0 || c.t >= SHELF_WAIT * c.persona.patience) tryShelf(c);
        break;
      }
      case 'queue':
        if (arrived && c.spot >= 0) c.dir = 'right';
        break;
      case 'approach':
        if (arrived) startTill(c);
        break;
      case 'till':
        c.tillTime += dt;
        c.patience -= dt;
        if (!atTill()) { if (!c.bubble || c.bubble.kind !== 'till') bubble(c, 'till'); }
        else if (c.bubble && c.bubble.kind === 'till') c.bubble = null;
        if (c.patience <= 0) walkout(c);
        break;
      case 'paying':
        c.t += dt;   // the money is down; they wait while you pick it up
        break;
      case 'done':
        c.t += dt;
        if (c.t >= 0.6) {
          day.till = null;
          day.belt = []; day.bag = []; day.rung = []; day.total = 0;
          clearCoins();
          on('till-clear');
          leave(c);
        }
        break;
      case 'out':
        if (arrived) c.gone = true;
        break;
    }
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
    out.forEach((m, i) => {
      const sp = spots[i % spots.length];
      m.x = sp[0] + rand(-0.03, 0.03);
      m.y = sp[1] + rand(-0.05, 0.05);
      m.rot = Math.round(rand(-14, 14));
    });
    return out;
  }
  function offerPayment(c) {
    c.state = 'paying';
    c.t = 0;
    day.coins = makeMoney(day.total);
    day.owed = day.total;
    on('coins');
    if (!day.coins.length) complete(c);
  }
  // Scanning, bagging and taking the money all need you at the till.
  function takeCoin(uid) {
    if (!day || !day.coins || !atTill()) return false;
    const i = day.coins.findIndex((m) => m.uid === uid);
    if (i < 0) return false;
    const m = day.coins.splice(i, 1)[0];
    const v = m.v / 100;
    state.cash += v;
    state.today.takings += v;
    day.owed = r5(Math.max(0, day.owed - v));
    on('sfx', 'clink');
    on('coin-taken', uid);
    on('hud');
    if (!day.coins.length && day.till && day.till.state === 'paying') complete(day.till);
    return true;
  }
  function clearCoins() {
    if (day) { day.coins = []; day.owed = 0; }
    on('coins');
  }
  function startTill(c) {
    c.state = 'till';
    c.dir = 'down';
    c.t = 0;
    c.tillTime = 0;
    const units = c.basket.reduce((a, b) => a + b.q, 0);
    c.maxPatience = (16 + 4 * units) * c.persona.patience;
    c.patience = c.maxPatience;
    day.belt = [];
    let uid = 0;
    for (const b of c.basket) for (let i = 0; i < b.q; i++) day.belt.push({ uid: c.id + 'i' + uid++, p: b.p, scanned: false });
    day.belt.sort(() => rnd() - 0.5);
    day.bag = [];
    day.rung = [];
    day.total = 0;
    day.coins = [];
    day.owed = 0;
    if (!atTill()) on('sfx', 'ding');
    on('till', c);
  }
  function scanItem(uid) {
    if (!day || !day.till || day.till.state !== 'till' || !atTill()) return false;
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
    if (!day || !day.till || day.till.state !== 'till' || !atTill()) return false;
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
    // quick is from the moment they reached the counter, so a dash back from the shelves counts
    const quick = c.tillTime < 7 + 2.4 * units;
    const slow = c.patience < c.maxPatience * 0.25;
    if (quick) state.today.quick++;
    // good service is worth less the better known for it you already are: the top is earned
    bumpRep((quick ? 1.5 : slow ? 0 : 1) * (1 - state.rep / 110));
    on('sfx', 'chime');
    c.state = 'done';
    c.t = 0;
    c.look.mood = slow ? 'flat' : '';
    bubble(c, slow ? 'meh' : 'happy', null, 1.4);
    on('paid', { c, text: line(quick ? 'quick' : slow ? 'slow' : 'thanks'), total: day.total });
  }
  function walkout(c) {
    returnBasket(c);
    state.today.walked++;
    bumpRep(-4);
    logRemark(c, 'walkout', line('walkout'));
    on('sfx', 'thud');
    on('note', c.name + ' gave up waiting at the till and walked out. Everything went back on the shelf.');
    c.look.mood = 'sad';
    bubble(c, 'cross', null, 1.8);
    day.till = null;
    day.belt = []; day.bag = []; day.rung = []; day.total = 0;
    clearCoins();
    on('walkout', { c, text: c.remarks[c.remarks.length - 1].text });
    on('till-clear');
    leave(c);
  }

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
    on('hud');
    on('side');
    return {
      ok: true,
      msg: now
        ? 'You fetch it from the cash and carry yourself. It is in the stockroom: get it on the shelves.'
        : state.phase === 'closed'
          ? 'Order placed. The van pulls up as you open the door. It goes in the stockroom, so you will be carrying it out between customers.'
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
    const untouched = stocked().filter((pid) => st[pid].wanted === 0 && shelfOf(pid) > 0).map((pid) => prod(pid).name.toLowerCase());
    if (untouched.length && t.served + t.walked > 3) notes.push('Nobody so much as looked at the ' + untouched.join(', ') + '.');
    const stats = {};
    for (const p of PRODUCTS) stats[p.id] = Object.assign({}, st[p.id]);
    return { day: state.day, weather: state.weather, notes, stats, remarks: t.remarks.slice(-10).map((r) => ({ name: r.name, look: r.look, kind: r.kind, text: r.text })) };
  }

  // ---------- the day ----------
  // Returns { ok, msg, tab }: tab is where to send the player when the door will not open.
  function openShop() {
    if (state.phase !== 'closed') return { ok: false, msg: '' };
    if (shelfTotal() <= 0) {
      const room = stockTotal() > 0;
      return {
        ok: false,
        msg: room ? 'The shelves are bare. Carry some stock out (tap a shelf) before you unlock the door.' : 'Nothing to sell. Order some stock in on the Orders tab first.',
        tab: room ? null : 'orders',
      };
    }
    // Snow and a gale keep people at home; a scorcher and a sunny weekend bring them out.
    const q = WEATHER[state.weather].quiet || 1;
    const n = clamp(Math.round((11 + state.rep / 7 + (isWeekend() ? 2 : 0)) * q), 6, 26);
    const spawnAt = [];
    for (let i = 0; i < n; i++) spawnAt.push(rand(1, DAY_LENGTH - 16));
    spawnAt.sort((a, b) => a - b);
    day = { t: 0, uid: 0, spawnAt, spawnIdx: 0, people: [], queue: [], till: null, recent: [], belt: [], bag: [], rung: [], total: 0, coins: [], owed: 0 };
    state.phase = 'open';
    state.today.repStart = state.rep;
    const dropped = deliver(state.arriving);
    on('side');
    return {
      ok: true,
      msg: dropped
        ? 'Open for business, and the van has just dropped ' + dropped + ' off in the stockroom.'
        : 'Open for business. ' + WEATHER[state.weather].ico + ' ' + cap1(WEATHER[state.weather].name) + ' out there.',
    };
  }
  function tick(dt) {
    if (state.phase === 'evening' || state.phase === 'over') return;
    updateKeeper(dt);
    if (!day || state.phase !== 'open') return;
    day.t += dt;
    const shopping = day.people.filter((c) => c.state === 'walk' || c.state === 'browse' || c.state === 'wait').length;
    if (shopping < MAX_SHOPPING && day.spawnIdx < day.spawnAt.length && day.t >= day.spawnAt[day.spawnIdx] && day.t < DAY_LENGTH) {
      day.spawnIdx++;
      enterCustomer();
    }
    for (const c of day.people.slice()) updateCustomer(c, dt);
    day.people = day.people.filter((c) => !c.gone);
    if (!day.till && day.queue.length) {
      const c = day.queue.shift();
      c.spot = -1;
      c.state = 'approach';
      day.till = c;
      sendTo(c, PAY_SPOT[0], PAY_SPOT[1]);
      lineUp();
    }
    const allIn = day.spawnIdx >= day.spawnAt.length || day.t >= DAY_LENGTH;
    if (allIn && !day.people.length) closeShop();
    else if (day.t >= DAY_LENGTH + 60) {
      // half an hour after closing, whoever is left is shown the door
      if (day.till && day.till.state === 'paying') {
        for (const m of day.coins) { state.cash += m.v / 100; state.today.takings += m.v / 100; }
        day.coins = [];
        complete(day.till);
      }
      for (const c of day.people) if (c.state !== 'done' && c.state !== 'out') returnBasket(c);
      day.people = [];
      day.queue = [];
      day.till = null;
      closeShop();
    }
  }
  function closeShop() {
    clearCoins();
    state.phase = 'evening';
    putBackCarry();
    keeper.job = null;
    keeper.path = [];
    const t = state.today;
    state.report = buildReport();   // cash off first, then work out how the day really went
    // rent, word of mouth fades overnight (more from the top), then the night in the stockroom
    state.cash -= RENT;
    state.rep = clamp(state.rep - 2 - Math.max(0, state.rep - 50) * 0.15, 0, 100);
    for (const p of PRODUCTS) {
      if (!p.life) continue;
      let binned = 0;
      for (const b of state.room[p.id]) b.age++;
      state.room[p.id] = state.room[p.id].filter((b) => { if (b.age >= p.life) { binned += b.q; return false; } return true; });
      if (p.life === 1) for (const i of facingsOf(p.id)) { binned += state.stock[i]; state.stock[i] = 0; }
      if (binned) t.binned.push({ pid: p.id, q: binned });
    }
    syncPallets();
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
  function reset() {
    state = freshState();
    syncPallets();
    day = null;
    Object.assign(keeper, { x: TILL_SPOT[0], y: TILL_SPOT[1], path: [], dir: 'up', job: null, moving: false });
  }

  state = saved ? loadState(saved) : freshState();
  syncPallets();

  return {
    get state() { return state; }, get day() { return day; }, keeper,
    rollWeather, inSeason, weekdayIndex, isWeekend, weightedPersona, buildWants, makeLook,
    roomQty, roomAge, shelfOf, facingsOf, shelfTotal, stockTotal, sameDayDelivery, orderTotal, facingOf, atTill,
    openShop, tick, morning, reset, closeShop,
    walkTo, goTill, goRoom, pickUp, putDown, crates, sideTakes, restock, interact, steer, atRoom, atFacing, buyShelf, setPrice, nudgePrice, confirmOrder,
    scanItem, bagItem, takeCoin,
    serialize: () => JSON.parse(JSON.stringify(state)),
  };
}
