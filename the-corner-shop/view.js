/* The Corner Shop: the screen. Paints the shop floor every frame (art.js), turns taps,
   clicks and keys into the keeper's verbs, opens the stockroom when you stand in its
   doorway, and works the till strip under the floor: run each item over the scanner,
   pack it, take the money. The rules are in sim.js. */

import {
  DAY_LENGTH, RENT, SHELF_COST, SEASON_LEN, SEASONS, DAYS, WEATHER, PRODUCTS, PERSONAS, FACINGS, TILL_SPOT,
  seasonOf, prod, clamp, money, plural, createShop,
} from './sim.js';
import { W, H, TW, TH, OX, OY, px, py, drawScene, loadGoods, facingRect, stockroomRect, counterRect, crateRect, slotRect } from './art.js';
import { store } from '../lib/save.js';
import { createAudio } from '../lib/audio.js';
import { frameLoop } from '../lib/loop.js';
import { expose } from '../lib/debug.js';

// ---------- constants ----------
// v2 is the shop floor (2026-10-14); v1 was the till game before it, and its shops carry
// across (sim.js loads both shapes). The game lived in corner-shop/ until 2026-09-24.
const save = store('the-corner-shop-save-v2', { was: ['the-corner-shop-save-v1', 'corner-shop-save-v1'] });
store('the-corner-shop-sound', { was: ['corner-shop-sound'] }).load();
const audio = createAudio('the-corner-shop-sound', false);
const STAGE_W = 1040;      // the stage (style.css .stage): the canvas shown 1040 wide, the till strip under it

const wxIco = (id) => '<img class="wx" src="assets/weather/' + id + '.png" alt="" />';
const snIco = (id) => '<img class="wx" src="assets/season/' + id + '.png" alt="" />';
const icoHtml = (p) => '<img class="spr" src="assets/goods/' + p.id + '.png" alt="" />';

// ---------- helpers ----------
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const inRect = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

// ---------- state the screen keeps ----------
let tab = 'orders';
let orderedTabOnce = true;   // back to Orders once each time the shop shuts
let held = null;        // item being dragged on the belt
let order = {};         // boxes picked in the Orders tab, not yet confirmed
let noteText = '';      // the latest message, shown in the box under the floor for a while
let noteUntil = 0;
let bannerMsg = '';     // what the shut-shop box says when there is no fresh message
let frozen = false;     // set from the test hook, so a test's own tick() is the only clock
let paused = false;
let hover = null;
let flash = 0;
let t = 0;

const shop = createShop({ saved: save.load(), on: onEvent });
const S = () => shop.state;
const D = () => shop.day;
const K = shop.keeper;
const persist = () => save.save(shop.serialize());

// ---------- dom ----------
const stageWrap = $('stage-wrap');
const stage = $('stage');
const canvas = $('floor');
const ctx = canvas.getContext('2d');
const beltEl = $('belt');
const scannerEl = $('scanner');
const bagEl = $('bag');
const bagItems = $('bag-items');
const receiptEl = $('receipt');
const tillTotal = $('till-total');
const coinsEl = $('coins');
const infoEl = $('info');
const bannerEl = $('banner');
const bannerText = $('banner-text');
const overlay = $('overlay');
const sideBody = $('side-body');

// The canvas is drawn at the screen's own pixel density, so the painted goods stay crisp.
function fit() {
  const s = stageWrap.clientWidth / STAGE_W;
  stage.style.transform = 'scale(' + s + ')';
  stageWrap.style.height = stage.offsetHeight * s + 'px';
  const dpr = Math.min(2, window.devicePixelRatio || 1) * Math.max(1, s);
  const cw = Math.round(W * Math.min(dpr, 2.5)), ch = Math.round(H * Math.min(dpr, 2.5));
  if (canvas.width !== cw) { canvas.width = cw; canvas.height = ch; }
}
window.addEventListener('resize', fit);
if (window.ResizeObserver) new ResizeObserver(fit).observe(stageWrap);

function note(text) {
  if (!text) return;
  // There is no line of its own for messages: they go in the box on the counter strip.
  // Shut, that is the banner (back to its standing words after a few seconds); open, it is
  // the information board, while you are away from the till.
  noteText = text;
  noteUntil = performance.now() + 5000;
  renderBanner();
}

// ---------- sound ----------
function tone(freq, dur, type, gain, delay) { audio.tone({ freq, dur, type: type || 'square', vol: gain || 0.05, delay: delay || 0, attack: 0.002 }); }
const SFX = {
  beep: () => tone(1240, 0.09, 'square', 0.04),
  clink: () => { tone(1760, 0.05, 'sine', 0.05); tone(2340, 0.08, 'sine', 0.035, 0.045); },
  chime: () => { tone(660, 0.12, 'sine', 0.06); tone(990, 0.18, 'sine', 0.06, 0.09); },
  thud: () => tone(120, 0.25, 'triangle', 0.08),
  pack: () => tone(300, 0.09, 'triangle', 0.05),
  bell: () => { tone(1568, 0.25, 'sine', 0.03); tone(2093, 0.3, 'sine', 0.02, 0.06); },
  ding: () => { tone(1318, 0.35, 'sine', 0.06); tone(1318, 0.3, 'sine', 0.04, 0.22); },
  box: () => tone(180, 0.12, 'triangle', 0.06),
  stack: () => tone(520 + Math.random() * 120, 0.04, 'triangle', 0.025),
};

