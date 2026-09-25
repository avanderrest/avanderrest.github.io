/* Tithe — a side-on thief game in the manner of the old phone Tomb Raiders and
   Assassin's Creed: grid platforming up the fronts of three buildings, a window
   you step through into a single painted room, and a choice at the top.

   Outside, the buildings are built on a 16px grid but she moves freely over it:
   a run with some momentum, a jump you can steer, hands that catch any cornice
   or crack they pass. She hangs, shimmies, lunges across a missing stone, climbs
   hand over hand and up the ivy. Guards walk the ledges and see along their own
   row; hang below their feet and they walk right over you.

   Step up to a lit window and the game turns into a point-and-click room, drawn
   in perspective and walked about with the arrow keys: search the furniture,
   throw a pebble to turn a head, snuff the candle, hide in the wardrobe, or put
   the occupant down, gently or not.

   At the top of each building is the person the silver was taken for. What you
   do with them — and with the silver — is the game's other half.

   Everything is drawn in code: the stonework, the ivy, the people, the rooms. */
(() => {
  'use strict';

  // ---------- constants ----------
  const T = 16;                     // one grid cell, in game pixels
  const VW = 384, VH = 216;         // the canvas, in game pixels
  const SAVE_KEY = 'tithe-save-v1';
  const HURT_FALL = 4;              // rows fallen that cost a heart
  const DEATH_FALL = 9;             // rows fallen that kill
  const SIGHT = 6;                  // cells a guard sees along his row
  const MAX_HEARTS = 3;
  const FLOOR = 184;                // the floor line of a room
  const ROOM_SIGHT = 150;           // px an occupant sees along the floor
  const DUR = {
    turn: 0.08, walk: 0.24, step: 0.3, jump2: 0.44, jump3: 0.54, bonk: 0.3, grab: 0.34,
    hangdown: 0.36, climb: 0.52, shimmy: 0.3, lunge: 0.44, ivy: 0.28, ivyOn: 0.14, drop: 0.06,
  };

  // ---------- the three contracts ----------
  // Map legend: ' ' sky   '.' wall   '#' masonry   '=' cornice (stand on it, hang from it)
  // '-' crack (hang only)   '|' ivy   '~' canal   '1'-'9' a window   'T' the target's window
  // 'S' a shadowed alcove   'C' a sparrow mark (checkpoint)   'P' start   'g' a guard
  // 'G' a guard who is only posted on a bloody run   't' a torch   'w' an arrow slit
  const LEVELS = [
    {
      id: 'abbey',
      name: "St Orrin's Abbey",
      target: 'Abbot Crane', pron: 'him',
      where: 'the belfry',
      art: { stone: [118, 110, 96], moss: 0.62, sky: ['#1b2130', '#4a4250'], tabard: '#5b3a2c', seed: 11 },
      required: ['tithe'],
      evidence: 'ledger2',
      objectives: [
        { text: 'Find the coffer key', item: 'coffer-key' },
        { text: 'Take the famine tithe', item: 'tithe' },
        { text: 'Deal with Abbot Crane, in the belfry', item: null },
      ],
      intro: [
        'Three winters of famine, and every one of them Abbot Crane collected a tithe "for the hungry of Vell". Not a loaf of it has left St Orrin\'s.',
        'Come up off the canal. Find the key to his coffer, empty it, and climb to the belfry, where he says his prayers at midnight.',
      ],
      map: [
        '........................................',
        '........................................',
        '.......3..C..t.......T..................',
        '......=======..===========..............',
        '........................................',
        '..........--.---........................',
        '.................................w......',
        '...............-........................',
        '....w...w...............t...............',
        '...................2g..S...C.|..........',
        '...............==============|..........',
        '.............................|..........',
        '.............................|..........',
        '......w....w.................|...w......',
        '.............................|..........',
        '.............................|..........',
        '.............t...............|..........',
        '................1.....C..4..........w...',
        '.....========.=====..=========..........',
        '........................................',
        '..P.....................................',
        '##########~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
      ],
      rooms: {
        1: {
          name: "The tithe clerk's office", theme: 'abbey',
          spots: [
            { kind: 'barrel', x: 88, loot: [{ t: 'pebbles', n: 3 }] },
            { kind: 'curtain', x: 124 },
            { kind: 'shelf', x: 168, loot: [{ t: 'silver', n: 4 }] },
            { kind: 'candle', x: 206 },
            { kind: 'desk', x: 262, loot: [{ t: 'note', text: 'A tithe roll. In the margin: "Coffer key — Brother Anselm keeps it for the Abbot, in the study desk."' }] },
            { kind: 'chest', x: 318, loot: [{ t: 'silver', n: 6 }] },
          ],
          people: [{ kind: 'clerk', x: 250, face: 1, turnEvery: 5.5 }],
          tip: 'The clerk turns round every few seconds. Search while his back is to you — or throw a pebble past him.',
        },
        2: {
          name: "The Abbot's study", theme: 'abbey',
          spots: [
            { kind: 'wardrobe', x: 84 },
            { kind: 'candle', x: 126 },
            { kind: 'painting', x: 176, loot: [{ t: 'item', id: 'ledger2', name: 'The second ledger', doc: 'A second, private ledger in the Abbot\'s hand. The famine tithe was never stored: it was sold, sack by sack, to wine merchants over the border. The profit is entered as "alms".' }] },
            { kind: 'desk', x: 250, loot: [{ t: 'item', id: 'coffer-key', name: 'The coffer key' }, { t: 'silver', n: 3 }] },
            { kind: 'shelf', x: 318, loot: [{ t: 'silver', n: 5 }] },
          ],
          people: [{ kind: 'guard', x: 200, face: 1, route: [130, 300] }],
          tip: 'A novice walks the room. Hide in the wardrobe until he turns, or put him down from behind.',
        },
        3: {
          name: 'The counting room', theme: 'abbey',
          spots: [
            { kind: 'table', x: 104, loot: [{ t: 'silver', n: 3 }, { t: 'intel', id: 'bell-note', title: "The sexton's note", text: 'In the sexton\'s hand: "The great bell\'s hanging pin is rotten through. I have told the Abbot not to ring it till the smith comes. He rings it every midnight regardless, with his own hands."' }] },
            { kind: 'shelf', x: 160, loot: [{ t: 'darts', n: 2 }, { t: 'note', text: 'A jar of sleeping draught, and darts to carry it. The sexton\'s own.' }] },
            { kind: 'bed', x: 236 },
            { kind: 'strongbox', x: 316, needs: 'coffer-key', loot: [{ t: 'item', id: 'tithe', name: 'The famine tithe' }, { t: 'silver', n: 30 }] },
          ],
          people: [{ kind: 'sexton', x: 236, face: 1, sleep: true }],
          tip: 'The sexton sleeps. Searching close to him may wake him.',
        },
        4: {
          name: 'The abbey kitchen', theme: 'abbey',
          spots: [
            { kind: 'bell', x: 70 },
            { kind: 'barrel', x: 110, loot: [{ t: 'pebbles', n: 2 }] },
            { kind: 'knives', x: 150, loot: [{ t: 'knife' }] },
            { kind: 'table', x: 180, loot: [{ t: 'heal' }] },
            { kind: 'fireplace', x: 250 },
            { kind: 'cabinet', x: 320, loot: [{ t: 'picks', n: 1 }, { t: 'silver', n: 2 }, { t: 'item', id: 'pry-bar', name: 'The pry bar' }] },
          ],
          people: [{ kind: 'cook', x: 280, face: -1, route: [160, 310] }],
          tip: "The servants' bells hang on the wall, one wired to each room upstairs. Set one ringing and the cook goes up to answer it.",
        },
      },
      // The belfry: Crane's own room at the top, entered like any other. What you do
      // to him you do here, with what you found on the way up.
      finale: {
        name: 'The belfry', theme: 'abbey',
        spots: [
          { kind: 'curtain', x: 84 },
          { kind: 'candle', x: 130 },
          { kind: 'bigbell', x: 200, method: 'bell' },
          { kind: 'lectern', x: 262, method: 'ledger' },
          { kind: 'altar', x: 318 },
        ],
        people: [{ kind: 'abbot', x: 300, face: -1 }],
        tip: 'Crane prays, reads at his lectern, and looks out over the city he robbed. Do what you came to do while his back is turned.',
        knife: 'You wait until he kneels at the altar and do it yourself, quickly and quietly. St Orrin has no abbot in the morning, and the Lowmarket whispers your name with something like fear.',
        spare: 'You take the tithe and climb back out, and leave Crane to his prayers. He is still abbot in the morning. The coffer is empty, and he has already begun to fill it again.',
      },
      methods: [
        { id: 'bell', kind: 'execute', name: 'The rotten bell', intel: 'bell-note', needs: ['pry-bar'], verb: 'knock out the rotten pin',
          how: 'The great bell hangs on a rotten pin, and Crane rings it himself every midnight. Knock the pin half out and let him ring it.',
          outcome: 'At midnight Crane takes the bell rope in both hands, as he has every night for thirty years. The pin gives. The bell of St Orrin comes down through the belfry floor, and it never rings again. The Lowmarket heard the crash and knows who arranged it. So does the Watch.' },
        { id: 'ledger', kind: 'blackmail', name: 'The second ledger', intel: 'ledger2', needs: ['ledger2'], verb: 'leave the ledger and your note',
          how: 'Leave his second ledger open on his lectern, with a note: the abbey granary goes to the poor-house, or the bishop gets a copy.',
          outcome: 'Crane finds his own ledger open on his lectern, and your note beside it. By noon he has signed the abbey granary over to the poor-house. He keeps his cassock, and he will go on signing whatever you send him.' },
      ],
    },
    {
      id: 'assize',
      name: 'The Assize Hall',
      target: 'Magistrate Voss', pron: 'him',
      where: 'his chambers',
      art: { stone: [104, 104, 102], moss: 0.3, sky: ['#141a26', '#3a3a4a'], tabard: '#2f3f5e', seed: 23 },
      required: ['writs'],
      evidence: 'letters',
      objectives: [
        { text: 'Find the Assize seal', item: 'seal' },
        { text: 'Take the eviction writs', item: 'writs' },
        { text: 'Deal with Magistrate Voss, in his chambers', item: null },
      ],
      intro: [
        'Magistrate Voss has signed four hundred eviction writs this year, each one for a landlord who paid him. On the first of the month the bailiffs will empty the Lowmarket onto the street.',
        'The writs sit in his strongroom under the seal of the Assize. Take the seal, take the writs, and pay the Magistrate a visit in his chambers.',
      ],
      map: [
        '                                              ',
        '                                              ',
        '                                              ',
        '............................C....G............',
        '........................=################=....',
        '........................-###..................',
        '.........................###.............-....',
        '........w.....w....w....-###..................',
        '.........................###...w.....w...-....',
        '........................-###................t.',
        '.........................###.......T..g.S..3..',
        '...............t........-###.....============.',
        '....|.C..1.........g.2...###................|.',
        '....|==========.-========###................|.',
        '....|....................###................|.',
        '....|....................###................|.',
        '....|....................###..w.....w.....w.|.',
        '....|....................###................|.',
        '....|.....w.....w.....w..###................|.',
        '....|....................###................|.',
        '....|....................###................|.',
        '....|.......t............###t...........t...|.',
        '.P..................g....###..C.4...S.g.......',
        '##############################################',
      ],
      rooms: {
        1: {
          name: 'The records room', theme: 'assize',
          spots: [
            { kind: 'shelf', x: 86, loot: [{ t: 'pebbles', n: 3 }] },
            { kind: 'candle', x: 130 },
            { kind: 'desk', x: 196, loot: [{ t: 'silver', n: 5 }, { t: 'intel', id: 'port-note', title: 'A household note', text: 'Pinned by the steward: "His Honour\'s decanter to be filled fresh at eleven. He takes his port alone at midnight and is not to be disturbed."' }] },
            { kind: 'curtain', x: 250 },
            { kind: 'cabinet', x: 310, loot: [{ t: 'item', id: 'letters', name: "The landlords' letters", doc: 'A bundle of letters from the Landlords\' Guild. Each names a street, a sum, and a date — and each sum matches a writ Voss signed the week after.' }] },
          ],
          people: [{ kind: 'clerk', x: 220, face: -1, route: [150, 330] }],
          tip: 'Snuff the candle and the clerk sees only half as far.',
        },
        2: {
          name: "The bailiff's quarters", theme: 'assize',
          spots: [
            { kind: 'wardrobe', x: 84 },
            { kind: 'rack', x: 140, loot: [{ t: 'darts', n: 2 }] },
            { kind: 'table', x: 190, loot: [{ t: 'silver', n: 4 }, { t: 'item', id: 'rat-poison', name: 'A tin of rat poison' }] },
            { kind: 'bed', x: 264 },
            { kind: 'chest', x: 330, loot: [{ t: 'item', id: 'seal', name: 'The seal of the Assize' }] },
          ],
          people: [{ kind: 'guard', x: 264, face: -1, sleep: true }],
          tip: 'The bailiff is asleep. The chest is past his bed.',
        },
        3: {
          name: 'The strongroom', theme: 'assize',
          spots: [
            { kind: 'barrel', x: 84, loot: [{ t: 'pebbles', n: 2 }] },
            { kind: 'wardrobe', x: 130 },
            { kind: 'shelf', x: 200, loot: [{ t: 'silver', n: 6 }] },
            { kind: 'table', x: 256, loot: [{ t: 'heal' }] },
            { kind: 'strongbox', x: 324, needs: 'seal', loot: [{ t: 'item', id: 'writs', name: 'The eviction writs' }, { t: 'silver', n: 35 }] },
          ],
          people: [
            { kind: 'guard', x: 170, face: 1, route: [110, 250] },
            { kind: 'clerk', x: 300, face: -1, turnEvery: 6 },
          ],
          tip: 'Two of them. A pebble turns only the heads near where it lands.',
        },
        4: {
          name: 'The watch house', theme: 'assize', locked: true,
          spots: [
            { kind: 'knives', x: 60, loot: [{ t: 'knife' }] },
            { kind: 'rack', x: 110, loot: [{ t: 'darts', n: 3 }] },
            { kind: 'barrel', x: 160, loot: [{ t: 'pebbles', n: 3 }] },
            { kind: 'bed', x: 236 },
            { kind: 'chest', x: 320, loot: [{ t: 'silver', n: 12 }, { t: 'picks', n: 1 }] },
          ],
          people: [{ kind: 'guard', x: 236, face: 1, sleep: true }],
          tip: 'The night watch sleeps off his shift.',
        },
      },
      finale: {
        name: "Voss's chambers", theme: 'assize',
        spots: [
          { kind: 'curtain', x: 72 },
          { kind: 'shelf', x: 130 },
          { kind: 'table', x: 196, method: 'port' },
          { kind: 'desk', x: 268, method: 'letters' },
          { kind: 'candle', x: 326 },
        ],
        people: [{ kind: 'magistrate', x: 268, face: -1 }],
        tip: 'Voss works late: his desk, his books, his port. Do what you came to do while his back is turned.',
        knife: 'You come up behind him at his desk and do it yourself. The writs are found in the morning under a magistrate who will sign nothing more.',
        spare: 'You take the writs and climb back out, and leave Voss to his port. He will sign new writs, slower; it takes a year to buy a magistrate twice.',
      },
      methods: [
        { id: 'port', kind: 'execute', name: "The Magistrate's port", intel: 'port-note', needs: ['rat-poison'], verb: 'poison the decanter',
          how: 'Voss drinks a glass of port alone at midnight, every night, from the decanter on his table. Rat poison would do the rest.',
          outcome: 'Voss pours his port at midnight, alone, as he always does. He is found in the morning slumped over his table. No writ goes out in the Lowmarket that month, or the next; the new magistrate is too frightened to sign anything.' },
        { id: 'letters', kind: 'blackmail', name: "The landlords' letters", intel: 'letters', needs: ['letters'], verb: 'leave the letters and your note',
          how: 'Leave the landlords\' letters on his desk with a note: void every writ, or each landlord gets a copy of what he wrote.',
          outcome: 'Voss finds the letters on his desk and your note on top. He voids four hundred writs in his own hand. He will rule for the tenants from now on, and flinch every time a sparrow lands on his sill.' },
      ],
    },
    {
      id: 'keep',
      name: 'Marrow Keep',
      target: 'Countess Marrow', pron: 'her',
      where: 'her solar',
      art: { stone: [96, 100, 90], moss: 0.8, sky: ['#10161f', '#34303c'], tabard: '#2d4a32', seed: 37 },
      required: ['tower-key', 'contracts'],
      evidence: 'burn-order',
      objectives: [
        { text: 'Take the tower key', item: 'tower-key' },
        { text: 'Find the grain contracts', item: 'contracts' },
        { text: 'Deal with the Countess, in her solar', item: null },
      ],
      intro: [
        'The Countess Marrow owns every granary between the river and the hills. The famine was dear in Vell and very cheap for her.',
        'Her grain contracts are in the keep, and her tower door answers to one key. She is at the top, and she is expecting someone. Not you.',
      ],
      map: [
        '....................................',
        '....................................',
        '......4.T..C........................',
        '.....========--.....................',
        '....................t...............',
        '................g.S...3..G..|.......',
        '..............==============|.......',
        '............................|.......',
        '............................|..w....',
        '............................|.......',
        '...........w................|.......',
        '............................|.......',
        '...w....................t...|.......',
        '...................C..g...2.........',
        '..................===========.......',
        '....................................',
        '................---.--..............',
        '....................................',
        '................-...................',
        '....................................',
        '....w...........-.......w......w....',
        '...............t....................',
        '........|.C..1......................',
        '........|========...................',
        '........|...........................',
        '........|...........................',
        '........|........................t..',
        '........|...........................',
        '........|...w.......w.....w.........',
        '........|...........................',
        '........|...........................',
        '........|...........................',
        '..P.................................',
        '#########~~~~~~~~~~~~~~~~~~~~~~~~~~~',
      ],
      rooms: {
        1: {
          name: 'The keep kitchen', theme: 'keep',
          spots: [
            { kind: 'bell', x: 70 },
            { kind: 'cabinet', x: 112, loot: [{ t: 'pebbles', n: 3 }] },
            { kind: 'knives', x: 150, loot: [{ t: 'knife' }] },
            { kind: 'fireplace', x: 190 },
            { kind: 'table', x: 262, loot: [{ t: 'heal' }, { t: 'intel', id: 'rail-note', title: "The cook's grumble", text: 'Scrawled on the back of a flour tally: "Told the steward again, that balcony rail up in the solar is rotten since the storms. Her ladyship leans on it every night looking down at us. Not my business if it goes."' }] },
            { kind: 'barrel', x: 326, loot: [{ t: 'silver', n: 5 }] },
          ],
          people: [
            { kind: 'cook', x: 230, face: -1, route: [150, 300] },
            { kind: 'servant', x: 320, face: -1, turnEvery: 7 },
          ],
          tip: 'Kitchen folk answer the bell. They are not the ones you came for.',
        },
        2: {
          name: 'The barracks', theme: 'keep',
          spots: [
            { kind: 'wardrobe', x: 84 },
            { kind: 'chest', x: 132, loot: [{ t: 'darts', n: 2 }, { t: 'silver', n: 4 }, { t: 'item', id: 'saw', name: "A carpenter's saw" }] },
            { kind: 'bed', x: 200 },
            { kind: 'rack', x: 270, loot: [{ t: 'item', id: 'tower-key', name: 'The tower key' }] },
            { kind: 'barrel', x: 326, loot: [{ t: 'pebbles', n: 2 }] },
          ],
          people: [
            { kind: 'guard', x: 200, face: 1, sleep: true },
            { kind: 'guard', x: 300, face: -1, route: [230, 340] },
          ],
          tip: 'One sleeps, one walks. The key hangs on the rack.',
        },
        3: {
          name: "The Countess's study", theme: 'keep',
          spots: [
            { kind: 'curtain', x: 90 },
            { kind: 'shelf', x: 140, loot: [{ t: 'pebbles', n: 2 }] },
            { kind: 'candle', x: 186 },
            { kind: 'painting', x: 236, loot: [{ t: 'silver', n: 10 }] },
            { kind: 'desk', x: 300, loot: [{ t: 'item', id: 'contracts', name: 'The grain contracts' }] },
          ],
          people: [{ kind: 'clerk', x: 290, face: -1, turnEvery: 4.5 }],
          tip: 'Her secretary works late and looks up often.',
        },
        4: {
          name: 'The treasury', theme: 'keep', locked: true,
          spots: [
            { kind: 'chest', x: 110, loot: [{ t: 'silver', n: 15 }] },
            { kind: 'altar', x: 200, loot: [{ t: 'item', id: 'burn-order', name: 'The burn order', doc: 'An order under the Countess\'s own seal, two winters old: the Crown granaries at Hollin Ford are to be burnt "by accident", so that hers are the only grain left to buy.' }] },
            { kind: 'strongbox', x: 300, loot: [{ t: 'silver', n: 20 }] },
          ],
          people: [],
          tip: 'Nobody guards a room nobody can get into.',
        },
      },
      finale: {
        name: "The Countess's solar", theme: 'keep',
        spots: [
          { kind: 'curtain', x: 72 },
          { kind: 'fireplace', x: 140 },
          { kind: 'balcony', x: 222, method: 'rail' },
          { kind: 'desk', x: 300, method: 'order' },
        ],
        people: [{ kind: 'countess', x: 300, face: -1 }],
        tip: 'The Countess writes, warms her hands, and takes the air on her balcony. Do what you came to do while her back is turned.',
        knife: 'You come up behind her at her desk and do it yourself. Her granaries are broken open within the week, by a mob and not gently. Vell eats, and learns how easily it can kill.',
        spare: 'You climb back down the tower with her silver and leave her the rest. She is still the Countess Marrow, and the next famine will be hers too.',
      },
      methods: [
        { id: 'rail', kind: 'execute', name: 'The balcony rail', intel: 'rail-note', needs: ['saw'], verb: 'saw through the rail',
          how: 'The rail of her balcony has been rotten since the winter storms, and she leans on it every night to look down on the city. A few strokes of a saw.',
          outcome: 'The Countess steps out onto her balcony to look down on the city she starved, and leans on the rail as she always does. It gives. Her granaries are broken open within the week, by a mob and not gently. Vell eats, and learns how easily it can kill.' },
        { id: 'order', kind: 'blackmail', name: 'The burn order', intel: 'burn-order', needs: ['burn-order'], verb: 'leave the burn order and your note',
          how: 'Leave her own burn order on her desk with a note: open every granary at a farthing a sack, or it goes to the Crown.',
          outcome: 'The Countess opens her granaries at a farthing a sack, and smiles for the crowds while she does it. The burn order stays in your coat. She will never sleep soundly again, and Vell will never go hungry on her account.' },
      ],
    },
  ];

  // Who counts as an innocent when the knife comes out.
  const INNOCENT = { clerk: true, cook: true, servant: true, sexton: true };
  const ITEM_NAMES = {
    'coffer-key': 'The coffer key', tithe: 'The famine tithe', ledger2: 'The second ledger',
    seal: 'The seal of the Assize', writs: 'The eviction writs', letters: "The landlords' letters",
    'tower-key': 'The tower key', contracts: 'The grain contracts', 'burn-order': 'The burn order',
    'pry-bar': 'The pry bar', 'rat-poison': 'The rat poison', saw: "The carpenter's saw",
  };

  // ---------- the world grid ----------
  function parseLevel(L) {
    const H = L.map.length, W = L.map[0].length;
    const t = [], deco = [];
    const out = { W, H, t, deco, start: { x: 1, y: H - 2 }, guards: [], windows: {}, torches: [] };
    for (let y = 0; y < H; y++) {
      const row = [], drow = [];
      for (let x = 0; x < W; x++) {
        const ch = L.map[y][x] || '.';
        let tile = ch, d = '';
        if ('123456789T'.includes(ch)) { d = ch; tile = '.'; out.windows[ch] = { x, y }; }
        else if (ch === 'S' || ch === 'C' || ch === 'w') { d = ch; tile = '.'; }
        else if (ch === 't') { d = 't'; tile = '.'; out.torches.push({ x, y }); }
        else if (ch === 'P') { tile = '.'; out.start = { x, y }; }
        else if (ch === 'g' || ch === 'G') { tile = '.'; out.guards.push({ x, y, chaos: ch === 'G' }); }
        row.push(tile); drow.push(d);
      }
      t.push(row); deco.push(drow);
    }
    return out;
  }

  const at = (w, x, y) => (x < 0 || x >= w.W) ? '#' : (y < 0 ? ' ' : (y >= w.H ? '~' : w.t[y][x]));
  const isSolid = (w, x, y) => at(w, x, y) === '#';
  const isFloor = (w, x, y) => { const c = at(w, x, y); return c === '#' || c === '='; };
  const grabbable = (w, x, y) => { const c = at(w, x, y); return c === '=' || c === '-'; };
  const ivyAt = (w, x, y) => at(w, x, y) === '|';
  const ivyOK = (w, x, y) => ivyAt(w, x, y) || ivyAt(w, x, y - 1);
  const decoAt = (w, x, y) => (x < 0 || y < 0 || x >= w.W || y >= w.H) ? '' : w.deco[y][x];
  function standable(w, x, y) {
    if (x < 0 || x >= w.W || y < 0 || y >= w.H - 0) return false;
    return !isSolid(w, x, y) && !isSolid(w, x, y - 1) && at(w, x, y) !== '~' && isFloor(w, x, y + 1);
  }

  // Where someone lands if they let go at feet row y in column x.
  function settle(w, x, y) {
    for (let yy = y; yy < w.H + 2; yy++) {
      if (at(w, x, yy) === '~' || yy >= w.H) return { x, y: yy, rows: yy - y, drown: true, dead: true };
      if (isSolid(w, x, yy)) return { x, y: yy - 1, rows: yy - 1 - y, dead: false, stuck: true };
      if (standable(w, x, yy)) {
        const rows = yy - y;
        return { x, y: yy, rows, dead: rows >= DEATH_FALL, hurt: rows >= HURT_FALL && rows < DEATH_FALL };
      }
    }
    return { x, y: w.H, rows: w.H - y, dead: true };
  }

  const mv = (kind, to, dur, extra) => Object.assign({ kind, to, dur }, extra || {});

  // The climbing rules the maps are designed against, as a pure function of a grid
  // position: what a jump clears, what a hand can reach. Nothing in play calls this
  // — she moves freely (see "how she moves outside") — but reach() searches it to
  // prove every window can be got to, and test/tithe/keys.js proves the free
  // controller can do each of these moves with the keys.
  // A position is { m: 's' stand | 'h' hang | 'c' ivy, x, y, f }. For a hang, y is
  // the row of the ledge in her hands; otherwise y is the row her feet are in.
  function resolve(w, p, act, run) {
    const { x, y, f } = p;
    if (p.m === 's') {
      if (act === 'left' || act === 'right') {
        const d = act === 'left' ? -1 : 1;
        if (d !== f) return mv('turn', { ...p, f: d }, DUR.turn);
        const nx = x + d;
        if (standable(w, nx, y)) return mv('walk', { m: 's', x: nx, y, f }, DUR.walk);
        if (standable(w, nx, y - 1) && !isSolid(w, x, y - 2)) return mv('step', { m: 's', x: nx, y: y - 1, f }, DUR.step);
        if (!isSolid(w, nx, y) && !isSolid(w, nx, y - 1) && !isFloor(w, nx, y + 1) && standable(w, nx, y + 1)) {
          return mv('step', { m: 's', x: nx, y: y + 1, f }, DUR.step);
        }
        return null; // a wall, or the edge: she stops rather than walk off it
      }
      if (act === 'up') {
        const win = decoAt(w, x, y);
        if (win && '123456789T'.includes(win)) return mv('window', p, 0, { win });
        if (ivyAt(w, x, y - 1) || ivyAt(w, x, y)) return mv('ivyOn', { m: 'c', x, y, f }, DUR.ivyOn);
        if (at(w, x, y - 1) === '=' && !isSolid(w, x, y - 2) && !isSolid(w, x, y - 3)) {
          return mv('mantle', { m: 's', x, y: y - 2, f }, DUR.climb);
        }
        if (grabbable(w, x, y - 1)) return mv('grab', { m: 'h', x, y: y - 1, f }, DUR.grab);
        if (grabbable(w, x, y - 2) && !isSolid(w, x, y - 1)) return mv('grab', { m: 'h', x, y: y - 2, f }, DUR.grab);
        return null;
      }
      if (act === 'down') {
        if (at(w, x, y + 1) === '=') return mv('hangdown', { m: 'h', x, y: y + 1, f }, DUR.hangdown);
        return null;
      }
      if (act === 'jump') {
        const n = run ? 3 : 2;
        for (let i = 1; i <= n; i++) {
          const cx = x + f * i;
          if (isSolid(w, cx, y) || isSolid(w, cx, y - 1) || isSolid(w, cx, y - 2)) {
            const bx = x + f * (i - 1);
            if (bx === x) return null;
            return mv('jump', { m: 'air', x: bx, y, f }, DUR.bonk, { bonk: true });
          }
        }
        const tx = x + f * n, dur = run ? DUR.jump3 : DUR.jump2;
        if (standable(w, tx, y)) return mv('jump', { m: 's', x: tx, y, f }, dur);
        if (at(w, tx, y) === '=' && standable(w, tx, y - 1)) return mv('jump', { m: 's', x: tx, y: y - 1, f }, dur);
        if (grabbable(w, tx, y) && !isSolid(w, tx, y + 1)) return mv('jump', { m: 'h', x: tx, y, f }, dur);
        if (grabbable(w, tx, y - 1)) return mv('jump', { m: 'h', x: tx, y: y - 1, f }, dur);
        return mv('jump', { m: 'air', x: tx, y, f }, dur);
      }
      return null;
    }
    if (p.m === 'h') {
      const L = y;
      if (act === 'left' || act === 'right') {
        const d = act === 'left' ? -1 : 1;
        if (grabbable(w, x + d, L) && !isSolid(w, x + d, L + 1)) return mv('shimmy', { m: 'h', x: x + d, y: L, f: d }, DUR.shimmy);
        if (d !== f) return mv('turn', { ...p, f: d }, 0);
        return null;
      }
      if (act === 'up') {
        if (at(w, x, L) === '=' && !isSolid(w, x, L - 1) && !isSolid(w, x, L - 2)) return mv('climb', { m: 's', x, y: L - 1, f }, DUR.climb);
        if (grabbable(w, x, L - 1)) return mv('shimmy', { m: 'h', x, y: L - 1, f }, DUR.shimmy, { vert: true });
        if (grabbable(w, x, L - 2) && !isSolid(w, x, L - 1)) return mv('shimmy', { m: 'h', x, y: L - 2, f }, DUR.climb, { vert: true });
        return null;
      }
      if (act === 'down') {
        if (ivyOK(w, x, L + 1)) return mv('ivy', { m: 'c', x, y: L + 1, f }, DUR.ivy);
        if (standable(w, x, L + 1)) return mv('drop', { m: 's', x, y: L + 1, f }, DUR.drop);
        if (grabbable(w, x, L + 1)) return mv('shimmy', { m: 'h', x, y: L + 1, f }, DUR.shimmy, { vert: true });
        if (grabbable(w, x, L + 2) && !isSolid(w, x, L + 2)) return mv('shimmy', { m: 'h', x, y: L + 2, f }, DUR.climb, { vert: true });
        return mv('drop', { m: 'air', x, y: L + 1, f }, DUR.drop);
      }
      if (act === 'jump') {
        if (isSolid(w, x + f, L) || isSolid(w, x + f, L + 1)) return null;
        for (const dy of [0, -1, 1]) {
          const tx = x + 2 * f, ty = L + dy;
          if (grabbable(w, tx, ty) && !isSolid(w, tx, ty + 1)) return mv('lunge', { m: 'h', x: tx, y: ty, f }, DUR.lunge);
        }
        return null;
      }
      return null;
    }
    if (p.m === 'c') {
      if (act === 'up') {
        if (at(w, x, y - 1) === '=' && !isSolid(w, x, y - 2) && !isSolid(w, x, y - 3)) return mv('mantle', { m: 's', x, y: y - 2, f }, DUR.climb);
        if (ivyOK(w, x, y - 1) && !isSolid(w, x, y - 2)) return mv('ivy', { m: 'c', x, y: y - 1, f }, DUR.ivy);
        return null;
      }
      if (act === 'down') {
        if (standable(w, x, y)) return mv('ivyOff', { m: 's', x, y, f }, DUR.ivyOn);
        if (ivyOK(w, x, y + 1) && !isFloor(w, x, y + 1)) return mv('ivy', { m: 'c', x, y: y + 1, f }, DUR.ivy);
        return null;
      }
      if (act === 'left' || act === 'right') {
        const d = act === 'left' ? -1 : 1;
        if (standable(w, x + d, y)) return mv('walk', { m: 's', x: x + d, y, f: d }, DUR.step);
        if (grabbable(w, x + d, y - 1)) return mv('shimmy', { m: 'h', x: x + d, y: y - 1, f: d }, DUR.shimmy);
        if (ivyOK(w, x + d, y)) return mv('ivy', { m: 'c', x: x + d, y, f: d }, DUR.ivy);
        return mv('turn', { ...p, f: d }, 0);
      }
      if (act === 'jump') return mv('drop', { m: 'air', x, y, f }, DUR.drop);
    }
    return null;
  }

  // Everywhere she can get to from a start without dying, and which windows she
  // can stand at. A breadth-first search over resolve() — exactly the verbs the
  // keyboard has, so a map that passes this can be climbed by hand.
  function reach(w, start) {
    const key = (p) => p.m + ',' + p.x + ',' + p.y + ',' + p.f;
    const seen = new Map();
    const q = [];
    const push = (p, from) => { const k = key(p); if (!seen.has(k)) { seen.set(k, from); q.push(p); } };
    push({ m: 's', x: start.x, y: start.y, f: 1 }, null);
    const windows = {};
    let hurts = 0;
    while (q.length) {
      const p = q.shift();
      if (p.m === 's') {
        const d = decoAt(w, p.x, p.y);
        if (d && '123456789T'.includes(d)) windows[d] = true;
      }
      const acts = ['left', 'right', 'up', 'down', 'jump'];
      for (const a of acts) {
        const runs = (a === 'jump' && p.m === 's' && standable(w, p.x - p.f, p.y)) ? [false, true] : [false];
        for (const r of runs) {
          const m = resolve(w, p, a, r);
          if (!m || m.kind === 'window') continue;
          let to = m.to;
          if (to.m === 'air') {
            const s = settle(w, to.x, to.y);
            if (s.dead) continue;
            if (s.hurt) hurts++;
            to = { m: 's', x: s.x, y: s.y, f: to.f };
          }
          push(to, key(p));
        }
      }
    }
    return { windows, states: seen.size, hurts };
  }

  // ---------- canvas ----------
  const canvas = document.getElementById('screen');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const stage = document.getElementById('stage');
  const $ = (id) => document.getElementById(id);

  function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

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

  // Smooth value noise on a coarse lattice, for moss and soot.
  function valueNoise(rnd, cell) {
    const cache = new Map();
    const v = (i, j) => { const k = i * 7919 + j; if (!cache.has(k)) cache.set(k, rnd()); return cache.get(k); };
    const sm = (t) => t * t * (3 - 2 * t);
    return (x, y) => {
      const gx = x / cell, gy = y / cell, i = Math.floor(gx), j = Math.floor(gy);
      const fx = sm(gx - i), fy = sm(gy - j);
      const a = v(i, j), b = v(i + 1, j), c = v(i, j + 1), d = v(i + 1, j + 1);
      return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
    };
  }

  // '#rrggbb' or 'rgb(r,g,b)' to [r, g, b]
  const hex = (c) => c[0] === '#'
    ? [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]
    : c.slice(c.indexOf('(') + 1, -1).split(',').map(Number);
  const rgb = (r, g, b) => 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
  const shade = (c, f) => { const [r, g, b] = hex(c); return rgb(Math.min(255, r * f), Math.min(255, g * f), Math.min(255, b * f)); };

  // ---------- the pixel font ----------
  // 3x5 capitals, each row three bits. Chunky on purpose: it is what the old
  // phones had room for.
  const GLYPHS = {
    A: [2, 5, 7, 5, 5], B: [6, 5, 6, 5, 6], C: [3, 4, 4, 4, 3], D: [6, 5, 5, 5, 6], E: [7, 4, 6, 4, 7],
    F: [7, 4, 6, 4, 4], G: [3, 4, 5, 5, 3], H: [5, 5, 7, 5, 5], I: [7, 2, 2, 2, 7], J: [1, 1, 1, 5, 2],
    K: [5, 5, 6, 5, 5], L: [4, 4, 4, 4, 7], M: [5, 7, 7, 5, 5], N: [6, 5, 5, 5, 5], O: [2, 5, 5, 5, 2],
    P: [6, 5, 6, 4, 4], Q: [2, 5, 5, 6, 3], R: [6, 5, 6, 5, 5], S: [3, 4, 2, 1, 6], T: [7, 2, 2, 2, 2],
    U: [5, 5, 5, 5, 7], V: [5, 5, 5, 5, 2], W: [5, 5, 7, 7, 5], X: [5, 5, 2, 5, 5], Y: [5, 5, 2, 2, 2],
    Z: [7, 1, 2, 4, 7], 0: [7, 5, 5, 5, 7], 1: [2, 6, 2, 2, 7], 2: [6, 1, 2, 4, 7], 3: [6, 1, 2, 1, 6],
    4: [5, 5, 7, 1, 1], 5: [7, 4, 6, 1, 6], 6: [3, 4, 6, 5, 2], 7: [7, 1, 2, 2, 2], 8: [2, 5, 2, 5, 2],
    9: [2, 5, 3, 1, 6], '.': [0, 0, 0, 0, 2], ',': [0, 0, 0, 2, 4], '!': [2, 2, 2, 0, 2], '?': [7, 1, 2, 0, 2],
    ':': [0, 2, 0, 2, 0], "'": [2, 2, 0, 0, 0], '-': [0, 0, 7, 0, 0], '+': [0, 2, 7, 2, 0], '/': [1, 1, 2, 4, 4],
    '(': [1, 2, 2, 2, 1], ')': [4, 2, 2, 2, 4], '"': [5, 5, 0, 0, 0], '>': [4, 2, 1, 2, 4], '<': [1, 2, 4, 2, 1],
  };
  function textWidth(s, sc) { return s.length * 4 * sc - sc; }
  function drawText(c, s, x, y, color, sc, align, shadowCol) {
    sc = sc || 1;
    s = String(s).toUpperCase();
    let x0 = Math.round(align === 'center' ? x - textWidth(s, sc) / 2 : align === 'right' ? x - textWidth(s, sc) : x);
    y = Math.round(y);
    const pass = (col, ox, oy) => {
      c.fillStyle = col;
      for (let i = 0; i < s.length; i++) {
        const g = GLYPHS[s[i]];
        if (!g) continue;
        for (let r = 0; r < 5; r++) for (let b = 0; b < 3; b++) {
          if (g[r] & (4 >> b)) c.fillRect(x0 + i * 4 * sc + b * sc + ox, y + r * sc + oy, sc, sc);
        }
      }
    };
    if (shadowCol !== null) pass(shadowCol || '#0d0b09', sc, sc);
    pass(color, 0, 0);
  }

  // ---------- people ----------
  // Everybody is the same little rig: a handful of joints per pose, limbs drawn
  // as thick pixel lines, an outline pass under a fill pass, and a head drawn
  // pixel by pixel. Coordinates are game pixels at scale 1, feet at (0, 0).
  const LOOKS = {
    wren: { head: 'hood', hood: '#3b3230', hoodD: '#272120', hoodL: '#564840', skin: '#c89982', skinD: '#8c5c49', torso: '#4a3a31', torsoL: '#6c4d37', arm: '#5e4030', bracer: '#9b5b31', leg: '#3a302b', boot: '#57392a', belt: '#2a1f18', buckle: '#c9a760', blade: '#b9cad6', out: '#15110e' },
    guard: { head: 'helm', helm: '#80858d', helmD: '#50545b', skin: '#c39478', skinD: '#88604e', torso: '#5b3a2c', torsoL: '#7a4f3b', arm: '#5c6068', bracer: '#6e737b', leg: '#3c3a3a', boot: '#3a2a22', belt: '#2a211b', buckle: '#b0a070', out: '#141210' },
    clerk: { head: 'hair', hair: '#4a3a2c', skin: '#d0a488', skinD: '#906650', torso: '#2d2c33', torsoL: '#44424c', arm: '#2d2c33', bracer: '#e2dccd', leg: '#26252a', boot: '#1d1a18', belt: '#1d1a18', collar: '#e2dccd', out: '#121014' },
    cook: { head: 'cap', cap: '#e4ddcc', skin: '#d8a88a', skinD: '#9a6a52', torso: '#6a5a46', torsoL: '#857259', arm: '#7a6a55', bracer: '#d8a88a', leg: '#4a3e32', boot: '#2c231c', belt: '#e4ddcc', apron: '#ddd4c0', out: '#15110e' },
    servant: { head: 'cap', cap: '#d6cfbf', skin: '#c89a7c', skinD: '#8e6450', torso: '#4f4260', torsoL: '#66577a', arm: '#4f4260', bracer: '#c89a7c', leg: '#3e3450', boot: '#231d1a', belt: '#d6cfbf', apron: '#d6cfbf', robe: '#4f4260', out: '#141018' },
    sexton: { head: 'cowl', hood: '#4d3c2e', hoodD: '#35291f', hoodL: '#65503d', skin: '#caa088', skinD: '#8e6450', torso: '#4d3c2e', torsoL: '#65503d', arm: '#4d3c2e', bracer: '#caa088', leg: '#3a2d22', boot: '#231a14', belt: '#c2b08a', robe: '#4d3c2e', out: '#141010' },
    abbot: { head: 'mitre', mitre: '#e7e0cf', mitreD: '#b9ae98', gold: '#c9a13e', skin: '#d6a78e', skinD: '#9a6a56', torso: '#6b2f2f', torsoL: '#8a4040', arm: '#6b2f2f', bracer: '#e7e0cf', leg: '#3a2020', boot: '#231414', belt: '#c9a13e', robe: '#e2dac8', robeD: '#b5ab96', out: '#161010' },
    magistrate: { head: 'wig', wig: '#e9e4d8', wigD: '#b8b2a4', skin: '#d4a08a', skinD: '#966450', torso: '#7a1f1f', torsoL: '#9a3030', arm: '#7a1f1f', bracer: '#e9e4d8', leg: '#2a1a1a', boot: '#1d1414', belt: '#1d1414', robe: '#6a1a1a', robeD: '#4a1212', collar: '#e9e4d8', out: '#140c0c' },
    countess: { head: 'bun', hair: '#2a1d18', gold: '#d4ad4a', skin: '#e0b8a0', skinD: '#a07a64', torso: '#244032', torsoL: '#355a46', arm: '#244032', bracer: '#e0b8a0', leg: '#1a2a22', boot: '#141c18', belt: '#d4ad4a', robe: '#1f3a2c', robeD: '#15281e', out: '#0e1410' },
  };

  const P0 = {
    stand: { h: [0, -24], n: [0, -20], hip: [0, -11], kf: [1.5, -6], ff: [2, 0], kb: [-1.5, -6], fb: [-2, 0], ef: [3, -15], hf: [3.5, -11], eb: [-3, -15], hb: [-3.5, -11] },
    jump: { h: [1, -26], n: [1, -22], hip: [0, -14], kf: [4, -11], ff: [2, -6], kb: [-2, -9], fb: [-5, -6], ef: [4, -21], hf: [6, -25], eb: [-3, -18], hb: [-5, -15] },
    hang: { h: [0, -26], n: [0, -22], hip: [0, -13], kf: [1, -7], ff: [1, -1], kb: [-1, -7], fb: [-1, -1], ef: [3, -28], hf: [2, -32], eb: [-3, -28], hb: [-2, -32] },
    fall: { h: [0, -24], n: [0, -20], hip: [0, -11], kf: [2, -6], ff: [3, -1], kb: [-2, -6], fb: [-3, -2], ef: [5, -22], hf: [6, -27], eb: [-5, -22], hb: [-6, -27] },
    crouch: { h: [3, -17], n: [2, -14], hip: [-1, -8], kf: [3, -6], ff: [3, 0], kb: [-3, -3], fb: [-4, 0], ef: [5, -11], hf: [8, -12], eb: [0, -10], hb: [3, -11] },
    throw: { h: [0, -24], n: [0, -20], hip: [0, -11], kf: [2, -6], ff: [4, 0], kb: [-2, -6], fb: [-3, 0], ef: [3, -21], hf: [7, -25], eb: [-3, -16], hb: [-5, -13] },
    reach: { h: [2, -23], n: [1, -19], hip: [-1, -11], kf: [2, -6], ff: [3, 0], kb: [-2, -6], fb: [-3, 0], ef: [5, -17], hf: [9, -16], eb: [-2, -15], hb: [-3, -11] },
    peek: { h: [0, -26], n: [0, -22], hip: [0, -13], kf: [1, -7], ff: [1, -1], kb: [-1, -7], fb: [-1, -1], ef: [5, -20], hf: [4, -24], eb: [-5, -20], hb: [-4, -24] },
    lie: { h: [-11, -3], n: [-8, -3], hip: [2, -3], kf: [7, -3], ff: [12, -1], kb: [7, -2], fb: [12, -1], ef: [-4, -1], hf: [0, -1], eb: [-5, -4], hb: [-1, -5] },
    point: { h: [0, -24], n: [0, -20], hip: [0, -11], kf: [1.5, -6], ff: [2, 0], kb: [-1.5, -6], fb: [-2, 0], ef: [5, -18], hf: [9, -19], eb: [-3, -15], hb: [-3, -11] },
  };
  function walkPose(ph, stride) {
    const s = Math.sin(ph * Math.PI * 2) * stride, c = Math.cos(ph * Math.PI * 2);
    const lift = (v) => Math.min(0, v) * 1.6;
    return {
      h: [0.5, -24 + Math.abs(c) * 0.5], n: [0.5, -20 + Math.abs(c) * 0.5], hip: [0, -11 + Math.abs(c) * 0.4],
      kf: [s * 0.6 + 1, -6], ff: [s, lift(-c)], kb: [-s * 0.6 + 1, -6], fb: [-s, lift(c)],
      ef: [-s * 0.4 + 1.5, -15], hf: [-s * 0.7 + 2, -11], eb: [s * 0.4 - 1.5, -15], hb: [s * 0.7 - 2, -11],
    };
  }
  // Walking straight into the room or out toward the camera: seen from behind or in
  // front, the feet lift in turn and the arms swing a little.
  function walkDepthPose(ph) {
    const s = Math.sin(ph * Math.PI * 2), lr = Math.max(0, s) * 2, ll = Math.max(0, -s) * 2;
    return {
      h: [0, -24 - Math.abs(s) * 0.3], n: [0, -20], hip: [0, -11],
      kf: [1.8, -6 - lr], ff: [2, -lr], kb: [-1.8, -6 - ll], fb: [-2, -ll],
      ef: [3.2, -15], hf: [3.5, -11 + s * 1.5], eb: [-3.2, -15], hb: [-3.5, -11 - s * 1.5],
    };
  }

  function climbPose(ph) {
    const s = Math.sin(ph * Math.PI * 2);
    return {
      h: [0, -25], n: [0, -21], hip: [0, -12], kf: [2, -7 - s * 2], ff: [2, -1 - s * 3], kb: [-2, -7 + s * 2], fb: [-2, -1 + s * 3],
      ef: [3, -25 + s * 2], hf: [2.5, -30 + s * 3], eb: [-3, -25 - s * 2], hb: [-2.5, -30 - s * 3],
    };
  }

  // Draws a figure. ox/oy: feet, in screen pixels. s: scale. f: facing (+1 right).
  // back: seen from behind (hanging, climbing).
  function drawFigure(c, look, pose, ox, oy, s, f, opts) {
    const o = opts || {};
    const L = LOOKS[look] || LOOKS.guard;
    ox = Math.round(ox); oy = Math.round(oy);
    const X = (v) => ox + Math.round(v * f * s);
    const Y = (v) => oy + Math.round(v * s);
    const dot = (x, y, th, col) => {
      c.fillStyle = col;
      const t = Math.max(1, Math.round(th * s)), h = Math.floor(t / 2);
      c.fillRect(x - h, y - h, t, t);
    };
    const line = (a, b, th, col) => {
      const x0 = X(a[0]), y0 = Y(a[1]), x1 = X(b[0]), y1 = Y(b[1]);
      const n = Math.max(1, Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)));
      for (let i = 0; i <= n; i++) dot(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), th, col);
    };
    const R = (x, y, w, h, col) => { // a rect in rig units, mirrored with the facing
      c.fillStyle = col;
      const x0 = f > 0 ? x : -(x + w);
      c.fillRect(ox + Math.round(x0 * s), oy + Math.round(y * s), Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s)));
    };
    const p = pose;
    const robe = L.robe && !o.lying;
    const segs = [
      [p.hip, p.kb, 3, L.leg], [p.kb, p.fb, 3, L.leg], [p.fb, [p.fb[0] + 1.5, p.fb[1]], 3, L.boot],
      [p.n, p.eb, 2.2, L.arm], [p.eb, p.hb, 2.2, L.bracer],
      [p.n, p.hip, 5, L.torso],
      [p.hip, p.kf, 3, L.leg], [p.kf, p.ff, 3, L.leg], [p.ff, [p.ff[0] + 1.5, p.ff[1]], 3, L.boot],
      [p.n, p.ef, 2.2, L.arm], [p.ef, p.hf, 2.2, L.bracer],
    ];
    // outline pass, then fill
    for (const sg of segs) line(sg[0], sg[1], sg[2] + 2 / s, L.out);
    if (robe) drawRobe(true);
    head(true);
    for (let i = 0; i < segs.length; i++) {
      const sg = segs[i];
      if (o.back && i >= 6) { line(sg[0], sg[1], sg[2], sg[3]); continue; }
      line(sg[0], sg[1], sg[2], i < 5 ? shade(sg[3], 0.8) : sg[3]);
      if (i === 5) {
        if (robe) drawRobe(false);
        // torso light down the lit side, a belt, a buckle
        line([p.n[0] + 1, p.n[1] + 1], [p.hip[0] + 1, p.hip[1] - 1], 1.2, L.torsoL);
        line([p.hip[0] - 2.5, p.hip[1]], [p.hip[0] + 2.5, p.hip[1]], 1.2, L.belt);
        if (L.buckle && !o.back) dot(X(p.hip[0] + 1), Y(p.hip[1]), 1, L.buckle);
        if (L.apron && !o.back) line([p.hip[0] + 1.5, p.hip[1]], [p.hip[0] + 2, p.hip[1] + 7], 3, L.apron);
        if (L.collar) line([p.n[0] - 1, p.n[1]], [p.n[0] + 1.5, p.n[1]], 1.4, L.collar);
      }
    }
    if (look === 'wren' && !o.back && !o.lying && o.blades) {
      // the two knives, held low
      line(p.hf, [p.hf[0] + 1.5, p.hf[1] + 4], 1, L.blade);
      line(p.hb, [p.hb[0] - 1, p.hb[1] + 4], 1, shade(L.blade, 0.75));
    }
    head(false);

    function drawRobe(outline) {
      const hy = p.hip[1], hx = p.hip[0];
      const fy = Math.max(p.ff[1], p.fb[1]);
      const bot = Math.min(-0.5, fy + 0.5);
      for (let yy = hy; yy <= bot; yy += 1 / s) {
        const t = (yy - hy) / Math.max(1, bot - hy);
        const half = 2.6 + t * 2.2 + (outline ? 1 / s : 0);
        const col = outline ? L.out : (t > 0.85 ? (L.robeD || shade(L.robe, 0.7)) : L.robe);
        c.fillStyle = col;
        const xa = X(hx - half), xb = X(hx + half);
        c.fillRect(Math.min(xa, xb), Y(yy), Math.abs(xb - xa) + 1, Math.max(1, Math.round(s / 1)));
      }
    }
    function head(outline) {
      const hx = p.h[0], hy = p.h[1];
      if (outline) {
        R(hx - 4, hy - 5, 8, 9, L.out);
        if (L.head === 'mitre') R(hx - 3, hy - 11, 6, 7, L.out);
        if (L.head === 'bun') R(hx - 5, hy - 5, 4, 5, L.out);
        return;
      }
      const skinBlock = () => {
        if (o.back) return;
        R(hx - 1, hy - 1, 4, 4, L.skin);
        R(hx + 2, hy - 1, 1, 4, L.skinD);
        R(hx + 1, hy, 1, 1, '#1d1512');
      };
      if (o.back && L.head !== 'hood' && L.head !== 'cowl') {
        const col = L.helm || L.hair || L.cap || L.wig || L.mitre || L.skinD;
        R(hx - 3, hy - 4, 6, 8, col);
        R(hx - 3, hy - 4, 2, 1, shade(col, 1.2));
        if (L.head === 'cap' || L.head === 'helm') R(hx - 3, hy + 1, 6, 3, L.skinD);
        return;
      }
      switch (L.head) {
        case 'hood': case 'cowl':
          R(hx - 3, hy - 4, 6, 8, L.hood);
          R(hx - 3, hy - 4, 2, 1, L.hoodL); R(hx - 3, hy - 3, 1, 3, L.hoodL);
          if (o.front) {
            // face on: the opening in the middle of the hood
            R(hx - 2, hy - 2, 4, 5, L.hoodD);
            R(hx - 1, hy - 1, 3, 3, L.skin); R(hx - 1, hy - 1, 3, 1, L.skinD);
            R(hx - 1, hy, 1, 1, '#1d1512'); R(hx + 1, hy, 1, 1, '#1d1512');
          } else if (!o.back) {
            R(hx, hy - 2, 3, 5, L.hoodD);
            R(hx + 1, hy - 1, 2, 3, L.skin); R(hx + 1, hy - 1, 2, 1, L.skinD);
            R(hx + 2, hy, 1, 1, '#1d1512');
          } else R(hx - 1, hy - 3, 1, 6, L.hoodD);
          R(hx - 2, hy + 3, 5, 1, L.hoodD);
          break;
        case 'helm':
          R(hx - 3, hy - 1, 6, 5, L.skin); skinBlock();
          R(hx - 3, hy - 4, 6, 3, L.helm); R(hx - 3, hy - 4, 2, 1, shade(L.helm, 1.25));
          R(hx - 4, hy - 1, 8, 1, L.helmD);
          if (!o.back) R(hx + 1, hy - 1, 1, 3, L.helmD);
          break;
        case 'hair':
          R(hx - 3, hy - 3, 6, 7, L.skin); skinBlock();
          R(hx - 3, hy - 4, 6, 2, L.hair); R(hx - 3, hy - 2, 2, 4, L.hair);
          break;
        case 'cap':
          R(hx - 3, hy - 3, 6, 7, L.skin); skinBlock();
          R(hx - 3, hy - 4, 6, 3, L.cap); R(hx - 4, hy - 2, 2, 2, L.cap);
          break;
        case 'mitre':
          R(hx - 3, hy - 3, 6, 7, L.skin); skinBlock();
          R(hx - 3, hy - 3, 2, 3, '#cfc6b4');
          R(hx - 2, hy - 10, 4, 7, L.mitre); R(hx - 3, hy - 6, 6, 3, L.mitre);
          R(hx - 1, hy - 10, 1, 7, L.gold); R(hx - 3, hy - 4, 6, 1, L.gold);
          break;
        case 'wig':
          R(hx - 3, hy - 3, 6, 7, L.skin); skinBlock();
          R(hx - 4, hy - 4, 7, 2, L.wig); R(hx - 4, hy - 2, 3, 6, L.wig); R(hx - 4, hy + 1, 3, 1, L.wigD); R(hx - 4, hy + 3, 3, 1, L.wigD);
          break;
        case 'bun':
          R(hx - 3, hy - 3, 6, 7, L.skin); skinBlock();
          R(hx - 3, hy - 4, 6, 2, L.hair); R(hx - 3, hy - 2, 2, 3, L.hair); R(hx - 5, hy - 4, 3, 3, L.hair);
          R(hx - 2, hy - 5, 4, 1, L.gold);
          break;
      }
    }
  }

  function poseFor(name, ph) {
    if (name === 'walk') return walkPose(ph, 3.2);
    if (name === 'climb') return climbPose(ph);
    if (name === 'idle') {
      const b = Math.sin(ph * Math.PI * 2) * 0.35;
      const p = JSON.parse(JSON.stringify(P0.stand));
      p.h[1] += b; p.n[1] += b;
      return p;
    }
    return P0[name] || P0.stand;
  }

  // ---------- the facade ----------
  // Built once per level into two canvases the size of the whole building: the
  // wall behind (brick, piers, moss, cracks, windows) and the masonry in front
  // that she stands on.
  const art = {};
  function buildArt(li) {
    if (art[li]) return art[li];
    const L = LEVELS[li], w = parseLevel(L), A = L.art;
    const W = w.W * T, H = w.H * T;
    const rnd = rng(A.seed);
    const moss = valueNoise(rnd, 22), soot = valueNoise(rnd, 60), grain = valueNoise(rnd, 5);
    const bg = mk(W, H), b = bg.getContext('2d');
    const img = b.createImageData(W, H), d = img.data;
    const skyA = hex(A.sky[0]), skyB = hex(A.sky[1]);
    const sky = (x, y) => at(w, Math.floor(x / T), Math.floor(y / T)) === ' ';
    const period = 9 * T, pierW = 44;
    const pier = (X) => {
      const pos = (X + 20) % period;
      if (pos < pierW) return pos > pierW - 4 ? 0.86 : (pos < 3 ? 1.2 : 1.1);
      if (pos < pierW + 18) return 0.55 + 0.25 * ((pos - pierW) / 18);
      return 0.8;
    };
    const put = (X, Y, r, g, bl) => { const i = (Y * W + X) * 4; d[i] = r; d[i + 1] = g; d[i + 2] = bl; d[i + 3] = 255; };
    const stone = A.stone;
    for (let cy = 0; cy < H; cy += 8) {
      const pierRow = (cy / 8) | 0;
      let x = -Math.floor(rnd() * 18);
      while (x < W) {
        const inPier = pier(Math.max(0, x)) > 1;
        const bw = inPier ? 14 + Math.floor(rnd() * 12) : 9 + Math.floor(rnd() * 13);
        const lum = 0.8 + rnd() * 0.34, warm = (rnd() - 0.5) * 12;
        for (let py = 0; py < 8; py++) {
          const Y = cy + py;
          if (Y >= H) break;
          for (let px = 0; px < bw; px++) {
            const X = x + px;
            if (X < 0 || X >= W) continue;
            if (sky(X, Y)) continue;
            let f;
            let r, g, bl;
            if (py === 7 || px === bw - 1) {
              f = 0.32 + grain(X, Y) * 0.1;
              r = 60 * f / 0.35; g = 55 * f / 0.35; bl = 48 * f / 0.35;
              r *= 0.55; g *= 0.55; bl *= 0.55;
            } else {
              f = lum;
              if (py === 0) f *= 1.16;
              if (py === 6) f *= 0.8;
              if (px === 0) f *= 1.07;
              if (px === bw - 2) f *= 0.9;
              f *= 0.93 + grain(X, Y) * 0.14;
              if (rnd() < 0.05) f *= 0.88;
              r = stone[0] * f + warm; g = stone[1] * f + warm * 0.6; bl = stone[2] * f;
              const m = moss(X, Y);
              if (m > 1 - A.moss * 0.55 && py < 3 + (m > 0.9 ? 3 : 0) && rnd() < 0.55 + (m - 0.6)) {
                const k = rnd();
                if (k < 0.4) { r = 74; g = 90; bl = 44; } else if (k < 0.8) { r = 92; g = 110; bl = 52; } else { r = 118; g = 136; bl = 64; }
                f = 1;
              }
            }
            const light = pier(X) * (0.78 + 0.3 * (1 - Y / H)) * (0.85 + 0.25 * soot(X, Y));
            put(X, Y, Math.min(255, r * light), Math.min(255, g * light), Math.min(255, bl * light));
          }
        }
        x += bw;
      }
      void pierRow;
    }
    // sky
    const srnd = rng(A.seed + 5);
    for (let Y = 0; Y < H; Y++) {
      for (let X = 0; X < W; X++) {
        if (!sky(X, Y)) continue;
        const t = Y / Math.max(1, H * 0.2);
        const k = Math.min(1, t);
        let r = skyA[0] + (skyB[0] - skyA[0]) * k, g = skyA[1] + (skyB[1] - skyA[1]) * k, bl = skyA[2] + (skyB[2] - skyA[2]) * k;
        // Bayer-ish dither between bands, the way a 16-bit screen fakes a gradient
        if (((X + Y) & 1) && srnd() < 0.3) { r += 4; g += 4; bl += 6; }
        if (srnd() < 0.004) { r = 220; g = 218; bl = 200; }
        put(X, Y, r, g, bl);
      }
    }
    b.putImageData(img, 0, 0);

    // coping along the top of the wall where it meets the sky
    for (let y = 1; y < w.H; y++) for (let x = 0; x < w.W; x++) {
      if (at(w, x, y) !== ' ' && at(w, x, y - 1) === ' ') {
        b.fillStyle = shade(rgb(...stone), 1.25); b.fillRect(x * T, y * T, T, 2);
        b.fillStyle = shade(rgb(...stone), 0.55); b.fillRect(x * T, y * T + 2, T, 1);
        if (x % 2 === 0) { b.fillStyle = shade(rgb(...stone), 0.9); b.fillRect(x * T, y * T - 5, 7, 5); b.fillStyle = shade(rgb(...stone), 1.2); b.fillRect(x * T, y * T - 5, 7, 1); }
      }
    }

    // cracks: short random walks, dark with a lit edge
    for (let i = 0; i < w.W * w.H / 22; i++) {
      let x = Math.floor(rnd() * W), y = Math.floor(rnd() * H);
      if (sky(x, y)) continue;
      const len = 10 + rnd() * 40;
      for (let k = 0; k < len; k++) {
        b.fillStyle = 'rgba(20,17,14,0.75)'; b.fillRect(x, y, 1, 1);
        b.fillStyle = 'rgba(190,180,160,0.18)'; b.fillRect(x + 1, y, 1, 1);
        y += 1; x += rnd() < 0.33 ? -1 : rnd() < 0.5 ? 1 : 0;
        if (rnd() < 0.08) x += rnd() < 0.5 ? -2 : 2;
      }
    }
    // hanging vines on the wall (decoration, not climbable)
    const leaf = ['#34461f', '#46602a', '#5f7d35', '#7e9a45'];
    for (let i = 0; i < w.W * 0.45 * A.moss; i++) {
      let x = Math.floor(rnd() * W), y = Math.floor(rnd() * H * 0.8);
      if (sky(x, y)) continue;
      const len = 20 + rnd() * 90;
      for (let k = 0; k < len; k++) {
        b.fillStyle = '#26331a'; b.fillRect(x, y, 1, 1);
        if (rnd() < 0.3) { b.fillStyle = leaf[(rnd() * 4) | 0]; b.fillRect(x + (rnd() < 0.5 ? -1 : 1), y, 2, 2); }
        y++; if (rnd() < 0.3) x += rnd() < 0.5 ? -1 : 1;
      }
    }
    // soft shade under every ledge and block, and moss dripping from it
    for (let y = 0; y < w.H; y++) for (let x = 0; x < w.W; x++) {
      const c = at(w, x, y);
      if ((c === '=' || c === '#' || c === '-') && at(w, x, y + 1) !== '#') {
        const top = c === '#' ? (y + 1) * T : y * T + (c === '=' ? 6 : 4);
        for (let k = 0; k < 7; k++) { b.fillStyle = 'rgba(12,10,8,' + (0.42 - k * 0.06) + ')'; b.fillRect(x * T - (c === '-' ? -2 : 0), top + k, c === '-' ? 12 : T, 1); }
        if (c === '=' && rnd() < A.moss) {
          const mx = x * T + Math.floor(rnd() * 12), ml = 3 + rnd() * 10;
          for (let k = 0; k < ml; k++) { b.fillStyle = leaf[(rnd() * 3) | 0]; b.fillRect(mx + (k % 3 === 0 ? 1 : 0), top + k, 1, 1); }
        }
      }
    }
    // arrow slits, alcoves, torch brackets, sparrow marks, windows
    for (let y = 0; y < w.H; y++) for (let x = 0; x < w.W; x++) {
      const dc = w.deco[y][x], X = x * T, Y = y * T;
      if (dc === 'w') {
        b.fillStyle = shade(rgb(...stone), 1.15); b.fillRect(X + 5, Y - 6, 6, 18);
        b.fillStyle = shade(rgb(...stone), 0.7); b.fillRect(X + 10, Y - 6, 1, 18);
        b.fillStyle = '#0d0b0a'; b.fillRect(X + 7, Y - 4, 2, 14);
        b.fillStyle = '#211c18'; b.fillRect(X + 6, Y + 2, 4, 2);
      } else if (dc === 'S') {
        // an iron pole for a banner, with a shadow on the wall behind where it hangs
        b.fillStyle = 'rgba(0,0,0,0.28)'; b.fillRect(X + 3, Y - 12, 12, 26);
        b.fillStyle = '#1e1a18'; b.fillRect(X, Y - 16, T, 2); b.fillRect(X + 1, Y - 18, 2, 5); b.fillRect(X + T - 3, Y - 18, 2, 5);
        b.fillStyle = '#5a5450'; b.fillRect(X, Y - 16, T, 1);
      } else if (dc === 't') {
        b.fillStyle = '#231a14'; b.fillRect(X + 7, Y + 6, 2, 6); b.fillRect(X + 5, Y + 11, 6, 2);
        b.fillStyle = '#4a3322'; b.fillRect(X + 6, Y + 3, 4, 4);
      } else if (dc === 'C') {
        // the sparrow: the thieves' sign, chalked at head height
        b.fillStyle = '#d9d3c4';
        const sx = X + 4, sy = Y - 8;
        [[0, 2], [1, 1], [2, 2], [3, 2], [4, 1], [5, 1], [6, 0], [2, 3], [3, 3], [4, 3], [3, 4], [1, 4]].forEach(([a, c]) => b.fillRect(sx + a, sy + c, 1, 1));
      } else if (dc && '123456789T'.includes(dc)) {
        drawWindowArt(b, X, Y, dc === 'T', L.rooms[dc] && L.rooms[dc].locked, stone);
      }
    }

    // the front layer: masonry, cornices, cracks to hold, ivy
    const fg = mk(W, H), f = fg.getContext('2d');
    const frnd = rng(A.seed + 99);
    for (let y = 0; y < w.H; y++) for (let x = 0; x < w.W; x++) {
      const c = at(w, x, y), X = x * T, Y = y * T;
      if (c === '#') {
        const topOpen = at(w, x, y - 1) !== '#';
        for (let r = 0; r < 2; r++) {
          const off = ((y * 2 + r) % 2) * 8;
          for (let k = -1; k < 2; k++) {
            const bx = X + k * 16 + off, by = Y + r * 8;
            const lum = 0.8 + frnd() * 0.2;
            f.fillStyle = shade(rgb(stone[0] * 1.08, stone[1] * 1.05, stone[2] * 1.0), lum);
            const x0 = Math.max(X, bx), x1 = Math.min(X + T, bx + 16);
            if (x1 <= x0) continue;
            f.fillRect(x0, by, x1 - x0, 8);
            f.fillStyle = 'rgba(255,245,220,0.12)'; f.fillRect(x0, by, x1 - x0, 1);
            f.fillStyle = 'rgba(0,0,0,0.35)'; f.fillRect(x0, by + 7, x1 - x0, 1);
            if (bx + 15 >= X && bx + 15 < X + T) { f.fillStyle = 'rgba(0,0,0,0.45)'; f.fillRect(bx + 15, by, 1, 8); }
          }
        }
        for (let k = 0; k < 18; k++) { f.fillStyle = frnd() < 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.06)'; f.fillRect(X + ((frnd() * T) | 0), Y + ((frnd() * T) | 0), 1, 1); }
        if (topOpen) {
          f.fillStyle = shade(rgb(...stone), 1.45); f.fillRect(X, Y, T, 2);
          f.fillStyle = shade(rgb(...stone), 1.15); f.fillRect(X, Y + 2, T, 1);
          for (let k = 0; k < 5; k++) if (frnd() < A.moss) { f.fillStyle = leaf[(frnd() * 4) | 0]; f.fillRect(X + ((frnd() * 15) | 0), Y + (frnd() < 0.5 ? 0 : 1), 2, 1); }
        }
        if (at(w, x - 1, y) !== '#') { f.fillStyle = 'rgba(255,240,210,0.14)'; f.fillRect(X, Y, 1, T); }
        if (at(w, x + 1, y) !== '#') { f.fillStyle = 'rgba(0,0,0,0.4)'; f.fillRect(X + T - 2, Y, 2, T); }
      } else if (c === '=') {
        // a cornice: pale worn top, a darker face, a lip of shadow
        const L0 = at(w, x - 1, y) !== '=', R0 = at(w, x + 1, y) !== '=';
        const top = shade(rgb(stone[0] * 1.5, stone[1] * 1.42, stone[2] * 1.28), 0.95 + frnd() * 0.08);
        f.fillStyle = top; f.fillRect(X, Y, T, 2);
        f.fillStyle = shade(rgb(stone[0] * 1.28, stone[1] * 1.2, stone[2] * 1.08), 0.95 + frnd() * 0.06); f.fillRect(X, Y + 2, T, 3);
        f.fillStyle = shade(rgb(...stone), 0.6); f.fillRect(X, Y + 5, T, 1);
        f.fillStyle = 'rgba(0,0,0,0.3)'; f.fillRect(X, Y + 6, T, 1);
        const seam = 3 + ((frnd() * 10) | 0);
        f.fillStyle = 'rgba(30,24,18,0.7)'; f.fillRect(X + seam, Y + 1, 1, 5);
        f.fillStyle = 'rgba(255,248,230,0.2)'; f.fillRect(X + seam + 1, Y + 1, 1, 4);
        for (let k = 0; k < 6; k++) { f.fillStyle = frnd() < 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.1)'; f.fillRect(X + ((frnd() * T) | 0), Y + ((frnd() * 5) | 0), 1, 1); }
        if (frnd() < A.moss * 0.8) { f.fillStyle = leaf[(frnd() * 4) | 0]; f.fillRect(X + ((frnd() * 13) | 0), Y, 3, 1); }
        if (L0) { f.fillStyle = 'rgba(255,245,225,0.25)'; f.fillRect(X, Y, 1, 5); }
        if (R0) { f.fillStyle = 'rgba(0,0,0,0.45)'; f.fillRect(X + T - 1, Y, 1, 6); }
      } else if (c === '-') {
        f.fillStyle = shade(rgb(stone[0] * 1.35, stone[1] * 1.3, stone[2] * 1.2), 1); f.fillRect(X + 2, Y, 12, 2);
        f.fillStyle = shade(rgb(...stone), 0.95); f.fillRect(X + 2, Y + 2, 12, 2);
        f.fillStyle = shade(rgb(...stone), 0.5); f.fillRect(X + 2, Y + 4, 12, 1);
        f.fillStyle = 'rgba(0,0,0,0.5)'; f.fillRect(X + 13, Y, 1, 5);
      } else if (c === '|') {
        f.fillStyle = '#1f2915'; f.fillRect(X + 7, Y, 2, T);
        f.fillRect(X + 5 + ((frnd() * 3) | 0), Y + 4, 1, 6);
        for (let k = 0; k < 26; k++) {
          const lx = X + 1 + ((frnd() * 13) | 0), ly = Y + ((frnd() * 15) | 0);
          f.fillStyle = leaf[(frnd() * 4) | 0]; f.fillRect(lx, ly, 2, 2);
          f.fillStyle = '#1b2412'; f.fillRect(lx + 1, ly + 2, 1, 1);
        }
        for (let k = 0; k < 4; k++) { f.fillStyle = '#9ab25a'; f.fillRect(X + 2 + ((frnd() * 11) | 0), Y + ((frnd() * 15) | 0), 1, 1); }
      }
    }
    // A margin all round, so the camera can keep her in the middle of the screen even
    // at the top, the foot or the ends of the building: the stonework carries on
    // (mirrored) to either side, the night sky above, the canal or street below.
    const PX = 13 * T, PY = 8 * T, W2 = W + 2 * PX, H2 = H + 2 * PY;
    const pad = (src, sky) => {
      const cv = mk(W2, H2), c = cv.getContext('2d');
      if (sky) {
        const g = c.createLinearGradient(0, 0, 0, PY + T * 3);
        g.addColorStop(0, A.sky[0]); g.addColorStop(1, A.sky[1]);
        c.fillStyle = g; c.fillRect(0, 0, W2, H2);
        const sr = rng(A.seed + 7);
        for (let k = 0; k < W2 / 12; k++) { c.fillStyle = 'rgba(220,218,200,' + (0.4 + sr() * 0.5) + ')'; c.fillRect((sr() * W2) | 0, (sr() * PY) | 0, 1, 1); }
      }
      c.drawImage(src, PX, PY);
      c.save(); c.translate(PX, 0); c.scale(-1, 1); c.drawImage(src, 0, 0, PX, H, 0, PY, PX, H); c.restore();
      c.save(); c.translate(W2, 0); c.scale(-1, 1); c.drawImage(src, W - PX, 0, PX, H, 0, PY, PX, H); c.restore();
      for (let y = PY + H; y < H2; y += T) c.drawImage(cv, 0, PY + H - T, W2, T, 0, y, W2, T);
      if (sky) {
        // battlements along the top of the wall, all the way across
        for (let x = 0; x < W2; x += T) {
          const mx = Math.floor((x - PX) / T), top = at(w, Math.max(0, Math.min(w.W - 1, mx)), 0);
          if (top === ' ') continue;
          c.fillStyle = shade(rgb(...stone), 0.9); c.fillRect(x, PY - 6, 8, 6);
          c.fillStyle = shade(rgb(...stone), 1.25); c.fillRect(x, PY - 6, 8, 1);
          c.fillStyle = shade(rgb(...stone), 1.3); c.fillRect(x, PY, T, 2);
        }
      }
      return cv;
    };
    art[li] = { bg: pad(bg, true), fg: pad(fg, false), W: W2, H: H2, ox: PX, oy: PY };
    return art[li];
  }

  function drawWindowArt(b, X, Y, isTarget, locked, stone) {
    // An arched opening two cells tall, sill at her feet.
    const cx = X + 8, top = Y - 20, bot = Y + 15, wdt = isTarget ? 14 : 12;
    const lx = cx - wdt / 2;
    b.fillStyle = shade(rgb(...stone), 1.3);
    b.fillRect(lx - 3, top + 2, wdt + 6, bot - top);
    b.fillRect(lx - 1, top - 1, wdt + 2, 4);
    b.fillStyle = shade(rgb(...stone), 0.7);
    b.fillRect(lx + wdt + 2, top + 3, 1, bot - top - 2);
    // voussoir joints
    b.fillStyle = 'rgba(30,24,18,0.6)';
    b.fillRect(lx - 3, top + 8, 3, 1); b.fillRect(lx + wdt, top + 8, 3, 1); b.fillRect(cx, top - 1, 1, 3);
    // the opening
    const g = b.createLinearGradient(0, top, 0, bot);
    if (locked) { g.addColorStop(0, '#3a2819'); g.addColorStop(1, '#241810'); }
    else if (isTarget) { g.addColorStop(0, '#f4c870'); g.addColorStop(0.5, '#c0602a'); g.addColorStop(1, '#5a2014'); }
    else { g.addColorStop(0, '#f0c070'); g.addColorStop(0.6, '#b36a2c'); g.addColorStop(1, '#4a2614'); }
    b.fillStyle = g;
    b.fillRect(lx, top + 3, wdt, bot - top - 4);
    b.fillRect(lx + 2, top + 1, wdt - 4, 2);
    if (locked) {
      b.fillStyle = '#5a3c24';
      for (let k = 0; k < wdt; k += 3) b.fillRect(lx + k, top + 3, 2, bot - top - 4);
      b.fillStyle = '#2a2a2e'; b.fillRect(lx - 1, top + 14, wdt + 2, 2); b.fillRect(lx - 1, top + 24, wdt + 2, 2);
    } else {
      b.fillStyle = 'rgba(40,24,14,0.85)';
      b.fillRect(cx - 1, top + 2, 1, bot - top - 3); b.fillRect(lx, top + 14, wdt, 1);
      b.fillStyle = 'rgba(255,240,200,0.35)'; b.fillRect(lx + 1, top + 4, 2, 8);
      if (isTarget) {
        // leaded panes of coloured glass
        b.fillStyle = 'rgba(150,30,30,0.45)'; b.fillRect(lx + 1, top + 16, 4, 6);
        b.fillStyle = 'rgba(40,70,140,0.45)'; b.fillRect(cx + 1, top + 5, 5, 7);
      }
      // open shutters
      b.fillStyle = '#4a3322'; b.fillRect(lx - 7, top + 5, 4, bot - top - 7); b.fillRect(lx + wdt + 3, top + 5, 4, bot - top - 7);
      b.fillStyle = '#6a4a30'; b.fillRect(lx - 7, top + 5, 1, bot - top - 7); b.fillRect(lx + wdt + 3, top + 5, 1, bot - top - 7);
    }
    // sill
    b.fillStyle = shade(rgb(...stone), 1.45); b.fillRect(lx - 4, bot - 1, wdt + 8, 2);
    b.fillStyle = 'rgba(0,0,0,0.4)'; b.fillRect(lx - 4, bot + 1, wdt + 8, 2);
  }

  // ---------- rooms ----------
  const THEMES = {
    abbey: { wall: '#6d6558', wallD: '#4e473d', wallL: '#8a8170', beam: '#3a2a1e', floor: '#5a3e2a', floorD: '#3f2b1d', trim: '#2c2018' },
    assize: { wall: '#3d4a3a', wallD: '#2c3629', wallL: '#56644f', beam: '#2e2016', floor: '#4a3322', floorD: '#33231a', trim: '#5a3a24', panel: '#5a3a22', panelD: '#3e2716' },
    keep: { wall: '#6a4b3e', wallD: '#4b342b', wallL: '#86604e', beam: '#2b1f18', floor: '#4f3a2c', floorD: '#35271d', trim: '#2a1c14', tapestry: '#6b2a2a' },
  };
  // How much room each piece of furniture takes: half-width and its top.
  const SPOT = {
    desk: { hw: 30, top: 146, verb: 'search' }, shelf: { hw: 20, top: 96, verb: 'search' },
    painting: { hw: 17, top: 62, bot: 100, verb: 'search' }, chest: { hw: 17, top: 162, verb: 'search' },
    bed: { hw: 36, top: 150, verb: 'none' }, wardrobe: { hw: 18, top: 92, verb: 'hide' },
    curtain: { hw: 12, top: 30, verb: 'hide' }, candle: { hw: 7, top: 136, verb: 'snuff' },
    fireplace: { hw: 30, top: 120, verb: 'none' }, bell: { hw: 18, top: 80, bot: 104, verb: 'bell' }, bigbell: { hw: 40, top: 20, verb: 'none' },
    strongbox: { hw: 15, top: 160, verb: 'search' }, rack: { hw: 16, top: 104, bot: 128, verb: 'search' },
    knives: { hw: 12, top: 98, bot: 124, verb: 'search' },
    lectern: { hw: 11, top: 138, verb: 'none' }, balcony: { hw: 20, top: 74, verb: 'none' },
    barrel: { hw: 11, top: 154, verb: 'search' }, table: { hw: 26, top: 156, verb: 'search' },
    altar: { hw: 26, top: 146, verb: 'search' }, cabinet: { hw: 17, top: 124, verb: 'search' },
    window: { hw: 20, top: 60, verb: 'exit' },
  };

  // A room is a box seen from the front, the way the old point-and-click
  // adventures drew them: a back wall, two side walls, and a floor you walk
  // about on. A place on the floor is (u, v): u runs across from the left wall
  // (0) to the right (1); v runs from the back wall (0) toward you. Everything is
  // drawn at the scale k of its depth — furniture at k, people at 2k — and one
  // eye height (EYE) keeps the walls, floor and ceiling in true perspective.
  const HORIZON = 60, EYE = 85, WALL_H = 141;
  const depthK = (v) => 0.75 + 1.04 * v;
  const proj = (u, v, h) => { const k = depthK(v); return { x: VW / 2 + (u - 0.5) * VW * k, y: HORIZON + k * (EYE - (h || 0)), k }; };
  const kAtX = (x) => (VW / 2 - x) / (VW / 2);            // left wall: the depth scale at screen column x
  const V_MIN = 0.09, V_MAX = 0.66;                       // where she can stand
  const FX = 300, FY = 110;                               // floor distances, roughly in pixels
  const fdist = (a, b) => Math.hypot((a.u - b.u) * FX, (a.v - b.v) * FY);
  const WIN = { v0: 0.03, v1: 0.2, h0: 46, h1: 116 };     // the window she came in by, on the left wall
  const DOOR = { v0: 0.03, v1: 0.19, h1: 100 };           // the door, on the right wall
  const DOOR_V = (DOOR.v0 + DOOR.v1) / 2;
  const CLIMB_IN = 1.2;                                   // seconds to climb in over the sill
  const PEEK_AT = 0.65;                                   // how much of that is left when she stops to peek
  const SILL = { u: 0.5 };                                // where she climbs in: the middle of the front

  const roomBgs = {};
  function roomBg(theme) {
    if (roomBgs[theme]) return roomBgs[theme];
    const cv = mk(VW, VH), c = cv.getContext('2d');
    const th = THEMES[theme];
    const r = rng(theme.length * 131 + 7);
    const back = proj(0, 0), backR = proj(1, 0), top = proj(0, 0, WALL_H).y;
    // ceiling, with one beam across it
    c.fillStyle = shade(th.beam, 0.8); c.fillRect(0, 0, VW, VH);
    const bm = proj(0, 0.2, WALL_H).y;
    c.fillStyle = th.beam; c.fillRect(0, Math.round(bm) - 4, VW, 6);
    c.fillStyle = shade(th.beam, 1.35); c.fillRect(0, Math.round(bm) - 4, VW, 1);
    // back wall
    wallTexture(c, theme, Math.round(back.x), Math.round(top), Math.round(backR.x - back.x), Math.round(back.y - top), r);
    // side walls, a column at a time, each at its own depth
    for (let side = 0; side < 2; side++) {
      for (let i = 0; i < Math.round(back.x); i++) {
        const x = side ? VW - 1 - i : i;
        const k = kAtX(i);
        const v = (k - 0.75) / 1.04;
        const y0 = Math.round(HORIZON + k * (EYE - WALL_H)), y1 = Math.round(HORIZON + k * EYE);
        const dim = side ? 0.6 : 0.72;
        c.fillStyle = shade(th.wall, dim); c.fillRect(x, y0, 1, y1 - y0);
        // courses and joints, converging on the back wall
        c.fillStyle = shade(th.wall, dim * 0.72);
        if (theme === 'abbey') {
          for (let h = 12; h < WALL_H; h += 12) c.fillRect(x, Math.round(HORIZON + k * (EYE - h)), 1, 1);
          if (Math.floor(v * 40) !== Math.floor(((VW / 2 - (i + 1)) / (VW / 2) - 0.75) / 1.04 * 40)) c.fillRect(x, y0, 1, y1 - y0);
        } else if (theme === 'assize') {
          const py = Math.round(HORIZON + k * (EYE - 74));
          c.fillStyle = shade(th.panel, dim); c.fillRect(x, py, 1, y1 - py);
          c.fillStyle = shade(th.panel, dim * 1.4); c.fillRect(x, py, 1, 2);
        } else if (r() < 0.5) c.fillRect(x, y0 + ((r() * (y1 - y0)) | 0), 1, 1);
        // skirting
        c.fillStyle = th.trim; c.fillRect(x, y1 - Math.round(4 * k), 1, Math.round(4 * k));
        // the window on the left wall, the door on the right
        if (!side && v >= WIN.v0 && v <= WIN.v1) {
          const wy0 = Math.round(HORIZON + k * (EYE - WIN.h1)), wy1 = Math.round(HORIZON + k * (EYE - WIN.h0));
          const edge = v - WIN.v0 < 0.012 || WIN.v1 - v < 0.012;
          c.fillStyle = edge ? shade(th.wall, 0.45) : '#141a2a'; c.fillRect(x, wy0, 1, wy1 - wy0);
          if (!edge) {
            for (let yy = wy0; yy < wy1; yy++) if (r() < 0.012) { c.fillStyle = '#c8c6b8'; c.fillRect(x, yy, 1, 1); }
            c.fillStyle = '#1e2536'; c.fillRect(x, wy1 - Math.round((wy1 - wy0) * 0.3), 1, Math.round((wy1 - wy0) * 0.3));
            c.fillStyle = '#2a2018'; c.fillRect(x, Math.round((wy0 + wy1) / 2), 1, 2);
            if (Math.abs(v - (WIN.v0 + WIN.v1) / 2) < 0.006) c.fillRect(x, wy0, 1, wy1 - wy0);
          }
          c.fillStyle = shade(th.wall, 1.3); c.fillRect(x, wy1, 1, 2);
        }
        if (side && v >= DOOR.v0 && v <= DOOR.v1) {
          const dy0 = Math.round(HORIZON + k * (EYE - DOOR.h1));
          const edge = v - DOOR.v0 < 0.01 || DOOR.v1 - v < 0.01;
          c.fillStyle = edge ? shade(th.wall, 0.35) : (Math.floor(v * 90) % 2 ? '#3e2a1c' : '#4a3222'); c.fillRect(x, dy0, 1, y1 - dy0);
          if (!edge) { c.fillStyle = '#26262a'; c.fillRect(x, Math.round(HORIZON + k * (EYE - 80)), 1, 2); c.fillRect(x, Math.round(HORIZON + k * (EYE - 25)), 1, 2); }
          if (Math.abs(v - DOOR.v0 - 0.03) < 0.004) { c.fillStyle = '#b09050'; c.fillRect(x, Math.round(HORIZON + k * (EYE - 48)), 1, 2); }
        }
      }
    }
    // the floor: boards running away from you, butt joints staggered
    const N = 13;
    for (let y = Math.round(back.y); y < VH; y++) {
      const k = (y - HORIZON) / EYE, v = (k - 0.75) / 1.04;
      const w = VW * k, xl = VW / 2 - w / 2;
      for (let i = 0; i < N; i++) {
        const xa = Math.max(0, Math.round(xl + w * i / N)), xb = Math.min(VW, Math.round(xl + w * (i + 1) / N));
        if (xb <= xa) continue;
        const off = ((i * 37) % 10) / 10;
        const seg = Math.floor(v * 3.2 + off), prev = Math.floor((v - 1 / (EYE * 1.04)) * 3.2 + off);
        const lum = 0.82 + (((i * 7 + seg * 13) % 9) / 9) * 0.3;
        c.fillStyle = seg !== prev ? th.floorD : shade(th.floor, lum * (0.8 + v * 0.3));
        c.fillRect(xa, y, xb - xa, 1);
        c.fillStyle = th.floorD; c.fillRect(xa, y, 1, 1);
      }
    }
    // skirting along the back wall
    c.fillStyle = th.trim; c.fillRect(Math.round(back.x), Math.round(back.y) - 3, Math.round(backR.x - back.x), 3);
    c.fillStyle = shade(th.trim, 1.6); c.fillRect(Math.round(back.x), Math.round(back.y) - 3, Math.round(backR.x - back.x), 1);
    // corners
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.fillRect(Math.round(back.x) - 1, Math.round(top), 2, Math.round(back.y - top));
    c.fillRect(Math.round(backR.x) - 1, Math.round(top), 2, Math.round(back.y - top));
    // moonlight from the window, laid across the floor
    const a = proj(0, WIN.v0 + 0.02), b = proj(0, WIN.v1 - 0.02), a2 = proj(0.45, WIN.v0 + 0.18), b2 = proj(0.55, WIN.v1 + 0.3);
    c.fillStyle = 'rgba(160,180,230,0.07)';
    c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(a2.x, a2.y); c.lineTo(b2.x, b2.y); c.lineTo(b.x, b.y); c.closePath(); c.fill();
    roomBgs[theme] = cv;
    return cv;
  }

  // The back wall's pattern, in a rectangle at the back wall's scale (0.75).
  function wallTexture(c, theme, X, Y, W, H, r) {
    const th = THEMES[theme];
    c.fillStyle = th.wall; c.fillRect(X, Y, W, H);
    if (theme === 'abbey') {
      for (let y = Y; y < Y + H; y += 9) {
        let x = X - (((y - Y) / 9) % 2) * 10;
        while (x < X + W) {
          const bw = 16 + ((r() * 11) | 0), x0 = Math.max(X, x), x1 = Math.min(X + W, x + bw);
          c.fillStyle = shade(th.wall, 0.86 + r() * 0.24); c.fillRect(x0 + 1, y + 1, x1 - x0 - 1, 8);
          c.fillStyle = shade(th.wall, 1.18); c.fillRect(x0 + 1, y + 1, x1 - x0 - 1, 1);
          c.fillStyle = th.wallD; c.fillRect(x0, y, x1 - x0, 1); c.fillRect(x0, y, 1, 9);
          x += bw;
        }
      }
    } else if (theme === 'assize') {
      const py = Y + H - Math.round(74 * 0.75);
      for (let x = X; x < X + W; x += 2) { c.fillStyle = ((x - X) / 2) % 6 < 3 ? th.wall : shade(th.wall, 0.9); c.fillRect(x, Y, 2, py - Y); }
      for (let y = Y + 6; y < py - 4; y += 11) for (let x = X + 4; x < X + W; x += 15) { c.fillStyle = th.wallL; c.fillRect(x + (((y - Y) / 11) % 2) * 7, y, 2, 2); }
      c.fillStyle = th.panel; c.fillRect(X, py, W, Y + H - py);
      for (let x = X + 3; x < X + W - 26; x += 30) {
        c.fillStyle = th.panelD; c.fillRect(x, py + 6, 26, Y + H - py - 12);
        c.fillStyle = shade(th.panel, 1.15); c.fillRect(x + 2, py + 8, 22, Y + H - py - 16);
      }
      c.fillStyle = shade(th.panel, 1.4); c.fillRect(X, py, W, 2);
    } else {
      for (let k = 0; k < 700; k++) { c.fillStyle = r() < 0.5 ? shade(th.wall, 0.92) : shade(th.wall, 1.07); c.fillRect(X + ((r() * W) | 0), Y + ((r() * H) | 0), 2, 1); }
      // a tapestry of wheat sheaves, faded
      const tx = X + Math.round(W / 2) - 32, ty = Y + 8;
      c.fillStyle = '#3a1818'; c.fillRect(tx, ty, 64, 76);
      c.fillStyle = th.tapestry; c.fillRect(tx + 2, ty + 2, 60, 70);
      c.fillStyle = '#8a3a30'; c.fillRect(tx + 2, ty + 2, 60, 3); c.fillRect(tx + 2, ty + 66, 60, 6);
      for (let k = 0; k < 4; k++) {
        const sx = tx + 10 + k * 14;
        c.fillStyle = '#b08a3e'; c.fillRect(sx, ty + 20, 2, 34);
        for (let j = 0; j < 5; j++) { c.fillRect(sx - 2, ty + 17 + j * 4, 2, 2); c.fillRect(sx + 2, ty + 19 + j * 4, 2, 2); }
      }
      c.fillStyle = '#c9a44a'; for (let x = tx + 2; x < tx + 62; x += 4) c.fillRect(x, ty + 72, 2, 4);
    }
  }

  function drawSpot(c, sp, tm, theme, dark) {
    const k = sp.kind, x = Math.round(sp.x), done = sp.done;
    const F = FLOOR;
    const wood = '#5a3a24', woodL = '#7a5234', woodD = '#3a2416';
    switch (k) {
      case 'desk':
        c.fillStyle = woodD; c.fillRect(x - 28, F - 30, 4, 30); c.fillRect(x + 24, F - 30, 4, 30);
        c.fillStyle = wood; c.fillRect(x - 30, F - 34, 60, 6); c.fillStyle = woodL; c.fillRect(x - 30, F - 34, 60, 1);
        c.fillStyle = woodD; c.fillRect(x + 4, F - 28, 20, 12);
        c.fillStyle = wood; c.fillRect(x + 5, F - 27, 18, 10);
        c.fillStyle = '#b09050'; c.fillRect(x + 13, F - 23, 2, 2);
        if (done) { c.fillStyle = wood; c.fillRect(x + 8, F - 20, 22, 8); c.fillStyle = woodD; c.fillRect(x + 8, F - 13, 22, 1); }
        // papers, a quill, an inkpot
        c.fillStyle = '#d8d0b8'; c.fillRect(x - 20, F - 36, 14, 2); c.fillRect(x - 16, F - 37, 10, 1);
        c.fillStyle = '#1c1a1e'; c.fillRect(x + 6, F - 38, 4, 4);
        c.fillStyle = '#e8e2d0'; c.fillRect(x + 9, F - 45, 1, 8); c.fillRect(x + 10, F - 46, 1, 3);
        break;
      case 'shelf': {
        c.fillStyle = woodD; c.fillRect(x - 20, F - 88, 40, 88);
        c.fillStyle = wood; c.fillRect(x - 18, F - 86, 36, 84);
        const rr = rng(x);
        for (let s = 0; s < 4; s++) {
          const sy = F - 84 + s * 21;
          c.fillStyle = woodD; c.fillRect(x - 18, sy + 17, 36, 3);
          let bx = x - 17;
          while (bx < x + 15) {
            const bw = 2 + ((rr() * 3) | 0), bh = 11 + ((rr() * 6) | 0);
            if (done && s === 1 && bx > x - 4 && bx < x + 8) { bx += bw; continue; }
            c.fillStyle = ['#6b2d2a', '#2d4a3a', '#4a3a24', '#2a3450', '#7a6a4a', '#5a2a4a'][(rr() * 6) | 0];
            c.fillRect(bx, sy + 17 - bh, bw, bh);
            c.fillStyle = 'rgba(255,230,180,0.25)'; c.fillRect(bx, sy + 17 - bh + 2, bw, 1);
            bx += bw + (rr() < 0.2 ? 2 : 0);
          }
        }
        c.fillStyle = woodL; c.fillRect(x - 20, F - 88, 40, 2);
        break;
      }
      case 'painting':
        if (done) {
          c.fillStyle = '#1b1614'; c.fillRect(x - 8, 70, 16, 18);
          c.fillStyle = '#2d2a28'; c.fillRect(x - 8, 70, 16, 2);
          c.save(); c.translate(x + 6, 62); c.rotate(0.22); c.translate(-(x + 6), -62);
        }
        c.fillStyle = '#8a6a2a'; c.fillRect(x - 16, 62, 32, 36);
        c.fillStyle = '#c9a13e'; c.fillRect(x - 16, 62, 32, 2); c.fillRect(x - 16, 62, 2, 36);
        c.fillStyle = '#3a4a3a'; c.fillRect(x - 12, 66, 24, 28);
        c.fillStyle = '#5a6a48'; c.fillRect(x - 12, 82, 24, 12);
        c.fillStyle = '#c8b890'; c.fillRect(x - 3, 70, 6, 8);
        c.fillStyle = '#6b2a2a'; c.fillRect(x - 4, 76, 8, 14);
        c.fillStyle = '#d8c8a0'; c.fillRect(x - 2, 71, 4, 4);
        if (done) c.restore();
        break;
      case 'chest':
        c.fillStyle = woodD; c.fillRect(x - 17, F - 22, 34, 22);
        c.fillStyle = wood; c.fillRect(x - 16, F - 21, 32, 20);
        c.fillStyle = '#3a3a3e'; c.fillRect(x - 12, F - 22, 3, 22); c.fillRect(x + 9, F - 22, 3, 22);
        if (done) {
          c.fillStyle = woodD; c.fillRect(x - 17, F - 36, 34, 3); c.fillStyle = wood; c.fillRect(x - 16, F - 34, 32, 12);
          c.fillStyle = '#140e0a'; c.fillRect(x - 15, F - 22, 30, 3);
        } else {
          c.fillStyle = woodL; c.fillRect(x - 17, F - 26, 34, 5); c.fillStyle = '#3a3a3e'; c.fillRect(x - 12, F - 26, 3, 5); c.fillRect(x + 9, F - 26, 3, 5);
          c.fillStyle = '#b09050'; c.fillRect(x - 2, F - 21, 4, 4);
        }
        break;
      case 'bed':
        c.fillStyle = woodD; c.fillRect(x - 36, F - 40, 6, 40); c.fillRect(x + 30, F - 26, 6, 26);
        c.fillStyle = wood; c.fillRect(x - 36, F - 40, 6, 3);
        c.fillStyle = woodD; c.fillRect(x - 32, F - 16, 64, 10);
        c.fillStyle = '#d8d0c0'; c.fillRect(x - 30, F - 22, 60, 6);
        c.fillStyle = '#e8e2d4'; c.fillRect(x - 30, F - 26, 12, 5);
        c.fillStyle = theme === 'keep' ? '#5a2a2a' : theme === 'assize' ? '#2e3e5a' : '#6a5a3a'; c.fillRect(x - 16, F - 23, 46, 8);
        c.fillStyle = 'rgba(255,255,255,0.15)'; c.fillRect(x - 16, F - 23, 46, 1);
        break;
      case 'wardrobe':
        c.fillStyle = woodD; c.fillRect(x - 18, F - 92, 36, 92);
        c.fillStyle = wood; c.fillRect(x - 16, F - 88, 15, 84); c.fillRect(x + 1, F - 88, 15, 84);
        c.fillStyle = woodL; c.fillRect(x - 18, F - 92, 36, 3);
        c.fillStyle = woodD; c.fillRect(x - 13, F - 80, 9, 30); c.fillRect(x + 4, F - 80, 9, 30); c.fillRect(x - 13, F - 42, 9, 30); c.fillRect(x + 4, F - 42, 9, 30);
        c.fillStyle = '#b09050'; c.fillRect(x - 3, F - 50, 2, 3); c.fillRect(x + 1, F - 50, 2, 3);
        if (sp.occupied) { c.fillStyle = '#140e0a'; c.fillRect(x - 1, F - 88, 2, 84); }
        break;
      case 'curtain': {
        const col = theme === 'assize' ? '#2a4a3a' : theme === 'keep' ? '#6a2424' : '#4a3a5a';
        c.fillStyle = '#2a2018'; c.fillRect(x - 16, 26, 32, 3);
        for (let i = -12; i < 12; i += 4) {
          c.fillStyle = shade(col, 0.8 + ((i + 12) % 8) * 0.05); c.fillRect(x + i, 29, 4, F - 29);
          c.fillStyle = shade(col, 1.25); c.fillRect(x + i, 29, 1, F - 29);
        }
        if (sp.occupied) { c.fillStyle = shade(col, 0.6); c.fillRect(x - 5, F - 60, 10, 58); c.fillStyle = '#271f1b'; c.fillRect(x - 3, F - 4, 6, 4); }
        break;
      }
      case 'candle':
        c.fillStyle = '#2a2420'; c.fillRect(x - 1, F - 44, 2, 44); c.fillRect(x - 5, F - 3, 10, 3); c.fillRect(x - 4, F - 46, 8, 2);
        c.fillStyle = '#e8e0c8'; c.fillRect(x - 1, F - 52, 3, 6);
        if (!sp.out) {
          const fl = Math.sin(tm * 13 + x) > 0 ? 1 : 0;
          c.fillStyle = '#ffd070'; c.fillRect(x, F - 57 - fl, 2, 4 + fl);
          c.fillStyle = '#fff4c0'; c.fillRect(x, F - 55, 1, 2);
        } else { c.fillStyle = 'rgba(200,200,200,0.3)'; c.fillRect(x + ((tm * 3) | 0) % 2, F - 58, 1, 5); }
        break;
      case 'fireplace': {
        c.fillStyle = '#4a4540'; c.fillRect(x - 30, F - 64, 60, 64);
        c.fillStyle = '#5e5850'; c.fillRect(x - 34, F - 68, 68, 6);
        c.fillStyle = '#16100c'; c.fillRect(x - 20, F - 44, 40, 44);
        for (let i = 0; i < 9; i++) {
          const fh = 8 + Math.abs(Math.sin(tm * 7 + i * 1.7)) * 14;
          c.fillStyle = i % 3 === 0 ? '#ffd070' : i % 3 === 1 ? '#f08a30' : '#c0441c';
          c.fillRect(x - 16 + i * 4, F - 6 - fh, 3, fh);
        }
        c.fillStyle = '#3a2416'; c.fillRect(x - 16, F - 7, 32, 5);
        break;
      }
      case 'bell': {
        // the servants' bells: one to a room upstairs, each on a spring, each wired
        // up through the ceiling to a pull in that room
        const ringing = sp.ringT && tm < sp.ringT;
        c.fillStyle = woodD; c.fillRect(x - 18, 80, 36, 14);
        c.fillStyle = wood; c.fillRect(x - 17, 81, 34, 12);
        c.fillStyle = woodL; c.fillRect(x - 17, 81, 34, 1);
        for (let i = 0; i < 5; i++) {
          const bx = x - 12 + i * 6, wob = ringing && i === 1 ? Math.round(Math.sin(tm * 40) * 2) : 0;
          c.fillStyle = '#3a3430'; c.fillRect(bx, 14, 1, 66);
          c.fillStyle = '#6a6460'; c.fillRect(bx, 94, 1, 3);
          c.fillStyle = '#b08a3e'; c.fillRect(bx - 2 + wob, 97, 5, 4); c.fillRect(bx - 1 + wob, 96, 3, 1);
          c.fillStyle = '#e0c070'; c.fillRect(bx - 1 + wob, 97, 1, 2);
          c.fillStyle = '#f4ead0'; c.fillRect(bx - 1, 86, 3, 3);
        }
        break;
      }
      case 'lectern':
        c.fillStyle = woodD; c.fillRect(x - 2, F - 38, 4, 38); c.fillRect(x - 9, F - 3, 18, 3);
        c.fillStyle = wood; c.fillRect(x - 11, F - 44, 22, 6);
        c.fillStyle = woodL; c.fillRect(x - 11, F - 44, 22, 1);
        c.fillStyle = '#e8e0c8'; c.fillRect(x - 10, F - 48, 9, 4); c.fillRect(x + 1, F - 48, 9, 4);
        c.fillStyle = '#8a7a5a'; c.fillRect(x, F - 48, 1, 4);
        c.fillStyle = '#6b2424'; c.fillRect(x - 1, F - 44, 2, 8);
        break;
      case 'balcony': {
        // tall glass doors onto the balcony, the rail and the night beyond
        c.fillStyle = '#2a1e16'; c.fillRect(x - 20, F - 110, 40, 110);
        c.fillStyle = '#16203a'; c.fillRect(x - 17, F - 106, 34, 104);
        const br = rng(x);
        for (let k = 0; k < 8; k++) { c.fillStyle = '#c8c6b8'; c.fillRect(x - 16 + ((br() * 32) | 0), F - 104 + ((br() * 50) | 0), 1, 1); }
        c.fillStyle = '#10141e';
        [[-17, 50, 9], [-8, 44, 7], [-1, 54, 10], [9, 47, 8]].forEach(([a, h, w2]) => c.fillRect(x + a, F - h, w2, h - 30));
        c.fillStyle = '#3a2a1e'; c.fillRect(x - 1, F - 106, 2, 104); c.fillRect(x - 17, F - 64, 34, 2);
        c.fillStyle = '#1a1a1e'; c.fillRect(x - 20, F - 32, 40, 2);
        for (let k = -18; k < 20; k += 5) c.fillRect(x + k, F - 30, 1, 28);
        break;
      }
      case 'knives':
        // a wooden knife rack on the wall; one gone once she takes it
        c.fillStyle = woodD; c.fillRect(x - 12, 98, 24, 7);
        c.fillStyle = woodL; c.fillRect(x - 12, 98, 24, 1);
        for (let i = 0; i < 3; i++) {
          if (done && i === 1) continue;
          const kx = x - 7 + i * 7;
          c.fillStyle = '#2a1c14'; c.fillRect(kx - 1, 93, 3, 5);
          c.fillStyle = '#b8c4cc'; c.fillRect(kx, 105, 2, 14 - i * 2);
          c.fillStyle = '#e8eef2'; c.fillRect(kx, 105, 1, 12 - i * 2);
        }
        break;
      case 'bigbell':
        // the abbey bell, for the belfry scene
        c.fillStyle = '#3a2a1e'; c.fillRect(x - 40, 20, 80, 8);
        c.fillStyle = '#6a4a26'; c.fillRect(x - 3, 28, 6, 8);
        c.fillStyle = '#8a6a2a'; c.fillRect(x - 14, 36, 28, 10); c.fillRect(x - 18, 46, 36, 18); c.fillRect(x - 24, 64, 48, 8);
        c.fillStyle = '#b08a3a'; c.fillRect(x - 12, 38, 4, 30);
        c.fillStyle = '#5a4018'; c.fillRect(x - 24, 70, 48, 2);
        c.fillStyle = '#8a7250'; c.fillRect(x + 20, 30, 2, 130);
        break;
      case 'strongbox':
        c.fillStyle = '#2a2a2e'; c.fillRect(x - 15, F - 24, 30, 24);
        c.fillStyle = '#44444c'; c.fillRect(x - 14, F - 23, 28, 22);
        c.fillStyle = '#5a5a64'; c.fillRect(x - 14, F - 23, 28, 2);
        c.fillStyle = '#2a2a2e'; for (let i = -12; i < 14; i += 6) c.fillRect(x + i, F - 21, 1, 1);
        if (done) { c.fillStyle = '#0c0c0e'; c.fillRect(x - 12, F - 20, 24, 6); }
        else { c.fillStyle = '#c9a13e'; c.fillRect(x - 3, F - 16, 6, 6); c.fillStyle = '#1a1a1a'; c.fillRect(x - 1, F - 14, 2, 3); }
        break;
      case 'rack':
        c.fillStyle = woodD; c.fillRect(x - 16, 108, 32, 8); c.fillStyle = woodL; c.fillRect(x - 16, 108, 32, 1);
        c.fillStyle = '#8a8a90';
        for (let i = -12; i < 14; i += 8) c.fillRect(x + i, 116, 1, 4);
        if (!done) {
          c.fillStyle = '#c9a13e'; c.fillRect(x - 4, 118, 3, 8); c.fillRect(x - 5, 124, 5, 3);
          c.fillStyle = '#9aa6b0'; c.fillRect(x + 4, 118, 1, 10); c.fillRect(x + 12, 118, 1, 10);
        }
        break;
      case 'barrel':
        c.fillStyle = woodD; c.fillRect(x - 11, F - 28, 22, 28);
        c.fillStyle = wood; c.fillRect(x - 10, F - 27, 20, 26);
        c.fillStyle = woodL; c.fillRect(x - 6, F - 27, 3, 26);
        c.fillStyle = '#3a3a3e'; c.fillRect(x - 11, F - 23, 22, 2); c.fillRect(x - 11, F - 8, 22, 2);
        if (done) { c.fillStyle = '#1a120c'; c.fillRect(x - 9, F - 28, 18, 2); }
        break;
      case 'table':
        c.fillStyle = woodD; c.fillRect(x - 22, F - 24, 3, 24); c.fillRect(x + 19, F - 24, 3, 24);
        c.fillStyle = wood; c.fillRect(x - 26, F - 28, 52, 5); c.fillStyle = woodL; c.fillRect(x - 26, F - 28, 52, 1);
        if (!done) {
          c.fillStyle = '#c89a50'; c.fillRect(x - 14, F - 33, 12, 5); c.fillStyle = '#e0b870'; c.fillRect(x - 13, F - 34, 10, 1);
          c.fillStyle = '#6a6a74'; c.fillRect(x + 6, F - 36, 6, 8); c.fillStyle = '#8a8a94'; c.fillRect(x + 6, F - 36, 6, 1);
        } else { c.fillStyle = '#c89a50'; c.fillRect(x - 12, F - 30, 3, 2); }
        break;
      case 'altar':
        c.fillStyle = '#6a6458'; c.fillRect(x - 26, F - 36, 52, 36);
        c.fillStyle = '#86806e'; c.fillRect(x - 28, F - 38, 56, 4);
        c.fillStyle = '#e2dac8'; c.fillRect(x - 20, F - 34, 40, 20); c.fillStyle = '#c9a13e'; c.fillRect(x - 20, F - 16, 40, 2);
        c.fillStyle = '#6b2a2a'; c.fillRect(x - 2, F - 34, 4, 18);
        if (!done) { c.fillStyle = '#d8d0b8'; c.fillRect(x + 8, F - 42, 10, 4); c.fillStyle = '#a02a2a'; c.fillRect(x + 12, F - 41, 2, 2); }
        break;
      case 'cabinet':
        c.fillStyle = woodD; c.fillRect(x - 17, F - 60, 34, 60);
        c.fillStyle = wood; c.fillRect(x - 15, F - 56, 14, 52); c.fillRect(x + 1, F - 56, 14, 52);
        c.fillStyle = woodL; c.fillRect(x - 17, F - 60, 34, 2);
        c.fillStyle = '#b09050'; c.fillRect(x - 3, F - 32, 2, 3); c.fillRect(x + 1, F - 32, 2, 3);
        if (done && !sp.occupied) { c.fillStyle = '#140e0a'; c.fillRect(x + 1, F - 56, 14, 52); c.fillStyle = wood; c.fillRect(x + 15, F - 56, 6, 52); }
        if (sp.occupied) { c.fillStyle = '#140e0a'; c.fillRect(x - 1, F - 56, 3, 52); }
        // crockery on top
        c.fillStyle = '#c8c0b0'; c.fillRect(x - 12, F - 66, 6, 6); c.fillRect(x + 4, F - 64, 8, 4);
        break;
    }
    void dark;
  }

  // ---------- game state ----------
  const S = {
    mode: 'title', li: 0, run: null, lv: null, world: null, player: null, guards: [],
    room: null, trans: null, t: 0, cam: { x: 0, y: 0 }, toasts: [], prompt: '', snap: null,
    sound: false, paused: false, fx: [],
  };

  function freshRun() {
    return {
      hearts: MAX_HEARTS, silver: 0, given: 0, kept: 0,
      inv: { pebbles: 0, darts: 0, picks: 0 },
      knife: false,   // she only kills if she chose to pick up a knife
      items: [],
      stats: { kills: 0, subdues: 0, innocents: 0, alarms: 0, deaths: 0, executions: 0, blackmails: 0, spared: 0, searched: 0 },
      choices: [],
    };
  }
  const chaos = (run) => run.stats.kills + run.stats.innocents * 3 + run.stats.executions * 2 + run.stats.alarms * 0.5;
  const has = (id) => S.run.items.includes(id);

  function freshLevel(li) {
    const w = parseLevel(LEVELS[li]);
    const bloody = chaos(S.run) >= 3;
    return {
      cp: { x: w.start.x, y: w.start.y, f: 1 },
      guards: w.guards.filter((g) => !g.chaos || bloody).map((g, i) => ({ id: i, x: g.x, y: g.y, f: i % 2 ? -1 : 1, state: 'patrol', home: g.x })),
      rooms: {},
      alarms: 0,
    };
  }

  const roomDef = (id) => id === 'T' ? LEVELS[S.li].finale : LEVELS[S.li].rooms[id];
  function roomState(id) {
    const def = roomDef(id);
    if (!S.lv.rooms[id]) {
      S.lv.rooms[id] = {
        done: def.spots.map(() => false),
        people: def.people.map((p) => ({ state: p.sleep ? 'sleep' : (p.route ? 'patrol' : 'idle') })),
        out: false, unlocked: !def.locked, wary: false,
      };
    }
    return S.lv.rooms[id];
  }

  function load() {
    try { const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); return s && s.v === 1 ? s : null; } catch (e) { return null; }
  }
  function persist(snap) {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(snap)); } catch (e) { /* private window: play on unsaved */ }
  }
  const clone = (o) => JSON.parse(JSON.stringify(o));

  // A sparrow mark: everything as it stands, so a death puts you back here.
  function checkpoint(x, y, f) {
    S.lv.cp = { x, y, f };
    S.lv.guards = S.guards.map((g) => ({ id: g.id, x: (g.state === 'dead' || g.state === 'ko') ? g.x : g.home, y: g.y, f: g.f, state: (g.state === 'dead' || g.state === 'ko') ? g.state : 'patrol', home: g.home, found: g.found }));
    S.snap = { v: 1, li: S.li, run: clone(S.run), lv: clone(S.lv) };
    persist(S.snap);
  }

  // ---------- the level outside ----------
  function startLevel(li, fromSnap) {
    S.li = li;
    S.world = parseLevel(LEVELS[li]);
    buildArt(li);
    if (!fromSnap) { S.lv = freshLevel(li); }
    const cp = S.lv.cp;
    S.player = { state: 'ground', px: (cp.x + 0.5) * T, py: (cp.y + 1) * T, vx: 0, vy: 0, f: cp.f, anim: null, busy: 0, hurtT: 0, jumpBuf: 0, coyote: 0, top: 0, skip: null };
    syncCell(S.player);
    S.guards = S.lv.guards.map((g) => spawnGuard(g));
    S.cam.x = S.player.px - VW / 2; S.cam.y = S.player.py - 14 - VH / 2; clampCam();
    S.mode = 'ext'; S.scene = 'ext';
    S.room = null;
    if (!fromSnap) checkpoint(cp.x, cp.y, cp.f);
    else { S.snap = { v: 1, li, run: clone(S.run), lv: clone(S.lv) }; persist(S.snap); }
    syncPad();
  }

  function spawnGuard(g) {
    const w = S.world;
    let min = g.home, max = g.home;
    for (let k = 0; k < 5 && standable(w, min - 1, g.y); k++) min--;
    for (let k = 0; k < 5 && standable(w, max + 1, g.y); k++) max++;
    let rmin = min, rmax = max;
    while (standable(w, rmin - 1, g.y)) rmin--;
    while (standable(w, rmax + 1, g.y)) rmax++;
    return { id: g.id, x: g.x, y: g.y, f: g.f || 1, state: g.state || 'patrol', home: g.home, min, max, rmin, rmax, sus: 0, pause: 0, atk: 0.6, lost: 0, found: !!g.found, fall: null, walked: 0 };
  }

  // ---------- how she moves outside ----------
  // Free movement over the grid. She runs with a little momentum and jumps in an
  // arc you can steer; letting go of Space early makes a shorter hop. On the way
  // down her hands catch any cornice or crack they pass (hold Down to let them go
  // by), and a cornice can be jumped up through from below. Hanging, climbing hand
  // over hand, ivy and pulling up onto a ledge are short smooth motions. P.px and
  // P.py are her feet, in world pixels; P.x / P.y / P.m are kept as the grid cell
  // and mode the guards and the prompts reason about.
  const MV = {
    run: 82, accel: 900, decel: 1300, airAccel: 520, grav: 980, jumpV: 245, maxFall: 430,
    coyote: 0.09, buffer: 0.14, shimmy: 48, climb: 58, halfW: 4, height: 26, reach: 30,
  };

  function syncCell(P) {
    P.x = Math.floor(P.px / T);
    P.m = P.state === 'hang' ? 'h' : P.state === 'climb' ? 'c' : P.state === 'ground' ? 's' : 'air';
    P.y = P.state === 'hang' ? P.ly : Math.floor((P.py - 1) / T);
  }

  function playerCell() {
    const P = S.player;
    return { x: Math.floor(P.px / T), y: Math.floor((P.py - 1) / T), m: P.m === 'air' ? 's' : P.m };
  }

  function onFloor(px, py) {
    const row = Math.round(py / T);
    if (Math.abs(py - row * T) > 0.01) return false;
    const a = Math.floor((px - MV.halfW + 0.5) / T), b = Math.floor((px + MV.halfW - 0.5) / T);
    for (let cx = a; cx <= b; cx++) if (isFloor(S.world, cx, row)) return true;
    return false;
  }

  function moveX(P, dx) {
    if (!dx) return;
    let nx = P.px + dx;
    const r0 = Math.floor((P.py - MV.height) / T), r1 = Math.floor((P.py - 1) / T);
    const edgeX = nx + Math.sign(dx) * MV.halfW;
    const cx = Math.floor((dx > 0 ? edgeX - 0.001 : edgeX) / T);
    for (let r = r0; r <= r1; r++) {
      if (isSolid(S.world, cx, r)) { nx = dx > 0 ? cx * T - MV.halfW : (cx + 1) * T + MV.halfW; P.vx = 0; break; }
    }
    P.px = nx;
  }

  // Returns 'land' when the feet meet a floor from above, 'head' on a ceiling.
  function moveY(P, dy) {
    const w = S.world;
    const a = Math.floor((P.px - MV.halfW + 0.5) / T), b = Math.floor((P.px + MV.halfW - 0.5) / T);
    const ny = P.py + dy;
    if (dy > 0) {
      for (let r = Math.ceil(P.py / T - 1e-9); r * T <= ny; r++) {
        for (let cx = a; cx <= b; cx++) if (isFloor(w, cx, r)) { P.py = r * T; P.vy = 0; return 'land'; }
      }
      P.py = ny; return null;
    }
    const headOld = P.py - MV.height, headNew = ny - MV.height;
    for (let bnd = Math.floor(headOld / T); bnd * T > headNew; bnd--) {
      for (let cx = a; cx <= b; cx++) if (isSolid(w, cx, bnd - 1)) { P.py = bnd * T + MV.height; P.vy = 0; return 'head'; }
    }
    P.py = ny; return null;
  }

  function animate(P, kind, x1, y1, dur, then) {
    P.anim = { kind, t: 0, dur, x0: P.px, y0: P.py, x1, y1, then };
    P.vx = 0; P.vy = 0;
  }

  function hangAt(P, cx, ly, px) {
    P.state = 'hang'; P.ly = ly;
    P.px = Math.max(cx * T + 2, Math.min(cx * T + 14, px));
    P.py = ly * T + 2 * T;
    P.vx = 0; P.vy = 0; P.jumped = false;
  }

  function toClimb(P) {
    P.state = 'climb'; P.ivx = Math.floor(P.px / T); P.vx = 0; P.vy = 0; P.jumped = false;
  }

  function jump(P, key, vy) {
    P.state = 'air'; P.vy = -(vy || MV.jumpV); P.jumped = true; P.jumpKey = key;
    P.jumpBuf = 0; P.coyote = 0; P.top = P.py;
    sfx('jump');
  }

  function leaveInto(P, vx, vy, skip) {
    P.state = 'air'; P.vx = vx; P.vy = vy; P.top = P.py; P.jumped = true; P.jumpKey = null; P.skip = skip || null;
  }

  // Hands passing the top edge of a cornice or crack, on the way down, catch it.
  function tryGrab(P, handPrev) {
    if (keys.down || P.vy < -40) return false;
    const w = S.world, hand = P.py - MV.reach;
    const lo = Math.min(handPrev, hand) - 5, hi = Math.max(handPrev, hand) + 6;
    for (const off of [P.f * 10, P.f * 4, 0]) {   // hands reach a little ahead
      const cx = Math.floor((P.px + off) / T);
      for (let cy = Math.floor(lo / T); cy <= Math.floor(hi / T); cy++) {
        const top = cy * T;
        if (top < lo || top > hi || !grabbable(w, cx, cy) || isSolid(w, cx, cy + 1)) continue;
        if (P.skip && P.skip.t > 0 && (P.skip.row === cy || P.skip.cell === cx + ',' + cy)) continue;
        hangAt(P, cx, cy, P.px + off);
        sfx('grab');
        return true;
      }
    }
    return false;
  }

  function land(P) {
    const rows = (P.py - P.top) / T;
    P.state = 'ground'; P.vy = 0; P.jumped = false; P.skip = null;
    if (rows >= DEATH_FALL) die('You fall too far.');
    else if (rows >= HURT_FALL) hurt(1, 'A hard landing.');
    else sfx('land');
  }

  function groundUp(P) {
    const w = S.world, cx = Math.floor(P.px / T), fr = Math.floor((P.py - 1) / T);
    const d = decoAt(w, cx, fr);
    if (d && '123456789T'.includes(d)) { P.vx = 0; tryWindow(d); return true; }
    if (ivyAt(w, cx, fr) || ivyAt(w, cx, fr - 1)) { toClimb(P); return true; }
    if (at(w, cx, fr - 1) === '=' && !isSolid(w, cx, fr - 2) && !isSolid(w, cx, fr - 3)) {
      animate(P, 'mantle', P.px, (fr - 1) * T, 0.42, () => { P.state = 'ground'; });
      return true;
    }
    // otherwise Up is a full jump straight up, for the ledge overhead
    P.vx = 0;
    jump(P, null);
    return true;
  }

  function groundDown(P) {
    const w = S.world, cx = Math.floor(P.px / T), fr = Math.floor((P.py - 1) / T);
    if (at(w, cx, fr + 1) !== '=' || isSolid(w, cx, fr + 2)) return false;
    const x = Math.max(cx * T + 2, Math.min(cx * T + 14, P.px));
    animate(P, 'hangdown', x, (fr + 3) * T, 0.34, () => hangAt(P, cx, fr + 1, x));
    return true;
  }

  function updHang(P, dt, dir) {
    const w = S.world, ly = P.ly, cx = Math.floor(P.px / T);
    if (P.jumpBuf > 0) {
      P.jumpBuf = 0;
      // a lunge across a missing stone, or a hop straight up the wall
      if (dir) { P.f = dir; leaveInto(P, dir * 150, -150, { t: 0.2, cell: cx + ',' + ly }); P.jumpKey = 'jump'; }
      else { leaveInto(P, 0, -230, { t: 0.1, row: ly }); P.jumpKey = 'jump'; }
      sfx('jump');
      return;
    }
    if (keys.up) {
      if (at(w, cx, ly) === '=' && !isSolid(w, cx, ly - 1) && !isSolid(w, cx, ly - 2)) {
        animate(P, 'mantle', P.px, ly * T, 0.42, () => { P.state = 'ground'; });
        return;
      }
      for (const r of [ly - 1, ly - 2]) {
        if (grabbable(w, cx, r) && !isSolid(w, cx, r + 1) && (r === ly - 1 || !isSolid(w, cx, ly - 1))) {
          animate(P, 'handup', P.px, r * T + 2 * T, 0.26 * (ly - r), () => hangAt(P, cx, r, P.px));
          return;
        }
      }
    }
    if (keys.down) {
      if (ivyOK(w, cx, ly + 1)) { P.py = (ly + 2) * T; toClimb(P); return; }
      for (const r of [ly + 1, ly + 2]) {
        if (grabbable(w, cx, r) && !isSolid(w, cx, r + 1) && !isSolid(w, cx, r)) {
          animate(P, 'handdown', P.px, r * T + 2 * T, 0.26 * (r - ly), () => hangAt(P, cx, r, P.px));
          return;
        }
      }
      if (edge.has('down')) { leaveInto(P, 0, 0, { t: 0.3, row: ly }); return; }
    }
    if (dir) {
      P.f = dir;
      const nx = P.px + dir * MV.shimmy * dt, lead = Math.floor((nx + dir * 3) / T);
      if (grabbable(w, lead, ly) && !isSolid(w, lead, ly) && !isSolid(w, lead, ly + 1)) { P.px = nx; P.shim = (P.shim || 0) + dt; }
    }
  }

  function updClimb(P, dt, dir) {
    const w = S.world, cx = P.ivx;
    P.px += (cx * T + 8 - P.px) * Math.min(1, dt * 12);
    const fr = Math.floor((P.py - 1) / T);
    if (P.jumpBuf > 0) {
      P.jumpBuf = 0;
      leaveInto(P, (dir || 0) * 90, dir ? -170 : 0, { t: 0.15, cell: null });
      return;
    }
    if (dir) {
      P.f = dir;
      if (standable(w, cx + dir, fr)) {
        const x = (cx + dir) * T + 8;
        animate(P, 'step', x, (fr + 1) * T, 0.22, () => { P.state = 'ground'; P.vx = 0; });
        return;
      }
      if (grabbable(w, cx + dir, fr - 1)) {
        const x = (cx + dir) * T + 8;
        animate(P, 'handup', x, (fr + 1) * T, 0.22, () => hangAt(P, cx + dir, fr - 1, x));
        return;
      }
    }
    if (keys.up) {
      const ny = P.py - MV.climb * dt;
      if (ivyOK(w, cx, Math.floor((ny - 1) / T)) && !isSolid(w, cx, Math.floor((ny - MV.height) / T))) { P.py = ny; P.cph = (P.cph || 0) + dt; }
      else if (at(w, cx, fr - 1) === '=' && !isSolid(w, cx, fr - 2) && !isSolid(w, cx, fr - 3)) {
        animate(P, 'mantle', P.px, (fr - 1) * T, 0.42, () => { P.state = 'ground'; });
      }
    } else if (keys.down) {
      const saved = P.py;
      const hit = moveY(P, MV.climb * dt);
      if (hit === 'land') { P.state = 'ground'; P.jumped = false; }
      else if (!ivyOK(w, cx, Math.floor((P.py - 1) / T))) P.py = saved;
      else P.cph = (P.cph || 0) + dt;
    }
  }

  function updAir(P, dt, dir) {
    const target = dir * MV.run;
    P.vx += Math.sign(target - P.vx) * Math.min(Math.abs(target - P.vx), MV.airAccel * dt);
    if (dir) P.f = dir;
    let g = MV.grav;
    if (P.vy < 0 && P.jumpKey === 'jump' && !keys.jump) g *= 2.4;   // a tap of Space is a short hop
    P.vy = Math.min(MV.maxFall, P.vy + g * dt);
    const handPrev = P.py - MV.reach;
    moveX(P, P.vx * dt);
    const hit = moveY(P, P.vy * dt);
    P.top = Math.min(P.top, P.py);
    if (hit === 'land') { land(P); return; }
    if (tryGrab(P, handPrev)) return;
    const w = S.world, cx = Math.floor(P.px / T), fr = Math.floor((P.py - 1) / T);
    if (keys.up && P.vy > -60 && (ivyAt(w, cx, fr) || ivyAt(w, cx, fr - 1))) { toClimb(P); return; }
    if ((at(w, cx, fr) === '~' && P.py > fr * T + 5) || P.py > w.H * T + 20) die('The canal takes you.');
  }

  function updGround(P, dt, dir) {
    const target = dir * MV.run;
    P.vx += Math.sign(target - P.vx) * Math.min(Math.abs(target - P.vx), (dir ? MV.accel : MV.decel) * dt);
    if (dir) P.f = dir;
    moveX(P, P.vx * dt);
    P.dist = (P.dist || 0) + Math.abs(P.vx * dt);
    if (!onFloor(P.px, P.py)) {
      // stepping off a cornice: she turns and catches its edge, unless Down is held
      const d = Math.sign(P.vx) || P.f, row = Math.round(P.py / T);
      const ex = Math.floor((P.px - d * (MV.halfW + 1)) / T);
      if (!keys.down && at(S.world, ex, row) === '=' && !isSolid(S.world, ex, row + 1)) {
        const x = ex * T + (d > 0 ? 14 : 2);
        P.px = x;
        animate(P, 'hangdown', x, (row + 2) * T, 0.26, () => hangAt(P, ex, row, x));
        return;
      }
      P.state = 'air'; P.vy = 0; P.top = P.py; P.coyote = MV.coyote; P.jumped = false; P.jumpKey = null;
      return;
    }
    const cx = Math.floor(P.px / T), fr = Math.floor((P.py - 1) / T);
    if (decoAt(S.world, cx, fr) === 'C' && Math.abs(P.vx) < 20) {
      const cp = S.lv.cp;
      if (cp.x !== cx || cp.y !== fr) { checkpoint(cx, fr, P.f); toast('A sparrow mark. Your progress is kept.'); sfx('coin'); }
    }
  }

  function updPlayer(dt) {
    const P = S.player;
    const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    if (edge.has('jump')) P.jumpBuf = MV.buffer; else P.jumpBuf = Math.max(0, P.jumpBuf - dt);
    P.coyote = Math.max(0, P.coyote - dt);
    if (P.skip) P.skip.t -= dt;
    if (P.busy > 0) { P.busy -= dt; syncCell(P); return; }
    if (P.anim) {
      const a = P.anim;
      a.t += dt;
      const k = Math.min(1, a.t / a.dur);
      if (a.kind === 'mantle') {
        // up first, then over the lip
        P.py = a.y0 + (a.y1 - a.y0) * Math.min(1, k * 1.7);
        P.px = a.x0 + (a.x1 - a.x0) * Math.max(0, (k - 0.5) * 2);
      } else { P.px = a.x0 + (a.x1 - a.x0) * k; P.py = a.y0 + (a.y1 - a.y0) * k; }
      if (k >= 1) { P.anim = null; P.px = a.x1; P.py = a.y1; a.then(); }
      syncCell(P);
      return;
    }
    switch (P.state) {
      case 'ground':
        if (edge.has('up') && groundUp(P)) break;
        if (edge.has('down') && groundDown(P)) break;
        if (P.jumpBuf > 0) { jump(P, 'jump'); break; }
        updGround(P, dt, dir);
        break;
      case 'air':
        if (P.jumpBuf > 0 && P.coyote > 0 && !P.jumped) { jump(P, 'jump'); break; }
        updAir(P, dt, dir);
        break;
      case 'hang': updHang(P, dt, dir); break;
      case 'climb': updClimb(P, dt, dir); break;
    }
    syncCell(P);
  }

  function hurt(n, why) {
    const P = S.player;
    S.run.hearts -= n;
    P.hurtT = 0.6;
    sfx('hurt');
    if (why) toast(why);
    if (S.run.hearts <= 0) die(why || 'You are cut down.');
  }

  function die(why) {
    if (S.mode === 'dead') return;
    S.mode = 'dead';
    S.run.stats.deaths++;
    sfx('die');
    const deaths = S.run.stats.deaths;
    showCard({
      title: 'Wren falls',
      body: '<p>' + esc(why) + '</p><p class="dim">Back to the last sparrow mark.</p>',
      actions: [{ label: 'Try again', fn: () => { hideCard(); restore(deaths); } }],
    });
  }

  function restore(deaths) {
    const snap = S.snap || load();
    if (!snap) { newGame(); return; }
    S.run = clone(snap.run); S.lv = clone(snap.lv);
    S.run.stats.deaths = deaths != null ? deaths : S.run.stats.deaths;
    S.run.hearts = MAX_HEARTS;
    startLevel(snap.li, true);
  }

  // ---------- guards ----------
  function sees(g) {
    const P = S.player;
    if (S.mode !== 'ext' || P.hidden) return false;
    const pc = playerCell();
    if (pc.m === 'c') { if (Math.abs(pc.y - g.y) > 1) return false; }
    else if (pc.y !== g.y) return false;
    const px = P.px / T - 0.5;
    const dx = px - g.x;
    const dist = Math.abs(dx);
    if (dist > 0.7 && Math.sign(dx) !== g.f) return false;
    const range = SIGHT + (S.lv.alarms > 0 ? 1 : 0) + (g.state === 'alert' ? 2 : 0);
    if (dist > range) return false;
    // an alcove hides you from anyone not already hunting you, even at arm's length
    if (pc.m === 's' && !P.anim && decoAt(S.world, pc.x, pc.y) === 'S' && g.state !== 'alert') return false;
    const a = Math.round(Math.min(px, g.x)), b = Math.round(Math.max(px, g.x));
    for (let x = a; x <= b; x++) if (isSolid(S.world, x, g.y) || isSolid(S.world, x, g.y - 1)) return false;
    return dist;
  }

  function raiseAlarm(g, why) {
    S.lv.alarms++;
    S.run.stats.alarms++;
    sfx('alert');
    if (why) toast(why);
    void g;
  }

  function updGuard(g, dt) {
    if (g.state === 'dead' || g.state === 'ko') return;
    if (g.state === 'falling') {
      g.fall.t += dt;
      const k = Math.min(1, g.fall.t / g.fall.dur);
      g.fy = g.fall.y0 + (g.fall.y1 - g.fall.y0) * k * k;
      if (k >= 1) { g.state = 'dead'; g.y = g.fall.row; g.fy = null; sfx('thud'); }
      return;
    }
    const w = S.world;
    const d = sees(g);
    const range = SIGHT + (S.lv.alarms > 0 ? 1 : 0) + (g.state === 'alert' ? 2 : 0);
    if (d !== false) {
      g.sus = Math.min(1.2, g.sus + dt * (0.4 + 1.5 * (1 - d / range)) * (S.lv.alarms ? 1.3 : 1));
      g.seenX = S.player.px / T - 0.5;
    } else if (g.state !== 'alert') g.sus = Math.max(0, g.sus - dt * 0.22);
    if (g.state !== 'alert' && g.sus >= 1) {
      g.state = 'alert'; g.lost = 0; g.atk = 0.5;
      raiseAlarm(g, 'Spotted!');
    }
    // a body in plain sight
    if (g.state !== 'alert') {
      for (const o of S.guards) {
        if (o === g || o.found || (o.state !== 'ko' && o.state !== 'dead') || o.y !== g.y) continue;
        const dx = o.x - g.x;
        if (Math.abs(dx) < 4 && (Math.sign(dx) === g.f || Math.abs(dx) < 1)) {
          o.found = true; g.state = 'suspect'; g.sus = Math.max(g.sus, 0.8); g.seenX = o.x;
          raiseAlarm(g, 'A guard has found a body.');
        }
      }
    }
    const speed = g.state === 'alert' ? 3.2 : 1.3;
    if (g.state === 'patrol') {
      if (g.pause > 0) { g.pause -= dt; if (g.pause <= 0) g.f = -g.f; }
      else {
        g.x += g.f * speed * dt; g.walked += speed * dt;
        if (g.x >= g.max) { g.x = g.max; g.pause = 1.4; }
        if (g.x <= g.min) { g.x = g.min; g.pause = 1.4; }
      }
      if (g.sus > 0.3) g.state = 'suspect';
    } else if (g.state === 'suspect') {
      if (g.seenX != null) g.f = Math.sign(g.seenX - g.x) || g.f;
      if (g.sus <= 0.05) { g.state = 'patrol'; g.pause = 0.8; }
    } else if (g.state === 'alert') {
      if (d !== false) {
        g.lost = 0;
        const px = S.player.px / T - 0.5;
        const dx = px - g.x;
        g.f = Math.sign(dx) || g.f;
        if (Math.abs(dx) > 0.9) {
          g.x += g.f * speed * dt; g.walked += speed * dt;
          g.x = Math.max(g.rmin, Math.min(g.rmax, g.x));
        } else {
          g.atk -= dt;
          if (g.atk <= 0) { g.atk = 1.1; g.swing = 0.25; hurt(1, 'A guard\'s blow.'); }
        }
      } else {
        g.lost += dt;
        if (g.lost > 4) { g.state = 'patrol'; g.sus = 0.5; g.x = Math.max(g.min, Math.min(g.max, g.x)); }
      }
    }
    if (g.swing) g.swing = Math.max(0, g.swing - dt);
    void w;
  }

  // What the thief can do to a guard right now, and to which one.
  function takedownTarget() {
    const P = S.player;
    if (P.anim || P.state === 'air' || S.mode !== 'ext') return null;
    for (const g of S.guards) {
      if (g.state === 'dead' || g.state === 'ko' || g.state === 'falling') continue;
      const dx = g.x - (P.px / T - 0.5);
      if (P.m === 's' && g.y === P.y && Math.abs(dx) <= 1.25 && g.state !== 'alert') {
        // he is facing away from her: she is behind him
        if (Math.sign(dx) === g.f) return { g, kind: 'behind' };
      }
      if (P.m === 'h' && S.run.knife && g.y === P.y - 1 && Math.abs(dx) <= 1.3 && g.state !== 'alert') return { g, kind: 'ledge' };
    }
    return null;
  }

  function takedown(lethal) {
    const td = takedownTarget();
    if (!td) return false;
    if (lethal && !S.run.knife) { toast('You carry no blade. E chokes him out.', 1.8); return false; }
    const g = td.g, P = S.player;
    if (td.kind === 'ledge') {
      if (!lethal) { toast('From a ledge there is only one way to do it. (Kill)'); return false; }
      const s = settle(S.world, Math.round(g.x), g.y + 2);
      g.state = 'falling';
      g.fall = { t: 0, dur: 0.2 + Math.sqrt(Math.max(1, s.rows)) * 0.14, y0: (g.y + 1) * T, y1: (Math.min(s.y, S.world.H - 1) + 1) * T, row: Math.min(s.y, S.world.H - 1) };
      g.x = Math.round(g.x);
      S.run.stats.kills++;
      P.busy = 0.45; P.pose = 'hang';
      sfx('grab');
      toast('Over the edge he goes.');
      return true;
    }
    P.busy = 0.7; P.pose = 'crouch'; P.vx = 0; P.f = Math.sign(g.x - (P.px / T - 0.5)) || P.f;
    g.state = lethal ? 'dead' : 'ko';
    g.f = P.f;
    if (lethal) S.run.stats.kills++; else S.run.stats.subdues++;
    sfx(lethal ? 'stab' : 'thud');
    toast(lethal ? 'Killed.' : 'Choked out. He will sleep till dawn.');
    return true;
  }

  // ---------- the window shift ----------
  function tryWindow(id) {
    const L = LEVELS[S.li];
    if (id === 'T') {
      const missing = L.required.filter((r) => !has(r));
      if (missing.length) { toast('Not yet. You still need ' + missing.map((m) => ITEM_NAMES[m].replace(/^The /, 'the ')).join(' and ') + '.'); return; }
      irisTo(() => enterRoom('T'));
      return;
    }
    const rs = roomState(id);
    if (!rs.unlocked) {
      if (S.run.inv.picks > 0) { S.run.inv.picks--; rs.unlocked = true; toast('You pick the shutter lock.'); sfx('coin'); }
      else { toast('Shuttered and barred. A lockpick would open it.'); return; }
    }
    irisTo(() => enterRoom(id));
  }

  function irisTo(cb) {
    const P = S.player;
    S.trans = { t: 0, dur: 0.5, phase: 'close', cx: Math.round(P.px - S.cam.x), cy: Math.round(P.py - 16 - S.cam.y), cb };
    sfx('window');
  }

  // ---------- inside a room ----------
  // Furniture on the back wall sits at v = 0; the rest stands on the floor at a
  // depth of its own, with a footprint she walks round rather than through.
  const LABEL = {
    desk: 'Desk', shelf: 'Bookshelf', painting: 'Painting', chest: 'Chest', bed: 'Bed', wardrobe: 'Wardrobe',
    curtain: 'Curtain', candle: 'Candle', fireplace: 'Fireplace', bell: "Servants' bells", bigbell: 'Bell', strongbox: 'Strongbox',
    rack: 'Rack', knives: 'Knife rack', lectern: 'Lectern', balcony: 'Balcony', barrel: 'Barrel', table: 'Table', altar: 'Altar', cabinet: 'Cupboard', window: 'Window',
  };
  const TARGET = { abbot: 1, magistrate: 1, countess: 1 };
  const WHO = { abbot: 'the Abbot', magistrate: 'the Magistrate', countess: 'the Countess', guard: 'the guard', clerk: 'the clerk', cook: 'the cook', servant: 'the maid', sexton: 'the sexton' };
  const ON_WALL = { painting: 1, rack: 1, knives: 1, balcony: 1, bell: 1, bigbell: 1, shelf: 1, wardrobe: 1, cabinet: 1, fireplace: 1, curtain: 1, altar: 1 };
  // Furniture keeps to the back half; people stand and walk just in front of it, well
  // back from the sill at the front where she climbs in.
  const DEPTH = { lectern: [0.16, 0.03], desk: [0.15, 0.05], table: [0.17, 0.05], chest: [0.09, 0.04], barrel: [0.09, 0.03], strongbox: [0.09, 0.035], bed: [0.1, 0.06], candle: [0.14, 0.02] };
  const LANE = 0.27;   // where people stand and walk, unless the room says otherwise
  const uOf = (x) => Math.max(0.05, Math.min(0.95, (x - 20) / 344));
  const halfU = (sp) => SPOT[sp.kind].hw / VW;
  function placeSpot(s) {
    const u = uOf(s.x);
    if (ON_WALL[s.kind]) return { u, v: 0, dv: 0.05, wall: true };
    const d = DEPTH[s.kind] || [0.3, 0.05];
    return { u, v: s.v != null ? s.v : d[0], dv: d[1], wall: false };
  }
  const down = (p) => p.state === 'ko' || p.state === 'dead';

  function enterRoom(id) {
    const def = roomDef(id), rs = roomState(id);
    S.mode = 'room'; S.scene = 'room';
    // the window she came in by is behind the camera: its sill is the front-left corner
    const spots = [{ kind: 'window', i: -1, u: SILL.u, v: V_MAX, dv: 0.05, wall: true }]
      .concat(def.spots.map((s, i) => Object.assign({}, s, placeSpot(s), { i, done: rs.done[i], out: s.kind === 'candle' && rs.out })));
    const people = def.people.map((p, i) => {
      const st = rs.people[i];
      const base = p.sleep ? 'sleep' : (p.route ? 'patrol' : 'idle');
      const keep = down(st);
      let u = uOf(p.x), v = p.v != null ? p.v : LANE, bedV = null;
      if (p.sleep) {
        const bed = spots.find((s) => s.kind === 'bed' && Math.abs(s.x - p.x) < 30);
        if (bed) { u = bed.u; bedV = bed.v; v = bed.v + bed.dv + 0.07; }
      }
      const state = keep ? st.state : (base === 'sleep' && st.state !== 'sleep' ? 'idle' : base);
      const onBed = bedV != null && (state === 'sleep' || (keep && st.onBed));
      return {
        def: p, kind: p.kind, f: keep && st.f ? st.f : p.face, home: u, lane: v, bedV,
        u: keep && st.u != null ? st.u : u, v: onBed ? bedV : (keep && st.v != null ? st.v : v), onBed,
        route: p.route ? [uOf(p.route[0]), uOf(p.route[1])] : null,
        state, meter: 0, stir: 0, turnT: p.turnEvery || 0, pause: 0, investU: null, look: 0, away: 0, wary: rs.wary, ph: 0,
      };
    });
    people.forEach((p, i) => {
      if (p.state !== 'patrol' && p.state !== 'idle') return;
      p.plan = buildPlan(p, spots, i);
      if (p.plan) startRoutine(p); else if (p.state === 'patrol') farEnd(p);
    });
    S.room = {
      id, def, rs, people, spots, theme: def.theme,
      u: SILL.u, v: V_MAX, f: 1, path: null, onArrive: null, act: null, hidden: spots[0], aim: null, climbIn: CLIMB_IN, peek: false, peeked: false, upLatch: false,
      caught: 0, dark: rs.out, pose: 'idle', busy: 0, shots: [], walkPh: 0,
    };
    if (def.tip && !rs.seen) { rs.seen = true; toast(def.tip, 5); }
    toast(def.name, 2.2, true);
    syncPad();
  }

  function leaveRoom(caught) {
    const R = S.room;
    // remember who is down, and where
    R.people.forEach((p, i) => {
      R.rs.people[i] = { state: down(p) ? p.state : (p.def.sleep && p.state === 'sleep' ? 'sleep' : 'awake'), u: p.u, v: p.v, f: p.f, onBed: p.onBed };
    });
    if (caught) R.rs.wary = true;
    irisTo(() => {
      S.mode = 'ext'; S.scene = 'ext'; S.room = null; syncPad();
      if (caught) {
        S.lv.alarms++; S.run.stats.alarms++;
        hurt(1, 'They raised the house. You are out of the window with a bruise to show for it.');
      }
    });
  }

  function blocked(u, v) {
    for (const s of S.room.spots) {
      if (s.wall) continue;
      if (Math.abs(u - s.u) < halfU(s) + 0.015 && Math.abs(v - s.v) < s.dv) return true;
    }
    return false;
  }

  // Move her by (du, dv), sliding along furniture. ghost: an automatic walk,
  // which keeps to the clear lane in front of everything anyway.
  function stepPlayer(du, dv, ghost) {
    const R = S.room;
    if (R.hidden) { R.hidden.occupied = false; R.hidden = null; }
    // at the front the floor is wider than the screen: keep her on it
    const nv = Math.max(V_MIN, Math.min(V_MAX, R.v + dv)), edgeU = 0.47 / depthK(Math.max(R.v, nv));
    const nu = Math.max(Math.max(0.03, 0.5 - edgeU), Math.min(Math.min(0.97, 0.5 + edgeU), R.u + du));
    let moved = false;
    if (ghost || !blocked(nu, R.v)) { moved = moved || nu !== R.u; R.u = nu; }
    if (ghost || !blocked(R.u, nv)) { moved = moved || nv !== R.v; R.v = nv; }
    return moved;
  }

  // An automatic walk to a place: out to the clear lane at the front, across,
  // then in. Used by Leave, and by the tests.
  function walkTo(u, v, cb) {
    const R = S.room;
    R.act = null;
    const pts = [];
    if (Math.abs(R.u - u) > 0.03 && Math.abs(R.v - v) > 0.02) pts.push({ u: R.u, v: 0.6 }, { u, v: 0.6 });
    pts.push({ u, v });
    R.path = pts; R.onArrive = cb;
  }

  function usePoint(sp) {
    if (sp.kind === 'window') return { u: SILL.u, v: V_MAX };
    if (sp.wall) return { u: sp.u, v: V_MIN + 0.01 };
    return { u: sp.u, v: Math.min(V_MAX, sp.v + sp.dv + 0.03) };
  }
  function useSpot(sp) {
    const R = S.room;
    // still coming up to the sill or peeking over it: the window is right there,
    // and anything else means climbing on in first (without stopping to peek)
    if (R.climbIn > 0 && R.hidden && R.hidden.kind === 'window') {
      if (sp.kind === 'window') { doSpot(sp); return; }
      R.peek = false; R.peeked = true;
    }
    const q = usePoint(sp); walkTo(q.u, q.v, () => doSpot(sp));
  }

  function roomUpdate(dt) {
    const R = S.room;
    if (!R) return;
    if (!keys.up) { R.upLatch = false; R.justLeft = null; }
    if (R.caught > 0) { R.caught -= dt; if (R.caught <= 0) resetRoom(); return; }
    let moving = false;
    const du = (keys.right ? 1 : 0) - (keys.left ? 1 : 0), dv = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
    if (R.busy > 0) { R.busy -= dt; if (R.busy <= 0) R.pose = 'idle'; }
    else if (R.act) {
      R.act.t += dt;
      if (R.act.t >= R.act.dur) { const a = R.act; R.act = null; R.pose = 'idle'; if (a.method) finishMethod(a.method); else completeSearch(a.spot); }
      else if (du || dv) { R.act = null; R.pose = 'idle'; toast('You leave off searching.', 1.2); }
    } else if (R.climbIn > 0) {
      // up to the sill, where she waits with just her head over it until told to go in
      if (!R.peek) {
        R.climbIn -= dt;
        if (!R.peeked && R.climbIn <= CLIMB_IN * PEEK_AT) { R.climbIn = CLIMB_IN * PEEK_AT; R.peek = true; R.peeked = true; }
        if (R.climbIn <= 0) { R.climbIn = 0; if (R.hidden && R.hidden.kind === 'window') R.hidden = null; }
      }
    } else if (R.aim) {
      // the arrows are choosing a target, not walking
    } else if (R.upLatch && keys.up && R.hidden && !(dv > 0)) {
      // she went into hiding with Up: while it stays held she stays, whatever else is pressed
    } else if (du || dv) {
      R.path = null; R.onArrive = null;
      // into and out of the room a little slower than across it, the way depth reads on
      // screen; nearer the camera the same stride covers more screen. A diagonal is no
      // faster than a straight line.
      const diag = du && dv ? 0.75 : 1, k = depthK(R.v), wasHidden = R.hidden, prevV = R.v;
      moving = stepPlayer(du * 0.19 * dt / k * diag, dv * 0.5 * k * dt * diag, false);
      if (du) R.f = du;
      R.view = du ? 'side' : dv < 0 ? 'back' : 'front';
      if (wasHidden && !R.hidden) R.justLeft = wasHidden;
      // Up held as she reaches the back wall in front of a wardrobe, curtain or
      // cupboard, however she came at it: in she goes. Not straight back into the
      // one she has just stepped out of.
      if (keys.up && R.v <= V_MIN + 0.015 && (prevV > V_MIN + 0.015 || !du)) {
        const sp = R.spots.find((q) => HIDEABLE[q.kind] && q !== R.justLeft && Math.abs(q.u - R.u) <= halfU(q));
        if (sp) { hideIn(sp); R.upLatch = true; }
      }
      if (R.justLeft && Math.abs(R.justLeft.u - R.u) > halfU(R.justLeft)) R.justLeft = null;
    } else if (R.path) {
      const tg = R.path[0];
      const d = Math.hypot((tg.u - R.u) * FX, (tg.v - R.v) * FY);
      if (d < 1.2) {
        R.u = tg.u; R.v = tg.v; R.path.shift();
        if (!R.path.length) { R.path = null; const cb = R.onArrive; R.onArrive = null; if (cb) cb(); }
      } else {
        const k = Math.min(d, 72 * dt) / d;
        if (Math.abs(tg.u - R.u) > 0.002) R.f = Math.sign(tg.u - R.u);
        moving = stepPlayer((tg.u - R.u) * k, (tg.v - R.v) * k, true);
      }
    }
    if (moving) { R.pose = 'walk'; R.walkPh += dt * 2.2; } else if (R.pose === 'walk') R.pose = 'idle';
    // thrown pebbles
    for (const s of R.shots) {
      s.t += dt;
      if (!s.landed && s.t >= s.dur) {
        s.landed = true;
        const heard = noise(s.b.u, s.b.v, PEBBLE_EAR, 'pebble');
        sfx('pebble');
        toast(heard.length ? 'Clatter! ' + whoList(heard) + (heard.length > 1 ? ' go' : ' goes') + ' to see what that was.' : 'Clatter... but nobody is near enough to hear it.', 2.6);
      }
    }
    R.shots = R.shots.filter((s) => s.t < s.dur + 0.6);
    for (const p of R.people) updPerson(p, dt);
  }

  function noise(u, v, radius, kind) {
    const R = S.room, heard = [];
    for (const p of R.people) {
      if (down(p) || p.state === 'away' || p.state === 'leaving') continue;
      const d = fdist(p, { u, v });
      if (p.state === 'sleep') { if (d < 70) p.stir += 0.55; continue; }
      if (d <= radius) {
        p.state = 'investigate'; p.investU = u; p.look = 0; p.f = Math.sign(u - p.u) || p.f; p.wp = null; p.act = null; p.hold = 0;
        p.said = kind === 'pebble' ? '?' : null;
        heard.push(p);
      }
    }
    return heard;
  }

  function wake(p) {
    p.state = 'idle'; p.onBed = false; p.v = p.lane;
    p.f = Math.sign(S.room.u - p.u) || 1; p.meter = 0.5; p.turnT = 0;
    sfx('huh');
  }

  function updPerson(p, dt) {
    const R = S.room;
    if (down(p)) return;
    const walkTo = (u) => {
      const d = u - p.u;
      if (Math.abs(d) < 0.004) { p.u = u; return true; }
      p.f = Math.sign(d); p.u += Math.sign(d) * Math.min(Math.abs(d), 0.09 * dt); p.ph += dt * 1.6;
      return false;
    };
    p.moving = false;
    // walking a list of waypoints across the floor: out through the door and back
    const walkWp = () => {
      if (p.hold > 0) { p.hold -= dt; if (p.hold <= 0) p.wp.shift(); return !p.wp.length; }
      const w = p.wp[0], du = w.u - p.u, dv = w.v - p.v, d = Math.hypot(du * FX, dv * FY);
      p.moving = true; p.ph += dt * 1.6;
      if (Math.abs(du) > 0.002) p.f = Math.sign(du);
      if (d < 1) {
        p.u = w.u; p.v = w.v;
        if (w.wait) { p.hold = w.wait; w.wait = 0; p.moving = false; return false; }
        p.wp.shift(); return !p.wp.length;
      }
      const k = Math.min(d, 30 * dt) / d; p.u += du * k; p.v += dv * k;
      return false;
    };
    const dist = fdist(p, R);
    switch (p.state) {
      case 'sleep':
        p.stir = Math.max(0, p.stir - dt * 0.05);
        if (R.act && dist < 90) p.stir += dt * 0.28 * (R.act.spot.kind === 'strongbox' ? 1.4 : 1);
        if (!R.hidden && R.pose === 'walk' && dist < 35) p.stir += dt * 0.12;
        if (p.stir >= 1) wake(p);
        return;
      case 'idle':
        if (p.def.turnEvery) {
          p.turnT -= dt * (p.wary ? 1.6 : 1);
          if (p.turnT <= 0) { p.f = -p.f; p.turnT = p.f === p.def.face ? p.def.turnEvery : 2.2; }
        }
        break;
      case 'patrol': {
        const [a, b] = p.route;
        if (p.pause > 0) { p.pause -= dt; if (p.pause <= 0) p.f = -p.f; break; }
        p.moving = true;
        if (walkTo(p.f > 0 ? b : a)) { p.pause = 1.6; p.moving = false; }
        break;
      }
      case 'investigate':
        if (p.look <= 0 && p.investU != null) {
          p.moving = true;
          if (walkTo(p.investU + (p.u < p.investU ? -0.05 : 0.05))) { p.look = 4; p.moving = false; p.f = Math.sign(p.investU - p.u) || p.f; }
        } else {
          p.look -= dt;
          if (p.look <= 0) { p.state = 'return'; p.investU = null; }
        }
        break;
      case 'search':
        // not sure what they saw: walk over, then look both ways for a while
        if (p.investU != null && p.look <= 0) {
          p.moving = true;
          if (walkTo(p.investU + (p.u < p.investU ? -0.04 : 0.04))) { p.look = 5; p.moving = false; p.turnT = 1.3; }
        } else {
          p.look -= dt; p.turnT -= dt;
          if (p.turnT <= 0) { p.f = -p.f; p.turnT = 1.3; }
          if (p.look <= 0) { p.state = 'return'; p.investU = null; p.said = null; }
        }
        break;
      case 'routine': {
        const st = p.plan[p.si];
        if (p.wp) {
          if (walkWp()) { p.wp = null; p.act = st.act; p.f = st.face; p.doing = st.dur * (0.85 + ((p.si * 37 + p.cycle * 13) % 10) / 33); }
          break;
        }
        p.doing -= dt;
        if (p.doing <= 0) {
          p.act = null; p.cycle++;
          p.si = (p.si + 1) % p.plan.length;
          p.wp = routeTo(p, p.plan[p.si]);
        }
        break;
      }
      case 'return':
        if (p.wp) { if (walkWp()) p.wp = null; break; }
        if (p.plan) { p.state = 'routine'; p.act = null; p.hold = 0; p.wp = routeTo(p, p.plan[p.si]); break; }
        p.moving = true;
        if (walkTo(p.route ? p.route[0] : p.home)) {
          p.moving = false;
          p.state = p.route ? 'patrol' : 'idle';
          p.f = p.route ? 1 : p.def.face;
          p.turnT = p.def.turnEvery || 0;
        }
        break;
      case 'leaving':
        // straight across the floor to just in front of the door, and out through it
        if (!p.wp) p.wp = [{ u: 0.92, v: DOOR_V }, { u: 1.06, v: DOOR_V }];
        if (walkWp()) { p.state = 'away'; p.away = 11; p.wp = null; }
        return;
      case 'away':
        p.away -= dt;
        if (p.away <= 0) {
          p.state = 'return'; p.u = 1.06; p.v = DOOR_V;
          p.wp = [{ u: 0.92, v: DOOR_V }, { u: Math.min(0.9, p.route ? p.route[1] : p.home), v: p.lane }];
        }
        return;
    }
    // what they can see: a cone across the floor the way they face
    if (R.caught > 0) return;
    const dU = (R.u - p.u) * FX, dV = (R.v - p.v) * FY;
    const sv = sightOf(p), sight = Math.max(1, sv.range);
    let seeing = false;
    if (!R.hidden) {
      if (dist < (sv.away ? 22 : 18)) seeing = true;
      else if (!sv.away && Math.sign(dU) === p.f && dist < sight && Math.abs(dV) <= Math.abs(dU) * 0.75 + 14) seeing = true;
    }
    // Two stages, the way Mark of the Ninja does it. A first clear look only makes
    // them unsure: they come over and search. Only a second clear look while they
    // are already searching raises the house.
    const searching = p.state === 'search';
    if (seeing) {
      p.meter += dt * (0.25 + 0.8 * (1 - Math.min(1, dist / sight))) * (R.act ? 1.2 : 1) * (searching ? 1.5 : 1);
      if (searching) p.investU = R.u;
    } else p.meter = Math.max(0, p.meter - dt * 0.3);
    if (p.meter >= 1) {
      if (!searching) {
        p.act = null; p.hold = 0;
        p.state = 'search'; p.investU = R.u; p.look = 0; p.meter = 0.3; p.said = '?';
        sfx('huh');
        toast(INNOCENT[p.kind] ? '"Hello? Is someone there?"' : '"Who is there?"', 1.8);
      } else {
        p.meter = 1; p.said = '!';
        R.caught = 1.1; R.act = null; R.path = null; R.aim = null;
        sfx('alert');
        toast(INNOCENT[p.kind] ? 'A shout: "Thief! Guards!"' : 'Caught!');
      }
    }
  }

  // ---- what people do in their rooms ----
  // Nobody paces all night. Each occupant has jobs at the room's furniture — the
  // clerk writes at the desk, the cook stirs the pot — and walks from one to the
  // next, stopping halfway to look about. Busy at a job with their back to the room
  // they notice only what comes right up behind them; gazing out of a window they
  // see only a short way. The walk between jobs is when they are dangerous.
  const ACTS = {
    clerk: [['desk', 'write', 9], ['shelf', 'browse', 5], ['window', 'gaze', 5], ['cabinet', 'fetch', 4]],
    guard: [['window', 'gaze', 6], ['rack', 'fetch', 4], ['fireplace', 'warm', 6], ['table', 'prep', 5], ['desk', 'write', 6], ['chest', 'fetch', 4]],
    cook: [['fireplace', 'cook', 9], ['table', 'prep', 8], ['barrel', 'fetch', 4], ['cabinet', 'fetch', 4]],
    abbot: [['altar', 'pray', 9], ['lectern', 'browse', 6], ['window', 'gaze', 5]],
    magistrate: [['desk', 'write', 9], ['table', 'prep', 5], ['shelf', 'browse', 5], ['window', 'gaze', 5]],
    countess: [['desk', 'write', 8], ['balcony', 'lookout', 7], ['fireplace', 'warm', 5], ['window', 'gaze', 4]],
    servant: [['table', 'prep', 7], ['cabinet', 'fetch', 4], ['shelf', 'browse', 5], ['fireplace', 'warm', 5], ['window', 'gaze', 5]],
  };
  function buildPlan(p, spots, i) {
    const list = ACTS[p.kind];
    if (!list) return null;
    const plan = [], nudge = i % 2 ? 0.05 : 0;
    for (const [kind, act, dur] of list) {
      if (kind === 'window') { plan.push({ u: 0.08 + nudge, v: 0.12, act, dur, face: -1 }); continue; }
      const sp = spots.find((q) => q.kind === kind);
      if (!sp) continue;
      const v = sp.wall ? V_MIN + 0.02 : Math.min(V_MAX, sp.v + sp.dv + 0.03);
      plan.push({ u: Math.min(0.92, sp.u + nudge), v, act, dur, face: 1 });
    }
    return plan.length >= 2 ? plan : null;
  }
  // start at the job furthest from the sill, already busy at it
  function startRoutine(p) {
    const sill = { u: SILL.u, v: V_MAX };
    let si = 0;
    p.plan.forEach((st, i) => { if (fdist(st, sill) > fdist(p.plan[si], sill)) si = i; });
    const st = p.plan[si];
    Object.assign(p, { state: 'routine', si, u: st.u, v: st.v, f: st.face, act: st.act, doing: st.dur, wp: null, hold: 0, cycle: 0 });
  }
  // the way to the next job: out to the walkway, halfway across, a look round, on
  function routeTo(p, st) {
    const mid = (p.u + st.u) / 2;
    return [{ u: p.u, v: p.lane }, { u: mid, v: p.lane, wait: 1.6 }, { u: st.u, v: p.lane }, { u: st.u, v: st.v }];
  }
  // How far someone sees just now. Busy at a job facing the furniture: only what is
  // at their elbow. Gazing out of a window: a short way.
  function sightOf(p) {
    const R = S.room;
    const range = ROOM_SIGHT * (R.dark ? 0.5 : 1) * (p.wary ? 1.1 : 1);
    if (p.state === 'routine' && p.act && !p.wp) {
      if (p.act === 'gaze') return { range: range * 0.45, away: false };
      return { range: 0, away: true };
    }
    return { range, away: false };
  }

  // A patrol starts at the end of its walk furthest from the sill she climbs in by,
  // facing the wall, and waits there a moment before it turns and comes back.
  function farEnd(p) {
    const [a, b] = p.route;
    const far = Math.abs(a - SILL.u) > Math.abs(b - SILL.u) ? a : b;
    p.u = far; p.f = far === a ? -1 : 1; p.pause = 2.5;
  }

  // Caught: she is back out on the sill, the room settles to how it was when she
  // came in, and the house is warier. No heart lost; the alarm still counts.
  function resetRoom() {
    const R = S.room;
    S.lv.alarms++; S.run.stats.alarms++;
    R.rs.wary = true;
    for (const p of R.people) {
      if (down(p)) continue;
      p.state = p.state === 'sleep' ? 'sleep' : (p.route ? 'patrol' : 'idle');
      if (p.state !== 'sleep') { p.onBed = false; p.v = p.lane; }
      p.u = p.route ? p.route[0] : p.home;
      p.f = p.route ? 1 : p.def.face;
      if (p.plan && p.state !== 'sleep') startRoutine(p); else if (p.state === 'patrol') farEnd(p);
      p.meter = 0; p.stir = 0; p.investU = null; p.look = 0; p.pause = 0; p.said = null; p.wp = null;
      p.turnT = p.def.turnEvery || 0; p.wary = true;
    }
    R.u = SILL.u; R.v = V_MAX; R.f = 1; R.pose = 'idle'; R.shots = []; R.climbIn = CLIMB_IN; R.peek = false; R.peeked = false;
    R.hidden = R.spots[0];
    toast('You drop back onto the sill until the room settles. They will be warier now.', 3.5);
  }

  // ---- the ways to deal with the target ----
  // Each is found as intel on the way up and needs things carried to the final room.
  const methodOf = (sp) => (sp && sp.method && LEVELS[S.li].methods.find((m) => m.id === sp.method)) || null;
  const knownM = (m) => has(m.intel) || (S.run.intel || []).includes(m.intel);
  const missingFor = (m) => m.needs.filter((n) => !has(n));
  const itemName = (id) => ITEM_NAMES[id].replace(/^The /, 'the ');
  const KIND_WORD = { execute: 'kills', blackmail: 'ruins', spare: 'spares' };

  function finishMethod(m) {
    const L = LEVELS[S.li], st = S.run.stats;
    if (m.kind === 'execute') st.executions++; else if (m.kind === 'blackmail') st.blackmails++; else st.spared++;
    S.run.choices.push({ level: L.id, target: m.kind, method: m.id });
    S.paused = true;
    showCard({
      title: m.name,
      body: '<p>' + esc(m.outcome) + '</p>',
      actions: [{ label: 'Go on', fn: () => { S.paused = false; lootChoice(); } }],
    });
    renderLog();
  }

  // climbing back out of the final room is leaving them be — after asking
  function leaveFinale() {
    const L = LEVELS[S.li];
    S.paused = true;
    showCard({
      title: 'Leave ' + L.target + ' be?',
      body: '<p>Climb back out without doing anything, and ' + esc(L.target) + ' wakes up tomorrow exactly who ' + (L.pron === 'her' ? 'she' : 'he') + ' was yesterday.</p>',
      actions: [
        { label: 'Leave ' + L.pron + ' be', sub: 'Take what you came for and go', fn: () => { S.paused = false; finishMethod({ id: 'spare', kind: 'spare', name: 'Mercy, of a kind', outcome: L.finale.spare }); } },
        { label: 'Not yet', sub: 'Stay in the room', fn: () => { hideCard(); S.paused = false; } },
      ],
    });
  }

  // The thing E would use: the nearest within arm's reach.
  function nearestSpot() {
    const R = S.room;
    let best = null, bd = 24;
    for (const s of R.spots) {
      const mm = methodOf(s);
      if (SPOT[s.kind].verb === 'none' && !(mm && knownM(mm))) continue;
      let q;
      if (s.kind === 'window') q = { u: SILL.u, v: V_MAX };
      else {
        const hu = halfU(s);
        q = { u: Math.max(s.u - hu, Math.min(s.u + hu, R.u)), v: s.wall ? 0.04 : Math.max(s.v - s.dv, Math.min(s.v + s.dv, R.v)) };
      }
      const d = fdist(R, q);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  function doSpot(sp) {
    const R = S.room, m = SPOT[sp.kind];
    R.view = 'side';
    const mm = methodOf(sp);
    if (mm && knownM(mm)) {
      R.f = Math.sign(sp.u - R.u) || R.f;
      const miss = missingFor(mm);
      if (miss.length) { toast('For this you need ' + miss.map(itemName).join(' and ') + '.', 2.4); return; }
      R.act = { spot: sp, t: 0, dur: 1.8, method: mm };
      R.pose = 'reach';
      sfx('rummage');
      return;
    }
    R.f = Math.sign(sp.u - R.u) || R.f;
    switch (m.verb) {
      case 'exit': if (R.id === 'T') leaveFinale(); else leaveRoom(false); break;
      case 'hide': hideIn(sp); break;
      case 'snuff':
        sp.out = !sp.out; R.dark = sp.out; R.rs.out = sp.out;
        toast(sp.out ? 'You pinch out the candle. The room goes dim.' : 'You light the candle again.', 2);
        sfx('snuff');
        break;
      case 'bell': {
        let n = 0;
        for (const p of R.people) {
          if ((p.kind === 'cook' || p.kind === 'servant') && !down(p) && p.state !== 'sleep') { p.state = 'leaving'; p.wp = null; p.act = null; p.hold = 0; n++; }
        }
        sp.ringT = S.t + 2.5;
        sfx('bell');
        toast(n ? 'You tug a wire and one of the bells jangles. "That is the master\'s room again," and off they go upstairs to answer it.'
          : 'The bell jangles. Nobody here answers bells.', 3);
        if (!n) noise(sp.u, 0.1, 400, 'bell');
        break;
      }
      case 'search':
        if (sp.done && HIDEABLE[sp.kind]) { hideIn(sp); break; }
        if (sp.done) { toast('Already searched.', 1.2); break; }
        if (sp.needs && !has(sp.needs)) { toast('Locked. It wants ' + ITEM_NAMES[sp.needs].replace(/^The /, 'the ') + '.'); sfx('locked'); break; }
        R.act = { spot: sp, t: 0, dur: sp.kind === 'strongbox' ? 1.0 : 0.6 };
        R.pose = 'reach';
        sfx('rummage');
        break;
    }
  }

  // Wardrobes, curtains and cupboards all take a hiding thief. Up steps into one;
  // E does too, except on a cupboard not yet searched, where E searches it.
  const HIDEABLE = { wardrobe: 1, curtain: 1, cabinet: 1 };
  function hideIn(sp) {
    const R = S.room;
    R.act = null;
    R.hidden = sp; sp.occupied = true; R.u = sp.u; R.v = V_MIN + 0.01;
    toast('Hidden in the ' + LABEL[sp.kind].toLowerCase() + '. Move to step out.', 1.8);
  }

  function completeSearch(sp) {
    const R = S.room;
    sp.done = true; R.rs.done[sp.i] = true;
    S.run.stats.searched++;
    const got = [];
    for (const l of sp.loot || []) got.push(grant(l, sp));
    if (!got.length) toast('Nothing worth taking.', 1.4);
  }

  function grant(l, sp) {
    const run = S.run;
    switch (l.t) {
      case 'knife':
        if (run.knife) { toast('You already carry a knife.', 1.6); return l; }
        S.paused = true;
        showCard({
          title: 'A knife',
          body: '<p>A long knife, sharp enough for the job.</p><p>Carry it and you can kill: a guard from behind, a sleeper in bed, or a guard pulled off his ledge from below. Leave it, and Wren never kills anyone &mdash; she puts them to sleep and moves on.</p>',
          actions: [
            { label: 'Take it', cls: 'red', sub: 'From now on you can kill', fn: () => { run.knife = true; hideCard(); S.paused = false; syncPad(); sfx('item'); toast('The knife goes in your belt.', 2); } },
            { label: 'Leave it', sub: 'You can come back for it', fn: () => { hideCard(); S.paused = false; if (sp && S.room) { sp.done = false; S.room.rs.done[sp.i] = false; } } },
          ],
        });
        return l;
      case 'silver': run.silver += l.n; toast('+' + l.n + ' silver', 1.6); sfx('coin'); return l;
      case 'pebbles': case 'darts': case 'picks': {
        run.inv[l.t] += l.n;
        const name = { pebbles: 'pebble', darts: 'sleep dart', picks: 'lockpick' }[l.t];
        toast('+' + l.n + ' ' + name + (l.n > 1 ? 's' : ''), 1.6); sfx('coin'); syncPad(); return l;
      }
      case 'heal':
        run.hearts = Math.min(MAX_HEARTS, run.hearts + 1);
        toast('Bread and a cup of small beer. You feel better.', 2); sfx('coin'); return l;
      case 'note':
        toast(l.text, 5); return l;
      case 'intel': {
        run.intel = run.intel || [];
        if (!run.intel.includes(l.id)) run.intel.push(l.id);
        const m = LEVELS[S.li].methods.find((q) => q.intel === l.id);
        S.paused = true;
        showCard({ title: l.title, body: '<p>' + esc(l.text) + '</p>' + (m ? '<p class="dim">A new way to deal with ' + esc(LEVELS[S.li].target) + ' is in your log: <b>' + esc(m.name) + '</b>.</p>' : ''), actions: [{ label: 'Go on', fn: () => { hideCard(); S.paused = false; } }] });
        sfx('item'); renderLog();
        return l;
      }
      case 'item':
        if (!run.items.includes(l.id)) run.items.push(l.id);
        sfx('item');
        {
          const m = LEVELS[S.li].methods.find((q) => q.intel === l.id);
          if (l.doc) {
            S.paused = true;
            showCard({ title: l.name, body: '<p>' + esc(l.doc) + '</p>' + (m ? '<p class="dim">A new way to deal with ' + esc(LEVELS[S.li].target) + ' is in your log: <b>' + esc(m.name) + '</b>.</p>' : ''), actions: [{ label: 'Take it', fn: () => { hideCard(); S.paused = false; } }] });
          } else toast('Found: ' + l.name, 3);
        }
        renderLog();
        return l;
    }
    return null;
  }

  // ---- pebbles and darts, aimed with the keys ----
  // 1 or 2 picks one up; the arrows step through what it could be aimed at,
  // nearest first the way she faces; E lets fly; Esc puts it away.
  function aimTargets() {
    const R = S.room;
    if (!R || !R.aim) return [];
    if (R.aim.kind === 'pebbles') return R.spots.filter((s) => s.kind !== 'window').sort((a, b) => a.u - b.u);
    return R.people.filter((p) => !down(p) && p.state !== 'away' && p.state !== 'leaving').sort((a, b) => a.u - b.u);
  }
  function startAim(kind) {
    const R = S.room;
    if (!R || R.caught > 0 || R.busy > 0) return;
    if (R.aim && R.aim.kind === kind) { R.aim = null; syncPad(); return; }
    if (S.run.inv[kind] <= 0) { toast(kind === 'darts' ? 'No sleep darts.' : 'No pebbles.'); return; }
    R.aim = { kind, i: 0 };
    if (kind === 'pebbles' && !S.run.pebbleTold) {
      S.run.pebbleTold = true;
      toast('A pebble is a distraction: throw it at something, and whoever hears it land walks over to look, turning their back on you for a while.', 6);
    }
    const ts = aimTargets();
    if (!ts.length) { R.aim = null; toast(kind === 'darts' ? 'Nobody to dart.' : 'Nothing to throw at.'); syncPad(); return; }
    let best = 0, bd = 1e9;
    ts.forEach((t, i) => { const d = (t.u - R.u) * R.f; const score = d > 0.02 ? d : 10 - d; if (score < bd) { bd = score; best = i; } });
    R.aim.i = best;
    R.act = null; R.path = null;
    syncPad();
  }
  function aimStep(d) { const ts = aimTargets(); if (ts.length) S.room.aim.i = (S.room.aim.i + d + ts.length) % ts.length; }
  function aimFire() {
    const R = S.room, ts = aimTargets(), t = ts[R.aim.i], kind = R.aim.kind;
    R.aim = null;
    if (t) { if (kind === 'pebbles') throwPebble(t); else fireDart(t); }
    syncPad();
  }

  // Where a pebble thrown at a spot lands, and who is close enough to hear it and go
  // and look. Used for the throw itself and for showing it before she throws.
  const PEBBLE_EAR = 200;
  const pebbleLanding = (sp) => ({ u: sp.u, v: sp.wall ? 0.06 : sp.v + sp.dv });
  function pebbleListeners(sp) {
    const at = pebbleLanding(sp);
    return S.room.people.filter((p) => !down(p) && p.state !== 'away' && p.state !== 'leaving' && p.state !== 'sleep' && fdist(p, at) <= PEBBLE_EAR);
  }
  const whoList = (ps) => {
    const names = ps.map((p) => WHO[p.kind] || 'someone');
    const s2 = names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : names[0];
    return s2.charAt(0).toUpperCase() + s2.slice(1);
  };

  function throwPebble(sp) {
    const R = S.room;
    if (S.run.inv.pebbles <= 0) { toast('No pebbles left.'); return; }
    S.run.inv.pebbles--;
    R.f = Math.sign(sp.u - R.u) || R.f;
    R.pose = 'throw'; R.busy = 0.3;
    if (R.hidden) { R.hidden.occupied = false; R.hidden = null; }
    const b = pebbleLanding(sp);
    R.shots.push({ a: { u: R.u, v: R.v }, b, t: 0, dur: 0.25 + fdist(R, b) / 500 });
    sfx('throw');
    syncPad();
  }

  function fireDart(p) {
    const R = S.room;
    if (S.run.inv.darts <= 0) { toast('No darts left.'); return; }
    if (down(p)) return;
    if (fdist(p, R) > 240) { toast('Too far for a dart.'); return; }
    S.run.inv.darts--;
    R.f = Math.sign(p.u - R.u) || R.f; R.pose = 'throw'; R.busy = 0.3;
    p.state = 'ko'; p.meter = 0;
    S.run.stats.subdues++;
    sfx('dart');
    toast('The dart finds its mark. Down they go, snoring.', 2);
    syncPad();
  }

  function roomTakedownTarget() {
    const R = S.room;
    if (!R || R.caught > 0 || R.busy > 0 || R.act || R.aim) return null;
    for (const p of R.people) {
      if (down(p) || p.state === 'away' || p.state === 'leaving') continue;
      if (fdist(p, R) > 28) continue;
      const unaware = p.state === 'sleep' || p.meter < 0.9;
      const facingAway = Math.sign(p.u - R.u) === p.f || p.state === 'sleep';
      if (unaware && facingAway) return p;
    }
    return null;
  }

  function roomTakedown(lethal) {
    const R = S.room, p = roomTakedownTarget();
    if (!p) return false;
    if (TARGET[p.kind]) {
      if (!lethal || !S.run.knife) { toast(lethal ? 'You carry no blade.' : 'Knocking ' + LEVELS[S.li].pron + ' out settles nothing.', 1.8); return false; }
      p.state = 'dead'; R.busy = 0.7; R.pose = 'crouch'; sfx('stab');
      finishMethod({ id: 'knife', kind: 'execute', name: 'By your own hand', outcome: LEVELS[S.li].finale.knife });
      return true;
    }
    if (lethal && !S.run.knife) { toast('You carry no blade. E knocks them out.', 1.8); return false; }
    R.f = Math.sign(p.u - R.u) || R.f;
    R.busy = 0.7; R.pose = 'crouch';
    if (R.hidden) { R.hidden.occupied = false; R.hidden = null; }
    p.state = lethal ? 'dead' : 'ko';
    if (lethal) {
      if (INNOCENT[p.kind]) { S.run.stats.innocents++; toast('They were only doing their job. The Lowmarket will hear of this.', 3.5); }
      else { S.run.stats.kills++; toast('Killed.', 1.4); }
      sfx('stab');
    } else { S.run.stats.subdues++; toast('Out cold.', 1.4); sfx('thud'); }
    return true;
  }

  // ---------- the confrontation ----------
  function lootChoice() {
    const L = LEVELS[S.li], n = S.run.silver;
    showCard({
      title: 'The silver',
      body: '<p>You come down from ' + esc(L.where) + ' with <b>' + n + ' silver</b> in your coat.</p><p class="dim">The Lowmarket is hungry. The fence on Tallow Lane sells darts and picks.</p>',
      actions: [
        { label: 'Give it to the Lowmarket', sub: 'Every coin, tonight', fn: () => { S.run.given += n; S.run.silver = 0; S.run.choices[S.run.choices.length - 1].silver = 'give'; afterLoot('The soup kitchens on Tallow Lane light their fires. Somebody chalks a sparrow on the abbey door.'); } },
        { label: 'Keep it', sub: 'Tools of the trade cost money', fn: () => { S.run.kept += n; S.run.choices[S.run.choices.length - 1].silver = 'keep'; afterLoot('You sleep on a mattress stuffed with silver. The Lowmarket does not sleep at all.'); } },
      ],
    });
  }

  function afterLoot(text) {
    const last = S.li >= LEVELS.length - 1;
    showCard({
      title: 'Contract done',
      body: '<p>' + esc(text) + '</p>' + statsHtml(),
      actions: [{ label: last ? 'The end' : 'To the fence', fn: () => (last ? ending() : fence()) }],
    });
  }

  function statsHtml() {
    const s = S.run.stats;
    const rows = [
      ['Silver given', S.run.given], ['Silver kept', S.run.kept],
      ['Knocked out', s.subdues], ['Killed', s.kills], ['Innocents killed', s.innocents],
      ['Alarms', s.alarms], ['Deaths', s.deaths],
    ];
    return '<table class="stats">' + rows.map((r) => '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td></tr>').join('') + '</table>';
  }

  const SHOP = [
    { id: 'pebbles', label: 'Three pebbles', cost: 2, give: () => { S.run.inv.pebbles += 3; } },
    { id: 'darts', label: 'A sleep dart', cost: 5, give: () => { S.run.inv.darts += 1; } },
    { id: 'picks', label: 'A lockpick', cost: 4, give: () => { S.run.inv.picks += 1; } },
    { id: 'mend', label: 'A night\'s rest (all hearts)', cost: 3, give: () => { S.run.hearts = MAX_HEARTS; } },
    { id: 'knife', label: 'A knife (lets you kill)', cost: 3, give: () => { S.run.knife = true; } },
  ];
  function fence(msg) {
    S.mode = 'card';
    const run = S.run;
    showCard({
      title: 'Old Mag, the fence',
      body: '<p>' + esc(msg || '"Back again, sparrow? Silver talks. Let\'s hear it."') + '</p><p class="dim">You have <b>' + run.silver + ' silver</b>, ' + run.inv.pebbles + ' pebbles, ' + run.inv.darts + ' darts, ' + run.inv.picks + ' picks, ' + run.hearts + '/' + MAX_HEARTS + ' hearts.</p>',
      actions: SHOP.map((it) => ({
        label: it.label + ' — ' + it.cost + ' silver', disabled: run.silver < it.cost || (it.id === 'mend' && run.hearts >= MAX_HEARTS) || (it.id === 'knife' && run.knife),
        fn: () => { run.silver -= it.cost; run.kept = Math.max(0, run.kept); it.give(); sfx('coin'); fence('"Pleasure. Anything else?"'); },
      })).concat([{ label: 'Out into the night', cls: 'go', fn: () => { hideCard(); levelIntro(S.li + 1); } }]),
    });
  }

  function consequence() {
    const c = S.run.choices[S.run.choices.length - 1];
    if (!c) return '';
    const who = { abbey: 'Crane', assize: 'Voss' }[c.level];
    const line = {
      execute: 'All Vell knows what happened to ' + who + '. The Watch has doubled its patrols, and the talk in the Lowmarket is half gratitude and half fear.',
      blackmail: 'Everyone is talking about ' + who + '\'s disgrace. Nobody is talking about the sparrow who arranged it.',
      spare: who + ' lives, and says loudly that the thief was a coward.',
    }[c.target];
    const bloody = chaos(S.run) >= 3 ? ' There are more guards on the walls tonight, and they know what you do to them.' : '';
    return '<p class="dim">' + esc(line + bloody) + '</p>';
  }

  function levelIntro(li) {
    S.mode = 'card'; S.scene = 'title'; S.introLi = li;
    const L = LEVELS[li];
    S.run.hearts = Math.max(S.run.hearts, 1);
    showCard({
      title: L.name,
      body: (li > 0 ? consequence() : '') + L.intro.map((p) => '<p>' + esc(p) + '</p>').join('') + '<ul class="obj">' + L.objectives.map((o) => '<li>' + esc(o.text) + '</li>').join('') + '</ul>',
      actions: [{ label: 'Begin', cls: 'go', fn: () => { hideCard(); S.run.items = []; S.run.intel = []; startLevel(li); } }],
    });
  }

  function ending() {
    const run = S.run, s = run.stats, c = chaos(run);
    const generous = run.given >= run.kept;
    const low = c < 3 && s.innocents === 0;
    let title, text;
    if (low && generous) { title = 'The Sparrow of Vell'; text = 'Three golden roofs, and not one of them could keep you out. The Lowmarket eats this winter, and nobody can say who fed it. Children chalk sparrows on every door.'; }
    else if (!low && generous) { title = 'The Red Hood'; text = 'The Lowmarket eats this winter, and it is afraid of you. Vell\'s rich lock their doors and sleep with a guard at the foot of the bed. Some say you set the city free. Some say you only changed who it fears.'; }
    else if (low && !generous) { title = 'A Quiet Fortune'; text = 'You were never caught and you never bled anyone. You also never gave a coin away. Somewhere in the Lowmarket a family starved beside a sparrow chalked on the wall, and you bought a house on the hill.'; }
    else { title = 'The New Tyrant'; text = 'The Abbot, the Magistrate, the Countess — and now you. You took their silver and their lives and kept both. Vell has a new master, and it wears a hood.'; }
    if (s.innocents > 0) text += ' The innocents you killed are remembered by name in the Lowmarket. Yours is spat.';
    S.mode = 'card';
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* nothing to clear */ }
    showCard({
      title, body: '<p>' + esc(text) + '</p>' + statsHtml(),
      actions: [{ label: 'Begin again', cls: 'go', fn: () => { hideCard(); newGame(); } }],
    });
  }

  function newGame() {
    S.run = freshRun();
    S.snap = null;
    levelIntro(0);
  }

  // ---------- cards ----------
  const card = $('card');
  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function showCard(o) {
    card.hidden = false;
    card.querySelector('h2').textContent = o.title;
    card.querySelector('.card-body').innerHTML = o.body || '';
    card.classList.toggle('high', !!o.portrait);
    card.classList.toggle('low', !!o.low);
    const box = card.querySelector('.card-actions');
    box.innerHTML = '';
    (o.actions || []).forEach((a, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'choice' + (a.cls ? ' ' + a.cls : '');
      b.innerHTML = '<span>' + esc(a.label) + '</span>' + (a.sub ? '<small>' + esc(a.sub) + '</small>' : '');
      b.disabled = !!a.disabled;
      b.addEventListener('click', () => { if (!b.disabled) { sfx('click'); a.fn(); } });
      box.appendChild(b);
      if (i === 0) setTimeout(() => { try { b.focus({ preventScroll: true }); } catch (e) { /* ok */ } }, 30);
    });
  }
  function hideCard() { card.hidden = true; }

  // ---------- toasts and HUD ----------
  function toast(text, secs, title) {
    S.toasts = S.toasts.filter((t) => t.text !== text);
    S.toasts.push({ text, t: secs || 2.6, title: !!title });
    if (S.toasts.length > 3) S.toasts.shift();
    const el = $('say');
    if (el && !title) { el.textContent = text; el.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(() => el.classList.remove('on'), (secs || 2.6) * 1000); }
  }

  function heart(c, x, y, full) {
    const px = [[1, 0], [2, 0], [4, 0], [5, 0], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [2, 4], [3, 4], [4, 4], [3, 5]];
    c.fillStyle = '#120c0a';
    for (const [a, b] of px) c.fillRect(x + a * 2 + 1, y + b * 2 + 1, 2, 2);
    for (const [a, b] of px) { c.fillStyle = full ? (b === 1 && a < 3 ? '#f07a6a' : '#b8302a') : '#3a2a28'; c.fillRect(x + a * 2, y + b * 2, 2, 2); }
  }
  function coin(c, x, y) {
    c.fillStyle = '#120c0a'; c.fillRect(x + 1, y + 1, 8, 8);
    c.fillStyle = '#c9c6bc'; c.fillRect(x, y + 1, 8, 6); c.fillRect(x + 1, y, 6, 8);
    c.fillStyle = '#f0ede4'; c.fillRect(x + 1, y + 1, 3, 2);
    c.fillStyle = '#8a8880'; c.fillRect(x + 3, y + 3, 2, 3);
  }

  // pebble, dart, lockpick: 10x10 each
  function invIcon(c, k, x, y) {
    const px = (a, b, w, h, col) => { c.fillStyle = col; c.fillRect(x + a, y + b, w, h); };
    if (k === 'pebbles') {
      px(1, 3, 8, 6, '#120c0a'); px(1, 2, 7, 6, '#8a8478'); px(2, 1, 5, 1, '#8a8478'); px(2, 2, 3, 2, '#c8c2b4'); px(5, 6, 3, 1, '#5e594f');
    } else if (k === 'knife') {
      for (let i = 0; i < 6; i++) { px(3 + i, 7 - i, 2, 2, '#120c0a'); px(3 + i, 6 - i, 1, 1, '#d8e0e6'); px(4 + i, 6 - i, 1, 1, '#98a4ac'); }
      px(0, 7, 4, 2, '#5a3a24'); px(1, 6, 2, 1, '#c9a13e');
    } else if (k === 'darts') {
      for (let i = 0; i < 7; i++) { px(1 + i, 8 - i, 2, 2, '#120c0a'); px(1 + i, 7 - i, 1, 1, '#b8c4cc'); }
      px(0, 7, 3, 3, '#6aa060'); px(1, 8, 1, 1, '#3e6a3a');
    } else {
      px(1, 1, 5, 5, '#120c0a'); px(0, 0, 5, 5, '#c9a13e'); px(1, 1, 3, 3, '#120c0a'); px(1, 1, 1, 1, '#f0d890');
      for (let i = 0; i < 5; i++) px(4 + i, 4 + i, 2, 1, '#c9a13e');
      px(8, 7, 1, 3, '#c9a13e');
    }
  }

  function drawHud(c) {
    if (S.noHud || (S.mode !== 'ext' && S.mode !== 'room')) return;
    // a strip across the top, the way the old phones framed their games
    c.fillStyle = 'rgba(10,8,7,0.72)'; c.fillRect(0, 0, VW, 18);
    c.fillStyle = 'rgba(200,180,140,0.25)'; c.fillRect(0, 18, VW, 1);
    for (let i = 0; i < MAX_HEARTS; i++) heart(c, 5 + i * 17, 4, i < S.run.hearts);
    coin(c, 60, 4); drawText(c, String(S.run.silver), 72, 5, '#e8e2cc', 2);
    let x = 108;
    const inv = S.run.inv;
    for (const k of ['pebbles', 'darts', 'picks']) {
      invIcon(c, k, x, 4);
      drawText(c, String(inv[k]), x + 12, 5, '#e8e2cc', 2);
      x += 12 + textWidth(String(inv[k]), 2) + 9;
    }
    if (S.run.knife) invIcon(c, 'knife', x, 4);
    // the objective, top right
    const L = LEVELS[S.li];
    // context prompt
    const pr = promptText();
    if (pr) {
      // in a room the bottom middle is the way out, so the prompt goes up under the HUD
      const wdt = textWidth(pr, 2) + 12, py = S.mode === 'room' ? 22 : VH - 22;
      c.fillStyle = 'rgba(10,8,7,0.8)'; c.fillRect(Math.round(VW / 2 - wdt / 2), py, wdt, 17);
      c.fillStyle = 'rgba(224,200,144,0.5)'; c.fillRect(Math.round(VW / 2 - wdt / 2), py + 16, wdt, 1);
      drawText(c, pr, VW / 2, py + 5, '#f0e2c0', 2, 'center');
    }
  }

  function promptText() {
    if (S.mode === 'ext') {
      const P = S.player;
      if (P.anim || S.trans) return '';
      const td = takedownTarget();
      if (td) return td.kind === 'ledge' ? 'Q: pull him off the ledge' : (S.run.knife ? 'E: choke out   Q: kill' : 'E: choke out');
      if (P.m === 's') {
        const d = decoAt(S.world, P.x, P.y);
        if (d === 'T') return 'Up: go in to ' + LEVELS[S.li].target.split(' ')[0].toLowerCase() + ' ' + LEVELS[S.li].target.split(' ').slice(1).join(' ').toLowerCase();
        if (d && '123456789'.includes(d)) {
          const rs = S.lv.rooms[d];
          const locked = LEVELS[S.li].rooms[d].locked && !(rs && rs.unlocked);
          return locked ? 'Up: pick the shutter lock' : 'Up: climb in the window';
        }
        if (d === 'S') return 'Behind the banner';
      }
      return '';
    }
    if (S.mode === 'room') {
      const R = S.room;
      if (!R || R.caught > 0) return '';
      if (R.act) return 'Searching...';
      if (R.aim) {
        const t = aimTargets()[R.aim.i];
        const name = t ? (t.def ? WHO[t.kind] || 'them' : 'the ' + LABEL[t.kind].toLowerCase()) : '';
        if (R.aim.kind === 'pebbles' && t) {
          const n = pebbleListeners(t).length;
          return 'E: throw at ' + name + (n ? '  - ' + n + ' will look' : '  - nobody hears');
        }
        return 'E: dart ' + name + '  < >';
      }
      const p = roomTakedownTarget();
      if (p && TARGET[p.kind]) { if (S.run.knife) return 'Q: do it yourself'; }
      else if (p) return S.run.knife ? 'E: knock out   Q: kill' : 'E: knock out';
      if (R.peek) return 'Arrows: climb in   Down: back out';
      if (R.climbIn > 0) return '';
      if (R.hidden) return 'Hidden. Move to step out';
      const sp = !R.path && nearestSpot();
      if (sp) {
        const v = SPOT[sp.kind].verb, n = LABEL[sp.kind].toLowerCase();
        const mm = methodOf(sp);
        if (mm && knownM(mm)) { const miss = missingFor(mm); return miss.length ? 'Needs ' + miss.map(itemName).join(', ') : 'E: ' + mm.verb; }
        if (v === 'exit') return R.id === 'T' ? 'E: climb out and leave ' + LEVELS[S.li].pron + ' be' : 'E: climb out of the window';
        if (v === 'hide') return 'E or Up: hide in the ' + n;
        if (HIDEABLE[sp.kind]) return sp.done ? 'E or Up: hide in the ' + n : 'E: search   Up: hide';
        if (v === 'snuff') return sp.out ? 'E: light the candle' : 'E: snuff the candle';
        if (v === 'bell') return "E: ring a bell upstairs";
        if (v === 'search') return sp.done ? '' : (sp.needs && !has(sp.needs) ? 'Locked' : 'E: search the ' + n);
      }
      return '';
    }
    return '';
  }

  // ---------- drawing outside ----------
  function clampCam() {
    const A = art[S.li];
    S.cam.x = Math.max(-A.ox, Math.min(A.W - A.ox - VW, S.cam.x));
    S.cam.y = Math.max(-A.oy, Math.min(A.H - A.oy - VH, S.cam.y));
  }

  function drawExt(c) {
    const A = art[S.li], w = S.world, P = S.player;
    const cx = Math.round(S.cam.x), cy = Math.round(S.cam.y);
    c.drawImage(A.bg, cx + A.ox, cy + A.oy, VW, VH, 0, 0, VW, VH);
    // window glow, flickering
    for (const id in w.windows) {
      const q = w.windows[id], X = q.x * T + 8 - cx, Y = q.y * T - 2 - cy;
      if (X < -40 || X > VW + 40 || Y < -40 || Y > VH + 40) continue;
      const locked = LEVELS[S.li].rooms[id] && LEVELS[S.li].rooms[id].locked && !(S.lv.rooms[id] && S.lv.rooms[id].unlocked);
      if (locked) continue;
      const fl = 0.16 + Math.sin(S.t * 3 + q.x) * 0.03 + Math.sin(S.t * 11.3 + q.y) * 0.015;
      const g = c.createRadialGradient(X, Y, 2, X, Y, 30);
      g.addColorStop(0, id === 'T' ? 'rgba(255,150,80,' + (fl + 0.08) + ')' : 'rgba(255,190,100,' + fl + ')');
      g.addColorStop(1, 'rgba(255,170,90,0)');
      c.fillStyle = g; c.fillRect(X - 30, Y - 30, 60, 60);
    }
    // water
    for (let x = Math.floor(cx / T); x <= Math.floor((cx + VW) / T); x++) {
      for (let y = Math.floor(cy / T); y <= Math.floor((cy + VH) / T); y++) {
        // the canal carries on past the ends of the building and down out of sight
        if (at(w, Math.max(0, Math.min(w.W - 1, x)), Math.min(y, w.H - 1)) !== '~') continue;
        const X = x * T - cx, Y = y * T - cy;
        c.fillStyle = '#18282c'; c.fillRect(X, Y + 3, T, T - 3);
        c.fillStyle = '#243a3e'; c.fillRect(X, Y + 3, T, 2);
        for (let k = 0; k < 3; k++) {
          const wx = (x * 7 + k * 5 + Math.floor(S.t * 6 + k * 3)) % T;
          c.fillStyle = k === 0 ? '#5a7a78' : '#35524f'; c.fillRect(X + wx, Y + 4 + k * 4, 3, 1);
        }
      }
    }
    c.drawImage(A.fg, cx + A.ox, cy + A.oy, VW, VH, 0, 0, VW, VH);
    // torches
    for (const tq of w.torches) {
      const X = tq.x * T + 8 - cx, Y = tq.y * T + 2 - cy;
      if (X < -60 || X > VW + 60 || Y < -60 || Y > VH + 60) continue;
      const fl = Math.sin(S.t * 17 + tq.x) * 0.5 + Math.sin(S.t * 7 + tq.y);
      const g = c.createRadialGradient(X, Y, 1, X, Y, 46 + fl * 2);
      g.addColorStop(0, 'rgba(255,170,70,0.3)'); g.addColorStop(1, 'rgba(255,140,50,0)');
      c.fillStyle = g; c.fillRect(X - 50, Y - 50, 100, 100);
      c.fillStyle = '#c0441c'; c.fillRect(X - 2, Y - 2, 4, 3);
      c.fillStyle = '#f08a30'; c.fillRect(X - 1, Y - 5 - (fl > 0 ? 1 : 0), 3, 5);
      c.fillStyle = '#ffe08a'; c.fillRect(X, Y - 3, 1, 2);
    }
    // guards
    // the climbable ivy sheds a leaf every few seconds, which blows off on the wind:
    // enough movement to catch the eye and say "this one is different"
    for (let y = Math.floor(cy / T) - 1; y <= Math.floor((cy + VH) / T) + 1; y++) {
      for (let x = Math.floor(cx / T) - 1; x <= Math.floor((cx + VW) / T) + 1; x++) {
        if (!ivyAt(w, x, y)) continue;
        const h = ((x * 73856093) ^ (y * 19349663)) >>> 0;
        if (h % 3) continue;
        const period = 3 + (h % 7) * 0.4, ph = (S.t + (h % 100) / 10) % period;
        if (ph > 2.2) continue;
        const X = x * T + 4 + (h % 8) - cx + ph * 16 + Math.sin(ph * 5 + h) * 3, Y = y * T + 6 - cy + ph * 10 + ph * ph * 3;
        c.globalAlpha = Math.max(0, 1 - ph / 2.2);
        c.fillStyle = Math.floor(ph * 6) % 2 ? '#7e9a45' : '#5f7d35';
        c.fillRect(Math.round(X), Math.round(Y), 2, Math.floor(ph * 6) % 2 ? 1 : 2);
        c.globalAlpha = 1;
      }
    }
    for (const g of S.guards) drawGuard(c, g, cx, cy);
    // the thief
    drawThief(c, cx, cy);
    drawBanners(c, cx, cy);
    // motes of dust drifting in the lamplight
    const r = rng(7);
    for (let i = 0; i < 26; i++) {
      const bx = r() * VW, by = r() * VH, sp = 4 + r() * 8;
      const x = (bx + S.t * sp * (r() < 0.5 ? 1 : -0.6)) % VW, y = (by + Math.sin(S.t * 0.7 + i) * 6 + S.t * 2) % VH;
      c.fillStyle = 'rgba(230,220,190,' + (0.12 + r() * 0.18) + ')'; c.fillRect((x + VW) % VW, (y + VH) % VH, 1, 1);
    }
    void P;
  }

  // Heavy banners on iron poles: step behind one and the guards walk past. Drawn in
  // front of her, so behind one only her boots show. Each house flies its own.
  const BANNER = {
    abbey: { cloth: '#6b2424', dark: '#4a1818', gold: '#c9a13e' },
    assize: { cloth: '#26365a', dark: '#18233c', gold: '#c9a13e' },
    keep: { cloth: '#2d4a32', dark: '#1d3222', gold: '#c9a13e' },
  };
  function drawBanners(c, cx, cy) {
    const w = S.world, col = BANNER[LEVELS[S.li].id], P = S.player;
    for (let y = Math.floor(cy / T); y <= Math.floor((cy + VH) / T) + 1; y++) {
      for (let x = Math.floor(cx / T); x <= Math.floor((cx + VW) / T); x++) {
        if (decoAt(w, x, y) !== 'S') continue;
        const X = x * T - cx, Y = y * T - cy;
        const behind = P.state === 'ground' && P.x === x && P.y === y;
        const swing = (behind ? 1.6 : 0.6) * Math.sin(S.t * 1.7 + x);
        for (let i = 0; i < 12; i++) {
          const top = Y - 15, len = 24 + (i % 3 === 1 ? 1 : 0);
          for (let j = 0; j < len; j++) {
            const off = Math.round(swing * (j / len));
            const fold = i % 4 === 0 ? col.dark : i % 4 === 3 ? shade(col.cloth, 1.15) : col.cloth;
            c.fillStyle = fold;
            c.fillRect(Math.round(X + 2 + i + off), Math.round(top + j), 1, 1);
          }
        }
        // the device on each, and a gold fringe along the hem
        const mx = Math.round(X + 8 + swing * 0.5), my = Math.round(Y - 6);
        c.fillStyle = col.gold;
        if (LEVELS[S.li].id === 'abbey') { c.fillRect(mx - 1, my - 4, 2, 9); c.fillRect(mx - 3, my - 2, 6, 2); }
        else if (LEVELS[S.li].id === 'assize') { c.fillRect(mx - 4, my - 2, 8, 1); c.fillRect(mx - 1, my - 4, 1, 8); c.fillRect(mx - 4, my - 1, 2, 2); c.fillRect(mx + 2, my - 1, 2, 2); }
        else { c.fillRect(mx, my - 4, 1, 9); for (let k = 0; k < 3; k++) { c.fillRect(mx - 2, my - 3 + k * 2, 2, 1); c.fillRect(mx + 1, my - 2 + k * 2, 2, 1); } }
        for (let i = 0; i < 12; i += 2) { c.fillStyle = col.gold; c.fillRect(Math.round(X + 2 + i + swing), Math.round(Y + 10), 1, 2); }
        c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(Math.round(X + 2 + swing), Math.round(Y + 12), 12, 1);
      }
    }
  }

  function drawThief(c, cx, cy) {
    const P = S.player;
    let pose = 'idle', ph = S.t * 0.6, back = false;
    if (P.busy > 0) pose = P.pose || 'crouch';
    else if (P.anim) {
      const k = P.anim.t / P.anim.dur;
      switch (P.anim.kind) {
        case 'mantle': pose = k < 0.45 ? 'hang' : 'crouch'; back = k < 0.45; break;
        case 'hangdown': pose = k < 0.4 ? 'crouch' : 'hang'; back = k >= 0.4; break;
        case 'handup': case 'handdown': pose = 'climb'; ph = k * 0.5; back = true; break;
        case 'step': pose = 'walk'; ph = k * 0.5; break;
      }
    } else if (P.state === 'ground') { if (Math.abs(P.vx) > 8) { pose = 'walk'; ph = (P.dist || 0) / 26; } }
    else if (P.state === 'air') pose = P.vy < 60 ? 'jump' : 'fall';
    else if (P.state === 'hang') { pose = 'hang'; back = true; }
    else if (P.state === 'climb') { pose = 'climb'; ph = (P.cph || 0) * 1.3; back = true; }
    if (P.hurtT > 0 && Math.floor(S.t * 20) % 2) return;
    const hidden = P.state === 'ground' && !P.anim && decoAt(S.world, P.x, P.y) === 'S';
    const x = P.px - cx, y = P.py - cy;
    if (P.state === 'ground' && !P.anim) { c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(Math.round(x - 5), Math.round(y - 1), 10, 2); }
    c.save();
    if (hidden) c.globalAlpha = 0.85;
    drawFigure(c, 'wren', poseFor(pose, ph), x, y, 1, P.f, { back, blades: S.run.knife });
    c.restore();
  }

  function drawGuard(c, g, cx, cy) {
    const X = (g.x + 0.5) * T - cx, Y = (g.fy != null ? g.fy : (g.y + 1) * T) - cy;
    if (X < -30 || X > VW + 30 || Y < -40 || Y > VH + 40) return;
    const look = 'guard';
    const saved = LOOKS.guard.torso;
    LOOKS.guard.torso = LEVELS[S.li].art.tabard; LOOKS.guard.torsoL = shade(LEVELS[S.li].art.tabard, 1.3);
    if (g.state === 'dead' || g.state === 'ko') {
      drawFigure(c, look, P0.lie, X, Y, 1, g.f, { lying: true });
      if (g.state === 'dead') { c.fillStyle = '#6a1414'; c.fillRect(Math.round(X - 3), Math.round(Y - 1), 7, 1); }
      else drawText(c, 'Z', X + 6 * g.f, Y - 12 - (Math.floor(S.t * 2) % 2) * 2, '#c8c0e0', 1);
    } else if (g.state === 'falling') {
      drawFigure(c, look, P0.fall, X, Y, 1, g.f);
    } else {
      // his line of sight, faintly, along the row
      const range = (SIGHT + (S.lv.alarms > 0 ? 1 : 0) + (g.state === 'alert' ? 2 : 0)) * T;
      const gr = c.createLinearGradient(X, 0, X + g.f * range, 0);
      const col = g.state === 'alert' ? '220,60,40' : g.sus > 0.3 ? '240,200,80' : '240,220,160';
      gr.addColorStop(0, 'rgba(' + col + ',' + (0.12 + g.sus * 0.1) + ')'); gr.addColorStop(1, 'rgba(' + col + ',0)');
      c.fillStyle = gr;
      const x0 = g.f > 0 ? X + 3 : X - range - 3;
      c.fillRect(Math.round(x0), Math.round(Y - 26), range, 24);
      const moving = g.state === 'patrol' && g.pause <= 0 || g.state === 'alert' && sees(g) !== false && Math.abs(S.player.px / T - 0.5 - g.x) > 0.9;
      const pose = g.swing ? P0.point : moving ? walkPose(g.walked * 0.55, 3) : poseFor('idle', S.t * 0.5 + g.id);
      drawFigure(c, look, pose, X, Y, 1, g.f);
      // a spear
      c.fillStyle = '#4a3322'; c.fillRect(Math.round(X - 4 * g.f), Math.round(Y - 30), 1, 28);
      c.fillStyle = '#b8c0c8'; c.fillRect(Math.round(X - 4 * g.f), Math.round(Y - 34), 1, 4);
      if (g.sus > 0.05 || g.state === 'alert') {
        const mark = g.state === 'alert' ? '!' : '?';
        const col2 = g.state === 'alert' ? '#ff5a3a' : '#f0d060';
        drawText(c, mark, X, Y - 42, col2, 2, 'center');
        if (g.state !== 'alert') { c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(Math.round(X - 6), Math.round(Y - 46), 12, 2); c.fillStyle = col2; c.fillRect(Math.round(X - 6), Math.round(Y - 46), Math.round(12 * Math.min(1, g.sus)), 2); }
      }
    }
    LOOKS.guard.torso = saved;
  }

  // ---------- drawing a room ----------
  // Furniture and people are painted at their natural size into a scratch
  // canvas, then stamped into the room at their depth's scale with no
  // smoothing, so the pixels stay square however far back they stand.
  const sprC = mk(120, 200), sprX = sprC.getContext('2d');
  function blitSpot(c, sp, theme) {
    sprX.clearRect(0, 0, 120, 200);
    drawSpot(sprX, Object.assign({}, sp, { x: 60 }), S.t, theme);
    const p = proj(sp.u, sp.v), k = p.k;
    c.drawImage(sprC, 0, 0, 120, 200, Math.round(p.x - 60 * k), Math.round(p.y - FLOOR * k), Math.round(120 * k), Math.round(200 * k));
  }
  const figC = mk(90, 96), figX = figC.getContext('2d');
  function blitFigure(c, look, pose, u, v, f, opts, lift) {
    figX.clearRect(0, 0, 90, 96);
    drawFigure(figX, look, pose, 45, 90, 2, f, opts);
    const p = proj(u, v, lift || 0), k = p.k;
    c.drawImage(figC, 0, 0, 90, 96, Math.round(p.x - 45 * k), Math.round(p.y - 90 * k), Math.round(90 * k), Math.round(96 * k));
    return p;
  }

  // the top of a thing, for labels and brackets: [x, y, half-width, height]
  function spotBox(sp) {
    if (sp.kind === 'window') {
      const a = proj(SILL.u, V_MAX, 62);
      return [a.x, a.y, 14 * a.k, 62 * a.k];
    }
    const m = SPOT[sp.kind], p = proj(sp.u, sp.v);
    return [p.x, p.y - (FLOOR - m.top) * p.k, m.hw * p.k, ((m.bot || FLOOR) - m.top) * p.k];
  }
  function personBox(p) {
    const lying = down(p) || p.state === 'sleep';
    const q = proj(p.u, p.v, p.onBed ? 20 : 0);
    return lying ? [q.x, q.y - 14 * q.k, 26 * q.k, 14 * q.k] : [q.x, q.y - 56 * q.k, 9 * q.k, 56 * q.k];
  }
  function brackets(c, box, col) {
    const [x, y, hw, h] = box, x0 = Math.round(x - hw - 3), x1 = Math.round(x + hw + 3), y0 = Math.round(y - 3), y1 = Math.round(y + h + 2);
    c.fillStyle = col;
    for (const [bx, by, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
      c.fillRect(Math.min(bx, bx + sx * 5), by, 6, 1);
      c.fillRect(bx, Math.min(by, by + sy * 5), 1, 6);
    }
  }

  function drawPerson(c, p) {
    if (down(p) || p.state === 'sleep') {
      const q = blitFigure(c, p.kind, P0.lie, p.u, p.v, p.f, { lying: true }, p.onBed ? 20 : 0);
      if (p.state === 'dead') { c.fillStyle = '#6a1414'; c.fillRect(Math.round(q.x - 8 * q.k), Math.round(q.y - 1), Math.round(26 * q.k), 2); }
      drawText(c, 'Z', q.x + 16 * q.k, q.y - 24 * q.k - (Math.floor(S.t * 2) % 2) * 3, '#c8c0e0', 2);
      if (p.state === 'sleep' && p.stir > 0.05) {
        const bx = Math.round(q.x - 12), by = Math.round(q.y - 34 * q.k);
        c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(bx, by, 24, 3);
        c.fillStyle = '#f0d060'; c.fillRect(bx, by, Math.round(24 * Math.min(1, p.stir)), 3);
      }
      return;
    }
    let pose = p.moving ? walkPose(p.ph, 3) : poseFor('idle', S.t * 0.4 + p.home * 10), opts = null;
    const busy = p.state === 'routine' && p.act && !p.wp;
    if (busy) { const a = actPose(p.act, S.t + p.home * 7); pose = a.pose; opts = a.opts; }
    const q = blitFigure(c, p.kind, pose, p.u, p.v, p.f, opts);
    if (busy && p.act === 'write') {
      // the back of the chair at the desk
      c.fillStyle = '#3a2416'; c.fillRect(Math.round(q.x - 8 * q.k), Math.round(q.y - 20 * q.k), Math.round(16 * q.k), Math.round(3 * q.k));
      c.fillRect(Math.round(q.x - 7 * q.k), Math.round(q.y - 18 * q.k), Math.round(2 * q.k), Math.round(18 * q.k));
      c.fillRect(Math.round(q.x + 5 * q.k), Math.round(q.y - 18 * q.k), Math.round(2 * q.k), Math.round(18 * q.k));
      c.fillStyle = '#5a3a24'; c.fillRect(Math.round(q.x - 6 * q.k), Math.round(q.y - 14 * q.k), Math.round(12 * q.k), Math.round(4 * q.k));
    }
    if (p.meter > 0.02 || p.said) {
      const alert = p.meter >= 1, col = alert ? '#ff5a3a' : '#f0d060';
      const top = q.y - 62 * q.k;
      drawText(c, alert ? '!' : '?', q.x, top - 16, col, 3, 'center');
      if (!alert) {
        c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(Math.round(q.x - 12), Math.round(top - 22), 24, 3);
        c.fillStyle = col; c.fillRect(Math.round(q.x - 12), Math.round(top - 22), Math.round(24 * p.meter), 3);
      }
    }
  }

  function drawRoom(c) {
    const R = S.room;
    c.drawImage(roomBg(R.theme), 0, 0);
    const lights = [];
    for (const sp of R.spots) {
      if (sp.kind === 'candle' && !sp.out) { const q = proj(sp.u, sp.v, 54); lights.push([q.x, q.y, 90 * q.k]); }
      if (sp.kind === 'fireplace') { const q = proj(sp.u, sp.v, 20); lights.push([q.x, q.y, 110 * q.k]); }
    }
    for (const sp of R.spots) if (sp.wall && sp.kind !== 'window') blitSpot(c, sp, R.theme);
    if (R.people.some((p) => (p.state === 'leaving' || p.state === 'return') && p.u > 0.88 && p.wp)) {
      // the door stands open while someone goes through it
      const a = proj(1, DOOR.v0 + 0.012, DOOR.h1 - 2), b = proj(1, DOOR.v1 - 0.012, DOOR.h1 - 2), d = proj(1, DOOR.v1 - 0.012), e = proj(1, DOOR.v0 + 0.012);
      c.fillStyle = '#100b08';
      c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.lineTo(d.x, d.y); c.lineTo(e.x, e.y); c.closePath(); c.fill();
    }
    for (const [x, y, rad] of lights) {
      const g = c.createRadialGradient(x, y, 2, x, y, rad);
      g.addColorStop(0, 'rgba(255,190,110,0.2)'); g.addColorStop(1, 'rgba(255,170,90,0)');
      c.fillStyle = g; c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    // sight cones, laid on the floor
    c.save();
    const f0 = proj(0, 0), f1 = proj(1, 0), f2 = proj(1, 1.4), f3 = proj(0, 1.4);
    c.beginPath(); c.moveTo(f0.x, f0.y); c.lineTo(f1.x, f1.y); c.lineTo(f2.x, f2.y); c.lineTo(f3.x, f3.y); c.closePath(); c.clip();
    for (const p of R.people) {
      if (down(p) || p.state === 'sleep' || p.state === 'away') continue;
      const sv = sightOf(p);
      if (sv.away) continue;   // busy with their back to the room: no cone
      const sight = sv.range;
      const du = p.f * sight / FX, dvv = (sight * 0.75 + 14) / FY;
      const a = proj(p.u, p.v), b = proj(p.u + du, Math.max(0, p.v - dvv)), d = proj(p.u + du, p.v + dvv);
      const g = c.createLinearGradient(a.x, 0, b.x, 0);
      const col = p.meter > 0.5 ? '230,80,50' : '240,220,150';
      g.addColorStop(0, 'rgba(' + col + ',' + (0.16 + p.meter * 0.14) + ')'); g.addColorStop(1, 'rgba(' + col + ',0)');
      c.fillStyle = g;
      c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.lineTo(d.x, d.y); c.closePath(); c.fill();
    }
    c.restore();
    // everything standing on the floor, back to front
    const items = [];
    for (const sp of R.spots) if (!sp.wall) items.push({ v: sp.v, draw: () => blitSpot(c, sp, R.theme) });
    for (const p of R.people) if (p.state !== 'away' && p.u < 0.99) items.push({ v: p.v + (p.onBed ? 0.002 : 0), draw: () => drawPerson(c, p) });
    if (!R.hidden || R.hidden.kind === 'window') items.push({ v: R.v, draw: () => drawWren(c) });
    items.sort((a, b) => a.v - b.v).forEach((it) => it.draw());
    drawSill(c, R.theme);
    // pebbles in flight, and the ring where one lands
    for (const s of R.shots) {
      const k = Math.min(1, s.t / s.dur);
      const q = proj(s.a.u + (s.b.u - s.a.u) * k, s.a.v + (s.b.v - s.a.v) * k, 40 * (1 - k) + Math.sin(k * Math.PI) * 30);
      if (!s.landed) { c.fillStyle = '#d8d0c0'; c.fillRect(Math.round(q.x), Math.round(q.y), 2, 2); }
      else {
        const r2 = (s.t - s.dur) * 60, e = proj(s.b.u, s.b.v);
        c.strokeStyle = 'rgba(240,220,160,' + Math.max(0, 0.6 - (s.t - s.dur)) + ')';
        c.strokeRect(Math.round(e.x - r2) + 0.5, Math.round(e.y - r2 * 0.3) + 0.5, Math.round(r2 * 2), Math.round(r2 * 0.6));
      }
    }
    if (R.dark) {
      c.fillStyle = 'rgba(6,8,20,0.45)'; c.fillRect(0, 0, VW, VH);
      for (const [x, y, rad] of lights) {
        const g = c.createRadialGradient(x, y, 2, x, y, rad * 0.8);
        g.addColorStop(0, 'rgba(255,190,110,0.18)'); g.addColorStop(1, 'rgba(255,170,90,0)');
        c.fillStyle = g; c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
    }
    // what E would use: a bobbing marker and its name, as the old adventures labelled things
    const bob = Math.floor(S.t * 3) % 2;
    if (R.aim) {
      const t = aimTargets()[R.aim.i];
      if (t) brackets(c, t.def ? personBox(t) : spotBox(t), Math.floor(S.t * 6) % 2 ? '#ff7a50' : '#f0d060');
      if (t && R.aim.kind === 'pebbles') {
        for (const p of pebbleListeners(t)) {
          const [x, y] = personBox(p);
          if (Math.floor(S.t * 4) % 2) drawText(c, '?', x, y - 16, '#f0d060', 3, 'center');
        }
      }
    } else if (!R.act && !R.path && R.caught <= 0 && !roomTakedownTarget()) {
      const sp = nearestSpot();
      if (sp && sp.kind !== 'window' && !(SPOT[sp.kind].verb === 'search' && sp.done && !HIDEABLE[sp.kind])) {
        const [x, y] = spotBox(sp);
        const name = LABEL[sp.kind];
        const wdt = textWidth(name, 1) + 6, lx = Math.round(Math.max(2 + wdt / 2, Math.min(VW - 2 - wdt / 2, x)));
        // above the thing, unless that would run into the prompt under the HUD: then below it
        const [, , , h] = spotBox(sp);
        const below = y - 16 < 44;
        const ly = below ? Math.round(y + h + 8) : Math.round(y - 16);
        c.fillStyle = 'rgba(10,8,7,0.8)'; c.fillRect(lx - wdt / 2, ly - 2, wdt, 9);
        drawText(c, name, lx, ly, '#f0e2c0', 1, 'center', null);
        c.fillStyle = '#e8c67a';
        if (below) { const ay = ly - 6 - bob; c.fillRect(lx, ay, 1, 1); c.fillRect(lx - 1, ay + 1, 3, 1); c.fillRect(lx - 2, ay + 2, 5, 1); }
        else { const ay = ly + 9 + bob; c.fillRect(lx - 2, ay, 5, 1); c.fillRect(lx - 1, ay + 1, 3, 1); c.fillRect(lx, ay + 2, 1, 1); }
      }
    }
    if (R.caught > 0) { c.fillStyle = 'rgba(160,20,10,' + (0.25 * (1 - R.caught)) + ')'; c.fillRect(0, 0, VW, VH); }
  }

  // The window she came in by is behind the camera; what shows is the middle of its
  // sill along the bottom edge, with the moonlight falling past her into the room.
  function drawSill(c, theme) {
    c.fillStyle = 'rgba(170,190,235,0.07)';
    c.beginPath(); c.moveTo(146, VH); c.lineTo(238, VH); c.lineTo(250, 140); c.lineTo(134, 140); c.closePath(); c.fill();
    const st = theme === 'abbey' ? '#8a8170' : theme === 'assize' ? '#7a7870' : '#7e6e60';
    c.fillStyle = shade(st, 0.55); c.fillRect(146, 208, 92, 8);
    c.fillStyle = st; c.fillRect(148, 206, 88, 5);
    c.fillStyle = shade(st, 1.35); c.fillRect(148, 206, 88, 1);
    c.fillStyle = shade(st, 0.7); c.fillRect(176, 207, 1, 4); c.fillRect(208, 207, 1, 4);
  }

  // Poses for the jobs: all but gazing out of the window are seen from behind.
  function actPose(act, t) {
    const back = { back: true };
    const stand = (hf, hb) => ({ h: [0, -24], n: [0, -20], hip: [0, -11], kf: [1.8, -6], ff: [2, 0], kb: [-1.8, -6], fb: [-2, 0], ef: [3.2, -16], hf, eb: [-3.2, -16], hb });
    switch (act) {
      case 'write': {
        const b = Math.sin(t * 7) * 0.8;
        return { pose: { h: [0, -19], n: [0, -15], hip: [0, -7], kf: [2, -5], ff: [2, 0], kb: [-2, -5], fb: [-2, 0], ef: [3, -11], hf: [2 + b, -12], eb: [-3, -11], hb: [-2, -12] }, opts: back };
      }
      case 'cook': { const a = t * 4; return { pose: stand([2 + Math.cos(a) * 1.5, -14 + Math.sin(a)], [-3.5, -12]), opts: back }; }
      case 'prep': return { pose: stand([2.5, -13 + Math.abs(Math.sin(t * 8)) * 2.5], [-2.5, -13]), opts: back };
      case 'browse': return { pose: stand([2.5, -25 + Math.sin(t * 2)], [-3.5, -11]), opts: back };
      case 'fetch': return { pose: stand([2.5, -17 + Math.sin(t * 3) * 2], [-2.5, -17]), opts: back };
      case 'warm': return { pose: stand([2, -14 + Math.sin(t * 2) * 0.5], [-2, -14 - Math.sin(t * 2) * 0.5]), opts: back };
      case 'lookout': return { pose: stand([3, -12], [-3, -12]), opts: back };
      case 'pray': {
        const b = Math.sin(t * 1.5) * 0.4;
        return { pose: { h: [0, -17 + b], n: [0, -13 + b], hip: [0, -6], kf: [1.5, -1], ff: [1.5, 0], kb: [-1.5, -1], fb: [-1.5, 0], ef: [2, -12], hf: [0.5, -17], eb: [-2, -12], hb: [-0.5, -17] }, opts: back };
      }
      default: return { pose: poseFor('idle', t * 0.4), opts: null };   // gazing out: side-on
    }
  }

  function drawWren(c) {
    const R = S.room;
    const inWin = R.hidden && R.hidden.kind === 'window';
    let pose = R.act ? P0.reach : inWin ? P0.crouch : R.pose === 'walk' ? walkPose(R.walkPh, 3.2) : poseFor(R.pose, S.t * 0.6);
    let v = R.v, lift = 0, opts = null;
    if (!R.act && !inWin && R.busy <= 0 && R.view && R.view !== 'side') {
      pose = walkDepthPose(R.pose === 'walk' ? R.walkPh : 0);
      opts = R.view === 'back' ? { back: true } : { front: true };
    }
    if (R.climbIn > 0) {
      // climbing in through the window behind the camera, back to us: hands come up
      // onto the sill, she hauls herself up and crouches on it, then hops down
      // up to the sill until only her hood and hands show over it; she waits there
      // hidden until you move, then hauls herself over and hops down
      const p = 1 - R.climbIn / CLIMB_IN, ease = (t) => t * t * (3 - 2 * t), pk = 1 - PEEK_AT;
      if (R.peek || p < pk) { pose = P0.peek; opts = { back: true }; lift = -100 + 35 * ease(p / pk) + (R.peek ? Math.sin(S.t * 2) * 0.8 : 0); }
      else if (p < 0.7) { pose = P0.crouch; opts = { back: true }; lift = -65 + 48 * ease(Math.min(1, (p - pk) / (0.7 - pk))); }
      else { const k = (p - 0.7) / 0.3; pose = P0.jump; lift = -17 + 17 * k + Math.sin(k * Math.PI) * 14; v = R.v + 0.08 * (1 - k); }
    }
    c.save();
    if (R.hidden && R.climbIn <= 0) c.globalAlpha = 0.45;   // crouched in the window: there, but out of sight
    const q = blitFigure(c, 'wren', pose, R.u, v, R.f, Object.assign({ blades: S.run.knife }, opts || {}), lift);
    c.restore();
    if (R.act) {
      const k = R.act.t / R.act.dur, y = Math.round(q.y - 64 * q.k);
      c.fillStyle = 'rgba(0,0,0,0.7)'; c.fillRect(Math.round(q.x - 16), y, 32, 4);
      c.fillStyle = '#e0c890'; c.fillRect(Math.round(q.x - 16), y, Math.round(32 * k), 4);
    }
  }

  function drawTitle(c, li) {
    // the building's front at night, panning slowly; on the title, the thief on a ledge
    const A = buildArt(li);
    const mw = A.W - 2 * A.ox, mh = A.H - 2 * A.oy;
    const span = Math.max(0, mw - VW), vspan = Math.max(0, mh - VH);
    const cx = A.ox + Math.round(span / 2 + Math.sin(S.t / 9) * span / 2);
    const cy = A.oy + Math.round(li === 0 ? Math.min(vspan, 150) : vspan * (0.5 + Math.sin(S.t / 13) * 0.5));
    c.drawImage(A.bg, cx, cy, VW, VH, 0, 0, VW, VH);
    c.drawImage(A.fg, cx, cy, VW, VH, 0, 0, VW, VH);
    if (S.mode === 'title') {
      drawFigure(c, 'wren', poseFor('idle', S.t * 0.6), 16 * T + 8 + A.ox - cx, 18 * T + A.oy - cy, 1, 1);
      c.fillStyle = 'rgba(8,6,5,0.35)'; c.fillRect(0, 0, VW, VH);
      drawText(c, 'TITHE', VW / 2, 34, '#e8d6a8', 6, 'center', '#1a120c');
      drawText(c, 'A THIEF IN VELL', VW / 2, 72, '#b8a888', 2, 'center');
    } else {
      c.fillStyle = 'rgba(8,6,5,0.4)'; c.fillRect(0, 0, VW, VH);
    }
  }

  // ---------- the loop ----------
  function frame() {
    const c = ctx;
    c.imageSmoothingEnabled = false;
    c.fillStyle = '#0a0908'; c.fillRect(0, 0, VW, VH);
    // what is behind the cards: the scene of whatever was last on screen
    if (S.scene === 'room' && S.room) drawRoom(c);
    else if (S.scene === 'ext' && S.world) drawExt(c);
    else drawTitle(c, S.introLi || 0);
    if (S.mode === 'ext' || S.mode === 'room' || S.mode === 'dead') {
      // a vignette, the screen's own shadow
      c.drawImage(vignette, 0, 0);
    }
    drawHud(c);
    // the iris: the window shift
    if (S.trans) {
      const tr = S.trans, k = Math.min(1, tr.t / tr.dur);
      const rad = tr.phase === 'close' ? (1 - k) * 420 : k * 420;
      const cx = tr.phase === 'close' ? tr.cx : VW / 2, cy = tr.phase === 'close' ? tr.cy : VH / 2;
      c.fillStyle = '#060504';
      c.beginPath(); c.rect(0, 0, VW, VH); c.arc(cx, cy, Math.max(0.1, rad), 0, Math.PI * 2, true); c.fill();
    }
    // room-mode title flash
    const tt = S.toasts.find((q) => q.title);
    if (tt && S.mode === 'room') {
      drawText(c, tt.text, VW / 2, 44, '#f0e2c0', 2, 'center');
    }
  }

  const vignette = (() => {
    const v = mk(VW, VH), g = v.getContext('2d');
    const rg = g.createRadialGradient(VW / 2, VH / 2, VH * 0.45, VW / 2, VH / 2, VW * 0.62);
    rg.addColorStop(0, 'rgba(0,0,0,0)'); rg.addColorStop(1, 'rgba(0,0,0,0.5)');
    g.fillStyle = rg; g.fillRect(0, 0, VW, VH);
    return v;
  })();

  function update(dt) {
    S.t += dt;
    for (const q of S.toasts) q.t -= dt;
    S.toasts = S.toasts.filter((q) => q.t > 0);
    if (S.trans) {
      const tr = S.trans;
      tr.t += dt;
      if (tr.t >= tr.dur) {
        if (tr.phase === 'close') { tr.phase = 'open'; tr.t = 0; tr.cb(); }
        else S.trans = null;
      }
      return;
    }
    if (S.paused || !card.hidden) { edge.clear(); return; }
    if (S.mode === 'ext') updExt(dt);
    else if (S.mode === 'room') {
      const R = S.room;
      if (R.peek) {
        // peeking over the sill: Down (or Leave) drops back out, anything else climbs in
        if (edge.has('down') || edge.has('leave')) doSpot(R.spots[0]);
        else if (['left', 'right', 'up', 'act', 'jump'].some((k) => edge.has(k))) R.peek = false;
      } else if (R.aim) {
        if (edge.has('left') || edge.has('up')) aimStep(-1);
        if (edge.has('right') || edge.has('down')) aimStep(1);
        if (edge.has('act') || edge.has('jump')) aimFire();
        else if (edge.has('leave') || edge.has('kill')) { R.aim = null; syncPad(); }
      } else if (R.caught <= 0 && R.busy <= 0) {
        if (edge.has('act')) { if (!roomTakedown(false)) { const sp = nearestSpot(); if (sp && !R.act) doSpot(sp); } }
        if (edge.has('kill')) roomTakedown(true);
        if (edge.has('leave')) useSpot(R.spots[0]);
        if ((edge.has('up') || edge.has('down')) && !R.act && !R.hidden && R.climbIn <= 0) {
          const sp = nearestSpot();
          // Up beside a curtain or wardrobe steps into it; Down on the sill climbs back out
          if (sp && edge.has('up') && HIDEABLE[sp.kind]) { hideIn(sp); R.upLatch = true; }
          else if (sp && edge.has('down') && sp.kind === 'window' && R.v >= V_MAX - 0.015) doSpot(sp);
        }
      }
      roomUpdate(dt);
    }
    edge.clear();
  }

  function updExt(dt) {
    const P = S.player;
    P.hurtT = Math.max(0, P.hurtT - dt);
    for (const g of S.guards) updGuard(g, dt);
    if (S.mode !== 'ext') return;
    updPlayer(dt);
    if (S.mode !== 'ext') return;
    if (edge.has('act')) takedown(false);
    if (edge.has('kill')) takedown(true);
    // camera: a little ahead of where she faces
    const tx = P.px - VW / 2 + P.f * 8, ty = P.py - 14 - VH / 2;
    S.cam.x += (tx - S.cam.x) * Math.min(1, dt * 7);
    S.cam.y += (ty - S.cam.y) * Math.min(1, dt * 7);
    clampCam();
  }

  // ---------- input ----------
  const keys = { left: false, right: false, up: false, down: false, jump: false, act: false, kill: false };
  const edge = new Set();
  const KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down', Space: 'jump', KeyX: 'jump', KeyJ: 'jump',
    KeyE: 'act', Enter: 'act', KeyF: 'act', KeyQ: 'kill', KeyK: 'kill', Escape: 'leave',
  };
  function press(k) { if (!keys[k]) edge.add(k); keys[k] = true; lightPad(k, true); }
  function release(k) { keys[k] = false; lightPad(k, false); }
  addEventListener('keydown', (e) => {
    if (!card.hidden) return;
    if (e.code === 'KeyL' && (S.mode === 'ext' || S.mode === 'room')) { toggleLog(); return; }
    if (e.code === 'Digit1' && S.mode === 'room') { startAim('pebbles'); return; }
    if (e.code === 'Digit2' && S.mode === 'room') { startAim('darts'); return; }
    const k = KEYMAP[e.code];
    if (!k) return;
    e.preventDefault();
    if (e.repeat) return;
    press(k);
  });
  addEventListener('keyup', (e) => { const k = KEYMAP[e.code]; if (k) release(k); });
  addEventListener('blur', () => { for (const k in keys) release(k); });

  function lightPad(k, on) {
    document.querySelectorAll('[data-k="' + k + '"]').forEach((b) => b.classList.toggle('down', on));
  }

  document.querySelectorAll('.pad [data-k]').forEach((b) => {
    const k = b.dataset.k;
    const up = (e) => { e.preventDefault(); release(k); };
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.setPointerCapture && b.setPointerCapture(e.pointerId); unlockAudio(); press(k); });
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', () => release(k));
  });
  document.querySelectorAll('.pad [data-sel]').forEach((b) => {
    b.addEventListener('click', () => startAim(b.dataset.sel));
  });

  canvas.addEventListener('pointerdown', unlockAudio);

  // The quest log, top right: what the contract asks, every way you have found to
  // deal with the target and what each still needs, and what you are carrying.
  function renderLog() {
    const box = $('log'), body = $('log-body');
    const show = !!(S.run && S.world && (S.mode === 'ext' || S.mode === 'room'));
    box.hidden = !show;
    if (!show) return;
    const L = LEVELS[S.li];
    const obj = L.objectives.map((o) => '<li' + (o.item && has(o.item) ? ' class="done"' : '') + '>' + esc(o.text) + '</li>').join('');
    const found = L.methods.filter(knownM);
    const ways = found.map((m) => {
      const miss = missingFor(m);
      return '<li><b>' + esc(m.name) + '</b> <i>' + KIND_WORD[m.kind] + '</i><br>' + esc(m.how) + '<br><span class="' + (miss.length ? 'need' : 'ready') + '">' +
        (miss.length ? 'Needs ' + miss.map(itemName).join(', ') : 'Ready') + '</span></li>';
    });
    if (S.run.knife) ways.push('<li><b>With your knife</b> <i>kills</i><br>Get behind ' + L.pron + ' unseen and do it yourself.</li>');
    ways.push('<li><b>Leave ' + L.pron + ' be</b> <i>spares</i><br>Take what you came for and climb back out.</li>');
    const unknown = L.methods.length - found.length;
    const carry = S.run.items.map((id) => ITEM_NAMES[id]).filter(Boolean);
    body.innerHTML = '<h3>' + esc(L.name) + '</h3><ul class="obj">' + obj + '</ul>' +
      '<h4>Ways to deal with ' + esc(L.target) + '</h4><ul class="ways">' + ways.join('') + '</ul>' +
      (unknown ? '<p class="more">Keep searching: there ' + (unknown === 1 ? 'is another way' : 'are ' + unknown + ' more ways') + ' to find.</p>' : '') +
      (carry.length ? '<h4>Carrying</h4><p class="carry">' + carry.map(esc).join(', ') + '</p>' : '');
  }
  function toggleLog(open) {
    const body = $('log-body'), btn = $('log-toggle');
    const want = open != null ? open : body.hidden;
    body.hidden = !want; btn.setAttribute('aria-expanded', String(want));
    try { localStorage.setItem('tithe-log-open', want ? '1' : '0'); } catch (e) { /* fine */ }
  }
  $('log-toggle').addEventListener('click', () => toggleLog());
  try { if (localStorage.getItem('tithe-log-open') === '0') toggleLog(false); } catch (e) { /* fine */ }

  function syncPad() {
    renderLog();
    const pad = $('pad');
    pad.dataset.mode = S.mode === 'room' ? 'room' : 'ext';
    if (!S.run) return;
    $('n-pebbles').textContent = S.run.inv.pebbles;
    $('n-darts').textContent = S.run.inv.darts;
    document.querySelectorAll('.ctl-kill').forEach((b) => { b.hidden = !S.run.knife; });
    document.querySelectorAll('[data-sel]').forEach((b) => b.setAttribute('aria-pressed', String(!!(S.room && S.room.aim && S.room.aim.kind === b.dataset.sel))));
  }

  // Fit the canvas into the stage in whole multiples when it can, fractional
  // when the screen is too small for even 2x.
  function fit() {
    const r = stage.getBoundingClientRect();
    const k = Math.min(r.width / VW, r.height / VH);
    const s = k >= 2 ? Math.floor(k) : k;
    canvas.style.width = Math.floor(VW * s) + 'px';
    canvas.style.height = Math.floor(VH * s) + 'px';
  }
  addEventListener('resize', fit);

  // ---------- sound ----------
  let AC = null;
  function unlockAudio() {
    if (!S.sound || AC) return;
    try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; }
  }
  function tone(f0, f1, dur, type, vol, delay) {
    if (!AC) return;
    const t0 = AC.currentTime + (delay || 0);
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    g.gain.setValueAtTime(vol || 0.05, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(AC.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function sfx(name) {
    if (!S.sound || !AC) return;
    switch (name) {
      case 'jump': tone(320, 520, 0.08, 'square', 0.03); break;
      case 'grab': tone(180, 120, 0.06, 'square', 0.04); break;
      case 'land': tone(110, 60, 0.05, 'triangle', 0.06); break;
      case 'coin': tone(880, 880, 0.05, 'square', 0.03); tone(1320, 1320, 0.08, 'square', 0.03, 0.05); break;
      case 'item': [523, 659, 784].forEach((f, i) => tone(f, f, 0.1, 'square', 0.035, i * 0.08)); break;
      case 'alert': tone(700, 900, 0.1, 'sawtooth', 0.04); tone(700, 900, 0.1, 'sawtooth', 0.04, 0.14); break;
      case 'hurt': tone(220, 90, 0.18, 'sawtooth', 0.05); break;
      case 'die': tone(300, 40, 0.7, 'triangle', 0.07); break;
      case 'stab': tone(900, 200, 0.07, 'sawtooth', 0.04); break;
      case 'thud': tone(90, 50, 0.12, 'triangle', 0.08); break;
      case 'window': tone(200, 400, 0.2, 'triangle', 0.04); break;
      case 'pebble': tone(1200, 800, 0.03, 'square', 0.03); tone(1000, 700, 0.03, 'square', 0.02, 0.07); break;
      case 'throw': tone(500, 300, 0.06, 'triangle', 0.03); break;
      case 'dart': tone(1500, 600, 0.06, 'sawtooth', 0.03); break;
      case 'bell': [660, 660, 660].forEach((f, i) => tone(f, f * 0.98, 0.3, 'sine', 0.05, i * 0.35)); break;
      case 'snuff': tone(300, 100, 0.12, 'triangle', 0.03); break;
      case 'rummage': tone(150, 130, 0.1, 'triangle', 0.02); break;
      case 'locked': tone(140, 140, 0.08, 'square', 0.04); break;
      case 'huh': tone(260, 340, 0.15, 'triangle', 0.05); break;
      case 'click': tone(600, 600, 0.02, 'square', 0.02); break;
    }
  }
  $('btn-sound').addEventListener('click', (e) => {
    S.sound = !S.sound;
    e.currentTarget.setAttribute('aria-pressed', String(S.sound));
    e.currentTarget.textContent = 'Sound: ' + (S.sound ? 'on' : 'off');
    if (S.sound) unlockAudio();
  });

  // ---------- help ----------
  const help = $('help');
  $('btn-help').addEventListener('click', () => { help.hidden = false; S.paused = true; });
  help.addEventListener('click', (e) => { if (e.target === help || e.target.dataset.close) { help.hidden = true; S.paused = false; } });

  // ---------- start ----------
  function title() {
    S.mode = 'title'; S.scene = 'title'; S.introLi = 0;
    const saved = load();
    const acts = [];
    if (saved) acts.push({ label: 'Continue', sub: LEVELS[saved.li].name, cls: 'go', fn: () => { hideCard(); S.run = clone(saved.run); S.lv = clone(saved.lv); S.snap = saved; startLevel(saved.li, true); } });
    acts.push({ label: saved ? 'New game' : 'Begin', cls: saved ? '' : 'go', fn: () => { hideCard(); newGame(); } });
    showCard({
      title: 'Tithe', low: true,
      body: '<p>Vell starves under three golden roofs. The Abbot takes the famine tithe, the Magistrate signs the Lowmarket out of its homes, and the Countess owns every grain of wheat between the river and the hills.</p><p>You are <b>Wren</b>. You take things back. What you do with them is up to you.</p>',
      actions: acts,
    });
  }

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    frame();
    requestAnimationFrame(loop);
  }

  fit();
  title();
  requestAnimationFrame(loop);

  // The debug handle. Tests and screenshots drive the game through this rather
  // than by clicking on a canvas.
  window.__tithe = {
    S, LEVELS, parseLevel, resolve, settle, reach, standable,
    get player() { return S.player; }, get guards() { return S.guards; }, get room() { return S.room; },
    newGame, startLevel, levelIntro, enterRoom, leaveRoom, tryWindow, finishMethod, leaveFinale, renderLog, lootChoice, fence, ending,
    takedown, roomTakedown, useSpot, doSpot, nearestSpot, walkTo, startAim, aimStep, aimFire, aimTargets, pebbleListeners, throwPebble, fireDart, proj, grant, checkpoint, restore, hideCard, showCard,
    press, release, update, frame,
    tick(secs, step) { const st = step || 1 / 60; for (let t = 0; t < secs; t += st) update(st); frame(); },
    teleport(x, y, f) { const P = S.player; Object.assign(P, { state: 'ground', px: (x + 0.5) * T, py: (y + 1) * T, vx: 0, vy: 0, anim: null, busy: 0, skip: null, jumpBuf: 0 }); P.f = f || P.f; syncCell(P); },
    act(a) { edge.add(a); },
    MV,
    chaos: () => chaos(S.run),
  };
})();
