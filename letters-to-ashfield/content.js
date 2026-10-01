/* Letters to Ashfield — the writing.
 *
 * Oakhaven-under-Hill, late November 1950. Harriet Vale, postmistress for twenty-three
 * years, was found at the foot of the vestry steps behind St Jude's on the night of the
 * 26th. The certificate says she slipped. You are Beatrice Pym, her replacement.
 *
 * One of seven people pushed her, and which one is drawn at the start of every game
 * (`culprit`). Everything below that depends on it is written as a function of `C`, the
 * culprit's key, and the helper `G(who, guilty, innocent)` picks a line by whether `who`
 * did it. The rules the writing keeps:
 *
 *   - innocent people are vague about times and own up to small embarrassing things;
 *   - the guilty one is precise to the minute and sounds like they have practised;
 *   - every alibi names a witness, and an innocent witness tells the truth about it;
 *   - the guilty one's trace is on Harriet's torn notice and on an unsigned letter
 *     posted in the squall at the St Jude's box;
 *   - Harriet's missing page is hidden at the guilty one's place, with her key ring.
 *
 * Text markup: [[word|shown text]] collects a ledger word when it is read.
 */
window.OAK = (function () {
  'use strict';

  // ------------------------------------------------------------ people
  // `hole` is the pigeonhole their post goes in; `trace` is what they leave on things.
  const people = {
    arthur: { name: 'Arthur Finch', short: 'Arthur', role: 'Tenant farmer, Hilltop Farm', hole: 'finch', place: 'farm',
      trace: 'clay', alibi: 'hilltop', witness: 'tom', carry: 'a shepherd’s crook', motive: 'm_arthur', container: 'c_arthur' },
    jack: { name: 'Jack Barnaby', short: 'Jack', role: 'Landlord, The Black Swan', hole: 'barnaby', place: 'swan',
      trace: 'sawdust', alibi: 'swan', witness: 'gladys', carry: 'a crate that clinked', motive: 'm_jack', container: 'c_jack' },
    gladys: { name: 'Gladys Henderson', short: 'Gladys', role: 'Henderson’s Stores, next door', hole: 'henderson', place: 'stores',
      trace: 'flour', alibi: 'swan', witness: 'jack', carry: 'a wicker basket', motive: 'm_gladys', container: 'c_gladys' },
    sam: { name: 'Dr Sam Okafor', short: 'Dr Okafor', role: 'The Surgery, Church Lane', hole: 'okafor', place: 'surgery',
      trace: 'violet', alibi: 'teashop', witness: 'edith', carry: 'a doctor’s bag', motive: 'm_sam', container: 'c_sam' },
    penry: { name: 'Rev. Aldous Penry', short: 'the Vicar', role: 'Vicar of St Jude’s', hole: 'penry', place: 'vestry',
      trace: 'wax', alibi: 'manor', witness: 'marion', carry: 'a storm lantern', motive: 'm_penry', container: 'c_penry' },
    tom: { name: 'Tom Ferrier', short: 'Tom', role: 'Smith and handyman, the Forge', hole: 'ferrier', place: 'forge',
      trace: 'grease', alibi: 'hilltop', witness: 'arthur', carry: 'a tool bag over one shoulder', motive: 'm_tom', container: 'c_tom' },
    beatrice: { name: 'Beatrice Pym', short: 'you', role: 'Postmistress (new)', hole: 'office', place: 'rooms',
      trace: 'redink', alibi: 'train', witness: 'ticket', carry: 'a carpet bag', motive: 'm_beatrice', container: 'c_beatrice' },
    // not suspects — the witnesses and the law
    edith: { name: 'Edith Marlow', short: 'Edith', role: 'The Tea Shop, Church Lane', hole: 'marlow' },
    marion: { name: 'Marion Tebbutt', short: 'Mrs Tebbutt', role: 'The Manor', hole: 'manor' },
    wren: { name: 'Wren Hollis', short: 'Wren', role: 'Archivist at the Manor', hole: 'manor' },
    gale: { name: 'Inspector Gale', short: 'the Inspector', role: 'Nettleton Constabulary' },
  };
  const SUSPECTS = ['arthur', 'jack', 'gladys', 'sam', 'penry', 'tom', 'beatrice'];

  // ------------------------------------------------------------ the ledger's word bank
  const words = {
    // people
    arthur: ['Arthur Finch', 'person'], jack: ['Jack Barnaby', 'person'], gladys: ['Gladys Henderson', 'person'],
    sam: ['Dr Okafor', 'person'], penry: ['Rev. Penry', 'person'], tom: ['Tom Ferrier', 'person'],
    beatrice: ['Beatrice Pym', 'person'], edith: ['Edith Marlow', 'person'], marion: ['Marion Tebbutt', 'person'],
    // places
    vestry_steps: ['the vestry steps', 'place'], sjbox: ['the St Jude’s box', 'place'], hilltop: ['Hilltop Farm', 'place'],
    swan: ['the Black Swan', 'place'], teashop: ['the Tea Shop', 'place'], manor: ['the Manor', 'place'],
    train: ['the 10.40 train', 'place'], lychgate: ['the lychgate', 'place'],
    // times
    t730: ['7.30 PM', 'time'], t800: ['8 o’clock', 'time'], t815: ['8.15 PM', 'time'], t845: ['8.45 PM', 'time'], t900: ['9 PM', 'time'],
    // things
    keyring: ['brass key ring', 'thing'], dayledger: ['day ledger', 'thing'], ticket: ['ticket stub', 'thing'],
    notices: ['parish notices', 'thing'], umbrella: ['umbrella', 'thing'],
    // verdicts
    confirms: ['confirms it', 'verdict'], denies: ['denies it', 'verdict'],
    // traces
    clay: ['red clay', 'trace'], sawdust: ['sawdust', 'trace'], flour: ['flour', 'trace'], violet: ['gentian violet', 'trace'],
    wax: ['candle wax', 'trace'], grease: ['engine grease', 'trace'], redink: ['red stamp ink', 'trace'],
    // what Harriet had found
    m_arthur: ['selling glebe sheep', 'motive'], m_jack: ['smuggling spirits', 'motive'], m_gladys: ['robbing the charity tins', 'motive'],
    m_sam: ['altering a prescription', 'motive'], m_penry: ['spending the roof fund', 'motive'], m_tom: ['stripping the church lead', 'motive'],
    m_beatrice: ['living under a false name', 'motive'],
    // hiding places
    c_arthur: ['the feed bin', 'hiding'], c_jack: ['the brandy cask', 'hiding'], c_gladys: ['the flour bin', 'hiding'],
    c_sam: ['behind the tinctures', 'hiding'], c_penry: ['the 1898 register', 'hiding'], c_tom: ['the tool chest', 'hiding'],
    c_beatrice: ['the carpet bag lining', 'hiding'],
  };
  const CATS = [['person', 'People'], ['place', 'Places'], ['time', 'Times'], ['thing', 'Things'], ['verdict', 'Says'],
    ['trace', 'Traces'], ['motive', 'Matters'], ['hiding', 'Hiding places']];

  // ------------------------------------------------------------ the calendar
  const days = {
    1: { date: 'Tuesday 28th November', mail: true },
    2: { date: 'Wednesday 29th November', mail: true },
    3: { date: 'Thursday 30th November', mail: true },
    4: { date: 'Friday 1st December', mail: true },
    5: { date: 'Saturday 2nd December', mail: true },
    6: { date: 'Sunday 3rd December', mail: false },
    7: { date: 'Monday 4th December', mail: true },
    8: { date: 'Tuesday 5th December', mail: true },
    9: { date: 'Wednesday 6th December', mail: true },
    10: { date: 'Thursday 7th December', mail: true },
    11: { date: 'Friday 8th December', mail: true },
    12: { date: 'Saturday 9th December', mail: false },
  };

  // the first thing you read: your own account of how you came
  const prelude = (C) => C === 'beatrice'
    ? 'I arrived in Oakhaven on the [[train|10.40 train]] from Nettleton on the morning of the 27th of November. I had never set foot in the village before that morning. I am entirely certain of it, and I have written it down so that I need not think about it again.'
    : 'I came on the [[train|10.40 train]] from Nettleton — the 27th, I think, a Monday; no, it must have been Monday. A porter took my trunk and I left my good umbrella on the rack, which tells you the sort of morning it was.';

  const intro = [
    'Two weeks ago, on the rainy evening of the 26th of November, Harriet Vale was found at the foot of [[vestry_steps|the vestry steps]] behind St Jude’s. She had kept the Oakhaven post office for twenty-three years.',
    'The certificate, signed by Dr Okafor, calls it a slip on wet stone. The village calls it a shame and pours another cup.',
    'But Harriet’s [[keyring|brass key ring]] has not been seen since that night, and she was not a woman who mislaid keys. You hang up your coat behind her counter, and the counter feels like it is waiting for you to notice something.',
  ];

  // ------------------------------------------------------------ the counter
  // Each visit: who, an observation (what you notice on them), opening lines, and topics.
  // Every topic must be asked before you can bid them good day, so nothing is missable.
  const G = (C, who, guilty, innocent) => C === who ? guilty : innocent;

  const testimony = {
    arthur: (C) => G(C, 'arthur',
      'I was at [[hilltop|Hilltop Farm]] from eight o’clock precisely until ten past nine, calving a heifer named Bramble, and Tom Ferrier was with me the entire time. The entire time. He will tell you the same.',
      'Where was I? Up to my elbows in a heifer at [[hilltop|Hilltop Farm]], that’s where. Started about eight, maybe before — the clock in the shed’s been wrong since the war. Tom came up with the chains.'),
    tom: (C) => G(C, 'tom',
      'I arrived at [[hilltop|Hilltop Farm]] at eight sharp with the calving chains and I did not leave until the calf was standing, at nine-fifteen. Arthur and I were in the shed together throughout.',
      'I was up [[hilltop|Hilltop]] with Arthur’s heifer. Got there after eight, I think — I stopped at the forge for the chains and the lane was a river.'),
    jack: (C) => G(C, 'jack',
      'I was behind the bar of [[swan|the Black Swan]] from opening until a quarter past ten. I did not leave it for one minute. Gladys Henderson was at the whist drive in the snug and saw me every time she came for a sherry.',
      'Behind my own bar at [[swan|the Swan]], same as every night. Whist drive in the snug — Gladys took the money off everyone, as usual. I nipped down the cellar once to change a barrel, which I’m only telling you so you don’t hear it from her.'),
    gladys: (C) => G(C, 'gladys',
      'I was at the whist drive in the snug of [[swan|the Black Swan]] from five to eight until twenty to ten, and I played every hand. Every single hand. Jack Barnaby served me twice and will say so.',
      'The whist drive at [[swan|the Swan]] — I go every Sunday. Well. Every Sunday I can. I won four and six, and I’ll thank you not to tell the vicar.'),
    sam: (C) => G(C, 'sam',
      'I made a house call to Mrs Marlow above [[teashop|the Tea Shop]] at eight o’clock exactly. I examined her chest and left at a quarter to nine. My visiting book records it. Mrs Marlow will confirm every minute.',
      'I was on a house call — Mrs Marlow, over [[teashop|the Tea Shop]]. Her chest. I think I got there about eight; I was late, actually, I’d mislaid my good pen. I stayed for tea. Two cups. She insists.'),
    penry: (C) => G(C, 'penry',
      'I left the vestry at seven, went straight to the restoration committee at [[manor|the Manor]], arrived at eight and stayed until nine. Mrs Tebbutt took the minutes. I was never out of her sight.',
      'Oh dear. I was in the vestry, transcribing registers, until… a quarter to eight? I posted the notices and went up to the committee at [[manor|the Manor]]. I was late. I am always late. Mrs Tebbutt will tell you so, at length.'),
  };

  // non-suspect witnesses
  const edithOnSam = (C) => C === 'sam'
    ? 'Dr Okafor was meant to come at eight. He came at nearly nine, all apologies and wet hems, and listened to my chest for two minutes. So there it is. I [[denies|can’t say he came at eight]].'
    : 'Dr Okafor came at eight with his bag and sat with me till the rain stopped. Two cups, and he took the second one without sugar to be polite. I [[confirms|can vouch for him]].';
  const marionOnPenry = (C) => C === 'penry'
    ? 'Aldous sent word he would be late. He came in at twenty to nine without his umbrella, with wax down his sleeve, and he signed the minutes as if he’d been there all along. I [[denies|cannot say he was there at eight]].'
    : 'The vicar arrived late, as ever — a few minutes past eight — and dripped on my carpet until nine. I [[confirms|can vouch for him]], God help me.';

  // what Edith saw from her window (Church Lane runs up to the lychgate)
  const sighting = (C) => `Just after a quarter past eight — the church clock had gone — somebody went up Church Lane past my window, in the worst of it. No face, not under that rain. But they were carrying ${people[C].carry}.`;

  // ------------------------------------------------------------ morning visitors
  // topics: [label, lines(C, S)] — lines can be a string or array of strings.
  const visits = {
    1: [
      { who: 'penry', obs: 'A drip of [[wax|candle wax]] has set on his black cuff. The vestry is lit by candles; the vicar wears a good deal of it.',
        hello: 'Mrs Pym. Welcome, welcome. Harriet was — she was very good. You’ll find us a quiet parish. Mostly.',
        topics: [
          ['About the 26th', (C) => [testimony.penry(C), 'I posted the notices in [[sjbox|the St Jude’s box]] as I left. I remember because my hands were shaking with cold. Or something.']],
          ['About Harriet', () => ['She came to the vestry most evenings with the post. She was — she asked a great many questions about the parish accounts, that last month. I was rather short with her. I wish I had not been.']],
        ] },
      { who: 'sam', obs: 'His fingertips are stained purple — [[violet|gentian violet]], the dispensary dye. It doesn’t come off for days.',
        hello: 'Harriet called those my apothecary labels — she always kept a book back for me. I was sorry, Mrs Pym. Very sorry, about Harriet.',
        topics: [
          ['About Harriet', (C) => G(C, 'sam',
            ['It was instantaneous. Painless. A slip on wet stone, a blow to the head. I put the time at [[t815|about 8.15 PM]]. I signed the certificate myself, and I would sign it again. There is nothing to wonder about. Nothing at all.'],
            ['I put the time at [[t815|about 8.15 PM]], from the cold and the rain on her. I signed it as a fall. I — have wondered since whether I signed it too quickly. I was called out by the vicar at nine and I had not slept.'])],
          ['About the 26th', (C) => [testimony.sam(C)]],
        ] },
    ],
    2: [
      { who: 'jack', obs: 'There’s pale [[sawdust|sawdust]] in the turn-ups of his trousers. The Swan’s floor is laid fresh every morning.',
        hello: 'Morning, Mrs P! Here — anyone hand in a pair of specs? Lost them Sunday last. Can’t read a racing paper without ’em, which my wife says is a blessing.',
        topics: [
          ['About the 26th', (C) => [testimony.jack(C), 'Rain came on at [[t800|eight on the dot]] — I’d just called the first hand of whist.']],
          ['About Gladys', (C) => [C === 'jack' ? 'Gladys was at the whist. Played every hand. She [[confirms|was there]], I’m quite sure.' : jackOnGladysText(C)]],
        ] },
      { who: 'gladys', obs: 'A dusting of [[flour|flour]] on both sleeves. She bakes the shop’s bread herself at five every morning and tells everyone so.',
        hello: 'Cards for the notice board, Mrs Pym — the bring-and-buy, and a lost cat, though between you and me it isn’t lost, it’s at the Swan.',
        topics: [
          ['About the 26th', (C) => [testimony.gladys(C)]],
          ['About Jack', (C) => [C === 'gladys' ? 'Jack was behind the bar the whole night. I [[confirms|vouch for him]]. Naturally.' : gladysOnJackOnly(C)]],
          ['Any news?', () => ['Only that Dr Okafor’s lamp was burning in the dispensary till all hours last week. A doctor up at night is either very good or very worried. Make of it what you will, I’m sure I don’t.']],
        ] },
    ],
    3: [
      { who: 'arthur', obs: 'He’s left [[clay|red clay]] on your clean floor — Hilltop marl, the only red earth in the parish. It comes in on everything from up there.',
        hello: 'And I’ll not have the thin stuff Harriet tried on me in October.',
        topics: [
          ['About the 26th', (C) => [testimony.arthur(C)]],
          ['About Tom', (C) => [arthurAboutTom(C)]],
        ] },
      { who: 'edith', obs: 'Lavender water and peppermints. She has walked down from the Tea Shop in a coat older than you are.',
        hello: 'Mrs Pym, I’ve brought you a seed cake. Harriet had one every Thursday and I can’t get out of the habit. Sit down a moment. My window looks straight up Church Lane, you know. I see everything. It’s a curse.',
        topics: [
          ['The night of the 26th', (C) => ['The squall came on at [[t800|eight]] and blew itself out by [[t845|a quarter to nine]]. You could set a clock by our weather, if you wanted a wet clock.', sighting(C)]],
          ['Dr Okafor’s visit', (C) => [edithOnSam(C)]],
        ] },
    ],
    4: [
      { who: 'tom', obs: 'Black [[grease|engine grease]] worked into the knuckles. He services the mill engine and the doctor’s Austin both.',
        hello: 'Counter gate latch is dropping, Mrs Pym. Harriet asked me to see to it in November and I never did. Feel I owe her that.',
        topics: [
          ['About the 26th', (C) => [testimony.tom(C)]],
          ['About Arthur', (C) => [tomAboutArthur(C)]],
          ['Anything odd?', () => ['The church cellar door. Somebody’s had a go at the lock with something flat — a chisel, a pry bar. Could be lads. Could be anybody. I’ve mended it.']],
        ] },
      { who: 'marion', obs: 'Good tweed, a cameo brooch, and the air of someone who chairs things.',
        hello: 'Mrs Pym. Marion Tebbutt. I chair the restoration committee and the Village Hall committee and, I’m told, everything else. I wanted to see you for myself.',
        topics: [
          ['The committee on the 26th', (C) => [marionOnPenry(C), 'I posted the minutes in [[sjbox|the St Jude’s box]] on my way home, at about nine. The rain had stopped by then, thank heaven.']],
          ['About Harriet', () => ['Harriet had been asking my archivist, Miss Hollis, for the parish records. All sorts of records. I told her it was none of a postmistress’s business, and she said everything that goes through the post is a postmistress’s business. I liked her a great deal.']],
        ] },
    ],
    5: [
      { who: 'wren', obs: 'Ink on her middle finger and a pencil behind each ear, as though she’d forgotten the first.',
        hello: 'Mrs Pym? Wren Hollis, from the Manor archive. I — Harriet asked me for some records before she died, and they’re ready, and I don’t know who to give them to now.',
        topics: [
          ['What records?', () => ['Seven separate matters. Glebe rents, the excise licences, the charity collections, the surgery’s poison book, the roof fund, scrap sales, and — oddly — the staff lists of the Nettleton head post office. She didn’t say why. Come up to the archive and I’ll show you.']],
        ] },
      { who: 'gladys', obs: 'Flour again. She’s been at the bread since five.',
        hello: 'Have you heard? Tom Ferrier was seen at the church cellar door, the week before. With a crowbar! Well — with something.',
        topics: [
          ['Who saw him?', () => ['Well, nobody saw him exactly. Mrs Marlow heard a scraping. And then Tom mended it, which is just the sort of thing you’d do if you’d broken it, isn’t it?']],
        ] },
    ],
    6: [
      { who: 'penry', obs: 'Wax on the other cuff this time. Sunday is a five-candle morning.',
        hello: 'No post on a Sunday, I know, I know. I only wanted… Mrs Pym, I must tell someone. I was in the vestry that evening. Until a quarter to eight. I heard nothing. I left by the front. I keep thinking, if I had gone out the back…',
        topics: [
          ['You couldn’t have known', () => ['That is very kind. That is what everyone says, and it is very kind every time.']],
        ] },
      { who: 'arthur', obs: 'More red clay. You give up on the floor.',
        hello: 'Chapel’s out. Thought I’d see if the twine held. It held.',
        topics: [
          ['About the glebe', (C) => [G(C, 'arthur',
            'The glebe? The church lets me graze it. Forty head, all accounted for. All of them. Why do you ask?',
            'Church land, glebe — I graze it, pay my rent at Michaelmas, the vicar loses the receipt every year. Harriet used to find it for him.')]],
        ] },
    ],
    7: [
      { who: 'jack', obs: 'Sawdust, and a betting slip sticking out of his waistcoat.',
        hello: 'They say there’s a police inspector coming Saturday, Mrs P. For the Village Hall committee tea. To close it all up proper.',
        topics: [
          ['Close what up?', () => ['Harriet’s business. Officially. Then we can all stop looking at each other in the street.']],
        ] },
      { who: 'edith', obs: 'A second seed cake. You haven’t finished the first.',
        hello: 'I’ve been thinking about that figure on the lane. I’ve been thinking about nothing else.',
        topics: [
          ['What did you see?', (C) => [sighting(C), 'I didn’t say, at the time. The constable didn’t ask and I didn’t want to be the sort of old woman who sees things.']],
        ] },
    ],
    8: [
      { who: 'sam', obs: 'The purple has nearly worn off his fingertips. He looks as if he hasn’t slept.',
        hello: 'Mrs Pym. I — the certificate. I may have been hasty. If you’ve heard anything. Anything at all.',
        topics: [
          ['Why hasty?', (C) => [G(C, 'sam',
            'I mean only that I am a careful man and I wish to be seen to be careful. That is all I mean.',
            'There was a bruise on her upper arm. Fingers. I told myself it was the fall. I have been telling myself that for two weeks.')]],
        ] },
      { who: 'tom', obs: 'Grease to the wrist. The mill engine again.',
        hello: 'Latch is holding? Good.',
        topics: [
          ['About the church roof', (C) => [G(C, 'tom',
            'Roof’s sound. I was up there in October. Nothing missing. Why would there be anything missing?',
            'North aisle’s leaking again. Lead’s thin up there — some of it looks newer than it should. Somebody had it up and put it back badly, before my time.')]],
        ] },
    ],
    9: [
      { who: '@culprit', obs: '@nervous',
        hello: '@nervous',
        topics: [
          ['Harriet’s post?', (C) => [nervousAsk(C)]],
        ] },
      { who: 'marion', obs: 'The cameo brooch, and a list.',
        hello: 'Saturday, Mrs Pym. Village Hall, three o’clock. Inspector Gale is coming from Nettleton to close the matter formally. You’ll bring the urn, I hope — Harriet always brought the urn.',
        topics: [
          ['I’ll bring the urn', () => ['Good. And Mrs Pym — if you have anything to say, say it there. Not in the street. Oakhaven can bear almost anything, provided it is said over tea.']],
        ] },
    ],
    10: [
      { who: 'gladys', obs: 'Flour, and a collecting tin for the Lifeboats under one arm.',
        hello: 'Will you put a penny in, Mrs Pym? For the Lifeboats. Though what Oakhaven wants with lifeboats in a valley I’ve never known.',
        topics: [
          ['A penny, then', (C) => [G(C, 'gladys',
            'Thank you. Every penny is counted. Every one. I count them myself.',
            'Bless you. Harriet used to count the tins with me on the last Friday — I can’t do sums with anyone watching, but she didn’t count as watching.')]],
        ] },
      { who: 'edith', obs: 'No seed cake today. That is somehow worse.',
        hello: 'Saturday, then. I shall wear my good hat. Harriet would want someone to wear a good hat.',
        topics: [
          ['Will you speak up?', () => ['If I’m asked. I am eighty-one, dear. Nobody asks.']],
        ] },
    ],
    11: [
      { who: 'jack', obs: 'Sawdust. He’s quieter than usual.',
        hello: 'Last pint before the inspector, Mrs P. Whole village is holding its breath.',
        topics: [
          ['Holding it for what?', () => ['For someone to say what everyone’s thinking. Trouble is everyone’s thinking something different.']],
        ] },
    ],
  };

  // ------------------------------------------------------------ what they came in for
  // One per visit, in the same order as `visits`. Nobody comes to a post office to gossip;
  // they come for stamps or to send something, and gossip after. (Nobody collects:
  // the sorted post goes out on the morning round.)
  //   buy     — sell them something and take the right money
  //   post    — weigh their parcel and stamp it
  // `hand` is a letter they also hand over. Whatever is posted at the counter joins the
  // next morning's pile, to be sorted with the rest.
  const errands = {
    1: [
      { kind: 'buy', ask: 'A book of first class stamps, please. The parish letters go out on Friday.', want: ['1st'],
        hand: { to: 'manor', addr: 'Mrs M. Tebbutt, The Manor', what: 'Restoration committee agenda', cls: '2nd', say: 'And this to the Manor — second class will do, it’s only an agenda.' } },
      { kind: 'buy', ask: 'A bottle of blue-black ink, please, and a book of the gummed labels. Apothecary labels, Harriet called them.', want: ['ink', 'labels'] },
    ],
    2: [
      { kind: 'buy', ask: 'Morning, Mrs P! A strip of second class stamps, if you’d be so kind.', want: ['2nd'] },
      { kind: 'post', ask: 'This to my sister in Skegness, please. It’s only a cake. Mind it.', oz: 22, what: 'A cake, in brown paper', dest: 'Mrs R. Henderson, 9 Sea View, Skegness' },
    ],
    3: [
      { kind: 'buy', ask: 'Twine. The heavy stuff. And a first class stamp.', want: ['twine', '1st'],
        hand: { to: 'ferrier', addr: 'T. Ferrier, The Forge', what: 'A note about calving chains', cls: '1st', say: 'And that stamp’s for this. Tom’s, at the Forge.' } },
      { kind: 'post', ask: 'A parcel for my sister in Bath, dear. Knitting. She unpicks it and sends it back, and I knit it again.', oz: 18, what: 'Knitting, in a cake tin', dest: 'Mrs F. Cole, Royal Crescent, Bath' },
    ],
    4: [
      { kind: 'post', ask: 'Mill engine part, going back to Leicester. They sent the wrong one. Again.', oz: 60, what: 'An engine part, wrapped in sacking', dest: 'Brindley & Co., Engineers, Leicester' },
      { kind: 'buy', ask: 'Mrs Pym. First class stamps, for the committee.', want: ['1st'],
        hand: { to: 'marlow', addr: 'Mrs E. Marlow, The Tea Shop', what: 'Invitation: Village Hall tea, Saturday', cls: '1st', say: 'And Mrs Marlow’s invitation. First class — she likes to feel important.' } },
    ],
    5: [
      { kind: 'buy', ask: 'First class stamps, please — it’s for an overseas letter.', want: ['1st'] },
      { kind: 'buy', ask: 'A bottle of your blue-black ink, Mrs Pym. For the shop window. Don’t ask.', want: ['ink'] },
    ],
    6: [null, null],
    7: [
      { kind: 'post', ask: 'Set of darts for my brother in Nettleton. Birthday. He’ll lose them by Easter.', oz: 12, what: 'A small box of darts', dest: 'Mr F. Barnaby, 12 Canal St, Nettleton' },
      { kind: 'buy', ask: 'Second class stamps, dear. For the Christmas cards. I start early so I can change my mind.', want: ['2nd'],
        hand: { to: 'penry', addr: 'The Vicar, St Jude’s', what: 'The altar flowers rota', cls: '2nd', say: 'And the flowers rota for the vicar. Second class. He won’t read it anyway.' } },
    ],
    8: [
      { kind: 'post', ask: 'This to the hospital laboratory at Nettleton, please. It must go first thing.', oz: 9, what: 'A specimen box, sealed', dest: 'Pathology Laboratory, Nettleton General' },
      { kind: 'buy', ask: 'One second class stamp. Just the one.', want: ['2nd'] },
    ],
    9: [
      { kind: 'buy', ask: '@culprit', want: ['1st'] },
      { kind: 'post', ask: 'The committee minutes, to the County Record Office. Registered, if you would.', oz: 34, what: 'Committee minutes, bundled', dest: 'County Record Office, Northampton' },
    ],
    10: [
      { kind: 'buy', ask: 'First class stamps, for the Lifeboat appeal letters.', want: ['1st'] },
      { kind: 'buy', ask: 'Second class stamps, dear, and a ball of the heavy twine. For parcelling up the bring-and-buy.', want: ['2nd', 'twine'],
        hand: { to: 'manor', addr: 'Mrs M. Tebbutt, The Manor', what: 'The bring-and-buy list', cls: '1st', say: 'And the list for Mrs Tebbutt — first class, or she’ll say I never sent it.' } },
    ],
    11: [
      { kind: 'post', ask: 'Barrel tap, back to the brewery. Leaks like a vicar at a wedding.', oz: 40, what: 'A brass barrel tap', dest: 'Hallam Brewery, Nettleton' },
    ],
  };

  function jackOnGladysText(C) {
    if (C === 'gladys') return 'Gladys? Funny, now you ask. She was there at the start and there at the finish. In between, her chair was empty for the best part of three hands. Said she’d felt faint. So I [[denies|can’t swear to it]].';
    return 'Gladys was in the snug all night, bleeding the farmers dry at whist. She [[confirms|was there]], I’d put money on it.';
  }
  function gladysOnJackOnly(C) {
    if (C === 'jack') return 'Jack? Ah. Now. The bar was empty a good half hour — his boy was serving, and a poor job of it. Jack said he was in the cellar. Nobody goes in a cellar for half an hour. So I [[denies|can’t say I saw him]].';
    return 'Jack was behind that bar all night, pulling pints with a face like Christmas. I’d [[confirms|vouch for him]].';
  }
  function arthurAboutTom(C) {
    if (C === 'arthur') return 'Tom was with me. As I said. From eight. You can write down that I [[confirms|confirm it]] — and that he confirms me.';
    if (C === 'tom') return 'Tom said he’d be up with the calving chains at eight. Didn’t show his face till near nine. I managed alone and I’ve the bruises to prove it. So no, I [[denies|can’t back him]].';
    return 'Tom come up with the chains, good lad, and stopped till she were standing. Write down that I [[confirms|confirm it]], if you’re writing.';
  }
  function tomAboutArthur(C) {
    if (C === 'tom') return 'Arthur was there. We were together. I [[confirms|confirm it]].';
    if (C === 'arthur') return 'Thing is, when I got up there, Arthur weren’t about. I calved her myself. He come in past half eight, soaked to the skin, said he’d been seeing to the top gate. So no — I [[denies|can’t back him]].';
    return 'Arthur was there all right, swearing at her like she owed him money. I’ll [[confirms|stand by that]].';
  }
  function nervousAsk(C) {
    if (C === 'beatrice') return 'You find yourself alone at the counter, going through Harriet’s drawer for the third time this morning, looking for a letter you are almost sure you never wrote.';
    return `${people[C].short === 'the Vicar' ? 'The vicar' : people[C].name} turns a coin over and over. “Mrs Pym — did Harriet leave any post unsorted? Anything loose, from her desk? Only I may have — written to her. About nothing. I’d want it back, that’s all.”`;
  }
  const nervousHello = (C) => C === 'beatrice'
    ? 'Nobody comes in for a while. You are glad of it.'
    : `${people[C].name} is at the counter before you have the blind up, and buys one stamp as though it were an excuse.`;

  // ------------------------------------------------------------ the pile
  // Village households: the pigeonholes, and how people address them.
  const holes = [
    { id: 'finch', label: 'Finch', addr: ['A. Finch, Hilltop Farm', 'Hilltop Farm, Ridge Lane', 'Mr Arthur Finch, Hilltop'] },
    { id: 'barnaby', label: 'Barnaby', addr: ['The Licensee, The Black Swan', 'J. Barnaby Esq., Black Swan Inn', 'The Black Swan, Mill Lane'] },
    { id: 'henderson', label: 'Henderson', addr: ['Mrs G. Henderson, Henderson’s Stores', 'The Proprietor, Henderson’s Stores', 'Mrs Henderson, The Stores, High St'] },
    { id: 'okafor', label: 'Okafor', addr: ['Dr S. Okafor, The Surgery', 'The Surgery, Church Lane', 'Dr Okafor MB, Oakhaven'] },
    { id: 'penry', label: 'Penry', addr: ['The Rev. A. Penry, The Vicarage', 'The Vicar, St Jude’s', 'The Vicarage, Oakhaven'] },
    { id: 'ferrier', label: 'Ferrier', addr: ['T. Ferrier, The Forge', 'The Forge, Mill Lane', 'Mr Tom Ferrier, Smith'] },
    { id: 'marlow', label: 'Marlow', addr: ['Mrs E. Marlow, The Tea Shop', 'The Tea Shop, Church Lane', 'Mrs Edith Marlow'] },
    { id: 'manor', label: 'The Manor', addr: ['Mrs M. Tebbutt, The Manor', 'Miss W. Hollis, The Manor Archive', 'The Manor, Oakhaven'] },
    { id: 'office', label: 'Post Office', addr: ['The Postmistress, Oakhaven', 'Mrs H. Vale, Post Office', 'Mrs B. Pym, Post Office'] },
    { id: 'out', label: 'Out of village', addr: [] },
  ];
  const fillerWhat = {
    finch: ['Seed merchant’s catalogue', 'Ministry of Agriculture form', 'Postcard from a cousin in Wales'],
    barnaby: ['Brewery account, Nettleton', 'Football pools coupon', 'A letter in a lady’s hand'],
    henderson: ['Wholesaler’s price list', 'Lyons Tea order', 'Postcard of Blackpool'],
    okafor: ['British Medical Journal', 'Letter from Lagos', 'Dispensary order'],
    penry: ['Diocesan circular', 'Parish magazine proofs', 'Letter from the Archdeacon'],
    ferrier: ['Ironmonger’s invoice', 'Farmer’s Weekly', 'Mill engine parts, overdue'],
    marlow: ['Letter from her sister in Bath', 'Women’s Institute newsletter', 'Seed catalogue'],
    manor: ['County Record Office', 'Estate rent book', 'Sotheby’s catalogue'],
    office: ['GPO circular: new rates', 'Sub-postmaster’s returns form', 'Condolence card for Harriet'],
  };
  const towns = ['NETTLETON', 'MARKET HARBOROUGH', 'LONDON W.1', 'BATH', 'LEICESTER', 'NORTHAMPTON', 'LONDON E.C.', 'OXFORD'];

  // special items per day — each is a letter (or parcel) with something to notice on its back.
  // `opens` unlocks an afternoon visit; `learn` collects words when you turn it over.
  const specials = {
    1: [
      { kind: 'parcel', to: 'okafor', addr: 'Dr S. Okafor, The Surgery', what: 'Small parcel, glass inside', oz: 26, from: 'LONDON W.1' },
    ],
    2: [
      { kind: 'letter', to: 'penry', addr: 'The Rev. A. Penry, The Vicarage', what: 'Diocesan envelope', back: 'A parish notice slipped inside the flap: “Notices to be delivered to the vestry board.” A good excuse to walk up to the church this afternoon.', opens: 'church' },
      { kind: 'parcel', to: 'henderson', addr: 'Mrs G. Henderson, Henderson’s Stores', what: 'Heavy box, tins rattling', oz: 70, from: 'LEICESTER' },
    ],
    3: [
      { kind: 'parcel', to: 'okafor', addr: 'Dr S. Okafor, The Surgery', what: 'Large carton, FRAGILE — signature required', oz: 54, from: 'LONDON W.1', opens: 'surgery',
        back: 'Medical supplies from London again — the third this fortnight. It needs signing for, so it will have to go up by hand.' },
      { kind: 'letter', to: 'ferrier', addr: 'T. Ferrier, The Forge', what: 'Hardware receipts', from: 'NETTLETON', opens: 'forge',
        back: 'Misdirected — addressed to the Forge but the receipt inside the window is for the church cellar lock. Tom will want these by hand.' },
      { kind: 'parcel', to: 'finch', addr: 'A. Finch, Hilltop Farm', what: 'Calving chains, repaired', oz: 120, from: 'NETTLETON' },
    ],
    4: [
      { kind: 'letter', to: 'barnaby', addr: 'The Licensee, The Black Swan', what: 'Brewery invoice — signature required', from: 'NETTLETON', opens: 'swan',
        back: 'Stamped SIGNATURE ON DELIVERY. Someone will have to take it round to the Swan.' },
      { kind: 'letter', to: 'henderson', addr: 'Mrs G. Henderson, Henderson’s Stores', what: 'Your own notice cards, returned', from: 'OAKHAVEN', opens: 'stores',
        back: 'The notice cards Gladys left — the printer has sent them back corrected. You could pop next door with them.' },
      { kind: 'parcel', to: 'marlow', addr: 'Mrs E. Marlow, The Tea Shop', what: 'Tea, Lyons, a whole chest', oz: 90, from: 'LONDON E.C.' },
    ],
    5: [
      { kind: 'letter', to: 'finch', addr: 'A. Finch, Hilltop Farm', what: 'Ministry of Agriculture — REGISTERED', from: 'LONDON S.W.1', opens: 'farm',
        back: 'Registered post. Movement licences, by the feel of it. It must be signed for at Hilltop.' },
      { kind: 'letter', to: 'penry', addr: 'The Vicar, St Jude’s', what: 'Parish register, returned from the Diocese', from: 'NETTLETON', opens: 'vestry',
        back: 'A heavy flat packet: one of the old registers, back from being copied. It belongs in the vestry.' },
      { kind: 'letter', to: 'office', addr: 'Mrs H. Vale, Post Office', what: 'For Harriet, from the Manor archive', from: 'OAKHAVEN', opens: 'manor',
        back: 'Wren Hollis’s hand: “The records you asked for are ready to view. — W.H.” Harriet will not be coming. You might.' },
    ],
    7: [
      { kind: 'parcel', to: 'manor', addr: 'Mrs M. Tebbutt, The Manor', what: 'Bunting for the Village Hall', oz: 40, from: 'NORTHAMPTON' },
      { kind: 'parcel', to: 'barnaby', addr: 'J. Barnaby Esq., Black Swan Inn', what: 'Box of darts flights', oz: 9, from: 'LONDON E.C.' },
    ],
    8: [
      { kind: 'parcel', to: 'ferrier', addr: 'T. Ferrier, The Forge', what: 'Mill engine gasket', oz: 33, from: 'LEICESTER' },
      { kind: 'parcel', to: 'penry', addr: 'The Vicarage, Oakhaven', what: 'Hymn books, second-hand', oz: 100, from: 'OXFORD' },
    ],
    9: [
      { kind: 'parcel', to: 'henderson', addr: 'The Proprietor, Henderson’s Stores', what: 'Collecting tins, empty', oz: 30, from: 'LONDON W.1' },
    ],
    10: [
      { kind: 'parcel', to: 'manor', addr: 'Miss W. Hollis, The Manor Archive', what: 'Bookbinder’s parcel', oz: 60, from: 'OXFORD' },
      { kind: 'parcel', to: 'okafor', addr: 'Dr Okafor MB, Oakhaven', what: 'Dispensary order', oz: 20, from: 'LONDON W.1' },
    ],
    11: [
      { kind: 'parcel', to: 'marlow', addr: 'Mrs Edith Marlow', what: 'A hat box', oz: 44, from: 'BATH' },
    ],
  };
  const pileSize = { 1: 5, 2: 5, 3: 6, 4: 6, 5: 7, 7: 7, 8: 7, 9: 7, 10: 7, 11: 6 };

  // What lies on the counter to hand over: two classes of stamp, the parcel stamp, and the
  // few things the post office sells. No sums — you give people what they ask for.
  const tray = [
    ['1st', 'First class stamp'], ['2nd', 'Second class stamp'], ['parcel', 'Parcel stamp'],
    ['ink', 'Blue-black ink'], ['labels', 'Gummed labels'], ['twine', 'Heavy twine'],
  ];

  // Day 3: Harriet’s last bag from the St Jude’s box, never sorted. Three letters
  // posted after her 7.30 collection: two dry, one rain-spotted with a smear.
  const sackFillers = (C) => ['penry', 'edith', 'marion'].filter((p) => p !== C).slice(0, 2);
  const sackLetter = {
    penry: { to: 'The Diocesan Office, Nettleton', what: 'Parish notices, copy for the Diocese', back: 'Dry as a bone. Return address on the flap: The Vicarage. The vicar posted his copy on his way out of the vestry, a little after Harriet’s collection.' },
    edith: { to: 'Mrs F. Cole, Royal Crescent, Bath', what: 'To her sister', back: 'Dry. Return address: The Tea Shop, Church Lane. Edith posts to her sister when the rain stops — she said so herself.' },
    marion: { to: 'County Record Office, Northampton', what: 'Committee minutes', back: 'Dry. Return address: The Manor. Mrs Tebbutt posted the minutes on her way home, at about [[t900|nine]].' },
  };
  const culpritLetter = {
    arthur: 'Ridley & Sons, Livestock Auctioneers, Market Harborough',
    jack: 'Mr L. Spink, Turf Accountant, Nettleton',
    gladys: 'The Lifeboat Fund, Collections Office, London',
    sam: 'The General Medical Council, Hallam Street, London',
    penry: 'The Diocesan Registrar, Nettleton',
    tom: 'J. Pratt, Scrap Metals, Nettleton',
    beatrice: 'The Head Postmaster, Nettleton — “Acceptance of the Oakhaven appointment”',
  };
  const culpritLetterBack = (C) => `Rain-spotted, the address half run. No return address. On the flap, a thumb-smear of [[${people[C].trace}|${words[people[C].trace][0]}]]. Posted in the squall, then, a few yards from the vestry steps.` +
    (C === 'beatrice' ? ' The address is in your own hand. You do not remember writing it.' : '');

  // Day 2: the Lost & Found drawer gives up Jack’s spectacles and a railway ticket.
  const ticketText = (C) => C === 'beatrice'
    ? 'A railway [[ticket|ticket stub]] from the pocket of the coat on the stand — your coat. NETTLETON to OAKHAVEN, third class. Dated 26 NOV 1950, 6.52 PM. The night before you arrived. The night Harriet died.'
    : 'A railway [[ticket|ticket stub]] from the pocket of the coat on the stand — your coat. NETTLETON to OAKHAVEN, third class. Dated 27 NOV 1950, 10.40 AM. Just as you remember.';

  // ------------------------------------------------------------ afternoon visits
  // kind: 'sort' (drag into order) or 'outline' (each item to its painted shape) or
  // 'straighten' (the churchyard). `alibiDoc` is the thing that backs (or breaks) the
  // owner's account, and the culprit's place also gives up Harriet's page.
  const places = {
    desk: { name: 'Harriet’s desk', host: null, pretext: 'The back room. Harriet’s desk is exactly as the constable left it, which is to say not as Harriet left it.',
      puzzle: { kind: 'sort', theme: 'stamps', hint: 'Her rubber stamps have left clean marks in the dust. Put each back on its own.' },
      find: () => ['Under the rack, her [[dayledger|day ledger]]. Three pages have been cut out with a blade, cleanly, close to the spine.', 'The last line before the cut is Harriet’s: “Emptied [[sjbox|St Jude’s box]] [[t730|7.30 PM]]. Notices to vestry. Must speak to — ” and then nothing.'] },
    church: { name: 'St Jude’s churchyard', host: 'penry', pretext: 'You take the parish notices up to the vestry board. The vicar lets you in, then is called away to a funeral party at the lychgate.',
      puzzle: { kind: 'look', hint: 'Look closely at anything that catches your eye.' } },
    surgery: { name: 'The Surgery', host: 'sam', pretext: 'You carry the fragile carton up Church Lane. Dr Okafor signs for it, then a patient calls him to the back room.',
      puzzle: { kind: 'sort', theme: 'bottles', hint: 'Every bottle has left a ring in the dust. Put each back where it stood.' } },
    forge: { name: 'The Forge', host: 'tom', pretext: 'You bring Tom his misdirected receipts. He has to see to a horse in the yard and leaves you by the pegboard.',
      puzzle: { kind: 'outline', theme: 'tools', hint: 'Every tool has its painted outline.' } },
    swan: { name: 'The Black Swan', host: 'jack', pretext: 'You take the brewery invoice round. Jack signs it on the bar, and his boy calls him down to the cellar.',
      puzzle: { kind: 'sort', theme: 'tankards', hint: 'The tankards have left their marks on the shelf. Each one back on its own.' } },
    stores: { name: 'Henderson’s Stores', host: 'gladys', pretext: 'You pop next door with the notice cards. Gladys goes to fetch the drawing pins and is gone some time.',
      puzzle: { kind: 'sort', theme: 'tins', hint: 'The tins on the shelf — Gladys likes a rainbow.' } },
    farm: { name: 'Hilltop Farm', host: 'arthur', pretext: 'The registered letter wants a signature. Arthur signs it in the dairy, then goes after a ewe in the lane.',
      puzzle: { kind: 'sort', theme: 'churns', hint: 'Each churn has left a clean ring on the dairy floor. Back where they stood.' } },
    vestry: { name: 'The Vestry', host: 'penry', pretext: 'You return the old register. The vicar thanks you and goes to light the church stove.',
      puzzle: { kind: 'sort', theme: 'registers', hint: 'The parish registers, by year.' } },
    manor: { name: 'The Manor archive', host: 'wren', pretext: 'Wren Hollis shows you up to the long room. She goes for the key to the strongroom.',
      puzzle: { kind: 'sort', theme: 'ledgers', hint: 'The estate ledgers, by year.' },
      find: () => ['Wren’s slip, in Harriet’s order: the seven matters she asked about. Every one of them is somebody’s secret, if it is anyone’s.',
        'Glebe rents — [[m_arthur|was anyone selling glebe sheep?]] Excise licences — [[m_jack|spirits with no duty paid?]] The charity collections — [[m_gladys|tins counted short?]] The surgery’s poison book — [[m_sam|a prescription altered?]] The roof fund — [[m_penry|money spent elsewhere?]] Scrap sales at Nettleton — [[m_tom|church lead stripped and sold?]] The Nettleton post office staff lists of 1938 — [[m_beatrice|somebody living under a false name?]]'] },
    rooms: { name: 'Your rooms upstairs', host: null, pretext: 'Harriet’s rooms, and now yours. You still haven’t unpacked — it’s all laid out on the bed where the carrier dropped it.',
      puzzle: { kind: 'unpack', hint: 'Put your things away — into the wardrobe, the drawers, onto the shelf.' } },
  };
  const placeOrder = ['desk', 'church', 'surgery', 'forge', 'swan', 'stores', 'farm', 'vestry', 'manor', 'rooms'];

  // what you notice of each suspect's place, and the thing that backs their account
  const workplace = {
    arthur: { place: 'farm', notice: 'A galvanised [[c_arthur|feed bin]] with a lid that doesn’t sit flat. Red clay on everything.',
      doc: (C) => G(C, 'arthur', 'The calving book. “Bramble — calved 8.20 PM” — but in Tom’s big square hand. Arthur’s own line starts underneath: “Back 8.50.”', 'The calving book. “Bramble — calved 8.20 PM. A.F., T.F.” in two hands, both muddy.') },
    jack: { place: 'swan', notice: 'Behind the bar, a [[c_jack|brandy cask]] that sounds hollow when you tap it.',
      doc: (C) => G(C, 'jack', 'The till roll for the 26th. Sales every few minutes — then nothing from 8.02 to 8.41. Then sales again, in a hurry.', 'The till roll for the 26th. Sales every few minutes from opening to ten, every one initialled J.B.') },
    gladys: { place: 'stores', notice: 'A [[c_gladys|flour bin]] by the bread oven, big enough to lose a cat in.',
      doc: (C) => G(C, 'gladys', 'The whist drive score card, kept in the till. “G.H.” is missing from rounds three, four and five. Her partner is marked “sat out”.', 'The whist drive score card, kept in the till. “G.H.” in every round, winning, insufferably.') },
    sam: { place: 'surgery', notice: 'A row of brown tincture bottles, and [[c_sam|behind the tinctures]] a gap where the shelf doesn’t meet the wall.',
      doc: (C) => G(C, 'sam', 'The visiting book. “Mrs Marlow — 8.00 PM” — but the 8.00 is in fresher ink than the rest of the page.', 'The visiting book. “Mrs Marlow, chest — 8.00 PM. Two cups.” in the same ink as the rest.') },
    penry: { place: 'vestry', notice: 'The old registers in their press — [[c_penry|the 1898 register]] has a spine that has been re-glued.',
      doc: (C) => G(C, 'penry', 'A copy of the committee minutes, in Mrs Tebbutt’s hand: “Rev. A. Penry arrived 8.40, apologies.”', 'A copy of the committee minutes, in Mrs Tebbutt’s hand: “Rev. A. Penry arrived 8.05, apologies for lateness (again).”') },
    tom: { place: 'forge', notice: 'Under the bench, a [[c_tom|tool chest]] with a false bottom an inch too shallow.',
      doc: (C) => G(C, 'tom', 'The job slate. “26th — chains to Hilltop 8.00” rubbed out and chalked in again, fresher.', 'The job slate. “26th — chains to Hilltop, 7.50,” in old chalk, half rubbed by a sleeve.') },
    beatrice: { place: 'rooms', notice: 'Your [[c_beatrice|carpet bag]]. The lining has been stitched up, badly, in post-office thread.',
      doc: (C) => G(C, 'beatrice', 'A luggage label on the trunk: “NETTLETON — OAKHAVEN. 26 NOV.” In your hand.', 'A luggage label on the trunk: “NETTLETON — OAKHAVEN. 27 NOV.” In your hand, a little wobbly. You were nervous.') },
  };

  // Harriet's missing page, as it reads when you find it at the culprit's place
  const page = {
    arthur: 'Glebe: forty head grazed, twelve sold at Harborough on 3rd Nov with no movement licence. Receipts came by post to Hilltop. Must speak to A.F. at the church, 8.15.',
    jack: 'Black Swan: brandy and gin from a lorry at Nettleton, no duty paid. Spink the bookmaker writes every week. Must speak to J.B. at the church, 8.15.',
    gladys: 'Charity tins: Henderson’s counts a third short every month since June. Lifeboats, the Blind. Must speak to G.H. at the church, 8.15.',
    sam: 'Surgery poison book, 2nd Oct: Mr Ames’s digitalis written ten times too strong, then altered after he died. Must speak to S.O. at the church, 8.15.',
    penry: 'Roof fund: £212 subscribed, £40 spent on the roof. The rest to a lady in Nettleton. Must speak to A.P. at the church, 8.15.',
    tom: 'North aisle lead sold to Pratt’s yard, Nettleton — receipts came through the post to the Forge. Must speak to T.F. at the church, 8.15.',
    beatrice: 'Nettleton head office staff list, 1938: a “B. Pryor”, counter clerk, dismissed over postal orders. The new appointment is the same woman. Must speak to her at the church, 8.15, before she takes the post.',
  };

  // Behind the bottom drawer upstairs, which won't quite shut: Harriet's own list. These were
  // her rooms. One line is underlined twice, and that is the matter that killed her.
  const drawerNote = (C) => {
    const all = ['arthur', 'jack', 'gladys', 'sam', 'penry', 'tom', 'beatrice'];
    const line = { arthur: 'Glebe sheep', jack: 'Swan — the lorry', gladys: 'Charity tins', sam: 'Poison book, 2 Oct', penry: 'Roof fund', tom: 'North aisle lead', beatrice: 'Nettleton staff lists, 1938' };
    return 'The bottom drawer won’t shut. Behind it, fallen down the back, a page in Harriet’s pencil — the matters she was looking into: ' +
      all.map((k) => k === C ? `“${line[k]}”, underlined twice — [[${people[k].motive}|${words[people[k].motive][0]}]]` : `“${line[k]}”`).join(', ') + '.';
  };

  // the churchyard: five crooked things
  const churchyard = (C) => [
    { id: 'vase', label: 'A flower vase on a grave', text: 'A jam jar of chrysanthemums, knocked over and set up again. Nothing — just the wind.' },
    { id: 'rail', label: 'The step handrail', text: 'The iron handrail is bent outward at the third step, as if someone was thrown against it — or grabbed it.' },
    { id: 'mat', label: 'The vestry doormat', text: 'Under the mat, the stone is scored with heel marks — two sets, one dragging. People who slip do not scuffle.' },
    { id: 'lantern', label: 'The vestry lantern', text: 'Candle wax has dripped down the lantern and onto the top step. The vestry is always dripping. That proves nothing about anyone.' },
    { id: 'notice', label: 'A torn notice in the railings', text: `One of Harriet’s [[notices|parish notices]], torn, caught in the railings. On it, the shape of a thumb in [[${people[C].trace}|${words[people[C].trace][0]}]], where somebody snatched at it.` },
  ];

  // ------------------------------------------------------------ the knitting ledger
  // blanks: { id, ok: [word ids] }   a blank listing several accepts any of them.
  // `group` blanks accept the group's answers in any order.
  function ledger(C) {
    const P = people;
    const fill = sackFillers(C);
    const rows = SUSPECTS.map((s) => {
      const p = P[s];
      const witness = s === 'beatrice' ? 'your ticket stub' : P[p.witness].name;
      const who = s === 'beatrice' ? 'You, Beatrice Pym, say you came on' : `${p.name} says ${s === 'gladys' ? 'she' : 'he'} was ${s === 'sam' ? 'on a house call at' : 'at'}`;
      return { text: `${who} {${s}_at} at 8.15; ${witness} {${s}_v}.`,
        blanks: { [s + '_at']: [p.alibi], [s + '_v']: [s === C ? 'denies' : 'confirms'] } };
    });
    return [
      { id: 'harriet', title: 'I. Harriet', day: 1,
        lines: [
          { text: 'Harriet Vale was found at the foot of {where} on the night of the 26th of November.', blanks: { where: ['vestry_steps'] } },
          { text: 'The doctor put her death at about {when}.', blanks: { when: ['t815'] } },
          { text: 'Her {lost} has not been seen since, and pages are cut from her {cut}.', blanks: { lost: ['keyring'], cut: ['dayledger'] } },
        ] },
      { id: 'box', title: 'II. The St Jude’s box', day: 3,
        lines: [
          { text: 'Harriet emptied {box} at {coll} on her way up to the church.', blanks: { box: ['sjbox'], coll: ['t730'] } },
          { text: 'A squall blew in at {sq1} and passed by {sq2}.', blanks: { sq1: ['t800'], sq2: ['t845'] } },
          { text: 'Afterwards {fa} and {fb} posted letters there, dry.', blanks: { fa: fill, fb: fill }, group: ['fa', 'fb'] },
          { text: 'A third letter was posted in the squall, unsigned, and smeared with {smear}.', blanks: { smear: [P[C].trace] } },
        ] },
      { id: 'alibis', title: 'III. Where everyone was at 8.15', day: 4, lines: rows },
      { id: 'traces', title: 'IV. Traces', day: 5,
        lines: [
          { text: 'Red clay belongs with {tr_clay}; sawdust with {tr_sawdust}; flour with {tr_flour}.', blanks: { tr_clay: ['arthur'], tr_sawdust: ['jack'], tr_flour: ['gladys'] } },
          { text: 'Gentian violet with {tr_violet}; candle wax with {tr_wax}; engine grease with {tr_grease}.', blanks: { tr_violet: ['sam'], tr_wax: ['penry'], tr_grease: ['tom'] } },
          { text: 'Red stamp ink, from the counter’s own pad, with {tr_redink}.', blanks: { tr_redink: ['beatrice'] } },
          { text: 'The thumb on Harriet’s torn notice was in {scene}, so the hand was {hand}’s.', blanks: { scene: [P[C].trace], hand: [C] } },
        ] },
      { id: 'motive', title: 'V. Why', day: 7,
        lines: [
          { text: 'Harriet had found out that {mwho} was {mwhat}, and arranged to meet at {mwhen} at the church.', blanks: { mwho: [C], mwhat: [P[C].motive], mwhen: ['t815'] } },
          { text: 'Her missing page was hidden in {mhide}, with her {mkeys}.', blanks: { mhide: [P[C].container], mkeys: ['keyring'] } },
        ] },
    ];
  }

  // ------------------------------------------------------------ night 11
  const sealedTo = {
    arthur: 'Messrs Holt & Carver, Solicitors, Market Harborough', jack: 'Mr L. Spink, Turf Accountant, Nettleton',
    gladys: 'Mrs R. Henderson (her sister), Skegness', sam: 'Messrs Holt & Carver, Solicitors, Nettleton',
    penry: 'Mrs Ivy Lane, 4 Station Road, Nettleton', tom: 'J. Pratt, Scrap Metals, Nettleton',
    beatrice: 'Mrs B. Pym, Post Office, Oakhaven — in Harriet Vale’s hand, postmarked 26 NOV, never delivered',
  };
  const confession = {
    arthur: 'I only meant to frighten her off it. She had the receipts from Harborough in her hand and she said she’d give them to the Ministry in the morning. I took her by the arm. The step was wet. I took her keys and went to the post office for the rest, and I cut it out of her book. It’s in the feed bin. God help me.',
    jack: 'She’d read Spink’s letters — every week, through her hands — and she knew about the lorry. She said I could tell the excise man myself or she would. I grabbed for her notices, she pulled, and she went. I took the page out of her book that night with her own keys. It’s in the brandy cask.',
    gladys: 'Harriet counted the tins with me every month. She knew. She said she’d cover it if I paid it back by Christmas, and I couldn’t, and she said Monday then, and I lost my temper on those steps. It was over in a second. Her keys and the page are in the flour bin. I bake over them every morning.',
    sam: 'Mr Ames died because of a decimal point I wrote. I altered the book. Harriet saw the Ministry’s query come through the post. I went to beg her. She would not be begged. She fell when I caught her arm — I swear to you she fell — and I signed it as an accident because I could not bear to write what it was. The page is behind the tinctures.',
    penry: 'Ivy, they will know soon. Harriet found the roof fund. I went to the steps to ask her for a week. Only a week. She turned away from me and I took hold of her and she went down. I have the page in the 1898 register. I have prayed over it every night and it is still there in the morning.',
    tom: 'Pratt — no more lead, ever. The postmistress saw your receipts and she’s dead now and it was me that did it, on the vestry steps, over twenty pounds of roofing. Her keys and her page are in my chest. Don’t write again.',
    beatrice: 'Dear Mrs Pym — or Miss Pryor, as I knew you at Nettleton. I have seen the staff lists. I will not let you take this post under a name that isn’t yours. Meet me at St Jude’s at a quarter past eight tomorrow and we will settle it like grown women. — H. Vale. (Under it, in your own hand, in pencil: “Settled.”)',
  };

  // ------------------------------------------------------------ the Village Hall
  // The culprit gives four statements. Each is broken by presenting one of `breaks`.
  const statements = (C) => {
    const p = people[C];
    const alibiWord = words[p.alibi][0];
    const S = C === 'beatrice' ? [
      `“I came to Oakhaven on ${alibiWord}, on the 27th. I had never been here before.” You hear yourself say it to the hall, and it sounds rehearsed.`,
      '“I was nowhere near St Jude’s that night. I was on a train.”',
      '“I never laid a hand on Harriet Vale. I never met her.”',
      '“What reason could I possibly have had?”',
    ] : [
      `“On the night of the 26th I was at ${alibiWord} from eight until nine, and ${people[p.witness].name} will tell you so.”`,
      '“I was not within a quarter-mile of St Jude’s all evening. Ask anyone.”',
      '“I never laid a hand on Harriet. Not that night, not ever.”',
      '“And why would I? Harriet and I never had a cross word between us.”',
    ];
    return S.map((t, i) => ({ text: t, breaks: [['ev_alibi', 'ev_doc'], ['ev_letter'], ['ev_notice'], ['ev_page', 'ev_steamed', 'ev_motive']][i] }));
  };
  // what an innocent person says when wrongly accused — every word of it true
  const innocentStatements = (who) => {
    const p = people[who];
    return [
      who === 'beatrice' ? '“I came on the 27th, on the 10.40. I have the stub somewhere.”' : `“I was at ${words[p.alibi][0]}. ${people[p.witness] ? people[p.witness].name : 'Anyone'} saw me.”`,
      '“I never went up the lane. Why would I, in that rain?”',
      '“I liked Harriet. Everyone liked Harriet.”',
      '“I don’t know what you think you know, Mrs Pym.”',
    ].map((t) => ({ text: t, breaks: [] }));
  };

  const evidenceInfo = {
    ev_alibi: { name: 'The alibi that failed', need: 'alibis', desc: (C) => C === 'beatrice' ? 'Your ticket stub is dated the 26th. You were here.' : `${people[people[C].witness].name} will not back ${people[C].name}’s account of 8.15.` },
    ev_doc: { name: 'The record at their place', desc: (C) => workplace[C].doc(C) },
    ev_letter: { name: 'The rain-spotted letter', need: 'box', desc: (C) => `Posted in the squall at the St Jude’s box, unsigned, smeared with ${words[people[C].trace][0]}.` },
    ev_notice: { name: 'The torn notice', need: 'traces', desc: (C) => `Harriet’s notice from the railings, a thumb in ${words[people[C].trace][0]} — and that belongs with ${people[C].name}.` },
    ev_page: { name: 'Harriet’s missing page', desc: (C) => page[C] },
    ev_steamed: { name: 'The steamed letter', desc: (C) => confession[C] },
    ev_motive: { name: 'What Harriet had found', need: 'motive', desc: (C) => `Harriet had proved ${people[C].name} was ${words[people[C].motive][0]}.` },
    ev_scrapes: { name: 'Scuffed heel marks', desc: () => 'Two sets of heel marks under the vestry mat, one dragging. Not a slip.' },
    ev_rail: { name: 'The bent handrail', desc: () => 'Bent outward at the third step, as if somebody was thrown against it.' },
    ev_ticket: { name: 'Your ticket stub', desc: (C) => C === 'beatrice' ? 'NETTLETON to OAKHAVEN, 26 NOV, 6.52 PM.' : 'NETTLETON to OAKHAVEN, 27 NOV, 10.40 AM.' },
    ev_spectacles: { name: 'Jack’s spectacles', desc: () => 'Found on the churchyard wall — but lost, Jack says, the Sunday before.' },
  };

  const confess = {
    arthur: 'Arthur Finch takes his cap off, and then doesn’t seem to know what to do with it. “Twelve sheep,” he says. “Twelve sheep, and I did that for twelve sheep.”',
    jack: 'The landlord of the Black Swan laughs, once, and nobody in the hall joins in. “I’d have paid it off,” Jack says. “One good week. I only ever needed one good week.”',
    gladys: 'Gladys Henderson sits down very straight. “It was for the shop,” she says. “It was only ever going to be for a month.” She looks at the collecting tin on the trestle table and starts to cry.',
    sam: 'Dr Okafor closes his eyes. “I signed it as a fall,” he says quietly, “because I could not write what it was. I have written it a hundred times since, in my head. Inspector, I will come with you.”',
    penry: 'The vicar folds his hands as if to pray, and doesn’t. “I asked her for a week,” he says. “She was turning away. I only wanted her to turn round.”',
    tom: 'Tom Ferrier stands, and the chair goes over behind him. Nobody moves. “Twenty pound of roofing,” he says. “That’s what she was worth to me. Write that down.”',
    beatrice: 'You stand up in the Village Hall, and the urn ticks, and every face in Oakhaven turns to you. “My name,” you say, “was Beatrice Pryor.” You have written it down so that you need not think about it again. You find you have been thinking about it every day.',
  };

  return { people, SUSPECTS, words, CATS, days, prelude, intro, visits, errands, nervousHello, holes, fillerWhat, towns, specials, pileSize, tray,
    sackFillers, sackLetter, culpritLetter, culpritLetterBack, ticketText, places, placeOrder, workplace, page, churchyard, ledger,
    sealedTo, confession, drawerNote, statements, innocentStatements, evidenceInfo, confess };
})();
