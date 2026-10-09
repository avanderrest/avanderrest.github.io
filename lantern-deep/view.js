/* Lantern Deep: the screen. The scroll tells the page, the dice strip shows every roll,
   the map shows the floor in pixel art with the hero walking the passages by lantern
   light, and the choices are buttons (or number keys). A choice goes to the sim; what
   happened goes to the book (tell.js) for a page, and, if the player has woken one, to the
   Dungeon Master (dm.js) to retell. Saving, sound and the debug handle live here too.
   Nothing in here changes the rules.

   Turned round (the 'dm' role), the player tells the story and an AI plays the hero: the
   adventurer in player.js, or the language model if one is awake. The player writes on the
   scroll (the opening, which is also all the AI knows, then each room at its door) and fills
   the rooms ahead on the map (editor.js). The AI answers each page on the same scroll; its
   choices are shown but not pressable, and Continue makes its next move. */

import { createDelve, floorMenu, chooseQuest, questFor, startingHp } from './sim.js';
import { CLASSES, SKILLS, WEAPONS, ITEMS, MONSTERS, THEMES, STAT_NAME, STATS, FLOORS, DIR_NAME, XP_AT, BOSSES } from './content.js';
import { tellPage, sketchRoom, openingFor } from './tell.js';
import { createDM, MODELS, gpuInfo } from './dm.js';
import { createPlayer, say as heroSays } from './player.js';
import { createEditor } from './editor.js';
import { loadSheet, paintFloor, drawScene, iconCss, corridor, standAt, spotOf, T } from './art.js';
import { mulberry32, newSeed } from '../lib/rng.js';
import { store, setting } from '../lib/save.js';
import { readSeed, writeSeed } from '../lib/seed.js';
import { createAudio } from '../lib/audio.js';
import { frameLoop } from '../lib/loop.js';
import { expose } from '../lib/debug.js';

// ---------- constants ----------
// v2: rooms hold lists of creatures and things (sim.js upgrades a v1 save as it loads)
const save = store('lantern-deep-save-v2', { was: ['lantern-deep-save-v1'] });
const seenHelp = setting('lantern-deep-seen-help', false);
const dmPref = setting('lantern-deep-dm', 'book');
const audio = createAudio('lantern-deep-sound');
const WALK = 9, RUN = 14;            // tiles a second along a passage
const SHORT_PAGE = 90;              // characters; shorter pages are not sent to the Dungeon Master
const VIEW_TILES = 17;                // map tiles across the canvas's shorter side, roughly
const GROUP_NAME = { skill: (pool) => (pool === 'Mana' ? 'Cast a spell…' : pool === 'Faith' ? 'Call on your god…' : 'Use a skill…'), item: () => 'Use an item…' };
const GROUP_ICON = { skill: 129, item: 115 };
const BOSS_MENU = BOSSES.map((key) => ({ key, name: MONSTERS[key].name, blurb: MONSTERS[key].blurb }));
// the Dungeon Master's mode
const PICK_SHOW = 380;                // ms the AI's pick glows before it happens
const LOOPY = 8;                      // this many moves in a row that are all walking: the model is lost, the adventurer takes over
const TAP = 6;                        // css px a press may move and still be a tap on the map, not a drag

const $ = (s) => document.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const icon = (idx, px) => `<i data-icon style="width:${px}px;height:${px}px;${iconCss(idx, px)}"></i>`;

// ---------- the game ----------
const urlSeed = readSeed();
let saved = save.load();
let record = null;
if (saved && urlSeed != null && saved.seed !== urlSeed) { record = saved.record; saved = null; }
const g = createDelve({ saved, seed: urlSeed ?? newSeed(), rnd: Math.random, on: onEvent });
if (record) g.S.record = record;
writeSeed(g.S.seed);
const tellRnd = () => mulberry32((g.S.seed ^ (g.S.turn * 7919) ^ (g.S.log.length * 104729)) >>> 0);

let page = g.S.page || tellPage(g.facts(), g.S.mode === 'create' ? [] : [{ t: 'enter', first: false }], tellRnd());
let lastRolls = [];
let openGroup = null, busy = false, streaming = '', lastReply = null, planning = '';
const dm = createDM({ onStatus: dmStatus });
// the AI hero, when the player is the Dungeon Master
let player = createPlayer(), aiPick = null, thinking = false, heroSay = null, lastPlay = null;
let dmBoss = null;                    // the boss chosen on the new-game screen, or null for the dice's (or the model's) pick
let pickCls = 'fighter';              // the hero picked on the new-game screen, shown before they go down
// what the Dungeon Master is writing on the scroll (the opening, or a room at its door); key
// says which page it belongs to
let draft = { key: '', line: '' };
const isDM = () => g.S.role === 'dm';
// The tabs (index.html): on a phone they switch the one panel under the map between the story,
// the hero and the map tools; on a tablet a Dungeon Master's story column and map tools. A wide
// screen shows everything and has none (style.css decides which tabs show where).
let tab = 'story';
const heroUp = () => isDM() && ['explore', 'fight', 'shop'].includes(g.S.mode);

// Before floor 1 (and the quest with it) or a new floor is generated, ask whoever is
// telling the story to plan it: the Dungeon Master if one is awake, otherwise the book,
// from the seed. Either way the floor's shape (which rooms have a foe, a feature, a stair
// guard) is already the dice's; only which allowed monster or feature fills each slot, and
// the one-line premise tying it to the quest, comes from this. Returns { quest, plan } —
// quest only set when needQuest is true (a fresh delve); plan is null when nothing planned
// it beyond the book's own default pick, which sim.js's makeFloor() already made.
async function planAhead(floorNo, needQuest) {
  let quest = needQuest ? null : g.S.quest;
  if (needQuest && dmBoss) quest = questFor(dmBoss);
  if (needQuest && !quest && dm.state === 'ready') {
    planning = 'Choosing a quest…'; busy = true; render();
    const q = await dm.planQuest(BOSS_MENU);
    if (q) quest = { boss: q.boss, why: q.why, premises: questFor(q.boss).premises };
  }
  if (!quest) quest = chooseQuest(g.S.seed);
  let plan = null;
  if (dm.state === 'ready') {
    planning = `The Dungeon Master is drawing up ${THEMES[floorNo - 1].name}…`; busy = true; render();
    const draft = g.previewFloor(floorNo, quest.boss);
    const menu = floorMenu(draft);
    if (menu.rooms.length) plan = await dm.planFloor({ quest, floor: floorNo, theme: THEMES[floorNo - 1].name, menu });
  }
  planning = ''; busy = false;
  return { quest, plan };
}

// the map's picture of things
let sheet = null, floorCanvas = null, floorKey = '';
const hero = { x: 0, y: 0, path: [], speed: WALK, flip: false, bob: 0 };
const cam = { x: 0, y: 0 };
const fx = [];
let time = 0;

function onEvent(t, e) {
  switch (t) {
    case 'roll': case 'foeroll': sfx.dice(); break;
    case 'hit': sfx.hit(e.how === 'crit'); break;
    case 'hurt': sfx.hurt(); break;
    case 'gold': sfx.coin(); break;
    case 'item': case 'equip': sfx.pick(); break;
    case 'level': sfx.level(); break;
    case 'heal': if (e.n) sfx.heal(); break;
    case 'enter': sfx.step(); break;
    case 'dead': sfx.dead(); break;
    case 'won': sfx.won(); break;
    case 'trap': case 'mimic': case 'spotted': case 'wanderer': sfx.alarm(); break;
  }
}

