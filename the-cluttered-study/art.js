/* The Cluttered Study: all the painting. The room (stone wall, a moonlit window, two
   bookcases, the shelves on the wall, the desk, the cauldron on its fire, a rug and a
   sleeping cat) is painted once onto its own canvas; every thing is painted once into a
   sprite at three times its size; what moves (the cauldron's bubbles, the flames, the
   moonlight, dust in the air) is drawn live on top. No image files.

   A thing is drawn with its foot at (0, 0) and its top at (0, -h): ink outlines, flat
   colour, one highlight, the way a picture book does it. */

import { W, H, CASE_L, CASE_R, CASE_TOP, PLANKS, INSET, LEDGE, DESK, CAULDRON, WALL, THING } from './sim.js';
import { VARIANTS } from './content.js';
import { hash2 } from '../lib/rng.js';

// ---------- constants ----------
export const INK = '#2a1b2e';
export const SPRITE_SCALE = 3;
export const PAD = 10;
const LW = 2.2;
const WOOD = { dark: '#4a2c22', mid: '#6e4231', light: '#93603f', edge: '#b07a4e' };
const BRASS = { dark: '#9a6a1e', mid: '#d6a23d', light: '#f6d77a' };
const SILVER = { dark: '#7c8796', mid: '#c4ccd6', light: '#f1f5fa' };

export function makeCanvas(w, h) {
  if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  return new OffscreenCanvas(w, h);
}

// ---------- little helpers ----------
function line(c, lw = LW) { c.lineWidth = lw; c.lineJoin = 'round'; c.lineCap = 'round'; c.strokeStyle = INK; c.stroke(); }
function fill(c, f, lw = LW) { c.fillStyle = f; c.fill(); if (lw) line(c, lw); }
function rr(c, x, y, w, h, r) { c.beginPath(); c.roundRect(x, y, w, h, r); }
function ell(c, x, y, rx, ry, rot = 0) { c.beginPath(); c.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot, 0, Math.PI * 2); }
function shine(c, x, y, rx, ry, a = 0.6, rot = -0.5) { c.save(); ell(c, x, y, rx, ry, rot); c.fillStyle = `rgba(255,255,255,${a})`; c.fill(); c.restore(); }
function star4(c, x, y, r, f = '#ffe58a') {
  c.beginPath();
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 - Math.PI / 2, rad = i % 2 ? r * 0.32 : r; c.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad); }
  c.closePath(); c.fillStyle = f; c.fill();
}
function star5(c, x, y, r, f) {
  c.beginPath();
  for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, rad = i % 2 ? r * 0.45 : r; c.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad); }
  c.closePath(); c.fillStyle = f; c.fill();
}
function lin(c, x0, y0, x1, y1, stops) {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s));
  return g;
}
// Liquid in a glass: fill the path with liquid below `level`, then the glass over it.
function glassWith(c, path, level, col, deep) {
  path(); c.save(); c.clip();
  c.fillStyle = 'rgba(220,235,255,0.28)'; c.fillRect(-60, -120, 120, 130);
  c.fillStyle = lin(c, 0, level, 0, 0, [col, deep]); c.fillRect(-60, level, 120, 140);
  c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(-60, level - 1, 120, 3);
  c.restore();
  path(); line(c);
}
function cork(c, x, y, w, h) { rr(c, x, y, w, h, 2); fill(c, '#b98457'); c.fillStyle = 'rgba(0,0,0,0.15)'; c.fillRect(x + 1, y + h * 0.55, w - 2, h * 0.4); }

