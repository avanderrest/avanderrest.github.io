/* Pocket Pal: all the painting. The room is painted once into a canvas (and again when the
   sky outside the window changes), the pet is drawn every frame from a pose (see poseFor in
   view.js), and the hand, the bowl, the ball and the little floating things are small
   drawing functions. No image files: everything is canvas paths, in room px (960 x 600). */

import { W, H, BOWL, BED, COLOURS } from './sim.js';

// ---------- constants ----------
const OUTLINE = '#6b4a3a';
const WALL_TOP = '#d3e8f0', WALL_BOT = '#b4d3e2';
const WOOD = ['#d9a476', '#cf9a6b', '#dcab7e', '#d3a072'];
const SKIES = [   // hour, top, bottom
  [0, '#18224a', '#34407a'], [5, '#2b3566', '#7a6d9e'], [6.5, '#f3b8a0', '#fde2c0'], [8, '#8fc6ef', '#d9f0fb'],
  [17, '#8fc6ef', '#d9f0fb'], [19, '#f39c7a', '#fbd59a'], [20.5, '#4b4a86', '#a07aa6'], [22, '#18224a', '#34407a'], [24, '#18224a', '#34407a'],
];

export function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}
const mix = (a, b, t) => {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const A = p(a), B = p(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
};
export function skyAt(hour) {
  for (let i = 1; i < SKIES.length; i++) {
    if (hour <= SKIES[i][0]) {
      const [h0, t0, b0] = SKIES[i - 1], [h1, t1, b1] = SKIES[i], t = (hour - h0) / (h1 - h0);
      return { top: mix(t0, t1, t), bot: mix(b0, b1, t), night: hour < 5.5 || hour > 20.8 };
    }
  }
  return { top: SKIES[0][1], bot: SKIES[0][2], night: true };
}
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function ell(ctx, x, y, rx, ry, rot = 0) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, Math.PI * 2); }
// a seeded wobble so the painted room is the same every time
function wob(i) { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }

// ---------- the room ----------
export function paintRoom(ctx, hour = 12) {
  const sky = skyAt(hour);
  // wall
  let g = ctx.createLinearGradient(0, 0, 0, 420);
  g.addColorStop(0, WALL_TOP); g.addColorStop(1, WALL_BOT);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, 420);
  // wallpaper: little soft diamonds
  ctx.fillStyle = 'rgba(255,255,255,0.32)';
  for (let y = 40; y < 400; y += 36) for (let x = (y / 36) % 2 ? 18 : 0; x < W; x += 36) {
    ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x + 4, y); ctx.lineTo(x, y + 4); ctx.lineTo(x - 4, y); ctx.fill();
  }
  // crown moulding
  ctx.fillStyle = '#f6efe2'; ctx.fillRect(0, 0, W, 20);
  ctx.fillStyle = '#e3d7c2'; ctx.fillRect(0, 20, W, 5);
  ctx.fillStyle = 'rgba(80,110,130,0.18)'; ctx.fillRect(0, 25, W, 6);

  // floor: boards running back to a vanishing point
  const fy = 412;
  g = ctx.createLinearGradient(0, fy, 0, H);
  g.addColorStop(0, '#c18d62'); g.addColorStop(1, '#dcaa7c');
  ctx.fillStyle = g; ctx.fillRect(0, fy, W, H - fy);
  const vx = W / 2, spread = 1.9;
  for (let i = -14; i <= 14; i++) {
    const xb = vx + i * 46, xb2 = vx + (i + 1) * 46;
    ctx.beginPath();
    ctx.moveTo(xb, fy); ctx.lineTo(xb2, fy); ctx.lineTo(vx + (xb2 - vx) * spread, H); ctx.lineTo(vx + (xb - vx) * spread, H); ctx.closePath();
    ctx.fillStyle = WOOD[(i + 20) % 4]; ctx.globalAlpha = 0.55; ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(120,70,40,0.35)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(xb, fy); ctx.lineTo(vx + (xb - vx) * spread, H); ctx.stroke();
    // a butt joint somewhere along each board
    const t = 0.2 + wob(i) * 0.6, yj = fy + (H - fy) * t;
    const xa = xb + (vx + (xb - vx) * spread - xb) * t, xc = xb2 + (vx + (xb2 - vx) * spread - xb2) * t;
    ctx.beginPath(); ctx.moveTo(xa, yj); ctx.lineTo(xc, yj); ctx.stroke();
  }
  // a soft sheen across the floor
  g = ctx.createRadialGradient(470, 470, 30, 470, 470, 420);
  g.addColorStop(0, 'rgba(255,240,215,0.35)'); g.addColorStop(1, 'rgba(255,240,215,0)');
  ctx.fillStyle = g; ctx.fillRect(0, fy, W, H - fy);
  // skirting board
  ctx.fillStyle = '#f4ece0'; ctx.fillRect(0, 392, W, 22);
  ctx.fillStyle = '#ddd0bd'; ctx.fillRect(0, 410, W, 4);
  ctx.fillStyle = 'rgba(70,40,20,0.18)'; ctx.fillRect(0, 414, W, 8);

  paintWindow(ctx, sky, hour);
  paintPicture(ctx);
  paintShelf(ctx);
  paintLamp(ctx, sky.night);
  paintRug(ctx);
  paintBasket(ctx);
}

