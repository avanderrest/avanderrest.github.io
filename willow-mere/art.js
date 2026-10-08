/* Willow Mere: the paint. Everything on screen is drawn here with plain canvas calls: the
   land and the water are painted once per lake into two big canvases, and the boat, the
   birds, the litter and the rafts are small functions called every frame. Seen from above
   and a little to the south, so trees stand up the screen and banks show their faces on
   the far shore. Nothing in here knows the rules; view.js decides what goes where. */

import { W, H, CELL, outline, clamp, PULL, STROKE } from './sim.js';
import { streamFor } from '../lib/rng.js';

// ---------- helpers ----------
export function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
const TAU = Math.PI * 2;
function path(g, pts, close = true) { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); if (close) g.closePath(); }
function smoothPath(g, pts, close = true) {
  // a path through the midpoints, so a polygon of a few hundred points reads as a curve
  g.beginPath();
  const n = pts.length, at = (i) => pts[(i + n) % n];
  const m0 = mid(at(0), at(1));
  g.moveTo(m0.x, m0.y);
  for (let i = 1; i < (close ? n + 1 : n - 1); i++) { const p = at(i), m = mid(p, at(i + 1)); g.quadraticCurveTo(p.x, p.y, m.x, m.y); }
  if (close) g.closePath();
}
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
function ell(g, x, y, rx, ry, rot = 0) { g.beginPath(); g.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU); }
function circ(g, x, y, r) { g.beginPath(); g.arc(x, y, Math.max(0.1, r), 0, TAU); }
const hexRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
export function mixHex(a, b, t) {
  const A = hexRgb(a), B = hexRgb(b);
  return `rgb(${Math.round(A[0] + (B[0] - A[0]) * t)},${Math.round(A[1] + (B[1] - A[1]) * t)},${Math.round(A[2] + (B[2] - A[2]) * t)})`;
}
const pick = (rnd, a) => a[Math.floor(rnd() * a.length)];

// The stretches of each outline that really are shore (where one shape's edge runs out
// into another's water, it is not), as open polylines.
export function shoreRuns(lake) {
  const runs = [];
  for (const sh of lake.shapes) {
    const pts = outline(sh, sh.kind === 'lake' ? 520 : 260);
    let cur = [];
    for (let i = 0; i <= pts.length; i++) {
      const p = pts[i % pts.length];
      if (Math.abs(lake.sdAt(p.x, p.y)) < 9) cur.push(p);
      else { if (cur.length > 3) runs.push(cur); cur = []; }
    }
    if (cur.length > 3) runs.push(cur);
  }
  return runs;
}

// ---------- palettes ----------
const LEAF = [
  ['#2f5a3a', '#4a7d45', '#6f9e4f', '#9cc06a'],
  ['#3b5a2c', '#5d7f3a', '#86a447', '#b5c766'],
  ['#28503f', '#3d6e55', '#5b8f68', '#86b083'],
  ['#3f5a30', '#62803c', '#8aa650', '#c2c978'],
];
const PINE = ['#1f4337', '#2c5a46', '#437657', '#679872'];
const BIRCH = ['#4d7a3f', '#6f9a4c', '#97ba5e', '#c3d77d'];
const FLOWERS = ['#f4f1e6', '#f3e6a0', '#c9a9e0', '#f2b5c4', '#9fb8ec', '#f6d36b'];

