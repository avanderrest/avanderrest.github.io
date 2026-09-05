/* Wayside — pick one of three cards to lay the road ahead, then walk it with WASD or the arrows.
   Some cards are already on the ground, face down; they turn over when you lay a card beside them.
   Plain DOM, nothing to build. Saves to localStorage. */
(() => {
  'use strict';

  // ---------- constants ----------
  const SAVE_KEY = 'wayside-save-v2';
  const ROWS = 4, COLS = 15;
  const MAX_HEARTS = 3;
  const START = { r: 1, c: 0 };
  const DIRS = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
  const KEYDIR = { arrowup: 'up', w: 'up', arrowdown: 'down', s: 'down', arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right' };
  const DIR_WORD = { up: 'north', down: 'south', left: 'west', right: 'east' };
  const DIR_KEYS = ['up', 'right', 'down', 'left'];   // bit order for the road masks
  const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

  const $ = (s) => document.querySelector(s);
  const rnd = (n) => Math.floor(Math.random() * n);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const inBounds = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS;
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

  // ---------- cards ----------
  // kind: path | item | npc | enemy | block | goal. `spent` is how a used-up card looks afterwards.
  // `text` is what the hand shows for cards you can draw, and what the journal says for the rest.
  const CARDS = {
    home:      { name: 'Home',         icon: '🏠', kind: 'path',  text: 'Your cottage. Everything starts here.' },
    meadow:    { name: 'Meadow',       icon: '🌾', kind: 'path',  text: 'Open grass and easy walking.' },
    woods:     { name: 'Woods',        icon: '🌲', kind: 'path',  text: 'Pines, and soft needles underfoot.' },
    brook:     { name: 'Brook',        icon: '💧', kind: 'path',  text: 'A shallow stream. You can step across.' },
    coins:     { name: 'Coin purse',   icon: '💰', kind: 'item',  text: 'Somebody dropped this. Finders keepers.', spent: { name: 'Empty purse', icon: '👝' } },
    berries:   { name: 'Berry bush',   icon: '🫐', kind: 'item',  text: 'Eat your fill. Restores one heart.', spent: { name: 'Picked bush', icon: '🌿' } },
    camp:      { name: 'Campfire',     icon: '🔥', kind: 'path',  text: 'Rest here to restore every heart. Works each visit.' },
    wolf:      { name: 'Wolf',         icon: '🐺', kind: 'enemy', text: 'Bites for one heart. With a sword it flees and leaves a 2 coin bounty.', spent: { name: 'Wolf tracks', icon: '🐾' } },
    traveller: { name: 'Traveller',    icon: '🧳', kind: 'npc',   text: 'Knows the land and will share a rumour.', spent: { name: 'Empty road', icon: '🛤️' } },
    lookout:   { name: 'Lookout hill', icon: '⛰️', kind: 'path',  text: 'From the top, every hidden card within two spaces turns over.' },

    mine:       { name: 'Old mine',    icon: '⛏️', kind: 'item',  text: 'A collapsed shaft. Something glints inside.', spent: { name: 'Old mine', icon: '🕳️' } },
    smith:      { name: 'Blacksmith',  icon: '🔨', kind: 'npc',   text: 'Forges for anyone who brings iron.' },
    fisher:     { name: 'Fisherman',   icon: '🎣', kind: 'npc',   text: 'Sits beside a boat that is going nowhere.' },
    reeds:      { name: 'Reeds',       icon: '🌱', kind: 'item',  text: 'Tall reeds at the water\'s edge.', spent: { name: 'Reeds', icon: '🌱' } },
    river:      { name: 'River',       icon: '🌊', kind: 'block', text: 'Deep and fast. You would need a boat.' },
    bridge:     { name: 'Bridge',      icon: '🌉', kind: 'enemy', text: 'A bandit sits on the only bridge.', spent: { name: 'Bridge', icon: '🌉' } },
    hermit:     { name: 'Hermit',      icon: '🧙', kind: 'npc',   text: 'Lives alone and likes it that way.' },
    hollow:     { name: 'Damp hollow', icon: '🍄', kind: 'item',  text: 'Mushrooms grow in the shade.', spent: { name: 'Damp hollow', icon: '🍂' } },
    wall:       { name: 'Old wall',    icon: '🧱', kind: 'block', text: 'Far too high to climb.' },
    gate:       { name: 'Iron gate',   icon: '🚪', kind: 'block', text: 'Locked. There must be a key somewhere.', spent: { name: 'Open gate', icon: '🚪' } },
    lighthouse: { name: 'Lighthouse',  icon: '🗼', kind: 'goal',  text: 'The end of the road.' },
  };

  const ITEMS = {
    ore:       { name: 'Iron ore',  icon: '🪨' },
    sword:     { name: 'Sword',     icon: '🗡️' },
    oars:      { name: 'Oars',      icon: '🛶' },
    boat:      { name: 'Boat',      icon: '⛵' },
    mushrooms: { name: 'Mushrooms', icon: '🍄' },
    key:       { name: 'Iron key',  icon: '🗝️' },
  };

  // what you can draw, and how often
  const DECK = [['meadow', 7], ['woods', 6], ['brook', 3], ['coins', 5], ['berries', 3], ['camp', 2], ['wolf', 4], ['traveller', 3], ['lookout', 2]];
  const DECK_TOTAL = DECK.reduce((n, [, w]) => n + w, 0);
  function draw() {
    let x = rnd(DECK_TOTAL);
    for (const [id, w] of DECK) { if (x < w) return id; x -= w; }
    return 'meadow';
  }

  // rumours the traveller shares, first one whose condition holds and which hasn't been told yet
  const HINTS = [
    { when: (s) => !s.inv.boat && !s.flags.bridgeOpen, text: 'A river cuts the land in two, six cards east of your door. There is one bridge, and someone unpleasant sits on it.' },
    { when: (s) => !s.inv.oars && !s.inv.boat, text: 'The old fisherman up north lost his oars in the reeds down south, near the river. He would be grateful.' },
    { when: (s) => !s.inv.sword, text: 'The smith south of the road forges for iron ore. There is an old mine on the north side, near your home.' },
    { when: (s) => !s.flags.bridgeOpen && !s.inv.boat, text: 'The bandit on the bridge has a price. Five coins, last I heard. Or a blade in your hand.' },
    { when: (s) => !s.inv.key && !s.flags.gateOpen, text: 'Past the river a hermit hoards an iron key. He is fond of mushrooms, which grow in damp hollows.' },
    { when: () => true, text: 'A lighthouse stands at the far end of the land, fourteen cards east of home. Nobody remembers who last lit it.' },
    { when: () => true, text: 'Wolves shy away from a drawn blade. Some even pay a bounty, in a manner of speaking.' },
    { when: () => true, text: 'Campfires are worth remembering. Lay one where you know you will pass again.' },
    { when: () => true, text: 'You can only lay a card beside the one you stand on. Plan the road, then walk it.' },
  ];

  // ---------- state ----------
  let S = null;            // the saved game
  let dlg = null;          // open dialogue: { options: [{ label, do }] }
  let flashTimer = 0;
  let justPlaced = null;   // 'r,c' of the last laid card, for the deal animation
  let CW = 104, CH = 140, GAP = 10;

  const board = $('#board'), viewport = $('#viewport'), overlay = $('#overlay');
  const handEl = $('#hand'), statsEl = $('#stats'), invEl = $('#inv'), logEl = $('#log'), hintEl = $('#hint');
  const turnEl = $('#turn');
  const slotEls = [];
  let heroEl = null;

  function freshState() {
    const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    const put = (r, c, id, extra) => { grid[r][c] = Object.assign({ id, up: false, used: false, mine: false }, extra || {}); };

    put(START.r, START.c, 'home', { up: true, mine: true });
    // near home: two ways to earn a sword, and the fisherman's lost oars
    put(0, 1, 'mine');
    put(3, 0, 'coins', { amount: 3 });
    put(3, 2, 'smith');
    put(0, 4, 'fisher');
    put(3, 5, 'reeds');
    // the river, with one bridge
    for (let r = 0; r < ROWS; r++) put(r, 6, r === 1 ? 'bridge' : 'river');
    // over the water: a hermit who wants mushrooms, wolves guarding the hollow, a fire to rest at
    put(0, 8, 'hermit');
    put(1, 8, 'camp');
    put(3, 8, 'wolf');
    put(2, 9, 'wolf');
    put(3, 9, 'hollow');
    put(1, 10, 'coins', { amount: 2 });
    // the wall, with one gate
    for (let r = 0; r < ROWS; r++) put(r, 11, r === 2 ? 'gate' : 'wall');
    put(0, 13, 'berries');
    put(2, 14, 'lighthouse');

    const s = {
      v: 2, grid, hero: { ...START }, hearts: MAX_HEARTS, coins: 0, inv: {}, flags: {},
      hand: [draw(), draw(), draw()], selected: null, phase: 'place',
      steps: 0, placed: 0, hintsTold: [], log: [], won: false, route: null,
    };
    return s;
  }

  function newGame(firstRun) {
    S = freshState();
    log('You lock the door behind you. The lighthouse is somewhere east.');
    revealAround(START.r, START.c, true);
    save();
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
      if (!s || s.v !== 2 || !Array.isArray(s.grid) || s.grid.length !== ROWS) return false;
      S = s;
      return true;
    } catch (e) { return false; }
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
    if (S.won) return 'The lamp is lit. Wander as long as you like, or start a new journey.';
    if (S.phase === 'move') return 'Your card is down. Now take your step — WASD, the arrows, or click a card beside you.';
    if (!hasEmptyNeighbour()) return 'No open ground beside you, so this one is free: take a step.';
    if (S.selected !== null) return `Holding ${CARDS[S.hand[S.selected]].name}. Press a direction or click a glowing space to lay it. Esc to put it back.`;
    return 'Lay a card before you move — pick one with 1, 2 or 3, then press a direction.';
  }
  function nextHint() {
    for (let i = 0; i < HINTS.length; i++) {
      if (S.hintsTold.includes(i)) continue;
      if (HINTS[i].when(S)) { S.hintsTold.push(i); return HINTS[i].text; }
    }
    return 'Long way from anywhere, out here. Mind the wolves.';
  }

  // ---------- the world ----------
  function revealAround(r, c, quiet) {
    for (const dir of Object.keys(DIRS)) {
      const [dr, dc] = DIRS[dir];
      const rr = r + dr, cc = c + dc;
      if (!inBounds(rr, cc)) continue;
      const cell = S.grid[rr][cc];
      if (cell && !cell.up) {
        cell.up = true;
        if (!quiet) log(`A card turns over to the ${DIR_WORD[dir]}: ${CARDS[cell.id].name}.`);
      }
    }
  }
  function isAdjacent(r, c) {
    return Math.abs(r - S.hero.r) + Math.abs(c - S.hero.c) === 1;
  }
  function takeOnce(cell, item, text) {
    if (cell.used) return;
    cell.used = true;
    S.inv[item] = true;
    log(text);
    flash(`Picked up: ${ITEMS[item].name}.`);
  }
  function hurt(n, why) {
    S.hearts = Math.max(0, S.hearts - n);
    log(why);
    heroEl.classList.remove('ouch');
    void heroEl.offsetWidth;
    heroEl.classList.add('ouch');
    if (S.hearts === 0) {
      S.hearts = MAX_HEARTS;
      S.hero = { ...START };
      S.phase = 'place';
      log('Everything goes dark. You wake at home, bandaged, and every card you laid is still on the ground.');
      flash('You wake up back at home.');
    } else {
      flash(why);
    }
  }
  function openBridge(cell, how) {
    cell.used = true;
    S.flags.bridgeOpen = true;
    if (!S.route) S.route = 'bridge';
    log(how);
  }

  // per-card behaviour. tryEnter returns false to stop the move (and may open a dialogue that
  // moves you afterwards). arrive fires once you are standing on the card.
  const ON = {
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
        if (S.hearts < MAX_HEARTS) { S.hearts++; log('Berries. You feel better for them.'); flash('A heart back.'); }
        else log('Berries. Sweet, but you were fine already.');
      },
    },
    camp: {
      arrive() {
        if (S.hearts < MAX_HEARTS) { S.hearts = MAX_HEARTS; log('You rest by the fire until you are whole again.'); flash('Rested. All hearts back.'); }
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
    traveller: {
      arrive(cell) {
        if (cell.used) return;
        cell.used = true;
        const h = nextHint();
        log(`Traveller: "${h}"`);
        dialog('🧳', 'Traveller', h, [{ label: 'Thank them and move on', primary: true }]);
      },
    },
    lookout: {
      arrive(cell, r, c) {
        let n = 0;
        for (let rr = r - 2; rr <= r + 2; rr++) for (let cc = c - 2; cc <= c + 2; cc++) {
          if (!inBounds(rr, cc)) continue;
          const other = S.grid[rr][cc];
          if (other && !other.up) { other.up = true; n++; }
        }
        log(n ? `From the hill you make out ${plural(n, 'hidden card')}.` : 'From the hill: nothing new to see.');
        if (n) flash(`${plural(n, 'card')} turned over.`);
      },
    },
    mine: { arrive(cell) { takeOnce(cell, 'ore', 'Iron ore, heavy and cold. A smith would want this.'); } },
    reeds: { arrive(cell) { takeOnce(cell, 'oars', 'A pair of oars, tangled in the reeds. Someone will be missing these.'); } },
    hollow: { arrive(cell) { takeOnce(cell, 'mushrooms', 'A capful of mushrooms from the damp hollow.'); } },
    smith: {
      arrive() {
        if (S.inv.sword) return dialog('🔨', 'Blacksmith', 'Keep it sharp, and keep it pointed away from me.', [{ label: 'Leave', primary: true }]);
        const opts = [];
        if (S.inv.ore) opts.push({ label: 'Hand over the iron ore', primary: true, do() { S.inv.ore = false; S.inv.sword = true; log('The smith hammers your ore into a plain, sharp sword.'); flash('You have a sword.'); } });
        if (S.coins >= 8) opts.push({ label: 'Pay 8 coins for a sword', do() { S.coins -= 8; S.inv.sword = true; log('Eight coins buys a sword with somebody else\'s initials on it.'); flash('You have a sword.'); } });
        opts.push({ label: 'Leave' });
        dialog('🔨', 'Blacksmith', S.inv.ore
          ? 'That is good ore you have there. Give it here and I will make you something with an edge.'
          : 'Bring me iron and I will make you something with an edge. There is an old mine north of the road. Or eight coins, if you have no back for digging.', opts);
      },
    },
    fisher: {
      arrive() {
        if (S.inv.boat) return dialog('🎣', 'Fisherman', 'Mind the current. She is a good boat, but she is not a bridge.', [{ label: 'Leave', primary: true }]);
        const opts = [];
        if (S.inv.oars) opts.push({ label: 'Hand over the oars', primary: true, do() { S.inv.oars = false; S.inv.boat = true; log('The fisherman takes his oars and, without a word, pushes his boat toward you. River cards are yours to cross now.'); flash('You have a boat. You can cross river cards.'); } });
        opts.push({ label: 'Leave' });
        dialog('🎣', 'Fisherman', S.inv.oars
          ? 'Those are my oars! Lost them in the reeds down south. Give them here and the boat is yours. I am too old to row anyway.'
          : 'Lost my oars in the reeds downstream, south of the road. Cannot row without them, and I am too old to wade.', opts);
      },
    },
    hermit: {
      arrive(cell) {
        if (cell.used) return dialog('🧙', 'Hermit', 'You again. The gate is south-east, by the wall. Go and bother it instead.', [{ label: 'Leave', primary: true }]);
        const opts = [];
        if (S.inv.mushrooms) opts.push({ label: 'Offer the mushrooms', primary: true, do() { S.inv.mushrooms = false; S.inv.key = true; cell.used = true; log('The hermit sniffs the mushrooms, nods, and drops an iron key into your hand.'); flash('You have the iron key.'); } });
        opts.push({ label: 'Leave' });
        dialog('🧙', 'Hermit', S.inv.mushrooms
          ? 'Are those... mushrooms? Well. Perhaps you can stay a moment. I have a key I never use.'
          : 'Go away. Unless you have mushrooms. There is a damp hollow to the south-east where they grow. Then you may stay a little.', opts);
      },
    },
    river: {
      tryEnter() {
        if (S.inv.boat) { if (!S.route) S.route = 'boat'; return true; }
        flash('The river is too deep and too fast. You would need a boat.');
        return false;
      },
      arrive() { if (!S.flags.rowed) { S.flags.rowed = true; log('You push off and row. The current tugs, but the boat holds.'); } },
    },
    bridge: {
      tryEnter(cell, r, c) {
        if (cell.used) return true;
        const opts = [];
        if (S.inv.sword) opts.push({ label: 'Draw your sword', primary: true, do() { openBridge(cell, 'One look at the blade and the bandit is over the rail and swimming.'); moveTo(r, c); } });
        if (S.coins >= 5) opts.push({ label: 'Pay 5 coins', primary: !S.inv.sword, do() { S.coins -= 5; openBridge(cell, 'He counts the coins twice and waves you across.'); moveTo(r, c); } });
        opts.push({ label: 'Back away' });
        dialog('🥷', 'Bandit', 'Toll bridge. Five coins, or turn around. Unless you fancy your chances.', opts);
        return false;
      },
    },
    wall: { tryEnter() { flash('The wall is far too high. There must be a way through.'); return false; } },
    gate: {
      tryEnter(cell) {
        if (cell.used) return true;
        if (S.inv.key) {
          cell.used = true; S.inv.key = false; S.flags.gateOpen = true;
          log('The key turns with a shriek. The gate swings open.');
          flash('The gate is open.');
          return true;
        }
        flash('Locked. Someone around here must have the key.');
        return false;
      },
    },
    lighthouse: { arrive() { win(); } },
  };

  // ---------- the turn, and the shape of the road ----------
  // One card, then one step, then one card. You may only break the alternation when
  // there is nowhere left beside you to lay anything.
  function hasEmptyNeighbour() {
    for (const dir of DIR_KEYS) {
      const [dr, dc] = DIRS[dir];
      const r = S.hero.r + dr, c = S.hero.c + dc;
      if (inBounds(r, c) && !S.grid[r][c]) return true;
    }
    return false;
  }
  function canPlace() { return S.won || S.phase === 'place'; }
  function canMove() { return S.won || S.phase === 'move' || !hasEmptyNeighbour(); }
  function turnLabel() {
    if (S.won) return 'Wander freely';
    return canPlace() && hasEmptyNeighbour() ? 'Lay a card' : 'Take a step';
  }
  function phaseName() {
    if (S.won) return 'free';
    return canPlace() && hasEmptyNeighbour() ? 'place' : 'move';
  }

  // Does a card have road running through it? Water and stone do not, until they are opened.
  function carriesRoad(cell) {
    if (!cell || !cell.up) return false;
    const kind = CARDS[cell.id].kind;
    if (kind !== 'block') return true;
    return !!cell.used;                     // an unlocked gate becomes road
  }
  // `full` are the directions the road actually runs. `stub` are the directions where the
  // road on the far side comes up to this card and stops — the broken bridge over the river.
  function roadMask(r, c) {
    const cell = S.grid[r][c];
    if (!cell || !cell.up) return { full: 0, stub: 0, self: false };
    const self = carriesRoad(cell);
    let full = 0, stub = 0;
    DIR_KEYS.forEach((dir, bit) => {
      const [dr, dc] = DIRS[dir];
      const rr = r + dr, cc = c + dc;
      if (!inBounds(rr, cc) || !carriesRoad(S.grid[rr][cc])) return;
      if (self) full |= 1 << bit; else stub |= 1 << bit;
    });
    return { full, stub, self };
  }

  // ---------- moving and laying ----------
  function act(dir) {
    const [dr, dc] = DIRS[dir];
    const r = S.hero.r + dr, c = S.hero.c + dc;
    if (!inBounds(r, c)) { flash('The world ends here.'); return; }
    if (!S.grid[r][c]) {
      if (!canPlace()) flash(`Nothing to the ${DIR_WORD[dir]} yet — and your card is already down. Take your step first.`);
      else if (S.selected === null) flash(`Pick a card (1, 2, 3) first, then press ${DIR_WORD[dir]} to lay it there.`);
      else placeAt(r, c);
      return;
    }
    tryMove(r, c);
  }

  function tryMove(r, c) {
    const cell = S.grid[r][c];
    if (!cell) return;
    if (!canMove()) { flash('Lay a card before you move — one card, then one step.'); return; }
    if (!cell.up) { cell.up = true; log(`You peer at the card to the side: ${CARDS[cell.id].name}.`); render(); return; }
    const on = ON[cell.id];
    if (on && on.tryEnter && !on.tryEnter(cell, r, c)) { save(); render(); return; }
    moveTo(r, c);
  }

  function moveTo(r, c) {
    S.hero = { r, c };
    S.steps++;
    S.phase = 'place';
    revealAround(r, c);
    const cell = S.grid[r][c];
    const on = ON[cell.id];
    if (on && on.arrive) on.arrive(cell, r, c);
    save();
    render();
  }

  function placeAt(r, c) {
    if (S.selected === null || S.grid[r][c] || !isAdjacent(r, c) || !canPlace()) return;
    const id = S.hand[S.selected];
    S.grid[r][c] = { id, up: true, used: false, mine: true, amount: id === 'coins' ? 1 + rnd(3) : undefined };
    S.placed++;
    const dir = Object.keys(DIRS).find((k) => DIRS[k][0] === r - S.hero.r && DIRS[k][1] === c - S.hero.c);
    log(`You lay ${CARDS[id].name} to the ${DIR_WORD[dir]}.`);
    S.hand[S.selected] = draw();
    S.selected = null;
    S.phase = 'move';
    justPlaced = `${r},${c}`;
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

  function win() {
    if (S.won) return;
    S.won = true;
    log('You climb the stairs and light the lamp. Far behind you, the road you laid glows in it.');
    const by = S.route === 'boat' ? 'rowed across the river in a borrowed boat' : 'crossed by the bandit\'s bridge';
    overlay.innerHTML = `
      <div class="modal win" role="dialog" aria-labelledby="dlg-title">
        <div class="big">🗼</div>
        <h2 id="dlg-title">The lamp is lit</h2>
        <p>You reached the lighthouse in <b>${plural(S.steps, 'step')}</b>, laying <b>${plural(S.placed, 'card')}</b> along the way. You ${by}, and arrived with <b>${plural(S.coins, 'coin')}</b> to your name.</p>
        <p class="muted">Every journey lays a different road. Try the other way across next time.</p>
        <div class="actions">
          <button class="primary" data-action="new-game"><span class="key">1</span> Walk it again</button>
          <button data-action="close"><span class="key">2</span> Keep wandering</button>
        </div>
      </div>`;
    overlay.hidden = false;
    dlg = { options: [{ label: 'again', do: () => newGame(false) }, { label: 'close' }] };
  }

  // ---------- dialogue and overlays ----------
  function dialog(icon, title, say, options) {
    dlg = { options };
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-labelledby="dlg-title">
        <div class="big">${icon}</div>
        <h2 id="dlg-title">${title}</h2>
        <p class="say">“${say}”</p>
        <div class="actions">
          ${options.map((o, i) => `<button class="${o.primary ? 'primary' : ''}" data-opt="${i}"><span class="key">${i + 1}</span> ${o.label}</button>`).join('')}
        </div>
      </div>`;
    overlay.hidden = false;
    const first = overlay.querySelector('button.primary') || overlay.querySelector('button');
    if (first) first.focus();
  }
  function chooseOption(i) {
    if (!dlg || !dlg.options[i]) return;
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
  function showHelp() {
    dlg = { options: [{ label: 'close' }] };
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-labelledby="dlg-title">
        <h2 id="dlg-title">How to play</h2>
        <p>You are the round yellow one. Somewhere east is a lighthouse nobody has lit in years. There is no road, so you will have to lay one.</p>
        <h3>One card, then one step</h3>
        <p>The journey goes in strict turns. <b>You cannot move until you have laid a card, and you cannot lay another until you have moved.</b> Every step you take costs a card, and every card you lay buys exactly one step.</p>
        <ul>
          <li><b>Lay.</b> Your hand holds three cards. Press <kbd>1</kbd>, <kbd>2</kbd> or <kbd>3</kbd> (or click) to pick one up, then press a direction, or click a glowing space, to lay it beside you. You draw a replacement straight away.</li>
          <li><b>Step.</b> Now <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or the arrow keys move you onto any card next to you — not only the one you just laid. Clicking a neighbouring card works too.</li>
          <li>Stepping onto a card does what it says: pick up the coins, meet the traveller, wake the wolf.</li>
          <li>If there is no open ground at all beside you, the laying half is skipped and you may simply step.</li>
        </ul>
        <h3>The road</h3>
        <p>Every card carries a stretch of road, and it joins up with the road on the cards around it. Lay a card, or turn one over, and you will see the path thread onward through it. Water and stone carry no road: the track runs up to the bank and stops. Open the gate and the road runs on through.</p>
        <h3>Face-down cards</h3>
        <p>Some cards were on the ground before you arrived. They stay face down until you lay a card beside them, then they turn over. Rivers, walls and bandits do not care about your plans, and the things that get you past them are often somewhere you have already been. Walk back for them.</p>
        <h3>Card colours</h3>
        <div class="kinds">
          <span class="k-path">Path</span><span class="k-item">Item</span><span class="k-npc">Someone to talk to</span><span class="k-enemy">Trouble</span><span class="k-block">Blocked</span><span class="k-goal">The lighthouse</span>
        </div>
        <p class="muted" style="margin-top:0.8rem">Run out of hearts and you wake up at home. Everything you laid stays laid. Your journey saves itself as you go.</p>
        <div class="actions">
          <button class="primary" data-action="close"><span class="key">1</span> Back to the road</button>
        </div>
      </div>`;
    overlay.hidden = false;
  }

  // ---------- rendering ----------
  function readSizes() {
    // measure a real slot rather than parsing the CSS variables, which may be calc()/clamp()
    const first = slotEls[0] && slotEls[0][0];
    if (!first) return;
    const box = first.getBoundingClientRect();
    if (box.width) CW = box.width;
    if (box.height) CH = box.height;
    GAP = parseFloat(getComputedStyle(board).columnGap) || GAP;
  }

  function buildBoard() {
    board.innerHTML = '';
    for (let r = 0; r < ROWS; r++) {
      slotEls[r] = [];
      for (let c = 0; c < COLS; c++) {
        const el = document.createElement('div');
        el.className = 'slot empty';
        el.dataset.r = r; el.dataset.c = c;
        el.style.gridRow = r + 1; el.style.gridColumn = c + 1;
        el.setAttribute('role', 'gridcell');
        el.innerHTML = `<div class="card"><div class="inner">
            <div class="face back"><span>?</span></div>
            <div class="face front">
              <div class="scene">
                <div class="sky"></div>
                <div class="ground"></div>
                <div class="road" aria-hidden="true">
                  <i class="rd up"></i><i class="rd right"></i><i class="rd down"></i><i class="rd left"></i>
                  <i class="hub"></i>
                </div>
                <span class="icon"></span>
              </div>
              <div class="label"><span class="name"></span></div>
            </div>
          </div></div>`;
        board.appendChild(el);
        slotEls[r][c] = el;
      }
    }
    heroEl = document.createElement('div');
    heroEl.className = 'hero';
    heroEl.textContent = '🚶';
    heroEl.setAttribute('aria-label', 'You');
    board.appendChild(heroEl);
  }

  function render() {
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const el = slotEls[r][c];
      const cell = S.grid[r][c];
      const adjacent = isAdjacent(r, c);
      el.classList.toggle('empty', !cell);
      el.classList.toggle('near', !cell && adjacent);
      el.classList.toggle('target', !cell && adjacent && S.selected !== null && canPlace());
      el.classList.toggle('walk', !!cell && cell.up && adjacent && canMove());
      el.classList.toggle('here', r === S.hero.r && c === S.hero.c);
      const card = el.firstElementChild;
      card.classList.toggle('up', !!cell && cell.up);
      card.classList.toggle('placed', !!cell && cell.mine);
      const road = card.querySelector('.road');
      if (cell) {
        const def = CARDS[cell.id];
        const spent = cell.used && def.spent;
        const look = spent ? def.spent : def;
        card.dataset.kind = def.kind;
        card.dataset.id = cell.id;
        card.classList.toggle('spent', !!spent);
        card.querySelector('.icon').textContent = look.icon;
        card.querySelector('.name').textContent = look.name;

        const m = roadMask(r, c);
        DIR_KEYS.forEach((dir, bit) => {
          road.classList.toggle('r-' + dir, !!(m.full & (1 << bit)));
          road.classList.toggle('s-' + dir, !!(m.stub & (1 << bit)));
        });
        road.classList.toggle('has-hub', m.self);
        el.setAttribute('aria-label', cell.up ? `${look.name}, ${def.kind}${roadWords(m)}` : 'Face-down card');
        if (justPlaced === `${r},${c}`) {
          justPlaced = null;
          card.classList.add('new');
          card.addEventListener('animationend', () => card.classList.remove('new'), { once: true });
        }
      } else {
        road.className = 'road';
        el.setAttribute('aria-label', adjacent ? 'Empty space you can lay a card on' : 'Empty ground');
      }
    }

    // stand on the road, which crosses each card at 52% of its height
    heroEl.style.left = `${S.hero.c * (CW + GAP) + CW / 2}px`;
    heroEl.style.top = `${S.hero.r * (CH + GAP) + CH * 0.68 - 17}px`;

    renderHand();
    renderStats();
    renderInv();
    renderLog();
    updateCamera();
    if (!hintEl.classList.contains('flash')) hintEl.textContent = defaultHint();
  }

  function roadWords(m) {
    if (!m.self) return m.stub ? ', the road stops at its edge' : '';
    const runs = DIR_KEYS.filter((d, bit) => m.full & (1 << bit)).map((d) => DIR_WORD[d]);
    return runs.length ? `, road running ${runs.join(' and ')}` : '';
  }

  function renderHand() {
    const laying = canPlace() && (hasEmptyNeighbour() || S.won);
    handEl.innerHTML = S.hand.map((id, i) => {
      const d = CARDS[id];
      const road = CARDS[id].kind === 'block' ? '' : 'r-left r-right has-hub';
      return `<button class="hcard ${S.selected === i ? 'sel' : ''}" data-kind="${d.kind}" data-id="${id}" data-i="${i}" type="button" aria-pressed="${S.selected === i}" ${laying ? '' : 'disabled'}>
          <span class="key">${i + 1}</span>
          <span class="scene">
            <span class="sky"></span>
            <span class="ground"></span>
            <span class="road ${road}" aria-hidden="true"><i class="rd left"></i><i class="rd right"></i><i class="hub"></i></span>
            <span class="icon">${d.icon}</span>
          </span>
          <span class="name">${d.name}</span>
          <span class="text">${d.text}</span>
        </button>`;
    }).join('');
    turnEl.textContent = turnLabel();
    document.body.dataset.phase = phaseName();
  }

  function renderStats() {
    let hearts = '';
    for (let i = 0; i < MAX_HEARTS; i++) hearts += `<span class="${i < S.hearts ? 'on' : 'off'}">♥</span>`;
    statsEl.innerHTML = `
      <span class="stat hearts ${S.hearts <= 1 ? 'low' : ''}" title="Hearts">${hearts}</span>
      <span class="stat" title="Coins">🪙 <b>${S.coins}</b></span>
      <span class="stat"><span class="lbl">steps</span> <b>${S.steps}</b></span>
      <span class="stat"><span class="lbl">cards laid</span> <b>${S.placed}</b></span>`;
  }

  function renderInv() {
    const have = Object.keys(ITEMS).filter((k) => S.inv[k]);
    invEl.innerHTML = have.length
      ? have.map((k) => `<span class="item">${ITEMS[k].icon} ${ITEMS[k].name}</span>`).join('')
      : '<span class="none">Nothing but the clothes you stand in.</span>';
  }

  function renderLog() {
    logEl.innerHTML = S.log.map((t) => `<li>${t}</li>`).join('');
  }

  function updateCamera() {
    const vw = viewport.clientWidth - 28; // viewport padding
    const step = CW + GAP;
    const boardW = COLS * step - GAP;
    let x = S.hero.c * step + CW / 2 - vw / 2;
    x = clamp(x, 0, Math.max(0, boardW - vw));
    board.style.transform = `translateX(${-x}px)`;
  }

  // ---------- input ----------
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (dlg) {
      if (k === 'escape') { e.preventDefault(); chooseOption(dlg.options.length - 1); }
      else if (/^[1-9]$/.test(k)) { e.preventDefault(); chooseOption(+k - 1); }
      return;
    }
    if (k in KEYDIR) { e.preventDefault(); act(KEYDIR[k]); }
    else if (k === '1' || k === '2' || k === '3') { e.preventDefault(); selectHand(+k - 1); }
    else if (k === 'escape') { S.selected = null; hint(defaultHint()); render(); }
    else if (k === '?' || k === 'h') showHelp();
  });

  board.addEventListener('click', (e) => {
    const slot = e.target.closest('.slot');
    if (!slot || dlg) return;
    const r = +slot.dataset.r, c = +slot.dataset.c;
    if (!isAdjacent(r, c)) { if (!(r === S.hero.r && c === S.hero.c)) flash('Too far. You can only reach the cards next to you.'); return; }
    if (!S.grid[r][c]) {
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
    else if (a === 'new-game') {
      if (S.won || S.steps === 0 || confirm('Start a new journey? The road you have laid will be gone.')) newGame(false);
    }
  });

  overlay.addEventListener('click', (e) => {
    const b = e.target.closest('[data-opt]');
    if (b) { chooseOption(+b.dataset.opt); return; }
    if (e.target === overlay && dlg && !overlay.querySelector('[data-opt]')) { closeOverlay(); render(); }
  });

  window.addEventListener('resize', () => { readSizes(); render(); });

  // ---------- go ----------
  buildBoard();
  readSizes();
  if (load()) {
    render();
    hint(S.won ? defaultHint() : 'Welcome back. Your road is where you left it.');
  } else {
    newGame(true);
    setTimeout(showHelp, 400);
  }
})();
