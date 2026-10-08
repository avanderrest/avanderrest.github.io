/* Lantern Deep: the tables. Who you can be, what lives down there, what you can find, and
   the five floors. Plain data, no page access: sim.js reads the numbers, tell.js the words,
   art.js the sprite numbers (cells of the Kenney Tiny Dungeon sheet, 12 to a row). */

// ---------- constants ----------
export const FLOORS = 5;
export const XP_AT = [0, 0, 30, 90, 180, 320, 520, 800];   // XP needed for level n
export const DC_BASE = 10;                                   // checks are DC_BASE + floor-ish

export const STATS = ['str', 'con', 'dex', 'int', 'wis', 'cha'];
export const STAT_NAME = { str: 'Strength', con: 'Constitution', dex: 'Dexterity', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };

export const CLASSES = {
  fighter: {
    name: 'Fighter', race: 'Dwarf', sprite: 87, hitDie: 10, ac: 15, weapon: 'axe',
    stats: { str: 16, con: 16, dex: 11, int: 9, wis: 12, cha: 9 },
    pool: 'Stamina', poolBase: 4, poolPerLvl: 1, skills: ['second-wind', 'cleave'],
    kit: [['potion-heal', 2]], names: ['Thorin', 'Brunhild', 'Dagna', 'Gimrik', 'Hilde', 'Borin'],
    blurb: 'Hard to kill, and hits like a falling wall.',
  },
  wizard: {
    name: 'Wizard', race: 'Human', sprite: 84, hitDie: 6, ac: 12, hpBonus: 4, weapon: 'staff',
    stats: { str: 8, con: 12, dex: 13, int: 16, wis: 13, cha: 11 },
    pool: 'Mana', poolBase: 8, poolPerLvl: 3, skills: ['firebolt', 'magic-missile', 'shield'],
    kit: [['potion-heal', 1], ['potion-mana', 1]], names: ['Aldric', 'Morwen', 'Ysolde', 'Caspian', 'Elspeth', 'Quill'],
    blurb: 'Fragile, and the brightest light in the dark.',
  },
  rogue: {
    name: 'Rogue', race: 'Halfling', sprite: 88, hitDie: 8, ac: 14, weapon: 'shortsword',
    stats: { str: 10, con: 12, dex: 16, int: 12, wis: 11, cha: 14 },
    pool: 'Nerve', poolBase: 4, poolPerLvl: 1, skills: ['backstab', 'smoke'],
    kit: [['potion-heal', 1], ['flask-fire', 1]], names: ['Pip', 'Wren', 'Tobin', 'Marigold', 'Finch', 'Rosie'],
    blurb: 'Quiet feet, quick hands. Better at not fighting.',
    perks: { sneak: true, traps: true, dirty: '1d6' },   // advantage sneaking and on traps; +1d6 on every weapon hit
  },
  cleric: {
    name: 'Cleric', race: 'Elf', sprite: 99, hitDie: 8, ac: 16, weapon: 'mace',
    stats: { str: 13, con: 13, dex: 10, int: 10, wis: 16, cha: 13 },
    pool: 'Faith', poolBase: 6, poolPerLvl: 2, skills: ['heal', 'smite', 'turn'],
    kit: [['potion-heal', 1]], names: ['Aelin', 'Sorrel', 'Ilyra', 'Thalion', 'Maewen', 'Elrin'],
    blurb: 'Armoured, patient, and the dead fear her.',
  },
};