// ---------- the things ----------
const DRAW = {
  'potion-red'(c) {
    const p = () => { c.beginPath(); c.moveTo(-6, -48); c.lineTo(-6, -40); c.arc(0, -21, 20, -Math.PI / 2 - 0.3, Math.PI * 1.5 + 0.3); c.lineTo(6, -48); c.closePath(); };
    glassWith(c, p, -30, '#ef4b5c', '#9c1b36'); cork(c, -8, -57, 16, 10); shine(c, -9, -28, 4, 8);
    c.beginPath(); c.moveTo(-6, -46); c.lineTo(6, -46); line(c, 1.6);
  },
  'potion-blue'(c) {
    const p = () => { c.beginPath(); c.moveTo(-5, -64); c.lineTo(-5, -54); c.quadraticCurveTo(-14, -50, -14, -42); c.lineTo(-14, -6); c.quadraticCurveTo(-14, 0, -8, 0); c.lineTo(8, 0); c.quadraticCurveTo(14, 0, 14, -6); c.lineTo(14, -42); c.quadraticCurveTo(14, -50, 5, -54); c.lineTo(5, -64); c.closePath(); };
    glassWith(c, p, -40, '#4fb8f0', '#1d4f9e'); cork(c, -7, -73, 14, 10); shine(c, -8, -24, 3, 12, 0.55, 0);
    c.fillStyle = '#f4ead2'; rr(c, -10, -30, 20, 14, 2); fill(c, '#f4ead2', 1.6); c.fillStyle = '#1d4f9e'; star5(c, 0, -23, 4.5, '#1d4f9e');
  },
  'potion-green'(c) {
    const p = () => { c.beginPath(); c.moveTo(-6, -54); c.lineTo(-6, -38); c.lineTo(-21, -5); c.quadraticCurveTo(-23, 0, -17, 0); c.lineTo(17, 0); c.quadraticCurveTo(23, 0, 21, -5); c.lineTo(6, -38); c.lineTo(6, -54); c.closePath(); };
    glassWith(c, p, -26, '#8ef05b', '#2f8f3a'); shine(c, -9, -14, 3, 7, 0.5, 0.4);
    ell(c, 0, -56, 8, 3.5); fill(c, '#b5f58f', 1.6);
    for (const [x, y, r] of [[-3, -60, 4], [3, -62, 3.2], [0, -64, 2.4]]) { ell(c, x, y, r, r); fill(c, '#c9fba8', 1.4); }
  },
  'potion-purple'(c) {
    const p = () => { c.beginPath(); c.moveTo(-5, -44); c.lineTo(-5, -38); c.bezierCurveTo(-30, -48, -26, -10, 0, 0); c.bezierCurveTo(26, -10, 30, -48, 5, -38); c.lineTo(5, -44); c.closePath(); };
    glassWith(c, p, -24, '#c27cf0', '#6a2a9c'); cork(c, -6, -53, 12, 10); shine(c, -10, -28, 3.5, 6, 0.55, -0.6);
  },
  'potion-gold'(c) {
    const p = () => { c.beginPath(); c.moveTo(-4, -40); c.lineTo(-4, -29); c.bezierCurveTo(-16, -26, -14, 0, 0, 0); c.bezierCurveTo(14, 0, 16, -26, 4, -29); c.lineTo(4, -40); c.closePath(); };
    glassWith(c, p, -17, '#ffd84f', '#d18a16'); cork(c, -5, -48, 10, 9); shine(c, -5, -14, 2.5, 5, 0.6, 0);
  },

  'book-red'(c, w, h) { book(c, w, h, '#c8323f', '#8e1d2a', () => { ell(c, 3, -h / 2, 9, 9); fill(c, BRASS.mid, 1.6); star5(c, 3, -h / 2, 6, '#fff3c4'); rr(c, w / 2 - 4, -h / 2 - 6, 7, 12, 2); fill(c, BRASS.mid, 1.6); }); },
  'book-green'(c, w, h) { book(c, w, h, '#4f9a4c', '#2e6532', () => { c.beginPath(); c.moveTo(3, -h / 2 + 12); c.bezierCurveTo(-10, -h / 2, -2, -h / 2 - 14, 12, -h / 2 - 13); c.bezierCurveTo(12, -h / 2, 8, -h / 2 + 8, 3, -h / 2 + 12); fill(c, '#bfe58a', 1.6); }); },
  'book-blue'(c, w, h) { book(c, w, h, '#3d5fb4', '#243a7a', () => { c.beginPath(); c.arc(3, -h / 2, 9, 0.6, Math.PI * 2 - 0.6); c.arc(7, -h / 2 - 2, 7, Math.PI * 2 - 0.9, 0.9, true); c.closePath(); fill(c, '#f6e27a', 1.4); }); },
  scroll(c) {
    rr(c, -24, -26, 48, 19, 9); fill(c, '#f2e2bb');
    c.fillStyle = 'rgba(160,110,60,0.18)'; c.fillRect(-22, -14, 44, 5);
    ell(c, -24, -16.5, 5, 9.5); fill(c, '#e3cb98'); ell(c, -24, -16.5, 2, 4); fill(c, '#c8a46a', 1.2);
    ell(c, 24, -16.5, 5, 9.5); fill(c, '#e3cb98');
    rr(c, -4, -28, 8, 23, 2); fill(c, '#d93a4a', 1.8);
    c.beginPath(); c.moveTo(-1, -8); c.lineTo(-7, 0); c.lineTo(-2, -1); c.moveTo(1, -8); c.lineTo(7, 0); c.lineTo(2, -1); line(c, 2.6); c.strokeStyle = '#d93a4a'; c.lineWidth = 1.4; c.stroke();
  },
  map(c) {
    const xs = [-23, -8, 8, 23];
    for (let i = 0; i < 3; i++) {
      c.beginPath(); c.moveTo(xs[i], -36 + (i % 2) * 3); c.lineTo(xs[i + 1], -36 + ((i + 1) % 2) * 3); c.lineTo(xs[i + 1], -2 - ((i + 1) % 2) * 3); c.lineTo(xs[i], -2 - (i % 2) * 3); c.closePath();
      fill(c, i % 2 ? '#e8d3a2' : '#f4e4bd');
    }
    c.save(); c.setLineDash([2.5, 3]); c.beginPath(); c.moveTo(-17, -10); c.bezierCurveTo(-8, -32, 2, -6, 12, -24); c.strokeStyle = '#b5383e'; c.lineWidth = 1.8; c.stroke(); c.restore();
    c.beginPath(); c.moveTo(10, -29); c.lineTo(17, -21); c.moveTo(17, -29); c.lineTo(10, -21); c.strokeStyle = '#b5383e'; c.lineWidth = 2.6; c.stroke();
    ell(c, -15, -27, 5, 3.5); c.fillStyle = 'rgba(80,150,90,0.6)'; c.fill();
  },

  crystal(c) {
    ell(c, 0, -5, 22, 6); fill(c, '#7d7488');
    const prism = (x, y, w, h, tilt, col, lite) => {
      c.save(); c.translate(x, y); c.rotate(tilt);
      c.beginPath(); c.moveTo(-w / 2, 0); c.lineTo(-w / 2, -h); c.lineTo(0, -h - w * 0.9); c.lineTo(w / 2, -h); c.lineTo(w / 2, 0); c.closePath(); fill(c, col);
      c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -h); c.lineTo(-w / 2, -h); c.lineTo(-w / 2, 0); c.closePath(); c.fillStyle = lite; c.fill();
      c.beginPath(); c.moveTo(0, -h); c.lineTo(0, -h - w * 0.9); c.moveTo(0, 0); c.lineTo(0, -h); line(c, 1.3);
      c.restore();
    };
    prism(-12, -6, 13, 22, -0.45, '#8a52c9', '#b98af0');
    prism(13, -6, 12, 18, 0.5, '#8a52c9', '#b98af0');
    prism(0, -6, 17, 34, 0.02, '#9d62e0', '#cfa6ff');
    star4(c, -4, -38, 5, '#fff');
  },
  gem(c) {
    c.beginPath(); c.moveTo(-15, -17); c.lineTo(-8, -25); c.lineTo(8, -25); c.lineTo(15, -17); c.lineTo(0, -1); c.closePath(); fill(c, '#2fb36b');
    c.beginPath(); c.moveTo(-15, -17); c.lineTo(15, -17); c.moveTo(-8, -25); c.lineTo(-4, -17); c.lineTo(0, -1); c.lineTo(4, -17); c.lineTo(8, -25); line(c, 1.2);
    c.beginPath(); c.moveTo(-8, -25); c.lineTo(-4, -17); c.lineTo(4, -17); c.lineTo(8, -25); c.closePath(); c.fillStyle = 'rgba(200,255,220,0.55)'; c.fill();
    star4(c, -7, -21, 4, '#fff');
  },
  ring(c) {
    c.beginPath(); c.ellipse(0, -9, 13, 8, 0, 0, Math.PI * 2); c.ellipse(0, -9.5, 8.5, 4.3, 0, 0, Math.PI * 2, true);
    c.fillStyle = lin(c, -13, -17, 13, -1, [BRASS.light, BRASS.mid, BRASS.dark]); c.fill('evenodd'); line(c, 1.8);
    ell(c, 0, -9.5, 8.5, 4.3); line(c, 1.4);
    c.beginPath(); c.moveTo(-5, -15); c.lineTo(0, -21); c.lineTo(5, -15); c.closePath(); fill(c, '#e8445a', 1.4);
    shine(c, -8, -12, 2.5, 1.5, 0.8, 0.6); star4(c, 7, -15, 4.5, '#fffbe0');
  },
  coins(c) {
    const coin = (x, y) => { ell(c, x, y + 2, 10, 4); fill(c, BRASS.dark, 1.4); ell(c, x, y, 10, 4); fill(c, BRASS.mid, 1.4); ell(c, x, y, 5, 1.8); c.strokeStyle = BRASS.dark; c.lineWidth = 1; c.stroke(); };
    coin(-12, -5); coin(10, -5); coin(-1, -4);
    for (let i = 0; i < 4; i++) coin(3, -9 - i * 3.5);
    coin(-11, -10);
    star4(c, 8, -22, 4.5, '#fffbe0');
  },
  bell(c) {
    ell(c, 0, -38, 4, 4); fill(c, BRASS.mid, 1.6);
    c.beginPath(); c.moveTo(-4, -34); c.bezierCurveTo(-13, -34, -13, -18, -15, -11); c.quadraticCurveTo(-19, -6, -18, -5); c.lineTo(18, -5); c.quadraticCurveTo(19, -6, 15, -11); c.bezierCurveTo(13, -18, 13, -34, 4, -34); c.closePath();
    c.fillStyle = lin(c, -16, 0, 16, 0, [BRASS.light, BRASS.mid, BRASS.dark]); c.fill(); line(c);
    ell(c, 0, -5, 18, 3.5); fill(c, BRASS.dark, 1.6); ell(c, 0, -2, 4, 4); fill(c, BRASS.dark, 1.6);
    shine(c, -7, -24, 2.5, 7, 0.6, 0.2);
  },
  'key-silver'(c) { key(c, SILVER, 1); },
  'key-brass'(c) { key(c, BRASS, 1.25); },

  mushroom(c) {
    c.beginPath(); c.moveTo(-7, 0); c.quadraticCurveTo(-9, -14, -6, -24); c.lineTo(6, -24); c.quadraticCurveTo(9, -14, 7, 0); c.closePath(); fill(c, '#f6ecd6');
    c.beginPath(); c.moveTo(-20, -22); c.bezierCurveTo(-20, -48, 20, -48, 20, -22); c.quadraticCurveTo(0, -17, -20, -22); fill(c, '#e3413e');
    for (const [x, y, r] of [[-9, -30, 3.5], [4, -36, 3], [11, -27, 2.6], [-2, -26, 2.2]]) { ell(c, x, y, r, r * 0.8); c.fillStyle = '#fff6e8'; c.fill(); }
    shine(c, -10, -38, 3, 2, 0.4, -0.3);
  },
  mandrake(c) {
    for (const [a, l] of [[-0.9, 22], [-0.35, 28], [0.25, 27], [0.8, 21]]) {
      c.save(); c.translate(0, -44); c.rotate(a);
      c.beginPath(); c.moveTo(0, 0); c.bezierCurveTo(-8, -l * 0.5, -3, -l, 0, -l); c.bezierCurveTo(3, -l, 8, -l * 0.5, 0, 0); fill(c, '#5aa64a', 1.6);
      c.beginPath(); c.moveTo(0, -2); c.lineTo(0, -l + 4); line(c, 1); c.restore();
    }
    ell(c, 0, -38, 13, 11); fill(c, '#e6c59a');
    c.beginPath(); c.moveTo(-8, -43); c.lineTo(-3, -41); c.moveTo(8, -43); c.lineTo(3, -41); line(c, 1.6);
    ell(c, -5, -38, 1.6, 1.6); c.fillStyle = INK; c.fill(); ell(c, 5, -38, 1.6, 1.6); c.fill();
    c.beginPath(); c.arc(0, -30, 4, Math.PI * 1.15, Math.PI * 1.85); line(c, 1.6);
    c.beginPath(); c.moveTo(-20, -34); c.lineTo(20, -34); c.lineTo(15, 0); c.lineTo(-15, 0); c.closePath(); fill(c, '#d07a4a');
    rr(c, -22, -36, 44, 8, 2); fill(c, '#e08e5c');
    c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(-17, -10, 33, 4);
  },
  frog(c) {
    ell(c, 0, -12, 18, 12); fill(c, '#62b84a');
    ell(c, 0, -9, 10, 7); c.fillStyle = '#c9ec8f'; c.fill();
    for (const s of [-1, 1]) {
      ell(c, s * 9, -24, 6.5, 6.5); fill(c, '#62b84a');
      ell(c, s * 9, -24, 3.6, 3.6); fill(c, '#fff', 1.2);
      ell(c, s * 9.6, -24, 1.8, 2.2); c.fillStyle = INK; c.fill();
      ell(c, s * 16, -2, 6, 3); fill(c, '#55a540', 1.6);
    }
    c.beginPath(); c.moveTo(-8, -14); c.quadraticCurveTo(0, -9, 8, -14); line(c, 1.6);
    ell(c, -11, -14, 2.4, 1.4); c.fillStyle = 'rgba(255,120,140,0.6)'; c.fill(); ell(c, 11, -14, 2.4, 1.4); c.fill();
  },
  egg(c) {
    c.beginPath(); c.moveTo(0, -43); c.bezierCurveTo(16, -43, 18, -10, 15, -6); c.quadraticCurveTo(0, 6, -15, -6); c.bezierCurveTo(-18, -10, -16, -43, 0, -43);
    c.fillStyle = lin(c, -14, -40, 14, 0, ['#9fe0d0', '#48a89a']); c.fill(); line(c);
    for (const [x, y, r] of [[-6, -30, 2.4], [5, -34, 1.8], [7, -20, 2.8], [-8, -14, 2], [1, -10, 2.2], [-2, -22, 1.6], [10, -10, 1.4]]) { ell(c, x, y, r, r); c.fillStyle = '#2f6f66'; c.fill(); }
    shine(c, -7, -32, 3, 6, 0.45, 0.2);
  },
  pumpkin(c) {
    for (const [x, rx, col] of [[-12, 13, '#e07a22'], [12, 13, '#e07a22'], [0, 14, '#f29233']]) { ell(c, x, -18, rx, 17); fill(c, col); }
    c.beginPath(); c.moveTo(-1, -34); c.quadraticCurveTo(0, -40, 4, -41); line(c, 5); c.beginPath(); c.moveTo(-1, -34); c.quadraticCurveTo(0, -40, 4, -41); c.strokeStyle = '#7b6a2a'; c.lineWidth = 2.8; c.stroke();
    c.beginPath(); c.moveTo(3, -38); c.bezierCurveTo(12, -44, 16, -34, 10, -34); c.strokeStyle = '#4f8a35'; c.lineWidth = 1.6; c.stroke();
    shine(c, -3, -26, 2.5, 6, 0.35, 0);
  },

  hourglass(c) {
    c.beginPath(); c.moveTo(-12, -55); c.bezierCurveTo(-12, -38, -3, -36, -2, -31); c.bezierCurveTo(-3, -26, -12, -24, -12, -7); c.lineTo(12, -7); c.bezierCurveTo(12, -24, 3, -26, 2, -31); c.bezierCurveTo(3, -36, 12, -38, 12, -55); c.closePath();
    c.fillStyle = 'rgba(210,235,255,0.35)'; c.fill();
    c.save(); c.clip();
    c.fillStyle = '#e6b45a'; c.beginPath(); c.moveTo(-12, -7); c.quadraticCurveTo(0, -24, 12, -7); c.fill();
    c.beginPath(); c.moveTo(-8, -44); c.quadraticCurveTo(0, -39, 8, -44); c.lineTo(2, -32); c.lineTo(-2, -32); c.fill();
    c.fillRect(-0.7, -32, 1.4, 22); c.restore();
    line(c, 1.8);
    for (const y of [-62, -7]) { rr(c, -18, y, 36, 7, 2); fill(c, WOOD.light); }
    for (const x of [-15, 15]) { rr(c, x - 2, -56, 4, 50, 1.5); fill(c, WOOD.mid, 1.6); }
    shine(c, -7, -47, 1.6, 4, 0.55, 0.3);
  },
  watch(c) {
    c.beginPath(); c.arc(0, -40, 4, 0, Math.PI * 2); line(c, 2.6); c.strokeStyle = BRASS.mid; c.lineWidth = 1.4; c.stroke();
    rr(c, -3, -38, 6, 5, 1.5); fill(c, BRASS.mid, 1.6);
    ell(c, 0, -17, 17, 17); c.fillStyle = lin(c, -17, -34, 17, 0, [BRASS.light, BRASS.mid, BRASS.dark]); c.fill(); line(c);
    ell(c, 0, -17, 12.5, 12.5); fill(c, '#fbf4e2', 1.6);
    for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; c.beginPath(); c.moveTo(Math.cos(a) * 10, -17 + Math.sin(a) * 10); c.lineTo(Math.cos(a) * 11.6, -17 + Math.sin(a) * 11.6); line(c, i % 3 ? 0.9 : 1.6); }
    c.beginPath(); c.moveTo(0, -17); c.lineTo(5, -21); c.moveTo(0, -17); c.lineTo(0, -26); line(c, 1.6);
    ell(c, 0, -17, 1.4, 1.4); c.fillStyle = INK; c.fill();
    shine(c, -8, -26, 3, 1.6, 0.5, -0.7);
  },
  candle(c) {
    ell(c, 0, -4, 13, 4.5); fill(c, BRASS.mid);
    c.beginPath(); c.arc(14, -6, 4, -1.6, 1.6); line(c, 2.6); c.strokeStyle = BRASS.mid; c.lineWidth = 1.2; c.stroke();
    c.beginPath(); c.moveTo(-7, -6); c.lineTo(-7, -42); c.quadraticCurveTo(0, -45, 7, -42); c.lineTo(7, -6); c.closePath(); fill(c, '#fbf1d9');
    c.beginPath(); c.moveTo(-7, -42); c.quadraticCurveTo(-8, -33, -5, -31); c.quadraticCurveTo(-3, -36, -1, -42); c.fillStyle = '#fbf1d9'; c.fill(); line(c, 1.4);
    c.beginPath(); c.moveTo(0, -43); c.lineTo(0, -47); line(c, 1.6);
    c.fillStyle = 'rgba(220,180,120,0.35)'; c.fillRect(2, -40, 4, 33);
  },
  moonjar(c) {
    rr(c, -17, -42, 34, 42, 8); c.fillStyle = lin(c, 0, -42, 0, 0, ['#273a7a', '#4a5fb0']); c.fill();
    c.beginPath(); c.arc(-2, -22, 9, 0.7, Math.PI * 2 - 0.7); c.arc(3, -24, 7.5, Math.PI * 2 - 1, 1, true); c.closePath(); c.fillStyle = '#fff3c0'; c.fill();
    for (const [x, y] of [[9, -33], [-9, -9], [10, -12], [-11, -32]]) star4(c, x, y, 3, '#fff7d6');
    rr(c, -17, -42, 34, 42, 8); line(c);
    rr(c, -14, -50, 28, 9, 3); fill(c, '#c9a98a');
    c.beginPath(); c.moveTo(-15, -45); c.lineTo(15, -45); line(c, 2.6); c.strokeStyle = '#c4413c'; c.lineWidth = 1.4; c.stroke();
    shine(c, -11, -30, 2.4, 7, 0.4, 0);
  },
  lantern(c) {
    c.beginPath(); c.arc(0, -58, 6, Math.PI, 0); line(c, 2.4);
    c.beginPath(); c.moveTo(-14, -46); c.lineTo(0, -56); c.lineTo(14, -46); c.closePath(); fill(c, '#3b3a46');
    rr(c, -13, -46, 26, 38, 2); c.fillStyle = 'rgba(255,214,120,0.55)'; c.fill(); line(c);
    for (const x of [-4.5, 4.5]) { c.beginPath(); c.moveTo(x, -46); c.lineTo(x, -8); line(c, 2); }
    rr(c, -16, -9, 32, 9, 2); fill(c, '#3b3a46');
  },

  orb(c) {
    c.beginPath(); c.moveTo(-15, 0); c.lineTo(-10, -12); c.lineTo(10, -12); c.lineTo(15, 0); c.closePath(); fill(c, BRASS.dark);
    ell(c, 0, -12, 11, 3); fill(c, BRASS.mid, 1.6);
    ell(c, 0, -31, 20, 20);
    const g = c.createRadialGradient(-6, -38, 2, 0, -31, 21); g.addColorStop(0, '#f4ecff'); g.addColorStop(0.5, '#a9b6f2'); g.addColorStop(1, '#6650b8');
    c.fillStyle = g; c.fill(); line(c);
    c.beginPath(); c.arc(2, -29, 9, 0.5, 4.2); c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = 2; c.stroke();
    shine(c, -8, -40, 5, 3, 0.75, -0.6);
  },
  magnifier(c) {
    rr(c, -4, -28, 8, 28, 3); fill(c, WOOD.mid); rr(c, -5, -31, 10, 5, 1.5); fill(c, BRASS.mid, 1.6);
    ell(c, 0, -43, 15, 15); fill(c, BRASS.mid);
    ell(c, 0, -43, 11, 11); c.fillStyle = 'rgba(190,225,255,0.7)'; c.fill(); line(c, 1.4);
    shine(c, -4, -47, 4, 2.4, 0.8, -0.7);
  },
  specs(c) {
    c.beginPath(); c.moveTo(-21, -13); c.lineTo(-23, -18); c.moveTo(21, -13); c.lineTo(23, -18); line(c, 2.4);
    for (const s of [-1, 1]) { ell(c, s * 11.5, -10, 9, 9); c.fillStyle = 'rgba(190,225,255,0.55)'; c.fill(); line(c, 2.6); c.strokeStyle = BRASS.mid; c.lineWidth = 1.2; c.stroke(); shine(c, s * 11.5 - 3, -13, 2.6, 1.6, 0.8, -0.6); }
    c.beginPath(); c.arc(0, -10, 3.5, Math.PI * 1.1, Math.PI * 1.9); line(c, 2.4);
  },
  telescope(c) {
    c.beginPath(); c.moveTo(-33, -11); c.lineTo(-33, -19); c.lineTo(33, -26); c.lineTo(33, -4); c.closePath();
    c.fillStyle = lin(c, 0, -26, 0, -4, [BRASS.light, BRASS.mid, BRASS.dark]); c.fill(); line(c);
    for (const x of [-18, 2, 20]) { const t = (x + 33) / 66, hh = 4 + t * 11; rr(c, x - 3, -15 - hh, 6, hh * 2, 1.5); fill(c, WOOD.mid, 1.6); }
    ell(c, 33, -15, 3, 11); fill(c, '#9fd4ff', 1.8);
    rr(c, -37, -17, 5, 8, 1.5); fill(c, INK, 0);
  },
  compass(c) {
    c.beginPath(); c.arc(0, -33, 3, 0, Math.PI * 2); line(c, 2.2);
    ell(c, 0, -17, 16, 16); fill(c, BRASS.mid); ell(c, 0, -17, 12, 12); fill(c, '#fbf4e2', 1.4);
    c.beginPath(); c.moveTo(0, -27); c.lineTo(3, -17); c.lineTo(0, -7); c.lineTo(-3, -17); c.closePath(); c.fillStyle = '#fff'; c.fill(); line(c, 1.2);
    c.beginPath(); c.moveTo(0, -27); c.lineTo(3, -17); c.lineTo(-3, -17); c.closePath(); c.fillStyle = '#d8323f'; c.fill(); line(c, 1.2);
    c.fillStyle = INK; c.font = 'bold 6px serif'; c.textAlign = 'center'; c.fillText('N', 0, -24.5 - 0.5);
  },

  quill(c) {
    c.beginPath(); c.moveTo(0, 0); c.lineTo(1, -10); c.bezierCurveTo(-11, -26, -9, -60, 4, -72); c.bezierCurveTo(10, -58, 11, -26, 1, -10); c.closePath(); fill(c, '#f7f3ea');
    c.beginPath(); c.moveTo(1, -6); c.quadraticCurveTo(2, -40, 4, -70); line(c, 1.3);
    for (let i = 0; i < 6; i++) { const y = -20 - i * 8; c.beginPath(); c.moveTo(2, y); c.lineTo(-4 - (i % 2), y - 4); c.strokeStyle = 'rgba(120,120,150,0.5)'; c.lineWidth = 1; c.stroke(); }
    c.beginPath(); c.moveTo(-1.5, 0); c.lineTo(1.5, -8); c.lineTo(3, -7); c.closePath(); c.fillStyle = INK; c.fill();
  },
  inkpot(c) {
    c.beginPath(); c.moveTo(-16, -2); c.lineTo(-16, -16); c.quadraticCurveTo(-16, -22, -8, -22); c.lineTo(-7, -26); c.lineTo(7, -26); c.lineTo(8, -22); c.quadraticCurveTo(16, -22, 16, -16); c.lineTo(16, -2); c.quadraticCurveTo(16, 0, 13, 0); c.lineTo(-13, 0); c.quadraticCurveTo(-16, 0, -16, -2); c.closePath();
    fill(c, '#2c2a4a');
    rr(c, -8, -30, 16, 5, 2); fill(c, '#3c3a5e', 1.6);
    rr(c, -10, -15, 20, 9, 1.5); fill(c, '#efe2c2', 1.3); c.fillStyle = INK; c.font = 'bold 6px serif'; c.textAlign = 'center'; c.fillText('INK', 0, -8.6);
    c.beginPath(); c.moveTo(6, -26); c.quadraticCurveTo(9, -22, 7.5, -19); c.fillStyle = '#16142a'; c.fill();
    shine(c, -11, -17, 1.8, 3.5, 0.5, 0);
  },
  scissors(c) {
    c.beginPath(); c.moveTo(-3, -22); c.lineTo(5, -52); c.lineTo(2, -22); c.closePath(); fill(c, SILVER.mid, 1.8);
    c.beginPath(); c.moveTo(3, -22); c.lineTo(-5, -52); c.lineTo(-2, -22); c.closePath(); fill(c, SILVER.light, 1.8);
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * 2, -22); c.lineTo(s * 7, -15); line(c, 3.4); ell(c, s * 7.5, -9, 6, 7); c.lineWidth = 5.4; c.strokeStyle = INK; c.stroke(); c.lineWidth = 3; c.strokeStyle = '#d8434e'; c.stroke(); }
    ell(c, 0, -23, 2, 2); fill(c, SILVER.dark, 1);
  },
  wand(c) {
    c.beginPath(); c.moveTo(-3.5, 0); c.lineTo(-2, -54); c.lineTo(2, -54); c.lineTo(3.5, 0); c.closePath(); fill(c, '#3a2430');
    for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(-3.6, -6 - i * 4); c.lineTo(3.6, -9 - i * 4); c.strokeStyle = BRASS.mid; c.lineWidth = 1.4; c.stroke(); }
    star4(c, 0, -58, 8, '#ffe58a'); star4(c, 0, -58, 3.5, '#fff');
  },
  spoon(c) {
    rr(c, -2.6, -44, 5.2, 44, 2.6); fill(c, WOOD.light);
    ell(c, 0, -54, 8, 12); fill(c, WOOD.edge); ell(c, 0, -55, 5, 8.5); c.fillStyle = 'rgba(80,40,20,0.25)'; c.fill();
  },

  hat(c) {
    c.beginPath(); c.moveTo(-20, -10); c.bezierCurveTo(-14, -30, -6, -50, 6, -60); c.quadraticCurveTo(18, -64, 26, -56); c.quadraticCurveTo(18, -56, 14, -50); c.bezierCurveTo(14, -36, 18, -22, 20, -10); c.closePath(); fill(c, '#4048a8');
    ell(c, 0, -8, 30, 7); fill(c, '#3a3f96');
    c.beginPath(); c.moveTo(-19, -14); c.quadraticCurveTo(0, -8, 19, -14); c.lineTo(19, -19); c.quadraticCurveTo(0, -13, -18, -19); c.closePath(); fill(c, BRASS.mid, 1.6);
    for (const [x, y, r] of [[-3, -32, 4.5], [8, -42, 3.2], [-8, -24, 2.6], [10, -26, 3.6]]) star5(c, x, y, r, '#ffe58a');
    c.beginPath(); c.arc(2, -48, 4, 0.6, Math.PI * 2 - 0.6); c.arc(4.5, -49, 3.4, Math.PI * 2 - 1, 1, true); c.fillStyle = '#ffe58a'; c.fill();
  },
  sock(c) {
    const p = () => { c.beginPath(); c.moveTo(-2, -50); c.lineTo(14, -50); c.lineTo(14, -14); c.quadraticCurveTo(14, 0, 0, 0); c.lineTo(-10, 0); c.quadraticCurveTo(-17, 0, -17, -6); c.quadraticCurveTo(-17, -12, -8, -14); c.lineTo(-2, -18); c.closePath(); };
    p(); c.fillStyle = '#f6efe0'; c.fill(); c.save(); p(); c.clip();
    c.fillStyle = '#e0545a'; for (let y = -48; y < 0; y += 10) c.fillRect(-20, y, 40, 5);
    c.fillStyle = '#6a7fc9'; ell(c, -12, -5, 7, 7); c.fill(); ell(c, 9, -5, 7, 7); c.fill();
    c.restore(); p(); line(c);
    rr(c, -3, -52, 18, 6, 2); fill(c, '#f6efe0', 1.6);
  },
  horseshoe(c) {
    c.beginPath(); c.arc(0, -18, 17, Math.PI * 0.82, Math.PI * 2.18); c.lineTo(10, -3); c.lineTo(10, -3); c.arc(0, -18, 9, Math.PI * 2.18 - 0.08, Math.PI * 0.82 + 0.08, true); c.closePath();
    c.fillStyle = lin(c, 0, -35, 0, 0, ['#c3c6cc', '#7c818c']); c.fill(); line(c);
    for (const a of [1.1, 1.5, 1.9, 2.3].flatMap((k) => [Math.PI * 0.5 + k, Math.PI * 0.5 - k])) { ell(c, Math.cos(a) * 13, -18 - Math.sin(a) * 13, 1.3, 1.3); c.fillStyle = INK; c.fill(); }
  },
  skull(c) {
    c.beginPath(); c.moveTo(-10, -4); c.lineTo(-10, -10); c.bezierCurveTo(-22, -14, -20, -40, 0, -40); c.bezierCurveTo(20, -40, 22, -14, 10, -10); c.lineTo(10, -4); c.quadraticCurveTo(0, 1, -10, -4); fill(c, '#f2ead6');
    for (const s of [-1, 1]) { ell(c, s * 7, -22, 5, 5.5); c.fillStyle = INK; c.fill(); ell(c, s * 7 - 1, -23.5, 1.4, 1.4); c.fillStyle = '#fff'; c.fill(); }
    c.beginPath(); c.moveTo(0, -17); c.lineTo(-2.5, -12.5); c.lineTo(2.5, -12.5); c.closePath(); c.fillStyle = INK; c.fill();
    for (const x of [-5, 0, 5]) { c.beginPath(); c.moveTo(x, -8); c.lineTo(x, -3); line(c, 1.2); }
    shine(c, -8, -33, 4, 2.4, 0.6, -0.5);
  },

  teacup(c) {
    ell(c, 0, -4, 22, 5); fill(c, '#f3eef6');
    c.beginPath(); c.arc(17, -18, 6, -1.4, 1.4); line(c, 5); c.beginPath(); c.arc(17, -18, 6, -1.4, 1.4); c.strokeStyle = '#f3eef6'; c.lineWidth = 2.6; c.stroke();
    c.beginPath(); c.moveTo(-16, -27); c.bezierCurveTo(-16, -10, -10, -7, 0, -7); c.bezierCurveTo(10, -7, 16, -10, 16, -27); c.closePath(); fill(c, '#f3eef6');
    ell(c, 0, -27, 16, 3.6); fill(c, '#9b5a33', 1.8);
    for (const x of [-8, 0, 8]) { ell(c, x, -16, 2.2, 2.2); c.fillStyle = '#e57a9a'; c.fill(); }
  },
  apple(c) {
    c.beginPath(); c.moveTo(0, -27); c.bezierCurveTo(-8, -33, -19, -28, -17, -14); c.bezierCurveTo(-15, -2, -6, 1, 0, -3); c.bezierCurveTo(6, 1, 15, -2, 17, -14); c.bezierCurveTo(19, -28, 8, -33, 0, -27);
    c.fillStyle = lin(c, -15, -30, 15, 0, ['#ff6b5a', '#c91f2e']); c.fill(); line(c);
    c.beginPath(); c.moveTo(0, -27); c.quadraticCurveTo(1, -33, 3, -36); line(c, 2.4);
    c.beginPath(); c.moveTo(2, -32); c.quadraticCurveTo(10, -38, 14, -32); c.quadraticCurveTo(8, -29, 2, -32); fill(c, '#69b845', 1.4);
    shine(c, -9, -20, 3, 5, 0.5, 0.3);
  },
  cheese(c) {
    c.beginPath(); c.moveTo(-21, -2); c.lineTo(-21, -16); c.lineTo(21, -28); c.lineTo(21, -12); c.closePath(); fill(c, '#f7c948');
    c.beginPath(); c.moveTo(-21, -16); c.lineTo(5, -28); c.lineTo(21, -28); c.closePath(); fill(c, '#fde07a');
    c.beginPath(); c.moveTo(21, -28); c.lineTo(21, -12); c.lineTo(21, -12); line(c, 2.4);
    for (const [x, y, r] of [[-12, -9, 3], [0, -15, 2.4], [10, -12, 3.4], [-4, -6, 1.8]]) { ell(c, x, y, r, r * 0.8); c.fillStyle = '#d9a52a'; c.fill(); }
  },
  mortar(c) {
    c.save(); c.translate(6, -20); c.rotate(0.55); rr(c, -4, -30, 8, 32, 4); fill(c, '#a8a09a'); c.restore();
    c.beginPath(); c.moveTo(-22, -24); c.quadraticCurveTo(-22, -4, -12, -2); c.lineTo(-14, 0); c.lineTo(14, 0); c.lineTo(12, -2); c.quadraticCurveTo(22, -4, 22, -24); c.closePath(); fill(c, '#8d8680');
    ell(c, 0, -24, 22, 5); fill(c, '#a59d96'); ell(c, 0, -24, 17, 3.2); fill(c, '#5f7f3e', 1.2);
    c.save(); c.translate(6, -20); c.rotate(0.55); rr(c, -4, -30, 8, 18, 4); fill(c, '#b8b0aa'); c.restore();
    for (const [x, y] of [[-8, -25], [-3, -23.5], [10, -24.5]]) { ell(c, x, y, 2.4, 1.2); c.fillStyle = '#9fd36a'; c.fill(); }
  },
  dice(c) {
    c.beginPath(); c.moveTo(-12, -18); c.lineTo(-5, -25); c.lineTo(13, -25); c.lineTo(6, -18); c.closePath(); fill(c, '#ffffff');
    c.beginPath(); c.moveTo(6, -18); c.lineTo(13, -25); c.lineTo(13, -7); c.lineTo(6, 0); c.closePath(); fill(c, '#d9dbe6');
    rr(c, -12, -18, 18, 18, 2); fill(c, '#f6f6fb');
    const pip = (x, y, r = 1.8) => { ell(c, x, y, r, r); c.fillStyle = INK; c.fill(); };
    pip(-7, -13); pip(-3, -9); pip(1, -5); pip(4, -21.5, 1.6); pip(9.5, -16, 1.4); pip(9.5, -8, 1.4);
  },
  shell(c) {
    ell(c, 2, -13, 15, 13); fill(c, '#d9a066');
    c.beginPath();
    for (let a = 0; a < Math.PI * 5; a += 0.2) { const r = 13 * (1 - a / (Math.PI * 5.4)); c.lineTo(2 + Math.cos(a) * r, -13 + Math.sin(a) * r * 0.95); }
    c.strokeStyle = '#7a4a26'; c.lineWidth = 2.2; c.stroke();
    ell(c, -11, -4, 6, 4, -0.4); fill(c, '#5a3a24', 1.6);
    shine(c, -3, -22, 4, 2, 0.4, -0.3);
  },

  feather(c) {
    c.save(); c.translate(0, -8); c.rotate(-0.08);
    c.beginPath(); c.moveTo(-21, 1); c.bezierCurveTo(-10, -8, 10, -9, 21, -2); c.bezierCurveTo(10, 6, -8, 6, -21, 1); fill(c, '#5d8fe0');
    c.beginPath(); c.moveTo(-14, 1); c.bezierCurveTo(-4, -4, 10, -5, 19, -2); c.bezierCurveTo(10, 2, -4, 3, -14, 1); c.fillStyle = '#9cc3ff'; c.fill();
    c.beginPath(); c.moveTo(-23, 2); c.quadraticCurveTo(0, -1, 21, -2); line(c, 1.4);
    for (const x of [-6, 4, 12]) { c.beginPath(); c.moveTo(x, -1); c.lineTo(x + 3, -5); c.strokeStyle = '#2f5fae'; c.lineWidth = 1; c.stroke(); }
    c.restore();
  },
  acorn(c) {
    c.beginPath(); c.moveTo(-9, -16); c.bezierCurveTo(-10, -4, -4, 0, 0, 0); c.bezierCurveTo(4, 0, 10, -4, 9, -16); c.closePath(); fill(c, '#c98a3c');
    c.beginPath(); c.moveTo(-11, -15); c.bezierCurveTo(-12, -26, 12, -26, 11, -15); c.quadraticCurveTo(0, -12, -11, -15); fill(c, '#7a5230');
    for (const x of [-6, -2, 2, 6]) { c.beginPath(); c.moveTo(x, -22); c.lineTo(x + 2, -15); c.strokeStyle = 'rgba(40,20,10,0.5)'; c.lineWidth = 1; c.stroke(); }
    c.beginPath(); c.moveTo(0, -23); c.quadraticCurveTo(1, -27, 3, -28); line(c, 2.2);
    shine(c, -4, -9, 1.6, 3.5, 0.45, 0.2);
  },
  pinecone(c) {
    ell(c, 0, -17, 12, 17); fill(c, '#7a4e2c');
    for (let row = 0; row < 5; row++) {
      const y = -6 - row * 6.5, n = row % 2 ? 3 : 4, wv = 11 - Math.abs(row - 1.5) * 1.4;
      for (let i = 0; i < n; i++) {
        const x = (i - (n - 1) / 2) * (wv * 2 / n);
        c.beginPath(); c.moveTo(x - 3.4, y - 2); c.quadraticCurveTo(x, y + 4, x + 3.4, y - 2); c.fillStyle = '#a8703f'; c.fill(); line(c, 1.1);
      }
    }
    c.beginPath(); c.moveTo(0, -34); c.lineTo(0, -36); line(c, 2);
  },
  scallop(c) {
    c.beginPath(); c.moveTo(0, -3); c.lineTo(-17, -20); c.quadraticCurveTo(-12, -31, 0, -30); c.quadraticCurveTo(12, -31, 17, -20); c.closePath(); fill(c, '#f6a5a8');
    for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(0, -4); c.lineTo(i * 5, -28 + Math.abs(i) * 1.6); c.strokeStyle = '#d06b78'; c.lineWidth = 1.3; c.stroke(); }
    c.beginPath(); c.moveTo(-6, 0); c.lineTo(-4, -6); c.lineTo(4, -6); c.lineTo(6, 0); c.closePath(); fill(c, '#f6a5a8', 1.6);
    shine(c, -6, -22, 2.4, 4, 0.4, 0.4);
  },
  mouse(c) {
    c.beginPath(); c.moveTo(-14, -6); c.bezierCurveTo(-24, -6, -22, 4, -16, 0); line(c, 2.6); c.beginPath(); c.moveTo(-14, -6); c.bezierCurveTo(-24, -6, -22, 4, -16, 0); c.strokeStyle = '#f0a0b0'; c.lineWidth = 1.4; c.stroke();
    c.beginPath(); c.moveTo(-15, 0); c.bezierCurveTo(-16, -16, 8, -20, 18, -3); c.quadraticCurveTo(19, 0, 15, 0); c.closePath(); fill(c, '#a9a3b4');
    ell(c, 4, -14, 5, 5); fill(c, '#a9a3b4', 1.6); ell(c, 4, -14, 2.6, 2.6); c.fillStyle = '#f0a0b0'; c.fill();
    ell(c, 11, -8, 1.4, 1.4); c.fillStyle = INK; c.fill(); ell(c, 18.5, -3, 1.6, 1.6); c.fillStyle = '#e57a9a'; c.fill();
    c.save(); c.setLineDash([2, 2.4]); c.beginPath(); c.moveTo(-10, -4); c.quadraticCurveTo(-2, -12, 8, -4); c.strokeStyle = '#6c6578'; c.lineWidth = 1; c.stroke(); c.restore();
  },
  yarn(c) {
    c.beginPath(); c.moveTo(10, -3); c.bezierCurveTo(16, 0, 14, 4, 20, 2); line(c, 2.6); c.beginPath(); c.moveTo(10, -3); c.bezierCurveTo(16, 0, 14, 4, 20, 2); c.strokeStyle = '#e66d8e'; c.lineWidth = 1.4; c.stroke();
    ell(c, -1, -15, 14, 14); fill(c, '#e66d8e');
    c.save(); ell(c, -1, -15, 14, 14); c.clip();
    for (let i = 0; i < 5; i++) { c.beginPath(); c.ellipse(-1, -15, 16, 5, 0.6 + i * 0.36, 0, Math.PI * 2); c.strokeStyle = '#b8466a'; c.lineWidth = 1.1; c.stroke(); }
    c.restore();
    shine(c, -6, -21, 3.4, 2, 0.35, -0.5);
  },
  duck(c) {
    c.beginPath(); c.moveTo(-15, -10); c.quadraticCurveTo(-16, 0, -4, 0); c.lineTo(8, 0); c.quadraticCurveTo(16, 0, 15, -9); c.quadraticCurveTo(8, -6, 4, -9); c.lineTo(-11, -12); c.quadraticCurveTo(-16, -16, -15, -10); fill(c, '#ffd23f');
    ell(c, 5, -18, 8, 8); fill(c, '#ffd23f');
    c.beginPath(); c.moveTo(11, -18); c.quadraticCurveTo(18, -18, 17, -14); c.quadraticCurveTo(13, -13, 11, -15); fill(c, '#f08a24', 1.6);
    ell(c, 6, -20, 1.5, 1.7); c.fillStyle = INK; c.fill();
    c.beginPath(); c.moveTo(-6, -7); c.quadraticCurveTo(0, -3, 4, -8); line(c, 1.3);
    shine(c, 1, -22, 2.4, 1.5, 0.6, -0.4);
  },

  // ---- more potions and books ----
  'potion-black'(c) {
    const p = () => { c.beginPath(); c.moveTo(-5, -50); c.lineTo(-5, -44); c.quadraticCurveTo(-15, -42, -15, -34); c.lineTo(-15, -5); c.quadraticCurveTo(-15, 0, -10, 0); c.lineTo(10, 0); c.quadraticCurveTo(15, 0, 15, -5); c.lineTo(15, -34); c.quadraticCurveTo(15, -42, 5, -44); c.lineTo(5, -50); c.closePath(); };
    glassWith(c, p, -36, '#4a3a5e', '#1a1424'); cork(c, -6, -56, 12, 8);
    rr(c, -10, -29, 20, 18, 2); fill(c, '#efe4c6', 1.4);
    ell(c, 0, -22, 5, 4.6); c.fillStyle = INK; c.fill(); rr(c, -3, -19, 6, 4, 1); c.fill();
    ell(c, -2, -22.5, 1.3, 1.3); c.fillStyle = '#efe4c6'; c.fill(); ell(c, 2, -22.5, 1.3, 1.3); c.fill();
    shine(c, -10, -36, 2, 4, 0.4, 0);
  },
  'potion-pink'(c) { tallBottle(c, 12, 60, '#ff8fc8', '#c2408a'); },
  'potion-teal'(c) {
    const p = () => { c.beginPath(); c.moveTo(-5, -42); c.lineTo(-5, -36); c.arc(0, -18, 18, -Math.PI / 2 - 0.28, Math.PI * 1.5 + 0.28); c.lineTo(5, -42); c.closePath(); };
    glassWith(c, p, -24, '#4fe0c8', '#16827a'); cork(c, -7, -50, 14, 9); shine(c, -8, -24, 3.4, 7);
  },
  'book-purple'(c, w, h) { book(c, w, h, '#7d4bb0', '#55307f', () => { star5(c, 3, -h / 2, 8, '#f6e27a'); }); },
  'book-open'(c) {
    rr(c, -30, -7, 60, 7, 2); fill(c, '#7a3a2e');
    for (const s of [-1, 1]) {
      c.beginPath(); c.moveTo(0, -5); c.lineTo(s * 28, -7); c.lineTo(s * 27, -21); c.quadraticCurveTo(s * 12, -22, 0, -17); c.closePath(); fill(c, '#f6ecd2');
      for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(s * 5, -15 + i * 2.6); c.lineTo(s * 23, -17.4 + i * 2.6); c.strokeStyle = 'rgba(90,60,80,0.45)'; c.lineWidth = 1; c.stroke(); }
    }
    c.beginPath(); c.moveTo(0, -17); c.lineTo(0, -5); line(c, 1.4);
    star4(c, 14, -20, 4, '#ffd86a');
  },
  ship(c) {
    c.beginPath(); c.moveTo(16, -11); c.lineTo(26, -12); c.lineTo(26, -18); c.lineTo(16, -19); c.closePath();
    ell(c, -6, -15, 22, 13);
    c.save(); c.fillStyle = 'rgba(200,230,255,0.3)'; ell(c, -6, -15, 22, 13); c.fill();
    c.fillStyle = 'rgba(70,140,200,0.55)'; c.fillRect(-28, -10, 50, 8);
    c.beginPath(); c.moveTo(-17, -9); c.lineTo(3, -9); c.lineTo(-1, -5); c.lineTo(-13, -5); c.closePath(); c.fillStyle = '#8a5230'; c.fill();
    c.beginPath(); c.moveTo(-7, -9); c.lineTo(-7, -25); c.strokeStyle = INK; c.lineWidth = 1.2; c.stroke();
    c.beginPath(); c.moveTo(-6, -24); c.lineTo(1, -11); c.lineTo(-6, -11); c.closePath(); c.fillStyle = '#fff'; c.fill();
    c.beginPath(); c.moveTo(-8, -22); c.lineTo(-14, -11); c.lineTo(-8, -11); c.closePath(); c.fill();
    c.restore();
    ell(c, -6, -15, 22, 13); line(c);
    rr(c, 16, -19, 9, 8, 2); fill(c, 'rgba(200,230,255,0.4)', 1.8); cork(c, 25, -18.5, 5, 7);
    shine(c, -16, -22, 5, 2, 0.55, -0.3);
  },

  // ---- more light, more sparkle ----
  candelabra(c) {
    ell(c, 0, -4, 15, 4.5); fill(c, BRASS.mid);
    rr(c, -2.5, -38, 5, 34, 2); fill(c, BRASS.mid, 1.8);
    c.beginPath(); c.moveTo(-20, -40); c.quadraticCurveTo(-20, -26, 0, -26); c.quadraticCurveTo(20, -26, 20, -40); line(c, 4.6); c.beginPath(); c.moveTo(-20, -40); c.quadraticCurveTo(-20, -26, 0, -26); c.quadraticCurveTo(20, -26, 20, -40); c.strokeStyle = BRASS.mid; c.lineWidth = 2.2; c.stroke();
    for (const [x, y] of [[-20, -40], [0, -44], [20, -40]]) {
      ell(c, x, y, 6, 2.2); fill(c, BRASS.mid, 1.6);
      rr(c, x - 3.5, y - 13, 7, 12, 1.5); fill(c, '#fbf1d9', 1.6);
      c.beginPath(); c.moveTo(x, y - 13); c.lineTo(x, y - 16); line(c, 1.4);
    }
  },
  star(c) {
    star5(c, 0, -17, 17, '#ffd84a'); c.beginPath();
    for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, rad = i % 2 ? 7.6 : 17; c.lineTo(Math.cos(a) * rad, -17 + Math.sin(a) * rad); }
    c.closePath(); line(c);
    ell(c, -3.5, -18, 1.4, 1.8); c.fillStyle = INK; c.fill(); ell(c, 3.5, -18, 1.4, 1.8); c.fill();
    c.beginPath(); c.arc(0, -15.5, 2.6, 0.3, Math.PI - 0.3); line(c, 1.3);
    ell(c, -6.5, -14.5, 2, 1.2); c.fillStyle = 'rgba(255,120,120,0.55)'; c.fill(); ell(c, 6.5, -14.5, 2, 1.2); c.fill();
  },
  ruby(c) { cutGem(c, '#e0304a', 'rgba(255,200,210,0.6)', 13, 22); },
  crown(c) {
    c.beginPath(); c.moveTo(-20, -4); c.lineTo(-21, -26); c.lineTo(-11, -16); c.lineTo(0, -30); c.lineTo(11, -16); c.lineTo(21, -26); c.lineTo(20, -4); c.closePath();
    c.fillStyle = lin(c, 0, -30, 0, -4, [BRASS.light, BRASS.mid, BRASS.dark]); c.fill(); line(c);
    rr(c, -21, -11, 42, 8, 2); fill(c, BRASS.mid, 1.6);
    for (const [x, col] of [[-12, '#e0304a'], [0, '#3d7be0'], [12, '#2fb36b']]) { ell(c, x, -7, 2.8, 2.6); fill(c, col, 1.2); }
    for (const [x, y] of [[-21, -27], [0, -31], [21, -27]]) { ell(c, x, y, 2.4, 2.4); fill(c, '#fff3c4', 1.2); }
    star4(c, -6, -20, 4, '#fff');
  },

  // ---- more growing things ----
  'mushroom-blue'(c) { toadstool(c, 0.75, '#4f7fe0'); },
  cactus(c) {
    c.beginPath(); c.moveTo(-6, -16); c.lineTo(-6, -40); c.quadraticCurveTo(0, -48, 6, -40); c.lineTo(6, -16); c.closePath(); fill(c, '#5aa64a');
    c.beginPath(); c.moveTo(-6, -24); c.lineTo(-12, -24); c.quadraticCurveTo(-15, -24, -15, -28); c.lineTo(-15, -33); c.quadraticCurveTo(-12, -37, -9, -33); c.lineTo(-9, -29); c.lineTo(-6, -29); fill(c, '#5aa64a', 1.8);
    c.beginPath(); c.moveTo(6, -28); c.lineTo(11, -28); c.quadraticCurveTo(14, -28, 14, -32); c.lineTo(14, -36); c.quadraticCurveTo(11, -40, 8, -36); c.lineTo(8, -32); c.lineTo(6, -32); fill(c, '#5aa64a', 1.8);
    for (const [x, y] of [[-2, -38], [2, -32], [-2, -26], [2, -21], [-12, -30], [11, -33]]) { c.beginPath(); c.moveTo(x - 1.4, y); c.lineTo(x + 1.4, y); c.strokeStyle = '#e8f0c8'; c.lineWidth = 1; c.stroke(); }
    ell(c, 0, -46, 3, 2.4); fill(c, '#ff7aa8', 1.2);
    c.beginPath(); c.moveTo(-13, -16); c.lineTo(13, -16); c.lineTo(10, 0); c.lineTo(-10, 0); c.closePath(); fill(c, '#d07a4a');
    rr(c, -14, -18, 28, 5, 1.5); fill(c, '#e08e5c', 1.6);
  },
  vase(c) {
    for (const [x, tx, ty, col] of [[-2, -10, -52, '#ff7aa8'], [0, 1, -60, '#ffd84a'], [2, 11, -50, '#a77fe0']]) {
      c.beginPath(); c.moveTo(x, -28); c.quadraticCurveTo(tx * 0.4, (ty - 28) / 2 - 10, tx, ty); c.strokeStyle = '#4f8a35'; c.lineWidth = 2; c.stroke();
      for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; ell(c, tx + Math.cos(a) * 4.2, ty + Math.sin(a) * 4.2, 3.4, 3.4); fill(c, col, 1.1); }
      ell(c, tx, ty, 2.4, 2.4); fill(c, '#fff3c4', 1);
    }
    c.save(); c.translate(-6, -40); c.rotate(-0.6); ell(c, 0, 0, 5, 2.4); fill(c, '#69b845', 1.2); c.restore();
    c.beginPath(); c.moveTo(-5, -30); c.lineTo(-5, -26); c.bezierCurveTo(-15, -22, -14, -2, -8, 0); c.lineTo(8, 0); c.bezierCurveTo(14, -2, 15, -22, 5, -26); c.lineTo(5, -30); c.closePath(); fill(c, '#4f87c9');
    ell(c, 0, -30, 6.5, 2.4); fill(c, '#3d6fae', 1.6);
    c.beginPath(); c.moveTo(-11, -12); c.quadraticCurveTo(0, -8, 11, -12); c.strokeStyle = '#d4e6ff'; c.lineWidth = 1.6; c.stroke();
    shine(c, -7, -18, 2, 4, 0.45, 0.2);
  },
  snail(c) {
    c.beginPath(); c.moveTo(-19, 0); c.quadraticCurveTo(-20, -6, -13, -6); c.lineTo(10, -6); c.quadraticCurveTo(16, -8, 17, -14); c.lineTo(20, -8); c.quadraticCurveTo(21, 0, 14, 0); c.closePath(); fill(c, '#e8cfa0');
    for (const [x, y] of [[15, -14], [19, -13]]) { c.beginPath(); c.moveTo(x - 1, -12); c.lineTo(x + 1, y - 7); line(c, 1.3); ell(c, x + 1, y - 8, 1.6, 1.6); c.fillStyle = INK; c.fill(); }
    c.save(); c.translate(-3, -7); ell(c, 0, -9, 11, 10); fill(c, '#c97a4a');
    c.beginPath(); for (let a = 0; a < Math.PI * 4.6; a += 0.2) { const rr2 = 9 * (1 - a / (Math.PI * 5)); c.lineTo(Math.cos(a) * rr2, -9 + Math.sin(a) * rr2 * 0.95); }
    c.strokeStyle = '#7a3a1e'; c.lineWidth = 1.8; c.stroke(); c.restore();
  },
  spider(c) {
    for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
      const a = -0.9 + i * 0.6;
      c.beginPath(); c.moveTo(s * 4, -9); c.quadraticCurveTo(s * (9 + i), -18 + i * 3, s * (13 + i * 0.5), -1 + (i % 2) * -2); line(c, 1.8);
    }
    ell(c, 0, -10, 7, 6); fill(c, '#2c2a3a'); ell(c, 0, -17, 4.5, 4); fill(c, '#2c2a3a', 1.6);
    ell(c, -1.8, -17.5, 1.5, 1.5); c.fillStyle = '#fff'; c.fill(); ell(c, 1.8, -17.5, 1.5, 1.5); c.fill();
    shine(c, -2, -12, 2, 1.2, 0.35, -0.4);
  },

  // ---- more to eat and drink ----
  cupcake(c) {
    c.beginPath(); c.moveTo(-14, -15); c.lineTo(-10, 0); c.lineTo(10, 0); c.lineTo(14, -15); c.closePath(); fill(c, '#ff9ec4');
    for (const x of [-8, -3, 2, 7]) { c.beginPath(); c.moveTo(x - 1, -14); c.lineTo(x + 0.4, -1); c.strokeStyle = '#d0608e'; c.lineWidth = 1.2; c.stroke(); }
    c.beginPath(); c.moveTo(-15, -14); c.bezierCurveTo(-20, -22, -10, -24, -8, -22); c.bezierCurveTo(-8, -30, 8, -30, 8, -22); c.bezierCurveTo(12, -24, 20, -22, 15, -14); c.closePath(); fill(c, '#fff3e6');
    ell(c, 0, -29, 4, 4); fill(c, '#e0304a', 1.6); c.beginPath(); c.moveTo(0, -33); c.quadraticCurveTo(2, -36, 4, -35); line(c, 1.4);
    for (const [x, y, col] of [[-7, -19, '#5fc0f0'], [5, -21, '#ffd84a'], [-1, -17, '#7fd36a']]) { c.save(); c.translate(x, y); c.rotate(x); c.fillStyle = col; c.fillRect(-2, -0.7, 4, 1.4); c.restore(); }
  },
  bread(c) {
    c.beginPath(); c.moveTo(-24, -2); c.quadraticCurveTo(-26, -20, -12, -24); c.quadraticCurveTo(0, -28, 12, -24); c.quadraticCurveTo(26, -20, 24, -2); c.quadraticCurveTo(0, 2, -24, -2);
    c.fillStyle = lin(c, 0, -26, 0, 0, ['#e8a85a', '#b87430']); c.fill(); line(c);
    for (const x of [-12, 0, 12]) { c.beginPath(); c.moveTo(x - 4, -16); c.quadraticCurveTo(x, -22, x + 5, -19); c.strokeStyle = '#f6d39a'; c.lineWidth = 2.2; c.stroke(); }
  },
  carrot(c) {
    for (const a of [-0.5, 0, 0.5]) { c.save(); c.translate(-15, -9); c.rotate(Math.PI + a); c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(4, -5, 0, -10); c.quadraticCurveTo(-4, -5, 0, 0); fill(c, '#5aa64a', 1.4); c.restore(); }
    c.beginPath(); c.moveTo(-15, -15); c.quadraticCurveTo(10, -12, 23, -8); c.quadraticCurveTo(10, -4, -15, -2); c.quadraticCurveTo(-18, -8, -15, -15); fill(c, '#f08a24');
    for (const x of [-6, 3, 11]) { c.beginPath(); c.moveTo(x, -12.5); c.lineTo(x + 2, -10); line(c, 1); }
  },
  teapot(c) {
    c.beginPath(); c.moveTo(16, -18); c.quadraticCurveTo(22, -18, 27, -30); c.lineTo(23, -32); c.quadraticCurveTo(20, -24, 14, -24); fill(c, '#f3eef6', 1.8);
    c.beginPath(); c.arc(-19, -19, 8, Math.PI * 0.5, Math.PI * 1.5); line(c, 5); c.beginPath(); c.arc(-19, -19, 8, Math.PI * 0.5, Math.PI * 1.5); c.strokeStyle = '#f3eef6'; c.lineWidth = 2.6; c.stroke();
    ell(c, 0, -17, 19, 16); fill(c, '#f3eef6');
    ell(c, 0, -31, 10, 3.4); fill(c, '#e3dceb', 1.6); ell(c, 0, -36, 3, 3); fill(c, '#e57a9a', 1.4);
    for (const [x, y] of [[-8, -16], [0, -12], [8, -17], [-3, -22], [5, -24]]) { ell(c, x, y, 2.4, 2.4); c.fillStyle = '#6aa3e0'; c.fill(); }
    rr(c, -11, -2, 22, 3, 1); fill(c, '#e3dceb', 1.4);
    shine(c, -9, -24, 3, 5, 0.6, 0.3);
  },

  // ---- more tools ----
  hammer(c) {
    rr(c, -28, -12, 44, 7, 3); fill(c, WOOD.light);
    c.beginPath(); c.moveTo(12, -19); c.lineTo(24, -19); c.lineTo(24, -2); c.lineTo(12, -2); c.closePath(); c.fillStyle = lin(c, 12, 0, 24, 0, ['#c3c6cc', '#7c818c']); c.fill(); line(c);
    c.beginPath(); c.moveTo(24, -15); c.quadraticCurveTo(30, -15, 29, -7); c.lineTo(24, -7); line(c, 2); c.fillStyle = '#9aa0aa'; c.fill();
  },
  paintbrush(c) {
    c.beginPath(); c.moveTo(-3, 0); c.lineTo(-2.4, -34); c.lineTo(2.4, -34); c.lineTo(3, 0); c.closePath(); fill(c, '#c4413c');
    rr(c, -3.4, -42, 6.8, 9, 1); fill(c, SILVER.mid, 1.6);
    c.beginPath(); c.moveTo(-3.4, -42); c.quadraticCurveTo(-4, -52, 0, -59); c.quadraticCurveTo(4, -52, 3.4, -42); c.closePath(); fill(c, '#d8b07a', 1.6);
    c.beginPath(); c.moveTo(-2.4, -51); c.quadraticCurveTo(0, -48, 2.4, -51); c.quadraticCurveTo(2, -55, 0, -59); c.quadraticCurveTo(-2, -55, -2.4, -51); c.fillStyle = '#3d7be0'; c.fill();
  },
  duster(c) {
    rr(c, -2.5, -38, 5, 38, 2.4); fill(c, WOOD.mid);
    for (const [a, col] of [[-0.55, '#e0545a'], [-0.25, '#ffd84a'], [0, '#6aa3e0'], [0.25, '#7fd36a'], [0.55, '#c27cf0']]) {
      c.save(); c.translate(0, -38); c.rotate(a);
      c.beginPath(); c.moveTo(0, 0); c.bezierCurveTo(-9, -10, -6, -26, 0, -32); c.bezierCurveTo(6, -26, 9, -10, 0, 0); fill(c, col, 1.4); c.restore();
    }
    rr(c, -4, -42, 8, 6, 2); fill(c, BRASS.mid, 1.4);
  },
  cog(c) { cogShape(c, 0, -17, 16, 12, 9, '#a9aeb8'); ell(c, 0, -17, 4.5, 4.5); fill(c, '#5d6270', 1.6); },
  magnet(c) {
    c.beginPath(); c.arc(0, -19, 15, Math.PI * 0.85, Math.PI * 2.15); c.lineTo(9, -3); c.arc(0, -19, 7, Math.PI * 2.15 - 0.15, Math.PI * 0.85 + 0.15, true); c.closePath();
    c.fillStyle = '#e0404a'; c.fill(); line(c);
    for (const s of [-1, 1]) { rr(c, s * 11 - 4, -6, 8, 6, 1); fill(c, SILVER.light, 1.6); }
    shine(c, -7, -27, 3, 1.6, 0.4, -0.7);
  },
  padlock(c) {
    c.beginPath(); c.arc(0, -22, 9, Math.PI, 0); c.lineTo(9, -18); c.moveTo(-9, -22); c.lineTo(-9, -18); line(c, 5.6); c.beginPath(); c.arc(0, -22, 9, Math.PI, 0); c.lineTo(9, -18); c.moveTo(-9, -22); c.lineTo(-9, -18); c.strokeStyle = SILVER.mid; c.lineWidth = 2.8; c.stroke();
    rr(c, -14, -20, 28, 20, 4); c.fillStyle = lin(c, 0, -20, 0, 0, [BRASS.light, BRASS.mid, BRASS.dark]); c.fill(); line(c);
    ell(c, 0, -12, 3, 3); c.fillStyle = INK; c.fill(); c.fillRect(-1.2, -11, 2.4, 6);
  },
  globe(c) {
    ell(c, 0, -3, 14, 4); fill(c, WOOD.mid); rr(c, -2, -14, 4, 11, 1); fill(c, WOOD.mid, 1.6);
    c.beginPath(); c.arc(0, -34, 20, Math.PI * 0.35, Math.PI * 1.25); line(c, 4); c.beginPath(); c.arc(0, -34, 20, Math.PI * 0.35, Math.PI * 1.25); c.strokeStyle = BRASS.mid; c.lineWidth = 2; c.stroke();
    ell(c, 0, -34, 16, 16); c.fillStyle = '#4f9ae0'; c.fill();
    c.save(); ell(c, 0, -34, 16, 16); c.clip(); c.fillStyle = '#6cc25a';
    c.beginPath(); c.moveTo(-12, -42); c.quadraticCurveTo(-4, -48, 0, -40); c.quadraticCurveTo(-2, -32, -8, -30); c.quadraticCurveTo(-14, -34, -12, -42); c.fill();
    c.beginPath(); c.moveTo(4, -30); c.quadraticCurveTo(12, -34, 14, -26); c.quadraticCurveTo(8, -20, 4, -24); c.fill();
    c.restore(); ell(c, 0, -34, 16, 16); line(c);
    shine(c, -6, -41, 4, 2.4, 0.5, -0.6);
  },
  envelope(c) {
    rr(c, -20, -26, 40, 24, 2); fill(c, '#f6ecd2');
    c.beginPath(); c.moveTo(-20, -26); c.lineTo(0, -12); c.lineTo(20, -26); line(c, 1.6);
    c.beginPath(); c.moveTo(-20, -2); c.lineTo(-6, -15); c.moveTo(20, -2); c.lineTo(6, -15); line(c, 1.1);
    ell(c, 0, -13, 5, 5); fill(c, '#c4313c', 1.6); star5(c, 0, -13, 2.6, '#8e1d2a');
  },

  // ---- more to wear ----
  boot(c) {
    c.beginPath(); c.moveTo(-12, -48); c.lineTo(4, -48); c.lineTo(5, -20); c.quadraticCurveTo(20, -18, 20, -6); c.lineTo(20, -4); c.lineTo(-14, -4); c.lineTo(-13, -30); c.closePath(); fill(c, '#8a5a3a');
    rr(c, -15, -5, 36, 5, 2); fill(c, '#3b2a24', 1.8);
    rr(c, -13, -50, 18, 6, 2); fill(c, '#6e4231', 1.6);
    for (let i = 0; i < 4; i++) { const y = -40 + i * 6; c.beginPath(); c.moveTo(-2, y); c.lineTo(4, y + 3); c.moveTo(4, y); c.lineTo(-2, y + 3); c.strokeStyle = '#f0d27a'; c.lineWidth = 1.2; c.stroke(); }
  },
  glove(c) {
    const fingers = [[-10, -30, 5], [-4, -38, 5.4], [3, -38, 5.4], [9, -32, 5]];
    for (const [x, y, w] of fingers) { rr(c, x - w / 2 - 0.6, y, w + 1.2, 24, w); fill(c, '#5aa64a', 1.8); }
    c.save(); c.translate(-12, -16); c.rotate(-0.8); rr(c, -3, -12, 6.4, 14, 3.2); fill(c, '#5aa64a', 1.8); c.restore();
    rr(c, -13, -20, 26, 14, 4); fill(c, '#5aa64a', 0);
    c.beginPath(); c.moveTo(-13, -20); c.lineTo(-13, -8); c.moveTo(13, -20); c.lineTo(13, -8); line(c, 1.8);
    rr(c, -14, -9, 28, 9, 3); fill(c, '#f6efe0', 1.8);
    c.fillStyle = '#e0545a'; c.fillRect(-13, -6, 26, 2.6);
  },

  // ---- more to play with ----
  teddy(c) {
    for (const s of [-1, 1]) { ell(c, s * 9, -4, 7, 5); fill(c, '#b07a4e'); ell(c, s * 9, -4, 3.6, 2.6); c.fillStyle = '#e6c59a'; c.fill(); }
    ell(c, 0, -15, 13, 12); fill(c, '#b07a4e');
    ell(c, 0, -13, 7, 7); c.fillStyle = '#d9a774'; c.fill();
    for (const s of [-1, 1]) { ell(c, s * 13, -17, 4.4, 7, s * -0.5); fill(c, '#b07a4e', 1.8); }
    for (const s of [-1, 1]) { ell(c, s * 9, -40, 4.4, 4.4); fill(c, '#b07a4e', 1.8); ell(c, s * 9, -40, 2.2, 2.2); c.fillStyle = '#e6c59a'; c.fill(); }
    ell(c, 0, -32, 11, 10); fill(c, '#b07a4e');
    ell(c, 0, -28.5, 5.4, 4); fill(c, '#e6c59a', 1.4);
    ell(c, 0, -30, 1.8, 1.3); c.fillStyle = INK; c.fill();
    ell(c, -4.4, -34, 1.5, 1.5); c.fill(); ell(c, 4.4, -34, 1.5, 1.5); c.fill();
    c.beginPath(); c.moveTo(-6, -22); c.quadraticCurveTo(0, -18, 6, -22); c.lineTo(3, -18); c.lineTo(0, -21); c.lineTo(-3, -18); c.closePath(); fill(c, '#e0545a', 1.3);
  },
  top(c) {
    rr(c, -2, -34, 4, 8, 1.5); fill(c, WOOD.mid, 1.6);
    c.beginPath(); c.moveTo(0, 0); c.lineTo(-14, -16); c.quadraticCurveTo(-14, -27, 0, -27); c.quadraticCurveTo(14, -27, 14, -16); c.closePath(); fill(c, '#ffd84a');
    c.save(); c.beginPath(); c.moveTo(0, 0); c.lineTo(-14, -16); c.quadraticCurveTo(-14, -27, 0, -27); c.quadraticCurveTo(14, -27, 14, -16); c.closePath(); c.clip();
    c.fillStyle = '#e0545a'; c.fillRect(-16, -20, 32, 5); c.fillStyle = '#3d7be0'; c.fillRect(-16, -12, 32, 4); c.restore();
    c.beginPath(); c.moveTo(0, 0); c.lineTo(-14, -16); c.quadraticCurveTo(-14, -27, 0, -27); c.quadraticCurveTo(14, -27, 14, -16); c.closePath(); line(c);
    shine(c, -6, -22, 2.6, 1.6, 0.5, -0.4);
  },
  ball(c) {
    ell(c, 0, -15, 14, 14); fill(c, '#e0404a');
    c.save(); ell(c, 0, -15, 14, 14); c.clip(); c.beginPath(); c.ellipse(0, -15, 16, 4, -0.4, 0, Math.PI * 2); c.fillStyle = '#fff3e6'; c.fill(); c.restore();
    ell(c, 0, -15, 14, 14); line(c);
    shine(c, -5, -21, 3.6, 2.2, 0.6, -0.5);
  },
  flute(c) {
    rr(c, -32, -10, 64, 7, 3.5); fill(c, '#c98a4c');
    for (const x of [-20, -2, 6, 14, 22]) { ell(c, x, -6.5, 1.5, 1.5); c.fillStyle = INK; c.fill(); }
    for (const x of [-28, 28]) { c.beginPath(); c.moveTo(x, -10); c.lineTo(x, -3); line(c, 1.6); }
  },
  drum(c) {
    rr(c, -18, -26, 36, 23, 3); fill(c, '#d8434e');
    c.beginPath(); for (let i = 0; i <= 6; i++) c.lineTo(-18 + i * 6, i % 2 ? -6 : -24); c.strokeStyle = '#f6e8c8'; c.lineWidth = 1.4; c.stroke();
    ell(c, 0, -26, 18, 5); fill(c, '#f6ecd2');
    rr(c, -19, -6, 38, 4, 1.5); fill(c, '#f6e8c8', 1.6);
    for (const s of [-1, 1]) { c.save(); c.translate(s * 6, -30); c.rotate(s * 0.6); rr(c, -1.5, -14, 3, 14, 1.5); fill(c, WOOD.light, 1.4); ell(c, 0, -14, 2.6, 2.6); fill(c, WOOD.edge, 1.2); c.restore(); }
  },
  cards(c) {
    c.save(); c.translate(-4, -2); c.rotate(-0.25); rr(c, -9, -22, 18, 24, 2); fill(c, '#3d5fb4', 1.6); rr(c, -6, -19, 12, 18, 1); c.strokeStyle = '#f6e27a'; c.lineWidth = 1; c.stroke(); c.restore();
    c.save(); c.translate(5, -1); c.rotate(0.15); rr(c, -9, -24, 18, 24, 2); fill(c, '#fffaf0', 1.6);
    c.fillStyle = '#d8323f'; c.font = 'bold 7px serif'; c.textAlign = 'left'; c.fillText('K', -7, -16);
    c.beginPath(); c.moveTo(0, -6); c.bezierCurveTo(-7, -11, -4, -17, 0, -13); c.bezierCurveTo(4, -17, 7, -11, 0, -6); c.fill(); c.restore();
  },
  knight(c) {
    rr(c, -12, -7, 24, 7, 2); fill(c, '#3a2f3e'); ell(c, 0, -8, 9, 3); fill(c, '#3a2f3e', 1.6);
    c.beginPath(); c.moveTo(-8, -9); c.lineTo(-6, -24); c.quadraticCurveTo(-6, -36, 2, -39); c.lineTo(4, -36); c.quadraticCurveTo(10, -33, 11, -24); c.lineTo(7, -22); c.lineTo(2, -25); c.quadraticCurveTo(4, -16, 8, -9); c.closePath(); fill(c, '#3a2f3e');
    ell(c, 3, -31, 1.4, 1.4); c.fillStyle = '#f0d27a'; c.fill();
    c.beginPath(); c.moveTo(-5, -30); c.quadraticCurveTo(-3, -24, -6, -16); c.strokeStyle = '#6a5a70'; c.lineWidth = 1.4; c.stroke();
  },

  // ---- jars ----
  'jar-eyes'(c, w, h) { jar(c, w, h, 'rgba(200,240,190,0.55)', () => { for (const [x, y, r] of [[-7, -10, 5], [5, -9, 5.4], [-2, -20, 5], [8, -22, 4.4], [-9, -26, 4]]) { ell(c, x, y, r, r); fill(c, '#fbf6ee', 1.2); ell(c, x + 1, y, r * 0.5, r * 0.5); c.fillStyle = '#3d7be0'; c.fill(); ell(c, x + 1.2, y, r * 0.22, r * 0.22); c.fillStyle = INK; c.fill(); } }); },
  'jar-honey'(c, w, h) {
    jar(c, w, h, '#f2a92a', () => { c.fillStyle = 'rgba(255,230,150,0.4)'; c.fillRect(-14, -30, 6, 26); });
    c.beginPath(); c.moveTo(-8, -h + 8); c.quadraticCurveTo(-9, -h + 16, -6, -h + 18); c.quadraticCurveTo(-3, -h + 16, -4, -h + 8); c.fillStyle = '#f2a92a'; c.fill(); line(c, 1.2);
    rr(c, -9, -24, 18, 11, 2); fill(c, '#fff3d6', 1.2); c.fillStyle = '#8a5a1e'; c.font = 'bold 6px serif'; c.textAlign = 'center'; c.fillText('HONEY', 0, -16.6);
  },
  'jar-fireflies'(c, w, h) { jar(c, w, h, 'rgba(30,40,80,0.75)', () => { for (const [x, y] of [[-6, -12], [6, -18], [-3, -28], [7, -30], [0, -8], [-8, -22]]) { ell(c, x, y, 1.8, 1.8); c.fillStyle = '#e8ff8a'; c.fill(); } }); },
  'jar-buttons'(c, w, h) { jar(c, w, h, 'rgba(220,235,255,0.3)', () => { const cols = ['#e0545a', '#3d7be0', '#ffd84a', '#5aa64a', '#c27cf0', '#f08a24']; let i = 0; for (let y = -6; y > -26; y -= 6) for (let x = -10; x <= 10; x += 6.5) { ell(c, x + (i % 2) * 2, y, 3, 3); fill(c, cols[i++ % 6], 1); ell(c, x + (i % 2) * 2 - 0.8, y, 0.6, 0.6); c.fillStyle = INK; c.fill(); } }); },
  'jar-marbles'(c, w, h) { jar(c, w, h, 'rgba(220,235,255,0.3)', () => { const cols = ['#4fb8f0', '#ef4b5c', '#8ef05b', '#ffd84f', '#c27cf0']; let i = 0; for (let y = -5; y > -26; y -= 6) for (let x = -10; x <= 10; x += 6.5) { ell(c, x + (i % 2) * 2, y, 3, 3); fill(c, cols[i++ % 5], 1); shine(c, x + (i % 2) * 2 - 1, y - 1, 1, 0.8, 0.8, 0); } }); },

  // ---- about the house ----
  broom(c) {
    rr(c, -2.5, -90, 5, 66, 2.5); fill(c, WOOD.light);
    c.beginPath(); c.moveTo(-5, -26); c.lineTo(5, -26); c.lineTo(13, 0); c.lineTo(-13, 0); c.closePath(); fill(c, '#d9b46a');
    for (let x = -10; x <= 10; x += 4) { c.beginPath(); c.moveTo(x * 0.4, -24); c.lineTo(x, -1); c.strokeStyle = '#a8803e'; c.lineWidth = 1; c.stroke(); }
    rr(c, -6, -29, 12, 6, 2); fill(c, '#c4413c', 1.6);
  },
  umbrella(c) {
    c.beginPath(); c.moveTo(0, -4); c.lineTo(0, 0); c.arc(-4, 0, 4, 0, Math.PI); line(c, 2.6);
    c.beginPath(); c.moveTo(0, -66); c.quadraticCurveTo(-14, -40, -8, -10); c.lineTo(8, -10); c.quadraticCurveTo(14, -40, 0, -66); fill(c, '#7d4bb0');
    for (const x of [-4, 4]) { c.beginPath(); c.moveTo(0, -64); c.quadraticCurveTo(x * 1.5, -36, x, -10); line(c, 1.2); }
    rr(c, -2, -14, 4, 12, 1.5); fill(c, WOOD.mid, 1.4);
    rr(c, -1.5, -70, 3, 6, 1); fill(c, BRASS.mid, 1.2);
  },
  clock(c) {
    c.beginPath(); c.moveTo(-20, 0); c.lineTo(-20, -30); c.quadraticCurveTo(-20, -52, 0, -52); c.quadraticCurveTo(20, -52, 20, -30); c.lineTo(20, 0); c.closePath(); fill(c, WOOD.mid);
    ell(c, 0, -30, 13, 13); fill(c, BRASS.mid, 1.8); ell(c, 0, -30, 10.5, 10.5); fill(c, '#fbf4e2', 1.4);
    for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; c.beginPath(); c.moveTo(Math.cos(a) * 8.5, -30 + Math.sin(a) * 8.5); c.lineTo(Math.cos(a) * 9.8, -30 + Math.sin(a) * 9.8); line(c, i % 3 ? 0.8 : 1.4); }
    c.beginPath(); c.moveTo(0, -30); c.lineTo(5, -27); c.moveTo(0, -30); c.lineTo(-1, -38); line(c, 1.5);
    rr(c, -22, -4, 44, 4, 1.5); fill(c, WOOD.dark, 1.6);
    rr(c, -8, -14, 16, 7, 1.5); fill(c, WOOD.dark, 1.2);
  },
  mirror(c) {
    rr(c, -3.5, -26, 7, 26, 3); fill(c, SILVER.mid);
    ell(c, 0, -40, 13, 15); fill(c, SILVER.mid); ell(c, 0, -40, 10, 12); c.fillStyle = lin(c, -10, -52, 10, -28, ['#e8f4ff', '#a8c4e0', '#e8f4ff']); c.fill(); line(c, 1.4);
    c.beginPath(); c.moveTo(-5, -46); c.lineTo(2, -50); c.moveTo(-6, -40); c.lineTo(4, -46); c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 1.6; c.stroke();
  },
  comb(c) {
    rr(c, -23, -14, 46, 6, 2); fill(c, '#d07a4a');
    for (let x = -21; x <= 21; x += 3) { c.beginPath(); c.moveTo(x, -8); c.lineTo(x, -1); c.strokeStyle = INK; c.lineWidth = 2.2; c.stroke(); c.strokeStyle = '#d07a4a'; c.lineWidth = 1; c.stroke(); }
  },
  scales(c) {
    ell(c, 0, -3, 12, 3.5); fill(c, BRASS.dark); rr(c, -2, -40, 4, 37, 1.5); fill(c, BRASS.mid, 1.6);
    c.beginPath(); c.moveTo(-22, -38); c.lineTo(22, -42); line(c, 4); c.beginPath(); c.moveTo(-22, -38); c.lineTo(22, -42); c.strokeStyle = BRASS.mid; c.lineWidth = 2; c.stroke();
    for (const [x, y] of [[-22, -38], [22, -42]]) {
      c.beginPath(); c.moveTo(x, y); c.lineTo(x - 8, y + 16); c.moveTo(x, y); c.lineTo(x + 8, y + 16); line(c, 1);
      c.beginPath(); c.moveTo(x - 10, y + 16); c.quadraticCurveTo(x, y + 24, x + 10, y + 16); c.closePath(); fill(c, BRASS.mid, 1.6);
    }
    ell(c, 0, -42, 3.4, 3.4); fill(c, BRASS.light, 1.4);
  },
  gift(c) {
    rr(c, -18, -30, 36, 30, 2); fill(c, '#4fb8a0');
    c.fillStyle = '#ffd84a'; c.fillRect(-4, -30, 8, 30); c.strokeStyle = INK; c.lineWidth = 1.2; c.strokeRect(-4, -30, 8, 30);
    rr(c, -20, -34, 40, 7, 2); fill(c, '#5fc8b0', 1.8); c.fillStyle = '#ffd84a'; c.fillRect(-4, -34, 8, 7);
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(0, -34); c.bezierCurveTo(s * 14, -46, s * 16, -32, 0, -34); fill(c, '#ffd84a', 1.6); }
    ell(c, 0, -34, 3, 2.6); fill(c, '#f0b23a', 1.4);
  },

  // ---- to eat and drink ----
  lollipop(c) {
    rr(c, -1.5, -36, 3, 36, 1.5); fill(c, '#fbf6ee', 1.4);
    ell(c, 0, -44, 12, 12); fill(c, '#ff7aa8');
    c.beginPath(); for (let a = 0; a < Math.PI * 6; a += 0.2) { const r = 11 * (a / (Math.PI * 6)); c.lineTo(Math.cos(a) * r, -44 + Math.sin(a) * r); } c.strokeStyle = '#fff3f8'; c.lineWidth = 2.4; c.stroke();
    ell(c, 0, -44, 12, 12); line(c);
  },
  lemon(c) {
    c.beginPath(); c.moveTo(-16, -12); c.quadraticCurveTo(-14, -25, 0, -25); c.quadraticCurveTo(14, -25, 16, -12); c.quadraticCurveTo(14, 0, 0, 0); c.quadraticCurveTo(-14, 0, -16, -12); fill(c, '#ffe14a');
    ell(c, -16, -12, 2, 2.4); fill(c, '#e8c020', 1.2); ell(c, 16, -12, 2, 2.4); fill(c, '#e8c020', 1.2);
    shine(c, -5, -18, 4, 2, 0.5, -0.2);
  },
  banana(c) {
    c.beginPath(); c.moveTo(-22, -16); c.quadraticCurveTo(0, 4, 22, -14); c.quadraticCurveTo(0, -4, -20, -20); c.closePath(); fill(c, '#ffd84a');
    c.beginPath(); c.moveTo(-20, -18); c.quadraticCurveTo(0, -2, 20, -14); c.strokeStyle = '#d8a820'; c.lineWidth = 1.2; c.stroke();
    rr(c, -25, -22, 5, 4, 1); fill(c, '#7a5a2a', 1.2); ell(c, 22.5, -14, 1.6, 1.6); c.fillStyle = INK; c.fill();
  },
  donut(c) {
    c.beginPath(); c.ellipse(0, -10, 18, 10, 0, 0, Math.PI * 2); c.ellipse(0, -11, 5, 2.6, 0, 0, Math.PI * 2, true); c.fillStyle = '#d99a52'; c.fill('evenodd'); line(c, 2);
    c.beginPath(); c.moveTo(-16, -11); c.bezierCurveTo(-16, -21, 16, -21, 16, -11); c.quadraticCurveTo(12, -6, 8, -9); c.quadraticCurveTo(0, -4, -8, -8); c.quadraticCurveTo(-13, -5, -16, -11); fill(c, '#ff8fc0', 1.6);
    ell(c, 0, -11, 5, 2.6); fill(c, '#5a3a24', 1.4);
    const cols = ['#fff', '#4fb8f0', '#ffd84a', '#8ef05b'];
    for (let i = 0; i < 10; i++) { const a = i * 0.63, r = 10; c.save(); c.translate(Math.cos(a) * r, -12 + Math.sin(a) * r * 0.45); c.rotate(a * 2); c.fillStyle = cols[i % 4]; c.fillRect(-1.6, -0.6, 3.2, 1.2); c.restore(); }
  },
  pie(c) {
    c.beginPath(); c.moveTo(-26, -10); c.lineTo(-22, 0); c.lineTo(22, 0); c.lineTo(26, -10); c.closePath(); fill(c, '#c0c6d0');
    ell(c, 0, -12, 25, 8); fill(c, '#e8b066');
    c.save(); ell(c, 0, -12, 22, 6.5); c.clip(); c.fillStyle = '#b8323e'; c.fillRect(-24, -20, 48, 16);
    for (let x = -20; x <= 20; x += 8) { c.fillStyle = '#e8b066'; c.save(); c.translate(x, -12); c.rotate(0.5); c.fillRect(-1.6, -10, 3.2, 20); c.restore(); c.save(); c.translate(x, -12); c.rotate(-0.5); c.fillRect(-1.6, -10, 3.2, 20); c.restore(); }
    c.restore(); ell(c, 0, -12, 22, 6.5); line(c, 1.4);
  },
  milk(c) {
    const p = () => { c.beginPath(); c.moveTo(-5, -44); c.lineTo(-5, -38); c.quadraticCurveTo(-10, -32, -10, -24); c.lineTo(-10, -3); c.quadraticCurveTo(-10, 0, -7, 0); c.lineTo(7, 0); c.quadraticCurveTo(10, 0, 10, -3); c.lineTo(10, -24); c.quadraticCurveTo(10, -32, 5, -38); c.lineTo(5, -44); c.closePath(); };
    glassWith(c, p, -34, '#fbfbf6', '#e8e6dc');
    rr(c, -6, -50, 12, 6, 2); fill(c, '#5aa0e0', 1.6);
    rr(c, -8, -20, 16, 9, 2); fill(c, '#5aa0e0', 1.2); c.fillStyle = '#fff'; c.font = 'bold 5px sans-serif'; c.textAlign = 'center'; c.fillText('MILK', 0, -14);
  },
  'apple-gold'(c) { appleShape(c, ['#fff3a0', '#e0a020'], true); },

  // ---- creatures and toys ----
  bone(c) {
    rr(c, -16, -12, 32, 7, 3); fill(c, '#f6efe0', 0);
    for (const s of [-1, 1]) for (const dy of [-13, -5]) { ell(c, s * 19, dy, 5, 5); fill(c, '#f6efe0'); }
    c.beginPath(); c.moveTo(-16, -12); c.lineTo(16, -12); c.moveTo(-16, -5); c.lineTo(16, -5); line(c, 2);
    c.fillStyle = '#f6efe0'; c.fillRect(-17, -11, 34, 5);
  },
  fishbowl(c) {
    ell(c, 0, -22, 22, 21);
    c.save(); c.clip(); c.fillStyle = 'rgba(210,235,255,0.35)'; c.fillRect(-24, -44, 48, 44); c.fillStyle = 'rgba(80,170,230,0.55)'; c.fillRect(-24, -32, 48, 32);
    c.fillStyle = '#c9a46a'; c.fillRect(-24, -6, 48, 6);
    c.beginPath(); c.moveTo(-6, -2); c.quadraticCurveTo(-8, -12, -4, -16); line(c, 2); c.strokeStyle = '#5aa64a'; c.lineWidth = 2; c.stroke();
    c.save(); c.translate(4, -19); ell(c, 0, 0, 7, 4.6); fill(c, '#f08a24', 1.4); c.beginPath(); c.moveTo(-6, 0); c.lineTo(-11, -4); c.lineTo(-11, 4); c.closePath(); fill(c, '#f08a24', 1.4); ell(c, 3.4, -1, 1, 1); c.fillStyle = INK; c.fill(); c.restore();
    c.restore();
    ell(c, 0, -22, 22, 21); line(c);
    ell(c, 0, -42, 12, 3); fill(c, 'rgba(210,235,255,0.5)', 1.8);
    shine(c, -12, -30, 3, 8, 0.5, 0.3);
  },
  bat(c) {
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * 4, -16); c.quadraticCurveTo(s * 14, -26, s * 25, -20); c.quadraticCurveTo(s * 21, -16, s * 22, -10); c.quadraticCurveTo(s * 16, -13, s * 14, -7); c.quadraticCurveTo(s * 9, -11, s * 4, -8); c.closePath(); fill(c, '#3a3346'); }
    ell(c, 0, -12, 6, 8); fill(c, '#4a4256');
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * 2, -18); c.lineTo(s * 5, -25); c.lineTo(s * 5.5, -17); c.closePath(); fill(c, '#4a4256', 1.4); }
    ell(c, -2.2, -14, 1.3, 1.3); c.fillStyle = '#ffd84a'; c.fill(); ell(c, 2.2, -14, 1.3, 1.3); c.fill();
  },
  bunny(c) {
    for (const s of [-1, 1]) { ell(c, s * 5, -38, 4, 10, s * 0.12); fill(c, '#f6f2ec'); ell(c, s * 5, -38, 2, 7, s * 0.12); c.fillStyle = '#f6b0c0'; c.fill(); }
    ell(c, 0, -11, 13, 11); fill(c, '#f6f2ec');
    ell(c, 0, -26, 10, 9); fill(c, '#f6f2ec');
    ell(c, -3.6, -27, 1.4, 1.6); c.fillStyle = INK; c.fill(); ell(c, 3.6, -27, 1.4, 1.6); c.fill();
    ell(c, 0, -23.5, 1.6, 1.2); c.fillStyle = '#e57a9a'; c.fill();
    for (const s of [-1, 1]) { ell(c, s * 8, -2, 5, 3); fill(c, '#f6f2ec', 1.6); }
    c.beginPath(); c.moveTo(-5, -19); c.quadraticCurveTo(0, -15, 5, -19); c.strokeStyle = '#7fb8e0'; c.lineWidth = 2.4; c.stroke();
  },
  ladybird(c) {
    ell(c, 0, -9, 12, 9); fill(c, '#e0303e');
    c.beginPath(); c.moveTo(0, -18); c.lineTo(0, -1); line(c, 1.4);
    for (const [x, y, r] of [[-6, -12, 2.4], [6, -12, 2.4], [-6, -5, 2], [6, -5, 2], [-3, -16, 1.4], [3, -16, 1.4]]) { ell(c, x, y, r, r); c.fillStyle = INK; c.fill(); }
    ell(c, 0, -18, 6, 4); fill(c, '#2c2a3a');
    ell(c, -2.4, -19, 1.2, 1.2); c.fillStyle = '#fff'; c.fill(); ell(c, 2.4, -19, 1.2, 1.2); c.fill();
    shine(c, -6, -14, 2.4, 1.4, 0.5, -0.4);
  },
  butterfly(c) {
    for (const s of [-1, 1]) {
      ell(c, s * 10, -20, 10, 8, s * 0.4); fill(c, '#ff9a3a'); ell(c, s * 9, -8, 7, 6, s * -0.3); fill(c, '#ffc24a');
      ell(c, s * 12, -21, 3, 2.4); c.fillStyle = '#7a2a90'; c.fill(); ell(c, s * 9, -8, 2, 1.6); c.fillStyle = '#fff3c4'; c.fill();
    }
    rr(c, -1.8, -26, 3.6, 22, 1.8); fill(c, '#3a2f3e', 1.4);
    c.beginPath(); c.moveTo(-1, -26); c.quadraticCurveTo(-4, -30, -6, -30); c.moveTo(1, -26); c.quadraticCurveTo(4, -30, 6, -30); line(c, 1.2);
  },
  robot(c) {
    for (const s of [-1, 1]) { rr(c, s * 6 - 3, -10, 6, 10, 1.5); fill(c, '#8f97a6', 1.6); }
    rr(c, -12, -30, 24, 21, 3); fill(c, '#b8c0cc');
    rr(c, -7, -26, 14, 8, 2); fill(c, '#3d4250', 1.2); for (const [x, col] of [[-3.5, '#e0404a'], [0, '#ffd84a'], [3.5, '#5aa64a']]) { ell(c, x, -22, 1.6, 1.6); c.fillStyle = col; c.fill(); }
    for (const s of [-1, 1]) { rr(c, s * 14 - 2.5, -28, 5, 14, 2); fill(c, '#8f97a6', 1.6); }
    rr(c, -9, -44, 18, 14, 3); fill(c, '#c8d0da');
    ell(c, -4, -37, 2.6, 2.6); fill(c, '#9fe0ff', 1.2); ell(c, 4, -37, 2.6, 2.6); fill(c, '#9fe0ff', 1.2);
    c.beginPath(); c.moveTo(0, -44); c.lineTo(0, -48); line(c, 1.6); ell(c, 0, -48.5, 2, 2); fill(c, '#e0404a', 1.2);
    c.beginPath(); c.moveTo(12, -20); c.lineTo(17, -20); c.moveTo(17, -23); c.lineTo(17, -17); line(c, 1.8);
  },
  rocket(c) {
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * 6, -18); c.lineTo(s * 12, -4); c.lineTo(s * 12, 0); c.lineTo(s * 5, -6); c.closePath(); fill(c, '#3d7be0'); }
    c.beginPath(); c.moveTo(0, -54); c.quadraticCurveTo(10, -40, 7, -8); c.lineTo(-7, -8); c.quadraticCurveTo(-10, -40, 0, -54); fill(c, '#e0404a');
    ell(c, 0, -32, 4.6, 4.6); fill(c, '#9fe0ff', 1.6);
    rr(c, -5, -9, 10, 5, 1.5); fill(c, '#8f97a6', 1.4);
    shine(c, -3, -42, 1.6, 6, 0.45, 0.1);
  },
  plane(c) {
    c.beginPath(); c.moveTo(23, -12); c.lineTo(-23, -20); c.lineTo(-10, -11); c.closePath(); fill(c, '#fbfbf6', 1.6);
    c.beginPath(); c.moveTo(23, -12); c.lineTo(-10, -11); c.lineTo(-18, -2); c.closePath(); fill(c, '#e4e4ea', 1.6);
    c.beginPath(); c.moveTo(23, -12); c.lineTo(-14, -6); line(c, 1);
  },
  snowglobe(c) {
    c.beginPath(); c.moveTo(-15, 0); c.lineTo(-12, -11); c.lineTo(12, -11); c.lineTo(15, 0); c.closePath(); fill(c, WOOD.mid);
    ell(c, 0, -27, 16, 16);
    c.save(); c.clip(); c.fillStyle = 'rgba(190,220,255,0.55)'; c.fillRect(-18, -44, 36, 34);
    c.fillStyle = '#fff'; ell(c, 0, -10, 18, 5); c.fill();
    c.beginPath(); c.moveTo(0, -36); c.lineTo(-7, -14); c.lineTo(7, -14); c.closePath(); c.fillStyle = '#3f8f4a'; c.fill();
    for (const [x, y] of [[-9, -34], [8, -30], [-4, -22], [10, -20], [-11, -18], [3, -38], [-6, -40]]) { ell(c, x, y, 1.2, 1.2); c.fillStyle = '#fff'; c.fill(); }
    c.restore(); ell(c, 0, -27, 16, 16); line(c);
    shine(c, -7, -34, 4, 2.4, 0.7, -0.6);
  },

  // ---- growing ----
  leaf(c) {
    c.beginPath(); c.moveTo(-17, -4); c.bezierCurveTo(-12, -26, 12, -26, 17, -12); c.bezierCurveTo(8, 0, -8, 2, -17, -4); fill(c, '#e8762a');
    c.beginPath(); c.moveTo(-17, -4); c.quadraticCurveTo(0, -12, 15, -12); c.strokeStyle = '#a84a1a'; c.lineWidth = 1.4; c.stroke();
    for (const x of [-8, 0, 7]) { c.beginPath(); c.moveTo(x, -9 + x * -0.12); c.lineTo(x + 4, -17); c.moveTo(x, -9 + x * -0.12); c.lineTo(x + 3, -3); c.stroke(); }
  },
  rose(c) {
    c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(-2, -26, 0, -46); c.strokeStyle = INK; c.lineWidth = 3.6; c.stroke(); c.strokeStyle = '#3f8f4a'; c.lineWidth = 2; c.stroke();
    for (const [y, s] of [[-14, 1], [-26, -1], [-36, 1]]) { c.beginPath(); c.moveTo(-1, y); c.lineTo(s * 3, y - 2); c.lineTo(-1, y - 2); line(c, 1); }
    c.save(); c.translate(-1, -26); c.rotate(0.6); ell(c, 5, 0, 6, 3); fill(c, '#5aa64a', 1.4); c.restore();
    c.beginPath(); c.moveTo(-9, -50); c.quadraticCurveTo(-10, -42, 0, -40); c.quadraticCurveTo(10, -42, 9, -50); c.quadraticCurveTo(4, -60, 0, -56); c.quadraticCurveTo(-4, -60, -9, -50); fill(c, '#d8283e');
    c.beginPath(); c.moveTo(-4, -50); c.quadraticCurveTo(0, -46, 4, -50); c.moveTo(-2, -54); c.quadraticCurveTo(1, -52, 2, -55); c.strokeStyle = '#8e1424'; c.lineWidth = 1.2; c.stroke();
  },

  // ---- writing and art ----
  pencil(c) {
    c.beginPath(); c.moveTo(0, 0); c.lineTo(-4.5, -10); c.lineTo(4.5, -10); c.closePath(); fill(c, '#f2d2a2', 1.6);
    c.beginPath(); c.moveTo(0, 0); c.lineTo(-1.6, -3.5); c.lineTo(1.6, -3.5); c.closePath(); c.fillStyle = INK; c.fill();
    rr(c, -4.5, -50, 9, 40, 1); fill(c, '#ffd23f');
    c.beginPath(); c.moveTo(-1.5, -50); c.lineTo(-1.5, -10); c.moveTo(1.5, -50); c.lineTo(1.5, -10); c.strokeStyle = '#e0a820'; c.lineWidth = 1; c.stroke();
    rr(c, -4.5, -54, 9, 5, 0.5); fill(c, SILVER.mid, 1.4); rr(c, -4.5, -60, 9, 7, 3); fill(c, '#f6a0b0', 1.6);
  },
  palette(c) {
    c.beginPath(); c.moveTo(-24, -10); c.bezierCurveTo(-24, -26, 22, -26, 24, -12); c.bezierCurveTo(25, -2, 14, 0, 6, -4); c.bezierCurveTo(0, -6, 0, 0, -8, 0); c.bezierCurveTo(-18, 0, -24, -4, -24, -10); fill(c, '#d8a874');
    ell(c, 10, -8, 3.4, 2.6); c.fillStyle = '#5a3a24'; c.fill(); line(c, 1.2);
    for (const [x, y, col] of [[-15, -12, '#e0404a'], [-8, -18, '#ffd84a'], [1, -19, '#5aa64a'], [10, -17, '#3d7be0'], [-16, -5, '#fff']]) { ell(c, x, y, 3.4, 2.8); fill(c, col, 1.1); }
  },
  horn(c) {
    c.beginPath(); c.moveTo(-26, -15); c.lineTo(8, -17); c.lineTo(26, -28); c.lineTo(26, -2); c.lineTo(8, -12); c.lineTo(-26, -13); c.closePath();
    c.fillStyle = lin(c, 0, -28, 0, -2, [BRASS.light, BRASS.mid, BRASS.dark]); c.fill(); line(c);
    ell(c, 26, -15, 3.4, 13); fill(c, BRASS.dark, 1.8);
    rr(c, -28, -17, 4, 6, 1); fill(c, BRASS.mid, 1.4);
    for (const x of [-12, -6, 0]) { rr(c, x - 1.5, -22, 3, 6, 1); fill(c, BRASS.light, 1.2); }
  },

  // ---- prizes ----
  trophy(c) {
    rr(c, -12, -8, 24, 8, 2); fill(c, WOOD.dark);
    rr(c, -3, -20, 6, 13, 1.5); fill(c, BRASS.mid, 1.6);
    for (const s of [-1, 1]) { c.beginPath(); c.arc(s * 13, -38, 6, s > 0 ? -1.6 : 1.6, s > 0 ? 1.6 : 4.7, s < 0); line(c, 4.6); c.beginPath(); c.arc(s * 13, -38, 6, s > 0 ? -1.6 : 1.6, s > 0 ? 1.6 : 4.7, s < 0); c.strokeStyle = BRASS.mid; c.lineWidth = 2.2; c.stroke(); }
    c.beginPath(); c.moveTo(-14, -48); c.lineTo(14, -48); c.quadraticCurveTo(14, -24, 0, -20); c.quadraticCurveTo(-14, -24, -14, -48); c.fillStyle = lin(c, -14, 0, 14, 0, [BRASS.light, BRASS.mid, BRASS.dark]); c.fill(); line(c);
    star5(c, 0, -36, 5, '#fff3c4');
  },
  medal(c) {
    c.beginPath(); c.moveTo(-9, -42); c.lineTo(-2, -16); c.lineTo(4, -18); c.lineTo(-1, -42); c.closePath(); fill(c, '#3d7be0', 1.6);
    c.beginPath(); c.moveTo(9, -42); c.lineTo(2, -16); c.lineTo(-4, -18); c.lineTo(1, -42); c.closePath(); fill(c, '#e0404a', 1.6);
    ell(c, 0, -11, 11, 11); c.fillStyle = lin(c, -10, -22, 10, 0, [BRASS.light, BRASS.mid, BRASS.dark]); c.fill(); line(c);
    ell(c, 0, -11, 7, 7); c.strokeStyle = BRASS.dark; c.lineWidth = 1.2; c.stroke(); star5(c, 0, -11, 4.4, '#fff3c4');
  },
};

