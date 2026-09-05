/* Letters from Ashfield — the writing.
 *
 * Everything the village says lives here. The engine (game.js) only knows the shape.
 *
 * Item shape:
 *   id, day, type: 'letter' | 'notice' | 'rumour' | 'ash'
 *   from: villager key, or 'parish' | 'someone' | 'ash' | 'board'
 *   subject, body, sign: string or (api) => string
 *   when: (api) => boolean      — whether it appears at all
 *   replies: [{ text, when?, effects?, outcome, shift? }]
 *   pass: { villagerKey: { effects?, outcome }, '*': {...} }   — enables "carry it to someone"
 *   onIgnore: { effects?, outcome }
 *   prepinned: { text, flag, hint, outcome, leftOutcome, effects?, keptEffects? }
 *   hint: string shown under a letter that needs no answer
 *
 * Text markup: {{name}}  [[shows this|then this]]  ~~struck~~  __smudged__  ^^shivering^^
 * Effects: { trust: {who: n}, flags: [], unflag: [], remove: who, ending: 'keep'|'letgo'|'burn' } or (api) => {}
 */
window.ASHFIELD = (function () {

  const villagers = {
    marion: {
      name: 'Marion Tebbutt', role: 'The shop', address: 'The Shop, Front Street (next door)',
      bio: (a) => a.day >= 9 ? 'Runs the shop next door, and the village. Has been fifty-one for some time.' : 'Runs the shop next door to the post office, and, by general agreement, the village. Knows everyone. Tells most of it.',
      goneBio: 'Runs the shop.',
    },
    penry: {
      name: 'Rev. Aldous Penry', role: 'St Anne’s', address: 'The Vicarage, by St Anne’s',
      bio: (a) => a.has('rev_confess') || a.has('rev_confess_board') ? 'The vicar. Keeps the register. Has set a chair for every Keeper who has gone, and does not know how to stop.' : 'The vicar. Formal, kind, and careful with the parish register in a way that people have started to notice.',
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

  const senders = {
    parish: 'Parish Council',
    someone: 'Overheard',
    ash: 'Unsigned. Smeared with ash.',
    board: 'From behind the board',
  };

  // ------------------------------------------------------------ days
  const days = {
    1: {
      week: 'Monday',
      intro: (a) => a.loop ? 'Monday. Again. The porch smells of wet coats and someone else’s coffee, and you know that already.' : 'Monday. The porch smells of wet coats and someone else’s coffee. The board is yours.',
      night: 'Night. The porch light stays on by itself.',
    },
    2: { week: 'Tuesday', intro: 'Tuesday. Wind from the mill side. Three new things pinned, one of them folded twice.', night: 'Night. A dog, somewhere up the valley, then nothing.' },
    3: { week: 'Wednesday', intro: 'Wednesday. Rain on the porch roof. Someone has left muddy prints that stop at the board.', night: 'Night. Rain. The board does not get wet, which you only notice later.' },
    4: { week: 'Thursday', intro: 'Thursday. Fresh flowers in the churchyard, north corner. One of today’s letters has left grey marks on your fingers.', night: 'Night. You wash your hands twice. The grey comes off. Something does not.' },
    5: { week: 'Friday', intro: 'Friday. The village hall still smells of the supper. There was a chair with nobody in it.', night: 'Night. Somebody is walking up the mill road with a lamp. They do not come back down.' },
    6: { week: 'Saturday', intro: 'Saturday. The board has been swept and straightened. Not by you.', night: 'Night. You dream about paper. In the dream it is warm.' },
    7: { week: 'Sunday', intro: 'Sunday. Bells, then quiet, then bells again, which is wrong.', night: 'Night. [[Monday tomorrow.|Thursday tomorrow.]]' },
    8: { week: 'Thursday', intro: '[[Monday.|Thursday.]] Fresh flowers in the churchyard, north corner. The board is warm.', night: 'Night. The porch light stays on. It has never been switched off. You check.' },
    9: { week: 'Thursday', intro: 'Thursday. It has been Thursday for some time. The letters are addressed to you now, and they mean you.', night: 'Night. Something behind the board turns over in its sleep.' },
    10: { week: 'Thursday', intro: 'Thursday. The flowers from the churchyard are pinned to the board. There is a card.', night: 'Night. You hold the pin. You realise you have been holding it all day.' },
    11: { week: 'Thursday', intro: 'Thursday. Everyone has written, and not one of them has asked you anything. That is how you know what today is.', night: '' },
    12: {
      week: (a) => a.ending === 'letgo' ? 'Thursday' : 'Sunday',
      intro: (a) => a.ending === 'letgo'
        ? 'Thursday. Something is missing from the board, and you are the only one who can see the shape of it.'
        : 'Sunday. Bells, then quiet. The board is the same size it always was. So is the village.',
      night: '',
    },
  };

  // ------------------------------------------------------------ items
  const items = [];
  const add = (it) => items.push(it);

  // ===================================================== DAY 1
  add({
    id: 'n1_appoint', day: 1, type: 'notice', from: 'parish', order: 0,
    subject: 'NOTICE OF APPOINTMENT',
    body: (a) => 'The Parish Council is pleased to confirm ' + a.name.toUpperCase() + ' as Postmaster of Ashfield, following the departure of ' + (a.loop && a.prevName ? a.prevName.toUpperCase() : 'MRS H. VALE') + '.\n\nThe postmaster is reminded of the four duties: sort the post, pin replies, carry notes, and mind their own business where possible. Lost property is to be held at the desk and returned to its owner, where the owner can be established.\n\nThe postmaster may be found behind the desk of the post office, or in its porch, where the board is.' + (a.burnedBefore ? '\n\n(Board replaced. Previous board not recovered.)' : ''),
    sign: 'Cllr. D. Bright, Clerk',
    hint: (a) => a.loop ? 'You have read this before. You are sure of it.' : 'You have read this three times. It says what it says.',
  });

  add({
    id: 'l1_marion', day: 1, type: 'letter', from: 'marion', order: 1,
    plans: [{ at: 'shopflat', hour: 16, doing: 'tea; the kettle on, in case' }],
    subject: 'Welcome, from the shop',
    body: (a) => (a.loop ? 'Dear {{name}} — have we met? I feel we have met,' : 'Dear {{name}} (Postmaster, the notice says, but nobody here has ever said it out loud),') +
      '\n\nWelcome to Ashfield. I run the shop next door, so anything that comes into the village comes past my window first, unless it comes through your door, and then it comes past you, and I shall expect to be told. I don’t mind saying I noticed you the moment you got off the bus. You had the look of someone reading a map upside down. Don’t worry. There’s only one road.\n\nI won’t pretend the last one didn’t leave a hole. Harriet was here eleven years. But a hole is a thing you can put something in, and here you are.\n\nCome for tea. Four o’clock, above the shop. Or don’t, if you’re the quiet sort — I’ll find out soon enough which sort you are.',
    sign: 'M.',
    replies: [
      { text: 'The quiet sort, I think. But thank you.', effects: { trust: { marion: 1 }, flags: ['quiet'] }, outcome: 'She reads it at the counter and laughs, once, at nothing anyone else can see. “Quiet,” she tells the shop. “We’ll see.”' },
      { text: 'I would love the tea.', effects: { trust: { marion: 2 }, flags: ['tea'] }, plans: [{ at: 'shopflat', hour: 16, doing: 'tea, above the shop', with: 'you' }], outcome: 'A second note is pinned within the hour, in the same hand: “Four o’clock. Bring nothing. I mean it.”' },
      { text: 'I’m here to keep the board, not to be kept.', effects: { trust: { marion: -1 }, flags: ['brisk'] }, outcome: 'No answer comes. The shop bell rings twice in the afternoon, sharply, and both times it is nobody.' },
    ],
    onIgnore: { effects: { trust: { marion: -1 }, flags: ['marion_ignored'] }, outcome: 'You never answer. Marion notices. Marion notices everything.' },
  });

  add({
    id: 'l1_tom', day: 1, type: 'letter', from: 'tom', order: 2,
    plans: [{ at: 'millroad', hour: 19, doing: 'up the mill road, calling for the dog' }],
    subject: 'Dog',
    body: 'Postmaster. {{name}}, Marion says, so: {{name}}.\n\nDog’s gone. Bracken. Brown collie, white blaze, answers to his name and not much else. Last seen Sunday going up the mill road like he had business there.\n\nIf seen.',
    sign: 'T. Ferrier, Low Farm',
    replies: [
      { text: 'I’ll keep an eye out, Mr Ferrier.', effects: { trust: { tom: 1 }, flags: ['dog_eye'] }, outcome: 'Tom nods at you across the green the next morning. From Tom, that is a speech.' },
    ],
    pass: {
      marion: { effects: { trust: { marion: 1, tom: 1 }, flags: ['dog_marion'] }, outcome: 'Marion reads it and is on the telephone to three farms before you are back in the porch.' },
      wren: { effects: { trust: { wren: 1, tom: 1 }, flags: ['dog_wren'] }, outcome: 'Wren reads it, says “the mill, obviously,” and is gone up the road before you can say anything.' },
      penry: { effects: { flags: ['dog_rev'] }, outcome: 'The Reverend says he will mention it at Evensong. He does. Nobody at Evensong has a dog.' },
      '*': { effects: { flags: ['dog_other'] }, outcome: 'They read it, nod, and say they’ll keep an eye out. Everyone in Ashfield keeps an eye out. It is what the village is for.' },
    },
    onIgnore: { effects: { trust: { tom: -1 }, flags: ['dog_ignored'] }, outcome: 'You leave it. Tom takes it down himself on Wednesday, folds it small, and puts it in his coat.' },
  });

  add({
    id: 'r1_mill', day: 1, type: 'rumour', from: 'someone',
    body: (a) => a.loop ? 'Someone says the new postmaster looks familiar. Someone says they always do. Someone says that is not the comfort it sounds like.' : 'Someone says the light in the old mill was on again last night. Someone else says there’s no glass left in the windows to see a light through, so what would it be shining on.',
  });

  // ===================================================== DAY 2
  add({
    id: 'l2_marion_tea', day: 2, type: 'letter', from: 'marion',
    when: (a) => a.has('tea'),
    subject: 'After tea',
    body: 'Well, {{name}}, you’ll have met the cat now, and the cat has met you, which is more than the last two vicars managed.\n\nThere was a thing I meant to say and didn’t, because it sounds silly with a teapot in your hand. Harriet, who had the desk before you, used to say the board tells you what the village won’t. I thought it was a fanciful way of saying people write down what they can’t say to your face.\n\nI’m less sure now. She went up the mill road the week before she left. I only mention it.',
    sign: 'M.',
    replies: [
      { text: 'What did she mean, the board tells you?', effects: { trust: { marion: 1 }, flags: ['ask_harriet'] }, outcome: '“I don’t know, love,” she says, when you ask across the counter. “She wrote it on the back of the board. In pencil. It’s still there, if you take it off the wall, which you won’t, because it’s screwed.”' },
      { text: 'It’s just a board, Marion.', effects: { flags: ['just_board'] }, outcome: 'She agrees, warmly, in a way that means she does not.' },
    ],
    onIgnore: { effects: { trust: { marion: -1 } } },
  });

  add({
    id: 'l2_marion_quiet', day: 2, type: 'letter', from: 'marion',
    when: (a) => !a.has('tea'),
    subject: 'Quiet, then',
    body: (a) => (a.has('brisk') ? 'Not to be kept. Fair enough. I’ll keep the shop and you keep the board and we’ll see which of us the village listens to.\n\n' : a.has('marion_ignored') ? 'I expect you were busy. Everyone is, their first week, with nothing.\n\n' : 'Quiet is fine, {{name}}. Harriet was quiet.\n\n') +
      'She used to say the board tells you what the village won’t. I took it as a fanciful way of saying people write down what they can’t say to your face. I’m less sure now. She went up the mill road the week before she left. I only mention it.',
    sign: 'M.',
    replies: [
      { text: 'What did she mean, the board tells you?', effects: { trust: { marion: 1 }, flags: ['ask_harriet'] }, outcome: '“I don’t know,” she says, when you ask across the counter. “She wrote it on the back of the board. In pencil. It’s still there, if you take it off the wall, which you won’t, because it’s screwed.”' },
      { text: 'It’s just a board, Marion.', effects: { flags: ['just_board'] }, outcome: 'She agrees, warmly, in a way that means she does not.' },
    ],
    onIgnore: { effects: { trust: { marion: -1 } } },
  });

  add({
    id: 'l2_wren', day: 2, type: 'letter', from: 'wren',
    plans: [{ at: 'fox', hour: 12, doing: 'the lunchtime shift, watching the door for you' }],
    subject: '(folded twice, sealed with a bit of tape)',
    body: 'hi. new postmaster.\n\ncan you get this to dr okafor without marion reading it. it’s nothing bad. it’s about a reference.\n\ndon’t open it. or do, i can’t stop you, that’s kind of the point of you isn’t it.',
    sign: '- w',
    replies: [
      { text: 'Open it, read it, then carry it to Dr Okafor anyway.', effects: { trust: { wren: 0, sam: 1 }, flags: ['read_wren', 'wren_ref'] }, outcome: 'Inside: “Dr Okafor — I want to apply for the nursing course in the city. I need someone to say I’m sensible. Please don’t tell my mum. — Wren.”\n\nYou fold it back. It does not fold the way it did. You take it to the surgery. Sam does not ask why the tape is lifted. Wren will.' },
      { text: 'Pin it back with a note: I don’t carry secrets.', effects: { trust: { wren: -2 }, flags: ['wren_refused'] }, outcome: 'The note is gone by evening. The tape is still on the board, stuck to nothing.' },
    ],
    pass: {
      sam: { effects: { trust: { wren: 2, sam: 1 }, flags: ['wren_ref'] }, outcome: 'You put it into Sam’s hand at the surgery door, still sealed. Sam reads it in the doorway and says, quietly, “Good.”' },
      marion: { effects: { trust: { marion: 1, wren: -2 }, flags: ['betrayed_wren'] }, outcome: 'Marion reads it before you’ve let go of it. “Oh, the lamb,” she says. It is round the village by teatime.' },
      '*': { effects: { trust: { wren: -1 }, flags: ['wren_misdelivered'] }, outcome: 'They open it, frown, and hand it back. “This isn’t for me.” It reaches Sam eventually. Wren hears how.' },
    },
    onIgnore: { effects: { trust: { wren: -1 }, flags: ['wren_ignored'] }, outcome: 'It stays folded on the board for two days. Then it is gone. Not taken down. Gone.' },
  });

  add({
    id: 'l2_edith', day: 2, type: 'letter', from: 'edith',
    plans: [{ at: 'rose', hour: 9, doing: 'her window, watching the north corner' }],
    subject: 'On flowers, and the north corner',
    body: 'My dear {{name}} (Marion tells me that is your name, and Marion is never wrong about a name, only about what to do with one),\n\nForgive the length of this; I was taught that a letter should be at least as long as the walk to deliver it, and Rose Cottage is at the far end of the village.\n\nI am Edith Marlow, and I have lived in Ashfield for longer than anybody, which I say not as a boast but as a warning, because it means I remember everything and I am tired of it.\n\nHere is a small thing that has become a large one. In the north corner of the churchyard there is a grave with no stone. Every Thursday, for as long as I can recall, somebody has left fresh flowers on it. I have never seen who. I have sat at my window on Thursdays, and I have walked past at every hour, and there are always flowers and never a person.\n\nI should like to know who. I should like, before I am done, to know one thing about this village that I did not already know.\n\nWould you ask around? Gently. A postmaster can ask what a neighbour cannot.',
    sign: 'Edith Marlow (Mrs)',
    replies: [
      { text: 'I’ll ask around. Gently.', effects: { trust: { edith: 1 }, flags: ['flowers_ask'] }, outcome: 'You ask, gently. Nobody knows. Everyone knows the grave. Nobody knows whose it is. When you point out how strange that is, people agree, and then go on with their day.' },
      { text: 'Perhaps whoever it is would rather not be asked.', effects: { trust: { edith: 1 }, flags: ['flowers_private'] }, outcome: 'She writes back a single line: “That is a kind thought, and I have had it, and I would still like to know.”' },
    ],
    pass: {
      penry: { effects: { trust: { penry: 1 }, flags: ['flowers_rev'] }, outcome: 'The Reverend takes it, reads it in the porch, and folds it very small. “I will write to Mrs Marlow,” he says, and to you: “Thank you for bringing it to me first.”' },
      marion: { effects: { flags: ['flowers_marion'] }, outcome: 'Marion has three theories before you’ve finished the sentence, and by Thursday the whole village has them.' },
      tom: { effects: { trust: { tom: 1 }, flags: ['flowers_tom'] }, outcome: 'Tom reads it twice and gives it back. “Tell her it’s not me,” he says. “Tell her I know who it’s for, though. And I don’t.” Both things, he means. You can see him meaning both.' },
      '*': { outcome: 'They read it and say they’ve wondered the same thing. Everyone has wondered. Nobody has looked.' },
    },
    onIgnore: { effects: { trust: { edith: -1 } }, outcome: 'You leave it. Edith writes no reproach, which is worse.' },
  });

  add({
    id: 'n2_supper', day: 2, type: 'notice', from: 'penry',
    plans: [{ who: '*', day: 5, at: 'hall', hour: 19, doing: 'the Harvest Supper; a place set for those who cannot be with us', with: 'everyone' }],
    subject: 'HARVEST SUPPER',
    body: 'Saturday, 7 o’clock, the Village Hall.\n\nBring a dish, a bottle, or yourself. All welcome, all expected.\n\nA place will be set, as usual, for those who cannot be with us.',
    sign: 'A. Penry',
  });

  add({
    id: 'r2_dog', day: 2, type: 'rumour', from: 'someone',
    body: 'Someone says Bracken was seen by the mill race, dry as a bone, sitting like he was waiting for a bus. Nobody has gone up to look. Nobody goes up to look.',
  });

  // ===================================================== DAY 3
  add({
    id: 'l3_sam_thanks', day: 3, type: 'letter', from: 'sam',
    plans: [{ at: 'surgery', hour: 10, doing: 'writing the reference', with: 'wren' }],
    when: (a) => a.has('wren_ref'),
    subject: 'Thank you, and a question',
    body: (a) => 'Dear {{name}}, if I may,\n\nThank you for the discretion' + (a.has('read_wren') ? ' — such as it was; the tape was lifted, but you brought it, and that is what counts' : '') + '. Wren is more sensible than this village lets her be. I have written the reference. I have said she is sensible. It is true.\n\nA question in return, if I may. Mrs Vale, your predecessor, kept records of the board — copies of letters, I believe, going back years. Do you have access to them? I would like, for a reason I would rather explain in person, to compare some dates.',
    sign: 'Dr S. Okafor',
    replies: [
      { text: 'I’ll look behind the board. If there’s anything, you’ll know.', effects: { trust: { sam: 1 }, flags: ['look_records'] }, outcome: 'Sam writes back “Thank you” and nothing else, which from Sam is a great deal.' },
      { text: 'Mrs Vale’s papers are Mrs Vale’s business.', effects: { trust: { sam: -1 }, flags: ['sam_rebuffed'] }, outcome: '“Of course,” Sam writes. “I apologise for asking.” The apology is worse than an argument.' },
    ],
    onIgnore: { effects: { trust: { sam: -1 } } },
  });

  add({
    id: 'n3_sam_hours', day: 3, type: 'notice', from: 'sam',
    plans: [{ at: 'surgery', hour: 8.5, to: 11, doing: 'surgery; there is a form', with: 'you' }],
    when: (a) => !a.has('wren_ref'),
    subject: 'SURGERY HOURS',
    body: 'Tuesday and Thursday mornings, 8.30 to 11.\n\nNew patients are welcome. The new postmaster, {{name}}, is asked to call in; there is a form.',
    sign: 'Dr S. Okafor',
    replies: [
      { text: 'Call in and fill out the form.', effects: { trust: { sam: 1 }, flags: ['met_sam', 'look_records'] }, outcome: 'The form is two lines. The conversation is longer. Sam asks, carefully, whether the last postmaster kept records of the board, and whether you might look. You say you will.' },
      { text: 'Forms can wait.', effects: { flags: ['sam_skipped'] }, outcome: 'They can. They do.' },
    ],
  });

  add({
    id: 'l3_tom_home', day: 3, type: 'letter', from: 'tom',
    when: (a) => a.has('dog_marion') || a.has('dog_wren'),
    subject: 'Dog’s home',
    body: (a) => 'Bracken’s home. ' + (a.has('dog_wren') ? 'Hollis girl brought him down off the mill road by the collar. Wouldn’t say where she found him. Said I wouldn’t like it.' : 'Came in on his own after Marion’s lot had been shouting up and down the valley for an hour. Wet through and shaking.') + '\n\nThank you for whatever you did. He’s not right. Sits at the gate and looks up the road.',
    sign: 'T. Ferrier',
    replies: [
      { text: 'Glad he’s back.', effects: { trust: { tom: 1 }, flags: ['dog_home'] }, outcome: 'Tom pins nothing back. On Friday there is a bag of potatoes in the porch with no note. That is the reply.' },
      { text: 'What was he doing at the mill, do you think?', effects: { trust: { tom: 1 }, flags: ['dog_home', 'ask_mill'] }, outcome: '“Waiting,” Tom writes. That is the whole of it.' },
    ],
    onIgnore: { effects: { flags: ['dog_home'] } },
  });

  add({
    id: 'l3_tom_mill', day: 3, type: 'letter', from: 'tom',
    plans: [{ at: 'mill', hour: 21, doing: 'going up the mill with a lamp, not asking anyone' }],
    when: (a) => !a.has('dog_marion') && !a.has('dog_wren'),
    subject: 'No sign',
    body: 'No sign. Going up the mill myself tonight. Not asking anyone. Telling you, because someone should know where I’ve gone if I don’t come down.',
    sign: 'T. Ferrier',
    replies: [
      { text: 'Take a lamp. And take someone.', effects: { trust: { tom: 1 }, flags: ['tom_mill'] }, outcome: 'He takes a lamp.' },
      { text: 'Don’t go alone. I’ll come with you.', overnight: true, laterHint: 'You write back that you will come. He goes up at nine and it is not nine yet, and there is a whole day of other people’s post between you and the mill road.', effects: { trust: { tom: 2 }, flags: ['tom_mill', 'went_with_tom', 'saw_wall'] }, plans: [{ at: 'mill', hour: 21, doing: 'going up the mill with a lamp, and you', with: 'you' }], outcome: 'You go. The mill is dry inside, which it should not be; the roof is half gone. Bracken is in the corner by the wheel-pit, curled up, asleep, unharmed.\n\nOn the wall above him, cut into the stone, are names. Forty-odd. You read them by lamplight while Tom lifts the dog. One of them is his. Two of them are Keepers. Yours is not there.\n\nNeither of you says anything on the way down.' },
    ],
    pass: {
      marion: { effects: { trust: { marion: 1 }, flags: ['search', 'dog_home'] }, outcome: 'Marion organises a search party. Four people, two torches, no dog. Bracken comes home on his own at three in the morning, wet, and having been somewhere dry first.' },
      '*': { effects: { flags: ['tom_mill'] }, outcome: 'They say they’ll go with him. They don’t. He goes anyway.' },
    },
    onIgnore: { effects: { flags: ['tom_mill'] }, outcome: 'He goes. You did not say anything. He is not a man who needed you to.' },
  });

  add({
    id: 'l3_penry_flowers', day: 3, type: 'letter', from: 'penry',
    plans: [{ at: 'vestry', hour: 14, doing: 'writing to Mrs Marlow', with: 'edith' }],
    when: (a) => a.has('flowers_rev'),
    subject: 'The north corner',
    body: 'Dear {{name}},\n\nThank you for bringing Mrs Marlow’s letter to me rather than pinning it for the whole village to worry at.\n\nThe grave in the north corner has no stone because the family asked for none. That is all I am able to say, and I am aware that it is not very much. I would be grateful if the matter were left to rest, in every sense.\n\nI would be grateful too if any further letter you do not understand came to me first. There will be some.',
    sign: 'A. Penry',
    replies: [
      { text: 'Of course. I’ll let it rest.', effects: { trust: { penry: 2 }, flags: ['rev_promise'] }, outcome: 'The Reverend says nothing about it again. He looks, when he passes the porch, relieved, and then not.' },
      { text: 'Edith asked me. I’ll tell her you said so.', effects: { trust: { penry: -1, edith: 1 }, flags: ['told_edith_rev', 'independent'] }, outcome: 'Edith’s reply, next morning: “The family asked for none. What family, dear? I have been here longer than any family.”' },
    ],
    onIgnore: { effects: { trust: { penry: -1 } } },
  });

  add({
    id: 'l3_penry_welcome', day: 3, type: 'letter', from: 'penry',
    when: (a) => !a.has('flowers_rev'),
    subject: 'A welcome, and a request',
    body: 'Dear {{name}},\n\nWelcome to Ashfield, belatedly. Mrs Vale kept the post sorted and the board honest; I ask only the same of you, and I ask it knowing it is more than it sounds.\n\nOne request. Should any letter arrive that you do not understand — and there will be some — I would be glad if you brought it to me before passing it further. Not every note is meant for the whole village, and the board has a way of making things public that were only meant to be true.',
    sign: 'A. Penry',
    replies: [
      { text: 'Of course, Reverend.', effects: { trust: { penry: 1 }, flags: ['rev_promise'] }, outcome: 'He nods to you at the lychgate on Sunday. It is a nod with something behind it.' },
      { text: 'I’ll use my own judgement, I think.', effects: { flags: ['independent'] }, outcome: '“That is what postmasters do,” he writes back. “It is also what happened to the last one.” Then, underneath, smaller: “Forgive me. That was unkind.”' },
    ],
    onIgnore: { effects: { trust: { penry: -1 } } },
  });

  add({
    id: 'r3_flowers', day: 3, type: 'rumour', from: 'someone',
    body: (a) => a.has('flowers_marion')
      ? 'Someone says Marion thinks the flowers are from a man for a woman, and someone else says Marion thinks everything is. Someone says they saw Tom Ferrier’s van by the churchyard last Thursday. Someone says Tom’s wife has been dead six years and the flowers are nothing to do with anybody.'
      : 'Thursday again tomorrow. Someone says they saw Tom Ferrier’s van by the churchyard last Thursday. Someone says Tom’s wife has been dead six years and the flowers are nothing to do with anybody.',
  });

  // ===================================================== DAY 4
  add({
    id: 'a4_first', day: 4, type: 'ash', from: 'ash', order: 0,
    body: 'You are reading this in the porch with the door open.\n\nClose it. The wind takes things.',
    hint: 'There is no signature. There is a grey smear where one would be, and it comes off on your thumb.',
    replies: [
      { text: 'Who is this?', effects: { flags: ['ash_asked'] }, outcome: 'You pin it. You close the door. You are not sure, afterwards, which you did first.' },
      { text: 'Leave the board alone.', effects: { flags: ['ash_told'] }, outcome: 'You pin it. The pin goes in easily, as if the board were softer there.' },
    ],
    pass: {
      penry: { effects: { trust: { penry: 1 }, flags: ['ash_rev'] }, outcome: 'The Reverend reads it and puts it, without a word, into the vestry stove. He watches it burn. Then he says, “That will not help. It has never helped.”' },
      marion: { effects: { trust: { marion: 1 }, flags: ['ash_marion'] }, outcome: 'Marion holds it up to the light like a banknote. “Well,” she says. By evening the whole village knows there is a letter, and half of them have come to look at the board.' },
      sam: { effects: { flags: ['ash_sam'] }, outcome: 'Sam turns it over, smells it, and says, “Wood ash. Recent.” Then: “The mill hasn’t had a fire in forty years.”' },
      '*': { effects: { flags: ['ash_passed'] }, outcome: 'They hold it at arm’s length and give it straight back. “That’s not for you,” they say. “That’s for the Keeper.” You ask what the difference is. They have gone.' },
    },
    onIgnore: { effects: { flags: ['ash_ignored'] }, outcome: 'You leave it pinned. In the morning it is still there, and the paper is warm.' },
  });

  add({
    id: 'l4_marion_gossip', day: 4, type: 'letter', from: 'marion',
    subject: 'Not saying, just saying',
    body: (a) => 'You’ll have heard the mill talk by now' + (a.has('ash_marion') ? ', and now there’s the letter as well, which I’m sorry about, I couldn’t keep that one in' : '') + '. Harriet went up there the week before she left. I’m not saying. I’m just saying.\n\nA question. Did you find any of her letters behind the board? Only she used to tuck things down the back of the frame, and I wondered.\n\nI ask because she wrote to me. After she went. It was postmarked Ashfield.',
    sign: 'M.',
    replies: [
      { text: 'I haven’t looked. Should I?', effects: { trust: { marion: 1 }, flags: ['marion_look'] }, outcome: '“I would,” she says. “I would, and then I wouldn’t tell me what you found.”' },
      { text: 'What did she say, in the letter?', effects: { trust: { marion: 1 }, flags: ['marion_why'] }, outcome: 'Marion takes a moment. “She said she was well. She said the weather was the same. She said, tell the next one to close the door.”' },
      { text: 'What’s behind the board is post office business.', effects: { trust: { marion: -1 }, flags: ['marion_shut'] }, outcome: 'Marion does not reply. The shop is out of the biscuits you like for a week.' },
    ],
    onIgnore: { effects: { trust: { marion: -1 } } },
  });

  add({
    id: 'l4_wren_yes', day: 4, type: 'letter', from: 'wren',
    when: (a) => a.has('wren_ref') && !a.has('betrayed_wren'),
    subject: 'he said yes',
    body: (a) => 'he said yes. he said yes!!\n\n' + (a.has('read_wren') ? 'you opened it. i know because the tape’s wrong. it’s fine. you took it anyway. that’s the bit i’m keeping.\n\n' : '') + 'thank you. i owe you. do you want anything from the city when i go. i’m going to go. i’m actually going to go.',
    sign: '- w',
    replies: [
      { text: 'Something from the city? Surprise me.', effects: { trust: { wren: 1 } }, outcome: '“ok,” she writes. “it’ll be something stupid.”' },
      { text: 'Just come back and tell me what it was like.', effects: { trust: { wren: 1 }, flags: ['wren_comeback'] }, outcome: 'She doesn’t write back to that one. She comes to the porch instead and stands there for a bit and says “ok” and goes.' },
    ],
    onIgnore: { effects: { trust: { wren: -1 } } },
  });

  add({
    id: 'l4_wren_betrayed', day: 4, type: 'letter', from: 'wren',
    when: (a) => a.has('betrayed_wren'),
    subject: 'thanks for that',
    body: 'marion asked me about the course at the shop. in front of my mum.\n\nthanks for that.\n\ni’m not even angry. i’m just going to be more careful about which bits of paper i trust.',
    sign: '- w',
    replies: [
      { text: 'I’m sorry. I thought she would help.', effects: { trust: { wren: 1 } }, outcome: '“she did help,” Wren writes. “that’s the worst part. mum cried and then said go.”' },
      { text: 'It’s a small village. It was always going to get out.', effects: { trust: { wren: -1 }, flags: ['wren_cold'] }, outcome: 'No reply. When you pass the Fox that night she is pulling a pint and does not look up.' },
    ],
    onIgnore: { effects: { trust: { wren: -1 } } },
  });

  add({
    id: 'l4_wren_refused', day: 4, type: 'letter', from: 'wren',
    when: (a) => !a.has('wren_ref') && !a.has('betrayed_wren'),
    subject: 'ok',
    body: (a) => (a.has('wren_misdelivered') ? 'it got there. eventually. by way of half the village.\n\n' : 'ok. never mind. forget it.\n\n') + 'harriet would have carried it. i’m not saying that to be horrible. i’m saying it because it’s true and there’s nobody else to say it to.',
    sign: '- w',
    replies: [
      { text: 'I was wrong. Give it to me and I’ll carry it.', when: (a) => !a.has('wren_misdelivered'), effects: { trust: { wren: 2, sam: 1 }, flags: ['wren_ref'] }, outcome: 'She brings it. You carry it. Sam reads it in the doorway and says, quietly, “Good.”' },
      { text: 'Harriet isn’t here.', effects: { trust: { wren: -1 }, flags: ['wren_cold'] }, outcome: '“no,” she writes. “she isn’t.”' },
    ],
    onIgnore: { effects: { trust: { wren: -1 } } },
  });

  add({
    id: 'n4_thimble', day: 4, type: 'notice', from: 'edith',
    subject: 'LOST',
    body: 'A silver thimble, worn at the rim, my mother’s. Lost somewhere between Rose Cottage and the board. Of no value to anyone but me, which is the only kind of value there is.',
    sign: 'E. Marlow',
  });

  add({
    id: 'r4_vestry', day: 4, type: 'rumour', from: 'someone',
    body: 'Someone says the Reverend has been in the vestry every night this week with the lamp on. Someone says he’s rebinding the register. Someone says he’s reading it, and you don’t need a lamp all night to read a book you already know.',
  });

  // ===================================================== DAY 5
  add({
    id: 'l5_marion_chairs', day: 5, type: 'letter', from: 'marion',
    subject: 'The supper',
    body: 'Well. The supper.\n\nYou’ll have noticed the empty chair with the place set. That’s for Harriet. Aldous does it every year for whoever’s gone, and the village thinks it’s a lovely gesture, and it is.\n\nThere were three chairs last year. I counted. Nobody else counts. I don’t know why I do.',
    sign: 'M.',
    replies: [
      { text: 'Who were the other two?', effects: { trust: { marion: 1 }, flags: ['ask_chairs'] }, outcome: '“Dunstan,” she says, “who kept the board before Harriet. And I don’t remember the third. I remember that I don’t. That’s not the same as forgetting, love. Forgetting is restful.”' },
      { text: 'It’s a kind thing for him to do.', effects: { trust: { marion: 1 } }, outcome: '“It is,” she agrees. “I wish he’d stop.”' },
      { text: 'I’d rather not talk about whoever had the desk before me.', effects: { trust: { marion: -1 } }, outcome: '“No,” she writes. “Neither would she.”' },
    ],
    onIgnore: { effects: { trust: { marion: -1 } } },
  });

  add({
    id: 'l5_sam_bundle', day: 5, type: 'letter', from: 'sam',
    plans: [{ at: 'surgery', hour: 9, doing: 'the surgery; the top drawer, with the bundle in it' }],
    when: (a) => a.has('look_records'),
    subject: 'Two things',
    body: '{{name}},\n\nTwo things, and I will be brief with both because neither is brief.\n\nOne. I looked behind the board myself, since you offered and since I could not sleep. Down the back of the frame there is a bundle of letters tied with string. I did not open it. It is the Keeper’s. It is in the top drawer at the surgery, for you.\n\nTwo. I have now met four patients whose dates of birth in the parish register precede the dates on their medical cards by exactly forty-one years. Not roughly. Exactly. I asked the Reverend. He asked me to leave it.\n\nI am telling you because I have to tell someone, and because you are the one who decides what gets passed on. I would rather this did not.',
    sign: 'Dr S. Okafor',
    replies: [
      { text: 'Show me the register.', overnight: true, laterHint: 'Eight o’clock, at a locked church, with a key nobody has explained. That is tonight. This is still the morning.', effects: { trust: { sam: 1 }, flags: ['sam_register'] }, plans: [{ at: 'church', hour: 20, doing: 'the church, by a key Sam does not explain', with: 'you' }], outcome: 'Sam shows you. The church is locked; Sam has a key, and does not say how. The names are in different inks and the same hand. Forty-one names, three times over. You close it before you find yours. You are not sure whether that was courage.' },
      { text: 'Leave it, like the Reverend said.', effects: { trust: { sam: -1 }, flags: ['sam_leave'] }, outcome: '“Very well.” Two words. Sam leaves it for four days.' },
    ],
    pass: {
      penry: { effects: { trust: { penry: 1, sam: -2 }, flags: ['sam_exposed'] }, outcome: 'The Reverend reads it slowly. “Thank you,” he says. “I wish you had not needed to.” Sam finds out by Sunday. Sam does not pin anything for a while.' },
      edith: { effects: { trust: { edith: 1, sam: 1 }, flags: ['edith_knows_sam'] }, outcome: 'Edith reads it at her window. “Forty-one,” she says. “Yes. I thought it might be a number like that.”' },
      marion: { effects: { trust: { marion: -1 }, flags: ['marion_knows_sam'] }, outcome: 'Marion reads it and goes quiet, which you have never seen. “My name’s in that register,” she says. “Isn’t it.”' },
      '*': { outcome: 'They hand it back unread. “The doctor’s business is the doctor’s.”' },
    },
    onIgnore: { effects: { trust: { sam: -1 } }, outcome: 'It sits on the board. Sam sees it sitting there every morning on the way to the surgery.' },
  });

  add({
    id: 'l5_sam_waiting', day: 5, type: 'letter', from: 'sam',
    when: (a) => !a.has('look_records'),
    subject: 'It can wait',
    body: '{{name}},\n\nI would still like to speak with you about the parish register. I have found something in it I cannot account for. It can wait. It has waited forty-one years, apparently.',
    sign: 'Dr S. Okafor',
    replies: [
      { text: 'Come and tell me. Today.', effects: { trust: { sam: 1 }, flags: ['sam_register'] }, plans: [{ at: 'porch', hour: 11, doing: 'coming to the porch', with: 'you' }], outcome: 'Sam comes. Four patients whose register birth dates are exactly forty-one years before their medical cards. Then the register itself, in the locked church, by a key Sam does not explain. Forty-one names, three times over, in the same hand. You close it before you find yours.' },
      { text: 'Then let it keep waiting.', effects: { trust: { sam: -1 }, flags: ['sam_leave'] }, outcome: '“Very well.”' },
    ],
    onIgnore: { effects: { trust: { sam: -1 } } },
  });

  add({
    id: 'l5_tom_found', day: 5, type: 'letter', from: 'tom',
    plans: [{ at: 'lowfarm', hour: 15, doing: 'Low Farm, waiting to see if you come', with: 'you' }],
    when: (a) => a.has('tom_mill') && !a.has('went_with_tom') && !a.has('search'),
    subject: 'Found him',
    body: 'Went up the mill. Found Bracken. Found something else.\n\nNot for the board. Come to Low Farm if you want to know. Come today, I’m not sure I’ll want to say it tomorrow.',
    sign: 'T. Ferrier',
    replies: [
      { text: 'I’ll come to Low Farm.', effects: { trust: { tom: 2 }, flags: ['visit_tom', 'saw_wall'] }, outcome: 'He walks you back up to the mill himself, in daylight. It is dry inside, which it should not be. On the wall above the wheel-pit are names cut into the stone. Forty-odd. His is there. Two Keepers are there. Yours is not.\n\n“I’m not a clever man,” he says on the way down. “Tell me what it means.”' },
      { text: 'Tell me here, on the board.', effects: { trust: { tom: -1 } }, outcome: '“No.” That is the whole of the next note.' },
    ],
    onIgnore: { effects: { trust: { tom: -1 } }, outcome: 'You do not go. He does not ask again.' },
  });

  add({
    id: 'l5_tom_wall', day: 5, type: 'letter', from: 'tom',
    when: (a) => a.has('went_with_tom'),
    subject: 'The wall',
    body: 'You saw it same as I did. Don’t tell me what it means, I’ll not sleep.\n\nTell me one thing. When you looked — was yours on it? I looked for mine and I found it and I stopped looking.',
    sign: 'T. Ferrier',
    replies: [
      { text: 'It wasn’t. Not yet.', effects: { trust: { tom: 1 }, flags: ['told_tom_notyet'] }, outcome: '“Not yet,” he writes back. He has underlined “yet”. Then, underneath, “Aye.”' },
      { text: 'I didn’t look for it.', effects: { trust: { tom: 1 } }, outcome: '“Wise,” he writes. It is the longest compliment you will get from him.' },
    ],
    onIgnore: { effects: { trust: { tom: -1 } } },
  });

  add({
    id: 'l5_tom_howls', day: 5, type: 'letter', from: 'tom',
    plans: [{ at: 'gate', hour: 18, doing: 'the gate, with Bracken tied, and the howling' }],
    when: (a) => a.has('dog_home') && !a.has('went_with_tom'),
    subject: 'Bracken',
    body: 'Bracken keeps going back up there. Tied him. He howls at the mill. Never did before. Eleven years and he never howled at anything.\n\nWhat do I do.',
    sign: 'T. Ferrier',
    replies: [
      { text: 'Untie him. See where he goes.', effects: { trust: { tom: 1 }, flags: ['let_dog'] }, outcome: 'He unties him. Bracken goes straight up the mill road and lies down in the doorway and does not go in. Tom sits with him till dark.' },
      { text: 'Keep him tied. Keep him home.', effects: { flags: ['dog_tied'] }, outcome: '“Aye.” The howling goes on. You can hear it from the porch.' },
    ],
    onIgnore: { effects: { trust: { tom: -1 } } },
  });

  add({
    id: 'a5_second', day: 5, type: 'ash', from: 'ash', order: 0,
    body: (a) => {
      if (a.has('ash_asked')) return 'You asked who. Wrong question.\n\nAsk when.';
      if (a.has('ash_told')) return 'Leave the board alone, you said. I am the board, or I am behind it, or the difference has stopped mattering.\n\nI cannot leave it alone. I have tried.';
      if (a.has('ash_rev')) return 'You gave me to the Reverend. He put me in the stove. I am still here.\n\nThink about that before you give me to anyone else.';
      if (a.has('ash_marion')) return 'You gave me to Marion. Now the whole village knows there is a letter, and half of them have come to look at the board.\n\nGood. Let them look at it. Let them wonder why it is warm.';
      if (a.has('ash_sam')) return 'The doctor is right about the ash. The mill has not had a fire in forty years.\n\nThe doctor is right about a great many things and it will not help.';
      return 'You left me pinned. That is fine. I am patient.\n\nI have been patient for a very long time and I would like to stop.';
    },
    replies: [
      { text: 'When, then?', effects: { flags: ['ash_when'] }, outcome: 'Nothing is pinned in reply. But the paper of your own note, next morning, has a grey thumbprint on it that is not yours.' },
      { text: 'I don’t want to know.', effects: { flags: ['ash_refuse'] }, outcome: 'You pin it. Beneath it, by morning, in the same ashy hand: “Nobody does. I didn’t.”' },
    ],
    pass: {
      penry: { effects: { flags: ['ash_rev2'] }, outcome: 'The Reverend does not burn this one. He puts it inside the register, and closes the register, and puts both hands flat on the cover.' },
      '*': { effects: { flags: ['ash_passed2'] }, outcome: 'They give it straight back. Everyone in Ashfield knows which letters are the Keeper’s.' },
    },
    onIgnore: { effects: { flags: ['ash_ignored2'] }, outcome: 'You leave it. It is warmer than the first.' },
  });

  add({
    id: 'r5_thimble', day: 5, type: 'rumour', from: 'someone',
    body: 'Someone says Edith’s thimble turned up on the board this morning, pinned, with no note. Someone says the pin went in from behind. Someone says a pin can’t go in from behind, and then went and looked, and didn’t say anything after.',
  });

  // ===================================================== DAY 6
  add({
    id: 'l6_edith', day: 6, type: 'letter', from: 'edith',
    subject: 'Harriet, and the size of things',
    body: (a) => 'My dear {{name}},\n\nThank you for the thimble' + (a.has('flowers_ask') || a.has('flowers_private') ? ', and for asking after the flowers. I did not expect an answer. I expected the asking, and you did it, and that is what the post office is for.' : '.') + '\n\nI want to tell you about Harriet, since nobody else will.\n\nShe had the desk for eleven years, and before her a man called Dunstan, and before him I do not remember, which is strange, because I remember everything. I remember the price of bread in 1961. I remember the Reverend as a boy, though he is not much younger than I am, which is another thing I have stopped examining.\n\nThe week before she went, Harriet asked me whether I had ever noticed that the village never gets any bigger. I said that was the charm of the place. She said: no, Edith. I mean it never gets any bigger. Nobody is born here. Nobody moves in. People go, and the number stays the same, and nobody counts.\n\nI have started counting. There are forty-one of us, dear. Not including you.',
    sign: 'Edith Marlow (Mrs)',
    replies: [
      { text: 'Does it? Get bigger, I mean. Has anyone ever been born here?', effects: { trust: { edith: 1 }, flags: ['edith_loop'] }, outcome: 'She writes back, in a smaller hand than usual: “I was. I think. I remember a mother. I do not remember her face, and I remember everyone’s face.”' },
      { text: 'She sounds as if she was unwell, Edith.', effects: { trust: { edith: -1 }, flags: ['edith_dismissed'] }, outcome: '“Perhaps,” Edith writes. “Perhaps I am. It would be a comfort.”' },
    ],
    pass: {
      sam: { effects: { trust: { sam: 1 }, flags: ['sam_edith'] }, outcome: 'Sam reads it twice. “Forty-one,” Sam says. “She counted forty-one.” Then, to nobody: “That’s the number of years, too.”' },
      penry: { effects: { trust: { penry: 1 }, flags: ['rev_edith'] }, outcome: 'The Reverend reads it and says, “Edith has always been sharper than the rest of us,” and does not give it back.' },
      '*': { outcome: 'They read it and hand it back and say Edith is a marvel for her age.' },
    },
    onIgnore: { effects: { trust: { edith: -1 } } },
  });

  add({
    id: 'l6_wren_box', day: 6, type: 'letter', from: 'wren',
    plans: [{ at: 'cellar', hour: 15, doing: 'the cellar, behind the barrels, with matches' }],
    subject: 'found something',
    body: (a) => 'found something in the pub cellar. behind the barrels, where nobody goes.\n\na box of old board letters. like hundreds. some of them are to harriet. some are to a keeper called dunstan.\n\nsome of them are addressed to a keeper called wren.\n\nthat’s not funny. i’ve never been keeper. ' + (a.trust('wren') < 0 ? 'i don’t even like you and i’m telling you because there’s nobody else.' : 'come and look or i’ll burn them, i mean it.'),
    sign: '- w',
    replies: [
      { text: 'Don’t burn them. I’ll come and look.', overnight: true, laterHint: 'You have said you will go down to the cellar this afternoon. Until then the box is hers, and warm, and waiting.', effects: { trust: { wren: 1 }, flags: ['wren_box'] }, plans: [{ at: 'cellar', hour: 15, doing: 'the cellar, showing you the box', with: 'you' }], outcome: 'You go down. The cellar is dry and the box is warm. Hundreds of letters, in a dozen hands, all of them to Keepers. You do not take any. You are not sure they would let you.' },
      { text: 'Burn them. Some things are better as ash.', effects: { trust: { wren: -1 }, flags: ['burned_box'] }, outcome: 'She burns them in the pub yard. The smoke goes straight up. The next morning there is a grey thumbprint on the board.' },
    ],
    pass: {
      penry: { effects: { trust: { penry: 1, wren: -2 }, flags: ['rev_box'] }, outcome: 'The Reverend goes to the Fox himself and takes the box away in his arms. Wren watches him go. “ok,” she says to you, in a voice that is not ok.' },
      '*': { effects: { flags: ['wren_box'] }, outcome: 'They go and look. They come back pale and say it’s just old paper. Wren tells you later that they only looked at the top one.' },
    },
    onIgnore: { effects: { trust: { wren: -1 }, flags: ['wren_box'] }, outcome: 'She doesn’t burn them. She reads them instead, on her own, all night.' },
  });

  add({
    id: 'l6_penry_exposed', day: 6, type: 'letter', from: 'penry',
    when: (a) => a.has('sam_exposed'),
    subject: 'The register',
    body: 'Dear {{name}},\n\nDr Okafor’s letter has reached me by your hand. I thank you for your loyalty, though I wish you had not needed to show it.\n\nThe register is a record of a parish. It is not a record of the truth. Those are different books, and only one of them is in my keeping.\n\nPlease pin nothing further on this subject. I ask it for the doctor’s sake as much as anyone’s.',
    sign: 'A. Penry',
    replies: [
      { text: 'I’ll pin nothing further.', effects: { trust: { penry: 1 }, flags: ['rev_silence'] }, outcome: 'He nods at the lychgate. He looks older than he did on Monday, which is not possible, and is true.' },
      { text: 'Then tell me what the register is a record of.', effects: { flags: ['pressed_rev'] }, outcome: '“Of who has been here,” he writes. “And how many times.”' },
    ],
    onIgnore: { effects: { trust: { penry: -1 } } },
  });

  add({
    id: 'n6_church_locked', day: 6, type: 'notice', from: 'penry',
    when: (a) => !a.has('sam_exposed'),
    subject: 'ST ANNE’S',
    body: 'The church will be locked after Evensong until further notice. Keys with the Reverend.\n\nThe register may be consulted by appointment. Appointments are not currently being made.',
    sign: 'A. Penry',
  });

  add({
    id: 'l6_marion_knows', day: 6, type: 'letter', from: 'marion',
    when: (a) => a.has('marion_knows_sam'),
    subject: 'My name',
    body: 'I’ve not slept. You put a letter in my hand with my name in it three times and I’d like to know what you thought I’d do with that.\n\nI’m not angry with Sam. Sam’s a doctor; doctors count. I’m angry with you, because you’re the one who’s meant to decide what gets carried. Harriet wouldn’t have.\n\nAnd then I think: Harriet didn’t, and look where she is.',
    sign: 'M.',
    replies: [
      { text: 'I thought you would rather know.', effects: { trust: { marion: 1 } }, outcome: '“I would,” she says. “I do. I just wanted to be angry at somebody first.”' },
      { text: 'I shouldn’t have. I’m sorry.', effects: { trust: { marion: 1 } }, outcome: '“No,” she writes. “You should have. Don’t be sorry for the right things.”' },
    ],
    onIgnore: { effects: { trust: { marion: -2 } } },
  });

  add({
    id: 'r6_grave', day: 6, type: 'rumour', from: 'someone',
    body: 'Nobody can remember the name of the family at the north-corner grave. Not even Edith. Especially not Edith, someone says, and then says sorry, and doesn’t know why.',
  });

  // ===================================================== DAY 7
  add({
    id: 'l7_tom_visit', day: 7, type: 'letter', from: 'tom',
    plans: [{ at: 'mill', hour: 20, doing: 'up the mill again, looking at the fresh space' }],
    when: (a) => a.has('saw_wall'),
    subject: 'Tell me',
    body: 'You saw the wall. Forty-odd names, and mine, and two Keepers, and not you.\n\nI’ve been up again. There’s a space under Harriet’s. Fresh cut. Nothing in it. Yet.\n\nI’m not a clever man. Tell me what it means.',
    sign: 'T. Ferrier',
    replies: [
      { text: 'It means you’re safe, Tom. Your name’s already there.', effects: { trust: { tom: 1 }, flags: ['tom_comforted'] }, outcome: '“Safe,” he writes back. “Aye. That’s one word for it.”' },
      { text: 'I don’t know yet. I’ll tell you when I do.', effects: { trust: { tom: 2 }, flags: ['tom_honest'] }, outcome: '“Good,” he writes. “Don’t know is honest. Harriet said she knew.”' },
      { text: 'Don’t go back up there.', effects: { trust: { tom: 1 }, flags: ['tom_warned'] }, outcome: '“Can’t promise,” he writes. “Dog goes. I go with the dog.”' },
    ],
    onIgnore: { effects: { trust: { tom: -1 } } },
  });

  add({
    id: 'l7_tom_dog', day: 7, type: 'letter', from: 'tom',
    when: (a) => !a.has('saw_wall'),
    subject: 'Bracken',
    body: (a) => (a.has('dog_tied') ? 'Untied Bracken. Couldn’t stand the noise. ' : 'Bracken’s gone quiet. ') + 'He went up the mill and lay in the doorway and came back down calm. Whatever’s in there, it’s done with him.\n\nNot sure it’s done with me. Found my name cut in the wall. Under a lot of others. Didn’t cut it myself.',
    sign: 'T. Ferrier',
    replies: [
      { text: 'It’s done with you too, Tom.', effects: { trust: { tom: 1 }, flags: ['tom_comforted', 'saw_wall'] }, outcome: '“You don’t know that,” he writes. Then, “Thank you for saying it.”' },
      { text: 'Stay away from the mill.', effects: { trust: { tom: 1 }, flags: ['tom_warned', 'saw_wall'] }, outcome: '“Can’t promise. Dog goes, I go.”' },
    ],
    onIgnore: { effects: { trust: { tom: -1 }, flags: ['saw_wall'] } },
  });

  add({
    id: 'l7_sam_names', day: 7, type: 'letter', from: 'sam',
    when: (a) => a.has('sam_register'),
    subject: 'The names',
    body: '{{name}},\n\nI copied the page. I’ll put it in plain words because I have run out of any other kind.\n\nThe same forty-one names. Born, married, buried, and then born again, in the same hand, forty-one years apart. Marion Tebbutt: born 1912, 1953, 1994. I checked her card. She is fifty-one. She has been fifty-one, by the register, three times.\n\nThere are two other names, in a different column. Dunstan. Vale. The column is headed “Keepers”, and there is a third line, and it is blank, and the ink beside it is wet.\n\nI don’t know what to do with this. I am asking you what to do with this.',
    sign: 'Dr S. Okafor',
    replies: [
      { text: 'Show Marion. It’s her name.', effects: { flags: ['marion_shown'] }, outcome: 'Sam shows her. Marion reads it standing at the counter, and then she sits down on the floor behind it, which Sam has to tell you, because nobody else saw.' },
      { text: 'Show no one. Not yet.', effects: { trust: { sam: 1 }, flags: ['sam_quiet'] }, outcome: '“Not yet,” Sam repeats. “That is what everyone here says. I am starting to hear what it means.”' },
    ],
    pass: {
      edith: { effects: { trust: { edith: 1 }, flags: ['edith_names'] }, outcome: 'Edith reads the page and runs her finger down it and stops at her own name. “Three times,” she says. “I had hoped it was only twice.”' },
      penry: { effects: { trust: { penry: 1, sam: -1 }, flags: ['rev_names'] }, outcome: 'The Reverend takes the page and does not give it back. “The third line,” he says. “Is it still blank?” You say yes. He closes his eyes.' },
      '*': { outcome: 'They will not take it. They hold their hands behind their backs like children.' },
    },
    onIgnore: { effects: { trust: { sam: -1 } } },
  });

  add({
    id: 'l7_sam_left', day: 7, type: 'letter', from: 'sam',
    plans: [{ at: 'road', hour: 14, doing: 'going for a drive' }],
    when: (a) => !a.has('sam_register'),
    subject: 'For the record',
    body: '{{name}},\n\nI have done as asked and left the matter of the register. I want it on the board that I left it. I want it written down somewhere that a person in this village saw something and was told not to look, and didn’t.\n\nThat is all. I am going for a drive.',
    sign: 'Dr S. Okafor',
    replies: [
      { text: 'Noted. It’s on the board.', effects: { trust: { sam: 1 } }, outcome: 'Sam nods to you from the car. The car goes up the mill road. Later, the car comes down the mill road.' },
      { text: 'I’ve changed my mind. Show me.', effects: { trust: { sam: 2 }, flags: ['sam_register', 'sam_late'] }, outcome: 'Sam shows you, in the locked church, by a key Sam does not explain. Forty-one names, three times over. A column headed “Keepers”: Dunstan, Vale, and a blank third line with wet ink beside it.' },
    ],
    onIgnore: { effects: { trust: { sam: -1 } } },
  });

  add({
    id: 'a7_halfway', day: 7, type: 'ash', from: 'ash', order: 0,
    body: 'Halfway. You are halfway.\n\nThe last one got this far and then she stopped ignoring me. That was her mistake. Or it was her choice. I can’t tell the difference from in here.',
    replies: [
      { text: 'What was her mistake?', effects: { flags: ['ash_mistake'] }, outcome: 'By morning, underneath, in ash: “She read the third book.”' },
      { text: 'I’m not her.', effects: { flags: ['ash_not_her'] }, outcome: 'By morning, underneath, in ash: “No. She was not her either, at this point.”' },
    ],
    pass: {
      '*': { outcome: 'Nobody will take it. Not now. They can see it is the Keeper’s.' },
    },
    onIgnore: { effects: { flags: ['ash_ignored3'] }, outcome: 'You leave it. Under it, by morning: “Good. Keep doing that. I mean it.”' },
  });

  add({
    id: 'l7_marion_light', day: 7, type: 'letter', from: 'marion',
    subject: 'The light',
    body: 'Something’s off with the light. You’ll have noticed the evenings are the same length as last week. And the week before. It’s October. They should be drawing in.\n\nHave you kept a diary? Harriet did. Try it. Write down what day it is. Then look tomorrow and see if you agree with yourself.',
    sign: 'M.',
    replies: [
      { text: 'I’ll start a diary tonight.', effects: { trust: { marion: 1 }, flags: ['diary'] }, outcome: 'You write “Sunday” at the top of a page. You look at it in the morning.' },
      { text: 'The evenings are fine, Marion.', effects: { flags: ['dismissed_light'] }, outcome: '“Are they,” she writes. Not a question.' },
    ],
    onIgnore: { effects: { trust: { marion: -1 } } },
  });

  add({
    id: 'l7_wren_read', day: 7, type: 'letter', from: 'wren',
    when: (a) => a.has('wren_box'),
    subject: 'i read them',
    body: 'ok i read them. the letters to keeper wren.\n\nthey’re from a keeper. not to. from. they say things like “i’m sorry i couldn’t get you out” and “next time i’ll answer sooner” and “it was the right choice, it was, it was”.\n\nwhat does out mean. what does next time mean.\n\none of them’s signed with your name.',
    sign: '- w',
    replies: [
      { text: 'I don’t know what “out” means. I haven’t written to you.', effects: { trust: { wren: 1 } }, outcome: '“not yet,” she writes. Then: “i hate that i know what that means now.”' },
      { text: 'I’ll find out. I promise.', effects: { trust: { wren: 2 }, flags: ['promise_wren'] }, outcome: '“ok,” she writes. “the last one promised too. it’s in the box.”' },
    ],
    onIgnore: { effects: { trust: { wren: -1 } } },
  });

  add({
    id: 'l7_wren_burned', day: 7, type: 'letter', from: 'wren',
    when: (a) => a.has('burned_box') || a.has('rev_box'),
    subject: (a) => a.has('rev_box') ? 'he took them' : 'burned the box',
    body: (a) => a.has('rev_box')
      ? 'the reverend took the box. carried it up the street like a baby.\n\nthere’s another one behind the barrels. there’s always another one. i’m not telling him about that one.\n\nsome of them are signed with your name.'
      : 'burned the box. felt better for about an hour.\n\nthen i went back down and there was another box. same place. same letters. one of them was signed with your name and it was dated tomorrow.',
    sign: '- w',
    replies: [
      { text: 'Leave that one where it is.', effects: { flags: ['wren_left_box'] }, outcome: '“ok. it’s not going anywhere. that’s sort of the problem.”' },
      { text: 'Bring it to me.', effects: { trust: { wren: 1 }, flags: ['wren_box'] }, outcome: 'She brings it. The box is warm. You read three and stop.' },
    ],
    onIgnore: { effects: { trust: { wren: -1 } } },
  });

  add({
    id: 'r7_warm', day: 7, type: 'rumour', from: 'someone',
    body: 'Someone says the board was warm to the touch this morning, like a window with sun on it. There was no sun. Someone says it’s been warm all week and they didn’t like to say.',
  });

  // ===================================================== DAY 8 — the letters start noticing
  add({
    id: 'l8_wren_aware', day: 8, type: 'letter', from: 'wren', order: 0,
    subject: 'keeper. no.',
    body: (a) => {
      const late = a.hour >= 22 || a.hour < 5;
      const early = a.hour >= 5 && a.hour < 9;
      let s = 'keeper. no. not keeper. you.\n\nthe one holding the — what is it. i can’t see it. i can see the shape of the light on your face. ';
      s += late ? 'it’s late where you are. after ten. you should be asleep and instead you’re reading a letter from a girl who pulls pints in a village that isn’t anywhere.' : early ? 'it’s early where you are. you’ve not had breakfast. i can tell from how fast you read.' : 'it’s daytime where you are, i think. it’s always thursday here. is it thursday there? it’s ' + a.weekday.toLowerCase() + ', isn’t it. see, i can do that now.';
      s += '\n\nyou typed a name at the start. {{name}}. is that your real name or one you made up for us? don’t answer that. i don’t think i’d like either answer.';
      if (a.ignoredCount > 0) s += '\n\nyou’ve left ' + a.ignoredCount + (a.ignoredCount === 1 ? ' letter' : ' letters') + ' on the board without answering. i can hear them. they’re under the others. they’re still asking.';
      if (a.visits > 2) s += '\n\nyou’ve opened the board ' + a.visits + ' times. i counted. edith would be proud.';
      s += '\n\ni don’t know what i am. i know what you are. you’re the one who can put me down.';
      return s;
    },
    sign: '- w',
    replies: [
      { text: 'It’s my real name.', effects: { trust: { wren: 1 }, flags: ['wren_aware', 'name_real'] }, outcome: '“ok,” she writes. “ok. then i’m going to use it. {{name}}. that’s a real person’s name, and a real person is reading this, and i’m going to hold onto that.”' },
      { text: 'I made it up.', effects: { trust: { wren: 1 }, flags: ['wren_aware', 'name_made'] }, outcome: '“ok,” she writes. “then we’ve both got made-up names. that’s something. that’s nearly a friendship.”' },
      { text: 'I don’t understand you, Wren.', effects: { trust: { wren: -1 }, flags: ['wren_aware', 'wren_confused'] }, outcome: '“yes you do,” she writes. “you’re just hoping you don’t.”' },
    ],
    onIgnore: { effects: { trust: { wren: -1 }, flags: ['wren_aware', 'wren_aware_ignored'] }, outcome: 'You leave it. It does not yellow. It stays exactly as white as it was, all day, as if it were waiting.' },
  });

  add({
    id: 'l8_penry_confess', day: 8, type: 'letter', from: 'penry',
    plans: [{ at: 'vestry', hour: 17, doing: 'the vestry, waiting, with the book', with: 'you' }],
    when: (a) => a.trust('penry') >= 2,
    subject: 'I have not been honest',
    body: 'Dear {{name}},\n\nI have not been honest with you, or Dr Okafor, or Mrs Marlow, or, I think, myself.\n\nThere is a third book. Not the register; the register is only a record of the second. The third book is what the register is a copy of, and I keep it in the vestry, and every Keeper eventually reads it, and every Keeper who reads it goes behind the board. I have watched it happen four times. Dunstan. Vale. Two whose names I set a chair for and cannot now say.\n\nCome to the vestry. Bring nothing. I will show you where it is kept, and I will ask you, on my knees if that helps, not to open it.',
    sign: 'A. Penry',
    replies: [
      { text: 'I’ll come. I’ll bring nothing.', effects: { trust: { penry: 1 }, flags: ['rev_confess'] }, outcome: 'You go. The book is smaller than you expected, and warm, and bound in something that was once a noticeboard. You do not open it. The Reverend weeps, quietly, and you pretend not to see.' },
      { text: 'Tell me here. On the board, where it’s honest.', effects: { flags: ['rev_confess_board'] }, outcome: 'He writes it, in the smallest hand you have seen: “The third book is the village. Every name is in it, and every Keeper writes the next page, and when the page is full the Keeper is on it. I have been the vicar for forty-one years, four times. I do not remember being anything else.”' },
    ],
    onIgnore: { effects: { trust: { penry: -1 } }, outcome: 'You leave it. He does not write again on the subject. He sets a chair.' },
  });

  add({
    id: 'l8_penry_evasive', day: 8, type: 'letter', from: 'penry',
    when: (a) => a.trust('penry') < 2,
    subject: 'What a village can carry',
    body: 'Dear {{name}},\n\nI am aware of what is being said. I ask you to remember that a board can carry only what is pinned to it, and a village can carry only what it is told.\n\nIt has been told a great deal this week. Some of it by you.',
    sign: 'A. Penry',
    replies: [
      { text: 'Then tell it something true, Reverend.', effects: { flags: ['pressed_rev2'] }, outcome: 'No reply comes. The vestry lamp is on all night.' },
      { text: 'Understood.', effects: { trust: { penry: 1 } }, outcome: 'He nods at the lychgate, once.' },
    ],
    onIgnore: { effects: { trust: { penry: -1 } } },
  });

  add({
    id: 'l8_edith_diary', day: 8, type: 'letter', from: 'edith',
    subject: 'The diary',
    body: (a) => 'My dear,\n\nI have been keeping the diary ' + (a.has('diary') ? 'you were told to keep, and that I decided to keep alongside you, so that we might compare' : 'that Marion is always telling people to keep') + '. Today is Thursday. It has been Thursday before.\n\nI mean that literally. My entry for today is already written, in my own hand, dated a year ago, and it describes the flowers, and the board, and the new Keeper, and you.\n\nI have described you before, dear. I said you had kind handwriting. I had not seen your handwriting yet. I have now, and I was right, and I do not know whether to be pleased.',
    sign: 'Edith Marlow (Mrs)',
    replies: [
      { text: 'What did I say to you, the last time?', effects: { trust: { edith: 1 }, flags: ['edith_diary', 'edith_last'] }, outcome: 'She writes back: “You said: Edith, next time, tell me sooner. I am telling you sooner. I do not know what I am telling you.”' },
      { text: 'You must have written it this year and misdated it.', effects: { trust: { edith: -1 }, flags: ['edith_diary'] }, outcome: '“Yes,” she writes. “That is what I said to myself. In the diary. A year ago.”' },
    ],
    onIgnore: { effects: { trust: { edith: -1 }, flags: ['edith_diary'] } },
  });

  add({
    id: 'a8_frightened', day: 8, type: 'ash', from: 'ash', order: 1,
    body: 'Are you frightened yet?\n\nDon’t be. It’s only a board. Everything on it is only paper. Everything behind it is only me.',
    replies: [
      { text: 'Yes.', effects: { flags: ['ash_yes'] }, outcome: 'By morning, underneath: “Good. She wasn’t. That was the mistake.”' },
      { text: 'No.', effects: { flags: ['ash_no'] }, outcome: 'By morning, underneath: “Liar. I can feel your hand on the pin.”' },
      { text: 'Only of the paper.', effects: { flags: ['ash_paper'] }, outcome: 'By morning, underneath: “That is the right thing to be frightened of. You are cleverer than she was. That will not help either.”' },
    ],
    onIgnore: { effects: { flags: ['ash_ignored4'] } },
  });

  add({
    id: 'l8_marion_shown', day: 8, type: 'letter', from: 'marion', order: 2,
    plans: [{ at: 'shopflat', hour: 16, doing: 'tea; fifty-one at four o’clock', with: 'you' }],
    when: (a) => a.has('marion_shown'),
    subject: 'Three times',
    body: 'Sam showed me a page with my name on it three times.\n\nI’m not angry with Sam. Sam’s a doctor; doctors count. I’m angry with you, because you’re the one who decides what gets passed, and you passed that.\n\nAnd I sat on the floor behind my own counter, love, and I thought: well. That explains the cat. She’s been eleven for as long as I’ve had her.\n\nCome for tea anyway. I’ll be fifty-one at four o’clock.',
    sign: 'M.',
    prepinned: {
      text: 'I’m here. I’m always here.',
      flag: 'unpinned_strange',
      hint: 'You did not pin that. Your hand is not on the pin. It is your handwriting.',
      outcome: 'You take it down. The paper is warm. Underneath, on the board, there is a pale rectangle where it was, as if it had been there for years.',
      leftOutcome: 'You leave it. Marion reads it, and sits down on the floor behind her counter for the second time this week, and this time somebody sees.',
      keptEffects: { flags: ['kept_strange'] },
    },
  });

  add({
    id: 'l8_marion_check', day: 8, type: 'letter', from: 'marion', order: 2,
    when: (a) => !a.has('marion_shown'),
    subject: 'Just checking',
    body: 'Just checking you’re all right, love. You’ve gone quiet. Not the good quiet.\n\nThe kettle’s on. It’s always on. I’ve stopped asking why.',
    sign: 'M.',
    prepinned: {
      text: 'I’m here. I’m always here.',
      flag: 'unpinned_strange',
      hint: 'You did not pin that. Your hand is not on the pin. It is your handwriting.',
      outcome: 'You take it down. The paper is warm. Underneath, on the board, there is a pale rectangle where it was, as if it had been there for years.',
      leftOutcome: 'You leave it. Marion reads it. Marion goes very still behind the counter, and then she puts the kettle on again.',
      keptEffects: { flags: ['kept_strange'] },
    },
  });

  add({
    id: 'r8_H', day: 8, type: 'rumour', from: 'someone',
    body: 'Someone says the old board had a name carved on the back. Someone says it was “H”. Someone says it was two letters, and the second one was rubbed out, and the first one wasn’t H at all.',
  });

  // ===================================================== DAY 9
  add({
    id: 'a9_harriet', day: 9, type: 'ash', from: 'ash', order: 0,
    subject: 'My name is Harriet Vale',
    body: (a) => 'My name is Harriet Vale. I was the Keeper. I am behind the board now; I don’t know a better way to say it, and I have had a long time to think of one.\n\nEvery Keeper who reads the third book ends up here. I read it because Aldous asked me not to' + (a.has('rev_confess') ? ', the same way he asked you, and you didn’t, and I am so glad and so lonely' : ', and because I thought I was the sort of person who could read a thing and still be herself after') + '.\n\nYou’ll be asked too. You can refuse. I’d like you to refuse. I’d like some company. Both of those are true and I have stopped being ashamed of the second one.',
    sign: 'H.',
    replies: [
      { text: 'How do I get you out?', effects: { flags: ['help_harriet'] }, outcome: 'By morning, in ash: “You don’t. But you might stop it happening to the next one. I couldn’t. I tried by writing to you. Look how well that went.”' },
      { text: 'How do I stay out?', effects: { flags: ['self_first'] }, outcome: 'By morning, in ash: “Don’t read it. Don’t open the board. Don’t hold the pin so tight. You are already doing all three.”' },
    ],
    pass: {
      wren: { effects: { trust: { wren: 1 }, flags: ['wren_harriet'] }, outcome: 'Wren reads it in the pub yard. “she wrote to me,” she says. “in the box. she was already behind it when she wrote to me. that’s why the letters were warm.”' },
      penry: { effects: { trust: { penry: 1 }, flags: ['rev_harriet'] }, outcome: 'The Reverend reads it standing up. Then he sits down. “Harriet,” he says, and nothing else for a long time.' },
      '*': { outcome: 'They will not take it. “That’s from her,” they say, and they know who they mean.' },
    },
    onIgnore: { effects: { flags: ['harriet_ignored'] }, outcome: 'You leave it. It stays warm all day. By evening it is hot.' },
  });

  add({
    id: 'l9_sam_stuck', day: 9, type: 'letter', from: 'sam',
    plans: [{ at: 'road', hour: 7, doing: 'driving out past the mill, and past the mill' }],
    subject: 'I am leaving',
    body: '{{name}},\n\nI’m leaving. I’m writing to tell you because I think if I don’t tell someone it won’t count.\n\nThe road out of the village goes past the mill, and then it goes past the mill. I drove for two hours this morning. The fuel gauge did not move.\n\nI am not leaving. I have written the first sentence of this letter four times and it keeps being the same sentence.',
    sign: 'S.',
    replies: [
      { text: 'Stay. We’d miss you.', effects: { trust: { sam: 1 }, flags: ['sam_stay'] }, outcome: '“We,” Sam writes back. “You said we.”' },
      { text: 'Try walking. Take Bracken.', effects: { trust: { sam: 1, tom: 1 }, flags: ['sam_walk'] }, outcome: 'Sam borrows the dog. Tom lends him without asking why, which is the most Tom thing that has ever happened.' },
    ],
    onIgnore: { effects: { trust: { sam: -1 } }, outcome: 'You leave it. Sam sees it on the board every morning, on the way to the surgery, which is the only place the road goes.' },
  });

  add({
    id: 'l9_marion', day: 9, type: 'letter', from: 'marion',
    plans: (a) => a.trust('marion') >= 2 && !a.has('kept_strange') ? [{ at: 'shopflat', hour: 16, doing: 'tea at four, same as always', with: 'you' }] : [{ at: 'shop', hour: 16, doing: 'the back room, trying very hard to be fifty-one' }],
    subject: (a) => a.has('kept_strange') ? 'Always here' : a.trust('marion') >= 2 ? 'The kettle' : 'It was fine',
    body: (a) => {
      if (a.has('kept_strange')) return 'You pinned “I’m always here” on my letter. I didn’t ask that. Or did I. I read it, love, and I felt my hands go cold, because I’ve seen that handwriting before, on the back of the board, in pencil, and it wasn’t yours then.\n\nI’m not frightened of you. I want that clear. I’m frightened for you.';
      if (a.trust('marion') >= 2) return 'I know I’m not real, love. I’ve known for a while, I think, in the way you know a tooth’s going before it goes.\n\nI’ve decided it doesn’t matter. Tea at four, same as always. The kettle’s real enough when it’s boiling. The cat’s real enough when she’s on your lap. You’re real enough, whatever you are, and I’ll take that.';
      return 'I don’t know what you’ve done to this village but it was fine before you. It was FINE. We had a post office and a board and Thursdays and nobody asked what was behind anything.\n\nI’m going to put the kettle on and I’m going to sit in the back and I’m going to try very hard to be fifty-one.';
    },
    sign: 'M.',
    replies: [
      { text: 'Tea at four, then.', when: (a) => a.trust('marion') >= 2 && !a.has('kept_strange'), effects: { trust: { marion: 1 }, flags: ['marion_peace'] }, outcome: 'You go. The kettle is real enough. So is she, for an hour.' },
      { text: 'I didn’t write it, Marion.', when: (a) => a.has('kept_strange'), effects: { trust: { marion: 1 } }, outcome: '“I know,” she writes. “That’s the bit that frightens me.”' },
      { text: 'I’m sorry it stopped being fine.', when: (a) => a.trust('marion') < 2 && !a.has('kept_strange'), effects: { trust: { marion: 1 } }, outcome: '“It was never fine,” she writes, later. “I just hadn’t counted.”' },
      { text: 'You’re real to me.', effects: { trust: { marion: 1 }, flags: ['marion_real'] }, outcome: 'She doesn’t write back. There is a bag of the biscuits you like in the porch, with a note that just says “M.”' },
    ],
    onIgnore: { effects: { trust: { marion: -1 } } },
  });

  add({
    id: 'l9_tom', day: 9, type: 'letter', from: 'tom',
    plans: [{ at: 'mill', hour: 23, doing: 'the mill wall, with a chisel' }],
    subject: 'Cut it out',
    body: 'Cut your name in the mill wall myself last night. Under mine. Thought it might keep you.\n\nThen I thought, that’s not how it works, is it. That’s how it catches. So I cut it out again. Took an hour. Hand’s bleeding.\n\nSorry.',
    sign: 'T.',
    replies: [
      { text: 'Thank you for cutting it out.', effects: { trust: { tom: 1 }, flags: ['tom_cut'] }, outcome: '“Aye.” Then, a day later, on the same paper: “It’s back. I didn’t do it. Cut it out again. It’s back.”' },
      { text: 'Leave it. Let it catch.', effects: { trust: { tom: -1 }, flags: ['let_catch'] }, outcome: '“No,” he writes. “I’ve seen what it catches.”' },
    ],
    onIgnore: { effects: { trust: { tom: -1 } } },
  });

  add({
    id: 'l9_edith', day: 9, type: 'letter', from: 'edith',
    subject: 'Sooner',
    body: (a) => a.has('edith_last')
      ? 'You asked what you said to me last time, and I told you, and now I have found the entry where you asked. It is in the diary. It is dated a year ago. Under it I have written: “Tell them about the card on the flowers.”\n\nSo I am telling you sooner. There is a card on the flowers, in the north corner. There has always been a card. I have never read it, because I did not want to know. I want you to read it, dear. I am too old to want things for myself.'
      : 'I have started reading the diary backwards. It is the only direction in which it makes sense.\n\nThere is a card on the flowers in the north corner. There has always been a card. I have never read it. I should like you to. A postmaster can look where a neighbour cannot.',
    sign: 'E.',
    replies: [
      { text: 'I’ll read the card.', effects: { trust: { edith: 1 }, flags: ['read_card'] }, outcome: 'You go on Thursday, which is every day. The flowers are fresh. The card says: “For the Keeper.” Under it, three names, in three inks. The third is wet.' },
      { text: 'Some things are better not known, Edith.', effects: { trust: { edith: -1 } }, outcome: '“Yes,” she writes. “That is what everyone here has decided. Look at us.”' },
    ],
    onIgnore: { effects: { trust: { edith: -1 } } },
  });

  add({
    id: 'r9_none', day: 9, type: 'rumour', from: 'someone',
    body: 'Nobody’s making up rumours anymore. Someone says that’s the worst sign of all. Someone says: that’s a rumour. Someone says: no it isn’t. It’s just true.',
  });

  // ===================================================== DAY 10
  add({
    id: 'l10_wren_unpin', day: 10, type: 'letter', from: 'wren', order: 0,
    subject: 'here’s what i think',
    body: (a) => {
      const cold = a.trust('wren') < 0;
      let s = 'here’s what i think.\n\nthe board is the village. when you’re not looking at it we’re not anything. i can feel it — the gap between your days. it’s not sleep. i’ve been in the gap. it’s [[quiet|loud]].\n\ni don’t want to go back in it. i want you to take me off the board. unpin me. i think if i’m not pinned i’m not anything, and i think that’s better than being pinned forever.\n\nedith would say i’m young. edith’s been fifty-one three times.';
      if (a.has('wren_harriet')) s += '\n\nharriet’s behind the board. she wrote to me. she’s been there forty-one years and she’s still asking for company. i don’t want to be company.';
      if (a.has('promise_wren')) s += '\n\nyou promised you’d find out what “out” means. this is what it means. you did find out. that counts.';
      s += cold ? '\n\ni don’t even like you. but you’re the one with the pin.' : '\n\ni’m asking you because you’re the one with the pin. and because [[i trust you|i don’t have anyone else]].';
      return s;
    },
    sign: '- w',
    hint: 'One of these options changed while you were reading it. You are fairly sure.',
    replies: [
      { text: 'I’ll unpin you.', shift: 'I won’t do it.', effects: { trust: { wren: 1 }, flags: ['agree_unpin'] }, outcome: 'You don’t do it yet. Something in you wants it to be daylight. It is, and has been, and will be.\n\n“ok,” she writes. “tomorrow. i can do one more day.”' },
      { text: 'I won’t. Stay with us.', effects: { flags: ['refuse_unpin'] }, outcome: '“ok,” she writes. Then, later, on the same paper: “i knew you’d say that. i sort of hoped. i sort of didn’t.”' },
      { text: 'Let me think until tomorrow.', effects: { flags: ['think_unpin'] }, outcome: '“tomorrow’s thursday,” she writes. “it’s always thursday. take your time. that’s a joke.”' },
    ],
    onIgnore: { effects: { trust: { wren: -1 }, flags: ['think_unpin', 'wren_unpin_ignored'] }, outcome: 'You leave it. It does not yellow. It waits.' },
  });

  add({
    id: 'l10_penry_chair', day: 10, type: 'letter', from: 'penry',
    when: (a) => a.has('rev_confess') || a.has('rev_confess_board'),
    subject: 'The chair',
    body: (a) => (a.has('rev_confess') ? 'You came. You saw the book. You did not open it, and I have not stopped shaking since, because nobody has ever not opened it.\n\n' : 'You would not come, and I told you on the board instead, and now the whole village knows, and I find I do not mind.\n\n') + 'Whatever you choose now, know this: I have set a chair for Harriet every year, and for Dunstan, and for two whose names the book has taken back, and I will set one for you, and I do not know how to stop.\n\nIf you find a way, I would be grateful if you told me. On the board. Where it’s honest.',
    sign: 'A.',
    replies: [
      { text: 'Stop setting the chairs, Aldous.', effects: { trust: { penry: 1 }, flags: ['stop_chairs'] }, outcome: '“I will try,” he writes. “I have tried. My hands do it.”' },
      { text: 'Set one for me. I’d like to be remembered.', effects: { trust: { penry: 1 }, flags: ['want_chair'] }, outcome: '“You will be,” he writes. “That is not the same as being kept.”' },
    ],
    onIgnore: { effects: { trust: { penry: -1 } } },
  });

  add({
    id: 'n10_evensong', day: 10, type: 'notice', from: 'penry',
    when: (a) => !a.has('rev_confess') && !a.has('rev_confess_board'),
    subject: 'ST ANNE’S',
    body: 'The Reverend will not be taking Evensong this week.\n\nThe chairs in the hall are to be left as they are.',
    sign: 'A. Penry',
  });

  add({
    id: 'a10_harriet', day: 10, type: 'ash', from: 'ash', order: 1,
    body: (a) => (a.removed('wren') ? 'Someone asked you for something. I never had the nerve.' : 'Wren has asked you for something. I never had the nerve.') + '\n\nWhatever you do for her, do it while you’re still the one holding the pin. It passes. I did not feel it pass. One day I was pinning and the next I was pinned, and the day in between was Thursday.',
    sign: 'H.',
    replies: [
      { text: 'And you? What do you want, Harriet?', effects: { flags: ['ask_harriet_want'] }, outcome: 'By morning, in ash: “I want the chair taken away. I want nobody to set a place. I want to be forgotten properly, not kept warm.”' },
      { text: 'I’m holding it now.', effects: { flags: ['holding_pin'] }, outcome: 'By morning, in ash: “I know. I can feel it. Don’t hold it so tight.”' },
    ],
    onIgnore: { effects: { flags: ['harriet_ignored2'] } },
  });

  add({
    id: 'n10_supper_again', day: 10, type: 'notice', from: 'penry', order: 3,
    subject: 'HARVEST SUPPER',
    body: 'Saturday, 7 o’clock, the Village Hall.\n\nBring a dish, a bottle, or yourself. All welcome, all expected.\n\nA place will be set, as usual, for those who cannot be with us.\n\n[[ |This notice has been pinned before. You can see the old pin holes. There are a great many of them.]]',
    sign: 'A. Penry',
    hint: 'The paper has more pin holes than a notice needs. You count them, and stop at forty.',
  });

  add({
    id: 'l10_edith_card', day: 10, type: 'letter', from: 'edith',
    when: (a) => a.has('read_card'),
    subject: 'The card',
    body: 'You read the card, then. “For the Keeper.” Three names, three inks, the third still wet.\n\nI have pinned the flowers to the board, dear. It seemed the only honest place for them. I have pinned the card beside them, face down. You may turn it over or not. I have been very brave this week and I find I have none left for that.',
    sign: 'E.',
    replies: [
      { text: 'Turn it over.', effects: { trust: { edith: 1 }, flags: ['card_turned'] }, outcome: 'The third name is yours. Of course it is. The ink is wet on your thumb, and it is not ink.' },
      { text: 'Leave it face down.', effects: { trust: { edith: 1 }, flags: ['card_down'] }, outcome: 'You leave it. Everyone who passes the board reads it anyway, through the back, because that is how the board works now.' },
    ],
    onIgnore: { effects: { flags: ['card_down'] } },
  });

  add({
    id: 'l10_sam', day: 10, type: 'letter', from: 'sam',
    subject: (a) => a.has('sam_walk') ? 'Walked' : 'The first sentence',
    body: (a) => a.has('sam_walk')
      ? 'Walked. Took the dog, as you said.\n\nBracken stopped at the mill and lay down and would not go on. I sat with him. The road past him is a painting. I touched it. It was warm, and it was paper.\n\nI’m going back to the surgery. There is a form.'
      : 'I have stopped writing the first sentence.\n\nI have started writing the last one instead. It is: “I was here.” I would like it on the board, please, in case the board is the only place that counts.',
    sign: 'S.',
    replies: [
      { text: 'It’s on the board. You were here.', effects: { trust: { sam: 1 }, flags: ['sam_here'] }, outcome: '“Thank you,” Sam writes. “That is the first thing anyone has written down about me that I believe.”' },
      { text: 'Come to the porch. Sit with me.', overnight: true, laterHint: 'Six o’clock, on your own porch, with the board at your back. There is a day to get through first, and the board is most of it.', effects: { trust: { sam: 2 }, flags: ['sam_porch'] }, plans: [{ at: 'porch', hour: 18, doing: 'the porch, sitting with you', with: 'you' }], outcome: 'Sam comes. You sit. Neither of you says anything for an hour, and the board is warm at your backs, and it is nearly comfortable.' },
    ],
    onIgnore: { effects: { trust: { sam: -1 } } },
  });

  add({
    id: 'r10_name', day: 10, type: 'rumour', from: 'someone',
    body: (a) => 'Someone says ' + a.name + ' has the post office now. Someone says that used to be a different name. Someone can’t remember it. Someone thinks that’s the point.',
  });

  // ===================================================== DAY 11 — everyone writes; then the board
  add({
    id: 'l11_marion', day: 11, type: 'letter', from: 'marion', order: 1,
    plans: [{ at: 'shopflat', hour: 16, doing: 'tea, after whatever you do', with: 'you' }],
    subject: 'Whatever you do',
    body: (a) => (a.trust('marion') >= 2
      ? 'Whatever you do today, love, do it and then come for tea. I don’t care if there’s a village after. There’ll be a kettle. I’ll see to that if I have to be the kettle.\n\nYou’ve been a good postmaster. Better than Harriet, and I loved Harriet. She kept the board. You kept us.'
      : 'Whatever you do today, do it quickly. The waiting is the worst of it. I’ve been waiting forty-one years three times and I’d like it to be Friday.\n\nI don’t know if you’ve been a good postmaster. I know you’ve held the pin all week. Harriet said that was the most anyone could manage.'),
    sign: 'M.',
    hint: 'There is nothing to answer. She knows that. She wrote anyway.',
  });

  add({
    id: 'l11_tom', day: 11, type: 'letter', from: 'tom', order: 2,
    plans: [{ at: 'gate', hour: 8, to: 20, doing: 'the gate, with the dog, all day' }],
    subject: 'Dog’s at the gate',
    body: (a) => 'Dog’s at the gate, looking up the road. He knows.\n\n' + (a.trust('tom') >= 2 ? 'You asked what the wall means, once, or I asked you. I’ve worked it out. It means we were here. That’s all a name on a wall ever meant. It’s enough.\n\nDo what you’re going to do. I’ll be at the gate with the dog.' : 'Do what you’re going to do. I’ll be at the gate with the dog. Not much else I’m for.'),
    sign: 'T.',
    hint: 'Nothing to answer. He would not want one.',
  });

  add({
    id: 'l11_edith', day: 11, type: 'letter', from: 'edith', order: 3,
    plans: [{ at: 'rose', hour: 10, doing: 'the last page of the diary' }],
    subject: 'The last entry',
    body: (a) => 'My dear,\n\nI have written today’s entry in the diary. It is the last page. I did not choose that; the book chose it, the way this village chooses things.\n\nIt says: “Thursday. The Keeper is kind. ' + (a.trust('edith') >= 2 ? 'I asked for one thing I did not already know and I was given three, and I find I cannot hold them, and I am glad I was given them anyway.' : 'I asked for one thing I did not already know and I was not given it, and that is not the Keeper’s fault, and I have written that down so that I remember it is not.') + '”\n\nI have been eighty-something four times. I should like, if it is in your gift, to be something else for a bit. Even nothing. Nothing would be restful.',
    sign: 'Edith Marlow (Mrs), for the last time in this hand',
    hint: 'Nothing to answer. You read it twice, and then you go and stand in the porch for a while.',
  });

  add({
    id: 'l11_sam', day: 11, type: 'letter', from: 'sam', order: 4,
    plans: [{ at: 'surgery', hour: 9, doing: 'the surgery; a form with your name on it' }],
    subject: 'For the record, again',
    body: (a) => '{{name}},\n\nFor the record: forty-one names, three times over, and one Keeper’s line with wet ink beside it.\n\n' + (a.trust('sam') >= 2 ? 'I want it written that I was told to leave it and I did not, and that you helped, and that it was the right thing even though it did not help. Especially because it did not help.\n\nI am at the surgery. There is a form. It has your name on it, and it is not in my handwriting.' : 'I want it written that I was told to leave it. I left it, mostly. I would like that to count for something. I suspect it does not.'),
    sign: 'S.',
    hint: 'Nothing to answer. It is on the board. That was the point.',
  });

  add({
    id: 'l11_penry', day: 11, type: 'letter', from: 'penry', order: 5,
    plans: [{ at: 'vestry', hour: 18, to: 30, doing: 'the vestry, with the lamp off' }],
    subject: 'Whatever you choose',
    body: (a) => 'Dear {{name}},\n\n' + (a.has('rev_confess') || a.has('rev_confess_board') ? 'You know what the third book is. You know I keep it. You know I cannot stop.\n\nWhatever you choose today, I will not argue. I have argued with four Keepers and buried none of them and set a chair for each.' : 'I have not told you everything. I have told you what a village can carry. Today you will be asked to carry the rest, and I am sorry, and I have been sorry four times.') + '\n\nI am going to sit in the vestry with the lamp off. If the village is still here in the morning, I will take Evensong. If it is not, I hope somebody will remember that I tried to say so.',
    sign: 'A. Penry',
    hint: 'Nothing to answer. The vestry lamp is off. It is the first time.',
  });

  add({
    id: 'l11_wren', day: 11, type: 'letter', from: 'wren', order: 6,
    plans: [{ at: 'fox', hour: 12, doing: 'the Fox, waiting for the board to ask' }],
    subject: (a) => a.has('agree_unpin') ? 'ok' : a.has('refuse_unpin') ? 'i’m still here' : 'you said tomorrow',
    body: (a) => {
      if (a.has('agree_unpin')) return 'ok. today then.\n\ni’m not scared. that’s a lie, but it’s the kind you tell someone who’s about to do something hard for you.\n\nif the others forget me, that’s fine. that’s the whole idea. i don’t want to be a chair. i want to be a gap where a girl was, and then not even that.\n\nyou remember, though. you’re not on the board. you’re allowed.';
      if (a.has('refuse_unpin')) return 'i’m still here. you said stay, so i’m staying.\n\ni’m still going to ask, though. every thursday. i’ll be the letter you can’t answer.\n\nthat’s not a threat. i just want you to know what staying costs. it costs asking.';
      return 'you said tomorrow. it’s tomorrow. it’s thursday.\n\nthe board’s going to ask you something today. it asks every keeper. harriet said no to all three and that’s how she ended up behind it — she didn’t choose, so the board chose.\n\nchoose. for me. whatever it is. even if it’s the one i don’t want.';
    },
    sign: (a) => a.has('name_real') ? '- w, to {{name}}, who’s real' : '- w',
    hint: 'Nothing to answer here. The answer is on the other letter, the one from behind the board.',
  });

  add({
    id: 'b11_board', day: 11, type: 'ash', from: 'board', order: 99,
    subject: 'Three things a Keeper can do',
    body: (a) => 'There are three things a Keeper can do with a board that has noticed them.\n\nKeep it. Pin the days, one after another, and let Ashfield go on being small, and kind, and the same. Forty-one, and you.\n\nEmpty it. Unpin ' + (a.removed('wren') ? 'whoever asks' : 'the one who asked') + ', and let the rest go on, fewer, and not knowing they are fewer. ' + (a.has('refuse_unpin') ? 'You said no to her. The option is still here. It always is.' : 'She asked. You heard her.') + '\n\nBurn it. Everything on it. Everything behind it. Me. Them. The name you typed. The porch. It does not come back, and nobody sets a chair, because there is no hall to set it in.\n\nI am asking you to choose because nobody asked me. Choose while you are the one holding the pin.',
    sign: 'H., and the others, and the board',
    hint: 'Whatever you choose, choose it. Not choosing is how she ended up behind it.',
    replies: [
      { text: 'Keep it.', effects: { ending: 'keep', flags: ['chose_keep'] }, outcome: 'You keep it. The board is warm under your hand, and then, slowly, it is only a board.\n\nUnderneath, by morning, in ash: “Thank you. I think. Tea at four.”' },
      { text: 'Empty it.', effects: (a) => { a.setEnding('letgo'); a.setFlag('chose_letgo'); a.remove('wren'); }, outcome: 'You take the pin out. The paper does not fall. It is simply not there, and then the pin is not there, and then the pale rectangle where it was is not there either.\n\nYou wait for someone to notice. Nobody does. That was the whole idea.' },
      { text: 'Burn it.', effects: { ending: 'burn', flags: ['chose_burn'] }, outcome: '' },
    ],
    onIgnore: { effects: { ending: 'keep', flags: ['chose_nothing'] }, outcome: 'You do not choose. The board chooses. It chooses the same thing it always chooses.' },
  });

  // ===================================================== DAY 12 — after
  add({
    id: 'l12_marion_keep', day: 12, type: 'letter', from: 'marion',
    plans: [{ at: 'shopflat', hour: 16, doing: 'tea; the kettle on', with: 'you' }],
    when: (a) => a.ending !== 'letgo',
    subject: 'Tea',
    body: (a) => (a.has('chose_nothing') ? 'You didn’t choose. I heard. That’s all right, love. Harriet didn’t either, and look, here we all still are.\n\n' : 'You kept us. I don’t know if that was kind or the opposite. I’ve decided not to work it out.\n\n') + 'Tea at four. The kettle’s on. It’s always on. I’ve started to find that funny.',
    sign: 'M.',
    hint: 'Nothing to answer. You go at four.',
  });

  add({
    id: 'l12_marion_letgo', day: 12, type: 'letter', from: 'marion',
    plans: [{ at: 'shopflat', hour: 16, doing: 'tea; the kettle on', with: 'you' }],
    when: (a) => a.ending === 'letgo',
    subject: 'A room',
    body: 'There’s a room going at the Fox & Hounds. Don’t know why. It’s been empty a while, I think. I went past and there was a coat on the hook that nobody claimed, and I nearly said a name, and it wasn’t a name, it was a noise.\n\nAnyway. Tea at four. The kettle’s on.',
    sign: 'M.',
    hint: 'She has forgotten. That was the idea. You have not, and that was the price.',
  });

  add({
    id: 'l12_wren_keep', day: 12, type: 'letter', from: 'wren',
    when: (a) => a.ending !== 'letgo',
    subject: 'ok',
    body: (a) => (a.has('agree_unpin') ? 'you said you would and then you didn’t. it’s ok. i’m not angry. i’m [[fine|here]].\n\n' : 'ok. i’m still here. ') + 'it’s alright. [[it’s alright.|it isn’t.]] it’s alright.\n\nsee you thursday.',
    sign: '- w',
    hint: 'Nothing to answer. You will see her Thursday. It is always Thursday.',
  });

  add({
    id: 'l12_edith_keep', day: 12, type: 'letter', from: 'edith',
    when: (a) => a.ending !== 'letgo',
    subject: 'Forty-one',
    body: (a) => 'My dear,\n\nI counted this morning, out of habit, the way one checks a pocket for keys one no longer needs. Forty-one. The same forty-one.\n\n' + (a.trust('edith') >= 2
      ? 'I find I am not disappointed, and that is the part I did not expect. I asked you for one thing I did not already know, and you gave me several, and none of them were comfortable, and I would ask again.\n\nThe diary has started over at the first page. In my hand. I have not written it yet.'
      : 'I asked for one thing I did not already know. I have decided that the asking was the thing, and that I got it, and that this is the sort of arrangement one makes at my age.\n\nThe diary has started over at the first page. In my hand. I have not written it yet.'),
    sign: 'E.',
    hint: 'Nothing to answer. She has counted. She will count again on Monday.',
  });

  add({
    id: 'l12_sam_keep', day: 12, type: 'letter', from: 'sam',
    when: (a) => a.ending !== 'letgo',
    subject: 'Forty-one',
    body: (a) => '{{name}},\n\nThe register has forty-one names. It had forty-one names on my first morning here, eighteen months ago, and I did not count them then, and I have not stopped counting them since.\n\n' + (a.trust('sam') >= 2
      ? 'You will want to know whether I am all right. I am not, and I am used to that, and being used to a thing is most of what people mean by all right.\n\nSurgery is Tuesday and Thursday. It has been Thursday for some time, so I am simply open.'
      : 'I am not asking you for anything. I want that noted, because I have asked you for things and you did not always answer, and I have decided to stop finding that remarkable.\n\nSurgery is Tuesday and Thursday. It has been Thursday for some time.'),
    sign: 'S.',
    hint: 'Nothing to answer. The surgery is simply open.',
  });

  add({
    id: 'l12_penry', day: 12, type: 'letter', from: 'penry',
    subject: (a) => a.ending === 'letgo' ? 'One chair fewer' : 'Evensong',
    body: (a) => a.ending === 'letgo'
      ? 'Dear {{name}},\n\nI set the chairs for the supper this morning and there was one left over, and I stood in the hall with it in my hands for a long while, and I could not think who it was for.\n\nThat has never happened. I have always known. Knowing was the whole of my part in this.\n\nI have put it back in the stack. I find I am grateful, and I do not know to whom, and I suspect that is the point of gratitude.'
      : 'Dear {{name}},\n\nThe village is here in the morning, so I am taking Evensong.\n\n' + (a.has('stop_chairs') ? 'You asked me to stop setting the chairs. I set them. My hands set them. But this week I counted them out loud, which I have never done, and hearing the number was not the same as knowing it, and I think that is the beginning of something.' : 'I have set the chairs. There are the usual number. I no longer pretend to myself that I know why I keep count.') + '\n\nYou did not go behind the board. Four Keepers did. I should like the record to show, somewhere it cannot be rebound, that one did not.',
    sign: 'A. Penry',
    hint: 'Nothing to answer. The bells go at six.',
  });

  add({
    id: 'l12_edith_letgo', day: 12, type: 'letter', from: 'edith',
    when: (a) => a.ending === 'letgo',
    subject: 'Something I meant to say',
    body: 'My dear,\n\nI had a thought this morning that there was something I meant to tell you about a young person, and it went, the way the third chair went. I sat with it for an hour and it did not come back.\n\nI have written in the diary: “Forty. Not forty-one. I counted twice.” I do not know why that should make me want to weep, and I have, a little, and I feel better for it.',
    sign: 'E.',
    hint: 'Nothing to answer. She has counted. She is the only one who has.',
  });

  add({
    id: 'l12_sam_letgo', day: 12, type: 'letter', from: 'sam',
    when: (a) => a.ending === 'letgo',
    subject: 'Forty',
    body: '{{name}},\n\nThe register has forty names today. I counted twice. Yesterday I would have sworn to forty-one, and I cannot now say who the forty-first was, and I have a reference letter in my drawer for someone whose name I cannot read.\n\nI don’t think you did anything wrong. I think you did something.',
    sign: 'S.',
    hint: 'Nothing to answer. The reference is still in the drawer. Sam does not throw it away.',
  });

  add({
    id: 'l12_tom', day: 12, type: 'letter', from: 'tom',
    subject: 'Gate',
    body: (a) => 'Dog’s come in from the gate. First time all week. Lay down by the stove like nothing.\n\n' + (a.ending === 'letgo' ? 'Went up the mill. One name gone off the wall. Don’t know whose. Smooth stone where it was, like it was never cut. I put my hand on it and it was warm.' : 'Went up the mill. Wall’s the same. Your name’s on it now. Didn’t cut it. Didn’t cut it out either. Thought you’d want to know.'),
    sign: 'T.',
    hint: 'Nothing to answer. The dog is by the stove.',
  });

  add({
    id: 'r12', day: 12, type: 'rumour', from: 'someone',
    body: (a) => a.ending === 'letgo'
      ? 'Someone says there used to be a girl at the pub. Someone says there was never a pub. Someone goes to check and comes back and says: there’s a pub. Someone says: well, then.'
      : 'Someone says it’s Monday tomorrow. Someone says that’s what they said last time. Someone says: what last time. Someone says: exactly.',
  });

  // ------------------------------------------------------------ endings
  const endingTitles = { keep: 'Kept', letgo: 'Emptied', burn: 'Ash' };
  const endings = {
    keep: (a) => [
      'You keep the board.',
      'The days go on being pinned, one after another. Marion is fifty-one. Edith remembers everything. Tom stands at the gate with the dog. Sam fills in forms. The Reverend sets a chair, and does not know how to stop, and has stopped minding.',
      a.removed('wren') ? 'There is a room going at the Fox & Hounds. Nobody asks why.' : 'Wren asks, every Thursday. You never answer. She never yellows.',
      'The village is the same size it always was. Forty-one, and you. It never gets any bigger.',
      'Tomorrow is Monday. The porch smells of wet coats and someone else’s coffee. A notice from the Parish Council confirms {{name}} as Postmaster of Ashfield, following the departure of {{name}}.',
      'You have read it before. You are sure of it.',
    ],
    letgo: (a) => [
      'You empty the board. One pin.',
      'Nobody notices. That was the idea. Marion goes past a coat on a hook and nearly says a name. Edith counts forty and weeps and feels better for it. Sam keeps a reference letter for someone whose name has gone off the page.',
      'Tom puts his hand on the smooth stone where a name was, and it is warm.',
      'You remember her. You are not on the board; you are allowed. That is the job, it turns out. Not the pinning. The remembering.',
      'Tomorrow is Monday. A notice from the Parish Council confirms {{name}} as Postmaster of Ashfield, following the departure of {{name}}. The village is the same size it always was.',
      'Forty. Not forty-one. You counted twice.',
    ],
    burn: (a) => [
      'You burn it.',
      'The paper goes first. Then the pins. Then the pale rectangles where the paper was, which you had not known were also paper. Then the cork, and the frame, and the pencil on the back that said the board tells you what the village won’t.',
      'Then the porch. Then the road that goes past the mill and then past the mill.',
      'Harriet goes last, and she says thank you, and it is not in ash.',
      'Marion. Aldous. Edith. Tom, and the dog. Sam. ' + (a.removed('wren') ? '' : 'Wren, who wanted this, and got it, and said ok.') + ' Forty-one, and the third book, and the chair.',
      'Nobody sets a place, because there is no hall to set it in.',
      'The name you typed is gone too. That was part of it. Somewhere, though, someone is holding something, and there is a light on their face, and they are about to type a name.',
      'Close the door. The wind takes things.',
    ],
  };

  // ------------------------------------------------------------ the address book
  // Everything the address book knows about the village lives here.
  //   places      — where people can be. Keys used by `work` and by plans.
  //   work        — what each of them does for a living, and the gap the job leaves in the day.
  //                 `meet` is where and when that gap is, which is where you end up when you
  //                 reach out; an outreach option with no plans of its own uses it.
  //   notes       — facts that appear on a villager's page once `when` is true. `key` is the
  //                 keyword outreach can ask about (a.knows(who, key)), and the keyword you can
  //                 leave a note of your own about.
  //   noteReplies — what comes back on the board the morning after you leave one.
  //   astray      — what goes up on the board the morning after post goes to the wrong house.
  //   outreach    — things you can do without waiting for a letter. `when` usually asks a.knows().
  //                 kind: 'visit' | 'write' | 'ask'. Once each, unless `repeat: n` (days between).
  //
  // Plans (on an item, a reply, or an outreach option) put an entry in your day:
  //   plans: [{ who?, day?, at, hour, to?, doing, with?: 'you' | villagerKey | 'everyone' }]
  //   `who` defaults to the sender ('*' for everyone); `day` to the item's day. May be (api) => [...].
  //
  // Every `when` gets the api; a note's `when` also gets the villager key second.

  const places = {
    shop: 'the shop', shopflat: 'the flat above the shop', church: 'St Anne’s', vestry: 'the vestry',
    fox: 'the Fox & Hounds', cellar: 'the pub cellar', lowfarm: 'Low Farm', gate: 'the gate at Low Farm',
    rose: 'Rose Cottage', surgery: 'the surgery', hall: 'the village hall', porch: 'the porch',
    green: 'the green', churchyard: 'the churchyard, north corner', millroad: 'the mill road',
    mill: 'the old mill', road: 'the road out',
  };

  // Their work, and what it leaves them free for. You are the postmaster: you know what everybody
  // does, because you deliver to it, and knowing the job is how you know when to knock.
  //   job  — the line the book keeps under their name
  //   meet — { at, hour, doing }, or (api) => it. Where the job puts them when they can see you.
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

  // ---- notes: what you have learned, by person, by keyword
  const notes = {
    marion: [
      { key: 'shop', text: 'Runs the shop next door. Anything that comes into Ashfield comes past her window first, unless it comes through your door.', when: (a) => a.seen('l1_marion') },
      { key: 'the committee', text: 'Every letter the hall committee gets comes to the shop, and every one of them is addressed to her by name. She is the hall committee. There is a biscuit tin, and there has never been anybody else on it.', when: (a) => a.day >= 4 },
      { key: 'tea', text: 'Tea is at four, above the shop. Bring nothing. She means it.', when: (a) => a.has('tea') },
      { key: 'gossip', text: 'Tells most of what she knows. Anything given to her is round the village by teatime.', when: (a) => a.has('flowers_marion') || a.has('betrayed_wren') || a.has('ash_marion') || a.has('dog_marion') },
      { key: 'cat', text: (a) => a.seen('l8_marion_shown') ? 'Has a cat. The cat has been eleven for as long as she has had her.' : 'Has a cat. The cat has met you, which is more than the last two vicars managed.', when: (a) => a.seen('l2_marion_tea') || a.seen('l8_marion_shown') || a.has('cat_named') },
      { key: 'harriet', text: 'Was fond of Harriet, who had the desk before you. Harriet went up the mill road the week before she left.', when: (a) => a.seen('l2_marion_tea') || a.seen('l2_marion_quiet') },
      { key: 'pencil', text: (a) => a.has('pencil_wont') ? 'Harriet wrote something on the back of the board, in pencil. You could read one word of it: won’t.' : 'Harriet wrote something on the back of the board, in pencil. The board is screwed to the wall.', when: (a) => a.has('ask_harriet') },
      { key: 'postmark', text: 'Harriet wrote to her after she went. It was postmarked Ashfield.', when: (a) => a.seen('l4_marion_gossip') },
      { key: 'door', text: 'Harriet’s letter said: tell the next one to close the door.', when: (a) => a.has('marion_why') },
      { key: 'biscuits', text: 'Knows which biscuits you like, and uses that.', when: (a) => a.has('marion_shut') || a.has('marion_real') },
      { key: 'chairs', text: 'Counts the chairs at the supper. Three last year. Nobody else counts.', when: (a) => a.seen('l5_marion_chairs') },
      { key: 'dunstan', text: (a) => a.has('dunstan_faded') ? 'Dunstan kept the board before Harriet. Eleven years, and all she has of him is that he liked the rain, or didn’t.' : 'Dunstan kept the board before Harriet. She cannot remember the third chair, and remembers that she cannot.', when: (a) => a.has('ask_chairs') },
      { key: 'light', text: 'Thinks the evenings have stopped drawing in. Says to keep a diary and see if you agree with yourself.', when: (a) => a.seen('l7_marion_light') },
      { key: 'fifty-one', text: 'Her name is in the register three times. She has been fifty-one, by the book, three times.', when: (a) => a.seen('l7_sam_names') || a.has('marion_knows_sam') || a.has('marion_shown') },
      { key: 'the shop patient', text: 'Sam let slip that one of the four patients with the wrong dates runs a shop.', when: (a) => a.has('sam_hinted') },
      { key: 'real', text: 'Knows she is not real, and has decided it does not matter. The kettle is real enough when it is boiling.', when: (a) => a.seen('l9_marion') && a.trust('marion') >= 2 && !a.has('kept_strange') },
      { key: 'handwriting', text: 'Has seen the handwriting on the strange note before: on the back of the board, in pencil. It was not yours then.', when: (a) => a.seen('l9_marion') && a.has('kept_strange') },
    ],
    penry: [
      { key: 'first', text: 'The vicar. Formal, kind. Asks that any letter you do not understand comes to him first.', when: (a) => a.seen('l3_penry_welcome') || a.seen('l3_penry_flowers') },
      { key: 'the north corner', text: (a) => a.has('stone_facedown') ? 'Says the grave in the north corner has a stone after all. It is face down. That was also asked for.' : 'Says the grave in the north corner has no stone because the family asked for none. Would like it left to rest.', when: (a) => a.seen('l3_penry_flowers') || a.has('stone_facedown') },
      { key: 'evensong', text: 'Takes Evensong. He read out the dog. Nobody at Evensong has a dog.', when: (a) => a.has('dog_rev') },
      { key: 'the stove', text: 'Put the ash letter in the vestry stove and watched it burn. Said it has never helped.', when: (a) => a.has('ash_rev') },
      { key: 'the lamp', text: (a) => a.has('rev_reading') ? 'In the vestry every night with the lamp on. Says he cannot read in the dark, and that he has not finished, and does not think it can be finished.' : 'In the vestry every night with the lamp on. Rebinding the register, someone says. Reading it, someone else says.', when: (a) => a.seen('r4_vestry') },
      { key: 'chairs', text: (a) => a.has('chairs_worn') ? 'Sets a chair at the supper for every Keeper who has gone. Four of the chairs in the stack are worn at the arms. He does not move them.' : 'Sets a chair at the supper for every Keeper who has gone. Does not know how to stop.', when: (a) => a.seen('l5_marion_chairs') || a.has('rev_confess') || a.has('rev_confess_board') },
      { key: 'the register', text: 'Keeps the parish register. Says it is a record of a parish, not of the truth: different books.', when: (a) => a.seen('l6_penry_exposed') },
      { key: 'who has been here', text: 'Says the register is a record of who has been here, and how many times.', when: (a) => a.has('pressed_rev') },
      { key: 'the key', text: (a) => a.has('key_refused') ? 'Locked the church after Evensong. Would not give you the key, and said it does not get easier.' : 'Locked the church after Evensong. Keys with the Reverend. Appointments not being made.', when: (a) => a.seen('n6_church_locked') },
      { key: 'the third book', text: 'There is a third book. The register is only a copy of it. Every Keeper who reads it goes behind the board.', when: (a) => a.has('rev_confess') || a.has('rev_confess_board') },
      { key: 'forty-one years', text: 'Has been the vicar for forty-one years, four times. Does not remember being anything else.', when: (a) => a.has('rev_confess_board') },
      { key: 'harriet', text: 'Sat down when he read Harriet’s name, and said it, and nothing else for a long time.', when: (a) => a.has('rev_harriet') },
    ],
    wren: [
      { key: 'the fox', text: 'Nineteen. Pulls pints at the Fox and wants to be somewhere else. Writes in lowercase.', when: (a) => a.seen('l2_wren') },
      { key: 'the course', text: 'Wants the nursing course in the city. Needed someone to say she is sensible. Her mum was not to know.', when: (a) => a.has('wren_ref') || a.has('read_wren') || a.has('betrayed_wren') || a.has('wren_misdelivered') },
      { key: 'her mum', text: 'Her mum found out at the shop. Cried, and then said go.', when: (a) => a.replied('l4_wren_betrayed', 0) },
      { key: 'the city', text: (a) => a.has('wren_timetable') ? 'Going to the city. Actually going. Wants a bus timetable with a bus on it that goes somewhere and comes back a different way.' : 'Going to the city. Actually going. Owes you something stupid from it.', when: (a) => a.seen('l4_wren_yes') },
      { key: 'harriet', text: 'Harriet would have carried it. She said so because it was true and there was nobody else to say it to.', when: (a) => a.seen('l4_wren_refused') },
      { key: 'the mill', text: (a) => a.has('wren_wall') ? 'Found Bracken inside the mill, in the dry bit. There is a dry bit. There is a wall.' : 'Found Bracken up the mill road and brought him down by the collar. Would not say where. Said Tom would not like it.', when: (a) => a.has('dog_wren') },
      { key: 'the cellar', text: 'Found a box of old board letters behind the barrels in the pub cellar. Some addressed to a Keeper called Wren.', when: (a) => a.seen('l6_wren_box') },
      { key: 'the box', text: (a) => a.has('burned_box') && !a.has('wren_box') ? 'Burned the box. There was another box, same place, same letters, one dated tomorrow.' : 'The letters in the box are warm. Some are signed with your name.', when: (a) => a.seen('l7_wren_read') || a.seen('l7_wren_burned') },
      { key: 'out', text: (a) => a.has('wren_prepositions') ? 'The letters say “i’m sorry i couldn’t get you out.” She thinks out means off the board. Or under it. Or behind. She has been thinking about prepositions.' : 'The letters say “i’m sorry i couldn’t get you out.” She wants to know what out means.', when: (a) => a.seen('l7_wren_read') },
      { key: 'the light', text: 'Can see the light on your face. Writes to you now, not to the Keeper.', when: (a) => a.has('wren_aware') },
      { key: 'your name', text: (a) => a.has('name_real') ? 'Knows your name is real, and is holding on to that.' : 'Thinks you both have made-up names. Nearly a friendship, she says.', when: (a) => a.has('name_real') || a.has('name_made') },
      { key: 'unpinning', text: 'Has asked to be taken off the board. Thinks not being pinned is better than being pinned forever.', when: (a) => a.seen('l10_wren_unpin') },
    ],
    tom: [
      { key: 'low farm', text: 'Low Farm. Widower. Few words, all of them meant.', when: (a) => a.seen('l1_tom') },
      { key: 'the mug', text: 'Makes tea in a white enamel mug with a chip out of the rim. It is the visitors’ mug. There are not many visitors.', when: (a) => a.reached('o_tom_farm') || a.has('went_with_tom') },
      { key: 'bracken', text: (a) => a.has('dog_home') ? 'Bracken: brown collie, white blaze. Home now, but sits at the gate and looks up the road.' : 'Bracken: brown collie, white blaze, answers to his name and not much else. Went up the mill road like he had business there.', when: (a) => a.seen('l1_tom') },
      { key: 'the collar', text: 'Bracken’s collar, on the mill road, a hundred yards short of the gate. The buckle was undone, not broken, and not by a dog.', when: (a) => a.has('found_collar') },
      { key: 'the nod', text: 'Nodded at you across the green. From Tom, that is a speech.', when: (a) => a.has('dog_eye') },
      { key: 'potatoes', text: 'Left a bag of potatoes in the porch with no note. That was the reply.', when: (a) => a.replied('l3_tom_home', 0) },
      { key: 'waiting', text: 'Says Bracken was waiting at the mill. That is the whole of it.', when: (a) => a.has('ask_mill') },
      { key: 'the wall', text: (a) => a.seen('l7_tom_visit') ? 'Names cut into the mill wall, forty-odd. His. Two Keepers. Not yours. And under Harriet’s, a fresh space with nothing in it. Yet.' : 'There are names cut into the mill wall. Forty-odd. His is there. Two Keepers. Yours is not.', when: (a) => a.has('saw_wall') },
      { key: 'not clever', text: 'Says he is not a clever man. He is wrong about that.', when: (a) => a.has('went_with_tom') || a.has('visit_tom') || a.seen('l7_tom_visit') },
      { key: 'howling', text: 'Bracken howls at the mill. Eleven years and he never howled at anything.', when: (a) => a.seen('l5_tom_howls') },
      { key: 'his wife', text: 'His wife has been dead six years. His van was seen by the churchyard on a Thursday.', when: (a) => a.seen('r3_flowers') },
      { key: 'the flowers', text: (a) => a.has('tom_asked_flowers') ? 'Says the flowers are not his. Goes to look on Thursdays, same as everyone. He would know, he says. He would know.' : 'Says the flowers are not him. Says he knows who they are for, and doesn’t. He means both.', when: (a) => a.has('flowers_tom') || a.has('tom_asked_flowers') },
      { key: 'honest', text: 'Prefers “don’t know” to Harriet’s “I know”.', when: (a) => a.has('tom_honest') },
      { key: 'his hand', text: (a) => a.has('tom_hand_seen') ? 'Cut your name into the wall to keep you, then cut it out again. The hand was bandaged by someone who knew how. He says he is not going up again. He is.' : 'Cut your name into the wall to keep you, then cut it out again. Hand bleeding.', when: (a) => a.seen('l9_tom') },
    ],
    edith: [
      { key: 'rose cottage', text: 'Rose Cottage, the far end of the village. Writes letters at least as long as the walk to deliver them.', when: (a) => a.seen('l2_edith') },
      { key: 'remembers', text: 'Remembers everything. Says it as a warning. Tired of it.', when: (a) => a.seen('l2_edith') },
      { key: 'the flowers', text: (a) => a.has('watched_flowers') ? 'Fresh flowers every Thursday on the grave with no stone. You sat at her window and watched. There were flowers at half past nine and nobody brought them.' : 'Fresh flowers every Thursday on the grave with no stone in the north corner. Never a person.', when: (a) => a.seen('l2_edith') },
      { key: 'one thing', text: 'Would like, before she is done, to know one thing about this village she did not already know.', when: (a) => a.seen('l2_edith') },
      { key: 'the family', text: (a) => a.has('edith_name_gone') ? 'Nearly had the name of the family at the north corner. A name like a door closing. It did not come back.' : a.has('stone_facedown') ? 'The Reverend says the stone in the north corner is face down. She has been here longer than any family.' : '“What family, dear? I have been here longer than any family.”', when: (a) => a.has('told_edith_rev') || a.has('stone_facedown') || a.has('edith_name_gone') },
      { key: 'the thimble', text: (a) => a.has('thimble_1961') ? 'Her mother’s silver thimble. Lost in 1961, and again on Wednesday. Came back both times.' : 'Lost her mother’s silver thimble. It came back pinned to the board, from behind.', when: (a) => a.seen('r5_thimble') || a.seen('n4_thimble') },
      { key: 'forty-one', text: (a) => a.has('counted_with_edith') ? 'Keeps a list. Forty-one, and your name at the bottom in pencil, in a hand that is not hers.' : 'Has started counting. Forty-one, not including you. Nobody is born here. Nobody moves in.', when: (a) => a.seen('l6_edith') },
      { key: 'born', text: 'Remembers a mother. Does not remember her face, and she remembers everyone’s face.', when: (a) => a.has('edith_loop') },
      { key: 'tom', text: 'Tom goes to look at the flowers on Thursdays, same as everyone. He says they are not his.', when: (a) => a.has('tom_asked_flowers') },
      { key: 'the diary', text: (a) => a.has('diary_page') ? 'Keeps a diary. She let you read one page. It was dated tomorrow, and it said what you said, and you had not said it yet.' : 'Keeps a diary. Today’s entry was already written, a year ago, in her own hand, and it described you.', when: (a) => a.has('edith_diary') },
      { key: 'sooner', text: '“Edith, next time, tell me sooner.” You said that. Last time.', when: (a) => a.has('edith_last') },
      { key: 'the card', text: (a) => a.has('read_card') ? 'The card on the flowers says “For the Keeper.” Three names, three inks. The third is wet.' : 'There is a card on the flowers. There has always been a card. She wants you to read it.', when: (a) => a.seen('l9_edith') },
      { key: 'unwell', text: 'You suggested she might be unwell. She said it would be a comfort.', when: (a) => a.has('edith_dismissed') },
    ],
    sam: [
      { key: 'the bench', text: 'Marion mentions it every time you go in: the doctor takes dinner on the bench on the green at one, alone, with a broken-backed paperback and a prescription slip for a bookmark. She says it in the tone of a woman who thinks a doctor should eat indoors.', when: (a) => a.day >= 2 },
      { key: 'the surgery', text: 'The surgery, eighteen months in. Precise, private. Tuesday and Thursday mornings, 8.30 to 11. There is a form.', when: (a) => a.seen('n3_sam_hours') || a.seen('l3_sam_thanks') },
      { key: 'the reference', text: 'Wrote Wren’s reference. Said she is sensible. It is true.', when: (a) => a.seen('l3_sam_thanks') },
      { key: 'the records', text: 'Wants Mrs Vale’s records of the board, to compare some dates, for a reason best explained in person.', when: (a) => a.seen('l3_sam_thanks') || a.has('met_sam') },
      { key: 'the bundle', text: (a) => a.has('bundle_taken') ? 'A bundle of letters from down the back of the board, tied with string. The knots were yours. You put it back where it was.' : 'Found a bundle of letters tied with string down the back of the board frame. Did not open it. Top drawer at the surgery, for you.', when: (a) => a.seen('l5_sam_bundle') },
      { key: 'the dates', text: (a) => a.has('sam_hinted') ? 'Four patients whose register birth dates are exactly forty-one years before their cards. One of them runs a shop. Sam should not have said.' : 'Four patients whose register birth dates are exactly forty-one years before their medical cards. Not roughly.', when: (a) => a.seen('l5_sam_bundle') || a.seen('l5_sam_waiting') },
      { key: 'the key', text: 'Has a key to the church. Does not say how.', when: (a) => a.has('sam_register') },
      { key: 'the register', text: 'Forty-one names, three times over, in the same hand. A column headed Keepers: Dunstan, Vale, and a blank third line with the ink wet beside it.', when: (a) => a.seen('l7_sam_names') || a.has('sam_late') },
      { key: 'left it', text: 'Left the matter of the register, as asked. Wanted it on the board that a person saw something and was told not to look, and didn’t.', when: (a) => a.seen('l7_sam_left') },
      { key: 'the ash', text: (a) => a.has('sam_thermometer') ? 'Says the ash is wood ash, recent, elm if you want a guess. Has a thermometer for the board and has not used it. Does not want the number.' : 'Says the ash is wood ash, recent. The mill has not had a fire in forty years.', when: (a) => a.has('ash_sam') },
      { key: 'the road', text: (a) => a.has('drove_with_sam') ? 'The road out goes past the mill, and then past the mill. You sat in the car for two hours as a witness.' : 'Drove for two hours. The road past the mill goes past the mill. The fuel gauge did not move.', when: (a) => a.seen('l9_sam_stuck') },
      { key: 'we', text: 'You said “we”. Sam noticed.', when: (a) => a.has('sam_stay') },
      { key: 'walked', text: 'Walked, with Bracken. Touched the road past the mill. It was warm, and it was paper.', when: (a) => a.has('sam_walk') && a.seen('l10_sam') },
      { key: 'i was here', text: 'Wants “I was here” on the board, in case the board is the only place that counts.', when: (a) => a.has('sam_here') },
    ],
  };

  // ---- leaving a note of your own.
  // Once a thing is written on somebody's page, you can put a note about it in their pigeonhole:
  // your own words, in your own hand, about a thing nobody asked you about. It goes out with the
  // van and it is on the board the morning after, answered.
  //   noteReplies[who][key]  — the reply to a note about that keyword
  //   noteReplies[who]['*']  — the ones for everything else; which one depends on the day you wrote
  // Each is { subject, body, sign }. `body` may be a function of the api.
  const noteReplies = {
    marion: {
      harriet: { subject: 'You have been asking', sign: 'Marion',
        body: 'You did not have to write it down, love. You could have leaned over the counter like everybody else does.\n\nBut you wrote it down, so I will: yes, I was fond of her. She had your desk and she had your way of standing at it. She went up the mill road on the Tuesday and she was gone by the Friday and there was no leaving do, because there is never a leaving do, and I have only this minute noticed that.\n\nCome for your tea.' },
      cat: { subject: 'Mrs Bishop, since you ask', sign: 'M.',
        body: 'She is not a talking point, she is a cat, and I will thank you to keep her out of the official records.\n\nShe turned up. Eleven years ago now, out of the rain, and I put a saucer down, which is how they get you. She sat on your note while I was reading it. I have enclosed a hair as proof.' },
      dunstan: { subject: 'What you wrote about Dunstan', sign: 'M.',
        body: 'I read your note twice and then I sat down with it, which is not what I do with notes.\n\nYou have written down more about that man than I could tell you, and you never met him. I knew him eleven years. Where has it gone, {{name}}? Where does it go?\n\nDo not answer that on paper. Come round.' },
      'fifty-one': { subject: 'Your note', sign: 'Mrs M. Tebbutt',
        body: 'I have had it. I have put it in the drawer under the till, with the things I am not dealing with today.\n\nI am fifty-one. I have a card that says so, and a shop, and a cat, and a kettle that boils. You will find, when you have been here as long as I have, that a boiling kettle settles most of it.\n\nI am not cross with you. I should like that written down somewhere as well.' },
      '*': [
        { subject: 'Your note', sign: 'M.',
          body: 'Well, this is a novelty: post from next door. You could have knocked.\n\nI have read it twice and told nobody, which for me is a religious observance. You notice things, {{name}}. Harriet noticed things. I would rather you noticed them out loud, at four, with a biscuit.' },
        { subject: 'Since you put it in writing', sign: 'Marion',
          body: 'You are the first postmaster in my time to write to me about anything that was not a parcel.\n\nI am keeping the note. Not for any reason. I keep things.' },
        { subject: 'Read at the counter', sign: 'M.',
          body: 'I read it standing up with a queue of one behind me, and the one behind me asked what it was, and I said it was nothing, and off she went to tell everybody it was nothing.\n\nThat is the shop for you. Write again.' },
      ],
    },
    penry: {
      'the north corner': { subject: 'Your note, on the north corner', sign: 'A. Penry',
        body: 'Thank you for writing rather than asking. A written question may be answered slowly, which is the only way I am able to answer this one.\n\nYou are right that I have not told you everything. I would ask you to believe that what I have kept back is kept back out of kindness, and to allow that a man may be wrong about what is kind and still be trying.\n\nCall at the vestry. Not at the church.' },
      'the lamp': { subject: 'On the lamp', sign: 'A.P.',
        body: 'A fair thing to have noticed, and a kind way of raising it.\n\nI leave it burning because the room is easier to go into in the morning if it was never dark. That is superstition. I am aware of the fact, and I light it anyway. You may put that in your book.' },
      chairs: { subject: 'The chairs', sign: 'A. Penry',
        body: 'I read your note in the vestry, which was a mistake, because there was nowhere in that room to put it down afterwards.\n\nI set them out because they were set out for me, once, before I understood what the setting out was for. I do not think I am permitted to stop. I have never tried, which is the honest answer, and it is your note that has made me notice I have never tried.' },
      'the register': { subject: 'The register, and your note about it', sign: 'The Reverend A. Penry',
        body: 'A parish register is a record of a parish. It is not a record of the truth. I have said that to a doctor, and now I am writing it to a postmaster, and I notice that I say it faster each time.\n\nWrite to me again. I would far rather it came to the vestry than to the board.' },
      '*': [
        { subject: 'Your note', sign: 'A. Penry',
          body: 'I have your note. It is a strange thing to be written to by the person who brings the writing.\n\nYou are attending. Attention is a form of care, and I have had very little of either directed at me in some years. Thank you.' },
        { subject: 'Received, and read twice', sign: 'A.P.',
          body: 'It came in the second post, which does not exist. I have decided not to pursue that this week.\n\nWhat you wrote was kindly meant and I have taken it kindly. The vestry is open in the afternoons.' },
        { subject: 'A reply, of sorts', sign: 'A. Penry',
          body: 'I find I have no answer for you, and I find that I would rather write that down than leave your note unanswered.\n\nThat is not much of a reply. It is the true one.' },
      ],
    },
    wren: {
      'the course': { subject: 'ok so', sign: 'w',
        body: 'you wrote it down. on paper. with my name on the front of it.\n\nanyone could have read that. marion could have read that. i know you sorted it yourself. i know. i know.\n\nalso nobody has ever written me a letter that wasn’t a bill so it is under the crisps with the other one now. thanks. don’t make it weird.' },
      'the city': { subject: 're: your note', sign: 'w',
        body: 'you remembered the bus thing.\n\nthat’s the whole reply. you remembered the bus thing and you wrote it down like it was a real thing a person is allowed to want.\n\nit is a real thing a person is allowed to want.' },
      'the mill': { subject: 'don’t', sign: 'w',
        body: 'got your note, put it straight in my pocket, then read it in the cellar, which is stupid, i know where i was, i heard myself doing it.\n\nyou’re allowed to ask me about the mill. just ask me at the bar at six when there’s people in. not on paper, where it sits there all night saying it.' },
      out: { subject: 'prepositions', sign: 'w',
        body: 'been thinking about your note the whole shift.\n\nout. off. under. behind. you can be out of a village or out of a job or out of a story and they’re all different and not one of them is on the bus timetable.\n\nsorry. that’s not a reply. come to the fox.' },
      '*': [
        { subject: 'got your note', sign: 'w',
          body: 'nobody writes to me. you’d know, you’re the postmaster.\n\nanyway. got it. read it twice. under the crisps it goes.' },
        { subject: 'ok', sign: 'w',
          body: 'you didn’t have to write that down.\n\nglad you did though. it’s different written. it stays where you put it.' },
        { subject: 're:', sign: 'w',
          body: 'read it behind the bar with my back to the room like a criminal.\n\nyeah. that’s about right. come in when it’s quiet and i’ll say the rest out loud. maybe.' },
      ],
    },
    tom: {
      bracken: { subject: 'The dog', sign: 'T. Ferrier',
        body: 'You wrote to me about the dog.\n\nHe come to the gate at five like he does. Sat. Looked up the road. I looked with him a while.\n\nI don’t know what you want me to say back except he is a good dog and he is mine and he was gone, and now it is written down twice, once by you and once by me, and that seems to help. I couldn’t tell you why.\n\nThank you for the note. Nobody writes about the dog.' },
      'the mug': { subject: 'The mug', sign: 'T.F.',
        body: 'Aye. It was my wife’s mother’s and it is a poor mug, goes cold in five minutes.\n\nI keep it out for whoever comes up. You’d have it, if you come up.' },
      'the wall': { subject: 'The wall', sign: 'T.',
        body: 'I’d rather you hadn’t written that down.\n\nBut you have, and you sent it to me and not to anybody else, and that is fair dealing, so I’ll answer it. It is a wall with names on. I put mine on it at nineteen, because that is a thing you do at nineteen.\n\nDon’t put yours on it.' },
      'the flowers': { subject: 'No', sign: 'T. Ferrier',
        body: 'No.\n\nI have said it and now I have written it, seeing as you put it in writing. They are not mine. I go and look on a Thursday because everybody goes and looks on a Thursday.\n\nI’m not cross. It is a fair question and you asked it the quiet way.' },
      '*': [
        { subject: 'Your note', sign: 'T. Ferrier',
          body: 'Got it.\n\nRead it at the gate. Read it twice. That is a lot of reading, for me.\n\nIt was decent of you.' },
        { subject: '', sign: 'T.',
          body: 'Aye.\n\nI’m not much for writing back. This is me writing back.' },
        { subject: '', sign: 'T. Ferrier',
          body: 'Your note come up with the feed bill. I have kept the note and paid the bill.\n\nThat is the order I did them in, and all.' },
      ],
    },
    edith: {
      'the flowers': { subject: 'Your kind note, and the north corner', sign: 'Edith Marlow',
        body: 'My dear, what a thing: to be written to by the post office, rather than merely through it.\n\nYou have set down in four lines what I have been going round the houses about for a fortnight. Thursday. No stone. No person. I read it at the window, which is where I read everything, and the window is where the trouble is.\n\nCome and sit in it with me. Bring nothing. I have too much of everything.' },
      'the thimble': { subject: 'The thimble, and being remembered', sign: 'E.M.',
        body: 'It is on my finger as I write this, which is a small piece of theatre for your benefit, and I am eighty-something and entitled to it.\n\nYou wrote it down. That is the part I wish to answer. Nobody writes things down about an old woman except doctors, and they write down the wrong things. You have written down a thimble.\n\nYour note is in the drawer with its box, where I shall come across it again and be pleased twice.' },
      'forty-one': { subject: 'Forty-one, and your note about it', sign: 'Edith Marlow',
        body: 'So you have been counting too. I thought you might be. There is a way a person stands at a board when they are counting.\n\nI shall tell you the part I left out of the letter, since you have been brave enough to put it in a note: I do not mind the number. I mind that in all these years nobody else has ever asked me for it.\n\nYou asked. Thank you, dear. Come on Thursday.' },
      'the diary': { subject: 'On diaries', sign: 'E.M.',
        body: 'Your note is on the table beside the diary, and I have spent the best part of an hour looking from one to the other, like a woman comparing two photographs of the same face.\n\nI shall not tell you whether it is in there. You would only ask when it was written.' },
      '*': [
        { subject: 'A note, from you, to me', sign: 'Edith Marlow',
          body: 'How pleasant. How very pleasant. Do you know that it is fourteen years since anybody in this village sent me anything that was not printed?\n\nI have answered at once, which is unbecoming, and I do not care in the least. Write again, dear. I shall keep them in order.' },
        { subject: 'Read at the window', sign: 'E.M.',
          body: 'I read it at the window with the light going, and put it down, and picked it up again, which in this house is the highest compliment a letter receives.\n\nYou pay attention. That is rarer here than you would think, and it is not nothing.' },
        { subject: 'Your note', sign: 'Edith Marlow',
          body: 'You will find, if you keep this up, that I answer every one of them at four times the length. That is the arrangement. That has always been the arrangement.\n\nBut thank you. It is a good thing to be written to by somebody who is not asking me for anything.' },
      ],
    },
    sam: {
      'the bench': { subject: 'Re: your note', sign: 'S. Okafor',
        body: 'You have described my lunch hour more accurately than I could, which is unsettling and, I concede, entirely reasonable: I eat it in public, on a bench, in the middle of a village of forty-one people.\n\nI had assumed nobody was looking. That was not a clinical assessment. That was a hope.\n\nThe bench seats two.' },
      'the dates': { subject: 'Please keep this note', sign: 'Dr S. Okafor',
        body: 'I am replying in writing deliberately. If I say any of this aloud in this village it is gossip within the hour; if I write it to you it is a record.\n\nWhat you set down is accurate. I checked it again this morning against a different copy and it was accurate again. Four patients. Exactly forty-one years. Not approximately.\n\nDo not carry it any further than your own book. I mean that as a colleague, and I notice that I have just called you a colleague.' },
      'the register': { subject: 'The register', sign: 'S.O.',
        body: 'Thank you for the note. It arrived, incidentally, before the post did, which I shall take up with you at some later and calmer date.\n\nYou have written down what I saw. I have read your version and it is the same as mine, and that is the first time this month that two accounts of anything in Ashfield have agreed.\n\nIt helps. I did not expect it to help.' },
      'the road': { subject: 'On the road out', sign: 'Dr S. Okafor',
        body: 'Your note is pinned above my desk, which is where I keep the things I intend to disprove.\n\nI have not disproved it. The fuel gauge is the detail I cannot get past. The rest could be tiredness, and I would very much like the rest to be tiredness.\n\nNext time, come in the car.' },
      '*': [
        { subject: 'Acknowledged', sign: 'S. Okafor',
          body: 'Thank you for putting it in writing. I have a professional weakness for things in writing: they can be checked, and they hold still.\n\nI have filed it. I file everything. It is either rigour or a symptom.' },
        { subject: 'Re: your note', sign: 'Dr S. Okafor',
          body: 'Received and read. I have no correction to offer, which from me is a warm review.\n\nI would rather hear the rest in person, at the surgery, where I can write it down properly.' },
        { subject: 'A short reply', sign: 'S.O.',
          body: 'You noticed something and wrote it to exactly one person. That is good practice, and rarer than it ought to be.\n\nKeep doing it. Keep doing it to me.' },
      ],
    },
  };

  // ---- reaching out. Things you can do without waiting to be written to.
  // One a day, and only for somebody you have already written back to.
  const outreach = [
    // marion
    { id: 'o_marion_tea', who: 'marion', kind: 'visit', text: 'Call in for tea at four', repeat: 3,
      when: (a) => a.knows('marion', 'tea') || a.knows('marion', 'shop') && a.day >= 3,
      plans: [{ at: 'shopflat', hour: 16, doing: 'tea, above the shop', with: 'you' }],
      effects: { trust: { marion: 1 } },
      outcome: (a) => a.trust('marion') < 0 ? 'The kettle is on. It is always on. She pours, and talks to the cat instead of you, and the cat is very interested.' : 'Four o’clock, above the shop. The cat inspects you and finds you adequate. Marion talks for forty minutes and tells you nothing, which is a skill.' },
    { id: 'o_marion_pencil', who: 'marion', kind: 'ask', text: 'Ask about Harriet’s pencil note on the back of the board',
      when: (a) => a.knows('marion', 'pencil'),
      effects: { trust: { marion: 1 }, flags: ['pencil_wont'] },
      outcome: 'You go round the back of the board with a torch, as far as a screwed frame allows. There is pencil. You can read one word of it: won’t. The rest is under the frame.\n\nMarion, when you tell her, says: “Well. That’s the half I knew.”' },
    { id: 'o_marion_dunstan', who: 'marion', kind: 'ask', text: 'Ask what Dunstan was like',
      when: (a) => a.knows('marion', 'dunstan'),
      effects: { flags: ['dunstan_faded'] },
      outcome: 'She thinks about it with both hands flat on the counter. “Tall. Or short. He liked the rain, or he didn’t.” She stops. “I knew him eleven years, love. I’m telling you what I’ve got.”' },
    { id: 'o_marion_light', who: 'marion', kind: 'ask', text: 'Compare diaries: what day does Marion think it is?',
      when: (a) => a.knows('marion', 'light') && a.has('diary'),
      effects: { trust: { marion: 1 }, flags: ['compared_diaries'] },
      outcome: '“Sunday,” she says, without looking up. Then she looks up. “That’s what you’ve got written down too, isn’t it. Well. One of us is right, and it won’t help.”' },
    { id: 'o_marion_cat', who: 'marion', kind: 'ask', text: 'Ask about the cat',
      when: (a) => a.knows('marion', 'cat'),
      effects: { flags: ['cat_named'] },
      outcome: 'The cat is called Mrs Bishop, after nobody. “She turned up,” Marion says. “Things do. Eleven years and never a day older, and I said nothing, and now look.”' },
    { id: 'o_marion_floor', who: 'marion', kind: 'visit', text: 'Sit with her behind the counter',
      when: (a) => a.knows('marion', 'fifty-one') && a.day >= 8,
      effects: { trust: { marion: 2 }, flags: ['sat_with_marion'] },
      outcome: 'You go round the counter, which nobody does, and sit on the floor where she sat. She sits too. Neither of you says fifty-one. The shop bell goes and neither of you gets up.' },

    // penry
    { id: 'o_penry_evensong', who: 'penry', kind: 'visit', text: 'Go to Evensong', repeat: 3,
      when: (a) => a.day >= 2 && !a.seen('n10_evensong') && a.day !== 11,
      plans: [{ at: 'church', hour: 18, doing: 'Evensong, with you in the third pew', with: 'you' }],
      effects: { trust: { penry: 1 }, flags: ['evensong_went'] },
      outcome: 'Six o’clock. Eleven people and you. The Reverend reads the names of the departed, and there is a pause after the last one that goes on a beat too long, as if he were waiting for someone to answer.' },
    { id: 'o_penry_north', who: 'penry', kind: 'ask', text: 'Ask him about the grave in the north corner',
      when: (a) => a.knows('penry', 'the north corner') || (a.knows('edith', 'the flowers') && a.day >= 3),
      effects: { flags: ['stone_facedown'] },
      outcome: 'He receives you in the porch of St Anne’s, not the vestry. “There is a stone,” he says, at last. “It is face down. That was also asked for.” He does not say by whom, and you find you do not ask.' },
    { id: 'o_penry_lamp', who: 'penry', kind: 'ask', text: 'Ask why the vestry lamp is on all night',
      when: (a) => a.knows('penry', 'the lamp'),
      effects: { trust: { penry: 1 }, flags: ['rev_reading'] },
      outcome: '“Because I cannot read in the dark,” he says, which is an answer, and then, because he is not a man who leaves an answer at that: “And because I have not finished. I do not think it can be finished.”' },
    { id: 'o_penry_chairs', who: 'penry', kind: 'ask', text: 'Ask about the chairs',
      when: (a) => a.knows('penry', 'chairs') && !a.has('stop_chairs'),
      effects: { flags: ['chairs_worn'] },
      outcome: 'He shows you the stack in the hall. Four chairs are worn at the arms in a way the others are not. “I do not move them,” he says. “I set them, and they come back worn.”' },
    { id: 'o_penry_key', who: 'penry', kind: 'ask', text: 'Ask for the key to the church',
      when: (a) => a.knows('penry', 'the key') && !a.has('sam_register'),
      effects: { flags: ['key_refused'] },
      outcome: '“No,” he says, kindly, and then: “I am sorry. That is the first time I have said it to a postmaster, and I find it does not get easier.” You have not asked twice. He is not counting you.' },

    // wren
    { id: 'o_wren_bar', who: 'wren', kind: 'visit', text: 'Sit at the bar at the Fox', repeat: 3,
      when: (a) => a.knows('wren', 'the fox'),
      plans: [{ at: 'fox', hour: 20, doing: 'the evening shift; you at the end of the bar', with: 'you' }],
      effects: (a) => { if (a.trust('wren') >= 0) a.addTrust('wren', 1); },
      outcome: (a) => a.trust('wren') >= 1 ? 'She pulls you a half without asking what you want, which is how the Fox tells you it has decided about you. “don’t look at the cellar door,” she says. “everyone looks at the cellar door.”' : 'She serves you and goes to the other end of the bar and stays there. Somebody else’s dog sits on your foot for an hour.' },
    { id: 'o_wren_course', who: 'wren', kind: 'ask', text: 'Ask how the course application is going',
      when: (a) => a.knows('wren', 'the course') && a.day >= 4,
      effects: (a) => { a.addTrust('wren', a.has('wren_ref') ? 1 : -1); a.setFlag('asked_course'); },
      outcome: (a) => a.has('wren_ref') ? 'She has the form behind the bar, under the crisps. “sent it. haven’t told anyone. except you, now, so don’t.”' : '“what course,” she says, and pulls a pint for nobody, and lets it stand.' },
    { id: 'o_wren_cellar', who: 'wren', kind: 'visit', text: 'Ask to see the cellar',
      when: (a) => a.knows('wren', 'the cellar'),
      effects: { flags: ['cellar_visited'] },
      outcome: (a) => a.has('burned_box') && !a.has('wren_box') ? 'She takes you down. Behind the barrels there is a scorch mark on the floor, and a box on it, dry and unburned. “yeah,” she says.' : 'You go down again. The box is where it was. It is warmer than it was. There is one more letter on top than there was, and you do not count them to make sure, because you are sure.' },
    { id: 'o_wren_mill', who: 'wren', kind: 'ask', text: 'Ask where she found Bracken',
      when: (a) => a.knows('wren', 'the mill'),
      effects: { flags: ['wren_wall'] },
      outcome: (a) => '“inside,” she says. “in the dry bit. there’s a dry bit. and there’s a wall.” She looks at you to see if you know about the wall. ' + (a.has('saw_wall') ? 'You do, and she can tell, and she nods.' : 'You don’t, and she can tell, and she says “ok” and does not say any more.') },
    { id: 'o_wren_out', who: 'wren', kind: 'ask', text: 'Ask what she thinks “out” means',
      when: (a) => a.knows('wren', 'out'),
      effects: { trust: { wren: 1 }, flags: ['wren_prepositions'] },
      outcome: '“off the board,” she says, straight away, like she has been waiting. “or under it. or behind. i’ve been thinking about prepositions. it’s a bad sign when you start thinking about prepositions.”' },
    { id: 'o_wren_city', who: 'wren', kind: 'ask', text: 'Ask what she wants from the city',
      when: (a) => a.knows('wren', 'the city'),
      effects: { trust: { wren: 1 }, flags: ['wren_timetable'] },
      outcome: '“a bus timetable,” she says. “a real one. with a bus on it that goes somewhere and then comes back a different way.”' },

    // tom
    { id: 'o_tom_farm', who: 'tom', kind: 'visit', text: 'Walk up to Low Farm', repeat: 3,
      when: (a) => a.knows('tom', 'low farm'),
      plans: [{ at: 'lowfarm', hour: 17, doing: 'the yard; tea in a chipped mug, if you come', with: 'you' }],
      effects: { trust: { tom: 1 } },
      outcome: (a) => a.has('dog_home') ? 'Bracken meets you at the gate and walks you up, close to your leg, like a man showing you into a room. Tom gives you tea in a mug with a chip in it and says four words, one of which is your name.' : 'The gate is shut. Tom is in the yard and lifts a hand. He does not come over. It is not unfriendly; it is Tom.' },
    { id: 'o_tom_dog', who: 'tom', kind: 'ask', text: 'Ask after Bracken',
      when: (a) => a.knows('tom', 'bracken') && a.day >= 3,
      effects: { trust: { tom: 1 } },
      outcome: (a) => a.has('dog_home') ? '“Sits at the gate,” Tom says. “Looks up the road. I look with him, some nights. Neither of us knows what for.”' : '“No sign.” He does not say anything else, and you understand that the not saying is most of it.' },
    { id: 'o_tom_search', who: 'tom', kind: 'visit', text: 'Walk up the mill road yourself and look for the dog',
      when: (a) => a.knows('tom', 'bracken') && !a.has('dog_home') && !a.has('found_collar') && a.day >= 2,
      plans: [{ at: 'millroad', hour: 18, doing: 'the mill road, calling a dog’s name up it', with: 'you' }],
      effects: { trust: { tom: 1 }, flags: ['found_collar'] },
      outcome: 'You shut the office at five and walk up. It is further than it looks from the porch, and quieter, and the quiet has a shape to it.\n\nYou do not find a dog. A hundred yards short of the gate, in the grass on the left, you find his collar: brown leather, worn pale where a thumb goes, with his name on the tag.\n\nThe buckle is undone. Not snapped, not chewed through. Undone, the way you would undo it, with two hands.' },

    { id: 'o_tom_wall', who: 'tom', kind: 'ask', text: 'Ask about the names on the wall',
      when: (a) => a.knows('tom', 'the wall'),
      effects: { trust: { tom: 1 }, flags: ['tom_wall_talk'] },
      outcome: 'He tells you what he can. Forty-odd names, in an old hand and a newer one, and the newer one is the same hand. “Two of them are Keepers,” he says. “I looked for a third. There’s a space.” He shows you with his thumb the size of the space. It is the size of a name.' },
    { id: 'o_tom_flowers', who: 'tom', kind: 'ask', text: 'Ask, quietly, whether the flowers are his',
      when: (a) => a.knows('tom', 'his wife') || a.knows('tom', 'the flowers'),
      effects: { flags: ['tom_asked_flowers'] },
      outcome: '“No.” He says it before you finish. Then, after a while: “I go and look, Thursdays. Same as everyone. I’d know if they were mine.” He looks at his hands. “I’d know.”' },
    { id: 'o_tom_hand', who: 'tom', kind: 'visit', text: 'Go and look at his hand',
      when: (a) => a.knows('tom', 'his hand'),
      effects: { trust: { tom: 1 }, flags: ['tom_hand_seen'] },
      outcome: 'He shows you. The cut is across the palm, clean, the way a chisel slips. It has been bandaged by someone who knew how. “Doctor,” he says. “Didn’t ask. Good lad.” Then: “It’s back on the wall. I’m not going up again.” He is.' },

    // edith
    { id: 'o_edith_visit', who: 'edith', kind: 'visit', text: 'Walk to Rose Cottage', repeat: 3,
      when: (a) => a.knows('edith', 'rose cottage'),
      plans: [{ at: 'rose', hour: 15, doing: 'the kettle on before you knock', with: 'you' }],
      effects: { trust: { edith: 1 } },
      outcome: 'The walk is as long as her letters. She has the kettle on before you knock, and says so, and says that is not the strange part.' },
    { id: 'o_edith_window', who: 'edith', kind: 'visit', text: 'Sit at her window this Thursday and watch the north corner',
      when: (a) => a.knows('edith', 'the flowers') && a.week === 'Thursday' && !a.has('watched_flowers'),
      plans: [{ at: 'rose', hour: 7, to: 10, doing: 'her window, with you, watching the north corner', with: 'you' }],
      effects: { trust: { edith: 2 }, flags: ['watched_flowers'] },
      outcome: 'You sit with her from seven. At half past nine there are flowers. Neither of you saw anyone. Neither of you looked away.\n\n“Well,” she says. “Now there are two of us.”' },
    { id: 'o_edith_count', who: 'edith', kind: 'ask', text: 'Count the village with her',
      when: (a) => a.knows('edith', 'forty-one'),
      effects: { trust: { edith: 1 }, flags: ['counted_with_edith'] },
      outcome: 'She has a list. You read it while she reads it aloud. Forty-one. Your name is at the bottom, in pencil, in a different hand, and she says she did not write it, and you believe her.' },
    { id: 'o_edith_diary', who: 'edith', kind: 'ask', text: 'Ask to read the diary',
      when: (a) => a.knows('edith', 'the diary'),
      effects: { flags: ['diary_page'] },
      outcome: '“No,” she says, kindly, and then: “Yes. One page.” It is dated tomorrow. It says you called. It says what you said. You have not said it yet, and now you will not be able to help it.' },
    { id: 'o_edith_thimble', who: 'edith', kind: 'ask', text: 'Ask about the thimble',
      when: (a) => a.knows('edith', 'the thimble'),
      effects: { trust: { edith: 1 }, flags: ['thimble_1961'] },
      outcome: 'She shows you it, on her finger. “My mother’s,” she says. “I lost it in 1961, dear, and again on Wednesday, and it came back both times. I did not put the first part in the letter. It sounds mad in a letter.”' },
    { id: 'o_edith_family', who: 'edith', kind: 'ask', text: 'Ask what family the north corner grave belongs to',
      when: (a) => a.knows('edith', 'the family') && !a.has('edith_name_gone'),
      effects: { flags: ['edith_name_gone'] },
      outcome: 'She goes very still. “I was going to say the name,” she says. “I had it. It was a name like a door closing.” She does not get it back. You sit with her until she stops trying.' },

    // sam
    { id: 'o_sam_form', who: 'sam', kind: 'visit', text: 'Call in at the surgery', repeat: 3,
      when: (a) => a.knows('sam', 'the surgery') && (a.week === 'Tuesday' || a.week === 'Thursday'),
      plans: [{ at: 'surgery', hour: 9, doing: 'surgery; a form with your name on it', with: 'you' }],
      effects: { trust: { sam: 1 } },
      outcome: 'There is a form. There is always a form. Sam fills in the date and pauses over it, and writes Thursday, and then looks at you as though you might disagree.' },
    { id: 'o_sam_bundle', who: 'sam', kind: 'visit', text: 'Collect the bundle from the surgery drawer',
      when: (a) => a.knows('sam', 'the bundle'),
      effects: { trust: { sam: 1 }, flags: ['bundle_taken'] },
      outcome: 'The top drawer. A bundle tied with string, and the string is new, and the knots are yours: the knot you tie. You do not untie it. You put it back behind the board, where it was, and you feel it settle.' },
    { id: 'o_sam_dates', who: 'sam', kind: 'ask', text: 'Ask which four patients',
      when: (a) => a.knows('sam', 'the dates'),
      effects: { flags: ['sam_hinted'] },
      outcome: '“I can’t tell you that.” Then, because Sam is honest to a fault: “One of them runs a shop.” Then: “I should not have said that. Please carry that nowhere.”' },
    { id: 'o_sam_drive', who: 'sam', kind: 'visit', text: 'Go for the drive with Sam',
      when: (a) => a.knows('sam', 'the road'),
      plans: [{ at: 'road', hour: 14, doing: 'the road out, twice, with you in the passenger seat', with: 'you' }],
      effects: { trust: { sam: 2 }, flags: ['drove_with_sam'] },
      outcome: 'Two hours. The mill goes past on the left, and then on the left. Sam does not speak. On the way back, which is the same way, Sam says: “Thank you for being in the car. I wanted a witness.”' },
    { id: 'o_sam_ash', who: 'sam', kind: 'ask', text: 'Ask what Sam makes of the ash letters',
      when: (a) => a.knows('sam', 'the ash'),
      effects: { trust: { sam: 1 }, flags: ['sam_thermometer'] },
      outcome: '“Wood ash. Recent. Elm, if you want my guess, and there has been no elm here since the disease.” Sam looks at the board. “It is warm. I have a thermometer. I have not used it. I do not want the number.”' },
  ];


  // ---- the lost and found box, under the desk.
  // Things turn up. Work out whose they are from the address book, and give them back.
  //   owner  — the villager key, or null for the ones that are not anybody's
  //   hints  — { who, key } pairs. A hint only shows once that note is in your book,
  //            and it shows the note without the name, which is the whole puzzle.
  //   keep   — if present, "keep it" is an ending for that object rather than a shrug
  const lost = [
    { id: 'lf_mug', day: 2,
      what: 'A white enamel mug, chipped at the rim',
      detail: 'On the counter on Tuesday, cold tea still in it. The handle has been mended with wire, by someone who mends things rather than replaces them. Nobody saw it put down.',
      owner: 'tom',
      hints: [{ who: 'tom', key: 'the mug' }, { who: 'tom', key: 'low farm' }, { who: 'tom', key: 'potatoes' }],
      right: { effects: { trust: { tom: 1 }, flags: ['lf_mug_home'] },
        outcome: 'Tom turns it over twice. “That’s the visitors’ mug,” he says, and then, having heard himself: “There’s not many visitors.” It goes back on the shelf by the kettle, and the next time you are up there, you get it.' } },

    { id: 'lf_glasses', day: 3,
      what: 'A spectacle case, tartan, with a receipt folded inside',
      detail: 'The receipt is from the shop, so that is no help; everything in Ashfield is from the shop. It is for a quarter of something and a box of matches, and on the back somebody has written a list of four names and crossed three of them out.',
      owner: 'marion',
      hints: [{ who: 'marion', key: 'shop' }, { who: 'marion', key: 'chairs' }],
      right: { effects: { trust: { marion: 1 }, flags: ['lf_glasses_home'] },
        outcome: '“Oh, these,” Marion says, and puts them straight on, and reads your face with them. She takes the receipt out first and puts it in her apron without looking at it, which is how you know she knows what is written on the back.' } },

    { id: 'lf_thimble', day: 4,
      what: 'A silver thimble, worn thin at the crown',
      detail: 'Warm, which you decide not to think about. There is a monogram inside, rubbed nearly flat: an M, or a W upside down.',
      owner: 'edith',
      hints: [{ who: 'edith', key: 'the thimble' }, { who: 'edith', key: 'rose cottage' }, { who: 'edith', key: 'remembers' }],
      right: { effects: { trust: { edith: 1 }, flags: ['lf_thimble_home', 'thimble_returned'] },
        outcome: 'She puts it on her finger without being asked which finger. “My mother’s,” she says. “It has been lost twice and come back twice, dear, and both times by way of somebody kind. I have decided that is the rule.”' },
      wrong: 'They hold it up, and turn it, and give it back. “That’s a lady’s,” they say, “and an old lady’s,” and you feel every year of your carelessness.' },

    { id: 'lf_book', day: 5,
      what: 'A paperback, spine broken, a prescription slip for a bookmark',
      detail: 'The slip is blank except for a date, and the date is a Thursday. The book is about the great cathedrals and has been read as far as page ninety, three separate times, on the evidence of the creases.',
      owner: 'sam',
      hints: [{ who: 'sam', key: 'the bench' }, { who: 'sam', key: 'the surgery' }],
      right: { effects: { trust: { sam: 1 }, flags: ['lf_book_home'] },
        outcome: '“The bench,” Sam says. “I put it down to eat and I put it down again to think, and one of those was a mistake.” Then, looking at the bookmark: “I have written that date on four forms this week. It is not this week’s date.”' } },

    { id: 'lf_timetable', day: 6,
      what: 'A bus timetable, folded to one column, annotated in biro',
      detail: 'The 8.10 has been circled so many times the paper has gone furry. Beside it, in small letters: *goes*. Beside the 6.40 back: *comes back the same way. always the same way.*',
      owner: 'wren',
      hints: [{ who: 'wren', key: 'the city' }, { who: 'wren', key: 'the fox' }, { who: 'wren', key: 'the course' }],
      right: { effects: { trust: { wren: 2 }, flags: ['lf_timetable_home'] },
        outcome: '“don’t,” she says, before you’ve said anything, and takes it, and puts it under the crisps. Then: “thanks. i mean it. i wrote on it, so i can’t say it isn’t mine.”' },
      wrong: 'They look at the biro, and at you, and hand it back with the particular gentleness of somebody who has worked out whose it is and would rather you did too.' },

    { id: 'lf_key', day: 7,
      what: 'A key on a loop of grey string',
      detail: 'Long, iron, and cold in a room that is not cold. The ward at the end is cut in the shape of a cross, which narrows it down, and there is a smear of lamp oil on the string, which narrows it further.',
      owner: 'penry',
      hints: [{ who: 'penry', key: 'the key' }, { who: 'penry', key: 'first' }, { who: 'penry', key: 'the lamp' }],
      right: { effects: { trust: { penry: 1 }, flags: ['lf_key_home'] },
        outcome: 'He takes it in both hands. “I did not know it was gone,” he says, which is not the same as thank you, and then he says thank you. That evening the vestry lamp is on later than usual, and you find you are glad, and are not sure you should be.' },
      wrong: '“That’s church,” they say, holding it away from themselves slightly, the way people hold anything that belongs to a church.' },

    { id: 'lf_button', day: 9,
      what: 'A coat button, horn, with thread still in it',
      detail: 'On the inside, in ink, in your handwriting, is your name. The thread is the colour of the coat you are wearing. You check your coat. Your coat has all its buttons.',
      owner: null,
      hints: [],
      keep: { label: 'Keep it. It is yours, apparently.',
        effects: { flags: ['lf_button_kept'] },
        outcome: 'You put it in your pocket, where it is warm, and where, later, there are two of them.' },
      wrong: 'They turn it over, and find the name, and read it, and look up at you with an expression you will think about tonight. “That’s you,” they say. It comes back to the box.' },
  ];

  // ---- the morning post. Tipped out of the bag onto the desk and dragged to whoever it belongs to.
  //   face — what is written on the envelope, which is all you ever see of it
  //   to   — a villager key, 'keeper' (that is you), or 'return' (return to sender)
  // There is deliberately nothing here about what is inside. You sort the outside of a letter.
  const post = [
    { id: 'p1a', day: 1, to: 'marion', face: 'Mrs M. Tebbutt, The Shop, Front Street, Ashfield' },
    { id: 'p1b', day: 1, to: 'penry', face: 'The Vicarage, by St Anne’s' },
    { id: 'p1c', day: 1, to: 'tom', face: 'T. Ferrier, Low Farm, up the mill road' },

    { id: 'p2a', day: 2, to: 'wren', face: 'Miss W. Hollis, c/o the public house on the green' },
    { id: 'p2b', day: 2, to: 'sam', face: 'THE SURGERY, Front Street — MEDICAL. DO NOT BEND.' },
    { id: 'p2c', day: 2, to: 'edith', face: 'Mrs E. Marlow, the far end of the village' },

    { id: 'p3a', day: 3, to: 'keeper', face: 'The Keeper of the Board, the Post Office, Ashfield' },
    { id: 'p3b', day: 3, to: 'edith', face: 'Rose Cottage' },
    { id: 'p3c', day: 3, to: 'sam', face: 'Dr S. Okafor — from the Registrar' },

    { id: 'p4a', day: 4, to: 'return', face: 'Mrs H. Vale, the Post Office, Ashfield' },
    { id: 'p4b', day: 4, to: 'wren', face: 'THE FOX & HOUNDS — brewery, invoice enclosed' },
    { id: 'p4c', day: 4, to: 'penry', face: 'Rev. A. Penry, St Anne’s — Diocesan Registry, Marriages & Burials' },

    { id: 'p5a', day: 5, to: 'tom', face: 'LOW FARM — veterinary account, second notice' },
    { id: 'p5b', day: 5, to: 'wren', face: 'W. Hollis — School of Nursing, admissions' },
    { id: 'p5c', day: 5, to: 'marion', face: 'The Shop — a biscuit tin, by post, no sender' },

    { id: 'p6a', day: 6, to: 'edith', face: 'Mrs E. Marlow, Rose Cottage — from a firm of solicitors' },
    { id: 'p6b', day: 6, to: 'sam', face: 'The Surgery — parish register enquiry, ref. 41/3' },
    { id: 'p6c', day: 6, to: 'keeper', face: 'The Keeper, the Post Office, Ashfield. By hand.' },

    { id: 'p7a', day: 7, to: 'penry', face: 'The Vicarage — account, lamp oil, quarterly' },
    { id: 'p7b', day: 7, to: 'tom', face: 'T. Ferrier — a card, black-edged' },
    { id: 'p7c', day: 7, to: 'return', face: 'Mrs H. Vale, the Post Office, Ashfield. Postmarked Ashfield.' },

    { id: 'p8a', day: 8, to: 'wren', face: 'Miss W. Hollis — timetable enquiry, unfolded once' },
    { id: 'p8b', day: 8, to: 'marion', face: 'Mrs M. Tebbutt — a card, ‘On Your 51st’' },
    { id: 'p8c', day: 8, to: 'keeper', face: 'The Keeper. No stamp. Warm.' },

    { id: 'p9a', day: 9, to: 'sam', face: 'Dr S. Okafor — a form, returned unsigned' },
    { id: 'p9b', day: 9, to: 'edith', face: 'Mrs E. Marlow, Rose Cottage — in her own hand' },
    { id: 'p9c', day: 9, to: 'keeper', face: '{{name}}, the Post Office, Ashfield' },

    { id: 'p10a', day: 10, to: 'penry', face: 'The Vicarage — one chair, invoiced, delivery arranged' },
    { id: 'p10b', day: 10, to: 'tom', face: 'Low Farm — estimate for repairs to a stone wall' },
    { id: 'p10c', day: 10, to: 'keeper', face: 'The Keeper, the Post Office. Dated tomorrow.' },

    { id: 'p11a', day: 11, to: 'return', face: 'Ashfield. No name, no house.' },
    { id: 'p11b', day: 11, to: 'keeper', face: 'To whoever is holding the pin' },

    { id: 'p12a', day: 12, to: 'marion', face: 'Mrs M. Tebbutt, The Shop, Front Street, Ashfield' },
    { id: 'p12b', day: 12, to: 'keeper', face: (a) => a.ending === 'letgo' ? 'The Keeper, the Post Office, Ashfield — readdressed, twice' : 'The next Keeper, the Post Office, Ashfield' },
  ];

  // ---- post in the wrong hands.
  // You are not told on the day. You never are: a sorted letter is out of your hands and out of
  // your knowledge. It comes back the next morning as somebody else's writing on your board.
  //   opened  — a villager had somebody else's letter open before they looked at the front
  //   kept    — you put it in your own pigeonhole, and the person it was for went without
  //   sent    — you put it back in the sack, and it has gone eleven miles the wrong way
  //   council — nobody in the village is left to complain, so the Council does
  const astray = {
    opened: {
      marion: [{ subject: 'Not mine, and I did read it', sign: 'Marion',
        body: 'There was a letter in with mine this morning that was not for me, and I had it open before I looked at the front, the way everybody does.\n\nI have read it. There is no use pretending otherwise; I would only be caught out. I have said nothing to anybody and I will say nothing to anybody, and you may believe that or not.\n\nBut I know a thing now that I was not meant to know, and there is no putting that back in the envelope.' }],
      penry: [{ subject: 'An envelope not addressed to me', sign: 'A. Penry',
        body: 'This morning I opened a letter which was not mine. I read three lines of it before the name at the top stopped me, and I have thought about those three lines all day, which is precisely the trouble.\n\nI have taken it round myself and apologised. I do not think an apology quite covers it.\n\nI am not writing to complain. I am writing so that it is written down somewhere that it happened.' }],
      wren: [{ subject: 'wrong one', sign: 'w',
        body: 'got someone else’s letter this morning. read the first bit before i clocked the name.\n\ni’ve given it back and i haven’t said anything to anyone, obviously, but this is a village of forty-one people and now i know a thing about one of them.\n\nnot cross. just, you know. careful.' }],
      tom: [{ subject: 'This came to me', sign: 'T. Ferrier',
        body: 'Had a letter this morning wasn’t mine. Opened it. Didn’t look at the front first, never do.\n\nI took it round after milking and said sorry and they said nothing, which is worse.\n\nNo harm meant by you, I know that. But it’s done now.' }],
      edith: [{ subject: 'A letter that was not for me', sign: 'Edith Marlow',
        body: 'My dear, do not distress yourself: I opened somebody else’s post this morning and I am eighty-something and I have opened a great deal of post in my time that was not mine.\n\nI shall tell you the honest part, though, since you and I are honest with one another. I read the whole of it. Not three lines. The whole of it, at the window, twice.\n\nI shall not repeat a word. But I know it now, and knowing things is the one thing I am very good at, and I did not need another.' }],
      sam: [{ subject: 'Misdelivery — please note', sign: 'Dr S. Okafor',
        body: 'A letter addressed to somebody else was in my post this morning and I opened it without checking. That is my failing as much as yours.\n\nI would ask you to understand why I am writing it down rather than mentioning it: I hold confidences professionally, and I have just been handed one I did not consent to hold. It sits differently from the others.\n\nIt has been returned. The matter is closed. I would rather it did not open again.' }],
      '*': [{ subject: 'This is not mine', sign: '',
        body: 'There was something in with my post this morning with somebody else’s name on the front of it.\n\nI had it open before I looked. Everybody does. I have taken it round myself.\n\nNo harm done, except that one more person in Ashfield knows what was in it, and Ashfield is not a big enough place for that to be nothing.' }],
    },
    kept: [
      { subject: 'Was there nothing for me?', sign: '',
        body: 'I am told there was something for me on yesterday’s van, and it has not come.\n\nI am not making a fuss about it. I am asking. There is a difference, and in this village it is a fine one.\n\nIf it is behind your counter, it can come tomorrow and no more said.' },
      { subject: 'A thing I was expecting', sign: '',
        body: 'Nothing came yesterday, and something should have.\n\nI have been standing at the window at half past eight like a fool, which is a thing I would rather not be doing at my time of life, or at any time of life.\n\nWould you have a look in your own pigeonhole? Things do end up there. I am not saying anything by it.' },
    ],
    sent: [
      { subject: 'Gone back, apparently', sign: '',
        body: 'The van has taken mine away again, I hear. Eleven miles there and eleven miles back and a fortnight in between, for something that had already arrived.\n\nI am not cross with you. It is a great deal of travelling for a piece of paper that was already where it needed to be.' },
      { subject: 'Return to sender', sign: '',
        body: 'You have sent mine back to the town. I know this because the town has written to tell me so, which is more post than the original would have been.\n\nNext time it can just come to the house. I am always in.' },
    ],
    // A wrong house you meant. Keyed 'postId:hole'. These replace the flat penalty with their own
    // effects, and put their own letter on the board, because deciding who ought to have somebody
    // else's letter is a real decision and not a slip of the hand.
    special: {
      'p4a:marion': {
        effects: { trust: { marion: 2 }, flags: ['vale_to_marion'] },
        from: 'marion', type: 'letter', subject: 'You gave me hers', sign: 'Marion',
        body: 'You did that on purpose. I have been sorting my own post for thirty years and nobody has ever handed me an envelope with Harriet Vale’s name on the front by accident.\n\nSo I opened it, because you meant me to.\n\nThere is nothing in it, love. Not a blank sheet — nothing. An envelope with a name on the front and a postmark and a weight to it, and no inside.\n\nI have put it under the till with the other things. Thank you for thinking of me. I am not certain you have done me a kindness, and I am certain you meant one.' },
      'p7c:marion': {
        effects: { trust: { marion: 1 }, flags: ['vale_to_marion', 'vale_postmark_marion'] },
        from: 'marion', type: 'letter', subject: 'The second one', sign: 'M.',
        body: 'And again. Her name, and posted here, to here.\n\nI held it up to the window like a woman in a film. There is something in this one. I have not opened it and I am not going to, and I want you to know how much that has cost me.\n\nI have put it with the first. If a third comes, {{name}}, do not give it to me. Give it to the Reverend, or the doctor, or nobody. I have got as far with this as I can go and still open the shop in the morning.' },
    },
    council: [
      { subject: 'Delivery, an item of', sign: 'Parish Council',
        body: 'It has been brought to the Council’s attention that an item of post was delivered otherwise than as addressed.\n\nThe Council does not wish to make anything of it. The Council wishes it noted.\n\nThe Council notes a great many things and acts upon almost none of them, and has done so, according to the minutes, for forty-one years.' },
    ],
  };

  // ---- what comes back when you pin a notice of your own on the board.
  // Keyed 'who:keyword'. '*' is who answers when nobody in particular has anything to add:
  // Marion reads everything on that board, and always has.
  const boardReplies = {
    'tom:the collar': [
      { from: 'wren', type: 'letter', subject: 'the collar', sign: 'w',
        body: 'saw your notice. mill road, yeah?\n\ni walk up there. not going in, just up it and back, most mornings. i’ve not seen a collar but i’ll tell you what i have seen: the gate at the bottom is always shut and the grass past it is always flat.\n\nsomething goes up that road. it isn’t me and it isn’t the dog.' },
      { from: 'marion', type: 'letter', subject: 'Your notice about the collar', sign: 'M.',
        body: 'Well, that has been read. Everybody has read it. Two people asked me about it before ten and one of them does not own a coat.\n\nWhat I can tell you is that Tom bought that collar here, and he bought it twice: once eleven years ago and once about a fortnight since, the same buckle, the same size. He said the first one had worn out.\n\nEleven years is not a long time for a good collar. I sell them. I would know.' },
    ],
    '*': [
      { from: 'marion', type: 'letter', subject: 'Your notice', sign: 'M.',
        body: 'You have pinned something up in your own hand, which I do not believe a postmaster has done here in my time. The board is for other people’s writing. That is rather the point of it.\n\nEverybody has read it, of course. I read it first, being nearest.\n\nI have nothing to add, love, and I have looked. Try me again when you have something with a name in it.' },
    ],
  };

  // ---- what the board says back about something in the lost property box.
  // Never the answer. A step: the sort of thing a village knows about an object without
  // knowing whose it is. `clue` is the line the box keeps afterwards.
  const lostNotices = {
    lf_mug: { from: 'marion', type: 'letter', subject: 'That mug of yours', sign: 'M.',
      body: 'A white enamel mug, is it, with the handle wired on.\n\nI can tell you it is not from this shop, because I have not stocked enamel since before the flood, and I can tell you that whoever owns it is one of the two people in this village who would mend a handle rather than buy a mug.\n\nOne of those two is me, and it is not mine.',
      clue: 'Marion says: not shop stock, and only two people here would mend a handle rather than replace a mug — and one of them is her.' },
    lf_glasses: { from: 'edith', type: 'letter', subject: 'The tartan case', sign: 'Edith Marlow',
      body: 'I have seen that case, dear, and I shall tell you where: on the counter of a shop, being opened and shut and opened again by somebody doing sums on the back of a receipt.\n\nThe glasses go on when there is something to read and come off the moment anybody comes in. I have watched it done a hundred times and thought nothing of it until your notice.',
      clue: 'Edith has watched somebody put those glasses on to read behind a counter, and take them off whenever anyone came in.' },
    lf_thimble: { from: 'penry', type: 'letter', subject: 'The silver thimble', sign: 'A. Penry',
      body: 'I saw your notice after Evensong.\n\nI can offer only this, and I offer it gently: it is an old woman’s, and it is old itself, and it has been worn by the same finger for a very long time. The crown is worn through on one side only, which is a right-handed woman who sews every day.\n\nThere are not many left here who sew every day.',
      clue: 'The Reverend: worn through on one side only — a right-handed woman who has sewn every day for a very long time.' },
    lf_book: { from: 'tom', type: 'letter', subject: 'The book', sign: 'T. Ferrier',
      body: 'Read your notice at the shop.\n\nCathedrals, is it. Nobody born here reads about cathedrals. You read about a thing you might go and see, and nobody here is going anywhere.\n\nSo it’s one of the ones that came from somewhere else. There’s not many of those either.',
      clue: 'Tom: nobody born in Ashfield reads about cathedrals. It belongs to one of the few who came here from somewhere else.' },
    lf_timetable: { from: 'edith', type: 'letter', subject: 'The timetable', sign: 'E.M.',
      body: 'Your notice is very carefully worded, and I notice that you did not say what was written on it.\n\nI shall not ask. I shall only say that the hand is young, and that whoever it belongs to has circled the same bus enough times to wear through the paper, which is not a person who has lost a timetable. It is a person who has lost a timetable and will be back for it.\n\nBe kind about it, dear.',
      clue: 'Edith: a young hand, and the same bus circled until the paper wore through. Somebody who will come back for it.' },
    lf_key: { from: 'sam', type: 'letter', subject: 'Re: the key', sign: 'Dr S. Okafor',
      body: 'Your notice, briefly.\n\nThat is church iron. The ward is cut as a cross, which is either devotion or a locksmith with a sense of humour, and there is lamp oil on the string, which narrows it to somebody who carries a lamp about at night.\n\nI can think of exactly one person in Ashfield who does that, and so, I suspect, can you.',
      clue: 'Sam: church iron, a cross-cut ward, lamp oil on the string. One person here carries a lamp about at night.' },
    lf_button: { from: 'someone', type: 'rumour', subject: 'About the button', sign: '',
      body: 'Somebody read your notice out at the bar, the part where you describe the button, and somebody else said: whose handwriting is on the inside of it, then?\n\nAnd you had not put that in the notice.',
      clue: 'Somebody at the Fox asked whose handwriting was inside it. You had not put that in the notice.' },
    '*': { from: 'someone', type: 'rumour', subject: 'Overheard, about your notice', sign: '',
      body: 'Your notice was read, and discussed, and put down, and picked up and read again by the next one in.\n\nNobody has claimed it. Two people said they nearly recognised it, which in Ashfield is a thing people say instead of no.',
      clue: 'Read by everybody. Claimed by nobody. Two people said they nearly recognised it.' },
  };

  const book = { places, work, notes, noteReplies, outreach, lost, post, astray, boardReplies, lostNotices };

  return { villagers, senders, days, items, endings, endingTitles, book };
})();