// One choice, start to finish: the sim resolves it, the book writes the page, the
// Dungeon Master (if awake) retells it, and everything is saved.
async function choose(id, spec = null) {
  if (busy) return false;
  heroSay = null;
  let extra = null;
  // the Dungeon Master's own floors are emptied for them to fill, so nothing is planned;
  // the quest is theirs too (or the book's if they left it to the dice)
  if (id.startsWith('class:') && isDM()) extra = { quest: dmBoss ? questFor(dmBoss) : chooseQuest(g.S.seed) };
  else if (id.startsWith('class:')) extra = await planAhead(1, true);
  else if (id === 'descend' && !isDM()) extra = await planAhead(g.S.floor + 1, false);
  else if (id === 'furnish' || id === 'prologue') extra = spec;
  const res = g.act(id, extra);
  if (!res.ok) return false;
  openGroup = null;
  if (res.events.some((e) => e.t === 'begin' || e.t === 'prologue')) player = createPlayer();
  if (res.events.some((e) => e.t === 'new')) { writeSeed(g.S.seed); floorKey = ''; }
  if (res.events.some((e) => ['new', 'prologue', 'descend'].includes(e.t))) { editor.reset(); camOff.x = camOff.y = 0; }
  lastRolls = res.events.filter((e) => e.t === 'roll' || e.t === 'foeroll');
  moveHero(res.events);
  effects(res.events);
  const facts = g.facts();
  const book = tellPage(facts, res.events, tellRnd());
  page = { ...book, labels: {}, by: 'book' };
  g.note(page); save.save(g.S);
  // a page of a line or two is left to the book: Phi-3 padded those out with things that were not there
  if (dm.state === 'ready' && !isDM() && g.S.mode !== 'create' && book.text.length >= SHORT_PAGE) {
    busy = true; streaming = '';
    render();
    const cs = g.choices();
    const reply = await dm.tell({ facts, page: book, choices: cs, onText: (s) => { streaming = s; renderText(); } });
    busy = false; streaming = '';
    lastReply = reply;
    if (reply && (reply.used.text || reply.used.labels)) {
      const labels = {}; cs.forEach((c, i) => { if (reply.labels[i] !== c.label) labels[c.id] = reply.labels[i]; });
      page = { title: reply.title, text: reply.text, labels, by: dm.model.name };
      g.note(page); save.save(g.S);
    }
  }
  render();
  return true;
}

// ---------- the AI hero (the Dungeon Master's mode) ----------
// One move each time the Dungeon Master presses Continue: the language model's if one is
// awake and its answer is usable, otherwise the adventurer's. The pick glows on the list for
// a moment first, then the page shows what happened and the hero's line, and it waits again.
// follow: keep what is on the scroll and add the move after it (the AI answering the
// Dungeon Master's words, rather than turning the page on them)
async function aiTurn(follow = false) {
  if (!heroUp() || busy || thinking) return false;
  const lead = follow ? page.text : null;
  const cs = g.choices(), live = cs.filter((c) => !c.disabled);
  let id = null, line = null;
  const lost = g.S.log.length >= LOOPY && g.S.log.slice(-LOOPY).every((l) => l.id.startsWith('go:'));
  if (dm.state === 'ready' && !lost && live.length > 1) {
    thinking = true; renderText(); renderRole();
    const reply = await dm.play({ facts: g.facts(), page, choices: live });
    thinking = false;
    lastPlay = reply;
    if (reply && live.some((c) => c.id === reply.id)) { id = reply.id; line = reply.say; }
  }
  if (!id) id = player.choose(g, cs);
  if (!id || !isDM()) { render(); return false; }
  // the adventurer has its own lines, in character, with the names the Dungeon Master gave
  if (!line) line = heroSays(g, id);
  aiPick = id; renderChoices(); renderRole();
  await new Promise((r) => setTimeout(r, PICK_SHOW));
  aiPick = null;
  const ok = await choose(id);
  if (ok && lead && page.text && !page.text.startsWith(lead)) { page = { ...page, text: `${lead} ${page.text}` }; g.note(page); save.save(g.S); }
  if (ok && line) heroSay = line;
  if (ok) renderText();
  return ok;
}

// ---------- the hero on the map ----------
function dirBetween(a, b) { for (const d of 'nesw') if (a.exits[d] === b.id) return d; return null; }
function placeHero() {
  const S = g.S; if (!S.map) return;
  const rm = S.map.rooms[S.at], from = S.from != null ? S.map.rooms[S.from] : null;
  const p = standAt(rm, from ? dirBetween(rm, from) : null);
  hero.x = p.x; hero.y = p.y; hero.path = [];
  cam.x = hero.x + T / 2; cam.y = hero.y + T / 2;
}
function moveHero(events) {
  const S = g.S;
  if (!S.map) return;
  if (events.some((e) => e.t === 'descend' || e.t === 'begin' || e.t === 'new' || e.t === 'prologue')) { placeHero(); return; }
  for (const e of events) {
    // waiting at a doorway for the Dungeon Master: step up to it
    if (e.t === 'furnish' && e.here) continue;   // already standing in it
    if (e.t === 'furnish') { hero.path = [standAt(S.map.rooms[S.at], e.dir)]; hero.speed = WALK; continue; }
    if (e.t !== 'enter' || S.from == null) continue;
    const a = S.map.rooms[S.from], b = S.map.rooms[e.room], d = dirBetween(a, b);
    if (!d) continue;
    const path = [];
    for (const [x, y] of corridor(a, b, d)) path.push({ x: x * T, y: y * T });
    const end = standAt(b, dirBetween(b, a));
    path.push(end);
    hero.path = path;
    hero.speed = e.how === 'flee' || e.how === 'retreat' ? RUN : WALK;
  }
}
function effects(events) {
  const S = g.S; if (!S.map) return;
  const rm = S.map.rooms[S.at];
  // over the creature it happened to (events carry its place in the room)
  const foeXY = (e) => { const i = e.fi != null && e.fi >= 0 && rm.foes[e.fi] ? e.fi : 0; if (!rm.foes.length) return [(rm.x + rm.w / 2) * T, (rm.y + rm.h / 2) * T - T]; const p = spotOf(rm, rm.foes, i); return [p.x + T / 2, p.y]; };
  let k = 0;
  for (const e of events) {
    const delay = k * 0.18;
    const [foeX, foeY] = foeXY(e);
    if (e.t === 'hit' && e.by === 'hero') { fx.push({ kind: 'slash', x: foeX, y: foeY + 8, age: -delay, life: 0.35 }); fx.push({ kind: 'num', x: foeX, y: foeY, text: '-' + e.n, color: e.how === 'crit' ? '#ffd34d' : '#fff1d6', age: -delay, life: 1.1 }); k++; }
    if (e.t === 'hurt') { fx.push({ kind: 'num', x: hero.x + 8, y: hero.y, text: '-' + e.n, color: '#ff6a52', age: -delay, life: 1.1 }); k++; }
    if (e.t === 'heal' && e.n) { fx.push({ kind: 'num', x: hero.x + 8, y: hero.y, text: '+' + e.n, color: '#8fe07a', age: -delay, life: 1.2 }); k++; }
    if (e.t === 'gold') { fx.push({ kind: 'num', x: hero.x + 8, y: hero.y - 6, text: `+${e.n}g`, color: '#ffd34d', age: -delay, life: 1.3 }); k++; }
    if (e.t === 'kill') fx.push({ kind: 'spark', x: foeX, y: foeY + 8, color: '#ffe6a3', age: -delay, life: 0.6 });
    if (e.t === 'level') fx.push({ kind: 'spark', x: hero.x + 8, y: hero.y + 8, color: '#c9a2ff', age: -delay, life: 0.9 });
    if (e.t === 'miss' && e.by === 'hero') fx.push({ kind: 'num', x: foeX, y: foeY, text: 'miss', color: '#cfc4b0', age: -delay, life: 0.9 });
    if (e.t === 'miss' && e.by === 'foe') fx.push({ kind: 'num', x: hero.x + 8, y: hero.y, text: 'miss', color: '#cfc4b0', age: -delay, life: 0.9 });
  }
}