// perLvl: adds that much per hero level to the damage.
// kind: heal (dice + stat mod), strike (a weapon attack plus bonus dice), bolt (a spell
// attack roll), auto (never misses), ward (+ac until the foe's next swing), escape, turn
export const SKILLS = {
  'second-wind': { name: 'Second Wind', cost: 2, kind: 'heal', dice: '1d10', stat: 'con', also: 'explore', icon: 115 },
  'cleave': { name: 'Cleave', cost: 2, kind: 'strike', dice: '1d8', icon: 119 },
  'firebolt': { name: 'Firebolt', cost: 0, kind: 'bolt', dice: '2d6', stat: 'int', perLvl: 1, icon: 129 },
  'magic-missile': { name: 'Magic Missile', cost: 2, kind: 'auto', dice: '3d4', flat: 3, perLvl: 1, icon: 130 },
  'shield': { name: 'Shield', cost: 1, kind: 'ward', ac: 6, icon: 102 },
  'backstab': { name: 'Backstab', cost: 1, kind: 'strike', dice: '3d6', firstRound: true, icon: 103 },
  'smoke': { name: 'Smoke Bomb', cost: 2, kind: 'escape', icon: 113 },
  'heal': { name: 'Healing Word', cost: 2, kind: 'heal', dice: '2d8', stat: 'wis', also: 'explore', icon: 128 },
  'smite': { name: 'Smite', cost: 1, kind: 'strike', dice: '2d8', undead: 2, icon: 117 },
  'turn': { name: 'Turn Undead', cost: 3, kind: 'turn', stat: 'wis', icon: 131 },
};

// stat 'best' takes the better of str and dex
export const WEAPONS = {
  dagger: { name: 'Dagger', dice: '1d4', stat: 'dex', sprite: 103 },
  staff: { name: 'Quarterstaff', dice: '1d6', stat: 'str', sprite: 107 },
  mace: { name: 'Flanged mace', dice: '1d8', stat: 'str', sprite: 117 },
  shortsword: { name: 'Shortsword', dice: '1d6', stat: 'best', sprite: 104 },
  axe: { name: 'Battleaxe', dice: '1d8', stat: 'str', sprite: 118 },
  rapier: { name: 'Rapier', dice: '1d8', stat: 'best', sprite: 106 },
  longsword: { name: 'Longsword', dice: '1d10', stat: 'str', sprite: 105 },
  spear: { name: 'Runed Spear', dice: '1d10', stat: 'best', sprite: 131 },
  greataxe: { name: 'Greataxe', dice: '1d12', stat: 'str', sprite: 119 },
};
// the order weapons turn up in as the floors go down
export const WEAPON_TIERS = [['shortsword', 'rapier', 'axe'], ['axe', 'rapier', 'shortsword'], ['longsword', 'rapier', 'axe'], ['spear', 'longsword', 'greataxe'], ['greataxe', 'spear']];

export const ITEMS = {
  'potion-heal': { name: 'Healing potion', sprite: 115, use: 'heal', dice: '2d4+2', price: 12, fight: true, explore: true },
  'potion-greater': { name: 'Greater healing', sprite: 127, use: 'heal', dice: '4d4+4', price: 28, fight: true, explore: true },
  'potion-mana': { name: 'Tonic of clarity', sprite: 116, use: 'pool', n: 4, price: 15, fight: true, explore: true },
  'antidote': { name: 'Antidote', sprite: 114, use: 'cure', dice: '1d4', price: 8, fight: true, explore: true },
  'flask-fire': { name: 'Alchemist’s fire', sprite: 113, use: 'blast', dice: '3d6', price: 18, fight: true },
  'wand-sparks': { name: 'Wand of sparks', sprite: 129, use: 'blast', dice: '2d8+2', price: 30, fight: true },
  'shield-iron': { name: 'Iron shield', sprite: 101, use: 'armour', ac: 1, price: 25 },
  'shield-rune': { name: 'Rune shield', sprite: 102, use: 'armour', ac: 2, price: 60 },
};
export const LOOT_TIERS = [
  ['potion-heal', 'potion-heal', 'antidote', 'flask-fire', 'potion-mana'],
  ['potion-heal', 'potion-heal', 'potion-mana', 'flask-fire', 'antidote', 'shield-iron'],
  ['potion-heal', 'potion-greater', 'potion-mana', 'wand-sparks', 'flask-fire', 'shield-iron'],
  ['potion-greater', 'potion-heal', 'potion-mana', 'wand-sparks', 'shield-rune'],
  ['potion-greater', 'potion-greater', 'wand-sparks', 'potion-mana'],
];

