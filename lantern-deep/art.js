/* Lantern Deep: the painting. The floor map in pixel art: flagstone rooms and passages
   drawn tile by tile, walls and doors and props and creatures from Kenney's Tiny Dungeon
   sheet (CC0, assets/tiny-dungeon.png, 16px cells, 12 to a row), torches that flicker on
   the walls of rooms you have been in, and darkness everywhere your lantern is not. Also
   the sprite icons the side panels use. Reads the sim's map; never changes it. */

import { CW, CH } from './sim.js';
import { THEMES, MONSTERS, FEATURES } from './content.js';
import { hash2 } from '../lib/rng.js';

// ---------- constants ----------
export const T = 16;                       // a tile, in sheet pixels
export const SHEET = 'assets/tiny-dungeon.png';
const COLS = 12;
const WALL_TILES = [40, 57, 58, 59];
const PROPS = { cellars: [82, 72, 73, 82], mine: [24, 12, 82, 72], crypt: [65, 64, 24, 12], fungus: [12, 24, 82, 73], throne: [29, 65, 64, 74] };
const STAIR = 54;

export function loadSheet(src = SHEET) {
  return new Promise((ok, fail) => { const im = new Image(); im.onload = () => ok(im); im.onerror = fail; im.src = src; });
}
export function sprite(ctx, sheet, idx, x, y, s = T, flip = false) {
  const sx = (idx % COLS) * T, sy = Math.floor(idx / COLS) * T;
  if (!flip) { ctx.drawImage(sheet, sx, sy, T, T, x, y, s, s); return; }
  ctx.save(); ctx.translate(x + s, y); ctx.scale(-1, 1); ctx.drawImage(sheet, sx, sy, T, T, 0, 0, s, s); ctx.restore();
}
// CSS for a DOM icon showing sheet cell idx at px square (the sheet is 192x176)
export function iconCss(idx, px) {
  const k = px / T;
  return `background-image:url(${SHEET});background-size:${192 * k}px ${176 * k}px;background-position:${-(idx % COLS) * T * k}px ${-Math.floor(idx / COLS) * T * k}px`;
}

// ---------- geometry ----------
export const center = (r) => ({ x: (r.x + r.w / 2) * T, y: (r.y + r.h / 2) * T });
// The tiles of the passage from room a out of its side d to room b: out, across, in.
export function corridor(a, b, d) {
  const tiles = [];
  if (d === 'e' || d === 'w') {
    const [L, R] = d === 'e' ? [a, b] : [b, a];
    const y1 = L.y + Math.floor(L.h / 2), y2 = R.y + Math.floor(R.h / 2);
    const x1 = L.x + L.w, x2 = R.x - 1, mx = x1 + Math.floor((x2 - x1) / 2);
    for (let x = x1; x <= mx; x++) tiles.push([x, y1]);
    for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) tiles.push([mx, y]);
    for (let x = mx; x <= x2; x++) tiles.push([x, y2]);
    return d === 'e' ? tiles : tiles.reverse();
  }
  const [U, D] = d === 's' ? [a, b] : [b, a];
  const x1 = U.x + Math.floor(U.w / 2), x2 = D.x + Math.floor(D.w / 2);
  const y1 = U.y + U.h, y2 = D.y - 2, my = y1 + Math.floor((y2 - y1) / 2);   // D's north wall is row D.y-1
  for (let y = y1; y <= my; y++) tiles.push([x1, y]);
  for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) tiles.push([x, my]);
  for (let y = my; y <= y2 + 1; y++) tiles.push([x2, y]);
  return d === 's' ? tiles : tiles.reverse();
}
// Where the hero stands in a room: just inside the door they came through, else the middle.
export function standAt(room, fromDir) {
  const c = center(room);
  const off = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[fromDir];
  if (!off) return { x: c.x - T / 2, y: (room.y + room.h - 1) * T };
  return { x: Math.round(c.x - T / 2 + off[0] * (room.w / 2 - 1) * T), y: Math.round(c.y - T / 2 + off[1] * (room.h / 2 - 1) * T) };
}
export const foeAt = (room) => { const c = center(room); return { x: Math.round(c.x - T / 2), y: Math.round(c.y - T) }; };
export function featureAt(room) {
  return { x: (room.x + (room.w > 4 ? 1 : 0)) * T, y: room.y * T };
}

