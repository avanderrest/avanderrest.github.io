(function () {
  'use strict';

  const FILTERS = window.Filters;
  const MAX_DIM = 1200;

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
    dropzone: document.getElementById('dropzone'),
    fileInput: document.getElementById('fileInput'),
    browseBtn: document.getElementById('browseBtn'),
    demoBtn: document.getElementById('demoBtn'),
    studio: document.getElementById('studio'),
    strength: document.getElementById('strength'),
    strengthLabel: document.getElementById('strengthLabel'),
    strengthVal: document.getElementById('strengthVal'),
    downloadBtn: document.getElementById('downloadBtn'),
    resetBtn: document.getElementById('resetBtn'),
    layersPanel: document.getElementById('layersPanel'),
    addLayerBtn: document.getElementById('addLayerBtn'),
    layersTitle: document.getElementById('layersTitle'),
    layerList: document.getElementById('layerList'),
    originalCanvas: document.getElementById('originalCanvas'),
    resultCanvas: document.getElementById('resultCanvas'),
    filterGrid: document.getElementById('filterGrid'),
    resultBusy: document.getElementById('resultBusy'),
    footer: document.querySelector('footer')
  };

  const state = {
    data: null,
    w: 0,
    h: 0,
    token: 0,
    advanced: true,
    layers: [],
    activeUid: null,
    colorMap: { shadow: '#0f0632', mid: '#e13caf', high: '#6eeaff' }
  };

  const cmBindings = [];
  const presetContainers = [];

  function firstStyleLayer() {
    return state.layers.find((l) => l.kind === 'style');
  }
  function activeStyleLayer() {
    return state.layers.find((l) => l.kind === 'style' && l.uid === state.activeUid) || firstStyleLayer();
  }
  function cmapLayer() {
    return state.layers.find((l) => l.kind === 'colormap');
  }
  function normalizeHex(value) {
    let v = String(value).trim().replace('#', '');
    if (v.length === 3) v = v[0] + v[0] + v[1] + v[1] + v[2] + v[2];
    return /^[0-9a-fA-F]{6}$/.test(v) ? '#' + v.toLowerCase() : null;
  }

  // ---------- loading ----------

  els.browseBtn.addEventListener('click', () => els.fileInput.click());
  els.fileInput.addEventListener('change', (e) => loadFile(e.target.files[0]));
  els.demoBtn.addEventListener('click', () => {
    const img = new Image();
    img.onload = () => loadFromImage(img);
    img.src = window.DEMO_IMAGE_DATAURI;
  });

  ['dragenter', 'dragover'].forEach((ev) =>
    els.dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      els.dropzone.classList.add('drag');
    })
  );
  ['dragleave', 'drop'].forEach((ev) =>
    els.dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      els.dropzone.classList.remove('drag');
    })
  );
  els.dropzone.addEventListener('drop', (e) => loadFile(e.dataTransfer.files[0]));

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

  function resetLayers() {
    state.layers = [
      { uid: nuid(), kind: 'colormap', enabled: true, _open: true, blend: 'normal', params: { intensity: 100 } }
    ];
    state.activeUid = null;
    setCurrentLabel(null);
    syncStrength();
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

    els.originalCanvas.width = w;
    els.originalCanvas.height = h;
    els.originalCanvas.getContext('2d').putImageData(cx.getImageData(0, 0, w, h), 0, 0);
    els.resultCanvas.width = w;
    els.resultCanvas.height = h;

    resetLayers();
    buildFilterGrid();
    els.dropzone.hidden = true;
    els.studio.hidden = false;
    els.footer.hidden = true;
    renderLayerList();
  }

  // ---------- global blend slider (original vs edited) ----------

  function syncStrength() {
    els.strength.disabled = !state.data;
    paintStrength();
  }

  function paintStrength() {
    const v = +els.strength.value;
    els.strengthVal.textContent = v + '%';
    els.strength.style.setProperty('--fill', v + '%');
  }

  els.strength.addEventListener('input', () => {
    paintStrength();
    scheduleRender();
  });

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
        if (v && v !== state.colorMap[key]) setCmColor(key, v);
        else hex.value = state.colorMap[key];
      });
    });
  }

  function setCmColor(key, value) {
    state.colorMap[key] = value;
    if (!cmapLayer()) setColorMapEnabled(true);
    clearPresetActive();
    syncCmUI();
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
    for (const b of cmBindings) {
      b.swatch.value = state.colorMap[b.key];
      b.hex.value = state.colorMap[b.key];
    }
  }

  function setColorMapEnabled(on) {
    let L = cmapLayer();
    if (on) {
      if (!L) {
        L = { uid: nuid(), kind: 'colormap', enabled: true, _open: true, blend: 'normal', params: { intensity: 100 } };
        state.layers.push(L);
      } else {
        L.enabled = true;
      }
      setCurrentLabel('Colour map');
    } else if (L) {
      state.layers.splice(state.layers.indexOf(L), 1);
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
      swatch.style.background =
        'linear-gradient(135deg, ' + cols.shadow + ', ' + cols.mid + ' 55%, ' + cols.high + ')';
      const label = document.createElement('span');
      label.className = 'name';
      label.textContent = name;
      b.append(swatch, label);
      b.addEventListener('click', () => {
        state.colorMap = { shadow: cols.shadow, mid: cols.mid, high: cols.high };
        if (!cmapLayer()) setColorMapEnabled(true);
        setActivePreset(name);
        syncCmUI();
        scheduleRender();
        scheduleThumbs();
      });
      container.appendChild(b);
    }
  }

  // ---------- layer stack ----------

  function setCurrentLabel(name) {
    els.layersTitle.textContent = name ? 'Layer stack \u00B7 ' + name : 'Layer stack';
  }

  function setActive(L) {
    if (!L || L.kind !== 'style') return;
    state.activeUid = L.uid;
    setCurrentLabel(byId(L.filterId).name);
    syncStrength();
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
    const used = new Set(state.layers.filter((l) => l.kind === 'style').map((l) => l.filterId));
    const f = FILTERS.find((x) => !used.has(x.id)) || FILTERS[used.size % FILTERS.length];
    addStyleLayer(f.id);
  });

  function addStyleLayer(filterId) {
    const f = byId(filterId);
    if (!f) return;
    const L = { uid: nuid(), kind: 'style', filterId: filterId, enabled: true, _open: true, opacity: 100, blend: 'normal', params: defaultParams(f) };
    const cmIdx = state.layers.findIndex((l) => l.kind === 'colormap');
    if (cmIdx === -1) state.layers.push(L);
    else state.layers.splice(cmIdx, 0, L);
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
      if (L === activeStyleLayer()) syncStrength();
      scheduleRender();
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
    down.disabled = idx === state.layers.length - 1;

    head.append(chev, lab, nm, up, down);

    if (L.kind === 'style') {
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'icon-btn danger';
      del.title = 'Remove layer';
      del.textContent = '\u2715';
      del.addEventListener('click', () => {
        state.layers.splice(state.layers.indexOf(L), 1);
        if (state.activeUid === L.uid) {
          state.activeUid = null;
          syncStrength();
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
      const tmp = state.layers[idx - 1];
      state.layers[idx - 1] = state.layers[idx];
      state.layers[idx] = tmp;
      renderLayerList();
      scheduleRender();
    });
    down.addEventListener('click', () => {
      if (idx >= state.layers.length - 1) return;
      const tmp = state.layers[idx + 1];
      state.layers[idx + 1] = state.layers[idx];
      state.layers[idx] = tmp;
      renderLayerList();
      scheduleRender();
    });

    if (L.kind === 'style') {
      body.appendChild(makeBlendRow(L));
      body.appendChild(makeOpacityRow(L));
      const f = byId(L.filterId);
      for (const d of f.params || []) body.appendChild(makeParamRow(L, d));
    } else {
      body.appendChild(makeBlendRow(L));
      body.appendChild(makeParamRow(L, { key: 'intensity', label: 'Intensity', min: 0, max: 100, value: L.params.intensity }));
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
      for (const el of prow.children) {
        if (el.dataset.name && state.colorMap.shadow === window.ColorMapPresets[el.dataset.name].shadow &&
            state.colorMap.mid === window.ColorMapPresets[el.dataset.name].mid &&
            state.colorMap.high === window.ColorMapPresets[el.dataset.name].high) {
          el.classList.add('active');
        }
      }
    }
    return card;
  }

  function renderLayerList() {
    cmBindings.length = 0;
    presetContainers.length = 0;
    els.layerList.innerHTML = '';
    if (!state.layers.length) {
      const p = document.createElement('p');
      p.className = 'empty-layers';
      p.textContent = 'No layers yet — add a style or colour map.';
      els.layerList.appendChild(p);
      return;
    }
    state.layers.forEach((L, idx) => els.layerList.appendChild(makeLayerCard(L, idx)));
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
    let L = activeStyleLayer();
    if (!L) {
      L = { uid: nuid(), kind: 'style', filterId: id, enabled: true, _open: true, opacity: 100, blend: 'normal', params: defaultParams(f) };
      state.layers.unshift(L);
    } else if (L.filterId !== id) {
      L.filterId = id;
      L.params = defaultParams(f);
      if (!L._open) L._open = true;
    }
    state.activeUid = L.uid;
    setCurrentLabel(f.name);
    syncStrength();
    updateGridHighlight();
    renderLayerList();
    scheduleRender();
  }

  function scheduleThumbs() {
    clearTimeout(scheduleThumbs.t);
    scheduleThumbs.t = setTimeout(updateThumbs, 200);
  }

  function updateThumbs() {
    const cl = cmapLayer();
    for (const card of els.filterGrid.children) {
      let out = card._styleOut;
      if (cl && cl.enabled) {
        out = window.applyColorMap(out, card._tw, card._th, cl.params.intensity / 100, state.colorMap);
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

  function composite() {
    let cur = state.data;
    const w = state.w;
    const h = state.h;
    for (const L of state.layers) {
      if (!L.enabled) continue;
      let next;
      if (L.kind === 'colormap') {
        next = window.applyColorMap(cur, w, h, L.params.intensity / 100, state.colorMap);
      } else {
        const f = byId(L.filterId);
        if (!f) continue;
        if (f.maxPixels && w * h > f.maxPixels) {
          const k = Math.sqrt(f.maxPixels / (w * h));
          const sw = Math.max(1, Math.round(w * k));
          const sh = Math.max(1, Math.round(h * k));
          const small = scaleData(cur, w, h, sw, sh);
          next = dataToCanvasData(f.apply(small.data, sw, sh, L.params), sw, sh, w, h);
        } else {
          next = f.apply(cur, w, h, L.params);
        }
      }
      const a = (L.opacity == null ? 100 : L.opacity) / 100;
      const mode = L.blend || 'normal';
      cur = a < 1 || mode !== 'normal' ? mixOver(cur, next, a, mode) : next;
    }
    return cur;
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
        let out = null;
        try {
          out = composite();
          const mix = +els.strength.value / 100;
          if (out && mix < 1) out = mixOver(state.data, out, mix);
        } catch (err) {
          console.error(err);
        }
        if (out) {
          els.resultCanvas.getContext('2d').putImageData(new ImageData(out, state.w, state.h), 0, 0);
        }
        lastRenderMs = performance.now() - t0;
        els.resultBusy.hidden = true;
      })
    );
  }

  // ---------- download / reset ----------

  els.downloadBtn.addEventListener('click', () => {
    if (!state.data || !state.layers.length) return;
    const base = firstStyleLayer();
    const name = base ? base.filterId : 'stack';
    els.resultCanvas.toBlob((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'pixelforge-' + name + '.png';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }, 'image/png');
  });

  els.resetBtn.addEventListener('click', () => {
    state.data = null;
    state.layers = [];
    state.activeUid = null;
    setCurrentLabel(null);
    syncStrength();
    els.studio.hidden = true;
    els.dropzone.hidden = false;
    els.footer.hidden = false;
    els.fileInput.value = '';
  });
})();