// ---------- the land ----------
// Painted once per lake. Returns the canvas and what the page needs to know about it
// (trees for the reflections, the cottage windows for the night, reeds for the insects).
export function paintLand(lake) {
  const rnd = streamFor(lake.seed, 'decor');
  const sd = (x, y) => lake.sdAt(x, y);
  const land = makeCanvas(W, H), g = land.getContext('2d');
  const mask = makeCanvas(W, H), m = mask.getContext('2d');
  m.fillStyle = '#000'; m.fillRect(0, 0, W, H);
  m.globalCompositeOperation = 'destination-out';
  for (const sh of [lake.main, ...lake.bays]) { smoothPath(m, outline(sh, 360)); m.fill(); }
  m.globalCompositeOperation = 'source-over';
  for (const sh of lake.islands) { smoothPath(m, outline(sh, 200)); m.fill(); }

  // grass: a base, broad soft patches of light and shade, then thousands of small dabs
  g.fillStyle = '#7ea459'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 260; i++) {
    const x = rnd() * W, y = rnd() * H, r = 70 + rnd() * 220;
    const col = pick(rnd, ['rgba(146,186,98,0.32)', 'rgba(104,146,74,0.3)', 'rgba(168,196,108,0.24)', 'rgba(92,132,70,0.26)']);
    const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 14000; i++) {
    const x = rnd() * W, y = rnd() * H;
    g.fillStyle = pick(rnd, ['#6d9450', '#8db463', '#a3c272', '#5f8746', '#7aa457', '#b2cd7e']);
    g.globalAlpha = 0.25 + rnd() * 0.35;
    ell(g, x, y, 1.5 + rnd() * 3.5, 1 + rnd() * 1.6, -0.3 + rnd() * 0.6); g.fill();
  }
  g.globalAlpha = 1;
  // grass tufts: little upward strokes
  g.lineCap = 'round';
  for (let i = 0; i < 2600; i++) {
    const x = rnd() * W, y = rnd() * H;
    g.strokeStyle = pick(rnd, ['#5c8443', '#93b867', '#6f9a4f', '#a9c77a']); g.lineWidth = 1.2;
    for (let k = 0; k < 4; k++) { const dx = (k - 1.5) * 1.8; g.beginPath(); g.moveTo(x + dx, y); g.quadraticCurveTo(x + dx * 1.6, y - 4, x + dx * 2.4 + (rnd() - 0.5) * 2, y - 6 - rnd() * 3); g.stroke(); }
  }
  // the path from the cottage door to the jetty
  const J = lake.jetty, C = lake.cottage;
  const door = { x: C.x - 4, y: C.y + 4 };
  const pa = { x: J.base.x + J.dx * 10, y: J.base.y + J.dy * 10 };
  const ctrl = { x: (door.x + pa.x) / 2 + (rnd() - 0.5) * 60, y: (door.y + pa.y) / 2 + (rnd() - 0.5) * 40 };
  g.strokeStyle = '#a88d62'; g.lineWidth = 24; g.beginPath(); g.moveTo(door.x, door.y); g.quadraticCurveTo(ctrl.x, ctrl.y, pa.x, pa.y); g.lineTo(J.base.x, J.base.y); g.stroke();
  g.strokeStyle = '#c4ac80'; g.lineWidth = 16; g.stroke();
  for (let i = 0; i < 60; i++) {
    const t = rnd(), x = (1 - t) * (1 - t) * door.x + 2 * (1 - t) * t * ctrl.x + t * t * pa.x, y = (1 - t) * (1 - t) * door.y + 2 * (1 - t) * t * ctrl.y + t * t * pa.y;
    g.fillStyle = pick(rnd, ['#d8c39a', '#9a8460', '#b9a37a']); ell(g, x + (rnd() - 0.5) * 12, y + (rnd() - 0.5) * 12, 1.5 + rnd() * 2, 1 + rnd() * 1.2); g.fill();
  }
  const onPath = (x, y) => { for (let t = 0; t <= 1; t += 0.05) { const px = (1 - t) * (1 - t) * door.x + 2 * (1 - t) * t * ctrl.x + t * t * pa.x, py = (1 - t) * (1 - t) * door.y + 2 * (1 - t) * t * ctrl.y + t * t * pa.y; if (Math.hypot(px - x, py - y) < 26) return true; } return false; };

  // cut the water out
  g.globalCompositeOperation = 'destination-in'; g.drawImage(mask, 0, 0); g.globalCompositeOperation = 'source-over';

  // the bank: seen from the south, so far shores show an earth face dropping to the water
  const face = makeCanvas(W, H), f = face.getContext('2d');
  f.drawImage(mask, 0, 9);
  f.globalCompositeOperation = 'destination-out'; f.drawImage(mask, 0, 0);
  f.globalCompositeOperation = 'source-in';
  const fg = f.createLinearGradient(0, 0, 0, H); fg.addColorStop(0, '#8a5d3a'); fg.addColorStop(1, '#7c5233');
  f.fillStyle = fg; f.fillRect(0, 0, W, H);
  f.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < 9000; i++) { f.fillStyle = pick(rnd, ['#5e3d24', '#a0714a', '#6e4a2e']); f.fillRect(rnd() * W, rnd() * H, 1.2, 3 + rnd() * 5); }
  g.drawImage(face, 0, 0);
  const runs = shoreRuns(lake);
  const lip = makeCanvas(W, H), l = lip.getContext('2d');
  l.lineJoin = 'round'; l.lineCap = 'round';
  // in short lengths of slightly different widths, so the edge is not drawn with a ruler
  const wob = streamFor(lake.seed, 'bank');
  for (const [w, col] of [[28, '#a7c574'], [14, '#8b6343'], [6, '#5d3c24']]) {
    l.strokeStyle = col;
    for (const r of runs) for (let i = 0; i < r.length - 1; i += 9) {
      l.lineWidth = w * (0.75 + wob() * 0.5);
      smoothPath(l, r.slice(i, i + 11), false); l.stroke();
    }
  }
  l.globalCompositeOperation = 'destination-in'; l.drawImage(mask, 0, 0);
  g.drawImage(lip, 0, 0);

  // rocks along the shore, half in the water
  for (let i = 0; i < 130; i++) {
    const r = pick(rnd, runs), p = r[Math.floor(rnd() * r.length)];
    if (Math.hypot(p.x - J.shore.x, p.y - J.shore.y) < 60) continue;
    const n = 1 + Math.floor(rnd() * 3);
    for (let k = 0; k < n; k++) drawRock(g, p.x + (rnd() - 0.5) * 22, p.y + (rnd() - 0.5) * 14, 5 + rnd() * 9, rnd() < 0.5, rnd);
  }

  // what grows: trees, bushes, flowers, on a jittered grid
  const items = [];
  const nests = Object.values(lake.nests), homes = Object.values(lake.homes);
  const clearOf = (x, y) => Math.hypot(x - C.x, y - C.y) > 110 && !onPath(x, y)
    && homes.every((h) => Math.hypot(x - h.home.x, y - h.home.y) > 40) && nests.every((n) => Math.hypot(x - n.nest.x, y - n.nest.y) > 30)
    && Math.hypot(x - J.base.x, y - J.base.y) > 50;
  const GRID = 44;
  for (let gy = -1; gy < H / GRID + 2; gy++) for (let gx = -1; gx < W / GRID + 1; gx++) {
    const x = (gx + rnd()) * GRID, y = (gy + rnd()) * GRID, d = sd(x, y);
    if (d > -16 || !clearOf(x, y)) continue;
    const inland = -d;
    const pTree = inland < 40 ? 0.16 : inland < 120 ? 0.42 : inland < 220 ? 0.62 : 0.85;
    const roll = rnd();
    if (roll < pTree) {
      const kindR = rnd();
      const type = kindR < 0.55 ? 'oak' : kindR < 0.84 ? 'pine' : 'birch';
      const r = type === 'pine' ? 20 + rnd() * 14 : type === 'birch' ? 18 + rnd() * 10 : 24 + rnd() * 18;
      items.push({ k: 'tree', type, x, y, r, pal: type === 'oak' ? pick(rnd, LEAF) : type === 'pine' ? PINE : BIRCH, seed: Math.floor(rnd() * 1e9) });
    } else if (roll < pTree + 0.22) items.push({ k: 'bush', x, y, r: 9 + rnd() * 9, pal: pick(rnd, LEAF), berries: rnd() < 0.3 ? pick(rnd, ['#c43d4b', '#f2f0e6', '#6a3d8a']) : null, seed: Math.floor(rnd() * 1e9) });
    else if (roll < pTree + 0.4) items.push({ k: 'flowers', x, y, seed: Math.floor(rnd() * 1e9) });
  }
  // a few trees right down by the water on the far bank, for the reflections
  for (let i = 0; i < 70; i++) {
    const r = pick(rnd, runs), p = r[Math.floor(rnd() * r.length)];
    const x = p.x + (rnd() - 0.5) * 20, y = p.y - 26 - rnd() * 30;
    if (sd(x, y) > -14 || !clearOf(x, y)) continue;
    const type = rnd() < 0.7 ? 'oak' : 'birch';
    items.push({ k: 'tree', type, x, y, r: type === 'birch' ? 18 + rnd() * 8 : 22 + rnd() * 14, pal: type === 'birch' ? BIRCH : pick(rnd, LEAF), seed: Math.floor(rnd() * 1e9) });
  }
  // the cottage, its garden, and the homes of the creatures you ferry
  const cottage = { k: 'cottage', x: C.x, y: C.y };
  items.push(cottage);
  for (let i = 0; i < 16; i++) items.push({ k: 'flowers', x: C.x + (rnd() - 0.5) * 150, y: C.y + 10 + rnd() * 40, seed: Math.floor(rnd() * 1e9) });
  items.push({ k: 'bramble', x: lake.homes.hedgehog.home.x, y: lake.homes.hedgehog.home.y, seed: 3 });
  items.push({ k: 'stump', x: lake.homes.mouse.home.x, y: lake.homes.mouse.home.y });
  for (const n of nests) items.push({ k: 'nest', x: n.nest.x, y: n.nest.y });

  items.sort((a, b) => a.y - b.y);
  for (const it of items) if (it.k === 'tree') drawTreeShadow(g, it);
  for (const it of items) {
    if (it.k === 'tree') drawTree(g, it);
    else if (it.k === 'bush') drawBush(g, it);
    else if (it.k === 'flowers') drawFlowers(g, it);
    else if (it.k === 'cottage') drawCottage(g, it.x, it.y);
    else if (it.k === 'bramble') drawBramble(g, it.x, it.y);
    else if (it.k === 'stump') drawStump(g, it.x, it.y);
    else if (it.k === 'nest') drawNest(g, it.x, it.y);
  }

  // reeds in the shallows: everywhere a little, thick round the nests
  const reeds = [];
  for (let i = 0; i < 60; i++) {
    const r = pick(rnd, runs), p = r[Math.floor(rnd() * r.length)];
    if (Math.hypot(p.x - J.shore.x, p.y - J.shore.y) < 90) continue;
    reeds.push({ x: p.x, y: p.y + 4, n: 8 + Math.floor(rnd() * 12), w: 18 + rnd() * 20 });
  }
  for (const n of nests) for (let i = 0; i < 6; i++) reeds.push({ x: n.shore.x + (rnd() - 0.5) * 90, y: n.shore.y + (rnd() - 0.5) * 50, n: 14, w: 26 });
  reeds.sort((a, b) => a.y - b.y);
  for (const rd of reeds) drawReeds(g, rd, rnd);

  drawJetty(g, J);

  const windows = [{ x: C.x - 28, y: C.y - 14 }, { x: C.x + 28, y: C.y - 14 }];
  return { canvas: land, mask, trees: items.filter((i) => i.k === 'tree'), reeds, runs, windows };
}

function drawRock(g, x, y, r, mossy, rnd) {
  g.fillStyle = 'rgba(30,40,30,0.25)'; ell(g, x + r * 0.25, y + r * 0.35, r * 1.05, r * 0.6); g.fill();
  g.fillStyle = '#7d7f77'; ell(g, x, y, r, r * 0.72); g.fill();
  g.fillStyle = '#9b9d93'; ell(g, x - r * 0.18, y - r * 0.2, r * 0.75, r * 0.5); g.fill();
  g.fillStyle = '#c0c1b6'; ell(g, x - r * 0.35, y - r * 0.35, r * 0.3, r * 0.18, -0.3); g.fill();
  if (mossy) { g.fillStyle = 'rgba(110,150,70,0.8)'; ell(g, x + (rnd() - 0.5) * r * 0.5, y - r * 0.4, r * 0.5, r * 0.25); g.fill(); }
}