function paintWindow(ctx, sky, hour) {
  const x = 380, y = 70, w = 200, h = 190;
  // the view out
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, sky.top); g.addColorStop(1, sky.bot);
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  if (sky.night) {
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 26; i++) { ctx.globalAlpha = 0.4 + wob(i + 9) * 0.6; ctx.fillRect(x + wob(i) * w, y + wob(i + 40) * h * 0.7, 2, 2); }
    ctx.globalAlpha = 1;
    ell(ctx, x + 150, y + 45, 16, 16); ctx.fillStyle = '#fbf3d0'; ctx.fill();
    ell(ctx, x + 157, y + 40, 14, 14); ctx.fillStyle = sky.top; ctx.fill();
  } else {
    const sunUp = hour > 6 && hour < 20;
    if (sunUp) {
      const sx = x + 40 + (hour - 6) / 14 * 120, sy = y + 30 + Math.abs(hour - 13) * 9;
      const sg = ctx.createRadialGradient(sx, sy, 4, sx, sy, 40);
      sg.addColorStop(0, 'rgba(255,250,215,1)'); sg.addColorStop(0.35, 'rgba(255,240,180,0.8)'); sg.addColorStop(1, 'rgba(255,240,180,0)');
      ctx.fillStyle = sg; ctx.fillRect(sx - 40, sy - 40, 80, 80);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (const [cx, cy, s] of [[x + 55, y + 70, 1], [x + 150, y + 105, 0.8]]) {
      for (const [dx, dy, r] of [[-16, 4, 11], [0, -4, 15], [16, 2, 12], [28, 7, 8]]) { ell(ctx, cx + dx * s, cy + dy * s, r * s, r * s); ctx.fill(); }
    }
  }
  // distant trees and a hill
  ctx.fillStyle = sky.night ? '#2d3a5a' : '#9cc79a';
  ctx.beginPath(); ctx.moveTo(x, y + h); ctx.quadraticCurveTo(x + 70, y + h - 70, x + 140, y + h - 30); ctx.quadraticCurveTo(x + 180, y + h - 55, x + w, y + h - 40); ctx.lineTo(x + w, y + h); ctx.fill();
  ctx.fillStyle = sky.night ? '#24304d' : '#7fb27f';
  for (const [tx, r] of [[x + 30, 22], [x + 62, 16], [x + 170, 20]]) { ell(ctx, tx, y + h - 48 + (tx - x) % 9, r, r * 1.2); ctx.fill(); }
  ctx.restore();
  // frame and muntins
  ctx.strokeStyle = '#fbf7ef'; ctx.lineWidth = 12; ctx.strokeRect(x, y, w, h);
  ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + h); ctx.moveTo(x, y + h * 0.45); ctx.lineTo(x + w, y + h * 0.45); ctx.stroke();
  ctx.strokeStyle = 'rgba(80,100,120,0.25)'; ctx.lineWidth = 2; ctx.strokeRect(x - 6, y - 6, w + 12, h + 12);
  // glass shine
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath(); ctx.moveTo(x + 14, y + 8); ctx.lineTo(x + 44, y + 8); ctx.lineTo(x + 8, y + 60); ctx.lineTo(x + 8, y + 30); ctx.fill();
  // sill
  rr(ctx, x - 24, y + h + 4, w + 48, 14, 4); ctx.fillStyle = '#fbf7ef'; ctx.fill();
  ctx.fillStyle = 'rgba(80,100,120,0.2)'; ctx.fillRect(x - 20, y + h + 18, w + 40, 5);
  // a plant on the sill
  const px = x + w - 6, py = y + h + 4;
  ctx.fillStyle = '#5f9a5c';
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i - 3) * 0.42;
    ctx.save(); ctx.translate(px, py - 22); ctx.rotate(a + Math.PI / 2);
    ell(ctx, 0, -18, 7, 18); ctx.fillStyle = i % 2 ? '#6aa866' : '#4f8a4f'; ctx.fill(); ctx.restore();
  }
  ctx.beginPath(); ctx.moveTo(px - 18, py - 26); ctx.lineTo(px + 18, py - 26); ctx.lineTo(px + 13, py); ctx.lineTo(px - 13, py); ctx.closePath();
  ctx.fillStyle = '#d17b56'; ctx.fill();
  ctx.fillStyle = '#e39470'; ctx.fillRect(px - 20, py - 30, 40, 7);
  // curtains on a rod
  ctx.fillStyle = '#c9a66b'; rr(ctx, x - 70, y - 18, w + 140, 7, 3); ctx.fill();
  for (const ex of [x - 74, x + w + 74]) { ell(ctx, ex, y - 14.5, 7, 7); ctx.fill(); }
  for (const side of [-1, 1]) {
    const cx = side < 0 ? x - 62 : x + w + 62;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx - 34, y - 12); ctx.lineTo(cx + 34, y - 12);
    ctx.quadraticCurveTo(cx + 10 * side, y + 150, cx + 26 * side, y + 240);
    ctx.lineTo(cx - 26 * side + 0, y + 240);
    ctx.quadraticCurveTo(cx - 30 * side, y + 150, cx - 34, y - 12);
    ctx.closePath();
    const cg = ctx.createLinearGradient(cx - 34, 0, cx + 34, 0);
    cg.addColorStop(0, '#a9bfe8'); cg.addColorStop(0.25, '#c8d7f3'); cg.addColorStop(0.5, '#a3b9e4'); cg.addColorStop(0.75, '#c8d7f3'); cg.addColorStop(1, '#a3b9e4');
    ctx.fillStyle = cg; ctx.fill();
    ctx.strokeStyle = 'rgba(70,90,140,0.35)'; ctx.lineWidth = 2; ctx.stroke();
    // tie-back
    ctx.fillStyle = '#e8c27a'; rr(ctx, cx - 22, y + 140, 44, 9, 4); ctx.fill();
    ctx.restore();
  }
}

