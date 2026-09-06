/* Wayside — pick one of three cards to lay the road ahead, then walk it with WASD or the arrows.
   The land runs east for as long as you care to walk it: chapter after chapter, each ending in
   something that bars the way (a river, a wall, a gorge, a briar, a mountain) and hiding, somewhere
   in the stretch before it, the people and things that get you past. Every third chapter ends at a
   dark lighthouse; light it and you have a place to wake up if the wolves get you.
   Drawn on a canvas at sixteen pixels a tile, scaled up whole. Sprites live in sprites.js.
   Saves to localStorage. */
(() => {
  'use strict';

  const ART = window.WaysideArt;

  // ---------- constants ----------
  const SAVE_KEY = 'wayside-save-v3';
  const BEST_KEY = 'wayside-best-v1';
  const ROWS = 5;
  const TILE = 16;                 // world pixels per tile
  const VIEW_H = ROWS * TILE;
  const HEART_CAP = 5;
  const LOOKAHEAD = 14;            // keep this many columns generated beyond the hero
  const LIGHTHOUSE_EVERY = 3;      // chapters
  const START = { r: 2, c: 0 };
  const DIRS = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
  const KEYDIR = { arrowup: 'up', w: 'up', arrowdown: 'down', s: 'down', arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right' };
  const DIR_WORD = { up: 'north', down: 'south', left: 'west', right: 'east' };
  const DIR_KEYS = ['up', 'right', 'down', 'left'];   // bit order for the road masks

  const $ = (s) => document.querySelector(s);
  const rnd = (n) => Math.floor(Math.random() * n);
  const pick = (arr) => arr[rnd(arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const inBounds = (r, c) => r >= 0 && r < ROWS && c >= 0;
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

  // ---------- cards ----------
  // kind: path | item | npc | enemy | block | goal. base is the ground, sprite what stands on it.
  // `spent` is how a used-up card looks afterwards. `road` forces the road to run those ways once
  // the card carries road at all — a bridge is a bridge whatever sits beside it.
  const CARDS = {
    home:       { name: 'Home',          kind: 'path',  base: 'grass', sprite: 'home',      text: 'Your cottage. Everything starts here.' },
    meadow:     { name: 'Meadow',        kind: 'path',  base: 'grass', sprite: 'flowers',   text: 'Open grass and easy walking.' },
    woods:      { name: 'Woods',         kind: 'path',  base: 'woods', sprite: 'tree',      text: 'Pines, and soft needles underfoot.' },
    brook:      { name: 'Brook',         kind: 'path',  base: 'brook', sprite: null,        text: 'A shallow stream. You can step across.' },
    coins:      { name: 'Coin purse',    kind: 'item',  base: 'grass', sprite: 'purse',     text: 'Somebody dropped this. Finders keepers.', spent: { name: 'Empty purse', sprite: 'purseempty' } },
    berries:    { name: 'Berry bush',    kind: 'item',  base: 'grass', sprite: 'bush',      text: 'Eat your fill. Restores one heart.', spent: { name: 'Picked bush', sprite: 'bushpicked' } },
    camp:       { name: 'Campfire',      kind: 'path',  base: 'grass', sprite: 'fire',      text: 'Rest to restore every heart, and wake here if you fall.' },
    wolf:       { name: 'Wolf',          kind: 'enemy', base: 'grass', sprite: 'wolf',      text: 'Bites for one heart. With a sword it flees and leaves a 2 coin bounty.', spent: { name: 'Wolf tracks', sprite: 'tracks' } },
    traveller:  { name: 'Traveller',     kind: 'npc',   base: 'grass', sprite: 'traveller', text: 'Knows the land and will share a rumour.', spent: { name: 'Empty road', sprite: null } },
    lookout:    { name: 'Lookout hill',  kind: 'path',  base: 'grass', sprite: 'hill',      text: 'From the top, every hidden card within two spaces turns over.' },
    sign:       { name: 'Signpost',      kind: 'npc',   base: 'grass', sprite: 'sign',      text: 'Somebody wrote down what lies ahead.' },

    mine:       { name: 'Old mine',      kind: 'item',  base: 'grass', sprite: 'mine',      text: 'A collapsed shaft. Something glints inside.', spent: { name: 'Old mine', sprite: 'mineempty' } },
    smith:      { name: 'Blacksmith',    kind: 'npc',   base: 'grass', sprite: 'smith',     text: 'Forges for anyone who brings iron.' },
    fisher:     { name: 'Fisherman',     kind: 'npc',   base: 'grass', sprite: 'fisher',    text: 'Sits beside a boat that is going nowhere.' },
    reeds:      { name: 'Reeds',         kind: 'item',  base: 'grass', sprite: 'reeds',     text: 'Tall reeds at the water\'s edge.', spent: { name: 'Reeds', sprite: 'reeds' } },
    river:      { name: 'River',         kind: 'block', base: 'water', sprite: null,        text: 'Deep and fast. You would need a boat.' },
    bridge:     { name: 'Bridge',        kind: 'enemy', base: 'bridge', sprite: 'bandit',   road: ['left', 'right'], text: 'A bandit sits on the only bridge.', spent: { name: 'Bridge', sprite: null } },
    hermit:     { name: 'Hermit',        kind: 'npc',   base: 'grass', sprite: 'hermit',    text: 'Lives alone and likes it that way.' },
    hollow:     { name: 'Damp hollow',   kind: 'item',  base: 'woods', sprite: 'mushrooms', text: 'Mushrooms grow in the shade.', spent: { name: 'Damp hollow', sprite: 'mushroomspicked' } },
    wall:       { name: 'Old wall',      kind: 'block', base: 'stone', sprite: null,        text: 'Far too high to climb.' },
    gate:       { name: 'Iron gate',     kind: 'block', base: 'stone', sprite: 'gate',      road: ['left', 'right'], text: 'Locked. There must be a key somewhere.', spent: { name: 'Open gate', sprite: 'gateopen' } },
    chasm:      { name: 'Gorge',         kind: 'block', base: 'dark',  sprite: null,        text: 'A long way down.' },
    brokenbridge: { name: 'Broken bridge', kind: 'block', base: 'dark', sprite: 'brokenbridge', road: ['left', 'right'], text: 'The planks are gone. New ones would mend it.', spent: { name: 'Plank bridge', sprite: null, base: 'plankbridge' } },
    woodcutter: { name: 'Woodcutter',    kind: 'npc',   base: 'woods', sprite: 'woodcutter', text: 'Would cut planks, if he had anything to cut with.' },
    stump:      { name: 'Old stump',     kind: 'item',  base: 'woods', sprite: 'stump',     text: 'An axe left buried in the wood.', spent: { name: 'Old stump', sprite: 'stumpempty' } },
    thorns:     { name: 'Briar',         kind: 'block', base: 'thorns', sprite: null,       text: 'Thorns thicker than your arm. No way through.' },
    troll:      { name: 'Troll\'s gap',  kind: 'enemy', base: 'woods', sprite: 'troll',     road: ['left', 'right'], text: 'The one gap in the briar, and a troll asleep in it.', spent: { name: 'The gap', sprite: null } },
    cliff:      { name: 'Mountain',      kind: 'block', base: 'cliff', sprite: null,        text: 'Sheer rock. Nobody climbs this.' },
    cave:       { name: 'Dark cave',     kind: 'block', base: 'cliff', sprite: 'cave',      road: ['left', 'right'], text: 'A tunnel through the mountain, black as pitch.', spent: { name: 'Lit cave', sprite: 'cavelit' } },
    miner:      { name: 'Miner',         kind: 'npc',   base: 'grass', sprite: 'miner',     text: 'Has lanterns to spare and nothing to dig with.' },
    shed:       { name: 'Tool shed',     kind: 'item',  base: 'grass', sprite: 'shed',      text: 'Somebody left a pick on the shelf.', spent: { name: 'Tool shed', sprite: 'shedempty' } },
    beehive:    { name: 'Beehive',       kind: 'item',  base: 'woods', sprite: 'beehive',   text: 'Full of honey, and of bees.', spent: { name: 'Empty hive', sprite: 'beehiveempty' } },
    pedlar:     { name: 'Pedlar',        kind: 'npc',   base: 'grass', sprite: 'pedlar',    text: 'Sells what the land ahead calls for.' },
    chest:      { name: 'Chest',         kind: 'item',  base: 'grass', sprite: 'chest',     text: 'Unlocked. Something is inside, and it may not be coins.', spent: { name: 'Empty chest', sprite: 'chestopen' } },
    shrine:     { name: 'Shrine',        kind: 'npc',   base: 'grass', sprite: 'shrine',    text: 'An offering here is said to make you hardier.' },
    well:       { name: 'Wishing well',  kind: 'npc',   base: 'grass', sprite: 'well',      text: 'A coin in, and something comes of it. Usually.' },
    bear:       { name: 'Bear',          kind: 'enemy', base: 'woods', sprite: 'bear',      text: 'Two hearts, unless you have a sword or honey to spare.', spent: { name: 'Bear tracks', sprite: 'tracks' } },
    tent:       { name: 'Bandit camp',   kind: 'enemy', base: 'grass', sprite: 'tent',      text: 'They will take your coins. Unless you have a sword.', spent: { name: 'Empty camp', sprite: 'tentempty' } },
    lighthouse: { name: 'Lighthouse',    kind: 'goal',  base: 'sand',  sprite: 'lighthousedark', text: 'Dark. Climb up and light it.', spent: { name: 'Lighthouse', sprite: 'lighthouse' } },
  };

  const ITEMS = {
    ore:       { name: 'Iron ore',  sprite: 'ore' },
    sword:     { name: 'Sword',     sprite: 'sword' },
    oars:      { name: 'Oars',      sprite: 'oars' },
    boat:      { name: 'Boat',      sprite: 'boat' },
    mushrooms: { name: 'Mushrooms', sprite: 'mushrooms' },
    key:       { name: 'Iron key',  sprite: 'key' },
    axe:       { name: 'Axe',       sprite: 'axe' },
    planks:    { name: 'Planks',    sprite: 'planks' },
    honey:     { name: 'Honey',     sprite: 'honey' },
    pick:      { name: 'Pick',      sprite: 'pick' },
    lantern:   { name: 'Lantern',   sprite: 'lantern' },
  };
  const PRICE = { berries: 2, sword: 8, key: 6, planks: 6, honey: 4, lantern: 6 };

  // What you can draw, and how often. This is the deck you start every walk with.
  const DECK = [['meadow', 8], ['woods', 7], ['brook', 4], ['berries', 3], ['camp', 2], ['wolf', 4], ['traveller', 3], ['lookout', 2]];
  const FIND_CHANCE = 0.28;   // chance that plain ground has something dropped on it

  // Every lighthouse you have ever lit stays lit, and the coast remembers: each one puts a new
  // kind of card into the deck for good, on this walk and on every walk after it. This is the
  // only thing in Wayside that carries between journeys, which is why it is the reason to walk
  // the road again.
  const LAMP_CARDS = [
    { at: 1, id: 'sign', w: 3, what: 'a signpost' },
    { at: 2, id: 'mine', w: 2, what: 'an old mine' },
    { at: 3, id: 'chest', w: 2, what: 'a chest' },
    { at: 4, id: 'hollow', w: 3, what: 'a damp hollow' },
    { at: 5, id: 'well', w: 2, what: 'a wishing well' },
    { at: 6, id: 'beehive', w: 2, what: 'a beehive' },
    { at: 7, id: 'shrine', w: 2, what: 'a shrine' },
    { at: 8, id: 'pedlar', w: 2, what: 'a pedlar' },
    { at: 10, id: 'tent', w: 2, what: 'a bandit camp' },
    { at: 12, id: 'smith', w: 1, what: 'a blacksmith' },
    { at: 14, id: 'bear', w: 2, what: 'a bear' },
    { at: 16, id: 'stump', w: 2, what: 'an old stump' },
  ];
  const lampsEver = () => (BEST && BEST.lampsEver) || 0;
  const lampCardsWon = () => LAMP_CARDS.filter((x) => lampsEver() >= x.at);
  const nextLampCard = () => LAMP_CARDS.find((x) => lampsEver() < x.at) || null;
  function deck() {
    return DECK.concat(lampCardsWon().map((x) => [x.id, x.w]));
  }
  function draw() {
    const d = deck();
    let total = 0;
    for (const [, w] of d) total += w;
    let x = rnd(total);
    for (const [id, w] of d) { if (x < w) return id; x -= w; }
    return 'meadow';
  }

  // ---------- chapters ----------
  // Each chapter of the road ends in a barrier with one way through, and seeds the stretch before
  // it with what you need. The pedlar sells the chapter's key item for anyone who would rather pay.
  const CHAPTERS = {
    river: {
      names: ['The Ford', 'Wide Water', 'The Toll Bridge', 'Reedmere', 'Slow River'],
      block: 'river', pass: 'bridge', seeds: ['fisher', 'reeds'], sells: ['sword'],
      sign: 'RIVER AHEAD. One bridge, and a man on it who charges. The fisherman would lend his boat, if only he could find his oars.',
      rumours: [
        'A river cuts the land ahead. There is one bridge, and someone unpleasant sits on it. Five coins, or a blade in your hand.',
        'The fisherman lost his oars in the reeds somewhere in this stretch. Carry them back and he will part with his boat, and a boat crosses any river.',
        'The bandit on that bridge was a toll keeper once, with a licence and a ledger. Nobody has come to relieve him and he has not thought to stop.',
      ],
    },
    wall: {
      names: ['The Long Wall', 'Stonegate', 'The Old Border', 'Hermit\'s Reach', 'Greywall'],
      block: 'wall', pass: 'gate', seeds: ['hermit', 'hollow'], sells: ['key'],
      sign: 'WALL AHEAD. One iron gate, and it is locked. A hermit in these parts keeps a key and speaks to nobody. He is fond of mushrooms.',
      rumours: [
        'A wall crosses the land ahead with one gate in it, locked. A hermit hoards the key. He is fond of mushrooms, which grow in damp hollows.',
        'Mushrooms in the hollow, the hollow in the woods, the hermit wherever he pleases. The pedlar sells keys too, if you have the coin.',
        'That wall was built to keep something in, and the gate was locked from this side. Take from that what you like. The hermit has.',
      ],
    },
    chasm: {
      names: ['The Gorge', 'Broken Span', 'Deepcut', 'The Rift', 'Ravensfall'],
      block: 'chasm', pass: 'brokenbridge', seeds: ['woodcutter', 'stump'], sells: ['planks'],
      sign: 'GORGE AHEAD. The bridge is down. The woodcutter would cut new planks if he had his axe, which he left in a stump.',
      rumours: [
        'The gorge ahead has one bridge and the planks are gone. New planks would mend it. The woodcutter cuts them, if you can find him.',
        'The woodcutter left his axe stuck in a stump somewhere near here and is too proud to admit it. Bring it back and he will cut you planks.',
        'The planks did not rot and they did not blow away. Somebody took them up, one at a time, from the far side.',
      ],
    },
    thorns: {
      names: ['The Briar', 'Thornhold', 'The Tangle', 'Troll\'s Gap', 'Bramblewick'],
      block: 'thorns', pass: 'troll', seeds: ['beehive'], sells: ['honey'],
      sign: 'BRIAR AHEAD. One gap in it, and a troll asleep in the gap. Trolls are sweet on honey. The bees are less friendly.',
      rumours: [
        'The briar ahead cannot be cut. There is one gap, with a troll in it. Trolls take honey, or coins, or a fight if you have a sword and a heart to spare.',
        'There is a beehive somewhere in these woods. The honey is yours if you can stand a sting or two.',
        'That troll has sat in that gap since before the briar grew round it. He is not guarding the gap. The gap grew round him.',
      ],
    },
    mountain: {
      names: ['The High Pass', 'Greystone', 'The Dark Tunnel', 'Miner\'s Rest', 'Coldridge'],
      block: 'cliff', pass: 'cave', seeds: ['miner', 'shed'], sells: ['lantern'],
      sign: 'MOUNTAIN AHEAD. One cave runs through it, black as pitch. The miner has lanterns, and has lost his pick.',
      rumours: [
        'A mountain ahead, and one cave through it. Nobody goes in without a lantern. The miner has a spare, but wants his pick back first.',
        'The miner\'s pick is in a tool shed somewhere in this stretch. Odd place to lose a pick.',
        'The cave is not long. It only feels long. Take the lantern anyway: what is in there is worse in the dark than it is in the light.',
      ],
    },
  };
  const GENERAL_RUMOURS = [
    'Wolves shy away from a drawn blade. Some even pay a bounty, in a manner of speaking.',
    'Every campfire is a place to wake up. Rest at one, and if the worst happens, that is where you come round.',
    'The pedlar walks every stretch of this road. Coins do what errands do, only quicker.',
    'A lighthouse stands every few chapters along the coast. Light them as you go. The keepers left long ago.',
    'A shrine takes three coins and gives you a heart for keeps. Worth every coin.',
    'Bears will take honey over a fight, every time. So will you, I imagine.',
    'Not every chest holds coins. Some hold a snake. Open them anyway.',
    'You can only lay a card beside the one you stand on. Plan the road, then walk it.',
    'Every lamp you light stays lit, and the coast pays you back for it: a new kind of card in your deck, for good. Count them across all your walks, not just this one.',
    'A lookout hill turns over everything within two spaces. Lay one before a stretch you cannot read, not after.',
    'Wolves come in ones. What follows a wolf is usually worse and usually asleep.',
    'The road only runs east because you lay it east. Nothing stops you laying it north for a while, if there is something up there worth having.',
    'A camp is worth more than a heart. Rest at one and it becomes the place you wake, and there is no rule saying you cannot lay another.',
    'Coins buy you out of any barrier on this road. That is not cheating; that is what coins are for.',
    'The smith wants iron and gives back a blade. The mine has iron in it. Nobody has ever told me why those two are not next door.',
    'A wishing well takes a coin and gives back something. I have had a heart out of one. I have had a wet sleeve out of one, too.',
    'They say the keepers all walked east and none of them walked back. They also say the lamps do not need anybody. Both of those are true, which is the trouble.',
    'If you must fight a bear, do it with a sword. If you must meet one without a sword, do it with honey. If you have neither, do it somewhere else.',
    'The pedlar knows what the stretch ahead calls for and will sell you exactly that. He is not a fortune teller. He simply walks it more often than you do.',
  ];
  const TYPES = Object.keys(CHAPTERS);

  // ---------- state ----------
  let S = null;            // the saved game
  let BEST = { far: 0, lamps: 0, lampsEver: 0 };
  let dlg = null;          // open dialogue: { options: [{ label, do }] }
  let flashTimer = 0, bannerTimer = 0;

  const canvas = $('#board'), viewport = $('#viewport'), overlay = $('#overlay'), bannerEl = $('#banner');
  const handEl = $('#hand'), statsEl = $('#stats'), invEl = $('#inv'), logEl = $('#log'), hintEl = $('#hint');
  const questEl = $('#quests');
  const turnEl = $('#turn');
  const ctx = canvas.getContext('2d');
  const off = document.createElement('canvas');
  const octx = off.getContext('2d');

  function cellAt(r, c) {
    if (!inBounds(r, c)) return null;
    return S.grid[r][c] || null;
  }
  function put(r, c, id, extra) {
    while (S.grid[0].length <= c) for (let rr = 0; rr < ROWS; rr++) S.grid[rr].push(null);
    S.grid[r][c] = Object.assign({ id, up: false, used: false, mine: false }, extra || {});
  }

  function freshState() {
    S = {
      v: 3, grid: Array.from({ length: ROWS }, () => []), gen: 0, chapters: [],
      hero: { ...START }, checkpoint: { ...START }, hearts: 3, maxHearts: 3, coins: 0, inv: {}, flags: {},
      hand: [draw(), draw(), draw()], selected: null, phase: 'place',
      steps: 0, placed: 0, far: 0, lamps: 0, seenChapter: -1, rumoursTold: [], log: [],
    };
    ensureGenerated(START.c);
  }

  // lay out the next chapter of the land: a barrier at the far end, a campfire at the near end,
  // and what you need scattered face down in between
  function generateChapter() {
    const i = S.chapters.length;
    const prev = S.chapters[i - 1];
    const start = S.gen;
    const len = 8 + rnd(3);
    const end = start + len - 1;
    const type = i === 0 ? 'river' : pick(TYPES.filter((t) => !prev || t !== prev.type));
    const tpl = CHAPTERS[type];
    const recent = S.chapters.slice(-4).map((c) => c.name);
    const fresh = tpl.names.filter((n) => !recent.includes(n));
    const ch = { i, start, end, type, name: pick(fresh.length ? fresh : tpl.names), passRow: rnd(ROWS), open: false, met: {} };

    for (let r = 0; r < ROWS; r++) put(r, end, r === ch.passRow ? tpl.pass : tpl.block, { ch: i });
    if (i === 0) put(START.r, START.c, 'home', { up: true, mine: true, ch: i });
    else put(rnd(ROWS), start, 'camp', { ch: i });

    const taken = new Set();
    const free = () => {
      for (let tries = 0; tries < 60; tries++) {
        const r = rnd(ROWS), c = start + 1 + rnd(len - 2);
        const k = `${r},${c}`;
        if (taken.has(k) || cellAt(r, c)) continue;
        taken.add(k);
        return [r, c];
      }
      return null;
    };
    const seed = (id, extra) => { const at = free(); if (at) put(at[0], at[1], id, Object.assign({ ch: i }, extra || {})); };

    if (i > 0 && i % LIGHTHOUSE_EVERY === 0) {
      let r = rnd(ROWS);
      put(r, start + 1, 'lighthouse', { up: true, ch: i });
      taken.add(`${r},${start + 1}`);
    }
    tpl.seeds.forEach((id) => seed(id));
    seed('pedlar');
    seed('sign');
    seed('coins', { amount: 2 + rnd(3) });
    seed('berries');
    if (i === 0) { seed('mine'); seed('smith'); seed('coins', { amount: 3 }); }
    else if (Math.random() < 0.3) seed('mine');
    const wolves = Math.min(4, 1 + Math.floor(i / 2)) + rnd(2);
    for (let w = 0; w < wolves; w++) seed('wolf');
    if (i >= 2 && Math.random() < 0.55) seed('bear');
    if (i >= 1 && Math.random() < 0.45) seed('tent');
    if (Math.random() < 0.8) seed('traveller');
    if (Math.random() < 0.5) seed('lookout');
    if (Math.random() < 0.5) seed('chest');
    if (Math.random() < 0.35) seed('shrine');
    if (Math.random() < 0.35) seed('well');
    if (Math.random() < 0.5) seed('coins', { amount: 1 + rnd(3) });

    S.gen = end + 1;
    S.chapters.push(ch);
  }
  function ensureGenerated(col) {
    while (S.gen <= col + LOOKAHEAD) generateChapter();
  }
  function chapterAt(c) {
    return S.chapters.find((ch) => c >= ch.start && c <= ch.end) || S.chapters[S.chapters.length - 1];
  }
  const here = () => chapterAt(S.hero.c);

  function newGame(firstRun) {
    freshState();
    log('You lock the door behind you. The coast runs east, and every lighthouse on it is dark.');
    revealAround(START.r, START.c, true);
    save();
    snapHero();
    snapCamera();
    render();
    if (!firstRun) closeOverlay();
    hint('Lay a card first: pick one with 1, 2 or 3, then press a direction. Then you may step onto it.');
  }

  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* private mode, fine */ }
  }
  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const s = JSON.parse(raw);
      if (!s || s.v !== 3 || !Array.isArray(s.grid) || s.grid.length !== ROWS) return false;
      S = s;
      return true;
    } catch (e) { return false; }
  }
  function loadBest() {
    try { const b = JSON.parse(localStorage.getItem(BEST_KEY)); if (b) BEST = Object.assign({ far: 0, lamps: 0, lampsEver: 0 }, b); } catch (e) { /* fine */ }
  }
  function saveBest() {
    let changed = false;
    if (S.far > BEST.far) { BEST.far = S.far; changed = true; }
    if (S.lamps > BEST.lamps) { BEST.lamps = S.lamps; changed = true; }
    if (changed) try { localStorage.setItem(BEST_KEY, JSON.stringify(BEST)); } catch (e) { /* fine */ }
  }
  // A lamp, once lit, is lit for good. Counted separately from the best single walk, because
  // this is the number the deck grows on.
  function countLampEver() {
    BEST.lampsEver = lampsEver() + 1;
    try { localStorage.setItem(BEST_KEY, JSON.stringify(BEST)); } catch (e) { /* fine */ }
    return LAMP_CARDS.find((x) => x.at === BEST.lampsEver) || null;
  }

  // ---------- journal, hints ----------
  function log(text) {
    S.log.unshift(text);
    if (S.log.length > 60) S.log.length = 60;
  }
  function hint(text) {
    clearTimeout(flashTimer);
    hintEl.classList.remove('flash');
    hintEl.textContent = text;
  }
  function flash(text) {
    clearTimeout(flashTimer);
    hintEl.classList.add('flash');
    hintEl.textContent = text;
    flashTimer = setTimeout(() => { hintEl.classList.remove('flash'); hintEl.textContent = defaultHint(); }, 2800);
  }
  function defaultHint() {
    if (S.phase === 'move') return 'Your card is down. Take a step: WASD, the arrows, or click a tile beside you. Old ground is always free to walk.';
    if (!hasEmptyNeighbour()) return 'No open ground beside you. Step onto any tile you like.';
    if (S.selected !== null) return `Holding ${CARDS[S.hand[S.selected]].name}. Press a direction, or click a marked space, to lay it. Esc puts it back.`;
    return 'Lay a card, then take your step: pick one with 1, 2 or 3, then press a direction.';
  }
  function nextRumour() {
    const ch = here();
    if (!ch.open) {
      const list = CHAPTERS[ch.type].rumours;
      for (let i = 0; i < list.length; i++) {
        const k = `${ch.i}:${i}`;
        if (!S.rumoursTold.includes(k)) { S.rumoursTold.push(k); return list[i]; }
      }
    }
    for (let i = 0; i < GENERAL_RUMOURS.length; i++) {
      const k = `g:${i}`;
      if (!S.rumoursTold.includes(k)) { S.rumoursTold.push(k); return GENERAL_RUMOURS[i]; }
    }
    return pick(GENERAL_RUMOURS);
  }
  function showBanner(ch) {
    bannerEl.innerHTML = `<small>Chapter ${ch.i + 1}</small><b>${ch.name}</b>`;
    bannerEl.hidden = false;
    bannerEl.classList.remove('show');
    void bannerEl.offsetWidth;
    bannerEl.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => { bannerEl.hidden = true; }, 3000);
  }

  // ---------- what you are looking for ----------
  // The side panel only lists an errand once you have run into it, so nothing is spoiled early.
  function quests() {
    const q = [];
    const ch = here();
    const m = ch.met;
    if (S.inv.ore) q.push({ icon: 'ore', text: 'Take the iron ore to the blacksmith, near your home. He will make a sword of it.' });
    else if (m.smith && !S.inv.sword) q.push({ icon: 'sword', text: 'Find iron for the blacksmith: an old mine somewhere close to home. Or eight coins.' });
    if (!ch.open) {
      if (ch.type === 'river' && !S.inv.boat) {
        if (m.bandit) q.push({ icon: 'coin', text: 'Get past the bandit on the bridge: five coins, or a sword in your hand.' });
        if (S.inv.oars) q.push({ icon: 'oars', text: 'Carry the oars back to the fisherman, in this stretch of land. He trades them for his boat.' });
        else if (m.fisher) q.push({ icon: 'reeds', text: 'Find the fisherman\'s oars: tangled in reeds somewhere along here.' });
      }
      if (ch.type === 'wall') {
        if (S.inv.key) q.push({ icon: 'key', text: 'Unlock the iron gate in the long wall. The road east runs through it.' });
        else if (S.inv.mushrooms) q.push({ icon: 'mushrooms', text: 'Bring the mushrooms to the hermit, somewhere in this stretch.' });
        else if (m.hermit || m.gate) q.push({ icon: 'mushrooms', text: 'Find mushrooms for the hermit: they grow in a damp hollow in the woods. Or buy a key from the pedlar.' });
      }
      if (ch.type === 'chasm') {
        if (S.inv.planks) q.push({ icon: 'planks', text: 'Mend the broken bridge over the gorge with the planks.' });
        else if (S.inv.axe) q.push({ icon: 'axe', text: 'Return the axe to the woodcutter and he will cut you planks.' });
        else if (m.woodcutter || m.brokenbridge) q.push({ icon: 'axe', text: 'Find the woodcutter\'s axe, left in a stump in the woods. Or buy planks from the pedlar.' });
      }
      if (ch.type === 'thorns') {
        if (S.inv.honey) q.push({ icon: 'honey', text: 'Give the troll in the gap the honey. Or fight it, or pay it seven coins.' });
        else if (m.troll) q.push({ icon: 'honey', text: 'Find honey for the troll: a beehive in the woods, or the pedlar. Or bring a sword and a spare heart.' });
      }
      if (ch.type === 'mountain') {
        if (S.inv.lantern) q.push({ icon: 'lantern', text: 'Light your way through the dark cave in the mountain.' });
        else if (S.inv.pick) q.push({ icon: 'pick', text: 'Take the pick to the miner. He has a lantern to spare.' });
        else if (m.miner || m.cave) q.push({ icon: 'pick', text: 'Find the miner\'s pick in a tool shed somewhere along here. Or buy a lantern from the pedlar.' });
      }
    }
    let lamp = null;
    for (let r = 0; r < ROWS; r++) { const cell = cellAt(r, ch.start + 1); if (cell && cell.id === 'lighthouse') lamp = cell; }
    if (lamp && !lamp.used) q.push({ icon: 'lampdark', goal: true, text: 'A dark lighthouse stands at the start of this chapter. Climb it and light the lamp.' });
    else {
      let n = ch.i + 1;
      while (n % LIGHTHOUSE_EVERY) n++;
      q.push({ icon: 'lamp', goal: true, text: `The next dark lighthouse is ${plural(n - ch.i, 'chapter')} east. Light it.` });
    }
    return q;
  }

  // ---------- the world ----------
  function revealAround(r, c, quiet) {
    for (const dir of Object.keys(DIRS)) {
      const [dr, dc] = DIRS[dir];
      const cell = cellAt(r + dr, c + dc);
      if (cell && !cell.up) {
        cell.up = true;
        if (!quiet) log(`A card turns over to the ${DIR_WORD[dir]}: ${CARDS[cell.id].name}.`);
      }
    }
  }
  function isAdjacent(r, c) {
    return Math.abs(r - S.hero.r) + Math.abs(c - S.hero.c) === 1;
  }
  function takeOnce(cell, item, text, note) {
    if (cell.used) return;
    cell.used = true;
    S.inv[item] = true;
    log(text);
    flash(note || `Picked up: ${ITEMS[item].name}.`);
  }
  // ordinary ground with nobody on it: now and then somebody has dropped a purse in the grass
  function maybeFind(cell) {
    if (cell.used || cell.id === 'home' || CARDS[cell.id].kind !== 'path') return;
    cell.used = true;
    if (Math.random() >= FIND_CHANCE) return;
    const n = 1 + rnd(3);
    S.coins += n;
    log(`Something in the grass: a dropped purse, ${plural(n, 'coin')} still in it.`);
    flash(`Found ${plural(n, 'coin')}.`);
  }
  function heal(n, why, note) {
    if (S.hearts >= S.maxHearts) { log(why.replace('%', 'You were fine already.')); return; }
    S.hearts = Math.min(S.maxHearts, S.hearts + n);
    log(why.replace('%', 'You feel better for it.'));
    flash(note);
  }
  function hurt(n, why) {
    S.hearts = Math.max(0, S.hearts - n);
    log(why);
    hero.ouch = performance.now();
    if (S.hearts === 0) {
      S.hearts = S.maxHearts;
      S.hero = { ...S.checkpoint };
      S.phase = 'place';
      const at = cellAt(S.hero.r, S.hero.c);
      const where = at && at.id === 'home' ? 'at home' : at && at.id === 'lighthouse' ? 'at the foot of the lighthouse' : 'by the last fire you rested at';
      log(`Everything goes dark. You wake ${where}, bandaged, and every card you laid is still on the ground.`);
      flash(`You wake up ${where}.`);
      snapHero();
    } else {
      flash(why);
    }
  }
  function openWay(cell, how) {
    cell.used = true;
    const ch = S.chapters[cell.ch];
    if (ch) ch.open = true;
    log(how);
  }
  function leave(label) { return [{ label: label || 'Leave', primary: true }]; }

  // per-card behaviour. tryEnter returns false to stop the move (and may open a dialogue that
  // moves you afterwards). arrive fires once you are standing on the card.
  const ON = {
    home: { arrive() { S.checkpoint = { ...START }; } },
    coins: {
      arrive(cell) {
        if (cell.used) return;
        cell.used = true;
        const n = cell.amount || (1 + rnd(3));
        S.coins += n;
        log(`You pocket ${plural(n, 'coin')}.`);
        flash(`+${plural(n, 'coin')}`);
      },
    },
    berries: {
      arrive(cell) {
        if (cell.used) return;
        cell.used = true;
        heal(1, 'Berries. %', 'A heart back.');
      },
    },
    camp: {
      arrive(cell, r, c) {
        const first = S.checkpoint.r !== r || S.checkpoint.c !== c;
        S.checkpoint = { r, c };
        if (S.hearts < S.maxHearts) { S.hearts = S.maxHearts; log('You rest by the fire until you are whole again.'); flash('Rested. All hearts back.'); }
        else if (first) { log('You bank the fire so it will still be here when you need it.'); flash('You will wake here if you fall.'); }
        else log('The fire is warm. Nothing to mend today.');
      },
    },
    wolf: {
      arrive(cell) {
        if (cell.used) return;
        cell.used = true;
        if (S.inv.sword) { S.coins += 2; log('The wolf sees your sword and bolts. It leaves 2 coins in the grass, oddly.'); flash('The wolf flees. +2 coins.'); }
        else hurt(1, 'A wolf! It bites before it runs.');
      },
    },
    bear: {
      arrive(cell) {
        if (cell.used) return;
        cell.used = true;
        if (S.inv.honey) { S.inv.honey = false; log('The bear is more interested in your honey than in you. You leave it the pot and back away.'); flash('The bear takes the honey. You keep your hearts.'); }
        else if (S.inv.sword) { S.coins += 3; log('You stand your ground with the sword out and the bear thinks better of it. Under the tree it was guarding: 3 coins.'); flash('The bear lumbers off. +3 coins.'); }
        else hurt(2, 'A bear. It is not pleased to see you, and says so with a paw.');
      },
    },
    tent: {
      arrive(cell) {
        if (cell.used) return;
        cell.used = true;
        if (S.inv.sword) { S.coins += 4; log('The bandits see the sword and scatter, leaving their takings behind. 4 coins.'); flash('The bandits scatter. +4 coins.'); }
        else if (S.coins > 0) { const n = Math.min(3, S.coins); S.coins -= n; log(`Bandits. They go through your pockets and take ${plural(n, 'coin')}.`); flash(`Robbed of ${plural(n, 'coin')}.`); }
        else hurt(1, 'Bandits. Finding nothing in your pockets, they hit you for wasting their time.');
      },
    },
    chest: {
      arrive(cell) {
        if (cell.used) return;
        cell.used = true;
        if (Math.random() < 0.3) hurt(1, 'You lift the lid and a snake lifts its head. It bites before you can shut it.');
        else { const n = 3 + rnd(4); S.coins += n; log(`The chest holds ${plural(n, 'coin')}, and no snake.`); flash(`+${plural(n, 'coin')}`); }
      },
    },
    traveller: {
      arrive(cell) {
        if (cell.used) return;
        cell.used = true;
        const h = nextRumour();
        log(`Traveller: "${h}"`);
        dialog('traveller', 'Traveller', h, leave('Thank them and move on'));
      },
    },
    sign: {
      arrive(cell) {
        const ch = S.chapters[cell.ch];
        const text = CHAPTERS[ch.type].sign + (cell.used ? '' : ' A pedlar walks this stretch, if you have coin.');
        if (!cell.used) { cell.used = true; log(`The signpost reads: ${CHAPTERS[ch.type].sign}`); }
        dialog('sign', 'Signpost', text, leave('Walk on'));
      },
    },
    lookout: {
      arrive(cell, r, c) {
        let n = 0;
        for (let rr = r - 2; rr <= r + 2; rr++) for (let cc = c - 2; cc <= c + 2; cc++) {
          const other = cellAt(rr, cc);
          if (other && !other.up) { other.up = true; n++; }
        }
        log(n ? `From the hill you make out ${plural(n, 'hidden card')}.` : 'From the hill: nothing new to see.');
        if (n) flash(`${plural(n, 'card')} turned over.`);
      },
    },
    mine: { arrive(cell) { takeOnce(cell, 'ore', 'Iron ore, heavy and cold. The blacksmith near home would want this.', 'Iron ore. Carry it to the blacksmith.'); } },
    reeds: { arrive(cell) { takeOnce(cell, 'oars', 'A pair of oars, tangled in the reeds. These are the fisherman\'s. Walk them back to him and the boat is yours.', 'Oars. Carry them back to the fisherman.'); } },
    hollow: { arrive(cell) { takeOnce(cell, 'mushrooms', 'A capful of mushrooms from the damp hollow. The hermit is fond of these.', 'Mushrooms. The hermit wants these.'); } },
    stump: { arrive(cell) { takeOnce(cell, 'axe', 'An axe, wedged deep in an old stump. It takes both hands to free it. The woodcutter will want this back.', 'An axe. The woodcutter wants it back.'); } },
    shed: { arrive(cell) { takeOnce(cell, 'pick', 'A pick on the shelf of the tool shed, still sharp. The miner would want this.', 'A pick. The miner wants it.'); } },
    beehive: {
      arrive(cell) {
        if (cell.used) return;
        if (S.hearts <= 1) { flash('The hive hums. With one heart left you dare not reach in.'); log('You look at the hive and the hive looks back. Not with one heart left.'); return; }
        cell.used = true;
        S.inv.honey = true;
        S.hearts--;
        hero.ouch = performance.now();
        log('You reach into the hive and come away with a pot of honey and a great many stings.');
        flash('Honey! The bees take a heart for it.');
      },
    },
    smith: {
      arrive() {
        here().met.smith = true;
        if (S.inv.sword) return dialog('smith', 'Blacksmith', 'Keep it sharp, and keep it pointed away from me.', leave());
        const opts = [];
        if (S.inv.ore) opts.push({ label: 'Hand over the iron ore', primary: true, do() { S.inv.ore = false; S.inv.sword = true; log('The smith hammers your ore into a plain, sharp sword.'); flash('You have a sword.'); } });
        if (S.coins >= 8) opts.push({ label: 'Pay 8 coins for a sword', do() { S.coins -= 8; S.inv.sword = true; log('Eight coins buys a sword with somebody else\'s initials on it.'); flash('You have a sword.'); } });
        opts.push({ label: 'Leave' });
        dialog('smith', 'Blacksmith', S.inv.ore
          ? 'That is good ore you have there. Give it here and I will make you something with an edge.'
          : 'Bring me iron and I will make you something with an edge. There is an old mine somewhere about. Or eight coins, if you have no back for digging.', opts);
      },
    },
    fisher: {
      arrive() {
        here().met.fisher = true;
        if (S.inv.boat) return dialog('fisher', 'Fisherman', 'Mind the current. She is a good boat, but she is not a bridge.', leave());
        const opts = [];
        if (S.inv.oars) opts.push({ label: 'Hand over the oars', primary: true, do() { S.inv.oars = false; S.inv.boat = true; log('The fisherman takes his oars and, without a word, pushes his boat toward you. River tiles are yours to cross now, this one and every one after.'); flash('You have a boat. You can cross rivers.'); } });
        opts.push({ label: 'Leave' });
        dialog('fisher', 'Fisherman', S.inv.oars
          ? 'Those are my oars! Lost them in the reeds. Give them here and the boat is yours. I am too old to row anyway.'
          : 'Lost my oars in the reeds, somewhere along here. You will smell them before you see them. Cannot row without them, and I am too old to wade.', opts);
      },
    },
    hermit: {
      arrive(cell) {
        here().met.hermit = true;
        if (cell.used) return dialog('hermit', 'Hermit', 'You again. The gate is east, in the wall. Go and bother it instead.', leave());
        const opts = [];
        if (S.inv.mushrooms) opts.push({ label: 'Offer the mushrooms', primary: true, do() { S.inv.mushrooms = false; S.inv.key = true; cell.used = true; log('The hermit sniffs the mushrooms, nods, and drops an iron key into your hand.'); flash('You have the iron key.'); } });
        opts.push({ label: 'Leave' });
        dialog('hermit', 'Hermit', S.inv.mushrooms
          ? 'Are those... mushrooms? Well. Perhaps you can stay a moment. I have a key I never use.'
          : 'Go away. Unless you have mushrooms. There is a damp hollow in the woods where they grow. Then you may stay a little.', opts);
      },
    },
    woodcutter: {
      arrive(cell) {
        here().met.woodcutter = true;
        if (cell.used) return dialog('woodcutter', 'Woodcutter', 'Planks are planks. Nail them down well and the gorge will not mind you.', leave());
        const opts = [];
        if (S.inv.axe) opts.push({ label: 'Hand back the axe', primary: true, do() { S.inv.axe = false; S.inv.planks = true; cell.used = true; log('The woodcutter turns the axe over twice, says nothing about the stump, and cuts you an armful of planks.'); flash('You have planks. Mend the bridge.'); } });
        opts.push({ label: 'Leave' });
        dialog('woodcutter', 'Woodcutter', S.inv.axe
          ? 'That is my axe. I was not looking for it. But since you have it, I suppose I owe you some planks.'
          : 'The bridge is down and I would cut planks for it, if I had my axe. Which I have not lost. It is in a stump somewhere, resting.', opts);
      },
    },
    miner: {
      arrive(cell) {
        here().met.miner = true;
        if (cell.used) return dialog('miner', 'Miner', 'Keep the lantern high and the cave is just a long room with no windows.', leave());
        const opts = [];
        if (S.inv.pick) opts.push({ label: 'Hand over the pick', primary: true, do() { S.inv.pick = false; S.inv.lantern = true; cell.used = true; log('The miner weighs the pick in his hands, grins, and gives you a lantern that never seems to go out.'); flash('You have a lantern. It lights any cave.'); } });
        opts.push({ label: 'Leave' });
        dialog('miner', 'Miner', S.inv.pick
          ? 'My pick! Left it in the shed and could not face the walk back. Here, take a lantern. I have a dozen.'
          : 'Cannot dig without a pick, and mine is in a tool shed back along the road. Bring it and I will give you a lantern for that cave. Nobody goes in dark.', opts);
      },
    },
    pedlar: {
      arrive(cell) {
        const ch = S.chapters[cell.ch];
        const stock = ['berries'].concat(CHAPTERS[ch.type].sells);
        if (!stock.includes('sword') && ch.i >= 2 && !S.inv.sword) stock.push('sword');
        const opts = [];
        stock.forEach((item) => {
          const price = PRICE[item];
          const name = item === 'berries' ? 'Berries (one heart)' : ITEMS[item].name;
          if (item !== 'berries' && S.inv[item]) return;
          if (item === 'berries' && S.hearts >= S.maxHearts) return;
          opts.push({
            label: `${name}, ${plural(price, 'coin')}`, disabled: S.coins < price,
            do() {
              S.coins -= price;
              if (item === 'berries') heal(1, 'Pedlar\'s berries. %', 'A heart back.');
              else { S.inv[item] = true; log(`You buy ${ITEMS[item].name.toLowerCase()} from the pedlar for ${plural(price, 'coin')}.`); flash(`You have ${ITEMS[item].name.toLowerCase()}.`); }
            },
          });
        });
        opts.push({ label: 'Leave' });
        dialog('pedlar', 'Pedlar', opts.length > 1
          ? `Berries, blades, and whatever the land ahead calls for. You have ${plural(S.coins, 'coin')}.`
          : 'Nothing you need today. Come back with a gap in your pockets.', opts);
      },
    },
    shrine: {
      arrive(cell) {
        if (cell.used) return dialog('shrine', 'Shrine', 'The candle you lit still burns. You feel it in your chest.', leave());
        const opts = [];
        if (S.maxHearts < HEART_CAP) opts.push({
          label: 'Offer 3 coins', primary: true, disabled: S.coins < 3,
          do() { S.coins -= 3; S.maxHearts++; S.hearts = S.maxHearts; cell.used = true; log('You leave three coins at the shrine. Something settles in you, and stays.'); flash('One more heart, for keeps.'); },
        });
        opts.push({ label: 'Leave' });
        dialog('shrine', 'Shrine', S.maxHearts < HEART_CAP
          ? 'A small stone shrine, a candle, a bowl for coins. Three coins, the carving says, and you will be hardier for it.'
          : 'A small stone shrine. You are as hardy as a person gets. It has nothing more for you.', opts);
      },
    },
    well: {
      arrive() {
        const opts = [{
          label: 'Toss in a coin', primary: true, disabled: S.coins < 1,
          do() {
            S.coins--;
            const roll = Math.random();
            if (roll < 0.35) { S.coins += 3; log('You toss a coin in. Three come back up with it, which is not how wells work.'); flash('+3 coins'); }
            else if (roll < 0.7) heal(1, 'You toss a coin in and make a wish. %', 'A heart back.');
            else { log('You toss a coin in. It goes plink. That is all.'); flash('Plink.'); }
          },
        }, { label: 'Leave' }];
        dialog('well', 'Wishing well', 'Deep and dark and full of other people\'s coins. One of yours, and a wish. No promises.', opts);
      },
    },
    river: {
      tryEnter() {
        if (S.inv.boat) return true;
        flash('The river is too deep and too fast. You would need a boat.');
        return false;
      },
      arrive(cell) {
        const ch = S.chapters[cell.ch];
        if (ch && !ch.open) { ch.open = true; log('You push off and row. The current tugs, but the boat holds.'); }
      },
    },
    bridge: {
      tryEnter(cell, r, c) {
        if (cell.used) return true;
        here().met.bandit = true;
        const opts = [];
        if (S.inv.sword) opts.push({ label: 'Draw your sword', primary: true, do() { openWay(cell, 'One look at the blade and the bandit is over the rail and swimming.'); moveTo(r, c); } });
        opts.push({ label: 'Pay 5 coins', primary: !S.inv.sword, disabled: S.coins < 5, do() { S.coins -= 5; openWay(cell, 'He counts the coins twice and waves you across.'); moveTo(r, c); } });
        opts.push({ label: 'Back away' });
        dialog('bandit', 'Bandit', 'Toll bridge. Five coins, or turn around. Unless you fancy your chances.', opts);
        return false;
      },
    },
    wall: { tryEnter() { flash('The wall is far too high. There must be a way through.'); return false; } },
    gate: {
      tryEnter(cell) {
        if (cell.used) return true;
        here().met.gate = true;
        if (S.inv.key) {
          S.inv.key = false;
          openWay(cell, 'The key turns with a shriek. The gate swings open.');
          flash('The gate is open.');
          return true;
        }
        flash('Locked. Someone around here must have the key.');
        return false;
      },
    },
    chasm: { tryEnter() { flash('The gorge is a long way down and the far side is a long way off.'); return false; } },
    brokenbridge: {
      tryEnter(cell) {
        if (cell.used) return true;
        here().met.brokenbridge = true;
        if (S.inv.planks) {
          S.inv.planks = false;
          openWay(cell, 'You lay the planks across the gap and jump on them until you trust them.');
          flash('The bridge is mended.');
          return true;
        }
        flash('The planks are gone. New ones would mend it.');
        return false;
      },
    },
    thorns: { tryEnter() { flash('The briar is solid. There is a gap in it somewhere.'); return false; } },
    troll: {
      tryEnter(cell, r, c) {
        if (cell.used) return true;
        here().met.troll = true;
        const opts = [];
        if (S.inv.honey) opts.push({ label: 'Offer the honey', primary: true, do() { S.inv.honey = false; openWay(cell, 'The troll takes the honey pot in both hands, wanders into the briar with it, and does not come back.'); moveTo(r, c); } });
        if (S.inv.sword) opts.push({ label: 'Fight it (costs a heart)', primary: !S.inv.honey, disabled: S.hearts <= 1, do() { openWay(cell, 'It is a short fight and you do not enjoy it. The troll leaves. So does one of your hearts.'); S.hearts--; hero.ouch = performance.now(); moveTo(r, c); } });
        opts.push({ label: 'Pay 7 coins', disabled: S.coins < 7, do() { S.coins -= 7; openWay(cell, 'The troll counts on its fingers, runs out, and lets you past anyway.'); moveTo(r, c); } });
        opts.push({ label: 'Back away' });
        dialog('troll', 'Troll', 'HRRM. Gap is mine. Honey, or coins, or go round. There is no round.', opts);
        return false;
      },
    },
    cliff: { tryEnter() { flash('Sheer rock. There must be a way through the mountain.'); return false; } },
    cave: {
      tryEnter(cell) {
        if (cell.used) return true;
        here().met.cave = true;
        if (S.inv.lantern) {
          openWay(cell, 'You light the lantern and step into the mountain. The tunnel is long, dry and full of your own footsteps.');
          flash('The cave is lit.');
          return true;
        }
        flash('Black as pitch. You would need a lantern.');
        return false;
      },
    },
    lighthouse: {
      arrive(cell, r, c) {
        S.checkpoint = { r, c };
        if (cell.used) { log('The lamp burns. You warm your hands on the glass.'); return; }
        cell.used = true;
        S.lamps++;
        S.hearts = S.maxHearts;
        const won = countLampEver();
        saveBest();
        log('You climb the stairs and light the lamp. Far behind you, the road you laid glows in it.');
        if (won) log(`The coast is a little kinder for it: ${won.what} joins your deck, for this walk and every walk after.`);
        lampModal(won);
      },
    },
  };

  // ---------- the turn, and the shape of the road ----------
  // One card for every step: lay, step, lay, step. Walking is never blocked — you may
  // always step onto a card that is already down, including back the way you came.
  function hasEmptyNeighbour() {
    for (const dir of DIR_KEYS) {
      const [dr, dc] = DIRS[dir];
      const r = S.hero.r + dr, c = S.hero.c + dc;
      if (inBounds(r, c) && !cellAt(r, c)) return true;
    }
    return false;
  }
  function canPlace() { return S.phase === 'place'; }
  function phaseName() { return canPlace() && hasEmptyNeighbour() ? 'place' : 'move'; }
  function turnLabel() { return phaseName() === 'place' ? 'Lay a card' : 'Take a step'; }

  // Does a card have road running through it? Water and stone do not, until they are opened.
  function carriesRoad(cell) {
    if (!cell || !cell.up) return false;
    if (CARDS[cell.id].kind !== 'block') return true;
    return !!cell.used;                     // an unlocked gate, a mended bridge, a lit cave
  }
  // The directions the road runs from this card, as bits in DIR_KEYS order. Water and stone carry
  // no road at all, and the cards beside them simply have no road running that way. A card with a
  // fixed `road` (the bridge, the opened gate) always runs straight through.
  function roadMask(r, c) {
    const cell = cellAt(r, c);
    if (!carriesRoad(cell)) return 0;
    const fixed = CARDS[cell.id].road;
    let mask = 0;
    DIR_KEYS.forEach((dir, bit) => {
      const [dr, dc] = DIRS[dir];
      if ((fixed && fixed.includes(dir)) || carriesRoad(cellAt(r + dr, c + dc))) mask |= 1 << bit;
    });
    return mask;
  }

  // ---------- moving and laying ----------
  function act(dir) {
    const [dr, dc] = DIRS[dir];
    const r = S.hero.r + dr, c = S.hero.c + dc;
    if (dc) hero.face = dc;
    if (!inBounds(r, c)) { flash(c < 0 ? 'The sea is that way. The road runs east.' : 'The land ends here.'); return; }
    if (!cellAt(r, c)) {
      if (!canPlace()) flash(`Nothing to the ${DIR_WORD[dir]} yet, and you have laid your card. Take a step, then you may lay another.`);
      else if (S.selected === null) flash(`Pick a card (1, 2, 3) first, then press ${DIR_WORD[dir]} to lay it there.`);
      else placeAt(r, c);
      return;
    }
    tryMove(r, c);
  }

  function tryMove(r, c) {
    const cell = cellAt(r, c);
    if (!cell) return;
    if (c !== S.hero.c) hero.face = Math.sign(c - S.hero.c);
    if (!cell.up) { cell.up = true; log(`You peer at the card to the side: ${CARDS[cell.id].name}.`); render(); return; }
    const on = ON[cell.id];
    if (on && on.tryEnter && !on.tryEnter(cell, r, c)) { save(); render(); return; }
    moveTo(r, c);
  }

  function moveTo(r, c) {
    S.hero = { r, c };
    S.steps++;
    S.phase = 'place';
    if (c > S.far) { S.far = c; saveBest(); }
    ensureGenerated(c);
    revealAround(r, c);
    const ch = chapterAt(c);
    if (ch.i > S.seenChapter) { S.seenChapter = ch.i; if (ch.i > 0) { showBanner(ch); log(`Chapter ${ch.i + 1}: ${ch.name}.`); } }
    const cell = cellAt(r, c);
    const on = ON[cell.id];
    if (on && on.arrive) on.arrive(cell, r, c);
    else maybeFind(cell);
    save();
    render();
  }

  function placeAt(r, c) {
    if (S.selected === null || cellAt(r, c) || !isAdjacent(r, c) || !canPlace()) return;
    const id = S.hand[S.selected];
    put(r, c, id, { up: true, mine: true, amount: id === 'coins' ? 1 + rnd(3) : undefined, ch: chapterAt(c).i });
    S.placed++;
    const dir = Object.keys(DIRS).find((k) => DIRS[k][0] === r - S.hero.r && DIRS[k][1] === c - S.hero.c);
    log(`You lay ${CARDS[id].name} to the ${DIR_WORD[dir]}.`);
    S.hand[S.selected] = draw();     // the same slot stays picked up, so you can keep walking
    S.phase = 'move';
    revealAround(r, c);
    save();
    render();
  }

  function selectHand(i) {
    if (!canPlace()) { flash('You have laid your card. Take a step before you pick another.'); return; }
    S.selected = S.selected === i ? null : i;
    hint(defaultHint());
    render();
  }

  // ---------- dialogue and overlays ----------
  function portrait(sprite, base) {
    const c = ART.iconCanvas(sprite, 6, base);
    c.className = 'px portrait';
    return c;
  }
  function dialog(sprite, title, say, options) {
    dlg = { options };
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-labelledby="dlg-title">
        <div class="big"></div>
        <h2 id="dlg-title">${title}</h2>
        <p class="say">${say}</p>
        <div class="actions">
          ${options.map((o, i) => `<button class="${o.primary ? 'primary' : ''}" data-opt="${i}" ${o.disabled ? 'disabled' : ''}><span class="key">${i + 1}</span> ${o.label}</button>`).join('')}
        </div>
      </div>`;
    if (sprite) overlay.querySelector('.big').appendChild(portrait(sprite, CARDS[sprite] ? CARDS[sprite].base : 'grass'));
    overlay.hidden = false;
    const first = overlay.querySelector('button.primary:not(:disabled)') || overlay.querySelector('button:not(:disabled)');
    if (first) first.focus();
  }
  function chooseOption(i) {
    if (!dlg || !dlg.options[i] || dlg.options[i].disabled) return;
    const o = dlg.options[i];
    dlg = null;
    overlay.hidden = true;
    overlay.innerHTML = '';
    if (o.do) o.do();
    save();
    render();
  }
  function closeOverlay() {
    dlg = null;
    overlay.hidden = true;
    overlay.innerHTML = '';
  }
  function lampModal(won) {
    dlg = { escape: 0, options: [{ label: 'on' }, { label: 'again', do: () => newGame(false) }] };
    const next = nextLampCard();
    overlay.innerHTML = `
      <div class="modal win" role="dialog" aria-labelledby="dlg-title">
        <div class="big"></div>
        <h2 id="dlg-title">Lamp ${S.lamps} is lit</h2>
        <p>The light reaches back over everything you laid. You have walked <b>${plural(S.far, 'mile')}</b> east in <b>${plural(S.steps, 'step')}</b>, laying <b>${plural(S.placed, 'card')}</b>, and you stand here with <b>${plural(S.coins, 'coin')}</b>.</p>
        ${won ? `<p class="lamp-won">That is <b>${plural(lampsEver(), 'lamp')}</b> lit on this coast, all told, and the coast has noticed. <b>${won.what.replace(/^an? /, '')}</b> joins your deck &mdash; from now on, on every walk.</p>`
          : next ? `<p class="muted">${plural(lampsEver(), 'lamp')} lit on this coast, all told. ${plural(next.at - lampsEver(), 'more lamp')} and ${next.what} joins your deck for good.</p>` : ''}
        <p class="muted">Your best road so far: ${plural(BEST.far, 'mile')}, ${plural(BEST.lamps, 'lamp')}. You will wake here if you fall. The coast goes on.</p>
        <div class="actions">
          <button class="primary" data-opt="0"><span class="key">1</span> Walk on</button>
          <button data-opt="1"><span class="key">2</span> Start a new journey</button>
        </div>
      </div>`;
    overlay.querySelector('.big').appendChild(portrait('lighthouse', 'sand'));
    overlay.hidden = false;
  }
  function confirmNewGame() {
    if (S.steps === 0) return newGame(false);
    dialog(null, 'New journey?', 'Every card you have laid will be gone, and the coast will lie differently next time.', [
      { label: 'Start again', primary: true, do: () => newGame(false) },
      { label: 'Keep walking' },
    ]);
  }
  function showHelp() {
    dlg = { options: [{ label: 'close' }] };
    overlay.innerHTML = `
      <div class="modal help" role="dialog" aria-labelledby="dlg-title">
        <h2 id="dlg-title">How to play</h2>
        <p>You are the one in yellow. The coast runs east, and every lighthouse on it is dark. There is no road, so you will have to lay one.</p>
        <h3>One card per step</h3>
        <p><b>You may lay one card for every step you take.</b> Lay, step, lay, step. Walking itself is never rationed: you can always step onto a tile that is already on the ground, and go back over old ground as often as you like.</p>
        <ul>
          <li><b>Lay.</b> Your hand holds three cards. Press <kbd>1</kbd>, <kbd>2</kbd> or <kbd>3</kbd> (or click) to pick one up, then press a direction, or click a marked space, to lay it beside you. You draw a replacement straight away and keep hold of that slot, so you can keep laying and walking.</li>
          <li><b>Step.</b> <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or the arrow keys move you onto any tile next to you. Clicking a neighbouring tile works too.</li>
          <li>Stepping onto a tile does what it says: pick up the coins, meet the traveller, wake the wolf.</li>
        </ul>
        <h3>Chapters</h3>
        <p>Every stretch of the land ends in something that bars the way: a river, a wall, a gorge, a briar, a mountain. Each has one way through, and what you need to open it is hidden somewhere in the stretch before it, face down. Read the signpost. Talk to people. Or find the pedlar and pay.</p>
        <p>Every third chapter begins at a dark lighthouse. Light it and it becomes a place to wake up, along with any campfire you have rested at. Run out of hearts and you come round at the last one, with everything you laid still on the ground.</p>
        <p><b>Every lamp you light stays lit, for good.</b> The coast keeps count across all your walks, not just this one, and pays you back for it: a signpost after the first, an old mine after the second, and on up through chests, hollows, wells, hives, shrines, pedlars and worse, each one joining your deck permanently. The road you can lay on your tenth journey is not the road you could lay on your first.</p>
        <h3>The road</h3>
        <p>Every card carries a stretch of road, and it joins up with the road on the cards around it. Water, stone and thorn carry no road at all. A bridge does, and so does a gate once it is unlocked.</p>
        <h3>Face-down cards</h3>
        <p>Some cards were on the ground before you arrived. They stay face down until you lay a card beside them, then they turn over. A lookout hill turns over everything within two spaces.</p>
        <p class="muted" style="margin-top:0.8rem">Your journey saves itself as you go. Press <kbd>H</kbd> for this page.</p>
        <div class="actions">
          <button class="primary" data-action="close"><span class="key">1</span> Back to the road</button>
        </div>
      </div>`;
    overlay.hidden = false;
  }

  // ---------- drawing the land ----------
  // Everything is drawn at one pixel per world pixel on `off`, then blown up by a whole number
  // onto the visible canvas, so every pixel stays square.
  let Z = 4, viewW = 176;
  const hero = { x: START.c * TILE, y: START.r * TILE, face: 1, ouch: 0, walk: 0 };
  let camX = 0;
  let lastT = 0;

  function resize() {
    const cssW = viewport.clientWidth || 640;
    const availH = Math.max(180, window.innerHeight * 0.5);
    Z = clamp(Math.floor(Math.min(cssW / 208, availH / VIEW_H)), 3, 8);
    viewW = Math.ceil(cssW / Z);
    off.width = viewW; off.height = VIEW_H;
    canvas.width = viewW * Z; canvas.height = VIEW_H * Z;
    canvas.style.width = `${canvas.width}px`;
    canvas.style.height = `${canvas.height}px`;
    viewport.style.height = `${canvas.height}px`;
    snapCamera();
  }
  function targetCam() { return Math.max(0, S.hero.c * TILE + TILE / 2 - viewW / 2); }
  function snapCamera() { if (S) camX = targetCam(); }
  function snapHero() { hero.x = S.hero.c * TILE; hero.y = S.hero.r * TILE; }

  function drawRoad(x, y, mask) {
    octx.fillStyle = ART.PAL.T;
    if (mask & 1) octx.fillRect(x + 5, y, 6, 8);
    if (mask & 2) octx.fillRect(x + 8, y + 5, 8, 6);
    if (mask & 4) octx.fillRect(x + 5, y + 8, 6, 8);
    if (mask & 8) octx.fillRect(x, y + 5, 8, 6);
    octx.fillRect(x + 5, y + 5, 6, 6);
    octx.fillStyle = ART.PAL.t;
    octx.fillRect(x + 7, y + 7, 1, 1);
    octx.fillRect(x + 9, y + 9, 1, 1);
    if (mask & 1) octx.fillRect(x + 6, y + 2, 1, 1);
    if (mask & 4) octx.fillRect(x + 9, y + 13, 1, 1);
    if (mask & 2) octx.fillRect(x + 13, y + 6, 1, 1);
    if (mask & 8) octx.fillRect(x + 2, y + 9, 1, 1);
  }
  function drawDotted(x, y, colour, alpha) {
    octx.fillStyle = colour;
    octx.globalAlpha = alpha;
    for (let i = 1; i < TILE - 1; i += 2) {
      octx.fillRect(x + i, y + 1, 1, 1);
      octx.fillRect(x + i, y + TILE - 2, 1, 1);
      octx.fillRect(x + 1, y + i, 1, 1);
      octx.fillRect(x + TILE - 2, y + i, 1, 1);
    }
    octx.globalAlpha = 1;
  }

  function drawWorld(t) {
    octx.imageSmoothingEnabled = false;
    octx.fillStyle = '#0d1020';
    octx.fillRect(0, 0, off.width, off.height);
    const cx = Math.round(camX);
    const c0 = Math.max(0, Math.floor(cx / TILE) - 1);
    const c1 = Math.floor((cx + viewW) / TILE) + 1;
    const placing = S.selected !== null && canPlace();
    const pulse = 0.18 + 0.14 * Math.sin(t / 220);

    for (let c = c0; c <= c1; c++) for (let r = 0; r < ROWS; r++) {
      const x = c * TILE - cx, y = r * TILE;
      const cell = cellAt(r, c);
      const adjacent = isAdjacent(r, c);
      if (!cell) {
        if (adjacent) {
          if (placing) {
            octx.fillStyle = ART.PAL.y;
            octx.globalAlpha = pulse;
            octx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);
            octx.globalAlpha = 1;
            octx.fillRect(x + 7, y + 5, 2, 6);
            octx.fillRect(x + 5, y + 7, 6, 2);
          } else drawDotted(x, y, ART.PAL.W, 0.3);
        }
        continue;
      }
      if (!cell.up) { octx.drawImage(ART.sprite('fog'), x, y); continue; }
      const def = CARDS[cell.id];
      const look = cell.used && def.spent ? def.spent : def;
      const baseName = look.base || def.base;
      octx.drawImage(ART.base(baseName), x, y);
      if (baseName !== 'bridge' && baseName !== 'plankbridge') {
        const m = roadMask(r, c);
        if (m || carriesRoad(cell)) drawRoad(x, y, m);
      }
      if (look.sprite) octx.drawImage(ART.sprite(look.sprite), x, y);
      if (!cell.mine && cell.id !== 'home') {       // a quiet mark on the cards that were here before you
        octx.fillStyle = ART.PAL.W; octx.globalAlpha = 0.55; octx.fillRect(x + 13, y + 1, 2, 2); octx.globalAlpha = 1;
      }
    }
    // the faint grid that says "these are squares"
    octx.fillStyle = ART.PAL.K;
    octx.globalAlpha = 0.16;
    for (let c = c0; c <= c1 + 1; c++) octx.fillRect(c * TILE - cx, 0, 1, VIEW_H);
    for (let r = 1; r < ROWS; r++) octx.fillRect(0, r * TILE, off.width, 1);
    octx.globalAlpha = 1;

    // you
    const moving = Math.abs(hero.x - S.hero.c * TILE) > 0.5 || Math.abs(hero.y - S.hero.r * TILE) > 0.5;
    const frame = moving && Math.floor(t / 110) % 2 ? 'hero2' : 'hero';
    const hx = Math.round(hero.x) - cx, hy = Math.round(hero.y) - 2;
    const hurtNow = t - hero.ouch < 500 && Math.floor(t / 60) % 2;
    const standing = cellAt(S.hero.r, S.hero.c);
    const afloat = standing && standing.id === 'river';
    if (afloat) octx.drawImage(ART.sprite('boat'), hx, hy + 4);
    if (!hurtNow) {
      octx.fillStyle = ART.PAL.K; octx.globalAlpha = 0.3; octx.fillRect(hx + 4, hy + 14, 8, 2); octx.globalAlpha = 1;
      if (hero.face < 0) {
        octx.save(); octx.translate(hx + TILE, hy); octx.scale(-1, 1);
        octx.drawImage(ART.sprite(frame), 0, 0);
        octx.restore();
      } else octx.drawImage(ART.sprite(frame), hx, hy);
    }

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
  }

  function frame(t) {
    const dt = Math.min(50, t - lastT || 16);
    lastT = t;
    if (S) {
      const k = 1 - Math.pow(0.001, dt / 1000);     // settle in about a fifth of a second
      const tx = S.hero.c * TILE, ty = S.hero.r * TILE;
      hero.x += (tx - hero.x) * Math.min(1, k * 1.4);
      hero.y += (ty - hero.y) * Math.min(1, k * 1.4);
      if (Math.abs(tx - hero.x) < 0.3) hero.x = tx;
      if (Math.abs(ty - hero.y) < 0.3) hero.y = ty;
      const tc = targetCam();
      camX += (tc - camX) * Math.min(1, k * 0.8);
      if (Math.abs(tc - camX) < 0.3) camX = tc;
      drawWorld(t);
    }
    requestAnimationFrame(frame);
  }

  // ---------- rendering the page around the land ----------
  function render() {
    renderHand();
    renderStats();
    renderQuests();
    renderInv();
    renderLog();
    if (!hintEl.classList.contains('flash')) hintEl.textContent = defaultHint();
  }

  function renderHand() {
    const laying = canPlace() && hasEmptyNeighbour();
    handEl.innerHTML = '';
    S.hand.forEach((id, i) => {
      const d = CARDS[id];
      const b = document.createElement('button');
      b.className = 'hcard' + (S.selected === i ? ' sel' : '');
      b.type = 'button';
      b.dataset.kind = d.kind; b.dataset.i = i;
      b.setAttribute('aria-pressed', S.selected === i);
      b.disabled = !laying;
      b.innerHTML = `<span class="key">${i + 1}</span><span class="pic"></span><span class="name">${d.name}</span><span class="text">${d.text}</span>`;
      b.querySelector('.pic').appendChild(ART.iconCanvas(d.sprite, 3, d.base));
      handEl.appendChild(b);
    });
    turnEl.textContent = turnLabel();
    document.body.dataset.phase = phaseName();
  }

  function renderStats() {
    statsEl.innerHTML = '';
    const hearts = document.createElement('span');
    hearts.className = 'stat hearts' + (S.hearts <= 1 ? ' low' : '');
    hearts.title = `${S.hearts} of ${S.maxHearts} hearts`;
    for (let i = 0; i < S.maxHearts; i++) hearts.appendChild(ART.iconCanvas(i < S.hearts ? 'heart' : 'heartoff', 2));
    statsEl.appendChild(hearts);
    const stat = (icon, value, title) => {
      const el = document.createElement('span');
      el.className = 'stat'; el.title = title;
      el.appendChild(ART.iconCanvas(icon, 2));
      const b = document.createElement('b'); b.textContent = value;
      el.appendChild(b);
      statsEl.appendChild(el);
    };
    stat('coin', S.coins, 'Coins');
    stat('flag', S.far, `Miles east. Best: ${BEST.far}`);
    const next = nextLampCard();
    stat(S.lamps ? 'lamp' : 'lampdark', S.lamps,
      `Lamps lit on this walk. Best: ${BEST.lamps}. ${plural(lampsEver(), 'lamp')} lit on this coast all told`
      + (next ? `, ${plural(next.at - lampsEver(), 'more')} for ${next.what}.` : ', and the whole deck is yours.'));
  }

  function renderQuests() {
    questEl.innerHTML = '';
    quests().forEach((q) => {
      const li = document.createElement('li');
      li.className = q.goal ? 'goal' : '';
      const ic = document.createElement('span'); ic.className = 'q-icon';
      ic.appendChild(ART.iconCanvas(q.icon, 1));
      const tx = document.createElement('span'); tx.textContent = q.text;
      li.appendChild(ic); li.appendChild(tx);
      questEl.appendChild(li);
    });
  }

  function renderInv() {
    invEl.innerHTML = '';
    const have = Object.keys(ITEMS).filter((k) => S.inv[k]);
    if (!have.length) { invEl.innerHTML = '<span class="none">Nothing but the clothes you stand in.</span>'; return; }
    have.forEach((k) => {
      const el = document.createElement('span');
      el.className = 'item';
      el.appendChild(ART.iconCanvas(ITEMS[k].sprite, 1));
      el.appendChild(document.createTextNode(ITEMS[k].name));
      invEl.appendChild(el);
    });
  }

  function renderLog() {
    logEl.innerHTML = S.log.map((t) => `<li>${t}</li>`).join('');
  }

  // ---------- input ----------
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (dlg) {
      if (k === 'escape') { e.preventDefault(); chooseOption(dlg.escape != null ? dlg.escape : dlg.options.length - 1); }
      else if (/^[1-9]$/.test(k)) { e.preventDefault(); chooseOption(+k - 1); }
      return;
    }
    if (k in KEYDIR) { e.preventDefault(); act(KEYDIR[k]); }
    else if (k === '1' || k === '2' || k === '3') { e.preventDefault(); selectHand(+k - 1); }
    else if (k === 'escape') { S.selected = null; hint(defaultHint()); render(); }
    else if (k === '?' || k === 'h') showHelp();
  });

  canvas.addEventListener('click', (e) => {
    if (dlg) return;
    const box = canvas.getBoundingClientRect();
    const wx = (e.clientX - box.left) / Z + Math.round(camX);
    const wy = (e.clientY - box.top) / Z;
    const c = Math.floor(wx / TILE), r = Math.floor(wy / TILE);
    if (!inBounds(r, c)) return;
    if (!isAdjacent(r, c)) { if (!(r === S.hero.r && c === S.hero.c)) flash('Too far. You can only reach the tiles next to you.'); return; }
    if (!cellAt(r, c)) {
      if (!canPlace()) flash('Your card is already down. Take your step first.');
      else if (S.selected === null) flash('Pick a card from your hand first (1, 2, 3).');
      else placeAt(r, c);
      return;
    }
    tryMove(r, c);
  });

  handEl.addEventListener('click', (e) => {
    const b = e.target.closest('.hcard');
    if (b) selectHand(+b.dataset.i);
  });

  document.querySelector('.dpad').addEventListener('click', (e) => {
    const b = e.target.closest('[data-dir]');
    if (b && !dlg) act(b.dataset.dir);
  });

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-action]');
    if (!b) return;
    const a = b.dataset.action;
    if (a === 'help') showHelp();
    else if (a === 'close') { closeOverlay(); render(); }
    else if (a === 'new-game') confirmNewGame();
  });

  overlay.addEventListener('click', (e) => {
    const b = e.target.closest('[data-opt]');
    if (b) { chooseOption(+b.dataset.opt); return; }
    if (e.target === overlay && dlg && !overlay.querySelector('[data-opt]')) { closeOverlay(); render(); }
  });

  window.addEventListener('resize', () => { resize(); });

  // ---------- go ----------
  loadBest();
  if (load()) {
    ensureGenerated(S.hero.c);
    save();                       // keep the land that was just generated, so it lies the same next time
    snapHero();
    resize();
    render();
    hint('Welcome back. Your road is where you left it.');
  } else {
    newGame(true);
    snapHero();
    resize();
    setTimeout(showHelp, 400);
  }
  requestAnimationFrame(frame);

  // Small hook for smoke tests.
  window.__wayside = {
    get S() { return S; }, get BEST() { return BEST; }, CARDS, CHAPTERS, DECK, LAMP_CARDS,
    deck, draw, lampsEver, lampCardsWon, nextLampCard, countLampEver, render,
    setLampsEver: (n) => { BEST.lampsEver = n; render(); },
  };
})();
