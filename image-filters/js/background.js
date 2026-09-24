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

  // ---- subject (focus + colour, cut with GrabCut) ----
  //
  // The subject of a photo is usually the sharp thing that doesn't look like
  // the edges of the frame. Score every pixel on two cues at ~400px:
  //  - focus: local detail energy (a blurred background has almost none);
  //  - colour: Lab distance to the frame border's colours, clustered;
  // times a gentle centre bias. The score seeds GrabCut (sure background at
  // the border and low score, sure subject at high score), which fits colour
  // models to both sides and snaps the cut to real edges. The small mask is
  // then brought back to full size with a guided filter, so its edges follow
  // the photo's own edges instead of the upscale's blocks.

  const SUBJECT_MAX = 400;

  function toLab(d, n) {
    const L = new Float32Array(n);
    const A = new Float32Array(n);
    const B = new Float32Array(n);
    const lin = new Float32Array(256);
    for (let v = 0; v < 256; v++) {
      const c = v / 255;
      lin[v] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }
    const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    for (let p = 0, i = 0; p < n; p++, i += 4) {
      const r = lin[d[i]];
      const g = lin[d[i + 1]];
      const b = lin[d[i + 2]];
      const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
      const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
      const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
      L[p] = 116 * y - 16;
      A[p] = 500 * (x - y);
      B[p] = 200 * (y - z);
    }
    return [L, A, B];
  }

  // Separable box blur via prefix sums, repeated for a cheap Gaussian.
  function boxBlur(src, w, h, r, passes) {
    const a = Float32Array.from(src);
    const b = new Float32Array(a.length);
    const pref = new Float32Array(Math.max(w, h) + 1);
    for (let k = 0; k < passes; k++) {
      for (let y = 0; y < h; y++) {
        const o = y * w;
        pref[0] = 0;
        for (let x = 0; x < w; x++) pref[x + 1] = pref[x] + a[o + x];
        for (let x = 0; x < w; x++) {
          const l = Math.max(0, x - r);
          const rr = Math.min(w - 1, x + r);
          b[o + x] = (pref[rr + 1] - pref[l]) / (rr - l + 1);
        }
      }
      for (let x = 0; x < w; x++) {
        pref[0] = 0;
        for (let y = 0; y < h; y++) pref[y + 1] = pref[y] + b[y * w + x];
        for (let y = 0; y < h; y++) {
          const l = Math.max(0, y - r);
          const rr = Math.min(h - 1, y + r);
          a[y * w + x] = (pref[rr + 1] - pref[l]) / (rr - l + 1);
        }
      }
    }
    return a;
  }

  function percentile(arr, q) {
    const s = Float32Array.from(arr).sort();
    return s[Math.min(s.length - 1, Math.floor(q * s.length))];
  }

  function normalise(arr, lo, hi) {
    const a = percentile(arr, lo);
    const b = percentile(arr, hi);
    const span = b - a || 1;
    const out = new Float32Array(arr.length);
    for (let i = 0; i < arr.length; i++) out[i] = clamp((arr[i] - a) / span, 0, 1);
    return out;
  }

  function focusMap(L, w, h) {
    const e = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const p = y * w + x;
        const lap = 4 * L[p] - L[p - 1] - L[p + 1] - L[p - w] - L[p + w];
        e[p] = lap * lap;
      }
    }
    const pooled = boxBlur(e, w, h, Math.max(2, Math.round(Math.max(w, h) / 60)), 2);
    for (let i = 0; i < pooled.length; i++) pooled[i] = Math.sqrt(pooled[i]);
    return normalise(pooled, 0.05, 0.97);
  }

  function colourMap(Lab, w, h) {
    const L = Lab[0];
    const A = Lab[1];
    const B = Lab[2];
    const band = Math.max(2, Math.round(Math.min(w, h) * 0.04));
    const samples = [];
    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        if (x < band || y < band || x >= w - band || y >= h - band) samples.push(y * w + x);
      }
    }
    // k-means the border into a few backdrop colours.
    const K = 8;
    const cen = [];
    for (let k = 0; k < K; k++) {
      const p = samples[Math.floor(((k + 0.5) * samples.length) / K)];
      cen.push([L[p], A[p], B[p]]);
    }
    for (let it = 0; it < 8; it++) {
      const acc = cen.map(() => [0, 0, 0, 0]);
      for (const p of samples) {
        let bi = 0;
        let bd = Infinity;
        for (let k = 0; k < K; k++) {
          const d = (L[p] - cen[k][0]) ** 2 + (A[p] - cen[k][1]) ** 2 + (B[p] - cen[k][2]) ** 2;
          if (d < bd) { bd = d; bi = k; }
        }
        const a = acc[bi];
        a[0] += L[p]; a[1] += A[p]; a[2] += B[p]; a[3]++;
      }
      acc.forEach((a, k) => { if (a[3]) cen[k] = [a[0] / a[3], a[1] / a[3], a[2] / a[3]]; });
    }
    const out = new Float32Array(w * h);
    for (let p = 0; p < out.length; p++) {
      let bd = Infinity;
      for (let k = 0; k < K; k++) {
        // Lightness counts for less: light falls off across any backdrop.
        const d = 0.25 * (L[p] - cen[k][0]) ** 2 + (A[p] - cen[k][1]) ** 2 + (B[p] - cen[k][2]) ** 2;
        if (d < bd) bd = d;
      }
      out[p] = Math.sqrt(bd);
    }
    return normalise(boxBlur(out, w, h, 2, 1), 0.05, 0.98);
  }

  function resizeRGBA(d, w, h, tw, th) {
    const a = document.createElement('canvas');
    a.width = w;
    a.height = h;
    a.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(d), w, h), 0, 0);
    const b = document.createElement('canvas');
    b.width = tw;
    b.height = th;
    const bx = b.getContext('2d');
    bx.imageSmoothingQuality = 'high';
    bx.drawImage(a, 0, 0, tw, th);
    return bx.getImageData(0, 0, tw, th).data;
  }

  function resizeMap(m, w, h, tw, th) {
    const img = new Uint8ClampedArray(w * h * 4);
    for (let p = 0; p < w * h; p++) {
      const v = clamp(Math.round(m[p] * 255), 0, 255);
      img[p * 4] = img[p * 4 + 1] = img[p * 4 + 2] = v;
      img[p * 4 + 3] = 255;
    }
    const d = resizeRGBA(img, w, h, tw, th);
    const out = new Float32Array(tw * th);
    for (let p = 0; p < out.length; p++) out[p] = d[p * 4] / 255;
    return out;
  }

  // The expensive, slider-independent part, kept per image so dragging the
  // tolerance only re-runs the cut.
  let scoreCache = null;

  function subjectScore(data, w, h) {
    if (scoreCache && scoreCache.data === data && scoreCache.w === w) return scoreCache;
    const k = Math.min(1, SUBJECT_MAX / Math.max(w, h));
    const sw = Math.max(1, Math.round(w * k));
    const sh = Math.max(1, Math.round(h * k));
    const small = k < 1 ? resizeRGBA(data, w, h, sw, sh) : data;
    const n = sw * sh;
    const Lab = toLab(small, n);
    const focus = focusMap(Lab[0], sw, sh);
    const colour = colourMap(Lab, sw, sh);
    const score = new Float32Array(n);
    for (let y = 0, p = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++, p++) {
        const dx = (x / sw - 0.5) / 0.5;
        const dy = (y / sh - 0.5) / 0.5;
        const centre = Math.exp(-(dx * dx + dy * dy) / (2 * 0.55 * 0.55));
        score[p] = Math.sqrt(focus[p] * colour[p]) * (0.5 + 0.5 * centre);
      }
    }
    scoreCache = { data: data, w: w, small: small, sw: sw, sh: sh, score: normalise(score, 0.02, 0.99) };
    return scoreCache;
  }

  function cvReady() {
    const cv = window.cv;
    return !!(cv && cv.Mat && typeof cv.grabCut === 'function');
  }

  // 1 = subject, at the small size.
  function cutSubject(S, hi, lo) {
    const n = S.sw * S.sh;
    const out = new Float32Array(n);
    const score = S.score;
    const band = Math.max(1, Math.round(Math.min(S.sw, S.sh) * 0.015));
    if (!cvReady()) {
      // OpenCV still loading: the score alone, cut at the midpoint.
      for (let p = 0; p < n; p++) out[p] = score[p] >= (hi + lo) / 2 ? 1 : 0;
      return out;
    }
    const cv = window.cv;
    const img = new cv.Mat(S.sh, S.sw, cv.CV_8UC4);
    img.data.set(S.small);
    const rgb = new cv.Mat();
    const mask = new cv.Mat(S.sh, S.sw, cv.CV_8UC1);
    const bgd = new cv.Mat();
    const fgd = new cv.Mat();
    try {
      cv.cvtColor(img, rgb, cv.COLOR_RGBA2RGB);
      const md = mask.data;
      let sure = 0;
      for (let y = 0, p = 0; y < S.sh; y++) {
        for (let x = 0; x < S.sw; x++, p++) {
          const edge = x < band || y < band || x >= S.sw - band || y >= S.sh - band;
          const v = score[p];
          md[p] = edge || v < lo ? cv.GC_BGD : v >= hi ? cv.GC_FGD : v >= (hi + lo) / 2 ? cv.GC_PR_FGD : cv.GC_PR_BGD;
          if (md[p] === cv.GC_FGD) sure++;
        }
      }
      if (sure >= 10) {
        cv.grabCut(rgb, mask, new cv.Rect(0, 0, 1, 1), bgd, fgd, 4, cv.GC_INIT_WITH_MASK);
        for (let p = 0; p < n; p++) out[p] = md[p] === cv.GC_FGD || md[p] === cv.GC_PR_FGD ? 1 : 0;
        dropSpecks(out, S.sw, S.sh, Math.max(4, Math.round(n * 0.002)));
        fillHoles(out, S.sw, S.sh, Math.round(n * 0.01));
      }
    } finally {
      img.delete();
      rgb.delete();
      mask.delete();
      bgd.delete();
      fgd.delete();
    }
    return out;
  }

  // Remove subject islands smaller than minArea (reflections, stray texture).
  function dropSpecks(m, w, h, minArea) {
    const seen = new Uint8Array(w * h);
    const stack = [];
    const comp = [];
    for (let s = 0; s < m.length; s++) {
      if (!m[s] || seen[s]) continue;
      comp.length = 0;
      stack.push(s);
      seen[s] = 1;
      while (stack.length) {
        const p = stack.pop();
        comp.push(p);
        const x = p % w;
        if (x > 0 && m[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack.push(p - 1); }
        if (x < w - 1 && m[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack.push(p + 1); }
        if (p >= w && m[p - w] && !seen[p - w]) { seen[p - w] = 1; stack.push(p - w); }
        if (p + w < m.length && m[p + w] && !seen[p + w]) { seen[p + w] = 1; stack.push(p + w); }
      }
      if (comp.length < minArea) for (const p of comp) m[p] = 0;
    }
  }

  // Fill small background pockets enclosed by the subject - a dark pupil or a
  // shadowed gap reads as backdrop to GrabCut but belongs to the subject.
  function fillHoles(m, w, h, maxArea) {
    const seen = new Uint8Array(w * h);
    const stack = [];
    const comp = [];
    for (let s = 0; s < m.length; s++) {
      if (m[s] || seen[s]) continue;
      comp.length = 0;
      let touchesEdge = false;
      stack.push(s);
      seen[s] = 1;
      while (stack.length) {
        const p = stack.pop();
        comp.push(p);
        const x = p % w;
        const y = (p / w) | 0;
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touchesEdge = true;
        if (x > 0 && !m[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack.push(p - 1); }
        if (x < w - 1 && !m[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack.push(p + 1); }
        if (y > 0 && !m[p - w] && !seen[p - w]) { seen[p - w] = 1; stack.push(p - w); }
        if (y < h - 1 && !m[p + w] && !seen[p + w]) { seen[p + w] = 1; stack.push(p + w); }
      }
      if (!touchesEdge && comp.length <= maxArea) for (const p of comp) m[p] = 1;
    }
  }

  // Guided filter (He et al.): reshape a coarse mask so its edges follow the
  // full-size photo. Guide is luma 0..1.
  function guidedFilter(I, p, w, h, r, eps) {
    const n = w * h;
    const Ip = new Float32Array(n);
    const II = new Float32Array(n);
    for (let i = 0; i < n; i++) { Ip[i] = I[i] * p[i]; II[i] = I[i] * I[i]; }
    const mI = boxBlur(I, w, h, r, 1);
    const mP = boxBlur(p, w, h, r, 1);
    const mIp = boxBlur(Ip, w, h, r, 1);
    const mII = boxBlur(II, w, h, r, 1);
    const a = new Float32Array(n);
    const b = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const v = mII[i] - mI[i] * mI[i];
      a[i] = (mIp[i] - mI[i] * mP[i]) / (v + eps);
      b[i] = mP[i] - a[i] * mI[i];
    }
    const ma = boxBlur(a, w, h, r, 1);
    const mb = boxBlur(b, w, h, r, 1);
    const q = new Float32Array(n);
    for (let i = 0; i < n; i++) q[i] = ma[i] * I[i] + mb[i];
    return q;
  }

  // tolerance 0..1: higher = stricter about what counts as subject.
  function detectSubject(data, w, h, tol) {
    const S = subjectScore(data, w, h);
    const hi = clamp(0.35 + 0.72 * tol, 0.3, 0.97);
    const small = cutSubject(S, hi, hi * 0.21);
    let fg = small;
    if (S.sw !== w || S.sh !== h) {
      const coarse = resizeMap(small, S.sw, S.sh, w, h);
      const I = new Float32Array(w * h);
      for (let p = 0, i = 0; p < I.length; p++, i += 4) I[p] = luma(data[i], data[i + 1], data[i + 2]) / 255;
      const r = Math.max(2, Math.round(Math.max(w, h) / 150));
      fg = guidedFilter(I, coarse, w, h, r, 1e-3);
    }
    // Background = 255. Keep a narrow soft edge rather than a hard step.
    const mask = new Uint8ClampedArray(w * h);
    for (let p = 0; p < mask.length; p++) mask[p] = clamp(Math.round((1 - clamp((fg[p] - 0.5) * 2.5 + 0.5, 0, 1)) * 255), 0, 255);
    return mask;
  }

  window.BackgroundSep = {
    modes: {
      subject: {
        id: 'subject',
        name: 'Subject',
        hint: 'Find the sharp, distinctive subject and cut it out.',
        params: [
          { key: 'tolerance', label: 'Tolerance', min: 0, max: 95, value: 46 }
        ],
        compute(data, w, h, p) {
          return detectSubject(data, w, h, p.tolerance / 95);
        }
      },
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
