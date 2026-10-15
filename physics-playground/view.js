/* Physics Playground: the page. The tabs, the one 2D canvas the flat toys share (each
   toy's world is 1200x750, fitted into whatever the stage is), pointer and keys routed to
   the toy on show, the loop, the sound switch, the save and the debug handle. Each toy's
   drawing and controls live in its own view-*.js; the sand tray's three.js view is only
   loaded the first time its tab is opened. See sim.js for the physics. */
import { createPlayground, TOYS } from './sim.js';
import { store } from '../lib/save.js';
import { createAudio } from '../lib/audio.js';
import { fixedLoop } from '../lib/loop.js';
import { expose } from '../lib/debug.js';
import { createGummyView } from './view-gummy.js';
import { createLavaView } from './view-lava.js';
import { createPendulumView } from './view-pendulum.js';

// ---------- constants ----------
const SAVE_KEY = 'physics-playground-save-v1';
const WORLD_W = 1200, WORLD_H = 750;
const HINTS = {
  gummy: 'Grab a bear and pull. Tap empty space for another.',
  lava: 'Drag through the lava to slice it.',
  sand: 'Tap the sand to drop a shape. Tap a shape to lift it out.',
  pendulum: 'Drag a bob to set it, then let go.',
};

const saver = store(SAVE_KEY);
const audio = createAudio('physics-playground-sound');
const handlers = {};
const pg = createPlayground({
  saved: saver.load(),
  rnd: Math.random,
  on(ev, data) {
    const [toy, name] = ev.split(':');
    const v = views[toy];
    if (v && v.event) v.event(name, data);
    if (handlers[ev]) handlers[ev](data);
  },
});

// ---------- the stage ----------
const stage = document.getElementById('stage');
const c2d = document.getElementById('c2d');
const g = c2d.getContext('2d');
const c3d = document.getElementById('c3d');
const hintEl = document.getElementById('hint');
const fit = { s: 1, ox: 0, oy: 0, dpr: 1, cw: 1, ch: 1 };
function resize() {
  const r = stage.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  fit.dpr = dpr;
  fit.cw = Math.max(1, Math.round(r.width * dpr)); fit.ch = Math.max(1, Math.round(r.height * dpr));
  if (c2d.width !== fit.cw || c2d.height !== fit.ch) { c2d.width = fit.cw; c2d.height = fit.ch; }
  fit.s = Math.min(fit.cw / WORLD_W, fit.ch / WORLD_H);
  fit.ox = (fit.cw - WORLD_W * fit.s) / 2; fit.oy = (fit.ch - WORLD_H * fit.s) / 2;
  for (const v of Object.values(views)) if (v && v.resize) v.resize();
}
// pointer position: canvas pixels (cx, cy) and world units (x, y)
function at(e) {
  const r = stage.getBoundingClientRect();
  const cx = (e.clientX - r.left) * fit.dpr, cy = (e.clientY - r.top) * fit.dpr;
  return { cx, cy, x: (cx - fit.ox) / fit.s, y: (cy - fit.oy) / fit.s };
}

let saveTimer = 0;
function save(now = false) {
  clearTimeout(saveTimer);
  if (now) saver.save(pg.toSave());
  else saveTimer = setTimeout(() => saver.save(pg.toSave()), 600);
}
let hinted = false;
function hint(text) { hintEl.textContent = text || ''; hintEl.classList.toggle('gone', !text); }
function touched() { if (!hinted) { hinted = true; setTimeout(() => hintEl.classList.add('gone'), 1800); } }

const base = { pg, canvas: c2d, g, fit, audio, save, hint, W: WORLD_W, H: WORLD_H, stage };
const views = {
  gummy: createGummyView({ ...base, sim: pg.toys.gummy }),
  lava: createLavaView({ ...base, sim: pg.toys.lava }),
  pendulum: createPendulumView({ ...base, sim: pg.toys.pendulum }),
  sand: null,   // loaded on first use
};
let sandLoading = null;
function sandView() {
  if (views.sand) return Promise.resolve(views.sand);
  if (!sandLoading) {
    document.getElementById('loading').hidden = false;
    sandLoading = import('./view-sand.js')
      .then((m) => m.createSandView({ ...base, sim: pg.toys.sand, canvas: c3d }))
      .then((v) => { views.sand = v; v.resize(); if (pg.tab === 'sand') v.show(); return v; })
      .catch((e) => { console.error(e); document.getElementById('loading').textContent = 'The sand tray needs WebGL, which this browser could not start.'; })
      .finally(() => { if (views.sand) document.getElementById('loading').hidden = true; });
  }
  return sandLoading;
}

