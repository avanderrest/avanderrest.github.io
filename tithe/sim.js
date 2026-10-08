/* Tithe: the rules. A thief's run across the rooftops of a medieval town at night, a window
   into a single painted room, and a choice at the end. The three contracts as data, the
   town's grid, how Wren moves over it, the guards, the window shift, everything inside a
   room (searching, hiding, pebbles, darts, the people's routines and what they see), the
   confrontation with each target, the fence, the consequences and the ending. No page
   access, so a whole contract can be played in Node:

     const ti = createTithe({ load, on })
       load   load(): the kept snapshot ({ v: 1, li, run, lv }) or null
       on     on(event, data): 'save' snapshot, 'clear-save', 'card' { title, body, actions }
              or null, 'say' [text, secs], 'sfx' name, 'level' li (build its art), 'cam'
              (clamp the camera), 'pad' (the touch buttons changed), 'log' (the journal)

   S is the whole state; ti.keys and ti.edge are the keys held and pressed this frame,
   which the page sets; update(dt) plays one frame. */

export function createTithe({ load = () => null, on = () => {} } = {}) {
  // ---------- constants ----------
  const T = 16;                     // one grid cell, in game pixels
  const VW = 384, VH = 216;         // the canvas, in game pixels
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
  // Each contract is a run across the town to the target's own stone building at the
  // far end. Map legend:
  // ' ' open air: sky, or an alley between houses   '.' a house front   'R' roof tiles
  // '#' the street, or stone   'x' a crate   '%' a hay cart (lands soft from any height)
  // '=' a ledge: eave, ridge, balcony, plank (stand on it, hang from it)   '_' a rope
  // '-' a window sill and '+' a lintel or beam end (hang only)   '|' ivy
  // '1'-'9' a room's window   'T' the target's window   'S' a hanging banner, or a
  // chimney on a roof (hide behind it)   'C' a sparrow mark (checkpoint)   'P' start
  // 'g' a guard   'G' a guard who is only posted on a bloody run   't' a lantern
  // 'w' a window you can't use
  const LEVELS = [
    {
      id: 'abbey',
      name: "St Orrin's Abbey",
      target: 'Abbot Crane', pron: 'him',
      where: 'the belfry',
      art: { stone: [118, 110, 96], moss: 0.62, sky: ['#1b2130', '#4a4250'], tabard: '#6a2a26', seed: 11 },
      required: ['tithe'],
      evidence: 'ledger2',
      objectives: [
        { text: 'Find the coffer key', item: 'coffer-key' },
        { text: 'Take the famine tithe', item: 'tithe' },
        { text: 'Deal with Abbot Crane, in the belfry', item: null },
      ],
      intro: [
        'Three winters of famine, and every one of them Abbot Crane collected a tithe "for the hungry of Vell". Not a loaf of it has left St Orrin\'s.',
        'Come in over the roofs of the abbey close. Find the key to his coffer, empty it, and climb the bell tower to the belfry, where he says his prayers at midnight.',
      ],
      map: [
        '                                                                                                                      ',
        '                                                                                                                      ',
        '                       =====     ==========      ======                       =======                               T ',
        '                      RRRRRRR C RRRSRRgRRGRR    RRRRRRRR                     RRRRRRRRR                   =============',
        '                g     ======================____========                     =========                   ..C.....t....',
        '   ======    =======  +.....+   .+....+...+.    +......+            ======   +.......+              t    =====........',
        '  RRCRRRRR  RRRRRRRRR ...w...   ............    ...w2...           RRRRRRRR  ...w.w...                   .............',
        '  ========  ========= -.....-   .-....-...-.    -.====.-           ========  -.......-    C     g        .............',
        '  +...+..+  +.......+ +.....+   .+....+...+.    +......+    ====== |..+...+  +.......+==========================......',
        '  ........  ....1.... ...w...   ............   t...w....   RRRRRRRR|.......  ...w3w...   .............................',
        '  -...-..-  -.=====.- -.....-   .-....-...-.    -......-   ========|..-...-  -.=====.-   .............................',
        '  +...+..+  +.......+ +.....+   .+....+...+.    +......+   .+......|..+...+ t+.......+   .............................',
        '  ........  ....w.... ...w...   ............    ...w....   .....w..|.......  ...w.w...   .............................',
        '  -...-..- t-.......- -.....-   .-....-...-.    -......-   .-......|..-...-  -.......-   .............................',
        '  +...+..+  +.......+ +.....+   .+....+...+.    +......+   .+...t..|..+...+  +.......+   .............................',
        '  .....x..  ......... .......   ............    ........   ........|.......  .........   .............................',
        ' P....xx..  ......... .......   ............    ........%% ..C4....|..g.S..  .........xx%.............................',
        '######################################################################################################################',
      ],
      // what to paint: [x, width, eave row, roof rows]; a roof of 0 is a stone building
      houses: [[2, 8, 7, 1], [12, 9, 7, 1], [22, 7, 4, 1], [32, 12, 4, 1], [48, 8, 4, 1], [59, 8, 10, 1], [67, 8, 7, 1], [77, 9, 4, 1], [89, 16, 8, 0], [105, 13, 3, 0]],
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
        'The writs sit in his strongroom under the seal of the Assize. Cross the Lowmarket by its washing lines, take the seal, take the writs, and pay the Magistrate a visit in his chambers under the Hall roof.',
      ],
      map: [
        '                                                                                                                        ',
        '                                                                                                                        ',
        '            =====      =======                                   =======     =======      C    g          G             ',
        '           RRRRRRR    RRCRgRSRR              =======            RRRRRRRRR   RRCRgRRRR  =================================',
        '           =======____=========             RRRRRGRRR           =====================  .................................',
        '   =====   +.....+    +...+...+   ====== ___=========           |.......+   +.......+  ...............S.g.....T.........',
        '  RCRRRRR  ...w...    .........  RRRRRRRR   .........           |..w3w...   ....w....  .............=============.......',
        '  =======  -.....-    -...-...-__========   .........           |.=====.-   -.......-  .................................',
        '  +.....+  +.....+    +...+...+  +......+   +.......+    ====== |.......+   +.......+  .................................',
        '  .......  ..1w...    .........  ........   ....w....   RRRRRRRR|..w.w...  t....w....  ............t.............t......',
        '  -.....-  -====.-    -...-...- t-......-   -.......-   ========|.......-   -.......-  .................................',
        '  +.....+  +.....+    +...+...+  +......+   +.......+   .+......|.......+   +.......+  .................................',
        '  ....... t...w...    .........  ...2....   ....w....   .....w..|..w.w...   ....w....  .................................',
        '  -.....-  -.....-    -...-...-  -.====.-   -.......-  t.-......|.......-   -.......-  .................................',
        '  +.....+  +.....+    +...+...+  +......+   +.......+   .+......|.......+   +.......+  .................................',
        '  ....x..  .......    .........  ........   .........   ........|........   .........x .................................',
        ' P...xx..  .......    .........  ........   .........%% ..C4g...|....S...   .........xx.................................',
        '########################################################################################################################',
      ],
      // what to paint: [x, width, eave row, roof rows]; a roof of 0 is a stone building
      houses: [[2, 7, 7, 1], [11, 7, 4, 1], [22, 9, 4, 1], [33, 8, 7, 1], [44, 9, 5, 1], [56, 8, 10, 1], [64, 9, 4, 1], [76, 9, 4, 1], [87, 33, 3, 0]],
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
        'Her grain contracts are in the town under the keep, and her tower answers to one key. Over the roofs, along the curtain wall and up the keep: she is at the top, and she is expecting someone. Not you.',
      ],
      map: [
        '                                                                                                    g                   ',
        '                                                                                    ====================================',
        '                                                                                    ........|...........................',
        '                                                                                    ........|...t.......................',
        '            ======     =======                                                      ..C.S...|...............S.C..T......',
        '           RRRRRRRR   RRCRgRRRR                                                     =========.............===========...',
        '           ========___=========                                                     ....................................',
        '   ======  +......+   +.......+   =======       C   g     S       G           g     ..................................t.',
        '  RRCRRRRR ...ww...   ....w....  RRRRRRRRR    =============================================.............................',
        '  ======== -......-   -.......-  =========____...............|............|.....t.......................................',
        '  +......+ +......+   +.......+  +.......+    ....t..........|............|.............................................',
        '  ........ ...ww...   ....w....t ....3....    ...........2...|...t........|.............................................',
        '  -......- -......-   -.......-  -.=====.-    ........======.|............|.............................................',
        '  +......+ +......+   +.......+  +.......+    ...............|............|.............................................',
        '  ........t...ww...   ....w....  .........    ...............|........4...|.............................................',
        '  -......- -......-   -.......-  -.......-    ...............|.....=======|.............................................',
        '  +......+ +......+   +.......+  +.......+    ...............|............|.............................................',
        '  ......x. ........   .........  .........    ...............|............|.............................................',
        ' P.....xx. ...1....   .........  .........%%  ...............|........g...|.............................................',
        '########################################################################################################################',
      ],
      // what to paint: [x, width, eave row, roof rows]; a roof of 0 is a stone building
      houses: [[2, 8, 9, 1], [11, 8, 6, 1], [22, 9, 6, 1], [33, 9, 9, 1], [46, 38, 8, 0], [84, 36, 1, 0]],
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
    // a mark, a guard or a chimney standing in a roof keeps the roof tiles behind it
    for (let y = 0; y < H; y++) for (let x = 1; x < W - 1; x++) {
      if (t[y][x] === '.' && L.map[y][x] !== '.' && (t[y][x - 1] === 'R' || t[y][x + 1] === 'R')) t[y][x] = 'R';
    }
    return out;
  }

  const at = (w, x, y) => (x < 0 || x >= w.W) ? '#' : (y < 0 ? ' ' : (y >= w.H ? '~' : w.t[y][x]));
  const SOLID = { '#': 1, x: 1, '%': 1 };          // stone and cobbles, crates, a hay cart
  const LEDGE = { '=': 1, _: 1 };                  // stand on it or hang from it: ledges, balconies, planks, a rope
  const HOLD = { '=': 1, _: 1, '-': 1, '+': 1 };   // hands only: '-' a window sill, '+' a lintel or a beam end
  const isSolid = (w, x, y) => !!SOLID[at(w, x, y)];
  const isLedge = (w, x, y) => !!LEDGE[at(w, x, y)];
  const isFloor = (w, x, y) => isSolid(w, x, y) || isLedge(w, x, y);
  const grabbable = (w, x, y) => !!HOLD[at(w, x, y)];
  const isHay = (w, x, y) => at(w, x, y) === '%';
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
        if (isHay(w, x, yy + 1)) return { x, y: yy, rows, dead: false, hurt: false, hay: true };
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
        if (isLedge(w, x, y - 1) && !isSolid(w, x, y - 2) && !isSolid(w, x, y - 3)) {
          return mv('mantle', { m: 's', x, y: y - 2, f }, DUR.climb);
        }
        if (grabbable(w, x, y - 1)) return mv('grab', { m: 'h', x, y: y - 1, f }, DUR.grab);
        if (grabbable(w, x, y - 2) && !isSolid(w, x, y - 1)) return mv('grab', { m: 'h', x, y: y - 2, f }, DUR.grab);
        return null;
      }
      if (act === 'down') {
        if (isLedge(w, x, y + 1)) return mv('hangdown', { m: 'h', x, y: y + 1, f }, DUR.hangdown);
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
        if (isLedge(w, tx, y) && standable(w, tx, y - 1)) return mv('jump', { m: 's', x: tx, y: y - 1, f }, dur);
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
        if (isLedge(w, x, L) && !isSolid(w, x, L - 1) && !isSolid(w, x, L - 2)) return mv('climb', { m: 's', x, y: L - 1, f }, DUR.climb);
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
        if (isLedge(w, x, y - 1) && !isSolid(w, x, y - 2) && !isSolid(w, x, y - 3)) return mv('mantle', { m: 's', x, y: y - 2, f }, DUR.climb);
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


  // ---------- what the page is asked to show ----------
  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  /* A card: { title, body (HTML), portrait, low, actions: [{ label, sub, cls, disabled, fn }] }.
     While one is up the game stands still. */
  function showCard(o) { S.cardUp = true; on('card', o); }
  function hideCard() { S.cardUp = false; on('card', null); }
  /* A line along the bottom; a title one is drawn big over a room instead. */
  function toast(text, secs, title) {
    S.toasts = S.toasts.filter((t) => t.text !== text);
    S.toasts.push({ text, t: secs || 2.6, title: !!title });
    if (S.toasts.length > 3) S.toasts.shift();
    if (!title) on('say', [text, secs || 2.6]);
  }

  // ---------- game state ----------
  const S = {
    mode: 'title', cardUp: false, li: 0, run: null, lv: null, world: null, player: null, guards: [],
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

  const clone = (o) => JSON.parse(JSON.stringify(o));

  // A sparrow mark: everything as it stands, so a death puts you back here.
  function checkpoint(x, y, f) {
    S.lv.cp = { x, y, f };
    S.lv.guards = S.guards.map((g) => ({ id: g.id, x: (g.state === 'dead' || g.state === 'ko') ? g.x : g.home, y: g.y, f: g.f, state: (g.state === 'dead' || g.state === 'ko') ? g.state : 'patrol', home: g.home, found: g.found }));
    S.snap = { v: 1, li: S.li, run: clone(S.run), lv: clone(S.lv) };
    on('save', S.snap);
  }

  // ---------- the level outside ----------
  function startLevel(li, fromSnap) {
    S.li = li;
    S.world = parseLevel(LEVELS[li]);
    on('level', li);
    if (!fromSnap) { S.lv = freshLevel(li); }
    const cp = S.lv.cp;
    S.player = { state: 'ground', px: (cp.x + 0.5) * T, py: (cp.y + 1) * T, vx: 0, vy: 0, f: cp.f, anim: null, busy: 0, hurtT: 0, jumpBuf: 0, coyote: 0, top: 0, skip: null };
    syncCell(S.player);
    S.guards = S.lv.guards.map((g) => spawnGuard(g));
    S.cam.x = S.player.px - VW / 2; S.cam.y = S.player.py - 14 - VH / 2; on('cam');
    S.mode = 'ext'; S.scene = 'ext';
    S.room = null;
    if (!fromSnap) checkpoint(cp.x, cp.y, cp.f);
    else { S.snap = { v: 1, li, run: clone(S.run), lv: clone(S.lv) }; on('save', S.snap); }
    on('pad');
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
  // Free movement over the grid. She runs with a little momentum, sprints if you
  // keep running, and jumps in an arc you can steer; letting go of Space early makes
  // a shorter hop. On the way down her hands catch any hold they pass (hold Down to
  // let them go by), and a ledge can be jumped up through from below. Hanging, climbing hand
  // over hand, ivy and pulling up onto a ledge are short smooth motions. P.px and
  // P.py are her feet, in world pixels; P.x / P.y / P.m are kept as the grid cell
  // and mode the guards and the prompts reason about.
  const MV = {
    run: 82, accel: 900, decel: 1300, airAccel: 520, grav: 980, jumpV: 245, maxFall: 430,
    coyote: 0.09, buffer: 0.14, shimmy: 48, climb: 58, halfW: 4, height: 26, reach: 30,
    sprint: 122, sprintAfter: 0.6,   // hold a direction and she lengthens her stride, and her jumps
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
    P.vx = 0; P.vy = 0; P.jumped = false; P.runT = 0;
  }

  function toClimb(P) {
    P.state = 'climb'; P.ivx = Math.floor(P.px / T); P.vx = 0; P.vy = 0; P.jumped = false;
  }

  function jump(P, key, vy) {
    P.state = 'air'; P.vy = -(vy || MV.jumpV); P.jumped = true; P.jumpKey = key;
    P.jumpBuf = 0; P.coyote = 0; P.top = P.py;
    on('sfx', 'jump');
  }

  function leaveInto(P, vx, vy, skip) {
    P.state = 'air'; P.vx = vx; P.vy = vy; P.top = P.py; P.jumped = true; P.jumpKey = null; P.skip = skip || null;
  }

  // Hands passing the top edge of a hold, on the way down, catch it.
  function tryGrab(P, handPrev) {
    if (keys.down || P.vy < -40) return false;
    const w = S.world, hand = P.py - MV.reach;
    const lo = Math.min(handPrev, hand) - 5, hi = Math.max(handPrev, hand) + 6;
    for (const off of [P.f * 10, P.f * 4, 0]) {   // hands reach a little ahead
      const cx = Math.floor((P.px + off) / T);
      for (let cy = Math.floor(lo / T); cy <= Math.floor(hi / T); cy++) {
        const top = cy * T;
        if (top < lo || top > hi || !grabbable(w, cx, cy) || isSolid(w, cx, cy + 1)) continue;
        // hanging there would put her feet on a floor: she just lands on it instead
        if (isFloor(w, Math.floor(P.px / T), cy + 2)) continue;
        if (P.skip && P.skip.t > 0 && (P.skip.row === cy || P.skip.cell === cx + ',' + cy)) continue;
        hangAt(P, cx, cy, P.px + off);
        on('sfx', 'grab');
        return true;
      }
    }
    return false;
  }

  function land(P) {
    const rows = (P.py - P.top) / T;
    P.state = 'ground'; P.vy = 0; P.jumped = false; P.skip = null;
    const hay = isHay(S.world, Math.floor(P.px / T), Math.round(P.py / T));
    if (hay) { if (rows >= HURT_FALL) { toast('Into the hay. Not a scratch.'); on('sfx', 'thud'); } else on('sfx', 'land'); P.hay = 0.4; }
    else if (rows >= DEATH_FALL) die('You fall too far.');
    else if (rows >= HURT_FALL) hurt(1, 'A hard landing.');
    else on('sfx', 'land');
  }

  function groundUp(P) {
    const w = S.world, cx = Math.floor(P.px / T), fr = Math.floor((P.py - 1) / T);
    const d = decoAt(w, cx, fr);
    if (d && '123456789T'.includes(d)) { P.vx = 0; tryWindow(d); return true; }
    if (ivyAt(w, cx, fr) || ivyAt(w, cx, fr - 1)) { toClimb(P); return true; }
    if (isLedge(w, cx, fr - 1) && !isSolid(w, cx, fr - 2) && !isSolid(w, cx, fr - 3)) {
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
    if (!isLedge(w, cx, fr + 1) || isSolid(w, cx, fr + 2)) return false;
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
      on('sfx', 'jump');
      return;
    }
    if (keys.up) {
      if (isLedge(w, cx, ly) && !isSolid(w, cx, ly - 1) && !isSolid(w, cx, ly - 2)) {
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
      else if (isLedge(w, cx, fr - 1) && !isSolid(w, cx, fr - 2) && !isSolid(w, cx, fr - 3)) {
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
    // a sprint carries through the jump as long as you keep pushing the same way
    const target = dir * (dir === Math.sign(P.vx) ? Math.max(MV.run, Math.abs(P.vx)) : MV.run);
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
    if ((at(w, cx, fr) === '~' && P.py > fr * T + 5) || P.py > w.H * T + 20) die('You fall too far.');
  }

  function updGround(P, dt, dir) {
    if (dir && Math.sign(P.vx) === dir && Math.abs(P.vx) >= MV.run - 1) P.runT = (P.runT || 0) + dt;
    else if (!dir || Math.sign(P.vx) !== dir) P.runT = 0;
    const target = dir * (P.runT > MV.sprintAfter ? MV.sprint : MV.run);
    P.vx += Math.sign(target - P.vx) * Math.min(Math.abs(target - P.vx), (dir ? MV.accel : MV.decel) * dt);
    if (dir) P.f = dir;
    moveX(P, P.vx * dt);
    P.dist = (P.dist || 0) + Math.abs(P.vx * dt);
    if (!onFloor(P.px, P.py)) {
      // stepping off a ledge: she turns and catches its edge, unless Down is held. At a
      // sprint she goes flying off it instead — that is the moment to jump
      const d = Math.sign(P.vx) || P.f, row = Math.round(P.py / T);
      const ex = Math.floor((P.px - d * (MV.halfW + 1)) / T);
      if (!keys.down && Math.abs(P.vx) <= MV.run + 1 && isLedge(S.world, ex, row) && !isSolid(S.world, ex, row + 1)) {
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
      if (cp.x !== cx || cp.y !== fr) { checkpoint(cx, fr, P.f); toast('A sparrow mark. Your progress is kept.'); on('sfx', 'coin'); }
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
    on('sfx', 'hurt');
    if (why) toast(why);
    if (S.run.hearts <= 0) die(why || 'You are cut down.');
  }

  function die(why) {
    if (S.mode === 'dead') return;
    S.mode = 'dead';
    S.run.stats.deaths++;
    on('sfx', 'die');
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
    on('sfx', 'alert');
    if (why) toast(why);
    void g;
  }

  function updGuard(g, dt) {
    if (g.state === 'dead' || g.state === 'ko') return;
    if (g.state === 'falling') {
      g.fall.t += dt;
      const k = Math.min(1, g.fall.t / g.fall.dur);
      g.fy = g.fall.y0 + (g.fall.y1 - g.fall.y0) * k * k;
      if (k >= 1) { g.state = 'dead'; g.y = g.fall.row; g.fy = null; on('sfx', 'thud'); }
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
      on('sfx', 'grab');
      toast('Over the edge he goes.');
      return true;
    }
    P.busy = 0.7; P.pose = 'crouch'; P.vx = 0; P.f = Math.sign(g.x - (P.px / T - 0.5)) || P.f;
    g.state = lethal ? 'dead' : 'ko';
    g.f = P.f;
    if (lethal) S.run.stats.kills++; else S.run.stats.subdues++;
    on('sfx', lethal ? 'stab' : 'thud');
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
      if (S.run.inv.picks > 0) { S.run.inv.picks--; rs.unlocked = true; toast('You pick the shutter lock.'); on('sfx', 'coin'); }
      else { toast('Shuttered and barred. A lockpick would open it.'); return; }
    }
    irisTo(() => enterRoom(id));
  }

  function irisTo(cb) {
    const P = S.player;
    S.trans = { t: 0, dur: 0.5, phase: 'close', cx: Math.round(P.px - S.cam.x), cy: Math.round(P.py - 16 - S.cam.y), cb };
    on('sfx', 'window');
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
    on('pad');
  }

  function leaveRoom(caught) {
    const R = S.room;
    // remember who is down, and where
    R.people.forEach((p, i) => {
      R.rs.people[i] = { state: down(p) ? p.state : (p.def.sleep && p.state === 'sleep' ? 'sleep' : 'awake'), u: p.u, v: p.v, f: p.f, onBed: p.onBed };
    });
    if (caught) R.rs.wary = true;
    irisTo(() => {
      S.mode = 'ext'; S.scene = 'ext'; S.room = null; on('pad');
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
        on('sfx', 'pebble');
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
    on('sfx', 'huh');
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
        on('sfx', 'huh');
        toast(INNOCENT[p.kind] ? '"Hello? Is someone there?"' : '"Who is there?"', 1.8);
      } else {
        p.meter = 1; p.said = '!';
        R.caught = 1.1; R.act = null; R.path = null; R.aim = null;
        on('sfx', 'alert');
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
    on('log');
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
      on('sfx', 'rummage');
      return;
    }
    R.f = Math.sign(sp.u - R.u) || R.f;
    switch (m.verb) {
      case 'exit': if (R.id === 'T') leaveFinale(); else leaveRoom(false); break;
      case 'hide': hideIn(sp); break;
      case 'snuff':
        sp.out = !sp.out; R.dark = sp.out; R.rs.out = sp.out;
        toast(sp.out ? 'You pinch out the candle. The room goes dim.' : 'You light the candle again.', 2);
        on('sfx', 'snuff');
        break;
      case 'bell': {
        let n = 0;
        for (const p of R.people) {
          if ((p.kind === 'cook' || p.kind === 'servant') && !down(p) && p.state !== 'sleep') { p.state = 'leaving'; p.wp = null; p.act = null; p.hold = 0; n++; }
        }
        sp.ringT = S.t + 2.5;
        on('sfx', 'bell');
        toast(n ? 'You tug a wire and one of the bells jangles. "That is the master\'s room again," and off they go upstairs to answer it.'
          : 'The bell jangles. Nobody here answers bells.', 3);
        if (!n) noise(sp.u, 0.1, 400, 'bell');
        break;
      }
      case 'search':
        if (sp.done && HIDEABLE[sp.kind]) { hideIn(sp); break; }
        if (sp.done) { toast('Already searched.', 1.2); break; }
        if (sp.needs && !has(sp.needs)) { toast('Locked. It wants ' + ITEM_NAMES[sp.needs].replace(/^The /, 'the ') + '.'); on('sfx', 'locked'); break; }
        R.act = { spot: sp, t: 0, dur: sp.kind === 'strongbox' ? 1.0 : 0.6 };
        R.pose = 'reach';
        on('sfx', 'rummage');
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
            { label: 'Take it', cls: 'red', sub: 'From now on you can kill', fn: () => { run.knife = true; hideCard(); S.paused = false; on('pad'); on('sfx', 'item'); toast('The knife goes in your belt.', 2); } },
            { label: 'Leave it', sub: 'You can come back for it', fn: () => { hideCard(); S.paused = false; if (sp && S.room) { sp.done = false; S.room.rs.done[sp.i] = false; } } },
          ],
        });
        return l;
      case 'silver': run.silver += l.n; toast('+' + l.n + ' silver', 1.6); on('sfx', 'coin'); return l;
      case 'pebbles': case 'darts': case 'picks': {
        run.inv[l.t] += l.n;
        const name = { pebbles: 'pebble', darts: 'sleep dart', picks: 'lockpick' }[l.t];
        toast('+' + l.n + ' ' + name + (l.n > 1 ? 's' : ''), 1.6); on('sfx', 'coin'); on('pad'); return l;
      }
      case 'heal':
        run.hearts = Math.min(MAX_HEARTS, run.hearts + 1);
        toast('Bread and a cup of small beer. You feel better.', 2); on('sfx', 'coin'); return l;
      case 'note':
        toast(l.text, 5); return l;
      case 'intel': {
        run.intel = run.intel || [];
        if (!run.intel.includes(l.id)) run.intel.push(l.id);
        const m = LEVELS[S.li].methods.find((q) => q.intel === l.id);
        S.paused = true;
        showCard({ title: l.title, body: '<p>' + esc(l.text) + '</p>' + (m ? '<p class="dim">A new way to deal with ' + esc(LEVELS[S.li].target) + ' is in your log: <b>' + esc(m.name) + '</b>.</p>' : ''), actions: [{ label: 'Go on', fn: () => { hideCard(); S.paused = false; } }] });
        on('sfx', 'item'); on('log');
        return l;
      }
      case 'item':
        if (!run.items.includes(l.id)) run.items.push(l.id);
        on('sfx', 'item');
        {
          const m = LEVELS[S.li].methods.find((q) => q.intel === l.id);
          if (l.doc) {
            S.paused = true;
            showCard({ title: l.name, body: '<p>' + esc(l.doc) + '</p>' + (m ? '<p class="dim">A new way to deal with ' + esc(LEVELS[S.li].target) + ' is in your log: <b>' + esc(m.name) + '</b>.</p>' : ''), actions: [{ label: 'Take it', fn: () => { hideCard(); S.paused = false; } }] });
          } else toast('Found: ' + l.name, 3);
        }
        on('log');
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
    if (R.aim && R.aim.kind === kind) { R.aim = null; on('pad'); return; }
    if (S.run.inv[kind] <= 0) { toast(kind === 'darts' ? 'No sleep darts.' : 'No pebbles.'); return; }
    R.aim = { kind, i: 0 };
    if (kind === 'pebbles' && !S.run.pebbleTold) {
      S.run.pebbleTold = true;
      toast('A pebble is a distraction: throw it at something, and whoever hears it land walks over to look, turning their back on you for a while.', 6);
    }
    const ts = aimTargets();
    if (!ts.length) { R.aim = null; toast(kind === 'darts' ? 'Nobody to dart.' : 'Nothing to throw at.'); on('pad'); return; }
    let best = 0, bd = 1e9;
    ts.forEach((t, i) => { const d = (t.u - R.u) * R.f; const score = d > 0.02 ? d : 10 - d; if (score < bd) { bd = score; best = i; } });
    R.aim.i = best;
    R.act = null; R.path = null;
    on('pad');
  }
  function aimStep(d) { const ts = aimTargets(); if (ts.length) S.room.aim.i = (S.room.aim.i + d + ts.length) % ts.length; }
  function aimFire() {
    const R = S.room, ts = aimTargets(), t = ts[R.aim.i], kind = R.aim.kind;
    R.aim = null;
    if (t) { if (kind === 'pebbles') throwPebble(t); else fireDart(t); }
    on('pad');
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
    on('sfx', 'throw');
    on('pad');
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
    on('sfx', 'dart');
    toast('The dart finds its mark. Down they go, snoring.', 2);
    on('pad');
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
      p.state = 'dead'; R.busy = 0.7; R.pose = 'crouch'; on('sfx', 'stab');
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
      on('sfx', 'stab');
    } else { S.run.stats.subdues++; toast('Out cold.', 1.4); on('sfx', 'thud'); }
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
        fn: () => { run.silver -= it.cost; run.kept = Math.max(0, run.kept); it.give(); on('sfx', 'coin'); fence('"Pleasure. Anything else?"'); },
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
    on('clear-save');
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


  // ---------- a frame of the game ----------
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
    if (S.paused || S.cardUp) { edge.clear(); return; }
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
        else if (edge.has('leave') || edge.has('kill')) { R.aim = null; on('pad'); }
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
    // camera: well ahead of where she is running, so she can see the next gap coming
    P.look = (P.look || 0) + ((P.state === 'ground' || P.state === 'air' ? P.f * 40 : P.f * 16) - (P.look || 0)) * Math.min(1, dt * 2.5);
    const tx = P.px - VW / 2 + P.look, ty = P.py - 14 - VH / 2;
    S.cam.x += (tx - S.cam.x) * Math.min(1, dt * 7);
    S.cam.y += (ty - S.cam.y) * Math.min(1, dt * 7);
    on('cam');
  }


  // ---------- the keys, as the page sets them ----------
  const keys = { left: false, right: false, up: false, down: false, jump: false, act: false, kill: false };
  const edge = new Set();

  return {
    parseLevel, standable, settle, resolve, reach, esc, showCard, hideCard, toast, freshRun, freshLevel, roomState, checkpoint, startLevel, spawnGuard, syncCell, playerCell, onFloor, moveX, moveY, animate, hangAt, toClimb, jump, leaveInto, tryGrab, land, groundUp, groundDown, updHang, updClimb, updAir, updGround, updPlayer, hurt, die, restore, sees, raiseAlarm, updGuard, takedownTarget, takedown, tryWindow, irisTo, placeSpot, enterRoom, leaveRoom, blocked, stepPlayer, walkTo, usePoint, useSpot, roomUpdate, noise, wake, updPerson, buildPlan, startRoutine, routeTo, sightOf, farEnd, resetRoom, finishMethod, leaveFinale, nearestSpot, doSpot, hideIn, completeSearch, grant, aimTargets, startAim, aimStep, aimFire, pebbleListeners, throwPebble, fireDart, roomTakedownTarget, roomTakedown, lootChoice, afterLoot, statsHtml, fence, consequence, levelIntro, ending, newGame, update, updExt, T, VW, VH, HURT_FALL, DEATH_FALL, SIGHT, MAX_HEARTS, FLOOR, ROOM_SIGHT, DUR, LEVELS, INNOCENT, ITEM_NAMES, at, SOLID, LEDGE, HOLD, isSolid, isLedge, isFloor, grabbable, isHay, ivyAt, ivyOK, decoAt, mv, THEMES, SPOT, HORIZON, EYE, WALL_H, depthK, proj, kAtX, V_MIN, V_MAX, FX, FY, fdist, WIN, DOOR, DOOR_V, CLIMB_IN, PEEK_AT, SILL, S, chaos, has, roomDef, clone, MV, LABEL, TARGET, WHO, ON_WALL, DEPTH, LANE, uOf, halfU, down, ACTS, methodOf, knownM, missingFor, itemName, KIND_WORD, HIDEABLE, PEBBLE_EAR, pebbleLanding, whoList, SHOP, keys, edge,
  };
}
