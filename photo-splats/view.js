/* Photo Splats: the page. The viewer, the gallery, the maker and the shelf of your own.

   The gallery's scenes are files in gallery/ (made beforehand with SHARP, see PLAN.md). A
   visitor's own photo goes to whichever worker is better for this browser: sharp-worker.js
   (WebGPU, 2.6 GB, once installed from the button under "Make your own") if it is there, else
   depth-worker.js (quick, any device). What they make is kept in IndexedDB, never uploaded:
   a depth scene as its photo and depth map, so the depth slider can still reshape it; a
   SHARP scene as its .splat bytes. Any .ply or .splat dropped on the page opens too. */
import { createSplats } from './sim.js';
import * as P from './splats.js';
import { createRenderer } from './render.js';
import { CACHE as SHARP_CACHE, DATA as SHARP_DATA } from './sharp-config.js';
import { store } from '../lib/save.js';
import { frameLoop } from '../lib/loop.js';
import { expose } from '../lib/debug.js';

// ---------- constants ----------
const SAVE_KEY = 'photo-splats-save-v1';
const GRID = { light: 420, fine: 760 };   // long side of the splat grid for a depth scene
const DEPTH_INPUT = 760;                  // long side of the photo the depth model sees
const SHARP_KEEP = 1000000;               // splats kept from SHARP's ~1.2 million
const MINE_MAX = 8;
const DB_NAME = 'photo-splats', DB_STORE = 'mine';
const FLICK_MS = 70;

const $ = (id) => document.getElementById(id);
const save = store(SAVE_KEY);
const sim = createSplats({ saved: save.load(), on: (ev) => { if (ev === 'save') save.save(sim.toSave()); } });

const canvas = $('ps-view');
const webglLog = new URLSearchParams(location.search).has('webgl');
let R = null;
try { R = createRenderer(canvas, { webglLog }); } catch (e) { console.warn(e); R = null; }

let current = null;     // { id, info, scene, record? }
let gallery = [], mine = [];
let serial = 0, sorting = false, sortedAt = null, dirty = true, touched = false;

// ---------- busy overlay ----------
function busy(text, frac) {
  $('ps-busy').hidden = !text;
  if (!text) return;
  $('ps-busy-text').textContent = text;
  const bar = $('ps-bar').parentElement;
  bar.classList.toggle('spin', frac == null);
  $('ps-bar').style.width = frac == null ? '' : `${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%`;
}
const mb = (b) => (b / 1048576).toFixed(b > 1e9 ? 0 : 1);
function progressText(what, p) {
  if (!p.total) return `${what}…`;
  const total = p.total > 1e9 ? `${(p.total / 1073741824).toFixed(1)} GB` : `${mb(p.total)} MB`;
  const got = p.total > 1e9 ? `${(p.loaded / 1073741824).toFixed(2)}` : mb(p.loaded);
  return `${what}… ${got} of ${total}`;
}

// ---------- sorting ----------
const sorter = new Worker(new URL('./sort-worker.js', import.meta.url), { type: 'module' });
sorter.onmessage = (ev) => {
  const m = ev.data;
  sorting = false;
  if (m.scene !== serial || !R) return;
  R.setOrder(m.order);
  dirty = true;
};
function needsSort(pose) {
  if (!sortedAt) return true;
  const d = Math.hypot(pose.eye[0] - sortedAt.eye[0], pose.eye[1] - sortedAt.eye[1], pose.eye[2] - sortedAt.eye[2]);
  const f = 1 - (pose.fwd[0] * sortedAt.fwd[0] + pose.fwd[1] * sortedAt.fwd[1] + pose.fwd[2] * sortedAt.fwd[2]);
  return d > sim.S.cam.base * 0.004 || f > 1e-5;
}
function requestSort(pose) {
  if (sorting || !current) return;
  sorting = true;
  sortedAt = { eye: pose.eye.slice(), fwd: pose.fwd.slice() };
  sorter.postMessage({ type: 'sort', scene: serial, eye: pose.eye, fwd: pose.fwd });
}

