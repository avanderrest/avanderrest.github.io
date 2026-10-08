/* Wayside: the rules. Pick one of three cards to lay the road ahead, then walk it. The
   land runs east chapter after chapter, each ending in something that bars the way and
   hiding, somewhere in the stretch before it, the people and things that get you past.
   Every third chapter ends at a dark lighthouse.

   Nothing here touches the page. view.js draws the land and the mist and turns keys into
   these verbs; test/wayside/*.node.js walk it in Node.

     const w = createWayside({ saved, best, seed, rnd, on })
       saved   a previous w.serialize()
       best    the lifetime record ({ far, lamps, lampsEver }); lamps ever lit grow the deck
       seed    the coast to generate (a number). Each chapter is laid out from its own stream,
               streamFor(seed, 'ch' + i), so the same seed is the same coast however the walk
               goes. The URL carries it (lib/seed.js).
       rnd     the dice for everything else (card draws, fights, finds); Math.random by default
       on      on(event, data):
                 'changed'       save and redraw
                 'flash' text    a passing message; 'hint' text a standing one
                 'banner' ch     a new chapter
                 'dialog'        w.dlg is open (title, say, options); 'close' it is shut
                 'battle'        w.battle has changed; 'battle-over'; 'battle-wait' ms: call
                                 w.battleResolve() after that long
                 'lamp' won      a lamp just lit (won: the card it added to the deck, or null)
                 'ouch' who · 'face' { who, d } · 'snap' who    for the sprites
                 'best'          the lifetime record changed; keep it
                 'new-game'      a fresh walk has begun */

import { mulberry32, streamFor, newSeed } from '../lib/rng.js';

// ---------- constants ----------
export const PAT_NAME = 'Maren';
export const COMPANIONS = {
  maren: { name: 'Maren', className: 'Wayfinder', sprite: 'maren', attack: { label: 'Find the opening', dmg: 2 }, help: 'bridge', talk: 'She knows the old crossings and reads a road at a glance.' },
  brin: { name: 'Brin', className: 'Forager', sprite: 'maren', attack: { label: 'Thorn jab', dmg: 2 }, help: 'troll', talk: 'They know what grows in the wild places, and what makes hungry things listen.' },
  ivo: { name: 'Ivo', className: 'Tinkerer', sprite: 'maren', attack: { label: 'Clockwork blow', dmg: 2 }, help: 'gate', talk: 'He carries a pocketful of tools and can make a stubborn lock reconsider.' },
};
export const ROWS = 5;
export const TILE = 16;                 // world pixels per tile
const HEART_CAP = 5;
const LOOKAHEAD = 14;            // keep this many columns generated beyond the hero
export const LIGHTHOUSE_EVERY = 3;      // chapters
export const START = { r: 2, c: 0 };
export const DIRS = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
export const DIR_WORD = { up: 'north', down: 'south', left: 'west', right: 'east' };
export const DIR_KEYS = ['up', 'right', 'down', 'left'];   // bit order for the road masks
export const HERO_R = 3;                // how far you hold the mist off, in tiles (and how far Maren may build)

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const inBounds = (r, c) => r >= 0 && r < ROWS && c >= 0;
export const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

