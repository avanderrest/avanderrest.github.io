/* Wizz Delivery: the level editor.

   Draws a town with the same sprites, colours and curve-painted streets the game
   uses, and lets you place everything the rules know about: roads (main or
   estate), delivery houses, building blocks, trees and bushes, the eight
   restaurants, traffic lights, roundabouts, parks, ponds, painted grounds, car
   parks and the start point. The level is a plain object from level.js, saved as
   a draft in localStorage and played at index.html?level=draft.

   The editor rebuilds the real sim after every edit, so what you see is what
   the collision grid, lane snapper and delivery logic will actually get. */
import { createWizz } from './sim.js';
import {
  LEVEL_KEY, blankLevel, normalizeLevel, validateLevel, encodeLevel, levelFromQuery,
  listMaps, saveMap, deleteMap, getMap, readCurrentMapId, writeCurrentMapId,
} from './level.js';
import { townLevel } from './town-level.js';
import { mulberry32 } from '../lib/rng.js';

const $ = (s) => document.querySelector(s);
const W = 50, H = 34;
const PAVE_BAND = 0.95;
const BULB_R = 1.25;
const MIN_ZOOM = 8, MAX_ZOOM = 72;
const PATH_W = 0.55;   // a footpath, as in the park by the pond

// ---------- art ----------
const HOUSES = 'abcdefgh'.split('').map((c) => 'house-' + c);
const COTTAGES = 'abcdefghijkl'.split('').map((c) => 'cottage-' + c);
const GARAGES = ['garage-b', 'garage-c', 'garage-d', 'garage-e'];
const HOUSE_ART = [...HOUSES, ...COTTAGES, 'garage', ...GARAGES];
const BLOCK_ART = ['block-a', 'block-b', 'block-c', 'block-d'];
const ROW_ART = ['row-a', 'row-c'];
const SHOP_ART = {
  'shop-diner': 'buildings/shop-diner', 'shop-curry': 'buildings/shop-curry',
  'shop-wok': 'shops/shop-wok', 'shop-pizza': 'shops/shop-pizza', 'shop-barn': 'shops/shop-barn',
  'shop-taco': 'shops/shop-taco', 'shop-sushi': 'shops/shop-sushi', 'shop-noodle': 'shops/shop-noodle',
};
const TREES = [
  'round-a', 'round-b', 'round-c', 'round-d', 'round-e', 'oak',
  'pine-a', 'pine-b', 'pine-c', 'pine-d', 'pine-e', 'pine-f', 'pine-g', 'pine-h',
  'young-a', 'young-b', 'young-c', 'young-d',
];
const BUSHES = ['bush-a', 'bush-b', 'bush-c', 'bush-d', 'bush-e', 'bush-f', 'bush-g', 'bush-h', 'shrubs'];
const GROUND_ART = ['green', 'tennis', 'allotment', 'playground', 'roundabout'];
const FOOD_ART = ['egg', 'takeaway', 'pizza', 'burger', 'taco', 'sushi', 'curry', 'ramen'];
// The order the rules hand the eight restaurants their shopfronts out in.
const REST_ORDER = ['shop-diner', 'shop-wok', 'shop-pizza', 'shop-barn', 'shop-taco', 'shop-sushi', 'shop-curry', 'shop-noodle'];

const art = {};
const loadArt = (name, path) => { const img = new Image(); img.src = 'assets/' + path + '.png'; art[name] = img; };
for (const n of HOUSE_ART) loadArt(n, 'buildings/' + n);
for (const n of [...BLOCK_ART, ...ROW_ART]) loadArt(n, 'buildings/' + n);
for (const [n, p] of Object.entries(SHOP_ART)) loadArt(n, p);
for (const n of TREES) loadArt(n, 'trees/' + n);
for (const n of BUSHES) loadArt(n, 'trees/' + n);
for (const n of GROUND_ART) loadArt(n, 'ground/' + n);
for (const n of FOOD_ART) loadArt(n, 'food/' + n);
loadArt('pin-orange', 'markers/pin-orange');
const ready = (name) => { const img = art[name]; return img && img.complete && img.naturalWidth > 0; };

// ---------- palette (the game's own) ----------
const PAL = {
  asphalt: ['#575b60', '#53575c', '#5b5f64', '#565a5f'],
  line: 'rgba(244,240,224,0.80)',
  centre: 'rgba(236,196,74,0.92)',
  edge: 'rgba(244,240,224,0.62)',
  kerb: '#b6ae9c',
  kerbLip: 'rgba(70,62,48,0.35)',
  pave: ['#cfc7b5', '#c9c1af', '#d4ccba', '#c4bcaa'],
  grass: ['#74904f', '#6d8949', '#7b9756', '#678343'],
  grassTuft: 'rgba(46,72,34,0.2)',
  yard: ['#b6ae9b', '#aea695'],
  shadow: 'rgba(38,32,22,0.26)',
  park: ['#83a862', '#7ca05b', '#8bb069', '#779a56'],
  parkFill: 'rgba(146,183,106,0.55)',
  footpath: '#c8bb96',
  shore: '#9a9f72',
  water: '#5b93c4',
  waterRim: 'rgba(210,232,246,0.45)',
};

const hash2 = (x, y) => {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const key = (x, y) => x + ',' + y;

// ---------- state ----------
const ID_TOWN = 'town';
const ID_DRAFT = 'draft';
const ID_NEW = 'new';
const isSavedId = (id) => !!id && id !== ID_TOWN && id !== ID_DRAFT && id !== ID_NEW;

// The map the editor opens on: the level named in the link if there is one,
// otherwise the map you last picked, otherwise the town the game itself plays.
function loadInitial() {
  let params = null;
  try { params = new URLSearchParams(location.search); } catch { /* no query */ }
  if (params && params.get('level') === 'town') return { level: townLevel(), id: ID_TOWN };
  const fromQuery = levelFromQuery(location.search);
  if (fromQuery) return { level: fromQuery, id: ID_DRAFT };
  const remembered = readCurrentMapId();
  const saved = remembered && getMap(remembered);
  if (saved) return { level: saved.level, id: saved.id };
  return { level: townLevel(), id: ID_TOWN };
}

const initial = loadInitial();
let level = initial.level;
let currentId = initial.id;
let wz = null;
let lots = new Map();
let propMap = new Map();
const undoStack = [];
const redoStack = [];
let hasEdited = false;

const state = { tool: 'house' };
const cam = { x: 24.5, y: 17 };
let zoom = 26;
const view = { w: 1, h: 1, dpr: 1 };

// ---------- canvas ----------
const canvas = $('#editor-canvas');
const ctx = canvas.getContext('2d');
const wrap = $('#wrap');
const hintEl = $('#hint');
const toastEl = $('#toast');

function fit() {
  const r = wrap.getBoundingClientRect();
  view.w = Math.max(200, Math.floor(r.width));
  view.h = Math.max(200, Math.floor(r.height));
  view.dpr = Math.min(2, window.devicePixelRatio || 1);
  const cw = Math.round(view.w * view.dpr), ch = Math.round(view.h * view.dpr);
  if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
  clampCam();
  draw();
}
new ResizeObserver(fit).observe(wrap);
window.addEventListener('resize', fit);

// How far the camera may go is the extent of the roads, not the 50x34 grid:
// a street running off the map can be followed to its end.
function panBounds() {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of (level.geo && level.geo.roads) || []) {
    for (const [x, y] of r.pts) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: W, maxY: H };
  const pad = 0.6;   // just enough to see the last kerb
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}