// hp is dice; tiers are the floors it lives on; talk: can be parleyed with;
// signs: what the next room gives away through its doorway (tell.js picks one)
export const MONSTERS = {
  rat: { name: 'giant rat', sprite: 123, hp: '2d6', ac: 11, atk: 3, dmg: '1d4+1', xp: 8, gold: [0, 3], tiers: [1, 2], alert: 9,
    signs: ['droppings and gnawed bones by the door', 'a skittering behind the stones', 'a musky animal stink'], verbs: ['lunges', 'bites', 'snaps'] },
  bat: { name: 'swarm of bats', sprite: 120, hp: '3d6', ac: 12, atk: 3, dmg: '1d4+1', xp: 10, gold: [0, 0], tiers: [1, 3], alert: 12,
    signs: ['a leathery fluttering high up', 'guano spattered across the threshold'], verbs: ['dives', 'swirls around you', 'nips'] },
  slime: { name: 'green slime', sprite: 108, hp: '3d8', ac: 8, atk: 3, dmg: '1d6', xp: 14, gold: [2, 8], tiers: [1, 3], alert: 7,
    signs: ['a trail of glistening ooze', 'an acrid, vinegary smell'], verbs: ['lurches', 'spits acid', 'slops over you'] },
  bandit: { name: 'bandit', sprite: 112, hp: '3d8', ac: 13, atk: 4, dmg: '1d6+1', xp: 20, gold: [6, 16], tiers: [1, 3], alert: 11, talk: true, toll: 8,
    signs: ['fresh bootprints in the dust', 'someone humming a tavern song', 'a whiff of pipe smoke'], verbs: ['slashes', 'jabs', 'swings a cudgel'] },
  spider: { name: 'cave spider', sprite: 122, hp: '4d8', ac: 13, atk: 5, dmg: '1d8', xp: 30, gold: [0, 6], tiers: [2, 4], alert: 12, poison: true,
    signs: ['thick webs across the doorway', 'husks of wrapped-up rats'], verbs: ['strikes', 'sinks its fangs in', 'skitters at you'] },
  ghost: { name: 'wailing spirit', sprite: 121, hp: '4d8', ac: 12, atk: 5, dmg: '1d10', xp: 34, gold: [0, 0], tiers: [2, 5], alert: 13, undead: true,
    signs: ['a breath of grave-cold air', 'a thin, sobbing wail', 'frost on the door frame'], verbs: ['passes through you', 'shrieks', 'claws with cold hands'] },
  cultist: { name: 'hooded cultist', sprite: 111, hp: '5d8', ac: 13, atk: 5, dmg: '1d8+2', xp: 38, gold: [8, 20], tiers: [2, 5], alert: 12, talk: true, toll: 15,
    signs: ['low chanting', 'the smell of burnt incense', 'a daub of red paint on the lintel'], verbs: ['stabs with a curved knife', 'hurls a hex', 'strikes'] },
  crab: { name: 'ember crab', sprite: 110, hp: '5d10', ac: 15, atk: 5, dmg: '2d6', xp: 48, gold: [4, 14], tiers: [3, 5], alert: 10,
    signs: ['scorch marks low on the walls', 'a clicking, and a smell of hot stone'], verbs: ['snips', 'crushes', 'spits sparks'] },
  boneRat: { name: 'bone gnawer', sprite: 124, hp: '4d10', ac: 13, atk: 6, dmg: '1d10+2', xp: 44, gold: [0, 8], tiers: [3, 5], alert: 11, undead: true,
    signs: ['bones picked very clean', 'a rattle like dice in a cup'], verbs: ['gnaws', 'rakes', 'rattles in'] },
  ogre: { name: 'cave ogre', sprite: 109, hp: '7d10', ac: 11, atk: 6, dmg: '2d8+2', xp: 80, gold: [15, 35], tiers: [3, 5], alert: 8, talk: true, toll: 25,
    signs: ['heavy, slow footfalls', 'a smell of old meat and woodsmoke', 'a door frame splintered at head height'], verbs: ['swings a club', 'stamps', 'backhands you'] },
  mimic: { name: 'mimic', sprite: 92, hp: '6d8', ac: 12, atk: 5, dmg: '2d6', xp: 50, gold: [20, 40], tiers: [2, 5], alert: 99,
    signs: [], verbs: ['chomps', 'lashes its tongue', 'snaps its lid'] },
  king: { name: 'the Hollow King', sprite: 121, hp: '12d10', ac: 15, atk: 7, dmg: '2d8+3', xp: 300, gold: [100, 100], tiers: [5, 5], alert: 99, undead: true, boss: true,
    blurb: 'An undead king who never left his throne, and never will.', deathLine: 'crumbles into ash and rust, and the crown rolls to your feet',
    signs: ['a cold that comes up through your boots', 'a whisper that says your name'], verbs: ['brings down a rusted blade', 'drains your warmth', 'speaks a word of ruin'] },
  // the other three bosses, 2026-10-08: kept mechanically identical to the king (same hp/ac/
  // atk/dmg/xp/gold) so picking one is a reskin, not a rebalance; only undead (for Smite) and
  // flavour differ.
  ogreChief: { name: 'Ogre Chieftain', sprite: 109, hp: '12d10', ac: 15, atk: 7, dmg: '2d8+3', xp: 300, gold: [100, 100], tiers: [5, 5], alert: 99, boss: true,
    blurb: 'A brute who has eaten every patrol sent after him.', deathLine: 'falls at last, the ground shaking, and the hoard he sat on spills free',
    signs: ['a deep, slow breathing you can feel through the floor', 'a stink of old meat strong enough to taste'],
    verbs: ['swings a spiked club the size of a door', 'stamps the ground hard enough to rattle your teeth', 'backhands you with bone-crushing force'] },
  cultLeader: { name: 'Cult Matriarch', sprite: 111, hp: '12d10', ac: 15, atk: 7, dmg: '2d8+3', xp: 300, gold: [100, 100], tiers: [5, 5], alert: 99, undead: true, boss: true,
    blurb: 'A matriarch binding the dead to her cause.', deathLine: 'collapses as her chant breaks, and the circle around her falls dark',
    signs: ['chanting from many throats at once', 'candlelight pulsing like a heartbeat'],
    verbs: ['lashes out with a whip of black flame', 'calls down a curse', 'strikes with a jagged ritual blade'] },
  crabQueen: { name: 'Ember Queen', sprite: 110, hp: '12d10', ac: 15, atk: 7, dmg: '2d8+3', xp: 300, gold: [100, 100], tiers: [5, 5], alert: 99, boss: true,
    blurb: 'Something enormous asleep in the embers, now awake.', deathLine: 'cracks open in a gout of embers and goes still, her claw falling open around the hoard',
    signs: ['a heat that makes the air shimmer', 'embers drifting up from the floor itself'],
    verbs: ['crushes', 'spits molten sparks', 'drags a burning claw across you'] },
};
// which monster keys can ever be a floor's big bad, and the hand-written delve (boss, why,
// and a premise for each floor) the book picks between when no model plans the floor. Built
// 2026-10-08: the Dungeon Master (or, with it off, the book) chooses one of these at the
// start of a delve, so there is always a reason to be going down and a face at the bottom.
export const BOSSES = ['king', 'ogreChief', 'cultLeader', 'crabQueen'];
export const QUESTS = [
  { id: 'brother', boss: 'king',
    why: 'Your brother went down after the old king’s hoard ten winters ago and never came back up. You mean to go further than he did, and bring back whatever is left of him.',
    premises: [
      'He wrote home from the cellars once, about smugglers using the old tunnels. That letter is the last anyone had from him.',
      'The miners who worked these shafts downed tools and left the day after he passed through, or so the town says.',
      'His trail runs cold at a flooded crypt. Whatever is down there has had ten years to grow bolder.',
      'Spores choke the air this deep. Nothing should still be breathing down here, and yet.',
      'This is as far as any letter reached. Beyond here is only the Hollow King, and whatever he left of your brother.',
    ] },
  { id: 'bounty', boss: 'ogreChief',
    why: 'A bounty posted in three villages round promises the Ogre Chieftain’s whole hoard to whoever clears him out of the Lantern Deep. You mean to collect.',
    premises: [
      'Bandits have been running his errands through the cellars, taking a cut of whatever passes through.',
      'The old workings are his larder now, stocked by raiders who never made it back to spend their share.',
      'Even the dead down here keep their distance from him, or so the crypt’s quiet suggests.',
      'The fungus has grown thick and strange wherever he passes, feeding on what he leaves behind.',
      'His throne is built from the bones of everyone who came for the bounty before you.',
    ] },
  { id: 'cult', boss: 'cultLeader',
    why: 'The Cult Matriarch and her followers have been taking villagers down into the dark for a season now. You mean to bring them back, or find out why no one else has.',
    premises: [
      'Her acolytes keep the cellars as a staging ground, moving supplies and worse through the old smugglers’ routes.',
      'The miners she turned still haunt these workings, chanting the same prayer, over and over.',
      'The crypt is hers by right, she tells her followers. The dead down here seem inclined to agree.',
      'Something about her rites has fed the fungus unnaturally fast. It listens, a little, when she speaks.',
      'At the heart of the dungeon her circle is complete, and whatever she is binding is almost ready.',
    ] },
  { id: 'ember', boss: 'crabQueen',
    why: 'The old mine seams have glowed red every night for a month, and the ground is warm to the touch. Something woken under the hill calls itself the Ember Queen, and the village wants it asleep again.',
    premises: [
      'Heat rises even into the cellars here, and the wine has long since turned to vinegar in it.',
      'This was her birthplace, these old workings; the ore itself seems to remember her.',
      'Even the crypt’s cold water runs warm near the deepest wall.',
      'The fungus here glows faintly orange, fed on heat that should not reach this far.',
      'Her throne room is the old heart of the mine, and she has been waiting a very long time to wake fully.',
    ] },
];