function tallBottle(c, hw, h, col, deep) {
  const p = () => { c.beginPath(); c.moveTo(-4, -h + 10); c.lineTo(-4, -h + 16); c.quadraticCurveTo(-hw, -h + 22, -hw, -h + 30); c.lineTo(-hw, -5); c.quadraticCurveTo(-hw, 0, -hw + 5, 0); c.lineTo(hw - 5, 0); c.quadraticCurveTo(hw, 0, hw, -5); c.lineTo(hw, -h + 30); c.quadraticCurveTo(hw, -h + 22, 4, -h + 16); c.lineTo(4, -h + 10); c.closePath(); };
  glassWith(c, p, -h * 0.62, col, deep); cork(c, -5.5, -h, 11, 10); shine(c, -hw + 5, -h * 0.4, 2.4, 10, 0.5, 0);
}
function cutGem(c, col, lite, hw, h) {
  c.beginPath(); c.moveTo(-hw, -h * 0.66); c.lineTo(-hw * 0.55, -h); c.lineTo(hw * 0.55, -h); c.lineTo(hw, -h * 0.66); c.lineTo(0, -1); c.closePath(); fill(c, col);
  c.beginPath(); c.moveTo(-hw, -h * 0.66); c.lineTo(hw, -h * 0.66); c.moveTo(-hw * 0.55, -h); c.lineTo(-hw * 0.25, -h * 0.66); c.lineTo(0, -1); c.lineTo(hw * 0.25, -h * 0.66); c.lineTo(hw * 0.55, -h); line(c, 1.2);
  c.beginPath(); c.moveTo(-hw * 0.55, -h); c.lineTo(-hw * 0.25, -h * 0.66); c.lineTo(hw * 0.25, -h * 0.66); c.lineTo(hw * 0.55, -h); c.closePath(); c.fillStyle = lite; c.fill();
  star4(c, -hw * 0.45, -h * 0.82, 3.6, '#fff');
}
function toadstool(c, k, col) {
  c.save(); c.scale(k, k);
  c.beginPath(); c.moveTo(-7, 0); c.quadraticCurveTo(-9, -14, -6, -24); c.lineTo(6, -24); c.quadraticCurveTo(9, -14, 7, 0); c.closePath(); fill(c, '#f6ecd6', LW / k);
  c.beginPath(); c.moveTo(-20, -22); c.bezierCurveTo(-20, -48, 20, -48, 20, -22); c.quadraticCurveTo(0, -17, -20, -22); fill(c, col, LW / k);
  for (const [x, y, r] of [[-9, -30, 3.5], [4, -36, 3], [11, -27, 2.6], [-2, -26, 2.2]]) { ell(c, x, y, r, r * 0.8); c.fillStyle = '#fff6e8'; c.fill(); }
  c.restore();
}
function cogShape(c, x, y, ro, ri, n, col) {
  c.beginPath();
  for (let i = 0; i < n * 4; i++) { const a = (i / (n * 4)) * Math.PI * 2, r = (i % 4 < 2) ? ro : ri; c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
  c.closePath(); c.fillStyle = lin(c, x, y - ro, x, y + ro, ['#d8dce4', col, '#7c818c']); c.fill(); line(c);
}

function book(c, w, h, col, deep, emblem) {
  rr(c, -w / 2 + 3, -h + 2, w - 3, h - 3, 2); fill(c, '#f3e8cc', 1.6);       // the pages at the edge
  rr(c, -w / 2, -h, w - 4, h, 3); fill(c, col);
  rr(c, -w / 2, -h, 8, h, 3); fill(c, deep, 1.6);
  for (const y of [-h + 8, -10]) { c.beginPath(); c.moveTo(-w / 2 + 9, y); c.lineTo(w / 2 - 6, y); c.strokeStyle = 'rgba(255,230,160,0.6)'; c.lineWidth = 1.4; c.stroke(); }
  c.save(); c.translate(-2, 0); emblem(); c.restore();
}
function key(c, M, k) {
  c.save(); c.scale(k, k);
  c.beginPath(); c.moveTo(-6, -11); c.lineTo(17, -11); c.lineTo(17, -3); c.lineTo(13, -3); c.lineTo(13, -7); c.lineTo(10, -7); c.lineTo(10, -4); c.lineTo(7, -4); c.lineTo(7, -7); c.lineTo(-6, -7); c.closePath();
  c.fillStyle = lin(c, 0, -12, 0, -3, [M.light, M.mid, M.dark]); c.fill(); line(c, 1.8 / k);
  c.beginPath(); c.arc(-11, -9, 7.5, 0, Math.PI * 2); c.arc(-11, -9, 3.6, 0, Math.PI * 2, true);
  c.fillStyle = lin(c, -18, -16, -4, -2, [M.light, M.mid, M.dark]); c.fill('evenodd'); line(c, 1.8 / k);
  c.beginPath(); c.arc(-11, -9, 3.6, 0, Math.PI * 2); line(c, 1.4 / k);
  c.restore();
}

// ---------- sprites ----------
const sprites = new Map();
export function sprite(kind) {
  let s = sprites.get(kind);
  if (s) return s;
  const t = THING[kind], K = SPRITE_SCALE;
  const cw = t.w + PAD * 2, ch = t.h + PAD * 2;
  const cv = makeCanvas(Math.ceil(cw * K), Math.ceil(ch * K));
  const c = cv.getContext('2d');
  c.scale(K, K); c.translate(cw / 2, t.h + PAD);
  drawFor(kind)(c, t.w, t.h);
  // the outline left on the shelf when it is out: the same shape, flat
  const ov = makeCanvas(cv.width, cv.height), oc = ov.getContext('2d');
  oc.drawImage(cv, 0, 0); oc.globalCompositeOperation = 'source-in'; oc.fillStyle = '#fff'; oc.fillRect(0, 0, ov.width, ov.height);
  s = { img: cv, ghost: ov, cw, ch };
  sprites.set(kind, s);
  return s;
}
export function drawThing(c, kind, a = 1) {
  const t = THING[kind], s = sprite(kind);
  c.globalAlpha = a;
  c.drawImage(s.img, -s.cw / 2, -(t.h + PAD), s.cw, s.ch);
  c.globalAlpha = 1;
}
export function drawGhost(c, kind, a) {
  const t = THING[kind], s = sprite(kind);
  c.globalAlpha = a;
  c.drawImage(s.ghost, -s.cw / 2, -(t.h + PAD), s.cw, s.ch);
  c.globalAlpha = 1;
}

const FLAMES = { candle: [[0, -48, 1]], lantern: [[0, -22, 0.8]], candelabra: [[-20, -54, 0.7], [0, -58, 0.7], [20, -54, 0.7]] };
function flame(c, y, s, t) {
  const f = Math.sin(t * 9) * 0.8 + Math.sin(t * 23) * 0.5;
  c.save(); c.globalCompositeOperation = 'lighter';
  const g = c.createRadialGradient(0, y - 4, 1, 0, y - 4, 26 * s); g.addColorStop(0, 'rgba(255,200,90,0.45)'); g.addColorStop(1, 'rgba(255,160,60,0)');
  c.fillStyle = g; c.fillRect(-30, y - 34, 60, 60); c.restore();
  c.beginPath(); c.moveTo(0, y + 1); c.quadraticCurveTo(-5 * s, y - 4, f * 0.6, y - 13 * s - f * 0.5); c.quadraticCurveTo(5 * s, y - 4, 0, y + 1);
  c.fillStyle = '#ffb33d'; c.fill();
  c.beginPath(); c.moveTo(0, y); c.quadraticCurveTo(-2.4 * s, y - 3, f * 0.3, y - 7 * s); c.quadraticCurveTo(2.4 * s, y - 3, 0, y); c.fillStyle = '#fff6c8'; c.fill();
}

// What moves on a thing, drawn over its sprite in the same frame.
export function drawLive(c, kind, t) {
  if (FLAMES[kind]) {
    for (const [fx, y, s] of FLAMES[kind]) { c.save(); c.translate(fx, 0); flame(c, y, s, t + fx); c.restore(); }
  } else if (kind === 'star') {
    const a = 0.22 + Math.sin(t * 2.2) * 0.1;
    c.save(); c.globalCompositeOperation = 'lighter';
    const g = c.createRadialGradient(0, -17, 2, 0, -17, 34); g.addColorStop(0, `rgba(255,230,120,${a})`); g.addColorStop(1, 'rgba(255,210,90,0)');
    c.fillStyle = g; c.fillRect(-36, -53, 72, 72); c.restore();
  } else if (kind === 'potion-green') {
    for (let i = 0; i < 3; i++) {
      const p = (t * 0.7 + i / 3) % 1;
      ell(c, Math.sin(i * 4 + t * 2) * 4, -60 - p * 16, 2 + i * 0.6, 2 + i * 0.6);
      c.strokeStyle = `rgba(190,250,150,${1 - p})`; c.lineWidth = 1.4; c.stroke();
    }
  } else if (kind === 'moonjar' || kind === 'orb' || kind === 'jar-fireflies') {
    const y = kind === 'orb' ? -31 : -22, a = 0.18 + Math.sin(t * 1.6) * 0.08;
    c.save(); c.globalCompositeOperation = 'lighter';
    const g = c.createRadialGradient(0, y, 2, 0, y, 38); g.addColorStop(0, `rgba(170,190,255,${a})`); g.addColorStop(1, 'rgba(120,140,255,0)');
    c.fillStyle = g; c.fillRect(-40, y - 40, 80, 80); c.restore();
  } else if (SPARKLE.has(kind)) {
    const p = (t * 0.45 + kind.length * 0.13) % 1;
    if (p < 0.25) {
      const k = Math.sin(p / 0.25 * Math.PI), th = THING[kind];
      star4(c, th.w * 0.22, -th.h * 0.7, 6 * k, `rgba(255,255,240,${k})`);
    }
  }
}
const SPARKLE = new Set(['ring', 'crystal', 'gem', 'ruby', 'crown', 'wand', 'trophy', 'medal', 'apple-gold', 'mirror',
  ...Object.keys(VARIANTS).filter((k) => VARIANTS[k].base === 'gem')]);

function jar(c, w, h, inner, inside) {
  const hw = w / 2 - 1;
  const p = () => rr(c, -hw, -(h - 8), hw * 2, h - 8, 6);
  p(); c.save(); c.clip();
  c.fillStyle = inner; c.fillRect(-hw, -h, hw * 2, h);
  inside();
  c.restore();
  p(); c.fillStyle = 'rgba(220,235,255,0.18)'; c.fill(); line(c);
  rr(c, -hw + 2, -h, hw * 2 - 4, 9, 2.5); fill(c, BRASS.mid, 1.8);
  shine(c, -hw + 5, -(h - 8) / 2 - 2, 2, 7, 0.4, 0);
}
function appleShape(c, cols, gold) {
  c.beginPath(); c.moveTo(0, -27); c.bezierCurveTo(-8, -33, -19, -28, -17, -14); c.bezierCurveTo(-15, -2, -6, 1, 0, -3); c.bezierCurveTo(6, 1, 15, -2, 17, -14); c.bezierCurveTo(19, -28, 8, -33, 0, -27);
  c.fillStyle = lin(c, -15, -30, 15, 0, cols); c.fill(); line(c);
  c.beginPath(); c.moveTo(0, -27); c.quadraticCurveTo(1, -33, 3, -36); line(c, 2.4);
  c.beginPath(); c.moveTo(2, -32); c.quadraticCurveTo(10, -38, 14, -32); c.quadraticCurveTo(8, -29, 2, -32); fill(c, gold ? BRASS.mid : '#69b845', 1.4);
  shine(c, -9, -20, 3, 5, 0.55, 0.3);
  if (gold) star4(c, 9, -20, 5, '#fff');
}

// ---------- colour variants ----------
// [main, deep] for each colour a variant can come in
const COLS = {
  orange: ['#f08a24', '#b85a10'], teal: ['#2fa89a', '#1c6e66'], brown: ['#8a5a3a', '#5e3a24'], pink: ['#f08ab4', '#c0507e'],
  grey: ['#8f97a6', '#5d6270'], navy: ['#2c3c7a', '#1a2450'], maroon: ['#8e2a3a', '#5e1624'], olive: ['#7a8a3a', '#4e5a20'],
  black: ['#3a3346', '#1e1a26'], white: ['#f2ede0', '#cfc6b0'], yellow: ['#ffd23f', '#c89a10'], lavender: ['#b9a2e8', '#8a70c0'],
  lime: ['#a8f05b', '#5a9a20'], violet: ['#9a5ae0', '#5a2a9c'], cyan: ['#5fe0f0', '#1a8aa0'], rose: ['#ff8fa8', '#c04060'],
  amber: ['#ffb84a', '#c07010'], green: ['#5aa64a', '#2e6532'], indigo: ['#5a5ae0', '#2a2a8a'], coral: ['#ff8a6a', '#c04a30'],
  silver: ['#d4dae2', '#8f97a6'], purple: ['#9a62e0', '#5e3090'], blue: ['#4f87e0', '#24489e'], aqua: ['#5fe0d0', '#1a9a8a'],
  red: ['#e0404a', '#9c1b2a'], gold: ['#ffd84a', '#c8901a'], copper: ['#e0905a', '#9a5428'],
};
const EMBLEMS = [
  (c, h) => star5(c, 3, -h / 2, 7, '#f6e27a'),
  (c, h) => { ell(c, 3, -h / 2, 7, 7); fill(c, BRASS.mid, 1.4); },
  (c, h) => { c.beginPath(); c.arc(3, -h / 2, 7, 0.6, Math.PI * 2 - 0.6); c.arc(6, -h / 2 - 1.5, 5.6, Math.PI * 2 - 0.9, 0.9, true); c.closePath(); fill(c, '#f6e27a', 1.2); },
  (c, h) => { rr(c, -4, -h / 2 - 6, 14, 12, 2); fill(c, '#f3e8cc', 1.2); },
];
const PAINT = {
  book(c, w, h, col, deep, kind) { book(c, w, h, col, deep, () => EMBLEMS[kind.length % EMBLEMS.length](c, h)); },
  tallpotion(c, w, h, col, deep) { tallBottle(c, w / 2, h, col, deep); },
  roundpotion(c, w, h, col, deep) {
    const r = w / 2 - 1, a0 = Math.asin(5 / r);
    const p = () => { c.beginPath(); c.moveTo(-5, -h + 9); c.arc(0, -r, r, -Math.PI / 2 - a0, Math.PI * 1.5 + a0); c.lineTo(5, -h + 9); c.closePath(); };
    glassWith(c, p, -r * 1.2, col, deep); cork(c, -6.5, -h, 13, 9); shine(c, -r * 0.45, -r * 1.2, 3, 6);
  },
  toadstool(c, w, h, col) { toadstool(c, w / 40, col); },
  gem(c, w, h, col) { cutGem(c, col, 'rgba(255,255,255,0.5)', w / 2, h); },
  candle(c, w, h, col, deep) {
    ell(c, 0, -4, 12, 4.5); fill(c, BRASS.mid);
    c.beginPath(); c.moveTo(-6, -6); c.lineTo(-6, -(h - 14)); c.quadraticCurveTo(0, -(h - 11), 6, -(h - 14)); c.lineTo(6, -6); c.closePath(); fill(c, col);
    c.beginPath(); c.moveTo(-6, -(h - 14)); c.quadraticCurveTo(-7, -(h - 22), -4, -(h - 24)); c.quadraticCurveTo(-2, -(h - 19), 0, -(h - 13)); c.fillStyle = col; c.fill(); line(c, 1.3);
    c.fillStyle = 'rgba(0,0,0,0.15)'; c.fillRect(2, -(h - 15), 4, h - 21);
    c.beginPath(); c.moveTo(0, -(h - 12)); c.lineTo(0, -(h - 15)); line(c, 1.5);
  },
  ball(c, w, h, col) {
    const r = w / 2 - 1;
    ell(c, 0, -r - 1, r, r); fill(c, col);
    c.save(); ell(c, 0, -r - 1, r, r); c.clip(); c.beginPath(); c.ellipse(0, -r - 1, r + 2, r * 0.28, -0.4, 0, Math.PI * 2); c.fillStyle = '#fff3e6'; c.fill(); c.restore();
    ell(c, 0, -r - 1, r, r); line(c); shine(c, -r * 0.35, -r * 1.4, r * 0.25, r * 0.15, 0.6, -0.5);
  },
  yarn(c, w, h, col, deep) {
    const r = w / 2 - 2;
    c.beginPath(); c.moveTo(r * 0.7, -3); c.bezierCurveTo(r + 2, 0, r, 4, r + 6, 2); line(c, 2.6); c.beginPath(); c.moveTo(r * 0.7, -3); c.bezierCurveTo(r + 2, 0, r, 4, r + 6, 2); c.strokeStyle = col; c.lineWidth = 1.4; c.stroke();
    ell(c, -1, -r - 1, r, r); fill(c, col);
    c.save(); ell(c, -1, -r - 1, r, r); c.clip();
    for (let i = 0; i < 5; i++) { c.beginPath(); c.ellipse(-1, -r - 1, r + 2, r * 0.36, 0.6 + i * 0.36, 0, Math.PI * 2); c.strokeStyle = deep; c.lineWidth = 1.1; c.stroke(); }
    c.restore();
  },
  sock(c, w, h, col, deep) {
    c.save(); c.scale(w / 34, h / 50);
    const p = () => { c.beginPath(); c.moveTo(-2, -50); c.lineTo(14, -50); c.lineTo(14, -14); c.quadraticCurveTo(14, 0, 0, 0); c.lineTo(-10, 0); c.quadraticCurveTo(-17, 0, -17, -6); c.quadraticCurveTo(-17, -12, -8, -14); c.lineTo(-2, -18); c.closePath(); };
    p(); c.fillStyle = '#f6efe0'; c.fill(); c.save(); p(); c.clip();
    c.fillStyle = col; for (let y = -48; y < 0; y += 10) c.fillRect(-20, y, 40, 5);
    c.fillStyle = deep; ell(c, -12, -5, 7, 7); c.fill(); ell(c, 9, -5, 7, 7); c.fill();
    c.restore(); p(); line(c);
    rr(c, -3, -52, 18, 6, 2); fill(c, '#f6efe0', 1.6);
    c.restore();
  },
  feather(c, w, h, col, deep) {
    c.save(); c.translate(0, -8); c.rotate(-0.08); c.scale(w / 44, 1);
    c.beginPath(); c.moveTo(-21, 1); c.bezierCurveTo(-10, -8, 10, -9, 21, -2); c.bezierCurveTo(10, 6, -8, 6, -21, 1); fill(c, col);
    c.beginPath(); c.moveTo(-14, 1); c.bezierCurveTo(-4, -4, 10, -5, 19, -2); c.bezierCurveTo(10, 2, -4, 3, -14, 1); c.fillStyle = 'rgba(255,255,255,0.35)'; c.fill();
    c.beginPath(); c.moveTo(-23, 2); c.quadraticCurveTo(0, -1, 21, -2); line(c, 1.4);
    for (const x of [-6, 4, 12]) { c.beginPath(); c.moveTo(x, -1); c.lineTo(x + 3, -5); c.strokeStyle = deep; c.lineWidth = 1; c.stroke(); }
    c.restore();
  },
  scroll(c, w, h, col) {
    c.save(); c.scale(w / 52, h / 34);
    rr(c, -24, -26, 48, 19, 9); fill(c, '#f2e2bb');
    ell(c, -24, -16.5, 5, 9.5); fill(c, '#e3cb98'); ell(c, -24, -16.5, 2, 4); fill(c, '#c8a46a', 1.2);
    ell(c, 24, -16.5, 5, 9.5); fill(c, '#e3cb98');
    rr(c, -4, -28, 8, 23, 2); fill(c, col, 1.8);
    c.restore();
  },
  teacup(c, w, h, col) {
    ell(c, 0, -4, 22, 5); fill(c, '#f3eef6');
    c.beginPath(); c.arc(17, -18, 6, -1.4, 1.4); line(c, 5); c.beginPath(); c.arc(17, -18, 6, -1.4, 1.4); c.strokeStyle = '#f3eef6'; c.lineWidth = 2.6; c.stroke();
    c.beginPath(); c.moveTo(-16, -27); c.bezierCurveTo(-16, -10, -10, -7, 0, -7); c.bezierCurveTo(10, -7, 16, -10, 16, -27); c.closePath(); fill(c, '#f3eef6');
    ell(c, 0, -27, 16, 3.6); fill(c, '#9b5a33', 1.8);
    c.beginPath(); c.moveTo(-14, -18); c.quadraticCurveTo(0, -12, 14, -18); c.strokeStyle = col; c.lineWidth = 2.4; c.stroke();
  },
  apple(c, w, h, col, deep) { c.save(); c.scale(w / 34, h / 36); appleShape(c, [col, deep]); c.restore(); },
  key(c, w, h, col, deep) { key(c, { light: '#ffd0a8', mid: col, dark: deep }, w / 40); },
};
for (const [kind, v] of Object.entries(VARIANTS)) {
  const t = THING[kind];
  if (v.base === 'candle') FLAMES[kind] = [[0, -(t.h - 12), 0.85]];
}
const drawFor = (kind) => DRAW[kind] || ((c, w, h) => { const v = VARIANTS[kind]; const [col, deep] = COLS[v.col]; PAINT[v.base](c, w, h, col, deep, kind); });

export const LIVE = new Set(['lantern', 'candelabra', 'star', 'potion-green', 'moonjar', 'orb', 'jar-fireflies', ...Object.keys(FLAMES), ...SPARKLE]);

// ---------- the room ----------
export function paintRoom() {
  const cv = makeCanvas(W * 2, H * 2), c = cv.getContext('2d');
  c.scale(2, 2);

  // the stone wall, warm towards the fire and cool towards the window
  c.fillStyle = lin(c, 0, 0, 0, 620, ['#2c2a4c', '#3e3456', '#4a3a52']); c.fillRect(0, 0, W, 620);
  for (let row = 0; row < 14; row++) {
    const y = 34 + row * 42, off = row % 2 ? 0 : 34;
    for (let col = -1; col < 18; col++) {
      const x = col * 72 + off, n = hash2(col, row, 3), wv = 64 + hash2(col, row, 4) * 10;
      rr(c, x + 3, y + 3, wv - 6, 36, 7);
      c.fillStyle = `rgba(${150 + n * 40},${130 + n * 30},${190 + n * 30},${0.08 + n * 0.08})`; c.fill();
      c.strokeStyle = 'rgba(20,14,34,0.35)'; c.lineWidth = 2; c.stroke();
    }
  }
  // the ceiling beam and its herbs
  c.fillStyle = lin(c, 0, 0, 0, 34, [WOOD.light, WOOD.dark]); c.fillRect(0, 0, W, 34);
  c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(0, 34, W, 5);
  for (let i = 0; i < 6; i++) {
    const x = 350 + i * 100 + (i > 2 ? 40 : 0);
    if (x > 455 && x < 745) continue;
    c.beginPath(); c.moveTo(x, 30); c.lineTo(x, 52); c.strokeStyle = '#c9b48a'; c.lineWidth = 1.6; c.stroke();
    for (let k = 0; k < 7; k++) {
      const a = (k - 3) * 0.16;
      c.beginPath(); c.moveTo(x, 52); c.quadraticCurveTo(x + Math.sin(a) * 18, 70, x + Math.sin(a) * 26, 92 + (k % 2) * 8);
      c.strokeStyle = i % 2 ? '#7aa55a' : '#a77fbf'; c.lineWidth = 4; c.stroke();
    }
    rr(c, x - 6, 48, 12, 7, 2); c.fillStyle = '#c4413c'; c.fill();
  }

  // the window
  const wx0 = 476, wx1 = 724, wy0 = 64, wy1 = 304, wmid = (wx0 + wx1) / 2;
  const arch = () => { c.beginPath(); c.moveTo(wx0, wy1); c.lineTo(wx0, wy0 + 124); c.arc(wmid, wy0 + 124, (wx1 - wx0) / 2, Math.PI, 0); c.lineTo(wx1, wy1); c.closePath(); };
  arch(); c.fillStyle = lin(c, 0, wy0, 0, wy1, ['#16204a', '#2c3f86', '#5a6fb5']); c.fill();
  c.save(); arch(); c.clip();
  for (let i = 0; i < 40; i++) { const x = wx0 + hash2(i, 1, 9) * (wx1 - wx0), y = wy0 + hash2(i, 2, 9) * 200; c.fillStyle = `rgba(255,255,230,${0.4 + hash2(i, 3, 9) * 0.6})`; c.fillRect(x, y, 1.6, 1.6); }
  c.beginPath(); c.arc(650, 128, 26, 0, Math.PI * 2); c.fillStyle = '#fff4c8'; c.fill();
  c.beginPath(); c.arc(640, 122, 24, 0, Math.PI * 2); c.fillStyle = '#20306a'; c.fill();
  // far hills and a tower
  c.fillStyle = '#1b2654'; c.beginPath(); c.moveTo(wx0, 270); c.quadraticCurveTo(540, 230, 600, 262); c.quadraticCurveTo(660, 236, wx1, 258); c.lineTo(wx1, wy1); c.lineTo(wx0, wy1); c.fill();
  c.fillRect(530, 214, 16, 50); c.beginPath(); c.moveTo(526, 216); c.lineTo(538, 196); c.lineTo(550, 216); c.fill();
  c.fillStyle = '#ffd77a'; c.fillRect(536, 226, 4, 6);
  c.restore();
  c.lineWidth = 9; c.strokeStyle = WOOD.mid; arch(); c.stroke();
  c.lineWidth = 2.4; c.strokeStyle = INK; arch(); c.stroke();
  c.fillStyle = WOOD.mid; c.fillRect(wmid - 4, wy0 + 4, 8, wy1 - wy0 - 4); c.fillRect(wx0, 196, wx1 - wx0, 7);
  c.strokeStyle = INK; c.lineWidth = 1.6; c.strokeRect(wmid - 4, wy0 + 6, 8, wy1 - wy0 - 6); c.strokeRect(wx0, 196, wx1 - wx0, 7);
  // the sill
  rr(c, LEDGE.x0, LEDGE.y, LEDGE.x1 - LEDGE.x0, 15, 3); c.fillStyle = lin(c, 0, LEDGE.y, 0, LEDGE.y + 15, [WOOD.edge, WOOD.mid]); c.fill(); line(c, 2);
  c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(LEDGE.x0 + 6, LEDGE.y + 15, LEDGE.x1 - LEDGE.x0 - 12, 6);

  // a star chart on the wall
  rr(c, 318, 120, 120, 150, 4); c.fillStyle = '#e8d6aa'; c.fill(); line(c, 2);
  c.fillStyle = 'rgba(60,40,90,0.75)'; c.fillRect(326, 128, 104, 134);
  for (let i = 0; i < 16; i++) { c.fillStyle = '#f4e6b0'; const x = 334 + hash2(i, 5, 2) * 88, y = 136 + hash2(i, 6, 2) * 118; c.fillRect(x, y, 2, 2); }
  c.beginPath(); c.moveTo(346, 160); c.lineTo(372, 150); c.lineTo(392, 172); c.lineTo(414, 160); c.moveTo(352, 220); c.lineTo(376, 232); c.lineTo(404, 214);
  c.strokeStyle = 'rgba(244,230,176,0.6)'; c.lineWidth = 1; c.stroke();
  c.beginPath(); c.arc(378, 195, 34, 0, Math.PI * 2); c.stroke();
  c.beginPath(); c.moveTo(372, 120); c.lineTo(378, 104); c.lineTo(384, 120); c.strokeStyle = INK; c.lineWidth = 1.4; c.stroke();
  // two little shelves on brackets above the cauldron
  for (const y of WALL.ys) {
    for (const x of [WALL.x0 + 18, WALL.x1 - 18]) { c.beginPath(); c.moveTo(x - 4, y + 12); c.lineTo(x - 4, y + 40); c.quadraticCurveTo(x + 2, y + 18, x + 12, y + 12); c.closePath(); c.fillStyle = WOOD.dark; c.fill(); line(c, 1.6); }
    rr(c, WALL.x0, y, WALL.x1 - WALL.x0, 13, 2); c.fillStyle = lin(c, 0, y, 0, y + 13, [WOOD.edge, WOOD.mid]); c.fill(); line(c, 2);
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(WALL.x0 + 4, y + 13, WALL.x1 - WALL.x0 - 8, 5);
  }
  // and cobwebs in the corners
  web(c, 0, 34, 1); web(c, W, 34, -1);

  // the floor
  c.fillStyle = lin(c, 0, 600, 0, H, ['#5b3a2c', '#3e2620']); c.fillRect(0, 604, W, H - 604);
  for (let i = 0; i < 7; i++) { const y = 616 + i * 22 + i * i * 0.6; c.fillStyle = 'rgba(0,0,0,0.22)'; c.fillRect(0, y, W, 2); }
  for (let i = 0; i < 26; i++) { const row = i % 7, y = 616 + row * 22 + row * row * 0.6, x = hash2(i, 7, 1) * W; c.fillStyle = 'rgba(0,0,0,0.2)'; c.fillRect(x, y, 2, 22); }
  c.fillStyle = WOOD.dark; c.fillRect(0, 596, W, 12); c.fillStyle = 'rgba(255,220,170,0.12)'; c.fillRect(0, 596, W, 3);
  // the rug
  ell(c, 560, 690, 300, 50); c.fillStyle = '#6b2e57'; c.fill(); line(c, 2);
  ell(c, 560, 690, 278, 42); c.strokeStyle = '#d9a64a'; c.lineWidth = 3; c.stroke();
  ell(c, 560, 690, 230, 30); c.strokeStyle = 'rgba(217,166,74,0.55)'; c.lineWidth = 2; c.setLineDash([6, 8]); c.stroke(); c.setLineDash([]);
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; star4(c, 560 + Math.cos(a) * 140, 690 + Math.sin(a) * 18, 6, 'rgba(240,200,110,0.7)'); }

  // the desk
  c.fillStyle = WOOD.dark;
  for (const x of [DESK.x0 + 10, DESK.x1 - 26]) { rr(c, x, DESK.y + 14, 16, 616 - DESK.y - 14, 2); c.fill(); line(c, 2); }
  rr(c, DESK.x0 + 30, DESK.y + 14, 120, 40, 3); c.fillStyle = WOOD.mid; c.fill(); line(c, 2);
  ell(c, DESK.x0 + 90, DESK.y + 34, 5, 5); c.fillStyle = BRASS.mid; c.fill(); line(c, 1.4);
  rr(c, DESK.x0 - 6, DESK.y, DESK.x1 - DESK.x0 + 12, 16, 3); c.fillStyle = lin(c, 0, DESK.y, 0, DESK.y + 16, [WOOD.edge, WOOD.mid]); c.fill(); line(c, 2.2);

  // the cauldron on its fire
  const { x: cx, y: cy, r } = CAULDRON;
  for (const [a, l] of [[-0.25, 70], [0.25, 70], [0, 60]]) { c.save(); c.translate(cx, cy + 34); c.rotate(a); rr(c, -l / 2, -6, l, 12, 6); c.fillStyle = WOOD.mid; c.fill(); line(c, 2); c.restore(); }
  for (const s of [-1, 1]) { c.beginPath(); c.moveTo(cx + s * 50, cy + 10); c.lineTo(cx + s * 64, cy + 40); line(c, 6); }
  c.beginPath(); c.moveTo(cx - r * 0.9, cy - 74); c.bezierCurveTo(cx - r * 1.12, cy - 10, cx - r * 0.6, cy + 30, cx, cy + 30); c.bezierCurveTo(cx + r * 0.6, cy + 30, cx + r * 1.12, cy - 10, cx + r * 0.9, cy - 74); c.closePath();
  c.fillStyle = lin(c, cx - r, 0, cx + r, 0, ['#3a3a48', '#20202a', '#141418']); c.fill(); line(c, 2.6);
  shine(c, cx - 50, cy - 30, 8, 22, 0.12, 0.3);
  ell(c, cx, cy - 74, r * 0.92, 16); c.fillStyle = '#2b2b36'; c.fill(); line(c, 2.6);
  ell(c, cx, cy - 72, r * 0.8, 11); c.fillStyle = '#62d84a'; c.fill();
  ell(c, cx, cy - 74, r * 0.6, 6); c.fillStyle = 'rgba(200,255,150,0.45)'; c.fill();

  // two bookcases with their shelves, and the cat asleep on the right one
  for (const C of [CASE_L, CASE_R]) bookcase(c, C);
  cat(c, 1062, CASE_TOP);

  // light: moonlight from the window, firelight from below the cauldron, dark corners
  c.save(); c.globalCompositeOperation = 'soft-light';
  let g = c.createRadialGradient(600, 200, 40, 600, 300, 520); g.addColorStop(0, 'rgba(160,180,255,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, W, H);
  c.restore();
  g = c.createRadialGradient(W / 2, H * 0.55, 300, W / 2, H * 0.55, 820); g.addColorStop(0, 'rgba(10,6,20,0)'); g.addColorStop(1, 'rgba(10,6,20,0.55)'); c.fillStyle = g; c.fillRect(0, 0, W, H);
  return cv;
}

function bookcase(c, C) {
  const w = C.x1 - C.x0;
  rr(c, C.x0, CASE_TOP, w, 616 - CASE_TOP, 4); c.fillStyle = WOOD.mid; c.fill(); line(c, 2.4);
  rr(c, C.x0 + INSET, CASE_TOP + 12, w - INSET * 2, 616 - CASE_TOP - 26, 2); c.fillStyle = '#2e1b18'; c.fill(); line(c, 1.8);
  // painted books and jars at the back of each shelf, too dark to be mistaken for the things
  for (let i = 0; i < 4; i++) {
    const top = i ? PLANKS[i - 1] + 14 : CASE_TOP + 12, bottom = PLANKS[i];
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(C.x0 + INSET, top, w - INSET * 2, 14);
    let x = C.x0 + INSET + 4, k = 0;
    while (x < C.x1 - INSET - 10) {
      const bw = 7 + hash2(C.x0 + k, i, 11) * 9, bh = (bottom - top) * (0.45 + hash2(k, i, 12) * 0.35);
      if (hash2(k, i, 13) > 0.25) { c.fillStyle = `hsla(${hash2(k, i, 14) * 360},28%,${16 + hash2(k, i, 15) * 10}%,1)`; c.fillRect(x, bottom - bh, bw, bh); }
      x += bw + 1; k++;
    }
  }
  for (const y of PLANKS) {
    rr(c, C.x0 + INSET - 2, y, w - INSET * 2 + 4, 14, 2); c.fillStyle = lin(c, 0, y, 0, y + 14, [WOOD.edge, WOOD.mid]); c.fill(); line(c, 1.8);
    c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(C.x0 + INSET, y + 14, w - INSET * 2, 5);
  }
  rr(c, C.x0 - 8, CASE_TOP - 12, w + 16, 16, 3); c.fillStyle = lin(c, 0, CASE_TOP - 12, 0, CASE_TOP + 4, [WOOD.edge, WOOD.mid]); c.fill(); line(c, 2.2);
  rr(c, C.x0 - 4, 596, w + 8, 20, 3); c.fillStyle = WOOD.dark; c.fill(); line(c, 2);
}

function web(c, x, y, s) {
  c.save(); c.translate(x, y); c.scale(s, 1); c.strokeStyle = 'rgba(230,230,255,0.25)'; c.lineWidth = 1;
  for (let a = 0; a <= 4; a++) { const t = a / 4 * Math.PI / 2; c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(t) * 90, Math.sin(t) * 90); c.stroke(); }
  for (let r = 22; r <= 88; r += 22) { c.beginPath(); for (let a = 0; a <= 4; a++) { const t = a / 4 * Math.PI / 2; c.lineTo(Math.cos(t) * r, Math.sin(t) * r); } c.stroke(); }
  c.restore();
}