function paintPicture(ctx) {
  const x = 150, y = 110, w = 120, h = 92;
  ctx.fillStyle = 'rgba(60,80,100,0.18)'; rr(ctx, x + 4, y + 6, w, h, 4); ctx.fill();
  ctx.fillStyle = '#b98756'; rr(ctx, x, y, w, h, 4); ctx.fill();
  ctx.fillStyle = '#fdf6e6'; ctx.fillRect(x + 9, y + 9, w - 18, h - 18);
  ctx.save(); ctx.beginPath(); ctx.rect(x + 14, y + 14, w - 28, h - 28); ctx.clip();
  ctx.fillStyle = '#bfe3f0'; ctx.fillRect(x, y, w, h);
  ell(ctx, x + 78, y + 34, 11, 11); ctx.fillStyle = '#ffd36b'; ctx.fill();
  ctx.fillStyle = '#9fd08e'; ell(ctx, x + 40, y + 88, 60, 32); ctx.fill();
  ctx.fillStyle = '#7fbe73'; ell(ctx, x + 98, y + 92, 50, 30); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = '#a0703f'; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  // a second tiny frame: a paw print
  const x2 = 190, y2 = 220;
  ctx.fillStyle = '#e9b8c3'; rr(ctx, x2, y2, 46, 46, 23); ctx.fill();
  ctx.strokeStyle = '#fbf7ef'; ctx.lineWidth = 5; ctx.stroke();
  ctx.fillStyle = '#fff4f6';
  ell(ctx, x2 + 23, y2 + 28, 8, 7); ctx.fill();
  for (const [dx, dy] of [[-9, -6], [-3, -11], [4, -11], [10, -6]]) { ell(ctx, x2 + 23 + dx, y2 + 23 + dy, 3, 3.6); ctx.fill(); }
}

function paintShelf(ctx) {
  const x = 770, y = 150, w = 150, h = 268;
  ctx.fillStyle = 'rgba(50,60,80,0.18)'; ctx.fillRect(x + 8, y + 8, w, h);
  ctx.fillStyle = '#b98257'; rr(ctx, x, y, w, h, 5); ctx.fill();
  ctx.fillStyle = '#a5714a'; ctx.fillRect(x + 10, y + 12, w - 20, h - 22);
  const shelves = [y + 12, y + 80, y + 150];
  for (let s = 0; s < 2; s++) {
    const top = shelves[s] + 4, bottom = shelves[s + 1];
    ctx.fillStyle = '#8f5f3d'; ctx.fillRect(x + 10, top, w - 20, bottom - top);
    let bx = x + 14, i = s * 9;
    while (bx < x + w - 22) {
      const bw = 9 + wob(i) * 8, bh = (bottom - top) * (0.62 + wob(i + 3) * 0.32);
      const col = ['#e98b7d', '#7fb6d9', '#f2cf72', '#8cc59a', '#b69ad8', '#f0a7c0', '#f5e6c8'][Math.floor(wob(i + 7) * 7)];
      if (wob(i + 11) > 0.86 && bx < x + w - 50) {   // one leaning over
        ctx.save(); ctx.translate(bx, bottom); ctx.rotate(0.32); ctx.fillStyle = col; ctx.fillRect(0, -bh, bw, bh); ctx.restore(); bx += bw + 12;
      } else {
        ctx.fillStyle = col; ctx.fillRect(bx, bottom - bh, bw, bh);
        ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(bx + 2, bottom - bh + 6, bw - 4, 2.5);
        bx += bw + 1.5;
      }
      i++;
    }
    ctx.fillStyle = '#c8916a'; ctx.fillRect(x + 6, bottom, w - 12, 8);
  }
  // cupboard doors at the bottom
  const cy = shelves[2] + 8;
  ctx.fillStyle = '#c18b60'; ctx.fillRect(x + 10, cy, w - 20, y + h - cy - 10);
  ctx.strokeStyle = '#94643f'; ctx.lineWidth = 2;
  ctx.strokeRect(x + 16, cy + 8, (w - 36) / 2, y + h - cy - 26); ctx.strokeRect(x + 20 + (w - 36) / 2, cy + 8, (w - 36) / 2, y + h - cy - 26);
  ctx.fillStyle = '#f2d39a'; ell(ctx, x + w / 2 - 8, cy + 50, 3.5, 3.5); ctx.fill(); ell(ctx, x + w / 2 + 8, cy + 50, 3.5, 3.5); ctx.fill();
  // on top: a pot plant and a little box
  ctx.fillStyle = '#f7f1e4'; rr(ctx, x + 92, y - 30, 44, 30, 3); ctx.fill();
  ctx.strokeStyle = '#d8ccb8'; ctx.strokeRect(x + 92, y - 22, 44, 1);
  ctx.fillStyle = '#5f9a5c';
  for (let i = 0; i < 5; i++) { ctx.save(); ctx.translate(x + 40, y - 26); ctx.rotate((i - 2) * 0.5); ell(ctx, 0, -14, 6, 14); ctx.fillStyle = i % 2 ? '#6aa866' : '#4f8a4f'; ctx.fill(); ctx.restore(); }
  ctx.fillStyle = '#e7a07c'; rr(ctx, x + 26, y - 28, 28, 28, 4); ctx.fill();
}

