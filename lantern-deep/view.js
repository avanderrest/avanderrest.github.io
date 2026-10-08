/* Lantern Deep: the screen. The scroll tells the page, the dice strip shows every roll,
   the map shows the floor in pixel art with the hero walking the passages by lantern
   light, and the choices are buttons (or number keys). A choice goes to the sim; what
   happened goes to the book (tell.js) for a page, and, if the player has woken one, to the
   Dungeon Master (dm.js) to retell. Saving, sound and the debug handle live here too.
   Nothing in here changes the rules. */

import { createDelve, floorMenu, chooseQuest, questFor } from './sim.js';
import { CLASSES, SKILLS, WEAPONS, ITEMS, MONSTERS, THEMES, STAT_NAME, STATS, FLOORS, DIR_NAME, XP_AT, BOSSES } from './content.js';
import { tellPage } from './tell.js';
import { createDM, MODELS, gpuInfo } from './dm.js';
import { loadSheet, paintFloor, drawScene, iconCss, corridor, standAt, T } from './art.js';
import { mulberry32, newSeed } from '../lib/rng.js';
import { store, setting } from '../lib/save.js';
import { readSeed, writeSeed } from '../lib/seed.js';
import { createAudio } from '../lib/audio.js';
import { frameLoop } from '../lib/loop.js';
import { expose } from '../lib/debug.js';

// ---------- constants ----------
const save = store('lantern-deep-save-v1');
const seenHelp = setting('lantern-deep-seen-help', false);
const dmPref = setting('lantern-deep-dm', 'book');
const audio = createAudio('lantern-deep-sound');
const WALK = 9, RUN = 14;            // tiles a second along a passage
const SHORT_PAGE = 90;              // characters; shorter pages are not sent to the Dungeon Master
const VIEW_TILES = 17;                // map tiles across the canvas's shorter side, roughly
const GROUP_NAME = { skill: (pool) => (pool === 'Mana' ? 'Cast a spell…' : pool === 'Faith' ? 'Call on your god…' : 'Use a skill…'), item: () => 'Use an item…' };
const GROUP_ICON = { skill: 129, item: 115 };
const BOSS_MENU = BOSSES.map((key) => ({ key, name: MONSTERS[key].name, blurb: MONSTERS[key].blurb }));

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