// ---------- what the shop tells the screen ----------
function onEvent(ev, d) {
  switch (ev) {
    case 'note': note(d); break;
    case 'sfx': if (SFX[d]) SFX[d](); break;
    case 'hud': renderHud(); break;
    case 'coins': renderCoins(); renderReceipt(); break;
    case 'coin-taken': liftCoin(d); renderReceipt(); break;
    case 'till':
      dropHeld();
      renderBelt(); renderBag(); renderReceipt(); renderCoins();
      if (!shop.atTill()) note(d.name + ' is waiting at the till.');
      break;
    case 'scanned':
      flash = 0.25;
      scannerEl.classList.remove('flash');
      void scannerEl.offsetWidth;
      scannerEl.classList.add('flash');
      renderBelt();
      renderReceipt();
      if (held) {
        held.acted = true;
        const el = beltEl.querySelector('[data-uid="' + held.uid + '"]');
        if (el) { held.item = el; el.classList.add('lifted'); }
        held.ghost.classList.add('done');
      }
      break;
    case 'bagged':
      bagEl.classList.remove('drop');
      void bagEl.offsetWidth;
      bagEl.classList.add('drop');
      renderBelt(); renderBag(); renderReceipt();
      break;
    case 'paid':
      dropHeld();
      receiptEl.innerHTML = '<div class="idle">Paid ' + money(d.total) + '</div>';
      tillTotal.textContent = '';
      note(d.c.name + ': "' + d.text + '"');
      renderHud();
      persist();
      break;
    case 'walkout':
      dropHeld();
      receiptEl.innerHTML = '<div class="idle">Walked out</div>';
      break;
    case 'till-clear':
      renderBelt(); renderBag(); renderReceipt(); renderCoins();
      break;
    case 'closed': closed(d); break;
  }
}

// ---------- the floor: drawing ----------
function glow() {
  const g = {};
  const st = S();
  // a box can go on its own shelf, or on any shelf standing empty
  if (st.carry) g.facings = st.slots.map((pid, i) => ((pid === st.carry.pid && st.stock[i] < prod(pid).cap) || pid === null || (pid && !st.stock[i]) ? i : -1)).filter((i) => i >= 0);
  const c = D() && D().till;
  if (c && (c.state === 'till' || c.state === 'paying') && !shop.atTill()) g.till = true;
  if (!st.carry && st.phase !== 'evening' && st.phase !== 'over' && !g.till) {
    g.crates = [...new Set(st.slots.filter((pid, i) => pid && st.stock[i] < prod(pid).cap / 2 && shop.roomQty(pid) > 0))];
  }
  return g;
}
function draw() {
  const k = canvas.width / W;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.imageSmoothingEnabled = true;
  const day = D();
  const end = K.path.length ? K.path[K.path.length - 1] : null;
  drawScene(ctx, {
    state: S(), day, keeper: K, t, hover, glow: glow(), flash, crates: shop.crates(),
    // with a box: inside the stockroom every side that takes it is marked; from outside, just
    // the one under the pointer
    freeSlots: !S().carry ? null
      : shop.atRoom() ? S().pallets.map((x, k) => (shop.sideTakes(k) ? k : -1)).filter((k) => k >= 0)
        : hover && hover.slot != null && shop.sideTakes(hover.slot) ? [hover.slot] : null,
    tillText: day && day.total ? money(day.total) : '',
    target: end,
  });
}

// ---------- the floor: taps ----------
function toScene(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
}
// What is under a point on the floor: a shelf (front-most first), the counter, the
// stockroom, or just floor.
function hitTest(x, y) {
  const order = FACINGS.map((f, i) => i).sort((a, b) => FACINGS[b].y - FACINGS[a].y);
  for (const i of order) if (inRect(facingRect(i), x, y)) return { facing: i };
  for (let k = S().pallets.length - 1; k >= 0; k--) if (inRect(slotRect(k), x, y)) return { slot: k };
  if (inRect(counterRect(), x, y)) return { till: true };
  if (inRect(stockroomRect(), x, y)) return { room: true };
  return null;
}
function tapFloor(x, y) {
  const st = S();
  if (st.phase === 'evening' || st.phase === 'over') { note('The shop is shut for the night. Read the report, order, then start the next morning.'); return; }
  const hit = hitTest(x, y);
  if (!hit) { shop.walkTo((x - OX) / TW, (y - OY) / TH); return; }
  if (hit.till) { shop.goTill(); return; }
  if (hit.slot != null) {
    // with a box: put it down on that side; without: lift one off it
    const here = S().pallets[hit.slot];
    const r = S().carry ? shop.putDown(hit.slot) : here ? shop.pickUp(here.pid, hit.slot) : { ok: false, msg: 'Nothing on that side of the pallet.' };
    if (!r.ok) note(r.msg);
    return;
  }
  if (hit.room) { if (S().carry) shop.putDown(); else shop.goRoom(); return; }
  tapFacing(hit.facing);
}
function tapFacing(i) {
  const st = S();
  const pid = st.slots[i];
  if (pid === false) { offerShelf(i); return; }
  const r = shop.restock(i);
  if (r.ok) return;
  // nothing to stack or take: walk up to it anyway, and say what it needs
  const f = FACINGS[i];
  shop.walkTo(f.spot[0], f.spot[1]);
  const p = prod(pid || (st.carry && st.carry.pid));
  if (!p) { note(r.msg); return; }
  if (r.msg && !st.carry && pid && st.stock[i] < p.cap) note(p.name + ': ' + st.stock[i] + ' of ' + p.cap + ' on the shelf, ' + shop.roomQty(pid) + ' in the stockroom. ' + r.msg);
  else note(r.msg);
}
let press = null;
canvas.addEventListener('pointerdown', (e) => {
  if (!overlay.hidden) return;
  const p = toScene(e);
  press = { x: p.x, y: p.y };
});
canvas.addEventListener('pointerup', (e) => {
  if (!press) return;
  const p = toScene(e);
  if (Math.hypot(p.x - press.x, p.y - press.y) < 24) tapFloor(p.x, p.y);
  press = null;
});
canvas.addEventListener('pointercancel', () => { press = null; });
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  const p = toScene(e);
  hover = hitTest(p.x, p.y);
  canvas.style.cursor = hover ? 'pointer' : 'default';
});
canvas.addEventListener('pointerleave', () => { hover = null; });

