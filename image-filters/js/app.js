(function () {
  'use strict';

  const FILTERS = window.Filters;
  const MAX_DIM = 1200;

  const els = {
    dropzone: document.getElementById('dropzone'),
    fileInput: document.getElementById('fileInput'),
    browseBtn: document.getElementById('browseBtn'),
    demoBtn: document.getElementById('demoBtn'),
    studio: document.getElementById('studio'),
    strength: document.getElementById('strength'),
    strengthVal: document.getElementById('strengthVal'),
    downloadBtn: document.getElementById('downloadBtn'),
    resetBtn: document.getElementById('resetBtn'),
    originalCanvas: document.getElementById('originalCanvas'),
    resultCanvas: document.getElementById('resultCanvas'),
    filterGrid: document.getElementById('filterGrid'),
    resultBusy: document.getElementById('resultBusy'),
    filterOptions: document.getElementById('filterOptions'),
    colorMapBody: document.getElementById('colorMapBody'),
    cmToggle: document.getElementById('cmToggle'),
    cmStrength: document.getElementById('cmStrength'),
    cmStrengthVal: document.getElementById('cmStrengthVal'),
    cmShadow: document.getElementById('cmShadow'),
    cmMid: document.getElementById('cmMid'),
    cmHigh: document.getElementById('cmHigh'),
    cmShadowHex: document.getElementById('cmShadowHex'),
    cmMidHex: document.getElementById('cmMidHex'),
    cmHighHex: document.getElementById('cmHighHex'),
    cmPreview: document.getElementById('cmPreview'),
    cmPresets: document.getElementById('cmPresets')
  };

  const state = {
    data: null,
    w: 0,
    h: 0,
    filterId: null,
    strength: 0.8,
    token: 0,
    colorMapOn: false,
    colorMapStrength: 1,
    colorMap: { shadow: '#0f0632', mid: '#e13caf', high: '#6eeaff' }
  };

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

  els.strength.addEventListener('input', () => {
    state.strength = els.strength.value / 100;
    els.strengthVal.textContent = els.strength.value + '%';
    els.strength.style.setProperty('--fill', els.strength.value + '%');
    scheduleRender();
  });
  els.strength.style.setProperty('--fill', els.strength.value + '%');

  const colorKeys = [
    ['shadow', els.cmShadow, els.cmShadowHex],
    ['mid', els.cmMid, els.cmMidHex],
    ['high', els.cmHigh, els.cmHighHex]
  ];

  function normalizeHex(value) {
    let v = String(value).trim().replace('#', '');
    if (v.length === 3) v = v[0] + v[0] + v[1] + v[1] + v[2] + v[2];
    return /^[0-9a-fA-F]{6}$/.test(v) ? '#' + v.toLowerCase() : null;
  }

  function clearPresetActive() {
    for (const el of els.cmPresets.children) el.classList.remove('active');
  }

  function setColorMapEnabled(on) {
    state.colorMapOn = on;
    els.cmToggle.checked = on;
    els.colorMapBody.classList.toggle('disabled', !on);
    scheduleRender();
    scheduleThumbs();
  }

  function syncColorUI() {
    for (const [key, swatch, hex] of colorKeys) {
      swatch.value = state.colorMap[key];
      hex.value = state.colorMap[key];
    }
    els.cmPreview.style.background =
      'linear-gradient(90deg, ' +
      state.colorMap.shadow + ', ' +
      state.colorMap.mid + ' 50%, ' +
      state.colorMap.high + ')';
  }

  for (const [key, swatch, hex] of colorKeys) {
    swatch.addEventListener('input', () => {
      state.colorMap[key] = swatch.value;
      if (!state.colorMapOn) setColorMapEnabled(true);
      clearPresetActive();
      syncColorUI();
      scheduleRender();
      scheduleThumbs();
    });
    hex.addEventListener('input', () => {
      const v = normalizeHex(hex.value);
      if (v) {
        state.colorMap[key] = v;
        if (!state.colorMapOn) setColorMapEnabled(true);
        clearPresetActive();
        syncColorUI();
        scheduleRender();
        scheduleThumbs();
      }
    });
    hex.addEventListener('change', () => {
      const v = normalizeHex(hex.value);
      if (v && v !== state.colorMap[key]) {
        state.colorMap[key] = v;
        if (!state.colorMapOn) setColorMapEnabled(true);
        clearPresetActive();
        scheduleRender();
        scheduleThumbs();
      }
      syncColorUI();
    });
  }

  for (const [name, cols] of Object.entries(window.ColorMapPresets || {})) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'preset-pill';
    b.title = name;
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
      if (!state.colorMapOn) setColorMapEnabled(true);
      clearPresetActive();
      b.classList.add('active');
      syncColorUI();
      scheduleRender();
      scheduleThumbs();
    });
    if (name === 'Vaporwave') b.classList.add('active');
    els.cmPresets.appendChild(b);
  }
  syncColorUI();

  els.cmToggle.addEventListener('change', () => {
    setColorMapEnabled(els.cmToggle.checked);
    if (!state.colorMapOn) clearPresetActive();
  });

  els.cmStrength.addEventListener('input', () => {
    state.colorMapStrength = els.cmStrength.value / 100;
    els.cmStrengthVal.textContent = els.cmStrength.value + '%';
    els.cmStrength.style.setProperty('--fill', els.cmStrength.value + '%');
    scheduleRender();
    scheduleThumbs();
  });
  els.cmStrength.style.setProperty('--fill', els.cmStrength.value + '%');
  setColorMapEnabled(false);

  els.resetBtn.addEventListener('click', () => {
    state.data = null;
    state.filterId = null;
    els.studio.hidden = true;
    els.dropzone.hidden = false;
    els.fileInput.value = '';
  });

  els.downloadBtn.addEventListener('click', () => {
    if (!state.filterId || !state.data) return;
    els.resultCanvas.toBlob((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'pixelforge-' + state.filterId + '.png';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }, 'image/png');
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

    buildFilterGrid();
    els.dropzone.hidden = true;
    els.studio.hidden = false;
    selectFilter(FILTERS[0].id);
  }

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
        styleOut = f.apply(small.data, tw, th, 0.85);
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
    state.filterId = id;
    for (const el of els.filterGrid.children) {
      el.classList.toggle('active', el.dataset.id === id);
    }
    render();
  }

  function scheduleThumbs() {
    clearTimeout(scheduleThumbs.t);
    scheduleThumbs.t = setTimeout(updateThumbs, 200);
  }

  function updateThumbs() {
    for (const card of els.filterGrid.children) {
      let out = card._styleOut;
      if (state.colorMapOn) {
        out = window.applyColorMap(out, card._tw, card._th, state.colorMapStrength, state.colorMap);
      }
      card._cv.getContext('2d').putImageData(new ImageData(out, card._tw, card._th), 0, 0);
    }
  }

  function scheduleRender() {
    clearTimeout(scheduleRender.t);
    scheduleRender.t = setTimeout(render, 120);
  }

  let lastRenderMs = 0;

  function render() {
    const f = FILTERS.find((x) => x.id === state.filterId);
    if (!f || !state.data) return;
    const token = ++state.token;
    if (lastRenderMs > 150) els.resultBusy.hidden = false;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (token !== state.token) return;
        const t0 = performance.now();
        let out = null;
        try {
          if (f.maxPixels && state.w * state.h > f.maxPixels) {
            const k = Math.sqrt(f.maxPixels / (state.w * state.h));
            const sw = Math.max(1, Math.round(state.w * k));
            const sh = Math.max(1, Math.round(state.h * k));
            const small = scaleData(state.data, state.w, state.h, sw, sh);
            out = dataToCanvasData(f.apply(small.data, sw, sh, state.strength), sw, sh, state.w, state.h);
          } else {
            out = f.apply(state.data, state.w, state.h, state.strength);
          }
        } catch (err) {
          console.error(err);
        }
        if (out) {
          if (state.colorMapOn) {
            out = window.applyColorMap(out, state.w, state.h, state.colorMapStrength, state.colorMap);
          }
          els.resultCanvas.getContext('2d').putImageData(new ImageData(out, state.w, state.h), 0, 0);
        }
        lastRenderMs = performance.now() - t0;
        els.resultBusy.hidden = true;
      })
    );
  }
})();