// ---------- the static floor ----------
// Every visible tile of the floor at sheet scale, drawn once whenever what is known changes.
export function paintFloor(map, sheet, floorNo) {
  const theme = THEMES[floorNo - 1];
  const W = 5 * CW * T, H = 4 * CH * T;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  const rooms = map.rooms;
  const known = (r) => r.visited || map.revealed;
  const pass = new Set();
  // passages first, so the room walls sit over their ends
  for (const r of rooms) for (const d of ['e', 's']) {
    const to = r.exits[d]; if (to == null) continue;
    const o = rooms[to];
    if (!(known(r) || known(o))) continue;
    for (const [x, y] of corridor(r, o, d)) pass.add(x + ',' + y);
  }
  for (const k of pass) { const [x, y] = k.split(',').map(Number); flag(g, x, y, theme, 0.78); }
  for (const k of pass) { const [x, y] = k.split(',').map(Number); edges(g, x, y, pass, theme); }
  for (const r of rooms) {
    if (!known(r)) continue;
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) flag(g, x, y, theme, 1);
    // the north wall: a row of stone face, then the room's outline
    for (let x = r.x - 1; x <= r.x + r.w; x++) {
      const door = r.exits.n != null && x === r.x + Math.floor(r.w / 2);
      if (door) { flag(g, x, r.y - 1, theme, 0.85); g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(x * T, (r.y - 1) * T, T, 4); continue; }
      sprite(g, sheet, WALL_TILES[Math.floor(hash2(x, r.y, 7) * WALL_TILES.length)], x * T, (r.y - 1) * T);
      g.fillStyle = theme.wall; g.globalAlpha = 0.35; g.fillRect(x * T, (r.y - 1) * T, T, T); g.globalAlpha = 1;
    }
    g.fillStyle = '#120d10';
    g.fillRect((r.x - 1) * T, (r.y - 1) * T - 3, (r.w + 2) * T, 3);
    const side = (x, y0, y1, gapY) => { for (let y = y0; y <= y1; y++) if (y !== gapY) g.fillRect(x, y * T, 3, T); };
    side(r.x * T - 3, r.y - 1, r.y + r.h - 1, r.exits.w != null ? r.y + Math.floor(r.h / 2) : -1);
    side((r.x + r.w) * T, r.y - 1, r.y + r.h - 1, r.exits.e != null ? r.y + Math.floor(r.h / 2) : -1);
    for (let x = r.x - 1; x <= r.x + r.w; x++) if (!(r.exits.s != null && x === r.x + Math.floor(r.w / 2))) g.fillRect(x * T, (r.y + r.h) * T, T, 3);
    // a little clutter in the corners, away from the doors and the middle
    const props = PROPS[theme.tag];
    const spots = [[r.x + r.w - 1, r.y + r.h - 1], [r.x, r.y + r.h - 1], [r.x + r.w - 1, r.y]];
    const n = 1 + (r.decor % 3);
    for (let i = 0; i < n; i++) sprite(g, sheet, props[(r.decor >> (i * 3)) % props.length], spots[i][0] * T, spots[i][1] * T);
    if (r.stairs) sprite(g, sheet, STAIR, (r.x + r.w - 2) * T, (r.y + 1) * T);
    if (!r.visited) { g.fillStyle = 'rgba(8,6,10,0.55)'; g.fillRect((r.x - 1) * T, (r.y - 1) * T, (r.w + 2) * T, (r.h + 1) * T); }
  }
  return c;
}
function flag(g, x, y, theme, shade) {
  const h = hash2(x, y, 3), px = x * T, py = y * T;
  g.fillStyle = theme.floor[Math.floor(h * 3)];
  g.fillRect(px, py, T, T);
  if (shade < 1) { g.fillStyle = `rgba(0,0,0,${1 - shade})`; g.fillRect(px, py, T, T); }
  // big flags: grout every other tile, a shine on the top edge, a crack or speckle now and then
  g.fillStyle = 'rgba(0,0,0,0.28)';
  g.fillRect(px, py + T - 1, T, 1); g.fillRect(px + T - 1, py, 1, T);
  if ((x + y) % 2) g.fillRect(px, py + 7, T, 1);
  g.fillStyle = 'rgba(255,240,220,0.07)'; g.fillRect(px, py, T - 1, 1);
  const k = hash2(x, y, 11);
  if (k < 0.18) { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(px + 3 + Math.floor(k * 40) % 8, py + 4, 1, 3); g.fillRect(px + 4 + Math.floor(k * 40) % 8, py + 6, 2, 1); }
  else if (k < 0.4) { g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(px + Math.floor(k * 97) % 13, py + Math.floor(k * 53) % 13, 2, 1); }
}
function edges(g, x, y, set, theme) {
  g.fillStyle = '#120d10';
  if (!set.has(x + ',' + (y - 1))) g.fillRect(x * T, y * T - 2, T, 2);
  if (!set.has(x + ',' + (y + 1))) g.fillRect(x * T, (y + 1) * T, T, 2);
  if (!set.has((x - 1) + ',' + y)) g.fillRect(x * T - 2, y * T, 2, T);
  if (!set.has((x + 1) + ',' + y)) g.fillRect((x + 1) * T, y * T, 2, T);
  void theme;
}

