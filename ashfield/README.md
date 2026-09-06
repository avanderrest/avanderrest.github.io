# Letters from Ashfield

You are the postmaster of a village called Ashfield. The screen is your desk: a bag of
morning post you carry across a map of the village to the right door, your address book, a lost
property box, and the noticeboard on the wall — letters, notices and rumours from named
villagers, which you answer, carry to somebody else, or leave to yellow. You can ask each
of them one thing a day, and once a day you can leave the desk altogether and call on one
person. What you know about somebody you can also write to them about, unasked, and they
answer on the board in the morning. Twelve days, six villagers, three endings.

Static HTML, CSS and two plain scripts. No build step, no dependencies, no network calls.
Open `index.html`.

## Files

| File | What it is |
| --- | --- |
| `index.html` | Markup for both screens and every overlay |
| `style.css` | Cork, paper, pins, and the late-game text effects |
| `js/game.js` | The engine: state, day loop, the desk, rendering, saving |
| `js/content.js` | All of the writing |

The engine knows nothing about Ashfield. Every name, letter and outcome is in
`content.js`, so the game can be rewritten without touching `game.js`.

## Adding a letter

```js
add({
  id: 'l4_marion_gossip',          // unique; used as the save key and the paper's tilt seed
  day: 4,                          // 1..12
  type: 'letter',                  // letter | notice | rumour | ash
  from: 'marion',                  // a villagers key, or parish | someone | ash | board
  order: 1,                        // optional; lower sorts earlier on the board
  when: (a) => a.has('tea'),       // optional; whether it appears at all
  subject: 'Not saying, just saying',
  body: (a) => '…',                // string or (api) => string
  sign: 'M.',
  replies: [
    { text: 'I haven’t looked. Should I?',
      when: (a) => !a.has('marion_shut'),   // optional
      effects: { trust: { marion: 1 }, flags: ['marion_look'] },
      outcome: 'She reads it at the counter and laughs, once.' },
  ],
  pass: {                                    // enables "carry it to someone"
    penry: { effects: {…}, outcome: '…' },
    '*':   { outcome: 'fallback for anyone else' },
  },
  onIgnore: { effects: {…}, outcome: 'what happens if the day ends unanswered' },
});
```

`effects` is either `{ trust, flags, unflag, remove, ending }` or a function taking the api.

A reply may carry `overnight: true`. That is for agreeing to do something later in the day —
going up the mill at nine, a locked church at eight. The board stamps it **Agreed** and the desk
lists it, but the account of it is held back: `laterHint` is what the letter says in the
meantime, and `outcome` is read out in the evening, after the office is shut, when there is
nothing left to be done about it.

## The desk

The right-hand rail is the desk itself: the post bag, the address book, the lost property
box, and — once there is any history — the bundle of old letters. Each is a drawn object you
click. If you have agreed on the board to meet somebody today, a note sits under them saying
where and when; that is the only place a plan is shown.

Two of those objects are jobs that are not the board. Both live in the `book` section of
`content.js`, and both are wired to the address book: what you know about people is what
lets you do them well.

### The morning post

Click **the post bag**. The panel is a flat cartoon map of Ashfield with the roads named —
Front Street, the mill road, Church Lane, the green, the road out — and a house on it for
everybody the post can go to: one per villager, the post office (that is you), and the van
parked on the road out. Click the bag in the corner and the top letter comes out onto your
hand and stays there, a small envelope on the cursor, with a big readable one in the bottom
right showing the address it is going by. Click the house it belongs to and it is delivered;
click anywhere else on the map and it lies there until you pick it up again. The right house
is `to`. Somebody who has gone out of Ashfield keeps their house, shut up, and their post
belongs back in the van.

The geometry lives in `MAP` in `game.js` — x, y and width as percentages of the map box —
and the roads are drawn to the same numbers in `MAP_SVG`. Move a house and you move its lane.

```js
{ id: 'p4a', day: 4, to: 'return',            // villager key | 'keeper' (you) | 'return'
  face: 'Mrs H. Vale, the Post Office, Ashfield',   // string or (api) => string
  when: (a) => true }                               // `when` optional
```

There is deliberately nothing here about what is inside. You sort the outside of a letter, and
the panel tells you only where each one went and whether any of them went to the wrong house.
What that cost you turns up the next morning, on the board, in somebody else's handwriting —
the `astray` section of `content.js`:

```js
astray: {
  opened: { marion: […], '*': […] },   // they opened somebody else's before looking at the front
  kept:   […],                          // you put it in your own pigeonhole; they went without
  sent:   […],                          // you put it back in the sack, eleven miles the wrong way
  council:[…],                          // nobody is left to complain, so the Parish Council does
  special: { 'p4a:marion': { effects: {…}, from, subject, body, sign } },
}
```

`special` is keyed `postId:hole`. Some wrong houses are a decision rather than a slip — handing
the last postmaster's letter to the one person who was fond of her — and those replace the flat
penalty with their own effects and their own letter.

Otherwise a wrong hand costs a point of trust with whoever opened it, and counts towards
`astray(who)`. Anything still in the bag at the end of the day goes out a day late. Villager
addresses (shown under each name) come from `address` on each villager.

### Lost and found

Behind **the box under the desk**. Each object gives you a description and, if the right note is in
your address book, a quotation from it *without the name attached* — matching the two up is
the puzzle. A wrong guess is free but is remembered, and that person is taken off the list.

```js
{ id: 'lf_mug', day: 2,                     // the day it turns up
  what: 'A white enamel mug, chipped at the rim',
  detail: 'Cold tea still in it. The handle has been mended with wire.',
  owner: 'tom',                             // null for the ones that are nobody's
  hints: [{ who: 'tom', key: 'the mug' }],  // notes; at most two are shown, once learned
  right: { effects: {…}, outcome: '…' },
  wrong: '…',                               // optional; a generic line otherwise
  keep: { label: 'Keep it.', effects: {…}, outcome: '…' } }   // optional
```

You can also pin a notice about a thing in the box and let the village have a go. The answer is
in `lostNotices`, keyed by the object's id, and it is never the answer — it is the sort of thing
a village knows about an object without knowing whose it is. `clue` is the line the box keeps:

```js
lf_mug: { from: 'marion', subject: '…', body: '…', sign: '…',
         clue: 'Not shop stock, and only two people here would mend a handle.' }
```

Returning something counts towards `returned(who)`.

## Your day, the questions, and the one walk

There is no diary of the whole village, and the book does not pretend to know where everybody
is. The only plan the game shows the player is one they have actually agreed to: a plan carrying
`with: 'you'` that came from a reply they pinned. That appears as a note on the desk and nowhere
else. Invitations in an unanswered letter do not appear at all.

Two separate allowances, because they are two different things:

- **A question each, per day.** An outreach option of kind `ask` or `write` can be used once per
  person per day (`askedToday`). You can go round the whole village asking one thing each.
- **One walk a day, in total.** An option of kind `visit` leaves the desk, and there is one of
  those in a day whoever it is for (`visitsLeft`). Agreeing on the board to meet somebody spends
  it too, so a day is one visit however it was arranged.

Either way it has to be somebody the player knows — somebody they have written back to, carried
a letter to, or handed lost property back to (`metPerson`).

## The api

Content functions receive one argument, the api. Reading side:
`name`, `prevName`, `day`, `loop`, `hour`, `weekday`, `visits`, `ignoredCount`, `ending`,
`burnedBefore`, `has(flag)`, `trust(who)`, `standing(who)`, `resolved(id)`,
`replied(id, i)`, `passedTo(id, who)`, `ignored(id)`, `removed(who)`.

Desk side: `returned(who)`, `astray(who)`, `gaveBack(lostId)`, `sortedRight(postId)`,
`wrote(who, key)` — whether you have left a note of your own about that thing.

Writing side: `setFlag`, `unflag`, `addTrust`, `remove`, `setEnding`.

`hour`, `weekday` and `visits` are real-world values. They are what the late-game letters
use to notice the player, so use them sparingly and only after day 7.

## Text markup

| Written | Renders as |
| --- | --- |
| `{{name}}` | The postmaster's name, as typed on the title screen |
| `[[a\|b]]` | Shows `a`, then quietly becomes `b` a few seconds later |
| `~~x~~` | Struck through |
| `__x__` | Smudged |
| `^^x^^` | Shivering |

Blank lines make paragraphs. Everything is escaped before markup is applied.

## Pre-pinned replies

A letter can arrive with a reply already pinned to it, in the player's handwriting, that
the player did not write:

```js
prepinned: {
  text: 'I’m here. I’m always here.',
  flag: 'unpinned_strange',      // set when the player unpins it
  hint: 'You did not pin that.',
  outcome: '…',                  // if they unpin it
  leftOutcome: '…',              // if they let it stand to the end of the day
  effects: {…}, keptEffects: {…},
}
```