// ---------- the map, every frame ----------
const canvas = $('#ld-map'), ctx = canvas.getContext('2d');
const editor = createEditor({ g, root: $('#ld-editor'), icon, esc, onChange: () => { save.save(g.S); renderPanel(); } });
function frame(dt) {
  time += dt;
  const S = g.S;
  const w = Math.round(canvas.clientWidth * devicePixelRatio), h = Math.round(canvas.clientHeight * devicePixelRatio);
  if (!w || !h) return;
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  if (!sheet || !S.map) { title(ctx, w, h); return; }
  const seen = isDM() ? g.editable() : [];
  const key = S.seed + ':' + S.floor + ':' + S.map.rooms.map((r) => (r.visited ? 1 : 0)).join('') + (S.map.revealed ? 'R' : '') + ':' + seen.join(',');
  if (key !== floorKey) { floorCanvas = paintFloor(S.map, sheet, S.floor, new Set(seen)); floorKey = key; }
  // walk the path
  let moving = false;
  if (hero.path.length) {
    const p = hero.path[0], dx = p.x - hero.x, dy = p.y - hero.y, d = Math.hypot(dx, dy), step = hero.speed * T * dt;
    if (Math.abs(dx) > 0.5) hero.flip = dx < 0;
    if (d <= step) { hero.x = p.x; hero.y = p.y; hero.path.shift(); } else { hero.x += dx / d * step; hero.y += dy / d * step; }
    moving = true;
  }
  hero.bob = moving ? Math.abs(Math.sin(time * 14)) * 1.5 : 0;
  const s = Math.max(2, Math.round(Math.min(w, h * 1.4) / (VIEW_TILES * T)));
  const tx = hero.x + T / 2 + camOff.x, ty = hero.y + T / 2 + camOff.y, k = Math.min(1, dt * 6);
  cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
  mapView = { ox: Math.round(w / 2 - cam.x * s), oy: Math.round(h / 2 - cam.y * s), s };
  $('#ld-recentre').hidden = !(camOff.x || camOff.y);
  for (const f of fx) f.age += dt;
  while (fx.length && fx[0].age > fx[0].life) fx.shift();
  const fxNow = fx.filter((f) => f.age >= 0);
  const blessed = S.hero && S.hero.bless;
  drawScene(ctx, sheet, floorCanvas, { cam, scale: s, w, h, time }, {
    map: S.map, at: S.at, floor: S.floor, fight: S.mode === 'fight', target: S.fight ? S.fight.target : -1,
    hero: { x: hero.x, y: hero.y, sprite: CLASSES[S.hero.cls].sprite, flip: hero.flip, bob: hero.bob }, fx: fxNow,
    dm: isDM() ? editor.scene() : null,
  }, blessed ? 5.4 : 4.6);
}
// The Dungeon Master works on the map itself: a tap is handed to the editor as a tile, a drag
// looks around (Back to the hero undoes it). Both from pointer events, so a finger, a pen
// and a mouse all work; the canvas takes no touch scrolling while it is the editor.
let mapView = null, press = null;
const camOff = { x: 0, y: 0 };
function tileAt(ev) {
  if (!mapView) return null;
  const r = canvas.getBoundingClientRect();
  const px = (ev.clientX - r.left) * (canvas.width / r.width), py = (ev.clientY - r.top) * (canvas.height / r.height);
  return { x: Math.floor((px - mapView.ox) / mapView.s / T), y: Math.floor((py - mapView.oy) / mapView.s / T) };
}
canvas.addEventListener('pointerdown', (ev) => {
  if (!isDM() || !g.S.map) return;
  press = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, drag: false, ox: camOff.x, oy: camOff.y };
  try { canvas.setPointerCapture(ev.pointerId); } catch (e) { /* a pointer the browser no longer tracks */ }
});
canvas.addEventListener('pointermove', (ev) => {
  if (!isDM() || !g.S.map) return;
  if (press && press.id === ev.pointerId) {
    const dx = ev.clientX - press.x, dy = ev.clientY - press.y;
    if (!press.drag && Math.hypot(dx, dy) > TAP) press.drag = true;
    if (press.drag && mapView) { const k = (canvas.width / canvas.getBoundingClientRect().width) / mapView.s; camOff.x = press.ox - dx * k; camOff.y = press.oy - dy * k; }
    return;
  }
  if (ev.pointerType === 'mouse') {
    const t = tileAt(ev); editor.hoverAt(t && t.x, t && t.y);
    const h = editor.state.hover;
    canvas.style.cursor = h ? (h.ok ? 'copy' : 'not-allowed') : '';
  }
});
canvas.addEventListener('pointerup', (ev) => {
  if (!press || press.id !== ev.pointerId) return;
  const was = press; press = null;
  if (was.drag) return;
  const t = tileAt(ev);
  if (t) editor.tap(t.x, t.y);
});
canvas.addEventListener('pointercancel', () => { press = null; });
canvas.addEventListener('pointerleave', () => editor.hoverAt(null));
function title(c, w, h) {
  c.fillStyle = '#0a080b'; c.fillRect(0, 0, w, h);
  const gr = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.min(w, h) * 0.55);
  const k = 0.9 + 0.08 * Math.sin(time * 7) + 0.04 * Math.sin(time * 19);
  gr.addColorStop(0, `rgba(255,170,80,${0.28 * k})`); gr.addColorStop(1, 'rgba(255,170,80,0)');
  c.fillStyle = gr; c.fillRect(0, 0, w, h);
  if (sheet) {
    const ids = Object.values(CLASSES).map((x) => x.sprite);
    // as big as fits: the four heroes side by side must fit the frame's width too (a tall, narrow map)
    const s = Math.max(2, Math.floor(Math.min(Math.min(w, h) / 70, w / (ids.length * T * 1.6 + T))));
    c.imageSmoothingEnabled = false;
    const total = ids.length * T * s * 1.6;
    ids.forEach((id, i) => {
      const x = w / 2 - total / 2 + i * T * s * 1.6 + T * s * 0.3, y = h / 2 - T * s / 2 + Math.round(Math.sin(time * 2 + i) * s);
      c.fillStyle = 'rgba(0,0,0,0.4)'; c.beginPath(); c.ellipse(x + T * s / 2, h / 2 + T * s * 0.45, T * s * 0.35, T * s * 0.1, 0, 0, 7); c.fill();
      c.drawImage(sheet, (id % 12) * T, Math.floor(id / 12) * T, T, T, x, y, T * s, T * s);
    });
  }
}

