/* The Corner Shop — keep the shelves full, the prices right and the queue moving.
   Most of the day you work the till: run each item over the scanner, pack it
   into the bag, take the money. Nobody tells you how it went until closing. */
(() => {
  'use strict';

  // ---------- constants ----------
  const SAVE_KEY = 'corner-shop-save-v1';
  const SOUND_KEY = 'corner-shop-sound';
  const DAY_LENGTH = 100;      // real seconds the shop is open (9am to 5pm on the clock)
  const RENT = 8;
  const DELIVERY_FEE = 4;
  const START_CASH = 80;
  const MAX_QUEUE = 5;
  const MAX_SLOTS = 12;
  const SHELF_COST = 45;
  const RESTOCK_TIME = 2.4;    // seconds away from the till per restock while open
  const THINK_TIME = 0.45;     // seconds before a browser's thought bubble shows
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  // Four seasons of two weeks each. The wholesaler only carries a seasonal line while its
  // season is on, so the range in the shop changes over a year without changing a rule.
  const SEASON_LEN = 14;
  const SEASONS = [
    { id: 'spring', name: 'Spring', ico: '\ud83c\udf37' },
    { id: 'summer', name: 'Summer', ico: '\u2600\ufe0f' },
    { id: 'autumn', name: 'Autumn', ico: '\ud83c\udf42' },
    { id: 'winter', name: 'Winter', ico: '\u2744\ufe0f' },
  ];
  const seasonOf = (day) => SEASONS[Math.floor((day - 1) / SEASON_LEN) % SEASONS.length];
  const inSeason = (p, day) => !p.season || p.season.includes(seasonOf(day === undefined ? state.day : day).id);

  const WEATHER = {
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
  function rollWeather(day) {
    const s = seasonOf(day).id;
    const pool = WEATHER_POOL.filter((w) => !WEATHER_SEASON[w] || WEATHER_SEASON[w].includes(s));
    if (s === 'winter') pool.push('cold', 'snow', 'snow');
    if (s === 'summer') pool.push('sunny', 'hot');
    return pick(pool);
  }

  // cost = wholesale per unit, ref = the price people think is fair, cap = shelf
  // space, life = days it keeps in the stockroom (0 = forever), pop = base
  // popularity, box = units per wholesale box.
  const PRODUCTS = [
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

  // Nobody is an emoji: `look` says which hair, clothes and bits and pieces
  // this sort of person turns up in, and makeLook() rolls one of each.
  const SKINS = ['#f8d7b8', '#f2c193', '#e3a870', '#c9884f', '#a8663a', '#7f4a28', '#5d3419'];
  const HAIRS = ['#241a14', '#3f2a1b', '#6b4423', '#a2662a', '#d3a03c', '#c05a34', '#4a4a52'];
  const GREYS = ['#c9c3ba', '#e6e1d9', '#9d968d'];

  // wtp = how far over the fair price they will stretch, patience = multiplier
  // on their time at the till, max = most things they will look for, weekend =
  // how much more (or less) often they show up on Saturday and Sunday.
  const PERSONAS = [
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

  // ---------- helpers ----------
  const $ = (id) => document.getElementById(id);
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const r5 = (n) => Math.round(n * 20) / 20;
  const money = (n) => (n < -0.001 ? '-' : '') + '£' + Math.abs(n).toFixed(2);
  const prod = (id) => PRODUCTS.find((p) => p.id === id);
  const plural = (n, s, p) => n + ' ' + (n === 1 ? s : p || s + 's');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const line = (kind, p, price) => cap1(pick(LINES[kind]).replace('{n}', p ? p.name.toLowerCase() : '').replace('{p}', price != null ? money(price) : ''));
  const weekdayIndex = () => (state.day - 1) % 7;
  const isWeekend = () => weekdayIndex() >= 5;

  // ---------- drawing people ----------
  // Everyone in the shop is a little SVG portrait built out of the same parts:
  // a body, a head, a hairstyle and whatever they happen to have on today.
  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const ch = (sh) => clamp(Math.round(((n >> sh) & 255) * f), 0, 255);
    return '#' + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1);
  }

  // Every part of a person is blocked in flat and then drawn round with the
  // same fat marker line, so a shopper reads as one cut-out against the shop.
  const INK = '#3b2a1b';
  const OL = ' stroke="' + INK + '" stroke-width="2.6" stroke-linejoin="round"';
  const OL_THIN = ' stroke="' + INK + '" stroke-width="1.7" stroke-linejoin="round"';

  function makeLook(persona) {
    const cfg = persona.look;
    return {
      skin: pick(SKINS),
      hair: pick(cfg.hair),
      hairCol: cfg.grey ? pick(GREYS) : pick(HAIRS),
      cloth: pick(cfg.cloth),
      hat: cfg.hat ? pick(cfg.hat) : 'none',
      collar: cfg.collar || '',
      specs: Math.random() < (cfg.glasses || 0) ? (Math.random() < 0.45 ? 'round' : 'square') : '',
      stubble: Math.random() < (cfg.stubble || 0),
      freckles: Math.random() < (cfg.freckles || 0),
      cans: Math.random() < (cfg.cans || 0),
      lines: !!cfg.lines,
      small: !!cfg.small,
      mouth: pick(['smile', 'smile', 'grin', 'line']),
      tilt: Math.round(rand(-5, 5)),
      gaze: Math.round(rand(-1.6, 1.6) * 10) / 10,
    };
  }

  function hairBack(style, col, col2) {
    if (style === 'long') return '<path d="M17 54q0-33 33-33t33 33v40q-8-5-11-17-22 9-44 0-3 12-11 17z" fill="' + col + '"' + OL + '/>';
    if (style === 'bob') return '<path d="M18 54q0-33 32-33t32 33v24q-7-3-10-12-22 9-44 0-3 9-10 12z" fill="' + col + '"' + OL + '/>';
    if (style === 'pigtails') return '<circle cx="16" cy="60" r="12" fill="' + col + '"' + OL + '/><circle cx="84" cy="60" r="12" fill="' + col + '"' + OL + '/><circle cx="16" cy="60" r="6" fill="' + col2 + '" opacity=".5"/><circle cx="84" cy="60" r="6" fill="' + col2 + '" opacity=".5"/>';
    if (style === 'bun') return '<circle cx="50" cy="17" r="13" fill="' + col + '"' + OL + '/><circle cx="50" cy="17" r="7" fill="' + col2 + '" opacity=".45"/>';
    return '';
  }

  function hairFront(style, col, col2) {
    const cap = '<path d="M22 48q0-27 28-27t28 27q-4-13-16-11-14 3-24-3-9-5-16 14z" fill="' + col + '"' + OL + '/>';
    switch (style) {
      case 'bald':
        return '<path d="M25 38A28 31 0 0 1 30.3 74Q40 56 25 38z" fill="' + col + '"' + OL + '/>' +
          '<path d="M75 38A28 31 0 0 0 69.7 74Q60 56 75 38z" fill="' + col + '"' + OL + '/>';
      case 'spiky':
        return '<path d="M22 44q1-17 5-17l1 7 6-11 3 8 7-12 3 9 7-11 4 9 6-8 4 9 5-4 4 15q-27 8-55 6z" fill="' + col + '"' + OL + '/>';
      case 'curly':
        return '<g fill="' + col + '"' + OL + '><circle cx="26" cy="42" r="10"/><circle cx="38" cy="31" r="11"/><circle cx="52" cy="27" r="12"/><circle cx="66" cy="32" r="11"/><circle cx="76" cy="43" r="10"/></g>' +
          '<g fill="' + col2 + '" opacity=".35"><circle cx="38" cy="31" r="5"/><circle cx="66" cy="32" r="5"/></g>';
      case 'messy':
        return cap + '<path d="M28 34q6-10 14-6M62 27q9 3 11 13M46 24q4-8 12-6" stroke="' + col + '" stroke-width="5" stroke-linecap="round" fill="none"/>';
      case 'pigtails':
        return '<path d="M22 48q0-27 28-27t28 27q-6-16-28-16T22 48z" fill="' + col + '"' + OL + '/><path d="M50 21v14" stroke="' + col2 + '" stroke-width="2.5"/>';
      case 'short':
        return '<path d="M22 49q0-28 28-28t28 28q-3-15-19-16-6 6-18 6-9 0-19 10z" fill="' + col + '"' + OL + '/>';
      case 'bun':
      case 'crop':
      default:
        return cap;
    }
  }

  function hatSvg(kind, col) {
    switch (kind) {
      case 'hardhat':
        return '<path d="M22 40q0-27 28-27t28 27z" fill="#f2b705"' + OL + '/><path d="M50 13q5 9 5 27h-10q0-18 5-27z" fill="#ffd34d"/>' +
          '<rect x="12" y="37" width="76" height="8" rx="4" fill="#dda600"' + OL + '/>';
      case 'flatcap':
        return '<path d="M24 40q1-24 26-24t26 24z" fill="#8a7a63"' + OL + '/><path d="M24 40q26 8 52 0 2 8-6 10H30q-6 0-6-10z" fill="#6f6250"' + OL + '/>' +
          '<path d="M16 47q10-9 22-7-4 7-14 8z" fill="#7b6d59"' + OL + '/>';
      case 'beanie':
        return '<path d="M22 42q0-26 28-26t28 26z" fill="' + (col || '#c0563a') + '"' + OL + '/><rect x="19" y="37" width="62" height="11" rx="5.5" fill="' + shade(col || '#c0563a', 0.78) + '"' + OL + '/>';
      case 'bobble':
        return '<path d="M22 42q0-26 28-26t28 26z" fill="' + (col || '#e0574f') + '"' + OL + '/><rect x="19" y="37" width="62" height="11" rx="5.5" fill="' + shade(col || '#e0574f', 0.78) + '"' + OL + '/><circle cx="50" cy="11" r="8" fill="#fdf6e8"' + OL + '/>';
      case 'cap':
        return '<path d="M23 43q0-27 27-27t27 27z" fill="' + (col || '#4f9de0') + '"' + OL + '/>' +
          '<path d="M22 43h56v6H22z" fill="' + shade(col || '#4f9de0', 0.86) + '"/>' +
          '<path d="M22 43q22-4 40 1 14 4 16 12-20 4-56-3z" fill="' + shade(col || '#4f9de0', 0.7) + '"' + OL + '/>' +
          '<circle cx="50" cy="17" r="3" fill="' + shade(col || '#4f9de0', 0.7) + '"/>';
      case 'sun':
        return '<path d="M50 12q19 0 20 26H30q1-26 20-26z" fill="' + (col || '#f0dfae') + '"' + OL + '/>' +
          '<ellipse cx="50" cy="40" rx="38" ry="9" fill="' + (col || '#f0dfae') + '"' + OL + '/>' +
          '<ellipse cx="50" cy="38.5" rx="38" ry="8" fill="' + shade(col || '#f0dfae', 0.92) + '"/>' +
          '<path d="M31 32h38v6H31z" fill="' + shade(col || '#f0dfae', 0.72) + '"/>';
      default:
        return '';
    }
  }

  function faceSvg(look) {
    const L = look || {};
    const skin = L.skin || SKINS[1];
    const skin2 = shade(skin, 0.86);
    const hair = L.hairCol || HAIRS[1];
    const hair2 = shade(hair, 0.75);
    const cloth = L.cloth || '#7f8fa6';
    const cloth2 = shade(cloth, 0.8);
    const ink = INK;
    const dx = L.gaze || 0;
    const s = [];
    s.push('<svg class="chr" viewBox="0 0 100 124" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">');
    s.push('<g transform="rotate(' + (L.tilt || 0) + ' 50 84)' + (L.small ? ' translate(50 124) scale(.88) translate(-50 -124)' : '') + '">');
    // body and neck
    s.push('<path d="M42 76h16v20H42z" fill="' + skin2 + '"' + OL + '/>');
    s.push('<path d="M6 124q3-25 22-32l22-6 22 6q19 7 22 32z" fill="' + cloth + '"' + OL + '/>');
    if (L.collar === 'hivis') {
      s.push('<path d="M30 94l-6 30M70 94l6 30" stroke="#f4f7f9" stroke-width="6" fill="none" opacity=".95"/>');
      s.push('<path d="M18 112h64" stroke="#eef2f5" stroke-width="6" opacity=".85"/>');
    } else if (L.collar === 'tie') {
      s.push('<path d="M50 88l-14 6 9 11 5-7 5 7 9-11z" fill="#fdfaf3"' + OL + '/>');
      s.push('<path d="M50 98l-5 7 5 19 5-19z" fill="#b8483a"' + OL + '/>');
    } else if (L.collar === 'hoodie') {
      s.push('<path d="M27 92q23 15 46 0l5 9q-28 17-56 0z" fill="' + cloth2 + '"' + OL_THIN + '/>');
      s.push('<path d="M44 104v16M56 104v16" stroke="#f7efe2" stroke-width="3" stroke-linecap="round"/>');
    } else if (L.collar === 'cardigan') {
      s.push('<path d="M50 92l-10 32M50 92l10 32" stroke="' + cloth2 + '" stroke-width="4" fill="none"/>');
      s.push('<circle cx="50" cy="107" r="2.4" fill="#f7efe2"/><circle cx="50" cy="118" r="2.4" fill="#f7efe2"/>');
    } else if (L.collar === 'jumper') {
      s.push('<path d="M36 90q14 12 28 0l3 6q-17 14-34 0z" fill="' + cloth2 + '"' + OL_THIN + '/>');
    } else if (L.collar === 'tee') {
      s.push('<path d="M38 90q12 9 24 0l3 5q-15 12-30 0z" fill="' + cloth2 + '"' + OL_THIN + '/>');
    }
    // head
    s.push(hairBack(L.hair, hair, hair2));
    s.push('<ellipse cx="22" cy="56" rx="6" ry="8" fill="' + skin2 + '"' + OL + '/><ellipse cx="78" cy="56" rx="6" ry="8" fill="' + skin2 + '"' + OL + '/>');
    s.push('<ellipse cx="50" cy="52" rx="28" ry="31" fill="' + skin + '"' + OL + '/>');
    if (L.stubble) s.push('<path d="M22.9 60A28 31 0 0 0 77.1 60Q50 66 22.9 60z" fill="#2a2018" opacity=".26"/>');
    s.push(hairFront(L.hair, hair, hair2));
    // eyes
    s.push('<ellipse cx="38" cy="54" rx="7" ry="7.6" fill="#fffdf8"' + OL_THIN + '/><ellipse cx="62" cy="54" rx="7" ry="7.6" fill="#fffdf8"' + OL_THIN + '/>');
    s.push('<circle cx="' + (38 + dx) + '" cy="55" r="3.6" fill="#2a2018"/><circle cx="' + (62 + dx) + '" cy="55" r="3.6" fill="#2a2018"/>');
    s.push('<circle cx="' + (39.4 + dx) + '" cy="53" r="1.4" fill="#fff"/><circle cx="' + (63.4 + dx) + '" cy="53" r="1.4" fill="#fff"/>');
    // A mood overrides the face they walked in with: 'flat' is a polite nothing,
    // 'sad' droops the brows as well. Set when they see what is not on the shelf.
    const mood = L.mood || '';
    s.push('<path d="' + (mood === 'sad' ? 'M29 45q9-4 16-7M71 45q-9-4-16-7' : 'M30 42q8-5 15-1M70 42q-8-5-15-1') +
      '" stroke="' + hair2 + '" stroke-width="3.2" stroke-linecap="round" fill="none"/>');
    if (L.lines) s.push('<path d="M25 60q5 4 9 1M75 60q-5 4-9 1M31 46q5-3 10-1M69 46q-5-3-10-1" stroke="' + shade(skin, 0.68) + '" stroke-width="1.8" stroke-linecap="round" fill="none" opacity=".7"/>');
    // nose and mouth
    s.push('<path d="M50 57q4 5-2 8" stroke="' + skin2 + '" stroke-width="2.6" stroke-linecap="round" fill="none"/>');
    const mouth = mood === 'sad' ? 'frown' : mood === 'flat' ? 'line' : L.mouth;
    if (mouth === 'grin') s.push('<path d="M40 68q10 12 20 0z" fill="#8c4a45"' + OL_THIN + '/><path d="M41.6 69h16.8" stroke="#fffdf8" stroke-width="3.4"/>');
    else if (mouth === 'line') s.push('<path d="M43 71h14" stroke="' + ink + '" stroke-width="3" stroke-linecap="round"/>');
    else if (mouth === 'frown') s.push('<path d="M41 73q9-8 18 0" stroke="' + ink + '" stroke-width="3" stroke-linecap="round" fill="none"/>');
    else s.push('<path d="M41 68q9 8 18 0" stroke="' + ink + '" stroke-width="3" stroke-linecap="round" fill="none"/>');
    s.push('<ellipse cx="27" cy="65" rx="6" ry="4" fill="#e0736b" opacity=".26"/><ellipse cx="73" cy="65" rx="6" ry="4" fill="#e0736b" opacity=".26"/>');
    if (L.freckles) s.push('<g fill="' + shade(skin, 0.72) + '" opacity=".65"><circle cx="31" cy="62" r="1.3"/><circle cx="36" cy="65" r="1.3"/><circle cx="64" cy="65" r="1.3"/><circle cx="69" cy="62" r="1.3"/></g>');
    if (L.specs) {
      const round = L.specs === 'round';
      s.push('<g fill="none" stroke="#3b3b40" stroke-width="2.6" opacity=".9">' +
        (round ? '<circle cx="38" cy="54" r="10"/><circle cx="62" cy="54" r="10"/>'
          : '<rect x="27" y="46" width="22" height="16" rx="4"/><rect x="51" y="46" width="22" height="16" rx="4"/>') +
        '<path d="M48 54h4M27 52l-7-2M73 52l7-2"/></g>');
    }
    if (L.cans) s.push('<path d="M17 54a33 33 0 0 1 66 0" stroke="#3c3c44" stroke-width="5" fill="none"/><rect x="9" y="46" width="15" height="22" rx="7" fill="#3c3c44"/><rect x="76" y="46" width="15" height="22" rx="7" fill="#3c3c44"/>');
    s.push(hatSvg(L.hat, cloth));
    s.push('</g></svg>');
    return s.join('');
  }

  // ---------- state ----------
  let state = null;   // everything that persists
  let day = null;     // the running day: customers, belt, timers
  let tab = 'stock';
  let sound = false;
  let held = null;    // item being dragged
  let order = {};     // boxes picked in the Orders tab, not yet confirmed
  let shelfPick = null;   // shelf layout being edited in the rearrange panel
  let noteTimer = 0;

  function freshStats() {
    const s = {};
    for (const p of PRODUCTS) s[p.id] = { wanted: 0, bought: 0, dear: 0, empty: 0, missing: 0 };
    return s;
  }
  function freshToday() {
    return { stats: freshStats(), remarks: [], served: 0, walked: 0, busy: 0, nothing: 0, quick: 0, takings: 0, cogs: 0, spent: 0, binned: [], repStart: 0 };
  }
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

  function loadState() {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { raw = null; }
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

  function persist() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable */ }
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
  // With nothing in the shop there is no day to be had, so the wholesaler lets
  // you drive over and collect the first order yourself rather than wait for
  // the van. That is how day one starts, and how you dig out of a sell-out.
  const sameDayDelivery = () => state.phase === 'closed' && stockTotal() === 0;

  // ---------- dom ----------
  const sceneWrap = $('scene-wrap');
  const scene = $('scene');
  const shelvesEl = $('shelves');
  const browserEl = $('browser');
  const browserThink = $('browser-think');
  const queueEl = $('queue');
  const shopperEl = $('shopper');
  const shopperBubble = $('shopper-bubble');
  const beltEl = $('belt');
  const scannerEl = $('scanner');
  const bagEl = $('bag');
  const bagItems = $('bag-items');
  const receiptEl = $('receipt');
  const tillTotal = $('till-total');
  const coinsEl = $('coins');
  const awayEl = $('away');
  const bannerEl = $('banner');
  const noteEl = $('note');
  const overlay = $('overlay');
  const sideBody = $('side-body');

  function fit() {
    const s = sceneWrap.clientWidth / 720;
    scene.style.transform = 'scale(' + s + ')';
  }
  window.addEventListener('resize', fit);
  if (window.ResizeObserver) new ResizeObserver(fit).observe(sceneWrap);

  function note(text) {
    noteEl.textContent = text;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => { if (noteEl.textContent === text) noteEl.textContent = ''; }, 4000);
  }

  const bubbleTimers = new Map();
  function say(bubble, text, ms) {
    bubble.textContent = text;
    bubble.hidden = false;
    clearTimeout(bubbleTimers.get(bubble));
    bubbleTimers.set(bubble, setTimeout(() => { bubble.hidden = true; }, ms));
  }
  function hush(bubble) { clearTimeout(bubbleTimers.get(bubble)); bubble.hidden = true; }

  // ---------- sound ----------
  let audio = null;
  function tone(freq, dur, type, gain) {
    if (!sound) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = type || 'square';
      o.frequency.value = freq;
      g.gain.value = gain || 0.05;
      g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + dur);
      o.connect(g); g.connect(audio.destination);
      o.start(); o.stop(audio.currentTime + dur);
    } catch (e) { /* no audio */ }
  }
  const beep = () => tone(1240, 0.09, 'square', 0.04);
  const clink = () => { tone(1760, 0.05, 'sine', 0.05); setTimeout(() => tone(2340, 0.08, 'sine', 0.035), 45); };
  const chime = () => { tone(660, 0.12, 'sine', 0.06); setTimeout(() => tone(990, 0.18, 'sine', 0.06), 90); };
  const thud = () => tone(120, 0.25, 'triangle', 0.08);
  const pack = () => tone(300, 0.09, 'triangle', 0.05);

  // ---------- customers ----------
  function weightedPersona() {
    const weekend = isWeekend();
    const ws = PERSONAS.map((p) => (weekend ? p.weekend : 1));
    let r = Math.random() * ws.reduce((a, b) => a + b, 0);
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
      if (wants.length === 0 || Math.random() < Math.min(0.8, x.d * 0.6)) wants.push(x.p);
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

  function shopAround(c) {
    const w = WEATHER[state.weather].mult;
    const loyal = state.rep >= 70 ? 1.06 : state.rep < 30 ? 0.95 : 1;
    for (const p of c.wants) {
      const st = todayStat(p.id);
      const tot = state.totals[p.id];
      st.wanted++; tot.wanted++;
      if (!state.slots.includes(p.id)) { st.missing++; tot.missing++; c.missed.push(p); logRemark(c, 'missing', line('missing', p)); continue; }
      if (state.shelf[p.id] <= 0) { st.empty++; tot.empty++; c.missed.push(p); logRemark(c, 'empty', line('empty', p)); continue; }
      const price = state.prices[p.id];
      const wtp = p.ref * c.persona.wtp * loyal * rand(0.92, 1.4);
      if (price > wtp + 0.001) { st.dear++; tot.dear++; c.missed.push(p); logRemark(c, 'dear', line('dear', p, price)); continue; }
      let q = 1;
      let kind = 'buy';
      if (price < p.ref * 0.8 && Math.random() < 0.55) { q = 2; kind = 'bargain'; }
      else if (p.ref < 1 && Math.random() < 0.25) q = 2;
      if ((w[p.id] || 1) >= 1.5 && kind === 'buy') kind = 'weather';
      q = Math.min(q, state.shelf[p.id]);
      state.shelf[p.id] -= q;
      st.bought += q; tot.bought += q;
      c.basket.push({ p, q });
      logRemark(c, kind, line(kind, p));
    }
  }

  function enterCustomer() {
    const persona = weightedPersona();
    const c = { persona, look: makeLook(persona), name: pick(persona.names), wants: [], basket: [], missed: [], remarks: [], t: 0, state: 'browse', tillTime: 0 };
    c.wants = buildWants(persona);
    shopAround(c);
    // they keep their opinions to themselves; you hear about it at closing time.
    // All you get while they browse is the thing on their mind and their face
    // once they have found out whether it is there.
    c.think = c.missed.length ? pick(c.missed) : c.wants.length ? pick(c.wants) : null;
    c.mood = !c.missed.length ? '' : (c.basket.length && c.missed.length < 2) ? 'flat' : 'sad';
    c.browseTime = rand(2, 3.2);
    c.realiseAt = c.browseTime * 0.55;
    day.browser = c;
    browserEl.hidden = false;
    browserEl.className = 'browser in';
    $('browser-face').innerHTML = faceSvg(c.look);
    $('browser-name').textContent = c.name;
    hideThought();
    renderShelves();
  }

  function showThought(p) {
    browserThink.innerHTML = '<span class="ico">' + p.ico + '</span><span class="what">' + esc(p.name) + '</span>';
    browserThink.hidden = false;
  }
  function hideThought() { browserThink.hidden = true; browserThink.innerHTML = ''; }

  function updateBrowser(c, dt) {
    const was = c.t;
    c.t += dt;
    if (c.think && was < THINK_TIME && c.t >= THINK_TIME) showThought(c.think);
    if (c.mood && was < c.realiseAt && c.t >= c.realiseAt) {
      c.look.mood = c.mood;
      $('browser-face').innerHTML = faceSvg(c.look);
    }
    if (c.t < c.browseTime) return;
    browserEl.className = 'browser out';
    hideThought();
    day.browser = null;
    day.cool = 0.5;
    const units = c.basket.reduce((a, b) => a + b.q, 0);
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
      note(c.name + ' took one look at the queue and left.');
      return;
    }
    c.state = 'queue';
    day.queue.push(c);
    renderQueue();
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
    renderShelves();
  }

  function bumpRep(n) {
    state.rep = clamp(state.rep + n, 0, 100);
    renderHud();
  }

  // ---------- money on the counter ----------
  // People pay in coins. They put them down, you pick them up: nothing lands
  // in the tin until you have taken it off the counter.
  const MONEY = [
    { v: 1000, label: '£10', note: true, fill: '#d19a63', edge: '#a8703c', ink: '#4a2a12', w: 66 },
    { v: 500, label: '£5', note: true, fill: '#9ccfcc', edge: '#5f9d9d', ink: '#123f3e', w: 62 },
    { v: 200, label: '£2', fill: '#dcb14e', edge: '#9c7620', ring: '#dcdcde', ink: '#4a3a10', w: 48 },
    { v: 100, label: '£1', fill: '#e2bc55', edge: '#a37c24', ink: '#4a3a10', w: 39 },
    { v: 50, label: '50p', fill: '#d9d9dd', edge: '#98989e', ink: '#33333a', w: 42 },
    { v: 20, label: '20p', fill: '#d9d9dd', edge: '#98989e', ink: '#33333a', w: 34 },
    { v: 10, label: '10p', fill: '#d9d9dd', edge: '#98989e', ink: '#33333a', w: 35 },
    { v: 5, label: '5p', fill: '#d9d9dd', edge: '#98989e', ink: '#33333a', w: 27 },
  ];
  const COIN_SPOTS = [[34, 32], [80, 26], [126, 34], [30, 72], [78, 68], [126, 74], [42, 108], [88, 106], [128, 106]];

  function makeMoney(total) {
    let left = Math.round(total * 100);
    const out = [];
    let uid = 0;
    for (const d of MONEY) {
      while (left >= d.v) { left -= d.v; out.push(Object.assign({ uid: 'c' + uid++ }, d)); }
    }
    const spots = COIN_SPOTS.slice().sort(() => Math.random() - 0.5);
    out.forEach((c, i) => {
      const sp = spots[i % spots.length];
      c.x = sp[0] + rand(-5, 5);
      c.y = sp[1] + rand(-4, 4);
      c.rot = Math.round(rand(-14, 14));
    });
    return out;
  }

  function moneySvg(m) {
    const face = '"Baloo 2", ui-rounded, system-ui, sans-serif';
    if (m.note) {
      return '<svg viewBox="0 0 62 36" aria-hidden="true"><rect x="2" y="2" width="58" height="32" rx="5" fill="' + m.fill + '" stroke="' + INK + '" stroke-width="2.6"/>' +
        '<rect x="6" y="6" width="50" height="24" rx="3" fill="none" stroke="' + m.edge + '" stroke-width="1.4" opacity=".8"/>' +
        '<circle cx="31" cy="18" r="10" fill="#ffffff" opacity=".35"/>' +
        '<text x="31" y="24" text-anchor="middle" font-size="15" font-weight="800" fill="' + m.ink + '" font-family=' + JSON.stringify(face) + '>' + m.label + '</text></svg>';
    }
    return '<svg viewBox="0 0 42 42" aria-hidden="true"><circle cx="21" cy="22" r="18.5" fill="' + m.edge + '" stroke="' + INK + '" stroke-width="2.6"/>' +
      '<circle cx="21" cy="20.2" r="17.2" fill="' + m.fill + '" stroke="' + INK + '" stroke-width="2.6"/>' +
      (m.ring ? '<circle cx="21" cy="20.2" r="10.5" fill="' + m.ring + '" stroke="' + INK + '" stroke-width="1.6"/>' : '') +
      '<text x="21" y="25" text-anchor="middle" font-size="' + (m.label.length > 2 ? 12 : 14) + '" font-weight="800" fill="' + m.ink + '" font-family=' + JSON.stringify(face) + '>' + m.label + '</text></svg>';
  }

  function renderCoins() {
    coinsEl.innerHTML = '';
    const list = (day && day.coins) || [];
    coinsEl.hidden = !list.length;
    for (const m of list) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'coin' + (m.note ? ' note' : '');
      b.dataset.uid = m.uid;
      b.style.width = m.w + 'px';
      b.style.left = (m.x - m.w / 2) + 'px';
      b.style.top = (m.y - (m.note ? m.w * 36 / 62 : m.w) / 2) + 'px';
      b.style.setProperty('--rot', m.rot + 'deg');
      b.title = 'Take the ' + m.label;
      b.innerHTML = moneySvg(m);
      coinsEl.appendChild(b);
    }
  }

  function offerPayment(c) {
    dropHeld();
    c.state = 'paying';
    c.t = 0;
    day.coins = makeMoney(day.total);
    day.owed = day.total;
    renderCoins();
    renderReceipt();
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
    clink();
    renderCoins();
    renderHud();
    renderReceipt();
    if (!day.coins.length && day.till && day.till.state === 'paying') complete(day.till);
  }

  function clearCoins() {
    if (day) { day.coins = []; day.owed = 0; }
    renderCoins();
  }

  function sweepCoins() {
    if (!day || !day.coins) return;
    while (day.coins.length) takeCoin(day.coins[0].uid);
  }

  coinsEl.addEventListener('click', (e) => {
    const b = e.target.closest('.coin');
    if (b) takeCoin(b.dataset.uid);
  });

  // ---------- the till ----------
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
    day.belt.sort(() => Math.random() - 0.5);
    day.bag = [];
    day.rung = [];
    day.total = 0;
    day.coins = [];
    day.owed = 0;
    shopperEl.hidden = false;
    shopperEl.className = 'shopper in';
    $('shopper-face').innerHTML = faceSvg(c.look);
    $('shopper-name').textContent = c.name;
    hush(shopperBubble);
    renderBelt();
    renderBag();
    renderReceipt();
    renderCoins();
    renderQueue();
  }

  function updateTill(c, dt) {
    if (c.state === 'till') {
      c.tillTime += dt;
      c.patience -= dt * (day.away > 0 ? 1.6 : 1);
      if (c.patience <= 0) walkout(c);
    } else if (c.state === 'paying') {
      c.t += dt;   // the money is down; they wait while you pick it up
    } else if (c.state === 'done') {
      c.t += dt;
      if (c.t >= 0.6 && !shopperEl.classList.contains('out')) shopperEl.className = 'shopper out';
      if (c.t >= 1.1) {
        day.till = null;
        shopperEl.hidden = true;
        hush(shopperBubble);
        day.belt = [];
        day.bag = [];
        day.rung = [];
        day.total = 0;
        clearCoins();
        renderBelt(); renderBag(); renderReceipt();
      }
    }
  }

  function renderPatience() {
    const c = day && day.till;
    const bar = $('patience-fill');
    const track = bar.parentElement;
    if (!c || c.state !== 'till') { bar.style.width = '0%'; track.classList.remove('on'); return; }
    track.classList.add('on');
    const f = clamp(c.patience / c.maxPatience, 0, 1);
    bar.style.width = f * 100 + '%';
    bar.className = 'patience-fill' + (f < 0.3 ? ' low' : f < 0.6 ? ' mid' : '');
  }

  function scanItem(uid) {
    const it = day.belt.find((x) => x.uid === uid);
    if (!it || it.scanned) return;
    it.scanned = true;
    day.rung.push(it);
    day.total = r5(day.total + state.prices[it.p.id]);
    beep();
    scannerEl.classList.remove('flash');
    void scannerEl.offsetWidth;
    scannerEl.classList.add('flash');
    renderBelt();
    renderReceipt();
    if (held) {
      // renderBelt rebuilt the row, so pick the item's new element back up
      held.acted = true;
      const el = beltEl.querySelector('[data-uid="' + held.uid + '"]');
      if (el) { held.item = el; el.classList.add('lifted'); }
      held.ghost.classList.add('done');
    }
  }

  function bagItem(uid) {
    const i = day.belt.findIndex((x) => x.uid === uid);
    if (i < 0) return;
    if (!day.belt[i].scanned) { note('Run it over the scanner before it goes in the bag.'); return; }
    day.bag.push(day.belt.splice(i, 1)[0]);
    pack();
    bagEl.classList.remove('drop');
    void bagEl.offsetWidth;
    bagEl.classList.add('drop');
    renderBelt();
    renderBag();
    renderReceipt();
    const c = day.till;
    if (c && c.state === 'till' && !day.belt.length) offerPayment(c);
  }

  function renderBelt() {
    beltEl.innerHTML = '';
    if (!day) return;
    for (const it of day.belt) {
      const d = document.createElement('div');
      d.className = 'item' + (it.scanned ? ' done' : '');
      d.dataset.uid = it.uid;
      d.title = it.scanned ? 'Rung up. Put it in the bag.' : 'Run it over the scanner.';
      d.innerHTML = '<span class="ico">' + it.p.ico + '</span><span class="tag">' + money(state.prices[it.p.id]) + '</span>';
      beltEl.appendChild(d);
    }
  }

  function renderBag() {
    bagItems.innerHTML = '';
    if (!day) return;
    for (const it of day.bag) {
      const s = document.createElement('span');
      s.textContent = it.p.ico;
      bagItems.appendChild(s);
    }
  }

  function renderReceipt() {
    receiptEl.innerHTML = '';
    if (!day || !day.till) {
      receiptEl.innerHTML = '<div class="idle">' + (state.phase === 'open' ? 'Next customer please' : 'Closed') + '</div>';
      tillTotal.textContent = '';
      return;
    }
    if (day.till.state === 'paying') {
      receiptEl.innerHTML = '<div class="idle">Cash ' + money(day.total) + '</div><div class="idle">Take the money</div>';
      tillTotal.textContent = money(day.owed);
      return;
    }
    const lines = day.rung.slice(-4);
    for (const it of lines) {
      const d = document.createElement('div');
      d.innerHTML = '<span>' + it.p.ico + ' ' + esc(it.p.name) + '</span><span>' + money(state.prices[it.p.id]) + '</span>';
      receiptEl.appendChild(d);
    }
    const toScan = day.belt.filter((x) => !x.scanned).length;
    if (!lines.length) receiptEl.innerHTML = '<div class="idle">Scan ' + plural(day.belt.length, 'item') + '</div>';
    else if (day.belt.length) {
      const d = document.createElement('div');
      d.className = 'idle';
      d.textContent = toScan ? plural(toScan, 'item') + ' still to scan' : 'Bag it up';
      receiptEl.appendChild(d);
    }
    tillTotal.textContent = day.rung.length ? money(day.total) : '';
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
    say(shopperBubble, line(quick ? 'quick' : slow ? 'slow' : 'thanks'), 900);
    chime();
    c.state = 'done';
    c.t = 0;
    receiptEl.innerHTML = '<div class="idle">Paid ' + money(day.total) + '</div>';
    tillTotal.textContent = '';
    renderHud();
    persist();
  }

  function walkout(c) {
    returnBasket(c);
    state.today.walked++;
    bumpRep(-4);
    logRemark(c, 'walkout', line('walkout'));
    say(shopperBubble, c.remarks[c.remarks.length - 1].text, 900);
    thud();
    note(c.name + ' walked out. Everything went back on the shelf.');
    c.state = 'done';
    c.t = 0;
    day.belt = [];
    day.bag = [];
    day.rung = [];
    day.total = 0;
    dropHeld();
    clearCoins();
    renderBelt(); renderBag();
    receiptEl.innerHTML = '<div class="idle">Walked out</div>';
  }

  // ---------- dragging ----------
  function moveGhost(x, y) {
    if (!held) return;
    held.ghost.style.left = x + 'px';
    held.ghost.style.top = y + 'px';
  }
  function over(el, x, y) {
    const r = el.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }
  function dropHeld() {
    if (!held) return;
    held.ghost.remove();
    if (held.item) held.item.classList.remove('lifted');
    bagEl.classList.remove('over');
    held = null;
  }
  beltEl.addEventListener('pointerdown', (e) => {
    const item = e.target.closest('.item');
    if (!item || held || !day || day.away > 0 || !day.till || day.till.state !== 'till') return;
    e.preventDefault();
    const ghost = item.cloneNode(true);
    ghost.classList.add('drag-ghost');
    ghost.classList.remove('lifted');
    document.body.appendChild(ghost);
    held = { uid: item.dataset.uid, item, ghost, x0: e.clientX, y0: e.clientY, acted: false };
    item.classList.add('lifted');
    if (item.classList.contains('done')) ghost.classList.add('done');
    moveGhost(e.clientX, e.clientY);
    try { beltEl.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  });
  beltEl.addEventListener('pointermove', (e) => {
    if (!held) return;
    moveGhost(e.clientX, e.clientY);
    if (over(scannerEl, e.clientX, e.clientY)) scanItem(held.uid);
    if (!held) return;
    const it = day.belt.find((x) => x.uid === held.uid);
    bagEl.classList.toggle('over', !!(it && it.scanned && over(bagEl, e.clientX, e.clientY)));
  });
  beltEl.addEventListener('pointerup', (e) => {
    if (!held) return;
    const uid = held.uid;
    const it = day.belt.find((x) => x.uid === uid);
    const scanned = !!(it && it.scanned);
    const inBag = over(bagEl, e.clientX, e.clientY);
    // a tap works as well as a drag: once to ring it up, again to pack it
    const tap = !held.acted && Math.abs(e.clientX - held.x0) < 6 && Math.abs(e.clientY - held.y0) < 6;
    dropHeld();
    if (inBag) bagItem(uid);
    else if (tap) { if (scanned) bagItem(uid); else scanItem(uid); }
  });
  beltEl.addEventListener('pointercancel', dropHeld);
  beltEl.addEventListener('dragstart', (e) => e.preventDefault());

  // ---------- shelves and stock ----------
  function renderShelves() {
    shelvesEl.innerHTML = '';
    for (let i = 0; i < state.slots.length; i++) {
      const pid = state.slots[i];
      const d = document.createElement('button');
      d.type = 'button';
      d.className = 'slot';
      d.dataset.index = i;
      if (!pid) {
        d.classList.add('blank');
        d.innerHTML = '<span class="ico">+</span><span class="nm">empty</span>';
        d.title = 'Choose what goes here';
      } else {
        const p = prod(pid);
        const q = state.shelf[pid];
        if (q === 0) d.classList.add('empty');
        let pips = '';
        for (let k = 0; k < p.cap; k++) pips += '<i class="' + (k < q ? 'on' : '') + '"></i>';
        d.innerHTML = '<span class="ico">' + (q ? p.ico : '') + '</span><span class="nm">' + esc(p.name) + '</span><span class="pips">' + pips + '</span><span class="price">' + money(state.prices[pid]) + '</span>';
        d.title = p.name + ': ' + q + ' of ' + p.cap + ' on the shelf, ' + roomQty(pid) + ' in the stockroom';
      }
      shelvesEl.appendChild(d);
    }
    shelvesEl.className = 'shelves rows-' + Math.ceil(state.slots.length / 4);
  }

  shelvesEl.addEventListener('click', (e) => {
    const slot = e.target.closest('.slot');
    if (!slot) return;
    const i = Number(slot.dataset.index);
    const pid = state.slots[i];
    if (state.phase === 'open') {
      if (pid) restock(pid);
      else note('Rearrange the shelves once you have closed for the day.');
    } else if (state.phase === 'closed') {
      // before you open, a click tops the shelf up; there is nothing to top up
      // on a full or empty-stockroom shelf, so that is when you get the chooser
      if (pid && state.shelf[pid] < prod(pid).cap && roomQty(pid) > 0) restock(pid);
      else chooseShelves();
    }
  });

  function restock(pid) {
    const p = prod(pid);
    const need = p.cap - state.shelf[pid];
    const have = roomQty(pid);
    if (need <= 0) { note(p.name + ' shelf is already full.'); return; }
    if (have <= 0) { note('No ' + p.name.toLowerCase() + ' in the stockroom. Order some in.'); return; }
    const n = Math.min(need, have);
    if (state.phase === 'open') {
      if (day.away > 0) { note('You are already away from the till.'); return; }
      day.away = RESTOCK_TIME;
      day.awayJob = { pid, n };
      awayEl.hidden = false;
      $('away-text').textContent = 'Fetching ' + p.name.toLowerCase() + ' from the stockroom...';
      dropHeld();
    } else {
      doRestock(pid, n);
    }
  }
  function doRestock(pid, n) {
    const got = takeFromRoom(pid, n);
    state.shelf[pid] += got;
    note('Put ' + plural(got, prod(pid).name.toLowerCase()) + ' on the shelf.');
    renderShelves();
    if (tab === 'stock') renderSide();
    if (state.phase !== 'open') persist();
  }
  function finishRestock() {
    day.away = 0;
    awayEl.hidden = true;
    if (day.awayJob) doRestock(day.awayJob.pid, day.awayJob.n);
    day.awayJob = null;
  }

  // ---------- what goes on the shelves ----------
  // One panel for the whole wall rather than a chooser per shelf: tick what you
  // want to sell, untick what you don't, and nothing moves until you save.
  function chooseShelves() {
    // the side panel can be a render behind, so re-check the phase here
    if (state.phase !== 'closed') { note('Rearrange the shelves once you have closed for the day.'); return; }
    const sel = state.slots.filter(Boolean);   // held past hideOverlay() so Save still has it
    shelfPick = sel;
    showOverlay('Rearrange the shelves', shelfPickBody(), [
      { label: 'Save the layout', fn: () => applyShelves(sel) },
      { label: 'Leave it as it is', cls: 'ghost' },
    ], true);
  }

  const on0 = (pid) => roomQty(pid) > 0 || state.shelf[pid] > 0 || shelfPick.includes(pid);
  function shelfPickBody() {
    const n = state.slots.length;
    const spare = n - shelfPick.length;
    let h = '<p>You have ' + plural(n, 'shelf', 'shelves') + '. Tick what you want to sell and untick what you do not want — anything you take off goes back to the stockroom. Nothing changes until you save.</p>';
    h += '<p class="picked' + (spare ? '' : ' full') + '">' + shelfPick.length + ' of ' + plural(n, 'shelf', 'shelves') + ' used' +
      (spare ? ' · ' + plural(spare, 'shelf', 'shelves') + ' still going spare' : ' · untick something to make room') + '</p>';
    h += '<div class="choose">';
    for (const p of PRODUCTS) {
      // Out of season and none in the back: it is not a choice you can make today.
      if (!inSeason(p) && !on0(p.id)) continue;
      const on = shelfPick.includes(p.id);
      const full = !on && !spare;
      h += '<button type="button" class="pick' + (on ? ' on' : '') + '" data-pid="' + p.id + '"' + (full ? ' disabled' : '') + ' aria-pressed="' + on + '">' +
        '<span class="ico">' + p.ico + '</span><span class="nm">' + esc(p.name) + '</span><span class="sm">' +
        (on && state.slots.includes(p.id) ? state.shelf[p.id] + ' out · ' + roomQty(p.id) + ' in back' : roomQty(p.id) + ' in stock') + '</span></button>';
    }
    return h + '</div>';
  }

  function togglePick(pid) {
    const at = shelfPick.indexOf(pid);
    if (at >= 0) shelfPick.splice(at, 1);
    else if (shelfPick.length >= state.slots.length) return;
    else shelfPick.push(pid);
    $('overlay-body').innerHTML = shelfPickBody();
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
    persist();
    renderShelves();
    renderSide();
    if (!changed) note('Shelves left as they were.');
    else if (bare) note('Shelves rearranged, but ' + (bare === 1 ? 'one has' : bare + ' have') + ' nothing in the stockroom yet. Order some in.');
    else note('Shelves rearranged.');
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
    if (!put) { note('Nothing in the stockroom to put out. Order some in.'); return; }
    note('Put ' + plural(put, 'thing') + ' out on the shelves.');
    persist();
    renderShelves();
    renderSide();
  }

  function buyShelf() {
    if (state.slots.length >= MAX_SLOTS) return;
    if (state.cash < SHELF_COST) { note('Not enough cash for another shelf.'); return; }
    state.cash -= SHELF_COST;
    state.today.spent += SHELF_COST;
    state.slots.push(null);
    persist();
    renderHud(); renderShelves(); renderSide();
    note('New shelf fitted. ' + (state.phase === 'open' ? 'Choose what goes on it after closing.' : 'Rearrange the shelves to put something on it.'));
  }

  // ---------- orders ----------
  function orderTotal() {
    let t = 0;
    let boxes = 0;
    for (const pid in order) { const p = prod(pid); t += order[pid] * p.box * p.cost; boxes += order[pid]; }
    return { cost: r5(t), boxes, fee: boxes ? DELIVERY_FEE : 0 };
  }
  function confirmOrder() {
    const t = orderTotal();
    if (!t.boxes) return;
    const total = t.cost + t.fee;
    if (state.cash < total) { note('Not enough cash for that order.'); return; }
    const now = sameDayDelivery();
    // ordered before you open and the van catches you at opening time; ordered
    // during the day and it waits for tomorrow morning
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
    order = {};
    persist();
    renderHud(); renderShelves(); renderSide();
    note(now
      ? 'You fetch it from the cash and carry yourself. It is in the stockroom \u2014 get it on the shelves.'
      : state.phase === 'closed'
        ? 'Order placed. The van pulls up as you open the door \u2014 it goes in the stockroom, so you will be putting it out between customers.'
        : 'Order placed. The van comes first thing tomorrow.');
  }

  // ---------- the day's report ----------
  // Nobody says a word while they shop. Everything they thought gets written
  // up here once the door is locked, and read back in the notebook tomorrow.
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

  function reportHtml(rep) {
    let h = '';
    h += rep.notes.length
      ? '<ul class="notes">' + rep.notes.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>'
      : '<p class="hint">Nothing worth writing down. Nobody grumbled, nobody went without.</p>';
    if (rep.remarks.length) {
      h += '<h3>What people said</h3><ul class="remarks">' +
        rep.remarks.slice().reverse().map((r) => '<li><span class="face">' + (r.look ? faceSvg(r.look) : '') + '</span><b>' + esc(r.name) + ':</b> ' + esc(r.text) + '</li>').join('') + '</ul>';
    }
    return h;
  }

  // ---------- side panel ----------
  function renderSide() {
    document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    if (tab === 'stock') renderStockTab();
    else if (tab === 'prices') renderPricesTab();
    else if (tab === 'orders') renderOrdersTab();
    else renderNotebookTab();
  }

  function renderStockTab() {
    let h = '<p class="hint">Shelves hold whatever you have ordered in and no more. Click a shelf in the shop, or a button here, to carry stock out of the stockroom. While the shop is open that takes a few seconds away from the till, so pick your moment.</p>';
    const stocked = state.slots.filter(Boolean);
    if (!stocked.length) h += '<p class="hint">No shelves set yet. Use <b>Rearrange the shelves</b> below, or click an empty shelf in the shop.</p>';
    if (state.phase === 'closed' && stocked.some((pid) => state.shelf[pid] < prod(pid).cap && roomQty(pid) > 0)) {
      h += '<button type="button" class="wide" id="btn-fill">Fill every shelf</button>';
    }
    for (const pid of stocked) {
      const p = prod(pid);
      const q = state.shelf[pid];
      const room = roomQty(pid);
      const age = roomAge(pid);
      let agenote = '';
      if (p.life && room) {
        const oldest = state.room[pid].filter((b) => b.age === age).reduce((a, b) => a + b.q, 0);
        const some = oldest < room ? oldest + ' of them ' : '';
        agenote = age === 0 ? 'fresh' : p.life - age <= 1 ? some + 'binned tonight' : some + age + ' day' + (age === 1 ? '' : 's') + ' old';
      }
      h += '<div class="row"><span class="ico">' + p.ico + '</span><div class="grow"><b>' + esc(p.name) + '</b><span class="sm">Shelf ' + q + '/' + p.cap + ' &middot; stockroom ' + room + (agenote ? ' (' + agenote + ')' : '') + '</span></div>' +
        '<button type="button" class="tiny" data-restock="' + pid + '"' + (q >= p.cap || !room ? ' disabled' : '') + '>Restock</button></div>';
    }
    if (state.phase === 'closed') h += '<button type="button" class="wide" id="btn-rearrange">Rearrange the shelves</button>';
    if (state.slots.length < MAX_SLOTS) h += '<button type="button" class="wide" id="btn-shelf">Fit another shelf &middot; ' + money(SHELF_COST) + '</button>';
    sideBody.innerHTML = h;
    sideBody.querySelectorAll('[data-restock]').forEach((b) => b.addEventListener('click', () => restock(b.dataset.restock)));
    const bf = $('btn-fill');
    if (bf) bf.addEventListener('click', fillAll);
    const br = $('btn-rearrange');
    if (br) br.addEventListener('click', chooseShelves);
    const bs = $('btn-shelf');
    if (bs) bs.addEventListener('click', buyShelf);
  }

  function renderPricesTab() {
    let h = '<p class="hint">Cost is what you pay per unit. Customers know roughly what things should cost and put them back if you push it too far &mdash; though you will not hear about it until closing time.</p>';
    const stocked = state.slots.filter(Boolean);
    for (const pid of stocked) {
      const p = prod(pid);
      const price = state.prices[pid];
      const st = state.report && state.report.stats[pid];
      const margin = price - p.cost;
      let fb = '';
      if (st && st.dear) fb = plural(st.dear, 'person', 'people') + ' said too dear yesterday';
      else if (st && st.bought) fb = st.bought + ' sold yesterday';
      h += '<div class="row"><span class="ico">' + p.ico + '</span><div class="grow"><b>' + esc(p.name) + '</b><span class="sm">Cost ' + money(p.cost) + ' &middot; margin ' + money(margin) + (fb ? ' &middot; ' + fb : '') + '</span></div>' +
        '<div class="stepper"><button type="button" data-price="' + pid + '" data-d="-1">&minus;</button><span>' + money(price) + '</span><button type="button" data-price="' + pid + '" data-d="1">+</button></div></div>';
    }
    sideBody.innerHTML = h;
    sideBody.querySelectorAll('[data-price]').forEach((b) => b.addEventListener('click', () => {
      const pid = b.dataset.price;
      state.prices[pid] = r5(clamp(state.prices[pid] + 0.05 * Number(b.dataset.d), 0.05, 50));
      persist();
      renderPricesTab();
      renderShelves();
      renderBelt();
    }));
  }

  function renderOrdersTab() {
    const t = orderTotal();
    let h = sameDayDelivery()
      ? '<p class="hint">Nothing in the shop. Order what you want and you can go and collect it yourself \u2014 it lands in the stockroom straight away, ready for today.</p>'
      : state.phase === 'closed'
        ? '<p class="hint">Order now and the van catches you as you open up, so it is there for today \u2014 but it goes in the stockroom, and putting it out takes you off the till. Order once you are open and it waits for tomorrow morning.</p>'
        : '<p class="hint">You are open, so the van has been and gone. Anything you order now comes tomorrow morning, before you unlock. Fresh things only keep a few days in the stockroom.</p>';
    const sn = seasonOf(state.day);
    const seasonal = PRODUCTS.filter((p) => p.season && p.season.includes(sn.id));
    h += '<p class="hint">' + sn.ico + ' <b>' + sn.name + '</b>, day ' + (((state.day - 1) % SEASON_LEN) + 1) + ' of ' + SEASON_LEN + '. ' +
      (seasonal.length ? 'In the wholesaler this season: ' + seasonal.map((p) => esc(p.name.toLowerCase())).join(', ') + '.' : 'Nothing seasonal on the list just now.') + '</p>';
    const vans = [['Arriving when you open', state.arriving], ['Arriving tomorrow morning', state.pending]];
    for (const van of vans) {
      if (!van[1].length) continue;
      h += '<div class="pending"><b>' + van[0] + ':</b> ' + van[1].map((o) => o.boxes + '&times; ' + esc(prod(o.pid).name.toLowerCase())).join(', ') + '</div>';
    }
    for (const p of PRODUCTS) {
      if (!inSeason(p)) continue;   // out of season: the wholesaler is not carrying it
      const n = order[p.id] || 0;
      const onShelf = state.slots.includes(p.id);
      h += '<div class="row' + (onShelf ? '' : ' dim') + '"><span class="ico">' + p.ico + '</span><div class="grow"><b>' + esc(p.name) + '</b><span class="sm">Box of ' + p.box + ' for ' + money(p.box * p.cost) + (p.life ? ' &middot; keeps ' + plural(p.life, 'day') : '') + ' &middot; ' + roomQty(p.id) + ' in stock' + (onShelf ? '' : ' &middot; not on a shelf') + '</span></div>' +
        '<div class="stepper"><button type="button" data-order="' + p.id + '" data-d="-1"' + (n ? '' : ' disabled') + '>&minus;</button><span>' + n + '</span><button type="button" data-order="' + p.id + '" data-d="1">+</button></div></div>';
    }
    h += '<div class="order-foot"><span>' + (t.boxes ? plural(t.boxes, 'box', 'boxes') + ' &middot; ' + money(t.cost) + ' + ' + money(t.fee) + ' delivery' : 'Nothing picked yet') + '</span>' +
      '<button type="button" class="primary" id="btn-order"' + (t.boxes ? '' : ' disabled') + '>Order ' + (t.boxes ? money(t.cost + t.fee) : '') + '</button></div>';
    sideBody.innerHTML = h;
    sideBody.querySelectorAll('[data-order]').forEach((b) => b.addEventListener('click', () => {
      const pid = b.dataset.order;
      order[pid] = clamp((order[pid] || 0) + Number(b.dataset.d), 0, 9);
      renderOrdersTab();
    }));
    $('btn-order').addEventListener('click', confirmOrder);
  }

  function renderNotebookTab() {
    const rep = state.report;
    let h = '<p class="hint">' + esc(DAYS[weekdayIndex()]) + ', ' + WEATHER[state.weather].ico + ' ' + WEATHER[state.weather].name + '. Tomorrow looks ' + WEATHER[state.nextWeather].ico + ' ' + WEATHER[state.nextWeather].name + '.</p>';
    h += '<h3>' + (rep ? 'Day ' + rep.day + ' ' + WEATHER[rep.weather].ico : 'Last night') + '</h3>';
    h += rep ? reportHtml(rep) : '<p class="hint">Nothing written up yet. People keep their thoughts to themselves while they shop &mdash; you find out how the day went when you cash off.</p>';
    const rows = PRODUCTS.map((p) => ({ p, s: state.totals[p.id] })).filter((x) => x.s.wanted > 0).sort((a, b) => b.s.wanted - a.s.wanted);
    if (rows.length) {
      h += '<h3>All time</h3><table class="tally"><tr><th></th><th>wanted</th><th>sold</th><th>dear</th><th>none</th></tr>' +
        rows.map((x) => '<tr><td>' + x.p.ico + ' ' + esc(x.p.name) + '</td><td>' + x.s.wanted + '</td><td>' + x.s.bought + '</td><td>' + x.s.dear + '</td><td>' + (x.s.empty + x.s.missing) + '</td></tr>').join('') + '</table>';
    }
    sideBody.innerHTML = h;
  }

  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; renderSide(); }));

  // ---------- hud ----------
  function renderHud() {
    $('hud-cash').textContent = money(state.cash);
    $('hud-cash').classList.toggle('bad', state.cash < 0);
    $('hud-day').textContent = 'Day ' + state.day + ' · ' + DAYS[weekdayIndex()].slice(0, 3) + ' · ' + seasonOf(state.day).ico;
    const w = WEATHER[state.weather];
    $('hud-weather').textContent = w.ico + ' ' + w.name;
    $('window-ico').textContent = w.ico;
    scene.dataset.weather = state.weather;
    const stars = Math.round(state.rep / 20);
    $('hud-rep').textContent = '★'.repeat(stars) + '☆'.repeat(5 - stars);
    $('hud-rep').title = 'Reputation ' + Math.round(state.rep) + '/100';
    $('hud-served').textContent = state.today.served;
    renderClock();
  }
  function renderClock() {
    const el = $('hud-clock');
    if (state.phase !== 'open' || !day) { el.textContent = 'Closed'; return; }
    const mins = Math.floor(9 * 60 + clamp(day.t / DAY_LENGTH, 0, 1) * 8 * 60);
    el.textContent = Math.floor(mins / 60) + ':' + String(mins % 60).padStart(2, '0') + (day.t >= DAY_LENGTH ? ' · closing' : '');
  }
  function renderQueue() {
    queueEl.innerHTML = '';
    if (!day) return;
    day.queue.forEach((c, i) => {
      const d = document.createElement('div');
      d.className = 'q';
      d.style.setProperty('--i', i);
      d.innerHTML = faceSvg(c.look);
      d.title = c.name;
      queueEl.appendChild(d);
    });
  }

  // ---------- overlay ----------
  function showOverlay(title, body, buttons, dismissible) {
    overlay.dataset.dismiss = dismissible ? '1' : '';
    $('overlay-title').textContent = title;
    $('overlay-body').innerHTML = body;
    const acts = $('overlay-actions');
    acts.innerHTML = '';
    for (const b of buttons) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = b.cls === 'ghost' ? 'ghost' : 'primary';
      btn.textContent = b.label;
      btn.addEventListener('click', () => { hideOverlay(); if (b.fn) b.fn(); });
      acts.appendChild(btn);
    }
    overlay.hidden = false;
    const first = acts.querySelector('.primary') || acts.firstChild;
    if (first) first.focus();
  }
  function hideOverlay() { overlay.hidden = true; shelfPick = null; }

  // clicking the dark surround, or Escape, backs out of anything that has a
  // "leave it" way out; the rest have to be answered
  overlay.addEventListener('click', (e) => { if (e.target === overlay && overlay.dataset.dismiss) hideOverlay(); });
  $('overlay-body').addEventListener('click', (e) => {
    const b = e.target.closest('.pick');
    if (b && shelfPick) togglePick(b.dataset.pid);
  });

  // ---------- the day ----------
  function openShop() {
    if (state.phase !== 'closed') return;
    if (shelfTotal() <= 0) {
      const room = PRODUCTS.some((p) => roomQty(p.id) > 0);
      note(room
        ? 'The shelves are bare. Put the stock out before you unlock the door.'
        : 'Nothing to sell. Order some stock in on the Orders tab first.');
      tab = room ? 'stock' : 'orders';
      renderSide();
      return;
    }
    // Snow and a gale keep people at home; a scorcher and a sunny weekend bring them out.
    const q = WEATHER[state.weather].quiet || 1;
    const n = clamp(Math.round((9 + state.rep / 8 + (isWeekend() ? 2 : 0)) * q), 5, 24);
    const spawnAt = [];
    for (let i = 0; i < n; i++) spawnAt.push(rand(1.5, DAY_LENGTH - 12));
    spawnAt.sort((a, b) => a - b);
    day = { t: 0, spawnAt, spawnIdx: 0, browser: null, queue: [], till: null, away: 0, awayJob: null, belt: [], bag: [], rung: [], total: 0, cool: 0 };
    state.phase = 'open';
    state.today.repStart = state.rep;
    bannerEl.hidden = true;
    const dropped = deliver(state.arriving);
    persist();
    renderHud(); renderReceipt(); renderQueue(); renderShelves(); renderSide();
    note(dropped
      ? 'Open for business, and the van has just dropped ' + dropped + ' off in the stockroom.'
      : 'Open for business. ' + WEATHER[state.weather].ico + ' ' + cap1(WEATHER[state.weather].name) + ' out there.');
  }

  function tick(dt) {
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
    renderClock();
    renderPatience();
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
    dropHeld();
    clearCoins();
    awayEl.hidden = true;
    shopperEl.hidden = true;
    browserEl.hidden = true;
    hideThought();
    hush(shopperBubble);
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
    persist();
    renderHud(); renderShelves(); renderBelt(); renderBag(); renderReceipt(); renderCoins(); renderQueue(); renderSide();
    showSummary(profit);
  }

  function showSummary(profit) {
    const t = state.today;
    const w = WEATHER[state.nextWeather];
    let best = null;
    for (const p of PRODUCTS) { const s = t.stats[p.id]; if (!best || s.bought > best.n) best = { p, n: s.bought }; }
    let h = '<table class="sheet">' +
      '<tr><td>Takings</td><td>' + money(t.takings) + '</td></tr>' +
      '<tr><td>Cost of what you sold</td><td>-' + money(t.cogs) + '</td></tr>' +
      '<tr><td>Rent</td><td>-' + money(RENT) + '</td></tr>' +
      '<tr class="tot"><td>Day\'s profit</td><td>' + money(profit) + '</td></tr>' +
      (t.spent ? '<tr><td>Spent on orders and shelves</td><td>-' + money(t.spent) + '</td></tr>' : '') +
      '<tr><td>Cash in the tin</td><td>' + money(state.cash) + '</td></tr></table>';
    const bits = [];
    bits.push(plural(t.served, 'customer') + ' served' + (t.quick ? ', ' + t.quick + ' of them quickly' : '') + '.');
    if (t.walked) bits.push(plural(t.walked, 'person', 'people') + ' walked out of the queue.');
    if (t.busy) bits.push(plural(t.busy, 'person', 'people') + ' left because the queue was too long.');
    if (t.nothing) bits.push(plural(t.nothing, 'person', 'people') + ' found nothing they wanted.');
    if (best && best.n) bits.push('Best seller: ' + best.p.name.toLowerCase() + ' (' + best.n + ').');
    if (t.binned.length) bits.push('Binned overnight: ' + t.binned.map((b) => b.q + ' ' + prod(b.pid).name.toLowerCase()).join(', ') + '.');
    const dr = Math.round(state.rep - t.repStart);
    bits.push('Reputation ' + (dr >= 0 ? 'up ' : 'down ') + Math.abs(dr) + '.');
    h += '<ul>' + bits.map((b) => '<li>' + esc(b) + '</li>').join('') + '</ul>';
    if (state.report) h += '<h3>How it went</h3>' + reportHtml(state.report);
    if (state.pending.length) h += '<p>The van brings ' + state.pending.map((o) => o.boxes + ' box' + (o.boxes === 1 ? '' : 'es') + ' of ' + esc(prod(o.pid).name.toLowerCase())).join(', ') + ' in the morning.</p>';
    else h += '<p>Nothing on order. Whatever you order in the morning comes with the van as you open up.</p>';
    h += '<p class="forecast">Tomorrow looks <b>' + w.ico + ' ' + w.name + '</b>. Check the notebook before you order.</p>';
    if (state.cash < 0) h += '<p class="warn">You are in the red. The landlord gives you one more morning to sort it.</p>';
    showOverlay('Closing time, day ' + state.day, h, [{ label: 'Next morning', fn: morning }]);
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
    persist();
    renderAll();
    if (state.phase === 'over') { gameOver(); return; }
    $('banner-text').textContent = (arrived ? 'The van dropped off ' + arrived + '. ' : '') +
      (stockTotal() ? 'Put the stock out, check your prices, then open up.' : 'Nothing left in the shop. Order some stock in before you open.');
    bannerEl.hidden = false;
    if (state.cash < 0) note('Rent is overdue. Get back above zero by tomorrow morning or the landlord closes you down.');
  }

  function gameOver() {
    const days = state.days.length;
    const total = state.days.reduce((a, d) => a + d.profit, 0);
    showOverlay('The landlord has changed the locks', '<p>Two mornings in the red was one too many. You kept the shop going for ' + plural(days, 'day') + ' and sold ' + plural(state.sold, 'thing') + ', for ' + money(total) + ' profit all told.</p>', [{ label: 'Start again', fn: resetGame }]);
  }

  function resetGame() {
    state = freshState();
    day = null;
    order = {};
    persist();
    renderAll();
    $('banner-text').textContent = 'A new shop, and not a tin on the shelves. Order your first stock in on the Orders tab, put it out, then open up.';
    bannerEl.hidden = false;
  }

  function renderAll() {
    renderHud(); renderShelves(); renderBelt(); renderBag(); renderReceipt(); renderCoins(); renderQueue(); renderSide();
    bannerEl.hidden = state.phase !== 'closed';
    awayEl.hidden = true;
    shopperEl.hidden = true;
    browserEl.hidden = true;
    hideThought();
    renderPatience();
  }

  // ---------- wiring ----------
  $('btn-open').addEventListener('click', openShop);
  $('btn-help').addEventListener('click', () => { $('help').hidden = false; });
  $('btn-help-close').addEventListener('click', () => { $('help').hidden = true; });
  $('btn-reset').addEventListener('click', () => {
    if (window.confirm('Start a brand new shop? Your progress will be lost.')) resetGame();
  });
  $('btn-sound').addEventListener('click', () => {
    sound = !sound;
    $('btn-sound').textContent = 'Sound: ' + (sound ? 'on' : 'off');
    $('btn-sound').setAttribute('aria-pressed', String(sound));
    try { localStorage.setItem(SOUND_KEY, sound ? '1' : '0'); } catch (e) { /* ignore */ }
    if (sound) beep();
  });

  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'Escape') {
      dropHeld();
      if (!$('help').hidden) $('help').hidden = true;
      else if (!overlay.hidden && overlay.dataset.dismiss) hideOverlay();
      return;
    }
    if (!overlay.hidden || !$('help').hidden) return;
    if (e.key === 'Enter' || e.key === ' ') {
      if (state.phase === 'open' && day && day.coins && day.coins.length) { e.preventDefault(); takeCoin(day.coins[0].uid); }
      else if (state.phase === 'closed' && e.target === document.body) { e.preventDefault(); openShop(); }
    }
  });

  // ---------- boot ----------
  try { sound = localStorage.getItem(SOUND_KEY) === '1'; } catch (e) { sound = false; }
  $('btn-sound').textContent = 'Sound: ' + (sound ? 'on' : 'off');
  $('btn-sound').setAttribute('aria-pressed', String(sound));
  state = loadState();
  fit();
  renderAll();
  if (state.phase === 'over') gameOver();
  else if (state.day === 1 && state.today.served === 0 && !state.days.length) {
    $('banner-text').textContent = 'Your first morning, and the shop is empty. Order some stock in on the Orders tab \u2014 you can collect that first lot yourself and sell it today.';
    $('help').hidden = false;
  } else {
    $('banner-text').textContent = stockTotal()
      ? 'Fill the shelves, check your prices, then open up.'
      : 'Nothing left to sell. Order some stock in before you open.';
  }

  let last = 0;
  function frame(ts) {
    const dt = last ? Math.min(0.1, (ts - last) / 1000) : 0;
    last = ts;
    if (state.phase === 'open' && day) tick(dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Small hook for smoke tests.
  window.__shop = {
    get state() { return state; }, PRODUCTS, PERSONAS, WEATHER, SEASONS, SEASON_LEN,
    seasonOf, inSeason, rollWeather, weightedPersona, buildWants, makeLook, faceSvg,
    openShop, tick, renderSide, setTab: (t) => { tab = t; renderSide(); },
  };
})();
