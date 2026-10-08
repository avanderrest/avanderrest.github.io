/* The Garden Shed: the rules. A flower shop in a potting shed: grow flowers in the
   garden, make them up in the shed, and sell them at the stall to people who want to say
   something with them. Every flower means something, and so does every colour.

   Everything that changes the shop lives here and nothing touches the page. view.js draws
   the garden, the shed and the stall and calls these verbs; tests play it in Node.

     const shop = createShed({ saved, rnd, on })
       on(event, data):
         'changed'      the shop changed; save it and redraw
         'toast' text   a passing remark for the corner of the screen
         'soon' ms      somebody should come up the lane in about ms (or the usual gap if
                        null); the lane's clock is wall time, so the view keeps it
         'go' place     move the player to 'view-sill' / 'view-stall'

   The diary (S.diary) is where what happened is written down; toasts are only for what
   wants doing now. */

// ---------- constants ----------
export const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];
const DAYS_PER_SEASON = 7;
export const POT_MAX = 8;
export const POT_PRICE = 20;
// A cut stem ages a step every DAY_SLOTS customer slots from when it was cut, on its own
// clock, not the calendar's.
export const STEM_DROOP = 3;     // steps before a stem starts to look tired
const STEM_DEAD = 5;      // ...and before it goes on the compost
const REP_START = 10;
// The garden keeps customer time: a growing spell passes every GROW_EVERY customers, and
// every time the lane would have sent somebody while the stall was closed.
export const GROW_EVERY = 2;
export const DAY_SLOTS = 6;      // customer slots to a day
export const MADE_MAX = 4;       // arrangements that fit on the stall, set aside for later

