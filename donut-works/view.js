/* Donut Works: the screen. Draws the factory on Amber's painted isometric room plate,
   runs the side panel, bench and overlays, and turns clicks into the factory's verbs.
   The rules are in sim.js. */

import {
  COLS, ROWS, T, DX, DY, BELT_SPEED, START_CASH, CASH_FLOOR, SPECIAL_FROM_LEVEL, STUCK_AFTER, SIM_STEP,
  GLAZES, FILLINGS, TOPS, MYSTERIES, RECIPES, VALUE, BATCHES, MACHINES, BELT_COST, MAX_LVL, LEVELS,
  levelDef, recipeValue, procTime, upgradeCost, refundOf, goalDone, HARD_BLOCK, blockText, bendGeom, createFactory,
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
  else if (ev === 'refund') { const at = scr(d.c, d.r); floats.push({ x: at.x, y: at.y - 30, text: `${pence(d.amount)} back`, col: '#8a6d2f', t: 0, life: 1.3, size: 13 }); }
  else if (ev === 'sale') {
    const at = scr(d.c, d.r);
    floats.push({ x: at.x, y: at.y - 40, text: `+${pence(d.total)}`, col: d.good ? '#3f7a2a' : '#b8483a', t: 0, life: 1.4, size: 15 });
    floats.push({ x: at.x, y: at.y - 66, text: d.quip, col: '#3b2a24', t: -0.25, life: 1.9, size: 12, bubble: true });
    sfx(d.good ? 'sell' : 'meh');
  } else if (ev === 'level-up') { save.save(f.serialize()); showLevelUp(d); renderSide(); }
}
function note(text, c, r, col, life) {
  const at = scr(c, r);
  floats.push({ x: at.x, y: at.y - 84, text, col: col || '#3b2a24', t: 0, life: life || 1.6, size: 13 });
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
// The factory is Amber's painted room plate, seen isometrically, with its floor re-laid in
// 75 x 37.5px quarry tiles on exactly this grid (her own tiles were hand-drawn a little off
// 2:1; see notes/donut-works-assets/slice.py, which must agree with OX and OY here). Tile
// (c, r) is c steps down the right-hand wall and r steps down the left. Columns run
// down-right, rows down-left. Everything the sim knows is still in top-down tile units
// (T px a tile), and `floorT` lays that flat onto the floor, so belts, bends and arrows are
// drawn by the same geometry as before, just tipped over.
const SCENE_W = 1376, SCENE_H = 768;
const HW = 37.5, HH = 18.75;          // half a floor tile, across and down
const OX = 654, OY = 313;             // the back corner of the floor, on the plate
const K = HW / T;                     // top-down px to scene px
const BELT_H = 7;                     // how high a belt's top stands off the floor
const FOOT = 14;                      // a machine's feet sit this far below its tile centre
// what must always be on screen: the floor and a strip of wall above it
const FOCUS = { x0: OX - ROWS * HW - 30, x1: OX + COLS * HW + 30, y0: OY - 150, y1: OY + (COLS + ROWS) * HH + 40 };

const canvas = document.getElementById('floor');
let ctx = canvas.getContext('2d');
let dirtyUI = true;
function dirty() { dirtyUI = true; }

// scene px -> css px is p * view.s + view.x; the canvas itself is css px * dpr
const view = { s: 1, x: 0, y: 0, dpr: 1, w: 0, h: 0 };
function fitView() {
  const box = canvas.parentElement.getBoundingClientRect();
  const w = Math.max(200, box.width), h = Math.max(160, box.height);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cw = Math.round(w * dpr), ch = Math.round(h * dpr);
  if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
  const fw = FOCUS.x1 - FOCUS.x0, fh = FOCUS.y1 - FOCUS.y0;
  const s = Math.min(w / fw, h / fh);
  // centre the floor, then keep the plate's edges off screen wherever it is bigger than
  // the window, so a wide window just sees more of the room
  let x = w / 2 - (FOCUS.x0 + fw / 2) * s, y = h / 2 - (FOCUS.y0 + fh / 2) * s;
  const pw = SCENE_W * s, ph = SCENE_H * s;
  x = pw >= w ? Math.min(0, Math.max(w - pw, x)) : (w - pw) / 2;
  y = ph >= h ? Math.min(0, Math.max(h - ph, y)) : (h - ph) / 2;
  Object.assign(view, { s, x, y, dpr, w, h });
}
if (window.ResizeObserver) new ResizeObserver(fitView).observe(canvas.parentElement);
window.addEventListener('resize', fitView);

function sceneT() { const k = view.dpr * view.s; ctx.setTransform(k, 0, 0, k, view.dpr * view.x, view.dpr * view.y); }
// draw in top-down tile px centred on tile (c, r), laid flat on the floor and lifted
// `lift` scene px off it
function floorT(c, r, lift) {
  sceneT();
  ctx.transform(K, K / 2, -K, K / 2, OX, OY - (lift || 0));
  ctx.translate(c * T + T / 2, r * T + T / 2);
}
// a top-down point (tile px) to the scene
function iso(x, y) { return { x: OX + (x - y) * K, y: OY + (x + y) * K / 2 }; }
// the middle of a tile, in the scene
function scr(c, r) { return { x: OX + (c - r) * HW, y: OY + (c + r + 1) * HH }; }
// what part of the scene is on screen, for keeping labels inside it
function seen() { return { x0: -view.x / view.s, x1: (view.w - view.x) / view.s, y0: -view.y / view.s, y1: (view.h - view.y) / view.s }; }

// ---------- sprites ----------
// Cut from Amber's sheets by notes/donut-works-assets/slice.py.
const IMG = {};
const SPRITES = [
  'room.jpg', 'deco/box.png', 'deco/tray-belt.png',
  'm/mixer.png', 'm/mixer-on.png', 'm/press.png', 'm/press-on.png', 'm/fryer.png', 'm/fryer-on.png',
  'm/glazer.png', 'm/glazer-on.png', 'm/topper.png', 'm/filler.png', 'm/counter.png', 'm/bin.png',
  'm/splitter.png', 'm/joiner.png', 'd/dough.png', 'd/ring.png', 'd/fried.png',
];
// toppings with a picture of their own; the rest are drawn
const TOP_ART = ['bacon', 'pickle', 'worms', 'chips', 'eyes', 'fish', 'hat', 'popping', 'sprinkles', 'bee', 'cress', 'dice', 'candle', 'crown'];
for (const t of TOP_ART) SPRITES.push(`t/${t}.png`);
const ok = (im) => !!im && (im instanceof HTMLCanvasElement || (im.complete && im.naturalWidth > 0));
for (const file of SPRITES) {
  const im = new Image();
  im.onload = () => { variants.clear(); dirty(); };
  im.src = `images/${file}`;
  IMG[file.replace(/\.(png|jpg)$/, '')] = im;
}
const spriteUrl = (key) => `images/${key}.png`;

// How each machine stands on its tile: which picture, how wide (scene px), the picture it
// switches to while it is working, and which ways it can face as drawn (`nat`); facing any
// other way it is mirrored. `base` is how far down the picture the middle of its footprint
// is, read off each sprite with a ruler, so every machine stands on its tile rather than
// over it. Most of her machines face down-left; the press faces down-right, and the glazing
// line is long and wants to lie along its belt.
const LOOK = {
  mixer: { img: 'm/mixer', on: 'm/mixer-on', w: 80, flick: 5, base: 0.88 },
  press: { img: 'm/press', on: 'm/press-on', w: 88, flick: 2.6, nat: [0, 3], base: 0.83 },
  fryer: { img: 'm/fryer', on: 'm/fryer-on', w: 88, base: 0.82 },
  glazer: { img: 'm/glazer', on: 'm/glazer-on', w: 100, nat: [0, 2], base: 0.76 },
  topper: { img: 'm/topper', w: 62, base: 0.9 },
  filler: { img: 'm/filler', w: 74, base: 0.89 },
  counter: { img: 'm/counter', w: 86, base: 0.88 },
  bin: { img: 'm/bin', w: 50, base: 0.91 },
  splitter: { img: 'm/splitter', w: 80, flat: true, base: 0.6 },
  joiner: { img: 'm/joiner', w: 82, flat: true, base: 0.62 },
};

// Recoloured copies (charred donuts, the dark side of a donut, glaze rings) are made once
// on a scratch canvas and kept.
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
  rail: '#a7b8a3', railDark: '#7d917b', side: '#8fa38c', sideDark: '#6c7f69',
  cream: '#fbf2e2', copper: '#c4854f',
  rose: '#eba3bb', roseDark: '#c56d8c',
};
const UI_FONT = "'Nunito', ui-sans-serif, system-ui, sans-serif";
const HAND_FONT = "'Patrick Hand', 'Segoe Print', " + UI_FONT;

