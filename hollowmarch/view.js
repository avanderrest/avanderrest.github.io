/* Hollowmarch: the screen. Draws what sim.js decides and turns clicks and keys into its
   verbs. Nothing in here changes the rules of the game. */

import {
  W, H, CASTLE, CASTLE_HP, GATES, GATE_NAMES, BUILD, ENEMIES, BUFFS, KNIGHT, UPGRADE_COST, MAX_LEVEL, SUBSTEP,
  idx, coords, info, isFixed, isBuilding, neighbours, toTokens, waveSummary, waveComposition, createGame,
} from './sim.js';
import { store } from '../lib/save.js';
import { frameLoop } from '../lib/loop.js';
import { expose } from '../lib/debug.js';

// ---------- constants ----------
// The game lived in crossroads-inn/ until 2026-09-24; its save carries across once.
const save = store('hollowmarch-save-v1', { was: ['crossroads-keep-v1'] });
// The speed button steps through these: normal, fast, then slow for a close look.
const SPEEDS = [1, 2, 0.5];

// ---------------------------------------------------------------------------
// Tile art. Emoji dragged the board towards the modern high street (the market read as a
// corner shop), so every building is drawn instead: thatch, timber, stone and steel in one
// palette. Inline SVG, no ids, sized in em by the CSS.
// ---------------------------------------------------------------------------
const ART = {
  wall: `<svg viewBox="0 0 24 24" aria-hidden="true">
    <g fill="#c3bcae"><rect x="1" y="8" width="22" height="12" rx="1"/>
    <rect x="1" y="5" width="4" height="4"/><rect x="7" y="5" width="4" height="4"/>
    <rect x="13" y="5" width="4" height="4"/><rect x="19" y="5" width="4" height="4"/></g>
    <g fill="#8b8376"><rect x="1" y="11.6" width="22" height="1"/><rect x="1" y="15.6" width="22" height="1"/>
    <rect x="8" y="8" width="1" height="3.6"/><rect x="16" y="8" width="1" height="3.6"/>
    <rect x="4.5" y="12.6" width="1" height="3"/><rect x="12" y="12.6" width="1" height="3"/><rect x="19" y="12.6" width="1" height="3"/>
    <rect x="8" y="16.6" width="1" height="3.4"/><rect x="16" y="16.6" width="1" height="3.4"/></g></svg>`,
  ballista: `<svg viewBox="0 0 24 24" aria-hidden="true">
    <g fill="#8a5f38"><path d="M11 12.6h2v8.4h-2z"/><path d="M6.2 21h11.6l-1 1.4H7.2z"/>
    <path d="M7.4 14.6h9.2l-1.1 2.4H8.5z"/></g>
    <g fill="none" stroke="#6d4a2c" stroke-width="1.8" stroke-linecap="round"><path d="M3.4 4.2c4 3.2 13.2 3.2 17.2 0"/></g>
    <g stroke="#c3bcae" stroke-width="1" stroke-linecap="round"><path d="M3.4 4.2 12 9.4"/><path d="M20.6 4.2 12 9.4"/></g>
    <g fill="#98a1ad"><path d="M12 2.2 13.3 6 12 12.4 10.7 6z"/></g>
    <g fill="#4a3f34"><rect x="2.6" y="3" width="1.6" height="2.6" rx="0.5"/><rect x="19.8" y="3" width="1.6" height="2.6" rx="0.5"/></g></svg>`,
  well: `<svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 1.4 21.6 7.4H2.4z" fill="#8a5f38"/>
    <path d="M12 3.6 18 7.4H6z" fill="#a06d40"/>
    <g fill="#6d4a2c"><rect x="4.6" y="7.4" width="1.8" height="9"/><rect x="17.6" y="7.4" width="1.8" height="9"/>
    <rect x="5.4" y="9.2" width="13.2" height="1.6" rx="0.8"/></g>
    <rect x="11.6" y="10.8" width="0.9" height="3" fill="#e6d9bd"/>
    <path d="M9.9 13.4h4.2l-.6 3.2h-3z" fill="#8a5f38"/>
    <path d="M3.6 15.8h16.8v4.6a1.2 1.2 0 0 1-1.2 1.2H4.8a1.2 1.2 0 0 1-1.2-1.2z" fill="#c3bcae"/>
    <g fill="#8b8376"><rect x="3.6" y="18.1" width="16.8" height="0.9"/><rect x="8" y="15.8" width="0.9" height="2.3"/><rect x="15.1" y="15.8" width="0.9" height="2.3"/>
    <rect x="11.6" y="19" width="0.9" height="2.6"/></g></svg>`,
  chapel: `<svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="11.4" y="0.6" width="1.2" height="4.4" fill="#e6d9bd"/>
    <rect x="9.8" y="2" width="4.4" height="1.2" fill="#e6d9bd"/>
    <path d="M12 4.8 19.4 11H4.6z" fill="#b5453c"/>
    <rect x="5.4" y="11" width="13.2" height="10" fill="#e6d9bd"/>
    <path d="M12 12.6a2.6 2.6 0 0 1 2.6 2.6V19h-5.2v-3.8A2.6 2.6 0 0 1 12 12.6z" fill="#7fa6d8"/>
    <g fill="#6d4a2c"><rect x="5.4" y="19.4" width="13.2" height="1.6"/><rect x="7" y="14" width="1.6" height="3.4" rx="0.6"/>
    <rect x="15.4" y="14" width="1.6" height="3.4" rx="0.6"/></g>
    <g fill="#8b8376"><rect x="4.2" y="21" width="15.6" height="1.4" rx="0.4"/></g></svg>`,
  demolish: `<svg viewBox="0 0 24 24" aria-hidden="true">
    <g transform="rotate(-38 12 11)"><rect x="11" y="4" width="2.1" height="13" rx="1" fill="#8a5f38"/>
    <rect x="6.4" y="2.2" width="11.2" height="5" rx="1" fill="#8f98a4"/>
    <rect x="6.4" y="2.2" width="2.6" height="5" rx="1" fill="#6f7883"/></g>
    <g fill="#9d9587"><rect x="2.4" y="18.6" width="6" height="3.2" rx="0.8"/><rect x="9.6" y="19.8" width="4.6" height="2" rx="0.6"/>
    <rect x="15.4" y="18.8" width="3.4" height="3" rx="0.7"/></g></svg>`,
};