// ---------- the page ----------
function render() {
  const S = g.S;
  renderText();
  setTitle(page.title);
  renderDice();
  renderRole();
  renderChoices();
  renderPanel();
  renderEditor();
  renderSheet();
  $('#ld-floor').textContent = S.map ? `Floor ${S.floor} of ${FLOORS} · ${THEMES[S.floor - 1].name}` : '';
  $('#ld-maplabel').textContent = S.map ? S.map.rooms[S.at].name.replace(/^the /, '') : '';
}
// the page's heading: the room's name, or none before there is a room
function setTitle(t) { const h = $('#ld-title'); h.textContent = t || ''; h.hidden = !t; }
function renderText() {
  const t = $('#ld-text');
  if (planning) {
    t.textContent = page.text;
    t.classList.remove('ld-streaming');
    t.style.opacity = 0.55;
    $('#ld-quill').hidden = false;
    $('#ld-quill-text').textContent = planning;
  } else if (busy) {
    t.textContent = streaming || page.text;
    t.classList.toggle('ld-streaming', !!streaming);
    t.style.opacity = streaming ? 1 : 0.55;
    $('#ld-quill').hidden = false;
    $('#ld-quill-text').textContent = `${dm.model ? dm.model.name : 'The Dungeon Master'} is writing…`;
  } else if (thinking) {
    t.textContent = page.text;
    t.classList.remove('ld-streaming');
    t.style.opacity = 0.55;
    $('#ld-quill').hidden = false;
    $('#ld-quill-text').textContent = `${g.S.hero ? g.S.hero.name : 'The hero'} is thinking…`;
  } else {
    t.textContent = page.text;
    t.classList.remove('ld-streaming');
    t.style.opacity = 1;
    $('#ld-quill').hidden = true;
  }
  const say = $('#ld-say');
  say.hidden = !heroSay || thinking;
  say.textContent = heroSay ? `“${heroSay}” says ${g.S.hero ? g.S.hero.name : 'the hero'}.` : '';
}
function renderDice() {
  const box = $('#ld-dice'); box.innerHTML = '';
  const S = g.S;
  for (const r of lastRolls) {
    const foe = r.t === 'foeroll';
    const good = foe ? !r.ok : r.ok;
    const who = foe ? (r.fname || cap(MONSTERS[r.foe].name.replace(/^the /, ''))) : r.what === 'attack' ? 'Attack' : `${(r.stat || '').toUpperCase()} ${r.what}`;
    const total = r.die + r.mod;
    const verdict = foe ? (r.ok ? 'Hits you' : 'Misses') : r.what === 'attack' ? (r.ok ? (r.crit ? 'Critical!' : 'Hit') : 'Miss') : r.ok ? 'Success' : 'Failure';
    const vs = foe || r.what === 'attack' ? `AC ${r.dc}` : `DC ${r.dc}`;
    const pill = el('span', `ld-roll ${good ? 'ok' : 'no'}${foe ? ' foe' : ''}${r.die === 20 ? ' crit' : ''}`,
      `<span class="ld-d20">${r.die}</span><span>${esc(who)} ${r.mod >= 0 ? '+' : '−'}${Math.abs(r.mod)} = ${total} vs ${vs}${r.adv ? ' · adv.' : ''}</span><span class="ld-verdict">${verdict}</span>`);
    box.appendChild(pill);
  }
  void S;
}
function renderChoices() {
  const list = $('#ld-choices'); list.innerHTML = '';
  $('.ld-choices').classList.toggle('ld-wait', busy);
  const S = g.S, cs = g.choices();
  // turned round, the hero's choices are the AI's to make: shown, never pressed
  const watching = isDM() && (S.mode === 'explore' || S.mode === 'fight' || S.mode === 'shop');
  $('.ld-choices').classList.toggle('ld-watch', watching);
  const picked = aiPick && cs.find((c) => c.id === aiPick);
  if (S.mode === 'furnish' || S.mode === 'prologue' || S.mode === 'create') return;    // the Dungeon Master's panel, or the new-game screen, stands in for the list
  const groups = {};
  for (const c of cs) if (c.group === 'skill' || c.group === 'item') (groups[c.group] = groups[c.group] || []).push(c);
  const rows = [];
  const seen = new Set();
  for (const c of cs) {
    const gname = c.group && groups[c.group] && groups[c.group].length >= 2 ? c.group : null;
    if (watching && gname) {
      // groups stay folded, except that the AI's pick stands in for its own group's row
      if (picked && picked.group === gname) { if (c.id === aiPick) rows.push({ c }); continue; }
      if (!seen.has(gname)) { seen.add(gname); rows.push({ group: gname, n: groups[gname].length }); }
      continue;
    }
    if (watching) { rows.push({ c }); continue; }
    if (openGroup) { if (c.group === openGroup) rows.push({ c }); continue; }
    if (gname) { if (!seen.has(gname)) { seen.add(gname); rows.push({ group: gname, n: groups[gname].length }); } continue; }
    rows.push({ c });
  }
  if (openGroup) rows.push({ back: true });
  rows.forEach((row, i) => {
    const li = el('li', openGroup && !row.back ? 'ld-sub' : '');
    const b = el('button', 'ld-choice');
    b.type = 'button';
    b.dataset.key = String(i + 1);
    let label, tag = '', em = '', ic, sub = '';
    if (row.back) { label = 'Back'; ic = 45; b.onclick = () => { openGroup = null; renderChoices(); }; }
    else if (row.group) {
      label = GROUP_NAME[row.group](S.hero ? CLASSES[S.hero.cls].pool : ''); ic = GROUP_ICON[row.group];
      tag = row.group === 'skill' ? `${CLASSES[S.hero.cls].pool} ${S.hero.pool}/${g.poolMax()}` : `${row.n} to hand`;
      b.onclick = () => { openGroup = row.group; renderChoices(); };
    } else {
      const c = row.c;
      label = page.labels && page.labels[c.id] ? page.labels[c.id] : c.label;
      if (label !== c.label && c.verb === 'go') sub = c.label;
      tag = c.tag || ''; ic = c.icon;
      if (c.check) { tag = `${c.check.stat.toUpperCase()} check${c.check.adv ? ' · adv.' : ''}`; em = `${Math.round(c.chance * 100)}% · ${c.verb === 'go' ? '' : ''}`.replace(/ · $/, ''); }
      else if (c.chance != null) em = `${Math.round(c.chance * 100)}% to hit`;
      if (c.verb === 'go' && !c.group) { em = c.tag && c.tag !== 'Unexplored' ? cap(DIR_NAME[c.id.slice(3)]) : ''; tag = c.tag === 'Unexplored' ? 'Unexplored' : cap(c.tag); }
      if (c.verb === 'class') { tag = ''; sub = CLASSES[c.id.slice(6)].blurb; }
      b.disabled = !!c.disabled || busy || watching;
      b.onclick = () => choose(c.id);
      if (c.id === aiPick) b.classList.add('ld-picked');
    }
    if (watching && row.group) b.disabled = true;
    b.innerHTML = `<span class="ld-num">${i + 1}</span><span class="ld-badge">${icon(ic, 28)}</span>` +
      `<span class="ld-label">${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ''}</span>` +
      (tag ? `<span class="ld-tag">${esc(tag)}${em ? `<em>${esc(em)}</em>` : ''}</span>` : '<span></span>');
    b.style.animationDelay = `${i * 0.04}s`;
    li.appendChild(b); list.appendChild(li);
  });
}
// Above the choices: before a delve, who tells the story (and, turned round, which boss);
// during a Dungeon Master's delve, who plays the hero, and Continue.
function renderRole() {
  const box = $('#ld-role'), S = g.S;
  const seg = (attr, val, on, label) => `<button type="button" class="ld-seg${on ? ' on' : ''}" data-${attr}="${val}" aria-pressed="${on}">${label}</button>`;
  if (S.mode === 'create') {
    box.innerHTML = newGame(seg);
    box.hidden = false;
    box.querySelectorAll('[data-hero]').forEach((b) => b.onclick = () => { pickCls = b.dataset.hero; renderRole(); });
    box.querySelector('#ld-begin').onclick = () => choose('class:' + pickCls);
  } else if (isDM() && S.hero && S.mode !== 'dead' && S.mode !== 'won' && S.mode !== 'prologue') {
    const who = dm.state === 'ready' ? dm.model.name : 'The adventurer';
    const state = thinking ? 'thinking…' : aiPick ? 'deciding…' : S.mode === 'furnish' ? 'waiting for you to write the room' : 'waiting for you';
    box.innerHTML = `<div class="ld-ctl"><p class="ld-role-q">${esc(who)} plays ${esc(S.hero.name)} · ${state}</p>
      ${heroUp() ? `<button type="button" class="ld-continue" id="ld-continue"${thinking || aiPick || busy ? ' disabled' : ''}>Continue <span aria-hidden="true">▶</span></button>` : ''}</div>`;
    box.hidden = false;
  } else { box.innerHTML = ''; box.hidden = true; return; }
  box.querySelectorAll('[data-role]').forEach((b) => b.onclick = () => { g.setRole(b.dataset.role); save.save(g.S); render(); });
  box.querySelectorAll('[data-boss]').forEach((b) => b.onclick = () => { dmBoss = b.dataset.boss || null; renderRole(); });
  const cont = box.querySelector('#ld-continue');
  if (cont) cont.onclick = () => aiTurn(false);
}

