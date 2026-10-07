/* The Corner Shop: the screen. Draws the painted shop, the lane of customers and the
   till, and turns clicks and drags into the shop's verbs. Most of the day you work the
   till: run each item over the scanner, pack it into the bag, take the money. The rules
   are in sim.js. */

import {
  DAY_LENGTH, RENT, START_CASH, MAX_SLOTS, SHELF_COST, SEASON_LEN, SEASONS, DAYS, WEATHER, PRODUCTS, PERSONAS, CAST,
  MONEY, seasonOf, prod, castOf, clamp, money, plural, createShop,
} from './sim.js';
import { store } from '../lib/save.js';
import { createAudio } from '../lib/audio.js';
import { frameLoop } from '../lib/loop.js';
import { expose } from '../lib/debug.js';

// ---------- constants ----------
// The game lived in corner-shop/ until 2026-09-24; its keys carry across once.
const save = store('the-corner-shop-save-v1', { was: ['corner-shop-save-v1'] });
store('the-corner-shop-sound', { was: ['corner-shop-sound'] }).load();   // moves the old sound key across
const audio = createAudio('the-corner-shop-sound', false);
// The scene's logical pixels are the painted room's own, so every position in the CSS can
// be read straight off the plate.
const SCENE_W = 1020;
// Everyone stands in one lane behind the counter, at these centre x's on the plate: the
// shelves, then the queue (front nearest the till), then the till. Moving up is a glide to
// the right; only arriving and leaving fade. The spots are evenly spaced, one person's
// width plus a little room apart.
const LANE = { browse: 152, front: 712, gap: 140, till: 852, exit: 1010 };
const WALK_SPEED = 200;      // plate px per second, so a long walk takes longer

// Painted icons for the weather and the seasons. WEATHER[x].ico stays the emoji for
// anything that only takes plain text (the note under the till).
const wxIco = (id) => '<img class="wx" src="assets/weather/' + id + '.png" alt="" />';
const snIco = (id) => '<img class="wx" src="assets/season/' + id + '.png" alt="" />';

// Every product is drawn. A new one with no art of its own keeps its emoji, so leave it
// out of this list and it still renders everywhere.
const GOODS_ART = new Set(PRODUCTS.map((p) => p.id));
const icoHtml = (p) => (GOODS_ART.has(p.id)
  ? '<img class="spr" src="assets/goods/' + p.id + '.png" alt="" />'
  : p.ico);

// the pose they leave on, and a nudge for the two the sheet drew off-scale
const AWAY = { edna: 'side', arthur: 'back', silas: 'back' };
const ZOOM = { 'leo-red': 0.82, silas: 0.94 };
const awayPose = (who) => AWAY[who] || 'walk';
// Rides on the element as a custom property the CSS multiplies its zoom by, so nobody
// towers over the counter.
function setChar(el, c) {
  const who = castOf(c);
  el.classList.toggle('art', !!who);
  el.style.setProperty('--fit', who && ZOOM[who] ? ZOOM[who] : 1);
}
function charHtml(c, pose) {
  const who = castOf(c);
  if (!who) return faceSvg(c.look);
  return '<img class="chr-art" src="assets/people/' + who + '-' + (pose || 'front') + '.png" alt="" />';
}

// ---------- helpers ----------
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------- drawing people ----------
// Anyone the painted cast does not cover is a little SVG portrait built out of the same
// parts: a body, a head, a hairstyle and whatever they happen to have on today.
const SKINS1 = '#f2c193', HAIRS1 = '#3f2a1b';
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (sh) => clamp(Math.round(((n >> sh) & 255) * f), 0, 255);
  return '#' + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1);
}
// Every part of a person is blocked in flat and then drawn round with the same fat marker
// line, so a shopper reads as one cut-out against the shop.
const INK = '#3b2a1b';
const OL = ' stroke="' + INK + '" stroke-width="2.6" stroke-linejoin="round"';
const OL_THIN = ' stroke="' + INK + '" stroke-width="1.7" stroke-linejoin="round"';