// ---------- cards ----------
// kind: path | item | npc | enemy | block | goal | action. base is the ground, sprite what
// stands on it. `spent` is how a used-up card looks afterwards. `road` forces the road to
// run those ways once the card carries road at all: a bridge is a bridge whatever sits beside
// it. An action card is never laid on the ground: you play it from your hand for its effect.
export const CARDS = {
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

export const ITEMS = {
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
export const DECK = [['meadow', 8], ['woods', 7], ['brook', 4], ['berries', 3], ['camp', 2], ['wolf', 4], ['traveller', 3], ['lookout', 2], ['rework', 1], ['slip', 1], ['cross', 1]];
const FIND_CHANCE = 0.28;   // chance that plain ground has something dropped on it

// Every lighthouse you have ever lit stays lit, and the coast remembers: each one puts a new
// kind of card into the deck for good, on this walk and on every walk after it. This is the
// only thing in Wayside that carries between journeys, which is why it is the reason to walk
// the road again.
export const LAMP_CARDS = [
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

// ---------- chapters ----------
// Each chapter of the road ends in a barrier with one way through, and seeds the stretch
// before it with what you need. The pedlar sells the chapter's key item for anyone who would
// rather pay.
export const CHAPTERS = {
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

// ---------- battles ----------
// Fights are small, turn-based scrapes. Your attacks come from what you have collected (a
// sword slashes, an axe hews, a pick swings) and honey buys an ending no blade can. Every fight
// also has a Run. In a collaborative walk the partner joins the moment they are alongside you,
// and never leaves you waiting: their turn falls between yours and the enemy's.
export const BATTLES = {
  wolf: { name: 'Wolf', hearts: 2, dmg: 1, atk: 'Bite', sprite: 'wolf', base: 'grass', win: { coins: 2, log: 'The wolf slinks off, leaving 2 coins in the grass, oddly.' } },
  tent: { name: 'Bandits', hearts: 2, dmg: 1, atk: 'Bludgeon', sprite: 'tent', base: 'grass', win: { coins: 4, log: 'The bandits scatter, leaving their takings. 4 coins.' } },
  bear: { name: 'Bear', hearts: 3, dmg: 1, atk: 'Swat', sprite: 'bear', base: 'woods', win: { coins: 3, log: 'The bear lumbers off, and there are 3 coins where it sat.' } },
  bandit: { name: 'Toll keeper', hearts: 2, dmg: 1, atk: 'Cudgel', sprite: 'bandit', base: 'bridge', way: 'He limps off down the far bank, cursing tolls. The bridge is yours.' },
  troll: { name: 'Troll', hearts: 4, dmg: 2, atk: 'Crush', sprite: 'troll', base: 'woods', way: 'The troll drags itself into the briar and does not come back. The gap is open.' },
};

// ---------- the walk ----------
export function createWayside({ saved = null, best = null, seed = null, rnd = Math.random, on = () => {} } = {}) {
  const rint = (n) => Math.floor(rnd() * n);
  const pick = (arr) => arr[rint(arr.length)];
  let S = null;                  // the saved game
  let BEST = Object.assign({ far: 0, lamps: 0, lampsEver: 0 }, best || {});
  let dlg = null;                // open dialogue: { sprite, title, say, options: [{ label, do }] }
  let action = null;             // playing an action card: { type, phase, br, bc }; never saved, it is a hand
  let battle = null;             // an open fight; never saved
  let hold = false;              // the page has something up (the mode screen): the partner waits

  const changed = () => on('changed');
  const flash = (t) => on('flash', t);
  const hint = (t) => on('hint', t);
  const partnerName = () => (S && S.partner ? S.partner.name : PAT_NAME);
  const partnerType = () => (S && S.partner ? (COMPANIONS[S.partner.type] || COMPANIONS.maren) : COMPANIONS.maren);

  const lampsEver = () => (BEST && BEST.lampsEver) || 0;
  const lampCardsWon = () => LAMP_CARDS.filter((x) => lampsEver() >= x.at);
  const nextLampCard = () => LAMP_CARDS.find((x) => lampsEver() < x.at) || null;
  const deck = () => DECK.concat(lampCardsWon().map((x) => [x.id, x.w]));
  function draw() {
    const d = deck();
    let total = 0;
    for (const [, w] of d) total += w;
    let x = rint(total);
    for (const [id, w] of d) { if (x < w) return id; x -= w; }
    return 'meadow';
  }

  function cellAt(r, c) {
    if (!inBounds(r, c)) return null;
    return S.grid[r][c] || null;
  }
  function put(r, c, id, extra) {
    while (S.grid[0].length <= c) for (let rr = 0; rr < ROWS; rr++) S.grid[rr].push(null);
    S.grid[r][c] = Object.assign({ id, up: false, used: false, mine: false }, extra || {});
  }
  function freshState(sd) {
    S = {
      v: 4, seed: sd >>> 0, mode: 'solo', companion: 'maren', partner: null, grid: Array.from({ length: ROWS }, () => []), gen: 0, chapters: [],
      hero: { ...START }, checkpoint: { ...START }, hearts: 3, maxHearts: 3, coins: 0, inv: {}, flags: {},
      hand: [draw(), draw(), draw()], selected: null, phase: 'place',
      steps: 0, placed: 0, far: 0, lamps: 0, seenChapter: -1, rumoursTold: [], log: [],
    };
    ensureGenerated(START.c);
  }

  // Lay out the next chapter of the land: a barrier at the far end, a campfire at the near
  // end, and what you need scattered face down in between. Every roll here comes from the
  // chapter's own stream, so the coast is the seed's and nobody else's.
  function generateChapter() {
    const i = S.chapters.length;
    const g = streamFor(S.seed, 'ch' + i);
    const gint = (n) => Math.floor(g() * n);
    const gpick = (arr) => arr[gint(arr.length)];
    const prev = S.chapters[i - 1];
    const start = S.gen;
    const len = 8 + gint(3);
    const end = start + len - 1;
    const type = i === 0 ? 'river' : gpick(TYPES.filter((t) => !prev || t !== prev.type));
    const tpl = CHAPTERS[type];
    const recent = S.chapters.slice(-4).map((c) => c.name);
    const fresh = tpl.names.filter((n) => !recent.includes(n));
    const ch = { i, start, end, type, name: gpick(fresh.length ? fresh : tpl.names), passRow: gint(ROWS), open: false, met: {} };

    for (let r = 0; r < ROWS; r++) put(r, end, r === ch.passRow ? tpl.pass : tpl.block, { ch: i });
    if (i === 0) put(START.r, START.c, 'home', { up: true, mine: true, ch: i });
    else put(gint(ROWS), start, 'camp', { ch: i });

    const taken = new Set();
    const free = () => {
      for (let tries = 0; tries < 60; tries++) {
        const r = gint(ROWS), c = start + 1 + gint(len - 2);
        const k = `${r},${c}`;
        if (taken.has(k) || cellAt(r, c)) continue;
        taken.add(k);
        return [r, c];
      }
      return null;
    };
    const seed = (id, extra) => { const at = free(); if (at) put(at[0], at[1], id, Object.assign({ ch: i }, extra || {})); };

    if (i > 0 && i % LIGHTHOUSE_EVERY === 0) {
      const r = gint(ROWS);
      put(r, start + 1, 'lighthouse', { up: true, ch: i });
      taken.add(`${r},${start + 1}`);
    }
    tpl.seeds.forEach((id) => seed(id));
    seed('pedlar');
    seed('sign');
    seed('coins', { amount: 2 + gint(3) });
    seed('berries');
    if (i === 0) { seed('mine'); seed('smith'); seed('coins', { amount: 3 }); }
    else if (g() < 0.3) seed('mine');
    const wolves = Math.min(4, 1 + Math.floor(i / 2)) + gint(2);
    for (let w = 0; w < wolves; w++) seed('wolf');
    if (i >= 2 && g() < 0.55) seed('bear');
    if (i >= 1 && g() < 0.45) seed('tent');
    if (g() < 0.8) seed('traveller');
    if (g() < 0.5) seed('lookout');
    if (g() < 0.5) seed('chest');
    if (g() < 0.35) seed('shrine');
    if (g() < 0.35) seed('well');
    if (g() < 0.5) seed('coins', { amount: 1 + gint(3) });

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

  function initPartner(type) {
    const companion = COMPANIONS[type] || COMPANIONS.maren;
    S.partner = {
      type: type || 'maren', name: companion.name, className: companion.className,
      r: START.r, c: START.c, hearts: S.maxHearts, maxHearts: S.maxHearts,
      hand: [draw(), draw(), draw()], gone: false, rest: 0, lastLayPlaced: 0,
    };
    on('snap', 'pat');
  }

  function newGame(mode, companionId, sd) {
    const selectedCompanion = companionId || (S && S.companion) || 'maren';
    const keepMode = S && S.mode;
    S = null;
    battleEnd();
    action = null;
    dlg = null;
    freshState(sd == null ? newSeed() : sd);
    S.mode = mode || keepMode || 'solo';
    S.companion = selectedCompanion;
    if (S.mode === 'coop') initPartner(S.companion);
    log(S.mode === 'coop'
      ? `${partnerName()} the ${partnerType().className} is at the door with a satchel. ${partnerType().talk}`
      : 'You lock the door behind you. The coast runs east, and every lighthouse on it is dark.');
    revealAround(START.r, START.c, true);
    on('new-game');
    changed();
    hint('Lay a card first: pick one with 1, 2 or 3, then press a direction. Then you may step onto it.');
  }

  // A saved walk, brought up to date. A walk saved before seeds gets one now, so the chapters
  // still to be generated come from it.
  function restore(s) {
    if (!s || s.v < 3 || !Array.isArray(s.grid) || s.grid.length !== ROWS) return false;
    if (s.v < 4) { s.v = 4; s.mode = s.mode || 'solo'; s.companion = 'maren'; s.partner = null; }
    if (s.seed == null) s.seed = newSeed();
    s.companion = s.companion || (s.partner && s.partner.type) || 'maren';
    if (s.mode !== 'solo' && s.mode !== 'coop') s.mode = 'solo';
    if (s.partner) {
      s.partner.type = s.partner.type || s.companion;
      const companion = COMPANIONS[s.partner.type] || COMPANIONS.maren;
      s.partner.name = companion.name;
      s.partner.className = companion.className;
      if (!Number.isInteger(s.partner.lastLayPlaced)) s.partner.lastLayPlaced = s.placed || 0;
    }
    if (s.mode === 'coop' && (!s.partner || !s.partner.hand)) s.partner = null;
    S = s;
    if (S.mode === 'coop' && !S.partner) initPartner();
    ensureGenerated(S.hero.c);
    return true;
  }

  function saveBest() {
    let ch = false;
    if (S.far > BEST.far) { BEST.far = S.far; ch = true; }
    if (S.lamps > BEST.lamps) { BEST.lamps = S.lamps; ch = true; }
    if (ch) on('best');
  }
  // A lamp, once lit, is lit for good. Counted separately from the best single walk, because
  // this is the number the deck grows on.
  function countLampEver() {
    BEST.lampsEver = lampsEver() + 1;
    on('best');
    return LAMP_CARDS.find((x) => x.at === BEST.lampsEver) || null;
  }

  // ---------- journal ----------
  function log(text) {
    S.log.unshift(text);
    if (S.log.length > 60) S.log.length = 60;
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
  const isAdjacent = (r, c) => Math.abs(r - S.hero.r) + Math.abs(c - S.hero.c) === 1;
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
    if (rnd() >= FIND_CHANCE) return;
    const n = 1 + rint(3);
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
    on('snap', 'hero');
  }
  function hurt(n, why) {
    S.hearts = Math.max(0, S.hearts - n);
    log(why);
    on('ouch', 'hero');
    if (S.hearts === 0) { wakeAtCheckpoint(); partnerTurn(); }
    else flash(why);
  }
  function openWay(cell, how) {
    cell.used = true;
    const ch = S.chapters[cell.ch];
    if (ch) ch.open = true;
    log(how);
  }
  const leave = (label) => [{ label: label || 'Leave', primary: true }];
  function dialog(sprite, title, say, options, kind) {
    dlg = { sprite, title, say, options, kind: kind || 'talk' };
    on('dialog');
  }
  function chooseOption(i) {
    if (!dlg || !dlg.options[i] || dlg.options[i].disabled) return;
    const o = dlg.options[i];
    dlg = null;
    on('close');
    if (o.do) o.do();
    if (battle) { on('battle'); return; }
    changed();
  }
  function closeDialog() { dlg = null; on('close'); }

  // per-card behaviour. tryEnter returns false to stop the move (and may open a dialogue that
  // moves you afterwards). arrive fires once you are standing on the card.
  const ON = {
    home: { arrive() { S.checkpoint = { ...START }; } },
    coins: {
      arrive(cell) {
        if (cell.used) return;
        cell.used = true;
        const n = cell.amount || (1 + rint(3));
        S.coins += n;
        log(`You pocket ${plural(n, 'coin')}.`);
        flash(`+${plural(n, 'coin')}`);
      },
    },
    berries: { arrive(cell) { if (cell.used) return; cell.used = true; heal(1, 'Berries. %', 'A heart back.'); } },
    camp: {
      arrive(cell, r, c) {
        const first = S.checkpoint.r !== r || S.checkpoint.c !== c;
        S.checkpoint = { r, c };
        if (S.hearts < S.maxHearts) { S.hearts = S.maxHearts; log('You rest by the fire until you are whole again.'); flash('Rested. All hearts back.'); }
        else if (first) { log('You bank the fire so it will still be here when you need it.'); flash('You will wake here if you fall.'); }
        else log('The fire is warm. Nothing to mend today.');
      },
    },
    wolf: { arrive(cell, r, c) { if (!cell.used) startBattle(cell, r, c, 'wolf'); } },
    bear: { arrive(cell, r, c) { if (!cell.used) startBattle(cell, r, c, 'bear'); } },
    tent: { arrive(cell, r, c) { if (!cell.used) startBattle(cell, r, c, 'tent'); } },
    chest: {
      arrive(cell) {
        if (cell.used) return;
        cell.used = true;
        if (rnd() < 0.3) hurt(1, 'You lift the lid and a snake lifts its head. It bites before you can shut it.');
        else { const n = 3 + rint(4); S.coins += n; log(`The chest holds ${plural(n, 'coin')}, and no snake.`); flash(`+${plural(n, 'coin')}`); }
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
        on('ouch', 'hero');
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
            const roll = rnd();
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
        if (partnerType().help === 'bridge' && S.partner && !S.partner.gone) opts.push({ label: `${partnerName()} finds a safer crossing`, primary: true, do() { openWay(cell, `${partnerName()} spots a shallow crossing below the bridge and gets you both over.`); moveTo(r, c); } });
        opts.push({ label: 'Fight him', primary: true, do() { startBattle(cell, r, c, 'bandit'); } });
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
        if (partnerType().help === 'gate' && S.partner && !S.partner.gone) {
          openWay(cell, `${partnerName()} coaxes the lock open with a tool no bigger than a toothpick.`);
          flash(`${partnerName()} opened the gate.`);
          return true;
        }
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
        if (partnerType().help === 'troll' && S.partner && !S.partner.gone) opts.push({ label: `${partnerName()} offers a wild treat`, primary: true, do() { openWay(cell, `${partnerName()} finds a sweet root in the bracken. The troll takes it and lumbers aside.`); moveTo(r, c); } });
        if (S.inv.honey) opts.push({ label: 'Offer the honey', primary: true, do() { S.inv.honey = false; openWay(cell, 'The troll takes the honey pot in both hands, wanders into the briar with it, and does not come back.'); moveTo(r, c); } });
        opts.push({ label: 'Fight him', primary: !S.inv.honey, do() { startBattle(cell, r, c, 'troll'); } });
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
        dlg = { kind: 'lamp', escape: 0, lamp: won, options: [{ label: 'on' }, { label: 'again', do: () => newGame(S.mode) }] };
        on('lamp', won);
      },
    },
  };

  // ---------- battles ----------
  function startBattle(cell, r, c, id) {
    if (!BATTLES[id]) return;
    battle = {
      cell, r, c, id, spec: BATTLES[id],
      heroR: S.hero.r, heroC: S.hero.c,
      hp: BATTLES[id].hearts, pat: null, last: '', pending: null,
    };
    battle.last = `The ${battle.spec.name} stands in the way.`;
    maybePatJoins();
    changed();
    on('battle');
  }
  function battleEnd() { battle = null; }
  function patNear() {
    return S.mode === 'coop' && S.partner && Math.abs(S.partner.r - battle.r) + Math.abs(S.partner.c - battle.c) <= 1;
  }
  function maybePatJoins() {
    if (!battle || battle.pat || S.mode !== 'coop' || !S.partner || S.partner.gone) return;
    if (patNear()) {
      battle.pat = { hp: S.partner.hearts, max: S.partner.maxHearts };
      battle.last = `${partnerName()} leaps in beside you.`;
      on('battle');
    }
  }
  // the partner hurries over to a fight they are not in yet: one step each time it is called
  function battleWatchTick() {
    if (!battle) return;
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
    on('ouch', 'hero');
    finishBattleTurn();
  }
  function patBattleAct() {
    if (!battle) return;
    const attack = partnerType().attack;
    battle.last = `${partnerName()} uses ${attack.label.toLowerCase()}.`;
    battle.hp = Math.max(0, battle.hp - attack.dmg);
    finishBattleTurn();
  }
  function enemyAct() {
    if (!battle) return;
    const youAlive = S.hearts > 0, patAlive = battle.pat && battle.pat.hp > 0;
    const t = !patAlive ? 'you' : !youAlive ? 'pat' : rnd() < 0.5 ? 'you' : 'pat';
    if (t === 'you') {
      S.hearts = Math.max(0, S.hearts - battle.spec.dmg);
      on('ouch', 'hero');
      battle.last = `The ${battle.spec.name} uses ${battle.spec.atk} on you for ${battle.spec.dmg}.`;
      if (S.hearts === 0) { wakeAtCheckpoint(); endBattle(false, 'They leave you where you fall. You wake elsewhere.'); return; }
    } else {
      battle.pat.hp = Math.max(0, battle.pat.hp - battle.spec.dmg);
      on('ouch', 'pat');
      battle.last = `The ${battle.spec.name} uses ${battle.spec.atk} on ${partnerName()} for ${battle.spec.dmg}.`;
      if (battle.pat.hp === 0) {
        battle.pat = null;
        S.partner.hearts = S.partner.maxHearts;
        S.partner = Object.assign({}, S.partner, { r: S.checkpoint.r, c: S.checkpoint.c });
        on('snap', 'pat');
        log(`${partnerName()} is beaten back and slips away to the last camp to mend.`);
        changed();
      }
    }
    on('battle');
  }
  // After your move the partner (if alongside) and then the enemy take theirs. The pause
  // between is the view's business: it calls battleResolve() when it has shown the last move.
  function finishBattleTurn() {
    if (!battle || battle.pending) return;
    if (battle.hp <= 0) return endBattle(true);
    battle.pending = battle.pat ? 'pat' : 'enemy';
    on('battle');
    on('battle-wait', battle.pat ? 420 : 520);
  }
  function battleResolve() {
    if (!battle || !battle.pending) return;
    const who = battle.pending;
    battle.pending = null;
    if (who === 'pat') patBattleAct(); else enemyAct();
  }
  function endBattle(win, note) {
    const b = battle;
    if (!b) return;
    const { cell, r, c, spec } = b;
    battleEnd();
    on('battle-over');
    if (!win) {
      if (note) flash(note);
      changed(); partnerTurn();
      return;
    }
    if (!cell.used) {
      cell.used = true;
      if (spec.win) { S.coins += spec.win.coins || 0; log(spec.win.log); }
      if (spec.way) { const ch = S.chapters[cell.ch]; if (ch) ch.open = true; log(spec.way); }
      flash(spec.win ? 'It is over.' : 'The way is clear.');
    }
    if (S.hero.r === r && S.hero.c === c) { changed(); partnerTurn(); }
    else moveTo(r, c);                     // you fought onto a barrier: now you may stand on it
  }

  // ---------- the partner ----------
  // The partner gets one action after each player step. They have their own hand and can lay
  // a card into any adjacent open square, but only walk on cards already turned over. Ordinary
  // cards are scenery to them; a fight, river or opened passage brings them to the hero.
  const patDist = (a, b) => Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
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
    if (d0) on('face', { who: 'pat', d: d0 });
    p.r = r; p.c = c;
    p.steps = (p.steps || 0) + 1;
    revealAround(r, c);
    partnerArrive(cellAt(r, c));
    changed();
  }
  const partnerUnlocked = (r, c) => inBounds(r, c) && Math.abs(r - S.hero.r) + Math.abs(c - S.hero.c) <= HERO_R;
  function partnerArrive(cell) {
    if (!cell || !cell.up) return;
    const p = S.partner;
    if (cell.id === 'camp' && p.hearts < p.maxHearts) { p.hearts = p.maxHearts; log(`${partnerName()} rests by the fire until they are whole again.`); }
  }
  function partnerLayAndStep(r, c) {
    const sel = partnerCard();
    if (!sel) return false;
    put(r, c, sel.id, { up: true, mine: true, ch: chapterAt(c).i });
    const dir = Object.keys(DIRS).find((k) => DIRS[k][0] === r - S.partner.r && DIRS[k][1] === c - S.partner.c);
    log(`${partnerName()} lays ${CARDS[sel.id].name} to the ${DIR_WORD[dir]}.`);
    S.partner.hand[sel.idx] = draw();
    S.partner.lastLayPlaced = S.placed;
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
    if (battle || dlg || hold) return;
    const p = S.partner;
    const heroCell = cellAt(S.hero.r, S.hero.c);
    const needsHelp = heroCell && (CARDS[heroCell.id].kind === 'enemy'
      || heroCell.id === 'river' || heroCell.id === 'bridge' || heroCell.id === 'troll');
    if (needsHelp || patDist(p, S.hero) > 2) {
      const st = partnerBfs(S.hero.r, S.hero.c);
      if (st) { partnerStep(st.r, st.c); return; }
      partnerLayBridge();
      return;
    }
    const mayLay = (p.lastLayPlaced || 0) < S.placed;
    if (mayLay && partnerLayAdjacent()) return;
    if (mayLay && partnerLayBridge()) return;
    const steps = [];
    for (const dir of ['right', 'down', 'up', 'left']) {
      const [dr, dc] = DIRS[dir];
      const r = p.r + dr, c = p.c + dc;
      const cell = cellAt(r, c);
      if (inBounds(r, c) && cell && cell.up && partnerOk(cell)) steps.push([r, c]);
    }
    if (steps.length) partnerStep(...steps[0]);
  }

  // ---------- action cards ----------
  // Three of them, and every one is a swap:
  //   rework: a card in your hand for a fresh card from the deck.
  //   slip:   a card already placed for a card in your hand.
  //   cross:  a card in your hand for a card from another deck: the partner's hand on a
  //           collaborative walk, the deck itself when you walk alone.
  function actionHint() {
    const p = S.partner && !S.partner.gone ? S.partner : null;
    if (action.type === 'rework') return 'Rework: pick one of your cards (1, 2, 3) — the deck gives you a fresh card for it. Esc gives it up.';
    if (action.type === 'slip') {
      return action.phase === 'board'
        ? 'Slipline: click a card already on the ground. It comes into your hand; one of yours takes its place.'
        : 'Slipline: now pick a card in your hand (1, 2, 3) to leave on the ground.';
    }
    return `Crossed deck: pick a card in your hand (1, 2, 3) to trade with ${p ? `${partnerName()}'s hand` : 'the deck'}.`;
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
    changed();
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
    on('redraw');
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
        const pj = rint(p.hand.length);
        const took = CARDS[p.hand[pj]].name;
        const mine = S.hand[i];
        S.hand[i] = p.hand[pj];
        p.hand[pj] = mine;
        log(`Crossed deck: you pass ${gave} to ${partnerName()} and take ${took}.`);
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
    on('redraw');
  }

  // ---------- the turn, and the shape of the road ----------
  // One card for every step: lay, step, lay, step. Walking is never blocked: you may always
  // step onto a card that is already down, including back the way you came.
  function hasEmptyNeighbour() {
    for (const dir of DIR_KEYS) {
      const [dr, dc] = DIRS[dir];
      const r = S.hero.r + dr, c = S.hero.c + dc;
      if (inBounds(r, c) && !cellAt(r, c)) return true;
    }
    return false;
  }
  const canPlace = () => S.phase === 'place';
  const phaseName = () => (canPlace() && hasEmptyNeighbour() ? 'place' : 'move');
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
  // The directions the road runs from this card, as bits in DIR_KEYS order. A card with a fixed
  // `road` (the bridge, the opened gate) always runs straight through.
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
    if (dc) on('face', { who: 'hero', d: dc });
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
    if (c !== S.hero.c) on('face', { who: 'hero', d: Math.sign(c - S.hero.c) });
    if (!cell.up) { cell.up = true; log(`You peer at the card to the side: ${CARDS[cell.id].name}.`); on('redraw'); return; }
    const o = ON[cell.id];
    if (o && o.tryEnter && !o.tryEnter(cell, r, c)) { changed(); return; }
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
    if (ch.i > S.seenChapter) { S.seenChapter = ch.i; if (ch.i > 0) { on('banner', ch); log(`Chapter ${ch.i + 1}: ${ch.name}.`); } }
    const cell = cellAt(r, c);
    const o = ON[cell.id];
    if (o && o.arrive) o.arrive(cell, r, c);
    else maybeFind(cell);
    changed();
    if (!battle && !dlg) partnerTurn();
  }
  function placeAt(r, c) {
    if (S.selected === null || cellAt(r, c) || !isAdjacent(r, c) || !canPlace()) return;
    if (CARDS[S.hand[S.selected]].kind === 'action') { flash('Action cards are played, not laid.'); return; }
    const id = S.hand[S.selected];
    put(r, c, id, { up: true, mine: true, amount: id === 'coins' ? 1 + rint(3) : undefined, ch: chapterAt(c).i });
    S.placed++;
    const dir = Object.keys(DIRS).find((k) => DIRS[k][0] === r - S.hero.r && DIRS[k][1] === c - S.hero.c);
    log(`You lay ${CARDS[id].name} to the ${DIR_WORD[dir]}.`);
    S.hand[S.selected] = draw();
    S.selected = null;               // hands empty again: the next direction key is a step
    S.phase = 'move';
    revealAround(r, c);
    changed();
    partnerTurn();
  }
  function selectHand(i) {
    const id = S.hand[i];
    if (CARDS[id].kind === 'action') {
      if (S.selected === i) { cancelAction(); return; }
      S.selected = i;
      action = { type: id, phase: id === 'slip' ? 'board' : 'hand', br: null, bc: null };
      hint(actionHint());
      on('redraw');
      return;
    }
    if (!canPlace()) { flash('You have laid your card. Take a step before you pick another.'); return; }
    if (!hasEmptyNeighbour()) { flash('No open ground beside you. Step onto any tile you like.'); return; }
    S.selected = S.selected === i ? null : i;
    hint(defaultHint());
    on('redraw');
  }
  function handPick(i) {
    if (action) actionPick(i);
    else selectHand(i);
  }
  function deselect() { S.selected = null; hint(defaultHint()); on('redraw'); }

  if (!(saved && restore(saved))) freshState(seed == null ? newSeed() : seed);

  return {
    get S() { return S; }, get BEST() { return BEST; }, get dlg() { return dlg; }, get battle() { return battle; }, get action() { return action; },
    partnerName, partnerType, lampsEver, lampCardsWon, nextLampCard, deck, draw, countLampEver,
    cellAt, ensureGenerated, chapterAt, here, quests, defaultHint, actionHint, actionPickable, canPlace, phaseName, turnLabel,
    hasEmptyNeighbour, carriesRoad, roadMask, isAdjacent, battleMoves,
    newGame, act, tryMove, moveTo, placeAt, handPick, actionPick, pickSlipBoard, cancelAction, deselect,
    dialog, chooseOption, closeDialog, partnerTurn, battleMove, battleResolve, battleWatchTick, startBattle,
    setLampsEver: (n) => { BEST.lampsEver = n; },
    setHold: (b) => { hold = !!b; },
    serialize: () => JSON.parse(JSON.stringify(S)),
  };
}