function paintLamp(ctx, night) {
  const x = 70, y = 300;
  // a little round side table
  ctx.fillStyle = 'rgba(60,40,20,0.18)'; ell(ctx, x + 6, 432, 46, 9); ctx.fill();
  ctx.fillStyle = '#c79566'; ctx.fillRect(x - 4, y + 52, 8, 78);
  ell(ctx, x, 430, 26, 6); ctx.fillStyle = '#b07f53'; ctx.fill();
  ell(ctx, x, y + 50, 50, 11); ctx.fillStyle = '#d8a678'; ctx.fill();
  ell(ctx, x, y + 46, 50, 11); ctx.fillStyle = '#e6b88a'; ctx.fill();
  // lamp
  ctx.fillStyle = '#f0c75e'; ctx.fillRect(x - 3, y - 10, 6, 54);
  ell(ctx, x, y + 44, 15, 5); ctx.fillStyle = '#e0b04a'; ctx.fill();
  ctx.beginPath(); ctx.moveTo(x - 20, y - 50); ctx.lineTo(x + 20, y - 50); ctx.lineTo(x + 32, y - 6); ctx.lineTo(x - 32, y - 6); ctx.closePath();
  ctx.fillStyle = night ? '#ffe7a8' : '#f7d9c4'; ctx.fill();
  ctx.strokeStyle = 'rgba(150,100,70,0.4)'; ctx.lineWidth = 2; ctx.stroke();
  // a cup
  ctx.fillStyle = '#fbf7ef'; rr(ctx, x + 24, y + 26, 14, 16, 3); ctx.fill();
  ctx.strokeStyle = '#fbf7ef'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x + 40, y + 34, 5, -1.2, 1.2); ctx.stroke();
}

function paintRug(ctx) {
  const cx = 480, cy = 505, rx = 250, ry = 62;
  ctx.fillStyle = 'rgba(90,50,20,0.16)'; ell(ctx, cx + 6, cy + 8, rx + 8, ry + 6); ctx.fill();
  // fluffy edge: tufts all the way round
  ctx.fillStyle = '#efe4d6';
  for (let i = 0; i < 96; i++) { const a = i / 96 * Math.PI * 2; ell(ctx, cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, 9 + wob(i) * 4, 6 + wob(i + 5) * 3); ctx.fill(); }
  const g = ctx.createRadialGradient(cx - 40, cy - 20, 10, cx, cy, rx);
  g.addColorStop(0, '#fffaf3'); g.addColorStop(1, '#f2e7da');
  ctx.fillStyle = g; ell(ctx, cx, cy, rx, ry); ctx.fill();
  ctx.strokeStyle = 'rgba(214,170,180,0.55)'; ctx.lineWidth = 5; ell(ctx, cx, cy, rx - 26, ry - 12); ctx.stroke();
  ctx.strokeStyle = 'rgba(214,170,180,0.35)'; ctx.lineWidth = 2; ell(ctx, cx, cy, rx - 40, ry - 18); ctx.stroke();
  // pile
  ctx.strokeStyle = 'rgba(200,180,160,0.35)'; ctx.lineWidth = 1.2;
  for (let i = 0; i < 160; i++) {
    const a = wob(i) * Math.PI * 2, r = Math.sqrt(wob(i + 200)) * 0.92;
    const px = cx + Math.cos(a) * rx * r, py = cy + Math.sin(a) * ry * r;
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + 2, py - 3); ctx.stroke();
  }
}

function paintBasket(ctx) {
  const { x, y } = BED, cx = x, cy = y + 28;
  ctx.fillStyle = 'rgba(80,45,20,0.2)'; ell(ctx, cx + 4, cy + 14, 84, 22); ctx.fill();
  // rim, back half
  ell(ctx, cx, cy - 6, 80, 30); ctx.fillStyle = '#c9965f'; ctx.fill();
  // cushion
  ell(ctx, cx, cy - 2, 62, 20); ctx.fillStyle = '#f3b9c6'; ctx.fill();
  ell(ctx, cx - 6, cy - 6, 44, 11); ctx.fillStyle = '#f9d3dc'; ctx.fill();
  // rim, front half with weave
  ctx.beginPath(); ctx.ellipse(cx, cy - 6, 80, 30, 0, 0, Math.PI); ctx.ellipse(cx, cy + 6, 82, 30, 0, Math.PI, 0, true); ctx.closePath();
  ctx.fillStyle = '#d6a46c'; ctx.fill();
  ctx.strokeStyle = 'rgba(140,90,45,0.55)'; ctx.lineWidth = 1.5;
  for (let i = 1; i < 16; i++) { const a = i / 16 * Math.PI, px = cx + Math.cos(a) * 81; ctx.beginPath(); ctx.moveTo(px, cy - 6 + Math.sin(a) * 30); ctx.lineTo(px, cy + 6 + Math.sin(a) * 30); ctx.stroke(); }
}