// What a bouquet can say. Every flower says one of these loudly and every colour one of
// them quietly (FLOWER_W and COLOUR_W): a white rose is love, said solemnly.
export const TAGS = {
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

export const COLOURS = {
  red:    { name: 'red',    tag: 'love',      m: '#c9374f', d: '#7e1e31', l: '#e0566b' },
  pink:   { name: 'pink',   tag: 'thanks',    m: '#ec9cc0', d: '#b9579a', l: '#f6c6dc' },
  yellow: { name: 'yellow', tag: 'cheer',     m: '#f2c53a', d: '#b8861c', l: '#f8dc7a' },
  white:  { name: 'white',  tag: 'sympathy',  m: '#f7f2e6', d: '#a99f88', l: '#ffffff' },
  purple: { name: 'purple', tag: 'calm',      m: '#8b6fc6', d: '#5a4390', l: '#a993dc' },
  blue:   { name: 'blue',   tag: 'remember',  m: '#6f95d8', d: '#3d5f9e', l: '#9cb8ea' },
  orange: { name: 'orange', tag: 'celebrate', m: '#ec8a3c', d: '#b8522a', l: '#f5ad6c' },
};

// The flowers, roughly after the Victorian books. `seed` is a packet's price in the
// catalogue; a stem sells for about half that. `rep` is the reputation at which the seed
// merchant starts carrying it. A `spike` stands up from its stem, not across it.
export const FLOWERS = {
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

// Four vases, as many of each as you like: a vase adds its `price` to the bill, but never
// runs out. The flowers are what is finite, because you have to grow them. Each is drawn
// in a 120x160 box standing on its foot at y=158; `mouth` is where the stems go in,
// `spread` how far they lean out.
export const VASES = {
  bottle: { name: 'Stoneware bottle',   holds: 2, price: 2, mouth: 90,  lip: 4,  spread: 20, reach: 70 },
  jar:    { name: 'Jam jar',            holds: 3, price: 1, mouth: 107, lip: 12, spread: 30, reach: 64 },
  jug:    { name: 'Blue-and-white jug', holds: 5, price: 4, mouth: 100, lip: 12, spread: 42, reach: 68 },
  urn:    { name: 'Terracotta urn',     holds: 7, price: 7, mouth: 104, lip: 18, spread: 54, reach: 70 },
};
export const VASE_ORDER = ['bottle', 'jar', 'jug', 'urn'];

// The lane's regulars: they come back, and they have a favourite.
export const FOLK = [
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

// What they come in asking, each with its own answer to "Who's it for?". The answer is
// null when the asking has already said, and then the question isn't offered at all.
const ASKS = {
  love:       [['It\'s our anniversary and I\'ve only just remembered.', 'My wife. Don\'t tell her I forgot.'],
               ['I\'m going to ask her tonight. Something that says so before I do.', 'Her name\'s Margaret. She doesn\'t know yet.'],
               ['Twenty years married on Sunday. Twenty years!', 'My wife. Twenty years and I still get it wrong.']],
  friendship: [['My best friend is moving to Leeds. Something she can take with her.', null],
               ['We fell out over nothing, years back. We\'re meeting for tea.', 'My oldest friend. We were at school together.'],
               ['For the lads at the bowls club. Don\'t make it soppy.', 'The lads. Well, the lads and Brenda.']],
  sorry:      [['I said something at dinner I shouldn\'t have.', 'My sister. I said something about her husband.'],
               ['I forgot her birthday. Completely. She was very nice about it, which is worse.', 'My wife. Thirty-one years and I forgot.'],
               ['I backed into his wall. He hasn\'t noticed yet.', 'My neighbour. It was a very good wall.']],
  thanks:     [['For my neighbour. She fed the cat all August.', null],
               ['For the nurse on ward six. She\'ll know why.', 'Carol. She\'ll say it was nothing.'],
               ['For the woman who found my wallet and posted it back.', null]],
  sympathy:   [['For a funeral on Thursday. Something proper.', 'For the service. He was my uncle.'],
               ['My friend\'s dog died. It was a very good dog.', 'Jean. She\'s had Rex since he was a puppy.'],
               ['For the family at number nine. They lost their dad.', null]],
  celebrate:  [['My sister\'s had the baby! A girl!', null],
               ['I passed my driving test. Fourth go.', 'Me, honestly. I earned it.'],
               ['The bakery\'s ten years old today.', 'Everyone at the bakery. Mostly the ovens.']],
  getwell:    [['Dad\'s in hospital. Something hopeful for the window.', null],
               ['My little boy has the chickenpox and is furious about it.', null],
               ['For a friend coming home after an operation.', 'Pat. New hip. Already complaining.']],
  remember:   [['It would have been Mum\'s birthday today.', null],
               ['For my brother\'s grave. I go every year.', null],
               ['Forty years since the lifeboat went down. For the memorial.', 'The crew. My grandad was one of them.']],
  cheer:      [['Something to brighten up a grey office.', 'Everyone in the office. Mostly Gerald.'],
               ['It\'s been a long winter. Something that isn\'t.', 'Me. It\'s been that sort of month.'],
               ['For the kitchen table. That\'s all. No reason.', null]],
  calm:       [['My wife has exams all week. Something for her desk.', null],
               ['For my mother. She doesn\'t sleep well.', null],
               ['The new baby won\'t settle. Something for the nursery. Not loud.', 'The baby. And me, if I\'m honest.']],
};
const ASK_ANY = ['Just something nice. You choose. I trust you.', 'Oh, it\'s for the house. Nobody in particular.'];

export const WEATHER = {
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
export const ROUGH = ['rain', 'frost', 'storm', 'sleet'];

// What you charge, on the board at the stall or per arrangement: a multiplier on the
// price, what it does to how pleased people go away (`sat`), and how likely somebody just
// browsing is to walk off at it (`balk`).
export const MARKUPS = [
  { id: 'cheap', name: 'Cheap',            mult: 0.8,  sat: 2,  balk: 0 },
  { id: 'fair',  name: 'Fair',             mult: 1,    sat: 0,  balk: 0.03 },
  { id: 'dear',  name: 'Dear',             mult: 1.25, sat: -2, balk: 0.12 },
  { id: 'steep', name: 'Steep',            mult: 1.6,  sat: -5, balk: 0.3 },
  { id: 'rob',   name: 'Daylight robbery', mult: 2,    sat: -9, balk: 0.6 },
];
export const markupOf = (id) => MARKUPS.find((m) => m.id === id) || MARKUPS[1];
const REP_WORDS = [[85, 'known three villages over'], [60, 'the shop people ask for'], [35, 'well thought of'], [15, 'getting known'], [0, 'new on the lane']];

// ---------- words (pure) ----------
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
export const NUMW = ['no', 'a', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
// a walk-in is 'A man in a wet coat' at the start of a sentence and 'a man...' in the middle of one
export const mid = (who) => (/^(A|An|The|Somebody)\b/.test(who) ? who.charAt(0).toLowerCase() + who.slice(1) : who);
export const listText = (parts) => parts.join(', ').replace(/, ([^,]*)$/, ' and $1');

// A variety is a flower in a colour: 'rose-red'. Flowers that only come in one colour go
// by their own name.
export const vkey = (f, c) => `${f}-${c}`;
export const flowerOf = (k) => k.split('-')[0];
export const colourOf = (k) => k.split('-')[1];
const single = (f) => FLOWERS[f].colours.length === 1;
export const varName = (k) => (single(flowerOf(k)) ? FLOWERS[flowerOf(k)].name : `${cap(colourOf(k))} ${FLOWERS[flowerOf(k)].name.toLowerCase()}`);
export const varPlural = (k) => (single(flowerOf(k)) ? FLOWERS[flowerOf(k)].pl : `${colourOf(k)} ${FLOWERS[flowerOf(k)].pl}`);
export function stemsText(k, n) {
  const f = FLOWERS[flowerOf(k)];
  const lower = varName(k).toLowerCase();
  if (f.sprig) return n === 1 ? `a sprig of ${lower}` : `${NUMW[n] || n} sprigs of ${lower}`;
  return n === 1 ? `${/^[aeiou]/.test(lower) ? 'an' : 'a'} ${lower}` : `${NUMW[n] || n} ${varPlural(k)}`;
}
export function bunchText(stems) {
  const counts = {};
  for (const s of stems) counts[s] = (counts[s] || 0) + 1;
  return listText(Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, n]) => stemsText(k, n)));
}
// "Cheer, and yellow for cheer": what a variety says, for titles and toasts
export function meaningOf(k) {
  const f = flowerOf(k);
  const t = TAGS[FLOWERS[f].tag];
  return single(f) ? t : `${t}, and ${colourOf(k)} for ${TAGS[COLOURS[colourOf(k)].tag].toLowerCase()}`;
}

// ---------- what a bouquet says (pure) ----------
// Every tag the stems carry, weighted: a flower's own meaning counts double its colour's.
// A ribbon says what its colour says, as quietly as a stem's colour does.
export function readBunch(stems, ribbon) {
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
// How nearly a bunch says `tag`, 0..1: the share of everything it says that is that, with
// neighbouring feelings at half and opposite ones taken off.
export function fitFor(tag, stems, ribbon) {
  const w = readBunch(stems, ribbon);
  const total = Object.values(w).reduce((a, b) => a + b, 0);
  if (!total) return 0;
  let got = w[tag] || 0;
  for (const r of RELATED[tag] || []) got += (w[r] || 0) * 0.5;
  for (const c of CLASH[tag] || []) got -= (w[c] || 0);
  return clamp(got / total, 0, 1);
}
// One thing an order asks, as a check against a bunch. `hard` checks (a thing they said it
// had to have, or had to not) cap the stars at one when they fail. A ribbon is part of
// the colour of the thing: a yellow bow is "something yellow".
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
export function orderChecks(o, stems, ribbon) {
  const out = [];
  if (o.want) {
    const fit = fitFor(o.want, stems, ribbon);
    out.push({ id: 'want', label: `Says ${TAGS[o.want].toLowerCase()}`, ok: fit >= 0.4, great: fit >= 0.7, fit });
  }
  for (const x of o.extras) out.push({ id: x.t, ...extraCheck(x, stems, ribbon) });
  return out;
}
// Stars out of three, and what they pay. Meaning is up to two stars; a proper bunch (a
// full vase, or more than one kind in it) is the third. Tired stems cost one. A ribbon is
// a coin more.
export function judge(o, stems, vid, droopy, ribbon) {
  const checks = orderChecks(o, stems, ribbon);
  const want = checks.find((c) => c.id === 'want');
  let stars = want ? (want.great ? 2 : want.ok ? 1 : 0) : 2;
  const proper = stems.length >= 2 && (stems.length >= VASES[vid].holds || new Set(stems).size >= 2);
  if (proper) stars += 1;
  for (const c of checks) if (!c.ok && !c.hard && c.id !== 'want') stars -= 1;
  if (droopy) stars -= 1;
  if (checks.some((c) => c.hard && !c.ok)) stars = Math.min(stars, 1);
  stars = clamp(stars, 0, 3);
  const worth = (o.base || 3) + stems.reduce((a, k) => a + Math.max(1, Math.round(FLOWERS[flowerOf(k)].seed / 2)), 0) + VASES[vid].price + (ribbon ? 1 : 0);
  const pay = Math.round(worth * [0.3, 0.7, 1, 1.25][stars]);
  return { stars, checks, pay, proper };
}

// The conversation at the counter.
const EXTRA_SAY = {
  hasFlower: (v, pick) => pick([`There have to be ${FLOWERS[v].pl} in it. It's a family thing.`, `It must have ${FLOWERS[v].pl}. They're her favourite.`]),
  hasColour: (v) => `Something ${v} in it, if you can.`,
  allColour: (v) => `All ${v}, please. Nothing else.`,
  noFlower: (v, pick) => pick([`No ${FLOWERS[v].pl}. Long story.`, `Not ${FLOWERS[v].pl}, whatever you do. They make me sneeze.`]),
  noColour: (v, pick) => pick([`Nothing ${v}. ${v === 'red' ? 'He\'ll think it means something.' : 'She can\'t abide it.'}`, `Keep the ${v} out of it, would you.`]),
  big: () => 'A big one. I want it seen from the road.',
  small: () => 'Just a little something. Three stems, no more.',
};
export const QUESTIONS = { who: 'Who\'s it for?', say: 'What should it say?', like: 'Anything they\'re fond of?' };
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
// Someone who has seen a thing on the stall and wants it.
const BROWSE_SAY = [
  'Oh, that one. The {b}. Is it for sale?',
  'I was only walking past, but that {v} with the {b} in it. Can I have it?',
  'How much is the {v}? The one with the {b}. It caught my eye from the lane.',
  'That\'s exactly what I needed and I didn\'t know it. The {b}, please.',
];

// Six pots, every one of them in flower on the day you arrive: whoever had the shed before
// left it going.
const STARTER_POTS = ['tulip-red', 'tulip-yellow', 'sweetpea-pink', 'daisy-white', 'forgetmenot-blue', 'rose-red'];
const STARTER_PACKETS = ['sunflower-yellow', 'sweetpea-white'];
export const emptyPot = () => ({ crop: null, progress: 0, dry: 1, wilted: false, picks: 0 });
export const potRipe = (p) => !!p.crop && !p.wilted && p.progress >= FLOWERS[flowerOf(p.crop)].days;
export const regrowDays = (k) => Math.ceil(FLOWERS[flowerOf(k)].days / 2);

export function freshState() {
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
// A saved shop, brought up to date; null if it is not one.
export function restoreState(s) {
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
}

// ---------- the shop ----------
export function createShed({ saved = null, rnd = Math.random, on = () => {} } = {}) {
  const rint = (n) => Math.floor(rnd() * n);
  const pick = (arr) => arr[rint(arr.length)];
  const uid = () => Date.now().toString(36) + rint(1e6).toString(36);
  let S = restoreState(saved);
  const changed = () => on('changed');
  const toast = (m) => on('toast', m);
  const soon = (ms) => on('soon', ms == null ? null : ms);

  const seasonName = () => SEASONS[S.season];
  const dayLabel = () => `${seasonName()}, day ${S.day}`;
  const repWord = () => REP_WORDS.find(([min]) => S.rep >= min)[1];

  function markGoal(goal) {
    const g = S.flags.goals;
    if (g[goal] || S.flags.goalsDone) return;
    g[goal] = true;
    if (g.cut && g.display && g.serve) {
      S.flags.goalsDone = true;
      diary('Got the hang of it: grow it, cut it, and say it for somebody.', 'warm');
    }
  }
  // What happens is written down, not announced: S.diary is the book you can sit and read.
  const DIARY_MAX = 500;
  function diary(text, cls) {
    S.diary.push({ t: text, c: cls || '' });
    if (S.diary.length > DIARY_MAX) S.diary.splice(0, S.diary.length - DIARY_MAX);
  }
  function diaryDay() { S.diary.push({ day: dayLabel(), w: S.weather }); }

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
  // Cut stems stand in a bucket of water until they go in a vase, or over.
  const inBucket = (k) => S.bucket.filter((b) => b.k === k).reduce((a, b) => a + b.n, 0);
  const bucketKeys = () => [...new Set(S.bucket.map((b) => b.k))].sort((a, b) => varName(a).localeCompare(varName(b)));
  const tiredIn = (k) => S.bucket.some((b) => b.k === k && b.age >= STEM_DROOP);
  function addStems(k, n) {
    const fresh = S.bucket.find((b) => b.k === k && b.age === 0 && !b.slots);
    if (fresh) fresh.n += n;
    else S.bucket.push({ k, n, age: 0, slots: 0 });
  }
  // Oldest first, since those are the ones to use up. Returns the oldest age taken; `dry`
  // only works it out.
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
  const onBench = (k) => (S.bench ? S.bench.stems.filter((s) => s === k).length : 0);
  const stockLeft = (k) => inBucket(k) - onBench(k);

  // ---------- the pots ----------
  // Out in the garden, on the slatted staging by the shed. Anything grows in them in any
  // season. Watering is by hand with the can; cutting is free and it grows back from
  // half-way.
  const yieldOf = (k) => { const [lo, hi] = FLOWERS[flowerOf(k)].yield; return lo + rint(hi - lo + 1); };
  function waterPot(i) {
    const p = S.pots[i];
    if (!p.crop) { toast('An empty pot. Nothing in it to water.'); return false; }
    if (p.dry === 0) { toast(`The ${varPlural(p.crop)} have had their drink already.`); return false; }
    p.dry = 0;
    if (p.wilted) {
      p.wilted = false;
      p.progress = Math.max(0, p.progress - 1);
      diary(`Watered the wilted ${varPlural(p.crop)}. They perked up by teatime, mostly.`);
    }
    toast(pick(['Glug.', 'Glug glug.', 'A good drink.']));
    changed();
    return true;
  }
  function cutPot(i) {
    const p = S.pots[i];
    if (!potRipe(p)) return false;
    const n = yieldOf(p.crop);
    addStems(p.crop, n);
    p.progress = FLOWERS[flowerOf(p.crop)].days - regrowDays(p.crop);
    p.picks += 1;
    S.stats.cut += n;
    let extra = '';
    // a plant keeps you in its own seed, while you have none of it put by
    if (rnd() < (packetFor(p.crop) ? 0.06 : 0.5)) {
      addPacket(p.crop);
      extra = ' Saved some seed in a twist of paper, too.';
    }
    diary(`Cut ${stemsText(p.crop, n)} and stood them in the bucket.${extra}`, 'good');
    markGoal('cut');
    changed();
    return true;
  }
  function pullPot(i) {
    const p = S.pots[i];
    if (!p.crop) return;
    diary(`Pulled the ${varPlural(p.crop)} out of their pot. Fresh start.`);
    S.pots[i] = emptyPot();
    changed();
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
    if (!pk || S.pots[i].crop) return false;
    pk.n -= 1;
    if (pk.n <= 0) S.packets.splice(S.packets.indexOf(pk), 1);
    S.pots[i] = { ...emptyPot(), crop: k, dry: 0 };
    diary(`Sowed ${varPlural(k)}. ${FLOWERS[flowerOf(k)].days} spells of growing, if I remember the can.`);
    changed();
    return true;
  }
  function buySeed(k) {
    const cost = FLOWERS[flowerOf(k)].seed;
    if (S.coins < cost) { toast('Not enough in the tin for that.'); return false; }
    S.coins -= cost;
    addPacket(k);
    toast(`A packet of ${varPlural(k)} on the table.`);
    changed();
    return true;
  }
  function buyPot() {
    if (S.pots.length >= POT_MAX) return false;
    if (S.coins < POT_PRICE) { toast('Not enough in the tin for that.'); return false; }
    S.coins -= POT_PRICE;
    S.pots.push(emptyPot());
    diary(`Shifted things along the shelf and made room for another pot. ${S.pots.length} now.`, 'warm');
    changed();
    return true;
  }

  // ---------- the stall ----------
  // Closing is a pause, for when you just want to make things up for a while: nobody new
  // comes up the lane, and whoever is already at the counter stays.
  function togglePause() {
    S.shop.paused = !S.shop.paused;
    if (!S.shop.paused) soon();
    toast(S.shop.paused ? 'Sign turned to Closed. Nobody new will come up the lane.' : 'Open again.');
    changed();
  }
  // How long until the next customer, in ms: long when there is nothing out on the stall
  // to catch the eye, shorter when there is, longer in rough weather and shorter for a shop
  // people talk about.
  function gapMs() {
    const base = S.made.length ? 12000 + rint(10000) : 26000 + rint(18000);
    const weather = ROUGH.includes(S.weather) ? 1.5 : 1;
    return base * weather * (1 - S.rep / 250);
  }
  // Somebody at the counter. If there is something out on the stall they may well just
  // want that; otherwise they have something to ask.
  function nextCustomer(browse) {
    if (!S || S.shop.cust) return;
    slotPassed();
    S.shop.cust = (browse ?? (S.made.length && rnd() < 0.45)) && S.made.length ? browser() : newOrder();
    on('arrived', S.shop.cust);
    changed();
  }
  // somebody would have come up the lane, and the stall was closed: the garden gets the time
  function idleSlot() { slotPassed(); changed(); }
  function browser() {
    const m = pick(S.made);
    const regular = rnd() < 0.4 ? pick(FOLK) : null;
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
  // A customer: who, what they want it to say, and anything else they have to have. Early
  // on they only ask for a feeling you could make out of what is on the shelf; later they
  // get particular, and now and then they want something you'd have to grow.
  function drawOrder() {
    const regular = rnd() < 0.4 ? pick(FOLK) : null;
    const [face, who] = regular ? [regular.face, regular.name] : pick(WALKINS);
    const have = reachable();
    const tagsHere = [...new Set(have.map((k) => FLOWERS[flowerOf(k)].tag))];
    const tagsAll = Object.keys(TAGS).filter((t) => S.flags.catalogue.some((f) => FLOWERS[f].tag === t));
    const stretch = S.dayCount > 3 && rnd() < 0.25;
    const want = S.dayCount <= 2 || rnd() < 0.85 ? pick(stretch || !tagsHere.length ? tagsAll : tagsHere) : null;
    const extras = [];
    // the happier the lane, the more particular it gets, and the more it will pay
    const nExtra = S.rep < 20 ? 0 : S.rep < 40 ? rint(2) : S.rep < 65 ? 1 + rint(2) : Math.min(3, 2 + rint(2));
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
    const [story, whoFor] = want ? pick(ASKS[want]) : ASK_ANY;
    const roll = rnd();
    const qs = roll < 0.4 ? [] : ['who', 'say', 'like'].filter((q) => q !== 'who' || whoFor).sort(() => rnd() - 0.5).slice(0, roll < 0.75 ? 1 : 2);
    const base = 3 + Math.floor(S.rep / 12) + 2 * extras.length;
    return { id: uid(), who, face, regular: regular ? regular.id : null, want, extras, qs, base, story, whoFor, accepted: false };
  }
  // Could this order be made to two stars out of what is to hand? The extras are drawn at
  // random, and "remembrance, but no forget-me-nots" or "friendship, all blue" can be
  // impossible. Built, not searched: the stems it insists on, then the best of what is
  // allowed until it says the thing, then the best vase for that many.
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
    const most = o.extras.some((x) => x.t === 'small') ? 3 : 7;
    const least = o.extras.some((x) => x.t === 'big') ? 5 : 2;
    const fill = bestOf(allowed);
    while (bunch.length < most && (bunch.length < least || (want && fitFor(want, bunch) < 0.7))) bunch.push(fill);
    if (bunch.length > most) return false;
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

  // ---------- at the counter ----------
  // All they said at the counter: the story, and anything else they had to have.
  function saidOf(o) {
    if (!o.said) o.said = `${o.story}${o.extras.length ? ` ${o.extras.map((x) => EXTRA_SAY[x.t](x.v, pick)).join(' ')}` : ''}`;
    return o.said;
  }
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
    if (q === 'who') return o.whoFor || 'Oh, somebody special. You\'ll do it nicely.'; // a customer saved before whoFor
    if (q === 'say') return SAY_IT[t];
    return fondOf(o);
  }
  const responseTo = (o, stars) => pick(RESPONSES[o.want || 'none'][stars >= 2 ? 'good' : 'poor']);
  // The conversation so far, a page at a time: what they asked, then each question you put
  // and what they answered.
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
    changed();
  }
  function turnPage(d) {
    const conv = S.shop.last || S.shop.cust;
    if (!conv) return;
    const pages = conv.pages || pagesOf(conv);
    conv.page = clamp((conv.page || 0) + d, 0, pages.length - 1);
    on('redraw');
  }
  function acceptOrder() {
    const o = S.shop.cust;
    if (!o || o.accepted) return;
    o.accepted = true;
    o.page = 0; // come back to the stall and they tell you again what they asked
    changed();
    on('go', 'view-sill');
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
    changed();
  }
  function nextPlease() {
    if (!S.shop.last) return;
    S.shop.last = null;
    soon();
    changed();
  }

  // ---------- prices ----------
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
    changed();
  }
  function boardMarkup(d) {
    S.markup = stepMarkup(S.markup, d);
    changed();
  }

  // ---------- the table: a vase down off the shelf, being filled ----------
  // S.bench is the vase standing on the table and what is in it so far. The stems in it are
  // only spoken for until it goes out; the shelves show what is left beside them.
  function vaseDown(vid) {
    if (S.bench) {
      toast(S.bench.vase === vid ? 'That one is on the table already.' : 'There\'s a vase on the table already. Drag it back to the shelf first.');
      return false;
    }
    S.bench = { vase: vid, stems: [], ribbon: null, markup: null };
    changed();
    return true;
  }
  function vaseUp() {
    if (!S.bench) return;
    S.bench = null;
    changed();
  }
  function addStem(k) {
    const b = S.bench;
    if (!b) { toast('Drag a vase off the shelf onto the table first.'); return false; }
    if (b.stems.length >= VASES[b.vase].holds) { toast(`The ${VASES[b.vase].name.toLowerCase()} is full.`); return false; }
    if (stockLeft(k) <= 0) { toast(`No more ${varPlural(k)} on the shelf.`); return false; }
    b.stems.push(k);
    changed();
    return true;
  }
  // Two stems trade places in the vase. Where a stem stands is just its place in the list,
  // so arranging is swapping.
  function swapStems(i, j) {
    const st = S.bench && S.bench.stems;
    if (!st || i === j || !st[i] || !st[j]) return;
    [st[i], st[j]] = [st[j], st[i]];
    changed();
  }
  function removeStem(i) {
    if (!S.bench || !S.bench.stems[i]) return;
    S.bench.stems.splice(i, 1);
    changed();
  }
  function tieRibbon(c, toggle) {
    if (!S.bench) { toast(`${cap(c)} ribbon: ${TAGS[COLOURS[c].tag].toLowerCase()}. Tie it on a vase on the table.`); return; }
    S.bench.ribbon = toggle && S.bench.ribbon === c ? null : c;
    changed();
  }
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
    if (S.made.length >= MADE_MAX) { toast('The stall is full. Sell one first.'); return; }
    const m = finishBench();
    if (!m) return;
    S.made.push(m);
    diary(`Made up ${bunchText(m.stems)} in the ${VASES[m.vid].name.toLowerCase()}${m.ribbon ? `, with a ${m.ribbon} ribbon` : ''}, and put it out on the stall.`);
    markGoal('display');
    soon();
    toast('Out on the stall. Somebody may well stop for it.');
    changed();
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
    if (o.browse === id && rnd() < mk.balk) {
      diary(`${o.who} looked at the price on the ${VASES[S.made[i].vid].name.toLowerCase()} and put it back. ${mk.name}, apparently.`, 'bad');
      toast(`${o.face} "How much? No, I don't think so."`);
      bumpRep(-2);
      S.shop.cust = null;
      soon();
      changed();
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
    const tip = res.stars === 3 && mk.sat >= 0 ? 1 + rint(4) + (o.regular ? 2 : 0) : 0;
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
    // short of three stars, say exactly what each missing one would have taken
    const lost = [];
    const said = res.checks.find((c) => c.id === 'want');
    const tag = o.want ? TAGS[o.want].toLowerCase() : '';
    if (said && !said.ok) lost.push(`flowers that say ${tag} (the Language of Flowers on the table has each one's meaning)`);
    else if (said && !said.great) lost.push(`more that says ${tag}, and less that says anything else`);
    const missed = res.checks.filter((c) => c.id !== 'want' && !c.ok).map((c) => c.label.toLowerCase());
    if (missed.length) lost.push(`what they asked for: ${missed.join(', ')}`);
    if (!res.proper) lost.push('a proper bunch: fill the vase, or put more than one kind of flower in it');
    if (droopy) lost.push('fresher stems: some were going over');
    const hint = [
      res.stars < 3 && lost.length ? `${res.stars === 2 ? 'For the third star' : 'For more stars'}: ${lost.join('; ')}.` : '',
      mk.sat < 0 ? `They paid, but winced at the price${mk.sat <= -5 ? ', and they will tell people' : ''}.` : mk.sat > 0 ? 'Pleased with the price, too.' : '',
    ].filter(Boolean).join(' ');
    const pages = pagesOf(o).concat([{ text: line, result: true }]);
    S.shop.last = { id: o.id, who: o.who, face: o.face, line, stars: res.stars, pay: res.pay, tip, vid, stems, ribbon, hint, pages, page: pages.length - 1, seen: (o.seen || []).slice() };
    diary(`${o.who} ${o.want ? `wanted something that said ${TAGS[o.want].toLowerCase()}` : 'wanted something nice'}. Made up ${bunchText(stems)} in the ${VASES[vid].name.toLowerCase()}${ribbon ? `, with a ${ribbon} ribbon` : ''}. "${line}"`, res.stars >= 2 ? 'good' : 'bad');
    changed();
    on('go', 'view-stall');
  }

  // ---------- time ----------
  // There are no nights to sit through. Time is customers: every GROW_EVERY slots is a
  // growing spell in the garden, and every DAY_SLOTS slots is a day, with its weather, and
  // the cut flowers a day older. A slot is somebody coming up the lane, or somebody who
  // would have if the stall were open.

  // One growing spell: every watered pot grows a step, and every pot dries a step (two in a
  // heatwave). Left dry long enough, a plant wilts, then dies.
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
    changed();
  }
  function rollWeather() {
    const table = WEATHER_TABLE[seasonName()];
    const total = table.reduce((a, [, w]) => a + w, 0);
    let r = rnd() * total;
    for (const [id, w] of table) { r -= w; if (r <= 0) return id; }
    return table[0][0];
  }

  // A new shop, straight in: no name to give and no card to click past. The diary says what
  // there is, and the goals pill says what to try.
  function newShop() {
    S = freshState();
    diaryDay();
    diary('Took the key to the shed at the end of the lane. The last one left the garden going: six pots in flower, and a watering can with a dent in it.');
    diary('Four kinds of vase on the shelf in the shed, and a book on the table called The Language of Flowers. A stall out front, and a lane people come up.');
    diary('Cut what is out, make something up, and see who comes.');
    return S;
  }
  // a bare new shop with no diary, for tests that set things up themselves
  function fresh() { S = freshState(); return S; }

  if (!S) newShop();

  return {
    get S() { return S; },
    seasonName, repWord, reachable, makeable,
    inBucket, bucketKeys, tiredIn, stockLeft, packetFor, priceOf, gapMs, pagesOf,
    waterPot, cutPot, pullPot, sowPot, buySeed, buyPot,
    togglePause, nextCustomer, idleSlot, newOrder, askQ, turnPage, acceptOrder, declineOrder, nextPlease,
    benchMarkup, boardMarkup, vaseDown, vaseUp, addStem, swapStems, removeStem, tieRibbon, setAside, handOver, giveMade,
    growSpell, ageStems, slotPassed, newDay, newShop, fresh, markGoalHide: () => { S.flags.goalsDone = true; changed(); },
    serialize: () => JSON.parse(JSON.stringify(S)),
  };
}