function hairBack(style, col, col2) {
  if (style === 'long') return '<path d="M17 54q0-33 33-33t33 33v40q-8-5-11-17-22 9-44 0-3 12-11 17z" fill="' + col + '"' + OL + '/>';
  if (style === 'bob') return '<path d="M18 54q0-33 32-33t32 33v24q-7-3-10-12-22 9-44 0-3 9-10 12z" fill="' + col + '"' + OL + '/>';
  if (style === 'pigtails') return '<circle cx="16" cy="60" r="12" fill="' + col + '"' + OL + '/><circle cx="84" cy="60" r="12" fill="' + col + '"' + OL + '/><circle cx="16" cy="60" r="6" fill="' + col2 + '" opacity=".5"/><circle cx="84" cy="60" r="6" fill="' + col2 + '" opacity=".5"/>';
  if (style === 'bun') return '<circle cx="50" cy="17" r="13" fill="' + col + '"' + OL + '/><circle cx="50" cy="17" r="7" fill="' + col2 + '" opacity=".45"/>';
  return '';
}
function hairFront(style, col, col2) {
  const cap = '<path d="M22 48q0-27 28-27t28 27q-4-13-16-11-14 3-24-3-9-5-16 14z" fill="' + col + '"' + OL + '/>';
  switch (style) {
    case 'bald':
      return '<path d="M25 38A28 31 0 0 1 30.3 74Q40 56 25 38z" fill="' + col + '"' + OL + '/>' +
        '<path d="M75 38A28 31 0 0 0 69.7 74Q60 56 75 38z" fill="' + col + '"' + OL + '/>';
    case 'spiky':
      return '<path d="M22 44q1-17 5-17l1 7 6-11 3 8 7-12 3 9 7-11 4 9 6-8 4 9 5-4 4 15q-27 8-55 6z" fill="' + col + '"' + OL + '/>';
    case 'curly':
      return '<g fill="' + col + '"' + OL + '><circle cx="26" cy="42" r="10"/><circle cx="38" cy="31" r="11"/><circle cx="52" cy="27" r="12"/><circle cx="66" cy="32" r="11"/><circle cx="76" cy="43" r="10"/></g>' +
        '<g fill="' + col2 + '" opacity=".35"><circle cx="38" cy="31" r="5"/><circle cx="66" cy="32" r="5"/></g>';
    case 'messy':
      return cap + '<path d="M28 34q6-10 14-6M62 27q9 3 11 13M46 24q4-8 12-6" stroke="' + col + '" stroke-width="5" stroke-linecap="round" fill="none"/>';
    case 'pigtails':
      return '<path d="M22 48q0-27 28-27t28 27q-6-16-28-16T22 48z" fill="' + col + '"' + OL + '/><path d="M50 21v14" stroke="' + col2 + '" stroke-width="2.5"/>';
    case 'short':
      return '<path d="M22 49q0-28 28-28t28 28q-3-15-19-16-6 6-18 6-9 0-19 10z" fill="' + col + '"' + OL + '/>';
    case 'bun':
    case 'crop':
    default:
      return cap;
  }
}
function hatSvg(kind, col) {
  switch (kind) {
    case 'hardhat':
      return '<path d="M22 40q0-27 28-27t28 27z" fill="#f2b705"' + OL + '/><path d="M50 13q5 9 5 27h-10q0-18 5-27z" fill="#ffd34d"/>' +
        '<rect x="12" y="37" width="76" height="8" rx="4" fill="#dda600"' + OL + '/>';
    case 'flatcap':
      return '<path d="M24 40q1-24 26-24t26 24z" fill="#8a7a63"' + OL + '/><path d="M24 40q26 8 52 0 2 8-6 10H30q-6 0-6-10z" fill="#6f6250"' + OL + '/>' +
        '<path d="M16 47q10-9 22-7-4 7-14 8z" fill="#7b6d59"' + OL + '/>';
    case 'beanie':
      return '<path d="M22 42q0-26 28-26t28 26z" fill="' + (col || '#c0563a') + '"' + OL + '/><rect x="19" y="37" width="62" height="11" rx="5.5" fill="' + shade(col || '#c0563a', 0.78) + '"' + OL + '/>';
    case 'bobble':
      return '<path d="M22 42q0-26 28-26t28 26z" fill="' + (col || '#e0574f') + '"' + OL + '/><rect x="19" y="37" width="62" height="11" rx="5.5" fill="' + shade(col || '#e0574f', 0.78) + '"' + OL + '/><circle cx="50" cy="11" r="8" fill="#fdf6e8"' + OL + '/>';
    case 'cap':
      return '<path d="M23 43q0-27 27-27t27 27z" fill="' + (col || '#4f9de0') + '"' + OL + '/>' +
        '<path d="M22 43h56v6H22z" fill="' + shade(col || '#4f9de0', 0.86) + '"/>' +
        '<path d="M22 43q22-4 40 1 14 4 16 12-20 4-56-3z" fill="' + shade(col || '#4f9de0', 0.7) + '"' + OL + '/>' +
        '<circle cx="50" cy="17" r="3" fill="' + shade(col || '#4f9de0', 0.7) + '"/>';
    case 'sun':
      return '<path d="M50 12q19 0 20 26H30q1-26 20-26z" fill="' + (col || '#f0dfae') + '"' + OL + '/>' +
        '<ellipse cx="50" cy="40" rx="38" ry="9" fill="' + (col || '#f0dfae') + '"' + OL + '/>' +
        '<ellipse cx="50" cy="38.5" rx="38" ry="8" fill="' + shade(col || '#f0dfae', 0.92) + '"/>' +
        '<path d="M31 32h38v6H31z" fill="' + shade(col || '#f0dfae', 0.72) + '"/>';
    default:
      return '';
  }
}
function faceSvg(look) {
  const L = look || {};
  const skin = L.skin || SKINS1;
  const skin2 = shade(skin, 0.86);
  const hair = L.hairCol || HAIRS1;
  const hair2 = shade(hair, 0.75);
  const cloth = L.cloth || '#7f8fa6';
  const cloth2 = shade(cloth, 0.8);
  const ink = INK;
  const dx = L.gaze || 0;
  const s = [];
  s.push('<svg class="chr" viewBox="0 0 100 124" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">');
  s.push('<g transform="rotate(' + (L.tilt || 0) + ' 50 84)' + (L.small ? ' translate(50 124) scale(.88) translate(-50 -124)' : '') + '">');
  // body and neck
  s.push('<path d="M42 76h16v20H42z" fill="' + skin2 + '"' + OL + '/>');
  s.push('<path d="M6 124q3-25 22-32l22-6 22 6q19 7 22 32z" fill="' + cloth + '"' + OL + '/>');
  if (L.collar === 'hivis') {
    s.push('<path d="M30 94l-6 30M70 94l6 30" stroke="#f4f7f9" stroke-width="6" fill="none" opacity=".95"/>');
    s.push('<path d="M18 112h64" stroke="#eef2f5" stroke-width="6" opacity=".85"/>');
  } else if (L.collar === 'tie') {
    s.push('<path d="M50 88l-14 6 9 11 5-7 5 7 9-11z" fill="#fdfaf3"' + OL + '/>');
    s.push('<path d="M50 98l-5 7 5 19 5-19z" fill="#b8483a"' + OL + '/>');
  } else if (L.collar === 'hoodie') {
    s.push('<path d="M27 92q23 15 46 0l5 9q-28 17-56 0z" fill="' + cloth2 + '"' + OL_THIN + '/>');
    s.push('<path d="M44 104v16M56 104v16" stroke="#f7efe2" stroke-width="3" stroke-linecap="round"/>');
  } else if (L.collar === 'cardigan') {
    s.push('<path d="M50 92l-10 32M50 92l10 32" stroke="' + cloth2 + '" stroke-width="4" fill="none"/>');
    s.push('<circle cx="50" cy="107" r="2.4" fill="#f7efe2"/><circle cx="50" cy="118" r="2.4" fill="#f7efe2"/>');
  } else if (L.collar === 'jumper') {
    s.push('<path d="M36 90q14 12 28 0l3 6q-17 14-34 0z" fill="' + cloth2 + '"' + OL_THIN + '/>');
  } else if (L.collar === 'tee') {
    s.push('<path d="M38 90q12 9 24 0l3 5q-15 12-30 0z" fill="' + cloth2 + '"' + OL_THIN + '/>');
  }
  // head
  s.push(hairBack(L.hair, hair, hair2));
  s.push('<ellipse cx="22" cy="56" rx="6" ry="8" fill="' + skin2 + '"' + OL + '/><ellipse cx="78" cy="56" rx="6" ry="8" fill="' + skin2 + '"' + OL + '/>');
  s.push('<ellipse cx="50" cy="52" rx="28" ry="31" fill="' + skin + '"' + OL + '/>');
  if (L.stubble) s.push('<path d="M22.9 60A28 31 0 0 0 77.1 60Q50 66 22.9 60z" fill="#2a2018" opacity=".26"/>');
  s.push(hairFront(L.hair, hair, hair2));
  // eyes
  s.push('<ellipse cx="38" cy="54" rx="7" ry="7.6" fill="#fffdf8"' + OL_THIN + '/><ellipse cx="62" cy="54" rx="7" ry="7.6" fill="#fffdf8"' + OL_THIN + '/>');
  s.push('<circle cx="' + (38 + dx) + '" cy="55" r="3.6" fill="#2a2018"/><circle cx="' + (62 + dx) + '" cy="55" r="3.6" fill="#2a2018"/>');
  s.push('<circle cx="' + (39.4 + dx) + '" cy="53" r="1.4" fill="#fff"/><circle cx="' + (63.4 + dx) + '" cy="53" r="1.4" fill="#fff"/>');
  // A mood overrides the face they walked in with: 'flat' is a polite nothing, 'sad'
  // droops the brows as well. Set when they see what is not on the shelf.
  const mood = L.mood || '';
  s.push('<path d="' + (mood === 'sad' ? 'M29 45q9-4 16-7M71 45q-9-4-16-7' : 'M30 42q8-5 15-1M70 42q-8-5-15-1') +
    '" stroke="' + hair2 + '" stroke-width="3.2" stroke-linecap="round" fill="none"/>');
  if (L.lines) s.push('<path d="M25 60q5 4 9 1M75 60q-5 4-9 1M31 46q5-3 10-1M69 46q-5-3-10-1" stroke="' + shade(skin, 0.68) + '" stroke-width="1.8" stroke-linecap="round" fill="none" opacity=".7"/>');
  // nose and mouth
  s.push('<path d="M50 57q4 5-2 8" stroke="' + skin2 + '" stroke-width="2.6" stroke-linecap="round" fill="none"/>');
  const mouth = mood === 'sad' ? 'frown' : mood === 'flat' ? 'line' : L.mouth;
  if (mouth === 'grin') s.push('<path d="M40 68q10 12 20 0z" fill="#8c4a45"' + OL_THIN + '/><path d="M41.6 69h16.8" stroke="#fffdf8" stroke-width="3.4"/>');
  else if (mouth === 'line') s.push('<path d="M43 71h14" stroke="' + ink + '" stroke-width="3" stroke-linecap="round"/>');
  else if (mouth === 'frown') s.push('<path d="M41 73q9-8 18 0" stroke="' + ink + '" stroke-width="3" stroke-linecap="round" fill="none"/>');
  else s.push('<path d="M41 68q9 8 18 0" stroke="' + ink + '" stroke-width="3" stroke-linecap="round" fill="none"/>');
  s.push('<ellipse cx="27" cy="65" rx="6" ry="4" fill="#e0736b" opacity=".26"/><ellipse cx="73" cy="65" rx="6" ry="4" fill="#e0736b" opacity=".26"/>');
  if (L.freckles) s.push('<g fill="' + shade(skin, 0.72) + '" opacity=".65"><circle cx="31" cy="62" r="1.3"/><circle cx="36" cy="65" r="1.3"/><circle cx="64" cy="65" r="1.3"/><circle cx="69" cy="62" r="1.3"/></g>');
  if (L.specs) {
    const round = L.specs === 'round';
    s.push('<g fill="none" stroke="#3b3b40" stroke-width="2.6" opacity=".9">' +
      (round ? '<circle cx="38" cy="54" r="10"/><circle cx="62" cy="54" r="10"/>'
        : '<rect x="27" y="46" width="22" height="16" rx="4"/><rect x="51" y="46" width="22" height="16" rx="4"/>') +
      '<path d="M48 54h4M27 52l-7-2M73 52l7-2"/></g>');
  }
  if (L.cans) s.push('<path d="M17 54a33 33 0 0 1 66 0" stroke="#3c3c44" stroke-width="5" fill="none"/><rect x="9" y="46" width="15" height="22" rx="7" fill="#3c3c44"/><rect x="76" y="46" width="15" height="22" rx="7" fill="#3c3c44"/>');
  s.push(hatSvg(L.hat, cloth));
  s.push('</g></svg>');
  return s.join('');
}

