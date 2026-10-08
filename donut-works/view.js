/* Donut Works: the screen. Draws the factory from straight above, painted in code round
   Amber's donut and topping pictures, runs the side panel, bench and overlays, and turns clicks into the factory's verbs.
   The rules are in sim.js. */

import {
  COLS, ROWS, T, DX, DY, BELT_SPEED, START_CASH, CASH_FLOOR, SPECIAL_FROM_LEVEL, STUCK_AFTER, SIM_STEP,
  GLAZES, FILLINGS, TOPS, MYSTERIES, RECIPES, VALUE, BATCHES, MACHINES, BELT_COST, MAX_LVL, LEVELS,
  levelDef, recipeValue, procTime, upgradeCost, refundOf, goalDone, HARD_BLOCK, blockText, bendGeom, createFactory, HATCH_ROWS,
} from './sim.js';
import { store } from '../lib/save.js';
import { createAudio } from '../lib/audio.js';
import { frameLoop } from '../lib/loop.js';
import { expose } from '../lib/debug.js';

// ---------- constants ----------
const save = store('donut-works-save-v1');
const audio = createAudio('donut-works-sound', false);

// ---------- view state ----------
let speed = 1, tool = null, toolDir = 0, selected = null, hover = null, painting = false, lastPaint = null, drag = null;
let floats = [], puffs = [], tab = 'build';
let hudCache = '';
let beltClock = 0;      // what the slats on the belts are animated by: the factory's own clock

const f = createFactory({ saved: save.load(), on: onEvent });
function onEvent(ev, d) {
  if (ev === 'changed') dirtyUI = true;
  else if (ev === 'sfx') sfx(d);
  else if (ev === 'note') note(d.text, d.c, d.r, d.col, d.life);
  else if (ev === 'refund') { const at = scr(d.c, d.r); floats.push({ x: at.x, y: at.y - 20, text: `${pence(d.amount)} back`, col: '#8a6d2f', t: 0, life: 1.3, size: 13 }); }
  else if (ev === 'sale') {
    const at = scr(d.c, d.r);
    floats.push({ x: at.x, y: at.y - 22, text: `+${pence(d.total)}`, col: d.good ? '#3f7a2a' : '#b8483a', t: 0, life: 1.4, size: 15 });
    floats.push({ x: at.x, y: at.y - 46, text: d.quip, col: '#3b2a24', t: -0.25, life: 1.9, size: 12, bubble: true });
    sfx(d.good ? 'sell' : 'meh');
  } else if (ev === 'level-up') { save.save(f.serialize()); showLevelUp(d); renderSide(); }
}
function note(text, c, r, col, life) {
  const at = scr(c, r);
  floats.push({ x: at.x, y: at.y - 62, text, col: col || '#3b2a24', t: 0, life: life || 1.6, size: 13 });
}

// ---------- money ----------
const money = (p) => `${p < 0 ? '-' : ''}£${(Math.abs(p) / 100).toFixed(2)}`;
const pence = (p) => (Math.abs(p) >= 100 ? money(p) : `${p}p`);

function showLevelUp(L) {
  const u = L.unlock || {};
  const chips = [];
  for (const m of u.machines || []) chips.push(`<span class="chip"><span class="em">${icoImg(m)}</span>${MACHINES[m].name}</span>`);
  for (const g of u.glazes || []) chips.push(`<span class="chip"><span class="sw" style="background:${GLAZES[g].col}"></span>${GLAZES[g].name}</span>`);
  for (const fl of u.fillings || []) chips.push(`<span class="chip"><span class="sw" style="background:${FILLINGS[fl].col}"></span>${FILLINGS[fl].name}</span>`);
  for (const t of u.tops || []) chips.push(`<span class="chip"><span class="em">${topIco(t)}</span>${TOPS[t].name}</span>`);
  const next = levelDef(f.level);
  let html = `<p>${L.who} is delighted. Order filled.</p><div class="big-money">+${money(L.bonus)}</div>`;
  if (chips.length) html += `<p>New in the build tab:</p><div class="unlocks">${chips.join('')}</div>`;
  if (next) html += `<p><b>Next order — ${next.name}.</b> ${next.who} says: <i>${next.blurb}</i></p>`;
  else html += `<p><b>That is every order filled.</b> The factory is yours now. The specials board keeps turning, the recipe book still has gaps, and there is always a sillier donut.</p>`;
  const resume = speed || 1;
  speed = 0; syncSpeedButtons();
  overlay(`Order filled: ${L.name}`, html, [{ label: 'Back to work', primary: true, fn: () => { speed = resume; syncSpeedButtons(); } }]);
}

// ---------- the room ----------
// Seen from straight above, so every tile is a square and every machine sits inside its
// own: you can read the whole line at a glance. The quarry-tile floor runs right across the
// canvas; the part you can build on is the sim's grid exactly (T px a tile), taped out, and
// the hatch through to the shop sits on its right-hand edge, mostly outside it.
const FX = 0, FY = 0;                 // the build area's top-left corner in the scene
const FW = COLS * T, FH = ROWS * T;
const HATCH = { r0: HATCH_ROWS[0], r1: HATCH_ROWS[HATCH_ROWS.length - 1] + 1, out: 34, in: 8 };   // rows it spans, and how far it stands out and in
const SCENE_W = FW + HATCH.out, SCENE_H = FH;

const canvas = document.getElementById('floor');
let ctx = canvas.getContext('2d');
let dirtyUI = true;
function dirty() { dirtyUI = true; }

// scene px -> css px is p * view.s + view.x; the canvas itself is css px * dpr
const view = { s: 1, x: 0, y: 0, dpr: 1, w: 0, h: 0 };
// how much of the canvas the floating HUD, the bench and the specials card cover, so the
// room can be fitted into what is left
function covered(box) {
  const ins = { t: 0, b: 0, r: 0 };
  const over = (el) => el && !el.hidden && getComputedStyle(el).position === 'absolute' ? el.getBoundingClientRect() : null;   // only what floats over the floor
  const top = over(document.querySelector('.topbar'));
  if (top) ins.t = Math.max(0, top.bottom - box.top + 6);
  const bench = over(document.getElementById('bench'));
  if (bench) ins.b = Math.max(0, box.bottom - bench.top + 6);
  const spec = over(document.getElementById('hud-special-wrap'));
  if (spec) ins.r = Math.max(0, box.right - spec.left + 6);
  const side = over(document.querySelector('.side'));
  if (side) ins.r = Math.max(ins.r, box.right - side.left + 6);
  return ins;
}
function fitView() {
  const box = canvas.parentElement.getBoundingClientRect();
  const w = Math.max(200, box.width), h = Math.max(160, box.height);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cw = Math.round(w * dpr), ch = Math.round(h * dpr);
  if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
  const ins = covered(box);
  const pad = w < 500 ? 6 : 20;
  const aw = Math.max(100, w - ins.r - pad * 2), ah = Math.max(100, h - ins.t - ins.b - pad * 2);
  const s = Math.min(aw / SCENE_W, ah / SCENE_H);
  const x = pad + (aw - SCENE_W * s) / 2, y = ins.t + pad + (ah - SCENE_H * s) / 2;
  roomCache = null;
  Object.assign(view, { s, x, y, dpr, w, h });
}
if (window.ResizeObserver) new ResizeObserver(fitView).observe(canvas.parentElement);
window.addEventListener('resize', fitView);

function sceneT() { const k = view.dpr * view.s; ctx.setTransform(k, 0, 0, k, view.dpr * view.x, view.dpr * view.y); }
// draw in tile px centred on tile (c, r)
function tileT(c, r) { sceneT(); ctx.translate(FX + c * T + T / 2, FY + r * T + T / 2); }
// a point on the floor (tile px from the floor's corner) to the scene
function fl(x, y) { return { x: FX + x, y: FY + y }; }
// the middle of a tile, in the scene
function scr(c, r) { return { x: FX + c * T + T / 2, y: FY + r * T + T / 2 }; }
// what part of the scene is on screen, for keeping labels inside it
function seen() { return { x0: -view.x / view.s, x1: (view.w - view.x) / view.s, y0: -view.y / view.s, y1: (view.h - view.y) / view.s }; }

// ---------- sprites ----------
// Amber's donut and topping pictures are drawn from above, so they drop straight onto
// the belts. Everything else is painted in code below.
const IMG = {};
const SPRITES = ['d/dough.png', 'd/ring.png', 'd/fried.png'];
// toppings with a picture of their own; the rest are drawn
const TOP_ART = ['bacon', 'pickle', 'worms', 'chips', 'eyes', 'fish', 'hat', 'popping', 'sprinkles', 'bee', 'cress', 'dice', 'candle', 'crown'];
for (const t of TOP_ART) SPRITES.push(`t/${t}.png`);
const ok = (im) => !!im && (im instanceof HTMLCanvasElement || (im.complete && im.naturalWidth > 0));
for (const file of SPRITES) {
  const im = new Image();
  im.onload = () => { variants.clear(); for (const k in iconCache) delete iconCache[k]; dirty(); };
  im.src = `images/${file}`;
  IMG[file.replace(/\.(png|jpg)$/, '')] = im;
}
const spriteUrl = (key) => `images/${key}.png`;

// Recoloured copies (charred donuts, glaze rings) are made once on a scratch canvas and kept.
const variants = new Map();
function variant(key, make) {
  if (!variants.has(key)) {
    const cv = make();
    if (!cv) return null;
    variants.set(key, cv);
  }
  return variants.get(key);
}
function tinted(src, col, amt) {
  const im = IMG[src];
  if (!ok(im)) return null;
  return variant(`${src}|${col}|${amt}`, () => {
    const cv = document.createElement('canvas');
    cv.width = im.naturalWidth; cv.height = im.naturalHeight;
    const c2 = cv.getContext('2d');
    c2.drawImage(im, 0, 0);
    c2.globalCompositeOperation = 'source-atop';
    c2.globalAlpha = amt; c2.fillStyle = col; c2.fillRect(0, 0, cv.width, cv.height);
    return cv;
  });
}
// A ring of icing for the top of a donut, in the donut picture's own 96px frame.
function glazeLayer(id, solid) {
  const g = GLAZES[id];
  if (!g) return null;
  return variant(`glaze|${id}|${solid ? 1 : 0}`, () => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 96;
    const c2 = cv.getContext('2d');
    c2.translate(48, 47);
    c2.beginPath();
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      // a wavy rim, with a couple of fatter drips down the front
      const drip = Math.max(0, Math.sin(a * 3 + 0.6)) ** 6 * 5 * (Math.sin(a) > 0 ? 1 : 0.3);
      const rad = 37 + Math.sin(a * 7) * 1.6 + Math.sin(a * 11 + 1) * 1 + drip;
      if (i) c2.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); else c2.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
    }
    c2.closePath();
    if (!solid) c2.arc(0, 0, 17, 0, Math.PI * 2, true);
    c2.fillStyle = g.col; c2.fill('evenodd');
    c2.lineWidth = 2.4; c2.strokeStyle = g.edge; c2.stroke();
    // a shine across the top left
    c2.strokeStyle = 'rgba(255, 255, 255, 0.5)'; c2.lineWidth = 4; c2.lineCap = 'round';
    c2.beginPath(); c2.arc(0, 0, 27, Math.PI * 1.05, Math.PI * 1.45); c2.stroke();
    return cv;
  });
}

// ---------- the look ----------
const PAL = {
  ink: '#5d4030',
  wood: '#e6c393', woodDark: '#b98a59',
  rail: '#a7b8a3', railDark: '#7d917b',
  cream: '#fbf2e2', copper: '#c4854f',
  rose: '#eba3bb', roseDark: '#c56d8c',
  steel: '#d6d9dc', steelDark: '#a9aeb3',
  tile: [201, 132, 100], grout: '#a8664c',
  plaster: '#f7eddf', timber: '#8a6448', timberDark: '#6b4a35', sage: '#a9c5ae', sageDark: '#7d9f84',
};
const UI_FONT = "'Nunito', ui-sans-serif, system-ui, sans-serif";
const HAND_FONT = "'Patrick Hand', 'Segoe Print', " + UI_FONT;