function blobsFor(t) {
  const r = streamFor(t.seed, 'blobs'), out = [], n = t.type === 'birch' ? 9 : 7;
  for (let i = 0; i < n; i++) { const a = r() * TAU, d = r() * t.r * (t.type === 'birch' ? 0.65 : 0.55); out.push({ x: Math.cos(a) * d, y: Math.sin(a) * d * 0.85, s: t.r * (t.type === 'birch' ? 0.34 + r() * 0.2 : 0.42 + r() * 0.22) }); }
  out.push({ x: 0, y: 0, s: t.r * 0.62 });
  return out;
}
function drawTreeShadow(g, t) {
  g.fillStyle = 'rgba(28,52,30,0.26)';
  ell(g, t.x + t.r * 0.55, t.y + 3, t.r * 1.15, t.r * 0.42, 0.1); g.fill();
}
export function drawTree(g, t, flat = null) {
  const { x, y, r, pal } = t;
  if (t.type === 'pine') {
    const top = y - r * 3.1;
    g.fillStyle = flat || '#5a3e2a'; g.fillRect(x - r * 0.12, y - r * 0.6, r * 0.24, r * 0.6);
    for (let i = 0; i < 4; i++) {
      const by = y - r * 0.45 - i * r * 0.62, w = r * (1.05 - i * 0.2), ty = by - r * 1.05;
      if (flat) { g.fillStyle = flat; path(g, [{ x: x - w, y: by }, { x: x + w, y: by }, { x, y: ty }]); g.fill(); continue; }
      g.fillStyle = pal[0]; path(g, [{ x: x - w, y: by + 2 }, { x: x + w, y: by + 2 }, { x, y: ty }]); g.fill();
      g.fillStyle = pal[1]; path(g, [{ x: x - w * 0.92, y: by }, { x: x + w * 0.4, y: by - 2 }, { x, y: ty + 2 }]); g.fill();
      g.fillStyle = pal[2]; path(g, [{ x: x - w * 0.7, y: by - 3 }, { x: x - w * 0.05, y: by - 5 }, { x: x - 1, y: ty + 6 }]); g.fill();
      g.strokeStyle = pal[3]; g.lineWidth = 1; g.globalAlpha = 0.5;
      g.beginPath(); g.moveTo(x - w * 0.55, by - 4); g.lineTo(x - 2, ty + 9); g.stroke(); g.globalAlpha = 1;
    }
    void top;
    return;
  }
  const birch = t.type === 'birch';
  const th = r * (birch ? 1.25 : 0.95), cy = y - th - r * 0.35;
  // trunk
  g.fillStyle = flat || (birch ? '#ebe6da' : '#6b4a32');
  g.beginPath(); g.moveTo(x - r * (birch ? 0.09 : 0.16), y); g.lineTo(x - r * 0.08, cy + r * 0.2); g.lineTo(x + r * 0.08, cy + r * 0.2); g.lineTo(x + r * (birch ? 0.09 : 0.16), y); g.closePath(); g.fill();
  if (!flat) {
    if (birch) { g.fillStyle = '#2c2a28'; const rr = streamFor(t.seed, 'bark'); for (let i = 0; i < 6; i++) g.fillRect(x - r * 0.09 + rr() * r * 0.1, y - rr() * th, r * 0.1, 1.4); }
    else { g.fillStyle = '#4c3322'; g.fillRect(x + r * 0.03, cy + r * 0.2, r * 0.1, y - cy - r * 0.2); }
    // roots
    g.strokeStyle = birch ? '#cfc8b8' : '#5a3d28'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x - r * 0.14, y - 1); g.lineTo(x - r * 0.3, y + 2); g.moveTo(x + r * 0.14, y - 1); g.lineTo(x + r * 0.32, y + 2); g.stroke();
  }
  const blobs = blobsFor(t);
  if (flat) { g.fillStyle = flat; for (const b of blobs) { circ(g, x + b.x, cy + b.y, b.s); g.fill(); } return; }
  g.fillStyle = pal[0]; for (const b of blobs) { circ(g, x + b.x + 1.5, cy + b.y + 3, b.s); g.fill(); }
  g.fillStyle = pal[1]; for (const b of blobs) { circ(g, x + b.x, cy + b.y, b.s * 0.94); g.fill(); }
  g.fillStyle = pal[2]; for (const b of blobs) { circ(g, x + b.x - b.s * 0.22, cy + b.y - b.s * 0.26, b.s * 0.62); g.fill(); }
  g.fillStyle = pal[3];
  const rr = streamFor(t.seed, 'leaf');
  for (const b of blobs) {
    ell(g, x + b.x - b.s * 0.38, cy + b.y - b.s * 0.42, b.s * 0.26, b.s * 0.16, -0.5); g.fill();
    if (rr() < 0.6) { g.globalAlpha = 0.6; circ(g, x + b.x + (rr() - 0.6) * b.s, cy + b.y + (rr() - 0.7) * b.s, 1.6); g.fill(); g.globalAlpha = 1; }
  }
  // leaf scallops along the shaded underside
  g.strokeStyle = pal[0]; g.lineWidth = 1.2; g.globalAlpha = 0.55;
  for (const b of blobs) { g.beginPath(); g.arc(x + b.x, cy + b.y, b.s * 0.8, 0.4, 1.4); g.stroke(); }
  g.globalAlpha = 1;
}
function drawBush(g, b) {
  const rr = streamFor(b.seed, 'bush'), blobs = [];
  for (let i = 0; i < 5; i++) blobs.push({ x: (rr() - 0.5) * b.r * 1.3, y: (rr() - 0.5) * b.r * 0.6, s: b.r * (0.5 + rr() * 0.3) });
  const cy = b.y - b.r * 0.5;
  g.fillStyle = 'rgba(28,52,30,0.25)'; ell(g, b.x + b.r * 0.35, b.y + 1, b.r * 1.1, b.r * 0.4); g.fill();
  g.fillStyle = b.pal[0]; for (const o of blobs) { circ(g, b.x + o.x + 1, cy + o.y + 2, o.s); g.fill(); }
  g.fillStyle = b.pal[1]; for (const o of blobs) { circ(g, b.x + o.x, cy + o.y, o.s * 0.92); g.fill(); }
  g.fillStyle = b.pal[2]; for (const o of blobs) { circ(g, b.x + o.x - o.s * 0.25, cy + o.y - o.s * 0.3, o.s * 0.5); g.fill(); }
  if (b.berries) { g.fillStyle = b.berries; for (let i = 0; i < 7; i++) { circ(g, b.x + (rr() - 0.5) * b.r * 1.4, cy + (rr() - 0.5) * b.r * 0.9, 1.4); g.fill(); } }
}
function drawFlowers(g, f) {
  const rr = streamFor(f.seed, 'fl'), col = pick(rr, FLOWERS), n = 5 + Math.floor(rr() * 9);
  for (let i = 0; i < n; i++) {
    const x = f.x + (rr() - 0.5) * 34, y = f.y + (rr() - 0.5) * 18;
    g.strokeStyle = '#5d8a42'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y + 4); g.lineTo(x, y); g.stroke();
    g.fillStyle = col; circ(g, x, y, 1.8 + rr() * 1.2); g.fill();
    g.fillStyle = 'rgba(255,240,180,0.9)'; circ(g, x, y, 0.7); g.fill();
  }
}
function drawReeds(g, rd, rnd) {
  g.lineCap = 'round';
  for (let i = 0; i < rd.n; i++) {
    const bx = rd.x + (rnd() - 0.5) * rd.w, by = rd.y + (rnd() - 0.5) * 10, h = 14 + rnd() * 18, lean = (rnd() - 0.5) * 8;
    g.strokeStyle = pick(rnd, ['#5f8a3a', '#7aa04a', '#93b55a', '#4d7533', '#a8b867']); g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(bx, by); g.quadraticCurveTo(bx + lean * 0.3, by - h * 0.6, bx + lean, by - h); g.stroke();
    if (rnd() < 0.28) { g.fillStyle = '#6b4428'; ell(g, bx + lean * 0.9, by - h + 2, 2.2, 5, lean * 0.04); g.fill(); g.fillStyle = '#8a5a35'; ell(g, bx + lean * 0.9 - 0.6, by - h + 1, 0.9, 3.5); g.fill(); }
  }
}
function drawCottage(g, x, y) {
  // shadow, walls (the south face), then the roof seen from above
  g.fillStyle = 'rgba(30,45,30,0.3)'; g.beginPath(); g.moveTo(x - 48, y + 2); g.lineTo(x + 52, y + 2); g.lineTo(x + 76, y - 40); g.lineTo(x + 52, y - 88); g.closePath(); g.fill();
  g.fillStyle = '#9b8a72'; g.fillRect(x - 46, y - 6, 92, 6);
  g.fillStyle = '#efe3c6'; g.fillRect(x - 46, y - 34, 92, 28);
  g.fillStyle = 'rgba(160,130,90,0.25)'; for (let i = 0; i < 18; i++) g.fillRect(x - 44 + (i * 37) % 88, y - 32 + (i * 13) % 24, 6, 3);
  g.fillStyle = '#5a7552'; g.beginPath(); g.moveTo(x - 11, y - 1); g.lineTo(x - 11, y - 18); g.arc(x - 4, y - 18, 7, Math.PI, 0); g.lineTo(x + 3, y - 1); g.closePath(); g.fill();
  g.fillStyle = '#e8c35a'; circ(g, x + 0.5, y - 9, 1.2); g.fill();
  for (const wx of [x - 36, x + 20]) {
    g.fillStyle = '#f7f3ea'; g.fillRect(wx - 1, y - 27, 18, 14);
    g.fillStyle = '#5d7684'; g.fillRect(wx + 1, y - 25, 14, 10);
    g.fillStyle = '#f7f3ea'; g.fillRect(wx + 7, y - 25, 2, 10); g.fillRect(wx + 1, y - 21, 14, 2);
    g.fillStyle = '#7a5534'; g.fillRect(wx - 2, y - 13, 20, 4);
    for (let k = 0; k < 5; k++) { g.fillStyle = FLOWERS[(k + (wx > x ? 2 : 0)) % FLOWERS.length]; circ(g, wx + 1 + k * 4, y - 14, 2); g.fill(); }
  }
  // roof
  const top = y - 92, eave = y - 32;
  g.fillStyle = '#8f4a37'; g.fillRect(x - 52, top, 104, 30);
  g.fillStyle = '#b4624a'; g.fillRect(x - 52, top + 28, 104, eave - top - 28);
  g.strokeStyle = 'rgba(80,35,25,0.45)'; g.lineWidth = 1;
  for (let ry = top + 5; ry < eave; ry += 6) { g.beginPath(); g.moveTo(x - 52, ry); g.lineTo(x + 52, ry); g.stroke(); for (let rx = x - 52 + ((ry / 6) % 2) * 5; rx < x + 52; rx += 10) { g.beginPath(); g.moveTo(rx, ry); g.lineTo(rx, ry + 6); g.stroke(); } }
  g.fillStyle = '#6f3828'; g.fillRect(x - 53, top + 27, 106, 3);
  g.fillStyle = 'rgba(60,30,20,0.35)'; g.fillRect(x - 52, eave - 3, 104, 3);
  g.fillStyle = '#d58a6a'; g.fillRect(x - 52, top + 30, 104, 2);
  // chimney
  g.fillStyle = '#8a7b6c'; g.fillRect(x + 24, top - 4, 13, 22);
  g.fillStyle = '#6c5f53'; g.fillRect(x + 24, top - 4, 13, 4);
  g.fillStyle = '#3a3230'; g.fillRect(x + 27, top - 3, 7, 2);
}
function drawBramble(g, x, y) {
  g.fillStyle = 'rgba(28,52,30,0.28)'; ell(g, x + 6, y + 3, 26, 9); g.fill();
  const rr = streamFor(7, 'bramble');
  for (let i = 0; i < 14; i++) { g.fillStyle = pick(rr, ['#2f5a33', '#3f6d3a', '#527f43']); circ(g, x + (rr() - 0.5) * 36, y - 8 + (rr() - 0.5) * 16, 6 + rr() * 5); g.fill(); }
  g.strokeStyle = '#6d4a3a'; g.lineWidth = 1.2;
  for (let i = 0; i < 8; i++) { g.beginPath(); g.arc(x + (rr() - 0.5) * 30, y - 8 + (rr() - 0.5) * 12, 6 + rr() * 6, rr() * 3, rr() * 3 + 2); g.stroke(); }
  for (let i = 0; i < 10; i++) { g.fillStyle = rr() < 0.5 ? '#3a1f3f' : '#b93a48'; circ(g, x + (rr() - 0.5) * 34, y - 8 + (rr() - 0.5) * 16, 1.8); g.fill(); }
  g.fillStyle = '#2a1d14'; ell(g, x, y - 2, 7, 5); g.fill();
  g.fillStyle = '#c9a36a'; g.fillRect(x + 12, y - 2, 2, 10); g.fillStyle = '#e6d3a8'; g.fillRect(x + 8, y - 4, 12, 6);
}
function drawStump(g, x, y) {
  g.fillStyle = 'rgba(28,52,30,0.3)'; ell(g, x + 8, y + 2, 22, 8); g.fill();
  g.fillStyle = '#6d4a30'; g.fillRect(x - 16, y - 22, 32, 22); ell(g, x, y, 16, 5); g.fill();
  g.fillStyle = '#5a3c26'; for (let i = 0; i < 5; i++) g.fillRect(x - 13 + i * 6, y - 20, 1.6, 20);
  g.fillStyle = '#c49a6c'; ell(g, x, y - 22, 16, 6); g.fill();
  g.strokeStyle = '#9b7148'; g.lineWidth = 1; for (const r of [11, 7, 3]) { ell(g, x, y - 22, r, r * 0.38); g.stroke(); }
  // a little round door, with a knob
  g.fillStyle = '#4f7a4a'; g.beginPath(); g.arc(x, y - 6, 7, Math.PI, 0); g.lineTo(x + 7, y); g.lineTo(x - 7, y); g.closePath(); g.fill();
  g.fillStyle = '#e8c35a'; circ(g, x + 3.5, y - 4, 1); g.fill();
  g.fillStyle = '#7fae5a'; ell(g, x - 12, y - 22, 5, 2.5); g.fill();
}
function drawNest(g, x, y) {
  g.strokeStyle = '#8a6a44'; g.lineWidth = 1.4;
  const rr = streamFor(11, 'nest');
  g.fillStyle = '#5a4430'; ell(g, x, y, 11, 6); g.fill();
  for (let i = 0; i < 26; i++) { const a = rr() * TAU, r = 9 + rr() * 4; g.beginPath(); g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.55); g.lineTo(x + Math.cos(a + 0.6) * r, y + Math.sin(a + 0.6) * r * 0.55); g.stroke(); }
  g.fillStyle = '#f2ead8'; ell(g, x + 3, y - 1, 3, 1.4, 0.4); g.fill();
}
function drawJetty(g, J) {
  const ang = Math.atan2(J.end.y - J.base.y, J.end.x - J.base.x), L = Math.hypot(J.end.x - J.base.x, J.end.y - J.base.y) + 8;
  g.save(); g.translate(J.base.x, J.base.y); g.rotate(ang);
  g.save(); g.rotate(-ang); g.fillStyle = 'rgba(20,45,50,0.3)';
  g.translate(5, 9); g.rotate(ang); g.fillRect(10, -11, L - 10, 22); g.restore();
  g.fillStyle = '#4d3524';
  for (let s = 24; s < L; s += 30) { circ(g, s, -12, 3.2); g.fill(); circ(g, s, 12, 3.2); g.fill(); }
  g.fillStyle = '#8f6845'; g.fillRect(0, -11, L, 22);
  for (let s = 0; s < L; s += 6) { g.fillStyle = (s / 6) % 3 === 0 ? '#9d7550' : (s / 6) % 3 === 1 ? '#86603f' : '#957049'; g.fillRect(s, -11, 5, 22); }
  g.fillStyle = 'rgba(50,30,15,0.5)'; g.fillRect(0, -11, L, 1.5); g.fillRect(0, 9.5, L, 1.5);
  g.fillStyle = '#b48c62'; g.fillRect(0, -9, L, 1);
  g.restore();
}

