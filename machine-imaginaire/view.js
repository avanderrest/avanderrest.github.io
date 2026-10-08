/* Machine Imaginaire: the page. The canvas the picture is drawn at (a fixed 2400x1500
   whatever the window size), drawing it in and setting it moving, the photo drop and its
   analysis, the style tabs and sliders, the share link and the save, the SVG and PNG
   downloads, and three.js for the sculptures (vendored, loaded only when one is shown).
   See sim.js for the pictures. */
import { createMachine } from './sim.js';
import { expose } from '../lib/debug.js';

  const SAVE_KEY = 'machine-imaginaire-save-v1';

  // ---------- three.js, for the sculptures ----------
  // Loaded only when a 3D style first asks for it (the import map in index.html points at
  // the vendored copy). Until it arrives the scene says so, and is rebuilt when it does.
  // One renderer draws into an offscreen canvas the size of the picture, which the scene
  // then copies onto the page's canvas, so PNG, SVG and the tests work as for any style.
  // `turn` is how far the visitor has dragged the sculpture round.
  const G3 = { lib: null, loading: null, failed: false, stage: null, cache: new Map(), turn: [0, 0] };
  function need3d() {
    if (!G3.loading) {
      G3.loading = Promise.all([import('three'), import('three/addons/MarchingCubes.js'), import('three/addons/STLExporter.js')])
        .then(([THREE, mc, stl]) => { G3.lib = { THREE, MarchingCubes: mc.MarchingCubes, STLExporter: stl.STLExporter }; })
        .catch((e) => { G3.failed = true; console.error(e); });
    }
    return G3.loading;
  }
  function stage3d() {
    if (G3.stage) return G3.stage;
    const { THREE } = G3.lib;
    const renderer = new THREE.WebGLRenderer({ canvas: document.createElement('canvas'), antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(W, H, false);
    renderer.setClearColor(0x000000, 0);
    renderer.localClippingEnabled = true;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 50);
    camera.position.set(0, 0, 4.3);
    const hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 1.4);
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(-2.5, 3, 4);
    const fill = new THREE.DirectionalLight(0xffffff, 0.7);
    fill.position.set(3, -1, 2);
    scene.add(hemi, key, fill);
    const mesh = new THREE.Mesh();
    scene.add(mesh);
    const clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 10);
    G3.stage = { renderer, scene, camera, mesh, hemi, clip };
    return G3.stage;
  }
  // a geometry is slow to make, so the last few are kept, keyed by everything they depend on
  function cached3d(key, make) {
    if (G3.cache.has(key)) { const g = G3.cache.get(key); G3.cache.delete(key); G3.cache.set(key, g); return g; }
    const g = make();
    G3.cache.set(key, g);
    while (G3.cache.size > 6) {
      const [k, old] = G3.cache.entries().next().value;
      if (G3.stage && G3.stage.mesh.geometry === old) break;
      old.dispose(); G3.cache.delete(k);
    }
    return g;
  }

  const mi = createMachine({
    makeCanvas: (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h }),
    makePath: () => new Path2D(),
    three: {
      G3, need3d, stage3d, cached3d,
      ready3d() {
        if (!G3.lib) { render(); return; }               // it failed: repaint, now with the message
        if (calm) render(); else G3.after = true;     // the loop hands over to the 3D draw
        kick();
      },
    },
  });
  const {
    hashString, mulberry32, shuffle, gauss, makeNoise, hsl, pickWeighted, decodePal, seededPalette, analyse, mapSampler, allocate, hatch, ribbon, cleanParam, lumSampler, toneSampler, svgContext, pictureSvg, buildScene, toQuery, fromQuery, toSave, fromSave, W, H, LUM_COLS, LUM_ROWS, TONE_COLS, TONE_ROWS, ANALYSE_MAX, K, TAU, PI_DIGITS, rngFor, clamp, ease, ramp, hexToRgb, rgbToHex, luma, mix, mkColor, lightest, darkest, contrasting, canon, encodePal, validMap, VIEW, ZOOM_MAX, STYLES, ORDER, defaults, ADJ, NOUN, dice, S, palette,
  } = mi;


  // ---------- render + play ----------
  const canvas = document.getElementById('art');
  const ctx = canvas.getContext('2d');
  // t is how long the picture has been moving; drawing grows `upto` from nothing.
  // Moving is on unless turned off (and remembered), or the device asks for less motion.
  const calm = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const play = { scene: null, t: 0, moving: !calm, drawing: false, from: 0, dur: 0, last: 0, raf: 0, dirty: false };

  function build() {
    const { scene, P } = buildScene();
    const style = STYLES[S.style];
    play.scene = scene;
    paintSwatches(P);
    document.getElementById('caption').textContent = style.name + ' · after ' + style.after + ' · seed “' + S.seed + '”';
    writeHash();
    save();
  }
  function paintFrame(now) {
    const sc = play.scene;
    let upto = sc.total;
    if (play.drawing) {
      const p = (now - play.from) / play.dur;
      if (p >= 1) { play.drawing = false; syncPlayUi(); } else upto = sc.total * Math.max(0, p);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.save();
    sc.paint(ctx, play.t, upto);
    ctx.restore();
  }
  function loop(now) {
    play.raf = 0;
    const dt = play.last ? Math.min(0.1, (now - play.last) / 1000) : 0;
    play.last = now;
    if (play.moving && !play.drawing) play.t += dt;    // movement waits while the picture draws itself in
    if (play.dirty) { play.dirty = false; build(); }
    // three.js arrived: a flat picture still growing hurries to finish (in under a second,
    // from wherever it had got to; a third of a second felt rushed), then hands over to 3D
    if (G3.after && play.drawing && play.scene.info.waiting) {
      const p = clamp((now - play.from) / play.dur, 0, 0.99), left = 850;
      if (play.dur * (1 - p) > left + 1) { play.dur = left / (1 - p); play.from = now - p * play.dur; }
    } else if (G3.after) {
      G3.after = false;
      build();
      play.t = 0; play.drawing = true; play.from = now;
      play.dur = 1000 * (play.scene.drawSeconds || 3);
      syncPlayUi();
    }
    paintFrame(now);
    if (play.moving || play.drawing || G3.after) play.raf = requestAnimationFrame(loop);
    else play.last = 0;
  }
  function kick() { if (!play.raf) play.raf = requestAnimationFrame(loop); }
  function render() { play.dirty = true; kick(); }
  function renderNow() {
    play.dirty = false;
    build();
    paintFrame(performance.now());
    return S.last;
  }

  function startDrawing(fresh) {
    if (play.drawing && !fresh) { play.drawing = false; syncPlayUi(); kick(); return; }   // a second press finishes it
    if (play.dirty) { play.dirty = false; build(); }
    const sc = play.scene;
    play.t = 0;                             // a drawing always starts, and ends, on the still picture
    play.drawing = true;
    play.from = performance.now();
    play.dur = 1000 * (sc.drawSeconds || clamp(1.5 + sc.total * 0.004, 3, 8));
    syncPlayUi();
    kick();
  }
  function toggleMoving() {
    play.moving = !play.moving;
    if (!play.moving) play.t = 0;           // holding still is the seed's picture again
    syncPlayUi();
    save();
    kick();
  }

  // FNV-1a over every pixel: the same picture gives the same number.
  function fingerprint() {
    const d = new Uint32Array(ctx.getImageData(0, 0, W, H).data.buffer);
    let h = 0x811c9dc5;
    for (let i = 0; i < d.length; i++) h = Math.imul(h ^ d[i], 16777619);
    return (h >>> 0).toString(16);
  }

  // ---------- link + save ----------
  function writeHash() {
    const h = '#' + toQuery();
    if (location.hash !== h) history.replaceState(null, '', h);
  }
  function readHash() {
    if (!location.hash.includes('seed=')) return false;
    return fromQuery(location.hash.slice(1));
  }
  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(toSave(play.moving))); } catch (e) { /* private mode: nothing kept, nothing lost */ }
  }
  function load() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { d = null; }
    if (!d) return false;
    if (d.moving === false || calm) play.moving = false;
    return fromSave(d);
  }

  // ---------- page ----------
  const $ = (id) => document.getElementById(id);
  const seedIn = $('seed');

  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => t.classList.remove('show'), 1800);
  }

  function buildTabs() {
    const nav = $('styles');
    nav.innerHTML = '';
    ORDER.forEach((key) => {
      const b = document.createElement('button');
      b.setAttribute('role', 'tab');
      b.dataset.style = key;
      b.innerHTML = STYLES[key].name + '<small>' + STYLES[key].after + '</small>';
      b.addEventListener('click', () => {
        S.style = key;
        G3.turn = [0, 0];
        resetView();
        syncUi();
        play.dirty = true;
        if (calm) kick(); else startDrawing(true);     // a new style draws itself in
      });
      nav.appendChild(b);
    });
  }

  function buildParams() {
    const box = $('params');
    box.innerHTML = '';
    $('params-title').textContent = STYLES[S.style].name;
    const prm = S.params[S.style];
    STYLES[S.style].params.forEach((p) => {
      const row = document.createElement('div');
      row.className = 'param';
      const id = 'p-' + p.k;
      if (p.opts) {
        row.innerHTML = '<label>' + p.label + '</label><div class="seg" role="group" aria-label="' + p.label + '"></div>';
        const seg = row.querySelector('.seg');
        p.opts.forEach(([v, text]) => {
          const b = document.createElement('button');
          b.textContent = text;
          b.setAttribute('aria-pressed', String(prm[p.k] === v));
          b.addEventListener('click', () => {
            const was = prm[p.k];
            prm[p.k] = v;
            seg.querySelectorAll('button').forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
            // a sculpture changing form morphs from the old shape into the new one
            const reshapes = p.k === 'form' || (p.k === 'outline' && prm.form !== 'cage' && prm.form !== 'knot');
            if (reshapes && was !== v && STYLES[S.style].solid && play.scene && play.scene.shape && !calm) {
              G3.morphFrom = play.scene;
              play.dirty = true;
              startDrawing(true);
            } else render();
          });
          seg.appendChild(b);
        });
      } else {
        row.innerHTML = '<label for="' + id + '"><span>' + p.label + '</span><output></output></label>' +
          '<input type="range" id="' + id + '" min="' + p.min + '" max="' + p.max + '" step="' + p.step + '" />';
        const input = row.querySelector('input'), out = row.querySelector('output');
        input.value = prm[p.k];
        out.textContent = prm[p.k] + (p.unit || '');
        input.addEventListener('input', () => {
          prm[p.k] = cleanParam(p, input.value);
          out.textContent = prm[p.k] + (p.unit || '');
          render();
        });
      }
      box.appendChild(row);
    });
  }

  // Each swatch is a colour picker. Changing a colour keeps its share; the palette is
  // then the visitor's own (kept, and carried in the link) until "Use the seed".
  function paintSwatches(P) {
    const box = $('swatches');
    box.innerHTML = '';
    P.forEach((c, i) => {
      const s = document.createElement('label');
      s.style.background = c.hex;
      s.style.flexGrow = Math.max(c.w, 0.001);
      s.style.color = luma(c.rgb) > 140 ? '#1c1b19' : '#fff';
      s.title = c.hex + (i ? '' : ' — the ground') + ' · click to change';
      s.innerHTML = '<span>' + Math.round(c.w * 100) + '%</span><input type="color" aria-label="Colour ' + (i + 1) + '" />';
      const input = s.querySelector('input');
      input.value = c.hex;
      input.addEventListener('input', () => setColour(i, input.value));
      box.appendChild(s);
    });
  }
  function setColour(i, hex) {
    if (!S.photo) S.photo = { pal: seededPalette(), lum: null, tone: null, name: null };
    S.photo.pal = S.photo.pal.map((c, k) => (k === i ? { hex: hex.toLowerCase(), w: c.w } : c));
    S.photo.edited = true;
    syncPhotoUi();
    render();
  }

  let thumbUrl = null;
  function syncPhotoUi() {
    const thumb = $('photo-thumb');
    thumb.hidden = !(S.photo && thumbUrl);
    if (!thumb.hidden) thumb.src = thumbUrl;
    $('btn-unphoto').hidden = !S.photo;
    $('photo-label').textContent = !S.photo ? 'No photo — the seed picks the colours.'
      : S.photo.edited ? (S.photo.name ? 'Colours from ' + S.photo.name + ', changed.' : 'Your own colours.')
      : S.photo.name ? 'Colours from ' + S.photo.name + '.' : 'Colours from a photo.';
  }

  function syncPlayUi() {
    const d = $('btn-draw'), m = $('btn-move');
    d.textContent = play.drawing ? '⏭ Finish it' : '▶ Watch it draw';
    m.textContent = play.moving ? '■ Hold still' : '〰 Set it moving';
    m.setAttribute('aria-pressed', String(play.moving));
  }

  function syncUi() {
    seedIn.value = S.seed;
    document.querySelectorAll('#styles button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.style === S.style)));
    // on a phone the tabs are one scrolling strip: keep the chosen one in view
    const nav = $('styles'), sel = nav.querySelector('[aria-selected="true"]');
    if (sel && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = sel.offsetLeft - nav.offsetLeft - 12;
    buildParams();
    syncPhotoUi();
    syncPlayUi();
    $('btn-stl').hidden = !STYLES[S.style].solid;
    syncZoomUi();
    canvas.classList.toggle('turnable', !!STYLES[S.style].solid);
  }

  function setPhotoData(img, name) {
    const a = analyse(img);
    if (!a) { toast('That picture has no visible pixels'); return null; }
    S.photo = { pal: a.palette, lum: a.lum, tone: a.tone, name: name || null };
    syncPhotoUi();
    return renderNow();
  }

  function loadPhoto(file) {
    if (!file || !/^image\//.test(file.type)) { toast('That is not a picture'); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const sc = Math.min(1, ANALYSE_MAX / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * sc)), h = Math.max(1, Math.round(img.naturalHeight * sc));
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const cx = c.getContext('2d', { willReadFrequently: true });
      cx.imageSmoothingQuality = 'high';
      cx.drawImage(img, 0, 0, w, h);
      if (thumbUrl) URL.revokeObjectURL(thumbUrl);
      thumbUrl = url;
      setPhotoData(cx.getImageData(0, 0, w, h), file.name);
    };
    img.onerror = () => { URL.revokeObjectURL(url); toast('That picture would not open'); };
    img.src = url;
  }

  // ---------- wiring ----------
  seedIn.addEventListener('input', () => { S.seed = seedIn.value || ' '; render(); });
  $('btn-dice').addEventListener('click', () => { S.seed = dice(); seedIn.value = S.seed; resetView(); syncZoomUi(); render(); });
  $('photo').addEventListener('change', (e) => { loadPhoto(e.target.files[0]); e.target.value = ''; });
  $('btn-unphoto').addEventListener('click', () => { S.photo = null; syncPhotoUi(); render(); });
  $('btn-reset').addEventListener('click', () => { S.params[S.style] = defaults(S.style); buildParams(); render(); });
  $('btn-help').addEventListener('click', () => $('help').showModal());
  $('btn-draw').addEventListener('click', () => startDrawing(false));
  $('btn-move').addEventListener('click', toggleMoving);
  $('btn-link').addEventListener('click', () => {
    writeHash();
    const done = () => toast('Link copied');
    if (navigator.clipboard) navigator.clipboard.writeText(location.href).then(done, () => toast('Copy the address bar to share'));
    else toast('Copy the address bar to share');
  });
  $('btn-png').addEventListener('click', () => {
    canvas.toBlob((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'machine-imaginaire-' + S.style + '-' + S.seed.replace(/[^\w-]+/g, '_').slice(0, 40) + '.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }, 'image/png');
  });
  $('btn-svg').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([pictureSvg(play.scene, play.t)], { type: 'image/svg+xml' }));
    a.download = 'machine-imaginaire-' + S.style + '-' + S.seed.replace(/[^\w-]+/g, '_').slice(0, 40) + '.svg';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    if (S.style === 'reas') toast('Process is built of pixels, so it is inside the SVG as an image');
    if (STYLES[S.style].solid) toast('A sculpture is rendered, so it is inside the SVG as an image — STL has the shape');
  });
  $('btn-stl').addEventListener('click', () => {
    if (!play.scene.stl) { toast('Still fetching three.js'); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([play.scene.stl()], { type: 'model/stl' }));
    a.download = 'machine-imaginaire-' + S.params.sculpture.form + '-' + S.seed.replace(/[^\w-]+/g, '_').slice(0, 40) + '.stl';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('A closed solid, up to 100 mm across, ready for a slicer');
  });
  // A sculpture can be dragged round, and a zoomed Limit set dragged about; both are views,
  // not part of the picture's link. Panning slides the canvas itself while the pointer is
  // down (the fill is too slow to redo every frame) and redraws when it is let go.
  let drag = null;
  const panning = () => STYLES[S.style].zoomable && VIEW.z > 1;
  canvas.addEventListener('pointerdown', (e) => {
    if (!STYLES[S.style].solid && !panning()) return;
    drag = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, k: 2 * Math.PI / canvas.getBoundingClientRect().width };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (panning()) { canvas.style.transform = 'translate(' + (e.clientX - drag.x0) + 'px,' + (e.clientY - drag.y0) + 'px)'; return; }
    G3.turn[0] += (e.clientX - drag.x) * drag.k;
    G3.turn[1] = clamp(G3.turn[1] + (e.clientY - drag.y) * drag.k, -1.4, 1.4);
    drag.x = e.clientX; drag.y = e.clientY;
    kick();
  });
  ['pointerup', 'pointercancel'].forEach((t) => canvas.addEventListener(t, (e) => {
    if (drag && panning()) {
      const r = canvas.getBoundingClientRect(), sc = Math.min(r.width / W, r.height / H);
      canvas.style.transform = '';
      if (play.scene.panBy && (e.clientX !== drag.x0 || e.clientY !== drag.y0)) { play.scene.panBy((e.clientX - drag.x0) / sc, (e.clientY - drag.y0) / sc); render(); }
    }
    drag = null;
  }));
  function resetView() { VIEW.z = 1; VIEW.x = 0; VIEW.y = 0; }
  function syncZoomUi() {
    const on = !!STYLES[S.style].zoomable;
    $('zoombar').hidden = !on;
    $('zoom-level').textContent = VIEW.z + '×';
    $('btn-zout').disabled = VIEW.z <= 1;
    $('btn-zin').disabled = VIEW.z >= ZOOM_MAX;
    canvas.classList.toggle('pannable', on && VIEW.z > 1);
  }
  function zoomBy(f) {
    VIEW.z = clamp(VIEW.z * f, 1, ZOOM_MAX);
    if (VIEW.z === 1) { VIEW.x = 0; VIEW.y = 0; }
    syncZoomUi();
    render();
  }
  $('btn-zin').addEventListener('click', () => zoomBy(2));
  $('btn-zout').addEventListener('click', () => zoomBy(0.5));
  $('zoom-level').addEventListener('click', () => { resetView(); syncZoomUi(); render(); });
  const drop = $('drop');
  ['dragenter', 'dragover'].forEach((t) => document.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((t) => document.addEventListener(t, (e) => { e.preventDefault(); if (t === 'drop' || !e.relatedTarget) drop.classList.remove('over'); }));
  document.addEventListener('drop', (e) => { const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) loadPhoto(f); });
  document.addEventListener('paste', (e) => {
    const item = [...((e.clipboardData && e.clipboardData.items) || [])].find((i) => i.type.startsWith('image/'));
    if (item) loadPhoto(item.getAsFile());
  });
  addEventListener('hashchange', () => { if (readHash()) { thumbUrl = null; syncUi(); render(); } });

  // ---------- start ----------
  buildTabs();
  if (!readHash() && !load()) S.seed = dice();
  syncUi();
  renderNow();
  if (!calm) startDrawing(true);           // opening the page draws the picture in
  else if (play.moving) kick();
  setTimeout(() => need3d(), 1500);         // three.js for the sculptures, fetched quietly in good time

  expose('__machine', {
    sim: mi,
    S, STYLES, ORDER, W, H, play,
    analyse, allocate, encodePal, decodePal, hashString, fingerprint, setPhotoData, setColour, svg: () => pictureSvg(play.scene, play.t),
    palette: () => palette(),
    // the 3D styles need three.js, which loads on first use; tests wait for it
    ready3d: () => need3d().then(() => !!G3.lib),
    g3: G3,
    clearPhoto() { play.moving = false; play.drawing = false; play.t = 0; S.photo = null; syncPhotoUi(); return renderNow(); },
    // render({ seed, style, params }) builds and draws synchronously and returns what the style decided
    view: VIEW,
    render(opts = {}) {
      play.moving = false; play.drawing = false; play.t = 0;   // tests look at the still picture
      if (opts.seed != null) S.seed = String(opts.seed);
      if (opts.style && STYLES[opts.style]) S.style = opts.style;
      if (opts.params) Object.assign(S.params[S.style], opts.params);
      syncUi();
      return renderNow();
    },
    // paint the current scene at time t with the first `upto` pieces (all, by default)
    paintAt(t, upto) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.save();
      play.scene.paint(ctx, t, upto == null ? play.scene.total : upto);
      ctx.restore();
      return play.scene.info;
    },
  });