// The new-game screen, all that shows before a delve: who tells the story, who waits at the
// bottom, and who goes down (the four heroes, the picked one's numbers beside them), then go.
function newGame(seg) {
  const boss = dmBoss ? BOSS_MENU.find((b) => b.key === dmBoss) : null;
  const K = CLASSES[pickCls], hp = startingHp(pickCls);
  const sign = (v) => { const m = Math.floor((v - 10) / 2); return `${m >= 0 ? '+' : '−'}${Math.abs(m)}`; };
  const heroes = Object.keys(CLASSES).map((c) => { const H = CLASSES[c], on = c === pickCls;
    return `<button type="button" class="ld-hero${on ? ' on' : ''}" data-hero="${c}" aria-pressed="${on}">${icon(H.sprite, 48)}<b>${esc(g.S.names[c])}</b><small>${esc(H.race)} ${esc(H.name)}</small></button>`; }).join('');
  const skills = K.skills.map((k) => `<li>${icon(SKILLS[k].icon, 20)}${esc(SKILLS[k].name)} <small>${SKILLS[k].cost ? `${SKILLS[k].cost} ${esc(K.pool.toLowerCase())}` : 'free'}</small></li>`).join('');
  const kit = K.kit.map(([id, n]) => `<li>${icon(ITEMS[id].sprite, 20)}${esc(ITEMS[id].name)}${n > 1 ? ` ×${n}` : ''}</li>`).join('');
  return `<section class="ld-new-part"><h2>Who tells the story?</h2>
      <div class="ld-segs">${seg('role', 'hero', !isDM(), 'You play the hero')}${seg('role', 'dm', isDM(), 'You are the Dungeon Master')}</div>
      <p class="ld-role-note">${isDM() ? 'An AI plays the hero. You write the story and fill the rooms ahead of them on the map.' : 'You choose what the hero does, one page at a time.'}</p></section>
    <section class="ld-new-part"><h2>At the bottom waits…</h2>
      <div class="ld-segs ld-bosses">${seg('boss', '', !dmBoss, 'Let the dice choose')}${BOSS_MENU.map((b) => seg('boss', b.key, dmBoss === b.key, esc(b.name.replace(/^the /, '')))).join('')}</div>
      <p class="ld-role-note">${boss ? esc(boss.blurb) : 'Somebody waits five floors down. You will find out who.'}</p></section>
    <section class="ld-new-part"><h2>Who goes down?</h2>
      <div class="ld-heroes">${heroes}</div>
      <div class="ld-hero-sheet">
        <p class="ld-hero-blurb">${esc(K.blurb)}</p>
        <ul class="ld-hero-nums"><li><b>${hp}</b> HP</li><li><b>${K.ac}</b> AC</li><li><b>${K.poolBase}</b> ${esc(K.pool)}</li><li>${icon(WEAPONS[K.weapon].sprite, 20)}<b>${esc(WEAPONS[K.weapon].name)}</b> ${WEAPONS[K.weapon].dice}</li></ul>
        <dl class="ld-hero-stats">${STATS.map((st) => `<div><dt>${esc(STAT_NAME[st])}</dt><dd>${K.stats[st]}<small>${sign(K.stats[st])}</small></dd></div>`).join('')}</dl>
        <div class="ld-hero-lists"><div><h3>Skills</h3><ul>${skills}</ul></div><div><h3>Carries</h3><ul>${kit}</ul></div></div>
      </div></section>
    <div class="ld-new-go"><button type="button" class="ld-continue" id="ld-begin">${isDM() ? `Begin the story with ${esc(g.S.names[pickCls])}` : `Go down as ${esc(g.S.names[pickCls])}`} <span aria-hidden="true">▶</span></button></div>`;
}