// lights low: the room at night or while the pet sleeps
export function paintDark(ctx, amount, glow) {
  if (amount <= 0) return;
  ctx.fillStyle = `rgba(28,32,78,${0.5 * amount})`; ctx.fillRect(0, 0, W, H);
  if (glow) {
    const g = ctx.createRadialGradient(70, 290, 6, 70, 290, 220);
    g.addColorStop(0, `rgba(255,214,140,${0.45 * amount})`); g.addColorStop(1, 'rgba(255,214,140,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 60, 320, 460);
  }
}

// ---------- the pet ----------
/* A pose is everything that moves: see poseFor() in view.js. All in pet units (about 1 px
   at the front of the rug); the pet stands on its feet at (0, 0). */
export const REST = {
  lift: 0, rot: 0, turn: 1, sx: 1, sy: 1, bodySx: 1, bodySy: 1,
  headX: 0, headY: 0, headRot: 0, ear: 0, eyes: 'open', mouth: 'smile', blush: 0.6,
  pawL: [0, 0], pawR: [0, 0], footL: [0, 0], footR: [0, 0], tail: 0, lookX: 0, lookY: 0, lying: 0,
};

function fluff(ctx, cx, cy, rx, ry, n, r, inset, fill) {
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx - inset, ry - inset, 0, 0, Math.PI * 2);
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2, px = cx + Math.cos(a) * rx * 0.94, py = cy + Math.sin(a) * ry * 0.94;
    ctx.moveTo(px + r - inset, py); ctx.arc(px, py, Math.max(0.5, r - inset), 0, Math.PI * 2);
  }
  ctx.fillStyle = fill; ctx.fill('nonzero');
}
function furBlob(ctx, cx, cy, rx, ry, n, r, col, lightDir = -1) {
  fluff(ctx, cx, cy, rx, ry, n, r, 0, OUTLINE);
  const g = ctx.createRadialGradient(cx - rx * 0.35, cy - ry * 0.45, 2, cx, cy, Math.max(rx, ry) * 1.15);
  g.addColorStop(0, col.light); g.addColorStop(0.55, col.fur); g.addColorStop(1, col.shade);
  fluff(ctx, cx, cy, rx, ry, n, r, 3, g);
}

export function drawShadow(ctx, x, y, s, alpha = 1) {
  ctx.fillStyle = `rgba(70,40,20,${0.2 * alpha})`; ell(ctx, x, y + 2 * s, 54 * s, 13 * s); ctx.fill();
}

export function drawPet(ctx, x, y, s, face, colourKey, p) {
  const col = COLOURS[colourKey] || COLOURS.honey;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.translate(0, -p.lift);
  // roll and lying turn about the middle of the body
  if (p.rot) { ctx.translate(0, -55); ctx.rotate(p.rot); ctx.translate(0, 55); }
  const fx = face * p.turn;
  ctx.scale(fx || 0.001, 1);
  ctx.scale(p.sx, p.sy);

  // tail, behind everything
  ctx.save();
  ctx.translate(-34, -36); ctx.rotate(-0.55 + p.tail);
  furBlob(ctx, -10, -16, 16, 21, 12, 5, col);
  furBlob(ctx, -4, -38, 12, 13, 10, 4.5, col);
  ctx.restore();

  // back feet
  for (const [fx2, f] of [[-24, p.footL], [26, p.footR]]) {
    ell(ctx, fx2 + f[0], -8 + f[1], 17, 11); ctx.fillStyle = OUTLINE; ctx.fill();
    ell(ctx, fx2 + f[0], -9 + f[1], 14.5, 8.5); ctx.fillStyle = col.fur; ctx.fill();
  }
  // body
  ctx.save(); ctx.translate(0, -42); ctx.scale(p.bodySx, p.bodySy);
  furBlob(ctx, 0, 0, 46, 38, 24, 6.5, col);
  ell(ctx, 6, 6, 24, 20); ctx.fillStyle = col.light; ctx.globalAlpha = 0.75; ctx.fill(); ctx.globalAlpha = 1;
  ctx.restore();

  // head
  ctx.save();
  ctx.translate(p.headX + 4, -98 + p.headY);
  ctx.rotate(p.headRot);
  furBlob(ctx, 0, 0, 52, 45, 30, 5.5, col);
  // a soft curl on top
  ctx.save(); ctx.translate(-2, -42);
  for (const [dx, a, h] of [[-6, -0.45, 13], [4, 0.2, 17]]) {
    ctx.save(); ctx.translate(dx, 4); ctx.rotate(a);
    ctx.beginPath(); ctx.moveTo(-7, 5); ctx.quadraticCurveTo(-5, -h, 4, -h * 0.85); ctx.quadraticCurveTo(-1, -h * 0.4, 7, 5); ctx.closePath();
    ctx.fillStyle = OUTLINE; ctx.fill(); ctx.scale(0.78, 0.8); ctx.fillStyle = col.light; ctx.fill();
    ctx.restore();
  }
  ctx.restore();

  // floppy ears, over the sides of the head, swinging
  for (const side of [-1, 1]) {
    ctx.save(); ctx.translate(side * 47, -16); ctx.rotate(side * (0.1 - p.ear));
    const ear = () => {
      ctx.beginPath(); ctx.moveTo(0, -6);
      ctx.bezierCurveTo(side * 24, -4, side * 28, 30, side * 13, 48);
      ctx.bezierCurveTo(side * 3, 58, -side * 12, 44, -side * 9, 22);
      ctx.bezierCurveTo(-side * 7, 8, -side * 5, -6, 0, -6);
    };
    ear(); ctx.fillStyle = OUTLINE; ctx.fill();
    ctx.translate(side * 1.5, 2.5); ctx.scale(0.86, 0.88); ear(); ctx.fillStyle = col.ear; ctx.fill();
    ctx.restore();
  }

  // face, turned a little toward where it faces
  const F = 8;
  // blush
  if (p.blush > 0) {
    ctx.fillStyle = `rgba(255,128,150,${0.55 * p.blush})`;
    ell(ctx, F - 30, 16, 9, 5.5); ctx.fill(); ell(ctx, F + 30, 16, 9, 5.5); ctx.fill();
  }
  drawEyes(ctx, F, p);
  // nose
  ctx.beginPath(); ctx.moveTo(F - 6, 9); ctx.quadraticCurveTo(F, 6, F + 6, 9); ctx.quadraticCurveTo(F + 4, 15, F, 16); ctx.quadraticCurveTo(F - 4, 15, F - 6, 9);
  ctx.fillStyle = '#4a2b22'; ctx.fill();
  ell(ctx, F - 1.5, 9.5, 2, 1.2); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fill();
  drawMouth(ctx, F, p.mouth);
  ctx.restore();

  // front paws, in front of the body
  for (const [px, pp] of [[-16, p.pawL], [20, p.pawR]]) {
    ell(ctx, px + pp[0], -7 + pp[1], 13, 10); ctx.fillStyle = OUTLINE; ctx.fill();
    ell(ctx, px + pp[0], -8 + pp[1], 10.5, 7.5); ctx.fillStyle = col.light; ctx.fill();
    ctx.strokeStyle = 'rgba(107,74,58,0.55)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(px + pp[0] - 3, -4 + pp[1]); ctx.lineTo(px + pp[0] - 3, -9 + pp[1]); ctx.moveTo(px + pp[0] + 3, -4 + pp[1]); ctx.lineTo(px + pp[0] + 3, -9 + pp[1]); ctx.stroke();
  }
  ctx.restore();
}