// ---------- the floor: keys ----------
const held_keys = new Set();
const KEYMAP = { KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };
function steerFromKeys() {
  let dx = 0, dy = 0;
  for (const k of held_keys) { dx += KEYMAP[k][0]; dy += KEYMAP[k][1]; }
  shop.steer(dx, dy);
}
const typing = (e) => e.target.closest && e.target.closest('input, textarea, select');
window.addEventListener('keydown', (e) => {
  if (typing(e)) return;
  if (e.key === 'Escape') {
    dropHeld();
    if (!$('help').hidden) $('help').hidden = true;
    else if (!overlay.hidden && overlay.dataset.dismiss) hideOverlay();
    return;
  }
  if (!overlay.hidden || !$('help').hidden) return;
  if (e.code === 'KeyP') { togglePause(); return; }
  if (KEYMAP[e.code]) {
    e.preventDefault();
    if (!held_keys.has(e.code)) { held_keys.add(e.code); steerFromKeys(); }
    return;
  }
  if (e.code === 'KeyE' || e.code === 'Space' || e.code === 'Enter') {
    if (e.target.tagName === 'BUTTON' && e.code !== 'KeyE') return;
    e.preventDefault();
    if (S().phase === 'closed' && !bannerEl.hidden && e.code === 'Enter') { openShop(); return; }
    useKey();
  }
});
window.addEventListener('keyup', (e) => {
  if (KEYMAP[e.code] && held_keys.delete(e.code)) steerFromKeys();
});
window.addEventListener('blur', () => { held_keys.clear(); shop.steer(0, 0); });
// E / Space: at the till it serves (next item scanned, then bagged, then the money);
// anywhere else it works whatever you are standing at.
function useKey() {
  const day = D();
  if (shop.atTill() && day && day.till) {
    if (day.till.state === 'paying' && day.coins.length) { shop.takeCoin(day.coins[0].uid); return; }
    if (day.till.state === 'till') {
      const next = day.belt.find((x) => x.scanned) || day.belt[0];
      if (next) { if (next.scanned) shop.bagItem(next.uid); else shop.scanItem(next.uid); }
      return;
    }
  }
  const r = shop.interact();
  if (!r.ok) note(r.msg);
}

// ---------- shelves ----------
function offerShelf(i) {
  if (S().cash < SHELF_COST) { note('Another shelf costs ' + money(SHELF_COST) + '. Not enough in the tin yet.'); return; }
  showOverlay('Fit a shelf here?', '<p>A new ' + (FACINGS[i].kind === 'table' ? 'produce table' : FACINGS[i].kind === 'gondola' ? 'gondola shelf' : 'wall shelf') + ' costs ' + money(SHELF_COST) + '. Then bring a box out of the stockroom to fill it.</p>', [
    { label: 'Fit it · ' + money(SHELF_COST), fn: () => { const r = shop.buyShelf(i); note(r.msg); persist(); renderHud(); renderSide(); } },
    { label: 'Not now', cls: 'ghost' },
  ], true);
}
// ---------- money on the counter ----------
const INK = '#3b2a1b';
function moneySvg(m) {
  const face = '"Baloo 2", ui-rounded, system-ui, sans-serif';
  if (m.note) {
    return '<svg viewBox="0 0 62 36" aria-hidden="true"><rect x="2" y="2" width="58" height="32" rx="5" fill="' + m.fill + '" stroke="' + INK + '" stroke-width="2.6"/>' +
      '<rect x="6" y="6" width="50" height="24" rx="3" fill="none" stroke="' + m.edge + '" stroke-width="1.4" opacity=".8"/>' +
      '<circle cx="31" cy="18" r="10" fill="#ffffff" opacity=".35"/>' +
      '<text x="31" y="24" text-anchor="middle" font-size="15" font-weight="800" fill="' + m.ink + '" font-family=' + JSON.stringify(face) + '>' + m.label + '</text></svg>';
  }
  return '<svg viewBox="0 0 42 42" aria-hidden="true"><circle cx="21" cy="22" r="18.5" fill="' + m.edge + '" stroke="' + INK + '" stroke-width="2.6"/>' +
    '<circle cx="21" cy="20.2" r="17.2" fill="' + m.fill + '" stroke="' + INK + '" stroke-width="2.6"/>' +
    (m.ring ? '<circle cx="21" cy="20.2" r="10.5" fill="' + m.ring + '" stroke="' + INK + '" stroke-width="1.6"/>' : '') +
    '<text x="21" y="25" text-anchor="middle" font-size="' + (m.label.length > 2 ? 12 : 14) + '" font-weight="800" fill="' + m.ink + '" font-family=' + JSON.stringify(face) + '>' + m.label + '</text></svg>';
}
function renderCoins() {
  coinsEl.innerHTML = '';
  const list = (D() && D().coins) || [];
  coinsEl.hidden = !list.length;
  const cw = 420, ch = 104;   // the mat's size in .till
  for (const m of list) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'coin' + (m.note ? ' note' : '');
    b.dataset.uid = m.uid;
    b.style.width = m.w + 'px';
    b.style.left = (m.x * cw - m.w / 2) + 'px';
    b.style.top = (m.y * ch - (m.note ? m.w * 36 / 62 : m.w) / 2) + 'px';
    b.style.setProperty('--rot', m.rot + 'deg');
    b.title = 'Take the ' + m.label;
    b.innerHTML = moneySvg(m);
    coinsEl.appendChild(b);
  }
}
// Take just the one coin off the counter, so the rest do not replay their drop-in.
function liftCoin(uid) {
  const b = coinsEl.querySelector('.coin[data-uid="' + uid + '"]');
  if (!b) { renderCoins(); return; }
  b.style.pointerEvents = 'none';
  const done = () => { b.remove(); if (!coinsEl.querySelector('.coin')) coinsEl.hidden = true; };
  if (!b.animate) { done(); return; }
  const rot = 'rotate(' + (b.style.getPropertyValue('--rot') || '0deg') + ')';
  b.animate([
    { transform: rot, opacity: 1 },
    { transform: rot + ' translateY(-22px) scale(0.8)', opacity: 0 },
  ], { duration: 200, easing: 'ease-in', fill: 'forwards' }).onfinish = done;
}
coinsEl.addEventListener('click', (e) => {
  const b = e.target.closest('.coin');
  if (b && !shop.takeCoin(b.dataset.uid) && !shop.atTill()) note('Get at the till first.');
});