// The Dungeon Master's writing box, standing in for the page and the list while they write:
// one box with what is happening (the room, the hero's last line), their words under it, and
// the buttons under those (Amber, 2026-10-09). The opening comes first; then each room at its
// door, or at the foot of a stair. The AI's answer goes on the page as usual.
function renderPanel() {
  const form = $('#ld-furnish'), S = g.S;
  const mode = isDM() && (S.mode === 'prologue' || S.mode === 'furnish') ? S.mode : null;
  form.hidden = !mode; $('#ld-choices').hidden = !!mode;
  $('.ld-scroll').hidden = !!mode;
  if (!mode) { draft.key = ''; return; }
  const H = S.hero, head = $('#ld-furnish-head'), row = $('#ld-furnish-row');
  const button = (label, need) => `<span class="ld-need" id="ld-need">${need}</span><button type="button" class="big quiet" id="ld-roll-room">${label}</button>`;
  const said = heroSay ? `<p class="ld-say">“${esc(heroSay)}” says ${esc(H.name)}.</p>` : '';
  form.onsubmit = (e) => { e.preventDefault(); letThemIn(); };
  if (mode === 'prologue') {
    const key = 'prologue:' + S.seed;
    const fresh = draft.key !== key;
    if (fresh) { draft = { key, line: '' }; tab = 'story'; }
    head.innerHTML = `<h3>Before the story begins</h3>
      <p class="ld-furnish-note">Write the opening: where ${esc(H.name)} is, why they are going down, and anything they know. ${esc(H.name)} plays from it. The quest’s end is ${esc(theName(S.quest.boss))}. The map opens for you once the story begins.</p>`;
    row.innerHTML = `${button('Write it for me', 'Write the opening first')}<button type="submit" class="big" id="ld-let-in">Begin the story</button>`;
    $('#ld-roll-room').onclick = () => {
      if (!draft.line.trim()) draft.line = openingFor(g.facts().hero, S.quest.boss, S.quest.why);
      renderWriter({ kind: 'prologue' }, true);
    };
    renderWriter({ kind: 'prologue' }, fresh);
    return;
  }
  const menu = g.furnishMenu(), key = S.seed + ':' + S.floor + ':' + menu.room;
  const fresh = draft.key !== key;
  if (fresh) { draft = { key, line: '' }; tab = 'story'; renderTabs(); }
  const heals = H.bag.filter((b) => ITEMS[b.id].use === 'heal').reduce((a, b) => a + b.n, 0);
  const plan = S.map.rooms[menu.room].plan || { foes: [], things: [] };
  const n = plan.foes.length + plan.things.length;
  const where = menu.start ? `${esc(H.name)} is at the foot of the stair, in ${esc(menu.name)}. Describe it; anything you put in the room on the map will be there.`
    : menu.throne ? `${esc(cap(theName(menu.boss)))} waits in ${esc(menu.name)}. Describe the throne room; anything else you put in it on the map will be there.`
      : `${esc(H.name)} is at the door of ${esc(menu.name)}. Write what they see. ${n ? `You have put ${n} thing${n > 1 ? 's' : ''} in it on the map; you can still change them.` : 'It is empty: put anything you like in it on the map first.'}`;
  // at the foot of a stair the book's line about the way down is part of what is happening
  const lead = menu.start && page.text ? `<p class="ld-furnish-lead">${esc(page.text)}</p>` : '';
  head.innerHTML = `<h3>${menu.start ? `The foot of the stair: ${esc(cap(menu.name.replace(/^the /, '')))}` : menu.throne ? 'The throne room' : `At the door of ${esc(menu.name)}`}</h3>
    ${lead}${said}
    <p class="ld-furnish-note">${where} ${esc(H.name)} has ${H.hp} of ${H.maxHp} HP and ${heals ? heals + ' healing potion' + (heals > 1 ? 's' : '') : 'no healing potions'}.${menu.stairs ? ' <b>The stair down is in this room.</b>' : ''}</p>`;
  row.innerHTML = `${button('Leave it to fate', 'Write the room first')}<button type="submit" class="big" id="ld-let-in">Let them in</button>`;
  // the dice's own pick for this room (if it is still empty), and, if the box is still blank,
  // the book's picture of what is planned as a draft to rewrite
  $('#ld-roll-room').onclick = () => {
    const room = S.map.rooms[menu.room];
    if (!(room.plan && (room.plan.foes.length || room.plan.things.length)) && menu.suggest) editor.rollFor(menu.room);
    if (!draft.line.trim()) {
      const p = room.plan || { foes: [], things: [] };
      const F = p.things.find((t) => t.kind !== 'coins' && t.kind !== 'item'), foe = menu.boss || (p.foes[0] && p.foes[0].kind);
      draft.line = sketchRoom(S.floor, { name: menu.name, size: menu.size, props: menu.props, stairs: menu.stairs, start: menu.start, loot: p.things.some((t) => t.kind === 'coins' || t.kind === 'item'),
        feature: F && { kind: F.kind, state: 'new' }, foe: foe && { kind: foe, state: 'hostile', name: p.foes[0] && p.foes[0].name } }, mulberry32((S.seed ^ (menu.room * 7919)) >>> 0));
    }
    renderPanel(); renderEditor();
  };
  renderWriter({ kind: 'room', menu }, fresh);
}
// The text box in the writing box: a ruled page in the story's own hand. Its words are the
// opening, or what the hero sees on walking in (tell.js describeRoom), so it will not go on
// blank.
function renderWriter(what, fresh) {
  const w = $('#ld-write'), H = g.S.hero;
  if (what.kind === 'prologue') w.placeholder = `Where is ${H.name}, why are they going down into the dark, and what do they know? Write it here.`;
  else {
    const menu = what.menu;
    w.placeholder = menu.start ? `Where does ${H.name} find themselves at the foot of the stair? Write it here: the room, the light, what lies about…`
      : menu.throne ? `${H.name} steps into the throne room, and ${theName(menu.boss)} is waiting. What do they see? Write it here…`
        : `${H.name} steps into ${menu.name}. What do they see? Write it here: the room, who is waiting, what lies about…`;
  }
  w.maxLength = what.kind === 'prologue' ? 1200 : 600;
  if (fresh || w.value !== draft.line) w.value = draft.line;
  const fit = () => { w.style.height = 'auto'; w.style.height = w.scrollHeight + 'px'; };
  const ready = () => { const ok = !!draft.line.trim(); $('#ld-let-in').disabled = !ok; $('#ld-need').hidden = ok; };
  w.oninput = () => { draft.line = w.value; fit(); ready(); };
  w.onkeydown = (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); letThemIn(); } };
  fit(); ready();
  // a keyboard to hand (a fine main pointer): start typing straight away; on a touch screen
  // the on-screen keyboard waits for a tap, so it does not cover the panel unasked
  if (fresh && matchMedia('(pointer: fine)').matches) w.focus({ preventScroll: true });
}
// The Dungeon Master's words go in, and the AI answers on the same scroll at once: its move
// follows what they wrote, and its line shows underneath. Continue takes it from there.
async function letThemIn() {
  const S = g.S;
  if (!draft.line.trim()) return false;
  const id = S.mode === 'prologue' ? 'prologue' : S.mode === 'furnish' ? 'furnish' : null;
  if (!id) return false;
  const spec = id === 'prologue' ? { intro: draft.line } : { line: draft.line };
  draft = { key: '', line: '' };
  const ok = await choose(id, spec);
  if (ok && heroUp()) await aiTurn(true);
  return ok;
}
// the map editor's panel, the tabs, and the table laid out for them
function renderEditor() {
  const on = isDM() && !!g.S.map && g.S.mode !== 'dead' && g.S.mode !== 'won';
  $('#ld-editor').hidden = !on;
  $('.ld-table').classList.toggle('ld-dmplay', on);
  canvas.classList.toggle('ld-editing', on);
  if (on) editor.render();
  renderTabs();
}
function renderTabs() {
  const table = $('.ld-table');
  table.classList.toggle('ld-new', g.S.mode === 'create');
  if (!table.classList.contains('ld-dmplay') && tab === 'tools') tab = 'story';
  // a tablet has no Hero tab: the hero is always under the map there
  if (tab === 'hero' && innerWidth >= 720) tab = 'story';
  table.dataset.tab = tab;
  document.querySelectorAll('.ld-tab').forEach((b) => { const cur = b.dataset.tab === tab; b.classList.toggle('on', cur); b.setAttribute('aria-pressed', cur); });
}
function showTab(k) { tab = k; renderTabs(); }
document.querySelectorAll('.ld-tab').forEach((b) => b.onclick = () => showTab(b.dataset.tab));