function cat(c, x, y) {
  c.save(); c.translate(x, y);
  c.beginPath(); c.moveTo(-50, -4); c.bezierCurveTo(-60, -10, -64, -24, -50, -26); line(c, 9); c.beginPath(); c.moveTo(-50, -4); c.bezierCurveTo(-60, -10, -64, -24, -50, -26); c.strokeStyle = '#3a3346'; c.lineWidth = 6; c.stroke();
  c.beginPath(); c.moveTo(-46, 0); c.bezierCurveTo(-50, -38, 30, -44, 36, -4); c.closePath(); fill(c, '#3a3346');
  ell(c, 30, -14, 16, 13); fill(c, '#3a3346');
  for (const s of [-1, 1]) { c.beginPath(); c.moveTo(30 + s * 5, -24); c.lineTo(30 + s * 13, -34); c.lineTo(30 + s * 15, -20); c.closePath(); fill(c, '#3a3346'); }
  for (const s of [-1, 1]) { c.beginPath(); c.arc(30 + s * 6, -14, 3.4, 0.2, Math.PI - 0.2); c.strokeStyle = '#f0d27a'; c.lineWidth = 1.6; c.stroke(); }
  ell(c, 30, -9, 1.6, 1.2); c.fillStyle = '#e88aa0'; c.fill();
  c.restore();
}

