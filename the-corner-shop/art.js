/* The Corner Shop: all the painting. The shop floor seen from high up and a little in
   front, with the walls cut away (her mock-up of 2026-10-14 is the reference): honey
   floorboards, thick cream walls, cobbles outside and a striped awning over the street.
   Everything is drawn in code except the goods, which are her painted icons
   (assets/goods/), stood on the shelves one per thing in stock so a shelf's level reads
   at a glance.

   The projection is flat and simple: a floor tile is TW across and TH deep on screen,
   and anything with height is drawn as a front face standing up from its front edge
   with its top face above it. Things are painted back to front by where they touch the
   floor, so a gondola hides whoever is behind it and the counter hides the keeper's legs. */

import { COLS, ROWS, FACINGS, STOCKROOM, ROOM_DOOR, ROOM_WALLS, PALLETS, DOOR, COUNTER, TILL_SPOT, PLANTS, PRODUCTS, prod, money } from './sim.js';

// ---------- constants ----------
// The canvas is the building and nothing else: the side walls on its left and right edges,
// the back wall's cut top on its top edge, the front wall along its bottom.
export const W = 992;
export const H = 580;
export const TW = 48;
export const TH = 36;
export const OX = 16;      // the side wall's thickness
export const OY = 122;     // the back wall's height (WALL_H)
export const px = (x) => OX + x * TW;
export const py = (y) => OY + y * TH;

const INK = '#3b2a1b';
const C = {
  cobble: '#6f7d8e', cobble2: '#5f6c7c', cobbleHi: '#8592a2', grout: '#4b5563',
  floor: '#d9a35f', floor2: '#cf9852', floorLine: '#b07a3c', floorHi: '#e6b674',
  wallTop: '#fbf2df', wallFace: '#ecdcbc', wallShade: '#d8c39b', paper: '#f4e6c8', paperStripe: '#ead7b0',
  wood: '#b9773d', woodDark: '#8a5527', woodLight: '#d39a5c', woodBack: '#9a6334',
  counterTop: '#c88d52', counterFace: '#6b3c22', counterDark: '#4f2b17',
  concrete: '#b9b2a6', concrete2: '#a9a296', crate: '#c99a5b', crateDark: '#9b6f3a',
  awning: '#c4473a', awning2: '#f6e6c8',
  tag: '#fffaf0', sold: '#d9503c', green: '#5f9e48',
};
const HEIGHT = { wall: 92, gondola: 64, table: 26, counter: 42 };
const WALL_H = 122;          // the back wall, from its cut top down to the floor
const PEOPLE = 1.3;          // everyone's size against the shop

// ---------- images ----------
const goods = {};
export function loadGoods(onLoad) {
  for (const p of PRODUCTS) {
    const im = new Image();
    im.onload = () => onLoad && onLoad(p.id);
    im.src = 'assets/goods/' + p.id + '.png';
    goods[p.id] = im;
  }
}
// One thing, standing on (x, baseY), fitted into a box of size s. Falls back to the emoji
// until the picture has loaded.
function drawGood(ctx, pid, x, baseY, s, alpha) {
  const im = goods[pid];
  if (alpha != null) ctx.globalAlpha = alpha;
  if (im && im.complete && im.naturalWidth) {
    const k = s / Math.max(im.naturalWidth, im.naturalHeight);
    const w = im.naturalWidth * k, h = im.naturalHeight * k;
    ctx.drawImage(im, x - w / 2, baseY - h, w, h);
  } else {
    ctx.font = Math.round(s * 0.8) + 'px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(prod(pid).ico, x, baseY);
  }
  ctx.globalAlpha = 1;
}

// ---------- small shapes ----------
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function box(ctx, x, y, w, h, fill, line) {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  if (line) { ctx.strokeStyle = line; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, w - 2, h - 2); }
}
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (sh) => Math.max(0, Math.min(255, Math.round(((n >> sh) & 255) * f)));
  return 'rgb(' + ch(16) + ',' + ch(8) + ',' + ch(0) + ')';
}
// a block with height: top face over [x0, x1] × [y0, y1] on the floor raised by h, and its
// front face dropping from the top's front edge to the floor
function block(ctx, x0, y0, x1, y1, h, top, face, line) {
  const X0 = px(x0), X1 = px(x1), Y0 = py(y0), Y1 = py(y1);
  ctx.fillStyle = face;
  ctx.fillRect(X0, Y1 - h, X1 - X0, h);
  ctx.fillStyle = top;
  ctx.fillRect(X0, Y0 - h, X1 - X0, Y1 - Y0);
  if (line) {
    ctx.strokeStyle = line;
    ctx.lineWidth = 2;
    ctx.strokeRect(X0 + 1, Y0 - h + 1, X1 - X0 - 2, Y1 - Y0 + h - 2);
    ctx.beginPath(); ctx.moveTo(X0, Y1 - h); ctx.lineTo(X1, Y1 - h); ctx.stroke();
  }
}

// ---------- the still parts, painted once ----------
let still = null;
function noise(i) { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }

function paintStreet(ctx) {
  ctx.fillStyle = C.grout;
  ctx.fillRect(0, 0, W, H);
  // cobbles in offset rows, each a little rounded stone with a lit top edge
  let k = 0;
  for (let y = -6, row = 0; y < H; y += 15, row++) {
    for (let x = (row % 2) * -11; x < W; x += 22) {
      const n = noise(k++);
      ctx.fillStyle = n < 0.33 ? C.cobble2 : n < 0.8 ? C.cobble : C.cobbleHi;
      rr(ctx, x + 1, y + 1, 20, 13, 5);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(x + 5, y + 3, 11, 2);
    }
  }
}
function paintFloor(ctx) {
  const x0 = px(0), x1 = px(COLS), y0 = py(0), y1 = py(ROWS);
  ctx.fillStyle = C.floor;
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  // boards run across the shop, 12px wide, with staggered joints
  let k = 0;
  for (let y = y0, row = 0; y < y1; y += 12, row++) {
    ctx.fillStyle = row % 3 === 1 ? C.floor2 : row % 3 === 2 ? '#d49d58' : C.floor;
    ctx.fillRect(x0, y, x1 - x0, 12);
    ctx.fillStyle = C.floorHi;
    ctx.globalAlpha = 0.35;
    ctx.fillRect(x0, y + 1, x1 - x0, 1);
    ctx.globalAlpha = 1;
    ctx.fillStyle = C.floorLine;
    ctx.fillRect(x0, y + 11, x1 - x0, 1);
    let x = x0 + (row * 37) % 90 - 90;
    while (x < x1) {
      const len = 90 + Math.floor(noise(k++) * 80);
      x += len;
      if (x > x0 && x < x1) ctx.fillRect(x, y, 1.5, 12);
    }
  }
  // a little light pooling in from the door and the window
  const g = ctx.createRadialGradient(px(10), py(12), 10, px(10), py(12), 380);
  g.addColorStop(0, 'rgba(255,236,190,0.28)');
  g.addColorStop(1, 'rgba(255,236,190,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  // the doormat
  rr(ctx, px(9.1), py(10.75), TW * 1.8, TH * 0.95, 4);
  ctx.fillStyle = '#c9a76a';
  ctx.fill();
  ctx.strokeStyle = '#9b7a43';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = 'rgba(120,90,40,0.25)';
  for (let i = 0; i < 8; i++) ctx.fillRect(px(9.25) + i * 10, py(10.85), 2, TH * 0.75);
}
function paintBackWall(ctx) {
  const x0 = px(0) - 16, x1 = px(COLS) + 16, top = py(0) - WALL_H;
  // the wall's cut top, then its face: striped paper above a wooden dado
  ctx.fillStyle = C.wallTop;
  ctx.fillRect(x0, top, x1 - x0, 14);
  const fy = top + 14;
  ctx.fillStyle = C.paper;
  ctx.fillRect(x0, fy, x1 - x0, py(0) - fy);
  ctx.fillStyle = C.paperStripe;
  for (let x = x0; x < x1; x += 20) ctx.fillRect(x, fy, 8, py(0) - fy);
  ctx.fillStyle = C.woodLight;
  ctx.fillRect(x0, py(0) - 34, x1 - x0, 34);
  ctx.fillStyle = C.woodDark;
  ctx.fillRect(x0, py(0) - 36, x1 - x0, 4);
  ctx.fillRect(x0, py(0) - 4, x1 - x0, 4);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.strokeRect(x0 + 1, top + 1, x1 - x0 - 2, py(0) - top - 1);
  ctx.beginPath(); ctx.moveTo(x0, fy); ctx.lineTo(x1, fy); ctx.stroke();
  // the shop's name, painted on a board above the shelves
  const sx = px(11.5), sy = top + 20;
  rr(ctx, sx - 78, sy, 156, 30, 6);
  ctx.fillStyle = '#2f5a45';
  ctx.fill();
  ctx.strokeStyle = '#d8b25a';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.fillStyle = '#f3dc9a';
  ctx.font = '700 17px "Baloo 2", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('The Corner Shop', sx, sy + 16);
}
function paintSideWalls(ctx) {
  // left and right walls: just their cut tops, a thick cream band, as in the mock-up
  const top = py(0) - WALL_H;
  for (const [x, w] of [[px(0) - 16, 16], [px(COLS), 16]]) {
    ctx.fillStyle = C.wallTop;
    ctx.fillRect(x, top, w, py(ROWS) - top + 8);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, top + 1, w - 2, py(ROWS) - top + 6);
  }
}
function paintStockroomFloor(ctx) {
  const R = STOCKROOM;
  ctx.fillStyle = C.concrete;
  ctx.fillRect(px(R.x), py(R.y), R.w * TW, R.h * TH);
  ctx.fillStyle = C.concrete2;
  for (let i = 0; i < 9; i++) ctx.fillRect(px(R.x) + noise(i + 40) * R.w * TW, py(R.y) + noise(i + 90) * R.h * TH, 10, 3);
  // its own back wall, a step darker than the shop's
  ctx.fillStyle = 'rgba(80,60,40,0.18)';
  ctx.fillRect(px(R.x) - 16, py(0) - 90, R.w * TW + 16, 90);
}
function paintStill() {
  const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(W, H) : Object.assign(document.createElement('canvas'), { width: W, height: H });
  const ctx = cv.getContext('2d');
  paintStreet(ctx);
  paintFloor(ctx);
  paintBackWall(ctx);
  paintStockroomFloor(ctx);
  paintSideWalls(ctx);
  return cv;
}

// ---------- fixtures ----------
// Where each fixture sits on screen, for tapping: its front face and top together.
export function facingRect(i) {
  const f = FACINGS[i];
  const h = HEIGHT[f.kind];
  return { x: px(f.x), y: py(f.y) - h, w: f.w * TW, h: TH + h };
}
export const stockroomRect = () => ({ x: px(STOCKROOM.x) - 16, y: py(0) - WALL_H, w: STOCKROOM.w * TW + 16, h: py(STOCKROOM.h) - py(0) + WALL_H });
// One product's boxes on a pallet, for tapping.
const BOX_W = 20;
export function crateRect(cr) { return slotRect(cr.slot != null ? cr.slot : cr.pallet * 2 + cr.side); }
// Each side of each pallet, boxes or not, for tapping.
export function slotRect(k) {
  const [c, r] = PALLETS[k >> 1].at;
  return { x: px(c) + 3 + (k & 1) * (BOX_W + 2), y: py(r + 1) - 6 - 3 * 15 - 8, w: BOX_W + 1, h: 3 * 15 + 18 };
}
export const counterRect = () => ({ x: px(COUNTER.x), y: py(COUNTER.y) - HEIGHT.counter - TH * 0.8, w: COUNTER.w * TW, h: TH * 1.8 + HEIGHT.counter });