function renderSheet() {
  const S = g.S, H = S.hero;
  const portrait = $('#ld-portrait');
  $('.ld-sheet').classList.toggle('ld-empty', !H);
  if (!H) {
    $('#ld-name').textContent = 'Who goes down?';
    portrait.innerHTML = `<i style="position:absolute;left:calc(50% - 32px);top:calc(50% - 30px);width:64px;height:64px;${iconCss(29, 64)}"></i>`;
    for (const id of ['hp', 'pool', 'xp']) { $(`#ld-${id}`).textContent = ''; $(`#ld-${id}-fill`).style.width = '0'; }
    $('#ld-chips').innerHTML = `<span>Delves ${S.record.runs}</span><span>Won ${S.record.wins}</span><span>Deepest ${S.record.deepest || '—'}</span>`;
    $('#ld-stats').innerHTML = ''; $('#ld-bag').innerHTML = '';
    return;
  }
  const K = CLASSES[H.cls];
  $('#ld-name').textContent = `${H.name} · ${K.race} ${K.name} · Lv ${H.lvl}`;
  portrait.innerHTML = `<i style="position:absolute;left:calc(50% - 32px);top:calc(50% - 30px);width:64px;height:64px;${iconCss(K.sprite, 64)}"></i>`;
  const bar = (id, v, max, text) => { $(`#ld-${id}-fill`).style.width = `${Math.max(0, Math.min(1, v / max)) * 100}%`; $(`#ld-${id}`).textContent = text; };
  bar('hp', H.hp, H.maxHp, `HP ${H.hp} / ${H.maxHp}`);
  bar('pool', H.pool, g.poolMax(), `${K.pool} ${H.pool} / ${g.poolMax()}`);
  const next = XP_AT[H.lvl + 1], here = XP_AT[H.lvl];
  bar('xp', next ? H.xp - here : 1, next ? next - here : 1, next ? `XP ${H.xp} / ${next}` : `XP ${H.xp} · max level`);
  const chips = [`<span class="gold">${H.gold} gold</span>`, `<span>AC ${g.ac()}</span>`];
  if (H.poison) chips.push('<span class="warn">Poisoned</span>');
  if (H.bless) chips.push('<span class="bless">Blessed</span>');
  if (H.boosts) chips.push('<span class="bless">Level up!</span>');
  $('#ld-chips').innerHTML = chips.join('');
  $('#ld-stats').innerHTML = STATS.map((s) => { const v = H.stats[s], m = Math.floor((v - 10) / 2); return `<dt>${STAT_NAME[s]}</dt><dd>${v}<small>${m >= 0 ? '+' : '−'}${Math.abs(m)}</small></dd>`; }).join('');
  const W = WEAPONS[H.weapon];
  const slots = [`<div class="ld-slot eq" title="${esc(W.name)} (${W.dice})">${icon(W.sprite, 32)}</div>`];
  if (H.shield) slots.push(`<div class="ld-slot eq" title="${esc(ITEMS[H.shield].name)} (+${ITEMS[H.shield].ac} AC)">${icon(ITEMS[H.shield].sprite, 32)}</div>`);
  for (const k of K.skills) slots.push(`<div class="ld-slot" title="${esc(SKILLS[k].name)} (${K.pool} ${SKILLS[k].cost})">${icon(SKILLS[k].icon, 32)}</div>`);
  for (const b of H.bag) slots.push(`<div class="ld-slot" title="${esc(ITEMS[b.id].name)}">${icon(ITEMS[b.id].sprite, 32)}<b>${b.n}</b></div>`);
  fitBag(slots);
}
// The bag fills the room beside the hero, exactly as tall as the hero's box: as many rows and
// columns of square slots as makes them biggest, never fewer slots than the hero carries (and
// at least 16, so it reads as a bag). On a phone it is two rows of eight under the hero.
const BAG_GAP = 5, BAG_PAD = 8;
let bagSlots = [];
function fitBag(slots = bagSlots) {
  bagSlots = slots;
  const bag = $('#ld-bag'), filled = slots.filter((x) => !/^<div class="ld-slot"><\/div>$/.test(x));
  const need = Math.max(16, filled.length);
  let cols = 8, rows = 2, size = null;
  if (innerWidth >= 720 && bag.clientHeight && bag.clientWidth) {
    const W = bag.clientWidth - BAG_PAD * 2, Hh = bag.clientHeight - BAG_PAD * 2;
    let best = 0;
    for (let r = 1; r <= 6; r++) {
      const c = Math.ceil(need / r), sz = Math.floor(Math.min((W - (c - 1) * BAG_GAP) / c, (Hh - (r - 1) * BAG_GAP) / r));
      if (sz > best) { best = sz; cols = c; rows = r; }
    }
    size = best;
  }
  const out = filled.slice();
  while (out.length < cols * rows) out.push('<div class="ld-slot"></div>');
  bag.style.gridTemplateColumns = size ? `repeat(${cols}, ${size}px)` : `repeat(${cols}, minmax(0, 1fr))`;
  bag.style.gridAutoRows = size ? `${size}px` : '';
  bag.innerHTML = out.join('');
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const theName = (kind) => { const n = MONSTERS[kind].name; return n.startsWith('the ') ? n : 'the ' + n; };

// ---------- the Dungeon Master ----------
let dmLast = { state: 'off' };
function dmStatus(st) {
  dmLast = st;
  const pill = $('#ld-dm');
  pill.dataset.state = st.state;
  $('#ld-dm-label').textContent = st.state === 'ready' ? st.model.name : st.state === 'loading' ? `${st.model.name} ${Math.round((st.progress || 0) * 100)}%` : st.state === 'error' ? 'The book' : 'The book';
  if (!$('#ld-dialog').hidden && $('#ld-dialog').dataset.kind === 'dm') dmDialog();
  if (isDM()) renderRole();
}
async function dmDialog() {
  const gpu = await gpuInfo();
  const pref = dmPref.get();
  const st = dmLast;
  const body = $('#ld-dialog-body');
  const rows = [`<li><button class="ld-model ${pref === 'book' ? 'on' : ''}" data-key="book" type="button"><b>The book</b><em>built in</em><span>Instant and always truthful. Written by hand, so pages repeat after a while.</span></button></li>`];
  for (const M of MODELS) {
    const on = pref === M.key;
    rows.push(`<li><button class="ld-model ${on ? 'on' : ''}" data-key="${M.key}" type="button" ${gpu.ok ? '' : 'disabled'}><b>${M.name}</b><em>${M.size}</em><span>${M.note}${on && st.state === 'ready' ? ' <b>Awake.</b>' : ''}</span></button></li>`);
  }
  let state = '';
  if (st.state === 'loading') state = `<div class="ld-progress"><span style="width:${Math.round((st.progress || 0) * 100)}%"></span></div><p class="ld-note">${esc(st.text || 'Loading…')}</p>`;
  if (st.state === 'error') state = `<p class="ld-note ld-warn">${esc(st.why || 'It would not load.')}</p>`;
  const intro = isDM()
    ? `<h2>Who plays the hero?</h2>
    <p>You are the Dungeon Master, so the hero is the AI’s. Without a model, the built-in <b>adventurer</b> plays: sensible, quick, and the same every time. A <b>language model</b> reads each page and picks a choice itself, saying why in a line of its own (and the adventurer steps in if its answer makes no sense). It runs entirely in this browser on your graphics card, so it is private, and it is free. It downloads once (the browser keeps it), and it takes a few seconds a move.</p>`
    : `<h2>Who tells the story?</h2>
    <p>The dice and the rules are always the game’s own. The storyteller only puts them into words. A <b>language model</b> can retell each page in its own voice and reword your choices. It runs entirely in this browser on your graphics card, so it is private, and it is free. It downloads once (the browser keeps it), and it takes a few seconds a page.</p>`;
  body.innerHTML = `${intro}
    ${gpu.ok ? '' : `<p class="ld-note ld-warn">${esc(gpu.why)}</p>`}
    <ul class="ld-models">${rows.join('')}</ul>${state}
    <div class="ld-row"><button class="big" type="button" id="ld-dm-close">Close</button></div>`;
  $('#ld-dialog').dataset.kind = 'dm';
  $('#ld-dialog').hidden = false;
  body.querySelectorAll('.ld-model').forEach((b) => b.onclick = async () => {
    const key = b.dataset.key;
    dmPref.set(key);
    if (key === 'book') { await dm.unload(); dmDialog(); return; }
    dm.load(key);
    dmDialog();
  });
  $('#ld-dm-close').onclick = closeDialog;
}
function closeDialog() { $('#ld-dialog').hidden = true; $('#ld-dialog').dataset.kind = ''; }

// Abandon this delve for a fresh dungeon. A living hero is asked about first; the record
// (runs, wins, deepest) carries over, and an abandoned delve does not count as a run.
function startOver() {
  if (busy) return;
  if (g.S.mode === 'create' || g.S.mode === 'dead' || g.S.mode === 'won') { restart(); return; }
  const body = $('#ld-dialog-body');
  const who = g.S.hero ? esc(g.S.hero.name || 'your hero') : 'your hero';
  body.innerHTML = `<h2>Start over?</h2>
    <p>Leave ${who} on floor ${g.S.floor} and begin a new delve in a new dungeon. This one cannot be picked up again.</p>
    <div class="ld-row"><button class="big quiet" type="button" id="ld-keep">Keep going</button><button class="big" type="button" id="ld-over">Start over</button></div>`;
  $('#ld-dialog').dataset.kind = 'restart';
  $('#ld-dialog').hidden = false;
  $('#ld-keep').onclick = closeDialog;
  $('#ld-over').onclick = () => { closeDialog(); restart(); };
}
function restart() {
  if (busy) return;
  g.newRun(newSeed());
  writeSeed(g.S.seed);
  floorKey = ''; lastRolls = []; openGroup = null; lastReply = null; fx.length = 0; heroSay = null;
  editor.reset(); camOff.x = camOff.y = 0; draft = { key: '', line: '' };
  page = tellPage(g.facts(), [], tellRnd());
  g.note(page); save.save(g.S);
  placeHero();
  render();
}

function howTo() {
  const body = $('#ld-dialog-body');
  body.innerHTML = `<h2>How to play</h2>
    <p>Five floors under the Gallows Inn sits the Hollow King. Go down, and kill him.</p>
    <ul>
      <li><b>Choose</b> what to do from the list (or press its number). Anything that can fail shows the stat it tests and your chance, and every roll appears under the scroll.</li>
      <li><b>Read the doorways.</b> Bootprints, webs or a cold draught tell you truly what the next room holds. Some you only notice with a good Wisdom.</li>
      <li><b>Fights</b> go round by round: attack, use your class’s skills, drink a potion, dodge, or run back the way you came.</li>
      <li>Not every fight is worth having. You can <b>sneak</b> past (Dexterity) or <b>talk</b> your way by (Charisma), and both still earn some experience.</li>
      <li>Search chests before you open them. Rest by a campfire, or once a floor anywhere quiet, but something may find you.</li>
      <li>Each floor’s stair down is in the room furthest from where you came in. Death ends the delve; the dungeon is new each time, and the address bar holds its seed, so you can share one.</li>
      <li><b>Or turn it round.</b> Before a delve, choose <b>You are the Dungeon Master</b> and an AI plays the hero. You write the opening on the scroll, and a background only the AI reads. The rooms beside the ones the hero has seen glow on the map: pick a creature or a thing under the map and tap a tile to put it there, then tap it to give it a name, a part in the story, a temper, or what is in it. When the hero reaches a door you describe the room on the scroll, and press <b>Continue</b> (or the space bar) for each of the hero’s moves.</li>
    </ul>
    <p class="ld-note">The storyteller is the built-in book unless you wake a language model from the button at the top. Map and sprites: Kenney’s Tiny Dungeon (CC0).</p>
    <div class="ld-row"><button class="big" type="button" id="ld-go">Light the lantern</button></div>`;
  $('#ld-dialog').dataset.kind = 'help';
  $('#ld-dialog').hidden = false;
  $('#ld-go').onclick = () => { seenHelp.set(true); closeDialog(); };
}

// ---------- sound ----------
const sfx = {
  dice() { for (let i = 0; i < 4; i++) audio.noise({ dur: 0.04, vol: 0.05, filter: 'bandpass', freq: 2400 + i * 300, q: 3, delay: i * 0.05 }); },
  hit(crit) { audio.noise({ dur: 0.12, vol: 0.09, filter: 'lowpass', freq: 900, delay: 0.2 }); audio.tone({ freq: crit ? 220 : 140, to: 60, dur: 0.14, type: 'triangle', vol: 0.08, delay: 0.2 }); },
  hurt() { audio.tone({ freq: 110, to: 55, dur: 0.22, type: 'sawtooth', vol: 0.05, delay: 0.3 }); },
  coin() { audio.tone({ freq: 1320, dur: 0.08, type: 'square', vol: 0.025, delay: 0.1 }); audio.tone({ freq: 1760, dur: 0.12, type: 'square', vol: 0.025, delay: 0.17 }); },
  pick() { audio.tone({ freq: 660, to: 880, dur: 0.1, type: 'triangle', vol: 0.05 }); },
  heal() { audio.tone({ freq: 440, to: 880, dur: 0.35, type: 'sine', vol: 0.05 }); },
  level() { [523, 659, 784, 1046].forEach((f, i) => audio.tone({ freq: f, dur: 0.22, type: 'triangle', vol: 0.06, delay: i * 0.1 })); },
  step() { audio.noise({ dur: 0.06, vol: 0.03, filter: 'lowpass', freq: 500 }); audio.noise({ dur: 0.06, vol: 0.03, filter: 'lowpass', freq: 450, delay: 0.16 }); },
  alarm() { audio.tone({ freq: 330, to: 220, dur: 0.25, type: 'sawtooth', vol: 0.05 }); },
  dead() { [392, 330, 262, 196].forEach((f, i) => audio.tone({ freq: f, dur: 0.5, type: 'triangle', vol: 0.06, delay: i * 0.3 })); },
  won() { [523, 659, 784, 659, 784, 1046].forEach((f, i) => audio.tone({ freq: f, dur: 0.3, type: 'triangle', vol: 0.06, delay: i * 0.14 })); },
};
function soundLabel() { $('#ld-sound').innerHTML = `<span class="lg">♪ Sound ${audio.on ? 'on' : 'off'}</span><span class="sm">${audio.on ? '♪' : '<s>♪</s>'}</span>`; }

// ---------- input ----------
$('#ld-sound').onclick = () => { audio.toggle(); soundLabel(); };
$('#ld-howto').onclick = howTo;
$('#ld-restart').onclick = startOver;
$('#ld-dm').onclick = dmDialog;
$('#ld-skip').onclick = () => dm.skip();
$('#ld-dialog').addEventListener('click', (e) => { if (e.target.id === 'ld-dialog') closeDialog(); });
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { if (!$('#ld-dialog').hidden) closeDialog(); else if (editor.state.brush || editor.state.sel) { editor.reset(); renderEditor(); } else if (openGroup) { openGroup = null; renderChoices(); } return; }
  if (!$('#ld-dialog').hidden || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target.closest && e.target.closest('textarea, input')) return;   // typing on the scroll
  // the Dungeon Master moves the story on with the space bar or Enter
  if ((e.key === ' ' || e.key === 'Enter') && heroUp() && !(e.target.closest && e.target.closest('button'))) { e.preventDefault(); aiTurn(); return; }
  if (/^[1-9]$/.test(e.key)) {
    const b = document.querySelector(`.ld-choice[data-key="${e.key}"]`);
    if (b && !b.disabled) { e.preventDefault(); b.click(); }
  }
});
addEventListener('resize', () => { renderSheet(); renderTabs(); });
// the bag's room changes whenever the hero's box or the table does
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => fitBag()).observe($('#ld-bag'));