// Painted sprites, cut from the Hollowmarch art sheets (see ASSETS.md). Anything without one
// keeps its drawing above, so the board never has a hole in it.
const spr = (dir, file) => `<img class="spr" src="assets/${dir}/${file}.png" alt="" draggable="false">`;
const ICON = Object.assign({}, ART);
for (const t of ['castle', 'gate', 'wall', 'tower', 'barracks', 'smithy', 'tavern', 'farm', 'house', 'market', 'mage']) ICON[t] = spr('build', t);
// All eleven of the horde are painted: a portrait for the rail, a token for the field.
// A new type without art keeps its emoji, so every render site reads `portrait || icon`.
const PORTRAIT = {}, SPRITE = {};
for (const t of ['goblin', 'orc', 'skeleton', 'wolf', 'troll', 'wraith', 'ogre', 'dragon', 'sapper', 'shaman', 'siege']) {
  PORTRAIT[t] = spr('enemy', `portrait-${t}`);
  SPRITE[t] = spr('enemy', t);
}
const icon = (t) => ICON[t] || '';
const portrait = (t) => PORTRAIT[t] || ENEMIES[t].icon;
const sprite = (t) => SPRITE[t] || ENEMIES[t].icon;

// ---------------------------------------------------------------------------
// State that only the screen cares about
// ---------------------------------------------------------------------------
let tool = 'wall';
let speed = 1;
let paused = false;
let showBuffs = false;
let previewCell = -1;
let castleFlash = 0;
let escapable = false;
let cellEls = [];
let centers = [];
const unitEls = new Map();   // 'e'+id / 'k'+id / 's'+id -> element on the fx layer

const game = createGame({ saved: save.load(), on: onEvent });
const S = () => game.state;
const loop = frameLoop(frame, { maxDt: 0.1 });