function rr(x, y, w, h, rad) {
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, w, h, rad) : ctx.rect(x, y, w, h);
}
function ink(w, col) {
  ctx.strokeStyle = col || PAL.ink;
  ctx.lineWidth = w; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
}
function dot(x, y, rad, fill, line) {
  ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (line) { ink(1.3); ctx.stroke(); }
}
// a tiny seeded hash, so the floor's tile-to-tile variation is the same every frame
function hash(a, b) { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

// The floor is the same every frame, so it is painted once onto its own canvas at the
// current fit and copied in; fitView throws it away whenever the fit changes.
let roomCache = null;
function drawRoom() {
  if (!roomCache) {
    const cv = document.createElement('canvas');
    cv.width = canvas.width; cv.height = canvas.height;
    const prev = ctx;
    ctx = cv.getContext('2d');
    paintRoom();
    ctx = prev;
    roomCache = cv;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(roomCache, 0, 0);
}
function paintRoom() {
  // plaster everywhere round the working floor, the whitish wall tops of before
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = PAL.plaster;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  sceneT();
  const v = seen();
  ctx.fillStyle = 'rgba(160, 120, 90, 0.12)';
  const area = (v.x1 - v.x0) * (v.y1 - v.y0);
  for (let i = 0; i < area / 900; i++) ctx.fillRect(v.x0 + hash(i, 7) * (v.x1 - v.x0), v.y0 + hash(13, i) * (v.y1 - v.y0), 2, 2);
  // the floor: one terracotta quarry tile per game tile, each a touch different
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const x = FX + c * T, y = FY + r * T, n = hash(c + 50, r + 50) - 0.5, w2 = hash(r + 90, c + 50) - 0.5;
    const [R, G, B] = PAL.tile;
    ctx.fillStyle = `rgb(${R + n * 16 + w2 * 6}, ${G + n * 12}, ${B + n * 10 - w2 * 6})`;
    ctx.fillRect(x, y, T, T);
    // a soft wear in the middle and a lit top-left edge, like a fired tile
    const g = ctx.createRadialGradient(x + T * 0.4, y + T * 0.4, 4, x + T / 2, y + T / 2, T * 0.75);
    g.addColorStop(0, 'rgba(255, 226, 196, 0.13)'); g.addColorStop(1, 'rgba(120, 60, 40, 0.1)');
    ctx.fillStyle = g; ctx.fillRect(x, y, T, T);
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = i % 2 ? 'rgba(120, 66, 44, 0.16)' : 'rgba(255, 220, 190, 0.14)';
      ctx.fillRect(x + 4 + hash(c * 7 + i + 99, r + 50) * (T - 8), y + 4 + hash(r * 5 + i + 99, c + 59) * (T - 8), 1.6, 1.6);
    }
  }
  ctx.strokeStyle = PAL.grout; ctx.lineWidth = 2;
  ctx.beginPath();
  for (let c = 1; c < COLS; c++) { ctx.moveTo(FX + c * T, FY); ctx.lineTo(FX + c * T, FY + FH); }
  for (let r = 1; r < ROWS; r++) { ctx.moveTo(FX, FY + r * T); ctx.lineTo(FX + FW, FY + r * T); }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255, 220, 190, 0.22)'; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let c = 1; c < COLS; c++) { ctx.moveTo(FX + c * T + 1.5, FY); ctx.lineTo(FX + c * T + 1.5, FY + FH); }
  for (let r = 1; r < ROWS; r++) { ctx.moveTo(FX, FY + r * T + 1.5); ctx.lineTo(FX + FW, FY + r * T + 1.5); }
  ctx.stroke();
  // the walls' shadow along the floor's edges, deepest under the back wall
  const edge = (x0, y0, x1, y1, w) => { const g = ctx.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, `rgba(90, 50, 32, ${w})`); g.addColorStop(1, 'rgba(90, 50, 32, 0)'); return g; };
  ctx.fillStyle = edge(0, FY, 0, FY + 22, 0.3); ctx.fillRect(FX, FY, FW, 22);
  ctx.fillStyle = edge(FX, 0, FX + 14, 0, 0.22); ctx.fillRect(FX, FY, 14, FH);
  ctx.fillStyle = edge(FX + FW, 0, FX + FW - 8, 0, 0.14); ctx.fillRect(FX + FW - 8, FY, 8, FH);
  // and the brown timber base of the wall all the way round
  const B = 6;
  ctx.fillStyle = PAL.timber;
  ctx.fillRect(FX - B, FY - B, FW + B * 2, B); ctx.fillRect(FX - B, FY + FH, FW + B * 2, B);
  ctx.fillRect(FX - B, FY, B, FH); ctx.fillRect(FX + FW, FY, B, FH);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.fillRect(FX - B, FY - B, FW + B * 2, 1.5);
  ink(1.4); ctx.strokeRect(FX - B, FY - B, FW + B * 2, FH + B * 2);
}
// The hatch through to the shop: a timber frame with a sill and a little bell, standing
// mostly off the right-hand edge of the build area. It is drawn every frame over the belts,
// so a belt running into it disappears underneath.
function paintHatch() {
  const x0 = FX + FW - HATCH.in, x1 = FX + FW + HATCH.out;
  const y0 = FY + HATCH.r0 * T + 6, y1 = FY + HATCH.r1 * T - 6;
  ctx.fillStyle = 'rgba(80, 44, 28, 0.25)'; rr(x0 + 3, y0 + 5, x1 - x0, y1 - y0, 6); ctx.fill();
  ctx.fillStyle = PAL.timber; rr(x0, y0, x1 - x0, y1 - y0, 6); ctx.fill(); ink(1.6); ctx.stroke();
  // the sill, a pale scrubbed board people pass things across
  ctx.fillStyle = '#e8cfa6'; rr(x0 + 5, y0 + 9, x1 - x0 - 10, y1 - y0 - 18, 3); ctx.fill(); ink(1.2); ctx.stroke();
  ctx.strokeStyle = 'rgba(150, 104, 66, 0.45)'; ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let x = x0 + 13; x < x1 - 6; x += 8) { ctx.moveTo(x, y0 + 11); ctx.lineTo(x, y1 - 11); }
  ctx.stroke();
  // the shutter, rolled up at the shop end
  ctx.fillStyle = PAL.sage; rr(x1 - 9, y0 + 3, 7, y1 - y0 - 6, 3); ctx.fill(); ink(1.2); ctx.stroke();
  // a bell on the sill
  dot(x0 + 13, y0 + 20, 5, '#e8b54f', true);
  dot(x0 + 13, y0 + 20, 1.6, PAL.ink, false);
  // and a card saying where it goes
  ctx.save();
  ctx.translate((x0 + x1) / 2 + 2, (y0 + y1) / 2 + 8);
  ctx.rotate(Math.PI / 2);
  ctx.fillStyle = '#fff6e6'; rr(-30, -8, 60, 16, 4); ctx.fill(); ink(1.2); ctx.stroke();
  ctx.fillStyle = PAL.ink; ctx.font = `13px ${HAND_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('to the shop', 0, 1);
  ctx.restore();
}

// ---------- belts ----------
// A slatted wooden belt running between two sage rails, the slats moving with the
// factory's clock. A bend is the same thing drawn round a quarter circle.
const SLAT = 9, BW = 16;
// a straight stretch of belt from x0 to x1 along the current x axis, slats running +x
function beltRun(x0, x1, off, rot) {
  // a shadow on the tiles, below and to the right whichever way it is turned
  ctx.save(); ctx.rotate(-rot); ctx.translate(2, 3); ctx.rotate(rot);
  ctx.fillStyle = 'rgba(80, 44, 28, 0.22)'; ctx.fillRect(x0, -BW - 1, x1 - x0, BW * 2 + 2);
  ctx.restore();
  ctx.fillStyle = PAL.wood; ctx.fillRect(x0, -BW, x1 - x0, BW * 2);
  ctx.lineWidth = 1.7;
  for (let x = -T / 2 + off - SLAT * 3; x < x1 + 1; x += SLAT) {
    if (x < x0) continue;
    ctx.strokeStyle = 'rgba(150, 104, 66, 0.6)';
    ctx.beginPath(); ctx.moveTo(x, -BW + 3); ctx.lineTo(x, BW - 3); ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 244, 224, 0.5)';
    ctx.beginPath(); ctx.moveTo(x + 1.6, -BW + 3); ctx.lineTo(x + 1.6, BW - 3); ctx.stroke();
  }
  ctx.fillStyle = PAL.rail;
  ctx.fillRect(x0, -BW, x1 - x0, 4.5);
  ctx.fillRect(x0, BW - 4.5, x1 - x0, 4.5);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.fillRect(x0, -BW + 0.8, x1 - x0, 1.2); ctx.fillRect(x0, BW - 3.8, x1 - x0, 1.2);
  ink(1.5); ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.moveTo(x0, -BW + 0.4); ctx.lineTo(x1, -BW + 0.4);
  ctx.moveTo(x0, BW - 0.4); ctx.lineTo(x1, BW - 0.4);
  ctx.stroke();
}
// `under` is how far the belt runs on past its tile, out the front and in at the back,
// where it meets a machine: it carries on underneath rather than stopping at its edge
// a quarter-circle of belt, from bendGeom: wood, moving slats, sage rails
function beltArc(g, off) {
  const a1 = g.a0 + g.d, ccw = g.d < 0;
  ctx.save(); ctx.translate(2, 3);
  ctx.strokeStyle = 'rgba(80, 44, 28, 0.22)'; ctx.lineWidth = BW * 2 + 2;
  ctx.beginPath(); ctx.arc(g.ax, g.ay, g.rad, g.a0, a1, ccw); ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = PAL.wood; ctx.lineWidth = BW * 2; ctx.lineCap = 'butt';
  ctx.beginPath(); ctx.arc(g.ax, g.ay, g.rad, g.a0, a1, ccw); ctx.stroke();
  const len = Math.abs(g.d) * g.rad, sgn = g.d < 0 ? -1 : 1;
  for (let s = off - SLAT; s < len; s += SLAT) {
    if (s < 0) continue;
    const a = g.a0 + sgn * (s / g.rad), ca = Math.cos(a), sa = Math.sin(a);
    ctx.strokeStyle = 'rgba(150, 104, 66, 0.6)'; ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.moveTo(g.ax + ca * (g.rad - BW + 3), g.ay + sa * (g.rad - BW + 3));
    ctx.lineTo(g.ax + ca * (g.rad + BW - 3), g.ay + sa * (g.rad + BW - 3));
    ctx.stroke();
  }
  ctx.strokeStyle = PAL.rail; ctx.lineWidth = 4.5;
  ctx.beginPath(); ctx.arc(g.ax, g.ay, g.rad - BW + 2.2, g.a0, a1, ccw); ctx.stroke();
  ctx.beginPath(); ctx.arc(g.ax, g.ay, g.rad + BW - 2.2, g.a0, a1, ccw); ctx.stroke();
  ink(1.5); ctx.lineCap = 'butt';
  ctx.beginPath(); ctx.arc(g.ax, g.ay, g.rad - BW + 0.4, g.a0, a1, ccw); ctx.stroke();
  ctx.beginPath(); ctx.arc(g.ax, g.ay, g.rad + BW - 0.4, g.a0, a1, ccw); ctx.stroke();
}
function drawBelt(c, r, dir, ghost, bend, under, fork, merge) {
  tileT(c, r);
  ctx.globalAlpha = ghost ? 0.55 : 1;
  const off = (beltClock * BELT_SPEED * T) % SLAT;
  const uf = under ? under.front : 0, ub = under ? under.back : 0;
  if (fork) {
    // curving out of its side into each belt leading away, and straight on as well if the
    // line carries on ahead; the straight run goes down first and the curves over it
    if (ub > 0) { ctx.save(); ctx.rotate(dir * Math.PI / 2); beltRun(-T / 2 - ub, -T / 2, off, dir * Math.PI / 2); ctx.restore(); }
    if (fork.ahead) { ctx.save(); ctx.rotate(dir * Math.PI / 2); beltRun(-T / 2, T / 2 + uf, off, dir * Math.PI / 2); ctx.restore(); }
    for (const o of fork.outs) beltArc(bendGeom(o, dir), off);
  } else if (merge) {
    // belts curving in off its sides, over the straight run if it is fed from behind too
    if (merge.behind) { ctx.save(); ctx.rotate(dir * Math.PI / 2); beltRun(-T / 2 - ub, T / 2 + uf, off, dir * Math.PI / 2); ctx.restore(); }
    else if (uf > 0) { ctx.save(); ctx.rotate(dir * Math.PI / 2); beltRun(T / 2, T / 2 + uf, off, dir * Math.PI / 2); ctx.restore(); }
    for (const s of merge.ins) beltArc(bendGeom(dir, s), off);
  } else if (bend == null) {
    const rot = dir * Math.PI / 2;
    ctx.rotate(rot);
    beltRun(-T / 2 - ub, T / 2 + uf, off, rot);
    // a faint arrow down the middle, so the way it runs is never in doubt
    ctx.fillStyle = 'rgba(150, 104, 66, 0.28)';
    ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-3, -6); ctx.lineTo(-3, 6); ctx.closePath(); ctx.fill();
  } else {
    const g = bendGeom(dir, bend);
    // straight stubs on out under the machines at either end
    for (const [d, x0, x1] of [[dir, T / 2, T / 2 + uf], [bend, -T / 2 - ub, -T / 2]]) {
      if (x1 - x0 <= 0) continue;
      ctx.save(); ctx.rotate(d * Math.PI / 2); beltRun(x0, x1, off, d * Math.PI / 2); ctx.restore();
    }
    beltArc(g, off);
  }
  ctx.globalAlpha = 1;
}
// a chevron painted on the floor at a tile's edge
function drawArrow(dir, alpha) {
  ctx.save();
  ctx.rotate(dir * Math.PI / 2);
  ctx.fillStyle = `rgba(107, 76, 60, ${alpha})`;
  ctx.strokeStyle = `rgba(255, 248, 236, ${alpha * 0.9})`; ctx.lineWidth = 2; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(T / 2 - 7, -8); ctx.lineTo(T / 2 + 2, 0); ctx.lineTo(T / 2 - 7, 8); ctx.closePath();
  ctx.stroke(); ctx.fill();
  ctx.restore();
}

// ---------- donuts ----------
// Amber's three donut pictures (dough ball, raw ring, fried ring) are drawn from above, so
// they go down as they are. Glaze is a ring of icing drawn per flavour, toppings stand on
// top like the stickers they are drawn as.
function drawTopping(t, x, y, size) {
  const def = TOPS[t];
  if (!def) return;
  const im = IMG[`t/${t}`];
  if (ok(im)) {
    const s = size / Math.max(im.naturalWidth, im.naturalHeight);
    ctx.drawImage(im, x - im.naturalWidth * s / 2, y - im.naturalHeight * s / 2, im.naturalWidth * s, im.naturalHeight * s);
    return;
  }
  ctx.save(); ctx.translate(x, y); ctx.scale(size / 22, size / 22);
  if (t === 'chocchips') {
    ctx.fillStyle = '#3e2712';
    for (let i = 0; i < 6; i++) { const a = i * 1.05 + 0.5, rad = 4.5 + (i % 2) * 3; ctx.beginPath(); ctx.arc(Math.cos(a) * rad, Math.sin(a) * rad, 1.9, 0, Math.PI * 2); ctx.fill(); }
  } else if (t === 'cereal') {
    const cols = ['#f2c94c', '#f28c4c', '#c86bd9', '#6cbf5a'];
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) { const a = i * 1.6 + 0.8; ctx.strokeStyle = cols[i]; ctx.beginPath(); ctx.arc(Math.cos(a) * 6.5, Math.sin(a) * 6.5, 2.4, 0, Math.PI * 2); ctx.stroke(); }
  } else if (t === 'glitter') {
    // four-point sparkles, gold and pink
    const pts = [[-6, -3, 3.4, '#f2c94c'], [5, -5, 2.6, '#f7a8c4'], [2, 5, 3, '#f2c94c'], [-4, 6, 2, '#fff3c4'], [8, 3, 2, '#f7a8c4']];
    for (const [px, py, s, col] of pts) {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(px, py - s); ctx.quadraticCurveTo(px, py, px + s, py); ctx.quadraticCurveTo(px, py, px, py + s);
      ctx.quadraticCurveTo(px, py, px - s, py); ctx.quadraticCurveTo(px, py, px, py - s);
      ctx.fill();
    }
  } else if (t === 'cheese') {
    ctx.strokeStyle = '#f2c94c'; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      const a = i * 0.7, rad = 2 + (i % 4) * 2.2;
      const x0 = Math.cos(a) * rad, y0 = Math.sin(a) * rad;
      ctx.beginPath(); ctx.moveTo(x0 - 2.5, y0 - 1); ctx.lineTo(x0 + 2.5, y0 + 1); ctx.stroke();
    }
  } else {
    ctx.font = '13px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(def.ico || '•', 0, 0);
  }
  ctx.restore();
}
function donutBody(it) {
  if (it.stage === 'dough') return 'd/dough';
  if (it.stage === 'ring') return 'd/ring';
  return 'd/fried';
}
// size: across, in the current units; squash: 1 seen from above, less to tip it back
function drawItem(x, y, it, size, squash) {
  size = size || 26;
  if (squash == null) squash = 1;
  const key = donutBody(it);
  let body = IMG[key];
  if (it.stage === 'blob') body = tinted('d/dough', '#c98a3f', 0.62);
  else if (it.stage === 'charcoal') body = tinted('d/fried', '#2e2826', 0.8);
  const side = tinted(it.stage === 'blob' ? 'd/dough' : key, it.stage === 'charcoal' ? '#1b1716' : '#6b4128', it.stage === 'dough' || it.stage === 'ring' ? 0.32 : 0.5);
  const thick = size * 0.13 * (1 - squash) * 2;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(60, 36, 24, 0.22)';
  ctx.beginPath(); ctx.ellipse(size * 0.06, thick + size * 0.08, size * 0.48, size * squash * 0.48, 0, 0, Math.PI * 2); ctx.fill();
  ctx.save();
  ctx.scale(1, squash);
  if (ok(body)) {
    if (thick > 0.3 && ok(side)) ctx.drawImage(side, -size / 2, -size / 2 + thick / squash, size, size);
    ctx.drawImage(body, -size / 2, -size / 2, size, size);
  } else {
    dot(0, 0, size / 2, '#d9a35f', true);
  }
  if (it.glaze && (it.stage === 'donut' || it.stage === 'blob' || it.stage === 'charcoal')) {
    const gl = glazeLayer(it.glaze, it.stage !== 'donut' && it.stage !== 'charcoal');
    if (gl) ctx.drawImage(gl, -size / 2, -size / 2, size, size);
  }
  ctx.restore();
  if (it.stage === 'charcoal') {
    ctx.fillStyle = 'rgba(255, 120, 40, 0.75)';
    ctx.beginPath(); ctx.arc(-size * 0.18, size * squash * 0.12, size * 0.05, 0, Math.PI * 2); ctx.arc(size * 0.2, -size * squash * 0.18, size * 0.04, 0, Math.PI * 2); ctx.fill();
  }
  if (it.filling) {
    // a blob of whatever is inside, peeping out of the side
    ctx.fillStyle = FILLINGS[it.filling].col; ctx.strokeStyle = 'rgba(60, 36, 24, 0.45)'; ctx.lineWidth = size * 0.04;
    ctx.beginPath(); ctx.ellipse(-size * 0.36, size * squash * 0.3, size * 0.12, size * 0.09, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  const tops = it.tops || [];
  const ty = -size * squash * 0.12;
  if (tops.length === 1) drawTopping(tops[0], 0, ty, size * 0.56);
  else if (tops.length >= 2) {
    drawTopping(tops[0], -size * 0.2, ty - size * squash * 0.1, size * 0.48);
    drawTopping(tops[1], size * 0.2, ty + size * squash * 0.08, size * 0.48);
  }
  ctx.restore();
}

// ---------- machines ----------
// Each machine is painted from above inside its own tile: a body with a lit top and a
// sliver of its front face showing, and on top whatever it does, with the donut it is
// working on in plain sight. The body never turns (the light stays put); what turns is
// the chute on the side it pushes out of.
function machineBusy(m) {
  const def = MACHINES[m.type];
  return !!m.cur || (!!def.source && f.cash > CASH_FLOOR && !m.outBuf);
}
const BODY = {
  mixer: { top: '#f3e6cb', face: '#d8c29c' },
  press: { top: '#d6dde4', face: '#a9b4be' },
  fryer: { top: '#d9d5cf', face: '#a8a29a' },
  glazer: { top: '#f7dfe7', face: '#d9aebd' },
  topper: { top: '#cfe2cf', face: '#9fbaa1' },
  filler: { top: '#f3e6c0', face: '#d0bb87' },
  counter: { top: '#d7a874', face: '#a8784b' },
  bin: { top: '#7f9a83', face: '#5c7562' },
};
const HALF = 25, FACE = 6;
// rounded corners only where both sides are open, for a body that runs on to a tile edge
function bodyPath(x0, y0, x1, y1, rad, round) {
  const [tl, tr, br, bl] = round.map((on) => (on ? rad : 0));
  ctx.beginPath();
  ctx.moveTo(x0 + tl, y0);
  ctx.lineTo(x1 - tr, y0); ctx.arcTo(x1, y0, x1, y0 + tr, tr);
  ctx.lineTo(x1, y1 - br); ctx.arcTo(x1, y1, x1 - br, y1, br);
  ctx.lineTo(x0 + bl, y1); ctx.arcTo(x0, y1, x0, y1 - bl, bl);
  ctx.lineTo(x0, y0 + tl); ctx.arcTo(x0, y0, x0 + tl, y0, tl);
  ctx.closePath();
}
function drawBody(type, ext) {
  const col = BODY[type];
  ext = ext || [false, false, false, false];   // run on to the tile's edge: right, down, left, up
  const x0 = ext[2] ? -T / 2 : -HALF, x1 = ext[0] ? T / 2 : HALF;
  const y0 = ext[3] ? -T / 2 : -HALF, y1 = ext[1] ? T / 2 : HALF;
  const round = [!ext[3] && !ext[2], !ext[3] && !ext[0], !ext[1] && !ext[0], !ext[1] && !ext[2]];
  ctx.fillStyle = 'rgba(80, 44, 28, 0.25)';
  bodyPath(x0 + 3, y0 + 5, x1 + 3, y1 + 4, 9, round); ctx.fill();
  bodyPath(x0, y0, x1, y1, 9, round);
  ctx.fillStyle = col.face; ctx.fill();
  ink(1.6); ctx.stroke();
  bodyPath(x0, y0, x1, y1 - FACE, 9, round);
  ctx.fillStyle = col.top; ctx.fill();
  ink(1.4); ctx.stroke();
  // a soft highlight along the top edge
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x0 + 8, y0 + 3); ctx.lineTo(x1 - 8, y0 + 3); ctx.stroke();
}
// the little sage chute a machine pushes out of, on the side it faces
function drawChute(dir) {
  ctx.save();
  ctx.rotate(dir * Math.PI / 2);
  ctx.fillStyle = PAL.rail; rr(HALF - 4, -10, T / 2 - HALF + 3, 20, 3); ctx.fill(); ink(1.3); ctx.stroke();
  ctx.fillStyle = '#5f6f5d'; ctx.fillRect(HALF - 1, -6, 2.5, 12);
  ctx.restore();
}
function steelWell(x, y, w, h, rad) {
  ctx.fillStyle = '#8f969c'; rr(x - 1.5, y - 1.5, w + 3, h + 3, rad + 1.5); ctx.fill();
  ink(1.3); ctx.stroke();
  ctx.fillStyle = '#c5cacf'; rr(x, y, w, h, rad); ctx.fill();
}
function drawMachine(c, r, m, ghost, alone) {
  const def = MACHINES[m.type];
  const busy = !ghost && !alone && machineBusy(m);
  const clock = beltClock + (c * 1.7 + r * 0.9);
  tileT(c, r);
  ctx.globalAlpha = ghost ? 0.6 : 1;
  const bump = m.anim > 0 ? 1 + m.anim * 0.14 : 1;
  if (bump !== 1) ctx.scale(bump, bump);
  const cur = !ghost && m.cur;
  const prog = cur ? 1 - m.t / procTime(m) : 0;
  const top = -HALF, mid = -FACE / 2;      // the middle of the lit top
  if (m.type === 'counter') {
    // a packing table: a box open on it with the donuts going in, and a roll of tape
    drawBody('counter');
    ctx.strokeStyle = 'rgba(120, 80, 46, 0.4)'; ctx.lineWidth = 1.2;
    for (let y = top + 9; y < HALF - FACE - 2; y += 9) { ctx.beginPath(); ctx.moveTo(-HALF + 2, y); ctx.lineTo(HALF - 2, y); ctx.stroke(); }
    const shut = m.anim > 0 ? Math.min(1, m.anim * 3) : 0;   // the lid swings shut on a sale
    ctx.fillStyle = 'rgba(80, 44, 28, 0.2)'; rr(-15, mid - 12, 30, 26, 3); ctx.fill();
    ctx.fillStyle = '#f7c9d6'; rr(-16, mid - 14, 30, 26, 3); ctx.fill(); ink(1.3); ctx.stroke();
    ctx.fillStyle = '#fbeef1'; rr(-13, mid - 11, 24, 20, 2); ctx.fill();
    if (ok(IMG['d/fried'])) {
      drawItem(-6, mid - 4, { stage: 'donut', glaze: 'pink', tops: [] }, 12);
      drawItem(5, mid + 3, { stage: 'donut', glaze: 'choc', tops: [] }, 12);
    }
    // the lid, folded back up the top edge, or down over the box as it shuts
    ctx.fillStyle = '#eeb3c4';
    rr(-16, mid - 14 - 9 * (1 - shut), 30, 9 + 17 * shut, 3); ctx.fill(); ink(1.2); ctx.stroke();
    ctx.fillStyle = '#c56d8c'; ctx.font = `8px ${HAND_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (shut > 0.6) ctx.fillText('Donut Works', -1, mid - 1);
    // a roll of brown tape at the side
    dot(18, HALF - FACE - 8, 4.5, '#c9a46a', true);
    dot(18, HALF - FACE - 8, 1.8, BODY.counter.top, false);
  } else if (m.type === 'bin') {
    ctx.fillStyle = 'rgba(80, 44, 28, 0.25)'; ctx.beginPath(); ctx.arc(3, 4, 19, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = BODY.bin.face; ctx.beginPath(); ctx.arc(0, 1, 19, 0, Math.PI * 2); ctx.fill(); ink(1.6); ctx.stroke();
    const lift = m.anim > 0 ? m.anim * 10 : 0;
    ctx.fillStyle = BODY.bin.top; ctx.beginPath(); ctx.arc(0, -2 - lift, 18, 0, Math.PI * 2); ctx.fill(); ink(1.4); ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, -2 - lift, 12, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#4c6350'; rr(-7, -5 - lift, 14, 6, 3); ctx.fill(); ink(1.2); ctx.stroke();
  } else {
    drawBody(m.type);
    if (!def.sink) drawChute(m.dir);
    if (m.type === 'mixer') {
      // a steel bowl of dough, the beater going round while it mixes
      ctx.fillStyle = '#9aa1a7'; ctx.beginPath(); ctx.arc(2, mid + 1, 17, 0, Math.PI * 2); ctx.fill(); ink(1.4); ctx.stroke();
      ctx.fillStyle = '#d3d7da'; ctx.beginPath(); ctx.arc(2, mid + 1, 14.5, 0, Math.PI * 2); ctx.fill();
      const fill = busy ? 0.5 + 0.5 * (m.t / procTime(m)) : 0.6;
      ctx.fillStyle = '#f1dbb1'; ctx.beginPath(); ctx.arc(2, mid + 1, 12 * fill + 2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(190, 150, 100, 0.6)'; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.arc(2, mid + 1, 6 * fill + 1, beltClock * (busy ? 6 : 0), beltClock * (busy ? 6 : 0) + 4); ctx.stroke();
      // the beater arm from the column at the back
      ctx.save(); ctx.translate(2, mid + 1); ctx.rotate(busy ? beltClock * 6 : 0.6);
      ctx.strokeStyle = '#8a8f94'; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.ellipse(0, 0, 8, 3.5, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = BODY.mixer.top; rr(-21, -22, 10, 26, 5); ctx.fill(); ink(1.3); ctx.stroke();
      ctx.fillStyle = '#f9f0dc'; rr(-21, -16, 26, 9, 4.5); ctx.fill(); ink(1.3); ctx.stroke();
      dot(-16, 12, 2.6, busy ? '#7fae95' : '#c9b8a8', true);
    } else if (m.type === 'press') {
      // the bed with a ring cutter over it, coming down as it punches
      steelWell(-15, mid - 15, 30, 30, 5);
      if (cur) drawItem(0, mid, m.cur, 22);
      const down = cur ? Math.max(0, Math.sin(prog * Math.PI)) : 0;
      ctx.save(); ctx.translate(0, mid); ctx.scale(1 - down * 0.12, 1 - down * 0.12);
      ctx.fillStyle = `rgba(150, 160, 170, ${cur ? 0.55 : 0.95})`;
      ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.arc(0, 0, 5, 0, Math.PI * 2, true); ctx.fill('evenodd');
      ink(1.4); ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = '#7d8790'; ctx.fillRect(-21, mid - 13, 4, 26); ctx.fillRect(17, mid - 13, 4, 26);
    } else if (m.type === 'fryer') {
      // a vat of hot oil, bubbling round whatever is in it
      ctx.fillStyle = '#8f969c'; rr(-19, mid - 17, 38, 34, 8); ctx.fill(); ink(1.4); ctx.stroke();
      const g = ctx.createRadialGradient(-4, mid - 5, 2, 0, mid, 22);
      g.addColorStop(0, '#f2c25a'); g.addColorStop(1, '#c77d22');
      ctx.fillStyle = g; rr(-16, mid - 14, 32, 28, 6); ctx.fill();
      // the frying basket, a wire mesh under the oil
      ctx.strokeStyle = 'rgba(120, 70, 20, 0.35)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = -12; x <= 12; x += 4) { ctx.moveTo(x, mid - 11); ctx.lineTo(x, mid + 11); }
      for (let y = -10; y <= 10; y += 4) { ctx.moveTo(-13, mid + y); ctx.lineTo(13, mid + y); }
      ctx.stroke();
      ctx.strokeStyle = '#6f757a'; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(0, mid - 14); ctx.lineTo(0, -HALF + 1); ctx.stroke();
      if (cur) {
        drawItem(0, mid, m.cur, 22);
        ctx.fillStyle = `rgba(150, 80, 20, ${0.25 * (1 - prog)})`; ctx.beginPath(); ctx.arc(0, mid, 11, 0, Math.PI * 2); ctx.fill();
      }
      if (busy) {
        ctx.fillStyle = 'rgba(255, 244, 200, 0.75)';
        for (let i = 0; i < 6; i++) {
          const k = (clock * 1.3 + i * 0.37) % 1;
          const a = i * 2.1 + Math.floor(clock * 1.3 + i * 0.37) * 1.7;
          ctx.beginPath(); ctx.arc(Math.cos(a) * 11, mid + Math.sin(a) * 9, 0.8 + k * 1.8, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(-12, mid - 10); ctx.lineTo(-4, mid - 12); ctx.stroke();
      dot(15, HALF - FACE - 4, 2.4, busy ? '#e0784f' : '#c9b8a8', true);
    } else if (m.type === 'glazer') {
      // a bath of icing in the flavour it is set to
      const gz = GLAZES[m.cfg] || GLAZES.sugar;
      ctx.fillStyle = '#a7aeb3'; rr(-19, mid - 15, 38, 30, 7); ctx.fill(); ink(1.4); ctx.stroke();
      ctx.fillStyle = gz.col; rr(-16, mid - 12, 32, 24, 5); ctx.fill();
      ctx.strokeStyle = gz.edge; ctx.lineWidth = 1.2;
      for (let i = 0; i < 2; i++) {
        const k = ((clock * 0.6 + i * 0.5) % 1);
        ctx.globalAlpha = (ghost ? 0.6 : 1) * (1 - k) * 0.7;
        ctx.beginPath(); ctx.ellipse(0, mid, 5 + k * 10, 4 + k * 7, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = ghost ? 0.6 : 1;
      if (cur) drawItem(0, mid, { ...m.cur, glaze: prog > 0.5 ? m.cfg : m.cur.glaze }, 22);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(-12, mid - 8); ctx.lineTo(-5, mid - 10); ctx.stroke();
    } else if (m.type === 'topper') {
      // a donut waits under a glass hopper full of the topping
      if (cur) drawItem(-2, mid + 6, { ...m.cur, tops: prog > 0.5 ? [...(m.cur.tops || []), m.cfg].slice(0, 2) : m.cur.tops }, 22);
      else { ctx.fillStyle = 'rgba(120, 150, 122, 0.4)'; ctx.beginPath(); ctx.arc(-2, mid + 6, 10, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = 'rgba(230, 245, 245, 0.55)'; ctx.beginPath(); ctx.arc(8, mid - 8, 11, 0, Math.PI * 2); ctx.fill(); ink(1.3); ctx.stroke();
      if (m.cfg) { drawTopping(m.cfg, 4, mid - 11, 12); drawTopping(m.cfg, 12, mid - 9, 11); drawTopping(m.cfg, 7, mid - 3, 11); }
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(8, mid - 8, 7.5, Math.PI * 1.1, Math.PI * 1.5); ctx.stroke();
    } else if (m.type === 'filler') {
      // a piping bag of the filling, its nozzle over the donut
      const fc = (FILLINGS[m.cfg] || FILLINGS.jam || { col: '#c84b5a' }).col;
      if (cur) drawItem(-3, mid + 3, m.cur, 22);
      else { ctx.fillStyle = 'rgba(150, 130, 90, 0.35)'; ctx.beginPath(); ctx.arc(-3, mid + 3, 10, 0, Math.PI * 2); ctx.fill(); }
      const squeeze = cur ? Math.sin(prog * Math.PI) * 2 : 0;
      ctx.save(); ctx.translate(10, mid - 6); ctx.rotate(0.7);
      ctx.fillStyle = '#fbf6ec'; ctx.beginPath(); ctx.moveTo(-8 + squeeze, -12); ctx.quadraticCurveTo(0, -16, 8 - squeeze, -12); ctx.lineTo(1.5, 12); ctx.lineTo(-1.5, 12); ctx.closePath(); ctx.fill(); ink(1.3); ctx.stroke();
      ctx.fillStyle = fc; ctx.beginPath(); ctx.moveTo(-6 + squeeze, -8); ctx.lineTo(6 - squeeze, -8); ctx.lineTo(1, 8); ctx.lineTo(-1, 8); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#b7bdc2'; ctx.fillRect(-2, 10, 4, 5);
      ctx.restore();
    }
  }
  if (bump !== 1) { tileT(c, r); }
  // level pips along the front face
  for (let i = 0; i < m.lvl; i++) dot(-HALF + 7 + i * 6.5, HALF - FACE / 2, 2.2, PAL.rose, false);
  // progress, a thin bar along the front
  if (!ghost && !alone && (m.cur || (def.source && f.cash > CASH_FLOOR))) {
    const frac = def.source ? m.t / procTime(m) : prog;
    ctx.fillStyle = 'rgba(70, 40, 26, 0.35)'; rr(-12, HALF + 2, 24, 3.5, 1.75); ctx.fill();
    ctx.fillStyle = PAL.roseDark; rr(-12, HALF + 2, 24 * Math.max(0, Math.min(1, frac)), 3.5, 1.75); ctx.fill();
  }
  if (!alone && def.source && f.cash <= CASH_FLOOR) {
    ctx.fillStyle = '#c06a5a'; ctx.font = `bold 9px ${UI_FONT}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('NO FLOUR £', 0, HALF + 5);
  }
  ctx.globalAlpha = 1;
  if (alone) return;
  // things waiting at its doors
  const at = (d, k) => ({ x: DX[d] * k, y: DY[d] * k });
  if (m.outBuf) { const q = at(m.dir, 24); drawItem(q.x, q.y, m.outBuf, 20); }
}
function cfgLabel(m) {
  const k = MACHINES[m.type].cfgKind;
  if (!k || !m.cfg || k === 'batch') return null;
  const tbl = k === 'glaze' ? GLAZES : k === 'fill' ? FILLINGS : k === 'top' ? TOPS : BATCHES;
  const d = tbl[m.cfg];
  return d ? d.short || d.name : null;
}
// a little card tied to the front of the machine, written by hand
function drawTag(x, y, text, ghost) {
  ctx.save();
  ctx.globalAlpha = ghost ? 0.55 : 1;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `12px ${HAND_FONT}`;
  const w = ctx.measureText(text).width;
  ctx.fillStyle = 'rgba(94, 56, 36, 0.22)';
  rr(x - w / 2 - 5, y - 5, w + 10, 13, 4); ctx.fill();
  ctx.fillStyle = '#fffaf0';
  rr(x - w / 2 - 5, y - 7, w + 10, 13, 4); ctx.fill();
  ink(1.1); ctx.stroke();
  ctx.fillStyle = PAL.ink; ctx.fillText(text, x, y);
  ctx.restore();
}
function drawStuckBadge(x, y) {
  ctx.save();
  ctx.fillStyle = '#c06a5a';
  ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#fff8ec'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#fff8ec'; ctx.font = `bold 14px ${UI_FONT}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('!', x, y + 0.5);
  ctx.restore();
}
function drawTip(x, y, text) {
  ctx.save();
  ctx.font = `15px ${HAND_FONT}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const w = ctx.measureText(text).width + 22;
  const v = seen();
  const cx = Math.max(v.x0 + w / 2 + 6, Math.min(v.x1 - w / 2 - 6, x));
  const cy = Math.max(v.y0 + 20, y);
  ctx.fillStyle = 'rgba(91, 64, 52, 0.95)';
  rr(cx - w / 2, cy - 14, w, 28, 11); ctx.fill();
  ctx.fillStyle = '#fdf3e4'; ctx.fillText(text, cx, cy + 0.5);
  ctx.restore();
}
// where an item on a belt is, in tile px from the floor's corner
function beltPos(c, r, dir, p, bend, out, inn) {
  const cx = c * T + T / 2, cy = r * T + T / 2;
  if (inn != null && inn !== dir) {
    // round the curve a merge takes in off its side
    const g = bendGeom(dir, inn), a = g.a0 + g.d * p;
    return { x: cx + g.ax + Math.cos(a) * g.rad, y: cy + g.ay + Math.sin(a) * g.rad };
  }
  if (out != null && out !== dir) {
    // round the curve a fork takes into its side
    const g = bendGeom(out, dir), a = g.a0 + g.d * p;
    return { x: cx + g.ax + Math.cos(a) * g.rad, y: cy + g.ay + Math.sin(a) * g.rad };
  }
  if (bend != null && p >= 0.5) {
    const g = bendGeom(dir, bend);
    const a = g.a0 + g.d * ((p - 0.5) * 2);
    return { x: cx + g.ax + Math.cos(a) * g.rad, y: cy + g.ay + Math.sin(a) * g.rad };
  }
  return { x: cx + DX[dir] * (p - 0.5) * T, y: cy + DY[dir] * (p - 0.5) * T };
}

// The build list, the bench and the unlock cards all want a picture of each thing, drawn
// by the same painters as the floor onto a small canvas.
const iconCache = {};
function toolIcon(id) {
  if (iconCache[id]) return iconCache[id];
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const prev = ctx, pv = { ...view }, clock = beltClock;
  ctx = cv.getContext('2d');
  const p = scr(0, 0);
  Object.assign(view, { s: 1, dpr: 1, x: 32 - p.x, y: 31 - p.y });
  beltClock = 0;
  if (id === 'belt') drawBelt(0, 0, 0, false, null);
  else if (MACHINES[id]) drawMachine(0, 0, f.newMachine(id, 0), false, true);
  else {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(32, 32);
    ctx.fillStyle = '#fdf3e6'; rr(-19, -19, 38, 38, 9); ctx.fill(); ink(2); ctx.stroke();
    ink(4, '#c06a5a');
    ctx.beginPath(); ctx.moveTo(-8, -8); ctx.lineTo(8, 8); ctx.moveTo(8, -8); ctx.lineTo(-8, 8); ctx.stroke();
  }
  ctx = prev; Object.assign(view, pv); beltClock = clock;
  return (iconCache[id] = cv.toDataURL('image/png'));
}
function icoImg(id) { return `<img src="${toolIcon(id)}" alt="" />`; }
function topIco(t) { return TOP_ART.includes(t) ? `<img src="${spriteUrl(`t/${t}`)}" alt="" />` : (TOPS[t].ico || '•'); }

// ---------- picking ----------
function scenePt(ev) {
  const rect = canvas.getBoundingClientRect();
  return { x: (ev.clientX - rect.left - view.x) / view.s, y: (ev.clientY - rect.top - view.y) / view.s };
}
function floorTile(pt) {
  const c = Math.floor((pt.x - FX) / T), r = Math.floor((pt.y - FY) / T);
  if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return null;
  return { c, r };
}
// the tile a machine stands in, as a box in the scene
function machineBox(c, r) {
  const p = scr(c, r);
  return { x0: p.x - T / 2, x1: p.x + T / 2, y0: p.y - T / 2, y1: p.y + T / 2, w: T, h: T, p };
}

// How far a belt runs on under the machines at its ends: the one it feeds into, and the
// one it is fed from at the back (a bend's back is the side it takes from).
function beltUnder(c, r, dir, bend) {
  const reach = (cc, rr2) => {
    const t = f.grid[rr2] && f.grid[rr2][cc];
    if (!t || t.kind !== 'machine') return 0;
    return t.type === 'bin' ? 4 : 10;
  };
  const back = bend == null ? dir : bend;
  const intoHatch = c === COLS - 1 && dir === 0 && HATCH_ROWS.includes(r);
  return { front: intoHatch ? 18 : reach(c + DX[dir], r + DY[dir]), back: reach(c - DX[back], r - DY[back]) };
}

// The belts next to the pointer that would change shape if what is in hand went down: the
// belt as it is now is faded out, and its new shape drawn see-through over it, like the
// piece in hand.
const newBeltGhost = (dir) => ({ kind: 'belt', dir, items: [] });
function ghostAround(c, r, thing) {
  for (const n of f.shapesAround(c, r, thing)) {
    tileT(n.c, n.r);
    ctx.fillStyle = `rgba(${PAL.tile}, 0.9)`;
    ctx.fillRect(-T / 2 + 1, -T / 2 + 1, T - 2, T - 2);
    const sh = n.shape;
    drawBelt(n.c, n.r, n.dir, true, sh.bend == null ? null : sh.bend, null, sh.fork, sh.merge);
  }
}

// ---------- drawing a frame ----------
function tileMark(c, r, fill, stroke, dash) {
  tileT(c, r);
  rr(-T / 2 + 2, -T / 2 + 2, T - 4, T - 4, 8);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 3; if (dash) ctx.setLineDash([7, 5]); ctx.stroke(); ctx.setLineDash([]); }
}
function draw() {
  const grid = f.grid;
  if (!view.w) fitView();
  drawRoom();
  // belts first, then what rides on them, then the machines standing over the ends
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const t = grid[r][c];
    if (t && t.kind === 'belt') { const bend = f.bendAt(c, r); drawBelt(c, r, t.dir, false, bend, beltUnder(c, r, t.dir, bend), f.forkAt(c, r), f.mergeAt(c, r)); }
  }
  // selection and hover, on the floor under everything that stands up
  if (selected && grid[selected.r][selected.c]) tileMark(selected.c, selected.r, 'rgba(217,123,152,0.22)', '#d97b98');
  if (hover && !tool && !(drag && drag.moved)) tileMark(hover.c, hover.r, 'rgba(255,248,232,0.25)', null);
  // which way things go: chevrons on the floor at each machine's doors
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const t = grid[r][c];
    if (!t || t.kind !== 'machine' || MACHINES[t.type].sink) continue;
    tileT(c, r);
    drawArrow(t.dir, 0.8);
  }
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const t = grid[r][c];
    if (t && t.kind === 'machine') drawMachine(c, r, t, false);
  }
  sceneT();
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const t = grid[r][c];
    if (!t || t.kind !== 'belt') continue;
    const bend = f.bendAt(c, r);
    for (const e of t.items) {
      const q = beltPos(c, r, t.dir, e.p, bend, e.out, e.inn), s = fl(q.x, q.y);
      drawItem(s.x, s.y, e.it, 26);
    }
  }
  sceneT(); paintHatch();
  // tags saying what each machine is set to, over the top so nothing hides them
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const t = grid[r][c];
    if (!t || t.kind !== 'machine') continue;
    const lab = cfgLabel(t);
    if (lab) { const p = scr(c, r); drawTag(p.x, p.y - T / 2 + 1, lab, false); }
  }
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const t = grid[r][c];
    if (!t) continue;
    if (t.kind === 'machine' && t.stuck > STUCK_AFTER && HARD_BLOCK[t.why]) {
      const p = scr(c, r);
      drawStuckBadge(p.x + T / 2 - 9, p.y - T / 2 + 9);
    } else if (t.kind === 'belt') {
      const bend = f.bendAt(c, r);
      for (const e of t.items) {
        if (!(e.stuck > STUCK_AFTER && HARD_BLOCK[e.why])) continue;
        const q = beltPos(c, r, t.dir, e.p, bend, e.out, e.inn), s = fl(q.x, q.y);
        drawStuckBadge(s.x + 12, s.y - 14);
      }
    }
  }
  // where the thing in your hand is going
  if (drag && drag.moved) {
    const a = grid[drag.from.r][drag.from.c];
    const { c, r } = drag.at;
    tileMark(c, r, 'rgba(217,123,152,0.16)', '#d97b98', true);
    if (a) { if (a.kind === 'belt') drawBelt(c, r, a.dir, true, null); else drawMachine(c, r, a, true); }
    sceneT();
    if (grid[r][c]) { const p = scr(c, r); drawTag(p.x, p.y - T / 2 - 6, 'swap', false); }
  } else if (hover && tool && !painting) {
    // ghost of the tool
    const { c, r } = hover;
    const occupied = !!grid[r][c];
    if (tool === 'belt') {
      if (!occupied || grid[r][c].kind === 'belt') {
        ghostAround(c, r, newBeltGhost(toolDir));
        const sh = f.shapeIf(c, r, toolDir); drawBelt(c, r, toolDir, true, sh.bend == null ? null : sh.bend, null, sh.fork, sh.merge); tileT(c, r); drawArrow(toolDir, 0.7);
      }
      else tileMark(c, r, 'rgba(192,106,90,0.27)', null);
    } else if (tool === 'remove') {
      tileMark(c, r, 'rgba(192,106,90,0.32)', '#c06a5a');
    } else if (!occupied) {
      const ghost = f.newMachine(tool, toolDir);
      if (!f.canAfford(MACHINES[tool].cost)) tileMark(c, r, 'rgba(192,106,90,0.32)', null);
      ghostAround(c, r, ghost);
      drawMachine(c, r, ghost, true);
      if (!MACHINES[tool].sink) { tileT(c, r); drawArrow(toolDir, 0.8); }
      sceneT();
      const p = scr(c, r);
    } else {
      tileMark(c, r, 'rgba(192,106,90,0.27)', null);
    }
  }
  sceneT();
  // steam
  for (const p of puffs) {
    const k = p.t / p.life;
    ctx.fillStyle = `rgba(255,251,242,${0.65 * (1 - k)})`;
    ctx.beginPath(); ctx.arc(p.x, p.y + p.vy * p.t, 3.5 + k * 7, 0, Math.PI * 2); ctx.fill();
  }
  // floating text
  const v = seen();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const fl of floats) {
    if (fl.t < 0) continue;
    const k = fl.t / fl.life;
    const y = fl.y - k * 38;
    const a = k > 0.7 ? (1 - k) / 0.3 : 1;
    ctx.font = fl.bubble ? `${fl.size + 3}px ${HAND_FONT}` : `bold ${fl.size + 1}px ${UI_FONT}`;
    if (fl.bubble) {
      const w = ctx.measureText(fl.text).width + 16;
      const x = Math.max(v.x0 + w / 2 + 4, Math.min(v.x1 - w / 2 - 4, fl.x));
      ctx.fillStyle = `rgba(255,250,240,${0.96 * a})`; rr(x - w / 2, y - 12, w, 24, 12); ctx.fill();
      ctx.strokeStyle = `rgba(107,76,60,${0.5 * a})`; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.fillStyle = `rgba(91,64,52,${a})`; ctx.fillText(fl.text, x, y + 0.5);
    } else {
      const x = Math.max(v.x0 + 34, Math.min(v.x1 - 34, fl.x));
      ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.strokeStyle = `rgba(255,250,240,${0.92 * a})`; ctx.strokeText(fl.text, x, y);
      ctx.fillStyle = fl.col; ctx.globalAlpha = a; ctx.fillText(fl.text, x, y); ctx.globalAlpha = 1;
    }
  }
  // hover a stuck tile and it tells you what is wrong
  if (hover && !tool) {
    const st = f.tileStuck(hover.c, hover.r);
    if (st) { const p = scr(hover.c, hover.r); drawTip(p.x, p.y - 50, blockText(st)); }
  }
  if (speed === 0) {
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    const cx = view.x + SCENE_W * view.s / 2;
    ctx.fillStyle = 'rgba(91, 64, 52, 0.8)'; rr(cx - 50, view.h * 0.42 - 15, 100, 30, 15); ctx.fill();
    ctx.fillStyle = '#fdf3e4'; ctx.font = `18px ${HAND_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Paused', cx, view.h * 0.42);
  }
}

// Steam off any fryer that is cooking. Decoration only, so it lives here, not in the sim.
function steam(dt) {
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const m = f.grid[r][c];
    if (!m || m.kind !== 'machine' || m.type !== 'fryer' || !m.cur || Math.random() >= dt * 3) continue;
    const p = scr(c, r);
    puffs.push({ x: p.x - 12 + Math.random() * 24, y: p.y - 6, vy: -20 - Math.random() * 12, t: 0, life: 0.9 + Math.random() * 0.5 });
  }
  for (const fl of floats) fl.t += dt;
  floats = floats.filter((fl) => fl.t < fl.life);
  for (const p of puffs) p.t += dt;
  puffs = puffs.filter((p) => p.t < p.life);
}

// ---------- main loop ----------
let saveTimer = 0, benchJam = '';
function frame(dt) {
  const run = dt * speed;
  if (run > 0) { f.step(run); steam(run); }
  beltClock = f.simTime;
  // the bench only redraws when something marks it dirty, and a line jamming up is not
  // something the player did, so watch for it here
  if (selected) {
    const j = f.tileStuck(selected.c, selected.r) || '';
    if (j !== benchJam) { benchJam = j; dirty(); }
  } else if (benchJam) benchJam = '';
  saveTimer += dt;
  if (saveTimer > 5) { saveTimer = 0; save.save(f.serialize()); }
  draw();
  if (dirtyUI) { dirtyUI = false; renderSide(); renderBench(); }
  renderHud();
}
const loop = frameLoop(frame, { maxDt: 0.1 });

// ---------- HUD ----------
const $ = (id) => document.getElementById(id);
function currentSpecial() { return f.special && f.level >= SPECIAL_FROM_LEVEL ? RECIPES.find((r) => r.id === f.special.id) : null; }
function renderHud() {
  const spec = currentSpecial();
  const key = `${f.cash}|${f.level}|${f.sold}|${f.perMinute}|${f.goals.map((g) => `${g.count}.${g.kinds.size}`).join(',')}|${spec ? spec.id : ''}|${spec ? Math.ceil(f.special.until - f.simTime) : ''}`;
  if (key === hudCache) return;
  hudCache = key;
  $('hud-cash').textContent = money(f.cash);
  $('hud-cash').style.color = f.cash < 0 ? '#b8483a' : '';
  $('hud-level').textContent = `${f.level + 1} · ${levelDef(f.level).name}`;
  renderOrderTip();
  $('hud-sold').textContent = f.sold;
  $('hud-rate').textContent = f.perMinute;
  if ($('hud-special-wrap').hidden !== !spec) { $('hud-special-wrap').hidden = !spec; fitView(); }
  if (spec) {
    $('hud-special').textContent = spec.name;
    $('hud-special-time').textContent = fmtTime(f.special.until - f.simTime);
    const th = $('special-thumb');
    if (th.dataset.recipe !== spec.id || !th.dataset.drawn) {
      th.dataset.recipe = spec.id;
      th.dataset.drawn = ok(IMG['d/fried']) && glazeLayer(spec.glaze || 'sugar') ? '1' : '';
      drawRecipeThumb(th);
    }
    $('hud-special-tip').innerHTML = `<b>${spec.name}</b> — ${recipeParts(spec)}.<br>` +
      `Sell one before the timer runs out and it pays <b>${pence(recipeValue(spec) * 2)}</b> instead of ${pence(recipeValue(spec))}. ` +
      `Any other donut pays as usual.`;
  }
  if (tab === 'goals') updateGoalBars();
}
function fmtTime(s) { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
// The level box doubles as the order board: what is left to do, at a glance.
function renderOrderTip() {
  const L = levelDef(f.level);
  const goals = f.goals;
  const badge = $('tab-goal-badge');
  const parts = [`<b>Order ${f.level + 1}${L.standing ? '' : ' of ' + LEVELS.length} — ${L.name}</b>`];
  for (const g of goals) {
    parts.push(`<div class="tip-goal${goalDone(g) ? ' done' : ''}"><span class="n">${goalCount(g)}</span><span>${g.label}</span></div>`);
    const needs = goalNeeds(g);
    if (needs && !goalDone(g)) parts.push(`<div style="opacity:.75;margin:-2px 0 4px 0">${needs.replace(/<\/?b>/g, '')}</div>`);
  }
  parts.push(`<div class="tip-foot">Pays ${money(L.bonus)}. Click for the full order board.</div>`);
  $('hud-level-tip').innerHTML = parts.join('');
  const total = goals.reduce((a, g) => a + Math.min(g.count, g.n), 0);
  const need = goals.reduce((a, g) => a + g.n, 0);
  $('hud-level-bar').style.width = `${need ? Math.min(100, total / need * 100) : 0}%`;
  badge.hidden = false;
  badge.textContent = `${total}/${need}`;
  badge.classList.toggle('done', goals.every(goalDone));
}

// ---------- side panel ----------
function renderSide() {
  const body = $('side-body');
  if (tab === 'build') body.innerHTML = buildTab();
  else if (tab === 'goals') body.innerHTML = goalsTab();
  else body.innerHTML = recipesTab();
  if (tab === 'recipes') body.querySelectorAll('canvas[data-recipe]').forEach(drawRecipeThumb);
  if (tab === 'recipes') reanchorTip(); else hideTip();
}
function buildTab() {
  const rows = [];
  rows.push(`<p class="hint">Pick a tool, click the floor to place. <kbd>R</kbd> turns it, <kbd>right-click</kbd> takes things back for a partial refund, <kbd>Esc</kbd> puts the tool down. Placing anything over an occupied tile replaces it at the take-back rate. Drag with the belt tool to paint a run.</p>`);
  rows.push(toolBtn('belt', icoImg('belt'), 'Belt', 'Carries things along. Runs into the side of another belt to merge.', BELT_COST));
  for (const type of Object.keys(MACHINES)) {
    if (!f.unlocked.machines.includes(type)) continue;
    const d = MACHINES[type];
    rows.push(toolBtn(type, icoImg(type), d.name, d.desc, d.cost));
  }
  rows.push(toolBtn('remove', icoImg('remove'), 'Take back', 'Remove a belt or machine. Partial refund, the same for both.', null));
  const locked = Object.keys(MACHINES).filter((t) => !f.unlocked.machines.includes(t));
  if (locked.length) {
    rows.push('<h3>Still to unlock</h3>');
    for (const type of locked) {
      const d = MACHINES[type];
      const lvl = LEVELS.findIndex((L) => (L.unlock.machines || []).includes(type));
      const when = lvl < 0 ? 'Not yet.' : `Fill order ${lvl + 1}, ${levelDef(lvl).name}.`;
      rows.push(`<div class="tool locked"><span class="ico">${icoImg(type)}</span><span class="grow"><span class="name">${d.name}</span><span class="desc">${when}</span></span></div>`);
    }
  }
  return rows.join('');
}
function toolBtn(id, ico, name, desc, cost) {
  const active = tool === id ? ' active' : '';
  const poor = cost != null && !f.canAfford(cost) ? ' poor' : '';
  return `<button type="button" class="tool${active}${poor}" data-tool="${id}"><span class="ico">${ico}</span><span class="grow"><span class="name">${name}</span><span class="desc">${desc}</span></span>${cost != null ? `<span class="cost">${money(cost)}</span>` : ''}</button>`;
}
function goalsTab() {
  const parts = [];
  const L = levelDef(f.level);
  if (L) {
    parts.push(`<div class="order"><div class="who">Order ${f.level + 1}${L.standing ? '' : ' of ' + LEVELS.length} · ${L.who}</div><div class="what">${L.name}</div><div class="blurb">&ldquo;${L.blurb}&rdquo;</div>`);
    for (const g of f.goals) parts.push(goalHtml(g));
    parts.push(`<div class="reward">Pays <b>${money(L.bonus)}</b>${unlockSummary(L.unlock)}</div>`);
    if (L.hint) parts.push(`<p class="hint" style="margin-top:8px">${L.hint}</p>`);
    parts.push('</div>');
  }
  const spec = currentSpecial();
  if (spec) {
    parts.push(`<div class="special"><span class="timer" id="special-timer">${fmtTime(f.special.until - f.simTime)}</span><b>Special: ${spec.name}</b> pays double.<br><span class="hint">${recipeParts(spec)}</span></div>`);
  } else if (f.level < SPECIAL_FROM_LEVEL) {
    parts.push(`<p class="hint">A specials board turns up once the shop trusts you with a glazer or two.</p>`);
  }
  parts.push(`<h3>Tally</h3><p class="hint">${f.sold} sold, ${f.discovered.size} of ${RECIPES.length} recipes found${f.binned ? `, ${f.binned} binned` : ''}.</p>`);
  return parts.join('');
}
function unlockSummary(u) {
  const n = (u.machines || []).length + (u.glazes || []).length + (u.tops || []).length + (u.fillings || []).length;
  if (!n) return '.';
  const names = [];
  for (const m of u.machines || []) names.push(MACHINES[m].name.toLowerCase());
  for (const g of u.glazes || []) names.push(GLAZES[g].name.toLowerCase());
  for (const fl of u.fillings || []) names.push(FILLINGS[fl].name.toLowerCase());
  for (const t of u.tops || []) names.push(TOPS[t].name.toLowerCase());
  return ` and unlocks ${names.join(', ')}.`;
}
function goalHtml(g) {
  const done = goalDone(g);
  const count = goalCount(g);
  const needs = goalNeeds(g);
  return `<div class="goal${done ? ' done' : ''}" data-goal="${g.label}"><span class="count">${count}</span>${g.label}${needs ? `<div class="needs">${needs}</div>` : ''}<div class="bar"><i style="width:${Math.min(100, g.count / g.n * 100)}%"></i></div></div>`;
}
function goalCount(g) {
  return g.distinct ? `${Math.min(g.count, g.n)}/${g.n} · ${g.kinds.size}/${g.distinct} kinds` : `${Math.min(g.count, g.n)}/${g.n}`;
}
// A one-line "make this" for a goal, so you never have to guess what it wants.
function recipeLine(r) {
  const bits = [r.glaze ? GLAZES[r.glaze].name : 'no glaze'];
  bits.push(r.filling ? `${FILLINGS[r.filling].name} filling` : 'no filling');
  bits.push(r.tops.length ? r.tops.map((t) => TOPS[t].name).join(' + ') : 'nothing on top');
  return bits.join(', ');
}
function goalNeeds(g) {
  const fl = g.filter;
  if (fl.recipe) {
    const r = RECIPES.find((x) => x.id === fl.recipe);
    return r ? `<b>${r.name}</b> = ${recipeLine(r)}.` : '';
  }
  if (fl.glazed) return 'Any fried donut that has been through a glazer, whatever flavour.';
  if (fl.named) return 'Any exact combination from the recipe book — hover one there to see what it takes.';
  if (fl.silly) return `Anything with ${Object.keys(TOPS).filter((t) => TOPS[t].silly).map((t) => TOPS[t].short.toLowerCase()).join(', ')} on top.`;
  if (fl.stage === 'donut') return 'Dough, then a ring press, then a fryer, then the hatch to the shop.';
  return '';
}
function updateGoalBars() {
  const els = document.querySelectorAll('.goal');
  f.goals.forEach((g, i) => {
    const el = els[i]; if (!el) return;
    el.querySelector('i').style.width = `${Math.min(100, g.count / g.n * 100)}%`;
    el.querySelector('.count').textContent = goalCount(g);
    el.classList.toggle('done', goalDone(g));
  });
  const t = $('special-timer');
  if (t && f.special) t.textContent = fmtTime(f.special.until - f.simTime);
}
function recipeParts(r) {
  const bits = [];
  bits.push(r.glaze ? GLAZES[r.glaze].name : 'No glaze');
  if (r.filling) bits.push(`${FILLINGS[r.filling].name} filling`);
  for (const t of r.tops) bits.push(TOPS[t].name);
  return bits.join(' · ');
}
// Which machine has to be set to what, in the order a donut meets them.
function recipeSteps(r) {
  const u = f.unlocked;
  const rows = [
    { k: 'Fryer', v: 'A fried donut to start with (mixer, press, fryer).', ok: true },
    { k: 'Glazer', v: r.glaze ? GLAZES[r.glaze].name : 'None — leave the glaze off entirely.', ok: !r.glaze || u.glazes.includes(r.glaze) },
    { k: 'Filler', v: r.filling ? FILLINGS[r.filling].name : 'None — nothing in the middle.', ok: !r.filling || u.fillings.includes(r.filling) },
  ];
  if (r.tops.length) {
    for (const t of r.tops) rows.push({ k: rows.some((x) => x.k === 'Topper') ? 'and' : 'Topper', v: TOPS[t].name, ok: u.tops.includes(t) });
  } else {
    rows.push({ k: 'Topper', v: 'None — nothing on top.', ok: true });
  }
  return rows;
}
function recipeTip(r, known) {
  const parts = [`<div class="t-name">${known ? r.name : 'An undiscovered recipe'}</div>`];
  for (const row of recipeSteps(r)) {
    parts.push(`<div class="t-row"><span class="k">${row.k}</span><span class="v"${row.ok ? '' : ' style="opacity:.6"'}>${row.v}${row.ok ? '' : ' (locked)'}</span></div>`);
  }
  parts.push(`<div class="t-row"><span class="k">Pays</span><span class="v">${pence(recipeValue(r))}, against ${pence(VALUE.donut + (r.glaze ? VALUE.glaze : 0) + (r.filling ? VALUE.filling : 0) + r.tops.length * VALUE.top)} for the same donut unnamed.</span></div>`);
  if (!f.recipeCraftable(r)) parts.push(`<div class="t-locked">Something in this is still locked — fill more orders.</div>`);
  else if (!known) parts.push(`<div class="t-foot">Everything for it is in the cupboard. Sell one to add it to the book.</div>`);
  if (known && r.quip) parts.push(`<div class="t-foot">${r.quip}</div>`);
  return parts.join('');
}

// ---------- floating tooltip ----------
const TIPS = new Map();
let tipEl = null, tipKey = null;
function tipNode() {
  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.id = 'tip';
    tipEl.hidden = true;
    document.body.appendChild(tipEl);
  }
  return tipEl;
}
function showTip(el, html, key) {
  const n = tipNode();
  tipKey = key || null;
  n.innerHTML = html;
  n.hidden = false;
  const r = el.getBoundingClientRect(), box = n.getBoundingClientRect();
  let left = r.left - box.width - 10;
  if (left < 8) left = Math.min(r.right + 10, window.innerWidth - box.width - 8);
  n.style.left = `${Math.max(8, left)}px`;
  n.style.top = `${Math.max(8, Math.min(r.top, window.innerHeight - box.height - 8))}px`;
}
function hideTip() { tipKey = null; if (tipEl) tipEl.hidden = true; }
// The side panel redraws as donuts sell; put the tooltip back on its row.
function reanchorTip() {
  if (!tipKey) return;
  const row = document.querySelector(`[data-tip="${tipKey}"]`);
  const html = TIPS.get(tipKey);
  if (row && html) showTip(row, html, tipKey); else hideTip();
}
function recipesTab() {
  const u = f.unlocked;
  const parts = [];
  parts.push(`<p class="hint">A plain donut is ${pence(VALUE.donut)}. Glaze adds ${pence(VALUE.glaze)}, a filling ${pence(VALUE.filling)}, each topping ${pence(VALUE.top)}. Exact named recipes pay half again. A second trip through a station changes a donut: a double-fried donut is charred, a second squirt of filling is worth a couple of pence at most, and topper runs past the two-topping cap tip the price a little. Blobs, charcoal and raw dough pay very little and get comments.</p>`);
  parts.push('<h3>In the cupboard</h3><div class="legend">');
  for (const g of Object.keys(GLAZES)) parts.push(`<span class="chip${u.glazes.includes(g) ? '' : ' off'}"><span class="sw" style="background:${GLAZES[g].col}"></span>${GLAZES[g].name}</span>`);
  for (const fl of Object.keys(FILLINGS)) parts.push(`<span class="chip${u.fillings.includes(fl) ? '' : ' off'}"><span class="sw" style="background:${FILLINGS[fl].col}"></span>${FILLINGS[fl].name}</span>`);
  for (const t of Object.keys(TOPS)) parts.push(`<span class="chip${u.tops.includes(t) ? '' : ' off'}"><span class="em">${topIco(t)}</span>${TOPS[t].name}</span>`);
  parts.push('</div>');
  parts.push(`<h3>Named recipes · ${f.discovered.size}/${RECIPES.length}</h3>`);
  const sorted = RECIPES.slice().sort((a, b) => {
    const ka = f.discovered.has(a.id) ? 0 : f.recipeCraftable(a) ? 1 : 2;
    const kb = f.discovered.has(b.id) ? 0 : f.recipeCraftable(b) ? 1 : 2;
    return ka - kb || recipeValue(a) - recipeValue(b);
  });
  TIPS.clear();
  for (const r of sorted) {
    const known = f.discovered.has(r.id);
    const can = f.recipeCraftable(r);
    const isSpec = f.special && f.special.id === r.id && f.level >= SPECIAL_FROM_LEVEL;
    TIPS.set(r.id, recipeTip(r, known || isSpec));
    if (known) {
      parts.push(`<div class="recipe${isSpec ? ' special-now' : ''}" data-tip="${r.id}"><canvas width="68" height="68" data-recipe="${r.id}"></canvas><div class="grow"><div class="name">${r.name}<span class="val">${pence(recipeValue(r))}${isSpec ? ' ×2' : ''}</span></div><div class="parts">${recipeParts(r)}</div><div class="quip">${r.quip}</div></div></div>`);
    } else {
      const n = 1 + (r.filling ? 1 : 0) + r.tops.length;
      const hint = can ? `${n} thing${n > 1 ? 's' : ''} on a donut. Hover for the recipe.` : `Needs something you have not unlocked yet.`;
      parts.push(`<div class="recipe unknown${isSpec ? ' special-now' : ''}" data-tip="${r.id}"><canvas width="68" height="68" data-recipe="${isSpec ? r.id : ''}"></canvas><div class="grow"><div class="name">${isSpec ? r.name : '? ? ?'}<span class="val">${pence(recipeValue(r))}${isSpec ? ' ×2' : ''}</span></div><div class="parts">${isSpec ? recipeParts(r) : hint}</div>${isSpec ? '<div class="quip">The special. The board tells you how.</div>' : ''}</div></div>`);
    }
  }
  return parts.join('');
}
function drawRecipeThumb(cv) {
  const r = RECIPES.find((x) => x.id === cv.dataset.recipe);
  const c2 = cv.getContext('2d');
  c2.clearRect(0, 0, 68, 68);
  if (!r) { c2.font = '30px sans-serif'; c2.textAlign = 'center'; c2.textBaseline = 'middle'; c2.fillStyle = '#c9b8a8'; c2.fillText('?', 34, 36); return; }
  // draw with the shared item painter by pointing it at this canvas for a moment
  const saved = ctx;
  ctx = c2;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  drawItem(34, 33, { stage: 'donut', glaze: r.glaze, filling: r.filling, tops: r.tops.slice(), fillVal: 0 }, 56, 1);
  ctx = saved;
}

// ---------- bench (selected machine) ----------
function renderBench() {
  const b = $('bench');
  const t = selected && f.grid[selected.r][selected.c];
  if (!t) {
    if (tool) {
      const name = tool === 'belt' ? 'Belt' : tool === 'remove' ? 'Take back' : MACHINES[tool].name;
      const ico = icoImg(tool);
      b.innerHTML = `<div class="title"><span class="ico">${ico}</span>${name}</div><span class="muted">Facing ${['right', 'down', 'left', 'up'][toolDir]}. Press <b>R</b> to turn, click the floor to place, <b>Esc</b> to put it down.</span><span class="spacer"></span><button type="button" class="tiny" data-act="rotate-tool">Turn</button><button type="button" class="tiny" data-act="drop-tool">Put down</button>`;
    } else {
      b.innerHTML = `<span class="muted">Click a machine on the floor to open it here. Pick something from the Build tab to place it.</span>`;
    }
    return;
  }
  if (t.kind === 'belt') {
    const jam = f.tileStuck(selected.c, selected.r);
    b.innerHTML = `<div class="title"><span class="ico">${icoImg('belt')}</span>Belt</div><span class="muted">Facing ${['right', 'down', 'left', 'up'][t.dir]}. ${t.items.length ? `${t.items.length} on it.` : 'Empty.'}</span>${jam ? `<span class="warn">Stuck: ${blockText(jam)}</span>` : ''}<span class="spacer"></span><button type="button" class="tiny" data-act="rotate">Turn</button><button type="button" class="tiny" data-act="remove">Take back (${pence(refundOf(t))})</button>`;
    return;
  }
  const u = f.unlocked;
  const def = MACHINES[t.type];
  const parts = [`<div class="title"><span class="ico">${icoImg(t.type)}</span>${def.name}</div>`];
  if (def.cfgKind === 'glaze') parts.push(`<div class="group"><span>Glaze</span>${u.glazes.map((g) => `<button type="button" class="chip${t.cfg === g ? ' active' : ''}" data-cfg="${g}"><span class="sw" style="background:${GLAZES[g].col}"></span>${GLAZES[g].name} <small>${GLAZES[g].cost}p</small></button>`).join('')}</div>`);
  if (def.cfgKind === 'fill') parts.push(`<div class="group"><span>Filling</span>${u.fillings.map((fl) => `<button type="button" class="chip${t.cfg === fl ? ' active' : ''}" data-cfg="${fl}"><span class="sw" style="background:${FILLINGS[fl].col}"></span>${FILLINGS[fl].name} <small>${FILLINGS[fl].cost}p</small></button>`).join('')}</div>`);
  if (def.cfgKind === 'batch') parts.push(`<div class="group"><span>Recipe</span>${u.batches.map((x) => `<button type="button" class="chip${t.cfg === x ? ' active' : ''}" data-cfg="${x}" title="${BATCHES[x].mix}">${BATCHES[x].name}</button>`).join('')}<span class="muted">${BATCHES[t.cfg] ? BATCHES[t.cfg].mix : ''}</span></div>`);
  if (def.cfgKind === 'top') parts.push(`<div class="group"><span>Topping</span>${u.tops.map((x) => `<button type="button" class="chip${t.cfg === x ? ' active' : ''}" data-cfg="${x}"><span class="em">${topIco(x)}</span>${TOPS[x].name} <small>${TOPS[x].cost}p</small></button>`).join('')}</div>`);
  if (!def.sink) {
    const pips = Array.from({ length: MAX_LVL }, (_, i) => `<span class="pip${i < t.lvl ? ' on' : ''}"></span>`).join('');
    const rate = def.source ? `one every ${procTime(t).toFixed(1)}s` : `${procTime(t).toFixed(1)}s each`;
    parts.push(`<div class="group"><span>Speed</span><span class="pip-row">${pips}</span><span class="muted">${rate}</span>${t.lvl < MAX_LVL ? `<button type="button" class="tiny" data-act="upgrade" ${f.canAfford(upgradeCost(t)) ? '' : 'disabled'}>Tune up (${money(upgradeCost(t))})</button>` : '<span class="muted">Fully tuned.</span>'}</div>`);
  }
  if (t.stuck > STUCK_AFTER && HARD_BLOCK[t.why]) parts.push(`<span class="warn">Stuck: ${blockText(t.why)}</span>`);
  parts.push(`<span class="muted">Drag it on the floor to move it.</span>`);
  if (t.type === 'bin') parts.push(`<span class="muted">${f.binned} thing${f.binned === 1 ? '' : 's'} binned so far.</span>`);
  parts.push(`<span class="spacer"></span>`);
  if (!def.sink) parts.push(`<button type="button" class="tiny" data-act="rotate">Turn</button>`);
  parts.push(`<button type="button" class="tiny" data-act="remove">Take back (${pence(refundOf(t))})</button>`);
  b.innerHTML = parts.join('');
}

// ---------- overlays ----------
function overlay(title, html, actions) {
  $('overlay-title').textContent = title;
  $('overlay-body').innerHTML = html;
  const box = $('overlay-actions');
  box.innerHTML = '';
  for (const a of actions) {
    const btn = document.createElement('button');
    btn.type = 'button'; btn.textContent = a.label;
    if (a.primary) btn.className = 'primary';
    btn.addEventListener('click', () => { $('overlay').hidden = true; if (a.fn) a.fn(); });
    box.appendChild(btn);
  }
  $('overlay').hidden = false;
}

// ---------- input ----------
// the floor tile under the pointer, for putting things down
function tileAt(ev) { return floorTile(scenePt(ev)); }
// what the pointer is on: seen from above, every machine sits inside its own tile
function thingAt(ev) { return floorTile(scenePt(ev)); }
function removeAt(c, r) {
  f.removeTile(c, r);
  if (selected && selected.c === c && selected.r === r) selected = null;
}
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  const t = tool && tool !== 'remove' ? tileAt(e) : thingAt(e);
  if (!t) return;
  canvas.setPointerCapture(e.pointerId);
  if (e.button === 2) { const k = thingAt(e); if (k) removeAt(k.c, k.r); return; }
  if (tool === 'belt') { painting = true; lastPaint = t; f.placeBelt(t.c, t.r, toolDir); return; }
  if (tool === 'remove') { removeAt(t.c, t.r); return; }
  if (tool) { f.placeMachine(t.c, t.r, tool, toolDir); return; }
  const g = f.grid[t.r][t.c];
  if (g) { selected = { c: t.c, r: t.r }; drag = { from: t, at: t, moved: false }; } else { selected = null; drag = null; }
  dirty();
});
canvas.addEventListener('pointermove', (e) => {
  const t = tileAt(e);
  hover = tool || drag ? t : thingAt(e);
  if (drag) {
    // dragging off the floor puts it back where it came from
    const to = t || drag.from;
    if (to.c !== drag.at.c || to.r !== drag.at.r) {
      drag.at = to;
      drag.moved = !(to.c === drag.from.c && to.r === drag.from.r);
      dirty();
    }
    return;
  }
  if (!painting || !t || !lastPaint) return;
  if (t.c === lastPaint.c && t.r === lastPaint.r) return;
  const dc = t.c - lastPaint.c, dr = t.r - lastPaint.r;
  if (Math.abs(dc) + Math.abs(dr) !== 1) { lastPaint = t; return; }   // jumped; just carry on from here
  const d = dc === 1 ? 0 : dr === 1 ? 1 : dc === -1 ? 2 : 3;
  const prev = f.grid[lastPaint.r][lastPaint.c];
  if (prev && prev.kind === 'belt') f.placeBelt(lastPaint.c, lastPaint.r, d);   // re-aims it; a belt over a belt costs nothing
  toolDir = d;
  f.placeBelt(t.c, t.r, d, true);
  lastPaint = t;
});
const stopPaint = () => {
  painting = false; lastPaint = null;
  if (drag) {
    if (drag.moved && f.moveTile(drag.from, drag.at)) selected = { c: drag.at.c, r: drag.at.r };
    drag = null;
    dirty();
  }
};
canvas.addEventListener('pointerup', stopPaint);
canvas.addEventListener('pointercancel', stopPaint);
canvas.addEventListener('pointerleave', () => { hover = null; });

document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (!$('overlay').hidden || !$('help').hidden) return;
  const k = e.key.toLowerCase();
  if (k === 'r') {
    if (tool) toolDir = (toolDir + 1) % 4;
    else if (selected) f.rotate(selected.c, selected.r);
    dirty();
  } else if (k === 'escape') { tool = null; selected = null; dirty(); }
  else if (k === 'delete' || k === 'backspace') { if (selected) removeAt(selected.c, selected.r); }
  else if (k === ' ') { e.preventDefault(); speed = speed === 0 ? 1 : 0; syncSpeedButtons(); }
  else if (k === 'b') { tool = 'belt'; selected = null; dirty(); }
  else if (k === 'x') { tool = 'remove'; selected = null; dirty(); }
});

$('side-body').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-tool]');
  if (!btn) return;
  const id = btn.dataset.tool;
  tool = tool === id ? null : id;
  selected = null;
  dirty();
});
$('bench').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const t = selected && f.grid[selected.r][selected.c];
  if (btn.dataset.cfg && t) { f.setCfg(selected.c, selected.r, btn.dataset.cfg); return; }
  switch (btn.dataset.act) {
    case 'rotate': if (t) f.rotate(selected.c, selected.r); break;
    case 'remove': if (selected) removeAt(selected.c, selected.r); break;
    case 'upgrade': if (t) f.upgrade(t); break;
    case 'rotate-tool': toolDir = (toolDir + 1) % 4; break;
    case 'drop-tool': tool = null; break;
  }
  dirty();
});
document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
function setTab(name) {
  tab = name;
  document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('active', x.dataset.tab === name));
  $('plaque').textContent = { build: 'Build', goals: 'Orders', recipes: 'Recipe Book' }[name] || 'Build';
  hideTip();
  renderSide();
}
// The level box in the header opens the order board.
const levelBox = $('hud-level-wrap');
levelBox.addEventListener('click', () => setTab('goals'));
levelBox.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setTab('goals'); } });