function clampCam() {
  const b = panBounds();
  const halfW = view.w / (2 * zoom), halfH = view.h / (2 * zoom);
  if (b.maxX - b.minX <= halfW * 2) cam.x = (b.minX + b.maxX) / 2;
  else cam.x = clamp(cam.x, b.minX + halfW, b.maxX - halfW);
  if (b.maxY - b.minY <= halfH * 2) cam.y = (b.minY + b.maxY) / 2;
  else cam.y = clamp(cam.y, b.minY + halfH, b.maxY - halfH);
}

function localPos(e) {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}
function screenToWorld(sx, sy) {
  return { x: cam.x + (sx - view.w / 2) / zoom, y: cam.y + (sy - view.h / 2) / zoom };
}
function zoomAt(next, anchor) {
  const before = screenToWorld(anchor.x, anchor.y);
  zoom = clamp(next, MIN_ZOOM, MAX_ZOOM);
  cam.x = before.x - (anchor.x - view.w / 2) / zoom;
  cam.y = before.y - (anchor.y - view.h / 2) / zoom;
  clampCam();
  draw();
}

// ---------- editing ----------
function edit(fn) {
  undoStack.push(JSON.stringify(level));
  if (undoStack.length > 60) undoStack.shift();
  redoStack.length = 0;
  fn(level.geo);
  hasEdited = true;
  rebuild();
  autosave();
}

function undo() {
  if (!undoStack.length) return;
  redoStack.push(JSON.stringify(level));
  level = JSON.parse(undoStack.pop());
  $('#level-name').value = level.name;
  rebuild();
  autosave();
}

function redo() {
  if (!redoStack.length) return;
  undoStack.push(JSON.stringify(level));
  level = JSON.parse(redoStack.pop());
  $('#level-name').value = level.name;
  rebuild();
  autosave();
}

let saveTimer = 0;
function autosave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(LEVEL_KEY, JSON.stringify(level)); } catch { /* private mode */ }
    if (isSavedId(currentId)) {
      saveMap(level, currentId);
      refreshPicker();
    }
  }, 250);
}

// The shelf: the town, whatever maps are saved on this machine, and the working
// copy the game opened (if the editor was reached from a custom level).
function refreshPicker() {
  const sel = $('#level-picker');
  if (!sel) return;
  sel.innerHTML = '';
  const add = (id, label) => {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = label;
    sel.appendChild(opt);
  };
  if (currentId === ID_DRAFT) add(ID_DRAFT, 'Working draft');
  if (currentId === ID_NEW) add(ID_NEW, 'New map (unsaved)');
  add(ID_TOWN, 'Wizzby (current town)');
  const saved = listMaps();
  if (saved.length) {
    const group = document.createElement('optgroup');
    group.label = 'Saved maps';
    for (const m of saved) {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.name;
      group.appendChild(opt);
    }
    sel.appendChild(group);
  }
  sel.value = currentId;
  $('#btn-delete').disabled = !isSavedId(currentId);
}

function switchTo(id) {
  if (id === currentId) return;
  if (isSavedId(currentId)) saveMap(level, currentId);   // don't lose the last edit to the swap
  let next = null;
  if (id === ID_TOWN) next = townLevel();
  else if (id === ID_DRAFT) {
    try {
      const raw = localStorage.getItem(LEVEL_KEY);
      if (raw) next = normalizeLevel(JSON.parse(raw));
    } catch { /* leave next null */ }
  } else {
    const saved = getMap(id);
    if (saved) next = saved.level;
  }
  if (!next) {
    toast('That map could not be opened.', 'bad');
    refreshPicker();
    return;
  }
  level = next;
  currentId = id;
  undoStack.length = 0;
  redoStack.length = 0;
  hasEdited = false;
  $('#level-name').value = level.name;
  writeCurrentMapId(id === ID_TOWN || isSavedId(id) ? id : null);
  cam.x = level.start.x;
  cam.y = level.start.y;
  rebuild();
  autosave();
  refreshPicker();
  toast(id === ID_TOWN ? 'Editing Wizzby — Save makes your own copy.' : 'Editing \u201c' + level.name + '\u201d.', 'good');
}

function uniqueName(base) {
  const taken = new Set(listMaps().map((m) => m.name));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(base + ' ' + n)) n++;
  return base + ' ' + n;
}

function saveCurrent() {
  if (isSavedId(currentId)) {
    saveMap(level, currentId);
    refreshPicker();
    autosave();
    toast('Saved \u201c' + level.name + '\u201d.', 'good');
    return;
  }
  // The name field is the naming dialog: a copy of the town gets its own name
  // so the shelf never shows two identical Wizzbys.
  if (currentId === ID_TOWN && level.name === 'Wizzby') {
    level.name = 'Wizzby copy';
  }
  if (!level.name || level.name === 'Untitled') level.name = 'My town';
  level.name = uniqueName(level.name).slice(0, 32);
  $('#level-name').value = level.name;
  updateTitle();
  currentId = saveMap(level);
  writeCurrentMapId(currentId);
  refreshPicker();
  autosave();
  toast('Saved \u201c' + level.name + '\u201d.', 'good');
}

function rebuild() {
  try {
    wz = createWizz({ map: level, rnd: mulberry32(20261025) });
  } catch (err) {
    console.error('The level could not be built:', err);
    wz = null;
  }
  lots = buildLots();
  propMap = buildProps();
  updateTitle();
  refreshStatus();
  draw();
}

function updateTitle() {
  document.title = level.name + ' \u2014 Wizz Delivery level editor';
  const h1 = document.querySelector('.topbar h1');
  if (h1) h1.textContent = level.name;
}

