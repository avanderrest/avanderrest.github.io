/* Wayside — the pixel art. Every sprite is sixteen rows of sixteen characters, one character per
   pixel, looked up in PAL. '.' is transparent. Terrain bases are drawn procedurally with a fixed
   seed so every grass tile matches its neighbours. game.js reads window.WaysideArt. */
(() => {
  'use strict';

  const PAL = {
    K: '#1a1826', W: '#f8f4e8', G: '#8fd06a', g: '#5aa848', d: '#3b7d36', e: '#23512a',
    t: '#ead9a8', T: '#cfa86a', b: '#8e5b30', B: '#573417',
    u: '#7cc4f4', w: '#3d86d8', U: '#244f9c',
    s: '#c4c2bd', S: '#85837e', z: '#514f5a', x: '#2c2a38',
    r: '#de4a3a', R: '#8f1f1f', y: '#f8d84c', Y: '#cf9424', o: '#f08a3a',
    p: '#9c62d4', P: '#5d3391', k: '#f5c8a0', n: '#3a2b4a', i: '#f4a0bc', c: '#c0eef8',
    l: '#e2e2e6', a: '#a7a3ab',
  };

  // ---------- people ----------
  // H hat, C cloth, L trousers. Hands are skin. Feet are boots.
  const PERSON = [
    '................',
    '.....KKKKKK.....',
    '....KHHHHHHK....',
    '....KHHHHHHK....',
    '....KkkkkkkK....',
    '....KkKkkKkK....',
    '....KkkkkkkK....',
    '.....KkkkkK.....',
    '....KCCCCCCK....',
    '...KCCCCCCCCK...',
    '...KkCCCCCCkK...',
    '...KKCCCCCCKK...',
    '....KLLKKLLK....',
    '....KLLK.KLLK...',
    '....KBBK.KBBK...',
    '................',
  ];
  const PERSON_STEP = PERSON.slice(0, 12).concat([
    '....KLLKKLLK....',
    '...KLLK...KLLK..',
    '...KBBK...KBBK..',
    '................',
  ]);
  const person = (h, c, l, rows) => ({ rows: rows || PERSON, map: { H: h, C: c, L: l } });

  // things people hold, drawn over the person
  const HOLD = {
    rod: [
      '...........K....', '..........KbK...', '.........KbK....', '........KbK.....',
      '.......KbK......', '......KbK.......', '......KK........', '................',
      '................', '................', '................', '................',
      '................', '................', '................', '................',
    ],
    hammer: [
      '................', '................', '................', '................',
      '................', '................', '................', '.KKKK...........',
      '.KzzzK..........', '.KKKKK..........', '...KbK..........', '...KbK..........',
      '................', '................', '................', '................',
    ],
    axe: [
      '................', '................', '................', '.............KK.',
      '............KssK', '............KsSK', '.............KbK', '.............KbK',
      '.............KbK', '.............KbK', '.............KbK', '................',
      '................', '................', '................', '................',
    ],
    staff: [
      '..K.............', '.KbK............', '.KbK............', '.KbK............',
      '.KbK............', '.KbK............', '.KbK............', '.KbK............',
      '.KbK............', '.KbK............', '.KbK............', '.KbK............',
      '.KbK............', '.KK.............', '................', '................',
    ],
    pick: [
      '................', '................', '................', '..........KKKKK.',
      '.........KsssssK', '.........KsKKKsK', '..........KbK.KK', '..........KbK...',
      '..........KbK...', '..........KbK...', '..........KbK...', '................',
      '................', '................', '................', '................',
    ],
    pack: [
      '................', '................', '................', '................',
      '................', '................', '................', 'KKKK............',
      'KbbbK...........', 'KbBbK...........', 'KbbbK...........', 'KKKKK...........',
      '................', '................', '................', '................',
    ],
  };

  // ---------- objects ----------
  const S = {
    hero: person('o', 'y', 'B'),
    hero2: person('o', 'y', 'B', PERSON_STEP),
    traveller: { layers: [person('b', 'd', 'B'), HOLD.pack] },
    smith: { layers: [person('n', 'z', 'B'), HOLD.hammer] },
    fisher: { layers: [person('y', 'w', 'B'), HOLD.rod] },
    hermit: { layers: [person('l', 'p', 'P'), HOLD.staff] },
    woodcutter: { layers: [person('r', 'b', 'B'), HOLD.axe] },
    miner: { layers: [person('Y', 'T', 'B'), HOLD.pick] },
    pedlar: { layers: [person('p', 'o', 'B'), HOLD.pack] },
    bandit: person('x', 'R', 'x'),
    // the partner who walks beside you in collaborative mode: blue hat, pink coat
    maren: person('u', 'i', 'z'),
    maren2: person('u', 'i', 'z', PERSON_STEP),

    home: [
      '................', '.......KK.......', '......KrrK......', '.....KrrrrK.....',
      '....KrrrrrrK....', '...KrrrrrrrrK...', '..KrrrrrrrrrrK..', '.KKKKKKKKKKKKKK.',
      '.KttttttttttttK.', '.KtKKKtttttKKtK.', '.KtKuKtttttKuKK.', '.KtKKKttKKtKKtK.',
      '.KttttttKbttttK.', '.KttttttKbttttK.', '.KKKKKKKKKKKKKK.', '................',
    ],
    tree: [
      '.......KK.......', '......KddK......', '......KddK......', '.....KdGddK.....',
      '.....KddddK.....', '....KdGddddK....', '....KddddddK....', '...KdGdddddeK...',
      '...KdddddeeeK...', '..KdGdddddeeeK..', '..KddddddeeeeK..', '.KdGdddddeeeeeK.',
      '.KdddddeeeeeeeK.', '.KKKKKKKbbKKKKK.', '.......KbbK.....', '.......KKKK.....',
    ],
    flowers: [
      '................', '................', '....y...........', '...yWy......r...',
      '....y......rWr..', '............r...', '................', '.........i......',
      '........iWi.....', '.........i......', '..r.............', '.rWr.......y....',
      '..r.......yWy...', '...........y....', '................', '................',
    ],
    purse: [
      '................', '................', '.....KKKKK......', '....KyYyyyK.....',
      '...KKKKKKKKK....', '...KbbbbbbbK....', '..KbbbbbbbbbK...', '..KbbbYYbbbbK...',
      '..KbbYyyYbbbK...', '..KbbYyyYbbbK...', '..KbbbYYbbbbK...', '..KbbbbbbbbbK...',
      '...KbbbbbbbK....', '....KKKKKKK.....', '................', '................',
    ],
    bush: [
      '................', '................', '......KKKK......', '....KKddddKK....',
      '...KddGdddddK...', '..KdddddpddddK..', '..KdpdddddddpK..', '.KdddddddpddddK.',
      '.KddpddddddddGK.', '.KdddddddddpddK.', '.KdGddpddddddK..', '..KddddddddpdK..',
      '..KdddddddddK...', '...KKKKKKKKK....', '................', '................',
    ],
    fire: [
      '................', '................', '.......o........', '......Ko........',
      '......yoK.......', '.....KyoyK......', '.....KyyoK......', '....KoyyyoK.....',
      '....KoyWyoK.....', '...KooyWyooK....', '...KroyyyorK....', '..KrroyyyorrK...',
      '..KKKKKKKKKKK...', '.KbbBbbbbBbbbbK.', '.KKKKKKKKKKKKKK.', '................',
    ],
    wolf: [
      '................', '................', '....K...........', '...KaK..........',
      '...KaaK....KK...', '...KaaaKKKKaaK..', '..KaaaaaaaaaaK..', '..KaWKaaaaaaaK..',
      '..KaaaaaaaaaaK..', '...KKaaaaaaaK...', '....KaaKKaaK....', '....KaaK.KaaK...',
      '....KaK...KaK...', '....KK....KKK...', '................', '................',
    ],
    tracks: [
      '................', '................', '....BB..........', '...BBBB.........',
      '..B....B........', '.BB.BB.BB.......', '.BB.BB.BB.......', '................',
      '........BB......', '.......BBBB.....', '......B....B....', '.....BB.BB.BB...',
      '.....BB.BB.BB...', '................', '................', '................',
    ],
    sign: [
      '................', '..KKKKKKKKKKKK..', '.KttttttttttttK.', '.KtKKKKttKKKKtK.',
      '.KttttttttttttK.', '.KtKKKKKKKKKttK.', '.KttttttttttttK.', '..KKKKKKKKKKKK..',
      '.......KbK......', '.......KbK......', '.......KbK......', '.......KbK......',
      '.......KbK......', '......KKbKK.....', '......KKKKK.....', '................',
    ],
    hill: [
      '..........KK....', '.........KrK....', '.........KrrK...', '.........KrrrK..',
      '.........KrrK...', '.........KK.....', '.........Kb.....', '......KKKKbKK...',
      '....KKGGGGbGGKK.', '...KGGGGGGGGGGGK', '..KGGgGGGGGGgGGK', '.KGGGGGGgGGGGGGK',
      'KGGgGGGGGGGGGgGK', 'KKKKKKKKKKKKKKKK', '................', '................',
    ],
    mine: [
      '................', '....KKKKKKKK....', '...KSSSSSSSSK...', '..KSSsSSSSsSSK..',
      '.KSSSKKKKKKSSSK.', '.KSSKbbbbbbKSSK.', '.KSSKbxxxxbKSSK.', '.KSSKbxxxxbKSSK.',
      '.KSSKbxyxxbKSSK.', '.KSSKbxxxxbKSSK.', '.KSSKbxxxxbKSSK.', '.KSSKbxxxxbKSSK.',
      '.KSKKbxxxxbKKSK.', '.KKKKbxxxxbKKKK.', '................', '................',
    ],
    reeds: [
      '................', '....T.....T.....', '....d..T..d..T..', '.T..d..d..d..d..',
      '.d..d..d..d..d..', '.d..d.Td..dT.d..', '.d.Td..d..d..d..', '.d..d..d..d..d..',
      '.d..d..d..d..d..', 'Td..d..d..d..dT.', 'd...d..d..d..d..', 'd..Td..d..d..d..',
      'd...d..d..d..d..', 'd...d..d..d..d..', '................', '................',
    ],
    mushrooms: [
      '................', '................', '................', '.....KKKK.......',
      '....KrWrrK......', '...KrrWrrrK.....', '...KKKKKKKK.....', '.....KttK...KKK.',
      '.....KttK..KrWrK', '.....KttK..KKKKK', '..KKK.KKK...KtK.', '.KrWrK......KtK.',
      '.KKKKK......KtK.', '..KtK.......KKK.', '..KtK...........', '..KKK...........',
    ],
    gate: [
      '..KKKKKKKKKKKK..', '.KzKzKzKzKzKzKK.', '.KzKzKzKzKzKzKK.', '.KzKzKzKzKzKzKK.',
      '.KKKKKKKKKKKKKK.', '.KzKzKzKzKzKzKK.', '.KzKzKzKzKzKzKK.', '.KzKzKzKyKzKzKK.',
      '.KzKzKzKzKzKzKK.', '.KKKKKKKKKKKKKK.', '.KzKzKzKzKzKzKK.', '.KzKzKzKzKzKzKK.',
      '.KzKzKzKzKzKzKK.', '.KzKzKzKzKzKzKK.', '.KKKKKKKKKKKKKK.', '................',
    ],
    gateopen: [
      'KKK..........KKK', 'KzK..........KzK', 'KzK..........KzK', 'KzK..........KzK',
      'KzK..........KzK', 'KzK..........KzK', 'KzK..........KzK', 'KzK..........KzK',
      'KzK..........KzK', 'KzK..........KzK', 'KzK..........KzK', 'KzK..........KzK',
      'KzK..........KzK', 'KzK..........KzK', 'KKK..........KKK', '................',
    ],
    lighthouse: [
      '......KKKK......', '.....KyyyyK.....', '.....KKKKKK.....', '.....KWWWWK.....',
      '.....KrrrrK.....', '....KWWWWWWK....', '....KrrrrrrK....', '....KWWWWWWK....',
      '....KrrrrrrK....', '...KWWWWWWWWK...', '...KrrrrrrrrK...', '...KWWWKKWWWK...',
      '...KWWWKxKWWK...', '..KKKKKKKKKKKK..', '..KsssssssssssK.', '..KKKKKKKKKKKKK.',
    ],
    brokenbridge: [
      '................', '................', '................', '................',
      'KKKK........KKKK', 'bbBbK......KbBbb', 'bbbbbK.....Kbbbb', 'KKKKKK.....KKKKK',
      'bBbbK.......Kbbb', 'bbbbbK.....KbbBb', 'KKKKKK....KKKKKK', '....K.......K...',
      '....K......K....', '................', '................', '................',
    ],
    stump: [
      '................', '................', '..........KK....', '.........KssK...',
      '........KsSKK...', '.......KbK.K....', '......KbK.......', '.....KKbK.......',
      '....KBbbK.......', '...KBBBBBBK.....', '..KBbBbBbBBK....', '..KBBBBBBBBK....',
      '..KbbbbbbbbK....', '..KbbbbbbbbK....', '..KKKKKKKKKK....', '................',
    ],
    stumpempty: [
      '................', '................', '................', '................',
      '................', '................', '................', '................',
      '................', '...KBBBBBBK.....', '..KBbBbBbBBK....', '..KBBBBBBBBK....',
      '..KbbbbbbbbK....', '..KbbbbbbbbK....', '..KKKKKKKKKK....', '................',
    ],
    troll: [
      '................', '.....KKKKKK.....', '....KaaaaaaK....', '...KaaKaaKaaK...',
      '...KaarKKraaK...', '...KaaaaaaaaK...', '....KaKKKKaK....', '..KKKaaaaaaKKK..',
      '.KaaKaaaaaaKaaK.', '.KaaKaaaaaaKaaK.', '.KKKKaaaaaaKKKK.', '....KaaaaaaK....',
      '....KaaKKaaK....', '....KaaK.KaaK...', '....KBBK.KBBK...', '................',
    ],
    cave: [
      '................', '................', '................', '................',
      '................', '.....KKKKKK.....', '....KxxxxxxK....', '...KxxxxxxxxK...',
      '...KxxxxxxxxK...', '...KxxxxxxxxK...', '...KxxxxxxxxK...', '...KxxxxxxxxK...',
      '...KxxxxxxxxK...', '...KxxxxxxxxK...', '...KxxxxxxxxK...', '................',
    ],
    shed: [
      '................', '.....KKKKKK.....', '....KBBBBBBK....', '...KBBBBBBBBK...',
      '..KBBBBBBBBBBK..', '.KKKKKKKKKKKKKK.', '.KbbbbbbbbbbbbK.', '.KbbKKKKKbbbbbK.',
      '.KbbKttsKbbbbbK.', '.KbbKtsSKbbbbbK.', '.KbbKKKKKbbKbbK.', '.KbbbbbbbbbbbbK.',
      '.KbbbbbbbbbbbbK.', '.KKKKKKKKKKKKKK.', '................', '................',
    ],
    beehive: [
      '................', '.......KK.......', '......KbbK......', '.....KKKKKK.....',
      '....KyyyyyyK....', '...KyYyyyyYyK...', '...KKKKKKKKKK...', '...KyyyyyyyyK...',
      '..KyYyyyyyyYyK..', '..KKKKKKKKKKKK..', '..KyyyyyyyyyyK..', '...KyyyKKyyyK...',
      '...KyyyKxKyyK...', '....KKKKKKKK....', '......K.K.K.....', '................',
    ],
    chest: [
      '................', '................', '................', '....KKKKKKKK....',
      '...KbBBBBBBbK...', '..KbbbbbbbbbbK..', '..KBBBBBBBBBBK..', '..KKKKKKKKKKKK..',
      '..KbbbbKYKbbbK..', '..KbbbbKyKbbbK..', '..KbbbbKKKbbbK..', '..KbbbbbbbbbbK..',
      '..KKKKKKKKKKKK..', '................', '................', '................',
    ],
    chestopen: [
      '..KKKKKKKKKKKK..', '..KbbbbbbbbbbK..', '..KBBBBBBBBBBK..', '..KKKKKKKKKKKK..',
      '..KxxxxxxxxxxK..', '..KxxxxxxxxxxK..', '..KKKKKKKKKKKK..', '..KbbbbbbbbbbK..',
      '..KbbbbKKKbbbK..', '..KbbbbKYKbbbK..', '..KbbbbKKKbbbK..', '..KbbbbbbbbbbK..',
      '..KKKKKKKKKKKK..', '................', '................', '................',
    ],
    shrine: [
      '................', '.......KK.......', '......KyyK......', '.....KKyyKK.....',
      '......KyyK......', '.......KK.......', '.....KKKKKK.....', '....KssssssK....',
      '....KsKKKKsK....', '....KsKppKsK....', '....KsKppKsK....', '....KssssssK....',
      '...KKKKKKKKKK...', '..KssssssssssK..', '..KKKKKKKKKKKK..', '................',
    ],
    well: [
      '................', '......KKKK......', '....KKbbbbKK....', '...KbbbbbbbbK...',
      '..KKKKKKKKKKKK..', '..KbK......KbK..', '..KbK......KbK..', '..KbKKKKKKKKbK..',
      '.KKsSsSsSsSsSKK.', '.KsSKKKKKKKKSsK.', '.KSsKwwwwwwKsSK.', '.KsSKwwwwwwKSsK.',
      '.KSsSsSsSsSsSsK.', '.KsSsSsSsSsSsSK.', '.KKKKKKKKKKKKKK.', '................',
    ],
    bear: [
      '................', '....KK....KK....', '...KbbKKKKbbK...', '...KbbbbbbbbK...',
      '..KbbbbbbbbbbK..', '..KbKbbbbbbKbK..', '..KbbbbTTbbbbK..', '..KbbbbKTbbbbK..',
      '...KKbbbbbbKK...', '..KKbbbbbbbbKK..', '.KbbbbbbbbbbbbK.', '.KbbbbbbbbbbbbK.',
      '.KbbbbbbbbbbbbK.', '.KbbKKbbbbKKbbK.', '.KKKK.KKKK.KKKK.', '................',
    ],
    tent: [
      '................', '.......K........', '......KrK.......', '......KrK.......',
      '.....KrrrK......', '.....KrRrK......', '....KrrrrrK.....', '....KrRrrRK.....',
      '...KrrrrrrrK....', '...KrRrrrrRK....', '..KrrrrKKrrrK...', '..KrRrrKxKrRK...',
      '.KrrrrrKxKrrrK..', '.KrRrrKxxxKrRK..', 'KKKKKKKKKKKKKKKK', '................',
    ],
    fog: [
      'KKKKKKKKKKKKKKKK', 'KnnnnnnnnnnnnnnK', 'KnnnnnnnnnnnnnnK', 'KnnnnKKKKKKnnnnK',
      'KnnnKssssssKnnnK', 'KnnnKssKKssKnnnK', 'KnnnnKKKKssKnnnK', 'KnnnnnnnKssKnnnK',
      'KnnnnnnKssKnnnnK', 'KnnnnnnKssKnnnnK', 'KnnnnnnKKKKnnnnK', 'KnnnnnnKssKnnnnK',
      'KnnnnnnKssKnnnnK', 'KnnnnnnKKKKnnnnK', 'KnnnnnnnnnnnnnnK', 'KKKKKKKKKKKKKKKK',
    ],

    // ---------- things you carry ----------
    ore: [
      '................', '................', '................', '.....KKKK.......',
      '....KsSSSK......', '...KsSSSzSK.....', '..KSSzSSSzzK....', '..KSSSSzSSzK....',
      '..KzSSSSSzzK....', '...KzzSzzzK.....', '....KKKKKK......', '................',
      '................', '................', '................', '................',
    ],
    sword: [
      '................', '..........KK....', '.........KlK....', '........KlWK....',
      '.......KlWK.....', '......KlWK......', '.....KlWK.......', '....KlWK........',
      '...KKWK.........', '..KyKKKK........', '.KyyKy..........', '.KKyyK..........',
      '..K.KyK.........', '.....KK.........', '................', '................',
    ],
    oars: [
      '................', '..K.........K...', '.KbK.......KbK..', '..KbK.....KbK...',
      '...KbK...KbK....', '....KbK.KbK.....', '.....KbKbK......', '......KbK.......',
      '......KbK.......', '.....KbKbK......', '....KbK.KbK.....', '...KbK...KbK....',
      '..KbbK...KbbK...', '..KbbK...KbbK...', '...KK.....KK....', '................',
    ],
    boat: [
      '................', '........K.......', '.......KWK......', '.......KWWK.....',
      '.......KWWWK....', '.......KWWWWK...', '.......KWWWWWK..', '.......KKKKKKK..',
      '.......KbK......', '.KK....KbK...KK.', '.KbKKKKKKKKKKbK.', '..KbbbbbbbbbbK..',
      '...KBBBBBBBBK...', '....KKKKKKKK....', '................', '................',
    ],
    key: [
      '................', '......KKKK......', '.....KyyyyK.....', '....KyKKKKyK....',
      '....KyK..KyK....', '....KyKKKKyK....', '.....KyyyyK.....', '......KyyK......',
      '......KyyK......', '......KyyKK.....', '......KyyyK.....', '......KyyKK.....',
      '......KyyyK.....', '......KyyKK.....', '......KKKK......', '................',
    ],
    axe: [
      '................', '..........KK....', '.........KssK...', '........KsssSK..',
      '........KsSSSK..', '.......KbKKSK...', '......KbK.KK....', '.....KbK........',
      '....KbK.........', '...KbK..........', '..KbK...........', '.KbK............',
      '.KK.............', '................', '................', '................',
    ],
    planks: [
      '................', '................', '................', '..KKKKKKKKKKKK..',
      '.KbbBbbbBbbbbbK.', '.KKKKKKKKKKKKKK.', '..KKKKKKKKKKKK..', '.KbBbbbbBbbbBbK.',
      '.KKKKKKKKKKKKKK.', '..KKKKKKKKKKKK..', '.KbbbBbbbbBbbbK.', '.KKKKKKKKKKKKKK.',
      '................', '................', '................', '................',
    ],
    honey: [
      '................', '................', '.....KKKKKK.....', '....KbbbbbbK....',
      '....KKKKKKKK....', '.....KyyyyK.....', '....KyYyyyyK....', '...KyyyyyyyyK...',
      '...KyyYyyyyyK...', '...KyyyyyyyYK...', '...KyyyyyyyyK...', '....KyyyyyyK....',
      '.....KKKKKK.....', '................', '................', '................',
    ],
    pick: [
      '................', '....KKKK........', '..KKssssKKK.....', '.KsssKKKsssKK...',
      '.KssK...KKsssK..', '..KK......KKsK..', '.....KbK....KK..', '......KbK.......',
      '.......KbK......', '........KbK.....', '.........KbK....', '..........KbK...',
      '...........KbK..', '............KK..', '................', '................',
    ],
    lantern: [
      '................', '.......KK.......', '......KbbK......', '.....KKKKKK.....',
      '.....KyyyyK.....', '....KyyWyyyK....', '....KyyyyyyK....', '....KyoooyyK....',
      '....KyyoyyyK....', '....KyyyyyyK....', '.....KyyyyK.....', '.....KKKKKK.....',
      '......KbbK......', '......KKKK......', '................', '................',
    ],

    // ---------- action cards ----------
    // rework: a card turning back on itself, a fresh card for an old one
    rework: [
      '................', '.....KKKKKK.....', '....KyyyyyyK....', '...KyyyyyyyyK...',
      '...KyyKKKKyyK...', '...KyyK..KyyK...', '...KyyK..KyyK...', '...KyyKKKKyyK...',
      '...KyyyyyyyyK...', '....KyyyyyyK....', '.....KyyKKK.....', '.....KyyK.......',
      '.....KyyK.......', '.....KyyK.......', '.....KKKK.......', '................',
    ],
    // slip: two cards changing places, a double-headed arrow between them
    slip: [
      '................', '..KKKKK...KKKKK.', '.KyyKyyK.KyyKyyK', '.KyyKyyK.KyyKyyK',
      '.KKKKKKK.KKKKKKK', '..KyyK.....KyyK.', '...KK.......KK..', '....KK...KK.....',
      '......KKKK......', '...KK.....KK....', '..KK.......KK...', '.KKKK.....KKKK..',
      '..KKKKKKKKKKKK..', '................', '................', '................',
    ],
    // crossed deck: a hand reaching in and drawing a card out of another hand
    cross: [
      '................', '.....KKKKKKK....', '...KKKyyyyyKKK..', '..KyyyKKKKKyyyK.',
      '..KyKKKKKKKKyK..', '..KKKyyyyyyyKK..', '.....KyKKKKKyK..', '......KyyK.KyK..',
      '.......KyyK.KK..', '........KyyKK...', '.........KyyK...', '..........KK....',
      '.....KKKKK......', '....KyyyyyK.....', '....KKKKKKK.....', '................',
    ],

    // ---------- interface ----------
    heart: [
      '................', '................', '...KKK....KKK...', '..KrrrK..KrrrK..',
      '.KrWrrrKKrrrrrK.', '.KrrrrrrrrrrrrK.', '.KrrrrrrrrrrrrK.', '..KrrrrrrrrrrK..',
      '...KrrrrrrrrK...', '....KrrrrrrK....', '.....KrrrrK.....', '......KrrK......',
      '.......KK.......', '................', '................', '................',
    ],
    coin: [
      '................', '................', '................', '.....KKKKKK.....',
      '....KyyyyyyK....', '...KyyYYYYyyK...', '..KyyYyyyyYyyK..', '..KyYyyKKyyYyK..',
      '..KyYyyKKyyYyK..', '..KyyYyyyyYyyK..', '...KyyYYYYyyK...', '....KyyyyyyK....',
      '.....KKKKKK.....', '................', '................', '................',
    ],
    boot: [
      '................', '................', '................', '......KKKK......',
      '.....KBBBBK.....', '.....KBBBBK.....', '.....KBBBBK.....', '.....KBBBBKK....',
      '.....KBBBBBBK...', '....KKBBBBBBBK..', '...KBBBBBBBBBK..', '...KBBBBBBBBBK..',
      '...KKKKKKKKKKK..', '................', '................', '................',
    ],
    flag: [
      '................', '....KK..........', '....KbKKKKKK....', '....KbKrrrrK....',
      '....KbKrWrrrK...', '....KbKrrrrrrK..', '....KbKrrrrrK...', '....KbKrrrrK....',
      '....KbKKKKK.....', '....KbK.........', '....KbK.........', '....KbK.........',
      '....KbK.........', '...KKbKK........', '...KKKKK........', '................',
    ],
    lamp: [
      '................', '......KKKK......', '.....KyyyyK.....', '....KyyyyyyK....',
      '....KyKKKKyK....', '....KyKWWKyK....', '.....KKWWKK.....', '.....KWWWWK.....',
      '.....KrrrrK.....', '.....KWWWWK.....', '.....KrrrrK.....', '....KWWWWWWK....',
      '....KrrrrrrK....', '...KKKKKKKKKK...', '................', '................',
    ],
  };

  // recoloured versions of things that have been used up
  const RECOLOUR = {
    purseempty: ['purse', { y: 'b', Y: 'B' }],
    bushpicked: ['bush', { p: 'd' }],
    mineempty: ['mine', { y: 'x' }],
    mushroomspicked: ['mushrooms', { r: 'b', W: 'T', t: 'B' }],
    lighthousedark: ['lighthouse', { y: 'z' }],
    cavelit: ['cave', { x: 'T' }],
    shedempty: ['shed', { s: 'x', S: 'x', t: 'x' }],
    beehiveempty: ['beehive', { y: 'T', Y: 'b' }],
    tentempty: ['tent', { r: 'a', R: 'S', x: 'z' }],
    heartoff: ['heart', { r: 'z', W: 'S' }],
    lampdark: ['lamp', { y: 'z' }],
    // Maren's hearts are kept apart from yours in a different colour
    patheart: ['heart', { r: 'u', W: 'c' }],
    patheartoff: ['heart', { r: 'y', W: 'S' }],
  };

  // ---------- terrain ----------
  // a tiny seeded generator, so every grass tile is the same grass tile
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const CLIFF = [
    '.......K........', '......KsK.......', '.....KssSK......', '....KsssSSK.....',
    '...KsssSSSSK....', '..KsssSSSSSzK...', '.KsssSSSSSSzzK..', 'KssSSSSSSSzzzzK.',
    'KsSSSSSSSSzzzzzK', 'KSSSSSSzzzzzzzzK', 'KSSSSSzzzzzzzzzK', 'KSSSSzzzzzzzzzzK',
    'KSSSzzzzzzzzzzzK', 'KSSzzzzzzzzzzzzK', 'KKKKKKKKKKKKKKKK', 'zzzzzzzzzzzzzzzz',
  ];
  const BASES = {
    grass(px) { fill(px, 'g'); speckle(px, 'G', 14, 1); speckle(px, 'd', 10, 2); },
    woods(px) { fill(px, 'd'); speckle(px, 'e', 14, 3); speckle(px, 'g', 6, 4); },
    water(px) { fill(px, 'w'); dashes(px, 'u', 9, 5); dashes(px, 'U', 5, 6); },
    brook(px) {
      BASES.grass(px);
      for (let y = 0; y < 16; y++) { px[y][5] = 'T'; px[y][10] = 'T'; for (let x = 6; x < 10; x++) px[y][x] = 'w'; }
      const r = rng(7);
      for (let i = 0; i < 7; i++) { const y = Math.floor(r() * 16); px[y][6 + Math.floor(r() * 3)] = 'u'; }
    },
    stone(px) {
      fill(px, 'S');
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const row = Math.floor(y / 4), off = row % 2 ? 4 : 0;
        if (y % 4 === 3 || (x + off) % 8 === 7) px[y][x] = 'z';
        else if (y % 4 === 0 || (x + off) % 8 === 0) px[y][x] = 's';
      }
    },
    dark(px) { fill(px, 'x'); for (let x = 0; x < 16; x++) px[0][x] = 'z'; speckle(px, 'z', 6, 8); },
    thorns(px) {
      fill(px, 'e'); speckle(px, 'd', 10, 9);
      const r = rng(10);
      for (let i = 0; i < 7; i++) {
        const x = 1 + Math.floor(r() * 14), y = 1 + Math.floor(r() * 14);
        px[y][x] = 'K'; px[y - 1][x] = 'K'; px[y + 1][x] = 'K'; px[y][x - 1] = 'K'; px[y][x + 1] = 'K';
      }
    },
    cliff(px) { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px[y][x] = CLIFF[y][x] === '.' ? 'z' : CLIFF[y][x]; },
    sand(px) { fill(px, 't'); speckle(px, 'T', 12, 11); },
    bridge(px) { BASES.water(px); planks(px); },
    plankbridge(px) { BASES.dark(px); planks(px); },
  };
  function fill(px, ch) { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px[y][x] = ch; }
  function speckle(px, ch, n, seed) {
    const r = rng(seed);
    for (let i = 0; i < n; i++) px[Math.floor(r() * 16)][Math.floor(r() * 16)] = ch;
  }
  function dashes(px, ch, n, seed) {
    const r = rng(seed);
    for (let i = 0; i < n; i++) {
      const y = Math.floor(r() * 16), x = Math.floor(r() * 13), len = 2 + Math.floor(r() * 2);
      for (let k = 0; k < len; k++) px[y][x + k] = ch;
    }
  }
  function planks(px) {
    for (let y = 4; y <= 11; y++) for (let x = 0; x < 16; x++) {
      px[y][x] = (y === 4 || y === 11) ? 'K' : (x % 4 === 3 ? 'B' : 'b');
    }
  }

  // ---------- turning characters into canvases ----------
  const cache = new Map();

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  function paintRows(ctx, rows, map) {
    for (let y = 0; y < 16; y++) {
      const row = rows[y] || '';
      for (let x = 0; x < 16; x++) {
        let ch = row[x] || '.';
        if (map && map[ch]) ch = map[ch];
        if (ch === '.') continue;
        const col = PAL[ch];
        if (!col) continue;
        ctx.fillStyle = col;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  function paintSpec(ctx, spec) {
    if (Array.isArray(spec)) return paintRows(ctx, spec);
    if (spec.layers) return spec.layers.forEach((l) => paintSpec(ctx, l));
    paintRows(ctx, spec.rows, spec.map);
  }

  // a sixteen by sixteen canvas of the named sprite, drawn once and kept
  function sprite(name) {
    if (cache.has(name)) return cache.get(name);
    const c = makeCanvas(16, 16);
    const ctx = c.getContext('2d');
    if (RECOLOUR[name]) {
      const [srcName, map] = RECOLOUR[name];
      const src = S[srcName];
      const spec = Array.isArray(src) ? { rows: src, map } : { layers: src.layers.map((l) => ({ rows: l.rows || l, map: Object.assign({}, l.map, map) })) };
      paintSpec(ctx, spec);
    } else if (S[name]) {
      paintSpec(ctx, S[name]);
    } else {
      console.warn('wayside: no sprite called', name);
    }
    cache.set(name, c);
    return c;
  }
  function base(name) {
    const key = 'base:' + name;
    if (cache.has(key)) return cache.get(key);
    const px = Array.from({ length: 16 }, () => Array(16).fill('g'));
    (BASES[name] || BASES.grass)(px);
    const c = makeCanvas(16, 16);
    paintRows(c.getContext('2d'), px.map((r) => r.join('')));
    cache.set(key, c);
    return c;
  }

  // check every hand-drawn row is sixteen wide, so a slipped finger shows up in the console
  // rather than as a mystery
  for (const [name, spec] of Object.entries(S)) {
    const rows = Array.isArray(spec) ? spec : spec.rows || [];
    rows.forEach((row, i) => { if (row.length !== 16) console.warn(`wayside sprite ${name} row ${i} is ${row.length} wide`); });
  }
  for (const [name, rows] of Object.entries(HOLD)) {
    rows.forEach((row, i) => { if (row.length !== 16) console.warn(`wayside hold ${name} row ${i} is ${row.length} wide`); });
  }

  // a sprite scaled up for the page (hand cards, the pack, hearts). `inset` draws what stands on
  // the tile smaller than the tile, the way the land itself draws it, at a whole number of
  // pixels per sprite pixel so nothing blurs.
  const FULL_TILE_ICON = new Set(['fog', 'flowers', 'tracks']);
  function iconCanvas(name, scale, baseName, inset) {
    const size = 16 * scale;
    const c = makeCanvas(size, size);
    c.className = 'px';
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    if (baseName) ctx.drawImage(base(baseName), 0, 0, size, size);
    if (!name) return c;
    if (!inset || FULL_TILE_ICON.has(name)) { ctx.drawImage(sprite(name), 0, 0, size, size); return c; }
    const px = Math.max(2, Math.round(scale * 0.72));
    const d = px * 16, slack = size - d;
    ctx.drawImage(sprite(name), Math.round(slack / 2), Math.round(slack * 0.78), d, d);
    return c;
  }

  window.WaysideArt = { PAL, sprite, base, iconCanvas, rng };
})();
