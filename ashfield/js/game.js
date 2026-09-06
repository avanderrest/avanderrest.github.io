/* Letters from Ashfield — engine
 *
 * All the writing lives in content.js. This file only knows how to:
 *  - keep state (day, trust, flags, what you did with each letter)
 *  - decide which letters appear today
 *  - draw the board and the reading panel
 *  - dress the desk: the sack of post, the address book, the lost property box, the old letters
 *  - run the sort: drag a letter from the pile onto whoever it belongs to
 *  - keep the address book: what you have learned, what you did together, who you can call on
 *  - let you leave a note of your own about a thing you know, and put the answer on the board
 *  - put a note on the board when yesterday's post went to the wrong house
 *  - use what somebody does for a living to decide where and when they can see you
 *  - let you leave the desk once a day, for someone you have written back to
 *  - hold back the things you agreed to do later, and tell you about them at the end of the day
 *  - end days, save, loop, and end the game
 */
(function () {
  'use strict';

  const C = window.ASHFIELD;
  const B = C.book || { places: {}, work: {}, notes: {}, noteReplies: {}, outreach: [] };
  const SAVE_KEY = 'ashfield.save.v1';
  const META_KEY = 'ashfield.meta.v1';
  const LAST_DAY = 12;
  // You can leave the desk once a day, and only for somebody you know. Once you have been
  // round the fortnight and come out the other side, you get two: the second time up this
  // road you already know where everybody is, so a run that has been here before reaches
  // further than the first one could.
  const VISITS_FIRST = 1, VISITS_AFTER = 2;
  const visitBudget = () => ((meta.rounds || 0) >= 1 ? VISITS_AFTER : VISITS_FIRST);

  // ------------------------------------------------------------ helpers
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const rot = (id, spread) => (((hash(id) % 1000) / 1000) * 2 - 1) * (spread || 2.2);
  const val = (v, api) => (typeof v === 'function' ? v(api) : v);
  const safe = (fn, fallback) => { try { return fn(); } catch (e) { return fallback; } };
  const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // ------------------------------------------------------------ state
  let state = null;
  let meta = loadMeta();
  let selectedId = null;
  let swapTimers = [];
  let bookWho = null;
  let sortHeld = null;     // the envelope in your hand, at the desk
  let lastDragEnd = 0;     // so the click that ends a drag does not also count as a click
  let noteDraft = null;    // { who, key, where, text } while you are writing one of your own

  function freshBook(prev) {
    prev = prev || {};
    return {
      notes: prev.notes || {},        // who -> your own handwriting, on their page
      learned: {},                    // who -> { noteKey: day first learned }
      written: {},                    // who -> { noteKey: { text, day } }, notes you put in their hand
      posted: {},                     // lost id -> the day you pinned a notice asking whose it is
      ups: {}, downs: {},             // who -> how often trust rose / fell by your hand
      reaches: [],                    // [{ id, who, kind, text, outcome, day }]
      returned: {},                   // who -> lost property given back to them
      astray: {},                     // who -> post you put in the wrong hand
      seenCount: 0,                   // how much of the book had been looked at last time it was opened
    };
  }

  function freshState(name, carry) {
    carry = carry || {};
    return {
      name: name,
      day: 1,
      trust: {},
      flags: [],
      resolved: {},      // id -> { action, choice, who, outcome, day }; 'o:<id>' for reaching out
      dayItems: [],      // ids visible today
      ignoredCount: 0,
      removed: carry.removed || [],
      loop: carry.loop || 0,
      ending: null,
      started: Date.now(),
      prevName: carry.prevName || null,
      opened: [],        // ids you have actually taken down and read
      sorted: {},        // post id -> the pigeonhole you put it in ('late' if the day ended first)
      given: {},         // lost id -> { who, right, day }
      tried: {},         // lost id -> [who you offered it to and were wrong]
      book: freshBook(carry.book),
    };
  }

  // Older saves have no book. Give them one, quietly.
  function ensureBook() {
    if (!state.book) state.book = freshBook();
    const b = state.book;
    ['notes', 'learned', 'written', 'posted', 'ups', 'downs', 'returned', 'astray'].forEach((k) => { if (!b[k]) b[k] = {}; });
    if (!b.reaches) b.reaches = [];
    if (!b.seenCount) b.seenCount = 0;
    if (!state.opened) state.opened = [];
    ['sorted', 'given', 'tried'].forEach((k) => { if (!state[k]) state[k] = {}; });
  }

  function loadMeta() {
    try { return JSON.parse(localStorage.getItem(META_KEY)) || { visits: 0, rounds: 0, first: Date.now(), burned: false }; }
    catch (e) { return { visits: 0, rounds: 0, first: Date.now(), burned: false }; }
  }
  function saveMeta() { try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch (e) { /* private mode */ } }
  function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ } }
  function loadSave() { try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { return null; } }
  function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } }

  // The api is what content.js sees. Everything the writing can ask about goes through here.
  function makeApi() {
    const now = new Date();
    const api = {
      get name() { return state.name; },
      get prevName() { return state.prevName; },
      get day() { return state.day; },
      get loop() { return state.loop; },
      get hour() { return now.getHours(); },
      get weekday() { return WEEKDAYS[now.getDay()]; },
      get week() { const d = C.days[state.day]; return d ? (val(d.week, api) || '') : ''; },   // Ashfield's weekday
      get visits() { return meta.visits; },
      get rounds() { return meta.rounds || 0; },
      get visitBudget() { return visitBudget(); },
      get ignoredCount() { return state.ignoredCount; },
      get ending() { return state.ending; },
      burnedBefore: !!meta.burned,
      has: (f) => state.flags.indexOf(f) !== -1,
      trust: (who) => state.trust[who] || 0,
      standing: (who) => standingWord(state.trust[who] || 0),
      resolved: (id) => !!state.resolved[id],
      replied: (id, idx) => { const r = state.resolved[id]; return !!r && r.action === 'reply' && (idx === undefined || r.choice === idx); },
      passedTo: (id, who) => { const r = state.resolved[id]; return !!r && r.action === 'pass' && (who === undefined || r.who === who); },
      ignored: (id) => { const r = state.resolved[id]; return !!r && r.action === 'ignore'; },
      removed: (who) => state.removed.indexOf(who) !== -1,
      // the book's side
      // read it: taken down today, acted on, or left on the board through a night
      seen: (id) => { const r = state.resolved[id]; return state.opened.indexOf(id) !== -1 || !!(r && (r.action !== 'read' || r.day < state.day)); },
      opened: (id) => state.opened.indexOf(id) !== -1,
      knows: (who, key) => !!(state.book.learned[who] && state.book.learned[who][key] != null),
      wrote: (who, key) => !!(state.book.written[who] && (key === undefined ? Object.keys(state.book.written[who]).length : state.book.written[who][key])),
      reached: (id) => !!state.resolved['o:' + id],
      reachedAny: (who, kind) => B.outreach.some((o) => o.who === who && (!kind || o.kind === kind) && !!state.resolved['o:' + o.id]),
      dealt: (who, action) => C.items.filter((it) => it.from === who && state.resolved[it.id] && (!action || state.resolved[it.id].action === action)).length,
      carried: (who) => Object.keys(state.resolved).filter((id) => state.resolved[id].action === 'pass' && state.resolved[id].who === who).length,
      rose: (who) => state.book.ups[who] || 0,
      // the desk's side
      returned: (who) => state.book.returned[who] || 0,
      astray: (who) => state.book.astray[who] || 0,
      gaveBack: (id) => { const g = state.given[id]; return !!g && !!g.right; },
      sortedRight: (id) => { const p = byPost(id); return !!p && state.sorted[id] === p.to; },
      fell: (who) => state.book.downs[who] || 0,
      // writing side
      setFlag: (f) => { if (state.flags.indexOf(f) === -1) state.flags.push(f); },
      unflag: (f) => { state.flags = state.flags.filter((x) => x !== f); },
      addTrust: (who, n) => { state.trust[who] = (state.trust[who] || 0) + n; },
      remove: (who) => { if (state.removed.indexOf(who) === -1) state.removed.push(who); },
      setEnding: (e) => { state.ending = e; },
    };
    return api;
  }

  function standingWord(n) {
    if (n <= -3) return 'Cold';
    if (n <= -1) return 'Wary';
    if (n === 0) return 'Stranger';
    if (n === 1) return 'Acquainted';
    if (n <= 3) return 'Trusted';
    return 'Close';
  }

  function applyEffects(e, api) {
    if (!e) return;
    if (typeof e === 'function') { e(api); return; }
    if (e.trust) Object.keys(e.trust).forEach((w) => api.addTrust(w, e.trust[w]));
    if (e.flags) e.flags.forEach(api.setFlag);
    if (e.unflag) e.unflag.forEach(api.unflag);
    if (e.remove) api.remove(e.remove);
    if (e.ending) api.setEnding(e.ending);
  }

  // The book remembers when you made someone warmer or colder by your own hand.
  function snapshotTrust() { return Object.assign({}, state.trust); }
  function trackTrust(before) {
    Object.keys(C.villagers).forEach((w) => {
      const d = (state.trust[w] || 0) - (before[w] || 0);
      if (d > 0) state.book.ups[w] = (state.book.ups[w] || 0) + d;
      else if (d < 0) state.book.downs[w] = (state.book.downs[w] || 0) - d;
    });
  }

  // ------------------------------------------------------------ text markup
  // {{name}}  -> your name
  // [[a|b]]   -> shows a, then quietly becomes b while you read
  // ~~x~~     -> crossed out
  // __x__     -> smudged
  // ^^x^^     -> shivering
  function markup(text, api) {
    let t = esc(text).replace(/\{\{name\}\}/g, esc(api.name));
    t = t.replace(/\[\[([^|\]]*)\|([^\]]*)\]\]/g, '<span class="swap" data-after="$2">$1</span>');
    t = t.replace(/~~([^~]+)~~/g, '<span class="struck">$1</span>');
    t = t.replace(/__([^_]+)__/g, '<span class="smudge">$1</span>');
    t = t.replace(/\^\^([^^]+)\^\^/g, '<span class="shiver">$1</span>');
    return t.split(/\n\s*\n/).map((p) => '<p>' + p.replace(/\n/g, '<br>') + '</p>').join('');
  }
  function plain(text, api) {
    return String(text).replace(/\{\{name\}\}/g, api.name)
      .replace(/\[\[([^|\]]*)\|([^\]]*)\]\]/g, '$1').replace(/~~|__|\^\^/g, '');
  }

  // A [[a|b]] span quietly becomes b a few seconds after you start reading it.
  // Additive: each span is armed once, so calling this after any render is safe.
  function armSwaps(root) {
    (root || document).querySelectorAll('.swap:not([data-armed])').forEach((el, i) => {
      el.dataset.armed = '1';
      const t = setTimeout(() => {
        el.classList.add('flick');
        swapTimers.push(setTimeout(() => { el.textContent = el.dataset.after; el.classList.remove('flick'); }, 260));
      }, 2200 + i * 900 + Math.random() * 1500);
      swapTimers.push(t);
    });
  }
  function clearSwaps() { swapTimers.forEach(clearTimeout); swapTimers = []; }

  // ------------------------------------------------------------ villagers / senders
  function senderName(item) {
    const v = C.villagers[item.from];
    if (v) return v.name;
    return C.senders[item.from] || item.from;
  }
  function firstName(who) {
    const v = C.villagers[who];
    if (!v) return who;
    return v.name.split(' ').filter((w) => !/^(Rev\.|Dr|Mrs|Mr|Miss)$/.test(w))[0] || v.name;
  }
  function pinColour(item) {
    if (item.type === 'notice') return 'blue';
    if (item.type === 'rumour') return 'green';
    if (item.type === 'ash') return 'black';
    return '';
  }
  function placeName(k) { return B.places[k] || k; }
  function listNames(arr) {
    if (!arr.length) return '';
    if (arr.length === 1) return arr[0];
    return arr.slice(0, -1).join(', ') + ' and ' + arr[arr.length - 1];
  }

  // ------------------------------------------------------------ day setup
  function itemsForDay(day, api) {
    return C.items.filter((it) => it.day === day && (!it.when || it.when(api)))
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  }
  function isRemovedSender(item) { return state.removed.indexOf(item.from) !== -1; }
  function needsAnswer(item) { return !!((item.replies && item.replies.length) || item.pass); }

  // ------------------------------------------------------------ what yesterday puts on the board
  // Not everything pinned up is written in content.js. Some of it is the village answering for
  // what you did yesterday: post you put in the wrong hands, and notes you wrote of your own.
  // The whole batch is rebuilt from the save each time, so a reload pins the same board back up.
  function pickFrom(list, seed) { return list[hash(seed) % list.length]; }
  function alive(who) { return !!C.villagers[who] && state.removed.indexOf(who) === -1; }

  function generatedItems() {
    const out = [];
    const api = makeApi();
    const A = B.astray || {};

    // a letter in the wrong hands. You are not told on the day; you are told on the board.
    (B.post || []).forEach((p) => {
      const hole = state.sorted[p.id];
      if (!hole || hole === 'late' || hole === rightHole(p)) return;
      const special = (A.special || {})[p.id + ':' + hole];
      if (special) {
        out.push({ id: 'gen:astray:' + p.id, day: p.day + 1, order: -5, gen: true,
          type: special.type || 'letter', from: special.from || hole,
          subject: special.subject, body: special.body, sign: special.sign });
        return;
      }
      let from, set;
      if (alive(hole)) {
        from = hole;
        set = (A.opened && (A.opened[hole] || A.opened['*'])) || [];
      } else {
        from = alive(p.to) ? p.to : 'parish';
        set = (from === 'parish' ? A.council : hole === 'return' ? A.sent : A.kept) || [];
      }
      if (!set.length) return;
      const spec = pickFrom(set, 'astray' + p.id);
      out.push({ id: 'gen:astray:' + p.id, day: p.day + 1, order: -5, gen: true,
        type: from === 'parish' ? 'notice' : 'letter', from: from,
        subject: spec.subject, body: spec.body, sign: spec.sign });
    });

    // a notice about something in the box. Somebody always knows something, and it is never enough.
    Object.keys(state.book.posted || {}).forEach((id) => {
      const o = (B.lost || []).filter((x) => x.id === id)[0];
      const spec = (B.lostNotices || {})[id] || (B.lostNotices || {})['*'];
      if (!o || !spec) return;
      const from = alive(spec.from) || spec.from === 'parish' || spec.from === 'someone' ? spec.from : 'someone';
      out.push({ id: 'gen:lf:' + id, day: state.book.posted[id] + 1, order: 4, gen: true,
        type: spec.type || 'rumour', from: from,
        subject: val(spec.subject, api) || 'Your notice',
        body: spec.body, sign: spec.sign, answering: { key: val(o.what, api), text: 'Found in the box, and pinned up: whose is it?', board: true } });
    });

    // a note of your own, answered
    Object.keys(state.book.written || {}).forEach((who) => {
      const mine = state.book.written[who] || {};
      Object.keys(mine).forEach((key) => {
        const w = mine[key];
        const answering = { who: who, key: key, text: w.text, board: w.where === 'board' };
        if (w.where === 'board') {
          const set = (B.boardReplies || {})[who + ':' + key] || (B.boardReplies || {})['*'] || [];
          set.forEach((r, i) => {
            if (!alive(r.from) && r.from !== 'parish' && r.from !== 'someone') return;
            out.push({ id: 'gen:board:' + who + ':' + key + ':' + i, day: w.day + 1, order: 6 + i, gen: true,
              type: r.type || 'letter', from: r.from, subject: r.subject, body: r.body, sign: r.sign, answering: answering });
          });
          return;
        }
        if (!alive(who)) return;
        const set = (B.noteReplies || {})[who] || {};
        const spec = set[key] || (set['*'] ? pickFrom(set['*'], who + ':' + key + ':' + w.day) : null);
        if (!spec) return;
        out.push({ id: 'gen:note:' + who + ':' + key, day: w.day + 1, order: 5, gen: true,
          type: 'letter', from: who, subject: spec.subject, body: spec.body, sign: spec.sign, answering: answering });
      });
    });
    return out;
  }

  function syncGenerated() {
    C.items = C.items.filter((it) => !it.gen);
    Object.keys(C.byId).forEach((id) => { if (C.byId[id].gen) delete C.byId[id]; });
    generatedItems().forEach((it) => { C.items.push(it); C.byId[it.id] = it; });
  }

  function beginDay() {
    clearSwaps();
    syncGenerated();
    const api = makeApi();
    state.dayItems = itemsForDay(state.day, api).map((it) => it.id);
    selectedId = null;
    sortHeld = null;
    save();
    renderAll();
  }

  // ------------------------------------------------------------ who you know
  // You know somebody once you have written back to them. Carrying a letter round to their door,
  // or putting something of theirs back in their hand, counts too: you have stood in front of them.
  function metPerson(who) {
    if (state.removed.indexOf(who) !== -1) return false;
    const byLetter = C.items.some((it) => {
      const r = state.resolved[it.id];
      if (!r) return false;
      if (it.from === who && r.action === 'reply') return true;
      return r.action === 'pass' && r.who === who;
    });
    if (byLetter) return true;
    return Object.keys(state.given).some((id) => state.given[id] && state.given[id].who === who && state.given[id].right);
  }

  // ------------------------------------------------------------ the book: what you have learned
  // Notes are declared in content.js with a `when`. The first day a `when` comes true, the book
  // writes it down and keeps it, whatever happens after.
  function syncBook(api) {
    const b = state.book;
    let changed = false;
    for (let pass = 0; pass < 3; pass++) {     // a note may depend on one learned in the same pass
      let round = false;
      Object.keys(C.villagers).forEach((who) => {
        if (!b.learned[who]) b.learned[who] = {};
        (B.notes[who] || []).forEach((n) => {
          if (b.learned[who][n.key] == null && safe(() => !!n.when(api, who), false)) { b.learned[who][n.key] = state.day; round = true; }
        });
      });
      if (!round) break;
      changed = true;
    }
    if (changed) save();
    return changed;
  }
  function bookCount() {
    const b = state.book;
    let n = 0;
    Object.keys(b.learned).forEach((w) => { n += Object.keys(b.learned[w]).length; });
    return n;
  }
  function bookNew() { return Math.max(0, bookCount() - (state.book.seenCount || 0)); }

  // ------------------------------------------------------------ the day: where everyone is
  function fmtHour(h) {
    if (h >= 24) return 'morning';
    const hh = Math.floor(h), m = Math.round((h - hh) * 60);
    const h12 = ((hh + 11) % 12) + 1;
    return h12 + (m ? '.' + (m < 10 ? '0' + m : m) : '') + (hh >= 12 ? 'pm' : 'am');
  }
  function fmtSpan(from, to) {
    if (to == null) return fmtHour(from);
    if (to >= 24) return fmtHour(from) + ' till morning';
    return fmtHour(from) + ' to ' + fmtHour(to);
  }
  // ------------------------------------------------------------ what they do for a living
  // You do not know where anybody is all day. You know what they do, because you deliver to it,
  // and the job is what says when they are free and where that leaves them.
  function jobOf(who) { const w = B.work[who]; return w ? w.job : ''; }
  function meetFor(who, api) {
    const w = B.work[who];
    if (!w || !w.meet) return null;
    return safe(() => val(w.meet, api), null);
  }
  // Where an outreach option happens: its own plans if it has any, otherwise their working day.
  function plansFor(o, api) {
    const own = safe(() => val(o.plans, api), null);
    if (own && own.length) return own;
    const m = meetFor(o.who, api);
    return m ? [{ at: m.at, hour: m.hour, to: m.to, doing: m.doing, with: 'you' }] : [];
  }
  function meetLine(who, api, plans) {
    const p = (plans && plans[0]) || null;
    if (!p) return '';
    return placeName(p.at) + ', ' + fmtHour(p.hour);
  }

  // ------------------------------------------------------------ the desk: the morning post
  // The van leaves a bag on the desk. Open it and the letters come out in a pile, face up.
  // Drag one across to whoever it belongs to. Put it in the wrong hand and it gets read by the
  // wrong person before it gets to the right one.
  function byPost(id) { return (B.post || []).filter((p) => p.id === id)[0]; }
  function postForDay(day, api) {
    return (B.post || []).filter((p) => p.day === day && (!p.when || safe(() => !!p.when(api), false)));
  }
  function postLeft(api) { return postForDay(state.day, api).filter((p) => !state.sorted[p.id]); }
  // Everybody a letter can go to: the village down one side of the desk, then you, then the van.
  function residents() {
    return Object.keys(C.villagers).filter((k) => state.removed.indexOf(k) === -1)
      .map((k) => ({ key: k, name: C.villagers[k].name, sub: C.villagers[k].address || C.villagers[k].role }))
      .concat([
        { key: 'keeper', name: state.name, sub: 'the pigeonhole with your own hand on it', mine: true },
        { key: 'return', name: 'Back to the van', sub: 'return to sender', van: true },
      ]);
  }
  function rightHole(p) {
    // if the addressee is no longer in Ashfield, there is nowhere for it to go but back
    if (p.to && C.villagers[p.to] && state.removed.indexOf(p.to) !== -1) return 'return';
    return p.to;
  }
  function holeName(k) {
    if (k === 'keeper') return 'your own pigeonhole';
    if (k === 'return') return 'the sack for the van';
    if (k === 'late') return 'the sack, overnight';
    return C.villagers[k] ? C.villagers[k].name : k;
  }
  function doSort(p, hole) {
    const api = makeApi();
    if (state.sorted[p.id]) return;
    const right = hole === rightHole(p);
    const before = snapshotTrust();
    state.sorted[p.id] = hole;
    // some wrong houses are not a slip. Putting a particular letter in a particular hand is a
    // thing you can mean to do, and those have their own consequence instead of the flat penalty.
    const special = !right && (((B.astray || {}).special || {})[p.id + ':' + hole]);
    if (right) {
      api.setFlag('post:' + p.id);
    } else if (special) {
      applyEffects(special.effects, api);
      api.setFlag('astray:' + p.id);
    } else if (C.villagers[hole]) {
      api.addTrust(hole, -1);
      state.book.astray[hole] = (state.book.astray[hole] || 0) + 1;
      api.setFlag('astray:' + p.id);
    } else {
      api.setFlag('astray:' + p.id);
    }
    trackTrust(before);
    sortHeld = null;
    save();
    refreshSort();
    renderAll();
  }
  function sortHtml(api) {
    const all = postForDay(state.day, api);
    const todo = all.filter((p) => !state.sorted[p.id]);
    const done = all.filter((p) => state.sorted[p.id]);
    const held = todo.filter((p) => p.id === sortHeld)[0];
    let html = '<p class="sort-intro">' + (todo.length
      ? 'The van has been. ' + (todo.length === 1 ? 'One thing' : esc(String(todo.length)) + ' things') + ' out of the bag and onto the desk.'
      : all.length ? 'The bag is empty. The desk is clear, and the board is waiting.'
      : 'No van today. The bag hangs on its hook, flat.') + '</p>';
    if (todo.length) {
      html += '<div class="sortdesk"><div class="pile" id="pile" style="height:' + (96 + (todo.length - 1) * 44) + 'px">'
        + todo.map((p, i) => '<button type="button" class="envelope' + (held && held.id === p.id ? ' held' : '') + '" data-env="' + esc(p.id) + '"'
          + ' style="--i:' + i + ';--z:' + (i + 1) + ';--tilt:' + rot(p.id, 1.6).toFixed(2) + 'deg">'
          + '<span class="stamp-sq"></span><span class="face">' + esc(plain(val(p.face, api), api)) + '</span></button>').join('')
        + '</div>';
      html += '<div class="residents">' + residents().map((h) => '<button type="button" class="resident'
        + (h.mine ? ' mine' : '') + (h.van ? ' van' : '') + '" data-hole="' + esc(h.key) + '">'
        + '<span class="resident-name">' + esc(h.name) + '</span><span class="resident-sub">' + esc(h.sub) + '</span></button>').join('') + '</div></div>';
      html += '<p class="hint sort-held">' + (held
        ? 'In your hand: <b>' + esc(plain(val(held.face, api), api)) + '</b>. Now click whoever it belongs to.'
        : 'Drag a letter across to whoever it belongs to. Or click it, then click them.') + '</p>';
    }
    if (done.length) {
      // What was in them is not your business and never was. All the desk records is where it went.
      const off = done.filter((p) => state.sorted[p.id] !== 'late' && state.sorted[p.id] !== rightHole(p));
      const late = done.filter((p) => state.sorted[p.id] === 'late');
      html += '<h4 class="sorted-head">Sorted</h4><ul class="sorted">' + done.map((p) => {
        const hole = state.sorted[p.id];
        const cls = hole === 'late' ? 'late' : hole === rightHole(p) ? 'ok' : 'off';
        return '<li class="' + cls + '"><span class="face">' + esc(plain(val(p.face, api), api)) + '</span>'
          + '<span class="went">' + esc(hole === 'late' ? 'left in the sack overnight' : 'to ' + holeName(hole)) + '</span></li>';
      }).join('') + '</ul>';
      html += '<p class="sort-verdict' + (off.length ? ' bad' : '') + '">' + (off.length
        ? esc(off.length === 1 ? 'One of them has gone to the wrong house.' : String(off.length) + ' of them have gone to the wrong house.')
          + ' Nothing happens about it today. It will be on the board in the morning.'
        : late.length
          ? 'Nothing in the wrong hands. What stayed in the sack goes out a day late, which nobody mentions, which is how you know.'
          : 'All of it went where it was addressed. You still do not know what any of it said, and that is the job.') + '</p>';
    }
    return html;
  }
  function refreshSort() {
    const body = $('panel-body');
    if (!body || $('overlay-panel').hidden || !body.querySelector('.sort-intro')) return;
    const api = makeApi();
    body.innerHTML = sortHtml(api);
    wireSort(api);
    armSwaps(body);
  }
  function openSort() {
    const api = makeApi();
    sortHeld = null;
    openPanel('The post bag', sortHtml(api), 'sort');
    wireSort(api);
    armSwaps($('panel-body'));
  }
  function wireSort(api) {
    const body = $('panel-body');
    body.querySelectorAll('[data-env]').forEach((b) => {
      b.onclick = () => {
        if (Date.now() - lastDragEnd < 350) return;      // that click was the end of a drag
        sortHeld = sortHeld === b.dataset.env ? null : b.dataset.env;
        refreshSort();
      };
      b.addEventListener('pointerdown', startLetterDrag);
    });
    body.querySelectorAll('[data-hole]').forEach((b) => {
      b.onclick = () => { const p = byPost(sortHeld); if (p) doSort(p, b.dataset.hole); };
    });
  }

  // Lift a letter off the pile and carry it across the desk. Pointer events, so a finger works too.
  function startLetterDrag(e) {
    if (e.button != null && e.button !== 0) return;
    const el = e.currentTarget;
    const p = byPost(el.dataset.env);
    if (!p || state.sorted[p.id]) return;
    const box = el.getBoundingClientRect();
    // The thing in your hand is smaller than the thing on the desk, so that you can see the names
    // you are aiming at. Hold it near the corner you picked it up by.
    const gw = Math.min(box.width, 230), gh = 46;
    const grab = { x: Math.min(Math.max(e.clientX - box.left, 14), gw - 14), y: gh / 2 };
    const ghost = el.cloneNode(true);
    ghost.className = 'envelope ghost';
    ghost.style.cssText = 'width:' + gw + 'px;height:' + gh + 'px';
    let moved = false, over = null;

    const place = (x, y) => { ghost.style.left = (x - grab.x) + 'px'; ghost.style.top = (y - grab.y) + 'px'; };
    const move = (ev) => {
      if (!moved) {
        if (Math.abs(ev.clientX - e.clientX) + Math.abs(ev.clientY - e.clientY) < 6) return;
        moved = true;
        el.classList.add('lifted');
        document.body.classList.add('dragging');
        document.body.appendChild(ghost);
      }
      ev.preventDefault();
      place(ev.clientX, ev.clientY);
      const under = document.elementFromPoint(ev.clientX, ev.clientY);
      const res = under && under.closest ? under.closest('.resident') : null;
      if (res !== over) {
        if (over) over.classList.remove('over');
        over = res;
        if (over) over.classList.add('over');
      }
    };
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
      if (over) over.classList.remove('over');
      el.classList.remove('lifted');
      document.body.classList.remove('dragging');
      if (ghost.parentNode) ghost.parentNode.removeChild(ghost);
      if (!moved) return;                                // a plain click; let onclick have it
      lastDragEnd = Date.now();
      if (over) { sortHeld = null; doSort(p, over.dataset.hole); }
      else { sortHeld = p.id; refreshSort(); }            // dropped on the desk: still in your hand
    };
    place(e.clientX, e.clientY);
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
  }

  // ------------------------------------------------------------ the desk: lost property
  // Things turn up. Whose they are is in the address book, if you have been paying attention.
  function lostAll(api) {
    return (B.lost || []).filter((o) => o.day <= state.day && (!o.when || safe(() => !!o.when(api), false)));
  }
  function lostOpen(api) { return lostAll(api).filter((o) => !state.given[o.id]); }
  function hintsFor(o, api) {
    return (o.hints || []).map((h) => {
      if (!api.knows(h.who, h.key)) return null;
      const note = (B.notes[h.who] || []).filter((x) => x.key === h.key)[0];
      if (!note) return null;
      return safe(() => val(note.text, api), '') || '';
    }).filter(Boolean).slice(0, 2);
  }
  function doGive(o, who) {
    const api = makeApi();
    if (state.given[o.id]) return;
    const right = who === o.owner;
    const before = snapshotTrust();
    if (who === 'keep') {
      if (!o.keep) return;
      state.given[o.id] = { who: 'keep', right: true, day: state.day, outcome: val(o.keep.outcome, api) };
      applyEffects(o.keep.effects, api);
    } else if (right) {
      state.given[o.id] = { who: who, right: true, day: state.day, outcome: val(o.right.outcome, api) };
      applyEffects(o.right.effects, api);
      state.book.returned[who] = (state.book.returned[who] || 0) + 1;
      api.setFlag('lf:' + o.id);
    } else {
      const tries = state.tried[o.id] || (state.tried[o.id] = []);
      if (tries.indexOf(who) === -1) tries.push(who);
      api.setFlag('lf_wrong:' + o.id);
    }
    trackTrust(before);
    save();
    refreshLost();
    renderAll();
  }
  function lostHtml(api) {
    const open = lostOpen(api);
    const done = lostAll(api).filter((o) => state.given[o.id]);
    let html = '<p class="sort-intro">A box under the desk. Things turn up in it, and you are expected to know whose they are.'
      + (open.length ? ' What you know about people is in the address book; the box only tells you what a thing looks like.' : '') + '</p>';
    if (!open.length && !done.length) html += '<p class="archive-note">The box is empty. Give it a day or two.</p>';
    open.forEach((o) => {
      const tries = state.tried[o.id] || [];
      const hints = hintsFor(o, api);
      html += '<div class="lf-item"><h3>' + esc(val(o.what, api)) + '</h3>'
        + '<p class="lf-detail">' + markup(val(o.detail, api), api).replace(/<\/?p>/g, '') + '</p>';
      if (hints.length) {
        html += '<div class="lf-hints"><span class="lf-hint-label">Your book, somewhere:</span>'
          + hints.map((h) => '<p class="lf-hint">“' + esc(h) + '”</p>').join('') + '</div>';
      } else {
        html += '<p class="hint">Nothing in your book fits it yet. Learn more about people and come back.</p>';
      }
      if (tries.length) html += '<p class="lf-tried">Not ' + esc(listNames(tries.map(firstName))) + '.</p>';
      // asking the village. The board answers in the morning, and what it answers is a step, not an answer.
      const posted = state.book.posted[o.id];
      if (posted == null) {
        html += '<div class="lf-ask">' + (canWriteNote()
          ? '<button type="button" class="btn btn-ghost" data-post-lost="' + esc(o.id) + '">Pin a notice: found, whose is it?</button>'
          : '<span class="hint">You have done your writing for today.</span>') + '</div>';
      } else if (posted >= state.day) {
        html += '<p class="lf-posted">Your notice is on the board. Somebody will read it before you have finished pinning it.</p>';
      } else {
        const said = (B.lostNotices || {})[o.id];
        html += '<p class="lf-posted">Your notice, pinned on day ' + posted + '.'
          + (said && said.clue ? ' <span class="lf-clue">' + esc(val(said.clue, api)) + '</span>' : ' Nobody has owned up.') + '</p>';
      }
      const who = Object.keys(C.villagers).filter((k) => state.removed.indexOf(k) === -1 && tries.indexOf(k) === -1);
      html += '<div class="row"><select data-give-who="' + esc(o.id) + '">'
        + who.map((k) => '<option value="' + k + '">' + esc(C.villagers[k].name) + '</option>').join('')
        + '</select><button type="button" class="btn" data-give="' + esc(o.id) + '">Give it back</button>'
        + (o.keep ? '<button type="button" class="btn btn-ghost lf-keep" data-keep="' + esc(o.id) + '">' + esc(val(o.keep.label, api)) + '</button>' : '')
        + '</div></div>';
    });
    done.forEach((o) => {
      const g = state.given[o.id];
      html += '<div class="lf-item done"><h3>' + esc(val(o.what, api)) + '</h3>'
        + '<p class="lf-went">' + esc(g.who === 'keep' ? 'Kept.' : 'Given back to ' + (C.villagers[g.who] ? C.villagers[g.who].name : g.who) + ', on day ' + g.day + '.') + '</p>'
        + '<div class="outcome">' + markup(g.outcome || '', api) + '</div></div>';
    });
    return html;
  }
  function refreshLost() {
    const body = $('panel-body');
    if (!body || $('overlay-panel').hidden || !body.querySelector('.lf-item, .lf-empty')) return;
    const api = makeApi();
    body.innerHTML = lostHtml(api);
    wireLost();
    armSwaps(body);
  }
  function openLost() {
    const api = makeApi();
    openPanel('Lost and found', '<div class="lf-empty"></div>' + lostHtml(api), 'lost');
    wireLost();
    armSwaps($('panel-body'));
  }
  function wireLost() {
    const body = $('panel-body');
    body.querySelectorAll('[data-give]').forEach((b) => {
      b.onclick = () => {
        const o = (B.lost || []).filter((x) => x.id === b.dataset.give)[0];
        const sel = body.querySelector('[data-give-who="' + b.dataset.give + '"]');
        if (o && sel) doGive(o, sel.value);
      };
    });
    body.querySelectorAll('[data-keep]').forEach((b) => {
      b.onclick = () => { const o = (B.lost || []).filter((x) => x.id === b.dataset.keep)[0]; if (o) doGive(o, 'keep'); };
    });
    body.querySelectorAll('[data-post-lost]').forEach((b) => {
      b.onclick = () => {
        const id = b.dataset.postLost;
        if (state.book.posted[id] != null || !canWriteNote()) return;
        state.book.posted[id] = state.day;
        makeApi().setFlag('posted:' + id);
        save();
        refreshLost();
        renderAll();
      };
    });
  }
  function lostLine(o, g, api) {
    if (g.who === 'keep') return 'You kept <b>' + esc(val(o.what, api)) + '</b> out of the box';
    return 'You gave back <b>' + esc(val(o.what, api)) + '</b>';
  }

  // ------------------------------------------------------------ your day
  // Only the things you have actually said yes to: replies you pinned, calls you made.
  function myDay(api) {
    const out = [];
    const take = (plans, from, defDay, src) => {
      (safe(() => val(plans, api), null) || []).forEach((p) => {
        const d = p.day != null ? p.day : defDay;
        if (d !== state.day || p.with !== 'you') return;
        const who = p.who && p.who !== '*' ? p.who : from;
        if (state.removed.indexOf(who) !== -1) return;
        if (out.some((e) => e.who === who && e.at === p.at && e.from === p.hour)) return;
        out.push({ who: who, at: p.at, from: p.hour, to: p.to, doing: val(p.doing, api), src: src });
      });
    };
    C.items.forEach((it) => {
      const r = state.resolved[it.id];
      if (!r || r.action !== 'reply' || !it.replies || !it.replies[r.choice]) return;
      take(it.replies[r.choice].plans, it.from, r.day, 'reply');
    });
    (state.book.reaches || []).forEach((x) => {
      const o = B.outreach.filter((q) => q.id === x.id)[0];
      if (o) take(plansFor(o, api), o.who, x.day, 'reach');
    });
    return out.sort((a, b) => a.from - b.from);
  }
  // Meetings you agreed to on the board. Saying yes to one spends the day's call.
  function appointments(api) { return myDay(api).filter((e) => e.src === 'reply'); }

  // ------------------------------------------------------------ the desk
  const DESK_ART = {
    post: '<svg viewBox="0 0 72 72" aria-hidden="true" focusable="false">'
      + '<ellipse cx="36" cy="63" rx="23" ry="4" fill="rgba(0,0,0,.28)"/>'
      + '<path d="M19 27c0-5 7-8 17-8s17 3 17 8l5 25c1 7-10 11-22 11s-23-4-22-11z" fill="#9c7748" stroke="#43301c" stroke-width="2" stroke-linejoin="round"/>'
      + '<path d="M19 27c5 4 29 4 34 0" fill="none" stroke="#43301c" stroke-width="1.5" opacity=".6"/>'
      + '<path d="M21 25c3-7 27-7 30 0" fill="none" stroke="#d8b071" stroke-width="3.2" stroke-linecap="round"/>'
      + '<g transform="rotate(-7 37 47)"><rect x="27" y="40" width="21" height="14" rx="1.5" fill="#f4ead2" stroke="#43301c" stroke-width="1.6"/>'
      + '<path d="M27.6 40.8 37.5 48l9.9-7.2" fill="none" stroke="#43301c" stroke-width="1.3"/></g></svg>',
    book: '<svg viewBox="0 0 72 72" aria-hidden="true" focusable="false">'
      + '<rect x="16" y="12" width="42" height="50" rx="2.5" fill="#8d332c" stroke="#431814" stroke-width="2"/>'
      + '<rect x="16" y="12" width="7" height="50" fill="#6d241f" stroke="#431814" stroke-width="2"/>'
      + '<rect x="28" y="22" width="19" height="16" rx="1" fill="none" stroke="#e6c98f" stroke-width="1.4"/>'
      + '<path d="M31 27h13M31 31h13M31 35h8" stroke="#e6c98f" stroke-width="1.3" stroke-linecap="round"/>'
      + '<path d="M56 12v22l-3-3.5-3 3.5V12z" fill="#e0b451" stroke="#431814" stroke-width="1.2" stroke-linejoin="round"/></svg>',
    lost: '<svg viewBox="0 0 72 72" aria-hidden="true" focusable="false">'
      + '<path d="M13 30h46v27a3 3 0 0 1-3 3H16a3 3 0 0 1-3-3z" fill="#c99a63" stroke="#59401f" stroke-width="2"/>'
      + '<path d="M13 30l7-9h32l7 9z" fill="#dcb47f" stroke="#59401f" stroke-width="2" stroke-linejoin="round"/>'
      + '<path d="M36 21v9" stroke="#59401f" stroke-width="1.4"/>'
      + '<g transform="rotate(-3 36 45)"><rect x="23" y="38" width="26" height="15" rx="1" fill="#f4ead2" stroke="#59401f" stroke-width="1.5"/>'
      + '<path d="M27 43h18M27 47h11" stroke="#59401f" stroke-width="1.3" stroke-linecap="round"/></g></svg>',
    old: '<svg viewBox="0 0 72 72" aria-hidden="true" focusable="false">'
      + '<g stroke="#6b5636" stroke-width="1.6">'
      + '<rect x="15" y="40" width="42" height="13" rx="1.5" fill="#ded0ac" transform="rotate(3 36 46)"/>'
      + '<rect x="15" y="31" width="42" height="13" rx="1.5" fill="#e9dcbc" transform="rotate(-2 36 37)"/>'
      + '<rect x="15" y="22" width="42" height="13" rx="1.5" fill="#f4ecd4" transform="rotate(1.5 36 28)"/></g>'
      + '<path d="M36 17v40M13 37h46" stroke="#8d332c" stroke-width="2.2" fill="none"/>'
      + '<circle cx="36" cy="37" r="3.2" fill="#8d332c"/></svg>',
  };

  function deskThing(kind, attr, label, sub, badge) {
    return '<button type="button" class="thing thing-' + kind + '" ' + attr + '>'
      + '<span class="art">' + DESK_ART[kind] + '</span>'
      + '<span class="thing-label">' + esc(label) + '</span>'
      + '<span class="thing-sub">' + esc(sub) + '</span>'
      + (badge ? '<span class="badge">' + badge + '</span>' : '') + '</button>';
  }

  // The desk itself: the bag, the book, the box, the bundle of old letters, and — only if you have
  // said you will be somewhere — the note that says where.
  function renderDesk(api) {
    const d = C.days[state.day] || {};
    const post = postLeft(api).length;
    const lost = lostOpen(api).length;
    const fresh = bookNew();
    const old = Object.keys(state.resolved).filter((id) => C.byId[id] && state.resolved[id].day < state.day).length;
    const appt = appointments(api);
    const left = visitsLeft(api);

    let html = '<div class="desk-head"><p class="desk-when">Day ' + state.day + (d.week ? ' &middot; ' + esc(val(d.week, api)) : '') + '</p>'
      + '<h2 class="desk-who">' + esc(state.name) + '</h2><p class="desk-role">postmaster, Ashfield</p></div>';

    html += '<div class="desk-things">'
      + deskThing('post', 'data-open-post', 'The post bag', post ? 'the van has been' : 'empty, and folded', post)
      + deskThing('book', 'data-open-book=""', 'Address book', appt.length ? 'today is spoken for' : left > 0 ? (left > 1 ? 'two calls left in you' : 'one call left in you') : 'who everybody is', fresh)
      + deskThing('lost', 'data-open-lost', 'Lost and found', lost ? (lost === 1 ? 'one thing in it' : lost + ' things in it') : 'empty, for now', lost)
      + (old ? deskThing('old', 'data-open-archive', 'Old letters', old === 1 ? 'one, kept' : old + ', kept', 0) : '')
      + '</div>';

    if (appt.length) {
      const e = appt[0];
      html += '<div class="appointment"><h3>You said you would be there</h3>'
        + '<p class="appt-when">' + esc(fmtSpan(e.from, e.to)) + '</p>'
        + '<p class="appt-where">' + esc(placeName(e.at)) + ', with <button type="button" class="linkish" data-open-book="' + esc(e.who) + '">' + esc(firstName(e.who)) + '</button></p>'
        + (e.doing ? '<p class="appt-doing">' + esc(e.doing) + '</p>' : '')
        + (appt.length > 1 ? '<p class="appt-doing">You have also promised ' + esc(listNames(appt.slice(1).map((x) => firstName(x.who)))) + ', which is more than a day holds.</p>' : '')
        + '</div>';
    }

    html += '<p class="desk-foot">' + (appt.length
      ? 'That is where you will be today.'
      : left > 0
        ? 'You could call on one person today. The ones you have written back to are in the <button type="button" class="linkish" data-open-book="">address book</button>.'
        : 'You have done your walking for today.') + '</p>';

    const desk = $('desk');
    desk.innerHTML = html;
    wireOpeners(desk);
  }

  // ------------------------------------------------------------ rendering
  function renderAll() {
    syncGenerated();
    const api = makeApi();
    syncBook(api);
    renderTopbar(api);
    renderDesk(api);
    renderBoard(api);
    renderReader(api);
    armSwaps($('screen-game'));
    document.title = state.day >= 9 ? 'Letters to ' + state.name : 'Letters from Ashfield';
  }

  function renderTopbar(api) {
    const d = C.days[state.day] || {};
    $('day-label').textContent = 'Day ' + state.day;
    $('day-week').textContent = val(d.week, api) || '';
    if (state.day >= 9) startDayGlitch(); else stopDayGlitch();
  }

  let glitchTimer = null;
  function startDayGlitch() {
    if (glitchTimer) return;
    const tick = () => {
      const el = $('day-label');
      const fake = ['Day ' + (state.day + 41), 'Day ' + state.day, 'Thursday', 'Day ' + (state.day + 41 * 3), 'Day 1', 'Day ' + state.day];
      el.classList.add('glitch', 'on');
      el.textContent = fake[Math.floor(Math.random() * fake.length)];
      setTimeout(() => { el.classList.remove('on'); el.textContent = 'Day ' + state.day; }, 350);
      glitchTimer = setTimeout(tick, 6000 + Math.random() * 14000);
    };
    glitchTimer = setTimeout(tick, 4000);
  }
  function stopDayGlitch() { if (glitchTimer) { clearTimeout(glitchTimer); glitchTimer = null; } }

  function renderBoard(api) {
    const d = C.days[state.day] || {};
    $('board-intro').innerHTML = markup(val(d.intro, api) || '', api);
    const board = $('board');
    board.innerHTML = '';
    board.classList.toggle('warm', state.day >= 7);

    const items = state.dayItems.map((id) => C.byId[id]).filter((it) => it && !isRemovedSender(it));
    if (!items.length) {
      board.innerHTML = '<p class="board-empty">' + esc(val(d.empty, api) || 'Nothing on the board today.') + '</p>';
    }
    items.forEach((it) => board.appendChild(cardFor(it, api)));

    // the pile underneath
    const oldIgnored = Object.keys(state.resolved).filter((id) => state.resolved[id].action === 'ignore' && state.resolved[id].day < state.day).length;
    const foot = $('board-foot');
    if (oldIgnored) {
      foot.innerHTML = 'Under the others: <button type="button" id="foot-archive">' + oldIgnored + (oldIgnored === 1 ? ' letter' : ' letters') + ' you never answered</button>.';
      $('foot-archive').onclick = () => openArchive();
    } else {
      foot.textContent = state.day >= 8 ? 'The board is warm to the touch.' : '';
    }
  }

  function cardFor(it, api) {
    const r = state.resolved[it.id];
    const el = document.createElement('article');
    el.className = 'paper card ' + it.type + (r && r.action === 'ignore' ? ' yellowed' : '') + (selectedId === it.id ? ' selected' : '');
    el.style.transform = 'rotate(' + rot(it.id).toFixed(2) + 'deg)';
    el.dataset.id = it.id;
    const subj = val(it.subject, api);
    const body = plain(val(it.body, api), api);
    let stamp = '';
    if (r) {
      if (r.action === 'reply') stamp = '<span class="stamp">' + (r.later && r.day === state.day ? 'Agreed' : 'Replied') + '</span>';
      else if (r.action === 'pass') stamp = '<span class="stamp">Passed to ' + esc(firstName(r.who)) + '</span>';
      else if (r.action === 'ignore') stamp = '<span class="stamp grey">Left</span>';
      else if (r.action === 'unpin') stamp = '<span class="stamp grey">Unpinned</span>';
    } else if (it.prepinned && !api.has(it.prepinned.flag)) {
      stamp = '<span class="stamp">Already answered</span>';
    }
    el.innerHTML = '<span class="pin ' + pinColour(it) + '"></span>'
      + '<p class="from">' + esc(senderName(it)) + '</p>'
      + (subj ? '<p class="subject">' + esc(subj) + '</p>' : '')
      + '<p class="excerpt">' + esc(body) + '</p>' + stamp;
    el.onclick = () => { selectedId = it.id; markRead(it); renderAll(); $('reader').classList.add('open'); };
    return el;
  }

  function markRead(it) {
    let changed = false;
    if (state.opened.indexOf(it.id) === -1) { state.opened.push(it.id); changed = true; }
    if (!state.resolved[it.id] && !needsAnswer(it) && !it.prepinned) {
      state.resolved[it.id] = { action: 'read', day: state.day };
      changed = true;
    }
    if (changed) save();
  }

  function renderReader(api, forcedItem) {
    const it = forcedItem || (selectedId && C.byId[selectedId]);
    const paper = $('reader-paper');
    if (!it) {
      // the reader is a modal: with nothing to read, there is nothing on the screen
      paper.hidden = true;
      $('reader').classList.remove('open');
      return;
    }
    paper.hidden = false;
    paper.className = 'paper reader-paper ' + it.type;
    const r = state.resolved[it.id];
    const subj = val(it.subject, api);
    const sign = val(it.sign, api);
    let html = '<button type="button" class="btn btn-ghost close-reader" id="close-reader">Back to the board</button>'
      + '<span class="pin ' + pinColour(it) + '"></span>'
      + '<p class="from">' + esc(senderName(it)) + (C.villagers[it.from] && (it.type === 'letter' || it.type === 'ash') ? ' &middot; to ' + esc(state.name) : '') + '</p>'
      + (subj ? '<p class="subject">' + esc(subj) + '</p>' : '')
      + (it.answering ? '<div class="answering"><span class="answering-head">' + esc(it.answering.board ? 'Answering the notice you pinned about' : 'Answering the note you left about') + ' ' + esc(it.answering.key) + '</span>'
        + '<p>' + esc(it.answering.text) + '</p></div>' : '')
      + '<div class="body">' + markup(val(it.body, api), api) + '</div>'
      + (sign ? '<p class="signoff">' + markup(sign, api).replace(/<\/?p>/g, '') + '</p>' : '');

    const readOnly = it.day !== state.day || !!forcedItem;

    if (r && r.action !== 'read') {
      if (r.action === 'reply') html += '<div class="reply-card">' + esc(r.text) + '</div>';
      if (r.action === 'pass') html += '<div class="reply-card">Passed to ' + esc(C.villagers[r.who] ? C.villagers[r.who].name : r.who) + '.</div>';
      if (r.action === 'unpin') html += '<div class="reply-card strange"><span class="struck">' + esc(r.text) + '</span></div>';
      // something you agreed to do later today has not happened yet; you find out tonight
      if (r.later && r.day === state.day) html += '<div class="outcome pending">' + markup(val(r.laterHint, api) || 'You said you would. It is in the day now, waiting for you, and you will not know how it went until the office is shut.', api) + '</div>';
      else if (r.outcome) html += '<div class="outcome">' + markup(r.outcome, api) + '</div>';
      else if (r.action === 'ignore') html += '<div class="outcome">' + markup('You left it. It has gone the colour of old tea.', api) + '</div>';
    } else if (it.prepinned && !api.has(it.prepinned.flag) && !readOnly) {
      html += '<div class="reply-card strange">' + esc(it.prepinned.text) + '<br><button type="button" class="btn" id="btn-unpin">Unpin it. You did not write that.</button></div>';
      html += '<div class="actions"><p class="hint">' + esc(it.prepinned.hint || '') + '</p></div>';
    } else if (needsAnswer(it) && !readOnly) {
      html += '<div class="actions">';
      const replies = (it.replies || []).filter((o) => !o.when || o.when(api));
      if (replies.length) {
        html += '<h4>Pin a reply</h4>';
        replies.forEach((o) => {
          const idx = it.replies.indexOf(o);
          html += '<button type="button" class="opt" data-reply="' + idx + '"' + (o.shift ? ' data-shift="' + esc(o.shift) + '"' : '') + '>' + esc(plain(o.text, api)) + '</button>';
        });
      }
      if (it.pass) {
        const who = Object.keys(C.villagers).filter((k) => k !== it.from && state.removed.indexOf(k) === -1);
        html += '<h4>Or carry it to someone</h4><div class="row"><select id="pass-who">'
          + who.map((k) => '<option value="' + k + '">' + esc(C.villagers[k].name) + '</option>').join('')
          + '</select><button type="button" class="btn" id="btn-pass">Pass it on</button></div>';
      }
      html += '<div class="row"><button type="button" class="btn btn-ghost" id="btn-leave" style="color:var(--ink-soft);border-color:rgba(0,0,0,.3)">Leave it for now</button></div>';
      if (it.hint) html += '<p class="hint">' + esc(val(it.hint, api)) + '</p>';
      html += '</div>';
    } else if (!needsAnswer(it) && !readOnly) {
      html += '<div class="actions"><p class="hint">' + esc(it.hint ? val(it.hint, api) : 'Nothing to answer. You read it twice anyway.') + '</p></div>';
    }
    if (C.villagers[it.from]) html += '<p class="reader-book"><button type="button" class="linkish" data-open-book="' + it.from + '">' + esc(firstName(it.from)) + '’s page in the address book</button></p>';
    paper.innerHTML = html;
    armSwaps(paper);
    wireReader(it, api);
  }

  function wireOpeners(root) {
    root.querySelectorAll('[data-open-book]').forEach((b) => { b.onclick = () => openBook(b.dataset.openBook || null); });
    root.querySelectorAll('[data-open-post]').forEach((b) => { b.onclick = () => openSort(); });
    root.querySelectorAll('[data-open-lost]').forEach((b) => { b.onclick = () => openLost(); });
    root.querySelectorAll('[data-open-archive]').forEach((b) => { b.onclick = () => openArchive(); });
  }

  function closeReader() {
    $('reader').classList.remove('open');
    selectedId = null;
    renderAll();
  }

  function wireReader(it, api) {
    const close = $('close-reader');
    if (close) close.onclick = closeReader;
    document.querySelectorAll('#reader-paper [data-reply]').forEach((b) => {
      b.onclick = () => doReply(it, parseInt(b.dataset.reply, 10));
      if (b.dataset.shift) {
        // late-game: the option you were about to press changes its mind under your cursor
        const original = b.textContent;
        let flipped = false;
        b.onmouseenter = () => {
          if (flipped) return; flipped = true;
          setTimeout(() => { b.classList.add('glitch', 'on'); b.textContent = b.dataset.shift; }, 400);
          setTimeout(() => { b.classList.remove('on'); b.textContent = original; flipped = false; }, 2600);
        };
      }
    });
    const pass = $('btn-pass');
    if (pass) pass.onclick = () => doPass(it, $('pass-who').value);
    const leave = $('btn-leave');
    if (leave) leave.onclick = closeReader;
    const unpin = $('btn-unpin');
    if (unpin) unpin.onclick = () => {
      state.resolved[it.id] = { action: 'unpin', text: it.prepinned.text, outcome: it.prepinned.outcome, day: state.day };
      api.setFlag(it.prepinned.flag);
      applyEffects(it.prepinned.effects, api);
      save(); renderAll();
    };
    wireOpeners($('reader-paper'));
  }

  // ------------------------------------------------------------ actions
  function doReply(it, idx) {
    const api = makeApi();
    const o = it.replies[idx];
    const before = snapshotTrust();
    state.resolved[it.id] = { action: 'reply', choice: idx, text: plain(val(o.text, api), api), outcome: val(o.outcome, api), day: state.day };
    // a reply that agrees to do something later today: you get the account of it when the day is over
    if (o.overnight) { state.resolved[it.id].later = true; state.resolved[it.id].laterHint = val(o.laterHint, api) || ''; }
    applyEffects(o.effects, api);
    trackTrust(before);
    save();
    if (state.ending === 'burn') { runBurn(); return; }
    renderAll();
  }

  function doPass(it, who) {
    const api = makeApi();
    const spec = (it.pass && (it.pass[who] || it.pass['*'])) || {};
    const outcome = val(spec.outcome, api) || (C.villagers[who].name + ' takes it, reads it, and does not say anything.');
    const before = snapshotTrust();
    state.resolved[it.id] = { action: 'pass', who: who, outcome: outcome, day: state.day };
    applyEffects(spec.effects, api);
    api.setFlag('passed:' + it.id + ':' + who);
    trackTrust(before);
    save(); renderAll();
  }

  // ------------------------------------------------------------ reaching out
  // Two different budgets, because they are two different things.
  //  - Leaving the desk is one a day, whoever it is for. Agreeing on the board to meet somebody
  //    spends it just as walking there does: a day holds one visit.
  //  - Asking somebody something is one per person per day. You can ask the whole village a
  //    question each; you cannot ask any of them two.
  function visitsLeft(api) {
    api = api || makeApi();
    const walked = (state.book.reaches || []).filter((x) => x.day === state.day && x.kind === 'visit').length;
    const booked = appointments(api).length;
    return Math.max(0, visitBudget() - walked - booked);
  }
  function askedToday(who) { return (state.book.reaches || []).some((x) => x.day === state.day && x.who === who && x.kind !== 'visit'); }
  function budgetLeft(o, api) { return o.kind === 'visit' ? visitsLeft(api) > 0 : !askedToday(o.who); }
  // reachOpen: the option itself is live. reachAvailable: and you know them, and you have it in you.
  function reachOpen(o, api) {
    if (state.removed.indexOf(o.who) !== -1) return false;
    if (o.when && !safe(() => !!o.when(api), false)) return false;
    const r = state.resolved['o:' + o.id];
    if (!r) return true;
    if (!o.repeat) return false;
    return state.day - r.day >= o.repeat;
  }
  function reachAvailable(o, api) { return reachOpen(o, api) && metPerson(o.who) && budgetLeft(o, api); }
  function callable(api) {
    return Object.keys(C.villagers).filter((k) => metPerson(k) && B.outreach.some((o) => o.who === k && reachOpen(o, api)));
  }
  function doReach(o) {
    const api = makeApi();
    if (!reachAvailable(o, api)) return;
    const before = snapshotTrust();
    const rec = { id: o.id, who: o.who, kind: o.kind || 'ask', text: plain(val(o.text, api), api), outcome: val(o.outcome, api) || '', day: state.day };
    state.resolved['o:' + o.id] = { action: 'reach', who: o.who, kind: rec.kind, text: rec.text, outcome: rec.outcome, day: state.day };
    state.book.reaches.push(rec);
    applyEffects(o.effects, api);
    trackTrust(before);
    save();
    if (state.ending === 'burn') { closePanel(); runBurn(); return; }
    renderAll();
    renderBookReach(makeApi());
    refreshBookPage(o.who);
  }

  // ------------------------------------------------------------ end of day
  function endDayRequested() {
    const api = makeApi();
    const open = state.dayItems.map((id) => C.byId[id]).filter((it) => it && !isRemovedSender(it) && needsAnswer(it) && !state.resolved[it.id]);
    const sack = postLeft(api).length;
    const bits = [];
    if (open.length) bits.push(open.length + (open.length === 1 ? ' letter is still waiting on the board' : ' letters are still waiting on the board'));
    if (sack) bits.push(sack + (sack === 1 ? ' thing is still in the bag' : ' things are still in the bag'));
    if (bits.length) {
      confirm(listNames(bits).replace(/^./, (c) => c.toUpperCase()) + '. Shut up the office anyway?', () => endDay(api));
    } else {
      endDay(api);
    }
  }

  function endDay(api) {
    // ignored letters
    state.dayItems.forEach((id) => {
      const it = C.byId[id];
      if (!it || isRemovedSender(it) || state.resolved[id]) return;
      if (needsAnswer(it)) {
        state.ignoredCount++;
        state.resolved[id] = { action: 'ignore', outcome: it.onIgnore && val(it.onIgnore.outcome, api), day: state.day };
        if (it.onIgnore) applyEffects(it.onIgnore.effects, api);
      } else if (it.prepinned && !api.has(it.prepinned.flag)) {
        // you let the strange reply stand
        state.resolved[id] = { action: 'reply', text: it.prepinned.text, outcome: it.prepinned.leftOutcome, day: state.day };
        api.setFlag(it.prepinned.flag + ':kept');
        applyEffects(it.prepinned.keptEffects, api);
      } else {
        state.resolved[id] = { action: 'read', day: state.day };
      }
    });
    // post left in the sack goes out a day late
    postForDay(state.day, api).forEach((p) => { if (!state.sorted[p.id]) state.sorted[p.id] = 'late'; });

    const d = C.days[state.day] || {};
    const dayEnd = C.dayEnd && C.dayEnd[state.day];
    if (dayEnd) dayEnd(api);
    syncBook(api);
    save();

    // whatever you agreed this morning to do this evening has now been done
    const later = state.dayItems.map((id) => C.byId[id])
      .filter((it) => it && state.resolved[it.id] && state.resolved[it.id].later && state.resolved[it.id].day === state.day);

    const finish = () => {
      if (state.ending === 'burn') { runBurn(); return; }
      if (state.day >= LAST_DAY) { showEnding(state.ending || 'keep'); return; }
      night(val(d.night, api) || '', () => {
        state.day++;
        $('reader').classList.remove('open');
        beginDay();
      });
    };
    if (later.length) { $('reader').classList.remove('open'); showEvening(later, api, finish); }
    else finish();
  }

  // The evening account. You are told about the things you said yes to, once, when the day is over
  // and there is nothing left to do about them.
  function showEvening(items, api, then) {
    const card = $('evening-card');
    card.innerHTML = '<h2>After the office shut</h2>' + items.map((it) => {
      const r = state.resolved[it.id];
      return '<section class="evening-item">'
        + '<p class="evening-who">' + esc(senderName(it)) + (val(it.subject, api) ? ' &middot; ' + esc(val(it.subject, api)) : '') + '</p>'
        + '<p class="evening-said">You said: &ldquo;' + esc(r.text) + '&rdquo;</p>'
        + '<div class="outcome">' + markup(r.outcome || '', api) + '</div></section>';
    }).join('');
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary';
    btn.textContent = 'Goodnight';
    btn.onclick = () => { $('overlay-evening').hidden = true; then(); };
    card.appendChild(btn);
    $('overlay-evening').hidden = false;
    $('overlay-evening').scrollTop = 0;
    armSwaps(card);
  }

  function night(text, then) {
    const ov = $('overlay-night');
    $('night-text').innerHTML = markup(text, makeApi());
    armSwaps(ov);
    ov.hidden = false;
    requestAnimationFrame(() => ov.classList.add('show'));
    setTimeout(() => {
      then();
      setTimeout(() => { ov.classList.remove('show'); setTimeout(() => { ov.hidden = true; }, 800); }, 400);
    }, text ? 2600 : 900);
  }

  // ------------------------------------------------------------ endings
  // Six people and one visit a day: nobody finishes all of it. The page below says which threads
  // you took to the end and, for the rest, what shape was still there — never what was in it.
  // That is the invitation to walk up the road again.
  function threadsHtml(api) {
    const list = C.threads || [];
    if (!list.length) return '';
    const rows = list.map((t) => {
      const depth = t.beats.filter((b) => b(api)).length;
      const gone = api.removed(t.who);
      const name = (C.villagers[t.who] || {}).name || t.who;
      const dots = t.beats.map((b, i) => '<i class="' + (i < depth ? 'on' : '') + '"></i>').join('');
      const line = depth >= t.beats.length ? t.done : t.left[depth];
      return '<div class="thread' + (depth >= t.beats.length ? ' is-done' : '') + (gone ? ' is-gone' : '') + '">'
        + '<div class="thread-head"><b>' + esc(t.title) + '</b><span class="dots">' + dots + '</span></div>'
        + '<div class="thread-line">' + markup(gone ? 'There is nobody at that address. You unpinned ' + name + ', and the shape of what they were in the middle of went with them, and nobody else in Ashfield has noticed it is missing.' : line, api) + '</div>'
        + '</div>';
    }).join('');
    const done = list.filter((t) => t.beats.every((b) => b(api))).length;
    const head = done === 0
      ? 'You followed none of them all the way down. That is the usual number.'
      : done === 1 ? 'You followed one of them all the way down.'
        : done >= list.length ? 'You followed every one of them to the end, which nobody has time to do, and you found the time.'
          : 'You followed ' + done + ' of them all the way down.';
    return '<div class="threads-page">'
      + '<h3>What you were in the middle of</h3>'
      + '<p class="threads-lede">' + esc(head) + ' Six people, twelve days, one visit a day. The rest of it was still going on while you were busy.</p>'
      + rows + '</div>';
  }

  function showEnding(kind) {
    meta.rounds = (meta.rounds || 0) + 1; saveMeta();
    const api = makeApi();
    const paras = C.endings[kind](api);
    const card = $('ending-card');
    card.innerHTML = '<h2>' + esc(C.endingTitles[kind] || '') + '</h2>'
      + paras.map((p, i) => '<p style="animation-delay:' + (i * 1.1) + 's">' + markup(p, api) + '</p>').join('');
    if (kind !== 'burn') {
      const wrap = document.createElement('div');
      wrap.innerHTML = threadsHtml(api);
      const page = wrap.firstChild;
      if (page) {
        page.style.animation = 'fadein 1.4s ease ' + (paras.length * 1.1) + 's forwards';
        page.style.opacity = '0';
        card.appendChild(page);
      }
    }
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary';
    btn.style.animation = 'fadein 1.4s ease ' + ((paras.length + 0.8) * 1.1) + 's forwards';
    btn.style.opacity = '0';
    if (kind === 'burn') {
      btn.textContent = 'Pin a new board';
      btn.onclick = () => { $('overlay-ending').hidden = true; showStart(); };
    } else {
      btn.textContent = 'Day 13';
      btn.onclick = () => { $('overlay-ending').hidden = true; loopRound(); };
    }
    card.appendChild(btn);
    $('overlay-ending').hidden = false;
    $('overlay-ending').scrollTop = 0;
    armSwaps(card);
  }

  function loopRound() {
    // Ashfield never gets any bigger. Day 13 is Day 1.
    // Your own handwriting in the book survives; what the village told you does not.
    const carry = { removed: state.removed.slice(), loop: state.loop + 1, prevName: state.name, book: { notes: state.book.notes } };
    state = freshState(state.name, carry);
    beginDay();
    save();
  }

  function runBurn() {
    // the board itself goes; the animation is the whole ending, then words on black
    stopDayGlitch();
    $('reader').classList.remove('open');
    $('overlay-panel').hidden = true;
    document.body.classList.add('burn');
    $('board').classList.add('burning');
    meta.burned = true; meta.rounds = (meta.rounds || 0) + 1; saveMeta();
    clearSave();
    setTimeout(() => {
      document.body.classList.remove('burn');
      $('board').classList.remove('burning');
      showEnding('burn');
    }, 3000);
  }

  // ------------------------------------------------------------ panels
  function openPanel(title, html, kind) {
    $('panel-title').textContent = title;
    $('panel-body').innerHTML = html;
    $('overlay-panel').querySelector('.panel').className = 'panel' + (kind ? ' panel-' + kind : '');
    $('overlay-panel').hidden = false;
    $('overlay-panel').querySelector('.panel').scrollTop = 0;
  }
  function closePanel() { $('overlay-panel').hidden = true; }

  // ---- the address book
  function openBook(who) {
    const api = makeApi();
    syncBook(api);
    if (who && C.villagers[who]) bookWho = who;
    if (!bookWho || !C.villagers[bookWho]) bookWho = Object.keys(C.villagers)[0];
    state.book.seenCount = bookCount();
    save();
    renderTopbar(api);
    const tabs = Object.keys(C.villagers).map((k) => {
      const gone = state.removed.indexOf(k) !== -1;
      return '<button type="button" class="tab' + (k === bookWho ? ' on' : '') + (gone ? ' gone' : '') + '" data-who="' + k + '">'
        + '<span class="tab-name">' + esc(firstName(k)) + '</span><span class="tab-role">' + esc(C.villagers[k].role) + '</span></button>';
    }).join('');
    openPanel(state.name + '’s address book',
      '<div class="book-reach" id="book-reach"></div>'
      + '<div class="book-layout"><nav class="book-tabs" aria-label="People">' + tabs + '</nav><div class="book-page" id="book-page"></div></div>', 'book');
    document.querySelectorAll('.book-tabs .tab').forEach((t) => { t.onclick = () => { bookWho = t.dataset.who; document.querySelectorAll('.book-tabs .tab').forEach((x) => x.classList.toggle('on', x === t)); refreshBookPage(bookWho); }; });
    renderBookReach(api);
    refreshBookPage(bookWho);
  }

  // Reaching out, across the top of the book: who you could call on, or where you have promised to be.
  function renderBookReach(api) {
    const el = $('book-reach');
    if (!el) return;
    const appt = appointments(api);
    const left = visitsLeft(api);
    const done = (state.book.reaches || []).filter((x) => x.day === state.day);
    let html = '<h4>Reaching out</h4>';
    if (appt.length) {
      const e = appt[0];
      html += '<p class="band-line">You have already said you would see <button type="button" class="linkish" data-open-book="' + esc(e.who) + '">'
        + esc(firstName(e.who)) + '</button> at ' + esc(placeName(e.at)) + ', ' + esc(fmtHour(e.from)) + '. That is the day’s call spent, and gladly.</p>';
    } else if (done.length) {
      html += '<p class="band-line">You went to see <button type="button" class="linkish" data-open-book="' + esc(done[0].who) + '">'
        + esc(firstName(done[0].who)) + '</button> today. Whatever else there was keeps until tomorrow.</p>';
    } else if (left > 0) {
      const who = callable(api);
      const known = Object.keys(C.villagers).some(metPerson);
      html += '<p class="band-line">You can leave the desk once today, for one person you know'
        + (who.length
          ? ': ' + who.map((k) => '<button type="button" class="linkish" data-open-book="' + k + '">' + esc(firstName(k)) + '</button>').join(', ') + '.</p>'
          : known
            ? '. Nothing has come up yet: the more a page has on it, the more there is to go and do.</p>'
            : '. You have not written back to anybody yet, and you cannot call on a stranger.</p>');
    } else {
      html += '<p class="band-line">You have done your walking for today.</p>';
    }
    // asking is not walking, and has its own allowance
    const unasked = Object.keys(C.villagers).filter((k) => metPerson(k) && !askedToday(k)
      && B.outreach.some((o) => o.who === k && o.kind !== 'visit' && reachOpen(o, api)));
    if (unasked.length) {
      html += '<p class="band-line band-asks">A question each, and you have not used them: '
        + unasked.map((k) => '<button type="button" class="linkish" data-open-book="' + k + '">' + esc(firstName(k)) + '</button>').join(', ') + '.</p>';
    }
    el.innerHTML = html;
    wireOpeners(el);
  }

  // The reaching-out block on one person's page: the top of their page, under their name.
  function reachOptHtml(o, api, dis) {
    const when = meetLine(o.who, api, plansFor(o, api));
    return '<button type="button" class="opt reach" data-reach="' + esc(o.id) + '"' + (dis ? ' disabled' : '') + '>'
      + '<span class="kind">' + esc({ visit: 'Go', write: 'Write', ask: 'Ask' }[o.kind] || 'Ask') + '</span>'
      + '<span class="reach-what">' + esc(plain(val(o.text, api), api))
      + (when ? '<span class="reach-when">' + esc(when) + '</span>' : '') + '</span></button>';
  }
  function reachSectionHtml(who, api) {
    const b = state.book;
    let html = '<section class="page-sec reach-sec"><h4>Reaching out</h4>';
    if (state.removed.indexOf(who) !== -1) return html + '<p class="archive-note">There is nobody to reach.</p></section>';
    // their work is what decides when they can see you, and where that leaves them
    const job = jobOf(who);
    const m = meetFor(who, api);
    if (job) html += '<p class="job">' + esc(val(job, api)) + (m ? ' <span class="job-gap">Free for you at ' + esc(placeName(m.at)) + ', ' + esc(fmtHour(m.hour)) + '.</span>' : '') + '</p>';
    (b.reaches || []).filter((x) => x.who === who && x.day === state.day).forEach((x) => {
      html += '<div class="reach-done"><div class="reach-text">' + esc(x.text) + '</div><div class="outcome">' + markup(x.outcome || 'Nothing comes of it.', api) + '</div></div>';
    });
    const appt = appointments(api).filter((e) => e.who === who)[0];
    const opts = B.outreach.filter((o) => o.who === who && reachOpen(o, api));
    const visits = opts.filter((o) => o.kind === 'visit');
    const asks = opts.filter((o) => o.kind !== 'visit');
    if (!metPerson(who)) {
      html += '<p class="hint">You have not written back to ' + esc(firstName(who)) + ' yet. Answer something of theirs and you will know them well enough to call.</p>';
    } else if (!opts.length) {
      html += '<p class="hint">Nothing to go on yet. The more you know about ' + esc(firstName(who)) + ', the more you can ask.</p>';
    } else {
      if (asks.length) {
        const spent = askedToday(who);
        html += '<p class="hint">' + (spent
          ? 'You have asked ' + esc(firstName(who)) + ' your one question for today. There is only so much a person will answer in a morning.'
          : 'One question a day, each. Asking ' + esc(firstName(who)) + ' something does not cost you the walk.') + '</p>'
          + asks.map((o) => reachOptHtml(o, api, spent)).join('');
      }
      if (visits.length) {
        const left = visitsLeft(api);
        html += '<h5 class="reach-sub">Leaving the desk</h5>';
        html += '<p class="hint">' + (appt
          ? 'You are already seeing ' + esc(firstName(who)) + ' today, at ' + esc(placeName(appt.at)) + ', ' + esc(fmtHour(appt.from)) + '. That is the day’s walk spent.'
          : left > 0
            ? 'One walk a day, and this could be it. Their work says where and when.'
            : 'You have done your walking for today. Tomorrow, perhaps.') + '</p>'
          + visits.map((o) => reachOptHtml(o, api, !!appt || left <= 0)).join('');
      } else if (appt) {
        html += '<p class="hint">You are already seeing ' + esc(firstName(who)) + ' today, at ' + esc(placeName(appt.at)) + ', ' + esc(fmtHour(appt.from)) + '.</p>';
      }
    }
    return html + '</section>';
  }
  function refreshBookPage(who) {
    const page = $('book-page');
    if (!page || $('overlay-panel').hidden) return;
    if (who !== bookWho) return;
    const api = makeApi();
    page.innerHTML = pageHtml(who, api);
    wireBookPage(who, api);
  }

  // ---- a note of your own
  // Three a morning is as much writing as the job leaves room for.
  const NOTES_PER_DAY = 3;
  function notesToday() {
    let n = 0;
    Object.keys(state.book.written || {}).forEach((w) => {
      Object.keys(state.book.written[w]).forEach((k) => { if (state.book.written[w][k].day === state.day) n++; });
    });
    Object.keys(state.book.posted || {}).forEach((id) => { if (state.book.posted[id] === state.day) n++; });
    return n;
  }
  function canWriteNote() { return notesToday() < NOTES_PER_DAY; }

  function sendNote(who) {
    if (!noteDraft || noteDraft.who !== who) return;
    const api = makeApi();
    const text = (noteDraft.text || '').trim().slice(0, 600);
    if (!text || !canWriteNote()) return;
    const mine = state.book.written[who] || (state.book.written[who] = {});
    mine[noteDraft.key] = { text: text, day: state.day, where: noteDraft.where };
    api.setFlag('wrote:' + who + ':' + noteDraft.key);
    noteDraft = null;
    save();
    renderAll();
    refreshBookPage(who);
  }

  // One line of the "what you know" list: the fact, and what you have done about it.
  function knowRowHtml(who, x, api, gone) {
    const key = x.n.key;
    const mine = (state.book.written[who] || {})[key];
    let html = '<li><b class="kw">' + esc(key) + '</b> ' + esc(safe(() => val(x.n.text, api), '') || '')
      + ' <span class="when">day ' + x.day + '</span>';
    if (mine) {
      const answered = mine.day < state.day;
      html += '<div class="mynote"><span class="mynote-head">'
        + esc(mine.where === 'board' ? 'Your notice, pinned day ' + mine.day : 'Your note, day ' + mine.day)
        + '</span><p>' + esc(mine.text) + '</p>'
        + '<span class="mynote-state">' + esc(answered ? 'Answered, on the board.' : 'In the bag. It goes out with the van tonight.') + '</span></div>';
    } else if (noteDraft && noteDraft.who === who && noteDraft.key === key) {
      html += '<div class="mynote compose"><label for="note-draft">'
        + esc(noteDraft.where === 'board'
          ? 'A notice for the board, about ' + key
          : 'A note for ' + firstName(who) + ', about ' + key)
        + '</label>'
        + '<textarea id="note-draft" class="note-draft" rows="3" maxlength="600" placeholder="'
        + esc(noteDraft.where === 'board' ? 'In your own hand, for whoever reads the board.' : 'In your own hand. Nobody asked you to.')
        + '">' + esc(noteDraft.text || '') + '</textarea>'
        + '<div class="row"><button type="button" class="btn" data-note-send="1">Put it in the bag</button>'
        + '<button type="button" class="btn btn-ghost" data-note-cancel="1">Never mind</button></div></div>';
    } else if (!gone && canWriteNote()) {
      html += '<div class="mynote-actions">'
        + '<button type="button" class="linkish" data-note-to="' + esc(key) + '">Write to ' + esc(firstName(who)) + ' about this</button>'
        + '<button type="button" class="linkish" data-note-board="' + esc(key) + '">Pin a notice about it</button></div>';
    }
    return html + '</li>';
  }

  function pageHtml(who, api) {
    const v = C.villagers[who];
    const gone = state.removed.indexOf(who) !== -1;
    const b = state.book;
    let html = '<header class="page-head"><h3>' + esc(v.name) + '</h3><div class="role">' + esc(v.role) + '</div>'
      + '<div class="standing">' + (gone ? '&mdash;' : esc(standingWord(state.trust[who] || 0))) + '</div>'
      + '<p class="bio">' + esc(gone ? (v.goneBio || 'Nobody in Ashfield remembers this person.') : val(v.bio, api)) + '</p>'
      + (gone ? '<p class="gone-note">The village has forgotten. You have not. That was the price.</p>' : '')
      + '</header>';

    // reaching out, at the top of the page, where you asked for it
    html += reachSectionHtml(who, api);

    // what you know — and what you have written to them about it
    const learned = Object.keys(b.learned[who] || {}).map((key) => ({ n: (B.notes[who] || []).filter((x) => x.key === key)[0], day: b.learned[who][key] })).filter((x) => x.n).sort((x, y) => x.day - y.day);
    html += '<section class="page-sec"><h4>What you know</h4>';
    if (!learned.length) html += '<p class="archive-note">Nothing yet. Read what they send you; carry things; ask.</p>';
    else {
      html += '<ul class="know">' + learned.map((x) => knowRowHtml(who, x, api, gone)).join('') + '</ul>';
      if (!gone) {
        html += '<p class="hint">' + (canWriteNote()
          ? 'You can write about any of these yourself. Nobody has asked you to. It goes out with the van and it is answered on the board in the morning.'
          : 'You have written your three for today. The rest can wait for the morning post.') + '</p>';
      }
    }
    html += '</section>';

    // between us
    const rows = historyFor(who, api);
    html += '<section class="page-sec"><h4>Between us</h4>';
    if (!rows.length) html += '<p class="archive-note">Nothing yet.</p>';
    else html += '<ul class="between">' + rows.map((r) => '<li' + (r.id ? ' class="link" data-id="' + esc(r.id) + '"' : '') + '><span class="when">Day ' + r.day + '</span> ' + r.html + '</li>').join('') + '</ul>';
    html += '</section>';

    // your own hand
    html += '<section class="page-sec"><h4>In your own hand</h4><textarea class="own-notes" data-who="' + who + '" rows="4" placeholder="Anything you want to remember about ' + esc(firstName(who)) + '.">' + esc(b.notes[who] || '') + '</textarea></section>';
    return html;
  }

  function historyFor(who, api) {
    const rows = [];
    const title = (it) => esc(val(it.subject, api) || plain(val(it.body, api), api).slice(0, 60) + '…');
    C.items.forEach((it) => {
      const r = state.resolved[it.id];
      if (!r) return;
      if (it.from === who) {
        if (isRemovedSender(it)) { rows.push({ day: r.day, order: it.order || 0, html: '<i>A torn corner. Nothing legible.</i>' }); return; }
        const what = { reply: 'You replied “' + esc(r.text || '') + '”', pass: 'You passed it to ' + esc(firstName(r.who)), ignore: 'You left it', read: 'Read', unpin: 'You unpinned what was written there' }[r.action] || '';
        rows.push({ day: r.day, order: it.order || 0, id: it.id, html: '<b>' + title(it) + '</b> — ' + what });
      } else if (r.action === 'pass' && r.who === who) {
        rows.push({ day: r.day, order: 50 + (it.order || 0), id: it.id, html: 'You carried ' + esc(senderName(it)) + '’s note here — <b>' + title(it) + '</b>' });
      }
    });
    (B.lost || []).forEach((o) => {
      const g = state.given[o.id];
      if (!g || g.who !== who) return;
      rows.push({ day: g.day, order: 95, html: lostLine(o, g, api) });
    });
    const mine = state.book.written[who] || {};
    Object.keys(mine).forEach((key) => {
      rows.push({ day: mine[key].day, order: 97,
        html: (mine[key].where === 'board' ? 'You pinned a notice about <b>' : 'You wrote to them about <b>') + esc(key) + '</b>, unasked' });
    });
    (state.book.reaches || []).filter((x) => x.who === who).forEach((x) => {
      rows.push({ day: x.day, order: 99, html: '<b>' + esc(x.text) + '</b>' + (x.outcome ? ' — <i>' + esc(plain(x.outcome, api).split('\n')[0].slice(0, 110)) + (x.outcome.length > 110 ? '…' : '') + '</i>' : '') });
    });
    return rows.sort((a, b) => a.day - b.day || a.order - b.order);
  }

  function wireBookPage(who, api) {
    const page = $('book-page');
    page.querySelectorAll('[data-reach]').forEach((btn) => {
      btn.onclick = () => { const o = B.outreach.filter((x) => x.id === btn.dataset.reach)[0]; if (o) doReach(o); };
    });
    page.querySelectorAll('[data-note-to]').forEach((btn) => {
      btn.onclick = () => { noteDraft = { who: who, key: btn.dataset.noteTo, where: 'them', text: '' }; refreshBookPage(who); };
    });
    page.querySelectorAll('[data-note-board]').forEach((btn) => {
      btn.onclick = () => { noteDraft = { who: who, key: btn.dataset.noteBoard, where: 'board', text: '' }; refreshBookPage(who); };
    });
    const draft = page.querySelector('.note-draft');
    if (draft) {
      draft.oninput = () => { if (noteDraft) noteDraft.text = draft.value; };
      draft.focus();
      draft.selectionStart = draft.selectionEnd = draft.value.length;
    }
    const send = page.querySelector('[data-note-send]');
    if (send) send.onclick = () => sendNote(who);
    const cancel = page.querySelector('[data-note-cancel]');
    if (cancel) cancel.onclick = () => { noteDraft = null; refreshBookPage(who); };
    page.querySelectorAll('.between .link').forEach((li) => {
      li.onclick = () => { closePanel(); selectedId = li.dataset.id; renderReader(api, C.byId[li.dataset.id]); armSwaps($('reader')); $('reader').classList.add('open'); };
    });
    const ta = page.querySelector('.own-notes');
    if (ta) ta.oninput = () => { state.book.notes[who] = ta.value.slice(0, 2000); save(); };
    wireOpeners(page);
  }

  function openArchive() {
    const api = makeApi();
    let html = '';
    const seen = Object.keys(state.resolved);
    if (!seen.length) html = '<p class="archive-note">Nothing yet. Every day leaves something behind.</p>';
    for (let d = state.day; d >= 1; d--) {
      const ids = C.items.filter((it) => it.day === d && state.resolved[it.id]).map((it) => it.id);
      if (!ids.length) continue;
      html += '<div class="archive-day">Day ' + d + (C.days[d] ? ' &middot; ' + esc(val(C.days[d].week, api)) : '') + '</div>';
      ids.forEach((id) => {
        const it = C.byId[id]; const r = state.resolved[id];
        if (isRemovedSender(it)) {
          html += '<div class="archive-item gone"><div class="who">&mdash;</div><div class="what">A torn corner. Nothing legible.</div></div>';
          return;
        }
        const what = { reply: 'You replied', pass: 'You passed it to ' + (C.villagers[r.who] ? C.villagers[r.who].name : r.who), ignore: 'You left it', read: 'Read', unpin: 'You unpinned what was written there' }[r.action];
        html += '<div class="archive-item" data-id="' + id + '"><div class="who">' + esc(senderName(it)) + ' &middot; ' + esc(what) + '</div>'
          + '<div class="what">' + esc(val(it.subject, api) || plain(val(it.body, api), api).slice(0, 80) + '…') + '</div></div>';
      });
    }
    if (state.day >= 9) html += '<p class="archive-note">Some of these were not here yesterday. You are fairly sure.</p>';
    openPanel('Old letters', html);
    document.querySelectorAll('.archive-item[data-id]').forEach((el) => {
      el.onclick = () => { closePanel(); selectedId = el.dataset.id; renderReader(api, C.byId[el.dataset.id]); armSwaps($('reader')); $('reader').classList.add('open'); };
    });
  }

  function confirm(text, yes) {
    $('confirm-text').textContent = text;
    $('overlay-confirm').hidden = false;
    $('confirm-yes').onclick = () => { $('overlay-confirm').hidden = true; yes(); };
    $('confirm-no').onclick = () => { $('overlay-confirm').hidden = true; };
  }

  // ------------------------------------------------------------ screens
  function showStart() {
    $('screen-game').hidden = true;
    $('screen-start').hidden = false;
    const existing = loadSave();
    const cont = $('start-continue');
    if (existing && existing.name) {
      cont.hidden = false;
      $('start-continue-name').textContent = existing.name;
      $('start-continue-day').textContent = existing.day;
      $('btn-continue').onclick = () => { state = existing; ensureBook(); showGame(); renderAll(); };
      $('btn-restart').onclick = () => { confirm('Clear the desk and start again? The old one will be forgotten. Not by you.', () => { clearSave(); cont.hidden = true; }); };
    } else {
      cont.hidden = true;
    }
    if (meta.burned) $('start-name').placeholder = 'the name that was here before';
  }

  function showGame() {
    $('screen-start').hidden = true;
    $('screen-game').hidden = false;
  }

  function startNew(name) {
    state = freshState(name);
    showGame();
    beginDay();
  }

  // ------------------------------------------------------------ boot
  function boot() {
    // index items
    C.byId = {};
    C.items.forEach((it) => { C.byId[it.id] = it; });

    meta.visits = (meta.visits || 0) + 1;
    saveMeta();

    $('start-form').onsubmit = (e) => {
      e.preventDefault();
      const name = $('start-name').value.trim();
      if (!name) return;
      startNew(name);
    };
    $('btn-endday').onclick = endDayRequested;
    $('panel-close').onclick = closePanel;
    $('overlay-panel').addEventListener('click', (e) => { if (e.target === $('overlay-panel')) closePanel(); });
    $('reader').addEventListener('click', (e) => { if (e.target === $('reader')) closeReader(); });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (!$('overlay-panel').hidden) { closePanel(); return; }
      if (!$('overlay-confirm').hidden) { $('overlay-confirm').hidden = true; return; }
      closeReader();
    });

    showStart();

    // A small hook for smoke tests: enough to start a run, set flags and look at an ending.
    window.__ashfield = {
      get state() { return state; }, makeApi, startNew, beginDay, renderAll, showEnding,
      setFlag: (f) => { if (state.flags.indexOf(f) === -1) state.flags.push(f); },
      goToDay: (d) => { state.day = d; beginDay(); },
      itemsToday: () => state.dayItems.slice(),
      content: C,
    };
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