function refreshStatus() {
  const g = level.geo;
  const counts = [
    ['roads', g.roads.length], ['houses', g.houses.length], ['buildings', g.buildings.length],
    ['trees', g.trees.length + g.props.length], ['restaurants', level.restaurants.length],
    ['lights', level.lights.length], ['roundabouts', level.roundabouts.length],
    ['paths', g.footpaths.length],
    ['parks', (g.park ? 1 : 0) + g.features.length + g.water.length + g.carparks.length],
  ];
  $('#counts').innerHTML = counts.map(([label, n]) => '<b>' + n + '</b> ' + label).join(' \u00b7 ');

  const { issues } = validateLevel(level);
  const list = [...issues];
  if (wz) {
    const skipped = g.houses.length - wz.HOUSES.length;
    if (skipped > 0) list.push(skipped + ' delivery house' + (skipped === 1 ? ' is' : 's are') + ' on road, water or a shop doorway.');
    const placedRests = wz.RESTAURANTS.slice(0, level.restaurants.length);
    if (level.restaurants.length && placedRests.some((r) => !wz.buildable(r.x, r.y))) list.push('A restaurant is not on the pavement.');
    if (level.restaurants.length && placedRests.some((r, i) => i > 0 && placedRests.slice(0, i).some((q) => q.x === r.x && q.y === r.y))) list.push('Two restaurants share a doorway.');
    if (zr(wz.START) > 4) list.push('The start point snaps to the nearest lane — check the marker.');
  }
  const issuesEl = $('#issues');
  issuesEl.innerHTML = list.length
    ? list.map((m) => '<div class="issue">' + escapeHtml(m) + '</div>').join('')
    : '<div class="good">Ready to drive.</div>';
  $('#btn-play').disabled = list.length > 0;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function zr(p) {
  const d = Math.hypot(p.x - level.start.x, p.y - level.start.y);
  return d;
}

// ---------- hit tests ----------
const houseAt = (x, y) => level.geo.houses.some((h) => h.x === x && h.y === y);
const buildingAt = (x, y) => level.geo.buildings.some((p) => p.x === x && p.y === y);
const treeAt = (x, y) => level.geo.trees.some((p) => p.x === x && p.y === y);
const propAt = (x, y) => level.geo.props.some((p) => p.x === x && p.y === y);
const restAtTile = (x, y) => wz && wz.RESTAURANTS.slice(0, level.restaurants.length).some((r) => r.x === x && r.y === y);

// Open ground a house can stand on: not tarmac, water, a building or a tree.
// It does not have to touch the pavement — the rules route its door to the
// nearest road.
function houseGround(x, y) {
  if (!wz) return false;
  const k = wz.kindAt(x, y);
  return k !== '#' && k !== 'W' && k !== 'I' && k !== 'B' && k !== 'T' && !wz.onTarmac(x, y);
}

function nearRestaurant(x, y) {
  if (!wz) return false;
  return wz.RESTAURANTS.slice(0, level.restaurants.length).some((r) => Math.hypot(r.x - x, r.y - y) < 1.2);
}

function canPlace(tool, x, y) {
  if (!wz || x < 0 || y < 0 || x >= W || y >= H) return false;
  const k = wz.kindAt(x, y);
  const solidGround = k !== '#' && k !== 'W' && k !== 'I';
  switch (tool) {
    case 'house': return houseGround(x, y) && !houseAt(x, y) && !nearRestaurant(x, y);
    case 'restaurant': return level.restaurants.length < 8 && wz.buildable(x, y) && !houseAt(x, y) && !restAtTile(x, y);
    case 'building': return solidGround && !houseAt(x, y) && !buildingAt(x, y) && !treeAt(x, y) && !propAt(x, y) && !restAtTile(x, y);
    case 'tree': return solidGround && !houseAt(x, y) && !buildingAt(x, y) && !treeAt(x, y) && !propAt(x, y) && !restAtTile(x, y);
    case 'bush': return solidGround && !houseAt(x, y) && !buildingAt(x, y) && !treeAt(x, y) && !propAt(x, y) && !restAtTile(x, y);
    case 'start': return k === '#';
    default: return true;
  }
}

function placePoint(tool, wx, wy) {
  const x = Math.floor(wx), y = Math.floor(wy);
  const g = level.geo;
  if (!canPlace(tool, x, y)) {
    const why = !wz ? 'The map is not ready.'
      : tool === 'house' ? 'A delivery house needs open ground, clear of the tarmac and the shops.'
        : tool === 'restaurant' ? (level.restaurants.length >= 8 ? 'All eight restaurants are already placed.' : 'A restaurant goes on pavement beside a street.')
          : tool === 'start' ? 'The start has to be on tarmac.'
            : 'That tile is road, water or already taken.';
    toast(why, 'bad');
    return;
  }
  switch (tool) {
    case 'house': edit(() => g.houses.push({ x, y })); break;
    case 'restaurant': edit(() => level.restaurants.push([x + 0.5, y + 0.5])); break;
    case 'building': edit(() => g.buildings.push({ x, y })); break;
    case 'tree': edit(() => g.trees.push({ x, y })); break;
    case 'bush': edit(() => g.props.push({ x, y, kind: 'bush' })); break;
    case 'light':
      if (level.lights.some(([lx, ly]) => Math.hypot(lx - x, ly - y) < 2)) { toast('There is already a junction there.', 'bad'); return; }
      edit(() => level.lights.push([x, y]));
      break;
    case 'roundabout':
      if (level.roundabouts.some(([rx, ry]) => Math.hypot(rx - x, ry - y) < 4)) { toast('Roundabouts need room between them.', 'bad'); return; }
      edit(() => level.roundabouts.push([x, y]));
      break;
    case 'start':
      edit(() => { level.start = { x: x + 0.5, y: y + 0.5 }; });
      break;
    default: break;
  }
  hintDone();
}

function snapNode(p) {
  let best = p, bestD = 0.9;
  for (const r of level.geo.roads) for (const q of r.pts) {
    const d = Math.hypot(q[0] - p.x, q[1] - p.y);
    if (d < bestD) { bestD = d; best = { x: q[0], y: q[1] }; }
  }
  return best;
}

function commitDrag(tool, a, b) {
  const g = level.geo;
  if (tool === 'road') {
    if (Math.hypot(a.x - b.x, a.y - b.y) < 0.45) return;
    const width = Number($('#road-width').value) || 2.9;
    const minor = $('#road-minor').checked;
    edit(() => g.roads.push({ name: 'Street ' + (g.roads.length + 1), w: width, minor, pts: [[a.x, a.y], [b.x, b.y]] }));
    hintDone();
    return;
  }
  if (tool === 'footpath') {
    if (Math.hypot(a.x - b.x, a.y - b.y) < 0.3) return;
    edit(() => g.footpaths.push({ w: PATH_W, pts: [[a.x, a.y], [b.x, b.y]] }));
    hintDone();
    return;
  }
  const x0 = Math.floor(Math.min(a.x, b.x)), y0 = Math.floor(Math.min(a.y, b.y));
  const x1 = Math.ceil(Math.max(a.x, b.x)), y1 = Math.ceil(Math.max(a.y, b.y));
  const w = x1 - x0, h = y1 - y0;
  if (w < 1 || h < 1) return;
  const rect = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  if (tool === 'park') {
    edit(() => { g.park = rect; });
  } else if (tool === 'pond') {
    edit(() => g.water.push(rect));
  } else if (tool === 'carpark') {
    edit(() => g.carparks.push([x0, y0, w, h]));
  } else if (tool.startsWith('feature-')) {
    const artName = tool.slice('feature-'.length);
    edit(() => g.features.push({ art: artName, x: x0, y: y0, w, h }));
  }
  hintDone();
}

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function inPoly(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function eraseAt(wx, wy) {
  const g = level.geo;
  const x = Math.floor(wx), y = Math.floor(wy);
  let removed = '';
  const take = (arr, pred, label) => {
    const i = arr.findIndex(pred);
    if (i < 0) return false;
    edit(() => arr.splice(i, 1));
    removed = label;
    return true;
  };
  if (take(g.houses, (h) => h.x === x && h.y === y, 'delivery house')) return finishErase(removed);
  const restIndex = wz ? wz.RESTAURANTS.slice(0, level.restaurants.length).findIndex((r) => r.x === x && r.y === y) : -1;
  if (restIndex >= 0) {
    edit(() => level.restaurants.splice(restIndex, 1));
    return finishErase('restaurant');
  }
  if (take(level.lights, ([lx, ly]) => Math.hypot(lx - x, ly - y) < 1.2, 'traffic lights')) return finishErase(removed);
  if (take(level.roundabouts, ([rx, ry]) => Math.hypot(rx - x, ry - y) < 1.6, 'roundabout')) return finishErase(removed);
  if (take(g.buildings, (p) => p.x === x && p.y === y, 'building')) return finishErase(removed);
  if (take(g.trees, (p) => p.x === x && p.y === y, 'tree')) return finishErase(removed);
  if (take(g.props, (p) => p.x === x && p.y === y, 'bush')) return finishErase(removed);
  if (take(g.carparks, ([cx, cy, cw, ch]) => wx >= cx && wx <= cx + cw && wy >= cy && wy <= cy + ch, 'car park')) return finishErase(removed);
  if (take(g.features, (f) => wx >= f.x && wx <= f.x + f.w && wy >= f.y && wy <= f.y + f.h, 'painted ground')) return finishErase(removed);
  const wi = g.water.findIndex((poly) => inPoly(wx, wy, poly));
  if (wi >= 0) { edit(() => g.water.splice(wi, 1)); return finishErase('pond'); }
  if (g.park && inPoly(wx, wy, g.park)) { edit(() => { g.park = null; }); return finishErase('park'); }
  const pi = g.footpaths.findIndex((f) => {
    for (let i = 1; i < f.pts.length; i++) {
      const [ax, ay] = f.pts[i - 1], [bx, by] = f.pts[i];
      if (distToSegment(wx, wy, ax, ay, bx, by) < (f.w || PATH_W) / 2 + 0.35) return true;
    }
    return false;
  });
  if (pi >= 0) { edit(() => g.footpaths.splice(pi, 1)); return finishErase('path'); }
  const ri = g.roads.findIndex((r) => {
    for (let i = 1; i < r.pts.length; i++) {
      const [ax, ay] = r.pts[i - 1], [bx, by] = r.pts[i];
      if (distToSegment(wx, wy, ax, ay, bx, by) < r.w / 2 + 0.35) return true;
    }
    return false;
  });
  if (ri >= 0) { edit(() => g.roads.splice(ri, 1)); return finishErase('road'); }
  if (Math.hypot(level.start.x - wx, level.start.y - wy) < 1) { toast('The start point is always there; move it instead.', 'bad'); return; }
  toast('Nothing to erase there.', 'bad');
}

function finishErase(what) {
  toast('Erased the ' + what + '.');
  hintDone();
}

// ---------- drawing ----------
function buildLots() {
  const out = new Map(), taken = new Set();
  if (!wz) return out;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (wz.kindAt(x, y) !== 'B' || taken.has(key(x, y))) continue;
    const free = (ax, ay) => wz.kindAt(ax, ay) === 'B' && !taken.has(key(ax, ay));
    const h = hash2(x + 17, y + 29);
    const appetite = hash2(x + 53, y + 91);
    let lot;
    if (appetite < 0.42 && free(x + 1, y) && free(x, y + 1) && free(x + 1, y + 1)) lot = { fx: x, fy: y, fw: 2, fh: 2, name: BLOCK_ART[Math.floor(h * BLOCK_ART.length)] };
    else if (appetite < 0.68 && free(x, y + 1)) lot = { fx: x, fy: y, fw: 1, fh: 2, name: ROW_ART[Math.floor(h * ROW_ART.length)] };
    else lot = { fx: x, fy: y, fw: 1, fh: 1, name: HOUSE_ART[Math.floor(h * HOUSE_ART.length)] };
    for (let yy = lot.fy; yy < lot.fy + lot.fh; yy++) for (let xx = lot.fx; xx < lot.fx + lot.fw; xx++) taken.add(key(xx, yy));
    out.set(key(lot.fx, lot.fy + lot.fh - 1), lot);
  }
  return out;
}

function buildProps() {
  const out = new Map();
  if (!wz) return out;
  const placed = new Map(((wz.geo && wz.geo.props) || []).map((p) => [key(p.x, p.y), p]));
  const authored = !!(wz.geo && wz.geo.authored);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = wz.kindAt(x, y);
    if (k === 'T') { out.set(key(x, y), { name: TREES[Math.floor(hash2(x * 3, y * 5) * TREES.length)], kind: 'tree' }); continue; }
    const placedHere = placed.get(key(x, y));
    if (placedHere) {
      const list = placedHere.kind === 'bush' ? BUSHES : TREES;
      out.set(key(x, y), { name: list[Math.floor(hash2(x + 5, y * 3) * list.length)], kind: placedHere.kind });
      continue;
    }
    if (k !== '.' || authored) continue;
    const h = hash2(x + 61, y + 7);
    if (h < 0.16) out.set(key(x, y), { name: BUSHES[Math.floor(hash2(x + 5, y) * BUSHES.length)], kind: 'bush' });
    else if (h < 0.34) out.set(key(x, y), { name: TREES[Math.floor(hash2(x, y * 7) * TREES.length)], kind: 'tree' });
  }
  return out;
}

