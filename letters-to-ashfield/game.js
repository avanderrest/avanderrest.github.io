/* Letters to Ashfield — the engine.
 *
 * Twelve days at the Oakhaven post office. Each day runs
 *   morning   — sort the pile into pigeonholes, weigh and stamp parcels, serve the counter;
 *   afternoon — go somewhere on a postal pretext and tidy what you're left alone with;
 *   evening   — the Knitting Ledger: drop collected words into Harriet's story until it tallies.
 * Night 11 brings the guilty party's sealed letter, and day 12 the Village Hall.
 *
 * All the words live in content.js (window.OAK) and all the drawing in art.js
 * (window.OAKART). This file only knows the shapes.
 */
(() => {
  'use strict';

  // ---------- constants ----------
  // v4: this game replaced the earlier Letters to Ashfield (whose saves were .save.v3) on
  // 2026-10-01, having been built as letters-to-ashfield-2; carry those keys across once.
  const SAVE_KEY = 'letters-to-ashfield-save-v4';
  const META_KEY = 'letters-to-ashfield-meta-v4';
  const SOUND_KEY = 'letters-to-ashfield-sound';
  [[SAVE_KEY, 'letters-to-ashfield-2-save-v1'], [META_KEY, 'letters-to-ashfield-2-meta-v1'], [SOUND_KEY, 'letters-to-ashfield-2-sound']].forEach(([now, was]) => {
    try {
      const old = localStorage.getItem(was);
      if (old !== null && localStorage.getItem(now) === null) localStorage.setItem(now, old);
      localStorage.removeItem(was);
    } catch (e) { /* private window */ }
  });
  const O = window.OAK;
  const A = window.OAKART;
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

  // ---------- small helpers ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
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
  function load(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
  }
  function store(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* private window */ } }

  // ---------- state ----------
  let S = null;
  let meta = load(META_KEY, { runs: 0, solved: [] });
  let soundOn = load(SOUND_KEY, true);
  const save = () => S && store(SAVE_KEY, S);
  const C = () => S.culprit;
  const W = (id) => (O.words[id] ? O.words[id][0] : id);

  function newGame() {
    const r = Math.random;
    // the first game is always one of the six villagers; after that, the postmistress too
    const pool = meta.runs > 0 ? O.SUSPECTS : O.SUSPECTS.filter((s) => s !== 'beatrice');
    S = {
      v: 1, day: 1, phase: 'intro', culprit: pool[Math.floor(r() * pool.length)], seed: Math.floor(r() * 1e9),
      words: { beatrice: 1, confirms: 1, denies: 1 }, fills: {}, solved: {}, evidence: {},
      unlocked: ['desk'], visited: [], pile: [], vis: { i: 0, asked: [], since: 0 }, holes: {},
      steam: null, sealPerfect: false, cups: TEACUPS, hall: null, ending: null,
    };
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
    if (!learnt.length) setTimeout(() => { toast('Into the ledger: ' + learnt.map(W).join(', '), 'word'); learnt = []; }, 60);
    learnt.push(...fresh);
    sfx('pen'); save();
  }
  let learnt = [];
  function gain(ev) {
    if (S.evidence[ev]) return;
    S.evidence[ev] = 1;
    toast('Into the case box: ' + O.evidenceInfo[ev].name, 'ev');
    save();
  }
  function toast(msg, kind) {
    const t = document.createElement('div');
    t.className = 'toast ' + (kind || '');
    t.textContent = msg;
    $('toasts').appendChild(t);
    while ($('toasts').childElementCount > 4) $('toasts').firstChild.remove();
    setTimeout(() => t.classList.add('out'), 2600);
    setTimeout(() => t.remove(), 3200);
  }

  // ---------- sound ----------
  let actx = null;
  function sfx(kind) {
    if (!soundOn) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const t = actx.currentTime;
      const tone = (f, d, type, vol, at) => {
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = type || 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t + (at || 0));
        g.gain.exponentialRampToValueAtTime(vol || 0.15, t + (at || 0) + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + (at || 0) + d);
        o.connect(g).connect(actx.destination); o.start(t + (at || 0)); o.stop(t + (at || 0) + d + 0.05);
      };
      const noise = (d, f, vol) => {
        const b = actx.createBuffer(1, actx.sampleRate * d, actx.sampleRate), ch = b.getChannelData(0);
        for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / ch.length);
        const s = actx.createBufferSource(), fl = actx.createBiquadFilter(), g = actx.createGain();
        s.buffer = b; fl.type = 'bandpass'; fl.frequency.value = f; g.gain.value = vol;
        s.connect(fl).connect(g).connect(actx.destination); s.start(t);
      };
      if (kind === 'paper') noise(0.18, 2400, 0.5);
      else if (kind === 'slot') { noise(0.08, 900, 0.6); tone(180, 0.12, 'triangle', 0.12); }
      else if (kind === 'stamp') { noise(0.06, 500, 1); tone(90, 0.15, 'square', 0.08); }
      else if (kind === 'ding') { tone(1568, 1.2, 'sine', 0.12); tone(2093, 0.9, 'sine', 0.05, 0.02); }
      else if (kind === 'good') { tone(523, 0.25, 'triangle', 0.1); tone(659, 0.25, 'triangle', 0.1, 0.1); tone(784, 0.4, 'triangle', 0.1, 0.2); }
      else if (kind === 'bad') tone(150, 0.25, 'sawtooth', 0.05);
      else if (kind === 'pen') noise(0.12, 4200, 0.25);
      else if (kind === 'click') tone(880, 0.06, 'square', 0.04);
      else if (kind === 'objection') { tone(392, 0.12, 'square', 0.08); tone(523, 0.3, 'square', 0.08, 0.1); }
    } catch (e) { /* no audio, no matter */ }
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
    if (S.day >= 12) { S.phase = 'hall'; S.hall = S.hall || { step: 'open' }; save(); render(); return; }
    S.phase = 'morning';
    S.pile = O.days[S.day].mail ? buildPile(S.day) : [];
    if (O.days[S.day].mail) S.carry = [];
    // the pile first, with the sign still on CLOSED; then the door, and the customers
    S.stage = O.days[S.day].mail ? 'sort' : 'counter';
    S.vis = { i: 0, asked: [], here: false, errand: null };
    save();
    render();
    if (S.stage === 'counter') setTimeout(arrive, 700);
  }
  function openCounter() {
    if (S.stage !== 'sort' || current()) return;
    S.stage = 'counter';
    S.holes = {};   // the round has taken it all
    sfx('ding');
    toast('The round goes out with the sorted post. You turn the sign to OPEN.');
    save(); render();
    setTimeout(arrive, 900);
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
    sfx('ding');
    save();
    renderCounter(); renderMat(); renderKit();
  }
  function visitorKey(v) { return v.who === '@culprit' ? C() : v.who; }
  function leave() {
    S.vis.here = false; S.vis.i++; S.vis.posting = []; S.vis.errand = null;
    save();
    renderCounter(); renderMat(); renderKit();
    if (todaysVisits()[S.vis.i]) setTimeout(arrive, 1100);
  }
  function itemSorted() { renderKit(); renderCounter(); }
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
    if (S.vis.paid && !posting()) { S.vis.errand.done = true; sfx('good'); }
    save();
    renderCounter(); renderMat(); renderKit();
  }
  const TRAY_NAME = Object.fromEntries(O.tray);
  // something from the tray: what they asked to buy, or a stamp for what they're posting
  function give(item) {
    if (!S.vis.here || !S.vis.errand || S.vis.errand.done) return;
    if (!S.vis.paid) {
      if (!S.vis.want.includes(item) || S.vis.given.includes(item)) { sfx('bad'); toast('That isn’t what they asked for.'); return; }
      S.vis.given.push(item);
      sfx('slot');
      if (S.vis.want.every((w) => S.vis.given.includes(w))) {
        S.vis.paid = true;
        errandStep(`You hand over the ${S.vis.given.map((g) => TRAY_NAME[g].toLowerCase()).join(' and the ')}, and they pay.`);
      } else { save(); renderCounter(); renderKit(); }
      return;
    }
    stampCounter(item);
  }

  function toAfternoon() {
    if (S.day === 11) { S.phase = 'dusk'; save(); render(); return; }
    S.phase = 'afternoon';
    save();
    render();
  }
  function placesOpen() {
    if (S.day === 1) return S.visited.includes('desk') ? [] : ['desk'];
    if (S.day === 2) return S.visited.includes('church') ? [] : ['church'];
    return O.placeOrder.filter((p) => S.unlocked.includes(p) && !S.visited.includes(p));
  }
  function toEvening() { S.phase = 'evening'; save(); render(); }
  function toBed() {
    const t = NIGHTS[S.day];
    S.phase = 'night'; save();
    const ov = $('ov-evening');
    ov.hidden = false;
    ov.className = 'overlay night';
    ov.innerHTML = `<div class="nightcard"><p>${esc(t)}</p><button class="btn" id="b-morning">Morning</button></div>`;
    $('b-morning').onclick = () => { S.day++; ov.hidden = true; startDay(); };
  }

  // ---------- rendering: the frame ----------
  function render() {
    renderTop();
    ['ov-start', 'ov-afternoon', 'ov-visit', 'ov-evening', 'ov-steam', 'ov-hall'].forEach((id) => { $(id).hidden = true; });
    if (!S || S.phase === 'intro') return renderStart();
    renderView(); renderCounter(); renderRack(); renderMat(); renderKit(); renderShelves();
    if (S.phase === 'afternoon') renderAfternoon();
    else if (S.phase === 'visit') renderVisit();
    else if (S.phase === 'evening') renderEvening();
    else if (S.phase === 'night') toBed();
    else if (S.phase === 'dusk') renderDusk();
    else if (S.phase === 'hall') renderHall();
    else if (S.phase === 'end') renderEnd();
  }
  // which of the two views the morning is on
  function renderView() {
    const atCounter = !(S && S.phase === 'morning' && S.stage === 'sort');
    $('track').classList.toggle('at-counter', atCounter);
    document.documentElement.style.setProperty('--topbar', document.querySelector('.topbar').offsetHeight + 'px');
  }
  window.addEventListener('resize', () => { if (S) renderView(); });
  function renderTop() {
    if (!S || S.phase === 'intro') { $('daybox').innerHTML = ''; return; }
    const ph = { morning: 'Morning', afternoon: 'Afternoon', visit: 'Afternoon', evening: 'Evening', night: 'Night', dusk: 'Dusk', hall: 'The Village Hall', end: '' }[S.phase] || '';
    $('daybox').innerHTML = `<span class="dnum">Day ${S.day}</span><span class="ddate">${esc(O.days[Math.min(12, S.day)].date)}</span><span class="dphase">${ph}</span>`;
    $('btn-sound').setAttribute('aria-pressed', soundOn ? 'true' : 'false');
    $('btn-sound').textContent = soundOn ? 'Sound on' : 'Sound off';
  }
  function renderShelves() {
    if ($('shelves').childElementCount) return;
    let s = '';
    const jar = (x, y, w, h, c) => `<rect x="${x}" y="${y - h}" width="${w}" height="${h}" rx="4" fill="${c}" stroke="#2b1a10" stroke-width="1.5"/><rect x="${x - 1}" y="${y - h - 5}" width="${w + 2}" height="6" fill="#b28a4a" stroke="#2b1a10" stroke-width="1.2"/>`;
    const box = (x, y, w, h, c) => `<rect x="${x}" y="${y - h}" width="${w}" height="${h}" fill="${c}" stroke="#2b1a10" stroke-width="1.5"/><path d="M${x + w / 2},${y - h} v${h} M${x},${y - h / 2} h${w}" stroke="#8a5a2a" stroke-width="1.5"/>`;
    [60, 130].forEach((y) => { s += `<rect x="0" y="${y}" width="600" height="8" fill="#4a2a18"/><rect x="0" y="${y + 8}" width="600" height="3" fill="#2a170c"/>`; });
    s += jar(260, 60, 22, 34, '#d8b26a') + jar(290, 60, 22, 40, '#a7c2b0') + jar(320, 60, 22, 30, '#e4c9a0') + jar(350, 60, 22, 38, '#c9a0a0');
    s += box(400, 60, 46, 30, '#c9a36a') + box(452, 60, 34, 22, '#b88f58') + `<rect x="500" y="20" width="70" height="40" fill="#efe6d0" stroke="#2b1a10" stroke-width="1.5"/><text x="535" y="45" text-anchor="middle" font-family="Special Elite" font-size="13" fill="#7a1f1f">POST</text>`;
    s += box(250, 130, 60, 40, '#c49a62') + box(316, 130, 40, 28, '#b28650') + `<circle cx="420" cy="100" r="22" fill="#f1e8d2" stroke="#6b4a2a" stroke-width="4"/><path d="M420,100 v-14 M420,100 l10,6" stroke="#2b1a10" stroke-width="2.5"/>`;
    s += `<g opacity="0.95">` + [0, 1, 2, 3, 4].map((i) => `<rect x="${470 + i * 22}" y="${130 - 50}" width="18" height="50" fill="${['#7a2e2e', '#2f4f6a', '#4d6a3a', '#7a5a2a', '#5a3a6a'][i]}" stroke="#2b1a10" stroke-width="1.2"/>`).join('') + `</g>`;
    $('shelves').innerHTML = s;
  }

  // ---------- the counter ----------
  function moodFor(key, asked) {
    if (key === C() && asked) return 'tense';
    if (S.day >= 9 && key === C()) return 'tense';
    return { jack: 'smile', edith: 'smile', gladys: 'smile', penry: 'worried', wren: 'worried' }[key] || 'calm';
  }
  function renderCounter() {
    const v = todaysVisits()[S.vis.i];
    const box = $('bubble'), vis = $('visitor');
    if (!S.vis.here || !v || S.phase !== 'morning') {
      vis.innerHTML = '';
      vis.className = 'visitor';
      box.hidden = false;
      box.className = 'bubble quiet';
      const left = S.phase !== 'morning' ? ''
        : S.stage === 'sort' ? (current() ? 'The sign on the door still says CLOSED. Sort the morning’s pile before the round goes out.' : 'The pile is sorted. Turn the sign to OPEN and the round can go.')
        : morningDone() ? (S.day === 11 ? 'That’s the last customer. Tomorrow is the Hall.' : 'That’s the last customer. Turn the sign to CLOSED and go out into the village.') : 'The bell over the door is quiet, for now.';
      box.innerHTML = left ? `<p class="narr">${esc(left)}</p>` : '';
      if (!left) box.hidden = true;
      return;
    }
    const key = visitorKey(v);
    const self = key === 'beatrice';
    const P = O.people[key];
    if (O.words[key]) learn([key]);
    vis.className = 'visitor in' + (self ? ' empty' : '');
    vis.onclick = () => { if (pickedSpecs) giveSpecs(); };
    vis.innerHTML = self ? '' : A.portrait(key, moodFor(key, S.vis.asked.length > 0));
    const hello = v.hello === '@nervous' ? O.nervousHello(C()) : v.hello;
    const obs = v.obs === '@nervous' ? (self ? '' : 'They keep glancing at Harriet’s old drawer behind you.') : v.obs;
    let h = self ? `<div class="nametag">Alone at the counter</div>` : `<div class="nametag">${esc(P.name)}<small>${esc(P.role)}</small></div>`;
    h += `<div class="lines">`;
    // first what they came in for; the talk comes after
    const e = errandOf(), er = S.vis.errand || { done: true };
    if (e && !self) {
      const ask = e.ask === '@culprit' ? 'One letter stamp, please. Just the one.' : e.ask;
      h += `<p>${show(ask)}</p>`;
      if (!er.done) {
        h += `</div><div class="choices">`;
        if (!S.vis.paid) h += `<span class="till">Hand them what they asked for, from the tray on the counter.${S.vis.given.length ? ' So far: ' + S.vis.given.map((g) => esc(TRAY_NAME[g].toLowerCase())).join(', ') + '.' : ''}</span>`;
        else {
          const p = posting();
          h += `<span class="till">${er.note ? esc(er.note) + ' ' : ''}${p.kind === 'letter' ? `“${esc(p.say)}” Stick on the stamp they asked for.` : p.weighed ? 'Weighed. Now a parcel stamp, from the tray.' : `They hand you a parcel to post — ${esc(p.what.toLowerCase())}. Put it on the scale.`}</span>`;
        }
        h += `</div>`;
        box.hidden = false; box.className = 'bubble'; box.innerHTML = h;
        return;
      }
      h += `<p class="narr">${esc(er.note)}</p>`;
    }
    h += self ? `<p class="narr">${show(hello)}</p>` : `<p>${show(hello)}</p>`;
    if (obs) h += `<p class="narr">${show(obs)}</p>`;
    S.vis.asked.forEach((ti) => {
      const out = [].concat(v.topics[ti][1](C())).filter(Boolean);
      h += `<p class="ask">— ${esc(v.topics[ti][0])}</p>` + out.map((t) => `<p${self ? ' class="narr"' : ''}>${show(t)}</p>`).join('');
    });
    h += `</div><div class="choices">`;
    v.topics.forEach((t, i) => { if (!S.vis.asked.includes(i)) h += `<button class="btn small" data-topic="${i}">${esc(t[0])}</button>`; });
    if (S.vis.asked.length === v.topics.length) h += `<button class="btn small primary" data-bye="1">${self ? 'Back to the pile' : 'Good day'}</button>`;
    h += `</div>`;
    box.hidden = false;
    box.className = 'bubble';
    box.innerHTML = h;
    const lines = box.querySelector('.lines');
    lines.scrollTop = lines.scrollHeight;
    box.querySelectorAll('[data-topic]').forEach((b) => b.onclick = () => { S.vis.asked.push(+b.dataset.topic); sfx('paper'); save(); renderCounter(); });
    const bye = box.querySelector('[data-bye]');
    if (bye) bye.onclick = leave;
  }

  // ---------- the rack ----------
  // The desk is the map: each letter goes on the house it is for.
  const HOLE_SPOT = { finch: 'farm', barnaby: 'swan', henderson: 'stores', okafor: 'surgery', penry: 'vicarage', ferrier: 'forge', marlow: 'teashop', manor: 'manor', office: 'post', out: 'out' };
  function renderRack() {
    const drops = O.holes.map((ho) => {
      const [x, y] = A.SPOTS[HOLE_SPOT[ho.id]];
      const n = S.holes[ho.id] || 0;
      return `<g class="drop" data-hole="${ho.id}" transform="translate(${x},${y})"><circle r="46" fill="#fff" opacity="0.001"/><circle class="ring" r="40" fill="none" stroke="#ffe7a0" stroke-width="4" stroke-dasharray="8 6"/>` +
        (n ? `<g class="stack" transform="translate(-30,-6)">${Array.from({ length: Math.min(n, 4) }, (_, i) => `<rect x="${i * 2}" y="${-i * 3}" width="22" height="15" fill="#f6ecd6" stroke="#3b2618" stroke-width="1.2" transform="rotate(${i * 5 - 6})"/>`).join('')}</g>` : '') + `</g>`;
    }).join('');
    $('mapcol').innerHTML = `<svg class="vmap deskmap${picked ? ' picking' : ''}" viewBox="0 0 1000 640" preserveAspectRatio="xMidYMid meet">${A.villageMap()}${drops}</svg>`;
    $('mapcol').querySelectorAll('[data-hole]').forEach((b) => b.onclick = () => { if (picked) dropOnHole(b.dataset.hole, b); });
    $('directory').innerHTML = `<b>Who lives where</b>` + O.holes.filter((x) => x.addr.length).map((x) => `<span>${esc(x.addr[0])}</span>`).join('') + `<span>Anywhere else — the sack for Nettleton</span>`;
  }

  // ---------- the mat ----------
  let picked = false;
  function envelope(it) {
    if (it.kind === 'drawer') {
      return `<div class="card drawer-card"><div class="drawer-front"><span class="knob"></span><span class="plate">LOST &amp; FOUND</span></div><p>Harriet’s Lost &amp; Found drawer is jammed with odds and ends. Somebody ought to put it in order.</p></div>`;
    }
    if (it.kind === 'parcel') {
      const st = it.stamped ? `<span class="pstamp ok${it.landing ? ' landing' : ''}">PARCEL POST</span>` : it.counter ? `<span class="pstamp empty">postage</span>` : '';
      return `<div class="card parcel${it.flipped ? ' back' : ''}"><div class="string"></div><div class="plabel"><div class="addr">${esc(it.addr)}</div><div class="what">${esc(it.what)}</div></div>` +
        `<div class="pm">${esc(it.from)}</div>${st}${it.weighed ? `<span class="wt">weighed</span>` : ''}` +
        `</div>`;
    }
    if (it.flipped) {
      const note = it.back ? show(it.back) : 'Nothing written on the back. A plain flap, a bit of gum.';
      return `<div class="card env back${it.wet ? ' wet' : ''}"><div class="flap"></div><div class="backnote">${note}</div></div>`;
    }
    const bare = it.counter && !it.stamped;
    const corner = bare ? `<div class="stamp-corner empty"><span>stamp</span></div>`
      : `<div class="stamp-corner${it.landing ? ' landing' : ''}" style="--sc:${STAMP_COL[Math.max(0, STAMPS.indexOf(it.paid || '2nd'))]}"><span>${esc(it.paid || '2nd')}</span></div>`;
    const date = it.sack ? 'UNSORTED' : (28 + S.day - 1 > 30 ? (S.day - 3) + ' DEC' : (27 + S.day) + ' NOV');
    return `<div class="card env${it.wet ? ' wet' : ''}">${corner}` +
      (bare ? '' : `<div class="postmark${it.counter ? ' red' : ''}${it.landing ? ' landing' : ''}"><span>${esc(it.from)}</span><span>${date}</span></div>`) +
      `<div class="addr">${esc(it.addr)}</div><div class="what">${esc(it.what)}</div></div>`;
  }
  function renderMat() {
    const it = current();
    const mat = S.stage === 'counter' ? $('cmat') : $('mat');
    (S.stage === 'counter' ? $('mat') : $('cmat')).innerHTML = '';
    if (S.phase !== 'morning') { mat.innerHTML = `<div class="matempty">${S.phase === 'hall' ? '' : 'The counter is closed.'}</div>`; return; }
    if (!O.days[S.day].mail) { mat.innerHTML = `<div class="matempty">No post on a Sunday.<br><small>Only callers.</small></div>`; return; }
    if (S.stage === 'counter') {
      const p = S.vis.here ? posting() : null;
      if (!p) { mat.innerHTML = `<div class="matempty">The round has gone out.<br><small>The sign says OPEN.</small></div>`; return; }
      mat.innerHTML = `<div class="pile"><div class="top${p.weighed ? ' onscale' : ''}" id="topcard">${envelope(p)}</div></div><div class="matbar">` +
        (!S.vis.paid ? `<span class="hint">Handed over the counter, with their money still to take.</span>`
          : p.kind === 'letter' ? `<span class="hint">${p.cls === '1st' ? 'First' : 'Second'} class, they said. The stamp’s on the tray.</span>`
          : p.weighed ? `<span class="hint">Weighed. Now a parcel stamp, from the tray.</span>`
            : `<button class="btn small" id="b-weigh">Onto the scale</button><span class="hint">Drag it onto the scale.</span>`) + `</div>`;
      if ($('b-weigh')) $('b-weigh').onclick = () => weigh(p);
      if (!p.weighed && S.vis.paid) dragSource($('topcard'), p);
      return;
    }
    if (!it) { mat.innerHTML = `<div class="matempty">The pile is sorted.<br><small>Turn the sign to OPEN.</small></div>`; return; }
    const left = S.pile.filter((x) => !x.done).length - 1;
    const slip = it.back ? `<div class="slip">${show(it.back)}</div>` : '';
    let h = `<div class="pile${slip ? ' withslip' : ''}">${left > 0 ? Array.from({ length: Math.min(left, 4) }, (_, i) => `<div class="under" style="--k:${i}"></div>`).join('') : ''}` +
      `<div class="top${picked ? ' picked' : ''}" id="topcard">${envelope(it)}</div>${slip}</div>`;
    h += `<div class="matbar">`;
    if (it.kind === 'drawer') h += `<button class="btn" id="b-drawer">Tidy the drawer</button>`;
    else {
      if (it.kind === 'parcel' && !it.weighed) h += `<button class="btn small" id="b-weigh">Onto the scale</button>`;
      h += `<span class="hint">${hintFor(it)}</span>`;
    }
    h += `<span class="count">${left > 0 ? left + ' more in the pile' : 'last one'}</span></div>`;
    mat.innerHTML = h;
    if (it.kind === 'drawer') { $('b-drawer').onclick = () => openVisit('drawer'); return; }
    if (it.back) noticed(it);
    if ($('b-weigh')) $('b-weigh').onclick = () => weigh(it);
    dragSource($('topcard'), it);
  }
  function hintFor(it) {
    if (it.kind === 'parcel' && !it.weighed) return 'Drag it onto the scale.';
    if (it.kind === 'parcel' && !it.stamped) return 'Pick the right stamp from the rate card.';
    if (it.sack) return 'Harriet’s last bag. These go out of the village.';
    return 'Drag it onto its house on the map — or tap it, then tap the house.';
  }
  // whatever there is to notice about a thing is lying on the mat beside it, as if it fell out
  function noticed(it) {
    if (it.seen) return;
    it.seen = true;
    if (it.wet) gain('ev_letter');
    if (it.opens && !S.unlocked.includes(it.opens)) { S.unlocked.push(it.opens); toast('A reason to go out this afternoon: ' + O.places[it.opens].name); }
    if (it.sender) learn([it.sender]);
    save();
  }

  // drag-and-drop with a pointer, or tap to pick up then tap a target
  function dragSource(node, it) {
    let start = null, ghost = null;
    node.onpointerdown = (e) => {
      if (e.button !== 0) return;
      start = { x: e.clientX, y: e.clientY };
      try { node.setPointerCapture(e.pointerId); } catch (err) { /* synthetic event */ }
    };
    node.onpointermove = (e) => {
      if (!start) return;
      if (!ghost && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) {
        ghost = node.cloneNode(true);
        ghost.className = 'ghost';
        const r = node.getBoundingClientRect();
        ghost.style.width = r.width + 'px';
        document.body.appendChild(ghost);
        node.classList.add('lifted');
      }
      if (ghost) {
        ghost.style.left = e.clientX + 'px'; ghost.style.top = e.clientY + 'px';
        document.querySelectorAll('.hover').forEach((n) => n.classList.remove('hover'));
        const t = targetAt(e.clientX, e.clientY);
        if (t) t.classList.add('hover');
      }
    };
    node.onpointerup = (e) => {
      if (!start) return;
      start = null;
      if (ghost) {
        ghost.remove(); ghost = null; node.classList.remove('lifted');
        document.querySelectorAll('.hover').forEach((n) => n.classList.remove('hover'));
        const t = targetAt(e.clientX, e.clientY);
        if (t && t.dataset.hole) { picked = true; dropOnHole(t.dataset.hole, t); }
        else if (t && t.id === 'scale') weigh(it);
      } else {
        picked = !picked;
        node.classList.toggle('picked', picked);
        if (picked) sfx('paper');
      }
    };
  }
  function targetAt(x, y) {
    const els = document.elementsFromPoint(x, y);
    for (const n of els) {
      const h = n.closest && (n.closest('[data-hole]') || n.closest('#scale'));
      if (h) return h;
    }
    return null;
  }
  function dropOnHole(hole, node) {
    const it = current();
    picked = false;
    if (!it || it.kind === 'drawer') return;
    if (it.kind === 'parcel' && (!it.weighed || !it.stamped)) {
      toast(it.weighed ? 'It wants its postage first.' : 'Parcels go on the scale first.'); sfx('bad'); renderMat(); return;
    }
    if (hole !== it.to) {
      sfx('bad');
      node.classList.remove('shake'); void node.offsetWidth; node.classList.add('shake');
      toast(it.to === 'out' ? 'This isn’t for anyone in Oakhaven.' : 'Not that one. Read the address again.');
      renderMat();
      return;
    }
    it.done = true;
    S.holes[hole] = (S.holes[hole] || 0) + 1;
    sfx('slot');
    node.classList.remove('took'); void node.offsetWidth; node.classList.add('took');
    save();
    renderRack(); renderMat(); renderKit();
    itemSorted();
    if (!current()) setTimeout(openCounter, 900);
    renderCounter();
  }

  // ---------- the scale and stamps ----------
  let scaleItem = null;
  function weigh(it) {
    if (!it || it.weighed) return;
    it.weighed = true; scaleItem = it;
    sfx('slot'); save();
    renderKit(); renderMat();
  }
  function lostBox() {
    if (S.day < 2 || S.phase !== 'morning') return '';
    const done = S.lostDone;
    return `<button class="lfbox${done ? ' done' : ''}" id="b-lf" title="The Lost &amp; Found box"><svg viewBox="0 0 120 70" aria-hidden="true">` +
      `<path d="M10,26 L60,14 L110,26 L60,38Z" fill="#d9b27a" stroke="#3b2618" stroke-width="2"/>` +
      `<path d="M10,26 L10,58 L60,68 L60,38Z" fill="#c49a62" stroke="#3b2618" stroke-width="2"/><path d="M110,26 L110,58 L60,68 L60,38Z" fill="#a97f4c" stroke="#3b2618" stroke-width="2"/>` +
      (done ? '' : `<rect x="38" y="12" width="20" height="14" rx="3" fill="#8a2f3a" stroke="#3b2618" stroke-width="1.5" transform="rotate(-12 48 19)"/><path d="M66,8 L70,30" stroke="#2a2a34" stroke-width="5"/><path d="M76,16 q8,-10 14,2 l-4,10Z" fill="#7a5638" stroke="#3b2618" stroke-width="1.5"/>`) +
      `<rect x="22" y="44" width="30" height="10" fill="#f6ecd6" stroke="#3b2618" stroke-width="1" transform="skewY(11)"/></svg>` +
      `<span>Lost &amp; Found${done ? ' · tidied' : ''}</span></button>`;
  }
  // something from the box goes back across the counter to whoever it belongs to
  let pickedSpecs = false;
  function giveSpecs() {
    const v = todaysVisits()[S.vis.i];
    pickedSpecs = false;
    if (!S.vis.here || !v) { toast('There’s nobody at the counter.'); renderKit(); return; }
    if (visitorKey(v) !== 'jack') { sfx('bad'); toast(`Those aren’t ${O.people[visitorKey(v)].short === 'you' ? 'yours' : 'theirs'}.`); renderKit(); return; }
    S.specs = 'returned';
    sfx('good');
    toast('“My specs! Bless you, Mrs P. Where were they?” — On the churchyard wall, you tell him. He goes rather quiet.');
    save(); renderKit();
  }
  function handOver(node) {
    let st = null, ghost = null;
    node.onpointerdown = (e) => { st = { x: e.clientX, y: e.clientY }; try { node.setPointerCapture(e.pointerId); } catch (err) { /* synthetic */ } };
    node.onpointermove = (e) => {
      if (!st) return;
      if (!ghost && Math.hypot(e.clientX - st.x, e.clientY - st.y) > 8) { ghost = node.cloneNode(true); ghost.className = 'ghost lostghost'; document.body.appendChild(ghost); }
      if (ghost) {
        ghost.style.left = e.clientX + 'px'; ghost.style.top = e.clientY + 'px';
        const over = document.elementsFromPoint(e.clientX, e.clientY).some((n) => n.id === 'visitor' || n.id === 'bubble');
        $('visitor').classList.toggle('hover', over);
      }
    };
    node.onpointerup = (e) => {
      if (!st) return;
      st = null;
      if (ghost) {
        ghost.remove(); ghost = null; $('visitor').classList.remove('hover');
        if (document.elementsFromPoint(e.clientX, e.clientY).some((n) => n.id === 'visitor' || n.id === 'bubble')) giveSpecs();
      } else { pickedSpecs = !pickedSpecs; node.classList.toggle('picked', pickedSpecs); }
    };
  }
  function renderKit() {
    const it = S.stage === 'counter' && S.vis.here ? posting() : null;
    const onScale = it && it.kind === 'parcel' && it.weighed && !it.stamped ? it : null;
    const oz = onScale ? onScale.oz : 0;
    // a square-root dial, so a one-ounce letter still moves the needle
    const ang = -70 + Math.sqrt(Math.min(oz, 128) / 128) * 140;
    let h = `<div id="scale" class="scale${onScale ? ' loaded' : ''}"><svg viewBox="0 0 220 170">` +
      `<rect x="30" y="140" width="160" height="22" rx="4" fill="#5a3a22" stroke="#2b1a10" stroke-width="2"/>` +
      `<rect x="102" y="70" width="16" height="72" fill="#c79a3e" stroke="#6b4a1a" stroke-width="2"/>` +
      `<circle cx="110" cy="76" r="46" fill="#f4ead2" stroke="#b08a3a" stroke-width="6"/>` +
      Array.from({ length: 9 }, (_, i) => { const a = (-70 + i * 17.5) * Math.PI / 180; return `<path d="M${110 + Math.sin(a) * 34},${76 - Math.cos(a) * 34} L${110 + Math.sin(a) * 40},${76 - Math.cos(a) * 40}" stroke="#6b4a1a" stroke-width="2"/>`; }).join('') +
      `<path d="M110,76 L110,40" stroke="#7a1f1f" stroke-width="3" stroke-linecap="round" style="transform-origin:110px 76px;transform:rotate(${ang}deg);transition:transform .8s cubic-bezier(.3,1.6,.5,1)"/>` +
      `<circle cx="110" cy="76" r="5" fill="#6b4a1a"/>` +
      `<path d="M40,26 L180,26" stroke="#b08a3a" stroke-width="5"/><ellipse cx="110" cy="22" rx="60" ry="9" fill="#d8b25a" stroke="#6b4a1a" stroke-width="2"/>` +
      (onScale ? (onScale.kind === 'parcel' ? `<rect x="80" y="2" width="60" height="18" rx="2" fill="#b98a5a" stroke="#2b1a10" stroke-width="1.5"/><path d="M110,2 v18 M80,11 h60" stroke="#7a5a2a" stroke-width="2"/>` : `<rect x="86" y="8" width="48" height="12" rx="1" fill="#f3e8cf" stroke="#2b1a10" stroke-width="1.5" transform="rotate(-4 110 14)"/>`) : '') +
      `</svg><div class="readout">${onScale ? 'Weighed' : 'Scale'}</div></div>`;
    const want = S.vis && S.vis.here && S.vis.errand && !S.vis.errand.done;
    h += `<div class="tray"><b>On the counter</b><div class="trayrow">${O.tray.map(([k, n]) => `<button class="give g-${k}${S.vis && (S.vis.given || []).includes(k) ? ' given' : ''}" data-give="${k}" ${want ? '' : 'disabled'} title="${esc(n)}">${trayArt(k)}<span>${esc(n)}</span></button>`).join('')}</div></div>`;
    const done = S.phase === 'morning' && morningDone();
    h += `<button class="btn primary lunch" id="b-close" ${done ? '' : 'disabled'}>Turn the sign to CLOSED</button>`;
    const specs = S.specs === 'held' && S.phase === 'morning'
      ? `<div class="lostitem${pickedSpecs ? ' picked' : ''}" id="specs" title="Jack Barnaby’s spectacles — give them to him">${A.lost('specs').replace('<g>', '<svg viewBox="-40 -26 80 30"><g>').replace(/<\/g>$/, '</g></svg>')}<span>Jack’s spectacles</span></div>` : '';
    $('kit').innerHTML = lostBox() + specs + h;
    if ($('b-lf')) $('b-lf').onclick = () => openVisit('drawer');
    if ($('specs')) handOver($('specs'));
    $('kit').querySelectorAll('[data-give]').forEach((b) => b.onclick = () => give(b.dataset.give));
    if ($('b-close')) $('b-close').onclick = () => { if (morningDone()) toAfternoon(); };
  }
  const STAMPS = ['1st', '2nd', 'parcel'];
  const STAMP_COL = ['#8a2a22', '#2f4f6e', '#7a5a2a'];
  function trayArt(k) {
    const stamp = (col, t) => `<svg viewBox="0 0 40 48"><rect x="2" y="2" width="36" height="44" fill="#fff" stroke="#c9b896" stroke-dasharray="3 2"/><rect x="6" y="6" width="28" height="36" fill="${col}"/><text x="20" y="30" text-anchor="middle" font-family="Special Elite" font-size="${t.length > 3 ? 8 : 12}" fill="#fff">${t}</text></svg>`;
    if (k === '1st') return stamp('#8a2a22', '1st');
    if (k === '2nd') return stamp('#2f4f6e', '2nd');
    if (k === 'parcel') return stamp('#7a5a2a', 'PARCEL');
    if (k === 'ink') return `<svg viewBox="0 0 40 48"><rect x="10" y="16" width="20" height="26" rx="3" fill="#1e2a4a" stroke="#2b1a10" stroke-width="2"/><rect x="15" y="8" width="10" height="9" fill="#2b1a10"/><rect x="12" y="24" width="16" height="9" fill="#efe2c2"/></svg>`;
    if (k === 'labels') return `<svg viewBox="0 0 40 48"><rect x="8" y="10" width="24" height="30" fill="#e8d6a0" stroke="#2b1a10" stroke-width="2"/><path d="M12,18 h16 M12,25 h16 M12,32 h16" stroke="#8a6a2a" stroke-width="2"/></svg>`;
    return `<svg viewBox="0 0 40 48"><ellipse cx="20" cy="26" rx="14" ry="13" fill="#c9a36a" stroke="#2b1a10" stroke-width="2"/><path d="M8,22 q12,6 24,0 M8,30 q12,6 24,0 M12,16 q8,4 16,0" stroke="#8a6a3a" stroke-width="1.6" fill="none"/></svg>`;
  }
  function stampIt(price) { if (S.stage === 'counter') stampCounter(price); }

  // a parcel handed over the counter: stamped now, sorted out with tomorrow's pile
  // what a customer hands in: weighed, stamped here, sorted with tomorrow's pile
  let landing = false;
  function stampCounter(price) {
    const p = posting();
    if (!p || !S.vis.paid || landing) return;
    if (!p.weighed) { toast('Weigh it first.'); return; }
    const right = p.kind === 'parcel' ? 'parcel' : p.cls;
    if (price !== right) { sfx('bad'); toast(p.kind === 'parcel' ? 'A parcel takes the parcel stamp.' : `They asked for ${p.cls === '1st' ? 'first' : 'second'} class.`); return; }
    p.paid = price;
    sfx('stamp');
    // let the stamp be seen landing before it goes in the box
    landing = true;
    const card = $('topcard');
    if (card) card.innerHTML = envelope(Object.assign({}, p, { stamped: true, landing: true }));
    setTimeout(() => {
      landing = false;
      p.stamped = true;
      handIn(Object.assign({}, p, { weighed: true, stamped: true }));
      if (!S.words.redink) { learn(['redink']); toast('Red ink from the postmark pad on your fingers. Harriet’s must have been the same.'); }
      errandStep(`You stick on the ${TRAY_NAME[price].toLowerCase()} and postmark it — into the box for tomorrow morning’s sort.`);
    }, 850);
  }

  // ---------- start ----------
  function renderStart() {
    const ov = $('ov-start');
    ov.hidden = false;
    const saved = load(SAVE_KEY, null);
    const cont = saved && saved.phase !== 'intro' && saved.phase !== 'end';
    ov.innerHTML = `<div class="titlecard"><p class="eyebrow">Oakhaven-under-Hill · November 1950</p><h2>Letters to Ashfield</h2>` +
      `<p class="sub">The Postmistress Who Noticed</p>` +
      `<p>Harriet Vale kept the Oakhaven post office for twenty-three years, and then she was found at the foot of the vestry steps. The doctor says she slipped. You are the new postmistress, and you have twelve days before the Inspector closes it for good.</p>` +
      `<p class="small">Sort the post. Tidy what you are left alone with. Knit it together in the ledger. Somebody in Oakhaven pushed her, and it is a different somebody every time.</p>` +
      `<div class="row">${cont ? `<button class="btn primary" id="b-cont">Continue — day ${saved.day}</button>` : ''}<button class="btn${cont ? '' : ' primary'}" id="b-new">${cont ? 'Begin again' : 'Take up the post'}</button></div>` +
      (meta.runs ? `<p class="small muted">Cases closed: ${meta.solved.length} of ${meta.runs}.</p>` : '') + `</div>`;
    if (cont) $('b-cont').onclick = () => { S = saved; if (!S.stage) S.stage = 'counter'; render(); if (S.phase === 'morning') setTimeout(arrive, 500); };
    $('b-new').onclick = () => { newGame(); renderIntro(); };
  }
  function renderIntro() {
    const ov = $('ov-start');
    ov.hidden = false;
    ov.innerHTML = `<div class="titlecard diary"><p class="eyebrow">From the front of your ledger</p>${O.intro.map((t) => `<p>${show(t)}</p>`).join('')}` +
      `<p class="hand">${show(O.prelude(C()))}</p><p class="hand sig">— B. Pym</p><div class="row"><button class="btn primary" id="b-go">Open the counter</button></div></div>`;
    $('b-go').onclick = () => { ov.hidden = true; startDay(); };
  }

  // ---------- the afternoon ----------
  // Where each errand is on the map. The post office ones are searches at home.
  const PLACE_SPOT = { desk: 'post', rooms: 'post', church: 'church', vestry: 'church', surgery: 'surgery', forge: 'forge', swan: 'swan', stores: 'stores', farm: 'farm', manor: 'manor' };
  const PIN_NUDGE = { vestry: [26, 18], rooms: [24, -14] };
  let AF = { sel: null, walking: false };
  const spotOf = (p) => {
    const [x, y] = A.SPOTS[PLACE_SPOT[p]];
    const n = PIN_NUDGE[p] || [0, 0];
    return [x + n[0], y + n[1]];
  };
  function mapSvg(open, id) {
    const pins = (open || []).map((p) => {
      const [x, y] = spotOf(p);
      return `<g class="pin${AF.sel === p ? ' on' : ''}" data-pin="${p}" transform="translate(${x},${y - 34})"><g class="bob"><path d="M0,26 L0,4" stroke="#3b2618" stroke-width="2"/>` +
        `<rect x="-16" y="-14" width="32" height="22" rx="2" fill="#f6ecd6" stroke="#3b2618" stroke-width="2"/><path d="M-16,-14 L0,0 L16,-14" fill="none" stroke="#3b2618" stroke-width="1.6"/>` +
        `<circle cx="0" cy="0" r="5" fill="#a8382c"/><rect x="-24" y="-22" width="48" height="52" fill="#fff" opacity="0.001"/></g></g>`;
    }).join('');
    const ticks = S.visited.filter((p) => PLACE_SPOT[p] && PLACE_SPOT[p] !== 'post').map((p) => {
      const [x, y] = spotOf(p);
      return `<g transform="translate(${x + 22},${y - 22})"><circle r="9" fill="#3e6a45" stroke="#f1e4c4" stroke-width="2"/><path d="M-4,0 l3,3 l5,-6" stroke="#fff" stroke-width="2.2" fill="none"/></g>`;
    }).join('');
    const door = A.ROUTES.post[0];
    return `<svg id="${id}" class="vmap" viewBox="0 0 1000 640">${A.villageMap()}${ticks}${pins}<g id="${id}-walker" transform="translate(${door[0]},${door[1]})">${A.walker()}</g></svg>`;
  }
  // You choose from the cards; the map shows where they are, and her walking there.
  function renderAfternoon() {
    const ov = $('ov-afternoon');
    ov.hidden = false;
    const open = placesOpen();
    if (!open.length) {
      ov.innerHTML = `<div class="sheet"><h2>The afternoon</h2><p>Nowhere you have any business going this afternoon. You do the accounts instead, and they come out right first time, which feels like a waste.</p><div class="row"><button class="btn primary" id="b-eve">Home for the evening</button></div></div>`;
      $('b-eve').onclick = toEvening;
      return;
    }
    AF.sel = null;
    ov.innerHTML = `<div class="mapview"><div class="maphead"><h2>Afternoon</h2>` +
      `<p class="muted">${open.length > 1 ? 'The post has given you reasons to call on people. You have time for one.' : 'Where today’s business takes you:'}</p></div>` +
      `<div class="mapwrap">${mapSvg(open, 'vmap')}</div><div class="places">` +
      open.map((p) => {
        const P = O.places[p];
        return `<button class="place" data-p="${p}"><span class="ph">${P.host ? A.portrait(P.host, 'calm') : '<span class="nohost">✉</span>'}</span><b>${esc(P.name)}</b><small>${esc(P.pretext)}</small></button>`;
      }).join('') + `</div></div>`;
    ov.querySelectorAll('.place[data-p]').forEach((b) => {
      b.onmouseenter = () => { const pin = ov.querySelector(`.pin[data-pin="${b.dataset.p}"]`); if (pin) pin.classList.add('on'); };
      b.onmouseleave = () => ov.querySelectorAll('.pin.on').forEach((n) => n.classList.remove('on'));
      b.onclick = () => {
        if (AF.walking) return;
        AF.sel = b.dataset.p;
        ov.querySelectorAll('.place').forEach((n) => { n.disabled = true; n.classList.toggle('on', n === b); });
        ov.querySelectorAll('.pin').forEach((n) => n.classList.toggle('on', n.dataset.pin === AF.sel));
        sfx('paper');
        $('vmap').scrollIntoView({ behavior: 'smooth', block: 'center' });
        setOff(AF.sel);
      };
    });
  }
  // she walks the lanes from the post office door, then the visit begins
  function setOff(p) {
    if (AF.walking) return;
    const route = A.ROUTES[PLACE_SPOT[p]] || A.ROUTES.post;
    const g = $('vmap-walker');
    if (route.length < 2 || !g || window.__oak.fast) { AF.sel = null; openVisit(p); return; }
    AF.walking = true;
    const segs = [];
    let total = 0;
    for (let i = 1; i < route.length; i++) { const d = Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]); segs.push(d); total += d; }
    const dur = Math.min(2600, 600 + total * 4);
    const t0 = performance.now();
    const step = (t) => {
      let k = Math.min(1, (t - t0) / dur) * total;
      let i = 0;
      while (i < segs.length - 1 && k > segs[i]) { k -= segs[i]; i++; }
      const f = Math.min(1, k / segs[i]);
      const x = route[i][0] + (route[i + 1][0] - route[i][0]) * f, y = route[i][1] + (route[i + 1][1] - route[i][1]) * f;
      const hop = Math.abs(Math.sin((t - t0) / 90)) * 3;
      g.setAttribute('transform', `translate(${x.toFixed(1)},${(y - hop).toFixed(1)}) scale(${route[i + 1][0] < route[i][0] ? -1 : 1},1)`);
      if (t - t0 < dur) requestAnimationFrame(step);
      else setTimeout(() => { AF.walking = false; AF.sel = null; openVisit(p); }, 350);
    };
    requestAnimationFrame(step);
  }
  // the map from the topbar: who lives where, and where today's business is
  function renderMapPanel() {
    const ov = $('ov-panel');
    ov.hidden = false;
    const open = S.phase === 'afternoon' ? [] : placesOpen();
    ov.innerHTML = `<div class="sheet mapsheet"><div class="lhead"><h2>Oakhaven-under-Hill</h2><button class="btn small" id="p-close">Close</button></div>` +
      `<div class="mapwrap">${mapSvg([], 'vmap2')}</div>` +
      `<p class="muted small">${open.length && S.phase === 'morning' ? 'This afternoon you have reason to call at: ' + open.map((p) => esc(O.places[p].name)).join(', ') + '.' : 'Ticks mark where you have already called.'}</p></div>`;
    $('p-close').onclick = () => { ov.hidden = true; };
  }

  // ---------- visits: the tidy puzzles ----------
  let V = null; // the visit in progress (not saved — a visit is replayed from the start after a reload)
  function openVisit(p) {
    if (p !== 'drawer') { S.phase = 'visit'; S.visiting = p; save(); }
    V = { place: p, solved: false, sel: null };
    renderVisit();
  }
  function renderVisit() {
    if (!V || (S.phase === 'visit' && V.place !== S.visiting)) V = { place: S.visiting, solved: false, sel: null };
    const p = V.place;
    const P = p === 'drawer' ? { name: 'The Lost & Found box', host: null, pretext: 'A cardboard box at the end of the desk: spectacles, a glove, a thimble, an umbrella, all jumbled. Put each back in its own compartment.', puzzle: { kind: 'sort', theme: 'drawer', hint: 'Each compartment still has the shape of what belongs in it.' } } : O.places[p];
    const ov = $('ov-visit');
    ov.hidden = false;
    if (P.host && O.words[P.host]) learn([P.host]);
    ov.innerHTML = `<div class="visit"><div class="vhead">${P.host ? `<span class="vph">${A.portrait(P.host, 'calm')}</span>` : ''}<div><h2>${esc(P.name)}</h2><p>${esc(P.pretext)}</p></div></div>` +
      `<div class="stage"><svg id="tidy" viewBox="0 0 800 440"></svg></div><p class="vhint" id="vhint">${esc(P.puzzle.hint)}</p><div class="finds" id="finds"></div></div>`;
    if (P.puzzle.kind === 'sort') setupSort(P.puzzle.theme);
    else if (P.puzzle.kind === 'outline') setupOutline();
    else if (P.puzzle.kind === 'unpack') setupUnpack();
    else setupChurch();
  }

  const DUST = ['stamps', 'bottles', 'tankards', 'churns', 'hatboxes', 'drawer'];
  const THEMES = {
    stamps: { base: 320, items: [70, 84, 98, 112, 126, 142].map((h, i) => ({ key: h, svg: A.stamp(h, ['#9a6a3a', '#7a4a2a', '#b07a48', '#8a5a34', '#a06a40', '#6b4226'][i]) })) },
    bottles: { base: 320, items: [[64, '#7a4a22', 'Aq.'], [90, '#2f5d7a', 'Syr.'], [112, '#3f6e45', 'Tinct.'], [134, '#6a2f5a', 'Gent. V.'], [154, '#7a4a22', 'Pot. Br.'], [176, '#2f5d7a', 'Ol. Ric.']].map(([h, c, l]) => ({ key: h, svg: A.bottle(h, c, l) })) },
    tankards: { base: 340, items: [0, 1, 2, 3, 4, 5].map((s) => ({ key: s, svg: A.tankard(s) })) },
    tins: { base: 320, items: [['#c0392b', 'PLUMS'], ['#d9822b', 'PEACHES'], ['#e5c13a', 'CUSTARD'], ['#4e8a4a', 'PEAS'], ['#3b6ea8', 'BLUEBELL'], ['#7a4f96', 'DAMSONS']].map(([c, l], i) => ({ key: i, svg: A.tin(c, l) })) },
    churns: { base: 300, items: [0, 1, 2, 3, 4].map((s) => ({ key: s, svg: A.churn(s) })) },
    registers: { base: 320, items: [1868, 1878, 1888, 1898, 1908, 1918].map((y, i) => ({ key: y, svg: A.book(150 + (i * 37) % 50, ['#5a2a22', '#2a3a5a', '#3a4a2a', '#4a2a4a', '#5a3a1a', '#2a2a2a'][i], y) })) },
    ledgers: { base: 320, items: [1900, 1910, 1920, 1930, 1940, 1950].map((y, i) => ({ key: y, svg: A.book(170 - (i * 23) % 40, ['#2f4a2f', '#6a2a22', '#2f4a2f', '#6a2a22', '#2f4a2f', '#6a2a22'][i], y) })) },
    hatboxes: { base: 320, items: [0, 1, 2, 3, 4].map((s) => ({ key: s, svg: A.hatbox(s, ['#c98a8a', '#8aa6c9', '#d9c38a', '#9ab58a', '#b89ac9'][s]) })) },
    drawer: { base: 300, items: ['thimble', 'matchbox', 'specs', 'glove', 'purse', 'brolly'].map((k, i) => ({ key: i, svg: A.lost(k) })) },
  };
  function svgPoint(svg, e) {
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }
  function setupSort(theme) {
    const T = THEMES[theme];
    const svg = $('tidy');
    const n = T.items.length;
    const xs = Array.from({ length: n }, (_, i) => 80 + (i + 0.5) * (640 / n));
    const r = rng(S.seed + theme.length * 31 + S.day);
    const dust = DUST.includes(theme);
    // where each thing really stands: a fixed muddle for dust marks, sorted for the rest
    const target = dust ? shuffle(rng(S.seed + theme.length * 97), T.items.map((_, i) => i)) : null;
    const solved = (ord) => dust ? ord.every((v, i) => v === target[i]) : isSorted(ord.map((i) => T.items[i].key));
    let order;
    do { order = shuffle(r, T.items.map((_, i) => i)); } while (solved(order) || order.filter((v, i) => (dust ? v === target[i] : v === i)).length > 1);
    V.order = order;
    const marks = dust ? `<g class="dust">${target.map((idx, slot) => `<g style="transform:translate(${xs[slot]}px,${T.base}px)">${T.items[idx].svg}</g>`).join('')}</g>` : '';
    svg.innerHTML = A.shelfScene(theme) + marks + `<g id="hidden"></g>` + order.map((idx, slot) => `<g class="ti" data-i="${idx}" style="transform:translate(${xs[slot]}px,${T.base}px)">${T.items[idx].svg}</g>`).join('');
    const place = () => {
      V.order.forEach((idx, slot) => {
        const g = svg.querySelector(`.ti[data-i="${idx}"]`);
        g.style.transform = `translate(${xs[slot]}px,${T.base}px)`;
        g.classList.toggle('sel', V.sel === idx);
      });
    };
    const swap = (a, b) => {
      const ia = V.order.indexOf(a), ib = V.order.indexOf(b);
      [V.order[ia], V.order[ib]] = [V.order[ib], V.order[ia]];
      sfx('click');
      V.sel = null;
      place();
      svg.querySelectorAll('.ti').forEach((g) => g.classList.toggle('home', dust && target[V.order.indexOf(+g.dataset.i)] === +g.dataset.i));
      if (solved(V.order)) setTimeout(solvedSort, 450);
    };
    svg.querySelectorAll('.ti').forEach((g) => {
      let st = null;
      g.onpointerdown = (e) => {
        if (V.solved) return;
        st = { x: svgPoint(svg, e).x, moved: false };
        try { g.setPointerCapture(e.pointerId); } catch (err) { /* synthetic event */ }
        g.classList.add('drag');
      };
      g.onpointermove = (e) => {
        if (!st) return;
        const x = svgPoint(svg, e).x;
        if (Math.abs(x - st.x) > 6) st.moved = true;
        if (st.moved) g.style.transform = `translate(${x}px,${T.base - 14}px)`;
      };
      g.onpointerup = (e) => {
        if (!st) return;
        g.classList.remove('drag');
        const idx = +g.dataset.i;
        if (st.moved) {
          const x = svgPoint(svg, e).x;
          let best = 0;
          xs.forEach((sx, i) => { if (Math.abs(sx - x) < Math.abs(xs[best] - x)) best = i; });
          const other = V.order[best];
          if (other !== idx) swap(idx, other); else place();
        } else if (V.sel === null) { V.sel = idx; place(); sfx('click'); }
        else if (V.sel === idx) { V.sel = null; place(); }
        else swap(V.sel, idx);
        st = null;
      };
    });
  }
  function isSorted(keys) {
    const up = keys.every((k, i) => i === 0 || keys[i - 1] < k);
    const down = keys.every((k, i) => i === 0 || keys[i - 1] > k);
    return up || down;
  }
  function solvedSort() {
    if (V.solved) return;
    V.solved = true;
    sfx('good');
    $('tidy').classList.add('done');
    $('vhint').textContent = 'There. That’s better. And now that it’s straight, something else isn’t…';
    setTimeout(findings, 700);
  }

  function setupOutline() {
    const svg = $('tidy');
    const kinds = Object.keys(A.TOOLS);
    const spots = { hammer: [110, 150], saw: [290, 150], chisel: [460, 150], pliers: [580, 150], spanner: [700, 150] };
    const r = rng(S.seed + 77);
    const tray = shuffle(r, kinds).map((k, i) => [k, 110 + i * 145, 375]);
    V.placed = {};
    svg.innerHTML = A.pegboard() + kinds.map((k) => `<g class="outline" data-o="${k}" style="transform:translate(${spots[k][0]}px,${spots[k][1]}px)">${A.toolOutline(k)}<rect x="-60" y="-60" width="120" height="120" fill="#fff" opacity="0.001"/></g>`).join('') +
      tray.map(([k, x, y]) => `<g class="ti tool" data-k="${k}" data-x="${x}" data-y="${y}" style="transform:translate(${x}px,${y}px) rotate(90deg) scale(.8)">${A.tool(k)}</g>`).join('');
    const home = (g) => { g.style.transform = `translate(${g.dataset.x}px,${g.dataset.y}px) rotate(90deg) scale(.8)`; };
    const tryPlace = (g, k, target) => {
      if (target !== k) { sfx('bad'); home(g); toast('That one doesn’t fit there.'); return; }
      V.placed[k] = true;
      g.classList.add('placed');
      g.style.transform = `translate(${spots[k][0]}px,${spots[k][1]}px)`;
      sfx('click');
      if (Object.keys(V.placed).length === kinds.length) setTimeout(solvedSort, 450);
    };
    svg.querySelectorAll('.tool').forEach((g) => {
      let st = null;
      const k = g.dataset.k;
      g.onpointerdown = (e) => { if (V.placed[k]) return; st = { moved: false, p: svgPoint(svg, e) }; try { g.setPointerCapture(e.pointerId); } catch (err) { /* synthetic */ } g.classList.add('drag'); };
      g.onpointermove = (e) => {
        if (!st) return;
        const p = svgPoint(svg, e);
        if (Math.hypot(p.x - st.p.x, p.y - st.p.y) > 6) st.moved = true;
        if (st.moved) g.style.transform = `translate(${p.x}px,${p.y}px)`;
      };
      g.onpointerup = (e) => {
        if (!st) return;
        g.classList.remove('drag');
        if (st.moved) {
          const p = svgPoint(svg, e);
          let best = null, bd = 90;
          kinds.forEach((o) => { const d = Math.hypot(spots[o][0] - p.x, spots[o][1] - p.y); if (d < bd) { bd = d; best = o; } });
          if (best) tryPlace(g, k, best); else home(g);
        } else {
          V.sel = V.sel === k ? null : k;
          svg.querySelectorAll('.tool').forEach((t) => t.classList.toggle('sel', t.dataset.k === V.sel));
          sfx('click');
        }
        st = null;
      };
    });
    svg.querySelectorAll('.outline').forEach((o) => o.onclick = () => {
      if (!V.sel) return;
      const g = svg.querySelector(`.tool[data-k="${V.sel}"]`);
      g.classList.remove('sel');
      tryPlace(g, V.sel, o.dataset.o);
      V.sel = null;
    });
  }

  // your rooms: everything on the bed goes into the wardrobe, the drawers or onto the shelf
  function setupUnpack() {
    const svg = $('tidy');
    const spots = A.ROOM_SPOTS;
    V.stowed = {};
    const draw = () => {
      const done = Object.keys(V.stowed).length === A.ROOM_ITEMS.length;
      svg.innerHTML = A.bedroom() + ['smalls', 'woollens', 'linen'].map((k) => A.drawer(k, done && k === 'linen' && !V.found)).join('') +
        Object.keys(spots).filter((k) => !['smalls', 'woollens', 'linen'].includes(k)).map((k) => `<rect class="cont" data-c="${k}" x="${spots[k].x}" y="${spots[k].y}" width="${spots[k].w}" height="${spots[k].h}" fill="#fff" opacity="0.001"/>`).join('') +
        A.ROOM_ITEMS.filter((it) => !V.stowed[it.id]).map((it) => `<g class="ti room" data-k="${it.id}" style="transform:translate(${it.x}px,${it.y}px)"><rect x="-40" y="-30" width="80" height="56" fill="#fff" opacity="0.001"/>${it.svg}</g>`).join('');
      bind();
    };
    const into = (k, c) => {
      const it = A.ROOM_ITEMS.find((x) => x.id === k);
      if (!spots[c] || !spots[c].takes.includes(it.cat)) {
        sfx('bad'); toast('That doesn’t go there.'); draw(); return;
      }
      V.stowed[k] = c; V.sel = null;
      sfx('slot');
      draw();
      const g = svg.querySelector(`.drawer[data-c="${c}"]`);
      if (g) { g.classList.add('opening'); setTimeout(() => g.classList.remove('opening'), 400); }
      if (Object.keys(V.stowed).length === A.ROOM_ITEMS.length) setTimeout(() => { V.solved = true; sfx('good'); findings(); }, 450);
    };
    const contAt = (p) => Object.keys(spots).find((k) => { const d = spots[k]; return p.x >= d.x && p.x <= d.x + d.w && p.y >= d.y - 30 && p.y <= d.y + d.h; });
    function bind() {
      svg.querySelectorAll('.room').forEach((g) => {
        let st = null;
        const k = g.dataset.k;
        g.onpointerdown = (e) => { st = { moved: false, p: svgPoint(svg, e) }; try { g.setPointerCapture(e.pointerId); } catch (err) { /* synthetic */ } g.classList.add('drag'); };
        g.onpointermove = (e) => {
          if (!st) return;
          const p = svgPoint(svg, e);
          if (Math.hypot(p.x - st.p.x, p.y - st.p.y) > 6) st.moved = true;
          if (st.moved) g.style.transform = `translate(${p.x}px,${p.y}px) scale(1.08)`;
        };
        g.onpointerup = (e) => {
          if (!st) return;
          g.classList.remove('drag');
          if (st.moved) { const c = contAt(svgPoint(svg, e)); if (c) into(k, c); else draw(); }
          else { V.sel = V.sel === k ? null : k; svg.querySelectorAll('.room').forEach((n) => n.classList.toggle('sel', n.dataset.k === V.sel)); sfx('click'); }
          st = null;
        };
      });
      svg.querySelectorAll('.cont, .drawer').forEach((n) => n.onclick = () => {
        if (n.classList.contains('ajar')) { V.found = true; draw(); sfx('paper'); $('finds').querySelector('.notes').insertAdjacentHTML('beforeend', `<li>${show(O.drawerNote(C()))}</li>`); return; }
        if (V.sel) into(V.sel, n.dataset.c);
      });
    }
    draw();
  }

  function setupChurch() {
    const svg = $('tidy');
    const bits = O.churchyard(C());
    V.straight = {};
    svg.innerHTML = A.churchyard() + bits.map((b) => {
      const B = A.CHURCH_BITS[b.id];
      return `<g class="bit" data-b="${b.id}" style="transform:translate(${B.x}px,${B.y}px)"><rect x="-60" y="-80" width="120" height="110" fill="#fff" opacity="0.001"/>${B.svg}<circle class="glint" cx="0" cy="-30" r="34" fill="none" stroke="#ffe7a0" stroke-width="3"/></g>`;
    }).join('');
    $('finds').innerHTML = `<ul class="notes" id="cnotes"></ul>`;
    svg.querySelectorAll('.bit').forEach((g) => g.onclick = () => {
      const id = g.dataset.b;
      if (V.straight[id]) return;
      V.straight[id] = true;
      g.classList.add('fixed');
      sfx('click');
      const b = bits.find((x) => x.id === id);
      $('cnotes').insertAdjacentHTML('beforeend', `<li><b>${esc(b.label)}.</b> ${show(b.text)}</li>`);
      if (id === 'rail') gain('ev_rail');
      if (id === 'mat') gain('ev_scrapes');
      if (id === 'notice') gain('ev_notice');
      if (Object.keys(V.straight).length === bits.length) {
        V.solved = true; sfx('good');
        $('vhint').textContent = 'You have seen what there is to see. Harriet did not slip.';
        $('finds').insertAdjacentHTML('beforeend', `<div class="row"><button class="btn primary" id="b-home">Walk home</button></div>`);
        $('b-home').onclick = finishVisit;
      }
    });
  }

  function findings() {
    const p = V.place;
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
    $('finds').innerHTML = `<ul class="notes">${lines.map((t) => `<li>${show(t)}</li>`).join('')}</ul><div class="row"><button class="btn primary" id="b-home">${p === 'drawer' ? 'Back to the counter' : 'Walk home'}</button></div>`;
    $('b-home').onclick = finishVisit;
    $('finds').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  function finishVisit() {
    if (!V) return;
    const p = V.place;
    V = null;
    $('ov-visit').hidden = true;
    $('ov-visit').innerHTML = '';
    if (p === 'drawer') {
      S.lostDone = true;
      save(); renderKit();
      return;
    }
    if (!S.visited.includes(p)) S.visited.push(p);
    S.visiting = null;
    toEvening();
  }

  // ---------- evening ----------
  function renderEvening() {
    const ov = $('ov-evening');
    ov.hidden = false;
    ov.className = 'overlay evening';
    const pages = O.ledger(C()).filter((p) => p.day <= S.day);
    const open = pages.filter((p) => !S.solved[p.id]);
    ov.innerHTML = `<div class="fireside"><div class="fire" aria-hidden="true"><span></span><span></span><span></span></div><h2>Evening, by the fire</h2>` +
      `<p>A cup of tea, the wireless low, and Harriet’s story in your knitting ledger.</p>` +
      `<p class="muted">${open.length ? `${open.length} page${open.length > 1 ? 's' : ''} still to tally: ${open.map((p) => esc(p.title)).join(', ')}.` : 'Every page so far tallies.'}</p>` +
      `<div class="row"><button class="btn primary" id="b-led">Open the ledger</button><button class="btn" id="b-bed">${S.day === 11 ? 'To bed — the Hall is tomorrow' : 'Go to bed'}</button></div></div>`;
    $('b-led').onclick = openLedger;
    $('b-bed').onclick = toBed;
  }

  // ---------- the knitting ledger ----------
  let LS = { page: null, blank: null };
  function openLedger() {
    if (!S || S.phase === 'intro') return;
    const pages = O.ledger(C()).filter((p) => p.day <= S.day);
    if (!LS.page || !pages.find((p) => p.id === LS.page)) LS.page = (pages.find((p) => !S.solved[p.id]) || pages[0]).id;
    renderLedger();
  }
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
      sfx('good');
      if (pg.id === 'alibis') gain('ev_alibi');
      if (pg.id === 'motive') gain('ev_motive');
      save();
    }
    return w;
  }
  function renderLedger() {
    const ov = $('ov-ledger');
    ov.hidden = false;
    const pages = O.ledger(C()).filter((p) => p.day <= S.day);
    const pg = pages.find((p) => p.id === LS.page);
    const f = S.fills[pg.id] = S.fills[pg.id] || {};
    const w = checkPage(pg);
    const solved = !!S.solved[pg.id];
    let h = `<div class="ledger"><div class="lhead"><h2>The Knitting Ledger</h2><button class="btn small" id="l-close">Close</button></div>` +
      `<nav class="ltabs">${pages.map((p) => `<button class="ltab${p.id === pg.id ? ' on' : ''}${S.solved[p.id] ? ' ok' : ''}" data-pg="${p.id}">${esc(p.title)}</button>`).join('')}</nav>` +
      `<div class="lpage${solved ? ' solved' : ''}"><h3>${esc(pg.title)}</h3>`;
    pg.lines.forEach((ln) => {
      h += `<p class="lline">` + esc(ln.text).replace(/\{([a-z0-9_]+)\}/g, (_, b) => {
        const v = f[b];
        return `<button class="blank${v ? ' filled' : ''}${LS.blank === b ? ' sel' : ''}" data-b="${b}" ${solved ? 'disabled' : ''}>${v ? esc(W(v)) : '&nbsp;'}</button>`;
      }) + `</p>`;
    });
    const status = solved ? '<span class="tally">It tallies.</span>' : w === null ? 'Fill every gap, and the ledger will tell you if it tallies.' : w <= 2 ? `<b>Nearly.</b> Two or fewer stitches are dropped.` : 'It doesn’t tally yet.';
    h += `<p class="lstatus">${status}</p></div>`;
    // the word bank
    h += `<div class="bank"><p class="muted small">${LS.blank ? 'Pick a word for the selected gap.' : 'Tap a gap, then a word — or drag a word into a gap.'}</p>`;
    O.CATS.forEach(([cat, label]) => {
      const ids = Object.keys(S.words).filter((id) => O.words[id] && O.words[id][1] === cat);
      if (!ids.length) return;
      h += `<div class="bcat"><b>${label}</b>${ids.map((id) => `<button class="chip c-${cat}" data-w="${id}">${esc(W(id))}</button>`).join('')}</div>`;
    });
    h += `</div></div>`;
    ov.innerHTML = h;
    $('l-close').onclick = () => { ov.hidden = true; LS.blank = null; if (S.phase === 'evening') renderEvening(); if (S.phase === 'hall') renderHall(); };
    ov.querySelectorAll('[data-pg]').forEach((b) => b.onclick = () => { LS.page = b.dataset.pg; LS.blank = null; sfx('paper'); renderLedger(); });
    ov.querySelectorAll('.blank').forEach((b) => b.onclick = () => {
      const id = b.dataset.b;
      if (LS.blank === id && f[id]) { delete f[id]; LS.blank = null; save(); }
      else LS.blank = LS.blank === id ? null : id;
      renderLedger();
    });
    ov.querySelectorAll('.chip').forEach((c) => {
      c.onclick = () => {
        if (c.dataset.dragged) { delete c.dataset.dragged; return; }
        if (solved) return;
        let target = LS.blank;
        if (!target) target = blanksOf(pg).map((b) => b.id).find((b) => !f[b]);
        if (!target) return;
        f[target] = c.dataset.w;
        sfx('pen');
        LS.blank = null;
        save();
        renderLedger();
      };
      chipDrag(c, pg, f, solved);
    });
  }
  function chipDrag(c, pg, f, solved) {
    let st = null, ghost = null;
    c.onpointerdown = (e) => {
      if (solved) return;
      st = { x: e.clientX, y: e.clientY };
      try { c.setPointerCapture(e.pointerId); } catch (err) { /* synthetic event */ }
    };
    c.onpointermove = (e) => {
      if (!st) return;
      if (!ghost && Math.hypot(e.clientX - st.x, e.clientY - st.y) > 8) {
        ghost = c.cloneNode(true); ghost.className += ' ghost'; document.body.appendChild(ghost);
      }
      if (ghost) { ghost.style.left = e.clientX + 'px'; ghost.style.top = e.clientY + 'px'; }
    };
    c.onpointerup = (e) => {
      if (!st) return;
      st = null;
      if (!ghost) return;
      ghost.remove(); ghost = null;
      c.dataset.dragged = '1';   // the click that follows a drag is not a tap
      const t = document.elementsFromPoint(e.clientX, e.clientY).find((n) => n.classList && n.classList.contains('blank'));
      if (t) { f[t.dataset.b] = c.dataset.w; sfx('pen'); save(); }
      setTimeout(renderLedger, 0);
      e.stopPropagation();
    };
  }

  // ---------- the case box ----------
  function renderCase() {
    const ov = $('ov-panel');
    ov.hidden = false;
    const ids = Object.keys(S.evidence);
    ov.innerHTML = `<div class="sheet"><div class="lhead"><h2>The case box</h2><button class="btn small" id="p-close">Close</button></div>` +
      (ids.length ? `<div class="evlist">${ids.map((id) => evCard(id)).join('')}</div>` : '<p>Nothing in it yet but a pencil and Harriet’s spare spectacles.</p>') + `</div>`;
    $('p-close').onclick = () => { ov.hidden = true; };
  }
  function evUsable(id) { const need = O.evidenceInfo[id].need; return !need || S.solved[need]; }
  function evCard(id, btn) {
    const E = O.evidenceInfo[id];
    const ok = evUsable(id);
    const pageTitle = E.need ? (O.ledger(C()).find((p) => p.id === E.need) || {}).title : '';
    return `<div class="ev${ok ? '' : ' faint'}"${btn ? ` data-ev="${id}"` : ''}><b>${esc(E.name)}</b><p>${ok ? esc(E.desc(C()).replace(/\[\[[a-z0-9_]+\|([^\]]+)\]\]/g, '$1')) : `You have it, but you can’t say what it means until ledger page “${esc(pageTitle)}” tallies.`}</p></div>`;
  }

  // ---------- night 11 ----------
  let ST = null;
  function renderDusk() {
    const ov = $('ov-steam');
    ov.hidden = false;
    const c = C();
    const who = c === 'beatrice' ? 'Nobody posts it.' : `At dusk, through the shop window, you see ${O.people[c].name} cross the road, look both ways, and push a thick envelope into the box by your door.`;
    if (!S.steam) {
      ov.innerHTML = `<div class="sheet steam"><h2>Dusk, the eleventh day</h2><p>${esc(who)}</p>` +
        (c === 'beatrice' ? `<p>Clearing the last of Harriet’s drawer, you find a letter wedged at the back. It was posted on the 26th and never delivered. It is addressed to you.</p>` : '') +
        `<div class="sealed"><div class="card env big"><div class="seal"></div><div class="addr">${esc(O.sealedTo[c])}</div><div class="what">Heavy. Sealed with wax as well as gum.</div></div></div>` +
        `<p>The post is sacred. Harriet kept that rule for twenty-three years. But tomorrow is the Hall.</p>` +
        `<div class="row"><button class="btn" id="b-leave">Leave the seal intact</button><button class="btn primary" id="b-steam">Steam it open</button></div></div>`;
      $('b-leave').onclick = () => { S.steam = 'left'; save(); toast('You put it in the outgoing sack, seal unbroken.'); toEvening(); };
      $('b-steam').onclick = () => { S.steam = 'steaming'; save(); renderDusk(); };
      return;
    }
    if (S.steam === 'steaming') return steamGame(ov);
    if (S.steam === 'opened') return resealGame(ov);
  }
  function steamGame(ov) {
    ov.innerHTML = `<div class="sheet steam"><h2>Over the kettle</h2><p>Hold the flap in the steam. Too little and the gum won’t give; too much and the ink runs and anyone will see.</p>` +
      `<div class="steamwrap"><div id="kettle"></div><div class="gauge"><div class="band"></div><div class="lvl" id="lvl"></div></div><div class="gauge prog"><div class="lvl" id="prog"></div></div></div>` +
      `<div class="row"><button class="btn primary hold" id="b-hold">Hold it over the spout</button></div><p class="muted small" id="steamnote">Keep the needle in the green.</p></div>`;
    ST = { lvl: 0, prog: 0, hot: 0, holding: false, last: performance.now() };
    const hold = $('b-hold');
    const on = (e) => { e.preventDefault(); ST.holding = true; }, off = () => { ST.holding = false; };
    hold.onpointerdown = on; hold.onpointerup = off; hold.onpointerleave = off;
    const key = (e) => { if (e.code === 'Space') { ST.holding = e.type === 'keydown'; e.preventDefault(); } };
    window.addEventListener('keydown', key); window.addEventListener('keyup', key);
    const tick = (t) => {
      if (!ST || S.steam !== 'steaming') { window.removeEventListener('keydown', key); window.removeEventListener('keyup', key); return; }
      const dt = Math.min(0.05, (t - ST.last) / 1000); ST.last = t;
      ST.lvl = Math.max(0, Math.min(1, ST.lvl + (ST.holding ? 0.55 : -0.42) * dt));
      const green = ST.lvl >= 0.45 && ST.lvl <= 0.72;
      if (green) ST.prog = Math.min(1, ST.prog + dt / 4.5);
      ST.hot = ST.lvl > 0.86 ? ST.hot + dt : Math.max(0, ST.hot - dt);
      $('lvl').style.height = (ST.lvl * 100) + '%';
      $('lvl').className = 'lvl' + (green ? ' g' : ST.lvl > 0.72 ? ' r' : '');
      $('prog').style.height = (ST.prog * 100) + '%';
      $('kettle').innerHTML = A.kettle(ST.lvl);
      $('steamnote').textContent = ST.hot > 0.3 ? 'Too hot! The ink is starting to bloom.' : green ? 'That’s it… the gum is softening.' : ST.lvl > 0.72 ? 'Too much steam.' : 'Keep the needle in the green.';
      if (ST.hot > 0.9) { S.steam = 'ruined'; ST = null; save(); sfx('bad'); return ruined(ov); }
      if (ST.prog >= 1) { S.steam = 'opened'; ST = null; save(); sfx('good'); gain('ev_steamed'); learn([O.people[C()].motive, O.people[C()].container, 'keyring']); return renderDusk(); }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  function ruined(ov) {
    ov.innerHTML = `<div class="sheet steam"><h2>The ink has run</h2><p>The address blooms into a blue cloud, and the flap tears as you lift it. Inside, the letter is a wet pulp you can’t read a line of. You dry it on the range and send it on, and anyone who looks at it will know.</p><div class="row"><button class="btn primary" id="b-ok">Evening</button></div></div>`;
    $('b-ok').onclick = toEvening;
  }
  function resealGame(ov) {
    const c = C();
    const ang0 = (S.seed % 2 ? 1 : -1) * (12 + (S.seed % 9));
    ov.innerHTML = `<div class="sheet steam"><h2>${c === 'beatrice' ? 'Harriet’s letter to you' : 'The letter inside'}</h2><div class="confession hand">${esc(O.confession[c])}</div>` +
      `<p>Now put it back as it was. Line the flap up with its old crease, within a hair, and press.</p>` +
      `<div class="reseal"><div class="card env big flapwrap"><div class="flap2" id="flap2"></div><div class="crease"></div></div>` +
      `<input type="range" min="-30" max="30" step="0.5" value="${ang0}" id="rs" aria-label="Flap angle"><span id="rsv"></span></div>` +
      `<div class="row"><button class="btn primary" id="b-press">Press it flat</button></div></div>`;
    const upd = () => { const v = +$('rs').value; $('flap2').style.transform = `rotate(${v}deg)`; $('rsv').textContent = `${Math.abs(v).toFixed(1)}° off`; };
    $('rs').oninput = upd; upd();
    $('b-press').onclick = () => {
      S.sealPerfect = Math.abs(+$('rs').value) <= 2;
      save(); sfx(S.sealPerfect ? 'stamp' : 'bad');
      toast(S.sealPerfect ? 'Not a crease out of place. Nobody will ever know.' : 'There’s a second crease. Someone careful would notice.');
      S.steam = 'resealed'; save(); toEvening();
    };
  }

  // ---------- the Village Hall ----------
  const ATTEND = ['arthur', 'jack', 'gladys', 'sam', 'penry', 'tom', 'edith', 'marion'];
  function renderHall() {
    const ov = $('ov-hall');
    ov.hidden = false;
    const H = S.hall;
    let speaker = 'gale', mood = 'calm', said = '', body = '';
    const cups = `<div class="cups" title="Your composure">${Array.from({ length: TEACUPS }, (_, i) => `<span class="cup${i < S.cups ? '' : ' gone'}">☕</span>`).join('')}</div>`;
    if (H.step === 'open') {
      said = 'Ladies and gentlemen — thank you, Mrs Tebbutt, the cake is excellent. I have reviewed the doctor’s certificate and the constable’s notes, and I am satisfied that Mrs Vale’s death on the 26th of November was a tragic accident. Unless anybody has anything to add, I shall close the matter today.';
      body = `<div class="row"><button class="btn primary" id="h-speak">“Pardon me, dear, but that simply doesn’t tally…”</button><button class="btn" id="h-quiet">Say nothing, and pour the tea</button></div>`;
    } else if (H.step === 'fall') {
      said = 'Doesn’t tally, Mrs Pym? A woman of her age, wet stone, a dark night. What makes you think she didn’t simply fall?';
      body = evidencePicker('Show him why it wasn’t a fall');
    } else if (H.step === 'accuse') {
      speaker = 'gale'; mood = 'worried';
      said = 'Well. Suppose you’re right. Then somebody in this hall pushed her. Who, Mrs Pym?';
      body = `<div class="suspects">${O.SUSPECTS.map((s) => `<button class="sus" data-s="${s}">${A.portrait(s, 'calm')}<span>${s === 'beatrice' ? 'Myself' : esc(O.people[s].name)}</span></button>`).join('')}</div>`;
    } else if (H.step === 'cross') {
      const st = hallStatements()[H.i];
      speaker = H.who; mood = H.i >= 2 ? 'tense' : H.who === C() ? 'tense' : 'calm';
      said = st.text;
      body = `<p class="muted small">Statement ${H.i + 1} of 4. Which of your evidence shows this doesn’t tally?</p>` + evidencePicker('Present');
    } else if (H.step === 'win') {
      speaker = C(); mood = 'shock';
      said = O.confess[C()];
      body = `<div class="row"><button class="btn primary" id="h-end">…</button></div>`;
    }
    const self = speaker === 'beatrice';
    ov.innerHTML = `<div class="hall"><div class="hall-top"><h2>The Village Hall · three o’clock</h2>${H.step === 'cross' || H.step === 'fall' ? cups : ''}<button class="btn small" id="h-ledger">Ledger</button></div>` +
      `<div class="crowd">${ATTEND.filter((k) => k !== speaker).map((k) => `<span class="cr">${A.portrait(k, k === C() && H.step !== 'open' ? 'tense' : 'calm')}</span>`).join('')}</div>` +
      `<div class="hall-stage"><div class="speaker${H.flash ? ' flash' : ''}">${A.portrait(speaker, mood)}</div><div class="said"><div class="nametag">${esc(self ? 'You — Beatrice Pym' : O.people[speaker].name)}</div><p>${esc(said)}</p></div></div>` +
      (H.flash ? `<div class="objection">${esc(H.flash)}</div>` : '') +
      `<div class="hall-body">${body}</div></div>`;
    $('h-ledger').onclick = openLedger;
    if ($('h-speak')) $('h-speak').onclick = () => { H.step = 'fall'; sfx('objection'); H.flash = 'That simply doesn’t tally!'; save(); renderHall(); setTimeout(() => { H.flash = null; if (S.phase === 'hall' && S.hall === H) renderHall(); }, 1400); };
    if ($('h-quiet')) $('h-quiet').onclick = () => finish('quiet');
    ov.querySelectorAll('.sus').forEach((b) => b.onclick = () => { H.who = b.dataset.s; H.step = 'cross'; H.i = 0; sfx('objection'); save(); renderHall(); });
    ov.querySelectorAll('[data-ev]').forEach((b) => b.onclick = () => present(b.dataset.ev));
    if ($('h-end')) $('h-end').onclick = () => finish(C() === 'beatrice' ? 'self' : 'justice');
  }
  function evidencePicker(label) {
    const ids = Object.keys(S.evidence);
    if (!ids.length) return `<p>You have nothing to show him.</p><div class="row"><button class="btn" data-ev="none">Sit down again</button></div>`;
    return `<p class="small"><b>${esc(label)}:</b></p><div class="evlist pick">${ids.map((id) => evCard(id, true)).join('')}</div>`;
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
      sfx('objection');
      H.flash = H.step === 'fall' ? 'People who slip do not scuffle.' : 'That simply doesn’t tally!';
      if (H.step === 'fall') H.step = 'accuse';
      else if (++H.i >= 4) H.step = 'win';
    } else {
      sfx('bad');
      S.cups--;
      H.flash = null;
      toast(['The Inspector raises an eyebrow. “And what does that prove, Mrs Pym?”', 'A murmur goes round the hall. Somebody tuts.', 'Mrs Tebbutt looks at the clock.'][Math.max(0, 2 - S.cups)] || '');
      if (S.cups <= 0) { save(); return finish(H.step === 'cross' && H.who !== C() ? 'wrong' : 'failed'); }
    }
    save();
    renderHall();
    if (H.flash) setTimeout(() => { H.flash = null; if (S.phase === 'hall' && S.hall === H) renderHall(); }, 1400);
  }

  // ---------- endings ----------
  function finish(kind) {
    S.ending = kind; S.phase = 'end';
    meta.runs++;
    if (kind === 'justice' || kind === 'self') meta.solved.push(C());
    store(META_KEY, meta);
    save();
    render();
  }
  function renderEnd() {
    const ov = $('ov-hall');
    ov.hidden = false;
    const c = C(), P = O.people[c];
    const steamLine = S.steam === 'resealed' ? (S.sealPerfect ? 'Nobody ever learns that you read the letter. You know, though. You find you can live with it, mostly.' : 'Weeks later, a letter comes back from Nettleton with a note: “Received with signs of interference.” Nobody says anything to you. Everybody says something about you.')
      : S.steam === 'ruined' ? 'The letter you steamed arrived at its address a ruin, and the village heard about it. Mrs Tebbutt doesn’t ask you to bring the urn again.'
        : S.steam === 'left' ? 'You never opened the letter. Harriet wouldn’t have, and in the end you didn’t need to.' : '';
    const E = {
      justice: ['Justice served', `Inspector Gale puts down his cup. ${P.name} leaves the Village Hall with a hand on their elbow, and Oakhaven, which can bear almost anything provided it is said over tea, finally says it.`, 'Harriet’s name goes back on the brass plate by the door, under yours. The pigeonholes are in order. The kettle is on.'],
      self: ['The Postmistress’s confession', 'Inspector Gale does not put his cup down for some time. Then he asks you, quite gently, to come with him to Nettleton. Edith Marlow takes your arm on the way out. You are not sure, afterwards, whether that was kindness or so you could not run.', 'Gladys Henderson keeps the post office going until the GPO sends someone new. She sorts the pigeonholes by colour.'],
      quiet: ['An unsolved fall', 'You pour the tea. The Inspector closes the file. Harriet Vale’s death is recorded as an accident, and in time even you stop looking at the vestry steps on your way past.', `But you still serve ${P.name} at the counter every week, and you still notice their hands.`],
      failed: ['An unsolved fall', 'The Inspector listens politely, and then less politely, and then closes the file. Harriet Vale slipped on wet stone, the record says. The village is very kind to you afterwards, in the way it is kind to people who have embarrassed themselves.', 'Somebody in that hall went home relieved.'],
      wrong: ['The wrong name', `You named ${O.people[S.hall.who] ? O.people[S.hall.who].name : 'the wrong person'}, and everything you laid out came apart in your hands. The Inspector closes the file as an accident, and Oakhaven never quite forgives you for asking.`, 'Somebody else in that hall went home relieved.'],
    }[S.ending];
    const reveal = S.ending === 'justice' || S.ending === 'self' ? '' : `<div class="reveal"><b>What really happened.</b> ${esc(c === 'beatrice' ? 'It was you. Harriet had found out who you used to be, and you met her on the steps at a quarter past eight.' : `It was ${P.name}. Harriet had found out they were ${W(P.motive)}, and they met her on the steps at a quarter past eight.`)} ${esc(O.page[c])}</div>`;
    ov.innerHTML = `<div class="sheet endcard"><p class="eyebrow">Day 12 · Saturday 9th December 1950</p><h2>${esc(E[0])}</h2><p>${esc(E[1])}</p><p>${esc(E[2])}</p>${steamLine ? `<p class="muted">${esc(steamLine)}</p>` : ''}${reveal}` +
      `<p class="small muted">Cases closed: ${meta.solved.length} of ${meta.runs}. ${meta.runs === 1 ? 'From now on, anyone in Oakhaven might have done it — anyone at all.' : ''}</p>` +
      `<div class="row"><button class="btn primary" id="b-again">A new case</button></div></div>`;
    $('b-again').onclick = () => { newGame(); renderIntro(); };
  }

  // ---------- panels ----------
  function renderHow() {
    const ov = $('ov-panel');
    ov.hidden = false;
    ov.innerHTML = `<div class="sheet"><div class="lhead"><h2>How to play</h2><button class="btn small" id="p-close">Close</button></div>` +
      `<p><b>Mornings, the desk.</b> Sort the post onto the village map: drag each letter to the house it is for, or tap it and then tap the house. Post for anywhere outside Oakhaven goes in the sack by the Nettleton signpost. If a note has fallen out of something, read it — it matters.</p>` +
      `<p><b>The counter.</b> Once the pile is sorted the round goes out and you open up. Customers ask for things — hand them what they want from the tray. Letters they post take the stamp they ask for; parcels go on the scale first, then take a parcel stamp. What they post comes back to you in tomorrow’s pile. Afterwards, ask them everything: <mark class="w">highlighted words</mark> go straight into your ledger. Things in the Lost &amp; Found box can be handed back across the counter.</p>` +
      `<p><b>Afternoons.</b> The post gives you reasons to call on people. Pick one and walk out across the village. Once you are left alone, put their things back where they belong and see what was hiding.</p>` +
      `<p><b>Evenings, the Knitting Ledger.</b> Fill each gap in Harriet’s story with a word you have collected. When every gap is filled the ledger tells you whether it tallies, or that two or fewer are wrong. Tallied pages let you use evidence in the Hall.</p>` +
      `<p><b>Day 12, the Village Hall.</b> Object, name the person, and break their story one statement at a time by presenting evidence from the case box. Three wrong answers and the Inspector stops listening.</p>` +
      `<p class="muted small">The culprit is drawn fresh each game. Innocent people are vague about times and own up to small things. Guilty people are precise. Saves itself in this browser.</p></div>`;
    $('p-close').onclick = () => { ov.hidden = true; };
  }

  $('btn-ledger').onclick = () => { if (S && S.phase !== 'intro') openLedger(); };
  $('btn-case').onclick = () => { if (S && S.phase !== 'intro') renderCase(); };
  $('btn-map').onclick = () => { if (S && S.phase !== 'intro') renderMapPanel(); };
  $('btn-how').onclick = renderHow;
  $('btn-sound').onclick = () => { soundOn = !soundOn; store(SOUND_KEY, soundOn); renderTop(); };
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') ['ov-ledger', 'ov-panel'].forEach((id) => { if (!$(id).hidden) { $(id).hidden = true; if (S && S.phase === 'evening') renderEvening(); } });
  });

  // ---------- debug handle ----------
  window.__oak = {
    get S() { return S; },
    get culprit() { return S && S.culprit; },
    O, render, startDay, newGame: (c) => { newGame(); if (c) { S.culprit = c; save(); } renderIntro(); },
    answers(id) { const pg = O.ledger(S.culprit).find((p) => p.id === id); const f = {}; blanksOf(pg).forEach((b) => { if (b.group) { b.group.forEach((g, i) => { f[g] = b.ok[i]; }); } else f[b.id] = b.ok[0]; }); return f; },
    solveLedger() { O.ledger(S.culprit).forEach((pg) => { S.fills[pg.id] = this.answers(pg.id); checkPage(pg); }); save(); },
    learnAll() { Object.keys(O.words).forEach((w) => { S.words[w] = 1; }); save(); },
    give(ev) { gain(ev); },
    current, sortTop() { const it = current(); if (!it) return false; if (it.back) noticed(it); picked = true; dropOnHole(it.to, document.querySelector(`[data-hole="${it.to}"]`)); return true; },
    present, wrongCount, checkPage, blanksOf, arrive, errandOf, posting, fast: false, giveSpecs,
    // what the counter wants next, for the tests: an item to hand over, or a weighing
    need() {
      if (!S.vis.here || !S.vis.errand || S.vis.errand.done) return null;
      if (!S.vis.paid) return { give: S.vis.want.find((w) => !S.vis.given.includes(w)) };
      const p = posting();
      if (!p) return null;
      if (!p.weighed) return { weigh: true };
      return { give: p.kind === 'parcel' ? 'parcel' : p.cls, stamp: true };
    },
    solveVisit() {
      if (!V) return false;
      if (V.place === 'church') { document.querySelectorAll('#tidy .bit').forEach((g) => g.onclick()); return true; }
      if (V.place === 'rooms') { V.solved = true; findings(); return true; }
      if (V.placed !== undefined) { V.solved = true; findings(); return true; }
      solvedSort(); return true;
    },
    finishVisit: () => finishVisit(),
    goto(day, phase) { S.day = day; if (phase === 'hall' || day >= 12) { S.day = 12; S.hall = { step: 'open' }; S.cups = TEACUPS; S.phase = 'hall'; save(); render(); } else startDay(); },
  };

  // ---------- boot ----------
  S = null;
  render();
})();