// ---------- the till ----------
function renderTillState() {
  const day = D();
  const c = day && day.till;
  const at = shop.atTill();
  // At the till you see the till. Anywhere else the strip is a board of what is going
  // on: what to do next, the shelves running low, the queue. Shut, the banner has it.
  const info = !at && bannerEl.hidden;
  if (infoEl.hidden === info) infoEl.hidden = !info;
  if (info) {
    const h = infoHtml();
    if (h !== lastInfo) { infoEl.innerHTML = h; lastInfo = h; }
  }
  const bar = $('patience-fill');
  const track = bar.parentElement;
  if (!c || c.state !== 'till') { bar.style.width = '0%'; track.classList.remove('on'); }
  else {
    track.classList.add('on');
    const f = clamp(c.patience / c.maxPatience, 0, 1);
    bar.style.width = f * 100 + '%';
    bar.className = 'patience-fill' + (f < 0.3 ? ' low' : f < 0.6 ? ' mid' : '');
  }
}
let lastInfo = '';
// What the keeper most needs to know right now, in one line, most urgent first.
const freshNote = () => (noteText && performance.now() < noteUntil ? noteText : '');
function setBanner(text) { bannerMsg = text; renderBanner(); }
function renderBanner() {
  const t = freshNote() || bannerMsg;
  if (bannerText.textContent !== t) bannerText.textContent = t;
}
function nextStep() {
  const st = S(), day = D(), c = day && day.till;
  if (c && (c.state === 'till' || c.state === 'paying')) {
    const n = c.basket.reduce((a, b) => a + b.q, 0);
    return { urgent: true, head: 'Someone is waiting at the till!', text: esc(c.name) + (c.state === 'paying' ? ' has put their money down.' : ' has ' + plural(n, 'thing') + ' to pay for.') + ' Get back to the counter.' };
  }
  if (freshNote()) return { said: true, head: esc(freshNote()), text: '' };
  if (st.phase === 'evening') return { head: 'Shut for the night', text: 'Read the report and order for tomorrow, then start the next morning.' };
  if (st.carry) {
    const p = prod(st.carry.pid);
    return { head: 'Carrying ' + st.carry.q + ' ' + esc(p.name.toLowerCase()), text: 'Tap a glowing shelf to stack it: its own, or any empty one.' };
  }
  if (shop.atRoom()) return { head: 'In the stockroom', text: S().carry ? 'Tap any free side of a pallet (marked) to put the box down there.' : 'Tap a stack of boxes (or press E beside it) to pick one up. Glowing stacks are for shelves running low.' };
  const on = st.slots.map((pid, i) => (pid ? { p: prod(pid), q: st.stock[i], room: shop.roomQty(pid) } : null)).filter(Boolean);
  const out = on.find((x) => !x.q && x.room);
  if (out) return { head: esc(out.p.name) + ' has sold out', text: out.room + ' in the stockroom. Fetch a box before someone comes in for it.' };
  const low = on.filter((x) => x.room && x.q < x.p.cap / 2).sort((a, b) => a.q / a.p.cap - b.q / b.p.cap)[0];
  if (low) return { head: esc(low.p.name) + ' is running low', text: low.q + ' of ' + low.p.cap + ' left on the shelf, ' + low.room + ' in the stockroom.' };
  const gone = on.find((x) => !x.q && !x.room);
  if (gone) return { head: 'No ' + esc(gone.p.name.toLowerCase()) + ' left anywhere', text: 'Order more on the Orders tab. Ordered while open, it comes tomorrow.' };
  return { head: 'All the shelves are stocked', text: 'Wait at the till. Somebody will be along.' };
}
function infoHtml() {
  const st = S(), day = D();
  const n = nextStep();
  let h = '<div class="info-main' + (n.urgent ? ' urgent' : '') + (n.said ? ' said' : '') + '"><b>' + n.head + '</b>' + (n.text ? '<span>' + n.text + '</span>' : '') + '</div>';
  // the four emptiest shelves
  const on = st.slots.map((pid, i) => (pid ? { p: prod(pid), q: st.stock[i] } : null)).filter(Boolean)
    .sort((a, b) => a.q / a.p.cap - b.q / b.p.cap).slice(0, 4);
  h += '<div class="info-low"><i>Lowest shelves</i><div>' + on.map((x) => '<span class="' + (!x.q ? 'out' : x.q < x.p.cap / 2 ? 'low' : '') + '">' + icoHtml(x.p) + '<b>' + x.q + '/' + x.p.cap + '</b></span>').join('') + '</div></div>';
  const people = day ? day.people : [];
  const shopping = people.filter((c) => c.state === 'walk' || c.state === 'browse' || c.state === 'wait').length;
  const queue = day ? day.queue.length + (day.till && day.till.state !== 'done' ? 1 : 0) : 0;
  h += '<div class="info-queue"><i>' + (st.phase === 'open' ? 'In the shop' : 'Shut') + '</i><span><b>' + shopping + '</b> shopping</span><span><b>' + queue + '</b> at the counter</span></div>';
  return h;
}
function renderBelt() {
  beltEl.innerHTML = '';
  const day = D();
  if (!day || !day.till || (day.till.state !== 'till')) return;
  for (const it of day.belt) {
    const d = document.createElement('div');
    d.className = 'item' + (it.scanned ? ' done' : '');
    d.dataset.uid = it.uid;
    d.title = it.scanned ? 'Rung up. Put it in the bag.' : 'Run it over the scanner.';
    d.innerHTML = '<span class="ico">' + icoHtml(it.p) + '</span><span class="tag">' + money(S().prices[it.p.id]) + '</span>';
    beltEl.appendChild(d);
  }
}
function renderBag() {
  bagItems.innerHTML = '';
  const day = D();
  if (!day) return;
  for (const it of day.bag) {
    const s = document.createElement('span');
    s.innerHTML = icoHtml(it.p);
    bagItems.appendChild(s);
  }
}
function renderReceipt() {
  const day = D();
  if (!day || !day.till || day.till.state === 'done') {
    receiptEl.innerHTML = '<div class="idle">' + (S().phase === 'open' ? 'Next please' : 'Closed') + '</div>';
    tillTotal.textContent = '';
    return;
  }
  const c = day.till;
  if (c.state === 'approach') { receiptEl.innerHTML = '<div class="idle">' + esc(c.name) + ' is coming</div>'; tillTotal.textContent = ''; return; }
  if (c.state === 'paying') {
    receiptEl.innerHTML = '<div class="idle">Take the money</div>';
    tillTotal.textContent = money(day.owed);
    return;
  }
  const toScan = day.belt.filter((x) => !x.scanned).length;
  const all = day.belt.length + day.bag.length;
  const done = day.bag.length + day.belt.filter((x) => x.scanned).length * 0.5;
  receiptEl.innerHTML = '<div class="idle">' + (toScan ? 'Scan ' + plural(toScan, 'item') : 'Bag it up') + '</div>' +
    (all ? '<i class="prog"><b style="width:' + Math.round((done / all) * 100) + '%"></b></i>' : '');
  tillTotal.textContent = day.rung.length ? money(day.total) : '';
}