function tracePath(line) {
  ctx.beginPath();
  ctx.moveTo(line[0][0], line[0][1]);
  for (let i = 1; i < line.length; i++) ctx.lineTo(line[i][0], line[i][1]);
}
function tracePathOffset(line, off) {
  // A wide main road gets a pair of centre lines; a street still gets one.
  ctx.beginPath();
  for (let i = 0; i < line.length; i++) {
    const a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)];
    const tx = b[0] - a[0], ty = b[1] - a[1];
    const m = Math.hypot(tx, ty) || 1;
    const x = line[i][0] - (ty / m) * off, y = line[i][1] + (tx / m) * off;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
}
function traceRing(ring) {
  ctx.beginPath();
  ctx.moveTo(ring[0][0], ring[0][1]);
  for (let i = 1; i < ring.length; i++) ctx.lineTo(ring[i][0], ring[i][1]);
  ctx.closePath();
}
function blit(name, fx, fy, fw, fh) {
  const img = art[name];
  if (!ready(name)) return false;
  const s = Math.min((fw + 0.1) / img.width, (fh + 0.4) / img.height);
  const w = img.width * s, h = img.height * s;
  ctx.drawImage(img, fx + (fw - w) / 2, fy + fh + 0.06 - h, w, h);
  return true;
}

function draw() {
  const z = zoom * view.dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.setTransform(z, 0, 0, z, canvas.width / 2 - cam.x * z, canvas.height / 2 - cam.y * z);

  const pad = 2;
  const halfW = view.w / (2 * zoom), halfH = view.h / (2 * zoom);
  const x0 = Math.max(0, Math.floor(cam.x - halfW - pad)), x1 = Math.min(W - 1, Math.ceil(cam.x + halfW + pad));
  const y0 = Math.max(0, Math.floor(cam.y - halfH - pad)), y1 = Math.min(H - 1, Math.ceil(cam.y + halfH + pad));

  drawGround(x0, y0, x1, y1);
  if (wz && wz.geo) drawStreets();
  drawFeatures();
  drawLots(y0, y1);
  drawProps(y0, y1);
  drawHouses();
  drawRestaurants();
  drawMarkers();
  drawStart();
  drawGrid(x0, y0, x1, y1);
  drawHover();
  drawGhost();
  drawPreview();
}

function drawGround(x0, y0, x1, y1) {
  const geo = wz && wz.geo;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const k = wz ? wz.kindAt(x, y) : '.';
    const n = hash2(x, y);
    let list = PAL.grass;
    if (k === '#') list = PAL.asphalt;
    else if (k === 's') list = geo ? PAL.grass : PAL.pave;
    else if (k === 'B') list = PAL.yard;
    else if (k === 'P' || k === 'W' || k === 'I') list = PAL.park;
    ctx.fillStyle = list[Math.floor(n * list.length)];
    ctx.fillRect(x, y, 1, 1);
    if ((k === '.' || k === 'P' || k === 's') && n > 0.72) {
      ctx.fillStyle = PAL.grassTuft;
      ctx.fillRect(x + 0.2 + n * 0.4, y + 0.3 + hash2(y, x) * 0.4, 0.14, 0.05);
    }
  }
}