function drawEyes(ctx, F, p) {
  const L = [F - 19, 1], R = [F + 21, 1];
  ctx.strokeStyle = '#3b2620'; ctx.lineCap = 'round'; ctx.lineWidth = 3.4;
  if (p.eyes === 'happy') {
    for (const [ex, ey] of [L, R]) { ctx.beginPath(); ctx.arc(ex, ey + 4, 7, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); }
    return;
  }
  if (p.eyes === 'closed') {
    for (const [ex, ey] of [L, R]) { ctx.beginPath(); ctx.arc(ex, ey - 2, 7, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke(); }
    return;
  }
  if (p.eyes === 'squint') {
    for (const [ex, ey, d] of [[...L, 1], [...R, -1]]) { ctx.beginPath(); ctx.moveTo(ex - 6, ey - 4 * d); ctx.lineTo(ex + 5, ey); ctx.lineTo(ex - 6, ey + 4 * d); ctx.stroke(); }
    return;
  }
  const big = p.eyes === 'wide' ? 1.15 : 1;
  for (const [ex, ey] of [L, R]) {
    const rx = 7.8 * big, ry = 10 * big;
    ell(ctx, ex + p.lookX, ey + p.lookY, rx, ry); ctx.fillStyle = '#2e1d18'; ctx.fill();
    ell(ctx, ex + p.lookX, ey + p.lookY + ry * 0.45, rx * 0.7, ry * 0.35); ctx.fillStyle = 'rgba(120,80,70,0.55)'; ctx.fill();
    ell(ctx, ex + p.lookX - 2.6, ey + p.lookY - 3.6, 3.2, 3.6); ctx.fillStyle = '#fff'; ctx.fill();
    ell(ctx, ex + p.lookX + 2.8, ey + p.lookY + 3.2, 1.5, 1.5); ctx.fill();
    if (p.eyes === 'half') {
      // heavy lids
      ctx.fillStyle = (p.lidCol || '#f2c35a');
      ctx.fillRect(ex - rx - 2, ey - ry - 2, rx * 2 + 4, ry + 1);
      ctx.beginPath(); ctx.moveTo(ex - rx - 1, ey - 1); ctx.lineTo(ex + rx + 1, ey - 1); ctx.stroke();
    }
  }
}

function drawMouth(ctx, F, m) {
  ctx.strokeStyle = '#4a2b22'; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const y = 18;
  if (m === 'open' || m === 'tongue' || m === 'chomp' || m === 'o' || m === 'yawn') {
    const h = m === 'chomp' ? 4 : m === 'o' ? 6 : m === 'yawn' ? 13 : 9, w = m === 'o' ? 5 : m === 'yawn' ? 8 : 9;
    ctx.beginPath();
    if (m === 'o' || m === 'yawn') ell(ctx, F + 1, y + h * 0.7, w, h);
    else { ctx.moveTo(F - w, y); ctx.quadraticCurveTo(F + 1, y + h * 2.2, F + w + 2, y); ctx.closePath(); }
    ctx.fillStyle = '#8a3b3b'; ctx.fill(); ctx.stroke();
    if (m === 'tongue' || m === 'open') { ell(ctx, F + 1, y + h * 0.9, 5, 4); ctx.fillStyle = '#f08a9a'; ctx.fill(); }
    return;
  }
  if (m === 'flat') { ctx.beginPath(); ctx.moveTo(F - 5, y + 2); ctx.lineTo(F + 7, y + 2); ctx.stroke(); return; }
  if (m === 'frown') { ctx.beginPath(); ctx.arc(F + 1, y + 7, 6, Math.PI * 1.2, Math.PI * 1.8); ctx.stroke(); return; }
  // the little 'w'
  ctx.beginPath();
  ctx.moveTo(F - 8, y - 1); ctx.quadraticCurveTo(F - 4, y + 5, F + 1, y); ctx.quadraticCurveTo(F + 6, y + 5, F + 10, y - 1);
  ctx.stroke();
}

// ---------- things in the room ----------
export function drawBowl(ctx, bowl) {
  const { x, y } = BOWL;
  ctx.fillStyle = 'rgba(70,40,20,0.2)'; ell(ctx, x + 3, y + 12, 40, 10); ctx.fill();
  // food first, so the bowl's front lip covers its foot
  if (bowl && bowl.left > 0.02) {
    const k = bowl.left;
    if (bowl.food === 'kibble') {
      for (let i = 0; i < Math.ceil(16 * k); i++) {
        const a = wob(i) * Math.PI * 2, r = wob(i + 30) * 22;
        ell(ctx, x + Math.cos(a) * r, y - 6 - 5 * k - wob(i + 50) * 7 * k + Math.sin(a) * r * 0.3, 5, 4, a);
        ctx.fillStyle = ['#a7643a', '#c07a45', '#8e5230'][i % 3]; ctx.fill();
      }
    } else if (bowl.food === 'apple') {
      ctx.save(); ctx.beginPath(); ctx.rect(x - 40, y - 60, 80, 60 - (1 - k) * 0); ctx.clip();
      const r = 15 * (0.4 + 0.6 * k);
      ell(ctx, x - 4, y - 8 - r * 0.8, r, r * 0.95); ctx.fillStyle = '#e8524a'; ctx.fill();
      ell(ctx, x - 9, y - 12 - r, r * 0.3, r * 0.22); ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fill();
      ctx.strokeStyle = '#6b4a3a'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(x - 4, y - 8 - r * 1.7); ctx.lineTo(x - 1, y - 14 - r * 1.9); ctx.stroke();
      ell(ctx, x + 4, y - 14 - r * 1.8, 6, 3, -0.4); ctx.fillStyle = '#6aa866'; ctx.fill();
      ctx.restore();
    } else {
      const s = 0.45 + 0.55 * k;
      ctx.save(); ctx.translate(x, y - 6); ctx.scale(s, s);
      ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(-11, -16); ctx.lineTo(11, -16); ctx.lineTo(14, 0); ctx.closePath();
      ctx.fillStyle = '#f5b0c2'; ctx.fill();
      ctx.strokeStyle = 'rgba(200,110,130,0.7)'; ctx.lineWidth = 1.5; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * 5, 0); ctx.lineTo(i * 4, -16); ctx.stroke(); }
      for (const [dx, dy, r] of [[-8, -20, 8], [8, -20, 8], [0, -26, 9]]) { ell(ctx, dx, dy, r, r * 0.85); ctx.fillStyle = '#fff6ee'; ctx.fill(); }
      ell(ctx, 0, -36, 4.5, 4.5); ctx.fillStyle = '#e8424f'; ctx.fill();
      for (let i = 0; i < 6; i++) { ctx.fillStyle = ['#7fb6d9', '#f2cf72', '#8cc59a'][i % 3]; ctx.fillRect(-10 + i * 4, -24 - (i % 2) * 4, 2.5, 1.5); }
      ctx.restore();
    }
  }
  // the bowl
  ctx.beginPath(); ctx.moveTo(x - 36, y - 8); ctx.quadraticCurveTo(x - 32, y + 12, x - 20, y + 12); ctx.lineTo(x + 20, y + 12); ctx.quadraticCurveTo(x + 32, y + 12, x + 36, y - 8); ctx.closePath();
  const g = ctx.createLinearGradient(x - 36, 0, x + 36, 0);
  g.addColorStop(0, '#5e8fd0'); g.addColorStop(0.4, '#8ab6ea'); g.addColorStop(1, '#4f7cc0');
  ctx.fillStyle = g; ctx.fill();
  ell(ctx, x, y - 8, 36, 8); ctx.fillStyle = '#a9cbf2'; ctx.fill();
  if (!(bowl && bowl.left > 0.02)) { ell(ctx, x, y - 7, 29, 5.5); ctx.fillStyle = '#4d77b5'; ctx.fill(); }
  // a paw print on the front
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ell(ctx, x, y + 4, 4.2, 3.4); ctx.fill();
  for (const [dx, dy] of [[-5, -2], [-2, -5], [2, -5], [5, -2]]) { ell(ctx, x + dx, y + 1 + dy, 1.5, 1.8); ctx.fill(); }
}