// Hovering a recipe in the book spells out what goes into it.
const sideBody = $('side-body');
sideBody.addEventListener('mouseover', (e) => {
  const row = e.target.closest('[data-tip]');
  if (!row) return;
  const html = TIPS.get(row.dataset.tip);
  if (html) showTip(row, html, row.dataset.tip);
});
sideBody.addEventListener('mouseout', (e) => {
  if (!e.relatedTarget || !e.relatedTarget.closest || !e.relatedTarget.closest('[data-tip]')) hideTip();
});
sideBody.addEventListener('scroll', reanchorTip);
sideBody.addEventListener('mouseleave', hideTip);
document.querySelectorAll('.speed button').forEach((b) => b.addEventListener('click', () => { speed = Number(b.dataset.speed); syncSpeedButtons(); }));
function syncSpeedButtons() {
  document.querySelectorAll('.speed button').forEach((b) => b.classList.toggle('active', Number(b.dataset.speed) === speed));
}
$('btn-help').addEventListener('click', () => { $('help').hidden = false; });
$('btn-help-close').addEventListener('click', () => { $('help').hidden = true; });
function freshFactory() { f.fresh(); selected = null; tool = null; drag = null; dirty(); }
$('btn-reset').addEventListener('click', () => {
  overlay('Start a new factory?', '<p>This clears the floor, the cash and every order you have filled. The recipe book is wiped too.</p>', [
    { label: 'Keep going' },
    { label: 'Start over', primary: true, fn: () => { save.clear(); freshFactory(); save.save(f.serialize()); welcome(); } },
  ]);
});
function syncSoundButton() {
  $('btn-sound').textContent = `Sound: ${audio.on ? 'on' : 'off'}`;
  $('btn-sound').setAttribute('aria-pressed', String(audio.on));
}
$('btn-sound').addEventListener('click', () => {
  audio.toggle();
  syncSoundButton();
  sfx('tick');
});