// ---------- the live room ----------
// The cauldron's bubbles and steam, the fire's glow, motes of dust in the moonlight.
export function drawRoomLive(c, t) {
  const { x: cx, y: cy, r } = CAULDRON;
  c.save(); c.globalCompositeOperation = 'lighter';
  const f = 0.5 + Math.sin(t * 7) * 0.08 + Math.sin(t * 17) * 0.05;
  let g = c.createRadialGradient(cx, cy + 40, 6, cx, cy + 30, 150); g.addColorStop(0, `rgba(255,150,60,${0.55 * f})`); g.addColorStop(1, 'rgba(255,110,40,0)');
  c.fillStyle = g; c.fillRect(cx - 160, cy - 120, 320, 260);
  g = c.createRadialGradient(cx, cy - 74, 10, cx, cy - 90, 150); g.addColorStop(0, 'rgba(120,255,90,0.22)'); g.addColorStop(1, 'rgba(80,255,60,0)');
  c.fillStyle = g; c.fillRect(cx - 160, cy - 240, 320, 240);
  c.restore();
  for (let i = 0; i < 4; i++) {
    const s = 1 + i * 0.6 + Math.sin(t * 6 + i) * 0.4;
    const fx = cx - 24 + i * 16, fy = cy + 26;
    c.beginPath(); c.moveTo(fx - 8 * s, fy); c.quadraticCurveTo(fx, fy - 26 * s - Math.sin(t * 9 + i) * 4, fx + 8 * s, fy); c.fillStyle = i % 2 ? '#ffb33d' : '#ff7a2e'; c.fill();
  }
  for (let i = 0; i < 6; i++) {
    const p = (t * 0.5 + i / 6) % 1, bx = cx + Math.sin(i * 2.1) * r * 0.6;
    const rr2 = 3 + (i % 3) * 2 + p * 3;
    ell(c, bx, cy - 74 - p * 4, rr2, rr2 * 0.7); c.fillStyle = `rgba(190,255,150,${(1 - p) * 0.9})`; c.fill();
  }
  for (let i = 0; i < 5; i++) {
    const p = (t * 0.08 + i / 5) % 1, sx = cx + Math.sin(i * 3 + t * 0.5) * 30, sy = cy - 90 - p * 220;
    ell(c, sx + Math.sin(p * 6 + i) * 20, sy, 18 + p * 30, 10 + p * 16); c.fillStyle = `rgba(200,255,200,${0.08 * (1 - p)})`; c.fill();
  }
  for (let i = 0; i < 26; i++) {
    const x = 470 + ((hash2(i, 1, 21) * 300 + t * (6 + hash2(i, 2, 21) * 8)) % 300) - 20;
    const y = 120 + ((hash2(i, 3, 21) * 420 + t * (4 + hash2(i, 4, 21) * 6)) % 420);
    const a = 0.25 + Math.sin(t * 2 + i) * 0.2;
    c.fillStyle = `rgba(230,236,255,${a})`; c.fillRect(x + Math.sin(t + i) * 8, y, 1.6, 1.6);
  }
}

export function drawShadow(c, it) {
  const t = THING[it.kind];
  ell(c, Math.sin(it.rot) * 4, 1, t.w * 0.42, 4.5);
  c.fillStyle = 'rgba(10,4,16,0.28)'; c.fill();
}
