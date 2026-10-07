/* Letters to Ashfield: the rules. Twelve days at the Oakhaven post office: the culprit
   drawn at the start, the day's post built from the seed, the morning (the pile, the
   counter, each customer's errand), the afternoon's places, the words and evidence you
   collect, the Knitting Ledger's tally, the Village Hall and the endings. All the words
   are in content.js. No page access, so a whole case can be played in Node:

     const po = createPostOffice({ meta, rnd, on })
       meta   cases run and solved, across games
       rnd    the dice for the culprit and the seed; po.seedDice(n) for tests
       on     on(event, data): 'state' S (a new game), 'save' S, 'meta' meta, 'render'
              [part] ('counter', 'kit', 'hall', or the whole screen), 'later' { ms, fn },
              'sfx' kind, 'toast' [text, kind], 'stamp' price (the counter's stamp lands)

   po.S is the case in progress (set it to load one). The tidy puzzles in the afternoon
   are the page's: what they turn up comes back through learn() and gain(). */
import { OAK as O } from './content.js';
import { mulberry32 } from '../lib/rng.js';

export function createPostOffice({ meta = { runs: 0, solved: [] }, rnd, on = () => {} } = {}) {

  // ---------- what the page is asked to show ----------
  const toast = (msg, kind) => on('toast', [msg, kind]);
  let R = rnd || Math.random;      // the dice: the culprit and the day's post; seedDice(n) for tests
  const TEACUPS = 3;

  const NIGHTS = {
    1: 'You fall asleep in Harriet’s chair with your coat still on. Somewhere up the valley a dog barks at the rain.',
    2: 'The churchyard follows you home. You sit up a long time with the lamp lit, listening to the gutters.',
    3: 'Three letters from one box, and one of them was wet. You turn that over until the clock strikes one.',
    4: 'Everyone in Oakhaven has been somewhere with someone. You count them on your fingers in the dark.',
    5: 'Saturday night: the Swan is loud, then quiet. The post office is only ever quiet.',
    6: 'Sunday. The bells go on longer than they need to.',
    7: 'Five days left before the Inspector comes to close it. You put another log on.',
    8: 'You dream about pigeonholes, and one of them has a hand in it.',
    9: 'Someone walks past the shop twice after dark, and doesn’t stop either time.',
    10: 'Tomorrow is the last day of post before the Hall. You set out your good hat, then put it away again.',
    11: 'You don’t sleep much. The kettle is still warm at midnight.',
  };

  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

  function shuffle(r, arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  const oz2txt = (oz) => String(oz);   // weights are plain numbers: match them to the card

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  let S = null;

  const save = () => S && on('save', S);

  const C = () => S.culprit;

  const W = (id) => (O.words[id] ? O.words[id][0] : id);

  function newGame() {
    const r = R;
    // the first game is always one of the six villagers; after that, the postmistress too
    const pool = meta.runs > 0 ? O.SUSPECTS : O.SUSPECTS.filter((s) => s !== 'beatrice');
    S = {
      v: 1, day: 1, phase: 'intro', culprit: pool[Math.floor(r() * pool.length)], seed: Math.floor(r() * 1e9),
      words: { beatrice: 1, confirms: 1, denies: 1 }, fills: {}, solved: {}, evidence: {},
      unlocked: ['desk'], visited: [], pile: [], vis: { i: 0, asked: [], since: 0 }, holes: {},
      steam: null, sealPerfect: false, cups: TEACUPS, hall: null, ending: null,
    };
    on('state', S);
    save();
  }

  // ---------- text ----------
  // [[word|text]] is a ledger word: highlighted, and collected when it is shown.
  function rich(text) {
    const ids = [];
    const html = esc(text).replace(/\[\[([a-z0-9_]+)\|([^\]]+)\]\]/g, (_, id, t) => { ids.push(id); return `<mark class="w" data-w="${id}">${t}</mark>`; });
    return { html, ids };
  }
  function show(text) {
    const r = rich(text);
    learn(r.ids);
    return r.html;
  }
  function learn(ids) {
    const fresh = ids.filter((id) => O.words[id] && !S.words[id]);
    fresh.forEach((id) => { S.words[id] = 1; });
    if (!fresh.length) return;
    // gather whatever is learnt in one moment into a single toast
    if (!learnt.length) on('later', { ms: 60, fn: () => { toast('Into the ledger: ' + learnt.map(W).join(', '), 'word'); learnt = []; } });
    learnt.push(...fresh);
    on('sfx', 'pen'); save();
  }
  let learnt = [];
  function gain(ev) {
    if (S.evidence[ev]) return;
    S.evidence[ev] = 1;
    toast('Into the case box: ' + O.evidenceInfo[ev].name, 'ev');
    save();
  }



  // ---------- the pile ----------
  function buildPile(day) {
    const r = rng(S.seed + day * 7919);
    const out = [];
    const sp = O.specials[day] || [];
    sp.forEach((x, i) => out.push(Object.assign({ id: `d${day}s${i}`, kind: x.kind, from: x.from || pick(r, O.towns) }, x)));
    if (day === 3) {
      O.sackFillers(C()).forEach((p) => {
        const L = O.sackLetter[p];
        out.push({ id: 'sack_' + p, kind: 'letter', sack: true, to: 'out', addr: L.to, what: L.what, from: 'ST JUDE’S BOX', back: L.back, sender: p });
      });
      out.push({ id: 'sack_c', kind: 'letter', sack: true, wet: true, to: 'out', addr: O.culpritLetter[C()], what: 'Unsigned', from: 'ST JUDE’S BOX', back: O.culpritLetterBack(C()) });
    }
    // what was handed in at the counter yesterday goes out with this morning's sort
    const carried = (S.carry || []).map((x) => Object.assign({}, x));
    carried.forEach((x) => out.push(x));
    const n = Math.max(2, (O.pileSize[day] || 0) - carried.length);
    const holes = O.holes.filter((h) => h.addr.length);
    let k = 0;
    while (out.filter((x) => !x.sack && x.kind !== 'drawer').length < n) {
      const h = pick(r, holes);
      out.push({ id: `d${day}f${k++}`, kind: 'letter', to: h.id, addr: pick(r, h.addr), what: pick(r, O.fillerWhat[h.id]), from: pick(r, O.towns) });
    }
    const pile = shuffle(r, out);
    // the drawer and Harriet's sack sit on top, where you'd notice them
    pile.sort((a, b) => (b.kind === 'drawer') - (a.kind === 'drawer') || (b.sack ? 1 : 0) - (a.sack ? 1 : 0));
    // morning post arrives already paid for; weighing and stamping happen at the counter
    pile.forEach((x) => {
      x.done = false; x.flipped = false; x.weighed = true; x.stamped = true;
      if (!x.paid) x.paid = x.kind === 'parcel' ? 'parcel' : (r() < 0.5 ? '1st' : '2nd');
    });
    return pile;
  }
  const current = () => S.pile.find((x) => !x.done);

  // ---------- the day ----------
  function startDay() {
    if (S.day >= 12) { S.phase = 'hall'; S.hall = S.hall || { step: 'open' }; save(); on('render'); return; }
    S.phase = 'morning';
    S.pile = O.days[S.day].mail ? buildPile(S.day) : [];
    if (O.days[S.day].mail) S.carry = [];
    // the pile first, with the sign still on CLOSED; then the door, and the customers
    S.stage = O.days[S.day].mail ? 'sort' : 'counter';
    S.vis = { i: 0, asked: [], here: false, errand: null };
    save();
    on('render');
    if (S.stage === 'counter') on('later', { ms: 700, fn: arrive });
  }
  function openCounter() {
    if (S.stage !== 'sort' || current()) return;
    S.stage = 'counter';
    S.holes = {};   // the round has taken it all
    on('sfx', 'ding');
    toast('The round goes out with the sorted post. You turn the sign to OPEN.');
    save(); on('render');
    on('later', { ms: 900, fn: arrive });
  }
  const errandOf = () => (O.errands[S.day] || [])[S.vis.i] || null;
  const todaysVisits = () => O.visits[S.day] || [];
  function arrive() {
    const v = todaysVisits()[S.vis.i];
    if (!v || S.vis.here || S.phase !== 'morning' || S.stage !== 'counter') return;
    S.vis.here = true; S.vis.asked = [];
    const e = errandOf();
    const skip = !e || (e.ask === '@culprit' && C() === 'beatrice');
    S.vis.errand = { done: skip, note: '' };
    S.vis.want = !skip && e.kind === 'buy' ? e.want.slice() : [];
    S.vis.given = [];
    S.vis.paid = !S.vis.want.length;
    S.vis.posting = [];
    if (!skip && e.kind === 'post') S.vis.posting.push({ kind: 'parcel', oz: e.oz, what: e.what, addr: e.dest, to: 'out', from: 'OAKHAVEN', counter: true });
    if (!skip && e.hand) S.vis.posting.push({ kind: 'letter', what: e.hand.what, addr: e.hand.addr, to: e.hand.to, cls: e.hand.cls, say: e.hand.say, from: 'OAKHAVEN', counter: true });
    // only parcels go on the scale
    S.vis.posting.forEach((x) => { x.weighed = x.kind === 'letter'; x.stamped = false; });
    on('sfx', 'ding');
    save();
    on('render', 'counter');
  }
  function visitorKey(v) { return v.who === '@culprit' ? C() : v.who; }
  function leave() {
    S.vis.here = false; S.vis.i++; S.vis.posting = []; S.vis.errand = null;
    save();
    on('render', 'counter');
    if (todaysVisits()[S.vis.i]) on('later', { ms: 1100, fn: arrive });
  }
  function itemSorted() { on('render', 'counter'); }
  const morningDone = () => S.stage === 'counter' && !current() && S.vis.i >= todaysVisits().length && !S.vis.here;

  // what a customer hands over is posted, and joins tomorrow's pile
  function handIn(item) {
    S.carry = S.carry || [];
    S.carry.push(Object.assign({ id: 'c' + S.day + '_' + S.carry.length }, item));
  }
  const posting = () => (S.vis.posting || []).find((x) => !x.stamped) || null;
  // the errand is done once they've paid and everything they handed over is stamped
  function errandStep(note) {
    if (note) S.vis.errand.note = (S.vis.errand.note ? S.vis.errand.note + ' ' : '') + note;
    if (S.vis.paid && !posting()) { S.vis.errand.done = true; on('sfx', 'good'); }
    save();
    on('render', 'counter');
  }
  const TRAY_NAME = Object.fromEntries(O.tray);
  // something from the tray: what they asked to buy, or a stamp for what they're posting
  function give(item) {
    if (!S.vis.here || !S.vis.errand || S.vis.errand.done) return;
    if (!S.vis.paid) {
      if (!S.vis.want.includes(item) || S.vis.given.includes(item)) { on('sfx', 'bad'); toast('That isn’t what they asked for.'); return; }
      S.vis.given.push(item);
      on('sfx', 'slot');
      if (S.vis.want.every((w) => S.vis.given.includes(w))) {
        S.vis.paid = true;
        errandStep(`You hand over the ${S.vis.given.map((g) => TRAY_NAME[g].toLowerCase()).join(' and the ')}, and they pay.`);
      } else { save(); on('render', 'counter'); }
      return;
    }
    on('stamp', item);
  }

  function toAfternoon() {
    if (S.day === 11) { S.phase = 'dusk'; save(); on('render'); return; }
    S.phase = 'afternoon';
    save();
    on('render');
  }
  function placesOpen() {
    if (S.day === 1) return S.visited.includes('desk') ? [] : ['desk'];
    if (S.day === 2) return S.visited.includes('church') ? [] : ['church'];
    return O.placeOrder.filter((p) => S.unlocked.includes(p) && !S.visited.includes(p));
  }
  function toEvening() { S.phase = 'evening'; save(); on('render'); }



  function evUsable(id) { const need = O.evidenceInfo[id].need; return !need || S.solved[need]; }

  function blanksOf(pg) {
    const out = [];
    pg.lines.forEach((ln) => Object.keys(ln.blanks).forEach((b) => out.push({ id: b, ok: ln.blanks[b], group: ln.group && ln.group.includes(b) ? ln.group : null })));
    return out;
  }

  function wrongCount(pg) {
    const f = S.fills[pg.id] || {};
    const bl = blanksOf(pg);
    let wrong = 0;
    const seenGroups = new Set();
    bl.forEach((b) => {
      if (b.group) {
        const key = b.group.join(',');
        if (seenGroups.has(key)) return;
        seenGroups.add(key);
        const vals = b.group.map((g) => f[g]);
        const good = new Set(vals.filter((v) => b.ok.includes(v)));
        wrong += b.group.length - good.size;
      } else if (!b.ok.includes(f[b.id])) wrong++;
    });
    return wrong;
  }

  function checkPage(pg) {
    const f = S.fills[pg.id] || {};
    const bl = blanksOf(pg);
    if (bl.some((b) => !f[b.id])) return null;
    const w = wrongCount(pg);
    if (w === 0 && !S.solved[pg.id]) {
      S.solved[pg.id] = true;
      on('sfx', 'good');
      if (pg.id === 'alibis') gain('ev_alibi');
      if (pg.id === 'motive') gain('ev_motive');
      save();
    }
    return w;
  }

  function hallStatements() {
    const H = S.hall;
    if (H.who !== C()) return O.innocentStatements(H.who);
    const st = O.statements(C());
    if (C() === 'beatrice') st[0].breaks = st[0].breaks.concat(['ev_ticket']);
    return st;
  }

  function present(ev) {
    const H = S.hall;
    if (ev === 'none') return finish('failed');
    if (!evUsable(ev)) { toast('You can’t yet say what that means. Tally its ledger page first.'); return; }
    let good = false;
    if (H.step === 'fall') good = ['ev_scrapes', 'ev_rail', 'ev_notice'].includes(ev);
    else if (H.step === 'cross') good = hallStatements()[H.i].breaks.includes(ev);
    if (good) {
      on('sfx', 'objection');
      H.flash = H.step === 'fall' ? 'People who slip do not scuffle.' : 'That simply doesn’t tally!';
      if (H.step === 'fall') H.step = 'accuse';
      else if (++H.i >= 4) H.step = 'win';
    } else {
      on('sfx', 'bad');
      S.cups--;
      H.flash = null;
      toast(['The Inspector raises an eyebrow. “And what does that prove, Mrs Pym?”', 'A murmur goes round the hall. Somebody tuts.', 'Mrs Tebbutt looks at the clock.'][Math.max(0, 2 - S.cups)] || '');
      if (S.cups <= 0) { save(); return finish(H.step === 'cross' && H.who !== C() ? 'wrong' : 'failed'); }
    }
    save();
    on('render', 'hall');
    if (H.flash) on('later', { ms: 1400, fn: () => { H.flash = null; if (S.phase === 'hall' && S.hall === H) on('render', 'hall'); } });
  }

  function finish(kind) {
    S.ending = kind; S.phase = 'end';
    meta.runs++;
    if (kind === 'justice' || kind === 'self') meta.solved.push(C());
    on('meta', meta);
    save();
    on('render');
  }


  // ---------- the verbs behind the buttons ----------
  /* Turning an envelope over: what is on its back. */
  function noticed(it) {
    if (it.seen) return;
    it.seen = true;
    if (it.wet) gain('ev_letter');
    if (it.opens && !S.unlocked.includes(it.opens)) { S.unlocked.push(it.opens); toast('A reason to go out this afternoon: ' + O.places[it.opens].name); }
    if (it.sender) learn([it.sender]);
    save();
  }
  /* What a tidied place turns up: the lines to show (words in them are learnt as they are
     shown), with the evidence and the doors it opens. */
  function findingsAt(p) {
    let lines = [];
    if (p === 'drawer') {
      lines = ['Jack Barnaby’s reading spectacles, in a tartan case. The tag says they were found on the churchyard wall. Jack lost them, he said, the Sunday before.', O.ticketText(C())];
      gain('ev_spectacles'); gain('ev_ticket');
      if (!S.specs) S.specs = 'held';
      lines.push('It is your coat, and your ticket. You realise you still haven’t unpacked — the trunk is upstairs exactly as the carrier left it.');
      if (!S.unlocked.includes('rooms')) S.unlocked.push('rooms');
    } else if (p === 'desk' || p === 'manor') {
      lines = O.places[p].find();
    } else {
      const s = O.SUSPECTS.find((k) => O.people[k].place === p);
      const w = O.workplace[s];
      lines = [w.notice, w.doc(C())];
      if (s === C()) {
        gain('ev_doc'); gain('ev_page');
        lines.push(`Inside ${W(O.people[s].container)}, folded small: a page cut from Harriet’s [[dayledger|day ledger]], and her [[keyring|brass key ring]].`);
        lines.push('In Harriet’s hand: “' + O.page[s] + '”');
        learn([O.people[s].motive]);
      } else if (s === 'beatrice') {
        lines.push('You unpick the stitching. Inside the lining: nothing but a lost button, and the smell of the Nettleton train.');
      } else {
        lines.push('Nothing else here that oughtn’t to be.');
      }
    }
    return lines;
  }
  /* Putting one thing in the churchyard straight: what it is, and what it proves. */
  function straighten(id) {
    if (id === 'rail') gain('ev_rail');
    if (id === 'mat') gain('ev_scrapes');
    if (id === 'notice') gain('ev_notice');
    return O.churchyard(C()).find((x) => x.id === id);
  }
  /* Back from a place: the lost-and-found box is done with, or the afternoon is over. */
  function homeFrom(p) {
    if (p === 'drawer') { S.lostDone = true; save(); return 'drawer'; }
    if (!S.visited.includes(p)) S.visited.push(p);
    S.visiting = null;
    toEvening();
    return p;
  }
  /* The top letter of the pile into a pigeonhole: 'drawer' (not for sorting), 'weigh'
     (a parcel without its postage), 'wrong', or 'ok'. The last one sorted opens the counter. */
  function sortInto(hole) {
    const it = current();
    if (!it || it.kind === 'drawer') return 'drawer';
    if (it.kind === 'parcel' && (!it.weighed || !it.stamped)) {
      toast(it.weighed ? 'It wants its postage first.' : 'Parcels go on the scale first.'); on('sfx', 'bad'); return 'weigh';
    }
    if (hole !== it.to) {
      on('sfx', 'bad');
      toast(it.to === 'out' ? 'This isn’t for anyone in Oakhaven.' : 'Not that one. Read the address again.');
      return 'wrong';
    }
    it.done = true;
    S.holes[hole] = (S.holes[hole] || 0) + 1;
    on('sfx', 'slot');
    save();
    if (!current()) on('later', { ms: 900, fn: openCounter });
    return 'ok';
  }
  function weighItem(it) {
    if (!it || it.weighed) return false;
    it.weighed = true;
    on('sfx', 'slot'); save();
    return true;
  }
  /* A stamp from the tray onto what the customer is posting: the item, when it is the
     right one (stampLand then finishes it, once the page has shown it landing). */
  function stampCheck(price) {
    const p = posting();
    if (!p || !S.vis.paid) return null;
    if (!p.weighed) { toast('Weigh it first.'); return null; }
    const right = p.kind === 'parcel' ? 'parcel' : p.cls;
    if (price !== right) { on('sfx', 'bad'); toast(p.kind === 'parcel' ? 'A parcel takes the parcel stamp.' : `They asked for ${p.cls === '1st' ? 'first' : 'second'} class.`); return null; }
    p.paid = price;
    on('sfx', 'stamp');
    return p;
  }
  function stampLand(p, price) {
    p.stamped = true;
    handIn(Object.assign({}, p, { weighed: true, stamped: true }));
    if (!S.words.redink) { learn(['redink']); toast('Red ink from the postmark pad on your fingers. Harriet’s must have been the same.'); }
    errandStep(`You stick on the ${TRAY_NAME[price].toLowerCase()} and postmark it — into the box for tomorrow morning’s sort.`);
  }
  function ask(i) { S.vis.asked.push(i); on('sfx', 'paper'); save(); }
  function nextDay() { S.day++; startDay(); }
  /* Night 11: the guilty party's letter goes out with its seal unbroken. */
  function leaveSealed() { S.steam = 'left'; save(); toast('You put it in the outgoing sack, seal unbroken.'); toEvening(); }

  // the Village Hall: speak up about the fall, name someone, and close the case
  function speakUp() {
    const H = S.hall;
    H.step = 'fall';
    on('sfx', 'objection');
    H.flash = 'That simply doesn’t tally!';
    save();
    on('render', 'hall');
    on('later', { ms: 1400, fn: () => { H.flash = null; if (S.phase === 'hall' && S.hall === H) on('render', 'hall'); } });
  }
  function accuse(who) { const H = S.hall; H.who = who; H.step = 'cross'; H.i = 0; on('sfx', 'objection'); save(); on('render', 'hall'); }
  const closeCase = () => finish(C() === 'beatrice' ? 'self' : 'justice');

  return {
    get S() { return S; }, set S(v) { S = v; },
    noticed, findingsAt, straighten, homeFrom, sortInto, weighItem, stampCheck, stampLand, ask, nextDay, leaveSealed, speakUp, accuse, closeCase,
    rng, shuffle, newGame, rich, show, learn, gain, buildPile, startDay, openCounter, arrive, visitorKey, leave, itemSorted, handIn, errandStep, give, toAfternoon, placesOpen, toEvening, evUsable, blanksOf, wrongCount, checkPage, hallStatements, present, finish, TEACUPS, NIGHTS, pick, oz2txt, esc, save, C, W, current, errandOf, todaysVisits, morningDone, posting, TRAY_NAME,
    seedDice(n) { R = mulberry32(n); },
  };
}