// ---------- showing a scene ----------
function show(scene, info) {
  if (!R) return;
  serial++;
  const n = R.setScene(scene, P.covariances(scene));
  const b = info.object ? P.bounds(scene) : null;
  const w = scene.meta.width || info.width, h = scene.meta.height || info.height;
  sim.open({
    ...info,
    focal: scene.meta.focal || info.focal,
    aspect: w && h ? w / h : 0,
    focus: P.focusDepth(scene),
    centre: b && b.centre, size: b && b.size,
  });
  const pose = sim.pose();
  R.setOrder(P.sortByDepth(scene.pos, n, pose.eye, pose.fwd));
  sortedAt = { eye: pose.eye.slice(), fwd: pose.fwd.slice() };
  sorting = false;
  sorter.postMessage({ type: 'scene', scene: serial, count: n, pos: scene.pos.slice(0, n * 3) });
  current = { id: info.id, info, scene };
  dirty = true;
  $('ps-caption').innerHTML = '';
  $('ps-caption').append(info.title || 'Untitled');
  const small = document.createElement('small');
  small.textContent = `${n.toLocaleString()} splats · ${info.made === 'sharp' ? 'SHARP' : info.made === 'depth' ? 'depth guess' : 'file'}`;
  $('ps-caption').append(small);
  for (const id of ['ps-dl-splat', 'ps-dl-ply', 'ps-reset', 'ps-snap']) $(id).disabled = false;
  syncDepthCtl();
  if (current.record && current.record.kind === 'depth') $('ps-range').value = current.record.range;
  markCurrent();
}

function markCurrent() {
  document.querySelectorAll('.ps-card').forEach((c) => c.setAttribute('aria-current', String(!!current && c.dataset.id === current.id)));
}

/* Depth and Detail only mean something for a depth scene; a SHARP or dropped-in one has no
   reshapable guess, so the controls are not shown at all rather than shown dead. */
function syncDepthCtl() {
  $('ps-depth-ctl').hidden = !(current && current.record && current.record.kind === 'depth');
}

// ---------- gallery ----------
async function fetchBytes(url, label) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  // Content-Length is the on-the-wire size. With gzip/br (GitHub Pages) it can be
  // smaller than the decompressed body, so it is only a progress hint — never the
  // buffer length. Allocating from it and streaming in threw "offset is out of bounds"
  // on the live site while localhost (no compression) was fine.
  const hinted = +res.headers.get('content-length') || 0;
  if (!res.body) return res.arrayBuffer();
  const reader = res.body.getReader(), chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.byteLength;
    const known = hinted > 0 && got <= hinted;
    busy(progressText(label, { loaded: got, total: known ? hinted : 0 }), known ? got / hinted : null);
  }
  const out = new Uint8Array(got);
  for (let i = 0, o = 0; i < chunks.length; i++) { out.set(chunks[i], o); o += chunks[i].byteLength; }
  return out.buffer;
}

function parseFile(buffer, name, meta = {}) {
  if (/\.ply$/i.test(name)) return P.fromPly(buffer);
  if (/\.splat$/i.test(name)) return P.fromSplat(buffer, meta);
  throw new Error(`Not a .ply or .splat file: ${name}`);
}

async function openGallery(item) {
  try {
    busy(`Loading ${item.title}…`, 0);
    const buf = await fetchBytes('gallery/' + item.file, `Loading ${item.title}`);
    const scene = parseFile(buf, item.file, { width: item.width, height: item.height, focal: item.focal });
    if (item.flip) P.flipYZ(scene);
    const info = { ...item, id: 'g:' + item.id };
    if (!item.surround) {
      // wrap the photo's own pixels around it, so every gallery photo turns all the way round
      const photo = await loadPhoto(item.img, 512);
      const wrapped = photoSurround(scene, photo, scene.meta.focal || item.focal, 'g:' + item.id);
      busy('');
      show(wrapped, { ...info, orbit: 180 });
      return;
    }
    busy('');
    show(scene, info);
  } catch (e) { busy(''); toast(String(e.message || e)); }
}