function priceTag(ctx, x, y, text, sold) {
  ctx.font = '800 10.5px "Baloo 2", system-ui, sans-serif';
  const w = Math.max(30, ctx.measureText(text).width + 9);
  rr(ctx, x - w / 2, y - 7, w, 14, 3);
  ctx.fillStyle = sold ? C.sold : C.tag;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.fillStyle = sold ? '#fff' : INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 0.5);
}
// Lays `n` of a product along shelf boards. boards: the base y of each board, top first.
function stackGoods(ctx, pid, n, cap, X0, X1, boards, size) {
  const per = Math.ceil(cap / boards.length);
  const step = (X1 - X0 - 8) / per;
  const s = Math.min(size, step * 1.25);
  let k = 0;
  for (let b = 0; b < boards.length && k < n; b++) {
    for (let j = 0; j < per && k < n; j++, k++) drawGood(ctx, pid, X0 + 4 + step * (j + 0.5), boards[b], s);
  }
}
function drawFacing(ctx, i, sc) {
  const f = FACINGS[i];
  const st = sc.state;
  const pid = st.slots[i];
  const fitted = pid !== false;
  const X0 = px(f.x), X1 = px(f.x + f.w), Y0 = py(f.y), Y1 = py(f.y + 1);
  const h = HEIGHT[f.kind];
  const cx = (X0 + X1) / 2;
  const glow = sc.glow && sc.glow.facings && sc.glow.facings.includes(i);
  if (!fitted) {
    // nothing fitted yet: a pallet with a few spare boxes on it, and the price of a shelf
    ctx.fillStyle = '#a77b47';
    ctx.fillRect(X0 + 8, Y1 - 12, X1 - X0 - 16, 8);
    ctx.fillStyle = '#8a6236';
    for (let k = 0; k < 4; k++) ctx.fillRect(X0 + 10 + k * (X1 - X0 - 26) / 3, Y1 - 6, 6, 4);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(X0 + 8, Y1 - 12, X1 - X0 - 16, 8);
    for (const [bx, bw, bh] of [[X0 + 14, 30, 22], [X0 + 46, 26, 16], [X0 + 20, 22, 14]]) {
      const by = Y1 - 12 - (bw === 22 ? 22 : 0);
      ctx.fillStyle = '#c9975a';
      ctx.fillRect(bx, by - bh, bw, bh);
      ctx.fillStyle = '#b07f45';
      ctx.fillRect(bx, by - bh, bw, 4);
      ctx.strokeRect(bx, by - bh, bw, bh);
    }
    priceTag(ctx, X1 - 22, Y1 - 30, '+ shelf', false);
    if (sc.hover && sc.hover.facing === i) outline(ctx, facingRect(i), '#fff8e0');
    return;
  }
  const p = pid ? prod(pid) : null;
  const n = pid ? st.stock[i] : 0;
  if (f.kind === 'wall' || f.kind === 'gondola') {
    // posts, back panel and boards
    const top = Y1 - h;
    ctx.fillStyle = C.woodBack;
    ctx.fillRect(X0 + 3, top, X1 - X0 - 6, h);
    if (f.kind === 'gondola') {
      ctx.fillStyle = C.woodLight;
      ctx.fillRect(X0, Y0 - h, X1 - X0, TH);   // its top, seen from above
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      ctx.fillRect(X0, Y0 - h + TH - 5, X1 - X0, 5);
    }
    const boards = f.kind === 'wall' ? [top + 32, top + 62, Y1 - 4] : [top + 30, Y1 - 4];
    ctx.fillStyle = 'rgba(40,20,5,0.22)';
    for (const b of boards) ctx.fillRect(X0 + 3, b - 26, X1 - X0 - 6, 26);
    if (p) {
      if (n) stackGoods(ctx, pid, n, p.cap, X0 + 2, X1 - 2, boards, f.kind === 'wall' ? 27 : 27);
      else for (const b of boards) drawGood(ctx, pid, cx, b, 22, 0.18);
    }
    ctx.fillStyle = C.wood;
    for (const b of boards) { ctx.fillRect(X0, b, X1 - X0, 5); ctx.fillStyle = C.woodDark; ctx.fillRect(X0, b + 4, X1 - X0, 1.5); ctx.fillStyle = C.wood; }
    ctx.fillStyle = C.woodDark;
    ctx.fillRect(X0, top, 5, h);
    ctx.fillRect(X1 - 5, top, 5, h);
    ctx.fillRect(X0, top, X1 - X0, 5);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.strokeRect(X0 + 1, (f.kind === 'gondola' ? Y0 - h : top) + 1, X1 - X0 - 2, (f.kind === 'gondola' ? TH : 0) + h - 2);
    if (p) priceTag(ctx, cx, Y1 - 3, n ? money(st.prices[pid]) : st.phase === 'open' ? 'sold out' : 'empty', !n);
    else chalkPlus(ctx, cx, top + h / 2);
  } else {
    // a produce table: a slatted crate on legs, its goods heaped on top
    const top = Y0 - h;
    ctx.fillStyle = C.crateDark;
    ctx.fillRect(X0 + 2, Y1 - h, X1 - X0 - 4, h);
    ctx.fillStyle = C.crate;
    for (let k = 0; k < 3; k++) ctx.fillRect(X0 + 2, Y1 - h + 2 + k * 8, X1 - X0 - 4, 5);
    ctx.fillStyle = '#7d5326';
    ctx.fillRect(X0, top, X1 - X0, TH);
    ctx.fillStyle = '#e2c79a';
    ctx.fillRect(X0 + 5, top + 4, X1 - X0 - 10, TH - 8);
    if (p) {
      if (n) {
        const per = Math.ceil(p.cap / 2);
        const step = (X1 - X0 - 14) / per;
        let k = 0;
        for (const row of [top + TH * 0.55, top + TH - 4]) {
          for (let j = 0; j < per && k < n; j++, k++) drawGood(ctx, pid, X0 + 7 + step * (j + 0.5) + (row > top + 20 ? 3 : 0), row, Math.min(26, step * 1.5));
        }
      } else drawGood(ctx, pid, cx, top + TH - 6, 22, 0.2);
    }
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.strokeRect(X0 + 1, top + 1, X1 - X0 - 2, TH + h - 2);
    if (p) priceTag(ctx, cx, Y1 - 6, n ? money(st.prices[pid]) : st.phase === 'open' ? 'sold out' : 'empty', !n);
    else chalkPlus(ctx, cx, top + TH / 2);
  }
  if (glow) outline(ctx, facingRect(i), '#7dd35a', sc.t);
  else if (sc.hover && sc.hover.facing === i) outline(ctx, facingRect(i), '#fff8e0');
}
function chalkPlus(ctx, x, y) {
  ctx.strokeStyle = 'rgba(255,248,230,0.8)';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x - 8, y); ctx.lineTo(x + 8, y); ctx.moveTo(x, y - 8); ctx.lineTo(x, y + 8); ctx.stroke();
}
function outline(ctx, r, col, t) {
  ctx.save();
  ctx.strokeStyle = col;
  ctx.lineWidth = 3.5;
  if (t != null) ctx.globalAlpha = 0.55 + 0.45 * Math.sin(t * 6);
  rr(ctx, r.x - 3, r.y - 3, r.w + 6, r.h + 6, 7);
  ctx.stroke();
  ctx.restore();
}

