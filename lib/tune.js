/* The tuning panel: sliders for a game's constants and handles to drag its art into place,
   only when the page is opened with ?tune (or #tune). Placing a thing on a painted plate by
   hand beats asking for it to be nudged a few pixels at a time; when it looks right, Copy
   puts the numbers on the clipboard to paste back into the source.

     const K = tune('physics-playground-gummy', {
       T: 0.28,                                          // a bare number: range guessed
       DOME: { value: 20, min: 0, max: 60, note: 'how tall the candy stands' },
       glow: { x: 160, y: -60 },                         // a point: dragged on the page
     }, {
       el: canvas,                                       // what the points sit on
       toScreen: (p) => ({ x, y }),                      // a point to CSS px inside el
       fromScreen: (s) => ({ x, y }),                    // and back
       onChange(name, K) { ... },                        // after any change
     });
     ... K.T, K.glow.x ...                               // read where the constant was

   Without ?tune it returns the defaults as a plain object and touches nothing, so it costs
   a game nothing and imports cleanly in Node. With it, the values are kept per name in
   localStorage until Reset (a player never sees them: they apply only under ?tune). Points
   default to the element's own pixels (a canvas's width/height) when no transform is given.
   Several tune() calls on one page share one panel, a section each. window.__tune holds
   them for tests: __tune[name].set(key, value). */

import { setting } from './save.js';

const panels = {};          // name -> { spec, values, defaults, opts, section }
let root = null, handleLayer = null, open = true;