function card(id, title, img, onOpen, onDelete) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'ps-card'; b.dataset.id = id; b.title = title;
  const im = document.createElement('img'); im.src = img; im.alt = ''; im.loading = 'lazy';
  const sp = document.createElement('span'); sp.textContent = title;
  b.append(im, sp);
  b.addEventListener('click', onOpen);
  if (onDelete) {
    const x = document.createElement('span');
    x.className = 'ps-del'; x.setAttribute('role', 'button'); x.setAttribute('aria-label', 'Delete ' + title); x.textContent = '×';
    x.addEventListener('click', (ev) => { ev.stopPropagation(); onDelete(); });
    b.append(x);
  }
  return b;
}

async function loadGallery() {
  try {
    const res = await fetch('gallery/gallery.json');
    gallery = res.ok ? await res.json() : [];
  } catch (e) { gallery = []; }
  const box = $('ps-gallery');
  box.innerHTML = '';
  for (const g of gallery) box.append(card('g:' + g.id, g.title, g.img, () => openGallery(g)));
  markCurrent();
}

// ---------- your own (IndexedDB) ----------
function db() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) { reject(new Error('no IndexedDB')); return; }
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(DB_STORE, { keyPath: 'id' });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function dbDo(mode, fn) {
  try {
    const d = await db();
    return await new Promise((resolve, reject) => {
      const tx = d.transaction(DB_STORE, mode), st = tx.objectStore(DB_STORE);
      const req = fn(st);
      tx.oncomplete = () => resolve(req && req.result);
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) { return null; }
}
const dbAll = async () => (await dbDo('readonly', (st) => st.getAll())) || [];
const dbPut = (rec) => dbDo('readwrite', (st) => st.put(rec));
const dbDel = (id) => dbDo('readwrite', (st) => st.delete(id));
const dbGet = (id) => dbDo('readonly', (st) => st.get(id));

async function refreshMine() {
  mine = (await dbAll()).sort((a, b) => b.date - a.date);
  const box = $('ps-mine');
  box.innerHTML = '';
  for (const r of mine) {
    box.append(card(r.id, r.title, r.thumb, () => openMine(r), async () => {
      await dbDel(r.id);
      if (current && current.id === r.id) current.record = null;
      refreshMine();
    }));
  }
  $('ps-mine-empty').hidden = mine.length > 0;
  markCurrent();
}

async function keep(rec) {
  await dbPut(rec);
  const all = (await dbAll()).sort((a, b) => b.date - a.date);
  for (const old of all.slice(MINE_MAX)) await dbDel(old.id);
  await refreshMine();
}

const surroundCache = new Map();
/* the invented surround built from a photo's own pixels, so a photo turns all the way round
   into its own colours. Cached per record: the photo and its lens do not change, even when
   the depth slider reshapes the scene. */
function photoSurround(scene, photo, focal, key) {
  let eq = surroundCache.get(key);
  if (!eq) {
    const fpx = focal * photo.height;
    eq = P.equirectFromPhoto(photo.rgba, photo.width, photo.height, { halfW: photo.width / (2 * fpx), halfH: photo.height / (2 * fpx) });
    surroundCache.set(key, eq);
  }
  return P.withSurround(scene, { rgba: eq.rgba, width: eq.width, height: eq.height, keep: scene.count + 60000, shell: 60000, step: 2 });
}

function sceneFromRecord(r) {
  if (r.kind === 'depth') {
    const scene = P.fromDepth({ rgba: r.rgba, width: r.width, height: r.height, depth: r.depth, dw: r.dw, dh: r.dh, range: r.range, mm35: r.mm35 });
    return photoSurround(scene, r, scene.meta.focal, 'd' + r.id);
  }
  const scene = P.fromSplat(r.buffer, r.meta);
  return r.photo ? photoSurround(scene, r.photo, scene.meta.focal || r.meta.focal, 's' + r.id) : scene;
}
/* reads the stored copy afresh: the slider may have reshaped it since the list was drawn */
async function openMine(listed) {
  const r = (listed && (await dbGet(listed.id))) || listed;
  if (!r) return;
  try {
    const round = r.kind === 'depth' || r.photo ? 180 : undefined;
    show(sceneFromRecord(r), { id: r.id, title: r.title, made: r.made, orbit: round, width: r.width || (r.meta && r.meta.width), height: r.height || (r.meta && r.meta.height), focal: r.meta && r.meta.focal, object: r.object });
    current.record = r;
    syncDepthCtl();
    if (r.kind === 'depth') $('ps-range').value = r.range;
  } catch (e) { toast('Could not open that one: ' + (e.message || e)); }
}

// ---------- making ----------
let depthWorker = null, sharpWorker = null, jobs = 0;

function worker(kind) {
  if (kind === 'depth') return (depthWorker = depthWorker || new Worker(new URL('./depth-worker.js', import.meta.url), { type: 'module' }));
  return (sharpWorker = sharpWorker || new Worker(new URL('./sharp-worker.js', import.meta.url), { type: 'module' }));
}
/* one request to a worker, reporting its progress on the busy overlay */
function ask(kind, msg, transfer = [], label = 'Downloading the model') {
  const w = worker(kind), id = ++jobs;
  return new Promise((resolve, reject) => {
    const onMsg = (ev) => {
      const m = ev.data;
      if (m.type === 'progress') { busy(progressText(`${label} (${m.file.split('/').pop()})`, m), m.total ? m.loaded / m.total : null); return; }
      if (m.type === 'status') { busy(m.text); return; }
      if (m.id !== undefined && m.id !== id) return;
      if (m.type === 'error') { w.removeEventListener('message', onMsg); reject(new Error(m.why)); return; }
      if (m.type === msg.reply) { w.removeEventListener('message', onMsg); resolve(m); }
    };
    w.addEventListener('message', onMsg);
    w.postMessage({ ...msg, id }, transfer);
  });
}

function thumbOf(bitmap) {
  const c = document.createElement('canvas'), w = 240, h = Math.round((240 * bitmap.height) / bitmap.width);
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  return c.toDataURL('image/jpeg', 0.75);
}
function pixelsOf(bitmap, long) {
  const k = Math.min(1, long / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(8, Math.round(bitmap.width * k)), h = Math.max(8, Math.round(bitmap.height * k));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingQuality = 'high';
  g.drawImage(bitmap, 0, 0, w, h);
  return { c, w, h, rgba: g.getImageData(0, 0, w, h).data };
}
/* a photo at a URL, downsampled to `long` on its long side, as the pixels the surround is
   built from (gallery card images are the photos themselves, not thumbnails) */
async function loadPhoto(src, long) {
  const res = await fetch(src);
  if (!res.ok) throw new Error(`${src}: HTTP ${res.status}`);
  const bitmap = await createImageBitmap(await res.blob());
  const p = pixelsOf(bitmap, long);
  return { rgba: p.rgba, width: p.w, height: p.h };
}
const titleOf = (name) => (name || 'My photo').replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').slice(0, 40) || 'My photo';

async function makeDepth(file, bitmap, mm35) {
  busy('Getting the depth model ready…');
  const input = pixelsOf(bitmap, DEPTH_INPUT);
  const blob = await new Promise((r) => input.c.toBlob(r, 'image/png'));
  const d = await ask('depth', { type: 'depth', reply: 'depth', blob }, [], 'Downloading the depth model');
  busy('Laying out the splats…');
  const grid = pixelsOf(bitmap, GRID[sim.S.settings.quality] || GRID.light);
  const rec = {
    id: 'm:' + Date.now().toString(36), title: titleOf(file.name), made: 'depth', kind: 'depth', date: Date.now(),
    thumb: thumbOf(bitmap), rgba: grid.rgba, width: grid.w, height: grid.h, depth: d.data, dw: d.dw, dh: d.dh,
    range: +$('ps-range').value, mm35,
  };
  const scene = sceneFromRecord(rec);
  busy('');
  show(scene, { id: rec.id, title: rec.title, made: 'depth', width: rec.width, height: rec.height, orbit: 180 });
  current.record = rec;
  syncDepthCtl();
  await keep(rec);
}

/* Can this browser run SHARP, and does it already have the weights? Asked in the page, not
   in the worker, so a visitor who never installs it never loads ONNX Runtime. */
async function sharpCheck() {
  let ok = false, why = 'This browser has no WebGPU.';
  try {
    const a = navigator.gpu && (await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }));
    if (a) { ok = true; why = ''; if (a.limits.maxBufferSize < 1 << 30) why = 'This GPU may be too small for SHARP.'; }
  } catch (e) { ok = false; why = 'This browser could not get a graphics card for SHARP.'; }
  let cached = false;
  try { cached = !!(await (await caches.open(SHARP_CACHE)).match(SHARP_DATA)); } catch (e) { /* no cache */ }
  return { ok, why, cached };
}

async function makeSharp(file, bitmap, mm35) {
  const chk = await sharpCheck();
  if (!chk.ok) { busy(''); toast(chk.why + ' Your photo was not made.'); return; }
  if (!chk.cached && !(await askDialog())) { busy(''); return; }
  const W = bitmap.width, H = bitmap.height, focal = P.focalPx(W, H, mm35);
  const thumb = thumbOf(bitmap);
  const photo = pixelsOf(bitmap, 256);
  const m = await ask('sharp', { type: 'sharp', reply: 'scene', bitmap, focal, keep: SHARP_KEEP }, [bitmap], 'Downloading SHARP');
  const scene = m.scene;
  const rec = {
    id: 'm:' + Date.now().toString(36), title: titleOf(file.name), made: 'sharp', kind: 'splat', date: Date.now(),
    thumb, meta: scene.meta, buffer: P.toSplat(scene), secs: m.secs, photo: { rgba: photo.rgba, width: photo.w, height: photo.h },
  };
  busy('');
  show(sceneFromRecord(rec), { id: rec.id, title: rec.title, made: 'sharp', orbit: 180 });
  current.record = rec;
  await keep(rec);
  await refreshSharp();
}

async function openSplatFile(file) {
  busy(`Reading ${file.name}…`);
  const buf = await file.arrayBuffer();
  const scene = parseFile(buf, file.name);
  const object = !scene.meta.focal;
  const info = { id: 'm:' + Date.now().toString(36), title: titleOf(file.name), made: 'file', object };
  busy('');
  show(scene, info);
  // keep it only if it is small enough to be polite to IndexedDB
  if (scene.count <= 1500000) {
    const thumb = canvas.toDataURL('image/jpeg', 0.6);
    const rec = { ...info, kind: 'splat', date: Date.now(), thumb, meta: scene.meta, buffer: P.toSplat(scene) };
    current.record = rec;
    await keep(rec);
  }
}

async function handleFile(file, how = 'auto') {
  if (!file) return;
  try {
    if (/\.(ply|splat)$/i.test(file.name)) { await openSplatFile(file); return; }
    if (!/^image\//.test(file.type)) { toast('That is not a photo.'); return; }
    busy('Reading the photo…');
    const bytes = new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer());
    const mm35 = P.exifFocal35(bytes) || P.DEFAULT_FOCAL_MM;
    let bitmap;
    try { bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { bitmap = await createImageBitmap(file); }
    // the better one if this browser has it: SHARP when it is installed, the depth guess otherwise
    if (how === 'auto') how = (await refreshSharp()).ready ? 'sharp' : 'depth';
    if (how === 'sharp') await makeSharp(file, bitmap, mm35);
    else await makeDepth(file, bitmap, mm35);
  } catch (e) {
    busy('');
    toast(String((e && e.message) || e));
  }
}

// ---------- toast ----------
let toastTimer = 0;
function toast(text) {
  const h = $('ps-hint');
  h.textContent = text; h.classList.remove('gone');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => h.classList.add('gone'), 6000);
}

// ---------- input ----------
const pointers = new Map();
let lastMove = 0, pinch = null;
const fpxNow = () => sim.screenFocal(canvas.clientWidth, canvas.clientHeight);

function firstTouch() {
  if (touched) return;
  touched = true;
  $('ps-hint').classList.add('gone');
}
canvas.addEventListener('pointerdown', (ev) => {
  try { canvas.setPointerCapture(ev.pointerId); } catch (e) { /* a synthetic pointer */ }
  pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY, pan: ev.button === 2 || ev.shiftKey });
  sim.hold(true);
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  }
  firstTouch();
});
canvas.addEventListener('pointermove', (ev) => {
  const p = pointers.get(ev.pointerId);
  if (!p) return;
  const dx = ev.clientX - p.x, dy = ev.clientY - p.y;
  p.x = ev.clientX; p.y = ev.clientY;
  if (pointers.size === 1) {
    if (p.pan) sim.pan(dx, dy, fpxNow()); else sim.drag(dx, dy);
  } else if (pointers.size === 2 && pinch) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    if (d > 0 && pinch.d > 0) sim.zoom(pinch.d / d);
    sim.pan(mx - pinch.mx, my - pinch.my, fpxNow());
    pinch = { d, mx, my };
  }
  lastMove = performance.now();
  dirty = true;
});
function up(ev) {
  if (!pointers.delete(ev.pointerId)) return;
  if (pointers.size < 2) pinch = null;
  if (pointers.size === 0) sim.hold(false, performance.now() - lastMove < FLICK_MS);
}
canvas.addEventListener('pointerup', up);
canvas.addEventListener('pointercancel', up);
canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());
canvas.addEventListener('wheel', (ev) => {
  ev.preventDefault();
  sim.zoom(Math.exp(ev.deltaY * (ev.deltaMode === 1 ? 0.05 : 0.0015)));
  firstTouch();
}, { passive: false });
canvas.addEventListener('dblclick', () => sim.reset());
canvas.addEventListener('keydown', (ev) => {
  const k = ev.key, step = 12;
  if (k === 'ArrowLeft') sim.drag(-step, 0);
  else if (k === 'ArrowRight') sim.drag(step, 0);
  else if (k === 'ArrowUp') sim.drag(0, -step);
  else if (k === 'ArrowDown') sim.drag(0, step);
  else if (k === '+' || k === '=') sim.zoom(0.9);
  else if (k === '-' || k === '_') sim.zoom(1.1);
  else if (k === '0') sim.reset();
  else return;
  ev.preventDefault();
  sim.hold(false, false);
  firstTouch();
});