function drawStreets() {
  const geo = wz.geo, map = wz.activeMap;
  ctx.save();
  if (geo.parkRing && geo.parkRing.length) {
    ctx.fillStyle = PAL.parkFill;
    traceRing(geo.parkRing); ctx.fill();
  }
  for (const p of geo.pathLines || []) {
    ctx.strokeStyle = PAL.footpath; ctx.lineWidth = p.w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    tracePath(p.line); ctx.stroke();
  }
  for (const ring of geo.waterRings || []) {
    traceRing(ring);
    ctx.fillStyle = PAL.shore; ctx.fill();
    ctx.save(); ctx.clip();
    traceRing(ring);
    ctx.translate(0, 0.16); ctx.fillStyle = PAL.water; ctx.fill();
    ctx.restore();
    traceRing(ring);
    ctx.strokeStyle = PAL.waterRim; ctx.lineWidth = 0.1; ctx.stroke();
  }

  const ringDiscs = (r, fill) => {
    ctx.fillStyle = fill;
    for (const [cx, cy] of map.roundabouts || []) { ctx.beginPath(); ctx.arc(cx + 0.5, cy + 0.5, r, 0, Math.PI * 2); ctx.fill(); }
  };
  const bulbDiscs = (r, fill) => {
    ctx.fillStyle = fill;
    for (const [bx, by] of geo.bulbs || []) { ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2); ctx.fill(); }
  };
  const strokeRoads = (extra, style) => {
    ctx.strokeStyle = style; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const r of geo.curves) { ctx.lineWidth = r.w + extra; tracePath(r.line); ctx.stroke(); }
  };
  strokeRoads(PAVE_BAND, PAL.pave[0]); ringDiscs(2.68, PAL.pave[0]); bulbDiscs(BULB_R + 0.48, PAL.pave[0]);
  strokeRoads(0.26, PAL.kerb); ringDiscs(2.30, PAL.kerb); bulbDiscs(BULB_R + 0.1, PAL.kerb);
  strokeRoads(0.10, PAL.kerbLip); ringDiscs(2.25, PAL.kerbLip); bulbDiscs(BULB_R + 0.05, PAL.kerbLip);
  strokeRoads(0, PAL.asphalt[1]); ringDiscs(2.20, PAL.asphalt[1]); bulbDiscs(BULB_R, PAL.asphalt[1]);

  for (const [px, py, pw, ph] of geo.carparks) {
    ctx.fillStyle = PAL.kerb;
    ctx.beginPath(); ctx.roundRect(px - 0.14, py - 0.14, pw + 0.28, ph + 0.28, 0.5); ctx.fill();
    ctx.fillStyle = PAL.asphalt[1];
    ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 0.4); ctx.fill();
  }

  for (const r of geo.curves) if (r.w >= 1.9) { ctx.strokeStyle = PAL.edge; ctx.lineWidth = r.w - 0.22; tracePath(r.line); ctx.stroke(); }
  for (const r of geo.curves) if (r.w >= 1.9) { ctx.strokeStyle = PAL.asphalt[1]; ctx.lineWidth = r.w - 0.34; tracePath(r.line); ctx.stroke(); }
  ringDiscs(2.20, PAL.asphalt[1]); bulbDiscs(BULB_R, PAL.asphalt[1]);

  ctx.save();
  ctx.lineCap = 'butt';
  ctx.setLineDash([0.5, 0.58]);
  ctx.strokeStyle = PAL.centre; ctx.lineWidth = 0.07;
  for (const r of geo.curves) {
    if (r.w < 1.9) continue;
    if (r.w >= 2.6) {
      tracePathOffset(r.line, 0.09); ctx.stroke();
      tracePathOffset(r.line, -0.09); ctx.stroke();
    } else {
      tracePath(r.line); ctx.stroke();
    }
  }
  ctx.restore();

  for (const [cx, cy] of map.roundabouts || []) {
    const mx = cx + 0.5, my = cy + 0.5;
    const disc = (r, fill) => { ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(mx, my, r, 0, Math.PI * 2); ctx.fill(); };
    disc(2.20, PAL.asphalt[1]);
    ctx.strokeStyle = PAL.line; ctx.lineWidth = 0.08; ctx.setLineDash([0.32, 0.28]);
    ctx.beginPath(); ctx.arc(mx, my, 1.36, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    if (ready('roundabout')) {
      const img = art.roundabout, rw = 1.7, rh = rw * img.height / img.width;
      ctx.drawImage(img, mx - rw / 2, my - rh / 2, rw, rh);
    } else {
      disc(0.78, PAL.kerb); disc(0.66, PAL.parkFill); disc(0.38, 'rgba(54,78,40,0.42)');
    }
  }
  ctx.restore();
}

function drawFeatures() {
  const geo = wz && wz.geo;
  if (!geo) return;
  for (const f of geo.features || []) {
    if (!ready(f.art)) continue;
    ctx.fillStyle = PAL.shadow;
    ctx.fillRect(f.x + 0.08, f.y + 0.1, f.w, f.h);
    ctx.drawImage(art[f.art], f.x, f.y, f.w, f.h);
  }
}

function drawLots(y0, y1) {
  for (let y = y0; y <= y1; y++) for (let x = 0; x < W; x++) {
    const lot = lots.get(key(x, y));
    if (!lot) continue;
    ctx.fillStyle = PAL.shadow;
    ctx.beginPath(); ctx.roundRect(lot.fx + 0.06, lot.fy + 0.1, lot.fw - 0.06, lot.fh - 0.06, 0.1); ctx.fill();
    if (blit(lot.name, lot.fx, lot.fy, lot.fw, lot.fh)) continue;
    ctx.fillStyle = '#8e8776';
    ctx.beginPath(); ctx.roundRect(lot.fx + 0.04, lot.fy + 0.04, lot.fw - 0.08, lot.fh - 0.08, 0.08); ctx.fill();
  }
}

function drawProps(y0, y1) {
  for (let y = y0; y <= y1; y++) for (let x = 0; x < W; x++) {
    const p = propMap.get(key(x, y));
    if (!p) continue;
    const n = hash2(x * 3, y * 5);
    const jx = (n - 0.5) * 0.16, jy = (hash2(y, x) - 0.5) * 0.16;
    ctx.fillStyle = 'rgba(38,32,22,0.2)';
    ctx.beginPath(); ctx.ellipse(x + 0.55 + jx, y + 0.78 + jy, 0.3, 0.13, 0, 0, Math.PI * 2); ctx.fill();
    if (p.kind === 'bush') {
      if (blit(p.name, x + 0.15 + jx, y + 0.2 + jy, 0.62, 0.6)) continue;
      ctx.fillStyle = '#4f8442';
      ctx.beginPath(); ctx.arc(x + 0.5 + jx, y + 0.55 + jy, 0.26, 0, Math.PI * 2); ctx.fill();
      continue;
    }
    if (blit(p.name, x + jx, y - 0.18 + jy, 0.92, 1.05)) continue;
    ctx.fillStyle = '#46863f';
    ctx.beginPath(); ctx.arc(x + 0.5 + jx, y + 0.4 + jy, 0.34, 0, Math.PI * 2); ctx.fill();
  }
}

function drawHouses() {
  if (!wz) return;
  for (const h of wz.HOUSES) {
    ctx.fillStyle = PAL.shadow;
    ctx.beginPath(); ctx.roundRect(h.x + 0.06, h.y + 0.1, 0.94, 0.94, 0.1); ctx.fill();
    const name = HOUSE_ART[Math.floor(hash2(h.x + 31, h.y + 19) * HOUSE_ART.length)];
    if (blit(name, h.x, h.y, 1, 1)) continue;
    ctx.fillStyle = '#d9ccae';
    ctx.beginPath(); ctx.roundRect(h.x + 0.04, h.y + 0.04, 0.92, 0.92, 0.08); ctx.fill();
  }
}

function drawRestaurants() {
  if (!wz) return;
  const list = wz.RESTAURANTS.slice(0, level.restaurants.length);
  for (const r of list) {
    ctx.fillStyle = PAL.shadow;
    ctx.beginPath(); ctx.roundRect(r.x + 0.06, r.y + 0.1, 0.94, 0.94, 0.1); ctx.fill();
    if (!blit(r.art, r.x, r.y, 1, 1)) {
      ctx.fillStyle = r.roof;
      ctx.beginPath(); ctx.roundRect(r.x + 0.05, r.y + 0.05, 0.9, 0.9, 0.08); ctx.fill();
    }
    // A small pin with its dish, so restaurants are told apart at a glance.
    if (ready('pin-orange')) {
      const img = art['pin-orange'], pw = 0.5, ph = pw * img.height / img.width;
      ctx.drawImage(img, r.x + 0.25, r.y + 0.25 - ph, pw, ph);
      if (ready(r.food)) {
        ctx.fillStyle = '#fdf8ec';
        ctx.beginPath(); ctx.arc(r.x + 0.5, r.y + 0.25 - ph * 0.64, pw * 0.3, 0, Math.PI * 2); ctx.fill();
        const im = art[r.food], s = (pw * 0.5) / Math.max(im.width, im.height);
        ctx.drawImage(im, r.x + 0.5 - im.width * s / 2, r.y + 0.25 - ph * 0.64 - im.height * s / 2, im.width * s, im.height * s);
      }
    }
    if (zoom >= 22) {
      ctx.font = '600 0.19px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const y = r.y + 1.32;
      ctx.lineJoin = 'round'; ctx.lineWidth = 0.07; ctx.strokeStyle = 'rgba(30,24,16,0.8)';
      ctx.strokeText(r.name, r.x + 0.5, y);
      ctx.fillStyle = '#fffaf0';
      ctx.fillText(r.name, r.x + 0.5, y);
    }
  }
}