// ---------- tabs ----------
const tabs = [...document.querySelectorAll('#tabs [role="tab"]')];
function show(toy) {
  if (!TOYS.includes(toy)) toy = 'gummy';
  const was = pg.tab;
  if (views[was] && was !== toy && views[was].hide) views[was].hide();
  pg.setTab(toy);
  for (const t of tabs) t.setAttribute('aria-selected', String(t.dataset.toy === toy));
  for (const c of document.querySelectorAll('.controls')) c.hidden = c.dataset.toy !== toy;
  c2d.hidden = toy === 'sand';
  c3d.hidden = toy !== 'sand';
  document.getElementById('loading').hidden = toy !== 'sand' || !!views.sand;
  hint(HINTS[toy]);
  if (toy === 'sand') sandView(); else if (views[toy] && views[toy].show) views[toy].show();
  const h = '#toy=' + toy;
  if (location.hash !== h) history.replaceState(null, '', location.pathname + location.search + h);
  resize();
  save();
}
for (const t of tabs) t.addEventListener('click', () => show(t.dataset.toy));
// arrow keys move along the tabs when one has focus
document.getElementById('tabs').addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
  const i = tabs.indexOf(document.activeElement); if (i < 0) return;
  const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
  n.focus(); show(n.dataset.toy); e.preventDefault();
});

// ---------- input ----------
let pointer = null;
c2d.addEventListener('pointerdown', (e) => {
  const v = views[pg.tab]; if (!v || !v.down) return;
  if (pointer != null && pointer !== e.pointerId) return;   // one finger at a time on the flat toys
  pointer = e.pointerId;
  c2d.setPointerCapture(e.pointerId);
  touched();
  v.down(at(e), e);
  e.preventDefault();
});
c2d.addEventListener('pointermove', (e) => {
  const v = views[pg.tab]; if (!v) return;
  if (pointer != null && e.pointerId !== pointer) return;
  if (v.move) v.move(at(e), e, pointer != null);
});
function lift(e) {
  if (e.pointerId !== pointer) return;
  pointer = null;
  const v = views[pg.tab];
  if (v && v.up) v.up(at(e), e);
}
c2d.addEventListener('pointerup', lift);
c2d.addEventListener('pointercancel', lift);
c2d.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('keydown', (e) => {
  if (e.target.closest && e.target.closest('input, select, textarea, dialog[open]')) return;
  const v = views[pg.tab];
  if (v && v.key && v.key(e, true)) e.preventDefault();
});
window.addEventListener('keyup', (e) => {
  const v = views[pg.tab];
  if (v && v.key && v.key(e, false)) e.preventDefault();
});

// ---------- the bar ----------
const soundBtn = document.getElementById('btn-sound');
function syncSound() { soundBtn.textContent = audio.on ? '🔊' : '🔇'; soundBtn.setAttribute('aria-label', audio.on ? 'Sound is on' : 'Sound is off'); }
soundBtn.addEventListener('click', () => { audio.toggle(); syncSound(); });
syncSound();
const help = document.getElementById('help');
document.getElementById('btn-help').addEventListener('click', () => help.showModal());

// ---------- the loop ----------
// The sims step at a fixed 60Hz whatever the screen does; only the toy on show runs.
const loop = fixedLoop({
  step: (dt) => { pg.step(dt); const v = views[pg.tab]; if (v && v.tick) v.tick(dt); },
  render: () => { const v = views[pg.tab]; if (v && v.draw && !document.hidden) v.draw(); },
});
new ResizeObserver(resize).observe(stage);
window.addEventListener('pagehide', () => save(true));
document.addEventListener('visibilitychange', () => { if (document.hidden) save(true); });

const fromHash = new URLSearchParams(location.hash.replace(/^#/, '')).get('toy');
show(TOYS.includes(fromHash) ? fromHash : pg.tab);
loop.start();

// ---------- debug handle ----------
expose('__playground', {
  pg, views, loop, fit, save: () => save(true),
  get tab() { return pg.tab; },
  show,
  sandReady: () => sandView(),
  // step the toy on show by hand (the loop keeps running too)
  run(seconds, dt = 1 / 60) { for (let t = 0; t < seconds; t += dt) pg.step(dt); const v = views[pg.tab]; if (v && v.draw) v.draw(); },
  text() {
    const t = pg.toys;
    return JSON.stringify({
      tab: pg.tab, bears: t.gummy.bears.length,
      lava: { n: t.lava.n, lamp: t.lava.lamp }, sand: { shapes: t.sand.shapes.length, grains: t.sand.grains.length },
      pendulum: { t: +t.pendulum.t.toFixed(2), E: +t.pendulum.energy().toFixed(3) },
    });
  },
});