function onEvent(ev, data) {
  if (ev === 'keep-hit') castleFlash = 0.4;
  else if (ev === 'tile-lost') renderGrid();
  else if (ev === 'wave-end') waveEnded(data);
  else if (ev === 'game-over') fell(data);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function renderTop() {
  const s = S();
  $('stat-wave').textContent = game.sim ? `${s.wave}` : `${s.wave}${s.best ? ` · best ${s.best}` : ''}`;
  $('stat-gold').textContent = `${s.gold}g`;
  const hp = s.castleHp;
  const v = $('stat-castle');
  v.innerHTML = `${hp} / ${CASTLE_HP}<span class="hp-bar"><i style="width:${(hp / CASTLE_HP) * 100}%"></i></span>`;
  v.className = `value${hp <= CASTLE_HP / 4 ? ' low' : ''}`;
}

// Hotbar shortcuts. The buildings take the number row in the order they are
// declared; demolish takes X, wherever it happens to sit in the list.
const HOTKEYS = (() => {
  const row = '1234567890qwe';
  const map = {};
  let n = 0;
  for (const key of Object.keys(BUILD)) map[key] = key === 'demolish' ? 'x' : row[n++];
  return map;
})();

const PALETTE_GROUPS = [['defence', 'Defence'], ['village', 'Village'], ['tool', null]];

function renderPalette() {
  const host = $('palette');
  host.innerHTML = '';
  for (const [cat, label] of PALETTE_GROUPS) {
    const keys = Object.keys(BUILD).filter((k) => BUILD[k].cat === cat);
    if (!keys.length) continue;
    const group = el('div', 'palette-group');
    if (label) group.appendChild(el('span', 'palette-label', label));
    const tools = el('div', 'tools');
    for (const key of keys) {
      const b = BUILD[key];
      const btn = el('button', `btn tool t-${key}${tool === key ? ' active' : ''}`);
      btn.title = `${b.name} — ${HOTKEYS[key].toUpperCase()}`;
      btn.innerHTML = `<span class="icon">${icon(key)}</span><span class="name">${b.name}</span>` +
        `<span class="key">${HOTKEYS[key].toUpperCase()}</span>` +
        `<span class="cost${key !== 'demolish' && S().gold < b.cost ? ' short' : ''}">${key === 'demolish' ? '' : `${b.cost}g`}</span>` +
        `<span class="tool-desc"><b>${b.name}</b> &middot; ${b.desc}</span>`;
      btn.addEventListener('click', () => { tool = key; renderPalette(); });
      tools.appendChild(btn);
    }
    group.appendChild(tools);
    host.appendChild(group);
  }
  paintBuffs();
}

function layoutCells() {
  centers = cellEls.map((c) => [c.offsetLeft + c.offsetWidth / 2, c.offsetTop + c.offsetHeight / 2]);
}

function renderGrid() {
  const s = S();
  const host = $('grid');
  host.innerHTML = '';
  cellEls = [];
  for (let i = 0; i < W * H; i++) {
    const t = s.grid[i];
    const c = el('button', 'cell');
    if (t) {
      const b = info(t);
      c.classList.add('built', `t-${t}`);
      if (isFixed(t)) c.classList.add('fixed');
      const st = game.tileStats(i);
      if (st.power) c.classList.add('flag-sharp');
      if (st.haste) c.classList.add('flag-haste');
      if (b.kind === 'village' && st.gold > b.gold) c.classList.add('flag-rich');
      c.innerHTML = `<span class="icon">${icon(t)}</span>`;
      let lbl = b.name;
      if (b.kind === 'village') lbl = `${st.gold}g`;
      else if (t === 'barracks') lbl = `Barracks ${'I'.repeat(st.lvl)}`;
      else if (t === 'castle') lbl = 'The Keep';
      else if (t === 'gate') lbl = GATE_NAMES[i].replace('the ', '');
      c.appendChild(el('span', 'lbl', lbl));
      if (isBuilding(t)) {
        const bar = el('span', 'tile-hp');
        bar.appendChild(el('i'));
        c.appendChild(bar);
      }
    }
    c.addEventListener('click', () => onCell(i));
    c.addEventListener('mouseenter', () => { previewCell = i; hoverCell(i); paintBuffs(); });
    c.addEventListener('mouseleave', () => { if (previewCell === i) previewCell = -1; $('cell-hint').innerHTML = '&nbsp;'; paintBuffs(); });
    host.appendChild(c);
    cellEls.push(c);
  }
  layoutCells();
  renderPath();
  renderTileHp();
  paintBuffs();
  renderUnits();
  const built = s.grid.filter(isBuilding).length;
  const k = game.knights.length;
  $('capacity').textContent = `${built} tile${built === 1 ? '' : 's'} · ${game.income().total}g a wave · ${k} knight${k === 1 ? '' : 's'}`;
}

function renderPath() {
  const on = game.pathCells();
  for (let i = 0; i < W * H; i++) {
    const c = cellEls[i];
    const t = S().grid[i];
    c.classList.toggle('path', on.has(i) && !isBuilding(t));
    c.classList.toggle('path-bash', on.has(i) && isBuilding(t));
  }
}

function renderTileHp() {
  const s = S();
  for (let i = 0; i < W * H; i++) {
    const t = s.grid[i];
    if (!isBuilding(t)) continue;
    const bar = cellEls[i].querySelector('.tile-hp');
    if (!bar) continue;
    const frac = Math.max(0, s.hp[i]) / BUILD[t].hp;
    bar.classList.toggle('show', frac < 0.999);
    bar.firstChild.style.width = `${frac * 100}%`;
  }
}

// Buff badges on the board. Either every built tile shows what it is already getting
// (`showBuffs`), or the tile under a build tool previews what placing there would hand to
// its neighbours.
function paintBuffs() {
  if (!cellEls.length) return;
  const s = S();
  for (let i = 0; i < W * H; i++) {
    let b = cellEls[i].querySelector('.buffs');
    if (!b) { b = el('div', 'buffs'); cellEls[i].appendChild(b); }
    b.innerHTML = '';
    b.classList.remove('preview');
  }
  if (showBuffs) {
    for (let i = 0; i < W * H; i++) {
      const st = game.tileStats(i);
      if (!st || !st.buffs.length) continue;
      const b = cellEls[i].querySelector('.buffs');
      for (const t of st.buffs) b.appendChild(el('i', 'buff ' + t.cls, t.label));
    }
    return;
  }
  if (tool === 'demolish' || !BUILD[tool] || previewCell < 0 || s.grid[previewCell]) return;
  const T = tool;
  for (const j of neighbours(previewCell)) {
    const g = s.grid[j];
    if (!g) continue;
    const tokens = [];
    for (const bf of BUFFS) {
      if (bf.from !== T || !bf.to.includes(g)) continue;
      tokens.push(...toTokens(bf));
    }
    if (!tokens.length) continue;
    const b = cellEls[j].querySelector('.buffs');
    b.classList.add('preview');
    for (const t of tokens) b.appendChild(el('i', 'buff ' + t.cls, t.label));
  }
  const own = game.tileStats(previewCell, T);
  if (own && own.buffs.length) {
    const b = cellEls[previewCell].querySelector('.buffs');
    b.classList.add('preview');
    for (const t of own.buffs) b.appendChild(el('i', 'buff ' + t.cls, t.label));
  }
}

function hoverCell(i) {
  const s = S();
  const t = s.grid[i];
  let msg;
  if (t) {
    const b = info(t);
    const st = game.tileStats(i);
    const bits = [];
    if (b.kind === 'village') bits.push(`earns ${st.gold}g a wave`);
    if (b.kind === 'defence') bits.push(`${st.dmg.toFixed(0)} damage every ${st.rate.toFixed(1)}s, range ${b.range}`);
    if (t === 'barracks') {
      bits.push(`level ${st.lvl} · ${st.squad} knights with ${st.hp} hp, ${st.dmg.toFixed(0)} damage every ${st.rate.toFixed(1)}s, rally ${KNIGHT.rally} tiles`);
      if (st.lvl < MAX_LEVEL) bits.push(`click with the Barracks tool to upgrade for ${UPGRADE_COST[st.lvl]}g`);
    }
    if (isBuilding(t)) bits.push(`${Math.ceil(s.hp[i])} / ${b.hp} hp`);
    bits.push(...st.got);
    const gives = game.givesTo(i, t);
    if (gives.length) bits.push(`boosting ${gives.join(', ')}`);
    if (t === 'gate') bits.push(`the horde arrives by ${GATE_NAMES[i]}`);
    if (t === 'castle') bits.push('hold it or the game ends');
    msg = `<b>${b.name}</b>${bits.length ? ' · ' + bits.join(' · ') : ''}`;
  } else if (tool === 'demolish') {
    msg = 'Nothing to demolish here.';
  } else {
    const b = BUILD[tool];
    const st = game.tileStats(i, tool);
    const bits = [];
    if (b.kind === 'village') bits.push(`would earn ${st.gold}g a wave`);
    if (st.got.length) bits.push(...st.got);
    const gives = game.givesTo(i, tool);
    if (gives.length) bits.push(`would boost ${gives.join(', ')}`);
    if (game.pathCells().has(i)) bits.push('on the horde’s path');
    msg = `Build a <b>${b.name}</b> here for ${b.cost}g${bits.length ? ' · ' + bits.join(' · ') : ''}`;
  }
  $('cell-hint').innerHTML = msg;
}

function onCell(i) {
  const r = game.place(i, tool);
  if (!r.ok) { if (r.msg) flash('cell-hint', r.msg); return; }
  save.save(game.serialize());
  previewCell = -1;
  renderAll();
  hoverCell(i);
}

function flash(id, msg) { $(id).innerHTML = msg; }

function tallyText() {
  const sm = game.sim;
  return `${sm.slain} slain · ${sm.leaked} reached the keep${sm.knightsFallen ? ` · ${sm.knightsFallen} knights down` : ''}${sm.lost.length ? ` · lost ${sm.lost.length}` : ''}`;
}

function renderWave() {
  const s = S();
  const sm = game.sim;
  const host = $('guests');
  host.innerHTML = '';
  const n = s.wave;
  if (sm) {
    $('guest-count').textContent = `${sm.enemies.length} on the field, ${sm.queue.length} to come`;
    for (const row of sm.preview) {
      const card = el('div', `guest e-${row.type}`);
      card.innerHTML = `<div class="row"><span class="name">${portrait(row.type)} ${ENEMIES[row.type].name}</span><span class="tier">&times;${row.count}</span></div>`;
      host.appendChild(card);
    }
    const tally = el('div', 'guest tally');
    tally.innerHTML = `<div class="line">${tallyText()}</div>`;
    host.appendChild(tally);
  } else {
    const rows = waveSummary(n);
    const total = rows.reduce((a, r) => a + r.count, 0);
    $('guest-count').textContent = `wave ${n} · ${total} monsters`;
    for (const row of rows) {
      const e = ENEMIES[row.type];
      const card = el('div', `guest e-${row.type}`);
      card.innerHTML = `<div class="row"><span class="name">${portrait(row.type)} ${e.name}</span><span class="tier">&times;${row.count}</span></div>` +
        `<div class="line">${row.hp} hp · ${e.note} · ${e.dmg} damage to the keep</div>`;
      host.appendChild(card);
    }
  }
  const btn = $('btn-night');
  btn.disabled = !!sm || s.fallen;
  btn.textContent = sm ? `Wave ${n} in progress…` : `Sound the alarm: wave ${n}`;
  $('btn-speed').textContent = `Speed ×${speed === 0.5 ? '½' : speed}`;
  $('btn-speed').classList.toggle('active', speed !== 1);
  const hint = $('night-hint');
  if (sm) hint.textContent = 'You can still build while they come. Knights hold monsters in place; that is when your archers earn their keep.';
  else if (!s.grid.some(isBuilding) && n === 1) hint.textContent = 'The village is empty. Raise an archer tower and a farm, then sound the alarm. Ground monsters will stop to pillage any undefended farm, house, market, tavern or well that borders the road.';
  else if (game.sealedRoad()) hint.textContent = 'The horde will batter through the red-edged tile: every way round it is longer. Leave a road open or they will make one.';
  else hint.textContent = `The horde follows the dotted path from the ${GATES.length} roads to the keep. Walls bend it; knights from a barracks beside it stall it; towers finish it.`;
}

function renderLog(freshWave) {
  const host = $('reviews');
  host.innerHTML = '';
  const log = S().log;
  if (!log.length) { host.appendChild(el('p', 'empty', 'Nothing written yet. The first goblins are on the road.')); return; }
  for (const r of log) {
    const row = el('div', `review${r.wave === freshWave ? ' fresh' : ''}`);
    const cls = r.castleAtStart - r.castleHp >= 5 ? 'low' : (r.leaked === 0 ? 'high' : '');
    const gain = r.bounty + r.income;
    row.innerHTML = `<span class="stars ${cls}">Wave ${r.wave}</span>` +
      `<span><span class="who">${esc(r.who)}<small>${esc(r.trade)} · ${r.slain} slain${r.leaked ? `, ${r.leaked} through` : ''}${r.knightsFallen ? ` · ${r.knightsFallen} knights down` : ''}${r.lost.length ? ` · lost ${esc(r.lost.join(', '))}` : ''}</small></span> ` +
      `<span class="text">&ldquo;${esc(r.text)}&rdquo;</span></span>` +
      `<span class="pay plus">+${gain}g</span>`;
    host.appendChild(row);
  }
}

function renderAll(freshWave) {
  renderTop();
  renderPalette();
  renderGrid();
  renderWave();
  renderLog(freshWave);
}

// Live layer: enemies, knights and shots, positioned over the grid.
function clearFx() {
  $('fx').innerHTML = '';
  unitEls.clear();
  if (cellEls[CASTLE]) cellEls[CASTLE].classList.remove('hit');
}

function toPx(x, y) {
  const cw = cellEls[0].offsetWidth;
  const i = idx(Math.max(0, Math.min(W - 1, Math.round(x))), Math.max(0, Math.min(H - 1, Math.round(y))));
  const [cx, cy] = centers[i];
  const [ix, iy] = coords(i);
  const pitch = cellEls.length > 1 ? centers[1][0] - centers[0][0] : cw;
  return [cx + (x - ix) * pitch, cy + (y - iy) * pitch];
}

// Each live thing in the sim has an element on the fx layer; anything the sim no longer has
// loses its element here, so the sim never has to know elements exist.
function unitEl(key, make) {
  let e = unitEls.get(key);
  if (!e) { e = make(); $('fx').appendChild(e); unitEls.set(key, e); }
  return e;
}
function sweep(alive) {
  for (const [key, e] of unitEls) if (!alive.has(key)) { e.remove(); unitEls.delete(key); }
}

// Knights are drawn in and out of waves.
function renderUnits(alive = new Set()) {
  if (!cellEls.length) return;
  for (const k of game.knights) {
    const key = 'k' + k.id;
    alive.add(key);
    const e = unitEl(key, () => {
      const n = el('div', 'knight');
      n.innerHTML = `<span class="k-fig"><span class="k-helm"></span><span class="k-body"></span><span class="k-sword"></span></span><span class="k-pips"></span>`;
      return n;
    });
    const [x, y] = toPx(k.x, k.y);
    e.style.transform = `translate(${x}px, ${y}px)`;
    e.classList.toggle('fighting', k.state === 'fight');
    e.classList.toggle('swing', k.swing > 0);
    e.classList.toggle('dead', k.state === 'dead');
    e.classList.toggle('marching', k.state === 'march' || k.state === 'return');
    e.querySelector('.k-fig').classList.toggle('flip', k.facing < 0);
    const pips = e.querySelector('.k-pips');
    const total = Math.ceil(k.maxHp / 10);
    if (pips.children.length !== total) { pips.innerHTML = ''; for (let p = 0; p < total; p++) pips.appendChild(el('i')); }
    const lit = Math.ceil(k.hp / 10);
    for (let p = 0; p < total; p++) pips.children[p].classList.toggle('on', p < lit);
  }
  if (!game.sim) sweep(alive);
}

function renderSim() {
  const sm = game.sim;
  const cw = cellEls[0].offsetWidth;
  if (Math.abs(centers[0][0] - cw / 2 - cellEls[0].offsetLeft) > 1) layoutCells();
  const alive = new Set();
  for (const e of sm.enemies) {
    const key = 'e' + e.id;
    alive.add(key);
    const n = unitEl(key, () => {
      const m = el('div', `enemy e-${e.type}${e.flying ? ' flying' : ''}`);
      m.innerHTML = `<span class="e-icon">${sprite(e.type)}</span><span class="e-hp"><i></i></span>`;
      return m;
    });
    const [x, y] = toPx(e.x, e.y);
    n.style.transform = `translate(${x}px, ${y}px)`;
    n.classList.toggle('attacking', e.attacking && !e.blocked);
    n.classList.toggle('fighting', e.blocked);
    const pile = e.pile > 0;
    if (pile !== n.classList.contains('pile')) {
      n.classList.toggle('pile', pile);
      n.querySelector('.e-icon').innerHTML = pile ? '🦴' : sprite(e.type);
    }
    n.querySelector('i').style.width = `${Math.max(0, e.hp / e.maxHp) * 100}%`;
  }
  for (const p of sm.shots) {
    const key = 's' + p.id;
    alive.add(key);
    const n = unitEl(key, () => el('div', `shot ${p.kind}`));
    const k = Math.min(1, p.t / p.dur);
    const [x, y] = toPx(p.x0 + (p.x1 - p.x0) * k, p.y0 + (p.y1 - p.y0) * k);
    const ang = Math.atan2(p.y1 - p.y0, p.x1 - p.x0);
    n.style.transform = `translate(${x}px, ${y}px) rotate(${ang}rad)`;
  }
  renderUnits(alive);
  sweep(alive);
  renderTileHp();
  if (castleFlash > 0) { cellEls[CASTLE].classList.add('hit'); castleFlash -= 0.016; }
  else cellEls[CASTLE].classList.remove('hit');
  const s = S();
  $('stat-gold').textContent = `${s.gold}g`;
  $('stat-castle').innerHTML = `${s.castleHp} / ${CASTLE_HP}<span class="hp-bar"><i style="width:${(s.castleHp / CASTLE_HP) * 100}%"></i></span>`;
  $('guest-count').textContent = `${sm.enemies.length} on the field, ${sm.queue.length} to come`;
  const tally = $('guests').querySelector('.tally .line');
  if (tally) tally.textContent = tallyText();
}

// ---------------------------------------------------------------------------
// The wave on screen
// ---------------------------------------------------------------------------
function startWave() {
  const r = game.startWave();
  if (!r.ok) { if (r.msg) flash('cell-hint', r.msg); return; }
  renderAll();
  loop.start();
}

// Paused, a wave holds still where it is; the frame loop keeps drawing it.
function togglePause() {
  paused = !paused;
  const b = $('btn-pause');
  b.textContent = paused ? 'Carry on' : 'Pause';
  b.classList.toggle('on', paused);
}
function cycleSpeed() {
  speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
  renderWave();
}

function frame(dt) {
  if (!game.sim) { loop.stop(); return; }
  if (!paused && speed) game.step(dt * speed);
  if (game.sim) renderSim();
}

function waveEnded(entry) {
  loop.stop();
  clearFx();
  save.save(game.serialize());
  renderAll(entry.wave);
  const fromText = Object.entries(entry.from).map(([t, g]) => `${g}g ${BUILD[t].name.toLowerCase()}${g === 1 ? '' : 's'}`).join(', ');
  showOverlay(
    `<h2>Wave ${entry.wave} ${entry.leaked ? 'weathered' : 'held'}</h2>` +
    `<div class="big">${entry.slain} slain${entry.leaked ? ` · ${entry.leaked} reached the keep` : ''}</div>` +
    `<p>+${entry.bounty}g in loot · +${entry.income}g from the village${fromText ? ` (${fromText})` : ''}` +
    `${entry.knightsFallen ? `<br>${entry.knightsFallen} knight${entry.knightsFallen === 1 ? '' : 's'} fell and will be back on their feet by the next wave` : ''}` +
    `${entry.lost.length ? `<br>Lost: ${entry.lost.join(', ')}` : ''}</p>` +
    `<p class="quote">&ldquo;${esc(entry.text)}&rdquo;<br><span class="muted">&mdash; ${esc(entry.who)}, ${entry.trade}</span></p>` +
    `<button class="btn btn-primary" id="btn-morning">Back to work</button>`,
    null, true
  );
  $('btn-morning').addEventListener('click', hideOverlay);
}

function fell({ slain }) {
  loop.stop();
  clearFx();
  save.save(game.serialize());
  renderAll();
  const s = S();
  showOverlay(
    `<h2>The keep has fallen</h2>` +
    `<div class="big">Wave ${s.wave}</div>` +
    `<p>${slain} monsters slain this wave before the door gave way.<br>Best stand: wave ${s.best}.</p>` +
    `<button class="btn btn-primary" id="btn-restart">Rebuild the keep</button>`
  );
  $('btn-restart').addEventListener('click', () => { hideOverlay(); newGame(); });
}

// ---------------------------------------------------------------------------
// Overlays & boot
// ---------------------------------------------------------------------------
// `escapable` marks an overlay the player may dismiss with Escape or a click on the
// backdrop. The fallen-keep card is not one: there is nothing behind it to go back to.
function showOverlay(html, cls, canEscape) {
  const card = $('overlay-card');
  card.className = `overlay-card${cls ? ' ' + cls : ''}`;
  card.innerHTML = html;
  escapable = !!canEscape;
  $('overlay').hidden = false;
}
function hideOverlay() { $('overlay').hidden = true; escapable = false; }

function showHelp() {
  showOverlay(
    `<h2>How to hold the marches</h2>` +
    `<p>The horde walks the dotted road from the three gates to <b>the keep</b> in the far corner. Lose the keep and the game is over.</p>` +
    `<p>Almost everything you build boosts something beside it, and a good deal of it boosts the thing that boosts it back &mdash; a well feeds the farm, the farm supplies the tavern, the tavern fills the market, and the market pays the farm. Hover a slot in the hotbar to see what it gives and what it takes.</p>` +
    `<p><b>Walls</b> bend the road the long way round. <b>Towers</b>, <b>ballistae</b> and <b>mage towers</b> shoot what walks past. A <b>barracks</b> sends knights out to hold monsters still, which is when your archers earn their keep &mdash; click a barracks with the barracks tool again to upgrade it.</p>` +
    `<p>Seal every road and the horde will simply batter through the red-edged tile instead. Leave them a way in and make it a long one.</p>` +
    `<p>Everything on the hotbar is either <b>Defence</b> &mdash; walls, towers, ballistae, the mage tower, the barracks, the smithy and the chapel &mdash; or <b>Village</b> &mdash; the farm, tavern, house, market and well, the goldmakers. Ground monsters only want the keep, but anything of yours that borders the road they will stop and pillage. Burn a building and you simply build it again; losing the keep is the only defeat. Turn on <b>Buffs</b> in the top bar to see, on every tile, what its neighbours already give it, and hover a bare tile with a building chosen to preview what that spot would hand to the tiles beside it.</p>` +
    `<p><b>Keys:</b> ${Object.entries(HOTKEYS).map(([k, ch]) => `${ch.toUpperCase()} ${BUILD[k].name}`).join(' &middot; ')} &middot; Space sounds the alarm &middot; S cycles speed (×1, ×2, ×½).</p>` +
    `<button class="btn btn-primary" id="btn-help-close">Back to the walls</button>`,
    'help', true);
  $('btn-help-close').addEventListener('click', hideOverlay);
}

function newGame() {
  loop.stop();
  game.newGame();
  clearFx();
  tool = 'wall';
  previewCell = -1;
  save.save(game.serialize());
  renderAll();
}

$('btn-night').addEventListener('click', startWave);
$('btn-speed').addEventListener('click', () => { cycleSpeed(); });
$('btn-help').addEventListener('click', showHelp);
$('btn-buffs').addEventListener('click', () => {
  showBuffs = !showBuffs;
  $('btn-buffs').classList.toggle('active', showBuffs);
  $('btn-buffs').textContent = showBuffs ? 'Buffs on' : 'Buffs';
  paintBuffs();
});
$('overlay').addEventListener('click', (ev) => { if (escapable && ev.target === $('overlay')) hideOverlay(); });

// Hotbar keys, so a hand never has to leave the board for the build list.
window.addEventListener('keydown', (ev) => {
  if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
  if (!$('overlay').hidden) { if (ev.key === 'Escape' && escapable) hideOverlay(); return; }
  const k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
  const pick = Object.keys(HOTKEYS).find((t) => HOTKEYS[t] === k);
  if (pick) { tool = pick; renderPalette(); ev.preventDefault(); return; }
  // Space would also re-trigger whichever button still has focus.
  if (k === ' ') { ev.preventDefault(); if (document.activeElement !== $('btn-night')) startWave(); return; }
  if (k === 's') { cycleSpeed(); }
  if (k === 'p') { togglePause(); }
});
$('btn-pause').addEventListener('click', (e) => { e.currentTarget.blur(); togglePause(); });
$('btn-new').addEventListener('click', () => {
  if (S().wave > 1 && !S().fallen && !confirm('Abandon this keep and start again?')) return;
  hideOverlay();
  newGame();
});
window.addEventListener('resize', () => { layoutCells(); renderUnits(); });

save.save(game.serialize());
renderAll();
if (S().fallen) {
  showOverlay(`<h2>The keep has fallen</h2><div class="big">Wave ${S().wave}</div><p>Best stand: wave ${S().best}.</p>` +
    `<button class="btn btn-primary" id="btn-restart">Rebuild the keep</button>`);
  $('btn-restart').addEventListener('click', () => { hideOverlay(); newGame(); });
}

// The debug handle, for tests and the console.
expose('__hollowmarch', {
  game,
  state: () => game.state, sim: () => game.sim, flow: () => game.flow, knights: () => game.knights,
  place: (x, y, t) => { tool = t; onCell(idx(x, y)); },
  startWave, newGame, running: () => !!game.sim,
  setSpeed: (v) => { speed = v; }, W, H,
  // setSpeed(0) stops the frame loop moving a wave, so a test can step it by hand
  step: (sec) => { for (let t = 0; t < sec && game.sim; t += SUBSTEP) game.stepSim(SUBSTEP); },
  income: () => game.income(), waveComposition, BUILD, ENEMIES, CASTLE, GATES,
  text: () => JSON.stringify({ wave: S().wave, gold: S().gold, keep: S().castleHp, fallen: S().fallen, live: game.sim ? game.sim.enemies.length : null }),
});
