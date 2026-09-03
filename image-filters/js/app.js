(function () {
  'use strict';

  const FILTERS = window.Filters;
  const MAX_DIM = 1200;
  const NEUTRAL = { r: 32, g: 36, b: 51 };

  const BLEND_MODES = [
    { id: 'normal', name: 'Normal' },
    { id: 'additive', name: 'Additive' },
    { id: 'subtractive', name: 'Subtractive' },
    { id: 'multiply', name: 'Multiply' },
    { id: 'screen', name: 'Screen' },
    { id: 'overlay', name: 'Overlay' }
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
    panes: Array.prototype.slice.call(document.querySelectorAll('.pane[data-region]')),
    bgSoften: document.getElementById('bgSoften'),
    bgSoftenVal: document.getElementById('bgSoftenVal'),
    bgSliderGroup: document.getElementById('bgSliderGroup'),
    filterGrid: document.getElementById('filterGrid'),
    resultBusy: document.getElementById('resultBusy')
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
    bgMask: null,
    bgCover: null,
    soften: 0,
    colorMaps: {
      both: { shadow: '#000000', mid: '#808080', high: '#ffffff' },
      fg: { shadow: '#000000', mid: '#808080', high: '#ffffff' },
      bg: { shadow: '#000000', mid: '#808080', high: '#ffffff' }
    },
    colorMapIntensity: { both: 100, fg: 100, bg: 100 },
    imagePalette: null
  };

  const cmBindings = [];
  const presetContainers = [];

  function regionName(r) {
    if (r === 'fg') return 'Foreground';
    if (r === 'bg') return 'Background';
    return 'Both';
  }

  function activeStack() {
    if (state.activeRegion === 'fg') return state.fgLayers;
    if (state.activeRegion === 'bg') return state.bgLayers;
    return state.bothLayers;
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

  function computeMask() {
    if (!state.data) return;
    const mode = window.BackgroundSep && window.BackgroundSep.modes.dominant;
    if (!mode) return;
    try {
      const binary = mode.compute(state.data, state.w, state.h, { tolerance: +els.bgTol.value });
      state.bgMask = binary;
      state.soften = +els.bgSoften.value;
      state.bgCover = softenMask(binary, state.w, state.h, state.soften, 2);
    } catch (err) {
      console.error(err);
      state.bgMask = null;
      state.bgCover = null;
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

  function samplePalette(data, w, h, mask, keepBg) {
    const cnt = [0, 0, 0];
    const sum = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let p = 0, i = 0; p < w * h; p++, i += 4) {
      if (mask) {
        const isBg = mask[p] >= 128;
        if (keepBg !== isBg) continue;
      }
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
    return { uid: nuid(), kind: 'colormap', region: region, enabled: false, _open: true, blend: 'normal', params: { intensity: 100 } };
  }

  function resetLayers() {
    computeMask();
    state.imagePalette = {
      both: samplePalette(state.data, state.w, state.h, null, false),
      fg: samplePalette(state.data, state.w, state.h, state.bgMask, false),
      bg: samplePalette(state.data, state.w, state.h, state.bgMask, true)
    };
    state.bothLayers = [makeColorMapLayer('both')];
    state.fgLayers = [makeColorMapLayer('fg')];
    state.bgLayers = [makeColorMapLayer('bg')];
    state.colorMaps = {
      both: regionPalette('both'),
      fg: regionPalette('fg'),
      bg: regionPalette('bg')
    };
    state.colorMapIntensity = { both: 100, fg: 100, bg: 100 };
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

    resetLayers();
    buildFilterGrid();
    renderLayerList();
    scheduleRender();
  }

  // ---------- region switching ----------

  function updatePaneHighlight() {
    for (const pane of els.panes) {
      pane.classList.toggle('selected', pane.dataset.region === state.activeRegion);
    }
  }

  function updateBgSliderVisibility() {
    if (!els.bgSliderGroup) return;
    const show = state.activeRegion !== 'both';
    els.bgSliderGroup.classList.toggle('hidden', !show);
  }

  function setRegion(region) {
    if (region === state.activeRegion) return;
    state.activeRegion = region;
    state.activeUid = null;
    updatePaneHighlight();
    updateBgSliderVisibility();
    setCurrentLabel(null);
    updateGridHighlight();
    renderLayerList();
    scheduleThumbs();
  }

  for (const pane of els.panes) {
    pane.addEventListener('click', () => setRegion(pane.dataset.region));
  }

  els.bgTol.addEventListener('input', () => {
    els.bgTolVal.textContent = els.bgTol.value;
    els.bgTol.style.setProperty('--fill', ((+els.bgTol.value / 95) * 100) + '%');
    computeMask();
    scheduleRender();
    scheduleThumbs();
  });
  els.bgSoften.addEventListener('input', () => {
    els.bgSoftenVal.textContent = els.bgSoften.value;
    els.bgSoften.style.setProperty('--fill', ((+els.bgSoften.value / 30) * 100) + '%');
    computeMask();
    scheduleRender();
    scheduleThumbs();
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
    if (!cl) setColorMapEnabled(true);
    else if (!cl.enabled) cl.enabled = true;
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
    const used = new Set(activeStack().filter((l) => l.kind === 'style').map((l) => l.filterId));
    const f = FILTERS.find((x) => !used.has(x.id)) || FILTERS[used.size % FILTERS.length];
    addStyleLayer(f.id);
  });

  function addStyleLayer(filterId) {
    const f = byId(filterId);
    if (!f) return;
    const L = { uid: nuid(), kind: 'style', filterId: filterId, enabled: true, _open: true, opacity: 100, blend: 'normal', params: defaultParams(f) };
    const st = activeStack();
    const cmIdx = st.findIndex((l) => l.kind === 'colormap');
    if (cmIdx === -1) st.push(L);
    else st.splice(cmIdx, 0, L);
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
      card.addEventListener('click', () => selectFilter(f.id));
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
      L = { uid: nuid(), kind: 'style', filterId: id, enabled: true, _open: true, opacity: 100, blend: 'normal', params: defaultParams(f) };
      st.unshift(L);
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

  function mixOver(base, top, a, mode) {
    const out = new Uint8ClampedArray(base.length);
    const ia = 1 - a;
    for (let i = 0; i < out.length; i += 4) {
      let r = top[i];
      let g = top[i + 1];
      let b = top[i + 2];
      if (mode === 'additive') {
        r = base[i] + top[i] * a;
        g = base[i + 1] + top[i + 1] * a;
        b = base[i + 2] + top[i + 2] * a;
      } else if (mode === 'subtractive') {
        r = base[i] - top[i] * a;
        g = base[i + 1] - top[i + 1] * a;
        b = base[i + 2] - top[i + 2] * a;
      } else if (mode === 'multiply') {
        r = base[i] * r / 255;
        g = base[i + 1] * g / 255;
        b = base[i + 2] * b / 255;
        r = base[i] * ia + r * a;
        g = base[i + 1] * ia + g * a;
        b = base[i + 2] * ia + b * a;
      } else if (mode === 'screen') {
        r = 255 - (255 - base[i]) * (255 - r) / 255;
        g = 255 - (255 - base[i + 1]) * (255 - g) / 255;
        b = 255 - (255 - base[i + 2]) * (255 - b) / 255;
        r = base[i] * ia + r * a;
        g = base[i + 1] * ia + g * a;
        b = base[i + 2] * ia + b * a;
      } else if (mode === 'overlay') {
        r = overlayPixel(base[i], r);
        g = overlayPixel(base[i + 1], g);
        b = overlayPixel(base[i + 2], b);
        r = base[i] * ia + r * a;
        g = base[i + 1] * ia + g * a;
        b = base[i + 2] * ia + b * a;
      } else {
        r = top[i] * a + base[i] * ia;
        g = top[i + 1] * a + base[i + 1] * ia;
        b = top[i + 2] * a + base[i + 2] * ia;
      }
      out[i] = r;
      out[i + 1] = g;
      out[i + 2] = b;
      out[i + 3] = 255;
    }
    return out;
  }

  function applyStyle(cur, f, L) {
    const w = state.w;
    const h = state.h;
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
    const a = (L.opacity == null ? 100 : L.opacity) / 100;
    const mode = L.blend || 'normal';
    return a < 1 || mode !== 'normal' ? mixOver(cur, next, a, mode) : next;
  }

  function renderStackFrom(base, stack, region) {
    let cur = new Uint8ClampedArray(base);
    for (const L of stack) {
      if (!L.enabled) continue;
      if (L.kind === 'colormap') {
        cur = window.applyColorMap(cur, state.w, state.h, state.colorMapIntensity[region] / 100, state.colorMaps[region]);
      } else {
        const f = byId(L.filterId);
        if (!f) continue;
        cur = applyStyle(cur, f, L);
      }
    }
    return cur;
  }

  function renderStack(stack, region) {
    return renderStackFrom(state.data, stack, region);
  }

  function regionPreview(res, keepBg) {
    const mask = state.bgMask;
    const n = state.w * state.h;
    const out = new Uint8ClampedArray(res.length);
    for (let p = 0, i = 0; p < n; p++, i += 4) {
      const isBg = mask && mask[p] >= 128;
      const keep = keepBg ? isBg : !isBg;
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

  function scheduleRender() {
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
          const masterRes = renderStack(state.bothLayers, 'both');
          const fgRes = renderStackFrom(masterRes, state.fgLayers, 'fg');
          const bgRes = renderStackFrom(masterRes, state.bgLayers, 'bg');
          const cover = state.bgCover;
          const n = state.w * state.h;

          const out = new Uint8ClampedArray(fgRes.length);
          for (let p = 0, i = 0; p < n; p++, i += 4) {
            let c = 0;
            if (cover) c = (cover[p] / 255);
            out[i] = Math.round(fgRes[i] * (1 - c) + bgRes[i] * c);
            out[i + 1] = Math.round(fgRes[i + 1] * (1 - c) + bgRes[i + 1] * c);
            out[i + 2] = Math.round(fgRes[i + 2] * (1 - c) + bgRes[i + 2] * c);
            out[i + 3] = 255;
          }
          els.resultCanvas.getContext('2d').putImageData(new ImageData(out, state.w, state.h), 0, 0);
          els.fgCanvas.getContext('2d').putImageData(new ImageData(regionPreview(fgRes, false), state.w, state.h), 0, 0);
          els.bgCanvas.getContext('2d').putImageData(new ImageData(regionPreview(bgRes, true), state.w, state.h), 0, 0);
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
      a.download = 'pixelforge-foreground-background.png';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }, 'image/png');
  });

  els.resetBtn.addEventListener('click', () => {
    els.fileInput.value = '';
    els.fileInput.click();
  });

  // OpenCV.js finishes loading async; refresh style thumbnails when it lands.
  window.addEventListener('filters:ready', () => {
    if (state.data) buildFilterGrid();
  });

  // Load the demo image by default on first visit.
  if (window.DEMO_IMAGE_DATAURI && !state.data) {
    const img = new Image();
    img.onload = () => loadFromImage(img);
    img.src = window.DEMO_IMAGE_DATAURI;
  }
})();
