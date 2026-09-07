/* Letters to Ashfield — the writing.
 *
 * Everything the village is lives here. The engine (game.js) only knows the shapes.
 *
 * The job is the pile. Every morning the van leaves one on the desk, and it holds three
 * sorts of thing:
 *
 *   letter — an envelope. You see the front and nothing else. It goes to the house on it.
 *   thing  — something that turned up with no address. It goes to whoever it belongs to,
 *            and you work that out from the marks on it and what is in your diary.
 *   note   — a slip. You read it, it goes in the diary, and that is the whole of it.
 *
 * A mark is something you can see on a thing. A clue is what a mark means and who it points
 * at. Clues come off notes, out of answers, and off the map. That is the entire puzzle, and
 * adding to it is adding a row, not a chapter.
 *
 * Text markup: {{name}}  [[shows this|then this]]  ~~struck~~  __smudged__  ^^shivering^^
 * Effects: { trust: {who: n}, flags: [], unflag: [], remove: who, ending: 'keep'|'letgo'|'burn' }
 *          or (api) => {}
 */
window.ASHFIELD = (function () {

  // ------------------------------------------------------------ the village
  const villagers = {
    marion: {
      name: 'Marion Tebbutt', role: 'The shop', address: 'The Shop, Front Street (next door)',
      bio: (a) => a.day >= 9 ? 'Runs the shop next door, and the village. Has been fifty-one for some time.' : 'Runs the shop next door to the post office, and, by general agreement, the village. Knows everyone. Tells most of it.',
      goneBio: 'Runs the shop.',
    },
    penry: {
      name: 'Rev. Aldous Penry', role: 'St Anne’s', address: 'The Vicarage, by St Anne’s',
      bio: (a) => a.has('rev_confess') ? 'The vicar. Keeps the register. Has set a chair for every Keeper who has gone, and does not know how to stop.' : 'The vicar. Formal, kind, and careful with the parish register in a way that people have started to notice.',
    },
    wren: {
      name: 'Wren Hollis', role: 'The Fox & Hounds', address: 'The Fox & Hounds, on the green',
      bio: (a) => a.has('wren_aware') ? 'Nineteen. Pulls pints at the Fox. Has started writing to you, not the Keeper. Can see the light on your face.' : 'Nineteen. Pulls pints at the Fox and wants to be somewhere else. Writes in lowercase and does not waste words.',
      goneBio: 'There is a room going at the Fox & Hounds.',
    },
    tom: {
      name: 'Tom Ferrier', role: 'Low Farm', address: 'Low Farm, up the mill road',
      bio: (a) => a.has('saw_wall') ? 'Farmer. Widower. Has a collie called Bracken and has seen the wall in the mill. Not a clever man, he says. He is wrong about that.' : 'Farmer at Low Farm. Widower. Few words, all of them meant. Has a brown collie called Bracken.',
    },
    edith: {
      name: 'Edith Marlow', role: 'Rose Cottage', address: 'Rose Cottage, the far end of the village',
      bio: (a) => a.has('edith_diary') ? 'Eighty-something. Remembers everything, including things that have not happened yet. Keeps a diary.' : 'Eighty-something. Writes long letters in a beautiful hand. Remembers everything, which she says is a burden.',
    },
    sam: {
      name: 'Dr Sam Okafor', role: 'The surgery', address: 'The Surgery, Front Street',
      bio: (a) => a.has('sam_register') ? 'The village GP. Rational to a fault. Has read the parish register and cannot unread it.' : 'The village GP, eighteen months in. Precise, private, and worried about something in the records.',
    },
  };

  // ------------------------------------------------------------ days
  const days = {
    1: {
      week: 'Monday',
      intro: (a) => a.loop ? 'Monday. Again. The porch smells of wet coats and someone else’s coffee, and you know that already.' : 'Monday. The porch smells of wet coats and someone else’s coffee. The map on the wall is yours, and so is everything under it.',
      night: 'Night. The porch light stays on by itself.',
    },
    2: { week: 'Tuesday', intro: 'Tuesday. Wind from the mill side. Something in the pile is not a letter and has no name on it.', night: 'Night. A dog, somewhere up the valley, then nothing.' },
    3: { week: 'Wednesday', intro: 'Wednesday. Rain on the porch roof. There are muddy prints outside that stop at the door and do not go back.', night: 'Night. Rain. The map does not get damp, which you only notice later.' },
    4: { week: 'Thursday', intro: 'Thursday. Fresh flowers in the churchyard, north corner. One of this morning’s letters has left grey marks on your fingers.', night: 'Night. You wash your hands twice. The grey comes off. Something does not.' },
    5: { week: 'Friday', intro: 'Friday. The village hall still smells of the supper. There was a chair with nobody in it.', night: 'Night. Somebody is walking up the mill road with a lamp. They do not come back down.' },
    6: { week: 'Saturday', intro: 'Saturday. The pile has been squared off and the map straightened. Not by you.', night: 'Night. You dream about paper. In the dream it is warm.' },
    7: { week: 'Sunday', intro: 'Sunday. Bells, then quiet, then bells again, which is wrong. The van came anyway.', night: 'Night. There is post on Sunday. You had not thought about that until now.' },
    8: { week: 'Thursday', intro: '[[Monday.|Thursday.]] Fresh flowers in the churchyard, north corner. The map is warm to the touch, along the mill road.', night: 'Night. The porch light stays on. It has never been switched off. You check.' },
    9: { week: 'Thursday', intro: 'Thursday. It has been Thursday for some time. Half of what is in the pile is addressed to you, and it means you.', night: 'Night. Something behind the map turns over in its sleep.' },
    10: { week: 'Thursday', intro: 'Thursday. Somebody has pinned the flowers from the churchyard to the corner of the map. There is a card.', night: 'Night. You hold the pen. You realise you have been holding it all day.' },
    11: { week: 'Thursday', intro: 'Thursday. Everybody has written, and not one of them has asked you anything. That is how you know what today is.', night: '' },
    12: {
      week: (a) => a.ending === 'letgo' ? 'Thursday' : 'Sunday',
      intro: (a) => a.ending === 'letgo'
        ? 'Thursday. There is a house missing from the map, and you are the only one who can see the shape of where it was.'
        : 'Sunday. Bells, then quiet. The map is the same size it always was. So is the village.',
      night: '',
    },
  };

  // ------------------------------------------------------------ where people are
  const places = {
    shop: 'the shop', shopflat: 'the flat above the shop', church: 'St Anne’s', vestry: 'the vestry',
    fox: 'the Fox & Hounds', cellar: 'the pub cellar', lowfarm: 'Low Farm', gate: 'the gate at Low Farm',
    rose: 'Rose Cottage', surgery: 'the surgery', hall: 'the village hall', porch: 'the porch',
    green: 'the green', churchyard: 'the churchyard, north corner', millroad: 'the mill road',
    mill: 'the old mill', road: 'the road out',
  };

  // Their work, and the gap it leaves. You are the postmaster: you know what everybody does,
  // because you deliver to it, and knowing the job is how you know when to knock.
  const work = {
    marion: {
      job: 'The shop, half eight to one and two to four, and she is behind the counter for every minute of it.',
      meet: { at: 'shop', hour: 13, doing: 'the counter, in the hour she shuts the door and calls it her dinner' },
    },
    penry: {
      job: 'Morning Prayer at half seven, to nobody. The parish register in the vestry all afternoon, and the lamp on well past it.',
      meet: (a) => a.day >= 4
        ? { at: 'vestry', hour: 15, doing: 'the vestry, the register open, the lamp lit in broad daylight' }
        : { at: 'vestry', hour: 15, doing: 'the vestry, between the register and the parish post' },
    },
    wren: {
      job: 'The lunchtime shift at the Fox, twelve to three, and the evening one from six. The hours in between are hers, and she walks them.',
      meet: { at: 'fox', hour: 15.5, doing: 'the empty bar between shifts, the chairs still up on the tables' },
    },
    tom: {
      job: 'Up at half five for the yard and the beasts. Stood at the gate from five in the evening, looking up the road, which is when he stops.',
      meet: { at: 'gate', hour: 17.5, doing: 'the gate, at the end of the day, because that is the only end there is' },
    },
    edith: {
      job: 'Retired from nothing in particular. There are the letters, the window, and the remembering, and she says the last is full time.',
      meet: { at: 'rose', hour: 15, doing: 'Rose Cottage, mid-afternoon, the kettle on before you knock' },
    },
    sam: {
      job: 'Surgery Tuesday and Thursday mornings, half eight to eleven. Paperwork the rest of the week, rounds in the afternoons.',
      meet: (a) => (a.week === 'Tuesday' || a.week === 'Thursday')
        ? { at: 'surgery', hour: 11.5, doing: 'the surgery, after the last of the morning’s patients has gone' }
        : { at: 'green', hour: 13, doing: 'the bench on the green, dinner time, one sandwich each' },
    },
  };

  // ------------------------------------------------------------ marks, and what they mean
  // A mark is a thing you can see without knowing anything. A clue is what it means. The whole
  // puzzle is the gap between those two, and filling it in is the game.
  //
  //   marks[key]  — how the mark reads on the thing, in your own hand
  //   clues[key]  — { who, text }: what it means, and whose door it points at
  //
  // Adding a new thing to the pile is picking two of these. Adding a new clue is one line.
  const marks = {
    wire:     'the handle has been mended with wire',
    twine:    'a loop of orange baler twine, knotted twice',
    dogcoat:  'short brown hairs, the kind that get everywhere',
    till:     'a till receipt from the shop, folded small',
    pad:      'the corner of a shop order pad, torn off',
    pricegun: 'a price label, half peeled and put back crooked',
    oil:      'a smear of lamp oil, and the smell of it',
    cross:    'a cut in the shape of a cross',
    hymn:     'numbers pencilled in a column: 24, 108, 397',
    biro:     'gone over and over in biro until the paper went furry',
    beer:     'a ring from a wet glass, and a Fox & Hounds mat',
    bus:      'the 8.10 circled, and the 6.40 back not circled',
    script:   'a prescription slip, blank except for a date',
    latin:    'a small, exact hand, and Latin short forms',
    bench:    'a fleck of green paint, the green of one bench',
    lavender: 'it smells of lavender, faintly and completely',
    copper:   'copperplate, taught before the war and never lost',
    rose:     'a rose thorn caught in the seam',
  };

  const clues = {
    wire:     { who: 'tom',    text: 'Tom mends things rather than replacing them. He has not bought a new one of anything in years.' },
    twine:    { who: 'tom',    text: 'Orange baler twine, knotted twice. Everything at Low Farm is held together with it.' },
    dogcoat:  { who: 'tom',    text: 'Bracken is a brown collie, and the hair gets on anything that goes up that road.' },
    till:     { who: 'marion', text: 'The shop’s till receipts. Everything in Ashfield is from the shop, so a receipt says who kept it, not who bought it — and Marion keeps hers.' },
    pad:      { who: 'marion', text: 'The shop order pad. Marion writes on the corners of it and tears them off, which is most of her correspondence.' },
    pricegun: { who: 'marion', text: 'Marion prices things twice when she is thinking about something else, and puts the label back crooked.' },
    oil:      { who: 'penry',  text: 'The vestry lamp burns oil, and the Reverend fills it himself, and gets it on everything.' },
    cross:    { who: 'penry',  text: 'Church ironwork is cut with a cross at the end. There are four such locks in Ashfield and they are all his.' },
    hymn:     { who: 'penry',  text: 'Hymn numbers, pencilled in a column, are how the Reverend makes a list of anything at all.' },
    biro:     { who: 'wren',   text: 'Wren goes over a thing in biro while she is thinking, until the paper gives out. It is not idleness.' },
    beer:     { who: 'wren',   text: 'Nothing leaves the Fox with a mat under it unless Wren put it down while she was working.' },
    bus:      { who: 'wren',   text: 'The 8.10 goes and the 6.40 comes back. Only one person in this village has an opinion about that.' },
    script:   { who: 'sam',    text: 'A prescription slip used as a bookmark. Sam has a pad in every coat and uses them for everything but prescriptions.' },
    latin:    { who: 'sam',    text: 'The small exact hand with the Latin short forms is a doctor’s, and there is one doctor.' },
    bench:    { who: 'sam',    text: 'The bench on the green is the only thing in Ashfield painted that green, and Sam eats there every dinner time.' },
    lavender: { who: 'edith',  text: 'Rose Cottage smells of lavender and so does everything that has been in it, for weeks afterwards.' },
    copper:   { who: 'edith',  text: 'Copperplate, taught before the war. There is one hand like that left in the village and it is Edith’s.' },
    rose:     { who: 'edith',  text: 'Edith prunes in all weathers and does not wear gloves, and the thorns go home with whatever she was carrying.' },
  };

  // Who can explain what. Ask somebody about a thing and they tell you about any mark on it
  // that they would recognise — and if it is theirs, they say so. Six lines of data, and every
  // thing you add is a puzzle for free.
  const speaks = {
    marion: ['till', 'pad', 'pricegun', 'oil', 'lavender', 'beer', 'bus', 'dogcoat'],
    edith:  ['copper', 'lavender', 'rose', 'hymn', 'cross', 'wire'],
    penry:  ['oil', 'cross', 'hymn', 'copper', 'latin'],
    sam:    ['script', 'latin', 'bench', 'biro', 'twine'],
    wren:   ['biro', 'beer', 'bus', 'twine', 'pricegun'],
    tom:    ['wire', 'twine', 'dogcoat', 'bench'],
  };

  // What you get for asking somebody about something they know nothing about. It costs you the
  // day's question with that person either way, which is the whole economy.
  const shrugs = [
    'They turn it over, and hold it further away, and give it back. “Could be anybody’s.”',
    'A long look, and then a shake of the head. “Not one I know.”',
    '“I’d only be guessing,” they say, and do not guess, which you decide is a kindness.',
    'They look at it for slightly too long, and then say no, and mean it.',
    '“Ask Marion,” they say, which is what everybody in Ashfield says about everything.',
  ];

  // What it sounds like when somebody recognises their own.
  const claims = {
    marion: '“That’s mine,” Marion says, before you have finished holding it up. “Where was it? No — don’t tell me where it was.”',
    penry:  '“Ah,” says the Reverend, and takes it in both hands. “I did not know that was gone. Which is worse, rather than better.”',
    wren:   '“oh,” she says. “yeah. that’s mine.” And then, because she has decided to: “thanks. i mean it.”',
    tom:    'Tom turns it over twice, the way he turns everything over twice. “Aye,” he says. “That’s off our place.”',
    edith:  '“Of course it is mine, dear,” Edith says. “Everything old in this village is mine. It is the only advantage.”',
    sam:    '“Mine,” Sam says, and then, precisely: “I put it down to think, and putting things down to think is how I lose them.”',
  };

  // ------------------------------------------------------------ the pile
  // Three sorts of thing, all of them on the same desk in the same heap.
  //
  //   { id, day, kind: 'letter', to, face }                 an envelope, address on the front
  //   { id, day, kind: 'letter', to: 'keeper', face, read }  one for you; you open this one
  //   { id, day, kind: 'thing', owner, what, art, marks }    no address; the marks are the address
  //   { id, day, kind: 'note', from, text, gives?, names?, asks? }   a slip; read it, keep it
  //
  // On a note: `gives` are clue keys it teaches, `names` is a thing id it settles outright,
  // `asks` is a thing id somebody is looking for — which settles it just as well, and is the
  // most common way a village finds anything.
  //
  // `when` is optional on all of them.
  const pile = [
    // ---- day 1: nothing but envelopes. Learn where the doors are.
    { id: 'p1a', day: 1, kind: 'letter', to: 'marion', face: 'Mrs M. Tebbutt, The Shop, Front Street, Ashfield' },
    { id: 'p1b', day: 1, kind: 'letter', to: 'penry', face: 'The Vicarage, by St Anne’s' },
    { id: 'p1c', day: 1, kind: 'letter', to: 'tom', face: 'T. Ferrier, Low Farm, up the mill road' },
    { id: 'p1d', day: 1, kind: 'letter', to: 'keeper', face: 'The Keeper of the Map, the Post Office, Ashfield',
      read: {
        from: 'parish', subject: 'Appointment',
        body: 'The Parish Council confirms {{name}} as Postmaster of Ashfield, following the departure of the previous holder.\n\nThe duties are the round, the counter, and the map. The map is the parish’s and stays on the wall. Do not take it down to clean behind it.\n\nAnything found on the round is to be returned to its owner. The Council does not keep a lost property book and would prefer not to start one.',
        sign: 'Parish Council of Ashfield',
        replies: [
          { text: 'Understood.', effects: { flags: ['took_post'] }, outcome: 'You put it in the drawer with the string and the spare pen. Later you find it has been moved to the top of the pile, face up.' },
          { text: 'Who was the previous holder?', effects: { flags: ['took_post', 'asked_before'] },
            outcome: 'There is no answer, because there is nobody to answer. But you notice the sentence again: *following the departure of the previous holder.* No name. Every notice you will get for a fortnight is worded like that.' },
        ],
      } },

    // ---- day 2: the first thing with no name on it, and the note that answers it
    { id: 'p2a', day: 2, kind: 'letter', to: 'wren', face: 'Miss W. Hollis, c/o the public house on the green' },
    { id: 'p2b', day: 2, kind: 'letter', to: 'sam', face: 'THE SURGERY, Front Street — MEDICAL. DO NOT BEND.' },
    { id: 'p2c', day: 2, kind: 'letter', to: 'edith', face: 'Mrs E. Marlow, the far end of the village' },
    { id: 't_mug', day: 2, kind: 'thing', owner: 'tom', art: 'mug',
      what: 'A white enamel mug, chipped at the rim', marks: ['wire', 'dogcoat'] },
    { id: 'n2a', day: 2, kind: 'note', from: 'marion', gives: ['wire'],
      text: 'New postmaster — anything comes in with a mend on it rather than a new one, that’s Low Farm. Tom hasn’t bought a new anything since I’ve had the shop. Wire, mostly. — M.T.' },

    // ---- day 3: the first thing you have to work for
    { id: 'p3a', day: 3, kind: 'letter', to: 'edith', face: 'Rose Cottage' },
    { id: 'p3b', day: 3, kind: 'letter', to: 'sam', face: 'Dr S. Okafor — from the Registrar' },
    { id: 't_glasses', day: 3, kind: 'thing', owner: 'marion', art: 'glasses',
      what: 'A spectacle case, tartan, with a receipt folded inside', marks: ['till', 'pricegun'] },
    { id: 'n3a', day: 3, kind: 'note', from: 'someone', gives: ['dogcoat'],
      text: 'Brown dog up and down the mill road all week. Not a stray — it’s Ferrier’s, that’s Bracken. Anything that’s been up there comes back wearing him.' },
    { id: 'p3c', day: 3, kind: 'letter', to: 'keeper', face: 'The Keeper. Hand delivered, no stamp.',
      read: {
        from: 'penry', subject: 'A small matter of the register',
        body: 'You will forgive a note rather than a call. I keep the parish register, as my predecessors did, and I have been adding it up.\n\nIt does not come out right, and it has not come out right for some time, and I have got as far as wanting somebody who is not from here to look at it with me.\n\nYou are not from here. That is not a slight. It is the entire qualification.',
        sign: 'A. Penry',
        replies: [
          { text: 'I will look at it with you.', effects: { trust: { penry: 2 }, flags: ['rev_promise'] },
            outcome: 'The reply goes back the way it came, under the vicarage door, and the vestry lamp is lit an hour early that afternoon. He does not come and find you. He waits, which is worse and better.' },
          { text: 'Numbers are not really my job.', effects: { trust: { penry: -1 } },
            outcome: 'A short note comes back: *Quite so. Forgive the imposition.* He is unfailingly polite about it, all fortnight, in a way you come to dislike very much.' },
        ],
      } },

    // ---- day 4
    { id: 'p4a', day: 4, kind: 'letter', to: 'return', face: 'Mrs H. Vale, the Post Office, Ashfield' },
    { id: 'p4b', day: 4, kind: 'letter', to: 'wren', face: 'THE FOX & HOUNDS — brewery, invoice enclosed' },
    { id: 'p4c', day: 4, kind: 'letter', to: 'penry', face: 'Rev. A. Penry, St Anne’s — Diocesan Registry, Marriages & Burials' },
    { id: 't_thimble', day: 4, kind: 'thing', owner: 'edith', art: 'thimble',
      what: 'A silver thimble, worn thin at the crown', marks: ['lavender', 'rose'] },
    { id: 'n4a', day: 4, kind: 'note', from: 'marion', gives: ['lavender', 'till'],
      text: 'Two things while I think of it. Anything that smells of lavender has been in Rose Cottage — she has it in every drawer and it never comes out. And if a till receipt turns up in something, it’s not who bought it, everyone buys here. It’s who keeps them. I keep mine. — M.T.' },

    // ---- day 5: the supper, and the empty chair
    { id: 'p5a', day: 5, kind: 'letter', to: 'tom', face: 'LOW FARM — veterinary account, second notice' },
    { id: 'p5b', day: 5, kind: 'letter', to: 'wren', face: 'W. Hollis — School of Nursing, admissions' },
    { id: 'p5c', day: 5, kind: 'letter', to: 'marion', face: 'The Shop — a biscuit tin, by post, no sender' },
    { id: 't_matchbox', day: 5, kind: 'thing', owner: 'wren', art: 'parcel',
      what: 'A matchbox with four matches and a phone number in it', marks: ['beer', 'biro'] },
    { id: 'n5a', day: 5, kind: 'note', from: 'someone', gives: ['beer'],
      text: 'Nothing leaves the Fox with a beer mat stuck to it unless Wren was carrying it. She puts everything down on a mat. Landlord’s rule, and she is the only one who keeps it.' },

    // ---- day 6
    { id: 'p6a', day: 6, kind: 'letter', to: 'edith', face: 'Mrs E. Marlow, Rose Cottage — from a firm of solicitors' },
    { id: 'p6b', day: 6, kind: 'letter', to: 'sam', face: 'The Surgery — parish register enquiry, ref. 41/3' },
    { id: 't_timetable', day: 6, kind: 'thing', owner: 'wren', art: 'timetable',
      what: 'A bus timetable, folded to one column, annotated', marks: ['biro', 'bus'] },
    { id: 'n6a', day: 6, kind: 'note', from: 'wren', asks: 't_matchbox',
      text: 'if a matchbox turns up with a number in it that’s mine and i want it back please. not the matches. the number. — w' },
    { id: 'p6c', day: 6, kind: 'letter', to: 'keeper', face: 'The Keeper, the Post Office, Ashfield. By hand.',
      read: {
        from: 'wren', subject: 'the map',
        body: 'you’ve got the map on the wall behind you. every house on it.\n\ni counted them once when i was about eleven, waiting for a stamp. i got forty. everyone says forty-one. i have counted it about nine times since and i always get forty and i have never told anybody that, because of what people are like here.\n\nyou’re new. count it. don’t tell me the answer, just count it.',
        sign: 'w',
        replies: [
          { text: 'I counted. Forty.', effects: { trust: { wren: 2 }, flags: ['counted_forty', 'wren_ref'] },
            outcome: 'She reads it behind the bar with her back to the room, and folds it very small, and puts it in the pocket she keeps things in. She does not bring it up again for four days. When she does, it is not about the map.' },
          { text: 'I counted. Forty-one.', effects: { trust: { wren: -1 }, flags: ['wren_ref'] },
            outcome: 'She does not answer. You count again that night, twice, and get forty, and you have already said what you said.' },
          { text: 'Leave it.', outcome: 'The map stays uncounted. It sits behind you all fortnight being a map, and once or twice you catch yourself not looking at it.' },
        ],
      } },

    // ---- day 7
    { id: 'p7a', day: 7, kind: 'letter', to: 'penry', face: 'The Vicarage — account, lamp oil, quarterly' },
    { id: 'p7b', day: 7, kind: 'letter', to: 'tom', face: 'T. Ferrier — a card, black-edged' },
    { id: 'p7c', day: 7, kind: 'letter', to: 'return', face: 'Mrs H. Vale, the Post Office, Ashfield. Postmarked Ashfield.' },
    { id: 't_key', day: 7, kind: 'thing', owner: 'penry', art: 'key',
      what: 'A key on a loop of grey string, long and iron', marks: ['cross', 'oil'] },
    { id: 'n7a', day: 7, kind: 'note', from: 'edith', gives: ['cross', 'oil'],
      text: 'Dear postmaster — church iron is cut with a cross at the end of the ward, always was. And the Reverend fills that lamp himself and gets the oil on everything he owns. Those two together are not a mystery. — E.M.' },

    // ---- day 8: the letters start being about you
    { id: 'p8a', day: 8, kind: 'letter', to: 'marion', face: 'Mrs M. Tebbutt — a card, ‘On Your 51st’' },
    { id: 'p8b', day: 8, kind: 'letter', to: 'edith', face: 'Mrs E. Marlow, Rose Cottage — a diary, returned unread' },
    { id: 't_bookmark', day: 8, kind: 'thing', owner: 'sam', art: 'book',
      what: 'A paperback about cathedrals, read to page ninety three times', marks: ['script', 'bench'] },
    { id: 'n8a', day: 8, kind: 'note', from: 'marion', gives: ['bench', 'script'],
      text: 'The doctor eats on the green bench every dinner and puts things down on it. That green isn’t anywhere else in the village. And those little slips — prescription pads — Sam has one in every coat and never once writes a prescription on them. — M.T.' },
    { id: 'p8c', day: 8, kind: 'letter', to: 'keeper', face: 'The Keeper. No stamp. Warm.',
      read: {
        from: 'ash', subject: '',
        body: 'you have been sorting us\n\nforty houses on that wall and forty-one people in this village and you have not once put a letter through the door of the one that is not on it\n\nnobody does. that is the whole of the trick. it is not a hidden house. it is a house you have walked past every day and not needed\n\n^^look at the map. look at the corner nearest you.^^',
        sign: '',
        replies: [
          { text: 'Look at the corner nearest you.', effects: { flags: ['saw_corner'] },
            outcome: 'The corner nearest you is the post office. It is drawn like all the others: a roof, a shadow, a pillar box. There is a name under it. It is your name. It was your name yesterday too, and you would swear the ink is older than you are.' },
          { text: 'Put it in the drawer with the other one.', effects: { flags: ['drawer_two'] },
            outcome: 'It goes in the drawer face down. In the morning the drawer is warm, which is a thing you decide not to think about in front of a customer.' },
        ],
      } },

    // ---- day 9
    { id: 'p9a', day: 9, kind: 'letter', to: 'sam', face: 'Dr S. Okafor — a form, returned unsigned' },
    { id: 'p9b', day: 9, kind: 'letter', to: 'edith', face: 'Mrs E. Marlow, Rose Cottage — in her own hand' },
    { id: 't_button', day: 9, kind: 'thing', owner: 'keeper', art: 'button',
      what: 'A coat button, horn, with your own name inked inside', marks: [] },
    { id: 'n9a', day: 9, kind: 'note', from: 'ash', names: 't_button',
      text: 'the button is yours. check your coat. your coat has all its buttons. check it again tomorrow.' },
    { id: 'p9c', day: 9, kind: 'letter', to: 'keeper', face: '{{name}}, the Post Office, Ashfield',
      read: {
        from: 'sam', subject: 'Four hundred and eleven',
        body: 'I am going to write this down once and then not raise it again, because saying it out loud has not worked.\n\nThere are four hundred and eleven records in my cabinet. The parish register has four hundred and ten burials and baptisms for the same years. The Reverend has counted his and I have counted mine and neither of us will show the other, because we are both frightened of the same thing, which is being the one who is wrong.\n\nYou get both our post. You are the only person who could put the two books on one desk.',
        sign: 'S. Okafor',
        replies: [
          { text: 'Bring yours. I will ask him for his.', effects: { trust: { sam: 2, penry: 1 }, flags: ['reg_box', 'sam_register'] },
            outcome: 'It takes both of them four days to actually do it, and they do it at your counter, at closing, with the blind down. The number is forty-one, not forty. Sam says so first. Penry says he has known since March.' },
          { text: 'That is between the two of you.', effects: { trust: { sam: -1 } },
            outcome: 'Sam writes back one line — *Understood, and fair* — and goes on carrying it alone, and you go on delivering to both ends of Front Street, twice a day, for the rest of the fortnight.' },
        ],
      } },

    // ---- day 10
    { id: 'p10a', day: 10, kind: 'letter', to: 'penry', face: 'The Vicarage — one chair, invoiced, delivery arranged' },
    { id: 'p10b', day: 10, kind: 'letter', to: 'tom', face: 'Low Farm — estimate for repairs to a stone wall' },
    { id: 't_pen', day: 10, kind: 'thing', owner: 'sam', art: 'parcel',
      what: 'A fountain pen, nib sprung, a date on the barrel', marks: ['latin', 'script'] },
    { id: 'p10c', day: 10, kind: 'letter', to: 'keeper', face: 'The Keeper, the Post Office. Dated tomorrow.',
      read: {
        from: 'edith', subject: 'The north corner',
        body: 'Dear {{name}} — I have written this on Thursday for Wednesday, which I am afraid is how the book comes out now and has done for a long while.\n\nThere are flowers in the north corner of the churchyard every Thursday and there is no grave under them. I have put them there for thirty years. So did the postmistress before you, and she never told me either, and we did it on the same morning for eleven years without meeting.\n\nCome and sit at my window on Thursday. You will see who else comes. It is not a ghost story. It is worse than that: it is a rota.',
        sign: 'Edith Marlow',
        replies: [
          { text: 'I will come and sit at the window.', effects: { trust: { edith: 2 }, flags: ['watched_flowers', 'edith_diary'] },
            outcome: 'You sit at the window with a cup you do not drink. At ten past eight, Marion. At nine, the Reverend. At noon, Tom, with his hat off. Nobody meets anybody. Edith writes each of them down in a book that is already four days ahead, and hands you the pen when it is your turn.' },
          { text: 'Who is it for?', effects: { trust: { edith: 1 }, flags: ['edith_diary'] },
            outcome: '“I have never known, dear,” she says, which you believe, and then: “I only know we have never once let a Thursday go by,” which you also believe, and which is much worse.' },
        ],
      } },

    // ---- day 11: the fork
    { id: 'p11a', day: 11, kind: 'letter', to: 'return', face: 'Ashfield. No name, no house.' },
    { id: 'p11b', day: 11, kind: 'letter', to: 'keeper', face: 'To whoever is holding the pen',
      read: {
        from: 'board', subject: '',
        body: 'The map is not a picture of the village. It is the list, and the list is the village, and it has been on that wall longer than any of the houses on it.\n\nForty houses drawn. Forty-one people. One of them is kept by being delivered to and nobody has ever noticed which, because a postmaster does not read the fronts, they read the doors.\n\nYou can keep the map as it is. You can take one house off it, and the village will be forty, and nobody will grieve, because grief needs somebody to be missing from. Or you can burn it, and find out how much of Ashfield was paper.\n\n^^It is your pen. It always was.^^',
        sign: '',
        replies: [
          { text: 'Keep the map. All of it.', effects: { ending: 'keep', flags: ['chose_keep'] },
            outcome: 'You put the pen down. The map is the same size it always was. Tomorrow the van comes at seven.' },
          { text: 'Take one house off it.', effects: (a) => {
              const order = ['wren', 'sam', 'edith', 'penry', 'tom', 'marion'];
              const low = order.slice().sort((x, y) => a.trust(x) - a.trust(y))[0];
              a.remove(low); a.setEnding('letgo'); a.setFlag('chose_letgo');
            },
            outcome: 'You rub out one roof. It takes a moment and it is not difficult, which is the part you will think about. The road that went to it goes nowhere now, and tomorrow you will find you cannot remember what was at the end of it.' },
          { text: 'Burn it.', effects: { ending: 'burn', flags: ['chose_burn'] },
            outcome: 'The paper goes first.' },
        ],
      } },

    // ---- day 12
    { id: 'p12a', day: 12, kind: 'letter', to: 'marion', face: 'Mrs M. Tebbutt, The Shop, Front Street, Ashfield' },
    { id: 'p12b', day: 12, kind: 'letter', to: 'keeper',
      face: (a) => a.ending === 'letgo' ? 'The Keeper, the Post Office, Ashfield — readdressed, twice' : 'The next Keeper, the Post Office, Ashfield',
      read: {
        from: 'parish', subject: 'Appointment',
        body: (a) => a.ending === 'letgo'
          ? 'The Parish Council confirms {{name}} as Postmaster of Ashfield, following the departure of the previous holder.\n\nThe village stands at forty. It has always stood at forty. The Council has no record of it standing at anything else.\n\nThe duties are the round, the counter, and the map.'
          : 'The Parish Council confirms {{name}} as Postmaster of Ashfield, following the departure of {{name}}.\n\nThe duties are the round, the counter, and the map. The map is the parish’s and stays on the wall.\n\nDo not take it down to clean behind it.',
        sign: 'Parish Council of Ashfield',
        replies: [{ text: 'Sign it.', outcome: 'You sign it. The pen is warm.' }],
      } },
  ];

  // ------------------------------------------------------------ things on the map
  // Marks on the village itself: prints, a light, flowers, a smooth place in a wall. They are
  // drawn faint. You find them by looking, you pick them up by clicking, and then they are
  // something you can carry to somebody's door and say out loud.
  //
  //   { id, day, x, y, art, look, tell: { who, label, outcome, effects, opens } }
  //
  // `opens` is the id of the find this one uncovers. That is how a small story gets told in
  // four data rows instead of four letters.
  const finds = [
    { id: 'f_paws', day: 3, x: 32, y: 45, art: 'paws',
      look: 'Paw prints in the mud where the mill road leaves Front Street. Going up. Not coming back down.',
      tell: { who: 'tom', label: 'Tell Tom about the paw prints',
        effects: { trust: { tom: 2 }, flags: ['dog_eye'] }, opens: 'f_collar',
        outcome: 'Tom is at the gate before you have finished the sentence. “Bracken’s been gone since Tuesday,” he says. “I’ve been up and down that road nine times looking at the road.” He goes up looking at the mud instead, and comes back at dark with nothing, and stands at the gate a long time. But he knows which way now, and that is not nothing.' } },

    { id: 'f_collar', day: 0, x: 19, y: 22, art: 'collar', when: (a) => a.has('dog_eye'),
      look: 'A dog collar, in the grass off the mill road, above where the prints stop. The buckle is done up. Nothing broke.',
      tell: { who: 'tom', label: 'Tell Tom about the collar',
        effects: { trust: { tom: 2 }, flags: ['dog_home'] },
        outcome: 'The buckle being done up is the whole of it. “He didn’t slip it,” Tom says. “Somebody took it off him.” He goes up to the mill for the first time in two years, and comes down at ten at night with a brown collie walking at his knee, and neither of them looks at the mill.\n\nHe does not thank you in words. The next morning there is a dozen eggs on the counter and no note.' } },

    { id: 'f_flowers', day: 4, x: 46, y: 81, art: 'flowers',
      look: 'Fresh flowers in the north corner of the churchyard, laid where there is no stone and no mound. Somebody does this. Somebody has done it for a long time.',
      tell: { who: 'penry', label: 'Ask the Reverend about the north corner',
        effects: { trust: { penry: 1 }, flags: ['flowers_rev', 'chairs_known'] },
        outcome: '“There is nobody there,” he says, which is a strange thing to say quickly. Then, more slowly: “I set a chair at the harvest supper as well. Every year. For the same nobody. I have never been able to make myself stop, and I have never been able to say who it is for, and I have decided those are the same problem.”' } },

    { id: 'f_chair', day: 5, x: 67, y: 31, art: 'chair', when: (a) => a.day >= 5,
      look: 'A chair, still out on the green from Friday’s supper. Set at a table, not stacked with the others. Somebody laid a place at it.',
      tell: { who: 'marion', label: 'Ask Marion about the extra chair',
        effects: { trust: { marion: 1 }, flags: ['ask_chairs', 'tea'] },
        outcome: 'Marion counts on her fingers, which she never does. “Forty-one places,” she says. “I set out forty-one every year and forty people sit down, and I have never once been able to work out who I am counting.” Then, briskly, because she has said too much: “Tea. Four o’clock. Above the shop. Bring nothing.”' } },

    { id: 'f_lamp', day: 6, x: 30, y: 18, art: 'lamp', when: (a) => a.day >= 6,
      look: 'A lamp, up by the old mill, lit and left. It has been there three nights and it is not the Reverend’s — his is oil and this one is not.',
      tell: { who: 'tom', label: 'Tell Tom about the lamp at the mill',
        effects: { trust: { tom: 1 }, flags: ['tom_wall_talk', 'saw_wall'] }, opens: 'f_wall',
        outcome: '“That’s mine,” Tom says, and does not explain for a while, and then does. “There’s a wall in there with names cut in it. Everybody who’s been in this village. I go up and I count them.” A pause you could park a van in. “It comes out one short. Every time. I’m not a clever man but I can count to forty.”' } },

    { id: 'f_wall', day: 0, x: 25, y: 10, art: 'wall', when: (a) => a.has('saw_wall'),
      look: 'The wall inside the old mill, on the map only as a square somebody has inked in twice. Forty names, cut over two hundred years. At the end of the last row, a space planed smooth.',
      tell: { who: 'tom', label: 'Go up the mill road with Tom',
        effects: { trust: { tom: 2 }, flags: ['mill_went', 'mill_recount'] },
        outcome: 'He measures the smooth place with a bit of baler twine, because that is what he has, and holds it up against the other names. “It fits one,” he says. “It’s been left. Not worn — left.” Then the longest thing he has ever said to anybody, which is four sentences long and which you will not write down.' } },

    { id: 'f_smooth', day: 10, x: 40, y: 62, art: 'smooth', when: (a) => a.day >= 10,
      look: 'On the map, on the post office itself, the ink is older than the rest. Under the roof there is a name, and it is your name, and the hand that wrote it is not yours.',
      tell: { who: 'edith', label: 'Ask Edith about the name on the post office',
        effects: { trust: { edith: 1 }, flags: ['edith_name_gone', 'thimble_1961'] },
        outcome: '“It says that for everybody who has it, dear,” Edith says, without looking up. “It said Harriet for eleven years and I could read it from the door. I cannot read it now, and I have very good eyes for the old ink.”' } },
  ];

  // ------------------------------------------------------------ what goes in the wrong hands
  // A letter through the wrong door is gone: you hear about it in the evening, once, and there
  // is nothing to be done. A thing offered to the wrong person is handed straight back, because
  // you are stood on their step when you do it.
  const astray = {
    letter: [
      'Somebody has had somebody else’s letter open before they looked at the front of it. Nobody says anything to you about it. That is worse.',
      'A letter went to the wrong door and was brought back to the shop rather than to you, which means the whole of Front Street knows before you do.',
      'One of this morning’s went astray. It is read now, whoever read it, and the reading cannot be undone by the address being right tomorrow.',
      'A wrong door. They were decent about it. Being decent about it is how a village tells you.',
    ],
    thing: [
      'They turn it over, and hold it further away, and hand it back. “Not mine.”',
      '“That’s not one of ours,” they say, and give it back with both hands, which people do when they mean it.',
      'A shake of the head, and it comes back to you, and the door is very slightly quicker shutting than it was.',
      '“You want to ask somebody else about that,” they say, which is a hint and a refusal in the same breath.',
    ],
    // Some wrong hands are a decision rather than a slip.
    special: {
      'p4a:marion': { effects: { trust: { marion: 2 }, flags: ['vale_to_marion'] },
        outcome: 'You put the dead postmistress’s letter into Marion’s hand on purpose. She looks at the front of it for a long time. “Harriet,” she says, out loud, which nobody in this village has done for a fortnight, and puts it in her apron, and does not open it in front of you.' },
      'p7c:marion': { effects: { trust: { marion: 1 }, flags: ['ledger_seen'] },
        outcome: 'The second one she does open, at the counter, standing up. Then she bolts the shop door in the middle of the afternoon and takes a ledger out from under the till, and there is a date in the margin against your own name.' },
    },
  };

  // ------------------------------------------------------------ the address book
  // Facts that appear on a page the first day their `when` is true, and stay. `key` is the
  // keyword outreach can ask about.
  const notes = {
    marion: [
      { key: 'shop', text: 'Runs the shop next door. Anything that comes into Ashfield comes past her window first, unless it comes through your door.', when: (a) => a.met('marion') },
      { key: 'the committee', text: 'Every letter the hall committee gets is addressed to her by name. She is the hall committee. There is a biscuit tin, and there has never been anybody else on it.', when: (a) => a.day >= 4 },
      { key: 'tea', text: 'Tea is at four, above the shop. Bring nothing. She means it.', when: (a) => a.has('tea') },
      { key: 'chairs', text: 'She sets out forty-one places at the harvest supper and forty people sit down. She has done it for thirty years and cannot say who the extra one is for.', when: (a) => a.has('ask_chairs') },
      { key: 'harriet', text: 'She says the name Harriet out loud, which nobody else here will do.', when: (a) => a.has('vale_to_marion') },
    ],
    penry: [
      { key: 'the register', text: 'Keeps the parish register in the vestry, and has been adding it up, and it does not come out right.', when: (a) => a.met('penry') },
      { key: 'the chairs', text: 'Sets a chair at the harvest supper for somebody he cannot name, every year, and cannot stop.', when: (a) => a.has('flowers_rev') || a.has('chairs_known') },
      { key: 'the lamp', text: 'Fills the vestry lamp himself and gets the oil on everything he owns.', when: (a) => a.knowsClue('oil') },
      { key: 'first', text: 'Four hundred and ten in his book. Four hundred and eleven in Sam’s. He has known since March and told nobody.', when: (a) => a.has('reg_box') },
    ],
    wren: [
      { key: 'the fox', text: 'Behind the bar at the Fox, twelve to three and six till close. Writes in lowercase.', when: (a) => a.met('wren') },
      { key: 'the city', text: 'The 8.10 goes. The 6.40 comes back the same way. She has an opinion about only one of those.', when: (a) => a.knowsClue('bus') },
      { key: 'the count', text: 'Counted the houses on your map when she was eleven and got forty, and has never told anybody, because of what people are like here.', when: (a) => a.has('wren_ref') },
      { key: 'the course', text: 'There is a school of nursing that writes to her, and she has not opened any of them where anyone can see.', when: (a) => a.sorted('p5b') },
    ],
    tom: [
      { key: 'low farm', text: 'Low Farm, up the mill road. Mends rather than replaces. Stands at the gate at five, looking up the road.', when: (a) => a.met('tom') },
      { key: 'bracken', text: 'A brown collie called Bracken. Went missing on a Tuesday.', when: (a) => a.has('dog_eye') || a.knowsClue('dogcoat') },
      { key: 'the wall', text: 'There is a wall in the old mill with the names of everybody who has been in this village cut into it. He goes up at night and counts them. It comes out one short.', when: (a) => a.has('saw_wall') },
      { key: 'his wife', text: 'A widower. He has never once said her name to you, and he has told you about the wall, which he says is easier.', when: (a) => a.has('mill_went') },
    ],
    edith: [
      { key: 'rose cottage', text: 'Rose Cottage, the far end. Everything that has been in it smells of lavender for weeks.', when: (a) => a.met('edith') },
      { key: 'remembers', text: 'Remembers everything, which she says is a burden and not a gift.', when: (a) => a.met('edith') },
      { key: 'the flowers', text: 'Has put flowers in the north corner every Thursday for thirty years. There is nobody under them. So did the postmistress before you.', when: (a) => a.has('watched_flowers') || a.sorted('p10c') },
      { key: 'the diary', text: 'Keeps a book. The book is four days ahead of the calendar and she does not pretend otherwise.', when: (a) => a.has('edith_diary') },
    ],
    sam: [
      { key: 'the surgery', text: 'The surgery on Front Street. Tuesday and Thursday mornings, and the green bench every dinner time.', when: (a) => a.met('sam') },
      { key: 'the bench', text: 'Eats on the green bench and puts things down on it to think. That is how Sam loses things.', when: (a) => a.knowsClue('bench') },
      { key: 'the records', text: 'Four hundred and eleven records in the cabinet. The parish register says four hundred and ten. Neither of them will show the other.', when: (a) => a.has('sam_register') || a.sorted('p9c') },
      { key: 'forty-one', text: 'The two books were laid side by side on your counter. It is forty-one. It has always been forty-one.', when: (a) => a.has('reg_box') },
    ],
  };

  // ------------------------------------------------------------ reaching out
  // Written by hand, and few, because the asking that matters is generated: you can ask anybody
  // about anything in your box, and about anything you have found on the map. These are the
  // things that are not about an object.
  //
  //   kind: 'ask' (one per person per day) | 'visit' (one a day, all told)
  const outreach = [
    { id: 'o_marion_tea', who: 'marion', kind: 'visit', text: 'Go up for tea above the shop',
      when: (a) => a.has('tea'),
      effects: { trust: { marion: 2 }, flags: ['marion_tea_done'] },
      plans: [{ at: 'shopflat', hour: 16, doing: 'tea, above the shop', with: 'you' }],
      outcome: 'The cat is eleven and has been eleven for a while. Marion talks for an hour about nothing at all and then, at the door, with your coat on: “There’s an envelope under my till with a dead woman’s name on it and I have never opened it. I’m telling you because you’re the post. It’s the only reason.”' },

    { id: 'o_marion_ledger', who: 'marion', kind: 'ask', text: 'Ask about the envelope under the till',
      when: (a) => a.has('marion_tea_done') && !a.has('ledger_seen'),
      effects: { trust: { marion: 1 }, flags: ['ledger_seen'] },
      outcome: 'She takes it out and does not hand it over. Under it is a ledger, and in the margin of the ledger is a date, and the date is against your own name, and it is in a hand that stopped writing before you arrived.' },

    { id: 'o_penry_register', who: 'penry', kind: 'visit', text: 'Go and add up the register with him',
      when: (a) => a.has('rev_promise'),
      effects: { trust: { penry: 2 }, flags: ['reg_vestry', 'rev_confess'] },
      plans: [{ at: 'vestry', hour: 15, doing: 'the register, the lamp lit in broad daylight', with: 'you' }],
      outcome: 'Four hundred and ten. You both get four hundred and ten, four times. Then he closes the book and says, to the book: “There is a chair I set every year and flowers I have never laid, and I am not a superstitious man, and I would very much like somebody else to be in the room when I say this next part.”' },

    { id: 'o_penry_lists', who: 'penry', kind: 'ask', text: 'Ask what the register is one short of',
      when: (a) => a.has('reg_vestry') || a.has('reg_box'),
      effects: { trust: { penry: 1 }, flags: ['reg_lists'] },
      outcome: '“Of the village,” he says. “Not of the dead. Of the village. The register is a list of everyone who has been here, and it is one short of everyone who has been here, and I have been a priest for thirty-one years and I do not find that comforting.”' },

    { id: 'o_wren_cellar', who: 'wren', kind: 'visit', text: 'Go down the cellar at the Fox',
      when: (a) => a.has('wren_ref') || a.returned('wren') > 0,
      effects: { trust: { wren: 2 }, flags: ['wren_box'] },
      plans: [{ at: 'cellar', hour: 15.5, doing: 'behind the barrels, between shifts', with: 'you' }],
      outcome: 'There is a box behind the barrels with about forty letters in it, and some of them are addressed to her, and none of them have been opened. “they were here when i started,” she says. “i keep meaning to burn them. i keep not.”' },

    { id: 'o_wren_green', who: 'wren', kind: 'visit', text: 'Stand on the green at ten past eight',
      when: (a) => a.has('wren_box') && a.day >= 8,
      effects: { trust: { wren: 3 }, flags: ['wren_aware', 'wren_promise'] },
      plans: [{ at: 'green', hour: 8.17, doing: 'the bus stop, ten past eight', with: 'you' }],
      outcome: 'The bus comes. She does not get on it. That was never the point. “i wanted somebody standing here who’d remember i was standing here,” she says. “that’s all it was. the road forgets you. you don’t.”' },

    { id: 'o_tom_gate', who: 'tom', kind: 'visit', text: 'Stand at the gate with him at five',
      when: (a) => a.returned('tom') > 0 || a.has('dog_eye'),
      effects: { trust: { tom: 1 }, flags: ['went_with_tom'] },
      plans: [{ at: 'gate', hour: 17.5, doing: 'the gate at the end of the day', with: 'you' }],
      outcome: 'Twenty minutes and eleven words. At the end of it he says “Right,” which from Tom is an hour of anybody else’s conversation, and you find you agree.' },

    { id: 'o_edith_window', who: 'edith', kind: 'visit', text: 'Sit at the window on a Thursday',
      when: (a) => a.has('edith_diary'),
      effects: { trust: { edith: 2 }, flags: ['counted_with_edith', 'watched_flowers'] },
      plans: [{ at: 'rose', hour: 15, doing: 'the window that looks at the churchyard', with: 'you' }],
      outcome: 'She writes down who comes, in a book that already has Thursday in it, and then turns the book round and hands you the pen, and there is a line left blank with the time on it, and the time is now.' },

    { id: 'o_edith_page', who: 'edith', kind: 'ask', text: 'Ask about the folded page',
      when: (a) => a.has('counted_with_edith'),
      effects: { trust: { edith: 1 }, flags: ['diary_page_read'] },
      outcome: '“I folded it over so that I would not read it by accident,” she says, “and then I read it at two in the morning, on my own, because I am eighty-four and not a saint.” She will not say what is on it. She says you will not need telling.' },

    { id: 'o_sam_bench', who: 'sam', kind: 'visit', text: 'Sit on the green bench at dinner time',
      when: (a) => a.returned('sam') > 0 || a.sorted('p2b'),
      effects: { trust: { sam: 1 }, flags: ['met_sam', 'look_records'] },
      plans: [{ at: 'green', hour: 13, doing: 'the bench, one sandwich each', with: 'you' }],
      outcome: 'Sam is precise about the weather for six minutes and then says, looking straight ahead: “I have written Thursday on four forms this week and it was not Thursday on any of them. I would like a second opinion and I cannot ask a colleague, because the nearest one is eleven miles away and would be quite right to laugh.”' },

    { id: 'o_sam_drive', who: 'sam', kind: 'visit', text: 'Go on the afternoon round in the car',
      when: (a) => a.has('met_sam') && a.day >= 7,
      effects: { trust: { sam: 2 }, flags: ['drove_with_sam'] },
      plans: [{ at: 'road', hour: 14, doing: 'the round, in the car, the long way', with: 'you' }],
      outcome: 'Eleven miles out and eleven back. At the county line Sam pulls in without saying why, sits for a minute, and turns round. “I do that most weeks,” Sam says. “I get to the sign and I turn round. I have never been able to make a sentence out of why.”' },
  ];

  // ------------------------------------------------------------ what you were in the middle of
  const threads = [
    {
      who: 'tom', title: 'Tom, the dog, and the wall in the mill',
      beats: [
        (a) => a.has('dog_eye'),
        (a) => a.has('dog_home'),
        (a) => a.has('saw_wall') || a.has('tom_wall_talk'),
        (a) => a.has('mill_went'),
      ],
      left: [
        'A dog went missing on a Tuesday and a man walked up and down that road nine times looking at the road. There were prints in the mud at the bottom of it the whole week, and nobody who walks past a post office window ever looks down.',
        'You put him on the right road and he did not find the end of it. The collar is still up there in the grass with the buckle done up, which is the part that matters, and neither of you knows that yet.',
        'The dog came home. There is something at the top of that road he goes back to on his own, at night, with a lamp, and he has stopped telling anybody when.',
        'You know about the wall and the counting. He measured the smooth place at the end of the last row with a bit of twine and came down meaning to tell you what it fits, and there was nobody at the counter.',
      ],
      done: 'The dog came home, and then he took you up the mill road, and said the longest thing he has ever said to anybody — about a space at the end of a wall, and what fits it.',
    },
    {
      who: 'penry', title: 'Aldous, and the chair he keeps setting',
      beats: [
        (a) => a.has('rev_promise') || a.trust('penry') > 0,
        (a) => a.has('chairs_known') || a.has('flowers_rev'),
        (a) => a.has('reg_vestry') || a.has('rev_confess'),
        (a) => a.has('reg_lists'),
      ],
      left: [
        'He wrote once, carefully, and got a polite nothing back. There is a book in that vestry he has added up eleven times, and he had got as far as looking for somebody to add it up with.',
        'You gave him the promise he asked for and he did not ask twice, because he is not a man who asks twice. He sets a chair every year for somebody, and lays flowers he has never admitted to, and neither came up.',
        'You know about the chairs. He was working himself up to opening the register for somebody with the lamp lit, and he had never done that for anybody, and in the end he did not do it for you either.',
        'He opened the book in front of you, which was the hard part. He never got as far as saying what it is one short *of*, and the answer is not the dead.',
      ],
      done: 'You added it up with him, and then he told you what the number is one short of, which is not the dead, and he says he is not frightened.',
    },
    {
      who: 'wren', title: 'Wren, and the 8.10',
      beats: [
        (a) => a.has('wren_ref') || a.returned('wren') > 0,
        (a) => a.has('wren_box'),
        (a) => a.has('wren_aware'),
        (a) => a.has('wren_promise'),
      ],
      left: [
        'Nineteen, and asking a new postmaster for one small thing, which was to count something. You did not count it. She is still behind that bar and the bus still goes at ten past eight.',
        'She let you as far as the bar. There is a box behind the barrels in that cellar with about forty letters in it and her own name on some of them.',
        'You saw the box. She worked something out about you afterwards and never got round to saying it, and she keeps a bus timetable until the paper wears through in one place, and it is not because she is frightened of leaving.',
        'She stopped writing to the Keeper and started writing to you, which took some working out on her part. Then she needed a witness on the green at ten past eight, and there was nobody on the green.',
      ],
      done: 'She asked you for the one thing she has never asked anybody, and you were standing on the green at ten past eight, and you remembered she was standing there.',
    },
    {
      who: 'marion', title: 'Marion, and the thing she did not pass on',
      beats: [
        (a) => a.trust('marion') > 0,
        (a) => a.has('ask_chairs') || a.has('tea'),
        (a) => a.has('marion_tea_done') || a.has('vale_to_marion'),
        (a) => a.has('ledger_seen'),
      ],
      left: [
        'She wrote you a note about a mended handle on your second morning, unasked, because that is what she does, and got nothing back. She was waiting to see whether it would be you.',
        'You let her have a look at you and no further. She counts something at that supper every year that nobody else in Ashfield counts, and she has never said the number out loud.',
        'She counted the chairs out loud to you, and stopped there, the way she stops. There is an envelope under that till with a dead woman’s name on the front of it.',
        'She told you about the envelope, at the door, with your coat on. She never got as far as bolting the shop and taking the ledger out, and the margin of that ledger has a date in it against your own name.',
      ],
      done: 'You got the whole of it — envelope, ledger, margin, and the date written against your own name — including the part she has never said out loud to anybody in thirty years.',
    },
    {
      who: 'edith', title: 'Edith, and the book that is four days ahead',
      beats: [
        (a) => a.trust('edith') > 0,
        (a) => a.has('edith_diary'),
        (a) => a.has('watched_flowers') || a.has('counted_with_edith'),
        (a) => a.has('diary_page_read'),
      ],
      left: [
        'An old woman wrote you long, beautiful, careful letters and got short answers back. She has been trying to hand somebody a book for thirty years and has not managed it yet.',
        'You took her seriously about the north corner, which nobody had in years. She keeps a book, and the reason she has been trying to give it away since before you were born never came up.',
        'You know the book runs ahead of the calendar. You never sat at that window on a Thursday and watched who comes to the north corner, and there is a rota, and you are on it.',
        'You saw it with your own eyes and she handed you the pen. There is a page she folded over so that she would not read it by accident, and she read it at two in the morning on her own.',
      ],
      done: 'You watched the north corner from her window, took the pen when it was your turn, and then she told you about the folded page. She had somebody in the room, which is the only thing she has ever actually asked for.',
    },
    {
      who: 'sam', title: 'Sam, and four hundred and eleven records',
      beats: [
        (a) => a.has('met_sam') || a.trust('sam') > 0,
        (a) => a.has('look_records'),
        (a) => a.has('drove_with_sam') || a.has('sam_register'),
        (a) => a.has('reg_box'),
      ],
      left: [
        'The doctor has been holding something alone since March, wrote to you about it once in plain language, and got a shrug. It is still being held alone.',
        'You sat on the bench and Sam got as far as saying the word Thursday out loud and looking up to see whether you would disagree. That was the opening of a conversation that then did not happen.',
        'Sam told you about the four forms and the wrong day. There is a cabinet at that surgery with four hundred and eleven records in it and a register in a vestry with four hundred and ten, and the two of them have never been in the same room.',
        'Sam trusted you with the half that is bearable — the drive, the county sign, the turning round. The other half is a number, and there were two books in this village that needed laying side by side, and they finished the fortnight in two rooms at opposite ends of Front Street.',
      ],
      done: 'You put the two books down on one desk. Sam wanted a fact, got one, and did not have to be alone in the room when it arrived.',
    },
  ];

  // A run gets a spine or it does not, and the ending says so either way.
  const spineEndLines = {
    reg_box: 'You spent the fortnight on the two books, and you got them onto one desk. Forty-one, not forty. It was never a coincidence and it was never a clerical error, and Aldous is not frightened, and you are the only three people in Ashfield who know the number and what keeps it.',
    mill_went: 'You spent the fortnight on the mill road. Forty names cut in stone and forty-one people in the village and a space at the end of the last row planed smooth, and Tom measured it with a bit of baler twine, and it fits.',
    diary_page_read: 'You spent the fortnight at a window in Rose Cottage with a book that is four days ahead of the calendar. Thirty years of Thursdays, a rota nobody organised, and one page folded over. She left the last one blank for you. She was sure of that.',
    wren_promise: 'You spent the fortnight on the green at ten past eight. The road forgets whoever walks it and the map keeps whoever is drawn on it, and Wren worked that out at eleven years old, and asked you for the pen.',
    ledger_seen: 'You spent the fortnight on the shop side of the counter. An envelope with a dead woman’s name on it, a ledger under a till, and a date in the margin against your own name in a hand that stopped writing before you arrived.',
  };
  const spineEnding = (a) => {
    for (const k in spineEndLines) if (a.has(k)) return spineEndLines[k];
    return 'You held all six of them and finished none, which is what a postmaster does: one pile, one walk a day, and the polite nothing you give five people so that you can give a sixth something. It is not a failure. It is the job. It is only that nobody tells you the job is a choice until the fortnight is over.';
  };

  // ------------------------------------------------------------ endings
  const endingTitles = { keep: 'Kept', letgo: 'Rubbed out', burn: 'Ash' };
  const endings = {
    keep: (a) => [
      'You keep the map.',
      spineEnding(a),
      'The days go on being sorted, one pile after another. Marion is fifty-one. Edith remembers everything. Tom stands at the gate with the dog. Sam fills in forms. The Reverend sets a chair, and does not know how to stop, and has stopped minding.',
      a.removed('wren') ? 'There is a room going at the Fox & Hounds. Nobody asks why.' : 'Wren counts the houses, every Thursday, and gets forty, and says nothing.',
      'Forty houses on the wall, and forty-one people, and one of them kept by being delivered to. The village is the same size it always was. It never gets any bigger.',
      'Tomorrow is Monday. The porch smells of wet coats and someone else’s coffee. A notice from the Parish Council confirms {{name}} as Postmaster of Ashfield, following the departure of {{name}}.',
      'You have read it before. You are sure of it.',
    ],
    letgo: (a) => [
      'You rub out one roof. One house, and the lane that went to it.',
      spineEnding(a),
      'Nobody notices. That was the idea. Marion goes past a coat on a hook and nearly says a name. Edith counts forty and weeps and feels better for it. Sam keeps a reference letter for somebody whose name has gone off the page.',
      'Tom puts his hand on the smooth stone where a name was, and it is warm.',
      'You remember them. You are not drawn on the map; you are allowed. That is the job, it turns out. Not the sorting. The remembering.',
      'Tomorrow is Monday. A notice from the Parish Council confirms {{name}} as Postmaster of Ashfield, following the departure of {{name}}. The village is the same size it always was.',
      'Forty. Not forty-one. You counted twice.',
    ],
    burn: (a) => [
      'You burn it.',
      spineEnding(a),
      'The paper goes first. Then the roads, which turn out to have been drawn on top. Then the pale places where the houses were, which you had not known were also paper. Then the frame, and the pencil on the back that said *the map tells you what the village won’t*.',
      'Then the porch. Then the road that goes past the mill and then past the mill.',
      'Harriet goes last, and she says thank you, and it is not in ash.',
      'Marion. Aldous. Edith. Tom, and the dog. Sam. ' + (a.removed('wren') ? '' : 'Wren, who wanted this, and got it, and said ok.') + ' Forty-one, and the two books, and the chair.',
      'Nobody sets a place, because there is no hall to set it in.',
      'The name you typed is gone too. That was part of it. Somewhere, though, someone is holding something, and there is a light on their face, and they are about to type a name.',
      'Close the door. The wind takes things.',
    ],
  };

  return {
    villagers, days, places, work,
    marks, clues, speaks, shrugs, claims,
    pile, finds, astray, notes, outreach,
    threads, endings, endingTitles,
  };
})();