// ---------- the water ----------
// Painted once per lake at half size: deep in the middle, pale in the shallows, brushed with
// soft strokes, and with the far bank's trees hanging upside down in it.
export function paintWater(lake, land) {
  const S = 0.5, c = makeCanvas(W * S, H * S), g = c.getContext('2d');
  const rnd = streamFor(lake.seed, 'water');
  const small = makeCanvas(lake.gw, lake.gh), sg = small.getContext('2d'), id = sg.createImageData(lake.gw, lake.gh);
  const stops = [[0, '#a1c6ae'], [0.1, '#86b8a8'], [0.35, '#66a0a0'], [0.7, '#4f8b97'], [1, '#467f8f']].map(([t, h]) => [t, hexRgb(h)]);
  for (let k = 0; k < lake.sd.length; k++) {
    const t = clamp(lake.sd[k] / 240, 0, 1);
    let i = 1; while (i < stops.length - 1 && stops[i][0] < t) i++;
    const [t0, a] = stops[i - 1], [t1, b] = stops[i], f = clamp((t - t0) / (t1 - t0), 0, 1);
    id.data[k * 4] = a[0] + (b[0] - a[0]) * f; id.data[k * 4 + 1] = a[1] + (b[1] - a[1]) * f; id.data[k * 4 + 2] = a[2] + (b[2] - a[2]) * f; id.data[k * 4 + 3] = 255;
  }
  sg.putImageData(id, 0, 0);
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(small, 0, 0, W * S, H * S);
  // brush strokes along the wind
  for (let i = 0; i < 3200; i++) {
    const x = rnd() * W, y = rnd() * H;
    if (lake.sdAt(x, y) < 4) continue;
    g.fillStyle = rnd() < 0.55 ? 'rgba(190,225,214,0.09)' : 'rgba(40,96,110,0.08)';
    ell(g, x * S, y * S, 5 + rnd() * 16, 0.8 + rnd() * 1.6, (rnd() - 0.5) * 0.25); g.fill();
  }
  // the sky in it: a soft pale wash toward the top left
  const sky = g.createLinearGradient(0, 0, W * S, H * S);
  sky.addColorStop(0, 'rgba(235,245,240,0.16)'); sky.addColorStop(0.5, 'rgba(235,245,240,0)'); sky.addColorStop(1, 'rgba(20,50,60,0.08)');
  g.fillStyle = sky; g.fillRect(0, 0, W * S, H * S);
  // reflections of trees standing on a shore with water below them
  try { g.filter = 'blur(4px)'; } catch (e) { /* older browsers: sharp reflections */ }
  g.save(); g.scale(S, S);
  // Seen from above and to the south, a tree's reflection starts at the waterline below it
  // and hangs down, foreshortened; only trees close above the water have one.
  for (const t of land.trees) {
    let shoreY = null;
    for (let yy = t.y; yy < t.y + 64; yy += 3) if (lake.sdAt(t.x, yy) > 2) { shoreY = yy; break; }
    if (shoreY == null || lake.sdAt(t.x, shoreY + 50) < 24) continue;
    g.save(); g.globalAlpha = 0.15;
    g.translate(0, shoreY + 4 + 0.55 * t.y); g.scale(1, -0.55);
    drawTree(g, t, '#2f5d52');
    g.restore();
  }
  g.restore();
  g.filter = 'none';
  // pale shallows right against the bank
  g.save(); g.scale(S, S); g.lineJoin = 'round';
  g.strokeStyle = 'rgba(205,228,210,0.35)'; g.lineWidth = 16;
  for (const r of land.runs) { smoothPath(g, r, false); g.stroke(); }
  g.restore();
  return c;
}

