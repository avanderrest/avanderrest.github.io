/* Pocket Pal: the rules. A little fluffy pet in a little room: keep its tummy, happiness,
   energy and coat up, stroke it, play ball, and teach it tricks the Nintendogs way: draw the
   trick's gesture so it strikes the pose, then say the command word while it holds it.
   Three times and the word is linked for good, and it will do the trick on the word alone
   (or the gesture alone), when it is in the mood. Nothing can die and nothing can be lost.

   No page access in here: dice come in as `rnd`, time as step(dt), what was heard as a
   string to hear(), what was drawn as a list of points to readGesture(), and anything the
   page should react to goes out through on(event, data). */

// ---------- constants ----------
export const W = 960, H = 600;                  // the room, in px
export const FLOOR = { x0: 150, x1: 810, y0: 430, y1: 545 };   // where the pet can stand
export const HOME = { x: 480, y: 500 };          // the middle of the rug
export const BOWL = { x: 250, y: 520 };
export const BED = { x: 735, y: 470 };
export const STATS = ['tummy', 'happy', 'energy', 'clean'];
export const MINUTE = 60;
// how much each stat falls per minute awake (energy rises asleep instead)
const DECAY = { tummy: 1.1, happy: 0.7, energy: 0.55, clean: 0.35 };
const SLEEP_GAIN = 7;                             // energy per minute asleep
const AWAY_CAP = 10 * 3600;                       // seconds of absence that count at most
const AWAY_FLOOR = 18;                            // being away never takes a stat below this
const WALK = 150;                                 // px/s
const RUN = 260;
export const NEEDED = 3;                          // good repetitions to learn a trick
export const WORD_WINDOW = 7;                     // seconds it holds the pose waiting for the word
export const FOODS = {
  kibble: { name: 'Kibble', tummy: 32, happy: 3, energy: 4, clean: 0 },
  apple: { name: 'Apple', tummy: 18, happy: 6, energy: 6, clean: 0 },
  cake: { name: 'Cupcake', tummy: 20, happy: 16, energy: 10, clean: -6 },
};
// the tricks, in the order they unlock. gesture is what readGesture() returns for it.
export const TRICKS = [
  { key: 'sit', name: 'Sit', word: 'sit', gesture: 'down', hint: 'Swipe down' },
  { key: 'beg', name: 'Beg', word: 'beg', gesture: 'up', hint: 'Swipe up' },
  { key: 'paw', name: 'Paw', word: 'paw', gesture: 'right', hint: 'Swipe right' },
  { key: 'spin', name: 'Spin', word: 'spin', gesture: 'circle', hint: 'Draw a circle' },
  { key: 'roll', name: 'Roll over', word: 'roll over', gesture: 'left', hint: 'Swipe left' },
  { key: 'dance', name: 'Dance', word: 'dance', gesture: 'zigzag', hint: 'Zigzag side to side' },
];
export const TRICK_TIME = { sit: 2.4, beg: 2.4, paw: 2.2, spin: 1.6, roll: 2.2, dance: 3 };
export const COLOURS = {
  honey: { name: 'Honey', fur: '#f7cf5d', shade: '#e2a93b', light: '#fff0b0', ear: '#e9b24a' },
  cream: { name: 'Cream', fur: '#f5e8d3', shade: '#d9c2a2', light: '#fffaf0', ear: '#e7c9a4' },
  peach: { name: 'Peach', fur: '#f6b9a0', shade: '#de8f78', light: '#ffe0d2', ear: '#e79c86' },
  mist: { name: 'Mist', fur: '#c9cfe6', shade: '#9aa2c6', light: '#eef0fb', ear: '#a9b0d4' },
  cocoa: { name: 'Cocoa', fur: '#b98a66', shade: '#8d6447', light: '#dcb999', ear: '#7d5940' },
};

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

// ---------- gestures ----------
/* What a drawn path was: 'down', 'up', 'left', 'right', 'circle', 'zigzag', or null.
   points: [{x, y}] in screen px (y down). Pure geometry, so it is tested in Node. */