// what a room can hold besides a foe; weight per floor tier
export const FEATURES = {
  chest: { weight: 22, verbs: ['open', 'search'], sprite: 89, open: 90, signs: ['a glint of metal in the dark', 'the smell of oiled wood and brass'] },
  altar: { weight: 9, verbs: ['pray', 'offer'], sprite: 65, signs: ['the smell of candle wax', 'a soft, steady glow'] },
  fountain: { weight: 9, verbs: ['drink'], sprite: 20, signs: ['trickling water', 'a cool, wet breath of air'] },
  corpse: { weight: 12, verbs: ['search'], sprite: 0, signs: ['a sweetish smell of death', 'flies'] },
  shelf: { weight: 9, verbs: ['read'], sprite: 63, signs: ['the musty smell of old paper'] },
  camp: { weight: 10, verbs: ['rest'], sprite: 0, signs: ['old woodsmoke', 'the warm glow of embers'] },
  merchant: { weight: 7, verbs: ['trade'], sprite: 85, once: true, signs: ['a cheerful, tuneless whistling', 'the clink of coins being counted'] },
  statue: { weight: 7, verbs: ['inspect'], sprite: 7, signs: ['a shape standing very still'] },
};

// the five floors: name, the place, the light, palette for art.js, and the words tell.js uses
export const THEMES = [
  { name: 'The Cellars', tag: 'cellars', floor: ['#6f5a49', '#7a6350', '#655141'], wall: '#3a2d26', light: '#ffb356',
    rooms: [['Barrel', 'Wine', 'Root', 'Brick', 'Smugglers’', 'Dripping', 'Coal', 'Mouldy', 'Cooper’s', 'Low', 'Ale', 'Sunken'], ['Vault', 'Cellar', 'Store', 'Undercroft', 'Pantry', 'Passage']],
    walls: ['low brick vaults sweating with damp', 'whitewashed brick gone green with mould', 'arches of soot-black brick'],
    floors: ['a floor of cracked flagstones', 'straw trodden into the mud', 'puddles that reflect your lantern'],
    smells: ['sour wine and wet earth', 'mildew', 'old cheese and older rot'],
    sounds: ['a slow drip somewhere', 'the inn’s floorboards creaking far above', 'your own breathing, too loud'],
    props: ['split barrels', 'a rack of empty bottles', 'sacks burst open by rats', 'a collapsed shelf'] },
  { name: 'The Old Workings', tag: 'mine', floor: ['#6b6157', '#756a5e', '#5f564d'], wall: '#2e2a27', light: '#ffc46b',
    rooms: [['Timbered', 'Collapsed', 'Ore', 'Foreman’s', 'Flooded', 'Echoing', 'Copper', 'Lamp', 'Narrow', 'Deep', 'Cart', 'Silent'], ['Gallery', 'Drift', 'Shaft', 'Seam', 'Hall', 'Cut']],
    walls: ['rough rock held back by groaning timber props', 'walls streaked with copper-green ore', 'a ceiling braced with blackened beams'],
    floors: ['rusted rails half-buried in grit', 'loose spoil that shifts underfoot', 'a floor worn smooth by carts'],
    smells: ['lamp oil and stone dust', 'damp rock', 'sulphur'],
    sounds: ['timber settling with a groan', 'pebbles trickling down a slope', 'a distant hammer, then nothing'],
    props: ['an overturned mine cart', 'broken picks', 'a coil of rotten rope', 'a pile of ore sacks'] },
  { name: 'The Drowned Crypt', tag: 'crypt', floor: ['#4e5a63', '#56636c', '#47525a'], wall: '#232a30', light: '#bfe3ff',
    rooms: [['Sunken', 'Bone', 'Lamplit', 'Silent', 'Mourners’', 'Weeping', 'Saints’', 'Black', 'Drowned', 'Candle', 'Pilgrims’', 'Lily'], ['Ossuary', 'Chapel', 'Tomb', 'Cloister', 'Crypt', 'Gallery']],
    walls: ['niches packed with yellowed skulls', 'carved saints worn faceless by water', 'walls slick with black water'],
    floors: ['ankle-deep water, very cold', 'flagstones carved with names', 'a floor scattered with bones'],
    smells: ['stagnant water', 'cold stone and lilies long dead', 'grave-dirt'],
    sounds: ['water lapping against stone', 'something settling in a tomb', 'a bell, far off, that should not ring'],
    props: ['a cracked sarcophagus', 'toppled urns', 'rotted funeral wreaths', 'a font full of black water'] },
  { name: 'The Fungal Halls', tag: 'fungus', floor: ['#4f5c4a', '#586650', '#475343'], wall: '#232b22', light: '#b8ff8a',
    rooms: [['Glowing', 'Spore', 'Mossy', 'Rotting', 'Velvet', 'Humming', 'Blue', 'Dripping', 'Root', 'Puffball', 'Tangled', 'Pale'], ['Grotto', 'Garden', 'Hollow', 'Bower', 'Cave', 'Hall']],
    walls: ['walls furred with pale fungus', 'caps the size of shields growing from the rock', 'stone veined with glowing threads'],
    floors: ['a spongy floor that gives under your boots', 'drifts of grey spores', 'roots and mycelium like spilled rope'],
    smells: ['mushrooms and wet bark', 'something sweet and wrong', 'earth after rain'],
    sounds: ['a soft popping as spores burst', 'a low hum from the fungus', 'dripping, and something chewing'],
    props: ['bulbous blue caps', 'a ring of toadstools', 'a skeleton grown through with moss', 'puffballs as big as barrels'] },
  { name: 'The Hollow Throne', tag: 'throne', floor: ['#4a3f4f', '#544758', '#423846'], wall: '#1f1922', light: '#ff8a6b',
    rooms: [['Obsidian', 'Ash', 'Crowned', 'Hollow', 'Burning', 'Last', 'Iron', 'Kneeling', 'Mirror', 'Cinder', 'Silent', 'Weeping'], ['Hall', 'Antechamber', 'Gallery', 'Court', 'Stair', 'Sanctum']],
    walls: ['walls of black glass that show you a pale reflection', 'banners burnt to rags', 'pillars carved as kneeling kings'],
    floors: ['a floor of polished obsidian', 'ash lying thick and undisturbed', 'a cracked mosaic of a crowned skull'],
    smells: ['cold ash', 'iron and old blood', 'nothing at all, which is worse'],
    sounds: ['a heartbeat that is not yours', 'whispering at the edge of hearing', 'perfect, heavy silence'],
    props: ['empty braziers', 'a row of broken crowns', 'iron cages hanging from chains', 'a toppled statue of a king'] },
];

export const DIRS = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
export const DIR_NAME = { n: 'north', s: 'south', e: 'east', w: 'west' };
export const OPPOSITE = { n: 's', s: 'n', e: 'w', w: 'e' };
