(function () {
  'use strict';

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

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

  function medianPass(src, dst, w, h, r, vertical, c) {
    const hist = new Int32Array(256);
    const step = vertical ? w * 4 : 4;
    const lines = vertical ? w : h;
    const n = vertical ? h : w;
    const want = (r + 2) >> 0;
    const win = 2 * r + 1;
    const target = (win + 1) >> 1;
    void want;
    for (let L = 0; L < lines; L++) {
      hist.fill(0);
      const base = vertical ? L * 4 + c : L * w * 4 + c;
      let med = 0;
      let lt = 0;
      for (let k = -r; k <= r; k++) {
        const v = src[base + Math.min(n - 1, Math.max(0, k)) * step];
        hist[v]++;
      }
      let acc = 0;
      for (let v = 0; v < 256; v++) {
        acc += hist[v];
        if (acc >= target) { med = v; break; }
      }
      for (let v = 0; v < med; v++) lt += hist[v];
      for (let i = 0; i < n; i++) {
        dst[base + i * step] = med;
        const addIdx = i + r + 1;
        const remIdx = i - r;
        if (addIdx < n) {
          const v = src[base + addIdx * step];
          hist[v]++;
          if (v < med) lt++;
        }
        if (remIdx >= 0) {
          const v = src[base + remIdx * step];
          hist[v]--;
          if (v < med) lt--;
        }
        while (lt >= target) { med--; lt -= hist[med]; }
        while (lt + hist[med] < target) { lt += hist[med]; med++; }
      }
    }
  }

  function medianRGBA(src, w, h, r) {
    const tmp = new Uint8ClampedArray(src.length);
    const out = new Uint8ClampedArray(src.length);
    for (let c = 0; c < 3; c++) {
      medianPass(src, tmp, w, h, r, false, c);
      medianPass(tmp, out, w, h, r, true, c);
    }
    for (let i = 3; i < src.length; i += 4) out[i] = 255;
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

  function screenBlend(img, blur, amt) {
    for (let i = 0; i < img.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        const src = img[i + c];
        const bl = blur[i + c];
        const screen = 255 - ((255 - src) * (255 - bl)) / 255;
        img[i + c] = src + (screen - src) * amt;
      }
    }
    return img;
  }

  function lumaQuantize(img, levels) {
    const stp = 255 / (levels - 1);
    for (let i = 0; i < img.length; i += 4) {
      const l = luma(img[i], img[i + 1], img[i + 2]);
      const q = Math.round(l / stp) * stp;
      const s2 = l > 1 ? q / l : 0;
      img[i] *= s2;
      img[i + 1] *= s2;
      img[i + 2] *= s2;
    }
    return img;
  }

  function painterlySmooth(data, w, h, brush) {
    const mr = Math.max(1, Math.round(brush * 0.7));
    return kuwahara(medianRGBA(data, w, h, mr), w, h, Math.max(1, Math.round(brush)));
  }

  function dodgeSketch(gray, w, h, radius, fMix, scMix) {
    const len = gray.length;
    const inv = new Float32Array(len);
    for (let i = 0; i < len; i++) inv[i] = 255 - gray[i];
    const blur = boxBlurF32(inv, w, h, radius, 2);
    const out = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const b = blur[i];
      const d = clamp(b >= 255 ? 255 : (gray[i] * 255) / (256 - b), 0, 255);
      const f = d / 255;
      const sc = f * f * (3 - 2 * f);
      out[i] = (f * fMix + sc * scMix) * 255;
    }
    return out;
  }

  function tintBySketch(data, vals) {
    const out = new Uint8ClampedArray(data.length);
    for (let i = 0, j = 0; i < vals.length; i++, j += 4) {
      const l = Math.max(8, luma(data[j], data[j + 1], data[j + 2]));
      const k = Math.min(2.5, vals[i] / l);
      out[j] = data[j] * k;
      out[j + 1] = data[j + 1] * k;
      out[j + 2] = data[j + 2] * k;
      out[j + 3] = 255;
    }
    return out;
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

  function bandGlitch(out, w, h, rand, bands, maxDx, tintChance, tints) {
    for (let k = 0; k < bands; k++) {
      const sy = Math.floor(rand() * h);
      const sh = Math.max(2, Math.round(h * (0.004 + rand() * 0.035)));
      const dx = Math.round((rand() - 0.5) * 2 * maxDx);
      for (let y = sy; y < Math.min(sy + sh, h); y++) {
        const row = out.slice(y * w * 4, (y * w + w) * 4);
        for (let x = 0; x < w; x++) {
          const xx = (((x + dx) % w) + w) % w;
          const o = (y * w + x) * 4;
          const q = xx * 4;
          out[o] = row[q];
          out[o + 1] = row[q + 1];
          out[o + 2] = row[q + 2];
        }
        if (rand() < tintChance) {
          const tint = rand() < 0.5 ? tints[0] : tints[1];
          const ta = 0.15 + rand() * 0.25;
          for (let x = 0; x < w; x++) {
            const o = (y * w + x) * 4;
            out[o] += (tint[0] - out[o]) * ta;
            out[o + 1] += (tint[1] - out[o + 1]) * ta;
            out[o + 2] += (tint[2] - out[o + 2]) * ta;
          }
        }
      }
    }
    return out;
  }

  function glitchify(src, w, h, a, splitPx, rand) {
    const out = new Uint8ClampedArray(src);
    if (splitPx > 0) {
      const shift = Math.max(1, Math.round(splitPx));
      shiftChannel(src, out, 0, shift, w, h);
      shiftChannel(src, out, 2, -shift, w, h);
    }
    bandGlitch(out, w, h, rand, 2 + Math.round(30 * a), 10 + 140 * a, 0.3,
      [[255, 0, 170], [0, 255, 225]]);
    if (rand() < 0.2 + 0.4 * a) {
      const bw = Math.round(w * (0.08 + rand() * 0.2));
      const bh = Math.round(h * (0.03 + rand() * 0.1));
      const bx = Math.floor(rand() * Math.max(1, w - bw));
      const by = Math.floor(rand() * Math.max(1, h - bh));
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

  function unsharp(src, w, h, radius, amount) {
    const blur = boxBlurRGBA(src, w, h, Math.max(1, Math.round(radius)), 2);
    const out = new Uint8ClampedArray(src.length);
    for (let i = 0; i < src.length; i += 4) {
      out[i] = src[i] + (src[i] - blur[i]) * amount;
      out[i + 1] = src[i + 1] + (src[i + 1] - blur[i + 1]) * amount;
      out[i + 2] = src[i + 2] + (src[i + 2] - blur[i + 2]) * amount;
      out[i + 3] = 255;
    }
    return out;
  }

  function vignette(src, w, h, amt, feather) {
    const out = new Uint8ClampedArray(src);
    const cx = (w - 1) / 2;
    const cy = (h - 1) / 2;
    const maxD = Math.sqrt(cx * cx + cy * cy);
    const inner = maxD * (1 - clamp(feather, 0.05, 1));
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const d = Math.sqrt(dx * dx + dy * dy);
        let t = clamp((d - inner) / (maxD - inner || 1), 0, 1);
        t = t * t * (3 - 2 * t);
        const f = 1 - amt * t;
        const o = (y * w + x) * 4;
        out[o] *= f;
        out[o + 1] *= f;
        out[o + 2] *= f;
      }
    }
    return out;
  }

  function filmGrain(src, w, h, amt, seed) {
    const out = new Uint8ClampedArray(src);
    const rand = mulberry32(Math.round(seed) || 1);
    for (let i = 0; i < out.length; i += 4) {
      const n = (rand() - 0.5) * amt * 120;
      out[i] += n;
      out[i + 1] += n;
      out[i + 2] += n;
    }
    return out;
  }

  function chromaticAberration(src, w, h, px) {
    const out = new Uint8ClampedArray(w * h * 4);
    const cx = (w - 1) / 2 || 1;
    const cy = (h - 1) / 2 || 1;
    const s = Math.max(0, px);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const fx = (x - cx) / cx;
        const fy = (y - cy) / cy;
        const o = (y * w + x) * 4;
        out[o] = src[(clamp(Math.round(y + fy * s), 0, h - 1) * w + clamp(Math.round(x + fx * s), 0, w - 1)) * 4];
        out[o + 1] = src[o + 1];
        out[o + 2] = src[(clamp(Math.round(y - fy * s), 0, h - 1) * w + clamp(Math.round(x - fx * s), 0, w - 1)) * 4 + 2];
        out[o + 3] = 255;
      }
    }
    return out;
  }

  function waveWarp(src, w, h, amp, len) {
    const out = new Uint8ClampedArray(w * h * 4);
    const period = Math.max(8, len);
    for (let y = 0; y < h; y++) {
      const off = Math.round(Math.sin((y / period) * Math.PI * 2) * amp);
      for (let x = 0; x < w; x++) {
        const xx = clamp(x + off, 0, w - 1);
        const o = (y * w + x) * 4;
        const q = (y * w + xx) * 4;
        out[o] = src[q];
        out[o + 1] = src[q + 1];
        out[o + 2] = src[q + 2];
        out[o + 3] = 255;
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

  window.ColorMapPresets = {
    Natural: { shadow: '#000000', mid: '#808080', high: '#ffffff' },
    Vaporwave: { shadow: '#0f0632', mid: '#e13caf', high: '#6eeaff' },
    Synthwave: { shadow: '#0c0828', mid: '#e42d7d', high: '#ffe7aa' },
    Cyberpunk: { shadow: '#00aac8', mid: '#8073c9', high: '#ff3cbe' },
    Sunset: { shadow: '#263626', mid: '#a82c5c', high: '#f4ac8a' },
    'Teal & Gold': { shadow: '#0e545c', mid: '#86886a', high: '#ffbc70' },
    Pastel: { shadow: '#bab4f2', mid: '#dcd2df', high: '#fff0cd' },
    'Sepia': { shadow: '#140d07', mid: '#ad9a78', high: '#ffefdf' },
    Thermal: { shadow: '#0a0028', mid: '#ff9d00', high: '#ffffff' },
    'Cotton Candy': { shadow: '#1e1250', mid: '#ff50aa', high: '#ffdcf0' },
    Emerald: { shadow: '#03150f', mid: '#0f9d6c', high: '#d8ffe9' },
    Ice: { shadow: '#0a1230', mid: '#4aa8d8', high: '#f2fbff' },
    'Black & White': { shadow: '#000000', mid: '#3d3d3d', high: '#ffffff' },
    Greyscale: { shadow: '#000000', mid: '#808080', high: '#ffffff' },
    'Flat Illustration': { shadow: '#2e6d8b', mid: '#9f536b', high: '#d2f8fa' }
  };

  const DEFAULT_COLORMAP = window.ColorMapPresets.Vaporwave;

  const PRESET_SUNSET = window.ColorMapPresets.Sunset;
  const PRESET_TEAL_GOLD = window.ColorMapPresets['Teal & Gold'];

  window.applyColorMap = function (data, w, h, s, cols) {
    const c = cols || DEFAULT_COLORMAP;
    const lut = buildLutFromColors(c.shadow, c.mid, c.high);
    const out = new Uint8ClampedArray(data.length);
    applyLUT(data, out, lut);
    mixWithOriginal(out, data, s);
    return out;
  };

  function maxFilterF32(src, w, h, r) {
    const tmp = new Float32Array(src.length);
    const out = new Float32Array(src.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let m = 0;
        for (let k = -r; k <= r; k++) {
          const v = src[y * w + clamp(x + k, 0, w - 1)];
          if (v > m) m = v;
        }
        tmp[y * w + x] = m;
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let m = 0;
        for (let k = -r; k <= r; k++) {
          const v = tmp[clamp(y + k, 0, h - 1) * w + x];
          if (v > m) m = v;
        }
        out[y * w + x] = m;
      }
    }
    return out;
  }

  function subjectMask(src, w, h) {
    const len = w * h;
    const minDim = Math.min(w, h);
    const gray = grayF32(src, w, h);
    const mag = sobelMag(gray, w, h);
    const spread = Math.max(3, Math.round(minDim * 0.012));
    const detail = boxBlurF32(mag, w, h, spread, 2);
    let mean = 0;
    for (let i = 0; i < len; i++) mean += detail[i];
    mean /= len;
    const t = clamp(mean * 1.7, 9, 70);
    const raw = new Float32Array(len);
    let sx = 0, sy = 0, sw = 0;
    for (let i = 0; i < len; i++) {
      const v = clamp((detail[i] - t) / (t * 1.6), 0, 1);
      raw[i] = v;
      if (v > 0.25) {
        sx += (i % w) * v;
        sy += ((i / w) | 0) * v;
        sw += v;
      }
    }
    const grow = Math.max(2, Math.round(minDim * 0.009));
    const grown = maxFilterF32(raw, w, h, grow);
    const mask = boxBlurF32(grown, w, h, Math.max(3, Math.round(grow * 1.4)), 2);
    let cx = (w - 1) / 2;
    let cy = (h - 1) / 2;
    if (sw > len * 0.0005) {
      cx = clamp(sx / sw, w * 0.18, w * 0.82);
      cy = clamp(sy / sw, h * 0.18, h * 0.82);
    }
    return { mask, cx, cy };
  }

  function pondSwirl(src, w, h, centre, mask, spinAmt, ringAmt) {
    const out = new Uint8ClampedArray(src.length);
    if (spinAmt <= 0 && ringAmt <= 0) {
      out.set(src);
      return out;
    }
    const cx = centre.cx;
    const cy = centre.cy;
    const minDim = Math.min(w, h);
    let maxD = 1;
    const corners = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]];
    for (const c of corners) {
      const dx = c[0] - cx;
      const dy = c[1] - cy;
      maxD = Math.max(maxD, Math.sqrt(dx * dx + dy * dy));
    }
    const maxArc = 1.05 * spinAmt;
    const lambda = Math.max(26, minDim / 4.5);
    const rippleAmp = ringAmt * minDim * 0.02;
    const bandAmp = ringAmt * 0.11;
    const wob = rippleAmp > 0.001;
    const core = Math.max(6, minDim * 0.05);
    for (let y = 0; y < h; y++) {
      const dy = y - cy;
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const o = idx * 4;
        const keep = mask ? clamp(mask[idx], 0, 1) : 0;
        if (keep > 0.995) {
          out[o] = src[o];
          out[o + 1] = src[o + 1];
          out[o + 2] = src[o + 2];
          out[o + 3] = 255;
          continue;
        }
        const dx = x - cx;
        const r = Math.sqrt(dx * dx + dy * dy);
        const arc = maxArc * Math.min(1, r / core);
        if (arc < 0.015 && !wob) {
          out[o] = src[o];
          out[o + 1] = src[o + 1];
          out[o + 2] = src[o + 2];
          out[o + 3] = 255;
          continue;
        }
        const theta = Math.atan2(dy, dx);
        const K = Math.max(2, Math.min(40, Math.round(arc / 0.028)));
        const phase = (r / lambda) * Math.PI * 2;
        let sr = 0, sg = 0, sb = 0;
        for (let k = 0; k < K; k++) {
          const f = k / (K - 1) - 0.5;
          const ang = theta + arc * f;
          const rr = r + (wob ? rippleAmp * Math.sin(phase + f * Math.PI) : 0);
          const sx = clamp(Math.round(cx + Math.cos(ang) * rr), 0, w - 1);
          const sy = clamp(Math.round(cy + Math.sin(ang) * rr), 0, h - 1);
          const q = (sy * w + sx) * 4;
          sr += src[q];
          sg += src[q + 1];
          sb += src[q + 2];
        }
        let br = sr / K;
        let bg = sg / K;
        let bb = sb / K;
        if (bandAmp > 0.001) {
          const fall = Math.min(1, r / core);
          const band = 1 + bandAmp * Math.cos(phase) * fall;
          br *= band;
          bg *= band;
          bb *= band;
        }
        const inv = 1 - keep;
        out[o] = src[o] * keep + br * inv;
        out[o + 1] = src[o + 1] * keep + bg * inv;
        out[o + 2] = src[o + 2] * keep + bb * inv;
        out[o + 3] = 255;
      }
    }
    return out;
  }

  function edgeSoften(src, w, h, centre, mask, amt) {
    const out = new Uint8ClampedArray(src);
    if (amt <= 0) return out;
    const minDim = Math.min(w, h);
    const blur = boxBlurRGBA(src, w, h, Math.max(4, Math.round(minDim * 0.02)), 2);
    const cs = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]];
    let maxD = 1;
    for (const c of cs) {
      const dx = c[0] - centre.cx;
      const dy = c[1] - centre.cy;
      maxD = Math.max(maxD, Math.sqrt(dx * dx + dy * dy));
    }
    for (let y = 0; y < h; y++) {
      const dy = y - centre.cy;
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const o = idx * 4;
        const keep = clamp(mask[idx], 0, 1);
        const dx = x - centre.cx;
        const d = Math.sqrt(dx * dx + dy * dy) / maxD;
        let f = clamp((d - 0.52) / 0.48, 0, 1);
        f = f * f * (3 - 2 * f) * amt * (1 - keep);
        if (f < 0.01) continue;
        out[o] += (blur[o] - out[o]) * f;
        out[o + 1] += (blur[o + 1] - out[o + 1]) * f;
        out[o + 2] += (blur[o + 2] - out[o + 2]) * f;
      }
    }
    return out;
  }

  function tealGoldGrade(src, amt) {
    const out = new Uint8ClampedArray(src.length);
    if (amt <= 0) {
      out.set(src);
      return out;
    }
    const TEAL = hexToRgb(PRESET_TEAL_GOLD.shadow);
    const GOLD = hexToRgb(PRESET_TEAL_GOLD.high);
    for (let i = 0; i < out.length; i += 4) {
      const r0 = src[i];
      const g0 = src[i + 1];
      const b0 = src[i + 2];
      const l = luma(r0, g0, b0) / 255;
      const ws = Math.pow(1 - l, 1.6) * amt * 0.55;
      const wh = Math.pow(l, 2.2) * amt * 0.5;
      let r = r0 + (TEAL[0] - r0) * ws + (GOLD[0] - r0) * wh;
      let g = g0 + (TEAL[1] - g0) * ws + (GOLD[1] - g0) * wh;
      let b = b0 + (TEAL[2] - b0) * ws + (GOLD[2] - b0) * wh;
      const dom = b0 - Math.max(r0, g0);
      if (dom > 8) {
        const k = Math.min(1, dom / 110) * amt * 0.65;
        g += (b0 * 0.75 - g) * k;
        b += (b0 * 0.85 - b) * k;
      }
      const l2 = luma(r, g, b);
      const sat = 1 + 0.14 * amt;
      r = l2 + (r - l2) * sat;
      g = l2 + (g - l2) * sat;
      b = l2 + (b - l2) * sat;
      let f = clamp(r / 255, 0, 1);
      let s = f * f * (3 - 2 * f);
      r = (f + (s - f) * 0.3) * 255;
      f = clamp(g / 255, 0, 1);
      s = f * f * (3 - 2 * f);
      g = (f + (s - f) * 0.3) * 255;
      f = clamp(b / 255, 0, 1);
      s = f * f * (3 - 2 * f);
      b = (f + (s - f) * 0.3) * 255;
      out[i] = r;
      out[i + 1] = g;
      out[i + 2] = b;
      out[i + 3] = 255;
    }
    return out;
  }

  function warmCornerGlow(src, w, h, amt) {
    const out = new Uint8ClampedArray(src);
    if (amt <= 0) return out;
    const cx = (w - 1) / 2;
    const cy = (h - 1) / 2;
    const sigma2 = cx * cx + cy * cy || 1;
    const GC = [255, 176, 96];
    const corners = [
      [0, 0, 1.15],
      [w - 1, 0, 0.45],
      [0, h - 1, 0.55],
      [w - 1, h - 1, 0.3]
    ];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let field = 0;
        for (let ci = 0; ci < 4; ci++) {
          const cdx = x - corners[ci][0];
          const cdy = y - corners[ci][1];
          field += corners[ci][2] * Math.exp(-(cdx * cdx + cdy * cdy) / (sigma2 * 0.42));
        }
        if (field < 0.02) continue;
        const f = Math.min(field, 1.25) * amt * 0.7;
        const o = (y * w + x) * 4;
        for (let c = 0; c < 3; c++) {
          const add = Math.min(255, GC[c] * f);
          out[o + c] = 255 - ((255 - out[o + c]) * (255 - add)) / 255;
        }
      }
    }
    return out;
  }

  window.defaultFilterParams = function (f) {
    const p = {};
    if (f.params) for (const d of f.params) p[d.key] = d.value;
    return p;
  };

  window.Filters = [
    {
      id: 'ink-sketch',
      name: 'Ink Sketch',
      params: [
        { key: 'detail', label: 'Detail', min: 2, max: 14, step: 1, value: 11, primary: true },
        { key: 'lines', label: 'Ink lines', min: 0, max: 100, value: 60 },
        { key: 'threshold', label: 'Edge threshold', min: 40, max: 160, value: 78 },
        { key: 'lineWeight', label: 'Line weight', min: 1, max: 4, step: 1, value: 3 }
      ],
      apply(data, w, h, p) {
        const gray = grayF32(data, w, h);
        const sketch = dodgeSketch(gray, w, h, Math.max(2, Math.round(p.detail)), 0.4, 0.6);
        let vals = sketch;
        const lineAmt = (p.lines == null ? 60 : p.lines) / 100;
        if (lineAmt > 0) {
          const mag = sobelMag(gray, w, h);
          const t = p.threshold;
          const soft = new Float32Array(gray.length);
          for (let i = 0; i < gray.length; i++) {
            const e = clamp((mag[i] - t) / (280 - t), 0, 1);
            soft[i] = 255 - e * 255;
          }
          const linesArr = minFilterF32(soft, w, h, Math.max(1, Math.round(p.lineWeight)));
          vals = new Float32Array(sketch.length);
          for (let i = 0; i < vals.length; i++) {
            vals[i] = sketch[i] * ((1 - lineAmt) + lineAmt * (0.12 + 0.88 * (linesArr[i] / 255)));
          }
        }
        return tintBySketch(data, vals);
      }
    },
    {
      id: 'neon-edges',
      name: 'Neon Edges',
      params: [
        { key: 'threshold', label: 'Edge threshold', min: 30, max: 130, value: 64 },
        { key: 'glow', label: 'Glow', min: 2, max: 24, step: 1, value: 15, primary: true },
        { key: 'bgLevel', label: 'Background', min: 0, max: 60, value: 22 }
      ],
      apply(data, w, h, p) {
        const gray = grayF32(data, w, h);
        const mag = sobelMag(gray, w, h);
        const t = p.threshold;
        const bgLevel = p.bgLevel / 100;
        const base = new Uint8ClampedArray(data.length);
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
        const glow = boxBlurRGBA(base, w, h, Math.max(2, Math.round(p.glow)), 2);
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
      params: [
        { key: 'brush', label: 'Brush size', min: 2, max: 8, step: 1, value: 5, primary: true }
      ],
      apply(data, w, h, p) {
        return kuwahara(data, w, h, Math.max(1, Math.round(p.brush)));
      }
    },
    {
      id: 'glitch',
      name: 'Glitch',
      maxPixels: 480000,
      params: [
        { key: 'brush', label: 'Painterly', min: 1, max: 8, step: 1, value: 4 },
        { key: 'glow', label: 'Glow', min: 0, max: 100, value: 60 },
        { key: 'smear', label: 'Smear bands', min: 0, max: 100, value: 50 },
        { key: 'glitch', label: 'Glitch', min: 0, max: 100, value: 60, primary: true },
        { key: 'seed', label: 'Seed', min: 0, max: 999, step: 1, value: 42 },
        { key: 'blend', label: 'Intensity', min: 0, max: 100, value: 90 }
      ],
      apply(data, w, h, p) {
        const minDim = Math.min(w, h);
        const rand = mulberry32(Math.round(p.seed) || 1);

        let cur = painterlySmooth(data, w, h, p.brush);

        const glowAmt = p.glow / 100;
        if (glowAmt > 0) {
          const brights = new Uint8ClampedArray(cur.length);
          for (let i = 0; i < brights.length; i += 4) {
            if (luma(cur[i], cur[i + 1], cur[i + 2]) >= 185) {
              brights[i] = cur[i];
              brights[i + 1] = cur[i + 1];
              brights[i + 2] = cur[i + 2];
            }
            brights[i + 3] = 255;
          }
          const blur = boxBlurRGBA(brights, w, h, Math.max(4, Math.round(minDim * 0.03)), 2);
          screenBlend(cur, blur, 0.55 * glowAmt);
        }

        const smearAmt = p.smear / 100;
        if (smearAmt > 0) {
          const n = 2 + Math.round(8 * smearAmt);
          for (let k = 0; k < n; k++) {
            const sy = Math.floor(rand() * Math.max(1, h - 4));
            const bh = Math.max(3, Math.round(minDim * (0.01 + rand() * 0.04)));
            const kr = Math.max(4, Math.round(w * (0.04 + 0.1 * rand())));
            const bandAlpha = 0.4 + 0.4 * rand();
            const pre = new Float64Array((w + 1) * 3);
            for (let y = sy; y < Math.min(sy + bh, h); y++) {
              pre.fill(0);
              for (let x = 0; x < w; x++) {
                const o = (y * w + x) * 4;
                pre[(x + 1) * 3] = pre[x * 3] + cur[o];
                pre[(x + 1) * 3 + 1] = pre[x * 3 + 1] + cur[o + 1];
                pre[(x + 1) * 3 + 2] = pre[x * 3 + 2] + cur[o + 2];
              }
              for (let x = 0; x < w; x++) {
                const x0 = Math.max(0, x - kr);
                const x1 = Math.min(w - 1, x + kr);
                const cnt = x1 - x0 + 1;
                const o = (y * w + x) * 4;
                const b0 = x0 * 3;
                const b1 = (x1 + 1) * 3;
                cur[o] += ((pre[b1] - pre[b0]) / cnt - cur[o]) * bandAlpha;
                cur[o + 1] += ((pre[b1 + 1] - pre[b0 + 1]) / cnt - cur[o + 1]) * bandAlpha;
                cur[o + 2] += ((pre[b1 + 2] - pre[b0 + 2]) / cnt - cur[o + 2]) * bandAlpha;
              }
            }
          }
        }

        const gAmt = p.glitch / 100;
        if (gAmt > 0) {
          const out = new Uint8ClampedArray(cur);
          bandGlitch(out, w, h, rand, 2 + Math.round(16 * gAmt), 6 + 90 * gAmt, 0.25,
            [[255, 150, 90], [30, 90, 70]]);
          cur = out;
        }

        cur = vignette(cur, w, h, 0.35, 0.65);
        mixWithOriginal(cur, data, 0.3 + 0.7 * (p.blend / 100));
        return cur;
      }
    },
    {
      id: 'pixel-art',
      name: 'Pixel Art',
      params: [
        { key: 'blockSize', label: 'Block size', min: 3, max: 24, step: 1, value: 13, primary: true }
      ],
      apply(data, w, h, p) {
        return pixelate(data, w, h, Math.max(3, Math.round(p.blockSize)), 6);
      }
    },
    {
      id: 'halftone',
      name: 'Halftone',
      params: [
        { key: 'dotSize', label: 'Dot size', min: 4, max: 20, step: 1, value: 11, primary: true }
      ],
      apply(data, w, h, p) {
        return halftone(data, w, h, Math.max(4, Math.round(p.dotSize)));
      }
    },
    {
      id: 'saturate',
      name: 'Saturate',
      params: [
        { key: 'amount', label: 'Amount', min: 0, max: 200, value: 120, primary: true }
      ],
      apply(data, w, h, p) {
        const out = new Uint8ClampedArray(data);
        saturate(out, p.amount / 100);
        return out;
      }
    },
    {
      id: 'posterize',
      name: 'Posterize',
      params: [
        { key: 'levels', label: 'Levels', min: 2, max: 8, step: 1, value: 4 },
        { key: 'warmth', label: 'Warmth', min: 0, max: 100, value: 50 },
        { key: 'blend', label: 'Intensity', min: 0, max: 100, value: 80, primary: true }
      ],
      apply(data, w, h, p) {
        const out = new Uint8ClampedArray(data);
        posterize(out, Math.max(2, Math.round(p.levels)));
        saturate(out, 1.15);
        contrastSCurve(out, 0.45);
        const warm = p.warmth / 100;
        const rgain = 1 + 0.16 * warm;
        const bgain = 1 - 0.2 * warm;
        for (let i = 0; i < out.length; i += 4) {
          out[i] = out[i] * rgain;
          out[i + 2] = out[i + 2] * bgain;
        }
        mixWithOriginal(out, data, 0.4 + 0.6 * (p.blend / 100));
        return out;
      }
    },
    {
      id: 'blur',
      name: 'Blur',
      params: [
        { key: 'radius', label: 'Radius', min: 2, max: 40, step: 1, value: 10, primary: true },
        { key: 'softness', label: 'Softness', min: 1, max: 4, step: 1, value: 3 }
      ],
      apply(data, w, h, p) {
        return boxBlurRGBA(data, w, h, Math.max(1, Math.round(p.radius)), Math.max(1, Math.round(p.softness)));
      }
    },
    {
      id: 'sharpen',
      name: 'Sharpen',
      params: [
        { key: 'amount', label: 'Amount', min: 0, max: 100, value: 55, primary: true },
        { key: 'radius', label: 'Radius', min: 1, max: 6, step: 1, value: 2 }
      ],
      apply(data, w, h, p) {
        return unsharp(data, w, h, p.radius, p.amount / 50);
      }
    },
    {
      id: 'vignette',
      name: 'Vignette',
      params: [
        { key: 'amount', label: 'Amount', min: 0, max: 100, value: 65, primary: true },
        { key: 'feather', label: 'Feather', min: 10, max: 100, value: 60 }
      ],
      apply(data, w, h, p) {
        return vignette(data, w, h, p.amount / 100, p.feather / 100);
      }
    },
    {
      id: 'film-grain',
      name: 'Film Grain',
      params: [
        { key: 'amount', label: 'Amount', min: 0, max: 100, value: 45, primary: true },
        { key: 'seed', label: 'Seed', min: 0, max: 999, step: 1, value: 7 }
      ],
      apply(data, w, h, p) {
        return filmGrain(data, w, h, p.amount / 100, p.seed);
      }
    },
    {
      id: 'chromatic',
      name: 'Chromatic Aberration',
      params: [
        { key: 'offset', label: 'Offset', min: 0, max: 30, step: 1, value: 9, primary: true }
      ],
      apply(data, w, h, p) {
        return chromaticAberration(data, w, h, p.offset);
      }
    },
    {
      id: 'wave-warp',
      name: 'Wave Warp',
      params: [
        { key: 'amplitude', label: 'Amplitude', min: 0, max: 40, step: 1, value: 14, primary: true },
        { key: 'wavelength', label: 'Wavelength', min: 16, max: 240, step: 1, value: 90 }
      ],
      apply(data, w, h, p) {
        return waveWarp(data, w, h, p.amplitude, p.wavelength);
      }
    },
    {
      id: 'swirl',
      name: 'Swirl',
      maxPixels: 480000,
      params: [
        { key: 'spin', label: 'Spin', min: 0, max: 100, value: 55, primary: true },
        { key: 'rings', label: 'Ripples', min: 0, max: 100, value: 60 },
        { key: 'soft', label: 'Edge soften', min: 0, max: 100, value: 45 }
      ],
      apply(data, w, h, p) {
        const spin = p.spin / 100;
        const rings = p.rings / 100;
        const soft = p.soft / 100;
        let cur = data;
        let centre = { cx: (w - 1) / 2, cy: (h - 1) / 2 };
        let mask = null;
        if (spin > 0 || rings > 0 || soft > 0) {
          const m = subjectMask(cur, w, h);
          mask = m.mask;
          centre = m;
        }
        cur = pondSwirl(cur, w, h, centre, mask, spin, rings);
        cur = edgeSoften(cur, w, h, centre, mask, soft);
        return cur;
      }
    },
    {
      id: 'brighten',
      name: 'Brighten',
      params: [
        { key: 'grade', label: 'Warm grade', min: 0, max: 100, value: 70, primary: true },
        { key: 'glow', label: 'Corner glow', min: 0, max: 100, value: 65 }
      ],
      apply(data, w, h, p) {
        let cur = tealGoldGrade(data, p.grade / 100);
        return warmCornerGlow(cur, w, h, p.glow / 100);
      }
    }
  ];

  // ---------- OpenCV.js-backed style (vendored wasm, loads async) ----------

  // Palette sampled from the reference illustration, dark -> light (RGB).
  const FLAT_RAMP = [
    [5, 5, 5], [46, 109, 139], [159, 83, 107],
    [57, 186, 207], [209, 146, 142], [210, 248, 250]
  ];

  function rampAt(t) {
    const n = FLAT_RAMP.length - 1;
    const x = clamp(t, 0, 1) * n;
    const i = Math.min(n - 1, Math.floor(x));
    const f = x - i;
    const a = FLAT_RAMP[i];
    const b = FLAT_RAMP[i + 1];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  }

  function flatIllustration(data, w, h, p) {
    const cv = window.cv;
    if (!cv || !cv.Mat || typeof cv.kmeans !== 'function') {
      throw new Error('OpenCV.js is still loading');
    }

    const src = new cv.Mat(h, w, cv.CV_8UC4);
    src.data.set(data);
    const rgb = new cv.Mat();
    cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB);

    if (p.sat > 0) {
      const hsv = new cv.Mat();
      cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV);
      const hd = hsv.data;
      const k = 1 + p.sat / 100;
      for (let i = 1; i < hd.length; i += 3) {
        const s = hd[i] * k;
        hd[i] = s > 255 ? 255 : s;
      }
      cv.cvtColor(hsv, rgb, cv.COLOR_HSV2RGB);
      hsv.delete();
    }

    let a = rgb.clone();
    let b = new cv.Mat();
    const passes = Math.max(1, Math.round(p.smooth));
    for (let i = 0; i < passes; i++) {
      cv.bilateralFilter(a, b, 9, 75, 75, cv.BORDER_DEFAULT);
      const t = a;
      a = b;
      b = t;
    }

    const n = w * h;
    const samples = new cv.Mat(n, 3, cv.CV_32F);
    const sd = samples.data32F;
    const rd = a.data;
    for (let i = 0, j = 0; j < rd.length; i += 3, j += 3) {
      sd[i] = rd[j];
      sd[i + 1] = rd[j + 1];
      sd[i + 2] = rd[j + 2];
    }
    const K = Math.max(2, Math.round(p.colors));
    const labels = new cv.Mat();
    const centers = new cv.Mat();
    const crit = new cv.TermCriteria(cv.TERM_CRITERIA_EPS + cv.TERM_CRITERIA_MAX_ITER, 10, 1.0);
    cv.kmeans(samples, K, labels, crit, 3, cv.KMEANS_PP_CENTERS, centers);

    const cf = centers.data32F;
    const order = [];
    for (let i = 0; i < K; i++) order.push(i);
    order.sort((x, y) => {
      const lx = 0.299 * cf[x * 3] + 0.587 * cf[x * 3 + 1] + 0.114 * cf[x * 3 + 2];
      const ly = 0.299 * cf[y * 3] + 0.587 * cf[y * 3 + 1] + 0.114 * cf[y * 3 + 2];
      return lx - ly;
    });
    const rankOf = new Array(K);
    const pal = new Array(K);
    for (let r = 0; r < K; r++) {
      rankOf[order[r]] = r;
      pal[r] = rampAt(K > 1 ? r / (K - 1) : 0);
    }

    const gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.medianBlur(gray, gray, 5);
    cv.adaptiveThreshold(gray, gray, 255, cv.ADAPTIVE_THRESH_MEAN_C, cv.THRESH_BINARY, 11, 7);

    const out = new Uint8ClampedArray(data.length);
    const ld = labels.data32S;
    const gd = gray.data;
    const edgeMix = p.edges / 100;
    const ec = rampAt(0);
    for (let i = 0, px = 0; i < out.length; i += 4, px++) {
      const c = pal[rankOf[ld[px]]];
      let r = c[0];
      let g = c[1];
      let bl = c[2];
      if (edgeMix > 0 && gd[px] === 0) {
        r += (ec[0] - r) * edgeMix;
        g += (ec[1] - g) * edgeMix;
        bl += (ec[2] - bl) * edgeMix;
      }
      out[i] = r;
      out[i + 1] = g;
      out[i + 2] = bl;
      out[i + 3] = 255;
    }

    src.delete();
    rgb.delete();
    a.delete();
    b.delete();
    samples.delete();
    labels.delete();
    centers.delete();
    gray.delete();
    return out;
  }

  window.Filters.push({
    id: 'flat-illustration',
    name: 'Flat Illustration',
    maxPixels: 480000,
    params: [
      { key: 'colors', label: 'Colors', min: 2, max: 10, step: 1, value: 6, primary: true },
      { key: 'sat', label: 'Saturation', min: 0, max: 200, value: 60 },
      { key: 'smooth', label: 'Smooth', min: 1, max: 5, step: 1, value: 3 },
      { key: 'edges', label: 'Edges', min: 0, max: 100, value: 70 }
    ],
    apply(data, w, h, p) {
      return flatIllustration(data, w, h, p);
    }
  });

  (function loadOpenCV() {
    function ready() {
      window.cvReady = true;
      window.dispatchEvent(new CustomEvent('filters:ready'));
    }
    function poll() {
      if (window.cv && typeof window.cv.kmeans === 'function') {
        ready();
        return;
      }
      setTimeout(poll, 150);
    }
    const s = document.createElement('script');
    s.src = 'js/vendor/opencv.js';
    s.async = true;
    s.onerror = function () {
      console.warn('opencv.js failed to load - Flat Illustration unavailable');
    };
    document.head.appendChild(s);
    poll();
  })();
})();