export function readGesture(points) {
  if (!points || points.length < 4) return null;
  let len = 0, minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    if (i) len += dist(p.x, p.y, points[i - 1].x, points[i - 1].y);
  }
  const w = maxX - minX, h = maxY - minY, size = Math.max(w, h);
  if (len < 50 || size < 40) return null;
  const a = points[0], b = points[points.length - 1];
  const dx = b.x - a.x, dy = b.y - a.y, net = Math.hypot(dx, dy);

  // turning: sum the signed angle between successive steps of a resampled path, and the
  // unsigned too, so a loop (always turning the same way) is told from a zigzag (back and forth)
  const pts = resample(points, 18);
  let turn = 0, absTurn = 0;
  for (let i = 2; i < pts.length; i++) {
    const a1 = Math.atan2(pts[i - 1].y - pts[i - 2].y, pts[i - 1].x - pts[i - 2].x);
    const a2 = Math.atan2(pts[i].y - pts[i - 1].y, pts[i].x - pts[i - 1].x);
    let d = a2 - a1; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    turn += d; absTurn += Math.abs(d);
  }
  // side-to-side legs, counted with some slack so a shaky hand is not a reversal
  const th = w * 0.35;
  let dir = 0, ext = pts[0].x, flipsX = 0;
  for (const p of pts) {
    const d = p.x - ext;
    if (dir === 0) { if (Math.abs(d) > th) { dir = Math.sign(d); ext = p.x; } }
    else if (dir > 0) { if (d > 0) ext = p.x; else if (-d > th) { flipsX++; dir = -1; ext = p.x; } }
    else { if (d < 0) ext = p.x; else if (d > th) { flipsX++; dir = 1; ext = p.x; } }
  }
  const steady = absTurn ? Math.abs(turn) / absTurn : 0;
  const zigzag = flipsX >= 2 && w > h * 0.6 && len > w * 2.2;
  // three reversals or more is a zigzag whatever else it did; a loop makes two at most
  if (zigzag && flipsX >= 3) return 'zigzag';
  // a loop: turned most of the way round, the same way, and ended near where it started
  if (steady > 0.6 && ((Math.abs(turn) > 4.4 && net < size * 0.7) || Math.abs(turn) > 5.6)) return 'circle';
  // side to side at least three legs, and not much taller than it is wide
  if (zigzag) return 'zigzag';
  // a straight-ish stroke: mostly in one direction, not much wandering
  if (net > len * 0.6 && net > 45) {
    if (Math.abs(dy) > Math.abs(dx) * 1.3) return dy > 0 ? 'down' : 'up';
    if (Math.abs(dx) > Math.abs(dy) * 1.3) return dx > 0 ? 'right' : 'left';
  }
  return null;
}

function resample(points, n) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += dist(points[i].x, points[i].y, points[i - 1].x, points[i - 1].y);
  const step = total / (n - 1), out = [{ x: points[0].x, y: points[0].y }];
  let acc = 0;
  let prev = points[0];
  for (let i = 1; i < points.length && out.length < n; i++) {
    let cur = points[i], d = dist(prev.x, prev.y, cur.x, cur.y);
    while (acc + d >= step && out.length < n) {
      const t = (step - acc) / d;
      const q = { x: prev.x + (cur.x - prev.x) * t, y: prev.y + (cur.y - prev.y) * t };
      out.push(q); prev = q; d = dist(prev.x, prev.y, cur.x, cur.y); acc = 0;
    }
    acc += d; prev = cur;
  }
  while (out.length < n) out.push({ x: points[points.length - 1].x, y: points[points.length - 1].y });
  return out;
}

// ---------- words ----------
/* Speech recognisers mishear one short word in many ways ("sit" comes back as "Sit.",
   "set", "seat", "sits"), so a command is matched loosely: the same rough sound-shape, or
   one letter off. Multi-word commands match when every word does, in order. */