// ---------- state the screen keeps ----------
let tab = 'stock';
let held = null;    // item being dragged
let order = {};     // boxes picked in the Orders tab, not yet confirmed
let shelfPick = null;   // shelf layout being edited in the rearrange panel
let noteTimer = 0;
let frozen = false;   // set from the test hook, so a test's own tick() is the only clock
let paused = false;   // the Pause button: the clock and the queue stand still

const shop = createShop({ saved: save.load(), on: onEvent });
const S = () => shop.state;
const D = () => shop.day;
const persist = () => save.save(shop.serialize());

// ---------- dom ----------
const sceneWrap = $('scene-wrap');
const scene = $('scene');
const shelvesEl = $('shelves');
const browserEl = $('browser');
const browserThink = $('browser-think');
const clockHour = $('clock-hour');
const clockMin = $('clock-minute');
const queueEl = $('queue');
const windowArt = $('window-art');
const shopperEl = $('shopper');
const shopperBubble = $('shopper-bubble');
const beltEl = $('belt');
const scannerEl = $('scanner');
const bagEl = $('bag');
const bagItems = $('bag-items');
const receiptEl = $('receipt');
const tillTotal = $('till-total');
const coinsEl = $('coins');
const awayEl = $('away');
const bannerEl = $('banner');
const noteEl = $('note');
const overlay = $('overlay');
const sideBody = $('side-body');

function fit() {
  const s = sceneWrap.clientWidth / SCENE_W;
  scene.style.transform = 'scale(' + s + ')';
}
window.addEventListener('resize', fit);
if (window.ResizeObserver) new ResizeObserver(fit).observe(sceneWrap);

function note(text) {
  noteEl.textContent = text;
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => { if (noteEl.textContent === text) noteEl.textContent = ''; }, 4000);
}

const bubbleTimers = new Map();
function say(bubble, text, ms) {
  bubble.textContent = text;
  bubble.hidden = false;
  clearTimeout(bubbleTimers.get(bubble));
  bubbleTimers.set(bubble, setTimeout(() => { bubble.hidden = true; }, ms));
}
function hush(bubble) { clearTimeout(bubbleTimers.get(bubble)); bubble.hidden = true; }

// ---------- sound ----------
function tone(freq, dur, type, gain, delay) { audio.tone({ freq, dur, type: type || 'square', vol: gain || 0.05, delay: delay || 0, attack: 0.002 }); }
const SFX = {
  beep: () => tone(1240, 0.09, 'square', 0.04),
  clink: () => { tone(1760, 0.05, 'sine', 0.05); tone(2340, 0.08, 'sine', 0.035, 0.045); },
  chime: () => { tone(660, 0.12, 'sine', 0.06); tone(990, 0.18, 'sine', 0.06, 0.09); },
  thud: () => tone(120, 0.25, 'triangle', 0.08),
  pack: () => tone(300, 0.09, 'triangle', 0.05),
};

// ---------- what the shop tells the screen ----------
function onEvent(ev, d) {
  switch (ev) {
    case 'note': note(d); break;
    case 'sfx': if (SFX[d]) SFX[d](); break;
    case 'hud': renderHud(); break;
    case 'shelves': renderShelves(); break;
    case 'stock': if (tab === 'stock') renderSide(); if (S().phase !== 'open') persist(); break;
    case 'receipt': renderReceipt(); break;
    case 'coins': renderCoins(); break;
    case 'coin-taken': liftCoin(d); break;
    case 'queue': renderQueue(); break;
    case 'browser': {
      const c = d;
      c.x = LANE.browse;
      browserEl.hidden = false;
      browserEl.className = 'browser in';
      $('browser-face').innerHTML = charHtml(c);
      setChar(browserEl, c);
      $('browser-name').textContent = c.name;
      hideThought();
      break;
    }
    case 'thought': showThought(d.think); break;
    case 'mood': $('browser-face').innerHTML = charHtml(d); setChar(browserEl, d); break;
    case 'browser-gone':
      hideThought();
      if (d.leaving) leaveLane(d.c);
      browserEl.className = 'browser';
      browserEl.hidden = true;
      break;
    case 'till': {
      const c = d;
      dropHeld();
      shopperEl.hidden = false;
      shopperEl.className = 'shopper';
      $('shopper-face').innerHTML = charHtml(c);
      setChar(shopperEl, c);
      glide(shopperEl, c, LANE.till);
      $('shopper-name').textContent = c.name;
      hush(shopperBubble);
      renderBelt(); renderBag(); renderReceipt(); renderCoins(); renderQueue();
      break;
    }
    case 'scanned': {
      scannerEl.classList.remove('flash');
      void scannerEl.offsetWidth;
      scannerEl.classList.add('flash');
      renderBelt();
      renderReceipt();
      if (held) {
        // renderBelt rebuilt the row, so pick the item's new element back up
        held.acted = true;
        const el = beltEl.querySelector('[data-uid="' + held.uid + '"]');
        if (el) { held.item = el; el.classList.add('lifted'); }
        held.ghost.classList.add('done');
      }
      break;
    }
    case 'bagged':
      bagEl.classList.remove('drop');
      void bagEl.offsetWidth;
      bagEl.classList.add('drop');
      renderBelt(); renderBag(); renderReceipt();
      break;
    case 'paid':
      dropHeld();
      say(shopperBubble, d.text, 900);
      receiptEl.innerHTML = '<div class="idle">Paid ' + money(d.total) + '</div>';
      tillTotal.textContent = '';
      renderHud();
      persist();
      break;
    case 'walkout':
      say(shopperBubble, d.text, 900);
      dropHeld();
      renderBelt(); renderBag();
      receiptEl.innerHTML = '<div class="idle">Walked out</div>';
      break;
    case 'till-turn': {
      // turn them round as they go, and keep the art class, or the sprite would drop back
      // to the bust's anchoring halfway through leaving
      const who = castOf(d);
      if (who) $('shopper-face').innerHTML = charHtml(d, awayPose(who));
      shopperEl.classList.remove('in');
      shopperEl.classList.add('out');
      break;
    }
    case 'till-clear':
      shopperEl.hidden = true;
      hush(shopperBubble);
      renderBelt(); renderBag(); renderReceipt();
      break;
    case 'away':
      awayEl.hidden = false;
      $('away-text').textContent = 'Fetching ' + prod(d.pid).name.toLowerCase() + ' from the stockroom...';
      dropHeld();
      break;
    case 'away-done': awayEl.hidden = true; break;
    case 'closed': closed(d); break;
  }
}