export function drawBall(ctx, b, t) {
  const r = 13;
  ctx.fillStyle = `rgba(70,40,20,${0.22 * Math.max(0.3, 1 - b.z / 120)})`; ell(ctx, b.x, b.y + 2, r * (1 - Math.min(0.5, b.z / 240)), 4); ctx.fill();
  const y = b.y - r - b.z;
  ctx.save(); ctx.translate(b.x, y); ctx.rotate(b.x / r);
  ell(ctx, 0, 0, r, r); ctx.fillStyle = '#ef6a5a'; ctx.fill();
  ctx.save(); ctx.clip();
  ctx.fillStyle = '#ffe07a'; ctx.fillRect(-r, -4, r * 2, 8);
  ctx.restore();
  ctx.lineWidth = 2; ctx.strokeStyle = OUTLINE; ell(ctx, 0, 0, r, r); ctx.stroke();
  ctx.restore();
  ell(ctx, b.x - 4, y - 5, 3.5, 2.5); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fill();
}

// the player's hand: an open palm for stroking, a pointing finger for drawing, a sponge for the bath
export function drawHand(ctx, x, y, mode, press, t) {
  ctx.save(); ctx.translate(x, y);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (mode === 'sponge') {
    ctx.rotate(-0.2 + Math.sin(t * 20) * (press ? 0.15 : 0));
    rr(ctx, -22, -15, 44, 30, 9); ctx.fillStyle = '#ffd95e'; ctx.fill(); ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.5; ctx.stroke();
    rr(ctx, -22, 5, 44, 10, 4); ctx.fillStyle = '#7cc490'; ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e8b93c'; for (const [dx, dy] of [[-10, -6], [4, -9], [12, -2], [-2, 0]]) { ell(ctx, dx, dy, 2.2, 2.2); ctx.fill(); }
    ctx.restore(); return;
  }
  ctx.rotate(-0.35);
  if (press) ctx.scale(0.94, 0.94);
  const skin = '#ffe3cf', line = OUTLINE;
  ctx.fillStyle = skin; ctx.strokeStyle = line; ctx.lineWidth = 2.6;
  const finger = (fx, fy, len, w = 9, a = 0) => {
    ctx.save(); ctx.translate(fx, fy); ctx.rotate(a);
    rr(ctx, -w / 2, -len, w, len + 6, w / 2); ctx.fill(); ctx.stroke(); ctx.restore();
  };
  if (mode === 'point') {
    finger(-6, -6, 28, 10);
    // palm with curled fingers
    rr(ctx, -16, -8, 34, 30, 11); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(3, 0); ctx.lineTo(14, 0); ctx.moveTo(3, 8); ctx.lineTo(14, 8); ctx.moveTo(3, 15); ctx.lineTo(13, 15); ctx.stroke();
    finger(-14, 8, 14, 9, -1.1);
  } else {
    finger(-11, -4, 18, 9, -0.12); finger(-2, -6, 22, 9, -0.03); finger(7, -6, 21, 9, 0.06); finger(15, -3, 16, 8.5, 0.16);
    rr(ctx, -16, -8, 36, 32, 13); ctx.fill(); ctx.stroke();
    ctx.fillStyle = skin; ctx.fillRect(-13, -9, 30, 6);
    finger(-16, 12, 16, 9.5, -1.0);
    ctx.strokeStyle = 'rgba(107,74,58,0.35)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(2, 10, 8, 0.3, 2.6); ctx.stroke();
  }
  ctx.restore();
}

