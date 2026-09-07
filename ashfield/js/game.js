/* Letters to Ashfield — the engine.
 *
 * You run the post office. The screen is your desk: a map of the village on the wall, a pile
 * on the counter, an address book open beside it, and a diary you write everything into.
 *
 * The whole loop is the pile. Take a piece off it and put it where it goes:
 *   a letter — the front says which house
 *   a thing  — nothing says which house; the marks on it do, if your diary knows what they mean
 *   a note   — read it, and what it tells you goes in the diary
 *
 * Clues come off notes, out of answers, and off the map itself. The engine knows nothing about
 * Ashfield: every name, mark, clue and outcome is in content.js.
 */
(() => {
  'use strict';

  // ---------- constants ----------
  const SAVE_KEY = 'ashfield.save.v2';
  const META_KEY = 'ashfield.meta.v1';
  const LAST_DAY = 12;
  const VISITS_A_DAY = 1;
  const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const C = window.ASHFIELD;

  // ------------------------------------------------------------ helpers
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const val = (v, api) => (typeof v === 'function' ? v(api) : v);
  const safe = (fn, fallback) => { try { return fn(); } catch (e) { return fallback; } };
  function hash(s) { let h = 0; s = String(s); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
  function rot(seed, spread) { return ((hash(seed) % 1000) / 1000 - 0.5) * 2 * spread; }
  function pickFrom(list, seed) { return list[hash(seed) % list.length]; }
  function listNames(arr) {
    if (!arr.length) return '';
    if (arr.length === 1) return arr[0];
    return arr.slice(0, -1).join(', ') + ' and ' + arr[arr.length - 1];
  }

  // ------------------------------------------------------------ state
  let state = null;
  let meta = loadMeta();
  let bookWho = null;
  let held = null;          // the piece on your hand
  let drops = {};           // pieceId -> {x,y} %, things you have put down on the map
  let dropsDay = 0;
  let mapSel = null;        // the house your finger is on
  let findSel = null;       // the mark on the map you have picked up
  let handback = null;      // what somebody said as they handed a thing straight back
  let swapTimers = [];

  function freshBook(prev) {
    prev = prev || {};
    return {
      notes: prev.notes || {},   // who -> your own handwriting on their page
      ups: {}, downs: {},
      returned: {},              // who -> things given back to them
      astray: {},                // who -> post put through their door by mistake
    };
  }

  function freshState(name, carry) {
    carry = carry || {};
    return {
      name: name,
      day: 1,
      trust: {},
      flags: [],
      removed: carry.removed || [],
      loop: carry.loop || 0,
      ending: null,
      started: Date.now(),
      prevName: carry.prevName || null,
      placed: {},        // pieceId -> house key, 'box', 'diary' or 'late'
      answered: {},      // keeper letter id -> { choice, text, outcome, day }
      wrongs: {},        // thing id -> [houses tried and refused]
      evening: [],       // what you are told after the office shuts, and not before
      learned: {},       // clue key -> { day, how }
      named: {},         // thing id -> who a note said it belongs to
      found: {},         // find id -> day
      told: {},          // find id -> { who, day, outcome }
      reaches: [],       // [{ id, who, kind, text, outcome, day }]
      ignoredCount: 0,
      book: freshBook(carry.book),
    };
  }

  function ensureShape() {
    ['placed', 'answered', 'wrongs', 'learned', 'named', 'found', 'told', 'trust'].forEach((k) => { if (!state[k]) state[k] = {}; });
    if (!state.reaches) state.reaches = [];
    if (!state.evening) state.evening = [];
    if (!state.flags) state.flags = [];
    if (!state.removed) state.removed = [];
    if (!state.book) state.book = freshBook();
    ['notes', 'ups', 'downs', 'returned', 'astray'].forEach((k) => { if (!state.book[k]) state.book[k] = {}; });
  }

  function loadMeta() {
    try { return JSON.parse(localStorage.getItem(META_KEY)) || { visits: 0, rounds: 0, first: Date.now(), burned: false }; }
    catch (e) { return { visits: 0, rounds: 0, first: Date.now(), burned: false }; }
  }
  function saveMeta() { try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch (e) { /* private mode */ } }
  function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ } }
  function loadSave() { try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { return null; } }
  function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } }

  // ------------------------------------------------------------ the api content.js sees
  function makeApi() {
    const now = new Date();
    const api = {
      get name() { return state.name; },
      get prevName() { return state.prevName; },
      get day() { return state.day; },
      get loop() { return state.loop; },
      get hour() { return now.getHours(); },
      get weekday() { return WEEKDAYS[now.getDay()]; },
      get week() { const d = C.days[state.day]; return d ? (val(d.week, api) || '') : ''; },
      get visits() { return meta.visits; },
      get rounds() { return meta.rounds || 0; },
      get ignoredCount() { return state.ignoredCount; },
      get ending() { return state.ending; },
      burnedBefore: !!meta.burned,
      has: (f) => state.flags.indexOf(f) !== -1,
      trust: (who) => state.trust[who] || 0,
      standing: (who) => standingWord(state.trust[who] || 0),
      removed: (who) => state.removed.indexOf(who) !== -1,
      // the desk's side
      knowsClue: (key) => !!state.learned[key],
      met: (who) => metPerson(who),
      knows: (who, key) => { const list = (C.notes[who] || []).filter((n) => n.key === key); return list.length ? noteLive(list[0], api, who) : false; },
      sorted: (id) => state.placed[id] === rightHouse(byId(id)),
      placed: (id) => !!state.placed[id],
      returned: (who) => state.book.returned[who] || 0,
      astray: (who) => state.book.astray[who] || 0,
      told: (findId) => !!state.told[findId],
      found: (findId) => !!state.found[findId],
      answered: (id, idx) => { const r = state.answered[id]; return !!r && (idx === undefined || r.choice === idx); },
      reached: (id) => state.reaches.some((x) => x.id === id),
      reachedAny: (who, kind) => state.reaches.some((x) => x.who === who && (!kind || x.kind === kind)),
      rose: (who) => state.book.ups[who] || 0,
      fell: (who) => state.book.downs[who] || 0,
      // writing side
      setFlag: (f) => { if (state.flags.indexOf(f) === -1) state.flags.push(f); },
      unflag: (f) => { state.flags = state.flags.filter((x) => x !== f); },
      addTrust: (who, n) => { state.trust[who] = (state.trust[who] || 0) + n; },
      remove: (who) => { if (state.removed.indexOf(who) === -1) state.removed.push(who); },
      setEnding: (e) => { state.ending = e; },
      learn: (key, how) => learnClue(key, how),
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

  function snapshotTrust() { return Object.assign({}, state.trust); }
  function trackTrust(before) {
    Object.keys(C.villagers).forEach((w) => {
      const d = (state.trust[w] || 0) - (before[w] || 0);
      if (d > 0) state.book.ups[w] = (state.book.ups[w] || 0) + d;
      else if (d < 0) state.book.downs[w] = (state.book.downs[w] || 0) - d;
    });
  }

  // ------------------------------------------------------------ text markup
  function markup(text, api) {
    let t = esc(text).replace(/\{\{name\}\}/g, esc(api.name));
    t = t.replace(/\[\[([^|\]]*)\|([^\]]*)\]\]/g, '<span class="swap" data-after="$2">$1</span>');
    t = t.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    t = t.replace(/__([^_]+)__/g, '<span class="smudge">$1</span>');
    t = t.replace(/\^\^([^^]+)\^\^/g, '<span class="shiver">$1</span>');
    t = t.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
    return t.split(/\n{2,}/).map((p) => '<p>' + p.replace(/\n/g, '<br>') + '</p>').join('');
  }
  function plain(text, api) {
    return String(text == null ? '' : text)
      .replace(/\{\{name\}\}/g, api.name)
      .replace(/\[\[([^|\]]*)\|[^\]]*\]\]/g, '$1')
      .replace(/[~_^*]{1,2}([^~_^*]+)[~_^*]{1,2}/g, '$1');
  }
  function armSwaps(root) {
    clearSwaps();
    root.querySelectorAll('.swap').forEach((el) => {
      const after = el.dataset.after;
      swapTimers.push(setTimeout(() => {
        el.classList.add('going');
        swapTimers.push(setTimeout(() => { el.textContent = after; el.classList.remove('going'); el.classList.add('came'); }, 700));
      }, 3000 + Math.random() * 5000));
    });
  }
  function clearSwaps() { swapTimers.forEach(clearTimeout); swapTimers = []; }

  // ------------------------------------------------------------ people
  function firstName(who) {
    const v = C.villagers[who];
    if (!v) return who === 'keeper' ? state.name : who;
    const parts = v.name.split(' ');
    return parts.length > 2 ? parts[1] : parts[0].replace(/^(Mrs|Mr|Dr|Rev\.?)$/, '') || parts[1] || v.name;
  }
  function fullName(who) { return (C.villagers[who] || {}).name || (who === 'keeper' ? state.name : who); }
  function placeName(k) { return C.places[k] || k; }
  function alive(who) { return !!C.villagers[who] && state.removed.indexOf(who) === -1; }

  // You know somebody once something has actually passed between you: a letter through their
  // door, a thing put back in their hand, or something you walked over to tell them.
  function metPerson(who) {
    if (!C.villagers[who] || state.removed.indexOf(who) !== -1) return false;
    if ((state.book.returned[who] || 0) > 0) return true;
    if (Object.keys(state.told).some((f) => state.told[f].who === who)) return true;
    return C.pile.some((p) => p.kind === 'letter' && p.to === who && state.placed[p.id] === who);
  }

  // ------------------------------------------------------------ the pile
  function byId(id) { return C.pile.filter((p) => p.id === id)[0] || null; }
  function pieceLive(p, api) { return !p.when || safe(() => !!p.when(api), false); }

  // Letters and notes are today's business and go stale. A thing has no day in it: it sits in
  // the pile, or in the box, until somebody has it back.
  function pileAll(api) {
    return C.pile.filter((p) => {
      if (!pieceLive(p, api)) return false;
      if (p.kind === 'thing') return p.day <= state.day;
      return p.day === state.day;
    });
  }
  function pileOpen(api) { return pileAll(api).filter((p) => !state.placed[p.id]); }
  function inPile(api) { return pileOpen(api).filter((p) => p.id !== held && !drops[p.id]); }
  function boxed(api) {
    return C.pile.filter((p) => p.kind === 'thing' && pieceLive(p, api) && state.placed[p.id] === 'box');
  }
  // things you still owe somebody: in the pile, on the map, or in the box
  function unsolvedThings(api) {
    return C.pile.filter((p) => p.kind === 'thing' && p.day <= state.day && pieceLive(p, api)
      && (!state.placed[p.id] || state.placed[p.id] === 'box'));
  }

  function rightHouse(p) {
    if (!p) return null;
    if (p.kind === 'letter') {
      // nobody left at that address means it goes back in the van
      if (p.to && C.villagers[p.to] && state.removed.indexOf(p.to) !== -1) return 'return';
      return p.to;
    }
    if (p.kind === 'thing') return p.owner;
    return null;
  }

  // ---- clues, and what they are worth
  function learnClue(key, how) {
    if (!C.clues[key] || state.learned[key]) return false;
    state.learned[key] = { day: state.day, how: how || '' };
    return true;
  }
  // What your diary can say about one thing: every mark on it, and whose door it points at.
  function readingOf(p) {
    const out = [];
    (p.marks || []).forEach((k) => {
      const m = C.marks[k];
      if (!m) return;
      const c = state.learned[k] ? C.clues[k] : null;
      out.push({ key: k, mark: m, clue: c ? C.clues[k].text : null, who: c ? C.clues[k].who : null });
    });
    return out;
  }
  function pointsAt(p) {
    const who = {};
    readingOf(p).forEach((r) => { if (r.who) who[r.who] = (who[r.who] || 0) + 1; });
    if (state.named[p.id]) who[state.named[p.id]] = (who[state.named[p.id]] || 0) + 9;
    return Object.keys(who).sort((a, b) => who[b] - who[a]);
  }
  function solvable(p) { return pointsAt(p).length > 0; }

  // ------------------------------------------------------------ putting a piece somewhere
  function place(p, house) {
    const api = makeApi();
    if (!p || state.placed[p.id] === house) return;
    const before = snapshotTrust();
    const right = house === rightHouse(p);

    if (p.kind === 'letter') {
      state.placed[p.id] = house;
      if (right) {
        api.setFlag('post:' + p.id);
        if (house === 'keeper' && p.read) { held = null; save(); renderAll(); openReader(p); return; }
      } else {
        // You are never told on the day. A sorted letter is out of your hands and out of your
        // knowledge, and what it cost you turns up in the evening, when the office is shut.
        const special = (C.astray.special || {})[p.id + ':' + house];
        if (special) {
          applyEffects(special.effects, api);
          state.evening.push({ what: 'What you did on purpose', outcome: val(special.outcome, api) });
        } else {
          if (C.villagers[house]) {
            api.addTrust(house, -1);
            state.book.astray[house] = (state.book.astray[house] || 0) + 1;
          }
          state.evening.push({ what: 'A wrong door', outcome: pickFrom(C.astray.letter, p.id + state.day) });
        }
        api.setFlag('astray:' + p.id);
      }
    } else if (p.kind === 'thing') {
      if (right) {
        state.placed[p.id] = house;
        if (C.villagers[house]) {
          state.book.returned[house] = (state.book.returned[house] || 0) + 1;
          api.addTrust(house, 1);
        }
        api.setFlag('back:' + p.id);
      } else if (house === 'keeper' || house === 'return') {
        state.placed[p.id] = 'box';        // set aside, no harm done, come back to it
      } else {
        // you are stood on their step, so you find this one out at once
        const tried = state.wrongs[p.id] || (state.wrongs[p.id] = []);
        if (tried.indexOf(house) === -1) tried.push(house);
        if (C.villagers[house]) api.addTrust(house, -1);
        handback = pickFrom(C.astray.thing, p.id + house);
        delete state.placed[p.id];         // handed straight back; it is still yours to place
      }
    }
    trackTrust(before);
    held = null;
    delete drops[p.id];
    save();
    renderAll();
  }

  // A note is read, not delivered. What is in it goes into the diary and the note goes on the spike.
  function keepNote(p) {
    const api = makeApi();
    if (state.placed[p.id]) return;
    (p.gives || []).forEach((k) => learnClue(k, 'a note, day ' + state.day));
    if (p.names) state.named[p.names] = (byId(p.names) || {}).owner || null;
    if (p.asks) state.named[p.asks] = p.from;
    state.placed[p.id] = 'diary';
    api.setFlag('note:' + p.id);
    save();
    closeReader();
    renderAll();
  }

  // ------------------------------------------------------------ the village, drawn flat
  // A cartoon of Ashfield, pinned above the desk: the roads named, and a house for everybody the
  // post can go to. x/y/w are percentages of the map box. The lanes in MAP_SVG are drawn to the
  // same numbers, so if you move a house you move its lane with it.
  const MAP = {
    tom:    { x: 14, y: 16, w: 15, art: 'farm',    house: 'Low Farm',        road: 'up the mill road' },
    sam:    { x: 38, y: 31, w: 13, art: 'surgery', house: 'The Surgery',     road: 'Front Street' },
    wren:   { x: 60, y: 20, w: 15, art: 'pub',     house: 'The Fox & Hounds', road: 'on the green' },
    edith:  { x: 89, y: 26, w: 14, art: 'cottage', house: 'Rose Cottage',    road: 'the far end' },
    penry:  { x: 31, y: 86, w: 15, art: 'church',  house: 'The Vicarage',    road: 'by St Anne’s' },
    keeper: { x: 45, y: 68, w: 14, art: 'post',    house: 'The Post Office', road: 'your own counter' },
    marion: { x: 59, y: 68, w: 13, art: 'shop',    house: 'The Shop',        road: 'Front Street' },
    return: { x: 7,  y: 59, w: 12, art: 'van',     house: 'The van',         road: 'return to sender' },
  };

  function mapStops() {
    return Object.keys(MAP).filter((k) => k === 'keeper' || k === 'return' || C.villagers[k]).map((k) => ({
      key: k,
      name: k === 'keeper' ? state.name : k === 'return' ? 'return to sender' : C.villagers[k].name,
      gone: !!(C.villagers[k] && state.removed.indexOf(k) !== -1),
      m: MAP[k],
    }));
  }

  // ------------------------------------------------------------ the map, drawn by hand
  const INK = '#4a3524';

  function roof(x, y, w, h, fill) {
    const flat = w >= h;
    let hatch = '';
    if (flat) { for (let i = x + 5; i < x + w - 2; i += 5) hatch += 'M' + i + ' ' + y + 'v' + h; }
    else { for (let i = y + 5; i < y + h - 2; i += 5) hatch += 'M' + x + ' ' + i + 'h' + w; }
    const ridge = flat ? 'M' + x + ' ' + (y + h / 2) + 'h' + w : 'M' + (x + w / 2) + ' ' + y + 'v' + h;
    return '<g><rect x="' + (x + 3) + '" y="' + (y + 4.5) + '" width="' + w + '" height="' + h + '" rx="1.5" fill="' + INK + '" opacity=".26"/>'
      + '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="1.5" fill="' + (fill || '#b8834f') + '" stroke="' + INK + '" stroke-width="2.4"/>'
      + '<path d="' + hatch + '" fill="none" stroke="#8a5c33" stroke-width="1" opacity=".5"/>'
      + '<path d="' + ridge + '" fill="none" stroke="' + INK + '" stroke-width="1.8"/></g>';
  }

  const MAP_ART = {
    farm: roof(4, 20, 50, 28) + roof(60, 12, 22, 18, '#a9764a')
      + '<g fill="none" stroke="' + INK + '" stroke-width="1.6" opacity=".8"><path d="M60 54h30M60 62h30M68 54v8M80 54v8"/></g>'
      + '<circle cx="90" cy="26" r="8" fill="#cdb075" stroke="' + INK + '" stroke-width="2"/>',
    surgery: roof(10, 16, 58, 30)
      + '<rect x="74" y="28" width="20" height="20" rx="2" fill="#f2e7cf" stroke="' + INK + '" stroke-width="2"/>'
      + '<path d="M81 32h6v5h5v6h-5v5h-6v-5h-5v-6h5z" fill="#b3352c"/>',
    pub: roof(4, 18, 52, 28) + roof(60, 28, 24, 20, '#a9764a')
      + '<path d="M92 20v30" stroke="' + INK + '" stroke-width="2.6" stroke-linecap="round"/>'
      + '<rect x="78" y="22" width="16" height="12" rx="1" fill="#3f5a3a" stroke="' + INK + '" stroke-width="2"/>',
    cottage: roof(18, 18, 48, 28)
      + '<g fill="#c2506a" stroke="' + INK + '" stroke-width="1.4"><circle cx="10" cy="28" r="4.4"/><circle cx="8" cy="44" r="3.6"/>'
      + '<circle cx="76" cy="26" r="3.8"/><circle cx="82" cy="42" r="4.4"/></g>'
      + '<path d="M18 54h48" fill="none" stroke="' + INK + '" stroke-width="1.8" stroke-dasharray="5 4"/>',
    church: roof(32, 22, 52, 22) + roof(6, 14, 24, 30, '#a9764a')
      + '<path d="M18 4v10M13 8h10" stroke="' + INK + '" stroke-width="2.6" stroke-linecap="round"/>'
      + '<g fill="none" stroke="' + INK + '" stroke-width="1.6" opacity=".65"><path d="M38 54h44M44 62h32"/></g>',
    post: roof(8, 18, 54, 30)
      + '<rect x="74" y="22" width="15" height="28" rx="7.5" fill="#b3352c" stroke="' + INK + '" stroke-width="2.4"/>'
      + '<path d="M77 31h9" stroke="#3a2a1c" stroke-width="2.6"/>',
    shop: roof(6, 14, 58, 26)
      + '<path d="M6 40h58v11H6z" fill="#b3352c" stroke="' + INK + '" stroke-width="2"/>'
      + '<path d="M16 40v11M26 40v11M36 40v11M46 40v11M56 40v11" stroke="#f6efdc" stroke-width="3"/>'
      + '<rect x="72" y="26" width="18" height="18" rx="2" fill="#cdb075" stroke="' + INK + '" stroke-width="2"/>',
    van: '<g><rect x="17" y="26.5" width="68" height="28" rx="3" fill="' + INK + '" opacity=".26"/>'
      + '<rect x="14" y="22" width="68" height="28" rx="3" fill="#b3352c" stroke="' + INK + '" stroke-width="2.4"/>'
      + '<path d="M60 22v28" stroke="' + INK + '" stroke-width="2"/>'
      + '<rect x="64" y="27" width="14" height="18" rx="2" fill="#9fc4d8" stroke="' + INK + '" stroke-width="2"/>'
      + '<g fill="#2f2318"><rect x="20" y="16" width="14" height="7" rx="2.5"/><rect x="20" y="49" width="14" height="7" rx="2.5"/>'
      + '<rect x="62" y="16" width="14" height="7" rx="2.5"/><rect x="62" y="49" width="14" height="7" rx="2.5"/></g></g>',
  };
  function mapArt(kind) { return '<svg class="pbb" viewBox="0 0 100 70" aria-hidden="true">' + (MAP_ART[kind] || '') + '</svg>'; }

  // ---- what a find looks like on the map. Drawn in the map's own ink, and faint: the village
  // does not point these out, and neither does the game.
  const FIND_ART = {
    paws: '<g fill="' + INK + '" opacity=".85">'
      + '<g transform="translate(4 26) rotate(-24)"><ellipse cx="0" cy="0" rx="4" ry="5"/><circle cx="-4.5" cy="-5" r="1.9"/><circle cx="0" cy="-7" r="1.9"/><circle cx="4.5" cy="-5" r="1.9"/></g>'
      + '<g transform="translate(17 16) rotate(-18)"><ellipse cx="0" cy="0" rx="4" ry="5"/><circle cx="-4.5" cy="-5" r="1.9"/><circle cx="0" cy="-7" r="1.9"/><circle cx="4.5" cy="-5" r="1.9"/></g>'
      + '<g transform="translate(28 4) rotate(-12)"><ellipse cx="0" cy="0" rx="4" ry="5"/><circle cx="-4.5" cy="-5" r="1.9"/><circle cx="0" cy="-7" r="1.9"/><circle cx="4.5" cy="-5" r="1.9"/></g>'
      + '</g>',
    collar: '<g fill="none" stroke="' + INK + '" stroke-width="3.2"><path d="M4 14a12 8 0 1 0 24 0a12 8 0 1 0 -24 0"/></g>'
      + '<rect x="12" y="4" width="8" height="6" rx="1.5" fill="#b3352c" stroke="' + INK + '" stroke-width="2"/>',
    flowers: '<g stroke="' + INK + '" stroke-width="2"><path d="M16 30V12" fill="none"/><path d="M16 22l-7-5M16 24l7-6" fill="none"/></g>'
      + '<g fill="#c2506a" stroke="' + INK + '" stroke-width="1.6"><circle cx="16" cy="8" r="4.5"/><circle cx="8" cy="15" r="3.6"/><circle cx="24" cy="16" r="3.6"/></g>',
    chair: '<g fill="none" stroke="' + INK + '" stroke-width="2.6" stroke-linecap="round">'
      + '<path d="M8 14h16M8 14v14M24 14v14M8 21h16M12 4v10M20 4v10M12 4h8"/></g>',
    lamp: '<g><circle cx="16" cy="14" r="9" fill="#f0d789" stroke="' + INK + '" stroke-width="2.2" opacity=".9"/>'
      + '<circle cx="16" cy="14" r="15" fill="#f0d789" opacity=".22"/>'
      + '<path d="M16 23v8M11 31h10" fill="none" stroke="' + INK + '" stroke-width="2.4" stroke-linecap="round"/></g>',
    wall: '<g fill="none" stroke="' + INK + '" stroke-width="2.2">'
      + '<rect x="3" y="6" width="26" height="20" rx="1"/><path d="M3 13h26M3 20h26M11 6v7M21 13v7M8 20v6M19 20v6"/></g>',
    smooth: '<g fill="none" stroke="' + INK + '" stroke-width="2.2"><rect x="4" y="8" width="24" height="16" rx="2"/>'
      + '<path d="M8 14h7M8 18h5" stroke-linecap="round"/></g>'
      + '<path d="M18 12h8v10h-8z" fill="#e9dcbc" stroke="' + INK + '" stroke-width="1.6"/>',
    '*': '<circle cx="16" cy="16" r="8" fill="none" stroke="' + INK + '" stroke-width="2.6" stroke-dasharray="3 4"/>',
  };
  function findArt(kind) { return '<svg class="pbfind-art" viewBox="0 0 32 32" aria-hidden="true">' + (FIND_ART[kind] || FIND_ART['*']) + '</svg>'; }

  const ROADS = [
    { d: 'M-12 302 C 150 290, 320 314, 470 302 C 640 290, 800 312, 1012 300', w: 54 },
    { d: 'M352 292 C 300 250, 232 202, 160 150 C 151 142, 146 122, 142 106', w: 38 },
    { d: 'M206 180 C 224 146, 240 112, 248 88', w: 24 },
    { d: 'M392 296 C 386 258, 382 226, 380 204', w: 24 },
    { d: 'M250 306 C 244 372, 254 424, 248 466 C 245 494, 278 508, 308 512', w: 38 },
    { d: 'M600 300 C 596 250, 604 188, 600 134', w: 34 },
    { d: 'M888 300 C 884 250, 892 202, 888 172', w: 34 },
    { d: 'M452 318 C 451 332, 450 344, 450 358', w: 22 },
    { d: 'M592 318 C 591 332, 590 344, 590 358', w: 22 },
    { d: 'M700 318 C 708 378, 750 424, 822 436 C 890 447, 944 424, 1000 402', w: 30 },
  ];
  const ROAD_SVG =
    '<g fill="none" stroke="' + INK + '" stroke-linecap="round" opacity=".55">'
    + ROADS.map((r) => '<path d="' + r.d + '" stroke-width="' + (r.w + 7) + '"/>').join('') + '</g>'
    + '<g fill="none" stroke="#ddc79e" stroke-linecap="round">'
    + ROADS.map((r) => '<path d="' + r.d + '" stroke-width="' + r.w + '"/>').join('') + '</g>'
    + '<g fill="none" stroke="#c6ab7e" stroke-linecap="round" opacity=".5">'
    + ROADS.map((r) => '<path d="' + r.d + '" stroke-width="' + (r.w * 0.3).toFixed(1) + '" stroke-dasharray="2 24"/>').join('') + '</g>';

  const FIELDS = [
    'M336 26 L430 20 L436 132 L342 138 Z',
    'M806 26 L984 18 L990 104 L812 112 Z',
    'M34 402 L166 394 L172 456 L40 464 Z',
    'M726 470 L906 462 L912 548 L732 556 Z',
  ];
  const FIELD_SVG = '<g stroke="' + INK + '" stroke-width="2.4" stroke-linejoin="round">'
    + FIELDS.map((d) => '<path d="' + d + '" fill="#c7d59d"/>').join('') + '</g>'
    + '<g stroke="none">' + FIELDS.map((d) => '<path d="' + d + '" fill="url(#ashfurrow)"/>').join('') + '</g>';

  const TREES = [
    [30, 108], [58, 130], [22, 152], [52, 174], [28, 196],
    [456, 78], [462, 214], [748, 66], [762, 216], [520, 44],
    [318, 350], [348, 380], [976, 236], [948, 264],
    [78, 168], [62, 238], [940, 466], [968, 508],
    [598, 536], [630, 564], [786, 350], [828, 372], [900, 344],
    [676, 552], [246, 122],
  ];
  const TREE_SVG = '<g id="ashtree">'
    + '<g fill="#96b06a" stroke="#55703c" stroke-width="2.2">'
    + '<circle cx="0" cy="2" r="13"/><circle cx="-9" cy="8" r="8.5"/><circle cx="9" cy="8" r="8.5"/>'
    + '<circle cx="-7" cy="-7" r="8.5"/><circle cx="7" cy="-8" r="7.5"/></g></g>';

  const MAP_SVG = '<svg class="pbmap" viewBox="0 0 1000 600" role="img" aria-label="A hand-drawn map of Ashfield">'
    + '<defs>'
    + '<filter id="ashwob" x="-4%" y="-4%" width="108%" height="108%">'
    + '<feTurbulence type="fractalNoise" baseFrequency="0.013" numOctaves="2" seed="11" result="t"/>'
    + '<feDisplacementMap in="SourceGraphic" in2="t" scale="5" xChannelSelector="R" yChannelSelector="G"/></filter>'
    + '<filter id="ashpaper"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4" seed="5"/>'
    + '<feColorMatrix type="saturate" values="0"/></filter>'
    + '<pattern id="ashfurrow" width="17" height="17" patternUnits="userSpaceOnUse" patternTransform="rotate(15)">'
    + '<path d="M0 8.5h17" fill="none" stroke="#9aac72" stroke-width="2.2" stroke-dasharray="11 6"/></pattern>'
    + '<radialGradient id="ashvig" cx="50%" cy="45%" r="74%">'
    + '<stop offset="58%" stop-color="#7d8a52" stop-opacity="0"/><stop offset="100%" stop-color="#6d7a46" stop-opacity=".5"/></radialGradient>'
    + TREE_SVG
    + '</defs>'
    + '<rect width="1000" height="600" fill="#d6dfae"/>'
    + '<g opacity=".55">'
    + '<path d="M-20 0 C 200 40, 420 -20, 620 30 C 820 80, 940 20, 1020 60 L1020 -20 L-20 -20 Z" fill="#c8d4a0"/>'
    + '<path d="M-20 600 C 180 540, 340 600, 540 566 C 740 532, 880 592, 1020 552 L1020 620 L-20 620 Z" fill="#c8d4a0"/>'
    + '<ellipse cx="180" cy="330" rx="180" ry="90" fill="#dde5b8"/>'
    + '<ellipse cx="860" cy="180" rx="150" ry="110" fill="#dde5b8"/>'
    + '</g>'
    + '<g filter="url(#ashwob)">'
    + '<ellipse cx="600" cy="132" rx="172" ry="102" fill="#cfe0a5" stroke="' + INK + '" stroke-width="2" stroke-opacity=".3"/>'
    + FIELD_SVG
    + '<path d="M-10 118 C 30 168, 22 232, 48 292 C 62 330, 42 384, -10 406" fill="none" stroke="' + INK + '" stroke-width="18" opacity=".45" stroke-linecap="round"/>'
    + '<path d="M-10 118 C 30 168, 22 232, 48 292 C 62 330, 42 384, -10 406" fill="none" stroke="#9dc3c8" stroke-width="12" stroke-linecap="round"/>'
    + '<ellipse cx="706" cy="192" rx="46" ry="25" fill="#9dc3c8" stroke="' + INK + '" stroke-width="2.6"/>'
    + '<path d="M684 190h18M712 198h16" fill="none" stroke="#f2f6ee" stroke-width="2.4" opacity=".7"/>'
    + ROAD_SVG
    + '<g stroke="' + INK + '" stroke-width="3.4" stroke-linecap="round"><path d="M24 280 L84 273M28 328 L88 321"/></g>'
    + '<g><rect x="225" y="42" width="52" height="40" rx="2" fill="' + INK + '" opacity=".26"/>'
    + '<rect x="222" y="37" width="52" height="40" rx="2" fill="#a9764a" stroke="' + INK + '" stroke-width="3"/>'
    + '<path d="M222 57h52" fill="none" stroke="' + INK + '" stroke-width="2.4"/>'
    + '<circle cx="298" cy="62" r="21" fill="#e2d3ac" stroke="' + INK + '" stroke-width="4"/>'
    + '<path d="M277 62h42M298 41v42M283 47l30 30M313 47l-30 30" fill="none" stroke="' + INK + '" stroke-width="3"/></g>'
    + '<g><path d="M400 476 L544 468 L550 556 L406 564 Z" fill="#c2d29a" stroke="' + INK + '" stroke-width="2.8"/>'
    + '<g fill="#ddd6c1" stroke="' + INK + '" stroke-width="2">'
    + '<path d="M424 526v-16a7 7 0 0 1 14 0v16z"/><path d="M458 520v-15a7 7 0 0 1 14 0v15z"/>'
    + '<path d="M506 530v-16a7 7 0 0 1 14 0v16z"/><path d="M452 550v-13a6 6 0 0 1 12 0v13z"/></g></g>'
    + '<g fill="none" stroke="#7d9455" stroke-width="4" stroke-linecap="round" stroke-dasharray="16 12" opacity=".8">'
    + '<path d="M60 352 C 130 344, 180 356, 226 350M470 210 C 500 240, 496 262, 480 276M596 470 C 640 462, 672 478, 700 470"/></g>'
    + '<g><path d="M28 504 q83 -11 166 0 v52 q-83 11 -166 0 z" fill="#f2e8ca" stroke="' + INK + '" stroke-width="3"/>'
    + '<path d="M28 504 l-22 13 22 15 z" fill="#ddcea6" stroke="' + INK + '" stroke-width="3" stroke-linejoin="round"/>'
    + '<path d="M194 504 l22 13 -22 15 z" fill="#ddcea6" stroke="' + INK + '" stroke-width="3" stroke-linejoin="round"/></g>'
    + '</g>'
    + '<g>' + TREES.map((t) => '<use href="#ashtree" x="' + t[0] + '" y="' + t[1] + '"/>').join('') + '</g>'
    + '<g class="pbroad">'
    + '<text x="760" y="270" text-anchor="middle">Front Street</text>'
    + '<text x="84" y="258">&#8592; the road out</text>'
    + '<text x="258" y="230" text-anchor="middle" transform="rotate(36 258 230)">the mill road</text>'
    + '<text x="216" y="446" transform="rotate(-90 216 446)">Church Lane</text>'
    + '<text x="712" y="116" text-anchor="middle">the green</text>'
    + '<text x="898" y="352" text-anchor="middle">the far end</text>'
    + '</g>'
    + '<g class="pbplacename"><text x="250" y="26" text-anchor="middle">the old mill</text>'
    + '<text x="474" y="592" text-anchor="middle">the churchyard</text></g>'
    + '<g class="pbbanner"><text x="111" y="541" text-anchor="middle">ASHFIELD</text></g>'
    + '<rect width="1000" height="600" filter="url(#ashpaper)" opacity=".14" style="mix-blend-mode:multiply"/>'
    + '<rect width="1000" height="600" fill="url(#ashvig)"/>'
    + '</svg>';

  // ------------------------------------------------------------ what a piece looks like
  const PIECE_ART = {
    letter: '<svg viewBox="0 0 96 62" aria-hidden="true"><rect x="3" y="3" width="90" height="56" rx="3" fill="#fffdf2" stroke="#3c2818" stroke-width="4"/>'
      + '<path d="M5 7 48 38 91 7" fill="none" stroke="#3c2818" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>'
      + '<path d="M6 55 35 31M90 55 61 31" fill="none" stroke="#3c2818" stroke-width="3" stroke-linecap="round" opacity=".4"/>'
      + '<circle cx="48" cy="37" r="6.5" fill="#b3352c" stroke="#3c2818" stroke-width="2.5"/></svg>',
    note: '<svg viewBox="0 0 96 62" aria-hidden="true"><path d="M8 6h68l12 12v38H8Z" fill="#f7f2df" stroke="#3c2818" stroke-width="4" stroke-linejoin="round"/>'
      + '<path d="M76 6v12h12" fill="none" stroke="#3c2818" stroke-width="3.4" stroke-linejoin="round"/>'
      + '<path d="M18 28h44M18 38h44M18 48h26" fill="none" stroke="#7d6a53" stroke-width="3.2" stroke-linecap="round"/></svg>',
  };

  // Each thing in the box gets a little drawing of itself, because a box you can see into is a
  // better box than a list of sentences.
  const THING_ART = {
    mug: '<path d="M18 26h34v30a10 10 0 0 1-10 10H28a10 10 0 0 1-10-10Z" fill="#f4f1e6" stroke="#3c2818" stroke-width="3"/>'
      + '<path d="M52 33h9a9 9 0 0 1 0 18h-9" fill="none" stroke="#8d6942" stroke-width="3.5"/>'
      + '<path d="M18 30h34" stroke="#8d332c" stroke-width="3"/>',
    glasses: '<rect x="12" y="30" width="52" height="24" rx="5" fill="#7d5028" stroke="#3c2818" stroke-width="3"/>'
      + '<path d="M12 36h52M12 44h52" stroke="#c99a2e" stroke-width="2.4"/>'
      + '<path d="M20 30v24M32 30v24M44 30v24M56 30v24" stroke="#3f5a3a" stroke-width="2"/>',
    thimble: '<path d="M26 62V38a12 12 0 0 1 24 0v24Z" fill="#d6d2c6" stroke="#3c2818" stroke-width="3"/>'
      + '<path d="M26 54h24" stroke="#3c2818" stroke-width="2"/>'
      + '<g fill="#9a958a"><circle cx="32" cy="34" r="1.6"/><circle cx="38" cy="31" r="1.6"/><circle cx="44" cy="34" r="1.6"/>'
      + '<circle cx="32" cy="42" r="1.6"/><circle cx="38" cy="39" r="1.6"/><circle cx="44" cy="42" r="1.6"/></g>',
    book: '<path d="M14 24h24a6 6 0 0 1 6 6v34H20a6 6 0 0 1-6-6Z" fill="#e8dcc0" stroke="#3c2818" stroke-width="3"/>'
      + '<path d="M44 30a6 6 0 0 1 6-6h16v34a6 6 0 0 1-6 6H44Z" fill="#f4ecd4" stroke="#3c2818" stroke-width="3"/>'
      + '<path d="M44 30v34" stroke="#3c2818" stroke-width="2.4"/>'
      + '<rect x="50" y="18" width="9" height="24" fill="#8d332c" stroke="#3c2818" stroke-width="2"/>',
    timetable: '<path d="M18 18h40l6 6v44H18Z" fill="#fbfaf5" stroke="#3c2818" stroke-width="3"/>'
      + '<path d="M24 30h28M24 38h28M24 46h28M24 54h18" stroke="#6b6156" stroke-width="2.4"/>'
      + '<ellipse cx="40" cy="38" rx="15" ry="7" fill="none" stroke="#2f5fa8" stroke-width="2.6" transform="rotate(-4 40 38)"/>',
    key: '<circle cx="26" cy="30" r="11" fill="none" stroke="#6b6156" stroke-width="5"/>'
      + '<path d="M26 41v25" stroke="#6b6156" stroke-width="5" stroke-linecap="round"/>'
      + '<path d="M26 56h11M26 64h9" stroke="#6b6156" stroke-width="5" stroke-linecap="round"/>'
      + '<path d="M26 20c8-8 22-7 30 1" fill="none" stroke="#b9b2a0" stroke-width="2.6" stroke-dasharray="4 5"/>',
    button: '<circle cx="40" cy="42" r="22" fill="#8d6942" stroke="#3c2818" stroke-width="3"/>'
      + '<circle cx="40" cy="42" r="14" fill="none" stroke="#3c2818" stroke-width="1.6" opacity=".6"/>'
      + '<g fill="#3c2818"><circle cx="34" cy="37" r="2.6"/><circle cx="46" cy="37" r="2.6"/><circle cx="34" cy="48" r="2.6"/><circle cx="46" cy="48" r="2.6"/></g>'
      + '<path d="M34 37 46 48M46 37 34 48" stroke="#f4ecd4" stroke-width="2.6"/>',
    '*': '<rect x="16" y="26" width="48" height="36" rx="2" fill="#c9a86a" stroke="#3c2818" stroke-width="3"/>'
      + '<path d="M40 26v36M16 42h48" stroke="#8d6942" stroke-width="2.6"/>',
  };
  function thingArt(kind) { return '<svg class="thart" viewBox="0 0 80 80" aria-hidden="true">' + (THING_ART[kind] || THING_ART['*']) + '</svg>'; }

  function pieceArt(p) {
    if (p.kind === 'thing') return thingArt(p.art);
    return '<span class="pcart">' + (PIECE_ART[p.kind] || PIECE_ART.letter) + '</span>';
  }

  // ------------------------------------------------------------ carrying a piece about
  let carryEl = null, carryX = 0, carryY = 0, carryArmed = false;
  function pbArm() {
    if (carryArmed) return;
    carryArmed = true;
    document.addEventListener('pointermove', (e) => {
      carryX = e.clientX; carryY = e.clientY;
      if (carryEl && !carryEl.hidden) pbPlace();
    }, { passive: true });
  }
  function pbPlace() { carryEl.style.left = carryX + 'px'; carryEl.style.top = carryY + 'px'; }
  function pbCarryOff() {
    if (carryEl) carryEl.hidden = true;
    document.body.classList.remove('pb-carrying');
  }
  function pbCarryShow() {
    const p = byId(held);
    if (!p || state.placed[p.id]) { pbCarryOff(); return; }
    if (!carryEl) { carryEl = document.createElement('div'); carryEl.className = 'pbcarry'; document.body.appendChild(carryEl); }
    carryEl.innerHTML = pieceArt(p);
    carryEl.hidden = false;
    document.body.classList.add('pb-carrying');
    pbPlace();
  }
  function take(id, e) {
    const p = byId(id);
    if (!p || state.placed[p.id]) return;
    if (p.kind === 'note') { openReader(p); return; }
    if (e && e.clientX) { carryX = e.clientX; carryY = e.clientY; }
    delete drops[id];
    findSel = null;
    held = id;
    renderDesk();
  }
  function takeFromBox(id) {
    const p = byId(id);
    if (!p || state.placed[p.id] !== 'box') return;
    delete state.placed[p.id];
    held = id;
    save();
    renderAll();
  }
  function dropOnMap(x, y) {
    if (!held) return;
    drops[held] = { x: Math.min(Math.max(x, 3), 97), y: Math.min(Math.max(y, 5), 95) };
    held = null;
    renderDesk();
  }
  function putBack() {
    if (!held) return false;
    held = null;
    renderDesk();
    return true;
  }

  // ------------------------------------------------------------ the pile, on the counter
  function pileHtml(api) {
    const list = inPile(api);
    const box = boxed(api);
    const rows = list.map((p, i) => {
      const face = p.kind === 'letter' ? plain(val(p.face, api), api)
        : p.kind === 'thing' ? val(p.what, api)
        : 'A note, folded twice';
      const sub = p.kind === 'letter' ? 'letter' : p.kind === 'thing' ? 'no address' : 'read it';
      return '<button type="button" class="pc pc-' + p.kind + (p.kind === 'note' && !state.placed[p.id] ? ' pc-new' : '') + '"'
        + ' data-piece="' + esc(p.id) + '" style="--tilt:' + rot(p.id, 2.4).toFixed(2) + 'deg;--i:' + i + '">'
        + pieceArt(p)
        + '<span class="pc-face">' + esc(face) + '</span>'
        + '<span class="pc-kind">' + esc(sub) + '</span></button>';
    }).join('');

    let html = '<div class="pilehead"><h2>The pile</h2>'
      + '<p class="pilesub">' + esc(list.length
        ? (list.length === 1 ? 'One thing left on the counter.' : list.length + ' things on the counter.')
        : 'The counter is clear.') + '</p></div>'
      + '<div class="pile' + (list.length ? '' : ' empty') + '">'
      + (list.length ? rows : '<p class="pile-none">' + esc(pileAll(api).length ? 'Everything that came this morning has gone where it was going.' : 'No van today.') + '</p>')
      + '</div>';

    if (box.length) {
      html += '<div class="boxrow"><h3>In the box</h3><div class="boxrow-in">'
        + box.map((p) => {
          const pts = pointsAt(p);
          return '<button type="button" class="bx' + (pts.length ? ' bx-ready' : '') + '" data-box="' + esc(p.id) + '"'
            + ' title="' + esc(val(p.what, api)) + '">' + thingArt(p.art)
            + (pts.length ? '<span class="bx-tick" aria-hidden="true">&#10003;</span>' : '') + '</button>';
        }).join('')
        + '</div><p class="boxrow-foot">' + esc(box.some((p) => pointsAt(p).length)
          ? 'A tick means your diary now says whose it is.'
          : 'Things you could not place. Ask about them, and come back.') + '</p></div>';
    }

    return html;
  }

  // What is on your hand, big enough to read: the front of a letter, or everything you can see
  // on a thing and what your diary makes of it.
  function handHtml(p, api) {
    if (!p) {
      return '<span class="inhand-cap">In your hand</span>'
        + '<p class="inhand-none">Nothing. Take something off the pile.</p>';
    }
    if (p.kind === 'letter') {
      const lines = plain(val(p.face, api), api).split(/,\s*/);
      return '<span class="inhand-cap">In your hand</span>'
        + '<div class="env"><span class="env-stamp"></span><span class="env-mark">ASHFIELD</span>'
        + '<span class="env-addr">' + lines.map((l) => '<span class="env-line">' + esc(l) + '</span>').join('') + '</span></div>';
    }
    const reading = readingOf(p);
    const pts = pointsAt(p);
    const tried = state.wrongs[p.id] || [];
    return '<span class="inhand-cap">In your hand</span>'
      + '<div class="thing"><div class="thing-top">' + thingArt(p.art) + '<b>' + esc(val(p.what, api)) + '</b></div>'
      + (reading.length
        ? '<ul class="thing-marks">' + reading.map((r) => '<li class="' + (r.clue ? 'known' : '') + '">'
            + '<span class="tm-mark">' + esc(r.mark) + '</span>'
            + (r.clue ? '<span class="tm-clue">' + esc(r.clue) + '</span>' : '<span class="tm-none">You do not know what that means yet.</span>')
            + '</li>').join('') + '</ul>'
        : '<p class="thing-bare">Nothing on it at all. No mark, no name, no wear.</p>')
      + (state.named[p.id] ? '<p class="thing-named">Somebody has told you outright: this is <b>' + esc(fullName(state.named[p.id])) + '</b>’s.</p>' : '')
      + (pts.length
        ? '<p class="thing-points">Your diary points at <b>' + esc(listNames(pts.map(fullName))) + '</b>.</p>'
        : '<p class="thing-points dim">Your diary has nothing that fits it. Ask somebody, or put it in the box.</p>')
      + (tried.length ? '<p class="thing-tried">Not ' + esc(listNames(tried.map(firstName))) + '.</p>' : '')
      + '</div>';
  }

  // ------------------------------------------------------------ the map, and what is on it
  function findsLive(api) {
    return C.finds.filter((f) => {
      if (state.told[f.id]) return false;
      if (state.flags.indexOf('open:' + f.id) !== -1) return true;   // uncovered by another find
      if (f.when && !safe(() => !!f.when(api), false)) return false;
      if (f.day && f.day > state.day) return false;
      return !!(f.day || f.when);
    });
  }

  function mapHtml(api) {
    const houses = mapStops().map((s) => '<button type="button" class="pbhouse'
      + (s.gone ? ' gone' : '') + (s.key === 'keeper' ? ' mine' : '') + (s.key === 'return' ? ' van' : '')
      + (s.key === mapSel ? ' sel' : '') + '"'
      + (s.gone ? ' disabled' : ' data-house="' + esc(s.key) + '"')
      + ' style="left:' + s.m.x + '%;top:' + s.m.y + '%;width:' + s.m.w + '%">'
      + '<span class="pbart">' + mapArt(s.m.art) + '</span>'
      + '<span class="pbplace">' + esc(s.m.house) + '</span>'
      + '<span class="pbwho">' + esc(s.gone ? 'shut up, nobody in' : s.name) + '</span></button>').join('');

    // the marks on the village: faint until you look at them, and gone once you have told somebody
    const marksHtml = findsLive(api).map((f) => '<button type="button" class="pbfind'
      + (state.found[f.id] ? ' seen' : '') + (findSel === f.id ? ' sel' : '') + '"'
      + ' data-find="' + esc(f.id) + '" style="left:' + f.x + '%;top:' + f.y + '%"'
      + ' aria-label="Something on the map">' + findArt(f.art) + '</button>').join('');

    const lying = pileOpen(api).filter((p) => p.id !== held && drops[p.id]).map((p) =>
      '<button type="button" class="pblie" data-piece="' + esc(p.id) + '"'
      + ' style="left:' + drops[p.id].x.toFixed(2) + '%;top:' + drops[p.id].y.toFixed(2) + '%;'
      + '--tilt:' + rot(p.id, 9).toFixed(2) + 'deg">'
      + '<span class="pblie-stamp"></span><span class="pblie-face">'
      + esc(p.kind === 'letter' ? plain(val(p.face, api), api) : val(p.what, api)) + '</span></button>').join('');

    return '<div class="pbdesk"><div class="pbscroll"><div class="pbwrap" id="pbwrap">'
      + MAP_SVG + houses + marksHtml + lying + findCardHtml(api) + callCardHtml(api)
      + '</div></div></div>';
  }

  // ---- one of the marks on the map, picked up and looked at
  function findCardHtml(api) {
    if (!findSel) return '';
    const f = C.finds.filter((x) => x.id === findSel)[0];
    if (!f || state.told[f.id]) return '';
    const who = f.tell && f.tell.who;
    const canTell = who && alive(who) && metPerson(who);
    return '<div class="pbcard pbfind-card' + (f.y > 52 ? ' up' : '') + '"'
      + ' style="left:' + Math.min(Math.max(f.x, 20), 80) + '%;top:' + f.y + '%">'
      + '<span class="pbcard-tail"></span>'
      + '<p class="pbfind-look">' + markup(val(f.look, api), api).replace(/<\/?p>/g, '') + '</p>'
      + (f.tell
        ? (canTell
          ? '<p class="pbfind-next">In your diary. Go to ' + esc(fullName(who)) + '’s door to say so.</p>'
          : '<p class="pbfind-next dim">In your diary. You do not know ' + esc(firstName(who)) + ' well enough to knock yet.</p>')
        : '<p class="pbfind-next">In your diary.</p>')
      + '</div>';
  }

  // ---- what is on offer at a house you have your finger on
  function callCardHtml(api) {
    if (!mapSel || !C.villagers[mapSel] || state.removed.indexOf(mapSel) !== -1) return '';
    const m = MAP[mapSel];
    const known = metPerson(mapSel);
    const done = state.reaches.filter((x) => x.who === mapSel && x.day === state.day);
    const tells = known ? tellable(mapSel, api) : [];
    const asks = known ? askable(mapSel, api) : [];
    const opts = known ? C.outreach.filter((o) => o.who === mapSel && reachOpen(o, api)) : [];
    if (!known && !done.length) {
      return card(m, '<h4>' + esc(fullName(mapSel)) + '</h4>'
        + '<p class="pbcall-hint">' + esc(C.villagers[mapSel].role) + '. You have not put anything into ' + esc(firstName(mapSel))
        + '’s hand yet, and you cannot knock on a stranger. Deliver something.</p>');
    }
    const spent = askedToday(mapSel);
    const walked = visitsLeft(api) <= 0;

    const said = done.map((x) => '<div class="pbcall-done"><b>' + esc(x.text) + '</b>'
      + '<div class="outcome">' + markup(x.outcome || 'Nothing comes of it.', api) + '</div></div>').join('');

    // telling somebody a thing you found is free. It is not a favour asked; it is one done.
    const tellRows = tells.map((f) => '<button type="button" class="pbcall-opt tell" data-tell="' + esc(f.id) + '">'
      + '<span class="pbcall-kind">Tell</span><span class="pbcall-what">' + esc(val(f.tell.label, api)) + '</span></button>').join('');

    const optRows = opts.map((o) => {
      const dis = o.kind === 'visit' ? walked : spent;
      const when = o.kind === 'visit' ? meetLine(o.who, api, o.plans) : '';
      return '<button type="button" class="pbcall-opt" data-reach="' + esc(o.id) + '"' + (dis ? ' disabled' : '') + '>'
        + '<span class="pbcall-kind">' + esc(o.kind === 'visit' ? 'Go' : 'Ask') + '</span>'
        + '<span class="pbcall-what">' + esc(plain(val(o.text, api), api))
        + (when ? '<span class="pbcall-when">' + esc(when) + '</span>' : '') + '</span></button>';
    }).join('');

    // and the asking that scales: anything you are carrying or holding in the box
    const askRows = asks.map((p) => '<button type="button" class="pbcall-opt ask-thing" data-ask="' + esc(p.id) + '"'
      + (spent ? ' disabled' : '') + '>'
      + '<span class="pbcall-kind">Ask</span>'
      + '<span class="pbcall-what">About ' + esc(lowerFirst(val(p.what, api))) + '</span></button>').join('');

    let body = '<h4>' + esc(fullName(mapSel)) + '</h4>' + said + tellRows + optRows + askRows;
    if (!tells.length && !opts.length && !asks.length && !done.length) {
      body += '<p class="pbcall-hint">Nothing to say today. Find something of theirs, or something on the map.</p>';
    } else if (spent && (asks.length || opts.some((o) => o.kind !== 'visit'))) {
      body += '<p class="pbcall-hint">You have had your question of ' + esc(firstName(mapSel)) + ' today.</p>';
    }
    return card(m, body);
  }
  function card(m, inner) {
    const anchor = m.x < 17 ? '17%' : m.x > 83 ? '83%' : '50%';
    return '<div class="pbcard pbcall' + (m.y > 52 ? ' up' : '') + '" style="left:' + m.x + '%;top:' + m.y + '%;--pbcall-x:' + anchor + '">'
      + '<span class="pbcard-tail"></span><div class="pbcall-body">' + inner + '</div></div>';
  }
  function lowerFirst(s) { return String(s).charAt(0).toLowerCase() + String(s).slice(1); }

  // ------------------------------------------------------------ reaching out
  function reachOpen(o, api) {
    if (state.removed.indexOf(o.who) !== -1) return false;
    if (state.reaches.some((x) => x.id === o.id)) return false;
    return !o.when || safe(() => !!o.when(api), false);
  }
  function visitsLeft(api) {
    return Math.max(0, VISITS_A_DAY - state.reaches.filter((x) => x.day === state.day && x.kind === 'visit').length);
  }
  function askedToday(who) { return state.reaches.some((x) => x.day === state.day && x.who === who && x.kind === 'ask'); }

  // Things you could ask this person about: whatever is in your hand or in the box, that you
  // have not already asked them about, and that is not already settled.
  function askable(who, api) {
    return unsolvedThings(api).filter((p) => !state.reaches.some((x) => x.id === 'ask:' + p.id + ':' + who));
  }
  function tellable(who, api) {
    return C.finds.filter((f) => state.found[f.id] && !state.told[f.id] && f.tell && f.tell.who === who);
  }
  function callable(api) {
    return Object.keys(C.villagers).filter((k) => metPerson(k)
      && (tellable(k, api).length
        || (!askedToday(k) && (askable(k, api).length || C.outreach.some((o) => o.who === k && o.kind === 'ask' && reachOpen(o, api))))
        || (visitsLeft(api) > 0 && C.outreach.some((o) => o.who === k && o.kind === 'visit' && reachOpen(o, api)))));
  }

  function meetLine(who, api, plans) {
    const p = (plans && plans[0]) || (typeof C.work[who].meet === 'function' ? safe(() => C.work[who].meet(api), null) : C.work[who].meet);
    if (!p) return '';
    return placeName(p.at) + ', ' + fmtHour(p.hour);
  }
  function fmtHour(h) {
    if (h == null) return '';
    const hh = Math.floor(h), mm = Math.round((h - hh) * 60);
    const ampm = hh < 12 ? 'am' : 'pm';
    const h12 = hh % 12 === 0 ? 12 : hh % 12;
    return h12 + (mm ? '.' + String(mm).padStart(2, '0') : '') + ampm;
  }

  function doReach(o) {
    const api = makeApi();
    if (!reachOpen(o, api) || !metPerson(o.who)) return;
    if (o.kind === 'visit' ? visitsLeft(api) <= 0 : askedToday(o.who)) return;
    const before = snapshotTrust();
    state.reaches.push({ id: o.id, who: o.who, kind: o.kind || 'ask',
      text: plain(val(o.text, api), api), outcome: val(o.outcome, api) || '', day: state.day });
    applyEffects(o.effects, api);
    trackTrust(before);
    save();
    if (state.ending === 'burn') { runBurn(); return; }
    renderAll();
  }

  // Asking somebody about a thing. They tell you about any mark on it they would know, and if it
  // is theirs, they say so. No line of writing per pairing: the answer is assembled.
  function doAskAbout(who, thingId) {
    const api = makeApi();
    const p = byId(thingId);
    if (!p || askedToday(who) || !metPerson(who)) return;
    const before = snapshotTrust();
    let outcome, learnt = [];

    if (p.owner === who) {
      outcome = C.claims[who] || 'They take it back, and thank you.';
      state.named[p.id] = who;
      api.addTrust(who, 1);
    } else {
      const canSay = (C.speaks[who] || []).filter((k) => (p.marks || []).indexOf(k) !== -1 && !state.learned[k]);
      const known = (C.speaks[who] || []).filter((k) => (p.marks || []).indexOf(k) !== -1);
      if (canSay.length) {
        canSay.forEach((k) => { if (learnClue(k, firstName(who) + ', day ' + state.day)) learnt.push(k); });
        outcome = firstName(who) + ' looks at it properly, the way people here look at a thing before they say anything about it. '
          + learnt.map((k) => '“' + C.clues[k].text + '”').join(' ');
      } else if (known.length) {
        outcome = '“I told you that already,” they say, not unkindly, and tell you again.';
      } else {
        outcome = pickFrom(C.shrugs, who + thingId);
      }
    }
    state.reaches.push({ id: 'ask:' + thingId + ':' + who, who: who, kind: 'ask',
      text: 'About ' + lowerFirst(val(p.what, api)), outcome: outcome, day: state.day });
    trackTrust(before);
    save();
    renderAll();
  }

  // Telling somebody what you found on the map. This is the one that costs nothing, because it
  // is the postmaster's actual job: carrying what you saw to the person it is about.
  function doTell(findId) {
    const api = makeApi();
    const f = C.finds.filter((x) => x.id === findId)[0];
    if (!f || !f.tell || state.told[f.id] || !metPerson(f.tell.who)) return;
    const before = snapshotTrust();
    const outcome = val(f.tell.outcome, api) || '';
    state.told[f.id] = { who: f.tell.who, day: state.day, outcome: outcome };
    applyEffects(f.tell.effects, api);
    if (f.tell.opens) api.setFlag('open:' + f.tell.opens);
    state.reaches.push({ id: 'tell:' + f.id, who: f.tell.who, kind: 'tell',
      text: plain(val(f.tell.label, api), api), outcome: outcome, day: state.day });
    trackTrust(before);
    findSel = null;
    save();
    if (state.ending === 'burn') { runBurn(); return; }
    renderAll();
  }

  function doFind(id) {
    const f = C.finds.filter((x) => x.id === id)[0];
    if (!f) return;
    if (!state.found[f.id]) { state.found[f.id] = state.day; save(); }
    findSel = findSel === id ? null : id;
    mapSel = null;
    renderDesk();
  }

  // ------------------------------------------------------------ the diary
  // Everything you have been told and everything you have seen, in one book, because a village
  // is not solved by remembering it in your head.
  function diaryNew() {
    let n = 0;
    Object.keys(state.learned).forEach((k) => { if (state.learned[k].day === state.day) n++; });
    Object.keys(state.found).forEach((k) => { if (state.found[k] === state.day && !state.told[k]) n++; });
    return n;
  }

  function diaryHtml(api) {
    let html = '';

    // ---- what you have found and not yet passed on
    const untold = C.finds.filter((f) => state.found[f.id] && !state.told[f.id]);
    html += '<section class="dry"><h3>Worth mentioning</h3>';
    if (!untold.length) {
      html += '<p class="dry-none">Nothing waiting. Look at the map — the village leaves things lying about, and nobody else is looking down.</p>';
    } else {
      html += untold.map((f) => '<div class="dry-row">'
        + '<p class="dry-what">' + esc(val(f.look, api)) + '</p>'
        + (f.tell
          ? (metPerson(f.tell.who)
            ? '<p class="dry-who">Tell <b>' + esc(fullName(f.tell.who)) + '</b>. Their door is on the map.</p>'
            : '<p class="dry-who dim">' + esc(fullName(f.tell.who)) + ' would want to know, and does not know you yet.</p>')
          : '')
        + '</div>').join('');
    }
    html += '</section>';

    // ---- the things you have not managed to place
    const owing = unsolvedThings(api);
    html += '<section class="dry"><h3>Still nobody’s</h3>';
    if (!owing.length) {
      html += '<p class="dry-none">Everything that turned up has gone home.</p>';
    } else {
      html += owing.map((p) => {
        const reading = readingOf(p);
        const pts = pointsAt(p);
        return '<div class="dry-row dry-thing">'
          + thingArt(p.art)
          + '<div><p class="dry-what">' + esc(val(p.what, api)) + '</p>'
          + '<ul class="dry-marks">' + (reading.length
            ? reading.map((r) => '<li class="' + (r.clue ? 'known' : '') + '">' + esc(r.mark)
                + (r.clue ? ' — <i>' + esc(fullName(r.who)) + '</i>' : ' — <i>?</i>') + '</li>').join('')
            : '<li>no marks at all</li>') + '</ul>'
          + (pts.length
            ? '<p class="dry-who">Points at <b>' + esc(listNames(pts.map(fullName))) + '</b>.</p>'
            : '<p class="dry-who dim">Nothing fits it yet.</p>')
          + '</div></div>';
      }).join('');
    }
    html += '</section>';

    // ---- everything you have been told about a mark
    const keys = Object.keys(state.learned).sort((a, b) => state.learned[a].day - state.learned[b].day);
    html += '<section class="dry"><h3>What a mark means</h3>';
    if (!keys.length) {
      html += '<p class="dry-none">Nothing yet. Read the notes that come in the pile, and ask people about what you are holding.</p>';
    } else {
      html += '<ul class="dry-clues">' + keys.map((k) => {
        const c = C.clues[k];
        if (!c) return '';
        return '<li><span class="dc-mark">' + esc(C.marks[k]) + '</span>'
          + '<span class="dc-text">' + esc(c.text) + '</span>'
          + '<span class="dc-from">' + esc(fullName(c.who)) + (state.learned[k].how ? ' &middot; ' + esc(state.learned[k].how) : '') + '</span></li>';
      }).join('') + '</ul>';
    }
    html += '</section>';

    // ---- what came of what you said
    const told = Object.keys(state.told);
    if (told.length) {
      html += '<section class="dry"><h3>Told, and what came of it</h3>'
        + told.map((id) => {
          const f = C.finds.filter((x) => x.id === id)[0];
          const t = state.told[id];
          return '<div class="dry-row"><p class="dry-what">' + esc(f ? val(f.tell.label, api) : id)
            + ' <span class="dry-day">day ' + t.day + '</span></p>'
            + '<div class="outcome">' + markup(t.outcome, api) + '</div></div>';
        }).join('') + '</section>';
    }
    return html;
  }

  function openDiary() {
    const api = makeApi();
    openPanel('The diary', diaryHtml(api), 'diary');
    armSwaps($('panel-body'));
    renderTopbar(api);
  }

  // ------------------------------------------------------------ the address book
  function noteLive(n, api, who) { return !n.when || safe(() => !!n.when(api, who), false); }
  function notesFor(who, api) { return (C.notes[who] || []).filter((n) => noteLive(n, api, who)); }

  function renderBook(api) {
    const col = $('bookcol');
    if (!col) return;
    if (!bookWho || !C.villagers[bookWho]) bookWho = Object.keys(C.villagers)[0];
    const tabs = Object.keys(C.villagers).map((k) => {
      const gone = state.removed.indexOf(k) !== -1;
      return '<button type="button" class="tab' + (k === bookWho ? ' on' : '') + (gone ? ' gone' : '') + '" data-who="' + k + '">'
        + '<span class="tab-name">' + esc(firstName(k)) + '</span><span class="tab-role">' + esc(C.villagers[k].role) + '</span></button>';
    }).join('');
    col.innerHTML = '<div class="bookhead"><h2>' + esc(state.name) + '’s address book</h2>'
      + '<p class="booksub">' + esc(bandLine(api)) + '</p></div>'
      + '<nav class="book-tabs" aria-label="People">' + tabs + '</nav>'
      + '<div class="book-page" id="book-page"></div>';
    col.querySelectorAll('.book-tabs .tab').forEach((t) => {
      t.onclick = () => { bookWho = t.dataset.who; renderBook(makeApi()); };
    });
    renderBookPage(bookWho, api);
  }

  function bandLine(api) {
    const who = callable(api);
    if (!Object.keys(C.villagers).some(metPerson)) return 'Nobody knows you yet. Put something in somebody’s hand.';
    if (!who.length) return 'Nothing to go and do today. The more you carry, the more there is.';
    return 'Worth a knock today: ' + listNames(who.map(firstName)) + '.';
  }

  function renderBookPage(who, api) {
    const page = $('book-page');
    if (!page) return;
    const v = C.villagers[who];
    const gone = state.removed.indexOf(who) !== -1;
    const list = notesFor(who, api);
    const back = state.book.returned[who] || 0;
    const wrong = state.book.astray[who] || 0;
    let html = '<div class="bp-head"><h3>' + esc(v.name) + '</h3>'
      + '<span class="bp-standing" data-s="' + esc(standingWord(state.trust[who] || 0)) + '">' + esc(standingWord(state.trust[who] || 0)) + '</span></div>'
      + '<p class="bp-addr">' + esc(v.address) + '</p>'
      + '<p class="bp-bio">' + markup(val(gone && v.goneBio ? v.goneBio : v.bio, api), api).replace(/<\/?p>/g, '') + '</p>';

    if (gone) {
      html += '<p class="bp-gone">There is nobody at that address, and there is no one to write to about it.</p>';
    } else {
      const w = C.work[who];
      const m = typeof w.meet === 'function' ? safe(() => w.meet(api), null) : w.meet;
      html += '<section class="bp-sec"><h4>What they do</h4><p class="bp-job">' + esc(val(w.job, api))
        + (m ? ' <span class="bp-gap">Free for you at ' + esc(placeName(m.at)) + ', ' + esc(fmtHour(m.hour)) + '.</span>' : '') + '</p></section>';

      html += '<section class="bp-sec"><h4>What you know</h4>';
      html += list.length
        ? '<ul class="bp-notes">' + list.map((n) => '<li><b>' + esc(n.key) + '</b> — ' + esc(plain(val(n.text, api), api)) + '</li>').join('') + '</ul>'
        : '<p class="hint">Nothing yet. What you learn about ' + esc(firstName(who)) + ' turns up here on its own.</p>';
      html += '</section>';

      const mine = state.reaches.filter((x) => x.who === who);
      if (mine.length || back || wrong) {
        html += '<section class="bp-sec"><h4>Between us</h4>';
        if (back) html += '<p class="bp-tally">' + (back === 1 ? 'One thing' : back + ' things') + ' put back in their hand.</p>';
        if (wrong) html += '<p class="bp-tally bad">' + (wrong === 1 ? 'One letter' : wrong + ' letters') + ' through their door by mistake.</p>';
        html += mine.slice().reverse().map((x) => '<div class="bp-said"><b>' + esc(x.text) + '</b>'
          + '<span class="bp-day">day ' + x.day + '</span>'
          + '<div class="outcome">' + markup(x.outcome || '', api) + '</div></div>').join('');
        html += '</section>';
      }
    }
    html += '<section class="bp-sec"><h4>Your own hand</h4>'
      + '<textarea class="own-notes" rows="3" placeholder="Anything you want to remember.">' + esc(state.book.notes[who] || '') + '</textarea></section>';
    page.innerHTML = html;
    const ta = page.querySelector('.own-notes');
    if (ta) ta.oninput = () => { state.book.notes[who] = ta.value.slice(0, 2000); save(); };
    armSwaps(page);
  }

  // ------------------------------------------------------------ reading something
  // Only two things get opened: a note out of the pile, and a letter with your own name on it.
  function openReader(p) {
    const api = makeApi();
    const paper = $('reader-paper');
    let html = '';
    let kind = 'letter';
    if (p.kind === 'note') {
      kind = p.from === 'ash' ? 'ash' : p.from === 'someone' ? 'rumour' : 'notice';
      html = '<p class="from">' + esc(noteFrom(p)) + '</p>'
        + '<div class="body">' + markup(val(p.text, api), api) + '</div>'
        + '<div class="actions"><h4>What it is worth</h4>'
        + '<p class="hint">' + esc(noteWorth(p, api)) + '</p>'
        + '<button type="button" class="opt" data-keep>Keep it. It goes in the diary.</button></div>';
    } else {
      const r = p.read;
      const done = state.answered[p.id];
      kind = r.from === 'ash' ? 'ash' : 'letter';
      html = '<p class="from">' + esc(noteFrom({ from: r.from })) + '</p>'
        + (val(r.subject, api) ? '<p class="subject">' + esc(val(r.subject, api)) + '</p>' : '')
        + '<div class="body">' + markup(val(r.body, api), api) + '</div>'
        + (val(r.sign, api) ? '<p class="signoff">' + esc(val(r.sign, api)) + '</p>' : '');
      if (done) {
        html += '<div class="actions"><h4>You wrote back</h4>'
          + '<div class="reply-card">' + esc(done.text) + '</div>'
          + '<div class="outcome">' + markup(done.outcome || '', api) + '</div>'
          + '<div class="row"><button type="button" class="btn" data-close>Put it in the drawer</button></div></div>';
      } else {
        html += '<div class="actions"><h4>Write back</h4>' + (r.replies || []).map((o, i) =>
          '<button type="button" class="opt" data-reply="' + i + '">' + esc(plain(val(o.text, api), api)) + '</button>').join('') + '</div>';
      }
    }
    paper.innerHTML = html;
    paper.hidden = false;
    paper.className = 'paper reader-paper ' + kind;
    $('reader').classList.add('open');
    wireReader(p, api);
    armSwaps(paper);
  }
  // What keeping a note actually buys you, said plainly, because a diary is a book of facts.
  function noteWorth(p, api) {
    const bits = [];
    const fresh = (p.gives || []).filter((k) => C.clues[k] && !state.learned[k]);
    if (fresh.length) bits.push(fresh.length === 1 ? 'One mark you will be able to read after this.' : fresh.length + ' marks you will be able to read after this.');
    const settle = p.names || p.asks;
    if (settle) {
      const t = byId(settle);
      if (t) bits.push('It settles ' + lowerFirst(val(t.what, api)) + ' outright.');
    }
    if (!bits.length) bits.push('Nothing you did not already know. Keep it anyway; the diary keeps everything.');
    return bits.join(' ');
  }

  function noteFrom(p) {
    if (!p.from) return 'Unsigned';
    if (C.villagers[p.from]) return C.villagers[p.from].name;
    return { parish: 'Parish Council', someone: 'Overheard', ash: 'Unsigned. Smeared with ash.', board: 'From behind the map' }[p.from] || p.from;
  }
  function wireReader(p, api) {
    const paper = $('reader-paper');
    const keep = paper.querySelector('[data-keep]');
    if (keep) keep.onclick = () => keepNote(p);
    const close = paper.querySelector('[data-close]');
    if (close) close.onclick = closeReader;
    paper.querySelectorAll('[data-reply]').forEach((b) => {
      b.onclick = () => doReply(p, parseInt(b.dataset.reply, 10));
    });
  }
  function closeReader() {
    $('reader').classList.remove('open');
    const paper = $('reader-paper');
    if (paper) paper.hidden = true;
  }
  function doReply(p, idx) {
    const api = makeApi();
    const o = (p.read.replies || [])[idx];
    if (!o || state.answered[p.id]) return;
    const before = snapshotTrust();
    state.answered[p.id] = { choice: idx, text: plain(val(o.text, api), api), outcome: val(o.outcome, api) || '', day: state.day };
    applyEffects(o.effects, api);
    trackTrust(before);
    save();
    if (state.ending === 'burn') { closeReader(); runBurn(); return; }
    openReader(p);
    renderAll();
  }

  // ------------------------------------------------------------ rendering
  function renderAll() {
    const api = makeApi();
    renderTopbar(api);
    renderDesk();
    renderBook(api);
  }
  function renderDesk() {
    const api = makeApi();
    if (dropsDay !== state.day) { drops = {}; dropsDay = state.day; }
    pbArm();
    const col = $('sortcol');
    if (!col) return;
    const inHand = byId(held);
    col.innerHTML = mapHtml(api)
      + '<div class="inhand' + (inHand ? '' : ' empty') + '">' + handHtml(inHand, api) + '</div>'
      + '<p class="hint desk-hint">' + deskHint(api) + '</p>';
    const tray = $('pilecol');
    if (tray) tray.innerHTML = pileHtml(api);
    wireDesk(api);
    pbCarryShow();
    armSwaps(col);
  }
  function deskHint(api) {
    const p = byId(held);
    if (p) {
      return p.kind === 'letter'
        ? 'In your hand: <b>' + esc(plain(val(p.face, api), api)) + '</b>. Click the house on the front of it.'
        : 'In your hand: <b>' + esc(val(p.what, api)) + '</b>. Click whoever it belongs to — or the post office, to keep it in the box.';
    }
    if (findSel) return 'Something on the map. Take it to the door of whoever it is about.';
    if (handback) { const t = handback; handback = null; return esc(t); }
    const unlooked = findsLive(api).some((f) => !state.found[f.id]);
    return 'Click a house to knock.'
      + (unlooked ? ' <b>Something on the map is not where it was yesterday.</b>' : ' Nothing on the village has changed since you last looked.');
  }

  function wireDesk(api) {
    const col = $('sortcol');
    const wrap = col.querySelector('#pbwrap');
    const tray = $('pilecol');
    const atMap = (e) => {
      const r = wrap.getBoundingClientRect();
      return { x: (e.clientX - r.left) / r.width * 100, y: (e.clientY - r.top) / r.height * 100 };
    };
    if (tray) {
      tray.querySelectorAll('[data-piece]').forEach((b) => { b.onclick = (e) => take(b.dataset.piece, e); });
      tray.querySelectorAll('[data-box]').forEach((b) => { b.onclick = () => takeFromBox(b.dataset.box); });
    }
    col.querySelectorAll('.pblie').forEach((b) => {
      b.onclick = (e) => { if (held) return; e.stopPropagation(); take(b.dataset.piece, e); };
    });
    col.querySelectorAll('[data-find]').forEach((b) => {
      b.onclick = (e) => { e.stopPropagation(); if (held) return; doFind(b.dataset.find); };
    });
    col.querySelectorAll('[data-house]').forEach((b) => {
      b.onclick = (e) => {
        e.stopPropagation();
        const p = byId(held);
        if (p) { mapSel = null; findSel = null; place(p, b.dataset.house); return; }
        const key = b.dataset.house;
        mapSel = (mapSel === key || !C.villagers[key]) ? null : key;
        findSel = null;
        if (mapSel) { bookWho = mapSel; renderBook(makeApi()); }
        renderDesk();
      };
    });
    col.querySelectorAll('.pbcard').forEach((c) => { c.onclick = (e) => e.stopPropagation(); });
    col.querySelectorAll('[data-reach]').forEach((b) => {
      b.onclick = (e) => { e.stopPropagation(); const o = C.outreach.filter((x) => x.id === b.dataset.reach)[0]; if (o) doReach(o); };
    });
    col.querySelectorAll('[data-ask]').forEach((b) => {
      b.onclick = (e) => { e.stopPropagation(); doAskAbout(mapSel, b.dataset.ask); };
    });
    col.querySelectorAll('[data-tell]').forEach((b) => {
      b.onclick = (e) => { e.stopPropagation(); doTell(b.dataset.tell); };
    });
    if (wrap) wrap.onclick = (e) => {
      if (held) { const at = atMap(e); dropOnMap(at.x, at.y); return; }
      if (mapSel || findSel) { mapSel = null; findSel = null; renderDesk(); }
    };
  }

  function renderTopbar(api) {
    const d = C.days[state.day] || {};
    $('day-label').textContent = 'Day ' + state.day;
    $('day-week').textContent = val(d.week, api) || '';
    $('whoami').textContent = state.name + ', postmaster';
    const n = diaryNew();
    const badge = $('diary-badge');
    badge.hidden = !n;
    badge.textContent = n ? String(n) : '';
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

  // ------------------------------------------------------------ the day
  function beginDay() {
    held = null; drops = {}; dropsDay = state.day; mapSel = null; findSel = null;
    closeReader();
    const api = makeApi();
    save();
    renderAll();
    const d = C.days[state.day] || {};
    const intro = val(d.intro, api);
    if (intro) night(intro, () => {});
  }

  function endDayRequested() {
    const api = makeApi();
    const open = pileOpen(api);
    const letters = open.filter((p) => p.kind !== 'thing').length;
    const things = open.filter((p) => p.kind === 'thing').length;
    const bits = [];
    if (letters) bits.push(letters + (letters === 1 ? ' thing on the counter that will not keep' : ' things on the counter that will not keep'));
    if (things) bits.push(things + (things === 1 ? ' thing nobody has back yet' : ' things nobody has back yet'));
    if (bits.length) confirm(listNames(bits).replace(/^./, (c) => c.toUpperCase()) + '. Shut up the office anyway?', () => endDay(api));
    else endDay(api);
  }

  function endDay(api) {
    const evening = state.evening.slice();
    state.evening = [];

    // letters and notes left on the counter go out a day late, and that is that
    pileOpen(api).forEach((p) => {
      if (p.kind === 'thing') return;
      state.placed[p.id] = 'late';
      state.ignoredCount++;
    });
    // a thing you never placed just stays in the box, quietly
    C.pile.forEach((p) => {
      if (p.kind === 'thing' && !state.placed[p.id] && p.day <= state.day && pieceLive(p, api)) state.placed[p.id] = 'box';
    });

    const d = C.days[state.day] || {};
    save();

    const finish = () => {
      if (state.ending === 'burn') { runBurn(); return; }
      if (state.day >= LAST_DAY) { showEnding(state.ending || 'keep'); return; }
      night(val(d.night, api) || '', () => { state.day++; beginDay(); });
    };
    if (evening.length) showEvening(evening, api, finish);
    else finish();
  }

  function showEvening(items, api, then) {
    const card = $('evening-card');
    card.innerHTML = '<h2>After the office shut</h2>' + items.map((it) =>
      '<section class="evening-item"><p class="evening-who">' + esc(it.what) + '</p>'
      + '<div class="outcome">' + markup(it.outcome || '', api) + '</div></section>').join('');
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
  function threadsHtml(api) {
    const list = C.threads || [];
    if (!list.length) return '';
    const rows = list.map((t) => {
      const depth = t.beats.filter((b) => safe(() => !!b(api), false)).length;
      const gone = api.removed(t.who);
      const name = (C.villagers[t.who] || {}).name || t.who;
      const dots = t.beats.map((b, i) => '<i class="' + (i < depth ? 'on' : '') + '"></i>').join('');
      const line = depth >= t.beats.length ? t.done : t.left[depth];
      return '<div class="thread' + (depth >= t.beats.length ? ' is-done' : '') + (gone ? ' is-gone' : '') + '">'
        + '<div class="thread-head"><b>' + esc(t.title) + '</b><span class="dots">' + dots + '</span></div>'
        + '<div class="thread-line">' + markup(gone ? 'There is nobody at that address. You rubbed ' + name + ' off the map, and the shape of what they were in the middle of went with them, and nobody else in Ashfield has noticed it is missing.' : line, api) + '</div>'
        + '</div>';
    }).join('');
    const done = list.filter((t) => t.beats.every((b) => safe(() => !!b(api), false))).length;
    const head = done === 0
      ? 'You followed none of them all the way down. That is the usual number.'
      : done === 1 ? 'You followed one of them all the way down.'
        : done >= list.length ? 'You followed every one of them to the end, which nobody has time to do, and you found the time.'
          : 'You followed ' + done + ' of them all the way down.';
    return '<div class="threads-page"><h3>What you were in the middle of</h3>'
      + '<p class="threads-lede">' + esc(head) + ' Six people, twelve days, one walk a day. The rest of it was going on while you were sorting.</p>'
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
      btn.textContent = 'Pin a new map';
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
    const carry = { removed: state.removed.slice(), loop: state.loop + 1, prevName: state.name, book: { notes: state.book.notes } };
    state = freshState(state.name, carry);
    beginDay();
    save();
  }

  function runBurn() {
    stopDayGlitch();
    closeReader();
    $('overlay-panel').hidden = true;
    document.body.classList.add('burn');
    const wrap = $('pbwrap');
    if (wrap) wrap.classList.add('burning');
    meta.burned = true; meta.rounds = (meta.rounds || 0) + 1; saveMeta();
    clearSave();
    setTimeout(() => {
      document.body.classList.remove('burn');
      if (wrap) wrap.classList.remove('burning');
      showEnding('burn');
    }, 3000);
  }

  // ------------------------------------------------------------ panels and screens
  function openPanel(title, html, kind) {
    $('panel-title').textContent = title;
    $('panel-body').innerHTML = html;
    $('overlay-panel').querySelector('.panel').className = 'panel' + (kind ? ' panel-' + kind : '');
    $('overlay-panel').hidden = false;
    $('overlay-panel').querySelector('.panel').scrollTop = 0;
  }
  function closePanel() { $('overlay-panel').hidden = true; }

  function confirm(text, yes) {
    $('confirm-text').textContent = text;
    $('overlay-confirm').hidden = false;
    $('confirm-yes').onclick = () => { $('overlay-confirm').hidden = true; yes(); };
    $('confirm-no').onclick = () => { $('overlay-confirm').hidden = true; };
  }

  function howHtml() {
    return '<div class="how">'
      + '<p>The van leaves a pile on the counter every morning. Everything in it goes somewhere, and the day is over when it has.</p>'
      + '<ul>'
      + '<li><b>A letter</b> has the address on the front. Take it off the pile and click that house on the map. A wrong door is not undone by the right one tomorrow.</li>'
      + '<li><b>A thing</b> has no address at all — only marks. What a mark means is in your diary, and your diary points at a door.</li>'
      + '<li><b>A note</b> is read and kept. Notes are how the village tells you what a mark means, and sometimes they say outright whose something is.</li>'
      + '</ul>'
      + '<p>Anything you cannot place goes in the box, under the counter, and keeps.</p>'
      + '<p>With an empty hand, a house is a person. You can knock on anybody who has had something from you. <b>One question each per day</b>, and <b>one walk a day</b> in total.</p>'
      + '<p>The map is not only a set of doors. Things get left on it, and clicking one puts it in your diary — and then you can carry it to whoever it is about, which costs nothing, because that is the job.</p>'
      + '</div>';
  }

  function showStart() {
    $('screen-game').hidden = true;
    $('screen-start').hidden = false;
    const existing = loadSave();
    const cont = $('start-continue');
    if (existing && existing.name) {
      cont.hidden = false;
      $('start-continue-name').textContent = existing.name;
      $('start-continue-day').textContent = existing.day;
      $('btn-continue').onclick = () => { state = existing; ensureShape(); showGame(); renderAll(); };
      $('btn-restart').onclick = () => { confirm('Clear the desk and start again? The old one will be forgotten. Not by you.', () => { clearSave(); cont.hidden = true; }); };
    } else {
      cont.hidden = true;
    }
    if (meta.burned) $('start-name').placeholder = 'the name that was here before';
  }
  function showGame() { $('screen-start').hidden = true; $('screen-game').hidden = false; }
  function startNew(name) { state = freshState(name); showGame(); beginDay(); }

  // ------------------------------------------------------------ boot
  function boot() {
    meta.visits = (meta.visits || 0) + 1;
    saveMeta();

    $('start-form').onsubmit = (e) => {
      e.preventDefault();
      const name = $('start-name').value.trim();
      if (!name) return;
      startNew(name);
    };
    $('btn-endday').onclick = endDayRequested;
    $('btn-diary').onclick = openDiary;
    $('btn-how').onclick = () => openPanel('The job', howHtml(), 'how');
    $('panel-close').onclick = closePanel;
    $('overlay-panel').addEventListener('click', (e) => { if (e.target === $('overlay-panel')) closePanel(); });
    $('reader').addEventListener('click', (e) => { if (e.target === $('reader')) closeReader(); });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (!$('overlay-confirm').hidden) { $('overlay-confirm').hidden = true; return; }
      if (!$('overlay-panel').hidden) { closePanel(); return; }
      if ($('reader').classList.contains('open')) { closeReader(); return; }
      if (putBack()) return;
      if (mapSel || findSel) { mapSel = null; findSel = null; renderDesk(); }
    });

    showStart();

    // A small hook for smoke tests.
    window.__ashfield = {
      get state() { return state; }, makeApi, startNew, beginDay, renderAll, showEnding, endDay: endDayRequested,
      setFlag: (f) => { if (state.flags.indexOf(f) === -1) state.flags.push(f); },
      goToDay: (d) => { state.day = d; beginDay(); },
      pile: () => pileOpen(makeApi()).map((p) => p.id),
      place: (id, house) => place(byId(id), house),
      learn: (k) => learnClue(k, 'test'),
      content: C,
    };
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