// ---------- lily pads and the little things on the water ----------
export function drawLily(g, p, t) {
  const a = p.a + Math.sin(t * 0.4 + p.ph) * 0.05;
  g.fillStyle = 'rgba(20,50,50,0.22)'; ell(g, p.x + 1.5, p.y + 2, p.r, p.r * 0.85); g.fill();
  g.fillStyle = p.dark ? '#4f8a45' : '#679d4f';
  g.beginPath(); g.moveTo(p.x, p.y); g.arc(p.x, p.y, p.r, a + 0.35, a + TAU - 0.05); g.closePath(); g.fill();
  g.fillStyle = p.dark ? '#64a053' : '#80b562';
  g.beginPath(); g.moveTo(p.x, p.y); g.arc(p.x, p.y, p.r * 0.72, a + 0.5, a + 2.6); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(40,80,40,0.4)'; g.lineWidth = 0.8;
  for (let k = 0; k < 5; k++) { const b = a + 0.6 + k * 1.15; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x + Math.cos(b) * p.r * 0.85, p.y + Math.sin(b) * p.r * 0.85); g.stroke(); }
  if (p.flower) {
    const fx = p.x + Math.cos(a + 3.6) * p.r * 0.3, fy = p.y + Math.sin(a + 3.6) * p.r * 0.3;
    for (let k = 0; k < 8; k++) { const b = k * TAU / 8 + p.ph; g.fillStyle = k % 2 ? p.flower : '#fff8f2'; ell(g, fx + Math.cos(b) * 3.2, fy + Math.sin(b) * 3.2, 3.4, 1.7, b); g.fill(); }
    g.fillStyle = '#f2cc4a'; circ(g, fx, fy, 1.8); g.fill();
  }
}
export function drawFrog(g, x, y, a) {
  g.save(); g.translate(x, y); g.rotate(a);
  g.fillStyle = '#4f8f3a'; ell(g, 0, 0, 5, 4); g.fill();
  g.strokeStyle = '#4f8f3a'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(-3, -3); g.lineTo(-6, -6); g.moveTo(-3, 3); g.lineTo(-6, 6); g.stroke();
  g.fillStyle = '#7cbf5a'; ell(g, 0.5, 0, 3.4, 2.4); g.fill();
  g.fillStyle = '#f1f0d0'; circ(g, 3.4, -2.2, 1.4); g.fill(); circ(g, 3.4, 2.2, 1.4); g.fill();
  g.fillStyle = '#1a1a1a'; circ(g, 3.8, -2.2, 0.7); g.fill(); circ(g, 3.8, 2.2, 0.7); g.fill();
  g.restore();
}

