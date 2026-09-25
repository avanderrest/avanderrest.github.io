/* The Garden Shed — a flower shop in a potting shed.
   Three places, left to right: the garden, where the flowers grow; the shed, where
   they are made up; and the stall at the end of the lane, where people come and ask.
   When somebody comes wanting to say something, say it for them in a vase. Every flower means something, and so does
   every colour; the customer knows what they want to say, and sometimes a good deal
   more about it than that. */
(() => {
  'use strict';

  // ---------- constants ----------

  const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];
  const DAYS_PER_SEASON = 7;
  // The shed was a cottage life sim until 2026-09-25, saved under -v2. That diary is
  // a different game and is left where it is; the shop starts its own.
  const SAVE_KEY = 'the-garden-shed-v3';

  const POT_MAX = 8;
  const POT_PRICE = 20;
  // A cut stem ages a step every DAY_SLOTS customer slots from when it was cut, on its own
  // clock, not the calendar's.
  const STEM_DROOP = 3;     // steps before a stem starts to look tired
  const STEM_DEAD = 5;      // ...and before it goes on the compost
  const REP_START = 10;
  // The garden keeps customer time: a growing spell passes every GROW_EVERY customers,
  // and every time the lane would have sent somebody while the stall was closed.
  const GROW_EVERY = 2;
  const DAY_SLOTS = 6;      // customer slots to a day
  const MADE_MAX = 4;       // arrangements that fit on the cabinet top, set aside for later

  // What a bouquet can say. Every flower says one of these loudly and every colour
  // one of them quietly (FLOWER_W and COLOUR_W): a white rose is love, said solemnly.
  const TAGS = {
    love:       'Love',
    friendship: 'Friendship',
    sorry:      'Sorry',
    thanks:     'Thank you',
    sympathy:   'Sympathy',
    celebrate:  'Celebration',
    getwell:    'Get well',
    remember:   'Remembrance',
    cheer:      'Cheer',
    calm:       'Calm',
  };
  const FLOWER_W = 2;
  const COLOUR_W = 1;
  // Neighbouring feelings count for half; opposite ones count against.
  const RELATED = {
    love: ['thanks'], friendship: ['cheer', 'thanks'], sorry: ['calm', 'love'], thanks: ['friendship'],
    sympathy: ['remember', 'calm'], celebrate: ['cheer'], getwell: ['cheer', 'calm'],
    remember: ['sympathy'], cheer: ['celebrate', 'friendship'], calm: ['getwell', 'sympathy'],
  };
  const CLASH = {
    sympathy: ['celebrate', 'cheer'], remember: ['celebrate'], sorry: ['celebrate'],
    celebrate: ['sympathy', 'remember'], cheer: ['sympathy'], calm: ['celebrate'],
  };

  const COLOURS = {
    red:    { name: 'red',    tag: 'love',      m: '#c9374f', d: '#7e1e31', l: '#e0566b' },
    pink:   { name: 'pink',   tag: 'thanks',    m: '#ec9cc0', d: '#b9579a', l: '#f6c6dc' },
    yellow: { name: 'yellow', tag: 'cheer',     m: '#f2c53a', d: '#b8861c', l: '#f8dc7a' },
    white:  { name: 'white',  tag: 'sympathy',  m: '#f7f2e6', d: '#a99f88', l: '#ffffff' },
    purple: { name: 'purple', tag: 'calm',      m: '#8b6fc6', d: '#5a4390', l: '#a993dc' },
    blue:   { name: 'blue',   tag: 'remember',  m: '#6f95d8', d: '#3d5f9e', l: '#9cb8ea' },
    orange: { name: 'orange', tag: 'celebrate', m: '#ec8a3c', d: '#b8522a', l: '#f5ad6c' },
  };

  // The flowers, roughly after the Victorian books. `seed` is a packet's price in the
  // catalogue; a stem sells for about half that. `rep` is the reputation at which the
  // seed merchant starts carrying it. A `spike` stands up from its stem, not across it.
  const FLOWERS = {
    daisy:       { name: 'Daisy',         pl: 'daisies',        tag: 'getwell',    colours: ['white'],                           days: 3, yield: [3, 5], seed: 2, rep: 0,
      says: 'Innocence and new starts. The flower you take to somebody in bed.' },
    forgetmenot: { name: 'Forget-me-not', pl: 'forget-me-nots', tag: 'remember',   colours: ['blue'],                            days: 4, yield: [3, 4], seed: 2, rep: 0,
      says: 'It says what it is called. For the ones who are not here.' },
    sweetpea:    { name: 'Sweet pea',     pl: 'sweet peas',     tag: 'thanks',     colours: ['pink', 'purple', 'white'],         days: 4, yield: [3, 5], seed: 3, rep: 0,
      says: 'Thank you for a lovely time. Also, a little, goodbye.' },
    tulip:       { name: 'Tulip',         pl: 'tulips',         tag: 'cheer',      colours: ['red', 'yellow', 'pink', 'purple'], days: 4, yield: [3, 4], seed: 3, rep: 0,
      says: 'Spring in a jar. Nobody has ever been sad at a tulip.' },
    sunflower:   { name: 'Sunflower',     pl: 'sunflowers',     tag: 'friendship', colours: ['yellow'],                          days: 4, yield: [1, 2], seed: 3, rep: 0,
      says: 'Loyalty. It turns to follow you, which is what a friend does.' },
    rose:        { name: 'Rose',          pl: 'roses',          tag: 'love',       colours: ['red', 'pink', 'yellow', 'white'],  days: 6, yield: [2, 3], seed: 6, rep: 0,
      says: 'Love, before anything else. The colour says which kind.' },
    lavender:    { name: 'Lavender',      pl: 'lavender',       tag: 'calm',       colours: ['purple'],                          days: 5, yield: [3, 4], seed: 4, rep: 25, sprig: true, spike: true,
      says: 'Devotion, and a quiet room. Good on a desk before an exam.' },
    hyacinth:    { name: 'Hyacinth',      pl: 'hyacinths',      tag: 'sorry',      colours: ['purple', 'blue', 'pink', 'white'], days: 5, yield: [2, 3], seed: 4, rep: 25, spike: true,
      says: 'Please forgive me. The purple ones mean it most.' },
    dahlia:      { name: 'Dahlia',        pl: 'dahlias',        tag: 'celebrate',  colours: ['orange', 'red', 'pink'],           days: 5, yield: [2, 3], seed: 4, rep: 25,
      says: 'Dignity, and a party. A dahlia does not come quietly.' },
    iris:        { name: 'Iris',          pl: 'irises',         tag: 'sympathy',   colours: ['blue', 'purple', 'white'],         days: 5, yield: [2, 3], seed: 5, rep: 45,
      says: 'Faith and hope, and the message carried. The funeral flower.' },
  };

  // Four vases, as many of each as you like: a vase adds its `price` to the bill, but
  // never runs out. The flowers are what is finite, because you have to grow them. Each is drawn in a 120x160 box
  // standing on its foot at y=158; `mouth` is where the stems go in, `spread` how far
  // they lean out.
  const VASES = {
    bottle: { name: 'Stoneware bottle',   holds: 2, price: 2, mouth: 90,  lip: 4,  spread: 20, reach: 70 },
    jar:    { name: 'Jam jar',            holds: 3, price: 1, mouth: 107, lip: 12, spread: 30, reach: 64 },
    jug:    { name: 'Blue-and-white jug', holds: 5, price: 4, mouth: 100, lip: 12, spread: 42, reach: 68 },
    urn:    { name: 'Terracotta urn',     holds: 7, price: 7, mouth: 104, lip: 18, spread: 54, reach: 70 },
  };
  const VASE_ORDER = ['bottle', 'jar', 'jug', 'urn'];

  // The lane's regulars: they come back, and they have a favourite.
  const FOLK = [
    { id: 'ada',    name: 'Ada',    face: '👵', fav: 'rose',        hi: 'Ada, flour to the elbow, come straight from the ovens.' },
    { id: 'tomas',  name: 'Tomas',  face: '🧔', fav: 'sunflower',   hi: 'Tomas from next door, sawdust in his beard, looking at the door hinge.' },
    { id: 'wren',   name: 'Wren',   face: '👩‍🌾', fav: 'lavender',    hi: 'Wren, humming, with a bee still on her sleeve.' },
    { id: 'harold', name: 'Harold', face: '👴', fav: 'forgetmenot', hi: 'Harold, cap in both hands, in no hurry.' },
    { id: 'ines',   name: 'Ines',   face: '👩', fav: 'dahlia',      hi: 'Ines from the post office, with Marjorie the goat on a string.' },
    { id: 'poppy',  name: 'Poppy',  face: '👧', fav: 'tulip',       hi: 'Poppy, eight, with a fistful of coins and a very serious face.' },
  ];
  const WALKINS = [
    ['🧑‍💼', 'A man in a wet coat'], ['👩‍🦰', 'A woman with a bicycle'], ['🧑‍🎓', 'A student, out of breath'],
    ['👨‍🦳', 'An old man with a stick'], ['👩‍🍳', 'The cook from the pub'], ['🧕', 'A woman in a green headscarf'],
    ['👱', 'A lad from the farm'], ['👩‍🦳', 'A lady in a good hat'], ['🧑‍🔧', 'A van driver, engine running'],
    ['👨', 'A nervous young man'], ['👩‍🏫', 'The schoolteacher'], ['🧓', 'Somebody\'s grandad'],
  ];

  // What people say they want: the story is how they put it at the counter, and the
  // stall spells the meaning out under it once you have taken the order.
  const ASKS = {
    love:       ['It\'s our anniversary and I\'ve only just remembered.', 'I\'m going to ask her tonight. Something that says so before I do.', 'Twenty years married on Sunday. Twenty years!'],
    friendship: ['My best friend is moving to Leeds. Something she can take with her.', 'We fell out over nothing, years back. We\'re meeting for tea.', 'For the lads at the bowls club. Don\'t make it soppy.'],
    sorry:      ['I said something at dinner I shouldn\'t have.', 'I forgot her birthday. Completely. She was very nice about it, which is worse.', 'I backed into his wall. He hasn\'t noticed yet.'],
    thanks:     ['For my neighbour. She fed the cat all August.', 'For the nurse on ward six. She\'ll know why.', 'For the woman who found my wallet and posted it back.'],
    sympathy:   ['For a funeral on Thursday. Something proper.', 'My friend\'s dog died. It was a very good dog.', 'For the family at number nine. They lost their dad.'],
    celebrate:  ['My sister\'s had the baby! A girl!', 'I passed my driving test. Fourth go.', 'The bakery\'s ten years old today.'],
    getwell:    ['Dad\'s in hospital. Something hopeful for the window.', 'My little boy has the chickenpox and is furious about it.', 'For a friend coming home after an operation.'],
    remember:   ['It would have been Mum\'s birthday today.', 'For my brother\'s grave. I go every year.', 'Forty years since the lifeboat went down. For the memorial.'],
    cheer:      ['Something to brighten up a grey office.', 'It\'s been a long winter. Something that isn\'t.', 'For the kitchen table. That\'s all. No reason.'],
    calm:       ['My wife has exams all week. Something for her desk.', 'For my mother. She doesn\'t sleep well.', 'The new baby won\'t settle. Something for the nursery. Not loud.'],
  };

  const WEATHER = {
    sunny:  { icon: '☀️', name: 'Sunny' },
    cloudy: { icon: '☁️', name: 'Overcast' },
    rain:   { icon: '🌧️', name: 'Rain' },
    windy:  { icon: '🌬️', name: 'Windy' },
    heat:   { icon: '🔥', name: 'Heatwave' },
    frost:  { icon: '❄️', name: 'Frost' },
    fog:    { icon: '🌫️', name: 'Fog' },
    storm:  { icon: '⛈️', name: 'Storm' },
    sleet:  { icon: '🌨️', name: 'Sleet' },
  };
  const WEATHER_TABLE = {
    Spring: [['sunny', 38], ['cloudy', 12], ['rain', 30], ['windy', 10], ['fog', 10]],
    Summer: [['sunny', 45], ['heat', 25], ['rain', 12], ['windy', 8], ['storm', 10]],
    Autumn: [['sunny', 20], ['cloudy', 15], ['rain', 25], ['windy', 15], ['fog', 12], ['storm', 13]],
    Winter: [['sunny', 18], ['cloudy', 15], ['frost', 25], ['rain', 12], ['windy', 10], ['fog', 8], ['sleet', 12]],
  };
  // days nobody much wants to walk up the lane for flowers
  const ROUGH = ['rain', 'frost', 'storm', 'sleet'];

  // What you charge, on the board at the stall or per arrangement: a multiplier on the
  // price, what it does to how pleased people go away (`sat`), and how likely somebody
  // just browsing is to walk off at it (`balk`).
  const MARKUPS = [
    { id: 'cheap', name: 'Cheap',            mult: 0.8,  sat: 2,  balk: 0 },
    { id: 'fair',  name: 'Fair',             mult: 1,    sat: 0,  balk: 0.03 },
    { id: 'dear',  name: 'Dear',             mult: 1.25, sat: -2, balk: 0.12 },
    { id: 'steep', name: 'Steep',            mult: 1.6,  sat: -5, balk: 0.3 },
    { id: 'rob',   name: 'Daylight robbery', mult: 2,    sat: -9, balk: 0.6 },
  ];
  const markupOf = (id) => MARKUPS.find((m) => m.id === id) || MARKUPS[1];
  const REP_WORDS = [[85, 'known three villages over'], [60, 'the shop people ask for'], [35, 'well thought of'], [15, 'getting known'], [0, 'new on the lane']];

  // ---------- helpers ----------

  const rnd = (n) => Math.floor(Math.random() * n);
  const pick = (arr) => arr[rnd(arr.length)];
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (id) => document.getElementById(id);
  const uid = () => Date.now().toString(36) + rnd(1e6).toString(36);
  const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  const ink = (glyph) => `<i class="ink-plate">${glyph}</i>`;
  const NUMW = ['no', 'a', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
  // a walk-in is 'A man in a wet coat' at the start of a sentence and 'a man...' in the middle of one
  const mid = (who) => (/^(A|An|The|Somebody)\b/.test(who) ? who.charAt(0).toLowerCase() + who.slice(1) : who);
  const listText = (parts) => parts.join(', ').replace(/, ([^,]*)$/, ' and $1');

  // A variety is a flower in a colour: 'rose-red'. Flowers that only come in one colour
  // go by their own name.
  const vkey = (f, c) => `${f}-${c}`;
  const flowerOf = (k) => k.split('-')[0];
  const colourOf = (k) => k.split('-')[1];
  const single = (f) => FLOWERS[f].colours.length === 1;
  const varName = (k) => (single(flowerOf(k)) ? FLOWERS[flowerOf(k)].name : `${cap(colourOf(k))} ${FLOWERS[flowerOf(k)].name.toLowerCase()}`);
  const varPlural = (k) => (single(flowerOf(k)) ? FLOWERS[flowerOf(k)].pl : `${colourOf(k)} ${FLOWERS[flowerOf(k)].pl}`);
  function stemsText(k, n) {
    const f = FLOWERS[flowerOf(k)];
    const lower = varName(k).toLowerCase();
    if (f.sprig) return n === 1 ? `a sprig of ${lower}` : `${NUMW[n] || n} sprigs of ${lower}`;
    return n === 1 ? `${/^[aeiou]/.test(lower) ? 'an' : 'a'} ${lower}` : `${NUMW[n] || n} ${varPlural(k)}`;
  }
  function bunchText(stems) {
    const counts = {};
    for (const s of stems) counts[s] = (counts[s] || 0) + 1;
    return listText(Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, n]) => stemsText(k, n)));
  }
  // "Cheer, and yellow for cheer" — what a variety says, for titles and toasts
  function meaningOf(k) {
    const f = flowerOf(k);
    const t = TAGS[FLOWERS[f].tag];
    return single(f) ? t : `${t}, and ${colourOf(k)} for ${TAGS[COLOURS[colourOf(k)].tag].toLowerCase()}`;
  }

  // ---------- the flowers, drawn ----------
  // None of her sheets has a cut flower or a vase, so these are drawn here: flat colour
  // inside the same brown ink line as the painted props. A head is drawn about the origin,
  // a little under ten units across; a spike stands up from it.
  const INK = '#4a3320';
  const STEM = '#57843b';
  const petals = (n, shape, fill, sw = 0.8) => Array.from({ length: n }, (_, k) =>
    `<path d="${shape}" transform="rotate(${(k * 360) / n})" fill="${fill}" stroke="${INK}" stroke-width="${sw}" stroke-linejoin="round"/>`).join('');
  const HEADS = {
    tulip: (c) => `<path d="M-7,-6 C-8,4 -5,9 0,9 C5,9 8,4 7,-6 L3.5,-1.5 L0,-8 L-3.5,-1.5 Z" fill="${c.m}" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>
      <path d="M-3.5,-1.5 C-3,4 -1.5,7.5 0,8.5 M3.5,-1.5 C3,4 1.5,7.5 0,8.5" fill="none" stroke="${c.d}" stroke-width="0.9"/>`,
    rose: (c) => `<circle r="8.5" fill="${c.m}" stroke="${INK}" stroke-width="1.1"/>
      <path d="M-4,1 C-4,-4.5 4.5,-4.5 4.5,0 C4.5,4.5 -2,5 -2,1 C-2,-1.2 1,-2 1.6,0 M-8,2 C-5.5,7 5.5,7 8,2" fill="none" stroke="${c.d}" stroke-width="1.1" stroke-linecap="round"/>`,
    sunflower: () => petals(12, 'M0,-3 C-2.8,-5.5 -2.4,-10 0,-12 C2.4,-10 2.8,-5.5 0,-3 Z', '#f2b632')
      + `<circle r="4.8" fill="#6b3f1e" stroke="${INK}" stroke-width="1"/><circle cx="-1.4" cy="-1.3" r="0.8" fill="#a4683a"/><circle cx="1.5" cy="0.6" r="0.8" fill="#a4683a"/>`,
    sweetpea: (c) => `<path d="M-1,6 C-11,5 -11,-7 -3,-7 C-1,-9.5 2,-8 1,-5 C8,-9 12,0 4,5 Z" fill="${c.m}" stroke="${INK}" stroke-width="1" stroke-linejoin="round"/>
      <path d="M-4,-3 C-6,0 -4,3 -1,4 M3,-3 C6,-1 6,2 3,4" fill="none" stroke="${c.d}" stroke-width="0.9"/>
      <path d="M-3,5 C-2,10 3,10 4,5 Z" fill="${c.d}" stroke="${INK}" stroke-width="0.9"/>`,
    dahlia: (c) => petals(14, 'M0,0 L-2.4,-5.2 L0,-10.5 L2.4,-5.2 Z', c.m)
      + `<g transform="scale(0.6) rotate(13)">${petals(12, 'M0,0 L-2.4,-5.2 L0,-10.5 L2.4,-5.2 Z', c.l, 1.1)}</g><circle r="2" fill="${c.d}" stroke="${INK}" stroke-width="0.7"/>`,
    lavender: (c) => [0, 1, 2, 3, 4, 5].map((k) =>
      `<ellipse cx="${k % 2 ? 1.4 : -1.4}" cy="${-2 - k * 3.4}" rx="${2.5 - k * 0.2}" ry="2.9" fill="${k % 2 ? c.l : c.m}" stroke="${INK}" stroke-width="0.7"/>`).join(''),
    hyacinth: (c) => [0, 1, 2, 3, 4].map((k) => [-1, 1].map((sx) =>
      `<g transform="translate(${(sx * (3.4 - k * 0.35)).toFixed(2)},${(-2.5 - k * 3.6).toFixed(2)})">${petals(5, 'M0,0 C-1.4,-1 -1.2,-2.8 0,-3 C1.2,-2.8 1.4,-1 0,0 Z', (k + (sx > 0 ? 1 : 0)) % 2 ? c.l : c.m, 0.55)}</g>`).join('')).join('')
      + `<circle cy="-18.5" r="2" fill="${c.l}" stroke="${INK}" stroke-width="0.6"/>`,
    daisy: () => petals(14, 'M0,-2.5 C-1.8,-4.5 -1.6,-9.5 0,-10 C1.6,-9.5 1.8,-4.5 0,-2.5 Z', '#fbf8ef', 0.7)
      + `<circle r="3.4" fill="#f2c53a" stroke="${INK}" stroke-width="0.9"/>`,
    forgetmenot: (c) => [[-4, -2], [3.5, -4], [0, 3.5], [5, 3], [-5, 5]].map(([x, y]) =>
      `<g transform="translate(${x},${y})">${petals(5, 'M0,0 C-1.8,-1.2 -1.6,-3.6 0,-3.8 C1.6,-3.6 1.8,-1.2 0,0 Z', c.m, 0.55)}<circle r="0.9" fill="#f2d069"/></g>`).join(''),
    iris: (c) => `<path d="M0,-1 C-3,-5 -2,-11 0,-12 C2,-11 3,-5 0,-1 Z" fill="${c.l}" stroke="${INK}" stroke-width="0.9"/>
      <path d="M-1,0 C-6,-4 -10,-2 -9,3 C-8,7 -4,5 -1,1 Z M1,0 C6,-4 10,-2 9,3 C8,7 4,5 1,1 Z" fill="${c.m}" stroke="${INK}" stroke-width="0.9" stroke-linejoin="round"/>
      <path d="M-2.5,1.5 L-6.5,3 M2.5,1.5 L6.5,3" stroke="#f2c53a" stroke-width="1.4" stroke-linecap="round"/>`,
  };
  const head = (k) => HEADS[flowerOf(k)](COLOURS[colourOf(k)]);
  const svgUri = (body, box) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}">${body}</svg>`)}`;
  // One stem with a leaf, for the bucket, the packets, the pots and every sheet.
  const ART = {};
  for (const [f, fl] of Object.entries(FLOWERS)) {
    for (const c of fl.colours) {
      const tall = fl.spike;
      const stem = `M0,26 C1.5,17 -1.5,10 0,${tall ? 2 : 5}`;
      ART[vkey(f, c)] = svgUri(`<path d="${stem}" fill="none" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>
        <path d="${stem}" fill="none" stroke="${STEM}" stroke-width="1.8" stroke-linecap="round"/>
        <path d="M0.3,18 C4,13 8,13 10,10 C6,9 2,11 0.3,15 Z" fill="#6f9e49" stroke="${INK}" stroke-width="0.8" stroke-linejoin="round"/>
        <g transform="translate(0,${tall ? 4 : 0}) scale(1.15)">${head(vkey(f, c))}</g>`, tall ? '-13 -20 26 47' : '-13 -13 26 40');
    }
  }
  const pic = (k) => `<img class="spr" src="${ART[k]}" alt="">`;

  const VASE_BACK = {
    // glass: the stems show through it, so they are drawn under it right down to the water
    jar: `<path d="M44,112 L44,149 Q44,157 52,157 L68,157 Q76,157 76,149 L76,112 Z" fill="rgba(206,232,236,0.5)" stroke="${INK}" stroke-width="2"/>
      <path d="M45.5,128 L74.5,128 L74.5,149 Q74.5,155.5 68,155.5 L52,155.5 Q45.5,155.5 45.5,149 Z" fill="rgba(120,176,186,0.35)"/>
      <rect x="42" y="105" width="36" height="8" rx="2.5" fill="rgba(222,238,240,0.8)" stroke="${INK}" stroke-width="2"/>
      <path d="M50,118 L50,147" stroke="rgba(255,255,255,0.75)" stroke-width="3" stroke-linecap="round"/>`,
    jug: `<path d="M79,109 C97,105 99,135 82,141" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>
      <path d="M79,109 C97,105 99,135 82,141" fill="none" stroke="#f1e8d4" stroke-width="3.5" stroke-linecap="round"/>
      <path d="M46,100 C41,112 35,124 36,140 C37,154 46,158 60,158 C74,158 83,154 84,140 C85,124 79,112 74,100 Z" fill="#f1e8d4" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
      <path d="M46,100 L37,94 L49,97" fill="#f1e8d4" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
      <ellipse cx="60" cy="100" rx="14.5" ry="3.5" fill="#dccfb2" stroke="${INK}" stroke-width="2"/>
      <path d="M38,125 C50,130 70,130 82,125" fill="none" stroke="#3d5f9e" stroke-width="2.4"/>
      ${[[47, 141], [60, 145], [73, 141]].map(([x, y]) => `<g transform="translate(${x},${y})">${petals(5, 'M0,0 C-2.2,-1.5 -1.8,-4.4 0,-4.6 C1.8,-4.4 2.2,-1.5 0,0 Z', '#4a6fb0', 0.5)}<circle r="1" fill="#f2d069"/></g>`).join('')}
      <path d="M43,134 C42,142 44,148 48,152" fill="none" stroke="rgba(255,255,255,0.8)" stroke-width="2.5" stroke-linecap="round"/>`,
    bottle: `<path d="M55,90 L55,113 C45,118 42,130 42,142 C42,154 48,158 60,158 C72,158 78,154 78,142 C78,130 75,118 65,113 L65,90 Z" fill="#93a695" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
      <path d="M55.8,96 L55.8,113.5 C47,118 43.5,126 43,134 C50,131 52,138 57,133 C62,139 66,129 72,135 C75,133 77,134 77,134 C76,125 72,118 64.2,113.5 L64.2,96 Z" fill="#6f8773"/>
      <rect x="52.5" y="86" width="15" height="6" rx="2" fill="#7f9582" stroke="${INK}" stroke-width="2"/>
      <path d="M48,128 C46,136 47,146 50,151" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="2.5" stroke-linecap="round"/>`,
    urn: `<path d="M38,108 C27,121 28,146 43,154 L77,154 C92,146 93,121 82,108 Z" fill="#d27a45" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
      <rect x="46" y="152" width="28" height="6" rx="2" fill="#b9602f" stroke="${INK}" stroke-width="2"/>
      <rect x="33" y="100" width="54" height="9" rx="3.5" fill="#c86b3a" stroke="${INK}" stroke-width="2"/>
      <path d="M32,124 C48,129 72,129 88,124 M31.5,131 C48,136 72,136 88.5,131" fill="none" stroke="#a8522a" stroke-width="1.8"/>
      <path d="M38,116 C34,126 35,138 40,146" fill="none" stroke="rgba(255,226,190,0.55)" stroke-width="3" stroke-linecap="round"/>`,
  };
  // Where the stems of a vase go, in the order they are filled: the middle first, then
  // out to either side alternately, so one stem stands up straight and a full urn fans.
  function stemPlaces(vid) {
    const v = VASES[vid];
    const n = v.holds;
    const out = [];
    for (let k = 0; k < n; k++) {
      const t = n === 1 ? 0 : (k / (n - 1)) * 2 - 1;
      out.push({ t, ang: t * v.spread, len: v.reach * (1 - 0.16 * Math.abs(t)) - (k % 2 && n > 4 ? 9 : 0) });
    }
    return out.sort((a, b) => Math.abs(a.t) - Math.abs(b.t) || a.t - b.t);
  }
  // Where a ribbon is tied: round the neck, just under the mouth.
  const BOW_Y = { bottle: 104, jar: 119, jug: 111, urn: 116 };
  const bow = (vid, c) => {
    const col = COLOURS[c];
    return `<g class="bow" transform="translate(60,${BOW_Y[vid]})">
      <path d="M-1,1 L-8,17 L-4,15 L-2,19 Z M1,1 L8,17 L4,15 L2,19 Z" fill="${col.d}" stroke="${INK}" stroke-width="1" stroke-linejoin="round"/>
      <path d="M0,0 C-6,-9 -18,-8 -16,0 C-18,8 -6,9 0,0 Z M0,0 C6,-9 18,-8 16,0 C18,8 6,9 0,0 Z" fill="${col.m}" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>
      <circle r="2.8" fill="${col.d}" stroke="${INK}" stroke-width="1"/></g>`;
  };
  // A vase with whatever is in it, as one SVG. `big` makes each stem something you can
  // take hold of; `ribbon` ties a bow round the neck.
  function vaseSvg(vid, stems, big, ribbon) {
    const v = VASES[vid];
    const places = stemPlaces(vid);
    const glass = vid === 'jar';
    const drawn = stems.map((k, i) => ({ k, i, p: places[i] })).filter((s) => s.p)
      .sort((a, b) => b.p.len - a.p.len) // the tallest stand at the back
      .map(({ k, i, p }) => {
        const r = (p.ang * Math.PI) / 180;
        const ox = 60 + p.t * v.lip;
        const oy = v.mouth + (glass ? 40 : 6);
        const hx = ox + Math.sin(r) * p.len;
        const hy = v.mouth - Math.cos(r) * p.len;
        const path = `M${ox.toFixed(1)},${oy} Q${(ox + (hx - ox) * 0.2).toFixed(1)},${(oy - (oy - hy) * 0.55).toFixed(1)} ${hx.toFixed(1)},${hy.toFixed(1)}`;
        const leaf = i % 3 === 1
          ? `<path d="M0,0 C5,-5 10,-5 13,-9 C7,-10 2,-7 0,-3 Z" transform="translate(${(ox + (hx - ox) * 0.45).toFixed(1)},${(oy - (oy - hy) * 0.5).toFixed(1)}) scale(${p.t < 0 ? -1 : 1},1)" fill="#6f9e49" stroke="${INK}" stroke-width="0.9"/>`
          : '';
        const spike = FLOWERS[flowerOf(k)].spike;
        return `<g class="stem"${big ? ` data-stem="${i}" data-k="${k}"` : ''}>
          <path d="${path}" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>
          <path d="${path}" fill="none" stroke="${STEM}" stroke-width="2.2" stroke-linecap="round"/>${leaf}
          <g transform="translate(${hx.toFixed(1)},${hy.toFixed(1)}) rotate(${(spike ? p.ang : p.ang * 0.4).toFixed(1)}) scale(1.45)">${head(k)}</g></g>`;
      }).join('');
    // Stems first and the vase over them: an opaque one hides where they end. An empty
    // vase is cropped to itself, so it stands on the shelf at its own size.
    const box = stems.length || big ? '0 0 120 160' : '26 82 68 78';
    return `<svg class="vase-svg" viewBox="${box}" preserveAspectRatio="xMidYMax meet" aria-hidden="true">${drawn}${VASE_BACK[vid]}${ribbon ? bow(vid, ribbon) : ''}</svg>`;
  }

  // ---------- what a bouquet says ----------

  // Every tag the stems carry, weighted: a flower's own meaning counts double its
  // colour's. A ribbon says what its colour says, as quietly as a stem's colour does.
  function readBunch(stems, ribbon) {
    const w = {};
    for (const k of stems) {
      const ft = FLOWERS[flowerOf(k)].tag;
      const ct = COLOURS[colourOf(k)].tag;
      w[ft] = (w[ft] || 0) + FLOWER_W;
      w[ct] = (w[ct] || 0) + COLOUR_W;
    }
    if (ribbon && stems.length) {
      const rt = COLOURS[ribbon].tag;
      w[rt] = (w[rt] || 0) + COLOUR_W;
    }
    return w;
  }
  // How nearly a bunch says `tag`, 0..1: the share of everything it says that is that,
  // with neighbouring feelings at half and opposite ones taken off.
  function fitFor(tag, stems, ribbon) {
    const w = readBunch(stems, ribbon);
    const total = Object.values(w).reduce((a, b) => a + b, 0);
    if (!total) return 0;
    let got = w[tag] || 0;
    for (const r of RELATED[tag] || []) got += (w[r] || 0) * 0.5;
    for (const c of CLASH[tag] || []) got -= (w[c] || 0);
    return clamp(got / total, 0, 1);
  }

  // One thing an order asks, as a check against a bunch. `hard` checks — a thing they
  // said it had to have, or had to not — cap the stars at one when they fail. A ribbon
  // is part of the colour of the thing: a yellow bow is "something yellow".
  function extraCheck(x, stems, ribbon) {
    const has = (fn) => stems.some(fn);
    const colours = stems.map(colourOf).concat(ribbon ? [ribbon] : []);
    switch (x.t) {
      case 'hasFlower': return { label: `Has ${FLOWERS[x.v].pl} in it`, ok: has((k) => flowerOf(k) === x.v), hard: true };
      case 'hasColour': return { label: `Something ${x.v}`, ok: colours.includes(x.v), hard: true };
      case 'allColour': return { label: `All ${x.v}`, ok: stems.length > 0 && colours.every((c) => c === x.v), hard: true };
      case 'noFlower':  return { label: `No ${FLOWERS[x.v].pl}`, ok: !has((k) => flowerOf(k) === x.v), hard: true };
      case 'noColour':  return { label: `Nothing ${x.v}`, ok: !colours.includes(x.v), hard: true };
      case 'big':       return { label: 'Five stems or more', ok: stems.length >= 5, hard: false };
      default:          return { label: 'Three stems at most', ok: stems.length > 0 && stems.length <= 3, hard: false };
    }
  }
  function orderChecks(o, stems, ribbon) {
    const out = [];
    if (o.want) {
      const fit = fitFor(o.want, stems, ribbon);
      out.push({ id: 'want', label: `Says ${TAGS[o.want].toLowerCase()}`, ok: fit >= 0.4, great: fit >= 0.7, fit });
    }
    for (const x of o.extras) out.push({ id: x.t, ...extraCheck(x, stems, ribbon) });
    return out;
  }

  // Stars out of three, and what they pay. Meaning is up to two stars; a proper bunch
  // (a full vase, or more than one kind in it) is the third. Tired stems cost one.
  // A ribbon is a coin more.
  function judge(o, stems, vid, droopy, ribbon) {
    const checks = orderChecks(o, stems, ribbon);
    const want = checks.find((c) => c.id === 'want');
    let stars = want ? (want.great ? 2 : want.ok ? 1 : 0) : 2;
    const proper = stems.length >= VASES[vid].holds || new Set(stems).size >= 2;
    if (proper && stems.length >= 2) stars += 1;
    for (const c of checks) if (!c.ok && !c.hard && c.id !== 'want') stars -= 1;
    if (droopy) stars -= 1;
    if (checks.some((c) => c.hard && !c.ok)) stars = Math.min(stars, 1);
    stars = clamp(stars, 0, 3);
    const worth = (o.base || 3) + stems.reduce((a, k) => a + Math.max(1, Math.round(FLOWERS[flowerOf(k)].seed / 2)), 0) + VASES[vid].price + (ribbon ? 1 : 0);
    const pay = Math.round(worth * [0.3, 0.7, 1, 1.25][stars]);
    return { stars, checks, pay };
  }

  // ---------- state ----------

  let S = null;

  // Six pots, every one of them in flower on the day you arrive: whoever had the shed
  // before left it going.
  const STARTER_POTS = ['tulip-red', 'tulip-yellow', 'sweetpea-pink', 'daisy-white', 'forgetmenot-blue', 'rose-red'];
  const STARTER_PACKETS = ['sunflower-yellow', 'sweetpea-white'];

  const emptyPot = () => ({ crop: null, progress: 0, dry: 1, wilted: false, picks: 0 });

  function freshState() {
    const folk = {};
    for (const f of FOLK) folk[f.id] = { visits: 0, stars: 0 };
    return {
      day: 1, season: 0, year: 1, dayCount: 1,
      weather: 'sunny',
      coins: 15,
      rep: REP_START,
      pots: STARTER_POTS.map((k) => ({ ...emptyPot(), crop: k, progress: FLOWERS[flowerOf(k)].days, dry: 0 })),
      bucket: [],        // [{ k: 'rose-red', n, age }]
      packets: STARTER_PACKETS.map((k) => ({ k, n: 1 })),
      shop: { cust: null, last: null, today: 0, paused: true }, // closed until you open it
      slots: 0,          // customers, and would-be customers, since the last growing spell
      daySlots: 0,       // ...and since the day began
      markup: 'fair',    // the price on the board at the stall
      bench: null,       // the vase on the shed table: { vase, stems: [], ribbon }
      made: [],          // arrangements set aside: { id, vid, stems, ribbon, age }
      folk,
      diary: [],
      stats: { served: 0, stars: 0, earned: 0, cut: 0, turnedAway: 0 },
      flags: { goals: { cut: false, display: false, serve: false }, goalsDone: false, catalogue: Object.keys(FLOWERS).filter((f) => !FLOWERS[f].rep) },
    };
  }

  const seasonName = () => SEASONS[S.season];
  const dayLabel = () => `${seasonName()}, day ${S.day}`;

  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* private mode etc. */ }
  }
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (!s || !s.pots || !s.shop) return null;
      if (s.bench === undefined) s.bench = null;
      if (!Array.isArray(s.made)) s.made = [];
      const g = s.flags.goals;
      if (g.display === undefined) { g.display = false; delete g.open; }
      s.shop = { cust: s.shop.cust || null, last: s.shop.last || null, today: s.shop.today || 0, paused: !!s.shop.paused };
      if (!s.markup) s.markup = 'fair';
      if (s.slots == null) s.slots = 0;
      if (s.daySlots == null) s.daySlots = 0;
      if (s.shop.last === undefined) s.shop.last = null;
      return s;
    } catch (e) { return null; }
  }

  function markGoal(goal) {
    const g = S.flags.goals;
    if (g[goal] || S.flags.goalsDone) return;
    g[goal] = true;
    if (g.cut && g.display && g.serve) {
      S.flags.goalsDone = true;
      diary('Got the hang of it: grow it, cut it, and say it for somebody.', 'warm');
    }
  }

  // What happens is written down, not announced: S.diary is the book you can sit and
  // read. The corner of the screen is only for toasts, about what wants doing now.
  const DIARY_MAX = 500;
  function diary(text, cls) {
    S.diary.push({ t: text, c: cls || '' });
    if (S.diary.length > DIARY_MAX) S.diary.splice(0, S.diary.length - DIARY_MAX);
  }
  function diaryDay() {
    S.diary.push({ day: dayLabel(), w: S.weather });
  }
  function openDiary() {
    const days = [];
    for (const e of S.diary) {
      if (e.day) days.push({ label: e.day, w: e.w, lines: [] });
      else if (days.length) days[days.length - 1].lines.push(e.t);
    }
    let html = `<h2>The diary</h2>
      <p class="lead ink">At the shed. ${days.length ? `The last ${days.length === 1 ? 'day' : `${days.length} days`} of it.` : 'Nothing written down yet.'}</p>
      <div class="diary-book">`;
    for (let i = days.length - 1; i >= 0; i--) {
      const d = days[i];
      const w = WEATHER[d.w];
      html += `<section class="diary-day${i === days.length - 1 ? ' today' : ''}">
        <h3>${esc(d.label)}${w ? ` <span class="wx">${ink(w.icon)} ${esc(w.name.toLowerCase())}</span>` : ''}</h3>
        ${d.lines.length ? `<p>${d.lines.map(esc).join(' ')}</p>` : '<p class="quiet">A day where nothing much was written down.</p>'}
      </section>`;
    }
    html += '</div><div class="foot"><button class="primary" id="sheet-cancel">Close the book</button></div>';
    openSheet(html);
    $('sheet-cancel').addEventListener('click', closeSheet);
  }

  const LOG_MAX = 4;
  function logLine(text, cls) {
    const el = $('log');
    const line = document.createElement('div');
    line.className = `log-line ${cls || ''}`;
    line.textContent = text;
    el.appendChild(line);
    while (el.children.length > LOG_MAX) el.firstChild.remove();
    setTimeout(() => {
      line.classList.add('out');
      setTimeout(() => line.remove(), 500);
    }, cls === 'day' ? 9000 : 7000);
  }
  function toast(msg) { logLine(msg, 'toast'); }

  const repWord = () => REP_WORDS.find(([min]) => S.rep >= min)[1];
  function bumpRep(n) {
    const before = S.rep;
    S.rep = clamp(S.rep + n, 0, 100);
    // the seed merchant takes notice of a shop people talk about
    const fresh = Object.keys(FLOWERS).filter((f) => FLOWERS[f].rep > before && FLOWERS[f].rep <= S.rep && !S.flags.catalogue.includes(f));
    if (fresh.length) {
      S.flags.catalogue.push(...fresh);
      diary(`The seed merchant's new list came in the post, and it has ${listText(fresh.map((f) => FLOWERS[f].pl))} in it now. People must be talking.`, 'warm');
    }
  }

  // ---------- the bucket ----------
  // Cut stems stand in a bucket of water on the table until they go in a vase, or over.

  const inBucket = (k) => S.bucket.filter((b) => b.k === k).reduce((a, b) => a + b.n, 0);
  const bucketKeys = () => [...new Set(S.bucket.map((b) => b.k))].sort((a, b) => varName(a).localeCompare(varName(b)));
  const tiredIn = (k) => S.bucket.some((b) => b.k === k && b.age >= STEM_DROOP);
  function addStems(k, n) {
    const fresh = S.bucket.find((b) => b.k === k && b.age === 0 && !b.slots);
    if (fresh) fresh.n += n;
    else S.bucket.push({ k, n, age: 0, slots: 0 });
  }
  // Oldest first, since those are the ones to use up. Returns the oldest age taken;
  // `dry` only works it out.
  function takeStems(counts, dry) {
    let oldest = 0;
    for (const [k, n0] of Object.entries(counts)) {
      let n = n0;
      for (const lot of S.bucket.filter((b) => b.k === k).sort((a, b) => b.age - a.age)) {
        if (n <= 0) break;
        const t = Math.min(n, lot.n);
        if (!dry) lot.n -= t;
        n -= t;
        oldest = Math.max(oldest, lot.age);
      }
    }
    if (!dry) S.bucket = S.bucket.filter((b) => b.n > 0);
    return oldest;
  }

  // ---------- the pots ----------
  // Out in the garden, on the slatted staging by the shed. Anything grows in them in any
  // season. Watering is by hand with the can; cutting is free and it grows back from half-way.

  let held = null; // 'can' while the watering can is in hand

  const potRipe = (p) => !!p.crop && !p.wilted && p.progress >= FLOWERS[flowerOf(p.crop)].days;
  const regrowDays = (k) => Math.ceil(FLOWERS[flowerOf(k)].days / 2);
  const yieldOf = (k) => { const [lo, hi] = FLOWERS[flowerOf(k)].yield; return lo + rnd(hi - lo + 1); };

  function takeCan() {
    held = held === 'can' ? null : 'can';
    render();
    if (held) toast('Got the can. Click a pot.');
  }

  function waterPot(i) {
    const p = S.pots[i];
    if (!p.crop) { toast('An empty pot. Nothing in it to water.'); return; }
    if (p.dry === 0) { toast(`The ${varPlural(p.crop)} have had their drink already.`); return; }
    p.dry = 0;
    if (p.wilted) {
      p.wilted = false;
      p.progress = Math.max(0, p.progress - 1);
      diary(`Watered the wilted ${varPlural(p.crop)}. They perked up by teatime, mostly.`);
    }
    toast(pick(['Glug.', 'Glug glug.', 'A good drink.']));
    save();
    render();
  }

  function cutPot(i) {
    const p = S.pots[i];
    if (!potRipe(p)) return;
    const n = yieldOf(p.crop);
    addStems(p.crop, n);
    p.progress = FLOWERS[flowerOf(p.crop)].days - regrowDays(p.crop);
    p.picks += 1;
    S.stats.cut += n;
    let extra = '';
    // a plant keeps you in its own seed, while you have none of it put by
    if (Math.random() < (packetFor(p.crop) ? 0.06 : 0.5)) {
      addPacket(p.crop);
      extra = ' Saved some seed in a twist of paper, too.';
    }
    diary(`Cut ${stemsText(p.crop, n)} and stood them in the bucket.${extra}`, 'good');
    markGoal('cut');
    save();
    render();
  }

  function potClick(i) {
    if (held === 'can') { waterPot(i); return; }
    const p = S.pots[i];
    if (!p.crop) { openSowSheet(i); return; }
    if (potRipe(p)) { cutPot(i); return; }
    openPotSheet(i);
  }

  // ---------- seed ----------

  const packetFor = (k) => S.packets.find((p) => p.k === k);
  function addPacket(k) {
    const have = packetFor(k);
    if (have) have.n += 1;
    else S.packets.push({ k, n: 1 });
  }

  function sowPot(i, k) {
    const pk = packetFor(k);
    if (!pk || S.pots[i].crop) return;
    pk.n -= 1;
    if (pk.n <= 0) S.packets.splice(S.packets.indexOf(pk), 1);
    S.pots[i] = { ...emptyPot(), crop: k, dry: 0 };
    diary(`Sowed ${varPlural(k)}. ${FLOWERS[flowerOf(k)].days} spells of growing, if I remember the can.`);
    closeSheet();
    save();
    render();
  }

  function openSowSheet(i) {
    let html = '<h2>An empty pot</h2><p>Anything grows in these, in any season, but only from seed you have. Seed comes from the catalogue, and now and then off your own plants when you cut them.</p>';
    if (!S.packets.length) html += '<p class="ink">No packets on the table. The seed catalogue is up in the corner.</p>';
    html += '<div class="options">';
    for (const p of S.packets) {
      const f = FLOWERS[flowerOf(p.k)];
      html += `<button class="opt seed" data-sow="${p.k}">
        <span class="icon">${pic(p.k)}</span>
        <span><span class="t">${esc(varName(p.k))}${p.n > 1 ? ` <span class="tiny-tag">×${p.n}</span>` : ''}</span><br><span class="d">${esc(meaningOf(p.k))} · ${f.days} spells to the first cut, then every ${regrowDays(p.k)} · ${f.yield[0]}–${f.yield[1]} stems</span></span>
        <span class="r good">sow</span></button>`;
    }
    html += '</div><div class="foot"><button id="sheet-shop">Seed catalogue</button><button class="primary" id="sheet-cancel">Never mind</button></div>';
    openSheet(html);
    $('sheet').querySelectorAll('[data-sow]').forEach((b) => b.addEventListener('click', () => sowPot(i, b.dataset.sow)));
    $('sheet-cancel').addEventListener('click', closeSheet);
    $('sheet-shop').addEventListener('click', openCatalogue);
  }

  function openPotSheet(i) {
    const p = S.pots[i];
    const f = FLOWERS[flowerOf(p.crop)];
    const left = f.days - p.progress;
    const growth = p.wilted
      ? 'Wilted and sulking. Water it and it will come back, a day behind.'
      : `Growing. ${left} more spell${left === 1 ? '' : 's'} until ${p.picks ? 'the next cut' : 'the first cut'}. A spell passes every ${NUMW[GROW_EVERY]} customers, or the same time with the stall closed.`;
    const water = p.dry === 0 ? 'Watered today.' : p.dry === 1 ? 'Fine for now. Water it tomorrow.' : 'Thirsty. It will wilt soon without a drink.';
    openSheet(`<h2>${pic(p.crop)} ${esc(varName(p.crop))}</h2>
      <p class="ink">${growth}</p><p>${water} Pick up the watering can and click the pot to water it.</p>
      <div class="foot"><button id="pot-pull">Pull it out</button><button class="primary" id="sheet-cancel">Leave it</button></div>`);
    $('sheet-cancel').addEventListener('click', closeSheet);
    $('pot-pull').addEventListener('click', () => {
      diary(`Pulled the ${varPlural(p.crop)} out of their pot. Fresh start.`);
      S.pots[i] = emptyPot();
      closeSheet();
      save();
      render();
    });
  }

  // A pot is drawn whole: a bare pot, a sprout set in one, then one of Amber's potted
  // plants, and the flower itself tucked in on top once it is out.
  const GROW = [['grow-1a', 'grow-1b'], ['grow-2a', 'grow-2b', 'grow-2c', 'grow-2d']];
  function potArt(p, i, stage) {
    const img = (f, cls) => `<img class="${cls}" src="assets/art/${f}.png" alt="">`;
    if (!p.crop) return `<span class="gs-pot">${img('pot', 'gs-p')}</span>`;
    const set = GROW[stage === 1 ? 0 : 1];
    let html = stage === 0 ? img('pot', 'gs-p') + img('sprout', 'gs-sprout') : img(set[i % set.length], 'gs-p');
    if (stage === 3) html += `<img class="gs-crop" src="${ART[p.crop]}" alt="">`;
    return `<span class="gs-pot">${html}</span>`;
  }

  function renderPots() {
    const carrying = held === 'can';
    document.body.classList.toggle('carrying', carrying);
    $('pots').innerHTML = S.pots.map((p, i) => {
      if (!p.crop) return `<button class="pot empty" data-pot="${i}" title="An empty pot. Click to sow something.">${potArt(p, i, 0)}<span class="plant">＋</span><span class="pot-body"><i class="soil"></i></span><span class="pot-name">empty</span><span class="pot-state">sow</span></button>`;
      const f = FLOWERS[flowerOf(p.crop)];
      const ripe = potRipe(p);
      const frac = p.progress / f.days;
      const stage = ripe ? 3 : frac >= 0.66 ? 2 : frac >= 0.33 ? 1 : 0;
      const plant = stage === 0 ? '🌱' : stage === 1 ? '🌿' : pic(p.crop);
      const wet = p.dry === 0 ? 'wet' : p.dry === 1 ? 'fine' : p.dry === 2 ? 'thirsty' : 'parched';
      const left = f.days - p.progress;
      const state = p.wilted ? 'wilted' : ripe ? 'cut me' : p.dry >= 2 ? 'thirsty' : '●'.repeat(p.progress) + '○'.repeat(left);
      const name = varName(p.crop);
      const title = p.wilted ? `${name}, wilted. Water it.` : ripe ? `${name}, in flower. Click to cut.` : `${name}, ${left} more spell${left === 1 ? '' : 's'} of growing. Soil ${wet === 'wet' ? 'watered' : wet}.`;
      return `<button class="pot stage-${stage} ${wet}${p.wilted ? ' wilted' : ''}${ripe ? ' ripe' : ''}" data-pot="${i}" title="${esc(title)}">
        ${potArt(p, i, stage)}<span class="plant">${plant}</span><span class="pot-body"><i class="soil"></i></span>
        <span class="pot-name">${esc(name)}</span><span class="pot-state">${state}</span></button>`;
    }).join('');
    $('pots').querySelectorAll('[data-pot]').forEach((el) => el.addEventListener('click', (e) => { e.stopPropagation(); potClick(Number(el.dataset.pot)); }));
    const can = $('can');
    can.classList.toggle('lifted', carrying);
    can.title = carrying ? 'Put the can down' : 'Watering can. Click to pick it up.';
  }

  // ---------- the three places ----------
  // The garden, the shed and the stall, left to right, with an arrow at either edge of
  // the screen. You start in the shed, between the two.

  const PLACES = [['view-garden', 'The garden'], ['view-sill', 'The shed'], ['view-stall', 'The stall']];
  let place = 1;

  function goTo(i) {
    i = clamp(i, 0, PLACES.length - 1);
    if (i === place) return;
    const dir = i > place ? 'in-r' : 'in-l';
    place = i;
    if (held === 'can' && PLACES[i][0] !== 'view-garden') held = null; // the can stays outside
    document.querySelectorAll('.stage .view').forEach((v) => {
      const on = v.id === PLACES[i][0];
      v.classList.toggle('on', on);
      v.classList.remove('in-l', 'in-r');
      if (on) { void v.offsetWidth; v.classList.add(dir); }
    });
    render();
  }
  const goId = (id) => goTo(PLACES.findIndex(([v]) => v === id));
  const at = (id) => PLACES[place][0] === id;

  // An arrow says where it goes, and carries a badge when something there wants you:
  // somebody waiting at the stall, or pots to cut or water in the garden.
  function renderNav() {
    const waiting = !!(S.shop.cust && !S.shop.cust.accepted);
    const garden = S.pots.some((p) => potRipe(p) || (p.crop && (p.wilted || p.dry >= 2)));
    for (const [side, to] of [['left', place - 1], ['right', place + 1]]) {
      const b = $(`nav-${side}`);
      const there = PLACES[to];
      b.classList.toggle('hidden', !there);
      if (!there) continue;
      $(`nav-${side}-lb`).textContent = there[1];
      b.title = `${there[1]} (${side === 'left' ? '←' : '→'})`;
      // the stall is always rightwards and the garden always leftwards of anywhere else
      b.classList.toggle('badged', side === 'right' ? waiting : garden);
    }
    // and whoever has just come up to the stall pops up by the arrow that goes there
    const who = $('nav-right-who');
    const face = waiting && place < 2 ? S.shop.cust.face : '';
    if (who.dataset.face !== face) {
      who.dataset.face = face;
      who.innerHTML = face ? `<span class="nw-face">${face}</span><span class="nw-t">at the stall</span>` : '';
      who.classList.toggle('on', !!face);
    }
  }

  // ---------- the shop ----------
  // The stall is always open. People come up the lane on their own time, one at a time,
  // and a customer stands at the counter until you have seen to them. The gaps between
  // them are long when there is nothing out on the stall to catch the eye, shorter when
  // there is, longer in rough weather and shorter for a shop people talk about.

  const OUT_MAX = MADE_MAX;
  let nextAt = 0; // when the next one comes up the lane (performance.now() time; not saved)
  function gapMs() {
    const base = S.made.length ? 12000 + rnd(10000) : 26000 + rnd(18000);
    const weather = ROUGH.includes(S.weather) ? 1.5 : 1;
    return base * weather * (1 - S.rep / 250);
  }
  function soon(ms) {
    const at = performance.now() + (ms == null ? gapMs() : ms);
    nextAt = nextAt && nextAt > performance.now() ? Math.min(nextAt, at) : at;
  }
  // checked once a second: nobody new while somebody is at the counter, while the last one
  // is still saying thank you, or while a sheet is open over the game
  setInterval(() => {
    if (!S || S.shop.cust || S.shop.last || document.hidden) return;
    if (!$('overlay').classList.contains('hidden')) return;
    if (!nextAt) { soon(); return; }
    if (performance.now() < nextAt) return;
    if (S.shop.paused) {
      // somebody would have come, and didn't: the garden gets the time instead
      nextAt = 0;
      slotPassed();
      save();
      render();
      return;
    }
    nextCustomer();
  }, 1000);

  // Closing is a pause, for when you just want to make things up for a while: nobody new
  // comes up the lane, and whoever is already at the counter stays.
  function togglePause() {
    S.shop.paused = !S.shop.paused;
    if (!S.shop.paused) soon();
    toast(S.shop.paused ? 'Sign turned to Closed. Nobody new will come up the lane.' : 'Open again.');
    save();
    render();
  }

  // Somebody at the counter. If there is something out on the stall they may well just
  // want that; otherwise they have something to ask.
  function nextCustomer(browse) {
    if (!S || S.shop.cust) return;
    nextAt = 0;
    slotPassed();
    S.shop.cust = (browse ?? (S.made.length && Math.random() < 0.45)) && S.made.length ? browser() : newOrder();
    toast(`${S.shop.cust.face} ${at('view-stall') ? 'Somebody at the counter.' : 'Somebody at the stall.'}`);
    save();
    render();
  }

  // Someone who has seen a thing on the stall and wants it. They like it for what it says,
  // so the judging is against that, and it usually goes well.
  const BROWSE_SAY = [
    'Oh, that one. The {b}. Is it for sale?',
    'I was only walking past, but that {v} with the {b} in it. Can I have it?',
    'How much is the {v}? The one with the {b}. It caught my eye from the lane.',
    'That\'s exactly what I needed and I didn\'t know it. The {b}, please.',
  ];
  function browser() {
    const m = pick(S.made);
    const regular = Math.random() < 0.4 ? pick(FOLK) : null;
    const [face, who] = regular ? [regular.face, regular.name] : pick(WALKINS);
    const top = Object.entries(readBunch(m.stems, m.ribbon)).sort((a, b) => b[1] - a[1])[0][0];
    const flowers = listText([...new Set(m.stems.map((k) => FLOWERS[flowerOf(k)].pl))]);
    const story = pick(BROWSE_SAY).replace('{b}', flowers).replace('{v}', VASES[m.vid].name.toLowerCase());
    return { id: uid(), who, face, regular: regular ? regular.id : null, want: top, extras: [], qs: [], story, browse: m.id, accepted: false };
  }

  // What is to hand for an order to be made from: in the bucket, or growing.
  function reachable() {
    const keys = new Set(bucketKeys());
    for (const p of S.pots) if (p.crop) keys.add(p.crop);
    return [...keys];
  }

  // A customer: who, what they want it to say, and anything else they have to have.
  // Early on they only ask for a feeling you could make out of what is on the shelf;
  // later they get particular, and now and then they want something you'd have to grow.
  function drawOrder() {
    const regular = Math.random() < 0.4 ? pick(FOLK) : null;
    const [face, who] = regular ? [regular.face, regular.name] : pick(WALKINS);
    const have = reachable();
    const tagsHere = [...new Set(have.map((k) => FLOWERS[flowerOf(k)].tag))];
    const tagsAll = Object.keys(TAGS).filter((t) => S.flags.catalogue.some((f) => FLOWERS[f].tag === t));
    const stretch = S.dayCount > 3 && Math.random() < 0.25;
    const want = S.dayCount <= 2 || Math.random() < 0.85 ? pick(stretch || !tagsHere.length ? tagsAll : tagsHere) : null;
    const extras = [];
    // the happier the lane, the more particular it gets, and the more it will pay
    const nExtra = S.rep < 20 ? 0 : S.rep < 40 ? rnd(2) : S.rep < 65 ? 1 + rnd(2) : Math.min(3, 2 + rnd(2));
    const flowersHere = [...new Set(have.map(flowerOf))];
    const coloursHere = [...new Set(have.map(colourOf))];
    const kinds = ['hasFlower', 'hasColour', 'allColour', 'noFlower', 'noColour', 'big', 'small'];
    for (let n = 0; n < 12 && extras.length < nExtra; n++) {
      const t = pick(kinds);
      if (extras.some((x) => x.t === t || (x.t === 'big' && t === 'small') || (x.t === 'small' && t === 'big'))) continue;
      let v = null;
      if (t === 'hasFlower') v = regular && flowersHere.includes(regular.fav) ? regular.fav : pick(flowersHere);
      else if (t === 'hasColour' || t === 'allColour') v = pick(coloursHere);
      else if (t === 'noFlower') v = pick(flowersHere);
      else if (t === 'noColour') v = pick(coloursHere.filter((c) => c !== 'white'));
      if (t !== 'big' && t !== 'small' && !v) continue;
      // don't ask for a thing and forbid it in the same breath, nor all-white and a rose that isn't
      if (v && extras.some((x) => x.v === v)) continue;
      if (t === 'allColour' && extras.some((x) => x.t === 'hasFlower' && !FLOWERS[x.v].colours.includes(v))) continue;
      if (t === 'hasFlower' && extras.some((x) => x.t === 'allColour' && !FLOWERS[v].colours.includes(x.v))) continue;
      extras.push({ t, v });
    }
    const roll = Math.random();
    const qs = roll < 0.4 ? [] : ['who', 'say', 'like'].sort(() => Math.random() - 0.5).slice(0, roll < 0.75 ? 1 : 2);
    const base = 3 + Math.floor(S.rep / 12) + 2 * extras.length;
    return { id: uid(), who, face, regular: regular ? regular.id : null, want, extras, qs, base, story: want ? pick(ASKS[want]) : 'Just something nice. You choose. I trust you.', accepted: false };
  }

  // Could this order be made to two stars out of what is to hand? The extras are drawn
  // at random, and "remembrance, but no forget-me-nots" or "friendship, all blue" can
  // be impossible. Built, not searched: the stems it insists on, then the best of what
  // is allowed until it says the thing, then the best vase for that many.
  function makeable(o, have) {
    const allowed = have.filter((k) => o.extras.every((x) => (x.t === 'noFlower' ? flowerOf(k) !== x.v
      : x.t === 'noColour' ? colourOf(k) !== x.v : x.t === 'allColour' ? colourOf(k) === x.v : true)));
    if (!allowed.length) return false;
    // a want nothing on the shelf says is a reason to buy seed; judge the rest of it
    const want = o.want && have.some((k) => FLOWERS[flowerOf(k)].tag === o.want) ? o.want : null;
    const bestOf = (ks) => ks.slice().sort((a, b) => (want ? fitFor(want, [b]) - fitFor(want, [a]) : 0))[0];
    const needs = o.extras.filter((x) => x.t === 'hasFlower' || x.t === 'hasColour');
    const bunch = needs.map((x) => bestOf(allowed.filter((k) => (x.t === 'hasFlower' ? flowerOf(k) : colourOf(k)) === x.v)));
    if (bunch.some((k) => !k)) return false;
    const cap = o.extras.some((x) => x.t === 'small') ? 3 : 7;
    const least = o.extras.some((x) => x.t === 'big') ? 5 : 2;
    const fill = bestOf(allowed);
    while (bunch.length < cap && (bunch.length < least || (want && fitFor(want, bunch) < 0.7))) bunch.push(fill);
    if (bunch.length > cap) return false;
    const w = { ...o, want };
    return Math.max(...VASE_ORDER.filter((v) => VASES[v].holds >= bunch.length).map((v) => judge(w, bunch, v, false).stars)) >= 2;
  }
  function newOrder() {
    const have = reachable();
    for (let n = 0; n < 25; n++) {
      const o = drawOrder();
      if (makeable(o, have)) return o;
    }
    const o = drawOrder();
    o.extras = [];
    return o;
  }

  const EXTRA_SAY = {
    hasFlower: (v) => pick([`There have to be ${FLOWERS[v].pl} in it. It's a family thing.`, `It must have ${FLOWERS[v].pl}. They're her favourite.`]),
    hasColour: (v) => `Something ${v} in it, if you can.`,
    allColour: (v) => `All ${v}, please. Nothing else.`,
    noFlower: (v) => pick([`No ${FLOWERS[v].pl}. Long story.`, `Not ${FLOWERS[v].pl}, whatever you do. They make me sneeze.`]),
    noColour: (v) => pick([`Nothing ${v}. ${v === 'red' ? 'He\'ll think it means something.' : 'She can\'t abide it.'}`, `Keep the ${v} out of it, would you.`]),
    big: () => 'A big one. I want it seen from the road.',
    small: () => 'Just a little something. Three stems, no more.',
  };

  // ---------- at the counter ----------
  // Somebody comes up to the stall and says what they want, in a speech bubble, a few
  // letters at a time. Some of them will stand for a question or two, and each answer
  // is another page of the conversation; the arrows go back through it to what they
  // first asked. When they have their flowers, what they say back is about what they
  // asked for.

  // All they said at the counter: the story, and anything else they had to have.
  function saidOf(o) {
    if (!o.said) o.said = `${o.story}${o.extras.length ? ` ${o.extras.map((x) => EXTRA_SAY[x.t](x.v)).join(' ')}` : ''}`;
    return o.said;
  }

  // The questions you can put to them, and how each kind of customer answers.
  const QUESTIONS = { who: 'Who\'s it for?', say: 'What should it say?', like: 'Anything they\'re fond of?' };
  const WHO_FOR = {
    love:       ['My wife. Twenty years and I still get it wrong.', 'Her name\'s Margaret. She doesn\'t know yet.'],
    friendship: ['My oldest friend. We were at school together.', 'The lads. Well, the lads and Brenda.'],
    sorry:      ['My sister. I said something about her husband.', 'My neighbour. It was a very good wall.'],
    thanks:     ['The nurse on ward six. Carol.', 'The lady at number four. She never asks for anything.'],
    sympathy:   ['The Hendersons. They lost their dad on Sunday.', 'For the service. He was my uncle.'],
    celebrate:  ['My sister! And the baby! Both of them!', 'Me, honestly. I earned it.'],
    getwell:    ['My dad. He\'s being very brave about it.', 'My boy. He\'s seven and furious.'],
    remember:   ['Mum. It would have been her birthday.', 'My brother. Twenty years this spring.'],
    cheer:      ['Everyone in the office. Mostly Gerald.', 'Me. It\'s been that sort of month.'],
    calm:       ['My wife. Exams all week.', 'The baby. And me, if I\'m honest.'],
    none:       ['Oh, it\'s for the house. Nobody in particular.'],
  };
  const SAY_IT = {
    love: 'That I love her. Still. More, if anything.',
    friendship: 'That we\'re friends, whatever happens. Always have been.',
    sorry: 'That I\'m sorry. Properly sorry.',
    thanks: 'Thank you. Just a really big thank you.',
    sympathy: 'That we\'re thinking of them. Quietly.',
    celebrate: 'Hooray! That\'s all. Just, hooray.',
    getwell: 'Get well soon. Something hopeful.',
    remember: 'That she\'s remembered. That nobody\'s forgotten.',
    cheer: 'Cheer up. That\'s the whole message.',
    calm: 'Rest. Breathe. Something quiet.',
    none: 'Whatever you think. You know flowers; I don\'t.',
  };
  // what they're fond of is a real hint: a flower that says the thing, or failing that a colour
  function fondOf(o) {
    const flowers = S.flags.catalogue.filter((f) => !o.want || FLOWERS[f].tag === o.want);
    if (flowers.length) {
      const f = FLOWERS[pick(flowers)];
      return pick([`She's always loved ${f.pl}.`, `There were always ${f.pl} in the garden, growing up.`, `Something with ${f.pl} in, maybe?`]);
    }
    const c = Object.keys(COLOURS).find((k) => COLOURS[k].tag === o.want);
    return c ? `Anything ${c}, really. It's their colour.` : 'Oh, I couldn\'t tell you. Surprise me.';
  }
  function answerTo(o, q) {
    const t = o.want || 'none';
    if (q === 'who') return pick(WHO_FOR[t]);
    if (q === 'say') return SAY_IT[t];
    return fondOf(o);
  }

  // what they say when they have it: about what they asked for, and whether it said it
  const RESPONSES = {
    love:       { good: ['She\'ll know. She\'ll know straight away.', 'Right. Deep breath. Wish me luck.'], poor: ['It\'s... fine. Maybe I\'ll say it with words instead.'] },
    friendship: { good: ['She\'ll put that on the kitchen table in Leeds. Thank you.', 'Not soppy at all. Perfect.'], poor: ['Hm. Doesn\'t quite say "friends", does it.'] },
    sorry:      { good: ['If this doesn\'t do it, nothing will.', 'She\'ll forgive me for this. Probably.'], poor: ['I think this might make it worse, to be honest.'] },
    thanks:     { good: ['That\'s exactly the thank-you I meant.', 'She\'ll cry. The good kind.'], poor: ['I suppose it says thanks. Sort of.'] },
    sympathy:   { good: ['Quiet and proper. They\'d have liked it.', 'That\'s right. That\'s just right. Thank you.'], poor: ['It\'s a bit... cheerful. For a funeral.'] },
    celebrate:  { good: ['It\'s a party in a jug!', 'That\'s the loudest vase I\'ve ever seen. Perfect.'], poor: ['Bit subdued, for a baby.'] },
    getwell:    { good: ['He\'ll perk up just looking at it.', 'Something hopeful. That\'s it exactly.'], poor: ['Not sure this is what you want to wake up to in hospital.'] },
    remember:   { good: ['She\'d have liked that. She would.', 'I\'ll take it up there this afternoon.'], poor: ['It doesn\'t feel much like remembering.'] },
    cheer:      { good: ['The whole office will cheer up. Even Gerald.', 'Instant sunshine, that.'], poor: ['Still a bit grey, isn\'t it.'] },
    calm:       { good: ['I feel calmer just holding it.', 'That\'s the quietest vase I\'ve ever seen. In a good way.'], poor: ['It\'s a bit loud, for a nursery.'] },
    none:       { good: ['Lovely. I knew you\'d choose well.', 'Oh, that\'s nice. That\'s really nice.'], poor: ['Well. It\'s certainly... a choice.'] },
  };
  const responseTo = (o, stars) => pick(RESPONSES[o.want || 'none'][stars >= 2 ? 'good' : 'poor']);

  // The conversation so far, a page at a time: what they asked, then each question you
  // put and what they answered.
  function pagesOf(o) {
    if (!o.pages) { o.pages = [{ text: saidOf(o) }]; o.page = 0; o.seen = []; o.asked = []; }
    if (!o.qs) o.qs = [];
    return o.pages;
  }
  function askQ(q) {
    const o = S.shop.cust;
    if (!o || !o.qs.includes(q) || o.asked.includes(q)) return;
    pagesOf(o).push({ q: QUESTIONS[q], text: answerTo(o, q) });
    o.asked.push(q);
    o.page = o.pages.length - 1;
    save();
    render();
  }
  function turnPage(d) {
    const conv = S.shop.last || S.shop.cust;
    if (!conv) return;
    const pages = conv.pages || pagesOf(conv);
    conv.page = clamp((conv.page || 0) + d, 0, pages.length - 1);
    render();
  }

  function acceptOrder() {
    const o = S.shop.cust;
    if (!o || o.accepted) return;
    o.accepted = true;
    o.page = 0; // come back to the stall and they tell you again what they asked
    save();
    goId('view-sill');
    toast(S.bench ? 'Fill the vase on the table. What they asked for is back at the stall.' : 'Drag a vase off the shelf onto the table. What they asked for is back at the stall.');
  }
  function declineOrder() {
    const o = S.shop.cust;
    if (!o) return;
    if (o.browse) diary(`${o.who} wanted the ${bunchText((S.made.find((m) => m.id === o.browse) || { stems: [] }).stems)} off the stall. I said it was spoken for.`);
    else {
      diary(`${o.who} wanted ${o.want ? `something that said ${TAGS[o.want].toLowerCase()}` : 'something nice'}, and I had to say I couldn't. They were decent about it.`, 'bad');
      S.stats.turnedAway += 1;
      bumpRep(-1);
    }
    S.shop.cust = null;
    soon();
    save();
    render();
  }
  function nextPlease() {
    if (!S.shop.last) return;
    S.shop.last = null;
    soon();
    save();
    render();
  }

  // The bubble. Only rebuilt when the page, or what can be said next, changes, so a render
  // in the middle of a sentence doesn't start it again. A page types out the first time it
  // is shown, and is simply there when you come back to it.
  let dlgKey = null;
  let typing = null;
  function renderDialog() {
    const el = $('dialog');
    const last = S.shop.last;
    const c = S.shop.cust;
    const conv = last || c;
    el.classList.toggle('hidden', !conv);
    if (!conv) { dlgKey = null; clearInterval(typing); return; }
    const pages = last ? last.pages : pagesOf(c);
    const i = clamp(conv.page || 0, 0, pages.length - 1);
    const pg = pages[i];
    const atEnd = i === pages.length - 1;
    const state = last ? 'r' : c.accepted ? 'w' : 'a';
    const key = `${state}-${conv.id}-${i}-${pages.length}-${last ? "" : (c.qs || []).join(",")}`;
    if (key === dlgKey) return;
    dlgKey = key;

    const reg = !last && c.regular ? FOLK.find((f) => f.id === c.regular) : null;
    let extra = '';
    let choices = [];
    if (last && pg.result) {
      extra = `<div class="dlg-result"><span class="dlg-vase">${vaseSvg(last.vid, last.stems, false, last.ribbon)}</span>
        <span><span class="stars" aria-label="${last.stars} of 3 stars">${'★'.repeat(last.stars)}<span class="off">${'★'.repeat(3 - last.stars)}</span></span>
        <span class="paid">🪙 ${last.pay}${last.tip ? ` and ${last.tip} in the tip jar` : ''}</span>
        ${last.hint ? `<span class="dlg-hint">${esc(last.hint)}</span>` : ''}</span></div>`;
    }
    if (last) {
      choices = [['dlg-done', 'Thank you', 'primary']];
    } else {
      const open = c.qs.filter((q) => !c.asked.includes(q));
      choices = open.map((q) => [`dlg-q-${q}`, QUESTIONS[q], 'ask']);
      choices.push(...(c.browse
        ? [['dlg-no', 'Sorry, not that one', ''], ['dlg-sell', 'Yes, it\'s yours', 'primary']]
        : c.accepted
          ? [['dlg-no', 'Say you can\'t', ''], ['dlg-go', 'To the shed →', 'primary']]
          : [['dlg-no', 'Sorry, not today', ''], ['dlg-yes', 'I\'ll make that', 'primary']]));
    }
    const nav = pages.length > 1
      ? `<div class="dlg-nav"><button class="dlg-arrow" id="dlg-prev" ${i ? '' : 'disabled'} title="Back">‹</button><span class="dlg-page">${i + 1} / ${pages.length}</span><button class="dlg-arrow" id="dlg-fwd" ${atEnd ? 'disabled' : ''} title="On">›</button></div>`
      : '';
    el.innerHTML = `<div class="dlg-name">${esc(conv.who)}</div>${nav}
      ${reg && i === 0 && !last ? `<p class="dlg-lead">${esc(reg.hi)}${S.folk[reg.id].visits ? '' : ' First time in the shop.'}</p>` : ''}
      ${pg.q ? `<p class="dlg-you">You: ${esc(pg.q)}</p>` : ''}
      <p class="dlg-text"><span class="dlg-typed"></span></p>
      <div class="dlg-after">${extra}<div class="dlg-choices">${choices.map(([id, t, cls]) => `<button id="${id}"${cls ? ` class="${cls}"` : ''}>${esc(t)}</button>`).join('')}</div></div>`;

    const text = `"${pg.text}"`;
    const out = el.querySelector('.dlg-typed');
    const seen = conv.seen || (conv.seen = []);
    const finish = () => {
      clearInterval(typing);
      typing = null;
      out.textContent = text;
      el.classList.add('said');
      if (!seen.includes(i)) seen.push(i);
    };
    el.classList.remove('said');
    clearInterval(typing);
    let n = 0;
    if (seen.includes(i) || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) finish();
    else typing = setInterval(() => { n += 2; out.textContent = text.slice(0, n); if (n >= text.length) finish(); }, 28);
    el.onclick = (e) => { if (!e.target.closest('button')) finish(); };
    $('dlg-prev')?.addEventListener('click', (e) => { e.stopPropagation(); turnPage(-1); });
    $('dlg-fwd')?.addEventListener('click', (e) => { e.stopPropagation(); turnPage(1); });
    for (const q of Object.keys(QUESTIONS)) $(`dlg-q-${q}`)?.addEventListener('click', () => askQ(q));
    $('dlg-yes')?.addEventListener('click', acceptOrder);
    $('dlg-sell')?.addEventListener('click', () => giveMade(c.browse));
    $('dlg-no')?.addEventListener('click', declineOrder);
    $('dlg-go')?.addEventListener('click', () => goId('view-sill'));
    $('dlg-done')?.addEventListener('click', nextPlease);
  }

  // What the bunch says, as bars: the three loudest things in it. Not the order (that
  // is back at the stall), just what the vase on the table is saying so far.
  function readoutHtml(stems, ribbon) {
    const w = readBunch(stems, ribbon);
    const total = Object.values(w).reduce((a, b) => a + b, 0);
    const top = Object.entries(w).sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (!top.length) return '';
    return `<div class="says"><span class="says-t">It says</span>${top.map(([t, n]) =>
      `<span class="says-row"><span class="says-nm">${esc(TAGS[t])}</span><span class="says-bar"><i style="width:${Math.round((n / total) * 100)}%"></i></span></span>`).join('')}</div>`;
  }

  // The thing on the table as it stands: which vase, what is in it, the ribbon, and
  // what all of that says so far.
  function makingHtml(b) {
    const v = VASES[b.vase];
    const inIt = b.stems.length
      ? `${esc(cap(bunchText(b.stems)))}${b.ribbon ? `, tied with ${/^[aeiou]/.test(b.ribbon) ? 'an' : 'a'} ${b.ribbon} ribbon` : ''}.`
      : `Empty. Drag flowers in off the shelves${b.ribbon ? `; ${b.ribbon} ribbon tied on` : ''}.`;
    const mk = markupOf(b.markup || S.markup);
    return `<span class="bs-t">${esc(v.name)} <span class="bs-n">${b.stems.length} of ${NUMW[v.holds]}</span></span>
      <span class="bs-in">${inIt}</span>${readoutHtml(b.stems, b.ribbon)}
      <span class="bs-price">Price <button class="mk-arrow" id="mk-down" title="Cheaper">‹</button><b>${esc(mk.name)}</b><button class="mk-arrow" id="mk-up" title="Dearer">›</button>
        <span class="bs-est">${b.stems.length ? `about 🪙 ${priceOf({ vid: b.vase, stems: b.stems, ribbon: b.ribbon, markup: b.markup })}` : ''}${b.markup ? '' : ' · as the board'}</span></span>`;
  }
  // About what an arrangement fetches: a well-made one, at its price.
  function priceOf(m) {
    const worth = 3 + m.stems.reduce((a, k) => a + Math.max(1, Math.round(FLOWERS[flowerOf(k)].seed / 2)), 0) + VASES[m.vid].price + (m.ribbon ? 1 : 0);
    return Math.round(worth * markupOf(m.markup || S.markup).mult);
  }
  // One step dearer or cheaper; back on the board's price it follows the board again.
  function stepMarkup(cur, d) {
    const i = clamp(MARKUPS.findIndex((m) => m.id === cur) + d, 0, MARKUPS.length - 1);
    return MARKUPS[i].id;
  }
  function benchMarkup(d) {
    if (!S.bench) return;
    const next = stepMarkup(S.bench.markup || S.markup, d);
    S.bench.markup = next === S.markup ? null : next;
    save();
    render();
  }
  function boardMarkup(d) {
    S.markup = stepMarkup(S.markup, d);
    save();
    render();
  }

  // ---------- the table: a vase down off the shelf, being filled ----------
  // S.bench is the vase standing on the table and what is in it so far. The stems in it
  // are only spoken for until it goes out; the shelves show what is left beside them.

  const onBench = (k) => (S.bench ? S.bench.stems.filter((s) => s === k).length : 0);
  const stockLeft = (k) => inBucket(k) - onBench(k);

  function vaseDown(vid) {
    if (S.bench) {
      toast(S.bench.vase === vid ? 'That one is on the table already.' : 'There\'s a vase on the table already. Drag it back to the shelf first.');
      return false;
    }
    S.bench = { vase: vid, stems: [], ribbon: null, markup: null };
    save();
    render();
    return true;
  }
  function vaseUp() {
    if (!S.bench) return;
    S.bench = null;
    save();
    render();
  }
  function addStem(k) {
    const b = S.bench;
    if (!b) { toast('Drag a vase off the shelf onto the table first.'); return false; }
    if (b.stems.length >= VASES[b.vase].holds) { toast(`The ${VASES[b.vase].name.toLowerCase()} is full.`); return false; }
    if (stockLeft(k) <= 0) { toast(`No more ${varPlural(k)} on the shelf.`); return false; }
    b.stems.push(k);
    save();
    render();
    return true;
  }
  function removeStem(i) {
    if (!S.bench || !S.bench.stems[i]) return;
    S.bench.stems.splice(i, 1);
    save();
    render();
  }
  function tieRibbon(c, toggle) {
    if (!S.bench) { toast(`${cap(c)} ribbon: ${TAGS[COLOURS[c].tag].toLowerCase()}. Tie it on a vase on the table.`); return; }
    S.bench.ribbon = toggle && S.bench.ribbon === c ? null : c;
    save();
    render();
  }

  // ---------- dragging ----------
  // Pointer events rather than the browser's drag and drop, so a finger works as well as
  // a mouse. A press that doesn't travel is an ordinary click, and everything you can
  // drag does something sensible when clicked, too.

  let drag = null;
  let draggedAt = -Infinity; // not 0: performance.now() starts at page load, and early clicks are real
  function draggable(el, what, ghost) {
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !S) return;
      drag = { what, ghost, x: e.clientX, y: e.clientY, el, g: null };
    });
  }
  const dropAt = (x, y) => {
    const el = document.elementFromPoint(x, y);
    return el ? el.closest('[data-drop]') : null;
  };
  // what each kind of thing does when it lands on each kind of place
  function landing(what, t) {
    const at = t ? t.dataset.drop : null;
    if (what.t === 'vase') return at === 'bench' || at === 'vase' ? () => vaseDown(what.vid) : null;
    if (what.t === 'stem') return at === 'bench' || at === 'vase' ? () => addStem(what.k) : null;
    if (what.t === 'ribbon') return at === 'bench' || at === 'vase' ? () => tieRibbon(what.c, false) : null;
    if (what.t === 'out') return at !== 'vase' ? () => removeStem(what.i) : null;
    if (what.t === 'bench') return at === 'shelf' ? vaseUp : null;
    if (what.t === 'made') return at === 'customer' && S.shop.cust ? () => giveMade(what.id) : null;
    return null;
  }
  document.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (!drag.g) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
      drag.g = document.createElement('div');
      drag.g.className = `drag-ghost g-${drag.what.t}`;
      drag.g.innerHTML = drag.ghost();
      document.body.appendChild(drag.g);
      document.body.classList.add('dragging');
      drag.el.classList.add('lifted');
    }
    drag.g.style.left = `${e.clientX}px`;
    drag.g.style.top = `${e.clientY}px`;
    const t = dropAt(e.clientX, e.clientY);
    document.querySelectorAll('.drop-over').forEach((x) => x.classList.remove('drop-over'));
    if (t && landing(drag.what, t)) t.classList.add('drop-over');
  });
  const endDrag = (e) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (!d.g) return; // it never moved: a click, which the thing's own handler deals with
    d.g.remove();
    document.body.classList.remove('dragging');
    d.el.classList.remove('lifted');
    document.querySelectorAll('.drop-over').forEach((x) => x.classList.remove('drop-over'));
    draggedAt = performance.now();
    const go = e.type === 'pointerup' ? landing(d.what, dropAt(e.clientX, e.clientY)) : null;
    if (go) go();
  };
  document.addEventListener('pointerup', endDrag);
  document.addEventListener('pointercancel', endDrag);
  // the click that follows a drag is not a click
  document.addEventListener('click', (e) => {
    if (performance.now() - draggedAt < 300) { e.stopPropagation(); e.preventDefault(); }
  }, true);

  // The vase on the table, finished: its stems come off the shelves and the vase off the
  // shelf, and what is left is an arrangement. Returns it, or null if it can't be made.
  function finishBench() {
    const b = S.bench;
    if (!b || !b.stems.length) return null;
    const counts = {};
    for (const k of b.stems) counts[k] = (counts[k] || 0) + 1;
    if (Object.entries(counts).some(([k, n]) => inBucket(k) < n)) { toast('Fewer stems on the shelf than that.'); return null; }
    const age = takeStems(counts);
    S.bench = null;
    return { id: uid(), vid: b.vase, stems: b.stems.slice(), ribbon: b.ribbon, markup: b.markup || null, age, slots: age * DAY_SLOTS };
  }

  // Made, and put out on the stall for whoever comes by wanting it.
  function setAside() {
    if (!S.bench || !S.bench.stems.length) return;
    if (S.made.length >= OUT_MAX) { toast('The stall is full. Sell one first.'); return; }
    const m = finishBench();
    if (!m) return;
    S.made.push(m);
    diary(`Made up ${bunchText(m.stems)} in the ${VASES[m.vid].name.toLowerCase()}${m.ribbon ? `, with a ${m.ribbon} ribbon` : ''}, and put it out on the stall.`);
    markGoal('display');
    soon();
    toast('Out on the stall. Somebody may well stop for it.');
    save();
    render();
  }

  // Straight off the table to the customer who asked.
  function handOver() {
    const o = S.shop.cust;
    if (!S.bench || !S.bench.stems.length) return;
    if (!o || !o.accepted) { setAside(); return; }
    const m = finishBench();
    if (m) giveTo(o, m);
  }

  // One set aside earlier, to whoever is at the counter now, asked or not.
  function giveMade(id) {
    const o = S.shop.cust;
    const i = S.made.findIndex((m) => m.id === id);
    if (i < 0) return;
    if (!o) { toast('Nobody at the counter to give it to.'); return; }
    const mk = markupOf(S.made[i].markup || S.markup);
    if (o.browse === id && Math.random() < mk.balk) {
      diary(`${o.who} looked at the price on the ${VASES[S.made[i].vid].name.toLowerCase()} and put it back. ${mk.name}, apparently.`, 'bad');
      toast(`${o.face} "How much? No, I don't think so."`);
      bumpRep(-2);
      S.shop.cust = null;
      soon();
      save();
      render();
      return;
    }
    const [m] = S.made.splice(i, 1);
    o.accepted = true;
    giveTo(o, m);
  }

  function giveTo(o, m) {
    const { vid, stems, ribbon } = m;
    const droopy = m.age >= STEM_DROOP;
    const res = judge(o, stems, vid, droopy, ribbon);
    const mk = markupOf(m.markup || S.markup);
    res.pay = Math.round(res.pay * mk.mult);
    const tip = res.stars === 3 && mk.sat >= 0 ? 1 + rnd(4) + (o.regular ? 2 : 0) : 0;
    S.coins += res.pay + tip;
    S.stats.served += 1;
    S.stats.stars += res.stars;
    S.stats.earned += res.pay + tip;
    bumpRep([-4, -1, 2, 4][res.stars] + mk.sat);
    if (o.regular) { S.folk[o.regular].visits += 1; S.folk[o.regular].stars += res.stars; }
    S.shop.cust = null;
    S.shop.today = (S.shop.today || 0) + 1;
    markGoal('serve');
    const line = responseTo(o, res.stars);
    const missedWant = res.checks.some((c) => c.id === 'want' && !c.great);
    const hint = [
      droopy ? 'Some of those stems were going over.' : '',
      mk.sat < 0 ? `They paid, but winced at the price${mk.sat <= -5 ? ', and they will tell people' : ''}.` : mk.sat > 0 ? 'Pleased with the price, too.' : '',
      res.stars < 3 ? (missedWant ? 'The Language of Flowers on the table says what each one means.' : res.checks.some((c) => !c.ok) ? 'Mind what they asked for.' : 'A fuller vase, or more than one kind in it, is a proper bunch.') : '',
    ].filter(Boolean).join(' ');
    const pages = pagesOf(o).concat([{ text: line, result: true }]);
    S.shop.last = { id: o.id, who: o.who, face: o.face, line, stars: res.stars, pay: res.pay, tip, vid, stems, ribbon, hint, pages, page: pages.length - 1, seen: (o.seen || []).slice() };
    diary(`${o.who} ${o.want ? `wanted something that said ${TAGS[o.want].toLowerCase()}` : 'wanted something nice'}. Made up ${bunchText(stems)} in the ${VASES[vid].name.toLowerCase()}${ribbon ? `, with a ${ribbon} ribbon` : ''}. "${line}"`, res.stars >= 2 ? 'good' : 'bad');
    save();
    goId('view-stall');
    render();
  }

  // ---------- the seed catalogue ----------

  function buy(cost, fn) {
    if (S.coins < cost) { toast('Not enough in the tin for that.'); return; }
    S.coins -= cost;
    fn();
    save();
    render();
    openCatalogue();
  }

  function openCatalogue() {
    const can = (n) => S.coins >= n;
    let html = `<h2>The seed catalogue</h2><p class="lead ink">Posted on a Thursday, here by Friday, and today since you asked nicely. There is 🪙 ${S.coins} in the tin.</p>
      <h3>Seed</h3><div class="options">`;
    for (const f of Object.keys(FLOWERS)) {
      const fl = FLOWERS[f];
      if (!S.flags.catalogue.includes(f)) {
        html += '<div class="opt unknown"><span class="icon">📜</span><span><span class="t">Something new</span><br><span class="d">The merchant carries more for a shop people talk about.</span></span><span class="r">?</span></div>';
        continue;
      }
      for (const c of fl.colours) {
        const k = vkey(f, c);
        html += `<button class="opt seed" data-buy-seed="${k}" ${can(fl.seed) ? '' : 'disabled'}>
          <span class="icon">${pic(k)}</span>
          <span><span class="t">${esc(varName(k))}${packetFor(k) ? ` <span class="tiny-tag">×${packetFor(k).n} on the table</span>` : ''}</span><br><span class="d">${esc(meaningOf(k))} · ${fl.days} spells to flower</span></span>
          <span class="r ${can(fl.seed) ? 'good' : ''}">🪙 ${fl.seed}</span></button>`;
      }
    }
    html += '</div>';
    if (S.pots.length < POT_MAX) {
      html += `<h3>The shed</h3><div class="options"><button class="opt" data-buy-pot="1" ${can(POT_PRICE) ? '' : 'disabled'}>
        <span class="icon">🪴</span><span><span class="t">Another pot on the shelf</span><br><span class="d">${S.pots.length} of ${POT_MAX}. More pots, more stems.</span></span>
        <span class="r ${can(POT_PRICE) ? 'good' : ''}">🪙 ${POT_PRICE}</span></button></div>`;
    }
    html += '<div class="foot"><button class="primary" id="sheet-cancel">Close the catalogue</button></div>';
    openSheet(html);
    const sh = $('sheet');
    sh.querySelectorAll('[data-buy-seed]').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.buySeed;
      buy(FLOWERS[flowerOf(k)].seed, () => { addPacket(k); toast(`A packet of ${varPlural(k)} on the table.`); });
    }));
    sh.querySelectorAll('[data-buy-pot]').forEach((b) => b.addEventListener('click', () => buy(POT_PRICE, () => {
      S.pots.push(emptyPot());
      diary(`Shifted things along the shelf and made room for another pot. ${S.pots.length} now.`, 'warm');
    })));
    $('sheet-cancel').addEventListener('click', closeSheet);
  }

  // ---------- the language of flowers ----------

  function openBook() {
    let html = `<h2>The Language of Flowers</h2>
      <p class="lead ink">Every flower says one thing, and its colour says something quieter underneath: the flower counts twice what its colour does.</p>
      <h3>Colours</h3><div class="book-colours">${Object.values(COLOURS).map((c) =>
        `<span class="book-col"><i style="background:${c.m}"></i>${cap(c.name)} · ${esc(TAGS[c.tag].toLowerCase())}</span>`).join('')}</div>
      <h3>Flowers</h3><div class="options">`;
    for (const f of Object.keys(FLOWERS)) {
      const fl = FLOWERS[f];
      const open = S.flags.catalogue.includes(f);
      html += `<div class="opt book${open ? '' : ' unknown'}"><span class="icon">${open ? pic(vkey(f, fl.colours[0])) : '📜'}</span>
        <span><span class="t">${open ? esc(fl.name) : 'A page not yet read'}</span><br><span class="d">${open ? `<b>${esc(TAGS[fl.tag])}.</b> ${esc(fl.says)} Comes in ${listText(fl.colours)}.` : 'The seed merchant does not carry it yet.'}</span></span><span class="r"></span></div>`;
    }
    html += `</div><p>Close cousins count for half: cheer sits near celebration and friendship, sympathy near remembrance and calm. Some things fight: nobody wants celebration at a funeral.</p>
      <div class="foot"><button class="primary" id="sheet-cancel">Close the book</button></div>`;
    openSheet(html);
    $('sheet-cancel').addEventListener('click', closeSheet);
  }

  // ---------- time ----------
  // There are no nights to sit through. Time is customers: every GROW_EVERY slots is a
  // growing spell in the garden, and every DAY_SLOTS slots is a day, with its weather,
  // and the cut flowers a day older. A slot is somebody coming up the lane, or somebody
  // who would have if the stall were open.

  // One growing spell: every watered pot grows a step, and every pot dries a step (two in
  // a heatwave). Left dry long enough, a plant wilts, then dies.
  function growSpell(quiet) {
    const heat = S.weather === 'heat';
    let grew = 0;
    for (const p of S.pots) {
      if (!p.crop) continue;
      if (p.dry <= 1 && !p.wilted && p.progress < FLOWERS[flowerOf(p.crop)].days) { p.progress += 1; grew += 1; }
      p.dry += heat ? 2 : 1;
      if (p.dry >= 5) {
        diary(`The ${varPlural(p.crop)} are past saving. Tipped them on the compost.`, 'bad');
        Object.assign(p, emptyPot());
      } else if (p.dry >= 3 && !p.wilted) {
        p.wilted = true;
        diary(`The ${varPlural(p.crop)} have wilted. They want water.`, 'bad');
      }
    }
    if (!quiet && grew) toast('🌱 The garden has come on a bit.');
  }
  // Every cut stem, and every arrangement out on the stall, a slot older: a step of age
  // every DAY_SLOTS slots since it was cut. Tired at STEM_DROOP steps, gone at STEM_DEAD.
  function ageStems() {
    const tick = (x) => { x.slots = (x.slots || 0) + 1; if (x.slots % DAY_SLOTS === 0) x.age += 1; };
    S.bucket.forEach(tick);
    S.made.forEach(tick);
    const gone = S.bucket.filter((b) => b.age >= STEM_DEAD);
    if (gone.length) diary(`Tipped ${bunchText(gone.flatMap((b) => Array(b.n).fill(b.k)))} off the shelves. Too far gone to sell.`, 'bad');
    S.bucket = S.bucket.filter((b) => b.age < STEM_DEAD);
    const over = S.made.filter((m) => m.age >= STEM_DEAD);
    for (const m of over) diary(`The ${bunchText(m.stems)} out on the stall in the ${VASES[m.vid].name.toLowerCase()} have gone over. Compost, and the vase washed and put away.`, 'bad');
    S.made = S.made.filter((m) => m.age < STEM_DEAD);
  }
  // A customer slot has gone by: somebody came, or would have if the stall were open.
  function slotPassed() {
    S.slots = (S.slots || 0) + 1;
    if (S.slots >= GROW_EVERY) {
      S.slots = 0;
      growSpell(false);
    }
    ageStems();
    S.daySlots = (S.daySlots || 0) + 1;
    if (S.daySlots >= DAY_SLOTS) {
      S.daySlots = 0;
      newDay();
    }
  }

  // A new day: the calendar and the weather move on, and everything cut is a day older.
  // Whoever is at the counter stays where they are.
  function newDay() {
    // calendar
    S.day += 1;
    S.dayCount += 1;
    let newSeason = false;
    if (S.day > DAYS_PER_SEASON) {
      S.day = 1;
      S.season += 1;
      newSeason = true;
      if (S.season >= SEASONS.length) { S.season = 0; S.year += 1; }
    }

    S.weather = rollWeather();
    S.shop.today = 0;
    diaryDay();
    if (newSeason) {
      diary({
        Spring: 'Spring. Everybody wants tulips, and says so.',
        Summer: 'Summer. Long evenings, and everything in the shed wants water.',
        Autumn: 'Autumn. Leaves in the gutters and dahlias on every table.',
        Winter: 'Winter. Short days. Flowers matter more when there aren\'t any.',
      }[seasonName()], 'warm');
    }
    if (S.weather === 'heat') diary('Heatwave. The pots will dry out twice as fast today.');
    if (ROUGH.includes(S.weather)) diary('Rough weather. Not many will come up the lane in this.');
    save();
    render();
  }

  function rollWeather() {
    const table = WEATHER_TABLE[seasonName()];
    const total = table.reduce((a, [, w]) => a + w, 0);
    let r = Math.random() * total;
    for (const [id, w] of table) { r -= w; if (r <= 0) return id; }
    return table[0][0];
  }

  // ---------- sheets ----------

  function openSheet(html) {
    $('sheet').innerHTML = html;
    $('overlay').classList.remove('hidden');
  }
  function closeSheet() {
    $('overlay').classList.add('hidden');
    $('sheet').innerHTML = '';
  }

  // A new shop, straight in: no name to give and no card to click past. The diary says
  // what there is, and the goals pill says what to try.
  function newShop() {
    S = freshState();
    held = null;
    nextAt = 0;
    diaryDay();
    diary('Took the key to the shed at the end of the lane. The last one left the garden going: six pots in flower, and a watering can with a dent in it.');
    diary('Four kinds of vase on the shelf in the shed, and a book on the table called The Language of Flowers. A stall out front, and a lane people come up.');
    diary('Cut what is out, make something up, and see who comes.');
    save();
    goTo(1);
    render();
    toast('The stall is closed for now. Open it from the top bar, or the sign at the stall, when you are ready.');
  }

  function openHelp() {
    openSheet(`<h2>How to play</h2>
      <p class="lead ink">Grow flowers, and sell them to people who want to say something with them.</p>
      <h3>Getting about</h3>
      <ul>
        <li>Three places, left to right: <strong>the garden, the shed and the stall</strong>. The arrows at the edges of the screen (or ← and →) go between them, and light up when something over there wants you. The shed door goes out to the garden too.</li>
      </ul>
      <h3>The garden</h3>
      <ul>
        <li>The garden keeps customer time: a <strong>growing spell</strong> passes every ${NUMW[GROW_EVERY]} customers, and every time somebody would have come while the stall is closed. ${NUMW[DAY_SLOTS]} customers make a day. Each spell, watered pots grow a step and every pot dries a step. <strong>Pick up the can and click a pot</strong> to water it; left dry, a plant wilts, then dies. Heatwaves dry them twice as fast.</li>
        <li><strong>Click a pot in flower to cut it.</strong> The stems go on the shelves in the shed, and the plant grows back from half-way. Stems keep a few days, droop, then go on the compost.</li>
        <li>Sow an empty pot from a seed packet on the grass. Packets come from the <strong>catalogue</strong> (top right), and sometimes off your own plants.</li>
      </ul>
      <h3>The stall and the shed</h3>
      <ul>
        <li>The stall is always open. Customers come up the lane one at a time, say what they want, and wait while you work. A bare stall gets passed by; put something out and they stop sooner. If you are elsewhere when someone arrives, their face pops up by the arrow.</li>
        <li>Take the order and you go through to the shed. <strong>Drag a vase off the shelf onto the table</strong>, then drag flowers off the shelves into it, and a ribbon if you like. Drag a stem out to take it back. (Clicking does the same.) Forgotten what they asked for? The stall is one arrow away, and they will tell you again.</li>
        <li><strong>You don't need an order to make something.</strong> Fill a vase and <em>Put it out on the stall</em>. Passers-by may ask to buy one as it stands, and you can drag one (or click it) to whoever is at the counter. Up to four at once, and they go over in a few days like cut stems do.</li>
        <li><strong>Every flower says one thing, and its colour something quieter</strong>: a flower counts twice what its colour does, and a ribbon counts like a colour. The Language of Flowers on the table has them all.</li>
        <li>Stars: up to two for saying the right thing, one more for a proper bunch (a full vase, or more than one kind). Anything they said it had to have, or had to not, keeps you to one star if you miss it. A size they asked for, or tired stems, cost a star.</li>
        <li>More stars, more people talk: more customers a day, and new seed in the catalogue.</li>
      </ul>
      <h3>Money and satisfaction</h3>
      <ul>
        <li>The <strong>price board</strong> at the stall sets what you charge, from Cheap to Daylight robbery; the card by the vase on the table can price one arrangement differently. Dear prices fetch more but please people less, and someone browsing may walk off.</li>
        <li><strong>Satisfaction</strong>, up in the bar, is how pleased the lane is with you: good bunches and fair prices raise it. The higher it is, the more often people come, the more particular they are, and the more a job pays.</li>
        <li>The <strong>Open</strong> button in the bar (or the sign at the stall) closes the stall for a while, if you just want to make things up. Nobody new comes until you open again.</li>
        <li>A bunch sells for its stems and its vase, more for more stars, and a happy customer tips. Spend it on seed and more pots. Vases never run out; flowers do.</li>
      </ul>
      <div class="foot"><button id="help-reset">Start again</button><button class="primary" id="sheet-cancel">Back</button></div>`);
    $('sheet-cancel').addEventListener('click', closeSheet);
    $('help-reset').addEventListener('click', startOver);
  }

  // A new shop from scratch: the saved one thrown away, and back to the shed with the
  // garden in flower. Asks first, since there is no getting the old one back.
  function startOver() {
    if (!confirm('Start a new shop? This one, and everything in it, will be thrown away.')) return;
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
    closeSheet();
    newShop();
  }

  // ---------- render ----------

  // The cut flowers stand in the shed, a bucket to a kind: on the right-hand shelves in
  // the painted room, along the back of the table on a phone. Drag one into the vase on
  // the table, or click it.
  const SHELF_SLOTS = 10;
  function renderBucket() {
    const keys = bucketKeys();
    const el = $('pantry');
    const shown = keys.length > SHELF_SLOTS ? keys.slice(0, SHELF_SLOTS - 1) : keys;
    el.innerHTML = keys.length
      ? shown.map((k) => {
        const n = stockLeft(k);
        const title = `${varName(k)} · ${n} stem${n === 1 ? '' : 's'}. ${meaningOf(k)}.${tiredIn(k) ? ' Some are going over.' : ''} Drag it into the vase on the table.`;
        return `<button class="stock-item${tiredIn(k) ? ' tired' : ''}${n ? '' : ' spent'}" data-stems="${k}" title="${esc(title)}">
          <span class="s-stems">${[0, 1, 2].slice(0, clamp(n, 1, 3)).map((i) => `<img src="${ART[k]}" alt="" style="--r:${(i - 1) * 16}deg">`).join('')}</span><i class="jar"></i>
          <span class="nm">${esc(varName(k))}</span><span class="n">${n}</span></button>`;
      }).join('') + (keys.length > shown.length ? `<span class="stock-more">+${keys.length - shown.length} more</span>` : '')
      : '<span class="counter-empty">Nothing cut yet. The flowers are out in the garden.</span>';
    el.querySelectorAll('[data-stems]').forEach((b) => {
      const k = b.dataset.stems;
      draggable(b, { t: 'stem', k }, () => pic(k));
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        if (S.bench && stockLeft(k) > 0) addStem(k);
        else toast(`${varName(k)}: ${meaningOf(k).toLowerCase()}.`);
      });
    });
  }

  // Ribbon on reels on the top shelf. Any colour, as much as you like.
  function renderRibbons() {
    const el = $('ribbons');
    el.innerHTML = Object.keys(COLOURS).map((c) => `<button class="spool${S.bench && S.bench.ribbon === c ? ' on' : ''}" data-ribbon="${c}" style="--rb:${COLOURS[c].m};--rd:${COLOURS[c].d}" title="${esc(`${cap(c)} ribbon: ${TAGS[COLOURS[c].tag].toLowerCase()}. Drag it onto the vase on the table.`)}"><i></i></button>`).join('');
    el.querySelectorAll('[data-ribbon]').forEach((b) => {
      const c = b.dataset.ribbon;
      draggable(b, { t: 'ribbon', c }, () => `<span class="spool" style="--rb:${COLOURS[c].m};--rd:${COLOURS[c].d}"><i></i></span>`);
      b.addEventListener('click', (e) => { e.stopPropagation(); tieRibbon(c, true); });
    });
  }

  // Arrangements set aside: on the cabinet top in the shed, and on the right of the
  // counter at the stall, where they can be dragged (or clicked) to whoever is there.
  function madeHtml(m) {
    const top = Object.entries(readBunch(m.stems, m.ribbon)).sort((a, b) => b[1] - a[1])[0];
    const title = `${cap(bunchText(m.stems))} in the ${VASES[m.vid].name.toLowerCase()}${m.ribbon ? `, ${m.ribbon} ribbon` : ''}. Says ${TAGS[top[0]].toLowerCase()}, mostly.${m.age >= STEM_DROOP ? ' Going over.' : ''}`;
    return `<button class="made-item${m.age >= STEM_DROOP ? ' tired' : ''}" data-made="${m.id}" title="${esc(`${title} ${markupOf(m.markup || S.markup).name} at 🪙 ${priceOf(m)}.`)}">${vaseSvg(m.vid, m.stems, false, m.ribbon)}<span class="price-tag${m.markup ? ' own' : ''}">🪙 ${priceOf(m)}</span></button>`;
  }
  function renderMade() {
    for (const [id, atStall] of [['stall-made', true]]) {
      const el = $(id);
      el.innerHTML = S.made.map(madeHtml).join('');
      el.querySelectorAll('[data-made]').forEach((b) => {
        const m = S.made.find((x) => x.id === b.dataset.made);
        if (atStall) draggable(b, { t: 'made', id: m.id }, () => `<span class="ghost-vase g-made">${vaseSvg(m.vid, m.stems, false, m.ribbon)}</span>`);
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          if (atStall && S.shop.cust) giveMade(m.id);
          else toast(`${b.title}${atStall ? '' : ' It goes out from the stall when somebody asks.'}`);
        });
      });
    }
  }

  // The vase on the table, big enough to work in, with a mat under it.
  function renderBench() {
    const el = $('bench');
    const b = S.bench;
    const o = S.shop.cust && S.shop.cust.accepted ? S.shop.cust : null;
    el.classList.toggle('empty', !b);
    if (!b) {
      el.innerHTML = '<span class="bench-hint">Drag a vase here</span>';
      return;
    }
    const v = VASES[b.vase];
    el.innerHTML = `<div class="bench-vase" data-drop="vase" title="${esc(`${v.name}. Drag flowers and ribbon onto it; drag a stem out to take it back; drag the vase to the shelf to put it away.`)}">${vaseSvg(b.vase, b.stems, true, b.ribbon)}</div>
      <div class="bench-says">${makingHtml(b)}</div>
      <button class="bench-back" id="bench-back" title="Put the vase back on the shelf">↩</button>
      <button class="bench-give" id="bench-give" ${b.stems.length ? '' : 'disabled'}>${o ? 'Take it out to them' : 'Put it out on the stall'}</button>`;
    const vaseEl = el.querySelector('.bench-vase');
    draggable(vaseEl, { t: 'bench' }, () => `<span class="ghost-vase">${vaseSvg(b.vase, b.stems, false, b.ribbon)}</span>`);
    el.querySelectorAll('[data-stem]').forEach((g) => {
      const i = Number(g.dataset.stem);
      g.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (e.button === 0) drag = { what: { t: 'out', i }, ghost: () => pic(g.dataset.k), x: e.clientX, y: e.clientY, el: g, g: null }; });
      g.addEventListener('click', (e) => { e.stopPropagation(); removeStem(i); });
    });
    $('bench-back').addEventListener('click', (e) => { e.stopPropagation(); vaseUp(); });
    $('mk-down').addEventListener('click', (e) => { e.stopPropagation(); benchMarkup(-1); });
    $('mk-up').addEventListener('click', (e) => { e.stopPropagation(); benchMarkup(1); });
    $('bench-give').addEventListener('click', (e) => { e.stopPropagation(); handOver(); });
  }

  function renderPackets() {
    const el = $('packets');
    el.innerHTML = S.packets.map((p, i) => `<button class="packet" data-packet="${i}" style="--tilt:${((i * 5) % 7) - 3}deg" title="${esc(varName(p.k))} seed${p.n > 1 ? `, ${p.n} packets` : ''}. Click to sow it in an empty pot.">
      <span class="ico">${pic(p.k)}</span><span class="lbl">${esc(varName(p.k).toLowerCase())}</span>${p.n > 1 ? `<span class="count">×${p.n}</span>` : ''}</button>`).join('');
    el.querySelectorAll('[data-packet]').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      const free = S.pots.findIndex((pt) => !pt.crop);
      if (free < 0) { toast('Every pot is busy. Pull something out, or buy another pot.'); return; }
      sowPot(free, S.packets[Number(b.dataset.packet)].k);
    }));
  }

  function renderVases() {
    const el = $('vases');
    el.innerHTML = VASE_ORDER.map((vid) => {
      const v = VASES[vid];
      const title = `${v.name}, holds ${NUMW[v.holds]}. Drag it onto the table.`;
      return `<button class="vase v-${vid}" data-vase="${vid}" title="${esc(title)}" aria-label="${esc(title)}">
        ${vaseSvg(vid, [])}<span class="vase-nm">${esc(v.name)}</span></button>`;
    }).join('');
    el.querySelectorAll('[data-vase]').forEach((b) => {
      const vid = b.dataset.vase;
      draggable(b, { t: 'vase', vid }, () => `<span class="ghost-vase">${vaseSvg(vid, [])}</span>`);
      b.addEventListener('click', (e) => { e.stopPropagation(); vaseDown(vid); });
    });
  }

  // The stall: the sign, whoever is at the counter, and what is in stock on show.
  // A customer is a face and a coat for now — a placeholder until there is art for them.
  const COATS = ['#6f8fb0', '#b0654f', '#6c8b58', '#8a6aa6', '#b08a4a', '#5f7f86', '#a4566e'];
  function renderStall() {
    const c = S.shop.cust || S.shop.last;
    const sign = $('door-sign');
    sign.textContent = S.shop.paused ? 'Closed' : 'Open';
    sign.classList.toggle('open', !S.shop.paused);
    $('stall-closed').classList.toggle('hidden', !S.shop.paused);
    $('price-board').innerHTML = `<span class="pb-t">Prices</span><button class="mk-arrow" id="pb-down" title="Cheaper">‹</button><b>${esc(markupOf(S.markup).name)}</b><button class="mk-arrow" id="pb-up" title="Dearer">›</button>`;
    $('pb-down').addEventListener('click', (e) => { e.stopPropagation(); boardMarkup(-1); });
    $('pb-up').addEventListener('click', (e) => { e.stopPropagation(); boardMarkup(1); });
    const el = $('customer');
    const coat = c ? COATS[[...c.who].reduce((a, ch) => a + ch.charCodeAt(0), 0) % COATS.length] : '';
    const key = c ? c.id : '';
    if (el.dataset.who !== key) {
      el.dataset.who = key;
      el.innerHTML = c ? `<span class="cust-face">${c.face}</span><span class="cust-coat" style="--coat:${coat}"></span>` : '';
    }
    el.classList.toggle('here', !!c);
    el.disabled = !c;
    el.title = c ? c.who : 'Nobody here yet';
    renderDialog();
    // up to five buckets of stock along the front of the counter, three stems showing in each
    const keys = bucketKeys().slice(0, 5);
    $('stall-buckets').innerHTML = keys.map((k) => `<span class="s-bucket" title="${esc(`${varName(k)} · ${inBucket(k)}`)}">
      <span class="s-stems">${[0, 1, 2].slice(0, Math.min(3, inBucket(k))).map((i) => `<img src="${ART[k]}" alt="" style="--r:${(i - 1) * 14}deg">`).join('')}</span><i></i></span>`).join('');
  }

  function renderGoals() {
    const t = S.flags.goals;
    $('goals').classList.toggle('hidden', !!S.flags.goalsDone);
    const lis = [...document.querySelectorAll('#goals [data-goal]')];
    lis.forEach((li) => li.classList.toggle('done', !!t[li.dataset.goal]));
    const next = lis.find((li) => !t[li.dataset.goal]);
    $('goals-next').textContent = next ? next.querySelector('.g-txt').textContent : 'All done';
    $('goals-n').textContent = `${lis.filter((li) => t[li.dataset.goal]).length}/${lis.length}`;
  }

  // A sun that rides the day across the doorway, by how much of the shop is left.
  function renderSun() {
    const sun = $('sky-sun');
    const t = 0.12 + 0.8 * ((S.daySlots || 0) / DAY_SLOTS); // across the sky as the day's customers go by
    const top = 74 - 66 * Math.sin(Math.PI * t);
    sun.style.left = `${8 + t * 84}%`;
    sun.style.top = `${top}%`;
    sun.classList.toggle('low', top < 20);
    sun.classList.toggle('muted', ROUGH.includes(S.weather) || S.weather === 'fog');
  }

  function render() {
    if (!S) return;
    document.body.dataset.season = seasonName();
    $('hud-date').innerHTML = `<b>${seasonName()}</b> · day ${S.day} · year ${S.year}`;
    const w = WEATHER[S.weather];
    $('hud-weather').innerHTML = `${ink(w.icon)} ${esc(w.name)}`;
    $('hud-actions').innerHTML = `<span class="coins" title="In the tin">🪙 ${S.coins}</span><span class="sat" title="Customer satisfaction: ${esc(repWord())}. Happier customers come more often, ask for more and pay more.">${S.rep >= 75 ? '😄' : S.rep >= 50 ? '🙂' : S.rep >= 25 ? '😐' : '😞'}<i class="sat-bar"><b style="width:${S.rep}%"></b></i><span class="sat-n">${Math.round(S.rep)}%</span></span>`;
    $('btn-pause').textContent = S.shop.paused ? 'Stall closed' : 'Stall open';
    $('btn-pause').classList.toggle('closed', !!S.shop.paused);
    $('btn-pause').title = S.shop.paused ? 'The stall is closed: nobody new will come. Click to open.' : 'The stall is open. Click to close it for a while and just make things.';
    for (const id of ['sill-scene', 'garden-scene', 'stall-scene']) $(id).dataset.weather = S.weather;

    renderSun();
    renderPots();
    renderBucket();
    renderRibbons();
    renderBench();
    renderMade();
    renderPackets();
    renderVases();
    renderStall();
    renderNav();
    renderGoals();

    const ready = S.pots.filter(potRipe).length;
    const thirsty = S.pots.filter((p) => p.crop && !p.wilted && p.dry >= 2).length;
    const wilted = S.pots.filter((p) => p.crop && p.wilted).length;
    const c = S.shop.cust;
    const stems = S.bucket.reduce((a, b) => a + b.n, 0);
    $('garden-note').textContent = held === 'can'
      ? 'Carrying the can. Click a pot to water it, or the can to put it down.'
      : [
        ready ? `${ready} pot${ready === 1 ? '' : 's'} in flower to cut.` : '',
        wilted ? `${wilted} wilted, water ${wilted === 1 ? 'it' : 'them'}.` : '',
        thirsty ? `${thirsty} will wilt soon without water.` : '',
      ].filter(Boolean).join(' ') || 'Everything watered, nothing to cut. Pick up the can tomorrow.';
    const b = S.bench;
    $('sill-note').textContent = c && c.accepted
      ? (b ? `Making up ${mid(c.who)}'s order. Drag flowers from the shelves into the vase.` : `Making up ${mid(c.who)}'s order. Drag a vase off the shelf onto the table.`)
      : c ? `${c.who} is waiting at the stall.`
        : b ? 'Making something up. Put it out on the stall when it is done, for whoever wants it.' : stems ? `${stems} stem${stems === 1 ? '' : 's'} on the shelves. Orders come in at the stall.` : 'Nothing cut yet. The flowers are out in the garden.';
    // at the stall the customer does the talking; the note only speaks when nobody is
    $('stall-note').textContent = c || S.shop.last ? ''
      : S.shop.paused ? 'Closed for now. Click the sign on the counter when you want people again.' : S.made.length ? 'Your flowers are out. Somebody will stop.' : 'Nothing out on the stall. Folk walk past a bare counter.';
  }

  // ---------- boot ----------

  $('btn-pause').addEventListener('click', () => { if (S) togglePause(); });
  $('door-sign').addEventListener('click', (e) => { e.stopPropagation(); if (S) togglePause(); });
  $('stall-closed').addEventListener('click', (e) => { e.stopPropagation(); if (S) togglePause(); });
  $('btn-cook').addEventListener('click', () => { if (S) openBook(); });
  $('btn-shop').addEventListener('click', () => { if (S) openCatalogue(); });
  $('btn-help').addEventListener('click', openHelp);
  $('btn-restart').addEventListener('click', () => { if (S) startOver(); });
  $('btn-diary').addEventListener('click', () => { if (S) openDiary(); });
  $('goals-hide').addEventListener('click', (e) => { e.stopPropagation(); if (!S) return; S.flags.goalsDone = true; save(); render(); });
  $('goals-toggle').addEventListener('click', () => $('goals').classList.toggle('open'));
  $('btn-door').addEventListener('click', (e) => { e.stopPropagation(); if (S) goId('view-garden'); });
  $('customer').addEventListener('click', (e) => { e.stopPropagation(); $('dialog').click(); });
  // the vase shelf and the table are where a dragged vase can land
  $('vases').dataset.drop = 'shelf';
  $('bench').dataset.drop = 'bench';
  $('customer').dataset.drop = 'customer';
  $('nav-left').addEventListener('click', () => { if (S) goTo(place - 1); });
  $('nav-right').addEventListener('click', () => { if (S) goTo(place + 1); });
  $('can').addEventListener('click', (e) => { e.stopPropagation(); if (S) takeCan(); });
  $('garden-scene').addEventListener('click', () => { if (held === 'can') { held = null; render(); } });
  $('overlay').addEventListener('click', (e) => {
    if (e.target === $('overlay') && S) closeSheet();
  });
  document.addEventListener('keydown', (e) => {
    if (!S) return;
    // the arrow keys walk between the three places, when nothing else wants them
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && $('overlay').classList.contains('hidden') && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName || '')) {
      goTo(place + (e.key === 'ArrowLeft' ? -1 : 1));
      return;
    }
    if (e.key !== 'Escape') return;
    if (held !== null) { held = null; render(); return; }
    if (!$('overlay').classList.contains('hidden')) closeSheet();
  });

  // ---------- the painted room ----------
  // The shed is Amber's painted plate, and the scene's logical pixels are the plate's own,
  // so every position in the stylesheet reads straight off it. Below PLATE_MIN_W the room
  // would be too small to use, so the phone layout (the drawn shed) takes over.
  const PLATE_W = 1376, PLATE_H = 768;
  const PLATE_SEE_W = 1150, PLATE_SEE_H = 700;   // the least of the plate that must stay in view
  const PLATE_MIN_W = 700;
  function fitPlate() {
    const view = $('view-sill');
    const shed = $('sill-scene');
    const W = view.clientWidth, H = view.clientHeight;
    if (!W && !H) return; // another place is on screen; fit it when the shed comes back
    const on = W >= PLATE_MIN_W && H > 0;
    shed.classList.toggle('gs-plate', on);
    view.classList.toggle('gs-plate-view', on);
    $('stage').classList.toggle('gs-on', on);
    if (!on) { shed.style.transform = ''; return; }
    const k = Math.min(Math.max(W / PLATE_W, H / PLATE_H), W / PLATE_SEE_W, H / PLATE_SEE_H);
    const x = (W - PLATE_W * k) / 2;
    const y = (H - PLATE_H * k) * (H < PLATE_H * k ? 0.3 : 0.5);
    shed.style.transform = `translate(${x}px, ${y}px) scale(${k})`;
    const st = $('stage').style;
    st.setProperty('--gs-k', k);
    st.setProperty('--gs-x', `${x}px`);
    st.setProperty('--gs-y', `${y}px`);
  }
  window.addEventListener('resize', fitPlate);
  if (window.ResizeObserver) new ResizeObserver(fitPlate).observe($('view-sill'));
  fitPlate();

  // straight in: the saved shop if there is one, a new one if not
  const existing = load();
  if (existing) { S = existing; render(); } else newShop();

  // Debug handle for tests: the live state and the verbs, so a case can play a customer
  // without clicking at the plate.
  window.__gardenShed = {
    get S() { return S; }, FLOWERS, COLOURS, TAGS, VASES, FOLK,
    render, newDay, ageStems, nextCustomer, growSpell, slotPassed, newOrder, cutPot, goTo, askQ, turnPage,
    acceptOrder, declineOrder, nextPlease, togglePause, benchMarkup, boardMarkup, priceOf, vaseDown, vaseUp, addStem, removeStem, tieRibbon, handOver, setAside, giveMade,
    get place() { return PLACES[place][0]; },
    readBunch, fitFor, judge, orderChecks, vkey, save,
    // a new shop in place of whatever is loaded, since cases share one page
    fresh() { S = freshState(); held = null; closeSheet(); goTo(1); render(); return S; },
  };
})();