// ---------- picking things up off the belt ----------
// Two ways, both ending the same: press on a thing and drag it, or click it to pick it up
// and it follows the pointer until you click again (Amber expected a click to lift it).
// Passing over the scanner rings it up; letting go (or clicking) over the bag packs it, and
// anywhere else it goes back on the belt.
function moveGhost(x, y) {
  if (!held) return;
  held.ghost.style.left = x + 'px';
  held.ghost.style.top = y + 'px';
}
function over(el, x, y) {
  const r = el.getBoundingClientRect();
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}
function dropHeld() {
  if (!held) return;
  held.ghost.remove();
  if (held.item) held.item.classList.remove('lifted');
  bagEl.classList.remove('over');
  document.body.classList.remove('carrying-item');
  held = null;
}
// the thing in hand passes over the scanner and the bag
function heldMove(x, y) {
  if (!held) return;
  moveGhost(x, y);
  if (over(scannerEl, x, y)) shop.scanItem(held.uid);
  if (!held) return;
  const it = D() && D().belt.find((i) => i.uid === held.uid);
  bagEl.classList.toggle('over', !!(it && it.scanned && over(bagEl, x, y)));
}
// let go of it: in the bag if it is over the bag, otherwise back on the belt
function heldDrop(x, y) {
  if (!held) return;
  const uid = held.uid;
  const inBag = over(bagEl, x, y);
  dropHeld();
  if (inBag) shop.bagItem(uid);
}
beltEl.addEventListener('pointerdown', (e) => {
  const item = e.target.closest('.item');
  const day = D();
  if (!item || held || !day || !day.till || day.till.state !== 'till') return;
  if (!shop.atTill()) { note('Get to the counter first.'); return; }
  e.preventDefault();
  e.stopPropagation();
  const it = day.belt.find((x) => x.uid === item.dataset.uid);
  const ghost = document.createElement('div');
  ghost.className = 'drag-ghost';
  ghost.innerHTML = icoHtml(it.p);
  document.body.appendChild(ghost);
  held = { uid: item.dataset.uid, item, ghost, x0: e.clientX, y0: e.clientY, moved: false, sticky: false, pid: e.pointerId };
  item.classList.add('lifted');
  if (item.classList.contains('done')) ghost.classList.add('done');
  moveGhost(e.clientX, e.clientY);
  try { beltEl.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
});
beltEl.addEventListener('pointermove', (e) => {
  if (!held || held.sticky) return;
  if (Math.abs(e.clientX - held.x0) > 6 || Math.abs(e.clientY - held.y0) > 6) held.moved = true;
  heldMove(e.clientX, e.clientY);
});
beltEl.addEventListener('pointerup', (e) => {
  if (!held || held.sticky) return;
  try { beltEl.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  // a click without a drag: it stays in your hand, following the pointer
  if (!held.moved) { held.sticky = true; document.body.classList.add('carrying-item'); return; }
  heldDrop(e.clientX, e.clientY);
});
beltEl.addEventListener('pointercancel', () => { if (held && !held.sticky) dropHeld(); });
// while it is in your hand after a click, it follows the pointer anywhere on the page
document.addEventListener('pointermove', (e) => { if (held && held.sticky) heldMove(e.clientX, e.clientY); });
document.addEventListener('pointerdown', (e) => {
  if (!held || !held.sticky) return;
  e.preventDefault();
  e.stopPropagation();
  heldMove(e.clientX, e.clientY);
  heldDrop(e.clientX, e.clientY);
}, true);
beltEl.addEventListener('dragstart', (e) => e.preventDefault());

// ---------- orders ----------
function confirmOrder() {
  const r = shop.confirmOrder(order);
  if (!r.ok) { if (r.msg) note(r.msg); return; }
  order = {};
  persist();
  renderHud(); renderSide();
  note(r.msg);
}

// ---------- the day's report ----------
function faceChip(look) {
  if (!look) return '';
  return '<span class="chip" style="--skin:' + look.skin + ';--hair:' + look.hairCol + ';--cloth:' + look.cloth + '"></span>';
}
function reportHtml(rep) {
  let h = '';
  h += rep.notes.length
    ? '<ul class="notes">' + rep.notes.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>'
    : '<p class="hint">Nothing worth writing down. Nobody grumbled, nobody went without.</p>';
  if (rep.remarks.length) {
    h += '<h3>What people said</h3><ul class="remarks">' +
      rep.remarks.slice().reverse().map((r) => '<li>' + faceChip(r.look) + '<b>' + esc(r.name) + ':</b> ' + esc(r.text) + '</li>').join('') + '</ul>';
  }
  return h;
}

// ---------- side panel ----------
function renderSide() {
  $('btn-morning').hidden = S().phase !== 'evening';
  // Orders are for when the door is shut (Amber): evening and morning. Open, the tab goes.
  const open = S().phase === 'open';
  document.querySelector('.tabs [data-tab="orders"]').hidden = open;
  if (open && tab === 'orders') tab = 'prices';
  if (!open && !orderedTabOnce) { tab = 'orders'; orderedTabOnce = true; }
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  if (tab === 'prices') renderPricesTab();
  else if (tab === 'orders') renderOrdersTab();
  else renderNotebookTab();
}
function renderPricesTab() {
  const st = S();
  let h = '<p class="hint">Cost is what you pay per unit. Customers know roughly what things should cost and put them back if you push it too far, though you will not hear about it until closing time.</p>';
  for (const pid of [...new Set(st.slots.filter(Boolean))]) {
    const p = prod(pid);
    const price = st.prices[pid];
    const sr = st.report && st.report.stats[pid];
    let fb = '';
    if (sr && sr.dear) fb = plural(sr.dear, 'person', 'people') + ' said too dear yesterday';
    else if (sr && sr.bought) fb = sr.bought + ' sold yesterday';
    h += '<div class="row"><span class="ico">' + icoHtml(p) + '</span><div class="grow"><b>' + esc(p.name) + '</b><span class="sm">Cost ' + money(p.cost) + ' &middot; margin ' + money(price - p.cost) + (fb ? ' &middot; ' + fb : '') + '</span></div>' +
      '<div class="stepper"><button type="button" data-price="' + pid + '" data-d="-1">&minus;</button><input type="text" inputmode="decimal" class="price-in" data-price="' + pid + '" value="' + price.toFixed(2) + '" aria-label="Price for ' + esc(p.name) + '"><button type="button" data-price="' + pid + '" data-d="1">+</button></div></div>';
  }
  sideBody.innerHTML = h;
  sideBody.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => {
    shop.nudgePrice(b.dataset.price, Number(b.dataset.d));
    persist();
    renderPricesTab();
    renderBelt();
  }));
  sideBody.querySelectorAll('.price-in').forEach((inp) => {
    inp.addEventListener('change', () => commitPrice(inp.dataset.price, inp.value));
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); });
  });
}
function commitPrice(pid, raw) {
  const n = Number(String(raw).replace(/[£,\s]+/g, ''));
  if (isFinite(n)) { shop.setPrice(pid, n); persist(); }
  renderPricesTab();
  renderBelt();
}
function renderOrdersTab() {
  const st = S();
  const tt = shop.orderTotal(order);
  let h = shop.sameDayDelivery()
    ? '<p class="hint">Nothing in the shop. Order what you want and you collect it yourself: it lands in the stockroom straight away, ready for today.</p>'
    : st.phase === 'evening'
      ? '<p class="hint">Order tonight and the van brings it first thing tomorrow, before you open. Fresh things only keep a few days in the stockroom.</p>'
      : '<p class="hint">Order now and the van catches you as you open up, straight into the stockroom. Order once you are open and it waits for tomorrow morning.</p>';
  const sn = seasonOf(st.day);
  const seasonal = PRODUCTS.filter((p) => p.season && p.season.includes(sn.id));
  h += '<p class="hint">' + snIco(sn.id) + ' <b>' + sn.name + '</b>, day ' + (((st.day - 1) % SEASON_LEN) + 1) + ' of ' + SEASON_LEN + '. ' +
    (seasonal.length ? 'In the wholesaler this season: ' + seasonal.map((p) => esc(p.name.toLowerCase())).join(', ') + '.' : 'Nothing seasonal on the list just now.') + '</p>';
  for (const van of [['Arriving when you open', st.arriving], ['Arriving tomorrow morning', st.pending]]) {
    if (!van[1].length) continue;
    h += '<div class="pending"><b>' + van[0] + ':</b> ' + van[1].map((o) => o.boxes + '&times; ' + esc(prod(o.pid).name.toLowerCase())).join(', ') + '</div>';
  }
  for (const p of PRODUCTS) {
    if (!shop.inSeason(p)) continue;
    const n = order[p.id] || 0;
    const onShelf = st.slots.includes(p.id);
    h += '<div class="row"><span class="ico">' + icoHtml(p) + '</span><div class="grow"><b>' + esc(p.name) + '</b><span class="sm">Box of ' + p.box + ' for ' + money(p.box * p.cost) + (p.life ? ' &middot; keeps ' + plural(p.life, 'day') : '') + ' &middot; ' + shop.roomQty(p.id) + ' in stock' + (onShelf ? '' : ' &middot; <b class="new">not on a shelf yet</b>') + '</span></div>' +
      '<div class="stepper"><button type="button" data-order="' + p.id + '" data-d="-1"' + (n ? '' : ' disabled') + '>&minus;</button><span>' + n + '</span><button type="button" data-order="' + p.id + '" data-d="1">+</button></div></div>';
  }
  h += '<div class="order-foot"><span>' + (tt.boxes ? plural(tt.boxes, 'box', 'boxes') + ' &middot; ' + money(tt.cost) + ' + ' + money(tt.fee) + ' delivery' : 'Nothing picked yet') + '</span>' +
    '<button type="button" class="primary" id="btn-order"' + (tt.boxes ? '' : ' disabled') + '>Order ' + (tt.boxes ? money(tt.cost + tt.fee) : '') + '</button></div>';
  sideBody.innerHTML = h;
  sideBody.querySelectorAll('[data-order]').forEach((b) => b.addEventListener('click', () => {
    const pid = b.dataset.order;
    order[pid] = clamp((order[pid] || 0) + Number(b.dataset.d), 0, 9);
    renderOrdersTab();
  }));
  $('btn-order').addEventListener('click', confirmOrder);
}
function renderNotebookTab() {
  const st = S();
  const rep = st.report;
  let h = '<p class="hint">' + esc(DAYS[shop.weekdayIndex()]) + ', ' + wxIco(st.weather) + ' ' + WEATHER[st.weather].name + '. Tomorrow looks ' + wxIco(st.nextWeather) + ' ' + WEATHER[st.nextWeather].name + '.</p>';
  h += '<h3>' + (rep ? 'Day ' + rep.day + ' ' + wxIco(rep.weather) : 'Last night') + '</h3>';
  h += rep ? reportHtml(rep) : '<p class="hint">Nothing written up yet. People keep their thoughts to themselves while they shop; you find out how the day went when you cash off.</p>';
  const rows = PRODUCTS.map((p) => ({ p, s: st.totals[p.id] })).filter((x) => x.s.wanted > 0).sort((a, b) => b.s.wanted - a.s.wanted);
  if (rows.length) {
    h += '<h3>All time</h3><table class="tally"><tr><th></th><th>wanted</th><th>sold</th><th>dear</th><th>none</th></tr>' +
      rows.map((x) => '<tr><td>' + icoHtml(x.p) + ' ' + esc(x.p.name) + '</td><td>' + x.s.wanted + '</td><td>' + x.s.bought + '</td><td>' + x.s.dear + '</td><td>' + (x.s.empty + x.s.missing) + '</td></tr>').join('') + '</table>';
  }
  sideBody.innerHTML = h;
}
document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; renderSide(); }));