// ---------- each frame ----------
// view: { cam: {x, y} world px at the canvas centre, scale, w, h (device px), time (s) }
// scene: { map, at, floor, hero: {x, y, sprite, flip, bob}, fx: [] }
export function drawScene(ctx, sheet, floorCanvas, view, scene, light) {
  const { w, h, scale: s, time } = view;
  const ox = Math.round(w / 2 - view.cam.x * s), oy = Math.round(h / 2 - view.cam.y * s);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#0a080b'; ctx.fillRect(0, 0, w, h);
  ctx.drawImage(floorCanvas, ox, oy, floorCanvas.width * s, floorCanvas.height * s);
  const theme = THEMES[scene.floor - 1];
  const P = (x, y) => [ox + x * s, oy + y * s];
  const lights = [];
  for (const r of scene.map.rooms) {
    if (!r.visited) continue;
    // torches on the north wall, either side of the middle
    const tx = [r.x, r.x + r.w - 1];
    for (const x of tx) {
      if (r.exits.n != null && x === r.x + Math.floor(r.w / 2)) continue;
      const [px, py] = P(x * T + 6, (r.y - 1) * T + 4);
      torch(ctx, px, py, s, time + x);
      lights.push({ x: x * T + 8, y: (r.y - 1) * T + 6, r: 2.6 * T, k: 0.6 + 0.1 * Math.sin(time * 9 + x * 3) + 0.05 * Math.sin(time * 23 + x) });
    }
    const f = r.feature;
    if (f) {
      const at = featureAt(r), [px, py] = P(at.x, at.y);
      const F = FEATURES[f.kind];
      if (f.kind === 'camp') { campfire(ctx, px, py, s, time, f.state === 'new'); if (f.state === 'new') lights.push({ x: at.x + 8, y: at.y + 8, r: 2.6 * T, k: 0.8 }); }
      else if (f.kind === 'corpse') bones(ctx, px, py, s);
      else if (f.kind === 'chest') sprite(ctx, sheet, f.state === 'new' ? F.sprite : F.open, px, py, T * s);
      else if (f.kind === 'merchant') { sprite(ctx, sheet, 72, px + T * s, py, T * s); sprite(ctx, sheet, F.sprite, px, py + Math.round(Math.sin(time * 2) * s * 0.5), T * s); }
      else sprite(ctx, sheet, F.sprite, px, py, T * s);
      if (f.kind === 'fountain' || (f.kind === 'altar' && f.state === 'new')) lights.push({ x: at.x + 8, y: at.y + 8, r: 1.8 * T, k: 0.5, tint: f.kind === 'altar' ? '#ffe6a3' : '#9fe8d0' });
    }
    if (r.gold || r.item) coins(ctx, ...P((r.x + 1) * T, (r.y + r.h - 2) * T), s, time);
    if (r.foe && (r.id === scene.at || r.foe.state === 'dead')) {
      const M = MONSTERS[r.foe.kind], at = foeAt(r), big = M.boss ? 2 : 1;
      const [px, py] = P(at.x - (big - 1) * T / 2, at.y - (big - 1) * T);
      if (r.foe.state === 'dead') { ctx.globalAlpha = 0.55; ctx.save(); ctx.translate(px + T * s / 2, py + T * s * 0.8); ctx.rotate(Math.PI / 2); sprite(ctx, sheet, M.sprite, -T * s / 2, -T * s / 2, T * s); ctx.restore(); ctx.globalAlpha = 1; }
      else if (r.foe.state === 'hostile' || r.foe.state === 'passed' || r.foe.state === 'calm') {
        const bob = r.foe.state === 'passed' ? 0 : Math.round(Math.sin(time * 4) * 1.2) * s;
        shadow(ctx, px, py, T * s * big);
        sprite(ctx, sheet, M.sprite, px, py + bob, T * s * big, scene.hero.x < at.x);
        if (r.foe.state === 'passed') zzz(ctx, px + T * s * big, py, s, time);
        if (r.foe.state === 'hostile' && scene.fight) bar(ctx, px, py - 4 * s, T * s * big, r.foe.hp / r.foe.maxHp, s);
      }
    }
  }
  // the hero and the lantern
  const hx = scene.hero.x, hy = scene.hero.y, [px, py] = P(hx, hy);
  shadow(ctx, px, py, T * s);
  sprite(ctx, sheet, scene.hero.sprite, px, py - Math.round(scene.hero.bob * s), T * s, scene.hero.flip);
  const lk = 1 + 0.04 * Math.sin(time * 7) + 0.03 * Math.sin(time * 17);
  lights.push({ x: hx + 8, y: hy + 8, r: (light || 4.6) * T * lk, k: 1, tint: theme.light });
  for (const fx of scene.fx || []) drawFx(ctx, fx, P, s, sheet);
  darkness(ctx, w, h, lights, P, s, theme, scene);
}