// ---------- sound ----------
// The factory's own noises, built from lib/audio.js's tones.
function sfx(kind) {
  const tone = (freq, delay, dur, type, vol) => audio.tone({ freq, delay, dur, type: type || 'sine', vol: vol || 0.08, attack: 0.01 });
  if (kind === 'sell') { tone(880, 0, 0.12, 'triangle'); tone(1320, 0.08, 0.16, 'triangle'); }
  else if (kind === 'meh') { tone(220, 0, 0.18, 'sawtooth', 0.04); }
  else if (kind === 'place') { tone(330, 0, 0.06, 'square', 0.05); tone(440, 0.05, 0.08, 'square', 0.05); }
  else if (kind === 'tick') { tone(600, 0, 0.04, 'square', 0.03); }
  else if (kind === 'bad') { tone(160, 0, 0.2, 'sawtooth', 0.05); }
  else if (kind === 'level') { [523, 659, 784, 1046].forEach((fr, i) => tone(fr, i * 0.09, 0.22, 'triangle', 0.07)); }
}

window.addEventListener('beforeunload', () => save.save(f.serialize()));

function welcome() {
  overlay('Welcome to Donut Works', `
    <p>You have a bare floor, <b>${money(START_CASH)}</b> and an order from the shop out front for ten donuts.</p>
    <p>A <b>Mixer</b> plops out dough. A <b>Ring Press</b> punches the hole. A <b>Fryer</b> cooks it. Run the last belt into the <b>hatch to the shop</b> on the right and it sells. Join them with <b>belts</b>, watch the arrows, and the money looks after itself.</p>
    <p>Belts merge when one runs into the side of another, and fork when one leads away off the side. A <b>Boxing Station</b> sells from anywhere on the floor, for when the hatch is a long way round. Drag anything on the floor to move it. Fill orders to unlock glazers, toppers and fillers, then find out what happens when you put a whole pickle on a donut.</p>`,
    [{ label: 'How to play', fn: () => { $('help').hidden = false; } }, { label: 'Open the factory', primary: true }]);
}