function rr(x, y, w, h, rad) {
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
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

function drawRoom() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#c98a6c';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  sceneT();
  if (ok(IMG.room)) ctx.drawImage(IMG.room, 0, 0, SCENE_W, SCENE_H);
  // the working floor, taped out the way a real factory marks a walkway
  sceneT();
  ctx.transform(K, K / 2, -K, K / 2, OX, OY);
  ctx.strokeStyle = 'rgba(246, 220, 150, 0.75)'; ctx.lineWidth = 4.5;
  ctx.setLineDash([22, 12]);
  ctx.strokeRect(3, 3, COLS * T - 6, ROWS * T - 6);
  ctx.setLineDash([]);
}
// stacks of finished boxes off the edge of the working floor, like the reference's
// dispatch corner; they are scenery and never in the way
const DECO = [
  { img: 'deco/tray-belt', x: 352, y: 556, w: 80 }, { img: 'deco/box', x: 420, y: 600, w: 72 },
  { img: 'deco/box', x: 492, y: 640, w: 72 }, { img: 'deco/box', x: 1070, y: 652, w: 70 },
];
function drawDeco(d) {
  const im = IMG[d.img];
  if (!ok(im)) return;
  sceneT();
  const h = d.w * im.naturalHeight / im.naturalWidth;
  ctx.fillStyle = 'rgba(94, 56, 36, 0.18)';
  ctx.beginPath(); ctx.ellipse(d.x, d.y - 4, d.w * 0.48, d.w * 0.2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.drawImage(im, d.x - d.w / 2, d.y - h, d.w, h);
}

// ---------- belts ----------
// A slatted wooden belt in a sage frame, standing a few px off the floor. The body is
// stacked up out of its own footprint, then the running surface goes on top, drawn in
// exactly the old top-down way and tipped onto the floor.
const SLAT = 9, BW = 16;
function beltFoot(dir, bend, w) {
  if (bend == null) {
    ctx.save(); ctx.rotate(dir * Math.PI / 2);
    ctx.beginPath(); ctx.rect(-T / 2, -w, T, w * 2);
    ctx.restore();
    return;
  }
  const g = bendGeom(dir, bend), a1 = g.a0 + g.d, ccw = g.d < 0;
  ctx.beginPath();
  ctx.arc(g.ax, g.ay, g.rad + w, g.a0, a1, ccw);
  ctx.arc(g.ax, g.ay, g.rad - w, a1, g.a0, !ccw);
  ctx.closePath();
}
// just the two long edges, for the ink line along the bottom of the frame
function beltEdges(dir, bend, w) {
  ctx.beginPath();
  if (bend == null) {
    ctx.save(); ctx.rotate(dir * Math.PI / 2);
    ctx.moveTo(-T / 2, -w); ctx.lineTo(T / 2, -w); ctx.moveTo(-T / 2, w); ctx.lineTo(T / 2, w);
    ctx.restore();
    return;
  }
  const g = bendGeom(dir, bend), a1 = g.a0 + g.d, ccw = g.d < 0;
  ctx.arc(g.ax, g.ay, g.rad + w, g.a0, a1, ccw);
  ctx.moveTo(g.ax + Math.cos(g.a0) * (g.rad - w), g.ay + Math.sin(g.a0) * (g.rad - w));
  ctx.arc(g.ax, g.ay, g.rad - w, g.a0, a1, ccw);
}
function drawBelt(c, r, dir, ghost, bend) {
  const alpha = ghost ? 0.55 : 1;
  // shadow on the tiles
  floorT(c, r, -1.5); ctx.globalAlpha = alpha;
  beltFoot(dir, bend, BW + 2); ctx.fillStyle = 'rgba(94, 56, 36, 0.2)'; ctx.fill();
  // the frame, built up in slices
  for (let h = 0.5; h < BELT_H; h += 1.5) {
    floorT(c, r, h); ctx.globalAlpha = alpha;
    beltFoot(dir, bend, BW); ctx.fillStyle = h < 1 ? PAL.sideDark : PAL.side; ctx.fill();
  }
  floorT(c, r, 0.5); ctx.globalAlpha = alpha;
  beltEdges(dir, bend, BW); ink(1.4); ctx.stroke();
  // the running surface
  floorT(c, r, BELT_H); ctx.globalAlpha = alpha;
  const off = (beltClock * BELT_SPEED * T) % SLAT;
  if (bend == null) {
    ctx.rotate(dir * Math.PI / 2);
    ctx.fillStyle = PAL.wood; ctx.fillRect(-T / 2, -BW, T, BW * 2);
    ctx.lineWidth = 1.7;
    for (let x = -T / 2 - SLAT + off; x < T / 2 + 1; x += SLAT) {
      if (x < -T / 2) continue;
      ctx.strokeStyle = 'rgba(150, 104, 66, 0.6)';
      ctx.beginPath(); ctx.moveTo(x, -BW + 3); ctx.lineTo(x, BW - 3); ctx.stroke();
      ctx.strokeStyle = 'rgba(255, 244, 224, 0.5)';
      ctx.beginPath(); ctx.moveTo(x + 1.6, -BW + 3); ctx.lineTo(x + 1.6, BW - 3); ctx.stroke();
    }
    ctx.fillStyle = PAL.rail;
    ctx.fillRect(-T / 2, -BW, T, 4.5);
    ctx.fillRect(-T / 2, BW - 4.5, T, 4.5);
    ink(1.5);
    ctx.beginPath();
    ctx.moveTo(-T / 2, -BW + 0.4); ctx.lineTo(T / 2, -BW + 0.4);
    ctx.moveTo(-T / 2, BW - 0.4); ctx.lineTo(T / 2, BW - 0.4);
    ctx.stroke();
  } else {
    const g = bendGeom(dir, bend), a1 = g.a0 + g.d, ccw = g.d < 0;
    ctx.strokeStyle = PAL.wood; ctx.lineWidth = BW * 2;
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
    ink(1.5);
    ctx.beginPath(); ctx.arc(g.ax, g.ay, g.rad - BW + 0.4, g.a0, a1, ccw); ctx.stroke();
    ctx.beginPath(); ctx.arc(g.ax, g.ay, g.rad + BW - 0.4, g.a0, a1, ccw); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
// a chevron painted on the floor at a tile's edge
function drawArrow(dir, alpha) {
  ctx.save();
  ctx.rotate(dir * Math.PI / 2);
  ctx.fillStyle = `rgba(107, 76, 60, ${alpha})`;
  ctx.strokeStyle = `rgba(255, 248, 236, ${alpha * 0.9})`; ctx.lineWidth = 2; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(T / 2 - 4, -9); ctx.lineTo(T / 2 + 6, 0); ctx.lineTo(T / 2 - 4, 9); ctx.closePath();
  ctx.stroke(); ctx.fill();
  ctx.restore();
}
function drawInArrow(dir, alpha) {
  ctx.save();
  ctx.rotate(dir * Math.PI / 2);
  ctx.fillStyle = `rgba(107, 76, 60, ${alpha})`;
  ctx.strokeStyle = `rgba(255, 248, 236, ${alpha * 0.9})`; ctx.lineWidth = 2; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(T / 2 + 5, -8); ctx.lineTo(T / 2 - 4, 0); ctx.lineTo(T / 2 + 5, 8); ctx.closePath();
  ctx.stroke(); ctx.fill();
  ctx.restore();
}

// ---------- donuts ----------
// Amber's three donut pictures (dough ball, raw ring, fried ring) are drawn from above; on
// the floor they are squashed to lie flat and given a darker copy underneath for their side.
// Glaze is a ring of icing drawn per flavour, toppings stand on top like the stickers they
// are drawn as.
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
// size: across, in the current units; squash: 1 seen from above, ~0.55 lying on the floor
function drawItem(x, y, it, size, squash) {
  size = size || 26;
  if (squash == null) squash = 0.56;
  const key = donutBody(it);
  let body = IMG[key];
  if (it.stage === 'blob') body = tinted('d/dough', '#c98a3f', 0.62);
  else if (it.stage === 'charcoal') body = tinted('d/fried', '#2e2826', 0.8);
  const side = tinted(it.stage === 'blob' ? 'd/dough' : key, it.stage === 'charcoal' ? '#1b1716' : '#6b4128', it.stage === 'dough' || it.stage === 'ring' ? 0.32 : 0.5);
  const thick = size * 0.13 * (1 - squash) * 2;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(60, 36, 24, 0.2)';
  ctx.beginPath(); ctx.ellipse(0, thick + size * squash * 0.08, size * 0.5, size * squash * 0.5, 0, 0, Math.PI * 2); ctx.fill();
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
function machineBusy(m) {
  const def = MACHINES[m.type];
  return !!m.cur || (!!def.source && f.cash > CASH_FLOOR && !m.outBuf);
}
// facing out towards the right-hand side of the screen: mirror the picture
function faceRight(m) { const look = LOOK[m.type]; return !MACHINES[m.type].omni && !look.flat && !(look.nat || [1, 2]).includes(m.dir); }
function spriteFor(m, c, r) {
  const look = LOOK[m.type];
  if (!machineBusy(m) || !look.on) return look.img;
  if (look.flick) return Math.floor(beltClock * look.flick + (c + r) * 0.37) % 2 ? look.on : look.img;
  return look.on;
}
// the picture's box in the scene, for clicking on a machine rather than its floor
function machineBox(c, r, m) {
  const look = LOOK[m.type], im = IMG[look.img];
  const w = look.w, h = ok(im) ? w * im.naturalHeight / im.naturalWidth : w;
  const p = scr(c, r);
  // where the picture's bottom edge falls below the tile centre: by default its feet are
  // the bottom edge; `base` says where in the picture (as a fraction of its height) the
  // middle of its footprint really is, for the long ones
  const foot = look.base != null ? (1 - look.base) * h : FOOT;
  return { x0: p.x - w / 2, x1: p.x + w / 2, y0: p.y + foot - h, y1: p.y + foot, w, h, p, foot };
}
function drawMachine(c, r, m, ghost) {
  const def = MACHINES[m.type], look = LOOK[m.type];
  const busy = !ghost && machineBusy(m);
  const box = machineBox(c, r, m), p = box.p;
  // a shadow on the tiles under it
  floorT(c, r, 0);
  ctx.globalAlpha = ghost ? 0.3 : 1;
  ctx.fillStyle = 'rgba(94, 56, 36, 0.22)';
  ctx.beginPath(); ctx.ellipse(4, 4, 25, 25, 0, 0, Math.PI * 2); ctx.fill();
  sceneT();
  ctx.globalAlpha = ghost ? 0.6 : 1;
  const im = IMG[spriteFor(m, c, r)];
  const squash = m.anim > 0 ? 1 + m.anim * 0.12 : 1;
  const bob = busy && !look.flat ? 1 + Math.sin(beltClock * 10 + c * 1.7 + r) * 0.012 : 1;
  ctx.save();
  ctx.translate(p.x, p.y + box.foot);
  ctx.scale((faceRight(m) ? -1 : 1) * squash, (2 - squash) * bob);
  if (ok(im)) {
    if (look.flat && busy) {
      // the turntable turns, or at least wobbles as if it does
      ctx.translate(0, -box.h / 2); ctx.rotate(Math.sin(beltClock * 6) * 0.03); ctx.translate(0, box.h / 2);
    }
    ctx.drawImage(im, -box.w / 2, -box.h, box.w, box.h);
  } else {
    ctx.fillStyle = def.col; rr(-24, -40, 48, 40, 8); ctx.fill(); ink(2); ctx.stroke();
  }
  ctx.restore();
  // config badge: a little enamel disc pinned to the top corner
  if (def.cfgKind && m.cfg) {
    const bx = p.x + box.w * 0.34, by = Math.max(box.y0 + 12, p.y - 52);
    ctx.save(); ctx.translate(bx, by);
    dot(0, 0, 9.5, '#fffaf1', false); ink(1.5); ctx.stroke();
    if (def.cfgKind === 'glaze') dot(0, 0, 6.5, GLAZES[m.cfg].col, false);
    else if (def.cfgKind === 'fill') dot(0, 0, 6.5, FILLINGS[m.cfg].col, false);
    else if (def.cfgKind === 'top') drawTopping(m.cfg, 0, 0, 14);
    else if (def.cfgKind === 'batch') { dot(0, 0, 6, '#efdcb4', false); ink(1.2, '#cdb383'); ctx.stroke(); }
    ctx.restore();
  }
  // level pips
  for (let i = 0; i < m.lvl; i++) dot(p.x - box.w * 0.34 + i * 7, Math.max(box.y0 + 10, p.y - 50), 2.8, PAL.rose, true);
  // progress, a strip of masking tape on the floor in front
  if (!ghost && (m.cur || (def.source && f.cash > CASH_FLOOR))) {
    const frac = def.source ? m.t / procTime(m) : 1 - m.t / procTime(m);
    ctx.fillStyle = 'rgba(94, 56, 36, 0.3)'; rr(p.x - 15, p.y + FOOT + 3, 30, 4.5, 2.25); ctx.fill();
    ctx.fillStyle = PAL.rose; rr(p.x - 15, p.y + FOOT + 3, 30 * Math.max(0, Math.min(1, frac)), 4.5, 2.25); ctx.fill();
  }
  if (def.source && f.cash <= CASH_FLOOR) {
    ctx.fillStyle = '#c06a5a'; ctx.font = `bold 10px ${UI_FONT}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('NO FLOUR £', p.x, p.y + FOOT + 8);
  }
  ctx.globalAlpha = 1;
  // things waiting at its doors
  const at = (d, k) => iso(c * T + T / 2 + DX[d] * k, r * T + T / 2 + DY[d] * k);
  if (def.join) for (let s = 0; s < 3; s++) {
    if (!m.ins[s]) continue;
    const d = s === 0 ? (m.dir + 2) % 4 : s === 1 ? (m.dir + 1) % 4 : (m.dir + 3) % 4;
    const q = at(d, 22); drawItem(q.x, q.y - BELT_H, m.ins[s], 20);
  }
  if (m.outBuf && !def.join && m.type !== 'splitter') { const q = at(m.dir, 22); drawItem(q.x, q.y - BELT_H, m.outBuf, 22); }
  // and a tag on the front saying what it is set to
  const lab = cfgLabel(m);
  if (lab) drawTag(p.x, p.y + FOOT + 16, lab, ghost);
}
function cfgLabel(m) {
  const k = MACHINES[m.type].cfgKind;
  if (!k || !m.cfg) return null;
  const tbl = k === 'glaze' ? GLAZES : k === 'fill' ? FILLINGS : k === 'top' ? TOPS : BATCHES;
  const d = tbl[m.cfg];
  return d ? d.short || d.name : null;
}
// a little card tied to the front of the machine, written by hand
function drawTag(x, y, text, ghost) {
  ctx.save();
  ctx.globalAlpha = ghost ? 0.55 : 1;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `13px ${HAND_FONT}`;
  const w = ctx.measureText(text).width;
  ctx.fillStyle = 'rgba(94, 56, 36, 0.2)';
  rr(x - w / 2 - 6, y - 6, w + 12, 15, 4); ctx.fill();
  ctx.fillStyle = '#fffaf0';
  rr(x - w / 2 - 6, y - 8, w + 12, 15, 4); ctx.fill();
  ink(1.2); ctx.stroke();
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
function beltPos(c, r, dir, p, bend) {
  const cx = c * T + T / 2, cy = r * T + T / 2;
  if (bend != null && p >= 0.5) {
    const g = bendGeom(dir, bend);
    const a = g.a0 + g.d * ((p - 0.5) * 2);
    return { x: cx + g.ax + Math.cos(a) * g.rad, y: cy + g.ay + Math.sin(a) * g.rad };
  }
  return { x: cx + DX[dir] * (p - 0.5) * T, y: cy + DY[dir] * (p - 0.5) * T };
}

// The build list, the bench and the unlock cards all want a picture of each thing.
// Machines use their own sprite; the belt and the take-back tool are drawn once onto a
// small canvas.
const iconCache = {};
function toolIcon(id) {
  if (LOOK[id]) return spriteUrl(LOOK[id].img);
  if (iconCache[id]) return iconCache[id];
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const prev = ctx, pv = { ...view }, clock = beltClock;
  ctx = cv.getContext('2d');
  if (id === 'belt') {
    const p = scr(0, 0);
    Object.assign(view, { s: 0.95, dpr: 1, x: 32 - p.x * 0.95, y: 36 - p.y * 0.95 });
    beltClock = 0;
    drawBelt(0, 0, 0, false, null);
  } else {
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
  const u = (pt.x - OX) / HW, v = (pt.y - OY) / HH;
  const c = Math.floor((u + v) / 2), r = Math.floor((v - u) / 2);
  if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return null;
  return { c, r };
}
// the front-most machine whose picture is under the pointer
function machineAt(pt) {
  let best = null, bd = -1;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const t = f.grid[r][c];
    if (!t || t.kind !== 'machine') continue;
    const b = machineBox(c, r, t);
    const ix = b.w * 0.12, iy = b.h * 0.06;
    if (pt.x > b.x0 + ix && pt.x < b.x1 - ix && pt.y > b.y0 + iy && pt.y < b.y1 && c + r > bd) { best = { c, r }; bd = c + r; }
  }
  return best;
}

// ---------- drawing a frame ----------
function tileMark(c, r, fill, stroke, dash) {
  floorT(c, r, 0);
  rr(-T / 2 + 3, -T / 2 + 3, T - 6, T - 6, 9);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 3.5; if (dash) ctx.setLineDash([7, 5]); ctx.stroke(); ctx.setLineDash([]); }
}
function draw() {
  const grid = f.grid;
  if (!view.w) fitView();
  drawRoom();
  // belts are flat, so they all go down first, back to front
  const belts = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const t = grid[r][c];
    if (t && t.kind === 'belt') belts.push({ c, r, t });
  }
  belts.sort((a, b) => a.c + a.r - (b.c + b.r));
  for (const b of belts) drawBelt(b.c, b.r, b.t.dir, false, f.bendAt(b.c, b.r));
  // selection and hover, on the floor under everything that stands up
  if (selected && grid[selected.r][selected.c]) tileMark(selected.c, selected.r, 'rgba(217,123,152,0.2)', '#d97b98');
  if (hover && !tool && !(drag && drag.moved)) tileMark(hover.c, hover.r, 'rgba(255,248,232,0.28)', null);
  // everything that stands up, painted from the back of the room forwards
  const list = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const t = grid[r][c];
    if (!t) continue;
    if (t.kind === 'machine') list.push({ d: c + r + 1, f: () => drawMachine(c, r, t, false) });
    else {
      const bend = f.bendAt(c, r);
      for (const e of t.items) {
        const q = beltPos(c, r, t.dir, e.p, bend);
        list.push({ d: (q.x + q.y) / T + 0.01, f: () => {
          const s = iso(q.x, q.y);
          sceneT(); drawItem(s.x, s.y - BELT_H - 1, e.it, 25);
        } });
      }
    }
  }
  for (const dco of DECO) list.push({ d: -1, f: () => drawDeco(dco) });
  list.sort((a, b) => a.d - b.d);
  for (const e of list) e.f();
  // which way things go: chevrons on the floor at each machine's doors, drawn over the
  // top so a tall machine cannot hide its own back door
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const t = grid[r][c];
    if (!t || t.kind !== 'machine' || MACHINES[t.type].sink) continue;
    floorT(c, r, 0);
    drawArrow(t.dir, 0.8);
    if (t.type === 'splitter') { drawArrow((t.dir + 1) % 4, 0.5); drawArrow((t.dir + 3) % 4, 0.5); }
    if (MACHINES[t.type].join) { drawInArrow((t.dir + 2) % 4, 0.55); drawInArrow((t.dir + 1) % 4, 0.55); drawInArrow((t.dir + 3) % 4, 0.55); }
  }
  sceneT();
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const t = grid[r][c];
    if (!t) continue;
    if (t.kind === 'machine' && t.stuck > STUCK_AFTER && HARD_BLOCK[t.why]) {
      const b = machineBox(c, r, t);
      drawStuckBadge(b.x1 - 8, b.y0 + 8);
    } else if (t.kind === 'belt') {
      const bend = f.bendAt(c, r);
      for (const e of t.items) {
        if (!(e.stuck > STUCK_AFTER && HARD_BLOCK[e.why])) continue;
        const q = beltPos(c, r, t.dir, e.p, bend), s = iso(q.x, q.y);
        drawStuckBadge(s.x + 12, s.y - BELT_H - 16);
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
    if (grid[r][c]) { const p = scr(c, r); drawTag(p.x, p.y - 30, 'swap', false); }
  } else if (hover && tool && !painting) {
    // ghost of the tool
    const { c, r } = hover;
    const occupied = !!grid[r][c];
    if (tool === 'belt') {
      if (!occupied || grid[r][c].kind === 'belt') { drawBelt(c, r, toolDir, true, null); floorT(c, r, BELT_H); drawArrow(toolDir, 0.7); }
      else tileMark(c, r, 'rgba(192,106,90,0.27)', null);
    } else if (tool === 'remove') {
      tileMark(c, r, 'rgba(192,106,90,0.32)', '#c06a5a');
    } else if (!occupied) {
      const ghost = f.newMachine(tool, toolDir);
      const wrongSpot = MACHINES[tool].group && !f.counterOk(c, r);
      if (!f.canAfford(MACHINES[tool].cost) || wrongSpot) tileMark(c, r, 'rgba(192,106,90,0.32)', null);
      drawMachine(c, r, ghost, true);
      if (!MACHINES[tool].sink) { floorT(c, r, 0); drawArrow(toolDir, 0.8); }
      sceneT();
      const p = scr(c, r);
      if (wrongSpot) drawTip(p.x, p.y - 90, 'Counters go next to each other.');
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
    if (st) { const p = scr(hover.c, hover.r); drawTip(p.x, p.y - 70, blockText(st)); }
  }
  if (speed === 0) {
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    const cx = view.w / 2;
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
    puffs.push({ x: p.x - 16 + Math.random() * 32, y: p.y - 24, vy: -20 - Math.random() * 12, t: 0, life: 0.9 + Math.random() * 0.5 });
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
  $('hud-special-wrap').hidden = !spec;
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
  if (fl.stage === 'donut') return 'Dough, then a ring press, then a fryer, then the counter.';
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
  drawItem(34, 33, { stage: 'donut', glaze: r.glaze, filling: r.filling, tops: r.tops.slice(), fillVal: 0 }, 56, 0.8);
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
  if (t.type === 'counter') parts.push(`<span class="muted">Sells whatever arrives, from any side. ${f.countMachines('counter')} tills, all in one bank.</span>`);
  if (t.type === 'joiner') parts.push(`<span class="muted">Takes turns between the back and both sides, so one busy line cannot hog it.</span>`);
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
// what the pointer is on: a machine's picture first, so a tall machine can be clicked
// anywhere on it, and otherwise the floor
function thingAt(ev) { const p = scenePt(ev); return machineAt(p) || floorTile(p); }
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
    <p>A <b>Mixer</b> plops out dough. A <b>Ring Press</b> punches the hole. A <b>Fryer</b> cooks it. A <b>Shop Counter</b> sells it. Join them with <b>belts</b>, watch the arrows, and the money looks after itself.</p>
    <p>A <b>Splitter</b> and a <b>Joiner</b> are yours from the off, for when one line wants to be three and then one again. Drag anything on the floor to move it. Fill orders to unlock glazers, toppers and fillers, then find out what happens when you put a whole pickle on a donut.</p>`,
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
  machineBox: (c, r) => machineBox(c, r, f.grid[r][c]),
  sceneToClient: (x, y) => { const rect = canvas.getBoundingClientRect(); return { x: rect.left + view.x + x * view.s, y: rect.top + view.y + y * view.s }; },
  sprites: IMG,
  text: () => JSON.stringify({ cash: f.cash, level: f.level, sold: f.sold, goals: f.goals.map((g) => `${g.count}/${g.n}`) }),
});