// ---------- litter ----------
export function drawLitter(g, l, t, s = 1) {
  const bob = Math.sin(t * 1.6 + l.ph) * 0.12;
  g.save(); g.translate(l.x, l.y); g.rotate(l.a + bob); g.scale(s, s);
  g.fillStyle = 'rgba(20,50,55,0.25)'; ell(g, 1.5, 2, 9, 5.5); g.fill();
  switch (l.kind) {
    case 'bottle': {
      const green = (l.id % 2) === 0;
      g.fillStyle = green ? 'rgba(80,150,95,0.9)' : 'rgba(205,232,238,0.85)';
      g.beginPath(); g.roundRect(-8, -3.4, 12, 6.8, 2.8); g.fill(); g.fillRect(3, -1.8, 4, 3.6);
      g.fillStyle = green ? '#d0d0c4' : '#3c6fd1'; g.fillRect(6.5, -2, 2.2, 4);
      g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(-6, -2.2, 8, 1);
      if (!green) { g.fillStyle = '#e25a4a'; g.fillRect(-4, -3.4, 4, 6.8); }
      break;
    }
    case 'can': {
      g.fillStyle = l.id % 2 ? '#d23c3c' : '#3b7dd8'; g.fillRect(-6, -3.4, 12, 6.8);
      g.fillStyle = '#cfd3d6'; ell(g, 6, 0, 1.6, 3.4); g.fill(); ell(g, -6, 0, 1.6, 3.4); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(-4, -2.4, 8, 1);
      g.fillStyle = '#f3f0e8'; g.fillRect(-2, -3.4, 3, 6.8);
      break;
    }
    case 'crisps': {
      g.fillStyle = l.id % 2 ? '#f2c230' : '#3f8fd8'; g.fillRect(-6, -5, 12, 10);
      g.fillStyle = '#d8d8d0'; for (let k = 0; k < 4; k++) { g.fillRect(-7.5, -5 + k * 2.5, 1.5, 1.4); g.fillRect(6, -4 + k * 2.5, 1.5, 1.4); }
      g.fillStyle = '#d6402f'; g.fillRect(-6, -1.2, 12, 2.4);
      g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(-4, -4, 2, 8);
      break;
    }
    case 'bag': {
      g.fillStyle = 'rgba(244,244,236,0.88)'; g.beginPath(); g.moveTo(-8, -5); g.quadraticCurveTo(0, -8, 7, -4); g.quadraticCurveTo(10, 2, 5, 6); g.quadraticCurveTo(-3, 8, -8, 4); g.quadraticCurveTo(-11, 0, -8, -5); g.fill();
      g.strokeStyle = 'rgba(160,170,170,0.7)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(-5, -2); g.lineTo(2, 1); g.moveTo(-2, 3); g.lineTo(4, -2); g.stroke();
      g.strokeStyle = 'rgba(244,244,236,0.9)'; g.lineWidth = 1.4; g.beginPath(); g.arc(-9, -1, 3, 1.5, 4.7); g.stroke();
      break;
    }
    case 'boot': {
      g.fillStyle = '#2f5d3a'; g.beginPath(); g.moveTo(-8, -3.5); g.lineTo(3, -3.5); g.lineTo(3, -6); g.quadraticCurveTo(9, -6, 9, 0); g.lineTo(9, 3.5); g.lineTo(-8, 3.5); g.closePath(); g.fill();
      g.fillStyle = '#1e3a25'; g.fillRect(-8, 2, 17, 1.6);
      g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(-6, -2.6, 8, 1);
      break;
    }
    case 'ball': {
      g.fillStyle = '#f6f4ee'; circ(g, 0, 0, 6.5); g.fill();
      g.fillStyle = '#2a2a2a'; for (const [x, y] of [[0, 0], [4, -3.5], [-4, -3.5], [4.5, 3.4], [-4.5, 3.4]]) { circ(g, x, y, x === 0 ? 2 : 1.2); g.fill(); }
      break;
    }
    case 'tyre': {
      g.strokeStyle = '#2a2a2a'; g.lineWidth = 6; circ(g, 0, 0, 9); g.stroke();
      g.strokeStyle = '#444'; g.lineWidth = 1; for (let k = 0; k < 12; k++) { const a = k * TAU / 12; g.beginPath(); g.moveTo(Math.cos(a) * 6.5, Math.sin(a) * 6.5); g.lineTo(Math.cos(a) * 11.5, Math.sin(a) * 11.5); g.stroke(); }
      g.fillStyle = 'rgba(80,120,110,0.5)'; circ(g, 0, 0, 5.5); g.fill();
      break;
    }
  }
  g.restore();
}

// ---------- birds ----------
export function drawBird(g, kind, x, y, a, t, ph = 0, opt = {}) {
  const bob = Math.sin(t * 2.2 + ph) * 0.6;
  g.save(); g.translate(x, y + bob); g.rotate(a);
  const shadow = (rx, ry) => { g.fillStyle = 'rgba(20,50,55,0.22)'; ell(g, 1.5, 2.5, rx, ry); g.fill(); };
  if (kind === 'duckling') {
    shadow(7, 5);
    g.fillStyle = '#f3d35b'; ell(g, 0, 0, 6.5, 5); g.fill();
    g.fillStyle = '#8a6a33'; ell(g, -1.5, 0, 4, 3); g.fill();
    g.fillStyle = '#f6dc6a'; circ(g, 5.5, 0, 3.6); g.fill();
    g.fillStyle = '#7d5f30'; ell(g, 5, 0, 2.2, 1.1); g.fill();
    g.fillStyle = '#e08a2e'; ell(g, 9.2, 0, 1.8, 1.2); g.fill();
    g.fillStyle = '#222'; circ(g, 6.3, -2.2, 0.7); g.fill(); circ(g, 6.3, 2.2, 0.7); g.fill();
  } else if (kind === 'cygnet') {
    shadow(8.5, 6);
    g.fillStyle = '#9d988f'; ell(g, 0, 0, 8, 6); g.fill();
    g.fillStyle = '#b8b3aa'; ell(g, -0.5, -0.5, 5.5, 4); g.fill();
    g.fillStyle = '#a7a39b'; circ(g, 7, 0, 3.8); g.fill();
    g.fillStyle = '#4c4a48'; ell(g, 10.5, 0, 2, 1.2); g.fill();
    g.fillStyle = '#222'; circ(g, 7.6, -2.2, 0.7); g.fill(); circ(g, 7.6, 2.2, 0.7); g.fill();
  } else if (kind === 'duck') {
    shadow(15, 9);
    g.fillStyle = '#6e5236'; path(g, [{ x: -13, y: -3 }, { x: -19, y: 0 }, { x: -13, y: 3 }]); g.fill();
    g.fillStyle = '#9a7652'; ell(g, 0, 0, 14, 8.5); g.fill();
    g.strokeStyle = '#6e5236'; g.lineWidth = 1;
    for (let k = 0; k < 6; k++) { g.beginPath(); g.arc(-8 + k * 3.2, (k % 2 ? 1 : -1) * 2.5, 2.4, 0.2, 2.8); g.stroke(); }
    g.fillStyle = '#3f62a8'; g.fillRect(-6, -8, 6, 1.6); g.fillRect(-6, 6.4, 6, 1.6);
    g.fillStyle = '#8a6a49'; circ(g, 12, 0, 5.5); g.fill();
    g.fillStyle = '#5c4430'; g.fillRect(10, -0.6, 7, 1.2);
    g.fillStyle = '#d98b3a'; ell(g, 18, 0, 3.4, 2.3); g.fill();
    g.fillStyle = '#222'; circ(g, 13.5, -3.6, 0.9); g.fill(); circ(g, 13.5, 3.6, 0.9); g.fill();
  } else if (kind === 'swan') {
    shadow(22, 12);
    g.fillStyle = '#d9d6cc'; ell(g, -1, 1, 21, 12); g.fill();
    g.fillStyle = '#f7f5ee'; ell(g, -2, -0.5, 19, 10.5); g.fill();
    g.fillStyle = '#e4e1d8'; ell(g, -8, -4, 9, 4, 0.2); g.fill(); ell(g, -8, 4, 9, 4, -0.2); g.fill();
    const nb = Math.sin(t * 0.9 + ph) * 1.5;
    g.strokeStyle = '#f7f5ee'; g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(12, 0); g.quadraticCurveTo(20, nb - 6, 24, nb); g.stroke();
    g.fillStyle = '#f7f5ee'; circ(g, 25, nb, 4.2); g.fill();
    g.fillStyle = '#e8742e'; ell(g, 30, nb, 3.6, 1.8); g.fill();
    g.fillStyle = '#222'; circ(g, 27, nb, 1.2); g.fill();
  } else if (kind === 'coot') {
    shadow(11, 8);
    g.fillStyle = '#2b2b2e'; ell(g, 0, 0, 11, 7.5); g.fill();
    g.fillStyle = '#3c3c42'; ell(g, -2, -1, 7, 4.5); g.fill();
    g.fillStyle = '#2b2b2e'; circ(g, 10, 0, 5); g.fill();
    g.fillStyle = '#f2efe6'; ell(g, 15, 0, 3.5, 2); g.fill(); ell(g, 12.5, 0, 1.8, 1.4); g.fill();
    g.fillStyle = '#c0392b'; circ(g, 11, -2.6, 0.8); g.fill(); circ(g, 11, 2.6, 0.8); g.fill();
  } else if (kind === 'goose') {
    shadow(17, 10);
    g.fillStyle = '#9d8f7d'; ell(g, 0, 0, 16, 9.5); g.fill();
    g.strokeStyle = '#7d705f'; g.lineWidth = 1.2;
    for (let k = 0; k < 5; k++) { g.beginPath(); g.moveTo(-10 + k * 3.5, -7); g.lineTo(-8 + k * 3.5, 7); g.stroke(); }
    g.fillStyle = '#efe9dc'; path(g, [{ x: -15, y: -3 }, { x: -20, y: 0 }, { x: -15, y: 3 }]); g.fill();
    g.strokeStyle = '#8a7c6a'; g.lineWidth = 4.5; g.lineCap = 'round'; g.beginPath(); g.moveTo(12, 0); g.lineTo(19, 0); g.stroke();
    g.fillStyle = '#8a7c6a'; circ(g, 20, 0, 4); g.fill();
    g.fillStyle = '#e88a3a'; ell(g, 25, 0, 3.4, 1.8); g.fill();
    g.fillStyle = '#222'; circ(g, 21, -2.4, 0.8); g.fill(); circ(g, 21, 2.4, 0.8); g.fill();
  }
  if (opt.tangled) {
    // fishing line round the bird, and the float that gives it away
    const w = Math.sin(t * 6 + ph) * 1.5;
    g.strokeStyle = 'rgba(240,240,232,0.85)'; g.lineWidth = 0.9;
    g.beginPath(); g.ellipse(0, 0, 13 + w, 7, 0.4, 0, TAU); g.stroke();
    g.beginPath(); g.ellipse(2, 0, 10, 9 - w, -0.6, 0, TAU); g.stroke();
    g.beginPath(); g.moveTo(-8, 4); g.quadraticCurveTo(-18, 14, -24, 12); g.stroke();
    g.fillStyle = '#e04a3a'; circ(g, -25, 12, 2.4); g.fill(); g.fillStyle = '#fff'; ell(g, -25, 10.6, 2.4, 1.1); g.fill();
    // flap
    if (Math.sin(t * 1.3 + ph) > 0.75) {
      const f = Math.sin(t * 22) * 4;
      g.fillStyle = kind === 'coot' ? '#3c3c42' : '#8a7c6a';
      path(g, [{ x: -2, y: -6 }, { x: 4, y: -6 }, { x: -6, y: -16 - f }]); g.fill();
      path(g, [{ x: -2, y: 6 }, { x: 4, y: 6 }, { x: -6, y: 16 + f }]); g.fill();
    }
  }
  g.restore();
}