// ---------- hud ----------
function renderHud() {
  const st = S();
  $('hud-cash').textContent = money(st.cash);
  $('hud-cash').classList.toggle('bad', st.cash < 0);
  $('hud-day').innerHTML = 'Day ' + st.day + ' · ' + DAYS[shop.weekdayIndex()].slice(0, 3) + ' · ' + snIco(seasonOf(st.day).id);
  $('hud-weather').innerHTML = wxIco(st.weather) + ' ' + WEATHER[st.weather].name;
  const stars = Math.round(st.rep / 20);
  $('hud-rep').textContent = '★'.repeat(stars) + '☆'.repeat(5 - stars);
  $('hud-rep').title = 'Reputation ' + Math.round(st.rep) + '/100';
  $('hud-served').textContent = st.today.served;
  renderClock();
}
function renderClock() {
  const el = $('hud-clock');
  const day = D();
  if (S().phase !== 'open' || !day) { el.textContent = S().phase === 'evening' ? 'Shut' : 'Closed'; return; }
  const f = clamp(day.t / DAY_LENGTH, 0, 1);
  const mins = 9 * 60 + f * 8 * 60;
  el.textContent = Math.floor(mins / 60) + ':' + String(Math.floor(mins) % 60).padStart(2, '0') + (day.t >= DAY_LENGTH ? ' · closing' : '');
}