// The stockroom, in pieces so the keeper can walk among them: a stack of boxes per product
// on the pallets, the walls (the right one at the back of the draw, the front pieces at
// the front of it), and a word on the floor when it is empty.
function drawCrates(ctx, sc, cr) {
  const p = prod(cr.pid);
  const boxes = Math.min(3, Math.ceil(cr.q / p.box));
  const [c, r] = PALLETS[cr.pallet].at;
  const X = px(c) + 3 + cr.side * (BOX_W + 2), Y = py(r + 1) - 6;
  // the pallet under them (an empty pallet is not drawn: it read as a box)
  ctx.fillStyle = '#a77b47';
  ctx.fillRect(X - 2, Y - 3, BOX_W + 4, 6);
  ctx.fillStyle = '#8a6236';
  ctx.fillRect(X - 2, Y + 1, BOX_W + 4, 2);
  for (let b = 0; b < boxes; b++) {
    const y = Y - b * 15;
    ctx.fillStyle = C.crateDark;
    ctx.fillRect(X, y - 15, BOX_W, 15);
    ctx.fillStyle = C.crate;
    ctx.fillRect(X, y - 21, BOX_W, 7);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.4;
    ctx.strokeRect(X + 0.5, y - 20.5, BOX_W - 1, 20);
  }
  drawGood(ctx, cr.pid, X + BOX_W / 2, Y - (boxes - 1) * 15 - 1, 14);
  // the outline hugs the boxes that are there; the tap area (crateRect) stays full height
  const rect = { x: X - 1, y: Y - (boxes - 1) * 15 - 23, w: BOX_W + 2, h: (boxes - 1) * 15 + 25 };
  if (sc.glow && sc.glow.crates && sc.glow.crates.includes(cr.pid)) outline(ctx, rect, '#7dd35a', sc.t);
  // white under the pointer, like a shelf, when a tap would do something here: lift a box
  // with empty arms, or put yours down on its own pile
  else if (sc.hover && sc.hover.slot === cr.slot && (!sc.state.carry || sc.state.carry.pid === cr.pid)) outline(ctx, rect, '#fff8e0');
}
function markSlot(ctx, k, sc) {
  const r = slotRect(k);
  ctx.save();
  ctx.setLineDash([4, 3]);
  ctx.strokeStyle = sc.hover && sc.hover.slot === k ? '#fff8e0' : 'rgba(125,211,90,' + (0.6 + 0.4 * Math.sin(sc.t * 6)) + ')';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(r.x + 1, r.y + r.h - 34, r.w - 2, 28);
  ctx.restore();
}
function drawRoomSide(ctx) {
  const R = STOCKROOM;
  ctx.fillStyle = C.wallTop;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.fillRect(px(R.w) - 8, py(0) - WALL_H, 16, py(R.h) - py(0) + WALL_H - 30);
  ctx.strokeRect(px(R.w) - 7, py(0) - WALL_H + 1, 14, py(R.h) - py(0) + WALL_H - 32);
}
function drawRoomFront(ctx, sc) {
  const R = STOCKROOM;
  const wh = 30;
  const top = py(R.h) - wh;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  for (const [a, b] of [[R.x - 0.33, ROOM_DOOR.x], [ROOM_DOOR.x + ROOM_DOOR.w, R.w + 0.17]]) {
    ctx.fillStyle = C.wallFace;
    ctx.fillRect(px(a), top + 12, px(b) - px(a), wh - 12);
    ctx.fillStyle = C.wallTop;
    ctx.fillRect(px(a), top - TH + 12, px(b) - px(a), TH);
    ctx.strokeRect(px(a) + 1, top - TH + 13, px(b) - px(a) - 2, TH + wh - 14);
  }
  // the door, swung open against the wall, and the sign over it
  const dr = px(ROOM_DOOR.x + ROOM_DOOR.w);
  ctx.fillStyle = '#8a5a30';
  ctx.fillRect(dr - 1, top - TH + 14, 8, TH + wh - 16);
  ctx.strokeRect(dr - 1, top - TH + 14, 8, TH + wh - 16);
  // the sign hangs on the wall left of the door
  const sx = px((STOCKROOM.x - 0.33 + ROOM_DOOR.x) / 2);
  rr(ctx, sx - 30, top + 14, 60, 14, 3);
  ctx.fillStyle = '#fffaf0';
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.font = '800 10px "Baloo 2", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '800 9px "Baloo 2", system-ui, sans-serif';
  ctx.fillText('STOCKROOM', sx, top + 21.5);
  if (!sc.crates.length) {
    ctx.fillStyle = 'rgba(59,42,27,0.55)';
    ctx.font = '700 12px "Baloo 2", system-ui, sans-serif';
    ctx.fillText('Empty', px(2), py(1.9));
  }
}

