/* The Warden — a small village production game.
   Assign villagers to the farm, the bakery and the shop; grain becomes
   bread becomes coin. No build step, no dependencies. State lives in one
   object and is re-rendered wholesale after every action. */
(() => {
  'use strict';

  const DAYS = 30;
  const TARGET = 300;
  const MAX_VILLAGERS = 12;
  const SAVE_KEY = 'warden-save-v2';

  // ----------------------------------------------------------- workplaces
  // Each workplace has levels. A level sets how many villagers fit and what
  // each of them produces in a day. Upgrades are bought with coins.
  const WORKS = {
    farm: {
      name: 'Farm', verb: 'grow grain', out: 'grain',
      levels: [
        { slots: 2, each: 5, cost: 0,  blurb: 'Two strips of barley.' },
        { slots: 3, each: 6, cost: 30, blurb: 'A third strip and a proper plough.' },
        { slots: 4, each: 7, cost: 70, blurb: 'The long field, and an ox to work it.' },
      ],
    },
    bakery: {
      name: 'Bakery', verb: 'bake bread', out: 'bread',
      levels: [
        { slots: 1, each: 4, cost: 0,  blurb: 'One small oven, always warm.' },
        { slots: 2, each: 5, cost: 30, blurb: 'A second oven and a long table.' },
        { slots: 3, each: 6, cost: 70, blurb: 'A brick oven the size of a cart.' },
      ],
    },
    shop: {
      name: 'Shop', verb: 'sell bread', out: 'coins',
      levels: [
        { slots: 1, each: 5, price: 2, cost: 0,  blurb: 'A counter, a bell, a queue.' },
        { slots: 2, each: 6, price: 2, cost: 35, blurb: 'A painted sign that travellers can read.' },
        { slots: 3, each: 8, price: 3, cost: 80, blurb: 'Glazed windows. People pay for glazed windows.' },
      ],
    },
    home: { name: 'Home', verb: 'rest', levels: [{ slots: 99, each: 0, cost: 0, blurb: 'A day off. +35 energy.' }] },
  };
  const WORK_ORDER = ['farm', 'bakery', 'shop', 'home'];
  const STORE_LEVELS = [
    { grain: 30, bread: 12, cost: 0,  blurb: 'A shed with a good door.' },
    { grain: 60, bread: 24, cost: 25, blurb: 'A proper granary on stilts.' },
    { grain: 100, bread: 40, cost: 55, blurb: 'A stone storehouse, dry all winter.' },
  ];
  const HIRE_COSTS = [15, 20, 30, 40, 50, 60];

  // Where tokens sit on the SVG map, per workplace.
  const ANCHORS = {
    farm:   [[66, 146], [96, 146], [126, 146], [156, 146]],
    bakery: [[258, 100], [288, 100], [318, 100]],
    shop:   [[258, 190], [288, 190], [318, 190]],
    home:   [[66, 262], [96, 262], [126, 262], [156, 262], [66, 288], [96, 288], [126, 288], [156, 288], [81, 275], [111, 275], [141, 275], [186, 262]],
  };

  // --------------------------------------------------------------- traits
  const TRAITS = {
    greenthumb: { name: 'Green thumb',    blurb: '+2 grain a day on the farm.' },
    bakerhands: { name: 'Baker’s hands',  blurb: '+2 loaves a day in the bakery.' },
    silvertongue: { name: 'Silver tongue', blurb: 'Sells 3 more loaves a day in the shop.' },
    hardy:      { name: 'Hardy',          blurb: 'Work costs them only 6 energy a day.' },
    dreamer:    { name: 'Dreamer',        blurb: 'Work costs them 18 energy a day.' },
    bigeater:   { name: 'Big eater',      blurb: 'Eats two meals.' },
    earlyriser: { name: 'Early riser',    blurb: '+1 output wherever they work.' },
    gossip:     { name: 'Gossip',         blurb: 'In the shop, demand is 2 higher. Everyone hears about the bread.' },
  };

  const PEOPLE = [
    { id: 'brann',  name: 'Brann',  traits: ['bakerhands', 'bigeater'],  note: 'Came for the oven, stayed for the argument.' },
    { id: 'ysolde', name: 'Ysolde', traits: ['silvertongue'],            note: 'Can sell a loaf to a miller.' },
    { id: 'tam',    name: 'Tam',    traits: ['hardy'],                  note: 'Loyal in the way a bad-tempered dog is loyal.' },
    { id: 'maud',   name: 'Maud',   traits: ['greenthumb', 'hardy'],     note: 'Knows every hedge within a day’s walk.' },
    { id: 'osric',  name: 'Osric',  traits: ['dreamer', 'earlyriser'],   note: 'Writes letters he never sends.' },
    { id: 'wren',   name: 'Wren',   traits: ['gossip'],                  note: 'Knows what everyone had for supper. Tells them.' },
  ];
  const RECRUITS = [
    { id: 'hal',    name: 'Hal',    traits: ['hardy'],                   note: 'Arrived with a split lip and no explanation.' },
    { id: 'edda',   name: 'Edda',   traits: ['greenthumb'],              note: 'Says little. Grows most of it.' },
    { id: 'piers',  name: 'Piers',  traits: ['bigeater', 'earlyriser'],  note: 'Eats like a horse and works like one, some say.' },
    { id: 'sibyl',  name: 'Sibyl',  traits: ['bakerhands'],              note: 'Her bread has ended feuds.' },
    { id: 'corin',  name: 'Corin',  traits: ['dreamer', 'greenthumb'],   note: 'Keeps a pebble from his mother’s garden.' },
    { id: 'gudrun', name: 'Gudrun', traits: ['silvertongue', 'gossip'],  note: 'Was promised a better village than this one.' },
  ];
  const COLORS = ['#e07a5f', '#81b29a', '#f2cc8f', '#8ecae6', '#c77dff', '#ffb4a2', '#a3c4f3', '#b5e48c', '#f4a261', '#90e0ef', '#e9c46a', '#cdb4db'];

  // ---------------------------------------------------------------- utils
  const rnd = (n) => Math.floor(Math.random() * n);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const has = (p, t) => p.traits.includes(t);

  // -------------------------------------------------------------- notices
  // One notice arrives each morning. It nudges today's production (mods)
  // and may offer a single spend (option). Options are paid when the day
  // ends, so the stores at the top show what is committed.
  const NOTICES = [
    {
      id: 'quiet', title: 'A quiet morning', kind: 'boon',
      text: 'Smoke from the bakery chimney, rooks in the long field, nothing on the road. An ordinary day, which is the best kind.',
      weight: (s) => (s.day <= 3 ? 3 : 1),
    },
    {
      id: 'fair', title: 'Fair weather', kind: 'boon',
      text: 'Warm, dry and bright. The barley stands up for it. Every farmer brings in 2 extra grain today.',
      mods: { farmEach: 2 }, weight: () => 1.6,
    },
    {
      id: 'rain', title: 'Rain on the fields', kind: 'threat',
      text: 'Rain since before dawn and no sign of it stopping. Farmers bring in 2 less grain each today.',
      mods: { farmEach: -2 }, weight: () => 1.4,
    },
    {
      id: 'market', title: 'Market day', kind: 'boon',
      text: 'Carts from three villages and a man selling ribbons. Demand for bread is 8 higher today. Have something to sell.',
      mods: { demand: 8 }, weight: (s) => (s.day >= 3 ? 1.8 : 0.4),
    },
    {
      id: 'merchant', title: 'A grain merchant', kind: 'choice',
      text: 'A covered wagon and a nervous driver. He has sacks to spare and would rather sell them than carry them.',
      option: { id: 'buy', label: 'Buy 12 grain', cost: 10, text: 'Delivered to the storehouse this evening.' },
      weight: () => 1.4,
    },
    {
      id: 'rats', title: 'Rats in the storehouse', kind: 'threat',
      text: 'Something has been at the sacks. Something with a great many cousins. A quarter of the grain is spoiled by nightfall.',
      option: { id: 'cat', label: 'Borrow the miller’s cat', cost: 2, text: 'No grain lost.' },
      weight: (s) => (s.grain >= 12 ? 1.2 : 0.3),
      resolve: (s, c) => {
        if (c.chosen('cat')) { c.log('The cat earned its two coins. No grain lost.', 'good'); return; }
        const loss = Math.floor(s.grain / 4);
        s.grain -= loss;
        c.log(`Rats. ${loss} grain spoiled.`, loss ? 'bad' : 'info');
      },
    },
    {
      id: 'wedding', title: 'A wedding', kind: 'boon',
      text: 'Two families, one long table, and every loaf in the village spoken for. Bread sells for 1 coin more today and demand is 5 higher.',
      mods: { demand: 5, price: 1 }, weight: (s) => (s.day >= 5 ? 1.2 : 0),
    },
    {
      id: 'oven', title: 'A cracked oven', kind: 'threat',
      text: 'A hairline crack and a draught in the wrong place. Each baker makes 2 fewer loaves today.',
      option: { id: 'mason', label: 'Send for the mason', cost: 5, text: 'Patched by noon. No loaves lost.' },
      mods: { bakeryEach: -2 }, weight: (s) => (s.day >= 4 ? 1.2 : 0.3),
      resolve: (s, c) => { if (c.chosen('mason')) { c.mods.bakeryEach = 0; c.log('The mason patched the oven before the first batch. No loaves lost.', 'good'); } },
    },
    {
      id: 'traveller', title: 'A traveller at the crossroads', kind: 'boon',
      text: 'Someone with a bundle and a hopeful look asks whether the village has work. Today, taking someone on costs 10 coins less.',
      mods: { hire: -10 }, when: (s) => s.pool.length > 0 && s.people.length < MAX_VILLAGERS, weight: () => 1.3,
    },
    {
      id: 'steward', title: 'The Lord’s steward', kind: 'choice',
      text: 'He arrives with a ledger and a cold, counts the treasury twice, and reminds you what is owed by Midsummer. Demand is 3 higher; his party wants feeding.',
      mods: { demand: 3 }, weight: (s) => (s.day >= 8 ? 1 : 0),
      resolve: (s, c) => c.log(`The steward wrote down ${s.coins} coins and said nothing, which is his way of saying something.`, 'info'),
    },
    {
      id: 'feast', title: 'Feast eve', kind: 'choice',
      text: 'The old feast day. If the village eats bread tonight, it will remember it. Everyone fed on bread gains double energy from supper.',
      mods: { supper: 2 }, weight: (s) => (s.day >= 6 ? 1 : 0),
    },
    {
      id: 'damp', title: 'Damp in the larder', kind: 'threat',
      text: 'A wet week and a warm one. Any bread still on the shelf tonight beyond half the larder goes green.',
      mods: { breadCapHalf: true }, weight: (s) => (s.bread >= 8 ? 1 : 0.3),
    },
    {
      id: 'pedlar', title: 'A pedlar', kind: 'choice',
      text: 'Ribbons, needles, a knife that folds. He will take bread in trade, and pay well for it: 6 loaves for 15 coins, before the shop opens.',
      option: { id: 'trade', label: 'Trade 6 bread for 15 coins', cost: 0, text: 'Only if there are 6 loaves in the larder at dusk.' },
      weight: (s) => (s.day >= 4 ? 1 : 0),
      resolve: (s, c) => {
        if (!c.chosen('trade')) return;
        if (s.bread >= 6) { s.bread -= 6; s.coins += 15; c.log('The pedlar took six loaves and left fifteen coins. +15 coins.', 'good'); }
        else c.log('Not enough bread to trade. The pedlar shrugged and moved on.', 'info');
      },
    },
  ];
  const NOTICE_BY_ID = Object.fromEntries(NOTICES.map((n) => [n.id, n]));

  // ---------------------------------------------------------------- state
  let S = null;        // game state
  let selected = null; // selected villager id (UI only)
  let helpOpen = false;

  function makePerson(base, color) {
    return { ...base, traits: [...base.traits], energy: 80 + rnd(21), hunger: 0, work: 'home', xp: {}, color };
  }

  function newGame() {
    S = {
      day: 1, grain: 24, bread: 6, coins: 20,
      levels: { farm: 0, bakery: 0, shop: 0, store: 0 },
      hires: 0,
      people: PEOPLE.map((p, i) => makePerson(p, COLORS[i])),
      pool: RECRUITS.map((r) => r.id),
      recent: [], noticeId: null, chosen: false, breadSupper: false,
      phase: 'day', report: [], over: null, nextColor: PEOPLE.length,
      history: [], // one entry per completed day: {day, grain, bread, sold, coins}
    };
    S.people[3].work = 'farm';
    S.people[2].work = 'farm';
    S.people[0].work = 'bakery';
    S.people[1].work = 'shop';
    drawNotice('quiet');
    save();
  }

  function drawNotice(forceId) {
    let id = forceId;
    if (!id) {
      const pool = NOTICES.filter((n) => !S.recent.includes(n.id) && (!n.when || n.when(S)) && n.weight(S) > 0);
      const total = pool.reduce((t, n) => t + n.weight(S), 0);
      let r = Math.random() * total;
      for (const n of pool) { r -= n.weight(S); if (r <= 0) { id = n.id; break; } }
      if (!id) id = pool[pool.length - 1].id;
    }
    S.noticeId = id;
    S.chosen = false;
    S.recent = [id, ...S.recent].slice(0, 3);
  }

  // ------------------------------------------------------------ mechanics
  const at = (work) => S.people.filter((p) => p.work === work);
  const level = (k) => WORKS[k].levels[S.levels[k] || 0];
  const store = () => STORE_LEVELS[S.levels.store];
  const notice = () => NOTICE_BY_ID[S.noticeId];
  const mods = () => ({ farmEach: 0, bakeryEach: 0, demand: 0, price: 0, hire: 0, supper: 1, breadCapHalf: false, ...(notice().mods || {}) });
  const committedCost = () => (S.chosen && notice().option ? notice().option.cost : 0);
  const coinsFree = () => S.coins - committedCost();
  const hireCost = () => Math.max(5, HIRE_COSTS[Math.min(S.hires, HIRE_COSTS.length - 1)] + mods().hire);
  const tired = (p) => p.energy < 25;
  const skilled = (p, work) => (p.xp[work] || 0) >= 5;
  const baseDemand = (day) => 5 + Math.floor((day - 1) * 0.7);
  function demand() { return baseDemand(S.day) + mods().demand + at('shop').filter((p) => has(p, 'gossip')).length * 2; }
  function price() { return level('shop').price + mods().price; }

  // How much one villager produces at their workplace today.
  function output(p, m) {
    m = m || mods();
    const w = p.work;
    if (w === 'home') return 0;
    let n = level(w).each;
    if (w === 'farm') n += m.farmEach + (has(p, 'greenthumb') ? 2 : 0);
    if (w === 'bakery') n += m.bakeryEach + (has(p, 'bakerhands') ? 2 : 0);
    if (w === 'shop') n += has(p, 'silvertongue') ? 3 : 0;
    if (has(p, 'earlyriser')) n += 1;
    if (skilled(p, w)) n += 1;
    if (tired(p)) n = Math.floor(n / 2);
    return Math.max(0, n);
  }

  // The plan for today, as it stands. Shown on the card and used by the
  // night resolution so the two never disagree.
  function forecast() {
    const m = mods();
    const cap = store();
    const grown = at('farm').reduce((t, p) => t + output(p, m), 0);
    const grainAfterFarm = S.grain + grown;
    const bakeCap = at('bakery').reduce((t, p) => t + output(p, m), 0);
    const baked = Math.min(bakeCap, grainAfterFarm);
    const breadOnShelf = S.bread + baked;
    const sellCap = at('shop').reduce((t, p) => t + output(p, m), 0);
    const dem = demand();
    const sold = Math.min(sellCap, dem, breadOnShelf);
    const meals = S.people.reduce((t, p) => t + (has(p, 'bigeater') ? 2 : 1), 0);
    return {
      grown, bakeCap, baked, sellCap, demand: dem, sold, price: price(), income: sold * price(), meals,
      grainCap: cap.grain, breadCap: m.breadCapHalf ? Math.floor(cap.bread / 2) : cap.bread,
      grainShort: bakeCap - baked, unmet: Math.max(0, dem - sold),
    };
  }

  function movePerson(id, work) {
    const p = S.people.find((x) => x.id === id);
    if (!p || !WORKS[work] || p.work === work || S.phase !== 'day') return;
    if (at(work).length >= level(work).slots) return;
    p.work = work;
    save();
  }

  function toggleOption() {
    const o = notice().option;
    if (!o || S.phase !== 'day') return;
    if (S.chosen) { S.chosen = false; save(); return; }
    if (S.coins < o.cost) return;
    S.chosen = true;
    save();
  }

  function upgradeCost(k) {
    const levels = k === 'store' ? STORE_LEVELS : WORKS[k].levels;
    const next = levels[S.levels[k] + 1];
    return next ? next.cost : null;
  }
  function upgrade(k) {
    const cost = upgradeCost(k);
    if (cost === null || S.phase !== 'day' || coinsFree() < cost) return;
    S.coins -= cost;
    S.levels[k] += 1;
    S.spent = (S.spent || 0) + cost;
    save();
  }
  function hire() {
    if (S.phase !== 'day' || !S.pool.length || S.people.length >= MAX_VILLAGERS || coinsFree() < hireCost()) return;
    S.coins -= hireCost();
    S.hires += 1;
    const id = S.pool.shift();
    const base = RECRUITS.find((r) => r.id === id);
    const p = makePerson(base, COLORS[S.nextColor++ % COLORS.length]);
    S.people.push(p);
    S.lastHire = p.name;
    selected = p.id;
    save();
    return p;
  }

  function endDay() {
    const lines = [];
    const log = (text, tone) => lines.push({ text, tone: tone || 'info' });
    const nt = notice();
    const m = mods();
    const ctx = { log, mods: m, chosen: (id) => S.chosen && nt.option && nt.option.id === id };
    S.people.forEach((p) => { delete p.flag; });

    // 1. The notice, then payment for its option.
    if (nt.resolve) nt.resolve(S, ctx);
    if (S.chosen && nt.option && nt.option.cost) { S.coins = Math.max(0, S.coins - nt.option.cost); log(`Paid ${nt.option.cost} coins: ${nt.option.label.toLowerCase()}.`, 'info'); }
    if (S.chosen && nt.id === 'merchant') { S.grain += 12; log('Twelve sacks of grain, delivered.', 'good'); }
    S.chosen = false;

    // 2. Farm.
    const farmers = at('farm');
    const grown = farmers.reduce((t, p) => t + output(p, m), 0);
    S.grain += grown;
    if (farmers.length) log(`Farm: ${farmers.map((p) => p.name).join(', ')} brought in ${grown} grain.`, grown ? 'good' : 'bad');
    else log('Farm: nobody in the fields. No grain grown.', 'warn');

    // 3. Bakery.
    const bakers = at('bakery');
    const bakeCap = bakers.reduce((t, p) => t + output(p, m), 0);
    const baked = Math.min(bakeCap, S.grain);
    S.grain -= baked;
    S.bread += baked;
    if (bakers.length) {
      log(`Bakery: ${bakers.map((p) => p.name).join(', ')} baked ${baked === 1 ? '1 loaf' : `${baked} loaves`} from ${baked} grain.`, baked ? 'good' : 'bad');
      if (bakeCap > baked) log(`The ovens could have made ${bakeCap - baked} more but the grain ran out.`, 'warn');
    } else log('Bakery: cold ovens. Nothing baked.', 'warn');

    // 4. Shop.
    const keepers = at('shop');
    const sellCap = keepers.reduce((t, p) => t + output(p, m), 0);
    const dem = demand();
    const breadBefore = S.bread;
    const sold = Math.min(sellCap, dem, breadBefore);
    const pr = price();
    S.bread -= sold;
    S.coins += sold * pr;
    if (keepers.length) {
      log(`Shop: ${keepers.map((p) => p.name).join(', ')} sold ${sold} of ${dem} loaves wanted, at ${pr} coins each. +${sold * pr} coins.`, sold ? 'good' : 'bad');
      if (sold < dem && sold === breadBefore) log(`${dem - sold} customers went home without bread. There was none left to sell.`, 'warn');
      else if (sold < dem && sold === sellCap) log(`${dem - sold} customers left unserved. The counter could not keep up.`, 'warn');
    } else if (dem) log(`Shop: shuttered. ${dem} customers found the door locked.`, 'warn');

    // 5. Supper. Hungriest eat first.
    const order = [...S.people].sort((a, b) => b.hunger - a.hunger);
    const unfed = [];
    let ateBread = 0, ateGrain = 0;
    for (const p of order) {
      const need = has(p, 'bigeater') ? 2 : 1;
      if (S.breadSupper && S.bread >= need) { S.bread -= need; ateBread += need; p.hunger = Math.max(0, p.hunger - 1); p.energy = clamp(p.energy + 8 * m.supper, 0, 100); }
      else if (S.grain >= need) { S.grain -= need; ateGrain += need; p.hunger = Math.max(0, p.hunger - 1); }
      else unfed.push(p);
    }
    if (ateBread) log(`Supper: ${ateBread} loaves eaten. Bread suppers, +${8 * m.supper} energy.`, 'good');
    if (ateGrain) log(`Supper: ${ateGrain} grain went into the porridge pot.`, 'info');
    if (S.breadSupper && !ateBread && ateGrain) { log('Bread supper was ordered but there was none to spare. Porridge instead.', 'warn'); }
    unfed.forEach((p) => { p.hunger = clamp(p.hunger + 1, 0, 4); p.energy = clamp(p.energy - 20, 0, 100); p.flag = 'went hungry'; });
    if (unfed.length) log(`No supper for ${unfed.map((p) => p.name).join(', ')}. -20 energy and hungrier.`, 'bad');

    // 6. Work, rest and experience.
    for (const p of S.people) {
      if (p.work === 'home') p.energy = clamp(p.energy + 35, 0, 100);
      else {
        const drain = has(p, 'hardy') ? 6 : has(p, 'dreamer') ? 18 : 12;
        p.energy = clamp(p.energy - drain, 0, 100);
        const before = p.xp[p.work] || 0;
        p.xp[p.work] = before + 1;
        if (before + 1 === 5) log(`${p.name} has the hang of the ${WORKS[p.work].name.toLowerCase()} now. +1 output there.`, 'good');
      }
    }

    // 7. Overnight: what will not keep.
    const cap = store();
    const breadCap = m.breadCapHalf ? Math.floor(cap.bread / 2) : cap.bread;
    if (S.grain > cap.grain) { log(`The storehouse holds ${cap.grain} grain. ${S.grain - cap.grain} was left out and spoiled.`, 'bad'); S.grain = cap.grain; }
    if (S.bread > breadCap) { log(`The larder holds ${breadCap} loaves${m.breadCapHalf ? ' in this damp' : ''}. ${S.bread - breadCap} went stale.`, 'bad'); S.bread = breadCap; }

    // 8. Who leaves.
    for (const p of [...S.people]) {
      if (p.hunger >= 4) { log(`${p.name} packed up and walked to the next village, where they feed people.`, 'gone'); S.people.splice(S.people.indexOf(p), 1); }
    }
    for (const p of S.people) {
      if (p.hunger >= 3) log(`${p.name} is starving.`, 'warn');
      else if (tired(p) && p.work !== 'home') log(`${p.name} is worn out and working at half pace. A day at home would fix it.`, 'warn');
    }

    // 9. Ledger and end states.
    S.history.push({ day: S.day, grown, baked, sold, income: sold * pr, coins: S.coins });
    S.report = lines;
    S.phase = 'report';
    if (S.people.length < 2) {
      S.over = { win: false, title: 'The village empties', text: 'Nobody burned it. Nobody starved it, quite. They just left, one by one, until there was no one to open the shop.' };
    } else if (S.day >= DAYS) {
      S.over = S.coins >= TARGET
        ? { win: true, title: 'Midsummer, and the Lord is paid', text: `${S.coins} coins in the chest, ${S.people.length} villagers on the roll, and the steward almost smiled. Ashcombe is yours to keep.` }
        : { win: false, title: 'Midsummer, and the chest is light', text: `${S.coins} of ${TARGET} coins. The steward counted it twice, then wrote a long letter. Somebody else will be warden next year.` };
    }
    save();
  }

  function nextDay() {
    if (S.over) return;
    S.day += 1;
    S.phase = 'day';
    S.report = [];
    drawNotice();
    save();
  }

  // ---------------------------------------------------------------- save
  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* private mode, fine */ }
  }
  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const s = JSON.parse(raw);
      if (!s || !NOTICE_BY_ID[s.noticeId] || !Array.isArray(s.people) || !s.levels) return false;
      S = s;
      return true;
    } catch (e) { return false; }
  }

  // -------------------------------------------------------------- render
  const $ = (id) => document.getElementById(id);

  function render() {
    renderStores();
    renderMap();
    renderRoster();
    renderCard();
    renderOverlay();
  }

  function renderStores() {
    $('night-label').textContent = `Day ${S.day} of ${DAYS}`;
    const cap = store();
    const c = committedCost();
    const cell = (k, label, icon, held, capN, low) =>
      `<div class="store ${low ? 'low' : ''}" title="${label}${capN ? `, storehouse holds ${capN}` : ''}"><span class="ico">${icon}</span><b>${held}</b><span class="lbl">${label}</span>${capN ? `<span class="cap">/${capN}</span>` : ''}${k === 'coins' && c ? `<span class="pending">(-${c})</span>` : ''}</div>`;
    $('stores').innerHTML =
      cell('grain', 'grain', '&#127806;', S.grain, cap.grain, S.grain <= 5) +
      cell('bread', 'bread', '&#127838;', S.bread, cap.bread, false) +
      cell('coins', 'coins', '&#9679;', S.coins - c, 0, false) +
      `<div class="store goal" title="Coins owed to the Lord by day ${DAYS}"><span class="ico">&#9878;</span><b>${Math.min(100, Math.round((S.coins / TARGET) * 100))}%</b><span class="lbl">of ${TARGET}</span><span class="meter"><i style="width:${Math.min(100, (S.coins / TARGET) * 100)}%"></i></span></div>` +
      `<label class="store toggle ${S.breadSupper ? 'on' : ''}" title="Feed the village bread instead of grain porridge. +8 energy each, but fewer loaves to sell."><input type="checkbox" data-action="bread-supper" ${S.breadSupper ? 'checked' : ''} ${S.phase !== 'day' ? 'disabled' : ''}/> bread supper</label>`;
  }

  function renderMap() {
    const f = forecast();
    const selPerson = selected ? S.people.find((p) => p.id === selected) : null;
    const flags = {
      farm: at('farm').length === 0 ? 'need' : '',
      bakery: at('bakery').length === 0 ? 'need' : f.grainShort > 0 ? 'need' : '',
      shop: at('shop').length === 0 ? 'need' : f.unmet > 0 && f.sellCap <= f.sold ? 'need' : '',
      home: '',
    };
    const cls = (w) => `post ${flags[w]} ${selPerson && selPerson.work !== w && at(w).length < level(w).slots ? 'droppable' : ''} ${selPerson && selPerson.work === w ? 'current' : ''}`;
    const count = (w) => `${at(w).length}/${level(w).slots === 99 ? '∞' : level(w).slots}`;
    const tokens = (w) => at(w).map((p, i) => {
      const [x, y] = ANCHORS[w][Math.min(i, ANCHORS[w].length - 1)];
      return `<g class="token ${selected === p.id ? 'sel' : ''} ${tired(p) ? 'tired' : ''}" data-action="select" data-id="${p.id}" transform="translate(${x},${y})"><circle r="11" fill="${p.color}"/><text y="4" text-anchor="middle">${esc(p.name[0])}</text><title>${esc(p.name)}</title></g>`;
    }).join('');
    const lv = (k) => 'I'.repeat(S.levels[k] + 1);
    const fenceX = [28, 52, 76, 100, 124, 148, 172, 228, 252, 276, 300, 324, 348, 372];
    const fence = fenceX.map((x) => `<rect x="${x - 2}" y="18" width="4" height="10" fill="#7a6242"/>`).join('') +
      [40, 70, 100, 130, 160, 190, 220, 250, 280].map((y) => `<rect x="18" y="${y - 2}" width="10" height="4" fill="#7a6242"/><rect x="372" y="${y - 2}" width="10" height="4" fill="#7a6242"/>`).join('');
    const rows = S.levels.farm + 2;
    const farmRows = Array.from({ length: 6 }, (_, i) => 66 + i * 14).map((y) => `<line x1="${48}" y1="${y}" x2="${36 + 28 * (rows + 1)}" y2="${y}" stroke="#55682c" stroke-width="2"/>`).join('');
    const trees = [[196, 60], [214, 44], [232, 300], [56, 30], [362, 300]].map(([x, y]) => `<g transform="translate(${x},${y})"><circle r="8" fill="#2f5233"/><circle cx="-4" cy="3" r="6" fill="#3a6a3e"/><rect x="-1" y="6" width="2" height="6" fill="#4a3a26"/></g>`).join('');
    const smoke = at('bakery').length ? `<g class="smoke"><circle cx="0" cy="0" r="3" fill="#d9d4c7" opacity="0.7"/><circle cx="3" cy="-8" r="4" fill="#d9d4c7" opacity="0.5"/><circle cx="-1" cy="-17" r="5" fill="#d9d4c7" opacity="0.3"/></g>` : '';
    const queue = Math.min(6, Math.ceil(f.demand / 4));
    const customers = at('shop').length ? Array.from({ length: queue }, (_, i) => `<g transform="translate(${226 - i * 9},${172 - (i % 2) * 3})"><circle r="3.5" fill="#c9b79c"/><rect x="-3" y="3" width="6" height="7" rx="1" fill="${['#7a4b3a', '#4a5a7a', '#5a6a3a', '#7a6a3a', '#6a3a5a', '#3a6a6a'][i]}"/></g>`).join('') : '';
    $('map').innerHTML = `
      <defs><pattern id="grass" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#3d5a3a"/><circle cx="2" cy="6" r="0.8" fill="#4a6b45"/></pattern>
      <pattern id="awning" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#b23a3a"/><rect width="4" height="8" fill="#e6d8b8"/></pattern></defs>
      <rect x="0" y="0" width="400" height="320" fill="#2a2f35"/>
      <rect x="20" y="20" width="360" height="280" fill="url(#grass)"/>
      <g class="deco">
        <rect x="24" y="24" width="352" height="272" fill="none" stroke="#5b4a32" stroke-width="2" stroke-dasharray="8 4"/>
        ${fence}
        <path d="M200 300 V214 M200 214 H180 M200 214 H236 M200 214 V126 M200 126 H236" fill="none" stroke="#8a7a5a" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M200 300 V214 M200 214 H180 M200 214 H236 M200 214 V126 M200 126 H236" fill="none" stroke="#9c8c68" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="1 5"/>
        <g transform="translate(200,232)"><circle r="8" fill="#2b3a4a" stroke="#1a222b" stroke-width="2"/><rect x="-9" y="-16" width="18" height="6" rx="1" fill="#5c4a36"/><rect x="-8" y="-11" width="2" height="8" fill="#5c4a36"/><rect x="6" y="-11" width="2" height="8" fill="#5c4a36"/></g>
        ${trees}
      </g>
      <g class="${cls('farm')}" data-action="post" data-post="farm">
        <title>${WORKS.farm.name} ${lv('farm')}: ${level('farm').blurb} Each farmer grows ${level('farm').each} grain a day.</title>
        <rect x="36" y="40" width="140" height="122" rx="6" fill="#6b7f3a" stroke="#3f4d22" stroke-width="2" stroke-dasharray="4 3"/>
        ${farmRows}
        <rect x="132" y="48" width="36" height="28" rx="2" fill="#8b5e3c" stroke="#3b2a1a" stroke-width="2"/>
        <rect x="132" y="48" width="36" height="8" fill="#a0522d"/>
        <rect x="146" y="62" width="8" height="14" fill="#3a2d1f"/>
        <text class="post-label" x="106" y="176" text-anchor="middle">Farm ${lv('farm')} · ${count('farm')}</text>
        <text class="post-label small" x="106" y="188" text-anchor="middle">${at('farm').length ? `+${f.grown} grain today` : 'nobody in the fields'}</text>
        <rect class="hit" x="36" y="40" width="140" height="150"/>
      </g>
      <g class="${cls('bakery')}" data-action="post" data-post="bakery">
        <title>${WORKS.bakery.name} ${lv('bakery')}: ${level('bakery').blurb} Each baker turns ${level('bakery').each} grain into ${level('bakery').each} loaves.</title>
        <rect x="244" y="52" width="88" height="58" rx="3" fill="#8b5e3c" stroke="#3b2a1a" stroke-width="2"/>
        <rect x="244" y="52" width="88" height="14" fill="#a0522d"/>
        <rect x="316" y="38" width="8" height="18" fill="#3b3934"/>
        <g transform="translate(320,34)">${smoke}</g>
        <rect x="268" y="80" width="14" height="14" rx="7" fill="#e07a5f" opacity="0.85"/>
        <rect x="268" y="87" width="14" height="7" fill="#3a2d1f"/>
        <text class="post-label" x="288" y="124" text-anchor="middle">Bakery ${lv('bakery')} · ${count('bakery')}</text>
        <text class="post-label small" x="288" y="136" text-anchor="middle">${at('bakery').length ? `${f.baked} loaves today${f.grainShort ? ' · short of grain' : ''}` : 'ovens cold'}</text>
        <rect class="hit" x="244" y="38" width="88" height="100"/>
      </g>
      <g class="${cls('shop')}" data-action="post" data-post="shop">
        <title>${WORKS.shop.name} ${lv('shop')}: ${level('shop').blurb} Each keeper sells up to ${level('shop').each} loaves at ${level('shop').price} coins.</title>
        <rect x="244" y="150" width="88" height="52" rx="3" fill="#7a6a58" stroke="#3b3128" stroke-width="2"/>
        <rect x="244" y="150" width="88" height="10" fill="#5e5044"/>
        <rect x="240" y="160" width="96" height="10" fill="url(#awning)" stroke="#3b3128" stroke-width="1"/>
        <rect x="256" y="176" width="20" height="16" fill="#e6d8b8" stroke="#3b3128"/>
        <rect x="300" y="176" width="20" height="16" fill="#e6d8b8" stroke="#3b3128"/>
        ${customers}
        <text class="post-label" x="288" y="216" text-anchor="middle">Shop ${lv('shop')} · ${count('shop')}</text>
        <text class="post-label small" x="288" y="228" text-anchor="middle">${at('shop').length ? `sells ${f.sold} of ${f.demand} wanted` : `${f.demand} customers, shut`}</text>
        <rect class="hit" x="240" y="140" width="96" height="92"/>
      </g>
      <g class="${cls('home')}" data-action="post" data-post="home">
        <title>${WORKS.home.name}: ${WORKS.home.blurb}</title>
        <rect x="40" y="212" width="58" height="42" rx="3" fill="#7a6a58" stroke="#3b3128" stroke-width="2"/>
        <rect x="40" y="212" width="58" height="9" fill="#5e5044"/>
        <rect x="62" y="236" width="12" height="18" fill="#3a2d1f"/>
        <rect x="112" y="212" width="58" height="42" rx="3" fill="#7a6a58" stroke="#3b3128" stroke-width="2"/>
        <rect x="112" y="212" width="58" height="9" fill="#5e5044"/>
        <rect x="134" y="236" width="12" height="18" fill="#3a2d1f"/>
        <text class="post-label" x="105" y="302" text-anchor="middle">Home · ${at('home').length} resting</text>
        <rect class="hit" x="36" y="204" width="160" height="100"/>
      </g>
      <g class="deco">
        <rect x="244" y="248" width="88" height="46" rx="3" fill="#a08a5a" stroke="#5a4a2a" stroke-width="2"/>
        <rect x="244" y="248" width="88" height="10" fill="#7f6a3c"/>
        <text class="post-label" x="288" y="272" text-anchor="middle">Storehouse ${lv('store')}</text>
        <text class="post-label small" x="288" y="286" text-anchor="middle">${S.grain}/${store().grain} grain · ${S.bread}/${store().bread} bread</text>
      </g>
      ${WORK_ORDER.map(tokens).join('')}
    `;
    const hint = $('map-hint');
    if (S.phase !== 'day') hint.textContent = '';
    else if (selPerson) hint.textContent = `Moving ${selPerson.name}. Click the farm, bakery, shop or a house, or click them again to cancel.`;
    else hint.textContent = 'Pick a villager, then click where they should work today.';
  }

  function renderRoster() {
    const items = S.people.map((p) => {
      const tone = p.hunger >= 3 || p.energy < 10 ? 'crit' : tired(p) ? 'low' : '';
      const opts = WORK_ORDER.map((k) => {
        const full = p.work !== k && at(k).length >= level(k).slots;
        return `<option value="${k}" ${p.work === k ? 'selected' : ''} ${full ? 'disabled' : ''}>${WORKS[k].name}${full ? ' (full)' : ''}</option>`;
      }).join('');
      const traits = p.traits.map((t) => `<span class="trait" title="${esc(TRAITS[t].blurb)}">${TRAITS[t].name}</span>`).join('');
      const skills = ['farm', 'bakery', 'shop'].filter((w) => skilled(p, w)).map((w) => `<span class="trait skill" title="Five days of practice. +1 output at the ${WORKS[w].name.toLowerCase()}.">${WORKS[w].name} &#9733;</span>`).join('');
      const hunger = [0, 1, 2, 3].map((i) => `<i class="${i < p.hunger ? 'on' : ''}"></i>`).join('');
      const note = p.flag ? p.flag[0].toUpperCase() + p.flag.slice(1) + '.' : p.note;
      const out = p.work === 'home' ? 'resting' : p.work === 'shop' ? `sells ${output(p)}` : `+${output(p)} ${WORKS[p.work].out}`;
      return `<div class="person ${selected === p.id ? 'sel' : ''} ${tone}" data-action="select" data-id="${p.id}" tabindex="0" role="button" aria-pressed="${selected === p.id}">
        <span class="dot" style="background:${p.color}">${esc(p.name[0])}</span>
        <div class="who"><b>${esc(p.name)}</b> ${traits}${skills}<div class="note">${esc(note)}</div></div>
        <div class="stats">
          <div class="bar" title="Energy ${p.energy}. Below 25 they work at half pace."><span style="width:${p.energy}%"></span></div>
          <div class="hunger-row"><div class="hunger" title="Hunger ${p.hunger} of 4">${hunger}</div><span class="out">${out}</span></div>
        </div>
        <select class="post-select" data-action="assign" data-id="${p.id}" aria-label="Work for ${esc(p.name)}" ${S.phase !== 'day' ? 'disabled' : ''}>${opts}</select>
      </div>`;
    });
    const canHire = S.pool.length > 0 && S.people.length < MAX_VILLAGERS;
    const hireBtn = canHire
      ? `<button type="button" class="ghost hire" data-action="hire" ${S.phase !== 'day' || coinsFree() < hireCost() ? 'disabled' : ''} title="${esc(RECRUITS.find((r) => r.id === S.pool[0]).name)} is looking for work.">Take someone on · ${hireCost()} coins</button>`
      : `<span class="muted">No more room in the village.</span>`;
    $('roster').innerHTML = `<div class="roster-head"><h2>Villagers</h2><span>${S.people.length} on the roll</span>${hireBtn}</div>` + items.join('');
  }

  function renderCard() {
    const nt = notice();
    const f = forecast();
    const o = nt.option;
    const option = o ? (() => {
      const on = S.chosen;
      const ok = on || S.coins >= o.cost;
      return `<h3>Choice</h3><div class="options"><button type="button" class="option ${on ? 'on' : ''}" data-action="option" ${!ok || S.phase !== 'day' ? 'disabled' : ''} aria-pressed="${on}">
        <span class="opt-label">${esc(o.label)}${o.cost ? ` <em>${o.cost} coins</em>` : ''}</span>
        <span class="opt-text">${esc(o.text)}</span>
      </button></div>`;
    })() : '';
    const row = (name, workers, line, tone) => `<li class="${tone}"><b>${name}</b> <span class="num">${workers}</span> <span class="why">${line}</span></li>`;
    const farmLine = at('farm').length ? `+${f.grown} grain` : 'nobody working';
    const bakeLine = at('bakery').length ? `${f.baked} grain &rarr; ${f.baked} bread${f.grainShort ? ` <em>(${f.grainShort} short of grain)</em>` : ''}` : 'nobody working';
    const shopLine = at('shop').length ? `sells ${f.sold} of ${f.demand} wanted &rarr; +${f.income} coins${f.unmet && f.sellCap <= f.sold ? ' <em>(counter too small)</em>' : f.unmet ? ' <em>(not enough bread)</em>' : ''}` : `${f.demand} customers, nobody serving`;
    const plan = `<ul class="demands plan">
      ${row('Farm', `${at('farm').length}/${level('farm').slots}`, farmLine, at('farm').length ? 'ok' : 'need')}
      ${row('Bakery', `${at('bakery').length}/${level('bakery').slots}`, bakeLine, at('bakery').length && !f.grainShort ? 'ok' : 'need')}
      ${row('Shop', `${at('shop').length}/${level('shop').slots}`, shopLine, at('shop').length && !f.unmet ? 'ok' : 'need')}
      ${row('Supper', `${S.people.length}`, `${f.meals} meals of ${S.breadSupper ? 'bread' : 'porridge (grain)'}`, 'info')}
    </ul>`;
    const yesterday = S.history.length ? S.history[S.history.length - 1] : null;
    const ledger = yesterday ? `<p class="ledger">Yesterday: grew ${yesterday.grown}, baked ${yesterday.baked}, sold ${yesterday.sold} for ${yesterday.income} coins.</p>` : '';
    const upg = (k, label) => {
      const cost = upgradeCost(k);
      const cur = k === 'store' ? STORE_LEVELS[S.levels[k]] : WORKS[k].levels[S.levels[k]];
      const next = k === 'store' ? STORE_LEVELS[S.levels[k] + 1] : WORKS[k].levels[S.levels[k] + 1];
      const desc = !next ? 'Fully built.'
        : k === 'store' ? `Holds ${next.grain} grain and ${next.bread} bread.`
        : k === 'shop' ? `${next.slots} keepers, ${next.each} loaves each at ${next.price} coins.`
        : `${next.slots} workers, ${next.each} ${WORKS[k].out} each.`;
      return `<button type="button" class="option upgrade" data-action="upgrade" data-id="${k}" ${cost === null || S.phase !== 'day' || coinsFree() < cost ? 'disabled' : ''} title="${esc(cur.blurb)}">
        <span class="opt-label">${label} ${cost === null ? '' : `&rarr; ${'I'.repeat(S.levels[k] + 2)}`}${cost !== null ? ` <em>${cost} coins</em>` : ''}</span>
        <span class="opt-text">${desc}</span>
      </button>`;
    };
    $('card').innerHTML = `
      <div class="card-top"><span class="kind kind-${nt.kind}">${nt.kind === 'choice' ? 'notice' : nt.kind === 'threat' ? 'trouble' : 'good news'}</span><span class="card-night">Day ${S.day}</span></div>
      <h2>${esc(nt.title)}</h2>
      <p class="flavour">${esc(nt.text)}</p>
      ${option}
      <h3>Today’s plan</h3>
      ${plan}
      ${ledger}
      <h3>Build</h3>
      <div class="options grid">${upg('farm', 'Farm')}${upg('bakery', 'Bakery')}${upg('shop', 'Shop')}${upg('store', 'Storehouse')}</div>
      <button type="button" class="primary" data-action="night" ${S.phase !== 'day' ? 'disabled' : ''}>End the day</button>
    `;
  }

  function renderOverlay() {
    const ov = $('overlay');
    if (helpOpen) {
      ov.hidden = false;
      ov.innerHTML = `<div class="sheet">
        <h2>How to play</h2>
        <p>You are the warden of Ashcombe, a village of one farm, one bakery and one shop. The Lord wants <b>${TARGET} coins</b> in the chest by Midsummer, <b>${DAYS} days</b> from now. Grain comes from the farm, bread from the bakery, coins from the shop. Keep all three moving.</p>
        <ul>
          <li><b>Assign.</b> Click a villager, then the farm, bakery, shop or a house on the map, or use the dropdown next to each name. Each building has a limited number of places.</li>
          <li><b>Chain.</b> Farmers grow grain. Bakers turn grain into bread, one for one. Shopkeepers sell bread, but only as many loaves as customers want that day, and demand rises as the weeks go on.</li>
          <li><b>Bottlenecks.</b> The plan on the parchment shows today’s numbers before you commit. Red means something is starved or idle: no grain for the ovens, no bread for the counter, or customers the counter cannot serve.</li>
          <li><b>Build.</b> Spend coins to enlarge the farm, bakery, shop or storehouse, or take on another villager. Whatever the storehouse cannot hold overnight spoils.</li>
          <li><b>People.</b> Everyone eats one meal a day, from grain unless you order bread suppers. Work costs energy; a day at home restores it. Below 25 energy they work at half pace. Four days without supper and they leave. Five days at one job makes them skilled there.</li>
          <li><b>Win</b> with ${TARGET} coins on day ${DAYS}. <b>Lose</b> if the village empties, or if the chest is light when the steward comes.</li>
        </ul>
        <button type="button" class="primary" data-action="close-help">To the village</button>
      </div>`;
      return;
    }
    if (S.phase === 'report') {
      ov.hidden = false;
      const lines = S.report.map((l) => `<li class="${l.tone}">${esc(l.text)}</li>`).join('');
      const y = S.history[S.history.length - 1];
      const summary = y ? `<div class="daysum"><span><b>${y.grown}</b> grain grown</span><span><b>${y.baked}</b> bread baked</span><span><b>${y.sold}</b> sold</span><span><b>+${y.income}</b> coins</span></div>` : '';
      const end = S.over ? `<div class="end ${S.over.win ? 'win' : 'lose'}"><h2>${esc(S.over.title)}</h2><p>${esc(S.over.text)}</p><p class="score">Score: ${score()}</p><button type="button" class="primary" data-action="new-game">Start again</button></div>` : '';
      ov.innerHTML = `<div class="sheet">
        <h2>Evening of day ${S.day}</h2>
        ${summary}
        <ul class="report">${lines || '<li class="info">Nothing to report.</li>'}</ul>
        ${end || `<button type="button" class="primary" data-action="next">Next day &rarr;</button>`}
      </div>`;
      return;
    }
    ov.hidden = true;
    ov.innerHTML = '';
  }

  function score() {
    return S.coins + S.people.length * 10 + (S.levels.farm + S.levels.bakery + S.levels.shop + S.levels.store) * 15 + S.grain + S.bread * 2;
  }

  // -------------------------------------------------------------- events
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action;
    if (a === 'select') {
      if (S.phase !== 'day') return;
      selected = selected === el.dataset.id ? null : el.dataset.id;
      render();
    } else if (a === 'post') {
      if (S.phase !== 'day' || !selected) return;
      movePerson(selected, el.dataset.post);
      selected = null;
      render();
    } else if (a === 'option') { toggleOption(); render(); }
    else if (a === 'upgrade') { upgrade(el.dataset.id); render(); }
    else if (a === 'hire') { hire(); render(); }
    else if (a === 'night') { if (S.phase === 'day') { selected = null; endDay(); render(); } }
    else if (a === 'next') { nextDay(); render(); }
    else if (a === 'new-game') {
      if (S.over || S.day === 1 || confirm('Leave this village and start again?')) { helpOpen = false; selected = null; newGame(); render(); }
    }
    else if (a === 'help') { helpOpen = true; render(); }
    else if (a === 'close-help') { helpOpen = false; render(); }
  });
  document.addEventListener('change', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    if (el.dataset.action === 'assign') { movePerson(el.dataset.id, el.value); selected = null; render(); }
    else if (el.dataset.action === 'bread-supper') { S.breadSupper = el.checked; save(); render(); }
  });
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.person')) { e.preventDefault(); e.target.click(); }
    if (e.key === 'Escape') { if (helpOpen) { helpOpen = false; render(); } else if (selected) { selected = null; render(); } }
  });
  // Clicking a select inside a villager row should not also toggle selection.
  document.addEventListener('click', (e) => { if (e.target.matches('.post-select')) e.stopPropagation(); }, true);

  // ---------------------------------------------------------------- boot
  if (!load()) { newGame(); helpOpen = true; }
  render();

  // Console / test hook. Not used by the page itself.
  window.warden = { state: () => S, notices: NOTICES, newGame, movePerson, toggleOption, upgrade, hire, endDay, nextDay, render, forecast, output, demand, drawNotice };
})();