// ---------- browsing ----------
function showThought(m) {
  const p = m ? m.p : null;
  browserThink.innerHTML = (m && m.why === 'dear')
    ? '<span class="ico">£</span>'
    : '<span class="ico">' + icoHtml(p) + '</span><span class="what">' + esc(p.name) + '</span>';
  browserThink.hidden = false;
}
function hideThought() { browserThink.hidden = true; browserThink.innerHTML = ''; }

// ---------- money on the counter ----------
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
  for (const m of list) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'coin' + (m.note ? ' note' : '');
    b.dataset.uid = m.uid;
    b.style.width = m.w + 'px';
    b.style.left = (m.x - m.w / 2) + 'px';
    b.style.top = (m.y - (m.note ? m.w * 36 / 62 : m.w) / 2) + 'px';
    b.style.setProperty('--rot', m.rot + 'deg');
    b.title = 'Take the ' + m.label;
    b.innerHTML = moneySvg(m);
    coinsEl.appendChild(b);
  }
}
// Take just the one coin off the counter. Rebuilding the pile would replay every other
// coin's drop-in, so the rest would blink on each pick-up.
function liftCoin(uid) {
  const b = coinsEl.querySelector('.coin[data-uid="' + uid + '"]');
  if (!b) { renderCoins(); return; }
  b.style.pointerEvents = 'none';
  const done = () => {
    b.remove();
    if (!coinsEl.querySelector('.coin')) coinsEl.hidden = true;
  };
  if (!b.animate) { done(); return; }
  const rot = 'rotate(' + (b.style.getPropertyValue('--rot') || '0deg') + ')';
  b.animate([
    { transform: rot, opacity: 1 },
    { transform: rot + ' translateY(-22px) scale(0.8)', opacity: 0 },
  ], { duration: 200, easing: 'ease-in', fill: 'forwards' }).onfinish = done;
}
coinsEl.addEventListener('click', (e) => {
  const b = e.target.closest('.coin');
  if (b) shop.takeCoin(b.dataset.uid);
});

