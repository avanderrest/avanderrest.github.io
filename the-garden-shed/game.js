/* The Garden Shed — a flower shop in a potting shed.
   Grow the flowers on the shelf, and when somebody comes to the door wanting to say
   something, say it for them in a vase. Every flower means something, and so does
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
  const STEM_DROOP = 3;     // nights in the bucket before a stem starts to look tired
  const STEM_DEAD = 5;      // ...and before it goes on the compost
  const REP_START = 10;

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

  // Four vases, bought in and sold on with the flowers. Each is drawn in a 120x160 box
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

  // What people say they want. The ticket spells the meaning out once you take the order;
  // the story is how they put it at the door.
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
  const mid = (who) => (/^(A|An|The|Somebody)/.test(who) ? who.charAt(0).toLowerCase() + who.slice(1) : who);
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
  // A vase with whatever is in it, as one SVG. `big` makes each stem clickable.
  function vaseSvg(vid, stems, big) {
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
        return `<g class="stem"${big ? ` data-stem="${i}"` : ''}>
          <path d="${path}" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>
          <path d="${path}" fill="none" stroke="${STEM}" stroke-width="2.2" stroke-linecap="round"/>${leaf}
          <g transform="translate(${hx.toFixed(1)},${hy.toFixed(1)}) rotate(${(spike ? p.ang : p.ang * 0.4).toFixed(1)}) scale(1.45)">${head(k)}</g></g>`;
      }).join('');
    // Stems first and the vase over them: an opaque one hides where they end. An empty
    // vase is cropped to itself, so it stands on the shelf at its own size.
    const box = stems.length || big ? '0 0 120 160' : '26 82 68 78';
    return `<svg class="vase-svg" viewBox="${box}" preserveAspectRatio="xMidYMax meet" aria-hidden="true">${drawn}${VASE_BACK[vid]}</svg>`;
  }

  // ---------- what a bouquet says ----------

  // Every tag the stems carry, weighted: a flower's own meaning counts double its colour's.
  function readBunch(stems) {
    const w = {};
    for (const k of stems) {
      const ft = FLOWERS[flowerOf(k)].tag;
      const ct = COLOURS[colourOf(k)].tag;
      w[ft] = (w[ft] || 0) + FLOWER_W;
      w[ct] = (w[ct] || 0) + COLOUR_W;
    }
    return w;
  }
  // How nearly a bunch says `tag`, 0..1: the share of everything it says that is that,
  // with neighbouring feelings at half and opposite ones taken off.
  function fitFor(tag, stems) {
    const w = readBunch(stems);
    const total = Object.values(w).reduce((a, b) => a + b, 0);
    if (!total) return 0;
    let got = w[tag] || 0;
    for (const r of RELATED[tag] || []) got += (w[r] || 0) * 0.5;
    for (const c of CLASH[tag] || []) got -= (w[c] || 0);
    return clamp(got / total, 0, 1);
  }

  // One thing an order asks, as a check against a bunch. `hard` checks — a thing they
  // said it had to have, or had to not — cap the stars at one when they fail.
  function extraCheck(x, stems) {
    const has = (fn) => stems.some(fn);
    switch (x.t) {
      case 'hasFlower': return { label: `Has ${FLOWERS[x.v].pl} in it`, ok: has((k) => flowerOf(k) === x.v), hard: true };
      case 'hasColour': return { label: `Something ${x.v}`, ok: has((k) => colourOf(k) === x.v), hard: true };
      case 'allColour': return { label: `All ${x.v}`, ok: stems.length > 0 && stems.every((k) => colourOf(k) === x.v), hard: true };
      case 'noFlower':  return { label: `No ${FLOWERS[x.v].pl}`, ok: !has((k) => flowerOf(k) === x.v), hard: true };
      case 'noColour':  return { label: `Nothing ${x.v}`, ok: !has((k) => colourOf(k) === x.v), hard: true };
      case 'big':       return { label: 'Five stems or more', ok: stems.length >= 5, hard: false };
      default:          return { label: 'Three stems at most', ok: stems.length > 0 && stems.length <= 3, hard: false };
    }
  }
  function orderChecks(o, stems) {
    const out = [];
    if (o.want) {
      const fit = fitFor(o.want, stems);
      out.push({ id: 'want', label: `Says ${TAGS[o.want].toLowerCase()}`, ok: fit >= 0.4, great: fit >= 0.7, fit });
    }
    for (const x of o.extras) out.push({ id: x.t, ...extraCheck(x, stems) });
    return out;
  }

  // Stars out of three, and what they pay. Meaning is up to two stars; a proper bunch
  // (a full vase, or more than one kind in it) is the third. Tired stems cost one.
  function judge(o, stems, vid, droopy) {
    const checks = orderChecks(o, stems);
    const want = checks.find((c) => c.id === 'want');
    let stars = want ? (want.great ? 2 : want.ok ? 1 : 0) : 2;
    const proper = stems.length >= VASES[vid].holds || new Set(stems).size >= 2;
    if (proper && stems.length >= 2) stars += 1;
    for (const c of checks) if (!c.ok && !c.hard && c.id !== 'want') stars -= 1;
    if (droopy) stars -= 1;
    if (checks.some((c) => c.hard && !c.ok)) stars = Math.min(stars, 1);
    stars = clamp(stars, 0, 3);
    const worth = 3 + stems.reduce((a, k) => a + Math.max(1, Math.round(FLOWERS[flowerOf(k)].seed / 2)), 0) + VASES[vid].price;
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

  function freshState(name) {
    const folk = {};
    for (const f of FOLK) folk[f.id] = { visits: 0, stars: 0 };
    return {
      name: name || 'You',
      day: 1, season: 0, year: 1, dayCount: 1,
      weather: 'sunny',
      coins: 15,
      rep: REP_START,
      pots: STARTER_POTS.map((k) => ({ ...emptyPot(), crop: k, progress: FLOWERS[flowerOf(k)].days, dry: 0 })),
      bucket: [],        // [{ k: 'rose-red', n, age }]
      packets: STARTER_PACKETS.map((k) => ({ k, n: 1 })),
      vases: { bottle: 2, jar: 4, jug: 2, urn: 1 },
      notes: [],         // the pinboard: { id, text, done, order? }
      shop: { open: false, done: false, left: 0, cust: null },
      folk,
      diary: [],
      stats: { served: 0, stars: 0, earned: 0, cut: 0, turnedAway: 0 },
      flags: { goals: { cut: false, open: false, serve: false }, goalsDone: false, catalogue: Object.keys(FLOWERS).filter((f) => !FLOWERS[f].rep) },
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
      return s && s.pots && s.shop ? s : null;
    } catch (e) { return null; }
  }

  function markGoal(goal) {
    const g = S.flags.goals;
    if (g[goal] || S.flags.goalsDone) return;
    g[goal] = true;
    if (g.cut && g.open && g.serve) {
      S.flags.goalsDone = true;
      diary('Got the hang of it: grow it, cut it, and say it for somebody.', 'warm');
    }
  }

  // What happens is said once in the corner and then goes, but it is also written
  // down: S.diary is the book you can sit and read.
  const DIARY_MAX = 500;
  function diary(text, cls) {
    S.diary.push({ t: text, c: cls || '' });
    if (S.diary.length > DIARY_MAX) S.diary.splice(0, S.diary.length - DIARY_MAX);
    logLine(text, cls);
  }
  function diaryDay() {
    const w = WEATHER[S.weather];
    S.diary.push({ day: dayLabel(), w: S.weather });
    logLine(`${dayLabel()} · ${w.icon} ${w.name}`, 'day');
  }
  function openDiary() {
    const days = [];
    for (const e of S.diary) {
      if (e.day) days.push({ label: e.day, w: e.w, lines: [] });
      else if (days.length) days[days.length - 1].lines.push(e.t);
    }
    let html = `<h2>The diary</h2>
      <p class="lead ink">${esc(S.name)}, at the shed. ${days.length ? `The last ${days.length === 1 ? 'day' : `${days.length} days`} of it.` : 'Nothing written down yet.'}</p>
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
    const fresh = S.bucket.find((b) => b.k === k && b.age === 0);
    if (fresh) fresh.n += n;
    else S.bucket.push({ k, n, age: 0 });
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
  // On the shed shelf, in the light off the window. Under cover, so anything grows in any
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
    diary(`Sowed ${varPlural(k)}. ${FLOWERS[flowerOf(k)].days} days, if I remember the can.`);
    closeSheet();
    save();
    render();
  }

  function openSowSheet(i) {
    let html = '<h2>An empty pot</h2><p>Anything grows under the glass, in any season, but only from seed you have. Seed comes from the catalogue, and now and then off your own plants when you cut them.</p>';
    if (!S.packets.length) html += '<p class="ink">No packets on the table. The seed catalogue is up in the corner.</p>';
    html += '<div class="options">';
    for (const p of S.packets) {
      const f = FLOWERS[flowerOf(p.k)];
      html += `<button class="opt packet" data-sow="${p.k}">
        <span class="icon">${pic(p.k)}</span>
        <span><span class="t">${esc(varName(p.k))}${p.n > 1 ? ` <span class="tiny-tag">×${p.n}</span>` : ''}</span><br><span class="d">${esc(meaningOf(p.k))} · ${f.days} days to the first cut, then every ${regrowDays(p.k)} · ${f.yield[0]}–${f.yield[1]} stems</span></span>
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
      : `Growing. ${left} day${left === 1 ? '' : 's'} until ${p.picks ? 'the next cut' : 'the first cut'}.`;
    const water = p.dry === 0 ? 'Watered today.' : p.dry === 1 ? 'Fine for now. Water it tomorrow.' : 'Thirsty. It will wilt tonight without a drink.';
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

  // On the painted plate a pot is drawn whole: a bare pot, a sprout set in one, then one
  // of Amber's potted plants, and the flower itself tucked in on top once it is out.
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
      const state = p.wilted ? 'wilted' : ripe ? 'cut me' : p.dry >= 2 ? 'thirsty' : `${left}d to go`;
      const name = varName(p.crop);
      const title = p.wilted ? `${name}, wilted. Water it.` : ripe ? `${name}, in flower. Click to cut.` : `${name}, ${left} day${left === 1 ? '' : 's'} to go. Soil ${wet === 'wet' ? 'watered' : wet}.`;
      return `<button class="pot stage-${stage} ${wet}${p.wilted ? ' wilted' : ''}${ripe ? ' ripe' : ''}" data-pot="${i}" title="${esc(title)}">
        ${potArt(p, i, stage)}<span class="plant">${plant}</span><span class="pot-body"><i class="soil"></i></span>
        <span class="pot-name">${esc(name)}</span><span class="pot-state">${state}</span></button>`;
    }).join('');
    $('pots').querySelectorAll('[data-pot]').forEach((el) => el.addEventListener('click', (e) => { e.stopPropagation(); potClick(Number(el.dataset.pot)); }));
    const can = $('can');
    can.classList.toggle('lifted', carrying);
    can.title = carrying ? 'Put the can down' : 'Watering can. Click to pick it up.';
  }

  // ---------- the shop ----------
  // Turn the sign and they come up the path one at a time. Nobody is in a hurry: a
  // customer stands at the door until you have made their flowers or said you can't.

  const customersToday = () => clamp(3 + Math.floor(S.rep / 25) - (ROUGH.includes(S.weather) ? 1 : 0), 2, 7);

  function openShop() {
    if (S.shop.open || S.shop.done) return;
    S.shop.open = true;
    S.shop.left = customersToday();
    S.shop.total = S.shop.left;
    markGoal('open');
    diary(pick(['Turned the sign to Open.', 'Propped the door and turned the sign.', 'Open for business, such as it is.']));
    save();
    render();
    setTimeout(nextCustomer, 900);
  }

  function closeShop(early) {
    S.shop.open = false;
    S.shop.done = true;
    S.shop.cust = null;
    S.notes = S.notes.filter((n) => !n.order);
    if (early) diary('Turned the sign back round early.');
    save();
    render();
  }

  function nextCustomer() {
    if (!S.shop.open || S.shop.cust) return;
    if (S.shop.left <= 0) {
      diary(pick(['That was the last of them. Turned the sign back round.', 'Nobody else up the path. Closed up.']));
      closeShop(false);
      return;
    }
    S.shop.left -= 1;
    S.shop.cust = newOrder();
    toast(`${S.shop.cust.face} Somebody at the door.`);
    save();
    render();
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
    const nExtra = S.dayCount <= 2 ? 0 : S.dayCount <= 5 ? rnd(2) : rnd(3);
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
      else if (t === 'big' && S.vases.jug + S.vases.urn <= 0) continue;
      if (t !== 'big' && t !== 'small' && !v) continue;
      // don't ask for a thing and forbid it in the same breath, nor all-white and a rose that isn't
      if (v && extras.some((x) => x.v === v)) continue;
      if (t === 'allColour' && extras.some((x) => x.t === 'hasFlower' && !FLOWERS[x.v].colours.includes(v))) continue;
      if (t === 'hasFlower' && extras.some((x) => x.t === 'allColour' && !FLOWERS[v].colours.includes(x.v))) continue;
      extras.push({ t, v });
    }
    return { id: uid(), who, face, regular: regular ? regular.id : null, want, extras, story: want ? pick(ASKS[want]) : 'Just something nice. You choose. I trust you.', accepted: false };
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

  function doorClick() {
    if (held === 'can') { held = null; render(); }
    if (S.shop.cust) { openOrderSheet(); return; }
    if (S.shop.open) { toast('Nobody at the door just now.'); return; }
    if (S.shop.done) {
      openSheet('<h2>Closed</h2><p class="lead ink">The sign\'s turned round for today. The shelf will do its bit overnight.</p><div class="foot"><button class="primary" id="sheet-cancel">Right</button></div>');
      $('sheet-cancel').addEventListener('click', closeSheet);
      return;
    }
    const n = customersToday();
    const stems = S.bucket.reduce((a, b) => a + b.n, 0);
    openSheet(`<h2>Turn the sign?</h2>
      <p class="lead ink">${ROUGH.includes(S.weather) ? 'Rough out. Fewer people will come up the lane for flowers today.' : S.weather === 'sunny' ? 'A good day for it.' : 'Fair enough out.'} Expect ${NUMW[n]} or so.</p>
      <p>${stems ? `${stems} stem${stems === 1 ? '' : 's'} in the bucket.` : 'The bucket is empty. Cut something off the shelf first, or nobody gets anything.'} Customers come one at a time and wait while you work. Once the sign's round it stays round until the last of them has gone.</p>
      <div class="foot"><button id="sheet-cancel">Not yet</button><button class="primary" id="shop-open">Open the shop</button></div>`);
    $('sheet-cancel').addEventListener('click', closeSheet);
    $('shop-open').addEventListener('click', () => { closeSheet(); openShop(); });
  }

  function openOrderSheet() {
    const o = S.shop.cust;
    const reg = o.regular ? FOLK.find((f) => f.id === o.regular) : null;
    const said = `${o.story}${o.extras.length ? ` ${o.extras.map((x) => EXTRA_SAY[x.t](x.v)).join(' ')}` : ''}`;
    if (!o.said) o.said = said; // said once, and the same again if you ask
    let html = `<h2>${ink(o.face)} ${esc(o.who)}</h2>
      ${reg ? `<p class="ink">${esc(reg.hi)}${S.folk[reg.id].visits ? '' : ' First time in the shop.'}</p>` : ''}
      <div class="speech">"${esc(o.said)}"</div>
      ${ticketHtml(o)}`;
    html += o.accepted
      ? `<p>Take a vase down off the shelf and make it up.</p>
        <div class="foot"><button id="order-no">Say you can't</button><button class="primary" id="sheet-cancel">Back to it</button></div>`
      : `<p>${S.bucket.length ? 'Take the order, then take a vase down off the shelf.' : 'The bucket is empty. You could take it and cut something first, or say you can\'t.'}</p>
        <div class="foot"><button id="order-no">Sorry, not today</button><button class="primary" id="order-yes">I'll make that</button></div>`;
    openSheet(html);
    $('sheet-cancel')?.addEventListener('click', closeSheet);
    $('order-yes')?.addEventListener('click', () => {
      o.accepted = true;
      S.notes.push({ id: uid(), text: `${o.who} — ${ticketLine(o)}`, done: false, order: o.id });
      closeSheet();
      save();
      render();
      toast('Order on the pinboard. Take a vase down off the shelf.');
    });
    $('order-no').addEventListener('click', () => {
      diary(`${o.who} wanted ${o.want ? `something that said ${TAGS[o.want].toLowerCase()}` : 'something nice'}, and I had to say I couldn't. They were decent about it.`, 'bad');
      S.stats.turnedAway += 1;
      bumpRep(-1);
      S.notes = S.notes.filter((n) => n.order !== o.id);
      S.shop.cust = null;
      closeSheet();
      save();
      render();
      setTimeout(nextCustomer, 1400);
    });
  }

  // The order as the words on the ticket.
  const ticketLine = (o) => orderChecks(o, []).map((c) => c.label.toLowerCase()).join(', ') || 'anything nice';
  // The order as a list, ticked against a bunch if there is one.
  function ticketHtml(o, stems) {
    const checks = orderChecks(o, stems || []).map((c) => (stems ? c : { ...c, ok: null }));
    if (!o.want) checks.unshift({ id: 'free', label: 'Anything nice, your choice', ok: stems ? stems.length > 0 : null });
    return `<ul class="ticket-list">${checks.map((c) => `<li class="${c.ok === null ? '' : c.ok ? 'ok' : 'no'}${c.hard ? ' hard' : ''}">
      <span class="tk-mark">${c.ok === null ? '·' : c.ok ? '✓' : '✗'}</span>${esc(c.label)}${c.id === 'want' && stems && stems.length ? ` <span class="tk-fit">${c.great ? 'clearly' : c.ok ? 'more or less' : 'not really'}</span>` : ''}</li>`).join('')}</ul>`;
  }

  // ---------- making it up ----------

  let draft = null; // { vase, stems: [] } while a vase is down off the shelf being filled

  const draftLeft = (k) => inBucket(k) - draft.stems.filter((s) => s === k).length;

  function vaseClick(vid) {
    if (held === 'can') { toast('Put the can down first.'); return; }
    const o = S.shop.cust;
    if (!o || !o.accepted) {
      toast(o ? 'Hear what they want first. They\'re at the door.' : S.shop.open ? 'Nobody\'s ordered anything yet.' : 'Nobody\'s ordered anything. Click the door to turn the sign.');
      return;
    }
    if (S.vases[vid] <= 0) { toast(`No ${VASES[vid].name.toLowerCase()}s left. The catalogue has more.`); return; }
    draft = { vase: vid, stems: [] };
    openArrangeSheet();
  }

  // What the bunch says, as bars: the three loudest things in it.
  function readoutHtml(stems) {
    const w = readBunch(stems);
    const total = Object.values(w).reduce((a, b) => a + b, 0);
    const top = Object.entries(w).sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (!top.length) return '<p class="says quiet">It says nothing yet.</p>';
    return `<div class="says"><span class="says-t">It says</span>${top.map(([t, n]) =>
      `<span class="says-row"><span class="says-nm">${esc(TAGS[t])}</span><span class="says-bar"><i style="width:${Math.round((n / total) * 100)}%"></i></span></span>`).join('')}</div>`;
  }

  function openArrangeSheet() {
    const o = S.shop.cust;
    const vid = draft.vase;
    const v = VASES[vid];
    const keys = bucketKeys();
    const n = draft.stems.length;
    const full = n >= v.holds;
    let html = `<h2>${esc(v.name)} <span class="tiny-tag">for ${esc(mid(o.who))}</span></h2>
      <div class="arr">
        <div class="arr-vase">${vaseSvg(vid, draft.stems, true)}</div>
        <div class="arr-side">
          <p class="arr-count"><b>${n}</b> of ${NUMW[v.holds]} stems${full ? ' · full' : ''}</p>
          ${ticketHtml(o, draft.stems)}
          ${readoutHtml(draft.stems)}`;
    if (!keys.length) {
      html += '<p class="ink">The bucket is empty. Cut something off the shelf, then come back to it.</p>';
    } else {
      html += '<div class="chips arr-chips">';
      for (const k of keys) {
        const left = draftLeft(k);
        html += `<button class="chip flower${tiredIn(k) ? ' tired' : ''}" data-add="${k}" ${left && !full ? '' : 'disabled'} title="${esc(`${varName(k)}: ${meaningOf(k)}.${tiredIn(k) ? ' Some of these are going over.' : ''}`)}">
          <span class="ico">${pic(k)}</span> ${esc(varName(k))} <b>${left}</b></button>`;
      }
      html += `</div><p class="arr-hint">${full ? 'Full. Click a stem in the vase to take it out.' : 'Click a flower to stand a stem in the vase; click a stem to take it back out. Hover a flower to see what it means.'}</p>`;
    }
    html += `</div></div>
      <div class="foot"><button id="sheet-cancel">Put the vase back</button>
      <button class="primary" id="arr-give" ${n ? '' : 'disabled'}>Hand it over</button></div>`;
    openSheet(html);
    const sh = $('sheet');
    sh.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => addToDraft(b.dataset.add)));
    sh.querySelectorAll('[data-stem]').forEach((g) => g.addEventListener('click', () => {
      draft.stems.splice(Number(g.dataset.stem), 1);
      openArrangeSheet();
    }));
    $('sheet-cancel').addEventListener('click', () => { draft = null; closeSheet(); });
    $('arr-give').addEventListener('click', handOver);
  }
  function addToDraft(k) {
    if (!draft || draft.stems.length >= VASES[draft.vase].holds || draftLeft(k) <= 0) return;
    draft.stems.push(k);
    openArrangeSheet();
  }

  const REACT = [
    ['They looked at it for a long moment and paid for it without a word.', 'Polite. Very polite. You could hear the effort.', '"...Right. Well. Thank you."'],
    ['"That\'ll do." It will, just about.', '"It\'s not quite what I pictured, but it\'s nice."', 'A nod, and the right money, and no more.'],
    ['"Oh, that\'s lovely."', '"That\'s just right, that is."', 'They held it up to the light from the door and smiled.'],
    ['"Oh." And then nothing, because they were trying not to cry.', '"How did you know?" You didn\'t, exactly. You read the flowers.', 'They said thank you three times and left a tip in the jar.'],
  ];

  function handOver() {
    const o = S.shop.cust;
    if (!o || !draft || !draft.stems.length) return;
    const counts = {};
    for (const k of draft.stems) counts[k] = (counts[k] || 0) + 1;
    if (Object.entries(counts).some(([k, n]) => inBucket(k) < n)) { toast('Fewer stems in the bucket than that.'); return; }
    const vid = draft.vase;
    const stems = draft.stems.slice();
    const droopy = takeStems(counts, true) >= STEM_DROOP;
    const res = judge(o, stems, vid, droopy);
    takeStems(counts);
    S.vases[vid] -= 1;
    const tip = res.stars === 3 ? 1 + rnd(4) + (o.regular ? 2 : 0) : 0;
    S.coins += res.pay + tip;
    S.stats.served += 1;
    S.stats.stars += res.stars;
    S.stats.earned += res.pay + tip;
    bumpRep([-4, -1, 2, 4][res.stars]);
    if (o.regular) { S.folk[o.regular].visits += 1; S.folk[o.regular].stars += res.stars; }
    S.notes = S.notes.filter((n) => n.order !== o.id);
    S.shop.cust = null;
    draft = null;
    markGoal('serve');
    const line = pick(REACT[res.stars]);
    diary(`${o.who} ${o.want ? `wanted something that said ${TAGS[o.want].toLowerCase()}` : 'wanted something nice'}. Made up ${bunchText(stems)} in the ${VASES[vid].name.toLowerCase()}. ${line}`, res.stars >= 2 ? 'good' : 'bad');
    save();
    render();
    // how it went, in stars and in the tin
    const missedWant = res.checks.some((c) => c.id === 'want' && !c.great);
    openSheet(`<h2>${ink(o.face)} ${esc(o.who)}</h2>
      <div class="arr arr-done"><div class="arr-vase">${vaseSvg(vid, stems)}</div>
      <div class="arr-side">
        <p class="stars" aria-label="${res.stars} of 3 stars">${'★'.repeat(res.stars)}<span class="off">${'★'.repeat(3 - res.stars)}</span></p>
        <p class="lead ink">${esc(line)}</p>
        ${ticketHtml(o, stems)}
        ${droopy ? '<p class="ink">Some of those stems were going over.</p>' : ''}
        <p class="paid">🪙 ${res.pay}${tip ? ` and ${tip} in the tip jar` : ''}</p>
        ${res.stars < 3 ? `<p class="arr-hint">${missedWant ? 'The Language of Flowers on the table says what each one means.' : res.checks.some((c) => !c.ok) ? 'Mind what they asked for.' : 'A fuller vase, or more than one kind in it, is a proper bunch.'}</p>` : ''}
      </div></div>
      <div class="foot"><button class="primary" id="sheet-cancel">${S.shop.left > 0 ? 'Next, please' : 'That\'s everyone'}</button></div>`);
    $('sheet-cancel').addEventListener('click', () => { closeSheet(); setTimeout(nextCustomer, 900); });
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
        html += `<button class="opt packet" data-buy-seed="${k}" ${can(fl.seed) ? '' : 'disabled'}>
          <span class="icon">${pic(k)}</span>
          <span><span class="t">${esc(varName(k))}${packetFor(k) ? ` <span class="tiny-tag">×${packetFor(k).n} on the table</span>` : ''}</span><br><span class="d">${esc(meaningOf(k))} · ${fl.days} days</span></span>
          <span class="r ${can(fl.seed) ? 'good' : ''}">🪙 ${fl.seed}</span></button>`;
      }
    }
    html += '</div><h3>Vases</h3><div class="options">';
    for (const vid of VASE_ORDER) {
      const v = VASES[vid];
      html += `<button class="opt" data-buy-vase="${vid}" ${can(v.price) ? '' : 'disabled'}>
        <span class="icon vase-ico">${vaseSvg(vid, [])}</span>
        <span><span class="t">${esc(v.name)} <span class="tiny-tag">${S.vases[vid]} on the shelf</span></span><br><span class="d">Holds ${NUMW[v.holds]}. Goes out with the flowers, and the customer pays for it.</span></span>
        <span class="r ${can(v.price) ? 'good' : ''}">🪙 ${v.price}</span></button>`;
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
    sh.querySelectorAll('[data-buy-vase]').forEach((b) => b.addEventListener('click', () => {
      const vid = b.dataset.buyVase;
      buy(VASES[vid].price, () => { S.vases[vid] += 1; });
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

  // ---------- night ----------

  const NIGHT_LINES = [
    'Lamp out. The lane goes quiet.',
    'Counted the tin twice. Same answer.',
    'Read four pages and gave up.',
    'Changed the water in the bucket.',
    'An owl somewhere, being obvious about it.',
    'Boots by the door, can filled for the morning.',
  ];
  const NIGHT_WEATHER = {
    rain: 'Rain on the shed roof, all the way down into sleep.',
    frost: 'Frost coming down hard. The glass holds its warmth.',
    heat: 'Too warm to sleep with the window shut.',
    windy: 'The gate complaining in the wind, on and off, all night.',
    fog: 'Fog pressed up against the glass. Not a sound from the lane.',
    storm: 'Thunder rolling round the valley. Counted the seconds, lost count.',
    sleet: 'Sleet ticking on the window, half a mind to be snow.',
  };

  let bedBusy = false;
  function goToBed() {
    if (!S || bedBusy) return;
    if (S.shop.cust) { toast('There\'s somebody at the door still.'); return; }
    bedBusy = true;
    const el = $('night');
    const w = NIGHT_WEATHER[S.weather];
    $('night-line').textContent = w && Math.random() < 0.6 ? w : pick(NIGHT_LINES);
    $('night-day').textContent = '';
    $('night-day').classList.remove('in');
    $('btn-sleep').disabled = true;
    el.classList.remove('hidden');
    requestAnimationFrame(() => el.classList.add('on'));
    setTimeout(() => {
      sleep();
      const now = WEATHER[S.weather];
      $('night-day').textContent = `${dayLabel()} · ${now.icon} ${now.name}`;
      $('night-day').classList.add('in');
    }, 700);
    setTimeout(() => el.classList.remove('on'), 1850);
    setTimeout(() => {
      el.classList.add('hidden');
      $('btn-sleep').disabled = false;
      bedBusy = false;
    }, 2350);
  }

  function sleep() {
    if (!S.shop.done && !S.shop.open) diary(pick(['Never turned the sign today.', 'Kept the shop shut and pottered.']));
    if (S.shop.open) closeShop(true);

    // pots: under cover, so no rain and no frost, but they still dry out (twice as fast in a heatwave)
    const heat = S.weather === 'heat';
    for (const p of S.pots) {
      if (!p.crop) continue;
      if (p.dry <= 1 && !p.wilted && p.progress < FLOWERS[flowerOf(p.crop)].days) p.progress += 1;
      p.dry += heat ? 2 : 1;
      if (p.dry >= 5) {
        diary(`The ${varPlural(p.crop)} are past saving. Tipped them on the compost.`, 'bad');
        Object.assign(p, emptyPot());
      } else if (p.dry >= 3 && !p.wilted) {
        p.wilted = true;
        diary(`The ${varPlural(p.crop)} have wilted. They want water today.`, 'bad');
      }
    }

    // the bucket: stems droop, then go
    for (const b of S.bucket) b.age += 1;
    const gone = S.bucket.filter((b) => b.age >= STEM_DEAD);
    if (gone.length) diary(`Tipped ${bunchText(gone.flatMap((b) => Array(b.n).fill(b.k)))} out of the bucket. Too far gone to sell.`, 'bad');
    S.bucket = S.bucket.filter((b) => b.age < STEM_DEAD);

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
    S.shop = { open: false, done: false, left: 0, cust: null };
    S.notes = S.notes.filter((n) => !n.order);
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

  function openIntro(existing) {
    let html = `<h2>The Garden Shed</h2>
      <p class="lead ink">A potting shed at the end of a lane, a shelf of pots in flower, four kinds of vase, and a door people come to when they need to say something and can't find the words.</p>
      <p>Grow the flowers. When somebody comes to the door, listen to what they want to say, and say it for them in a vase. Every flower means something, and so does every colour.</p>`;
    if (existing) {
      html += `<p class="ink">The shop is <strong>${esc(existing.name)}</strong>'s: ${SEASONS[existing.season].toLowerCase()} of year ${existing.year}, day ${existing.day}.</p>
        <div class="foot"><button id="intro-new">Start fresh</button><button class="primary" id="intro-continue">Open up again</button></div>`;
    } else {
      html += `<label class="label" for="intro-cottager">Whose shop is it?</label>
        <input type="text" id="intro-cottager" name="cottager" maxlength="20" placeholder="Rosemary" autocomplete="off" autocapitalize="words" spellcheck="false" data-lpignore="true" data-1p-ignore data-form-type="other" />
        <div class="foot"><button class="primary" id="intro-begin">Take the key</button></div>`;
    }
    openSheet(html);
    if (existing) {
      $('intro-continue').addEventListener('click', () => { S = existing; closeSheet(); render(); });
      $('intro-new').addEventListener('click', () => openIntro(null));
    } else {
      const begin = () => {
        S = freshState($('intro-cottager').value.trim() || 'You');
        diaryDay();
        diary('Took the key to the shed at the end of the lane. The last one left it going: six pots in flower, a bucket, a watering can with a dent in it.');
        diary('Four kinds of vase on the shelf by the door, and a book on the table called The Language of Flowers.');
        diary('Cut what is out, turn the sign on the door, and see who comes.');
        save();
        closeSheet();
        render();
      };
      $('intro-begin').addEventListener('click', begin);
      $('intro-cottager').addEventListener('keydown', (e) => { if (e.key === 'Enter') begin(); });
      setTimeout(() => $('intro-cottager').focus(), 50);
    }
  }

  function openHelp() {
    openSheet(`<h2>How to play</h2>
      <p class="lead ink">Grow flowers, and sell them to people who want to say something with them.</p>
      <h3>The morning</h3>
      <ul>
        <li>The pots on the shelf grow a night at a time. <strong>Pick up the can and click a pot</strong> to water it; left dry, a plant wilts, then dies. Heatwaves dry them twice as fast.</li>
        <li><strong>Click a pot in flower to cut it.</strong> The stems go in the bucket on the table, and the plant grows back from half-way. Stems keep a few days, droop, then go on the compost.</li>
        <li>Sow an empty pot from a seed packet on the table. Packets come from the <strong>catalogue</strong> (top right), and sometimes off your own plants.</li>
      </ul>
      <h3>The shop</h3>
      <ul>
        <li><strong>Click the door</strong> to turn the sign. Customers come one at a time and wait while you work. Click whoever is at the door to hear what they want.</li>
        <li>Take the order, then <strong>click a vase</strong> on the shelf. Click a flower to stand a stem in it; click a stem to take it out. The ticket ticks itself off as you go, and the bars show what the bunch is saying.</li>
        <li><strong>Every flower says one thing, and its colour something quieter</strong>: a flower counts twice what its colour does. The Language of Flowers on the table has them all.</li>
        <li>Stars: up to two for saying the right thing, one more for a proper bunch (a full vase, or more than one kind). Anything they said it had to have, or had to not, keeps you to one star if you miss it. A size they asked for, or tired stems, cost a star.</li>
        <li>More stars, more people talk: more customers a day, and new seed in the catalogue.</li>
      </ul>
      <h3>Money</h3>
      <ul>
        <li>A bunch sells for its stems and its vase, more for more stars, and a happy customer tips. Spend it on seed, vases and more pots.</li>
      </ul>
      <div class="foot"><button id="help-reset">Start again</button><button class="primary" id="sheet-cancel">Back</button></div>`);
    $('sheet-cancel').addEventListener('click', closeSheet);
    $('help-reset').addEventListener('click', () => {
      if (confirm('Throw away this shop and start again?')) {
        try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
        openIntro(null);
      }
    });
  }

  function openJotSheet() {
    openSheet(`<h2>📝 Jot a note</h2><p>Something to remember. It goes on the pinboard until you tick it off.</p>
      <input type="text" id="jot-text" maxlength="48" placeholder="More white for funerals" autocomplete="off" />
      <div class="foot"><button id="sheet-cancel">Never mind</button><button class="primary" id="jot-ok">Pin it up</button></div>`);
    const ok = () => {
      const t = $('jot-text').value.trim();
      if (!t) { toast('Write something first.'); return; }
      S.notes.push({ id: uid(), text: t, done: false });
      closeSheet();
      save();
      render();
    };
    $('jot-ok').addEventListener('click', ok);
    $('jot-text').addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
    $('sheet-cancel').addEventListener('click', closeSheet);
    setTimeout(() => $('jot-text').focus(), 50);
  }

  // ---------- render ----------

  function renderBucket() {
    const keys = bucketKeys();
    const el = $('pantry');
    el.innerHTML = keys.length
      ? keys.map((k) => {
        const n = inBucket(k);
        const title = `${varName(k)} · ${n} stem${n === 1 ? '' : 's'}. ${meaningOf(k)}.${tiredIn(k) ? ' Some are going over.' : ''}`;
        return `<button class="counter-item flower${tiredIn(k) ? ' tired' : ''}" data-stems="${k}" title="${esc(title)}">
          <span class="ico">${pic(k)}</span><span class="nm">${esc(varName(k))}</span><span class="n">${n}</span></button>`;
      }).join('')
      : '<span class="counter-empty">An empty bucket. Cut something off the shelf.</span>';
    el.querySelectorAll('[data-stems]').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      const k = b.dataset.stems;
      if (draft && !$('overlay').classList.contains('hidden')) { addToDraft(k); return; }
      toast(`${varName(k)}: ${meaningOf(k).toLowerCase()}.`);
    }));
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
      const n = S.vases[vid];
      const title = `${v.name}, holds ${NUMW[v.holds]}. ${n ? `${n} on the shelf.` : 'None left.'} Click to make up an order in one.`;
      return `<button class="vase v-${vid}${n ? '' : ' none'}" data-vase="${vid}" title="${esc(title)}" aria-label="${esc(title)}">
        ${vaseSvg(vid, [])}<span class="vase-n">${n}</span><span class="vase-nm">${esc(v.name)}</span></button>`;
    }).join('');
    el.querySelectorAll('[data-vase]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); vaseClick(b.dataset.vase); }));
  }

  // The door: the sign, and whoever is stood in it.
  function renderDoor() {
    const c = S.shop.cust;
    const sign = $('door-sign');
    sign.textContent = S.shop.open ? 'Open' : 'Closed';
    sign.classList.toggle('open', S.shop.open);
    const el = $('customer');
    el.innerHTML = c ? `<span class="cust-face">${c.face}</span><span class="cust-bubble">${c.accepted ? '…' : 'Hello?'}</span>` : '';
    el.classList.toggle('here', !!c);
    $('btn-door').title = c ? `${c.who}. Click to hear what they want.` : S.shop.open ? 'Waiting for the next one' : S.shop.done ? 'Closed for today' : 'Turn the sign to Open';
    $('door-lb').textContent = c ? (c.accepted ? 'their order' : 'someone’s here') : S.shop.open ? 'open' : S.shop.done ? 'closed' : 'open up';
  }

  function renderTicket() {
    const c = S.shop.cust;
    const el = $('ticket');
    el.classList.toggle('on', !!(c && c.accepted));
    el.innerHTML = c && c.accepted
      ? `<span class="tk-who">${esc(c.who)}</span>${ticketHtml(c)}`
      : `<span class="tk-who quiet">${S.shop.open ? (c ? 'At the door…' : 'Waiting on the next one') : S.shop.done ? 'Closed for today' : 'No orders yet'}</span>`;
  }

  function renderNotes() {
    const el = $('sill');
    el.innerHTML = S.notes.map((o, i) => `<div class="sill-item note${o.done ? ' done' : ''}${o.order ? ' order' : ''}" style="--tilt:${((i * 7) % 5) - 2}deg" title="${o.order ? 'An order. It comes down when it is done.' : 'A note. Tick it off; tick it again to throw it away.'}">
      ${o.order ? '' : `<button class="tick" data-tick="${i}" title="${o.done ? 'Throw it away' : 'Tick it off'}">${o.done ? '✓' : ''}</button>`}<span class="txt">${esc(o.text)}</span></div>`).join('')
      || '<span class="sill-empty">Nothing pinned up yet.</span>';
    el.querySelectorAll('[data-tick]').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      const i = Number(b.dataset.tick);
      if (S.notes[i].done) S.notes.splice(i, 1);
      else S.notes[i].done = true;
      save();
      render();
    }));
    el.querySelectorAll('.sill-item.order').forEach((n) => n.addEventListener('click', (e) => { e.stopPropagation(); if (S.shop.cust) openOrderSheet(); }));
  }

  function renderGoals() {
    const t = S.flags.goals;
    $('goals').classList.toggle('hidden', !!S.flags.goalsDone);
    document.querySelectorAll('#goals [data-goal]').forEach((li) => li.classList.toggle('done', !!t[li.dataset.goal]));
  }

  // A sun that rides the day across the doorway, by how much of the shop is left.
  function renderSun() {
    const sun = $('sky-sun');
    const t = S.shop.done ? 0.95 : S.shop.open ? 0.35 + 0.55 * (1 - S.shop.left / Math.max(1, S.shop.total || 1)) : 0.15;
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
    $('hud-actions').innerHTML = `<span class="who">${esc(S.name)}</span><span class="coins" title="In the tin">🪙 ${S.coins}</span><span class="rep" title="What the lane thinks of the shop">${esc(repWord())}</span>`;
    $('btn-sleep').classList.toggle('glow', S.shop.done);
    $('sill-scene').dataset.weather = S.weather;

    renderSun();
    renderPots();
    renderBucket();
    renderPackets();
    renderVases();
    renderDoor();
    renderTicket();
    renderNotes();
    renderGoals();

    const ready = S.pots.filter(potRipe).length;
    const thirsty = S.pots.filter((p) => p.crop && !p.wilted && p.dry >= 2).length;
    const wilted = S.pots.filter((p) => p.crop && p.wilted).length;
    const c = S.shop.cust;
    $('sill-note').textContent = held === 'can'
      ? 'Carrying the can. Click a pot to water it, or the can to put it down.'
      : c ? (c.accepted ? `Making up ${mid(c.who)}'s order. Take a vase down off the shelf.` : `${c.who} is at the door. Click the door.`)
        : [
          ready ? `${ready} pot${ready === 1 ? '' : 's'} in flower to cut.` : '',
          wilted ? `${wilted} wilted, water ${wilted === 1 ? 'it' : 'them'}.` : '',
          thirsty ? `${thirsty} will wilt tonight without water.` : '',
          S.shop.done ? 'Shop closed. Bed, when you like.' : S.shop.open ? 'Waiting on the next customer.' : 'Click the door to open the shop.',
        ].filter(Boolean).join(' ');
  }

  // ---------- boot ----------

  $('btn-sleep').addEventListener('click', goToBed);
  $('btn-cook').addEventListener('click', () => { if (S) openBook(); });
  $('btn-shop').addEventListener('click', () => { if (S) openCatalogue(); });
  $('btn-help').addEventListener('click', openHelp);
  $('btn-diary').addEventListener('click', () => { if (S) openDiary(); });
  $('btn-jot').addEventListener('click', (e) => { e.stopPropagation(); if (S) openJotSheet(); });
  $('ticket').addEventListener('click', (e) => { e.stopPropagation(); if (S && S.shop.cust) openOrderSheet(); });
  $('goals-hide').addEventListener('click', () => { if (!S) return; S.flags.goalsDone = true; save(); render(); });
  $('btn-door').addEventListener('click', (e) => { e.stopPropagation(); if (S) doorClick(); });
  $('can').addEventListener('click', (e) => { e.stopPropagation(); if (S) takeCan(); });
  $('sill-scene').addEventListener('click', () => { if (held === 'can') { held = null; render(); } });
  const sheetPinned = () => !!($('intro-begin') || $('intro-continue'));
  $('overlay').addEventListener('click', (e) => {
    if (e.target === $('overlay') && S && !sheetPinned()) { draft = null; closeSheet(); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !S) return;
    if (held !== null) { held = null; render(); return; }
    if (!$('overlay').classList.contains('hidden') && !sheetPinned()) { draft = null; closeSheet(); }
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

  const existing = load();
  if (existing) { S = existing; render(); }
  openIntro(existing);

  // Debug handle for tests: the live state and the verbs, so a case can play a customer
  // without clicking at the plate.
  window.__gardenShed = {
    get S() { return S; }, FLOWERS, COLOURS, TAGS, VASES, FOLK,
    render, sleep, openShop, nextCustomer, newOrder, cutPot, vaseClick, addToDraft, handOver,
    readBunch, fitFor, judge, orderChecks, vkey, save,
    // a new shop in place of whatever is loaded, since cases share one page
    fresh(name) { S = freshState(name || 'Test'); held = null; draft = null; closeSheet(); render(); return S; },
  };
})();