// ---------- boot ----------
syncSoundButton();
if (!f.loaded) welcome();
renderSide(); renderBench();
loop.start();

// The debug handle, for tests and the console.
expose('__donut', {
  factory: f,
  state: () => f.state(),
  levelDef, LEVELS, RECIPES, GLAZES, FILLINGS, TOPS, MYSTERIES,
  setLevel: (i) => { f.setLevel(i); renderSide(); },
  grant: (n) => { f.cash += n; renderSide(); },
  sellFake: (it) => f.sell(it, 0, 0),
  valueOf: (it) => f.valueOf(it),
  // building and running a line by hand: setSpeed(0) stops the frame loop, step() drives it
  get grid() { return f.grid; }, MACHINES,
  fresh: freshFactory,
  place: (c, r, type, dir) => f.placeMachine(c, r, type, dir),
  belt: (c, r, dir, paint) => f.placeBelt(c, r, dir, paint),
  setSpeed: (v) => { speed = v; },
  step: (sec) => { for (let t = 0; t < sec; t += SIM_STEP) f.simulate(SIM_STEP); },
  // where a tile's centre is on the page, for driving real pointer events at it
  tileToClient: (c, r) => {
    const p = scr(c, r), rect = canvas.getBoundingClientRect();
    return { x: rect.left + view.x + p.x * view.s, y: rect.top + view.y + p.y * view.s };
  },
  // what a pointer at this page position would hit: the floor tile, and the thing it would pick
  pickAt: (x, y) => { const e = { clientX: x, clientY: y }; return { floor: tileAt(e), thing: thingAt(e) }; },
  machineBox: (c, r) => machineBox(c, r),
  sceneToClient: (x, y) => { const rect = canvas.getBoundingClientRect(); return { x: rect.left + view.x + x * view.s, y: rect.top + view.y + y * view.s }; },
  sprites: IMG,
  text: () => JSON.stringify({ cash: f.cash, level: f.level, sold: f.sold, goals: f.goals.map((g) => `${g.count}/${g.n}`) }),
});
