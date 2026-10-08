/* Every style and every built-in look runs on a photo, in Node.

   filters.js is a page script (it hangs everything on `window`), but its styles are plain
   functions over RGBA pixels, so here it and presets.js run in a sandbox with a stand-in
   window and document (the opencv.js loader finds no page to add itself to, so cv never
   arrives, and the styles that use it fall back to plain JS, as they do in the page
   before the wasm lands). A made-up 64x40 photo (a sky gradient, a red disc, a dark
   foreground strip) goes through:

   - every style at its default settings: it must not throw, must hand back the same
     number of pixels, no NaN, and the same pixels twice running (a style that draws
     through a canvas, for its text or shapes, or needs OpenCV, is listed as page-only);
   - every built-in preset's stacks (Both, Foreground, Background) in order: every style
     a preset names must exist, every setting it gives must be one that style has, and
     the stack must run.

   presets.js (in the page) checks that each look visibly changes the demo photo and that
   Save current round-trips; separation.js the foreground split, which needs opencv. */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function photo(w, h) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, disc = (x - 40) ** 2 + (y - 14) ** 2 < 64;
    const ground = y > h * 0.75;
    d[i] = disc ? 220 : ground ? 40 : 90 + y * 3;
    d[i + 1] = disc ? 40 : ground ? 60 : 140 + y * 2;
    d[i + 2] = disc ? 40 : ground ? 30 : 230 - y;
    d[i + 3] = 255;
  }
  return d;
}

export default function () {
  const window = {};
  const sandbox = {
    window, console, Math, Float32Array, Float64Array, Uint8Array, Uint8ClampedArray, Int32Array, Uint16Array, Int16Array, Uint32Array, Array, Object, Number, String, Map, Set, JSON, Infinity, NaN, isFinite,
    setTimeout: () => 0, CustomEvent: function () {},
    document: { createElement: () => ({}), head: { appendChild() {} } },
  };
  window.dispatchEvent = () => {};
  vm.createContext(sandbox);
  for (const f of ['filters.js', 'presets.js']) {
    vm.runInContext(readFileSync(new URL('../../image-studio/js/' + f, import.meta.url), 'utf8'), sandbox, { filename: f });
  }
  const FILTERS = window.Filters, PRESETS = window.StudioPresets || [];
  const W = 64, H = 40, src = photo(W, H);
  const byId = Object.fromEntries(FILTERS.map((f) => [f.id, f]));
  const problems = [], unchanged = [], pageOnly = new Set();
  // a style that draws through a canvas (text, shapes) or needs OpenCV can only run in the page
  const needsPage = (e) => /OpenCV|getContext|newCanvas/.test(e.message);
  const run = (f, params, input) => {
    const out = f.apply(new Uint8ClampedArray(input), W, H, Object.assign(window.defaultFilterParams(f), params || {}));
    return out && out.data ? out.data : out;
  };

  for (const f of FILTERS) {
    let a, b;
    try { a = run(f, null, src); b = run(f, null, src); } catch (e) { if (needsPage(e)) pageOnly.add(f.id); else problems.push(`${f.id} threw: ${e.message}`); continue; }
    if (!a || a.length !== src.length) { problems.push(`${f.id} gave ${a ? a.length : 'nothing'} values for ${src.length}`); continue; }
    let nan = false, same = true, diff = false;
    for (let i = 0; i < a.length; i++) {
      if (Number.isNaN(a[i])) nan = true;
      if (a[i] !== b[i]) same = false;
      if (a[i] !== src[i]) diff = true;
    }
    if (nan) problems.push(`${f.id} gave NaN`);
    if (!same) problems.push(`${f.id} gave different pixels twice`);
    if (!diff) unchanged.push(f.id);
  }

  let layers = 0, skipped = 0;
  for (const p of PRESETS) {
    for (const [region, list] of Object.entries(p.regions || {})) {
      let img = src;
      for (const L of list || []) {
        if (L.kind === 'colormap') continue;
        const f = byId[L.filter];
        if (!f) { problems.push(`${p.name}/${region}: no style ${L.filter}`); continue; }
        const keys = new Set((f.params || []).map((d) => d.key));
        const odd = Object.keys(L.params || {}).filter((k) => !keys.has(k));
        if (odd.length) problems.push(`${p.name}/${region}/${L.filter}: no setting ${odd.join(', ')}`);
        if (pageOnly.has(f.id)) { skipped++; continue; }
        try { img = run(f, L.params, img); layers++; } catch (e) { problems.push(`${p.name}/${region}/${L.filter} threw: ${e.message}`); }
      }
    }
  }
  return {
    pass: !problems.length,
    detail: (problems.length ? problems.join(' | ') + ' -- ' : '') +
      `${FILTERS.length - pageOnly.size} of ${FILTERS.length} styles ran on a ${W}x${H} photo (page only: ${[...pageOnly].join(', ')})` + (unchanged.length ? ` (${unchanged.length} leave it as it was at their defaults: ${unchanged.join(', ')})` : '') +
      `; ${PRESETS.length} built-in looks, ${layers} layers run, ${skipped} page-only layers skipped`,
  };
}
