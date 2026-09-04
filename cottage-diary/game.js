/* Cottage Diary — a life sim with the scope of a to-do list.
   One character, one cottage, one garden, six neighbours. Three things a day. */
(() => {
  'use strict';

  // ------------------------------------------------------------------ data

  const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];
  const DAYS_PER_SEASON = 7;
  const BED_COUNT = 6;
  const SHELF_MAX = 4;
  const SAVE_KEY = 'cottage-diary-v1';

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
    nails: { name: 'Nails', icon: '🔩', kind: 'staple' },
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
      likes: ['strawberry_jam', 'carrot_cake', 'pumpkin_pie', 'honey_cake'],
      wants: [{ item: 'strawberry', n: 3 }, { item: 'tomato', n: 2 }, { item: 'pumpkin', n: 1 }, { item: 'honey', n: 1 }, { item: 'egg', n: 2 }, { item: 'garlic', n: 2 }],
      chat: ['Ada had the kettle on before I knocked.', 'Ada showed me the proper way to knead. I was doing it wrong.', 'Ada says the weather is turning. Ada always says that.', 'Sat with Ada while her bread proved. Neither of us said much.'],
      thanks: ['"Oh, you shouldn\'t have. Well. You should, actually."', '"That\'ll go straight in the oven."', '"You\'re a good sort, you know."'],
    },
    {
      id: 'tomas', name: 'Tomas', role: 'carpenter, smells of sawdust', face: '🧔', gives: 'nails',
      likes: ['onion_soup', 'winter_broth', 'jacket_potato', 'fish_pie'],
      wants: [{ item: 'potato', n: 2 }, { item: 'onion', n: 2 }, { item: 'fish', n: 1 }, { item: 'sweetcorn', n: 2 }, { item: 'jacket_potato', n: 1 }, { item: 'onion_soup', n: 1 }],
      chat: ['Tomas looked at my fence from his doorstep and sighed.', 'Helped Tomas hold a plank. He said "cheers" twice.', 'Tomas is building a gate for the churchyard. Took him an hour to explain the hinges.', 'Tomas told a joke. I think it was a joke.'],
      thanks: ['"Right. Good. Ta."', '"That\'ll do nicely."', '"Didn\'t expect that. Cheers."'],
    },
    {
      id: 'wren', name: 'Wren', role: 'beekeeper, always humming', face: '👩‍🌾', gives: 'honey',
      likes: ['honey_cake', 'strawberry_jam', 'sunflower_loaf', 'garden_salad'],
      wants: [{ item: 'sunflower', n: 1 }, { item: 'lettuce', n: 2 }, { item: 'strawberry', n: 2 }, { item: 'flour', n: 1 }, { item: 'milk', n: 1 }, { item: 'broccoli', n: 1 }],
      chat: ['Wren let me look inside a hive. The bees did not seem to mind.', 'Wren talked about swarms for twenty minutes. I nodded a lot.', 'Wren was lying in the meadow. I lay down too.', 'Wren has named all her queens. Today\'s was called Margaret.'],
      thanks: ['"The bees will be so pleased. Well, I will."', '"Oh! Lovely. Thank you."', '"You didn\'t have to. That\'s why it\'s nice."'],
    },
    {
      id: 'harold', name: 'Harold', role: 'fisherman, mostly retired', face: '👴', gives: 'fish',
      likes: ['fish_pie', 'onion_soup', 'garlic_potatoes', 'corn_chowder'],
      wants: [{ item: 'onion', n: 2 }, { item: 'carrot', n: 2 }, { item: 'garlic', n: 1 }, { item: 'potato', n: 3 }, { item: 'honey', n: 1 }, { item: 'cabbage', n: 1 }],
      chat: ['Harold was on the jetty. We watched the water for a bit.', 'Harold told me about the one that got away. It has grown since last time.', 'Harold says you can tell rain by the gulls. He was right, once.', 'Harold mended a net while I talked. He listens better with his hands busy.'],
      thanks: ['"Hm. Kind of you."', '"Well now. That\'s something."', '"I\'ll not forget that."'],
    },
    {
      id: 'ines', name: 'Ines', role: 'postmistress, keeps a goat', face: '👩', gives: 'milk',
      likes: ['fritters', 'broccoli_bake', 'garden_salad', 'tomato_tart'],
      wants: [{ item: 'sunflower', n: 2 }, { item: 'courgette', n: 2 }, { item: 'lettuce', n: 2 }, { item: 'egg', n: 2 }, { item: 'broccoli', n: 2 }, { item: 'fritters', n: 1 }],
      chat: ['Ines knows everything about everyone. Now she knows a bit about me.', 'Ines\'s goat, Marjorie, ate the corner of my letter.', 'Ines had a parcel for me. It was just seeds, but still.', 'Ines closed the post office early so we could have a cup of tea.'],
      thanks: ['"Well aren\'t you a treasure."', '"Marjorie says thank you. She doesn\'t, but I do."', '"I\'ll tell everyone. In a good way."'],
    },
    {
      id: 'poppy', name: 'Poppy', role: 'eight, lives with her gran, keeps hens', face: '👧', gives: 'egg',
      likes: ['strawberry_jam', 'tomato_tart', 'pumpkin_pie', 'carrot_cake'],
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

  function freshState(name) {
    const beds = [];
    for (let i = 0; i < BED_COUNT; i++) beds.push({ crop: null, progress: 0, dry: 1, withered: false });
    beds[0] = { crop: 'lettuce', progress: 1, dry: 0, withered: false };
    beds[1] = { crop: 'carrot', progress: 0, dry: 1, withered: false };

    const folk = {};
    for (const f of FOLK) folk[f.id] = { friendship: 8, since: 3, request: null };
    folk.poppy.friendship = 14;
    folk.ada.request = { item: 'strawberry', n: 3, left: 9 };
    folk.tomas.request = { item: 'potato', n: 2, left: 7 };

    return {
      name: name || 'You',
      day: 1, season: 0, year: 1,
      weather: 'sunny',
      actions: 3, maxActions: 3,
      wellFed: false, ateToday: false,
      fence: 55,
      beds,
      pantry: { potato: 3, flour: 1, egg: 1 },
      shelf: [],
      folk,
      diary: [],
      stats: { harvests: 0, dishes: 0, visits: 0, mends: 0, requests: 0, rabbits: 0 },
      flags: { fete: false, firstHarvest: false, firstDish: false },
    };
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
      return s && s.beds && s.folk ? s : null;
    } catch (e) { return null; }
  }

  function diary(text, cls) {
    S.diary.push({ t: text, c: cls || '' });
    if (S.diary.length > 400) S.diary.splice(0, S.diary.length - 400);
  }
  function diaryDay() {
    const w = WEATHER[S.weather];
    S.diary.push({ day: `${dayLabel()} · ${w.icon} ${w.name}` });
  }

  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.add('hidden'), 2200);
  }

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

  function seasonalCrops() {
    return Object.keys(ITEMS).filter((id) => ITEMS[id].kind === 'crop' && ITEMS[id].seasons.includes(seasonName()));
  }
  function seasonalRecipes() {
    return Object.keys(RECIPES).filter((id) => RECIPES[id].seasons.includes(seasonName()));
  }

  function bumpFriendship(id, amount) {
    const f = S.folk[id];
    const before = tierIndex(f.friendship);
    f.friendship = clamp(f.friendship + amount, 0, 100);
    const after = tierIndex(f.friendship);
    if (after < before) {
      const who = FOLK.find((x) => x.id === id).name;
      diary(`${who} and I are on ${tierOf(f.friendship).toLowerCase()} terms now.`, 'warm');
    }
  }

  // --------------------------------------------------------------- actions

  function tendBed(i) {
    if (!canAct()) return;
    const b = S.beds[i];
    if (b.crop && !b.withered) {
      const crop = ITEMS[b.crop];
      if (b.progress >= crop.days) {
        harvest(i);
        return;
      }
      if (b.dry === 0) { toast(`The ${crop.name.toLowerCase()} bed is already watered.`); return; }
      b.dry = 0;
      spend();
      diary(pick([
        `Watered the ${plural(2, b.crop).toLowerCase()}. Pulled a few weeds while I was down there.`,
        `Gave the ${crop.name.toLowerCase()} bed a good soak.`,
        `Watering can, ${crop.name.toLowerCase()} bed, ten minutes of quiet.`,
      ]));
      finishAction();
      return;
    }
    openSeedSheet(i, b.withered ? 'clear' : 'plant');
  }

  function harvest(i) {
    const b = S.beds[i];
    const crop = ITEMS[b.crop];
    const n = crop.yield[0] + rnd(crop.yield[1] - crop.yield[0] + 1);
    addItem(b.crop, n);
    S.stats.harvests += 1;
    spend();
    diary(`Picked ${n} ${plural(n, b.crop).toLowerCase()}. ${pick(['Ate one standing up.', 'Good ones, this year.', 'Muddy knees, happy.', 'Basket nearly full.'])}`, 'good');
    if (!S.flags.firstHarvest) { S.flags.firstHarvest = true; diary('First harvest from my own soil. I may have said "look at that" out loud.', 'warm'); }
    const cropId = b.crop;
    S.beds[i] = { crop: null, progress: 0, dry: 1, withered: false };
    save();
    render();
    openSeedSheet(i, 'replant', cropId, n);
  }

  function openSeedSheet(i, mode, harvestedId, harvestedN) {
    const crops = seasonalCrops();
    const heads = mode === 'replant'
      ? [`${harvestedN} ${plural(harvestedN, harvestedId).toLowerCase()} in the basket`, 'Plant something in its place, or leave it to rest.']
      : mode === 'clear'
        ? ['A withered bed', 'Pull out the dead stuff and plant something new.']
        : ['An empty bed', 'What goes in?'];
    let html = `<h2>${heads[0]}</h2><p>${heads[1]}</p><div class="options">`;
    for (const id of crops) {
      const c = ITEMS[id];
      html += `<button class="opt" data-seed="${id}">
        <span class="icon">${c.icon}</span>
        <span><span class="t">${c.name}</span><br><span class="d">${c.days} days to grow · ${c.hardy ? 'hardy, shrugs off frost' : 'tender, frost will take it'}</span></span>
        <span class="r">${mode === 'replant' ? 'free' : '1 action'}</span>
      </button>`;
    }
    html += `</div><div class="foot"><button id="sheet-cancel">${mode === 'replant' ? 'Leave it empty' : 'Never mind'}</button></div>`;
    openSheet(html);
    $('sheet').querySelectorAll('[data-seed]').forEach((btn) => btn.addEventListener('click', () => {
      const id = btn.dataset.seed;
      S.beds[i] = { crop: id, progress: 0, dry: 1, withered: false };
      const c = ITEMS[id];
      if (mode === 'replant') {
        diary(`Put ${c.name.toLowerCase()} seed straight back in the same bed.`);
      } else {
        spend();
        diary(mode === 'clear'
          ? `Cleared the dead bed and sowed ${c.name.toLowerCase()}. Fresh start.`
          : pick([`Sowed a row of ${c.name.toLowerCase()}. ${c.days} days, the packet says.`, `Planted ${c.name.toLowerCase()}. Pressed the soil down with my palm.`]));
      }
      closeSheet();
      finishAction();
    }));
    $('sheet-cancel').addEventListener('click', () => { closeSheet(); if (mode === 'replant') { save(); render(); } });
  }

  function mendFence() {
    if (!canAct()) return;
    if (S.fence >= 100) { toast('The fence is as good as it gets.'); return; }
    const nails = (S.pantry.nails || 0) > 0;
    const gain = nails ? 65 : 40;
    if (nails) takeItems({ nails: 1 });
    S.fence = clamp(S.fence + gain, 0, 100);
    S.stats.mends += 1;
    spend();
    diary(nails
      ? 'Mended the fence properly, with Tomas\'s nails. It will outlast me.'
      : pick(['Patched the fence with whatever was in the shed. It\'ll hold. Probably.', 'Spent the afternoon on the fence. Splinters.', 'Wired up the loose panel. The rabbits watched.']));
    finishAction();
  }

  function openCookSheet() {
    if (!canAct()) return;
    if (S.shelf.length >= SHELF_MAX) { toast('The shelf is full. Eat something or give it away.'); return; }
    const recipes = seasonalRecipes();
    let html = `<h2>The cookbook</h2><p>${seasonName()} pages. Cooking takes an action. Eating a dish is free, and tomorrow you will have energy for a fourth thing.</p><div class="options">`;
    for (const id of recipes) {
      const r = RECIPES[id];
      const ok = hasItems(r.needs);
      const needs = Object.entries(r.needs).map(([iid, n]) => {
        const have = S.pantry[iid] || 0;
        return `<span class="${have >= n ? 'have' : 'missing'}">${ITEMS[iid].icon} ${have}/${n}</span>`;
      }).join(' · ');
      const fans = FOLK.filter((f) => f.likes.includes(id)).map((f) => f.name).join(', ');
      html += `<button class="opt" data-recipe="${id}" ${ok ? '' : 'disabled'}>
        <span class="icon">${r.icon}</span>
        <span><span class="t">${r.name}</span><br><span class="d">${needs}${fans ? ` &nbsp;·&nbsp; loved by ${fans}` : ''}</span></span>
        <span class="r ${ok ? 'good' : ''}">${ok ? 'cook' : 'short'}</span>
      </button>`;
    }
    html += `</div><div class="foot"><button id="sheet-cancel">Close the book</button></div>`;
    openSheet(html);
    $('sheet').querySelectorAll('[data-recipe]').forEach((btn) => btn.addEventListener('click', () => {
      const id = btn.dataset.recipe;
      const r = RECIPES[id];
      takeItems(r.needs);
      S.shelf.push(id);
      S.stats.dishes += 1;
      spend();
      diary(pick([`Made ${r.name.toLowerCase()}. The kitchen smells right.`, `${r.name} on the shelf. Burnt the first attempt, but only a bit.`, `Cooked ${r.name.toLowerCase()} with the radio on.`]), 'good');
      if (!S.flags.firstDish) { S.flags.firstDish = true; diary('First thing cooked in this kitchen. It counts.', 'warm'); }
      closeSheet();
      finishAction();
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
        <span><span class="t">Bring what they asked for</span><br><span class="d">${req.n} ${plural(req.n, req.item).toLowerCase()} · they will give something back</span></span>
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
    } else if (how === 'fulfil') {
      const req = st.request;
      if (RECIPES[req.item]) S.shelf.splice(S.shelf.indexOf(req.item), 1);
      else takeItems({ [req.item]: req.n });
      st.request = null;
      S.stats.requests += 1;
      bumpFriendship(id, 18);
      const back = f.gives === 'nails' ? 1 : 2;
      addItem(f.gives, back);
      diary(`Brought ${f.name} the ${plural(req.n, req.item).toLowerCase()}. ${pick(f.thanks)} Came home with ${ITEMS[f.gives].name.toLowerCase()}.`, 'good');
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

    // garden overnight
    const heat = S.weather === 'heat';
    for (const b of S.beds) {
      if (!b.crop || b.withered) continue;
      const c = ITEMS[b.crop];
      if (b.progress >= c.days) continue; // ripe crops wait patiently
      if (b.dry <= 1) b.progress += 1;
      b.dry += heat ? 2 : 1;
      if (b.dry >= 3) {
        b.withered = true;
        diary(`The ${c.name.toLowerCase()} bed dried out. Should have watered it.`, 'bad');
      }
    }

    // fence
    S.fence = clamp(S.fence - (S.weather === 'windy' ? 9 : 4), 0, 100);
    const growing = S.beds.map((b, i) => (b.crop && !b.withered ? i : -1)).filter((i) => i >= 0);
    if (S.fence < 40 && growing.length && Math.random() < 0.35) {
      const i = pick(growing);
      const eaten = S.beds[i].crop;
      S.beds[i] = { crop: null, progress: 0, dry: 1, withered: false };
      S.stats.rabbits += 1;
      diary(`Rabbits got through the fence in the night and had the ${plural(2, eaten).toLowerCase()}. Every one.`, 'bad');
    }

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
        }
      } else if (Math.random() < 0.28) {
        const r = newRequest(f);
        if (r) { st.request = r; diary(`${f.name} is after ${r.n} ${plural(r.n, r.item).toLowerCase()}.`); }
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
    if (S.weather === 'rain') {
      for (const b of S.beds) if (b.crop && !b.withered) b.dry = 0;
      diary('Rain overnight. The garden has had its drink.');
    }
    if (S.weather === 'frost') {
      const lost = [];
      for (const b of S.beds) {
        if (b.crop && !b.withered && !ITEMS[b.crop].hardy && b.progress < ITEMS[b.crop].days) { b.withered = true; lost.push(ITEMS[b.crop].name.toLowerCase()); }
      }
      diary(lost.length ? `Hard frost. It took the ${lost.join(' and ')}.` : 'Hard frost on the windows. The garden is all hardy stuff, so it shrugged.', lost.length ? 'bad' : '');
    }
    if (S.weather === 'heat') diary('Heatwave. Anything I don\'t water today will suffer for it.');
    if (S.weather === 'windy') diary('Wind all night. The fence has been complaining.');
    if (S.maxActions === 4) diary('Slept well on a full stomach. Room for one more thing today.', 'good');
    if (S.fence < 30) diary('The fence is more gap than fence.', 'bad');

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
      if (RECIPES[w.item]) return RECIPES[w.item].seasons.includes(now);
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
        <span>Harvests</span><b>${st.harvests}</b>
        <span>Dishes cooked</span><b>${st.dishes}</b>
        <span>Visits down the lane</span><b>${st.visits}</b>
        <span>Favours done</span><b>${st.requests}</b>
        <span>Fence repairs</span><b>${st.mends}</b>
        <span>Rabbit raids</span><b>${st.rabbits}</b>
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
      <p class="lead ink">A cottage at the end of a lane, a garden with six beds, and six neighbours who have already noticed you.</p>
      <p>Days are short. You get three things done, then it's dark. Tend a bed, cook, visit someone, mend the fence. Seasons change what grows and what's for dinner.</p>`;
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
      $('intro-continue').addEventListener('click', () => { S = existing; closeSheet(); render(); });
      $('intro-new').addEventListener('click', () => openIntro(null));
    } else {
      const begin = () => {
        const name = $('intro-name').value.trim() || 'You';
        S = freshState(name);
        diaryDay();
        diary(`Moved into the cottage at the end of the lane. The key sticks. The kettle works. Three things a day feels about right.`);
        diary('Someone has left lettuce and carrots in already. A welcome, or a test.');
        diary('Ada from the top of the lane would like strawberries. Tomas next door wants potatoes, and I happen to have some.');
        save();
        closeSheet();
        render();
      };
      $('intro-begin').addEventListener('click', begin);
      $('intro-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') begin(); });
      setTimeout(() => $('intro-name').focus(), 50);
    }
  }

  function openHelp() {
    openSheet(`<h2>How to play</h2>
      <p class="lead ink">Three actions a day. Spend them, then go to bed. That's the whole rhythm.</p>
      <h3>The garden</h3>
      <ul>
        <li>Click an empty bed to sow something in season. Click a growing bed to water it.</li>
        <li>A bed can go one dry day. On the second it's thirsty. On the third it withers.</li>
        <li>Rain waters everything. Heatwaves dry beds twice as fast. Frost kills tender crops.</li>
        <li>Ripe crops glow. Harvesting one lets you replant it for free.</li>
      </ul>
      <h3>The cottage</h3>
      <ul>
        <li>Cook from the season's pages of the cookbook. Dishes sit on the shelf.</li>
        <li>Eat a dish (free, once a day) and tomorrow you get a fourth action.</li>
        <li>The fence wears down. Below 40, rabbits start getting in. Nails make a repair last.</li>
      </ul>
      <h3>The village</h3>
      <ul>
        <li>Visit a neighbour to chat, bring a dish, or answer a request. Each is one action.</li>
        <li>Chatting often sends you home with their speciality: flour, honey, eggs, fish, milk or nails.</li>
        <li>Requests expire in a week. Nobody holds a grudge.</li>
        <li>Friendship drifts down a little if you leave someone too long.</li>
      </ul>
      <p>There is no losing. The year turns, the diary fills.</p>
      <div class="foot"><button id="help-reset">Start a new diary</button><button class="primary" id="sheet-cancel">Back</button></div>`);
    $('sheet-cancel').addEventListener('click', closeSheet);
    $('help-reset').addEventListener('click', () => {
      if (confirm('Throw away this diary and start again?')) {
        try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
        openIntro(null);
      }
    });
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

    // garden
    $('garden-sub').textContent = `${seasonName()} seeds: ${seasonalCrops().map((id) => ITEMS[id].icon).join(' ')}`;
    $('beds').innerHTML = S.beds.map((b, i) => {
      if (!b.crop) {
        return `<button class="bed empty" data-bed="${i}"><span class="icon small">🌱</span><span class="name">Empty bed</span><span class="state">Sow something</span></button>`;
      }
      const c = ITEMS[b.crop];
      if (b.withered) {
        return `<button class="bed withered" data-bed="${i}"><span class="icon">${c.icon}</span><span class="name">${c.name}</span><span class="state">Withered · clear it</span></button>`;
      }
      const ready = b.progress >= c.days;
      const pct = Math.round(Math.min(1, b.progress / c.days) * 100);
      const left = c.days - b.progress;
      let state, cls = '';
      if (ready) { state = 'Ready to pick'; cls = 'ready'; }
      else if (b.dry >= 2) { state = 'Thirsty · water today'; cls = 'thirsty'; }
      else state = `${left} day${left === 1 ? '' : 's'} to go`;
      const tag = ready ? '' : (b.dry === 0 ? '<span class="tag wet">watered</span>' : (b.dry === 1 ? '<span class="tag">fine</span>' : ''));
      return `<button class="bed ${cls}" data-bed="${i}">${tag}<span class="icon">${c.icon}</span><span class="name">${c.name}</span><span class="state">${state}</span><div class="grow"><i style="width:${pct}%"></i></div></button>`;
    }).join('');
    $('beds').querySelectorAll('[data-bed]').forEach((el) => el.addEventListener('click', () => tendBed(Number(el.dataset.bed))));
    const thirsty = S.beds.filter((b) => b.crop && !b.withered && b.dry >= 2 && b.progress < ITEMS[b.crop].days).length;
    const ready = S.beds.filter((b) => b.crop && !b.withered && b.progress >= ITEMS[b.crop].days).length;
    $('garden-note').textContent = [
      ready ? `${ready} bed${ready === 1 ? '' : 's'} ready to harvest.` : '',
      thirsty ? `${thirsty} bed${thirsty === 1 ? '' : 's'} will wither tonight without water.` : '',
    ].filter(Boolean).join(' ') || 'Beds go one dry day fine, two thirsty, three withered.';

    // cottage
    const fill = $('fence-fill');
    fill.style.width = `${S.fence}%`;
    fill.className = `meter-fill ${S.fence < 40 ? 'bad' : S.fence < 65 ? 'low' : ''}`;
    $('fence-val').textContent = `${S.fence}`;
    const nails = (S.pantry.nails || 0) > 0;
    $('btn-mend').textContent = S.fence >= 100 ? 'Fence is sound' : `Mend the fence (+${nails ? 65 : 40}${nails ? ', uses nails' : ''})`;
    $('btn-mend').disabled = noActions || S.fence >= 100;
    $('btn-cook').disabled = noActions;

    $('dishes').innerHTML = S.shelf.length
      ? S.shelf.map((id, i) => `<span class="dish"><span class="icon">${RECIPES[id].icon}</span>${RECIPES[id].name}<button data-eat="${i}" ${S.ateToday ? 'disabled' : ''} title="${S.ateToday ? 'Already eaten today' : 'Free. Gives a fourth action tomorrow.'}">Eat</button></span>`).join('')
      : `<span class="empty-hint">Nothing on the shelf. Eat something and tomorrow has room for a fourth thing.</span>`;
    $('dishes').querySelectorAll('[data-eat]').forEach((el) => el.addEventListener('click', () => eatDish(Number(el.dataset.eat))));

    const pantryIds = Object.keys(S.pantry).sort((a, b) => (ITEMS[a].kind > ITEMS[b].kind ? 1 : ITEMS[a].kind < ITEMS[b].kind ? -1 : ITEMS[a].name.localeCompare(ITEMS[b].name)));
    $('pantry').innerHTML = pantryIds.length
      ? pantryIds.map((id) => `<span class="chip ${ITEMS[id].kind}" title="${ITEMS[id].name}">${ITEMS[id].icon} ${ITEMS[id].name} <b>${S.pantry[id]}</b></span>`).join('')
      : '<span class="empty-hint">Bare shelves.</span>';

    // village
    $('folk').innerHTML = FOLK.map((f) => {
      const st = S.folk[f.id];
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

    // diary
    const d = $('diary');
    d.innerHTML = S.diary.map((e) => (e.day ? `<div class="day">${esc(e.day)}</div>` : `<div class="line ${e.c}">${esc(e.t)}</div>`)).join('');
    d.scrollTop = d.scrollHeight;
  }

  // ------------------------------------------------------------------- boot

  $('btn-sleep').addEventListener('click', () => { if (S) sleep(); });
  $('btn-mend').addEventListener('click', mendFence);
  $('btn-cook').addEventListener('click', openCookSheet);
  $('btn-help').addEventListener('click', openHelp);
  $('overlay').addEventListener('click', (e) => {
    if (e.target === $('overlay') && S && !$('intro-begin') && !$('intro-continue')) closeSheet();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && S && !$('intro-begin') && !$('intro-continue')) closeSheet();
  });

  const existing = load();
  if (existing) { S = existing; render(); }
  openIntro(existing);
})();