// The counter: a dark panelled front, a wooden top with the till on it.
function drawCounter(ctx, sc) {
  const c = COUNTER;
  const X0 = px(c.x), X1 = px(c.x + c.w), Y0 = py(c.y), Y1 = py(c.y + 1);
  const h = HEIGHT.counter;
  ctx.fillStyle = C.counterFace;
  ctx.fillRect(X0, Y1 - h, X1 - X0, h);
  ctx.fillStyle = C.counterDark;
  for (let x = X0 + 8; x < X1 - 8; x += 40) ctx.fillRect(x, Y1 - h + 8, 32, h - 14);
  ctx.fillStyle = C.counterTop;
  ctx.fillRect(X0 - 4, Y0 - h, X1 - X0 + 8, TH + 2);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(X0 - 4, Y0 - h, X1 - X0 + 8, 3);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.strokeRect(X0 - 3, Y0 - h + 1, X1 - X0 + 6, TH + h);
  ctx.beginPath(); ctx.moveTo(X0 - 4, Y1 - h + 2); ctx.lineTo(X1 + 4, Y1 - h + 2); ctx.stroke();
  // on top: a jar of sweets, the scanner, the till
  const ty = Y0 - h + TH / 2 + 2;
  ctx.fillStyle = 'rgba(220,240,255,0.55)';
  rr(ctx, X0 + 10, ty - 22, 20, 24, 6); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.stroke();
  for (let k = 0; k < 6; k++) { ctx.fillStyle = ['#e0574f', '#f0b429', '#6cbf6a', '#4f9de0'][k % 4]; ctx.beginPath(); ctx.arc(X0 + 15 + (k % 3) * 5, ty - 4 - Math.floor(k / 3) * 6, 2.6, 0, 7); ctx.fill(); }
  // the belt
  ctx.fillStyle = '#3c3a3a';
  ctx.fillRect(X0 + 40, ty - 8, 80, 14);
  ctx.fillStyle = '#555';
  for (let x = X0 + 44; x < X0 + 118; x += 8) ctx.fillRect(x, ty - 7, 2, 12);
  // scanner glass with its red line
  ctx.fillStyle = '#25303a';
  ctx.fillRect(X0 + 124, ty - 9, 26, 16);
  ctx.fillStyle = sc.flash > 0 ? '#ff8a6a' : '#e0453a';
  ctx.fillRect(X0 + 126, ty - 2, 22, 2);
  // the till
  const tx = px(TILL_SPOT[0]) - 14;
  ctx.fillStyle = '#7a756d';
  ctx.fillRect(tx, ty - 6, 36, 14);
  ctx.fillStyle = '#9c968c';
  ctx.fillRect(tx + 3, ty - 26, 30, 21);
  ctx.fillStyle = '#1f3b2a';
  ctx.fillRect(tx + 6, ty - 23, 24, 10);
  ctx.fillStyle = '#7dff9a';
  ctx.font = '700 7px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(sc.tillText || '', tx + 18, ty - 18);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(tx + 3, ty - 26, 30, 21);
  ctx.strokeRect(tx, ty - 6, 36, 14);
  // a little stack of paper bags
  ctx.fillStyle = '#c9a26a';
  ctx.fillRect(X1 - 30, ty - 12, 20, 18);
  ctx.strokeRect(X1 - 30, ty - 12, 20, 18);
  if (sc.glow && sc.glow.till) outline(ctx, counterRect(), '#ffcf4a', sc.t);
  else if (sc.hover && sc.hover.till) outline(ctx, counterRect(), '#fff8e0');
}