// ---------- start ----------
soundLabel();
placeHero();
render();
loadSheet().then((im) => { sheet = im; }).catch(() => console.warn('Lantern Deep: the tile sheet did not load'));
frameLoop(frame).start();
if (!seenHelp.get()) howTo();
if (dmPref.get() !== 'book') gpuInfo().then((gi) => { if (gi.ok) dm.load(dmPref.get()); });
$('#ld-recentre').onclick = () => { camOff.x = camOff.y = 0; };

expose('__lantern', {
  get S() { return g.S; }, sim: g, dm, choose,
  get page() { return page; }, get busy() { return busy; }, get planning() { return planning; }, get hero() { return hero; }, get lastReply() { return lastReply; },
  // the Dungeon Master's mode: furnish({ line }) describes the room at the door and lets the
  // hero in; prologue({ intro }) begins the story; aiTurn() is Continue; setPlan()
  // fills a room ahead; editor is the map editor; lastPlay is the model's last move
  furnish: (spec) => choose('furnish', spec), prologue: (spec) => choose('prologue', spec), aiTurn, editor,
  // where a map tile is on screen (client px), so a test can tap the real canvas
  screenOf: (tx, ty) => { if (!mapView) return null; const r = canvas.getBoundingClientRect(), k = r.width / canvas.width; return { x: r.left + (mapView.ox + (tx + 0.5) * T * mapView.s) * k, y: r.top + (mapView.oy + (ty + 0.5) * T * mapView.s) * k }; },
  setPlan: (id, plan) => { const p = g.setPlan(id, plan); save.save(g.S); renderEditor(); renderPanel(); return p; },
  get thinking() { return thinking; }, get lastPlay() { return lastPlay; },
  get heroSay() { return heroSay; }, get draft() { return draft; }, setBoss(k) { dmBoss = k; renderRole(); },
  choices: () => g.choices(), facts: () => g.facts(), render,
  text: () => JSON.stringify({ role: g.S.role, mode: g.S.mode, floor: g.S.floor, at: g.S.at, hp: g.S.hero && g.S.hero.hp, quest: g.S.quest && g.S.quest.boss, choices: g.choices().map((c) => c.id), title: page.title }),
});