// ---------- overlay ----------
function showOverlay(title, body, buttons, dismissible) {
  overlay.dataset.dismiss = dismissible ? '1' : '';
  $('overlay-title').textContent = title;
  $('overlay-body').innerHTML = body;
  const acts = $('overlay-actions');
  acts.innerHTML = '';
  for (const b of buttons) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = b.cls === 'ghost' ? 'ghost' : 'primary';
    btn.textContent = b.label;
    btn.addEventListener('click', () => { hideOverlay(); if (b.fn) b.fn(); });
    acts.appendChild(btn);
  }
  overlay.hidden = false;
  const first = acts.querySelector('.primary') || acts.firstChild;
  if (first) first.focus();
}
function hideOverlay() { overlay.hidden = true; }
overlay.addEventListener('click', (e) => { if (e.target === overlay && overlay.dataset.dismiss) hideOverlay(); });

// ---------- the day ----------
function openShop() {
  const r = shop.openShop();
  if (!r.ok) {
    note(r.msg);
    if (r.tab) { tab = r.tab; renderSide(); }   // only ever the Orders tab now
    return;
  }
  bannerEl.hidden = true;
  persist();
  renderHud(); renderReceipt(); renderSide();
  note(r.msg);
}
function closed(profit) {
  orderedTabOnce = false;
  dropHeld();
  held_keys.clear();
  persist();
  renderHud(); renderBelt(); renderBag(); renderReceipt(); renderCoins(); renderSide();
  showOverlay('Closing time, day ' + S().day, '<p>The door is locked and the last customer has gone. Count the till, then read how the day went and put in any orders.</p>', [
    { label: 'Cash up', fn: () => showSummary(profit) },
  ]);
}
function showSummary(profit) {
  const st = S();
  const td = st.today;
  const w = WEATHER[st.nextWeather];
  let h = '<table class="sheet">' +
    '<tr><td>Takings</td><td>' + money(td.takings) + '</td></tr>' +
    '<tr><td>Cost of what you sold</td><td>-' + money(td.cogs) + '</td></tr>' +
    '<tr><td>Rent</td><td>-' + money(RENT) + '</td></tr>' +
    '<tr class="tot"><td>Day\'s profit</td><td>' + money(profit) + '</td></tr>' +
    (td.spent ? '<tr><td>Spent on orders and shelves</td><td>-' + money(td.spent) + '</td></tr>' : '') +
    '<tr><td>Cash in the tin</td><td>' + money(st.cash) + '</td></tr></table>';
  const bits = [];
  bits.push(plural(td.served, 'customer') + ' served' + (td.quick ? ', ' + td.quick + ' of them quickly' : '') + '.');
  if (td.walked) bits.push(plural(td.walked, 'person', 'people') + ' gave up waiting at the till.');
  if (td.busy) bits.push(plural(td.busy, 'person', 'people') + ' left because the queue was too long.');
  if (td.nothing) bits.push(plural(td.nothing, 'person', 'people') + ' found nothing they wanted.');
  if (td.binned.length) bits.push('Binned overnight: ' + td.binned.map((b) => b.q + ' ' + prod(b.pid).name.toLowerCase()).join(', ') + '.');
  const dr = Math.round(st.rep - td.repStart);
  bits.push('Reputation ' + (dr >= 0 ? 'up ' : 'down ') + Math.abs(dr) + '.');
  h += '<ul>' + bits.map((b) => '<li>' + esc(b) + '</li>').join('') + '</ul>';
  if (st.report) h += '<h3>How it went</h3>' + reportHtml(st.report);
  if (st.pending.length) h += '<p>The van brings ' + st.pending.map((o) => o.boxes + ' box' + (o.boxes === 1 ? '' : 'es') + ' of ' + esc(prod(o.pid).name.toLowerCase())).join(', ') + ' in the morning.</p>';
  else h += '<p>Nothing on order. Whatever you order in the morning comes with the van as you open up.</p>';
  h += '<p class="forecast">Tomorrow looks <b>' + wxIco(st.nextWeather) + ' ' + w.name + '</b>. Check the notebook before you order.</p>';
  if (st.cash < 0) h += '<p class="warn">You are in the red. The landlord gives you one more morning to sort it.</p>';
  showOverlay('Day ' + st.day + ' report', h, [
    { label: 'Place orders', cls: 'ghost', fn: () => { tab = 'orders'; renderSide(); } },
    { label: 'Next morning', fn: morning },
  ]);
}
function morning() {
  const arrived = shop.morning();
  persist();
  renderAll();
  if (S().phase === 'over') { gameOver(); return; }
  setBanner((arrived ? 'The van dropped off ' + arrived + '. ' : '') +
    (shop.stockTotal() ? 'Carry the stock out to the shelves, check your prices, then open up.' : 'Nothing left in the shop. Order some stock in before you open.'));
  bannerEl.hidden = false;
  if (S().cash < 0) note('Rent is overdue. Get back above zero by tomorrow morning or the landlord closes you down.');
}
function gameOver() {
  const st = S();
  const total = st.days.reduce((a, d) => a + d.profit, 0);
  showOverlay('The landlord has changed the locks', '<p>Two mornings in the red was one too many. You kept the shop going for ' + plural(st.days.length, 'day') + ' and sold ' + plural(st.sold, 'thing') + ', for ' + money(total) + ' profit all told.</p>', [{ label: 'Start again', fn: resetGame }]);
}
function resetGame() {
  shop.reset();
  order = {};
  persist();
  renderAll();
  setBanner('A new shop, and not a tin on the shelves. Order your first stock on the Orders tab, carry it out of the stockroom, then open up.');
  bannerEl.hidden = false;
}
function renderAll() {
  renderHud(); renderBelt(); renderBag(); renderReceipt(); renderCoins(); renderSide();
  bannerEl.hidden = S().phase !== 'closed';
  renderTillState();
}