function drawMarkers() {
  if (!wz) return;
  for (const [x, y] of level.lights) {
    const mx = x + 0.5, my = y + 0.5;
    ctx.fillStyle = 'rgba(38,32,22,0.3)';
    ctx.beginPath(); ctx.ellipse(mx + 0.05, my + 0.12, 0.22, 0.1, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#25262a';
    ctx.beginPath(); ctx.roundRect(mx - 0.14, my - 0.38, 0.28, 0.62, 0.07); ctx.fill();
    const lamps = [['#e84f43', -0.27], ['#e8c94a', -0.13], ['#52bd67', 0.01]];
    for (const [colour, ly] of lamps) {
      ctx.fillStyle = colour;
      ctx.beginPath(); ctx.arc(mx, my + ly, 0.06, 0, Math.PI * 2); ctx.fill();
    }
  }
}

function drawStart() {
  if (!wz) return;
  const s = wz.START;
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.fillStyle = 'rgba(38,32,22,0.3)';
  ctx.beginPath(); ctx.ellipse(0.04, 0.1, 0.26, 0.13, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#c9772f';
  ctx.beginPath(); ctx.arc(0, 0, 0.24, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#fff8ec'; ctx.lineWidth = 0.05; ctx.stroke();
  ctx.fillStyle = '#fff8ec';
  ctx.beginPath(); ctx.moveTo(0.08, 0); ctx.lineTo(-0.06, -0.12); ctx.lineTo(-0.06, 0.12); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawGrid(x0, y0, x1, y1) {
  if (zoom < 13) return;
  ctx.save();
  ctx.strokeStyle = 'rgba(28,24,16,0.1)';
  ctx.lineWidth = 1 / zoom;
  ctx.beginPath();
  for (let x = x0; x <= x1 + 1; x++) { ctx.moveTo(x, y0); ctx.lineTo(x, y1 + 1); }
  for (let y = y0; y <= y1 + 1; y++) { ctx.moveTo(x0, y); ctx.lineTo(x1 + 1, y); }
  ctx.stroke();
  ctx.restore();
}

function drawHover() {
  if (!hover || gesture) return;
  const x = Math.floor(hover.x), y = Math.floor(hover.y);
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const tool = state.tool;
  if (tool === 'pan' || tool === 'erase') {
    ctx.strokeStyle = 'rgba(255,248,236,0.8)';
    ctx.lineWidth = 2 / zoom;
    ctx.strokeRect(x + 0.04, y + 0.04, 0.92, 0.92);
    return;
  }
  if (DRAG_TOOLS.has(tool)) {
    ctx.fillStyle = 'rgba(255,248,236,0.25)';
    ctx.fillRect(x, y, 1, 1);
    return;
  }
  const good = canPlace(tool, x, y);
  ctx.fillStyle = good ? 'rgba(255,248,236,0.35)' : 'rgba(200,60,40,0.3)';
  ctx.fillRect(x, y, 1, 1);
  ctx.strokeStyle = good ? 'rgba(255,255,255,0.9)' : 'rgba(230,80,60,0.9)';
  ctx.lineWidth = 2 / zoom;
  ctx.strokeRect(x + 0.03, y + 0.03, 0.94, 0.94);
}

// The thing you are about to place, floating on the tile under the pointer.
// Houses and trees use the same hash the real draw does, so the ghost is the
// sprite you get; an invalid tile keeps the ghost but the red ring says why.
function drawGhost() {
  if (!hover || gesture) return;
  const tool = state.tool;
  if (DRAG_TOOLS.has(tool) || tool === 'pan' || tool === 'erase') return;
  const x = Math.floor(hover.x), y = Math.floor(hover.y);
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const good = canPlace(tool, x, y);
  ctx.save();
  ctx.globalAlpha = good ? 0.72 : 0.36;
  switch (tool) {
    case 'house':
      blit(HOUSE_ART[Math.floor(hash2(x + 31, y + 19) * HOUSE_ART.length)], x, y, 1, 1);
      break;
    case 'building':
      blit(HOUSE_ART[Math.floor(hash2(x + 17, y + 29) * HOUSE_ART.length)], x, y, 1, 1);
      break;
    case 'tree': {
      const name = TREES[Math.floor(hash2(x * 3, y * 5) * TREES.length)];
      blit(name, x, y - 0.18, 0.92, 1.05);
      break;
    }
    case 'bush': {
      const name = BUSHES[Math.floor(hash2(x + 5, y * 3) * BUSHES.length)];
      blit(name, x + 0.15, y + 0.2, 0.62, 0.6);
      break;
    }
    case 'restaurant': {
      const name = REST_ORDER[level.restaurants.length % REST_ORDER.length];
      blit(name, x, y, 1, 1);
      break;
    }
    case 'light': {
      const mx = x + 0.5, my = y + 0.5;
      ctx.fillStyle = '#25262a';
      ctx.beginPath(); ctx.roundRect(mx - 0.14, my - 0.38, 0.28, 0.62, 0.07); ctx.fill();
      for (const [colour, ly] of [['#e84f43', -0.27], ['#e8c94a', -0.13], ['#52bd67', 0.01]]) {
        ctx.fillStyle = colour;
        ctx.beginPath(); ctx.arc(mx, my + ly, 0.06, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'roundabout': {
      ctx.strokeStyle = good ? 'rgba(255,248,236,0.9)' : 'rgba(230,80,60,0.9)';
      ctx.lineWidth = 2 / zoom;
      ctx.setLineDash([0.4, 0.3]);
      ctx.beginPath(); ctx.arc(x + 0.5, y + 0.5, 2.0, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      break;
    }
    case 'start': {
      ctx.fillStyle = '#c9772f';
      ctx.beginPath(); ctx.arc(x + 0.5, y + 0.5, 0.24, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff8ec'; ctx.lineWidth = 0.05; ctx.stroke();
      ctx.fillStyle = '#fff8ec';
      ctx.beginPath(); ctx.moveTo(x + 0.58, y + 0.5); ctx.lineTo(x + 0.44, y + 0.38); ctx.lineTo(x + 0.44, y + 0.62); ctx.closePath(); ctx.fill();
      break;
    }
    default: break;
  }
  ctx.restore();
}

function drawPreview() {
  if (!gesture || gesture.mode !== 'drag') return;
  const a = gesture.a, b = gesture.b;
  if (state.tool === 'road') {
    const width = Number($('#road-width').value) || 2.9;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,248,236,0.8)';
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.strokeStyle = 'rgba(60,50,36,0.4)';
    ctx.lineWidth = 2 / zoom;
    ctx.setLineDash([0.35, 0.25]);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.restore();
    return;
  }
  if (state.tool === 'footpath') {
    ctx.save();
    ctx.strokeStyle = 'rgba(200,187,150,0.9)';
    ctx.lineWidth = PATH_W; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.strokeStyle = 'rgba(60,50,36,0.4)';
    ctx.lineWidth = 2 / zoom; ctx.setLineDash([0.3, 0.25]);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.restore();
    return;
  }
  const x0 = Math.floor(Math.min(a.x, b.x)), y0 = Math.floor(Math.min(a.y, b.y));
  const x1 = Math.ceil(Math.max(a.x, b.x)), y1 = Math.ceil(Math.max(a.y, b.y));
  ctx.save();
  ctx.fillStyle = state.tool === 'pond' ? 'rgba(91,147,196,0.45)'
    : state.tool === 'carpark' ? 'rgba(83,87,92,0.5)'
      : state.tool.startsWith('feature-') ? 'rgba(131,168,98,0.45)'
        : 'rgba(255,248,236,0.32)';
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  ctx.strokeStyle = 'rgba(255,248,236,0.9)';
  ctx.lineWidth = 2 / zoom;
  ctx.setLineDash([0.3, 0.2]);
  ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
  ctx.restore();
}

// ---------- pointers ----------
const DRAG_TOOLS = new Set(['road', 'footpath', 'park', 'pond', 'carpark',
  'feature-green', 'feature-tennis', 'feature-allotment', 'feature-playground']);
const pointers = new Map();
let gesture = null;
let hover = null;
let spaceDown = false;

const snapHalf = (w) => ({ x: Math.round(w.x * 2) / 2, y: Math.round(w.y * 2) / 2 });

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener('pointerdown', (e) => {
  const s = localPos(e);
  pointers.set(e.pointerId, s);
  canvas.setPointerCapture(e.pointerId);
  if (pointers.size === 2) {
    const [p1, p2] = [...pointers.values()];
    const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    gesture = { mode: 'pinch', d0: Math.hypot(p1.x - p2.x, p1.y - p2.y), zoom0: zoom, world: screenToWorld(mid.x, mid.y) };
    return;
  }
  if (e.button === 2) { gesture = { mode: 'erase', w: screenToWorld(s.x, s.y) }; return; }
  const pan = state.tool === 'pan' || e.button === 1 || (e.button === 0 && spaceDown);
  if (pan) {
    gesture = { mode: 'pan', last: s };
    canvas.style.cursor = 'grabbing';
    return;
  }
  const w = screenToWorld(s.x, s.y);
  if (DRAG_TOOLS.has(state.tool)) {
    const p = snapHalf(w);
    const a = state.tool === 'footpath' ? p : snapNode(p);
    gesture = { mode: 'drag', a, b: a };
    draw();
  } else if (state.tool === 'erase') {
    gesture = { mode: 'erase', w };
  } else {
    gesture = { mode: 'click', start: s, w };
  }
});

canvas.addEventListener('pointermove', (e) => {
  const s = localPos(e);
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, s);
  hover = screenToWorld(s.x, s.y);
  if (!gesture) { draw(); return; }
  if (gesture.mode === 'pan') {
    cam.x -= (s.x - gesture.last.x) / zoom;
    cam.y -= (s.y - gesture.last.y) / zoom;
    gesture.last = s;
    clampCam();
    draw();
    return;
  }
  if (gesture.mode === 'pinch' && pointers.size >= 2) {
    const [p1, p2] = [...pointers.values()];
    const d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
    const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    zoom = clamp(gesture.zoom0 * (d / Math.max(1, gesture.d0)), MIN_ZOOM, MAX_ZOOM);
    cam.x = gesture.world.x - (mid.x - view.w / 2) / zoom;
    cam.y = gesture.world.y - (mid.y - view.h / 2) / zoom;
    clampCam();
    draw();
    return;
  }
  if (gesture.mode === 'drag') {
    gesture.b = snapNode(snapHalf(screenToWorld(s.x, s.y)));
    draw();
  }
});

function endPointer(e) {
  const s = localPos(e);
  pointers.delete(e.pointerId);
  const g = gesture;
  gesture = null;
  canvas.style.cursor = state.tool === 'pan' ? 'grab' : 'crosshair';
  if (!g) { draw(); return; }
  if (g.mode === 'pinch') { draw(); return; }
  if (g.mode === 'pan') { draw(); return; }
  if (g.mode === 'erase') {
    eraseAt(g.w.x, g.w.y);
    draw();
    return;
  }
  if (g.mode === 'drag') {
    const end = snapHalf(screenToWorld(s.x, s.y));
    commitDrag(state.tool, g.a, state.tool === 'footpath' ? end : snapNode(end));
    draw();
    return;
  }
  if (g.mode === 'click') {
    const moved = Math.hypot(s.x - g.start.x, s.y - g.start.y);
    if (moved < 6) placePoint(state.tool, g.w.x, g.w.y);
    draw();
  }
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', (e) => { pointers.delete(e.pointerId); gesture = null; draw(); });

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const s = localPos(e);
  zoomAt(zoom * Math.exp(-e.deltaY * 0.0014), s);
}, { passive: false });

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') setShareMenu(false);
  if (e.code === 'Space') { spaceDown = true; canvas.style.cursor = 'grab'; e.preventDefault(); }
  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
    e.preventDefault();
    if (e.shiftKey) redo(); else undo();
  }
  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') { e.preventDefault(); redo(); }
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') { spaceDown = false; canvas.style.cursor = state.tool === 'pan' ? 'grab' : 'crosshair'; }
});

// ---------- tools UI ----------
const TOOL_LIST = [
  ['pan', '\u270B', 'Pan'],
  ['road', '\u{1F6E3}', 'Road'],
  ['footpath', '\u{1F6B6}', 'Path'],
  ['house', '\u{1F3E0}', 'Delivery house'],
  ['building', '\u{1F3E2}', 'Building'],
  ['tree', '\u{1F333}', 'Tree'],
  ['bush', '\u{1F33F}', 'Bush'],
  ['restaurant', '\u{1F37D}', 'Restaurant'],
  ['light', '\u{1F6A6}', 'Traffic lights'],
  ['roundabout', '\u{1F504}', 'Roundabout'],
  ['park', '\u{1F332}', 'Park'],
  ['pond', '\u{1F4A7}', 'Pond'],
  ['feature-green', '\u{1F3DE}', 'Village green'],
  ['feature-tennis', '\u{1F3BE}', 'Tennis court'],
  ['feature-allotment', '\u{1F33E}', 'Allotments'],
  ['feature-playground', '\u{1F6DD}', 'Playground'],
  ['carpark', '\u{1F17F}', 'Car park'],
  ['start', '\u{1F697}', 'Start'],
  ['erase', '\u{1F9FD}', 'Erase'],
];

const HINTS = {
  pan: 'Drag to move the map. Pinch or use the wheel to zoom.',
  road: 'Drag from one end of the street to the other. Endpoints snap to existing road corners.',
  footpath: 'Drag to lay a footpath, like the one down to the duck pond. Paths are paint, not road.',
  house: 'Click open ground. A house off the pavement is delivered at the nearest road.',
  building: 'Click open ground for a solid building block (not a delivery address).',
  tree: 'Click to plant a tree. Trees are solid.',
  bush: 'Click to plant a bush. You can drive over it.',
  restaurant: 'Click pavement. The eight restaurants are drawn from the menu in the order you place them.',
  light: 'Click a crossroads for a signalised junction.',
  roundabout: 'Click where two roads cross for a roundabout with a planted island.',
  park: 'Drag out the village green. One park at a time; it replaces the last.',
  pond: 'Drag out a pond. Ponds are water: nothing builds or drives in them.',
  'feature-green': 'Drag out the village green.',
  'feature-tennis': 'Drag out a tennis court.',
  'feature-allotment': 'Drag out the allotments.',
  'feature-playground': 'Drag out a playground.',
  carpark: 'Drag out a car park. It is tarmac, so you can drive on it.',
  start: 'Click the tarmac where the shift begins.',
  erase: 'Click anything to remove it. A road removes the whole stretch.',
};

function setTool(id) {
  state.tool = id;
  for (const b of document.querySelectorAll('.tool')) b.classList.toggle('active', b.dataset.tool === id);
  $('#opt-road').classList.toggle('show', id === 'road');
  canvas.style.cursor = id === 'pan' ? 'grab' : 'crosshair';
  hintEl.textContent = HINTS[id] || '';
  hintEl.classList.remove('gone');
  draw();
}

for (const [id, ico, label] of TOOL_LIST) {
  const b = document.createElement('button');
  b.className = 'tool';
  b.dataset.tool = id;
  b.type = 'button';
  b.innerHTML = '<span class="ico" aria-hidden="true">' + ico + '</span><span>' + label + '</span>';
  b.addEventListener('click', () => { b.blur(); setTool(id); });
  $('#tools').appendChild(b);
}
setTool('house');

// ---------- toolbar ----------
$('#level-name').addEventListener('input', (e) => {
  level.name = e.target.value.slice(0, 32) || 'My town';
  hasEdited = true;
  updateTitle();
  autosave();
});

function toast(msg, cls) {
  toastEl.textContent = msg;
  toastEl.className = 'toast ' + (cls || '');
  toastEl.hidden = false;
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => { toastEl.hidden = true; }, 2400);
}

function hintDone() {
  if (!hasEdited) return;
  hintEl.classList.add('gone');
}

$('#btn-new').addEventListener('click', () => {
  if (hasEdited && !confirm('Start a fresh map? The current unsaved changes will be replaced.')) return;
  if (isSavedId(currentId)) saveMap(level, currentId);
  level = blankLevel();
  currentId = ID_NEW;
  undoStack.length = 0;
  redoStack.length = 0;
  hasEdited = false;
  $('#level-name').value = level.name;
  writeCurrentMapId(null);
  try { localStorage.setItem(LEVEL_KEY, JSON.stringify(level)); } catch { /* ignore */ }
  cam.x = level.start.x; cam.y = level.start.y; zoom = 26;
  rebuild();
  refreshPicker();
  toast('A fresh crossroads. Save gives it a name.', 'good');
});

$('#btn-save').addEventListener('click', saveCurrent);

// The file options live behind one Share button so the tool palette stays tools.
const shareMenu = $('#share-menu');
const shareToggle = $('#btn-share-menu');
function setShareMenu(open) {
  shareMenu.hidden = !open;
  shareToggle.setAttribute('aria-expanded', String(open));
}
shareToggle.addEventListener('click', (e) => {
  e.stopPropagation();
  setShareMenu(shareMenu.hidden);
});
document.addEventListener('pointerdown', (e) => {
  if (!shareMenu.hidden && !e.target.closest('.share-wrap')) setShareMenu(false);
});
for (const id of ['#btn-share', '#btn-link', '#btn-download', '#btn-load', '#btn-delete']) {
  $(id).addEventListener('click', () => setShareMenu(false));
}

$('#level-picker').addEventListener('change', (e) => switchTo(e.target.value));

$('#btn-delete').addEventListener('click', () => {
  if (!isSavedId(currentId)) return;
  if (!confirm('Delete \u201c' + level.name + '\u201d from your saved maps?')) return;
  deleteMap(currentId);
  level = townLevel();
  currentId = ID_TOWN;
  undoStack.length = 0;
  redoStack.length = 0;
  hasEdited = false;
  $('#level-name').value = level.name;
  writeCurrentMapId(ID_TOWN);
  cam.x = level.start.x; cam.y = level.start.y;
  rebuild();
  autosave();
  refreshPicker();
  toast('Deleted. Back to Wizzby.', 'good');
});

$('#btn-play').addEventListener('click', () => {
  const { ok, issues } = validateLevel(level);
  if (!ok) { toast(issues[0], 'bad'); return; }
  try { localStorage.setItem(LEVEL_KEY, JSON.stringify(level)); } catch { /* private mode */ }
  location.href = 'index.html?level=draft';
});

function levelLink() {
  const url = new URL('index.html', location.href);
  url.searchParams.set('level', encodeLevel(level));
  return url.href;
}

async function copyText(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch { /* fall through to the old copy command */ }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand && document.execCommand('copy');
  ta.remove();
  if (!ok) throw new Error('copy failed');
}

async function copyLevelLink() {
  try {
    await copyText(levelLink());
    toast('Link copied — it carries the whole town.', 'good');
  } catch {
    toast('Could not copy the link here; use Download .json instead.', 'bad');
  }
}

async function shareLevel() {
  const url = levelLink();
  if (navigator.share) {
    try {
      await navigator.share({ title: level.name, text: 'Play my Wizz Delivery level', url });
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return;   // the sheet was dismissed
    }
  }
  // No share sheet (or it failed): a copied link is the next best thing.
  await copyLevelLink();
}

$('#btn-link').addEventListener('click', copyLevelLink);
$('#btn-share').addEventListener('click', shareLevel);

function download() {
  const blob = new Blob([JSON.stringify(level, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  const slug = (level.name || 'wizz-level').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'wizz-level';
  a.href = URL.createObjectURL(blob);
  a.download = slug + '.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
$('#btn-download').addEventListener('click', download);

$('#btn-load').addEventListener('click', () => $('#file').click());
$('#file').addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const next = normalizeLevel(JSON.parse(String(reader.result)));
      level = next;
      currentId = ID_NEW;
      undoStack.length = 0;
      redoStack.length = 0;
      hasEdited = true;
      $('#level-name').value = level.name;
      writeCurrentMapId(null);
      rebuild();
      autosave();
      refreshPicker();
      toast('Loaded ' + level.name + '. Save gives it a name on the shelf.', 'good');
    } catch {
      toast('That file is not a Wizz Delivery level.', 'bad');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

$('#zoom-in').addEventListener('click', () => zoomAt(zoom * 1.25, { x: view.w / 2, y: view.h / 2 }));
$('#zoom-out').addEventListener('click', () => zoomAt(zoom / 1.25, { x: view.w / 2, y: view.h / 2 }));

// ---------- go ----------
$('#level-name').value = level.name;
cam.x = level.start.x;
cam.y = level.start.y;
rebuild();
fit();
autosave();
refreshPicker();
setTool('house');

// A handle for the tests, and for poking at a level from the console.
window.__editor = {
  get level() { return level; },
  set level(next) { level = normalizeLevel(next); undoStack.length = 0; redoStack.length = 0; $('#level-name').value = level.name; rebuild(); autosave(); },
  get mapId() { return currentId; },
  get sim() { return wz; },
  get tool() { return state.tool; },
  get hover() { return hover; },
  get zoom() { return zoom; },
  panBounds,
  panTo: (x, y) => { cam.x = x; cam.y = y; clampCam(); draw(); return { x: cam.x, y: cam.y }; },
  screenOf: (x, y) => {
    const r = canvas.getBoundingClientRect();
    return { x: r.left + view.w / 2 + (x - cam.x) * zoom, y: r.top + view.h / 2 + (y - cam.y) * zoom };
  },
  switchTo, saveCurrent, townLevel, listMaps,
  rebuild, blankLevel, validateLevel, encodeLevel, encode: () => encodeLevel(level),
  counts: () => ({ houses: wz && wz.HOUSES.length, restaurants: wz && wz.RESTAURANTS.slice(0, level.restaurants.length).length }),
  kindAt: (x, y) => wz && wz.kindAt(x, y),
  canPlace, placePoint, eraseAt,
  setTool, draw,
};