// ---------- buttons ----------
function syncSway() {
  const on = sim.S.settings.sway;
  $('ps-sway').textContent = on ? 'Sway on' : 'Sway off';
  $('ps-sway').setAttribute('aria-pressed', String(on));
}
$('ps-sway').addEventListener('click', () => { sim.setSway(!sim.S.settings.sway); syncSway(); });
$('ps-howto').addEventListener('click', () => $('ps-help').showModal());
$('ps-reset').addEventListener('click', () => sim.reset());
const slug = (t) => (t || 'splat').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'splat';
function download(kind) {
  if (!current) return;
  const buf = kind === 'ply' ? P.toPly(current.scene) : P.toSplat(current.scene);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([buf], { type: 'application/octet-stream' }));
  a.download = `${slug(current.info.title)}.${kind}`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function setStyle(name) {
  if (!R) return;
  R.setStyle(name);
  sim.set('style', R.style);
  $('ps-style').value = R.style;
  dirty = true;
}
$('ps-style').addEventListener('change', (ev) => setStyle(ev.target.value));
/* the view as it is on screen, in the look it is in */
function snapshot() {
  if (!current || !R) return;
  canvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${slug(current.info.title)}${R.style === 'photo' ? '' : '-' + R.style}.png`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, 'image/png');
}
$('ps-snap').addEventListener('click', snapshot);
$('ps-dl-splat').addEventListener('click', () => download('splat'));
$('ps-dl-ply').addEventListener('click', () => download('ply'));
for (const id of ['ps-dl-splat', 'ps-dl-ply', 'ps-reset', 'ps-snap']) $(id).disabled = true;

$('ps-file').addEventListener('change', (ev) => { const f = ev.target.files[0]; ev.target.value = ''; handleFile(f); });
const drop = $('ps-drop');
for (const t of ['dragenter', 'dragover']) document.addEventListener(t, (ev) => { ev.preventDefault(); drop.classList.add('over'); });
for (const t of ['dragleave', 'drop']) document.addEventListener(t, (ev) => { ev.preventDefault(); if (t === 'drop' || !ev.relatedTarget) drop.classList.remove('over'); });
document.addEventListener('drop', (ev) => handleFile(ev.dataTransfer && ev.dataTransfer.files[0]));

$('ps-quality').value = sim.S.settings.quality;
$('ps-quality').addEventListener('change', (ev) => sim.set('quality', ev.target.value));
$('ps-range').value = sim.S.settings.range;
let reshape = 0;
$('ps-range').addEventListener('input', (ev) => {
  const v = +ev.target.value;
  sim.set('range', v);
  const r = current && current.record;
  if (!r || r.kind !== 'depth') return;
  clearTimeout(reshape);
  reshape = setTimeout(() => {
    r.range = v;
    const yaw = sim.S.cam.yaw, pitch = sim.S.cam.pitch;
    show(sceneFromRecord(r), current.info);
    current.record = r;
    sim.S.cam.yaw = yaw; sim.S.cam.pitch = pitch;
    syncDepthCtl();
    dbPut(r);
  }, 120);
});
// ---------- the model: install or delete SHARP ----------
const askEl = $('ps-ask');
const ASK_INSTALL = {
  title: askEl.querySelector('h2').textContent,
  body: askEl.querySelector('p').innerHTML,
  go: askEl.querySelector('.ps-go').textContent,
};
const ASK_DELETE = {
  title: 'Delete SHARP?',
  body: 'The <b>2.6 GB</b> model is removed from this browser. Your photos and scenes are not touched, and you can install it again later.',
  go: 'Delete it',
};
/* the licence-and-size question, answered by the visitor. A script (or a test) counts as yes. */
function askDialog(text = ASK_INSTALL) {
  const d = askEl;
  d.querySelector('h2').textContent = text.title;
  d.querySelector('p').innerHTML = text.body;
  d.querySelector('.ps-go').textContent = text.go;
  d.returnValue = '';
  return new Promise((resolve) => {
    d.addEventListener('close', () => resolve(d.returnValue === 'yes'), { once: true });
    d.showModal();
  });
}

let sharp = { ok: false, cached: false, ready: false, why: '' };

function paintSharp() {
  const el = $('ps-sharp-state'), b = $('ps-sharp-install');
  el.classList.toggle('on', sharp.ready);
  // always offer the delete when something is stored: those 2.6 GB are the visitor's
  b.hidden = !sharp.ok && !sharp.cached;
  b.textContent = sharp.cached ? 'Delete SHARP (2.6 GB)' : 'Install SHARP (2.6 GB)';
  const why = sharp.why ? ' ' + sharp.why : '';
  el.textContent = !sharp.ok
    ? (sharp.cached ? 'SHARP is installed, but this browser cannot run it.' + why : 'This browser cannot run SHARP.' + why)
    : sharp.ready ? 'SHARP is installed: photos are made in full 3D.'
    : 'SHARP is not installed: photos get the quick depth guess.' + why;
}
/* asks the browser afresh, so a cache that the browser evicted is noticed */
async function refreshSharp() {
  try {
    const c = await sharpCheck();
    sharp = { ok: !!c.ok, cached: !!c.cached, ready: !!(c.ok && c.cached), why: c.why || '' };
  } catch (e) {
    sharp = { ok: false, cached: false, ready: false, why: '' };
  }
  paintSharp();
  return sharp;
}

$('ps-sharp-install').addEventListener('click', async () => {
  if (!sharp.cached) {
    if (!(await askDialog(ASK_INSTALL))) return;
    try {
      busy('Downloading SHARP…');
      const r = await ask('sharp', { type: 'install', reply: 'installed' }, [], 'Downloading SHARP');
      busy('');
      toast(r.cached ? 'SHARP installed. Photos are now made in full 3D.'
        : 'SHARP downloaded, but this browser would not keep it; it will download again next time.');
    } catch (e) {
      busy('');
      toast(String((e && e.message) || e));
    }
  } else {
    if (!(await askDialog(ASK_DELETE))) return;
    try { await ask('sharp', { type: 'forget', reply: 'forgot' }); } catch (e) { /* nothing kept */ }
    toast('SHARP deleted. Photos now get the quick depth guess.');
  }
  await refreshSharp();
});

// ---------- frame ----------
let lastPose = '';
frameLoop((dt) => {
  if (!R || !current) return;
  sim.step(dt);
  const pose = sim.pose();
  const key = pose.eye.map((v) => v.toFixed(5)).join() + pose.fwd.map((v) => v.toFixed(5)).join();
  const fpx = sim.screenFocal(canvas.clientWidth, canvas.clientHeight) * Math.min(window.devicePixelRatio || 1, 2);
  const size = canvas.clientWidth + 'x' + canvas.clientHeight;
  if (key !== lastPose || dirty || size !== R._size) {
    R.draw(pose, fpx);
    R._size = size; lastPose = key; dirty = false;
  }
  if (needsSort(pose)) requestSort(pose);
}).start();

// ---------- start ----------
syncSway();
setStyle(sim.S.settings.style);
refreshSharp();
if (!R) {
  busy('This browser cannot show splats: it has no WebGL2.');
  $('ps-bar').parentElement.hidden = true;
}
(async () => {
  await Promise.all([loadGallery(), refreshMine()]);
  const last = sim.S.last;
  const g = gallery.find((x) => 'g:' + x.id === last), m = mine.find((x) => x.id === last);
  if (m) openMine(m);
  else if (g) openGallery(g);
  else if (gallery.length) openGallery(gallery[0]);
})();

// ---------- debug handle ----------
expose('__splats', {
  sim, P,
  get renderer() { return R; },
  get current() { return current; },
  get gallery() { return gallery; },
  get mine() { return mine; },
  show: (scene, info) => show(scene, { id: 'test', title: 'Test', ...info }),
  openGallery: (id) => openGallery(gallery.find((g) => g.id === id) || gallery[0]),
  openMine: (id) => openMine(mine.find((r) => r.id === id)),
  /* make a scene from a photo at a URL, as if it were chosen: 'depth' or 'sharp' */
  async makeFromUrl(url, how = 'auto') {
    const blob = await (await fetch(url)).blob();
    const file = new File([blob], url.split('/').pop(), { type: blob.type || 'image/jpeg' });
    if (how === 'sharp') {
      // a script cannot answer the dialog, so it counts as yes
      const d = $('ps-ask'), real = d.showModal;
      d.showModal = () => { d.returnValue = 'yes'; d.dispatchEvent(new Event('close')); };
      try { await handleFile(file, 'sharp'); } finally { d.showModal = real; }
    } else await handleFile(file, how);
    return current && { id: current.id, count: current.scene.count, secs: current.record && current.record.secs };
  },
  setStyle,
  exportSplat: () => current && P.toSplat(current.scene),
  exportPly: () => current && P.toPly(current.scene),
  text() {
    const c = sim.S.cam;
    return JSON.stringify({
      scene: current && current.id, count: current && current.scene.count, drawn: R && R.count,
      yaw: +c.yaw.toFixed(3), pitch: +c.pitch.toFixed(3), dist: +c.dist.toFixed(3), sway: sim.S.settings.sway, sorting,
      style: R && R.style,
    });
  },
});