function darkness(ctx, w, h, lights, P, s, theme, scene) {
  const c = darkness.c || (darkness.c = document.createElement('canvas'));
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  const g = c.getContext('2d');
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = 'rgba(6,4,9,0.94)'; g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'destination-out';
  // rooms you have seen stay faintly lit in memory; this one a little more
  for (const r of scene.map.rooms) {
    if (!r.visited && !scene.map.revealed) continue;
    const [x, y] = P((r.x - 1) * T, (r.y - 1) * T);
    g.fillStyle = r.id === scene.at ? 'rgba(0,0,0,0.3)' : r.visited ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.1)';
    g.fillRect(x, y, (r.w + 2) * T * s, (r.h + 1) * T * s);
  }
  for (const L of lights) {
    const [x, y] = P(L.x, L.y), rad = L.r * s;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, `rgba(0,0,0,${0.98 * L.k})`); gr.addColorStop(0.55, `rgba(0,0,0,${0.7 * L.k})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  ctx.drawImage(c, 0, 0);
  // and the warm colour of the flames on top
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const L of lights) {
    const [x, y] = P(L.x, L.y), rad = L.r * s * 0.9;
    const gr = ctx.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, hexA(L.tint || theme.light, 0.24 * L.k)); gr.addColorStop(1, hexA(L.tint || theme.light, 0));
    ctx.fillStyle = gr; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  ctx.restore();
}
function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }

function torch(ctx, x, y, s, t) {
  ctx.fillStyle = '#5a3a22'; ctx.fillRect(x + s, y + 4 * s, 2 * s, 5 * s);
  ctx.fillStyle = '#2b1d14'; ctx.fillRect(x, y + 4 * s, 4 * s, s);
  const f = Math.floor((t * 10) % 3);
  ctx.fillStyle = '#ff7a1a'; ctx.fillRect(x, y + (1 - (f === 1 ? 1 : 0)) * s, 4 * s, 3 * s);
  ctx.fillStyle = '#ffd04a'; ctx.fillRect(x + s, y + (f === 2 ? 0 : 1) * s, 2 * s, 2 * s);
  ctx.fillStyle = '#fff6c8'; ctx.fillRect(x + s + (f === 0 ? s : 0), y + 2 * s, s, s);
}
function campfire(ctx, x, y, s, t, lit) {
  ctx.fillStyle = '#6b6560';
  for (const [dx, dy] of [[2, 11], [5, 13], [9, 13], [12, 11], [4, 9], [11, 9]]) ctx.fillRect(x + dx * s, y + dy * s, 2 * s, 2 * s);
  ctx.fillStyle = '#4a2f1d'; ctx.fillRect(x + 4 * s, y + 11 * s, 8 * s, 2 * s);
  if (!lit) { ctx.fillStyle = '#3a3330'; ctx.fillRect(x + 5 * s, y + 10 * s, 6 * s, s); return; }
  const f = Math.floor((t * 8) % 3);
  ctx.fillStyle = '#ff6a14'; ctx.fillRect(x + 5 * s, y + (6 + f % 2) * s, 6 * s, 5 * s);
  ctx.fillStyle = '#ffc93a'; ctx.fillRect(x + 6 * s, y + (5 + (f === 2 ? 1 : 0)) * s, 4 * s, 5 * s);
  ctx.fillStyle = '#fff3c4'; ctx.fillRect(x + 7 * s, y + 8 * s, 2 * s, 2 * s);
}
function bones(ctx, x, y, s) {
  ctx.fillStyle = '#d9d2c3';
  ctx.fillRect(x + 3 * s, y + 9 * s, 4 * s, 3 * s);                 // skull
  ctx.fillRect(x + 7 * s, y + 10 * s, 7 * s, s);                    // spine
  for (const dx of [8, 10, 12]) ctx.fillRect(x + dx * s, y + 9 * s, s, 3 * s);
  ctx.fillRect(x + 13 * s, y + 12 * s, 2 * s, s);
  ctx.fillStyle = '#2a2220'; ctx.fillRect(x + 4 * s, y + 10 * s, s, s); ctx.fillRect(x + 6 * s, y + 10 * s, s, s);
  ctx.fillStyle = '#6b4a2e'; ctx.fillRect(x + 9 * s, y + 5 * s, 5 * s, 3 * s);   // the pack
}
function coins(ctx, x, y, s, t) {
  const tw = Math.sin(t * 3) > 0.7;
  ctx.fillStyle = '#b8861b'; ctx.fillRect(x + 5 * s, y + 10 * s, 3 * s, 2 * s); ctx.fillRect(x + 8 * s, y + 11 * s, 3 * s, 2 * s);
  ctx.fillStyle = '#ffd34d'; ctx.fillRect(x + 5 * s, y + 10 * s, 2 * s, s); ctx.fillRect(x + 8 * s, y + 11 * s, 2 * s, s);
  if (tw) { ctx.fillStyle = '#fffbe0'; ctx.fillRect(x + 6 * s, y + 9 * s, s, s); }
}
function shadow(ctx, x, y, size) {
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(x + size / 2, y + size * 0.92, size * 0.34, size * 0.1, 0, 0, Math.PI * 2); ctx.fill();
}
function zzz(ctx, x, y, s, t) {
  const k = (t * 0.8) % 1;
  ctx.fillStyle = `rgba(220,230,255,${1 - k})`;
  ctx.font = `${Math.round(6 * s)}px monospace`; ctx.fillText('z', x, y - k * 8 * s);
}
function bar(ctx, x, y, w, k, s) {
  ctx.fillStyle = '#1a0f10'; ctx.fillRect(x - s, y - s, w + 2 * s, 3 * s);
  ctx.fillStyle = '#c0392b'; ctx.fillRect(x, y, Math.max(0, w * k), s);
}
// effects: { kind: 'num'|'slash'|'spark', x, y, text, color, age, life }
function drawFx(ctx, fx, P, s) {
  const k = fx.age / fx.life, [x, y] = P(fx.x, fx.y);
  if (fx.kind === 'num') {
    ctx.save();
    ctx.font = `bold ${Math.round(7 * s)}px "Cinzel", serif`;
    ctx.textAlign = 'center';
    ctx.globalAlpha = 1 - k * k;
    ctx.fillStyle = '#120a08'; ctx.fillText(fx.text, x + s, y - k * 14 * s + s);
    ctx.fillStyle = fx.color; ctx.fillText(fx.text, x, y - k * 14 * s);
    ctx.restore();
  }
  if (fx.kind === 'slash') {
    ctx.save(); ctx.globalAlpha = 1 - k; ctx.strokeStyle = '#fff4d8'; ctx.lineWidth = 2 * s;
    ctx.beginPath(); ctx.moveTo(x - 7 * s, y - 7 * s + k * 4 * s); ctx.lineTo(x + 7 * s, y + 7 * s - k * 4 * s); ctx.stroke(); ctx.restore();
  }
  if (fx.kind === 'spark') {
    ctx.save(); ctx.globalAlpha = 1 - k; ctx.fillStyle = fx.color;
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, r = (3 + k * 12) * s; ctx.fillRect(x + Math.cos(a) * r, y + Math.sin(a) * r, 2 * s, 2 * s); }
    ctx.restore();
  }
}