// ---------- the till ----------
function renderPatience() {
  const c = D() && D().till;
  const bar = $('patience-fill');
  const track = bar.parentElement;
  if (!c || c.state !== 'till') { bar.style.width = '0%'; track.classList.remove('on'); return; }
  track.classList.add('on');
  const f = clamp(c.patience / c.maxPatience, 0, 1);
  bar.style.width = f * 100 + '%';
  bar.className = 'patience-fill' + (f < 0.3 ? ' low' : f < 0.6 ? ' mid' : '');
}
function renderBelt() {
  beltEl.innerHTML = '';
  if (!D()) return;
  for (const it of D().belt) {
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
  if (!D()) return;
  for (const it of D().bag) {
    const s = document.createElement('span');
    s.innerHTML = icoHtml(it.p);
    bagItems.appendChild(s);
  }
}
function renderReceipt() {
  const day = D();
  receiptEl.innerHTML = '';
  if (!day || !day.till) {
    receiptEl.innerHTML = '<div class="idle">' + (S().phase === 'open' ? 'Next customer please' : 'Closed') + '</div>';
    tillTotal.textContent = '';
    return;
  }
  if (day.till.state === 'paying') {
    receiptEl.innerHTML = '<div class="idle">Cash ' + money(day.total) + '</div><div class="idle">Take the money</div>';
    tillTotal.textContent = money(day.owed);
    return;
  }
  const lines = day.rung.slice(-4);
  for (const it of lines) {
    const d = document.createElement('div');
    d.innerHTML = '<span>' + esc(it.p.name) + '</span><span>' + money(S().prices[it.p.id]) + '</span>';
    receiptEl.appendChild(d);
  }
  const toScan = day.belt.filter((x) => !x.scanned).length;
  if (!lines.length) receiptEl.innerHTML = '<div class="idle">Scan ' + plural(day.belt.length, 'item') + '</div>';
  else if (day.belt.length) {
    const d = document.createElement('div');
    d.className = 'idle';
    d.textContent = toScan ? plural(toScan, 'item') + ' still to scan' : 'Bag it up';
    receiptEl.appendChild(d);
  }
  tillTotal.textContent = day.rung.length ? money(day.total) : '';
}

// ---------- dragging ----------
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
  held = null;
}
beltEl.addEventListener('pointerdown', (e) => {
  const item = e.target.closest('.item');
  const day = D();
  if (!item || held || !day || day.away > 0 || !day.till || day.till.state !== 'till') return;
  e.preventDefault();
  const ghost = item.cloneNode(true);
  ghost.classList.add('drag-ghost');
  ghost.classList.remove('lifted');
  document.body.appendChild(ghost);
  held = { uid: item.dataset.uid, item, ghost, x0: e.clientX, y0: e.clientY, acted: false };
  item.classList.add('lifted');
  if (item.classList.contains('done')) ghost.classList.add('done');
  moveGhost(e.clientX, e.clientY);
  try { beltEl.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
});
beltEl.addEventListener('pointermove', (e) => {
  if (!held) return;
  moveGhost(e.clientX, e.clientY);
  if (over(scannerEl, e.clientX, e.clientY)) shop.scanItem(held.uid);
  if (!held) return;
  const it = D().belt.find((x) => x.uid === held.uid);
  bagEl.classList.toggle('over', !!(it && it.scanned && over(bagEl, e.clientX, e.clientY)));
});
beltEl.addEventListener('pointerup', (e) => {
  if (!held) return;
  const uid = held.uid;
  const it = D().belt.find((x) => x.uid === uid);
  const scanned = !!(it && it.scanned);
  const inBag = over(bagEl, e.clientX, e.clientY);
  // a tap works as well as a drag: once to ring it up, again to pack it
  const tap = !held.acted && Math.abs(e.clientX - held.x0) < 6 && Math.abs(e.clientY - held.y0) < 6;
  dropHeld();
  if (inBag) shop.bagItem(uid);
  else if (tap) { if (scanned) shop.bagItem(uid); else shop.scanItem(uid); }
});
beltEl.addEventListener('pointercancel', dropHeld);
beltEl.addEventListener('dragstart', (e) => e.preventDefault());

// ---------- shelves and stock ----------
function renderShelves() {
  const state = S();
  shelvesEl.innerHTML = '';
  for (let i = 0; i < state.slots.length; i++) {
    const pid = state.slots[i];
    const d = document.createElement('button');
    d.type = 'button';
    d.className = 'slot';
    d.dataset.index = i;
    if (!pid) {
      d.classList.add('blank');
      d.innerHTML = '<span class="ico">+</span><span class="nm">empty</span>';
      d.title = 'Choose what goes here';
    } else {
      const p = prod(pid);
      const q = state.shelf[pid];
      if (q === 0) d.classList.add('empty');
      let pips = '';
      for (let k = 0; k < p.cap; k++) pips += '<i class="' + (k < q ? 'on' : '') + '"></i>';
      d.innerHTML = '<span class="ico">' + (q ? icoHtml(p) : '') + '</span><span class="nm">' + esc(p.name) + '</span><span class="pips">' + pips + '</span><span class="price">' + money(state.prices[pid]) + '</span>';
      d.title = p.name + ': ' + q + ' of ' + p.cap + ' on the shelf, ' + shop.roomQty(pid) + ' in the stockroom';
    }
    shelvesEl.appendChild(d);
  }
  shelvesEl.className = 'shelves rows-' + Math.ceil(state.slots.length / 4);
}
shelvesEl.addEventListener('click', (e) => {
  const slot = e.target.closest('.slot');
  if (!slot) return;
  const state = S();
  const i = Number(slot.dataset.index);
  const pid = state.slots[i];
  if (state.phase === 'open') {
    if (pid) restock(pid);
    else note('Rearrange the shelves once you have closed for the day.');
  } else if (state.phase === 'closed') {
    // before you open, a click tops the shelf up; there is nothing to top up on a full or
    // empty-stockroom shelf, so that is when you get the chooser
    if (pid && state.shelf[pid] < prod(pid).cap && shop.roomQty(pid) > 0) restock(pid);
    else chooseShelves();
  }
});
function restock(pid) {
  const r = shop.restock(pid);
  if (!r.ok && r.msg) note(r.msg);
}

// ---------- what goes on the shelves ----------
// One panel for the whole wall rather than a chooser per shelf: tick what you want to
// sell, untick what you don't, and nothing moves until you save.
function chooseShelves() {
  // the side panel can be a render behind, so re-check the phase here
  if (S().phase !== 'closed') { note('Rearrange the shelves once you have closed for the day.'); return; }
  const sel = S().slots.filter(Boolean);   // held past hideOverlay() so Save still has it
  shelfPick = sel;
  showOverlay('Rearrange the shelves', shelfPickBody(), [
    { label: 'Save the layout', fn: () => applyShelves(sel) },
    { label: 'Leave it as it is', cls: 'ghost' },
  ], true);
}
const on0 = (pid) => shop.roomQty(pid) > 0 || S().shelf[pid] > 0 || shelfPick.includes(pid);
function shelfPickBody() {
  const state = S();
  const n = state.slots.length;
  const spare = n - shelfPick.length;
  let h = '<p>You have ' + plural(n, 'shelf', 'shelves') + '. Tick what you want to sell and untick what you do not want — anything you take off goes back to the stockroom. Nothing changes until you save.</p>';
  h += '<p class="picked' + (spare ? '' : ' full') + '">' + shelfPick.length + ' of ' + plural(n, 'shelf', 'shelves') + ' used' +
    (spare ? ' · ' + plural(spare, 'shelf', 'shelves') + ' still going spare' : ' · untick something to make room') + '</p>';
  h += '<div class="choose">';
  for (const p of PRODUCTS) {
    // Out of season and none in the back: it is not a choice you can make today.
    if (!shop.inSeason(p) && !on0(p.id)) continue;
    const on = shelfPick.includes(p.id);
    const full = !on && !spare;
    h += '<button type="button" class="pick' + (on ? ' on' : '') + '" data-pid="' + p.id + '"' + (full ? ' disabled' : '') + ' aria-pressed="' + on + '">' +
      '<span class="ico">' + icoHtml(p) + '</span><span class="nm">' + esc(p.name) + '</span><span class="sm">' +
      (on && state.slots.includes(p.id) ? state.shelf[p.id] + ' out · ' + shop.roomQty(p.id) + ' in back' : shop.roomQty(p.id) + ' in stock') + '</span></button>';
  }
  return h + '</div>';
}
function togglePick(pid) {
  const at = shelfPick.indexOf(pid);
  if (at >= 0) shelfPick.splice(at, 1);
  else if (shelfPick.length >= S().slots.length) return;
  else shelfPick.push(pid);
  $('overlay-body').innerHTML = shelfPickBody();
}
function applyShelves(sel) {
  const msg = shop.applyShelves(sel);
  persist();
  renderShelves();
  renderSide();
  note(msg);
}
function fillAll() {
  const put = shop.fillAll();
  if (!put) { note('Nothing in the stockroom to put out. Order some in.'); return; }
  note('Put ' + plural(put, 'thing') + ' out on the shelves.');
  persist();
  renderShelves();
  renderSide();
}
function buyShelf() {
  const r = shop.buyShelf();
  if (!r.ok) { if (r.msg) note(r.msg); return; }
  persist();
  renderHud(); renderShelves(); renderSide();
  note(r.msg);
}

// ---------- orders ----------
function confirmOrder() {
  const r = shop.confirmOrder(order);
  if (!r.ok) { if (r.msg) note(r.msg); return; }
  order = {};
  persist();
  renderHud(); renderShelves(); renderSide();
  note(r.msg);
}

// ---------- the day's report ----------
function reportHtml(rep) {
  let h = '';
  h += rep.notes.length
    ? '<ul class="notes">' + rep.notes.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>'
    : '<p class="hint">Nothing worth writing down. Nobody grumbled, nobody went without.</p>';
  if (rep.remarks.length) {
    h += '<h3>What people said</h3><ul class="remarks">' +
      rep.remarks.slice().reverse().map((r) => '<li><span class="face">' + (r.who ? '<img class="chr-art" src="assets/people/' + r.who + '-front.png" alt="" />' : (r.look ? faceSvg(r.look) : '')) + '</span><b>' + esc(r.name) + ':</b> ' + esc(r.text) + '</li>').join('') + '</ul>';
  }
  return h;
}

// ---------- side panel ----------
function renderSide() {
  $('btn-morning').hidden = S().phase !== 'evening';
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  if (tab === 'stock') renderStockTab();
  else if (tab === 'prices') renderPricesTab();
  else if (tab === 'orders') renderOrdersTab();
  else renderNotebookTab();
}
function renderStockTab() {
  const state = S();
  let h = '<p class="hint">Shelves hold whatever you have ordered in and no more. Click a shelf in the shop, or a button here, to carry stock out of the stockroom. While the shop is open that takes a few seconds away from the till, so pick your moment.</p>';
  const stocked = state.slots.filter(Boolean);
  if (!stocked.length) h += '<p class="hint">No shelves set yet. Use <b>Rearrange the shelves</b> below, or click an empty shelf in the shop.</p>';
  if (state.phase === 'closed' && stocked.some((pid) => state.shelf[pid] < prod(pid).cap && shop.roomQty(pid) > 0)) {
    h += '<button type="button" class="wide" id="btn-fill">Fill every shelf</button>';
  }
  for (const pid of stocked) {
    const p = prod(pid);
    const q = state.shelf[pid];
    const room = shop.roomQty(pid);
    const age = shop.roomAge(pid);
    let agenote = '';
    if (p.life && room) {
      const oldest = state.room[pid].filter((b) => b.age === age).reduce((a, b) => a + b.q, 0);
      const some = oldest < room ? oldest + ' of them ' : '';
      agenote = age === 0 ? 'fresh' : p.life - age <= 1 ? some + 'binned tonight' : some + age + ' day' + (age === 1 ? '' : 's') + ' old';
    }
    h += '<div class="row"><span class="ico">' + icoHtml(p) + '</span><div class="grow"><b>' + esc(p.name) + '</b><span class="sm">Shelf ' + q + '/' + p.cap + ' &middot; stockroom ' + room + (agenote ? ' (' + agenote + ')' : '') + '</span></div>' +
      '<button type="button" class="tiny" data-restock="' + pid + '"' + (q >= p.cap || !room ? ' disabled' : '') + '>Restock</button></div>';
  }
  if (state.phase === 'closed') h += '<button type="button" class="wide" id="btn-rearrange">Rearrange the shelves</button>';
  if (state.slots.length < MAX_SLOTS) h += '<button type="button" class="wide" id="btn-shelf">Fit another shelf &middot; ' + money(SHELF_COST) + '</button>';
  sideBody.innerHTML = h;
  sideBody.querySelectorAll('[data-restock]').forEach((b) => b.addEventListener('click', () => restock(b.dataset.restock)));
  const bf = $('btn-fill');
  if (bf) bf.addEventListener('click', fillAll);
  const br = $('btn-rearrange');
  if (br) br.addEventListener('click', chooseShelves);
  const bs = $('btn-shelf');
  if (bs) bs.addEventListener('click', buyShelf);
}
function renderPricesTab() {
  const state = S();
  let h = '<p class="hint">Cost is what you pay per unit. Customers know roughly what things should cost and put them back if you push it too far &mdash; though you will not hear about it until closing time.</p>';
  const stocked = state.slots.filter(Boolean);
  for (const pid of stocked) {
    const p = prod(pid);
    const price = state.prices[pid];
    const st = state.report && state.report.stats[pid];
    const margin = price - p.cost;
    let fb = '';
    if (st && st.dear) fb = plural(st.dear, 'person', 'people') + ' said too dear yesterday';
    else if (st && st.bought) fb = st.bought + ' sold yesterday';
    h += '<div class="row"><span class="ico">' + icoHtml(p) + '</span><div class="grow"><b>' + esc(p.name) + '</b><span class="sm">Cost ' + money(p.cost) + ' &middot; margin ' + money(margin) + (fb ? ' &middot; ' + fb : '') + '</span></div>' +
      '<div class="stepper"><button type="button" data-price="' + pid + '" data-d="-1">&minus;</button><input type="text" inputmode="decimal" class="price-in" data-price="' + pid + '" value="' + price.toFixed(2) + '" aria-label="Price for ' + esc(p.name) + '"><button type="button" data-price="' + pid + '" data-d="1">+</button></div></div>';
  }
  sideBody.innerHTML = h;
  sideBody.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => {
    shop.nudgePrice(b.dataset.price, Number(b.dataset.d));
    persist();
    renderPricesTab();
    renderShelves();
    renderBelt();
  }));
  sideBody.querySelectorAll('.price-in').forEach((inp) => {
    inp.addEventListener('change', () => commitPrice(inp.dataset.price, inp.value));
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); });
  });
}
function commitPrice(pid, raw) {
  const n = Number(String(raw).replace(/[£,\s]+/g, ''));
  if (!isFinite(n)) { renderPricesTab(); renderShelves(); return; }
  shop.setPrice(pid, n);
  persist();
  renderPricesTab();
  renderShelves();
  renderBelt();
}
function renderOrdersTab() {
  const state = S();
  const t = shop.orderTotal(order);
  let h = shop.sameDayDelivery()
    ? '<p class="hint">Nothing in the shop. Order what you want and you can go and collect it yourself — it lands in the stockroom straight away, ready for today.</p>'
    : state.phase === 'open'
      ? '<p class="hint">You are open, so the van has been and gone. Anything you order now comes tomorrow morning, before you unlock. Fresh things only keep a few days in the stockroom.</p>'
      : '<p class="hint">Order now and the van catches you as you open up, so it is there for today — but it goes in the stockroom, and putting it out takes you off the till. Order once you are open and it waits for tomorrow morning.</p>';
  const sn = seasonOf(state.day);
  const seasonal = PRODUCTS.filter((p) => p.season && p.season.includes(sn.id));
  h += '<p class="hint">' + snIco(sn.id) + ' <b>' + sn.name + '</b>, day ' + (((state.day - 1) % SEASON_LEN) + 1) + ' of ' + SEASON_LEN + '. ' +
    (seasonal.length ? 'In the wholesaler this season: ' + seasonal.map((p) => esc(p.name.toLowerCase())).join(', ') + '.' : 'Nothing seasonal on the list just now.') + '</p>';
  const vans = [['Arriving when you open', state.arriving], ['Arriving tomorrow morning', state.pending]];
  for (const van of vans) {
    if (!van[1].length) continue;
    h += '<div class="pending"><b>' + van[0] + ':</b> ' + van[1].map((o) => o.boxes + '&times; ' + esc(prod(o.pid).name.toLowerCase())).join(', ') + '</div>';
  }
  for (const p of PRODUCTS) {
    if (!shop.inSeason(p)) continue;   // out of season: the wholesaler is not carrying it
    const n = order[p.id] || 0;
    const onShelf = state.slots.includes(p.id);
    h += '<div class="row' + (onShelf ? '' : ' dim') + '"><span class="ico">' + icoHtml(p) + '</span><div class="grow"><b>' + esc(p.name) + '</b><span class="sm">Box of ' + p.box + ' for ' + money(p.box * p.cost) + (p.life ? ' &middot; keeps ' + plural(p.life, 'day') : '') + ' &middot; ' + shop.roomQty(p.id) + ' in stock' + (onShelf ? '' : ' &middot; not on a shelf') + '</span></div>' +
      '<div class="stepper"><button type="button" data-order="' + p.id + '" data-d="-1"' + (n ? '' : ' disabled') + '>&minus;</button><span>' + n + '</span><button type="button" data-order="' + p.id + '" data-d="1">+</button></div></div>';
  }
  h += '<div class="order-foot"><span>' + (t.boxes ? plural(t.boxes, 'box', 'boxes') + ' &middot; ' + money(t.cost) + ' + ' + money(t.fee) + ' delivery' : 'Nothing picked yet') + '</span>' +
    '<button type="button" class="primary" id="btn-order"' + (t.boxes ? '' : ' disabled') + '>Order ' + (t.boxes ? money(t.cost + t.fee) : '') + '</button></div>';
  sideBody.innerHTML = h;
  sideBody.querySelectorAll('[data-order]').forEach((b) => b.addEventListener('click', () => {
    const pid = b.dataset.order;
    order[pid] = clamp((order[pid] || 0) + Number(b.dataset.d), 0, 9);
    renderOrdersTab();
  }));
  $('btn-order').addEventListener('click', confirmOrder);
}
function renderNotebookTab() {
  const state = S();
  const rep = state.report;
  let h = '<p class="hint">' + esc(DAYS[shop.weekdayIndex()]) + ', ' + wxIco(state.weather) + ' ' + WEATHER[state.weather].name + '. Tomorrow looks ' + wxIco(state.nextWeather) + ' ' + WEATHER[state.nextWeather].name + '.</p>';
  h += '<h3>' + (rep ? 'Day ' + rep.day + ' ' + wxIco(rep.weather) : 'Last night') + '</h3>';
  h += rep ? reportHtml(rep) : '<p class="hint">Nothing written up yet. People keep their thoughts to themselves while they shop &mdash; you find out how the day went when you cash off.</p>';
  const rows = PRODUCTS.map((p) => ({ p, s: state.totals[p.id] })).filter((x) => x.s.wanted > 0).sort((a, b) => b.s.wanted - a.s.wanted);
  if (rows.length) {
    h += '<h3>All time</h3><table class="tally"><tr><th></th><th>wanted</th><th>sold</th><th>dear</th><th>none</th></tr>' +
      rows.map((x) => '<tr><td>' + icoHtml(x.p) + ' ' + esc(x.p.name) + '</td><td>' + x.s.wanted + '</td><td>' + x.s.bought + '</td><td>' + x.s.dear + '</td><td>' + (x.s.empty + x.s.missing) + '</td></tr>').join('') + '</table>';
  }
  sideBody.innerHTML = h;
}
document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; renderSide(); }));