// ---------- the ones who need a lift ----------
export function drawRaft(g, raft, x, y, a, t, ph) {
  g.save(); g.translate(x, y); g.rotate(a + Math.sin(t * 0.8 + ph) * 0.04);
  g.fillStyle = 'rgba(20,50,55,0.28)';
  if (raft === 'log') {
    ell(g, 2, 3, 26, 8); g.fill();
    g.fillStyle = '#7a5534'; g.beginPath(); g.roundRect(-24, -7, 48, 14, 6); g.fill();
    g.strokeStyle = '#5c3e25'; g.lineWidth = 1; for (let k = -18; k < 20; k += 7) { g.beginPath(); g.moveTo(k, -6); g.lineTo(k + 4, 6); g.stroke(); }
    g.fillStyle = '#c49a6c'; ell(g, 23, 0, 3.5, 6.5); g.fill(); g.strokeStyle = '#9b7148'; ell(g, 23, 0, 2, 4); g.stroke();
    g.fillStyle = '#6aa04a'; ell(g, -10, -7, 4, 2); g.fill();
  } else if (raft === 'crate') {
    ell(g, 2, 3, 17, 14); g.fill();
    g.fillStyle = '#b48a56'; g.fillRect(-14, -14, 28, 28);
    g.fillStyle = '#9a7244'; for (let k = -14; k < 14; k += 7) g.fillRect(-14, k + 5, 28, 1.6);
    g.strokeStyle = '#7a5634'; g.lineWidth = 2; g.strokeRect(-14, -14, 28, 28);
    g.fillStyle = '#c8402e'; g.fillRect(-6, -3, 12, 6); g.fillStyle = '#f3e7c9'; g.fillRect(-4, -1, 8, 2);
  } else {
    ell(g, 2, 3, 28, 9); g.fill();
    g.strokeStyle = '#6b4a30'; g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-26, 2); g.quadraticCurveTo(0, -3, 26, 1); g.stroke();
    g.lineWidth = 2.5; g.beginPath(); g.moveTo(-8, 0); g.lineTo(-16, -10); g.moveTo(8, -1); g.lineTo(16, 9); g.moveTo(14, 0); g.lineTo(22, -8); g.stroke();
    for (const [lx, ly] of [[-17, -11], [17, 10], [23, -9], [-22, 6]]) { g.fillStyle = '#7aa64e'; ell(g, lx, ly, 4, 2.4, lx * 0.1); g.fill(); }
  }
  g.restore();
}
export function drawFriend(g, kind, x, y, a, t, s = 1) {
  g.save(); g.translate(x, y); g.rotate(a); g.scale(s, s);
  if (kind === 'hedgehog') {
    g.fillStyle = '#4a3524'; ell(g, -1, 0, 10, 8); g.fill();
    g.strokeStyle = '#3a2818'; g.lineWidth = 1.2;
    for (let k = 0; k < 22; k++) { const b = Math.PI * 0.55 + k * Math.PI * 0.9 / 21 * (k % 2 ? 1 : -1) + Math.PI; g.beginPath(); g.moveTo(-1 + Math.cos(b) * 6, Math.sin(b) * 5); g.lineTo(-1 + Math.cos(b) * 11, Math.sin(b) * 9); g.stroke(); }
    g.fillStyle = '#7a5a3c'; ell(g, -2, 0, 7, 6); g.fill();
    g.fillStyle = 'rgba(220,200,160,0.6)'; for (let k = 0; k < 8; k++) { circ(g, -6 + k * 1.5, (k % 2 ? 1 : -1) * 3, 0.8); g.fill(); }
    g.fillStyle = '#d9c09a'; ell(g, 8, 0, 4.5, 4); g.fill();
    g.fillStyle = '#222'; circ(g, 12, 0, 1.3); g.fill(); circ(g, 8.5, -2.2, 0.8); g.fill(); circ(g, 8.5, 2.2, 0.8); g.fill();
  } else if (kind === 'mouse') {
    g.strokeStyle = '#d9a3a0'; g.lineWidth = 1; g.beginPath(); g.moveTo(-6, 0); g.quadraticCurveTo(-12, 6, -15, 2); g.stroke();
    g.fillStyle = '#a07a55'; ell(g, 0, 0, 7, 4.5); g.fill();
    g.fillStyle = '#c49a72'; ell(g, -1, 0, 4, 2.6); g.fill();
    g.fillStyle = '#a07a55'; circ(g, 6, 0, 3.2); g.fill();
    g.fillStyle = '#f0b8b8'; circ(g, 5, -3.4, 2); g.fill(); circ(g, 5, 3.4, 2); g.fill();
    g.fillStyle = '#222'; circ(g, 9.2, 0, 0.8); g.fill(); circ(g, 7, -1.5, 0.6); g.fill(); circ(g, 7, 1.5, 0.6); g.fill();
  } else {
    const tw = Math.sin(t * 2) * 3;
    g.strokeStyle = '#d58f45'; g.lineWidth = 2.6; g.lineCap = 'round'; g.beginPath(); g.moveTo(-8, 0); g.quadraticCurveTo(-14, tw, -12, 6 + tw); g.stroke();
    g.fillStyle = '#e0a35a'; ell(g, 0, 0, 9, 6); g.fill();
    g.strokeStyle = '#b8743a'; g.lineWidth = 1.4; for (let k = -5; k < 6; k += 3) { g.beginPath(); g.moveTo(k, -5); g.lineTo(k - 1, 5); g.stroke(); }
    g.fillStyle = '#e8ad62'; circ(g, 8, 0, 5); g.fill();
    g.fillStyle = '#d58f45'; path(g, [{ x: 7, y: -3 }, { x: 5, y: -8 }, { x: 10, y: -4 }]); g.fill(); path(g, [{ x: 7, y: 3 }, { x: 5, y: 8 }, { x: 10, y: 4 }]); g.fill();
    g.fillStyle = '#3a5a2a'; circ(g, 10, -1.8, 0.8); g.fill(); circ(g, 10, 1.8, 0.8); g.fill();
    g.fillStyle = '#e88a8a'; circ(g, 12.6, 0, 0.8); g.fill();
  }
  g.restore();
}