// Before floor 1 (and the quest with it) or a new floor is generated, ask whoever is
// telling the story to plan it: the Dungeon Master if one is awake, otherwise the book,
// from the seed. Either way the floor's shape (which rooms have a foe, a feature, a stair
// guard) is already the dice's; only which allowed monster or feature fills each slot, and
// the one-line premise tying it to the quest, comes from this. Returns { quest, plan } —
// quest only set when needQuest is true (a fresh delve); plan is null when nothing planned
// it beyond the book's own default pick, which sim.js's makeFloor() already made.
async function planAhead(floorNo, needQuest) {
  let quest = needQuest ? null : g.S.quest;
  if (needQuest && dm.state === 'ready') {
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
async function choose(id) {
  if (busy) return false;
  let extra = null;
  if (id.startsWith('class:')) extra = await planAhead(1, true);
  else if (id === 'descend') extra = await planAhead(g.S.floor + 1, false);
  const res = g.act(id, extra);
  if (!res.ok) return false;
  openGroup = null;
  if (res.events.some((e) => e.t === 'new')) { writeSeed(g.S.seed); floorKey = ''; }
  lastRolls = res.events.filter((e) => e.t === 'roll' || e.t === 'foeroll');
  moveHero(res.events);
  effects(res.events);
  const facts = g.facts();
  const book = tellPage(facts, res.events, tellRnd());
  page = { ...book, labels: {}, by: 'book' };
  g.note(page); save.save(g.S);
  // a page of a line or two is left to the book: Phi-3 padded those out with things that were not there
  if (dm.state === 'ready' && g.S.mode !== 'create' && book.text.length >= SHORT_PAGE) {
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
  if (events.some((e) => e.t === 'descend' || e.t === 'begin' || e.t === 'new')) { placeHero(); return; }
  for (const e of events) {
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
  const foeX = (rm.x + rm.w / 2) * T, foeY = (rm.y + rm.h / 2) * T - T;
  let k = 0;
  for (const e of events) {
    const delay = k * 0.18;
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
function frame(dt) {
  time += dt;
  const S = g.S;
  const w = Math.round(canvas.clientWidth * devicePixelRatio), h = Math.round(canvas.clientHeight * devicePixelRatio);
  if (!w || !h) return;
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  if (!sheet || !S.map) { title(ctx, w, h); return; }
  const key = S.seed + ':' + S.floor + ':' + S.map.rooms.map((r) => (r.visited ? 1 : 0)).join('') + (S.map.revealed ? 'R' : '');
  if (key !== floorKey) { floorCanvas = paintFloor(S.map, sheet, S.floor); floorKey = key; }
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
  const tx = hero.x + T / 2, ty = hero.y + T / 2, k = Math.min(1, dt * 6);
  cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
  for (const f of fx) f.age += dt;
  while (fx.length && fx[0].age > fx[0].life) fx.shift();
  const fxNow = fx.filter((f) => f.age >= 0);
  const blessed = S.hero && S.hero.bless;
  drawScene(ctx, sheet, floorCanvas, { cam, scale: s, w, h, time }, {
    map: S.map, at: S.at, floor: S.floor, fight: S.mode === 'fight',
    hero: { x: hero.x, y: hero.y, sprite: CLASSES[S.hero.cls].sprite, flip: hero.flip, bob: hero.bob }, fx: fxNow,
  }, blessed ? 5.4 : 4.6);
}
function title(c, w, h) {
  c.fillStyle = '#0a080b'; c.fillRect(0, 0, w, h);
  const gr = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.min(w, h) * 0.55);
  const k = 0.9 + 0.08 * Math.sin(time * 7) + 0.04 * Math.sin(time * 19);
  gr.addColorStop(0, `rgba(255,170,80,${0.28 * k})`); gr.addColorStop(1, 'rgba(255,170,80,0)');
  c.fillStyle = gr; c.fillRect(0, 0, w, h);
  if (sheet) {
    const s = Math.max(3, Math.round(Math.min(w, h) / 70));
    c.imageSmoothingEnabled = false;
    const ids = Object.values(CLASSES).map((x) => x.sprite);
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
  $('#ld-title').textContent = page.title;
  renderDice();
  renderChoices();
  renderSheet();
  $('#ld-floor').textContent = S.map ? `Floor ${S.floor} of ${FLOORS} · ${THEMES[S.floor - 1].name}` : '';
  $('#ld-maplabel').textContent = S.map ? S.map.rooms[S.at].name.replace(/^the /, '') : '';
}
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
  } else {
    t.textContent = page.text;
    t.classList.remove('ld-streaming');
    t.style.opacity = 1;
    $('#ld-quill').hidden = true;
  }
}
function renderDice() {
  const box = $('#ld-dice'); box.innerHTML = '';
  const S = g.S;
  for (const r of lastRolls) {
    const foe = r.t === 'foeroll';
    const good = foe ? !r.ok : r.ok;
    const who = foe ? cap(MONSTERS[r.foe].name.replace(/^the /, '')) : r.what === 'attack' ? 'Attack' : `${(r.stat || '').toUpperCase()} ${r.what}`;
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
  const groups = {};
  for (const c of cs) if (c.group === 'skill' || c.group === 'item') (groups[c.group] = groups[c.group] || []).push(c);
  const rows = [];
  const seen = new Set();
  for (const c of cs) {
    const gname = c.group && groups[c.group] && groups[c.group].length >= 2 ? c.group : null;
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
      b.disabled = !!c.disabled || busy;
      b.onclick = () => choose(c.id);
    }
    b.innerHTML = `<span class="ld-num">${i + 1}</span><span class="ld-badge">${icon(ic, 28)}</span>` +
      `<span class="ld-label">${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ''}</span>` +
      (tag ? `<span class="ld-tag">${esc(tag)}${em ? `<em>${esc(em)}</em>` : ''}</span>` : '<span></span>');
    b.style.animationDelay = `${i * 0.04}s`;
    li.appendChild(b); list.appendChild(li);
  });
}
function renderSheet() {
  const S = g.S, H = S.hero;
  const portrait = $('#ld-portrait');
  $('.ld-sheet').classList.toggle('ld-empty', !H);
  if (!H) {
    $('#ld-name').textContent = 'Who goes down?';
    portrait.innerHTML = `<i style="position:absolute;left:8px;top:20px;width:96px;height:96px;${iconCss(29, 96)}"></i>`;
    for (const id of ['hp', 'pool', 'xp']) { $(`#ld-${id}`).textContent = ''; $(`#ld-${id}-fill`).style.width = '0'; }
    $('#ld-chips').innerHTML = `<span>Delves ${S.record.runs}</span><span>Won ${S.record.wins}</span><span>Deepest ${S.record.deepest || '—'}</span>`;
    $('#ld-stats').innerHTML = ''; $('#ld-bag').innerHTML = '';
    return;
  }
  const K = CLASSES[H.cls];
  $('#ld-name').textContent = `${H.name} · ${K.race} ${K.name} · Lv ${H.lvl}`;
  portrait.innerHTML = `<i style="position:absolute;left:8px;top:20px;width:96px;height:96px;${iconCss(K.sprite, 96)}"></i>`;
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
  const cols = innerWidth <= 760 ? 5 : innerWidth <= 1080 ? 6 : 4;
  while (slots.length % cols || slots.length < cols * 3) slots.push('<div class="ld-slot"></div>');
  $('#ld-bag').innerHTML = slots.join('');
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------- the Dungeon Master ----------
let dmLast = { state: 'off' };
function dmStatus(st) {
  dmLast = st;
  const pill = $('#ld-dm');
  pill.dataset.state = st.state;
  $('#ld-dm-label').textContent = st.state === 'ready' ? st.model.name : st.state === 'loading' ? `${st.model.name} ${Math.round((st.progress || 0) * 100)}%` : st.state === 'error' ? 'The book' : 'The book';
  if (!$('#ld-dialog').hidden && $('#ld-dialog').dataset.kind === 'dm') dmDialog();
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
  body.innerHTML = `<h2>Who tells the story?</h2>
    <p>The dice and the rules are always the game’s own. The storyteller only puts them into words. A <b>language model</b> can retell each page in its own voice and reword your choices. It runs entirely in this browser on your graphics card, so it is private, and it is free. It downloads once (the browser keeps it), and it takes a few seconds a page.</p>
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
$('#ld-dm').onclick = dmDialog;
$('#ld-skip').onclick = () => dm.skip();
$('#ld-dialog').addEventListener('click', (e) => { if (e.target.id === 'ld-dialog') closeDialog(); });
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { if (!$('#ld-dialog').hidden) closeDialog(); else if (openGroup) { openGroup = null; renderChoices(); } return; }
  if (!$('#ld-dialog').hidden || e.ctrlKey || e.metaKey || e.altKey) return;
  if (/^[1-9]$/.test(e.key)) {
    const b = document.querySelector(`.ld-choice[data-key="${e.key}"]`);
    if (b && !b.disabled) { e.preventDefault(); b.click(); }
  }
});
addEventListener('resize', () => renderSheet());

// ---------- start ----------
soundLabel();
placeHero();
render();
loadSheet().then((im) => { sheet = im; }).catch(() => console.warn('Lantern Deep: the tile sheet did not load'));
frameLoop(frame).start();
if (!seenHelp.get()) howTo();
if (dmPref.get() !== 'book') gpuInfo().then((gi) => { if (gi.ok) dm.load(dmPref.get()); });

expose('__lantern', {
  get S() { return g.S; }, sim: g, dm, choose,
  get page() { return page; }, get busy() { return busy; }, get planning() { return planning; }, get hero() { return hero; }, get lastReply() { return lastReply; },
  choices: () => g.choices(), facts: () => g.facts(), render,
  text: () => JSON.stringify({ mode: g.S.mode, floor: g.S.floor, at: g.S.at, hp: g.S.hero && g.S.hero.hp, quest: g.S.quest && g.S.quest.boss, choices: g.choices().map((c) => c.id), title: page.title }),
});