export function tuning() {
  if (typeof location === 'undefined') return false;
  return /(^|[?&#])tune(\b|=|$)/.test(location.search + location.hash);
}

// A number becomes { value, min, max, step }; a point stays { x, y }.
function normalise(raw) {
  if (raw && typeof raw === 'object' && 'x' in raw && 'y' in raw && !('value' in raw)) {
    return { kind: 'point', x: raw.x, y: raw.y, note: raw.note || '' };
  }
  const o = typeof raw === 'number' ? { value: raw } : { ...raw };
  const v = o.value;
  if (o.min == null || o.max == null) {
    const span = v === 0 ? 1 : Math.abs(v) * 2;
    if (o.min == null) o.min = v < 0 ? v * 3 : v === 0 ? -1 : 0;
    if (o.max == null) o.max = v < 0 ? 0 : v + span;
  }
  if (o.step == null) {
    const r = (o.max - o.min) / 200;
    o.step = Math.pow(10, Math.floor(Math.log10(r || 1)));
    if (Number.isInteger(v) && Math.abs(v) >= 10) o.step = Math.max(1, o.step);
  }
  return { kind: 'number', value: v, min: o.min, max: o.max, step: o.step, note: o.note || '' };
}

const decimals = (step) => { const s = String(step); const i = s.indexOf('.'); return i < 0 ? 0 : s.length - i - 1; };
const round = (v, step) => +(+v).toFixed(Math.min(6, decimals(step) + 1));

export function tune(name, spec, opts = {}) {
  const items = Object.fromEntries(Object.entries(spec).map(([k, raw]) => [k, normalise(raw)]));
  const values = {};
  for (const [k, it] of Object.entries(items)) values[k] = it.kind === 'point' ? { x: it.x, y: it.y } : it.value;
  if (!tuning() || typeof document === 'undefined') return values;

  const kept = setting('tune-' + name, null);
  const saved = kept.get() || {};
  for (const [k, v] of Object.entries(saved)) {
    if (!(k in items)) continue;
    if (items[k].kind === 'point' && v && typeof v === 'object') { values[k].x = +v.x; values[k].y = +v.y; }
    else if (items[k].kind === 'number' && typeof v === 'number') values[k] = v;
  }
  const p = { name, items, values, opts, kept, rows: {} };
  panels[name] = p;
  build(p);
  window.__tune = window.__tune || {};
  window.__tune[name] = { values, set: (k, v) => set(p, k, v), copyText: () => copyText(p), reset: () => reset(p) };
  return values;
}

function set(p, k, v) {
  const it = p.items[k];
  if (it.kind === 'point') { p.values[k].x = round(v.x, 1); p.values[k].y = round(v.y, 1); }
  else p.values[k] = round(v, it.step);
  const changed = {};
  for (const [key, item] of Object.entries(p.items)) {
    const val = p.values[key];
    if (item.kind === 'point' ? (val.x !== item.x || val.y !== item.y) : val !== item.value) changed[key] = val;
  }
  p.kept.set(Object.keys(changed).length ? changed : null);
  sync(p, k);
  if (p.opts.onChange) p.opts.onChange(k, p.values);
}

function reset(p) {
  for (const [k, it] of Object.entries(p.items)) {
    if (it.kind === 'point') { p.values[k].x = it.x; p.values[k].y = it.y; } else p.values[k] = it.value;
    sync(p, k);
  }
  p.kept.set(null);
  if (p.opts.onChange) p.opts.onChange(null, p.values);
}

// Every value, ready to paste over the spec; a changed one says what it was.
function copyText(p) {
  const fmt = (v) => (typeof v === 'object' ? `{ x: ${v.x}, y: ${v.y} }` : String(v));
  const lines = Object.entries(p.items).map(([k, it]) => {
    const v = p.values[k];
    const was = it.kind === 'point' ? { x: it.x, y: it.y } : it.value;
    const same = fmt(v) === fmt(was);
    return `  ${k}: ${fmt(v)},${same ? '' : `   // was ${fmt(was)}`}`;
  });
  return `// ${p.name}\n${lines.join('\n')}\n`;
}

// ---------- the panel ----------
const CSS = `
.lt-panel { position: fixed; top: 8px; right: 8px; z-index: 2147483000; width: min(320px, calc(100vw - 16px));
  max-height: calc(100dvh - 16px); overflow: auto; background: rgba(24, 22, 30, 0.92); color: #f2eee8;
  font: 12px/1.35 system-ui, sans-serif; border-radius: 8px; box-shadow: 0 4px 18px rgba(0,0,0,0.35); }
.lt-panel.lt-shut .lt-body { display: none; }
.lt-head { display: flex; align-items: center; gap: 6px; padding: 6px 8px; position: sticky; top: 0; background: rgba(24, 22, 30, 0.98); }
.lt-head b { flex: 1; font-weight: 600; }
.lt-panel button { font: inherit; color: inherit; background: #3a3646; border: 0; border-radius: 4px; padding: 3px 8px; cursor: pointer; }
.lt-panel button:hover { background: #4d4860; }
.lt-sec { padding: 4px 8px 8px; border-top: 1px solid rgba(255,255,255,0.1); }
.lt-sec h4 { margin: 4px 0; font-size: 11px; font-weight: 600; opacity: 0.75; display: flex; gap: 6px; align-items: center; }
.lt-sec h4 span { flex: 1; }
.lt-row { display: grid; grid-template-columns: 7.5em 1fr 4.5em; gap: 6px; align-items: center; margin: 2px 0; }
.lt-row label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lt-row.lt-moved label { color: #ffd479; }
.lt-row input[type=range] { width: 100%; margin: 0; }
.lt-row input[type=number] { width: 100%; box-sizing: border-box; font: inherit; color: inherit; background: #2c2936; border: 1px solid #4a4558; border-radius: 3px; padding: 1px 3px; }
.lt-row output { grid-column: 2 / 4; font-variant-numeric: tabular-nums; }
.lt-handles { position: fixed; inset: 0; pointer-events: none; z-index: 2147482999; }
.lt-handle { position: fixed; width: 22px; height: 22px; margin: -11px 0 0 -11px; border-radius: 50%;
  border: 2px solid #fff; background: rgba(255, 140, 60, 0.55); box-shadow: 0 0 0 1px rgba(0,0,0,0.6);
  pointer-events: auto; cursor: grab; touch-action: none; }
.lt-handle span { position: absolute; left: 24px; top: 1px; white-space: nowrap; font: 11px system-ui, sans-serif;
  color: #fff; text-shadow: 0 0 3px #000, 0 0 3px #000; pointer-events: none; }
.lt-handle.lt-moved { background: rgba(255, 212, 121, 0.75); }
.lt-handle.lt-edge { border-style: dashed; }
@media (any-pointer: coarse) { .lt-handle { width: 40px; height: 40px; margin: -20px 0 0 -20px; } .lt-handle span { left: 42px; top: 10px; } }
.lt-panel.lt-shut ~ .lt-handles { display: none; }
`;

function ensureRoot() {
  if (root) return;
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  root = document.createElement('div'); root.className = 'lt-panel';
  root.innerHTML = '<div class="lt-head"><b>Tune</b><button data-a="shut" title="Fold the panel away (handles hide too)"></button></div><div class="lt-body"></div>';
  handleLayer = document.createElement('div'); handleLayer.className = 'lt-handles';
  document.body.append(root, handleLayer);
  // on a phone the panel would cover the game: start it folded
  if (innerWidth < 600) { open = false; root.classList.add('lt-shut'); }
  root.querySelector('[data-a=shut]').addEventListener('click', (e) => {
    open = !open;
    root.classList.toggle('lt-shut', !open);
    e.currentTarget.textContent = open ? '–' : '+';
  });
  root.querySelector('[data-a=shut]').textContent = open ? '–' : '+';
  // the panel's own keys and pointers are not the game's
  for (const t of ['keydown', 'keyup', 'pointerdown', 'wheel']) root.addEventListener(t, (e) => e.stopPropagation());
  const tick = () => { placeHandles(); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}

function build(p) {
  ensureRoot();
  const sec = document.createElement('div'); sec.className = 'lt-sec';
  sec.innerHTML = `<h4><span></span><button data-a="copy" title="Copy every value, to paste back into the source">Copy</button><button data-a="reset" title="Back to the values in the source">Reset</button></h4>`;
  sec.querySelector('span').textContent = p.name;
  const copyBtn = sec.querySelector('[data-a=copy]');
  copyBtn.addEventListener('click', async () => {
    const text = copyText(p);
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {
      const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
      try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
      ta.remove();
    }
    if (!ok) console.log(text);
    copyBtn.textContent = ok ? 'Copied' : 'In console';
    setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1200);
  });
  sec.querySelector('[data-a=reset]').addEventListener('click', () => reset(p));

  for (const [k, it] of Object.entries(p.items)) {
    const row = document.createElement('div'); row.className = 'lt-row';
    const label = document.createElement('label'); label.textContent = k; label.title = it.note ? `${k}: ${it.note}` : k;
    row.appendChild(label);
    if (it.kind === 'number') {
      const range = document.createElement('input'); range.type = 'range';
      const num = document.createElement('input'); num.type = 'number';
      for (const el of [range, num]) { el.min = it.min; el.max = it.max; el.step = it.step; }
      num.removeAttribute('min'); num.removeAttribute('max');   // the box may go past the slider
      range.addEventListener('input', () => set(p, k, +range.value));
      num.addEventListener('change', () => { if (num.value !== '' && isFinite(+num.value)) set(p, k, +num.value); });
      row.append(range, num);
      p.rows[k] = { row, range, num };
    } else {
      const out = document.createElement('output');
      row.appendChild(out);
      const h = document.createElement('div'); h.className = 'lt-handle';
      const tag = document.createElement('span'); tag.textContent = k; h.appendChild(tag);
      handleLayer.appendChild(h);
      dragHandle(p, k, h);
      p.rows[k] = { row, out, handle: h };
    }
    sec.appendChild(row);
    sync(p, k);
  }
  root.querySelector('.lt-body').appendChild(sec);
}

function sync(p, k) {
  const r = p.rows[k]; if (!r) return;
  const it = p.items[k], v = p.values[k];
  let moved;
  if (it.kind === 'number') {
    if (document.activeElement !== r.range) r.range.value = v;
    if (document.activeElement !== r.num) r.num.value = v;
    moved = v !== it.value;
  } else {
    r.out.textContent = `x ${v.x}, y ${v.y}`;
    moved = v.x !== it.x || v.y !== it.y;
    r.handle.classList.toggle('lt-moved', moved);
  }
  r.row.classList.toggle('lt-moved', moved);
}

// ---------- points ----------
// The default space is the element's own pixels: a canvas's backing store, or CSS px.
function space(p) {
  const el = p.opts.el;
  const sx = () => (el && el.width && el.clientWidth ? el.clientWidth / el.width : 1);
  const sy = () => (el && el.height && el.clientHeight ? el.clientHeight / el.height : 1);
  return {
    to: p.opts.toScreen || ((q) => ({ x: q.x * sx(), y: q.y * sy() })),
    from: p.opts.fromScreen || ((s) => ({ x: s.x / sx(), y: s.y / sy() })),
    box: () => (el ? el.getBoundingClientRect() : { left: 0, top: 0 }),
  };
}

function placeHandles() {
  if (!open) return;
  for (const p of Object.values(panels)) {
    const sp = space(p);
    let box = null;
    for (const [k, r] of Object.entries(p.rows)) {
      if (!r.handle) continue;
      box = box || sp.box();
      const s = sp.to(p.values[k]);
      // a point off the screen is held at its edge, so it can still be caught and pulled in
      const m = 12, x = box.left + s.x, y = box.top + s.y;
      const cx = Math.min(innerWidth - m, Math.max(m, x)), cy = Math.min(innerHeight - m, Math.max(m, y));
      r.handle.style.left = cx + 'px';
      r.handle.style.top = cy + 'px';
      r.handle.classList.toggle('lt-edge', cx !== x || cy !== y);
    }
  }
}

function dragHandle(p, k, h) {
  let grab = null;
  h.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    try { h.setPointerCapture(e.pointerId); } catch (x) { /* a synthetic pointer */ }
    const r = h.getBoundingClientRect();
    grab = { dx: e.clientX - (r.left + r.width / 2), dy: e.clientY - (r.top + r.height / 2) };
    h.style.cursor = 'grabbing';
  });
  h.addEventListener('pointermove', (e) => {
    if (!grab) return;
    e.stopPropagation();
    const sp = space(p), box = sp.box();
    set(p, k, sp.from({ x: e.clientX - grab.dx - box.left, y: e.clientY - grab.dy - box.top }));
  });
  const end = (e) => { if (!grab) return; grab = null; h.style.cursor = ''; try { h.releasePointerCapture(e.pointerId); } catch (x) { /* gone */ } };
  h.addEventListener('pointerup', end);
  h.addEventListener('pointercancel', end);
  // arrow keys nudge a focused handle a unit at a time (shift: ten)
  h.tabIndex = 0;
  h.addEventListener('keydown', (e) => {
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!d) return;
    e.preventDefault(); e.stopPropagation();
    const n = e.shiftKey ? 10 : 1, v = p.values[k];
    set(p, k, { x: v.x + d[0] * n, y: v.y + d[1] * n });
  });
}