// ---------- hud ----------
function renderHud() {
  const state = S();
  $('hud-cash').textContent = money(state.cash);
  $('hud-cash').classList.toggle('bad', state.cash < 0);
  $('hud-day').innerHTML = 'Day ' + state.day + ' · ' + DAYS[shop.weekdayIndex()].slice(0, 3) + ' · ' + snIco(seasonOf(state.day).id);
  const w = WEATHER[state.weather];
  $('hud-weather').innerHTML = wxIco(state.weather) + ' ' + w.name;
  scene.dataset.weather = state.weather;
  // the street through the window is painted for each weather; a sunny day in winter gets
  // the frosty-bright one
  const pic = state.weather === 'sunny' && seasonOf(state.day).id === 'winter' ? 'sunny-winter' : state.weather;
  const src = 'assets/window/' + pic + '.webp';
  if (windowArt.getAttribute('src') !== src) windowArt.setAttribute('src', src);
  const stars = Math.round(state.rep / 20);
  $('hud-rep').textContent = '★'.repeat(stars) + '☆'.repeat(5 - stars);
  $('hud-rep').title = 'Reputation ' + Math.round(state.rep) + '/100';
  $('hud-served').textContent = state.today.served;
  renderClock();
}
function renderClock() {
  const el = $('hud-clock');
  const day = D();
  if (S().phase !== 'open' || !day) {
    el.textContent = 'Closed';
    setClock(9 * 60);
    return;
  }
  const t = clamp(day.t / DAY_LENGTH, 0, 1);
  const mins = 9 * 60 + t * 8 * 60;
  el.textContent = Math.floor(mins / 60) + ':' + String(Math.floor(mins) % 60).padStart(2, '0') + (day.t >= DAY_LENGTH ? ' · closing' : '');
  setClock(mins);
}
function setClock(mins) {
  clockHour.style.transform = 'rotate(' + ((mins / 60) * 30 % 360) + 'deg)';
  clockMin.style.transform = 'rotate(' + ((mins % 60) / 60 * 360) + 'deg)';
}
function renderQueue() {
  queueEl.innerHTML = '';
  const day = D();
  if (!day) return;
  // drawn back to front, so whoever is nearer the till stands in front
  for (let i = day.queue.length - 1; i >= 0; i--) {
    const c = day.queue[i];
    const x = LANE.front - i * LANE.gap;
    const d = document.createElement('div');
    d.className = 'q';
    d.style.left = x - 100 + 'px';
    d.innerHTML = charHtml(c);
    setChar(d, c);
    d.title = c.name;
    queueEl.appendChild(d);
    glide(d, c, x);
  }
}