function drawPlant(ctx, x, y) {
  const X = px(x + 0.5), Y = py(y + 0.85);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath(); ctx.ellipse(X, Y, 15, 5, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#b6623a';
  ctx.beginPath(); ctx.moveTo(X - 13, Y - 22); ctx.lineTo(X + 13, Y - 22); ctx.lineTo(X + 9, Y); ctx.lineTo(X - 9, Y); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
  for (let k = 0; k < 7; k++) {
    const a = -Math.PI / 2 + (k - 3) * 0.42;
    ctx.fillStyle = k % 2 ? '#5f9e48' : '#4b8a3a';
    ctx.beginPath(); ctx.ellipse(X + Math.cos(a) * 14, Y - 30 + Math.sin(a) * 14, 6, 13, a + Math.PI / 2, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(40,60,20,0.6)'; ctx.lineWidth = 1.2; ctx.stroke();
  }
}

// ---------- people ----------
// A person stands with their feet at (X, Y) on screen. They are built from the same few
// parts as everyone else: legs, a body in their clothes, arms, a head and their hair,
// turned to face the way they are walking. `o` carries: dir, stride, moving, small, look,
// apron, carry (a pid), basket (pids), mood.
export function drawPerson(ctx, X, Y, o) {
  const L = o.look;
  const s = (L.small ? 0.8 : 1) * PEOPLE;
  const dir = o.dir || 'down';
  const sw = o.moving ? Math.sin((o.stride || 0) * 4.2) : 0;
  const bob = o.moving ? Math.abs(Math.cos((o.stride || 0) * 4.2)) * 1.6 : 0;
  ctx.save();
  ctx.translate(X, Y);
  ctx.scale(s, s);
  // shadow
  ctx.fillStyle = 'rgba(40,20,5,0.25)';
  ctx.beginPath(); ctx.ellipse(0, 0, 13, 4.5, 0, 0, 7); ctx.fill();
  ctx.translate(0, -bob);
  ctx.lineWidth = 1.8;
  ctx.strokeStyle = INK;
  ctx.lineJoin = 'round';
  const side = dir === 'left' || dir === 'right';
  const flip = dir === 'left' ? -1 : 1;
  // legs
  ctx.fillStyle = L.legs || '#3d4a66';
  if (side) {
    for (const k of [-1, 1]) { rr(ctx, -3 + k * sw * 4 * flip, -16, 6, 15, 2); ctx.fill(); ctx.stroke(); }
  } else {
    rr(ctx, -7, -16 + Math.max(0, sw) * 2, 6, 15 - Math.max(0, sw) * 2, 2); ctx.fill(); ctx.stroke();
    rr(ctx, 1, -16 + Math.max(0, -sw) * 2, 6, 15 - Math.max(0, -sw) * 2, 2); ctx.fill(); ctx.stroke();
  }
  // shoes
  ctx.fillStyle = '#2b2018';
  if (!side) { ctx.fillRect(-7, -2, 6, 3); ctx.fillRect(1, -2, 6, 3); }
  // what they are carrying, when it is held in front of them but they face away
  if (dir === 'up' && o.carry) carryBox(ctx, 0, -42, o.carry);   // held up, so it shows over the shoulders
  if (side && !o.carry) { ctx.fillStyle = shade(L.cloth || '#7f8fa6', 0.8); limb(ctx, 0, -34, sw * 0.55 * flip, null, L.skin); }
  // body
  const cloth = L.cloth || '#7f8fa6';
  ctx.fillStyle = cloth;
  rr(ctx, side ? -9 : -12, -38, side ? 18 : 24, 24, 7);
  ctx.fill(); ctx.stroke();
  if (L.collar === 'hivis') {
    ctx.fillStyle = '#eef3f6';
    ctx.fillRect(side ? -9 : -12, -26, side ? 18 : 24, 3);
  }
  if (o.apron && dir !== 'up') {
    ctx.fillStyle = '#4f7a3f';
    // side on, it covers the half of the body facing the way they walk
    rr(ctx, side ? 4 * flip - 5 : -9, -33, side ? 10 : 18, 22, 4);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#3e6131';
    if (!side) ctx.fillRect(-5, -24, 10, 5);
  }
  if (o.apron && dir === 'up') {
    ctx.strokeStyle = '#3e6131'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-6, -24); ctx.lineTo(6, -24); ctx.stroke();
    ctx.strokeStyle = INK; ctx.lineWidth = 1.8;
  }
  if (L.collar === 'tie' && dir === 'down') { ctx.fillStyle = '#b8483a'; ctx.beginPath(); ctx.moveTo(0, -36); ctx.lineTo(3, -28); ctx.lineTo(0, -22); ctx.lineTo(-3, -28); ctx.closePath(); ctx.fill(); }
  if (L.pack && dir !== 'down') { ctx.fillStyle = '#7a5a3a'; rr(ctx, side ? -12 * flip - 4 : -9, -37, side ? 8 : 18, 18, 4); ctx.fill(); ctx.stroke(); }
  // arms: hung from the shoulder and swung from there, against the legs; out front when
  // carrying. Side on, the far arm swings behind the body (drawn before it, above).
  ctx.fillStyle = cloth;
  if (o.carry && dir !== 'up') {
    rr(ctx, -14, -34, 6, 13, 3); ctx.fill(); ctx.stroke();
    rr(ctx, 8, -34, 6, 13, 3); ctx.fill(); ctx.stroke();
  } else if (side) {
    limb(ctx, 0, -34, -sw * 0.55 * flip, cloth, L.skin);
  } else {
    // seen from in front or behind, a swing mostly shows as the hand rising a little and
    // tucking in, so the angle is small and each arm opens outwards from its shoulder
    limb(ctx, -12, -35, 0.12 + Math.max(0, sw) * 0.18, cloth, L.skin, 18 - Math.max(0, sw) * 2.5);
    limb(ctx, 12, -35, -0.12 - Math.max(0, -sw) * 0.18, cloth, L.skin, 18 - Math.max(0, -sw) * 2.5);
  }
  // a basket on the arm once they have picked something up
  if (o.basket && o.basket.length && !o.carry) {
    const bx = side ? 6 * flip : 15, by = -18;
    ctx.fillStyle = '#d8d0c0';
    ctx.strokeStyle = INK;
    rr(ctx, bx - 8, by - 2, 16, 10, 2); ctx.fill(); ctx.stroke();
    o.basket.slice(0, 3).forEach((pid, k) => drawGood(ctx, pid, bx - 5 + k * 5, by + 1, 10));
    ctx.beginPath(); ctx.arc(bx, by - 2, 7, Math.PI, 0); ctx.stroke();
  }
  // head
  const hy = -48;
  ctx.fillStyle = L.skin || '#f2c193';
  ctx.beginPath(); ctx.arc(0, hy, 11, 0, 7); ctx.fill(); ctx.stroke();
  drawHair(ctx, L, dir, hy, flip);
  if (dir === 'down') face(ctx, L, hy, o.mood);
  else if (side) {
    ctx.fillStyle = '#2a2018';
    ctx.beginPath(); ctx.arc(5 * flip, hy + 1, 1.6, 0, 7); ctx.fill();
  }
  drawHat(ctx, L.hat, cloth, hy, dir, flip);
  // and the box, held out front
  if (dir !== 'up' && o.carry) carryBox(ctx, side ? 6 * flip : 0, -22, o.carry);
  ctx.restore();
}
// An arm from the shoulder at (x, y), turned by a (radians, 0 = hanging straight down),
// with a hand at the end.
function limb(ctx, x, y, a, fill, skin, len) {
  const l = len || 18;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  if (fill) ctx.fillStyle = fill;
  rr(ctx, -3, -2, 6, l, 3);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = skin || '#f2c193';
  ctx.beginPath(); ctx.arc(0, l - 1, 2.8, 0, 7); ctx.fill(); ctx.stroke();
  ctx.restore();
}
function carryBox(ctx, x, y, pid) {
  ctx.fillStyle = '#c9975a';
  rr(ctx, x - 16, y - 12, 32, 22, 2);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.fillStyle = '#b07f45';
  ctx.fillRect(x - 15, y - 11, 30, 5);
  ctx.fillStyle = '#e8d6b0';
  ctx.fillRect(x - 3, y - 11, 6, 5);
  drawGood(ctx, pid, x, y + 8, 15);
}
function face(ctx, L, hy, mood) {
  ctx.fillStyle = '#2a2018';
  ctx.beginPath(); ctx.arc(-4, hy + 1, 1.7, 0, 7); ctx.arc(4, hy + 1, 1.7, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(224,115,107,0.35)';
  ctx.beginPath(); ctx.ellipse(-7, hy + 5, 2.6, 1.6, 0, 0, 7); ctx.ellipse(7, hy + 5, 2.6, 1.6, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = '#2a2018';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  if (mood === 'sad') ctx.arc(0, hy + 8.5, 3, Math.PI * 1.15, Math.PI * 1.85);
  else if (mood === 'flat') { ctx.moveTo(-2.5, hy + 6); ctx.lineTo(2.5, hy + 6); }
  else ctx.arc(0, hy + 4, 3, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();
  ctx.lineWidth = 1.8;
  ctx.strokeStyle = INK;
}
function drawHair(ctx, L, dir, hy, flip) {
  const col = L.hairCol || '#3f2a1b';
  ctx.fillStyle = col;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.6;
  const style = L.hair;
  if (style === 'bald') {
    if (dir !== 'down') { ctx.beginPath(); ctx.arc(0, hy + 2, 10.5, 0.1, Math.PI - 0.1); ctx.fill(); }
    return;
  }
  ctx.beginPath();
  if (dir === 'up') {
    // the back of the head is mostly hair
    ctx.arc(0, hy, 11.5, Math.PI * 0.95, Math.PI * 2.05);
    ctx.lineTo(11, hy + (style === 'long' ? 14 : style === 'bob' ? 8 : 5));
    ctx.lineTo(-11, hy + (style === 'long' ? 14 : style === 'bob' ? 8 : 5));
    ctx.closePath();
  } else if (dir === 'down') {
    ctx.arc(0, hy, 11.5, Math.PI * 1.02, Math.PI * 1.98);
    ctx.quadraticCurveTo(4, hy - 6, -2, hy - 5);
    ctx.quadraticCurveTo(-8, hy - 4, -11.4, hy - 1);
    ctx.closePath();
  } else {
    ctx.arc(0, hy, 11.5, Math.PI * 1.05, Math.PI * 1.95);
    ctx.lineTo(-10 * flip, hy + 6);
    ctx.lineTo(-11 * flip, hy - 1);
    ctx.closePath();
  }
  ctx.fill(); ctx.stroke();
  if (style === 'long' || style === 'bob') {
    const d = style === 'long' ? 15 : 9;
    if (dir === 'down') { ctx.fillRect(-12, hy - 2, 4, d); ctx.fillRect(8, hy - 2, 4, d); }
  }
  if (style === 'pigtails') { for (const k of [-1, 1]) { ctx.beginPath(); ctx.arc(k * 13, hy + 2, 4.5, 0, 7); ctx.fill(); ctx.stroke(); } }
  if (style === 'bun') { ctx.beginPath(); ctx.arc(dir === 'down' ? 0 : -3 * flip, hy - 12, 5, 0, 7); ctx.fill(); ctx.stroke(); }
  if (style === 'spiky') { ctx.beginPath(); for (let k = -2; k <= 2; k++) { ctx.moveTo(k * 4 - 3, hy - 8); ctx.lineTo(k * 4, hy - 15); ctx.lineTo(k * 4 + 3, hy - 8); } ctx.fill(); }
  if (style === 'curly') { for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.arc(k * 4.5, hy - 9 + Math.abs(k), 4, 0, 7); ctx.fill(); } }
  if (style === 'messy') { ctx.lineWidth = 2.4; ctx.strokeStyle = col; ctx.beginPath(); ctx.moveTo(-5, hy - 10); ctx.lineTo(-8, hy - 15); ctx.moveTo(2, hy - 11); ctx.lineTo(3, hy - 16); ctx.stroke(); ctx.strokeStyle = INK; }
}
function drawHat(ctx, kind, col, hy, dir, flip) {
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.6;
  if (kind === 'hardhat') {
    ctx.fillStyle = '#f2b705';
    ctx.beginPath(); ctx.arc(0, hy - 2, 12, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#dda600'; ctx.fillRect(-14, hy - 3, 28, 3.5);
  } else if (kind === 'beanie' || kind === 'bobble') {
    ctx.fillStyle = kind === 'bobble' ? '#c8433a' : shade(col, 0.8);
    ctx.beginPath(); ctx.arc(0, hy - 3, 11.5, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = kind === 'bobble' ? '#a8362f' : shade(col, 0.65);
    ctx.fillRect(-12, hy - 5, 24, 4);
    if (kind === 'bobble') { ctx.fillStyle = '#fdf6e8'; ctx.beginPath(); ctx.arc(0, hy - 16, 4, 0, 7); ctx.fill(); ctx.stroke(); }
  } else if (kind === 'cap') {
    ctx.fillStyle = shade(col, 0.85);
    ctx.beginPath(); ctx.arc(0, hy - 2, 11.5, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    if (dir === 'down') { ctx.beginPath(); ctx.ellipse(0, hy - 1, 9, 3.5, 0, 0, Math.PI); ctx.fill(); ctx.stroke(); }
    else if (dir !== 'up') { ctx.fillRect(flip > 0 ? 6 : -15, hy - 3, 9, 3); }
  } else if (kind === 'flatcap') {
    ctx.fillStyle = '#8a7a63';
    ctx.beginPath(); ctx.ellipse(0, hy - 6, 12.5, 6, 0, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
  } else if (kind === 'sun') {
    ctx.fillStyle = '#f0dfae';
    ctx.beginPath(); ctx.ellipse(0, hy - 4, 17, 5, 0, 0, 7); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, hy - 5, 8, Math.PI, 0); ctx.fill(); ctx.stroke();
  }
}
function drawDog(ctx, X, Y, stride, moving) {
  const b = moving ? Math.sin(stride * 6) * 1.5 : 0;
  ctx.fillStyle = 'rgba(40,20,5,0.22)';
  ctx.beginPath(); ctx.ellipse(X, Y, 9, 3, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#9a6a3c';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  rr(ctx, X - 9, Y - 12 + b, 16, 8, 4); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(X + 8, Y - 13 + b, 5, 0, 7); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#6e4826';
  ctx.beginPath(); ctx.ellipse(X + 5, Y - 15 + b, 2, 4, 0.4, 0, 7); ctx.fill();
  ctx.fillRect(X - 8, Y - 5, 2.5, 5); ctx.fillRect(X + 3, Y - 5, 2.5, 5);
}

// ---------- bubbles ----------
// What someone wants you to know, over their head: a bare shelf they are waiting at, a
// price they will not pay, waiting at the till, and how it went.
function drawBubble(ctx, X, Y, b, t) {
  const w = b.pid ? 40 : 30, h = 30;
  const x = X - w / 2, y = Y - h - 8 + Math.sin(t * 3) * 1.2;
  const urgent = b.kind === 'till' || b.kind === 'want';
  rr(ctx, x, y, w, h, 10);
  ctx.fillStyle = b.kind === 'cross' ? '#ffe2dc' : urgent ? '#fff6d6' : '#fffaf0';
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath(); ctx.moveTo(X - 5, y + h - 0.5); ctx.lineTo(X, y + h + 7); ctx.lineTo(X + 5, y + h - 0.5); ctx.closePath();
  ctx.fill();
  ctx.beginPath(); ctx.moveTo(X - 5, y + h); ctx.lineTo(X, y + h + 7); ctx.lineTo(X + 5, y + h); ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const glyph = (g, col, size) => { ctx.fillStyle = col; ctx.font = '800 ' + (size || 18) + 'px "Baloo 2", system-ui, sans-serif'; ctx.fillText(g, X, y + h / 2 + 1); };
  if (b.kind === 'want' || b.kind === 'missing' || b.kind === 'dear') {
    drawGood(ctx, b.pid, X - 5, y + h - 5, 21);
    ctx.fillStyle = b.kind === 'dear' ? '#c0392b' : b.kind === 'want' ? '#d9822b' : '#7b6a5a';
    ctx.font = '800 15px "Baloo 2", system-ui, sans-serif';
    ctx.fillText(b.kind === 'dear' ? '£' : '?', X + 12, y + 11);
  } else if (b.kind === 'till') {
    // a little shop bell
    ctx.fillStyle = '#e0a82e';
    ctx.beginPath(); ctx.arc(X, y + 19, 8, Math.PI, 0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillRect(X - 10, y + 19, 20, 3);
    ctx.beginPath(); ctx.arc(X, y + 9, 2, 0, 7); ctx.fill();
    if (Math.sin(t * 9) > 0) { ctx.fillStyle = '#c0392b'; ctx.font = '800 13px "Baloo 2", system-ui, sans-serif'; ctx.fillText('!', X + 13, y + 9); }
  } else if (b.kind === 'happy') glyph('♥', '#d9503c', 20);
  else if (b.kind === 'meh') glyph('…', INK, 18);
  else if (b.kind === 'cross') glyph('✗', '#c0392b', 18);
}

// ---------- the front ----------
function drawFrontWall(ctx) {
  const y = py(ROWS);
  const h = 16;
  for (const [a, b] of [[-0.33, DOOR.x], [DOOR.x + DOOR.w, COLS + 0.33]]) {
    ctx.fillStyle = C.wallFace;
    ctx.fillRect(px(a), y + 10, px(b) - px(a), h);
    ctx.fillStyle = C.wallTop;
    ctx.fillRect(px(a), y - 4, px(b) - px(a), 15);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.strokeRect(px(a) + 1, y - 3, px(b) - px(a) - 2, h + 12);
  }
  // the door frame's sill
  ctx.fillStyle = '#9b7a52';
  ctx.fillRect(px(DOOR.x), y + 4, DOOR.w * TW, 6);
}

// ---------- the whole scene ----------
// sc: { state, day, keeper, t, hover, glow, flash, tillText, target }
export function drawScene(ctx, sc) {
  if (!still) still = paintStill();
  ctx.drawImage(still, 0, 0);
  const items = [];
  items.push({ y: py(0) - 1, draw: () => drawRoomSide(ctx) });
  for (const cr of sc.crates) items.push({ y: py(PALLETS[cr.pallet].at[1] + 1) - 0.5 + cr.side * 0.01, draw: () => drawCrates(ctx, sc, cr) });
  // carrying a box in the stockroom: every free side (and its own pile) is marked
  if (sc.freeSlots) for (const k of sc.freeSlots) items.push({ y: py(PALLETS[k >> 1].at[1] + 1) - 0.4, draw: () => markSlot(ctx, k, sc) });
  items.push({ y: py(STOCKROOM.h) - 0.1, draw: () => drawRoomFront(ctx, sc) });
  FACINGS.forEach((f, i) => items.push({ y: py(f.y + 1), draw: () => drawFacing(ctx, i, sc) }));
  items.push({ y: py(COUNTER.y + 1), draw: () => drawCounter(ctx, sc) });
  for (const [x, y] of PLANTS) items.push({ y: py(y + 0.85), draw: () => drawPlant(ctx, x, y) });
  const k = sc.keeper;
  items.push({
    y: py(k.y), draw: () => drawPerson(ctx, px(k.x), py(k.y), {
      look: KEEPER_LOOK, dir: k.dir, stride: k.stride, moving: k.moving, apron: true,
      carry: sc.state.carry ? sc.state.carry.pid : null,
    }),
  });
  const people = sc.day ? sc.day.people : [];
  for (const c of people) {
    items.push({
      y: py(c.y), draw: () => {
        const fade = c.y > ROWS ? Math.max(0, 1 - (c.y - ROWS) * 1.2) : 1;
        ctx.globalAlpha = fade;
        if (c.look.dog) drawDog(ctx, px(c.x) - 16, py(c.y) + 2, c.stride, c.moving);
        drawPerson(ctx, px(c.x), py(c.y), { look: c.look, dir: c.dir, stride: c.stride, moving: c.moving, mood: c.look.mood, basket: c.basket.map((b) => b.p.id) });
        ctx.globalAlpha = 1;
      },
    });
  }
  items.sort((a, b) => a.y - b.y);
  // where the keeper is heading
  if (sc.target) {
    ctx.strokeStyle = 'rgba(255,250,235,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(px(sc.target[0]), py(sc.target[1]), 12, 5, 0, 0, 7); ctx.stroke();
  }
  for (const it of items) it.draw();
  drawFrontWall(ctx);
  // bubbles go over everything
  for (const c of people) {
    if (!c.bubble || c.y > ROWS) continue;
    drawBubble(ctx, px(c.x), py(c.y) - (c.look.small ? 64 : 80), c.bubble, sc.t);
  }
  // patience over whoever is at the till
  const tc = sc.day && sc.day.till;
  if (tc && tc.state === 'till') {
    const f = Math.max(0, tc.patience / tc.maxPatience);
    const X = px(tc.x) + 26, Y = py(tc.y) - 52;
    ctx.fillStyle = 'rgba(59,42,27,0.8)';
    rr(ctx, X - 3, Y - 26, 8, 30, 3); ctx.fill();
    ctx.fillStyle = f < 0.3 ? '#e2604a' : f < 0.6 ? '#f2b33a' : '#74b04a';
    ctx.fillRect(X - 1, Y + 2 - 26 * f, 4, 26 * f);
  }
}

export const KEEPER_LOOK = { skin: '#f2c193', hair: 'crop', hairCol: '#6b4423', cloth: '#f3ead6', legs: '#4a4038', hat: 'none' };