## Endings

Chosen on day 11 by the letter from behind the board, and shown after day 12.

- **keep** — the village goes on, the same size it always was. Loops to a new day 1.
- **letgo** — one villager is unpinned. `removed` carries across loops, so they stay gone.
- **burn** — ends immediately on day 11, wipes the save, returns to the title screen.

Day 12 letters branch on `a.ending`.

## Saving

`localStorage`, two keys. `ashfield.save.v1` is the run (including `sorted`, `given` and
`tried` from the desk); `ashfield.meta.v1` counts visits
across runs and remembers whether the board has been burned before, both of which the
late letters read. Wrapped in try/catch, so the game still runs with storage blocked.

## The address book

Opens with **Reaching out** across the top: who you could call on today, who you have not yet
asked your one question of, or where you have already said you would be. Then a page per
villager: what they do for a living and what that leaves them free for, the things you can go
and do with them, what you have learned about them (and what you have written to them about it),
everything that has passed between you, and a space in your own hand. Everything the book knows
is in `content.js`, in the `book` section. The engine only knows the shapes.

### Notes

Facts appear on a page the first day their `when` comes true, and stay. `key` is the keyword
that outreach can ask about.

```js
notes: { marion: [
  { key: 'tea', text: 'Tea is at four, above the shop.', when: (a) => a.has('tea') },
]}
```

`text` may be a function of the api, so a note can sharpen as you learn more.

### Leaving a note of your own

Every fact on a page can be written about. The player types their own note and chooses where it
goes — to that person, or up on the board for the whole village — and it is answered the next
morning. Three a day; the answer is in `noteReplies[who][key]`, with `noteReplies[who]['*']` as
the fallback list, or in `boardReplies['who:key']` for a notice, with a `'*'` fallback.

This is what a clue is for. Going up the mill road to look for Tom's dog turns up a collar, the
collar becomes a note, and the note can go on the board: *found this, has anyone seen him.*

### What they do for a living

There is no whole-village timetable. Each villager has an entry in `work`: the `job` line the
book keeps under their name, and `meet`, the gap the job leaves — where and when they can see
you. An outreach option with no `plans` of its own happens there, and every option shows the
place and time on its face before you commit to it. Places are keyed in `places`.

```js
marion: {
  job: 'The shop, half eight to one and two to four…',
  meet: { at: 'shop', hour: 13, doing: 'the counter, in the hour she shuts the door' },
}
```

`meet` may be a function of the api — Sam's depends on whether it is a surgery morning.

A letter, a reply or an outreach option can add `plans`, which is what makes a "come at four"
show up in someone's day:

```js
plans: [{ at: 'shopflat', hour: 16, doing: 'tea, above the shop', with: 'you' }]
```

`who` defaults to the sender (`'*'` for everyone), `day` to the letter's day. `with` is `'you'`,
a villager key, or `'everyone'`. A plan at the same place and hour replaces an earlier one, so a
reply can firm up an invitation. The engine still builds everybody's whole day, but a page
only shows that person's own hours — "Where to find them" — not who else they are seeing.

### Reaching out

```js
{ id: 'o_marion_pencil', who: 'marion', kind: 'ask',      // visit | write | ask
  text: 'Ask about Harriet’s pencil note',
  when: (a) => a.knows('marion', 'pencil'),
  effects: { trust: { marion: 1 }, flags: ['pencil_wont'] },
  outcome: '…', plans: [...], repeat: 3 }                   // repeat: days before it can be done again
```

One call a day, and only for a person the player knows. Options show on that person's page
under **Reaching out**, at the top; the band across the top of the book names who has
something worth calling for. An option on the page of someone you have never written back to
is not shown — the page says so instead. Outcomes are recorded under "Between us" and can set
flags that other notes and options read, on any villager's page.

The book's side of the api: `week` (Ashfield's weekday), `seen(id)`, `opened(id)`,
`knows(who, key)`, `reached(id)`, `reachedAny(who, kind)`, `dealt(who, action)`,
`carried(who)`, `rose(who)`, `fell(who)`.

Saved inside the run as `book`. Older saves get an empty one and rebuild what they can from
flags. Across a loop only your own handwriting survives.

## Tests

Not shipped with the game; they live outside the repo. Two harnesses were used:
a headless driver that plays hundreds of randomized runs against `content.js` to check
every letter is reachable and no writing crashes, and a jsdom driver that clicks through
the real page for each ending.