// ---------- wiring ----------
$('btn-open').addEventListener('click', openShop);
$('btn-help').addEventListener('click', () => { $('help').hidden = false; });
$('btn-help-close').addEventListener('click', () => { $('help').hidden = true; });
$('btn-reset').addEventListener('click', () => {
  if (window.confirm('Start a brand new shop? Your progress will be lost.')) resetGame();
});
$('btn-morning').addEventListener('click', morning);
function togglePause() {
  paused = !paused;
  $('btn-pause').textContent = paused ? 'Carry on' : 'Pause';
  $('btn-pause').setAttribute('aria-pressed', String(paused));
  document.body.classList.toggle('shop-paused', paused);
}
$('btn-pause').addEventListener('click', (e) => { e.currentTarget.blur(); togglePause(); });
function syncSound() {
  $('btn-sound').textContent = 'Sound: ' + (audio.on ? 'on' : 'off');
  $('btn-sound').setAttribute('aria-pressed', String(audio.on));
}
$('btn-sound').addEventListener('click', (e) => {
  e.currentTarget.blur();
  audio.toggle();
  syncSound();
  SFX.beep();
});

// ---------- boot ----------
loadGoods();
syncSound();
fit();
renderAll();
if (S().phase === 'over') gameOver();
else if (S().phase === 'evening') { bannerEl.hidden = true; $('btn-morning').hidden = false; }
else if (S().day === 1 && S().today.served === 0 && !S().days.length && !shop.stockTotal()) {
  setBanner('Your first morning, and the shop is empty. Order some stock on the Orders tab (you can collect the first lot yourself), carry it out to the shelves, then open up.');
  tab = 'orders';
  renderSide();
  $('help').hidden = false;
} else {
  setBanner(shop.stockTotal()
    ? 'Carry the stock out to the shelves, check your prices, then open up.'
    : 'Nothing left to sell. Order some stock in before you open.');
}

function tick(dt) {
  shop.tick(dt);
  renderClock();
}
frameLoop((dt) => {
  t += dt;
  if (flash > 0) flash -= dt;
  if (!frozen && !paused) tick(dt);
  renderTillState();
  if (!bannerEl.hidden) renderBanner();
  draw();
}, { maxDt: 0.1 }).start();

// The debug handle, for tests and the console.
expose('__shop', {
  shop, keeper: K,
  get state() { return S(); }, get day() { return D(); },
  PRODUCTS, PERSONAS, WEATHER, SEASONS, SEASON_LEN, FACINGS, TILL_SPOT,
  seasonOf, inSeason: (p, d) => shop.inSeason(p, d), rollWeather: (d) => shop.rollWeather(d),
  openShop, tick, draw, renderSide, renderHud, setTab: (x) => { tab = x; renderSide(); }, tapFacing,
  freeze: (on) => { frozen = !!on; }, crateRect, slotRect, W, H, px, py,
  scanItem: (uid) => shop.scanItem(uid), bagItem: (uid) => shop.bagItem(uid), takeCoin: (uid) => shop.takeCoin(uid),
  resetGame, morning,
  text: () => JSON.stringify({ day: S().day, phase: S().phase, cash: S().cash, rep: Math.round(S().rep), served: S().today.served, keeper: [K.x.toFixed(1), K.y.toFixed(1)], carry: S().carry, people: D() ? D().people.length : 0 }),
});
