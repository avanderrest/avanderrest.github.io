(function () {
  'use strict';

  const FILTERS = window.Filters;
  const MAX_DIM = 1200;
  const NEUTRAL = { r: 32, g: 36, b: 51 };

  const BLEND_MODES = [
    { id: 'normal', name: 'Normal' },
    { id: 'additive', name: 'Additive' },
    { id: 'subtractive', name: 'Subtractive' },
    { id: 'darken', name: 'Darken' },
    { id: 'multiply', name: 'Multiply' },
    { id: 'color-burn', name: 'Colour Burn' },
    { id: 'linear-burn', name: 'Linear Burn' },
    { id: 'lighten', name: 'Lighten' },
    { id: 'screen', name: 'Screen' },
    { id: 'color-dodge', name: 'Colour Dodge' },
    { id: 'overlay', name: 'Overlay' },
    { id: 'soft-light', name: 'Soft Light' },
    { id: 'hard-light', name: 'Hard Light' },
    { id: 'difference', name: 'Difference' },
    { id: 'exclusion', name: 'Exclusion' },
    { id: 'hue', name: 'Hue' },
    { id: 'saturation', name: 'Saturation' },
    { id: 'color', name: 'Colour' },
    { id: 'luminosity', name: 'Luminosity' }
  ];

  const byId = (id) => FILTERS.find((f) => f.id === id);
  const defaultParams = window.defaultFilterParams;
  let UID = 1;
  const nuid = () => UID++;

  const els = {
    studio: document.getElementById('studio'),
    fileInput: document.getElementById('fileInput'),
    downloadBtn: document.getElementById('downloadBtn'),
    resetBtn: document.getElementById('resetBtn'),
    layersPanel: document.getElementById('layersPanel'),
    addLayerBtn: document.getElementById('addLayerBtn'),
    bgTol: document.getElementById('bgTol'),
    bgTolVal: document.getElementById('bgTolVal'),
    layersTitle: document.getElementById('layersTitle'),
    layerList: document.getElementById('layerList'),
    originalCanvas: document.getElementById('originalCanvas'),
    resultCanvas: document.getElementById('resultCanvas'),
    fgCanvas: document.getElementById('fgCanvas'),
    bgCanvas: document.getElementById('bgCanvas'),
    copyLayerBtn: document.getElementById('copyLayerBtn'),
    copyMenu: document.getElementById('copyMenu'),
    copyWhat: document.getElementById('copyWhat'),
    copyWhole: document.getElementById('copyWhole'),
    copyTargets: document.getElementById('copyTargets'),
    copyDone: document.getElementById('copyDone'),
    panes: Array.prototype.slice.call(document.querySelectorAll('.pane[data-view]')),
    stage: document.getElementById('stage'),
    stageCanvas: document.getElementById('stageCanvas'),
    stageLabel: document.getElementById('stageLabel'),
    tabs: Array.prototype.slice.call(document.querySelectorAll('.tabs [data-tab]')),
    tabPanels: Array.prototype.slice.call(document.querySelectorAll('.tab-panel[data-panel]')),
    regionBtns: Array.prototype.slice.call(document.querySelectorAll('.region-switch [data-region]')),
    layerCount: document.getElementById('layerCount'),
    stylesTarget: document.getElementById('stylesTarget'),
    styleSearch: document.getElementById('styleSearch'),
    bgSoften: document.getElementById('bgSoften'),
    bgSoftenVal: document.getElementById('bgSoftenVal'),
    bgSliderGroup: document.getElementById('bgSliderGroup'),
    bgMode: document.getElementById('bgMode'),
    filterGrid: document.getElementById('filterGrid'),
    resultBusy: document.getElementById('resultBusy'),
    presetList: document.getElementById('presetList'),
    savePresetBtn: document.getElementById('savePresetBtn'),
    savePresetForm: document.getElementById('savePresetForm'),
    presetName: document.getElementById('presetName'),
    cancelPresetBtn: document.getElementById('cancelPresetBtn')
  };

  const state = {
    data: null,
    w: 0,
    h: 0,
    token: 0,
    bothLayers: [],
    fgLayers: [],
    bgLayers: [],
    activeUid: null,
    activeRegion: 'both',
    // bgMask: 0..255 not-the-subject, as the separation mode returns it.
    // regionW: Foreground/Background 0..255 weights that add up to 255 at
    // every pixel; cover: the same softened; labels: the stronger per pixel.
    bgMask: null,
    regionW: null,
    cover: null,
    labels: null,
    soften: 0,
    bgMode: 'subject',
    colorMaps: {},
    colorMapIntensity: {},
    imagePalette: null,
    userPresets: [],
    activePreset: null,
    view: 'result',
    peek: false,
    tab: 'presets',
    pickMode: 'swap'
  };

  const cmBindings = [];
  const presetContainers = [];

  // Both applies to the whole picture first; then Foreground and Background
  // each get their own stack on top.
  const LAYER_REGIONS = ['fg', 'bg'];
  const ALL_REGIONS = ['both'].concat(LAYER_REGIONS);
  const REGION_KEY = { both: 'bothLayers', fg: 'fgLayers', bg: 'bgLayers' };
  const REGION_LABEL = { both: 'Both', fg: 'Foreground', bg: 'Background' };

  function regionName(r) {
    return REGION_LABEL[r] || 'Both';
  }

  function activeStack() {
    return state[REGION_KEY[state.activeRegion] || 'bothLayers'];
  }
  function firstStyleLayer() {
    const st = activeStack();
    return st.find((l) => l.kind === 'style');
  }
  function activeStyleLayer() {
    const st = activeStack();
    return st.find((l) => l.kind === 'style' && l.uid === state.activeUid) || st.find((l) => l.kind === 'style');
  }
  function activeColorMap() {
    return state.colorMaps[state.activeRegion];
  }
  function activeColorIntensity() {
    return state.colorMapIntensity[state.activeRegion];
  }
  function setActiveColorIntensity(v) {
    state.colorMapIntensity[state.activeRegion] = v;
  }
  function cmapLayer() {
    return activeStack().find((l) => l.kind === 'colormap');
  }
  function normalizeHex(value) {
    let v = String(value).trim().replace('#', '');
    if (v.length === 3) v = v[0] + v[0] + v[1] + v[1] + v[2] + v[2];
    return /^[0-9a-fA-F]{6}$/.test(v) ? '#' + v.toLowerCase() : null;
  }

  // ---------- dominant colour background mask ----------

  function softenMask(mask, w, h, radius, passes) {
    if (!radius) return new Uint8ClampedArray(mask);
    const n = w * h;
    let cur = new Float32Array(mask);
    const tmp = new Float32Array(n);
    const k = Math.max(1, radius);
    passes = passes || 1;
    const pref = new Float32Array(Math.max(w, h) + 1);
    for (let pass = 0; pass < passes; pass++) {
      // horizontal
      for (let y = 0; y < h; y++) {
        const row = y * w;
        pref[0] = 0;
        for (let x = 0; x < w; x++) pref[x + 1] = pref[x] + cur[row + x];
        for (let x = 0; x < w; x++) {
          const l = Math.max(0, x - k);
          const r = Math.min(w - 1, x + k);
          tmp[row + x] = (pref[r + 1] - pref[l]) / (r - l + 1);
        }
      }
      // vertical
      for (let x = 0; x < w; x++) {
        pref[0] = 0;
        for (let y = 0; y < h; y++) pref[y + 1] = pref[y] + tmp[y * w + x];
        for (let y = 0; y < h; y++) {
          const l = Math.max(0, y - k);
          const r = Math.min(h - 1, y + k);
          cur[y * w + x] = (pref[r + 1] - pref[l]) / (r - l + 1);
        }
      }
    }
    const out = new Uint8ClampedArray(n);
    for (let i = 0; i < n; i++) out[i] = Math.round(cur[i]);
    return out;
  }

  // Subject finds the sharp, distinctive thing (focus + colour, cut with
  // GrabCut); Flat backdrop is the older flood from the border through the
  // most common colour, still the better pick for a product on a plain sweep.
  function sepMode() {
    const modes = window.BackgroundSep && window.BackgroundSep.modes;
    return modes && (modes[state.bgMode] || modes.dominant);
  }

  // Soften only re-blurs the layer edges; it never needs the cut redone. A box
  // blur is linear, so the softened weights still add up to 255.
  function applySoften() {
    if (!state.regionW) return;
    state.soften = +els.bgSoften.value;
    state.cover = {};
    for (const r of LAYER_REGIONS) state.cover[r] = softenMask(state.regionW[r], state.w, state.h, state.soften, 2);
  }

  // Foreground and Background weights from the separation mode's mask.
  function splitRegions(data, w, h, notSubject) {
    const fg = new Uint8ClampedArray(w * h);
    for (let p = 0; p < fg.length; p++) fg[p] = 255 - notSubject[p];
    return { fg: fg, bg: Uint8ClampedArray.from(notSubject) };
  }

  function labelsOf(W, n) {
    const out = new Uint8Array(n);
    for (let p = 0; p < n; p++) {
      let best = 0;
      let v = W.fg[p];
      for (let k = 1; k < LAYER_REGIONS.length; k++) {
        const x = W[LAYER_REGIONS[k]][p];
        if (x > v) { v = x; best = k; }
      }
      out[p] = best;
    }
    return out;
  }

  function computeMask() {
    if (!state.data) return;
    const mode = sepMode();
    if (!mode) return;
    // Same photo, mode and tolerance (a preset applied, say): keep the cut.
    const cvNow = !!(window.cv && window.cv.Mat);
    const key = state.bgMode + '|' + els.bgTol.value + '|' + cvNow;
    if (state.regionW && state._maskFor === state.data && state._maskKey === key) {
      applySoften();
      return;
    }
    state._maskFor = state.data;
    state._maskKey = key;
    try {
      state.bgMask = mode.compute(state.data, state.w, state.h, { tolerance: +els.bgTol.value });
      state.regionW = splitRegions(state.data, state.w, state.h, state.bgMask);
      state.labels = labelsOf(state.regionW, state.w * state.h);
      applySoften();
    } catch (err) {
      console.error(err);
      state.bgMask = null;
      state.regionW = null;
      state.cover = null;
      state.labels = null;
    }
  }

  // ---------- loading ----------

  els.fileInput.addEventListener('change', (e) => loadFile(e.target.files[0]));

  ['dragenter', 'dragover'].forEach((ev) =>
    els.studio.addEventListener(ev, (e) => {
      e.preventDefault();
      els.studio.classList.add('drag');
    })
  );
  ['dragleave', 'drop'].forEach((ev) =>
    els.studio.addEventListener(ev, (e) => {
      e.preventDefault();
      els.studio.classList.remove('drag');
    })
  );
  els.studio.addEventListener('drop', (e) => loadFile(e.dataTransfer.files[0]));

  window.addEventListener('paste', (e) => {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        loadFile(item.getAsFile());
        break;
      }
    }
  });

  function loadFile(file) {
    if (!file || !file.type || file.type.indexOf('image/') !== 0) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      loadFromImage(img);
      URL.revokeObjectURL(url);
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  }

  function rgbToHex(r, g, b) {
    const h = (n) => n.toString(16).padStart(2, '0');
    return '#' + h(r) + h(g) + h(b);
  }

  // labels + idx: only the pixels whose strongest layer is idx; no labels:
  // the whole picture.
  function samplePalette(data, w, h, labels, idx) {
    const cnt = [0, 0, 0];
    const sum = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let p = 0, i = 0; p < w * h; p++, i += 4) {
      if (labels && labels[p] !== idx) continue;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const bin = l < 85 ? 0 : (l < 170 ? 1 : 2);
      cnt[bin]++;
      sum[bin][0] += r;
      sum[bin][1] += g;
      sum[bin][2] += b;
    }
    const avg = (k) => (cnt[k] > 0 ? [sum[k][0] / cnt[k], sum[k][1] / cnt[k], sum[k][2] / cnt[k]] : null);
    let s = avg(0);
    let m = avg(1);
    let H = avg(2);
    if (!s) s = m || H || [0, 0, 0];
    if (!m) m = s || H || [0, 0, 0];
    if (!H) H = m || s || [0, 0, 0];
    const keys = ['shadow', 'mid', 'high'];
    const out = {};
    out[keys[0]] = rgbToHex(Math.round(s[0]), Math.round(s[1]), Math.round(s[2]));
    out[keys[1]] = rgbToHex(Math.round(m[0]), Math.round(m[1]), Math.round(m[2]));
    out[keys[2]] = rgbToHex(Math.round(H[0]), Math.round(H[1]), Math.round(H[2]));
    return out;
  }

  function regionPalette(region) {
    const sp = state.imagePalette && state.imagePalette[region];
    return {
      identity: false,
      shadow: (sp && sp.shadow) || '#000000',
      mid: (sp && sp.mid) || '#808080',
      high: (sp && sp.high) || '#ffffff'
    };
  }

  function makeColorMapLayer(region) {
    return { uid: nuid(), kind: 'colormap', region: region, enabled: false, _open: false, blend: 'normal', params: { intensity: 100 } };
  }

  function resetLayers() {
    computeMask();
    state.imagePalette = { both: samplePalette(state.data, state.w, state.h, null, 0) };
    LAYER_REGIONS.forEach((r, k) => {
      state.imagePalette[r] = samplePalette(state.data, state.w, state.h, state.labels, k);
    });
    state.colorMaps = {};
    state.colorMapIntensity = {};
    for (const r of ALL_REGIONS) {
      state[REGION_KEY[r]] = [makeColorMapLayer(r)];
      state.colorMaps[r] = regionPalette(r);
      state.colorMapIntensity[r] = 100;
    }
    state.activeUid = null;
    updatePaneHighlight();
    updateBgSliderVisibility();
    setCurrentLabel(null);
    updateGridHighlight();
  }

  function loadFromImage(img) {
    const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const cx = c.getContext('2d');
    cx.imageSmoothingQuality = 'high';
    cx.drawImage(img, 0, 0, w, h);
    state.data = cx.getImageData(0, 0, w, h).data;
    state.w = w;
    state.h = h;

    for (const id of ['originalCanvas', 'resultCanvas', 'fgCanvas', 'bgCanvas']) {
      const cv = els[id];
      cv.width = w;
      cv.height = h;
    }
    els.originalCanvas.getContext('2d').putImageData(new ImageData(state.data, w, h), 0, 0);
    drawStage();

    state.activePreset = null;
    resetLayers();
    buildFilterGrid();
    buildPresetList();
    renderLayerList();
    scheduleRender();
  }

  // ---------- region switching ----------

  function updatePaneHighlight() {
    for (const pane of els.panes) {
      pane.classList.toggle('viewing', pane.dataset.view === state.view);
    }
    for (const b of els.regionBtns) {
      b.classList.toggle('on', b.dataset.region === state.activeRegion);
      b.setAttribute('aria-checked', b.dataset.region === state.activeRegion ? 'true' : 'false');
    }
  }

  // ---------- stage ----------
  //
  // One big picture mirroring whichever small view is picked; holding it down
  // shows the original instead.

  const VIEW_CANVAS = { original: 'originalCanvas', result: 'resultCanvas', fg: 'fgCanvas', bg: 'bgCanvas' };
  const VIEW_LABEL = { original: 'Original', result: 'Result', fg: 'Foreground', bg: 'Background' };

  function drawStage() {
    if (!state.data) return;
    const view = state.peek ? 'original' : state.view;
    const cv = els.stageCanvas;
    if (cv.width !== state.w || cv.height !== state.h) {
      cv.width = state.w;
      cv.height = state.h;
    }
    cv.getContext('2d').drawImage(els[VIEW_CANVAS[view]], 0, 0);
    els.stageLabel.textContent = VIEW_LABEL[view] + (state.peek || view === 'original' ? '' : ' \u00B7 hold to compare');
  }

  function setView(view) {
    state.view = view;
    updatePaneHighlight();
    drawStage();
  }

  function setPeek(on) {
    if (state.peek === on) return;
    state.peek = on;
    els.stage.classList.toggle('peek', on);
    drawStage();
  }

  els.stage.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    setPeek(true);
  });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) {
    els.stage.addEventListener(ev, () => setPeek(false));
  }
  els.stage.addEventListener('contextmenu', (e) => e.preventDefault());

  // ---------- tabs ----------

  const UI_KEY = 'image-filters-ui-v1';

  function setTab(tab) {
    state.tab = tab;
    for (const b of els.tabs) b.setAttribute('aria-selected', b.dataset.tab === tab ? 'true' : 'false');
    for (const p of els.tabPanels) p.hidden = p.dataset.panel !== tab;
    if (tab !== 'styles') state.pickMode = 'swap';
    if (tab === 'styles') updateStylesTarget();
    try {
      localStorage.setItem(UI_KEY, JSON.stringify({ tab: tab }));
    } catch (err) {
      // private window - the tab just isn't remembered
    }
  }

  for (const b of els.tabs) b.addEventListener('click', () => setTab(b.dataset.tab));

  function updateStylesTarget() {
    const region = regionName(state.activeRegion);
    const L = activeStyleLayer();
    if (state.pickMode === 'add' || !L) {
      els.stylesTarget.innerHTML = 'Pick a style to add to <b>' + region + '</b>.';
    } else {
      els.stylesTarget.innerHTML = 'Picking swaps <b>' + byId(L.filterId).name + '</b> on <b>' + region + '</b>. To stack a new one, use + Add style on Layers.';
    }
  }

  function updateLayerCounts() {
    const n = (st) => st.filter((L) => L.enabled).length;
    const counts = {};
    let total = 0;
    for (const r of ALL_REGIONS) {
      counts[r] = n(state[REGION_KEY[r]] || []);
      total += counts[r];
    }
    els.layerCount.textContent = total ? String(total) : '';
    for (const b of els.regionBtns) {
      let tag = b.querySelector('.n');
      if (!tag) {
        tag = document.createElement('span');
        tag.className = 'n';
        b.appendChild(tag);
      }
      tag.textContent = counts[b.dataset.region] || '';
    }
  }

  els.styleSearch.addEventListener('input', () => {
    const q = els.styleSearch.value.trim().toLowerCase();
    for (const card of els.filterGrid.children) {
      card.hidden = !!q && card.textContent.toLowerCase().indexOf(q) < 0;
    }
  });

  function updateBgSliderVisibility() {
    if (!els.bgSliderGroup) return;
    const show = state.activeRegion !== 'both';
    els.bgSliderGroup.classList.toggle('hidden', !show);
  }

  function setRegion(region) {
    if (region === state.activeRegion) return;
    closeCopyMenu();
    state.activeRegion = region;
    if (state.view !== 'original') state.view = region === 'both' ? 'result' : region;
    state.activeUid = null;
    updatePaneHighlight();
    updateBgSliderVisibility();
    setCurrentLabel(null);
    updateGridHighlight();
    renderLayerList();
    scheduleThumbs();
  }

  for (const pane of els.panes) {
    pane.addEventListener('click', () => {
      if (pane.dataset.region) setRegion(pane.dataset.region);
      setView(pane.dataset.view);
    });
  }
  for (const b of els.regionBtns) {
    b.addEventListener('click', () => {
      setRegion(b.dataset.region);
      drawStage();
    });
  }

  // A Subject cut takes a few hundred ms, so wait for the slider to settle.
  function scheduleMask() {
    clearTimeout(scheduleMask.t);
    scheduleMask.t = setTimeout(() => {
      computeMask();
      scheduleRender();
      scheduleThumbs();
      schedulePresetList();
    }, 90);
  }

  els.bgTol.addEventListener('input', () => {
    els.bgTolVal.textContent = els.bgTol.value;
    els.bgTol.style.setProperty('--fill', ((+els.bgTol.value / 95) * 100) + '%');
    scheduleMask();
  });
  els.bgSoften.addEventListener('input', () => {
    els.bgSoftenVal.textContent = els.bgSoften.value;
    els.bgSoften.style.setProperty('--fill', ((+els.bgSoften.value / 30) * 100) + '%');
    applySoften();
    scheduleRender();
    scheduleThumbs();
    schedulePresetList();
  });
  els.bgMode.value = state.bgMode;
  els.bgMode.addEventListener('change', () => {
    state.bgMode = els.bgMode.value;
    scheduleMask();
  });
  els.bgTol.value = 46;
  els.bgTolVal.textContent = '46';
  els.bgTol.style.setProperty('--fill', ((46 / 95) * 100) + '%');
  els.bgSoften.value = 0;
  els.bgSoftenVal.textContent = '0';
  els.bgSoften.style.setProperty('--fill', '0%');

  // ---------- colour map ----------

  function registerCmInputs(scope) {
    scope.querySelectorAll('.cm-row[data-cm]').forEach((row) => {
      const key = row.dataset.cm;
      const swatch = row.querySelector('input[type="color"]');
      const hex = row.querySelector('.hex-input');
      cmBindings.push({ key, swatch, hex });
      swatch.addEventListener('input', () => setCmColor(key, swatch.value));
      hex.addEventListener('input', () => {
        const v = normalizeHex(hex.value);
        if (v) setCmColor(key, v);
      });
      hex.addEventListener('change', () => {
        const v = normalizeHex(hex.value);
        const cm = activeColorMap();
        if (v && v !== cm[key]) setCmColor(key, v);
        else hex.value = cm[key] || '';
      });
    });
  }

  function ensureColorMapEnabled() {
    const cl = cmapLayer();
    if (!cl) {
      setColorMapEnabled(true);
      return;
    }
    if (cl.enabled) return;
    cl.enabled = true;
    // The card isn't rebuilt on this path, so bring its switch along by hand or
    // it reads as off while its colours are plainly being applied.
    const card = els.layerList.querySelector('[data-uid="' + cl.uid + '"]');
    if (card) {
      card.classList.toggle('off', false);
      const cb = card.querySelector('.switch-label input[type="checkbox"]');
      if (cb) cb.checked = true;
    }
  }

  function setCmColor(key, value) {
    const cm = activeColorMap();
    cm[key] = value;
    delete cm.identity;
    ensureColorMapEnabled();
    clearPresetActive();
    syncCmUI();
    syncCmGridState();
    scheduleRender();
    scheduleThumbs();
  }

  function clearPresetActive() {
    for (const container of presetContainers) {
      for (const el of container.children) el.classList.remove('active');
    }
  }

  function setActivePreset(name) {
    clearPresetActive();
    for (const container of presetContainers) {
      for (const el of container.children) {
        if (el.dataset.name === name) el.classList.add('active');
      }
    }
  }

  function syncCmUI() {
    const cm = activeColorMap();
    for (const b of cmBindings) {
      b.swatch.value = cm[b.key];
      b.hex.value = cm[b.key];
    }
  }

  function syncCmGridState() {
    for (const grid of els.layerList.querySelectorAll('.cm-grid')) {
      grid.classList.remove('cm-off');
    }
  }

  function setColorMapEnabled(on) {
    const st = activeStack();
    let L = cmapLayer();
    if (on) {
      if (!L) {
        L = makeColorMapLayer(state.activeRegion);
        st.push(L);
      } else {
        L.enabled = true;
      }
      setCurrentLabel('Colour map');
    } else if (L) {
      st.splice(st.indexOf(L), 1);
      const base = activeStyleLayer();
      setCurrentLabel(base ? byId(base.filterId).name : null);
    }
    scheduleRender();
    scheduleThumbs();
    if (state.data) renderLayerList();
  }

  function buildPresets(container) {
    presetContainers.push(container);
    for (const entry of Object.entries(window.ColorMapPresets || {})) {
      const name = entry[0];
      const cols = entry[1];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'preset-pill';
      b.title = name;
      b.dataset.name = name;
      const swatch = document.createElement('span');
      swatch.className = 'swatch';
      swatch.style.background = 'linear-gradient(135deg, ' + cols.shadow + ', ' + cols.mid + ' 55%, ' + cols.high + ')';
      const label = document.createElement('span');
      label.className = 'name';
      label.textContent = name;
      b.append(swatch, label);
      b.addEventListener('click', () => {
        const cm = activeColorMap();
        if (cols._neutral) {
          const sp = state.imagePalette && state.imagePalette[state.activeRegion];
          cm.shadow = (sp && sp.shadow) || '#000000';
          cm.mid = (sp && sp.mid) || '#808080';
          cm.high = (sp && sp.high) || '#ffffff';
        } else {
          cm.shadow = cols.shadow;
          cm.mid = cols.mid;
          cm.high = cols.high;
        }
        delete cm.identity;
        ensureColorMapEnabled();
        setActivePreset(name);
        syncCmUI();
        syncCmGridState();
        scheduleRender();
        scheduleThumbs();
      });
      container.appendChild(b);
    }
  }

  // ---------- layer stack ----------

  function setCurrentLabel(name) {
    const region = regionName(state.activeRegion);
    els.layersTitle.textContent = name ? region + ' \u00B7 ' + name : region;
  }

  function setActive(L) {
    if (!L || L.kind !== 'style') return;
    state.activeUid = L.uid;
    setCurrentLabel(byId(L.filterId).name);
    updateGridHighlight();
    renderLayerList();
  }

  function updateGridHighlight() {
    const L = activeStyleLayer();
    for (const el of els.filterGrid.children) {
      el.classList.toggle('active', !!L && el.dataset.id === L.filterId);
    }
  }

  els.addLayerBtn.addEventListener('click', () => {
    setTab('styles');
    state.pickMode = 'add';
    updateStylesTarget();
    els.filterGrid.parentElement.scrollTop = 0;
  });

  function addStyleLayer(filterId) {
    const f = byId(filterId);
    if (!f) return;
    const L = { uid: nuid(), kind: 'style', filterId: filterId, enabled: true, _open: true, opacity: 100, srcColour: 0, blend: 'normal', params: defaultParams(f) };
    const st = activeStack();
    st.push(L);
    setActive(L);
    scheduleRender();
    requestAnimationFrame(() => {
      const card = els.layerList.querySelector('[data-uid="' + L.uid + '"]');
      if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }

  function makeParamRow(L, d) {
    const row = document.createElement('div');
    row.className = 'param-row';
    const lb = document.createElement('span');
    lb.className = 'param-label';
    lb.textContent = d.label;
    const r = document.createElement('input');
    r.type = 'range';
    r.min = d.min;
    r.max = d.max;
    r.step = d.step || 1;
    r.value = L.params[d.key];
    const val = document.createElement('span');
    val.className = 'param-val';
    const paint = () => {
      val.textContent = +d.max === 100 ? r.value + '%' : r.value;
      r.style.setProperty('--fill', (((r.value - d.min) / (d.max - d.min)) * 100) + '%');
    };
    paint();
    r.addEventListener('input', () => {
      L.params[d.key] = +r.value;
      paint();
      scheduleRender();
    });
    row.append(lb, r, val);
    return row;
  }

  function makeIntensityRow(L) {
    const row = document.createElement('div');
    row.className = 'param-row';
    const lb = document.createElement('span');
    lb.className = 'param-label';
    lb.textContent = 'Intensity';
    const r = document.createElement('input');
    r.type = 'range';
    r.min = 0;
    r.max = 100;
    r.value = activeColorIntensity();
    const val = document.createElement('span');
    val.className = 'param-val';
    const paint = () => {
      val.textContent = r.value + '%';
      r.style.setProperty('--fill', ((r.value - r.min) / (r.max - r.min)) * 100 + '%');
    };
    paint();
    r.addEventListener('input', () => {
      setActiveColorIntensity(+r.value);
      if (!L.enabled) {
        L.enabled = true;
        const card = r.closest('.layer-card');
        if (card) card.classList.toggle('off', false);
      }
      paint();
      scheduleRender();
      scheduleThumbs();
    });
    row.append(lb, r, val);
    return row;
  }

  function makeOpacityRow(L) {
    const row = document.createElement('div');
    row.className = 'param-row';
    const lb = document.createElement('span');
    lb.className = 'param-label';
    lb.textContent = 'Opacity';
    const r = document.createElement('input');
    r.type = 'range';
    r.min = 0;
    r.max = 100;
    r.value = L.opacity == null ? 100 : L.opacity;
    const val = document.createElement('span');
    val.className = 'param-val';
    const paint = () => {
      val.textContent = r.value + '%';
      r.style.setProperty('--fill', ((r.value - r.min) / (r.max - r.min)) * 100 + '%');
    };
    paint();
    r.addEventListener('input', () => {
      L.opacity = +r.value;
      paint();
      scheduleRender();
    });
    row.append(lb, r, val);
    return row;
  }

  function makeSourceColourRow(L) {
    const row = document.createElement('div');
    row.className = 'param-row src-colour-row';
    row.hidden = !filterRecolours(byId(L.filterId));
    const lb = document.createElement('span');
    lb.className = 'param-label';
    lb.textContent = 'Source colour';
    lb.title = 'Keep the photo’s own colours and take only this style’s light and shade';
    const r = document.createElement('input');
    r.type = 'range';
    r.min = 0;
    r.max = 100;
    r.value = L.srcColour == null ? 0 : L.srcColour;
    const val = document.createElement('span');
    val.className = 'param-val';
    const paint = () => {
      val.textContent = r.value + '%';
      r.style.setProperty('--fill', ((r.value - r.min) / (r.max - r.min)) * 100 + '%');
    };
    paint();
    r.addEventListener('input', () => {
      L.srcColour = +r.value;
      paint();
      scheduleRender();
    });
    row.append(lb, r, val);
    return row;
  }

  function makeBlendRow(L) {
    const row = document.createElement('div');
    row.className = 'param-row';
    const lb = document.createElement('span');
    lb.className = 'param-label';
    lb.textContent = 'Blend';
    const sel = document.createElement('select');
    sel.className = 'blend-select';
    for (const m of BLEND_MODES) {
      const o = document.createElement('option');
      o.value = m.id;
      o.textContent = m.name;
      sel.appendChild(o);
    }
    sel.value = L.blend || 'normal';
    sel.addEventListener('change', () => {
      L.blend = sel.value;
      scheduleRender();
    });
    row.append(lb, sel);
    return row;
  }

  function makeLayerCard(L, idx) {
    const st = activeStack();
    const card = document.createElement('div');
    card.className = 'layer-card' + (L.enabled ? '' : ' off') + (L.kind === 'style' && activeStyleLayer() === L ? ' active' : '');
    card.dataset.uid = L.uid;

    const head = document.createElement('div');
    head.className = 'layer-head';

    const chev = document.createElement('button');
    chev.type = 'button';
    chev.className = 'icon-btn ghost';
    chev.title = 'Show/hide controls';
    chev.textContent = L._open ? '\u25BE' : '\u25B8';

    const lab = document.createElement('label');
    lab.className = 'switch-label';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = L.enabled;
    const sw = document.createElement('span');
    sw.className = 'switch';
    lab.append(cb, sw);

    const nm = document.createElement('span');
    nm.className = 'layer-name';
    nm.textContent = L.kind === 'colormap' ? 'Colour map' : byId(L.filterId).name;

    const up = document.createElement('button');
    up.type = 'button';
    up.className = 'icon-btn';
    up.title = 'Move up';
    up.textContent = '\u2191';
    up.disabled = idx === 0;
    const down = document.createElement('button');
    down.type = 'button';
    down.className = 'icon-btn';
    down.title = 'Move down';
    down.textContent = '\u2193';
    down.disabled = idx === st.length - 1;

    head.append(chev, lab, nm, up, down);

    if (L.kind === 'style') {
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'icon-btn danger';
      del.title = 'Remove layer';
      del.textContent = '\u2715';
      del.addEventListener('click', () => {
        st.splice(st.indexOf(L), 1);
        if (state.activeUid === L.uid) {
          state.activeUid = null;
          updateGridHighlight();
        }
        renderLayerList();
        scheduleRender();
        scheduleThumbs();
      });
      head.append(del);
    }

    card.appendChild(head);

    const body = document.createElement('div');
    body.className = 'layer-body';
    body.style.display = L._open ? '' : 'none';
    card.appendChild(body);

    card.addEventListener('click', (e) => {
      if (L.kind !== 'style') return;
      if (e.target.closest('button, input, label, select')) return;
      setActive(L);
    });

    chev.addEventListener('click', () => {
      L._open = !L._open;
      body.style.display = L._open ? '' : 'none';
      chev.textContent = L._open ? '\u25BE' : '\u25B8';
    });
    cb.addEventListener('change', () => {
      L.enabled = cb.checked;
      card.classList.toggle('off', !L.enabled);
      scheduleRender();
      scheduleThumbs();
    });
    up.addEventListener('click', () => {
      if (idx === 0) return;
      const tmp = st[idx - 1];
      st[idx - 1] = st[idx];
      st[idx] = tmp;
      renderLayerList();
      scheduleRender();
    });
    down.addEventListener('click', () => {
      if (idx >= st.length - 1) return;
      const tmp = st[idx + 1];
      st[idx + 1] = st[idx];
      st[idx] = tmp;
      renderLayerList();
      scheduleRender();
    });

    if (L.kind === 'style') {
      body.appendChild(makeBlendRow(L));
      body.appendChild(makeSourceColourRow(L));
      body.appendChild(makeOpacityRow(L));
      const f = byId(L.filterId);
      for (const d of f.params || []) body.appendChild(makeParamRow(L, d));
    } else {
      body.appendChild(makeIntensityRow(L));
      const grid = document.createElement('div');
      grid.className = 'cm-grid';
      grid.innerHTML =
        '<div class="cm-row" data-cm="shadow"><span class="cm-label">Shadows</span><input type="color" title="Shadows"><input type="text" class="hex-input" maxlength="7" spellcheck="false" aria-label="Shadows hex value"></div>' +
        '<div class="cm-row" data-cm="mid"><span class="cm-label">Midtones</span><input type="color" title="Midtones"><input type="text" class="hex-input" maxlength="7" spellcheck="false" aria-label="Midtones hex value"></div>' +
        '<div class="cm-row" data-cm="high"><span class="cm-label">Highlights</span><input type="color" title="Highlights"><input type="text" class="hex-input" maxlength="7" spellcheck="false" aria-label="Highlights hex value"></div>';
      body.appendChild(grid);
      registerCmInputs(grid);
      syncCmUI();
      const presetsWrap = document.createElement('div');
      presetsWrap.className = 'cm-presets';
      presetsWrap.innerHTML = '<span class="cm-label">Presets</span>';
      const prow = document.createElement('div');
      prow.className = 'preset-row';
      presetsWrap.appendChild(prow);
      body.appendChild(presetsWrap);
      buildPresets(prow);
      const cm = activeColorMap();
      for (const el of prow.children) {
        const p = window.ColorMapPresets[el.dataset.name];
        if (!p) continue;
        let isActive = false;
        if (p._neutral) {
          const sp = state.imagePalette && state.imagePalette[state.activeRegion];
          isActive = !!sp && cm.shadow === sp.shadow && cm.mid === sp.mid && cm.high === sp.high;
        } else {
          isActive = cm.shadow === p.shadow && cm.mid === p.mid && cm.high === p.high;
        }
        if (isActive) {
          el.classList.add('active');
          break;
        }
      }
    }
    return card;
  }

  function renderLayerList() {
    cmBindings.length = 0;
    presetContainers.length = 0;
    els.layerList.innerHTML = '';
    updateLayerCounts();
    const st = activeStack();
    if (!st.length) {
      const p = document.createElement('p');
      p.className = 'empty-layers';
      p.textContent = 'No layers yet — add a style or colour map for this region.';
      els.layerList.appendChild(p);
      return;
    }
    st.forEach((L, idx) => els.layerList.appendChild(makeLayerCard(L, idx)));
    syncCmGridState();
  }

  // ---------- presets ----------
  //
  // A preset is the whole look: every layer on Both, Foreground and Background,
  // with its params, blend, opacity and colour map. It leaves the separation
  // settings alone - where the split falls depends on the photo, not the look.
  // Built-ins come from presets.js; saved ones live in localStorage.

  const PRESET_KEY = 'image-filters-presets-v1';
  const REGIONS = ALL_REGIONS.map((r) => [r, REGION_KEY[r]]);

  function presetRegion(p, region) {
    return (p && p.regions && p.regions[region]) || [];
  }

  function loadUserPresets() {
    try {
      const list = JSON.parse(localStorage.getItem(PRESET_KEY) || '[]');
      return Array.isArray(list) ? list.filter((p) => p && p.name && p.regions) : [];
    } catch (err) {
      return [];
    }
  }

  function saveUserPresets() {
    try {
      localStorage.setItem(PRESET_KEY, JSON.stringify(state.userPresets));
    } catch (err) {
      console.warn('Could not save presets', err);
    }
  }

  function allPresets() {
    const builtIn = (window.StudioPresets || []).map((p) => Object.assign({ builtin: true }, p));
    return builtIn.concat(state.userPresets);
  }

  function snapshotLayer(L, region) {
    if (L.kind === 'colormap') {
      const cm = state.colorMaps[region];
      return { kind: 'colormap', enabled: L.enabled, intensity: state.colorMapIntensity[region], shadow: cm.shadow, mid: cm.mid, high: cm.high };
    }
    return {
      filter: L.filterId,
      enabled: L.enabled,
      opacity: L.opacity == null ? 100 : L.opacity,
      blend: L.blend || 'normal',
      srcColour: L.srcColour || 0,
      params: Object.assign({}, L.params)
    };
  }

  function snapshotPreset(name) {
    const regions = {};
    for (const [region, key] of REGIONS) {
      // An untouched colour map is the default every stack starts with; leave it out.
      regions[region] = state[key]
        .filter((L) => L.kind === 'style' || L.enabled)
        .map((L) => snapshotLayer(L, region));
    }
    return { name: name, regions: regions };
  }

  // Turn a saved stack back into live layers. Params are laid over the style's
  // defaults, so a preset saved before a style grew a new param still loads,
  // and a style that no longer exists is skipped rather than breaking it.
  function buildPresetStack(saved, region) {
    const layers = [];
    let cmap = null;
    let intensity = 100;
    for (const s of saved || []) {
      if (s.kind === 'colormap') {
        const L = makeColorMapLayer(region);
        L.enabled = s.enabled !== false;
        L._open = false;
        layers.push(L);
        cmap = { shadow: s.shadow || '#000000', mid: s.mid || '#808080', high: s.high || '#ffffff' };
        intensity = s.intensity == null ? 100 : s.intensity;
        continue;
      }
      const f = byId(s.filter);
      if (!f) continue;
      const params = defaultParams(f);
      for (const d of f.params || []) {
        if (s.params && typeof s.params[d.key] === 'number') params[d.key] = s.params[d.key];
      }
      layers.push({
        uid: nuid(), kind: 'style', filterId: f.id, enabled: s.enabled !== false, _open: false,
        opacity: s.opacity == null ? 100 : s.opacity, srcColour: s.srcColour || 0, blend: s.blend || 'normal', params: params
      });
    }
    if (!cmap) layers.unshift(makeColorMapLayer(region));
    return { layers: layers, cmap: cmap || regionPalette(region), intensity: intensity };
  }

  function applyPreset(p) {
    if (!state.data) return;
    resetLayers();
    if (p) {
      for (const [region, key] of REGIONS) {
        const built = buildPresetStack(presetRegion(p, region), region);
        state[key] = built.layers;
        state.colorMaps[region] = built.cmap;
        state.colorMapIntensity[region] = built.intensity;
      }
    }
    state.activePreset = p ? p.name : null;
    updatePresetHighlight();
    renderLayerList();
    scheduleRender();
    scheduleThumbs();
  }

  function presetByName(name) {
    return allPresets().find((p) => p.name === name) || null;
  }

  function updatePresetHighlight() {
    for (const card of els.presetList.querySelectorAll('.pz-card')) {
      card.classList.toggle('active', (card.dataset.name || null) === state.activePreset);
    }
  }

  // The layers at thumbnail size, worked out once per preset list so every
  // card shows the Foreground/Background split too.
  function thumbCovers(small, tw, th) {
    const mode = sepMode();
    if (!mode) return null;
    try {
      const notSubject = mode.compute(small, tw, th, { tolerance: +els.bgTol.value });
      const W = splitRegions(small, tw, th, notSubject);
      const r = Math.round((state.soften * tw) / state.w);
      const cover = {};
      for (const k of LAYER_REGIONS) cover[k] = softenMask(W[k], tw, th, r, 2);
      return cover;
    } catch (err) {
      return null;
    }
  }

  // Render a preset over the current photo at thumbnail size.
  function presetPreview(p, small, tw, th, covers) {
    const ctx = { w: tw, h: th, colorMaps: {}, colorMapIntensity: {} };
    const stacks = {};
    for (const [region, key] of REGIONS) {
      const built = buildPresetStack(presetRegion(p, region), region);
      stacks[key] = built.layers;
      ctx.colorMaps[region] = built.cmap;
      ctx.colorMapIntensity[region] = built.intensity;
    }
    try {
      return compose(ctx, small, stacks, covers).out;
    } catch (err) {
      // A style that is still loading (OpenCV) - show the photo for now.
      return new Uint8ClampedArray(small);
    }
  }

  function makePresetCard(p, small, tw, th, covers) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'pz-card';
    card.dataset.name = p ? p.name : '';
    card.title = p ? (p.note || p.name) : 'Clear every layer';
    const cv = document.createElement('canvas');
    cv.width = tw;
    cv.height = th;
    // Drawn later by paintPresetCards; start with the plain photo.
    cv.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(small), tw, th), 0, 0);
    card._paint = () => cv.getContext('2d').putImageData(new ImageData(presetPreview(p, small, tw, th, covers), tw, th), 0, 0);
    const label = document.createElement('span');
    label.className = 'pz-name';
    label.textContent = p ? p.name : 'Original';
    card.append(cv, label);
    card.addEventListener('click', (e) => {
      if (e.target.closest('.pz-del')) return;
      applyPreset(p);
    });
    if (p && !p.builtin) {
      const del = document.createElement('span');
      del.className = 'pz-del';
      del.setAttribute('role', 'button');
      del.tabIndex = 0;
      del.title = 'Delete preset';
      del.textContent = '✕';
      const remove = () => {
        if (!window.confirm('Delete the preset “' + p.name + '”?')) return;
        state.userPresets = state.userPresets.filter((u) => u.name !== p.name);
        saveUserPresets();
        if (state.activePreset === p.name) state.activePreset = null;
        buildPresetList();
      };
      del.addEventListener('click', remove);
      del.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          remove();
        }
      });
      card.appendChild(del);
    }
    return card;
  }

  function buildPresetList() {
    els.presetList.innerHTML = '';
    if (!state.data) return;
    const tw = 132;
    const th = Math.max(1, Math.round((tw * state.h) / state.w));
    const small = scaleData(state.data, state.w, state.h, tw, th).data;
    const covers = thumbCovers(small, tw, th);
    els.presetList.appendChild(makePresetCard(null, small, tw, th, covers));
    // Built-ins under their group headings, then the ones saved here.
    const sections = (window.StudioPresetGroups || []).map((g) => [g, []]);
    const byGroup = new Map(sections);
    const other = [];
    for (const p of allPresets()) {
      if (!p.builtin) continue;
      (byGroup.get(p.group) || other).push(p);
    }
    if (other.length) sections.push(['More', other]);
    if (state.userPresets.length) sections.push(['Your presets', state.userPresets]);
    for (const [title, list] of sections) {
      if (!list.length) continue;
      const h = document.createElement('p');
      h.className = 'pz-group';
      h.textContent = title;
      els.presetList.appendChild(h);
      for (const p of list) els.presetList.appendChild(makePresetCard(p, small, tw, th, covers));
    }
    updatePresetHighlight();
    paintPresetCards();
  }

  // With dozens of presets, drawing every preview up front froze the page
  // for seconds on each new photo. Paint them one per tick instead; a newer
  // list (new photo, tolerance moved) cancels an unfinished run.
  function paintPresetCards() {
    const run = (paintPresetCards.run = (paintPresetCards.run || 0) + 1);
    const cards = Array.prototype.slice.call(els.presetList.children);
    let i = 0;
    const step = () => {
      if (run !== paintPresetCards.run) return;
      const t0 = performance.now();
      while (i < cards.length && performance.now() - t0 < 24) {
        const c = cards[i++];
        if (c._paint) c._paint();
      }
      if (i < cards.length) setTimeout(step, 0);
    };
    setTimeout(step, 0);
  }

  function schedulePresetList() {
    clearTimeout(schedulePresetList.t);
    schedulePresetList.t = setTimeout(buildPresetList, 300);
  }

  function saveCurrentAsPreset(name) {
    name = String(name || '').trim().slice(0, 40);
    if (!name) return false;
    // Built-in names are taken; a saved preset with the same name is replaced.
    const builtIn = new Set((window.StudioPresets || []).map((p) => p.name));
    let finalName = name;
    for (let k = 2; builtIn.has(finalName); k++) finalName = name + ' ' + k;
    const snap = snapshotPreset(finalName);
    const at = state.userPresets.findIndex((u) => u.name === finalName);
    if (at >= 0) state.userPresets[at] = snap;
    else state.userPresets.push(snap);
    saveUserPresets();
    state.activePreset = finalName;
    buildPresetList();
    return true;
  }

  function closeSaveForm() {
    els.savePresetForm.hidden = true;
    els.savePresetBtn.hidden = false;
  }

  els.savePresetBtn.addEventListener('click', () => {
    els.savePresetForm.hidden = false;
    els.savePresetBtn.hidden = true;
    els.presetName.value = state.activePreset && !(presetByName(state.activePreset) || {}).builtin ? state.activePreset : '';
    els.presetName.focus();
    els.presetName.select();
  });
  els.cancelPresetBtn.addEventListener('click', closeSaveForm);
  els.savePresetForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (saveCurrentAsPreset(els.presetName.value)) closeSaveForm();
    else els.presetName.focus();
  });
  els.presetName.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSaveForm();
  });

  // ---------- copy to another part of the picture ----------
  //
  // The selected style (or the whole stack, colour map included) copied onto
  // another region's stack, for when one look should go on, say, Foreground
  // and Background with different settings. Copies are independent afterwards.

  function cloneStyle(L) {
    return Object.assign({}, L, { uid: nuid(), _open: false, params: Object.assign({}, L.params) });
  }

  function copyLayers(from, to, whole) {
    const src = state[REGION_KEY[from]] || [];
    const dst = state[REGION_KEY[to]];
    if (!dst || from === to) return 0;
    let n = 0;
    if (whole) {
      for (const L of src) {
        if (L.kind === 'style') { dst.push(cloneStyle(L)); n++; }
      }
      const cm = src.find((L) => L.kind === 'colormap');
      const dcm = dst.find((L) => L.kind === 'colormap');
      if (cm && cm.enabled) {
        state.colorMaps[to] = Object.assign({}, state.colorMaps[from]);
        state.colorMapIntensity[to] = state.colorMapIntensity[from];
        if (dcm) dcm.enabled = true;
        else dst.unshift(Object.assign(makeColorMapLayer(to), { enabled: true }));
        n++;
      }
    } else {
      const L = src.find((l) => l.kind === 'style' && l.uid === state.activeUid) || src.find((l) => l.kind === 'style');
      if (L) { dst.push(cloneStyle(L)); n = 1; }
    }
    state.activePreset = null;
    updatePresetHighlight();
    scheduleRender();
    scheduleThumbs();
    return n;
  }

  function openCopyMenu() {
    const L = activeStyleLayer();
    const hasCm = (activeStack().find((l) => l.kind === 'colormap') || {}).enabled;
    // With no style selected there is only the stack to copy.
    els.copyWhole.checked = els.copyWhole.checked || !L;
    els.copyWhole.disabled = !L;
    const what = () => (els.copyWhole.checked || !L)
      ? 'Copy the <b>whole ' + regionName(state.activeRegion) + ' stack</b>' + (hasCm ? ' (colour map too)' : '') + ' to:'
      : 'Copy <b>' + byId(L.filterId).name + '</b> from ' + regionName(state.activeRegion) + ' to:';
    els.copyWhat.innerHTML = what();
    els.copyWhole.onchange = () => { els.copyWhat.innerHTML = what(); };
    els.copyTargets.innerHTML = '';
    els.copyDone.textContent = '';
    for (const r of ALL_REGIONS) {
      if (r === state.activeRegion) continue;
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = regionName(r);
      b.addEventListener('click', () => {
        const n = copyLayers(state.activeRegion, r, els.copyWhole.checked || !activeStyleLayer());
        els.copyDone.textContent = n ? 'Copied to ' + regionName(r) + '.' : 'Nothing to copy yet.';
        updateLayerCounts();
      });
      els.copyTargets.appendChild(b);
    }
    els.copyMenu.hidden = false;
    els.copyLayerBtn.setAttribute('aria-expanded', 'true');
  }

  function closeCopyMenu() {
    els.copyMenu.hidden = true;
    els.copyLayerBtn.setAttribute('aria-expanded', 'false');
  }

  els.copyLayerBtn.addEventListener('click', () => {
    if (els.copyMenu.hidden) openCopyMenu();
    else closeCopyMenu();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !els.copyMenu.hidden) closeCopyMenu();
  });

  // ---------- thumbnails ----------

  function scaleData(data, w, h, tw, th) {
    const a = document.createElement('canvas');
    a.width = w;
    a.height = h;
    a.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(data), w, h), 0, 0);
    const b = document.createElement('canvas');
    b.width = tw;
    b.height = th;
    const bx = b.getContext('2d');
    bx.imageSmoothingEnabled = true;
    bx.imageSmoothingQuality = 'high';
    bx.drawImage(a, 0, 0, tw, th);
    return bx.getImageData(0, 0, tw, th);
  }

  function dataToCanvasData(data, sw, sh, w, h) {
    const a = document.createElement('canvas');
    a.width = sw;
    a.height = sh;
    a.getContext('2d').putImageData(new ImageData(data, sw, sh), 0, 0);
    const b = document.createElement('canvas');
    b.width = w;
    b.height = h;
    const bx = b.getContext('2d');
    bx.imageSmoothingEnabled = true;
    bx.imageSmoothingQuality = 'high';
    bx.drawImage(a, 0, 0, w, h);
    return bx.getImageData(0, 0, w, h).data;
  }

  function buildFilterGrid() {
    els.filterGrid.innerHTML = '';
    const tw = 168;
    const th = Math.max(1, Math.round((tw * state.h) / state.w));
    for (const f of FILTERS) {
      const card = document.createElement('button');
      card.className = 'filter-card';
      card.type = 'button';
      card.dataset.id = f.id;
      const small = scaleData(state.data, state.w, state.h, tw, th);
      let styleOut;
      try {
        styleOut = f.apply(small.data, tw, th, defaultParams(f));
      } catch (err) {
        styleOut = small.data;
      }
      const cv = document.createElement('canvas');
      cv.width = tw;
      cv.height = th;
      card._styleOut = styleOut;
      card._cv = cv;
      card._tw = tw;
      card._th = th;
      const label = document.createElement('span');
      label.textContent = f.name;
      card.append(cv, label);
      card.addEventListener('click', () => {
        if (state.pickMode === 'add') {
          state.pickMode = 'swap';
          addStyleLayer(f.id);
          setTab('layers');
        } else {
          selectFilter(f.id);
          updateStylesTarget();
        }
      });
      els.filterGrid.appendChild(card);
    }
    updateThumbs();
  }

  function selectFilter(id) {
    const f = byId(id);
    if (!f) return;
    const st = activeStack();
    let L = activeStyleLayer();
    if (!L) {
      L = { uid: nuid(), kind: 'style', filterId: id, enabled: true, _open: true, opacity: 100, srcColour: 0, blend: 'normal', params: defaultParams(f) };
      st.push(L);
    } else if (L.filterId !== id) {
      L.filterId = id;
      L.params = defaultParams(f);
      if (!L._open) L._open = true;
    }
    state.activeUid = L.uid;
    setCurrentLabel(f.name);
    updateGridHighlight();
    renderLayerList();
    scheduleRender();
  }

  function scheduleThumbs() {
    clearTimeout(scheduleThumbs.t);
    scheduleThumbs.t = setTimeout(updateThumbs, 200);
  }

  function updateThumbs() {
    const cl = state.bothLayers.find((l) => l.kind === 'colormap');
    const bmap = state.colorMaps.both;
    const bint = state.colorMapIntensity.both;
    for (const card of els.filterGrid.children) {
      let out = card._styleOut;
      if (cl && cl.enabled) {
        out = window.applyColorMap(out, card._tw, card._th, bint / 100, bmap);
      }
      card._cv.getContext('2d').putImageData(new ImageData(out, card._tw, card._th), 0, 0);
    }
  }

  // ---------- render pipeline ----------

  function overlayPixel(x, y) {
    return x < 128 ? 2 * x * y / 255 : 255 - 2 * (255 - x) * (255 - y) / 255;
  }

  function softLightPixel(b, t) {
    const bn = b / 255;
    const tn = t / 255;
    const d = bn <= 0.25 ? ((16 * bn - 12) * bn + 4) * bn : Math.sqrt(bn);
    return 255 * (tn <= 0.5 ? bn - (1 - 2 * tn) * bn * (1 - bn) : bn + (2 * tn - 1) * (d - bn));
  }

  // Separable blends: one base channel against one top channel.
  function blendChannel(mode, b, t) {
    switch (mode) {
      case 'darken': return b < t ? b : t;
      case 'lighten': return b > t ? b : t;
      case 'multiply': return (b * t) / 255;
      case 'screen': return 255 - ((255 - b) * (255 - t)) / 255;
      case 'overlay': return overlayPixel(b, t);
      case 'hard-light': return overlayPixel(t, b);
      case 'soft-light': return softLightPixel(b, t);
      case 'difference': return b > t ? b - t : t - b;
      case 'exclusion': return b + t - (2 * b * t) / 255;
      case 'color-dodge': return t >= 255 ? 255 : Math.min(255, (b * 255) / (255 - t));
      case 'color-burn': return t <= 0 ? 0 : 255 - Math.min(255, ((255 - b) * 255) / t);
      case 'linear-burn': return b + t - 255;
      default: return t;
    }
  }

  // Hue/saturation/colour/luminosity act on the colour as a whole, so they use
  // the luminosity and saturation helpers from the PDF blend model.
  const NON_SEPARABLE = { hue: 1, saturation: 1, color: 1, luminosity: 1 };

  function nsLum(c) {
    return 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
  }

  function nsClip(c) {
    const l = nsLum(c);
    const n = Math.min(c[0], c[1], c[2]);
    const x = Math.max(c[0], c[1], c[2]);
    if (n < 0) for (let i = 0; i < 3; i++) c[i] = l + ((c[i] - l) * l) / (l - n);
    if (x > 255) for (let i = 0; i < 3; i++) c[i] = l + ((c[i] - l) * (255 - l)) / (x - l);
    return c;
  }

  function nsSetLum(c, l) {
    const d = l - nsLum(c);
    return nsClip([c[0] + d, c[1] + d, c[2] + d]);
  }

  function nsSat(c) {
    return Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]);
  }

  function nsSetSat(c, s) {
    const idx = [0, 1, 2].sort((i, j) => c[i] - c[j]);
    const out = [0, 0, 0];
    const span = c[idx[2]] - c[idx[0]];
    if (span > 0) {
      out[idx[1]] = ((c[idx[1]] - c[idx[0]]) * s) / span;
      out[idx[2]] = s;
    }
    return out;
  }

  function blendNonSeparable(mode, cb, cs) {
    if (mode === 'hue') return nsSetLum(nsSetSat(cs, nsSat(cb)), nsLum(cb));
    if (mode === 'saturation') return nsSetLum(nsSetSat(cb, nsSat(cs)), nsLum(cb));
    if (mode === 'color') return nsSetLum(cs, nsLum(cb));
    return nsSetLum(cb, nsLum(cs));
  }

  // Put the style's luminance back under the incoming colour, so a style that
  // replaces the palette outright (Blueprint, X-Ray, Bas Relief, Cross Hatch)
  // can contribute only its structure and leave the photo's colours alone.
  // Same gamut clip as the luminosity blend: pull the colour back around its
  // luminance rather than clamping each channel, which would shift the hue.
  function keepSourceColour(base, top, t) {
    const out = new Uint8ClampedArray(top.length);
    for (let i = 0; i < out.length; i += 4) {
      const br = base[i];
      const bg = base[i + 1];
      const bb = base[i + 2];
      const tl = 0.3 * top[i] + 0.59 * top[i + 1] + 0.11 * top[i + 2];
      const d = tl - (0.3 * br + 0.59 * bg + 0.11 * bb);
      let r = br + d;
      let g = bg + d;
      let b = bb + d;
      const lo = r < g ? (r < b ? r : b) : (g < b ? g : b);
      const hi = r > g ? (r > b ? r : b) : (g > b ? g : b);
      if (lo < 0) {
        const k = tl / (tl - lo);
        r = tl + (r - tl) * k;
        g = tl + (g - tl) * k;
        b = tl + (b - tl) * k;
      }
      if (hi > 255) {
        const k = (255 - tl) / (hi - tl);
        r = tl + (r - tl) * k;
        g = tl + (g - tl) * k;
        b = tl + (b - tl) * k;
      }
      out[i] = top[i] + (r - top[i]) * t;
      out[i + 1] = top[i + 1] + (g - top[i + 1]) * t;
      out[i + 2] = top[i + 2] + (b - top[i + 2]) * t;
      out[i + 3] = 255;
    }
    return out;
  }

  // Would Source colour do anything for this style? One that already carries the
  // source chroma (Glitch, Film Grain), whose output is achromatic by
  // construction (Screentone, mono Dither), or which is near-black with no
  // chroma room to fill (Neon Edges), leaves nothing to put back.
  //
  // Judged once per style from its defaults, not per render: a control that
  // appears and disappears while you drag a different slider is worse than one
  // that is simply absent. The bar is tuned by eye - Neon Edges and Glitch both
  // score ~5 and still look unchanged, so it sits well above them. Probed at
  // 400px, where the decision matches full resolution on all 55 styles; at
  // thumbnail size Chromatic Aberration flips, its channel shift being
  // proportionally larger on a small image.
  const RECOLOUR_EPS = 12;
  const PROBE_W = 400;

  function recolourMatters(base, top) {
    const stride = Math.max(4, Math.round(top.length / 4 / 4000)) * 4;
    let sum = 0;
    let n = 0;
    for (let i = 0; i < top.length; i += stride) {
      const tl = 0.3 * top[i] + 0.59 * top[i + 1] + 0.11 * top[i + 2];
      const d = tl - (0.3 * base[i] + 0.59 * base[i + 1] + 0.11 * base[i + 2]);
      let r = base[i] + d;
      let g = base[i + 1] + d;
      let b = base[i + 2] + d;
      const lo = r < g ? (r < b ? r : b) : (g < b ? g : b);
      const hi = r > g ? (r > b ? r : b) : (g > b ? g : b);
      if (lo < 0) {
        const k = tl / (tl - lo);
        r = tl + (r - tl) * k;
        g = tl + (g - tl) * k;
        b = tl + (b - tl) * k;
      }
      if (hi > 255) {
        const k = (255 - tl) / (hi - tl);
        r = tl + (r - tl) * k;
        g = tl + (g - tl) * k;
        b = tl + (b - tl) * k;
      }
      sum += Math.abs(r - top[i]) + Math.abs(g - top[i + 1]) + Math.abs(b - top[i + 2]);
      n += 3;
    }
    return n ? sum / n > RECOLOUR_EPS : false;
  }

  function probeImage() {
    if (state._probeImg && state._probeFor === state.data) return state._probeImg;
    const pw = Math.min(PROBE_W, state.w);
    const ph = Math.max(1, Math.round((pw * state.h) / state.w));
    const small = scaleData(state.data, state.w, state.h, pw, ph);
    state._probeImg = { data: small.data, w: pw, h: ph };
    state._probeFor = state.data;
    return state._probeImg;
  }

  // Memoised per style, and re-taken when a different image is loaded.
  function filterRecolours(f) {
    if (!f || !state.data) return true;
    if (f._recolours !== undefined && f._recoloursFor === state.data) return f._recolours;
    const img = probeImage();
    let out;
    try {
      out = f.apply(new Uint8ClampedArray(img.data), img.w, img.h, defaultParams(f));
    } catch (err) {
      return true;
    }
    f._recolours = recolourMatters(img.data, out);
    f._recoloursFor = state.data;
    return f._recolours;
  }

  function mixOver(base, top, a, mode) {
    const out = new Uint8ClampedArray(base.length);
    const ia = 1 - a;
    const nonSep = NON_SEPARABLE[mode] === 1;
    const cb = [0, 0, 0];
    const cs = [0, 0, 0];
    for (let i = 0; i < out.length; i += 4) {
      let r;
      let g;
      let b;
      if (mode === 'additive') {
        r = base[i] + top[i] * a;
        g = base[i + 1] + top[i + 1] * a;
        b = base[i + 2] + top[i + 2] * a;
      } else if (mode === 'subtractive') {
        r = base[i] - top[i] * a;
        g = base[i + 1] - top[i + 1] * a;
        b = base[i + 2] - top[i + 2] * a;
      } else if (nonSep) {
        cb[0] = base[i];
        cb[1] = base[i + 1];
        cb[2] = base[i + 2];
        cs[0] = top[i];
        cs[1] = top[i + 1];
        cs[2] = top[i + 2];
        const m = blendNonSeparable(mode, cb, cs);
        r = base[i] * ia + m[0] * a;
        g = base[i + 1] * ia + m[1] * a;
        b = base[i + 2] * ia + m[2] * a;
      } else if (mode === 'normal') {
        r = top[i] * a + base[i] * ia;
        g = top[i + 1] * a + base[i + 1] * ia;
        b = top[i + 2] * a + base[i + 2] * ia;
      } else {
        r = base[i] * ia + blendChannel(mode, base[i], top[i]) * a;
        g = base[i + 1] * ia + blendChannel(mode, base[i + 1], top[i + 1]) * a;
        b = base[i + 2] * ia + blendChannel(mode, base[i + 2], top[i + 2]) * a;
      }
      out[i] = r;
      out[i + 1] = g;
      out[i + 2] = b;
      out[i + 3] = 255;
    }
    return out;
  }

  function applyStyle(cur, f, L, w, h) {
    w = w || state.w;
    h = h || state.h;
    let next;
    if (f.maxPixels && w * h > f.maxPixels) {
      const k = Math.sqrt(f.maxPixels / (w * h));
      const sw = Math.max(1, Math.round(w * k));
      const sh = Math.max(1, Math.round(h * k));
      const small = scaleData(cur, w, h, sw, sh);
      next = dataToCanvasData(f.apply(small.data, sw, sh, L.params), sw, sh, w, h);
    } else {
      next = f.apply(cur, w, h, L.params);
    }
    const keep = (L.srcColour || 0) / 100;
    if (keep > 0) next = keepSourceColour(cur, next, keep);
    const a = (L.opacity == null ? 100 : L.opacity) / 100;
    const mode = L.blend || 'normal';
    return a < 1 || mode !== 'normal' ? mixOver(cur, next, a, mode) : next;
  }

  // ctx carries the size and colour maps; the live state by default, or a
  // small stand-in when a preset is previewed on a thumbnail.
  function renderStackFrom(base, stack, region, ctx) {
    ctx = ctx || state;
    let cur = new Uint8ClampedArray(base);
    for (const L of stack) {
      if (!L.enabled) continue;
      if (L.kind === 'colormap') {
        cur = window.applyColorMap(cur, ctx.w, ctx.h, ctx.colorMapIntensity[region] / 100, ctx.colorMaps[region]);
      } else {
        const f = byId(L.filterId);
        if (!f) continue;
        cur = applyStyle(cur, f, L, ctx.w, ctx.h);
      }
    }
    return cur;
  }

  function renderStack(stack, region) {
    return renderStackFrom(state.data, stack, region);
  }

  // One layer's result where it is the strongest layer, neutral elsewhere.
  function regionPreview(res, idx) {
    const labels = state.labels;
    const n = state.w * state.h;
    const out = new Uint8ClampedArray(res.length);
    for (let p = 0, i = 0; p < n; p++, i += 4) {
      const keep = labels ? labels[p] === idx : idx === 0;
      if (keep) {
        out[i] = res[i];
        out[i + 1] = res[i + 1];
        out[i + 2] = res[i + 2];
      } else {
        out[i] = NEUTRAL.r;
        out[i + 1] = NEUTRAL.g;
        out[i + 2] = NEUTRAL.b;
      }
      out[i + 3] = 255;
    }
    return out;
  }

  // Both, then each layer's own stack on top of it, blended through the
  // softened layer weights. A layer with nothing on it is just Both's result,
  // so it costs nothing to render. No covers: everything is the subject.
  function compose(ctx, base, stacks, covers) {
    const masterRes = renderStackFrom(base, stacks.bothLayers, 'both', ctx);
    const res = {};
    for (const r of LAYER_REGIONS) {
      const st = stacks[REGION_KEY[r]] || [];
      res[r] = st.some((L) => L.enabled) ? renderStackFrom(masterRes, st, r, ctx) : masterRes;
    }
    const n = ctx.w * ctx.h;
    const out = new Uint8ClampedArray(masterRes.length);
    if (!covers) {
      out.set(res.fg);
    } else {
      const cv = LAYER_REGIONS.map((r) => covers[r]);
      const rs = LAYER_REGIONS.map((r) => res[r]);
      for (let p = 0, i = 0; p < n; p++, i += 4) {
        let r = 0;
        let g = 0;
        let b = 0;
        let t = 0;
        for (let k = 0; k < cv.length; k++) {
          const wgt = cv[k][p];
          if (!wgt) continue;
          const src = rs[k];
          r += src[i] * wgt;
          g += src[i + 1] * wgt;
          b += src[i + 2] * wgt;
          t += wgt;
        }
        if (t) {
          out[i] = Math.round(r / t);
          out[i + 1] = Math.round(g / t);
          out[i + 2] = Math.round(b / t);
        } else {
          out[i] = masterRes[i];
          out[i + 1] = masterRes[i + 1];
          out[i + 2] = masterRes[i + 2];
        }
      }
    }
    for (let i = 3; i < out.length; i += 4) out[i] = 255;
    return { out: out, parts: res, fg: res.fg, bg: res.bg };
  }

  function scheduleRender() {
    updateLayerCounts();
    clearTimeout(scheduleRender.t);
    scheduleRender.t = setTimeout(render, 120);
  }

  let lastRenderMs = 0;

  function render() {
    if (!state.data) return;
    const token = ++state.token;
    if (lastRenderMs > 150) els.resultBusy.hidden = false;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (token !== state.token) return;
        const t0 = performance.now();
        try {
          const res = compose(state, state.data, state, state.cover);
          els.resultCanvas.getContext('2d').putImageData(new ImageData(res.out, state.w, state.h), 0, 0);
          LAYER_REGIONS.forEach((r, k) => {
            els[VIEW_CANVAS[r]].getContext('2d').putImageData(new ImageData(regionPreview(res.parts[r], k), state.w, state.h), 0, 0);
          });
          drawStage();
        } catch (err) {
          console.error(err);
        }
        lastRenderMs = performance.now() - t0;
        els.resultBusy.hidden = true;
      })
    );
  }

  // ---------- download / reset ----------

  els.downloadBtn.addEventListener('click', () => {
    if (!state.data) return;
    els.resultCanvas.toBlob((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'image-studio.png';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }, 'image/png');
  });

  els.resetBtn.addEventListener('click', () => {
    els.fileInput.value = '';
    els.fileInput.click();
  });

  // OpenCV.js finishes loading async; refresh style thumbnails when it lands.
  // The Subject cut needs it too: until now the mask was the score alone.
  window.addEventListener('filters:ready', () => {
    if (state.data) {
      computeMask();
      scheduleRender();
      buildFilterGrid();
      buildPresetList();
    }
  });

  state.userPresets = loadUserPresets();
  (function restoreTab() {
    let tab = 'presets';
    try {
      const ui = JSON.parse(localStorage.getItem(UI_KEY) || '{}');
      if (ui && ['presets', 'layers', 'styles'].indexOf(ui.tab) >= 0) tab = ui.tab;
    } catch (err) {
      // nothing remembered
    }
    setTab(tab);
    updatePaneHighlight();
  })();

  // Load the demo image by default on first visit.
  if (window.DEMO_IMAGE_DATAURI && !state.data) {
    const img = new Image();
    img.onload = () => loadFromImage(img);
    img.src = window.DEMO_IMAGE_DATAURI;
  }
  // Debug handle, per the repo convention: the live state and the verbs a test
  // driver needs, so a headless run can call the real pipeline instead of
  // firing synthetic clicks at a canvas.
  window.__studio = {
    state: state,
    filters: FILTERS,
    byId: byId,
    activeStack: activeStack,
    activeStyleLayer: activeStyleLayer,
    applyStyle: applyStyle,
    keepSourceColour: keepSourceColour,
    recolourMatters: recolourMatters,
    filterRecolours: filterRecolours,
    mixOver: mixOver,
    renderStack: renderStack,
    selectFilter: selectFilter,
    addStyleLayer: addStyleLayer,
    setRegion: setRegion,
    render: scheduleRender,
    compose: compose,
    loadImage: loadFromImage,
    presets: allPresets,
    snapshotPreset: snapshotPreset,
    applyPreset: applyPreset,
    presetByName: presetByName,
    saveCurrentAsPreset: saveCurrentAsPreset,
    setTab: setTab,
    setView: setView,
    copyLayers: copyLayers,
    regions: ALL_REGIONS
  };

})();