// Somebody going home without queueing: a copy of them turns and walks the lane to the
// right, behind the queue and whoever is paying (it sits under both in the markup), and
// fades only at the far end. A copy, so the next person can already be at the shelves
// while they go.
function leaveLane(c) {
  const el = browserEl.cloneNode(true);
  el.removeAttribute('id');
  el.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
  const think = el.querySelector('.bubble');
  if (think) think.remove();
  const who = castOf(c);
  if (who) el.querySelector('.face').innerHTML = charHtml(c, awayPose(who));
  el.classList.remove('in', 'out');
  el.classList.add('leaving');
  el.hidden = false;
  scene.insertBefore(el, queueEl);
  const dx = LANE.exit - laneX(c);
  const ms = Math.max(600, dx / WALK_SPEED * 1000);
  if (!el.animate) { el.remove(); return; }
  const walk = el.animate([
    { transform: 'none', opacity: 1 },
    { transform: 'translateX(' + dx * 0.85 + 'px)', opacity: 1, offset: 0.85 },
    { transform: 'translateX(' + dx + 'px)', opacity: 0 },
  ], { duration: ms, easing: 'linear', fill: 'forwards' });
  walk.onfinish = () => el.remove();
}
// Where someone is right now: their spot, or partway along a walk to it.
function laneX(c) {
  const m = c.walk;
  if (!m) return c.x;
  const f = (performance.now() - m.t0) / m.ms;
  if (f >= 1) { c.walk = null; return c.x; }
  return m.from + (c.x - m.from) * f;
}
// Walk someone from wherever they are to x at a steady pace. Each spot in the lane is its
// own element, so the walk is played on the new one, starting offset back at where they
// were (mid-walk included, so a second move before the first is done carries straight on).
function glide(el, c, x) {
  if (c.x == null) { c.x = x; return; }
  const from = laneX(c);
  const ms = Math.abs(x - from) / WALK_SPEED * 1000;
  c.x = x;
  c.walk = null;
  if (ms < 30 || !el.animate) return;
  c.walk = { from, t0: performance.now(), ms };
  el.animate([{ transform: 'translateX(' + (from - x) + 'px)' }, { transform: 'none' }],
    { duration: ms, easing: 'linear' });
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
function hideOverlay() { overlay.hidden = true; shelfPick = null; }

// clicking the dark surround, or Escape, backs out of anything that has a "leave it" way
// out; the rest have to be answered
overlay.addEventListener('click', (e) => { if (e.target === overlay && overlay.dataset.dismiss) hideOverlay(); });
$('overlay-body').addEventListener('click', (e) => {
  const b = e.target.closest('.pick');
  if (b && shelfPick) togglePick(b.dataset.pid);
});

// ---------- the day ----------
function openShop() {
  const r = shop.openShop();
  if (!r.ok) {
    if (r.msg) note(r.msg);
    if (r.tab) { tab = r.tab; renderSide(); }
    return;
  }
  bannerEl.hidden = true;
  persist();
  renderHud(); renderReceipt(); renderQueue(); renderShelves(); renderSide();
  note(r.msg);
}
function closed(profit) {
  dropHeld();
  awayEl.hidden = true;
  shopperEl.hidden = true;
  browserEl.hidden = true;
  scene.querySelectorAll('.leaving').forEach((n) => n.remove());
  hideThought();
  hush(shopperBubble);
  persist();
  renderHud(); renderShelves(); renderBelt(); renderBag(); renderReceipt(); renderCoins(); renderQueue(); renderSide();
  showOverlay('Closing time, day ' + S().day, '<p>The doors are shut and the last customer has gone. Count the till, then read how the day went and put in any orders.</p>', [
    { label: 'Close', fn: () => showSummary(profit) },
  ]);
}
function showSummary(profit) {
  const state = S();
  const t = state.today;
  const w = WEATHER[state.nextWeather];
  let best = null;
  for (const p of PRODUCTS) { const s = t.stats[p.id]; if (!best || s.bought > best.n) best = { p, n: s.bought }; }
  let h = '<table class="sheet">' +
    '<tr><td>Takings</td><td>' + money(t.takings) + '</td></tr>' +
    '<tr><td>Cost of what you sold</td><td>-' + money(t.cogs) + '</td></tr>' +
    '<tr><td>Rent</td><td>-' + money(RENT) + '</td></tr>' +
    '<tr class="tot"><td>Day\'s profit</td><td>' + money(profit) + '</td></tr>' +
    (t.spent ? '<tr><td>Spent on orders and shelves</td><td>-' + money(t.spent) + '</td></tr>' : '') +
    '<tr><td>Cash in the tin</td><td>' + money(state.cash) + '</td></tr></table>';
  const bits = [];
  bits.push(plural(t.served, 'customer') + ' served' + (t.quick ? ', ' + t.quick + ' of them quickly' : '') + '.');
  if (t.walked) bits.push(plural(t.walked, 'person', 'people') + ' walked out of the queue.');
  if (t.busy) bits.push(plural(t.busy, 'person', 'people') + ' left because the queue was too long.');
  if (t.nothing) bits.push(plural(t.nothing, 'person', 'people') + ' found nothing they wanted.');
  if (best && best.n) bits.push('Best seller: ' + best.p.name.toLowerCase() + ' (' + best.n + ').');
  if (t.binned.length) bits.push('Binned overnight: ' + t.binned.map((b) => b.q + ' ' + prod(b.pid).name.toLowerCase()).join(', ') + '.');
  const dr = Math.round(state.rep - t.repStart);
  bits.push('Reputation ' + (dr >= 0 ? 'up ' : 'down ') + Math.abs(dr) + '.');
  h += '<ul>' + bits.map((b) => '<li>' + esc(b) + '</li>').join('') + '</ul>';
  if (state.report) h += '<h3>How it went</h3>' + reportHtml(state.report);
  if (state.pending.length) h += '<p>The van brings ' + state.pending.map((o) => o.boxes + ' box' + (o.boxes === 1 ? '' : 'es') + ' of ' + esc(prod(o.pid).name.toLowerCase())).join(', ') + ' in the morning.</p>';
  else h += '<p>Nothing on order. Whatever you order in the morning comes with the van as you open up.</p>';
  h += '<p class="forecast">Tomorrow looks <b>' + wxIco(state.nextWeather) + ' ' + w.name + '</b>. Check the notebook before you order.</p>';
  if (state.cash < 0) h += '<p class="warn">You are in the red. The landlord gives you one more morning to sort it.</p>';
  showOverlay('Day ' + state.day + ' report', h, [
    { label: 'Place orders', cls: 'ghost', fn: () => { tab = 'orders'; renderSide(); } },
    { label: 'Next morning', fn: morning },
  ]);
}
function morning() {
  const arrived = shop.morning();
  persist();
  renderAll();
  if (S().phase === 'over') { gameOver(); return; }
  $('banner-text').textContent = (arrived ? 'The van dropped off ' + arrived + '. ' : '') +
    (shop.stockTotal() ? 'Put the stock out, check your prices, then open up.' : 'Nothing left in the shop. Order some stock in before you open.');
  bannerEl.hidden = false;
  if (S().cash < 0) note('Rent is overdue. Get back above zero by tomorrow morning or the landlord closes you down.');
}
function gameOver() {
  const state = S();
  const days = state.days.length;
  const total = state.days.reduce((a, d) => a + d.profit, 0);
  showOverlay('The landlord has changed the locks', '<p>Two mornings in the red was one too many. You kept the shop going for ' + plural(days, 'day') + ' and sold ' + plural(state.sold, 'thing') + ', for ' + money(total) + ' profit all told.</p>', [{ label: 'Start again', fn: resetGame }]);
}
function resetGame() {
  shop.reset();
  order = {};
  persist();
  renderAll();
  $('banner-text').textContent = 'A new shop, and not a tin on the shelves. Order your first stock in on the Orders tab, put it out, then open up.';
  bannerEl.hidden = false;
}
function renderAll() {
  renderHud(); renderShelves(); renderBelt(); renderBag(); renderReceipt(); renderCoins(); renderQueue(); renderSide();
  bannerEl.hidden = S().phase !== 'closed';
  awayEl.hidden = true;
  shopperEl.hidden = true;
  browserEl.hidden = true;
  hideThought();
  renderPatience();
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
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyP' && !e.target.closest('input, textarea, select')) togglePause();
});
function syncSound() {
  $('btn-sound').textContent = 'Sound: ' + (audio.on ? 'on' : 'off');
  $('btn-sound').setAttribute('aria-pressed', String(audio.on));
}
$('btn-sound').addEventListener('click', () => {
  audio.toggle();
  syncSound();
  SFX.beep();
});