export function words(text) {
  return String(text || '').toLowerCase().replace(/[^a-z' ]+/g, ' ').replace(/'/g, '').split(/\s+/).filter(Boolean);
}
function soundKey(w) {
  w = w.replace(/(.)\1+/g, '$1').replace(/^wr/, 'r').replace(/^kn/, 'n').replace(/ph/g, 'f').replace(/ck/g, 'k').replace(/s$/, '');
  const first = w[0] || '';
  const rest = w.slice(1).replace(/[aeiouyhw]/g, '')
    .replace(/[dt]/g, 't').replace(/[bp]/g, 'p').replace(/[fv]/g, 'f').replace(/[szcx]/g, 's').replace(/[gkq]/g, 'k').replace(/[mn]/g, 'n');
  const f = /[aeiou]/.test(first) ? 'a' : first.replace(/[dt]/, 't').replace(/[bp]/, 'p').replace(/[szc]/, 's').replace(/[gkq]/, 'k');
  return f + rest;
}
function lev(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
// what Whisper and the browser's recogniser have been heard to write for the default words
const ALIKE = {
  sit: ['sat', 'sid', 'sits', 'seat', 'set'], paw: ['pa', 'pah', 'pour', 'poor', 'pore', 'paul', 'pause', 'pawn', 'pow', 'paws', 'por'],
  beg: ['bag', 'big', 'bake', 'peg', 'bed'], spin: ['spain', 'spen', 'spun', 'spinning'], dance: ['dense', 'dances', 'dancing', 'dan'],
  roll: ['role', 'rolled', 'rule', 'row'],
};
// how well one heard word stands for one command word: 0 (no) .. 1 (exactly)
function wordScore(heard, want) {
  if (heard === want) return 1;
  if (ALIKE[want] && ALIKE[want].includes(heard)) return 0.85;
  if (heard.replace(/s$/, '') === want) return 0.95;
  const d = lev(heard, want);
  if (want.length >= 3 && d === 1) return 0.8;
  if (soundKey(heard) === soundKey(want)) return 0.75;
  if (want.length >= 5 && d === 2) return 0.6;
  return 0;
}
// how well a whole utterance carries a (possibly multi-word) command: 0 .. 1
export function phraseScore(text, phrase) {
  const h = words(text), p = words(phrase);
  if (!h.length || !p.length) return 0;
  let best = 0;
  for (let i = 0; i + p.length <= h.length; i++) {
    let s = 1;
    for (let j = 0; j < p.length && s; j++) s = Math.min(s, wordScore(h[i + j], p[j]));
    if (s > best) best = s;
  }
  // a recogniser that runs the words together ("Rollover.") still means them
  if (!best && p.length > 1) { const joined = p.join(''); for (const w of h) best = Math.max(best, wordScore(w, joined)); }
  // just the first word of a longer command ("roll" for "roll over") will do, a little less surely
  if (!best && p.length > 1 && p[0].length >= 4) for (const w of h) best = Math.max(best, wordScore(w, p[0]) * 0.8);
  // a short command lost in a long ramble is probably not a command
  if (best && h.length > p.length + 4) best *= 0.7;
  return best;
}
// which of the commands (strings) the utterance is: { index, score } or null
export function bestCommand(text, phrases) {
  let best = null;
  phrases.forEach((ph, index) => {
    const score = phraseScore(text, ph);
    if (score >= 0.6 && (!best || score > best.score)) best = { index, score };
  });
  return best;
}

// ---------- the pet ----------
export function freshState({ name = 'Mochi', colour = 'honey' } = {}) {
  return {
    v: 1,
    name, colour,
    stats: { tummy: 80, happy: 75, energy: 85, clean: 90 },
    age: 0,                         // seconds of play
    bond: 0,                        // friendship points; a heart each 20
    tricks: Object.fromEntries(TRICKS.map((t) => [t.key, { word: t.word, reps: 0, learned: false }])),
    performed: 0,                   // tricks done on command
    pet: { x: HOME.x, y: HOME.y, face: 1, act: 'idle', trick: null, t: 0, dur: 2, tx: HOME.x, ty: HOME.y, then: null },
    bowl: null,                     // { food, left }
    ball: null,                     // { x, y, z, vx, vy, vz, state }
    bath: 0,                        // seconds of bath left
    train: null,                    // { key, stage: 'gesture' | 'word', t }
    stroke: 0,                      // recent stroking, decays: the purr
  };
}

export function createPal({ saved, name, colour, rnd = Math.random, on = () => {} } = {}) {
  const S = saved && saved.v === 1 ? saved : freshState({ name, colour });
  // carry anything a newer build added
  for (const t of TRICKS) if (!S.tricks[t.key]) S.tricks[t.key] = { word: t.word, reps: 0, learned: false };
  const P = S.pet;
  const emit = (e, d) => on(e, d);
  const say = (text, mood = 'info') => emit('say', { text, mood });
  const stat = (k, d) => { S.stats[k] = clamp(S.stats[k] + d, 0, 100); };

  function setAct(act, dur = 2, extra = {}) {
    P.act = act; P.t = 0; P.dur = dur; P.trick = extra.trick || null; P.then = extra.then || null;
  }
  function walkTo(x, y, then = null, run = false) {
    P.tx = clamp(x, FLOOR.x0, FLOOR.x1); P.ty = clamp(y, FLOOR.y0, FLOOR.y1);
    setAct(run ? 'run' : 'walk', 99, { then });
  }
  const busy = () => ['eat', 'sleep', 'trick', 'fetch', 'carry'].includes(P.act) || (P.act === 'walk' && P.then === 'eat');
  const asleep = () => P.act === 'sleep';
  const mood = () => {
    const s = S.stats;
    if (asleep()) return 'asleep';
    if (s.energy < 15) return 'sleepy';
    if (s.tummy < 20) return 'hungry';
    if (s.clean < 20) return 'grubby';
    if (s.happy < 25) return 'lonely';
    if (s.happy > 70 && s.tummy > 40 && s.energy > 30) return 'happy';
    return 'content';
  };
  // what it would most like, for the thought bubble: null when it is fine
  const want = () => {
    const s = S.stats;
    if (asleep()) return null;
    if (s.tummy < 30) return 'food';
    if (s.energy < 20) return 'sleep';
    if (s.clean < 30) return 'bath';
    if (s.happy < 35) return 'love';
    return null;
  };
  function addBond(n) {
    const before = Math.floor(S.bond / 20);
    S.bond += n;
    if (Math.floor(S.bond / 20) > before) emit('bond', { hearts: Math.floor(S.bond / 20) });
  }
  const unlocked = (key) => {
    const i = TRICKS.findIndex((t) => t.key === key);
    return i === 0 || (i > 0 && S.tricks[TRICKS[i - 1].key].learned);
  };

  // ---------- verbs ----------
  function feed(kind = 'kibble') {
    const f = FOODS[kind]; if (!f) return false;
    if (asleep()) { say(`${S.name} is fast asleep.`); return false; }
    if (S.stats.tummy > 92) { setAct('refuse', 1.4); say(`${S.name} is full!`); emit('refuse'); return false; }
    S.bowl = { food: kind, left: 1 };
    S.train = null;
    walkTo(BOWL.x + 72, BOWL.y - 4, 'eat');
    emit('bowl', { food: kind });
    return true;
  }
  function stroke(amount, round = 0) {
    // amount: px of hand movement over the pet; round: radians turned while doing it
    if (amount <= 0) return;
    if (asleep()) { S.stroke = Math.min(1, S.stroke + amount / 900); return; }
    const k = amount / 260 * (1 + Math.min(1, Math.abs(round) / 6));
    S.stroke = Math.min(1, S.stroke + amount / 500);
    if (S.bath > 0) { stat('clean', k * 4); stat('happy', k * 0.6); emit('bubbles', { n: Math.ceil(k * 3) }); }
    else { stat('happy', k * 1.6); addBond(k * 0.12); emit('hearts', { n: Math.ceil(k * 2) }); }
    if (P.act === 'idle' || P.act === 'walk' || P.act === 'look') setAct('love', 1.2);
    else if (P.act === 'love') P.t = Math.min(P.t, 0.3);
  }
  function sleep() {
    if (asleep()) return false;
    if (S.stats.energy > 90) { setAct('refuse', 1.4); say(`${S.name} isn't sleepy.`); emit('refuse'); return false; }
    S.train = null; S.ball = null; S.bath = 0;
    walkTo(BED.x - 10, BED.y + 30, 'sleep');
    return true;
  }
  function wake() {
    if (!asleep()) return false;
    setAct('stretch', 1.6); emit('wake');
    if (S.stats.energy < 50) stat('happy', -4);
    return true;
  }
  function wash() {
    if (asleep()) { say(`${S.name} is fast asleep.`); return false; }
    if (S.stats.clean > 95) { setAct('refuse', 1.4); say('Already squeaky clean!'); emit('refuse'); return false; }
    S.bath = 25; S.train = null; S.ball = null;
    walkTo(HOME.x, HOME.y);
    emit('bath');
    return true;
  }
  function play() {
    if (asleep()) { say(`${S.name} is fast asleep.`); return false; }
    if (S.stats.energy < 15) { setAct('refuse', 1.4); say(`${S.name} is too tired to play.`); emit('refuse'); return false; }
    if (S.ball) return false;
    S.train = null; S.bath = 0;
    const toRight = P.x < W / 2;
    S.ball = { x: P.x + (toRight ? 30 : -30), y: P.y - 4, z: 60, vx: (toRight ? 1 : -1) * (220 + rnd() * 120), vy: (rnd() - 0.5) * 80, vz: 240, state: 'flying' };
    P.face = toRight ? 1 : -1;
    setAct('fetch', 99);
    emit('throw');
    return true;
  }
  function chooseTrick(key) {
    const t = TRICKS.find((q) => q.key === key);
    if (!t || !unlocked(key)) return false;
    if (asleep()) { say(`${S.name} is fast asleep.`); return false; }
    S.train = { key, stage: 'gesture', t: 0 };
    S.bath = 0;
    return true;
  }
  function stopTraining() { S.train = null; if (P.act === 'trick') setAct('idle', 1); }
  function setWord(key, word) {
    const w = words(word).join(' ');
    const T = S.tricks[key];
    if (!T || T.learned || !w || w.length > 24) return false;
    if (w !== T.word) { T.word = w; T.reps = 0; }
    return true;
  }
  function rename(name) { const n = String(name || '').trim().slice(0, 16); if (n) S.name = n; return S.name; }
  function recolour(c) { if (COLOURS[c]) S.colour = c; return S.colour; }

  // obedience: does it do a learned trick when asked?
  function willing() {
    const s = S.stats;
    if (s.energy < 12) return 'sleepy';
    if (s.tummy < 12) return 'hungry';
    const p = 0.55 + 0.45 * Math.min(s.happy, s.energy + 20, s.tummy + 20) / 100 + Math.min(0.15, S.bond / 400);
    return rnd() < p ? true : 'distracted';
  }
  function perform(key, how) {
    const w = willing();
    if (w !== true) {
      setAct(w === 'distracted' ? 'look' : 'refuse', 1.5);
      say(w === 'sleepy' ? `${S.name} is too sleepy…` : w === 'hungry' ? `${S.name}'s tummy is rumbling…` : `${S.name} got distracted.`);
      emit('refuse');
      return false;
    }
    setAct('trick', TRICK_TIME[key], { trick: key });
    stat('energy', -2); stat('happy', 3); addBond(1);
    S.performed++;
    emit('trick', { key, how });
    return true;
  }

  // the player drew a gesture (a readGesture() result)
  function gesture(shape) {
    if (!shape) return false;
    if (asleep()) { if (S.stroke < 0.5) say('Shh… sleeping.'); return false; }
    if (busy() && P.act !== 'trick') return false;
    const tr = S.train;
    if (tr) {
      const t = TRICKS.find((q) => q.key === tr.key);
      if (shape !== t.gesture) { setAct('confused', 1.4); emit('confused', { shape }); return false; }
      // the gesture guides it into the pose; it holds there waiting for the word
      setAct('trick', WORD_WINDOW, { trick: t.key });
      P.hold = true;
      tr.stage = 'word'; tr.t = 0;
      emit('pose', { key: t.key });
      return true;
    }
    const t = TRICKS.find((q) => q.gesture === shape && S.tricks[q.key].learned);
    if (!t) { setAct('confused', 1.4); emit('confused', { shape }); return false; }
    return perform(t.key, 'gesture');
  }

  // the player said something (a transcript)
  function hear(text) {
    const heard = String(text || '').trim();
    emit('heard', { text: heard });
    if (!heard) return null;
    if (asleep()) {
      if (phraseScore(heard, S.name) >= 0.75 || /\b(wake|up)\b/i.test(heard)) { wake(); return 'wake'; }
      return null;
    }
    const tr = S.train;
    const keys = TRICKS.map((t) => t.key);
    const phrases = keys.map((k) => S.tricks[k].word);
    const hit = bestCommand(heard, [...phrases, S.name]);
    if (tr) {
      const T = S.tricks[tr.key];
      const isIt = hit && hit.index === keys.indexOf(tr.key);
      if (tr.stage === 'word' && isIt) {
        T.reps = Math.min(NEEDED, T.reps + 1);
        stat('happy', 5); addBond(2);
        emit('progress', { key: tr.key, reps: T.reps });
        if (T.reps >= NEEDED) {
          T.learned = true; addBond(8);
          emit('learned', { key: tr.key, word: T.word });
          S.train = null;
        } else {
          tr.stage = 'gesture'; tr.t = 0;
        }
        P.hold = false; P.t = Math.max(P.t, P.dur - 0.9);
        return 'progress';
      }
      if (tr.stage === 'gesture' && isIt) { setAct('confused', 1.4); say(`Show ${S.name} first: ${TRICKS.find((t) => t.key === tr.key).hint.toLowerCase()}.`); return 'early'; }
      if (hit && hit.index === keys.length) { come(); return 'name'; }
      if (tr.stage === 'word') { setAct('confused', 1.2); P.hold = false; emit('confused', { heard }); tr.stage = 'gesture'; return 'wrong'; }
      setAct('confused', 1.2); emit('confused', { heard });
      return null;
    }
    if (!hit) { if (!busy()) setAct('confused', 1.4); emit('confused', { heard }); return null; }
    if (hit.index === keys.length) { come(); return 'name'; }
    const key = keys[hit.index];
    if (!S.tricks[key].learned) { if (!busy()) setAct('confused', 1.4); emit('confused', { heard }); return null; }
    if (busy()) return null;
    return perform(key, 'voice') ? 'trick' : 'refused';
  }
  // a tap on the floor: it trots over to see
  function call(x, y) {
    if (busy() || S.bath > 0 || (S.train && S.train.stage === 'word')) return false;
    walkTo(x, y, null, Math.hypot(x - P.x, y - P.y) > 220);
    return true;
  }
  function come() {
    if (busy()) return;
    walkTo(HOME.x + (rnd() - 0.5) * 60, FLOOR.y1 - 10, 'happy', true);
    emit('yip');
  }

  // time away from the page: gentle, never below a floor, and it napped meanwhile
  function away(seconds) {
    const s = clamp(seconds, 0, AWAY_CAP), m = s / MINUTE;
    if (m < 0.5) return;
    for (const k of ['tummy', 'happy', 'clean']) {
      if (S.stats[k] > AWAY_FLOOR) S.stats[k] = Math.max(AWAY_FLOOR, S.stats[k] - DECAY[k] * 0.5 * m);
    }
    S.stats.energy = clamp(S.stats.energy + SLEEP_GAIN * 0.5 * m, 0, 100);
    if (P.act === 'sleep' && S.stats.energy > 95) setAct('stretch', 1.6);
  }

  // ---------- time ----------
  function step(dt) {
    S.age += dt;
    const m = dt / MINUTE;
    if (asleep()) {
      stat('energy', SLEEP_GAIN * m); stat('tummy', -DECAY.tummy * 0.4 * m);
      if (S.stats.energy >= 100) { setAct('stretch', 1.6); emit('wake'); }
    } else {
      for (const k of STATS) stat(k, -DECAY[k] * m * (k === 'energy' && (P.act === 'run' || P.act === 'fetch' || P.act === 'carry') ? 6 : 1));
    }
    S.stroke = Math.max(0, S.stroke - dt * 0.35);
    if (S.bath > 0) { S.bath -= dt; if (S.bath <= 0 || S.stats.clean >= 100) { S.bath = 0; setAct('shake', 1.2); emit('shake'); } }
    if (S.train && S.train.stage === 'word') {
      S.train.t += dt;
      if (S.train.t > WORD_WINDOW) { S.train.stage = 'gesture'; S.train.t = 0; P.hold = false; emit('missed'); }
    }
    stepBall(dt);
    P.t += dt;
    switch (P.act) {
      case 'walk': case 'run': {
        const sp = P.act === 'run' ? RUN : WALK, d = dist(P.x, P.y, P.tx, P.ty);
        if (Math.abs(P.tx - P.x) > 2) P.face = P.tx > P.x ? 1 : -1;
        if (d <= sp * dt) {
          P.x = P.tx; P.y = P.ty;
          const then = P.then;
          if (then === 'eat' && S.bowl) { P.face = -1; setAct('eat', 3.2); emit('eat', { food: S.bowl.food }); }
          else if (then === 'sleep') { setAct('sleep', 1e9); emit('sleep'); }
          else if (then === 'happy') { setAct('happy', 1.2); }
          else setAct('idle', 1 + rnd() * 2.5);
        } else { P.x += (P.tx - P.x) / d * sp * dt; P.y += (P.ty - P.y) / d * sp * dt; }
        break;
      }
      case 'eat': {
        if (S.bowl) {
          const f = FOODS[S.bowl.food], k = Math.min(S.bowl.left, dt / P.dur);
          S.bowl.left -= k;
          for (const s of STATS) stat(s, f[s] * k);
        }
        if (P.t >= P.dur) { S.bowl = null; addBond(1); setAct('happy', 1.2); emit('yum'); }
        break;
      }
      case 'trick':
        if (P.hold && S.train && S.train.stage === 'word') P.t = Math.min(P.t, P.dur - 1);
        if (P.t >= P.dur) { P.hold = false; setAct('idle', 0.8 + rnd()); }
        break;
      case 'fetch': case 'carry': break;   // stepBall drives these
      case 'sleep': break;
      default:
        if (P.t >= P.dur) idle();
    }
  }

  // what it does with itself between your attention
  function idle() {
    const s = S.stats;
    if (s.energy < 6) { walkTo(BED.x - 10, BED.y + 30, 'sleep'); return; }
    if (S.bath > 0) { setAct('idle', 1); return; }
    if (S.train) { setAct('idle', 1.5); P.face = 1; return; }
    const r = rnd();
    if (r < 0.35) walkTo(FLOOR.x0 + 40 + rnd() * (FLOOR.x1 - FLOOR.x0 - 80), FLOOR.y0 + 20 + rnd() * (FLOOR.y1 - FLOOR.y0 - 20));
    else if (r < 0.45 && s.energy < 45) setAct('yawn', 1.6);
    else if (r < 0.55 && s.clean < 45) setAct('scratch', 1.8);
    else if (r < 0.65) setAct('sniff', 1.8);
    else if (r < 0.8) setAct('look', 1.8 + rnd() * 2);
    else setAct('idle', 1.5 + rnd() * 2.5);
  }

  function stepBall(dt) {
    const B = S.ball; if (!B) return;
    if (B.state === 'flying' || B.state === 'rolling') {
      B.x += B.vx * dt; B.y += B.vy * dt;
      B.vz -= 700 * dt; B.z = Math.max(0, B.z + B.vz * dt);
      if (B.z === 0 && B.vz < 0) { B.vz = -B.vz * 0.45; if (B.vz < 40) { B.vz = 0; B.state = 'rolling'; } emit('bounce'); }
      if (B.state === 'rolling') { B.vx *= Math.pow(0.25, dt); B.vy *= Math.pow(0.25, dt); }
      if (B.x < FLOOR.x0 || B.x > FLOOR.x1) { B.vx = -B.vx * 0.6; B.x = clamp(B.x, FLOOR.x0, FLOOR.x1); }
      if (B.y < FLOOR.y0 || B.y > FLOOR.y1) { B.vy = -B.vy * 0.6; B.y = clamp(B.y, FLOOR.y0, FLOOR.y1); }
      if (B.state === 'rolling' && Math.hypot(B.vx, B.vy) < 8) B.state = 'still';
    }
    if (P.act === 'fetch') {
      const wait = B.state === 'flying' && P.t < 0.35;
      if (!wait) {
        const d = dist(P.x, P.y, B.x, B.y);
        if (Math.abs(B.x - P.x) > 3) P.face = B.x > P.x ? 1 : -1;
        if (d < 22 && B.z < 20) { B.state = 'held'; setAct('carry', 99); emit('catch'); }
        else { const sp = RUN * dt; P.x += (B.x - P.x) / d * Math.min(sp, d); P.y += (B.y - P.y) / d * Math.min(sp, d); }
      }
    } else if (P.act === 'carry') {
      B.x = P.x + P.face * 26; B.y = P.y; B.z = 14;
      const d = dist(P.x, P.y, HOME.x, FLOOR.y1 - 10);
      if (Math.abs(HOME.x - P.x) > 3) P.face = HOME.x > P.x ? 1 : -1;
      if (d < 6) {
        S.ball = null; stat('happy', 14); stat('clean', -4); addBond(2);
        setAct('happy', 1.4); emit('fetched');
      } else { const sp = WALK * 1.2 * dt; P.x += (HOME.x - P.x) / d * Math.min(sp, d); P.y += (FLOOR.y1 - 10 - P.y) / d * Math.min(sp, d); }
    } else if (B.state !== 'held' && B.state !== 'flying' && B.state !== 'rolling') {
      // it lost interest (it was called away): the ball just stays where it is until played with
      S.ball = null;
    }
  }

  return {
    S, step, feed, stroke, sleep, wake, wash, play, call, chooseTrick, stopTraining, setWord, gesture, hear, away, rename, recolour,
    mood, want, unlocked, perform,
    hearts: () => Math.floor(S.bond / 20),
    trick: (key) => TRICKS.find((t) => t.key === key),
  };
}