// ---------- little things that float up ----------
export function drawHeart(ctx, x, y, s, col = '#ff7a95') {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.beginPath(); ctx.moveTo(0, 6); ctx.bezierCurveTo(-12, -2, -8, -12, 0, -6); ctx.bezierCurveTo(8, -12, 12, -2, 0, 6);
  ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = 'rgba(160,50,80,0.5)'; ctx.lineWidth = 1.2; ctx.stroke();
  ell(ctx, -4, -5, 2, 1.4, -0.6); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fill();
  ctx.restore();
}
export function drawBubble(ctx, x, y, r) {
  ell(ctx, x, y, r, r); ctx.fillStyle = 'rgba(220,240,255,0.35)'; ctx.fill();
  ctx.strokeStyle = 'rgba(140,180,220,0.8)'; ctx.lineWidth = 1.4; ctx.stroke();
  ell(ctx, x - r * 0.35, y - r * 0.35, r * 0.25, r * 0.18, -0.6); ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill();
}
export function drawStar(ctx, x, y, r, col = '#ffd84d') {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr2 = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); }
  ctx.closePath(); ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = 'rgba(180,120,20,0.6)'; ctx.lineWidth = 1.2; ctx.stroke();
}
export function drawNote(ctx, x, y, s) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.fillStyle = '#7a64c8'; ctx.strokeStyle = '#7a64c8'; ctx.lineWidth = 2.4;
  ell(ctx, 0, 0, 5, 4, -0.4); ctx.fill(); ctx.beginPath(); ctx.moveTo(4.4, -1); ctx.lineTo(4.4, -16); ctx.quadraticCurveTo(9, -12, 12, -10); ctx.stroke();
  ctx.restore();
}
export function drawDrop(ctx, x, y, s) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.beginPath(); ctx.moveTo(0, -7); ctx.quadraticCurveTo(6, 1, 0, 5); ctx.quadraticCurveTo(-6, 1, 0, -7);
  ctx.fillStyle = '#8fc8f0'; ctx.fill(); ctx.restore();
}

// a thought bubble over its head, with what it wants drawn inside
export function drawThought(ctx, x, y, want, t) {
  const bob = Math.sin(t * 2.4) * 3;
  y += bob;
  ctx.fillStyle = '#fffdf8'; ctx.strokeStyle = 'rgba(107,74,58,0.6)'; ctx.lineWidth = 2;
  ell(ctx, x - 26, y + 44, 5, 5); ctx.fill(); ctx.stroke();
  ell(ctx, x - 16, y + 32, 7, 7); ctx.fill(); ctx.stroke();
  ell(ctx, x, y, 26, 22); ctx.fill(); ctx.stroke();
  if (want === 'food') {
    ctx.save(); ctx.translate(x, y + 4); ctx.scale(0.5, 0.5);
    ctx.beginPath(); ctx.moveTo(-36, -8); ctx.quadraticCurveTo(-32, 12, -20, 12); ctx.lineTo(20, 12); ctx.quadraticCurveTo(32, 12, 36, -8); ctx.closePath();
    ctx.fillStyle = '#6f9fe0'; ctx.fill(); ell(ctx, 0, -8, 36, 8); ctx.fillStyle = '#a9cbf2'; ctx.fill();
    for (let i = 0; i < 6; i++) { ell(ctx, -16 + i * 6.5, -12 - (i % 2) * 5, 6, 5); ctx.fillStyle = '#b06a3e'; ctx.fill(); }
    ctx.restore();
  } else if (want === 'sleep') {
    ctx.fillStyle = '#7a86c8'; ctx.font = 'bold 20px "Baloo 2", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('z', x - 8, y + 8); ctx.font = 'bold 14px "Baloo 2", sans-serif'; ctx.fillText('z', x + 6, y - 2); ctx.fillText('z', x + 14, y - 10);
  } else if (want === 'bath') {
    drawBubble(ctx, x - 8, y + 3, 8); drawBubble(ctx, x + 8, y - 4, 6); drawBubble(ctx, x + 6, y + 9, 4);
  } else if (want === 'love') {
    drawHeart(ctx, x, y + 2, 1.3);
  } else if (want === '?') {
    ctx.fillStyle = '#c0703a'; ctx.font = 'bold 26px "Baloo 2", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('?', x, y + 9);
  }
}
