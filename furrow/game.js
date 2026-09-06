/* Furrow — a small farming-village sim.
   An empty plot by the road. Lay out farms and paths, build houses, a storehouse,
   a shop, workshops and a yard full of animals, and watch the villagers sow,
   harvest, haul, bake, milk, shear and sleep.
   The plot is bigger than the window: push the pointer to the edge and hold the
   button down to walk the camera over it.
   No build step, no dependencies. */
(() => {
  'use strict';

  // ------------------------------------------------------------ constants
  const TILE = 32;
  const COLS = 42, ROWS = 26;              // the whole plot
  const VIEW_W = 26, VIEW_H = 17;          // how much of it fits in the window
  const ROAD_ROW = ROWS - 1;
  const CAMP = { x: 21, y: ROWS - 2 };
  const SAVE_KEY = 'furrow-save-v2';
  const OLD_KEY = 'furrow-save-v1';
  const OLD = { COLS: 26, ROWS: 16, DX: 8, DY: 10 };   // where an old plot lands in the new one
  const START_COINS = 150;
  const GOAL = 2400;
  const WORK_START = 6, WORK_END = 19;
  const SEC_PER_HOUR_DAY = 4, SEC_PER_HOUR_NIGHT = 1.5;
  const CARRY_CAP = 6;
  const MAX_POP = 16;
  const BASE_SPEED = 2.4;          // tiles per second on grass at full energy
  const FARM_COST = 4, PATH_COST = 1;
  const EDGE = 38;                 // px band at the canvas edge that pans the camera
  const PAN_SPEED = 13;            // tiles per second
  const CRAFT_CAP = 12;            // how much raw material a workshop will hold
  const PEN_FEED_CAP = 12, PEN_READY_CAP = 14;

  const CROPS = {
    carrot:  { name: 'Carrots',  grow: 20, yield: 2, price: 3,  food: true,  blurb: 'Quick and cheap. Feeds people, and pigs are very fond of them.' },
    wheat:   { name: 'Wheat',    grow: 40, yield: 3, price: 2,  food: false, blurb: 'Worth little raw, and everything else in the village wants it: the bakery, the hens, the cows, the sheep.' },
    cabbage: { name: 'Cabbages', grow: 30, yield: 2, price: 5,  food: true,  blurb: 'Slower, but sells for more.' },
    pumpkin: { name: 'Pumpkins', grow: 60, yield: 1, price: 14, food: true,  blurb: 'Three days in the ground. Worth the wait.' },
    onion:   { name: 'Onions',   grow: 26, yield: 3, price: 3,  food: true,  blurb: 'Three to a tile and they keep. The thing to have in the storehouse in winter.' },
    herb:    { name: 'Herbs',    grow: 14, yield: 1, price: 7,  food: false, blurb: 'Ready in half a day and worth seven coins a bunch. Nobody can live on them.' },
    turnip:  { name: 'Turnips',  grow: 34, yield: 2, price: 4,  food: true,  blurb: 'Hardy. Barely notices a frost, which in January is the whole of its case.', hardy: true },
  };
  const GOODS = {
    wheat:   { name: 'Wheat',    price: 2,  food: false, color: '#d9b64a' },
    bread:   { name: 'Bread',    price: 6,  food: true,  color: '#c58b4a' },
    carrot:  { name: 'Carrots',  price: 3,  food: true,  color: '#e8873a' },
    cabbage: { name: 'Cabbages', price: 5,  food: true,  color: '#7fbf6a' },
    pumpkin: { name: 'Pumpkins', price: 14, food: true,  color: '#e07a2a' },
    onion:   { name: 'Onions',   price: 3,  food: true,  color: '#c8a86a' },
    herb:    { name: 'Herbs',    price: 7,  food: false, color: '#5f9c5a' },
    turnip:  { name: 'Turnips',  price: 4,  food: true,  color: '#b98fc0' },
    egg:     { name: 'Eggs',     price: 4,  food: true,  color: '#efe3c8' },
    milk:    { name: 'Milk',     price: 5,  food: true,  color: '#f2f0e8' },
    wool:    { name: 'Wool',     price: 9,  food: false, color: '#ded6c4' },
    truffle: { name: 'Truffles', price: 20, food: false, color: '#4a3a2e' },
    cheese:  { name: 'Cheese',   price: 16, food: true,  color: '#e8c25a' },
    cloth:   { name: 'Cloth',    price: 40, food: false, color: '#b06a8a' },
  };
  const GOOD_ORDER = ['wheat', 'carrot', 'cabbage', 'pumpkin', 'onion', 'herb', 'turnip', 'egg', 'milk', 'wool', 'truffle', 'bread', 'cheese', 'cloth'];
  const GOOD_GROUPS = [
    { name: 'Out of the ground', goods: ['wheat', 'carrot', 'cabbage', 'pumpkin', 'onion', 'herb', 'turnip'] },
    { name: 'Out of the yard',   goods: ['egg', 'milk', 'wool', 'truffle'] },
    { name: 'Made here',         goods: ['bread', 'cheese', 'cloth'] },
  ];

  // Animals. `price` buys one at the market; a pen refunds half when you sell one on.
  const STOCK = {
    hen:   { name: 'Hen',   plural: 'hens',   price: 12 },
    pig:   { name: 'Pig',   plural: 'pigs',   price: 30 },
    cow:   { name: 'Cow',   plural: 'cows',   price: 45 },
    sheep: { name: 'Sheep', plural: 'sheep',  price: 32 },
  };
  const many = (n, a) => `${n} ${n === 1 ? STOCK[a].name.toLowerCase() : STOCK[a].plural}`;

  const BUILDINGS = {
    house:  { name: 'House', w: 2, h: 2, cost: 40, beds: 2,
      blurb: 'Two beds. Villagers who sleep in a bed wake up rested.' },
    store:  { name: 'Storehouse', w: 3, h: 2, cost: 50,
      blurb: 'Everything the village makes ends up here. Sell from it, or keep things back for the workshops and the shop.' },
    shop:   { name: 'Shop', w: 2, h: 2, cost: 60,
      blurb: 'Villagers buy supper here every evening. No shop, no supper.' },
    bakery: { name: 'Bakery', w: 2, h: 2, cost: 80,
      craft: { from: 'wheat', need: 2, to: 'bread', make: 3, time: 2.4, verb: 'Baking' },
      blurb: 'Turns 2 wheat into 3 bread. Bread sells for three times what wheat does.' },
    dairy:  { name: 'Dairy', w: 2, h: 2, cost: 110,
      craft: { from: 'milk', need: 3, to: 'cheese', make: 2, time: 2.8, verb: 'Turning the cheese' },
      blurb: 'Turns 3 milk into 2 cheese. Cheese keeps all winter and sells for sixteen.' },
    weaver: { name: 'Weaver’s', w: 2, h: 2, cost: 130,
      craft: { from: 'wool', need: 3, to: 'cloth', make: 1, time: 3.2, verb: 'At the loom' },
      blurb: 'Three fleeces make a bolt of cloth, and cloth is the most valuable thing that leaves this plot. Shirts and blankets are somebody else’s trade.' },
    coop:   { name: 'Hen house', w: 3, h: 2, cost: 70,
      pen: { animal: 'hen', cap: 6, rate: 0.9, feed: ['wheat'], feedPer: 1, produce: 'egg', yieldPer: 2 },
      blurb: 'Six hens at most. Scatter wheat and collect eggs — the fastest small money on the plot.' },
    sty:    { name: 'Pigsty', w: 3, h: 2, cost: 90,
      pen: { animal: 'pig', cap: 4, rate: 0.5, feed: ['turnip', 'carrot', 'onion', 'cabbage', 'pumpkin'], feedPer: 2, produce: 'truffle', yieldPer: 1 },
      blurb: 'Pigs eat roots — two of anything for one truffle, and a truffle is worth twenty coins to a man with a cart. They will not touch the good stuff if the shop is short.' },
    byre:   { name: 'Cow byre', w: 4, h: 3, cost: 140,
      pen: { animal: 'cow', cap: 4, rate: 0.8, feed: ['wheat'], feedPer: 1, produce: 'milk', yieldPer: 2 },
      blurb: 'Cows want hay and a lot of room. Milk is food on its own; through the dairy it is cheese.' },
    fold:   { name: 'Sheep fold', w: 4, h: 3, cost: 120,
      pen: { animal: 'sheep', cap: 5, rate: 0.5, feed: ['wheat'], feedPer: 1, produce: 'wool', yieldPer: 1, graze: true },
      blurb: 'Sheep get by on the grass from spring to autumn and only need hay when the ground goes hard. The weaver turns the fleeces into cloth.' },
  };
  const SHOP_CAP = 18;
  const SUPPER_PRICE = 2;
  // Jacking a building up and rolling it somewhere else costs a quarter of its price.
  const moveFee = (type) => Math.max(5, Math.round(BUILDINGS[type].cost / 4));

  const TOOLS = [
    { id: 'select', label: 'Look', hint: 'Click a villager, a building, a farm or an animal to see what it is up to.' },
    { id: 'farm', label: 'Farm', cost: `${FARM_COST}/tile`, hint: 'Drag across the grass to lay out a farm. Bigger farms take longer to work.' },
    { id: 'path', label: 'Path', cost: `${PATH_COST}/tile`, hint: 'Drag from one place to another. Villagers walk almost twice as fast on paths.' },
    { id: 'house', label: 'House', cost: BUILDINGS.house.cost, hint: 'Click on the grass to build. Two villagers can sleep here.' },
    { id: 'store', label: 'Storehouse', cost: BUILDINGS.store.cost, hint: 'Click on the grass to build. You need one before anyone can harvest.' },
    { id: 'shop', label: 'Shop', cost: BUILDINGS.shop.cost, hint: 'Click on the grass to build. Food is carried here from the storehouse.' },
    { id: 'bakery', label: 'Bakery', cost: BUILDINGS.bakery.cost, hint: 'Click on the grass to build. Needs wheat in the storehouse.' },
    { id: 'dairy', label: 'Dairy', cost: BUILDINGS.dairy.cost, hint: 'Click on the grass to build. Needs a cow byre first, or there is no milk.' },
    { id: 'weaver', label: 'Weaver’s', cost: BUILDINGS.weaver.cost, hint: 'Click on the grass to build. Needs wool, so it needs sheep.' },
    { id: 'coop', label: 'Hen house', cost: BUILDINGS.coop.cost, hint: 'Click on the grass to build. Comes with two hens and eats wheat.' },
    { id: 'sty', label: 'Pigsty', cost: BUILDINGS.sty.cost, hint: 'Click on the grass to build. Comes with two pigs and eats root crops.' },
    { id: 'byre', label: 'Cow byre', cost: BUILDINGS.byre.cost, hint: 'Click on the grass to build. Comes with two cows. Wants four tiles by three.' },
    { id: 'fold', label: 'Sheep fold', cost: BUILDINGS.fold.cost, hint: 'Click on the grass to build. Comes with two sheep, who mostly feed themselves.' },
    { id: 'demolish', label: 'Clear', hint: 'Click a building, farm, path or tree to take it away. Half the cost comes back.' },
    { id: 'move', label: 'Move', hidden: true, hint: 'Click where the building should stand. Escape leaves it where it is.' },
  ];
  const TOOL_GROUPS = [
    { name: 'Land', tools: ['select', 'farm', 'path'] },
    { name: 'Village', tools: ['house', 'store', 'shop'] },
    { name: 'Workshops', tools: ['bakery', 'dairy', 'weaver'] },
    { name: 'The yard', tools: ['coop', 'sty', 'byre', 'fold'] },
    { name: '', tools: ['demolish'] },
  ];

  const NAMES = ['Ada', 'Bram', 'Cass', 'Dunstan', 'Elke', 'Fenn', 'Gwen', 'Hal', 'Ida', 'Jory', 'Kit', 'Lise', 'Mab', 'Ned', 'Orla', 'Pip', 'Quill', 'Rook', 'Sula', 'Tam', 'Una', 'Wren'];
  const SHIRTS = ['#d05a4f', '#4f8fd0', '#d0a34f', '#6fbf73', '#b26fd0', '#d07a4f', '#4fb9c9', '#c95f9c'];
  const HAIRS = ['#3a2c22', '#8a5a2a', '#d8b04a', '#5a4436', '#b06a3a', '#2b2b2f'];
  const HATS = ['none', 'none', 'straw', 'cap', 'kerchief'];

  // ------------------------------------------------------------ the year
  // Four seasons of seven days. The season sets how fast anything in the ground moves, and
  // winter barely moves at all, so a village that has not put food by spends February hungry.
  const DAYS_PER_SEASON = 7;
  const SEASONS = [
    { id: 'spring', name: 'Spring', grow: 1.2,
      grass: ['#5f9a4d', '#69a556'], tuft: '#4f8a40', soil: '#6b4a2e', leaf: '#6fb356',
      note: 'Everything in the ground puts on a spurt. Sow what you can while it lasts.' },
    { id: 'summer', name: 'Summer', grow: 1.0,
      grass: ['#6a9c48', '#749f52'], tuft: '#588a3c', soil: '#6f4d30', leaf: '#5da34a',
      note: 'The long working weeks. Nothing helps and nothing hinders.' },
    { id: 'autumn', name: 'Autumn', grow: 0.75,
      grass: ['#8a9245', '#93964d'], tuft: '#7a7c3a', soil: '#7a5432', leaf: '#c88a3a',
      note: 'Growth slows. What is in the storehouse now is what you will have.' },
    { id: 'winter', name: 'Winter', grow: 0.18,
      grass: ['#8ea08c', '#93a591'], tuft: '#7d8d7c', soil: '#6a5a4c', leaf: '#8a7a68',
      note: 'Almost nothing grows. Sell nothing you can eat, and keep the shop stocked.' },
  ];
  const seasonOf = (day) => SEASONS[Math.floor((day - 1) / DAYS_PER_SEASON) % SEASONS.length];
  const yearOf = (day) => 1 + Math.floor((day - 1) / (DAYS_PER_SEASON * SEASONS.length));
  const dayOfSeason = (day) => ((day - 1) % DAYS_PER_SEASON) + 1;

  // Weather is rolled every morning out of whatever suits the season. `grow` multiplies the
  // season's own rate; `speed` is what the ground does to a pair of boots.
  const WEATHER = [
    { id: 'fair', name: 'Fair', grow: 1, w: 5, note: 'A decent working day.' },
    { id: 'sun', name: 'Bright sun', grow: 1.25, w: 3, not: ['winter'], note: 'Everything in the ground is enjoying itself.' },
    { id: 'rain', name: 'Rain', grow: 1.35, speed: 0.85, w: 3, not: ['winter'], note: 'Good for the fields, hard on the boots.' },
    { id: 'grey', name: 'Grey and still', grow: 0.85, w: 3, note: 'Nothing much happens, slowly.' },
    { id: 'wind', name: 'A hard wind', grow: 0.8, speed: 0.9, w: 2, note: 'Everyone is walking at an angle.' },
    { id: 'storm', name: 'A storm', grow: 0.6, speed: 0.7, w: 1, not: ['winter'], note: 'Work goes on. It goes on wetly.' },
    { id: 'frost', name: 'Frost', grow: 0.4, w: 3, only: ['autumn', 'winter'], note: 'The ground is iron until noon.' },
    { id: 'snow', name: 'Snow', grow: 0.05, speed: 0.65, w: 4, only: ['winter'], note: 'Nothing grows. Nobody hurries.' },
  ];
  function rollWeather(day) {
    const s = seasonOf(day).id;
    const pool = WEATHER.filter((w) => (!w.only || w.only.includes(s)) && !(w.not || []).includes(s));
    let total = 0;
    for (const w of pool) total += w.w;
    let r = Math.random() * total;
    for (const w of pool) { r -= w.w; if (r <= 0) return w.id; }
    return pool[pool.length - 1].id;
  }
  const weatherOf = () => WEATHER.find((w) => w.id === S.weather) || WEATHER[0];
  const growthRate = () => seasonOf(S.day).grow * weatherOf().grow;
  const walkRate = () => weatherOf().speed || 1;
  const isSnowy = () => S.weather === 'snow' || (seasonOf(S.day).id === 'winter' && S.weather === 'frost');

  // ------------------------------------------------------------ the morning notice
  // One thing happens before work starts. Most of them are a nudge to the numbers; a few put a
  // single decision in front of you, priced, take it or leave it. It is what stops thirty
  // identical mornings.
  const foodInStore = () => GOOD_ORDER.reduce((n, g) => n + (GOODS[g].food ? S.store[g] : 0), 0);
  const pensOf = (type) => S.buildings.filter((b) => b.type === type);
  const NOTICES = [
    { id: 'quiet', w: 6,
      text: () => 'A quiet start. ' + weatherOf().note },
    { id: 'season', w: 0, force: (s) => dayOfSeason(s.day) === 1,
      text: () => seasonOf(S.day).name + ' comes in. ' + seasonOf(S.day).note },
    { id: 'rats', w: 3, when: () => foodInStore() >= 8,
      text: () => {
        const g = GOOD_ORDER.filter((k) => GOODS[k].food && S.store[k] > 0).sort((a, b) => S.store[b] - S.store[a])[0];
        const n = Math.max(1, Math.round(S.store[g] * 0.2));
        S.store[g] -= n;
        return `Rats in the storehouse. ${plural(n, GOODS[g].name.toLowerCase().replace(/s$/, ''))} gone.`;
      }, kind: 'bad' },
    { id: 'earlybird', w: 3,
      text: () => { for (const v of S.villagers) v.energy = Math.min(100, v.energy + 12); return 'Somebody was up before the light and got the fires going. Everyone starts the day a little fresher.'; }, kind: 'good' },
    { id: 'volunteer', w: 3, when: () => S.villagers.length < MAX_POP && freeBeds() > 0,
      text: () => { const v = addVillager(CAMP.x, CAMP.y - 0.4); return `${v.name} walked in off the road looking for work, and there is a bed going.`; }, kind: 'good' },
    { id: 'windfall', w: 2,
      text: () => { const n = 8 + Math.floor(Math.random() * 12); S.coins += n; S.earned += n; return `A cart came through and paid ${n} coins for directions and a drink of water.`; }, kind: 'good' },
    { id: 'mud', w: 2, when: () => S.farms.length >= 2 && (weatherOf().id === 'rain' || weatherOf().id === 'storm'),
      text: () => 'The bottom field is under water. Whatever is sown down there is going nowhere today.' },
    { id: 'sprout', w: 3, when: () => S.plots.some((p) => p && p.stage === 1),
      text: () => {
        let n = 0;
        for (const p of S.plots) if (p && p.stage === 1 && Math.random() < 0.35) { p.growth = Math.min(1, p.growth + 0.25); if (p.growth >= 1) { p.growth = 1; p.stage = 2; } n++; }
        return n ? `A warm night. ${plural(n, 'plot')} came on further than anybody expected.` : 'A warm night, and not much to show for it.';
      }, kind: 'good' },
    { id: 'ache', w: 2, when: () => S.villagers.length >= 3,
      text: () => { const v = rnd(S.villagers); v.energy = Math.max(10, v.energy - 30); return `${v.name} has slept badly and will be no use until the afternoon.`; }, kind: 'warn' },
    { id: 'frostbite', w: 4, when: () => weatherOf().id === 'frost' || weatherOf().id === 'snow',
      text: () => {
        const ready = S.plots.filter((p) => p && p.stage === 1 && p.growth > 0.2);
        if (!ready.length) return 'A hard frost. There is nothing in the ground for it to spoil, which is one way of putting it.';
        const p = rnd(ready); p.growth = Math.max(0, p.growth - 0.3);
        return 'A hard frost got into one of the plots overnight. It has gone backwards.';
      }, kind: 'bad' },
    // the yard
    { id: 'fox', w: 3, when: () => pensOf('coop').some((b) => b.herd > 0),
      text: () => {
        const b = rnd(pensOf('coop').filter((p) => p.herd > 0));
        if (b.ready > 0) { const n = Math.min(b.ready, 3 + Math.floor(Math.random() * 3)); b.ready -= n; return `A fox has been at the hen house. ${plural(n, 'egg')} broken, and not one hen touched, which they will be telling each other about all day.`; }
        b.herd = Math.max(0, b.herd - 1);
        return 'A fox has been at the hen house and a hen is missing. The rest are not laying today.';
      }, kind: 'bad' },
    { id: 'lambs', w: 3, when: () => pensOf('fold').some((b) => b.herd > 0 && b.herd < BUILDINGS.fold.pen.cap) && ['spring', 'summer'].includes(seasonOf(S.day).id),
      text: () => { const b = rnd(pensOf('fold').filter((p) => p.herd > 0 && p.herd < BUILDINGS.fold.pen.cap)); b.herd++; return 'Lambs in the fold this morning, on legs like a card table. That is one more fleece in the summer.'; }, kind: 'good' },
    { id: 'gate', w: 2, when: () => S.buildings.some((b) => BUILDINGS[b.type].pen && b.herd > 0),
      text: () => {
        const b = rnd(S.buildings.filter((x) => BUILDINGS[x.type].pen && x.herd > 0));
        const a = BUILDINGS[b.type].pen.animal;
        for (const v of S.villagers) v.energy = Math.max(15, v.energy - 8);
        return `The gate was left open and the ${STOCK[a].plural} were halfway to the road before anybody noticed. Everyone has had a run before breakfast.`;
      }, kind: 'warn' },
    { id: 'goodyield', w: 2, when: () => S.buildings.some((b) => BUILDINGS[b.type].pen && b.herd >= 2 && b.ready < PEN_READY_CAP - 4),
      text: () => {
        const b = rnd(S.buildings.filter((x) => BUILDINGS[x.type].pen && x.herd >= 2 && x.ready < PEN_READY_CAP - 4));
        const p = BUILDINGS[b.type].pen;
        const n = Math.min(PEN_READY_CAP - b.ready, 2 + Math.floor(Math.random() * 3));
        b.ready += n;
        return `Something has agreed with the ${STOCK[p.animal].plural}. ${plural(n, GOODS[p.produce].name.toLowerCase().replace(/s$/, ''))} more than anybody expected.`;
      }, kind: 'good' },
    // the ones that ask you something
    { id: 'pedlar', w: 3, offer: { cost: 25, label: 'Buy the seed (25 coins)' },
      text: () => 'A pedlar is on the road with a sack of good seed. He wants twenty-five coins for it and will not be here at noon.',
      accept: () => {
        let n = 0;
        for (const p of S.plots) if (p && p.stage === 1) { p.growth = Math.min(1, p.growth + 0.2); if (p.growth >= 1) { p.growth = 1; p.stage = 2; } n++; }
        return n ? `The seed goes in and ${plural(n, 'plot')} come on a fifth of the way.` : 'The seed goes into the storehouse for next time.';
      } },
    { id: 'thatcher', w: 2, when: () => S.buildings.some((b) => b.type === 'house'), offer: { cost: 30, label: 'Pay the thatcher (30 coins)' },
      text: () => 'A thatcher is passing and says the roofs want doing before the weather turns. Thirty coins and a day of his time.',
      accept: () => { for (const v of S.villagers) v.energy = Math.min(100, v.energy + 25); return 'The roofs are done and the beds are dry. Everyone sleeps better tonight.'; } },
    { id: 'drover', w: 2, when: () => foodInStore() >= 4, offer: { cost: 0, label: 'Fill his bag (a day’s food)' },
      text: () => 'A drover has come off the hill with nothing left to eat and is asking, politely, for a day’s food.',
      accept: () => {
        const g = GOOD_ORDER.filter((k) => GOODS[k].food && S.store[k] > 0).sort((a, b) => S.store[b] - S.store[a])[0];
        if (!g) return 'There was nothing to give him after all.';
        const n = Math.min(4, S.store[g]);
        S.store[g] -= n; S.coins += 20; S.earned += 20;
        return `He takes ${plural(n, GOODS[g].name.toLowerCase().replace(/s$/, ''))}, and leaves twenty coins on the step on his way out, which was not the arrangement.`;
      } },
    { id: 'shearer', w: 2, when: () => pensOf('fold').some((b) => b.herd > 0), offer: { cost: 18, label: 'Hire him for the morning (18 coins)' },
      text: () => 'A shearer is working his way along the valley and can do your fold before dinner. Eighteen coins.',
      accept: () => {
        let n = 0;
        for (const b of pensOf('fold')) { const g = Math.min(PEN_READY_CAP - b.ready, b.herd * 2); b.ready += g; n += g; }
        return n ? `Done in an hour and a half, and ${plural(n, 'fleece')} in the fold waiting to be carried in.` : 'The fold was already piled to the rafters. He has a cup of tea and moves on.';
      } },
    { id: 'strayCow', w: 2, when: () => pensOf('byre').some((b) => b.herd < BUILDINGS.byre.pen.cap), offer: { cost: 40, label: 'Take the cow (40 coins)' },
      text: () => 'A drover is a cow heavier than he means to be and would rather have forty coins than walk her over the pass.',
      accept: () => { const b = pensOf('byre').find((x) => x.herd < BUILDINGS.byre.pen.cap); if (!b) return 'There was no room for her after all.'; b.herd++; return 'She is in the byre, unimpressed, and already eating.'; } },
  ];

  // ------------------------------------------------------------ state
  let S = null;           // saved game state
  const CLAIMS = {};      // task key -> villager id (transient)
  const HERDS = {};       // building id -> wandering animals (transient, cosmetic)
  const UI = {
    tool: 'select', sel: null, drag: null, hover: null, speed: 1, panelKey: '', structure: 0,
    moving: null, cam: { x: 0, y: 0 }, mouse: null, edge: null, panning: false, keyPan: { x: 0, y: 0 },
  };

  const idx = (x, y) => y * COLS + x;
  const inb = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (a) => a[Math.floor(Math.random() * a.length)];
  const plural = (n, s) => `${n} ${s}${n === 1 ? '' : 's'}`;
  const camMaxX = () => Math.max(0, COLS - VIEW_W);
  const camMaxY = () => Math.max(0, ROWS - VIEW_H);
  const camOx = () => Math.round(UI.cam.x * TILE);
  const camOy = () => Math.round(UI.cam.y * TILE);

  // ------------------------------------------------------------ the plot itself
  // Grass everywhere, a road along the bottom, and enough trees, stones and standing water
  // to make one corner of it worth building near and another worth clearing first.
  function generateScenery(kind, keepOut) {
    const clear = (x, y) => {
      if (!inb(x, y)) return false;
      if (y >= ROAD_ROW - 2) return false;                          // room to work by the road
      if (Math.abs(x - CAMP.x) < 8 && y > ROWS - 10) return false;  // room to build round the camp
      if (keepOut && x >= keepOut.x && x < keepOut.x + keepOut.w && y >= keepOut.y && y < keepOut.y + keepOut.h) return false;
      return kind[idx(x, y)] === 'g';
    };
    // a pond, somewhere in the top half and never against the road
    const px = 5 + Math.floor(Math.random() * (COLS - 12));
    const py = 3 + Math.floor(Math.random() * 6);
    const rx = 2.6 + Math.random() * 1.8, ry = 1.8 + Math.random() * 1.2;
    for (let y = Math.floor(py - ry - 1); y <= py + ry + 1; y++) {
      for (let x = Math.floor(px - rx - 1); x <= px + rx + 1; x++) {
        const d = ((x - px) / rx) ** 2 + ((y - py) / ry) ** 2;
        if (d < 0.85 + Math.random() * 0.3 && clear(x, y)) kind[idx(x, y)] = 'w';
      }
    }
    // copses
    for (let i = 0; i < 14; i++) {
      const cx = Math.floor(Math.random() * COLS), cy = Math.floor(Math.random() * (ROWS - 3));
      const n = 2 + Math.floor(Math.random() * 5);
      for (let j = 0; j < n; j++) {
        const x = cx + Math.round((Math.random() - 0.5) * 5), y = cy + Math.round((Math.random() - 0.5) * 4);
        if (clear(x, y)) kind[idx(x, y)] = 't';
      }
    }
    // loose stones
    for (let i = 0; i < 12; i++) {
      const x = Math.floor(Math.random() * COLS), y = Math.floor(Math.random() * (ROWS - 3));
      if (clear(x, y)) kind[idx(x, y)] = 's';
    }
  }

  function blankMap() {
    const kind = new Array(COLS * ROWS).fill('g');
    return kind;
  }
  function stampRoad(kind) {
    for (let x = 0; x < COLS; x++) kind[idx(x, ROAD_ROW)] = 'r';
    kind[idx(CAMP.x, CAMP.y)] = 'c';
  }

  function newState() {
    const kind = blankMap();
    generateScenery(kind, null);
    stampRoad(kind);
    const st = {
      day: 1, hour: WORK_START, coins: START_COINS, nextId: 1,
      kind, occ: new Array(COLS * ROWS).fill(0), plots: new Array(COLS * ROWS).fill(null),
      farms: [], buildings: [], villagers: [],
      store: {}, policy: {},
      log: [], won: false, earned: 0,
      eatenToday: 0, hungerWarned: false,
      weather: 'fair', notice: null,
    };
    for (const g of GOOD_ORDER) { st.store[g] = 0; st.policy[g] = false; }
    S = st;
    for (let i = 0; i < 3; i++) addVillager(CAMP.x + (i - 1) * 0.6, CAMP.y - 0.4 + (i % 2) * 0.5);
    log('Three villagers have pitched camp by the road. They will sleep rough until there is a house.');
    centreCamera(CAMP.x, CAMP.y);
    return st;
  }

  function addVillager(px, py) {
    const used = new Set(S.villagers.map(v => v.name));
    const free = NAMES.filter(n => !used.has(n));
    const v = {
      id: S.nextId++, name: free.length ? rnd(free) : 'Villager', shirt: rnd(SHIRTS),
      hair: rnd(HAIRS), hat: rnd(HATS),
      px, py, face: 1, energy: 80, hunger: 0, home: null, task: null, path: null, carry: null,
      sleeping: false, hidden: false, inBed: false, days: 0,
    };
    S.villagers.push(v);
    return v;
  }

  // Pick this morning's notice, run whatever it does to the numbers, and keep the offer (if it
  // has one) so the panel can put the question in front of the player.
  function rollNotice() {
    S.notice = null;
    const forced = NOTICES.find((n) => n.force && n.force(S));
    let chosen = forced;
    if (!chosen) {
      const pool = NOTICES.filter((n) => n.w > 0 && (!n.when || n.when()));
      let total = 0;
      for (const n of pool) total += n.w;
      let r = Math.random() * total;
      for (const n of pool) { r -= n.w; if (r <= 0) { chosen = n; break; } }
      if (!chosen) chosen = pool[pool.length - 1];
    }
    if (!chosen) return;
    S.notice = { id: chosen.id, text: chosen.text(), kind: chosen.kind || 'notice', offer: chosen.offer || null, taken: false };
  }
  function takeNotice() {
    const n = S.notice;
    if (!n || !n.offer || n.taken) return;
    if (n.offer.cost > S.coins) { log('Not enough coins for that.', 'warn'); return; }
    S.coins -= n.offer.cost;
    const def = NOTICES.find((x) => x.id === n.id);
    n.taken = true;
    log(def && def.accept ? def.accept() : 'Done.', 'good');
    UI.structure++;
    renderPanel();
  }

  function log(text, kind) {
    S.log.unshift({ day: S.day, text, kind: kind || '' });
    if (S.log.length > 30) S.log.length = 30;
    UI.structure++;
  }

  // ------------------------------------------------------------ save/load
  function save() {
    if (!S) return;
    const copy = {
      ...S,
      villagers: S.villagers.map(v => ({ ...v, task: null, path: null, carry: null, hidden: false })),
    };
    // Goods being carried go back into the storehouse so nothing is lost.
    for (const v of S.villagers) if (v.carry) copy.store[v.carry.good] += v.carry.n;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(copy)); } catch (e) { /* ignore */ }
  }

  // Fill in anything a state written by an older version has never heard of.
  function normalise() {
    if (typeof S.eatenToday !== 'number') S.eatenToday = 0;
    if (typeof S.hungerWarned !== 'boolean') S.hungerWarned = false;
    S.store = S.store || {}; S.policy = S.policy || {};
    for (const g of GOOD_ORDER) {
      if (typeof S.store[g] !== 'number') S.store[g] = 0;
      if (typeof S.policy[g] !== 'boolean') S.policy[g] = false;
    }
    if (!WEATHER.some((w) => w.id === S.weather)) S.weather = rollWeather(S.day);
    if (S.notice === undefined) S.notice = null;
    for (const b of S.buildings) {
      const def = BUILDINGS[b.type];
      if (!def) continue;
      if (def.craft) { if (typeof b.in !== 'number') b.in = typeof b.wheat === 'number' ? b.wheat : 0; delete b.wheat; if (typeof b.made !== 'number') b.made = b.baked || 0; delete b.baked; }
      if (def.pen) {
        if (typeof b.herd !== 'number') b.herd = 2;
        if (typeof b.feed !== 'number') b.feed = 0;
        if (typeof b.ready !== 'number') b.ready = 0;
        if (typeof b.prog !== 'number') b.prog = 0;
        if (typeof b.got !== 'number') b.got = 0;
      }
      if (b.type === 'house' && !Array.isArray(b.residents)) b.residents = [];
      if (b.type === 'shop') { if (typeof b.stock !== 'number') b.stock = 0; if (typeof b.sold !== 'number') b.sold = 0; }
    }
    for (const v of S.villagers) {
      v.task = null; v.path = null; v.carry = null; v.hidden = false; v.sleeping = false;
      if (!v.hair) v.hair = rnd(HAIRS);
      if (!v.hat) v.hat = rnd(HATS);
      if (!v.face) v.face = 1;
    }
  }

  // An old plot was 26x16 with the road along the bottom. Drop it into the middle of the new,
  // bigger one and grow some scenery around the outside of it.
  function migrateOld(o) {
    if (!o || !Array.isArray(o.kind) || o.kind.length !== OLD.COLS * OLD.ROWS) return null;
    const kind = blankMap();
    const occ = new Array(COLS * ROWS).fill(0);
    const plots = new Array(COLS * ROWS).fill(null);
    generateScenery(kind, { x: OLD.DX - 1, y: OLD.DY - 1, w: OLD.COLS + 2, h: OLD.ROWS + 2 });
    for (let y = 0; y < OLD.ROWS; y++) for (let x = 0; x < OLD.COLS; x++) {
      const ni = idx(x + OLD.DX, y + OLD.DY);
      kind[ni] = o.kind[y * OLD.COLS + x];
      occ[ni] = o.occ ? o.occ[y * OLD.COLS + x] : 0;
      plots[ni] = o.plots ? o.plots[y * OLD.COLS + x] : null;
    }
    stampRoad(kind);
    const st = { ...o, kind, occ, plots };
    for (const b of st.buildings || []) { b.x += OLD.DX; b.y += OLD.DY; }
    for (const f of st.farms || []) { f.x += OLD.DX; f.y += OLD.DY; }
    for (const v of st.villagers || []) { v.px += OLD.DX; v.py += OLD.DY; }
    return st;
  }

  function load() {
    let migrated = false;
    let st = null;
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        st = JSON.parse(raw);
        if (!st || !Array.isArray(st.kind) || st.kind.length !== COLS * ROWS) st = null;
      }
    } catch (e) { st = null; }
    if (!st) {
      try {
        const raw = localStorage.getItem(OLD_KEY);
        if (raw) { st = migrateOld(JSON.parse(raw)); migrated = !!st; }
      } catch (e) { st = null; }
    }
    if (!st) return false;
    S = st;
    normalise();
    centreCamera(CAMP.x, CAMP.y);
    if (migrated) {
      log('The plot turned out to run further back than anybody had walked. There is room now for a yard, and the surveyor has left a bill for nothing at all.', 'good');
      try { localStorage.removeItem(OLD_KEY); } catch (e) { /* ignore */ }
      save();
    }
    return true;
  }

  function wipe() {
    try { localStorage.removeItem(SAVE_KEY); localStorage.removeItem(OLD_KEY); } catch (e) { /* ignore */ }
  }

  // ------------------------------------------------------------ helpers
  const isDay = () => S.hour >= WORK_START && S.hour < WORK_END;
  const eff = (v) => (0.35 + 0.65 * v.energy / 100) * (1 - 0.2 * v.hunger);
  const tileOf = (v) => ({ x: clamp(Math.floor(v.px), 0, COLS - 1), y: clamp(Math.floor(v.py), 0, ROWS - 1) });
  const solid = (k) => k === 'w' || k === 't' || k === 's';
  const walkable = (x, y) => inb(x, y) && !S.occ[idx(x, y)] && !solid(S.kind[idx(x, y)]);
  function tileCost(x, y) {
    const k = S.kind[idx(x, y)];
    return (k === 'p' || k === 'r') ? 0.55 : k === 'f' ? 1.25 : 1;
  }
  const building = (id) => S.buildings.find(b => b.id === id) || null;
  const farmOf = (id) => S.farms.find(f => f.id === id) || null;
  const firstOf = (type) => S.buildings.find(b => b.type === type) || null;
  const freeBeds = () => S.buildings.filter(b => b.type === 'house').reduce((n, b) => n + (BUILDINGS.house.beds - b.residents.length), 0);
  const totalBeds = () => S.buildings.filter(b => b.type === 'house').length * BUILDINGS.house.beds;
  const shopStock = () => S.buildings.filter(b => b.type === 'shop').reduce((n, b) => n + b.stock, 0);

  function centreCamera(x, y) {
    UI.cam.x = clamp(x - VIEW_W / 2, 0, camMaxX());
    UI.cam.y = clamp(y - VIEW_H / 2, 0, camMaxY());
  }

  function entrances(b) {
    const goals = new Set();
    for (let x = b.x - 1; x <= b.x + b.w; x++) for (let y = b.y - 1; y <= b.y + b.h; y++) {
      const inside = x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h;
      const corner = (x < b.x || x >= b.x + b.w) && (y < b.y || y >= b.y + b.h);
      if (!inside && !corner && walkable(x, y)) goals.add(idx(x, y));
    }
    return goals;
  }
  function nearestWalkable(x, y) {
    for (let r = 0; r < COLS; r++) {
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (walkable(x + dx, y + dy)) return { x: x + dx, y: y + dy };
      }
    }
    return { x, y };
  }

  // ------------------------------------------------------------ pathfinding
  function findPath(sx, sy, goals) {
    if (!goals || goals.size === 0) return null;
    const start = idx(sx, sy);
    if (goals.has(start)) return [];
    const N = COLS * ROWS;
    const dist = new Float64Array(N).fill(Infinity);
    const prev = new Int32Array(N).fill(-1);
    dist[start] = 0;
    const heap = [];
    const push = (d, n) => {
      heap.push([d, n]);
      let i = heap.length - 1;
      while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1; let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]]; i = m;
        }
      }
      return top;
    };
    push(0, start);
    while (heap.length) {
      const [d, u] = pop();
      if (d > dist[u]) continue;
      if (goals.has(u)) {
        const out = [];
        for (let c = u; c !== start; c = prev[c]) out.push({ x: c % COLS, y: Math.floor(c / COLS) });
        return out.reverse();
      }
      const ux = u % COLS, uy = Math.floor(u / COLS);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = ux + dx, ny = uy + dy;
        if (!walkable(nx, ny)) continue;
        const n = idx(nx, ny), nd = d + tileCost(nx, ny);
        if (nd < dist[n]) { dist[n] = nd; prev[n] = u; push(nd, n); }
      }
    }
    return null;
  }

  function walk(v, dt) {
    let left = dt;
    while (left > 0 && v.path.length) {
      const n = v.path[0], tx = n.x + 0.5, ty = n.y + 0.5;
      const dx = tx - v.px, dy = ty - v.py, d = Math.hypot(dx, dy);
      const sp = BASE_SPEED * walkRate() * (0.6 + 0.4 * eff(v)) / tileCost(n.x, n.y);
      const step = sp * left;
      if (dx) v.face = dx < 0 ? -1 : 1;
      if (step >= d) { v.px = tx; v.py = ty; v.path.shift(); left -= d / sp; }
      else { v.px += dx / d * step; v.py += dy / d * step; left = 0; }
    }
    v.walking = v.path.length > 0;
    return v.path.length === 0;
  }

  function moveStep(v, goals, dt) {
    if (!v.path) {
      const t = tileOf(v);
      const p = findPath(t.x, t.y, goals);
      if (!p) return 'blocked';
      v.path = p;
    }
    return walk(v, dt) ? 'arrived' : 'moving';
  }

  // ------------------------------------------------------------ tasks
  function claim(key, v) { CLAIMS[key] = v.id; }
  const claimed = (key) => CLAIMS[key] !== undefined;
  function release(task) { for (const k of task.keys || []) delete CLAIMS[k]; }
  function cancelTask(v) { if (v.task) release(v.task); v.task = null; v.path = null; v.working = false; }
  function startTask(v, task) { v.task = task; task.phase = 0; v.path = null; for (const k of task.keys || []) claim(k, v); }

  function cheapestFood() {
    let best = null;
    for (const g of GOOD_ORDER) {
      if (!GOODS[g].food || S.store[g] <= 0) continue;
      if (!best || GOODS[g].price < GOODS[best].price) best = g;
    }
    return best;
  }
  // What a pen will eat today. Animals never get the last of the food: if the feed is
  // something people eat, there has to be a comfortable surplus before it goes in a trough.
  function penFeed(def) {
    const spare = S.villagers.length + 4;
    let best = null;
    for (const g of def.pen.feed) {
      const have = S.store[g] || 0;
      if (have <= 0) continue;
      if (GOODS[g].food && have < spare) continue;
      if (!best || GOODS[g].price < GOODS[best].price) best = g;
    }
    return best;
  }

  function pickTask(v) {
    const store = firstOf('store');
    const t = tileOf(v);
    const cands = [];
    const d = (x, y) => Math.abs(x - t.x) + Math.abs(y - t.y);
    for (const f of S.farms) {
      if (!f.crop) continue;
      for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) {
        const i = idx(x, y), p = S.plots[i];
        if (!p || claimed('plot:' + i)) continue;
        if (p.stage === 2 && store) cands.push({ score: d(x, y), task: { kind: 'harvest', plot: i, farm: f.id, keys: ['plot:' + i] } });
        else if (p.stage === 0) cands.push({ score: d(x, y) + 14, task: { kind: 'sow', plot: i, farm: f.id, keys: ['plot:' + i] } });
      }
    }
    if (store) {
      for (const b of S.buildings) {
        const def = BUILDINGS[b.type];
        if (def.craft) {
          const cr = def.craft;
          if (!claimed('haul:' + b.id) && b.in <= CRAFT_CAP - cr.need * 2 && S.store[cr.from] >= cr.need) {
            const n = Math.min(CARRY_CAP, CRAFT_CAP - b.in, S.store[cr.from]);
            cands.push({ score: d(store.x, store.y) + 8, task: { kind: 'haul', good: cr.from, n, to: b.id, keys: ['haul:' + b.id] } });
          }
          if (!claimed('craft:' + b.id) && b.in >= cr.need) {
            cands.push({ score: d(b.x, b.y) + 4, task: { kind: 'craft', to: b.id, keys: ['craft:' + b.id] } });
          }
        } else if (def.pen) {
          if (!claimed('haul:' + b.id) && b.herd > 0 && b.feed <= PEN_FEED_CAP - 4) {
            const good = penFeed(def);
            if (good) {
              const n = Math.min(CARRY_CAP, PEN_FEED_CAP - b.feed, S.store[good]);
              const starving = b.feed <= 0;
              if (n > 0) cands.push({ score: d(store.x, store.y) + (starving ? -4 : 7), task: { kind: 'haul', good, n, to: b.id, keys: ['haul:' + b.id] } });
            }
          }
          if (!claimed('collect:' + b.id) && b.ready >= 3) {
            cands.push({ score: d(b.x, b.y) + 2, task: { kind: 'collect', to: b.id, keys: ['collect:' + b.id] } });
          }
        } else if (b.type === 'shop') {
          // Nothing arrives at the shop by itself: someone has to walk it over.
          if (!claimed('stock:' + b.id) && b.stock < SHOP_CAP) {
            const good = cheapestFood();
            const n = good ? Math.min(CARRY_CAP, SHOP_CAP - b.stock, S.store[good]) : 0;
            const short = b.stock < S.villagers.length;   // not enough for tonight's supper
            if (n > 0 && (short || n >= 3)) {               // otherwise it is not worth the walk
              cands.push({ score: d(store.x, store.y) + (short ? -6 : 6), task: { kind: 'haul', good, n, to: b.id, keys: ['stock:' + b.id] } });
            }
          }
        }
      }
    }
    if (!cands.length) return null;
    cands.sort((a, b) => a.score - b.score);
    return cands[0].task;
  }

  function addCarry(v, good, n) {
    if (v.carry && v.carry.good === good) v.carry.n += n;
    else v.carry = { good, n };
  }
  function deposit(v) {
    if (!v.carry) return;
    S.store[v.carry.good] += v.carry.n;
    v.carry = null;
  }

  function runTask(v, dt) {
    const t = v.task;
    const store = firstOf('store');
    v.working = false;
    switch (t.kind) {
      case 'sow': {
        const p = S.plots[t.plot], f = farmOf(t.farm);
        if (!p || !f || !f.crop || p.stage !== 0) return cancelTask(v);
        if (t.phase === 0) {
          const r = moveStep(v, new Set([t.plot]), dt);
          if (r === 'blocked') return cancelTask(v);
          if (r === 'arrived') { t.phase = 1; t.timer = 1.4 / eff(v); }
        } else {
          v.working = true;
          t.timer -= dt;
          if (t.timer <= 0) { p.stage = 1; p.growth = 0; p.crop = f.crop; cancelTask(v); }
        }
        break;
      }
      case 'harvest': {
        if (t.phase === 0) {
          const p = S.plots[t.plot];
          if (!p || p.stage !== 2) { t.phase = 2; v.path = null; break; }
          const r = moveStep(v, new Set([t.plot]), dt);
          if (r === 'blocked') { t.phase = 2; v.path = null; break; }
          if (r === 'arrived') { t.phase = 1; t.timer = 1.8 / eff(v); }
        } else if (t.phase === 1) {
          v.working = true;
          t.timer -= dt;
          if (t.timer <= 0) {
            const p = S.plots[t.plot];
            if (p && p.stage === 2) {
              let n = CROPS[p.crop].yield;
              // A villager who missed supper eats in the field. Nobody starves here;
              // the cost of a hungry village is a harvest that never reaches the store.
              if (v.hunger > 0 && CROPS[p.crop].food && n > 0) {
                n--; v.hunger--; S.eatenToday++;
                float(t.plot % COLS + 0.5, Math.floor(t.plot / COLS), '-1', '#e9c46a');
              }
              if (n > 0) addCarry(v, p.crop, n);
              p.stage = 0; p.growth = 0;
            }
            delete CLAIMS['plot:' + t.plot];
            t.keys = [];
            const next = nextRipe(v, t.farm);
            const room = !v.carry || v.carry.n + CROPS[v.carry.good].yield <= CARRY_CAP;
            if (next !== null && room) {
              t.plot = next; t.keys = ['plot:' + next]; claim('plot:' + next, v); t.phase = 0; v.path = null;
            } else { t.phase = 2; v.path = null; }
          }
        } else {
          if (!v.carry) return cancelTask(v);
          if (!store) { v.carry = null; return cancelTask(v); }
          const r = moveStep(v, entrances(store), dt);
          if (r === 'blocked') return cancelTask(v);
          if (r === 'arrived') { deposit(v); cancelTask(v); }
        }
        break;
      }
      case 'haul': {
        const b = building(t.to);
        if (t.phase === 0) {
          if (!store || !b) return cancelTask(v);
          const r = moveStep(v, entrances(store), dt);
          if (r === 'blocked') return cancelTask(v);
          if (r === 'arrived') {
            const take = Math.min(t.n, S.store[t.good]);
            if (take <= 0) return cancelTask(v);
            S.store[t.good] -= take; v.carry = { good: t.good, n: take };
            t.phase = 1; v.path = null;
          }
        } else if (t.phase === 1) {
          if (!b) { t.phase = 2; v.path = null; break; }
          const r = moveStep(v, entrances(b), dt);
          if (r === 'blocked') { t.phase = 2; v.path = null; break; }
          if (r === 'arrived') {
            const def = BUILDINGS[b.type];
            if (def.craft) b.in += v.carry.n;
            else if (def.pen) { b.feed += v.carry.n; float(b.x + b.w / 2, b.y, '+' + v.carry.n, '#d9b64a'); }
            else if (b.type === 'shop') { b.stock += v.carry.n; float(b.x + b.w / 2, b.y, '+' + v.carry.n, '#7fc28a'); }
            v.carry = null;
            cancelTask(v);
          }
        } else {
          if (!store || !v.carry) { v.carry = null; return cancelTask(v); }
          const r = moveStep(v, entrances(store), dt);
          if (r === 'blocked') { v.carry = null; return cancelTask(v); }
          if (r === 'arrived') { deposit(v); cancelTask(v); }
        }
        break;
      }
      case 'craft': {
        const b = building(t.to);
        const cr = b ? BUILDINGS[b.type].craft : null;
        if (t.phase === 0) {
          if (!b || b.in < cr.need) return cancelTask(v);
          const r = moveStep(v, entrances(b), dt);
          if (r === 'blocked') return cancelTask(v);
          if (r === 'arrived') { t.phase = 1; t.timer = cr.time / eff(v); }
        } else if (t.phase === 1) {
          if (!b) { t.phase = 2; v.path = null; break; }
          v.working = true;
          t.timer -= dt;
          if (t.timer <= 0) {
            if (b.in >= cr.need) { b.in -= cr.need; addCarry(v, cr.to, cr.make); b.made = (b.made || 0) + cr.make; }
            if (b.in >= cr.need && v.carry.n + cr.make <= CARRY_CAP && isDay()) t.timer = cr.time / eff(v);
            else { t.phase = 2; v.path = null; }
          }
        } else {
          if (!v.carry) return cancelTask(v);
          if (!store) { v.carry = null; return cancelTask(v); }
          const r = moveStep(v, entrances(store), dt);
          if (r === 'blocked') { v.carry = null; return cancelTask(v); }
          if (r === 'arrived') { deposit(v); cancelTask(v); }
        }
        break;
      }
      case 'collect': {
        const b = building(t.to);
        const pen = b ? BUILDINGS[b.type].pen : null;
        if (t.phase === 0) {
          if (!b || b.ready <= 0) return cancelTask(v);
          const r = moveStep(v, entrances(b), dt);
          if (r === 'blocked') return cancelTask(v);
          if (r === 'arrived') { t.phase = 1; t.timer = 1.6 / eff(v); }
        } else if (t.phase === 1) {
          if (!b) { t.phase = 2; v.path = null; break; }
          v.working = true;
          t.timer -= dt;
          if (t.timer <= 0) {
            const n = Math.min(CARRY_CAP, b.ready);
            if (n > 0) { b.ready -= n; b.got = (b.got || 0) + n; addCarry(v, pen.produce, n); float(b.x + b.w / 2, b.y, '+' + n, GOODS[pen.produce].color); }
            t.phase = 2; v.path = null;
          }
        } else {
          if (!v.carry) return cancelTask(v);
          if (!store) { v.carry = null; return cancelTask(v); }
          const r = moveStep(v, entrances(store), dt);
          if (r === 'blocked') { v.carry = null; return cancelTask(v); }
          if (r === 'arrived') { deposit(v); cancelTask(v); }
        }
        break;
      }
      case 'sleep': {
        const home = v.home ? building(v.home) : null;
        const goals = home ? entrances(home) : new Set([idx(CAMP.x, CAMP.y)]);
        const r = moveStep(v, goals, dt);
        if (r !== 'moving') {
          v.sleeping = true; v.inBed = !!home && r === 'arrived'; v.hidden = v.inBed;
          cancelTask(v);
        }
        break;
      }
      default: cancelTask(v);
    }
  }

  function nextRipe(v, farmId) {
    const f = farmOf(farmId);
    if (!f) return null;
    const t = tileOf(v);
    let best = null, bd = Infinity;
    for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) {
      const i = idx(x, y), p = S.plots[i];
      if (!p || p.stage !== 2 || claimed('plot:' + i)) continue;
      const d = Math.abs(x - t.x) + Math.abs(y - t.y);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  function taskLabel(v) {
    if (v.sleeping) return v.inBed ? 'Asleep at home' : 'Sleeping rough by the fire';
    const t = v.task;
    if (!t) return isDay() ? 'Looking for something to do' : 'Heading to bed';
    const f = t.farm ? farmOf(t.farm) : null;
    const cropName = f && f.crop ? CROPS[f.crop].name.toLowerCase() : 'crops';
    const carried = () => v.carry ? `${v.carry.n} ${GOODS[v.carry.good].name.toLowerCase()}` : 'the load';
    switch (t.kind) {
      case 'sow': return t.phase ? `Sowing ${cropName}` : `Walking to the farm to sow ${cropName}`;
      case 'harvest': return t.phase === 2 ? `Carrying ${carried()} to the storehouse` : t.phase ? `Harvesting ${cropName}` : 'Walking to the farm to harvest';
      case 'haul': {
        const b = building(t.to);
        const dest = b ? BUILDINGS[b.type].name.toLowerCase() : 'somewhere';
        return t.phase === 0 ? `Fetching ${GOODS[t.good].name.toLowerCase()} for the ${dest}` : `Carrying ${GOODS[t.good].name.toLowerCase()} to the ${dest}`;
      }
      case 'craft': {
        const b = building(t.to);
        const cr = b ? BUILDINGS[b.type].craft : null;
        return t.phase === 2 ? `Carrying ${carried()} to the storehouse` : t.phase ? (cr ? cr.verb : 'Working') : `Walking to the ${b ? BUILDINGS[b.type].name.toLowerCase() : 'workshop'}`;
      }
      case 'collect': {
        const b = building(t.to);
        const pen = b ? BUILDINGS[b.type].pen : null;
        const what = pen ? GOODS[pen.produce].name.toLowerCase() : 'the yard';
        return t.phase === 2 ? `Carrying ${carried()} to the storehouse` : t.phase ? `Collecting the ${what}` : `Walking to the ${b ? BUILDINGS[b.type].name.toLowerCase() : 'pen'}`;
      }
      case 'sleep': return 'Heading to bed';
    }
    return '';
  }

  // ------------------------------------------------------------ simulation
  function tick(dt) {
    const wasDay = isDay();
    const spd = 1 / (wasDay ? SEC_PER_HOUR_DAY : SEC_PER_HOUR_NIGHT);
    const dh = dt * spd;
    const prev = S.hour;
    S.hour += dh;
    if (prev < WORK_END && S.hour >= WORK_END) evening();
    let wrapped = false;
    if (S.hour >= 24) { S.hour -= 24; wrapped = true; }
    if ((prev < WORK_START || wrapped) && S.hour >= WORK_START) morning();

    for (const p of S.plots) {
      // A hardy crop shrugs off the worst of the weather but not the season.
      if (p && p.stage === 1) {
        const k = CROPS[p.crop];
        const rate = seasonOf(S.day).grow * (k.hardy ? Math.max(weatherOf().grow, 0.55) : weatherOf().grow);
        p.growth += dh * rate / k.grow;
        if (p.growth >= 1) { p.growth = 1; p.stage = 2; }
      }
    }
    tickPens(dh);
    for (const v of S.villagers) updateVillager(v, dt);
    moveHerds(dt);
  }

  // Animals work round the clock, which is most of their charm. A pen with nothing in the
  // trough simply stops; nothing on this plot ever starves.
  function tickPens(dh) {
    for (const b of S.buildings) {
      const def = BUILDINGS[b.type];
      if (!def.pen) continue;
      const p = def.pen;
      b.state = '';
      if (b.herd <= 0) { b.state = 'empty'; continue; }
      if (b.ready >= PEN_READY_CAP) { b.state = 'full'; continue; }
      const grazing = p.graze && seasonOf(S.day).grow >= 0.7;
      const fed = b.feed >= p.feedPer;
      if (!fed && !grazing) { b.state = 'hungry'; continue; }
      if (!fed && grazing) b.state = 'grazing';
      b.prog += (dh / 24) * b.herd * p.rate * (fed ? 1 : 0.5);
      let guard = 0;
      while (b.prog >= 1 && guard++ < 40) {
        b.prog -= 1;
        if (b.feed >= p.feedPer) { b.feed -= p.feedPer; b.ready += p.yieldPer; b.made = (b.made || 0) + p.yieldPer; }
        else if (grazing) { b.ready += 1; b.made = (b.made || 0) + 1; }
        else { b.prog = 0; break; }
        if (b.ready >= PEN_READY_CAP) { b.ready = PEN_READY_CAP; b.prog = 0; break; }
      }
    }
  }

  // Cosmetic only: the animals mill about inside their own fence.
  function penYard(b) {
    const sw = b.w >= 4 ? 2 : 1.4;
    return { x0: b.x + sw + 0.3, y0: b.y + 0.4, x1: b.x + b.w - 0.35, y1: b.y + b.h - 0.3 };
  }
  function herdOf(b) {
    let a = HERDS[b.id];
    if (!a) a = HERDS[b.id] = [];
    const y = penYard(b);
    while (a.length < b.herd) a.push({ x: y.x0 + Math.random() * (y.x1 - y.x0), y: y.y0 + Math.random() * (y.y1 - y.y0), tx: 0, ty: 0, wait: Math.random() * 3, face: 1, phase: Math.random() * 6 });
    while (a.length > b.herd) a.pop();
    return a;
  }
  function moveHerds(dt) {
    for (const b of S.buildings) {
      if (!BUILDINGS[b.type].pen) continue;
      const yard = penYard(b);
      const speed = b.type === 'coop' ? 0.55 : b.type === 'byre' ? 0.22 : 0.3;
      for (const a of herdOf(b)) {
        if (a.wait > 0) { a.wait -= dt; continue; }
        if (!a.tx) { a.tx = yard.x0 + Math.random() * (yard.x1 - yard.x0); a.ty = yard.y0 + Math.random() * (yard.y1 - yard.y0); }
        const dx = a.tx - a.x, dy = a.ty - a.y, d = Math.hypot(dx, dy);
        if (d < 0.06) { a.tx = 0; a.wait = 1 + Math.random() * 4; continue; }
        if (dx) a.face = dx < 0 ? -1 : 1;
        const s = Math.min(d, speed * dt);
        a.x += dx / d * s; a.y += dy / d * s;
      }
    }
  }

  function updateVillager(v, dt) {
    const day = isDay();
    if (v.sleeping) {
      if (!day) return;
      v.sleeping = false; v.hidden = false; v.inBed = false;   // safety net; morning() normally does this
    }
    if (!day) {
      if (v.task && v.task.kind !== 'sleep' && !v.carry) cancelTask(v);
      if (!v.task) startTask(v, { kind: 'sleep', keys: [] });
    } else if (!v.task) {
      const t = pickTask(v);
      if (t) startTask(v, t);
      else v.walking = false;
    }
    if (v.task) {
      runTask(v, dt);
      if (day) v.energy = Math.max(0, v.energy - 1.15 * dt);
    }
  }

  function evening() {
    // Supper from the shop, one unit each, paid for.
    const shops = S.buildings.filter(b => b.type === 'shop');
    const sales = new Map();
    let fed = 0, unfed = 0;
    for (const v of S.villagers) {
      const shop = shops.find(b => b.stock > 0);
      if (shop) {
        shop.stock--; shop.sold = (shop.sold || 0) + 1; S.coins += SUPPER_PRICE; S.earned += SUPPER_PRICE; v.hunger = 0; fed++;
        sales.set(shop, (sales.get(shop) || 0) + 1);
      } else { v.hunger = Math.min(3, v.hunger + 1); unfed++; }
    }
    for (const [shop, n] of sales) float(shop.x + shop.w / 2, shop.y, `+${n * SUPPER_PRICE}c`, '#e0a458');
    if (unfed) {
      log(shops.length ? `${plural(unfed, 'villager')} went without supper. The shop had nothing left.` : `${plural(unfed, 'villager')} went without supper. There is no shop.`, 'bad');
      if (!S.hungerWarned) {
        S.hungerWarned = true;
        log('Nobody starves in Furrow. A hungry villager just works slowly and eats what they pick, so the harvest never reaches the storehouse.', 'warn');
      }
    } else if (fed) log(`Everyone bought supper at the shop (+${fed * SUPPER_PRICE} coins).`, 'good');
    // Auto-sell.
    for (const g of GOOD_ORDER) {
      if (S.policy[g] && S.store[g] > 0) {
        const n = S.store[g], c = n * GOODS[g].price;
        S.store[g] = 0; S.coins += c; S.earned += c;
        log(`The cart took ${n} ${GOODS[g].name.toLowerCase()} for ${c} coins.`, 'good');
      }
    }
    save();
  }

  function morning() {
    S.day++;
    S.weather = rollWeather(S.day);
    rollNotice();
    if (S.eatenToday) {
      log(`Hungry villagers ate ${S.eatenToday} of yesterday's harvest in the field rather than wait for supper.`, 'warn');
      S.eatenToday = 0;
    }
    let rough = 0;
    for (const v of S.villagers) {
      // A bed restores most of the night's rest; anyone else (by the fire, or
      // still trudging home at dawn) gets a poor night's worth.
      v.energy = Math.min(100, v.energy + (v.inBed ? 75 : 30));
      if (!v.inBed) rough++;
      if (v.task && v.task.kind === 'sleep') cancelTask(v);
      v.sleeping = false; v.hidden = false; v.days++;
      if (v.inBed) { const h = building(v.home); if (h) { const g = nearestWalkable(h.x, h.y + h.h); v.px = g.x + 0.5; v.py = g.y + 0.5; } }
      v.inBed = false;
    }
    if (rough) log(`${plural(rough, 'villager')} slept rough. They will be slow today.`, 'warn');
    // A well-fed pen fills up on its own, slowly.
    for (const b of S.buildings) {
      const def = BUILDINGS[b.type];
      if (!def.pen || b.herd <= 0 || b.herd >= def.pen.cap) continue;
      if (b.feed >= b.herd && Math.random() < 0.4) {
        b.herd++;
        log(`There is one more ${STOCK[def.pen.animal].name.toLowerCase()} in the ${def.name.toLowerCase()} than there was last night.`, 'good');
      }
    }
    if (S.notice) log(S.notice.text, S.notice.kind || 'notice');
    assignHomes();
    const shopFood = shopStock();
    if (S.villagers.length < MAX_POP && freeBeds() > 0 && shopFood >= S.villagers.length && Math.random() < 0.65) {
      const v = addVillager(CAMP.x + 0.5, ROAD_ROW + 0.5);
      log(`${v.name} walked in along the road looking for work. There was a bed, and food in the shop.`, 'good');
      assignHomes();
    } else if (S.villagers.length < MAX_POP && S.day % 3 === 0) {
      if (freeBeds() <= 0) log('Nobody new will settle here without a spare bed.');
      else if (shopFood < S.villagers.length) log('Nobody new will settle here while the shop is bare.');
    }
    if (!S.won && S.coins >= GOAL) { S.won = true; showWin(); }
    groundDirty = true;   // the season may have turned overnight
    save();
  }

  function assignHomes() {
    for (const v of S.villagers) {
      if (v.home && !building(v.home)) v.home = null;
      if (v.home) continue;
      const h = S.buildings.find(b => b.type === 'house' && b.residents.length < BUILDINGS.house.beds);
      if (h) { h.residents.push(v.id); v.home = h.id; }
    }
  }

  // ------------------------------------------------------------ building
  function rectFree(x, y, w, h, ignore) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
      if (!inb(i, j) || S.kind[idx(i, j)] !== 'g') return false;
      const o = S.occ[idx(i, j)];
      if (o && o !== ignore) return false;
    }
    return true;
  }
  function spend(n) {
    if (S.coins < n) { setHint(`That costs ${n} coins and you have ${S.coins}.`, true); return false; }
    S.coins -= n; return true;
  }
  function shoveVillagers() {
    for (const v of S.villagers) {
      const t = tileOf(v);
      if (!walkable(t.x, t.y)) { const g = nearestWalkable(t.x, t.y); v.px = g.x + 0.5; v.py = g.y + 0.5; }
      v.path = null;
    }
  }

  function placeBuilding(type, x, y) {
    const def = BUILDINGS[type];
    if (!rectFree(x, y, def.w, def.h)) { setHint('That needs clear grass — no trees, no water, nothing already standing there.', true); return false; }
    if (!spend(def.cost)) return false;
    const b = { id: S.nextId++, type, x, y, w: def.w, h: def.h };
    if (type === 'house') b.residents = [];
    if (def.craft) { b.in = 0; b.made = 0; }
    if (def.pen) { b.herd = 2; b.feed = 0; b.ready = 0; b.prog = 0; b.got = 0; b.state = ''; }
    if (type === 'shop') { b.stock = 0; b.sold = 0; }
    S.buildings.push(b);
    for (let j = y; j < y + def.h; j++) for (let i = x; i < x + def.w; i++) S.occ[idx(i, j)] = b.id;
    shoveVillagers();
    if (type === 'house') { assignHomes(); log(`A house went up. ${freeBeds() ? plural(freeBeds(), 'bed') + ' free.' : 'Every bed is taken.'}`); }
    else if (type === 'store') log('The storehouse is up. Harvests can be brought in now.');
    else if (type === 'shop') log('The shop is open. Food will be carried over from the storehouse.');
    else if (def.craft) log(`The ${def.name.toLowerCase()} is built. It will take ${GOODS[def.craft.from].name.toLowerCase()} from the storehouse.`);
    else if (def.pen) log(`The ${def.name.toLowerCase()} is up, with ${many(2, def.pen.animal)} in it looking around.`);
    UI.sel = { kind: 'building', id: b.id };
    UI.structure++; groundDirty = true;
    return true;
  }

  function moveBuilding(id, x, y) {
    const b = building(id);
    if (!b) { setTool('select'); return false; }
    const def = BUILDINGS[b.type];
    if (x === b.x && y === b.y) { setHint('It is already standing there.'); return false; }
    if (!rectFree(x, y, def.w, def.h, b.id)) { setHint(`The ${def.name.toLowerCase()} needs clear grass to stand on.`, true); return false; }
    const fee = moveFee(b.type);
    if (!spend(fee)) return false;
    for (let j = b.y; j < b.y + b.h; j++) for (let i = b.x; i < b.x + b.w; i++) S.occ[idx(i, j)] = 0;
    b.x = x; b.y = y;
    for (let j = y; j < y + def.h; j++) for (let i = x; i < x + def.w; i++) S.occ[idx(i, j)] = b.id;
    delete HERDS[b.id];
    shoveVillagers();
    log(`The ${def.name.toLowerCase()} was jacked up and rolled to a new spot for ${fee} coins.`);
    UI.sel = { kind: 'building', id: b.id };
    UI.structure++; groundDirty = true;
    setTool('select');
    return true;
  }

  function placeFarm(x0, y0, x1, y1) {
    const x = Math.min(x0, x1), y = Math.min(y0, y1), w = Math.abs(x1 - x0) + 1, h = Math.abs(y1 - y0) + 1;
    if (!rectFree(x, y, w, h)) { setHint('Farms need clear grass. Clear the trees first.', true); return false; }
    if (!spend(w * h * FARM_COST)) return false;
    const f = { id: S.nextId++, x, y, w, h, crop: 'carrot' };
    S.farms.push(f);
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) { S.kind[idx(i, j)] = 'f'; S.plots[idx(i, j)] = { farm: f.id, stage: 0, growth: 0, crop: null }; }
    UI.sel = { kind: 'farm', id: f.id };
    UI.structure++; groundDirty = true;
    setHint('Pick a crop for the farm in the panel on the right.');
    return true;
  }

  function pathTiles(x0, y0, x1, y1) {
    const out = [];
    const sx = Math.sign(x1 - x0), sy = Math.sign(y1 - y0);
    for (let x = x0; x !== x1 + sx; x += sx || 1) { out.push({ x, y: y0 }); if (!sx) break; }
    for (let y = y0 + (sy || 1); sy && y !== y1 + sy; y += sy) out.push({ x: x1, y });
    return out.filter(t => inb(t.x, t.y));
  }
  function placePath(x0, y0, x1, y1) {
    const tiles = pathTiles(x0, y0, x1, y1).filter(t => S.kind[idx(t.x, t.y)] === 'g' && !S.occ[idx(t.x, t.y)]);
    if (!tiles.length) return false;
    if (!spend(tiles.length * PATH_COST)) return false;
    for (const t of tiles) S.kind[idx(t.x, t.y)] = 'p';
    for (const v of S.villagers) v.path = null;
    UI.structure++; groundDirty = true;
    return true;
  }

  function demolishAt(x, y) {
    const i = idx(x, y);
    const bid = S.occ[i];
    if (bid) {
      const b = building(bid);
      const def = BUILDINGS[b.type];
      S.buildings = S.buildings.filter(o => o.id !== bid);
      for (let j = b.y; j < b.y + b.h; j++) for (let k = b.x; k < b.x + b.w; k++) S.occ[idx(k, j)] = 0;
      if (b.type === 'house') for (const v of S.villagers) if (v.home === bid) v.home = null;
      if (def.craft && b.in) S.store[def.craft.from] += b.in;
      if (def.pen) {
        if (b.ready) S.store[def.pen.produce] += b.ready;
        if (b.feed) log('What was left in the trough went back to the storehouse, more or less.');
        const back = Math.floor(b.herd * STOCK[def.pen.animal].price / 2);
        if (back) { S.coins += back; log(`${many(b.herd, def.pen.animal)} sold on for ${back} coins.`); }
        delete HERDS[bid];
      }
      if (b.type === 'store') for (const g of GOOD_ORDER) S.store[g] = 0;
      S.coins += Math.floor(def.cost / 2);
      for (const v of S.villagers) { if (v.task && v.task.kind !== 'sleep') cancelTask(v); v.path = null; }
      log(`The ${def.name.toLowerCase()} was pulled down.`);
      UI.sel = null; UI.structure++; groundDirty = true;
      return true;
    }
    const k = S.kind[i];
    if (k === 'f') {
      const f = farmOf(S.plots[i].farm);
      S.farms = S.farms.filter(o => o.id !== f.id);
      for (let j = f.y; j < f.y + f.h; j++) for (let x2 = f.x; x2 < f.x + f.w; x2++) { S.kind[idx(x2, j)] = 'g'; S.plots[idx(x2, j)] = null; }
      S.coins += Math.floor(f.w * f.h * FARM_COST / 2);
      for (const v of S.villagers) if (v.task && (v.task.kind === 'sow' || (v.task.kind === 'harvest' && v.task.phase < 2))) cancelTask(v);
      UI.sel = null; UI.structure++; groundDirty = true;
      return true;
    }
    if (k === 'p') {
      S.kind[i] = 'g';
      for (const v of S.villagers) v.path = null;
      UI.structure++; groundDirty = true;
      return true;
    }
    if (k === 't') {
      S.kind[i] = 'g'; S.coins += 3;
      for (const v of S.villagers) v.path = null;
      setHint('Down it comes. Three coins for the timber.');
      UI.structure++; groundDirty = true;
      return true;
    }
    if (k === 's') {
      S.kind[i] = 'g'; S.coins += 2;
      for (const v of S.villagers) v.path = null;
      setHint('Rolled off the field. Two coins for the stone.');
      UI.structure++; groundDirty = true;
      return true;
    }
    if (k === 'w') { setHint('The pond stays where it is.', true); return true; }
    return false;
  }

  function sell(good, n) {
    const take = n === 'all' ? S.store[good] : Math.min(n, S.store[good]);
    if (take <= 0) return;
    const c = take * GOODS[good].price;
    S.store[good] -= take; S.coins += c; S.earned += c;
    log(`Sold ${take} ${GOODS[good].name.toLowerCase()} for ${c} coins.`, 'good');
    if (!S.won && S.coins >= GOAL) { S.won = true; showWin(); }
  }

  function buyAnimal(b) {
    const def = BUILDINGS[b.type];
    const a = def.pen.animal;
    if (b.herd >= def.pen.cap) { setHint(`The ${def.name.toLowerCase()} is full.`, true); return; }
    if (!spend(STOCK[a].price)) return;
    b.herd++;
    log(`A ${STOCK[a].name.toLowerCase()} was bought off the road for ${STOCK[a].price} coins.`);
    UI.structure++;
  }
  function sellAnimal(b) {
    const def = BUILDINGS[b.type];
    const a = def.pen.animal;
    if (b.herd <= 0) return;
    b.herd--;
    const c = Math.floor(STOCK[a].price / 2);
    S.coins += c; S.earned += c;
    log(`A ${STOCK[a].name.toLowerCase()} went off down the road with a drover. ${c} coins.`);
    UI.structure++;
  }

  // ------------------------------------------------------------ drawing
  const canvas = document.getElementById('map');
  canvas.width = VIEW_W * TILE; canvas.height = VIEW_H * TILE;
  const ctx = canvas.getContext('2d');
  const ground = document.createElement('canvas');
  ground.width = COLS * TILE; ground.height = ROWS * TILE;
  const gctx = ground.getContext('2d');
  let groundDirty = true, groundKey = '';
  let clockT = 0;
  const TREES = [], WATER = [];
  const FLOATS = [];
  const FLOAT_LIFE = 1.6;
  function float(x, y, text, color) { FLOATS.push({ x, y, text, color, born: clockT }); }
  function drawFloats(c) {
    c.font = 'bold 11px ui-sans-serif, system-ui, sans-serif'; c.textAlign = 'center';
    for (let i = FLOATS.length - 1; i >= 0; i--) {
      const f = FLOATS[i], age = (clockT - f.born) / FLOAT_LIFE;
      if (age >= 1 || age < 0) { FLOATS.splice(i, 1); continue; }
      const x = f.x * TILE, y = f.y * TILE - 6 - age * 18;
      c.globalAlpha = 1 - age * age;
      c.strokeStyle = 'rgba(0,0,0,0.7)'; c.lineWidth = 3; c.strokeText(f.text, x, y);
      c.fillStyle = f.color; c.fillText(f.text, x, y);
      c.globalAlpha = 1;
    }
    c.textAlign = 'left';
  }

  // Fixed per-tile noise so tufts, stones and trees do not flicker.
  const NOISE = [];
  {
    let seed = 1234;
    const r = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let i = 0; i < COLS * ROWS; i++) NOISE.push([r(), r(), r(), r(), r(), r(), r(), r()]);
  }

  const shade = (hex, amt) => {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => clamp(Math.round(v + amt * 255), 0, 255);
    return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
  };

  // The ground is painted in three passes so that nothing lines up with the tile grid:
  // a flat base, then soft patches of a second green that spill over their own edges,
  // then everything that sits on top of it.
  const GRASSY = (k) => k === 'g' || k === 'c' || k === 't' || k === 's';
  function drawGround() {
    const g = gctx;
    const sn = seasonOf(S.day);
    const snow = isSnowy();
    const base = snow ? '#dfe7ea' : sn.grass[0];
    const mottle = snow ? '#e8eff2' : sn.grass[1];
    TREES.length = 0; WATER.length = 0;

    g.fillStyle = base;
    g.fillRect(0, 0, ground.width, ground.height);

    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const i = idx(x, y), n = NOISE[i];
      if (!GRASSY(S.kind[i]) || n[5] < 0.42) continue;
      g.globalAlpha = 0.45 + n[0] * 0.3;
      g.fillStyle = mottle;
      g.beginPath();
      g.ellipse(x * TILE + n[1] * TILE, y * TILE + n[2] * TILE, 12 + n[3] * 14, 9 + n[4] * 10, n[0] * 3, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;

    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const i = idx(x, y), k = S.kind[i], n = NOISE[i];
      const px = x * TILE, py = y * TILE;
      if (k === 'w') {
        // `deep` means every neighbour is water too, so highlights can go there without
        // landing on the shoreline the blur puts inside the tile.
        const wet = (dx, dy) => inb(x + dx, y + dy) && S.kind[idx(x + dx, y + dy)] === 'w';
        WATER.push({ x, y, deep: wet(0, -1) && wet(0, 1) && wet(-1, 0) && wet(1, 0) });
        continue;   // the pond itself is drawn in one piece below
      }
      if (k === 'p' || k === 'r') {
        g.fillStyle = k === 'r' ? (snow ? '#c9c0b2' : '#a8865a') : (snow ? '#ddd6c8' : '#c3a06d');
        g.fillRect(px, py, TILE, TILE);
        g.fillStyle = 'rgba(0,0,0,0.08)';
        g.fillRect(px + 6 + n[0] * 14, py + 8 + n[1] * 14, 4, 3);
        g.fillRect(px + 4 + n[2] * 16, py + 4 + n[3] * 18, 3, 2);
        if (k === 'r') { g.fillStyle = 'rgba(0,0,0,0.06)'; g.fillRect(px, py + 9, TILE, 4); g.fillRect(px, py + 20, TILE, 4); }
        // scuff the join with the grass rather than ruling a line along it
        const nb = (dx, dy) => { const kk = inb(x + dx, y + dy) ? S.kind[idx(x + dx, y + dy)] : 'r'; return kk === 'p' || kk === 'r'; };
        g.fillStyle = base;
        if (!nb(0, -1)) for (let t = 0; t < 8; t++) g.fillRect(px + t * 4, py, 4, 1 + Math.round(NOISE[i][t % 8] * 3));
        if (!nb(0, 1)) for (let t = 0; t < 8; t++) { const hh = 1 + Math.round(NOISE[i][(t + 3) % 8] * 3); g.fillRect(px + t * 4, py + TILE - hh, 4, hh); }
        if (!nb(-1, 0)) for (let t = 0; t < 8; t++) g.fillRect(px, py + t * 4, 1 + Math.round(NOISE[i][(t + 5) % 8] * 3), 4);
        if (!nb(1, 0)) for (let t = 0; t < 8; t++) { const ww = 1 + Math.round(NOISE[i][(t + 1) % 8] * 3); g.fillRect(px + TILE - ww, py + t * 4, ww, 4); }
        continue;
      }
      if (k === 'f') {
        const soil = snow ? '#8d8377' : sn.soil;
        g.fillStyle = soil;
        g.fillRect(px, py, TILE, TILE);
        g.fillStyle = shade(sn.soil, snow ? 0.02 : -0.06);
        for (let r = 0; r < 4; r++) g.fillRect(px, py + 3 + r * 8, TILE, 3);
        g.fillStyle = shade(sn.soil, 0.07);
        for (let r = 0; r < 4; r++) g.fillRect(px, py + 6 + r * 8, TILE, 1);
        g.fillStyle = shade(sn.soil, 0.1);
        g.fillRect(px + 8 + n[0] * 10, py + 10 + n[1] * 12, 3, 2);
        g.fillRect(px + 3 + n[2] * 20, py + 4 + n[3] * 22, 2, 2);
        if (snow) { g.fillStyle = 'rgba(236,242,245,0.55)'; for (let r = 0; r < 4; r++) g.fillRect(px, py + 1 + r * 8, TILE, 2); }
        continue;
      }
      // grass, and everything that stands on it
      if (!snow) {
        g.fillStyle = sn.tuft;
        for (let t = 0; t < 3; t++) {
          const tx = px + 4 + n[t] * 22, ty = py + 6 + n[(t + 2) % 6] * 20;
          g.fillRect(tx, ty, 2, 4); g.fillRect(tx + 3, ty - 2, 2, 5);
        }
        if (sn.id === 'spring' && n[4] > 0.86) {
          g.fillStyle = n[5] > 0.5 ? '#f0e08a' : '#e8dff0';
          g.fillRect(px + 6 + n[1] * 18, py + 8 + n[2] * 16, 3, 3);
        }
        if (sn.id === 'autumn' && n[4] > 0.8) {
          g.fillStyle = '#c8813a';
          g.fillRect(px + 5 + n[3] * 20, py + 7 + n[0] * 18, 3, 2);
        }
      } else {
        g.fillStyle = 'rgba(190,205,212,0.7)';
        g.fillRect(px + 5 + n[1] * 18, py + 9 + n[2] * 14, 5, 2);
      }
      if (k === 's') {
        g.fillStyle = snow ? '#c2ccd2' : '#8d8b86';
        g.beginPath(); g.ellipse(px + 16, py + 20, 8 + n[0] * 3, 6, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = snow ? '#dde5e9' : '#a5a29b';
        g.beginPath(); g.ellipse(px + 14, py + 17, 6, 4.5, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(0,0,0,0.16)';
        g.beginPath(); g.ellipse(px + 18, py + 24, 8, 3, 0, 0, Math.PI * 2); g.fill();
      }
      if (k === 't') TREES.push({ x, y, n });
      if (k === 'c') {
        g.fillStyle = snow ? '#9aa1a6' : '#6a6a6a';
        for (let a = 0; a < 8; a++) { const ang = a / 8 * Math.PI * 2; g.fillRect(px + 16 + Math.cos(ang) * 9 - 2, py + 18 + Math.sin(ang) * 6 - 2, 4, 4); }
      }
    }
    drawPond(g, snow);
    // farm borders
    for (const f of S.farms) {
      g.strokeStyle = 'rgba(90,62,34,0.85)'; g.lineWidth = 2;
      g.strokeRect(f.x * TILE + 1, f.y * TILE + 1, f.w * TILE - 2, f.h * TILE - 2);
      g.fillStyle = '#8b6b3e';
      for (let x = f.x; x < f.x + f.w; x += 2) { g.fillRect(x * TILE + 6, f.y * TILE - 1, 3, 5); g.fillRect(x * TILE + 6, (f.y + f.h) * TILE - 4, 3, 5); }
    }
    groundDirty = false;
    groundKey = seasonOf(S.day).id + (isSnowy() ? '-snow' : '');
  }

  // The pond is stored as tiles, and a tiled pond looks like a swimming bath. Draw it instead
  // as one path built from the runs of water in every row and column, with the corners rounded
  // right off: the silhouette stops agreeing with the grid, and growing the same path outwards
  // gives the mud that rings it.
  function pondPath(g, grow) {
    const wet = (x, y) => inb(x, y) && S.kind[idx(x, y)] === 'w';
    const r = 14 + grow;
    g.beginPath();
    for (let y = 0; y < ROWS; y++) {
      let x = 0;
      while (x < COLS) {
        if (!wet(x, y)) { x++; continue; }
        let e = x;
        while (wet(e + 1, y)) e++;
        g.roundRect(x * TILE - grow, y * TILE - grow, (e - x + 1) * TILE + grow * 2, TILE + grow * 2, r);
        x = e + 1;
      }
    }
    for (let x = 0; x < COLS; x++) {
      let y = 0;
      while (y < ROWS) {
        if (!wet(x, y)) { y++; continue; }
        let e = y;
        while (wet(x, e + 1)) e++;
        g.roundRect(x * TILE - grow, y * TILE - grow, TILE + grow * 2, (e - y + 1) * TILE + grow * 2, r);
        y = e + 1;
      }
    }
  }
  function erodePond(k, colour) {
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (const t of WATER) {
      minx = Math.min(minx, t.x); miny = Math.min(miny, t.y);
      maxx = Math.max(maxx, t.x); maxy = Math.max(maxy, t.y);
    }
    if (minx === Infinity) return null;
    const pad = 24;
    const x = minx * TILE - pad, y = miny * TILE - pad;
    const w = (maxx - minx + 1) * TILE + pad * 2, h = (maxy - miny + 1) * TILE + pad * 2;
    const full = document.createElement('canvas'); full.width = w; full.height = h;
    const a = full.getContext('2d');
    a.translate(-x, -y);
    a.fillStyle = '#fff'; pondPath(a, 0); a.fill();
    a.setTransform(1, 0, 0, 1, 0, 0);
    const out = document.createElement('canvas'); out.width = w; out.height = h;
    const b = out.getContext('2d');
    b.drawImage(full, 0, 0);
    b.globalCompositeOperation = 'destination-in';
    for (const [dx, dy] of [[k, 0], [-k, 0], [0, k], [0, -k], [k, k], [-k, -k], [k, -k], [-k, k]]) b.drawImage(full, dx, dy);
    b.globalCompositeOperation = 'source-in';
    b.fillStyle = colour; b.fillRect(0, 0, w, h);
    return { canvas: out, x, y };
  }

  function drawPond(g, snow) {
    if (!WATER.length) return;
    g.fillStyle = snow ? '#cbd6db' : '#5e5744';
    pondPath(g, 3); g.fill();
    g.fillStyle = snow ? '#d3dee3' : '#4d84a2';
    pondPath(g, 0); g.fill();
    // The deep water is the same silhouette eaten in from every side, which leaves a band of
    // shallow water round the bank. Stroking would trace every run in the path instead.
    const deep = erodePond(7, snow ? '#b6c8d4' : '#356082');
    if (deep) g.drawImage(deep.canvas, deep.x, deep.y);
    // a bit of movement on the surface, and reeds where the bank is shallow
    g.fillStyle = snow ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.14)';
    for (const t of WATER) {
      if (!t.deep) continue;
      const n = NOISE[idx(t.x, t.y)];
      g.fillRect(t.x * TILE + 3 + n[0] * 12, t.y * TILE + 7 + n[1] * 16, 10 + n[2] * 8, 2);
    }
    if (!snow) {
      g.fillStyle = '#5f8a48';
      for (const t of WATER) {
        const n = NOISE[idx(t.x, t.y)];
        if (n[3] < 0.62) continue;
        const bank = [[0, -1], [0, 1], [-1, 0], [1, 0]].find(([dx, dy]) => !inb(t.x + dx, t.y + dy) || S.kind[idx(t.x + dx, t.y + dy)] !== 'w');
        if (!bank) continue;
        const rx = t.x * TILE + 8 + n[4] * 16 + bank[0] * 11;
        const ry = t.y * TILE + 16 + n[5] * 10 + bank[1] * 11;
        for (let i = 0; i < 3; i++) g.fillRect(rx + i * 3, ry - 8 + i * 2, 1.6, 9 - i * 2);
      }
    }
  }

  // ---------------------------------------------------------------- crops
  function drawCrop(c, x, y, p) {
    const px = x * TILE, py = y * TILE, n = NOISE[idx(x, y)];
    const stage = p.stage === 2 ? 3 : p.growth < 0.33 ? 0 : p.growth < 0.7 ? 1 : 2;
    const sway = Math.sin(clockT * 1.6 + x * 0.7 + y * 0.4) * (weatherOf().id === 'wind' || weatherOf().id === 'storm' ? 1.4 : 0.4);
    for (let r = 0; r < 3; r++) for (let q = 0; q < 3; q++) {
      const cx = px + 6 + q * 10 + (n[(r + q) % 6] - 0.5) * 3 + sway * (r === 0 ? 1 : r === 1 ? 0.6 : 0.2);
      const cy = py + 8 + r * 9;
      switch (p.crop) {
        case 'wheat': {
          const h = [3, 7, 11, 13][stage];
          c.fillStyle = stage === 3 ? '#e2c04a' : stage === 2 ? '#b8c24a' : '#7fbf5a';
          c.fillRect(cx, cy - h + 4, 2, h);
          if (stage >= 2) { c.fillStyle = '#e8cf6a'; c.fillRect(cx - 1, cy - h + 3, 4, 4); c.fillStyle = '#f2dd90'; c.fillRect(cx, cy - h + 2, 2, 2); }
          break;
        }
        case 'carrot': {
          c.fillStyle = '#4f9a3d';
          const s = [2, 4, 5, 6][stage];
          c.fillRect(cx - 1, cy - s + 2, 2, s + 2); c.fillRect(cx - 3, cy - s + 4, 2, s); c.fillRect(cx + 2, cy - s + 4, 2, s);
          if (stage === 3) { c.fillStyle = '#e8873a'; c.fillRect(cx - 2, cy + 3, 5, 3); c.fillStyle = '#f0a05a'; c.fillRect(cx - 1, cy + 3, 2, 2); }
          break;
        }
        case 'cabbage': {
          const rr = [1.5, 2.5, 3.5, 4.5][stage];
          c.fillStyle = stage === 3 ? '#8fd07a' : '#6fae5c';
          c.beginPath(); c.arc(cx + 1, cy + 2, rr, 0, Math.PI * 2); c.fill();
          if (stage >= 2) { c.fillStyle = '#c6ec9a'; c.beginPath(); c.arc(cx, cy + 1, rr * 0.45, 0, Math.PI * 2); c.fill(); }
          break;
        }
        case 'pumpkin': {
          c.fillStyle = '#4f9a3d';
          c.fillRect(cx - 3, cy + 2, 8, 2);
          if (stage >= 1) c.fillRect(cx - 1, cy - 1, 2, 4);
          if (stage >= 2) { c.fillStyle = stage === 3 ? '#e07a2a' : '#9ab84a'; const rr = stage === 3 ? 4.5 : 3; c.beginPath(); c.arc(cx + 1, cy + 1, rr, 0, Math.PI * 2); c.fill(); }
          if (stage === 3) { c.fillStyle = '#c4611c'; c.fillRect(cx, cy - 2, 1, 6); c.fillStyle = '#5a3d25'; c.fillRect(cx, cy - 4, 2, 2); }
          break;
        }
        case 'onion': {
          const s = [3, 5, 7, 8][stage];
          c.fillStyle = stage === 3 ? '#9ab26a' : '#5fa04a';
          c.fillRect(cx - 1, cy - s + 3, 2, s); c.fillRect(cx + 2, cy - s + 5, 2, s - 2);
          if (stage >= 2) { c.fillStyle = '#c8a86a'; c.beginPath(); c.arc(cx, cy + 3, stage === 3 ? 3.2 : 2.2, 0, Math.PI * 2); c.fill(); }
          if (stage === 3) { c.fillStyle = '#e0c890'; c.beginPath(); c.arc(cx - 1, cy + 2, 1.4, 0, Math.PI * 2); c.fill(); }
          break;
        }
        case 'herb': {
          const s = [2, 4, 6, 7][stage];
          c.fillStyle = '#4a7f42';
          c.fillRect(cx, cy - s + 3, 1, s);
          c.fillStyle = stage === 3 ? '#6fbc62' : '#5f9c5a';
          for (let l = 0; l < 3; l++) {
            const ly = cy - s + 4 + l * 2;
            c.fillRect(cx - 2 - (l === 1 ? 1 : 0), ly, 2, 1.5);
            c.fillRect(cx + 1 + (l === 1 ? 1 : 0), ly, 2, 1.5);
          }
          if (stage === 3) { c.fillStyle = '#d8c0e8'; c.fillRect(cx - 1, cy - s + 2, 3, 2); }
          break;
        }
        case 'turnip': {
          const s = [2, 4, 6, 7][stage];
          c.fillStyle = stage === 3 ? '#7fae5c' : '#5f9a4a';
          c.fillRect(cx - 1, cy - s + 3, 2, s); c.fillRect(cx - 4, cy - s + 5, 3, 2); c.fillRect(cx + 2, cy - s + 5, 3, 2);
          if (stage >= 2) {
            c.fillStyle = '#f0ece4';
            c.beginPath(); c.arc(cx, cy + 3, stage === 3 ? 3.2 : 2.2, 0, Math.PI * 2); c.fill();
            c.fillStyle = '#b98fc0';
            c.beginPath(); c.arc(cx, cy + 2, stage === 3 ? 3 : 2, Math.PI, Math.PI * 2); c.fill();
          }
          break;
        }
      }
    }
  }

  function drawTree(c, t) {
    const sn = seasonOf(S.day);
    const px = t.x * TILE, py = t.y * TILE, n = t.n;
    const sway = Math.sin(clockT * 1.1 + t.x * 0.9) * (weatherOf().id === 'wind' || weatherOf().id === 'storm' ? 2.4 : 0.7);
    const cx = px + 16, base = py + 28;
    c.fillStyle = 'rgba(0,0,0,0.2)';
    c.beginPath(); c.ellipse(cx + 2, base + 1, 10, 4, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#5a4030';
    c.fillRect(cx - 2, base - 14, 4, 14);
    c.fillStyle = '#6b4d38';
    c.fillRect(cx - 2, base - 14, 2, 14);
    const bare = sn.id === 'winter';
    if (bare) {
      c.strokeStyle = '#5a4030'; c.lineWidth = 2; c.lineCap = 'round';
      for (const [ax, ay] of [[-7, -9], [7, -10], [-4, -15], [5, -16]]) {
        c.beginPath(); c.moveTo(cx, base - 12); c.lineTo(cx + ax + sway * 0.5, base - 12 + ay); c.stroke();
      }
      c.lineCap = 'butt';
      if (isSnowy()) { c.fillStyle = 'rgba(236,242,245,0.8)'; c.beginPath(); c.arc(cx + sway * 0.4, base - 24, 4, 0, Math.PI * 2); c.fill(); }
      return;
    }
    const leaf = sn.leaf;
    const blobs = [[0, -22, 10], [-8, -16, 7.5], [8, -17, 7], [-3, -27, 6.5], [5, -26, 6]];
    c.fillStyle = shade(leaf, -0.07);
    for (const [bx, by, br] of blobs) { c.beginPath(); c.arc(cx + bx + sway, base + by, br, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = leaf;
    for (const [bx, by, br] of blobs) { c.beginPath(); c.arc(cx + bx + sway - 1.5, base + by - 1.5, br * 0.82, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = shade(leaf, 0.1);
    c.beginPath(); c.arc(cx - 3 + sway, base - 27, 4, 0, Math.PI * 2); c.fill();
    if (sn.id === 'spring' && n[3] > 0.4) {
      c.fillStyle = '#f2dce8';
      for (let i = 0; i < 4; i++) c.beginPath(), c.arc(cx + sway + (n[i] - 0.5) * 18, base - 26 + n[(i + 2) % 6] * 14, 1.7, 0, Math.PI * 2), c.fill();
    }
  }

  function drawWater(c) {
    // a few glints that drift, so the pond is not a flat blue rectangle
    c.fillStyle = 'rgba(255,255,255,0.22)';
    for (const w of WATER) {
      if (!w.deep) continue;
      const px = w.x * TILE, py = w.y * TILE, n = NOISE[idx(w.x, w.y)];
      const t = clockT * 0.5 + n[0] * 6;
      const a = 0.5 + 0.5 * Math.sin(t);
      c.globalAlpha = 0.10 + a * 0.16;
      c.fillRect(px + 4 + n[1] * 14, py + 8 + n[2] * 14 + Math.sin(t) * 1.5, 9, 2);
      c.fillRect(px + 12 + n[3] * 10, py + 18 + n[4] * 8 - Math.sin(t * 0.8) * 1.5, 6, 2);
    }
    c.globalAlpha = 1;
  }

  // ------------------------------------------------------------- buildings
  const STYLES = {
    house:  { wall: '#e9dcc0', roof: '#a5513f', trim: '#6b4a2e', plank: false },
    store:  { wall: '#8a5f3a', roof: '#5b5f66', trim: '#4a3320', plank: true },
    shop:   { wall: '#d8d0c0', roof: '#3f6d8a', trim: '#2b4a5e', plank: false },
    bakery: { wall: '#e6c9a0', roof: '#7a4a3a', trim: '#5a3d25', plank: false },
    dairy:  { wall: '#dfe4e0', roof: '#4f7a5e', trim: '#39503f', plank: false },
    weaver: { wall: '#dcc9d8', roof: '#6a4a72', trim: '#43304a', plank: false },
    coop:   { wall: '#d8b98a', roof: '#9a6a3a', trim: '#5a3d25', plank: true },
    sty:    { wall: '#c9b49a', roof: '#7a6a52', trim: '#4a3f30', plank: true },
    byre:   { wall: '#e2d2b4', roof: '#8a5a42', trim: '#5a3d25', plank: true },
    fold:   { wall: '#dcd6c2', roof: '#6a7a62', trim: '#4a5040', plank: true },
  };

  function drawSmoke(c, x, y, strength) {
    for (let i = 0; i < 3; i++) {
      const t = ((clockT * 0.4) + i * 0.33) % 1;
      c.fillStyle = `rgba(232,230,224,${(strength || 0.5) * (1 - t)})`;
      c.beginPath(); c.arc(x + Math.sin((t + i) * 6) * 3, y - t * 16, 2 + t * 3.4, 0, Math.PI * 2); c.fill();
    }
  }

  // A hanging board with a tiny painted thing on it. It is what tells a bakery from a dairy
  // at a glance, and it is most of the reason the village reads as a village.
  function drawSign(c, x, y, type) {
    c.fillStyle = '#4a3320';
    c.fillRect(x - 1, y - 6, 2, 6);
    c.fillRect(x - 9, y - 7, 18, 2);
    c.fillStyle = '#f0e6d2';
    c.fillRect(x - 8, y, 16, 11);
    c.strokeStyle = '#4a3320'; c.lineWidth = 1; c.strokeRect(x - 8.5, y - 0.5, 17, 12);
    c.fillStyle = '#4a3320';
    c.fillRect(x - 1, y - 2, 2, 2);
    switch (type) {
      case 'bakery':
        c.fillStyle = '#c58b4a'; c.beginPath(); c.ellipse(x, y + 6, 6, 3.6, 0, 0, Math.PI * 2); c.fill();
        c.strokeStyle = '#8a5a2a'; c.beginPath(); c.moveTo(x - 3, y + 4); c.lineTo(x + 3, y + 4); c.stroke();
        break;
      case 'dairy':
        c.fillStyle = '#e8c25a'; c.beginPath(); c.moveTo(x - 6, y + 9); c.lineTo(x + 6, y + 9); c.lineTo(x + 6, y + 3); c.closePath(); c.fill();
        c.fillStyle = '#f2dd90'; c.fillRect(x - 1, y + 6, 2, 2); c.fillRect(x + 2, y + 7, 2, 2);
        break;
      case 'weaver':
        c.fillStyle = '#b06a8a'; c.fillRect(x - 5, y + 3, 10, 6);
        c.fillStyle = '#8a4a6a'; c.fillRect(x - 5, y + 5, 10, 1); c.fillRect(x - 5, y + 7, 10, 1);
        break;
      case 'shop':
        c.fillStyle = '#7fbf6a'; c.beginPath(); c.arc(x - 2, y + 6, 3, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#e8873a'; c.beginPath(); c.arc(x + 3, y + 7, 2.4, 0, Math.PI * 2); c.fill();
        break;
      case 'store':
        c.fillStyle = '#b07a3a'; c.fillRect(x - 6, y + 3, 12, 6);
        c.fillStyle = '#7a5636'; c.fillRect(x - 6, y + 3, 12, 1.5); c.fillRect(x - 0.7, y + 3, 1.4, 6);
        break;
    }
  }

  function drawShell(c, px, py, w, h, st, opt) {
    const roofH = Math.round(h * 0.46);
    const wallY = py + roofH;
    const wallH = h - roofH;
    // ground shadow
    c.fillStyle = 'rgba(0,0,0,0.2)';
    c.beginPath(); c.ellipse(px + w / 2 + 3, py + h - 1, w * 0.5, 5, 0, 0, Math.PI * 2); c.fill();
    // foundation
    c.fillStyle = shade(st.trim, -0.04);
    c.fillRect(px + 1, py + h - 5, w - 2, 5);
    // wall
    c.fillStyle = st.wall;
    c.fillRect(px + 2, wallY, w - 4, wallH - 3);
    if (st.plank) {
      c.fillStyle = 'rgba(0,0,0,0.09)';
      for (let i = wallY + 5; i < py + h - 5; i += 6) c.fillRect(px + 2, i, w - 4, 1.5);
    } else {
      c.fillStyle = 'rgba(255,255,255,0.16)';
      c.fillRect(px + 2, wallY, w - 4, 3);
    }
    c.fillStyle = 'rgba(0,0,0,0.14)';
    c.fillRect(px + 2, wallY, 2.5, wallH - 3);
    c.fillRect(px + w - 4.5, wallY, 2.5, wallH - 3);
    // eave shadow
    c.fillStyle = 'rgba(0,0,0,0.2)';
    c.fillRect(px + 2, wallY, w - 4, 3);
    // roof
    c.fillStyle = st.roof;
    c.beginPath();
    c.moveTo(px - 3, wallY + 2);
    c.lineTo(px + w / 2, py + 1);
    c.lineTo(px + w + 3, wallY + 2);
    c.closePath(); c.fill();
    // tile courses following the pitch
    c.save();
    c.beginPath();
    c.moveTo(px - 3, wallY + 2); c.lineTo(px + w / 2, py + 1); c.lineTo(px + w + 3, wallY + 2); c.closePath();
    c.clip();
    c.fillStyle = 'rgba(0,0,0,0.13)';
    for (let yy = py + 4; yy < wallY + 2; yy += 4) c.fillRect(px - 3, yy, w + 6, 1.6);
    c.fillStyle = 'rgba(255,255,255,0.13)';
    c.fillRect(px + w / 2 - 1, py + 1, 2, roofH);
    c.restore();
    // ridge
    c.fillStyle = shade(st.roof, 0.12);
    c.beginPath(); c.moveTo(px - 3, wallY + 2); c.lineTo(px + w / 2, py + 1); c.lineTo(px + w / 2, py + 3.5); c.lineTo(px - 3, wallY + 4); c.closePath(); c.fill();
    return { wallY, wallH, roofH };
  }

  function drawWindow(c, x, y, w, h, lit, trim) {
    c.fillStyle = trim;
    c.fillRect(x - 1, y - 1, w + 2, h + 2);
    c.fillStyle = lit ? '#ffd76a' : '#9bc2d8';
    c.fillRect(x, y, w, h);
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.fillRect(x + w / 2 - 0.5, y, 1, h);
    c.fillRect(x, y + h / 2 - 0.5, w, 1);
    if (lit) { c.fillStyle = 'rgba(255,240,190,0.5)'; c.fillRect(x, y, w, h / 2); }
  }

  function drawBuilding(c, b, night) {
    const def = BUILDINGS[b.type];
    if (def.pen) return drawPen(c, b, night);
    const px = b.x * TILE, py = b.y * TILE, w = b.w * TILE, h = b.h * TILE;
    const st = STYLES[b.type];
    const { wallY, wallH } = drawShell(c, px, py, w, h, st);
    const lit = night;
    // door
    const dx = px + w / 2 - 7, dy = py + h - 17;
    c.fillStyle = shade(st.trim, -0.05);
    c.fillRect(dx - 1, dy - 1, 16, 17);
    c.fillStyle = st.trim;
    c.fillRect(dx, dy, 14, 16);
    c.fillStyle = 'rgba(255,255,255,0.12)';
    c.fillRect(dx + 1, dy + 1, 12, 2);
    c.fillStyle = '#d8c68a';
    c.fillRect(dx + 11, dy + 8, 1.5, 1.5);

    if (b.type === 'house') {
      drawWindow(c, px + 6, wallY + 8, 9, 8, lit, st.trim);
      drawWindow(c, px + w - 15, wallY + 8, 9, 8, lit, st.trim);
      c.fillStyle = '#7a5a44'; c.fillRect(px + w - 13, py + 1, 7, 15);
      c.fillStyle = '#5a4030'; c.fillRect(px + w - 13, py + 1, 7, 3);
      if (b.residents && b.residents.length) drawSmoke(c, px + w - 9.5, py + 1, night ? 0.55 : 0.42);
    } else if (b.type === 'store') {
      c.fillStyle = st.trim;
      c.fillRect(px + 7, wallY + 6, 3, wallH - 12); c.fillRect(px + w - 10, wallY + 6, 3, wallH - 12);
      c.fillStyle = '#c9a15c'; c.fillRect(px + w / 2 - 16, dy - 3, 32, 3);
      let tot = 0; for (const g of GOOD_ORDER) tot += S.store[g];
      const crates = Math.min(4, Math.ceil(tot / 14));
      for (let i = 0; i < crates; i++) {
        const bx = px + 5 + i * 10;
        c.fillStyle = '#b07a3a'; c.fillRect(bx, py + h - 10, 8, 8);
        c.fillStyle = '#8a5f2a'; c.fillRect(bx, py + h - 10, 8, 1.5); c.fillRect(bx + 3.2, py + h - 10, 1.6, 8);
      }
      drawSign(c, px + w - 10, py + h - 30, 'store');
    } else if (b.type === 'shop') {
      for (let i = 0; i < w - 4; i += 8) { c.fillStyle = (i / 8) % 2 ? '#f0ece4' : '#c9503f'; c.fillRect(px + 2 + i, wallY + 3, Math.min(8, w - 4 - i), 9); }
      c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(px + 2, wallY + 12, w - 4, 2);
      drawWindow(c, px + 5, wallY + 16, 13, 9, lit, st.trim);
      const s = b.stock;
      for (let i = 0; i < Math.min(4, Math.ceil(s / 4)); i++) {
        c.fillStyle = ['#e8873a', '#c58b4a', '#7fbf6a', '#e8c25a'][i];
        c.fillRect(px + 6 + i * 3.2, wallY + 20, 2.4, 4);
      }
      drawSign(c, px + w - 11, wallY + 17, 'shop');
    } else {
      // the three workshops share a shape and differ by their chimney and their sign
      c.fillStyle = '#7a5a44'; c.fillRect(px + 6, py + 1, 8, 17);
      c.fillStyle = '#5a4030'; c.fillRect(px + 6, py + 1, 8, 3);
      drawWindow(c, px + w - 17, wallY + 8, 11, 9, lit, st.trim);
      const busy = S.villagers.some(v => v.task && v.task.kind === 'craft' && v.task.phase === 1 && v.task.to === b.id);
      if (busy) drawSmoke(c, px + 10, py + 1, 0.62);
      if (b.type === 'weaver') {
        // a line of dyed cloth out to dry
        c.strokeStyle = 'rgba(60,45,35,0.6)'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(px + 2, py + h - 12); c.lineTo(px + w - 2, py + h - 14); c.stroke();
        for (let i = 0; i < 3; i++) { c.fillStyle = ['#b06a8a', '#6a8ab0', '#c8a05a'][i]; c.fillRect(px + 5 + i * 9, py + h - 12 + i * 0.3, 5, 6); }
      }
      drawSign(c, px + w - 9, py + h - 30, b.type);
    }
    if (UI.sel && UI.sel.kind === 'building' && UI.sel.id === b.id) selRect(c, px, py, w, h);
  }

  function selRect(c, px, py, w, h) {
    c.strokeStyle = '#fff'; c.lineWidth = 2; c.setLineDash([4, 3]);
    c.strokeRect(px + 1, py + 1, w - 2, h - 2);
    c.setLineDash([]);
  }

  // ------------------------------------------------------------------ pens
  function drawPen(c, b, night) {
    const px = b.x * TILE, py = b.y * TILE, w = b.w * TILE, h = b.h * TILE;
    const st = STYLES[b.type];
    const snow = isSnowy();
    // the yard: trodden ground inside the fence
    c.fillStyle = snow ? '#d6dde0' : '#8a7c56';
    c.fillRect(px + 2, py + 4, w - 4, h - 6);
    c.fillStyle = snow ? 'rgba(180,196,204,0.6)' : 'rgba(0,0,0,0.09)';
    for (let i = 0; i < 7; i++) {
      const n = NOISE[idx(b.x, b.y)][i % 8];
      c.beginPath(); c.ellipse(px + 8 + n * (w - 18), py + 9 + ((i * 7) % (h - 16)), 5, 3, 0, 0, Math.PI * 2); c.fill();
    }
    // the shed at the left-hand end
    const sw = (b.w >= 4 ? 2 : 1.4) * TILE;
    const shed = drawShell(c, px + 1, py + 2, sw, h - 5, st);
    c.fillStyle = st.trim;
    c.fillRect(px + 1 + sw / 2 - 6, py + h - 16, 12, 13);
    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.fillRect(px + 3 + sw / 2 - 6, py + h - 14, 8, 11);
    if (b.type === 'byre' || b.type === 'fold') {
      // a hayloft opening under the ridge
      c.fillStyle = '#4a3320'; c.fillRect(px + 1 + sw / 2 - 5, shed.wallY + 3, 10, 7);
      c.fillStyle = '#d9b64a'; c.fillRect(px + 1 + sw / 2 - 4, shed.wallY + 6, 8, 4);
    }
    // feed trough along the bottom of the yard
    const tx = px + sw + 5, tw = w - sw - 10;
    if (tw > 12) {
      c.fillStyle = '#6b4a2e'; c.fillRect(tx, py + h - 11, tw, 6);
      c.fillStyle = '#8a6440'; c.fillRect(tx, py + h - 11, tw, 2);
      const fill = clamp(b.feed / PEN_FEED_CAP, 0, 1);
      if (fill > 0) { c.fillStyle = '#d9b64a'; c.fillRect(tx + 1, py + h - 9, (tw - 2) * fill, 3); }
    }
    // fence round the whole thing
    drawFence(c, px, py, w, h, sw);
    // the animals, back to front
    const kind = BUILDINGS[b.type].pen.animal;
    const herd = herdOf(b).slice().sort((a, z) => a.y - z.y);
    for (const a of herd) drawAnimal(c, kind, a.x * TILE, a.y * TILE, a.face, a.phase, a.wait > 0);
    // what is waiting to be collected
    if (b.ready > 0) drawYield(c, b, px, py, w, h, sw);
    if (b.state === 'hungry') {
      c.font = 'bold 12px ui-sans-serif, system-ui, sans-serif'; c.textAlign = 'center';
      c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillText('!', px + w / 2 + 1, py + 1);
      c.fillStyle = '#e9c46a'; c.fillText('!', px + w / 2, py);
      c.textAlign = 'left';
    }
    if (UI.sel && UI.sel.kind === 'building' && UI.sel.id === b.id) selRect(c, px, py, w, h);
  }

  function drawFence(c, px, py, w, h, skipW) {
    const post = (x, y) => {
      c.fillStyle = '#7a5a3a'; c.fillRect(x - 1.5, y - 9, 3, 11);
      c.fillStyle = '#96724a'; c.fillRect(x - 1.5, y - 9, 1.5, 11);
    };
    const rail = (x0, y0, x1, y1, dy) => {
      c.strokeStyle = '#8a6640'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(x0, y0 - dy); c.lineTo(x1, y1 - dy); c.stroke();
    };
    const l = px + 2, r = px + w - 2, t = py + 5, bm = py + h - 2;
    // back rail (behind the animals visually, but drawn here for simplicity)
    rail(l, t, r, t, 5); rail(l, t, r, t, 2);
    rail(l, bm, r, bm, 5); rail(l, bm, r, bm, 2);
    rail(l, t, l, bm, 5); rail(r, t, r, bm, 5);
    for (let x = l + skipW; x <= r; x += 20) { post(x, t + 2); post(x, bm + 2); }
    post(l, bm + 2); post(r, bm + 2); post(r, t + 2);
    // a gate on the right-hand side
    c.fillStyle = '#a5825a';
    c.fillRect(r - 12, bm - 8, 12, 2); c.fillRect(r - 12, bm - 4, 12, 2);
  }

  function drawYield(c, b, px, py, w, h, sw) {
    const pen = BUILDINGS[b.type].pen;
    const n = Math.min(6, Math.ceil(b.ready / 2.5));
    for (let i = 0; i < n; i++) {
      const x = px + sw + 8 + (i % 3) * 11, y = py + 12 + Math.floor(i / 3) * 9;
      if (pen.produce === 'egg') {
        c.fillStyle = '#efe3c8'; c.beginPath(); c.ellipse(x, y, 3, 4, 0.3, 0, Math.PI * 2); c.fill();
        c.fillStyle = 'rgba(0,0,0,0.15)'; c.beginPath(); c.ellipse(x + 1, y + 3, 3, 1.4, 0, 0, Math.PI * 2); c.fill();
      } else if (pen.produce === 'milk') {
        c.fillStyle = '#9aa4ac'; c.fillRect(x - 4, y - 4, 8, 8);
        c.fillStyle = '#c2cad0'; c.fillRect(x - 4, y - 4, 8, 2);
        c.fillStyle = '#f2f0e8'; c.fillRect(x - 3, y - 2, 6, 1.5);
      } else if (pen.produce === 'wool') {
        c.fillStyle = '#ded6c4'; c.beginPath(); c.arc(x, y, 4.5, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#c9c0ac'; c.beginPath(); c.arc(x - 1.5, y + 1, 2.4, 0, Math.PI * 2); c.fill();
      } else {
        c.fillStyle = '#4a3a2e'; c.beginPath(); c.arc(x, y, 3.4, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#66513f'; c.beginPath(); c.arc(x - 1, y - 1, 1.6, 0, Math.PI * 2); c.fill();
      }
    }
  }

  // ---------------------------------------------------------------- animals
  function drawAnimal(c, kind, x, y, face, phase, resting) {
    const t = clockT + phase;
    const f = face || 1;
    c.save();
    c.translate(x, y);
    c.scale(f, 1);
    c.fillStyle = 'rgba(0,0,0,0.22)';
    c.beginPath(); c.ellipse(0, 2, kind === 'hen' ? 5 : kind === 'cow' ? 11 : 8, kind === 'hen' ? 2 : 3.5, 0, 0, Math.PI * 2); c.fill();
    const bob = resting ? 0 : Math.abs(Math.sin(t * 5)) * 0.8;
    if (kind === 'hen') {
      const peck = Math.sin(t * 2.4) > 0.7 ? 3 : 0;
      c.fillStyle = '#f0ece4';
      c.beginPath(); c.ellipse(0, -4 - bob, 5, 4.5, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#ddd6c8';
      c.beginPath(); c.ellipse(-1.5, -3.5 - bob, 3.2, 3, 0.3, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#f0ece4';
      c.beginPath(); c.arc(4, -8 - bob + peck, 2.6, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#c9503f';
      c.fillRect(3.2, -11 - bob + peck, 1.4, 2); c.fillRect(4.8, -11.6 - bob + peck, 1.4, 2.6);
      c.fillStyle = '#e0a020';
      c.beginPath(); c.moveTo(6.2, -8 - bob + peck); c.lineTo(9, -7.2 - bob + peck); c.lineTo(6.2, -6.6 - bob + peck); c.fill();
      c.fillStyle = '#2b2118';
      c.fillRect(4.6, -8.8 - bob + peck, 1.1, 1.1);
      c.fillStyle = '#e0a020';
      c.fillRect(-1, -1, 1.4, 2); c.fillRect(1.6, -1, 1.4, 2);
    } else if (kind === 'sheep') {
      c.fillStyle = '#5a4a3e';
      c.fillRect(-4, -3, 1.8, 4); c.fillRect(2.4, -3, 1.8, 4);
      c.fillStyle = '#efeadd';
      c.beginPath(); c.ellipse(0, -7 - bob, 8, 6, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#e0d9c8';
      for (const [bx, by] of [[-5, -9], [-1, -11], [3, -9.5], [5, -6]]) { c.beginPath(); c.arc(bx, by - bob, 3, 0, Math.PI * 2); c.fill(); }
      c.fillStyle = '#3a3230';
      c.beginPath(); c.ellipse(7.5, -8 - bob, 3.2, 2.8, 0.2, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#2b2626';
      c.beginPath(); c.ellipse(5.8, -10.6 - bob, 1.8, 1.4, -0.5, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#f0ece4'; c.fillRect(8.6, -8.6 - bob, 1.1, 1.1);
    } else if (kind === 'pig') {
      c.fillStyle = '#c98f92';
      c.fillRect(-4, -3, 2, 4); c.fillRect(2.2, -3, 2, 4);
      c.fillStyle = '#e2a8ab';
      c.beginPath(); c.ellipse(0, -6 - bob, 7.5, 5, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#d09a9d';
      c.beginPath(); c.ellipse(-2, -4.5 - bob, 4, 3, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#e2a8ab';
      c.beginPath(); c.arc(7, -7 - bob, 3.6, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#c98f92';
      c.beginPath(); c.moveTo(5.4, -10.5 - bob); c.lineTo(8.4, -10 - bob); c.lineTo(6.4, -8 - bob); c.fill();
      c.fillStyle = '#c07a80';
      c.beginPath(); c.ellipse(10, -6.6 - bob, 2, 1.7, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#8a5a60'; c.fillRect(9.4, -7 - bob, 0.9, 0.9); c.fillRect(10.6, -7 - bob, 0.9, 0.9);
      c.fillStyle = '#2b2118'; c.fillRect(7.4, -8.4 - bob, 1, 1);
      c.strokeStyle = '#c98f92'; c.lineWidth = 1.4;
      c.beginPath(); c.arc(-7.6, -7 - bob, 2, -1, 3); c.stroke();
    } else {
      // cow
      c.fillStyle = '#4a3f38';
      c.fillRect(-6, -4, 2.4, 5); c.fillRect(-2, -4, 2.4, 5); c.fillRect(3, -4, 2.4, 5);
      c.fillStyle = '#f2efe8';
      c.beginPath(); c.ellipse(0, -9 - bob, 10.5, 6.5, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#3f3630';
      c.beginPath(); c.ellipse(-4, -11 - bob, 4, 3, 0.3, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(3.5, -7 - bob, 3.2, 2.4, -0.2, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#f2efe8';
      c.beginPath(); c.ellipse(10, -11 - bob, 4.4, 3.8, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#3f3630';
      c.beginPath(); c.ellipse(11.6, -9.6 - bob, 2.4, 2, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#d8c8b8'; c.fillRect(11, -10 - bob, 0.9, 0.9); c.fillRect(12.6, -10 - bob, 0.9, 0.9);
      c.fillStyle = '#2b2118'; c.fillRect(10.6, -12.6 - bob, 1.1, 1.1);
      c.fillStyle = '#e0d8c4';
      c.beginPath(); c.moveTo(8, -14.4 - bob); c.lineTo(10.4, -15.6 - bob); c.lineTo(9.4, -13.4 - bob); c.fill();
      c.strokeStyle = '#3f3630'; c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(-10, -12 - bob); c.lineTo(-11.4, -4 - bob + Math.sin(t * 2) * 1.2); c.stroke();
      c.fillStyle = '#3f3630'; c.beginPath(); c.arc(-11.4, -3.4 - bob + Math.sin(t * 2) * 1.2, 1.4, 0, Math.PI * 2); c.fill();
    }
    c.restore();
  }

  // -------------------------------------------------------------- villagers
  function drawVillager(c, v) {
    if (v.hidden) return;
    const x = v.px * TILE, y = v.py * TILE;
    const t = clockT;
    const stride = v.walking ? Math.sin(t * 11 + v.id) : 0;
    const bob = v.walking ? Math.abs(Math.sin(t * 11 + v.id)) * 1.2
      : v.working ? Math.abs(Math.sin(t * 7 + v.id)) * 2.2
        : Math.sin(t * 1.5 + v.id) * 0.4;
    const sel = UI.sel && UI.sel.kind === 'villager' && UI.sel.id === v.id;
    const f = v.face || 1;
    c.fillStyle = 'rgba(0,0,0,0.24)';
    c.beginPath(); c.ellipse(x, y + 6, 6.5, 3, 0, 0, Math.PI * 2); c.fill();
    if (sel) {
      c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 2;
      c.beginPath(); c.ellipse(x, y + 6, 10, 5, 0, 0, Math.PI * 2); c.stroke();
    }
    c.save();
    c.translate(x, y - bob);
    const ink = 'rgba(38,28,20,0.55)';
    // legs
    c.fillStyle = '#3a2c22';
    c.fillRect(-4.2 + stride * 1.4, -1, 3.2, 7);
    c.fillRect(1 - stride * 1.4, -1, 3.2, 7);
    // boots
    c.fillStyle = '#2b2118';
    c.fillRect(-4.6 + stride * 1.4, 4.6, 4, 2);
    c.fillRect(0.6 - stride * 1.4, 4.6, 4, 2);
    // body
    c.fillStyle = v.shirt;
    c.fillRect(-5, -10, 10, 10);
    c.fillStyle = 'rgba(255,255,255,0.14)'; c.fillRect(-5, -10, 10, 2.5);
    c.fillStyle = 'rgba(0,0,0,0.16)'; c.fillRect(2.6, -10, 2.4, 10);
    c.strokeStyle = ink; c.lineWidth = 1; c.strokeRect(-5.5, -10.5, 11, 10.5);
    // apron for the ones carrying things
    if (v.carry) { c.fillStyle = 'rgba(240,232,210,0.7)'; c.fillRect(-3.5, -5.5, 7, 5.5); }
    // arms
    c.fillStyle = shade(v.shirt, -0.1);
    if (v.working) {
      c.fillRect(f > 0 ? 4 : -7, -9 + Math.sin(t * 7 + v.id) * 2, 3, 7);
      c.fillRect(f > 0 ? -7 : 4, -8, 3, 6);
    } else if (v.carry) {
      c.fillRect(-7.5, -8, 3, 5); c.fillRect(4.5, -8, 3, 5);
    } else {
      c.fillRect(-7.5, -9 - stride, 3, 7);
      c.fillRect(4.5, -9 + stride, 3, 7);
    }
    // head
    c.fillStyle = '#f0c9a2';
    c.beginPath(); c.arc(0, -14, 4.8, 0, Math.PI * 2); c.fill();
    c.strokeStyle = ink; c.lineWidth = 1; c.stroke();
    c.fillStyle = 'rgba(0,0,0,0.1)';
    c.beginPath(); c.arc(f > 0 ? -1.6 : 1.6, -13.4, 4, 0, Math.PI * 2); c.fill();
    // eyes, looking the way they are going
    c.fillStyle = '#2b2118';
    c.fillRect(f > 0 ? 0.6 : -2.2, -15.2, 1.2, 1.4);
    c.fillRect(f > 0 ? 2.6 : -4.2, -15.2, 1.2, 1.4);
    // hair
    c.fillStyle = v.hair;
    c.beginPath(); c.arc(0, -14.6, 4.9, Math.PI, Math.PI * 2); c.fill();
    c.fillRect(f > 0 ? -5 : 2.2, -15.4, 2.8, 3.2);
    // hats
    if (v.hat === 'straw') {
      c.fillStyle = '#dcc078';
      c.beginPath(); c.ellipse(0, -17, 8, 2.6, 0, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(0, -18.6, 4.4, 3, 0, Math.PI, Math.PI * 2); c.fill();
      c.fillStyle = '#b8994f'; c.fillRect(-4.4, -18, 8.8, 1.4);
    } else if (v.hat === 'cap') {
      c.fillStyle = '#4a5a68';
      c.beginPath(); c.arc(0, -16.4, 5, Math.PI, Math.PI * 2); c.fill();
      c.fillRect(f > 0 ? 0 : -7.4, -17, 7.4, 1.6);
    } else if (v.hat === 'kerchief') {
      c.fillStyle = '#c9503f';
      c.beginPath(); c.arc(0, -15.4, 5.1, Math.PI, Math.PI * 2); c.fill();
      c.fillRect(-5.1, -15.6, 10.2, 1.6);
      c.beginPath(); c.moveTo(-5, -15); c.lineTo(-8, -12.4); c.lineTo(-4.4, -13.4); c.fill();
    }
    if (seasonOf(S.day).id === 'winter') {
      c.fillStyle = '#8a5a6a'; c.fillRect(-5, -10.6, 10, 2.6);
      c.fillRect(f > 0 ? -6.4 : 4.4, -10, 2.2, 6);
    }
    // carried goods, held out in front
    if (v.carry) {
      const g = GOODS[v.carry.good];
      c.fillStyle = shade(g.color, -0.16);
      c.fillRect(-6, -8.5, 12, 8);
      c.fillStyle = g.color;
      c.fillRect(-5.2, -7.8, 10.4, 6.6);
      c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(-5.2, -7.8, 10.4, 1.6);
      c.strokeStyle = ink; c.lineWidth = 1; c.strokeRect(-6.5, -9, 13, 8.5);
      c.fillStyle = '#1b1f24'; c.font = 'bold 7px ui-sans-serif, system-ui, sans-serif'; c.textAlign = 'center';
      c.fillText(String(v.carry.n), 0, -2.6); c.textAlign = 'left';
    }
    // tired / hungry markers
    if (v.energy < 30) { c.fillStyle = '#e06c5f'; c.font = 'bold 9px ui-sans-serif, system-ui, sans-serif'; c.fillText('z', 6, -18); }
    if (v.hunger > 0) { c.fillStyle = '#e9c46a'; c.beginPath(); c.arc(-8, -17, 2.2, 0, Math.PI * 2); c.fill(); }
    c.restore();
    if (v.sleeping && !v.hidden) {
      c.fillStyle = '#e9e4d8'; c.font = 'bold 10px Georgia, serif';
      c.fillText('z', x + 7, y - 20 + Math.sin(clockT * 2) * 2);
    }
    if (sel) {
      c.font = 'bold 11px ui-sans-serif, system-ui, sans-serif'; c.textAlign = 'center';
      c.strokeStyle = 'rgba(0,0,0,0.75)'; c.lineWidth = 3; c.strokeText(v.name, x, y + 19);
      c.fillStyle = '#f0ece4'; c.fillText(v.name, x, y + 19);
      c.textAlign = 'left';
    }
  }

  // ------------------------------------------------------------ the scene
  function nightAlpha() {
    const h = S.hour;
    if (h >= 20 || h < 5) return 0.5;
    if (h >= 17 && h < 20) return (h - 17) / 3 * 0.5;
    if (h >= 5 && h < 7) return 0.5 * (1 - (h - 5) / 2);
    return 0;
  }

  // Rain, snow and blown leaves live in screen space and wrap, so they cost nothing
  // and never give away where the camera is.
  const DROPS = [];
  for (let i = 0; i < 160; i++) DROPS.push({ x: Math.random(), y: Math.random(), s: 0.5 + Math.random(), w: Math.random() });
  function drawWeather(c) {
    const w = weatherOf().id;
    const W = canvas.width, H = canvas.height;
    if (w === 'rain' || w === 'storm') {
      const heavy = w === 'storm';
      c.strokeStyle = heavy ? 'rgba(180,200,225,0.5)' : 'rgba(180,200,225,0.36)';
      c.lineWidth = 1;
      c.beginPath();
      for (let i = 0; i < (heavy ? 160 : 100); i++) {
        const d = DROPS[i];
        const y = (d.y + clockT * (heavy ? 1.5 : 1.05) * d.s) % 1 * H;
        const x = (d.x + (heavy ? 0.16 : 0.08) * (y / H)) % 1 * W;
        c.moveTo(x, y); c.lineTo(x - (heavy ? 6 : 3), y + (heavy ? 14 : 11));
      }
      c.stroke();
      if (heavy) {
        const f = Math.sin(clockT * 0.7) * Math.sin(clockT * 5.3);
        if (f > 0.985) { c.fillStyle = 'rgba(220,232,255,0.25)'; c.fillRect(0, 0, W, H); }
      }
    } else if (w === 'snow') {
      for (let i = 0; i < 130; i++) {
        const d = DROPS[i];
        const y = (d.y + clockT * 0.11 * d.s) % 1 * H;
        const x = ((d.x + Math.sin(clockT * 0.5 + d.w * 8) * 0.02) % 1 + 1) % 1 * W;
        c.fillStyle = `rgba(248,252,255,${0.4 + d.w * 0.45})`;
        c.beginPath(); c.arc(x, y, 1 + d.w * 1.7, 0, Math.PI * 2); c.fill();
      }
    } else if (w === 'wind') {
      const leafy = seasonOf(S.day).id === 'autumn';
      for (let i = 0; i < 34; i++) {
        const d = DROPS[i];
        const x = (d.x + clockT * 0.28 * d.s) % 1 * W;
        const y = (d.y * H + Math.sin(clockT * 2 + d.w * 9) * 12);
        if (leafy) { c.fillStyle = `rgba(200,130,58,${0.45 + d.w * 0.4})`; c.fillRect(x, y, 4, 2.5); }
        else { c.strokeStyle = 'rgba(255,255,255,0.18)'; c.lineWidth = 1; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 14, y - 2); c.stroke(); }
      }
    } else if (w === 'frost') {
      c.fillStyle = 'rgba(210,232,244,0.1)';
      c.fillRect(0, 0, W, H);
    }
  }

  function draw() {
    const key = seasonOf(S.day).id + (isSnowy() ? '-snow' : '');
    if (groundDirty || key !== groundKey) drawGround();
    const c = ctx;
    const ox = camOx(), oy = camOy();
    c.clearRect(0, 0, canvas.width, canvas.height);
    c.drawImage(ground, ox, oy, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
    c.save();
    c.translate(-ox, -oy);
    drawWater(c);
    // crops, but only the ones you can see
    const x0 = Math.max(0, Math.floor(UI.cam.x) - 1), x1 = Math.min(COLS, Math.ceil(UI.cam.x + VIEW_W) + 1);
    const y0 = Math.max(0, Math.floor(UI.cam.y) - 1), y1 = Math.min(ROWS, Math.ceil(UI.cam.y + VIEW_H) + 1);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const p = S.plots[idx(x, y)];
      if (p && p.stage > 0) drawCrop(c, x, y, p);
    }
    // campfire
    const fx = CAMP.x * TILE + 16, fy = CAMP.y * TILE + 18;
    if (!isDay()) {
      const fl = 1 + Math.sin(clockT * 12) * 0.2;
      c.fillStyle = '#ff9a3a'; c.beginPath(); c.moveTo(fx - 5, fy + 2); c.lineTo(fx, fy - 10 * fl); c.lineTo(fx + 5, fy + 2); c.fill();
      c.fillStyle = '#ffe07a'; c.beginPath(); c.moveTo(fx - 2, fy + 2); c.lineTo(fx, fy - 5 * fl); c.lineTo(fx + 2, fy + 2); c.fill();
    } else { c.fillStyle = '#3a2c22'; c.fillRect(fx - 5, fy, 10, 3); }
    if (UI.sel && UI.sel.kind === 'farm') {
      const f = farmOf(UI.sel.id);
      if (f) selRect(c, f.x * TILE, f.y * TILE, f.w * TILE, f.h * TILE);
    }
    const night = nightAlpha() > 0.25;
    const things = [];
    for (const b of S.buildings) things.push({ y: (b.y + b.h) * TILE, draw: () => drawBuilding(c, b, night) });
    for (const v of S.villagers) things.push({ y: v.py * TILE + 6, draw: () => drawVillager(c, v) });
    for (const t of TREES) {
      if (t.x < x0 - 1 || t.x > x1 || t.y < y0 - 1 || t.y > y1) continue;
      things.push({ y: t.y * TILE + 28, draw: () => drawTree(c, t) });
    }
    things.sort((a, b) => a.y - b.y);
    for (const t of things) t.draw();
    drawPreview(c);
    // night
    const a = nightAlpha();
    if (a > 0) {
      c.fillStyle = `rgba(20, 28, 62, ${a})`;
      c.fillRect(ox, oy, canvas.width, canvas.height);
      if (a > 0.25) {
        for (const b of S.buildings) {
          if (BUILDINGS[b.type].pen) continue;
          const px = b.x * TILE, py = b.y * TILE, w = b.w * TILE, h = b.h * TILE;
          const g = c.createRadialGradient(px + w / 2, py + h * 0.7, 4, px + w / 2, py + h * 0.7, w * 0.95);
          g.addColorStop(0, 'rgba(255,208,118,0.38)'); g.addColorStop(1, 'rgba(255,208,118,0)');
          c.fillStyle = g; c.fillRect(px - w / 2, py - h / 2, w * 2, h * 2);
        }
        const g = c.createRadialGradient(fx, fy - 4, 4, fx, fy - 4, 64);
        g.addColorStop(0, 'rgba(255,170,80,0.5)'); g.addColorStop(1, 'rgba(255,170,80,0)');
        c.fillStyle = g; c.fillRect(fx - 64, fy - 68, 128, 128);
      }
    }
    drawFloats(c);
    c.restore();
    drawWeather(c);
    drawEdges(c);
  }

  // The arrows in the gutter. Hovering shows them; holding the button walks the camera.
  function drawEdges(c) {
    const e = UI.edge;
    if (!e) return;
    const W = canvas.width, H = canvas.height;
    const m = UI.mouse || { sx: W / 2, sy: H / 2 };
    const x = e.dx < 0 ? 22 : e.dx > 0 ? W - 22 : clamp(m.sx, 40, W - 40);
    const y = e.dy < 0 ? 22 : e.dy > 0 ? H - 22 : clamp(m.sy, 40, H - 40);
    const pulse = UI.panning ? 1 : 0.62 + 0.16 * Math.sin(clockT * 5);
    c.save();
    c.translate(x, y);
    c.rotate(Math.atan2(e.dy, e.dx));
    c.fillStyle = `rgba(20,24,30,${0.4 * pulse})`;
    c.beginPath(); c.arc(0, 0, 15, 0, Math.PI * 2); c.fill();
    c.fillStyle = `rgba(240,236,228,${pulse})`;
    c.beginPath();
    c.moveTo(7, 0); c.lineTo(-4, -7); c.lineTo(-1.5, 0); c.lineTo(-4, 7);
    c.closePath(); c.fill();
    c.restore();
    // a soft wash along whichever sides are live
    const wash = (gx0, gy0, gx1, gy1, w, h, ax, ay) => {
      const g = c.createLinearGradient(gx0, gy0, gx1, gy1);
      g.addColorStop(0, `rgba(255,255,255,${0.11 * pulse})`); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(ax, ay, w, h);
    };
    if (e.dx < 0) wash(0, 0, EDGE, 0, EDGE, H, 0, 0);
    if (e.dx > 0) wash(W, 0, W - EDGE, 0, EDGE, H, W - EDGE, 0);
    if (e.dy < 0) wash(0, 0, 0, EDGE, W, EDGE, 0, 0);
    if (e.dy > 0) wash(0, H, 0, H - EDGE, W, EDGE, 0, H - EDGE);
  }

  function drawPreview(c) {
    const hv = UI.hover;
    if (!hv || UI.edge) return;
    if (UI.tool === 'farm' && UI.drag) {
      const x = Math.min(UI.drag.x0, hv.x), y = Math.min(UI.drag.y0, hv.y), w = Math.abs(hv.x - UI.drag.x0) + 1, h = Math.abs(hv.y - UI.drag.y0) + 1;
      const ok = rectFree(x, y, w, h);
      c.fillStyle = ok ? 'rgba(224,164,88,0.35)' : 'rgba(224,108,95,0.4)';
      c.fillRect(x * TILE, y * TILE, w * TILE, h * TILE);
      c.strokeStyle = ok ? '#e0a458' : '#e06c5f'; c.lineWidth = 2; c.strokeRect(x * TILE + 1, y * TILE + 1, w * TILE - 2, h * TILE - 2);
      label(c, `${w}×${h} · ${w * h * FARM_COST} coins`, x * TILE + 4, y * TILE - 6);
    } else if (UI.tool === 'path' && UI.drag) {
      const tiles = pathTiles(UI.drag.x0, UI.drag.y0, hv.x, hv.y);
      let n = 0;
      for (const t of tiles) {
        const ok = S.kind[idx(t.x, t.y)] === 'g' && !S.occ[idx(t.x, t.y)];
        if (ok) n++;
        c.fillStyle = ok ? 'rgba(195,160,109,0.7)' : 'rgba(224,108,95,0.3)';
        c.fillRect(t.x * TILE + 2, t.y * TILE + 2, TILE - 4, TILE - 4);
      }
      label(c, `${n} tiles · ${n * PATH_COST} coins`, hv.x * TILE + 4, hv.y * TILE - 6);
    } else if (BUILDINGS[UI.tool]) {
      const d = BUILDINGS[UI.tool];
      const ok = rectFree(hv.x, hv.y, d.w, d.h);
      c.fillStyle = ok ? 'rgba(224,164,88,0.3)' : 'rgba(224,108,95,0.4)';
      c.fillRect(hv.x * TILE, hv.y * TILE, d.w * TILE, d.h * TILE);
      if (ok) {
        // The ghost borrows the real pen renderer, so its animals need re-scattering
        // whenever it moves — their positions are in world coordinates.
        const key = `${UI.tool}:${hv.x},${hv.y}`;
        if (UI.ghostKey !== key) { delete HERDS[-1]; UI.ghostKey = key; }
        c.save(); c.globalAlpha = 0.72;
        const ghost = { id: -1, type: UI.tool, x: hv.x, y: hv.y, w: d.w, h: d.h, residents: [], in: 0, stock: 0, herd: 2, feed: 0, ready: 0 };
        drawBuilding(c, ghost, false);
        c.restore();
      }
      c.strokeStyle = ok ? '#e0a458' : '#e06c5f'; c.lineWidth = 2;
      c.strokeRect(hv.x * TILE + 1, hv.y * TILE + 1, d.w * TILE - 2, d.h * TILE - 2);
      label(c, `${d.name} · ${d.cost} coins`, hv.x * TILE + 2, hv.y * TILE - 6);
    } else if (UI.tool === 'move' && UI.moving) {
      const b = building(UI.moving);
      if (b) {
        const ok = rectFree(hv.x, hv.y, b.w, b.h, b.id);
        c.fillStyle = ok ? 'rgba(224,164,88,0.35)' : 'rgba(224,108,95,0.4)';
        c.fillRect(hv.x * TILE, hv.y * TILE, b.w * TILE, b.h * TILE);
        c.strokeStyle = ok ? '#e0a458' : '#e06c5f'; c.lineWidth = 2; c.setLineDash([5, 3]);
        c.strokeRect(hv.x * TILE + 1, hv.y * TILE + 1, b.w * TILE - 2, b.h * TILE - 2);
        c.setLineDash([]);
        label(c, `Move the ${BUILDINGS[b.type].name.toLowerCase()} here · ${moveFee(b.type)} coins`, hv.x * TILE + 2, hv.y * TILE - 6);
      }
    } else if (UI.tool === 'demolish') {
      c.strokeStyle = '#e06c5f'; c.lineWidth = 2; c.strokeRect(hv.x * TILE + 1, hv.y * TILE + 1, TILE - 2, TILE - 2);
    }
  }
  function label(c, text, x, y) {
    c.font = 'bold 11px ui-sans-serif, system-ui, sans-serif';
    const w = c.measureText(text).width + 10;
    const yy = Math.max(camOy() + 13, y);
    const xx = Math.min(x, camOx() + canvas.width - w - 2);
    c.fillStyle = 'rgba(22,26,31,0.88)';
    c.fillRect(xx, yy - 12, w, 16);
    c.fillStyle = '#f0ece4'; c.fillText(text, xx + 5, yy);
  }

  // ---------------------------------------------------------------- minimap
  const mini = document.getElementById('mini');
  const mctx = mini ? mini.getContext('2d') : null;
  const MINI_S = 4;
  if (mini) { mini.width = COLS * MINI_S; mini.height = ROWS * MINI_S; }
  function drawMini() {
    if (!mctx) return;
    const c = mctx;
    const snow = isSnowy();
    const sn = seasonOf(S.day);
    c.fillStyle = snow ? '#dbe3e7' : sn.grass[0];
    c.fillRect(0, 0, mini.width, mini.height);
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const k = S.kind[idx(x, y)];
      let col = null;
      if (k === 'w') col = snow ? '#c6d4dd' : '#3f6d8a';
      else if (k === 't') col = snow ? '#6d7a72' : sn.leaf;
      else if (k === 's') col = '#8d8b86';
      else if (k === 'p') col = snow ? '#ddd6c8' : '#c3a06d';
      else if (k === 'r') col = snow ? '#c9c0b2' : '#a8865a';
      else if (k === 'f') col = snow ? '#8d8377' : sn.soil;
      if (col) { c.fillStyle = col; c.fillRect(x * MINI_S, y * MINI_S, MINI_S, MINI_S); }
    }
    for (const b of S.buildings) {
      const def = BUILDINGS[b.type];
      c.fillStyle = def.pen ? '#c9a86a' : STYLES[b.type].roof;
      c.fillRect(b.x * MINI_S, b.y * MINI_S, b.w * MINI_S, b.h * MINI_S);
    }
    for (const v of S.villagers) {
      if (v.hidden) continue;
      c.fillStyle = v.shirt;
      c.fillRect(Math.round(v.px * MINI_S) - 1, Math.round(v.py * MINI_S) - 1, 3, 3);
    }
    c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 1.5;
    c.strokeRect(UI.cam.x * MINI_S + 0.75, UI.cam.y * MINI_S + 0.75, VIEW_W * MINI_S - 1.5, VIEW_H * MINI_S - 1.5);
    c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineWidth = 1;
    c.strokeRect(UI.cam.x * MINI_S + 2, UI.cam.y * MINI_S + 2, VIEW_W * MINI_S - 4, VIEW_H * MINI_S - 4);
  }

  // ------------------------------------------------------------ input
  function screenFromEvent(e) {
    const r = canvas.getBoundingClientRect();
    return { sx: (e.clientX - r.left) / r.width * canvas.width, sy: (e.clientY - r.top) / r.height * canvas.height };
  }
  function tileAt(sx, sy) {
    const x = Math.floor((sx + camOx()) / TILE), y = Math.floor((sy + camOy()) / TILE);
    return inb(x, y) ? { x, y } : null;
  }
  function pointAt(sx, sy) { return { x: (sx + camOx()) / TILE, y: (sy + camOy()) / TILE }; }

  // Which way the gutter under the pointer would walk the camera, or null if it would not.
  function edgeAt(sx, sy) {
    if (sx < 0 || sy < 0 || sx > canvas.width || sy > canvas.height) return null;
    let dx = 0, dy = 0;
    if (sx < EDGE) dx = -1; else if (sx > canvas.width - EDGE) dx = 1;
    if (sy < EDGE) dy = -1; else if (sy > canvas.height - EDGE) dy = 1;
    if (dx < 0 && UI.cam.x <= 0.001) dx = 0;
    if (dx > 0 && UI.cam.x >= camMaxX() - 0.001) dx = 0;
    if (dy < 0 && UI.cam.y <= 0.001) dy = 0;
    if (dy > 0 && UI.cam.y >= camMaxY() - 0.001) dy = 0;
    return (dx || dy) ? { dx, dy } : null;
  }
  const EDGE_CURSOR = {
    '-1,0': 'w-resize', '1,0': 'e-resize', '0,-1': 'n-resize', '0,1': 's-resize',
    '-1,-1': 'nw-resize', '1,-1': 'ne-resize', '-1,1': 'sw-resize', '1,1': 'se-resize',
  };
  function refreshEdge() {
    if (!UI.mouse) { UI.edge = null; }
    else if (!UI.drag) UI.edge = edgeAt(UI.mouse.sx, UI.mouse.sy);
    canvas.style.cursor = UI.edge ? (EDGE_CURSOR[`${UI.edge.dx},${UI.edge.dy}`] || 'move') : '';
    if (!UI.edge) UI.panning = false;
  }

  canvas.addEventListener('pointerdown', (e) => {
    const { sx, sy } = screenFromEvent(e);
    UI.mouse = { sx, sy };
    // middle button drags the whole plot about, for anyone who would rather not use the gutter
    if (e.button === 1) { e.preventDefault(); UI.freeDrag = { sx, sy, cx: UI.cam.x, cy: UI.cam.y }; canvas.setPointerCapture(e.pointerId); return; }
    UI.edge = edgeAt(sx, sy);
    if (UI.edge) { e.preventDefault(); UI.panning = true; canvas.setPointerCapture(e.pointerId); return; }
    const t = tileAt(sx, sy);
    if (!t) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    UI.hover = t;
    if (UI.tool === 'farm' || UI.tool === 'path') { UI.drag = { x0: t.x, y0: t.y }; return; }
    if (BUILDINGS[UI.tool]) { placeBuilding(UI.tool, t.x, t.y); return; }
    if (UI.tool === 'move') { if (UI.moving) moveBuilding(UI.moving, t.x, t.y); else setTool('select'); return; }
    if (UI.tool === 'demolish') { if (!demolishAt(t.x, t.y)) setHint('Nothing to clear there.'); return; }
    // select
    const p = pointAt(sx, sy);
    let best = null, bd = 0.7;
    for (const v of S.villagers) { if (v.hidden) continue; const d = Math.hypot(v.px - p.x, v.py - p.y + 0.3); if (d < bd) { bd = d; best = v; } }
    if (best) { UI.sel = { kind: 'villager', id: best.id }; return; }
    const bid = S.occ[idx(t.x, t.y)];
    if (bid) { UI.sel = { kind: 'building', id: bid }; return; }
    if (S.kind[idx(t.x, t.y)] === 'f') { UI.sel = { kind: 'farm', id: S.plots[idx(t.x, t.y)].farm }; return; }
    UI.sel = null;
  });
  canvas.addEventListener('pointermove', (e) => {
    const { sx, sy } = screenFromEvent(e);
    UI.mouse = { sx, sy };
    if (UI.freeDrag) {
      UI.cam.x = clamp(UI.freeDrag.cx - (sx - UI.freeDrag.sx) / TILE, 0, camMaxX());
      UI.cam.y = clamp(UI.freeDrag.cy - (sy - UI.freeDrag.sy) / TILE, 0, camMaxY());
      return;
    }
    if (!UI.panning) refreshEdge();
    UI.hover = tileAt(sx, sy);
  });
  canvas.addEventListener('pointerleave', () => { if (!UI.drag && !UI.panning) { UI.hover = null; UI.mouse = null; UI.edge = null; canvas.style.cursor = ''; } });
  canvas.addEventListener('pointerup', (e) => {
    UI.freeDrag = null;
    if (UI.panning) { UI.panning = false; refreshEdge(); return; }
    const { sx, sy } = screenFromEvent(e);
    const t = tileAt(sx, sy) || UI.hover;
    if (UI.drag && t) {
      if (UI.tool === 'farm') placeFarm(UI.drag.x0, UI.drag.y0, t.x, t.y);
      else if (UI.tool === 'path') placePath(UI.drag.x0, UI.drag.y0, t.x, t.y);
    }
    UI.drag = null;
  });
  canvas.addEventListener('pointercancel', () => { UI.drag = null; UI.panning = false; UI.freeDrag = null; });
  canvas.addEventListener('auxclick', (e) => { if (e.button === 1) e.preventDefault(); });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  const PAN_KEYS = {
    ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
    a: [-1, 0], d: [1, 0], w: [0, -1], s: [0, 1],
  };
  document.addEventListener('keydown', (e) => {
    if (e.target !== document.body) return;
    const k = PAN_KEYS[e.key] || PAN_KEYS[e.key.toLowerCase && e.key.toLowerCase()];
    if (k) { e.preventDefault(); UI.keyPan.x = k[0] || UI.keyPan.x; UI.keyPan.y = k[1] || UI.keyPan.y; return; }
    if (e.key === 'Escape') { setTool('select'); UI.sel = null; }
    if (e.key === ' ') { e.preventDefault(); setSpeed(UI.speed ? 0 : 1); }
  });
  document.addEventListener('keyup', (e) => {
    const k = PAN_KEYS[e.key] || PAN_KEYS[e.key.toLowerCase && e.key.toLowerCase()];
    if (!k) return;
    if (k[0]) UI.keyPan.x = 0;
    if (k[1]) UI.keyPan.y = 0;
  });
  window.addEventListener('blur', () => { UI.keyPan.x = 0; UI.keyPan.y = 0; UI.panning = false; });

  if (mini) {
    const jump = (e) => {
      const r = mini.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width * COLS, y = (e.clientY - r.top) / r.height * ROWS;
      centreCamera(x, y);
    };
    mini.addEventListener('pointerdown', (e) => { e.preventDefault(); mini.setPointerCapture(e.pointerId); mini.dragging = true; jump(e); });
    mini.addEventListener('pointermove', (e) => { if (mini.dragging) jump(e); });
    mini.addEventListener('pointerup', () => { mini.dragging = false; });
  }

  function panCamera(dt) {
    let dx = UI.keyPan.x, dy = UI.keyPan.y;
    if (UI.panning && UI.edge) { dx += UI.edge.dx; dy += UI.edge.dy; }
    if (!dx && !dy) return;
    const n = Math.hypot(dx, dy) || 1;
    UI.cam.x = clamp(UI.cam.x + dx / n * PAN_SPEED * dt, 0, camMaxX());
    UI.cam.y = clamp(UI.cam.y + dy / n * PAN_SPEED * dt, 0, camMaxY());
    if (UI.mouse) UI.hover = tileAt(UI.mouse.sx, UI.mouse.sy);
  }

  // ------------------------------------------------------------ UI
  const $ = (id) => document.getElementById(id);
  const toolbar = $('toolbar'), panel = $('panel'), hintEl = $('hint'), statsEl = $('stats'), clockEl = $('clock'), overlay = $('overlay');
  let hintTimer = 0;

  function setHint(text, bad) {
    hintEl.textContent = text;
    hintEl.classList.toggle('bad', !!bad);
    hintTimer = 4;
  }
  function defaultHint() {
    if (UI.tool === 'move' && UI.moving) {
      const b = building(UI.moving);
      if (b) return `Click where the ${BUILDINGS[b.type].name.toLowerCase()} should stand. ${moveFee(b.type)} coins. Escape leaves it where it is.`;
    }
    if (!firstOf('store')) return 'Start with a storehouse, then drag out a farm. The villagers will do the rest.';
    if (!S.farms.length) return 'Drag across the grass with the Farm tool to lay out your first field.';
    if (!firstOf('house')) return 'Villagers sleeping rough by the fire wake up tired. A house has two beds.';
    if (!firstOf('shop')) return 'Nobody has had supper yet. A shop takes food from the storehouse and sells it to the villagers.';
    return TOOLS.find(t => t.id === UI.tool).hint;
  }

  function setTool(id) {
    if (id !== 'move') UI.moving = null;
    UI.tool = id;
    for (const b of toolbar.querySelectorAll('button[data-tool]')) b.classList.toggle('on', b.dataset.tool === id);
    setHint(TOOLS.find(t => t.id === id).hint);
  }
  function setSpeed(n) {
    UI.speed = n;
    for (const b of document.querySelectorAll('[data-speed]')) b.classList.toggle('on', Number(b.dataset.speed) === n);
  }

  // Every tool draws its own picture, using the same routines the map does, so the
  // toolbar is a row of small buildings rather than a row of words.
  const ICONS = {};
  function toolIcon(id) {
    if (ICONS[id]) return ICONS[id];
    const def = BUILDINGS[id];
    const w = (def ? def.w : 2) * TILE, h = (def ? def.h : 2) * TILE;
    const cv = document.createElement('canvas');
    cv.width = w + 10; cv.height = h + 12;
    const c = cv.getContext('2d');
    c.translate(5, 8);
    if (def) {
      const ghost = {
        id: -1000 - Object.keys(ICONS).length, type: id, x: 0, y: 0, w: def.w, h: def.h,
        residents: [{}], in: 4, made: 0, stock: 8, herd: Math.min(3, def.pen ? def.pen.cap : 0),
        feed: 7, ready: 4, prog: 0, state: '',
      };
      drawBuilding(c, ghost, false);
    } else if (id === 'farm') {
      c.fillStyle = '#6b4a2e'; c.fillRect(0, 8, w, h - 8);
      c.fillStyle = '#5a3d25'; for (let r = 0; r < 5; r++) c.fillRect(0, 11 + r * 8, w, 3);
      c.fillStyle = '#5fa04a';
      for (let i = 0; i < 5; i++) { const x = 8 + i * 12, y = 20 + (i % 2) * 9; c.fillRect(x, y, 2, 8); c.fillRect(x - 3, y + 2, 2, 5); c.fillRect(x + 3, y + 2, 2, 5); }
      c.strokeStyle = '#8b6b3e'; c.lineWidth = 2; c.strokeRect(1, 9, w - 2, h - 10);
    } else if (id === 'path') {
      c.fillStyle = '#5f9a4d'; c.fillRect(0, 4, w, h - 4);
      c.fillStyle = '#c3a06d';
      c.beginPath(); c.moveTo(10, h); c.lineTo(24, h); c.lineTo(w - 8, 10); c.lineTo(w - 22, 10); c.closePath(); c.fill();
      c.fillStyle = 'rgba(0,0,0,0.1)';
      for (let i = 0; i < 4; i++) c.fillRect(16 + i * 9, h - 10 - i * 10, 6, 3);
    } else if (id === 'select') {
      c.fillStyle = '#5f9a4d'; c.fillRect(0, 4, w, h - 4);
      c.fillStyle = 'rgba(255,255,255,0.85)';
      c.beginPath(); c.moveTo(20, 14); c.lineTo(20, 44); c.lineTo(28, 36); c.lineTo(34, 47); c.lineTo(39, 44); c.lineTo(33, 34); c.lineTo(43, 33); c.closePath(); c.fill();
      c.strokeStyle = 'rgba(30,24,18,0.8)'; c.lineWidth = 1.6; c.stroke();
    } else if (id === 'demolish') {
      c.fillStyle = '#5f9a4d'; c.fillRect(0, 4, w, h - 4);
      c.strokeStyle = '#e06c5f'; c.lineWidth = 6; c.lineCap = 'round';
      c.beginPath(); c.moveTo(16, 18); c.lineTo(w - 16, h - 10); c.moveTo(w - 16, 18); c.lineTo(16, h - 10); c.stroke();
      c.lineCap = 'butt';
    }
    return (ICONS[id] = cv.toDataURL());
  }

  function renderToolbar() {
    toolbar.innerHTML = TOOL_GROUPS.map((g) => `<div class="tgroup">${g.name ? `<span class="tglabel">${g.name}</span>` : ''}<div class="trow">${
      g.tools.map((id) => {
        const t = TOOLS.find((x) => x.id === id);
        if (!t || t.hidden) return '';
        return `<button type="button" data-tool="${id}" class="${id === UI.tool ? 'on' : ''}" title="${t.hint.replace(/"/g, '&quot;')}">
          <img src="${toolIcon(id)}" alt="" />
          <span>${t.label}</span>${t.cost !== undefined ? `<small>${t.cost}</small>` : '<small>&nbsp;</small>'}</button>`;
      }).join('')
    }</div></div>`).join('');
  }
  toolbar.addEventListener('click', (e) => { const b = e.target.closest('button[data-tool]'); if (b) setTool(b.dataset.tool); });

  function renderStats() {
    const beds = totalBeds(), pop = S.villagers.length;
    const food = shopStock();
    const tired = S.villagers.filter(v => v.energy < 35).length;
    const sn = seasonOf(S.day);
    clockEl.innerHTML = `<b class="s-${sn.id}">${sn.name} ${dayOfSeason(S.day)}</b> · year ${yearOf(S.day)} · ${String(Math.floor(S.hour)).padStart(2, '0')}:${String(Math.floor((S.hour % 1) * 60)).padStart(2, '0')}${isDay() ? '' : ' · night'} · ${weatherOf().name.toLowerCase()}`;
    statsEl.innerHTML = [
      `<span class="stat"><b>${S.coins}</b><span class="lbl">coins</span><span class="meter" title="Goal: ${GOAL} coins"><i style="width:${Math.min(100, S.coins / GOAL * 100)}%"></i></span></span>`,
      `<span class="stat ${pop > beds ? 'low' : ''}" title="Villagers and beds"><b>${pop}</b><span class="lbl">villagers</span><span class="cap">/ ${beds} beds</span></span>`,
      `<span class="stat ${food < pop ? 'low' : ''}" title="Food on the shop shelves"><b>${food}</b><span class="lbl">in the shop</span></span>`,
      tired ? `<span class="stat low"><b>${tired}</b><span class="lbl">tired</span></span>` : '',
    ].join('');
  }

  function panelKey() {
    // The day, the weather and this morning's notice are all on the plot panel, so a new
    // morning has to redraw it even when nothing has been built.
    const nt = S.notice;
    return `${UI.sel ? UI.sel.kind + ':' + UI.sel.id : 'none'}|${UI.structure}|${S.day}|${S.weather}|${nt ? nt.id + (nt.taken ? '!' : '') + (nt.offer ? '?' : '') : '-'}`;
  }

  function goodRow(g) {
    return `<tr>
      <td><i class="sw" style="background:${GOODS[g].color}"></i>${GOODS[g].name}</td>
      <td class="num" data-live="store-${g}"></td>
      <td class="price">${GOODS[g].price}c</td>
      <td class="acts"><button type="button" data-sell="${g}" data-n="10">10</button><button type="button" data-sell="${g}" data-n="all">all</button></td>
      <td><button type="button" class="tog ${S.policy[g] ? 'on' : ''}" data-policy="${g}" title="Sell everything left on this shelf each evening">${S.policy[g] ? 'auto' : 'keep'}</button></td>
    </tr>`;
  }

  function renderPanel() {
    const key = panelKey();
    if (key === UI.panelKey) return updateLive();
    UI.panelKey = key;
    let html = '';
    const sel = UI.sel;
    if (sel && sel.kind === 'villager') {
      const v = S.villagers.find(o => o.id === sel.id);
      if (!v) { UI.sel = null; return renderPanel(); }
      const home = v.home ? 'Has a bed' : 'Sleeps rough by the fire';
      html = `<h2><i class="dot" style="background:${v.shirt}"></i>${v.name}</h2>
        <p class="muted">${home} · here ${plural(v.days, 'day')}</p>
        <div class="row"><span>Energy</span><div class="bar"><span data-live="energy"></span></div></div>
        <div class="row"><span>Hunger</span><span data-live="hunger"></span></div>
        <div class="row"><span>Working at</span><span data-live="eff"></span></div>
        <p class="doing" data-live="task"></p>
        <p class="muted small">Tired villagers work slowly. A bed restores most of their energy overnight; the campfire much less. Missing supper makes it worse.</p>
        <p class="muted small">Nobody starves here. A villager who missed supper eats one of everything they pick, so a hungry village quietly loses part of its harvest until the shop is stocked again.</p>`;
    } else if (sel && sel.kind === 'farm') {
      const f = farmOf(sel.id);
      if (!f) { UI.sel = null; return renderPanel(); }
      html = `<h2>Farm <span class="muted">${f.w}×${f.h}</span></h2>
        <p class="muted" data-live="farm"></p>
        <h3>Crop</h3>
        <div class="options">${Object.entries(CROPS).map(([id, c]) => `<button type="button" class="option ${f.crop === id ? 'on' : ''}" data-crop="${id}"><span class="opt-label"><i class="sw" style="background:${GOODS[id].color}"></i>${c.name} <em>${Math.round(c.grow / 24 * 10) / 10} day${c.grow === 24 ? '' : 's'} · ${c.yield}/tile · ${c.price} coins each${c.food ? '' : ' · not food'}</em></span><span class="opt-text">${c.blurb}</span></button>`).join('')}</div>
        <p class="muted small">Changing crop only affects tiles sown from now on. Growing tiles finish what they started.</p>
        <button type="button" class="danger" data-demolish-farm="${f.id}">Plough it under (+${Math.floor(f.w * f.h * FARM_COST / 2)} coins)</button>`;
    } else if (sel && sel.kind === 'building') {
      const b = building(sel.id);
      if (!b) { UI.sel = null; return renderPanel(); }
      const def = BUILDINGS[b.type];
      html = `<h2>${def.name}</h2><p class="muted">${def.blurb}</p>`;
      if (b.type === 'store') {
        html += GOOD_GROUPS.map((grp) => `<h3>${grp.name}</h3><table class="inv">${grp.goods.map(goodRow).join('')}</table>`).join('');
        html += `<p class="muted small">Villagers carry everything here and take it out again as it is needed: wheat to the workshops and the troughs, the cheapest food to the shop. <b>auto</b> sells whatever is left on that shelf every evening; <b>keep</b> holds it back.</p>`;
      } else if (def.craft) {
        const cr = def.craft;
        html += `<div class="row"><span>${GOODS[cr.from].name} inside</span><b data-live="cin"></b></div>
          <div class="row"><span>Recipe</span><b>${cr.need} ${GOODS[cr.from].name.toLowerCase()} &rarr; ${cr.make} ${GOODS[cr.to].name.toLowerCase()}</b></div>
          <div class="row"><span>Made so far</span><b data-live="cmade"></b></div>
          <p class="doing" data-live="cstatus"></p>`;
      } else if (def.pen) {
        const pen = def.pen;
        const a = STOCK[pen.animal];
        html += `<div class="row"><span>In the ${def.name.toLowerCase()}</span><b data-live="pherd"></b></div>
          <div class="row"><span>In the trough</span><b data-live="pfeed"></b></div>
          <div class="row"><span>Waiting to be carried in</span><b data-live="pready"></b></div>
          <div class="row"><span>Eats</span><b>${pen.feed.map((g) => GOODS[g].name.toLowerCase()).join(', ')}</b></div>
          <div class="row"><span>Gives</span><b>${pen.yieldPer} ${GOODS[pen.produce].name.toLowerCase()} per ${pen.feedPer === 1 ? 'feed' : pen.feedPer + ' feed'}</b></div>
          <div class="row"><span>Made altogether</span><b data-live="pmade"></b></div>
          <p class="doing" data-live="pstatus"></p>
          <div class="btns">
            <button type="button" class="link half" data-buy="${b.id}"${b.herd >= pen.cap ? ' disabled' : ''}>Buy a ${a.name.toLowerCase()} (${a.price}c)</button>
            <button type="button" class="danger half" data-sella="${b.id}"${b.herd <= 0 ? ' disabled' : ''}>Sell one (+${Math.floor(a.price / 2)}c)</button>
          </div>
          <p class="muted small">Room for ${plural(pen.cap, a.name.toLowerCase())}. A pen with a full trough overnight tends to be one animal heavier in the morning.${pen.graze ? ' Sheep feed themselves off the grass from spring to autumn, at half the yield.' : ''}${pen.feed.some((g) => GOODS[g].food) ? ' Nobody will tip food into a trough while the shop is short.' : ''}</p>`;
      } else if (b.type === 'shop') {
        html += `<div class="row"><span>Food on the shelves</span><b data-live="sstock"></b></div>
          <div class="row"><span>Room for</span><b>${SHOP_CAP}</b></div>
          <div class="row"><span>Suppers sold so far</span><b data-live="ssold"></b></div>
          <p class="doing" data-live="sstatus"></p>
          <p class="muted small"><b>The shop does not stock itself.</b> A villager walks food over from the storehouse a load at a time, cheapest food first, and drops everything else to do it when the shelves will not cover supper.</p>
          <p class="muted small">Each villager buys one supper at ${WORK_END}:00 for ${SUPPER_PRICE} coins. Newcomers only settle when the shop holds enough for everyone.</p>`;
      } else if (b.type === 'house') {
        const names = b.residents.map(id => S.villagers.find(v => v.id === id)).filter(Boolean).map(v => v.name);
        html += `<div class="row"><span>Sleeping here</span><b>${names.length ? names.join(' and ') : 'nobody yet'}</b></div><div class="row"><span>Free beds</span><b>${def.beds - b.residents.length}</b></div>`;
      }
      html += `<button type="button" class="link" data-move="${b.id}">Move it (${moveFee(b.type)} coins)</button>
        <button type="button" class="danger" data-demolish-b="${b.id}">Pull it down (+${Math.floor(def.cost / 2)} coins)</button>`;
    } else {
      const store = firstOf('store');
      const sn = seasonOf(S.day), wx = weatherOf();
      const nt = S.notice;
      const pens = S.buildings.filter((b) => BUILDINGS[b.type].pen);
      html = `<h2>The plot</h2>
        <p class="muted">Reach <b>${GOAL} coins</b> to buy the freehold. ${S.won ? 'Done. Keep going as long as you like.' : ''}</p>
        <div class="season s-${sn.id}">
          <div class="row"><span>${sn.name}, day ${dayOfSeason(S.day)} of ${DAYS_PER_SEASON}</span><b>year ${yearOf(S.day)}</b></div>
          <p class="small">${sn.note}</p>
          <div class="row"><span>Outside</span><b>${wx.name}</b></div>
          <p class="small muted">${wx.note} Things in the ground are moving at <b>${Math.round(growthRate() * 100)}%</b> of the usual.</p>
        </div>
        ${nt ? `<div class="notice-card${nt.kind ? ' n-' + nt.kind : ''}"><h3>This morning</h3><p>${nt.text}</p>${
          nt.offer && !nt.taken
            ? `<button type="button" data-notice="take"${nt.offer.cost > S.coins ? ' disabled' : ''}>${nt.offer.label}</button><button type="button" class="link inline" data-notice="pass">Let them go</button>`
            : ''}</div>` : ''}
        <div class="row"><span>Villagers</span><b data-live="pop"></b></div>
        <div class="row"><span>Beds</span><b data-live="beds"></b></div>
        <div class="row"><span>Farms</span><b data-live="farms"></b></div>
        <div class="row"><span>In the storehouse</span><b data-live="storetotal"></b></div>
        ${pens.length ? `<h3>The yard</h3><ul class="yard">${pens.map((b) => {
          const pen = BUILDINGS[b.type].pen;
          return `<li><button type="button" class="jump" data-jump="${b.id}"><i class="sw" style="background:${GOODS[pen.produce].color}"></i>${BUILDINGS[b.type].name}<em>${many(b.herd, pen.animal)}${b.ready ? ` · ${b.ready} waiting` : ''}${b.state === 'hungry' ? ' · trough empty' : ''}</em></button></li>`;
        }).join('')}</ul>` : ''}
        ${store ? `<button type="button" class="link" data-open-store="${store.id}">Open the storehouse</button>` : '<p class="small warn">No storehouse yet. Nothing can be harvested until there is one.</p>'}
        <h3>Notices</h3>
        <ul class="log">${S.log.slice(0, 8).map(l => `<li class="${l.kind}"><small>Day ${l.day}</small> ${l.text}</li>`).join('')}</ul>`;
    }
    panel.innerHTML = html;
    updateLive();
  }

  function updateLive() {
    const sel = UI.sel;
    const set = (k, val) => { const el = panel.querySelector(`[data-live="${k}"]`); if (el) { if (k === 'energy') el.style.width = val + '%'; else el.textContent = val; } };
    if (sel && sel.kind === 'villager') {
      const v = S.villagers.find(o => o.id === sel.id);
      if (!v) return;
      set('energy', Math.round(v.energy));
      const bar = panel.querySelector('.bar span'); if (bar) bar.className = v.energy < 25 ? 'crit' : v.energy < 50 ? 'low' : '';
      set('hunger', ['Fed', 'Missed supper', 'Hungry', 'Ravenous'][v.hunger]);
      set('eff', Math.round(eff(v) * 100) + '% pace');
      set('task', taskLabel(v));
    } else if (sel && sel.kind === 'farm') {
      const f = farmOf(sel.id);
      if (!f) return;
      let e = 0, g = 0, r = 0;
      for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) { const p = S.plots[idx(x, y)]; if (p.stage === 0) e++; else if (p.stage === 1) g++; else r++; }
      set('farm', `${e} bare · ${g} growing · ${r} ready to pick`);
    } else if (sel && sel.kind === 'building') {
      const b = building(sel.id);
      if (!b) return;
      const def = BUILDINGS[b.type];
      if (b.type === 'store') for (const g of GOOD_ORDER) set('store-' + g, S.store[g]);
      else if (def.craft) {
        const cr = def.craft;
        set('cin', b.in); set('cmade', b.made || 0);
        const busy = S.villagers.some(v => v.task && v.task.kind === 'craft' && v.task.phase === 1 && v.task.to === b.id);
        set('cstatus', busy ? `${cr.verb}.` : b.in >= cr.need ? 'Waiting for a pair of hands.' : S.store[cr.from] >= cr.need ? `Waiting for ${GOODS[cr.from].name.toLowerCase()} to be carried over.` : `No ${GOODS[cr.from].name.toLowerCase()}. Get some, and do not sell it all.`);
      } else if (def.pen) {
        const pen = def.pen;
        set('pherd', `${many(b.herd, pen.animal)} of ${pen.cap}`);
        set('pfeed', `${b.feed} of ${PEN_FEED_CAP}`);
        set('pready', `${b.ready} ${GOODS[pen.produce].name.toLowerCase()}`);
        set('pmade', `${b.made || 0} ${GOODS[pen.produce].name.toLowerCase()}`);
        const carrier = S.villagers.find(v => v.task && (v.task.kind === 'collect' || v.task.kind === 'haul') && v.task.to === b.id);
        set('pstatus',
          b.herd <= 0 ? 'Empty. Buy an animal and it starts again.'
            : carrier && carrier.task.kind === 'collect' ? `${carrier.name} is in the pen collecting.`
              : carrier ? `${carrier.name} is fetching ${GOODS[carrier.task.good].name.toLowerCase()} for the trough.`
                : b.state === 'full' ? 'Nothing more will fit until somebody carries it in.'
                  : b.state === 'hungry' ? 'The trough is empty and they are all looking at the gate.'
                    : b.state === 'grazing' ? 'Out on the grass, and doing well enough on it.'
                      : 'Working away.');
      } else if (b.type === 'shop') {
        set('sstock', b.stock); set('ssold', b.sold || 0);
        const carrier = S.villagers.find(v => v.task && v.task.kind === 'haul' && v.task.to === b.id);
        const good = cheapestFood();
        set('sstatus',
          carrier && carrier.carry ? `${carrier.name} is carrying ${carrier.carry.n} ${GOODS[carrier.carry.good].name.toLowerCase()} over.`
            : carrier ? `${carrier.name} has gone to the storehouse for ${GOODS[carrier.task.good].name.toLowerCase()}.`
              : b.stock >= SHOP_CAP ? 'The shelves are full.'
                : !firstOf('store') ? 'There is no storehouse to fetch from.'
                  : !good ? 'No food in the storehouse to carry over.'
                    : 'Nobody is free to fetch a load yet.');
      }
    } else {
      set('pop', S.villagers.length);
      set('beds', `${freeBeds()} free of ${totalBeds()}`);
      set('farms', S.farms.length);
      set('storetotal', GOOD_ORDER.filter(g => S.store[g] > 0).map(g => `${S.store[g]} ${GOODS[g].name.toLowerCase()}`).join(', ') || 'nothing');
    }
  }

  panel.addEventListener('click', (e) => {
    const nb = e.target.closest('button[data-notice]');
    if (nb) {
      if (nb.dataset.notice === 'take') takeNotice();
      else { S.notice.offer = null; renderPanel(); }
      return;
    }
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.crop) { const f = farmOf(UI.sel.id); if (f) { f.crop = b.dataset.crop; UI.structure++; log(`The farm will grow ${CROPS[f.crop].name.toLowerCase()} from now on.`); } }
    else if (b.dataset.sell) sell(b.dataset.sell, b.dataset.n === 'all' ? 'all' : Number(b.dataset.n));
    else if (b.dataset.policy) { S.policy[b.dataset.policy] = !S.policy[b.dataset.policy]; UI.structure++; }
    else if (b.dataset.demolishFarm) { const f = farmOf(Number(b.dataset.demolishFarm)); if (f) demolishAt(f.x, f.y); }
    else if (b.dataset.demolishB) { const bb = building(Number(b.dataset.demolishB)); if (bb) demolishAt(bb.x, bb.y); }
    else if (b.dataset.openStore) UI.sel = { kind: 'building', id: Number(b.dataset.openStore) };
    else if (b.dataset.buy) { const bb = building(Number(b.dataset.buy)); if (bb) buyAnimal(bb); }
    else if (b.dataset.sella) { const bb = building(Number(b.dataset.sella)); if (bb) sellAnimal(bb); }
    else if (b.dataset.jump) {
      const bb = building(Number(b.dataset.jump));
      if (bb) { centreCamera(bb.x + bb.w / 2, bb.y + bb.h / 2); UI.sel = { kind: 'building', id: bb.id }; }
    } else if (b.dataset.move) {
      const bb = building(Number(b.dataset.move));
      if (bb) {
        setTool('move');
        UI.moving = bb.id;
        setHint(`Click where the ${BUILDINGS[bb.type].name.toLowerCase()} should stand. ${moveFee(bb.type)} coins. Escape leaves it where it is.`);
      }
    }
    renderPanel();
  });

  document.querySelector('.topbar').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.speed !== undefined) setSpeed(Number(b.dataset.speed));
    if (b.dataset.action === 'help') showHelp();
    if (b.dataset.action === 'new-game') confirmNew();
  });

  // ------------------------------------------------------------ overlays
  function sheet(html) { overlay.innerHTML = `<div class="sheet">${html}</div>`; overlay.hidden = false; }
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.closest('[data-close]')) overlay.hidden = true;
    if (e.target.closest('[data-reset]')) {
      wipe(); newState();
      UI.sel = null; UI.structure++; groundDirty = true; overlay.hidden = true;
      for (const k of Object.keys(HERDS)) delete HERDS[k];
      setTool('select');
    }
  });
  function showHelp() {
    sheet(`<h2>How to play</h2>
      <p>You have an empty plot, three villagers and ${START_COINS} coins. The villagers work out what needs doing on their own; your job is to give them somewhere to do it.</p>
      <h3>Getting about</h3>
      <ul>
        <li>The plot is bigger than the window. Put the pointer in the <b>band at the edge</b>, an arrow appears, and <b>holding the button down</b> walks the camera that way. Arrow keys or WASD do the same, the middle button drags, and the little map under the tools jumps you anywhere.</li>
      </ul>
      <h3>The village</h3>
      <ul>
        <li><b>Storehouse first.</b> Everything the plot makes is carried there. Without one, nothing gets picked.</li>
        <li><b>Farms</b> are dragged out on the grass. Click a farm to choose its crop. Villagers sow, wait, harvest and carry.</li>
        <li><b>Paths</b> are cheap and villagers walk almost twice as fast on them. Run them between the fields, the yard and the storehouse.</li>
        <li><b>Houses</b> have two beds. At ${WORK_END}:00 everyone goes home; anyone without a bed sleeps by the fire and wakes up slow.</li>
        <li><b>Shop.</b> The shop is not stocked for you — a villager carries food over from the storehouse a load at a time. Every evening each villager buys one supper there.</li>
        <li><b>Trees and stones</b> can be cleared with the Clear tool for a few coins. The pond stays where it is.</li>
      </ul>
      <h3>The yard</h3>
      <ul>
        <li><b>Hen house, pigsty, cow byre and sheep fold.</b> Each comes with two animals. Villagers carry feed to the trough and carry the eggs, milk, wool and truffles back to the storehouse. A pen that goes to bed with a full trough is often one animal heavier by morning, up to what it will hold.</li>
        <li><b>Hens and cows eat wheat</b>, which is the best reason to grow it. <b>Pigs eat roots</b> — two of anything for one truffle — but nobody will tip food into a trough while the shop is short. <b>Sheep</b> graze from spring to autumn and only want hay when the ground goes hard.</li>
        <li><b>Workshops.</b> The <b>bakery</b> turns 2 wheat into 3 bread, the <b>dairy</b> turns 3 milk into 2 cheese, and the <b>weaver's</b> turns 3 fleeces into a bolt of cloth — the most valuable thing that ever leaves this plot.</li>
      </ul>
      <h3>The year</h3>
      <ul>
        <li>Four seasons of seven days. Spring is fast, summer steady, autumn slow, and almost nothing grows in winter — what is in the storehouse in November is what you have in January. Turnips barely notice the cold, and the animals do not stop at all.</li>
        <li><b>The weather</b> is rolled every morning on top of the season. Rain is good for the fields and hard on the boots; snow stops everything.</li>
        <li><b>A notice</b> turns up before work each morning. A few of them put a price on the table and give you until noon.</li>
      </ul>
      <h3>Money</h3>
      <ul>
        <li>Open the storehouse to sell anything by hand, or set a shelf to <b>auto</b> and the cart takes it every evening.</li>
        <li><b>Hunger.</b> Nobody starves in Furrow. A villager who missed supper works slowly and eats one of everything they harvest, so a hungry village quietly loses part of its crop until the shelves are full again.</li>
        <li><b>Second thoughts.</b> Click any building and <b>Move it</b> to roll it somewhere better for a quarter of what it cost. Everything inside comes along.</li>
      </ul>
      <p>Reach ${GOAL} coins to buy the freehold. Space pauses; Escape drops the tool.</p>
      <button type="button" class="primary" data-close>Back to the plot</button>`);
  }
  function confirmNew() {
    sheet(`<h2>Start over?</h2><p>This clears the plot, every villager on it and everything in the yard.</p>
      <div class="btns"><button type="button" class="primary" data-reset>Clear the plot</button><button type="button" class="ghost" data-close>Keep going</button></div>`);
  }
  function showWin() {
    const pens = S.buildings.filter((b) => BUILDINGS[b.type].pen);
    const head = pens.reduce((n, b) => n + b.herd, 0);
    sheet(`<h2>The freehold is yours</h2>
      <p>${S.coins} coins on day ${S.day}, with ${plural(S.villagers.length, 'villager')}, ${plural(S.farms.length, 'farm')}${head ? ` and ${plural(head, 'animal')} in the yard` : ''}. The plot is nobody's but yours now.</p>
      <p>You can keep building as long as you like.</p>
      <button type="button" class="primary" data-close>Keep farming</button>`);
  }

  // ------------------------------------------------------------ loop
  let last = performance.now(), uiT = 0, miniT = 0;
  function frame(now) {
    const raw = Math.max(0, Math.min(0.1, (now - last) / 1000));
    last = now;
    clockT += raw;
    refreshEdge();
    panCamera(raw);
    if (UI.speed && overlay.hidden) {
      const dt = raw * UI.speed;
      const steps = Math.max(1, Math.ceil(dt / 0.05));
      for (let i = 0; i < steps; i++) tick(dt / steps);
    }
    draw();
    uiT += raw;
    if (uiT > 0.2) {
      uiT = 0;
      renderStats(); renderPanel();
      if (hintTimer > 0 && (hintTimer -= 0.2) <= 0) { hintEl.textContent = defaultHint(); hintEl.classList.remove('bad'); }
    }
    miniT += raw;
    if (miniT > 0.12) { miniT = 0; drawMini(); }
    requestAnimationFrame(frame);
  }

  // ------------------------------------------------------------ boot
  if (!load()) newState();
  renderToolbar();
  setTool('select');
  renderStats();
  renderPanel();
  drawMini();
  hintEl.textContent = defaultHint();
  window.addEventListener('beforeunload', save);
  requestAnimationFrame(frame);

  // A few hooks for testing in the console.
  window.furrow = {
    get S() { return S; }, tick, placeBuilding, placeFarm, placePath, moveBuilding, demolishAt, sell, float,
    UI, CLAIMS, HERDS, SEASONS, WEATHER, NOTICES, CROPS, GOODS, BUILDINGS, STOCK, GOOD_ORDER,
    seasonOf, yearOf, dayOfSeason, weatherOf, growthRate, rollWeather, rollNotice, takeNotice,
    renderPanel, centreCamera, save, load, newState, buyAnimal, sellAnimal, COLS, ROWS, TILE, VIEW_W, VIEW_H, idx,
  };
})();
