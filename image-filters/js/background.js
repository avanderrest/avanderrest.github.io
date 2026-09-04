(function () {
  'use strict';

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }
  function luma(r, g, b) {
    return 0.299 * r + 0.587 * g + 0.114 * b;
  }
  function rgbDist(r1, g1, b1, r2, g2, b2) {
    const dr = r1 - r2;
    const dg = g1 - g2;
    const db = b1 - b2;
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }
  function colorSim(r, g, b, tr, tg, tb) {
    // 0..1 similarity combining channel distance and luminance
    const d = rgbDist(r, g, b, tr, tg, tb);
    const dl = Math.abs(luma(r, g, b) - luma(tr, tg, tb));
    return 1 - clamp((d * 0.72 + dl * 1.25) / 255, 0, 1);
  }

  // Generic flood-fill region grower from border seeds.
  // joins(i) -> boolean: whether pixel i belongs to the background region.
  function growFromBorder(data, w, h, joins) {
    const n = w * h;
    const mask = new Uint8ClampedArray(n);
    const visited = new Uint8Array(n);
    const stack = [];
    const off = (x, y) => y * w + x;

    for (let x = 0; x < w; x++) {
      const y0 = off(x, 0);
      const y1 = off(x, h - 1);
      if (!visited[y0] && joins(y0)) { visited[y0] = 1; mask[y0] = 255; stack.push(y0); }
      if (!visited[y1] && joins(y1)) { visited[y1] = 1; mask[y1] = 255; stack.push(y1); }
    }
    for (let y = 0; y < h; y++) {
      const x0 = off(0, y);
      const x1 = off(w - 1, y);
      if (!visited[x0] && joins(x0)) { visited[x0] = 1; mask[x0] = 255; stack.push(x0); }
      if (!visited[x1] && joins(x1)) { visited[x1] = 1; mask[x1] = 255; stack.push(x1); }
    }

    while (stack.length) {
      const p = stack.pop();
      const px = p % w;
      const py = (p / w) | 0;
      if (px > 0) {
        const q = p - 1;
        if (!visited[q] && joins(q)) { visited[q] = 1; mask[q] = 255; stack.push(q); }
      }
      if (px < w - 1) {
        const q = p + 1;
        if (!visited[q] && joins(q)) { visited[q] = 1; mask[q] = 255; stack.push(q); }
      }
      if (py > 0) {
        const q = p - w;
        if (!visited[q] && joins(q)) { visited[q] = 1; mask[q] = 255; stack.push(q); }
      }
      if (py < h - 1) {
        const q = p + w;
        if (!visited[q] && joins(q)) { visited[q] = 1; mask[q] = 255; stack.push(q); }
      }
    }
    return mask;
  }

  // ---- edge flood-fill ----
  function detectEdge(data, w, h, tol) {
    const n = w * h;
    const visited = new Uint8Array(n);
    const stack = [];
    const mask = new Uint8ClampedArray(n);
    const off = (x, y) => y * w + x;

    for (let x = 0; x < w; x++) {
      stack.push(off(x, 0));
      stack.push(off(x, h - 1));
    }
    for (let y = 1; y < h - 1; y++) {
      stack.push(off(0, y));
      stack.push(off(w - 1, y));
    }

    while (stack.length) {
      const p = stack.pop();
      if (visited[p]) continue;
      visited[p] = 1;
      const o = p * 4;
      const r = data[o], g = data[o + 1], b = data[o + 2];
      let isBg = false;
      const px = p % w, py = (p / w) | 0;
      // a border pixel is background; interior joins if similar to any already-visited neighbor
      if (px === 0 || py === 0 || px === w - 1 || py === h - 1) {
        isBg = true;
      } else {
        if (visited[p - 1] && mask[p - 1]) isBg = colorSim(r, g, b, data[(p - 1) * 4], data[(p - 1) * 4 + 1], data[(p - 1) * 4 + 2]) >= tol;
        if (!isBg && visited[p + 1] && mask[p + 1]) isBg = colorSim(r, g, b, data[(p + 1) * 4], data[(p + 1) * 4 + 1], data[(p + 1) * 4 + 2]) >= tol;
        if (!isBg && visited[p - w] && mask[p - w]) isBg = colorSim(r, g, b, data[(p - w) * 4], data[(p - w) * 4 + 1], data[(p - w) * 4 + 2]) >= tol;
        if (!isBg && visited[p + w] && mask[p + w]) isBg = colorSim(r, g, b, data[(p + w) * 4], data[(p + w) * 4 + 1], data[(p + w) * 4 + 2]) >= tol;
      }
      if (isBg) {
        mask[p] = 255;
        if (px > 0) stack.push(p - 1);
        if (px < w - 1) stack.push(p + 1);
        if (py > 0) stack.push(p - w);
        if (py < h - 1) stack.push(p + w);
      }
    }
    return mask;
  }

  // ---- dominant flat colour ----
  function detectDominant(data, w, h, tol) {
    const bucket = {};
    const step = Math.max(1, Math.floor(Math.max(w, h) / 8));
    for (let o = 0; o < data.length; o += 4 * step) {
      const qr = (data[o] >> 4) << 4;
      const qg = (data[o + 1] >> 4) << 4;
      const qb = (data[o + 2] >> 4) << 4;
      const key = qr + ',' + qg + ',' + qb;
      bucket[key] = (bucket[key] || 0) + 1;
    }
    let bestKey = null;
    let bestCount = -1;
    for (const key in bucket) {
      if (bucket[key] > bestCount) {
        bestCount = bucket[key];
        bestKey = key;
      }
    }
    const parts = bestKey.split(',');
    const dr = +parts[0], dg = +parts[1], db = +parts[2];
    return growFromBorder(data, w, h, (i) => {
      const o = i * 4;
      return colorSim(data[o], data[o + 1], data[o + 2], dr, dg, db) >= tol;
    });
  }

  // ---- luminance threshold ----
  function detectLuminance(data, w, h, cutoff) {
    const t = cutoff; // 0..~128 -> band of extreme luma
    return growFromBorder(data, w, h, (i) => {
      const o = i * 4;
      const l = luma(data[o], data[o + 1], data[o + 2]);
      return l <= t || l >= 255 - t;
    });
  }

  window.BackgroundSep = {
    modes: {
      edge: {
        id: 'edge',
        name: 'Edge flood-fill',
        hint: 'Grow the background inwards from the image borders.',
        params: [
          { key: 'tolerance', label: 'Tolerance', min: 0, max: 95, value: 40 }
        ],
        compute(data, w, h, p) {
          return detectEdge(data, w, h, p.tolerance / 100);
        }
      },
      dominant: {
        id: 'dominant',
        name: 'Dominant colour',
        hint: 'Use the most common colour as the background.',
        params: [
          { key: 'tolerance', label: 'Tolerance', min: 0, max: 95, value: 46 }
        ],
        compute(data, w, h, p) {
          return detectDominant(data, w, h, p.tolerance / 100);
        }
      },
      luminance: {
        id: 'luminance',
        name: 'Luminance threshold',
        hint: 'Treat very dark or very light border regions as the background.',
        params: [
          { key: 'cutoff', label: 'Cut-off', min: 0, max: 100, value: 45 }
        ],
        compute(data, w, h, p) {
          return detectLuminance(data, w, h, p.cutoff);
        }
      }
    }
  };
})();
