/* Wayside — pick one of three cards to lay the road ahead, then walk it with WASD or the arrows.
   The land runs east for as long as you care to walk it: chapter after chapter, each ending in
   something that bars the way (a river, a wall, a gorge, a briar, a mountain) and hiding, somewhere
   in the stretch before it, the people and things that get you past. Every third chapter ends at a
   dark lighthouse; light it and you have a place to wake up if the wolves get you.
   Two ways to walk: alone, or with Maren at your side. Maren is an AI partner — she builds road
   beside you, gathers what you have not, and when a fight breaks out she wades in beside you.
   Fights are turn-based: your attacks come from the things you have collected (sword, axe, pick,
   honey), and a nearby partner joins the scrap rather than waiting on it.
   Drawn on a canvas at sixteen pixels a tile, scaled up whole. Sprites live in sprites.js.
   Saves to localStorage. */
(() => {
  'use strict';

  const ART = window.WaysideArt;

  // ---------- constants ----------
  const SAVE_KEY = 'wayside-save-v4';
  const BEST_KEY = 'wayside-best-v1';
  const PAT_NAME = 'Maren';            // the collaborative partner
  const ROWS = 5;
  const TILE = 16;                 // world pixels per tile
  const HEART_CAP = 5;
  const LOOKAHEAD = 14;            // keep this many columns generated beyond the hero
  const LIGHTHOUSE_EVERY = 3;      // chapters
  const START = { r: 2, c: 0 };
  const DIRS = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
  const KEYDIR = { arrowup: 'up', w: 'up', arrowdown: 'down', s: 'down', arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right' };
  const DIR_WORD = { up: 'north', down: 'south', left: 'west', right: 'east' };
  const DIR_KEYS = ['up', 'right', 'down', 'left'];   // bit order for the road masks
  // What stands on a tile is drawn smaller than the tile and sitting near the bottom of it, so a
  // tree reads as a tree in a field rather than as a wall of pine. Ground cover is the exception:
  // flowers and tracks are the field, and cover the whole square.
  // The sprite size is fixed in screen pixels rather than taken as a share of the tile, so a wolf,
  // a signpost or a traveller stays the same size on screen however big the tiles are drawn.
  const SPRITE_PX = 2;             // screen pixels per sprite pixel (sprites are 16 x 16)
  const MIN_COLS = 16;             // never draw the land so large that fewer than this fit across
  const FULL_TILE = new Set(['flowers', 'tracks']);

  // ---------- the mist ----------
  // The land does not stop at the five rows you can walk, and it does not stop at the last card
  // laid: it runs off into mist in every direction. Only two things hold the mist off — the cards
  // that are face up, which stay clear for good, and you. A card still lying face down does not:
  // it gives nothing away, and the ground over it looks like any other ground until you come near
  // enough for it to turn over on its own.
  const FOG_COL = '#080a16';
  const FOG_SS = 6;                // mist-canvas pixels per tile; blurred up, so this is plenty
  const LIGHT_R = 1.45;            // how far a turned-over card holds the mist off, in tiles
  const HERO_R = 3;                // ... and how far you do, which is further than any card
  const EDGE_ROWS = 1.15;          // rows of mist above and below the road before it goes dark

  const $ = (s) => document.querySelector(s);
  const rnd = (n) => Math.floor(Math.random() * n);
  const pick = (arr) => arr[rnd(arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const inBounds = (r, c) => r >= 0 && r < ROWS && c >= 0;
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

  // ---------- cards ----------
  // kind: path | item | npc | enemy | block | goal | action. base is the ground, sprite what
  // stands on it. `spent` is how a used-up card looks afterwards. `road` forces the road to run
  // those ways once the card carries road at all — a bridge is a bridge whatever sits beside it.
  // An action card is never laid on the ground: you play it from your hand for its effect.
  const CARDS = {
    home: { name: 'Home', kind: 'path', base: 'grass', sprite: 'home', text: 'Your cottage. Everything starts here.' },
    meadow: { name: 'Meadow', kind: 'path', base: 'grass', sprite: 'flowers', text: 'Open grass and easy walking.' },
    woods: { name: 'Woods', kind: 'path', base: 'woods', sprite: 'tree', text: 'Pines, and soft needles underfoot.' },
    brook: { name: 'Brook', kind: 'path', base: 'brook', sprite: null, text: 'A shallow stream. You can step across.' },
    coins: { name: 'Coin purse', kind: 'item', base: 'grass', sprite: 'purse', text: 'Somebody dropped this. Finders keepers.', spent: { name: 'Empty purse', sprite: 'purseempty' } },
    berries: { name: 'Berry bush', kind: 'item', base: 'grass', sprite: 'bush', text: 'Eat your fill. Restores one heart.', spent: { name: 'Picked bush', sprite: 'bushpicked' } },
    camp: { name: 'Campfire', kind: 'path', base: 'grass', sprite: 'fire', text: 'Rest to restore every heart, and wake here if you fall.' },
    wolf: { name: 'Wolf', kind: 'enemy', base: 'grass', sprite: 'wolf', text: 'A fight. One good slash ends it; expect a bite otherwise.', spent: { name: 'Wolf tracks', sprite: 'tracks' } },
    traveller: { name: 'Traveller', kind: 'npc', base: 'grass', sprite: 'traveller', text: 'Knows the land and will share a rumour.', spent: { name: 'Empty road', sprite: null } },
    lookout: { name: 'Lookout hill', kind: 'path', base: 'grass', sprite: 'hill', text: 'From the top, every hidden card within two spaces turns over.' },
    sign: { name: 'Signpost', kind: 'npc', base: 'grass', sprite: 'sign', text: 'Somebody wrote down what lies ahead.' },

    mine: { name: 'Old mine', kind: 'item', base: 'grass', sprite: 'mine', text: 'A collapsed shaft. Something glints inside.', spent: { name: 'Old mine', sprite: 'mineempty' } },
    smith: { name: 'Blacksmith', kind: 'npc', base: 'grass', sprite: 'smith', text: 'Forges for anyone who brings iron.' },
    fisher: { name: 'Fisherman', kind: 'npc', base: 'grass', sprite: 'fisher', text: 'Sits beside a boat that is going nowhere.' },
    reeds: { name: 'Reeds', kind: 'item', base: 'grass', sprite: 'reeds', text: 'Tall reeds at the water\'s edge.', spent: { name: 'Reeds', sprite: 'reeds' } },
    river: { name: 'River', kind: 'block', base: 'water', sprite: null, text: 'Deep and fast. You would need a boat.' },
    bridge: { name: 'Bridge', kind: 'enemy', base: 'bridge', sprite: 'bandit', road: ['left', 'right'], text: 'The only bridge, and a toll keeper on it. Pay, or beat him.', spent: { name: 'Bridge', sprite: null } },
    hermit: { name: 'Hermit', kind: 'npc', base: 'grass', sprite: 'hermit', text: 'Lives alone and likes it that way.' },
    hollow: { name: 'Damp hollow', kind: 'item', base: 'woods', sprite: 'mushrooms', text: 'Mushrooms grow in the shade.', spent: { name: 'Damp hollow', sprite: 'mushroomspicked' } },
    wall: { name: 'Old wall', kind: 'block', base: 'stone', sprite: null, text: 'Far too high to climb.' },
    gate: { name: 'Iron gate', kind: 'block', base: 'stone', sprite: 'gate', road: ['left', 'right'], text: 'Locked. There must be a key somewhere.', spent: { name: 'Open gate', sprite: 'gateopen' } },
    chasm: { name: 'Gorge', kind: 'block', base: 'dark', sprite: null, text: 'A long way down.' },
    brokenbridge: { name: 'Broken bridge', kind: 'block', base: 'dark', sprite: 'brokenbridge', road: ['left', 'right'], text: 'The planks are gone. New ones would mend it.', spent: { name: 'Plank bridge', sprite: null, base: 'plankbridge' } },
    woodcutter: { name: 'Woodcutter', kind: 'npc', base: 'woods', sprite: 'woodcutter', text: 'Would cut planks, if he had anything to cut with.' },
    stump: { name: 'Old stump', kind: 'item', base: 'woods', sprite: 'stump', text: 'An axe left buried in the wood.', spent: { name: 'Old stump', sprite: 'stumpempty' } },
    thorns: { name: 'Briar', kind: 'block', base: 'thorns', sprite: null, text: 'Thorns thicker than your arm. No way through.' },
    troll: { name: 'Troll\'s gap', kind: 'enemy', base: 'woods', sprite: 'troll', road: ['left', 'right'], text: 'The one gap in the briar, and a troll asleep in it. Honey, coins, or a fight.', spent: { name: 'The gap', sprite: null } },
    cliff: { name: 'Mountain', kind: 'block', base: 'cliff', sprite: null, text: 'Sheer rock. Nobody climbs this.' },
    cave: { name: 'Dark cave', kind: 'block', base: 'cliff', sprite: 'cave', road: ['left', 'right'], text: 'A tunnel through the mountain, black as pitch.', spent: { name: 'Lit cave', sprite: 'cavelit' } },
    miner: { name: 'Miner', kind: 'npc', base: 'grass', sprite: 'miner', text: 'Has lanterns to spare and nothing to dig with.' },
    shed: { name: 'Tool shed', kind: 'item', base: 'grass', sprite: 'shed', text: 'Somebody left a pick on the shelf.', spent: { name: 'Tool shed', sprite: 'shedempty' } },
    beehive: { name: 'Beehive', kind: 'item', base: 'woods', sprite: 'beehive', text: 'Full of honey, and of bees.', spent: { name: 'Empty hive', sprite: 'beehiveempty' } },
    pedlar: { name: 'Pedlar', kind: 'npc', base: 'grass', sprite: 'pedlar', text: 'Sells what the land ahead calls for.' },
    chest: { name: 'Chest', kind: 'item', base: 'grass', sprite: 'chest', text: 'Unlocked. Something is inside, and it may not be coins.', spent: { name: 'Empty chest', sprite: 'chestopen' } },
    shrine: { name: 'Shrine', kind: 'npc', base: 'grass', sprite: 'shrine', text: 'An offering here is said to make you hardier.' },
    well: { name: 'Wishing well', kind: 'npc', base: 'grass', sprite: 'well', text: 'A coin in, and something comes of it. Usually.' },
    bear: { name: 'Bear', kind: 'enemy', base: 'woods', sprite: 'bear', text: 'A hard fight. Sword, axe, pick or honey will do; alone it can maul you.', spent: { name: 'Bear tracks', sprite: 'tracks' } },
    tent: { name: 'Bandit camp', kind: 'enemy', base: 'grass', sprite: 'tent', text: 'They swing quickly and flee on a wounded day, leaving their takings.', spent: { name: 'Empty camp', sprite: 'tentempty' } },
    lighthouse: { name: 'Lighthouse', kind: 'goal', base: 'sand', sprite: 'lighthousedark', text: 'Dark. Climb up and light it.', spent: { name: 'Lighthouse', sprite: 'lighthouse' } },

    rework: { name: 'Rework', kind: 'action', base: 'grass', sprite: 'rework', text: 'Swap a card in your hand for a fresh one from the deck.' },
    slip: { name: 'Slipline', kind: 'action', base: 'grass', sprite: 'slip', text: 'Swap a card on the ground with a card in your hand. The ground card comes to you; one of your cards takes its place.' },
    cross: { name: 'Crossed deck', kind: 'action', base: 'grass', sprite: 'cross', text: 'Swap a card in your hand for one from another deck — a partner\'s hand, or the deck itself.', deckswap: true },
  };

  // How an action card plays. Each swaps something for something else:
  //   rework — a card in your hand for another from the deck.
  //   slip   — a card already placed for a card in your hand.
  //   cross  — a card in your hand for a card from another deck (Maren's hand in a
  //            collaborative walk, the deck itself alone — and, one day, an opponent's deck).
  const ACTION = {
    rework: { effect: 'hand', verb: 'hand a card up in exchange' },
    slip: { effect: 'board', verb: 'trade a placed card for one in your hand' },
    cross: { effect: 'deck', verb: 'draw a card from another deck' },
  };

  const ITEMS = {
    ore: { name: 'Iron ore', sprite: 'ore' },
    sword: { name: 'Sword', sprite: 'sword' },
    oars: { name: 'Oars', sprite: 'oars' },
    boat: { name: 'Boat', sprite: 'boat' },
    mushrooms: { name: 'Mushrooms', sprite: 'mushrooms' },
    key: { name: 'Iron key', sprite: 'key' },
    axe: { name: 'Axe', sprite: 'axe' },
    planks: { name: 'Planks', sprite: 'planks' },
    honey: { name: 'Honey', sprite: 'honey' },
    pick: { name: 'Pick', sprite: 'pick' },
    lantern: { name: 'Lantern', sprite: 'lantern' },
  };
  const PRICE = { berries: 2, sword: 8, key: 6, planks: 6, honey: 4, lantern: 6 };

  // What you can draw, and how often. This is the deck you start every walk with.
  const DECK = [['meadow', 8], ['woods', 7], ['brook', 4], ['berries', 3], ['camp', 2], ['wolf', 4], ['traveller', 3], ['lookout', 2], ['rework', 1], ['slip', 1], ['cross', 1]];
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
  let modeSelect = false;  // the "which way to walk" screen is up; ordinary input is paused
  let action = null;       // playing an action card: { type, phase, br, bc } — never saved, it is a hand
  let battle = null;       // an open fight: { cell, r, c, id, hp, you, pat, ... } — never saved
  let battleWatch = 0;     // timer id for walking Maren over to help in a fight
  let partnerIdle = 0;     // timer id for Maren's turns while the player stands still

  const canvas = $('#board'), overlay = $('#overlay'), bannerEl = $('#banner');
  const handEl = $('#hand'), statsEl = $('#stats'), invEl = $('#inv'), logEl = $('#log'), hintEl = $('#hint');
  const questEl = $('#quests');
  const turnEl = $('#turn');
  const topbarEl = $('#hud-top'), trayEl = $('#tray');
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
      v: 4, mode: 'solo', partner: null, grid: Array.from({ length: ROWS }, () => []), gen: 0, chapters: [],
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

  function initPartner() {
    S.partner = {
      r: START.r, c: START.c, hearts: S.maxHearts, maxHearts: S.maxHearts,
      hand: [draw(), draw(), draw()], gone: false, rest: 0,
    };
    snapPat();
  }

  function newGame(mode, firstRun) {
    S = null; battleEnd();
    freshState();
    S.mode = mode || S.mode || 'solo';
    if (S.mode === 'coop') initPartner();
    log(S.mode === 'coop'
      ? `${PAT_NAME} is at the door with a satchel. 'The road east,' she says, 'let us lay it together.'`
      : 'You lock the door behind you. The coast runs east, and every lighthouse on it is dark.');
    revealAround(START.r, START.c, true);
    save();
    snapHero();
    snapPat();
    snapCamera();
    render();
    if (!firstRun) closeOverlay();
    hint('Lay a card first: pick one with 1, 2 or 3, then press a direction. Then you may step onto it.');
  }

  // the walk begins by choosing how to walk it — and it is a choice you can make again
  function showModeSelect() {
    modeSelect = true;
    S.selected = null;
    action = null;
    overlay.innerHTML = `
      <div class="modal mode" role="dialog" aria-labelledby="md-title">
        <div class="big pix-big"></div>
        <h2 id="md-title">A walk east</h2>
        <p class="say">The coast runs east and every lighthouse on it is dark. How will you walk it?</p>
        <div class="mode-opts">
          <button class="mode-btn" data-mode="solo" type="button"><b>Walk alone</b><span>The road is yours, and so is every risk on it.</span></button>
          <button class="mode-btn" data-mode="coop" type="button"><b>Walk together</b><span>${PAT_NAME} walks beside you &mdash; she lays road, gathers what you pass by, and joins your fights.</span></button>
        </div>
        <p class="muted">A competitive mode &mdash; race an NPC, block their path, trade blows with their deck &mdash; is on the way.</p>
      </div>`;
    overlay.querySelector('.pix-big').appendChild(portrait('hero', 'grass'));
    overlay.hidden = false;
  }
  function chooseMode(mode) {
    modeSelect = false;
    newGame(mode, false);
    if (!localStorage.getItem('wayside-seen-help')) {
      try { localStorage.setItem('wayside-seen-help', '1'); } catch (e) { /* fine */ }
      setTimeout(showHelp, 400);
    }
  }

  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* private mode, fine */ }
  }
  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const s = JSON.parse(raw);
      if (!s || s.v < 3 || !Array.isArray(s.grid) || s.grid.length !== ROWS) return false;
      if (s.v < 4) {                       // v3 saves walk alone, and gain a partner slot
        s.v = 4; s.mode = s.mode || 'solo'; s.partner = null;
      }
      if (s.mode !== 'solo' && s.mode !== 'coop') s.mode = 'solo';
      if (s.mode === 'coop' && (!s.partner || !s.partner.hand)) s.partner = null;
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
    if (action) return actionHint();
    if (battle) return `The ${battle.spec.name} is watching you. Pick a move.`;
    if (S.phase === 'move') return 'Your card is down. Take a step: WASD, the arrows, or click a tile beside you. Old ground is always free to walk.';
    if (!hasEmptyNeighbour()) return 'No open ground beside you. Step onto any tile you like.';
    if (S.selected !== null) return `Holding ${CARDS[S.hand[S.selected]].name}. Press a direction, or click a marked space, to lay it. Esc puts it back.`;
    return 'Pick a card with 1, 2 or 3 to lay one. A direction on its own is just a step: nothing goes down unless you put it down.';
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
  function wakeAtCheckpoint() {
    S.hearts = S.maxHearts;
    S.hero = { ...S.checkpoint };
    S.phase = 'place';
    const at = cellAt(S.hero.r, S.hero.c);
    const where = at && at.id === 'home' ? 'at home' : at && at.id === 'lighthouse' ? 'at the foot of the lighthouse' : 'by the last fire you rested at';
    log(`Everything goes dark. You wake ${where}, bandaged, and every card you laid is still on the ground.`);
    flash(`You wake up ${where}.`);
    snapHero();
  }
  function hurt(n, why) {
    S.hearts = Math.max(0, S.hearts - n);
    log(why);
    hero.ouch = performance.now();
    if (S.hearts === 0) { wakeAtCheckpoint(); partnerTurn(); }
    else flash(why);
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
      arrive(cell, r, c) {
        if (cell.used) return;
        startBattle(cell, r, c, 'wolf');
      },
    },
    bear: {
      arrive(cell, r, c) {
        if (cell.used) return;
        startBattle(cell, r, c, 'bear');
      },
    },
    tent: {
      arrive(cell, r, c) {
        if (cell.used) return;
        startBattle(cell, r, c, 'tent');
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
        opts.push({ label: 'Fight him', primary: true, do() { startBattle(cell, r, c, 'bandit'); renderBattle(); } });
        opts.push({ label: 'Pay 5 coins', disabled: S.coins < 5, do() { S.coins -= 5; openWay(cell, 'He counts the coins twice and waves you across.'); moveTo(r, c); } });
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
        opts.push({ label: 'Fight him', primary: !S.inv.honey, do() { startBattle(cell, r, c, 'troll'); renderBattle(); } });
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

  // ---------- battles ----------
  // Fights are small, turn-based scrapes. Your attacks come from what you have collected — a
  // sword slashes, an axe hews, a pick swings — and honey buys an ending no blade can. Every
  // fight also has a Run. In a collaborative walk Maren joins the moment she is alongside you,
  // and never leaves you waiting on her: her turn falls between yours and the enemy's.
  const BATTLES = {
    wolf: {
      name: 'Wolf', hearts: 2, dmg: 1, atk: 'Bite', sprite: 'wolf', base: 'grass',
      win: { coins: 2, log: 'The wolf slinks off, leaving 2 coins in the grass, oddly.' }
    },
    tent: {
      name: 'Bandits', hearts: 2, dmg: 1, atk: 'Bludgeon', sprite: 'tent', base: 'grass',
      win: { coins: 4, log: 'The bandits scatter, leaving their takings. 4 coins.' }
    },
    bear: {
      name: 'Bear', hearts: 3, dmg: 1, atk: 'Swat', sprite: 'bear', base: 'woods',
      win: { coins: 3, log: 'The bear lumbers off, and there are 3 coins where it sat.' }
    },
    bandit: {
      name: 'Toll keeper', hearts: 2, dmg: 1, atk: 'Cudgel', sprite: 'bandit', base: 'bridge',
      way: 'He limps off down the far bank, cursing tolls. The bridge is yours.'
    },
    troll: {
      name: 'Troll', hearts: 4, dmg: 2, atk: 'Crush', sprite: 'troll', base: 'woods',
      way: 'The troll drags itself into the briar and does not come back. The gap is open.'
    },
  };

  function startBattle(cell, r, c, id) {
    if (!BATTLES[id]) return;
    battle = {
      cell, r, c, id, spec: BATTLES[id],
      heroR: S.hero.r, heroC: S.hero.c,
      hp: BATTLES[id].hearts, pat: null, last: '', pending: false,
    };
    battle.last = `The ${battle.spec.name} stands in the way.`;
    maybePatJoins();
    if (!battleWatch) battleWatch = setInterval(battleWatchTick, 900);
    save();
    renderBattle();
  }
  function battleEnd() {
    if (battleWatch) { clearInterval(battleWatch); battleWatch = 0; }
    battle = null;
  }
  function patNear() {
    return S.mode === 'coop' && S.partner
      && Math.abs(S.partner.r - battle.r) + Math.abs(S.partner.c - battle.c) <= 1;
  }
  function maybePatJoins() {
    if (!battle || battle.pat || S.mode !== 'coop' || !S.partner || S.partner.gone) return;
    if (patNear()) {
      battle.pat = { hp: S.partner.hearts, max: S.partner.maxHearts };
      battle.last = `${PAT_NAME} leaps in beside you.`;
      renderBattle();
    }
  }
  function battleWatchTick() {
    if (!battle) { battleEnd(); return; }
    maybePatJoins();
    if (!battle || battle.pat) return;
    if (S.partner && !S.partner.gone) {
      const st = partnerBfs(battle.r, battle.c);
      if (st) partnerStep(st.r, st.c);
      maybePatJoins();
    }
  }
  // what you can do in a fight, built from the things you carry
  function battleMoves() {
    const m = [{ key: 'strike', label: 'Strike', dmg: 1 }];
    if (S.inv.sword) m.push({ key: 'slash', label: 'Slash with the sword', dmg: 3 });
    if (S.inv.axe) m.push({ key: 'hew', label: 'Hew with the axe', dmg: 2 });
    if (S.inv.pick) m.push({ key: 'swing', label: 'Swing the pick', dmg: 2 });
    if (S.inv.honey && (battle.id === 'bear' || battle.id === 'troll')) m.push({ key: 'honey', label: 'Offer the honey', dmg: 99, honey: true });
    m.push({ key: 'run', label: 'Run', run: true });
    return m;
  }
  function battleMove(i) {
    if (!battle || battle.pending) return;
    if (i === -1) { endBattle(false, 'You break away and run. Whatever it was watches you go.'); return; }
    const mv = battleMoves()[i];
    if (!mv) return;
    if (mv.run) { endBattle(false, 'You break away and run. Whatever it was watches you go.'); return; }
    battle.last = `You use ${mv.label.toLowerCase().replace(/^with the /, '')}.`;
    if (mv.honey) S.inv.honey = false;
    battle.hp = Math.max(0, battle.hp - mv.dmg);
    hero.ouch = performance.now();
    finishBattleTurn();
  }
  function patBattleAct() {
    if (!battle) return;
    const moves = battleMoves().filter((m) => !m.run);
    let best = moves[0];
    for (const m of moves) if ((m.dmg || 0) > (best.dmg || 0)) best = m;
    battle.last = `${PAT_NAME} uses ${best.label.toLowerCase().replace(/^with the /, '')}.`;
    if (best.honey) S.inv.honey = false;
    battle.hp = Math.max(0, battle.hp - (best.dmg || 0));
    finishBattleTurn();
  }
  function enemyAct() {
    if (!battle) return;
    const youAlive = S.hearts > 0, patAlive = battle.pat && battle.pat.hp > 0;
    const t = !patAlive ? 'you' : !youAlive ? 'pat' : Math.random() < 0.5 ? 'you' : 'pat';
    if (t === 'you') {
      S.hearts = Math.max(0, S.hearts - battle.spec.dmg);
      hero.ouch = performance.now();
      battle.last = `The ${battle.spec.name} uses ${battle.spec.atk} on you for ${battle.spec.dmg}.`;
      if (S.hearts === 0) { wakeAtCheckpoint(); endBattle(false, 'They leave you where you fall. You wake elsewhere.'); return; }
    } else {
      battle.pat.hp = Math.max(0, battle.pat.hp - battle.spec.dmg);
      mara.ouch = performance.now();
      battle.last = `The ${battle.spec.name} uses ${battle.spec.atk} on ${PAT_NAME} for ${battle.spec.dmg}.`;
      if (battle.pat.hp === 0) {
        battle.pat = null;
        S.partner.hearts = S.partner.maxHearts;
        S.partner = Object.assign({}, S.partner, { r: S.checkpoint.r, c: S.checkpoint.c });
        snapPat();
        save();
        log(`${PAT_NAME} is beaten back and slips away to the last camp to mend.`);
      }
    }
    renderBattle();
  }
  function finishBattleTurn() {
    if (!battle || battle.pending) return;
    if (battle.hp <= 0) return endBattle(true);
    if (battle.pat) {
      battle.pending = true;
      setTimeout(() => { if (!battle) return; battle.pending = false; patBattleAct(); }, 420);
      return;
    }
    battle.pending = true;
    setTimeout(() => { if (!battle) return; battle.pending = false; enemyAct(); }, 520);
  }
  function endBattle(win, note) {
    const b = battle;
    if (!b) return;
    const { cell, r, c, spec } = b;
    battleEnd();
    closeOverlay();
    if (!win) {
      if (note) flash(note);
      save(); render(); partnerTurn();
      return;
    }
    if (!cell.used) {
      cell.used = true;
      if (spec.win) { S.coins += spec.win.coins || 0; log(spec.win.log); }
      if (spec.way) { const ch = S.chapters[cell.ch]; if (ch) ch.open = true; log(spec.way); }
      flash(spec.win ? `It is over.` : 'The way is clear.');
    }
    if (S.hero.r === r && S.hero.c === c) { save(); render(); partnerTurn(); }
    else moveTo(r, c);                     // you fought onto a barrier: now you may stand on it
  }
  function renderBattle() {
    if (!battle) return;
    const spec = battle.spec;
    overlay.innerHTML = `
      <div class="modal battle" role="dialog" aria-labelledby="bt-title">
        <h2 id="bt-title">A scrap</h2>
        <div class="b-fight">
          <div class="b-side foe">
            <div class="b-port"></div>
            <b>${spec.name}</b>
            <div class="hp"><i style="width:${Math.round(100 * battle.hp / spec.hearts)}%"></i></div>
          </div>
          <div class="b-mid">VS</div>
          <div class="b-side">
            <div class="b-fighter"><span class="b-pl">You</span><div class="hp"><i style="width:${Math.round(100 * S.hearts / S.maxHearts)}%"></i></div></div>
            ${battle.pat
        ? `<div class="b-fighter"><span class="b-pl pat">${PAT_NAME}</span><div class="hp good"><i style="width:${Math.round(100 * battle.pat.hp / battle.pat.max)}%"></i></div></div>`
        : `<p class="muted b-alone">${S.mode === 'coop' && S.partner ? `${PAT_NAME} is hurrying over.` : 'On your own.'}</p>`}
          </div>
        </div>
        <p class="b-last">${battle.last}</p>
        <div class="actions">
          ${battleMoves().map((mv, i) => `<button class="${i === 0 && !mv.run ? 'primary' : ''}" data-bm="${i}" type="button"><span class="key">${i + 1}</span> ${mv.label}</button>`).join('')}
        </div>
        <p class="muted">Keys 1&ndash;${battleMoves().length} pick a move. Esc turns and runs.</p>
      </div>`;
    overlay.querySelector('.b-port').appendChild(portrait(spec.sprite, spec.base));
    overlay.hidden = false;
  }

  // ---------- the partner ----------
  // Maren gets one action after each player step. She has her own hand and can lay a card into
  // any adjacent open square, but she only walks on cards the player has already turned over.
  // Ordinary cards are scenery to her; a fight, river or opened passage brings her to the hero.
  function patDist(a, b) { return Math.abs(a.r - b.r) + Math.abs(a.c - b.c); }
  function partnerOk(cell) {
    if (!cell || !cell.up) return false;
    const d = CARDS[cell.id];
    if (!d) return false;
    if (d.kind === 'enemy') return false;
    if (d.kind === 'block') {
      if (cell.id === 'river') return !!S.inv.boat;
      return !!carriesRoad(cell);            // an opened gate, a mended bridge, a lit cave
    }
    return true;
  }
  function partnerBfs(tr, tc) {
    const p = S.partner;
    if (p.r === tr && p.c === tc) return null;
    const seen = new Set([`${p.r},${p.c}`]);
    const q = [[p.r, p.c, null]];
    while (q.length) {
      const [r, c, first] = q.shift();
      for (const [dr, dc] of Object.values(DIRS)) {
        const nr = r + dr, nc = c + dc;
        if (!inBounds(nr, nc)) continue;
        if (nr === tr && nc === tc) return first || { r: nr, c: nc };
        if (seen.has(`${nr},${nc}`)) continue;
        if (!partnerOk(cellAt(nr, nc))) continue;
        seen.add(`${nr},${nc}`);
        q.push([nr, nc, first || { r: nr, c: nc }]);
      }
    }
    return null;
  }
  function partnerCard() {
    const h = S.partner.hand;
    const path = [], other = [];
    h.forEach((id, i) => {
      const k = CARDS[id].kind;
      if (k === 'path') path.push(i);
      else if (k !== 'action' && k !== 'enemy' && k !== 'block' && k !== 'goal') other.push(i);
    });
    const idx = path.length ? pick(path) : pick(other);
    if (idx === undefined) return null;
    return { idx, id: h[idx] };
  }
  function partnerStep(r, c) {
    const p = S.partner;
    const d0 = Math.sign(c - p.c);
    if (d0) mara.face = d0;
    p.r = r; p.c = c;
    p.steps = (p.steps || 0) + 1;
    revealAround(r, c);
    partnerArrive(cellAt(r, c));
    save();
    render();
  }
  function partnerUnlocked(r, c) {
    return inBounds(r, c) && Math.abs(r - S.hero.r) + Math.abs(c - S.hero.c) <= HERO_R;
  }
  function partnerArrive(cell) {
    if (!cell) return;
    const p = S.partner;
    if (!cell.up) return;
    const id = cell.id;
    if (id === 'camp') {
      if (p.hearts < p.maxHearts) { p.hearts = p.maxHearts; log(`${PAT_NAME} rests by the fire until she is whole again.`); }
      return;
    }
  }
  function partnerLayAndStep(r, c) {
    const sel = partnerCard();
    if (!sel) return false;
    put(r, c, sel.id, { up: true, mine: true, ch: chapterAt(c).i });
    const dir = Object.keys(DIRS).find((k) => DIRS[k][0] === r - S.partner.r && DIRS[k][1] === c - S.partner.c);
    log(`${PAT_NAME} lays ${CARDS[sel.id].name} to the ${DIR_WORD[dir]}.`);
    S.partner.hand[sel.idx] = draw();
    S.partner.lastLay = S.steps;
    partnerStep(r, c);
    return true;
  }
  function partnerLayBridge() {
    const p = S.partner, h = S.hero;
    for (const [dr, dc] of Object.values(DIRS)) {
      const r = p.r + dr, c = p.c + dc;
      if (!partnerUnlocked(r, c) || cellAt(r, c)) continue;
      const nd = Math.abs(r - h.r) + Math.abs(c - h.c);
      if (nd < patDist(p, h)) return partnerLayAndStep(r, c);
    }
    return false;
  }
  function partnerLayAdjacent() {
    const p = S.partner;
    for (const [dr, dc] of Object.values(DIRS)) {
      const r = p.r + dr, c = p.c + dc;
      if (partnerUnlocked(r, c) && !cellAt(r, c) && partnerLayAndStep(r, c)) return true;
    }
    return false;
  }
  function partnerTurn() {
    if (S.mode !== 'coop' || !S.partner || S.partner.gone) return;
    if (battle || dlg || modeSelect) return;
    const p = S.partner;
    const heroCell = cellAt(S.hero.r, S.hero.c);
    const needsHelp = heroCell && (CARDS[heroCell.id].kind === 'enemy'
      || heroCell.id === 'river' || heroCell.id === 'bridge' || heroCell.id === 'troll');
    if (needsHelp || patDist(p, S.hero) > 2) {
      const st = partnerBfs(S.hero.r, S.hero.c);
      if (st) { partnerStep(st.r, st.c); return; }
      if (partnerLayBridge()) return;
      return;
    }
    if (partnerLayAdjacent()) return;
    if (partnerLayBridge()) return;
    const steps = [];
    for (const dir of ['right', 'down', 'up', 'left']) {
      const [dr, dc] = DIRS[dir];
      const r = p.r + dr, c = p.c + dc;
      const cell = cellAt(r, c);
      if (inBounds(r, c) && cell && cell.up && partnerOk(cell)) steps.push([r, c]);
    }
    if (steps.length) partnerStep(...steps[0]);
  }

  function startPartnerIdle() {
    if (partnerIdle) clearInterval(partnerIdle);
    partnerIdle = setInterval(() => {
      if (S) partnerTurn();
    }, 1400);
  }

  // ---------- action cards ----------
  // Three of them, and every one is a swap:
  //   rework — a card in your hand for a fresh card from the deck.
  //   slip   — a card already placed for a card in your hand.
  //   cross  — a card in your hand for a card from another deck: Maren's hand on a
  //            collaborative walk, the deck itself when you walk alone, and later an
  //            opponent's deck when a competitive mode turns up.
  function actionHint() {
    const p = S.partner && !S.partner.gone ? S.partner : null;
    if (action.type === 'rework') {
      return 'Rework: pick one of your cards (1, 2, 3) — the deck gives you a fresh card for it. Esc gives it up.';
    }
    if (action.type === 'slip') {
      return action.phase === 'board'
        ? 'Slipline: click a card already on the ground. It comes into your hand; one of yours takes its place.'
        : 'Slipline: now pick a card in your hand (1, 2, 3) to leave on the ground.';
    }
    return `Crossed deck: pick a card in your hand (1, 2, 3) to trade with ${p ? `${PAT_NAME}'s hand` : 'the deck'}.`;
  }
  function actionPickable(i) {
    if (!action || i === S.selected) return false;
    if (CARDS[S.hand[i]].kind === 'action') return false;
    if (action.type === 'slip' && action.phase === 'board') return false;
    return true;
  }
  function playActionCard() {
    const i = S.selected;
    if (i != null) S.hand[i] = draw();      // the action card is spent; a new card takes its place
    action = null;
    S.selected = null;
    save();
    render();
  }
  function pickSlipBoard(r, c) {
    const cell = cellAt(r, c);
    if (!cell || !cell.up || cell.used) { flash('Pick a card that is face up and still whole.'); return; }
    if (cell.id === 'home' || cell.id === 'lighthouse') { flash('That card stays where it is.'); return; }
    if (CARDS[cell.id].kind === 'action') { flash('An action card cannot be left on the ground.'); return; }
    if (CARDS[cell.id].kind === 'enemy' || CARDS[cell.id].kind === 'block') { flash('The land is standing on that card.'); return; }
    action.br = r; action.bc = c;
    action.phase = 'hand';
    hint(actionHint());
    render();
  }
  function actionPick(i) {
    if (!action || i < 0 || i > 2) return;
    if (i === S.selected) { flash('You cannot swap the action card for itself.'); return; }
    if (action.type === 'rework') {
      const gave = CARDS[S.hand[i]].name;
      S.hand[i] = draw();
      log(`Rework: ${gave} leaves your hand, and ${CARDS[S.hand[i]].name} takes its place.`);
      playActionCard();
    } else if (action.type === 'slip') {
      if (action.phase !== 'hand') return;
      if (CARDS[S.hand[i]].kind === 'action') { flash('An action card cannot be left on the ground.'); return; }
      const target = cellAt(action.br, action.bc);
      const tookId = target.id, gaveId = S.hand[i];
      const took = CARDS[tookId].name, gave = CARDS[gaveId].name;
      target.id = gaveId;
      S.hand[i] = tookId;
      log(`Slipline: ${took} comes off the ground, and ${gave} takes its place.`);
      playActionCard();
    } else if (action.type === 'cross') {
      const p = S.partner && !S.partner.gone ? S.partner : null;
      const gave = CARDS[S.hand[i]].name;
      if (p) {
        const pj = rnd(p.hand.length);
        const took = CARDS[p.hand[pj]].name;
        const mine = S.hand[i];
        S.hand[i] = p.hand[pj];
        p.hand[pj] = mine;
        log(`Crossed deck: you pass ${gave} to ${PAT_NAME} and take ${took}.`);
      } else {
        S.hand[i] = draw();
        log(`Crossed deck: ${gave} goes back to the deck and a fresh card comes to you.`);
      }
      playActionCard();
    }
  }
  function cancelAction() {
    action = null;
    S.selected = null;
    hint(defaultHint());
    render();
  }

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
  function turnLabel() {
    if (battle) return 'A fight';
    if (action) return 'A card in hand';
    return phaseName() === 'place' ? 'Lay a card' : 'Take a step';
  }

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
      else if (S.selected === null) flash(`Open ground to the ${DIR_WORD[dir]}. Pick a card with 1, 2 or 3, then press ${DIR_WORD[dir]} to lay it there.`);
      else if (CARDS[S.hand[S.selected]].kind === 'action') flash('Action cards are played, not laid. Press 1, 2 or 3 to play the one in your hand.');
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
    if (!battle && !dlg) partnerTurn();
  }

  function placeAt(r, c) {
    if (S.selected === null || cellAt(r, c) || !isAdjacent(r, c) || !canPlace()) return;
    if (CARDS[S.hand[S.selected]].kind === 'action') { flash('Action cards are played, not laid.'); return; }
    const id = S.hand[S.selected];
    put(r, c, id, { up: true, mine: true, amount: id === 'coins' ? 1 + rnd(3) : undefined, ch: chapterAt(c).i });
    S.placed++;
    const dir = Object.keys(DIRS).find((k) => DIRS[k][0] === r - S.hero.r && DIRS[k][1] === c - S.hero.c);
    log(`You lay ${CARDS[id].name} to the ${DIR_WORD[dir]}.`);
    S.hand[S.selected] = draw();
    S.selected = null;               // hands empty again: the next direction key is a step
    S.phase = 'move';
    revealAround(r, c);
    save();
    render();
  }

  function selectHand(i) {
    const id = S.hand[i];
    if (CARDS[id].kind === 'action') {
      if (S.selected === i) { cancelAction(); return; }
      S.selected = i;
      action = { type: id, phase: id === 'slip' ? 'board' : 'hand', br: null, bc: null };
      hint(actionHint());
      render();
      return;
    }
    if (!canPlace()) { flash('You have laid your card. Take a step before you pick another.'); return; }
    if (!hasEmptyNeighbour()) { flash('No open ground beside you. Step onto any tile you like.'); return; }
    S.selected = S.selected === i ? null : i;
    hint(defaultHint());
    render();
  }
  function handPick(i) {
    if (action) actionPick(i);
    else selectHand(i);
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
    if (battle) { renderBattle(); return; }
    save();
    render();
  }
  function closeOverlay() {
    dlg = null;
    overlay.hidden = true;
    overlay.innerHTML = '';
  }
  function lampModal(won) {
    dlg = { escape: 0, options: [{ label: 'on' }, { label: 'again', do: () => newGame(S.mode, false) }] };
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
    if (S.steps === 0) return newGame(S.mode, false);
    dialog(null, 'New journey?', 'Every card you have laid will be gone, and the coast will lie differently next time.', [
      { label: 'Start again', primary: true, do: () => newGame(S.mode, false) },
      { label: 'Walk differently', do: () => showModeSelect() },
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
          <li><b>Lay.</b> Your hand holds three cards. Press <kbd>1</kbd>, <kbd>2</kbd> or <kbd>3</kbd> (or click) to pick one up, then press a direction, or click a marked space, to lay it beside you. You put it down and your hands are empty again: nothing is ever laid for you, so if you want another card down you pick another card up.</li>
          <li><b>Step.</b> <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or the arrow keys move you onto any tile next to you. Clicking a neighbouring tile works too. With no card in your hands a direction is always just a step, even if there is open ground that way.</li>
          <li>Stepping onto a tile does what it says: pick up the coins, meet the traveller, wake the wolf.</li>
        </ul>
        <h3>Chapters</h3>
        <p>Every stretch of the land ends in something that bars the way: a river, a wall, a gorge, a briar, a mountain. Each has one way through, and what you need to open it is hidden somewhere in the stretch before it, face down. Read the signpost. Talk to people. Or find the pedlar and pay.</p>
        <p>Every third chapter begins at a dark lighthouse. Light it and it becomes a place to wake up, along with any campfire you have rested at. Run out of hearts and you come round at the last one, with everything you laid still on the ground.</p>
        <p><b>Every lamp you light stays lit, for good.</b> The coast keeps count across all your walks, not just this one, and pays you back for it: a signpost after the first, an old mine after the second, and on up through chests, hollows, wells, hives, shrines, pedlars and worse, each one joining your deck permanently. The road you can lay on your tenth journey is not the road you could lay on your first.</p>
        <h3>Two ways to walk</h3>
        <p>You can walk the head alone, or hand in hand with <b>Maren</b>. On a walk together you each take a turn: Maren has her own hand, lays and replaces one of her cards, and moves on revealed ground. She ignores ordinary cards, but comes to a wolf or another dangerous passage when you do. She waits at the riverbank until the shared boat can carry her, and rests at a fire when she is hurt.</p>
        <h3>Action cards</h3>
        <p>Three cards work from the hand rather than the ground. <b>Rework</b> trades one of your cards for a fresh one from the deck. <b>Slipline</b> pulls a card already on the ground into your hand and leaves one of yours in its place. <b>Crossed deck</b> trades a card with Maren's hand, or with the deck when you walk alone. Picking an action card starts the swap; Esc puts it away unplayed, and you cannot lay one down.</p>
        <h3>Fights</h3>
        <p>Some of the land objects to company: a wolf, the bear, a toll keeper, a troll. When a fight starts you take turns — you, then (if she is alongside you) Maren, then the thing itself. Whatever you are holding is what you fight with: strike with your hands, slash once you hold a sword, and honey ends a fight nothing else can. Every fight has a <b>Run</b>, and running is never a bad idea twice. Fall, and you come round at the last place you slept.</p>
        <h3>The road</h3>
        <p>Every card carries a stretch of road, and it joins up with the road on the cards around it. Water, stone and thorn carry no road at all. A bridge does, and so does a gate once it is unlocked.</p>
        <h3>Face-down cards, and the mist</h3>
        <p>Some cards were on the ground before you arrived, and they give nothing away: the ground over one looks like any other ground. Come alongside it, by walking or by laying a card, and it turns itself over. A lookout hill turns over everything within two spaces.</p>
        <p>Everything past your road is mist. What you can see of the land, you have to take as it looks: grass, unless there is water in it, because a river is wide enough to make out from a fair way off. Read the signposts and listen to travellers, because they know where things are and the mist does not tell you.</p>
        <p class="muted" style="margin-top:0.8rem">Your journey saves itself as you go. Press <kbd>H</kbd> for this page.</p>
        <div class="actions">
          <button class="primary" data-action="close"><span class="key">1</span> Back to the road</button>
        </div>
      </div>`;
    overlay.hidden = false;
  }

  // ---------- drawing the land ----------
  // Everything is drawn in world units on `off`, whose context is scaled up by a whole number so
  // one world pixel is Z screen pixels and every pixel stays square. The canvas is the whole
  // window: the five rows you can walk sit in the middle of it, and the land carries on past them
  // in every direction until the mist takes it.
  let Z = 4, viewW = 176, viewH = 144, topY = 0, sprPx = 3, lastLayout = '';
  const hero = { x: START.c * TILE, y: START.r * TILE, face: 1, ouch: 0, walk: 0 };
  const mara = { x: START.c * TILE, y: START.r * TILE, face: 1, ouch: 0, walk: 0 };   // Maren, drawn on the land like the hero
  let camX = 0;
  let lastT = 0;

  function resize() {
    const cssW = Math.max(320, window.innerWidth);
    const cssH = Math.max(320, window.innerHeight);
    // Whole numbers only: half a pixel would fray the road art. Draw the tiles as large as the
    // window allows, so long as all five rows still fit in the gap the top bar and the card tray
    // leave over, a band of mist still fits above and below, and enough tiles still fit across for
    // you to see what is coming.
    const top = topbarEl.offsetHeight || 52;
    const bot = trayEl.offsetHeight || 190;
    const gap = Math.max(160, cssH - top - bot);
    Z = clamp(Math.min(
      Math.floor(cssH / ((ROWS + 2) * TILE)),
      Math.floor(gap / (ROWS * TILE)),
      Math.floor(cssW / (MIN_COLS * TILE))), 3, 9);
    viewW = Math.ceil(cssW / Z);
    viewH = Math.ceil(cssH / Z);
    // The road sits in the middle of that gap.
    const roadPx = ROWS * TILE * Z;
    let y = top + (cssH - top - bot - roadPx) / 2;
    if (y < 0 || y + roadPx > cssH) y = (cssH - roadPx) / 2;
    topY = clamp(Math.round(y / Z), 0, Math.max(0, viewH - ROWS * TILE));

    // Nothing about the land has actually changed: leave the canvas and the camera alone. Resizing
    // the canvas clears it, and snapping the camera in the middle of a step teleports the view.
    const layout = `${Z}:${viewW}:${viewH}:${topY}`;
    if (layout === lastLayout) { sizeCards(); return; }
    lastLayout = layout;

    off.width = viewW * Z; off.height = viewH * Z;
    octx.setTransform(Z, 0, 0, Z, 0, 0);                 // then draw in world units throughout
    octx.imageSmoothingEnabled = false;
    canvas.width = viewW * Z; canvas.height = viewH * Z;
    canvas.style.width = `${canvas.width}px`;
    canvas.style.height = `${canvas.height}px`;
    sprPx = SPRITE_PX;
    sizeCards();
    snapCamera();
  }

  // The cards in the tray are pixel art too, so their pictures are only ever drawn at a whole
  // number of screen pixels per art pixel. The window picks which whole number, and the tray is
  // laid out around it.
  let artScale = 0;
  function sizeCards() {
    const h = window.innerHeight, w = window.innerWidth;
    const s = w < 440 ? 3 : h < 660 || w < 620 ? 4 : h < 860 || w < 800 ? 5 : h < 1000 || w < 1180 ? 6 : 8;
    if (s === artScale) return;
    artScale = s;
    document.documentElement.style.setProperty('--art', `${s * 16}px`);
    if (S) renderHand();
  }

  function targetCam() { return Math.max(0, S.hero.c * TILE + TILE / 2 - viewW / 2); }
  function snapCamera() { if (S) camX = targetCam(); }
  function snapHero() { hero.x = S.hero.c * TILE; hero.y = S.hero.r * TILE; }
  function snapPat() { if (S && S.partner) { mara.x = S.partner.c * TILE; mara.y = S.partner.r * TILE; } }

  // A settled scatter: the same square always jitters its light the same way, so the edge of the
  // mist is ragged rather than a tidy row of circles, and it does not crawl as you walk.
  function hash(r, c, k) {
    let h = (r * 374761393 + c * 668265263 + k * 2246822519) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
    h = Math.imul(h, 1274126177) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  // ---------- the mist ----------
  // The mist is painted on its own small canvas, a few pixels to the tile, then blown up smooth
  // over the land. One soft round light is stamped out of it for every square you know anything
  // about, and a wider one for wherever you are standing.
  const fogCv = document.createElement('canvas');
  const fctx = fogCv.getContext('2d');
  let fogC0 = 0, fogCols = 0;

  const LIGHT_IMG = (() => {
    const n = 64, c = document.createElement('canvas');
    c.width = c.height = n;
    const cx = c.getContext('2d');
    const g = cx.createRadialGradient(n / 2, n / 2, n * 0.14, n / 2, n / 2, n / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.44, 'rgba(255,255,255,0.96)');
    g.addColorStop(0.74, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    cx.fillStyle = g;
    cx.fillRect(0, 0, n, n);
    return c;
  })();

  function stamp(x, y, radTiles, strength, r, c) {
    const rad = radTiles * (0.84 + 0.3 * hash(r, c, 1)) * FOG_SS;
    const ox = (hash(r, c, 2) - 0.5) * FOG_SS * 0.5;
    const oy = (hash(r, c, 3) - 0.5) * FOG_SS * 0.5;
    fctx.globalAlpha = strength;
    fctx.drawImage(LIGHT_IMG, x + ox - rad, y + oy - rad, rad * 2, rad * 2);
  }

  function paintFog(c0, c1) {
    const cols = c1 - c0 + 1;
    const w = cols * FOG_SS, h = Math.ceil(viewH / TILE * FOG_SS) + FOG_SS;
    if (fogCv.width !== w || fogCv.height !== h) { fogCv.width = w; fogCv.height = h; }
    const yOff = (topY / TILE) * FOG_SS;              // where row 0 falls on the mist canvas
    fctx.setTransform(1, 0, 0, 1, 0, 0);
    fctx.globalCompositeOperation = 'source-over';
    fctx.globalAlpha = 1;
    fctx.fillStyle = FOG_COL;
    fctx.fillRect(0, 0, w, h);

    fctx.globalCompositeOperation = 'destination-out';
    for (let c = c0; c <= c1; c++) for (let r = 0; r < ROWS; r++) {
      const cell = cellAt(r, c);
      if (!cell || !cell.up) continue;                // a card face down is no light and no clue
      stamp((c - c0 + 0.5) * FOG_SS, yOff + (r + 0.5) * FOG_SS, LIGHT_R, 1, r, c);
    }
    // and a wider light for you, so the ground opens up around wherever you stand. A single circle
    // would read as a lantern beam, so a few smaller ones are scattered round its edge, settled on
    // the square you are standing on: your pool of clear air is as lumpy as the rest of the mist,
    // and it takes a new shape each time you move.
    const hr = HERO_R * FOG_SS;
    const hx = (hero.x / TILE - c0 + 0.5) * FOG_SS, hy = yOff + (hero.y / TILE + 0.5) * FOG_SS;
    fctx.globalAlpha = 1;
    fctx.drawImage(LIGHT_IMG, hx - hr, hy - hr, hr * 2, hr * 2);
    const hrow = Math.round(hero.y / TILE), hcol = Math.round(hero.x / TILE);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5 + hash(hrow, hcol, 20 + i) * 0.2) * Math.PI * 2;
      const d = hr * (0.55 + 0.3 * hash(hrow, hcol, 30 + i));
      const rr = hr * (0.38 + 0.24 * hash(hrow, hcol, 40 + i));
      fctx.drawImage(LIGHT_IMG, hx + Math.cos(a) * d - rr, hy + Math.sin(a) * d - rr, rr * 2, rr * 2);
    }

    // the road is five rows wide and no wider: above and below it the mist closes back over
    fctx.globalCompositeOperation = 'source-over';
    fctx.globalAlpha = 1;
    const top0 = yOff, bot0 = yOff + ROWS * FOG_SS;
    if (top0 > 0) {
      const g = fctx.createLinearGradient(0, top0 - EDGE_ROWS * FOG_SS, 0, top0);
      g.addColorStop(0, FOG_COL); g.addColorStop(1, 'rgba(8, 10, 22, 0)');
      fctx.fillStyle = g; fctx.fillRect(0, 0, w, top0);
    }
    if (bot0 < h) {
      const g = fctx.createLinearGradient(0, bot0, 0, bot0 + EDGE_ROWS * FOG_SS);
      g.addColorStop(0, 'rgba(8, 10, 22, 0)'); g.addColorStop(1, FOG_COL);
      fctx.fillStyle = g; fctx.fillRect(0, bot0, w, h - bot0);
    }
    fogC0 = c0; fogCols = cols;
  }

  // A sprite standing on the tile at (x, y): centred across it, sitting near the bottom, and
  // sized to a whole number of screen pixels per sprite pixel.
  function drawStanding(img, x, y) {
    const dev = sprPx * 16;                  // the sprite, in screen pixels
    const slack = TILE * Z - dev;            // what is left of the tile, in screen pixels
    octx.drawImage(img, x + Math.round(slack / 2) / Z, y + Math.round(slack * 0.78) / Z, dev / Z, dev / Z);
  }

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

  // What you take an unturned square to be: grass, unless it is part of a river running across
  // the land, which you can see coming long before you can read the cards in it. Off the top and
  // bottom of the road it is grass and pine, and none of your business.
  const WATER_BASE = new Set(['water', 'bridge']);
  function guessBase(cell, r, c) {
    if (cell && WATER_BASE.has(CARDS[cell.id].base)) return 'water';
    if (r < 0 || r >= ROWS) return hash(r, c, 7) < 0.32 ? 'woods' : 'grass';
    return 'grass';
  }

  function drawWorld(t) {
    octx.imageSmoothingEnabled = false;
    octx.fillStyle = FOG_COL;
    octx.fillRect(0, 0, viewW, viewH);
    const cx = Math.round(camX);
    const c0 = Math.max(0, Math.floor(cx / TILE) - 1);
    const c1 = Math.floor((cx + viewW) / TILE) + 1;
    const r0 = Math.floor(-topY / TILE);
    const r1 = Math.ceil((viewH - topY) / TILE);
    const placing = S.selected !== null && canPlace();
    const pulse = 0.18 + 0.14 * Math.sin(t / 220);

    // the land, as far as you would guess it runs
    for (let c = c0; c <= c1; c++) for (let r = r0; r < r1; r++) {
      const x = c * TILE - cx, y = topY + r * TILE;
      const cell = cellAt(r, c);
      if (!cell || !cell.up) {
        // a card face down looks like the ground it is lying on, and nothing else
        octx.drawImage(ART.base(guessBase(cell, r, c)), x, y);
        continue;
      }
      const def = CARDS[cell.id];
      const look = cell.used && def.spent ? def.spent : def;
      const baseName = look.base || def.base;
      octx.drawImage(ART.base(baseName), x, y);
      if (baseName !== 'bridge' && baseName !== 'plankbridge') {
        const m = roadMask(r, c);
        if (m || carriesRoad(cell)) drawRoad(x, y, m);
      }
      if (look.sprite) {
        const img = ART.sprite(look.sprite);
        if (FULL_TILE.has(look.sprite)) octx.drawImage(img, x, y);
        else drawStanding(img, x, y);
      }
      if (!cell.mine && cell.id !== 'home') {       // a quiet mark on the cards that were here before you
        octx.fillStyle = ART.PAL.W; octx.globalAlpha = 0.55; octx.fillRect(x + 13, y + 1, 2, 2); octx.globalAlpha = 1;
      }
    }
    // the faint grid that says "these are squares", across the rows you can walk
    octx.fillStyle = ART.PAL.K;
    octx.globalAlpha = 0.16;
    for (let c = c0; c <= c1 + 1; c++) octx.fillRect(c * TILE - cx, topY, 1, ROWS * TILE);
    for (let r = 1; r < ROWS; r++) octx.fillRect(0, topY + r * TILE, viewW, 1);
    octx.globalAlpha = 1;

    // the mist over all of it
    paintFog(c0, c1);
    octx.imageSmoothingEnabled = true;
    octx.drawImage(fogCv, fogC0 * TILE - cx, 0, fogCols * TILE, (fogCv.height / FOG_SS) * TILE);
    octx.imageSmoothingEnabled = false;

    // open ground beside you, and where the card in your hand would land: over the mist, because
    // these are your own marks on the map rather than anything the land is showing you
    for (const dir of DIR_KEYS) {
      const [dr, dc] = DIRS[dir];
      const r = S.hero.r + dr, c = S.hero.c + dc;
      if (!inBounds(r, c) || cellAt(r, c)) continue;
      const x = c * TILE - cx, y = topY + r * TILE;
      if (placing) {
        octx.fillStyle = ART.PAL.y;
        octx.globalAlpha = pulse;
        octx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);
        octx.globalAlpha = 1;
        octx.fillRect(x + 7, y + 5, 2, 6);
        octx.fillRect(x + 5, y + 7, 6, 2);
      } else drawDotted(x, y, ART.PAL.W, 0.34);
    }

    // where a slippline can reach: every whole, face-up card, and the one you have already picked
    if (action && action.type === 'slip' && action.phase === 'board') {
      for (let c = c0; c <= c1; c++) for (let r = 0; r < ROWS; r++) {
        const cell = cellAt(r, c);
        if (!cell || !cell.up || cell.used) continue;
        if (cell.id === 'home' || cell.id === 'lighthouse') continue;
        const k = CARDS[cell.id].kind;
        if (k === 'action' || k === 'enemy' || k === 'block') continue;
        const x = c * TILE - cx, y = topY + r * TILE;
        octx.strokeStyle = ART.PAL.p;
        octx.globalAlpha = pulse * 1.4;
        octx.strokeRect(x + 1.5, y + 1.5, TILE - 3, TILE - 3);
        octx.globalAlpha = 1;
      }
      if (action.br != null) {
        const x = action.bc * TILE - cx, y = topY + action.br * TILE;
        octx.strokeStyle = ART.PAL.y; octx.lineWidth = 2;
        octx.strokeRect(x + 1, y + 1, TILE - 2, TILE - 2);
        octx.lineWidth = 1;
      }
    }

    // you
    const moving = Math.abs(hero.x - S.hero.c * TILE) > 0.5 || Math.abs(hero.y - S.hero.r * TILE) > 0.5;
    const frameName = moving && Math.floor(t / 110) % 2 ? 'hero2' : 'hero';
    const hx = Math.round(hero.x) - cx, hy = topY + Math.round(hero.y) - 1;
    const hurtNow = t - hero.ouch < 500 && Math.floor(t / 60) % 2;
    const standing = cellAt(S.hero.r, S.hero.c);
    const afloat = standing && standing.id === 'river';
    if (afloat) drawStanding(ART.sprite('boat'), hx, hy + 2);
    if (!hurtNow) {
      octx.fillStyle = ART.PAL.K; octx.globalAlpha = 0.3;
      octx.fillRect(hx + 5, hy + TILE - 2, 6, 1);
      octx.globalAlpha = 1;
      if (hero.face < 0) {
        octx.save(); octx.translate(hx + TILE, hy); octx.scale(-1, 1);
        drawStanding(ART.sprite(frameName), 0, 0);
        octx.restore();
      } else drawStanding(ART.sprite(frameName), hx, hy);
    }

    // Maren, when you are walking together. She shares the road rather than owning it, so she
    // sits the same way: on a river, a boat; a hurt blink when she has been struck.
    if (S.mode === 'coop' && S.partner) {
      const patMoving = Math.abs(mara.x - S.partner.c * TILE) > 0.5 || Math.abs(mara.y - S.partner.r * TILE) > 0.5;
      const pFrame = patMoving && Math.floor(t / 110) % 2 ? 'maren2' : 'maren';
      const same = S.partner.r === S.hero.r && S.partner.c === S.hero.c;
      const fx = Math.round(mara.x) - cx + (same ? TILE * 0.4 : 0);
      const fy = topY + Math.round(mara.y) - 1;
      const pCell = cellAt(S.partner.r, S.partner.c);
      const pFloat = pCell && pCell.id === 'river';
      if (pFloat) drawStanding(ART.sprite('boat'), fx, fy + 2);
      const pHurt = t - mara.ouch < 500 && Math.floor(t / 60) % 2;
      if (!pHurt) {
        octx.fillStyle = ART.PAL.K; octx.globalAlpha = 0.3;
        octx.fillRect(fx + 5, fy + TILE - 2, 6, 1);
        octx.globalAlpha = 1;
        if (mara.face < 0) {
          octx.save(); octx.translate(fx + TILE, fy); octx.scale(-1, 1);
          drawStanding(ART.sprite(pFrame), 0, 0);
          octx.restore();
        } else drawStanding(ART.sprite(pFrame), fx, fy);
      }
    }

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(off, 0, 0);
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
      if (S.mode === 'coop' && S.partner) {
        const px = S.partner.c * TILE, py = S.partner.r * TILE;
        mara.x += (px - mara.x) * Math.min(1, k * 1.4);
        mara.y += (py - mara.y) * Math.min(1, k * 1.4);
        if (Math.abs(px - mara.x) < 0.3) mara.x = px;
        if (Math.abs(py - mara.y) < 0.3) mara.y = py;
      }
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
      const isAction = d.kind === 'action';
      let disabled = !laying;
      if (isAction) disabled = !!(action && action.type !== 'cross' && action.type !== 'rework');
      else if (action) disabled = !actionPickable(i);
      const b = document.createElement('button');
      b.className = 'hcard' + (S.selected === i ? ' sel' : '') + (isAction ? ' action' : '');
      b.type = 'button';
      b.dataset.kind = d.kind; b.dataset.i = i;
      b.setAttribute('aria-pressed', S.selected === i);
      b.disabled = disabled;
      b.innerHTML = `<span class="key">${i + 1}</span><span class="pic"></span><span class="name">${d.name}</span><span class="text">${d.text}</span>`;
      b.querySelector('.pic').appendChild(ART.iconCanvas(d.sprite, artScale || 8, d.base, true));
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
    if (S.mode === 'coop' && S.partner) {
      const p = document.createElement('span');
      p.className = 'stat pat';
      p.title = `${PAT_NAME}'s ${S.partner.hearts} of ${S.partner.maxHearts} hearts`;
      for (let i = 0; i < S.partner.maxHearts; i++) p.appendChild(ART.iconCanvas(i < S.partner.hearts ? 'patheart' : 'patheartoff', 2));
      statsEl.appendChild(p);
    }
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
    if (k === 'escape' && (action || (battle && !dlg))) { e.preventDefault(); if (battle && !action) { battleMove(-1); } else cancelAction(); return; }
    if (dlg) {
      if (k === 'escape') { e.preventDefault(); chooseOption(dlg.escape != null ? dlg.escape : dlg.options.length - 1); }
      else if (/^[1-9]$/.test(k)) { e.preventDefault(); chooseOption(+k - 1); }
      return;
    }
    if (modeSelect) {
      if (k === '1') chooseMode('solo');
      else if (k === '2') chooseMode('coop');
      return;
    }
    if (battle) {
      if (/^[1-9]$/.test(k)) { e.preventDefault(); battleMove(+k - 1); }
      else if (k in KEYDIR) { e.preventDefault(); }
      return;
    }
    if (k in KEYDIR) { e.preventDefault(); act(KEYDIR[k]); }
    else if (k === '1' || k === '2' || k === '3') { e.preventDefault(); handPick(+k - 1); }
    else if (k === 'escape') { S.selected = null; hint(defaultHint()); render(); }
    else if (k === '?' || k === 'h') showHelp();
  });

  canvas.addEventListener('click', (e) => {
    if (dlg || modeSelect) return;
    const box = canvas.getBoundingClientRect();
    const wx = (e.clientX - box.left) / Z + Math.round(camX);
    const wy = (e.clientY - box.top) / Z - topY;
    const c = Math.floor(wx / TILE), r = Math.floor(wy / TILE);
    if (!inBounds(r, c)) return;
    if (action) {
      if (action.type === 'slip' && action.phase === 'board') pickSlipBoard(r, c);
      else flash(`${actionHint()} (Esc cancels.)`);
      return;
    }
    if (!isAdjacent(r, c)) { if (!(r === S.hero.r && c === S.hero.c)) flash('Too far. You can only reach the tiles next to you.'); return; }
    if (!cellAt(r, c)) {
      if (!canPlace()) flash('Your card is already down. Take your step first.');
      else if (S.selected === null) flash('Pick a card from your hand first (1, 2, 3).');
      else if (CARDS[S.hand[S.selected]].kind === 'action') flash('Action cards are played, not laid. Use 1, 2 or 3.');
      else placeAt(r, c);
      return;
    }
    tryMove(r, c);
  });

  handEl.addEventListener('click', (e) => {
    const b = e.target.closest('.hcard');
    if (b && !b.disabled) handPick(+b.dataset.i);
  });

  document.querySelector('.dpad').addEventListener('click', (e) => {
    const b = e.target.closest('[data-dir]');
    if (b && !dlg && !modeSelect && !battle && !action) act(b.dataset.dir);
  });

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-action]');
    if (!b) return;
    const a = b.dataset.action;
    if (a === 'help') showHelp();
    else if (a === 'close') { closeOverlay(); render(); }
    else if (a === 'new-game') confirmNewGame();
    else if (a === 'rail') document.body.classList.toggle('rail-open');
  });

  overlay.addEventListener('click', (e) => {
    const bm = e.target.closest('[data-bm]');
    if (bm) { battleMove(+bm.dataset.bm); return; }
    const mb = e.target.closest('[data-mode]');
    if (mb) { chooseMode(mb.dataset.mode); return; }
    const b = e.target.closest('[data-opt]');
    if (b) { chooseOption(+b.dataset.opt); return; }
    if (e.target === overlay && dlg && !overlay.querySelector('[data-opt]')) { closeOverlay(); render(); }
  });

  window.addEventListener('resize', () => { resize(); });
  window.addEventListener('orientationchange', () => { resize(); });
  // The tray grows and shrinks with the card in hand, and the road recentres itself under it.
  if (window.ResizeObserver) new ResizeObserver(() => { if (S) resize(); }).observe(trayEl);

  // ---------- go ----------
  loadBest();
  if (load()) {
    if (S.mode === 'coop' && !S.partner) initPartner();
    if (S.partner) snapPat();
    ensureGenerated(S.hero.c);
    save();                       // keep the land that was just generated, so it lies the same next time
    snapHero();
    resize();
    render();
    hint('Welcome back. Your road is where you left it.');
  } else {
    freshState();
    ensureGenerated(START.c);
    snapHero();
    resize();
    render();
    showModeSelect();
  }
  requestAnimationFrame(frame);
  startPartnerIdle();

  // Small hook for smoke tests.
  window.__wayside = {
    get S() { return S; }, get BEST() { return BEST; }, CARDS, CHAPTERS, DECK, LAMP_CARDS,
    deck, draw, lampsEver, lampCardsWon, nextLampCard, countLampEver, render,
    get battle() { return battle; }, get action() { return action; },
    setMode: (m) => { if (!dlg && !battle) { chooseMode(m); } },
    partnerTurn, tryMove, placeAt, moveTo, act, handPick, actionPick, pickSlipBoard,
    battleMove, startBattle, showModeSelect,
    get view() { return { Z, topY, viewW, viewH, camX: Math.round(camX), TILE, ROWS }; },
    setLampsEver: (n) => { BEST.lampsEver = n; render(); },
  };
})();
