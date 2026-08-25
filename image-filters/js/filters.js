(function () {
  'use strict';

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

  function gradientLUT(stops) {
    const lut = new Uint8ClampedArray(256 * 3);
    for (let i = 0; i < 256; i++) {
      const t = i / 255;
      let a = stops[0];
      let b = stops[stops.length - 1];
      for (let s = 0; s < stops.length - 1; s++) {
        if (t >= stops[s][0] && t <= stops[s + 1][0]) {
          a = stops[s];
          b = stops[s + 1];
          break;
        }
      }
      const span = b[0] - a[0] || 1;
      const f = (t - a[0]) / span;
      lut[i * 3] = a[1][0] + (b[1][0] - a[1][0]) * f;
      lut[i * 3 + 1] = a[1][1] + (b[1][1] - a[1][1]) * f;
      lut[i * 3 + 2] = a[1][2] + (b[1][2] - a[1][2]) * f;
    }
    return lut;
  }

  function applyLUT(src, out, lut) {
    for (let i = 0; i < src.length; i += 4) {
      const l = luma(src[i], src[i + 1], src[i + 2]) | 0;
      out[i] = lut[l * 3];
      out[i + 1] = lut[l * 3 + 1];
      out[i + 2] = lut[l * 3 + 2];
      out[i + 3] = 255;
    }
  }

  function grayF32(src, w, h) {
    const g = new Float32Array(w * h);
    for (let i = 0, j = 0; i < src.length; i += 4, j++) {
      g[j] = luma(src[i], src[i + 1], src[i + 2]);
    }
    return g;
  }

  function sobelMag(gray, w, h) {
    const mag = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const gx =
          gray[i - w + 1] + 2 * gray[i + 1] + gray[i + w + 1] -
          (gray[i - w - 1] + 2 * gray[i - 1] + gray[i + w - 1]);
        const gy =
          gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1] -
          (gray[i - w - 1] + 2 * gray[i - w] + gray[i - w + 1]);
        mag[i] = Math.sqrt(gx * gx + gy * gy);
      }
    }
    return mag;
  }

  function boxBlurF32(src, w, h, r, passes) {
    const norm = 1 / (2 * r + 1);
    const cur = Float32Array.from(src);
    const tmp = new Float32Array(src.length);
    for (let p = 0; p < passes; p++) {
      for (let y = 0; y < h; y++) {
        const row = y * w;
        let s = 0;
        for (let k = -r; k <= r; k++) s += cur[row + clamp(k, 0, w - 1)];
        for (let x = 0; x < w; x++) {
          tmp[row + x] = s * norm;
          s += cur[row + Math.min(x + r + 1, w - 1)] - cur[row + Math.max(x - r, 0)];
        }
      }
      for (let x = 0; x < w; x++) {
        let s = 0;
        for (let k = -r; k <= r; k++) s += tmp[clamp(k, 0, h - 1) * w + x];
        for (let y = 0; y < h; y++) {
          cur[y * w + x] = s * norm;
          s += tmp[Math.min(y + r + 1, h - 1) * w + x] - tmp[Math.max(y - r, 0) * w + x];
        }
      }
    }
    return cur;
  }

  function boxBlurRGBA(src, w, h, r, passes) {
    const norm = 1 / (2 * r + 1);
    const cur = new Uint8ClampedArray(src);
    const tmp = new Uint8ClampedArray(src.length);
    for (let p = 0; p < passes; p++) {
      for (let y = 0; y < h; y++) {
        const row = y * w * 4;
        let s0 = 0, s1 = 0, s2 = 0;
        for (let k = -r; k <= r; k++) {
          const i = row + clamp(k, 0, w - 1) * 4;
          s0 += cur[i]; s1 += cur[i + 1]; s2 += cur[i + 2];
        }
        for (let x = 0; x < w; x++) {
          const o = row + x * 4;
          tmp[o] = s0 * norm;
          tmp[o + 1] = s1 * norm;
          tmp[o + 2] = s2 * norm;
          tmp[o + 3] = 255;
          const ia = row + Math.min(x + r + 1, w - 1) * 4;
          const ir = row + Math.max(x - r, 0) * 4;
          s0 += cur[ia] - cur[ir];
          s1 += cur[ia + 1] - cur[ir + 1];
          s2 += cur[ia + 2] - cur[ir + 2];
        }
      }
      for (let x = 0; x < w; x++) {
        let s0 = 0, s1 = 0, s2 = 0;
        for (let k = -r; k <= r; k++) {
          const i = clamp(k, 0, h - 1) * w * 4 + x * 4;
          s0 += tmp[i]; s1 += tmp[i + 1]; s2 += tmp[i + 2];
        }
        for (let y = 0; y < h; y++) {
          const o = y * w * 4 + x * 4;
          cur[o] = s0 * norm;
          cur[o + 1] = s1 * norm;
          cur[o + 2] = s2 * norm;
          cur[o + 3] = 255;
          const ia = Math.min(y + r + 1, h - 1) * w * 4 + x * 4;
          const ir = Math.max(y - r, 0) * w * 4 + x * 4;
          s0 += tmp[ia] - tmp[ir];
          s1 += tmp[ia + 1] - tmp[ir + 1];
          s2 += tmp[ia + 2] - tmp[ir + 2];
        }
      }
    }
    return cur;
  }

  function minFilterF32(src, w, h, r) {
    const tmp = new Float32Array(src.length);
    const out = new Float32Array(src.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let m = 255;
        for (let k = -r; k <= r; k++) {
          const v = src[y * w + clamp(x + k, 0, w - 1)];
          if (v < m) m = v;
        }
        tmp[y * w + x] = m;
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let m = 255;
        for (let k = -r; k <= r; k++) {
          const v = tmp[clamp(y + k, 0, h - 1) * w + x];
          if (v < m) m = v;
        }
        out[y * w + x] = m;
      }
    }
    return out;
  }

  function saturate(data, amt) {
    for (let i = 0; i < data.length; i += 4) {
      const l = luma(data[i], data[i + 1], data[i + 2]);
      data[i] = l + (data[i] - l) * amt;
      data[i + 1] = l + (data[i + 1] - l) * amt;
      data[i + 2] = l + (data[i + 2] - l) * amt;
    }
  }

  function posterize(data, levels) {
    const step = 255 / (levels - 1);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.round(data[i] / step) * step;
      data[i + 1] = Math.round(data[i + 1] / step) * step;
      data[i + 2] = Math.round(data[i + 2] / step) * step;
    }
  }

  function contrastSCurve(data, amt) {
    for (let i = 0; i < data.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        const f = data[i + c] / 255;
        const s = f * f * (3 - 2 * f);
        data[i + c] = (f + (s - f) * amt) * 255;
      }
    }
  }

  function mixWithOriginal(out, src, t) {
    for (let i = 0; i < out.length; i += 4) {
      out[i] = src[i] + (out[i] - src[i]) * t;
      out[i + 1] = src[i + 1] + (out[i + 1] - src[i + 1]) * t;
      out[i + 2] = src[i + 2] + (out[i + 2] - src[i + 2]) * t;
    }
  }

  function kuwahara(src, w, h, r) {
    const out = new Uint8ClampedArray(src.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let bv = Infinity, br = 0, bg = 0, bb = 0;
        for (let q = 0; q < 4; q++) {
          const xs = (q & 1) ? x : x - r;
          const ys = (q & 2) ? y : y - r;
          let sr = 0, sg = 0, sb = 0, sl = 0, sll = 0, n = 0;
          for (let yy = ys; yy <= ys + r; yy++) {
            const cy = clamp(yy, 0, h - 1);
            for (let xx = xs; xx <= xs + r; xx++) {
              const cx = clamp(xx, 0, w - 1);
              const i = (cy * w + cx) * 4;
              const rr = src[i], gg = src[i + 1], bb2 = src[i + 2];
              sr += rr; sg += gg; sb += bb2;
              const l = 0.299 * rr + 0.587 * gg + 0.114 * bb2;
              sl += l;
              sll += l * l;
              n++;
            }
          }
          const ml = sl / n;
          const v = sll / n - ml * ml;
          if (v < bv) {
            bv = v;
            br = sr / n;
            bg = sg / n;
            bb = sb / n;
          }
        }
        const o = (y * w + x) * 4;
        out[o] = br;
        out[o + 1] = bg;
        out[o + 2] = bb;
        out[o + 3] = 255;
      }
    }
    return out;
  }

  function pixelate(src, w, h, block, levels) {
    const out = new Uint8ClampedArray(src.length);
    const step = 255 / (levels - 1);
    for (let by = 0; by < h; by += block) {
      for (let bx = 0; bx < w; bx += block) {
        const ye = Math.min(by + block, h);
        const xe = Math.min(bx + block, w);
        let sr = 0, sg = 0, sb = 0, n = 0;
        for (let y = by; y < ye; y++) {
          for (let x = bx; x < xe; x++) {
            const i = (y * w + x) * 4;
            sr += src[i]; sg += src[i + 1]; sb += src[i + 2];
            n++;
          }
        }
        let r = sr / n, g = sg / n, b = sb / n;
        const l = luma(r, g, b);
        r = clamp(l + (r - l) * 1.35, 0, 255);
        g = clamp(l + (g - l) * 1.35, 0, 255);
        b = clamp(l + (b - l) * 1.35, 0, 255);
        r = Math.round(r / step) * step;
        g = Math.round(g / step) * step;
        b = Math.round(b / step) * step;
        for (let y = by; y < ye; y++) {
          for (let x = bx; x < xe; x++) {
            const o = (y * w + x) * 4;
            out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = 255;
          }
        }
      }
    }
    return out;
  }

  function halftone(src, w, h, cell) {
    const out = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < out.length; i += 4) {
      out[i] = 251; out[i + 1] = 249; out[i + 2] = 244; out[i + 3] = 255;
    }
    for (let cy = 0; cy < h; cy += cell) {
      for (let cx = 0; cx < w; cx += cell) {
        const ye = Math.min(cy + cell, h);
        const xe = Math.min(cx + cell, w);
        let sr = 0, sg = 0, sb = 0, n = 0;
        for (let y = cy; y < ye; y++) {
          for (let x = cx; x < xe; x++) {
            const i = (y * w + x) * 4;
            sr += src[i]; sg += src[i + 1]; sb += src[i + 2];
            n++;
          }
        }
        const r = sr / n, g = sg / n, b = sb / n;
        const l = luma(r, g, b) / 255;
        const rad = (1 - l) * cell * 0.68;
        if (rad < 0.4) continue;
        const ccx = cx + cell / 2;
        const ccy = cy + cell / 2;
        const dr = r * 0.8, dg = g * 0.8, db = b * 0.8;
        const r2 = rad * rad;
        for (let y = cy; y < ye; y++) {
          for (let x = cx; x < xe; x++) {
            const dx = x + 0.5 - ccx;
            const dy = y + 0.5 - ccy;
            if (dx * dx + dy * dy <= r2) {
              const o = (y * w + x) * 4;
              out[o] = dr; out[o + 1] = dg; out[o + 2] = db;
            }
          }
        }
      }
    }
    return out;
  }

  function shiftChannel(src, out, ch, dx, w, h) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const xx = clamp(x + dx, 0, w - 1);
        out[(y * w + x) * 4 + ch] = src[(y * w + xx) * 4 + ch];
      }
    }
  }

  function glitchify(src, w, h, s) {
    const out = new Uint8ClampedArray(src);
    const shift = Math.max(2, Math.round(4 + 12 * s));
    shiftChannel(src, out, 0, shift, w, h);
    shiftChannel(src, out, 2, -shift, w, h);
    const n = 6 + Math.round(26 * s);
    for (let k = 0; k < n; k++) {
      const sy = Math.floor(Math.random() * h);
      const sh = Math.max(2, Math.round(h * (0.004 + Math.random() * 0.035)));
      const dx = Math.round((Math.random() - 0.5) * 2 * (10 + 140 * s));
      const yEnd = Math.min(sy + sh, h);
      for (let y = sy; y < yEnd; y++) {
        const row = out.slice(y * w * 4, (y * w + w) * 4);
        for (let x = 0; x < w; x++) {
          const xx = (((x + dx) % w) + w) % w;
          const o = (y * w + x) * 4;
          const q = xx * 4;
          out[o] = row[q];
          out[o + 1] = row[q + 1];
          out[o + 2] = row[q + 2];
        }
        if (Math.random() < 0.3) {
          const tint = Math.random() < 0.5 ? [255, 0, 170] : [0, 255, 225];
          const a = 0.15 + Math.random() * 0.25;
          for (let x = 0; x < w; x++) {
            const o = (y * w + x) * 4;
            out[o] += (tint[0] - out[o]) * a;
            out[o + 1] += (tint[1] - out[o + 1]) * a;
            out[o + 2] += (tint[2] - out[o + 2]) * a;
          }
        }
      }
    }
    if (Math.random() < 0.25 + 0.35 * s) {
      const bw = Math.round(w * (0.08 + Math.random() * 0.2));
      const bh = Math.round(h * (0.03 + Math.random() * 0.1));
      const bx = Math.floor(Math.random() * Math.max(1, w - bw));
      const by = Math.floor(Math.random() * Math.max(1, h - bh));
      for (let y = by; y < Math.min(by + bh, h); y++) {
        for (let x = bx; x < Math.min(bx + bw, w); x++) {
          const o = (y * w + x) * 4;
          out[o] = 255 - out[o];
          out[o + 1] = 255 - out[o + 1];
          out[o + 2] = 255 - out[o + 2];
        }
      }
    }
    return out;
  }

  function hexToRgb(hex) {
    const n = parseInt(hex.replace('#', ''), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function buildLutFromColors(c0, c1, c2) {
    return gradientLUT([
      [0, hexToRgb(c0)],
      [0.5, hexToRgb(c1)],
      [1, hexToRgb(c2)]
    ]);
  }

  const DEFAULT_COLORMAP = { shadow: '#0f0632', mid: '#e13caf', high: '#6eeaff' };

  window.ColorMapPresets = {
    Vaporwave: { shadow: '#0f0632', mid: '#e13caf', high: '#6eeaff' },
    Synthwave: { shadow: '#0c0828', mid: '#e42d7d', high: '#ffe7aa' },
    Thermal: { shadow: '#0a0028', mid: '#ff9d00', high: '#ffffff' },
    'Cotton Candy': { shadow: '#1e1250', mid: '#ff50aa', high: '#ffdcf0' },
    Emerald: { shadow: '#03150f', mid: '#0f9d6c', high: '#d8ffe9' },
    Ice: { shadow: '#0a1230', mid: '#4aa8d8', high: '#f2fbff' }
  };

  window.applyColorMap = function (data, w, h, s, cols) {
    const c = cols || DEFAULT_COLORMAP;
    const lut = buildLutFromColors(c.shadow, c.mid, c.high);
    const out = new Uint8ClampedArray(data.length);
    applyLUT(data, out, lut);
    mixWithOriginal(out, data, s);
    return out;
  };

  window.Filters = [
    {
      id: 'pastel-anime',
      name: 'Pastel Anime',
      maxPixels: 480000,
      apply(data, w, h, s) {
        const out = kuwahara(data, w, h, 3 + Math.round(3 * s));

        const stops = [
          [0, 32], [0.045, 52], [0.083, 108], [0.13, 148],
          [0.235, 185], [0.47, 220], [1, 250]
        ].map(function (st) { return [st[0], [st[1], st[1], st[1]]]; });
        const tone = gradientLUT(stops);
        for (let i = 0; i < out.length; i += 4) {
          out[i] = tone[out[i] * 3];
          out[i + 1] = tone[out[i + 1] * 3 + 1];
          out[i + 2] = tone[out[i + 2] * 3 + 2];
        }

        const shadowTint = [186, 180, 242];
        const highTint = [255, 240, 205];
        const tintScale = 0.5 + 0.5 * s;
        const stAmt = 0.38 * tintScale;
        const htAmt = 0.22 * tintScale;
        for (let i = 0; i < out.length; i += 4) {
          let r = out[i], g = out[i + 1], b = out[i + 2];
          const t = luma(r, g, b) / 255;
          const ws = Math.pow(1 - t, 1.5) * stAmt;
          const wh = t * t * htAmt;
          r += (shadowTint[0] - r) * ws;
          g += (shadowTint[1] - g) * ws;
          b += (shadowTint[2] - b) * ws;
          r += (highTint[0] - r) * wh;
          g += (highTint[1] - g) * wh;
          b += (highTint[2] - b) * wh;
          const gdom = Math.max(0, Math.min(1, (g - Math.max(r, b)) / 90));
          b += (g - b) * 0.3 * gdom;
          r -= r * 0.1 * gdom;
          const l = luma(r, g, b);
          const sat = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
          const amt = 1 + 0.85 * (1 - sat) * tintScale + 0.3 * tintScale;
          out[i] = l + (r - l) * amt;
          out[i + 1] = l + (g - l) * amt;
          out[i + 2] = l + (b - l) * amt;
        }

        const glow = boxBlurRGBA(out, w, h, Math.max(4, Math.round(6 + 16 * s)), 2);
        const ba = 0.3 + 0.3 * s;
        for (let i = 0; i < out.length; i += 4) {
          for (let c = 0; c < 3; c++) {
            const src = out[i + c];
            const bl = glow[i + c];
            const screen = 255 - ((255 - src) * (255 - bl)) / 255;
            out[i + c] = src + (screen - src) * ba;
          }
        }

        mixWithOriginal(out, data, 0.3 + 0.7 * s);
        return out;
      }
    },
    {
      id: 'ink-sketch',
      name: 'Ink Sketch',
      apply(data, w, h, s) {
        const len = w * h;
        const gray = grayF32(data, w, h);
        const r = Math.max(2, Math.round(3 + 10 * s));
        const inv = new Float32Array(len);
        for (let i = 0; i < len; i++) inv[i] = 255 - gray[i];
        const blur = boxBlurF32(inv, w, h, r, 2);
        const sketch = new Float32Array(len);
        for (let i = 0; i < len; i++) {
          const b = blur[i];
          let d = b >= 255 ? 255 : (gray[i] * 255) / (256 - b);
          d = clamp(d, 0, 255);
          const f = d / 255;
          const sc = f * f * (3 - 2 * f);
          sketch[i] = (f * 0.4 + sc * 0.6) * 255;
        }
        const mag = sobelMag(gray, w, h);
        const t = 150 - 90 * s;
        const soft = new Float32Array(len);
        for (let i = 0; i < len; i++) {
          const e = clamp((mag[i] - t) / (280 - t), 0, 1);
          soft[i] = 255 - e * 255;
        }
        const lines = minFilterF32(soft, w, h, 1 + Math.round(2 * s));
        const out = new Uint8ClampedArray(data.length);
        for (let i = 0, j = 0; i < len; i++, j += 4) {
          const v = sketch[i] * (0.12 + 0.88 * (lines[i] / 255));
          out[j] = v;
          out[j + 1] = v * 0.98;
          out[j + 2] = v * 0.95;
          out[j + 3] = 255;
        }
        return out;
      }
    },
    {
      id: 'pencil-sketch',
      name: 'Pencil Sketch',
      apply(data, w, h, s) {
        const gray = grayF32(data, w, h);
        const r = Math.max(2, Math.round(3 + 12 * s));
        const inv = new Float32Array(gray.length);
        for (let i = 0; i < gray.length; i++) inv[i] = 255 - gray[i];
        const blur = boxBlurF32(inv, w, h, r, 2);
        const out = new Uint8ClampedArray(data.length);
        for (let i = 0, j = 0; i < gray.length; i++, j += 4) {
          const b = blur[i];
          let d = b >= 255 ? 255 : (gray[i] * 255) / (256 - b);
          d = clamp(d, 0, 255);
          const f = d / 255;
          const sc = f * f * (3 - 2 * f);
          d = (f * 0.35 + sc * 0.65) * 255;
          out[j] = d;
          out[j + 1] = d * 0.98;
          out[j + 2] = d * 0.95;
          out[j + 3] = 255;
        }
        return out;
      }
    },
    {
      id: 'neon-edges',
      name: 'Neon Edges',
      apply(data, w, h, s) {
        const gray = grayF32(data, w, h);
        const mag = sobelMag(gray, w, h);
        const t = 120 - 70 * s;
        const base = new Uint8ClampedArray(data.length);
        const bgLevel = 0.3 - 0.1 * s;
        for (let i = 0; i < mag.length; i++) {
          const o = i * 4;
          const r0 = data[o], g0 = data[o + 1], b0 = data[o + 2];
          const l = luma(r0, g0, b0);
          base[o] = (l + (r0 - l) * 1.7) * bgLevel;
          base[o + 1] = (l + (g0 - l) * 1.7) * bgLevel;
          base[o + 2] = (l + (b0 - l) * 1.7) * bgLevel;
          base[o + 3] = 255;
          const e = clamp((mag[i] - t) / (250 - t), 0, 1);
          base[o] += (l + (r0 - l) * 2.4) * e * 1.6;
          base[o + 1] += (l + (g0 - l) * 2.4) * e * 1.6;
          base[o + 2] += (l + (b0 - l) * 2.4) * e * 1.6;
        }
        const glow = boxBlurRGBA(base, w, h, Math.max(2, Math.round(4 + 14 * s)), 2);
        const out = new Uint8ClampedArray(data.length);
        for (let i = 0; i < out.length; i += 4) {
          out[i] = base[i] + glow[i] * 0.95;
          out[i + 1] = base[i + 1] + glow[i + 1] * 0.95;
          out[i + 2] = base[i + 2] + glow[i + 2] * 0.95;
          out[i + 3] = 255;
        }
        saturate(out, 1.25);
        return out;
      }
    },
    {
      id: 'oil-painting',
      name: 'Oil Painting',
      maxPixels: 480000,
      apply(data, w, h, s) {
        return kuwahara(data, w, h, 2 + Math.round(4 * s));
      }
    },
    { id: 'glitch', name: 'Glitch Art', apply(data, w, h, s) { return glitchify(data, w, h, s); } },
    {
      id: 'pixel-art',
      name: 'Pixel Art',
      apply(data, w, h, s) {
        return pixelate(data, w, h, Math.max(3, Math.round(3 + 13 * s)), 6);
      }
    },
    {
      id: 'halftone',
      name: 'Halftone Print',
      apply(data, w, h, s) {
        return halftone(data, w, h, Math.max(4, Math.round(4 + 9 * s)));
      }
    },
    {
      id: 'dreamy-haze',
      name: 'Dreamy Haze',
      apply(data, w, h, s) {
        const blur = boxBlurRGBA(data, w, h, Math.max(3, Math.round(5 + 16 * s)), 2);
        const out = new Uint8ClampedArray(data.length);
        const a = 0.35 + 0.5 * s;
        for (let i = 0; i < out.length; i += 4) {
          for (let c = 0; c < 3; c++) {
            const src = data[i + c];
            const bl = blur[i + c];
            const screen = 255 - ((255 - src) * (255 - bl)) / 255;
            out[i + c] = src + (screen - src) * a;
          }
          out[i + 3] = 255;
        }
        saturate(out, 1.2);
        return out;
      }
    },
    {
      id: 'cyberpunk',
      name: 'Cyberpunk',
      apply(data, w, h, s) {
        const out = new Uint8ClampedArray(data.length);
        for (let i = 0; i < out.length; i += 4) {
          const l = luma(data[i], data[i + 1], data[i + 2]) / 255;
          const ws = (1 - l) * (1 - l) * 0.5;
          const wh = l * l * 0.4;
          let r = data[i] + (0 - data[i]) * ws;
          let g = data[i + 1] + (170 - data[i + 1]) * ws;
          let b = data[i + 2] + (200 - data[i + 2]) * ws;
          r = r + (255 - r) * wh;
          g = g + (60 - g) * wh;
          b = b + (190 - b) * wh;
          out[i] = (r - 128) * 1.18 + 128;
          out[i + 1] = (g - 128) * 1.18 + 128;
          out[i + 2] = (b - 128) * 1.18 + 128;
          out[i + 3] = 255;
        }
        mixWithOriginal(out, data, s);
        return out;
      }
    },
    {
      id: 'retro-poster',
      name: 'Retro Poster',
      apply(data, w, h, s) {
        const out = new Uint8ClampedArray(data);
        posterize(out, 4);
        saturate(out, 1.15);
        contrastSCurve(out, 0.45);
        for (let i = 0; i < out.length; i += 4) {
          out[i] = out[i] * 1.08;
          out[i + 2] = out[i + 2] * 0.9;
        }
        mixWithOriginal(out, data, 0.4 + 0.6 * s);
        return out;
      }
    }
  ];
})();