document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (e.key === 'Escape') {
    dropHeld();
    if (!$('help').hidden) $('help').hidden = true;
    else if (!overlay.hidden && overlay.dataset.dismiss) hideOverlay();
    return;
  }
  if (!overlay.hidden || !$('help').hidden) return;
  if (e.key === 'Enter' || e.key === ' ') {
    const day = D();
    if (S().phase === 'open' && day && day.coins && day.coins.length) { e.preventDefault(); shop.takeCoin(day.coins[0].uid); }
    else if (S().phase === 'closed' && e.target === document.body) { e.preventDefault(); openShop(); }
  }
});

// ---------- boot ----------
syncSound();
fit();
renderAll();
if (S().phase === 'over') gameOver();
else if (S().day === 1 && S().today.served === 0 && !S().days.length) {
  $('banner-text').textContent = 'Your first morning, and the shop is empty. Order some stock in on the Orders tab — you can collect that first lot yourself and sell it today.';
  $('help').hidden = false;
} else {
  $('banner-text').textContent = shop.stockTotal()
    ? 'Fill the shelves, check your prices, then open up.'
    : 'Nothing left to sell. Order some stock in before you open.';
}

function tick(dt) {
  shop.tick(dt);
  renderClock();
  renderPatience();
}
frameLoop((dt) => {
  if (S().phase === 'open' && D() && !frozen && !paused) tick(dt);
}, { maxDt: 0.1 }).start();

// The debug handle, for tests and the console.
expose('__shop', {
  shop,
  CAST, AWAY, ZOOM, castOf, awayPose, charHtml, icoHtml,
  get state() { return S(); }, PRODUCTS, PERSONAS, WEATHER, SEASONS, SEASON_LEN,
  seasonOf, inSeason: (p, d) => shop.inSeason(p, d), rollWeather: (d) => shop.rollWeather(d),
  weightedPersona: () => shop.weightedPersona(), buildWants: (p) => shop.buildWants(p), makeLook: (p) => shop.makeLook(p), faceSvg,
  openShop, tick, renderSide, renderHud, setTab: (t) => { tab = t; renderSide(); },
  get day() { return D(); }, freeze: (on) => { frozen = !!on; },
  scanItem: (uid) => shop.scanItem(uid), bagItem: (uid) => shop.bagItem(uid), takeCoin: (uid) => shop.takeCoin(uid),
  resetGame, morning, START_CASH, RENT,
  text: () => JSON.stringify({ day: S().day, phase: S().phase, cash: S().cash, rep: S().rep, served: S().today.served }),
});