// ---------- the boat ----------
// `o` is how each oar sits: phi, its sweep (positive is toward the bow) and lift (out of
// the water on the recovery). Cargo: litter kinds in the stern, friends on the bow seat.
export function oarAngle(ph, prev) {
  if (ph < 0) return { phi: prev + (0.08 - prev) * 0.08, lift: 0 };
  if (ph < PULL) { const k = ph / PULL, e = 0.5 - Math.cos(Math.PI * k) / 2; return { phi: 0.68 - e * 1.25, lift: 0 }; }
  const k = (ph - PULL) / (STROKE - PULL), e = 0.5 - Math.cos(Math.PI * k) / 2;
  return { phi: -0.57 + e * 1.25, lift: Math.sin(Math.PI * k) };
}
export function oarTip(b, side, phi) {
  const s = side === 'L' ? -1 : 1, hx = Math.cos(b.a), hy = Math.sin(b.a);
  const lx = 2 + Math.sin(phi) * 50, ly = s * (13 + Math.cos(phi) * 50);
  return { x: b.x + hx * lx - hy * ly, y: b.y + hy * lx + hx * ly };
}
export function drawBoat(g, b, o, cargo, t, lamp) {
  g.save(); g.translate(b.x, b.y); g.rotate(b.a);
  const hull = () => { g.beginPath(); g.moveTo(34, 0); g.bezierCurveTo(26, -13, 6, -16, -18, -15); g.quadraticCurveTo(-30, -14, -30, 0); g.quadraticCurveTo(-30, 14, -18, 15); g.bezierCurveTo(6, 16, 26, 13, 34, 0); g.closePath(); };
  // shadow on the water
  g.save(); g.translate(3, 5); g.fillStyle = 'rgba(15,45,50,0.3)'; hull(); g.fill(); g.restore();
  // oars, the water side first
  for (const side of ['L', 'R']) {
    const s = side === 'L' ? -1 : 1, { phi, lift } = o[side];
    const ox = 2, oy = s * 13, tx = ox + Math.sin(phi) * 50, ty = oy + s * Math.cos(phi) * 50;
    const hx = ox - Math.sin(phi) * 14, hy = oy - s * Math.cos(phi) * 14;
    if (lift < 0.2) { g.fillStyle = 'rgba(15,45,50,0.25)'; ell(g, tx + 2, ty + 3, 10, 3.5, Math.atan2(ty - oy, tx - ox)); g.fill(); }
    g.strokeStyle = '#6b4a2c'; g.lineWidth = 3.4; g.lineCap = 'round';
    g.beginPath(); g.moveTo(hx, hy); g.lineTo(tx, ty); g.stroke();
    g.strokeStyle = '#c49a68'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(hx, hy); g.lineTo(tx, ty); g.stroke();
    g.fillStyle = lift > 0.2 ? '#b8875a' : '#a87648';
    ell(g, ox + Math.sin(phi) * 44, oy + s * Math.cos(phi) * 44, 10, 3.6 - lift * 1.4, Math.atan2(ty - oy, tx - ox)); g.fill();
    g.fillStyle = '#4a4a4a'; circ(g, ox, oy, 2); g.fill();
  }
  // hull
  g.fillStyle = '#7b4f2e'; hull(); g.fill();
  g.strokeStyle = '#4a2c18'; g.lineWidth = 2; g.stroke();
  g.save(); g.scale(0.84, 0.76); g.translate(-1, 0);
  g.fillStyle = '#5e3b22'; hull(); g.fill();
  g.restore();
  g.strokeStyle = 'rgba(120,80,48,0.8)'; g.lineWidth = 1;
  for (const y of [-6, 0, 6]) { g.beginPath(); g.moveTo(-24, y); g.lineTo(26, y * 0.5); g.stroke(); }
  g.strokeStyle = '#c48a55'; g.lineWidth = 1.6;
  g.beginPath(); g.moveTo(32, -1); g.bezierCurveTo(24, -12, 6, -14.6, -18, -13.6); g.quadraticCurveTo(-28, -12.6, -28.6, -3); g.stroke();
  // seats
  g.fillStyle = '#b5844f'; g.fillRect(-24, -10, 8, 20); g.fillRect(14, -11, 6, 22); g.fillRect(-4, -12, 7, 24);
  g.fillStyle = 'rgba(70,40,20,0.4)'; g.fillRect(-24, 8, 8, 2); g.fillRect(14, 9, 6, 2); g.fillRect(-4, 10, 7, 2);
  // the litter in the stern
  cargo.litter.forEach((kind, i) => {
    const x = -20 + (i % 3) * 4.5 - Math.floor(i / 3) * 1.5, y = -7 + ((i * 5) % 14);
    drawLitter(g, { kind, x, y, a: i * 1.3, ph: i, id: i }, 0, 0.55);
  });
  // friends on the bow seat
  cargo.friends.forEach((kind, i) => drawFriend(g, kind, 18 + i * 3, -5 + i * 9, Math.PI + Math.sin(t * 1.5 + i) * 0.15, t, 0.75));
  // the lantern on its post at the bow
  g.fillStyle = '#3b2a1c'; g.fillRect(24, -1.5, 6, 3);
  g.fillStyle = lamp > 0.05 ? `rgba(255,${200 + 30 * lamp},120,${0.6 + 0.4 * lamp})` : '#d8cfa8'; circ(g, 28, 0, 3.2); g.fill();
  g.strokeStyle = '#2a1d12'; g.lineWidth = 0.8; g.stroke();
  // the rower: shoulders, arms to the handles, a wide hat
  const lean = Math.sin(((o.L.phi + o.R.phi) / 2) * 1.2) * 2.5;
  g.fillStyle = '#5b4a3a'; ell(g, -1 - lean, 0, 6.5, 9); g.fill();
  g.strokeStyle = '#4b3c30'; g.lineWidth = 3; g.lineCap = 'round';
  for (const side of ['L', 'R']) {
    const s = side === 'L' ? -1 : 1, { phi } = o[side];
    const hx = 2 - Math.sin(phi) * 14, hy = s * 13 - s * Math.cos(phi) * 14;
    g.beginPath(); g.moveTo(-1 - lean, s * 6); g.lineTo(hx, hy); g.stroke();
    g.fillStyle = '#f0c9a2'; circ(g, hx, hy, 1.9); g.fill();
  }
  g.fillStyle = '#6e4a2e'; circ(g, -1 - lean, 0, 9.5); g.fill();
  g.fillStyle = '#5a3a22'; circ(g, -1 - lean, 0, 9.5); g.lineWidth = 1; g.strokeStyle = '#4a2e1a'; g.stroke();
  g.fillStyle = '#84593a'; circ(g, -1 - lean, 0, 6); g.fill();
  g.strokeStyle = '#3d6b5a'; g.lineWidth = 1.6; circ(g, -1 - lean, 0, 6); g.stroke();
  g.fillStyle = '#9e6d47'; ell(g, -3 - lean, -2, 3, 2); g.fill();
  g.fillStyle = '#d9584a'; ell(g, -6 - lean, 4.6, 2.2, 1.2, 0.5); g.fill();
  g.restore();
}

// A little parchment badge with a picture in it, for the arrows at the screen's edge.
export function drawBadge(g, x, y, r, what, t) {
  g.fillStyle = 'rgba(60,45,30,0.35)'; circ(g, x + 1.5, y + 2, r); g.fill();
  g.fillStyle = '#f6edd9'; circ(g, x, y, r); g.fill();
  g.strokeStyle = '#8a6d4a'; g.lineWidth = 1.5; g.stroke();
  g.save(); g.beginPath(); g.arc(x, y, r - 2, 0, TAU); g.clip();
  const k = { duck: 0.62, swan: 0.42, goose: 0.5, coot: 0.7 }[what.bird] || 1;
  if (what.bird) { g.translate(x, y); g.scale(k, k); drawBird(g, what.bird, what.bird === 'swan' ? -8 : -3, 0, 0, t, 0); }
  else if (what.friend) drawFriend(g, what.friend, x - 1, y, 0, t, 1.1);
  else if (what.litter) drawLitter(g, { kind: what.litter, x, y, a: -0.4, ph: 0, id: 1 }, 0, 1);
  else if (what.crate) {
    g.fillStyle = '#5e8a4e'; g.fillRect(x - 8, y - 7, 16, 14); g.fillStyle = '#4a7040'; g.fillRect(x - 8, y - 2, 16, 1.5); g.fillRect(x - 8, y + 3, 16, 1.5);
    g.strokeStyle = '#f4f0e0'; g.lineWidth = 1.2; path(g, [{ x, y: y - 5 }, { x: x + 4, y: y + 2 }, { x: x - 4, y: y + 2 }]); g.stroke();
  }
  g.restore();
}
