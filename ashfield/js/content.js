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
 * This run is a village murder mystery. Harriet Vale, the postmaster before you, was found
 * at the vestry steps on the night of the 26th of November. The inquest called it a fall,
 * but the timing, the missing papers and the alibis do not agree. The murderer is one of
 * the seven houses, and the seventh house is this one — `killer` is drawn once per game.
 *
 * Case notes (id starts `c_`, `caseClue: true`) go in the drawer like any note, and the
 * diary gathers them under “The case”. A note with `caseClue` reads differently according
 * to who the killer is: five versions are what people really said, and one — the guilty
 * one — is the version the killer has polished until it sounds respectable.
 *
 * Text markup: {{name}}  [[shows this|then this]]  ~~struck~~  __smudged__  ^^shivering^^
 * Effects: { trust: {who: n}, flags: [], unflag: [], remove: who, ending: 'file'|'named'|'quiet'|'silent' }
 *          or (api) => {}
 */
window.ASHFIELD = (function () {

  // ------------------------------------------------------------ the village
  const villagers = {
    marion: {
      name: 'Marion Tebbutt', role: 'The shop', address: 'The Shop, Front Street (next door)',
      bio: (a) => a.day >= 9 ? 'Runs the shop next door, and the village. Has been fifty-one for some time and is not going anywhere.' : 'Runs the shop next door to the post office, and, by general agreement, the village. Knows everyone, keeps every receipt, and tells most of it.',
      goneBio: 'Runs the shop.',
    },
    penry: {
      name: 'Rev. Aldous Penry', role: 'St Anne’s', address: 'The Vicarage, by St Anne’s',
      bio: (a) => a.has('rev_confess') ? 'The vicar. Keeps the register. Was at the vestry the night Harriet Vale died, and signed the first account before anyone asked him to.' : 'The vicar. Formal, kind, and careful with the parish register in a way that people have started to notice.',
    },
    wren: {
      name: 'Wren Hollis', role: 'The Fox & Hounds', address: 'The Fox & Hounds, on the green',
      bio: (a) => a.has('wren_aware') ? 'Nineteen. Pulls pints at the Fox. Was on the last bus the night Harriet died and kept quiet because nobody asked the right question.' : 'Nineteen. Pulls pints at the Fox and wants to be somewhere else. Writes in lowercase and does not waste words.',
      goneBio: 'There is a room going at the Fox & Hounds.',
    },
    tom: {
      name: 'Tom Ferrier', role: 'Low Farm', address: 'Low Farm, up the mill road',
      bio: (a) => a.has('prints_tom') ? 'Farmer. Widower. Found the boot prints in the vestry and waited two days before telling you, which is either caution or guilt.' : 'Farmer at Low Farm. Widower. Few words, all of them meant. Has a brown collie called Bracken.',
    },
    edith: {
      name: 'Edith Marlow', role: 'Rose Cottage', address: 'Rose Cottage, the far end of the village',
      bio: (a) => a.has('edith_diary') ? 'Eighty-something. Remembers everything, she says, which is a burden and not a gift. Watched the north corner the night Harriet died and has kept a visitor’s book since.' : 'Eighty-something. Writes long letters in a beautiful hand. Remembers everything, which she says is a burden.',
    },
    sam: {
      name: 'Dr Sam Okafor', role: 'The surgery', address: 'The Surgery, Front Street',
      bio: (a) => a.has('sam_register') ? 'The village GP. Was called to the vestry the night Harriet died and wrote down that the door was locked from the inside. The writing survives, and so does the doubt.' : 'The village GP, eighteen months in. Precise, private, and worried about something in the records of the 26th of November.',
    },
  };

  // ------------------------------------------------------------ days
  // Twelve days, one clean working fortnight. Nobody loops. Nothing happens twice.
  const days = {
    1: {
      week: 'Monday',
      intro: 'Monday. A fortnight ago yesterday, on the 26th, Harriet Vale was found at the vestry steps. The inquest called it a fall. The parish office called it unfortunate. The village called it nothing at all.',
      night: 'Night. You hang your coat beside the one Harriet left behind. In its pocket is a parish receipt dated the day she died.',
    },
    2: { week: 'Tuesday', intro: 'Tuesday. Wind from the mill side. Something in the pile is not a letter and has no name on it. The village is still putting a name to you.', night: 'Night. A dog, somewhere up the valley, then nothing' + ' — no, wait, then it goes on. Dogs do.' },
    3: { week: 'Wednesday', intro: 'Wednesday. Rain on the porch roof. A fortnight ago tonight was the 26th. Two unsigned accounts of it arrive in the morning post, and they disagree about the door.', night: 'Night. You put the first two accounts side by side. One says where a person was. Neither says why.' },
    4: { week: 'Thursday', intro: 'Thursday. Fresh flowers in the churchyard, north corner, where no grave is. You are starting to understand the village, and starting to dislike what you understand.', night: 'Night. You turn the day’s notes over. Every one of them is somebody being careful. The careful ones are usually the ones with somewhere they are not.' },
    5: { week: 'Friday', intro: 'Friday. Half the fortnight done. The inquest was declared an accident on a Friday, before anyone had compared the parish register with the doctor’s ledger.', night: 'Night. The milk arrives, the letters arrive, and the village carries on. That is an excellent alibi if nobody checks the clock.' },
    6: { week: 'Saturday', intro: 'Saturday. The pile has been squared off and the map straightened. Not by you. Somebody is keeping an eye on the new postmaster, and it is not the Council.', night: 'Night. You add the day’s scraps to the drawer and stand back. Six people so far, all accounted for on a night in November. Accounted for is a word the police like. You are not the police.' },
    7: { week: 'Sunday', intro: 'Sunday. Bells, then quiet. The van came anyway. Edith’s note is in copperplate and contains three times, two names, and one omission.', night: 'Night. Seven houses, seven versions of one evening. The useful thing about a village is that everyone knows everyone. The dangerous thing is that they know what to leave out.' },
    8: { week: 'Monday', intro: 'Monday. A fortnight tomorrow since it happened. The letters have stopped being about you and started being about the 26th, and you did not start that.', night: 'Night. You take the case notes to the kitchen and read them on the table, all together, for the first time. They do not all fit each other.' },
    9: { week: 'Tuesday', intro: 'Tuesday. The surgery door is shut and the light is on. Sam has been at the 26th as long as you have, and has been alone in it longer.', night: 'Night. Two books, told about one night, in two houses at two ends of Front Street. Somebody is in the space between them.' },
    10: { week: 'Wednesday', intro: 'Wednesday. Edith’s still-warm letter arrived at seven and already reads like it has been waiting. The receipt is under it. Everything has a receipt except the thing it matters for.', night: 'Night. You set a chair for the shop and one for the surgery and one for yourself at the kitchen table, and lay the case out on it, and it still comes up one witness short.' },
    11: { week: 'Thursday', intro: 'Thursday. An unsigned letter arrives with no stamp and no name. Somebody has finally put the village’s question in writing: who benefited when Harriet Vale died?', night: '' },
    12: {
      week: 'Friday',
      intro: (a) => a.has('chose_quiet')
        ? 'Friday. The constable from Nettleton comes at four. The unsigned letter lies in the drawer, unanswered. Silence is a decision, even when nobody signs it.'
        : 'Friday. The constable from Nettleton comes at four. The night of the 26th is yours to hand over, in the order the evidence came.',
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
      job: 'The shop, half eight to one and two to four, and she is behind the counter for every minute of it. It was shut by one on the 26th — her word, and the sign on the door.',
      meet: { at: 'shop', hour: 13, doing: 'the counter, in the hour she shuts the door and calls it her dinner' },
    },
    penry: {
      job: 'Morning Prayer at half seven, to nobody. The parish register in the vestry all afternoon, and the lamp on well past it.',
      meet: (a) => a.day >= 4
        ? { at: 'vestry', hour: 15, doing: 'the vestry, the register open, the lamp lit in broad daylight' }
        : { at: 'vestry', hour: 15, doing: 'the vestry, between the register and the parish post' },
    },
    wren: {
      job: 'The lunchtime shift at the Fox, twelve to three, and the evening one from six. The hours in between are hers, and she walks them. The 26th she was late back, and has never said where her five minutes went.',
      meet: { at: 'fox', hour: 15.5, doing: 'the empty bar between shifts, the chairs still up on the tables' },
    },
    tom: {
      job: 'Up at half five for the yard and the beasts. Stood at the gate from five in the evening, looking up the road, which is when he stops. By the vestry he does not go, he says, and says it twice.',
      meet: { at: 'gate', hour: 17.5, doing: 'the gate, at the end of the day, because that is the only end there is' },
    },
    edith: {
      job: 'Retired from nothing in particular. There are the letters, the window, and the remembering, and she says the last is full time. She was at her window by eight on the 26th, and that is a fact you have not yet been told twice.',
      meet: { at: 'rose', hour: 15, doing: 'Rose Cottage, mid-afternoon, the kettle on before you knock' },
    },
    sam: {
      job: 'Surgery Tuesday and Thursday mornings, half eight to eleven. Paperwork the rest of the week, rounds in the afternoons. On the 26th the surgery ledger swallowed an hour at nine, and the entry is in his own hand.',
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
    wire: 'the handle has been mended with wire',
    twine: 'a loop of orange baler twine, knotted twice',
    dogcoat: 'short brown hairs, the kind that get everywhere',
    till: 'a till receipt from the shop, folded small',
    pad: 'the corner of a shop order pad, torn off',
    pricegun: 'a price label, half peeled and put back crooked',
    oil: 'a smear of lamp oil, and the smell of it',
    cross: 'a cut in the shape of a cross',
    hymn: 'numbers pencilled in a column: 24, 108, 397',
    biro: 'gone over and over in biro until the paper went furry',
    beer: 'a ring from a wet glass, and a Fox & Hounds mat',
    bus: 'the 8.10 circled, and the 6.40 back not circled',
    script: 'a prescription slip, blank except for a date',
    latin: 'a small, exact hand, and Latin short forms',
    bench: 'a fleck of green paint, the green of one bench',
    lavender: 'it smells of lavender, faintly and completely',
    copper: 'copperplate, taught before the war and never lost',
    rose: 'a rose thorn caught in the seam',
  };

  const clues = {
    wire: { who: 'tom', text: 'Tom mends things rather than replacing them. He has not bought a new one of anything in years.' },
    twine: { who: 'tom', text: 'Orange baler twine, knotted twice. Everything at Low Farm is held together with it.' },
    dogcoat: { who: 'tom', text: 'Bracken is a brown collie, and the hair gets on anything that goes up that road.' },
    till: { who: 'marion', text: 'The shop’s till receipts. Everything in Ashfield is from the shop, so a receipt says who kept it, not who bought it — and Marion keeps hers.' },
    pad: { who: 'marion', text: 'The shop order pad. Marion writes on the corners of it and tears them off, which is most of her correspondence.' },
    pricegun: { who: 'marion', text: 'Marion prices things twice when she is thinking about something else, and puts the label back crooked.' },
    oil: { who: 'penry', text: 'The vestry lamp burns oil, and the Reverend fills it himself, and gets it on everything.' },
    cross: { who: 'penry', text: 'Church ironwork is cut with a cross at the end. There are four such locks in Ashfield and they are all his.' },
    hymn: { who: 'penry', text: 'Hymn numbers, pencilled in a column, are how the Reverend makes a list of anything at all.' },
    biro: { who: 'wren', text: 'Wren goes over a thing in biro while she is thinking, until the paper gives out. It is not idleness.' },
    beer: { who: 'wren', text: 'Nothing leaves the Fox with a mat under it unless Wren put it down while she was working.' },
    bus: { who: 'wren', text: 'The 8.10 goes and the 6.40 comes back. Only one person in this village has an opinion about that.' },
    script: { who: 'sam', text: 'A prescription slip used as a bookmark. Sam has a pad in every coat and uses them for everything but prescriptions.' },
    latin: { who: 'sam', text: 'The small exact hand with the Latin short forms is a doctor’s, and there is one doctor.' },
    bench: { who: 'sam', text: 'The bench on the green is the only thing in Ashfield painted that green, and Sam eats there every dinner time.' },
    lavender: { who: 'edith', text: 'Rose Cottage smells of lavender and so does everything that has been in it, for weeks afterwards.' },
    copper: { who: 'edith', text: 'Copperplate, taught before the war. There is one hand like that left in the village and it is Edith’s.' },
    rose: { who: 'edith', text: 'Edith prunes in all weathers and does not wear gloves, and the thorns go home with whatever she was carrying.' },
  };

  // Who can explain what. Ask somebody about a thing and they tell you about any mark on it
  // that they would recognise — and if it is theirs, they say so. Six lines of data, and every
  // thing you add is a puzzle for free.
  const speaks = {
    marion: ['till', 'pad', 'pricegun', 'oil', 'lavender', 'beer', 'bus', 'dogcoat'],
    edith: ['copper', 'lavender', 'rose', 'hymn', 'cross', 'wire'],
    penry: ['oil', 'cross', 'hymn', 'copper', 'latin'],
    sam: ['script', 'latin', 'bench', 'biro', 'twine'],
    wren: ['biro', 'beer', 'bus', 'twine', 'pricegun'],
    tom: ['wire', 'twine', 'dogcoat', 'bench'],
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
    penry: '“Ah,” says the Reverend, and takes it in both hands. “I did not know that was gone. Which is worse, rather than better.”',
    wren: '“oh,” she says. “yeah. that’s mine.” And then, because she has decided to: “thanks. i mean it.”',
    tom: 'Tom turns it over twice, the way he turns everything over twice. “Aye,” he says. “That’s off our place.”',
    edith: '“Of course it is mine, dear,” Edith says. “Everything old in this village is mine. It is the only advantage.”',
    sam: '“Mine,” Sam says, and then, precisely: “I put it down to think, and putting things down to think is how I lose things.”',
  };

  // ------------------------------------------------------------ the pile
  // Three sorts of thing, all of them on the same desk in the same heap.
  //
  //   { id, day, kind: 'letter', to, face }                 an envelope, address on the front
  //   { id, day, kind: 'letter', to: 'keeper', face, read }        one for you; you open this one
  //   { id, day, kind: 'thing', owner, what, art, marks }    no address; the marks are the address
  //   { id, day, kind: 'note', from, text, caseClue?, gives?, names?, asks? }   a slip; read it,
  //         keep it. A note with `caseClue: true` is evidence about the 26th and reads
  //         differently depending on who the killer is (see the header).
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
    {
      id: 'p1d', day: 1, kind: 'letter', to: 'keeper', face: 'Postmaster, the Post Office, Ashfield',
      read: {
        from: 'parish', subject: 'Appointment',
        body: 'The Parish Council confirms you as Postmaster of Ashfield, following the death of the previous postmaster, Mrs Harriet Vale.\n\nThe duties are the round, the counter, and the map. The map is the parish’s and stays on the wall. Anything found on the round is to be returned to its owner.\n\nBefore her death, Mrs Vale reported discrepancies in the registered post and asked to inspect the parish restoration accounts. Her red ledger and a bundle of returned letters have not been found among her effects. If either turns up, put them in the locked drawer and notify the Council.\n\nThe inquest concluded that Mrs Vale died accidentally at St Anne’s. We do not anticipate any further enquiry, and ask that the new postmaster give the village no cause for alarm.',
        sign: 'Parish Council of Ashfield',
        replies: [
          { text: 'Understood. I will keep the records safe.', effects: { flags: ['took_post'] }, outcome: 'You put the appointment in the drawer with the string and the spare pen. The missing ledger is the first thing in Ashfield that has been assigned to you and cannot be delivered to an address.' },
          {
            text: '“Any further enquiry” — why not?', effects: { flags: ['took_post', 'asked_before'] },
            outcome: 'The Council clerk writes back that the matter was settled at the inquest. He does not explain why Harriet was checking the parish accounts, or why her ledger and returned letters are missing. You keep the reply with the appointment, because it is the first time somebody has told you not to look.'
          },
        ],
      }
    },

    // ---- day 2: the first thing with no name on it, and the note that answers it
    { id: 'p2a', day: 2, kind: 'letter', to: 'wren', face: 'Miss W. Hollis, c/o the public house on the green' },
    { id: 'p2b', day: 2, kind: 'letter', to: 'sam', face: 'THE SURGERY, Front Street — MEDICAL. DO NOT BEND.' },
    { id: 'p2c', day: 2, kind: 'letter', to: 'edith', face: 'Mrs E. Marlow, the far end of the village' },
    {
      id: 't_mug', day: 2, kind: 'thing', owner: 'tom', art: 'mug',
      what: 'A white enamel mug, chipped at the rim', marks: ['wire', 'dogcoat']
    },
    {
      id: 'n2a', day: 2, kind: 'note', from: 'marion', gives: ['wire'],
      text: 'New postmaster — anything comes in with a mend on it rather than a new one, that’s Low Farm. Tom hasn’t bought a new anything since I’ve had the shop. The leaflets for Low Farm come back to the shop with holes in them, else no fault: it is seven houses on his road alone and the van misses two of them. Wire, mostly. — M.T.'
    },

    // ---- day 3: the first thing you have to work for, and the case opens
    { id: 'p3a', day: 3, kind: 'letter', to: 'edith', face: 'Rose Cottage' },
    { id: 'p3b', day: 3, kind: 'letter', to: 'sam', face: 'Dr S. Okafor — from the Registrar' },
    {
      id: 't_glasses', day: 3, kind: 'thing', owner: 'marion', art: 'glasses',
      what: 'A spectacle case, tartan, with a receipt folded inside', marks: ['till', 'pricegun']
    },
    {
      id: 'n3a', day: 3, kind: 'note', from: 'someone', gives: ['dogcoat'],
      text: 'A parcel for the surgery came back with short brown hairs caught under the string. It had been sent up the mill road and returned before Sam opened it. Not a stray, Marion says: Ferrier’s dog, Bracken. The question is not who owns the dog. It is why a medical parcel went past Low Farm at all.'
    },
    {
      id: 'c_marion_a', day: 3, kind: 'note', from: 'someone', caseClue: true,
      text: (a) => a.killer === 'marion'
        ? 'Overheard on the street: "On the 26th I shut the shop at one and I was in the flat till the bell went, and I heard the vestry clock at a quarter to two, and I’ll say that in front of anybody." — which is a lot of explaining, with the times going backwards.'
        : 'Overheard on the street: "On the 26th I shut at one and stayed in the flat. The sign said Closed and it was closed. Ask anybody." Nobody asked. Everybody asked each other, which is the same thing in Ashfield.'
    },
    {
      id: 'c_penry_a', day: 3, kind: 'note', from: 'someone', caseClue: true,
      text: (a) => a.killer === 'penry'
        ? 'The vestry door has a lock with a thumb on the far side. "Reverend was in till closing, hour to hour, lamp on," says somebody who was not there. If he was in till closing and the lock was on his side of the door, nobody on the outside could have got in — unless the person talking about being inside was inside.'
        : 'The vestry door locks from the vicar’s side, and the lamp was lit till closing-time on the 26th, and the lock was never broken. So the Reverend was last out, or first in — and he has never once said which, only that the register was undisturbed.'
    },
    {
      id: 'p3c', day: 3, kind: 'letter', to: 'keeper', face: 'Postmaster. Hand delivered, no stamp.',
      read: {
        from: 'penry', subject: 'The night of the 26th',
        body: 'You will forgive a note rather than a call. I keep the parish register, as my predecessors did, and I was in the vestry the night your predecessor fell. The register was undisturbed; the door was not. Those two facts I have, and I have been turning them over alone for a fortnight, and I have got as far as wanting somebody who is not from here to turn them over with me.\n\nYou are not from here. That is not a slight. It is the entire qualification.',
        sign: 'A. Penry',
        replies: [
          {
            text: 'I will look at the register with you.', effects: { trust: { penry: 2 }, flags: ['rev_promise'] },
            outcome: 'The reply goes back the way it came, under the vicarage door, and the vestry lamp is lit an hour early that afternoon. He does not come and find you. He waits, which is worse and better.'
          },
          {
            text: 'The inquest said accident.', effects: { trust: { penry: -1 } },
            outcome: 'A short note comes back: *It did, and I signed it, and a man does not unsign a thing.* He is unfailingly polite about it, all fortnight, in a way you come to dislike very much.'
          },
        ],
      }
    },

    // ---- day 4
    { id: 'p4a', day: 4, kind: 'letter', to: 'return', face: 'Mrs H. Vale, the Post Office, Ashfield' },
    { id: 'p4b', day: 4, kind: 'letter', to: 'wren', face: 'THE FOX & HOUNDS — brewery, invoice enclosed' },
    { id: 'p4c', day: 4, kind: 'letter', to: 'penry', face: 'Rev. A. Penry, St Anne’s — Diocesan Registry, Marriages & Burials' },
    {
      id: 't_thimble', day: 4, kind: 'thing', owner: 'edith', art: 'thimble',
      what: 'A silver thimble, worn thin at the crown', marks: ['lavender', 'rose']
    },
    {
      id: 'n4a', day: 4, kind: 'note', from: 'marion', gives: ['lavender', 'till'],
      text: 'Two things while I think of it. Anything that smells of lavender has been in Rose Cottage — she has it in every drawer and it never comes out. And if a till receipt turns up in something, it’s not who bought it, everyone buys here. It’s who keeps them. I keep mine. — M.T.'
    },
    {
      id: 'c_wren_a', day: 4, kind: 'note', from: 'someone', caseClue: true,
      text: (a) => a.killer === 'wren'
        ? '"i was late back on the 26th and nobody saw me, i could say i was anywhere and nobody could say different, i waited for it to be worth saying" — she handed that to a stranger like a discount off a broken jar. Innocence does not price itself that low.'
        : '"i was late back on the 26th, that’s all it was, i missed the 6.40 by a minute and sat on the green till the last one came in." She keeps the timetable, folded to one column: the 6.40 in, then the 8.10 out. She has never once said she stayed home.'
    },
    {
      id: 'c_tom_a', day: 4, kind: 'note', from: 'someone', caseClue: true,
      text: (a) => a.killer === 'tom'
        ? '"i was at the gate at five and the beasts was seen to and i saw nobody and nobody saw me." He says three times in one sentence that nobody saw him. A man who did nothing at a gate would not care whether he was seen.'
        : '"i was at the gate at five, all afternoon, beasts seen to, nobody on the road." The gate is at Low Farm, half a mile and a bend from the vestry — and the prints in the churchyard mud on the 27th came back up that road, which he pointed out himself, first, twice.'
    },
    {
      id: 'c_none_a', day: 4, kind: 'note', from: 'someone', caseClue: false,
      text: 'A slip with the lights of the parish on it, and one line: *seven houses, one bell, one van.* You have no idea who wrote it, and it puts the whole of the 26th in one row.'
    },

    // ---- day 5
    { id: 'p5a', day: 5, kind: 'letter', to: 'tom', face: 'LOW FARM — veterinary account, second notice' },
    { id: 'p5b', day: 5, kind: 'letter', to: 'wren', face: 'W. Hollis — School of Nursing, admissions' },
    { id: 'p5c', day: 5, kind: 'letter', to: 'marion', face: 'The Shop — a biscuit tin, by post, no sender' },
    {
      id: 't_matchbox', day: 5, kind: 'thing', owner: 'wren', art: 'parcel',
      what: 'A matchbox with four matches and a phone number in it', marks: ['beer', 'biro']
    },
    {
      id: 'n5a', day: 5, kind: 'note', from: 'someone', gives: ['beer'],
      text: 'Nothing leaves the Fox with a beer mat stuck to it unless Wren was carrying it. She puts everything down on a mat. Landlord’s rule, and she is the only one who keeps it.'
    },
    {
      id: 'c_edith_a', day: 5, kind: 'note', from: 'someone', caseClue: true,
      text: (a) => a.killer === 'edith'
        ? '"i was at my window at eight and i saw nobody go up to the vestry and i saw nobody come down, because there was nobody." She would say that about a fox. She says an empty lane with the certainty of a woman who had already watched it.'
        : '"i was at my window at eight on the 26th and i saw Tom go up and come back, and i saw the vestry light, and i saw nobody else all evening, and i am eighty-something and my eyes are fine." It is the first account that gives you more than one person in the same hour, which is what accounts are for.'
    },
    {
      id: 'c_sam_a', day: 5, kind: 'note', from: 'someone', caseClue: true,
      text: (a) => a.killer === 'sam'
        ? 'The surgery ledger for the 26th has the 9 PM call to the vestry — door locked, waited eleven minutes, came away. It is in his hand, ink on paper, done. Except the door has a thumb lock on the vicar’s side, and a man who tried it from outside would have known it would not simplify to "locked". A careful man writes what he needs the page to say.'
        : 'The surgery ledger for the 26th has the 9 PM call: *vestry, door locked from within, waited eleven minutes, came away.* He wrote it down at the time, which is more than the other five of you did, and it is the only entry on the page with the ink still sharp.'
    },
    {
      id: 'c_marion_b', day: 5, kind: 'note', from: 'someone', caseClue: true,
      text: (a) => a.killer === 'marion'
        ? 'The shop till closed at ten to one on the 26th, not one. The shopkeeper, asked about the stamp on the back of a receipt, said "the one o’clock one is for the morning, it sits till the bell". She knows which stamp is which the way a lock knows its key: too well.'
        : 'The till tape for the 26th is the standard one, down to the penny, and the shop sign says Closed at one till two. Marion rounds everything off, including her own memory of the day; that is the whole of it, and there is nothing wrong with it.'
    },

    // ---- day 6
    { id: 'p6a', day: 6, kind: 'letter', to: 'edith', face: 'Mrs E. Marlow, Rose Cottage — from a firm of solicitors' },
    { id: 'p6b', day: 6, kind: 'letter', to: 'sam', face: 'The Surgery — parish register enquiry, ref. 7/4' },
    {
      id: 't_timetable', day: 6, kind: 'thing', owner: 'wren', art: 'timetable',
      what: 'A bus timetable, folded to one column, annotated', marks: ['biro', 'bus']
    },
    {
      id: 'n6a', day: 6, kind: 'note', from: 'wren', asks: 't_matchbox',
      text: 'if a matchbox turns up with a number in it that’s mine and i want it back please. not the matches. the number. — w'
    },
    {
      id: 'c_keeper_a', day: 6, kind: 'note', from: 'someone', caseClue: true,
      text: (a) => a.killer === 'keeper'
        ? 'They found the post office’s own log for the 26th: a parcel booked in at half past eight, and out again at half past eight, and nobody’s initial at either end. The new postmaster says the evening is a blur after six, but remembers the parcel room being locked. A person does not usually remember a lock and forget what they locked it against.'
        : 'The post office log for the 26th is blank from half six to nine — you checked it first. A parcel room unattended on the night of a death, with the sorting tray unlocked, is a room somebody else also knows about.'
    },
    {
      id: 'p6c', day: 6, kind: 'letter', to: 'keeper', face: 'Postmaster, the Post Office, Ashfield. By hand.',
      read: {
        from: 'wren', subject: 'the night harriet died',
        body: 'everybody says they were somewhere. i was on the 6.40 and the pub shut late and i carried the till money up to marion’s because the tin leaked on the hills and i didn’t want to be the one who "found" the vestry with nobody in it.\n\nnobody ever writes any of this down. you’re the post. that’s your bit. write it down. — w',
        sign: 'w',
        replies: [
          {
            text: 'I will write it down.', effects: { trust: { wren: 2 }, flags: ['wren_alibi'] },
            outcome: 'She reads it behind the bar with her back to the room, and folds it very small, and puts it in the pocket she keeps things in. It is the first account of the 26th that somebody else signed for you. You file it under *her three places in one evening*, and it is only later you see how many of that night were in three places at once.'
          },
          {
            text: 'Who carried the money up to Marion?', effects: { trust: { wren: 1 }, flags: ['wren_alibi'] },
            outcome: '“she keeps the till after the pub shuts, worst-kept secret in ashfield, the sodding bell’s out of order so you knock on the flat door.” She says it all in one breath, which is what telling somebody to hurry up sounds like when they have decided to be useful.'
          },
          { text: 'Leave it.', outcome: 'The offer sits there, un-walked. In the morning it has been moved to the bottom of the pile by nobody you saw, and you catch yourself not looking at it.' },
        ],
      }
    },

    // ---- day 7
    { id: 'p7a', day: 7, kind: 'letter', to: 'penry', face: 'The Vicarage — account, lamp oil, quarterly' },
    { id: 'p7b', day: 7, kind: 'letter', to: 'tom', face: 'T. Ferrier — a card, black-edged' },
    { id: 'p7c', day: 7, kind: 'letter', to: 'return', face: 'Mrs H. Vale, the Post Office, Ashfield. Postmarked Ashfield.' },
    {
      id: 't_key', day: 7, kind: 'thing', owner: 'penry', art: 'key',
      what: 'A key on a loop of grey string, long and iron', marks: ['cross', 'oil']
    },
    {
      id: 'n7a', day: 7, kind: 'note', from: 'edith', gives: ['cross', 'oil'],
      text: 'Dear postmaster — church iron is cut with a cross at the end of the ward, always was. And the Reverend fills that lamp himself and gets the oil on everything he owns. Those two together are not a mystery. — E.M.'
    },
    {
      id: 'c_penry_b', day: 7, kind: 'note', from: 'someone', caseClue: true,
      text: (a) => a.killer === 'penry'
        ? '"the register was undisturbed," says the man who has the only key. He would not have to say it if nobody had been in there; he has said it eleven times, which is eleven more than anybody asked for. A disturbed page, turned once by the wrong hand, would show it.'
        : '"the register was undisturbed," says the man with the only key, and the lamp shows nothing and the lock shows nothing; and nobody has ever once suggested the register was the thing of his that was touched that night.'
    },
    {
      id: 'c_wren_b', day: 7, kind: 'note', from: 'someone', caseClue: true,
      text: (a) => a.killer === 'wren'
        ? '"we drink a toast on the 26th," she said, then, quickly: "i mean we did, this year. first time. it was nothing to do with harriet." A room full of people who toast the same night every year stops when it hears the word *this year*. It was the first time because she made it the first time.'
        : '"they drink in the bar on the 26th and i serve them," she said. "toast to nobody, i don’t joined." It is the one night a fortnight she lets herself be seen behind the bar for the whole of, and nobody ever noticed, which she says is the point of bars.'
    },
    {
      id: 'c_tom_b', day: 7, kind: 'note', from: 'someone', caseClue: true,
      text: (a) => a.killer === 'tom'
        ? '"the gate is locked at dark," he says, "has been since bracken went missing." He says "locked" the way you would say "put away". The churchyard gate is not stoppered and never was; it hangs, and it swung in the wind all night, and he would know that and he is saying it anyway.'
        : '"the gate by the church has been off its latch since bracken’s collar came back," he says, "you can’t lock that one, it swings." He knows the churchyard gate because he walks the lane, and walking the lane is the one thing he will not be drawn on, and it is the only thing worth drawing him on.'
    },
    {
      id: 'c_edith_b', day: 7, kind: 'note', from: 'someone', caseClue: true,
      text: (a) => a.killer === 'edith'
        ? '"thirty years of Thursdays and not one missed, and the 26th was a Thursday, and i did not go out, and i saw nobody." She would say it pitch-perfectly: an alibi rehearsed for a month has a shine worn into it, like a coin in a pocket, and that one has been carried.'
        : '"thirty years of Thursdays and not one missed," she says, of the flowers in the north corner, "and not one watched, which is why i watched the 26th." It was a Thursday, and she went, and she saw Tom come down and nobody else go up, and she has told you this twice now, in order, because she keeps it in order.'
    },

    // ---- day 8
    { id: 'p8a', day: 8, kind: 'letter', to: 'marion', face: 'Mrs M. Tebbutt — a card, ‘On Your 51st’' },
    { id: 'p8b', day: 8, kind: 'letter', to: 'edith', face: 'Mrs E. Marlow, Rose Cottage — a diary, returned unread' },
    {
      id: 't_bookmark', day: 8, kind: 'thing', owner: 'sam', art: 'book',
      what: 'A paperback about cathedrals, read to page ninety three times', marks: ['script', 'bench']
    },
    {
      id: 'n8a', day: 8, kind: 'note', from: 'marion', gives: ['bench', 'script'],
      text: 'The doctor eats on the green bench every dinner and puts things down on it. That green isn’t anywhere else in the village. And those little slips — prescription pads — Sam has one in every coat and never once writes a prescription on them. — M.T.'
    },
    {
      id: 'c_sam_b', day: 8, kind: 'note', from: 'someone', caseClue: true,
      text: (a) => a.killer === 'sam'
        ? '"i wrote down eleven minutes because it was eleven minutes by my watch, and i could not have overslept, because the watch was running." A man who needs to tell you the watch was running has been told, since, that he sleeps through things. Professional men do not put small weapons of that kind in their notes.'
        : '"i waited eleven minutes and wrote eleven, which is the sort of precision that gets you called a nuisance in this village," he says, and it is— and it is exactly why the entry is the one you trust.'
    },
    {
      id: 'c_none_b', day: 8, kind: 'note', from: 'someone', caseClue: false,
      text: 'Same unsigned hand as before, but this time it is village gossip: Marion says Sam bought a recorded parcel on the afternoon of the 26th; Sam says Marion is the one who kept the receipt. By supper, each has told the story twice and changed one detail. The parcel, the receipt, and the missing ledger have become three ways of naming the same quarrel.'
    },
    {
      id: 'c_keeper_b', day: 8, kind: 'note', from: 'someone', caseClue: true,
      text: (a) => a.killer === 'keeper'
        ? '"the post office door was never bolted," say the letters, say the neighbours. "they’d leave it on the latch till all hours, harriet had a key to everywhere." The new postmaster remembers the latch, the coat, and the morning post, but not the last hour before Harriet was found. A postmaster with a key to everywhere and a blank hour has an alibi that reads like an address book with a page torn out.'
        : 'The post office door is bolted at half six behind the counter by whoever is on, and was, on the 26th, by her. The latch is brass and the bolt is iron and the shop when shut is a box. If the office was where the night went wrong, it was not this office, and you can lock that door with confidence and have instead a list.'
    },

    // ---- day 9
    { id: 'p9a', day: 9, kind: 'letter', to: 'sam', face: 'Dr S. Okafor — a form, returned unsigned' },
    { id: 'p9b', day: 9, kind: 'letter', to: 'edith', face: 'Mrs E. Marlow, Rose Cottage — in her own hand' },
    {
      id: 't_button', day: 9, kind: 'thing', owner: 'keeper', art: 'button',
      what: 'A coat button, horn, worn shiny, off the coat that hangs in your porch', marks: []
    },
    {
      id: 'n9a', day: 9, kind: 'note', from: 'ash', names: 't_button',
      text: 'the coat in your porch has a new button on it, and you did not put it there. count them. the coat has its buttons back. it is harriet’s coat. she did not wear a spare.'
    },
    {
      id: 'p9c', day: 9, kind: 'letter', to: 'keeper', face: '{{name}}, the Post Office, Ashfield',
      read: {
        from: 'sam', subject: 'The night of the 26th',
        body: 'I am going to write this down once and then let the records speak for themselves.\n\nMy ledger for the 26th says I was called to the vestry at nine, found the door locked from inside, waited eleven minutes and came away, and wrote it down. The Reverend’s register — he has let me look — says the door was open at nine and the lamp was out. Both entries are signed. They cannot both describe the same minute, and one of us has remembered the night in the order that suits him.\n\nYou are the only person who could lay the two books side by side on one desk.',
        sign: 'S. Okafor',
        replies: [
          {
            text: 'Bring yours. I will ask him for his.', scene: 'books',
            effects: { trust: { sam: 2, penry: 1 }, flags: ['sam_register'] },
            outcome: 'It takes both of them four days to actually bring anything, and when they do it is at closing, with the blind down, and the two books do not go home until something in both of them has been said out loud. What that was, they agree after, not before.'
          },
          {
            text: 'Two true books about one door.', effects: { trust: { sam: -1 } },
            outcome: 'Sam writes back one line — *Two true books, one night* — and the sentence sits in your drawer doing the work you declined to do, and you deliver to both ends of Front Street twice a day knowing the answer is standing between them.'
          },
        ],
      }
    },

    // ---- day 10
    { id: 'p10a', day: 10, kind: 'letter', to: 'penry', face: 'The Vicarage — account, lamp oil, quarterly' },
    { id: 'p10b', day: 10, kind: 'letter', to: 'tom', face: 'Low Farm — estimate for repairs to a stone wall' },
    {
      id: 't_receipt', day: 10, kind: 'thing', owner: null, art: 'slip',
      what: 'A shop receipt, smudged, for a parcel posted the afternoon of the 26th', marks: ['till', 'pricegun'],
      soldWhere: 'marion', buyer: 'sam',
      boughtOutcome: (a) => 'Marion reads the smudge in daylight. “That’s my order pad, and that’s Sam’s hand, and a parcel went out of here four hours before Harriet was found.” She taps the receipt. “The parcel is not the point. The receipt is. He kept it, folded small, with mine. A man does not keep a receipt unless he expects to need the date.”'
    },
    {
      id: 'p10c', day: 10, kind: 'letter', to: 'keeper', face: 'Postmaster, the Post Office, Ashfield. By hand.',
      read: {
        from: 'edith', subject: 'The north corner, and the 26th',
        body: 'I have written this on Thursday for Wednesday, which is how my book runs now.\n\nOn the 26th I sat at my window at eight, because the porch bell had gone at half seven and I keep my evenings in order. I did not put flowers in the north corner that week. They were already there, and a person came to stand beside them at a quarter to nine without knowing I could see the path from my window. I have been recording who visits since. They do not know the others visit, which is why their accounts do not agree.\n\nCome and sit at my window on Thursday. A person is easier to understand when you watch where they walk.',
        sign: 'Edith Marlow',
        replies: [
          {
            text: 'I will come and sit at the window.', scene: 'window',
            effects: { trust: { edith: 2 }, flags: ['edith_diary'] },
            outcome: 'It costs her nothing to put the kettle on and the chair by the pane, and it costs you nothing to sit in it, and everything the night gives back to you afterwards is yours to carry down the lane in the dark.'
          },
          {
            text: 'Who comes? You know who comes.', effects: { trust: { edith: 1 }, flags: ['edith_diary'] },
            outcome: '“I know who comes, dear,” she says, “and I know who comes to the *corner*. Those are two lists, and the shorter of them has been worrying me all winter, and the longer one is the one everybody will tell you about.”'
          },
        ],
      }
    },

    // ---- day 11: the fork
    { id: 'p11a', day: 11, kind: 'letter', to: 'return', face: 'Ashfield. No name, no house.' },
    {
      id: 'p11b', day: 11, kind: 'letter', to: 'keeper', face: 'To whoever is holding the pen',
      read: {
        from: 'ash', subject: 'The 26th',
        body: 'you have five people’s alibis, two books and a receipt, and you have not yet asked who benefited when Harriet Vale died. That is the question that breaks the evening open.\n\nIt is a small village. Seven houses. Harriet kept a red ledger of parish donations, shop accounts, farm boundaries, medical orders and letters that should never have been opened. Every person on the map had a reason to want one page missing.\n\nWrite the report. File it as it was filed, give the constable a name, or leave the question unanswered. I am not threatening you. I am asking whether you can tell an alibi from an explanation.\n\nSeven houses. One ledger. Fold it.',
        sign: '',
        suspects: { effects: { flags: ['accused_name_said'] } },
        replies: [
          {
            text: 'File it as it was filed.', effects: { ending: 'file', flags: ['chose_file'] },
            outcome: 'You write the report the way the inquest wrote the verdict: even, careful, closed. It goes in the drawer under the tape with the rest of the 26th. You have chosen what the village asks of you, which is that nothing change.'
          },
          {
            text: 'Give the constable a name.', suspects: true,
            outcome: ''
          },
          {
            text: 'Leave it. Let the 26th keep what it keeps.', effects: { ending: 'quiet', flags: ['chose_quiet'] },
            outcome: 'You push the envelope to the back of the drawer and do not open it again. You have answered the only question it asked, which was whether you would. The answer was no, and the letter already knew you were going to say that, which is the part you will not be able to explain to the constable.'
          },
        ],
      }
    },

    // ---- day 12
    { id: 'p12a', day: 12, kind: 'letter', to: 'marion', face: 'Mrs M. Tebbutt, The Shop, Front Street, Ashfield' },
    {
      id: 'p12b', day: 12, kind: 'letter', to: 'keeper',
      face: 'Postmaster, the Post Office, Ashfield — Nettleton Constabulary, by hand',
      read: {
        from: 'parish', subject: 'The 26th — report',
        body: (a) => a.has('chose_file') || a.has('chose_quiet')
          ? 'Dear Postmaster — the constabulary notes the inquest’s finding of accident in the matter of Mrs Harriet Vale, and stands by it. We write to thank you for your discretion. There is nothing further to discuss unless new evidence is signed and dated.\n\nSeven houses. The map is the parish’s and stays on the wall.'
          : 'Dear Postmaster — regarding the matter of Mrs Harriet Vale of the 26th of November, the constabulary would be obliged for your report, and for anything your sorting has turned up in the meantime. We have never had the post office decline to answer a question on this file, and we do not expect you to be the first.',
        sign: 'Parish Council of Ashfield',
        replies: [{ text: 'Sign and seal it.', outcome: 'You sign it, and the seal goes over the fold, and the weight of the 26th goes down the road ahead of you.' }],
      }
    },
  ];

  // ------------------------------------------------------------ things on the map
  // Marks on the village itself: prints, a scarf, a lamp, flowers, a scrap of a receipt, a
  // stone. They are drawn faint. You find them by looking, you pick them up by clicking, and
  // then they are something you can carry to somebody's door and say out loud. Some of them
  // lead to the next one — `opens` is the id a telling uncovers.
  const finds = [
    {
      id: 'f_prints', day: 3, x: 29, y: 17, art: 'paws',
      look: 'Boot prints in the vestry porch, going in and coming out, the same foot twice. The heel has a nail in it. They are drying, which means what they are in the wet of the 26th, all night, is worse.',
      tell: {
        who: 'tom', label: 'Tell Tom about the boot prints',
        effects: { trust: { tom: 1 }, flags: ['prints_tom'] }, opens: 'f_scarf',
        outcome: 'Tom puts his own boot down beside them, which is a thing you do not ask a man to do twice. “Aye,” he says. “That’s mine, that print, and that’s the last one in.” He traces the one where the foot went with it, and stops. “Prints dry from the outside in. That one’s still wet under the toe. Twenty-sixth rain soaked in behind somebody, and the last boot out of this porch was not the last one out, because the last one out is still drying.”'
      }
    },

    {
      id: 'f_scarf', day: 0, x: 24, y: 32, art: 'collar', when: (a) => a.has('prints_tom'),
      look: 'A scarf, caught on the churchyard gate, the gate Tom swears is off its latch and can’t be caught on anything. The wool is the good Christmas wool, the skein that reached the shop in November and went out in one parcel.',
      tell: {
        who: 'marion', label: 'Ask Marion about the scarf',
        effects: { trust: { marion: 1 }, flags: ['scarf_marion'] }, opens: 'f_lamp',
        outcome: 'Marion turns the scarf over and names the wool without hesitating: “That’s the good wool, from the November delivery. One parcel to Rose Cottage, one to me, and one wrapping paper round a spool for —” she stops, and says it flat: “for the vestry, for the Reverend’s sister’s shawl, and I have the leftover skein in the box under the till, and the leftover has a knot in it where a row was taken out to match. That scarf was being worn the night it came undone.”'
      }
    },

    {
      id: 'f_flowers', day: 4, x: 46, y: 81, art: 'flowers',
      look: 'Flowers in the north corner of the churchyard, laid where there is no stone and no mound, still damp. On the 26th they were there before dark, which is all they have ever said about whether they were there before her.',
      tell: {
        who: 'penry', label: 'Ask the Reverend about the north corner',
        effects: { trust: { penry: 1 }, flags: ['flowers_rev'] },
        outcome: '“For her,” he says, and you know by *her* that he means Harriet, because the corner belongs to the previous postmistress and he has never once said it belonged to anybody else. “I laid them. It is the smallest thing a man did all week, and it is the one I never tell anybody about, and I am telling you because you are the only one who has ever asked me about the night.”'
      }
    },

    {
      id: 'f_lamp', day: 0, x: 33, y: 72, art: 'lamp', when: (a) => a.has('scarf_marion'),
      look: 'The vestry hurricane lamp, back on its hook, drained dry and cold. Whoever used it the night of the 26th brought it back empty and never filled it, and filling it is the one recorded rule of that porch.',
      tell: {
        who: 'penry', label: 'Tell the Reverend about the lamp',
        effects: { trust: { penry: 1 }, flags: ['lamp_mill'] }, opens: 'f_draft',
        outcome: 'Penry lifts the lamp and shakes it once, the way a man shakes a bag of nothing. “It was full on the 26th,” he says. “I filled it that afternoon, in the light, and I watched the wick. Whoever carried it back carried it dry, and the one rule of this porch is you do not put a lamp back dry, and I have broken that rule eleven times this fortnight without moving the lamp, which tells you what I think of it being a rule.”'
      }
    },

    {
      id: 'f_draft', day: 0, x: 55, y: 22, art: 'smooth', when: (a) => a.has('lamp_mill'),
      look: 'A folded sheet in the vestry side-board, the Parish Council’s notice about Mrs Vale’s accident, written the day before she died, with a final line on the back: *alter last paragraph if the account changes.*',
      tell: {
        who: 'marion', label: 'Show Marion the notice',
        effects: { trust: { marion: 1 }, flags: ['draft_seen', 'tea'] }, opens: 'f_stone',
        outcome: 'Marion reads it twice, holding it flat on the counter like a till tape, then turns it over and reads the back the way you read the back of a bill. “Written the day before,” she says. “That is not a notice; it is a prepared statement. Somebody expected the account to need changing.” She puts it down, and looks at you for the first time all morning. “Tea. Four o’clock. Above the shop. Bring this.”'
      }
    },

    {
      id: 'f_stone', day: 0, x: 41, y: 55, art: 'wall', when: (a) => a.has('draft_seen'),
      look: 'A stone, turned up in the churchyard bed, with the corner of a postmark pad still gummed to its flat side, and the print of a boot-soled heel on the wet of it.',
      tell: {
        who: 'edith', label: 'Ask Edith about the stone',
        effects: { trust: { edith: 1 }, flags: ['stone_edith', 'edith_vigil'] },
        outcome: 'Edith takes it to the light of the window, the way you take a thing to a letter box. “Somebody stood on this to be sure of their reach,” she says, “the night the flowers were already there. The postmark pad ink is yours, dear — it is the office pad, and the office pad does not leave the office, and somebody has been using the office when the office was shut.” She hands it back. “You are the post. The office keeps the key to everywhere. Keep one.”'
      }
    },
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
      'p4a:marion': {
        effects: { trust: { marion: 2 }, flags: ['vale_to_marion'] },
        outcome: 'You put the dead postmistress’s letter into Marion’s hand on purpose. She looks at the front of it for a long time. “Harriet,” she says, out loud, which nobody in this village has done for a fortnight, and puts it in her apron, and does not open it in front of you.'
      },
      'p7c:marion': {
        effects: { trust: { marion: 1 }, flags: ['ledger_seen'] },
        outcome: 'The second one she does open, at the counter, standing up. Then she bolts the shop door in the middle of the afternoon and takes a ledger out from under the till, and there is a date in the margin against the night of the 26th, in a hand that stopped writing before you arrived.'
      },
    },
  };

  // ------------------------------------------------------------ the address book
  // Facts that appear on a page the first day their `when` is true, and stay. `key` is the
  // keyword outreach can ask about.
  const notes = {
    marion: [
      { key: 'shop', text: 'Runs the shop next door. Anything that comes into Ashfield comes past her window first, unless it comes through your door.', when: (a) => a.met('marion') },
      { key: 'the 26th', text: 'Shut at one on the 26th and says so, and the sign on the door agrees with her, and the till agrees with the sign, and that is more agreeing than you have been able to get out of anybody.', when: (a) => a.has('vale_to_marion') },
      { key: 'tea', text: 'Tea is at four, above the shop. Bring what she asks for. She means it.', when: (a) => a.has('tea') },
      { key: 'harriet', text: 'Says the name Harriet out loud, which nobody else here will do. Kept Harriet’s letters in the till, and her own name in the ledger against the 26th.', when: (a) => a.has('ledger_seen') },
    ],
    penry: [
      { key: 'the register', text: 'Keeps the parish register in the vestry, and was in it the night of the 26th, and has been adding it up ever since to make the door say what he remembers.', when: (a) => a.met('penry') },
      { key: 'the 26th', text: 'Two books about one door: his says open at nine, Sam’s says locked. He has carried both since November and told nobody which he believes.', when: (a) => a.has('rev_confess') },
      { key: 'the lamp', text: 'Fills the vestry lamp himself and gets the oil on everything he owns, and brought one back dry this fortnight, and has not filled it, and it is still dry.', when: (a) => a.has('lamp_mill') },
      { key: 'the flowers', text: 'Lays flowers in the north corner for Harriet and has never said who for, because the woman was the predecessor of a postmaster, which for him is a class of person who is his parishioner and then gone.', when: (a) => a.has('flowers_rev') },
    ],
    wren: [
      { key: 'the fox', text: 'Behind the bar at the Fox, twelve to three and six till close. Writes in lowercase. Was three places at once on the 26th, which is the most places anybody in this village was anywhere.', when: (a) => a.met('wren') },
      { key: 'the 26th', text: 'On the 6.40, then the till money up to Marion’s, and said so in writing before you asked, which makes her the only witness in the village who acted like a witness.', when: (a) => a.has('wren_alibi') },
      { key: 'the city', text: 'The 8.10 goes. The 6.40 comes back the same way. She has an opinion about only one of those.', when: (a) => a.knowsClue('bus') },
      { key: 'the course', text: 'There is a school of nursing that writes to her, and she has not opened any of them where anyone can see.', when: (a) => a.sorted('p5b') },
    ],
    tom: [
      { key: 'low farm', text: 'Low Farm, up the mill road. Mends rather than replaces. Stands at the gate at five, looking up the road.', when: (a) => a.met('tom') },
      { key: 'the 26th', text: 'Put his own boot beside the porch print and read the drying of it, which is more forensics than the constable from Nettleton did in a fortnight.', when: (a) => a.has('prints_tom') },
      { key: 'the churchyard gate', text: 'Says the churchyard gate is off its latch and always was. The scarf was caught on it. Gates that hang do not catch.', when: (a) => a.has('scarf_marion') },
      { key: 'bracken', text: 'A brown collie. The one creature in the village that could have stood at the corner and been forgot, and it was locked up that night, which is the oddest fact of the lot.', when: (a) => a.knowsClue('dogcoat') },
    ],
    edith: [
      { key: 'rose cottage', text: 'Rose Cottage, the far end. Everything that has been in it smells of lavender for weeks.', when: (a) => a.met('edith') },
      { key: 'remembers', text: 'Remembers everything, which she says is a burden and not a gift.', when: (a) => a.met('edith') },
      { key: 'the 26th', text: 'Was at her window at eight and saw Tom come down and nobody go up, and keeps two lists, the longer one being the one everyone will tell you about.', when: (a) => a.has('stone_edith') },
      { key: 'the window', text: 'Was at her window at eight on the 26th and has kept a book of who comes to the corner since, and the shorter list is worrying her and the longer one is the one everybody will tell you about.', when: (a) => a.has('edith_diary') },
    ],
    sam: [
      { key: 'the surgery', text: 'The surgery on Front Street. Tuesday and Thursday mornings, and the green bench every dinner time.', when: (a) => a.met('sam') },
      { key: 'the 26th', text: 'Wrote down nine, door locked, eleven minutes, in his own hand at the time. Then took two weeks to ask the one man with the other book.', when: (a) => a.has('sam_register') },
      { key: 'the bench', text: 'Eats on the green bench and puts things down on it to think. That is how Sam loses things.', when: (a) => a.knowsClue('bench') },
      { key: 'the receipt', text: 'Kept a shop receipt for a parcel posted the afternoon of the 26th, folded small, and never threw it out, which for a man who loses things daily is a decision.', when: (a) => a.sorted('t_receipt') },
    ],
  };

  // ------------------------------------------------------------ reaching out
  // Written by hand, and few, because the asking that matters is generated: you can ask anybody
  // about anything in your box, and about anything you have found on the map. These are the
  // things that are not about an object.
  //
  //   kind: 'ask' (one per person per day) | 'visit' (one a day, all told). `need` — a trust
  //   level: the door does not open until people are that far in with you (AM-8).
  const outreach = [
    {
      id: 'o_marion_tea', who: 'marion', kind: 'visit', text: 'Go up for tea above the shop',
      when: (a) => a.has('tea'),
      effects: { trust: { marion: 2 }, flags: ['marion_tea_done'] },
      plans: [{ at: 'shopflat', hour: 16, doing: 'tea, above the shop', with: 'you' }],
      outcome: 'The cat is eleven and has been eleven for a while. Marion talks for an hour about nothing at all and then, at the door, with your coat on: “There’s an envelope under my till with Harriet’s name on it, and a receipt with a live man’s writing on it, and I have never opened either. I’m telling you because you’re the post. It’s the only reason.”'
    },

    {
      id: 'o_marion_ledger', who: 'marion', kind: 'ask', text: 'Ask about the envelope under the till',
      when: (a) => a.has('marion_tea_done') && !a.has('ledger_seen'), need: 1,
      effects: { trust: { marion: 1 }, flags: ['ledger_seen'] },
      outcome: 'She takes it out and does not hand it over. Under it is a ledger, and in the margin of the ledger is the night of the 26th, and it is against your own name, and it is in a hand that stopped writing before you arrived, and there is a tick beside it you did not make.'
    },

    {
      id: 'o_marion_case', who: 'marion', kind: 'ask', text: 'Lay the case out over tea and ask her to read it',
      when: (a) => a.has('ledger_seen'), need: 3,
      effects: { trust: { marion: 1 }, flags: ['marion_case_read'] },
      outcome: 'She will not have you read it to her; she reads it herself, holding each note flat like a till tape, and puts them in a row in an order that is not yours. “That’s the one that doesn’t fit,” she says, of a note you had not noticed was smaller than the others. “Everything else is somebody accounting for themselves. That one is somebody accounting for somebody.”'
    },

    {
      id: 'o_penry_register', who: 'penry', kind: 'visit', text: 'Go and turn the register over with him',
      when: (a) => a.has('rev_promise'),
      effects: { trust: { penry: 2 }, flags: ['reg_vestry', 'rev_confess'] },
      plans: [{ at: 'vestry', hour: 15, doing: 'the register, the lamp lit in broad daylight', with: 'you' }],
      outcome: 'Two books about one door, and he turns through his without comment, letting you be the one who says it. Then he closes the book and says, to the book: “I signed the inquest with the lamp dry. I am not a fanciful man, and I would very much like somebody else to be in the room when I say this next part.”'
    },

    {
      id: 'o_penry_lists', who: 'penry', kind: 'ask', text: 'Ask him which list the 26th is on',
      when: (a) => a.has('reg_vestry') || a.has('reg_box'), need: 1,
      effects: { trust: { penry: 1 }, flags: ['reg_lists'] },
      outcome: '“The register is a list of everyone who has been in this village, and the 26th is on it, and one of the people on it is not on any other list,” he says. “I have been a priest for thirty-one years, and I have never once said a living person’s name out loud who was better off not being on a list.”'
    },

    {
      id: 'o_wren_cellar', who: 'wren', kind: 'visit', text: 'Go and hear her places on the 26th, in order',
      when: (a) => a.has('wren_alibi'),
      effects: { trust: { wren: 2 }, flags: ['wren_box'] },
      plans: [{ at: 'cellar', hour: 15.5, doing: 'the till money, the bus, the lane, in order', with: 'you' }],
      outcome: 'She walks it again for you, in biro on a till slip, then crosses it out and writes it where nobody reads: “6.40 on, bin the till money to marion’s, lane up, pub shut, back of the hall at ten to nine, saw the vestry light on and the corner empty and came in the back way. i don’t know why i’m telling you in the cellar. it felt safer.”'
    },

    {
      id: 'o_wren_green', who: 'wren', kind: 'visit', text: 'Stand on the green at ten past eight',
      when: (a) => a.has('wren_box') && a.day >= 8,
      effects: { trust: { wren: 3 }, flags: ['wren_aware', 'wren_promise'] },
      plans: [{ at: 'green', hour: 8.17, doing: 'the bus stop, ten past eight', with: 'you' }],
      outcome: 'The bus comes. She does not get on it. “my five minutes are accounted for now,” she says, “which is the thing people spend a fortnight trying to do, so i did it out loud in front of the one person who writes it down. you know what i did on the 26th, and you know it was nothing, and that’s the price of being in this village twice.”'
    },

    {
      id: 'o_tom_gate', who: 'tom', kind: 'visit', text: 'Stand at the gate with him at five',
      when: (a) => a.returned('tom') > 0 || a.has('prints_tom'),
      effects: { trust: { tom: 1 }, flags: ['went_with_tom', 'tom_hope'] },
      plans: [{ at: 'gate', hour: 17.5, doing: 'the gate at the end of the day', with: 'you' }],
      outcome: 'Twenty minutes and eleven words. At the end of it he says “You’ve got the hole in the night the policeman walked round,” which is the longest sentence of his fortnight, and “Right,” which from Tom is an hour of anybody else’s conversation, and you find you agree.'
    },

    {
      id: 'o_edith_window', who: 'edith', kind: 'visit', text: 'Sit at the window on a Thursday',
      when: (a) => a.has('edith_diary'),
      effects: { trust: { edith: 2 }, flags: ['counted_with_edith', 'watched_flowers'] },
      plans: [{ at: 'rose', hour: 15, doing: 'the window that looks at the churchyard', with: 'you' }],
      outcome: 'She writes down who comes, in a book that already has Thursday in it, and then turns the book round and hands you the pen, and there is a line left blank with the time on it, and the time is now, and the person who comes at the blank time is nobody she has ever seen before, which she says, which is why she gave you the pen.'
    },

    {
      id: 'o_edith_page', who: 'edith', kind: 'ask', text: 'Ask about the folded page',
      when: (a) => a.has('counted_with_edith'),
      effects: { trust: { edith: 1 }, flags: ['diary_page_read'] },
      outcome: '“I folded it over so that I would not read it by accident,” she says, “and then I read it at two in the morning, on my own, because I am eighty-something and not a saint.” She will not say what is on it. She says you will not need telling. It is the first night in a fortnight she has not handed you the pen.'
    },

    {
      id: 'o_edith_case', who: 'edith', kind: 'ask', text: 'Ask Edith which of the six notes is the one that does not fit',
      when: (a) => a.has('counted_with_edith'), need: 2,
      effects: { trust: { edith: 1 }, flags: ['edith_case_read'] },
      outcome: 'She does not read them. She watches you read them, which is worse. “You kept six,” she says. “I saw the postmaster before you keep six, on forty-one nights, and on the 26th she kept none at all. That is the only note in this drawer that is about the night itself rather than about the person who wrote it.”'
    },

    {
      id: 'o_sam_bench', who: 'sam', kind: 'visit', text: 'Sit on the green bench at dinner time',
      when: (a) => a.returned('sam') > 0 || a.sorted('p2b'),
      effects: { trust: { sam: 1 }, flags: ['met_sam', 'look_records'] },
      plans: [{ at: 'green', hour: 13, doing: 'the bench, one sandwich each', with: 'you' }],
      outcome: 'Sam is precise about the weather for six minutes and then says, looking straight ahead: “I have written the night of the 26th on four forms this week and it was not the 26th on any of them. I would like a second opinion and I cannot ask a colleague, because the nearest one is eleven miles away and would be quite right to laugh.”'
    },

    {
      id: 'o_sam_drive', who: 'sam', kind: 'visit', text: 'Go on the afternoon round in the car',
      when: (a) => a.has('met_sam') && a.day >= 7, need: 2,
      effects: { trust: { sam: 2 }, flags: ['drove_with_sam'] },
      plans: [{ at: 'road', hour: 14, doing: 'the round, in the car, the long way', with: 'you' }],
      outcome: 'Eleven miles out and eleven back. At the county line Sam pulls in without saying why, sits for a minute, and turns round. “I do that most weeks,” Sam says. “I get to the sign and I turn round. I have never been able to make a sentence out of why. On the 26th I turned round at nine and came back and wrote the door was locked, and that is the only sentence I have ever made out of it.”'
    },
  ];

  // ------------------------------------------------------------ long things that happen after dark
  // AM-14: a reply that sets one of these going plays at the end of the day, after the walk.
  // `effect` is applied when you choose, and `reach` can fire a visit.
  const scenes = {
    books: {
      id: 'books', title: 'The two books',
      text: (a) => 'Sam brings the surgery ledger for the 26th, and Penry brings the register for the 26th, and neither of them will be the first, so they stand at your counter at closing with the blind down, both of them, waiting for you to be first.\n\nSeven houses. Two books. One night, told twice. The page is the only blank thing in the room that could be first.',
      options: [
        {
          text: 'Lay them side by side.',
          effects: { trust: { sam: 2, penry: 1 }, flags: ['reg_box'] },
          outcome: 'Lay the doctor’s nine o’clock page and the vicar’s nine o’clock page side by side. One says the door was locked from inside; one says it stood open with the lamp out. The hour between them is eleven minutes long, and both of them wrote it down on the night, and neither of them can make it change.\n\nSeven houses and a door at nine o’clock. The one person not accounted for is the one the two books agree on: nobody. And the two books, at last, are talking to each other.'
        },
        {
          text: 'Read them aloud to each of them, one hour at a time.',
          effects: { trust: { sam: 1, penry: 1 }, flags: ['reg_box'] },
          outcome: 'Reading another man’s book aloud is a strange intimacy. You read the doctor’s nine o’clock page to the vicar, and the vicar’s nine o’clock page to the doctor, and neither of them interrupts, and neither of them looks at the other.\n\n“That is the first time my page has been read out loud,” says the doctor. “And mine,” says the vicar. And the two books, which have been alone for a century, are read in one room, in an hour, in a village of seven houses.'
        },
      ],
    },

    window: {
      id: 'window', title: 'The window on the north corner',
      text: (a) => 'Edith puts the kettle on and the chair by the window. The churchyard’s north corner is in the pane.\n\n“Ten past eight,” she says. “They have all been coming since the funeral, and none of them know the others come. Watch who comes. A person is easier to understand when you see where they walk.”',
      options: [
        {
          text: 'Watch at ten past eight.',
          effects: { trust: { edith: 1 }, flags: ['watched_flowers', 'marion_vigil'] },
          outcome: 'At ten past eight, Marion, with nothing in her hands, comes up the churchyard path and stands at the corner a full minute with her head down, and goes back the way the shop sign says closed. “She has been every Thursday since the funeral,” Edith says. “The shop opens late on Thursdays now.”\n\nShe writes Marion’s time in the book without being asked, and the book has had a Thursday at ten past eight in it for thirty years.'
        },
        {
          text: 'Watch at noon, when the road is quiet.',
          effects: { trust: { edith: 1 }, flags: ['watched_flowers', 'tom_vigil'] },
          outcome: 'At noon Tom comes up the churchyard path with his cap off and his coat collar up on a warm day, stands a full minute at the corner, and says something you cannot hear from the window, and goes back the way he came without looking at the church.\n\n“He gives the same account every Thursday,” Edith says, before you can ask. “He thinks nobody can see the corner from anywhere with a door.”'
        },
      ],
    },
  };

  // ------------------------------------------------------------ what you were in the middle of
  const threads = [
    {
      who: 'tom', title: 'Tom, and the print in the porch',
      beats: [
        (a) => a.has('prints_tom'),
        (a) => a.returned('tom') > 0 || a.trust('tom') > 0,
        (a) => a.has('went_with_tom'),
        (a) => a.has('tom_hope'),
      ],
      left: [
        'He put his boot beside the porch print and read the drying of it, and you did not take the next step, which was standing at the gate with him at five, where all his answers live.',
        'The print is still in the porch. He read it twice and told you the whole of it and then went back to the gate, and the gate has no interest in the 26th, which is why he is there at all.',
        'You stood at the gate with him once, and the eleven words he gave you included the hole in the night the policeman walked round, and then the fortnight took you elsewhere and the hole went untouched.',
        'He told you the gate is off its latch, and the scarf, and the walking at nine, and you have him down for the one man who read the night properly, and you never once asked him what he meant when he said sorry to the north corner on a Thursday at noon.',
      ],
      done: 'He read the night properly, stood at the gate with you, and told you the one thing that matters about the 26th: the print in the porch was the last one in, and the last one out is still drying.',
    },
    {
      who: 'penry', title: 'Aldous, and the door at nine o’clock',
      beats: [
        (a) => a.has('rev_promise') || a.trust('penry') > 0,
        (a) => a.has('flowers_rev'),
        (a) => a.has('reg_vestry') || a.has('reg_box'),
        (a) => a.has('reg_lists'),
      ],
      left: [
        'He wrote once, carefully, and got a polite nothing back. There is a book in that vestry with the 26th in it, and he had got as far as looking for somebody to turn it over with.',
        'He told you about the flowers before you asked him to, which is the same thing as trusting you, and he has never once volunteered the rest of the 26th.',
        'You turned the register over with him and he still has not said which list the 26th is on — the whole of him wills you to ask, and the whole of the register is on one side of the question.',
        'He signed an inquest in November with the lamp dry and has carried both since. The one person in the book he would not say out loud is the one you are trying to find.',
      ],
      done: 'He laid the 26th open in front of you, in the light, with somebody in the room, and told you what a priest keeps to himself: that the register is a list of everyone who has been here, and one of the people on it is not on any other list.',
    },
    {
      who: 'wren', title: 'Wren, and the places she was in one evening',
      beats: [
        (a) => a.has('wren_alibi'),
        (a) => a.has('wren_box'),
        (a) => a.has('wren_aware'),
        (a) => a.has('wren_promise'),
      ],
      left: [
        'She wrote down where she was on the 26th before you asked, the only one who did, and you have the slip, and it is the whole of her.',
        'The bus, the till money, the lane, the back of the hall at ten to nine — she stood you in the cellar and walked it in order, and you never asked the one question it left open, which is whose idea the corner was that night.',
        'You stood on the green at ten past eight, which was her asking, and you have the slip and the walk memorised, and never once said whose name was on the corner she went past.',
        'She wanted a witness that she existed where she said she existed on the 26th, and you were on the green at ten past eight, and the person she went past to get there has never come up between you.',
      ],
      done: 'She accounted for her five minutes out loud, in front of the one person who writes things down, and at the very end asked for the only thing she has ever asked anybody — be there, at ten past eight, and remember.',
    },
    {
      who: 'marion', title: 'Marion, and the envelope under the till',
      beats: [
        (a) => a.trust('marion') > 0,
        (a) => a.has('tea'),
        (a) => a.has('marion_tea_done') || a.has('vale_to_marion'),
        (a) => a.has('ledger_seen'),
      ],
      left: [
        'She wrote you a note about a mended handle on your second morning, unasked, because that is what she does, and got nothing back. She was waiting to see whether it would be you.',
        'Tea at four is the longest door in the village and you did not go through it. She sets the clock by Thursday openings and has the 26th in the margin of her own ledger.',
        'She told you about the envelope at the door, with your coat on, and the ledger under the till with your name against the 26th, and you have never once gone and asked her which tick in the margin is hers.',
        'The shop is the only building in Ashfield with a receipt of the one parcel that left on the afternoon of the 26th. She has the tin, the tape, the envelope, and the ledger, and she is the only witness in the village who has kept the paper.',
      ],
      done: 'You got the whole of it — envelope, ledger, margin, the tick you did not make — over tea, above the shop, which is the only place in Ashfield where the 26th is not a secret and the till is not a hole.',
    },
    {
      who: 'edith', title: 'Edith, and the book that is on time for once',
      beats: [
        (a) => a.trust('edith') > 0,
        (a) => a.has('edith_diary'),
        (a) => a.has('watched_flowers') || a.has('counted_with_edith'),
        (a) => a.has('diary_page_read') || a.has('edith_case_read'),
      ],
      left: [
        'An old woman wrote you long, beautiful, careful letters and got short answers back. She has been trying to hand somebody a book for thirty years and has not managed it yet.',
        'You took her seriously about the north corner, which nobody had in years. She was at her window at eight on the 26th and she has never once said what she saw without being asked.',
        'You sat at that window and watched who comes, and she handed you the pen with a time on it that was about you, and you never asked her whose two lists the corner is divided into.',
        'She read a page at two in the morning on her own that she had folded over so she would not read it, and said you will not need telling, and you have not needed telling, and you have not told her you know.',
      ],
      done: 'She gave you the pen and the window, and told you the two lists, and let you be the one person in the village who could hold the 26th and not flinch. The folded page, she said, you will not need telling. You did not.',
    },
    {
      who: 'sam', title: 'Sam, and the page that keeps not changing',
      beats: [
        (a) => a.has('met_sam') || a.trust('sam') > 0,
        (a) => a.has('look_records'),
        (a) => a.has('drove_with_sam') || a.has('sam_register'),
        (a) => a.has('reg_box'),
      ],
      left: [
        'The doctor has been holding the night of the 26th alone since November, wrote to you about it once in plain language, and got a shrug. It is still being held alone.',
        'You sat on the bench and Sam got as far as saying the word *nine* out loud and looking up to see whether you would disagree. That was the opening of a conversation that then did not happen.',
        'The surgery ledger says locked, the register says open, and the two books have never been on the same desk, because a village of seven houses has a custom of telling one person each.',
        'He turned round at the county line and came back and wrote the door locked, and you have the two books on one desk and the page has not changed in a fortnight, and page and page and page are about the same eleven minutes.',
      ],
      done: 'You put the two books down on one desk and read them in one room. The locked door and the open door are the same door, and Sam got what he wanted, which was somebody in the room when it stopped being a secret.',
    },
  ];

  // ------------------------------------------------------------ endings
  // The constable comes on Friday (day 12) and takes what you have made of the 26th.
  // `killer` is drawn per run; `accused` is whoever you named for the constable. The endings
  // only name the culprit when the player has kept enough case notes to support the accusation.
  const endingTitles = { file: 'The report', named: 'The name', quiet: 'The blank scrap', silent: 'The blank morning' };
  const endings = {
    file: (a) => [
      'You file it as it was filed.',
      'The report goes back the way the inquest wrote it: accident, closed, even and careful and untrue. It is a clean page, and the constable from Nettleton never turns it over, because it is clean.',
      a.killer === 'keeper'
        ? 'You remember the counter, the locked drawer, and the hour after six that will not come back in order. The report leaves that gap untouched.'
        : 'Five people stay accounted for. Someone keeps the 26th, and the office never knows which account it is looking at across the counter. That is the whole of what seven houses asked of you: not the rights of it, but the quiet of it.',
      'Harriet Vale is buried with the verdict she was given. The map keeps the same seven roofs it kept before, and the post office keeps the one drawer with the tape over it, and you are the postmaster, and this is the job.',
      'The inquest was closed in November. It has never once been opened since. You sign your name under the seal and put the pen down, and the pen is warm, or you imagine it, and the day is a Friday.',
    ],
    named: (a) => {
      const acc = firstName(a.accused || 'keeper');
      const right = a.accused === a.killer;
      const confirmed = right && a.enoughCase;
      return [
        'You give the constable a name.',
        'You say it at the door of the Nettleton office, which has never had a complaint from Ashfield that was not about a van, and the constable writes it down, and writes down your name after it, which is the part you feel.',
        confirmed
          ? (a.killer === 'keeper'
            ? 'The constable reads the dates, the blank log, and the missing hour. Then they ask you to account for the parcel room, and the room supplies the answer before you do.'
            : acc + ' takes it very quietly, in the end. The constable takes them away on a Tuesday, and the village lets a Tuesday pass with the shop open all day.')
          : 'The constable looks at ' + acc + ' — and looks at you — and asks for the page that proves it. You have an impression, a pattern, perhaps even the right name, but not enough of the case to make it hold. The file stays open.',
        confirmed
          ? 'The inquest is reopened. The accounts, the two books, and the receipt now point in one direction, and the village has to say the name aloud.'
          : 'You leave with the name written in your own hand and the evidence still scattered across the drawer. A village can be strange without being guilty, and you have not yet proved which this is.',
      ];
    },
    quiet: (a) => [
      'You leave it blank. The 26th keeps what it keeps.',
      'The unsigned letter goes to the bottom of the drawer, under the tape, with the rest of the night. The constable arrives on Friday, asks after the office’s post, and finds the folder very tidy. Nothing, in the end, is said.',
      a.killer === 'keeper'
        ? 'Seven houses go on being seven houses. You keep finding the same blank hour in your own account, and decide it is easier not to ask what belongs there.'
        : 'Seven houses go on being seven houses. Someone keeps the 26th, but you have no name you can defend. A small village does not need a killer to confess; it only needs a postmaster to fold.',
      'The blank scrap sits in the drawer for years if you let it. It is the neatest thing you have ever done, and it is the one you will keep.',
      'Nobody in Ashfield was ever charged. The inquest stands, the corner stays tended, the shop keeps Thursdays, and the only record of the night is the one you built it out of — six notes, two books, one receipt, and a blank where the answer went. It is a complete account. It is what the village is.',
    ],
    silent: (a) => [
      'You never answered it. The constable’s report is already written, and your silence becomes the final missing line in it.',
      'The letter came through your own door, on your own pile, unsigned. It is not a confession. It is an accusation waiting for evidence, and you let it sit in the drawer with the rest of the accounts.',
      'The constable reads the inquest, reads an accident, signs it, and drives back to Nettleton before the shop opens. The 26th closes a second time without you having to choose, and the truth remains in the papers you did not hand over.',
      a.killer === 'keeper'
        ? 'Seven houses, one bell, one van, and one drawer in the post office with the tape still over it. The missing hour stays between the morning post and the night account.'
        : 'Seven houses, one bell, one van, and one drawer in the post office with the tape still over it. The village remains odd, and the case notes remain unproved.',
      'Silence is a kind of keeping. You are a postmaster; you know. A fact left in the drawer does not become less true. It only becomes harder for the next person to find.',
    ],
  };

  // ------------------------------------------------------------ little helpers used above
  function firstName(who) {
    return { marion: 'Marion', penry: 'Aldous', wren: 'Wren', tom: 'Tom', edith: 'Edith', sam: 'Sam', keeper: 'you' }[who] || who;
  }
  function fullN(who) {
    if (who === 'keeper') return 'the post office';
    if (villagers[who]) return villagers[who].name;
    return who;
  }

  return {
    villagers, days, places, work,
    marks, clues, speaks, shrugs, claims,
    pile, finds, astray, notes, outreach,
    threads, scenes, endings, endingTitles,
  };
})();