/* Cottage Diary — a life sim with the scope of a to-do list.
   One character, one cottage, four pots on the windowsill, six neighbours. Three things a day. */
(() => {
  'use strict';

  // ------------------------------------------------------------------ data

  const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];
  const DAYS_PER_SEASON = 7;
  const SHELF_MAX = 4;
  const SAVE_KEY = 'cottage-diary-v1';
  const TABLE_SLOTS = 3;
  const POT_COUNT = 4;
  const POT_YIELD = 2; // per pick; one more from a neighbour's packet
  const CAN_MAX = 4;   // pours in the watering can; it fills overnight
  // Recipes you move in knowing. The rest are shared by neighbours or worked out at the table.
  const STARTER_RECIPES = ['garden_salad', 'jacket_potato', 'honey_cake', 'onion_soup'];

  const ITEMS = {
    lettuce:    { name: 'Lettuce',    icon: '🥗', kind: 'crop', days: 3, seasons: ['Spring'],                     hardy: false, yield: [2, 3] },
    carrot:     { name: 'Carrot',     icon: '🥕', kind: 'crop', days: 4, seasons: ['Spring', 'Autumn'],           hardy: true,  yield: [2, 3] },
    strawberry: { name: 'Strawberry', icon: '🍓', kind: 'crop', days: 5, seasons: ['Spring'],                     hardy: false, yield: [3, 4] },
    potato:     { name: 'Potato',     icon: '🥔', kind: 'crop', days: 5, seasons: ['Spring', 'Summer', 'Autumn'], hardy: true,  yield: [3, 4] },
    tomato:     { name: 'Tomato',     icon: '🍅', kind: 'crop', days: 5, seasons: ['Summer'],                     hardy: false, yield: [3, 4] },
    courgette:  { name: 'Courgette',  icon: '🥒', kind: 'crop', days: 4, seasons: ['Summer'],                     hardy: false, yield: [2, 3] },
    sweetcorn:  { name: 'Sweetcorn',  icon: '🌽', kind: 'crop', days: 5, seasons: ['Summer'],                     hardy: false, yield: [2, 3] },
    sunflower:  { name: 'Sunflower',  icon: '🌻', kind: 'crop', days: 4, seasons: ['Summer'],                     hardy: false, yield: [1, 2] },
    pumpkin:    { name: 'Pumpkin',    icon: '🎃', kind: 'crop', days: 6, seasons: ['Autumn'],                     hardy: false, yield: [1, 2] },
    onion:      { name: 'Onion',      icon: '🧅', kind: 'crop', days: 4, seasons: ['Autumn', 'Winter'],           hardy: true,  yield: [2, 3] },
    broccoli:   { name: 'Broccoli',   icon: '🥦', kind: 'crop', days: 4, seasons: ['Autumn', 'Winter'],           hardy: true,  yield: [2, 2] },
    cabbage:    { name: 'Cabbage',    icon: '🥬', kind: 'crop', days: 5, seasons: ['Winter'],                     hardy: true,  yield: [1, 2] },
    garlic:     { name: 'Garlic',     icon: '🧄', kind: 'crop', days: 6, seasons: ['Winter'],                     hardy: true,  yield: [2, 3] },

    flour: { name: 'Flour', icon: '🌾', kind: 'staple' },
    honey: { name: 'Honey', icon: '🍯', kind: 'staple' },
    egg:   { name: 'Eggs',  icon: '🥚', kind: 'staple' },
    fish:  { name: 'Fish',  icon: '🐟', kind: 'staple' },
    milk:  { name: 'Milk',  icon: '🥛', kind: 'staple' },
    apple: { name: 'Apples', icon: '🍎', kind: 'staple' },
  };

  const RECIPES = {
    garden_salad:    { name: 'Garden Salad',       icon: '🥗', seasons: ['Spring', 'Summer'], needs: { lettuce: 1, carrot: 1 } },
    strawberry_jam:  { name: 'Strawberry Jam',     icon: '🍓', seasons: ['Spring'],           needs: { strawberry: 2, honey: 1 } },
    carrot_cake:     { name: 'Carrot Cake',        icon: '🍰', seasons: ['Spring', 'Autumn'], needs: { carrot: 2, flour: 1, egg: 1 } },
    tomato_tart:     { name: 'Tomato Tart',        icon: '🥧', seasons: ['Summer'],           needs: { tomato: 2, flour: 1, egg: 1 } },
    fritters:        { name: 'Courgette Fritters', icon: '🍳', seasons: ['Summer'],           needs: { courgette: 1, egg: 1 } },
    corn_chowder:    { name: 'Corn Chowder',       icon: '🥣', seasons: ['Summer'],           needs: { sweetcorn: 1, potato: 1, milk: 1 } },
    sunflower_loaf:  { name: 'Sunflower Loaf',     icon: '🍞', seasons: ['Summer', 'Autumn'], needs: { sunflower: 1, flour: 1 } },
    pumpkin_pie:     { name: 'Pumpkin Pie',        icon: '🎃', seasons: ['Autumn'],           needs: { pumpkin: 1, flour: 1, honey: 1 } },
    apple_crumble:   { name: 'Apple Crumble',      icon: '🍎', seasons: ['Autumn', 'Winter'], needs: { apple: 2, flour: 1, honey: 1 } },
    onion_soup:      { name: 'Onion Soup',         icon: '🍲', seasons: ['Autumn', 'Winter'], needs: { onion: 2, potato: 1 } },
    fish_pie:        { name: 'Fish Pie',           icon: '🐟', seasons: ['Autumn', 'Winter'], needs: { fish: 1, potato: 2, milk: 1 } },
    broccoli_bake:   { name: 'Broccoli Bake',      icon: '🧀', seasons: ['Autumn', 'Winter'], needs: { broccoli: 1, milk: 1, egg: 1 } },
    winter_broth:    { name: 'Winter Broth',       icon: '🍲', seasons: ['Winter'],           needs: { cabbage: 1, onion: 1, garlic: 1 } },
    honey_cake:      { name: 'Honey Cake',         icon: '🍰', seasons: ['Winter', 'Spring'], needs: { flour: 1, honey: 1, egg: 1 } },
    garlic_potatoes: { name: 'Garlic Potatoes',    icon: '🥔', seasons: ['Winter'],           needs: { garlic: 1, potato: 2 } },
    jacket_potato:   { name: 'Jacket Potato',      icon: '🥔', seasons: SEASONS,              needs: { potato: 2 } },
  };

  const FOLK = [
    {
      id: 'ada', name: 'Ada', role: 'retired baker, top of the lane', face: '👵', gives: 'flour',
      hello: '"You\'ll be the new one. I\'m Ada. I did the bread for this whole lane for forty years, and I still do, so don\'t go buying any."',
      door: { icon: '🚪', title: 'The blue door at the top of the lane', blurb: 'Warm on the step, and a smell of bread that has been going on for years.' },
      seeds: ['strawberry', 'tomato', 'pumpkin'],
      keepsake: { icon: '🫙', name: 'Ada\'s sourdough starter', text: 'A jar of starter older than me. "Feed it," she said. "It\'s family."', given: 'Ada handed over a jar of her sourdough starter. It lives on the windowsill now, and so, apparently, do I.' },
      likes: ['strawberry_jam', 'carrot_cake', 'pumpkin_pie', 'honey_cake', 'apple_crumble'],
      wants: [{ item: 'strawberry', n: 3 }, { item: 'tomato', n: 2 }, { item: 'pumpkin', n: 1 }, { item: 'honey', n: 1 }, { item: 'egg', n: 2 }, { item: 'garlic', n: 2 }, { item: 'apple', n: 2 }],
      chat: ['Ada had the kettle on before I knocked.', 'Ada showed me the proper way to knead. I was doing it wrong.', 'Ada says the weather is turning. Ada always says that.', 'Sat with Ada while her bread proved. Neither of us said much.'],
      thanks: ['"Oh, you shouldn\'t have. Well. You should, actually."', '"That\'ll go straight in the oven."', '"You\'re a good sort, you know."'],
    },
    {
      id: 'tomas', name: 'Tomas', role: 'carpenter, smells of sawdust, has an apple tree', face: '🧔', gives: 'apple',
      hello: '"Tomas. Next door. If you hear hammering, that\'s me. If you hear swearing, also me. Help yourself to the apples, the tree does more than I can eat."',
      door: { icon: '🪟', title: 'A door propped open with a plank', blurb: 'Sawdust on the path. Somebody in there is sawing and not talking.' },
      seeds: ['potato', 'onion'],
      keepsake: { icon: '🪵', name: 'A wooden duck', text: 'Tomas carved it in an evening and pretended it was nothing. It is not nothing.', given: 'Tomas left a little carved duck on the doorstep. Didn\'t say a word about it. It\'s on the windowsill.' },
      likes: ['onion_soup', 'winter_broth', 'jacket_potato', 'fish_pie', 'apple_crumble'],
      wants: [{ item: 'potato', n: 2 }, { item: 'onion', n: 2 }, { item: 'fish', n: 1 }, { item: 'sweetcorn', n: 2 }, { item: 'jacket_potato', n: 1 }, { item: 'onion_soup', n: 1 }],
      chat: ['Tomas looked at my front door from his doorstep and sighed. It sticks, apparently. He can tell from there.','Helped Tomas hold a plank. He said "cheers" twice.', 'Tomas is building a gate for the churchyard. Took him an hour to explain the hinges.', 'Tomas told a joke. I think it was a joke.'],
      thanks: ['"Right. Good. Ta."', '"That\'ll do nicely."', '"Didn\'t expect that. Cheers."'],
    },
    {
      id: 'wren', name: 'Wren', role: 'beekeeper, always humming', face: '👩‍🌾', gives: 'honey',
      hello: '"Oh, hello! Wren. I keep the bees up on the meadow. Don\'t mind the humming, that\'s mostly me."',
      door: { icon: '🚪', title: 'A cottage door under a meadow', blurb: 'Something is humming behind it. Possibly bees. Possibly not bees.' },
      seeds: ['sunflower', 'lettuce', 'strawberry'],
      keepsake: { icon: '🕯️', name: 'A beeswax candle', text: 'Smells of the meadow when it burns. Wren says the bees insisted.', given: 'Wren gave me a beeswax candle, still warm from the mould. Windowsill.' },
      likes: ['honey_cake', 'strawberry_jam', 'sunflower_loaf', 'garden_salad'],
      wants: [{ item: 'sunflower', n: 1 }, { item: 'lettuce', n: 2 }, { item: 'strawberry', n: 2 }, { item: 'flour', n: 1 }, { item: 'milk', n: 1 }, { item: 'broccoli', n: 1 }],
      chat: ['Wren let me look inside a hive. The bees did not seem to mind.', 'Wren talked about swarms for twenty minutes. I nodded a lot.', 'Wren was lying in the meadow. I lay down too.', 'Wren has named all her queens. Today\'s was called Margaret.'],
      thanks: ['"The bees will be so pleased. Well, I will."', '"Oh! Lovely. Thank you."', '"You didn\'t have to. That\'s why it\'s nice."'],
    },
    {
      id: 'harold', name: 'Harold', role: 'fisherman, mostly retired', face: '👴', gives: 'fish',
      hello: '"Harold. I fish. Or I did. The jetty\'s down that way, if you ever want to watch some water with someone."',
      door: { icon: '⚓', title: 'A door down by the jetty', blurb: 'Nets over the rail, boots by the step, nobody in a hurry.' },
      seeds: ['garlic', 'cabbage', 'carrot'],
      keepsake: { icon: '🐚', name: 'A jar of sea glass', text: 'Forty years of walking the tideline, Harold reckons. Green, mostly.', given: 'Harold gave me a jam jar of sea glass. "Catches the light," he said, and went home. It does.' },
      likes: ['fish_pie', 'onion_soup', 'garlic_potatoes', 'corn_chowder'],
      wants: [{ item: 'onion', n: 2 }, { item: 'carrot', n: 2 }, { item: 'garlic', n: 1 }, { item: 'potato', n: 3 }, { item: 'honey', n: 1 }, { item: 'cabbage', n: 1 }],
      chat: ['Harold was on the jetty. We watched the water for a bit.', 'Harold told me about the one that got away. It has grown since last time.', 'Harold says you can tell rain by the gulls. He was right, once.', 'Harold mended a net while I talked. He listens better with his hands busy.'],
      thanks: ['"Hm. Kind of you."', '"Well now. That\'s something."', '"I\'ll not forget that."'],
    },
    {
      id: 'ines', name: 'Ines', role: 'postmistress, keeps a goat', face: '👩', gives: 'milk',
      hello: '"Ines. Post office. And that\'s Marjorie, she\'s a goat. Anything you need to know about anyone on this lane, I\'ve probably got it."',
      door: { icon: '📮', title: 'The post office door', blurb: 'Open half the day. Something with horns is eating the noticeboard.' },
      seeds: ['courgette', 'broccoli', 'lettuce'],
      keepsake: { icon: '📮', name: 'A postcard from nowhere', text: 'Addressed to "the cottage". No stamp. Ines says she found it. I believe her.', given: 'Ines brought round a postcard addressed to "the cottage", no stamp. I\'ve propped it on the windowsill.' },
      likes: ['fritters', 'broccoli_bake', 'garden_salad', 'tomato_tart'],
      wants: [{ item: 'sunflower', n: 2 }, { item: 'courgette', n: 2 }, { item: 'lettuce', n: 2 }, { item: 'egg', n: 2 }, { item: 'broccoli', n: 2 }, { item: 'fritters', n: 1 }],
      chat: ['Ines knows everything about everyone. Now she knows a bit about me.', 'Ines\'s goat, Marjorie, ate the corner of my letter.', 'Ines had a parcel for me. It was just seeds, but still.', 'Ines closed the post office early so we could have a cup of tea.'],
      thanks: ['"Well aren\'t you a treasure."', '"Marjorie says thank you. She doesn\'t, but I do."', '"I\'ll tell everyone. In a good way."'],
    },
    {
      id: 'poppy', name: 'Poppy', role: 'eight, lives with her gran, keeps hens', face: '👧', gives: 'egg',
      hello: '"I\'m Poppy and I\'m eight and I\'ve got eleven hens. Do you want to see them? You can see them."',
      door: { icon: '🚪', title: 'A small door with a drawing taped to it', blurb: 'Hens in the yard. Quite a lot of hens, actually, and shouting.' },
      seeds: ['strawberry', 'sweetcorn', 'pumpkin'],
      keepsake: { icon: '🖍️', name: 'Poppy\'s drawing', text: 'My cottage, in crayon. The chimney is enormous. It is on the windowsill forever now.', given: 'Poppy gave me a drawing of the cottage. The chimney is enormous. It\'s on the windowsill forever now.' },
      likes: ['strawberry_jam', 'tomato_tart', 'pumpkin_pie', 'carrot_cake', 'apple_crumble'],
      wants: [{ item: 'strawberry', n: 2 }, { item: 'carrot', n: 1 }, { item: 'pumpkin', n: 1 }, { item: 'sweetcorn', n: 1 }, { item: 'honey', n: 1 }, { item: 'fish', n: 1 }],
      chat: ['Poppy introduced me to every hen by name. There are eleven.', 'Poppy asked if I was old. I said a bit.', 'Poppy showed me a frog she has been keeping in a bucket. We let it go.', 'Poppy drew my cottage. The chimney is enormous.'],
      thanks: ['"YES. Thank you thank you thank you."', '"Gran! GRAN! Look!"', '"This is the best day. Well, second best."'],
    },
  ];

  const WEATHER = {
    sunny:  { icon: '☀️', name: 'Sunny' },
    cloudy: { icon: '☁️', name: 'Overcast' },
    rain:   { icon: '🌧️', name: 'Rain' },
    windy:  { icon: '🌬️', name: 'Windy' },
    heat:   { icon: '🔥', name: 'Heatwave' },
    frost:  { icon: '❄️', name: 'Frost' },
  };
  const WEATHER_TABLE = {
    Spring: [['sunny', 40], ['cloudy', 15], ['rain', 35], ['windy', 10]],
    Summer: [['sunny', 50], ['heat', 25], ['rain', 15], ['windy', 10]],
    Autumn: [['sunny', 25], ['cloudy', 20], ['rain', 30], ['windy', 25]],
    Winter: [['sunny', 20], ['cloudy', 20], ['frost', 30], ['rain', 15], ['windy', 15]],
  };

  const TIERS = [
    [90, 'Dear friend'], [70, 'Good friend'], [40, 'Friend'], [20, 'Nodding terms'], [0, 'Stranger'],
  ];

  // --------------------------------------------------------------- helpers

  const rnd = (n) => Math.floor(Math.random() * n);
  const pick = (arr) => arr[rnd(arr.length)];
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (id) => document.getElementById(id);
  const uid = () => Date.now().toString(36) + rnd(1e6).toString(36);

  const tierOf = (f) => TIERS.find(([min]) => f >= min)[1];
  const tierIndex = (f) => TIERS.findIndex(([min]) => f >= min);
  const itemName = (id) => (ITEMS[id] || RECIPES[id]).name;
  const itemIcon = (id) => (ITEMS[id] || RECIPES[id]).icon;
  const plural = (n, id) => {
    const nm = itemName(id);
    if (n === 1 || ITEMS[id]?.kind === 'staple' || RECIPES[id]) return nm;
    if (/y$/.test(nm) && !/[aeiou]y$/.test(nm)) return nm.replace(/y$/, 'ies');
    if (/(s|x|ch|sh|o)$/.test(nm)) return nm + 'es';
    return nm + 's';
  };

  // ------------------------------------------------------------------ state

  let S = null;

  // What everyone is after on the day you move in. One you already have, one on the sill,
  // a couple to grow, a couple to fetch from another neighbour.
  const STARTER_REQUESTS = {
    ada:    { item: 'strawberry', n: 3, left: 10 },
    tomas:  { item: 'potato',     n: 2, left: 7 },
    wren:   { item: 'lettuce',    n: 2, left: 8 },
    harold: { item: 'carrot',     n: 2, left: 9 },
    ines:   { item: 'egg',        n: 2, left: 8 },
    poppy:  { item: 'honey',      n: 1, left: 8 },
  };

  function freshState(name) {
    const folk = {};
    for (const f of FOLK) folk[f.id] = { friendship: 8, since: 3, request: { ...STARTER_REQUESTS[f.id] } };
    folk.poppy.friendship = 14;

    return {
      name: name || 'You',
      day: 1, season: 0, year: 1,
      weather: 'sunny',
      actions: 3, maxActions: 3,
      wellFed: false, ateToday: false,
      pantry: { potato: 3, flour: 1, egg: 1 },
      shelf: [],
      table: {},
      known: [...STARTER_RECIPES],
      pots: defaultPots(),
      can: { water: CAN_MAX },
      sill: [],
      folk,
      diary: [],
      stats: { dishes: 0, visits: 0, requests: 0, recipes: 0, picks: 0 },
      flags: { fete: false, firstDish: false, keepsakes: {}, hello: false, greeted: {} },
    };
  }

  const emptyPot = () => ({ crop: null, progress: 0, dry: 1, wilted: false, boost: false, picks: 0 });
  function defaultPots() {
    const pots = [];
    for (let i = 0; i < POT_COUNT; i++) pots.push(emptyPot());
    pots[0] = { ...emptyPot(), crop: 'lettuce', progress: 1 };
    pots[1] = { ...emptyPot(), crop: 'strawberry', progress: 0 };
    return pots;
  }

  // Older diaries (before the windowsill and the kitchen table, or with a garden and a fence) get tidied up.
  function migrate(s) {
    if (!Array.isArray(s.known)) s.known = [...new Set([...STARTER_RECIPES, ...(s.shelf || [])])];
    if (!Array.isArray(s.sill)) s.sill = [];
    for (const o of s.sill) if (!o.id) o.id = uid();
    if (!Array.isArray(s.pots)) s.pots = defaultPots();
    while (s.pots.length < POT_COUNT) s.pots.push(emptyPot());
    if (!s.can || typeof s.can.water !== 'number') s.can = { water: CAN_MAX };
    if (!s.table || typeof s.table !== 'object') s.table = {};
    if (!s.stats) s.stats = { dishes: 0, visits: 0, requests: 0 };
    if (s.stats.recipes == null) s.stats.recipes = 0;
    if (s.stats.picks == null) s.stats.picks = 0;
    if (!s.flags) s.flags = { fete: false, firstDish: false };
    if (!s.flags.keepsakes) s.flags.keepsakes = {};
    if (s.flags.hello == null) s.flags.hello = true; // they moved in before there was a hello to say
    if (!s.flags.greeted) s.flags.greeted = {};
    // a diary from before the doors were clickable had already done the round of hellos
    if (s.flags.hello) for (const f of FOLK) if (s.flags.greeted[f.id] == null) s.flags.greeted[f.id] = true;
    // the garden and the fence are gone, and so are the nails that mended it
    delete s.beds;
    delete s.fence;
    if (s.pantry) delete s.pantry.nails;
    for (const st of Object.values(s.folk)) if (st.request && !ITEMS[st.request.item] && !RECIPES[st.request.item]) st.request = null;
    return s;
  }

  const seasonName = () => SEASONS[S.season];
  const dayLabel = () => `${seasonName()}, day ${S.day}`;

  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* private mode etc. */ }
  }
  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      return s && s.folk && s.pantry ? migrate(s) : null;
    } catch (e) { return null; }
  }

  // What happens is said once, in the corner, and then it goes. The lines are still
  // kept in S.diary so the year review has something behind it.
  function diary(text, cls) {
    S.diary.push({ t: text, c: cls || '' });
    if (S.diary.length > 80) S.diary.splice(0, S.diary.length - 80);
    logLine(text, cls);
  }
  function diaryDay() {
    const w = WEATHER[S.weather];
    const label = `${dayLabel()} · ${w.icon} ${w.name}`;
    S.diary.push({ day: label });
    logLine(label, 'day');
  }

  const LOG_MAX = 6;
  function logLine(text, cls) {
    const el = $('log');
    const line = document.createElement('div');
    line.className = `log-line ${cls || ''}`;
    line.textContent = text;
    el.appendChild(line);
    while (el.children.length > LOG_MAX) el.firstChild.remove();
    setTimeout(() => {
      line.classList.add('out');
      setTimeout(() => line.remove(), 500);
    }, cls === 'day' ? 9000 : 7000);
  }
  function toast(msg) { logLine(msg, 'toast'); }

  function spend() {
    S.actions -= 1;
  }
  function canAct() {
    if (S.actions <= 0) { toast('Nothing left in you today. Go to bed.'); return false; }
    return true;
  }

  function addItem(id, n) { S.pantry[id] = (S.pantry[id] || 0) + n; }
  function hasItems(needs) {
    return Object.entries(needs).every(([id, n]) => (S.pantry[id] || 0) >= n);
  }
  function takeItems(needs) {
    for (const [id, n] of Object.entries(needs)) {
      S.pantry[id] -= n;
      if (S.pantry[id] <= 0) delete S.pantry[id];
    }
  }
  function haveRequestItem(req) {
    if (RECIPES[req.item]) return S.shelf.includes(req.item);
    return (S.pantry[req.item] || 0) >= req.n;
  }

  function seasonalRecipes() {
    return Object.keys(RECIPES).filter((id) => RECIPES[id].seasons.includes(seasonName()));
  }

  function bumpFriendship(id, amount) {
    const f = S.folk[id];
    const before = tierIndex(f.friendship);
    f.friendship = clamp(f.friendship + amount, 0, 100);
    const after = tierIndex(f.friendship);
    const who = FOLK.find((x) => x.id === id);
    if (after < before) {
      diary(`${who.name} and I are on ${tierOf(f.friendship).toLowerCase().replace(/ terms$/, '')} terms now.`, 'warm');
    }
    // Good friends leave you something for the windowsill. Once.
    if (amount > 0 && f.friendship >= 70 && !S.flags.keepsakes[id]) {
      S.flags.keepsakes[id] = true;
      const k = who.keepsake;
      sillAdd({ kind: 'keepsake', from: who.name, icon: k.icon, name: k.name, text: k.text });
      diary(k.given, 'warm');
    }
  }

  // ------------------------------------------------------------ windowsill
  // Plans and presents live on the sill as little objects: notes, seed packets,
  // recipe cards and keepsakes. They can be picked up and put down elsewhere.

  let held = null;    // index of the sill item currently in hand (click to place)
  let dragIdx = null; // index being dragged with the mouse

  function sillAdd(obj) { obj.id = uid(); S.sill.push(obj); return obj; }
  // Move item `from` so it sits before the item that was at `before` (S.sill.length = the end).
  function sillMove(from, before) {
    if (from < 0 || from >= S.sill.length) return;
    const [it] = S.sill.splice(from, 1);
    const dest = before > from ? before - 1 : before;
    S.sill.splice(clamp(dest, 0, S.sill.length), 0, it);
  }
  // The live (unticked) note pinned for a neighbour's request, if any.
  function noteFor(folkId) { return S.sill.find((o) => o.kind === 'note' && o.req === folkId && !o.done); }
  // Notes pin themselves: the moment someone tells you what they're after, it's on the board.
  function pinNote(folkId) {
    const st = S.folk[folkId];
    if (!st || !st.request || !S.flags.greeted[folkId] || noteFor(folkId)) return null;
    const f = FOLK.find((x) => x.id === folkId);
    const req = st.request;
    return sillAdd({ kind: 'note', text: `${f.name} — ${req.n} ${plural(req.n, req.item).toLowerCase()}`, req: folkId, done: false });
  }
  function pinAllNotes() { for (const f of FOLK) pinNote(f.id); }

  function learnRecipe(id, from) {
    if (S.known.includes(id)) return false;
    S.known.push(id);
    S.stats.recipes += 1;
    if (from) sillAdd({ kind: 'recipe', recipe: id, from: from.name });
    return true;
  }
  function giveSeeds(f) {
    const crop = pick(f.seeds);
    sillAdd({ kind: 'seeds', crop, from: f.name });
    return crop;
  }

  // ------------------------------------------------------------ potted plants
  // Four pots on the sill. Indoors, so anything grows in any season, one thing per pick,
  // and it grows back from half-way. Watering is by hand, with the can. Picking is free.

  const potRipe = (p) => !!p.crop && !p.wilted && p.progress >= ITEMS[p.crop].days;
  const regrowDays = (id) => Math.ceil(ITEMS[id].days / 2);

  function takeCan() {
    if (held === 'can') { held = null; render(); return; }
    if (S.can.water <= 0) { toast('The can is empty. It fills itself overnight.'); return; }
    held = 'can';
    render();
    toast(`Got the can, ${S.can.water} pour${S.can.water === 1 ? '' : 's'} in it. Click a pot.`);
  }

  function waterPot(i) {
    const p = S.pots[i];
    if (!p.crop) { toast('An empty pot. Nothing in it to water.'); return; }
    const c = ITEMS[p.crop];
    if (S.can.water <= 0) { toast('The can is empty. It fills itself overnight.'); held = null; render(); return; }
    if (p.dry === 0) { toast(`The ${c.name.toLowerCase()} has had its drink already.`); return; }
    S.can.water -= 1;
    p.dry = 0;
    if (p.wilted) {
      p.wilted = false;
      p.progress = Math.max(0, p.progress - 1);
      diary(`Watered the wilted ${c.name.toLowerCase()} on the sill. It perked up by teatime, mostly.`);
    }
    if (S.can.water <= 0) { held = null; toast('Glug. That was the last of the can.'); }
    else toast(pick(['Glug.', 'Glug glug.', 'A good drink.']));
    save();
    render();
  }

  function pickPot(i) {
    const p = S.pots[i];
    const c = ITEMS[p.crop];
    const n = POT_YIELD + (p.boost ? 1 : 0);
    addItem(p.crop, n);
    p.progress = c.days - regrowDays(p.crop);
    p.picks += 1;
    S.stats.picks += 1;
    let extra = '';
    if (Math.random() < 0.15) {
      sillAdd({ kind: 'seeds', crop: p.crop, from: 'the windowsill' });
      extra = ' Saved a few seeds in a twist of paper, too.';
    }
    diary(`Picked ${n === 1 ? 'a' : n} ${plural(n, p.crop).toLowerCase()} off the windowsill ${c.name.toLowerCase()}.${extra}`, 'good');
    toast(`${c.icon} ${n === 1 ? 'One' : n} ${plural(n, p.crop).toLowerCase()} into the pantry.`);
    save();
    render();
  }

  function potClick(i) {
    if (held === 'can') { waterPot(i); return; }
    if (typeof held === 'number') { toast('Put that down first.'); return; }
    const p = S.pots[i];
    if (!p.crop) { openPotSowSheet(i); return; }
    if (potRipe(p)) { pickPot(i); return; }
    openPotSheet(i);
  }

  function openPotSowSheet(i) {
    const packets = S.sill.filter((o) => o.kind === 'seeds');
    let html = `<h2>An empty pot</h2><p>Anything grows indoors, whatever the season, one at a time. Sowing takes an action; watering and picking are free.</p><div class="options">`;
    for (const p of packets) {
      const c = ITEMS[p.crop];
      html += `<button class="opt packet" data-packet="${p.id}">
        <span class="icon">${c.icon}</span>
        <span><span class="t">${c.name} seeds from ${esc(p.from)}</span><br><span class="d">${c.days} days to the first pick, then every ${regrowDays(p.crop)} · ${POT_YIELD + 1} per pick</span></span>
        <span class="r good">1 action</span></button>`;
    }
    for (const id of Object.keys(ITEMS).filter((k) => ITEMS[k].kind === 'crop')) {
      const c = ITEMS[id];
      html += `<button class="opt" data-seed="${id}">
        <span class="icon">${c.icon}</span>
        <span><span class="t">${c.name}</span><br><span class="d">${c.days} days to the first pick, then every ${regrowDays(id)} · ${POT_YIELD} per pick</span></span>
        <span class="r">1 action</span></button>`;
    }
    html += `</div><div class="foot"><button id="sheet-cancel">Never mind</button></div>`;
    openSheet(html);
    const sow = (id, packet) => {
      if (!canAct()) return;
      S.pots[i] = { ...emptyPot(), crop: id, dry: 0, boost: !!packet };
      const c = ITEMS[id];
      if (packet) S.sill.splice(S.sill.indexOf(packet), 1);
      spend();
      diary(packet
        ? `Potted up ${packet.from === 'the windowsill' ? 'my own saved' : `${packet.from}'s`} ${c.name.toLowerCase()} seeds on the windowsill. Watered them in.`
        : `Sowed ${c.name.toLowerCase()} in a pot on the windowsill. ${c.days} days, if I remember to water it.`);
      closeSheet();
      finishAction();
    };
    $('sheet').querySelectorAll('[data-seed]').forEach((btn) => btn.addEventListener('click', () => sow(btn.dataset.seed, null)));
    $('sheet').querySelectorAll('[data-packet]').forEach((btn) => btn.addEventListener('click', () => {
      const p = S.sill.find((o) => o.id === btn.dataset.packet);
      if (p) sow(p.crop, p);
    }));
    $('sheet-cancel').addEventListener('click', closeSheet);
  }

  function openPotSheet(i) {
    const p = S.pots[i];
    const c = ITEMS[p.crop];
    const left = c.days - p.progress;
    const growth = p.wilted
      ? 'Wilted and sulking. Water it and it will come back, a day behind.'
      : `Growing. ${left} day${left === 1 ? '' : 's'} until ${p.picks ? 'the next pick' : 'the first pick'}.`;
    const water = p.dry === 0 ? 'Watered today.' : p.dry === 1 ? 'Fine for now. Water it tomorrow.' : 'Thirsty. It will wilt tonight without a drink.';
    openSheet(`<h2>${c.icon} ${c.name}${p.boost ? ' <span class="tiny-tag">packet seed</span>' : ''}</h2>
      <p class="ink">${growth}</p><p>${water}${p.picks ? ` Picked ${p.picks} time${p.picks === 1 ? '' : 's'} so far.` : ''} Pick up the watering can and click the pot to water it.</p>
      <div class="foot"><button id="pot-pull">Pull it out</button><button class="primary" id="sheet-cancel">Leave it</button></div>`);
    $('sheet-cancel').addEventListener('click', closeSheet);
    $('pot-pull').addEventListener('click', () => {
      diary(`Pulled the ${c.name.toLowerCase()} out of its pot. Fresh start.`);
      S.pots[i] = emptyPot();
      closeSheet();
      save();
      render();
    });
  }

  function renderPots() {
    const carrying = held === 'can';
    document.body.classList.toggle('carrying', carrying);
    $('pots').innerHTML = S.pots.map((p, i) => {
      if (!p.crop) return `<button class="pot empty" data-pot="${i}" title="An empty pot. Click to sow something."><span class="plant">＋</span><span class="pot-body"><i class="soil"></i></span><span class="pot-name">empty</span><span class="pot-state">sow</span></button>`;
      const c = ITEMS[p.crop];
      const ripe = potRipe(p);
      const frac = p.progress / c.days;
      const stage = ripe ? 3 : frac >= 0.66 ? 2 : frac >= 0.33 ? 1 : 0;
      const plant = stage === 0 ? '🌱' : stage === 1 ? '🌿' : c.icon;
      const wet = p.dry === 0 ? 'wet' : p.dry === 1 ? 'fine' : p.dry === 2 ? 'thirsty' : 'parched';
      const left = c.days - p.progress;
      const state = p.wilted ? 'wilted' : ripe ? 'pick me' : p.dry >= 2 ? 'thirsty' : `${left}d to go`;
      const title = p.wilted ? `${c.name}, wilted. Water it.` : ripe ? `${c.name}, ready. Click to pick.` : `${c.name}, ${left} day${left === 1 ? '' : 's'} to go. Soil ${wet === 'wet' ? 'watered' : wet}.`;
      return `<button class="pot stage-${stage} ${wet}${p.wilted ? ' wilted' : ''}${ripe ? ' ripe' : ''}${p.boost ? ' boost' : ''}" data-pot="${i}" title="${title}">
        <span class="plant">${plant}</span><span class="pot-body"><i class="soil"></i></span>
        <span class="pot-name">${c.name}</span><span class="pot-state">${state}</span></button>`;
    }).join('');
    $('pots').querySelectorAll('[data-pot]').forEach((el) => el.addEventListener('click', (e) => { e.stopPropagation(); potClick(Number(el.dataset.pot)); }));
    const can = $('can');
    can.classList.toggle('lifted', carrying);
    can.classList.toggle('dry', S.can.water <= 0);
    can.title = carrying ? 'Put the can down' : S.can.water ? `Watering can, ${S.can.water} pour${S.can.water === 1 ? '' : 's'} left. Click to pick it up.` : 'Empty. It fills overnight.';
    $('can-drops').textContent = '●'.repeat(S.can.water) + '○'.repeat(CAN_MAX - S.can.water);
  }

  // ---------------------------------------------------------- kitchen table
  // Put two or three things from the pantry on the table and see what they make.

  function matchRecipe(t) {
    const keys = Object.keys(t);
    if (!keys.length) return null;
    return Object.keys(RECIPES).find((id) => {
      const n = RECIPES[id].needs;
      const nk = Object.keys(n);
      return nk.length === keys.length && nk.every((k) => t[k] === n[k]);
    }) || null;
  }
  function nearlyRecipe(t) {
    return Object.keys(RECIPES).some((id) => {
      const n = RECIPES[id].needs;
      return Object.entries(t).every(([k, v]) => (n[k] || 0) >= v);
    });
  }
  function tableAdd(id) {
    const have = S.pantry[id] || 0;
    const on = S.table[id] || 0;
    if (on >= have) { toast(`That's all the ${plural(2, id).toLowerCase()} you've got.`); return; }
    if (!on && Object.keys(S.table).length >= TABLE_SLOTS) { toast('Only room for three things on the table.'); return; }
    S.table[id] = on + 1;
    save();
    render();
  }
  function tableTake(id) {
    if (!S.table[id]) return;
    S.table[id] -= 1;
    if (S.table[id] <= 0) delete S.table[id];
    save();
    render();
  }
  function tableClear() { S.table = {}; save(); render(); }
  function tableMake() {
    const ids = Object.keys(S.table);
    if (!ids.length) { toast('Nothing on the table yet. Tap something in the pantry.'); return; }
    if (!canAct()) return;
    if (S.shelf.length >= SHELF_MAX) { toast('The shelf is full. Eat something or give it away.'); return; }
    if (!hasItems(S.table)) { toast('The pantry has less than the table thinks.'); return; }
    const id = matchRecipe(S.table);
    if (!id) {
      toast(nearlyRecipe(S.table)
        ? pick(['Nearly. It wants something else with it.', 'Close. Something is missing, or there\'s too much of one thing.'])
        : pick(['That doesn\'t go together. Not yet, anyway.', 'Stared at it for a bit. It isn\'t anything.', 'Hm. No. Put it back.']));
      return;
    }
    const discovered = learnRecipe(id, null);
    if (discovered) diary(`Put ${needsText(S.table)} together to see what happened. It's ${RECIPES[id].name.toLowerCase()}. Wrote it in the back of the cookbook.`, 'warm');
    cookRecipe(id, discovered ? 'table' : 'table-known');
  }
  function needsText(needs) {
    return Object.entries(needs).map(([iid, n]) => `${n} ${plural(n, iid).toLowerCase()}`).join(', ').replace(/, ([^,]*)$/, ' and $1');
  }
  function cookRecipe(id, how) {
    const r = RECIPES[id];
    takeItems(r.needs);
    S.shelf.push(id);
    S.stats.dishes += 1;
    S.table = {};
    spend();
    if (how === 'table-known') diary(pick([`Made ${r.name.toLowerCase()} at the table, by eye. Didn't need the book.`, `${r.name} from memory. The kitchen smells right.`]), 'good');
    else if (how !== 'table') diary(pick([`Made ${r.name.toLowerCase()}. The kitchen smells right.`, `${r.name} on the shelf. Burnt the first attempt, but only a bit.`, `Cooked ${r.name.toLowerCase()} with the radio on.`]), 'good');
    if (!S.flags.firstDish) { S.flags.firstDish = true; diary('First thing cooked in this kitchen. It counts.', 'warm'); }
    finishAction();
  }

  // --------------------------------------------------------------- actions

  function openCookSheet() {
    const seasonal = seasonalRecipes();
    const known = S.known.filter((id) => seasonal.includes(id)).concat(S.known.filter((id) => !seasonal.includes(id)));
    const unknown = Object.keys(RECIPES).filter((id) => !S.known.includes(id));
    const total = Object.keys(RECIPES).length;
    let html = `<h2>The cookbook</h2><p>${S.known.length} of ${total} recipes written in. Cooking one takes an action. Eating a dish is free, and tomorrow you will have energy for a fourth thing.</p><div class="options">`;
    for (const id of known) {
      const r = RECIPES[id];
      const ok = hasItems(r.needs);
      const needs = Object.entries(r.needs).map(([iid, n]) => {
        const have = S.pantry[iid] || 0;
        return `<span class="${have >= n ? 'have' : 'missing'}">${ITEMS[iid].icon} ${have}/${n}</span>`;
      }).join(' · ');
      const fans = FOLK.filter((f) => f.likes.includes(id)).map((f) => f.name).join(', ');
      const off = !seasonal.includes(id);
      html += `<button class="opt ${off ? 'off-season' : ''}" data-recipe="${id}" ${ok ? '' : 'disabled'}>
        <span class="icon">${r.icon}</span>
        <span><span class="t">${r.name}</span><br><span class="d">${needs}${fans ? ` &nbsp;·&nbsp; loved by ${fans}` : ''}${off ? ' &nbsp;·&nbsp; not this season\'s page, but it keeps' : ''}</span></span>
        <span class="r ${ok ? 'good' : ''}">${ok ? 'cook' : 'short'}</span>
      </button>`;
    }
    html += '</div>';
    if (unknown.length) {
      html += `<h3>Pages still blank</h3><p>Neighbours share a recipe when you bring them what they asked for. Or put things together on the kitchen table and see.</p><div class="options">`;
      for (const id of unknown) {
        const r = RECIPES[id];
        const teachers = FOLK.filter((f) => f.likes.includes(id)).map((f) => f.name);
        const who = teachers.length ? `${teachers.slice(0, -1).join(', ')}${teachers.length > 1 ? ' or ' : ''}${teachers[teachers.length - 1]} might share it` : 'Somebody in the village knows it';
        html += `<div class="opt unknown"><span class="icon">📜</span><span><span class="t">${r.name}</span><br><span class="d">${who} · ${Object.keys(r.needs).length} things</span></span><span class="r">?</span></div>`;
      }
      html += '</div>';
    }
    html += `<div class="foot"><button id="sheet-cancel">Close the book</button></div>`;
    openSheet(html);
    $('sheet').querySelectorAll('[data-recipe]').forEach((btn) => btn.addEventListener('click', () => {
      if (!canAct()) return;
      if (S.shelf.length >= SHELF_MAX) { toast('The shelf is full. Eat something or give it away.'); return; }
      closeSheet();
      cookRecipe(btn.dataset.recipe, 'book');
    }));
    $('sheet-cancel').addEventListener('click', closeSheet);
  }

  function eatDish(idx) {
    if (S.ateToday) { toast('Already had a proper meal today.'); return; }
    const id = S.shelf.splice(idx, 1)[0];
    S.ateToday = true;
    S.wellFed = true;
    diary(`Ate the ${RECIPES[id].name.toLowerCase()} at the table like a civilised person. Feel like I could do more tomorrow.`, 'warm');
    save();
    render();
  }

  function openVisitSheet(id) {
    if (!S.flags.greeted[id]) { openHelloSheet(id); return; }
    if (!canAct()) return;
    const f = FOLK.find((x) => x.id === id);
    const st = S.folk[id];
    const req = st.request;
    let html = `<h2>${f.face} ${f.name}</h2><p>${esc(f.role)} · ${tierOf(st.friendship).toLowerCase()} · ${st.friendship}/100</p>`;
    if (req) {
      const have = haveRequestItem(req);
      html += `<div class="speech">"${reqLine(f, req)}"</div>`;
      html += `<p>${have ? 'You have what they need.' : `You don't have that yet. ${req.left} day${req.left === 1 ? '' : 's'} before they stop asking.`}</p>`;
    }
    html += `<div class="options">`;
    html += `<button class="opt" data-visit="chat">
      <span class="icon">☕</span>
      <span><span class="t">Stop for a chat</span><br><span class="d">A little closer. They might send you home with ${ITEMS[f.gives].name.toLowerCase()}.</span></span>
      <span class="r good">+8</span></button>`;
    if (req && haveRequestItem(req)) {
      html += `<button class="opt" data-visit="fulfil">
        <span class="icon">${itemIcon(req.item)}</span>
        <span><span class="t">Bring what they asked for</span><br><span class="d">${req.n} ${plural(req.n, req.item).toLowerCase()} · they give ${ITEMS[f.gives].name.toLowerCase()} back, and often a recipe card or seeds for the windowsill</span></span>
        <span class="r good">+18</span></button>`;
    }
    S.shelf.forEach((dish, i) => {
      const liked = f.likes.includes(dish);
      html += `<button class="opt" data-visit="gift" data-dish="${i}">
        <span class="icon">${RECIPES[dish].icon}</span>
        <span><span class="t">Bring the ${RECIPES[dish].name.toLowerCase()}</span><br><span class="d">${liked ? 'One of their favourites.' : 'A kind thought.'}</span></span>
        <span class="r good">+${liked ? 20 : 12}</span></button>`;
    });
    html += `</div><div class="foot"><button id="sheet-cancel">Not today</button></div>`;
    openSheet(html);
    $('sheet').querySelectorAll('[data-visit]').forEach((btn) => btn.addEventListener('click', () => {
      visit(id, btn.dataset.visit, btn.dataset.dish);
    }));
    $('sheet-cancel').addEventListener('click', closeSheet);
  }

  function reqLine(f, req) {
    const what = `${req.n} ${plural(req.n, req.item).toLowerCase()}`;
    const lines = {
      ada: [`I'm short of ${what} for a bake. Could you?`, `If you ever come by ${what}, I'd be grateful.`],
      tomas: [`Need ${what}. Don't ask.`, `${what}, if you've got them. I'll sort you out.`],
      wren: [`Would you have ${what}? I'll trade you honey, obviously.`, `The bees and I are after ${what}.`],
      harold: [`Could do with ${what}. No rush. Well, some rush.`, `${what}. That's all I'm after.`],
      ines: [`I'm after ${what} and I've asked everyone else.`, `Any chance of ${what}? Marjorie's got nothing to do with it.`],
      poppy: [`Can I have ${what}? PLEASE. It's for a thing.`, `Gran says I can't ask. So I'm not asking. But ${what}.`],
    }[f.id];
    return lines[(req.n + req.item.length) % lines.length];
  }

  function visit(id, how, dishIdx) {
    const f = FOLK.find((x) => x.id === id);
    const st = S.folk[id];
    st.since = 0;
    S.stats.visits += 1;
    spend();

    if (how === 'chat') {
      bumpFriendship(id, 8);
      diary(pick(f.chat));
      const chance = 0.3 + st.friendship / 200;
      if (Math.random() < chance) {
        addItem(f.gives, 1);
        diary(`${f.name} pressed ${ITEMS[f.gives].name.toLowerCase()} into my hands on the way out.`, 'good');
      }
      // Good friends sometimes write a favourite recipe out for you over tea.
      const unknown = f.likes.filter((r) => !S.known.includes(r));
      if (st.friendship >= 70 && unknown.length && Math.random() < 0.25) {
        const rid = pick(unknown);
        learnRecipe(rid, f);
        diary(`${f.name} wrote out how they make ${RECIPES[rid].name.toLowerCase()} and wouldn't hear no. Recipe card on the windowsill.`, 'warm');
      }
    } else if (how === 'fulfil') {
      const req = st.request;
      if (RECIPES[req.item]) S.shelf.splice(S.shelf.indexOf(req.item), 1);
      else takeItems({ [req.item]: req.n });
      st.request = null;
      S.stats.requests += 1;
      bumpFriendship(id, 18);
      addItem(f.gives, 2);
      // ...and something for the windowsill: a recipe card if they have one you don't, else seeds.
      let extra;
      const unknown = f.likes.filter((r) => !S.known.includes(r));
      if (unknown.length && Math.random() < 0.6 + st.friendship / 200) {
        const seasonal = unknown.filter((r) => RECIPES[r].seasons.includes(seasonName()));
        const rid = pick(seasonal.concat(unknown)); // weighted towards this season's pages
        learnRecipe(rid, f);
        extra = `And a recipe card in ${f.name}'s handwriting: ${RECIPES[rid].name.toLowerCase()}. It's on the windowsill.`;
      } else if (Math.random() < 0.75) {
        const crop = giveSeeds(f);
        extra = `And a paper packet of ${ITEMS[crop].name.toLowerCase()} seeds, folded twice. Windowsill.`;
      } else {
        addItem(f.gives, 1);
        extra = 'More than I expected, actually.';
      }
      const note = noteFor(id);
      if (note) note.done = true;
      diary(`Brought ${f.name} the ${plural(req.n, req.item).toLowerCase()}. ${pick(f.thanks)} Came home with ${ITEMS[f.gives].name.toLowerCase()}. ${extra}`, 'good');
    } else if (how === 'gift') {
      const dish = S.shelf.splice(Number(dishIdx), 1)[0];
      const liked = f.likes.includes(dish);
      bumpFriendship(id, liked ? 20 : 12);
      diary(liked
        ? `Took ${f.name} a ${RECIPES[dish].name.toLowerCase()}. Their face. ${pick(f.thanks)}`
        : `Dropped a ${RECIPES[dish].name.toLowerCase()} round to ${f.name}. ${pick(f.thanks)}`, 'good');
    }
    closeSheet();
    checkFete();
    finishAction();
  }

  function checkFete() {
    if (S.flags.fete) return;
    if (FOLK.every((f) => S.folk[f.id].friendship >= 70)) {
      S.flags.fete = true;
      diary('The whole lane turned up with chairs and a trestle table. Apparently it was for me.', 'warm');
      save();
      render();
      openSheet(`<h2>A fête on the lane</h2>
        <p class="lead ink">Ada brought bread. Tomas brought a table he made this morning. Wren brought honey, Harold brought fish, Ines brought Marjorie, and Poppy brought every hen.</p>
        <p>Six good friends in one small village. Nothing changes. Everything is a little easier.</p>
        <div class="foot"><button class="primary" id="sheet-cancel">Back to it</button></div>`);
      $('sheet-cancel').addEventListener('click', closeSheet);
    }
  }

  function finishAction() {
    save();
    render();
    if (S.actions <= 0) toast('That\'s the day done. Time for bed.');
  }

  // ------------------------------------------------------------------ night

  function sleep() {
    const early = S.actions > 0;
    if (early) diary(pick(['Early night.', 'Left the rest for tomorrow.', 'Feet up before dark.']));

    // windowsill pots: indoors, so no rain and no frost, but they still dry out (twice as fast in a heatwave)
    const heat = S.weather === 'heat';
    for (const p of S.pots) {
      if (!p.crop) continue;
      const c = ITEMS[p.crop];
      if (p.dry <= 1 && !p.wilted && p.progress < c.days) p.progress += 1;
      p.dry += heat ? 2 : 1;
      if (p.dry >= 5) {
        diary(`The ${c.name.toLowerCase()} on the windowsill is past saving. Tipped it on the compost.`, 'bad');
        Object.assign(p, emptyPot());
      } else if (p.dry >= 3 && !p.wilted) {
        p.wilted = true;
        diary(`The ${c.name.toLowerCase()} on the sill has wilted. It wants water today.`, 'bad');
      }
    }
    S.can.water = CAN_MAX;

    // neighbours
    for (const f of FOLK) {
      const st = S.folk[f.id];
      st.since += 1;
      if (st.since > 5 && st.friendship > 0 && Math.random() < 0.6) st.friendship -= 1;
      if (st.request) {
        st.request.left -= 1;
        if (st.request.left <= 0) {
          diary(`${f.name} found ${plural(2, st.request.item).toLowerCase()} elsewhere. No hard feelings.`);
          st.request = null;
          const note = noteFor(f.id);
          if (note) S.sill.splice(S.sill.indexOf(note), 1);
        }
      } else if (Math.random() < 0.28) {
        const r = newRequest(f);
        if (r) { st.request = r; pinNote(f.id); diary(`${f.name} is after ${r.n} ${plural(r.n, r.item).toLowerCase()}.${S.flags.greeted[f.id] ? ' It\'s on the pinboard.' : ''}`); }
      }
    }

    // calendar
    S.day += 1;
    let seasonChanged = false;
    let yearEnded = false;
    if (S.day > DAYS_PER_SEASON) {
      S.day = 1;
      S.season += 1;
      seasonChanged = true;
      if (S.season >= SEASONS.length) { S.season = 0; S.year += 1; yearEnded = true; }
    }

    // morning
    S.weather = rollWeather();
    S.maxActions = S.wellFed ? 4 : 3;
    S.actions = S.maxActions;
    S.wellFed = false;
    S.ateToday = false;
    diaryDay();

    if (seasonChanged) {
      diary({
        Spring: 'Spring. The lane is loud with birds again.',
        Summer: 'Summer. Long evenings, warm soil, everything wants water.',
        Autumn: 'Autumn. Leaves in the gutters, pumpkins swelling.',
        Winter: 'Winter. Short days, hard ground, soup.',
      }[seasonName()], 'warm');
    }
    if (S.weather === 'rain') diary('Rain on the window all night. The pots are indoors, which is rather the point of them.');
    if (S.weather === 'frost') diary('Hard frost on the windows. The pots are on the warm side of the glass and don\'t care.');
    if (S.weather === 'heat') diary('Heatwave. The pots will dry out twice as fast today.');
    if (S.weather === 'windy') diary('Wind all night. The gate has been complaining.');
    if (S.maxActions === 4) diary('Slept well on a full stomach. Room for one more thing today.', 'good');

    save();
    render();
    if (yearEnded) openYearReview();
  }

  function rollWeather() {
    const table = WEATHER_TABLE[seasonName()];
    const total = table.reduce((a, [, w]) => a + w, 0);
    let r = Math.random() * total;
    for (const [id, w] of table) { r -= w; if (r <= 0) return id; }
    return table[0][0];
  }

  function newRequest(f) {
    const now = seasonName();
    const ok = f.wants.filter((w) => {
      const it = ITEMS[w.item];
      if (it && it.kind === 'crop') return it.seasons.includes(now) || (S.pantry[w.item] || 0) >= w.n;
      if (it && it.kind === 'staple') return w.item !== f.gives;
      if (RECIPES[w.item]) return S.known.includes(w.item) && RECIPES[w.item].seasons.includes(now);
      return false;
    });
    if (!ok.length) return null;
    const w = pick(ok);
    return { item: w.item, n: w.n, left: 7 };
  }

  function openYearReview() {
    const st = S.stats;
    const best = FOLK.map((f) => [f, S.folk[f.id].friendship]).sort((a, b) => b[1] - a[1])[0];
    openSheet(`<h2>Year ${S.year - 1}, all told</h2>
      <p class="lead ink">Four seasons at the cottage. Here is what the diary says happened.</p>
      <div class="review">
        <span>Dishes cooked</span><b>${st.dishes}</b>
        <span>Recipes learned</span><b>${st.recipes}</b>
        <span>Picked off the windowsill</span><b>${st.picks}</b>
        <span>Visits down the lane</span><b>${st.visits}</b>
        <span>Favours done</span><b>${st.requests}</b>
      </div>
      <p>Closest to you: <strong>${best[0].face} ${best[0].name}</strong>, ${tierOf(best[1]).toLowerCase()}.</p>
      <p>Spring again. The lettuce packet is where you left it.</p>
      <div class="foot"><button class="primary" id="sheet-cancel">Another year</button></div>`);
    $('sheet-cancel').addEventListener('click', closeSheet);
  }

  // ------------------------------------------------------------------ sheet

  function openSheet(html) {
    $('sheet').innerHTML = html;
    $('overlay').classList.remove('hidden');
  }
  function closeSheet() {
    $('overlay').classList.add('hidden');
    $('sheet').innerHTML = '';
  }

  function openIntro(existing) {
    let html = `<h2>Cottage Diary</h2>
      <p class="lead ink">A cottage at the end of a lane, four pots on the windowsill, and six neighbours who have already noticed you.</p>
      <p>Days are short. You get three things done, then it's dark. Sow a pot, cook something, visit someone. Seasons change what's for dinner.</p>`;
    if (existing) {
      html += `<p class="ink">There is a diary here already: <strong>${esc(existing.name)}</strong>, ${SEASONS[existing.season].toLowerCase()} of year ${existing.year}, day ${existing.day}.</p>
        <div class="foot"><button id="intro-new">Start fresh</button><button class="primary" id="intro-continue">Pick up the diary</button></div>`;
    } else {
      html += `<label class="label" for="intro-name">Who's moving in?</label>
        <input type="text" id="intro-name" maxlength="20" placeholder="Your name" autocomplete="off" />
        <div class="foot"><button class="primary" id="intro-begin">Move in</button></div>`;
    }
    openSheet(html);
    if (existing) {
      $('intro-continue').addEventListener('click', () => {
        S = existing;
        closeSheet();
        render();
      });
      $('intro-new').addEventListener('click', () => openIntro(null));
    } else {
      const begin = () => {
        const name = $('intro-name').value.trim() || 'You';
        S = freshState(name);
        diaryDay();
        diary(`Moved into the cottage at the end of the lane. The key sticks. The kettle works. Three things a day feels about right.`);
        diary('Two pots on the windowsill, a lettuce and a strawberry, and a watering can with a dent in it.');
        diary('Four recipes in the cookbook. The rest of the pages are blank.');
        diary('Six doors down the lane and not one of them knocked on yet.');
        save();
        closeSheet();
        render();
      };
      $('intro-begin').addEventListener('click', begin);
      $('intro-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') begin(); });
      setTimeout(() => $('intro-name').focus(), 50);
    }
  }

  // A knock at one door. Free, and it can be walked away from; you hear who they are,
  // what they're after, and the note pins itself on the way home.
  function openHelloSheet(id) {
    const f = FOLK.find((x) => x.id === id);
    const st = S.folk[id];
    const req = st.request;
    let html = `<h2>${f.face} ${f.name}</h2><p>${esc(f.role)}</p>
      <div class="speech">${esc(f.hello)}</div>`;
    if (req) {
      const have = haveRequestItem(req);
      html += `<div class="speech">"${reqLine(f, req)}"</div>
        <p>${f.name} would like <strong>${req.n} ${itemIcon(req.item)} ${plural(req.n, req.item).toLowerCase()}</strong>.
        ${have ? 'You have that already. Bring it round when you visit.' : `${req.left} days before they find it elsewhere.`}
        A note goes on the pinboard.</p>`;
    }
    html += `<div class="foot"><button id="sheet-cancel">Another day</button><button class="primary" id="hello-ok">Nice to meet you</button></div>`;
    openSheet(html);
    $('sheet-cancel').addEventListener('click', closeSheet);
    $('hello-ok').addEventListener('click', () => {
      S.flags.greeted[id] = true;
      st.since = 0;
      bumpFriendship(id, 4);
      diary(`Knocked at ${f.name}'s. ${f.hello}${req ? ` ${f.name} is after ${req.n} ${plural(req.n, req.item).toLowerCase()}.` : ''}`);
      pinNote(id);
      if (!S.flags.hello && FOLK.every((x) => S.flags.greeted[x.id])) {
        S.flags.hello = true;
        diary('Six doors, six hellos. Everyone wants something, which is oddly reassuring.', 'warm');
      }
      closeSheet();
      save();
      render();
    });
  }

  function openHelp() {
    openSheet(`<h2>How to play</h2>
      <p class="lead ink">Three actions a day. Spend them, then go to bed. That's the whole rhythm.</p>
      <h3>The cottage</h3>
      <ul>
        <li>Tap pantry things to put them on the kitchen table, then <em>Make it</em>. Two or three that belong together become a dish (one action). Wrong combinations cost nothing.</li>
        <li>The cookbook lists what you know. You start with four recipes; the other pages are blank until a neighbour shares one, or you work it out at the table.</li>
        <li>Dishes sit on the shelf. Eat one (free, once a day) and tomorrow you get a fourth action.</li>
      </ul>
      <h3>The windowsill</h3>
      <ul>
        <li>Four pots. Click an empty one to sow anything, whatever the season (one action). Watering and picking are free.</li>
        <li>Pick up the watering can, then click a pot to water it. The can holds four pours and fills overnight. Soil goes wet, fine, thirsty, then the plant wilts; leave it two more days and it's gone. Heatwaves dry pots twice as fast.</li>
        <li>Plants grow through stages and glow when ready. Click to pick two (three if grown from a neighbour's packet); it grows back from half-way. Sometimes you get seeds too.</li>
        <li>The pinboard underneath holds notes, recipe cards and keepsakes. Anything a neighbour asks for pins itself; jot your own notes for the rest. Click a thing to look at it, pick it up, or drag it to rearrange.</li>
      </ul>
      <h3>The village</h3>
      <ul>
        <li>Six doors down the right-hand side. Knock on one to meet whoever lives there — free, and in whatever order suits you. Until you do, all you get is a hint of who they are.</li>
        <li>Visit a neighbour to chat, bring a dish, or answer a request. Each is one action.</li>
        <li>Chatting often sends you home with their speciality: flour, apples, honey, fish, milk or eggs.</li>
        <li>Bring what someone asked for and they give something back, usually a recipe card from their favourites or a packet of seeds.</li>
        <li>Requests expire in a week. Nobody holds a grudge.</li>
        <li>Friendship drifts down a little if you leave someone too long. Good friends leave a keepsake on your sill.</li>
      </ul>
      <p>The day's happenings say themselves in the bottom corner and then leave you alone. There is no losing; the year just turns.</p>
      <div class="foot"><button id="help-reset">Start a new diary</button><button class="primary" id="sheet-cancel">Back</button></div>`);
    $('sheet-cancel').addEventListener('click', closeSheet);
    $('help-reset').addEventListener('click', () => {
      if (confirm('Throw away this diary and start again?')) {
        try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
        openIntro(null);
      }
    });
  }

  // ------------------------------------------------------ windowsill sheets

  function openSillItem(i) {
    const o = S.sill[i];
    if (!o) return;
    let html = '';
    if (o.kind === 'note') {
      html = `<h2>📌 A note</h2><div class="speech">${esc(o.text)}</div>
        <p>${o.done ? 'Ticked off.' : 'Still to do.'}${o.req && !o.done ? ' It ticks itself when the favour is done.' : ''}</p>
        <div class="foot">${o.req && !o.done ? '' : '<button id="sill-bin">Throw it away</button>'}<button id="sill-hold">Pick it up</button><button class="primary" id="sill-tick">${o.done ? 'Untick it' : 'Tick it off'}</button></div>`;
    } else if (o.kind === 'seeds') {
      const c = ITEMS[o.crop];
      html = `<h2>${c.icon} ${c.name} seeds</h2>
        <p class="ink">A paper packet from ${esc(o.from)}, folded twice. ${c.days} days to grow.</p>
        <p>Gives one extra every pick. Click an empty pot on the windowsill and the packet will be offered there.</p>
        <div class="foot"><button id="sill-hold">Pick it up</button><button class="primary" id="sheet-cancel">Leave it there</button></div>`;
    } else if (o.kind === 'recipe') {
      const r = RECIPES[o.recipe];
      const needs = Object.entries(r.needs).map(([iid, n]) => `${ITEMS[iid].icon} ${n} ${plural(n, iid).toLowerCase()}`).join(' &nbsp;·&nbsp; ');
      const fans = FOLK.filter((f) => f.likes.includes(o.recipe)).map((f) => f.name).join(', ');
      html = `<h2>${r.icon} ${r.name}</h2>
        <p class="ink">A recipe card in ${esc(o.from)}'s handwriting. It's already copied into the cookbook.</p>
        <div class="speech">${needs}</div>
        <p>${r.seasons.length === SEASONS.length ? 'Any season.' : `A ${r.seasons.map((s) => s.toLowerCase()).join(' or ')} recipe, though the kitchen table doesn't mind.`}${fans ? ` Loved by ${fans}.` : ''}</p>
        <div class="foot"><button id="sill-hold">Pick it up</button><button class="primary" id="sill-bin">Tuck it in the cookbook</button></div>`;
    } else {
      html = `<h2>${o.icon} ${esc(o.name)}</h2><p class="ink">${esc(o.text)}</p><p>From ${esc(o.from)}. It stays.</p>
        <div class="foot"><button id="sill-hold">Pick it up</button><button class="primary" id="sheet-cancel">Close</button></div>`;
    }
    openSheet(html);
    $('sheet-cancel')?.addEventListener('click', closeSheet);
    $('sill-hold')?.addEventListener('click', () => { held = i; closeSheet(); render(); toast('Picked up. Click where it should go on the board, or Esc to put it back.'); });
    $('sill-bin')?.addEventListener('click', () => { S.sill.splice(i, 1); closeSheet(); save(); render(); });
    $('sill-tick')?.addEventListener('click', () => { o.done = !o.done; closeSheet(); save(); render(); });
  }

  function openJotSheet() {
    openSheet(`<h2>📝 Jot a note</h2><p>Something to remember. It goes on the pinboard until you tick it off.</p>
      <input type="text" id="jot-text" maxlength="48" placeholder="Sow tomatoes when it warms up" autocomplete="off" />
      <div class="foot"><button id="sheet-cancel">Never mind</button><button class="primary" id="jot-ok">Stick it on the sill</button></div>`);
    const ok = () => {
      const t = $('jot-text').value.trim();
      if (!t) { toast('Write something first.'); return; }
      sillAdd({ kind: 'note', text: t, done: false });
      closeSheet();
      save();
      render();
    };
    $('jot-ok').addEventListener('click', ok);
    $('jot-text').addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
    $('sheet-cancel').addEventListener('click', closeSheet);
    setTimeout(() => $('jot-text').focus(), 50);
  }

  function renderSill() {
    if (typeof held === 'number' && held >= S.sill.length) held = null;
    const scene = $('sill-scene');
    scene.dataset.weather = S.weather;
    $('sky-icon').textContent = WEATHER[S.weather].icon;
    renderPots();
    const el = $('sill');
    el.classList.toggle('placing', typeof held === 'number');
    el.innerHTML = S.sill.map((o, i) => {
      const cls = `sill-item ${o.kind}${o.done ? ' done' : ''}${held === i ? ' held' : ''}`;
      const attrs = `data-sill="${i}" draggable="true" style="--tilt:${((i * 7) % 5) - 2}deg"`;
      if (o.kind === 'note') return `<div class="${cls}" ${attrs} title="A note. Click to look at it."><button class="tick" data-tick="${i}" title="${o.done ? 'Untick' : 'Tick it off'}">${o.done ? '✓' : ''}</button><span class="txt">${esc(o.text)}</span></div>`;
      if (o.kind === 'seeds') return `<div class="${cls}" ${attrs} title="${ITEMS[o.crop].name} seeds from ${esc(o.from)}"><span class="ico">${ITEMS[o.crop].icon}</span><span class="lbl">${ITEMS[o.crop].name.toLowerCase()}<br>seeds</span></div>`;
      if (o.kind === 'recipe') return `<div class="${cls}" ${attrs} title="Recipe card: ${RECIPES[o.recipe].name}"><span class="ico">${RECIPES[o.recipe].icon}</span><span class="lbl">${RECIPES[o.recipe].name}</span><span class="from">${esc(o.from)}</span></div>`;
      return `<div class="${cls}" ${attrs} title="${esc(o.name)}"><span class="ico">${o.icon}</span></div>`;
    }).join('') + (S.sill.length ? '' : '<span class="sill-empty">Nothing pinned up. Jot a note, or do someone a favour.</span>');

    el.querySelectorAll('[data-sill]').forEach((it) => {
      const i = Number(it.dataset.sill);
      it.addEventListener('click', (e) => {
        e.stopPropagation();
        if (held === 'can') { toast('Put the can down first.'); return; }
        if (held !== null) {
          if (held !== i) sillMove(held, held < i ? i + 1 : i);
          held = null;
          save();
          render();
          return;
        }
        openSillItem(i);
      });
      it.addEventListener('dragstart', (e) => {
        dragIdx = i;
        it.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', String(i)); } catch (_) { /* old browsers */ }
      });
      it.addEventListener('dragend', () => {
        dragIdx = null;
        it.classList.remove('dragging');
        el.querySelectorAll('.over').forEach((x) => x.classList.remove('over'));
      });
      it.addEventListener('dragover', (e) => { if (dragIdx === null) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; it.classList.add('over'); });
      it.addEventListener('dragleave', () => it.classList.remove('over'));
      it.addEventListener('drop', (e) => {
        if (dragIdx === null) return;
        e.preventDefault();
        e.stopPropagation();
        const from = dragIdx;
        dragIdx = null;
        if (from !== i) sillMove(from, from < i ? i + 1 : i);
        save();
        render();
      });
    });
    el.querySelectorAll('[data-tick]').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      if (held !== null) return;
      const o = S.sill[Number(b.dataset.tick)];
      o.done = !o.done;
      save();
      render();
    }));

    // status lines: one for the pots, one for the pinboard
    const ready = S.pots.filter(potRipe).length;
    const thirsty = S.pots.filter((p) => p.crop && !p.wilted && p.dry >= 2).length;
    const wilted = S.pots.filter((p) => p.crop && p.wilted).length;
    const empties = S.pots.filter((p) => !p.crop).length;
    const s = (n) => (n === 1 ? '' : 's');
    $('sill-note').textContent = held === 'can'
      ? `Carrying the can, ${S.can.water} pour${s(S.can.water)} left. Click a pot to water it, or the can to put it down.`
      : [
        ready ? `${ready} ready to pick.` : '',
        wilted ? `${wilted} wilted, water ${wilted === 1 ? 'it' : 'them'}.` : '',
        thirsty ? `${thirsty} will wilt tonight without water.` : '',
        empties ? `${empties} empty pot${s(empties)}.` : '',
      ].filter(Boolean).join(' ') || 'Pots dry out over a couple of days. Pick up the can and tip it over one.';
    const notes = S.sill.filter((o) => o.kind === 'note');
    const todo = notes.filter((o) => !o.done).length;
    const packets = S.sill.filter((o) => o.kind === 'seeds').length;
    const cards = S.sill.filter((o) => o.kind === 'recipe').length;
    $('board-note').textContent = typeof held === 'number'
      ? 'Something in hand. Click another thing to put it before that, or the empty board to put it last. Esc puts it back.'
      : [
        todo ? `${todo} thing${s(todo)} still to do.` : (notes.length ? 'Every note ticked.' : ''),
        packets ? `${packets} seed packet${s(packets)} waiting for a pot or a bed.` : '',
        cards ? `${cards} recipe card${s(cards)} to read.` : '',
      ].filter(Boolean).join(' ');
  }

  // ----------------------------------------------------------------- render

  function render() {
    if (!S) return;
    document.body.dataset.season = seasonName();
    const noActions = S.actions <= 0;

    // hud
    $('hud-date').innerHTML = `<b>${seasonName()}</b> · day ${S.day} · year ${S.year}`;
    const w = WEATHER[S.weather];
    $('hud-weather').textContent = `${w.icon} ${w.name}`;
    let pips = '';
    for (let i = 0; i < S.maxActions; i++) pips += `<span class="pip ${i >= 3 ? 'bonus' : ''} ${i < S.actions ? 'on' : ''}"></span>`;
    $('hud-actions').innerHTML = `<span>${esc(S.name)}</span><span class="pips" title="${S.actions} of ${S.maxActions} actions left">${pips}</span>`;
    $('btn-sleep').classList.toggle('glow', noActions);

    // kitchen table: prune anything the pantry no longer has, then draw the slots
    for (const k of Object.keys(S.table)) {
      if (!ITEMS[k] || !(S.pantry[k] > 0)) delete S.table[k];
      else S.table[k] = Math.min(S.table[k], S.pantry[k]);
    }
    const tIds = Object.keys(S.table);
    let slots = '';
    for (let i = 0; i < TABLE_SLOTS; i++) {
      const id = tIds[i];
      slots += id
        ? `<button class="slot filled" data-take="${id}" title="Put one back in the pantry"><span class="icon">${ITEMS[id].icon}</span><span class="n">${ITEMS[id].name}</span>${S.table[id] > 1 ? `<span class="x">×${S.table[id]}</span>` : ''}</button>`
        : `<span class="slot empty">${!tIds.length && i === 0 ? 'tap the pantry' : ''}</span>`;
    }
    $('table-slots').innerHTML = slots;
    $('table-slots').querySelectorAll('[data-take]').forEach((el) => el.addEventListener('click', () => tableTake(el.dataset.take)));
    const match = matchRecipe(S.table);
    $('btn-make').disabled = noActions || !tIds.length;
    $('btn-make').textContent = match && S.known.includes(match) ? `Make ${RECIPES[match].name.toLowerCase()}` : 'Make it';
    $('btn-clear').classList.toggle('hidden', !tIds.length);
    $('btn-cook').textContent = `Cookbook · ${S.known.length}/${Object.keys(RECIPES).length}`;

    $('dishes').innerHTML = S.shelf.length
      ? S.shelf.map((id, i) => `<span class="dish"><span class="icon">${RECIPES[id].icon}</span>${RECIPES[id].name}<button data-eat="${i}" ${S.ateToday ? 'disabled' : ''} title="${S.ateToday ? 'Already eaten today' : 'Free. Gives a fourth action tomorrow.'}">Eat</button></span>`).join('')
      : `<span class="empty-hint">Nothing on the shelf. Eat something and tomorrow has room for a fourth thing.</span>`;
    $('dishes').querySelectorAll('[data-eat]').forEach((el) => el.addEventListener('click', () => eatDish(Number(el.dataset.eat))));

    const pantryIds = Object.keys(S.pantry).sort((a, b) => (ITEMS[a].kind > ITEMS[b].kind ? 1 : ITEMS[a].kind < ITEMS[b].kind ? -1 : ITEMS[a].name.localeCompare(ITEMS[b].name)));
    $('pantry').innerHTML = pantryIds.length
      ? pantryIds.map((id) => {
        const left = S.pantry[id] - (S.table[id] || 0);
        return `<button class="chip ${ITEMS[id].kind}${left ? '' : ' spent'}" data-put="${id}" title="Put one on the table" ${left ? '' : 'disabled'}>${ITEMS[id].icon} ${ITEMS[id].name} <b>${left}</b></button>`;
      }).join('')
      : '<span class="empty-hint">Bare shelves.</span>';
    $('pantry').querySelectorAll('[data-put]').forEach((el) => el.addEventListener('click', () => tableAdd(el.dataset.put)));

    // windowsill
    renderSill();

    // village
    const met = FOLK.filter((f) => S.flags.greeted[f.id]).length;
    $('village-sub').textContent = met === FOLK.length ? 'Six neighbours down the lane' : `${met} of ${FOLK.length} doors knocked on`;
    $('folk').innerHTML = FOLK.map((f) => {
      const st = S.folk[f.id];
      // Nobody is introduced to you. A door is a door until you knock on it.
      if (!S.flags.greeted[f.id]) {
        return `<button class="person unmet" data-folk="${f.id}">
          <span class="face">${f.door.icon}</span>
          <span class="who"><b>${esc(f.door.title)}</b></span>
          <span class="req">${esc(f.door.blurb)} <em>Knock — it's free.</em></span>
        </button>`;
      }
      let req = '<span class="req">Nothing needed right now.</span>';
      if (st.request) {
        const have = haveRequestItem(st.request);
        req = `<span class="req has">Wants ${st.request.n} ${itemIcon(st.request.item)} ${plural(st.request.n, st.request.item).toLowerCase()} ${have ? '<span class="ok">· you have it</span>' : `<span class="days">· ${st.request.left}d</span>`}</span>`;
      }
      return `<button class="person" data-folk="${f.id}" ${noActions ? 'disabled' : ''}>
        <span class="face">${f.face}</span>
        <span class="who"><b>${f.name}</b><span class="tier">${tierOf(st.friendship)} · ${st.friendship}</span></span>
        <span class="meter"><span class="meter-fill" style="width:${st.friendship}%"></span></span>
        ${req}
      </button>`;
    }).join('');
    $('folk').querySelectorAll('[data-folk]').forEach((el) => el.addEventListener('click', () => openVisitSheet(el.dataset.folk)));
  }

  // ------------------------------------------------------------------- boot

  $('btn-sleep').addEventListener('click', () => { if (S) sleep(); });
  $('btn-cook').addEventListener('click', openCookSheet);
  $('btn-help').addEventListener('click', openHelp);
  $('btn-make').addEventListener('click', tableMake);
  $('btn-clear').addEventListener('click', tableClear);
  $('btn-jot').addEventListener('click', () => { if (S) openJotSheet(); });
  // blank sill: drop or place at the end
  $('sill').addEventListener('dragover', (e) => { if (dragIdx !== null) e.preventDefault(); });
  $('sill').addEventListener('drop', (e) => {
    if (dragIdx === null) return;
    e.preventDefault();
    const from = dragIdx;
    dragIdx = null;
    sillMove(from, S.sill.length);
    save();
    render();
  });
  // a mouse wheel scrolls along the sill, since it only goes sideways
  $('sill').addEventListener('wheel', (e) => {
    const el = $('sill');
    if (el.scrollWidth <= el.clientWidth || e.deltaX || !e.deltaY) return;
    el.scrollLeft += e.deltaY;
    e.preventDefault();
  }, { passive: false });
  $('can').addEventListener('click', (e) => { e.stopPropagation(); if (S) takeCan(); });
  $('sill-scene').addEventListener('click', () => { if (held === 'can') { held = null; render(); } });
  $('sill').addEventListener('click', () => {
    if (typeof held !== 'number') return;
    sillMove(held, S.sill.length);
    held = null;
    save();
    render();
  });
  // only the intro can't be clicked away
  const sheetPinned = () => !!($('intro-begin') || $('intro-continue'));
  $('overlay').addEventListener('click', (e) => {
    if (e.target === $('overlay') && S && !sheetPinned()) closeSheet();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !S) return;
    if (held !== null) { held = null; render(); return; }
    if (!sheetPinned()) closeSheet();
  });

  const existing = load();
  if (existing) { S = existing; pinAllNotes(); render(); }
  openIntro(existing);
})();
