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
    Neutral: { _neutral: true, shadow: '#000000', mid: '#808080', high: '#ffffff' },
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
    Riso: { shadow: '#2e6d8b', mid: '#9f536b', high: '#d2f8fa' },
    // Alloys — the midtone carries the colour and the top end burns out to the
    // light rather than to the metal, which is how a casting actually reads.
    // Brass is the duller, greener yellow; gold the richer, warmer one.
    Brass: { shadow: '#0f0c04', mid: '#9d7d24', high: '#f7e9b8' },
    Gold: { shadow: '#170d01', mid: '#d29708', high: '#fff3bd' },
    Copper: { shadow: '#120502', mid: '#9c4622', high: '#ffd9b0' },
    Pewter: { shadow: '#0b0c0c', mid: '#5a5c58', high: '#e2e4e0' },
    Silver: { shadow: '#090c12', mid: '#7c8794', high: '#ffffff' }
  };

  const DEFAULT_COLORMAP = window.ColorMapPresets.Vaporwave;

  const PRESET_SUNSET = window.ColorMapPresets.Sunset;
  const PRESET_TEAL_GOLD = window.ColorMapPresets['Teal & Gold'];

  window.applyColorMap = function (data, w, h, s, cols) {
    const c = cols || DEFAULT_COLORMAP;
    if (c.identity) return new Uint8ClampedArray(data);
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

  // ---------- bas relief ----------

  // Percentile black/white points, so a flat or dark photo still fills the ramp.
  function levelBounds(gray, pct) {
    const hist = new Uint32Array(256);
    for (let i = 0; i < gray.length; i++) hist[clamp(gray[i], 0, 255) | 0]++;
    const cut = gray.length * pct;
    let acc = 0;
    let lo = 0;
    let hi = 255;
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (acc > cut) { lo = v; break; }
    }
    acc = 0;
    for (let v = 255; v >= 0; v--) {
      acc += hist[v];
      if (acc > cut) { hi = v; break; }
    }
    if (hi - lo < 16) { lo = 0; hi = 255; }
    return [lo, hi];
  }

  function sobelXY(gray, w, h) {
    const gx = new Float32Array(w * h);
    const gy = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        gx[i] =
          gray[i - w + 1] + 2 * gray[i + 1] + gray[i + w + 1] -
          (gray[i - w - 1] + 2 * gray[i - 1] + gray[i + w - 1]);
        gy[i] =
          gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1] -
          (gray[i - w - 1] + 2 * gray[i - w] + gray[i - w + 1]);
      }
    }
    return [gx, gy];
  }

  // Blurred noise normalised to -1..1: big radius gives patina blotches,
  // radius 1 gives the fine casting speckle.
  function mottle(w, h, seed, radius) {
    const rnd = mulberry32(seed);
    const n = new Float32Array(w * h);
    for (let i = 0; i < n.length; i++) n[i] = rnd();
    const b = boxBlurF32(n, w, h, radius, 3);
    let mn = Infinity;
    let mx = -Infinity;
    for (let i = 0; i < b.length; i++) {
      if (b[i] < mn) mn = b[i];
      if (b[i] > mx) mx = b[i];
    }
    const span = mx - mn || 1;
    for (let i = 0; i < b.length; i++) b[i] = ((b[i] - mn) / span) * 2 - 1;
    return b;
  }

  // Read the photo's brightness as a height field, take surface normals off it
  // and relight them: a raking key light, a hard sky/ground reflection and a
  // tight specular. What comes back is the picture as a struck surface, in
  // neutral grey — put an alloy from the colour map over it to cast it.
  function basRelief(src, w, h, p) {
    const polish = (p.polish == null ? 62 : p.polish) / 100;
    const relief = (p.relief == null ? 58 : p.relief) / 100;
    const patina = (p.patina == null ? 38 : p.patina) / 100;

    const gray = grayF32(src, w, h);
    const bounds = levelBounds(gray, 0.015);
    const scale = 255 / Math.max(1, bounds[1] - bounds[0]);
    const v = new Float32Array(gray.length);
    for (let i = 0; i < v.length; i++) v[i] = clamp((gray[i] - bounds[0]) * scale, 0, 255);

    // A casting loses the photograph's micro-texture; the form is what survives,
    // and the more polished the metal the less of it is left.
    const unit = Math.max(1, Math.round(Math.min(w, h) / 260));
    const hgt = boxBlurF32(v, w, h, Math.max(1, Math.round(unit * (1 + polish * 3.2))), 3);
    const g = sobelXY(hgt, w, h);
    const gx = g[0];
    const gy = g[1];
    const bump = (0.004 + relief * 0.026) / 8;

    // Key light up and to the left, viewer straight on, halfway vector for the
    // specular. Sharper metal wants a tighter, brighter highlight.
    const LX = -0.42, LY = -0.50, LZ = 0.76;
    const HX = -0.224, HY = -0.266, HZ = 0.938;
    const shine = 4 + polish * 30;
    const specAmt = 0.55 + polish * 1.5;
    const body = new Float32Array(v.length);
    const gloss = new Float32Array(v.length);

    for (let i = 0; i < v.length; i++) {
      const nx0 = clamp(-gx[i] * bump, -2.5, 2.5);
      const ny0 = clamp(-gy[i] * bump, -2.5, 2.5);
      const inv = 1 / Math.sqrt(nx0 * nx0 + ny0 * ny0 + 1);
      const nx = nx0 * inv;
      const ny = ny0 * inv;
      const nz = inv;

      // Sky above, ground below, with a hard horizon — the reflection is what
      // makes a surface read as metal rather than as plastic.
      let e = clamp(0.5 - ny * 1.6, 0, 1);
      e = e * e * (3 - 2 * e);
      // Burnished metal reflects the world in steps, not in a smooth gradient.
      e += (Math.round(e * 3) / 3 - e) * (polish * 0.5);

      const diff = Math.max(0, nx * LX + ny * LY + nz * LZ);
      const sd = Math.max(0, nx * HX + ny * HY + nz * HZ);

      // Sheen gathers on the slopes and leaves the flats alone, so the bright
      // line runs along the contours the way it does on a cast edge.
      const slope = Math.sqrt(nx0 * nx0 + ny0 * ny0);
      const edge = slope / (0.55 + slope);
      const sheen = edge * edge * e;

      // Albedo carries the picture, the shading carries the metal — keep the
      // first in charge or the subject dissolves into a puddle.
      const alb = 0.18 + 0.82 * (hgt[i] / 255);
      const lit = 0.16 + 0.44 * e + 0.44 * diff;
      body[i] = alb * lit * 255;
      gloss[i] = (Math.pow(sd, shine) * specAmt + sheen * (0.12 + polish * 0.5)) * (0.4 + 0.6 * alb);
    }

    // Re-centre on the metal's midtone so a bright photo and a dark one both
    // cast as the same alloy, then firm up the contrast.
    let mean = 0;
    for (let i = 0; i < body.length; i++) mean += body[i];
    mean /= body.length || 1;
    const contrast = 1.5 + polish * 0.6;
    for (let i = 0; i < body.length; i++) {
      // Stretch about the midtone, then roll the tails off so a smooth subject
      // still gets some bite without the shoulders clipping to slabs.
      const f = clamp(((body[i] - mean) * contrast + 104) / 255, 0, 1);
      body[i] = (f + (f * f * (3 - 2 * f) - f) * 0.45) * 255;
    }

    if (patina > 0) {
      const blot = mottle(w, h, 0x9e3779b9, Math.max(4, Math.round(Math.min(w, h) / 22)));
      const grit = mottle(w, h, 0x51633e2d, 1);
      for (let i = 0; i < body.length; i++) {
        // Tarnish settles in the recesses, not on the burnished high points.
        const shade = 1 - clamp(body[i] / 255, 0, 1) * 0.6;
        body[i] += (blot[i] * 30 * shade + grit[i] * 10) * patina;
        gloss[i] *= 1 - patina * 0.35 * clamp(0.5 + blot[i] * 0.5, 0, 1);
      }
    }

    // A little of the photograph's fine detail back on top, as tool marks.
    const detail = 0.55 * (1 - polish * 0.55);
    const out = new Uint8ClampedArray(src.length);
    for (let i = 0, o = 0; i < v.length; i++, o += 4) {
      const l = clamp(body[i] + (v[i] - hgt[i]) * detail, 0, 255);
      const s = clamp(gloss[i], 0, 1);
      // The highlight burns to white here so a colour map's top stop decides
      // what colour the light on the surface ends up being.
      const g2 = l + (255 - l) * s;
      out[o] = g2;
      out[o + 1] = g2;
      out[o + 2] = g2;
      out[o + 3] = 255;
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
      id: 'bas-relief',
      name: 'Bas Relief',
      params: [
        { key: 'relief', label: 'Depth', min: 0, max: 100, value: 58, primary: true },
        { key: 'polish', label: 'Polish', min: 0, max: 100, value: 62 },
        { key: 'patina', label: 'Patina', min: 0, max: 100, value: 38 }
      ],
      apply(data, w, h, p) {
        return basRelief(data, w, h, p);
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

    // k-means has already found the picture's own colours, so paint with them.
    // They used to be read only for their brightness order and then replaced by
    // a fixed ramp, which came out blue and pink whatever went in.
    const cf = centers.data32F;
    const pal = new Array(K);
    let ec = [0, 0, 0];
    let darkest = Infinity;
    for (let i = 0; i < K; i++) {
      const c = [cf[i * 3], cf[i * 3 + 1], cf[i * 3 + 2]];
      pal[i] = c;
      const l = luma(c[0], c[1], c[2]);
      if (l < darkest) {
        darkest = l;
        // Outlines take the darkest colour in the picture, deepened so the
        // lines still read as lines against the flat it sits next to.
        ec = [c[0] * 0.4, c[1] * 0.4, c[2] * 0.4];
      }
    }

    const gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.medianBlur(gray, gray, 5);
    cv.adaptiveThreshold(gray, gray, 255, cv.ADAPTIVE_THRESH_MEAN_C, cv.THRESH_BINARY, 11, 7);

    const out = new Uint8ClampedArray(data.length);
    const ld = labels.data32S;
    const gd = gray.data;
    const edgeMix = p.edges / 100;
    for (let i = 0, px = 0; i < out.length; i += 4, px++) {
      const c = pal[ld[px]];
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

  // ---------- second batch: adjustments, optics, print and geometry ----------
  //
  // Appended as its own section so the original styles above are untouched.
  // Anything here that needs OpenCV falls back to a plain-JS approximation
  // rather than throwing, so the style thumbnails are right before the wasm
  // has finished loading.

  const TAU = Math.PI * 2;

  function newCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  function cvIsReady() {
    const cv = window.cv;
    return !!(cv && cv.Mat && typeof cv.cvtColor === 'function');
  }

  function matFromRGBA(cv, src, w, h) {
    const m = new cv.Mat(h, w, cv.CV_8UC4);
    m.data.set(src);
    return m;
  }

  function rgbMatToRGBA(mat, w, h) {
    const out = new Uint8ClampedArray(w * h * 4);
    const d = mat.data;
    for (let i = 0, j = 0; i < out.length; i += 4, j += 3) {
      out[i] = d[j];
      out[i + 1] = d[j + 1];
      out[i + 2] = d[j + 2];
      out[i + 3] = 255;
    }
    return out;
  }

  // Bilinear sample with edge clamping - the workhorse for every warp below.
  function sampleAt(src, w, h, x, y, out, o) {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const xa = clamp(x0, 0, w - 1);
    const xb = clamp(x0 + 1, 0, w - 1);
    const ya = clamp(y0, 0, h - 1);
    const yb = clamp(y0 + 1, 0, h - 1);
    const i00 = (ya * w + xa) * 4;
    const i10 = (ya * w + xb) * 4;
    const i01 = (yb * w + xa) * 4;
    const i11 = (yb * w + xb) * 4;
    for (let c = 0; c < 3; c++) {
      const t = src[i00 + c] + (src[i10 + c] - src[i00 + c]) * fx;
      const b = src[i01 + c] + (src[i11 + c] - src[i01 + c]) * fx;
      out[o + c] = t + (b - t) * fy;
    }
    out[o + 3] = 255;
  }

  function applyChannelLUT(src, lr, lg, lb) {
    const out = new Uint8ClampedArray(src.length);
    for (let i = 0; i < src.length; i += 4) {
      out[i] = lr[src[i]];
      out[i + 1] = lg[src[i + 1]];
      out[i + 2] = lb[src[i + 2]];
      out[i + 3] = 255;
    }
    return out;
  }

  // Hue angle -> a unit RGB triple at full saturation.
  function hueColour(deg) {
    const h = ((((deg % 360) + 360) % 360) / 60);
    const x = 1 - Math.abs((h % 2) - 1);
    const table = [[1, x, 0], [x, 1, 0], [0, 1, x], [0, x, 1], [x, 0, 1], [1, 0, x]];
    return table[Math.floor(h) % 6];
  }

  // Turn a tint colour into a luma-preserving channel multiplier.
  function normTint(t, sat) {
    const l = luma(t[0], t[1], t[2]) || 1;
    return [
      1 + (t[0] / l - 1) * sat,
      1 + (t[1] / l - 1) * sat,
      1 + (t[2] / l - 1) * sat
    ];
  }

  // Stretch a luma buffer onto 0..255. The ink and screen styles below key off
  // absolute brightness, so without this they collapse on a dark photo.
  function normaliseGray(gray, amount) {
    const b = levelBounds(gray, 0.005);
    const span = Math.max(1, b[1] - b[0]);
    const out = new Float32Array(gray.length);
    for (let i = 0; i < gray.length; i++) {
      const t = clamp(((gray[i] - b[0]) / span) * 255, 0, 255);
      out[i] = gray[i] + (t - gray[i]) * amount;
    }
    return out;
  }

  function bayerMatrix(n) {
    let m = [[0, 2], [3, 1]];
    while (m.length < n) {
      const s = m.length;
      const nm = [];
      for (let y = 0; y < s * 2; y++) nm.push(new Array(s * 2).fill(0));
      for (let y = 0; y < s; y++) {
        for (let x = 0; x < s; x++) {
          const v = m[y][x] * 4;
          nm[y][x] = v;
          nm[y][x + s] = v + 2;
          nm[y + s][x] = v + 3;
          nm[y + s][x + s] = v + 1;
        }
      }
      m = nm;
    }
    return m;
  }

  // ---------- adjustments ----------

  function exposureAdjust(src, p) {
    const ev = Math.pow(2, p.exposure / 50);
    const c = p.contrast / 100;
    const k = c >= 0 ? 1 + c * 1.5 : 1 + c * 0.9;
    const lift = (p.black / 100) * 60;
    const lut = new Uint8ClampedArray(256);
    for (let v = 0; v < 256; v++) {
      let t = v * ev;
      t = (t - 128) * k + 128;
      lut[v] = lift + (t * (255 - lift)) / 255;
    }
    return applyChannelLUT(src, lut, lut, lut);
  }

  function whiteBalanceAdjust(src, p) {
    const t = p.temp / 100;
    const g = p.tint / 100;
    const keep = p.preserve / 100;
    const kr = 1 + 0.36 * t + 0.1 * g;
    const kg = 1 - 0.22 * g;
    const kb = 1 - 0.36 * t + 0.1 * g;
    const out = new Uint8ClampedArray(src.length);
    for (let i = 0; i < src.length; i += 4) {
      const l0 = luma(src[i], src[i + 1], src[i + 2]);
      let r = src[i] * kr;
      let gg = src[i + 1] * kg;
      let b = src[i + 2] * kb;
      if (keep > 0) {
        const l1 = luma(r, gg, b);
        const s = l1 > 1 ? 1 + (l0 / l1 - 1) * keep : 1;
        r *= s;
        gg *= s;
        b *= s;
      }
      out[i] = r;
      out[i + 1] = gg;
      out[i + 2] = b;
      out[i + 3] = 255;
    }
    return out;
  }

  function shadowsHighlights(src, p) {
    const sh = p.shadows / 100;
    const hi = p.highlights / 100;
    const gamma = Math.pow(2, -p.midtones / 100);
    const out = new Uint8ClampedArray(src.length);
    for (let i = 0; i < src.length; i += 4) {
      const l = luma(src[i], src[i + 1], src[i + 2]) / 255;
      const sm = (1 - l) * (1 - l);
      const hm = l * l;
      const gain = 1 + sh * sm * 1.4 + hi * hm * 0.9;
      const gl = Math.pow(clamp(l * gain, 0, 1), gamma);
      const s = l > 0.004 ? gl / l : gain;
      out[i] = src[i] * s;
      out[i + 1] = src[i + 1] * s;
      out[i + 2] = src[i + 2] * s;
      out[i + 3] = 255;
    }
    return out;
  }

  function levelsAdjust(src, p) {
    const lo = p.blackIn;
    const hi = Math.max(lo + 1, p.whiteIn);
    const gamma = Math.max(0.05, p.gamma / 100);
    const outLo = (p.outBlack / 100) * 255;
    const outHi = 255 - (p.outWhite / 100) * 255;
    const lut = new Uint8ClampedArray(256);
    for (let v = 0; v < 256; v++) {
      const t = Math.pow(clamp((v - lo) / (hi - lo), 0, 1), 1 / gamma);
      lut[v] = outLo + t * (outHi - outLo);
    }
    return applyChannelLUT(src, lut, lut, lut);
  }

  function autoLevels(src, w, h, p) {
    const amt = p.amount / 100;
    const colour = p.colour / 100;
    const pct = p.clip / 2000;
    const n = w * h;
    const chan = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
    for (let i = 0, j = 0; i < src.length; i += 4, j++) {
      chan[0][j] = src[i];
      chan[1][j] = src[i + 1];
      chan[2][j] = src[i + 2];
    }
    const gb = levelBounds(grayF32(src, w, h), pct);
    const luts = [];
    for (let c = 0; c < 3; c++) {
      const cb = levelBounds(chan[c], pct);
      const lo = gb[0] + (cb[0] - gb[0]) * colour;
      const hi = gb[1] + (cb[1] - gb[1]) * colour;
      const span = Math.max(1, hi - lo);
      const lut = new Uint8ClampedArray(256);
      for (let v = 0; v < 256; v++) {
        const s = clamp((v - lo) / span, 0, 1) * 255;
        lut[v] = v + (s - v) * amt;
      }
      luts.push(lut);
    }
    return applyChannelLUT(src, luts[0], luts[1], luts[2]);
  }

  // Plain-JS stand-in for CLAHE: unsharp mask at a large radius.
  function localContrast(src, w, h, p) {
    const amt = p.clarity / 100;
    const r = Math.max(2, Math.round(Math.min(w, h) / Math.max(2, p.tiles) / 2));
    const blur = boxBlurRGBA(src, w, h, r, 2);
    const out = new Uint8ClampedArray(src.length);
    for (let i = 0; i < src.length; i += 4) {
      for (let c = 0; c < 3; c++) out[i + c] = src[i + c] + (src[i + c] - blur[i + c]) * amt;
      out[i + 3] = 255;
    }
    return out;
  }

  // Real CLAHE on the L channel of Lab, which is what photo apps call "clarity".
  function claheClarity(src, w, h, p) {
    const cv = window.cv;
    if (!cvIsReady() || typeof cv.CLAHE !== 'function') return localContrast(src, w, h, p);
    let out;
    const m = matFromRGBA(cv, src, w, h);
    const rgb = new cv.Mat();
    const lab = new cv.Mat();
    const planes = new cv.MatVector();
    const dst = new cv.Mat();
    let clahe = null;
    try {
      cv.cvtColor(m, rgb, cv.COLOR_RGBA2RGB);
      cv.cvtColor(rgb, lab, cv.COLOR_RGB2Lab);
      cv.split(lab, planes);
      const tiles = Math.max(2, Math.round(p.tiles));
      clahe = new cv.CLAHE(Math.max(0.1, (p.clarity / 100) * 5), new cv.Size(tiles, tiles));
      clahe.apply(planes.get(0), dst);
      planes.set(0, dst);
      cv.merge(planes, lab);
      cv.cvtColor(lab, rgb, cv.COLOR_Lab2RGB);
      out = rgbMatToRGBA(rgb, w, h);
    } catch (err) {
      out = null;
    }
    if (clahe) clahe.delete();
    dst.delete();
    planes.delete();
    lab.delete();
    rgb.delete();
    m.delete();
    if (!out) return localContrast(src, w, h, p);
    if (p.structure > 0) unsharp(out, w, h, 6, p.structure / 100);
    return out;
  }

  // ---------- focus and blur ----------

  function tiltShift(src, w, h, p) {
    const r = Math.max(1, Math.round(p.blur));
    const blur = boxBlurRGBA(src, w, h, r, 3);
    const ang = (p.angle * Math.PI) / 180;
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const cx = w / 2;
    const cy = h * (p.position / 100);
    const band = Math.max(1, (p.band / 100) * Math.min(w, h) * 0.7);
    const feather = Math.max(1, band * 0.9 + 1);
    const out = new Uint8ClampedArray(src.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const d = Math.abs((x - cx) * sa + (y - cy) * ca);
        let t = clamp((d - band) / feather, 0, 1);
        t = t * t * (3 - 2 * t);
        const i = (y * w + x) * 4;
        for (let c = 0; c < 3; c++) out[i + c] = src[i + c] + (blur[i + c] - src[i + c]) * t;
        out[i + 3] = 255;
      }
    }
    if (p.pop > 0) saturate(out, 1 + p.pop / 100);
    return out;
  }

  function motionBlurFx(src, w, h, p) {
    const n = Math.max(1, Math.round(p.length));
    const ang = (p.angle * Math.PI) / 180;
    const dx = Math.cos(ang);
    const dy = Math.sin(ang);
    const out = new Uint8ClampedArray(src.length);
    const px = new Uint8ClampedArray(4);
    const m = 2 * n + 1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let r = 0;
        let g = 0;
        let b = 0;
        for (let k = -n; k <= n; k++) {
          sampleAt(src, w, h, x + dx * k, y + dy * k, px, 0);
          r += px[0];
          g += px[1];
          b += px[2];
        }
        const i = (y * w + x) * 4;
        out[i] = r / m;
        out[i + 1] = g / m;
        out[i + 2] = b / m;
        out[i + 3] = 255;
      }
    }
    return p.mix < 100 ? blendPair(src, out, p.mix / 100) : out;
  }

  function blendPair(base, top, t) {
    const out = new Uint8ClampedArray(base.length);
    for (let i = 0; i < base.length; i += 4) {
      out[i] = base[i] + (top[i] - base[i]) * t;
      out[i + 1] = base[i + 1] + (top[i + 1] - base[i + 1]) * t;
      out[i + 2] = base[i + 2] + (top[i + 2] - base[i + 2]) * t;
      out[i + 3] = 255;
    }
    return out;
  }

  function zoomBlurFx(src, w, h, p) {
    const amt = (p.amount / 100) * 0.3;
    const steps = 14;
    const cx = w / 2;
    const cy = h / 2;
    const guard = p.centre / 100;
    const maxR = Math.hypot(cx, cy);
    const out = new Uint8ClampedArray(src.length);
    const px = new Uint8ClampedArray(4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const rr = Math.hypot(dx, dy) / maxR;
        const wgt = clamp((rr - guard) / Math.max(0.001, 1 - guard), 0, 1);
        const i = (y * w + x) * 4;
        if (wgt <= 0.002) {
          out[i] = src[i];
          out[i + 1] = src[i + 1];
          out[i + 2] = src[i + 2];
          out[i + 3] = 255;
          continue;
        }
        let r = 0;
        let g = 0;
        let b = 0;
        for (let k = 0; k < steps; k++) {
          const s = 1 - (amt * wgt * k) / steps;
          sampleAt(src, w, h, cx + dx * s, cy + dy * s, px, 0);
          r += px[0];
          g += px[1];
          b += px[2];
        }
        out[i] = r / steps;
        out[i + 1] = g / steps;
        out[i + 2] = b / steps;
        out[i + 3] = 255;
      }
    }
    return out;
  }

  function spinBlurFx(src, w, h, p) {
    const amt = (p.amount / 100) * 0.35;
    const steps = 14;
    const cx = w / 2;
    const cy = h / 2;
    const guard = p.centre / 100;
    const maxR = Math.hypot(cx, cy);
    const out = new Uint8ClampedArray(src.length);
    const px = new Uint8ClampedArray(4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const rr = Math.hypot(dx, dy);
        const wgt = clamp((rr / maxR - guard) / Math.max(0.001, 1 - guard), 0, 1);
        const i = (y * w + x) * 4;
        if (wgt <= 0.002) {
          out[i] = src[i];
          out[i + 1] = src[i + 1];
          out[i + 2] = src[i + 2];
          out[i + 3] = 255;
          continue;
        }
        const a0 = Math.atan2(dy, dx);
        let r = 0;
        let g = 0;
        let b = 0;
        for (let k = 0; k < steps; k++) {
          const a = a0 + (amt * wgt * (k / steps - 0.5));
          sampleAt(src, w, h, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, px, 0);
          r += px[0];
          g += px[1];
          b += px[2];
        }
        out[i] = r / steps;
        out[i + 1] = g / steps;
        out[i + 2] = b / steps;
        out[i + 3] = 255;
      }
    }
    return out;
  }

  function bloomFx(src, w, h, p) {
    const thr = (p.threshold / 100) * 255;
    const span = Math.max(1, 255 - thr);
    const bright = new Uint8ClampedArray(src.length);
    for (let i = 0; i < src.length; i += 4) {
      const l = luma(src[i], src[i + 1], src[i + 2]);
      const k = l > thr ? clamp((l - thr) / span, 0, 1) : 0;
      bright[i] = src[i] * k;
      bright[i + 1] = src[i + 1] * k;
      bright[i + 2] = src[i + 2] * k;
      bright[i + 3] = 255;
    }
    const glow = boxBlurRGBA(bright, w, h, Math.max(1, Math.round(p.radius)), 3);
    let base = new Uint8ClampedArray(src);
    if (p.soften > 0) {
      const soft = boxBlurRGBA(src, w, h, Math.max(1, Math.round(p.radius * 0.5)), 2);
      base = blendPair(base, soft, p.soften / 100);
    }
    screenBlend(base, glow, p.amount / 100);
    return base;
  }

  function highPassFx(src, w, h, p) {
    const blur = boxBlurRGBA(src, w, h, Math.max(1, Math.round(p.radius)), 3);
    const gain = (p.gain / 100) * 4;
    const mono = p.mono / 100;
    const out = new Uint8ClampedArray(src.length);
    for (let i = 0; i < src.length; i += 4) {
      let r = 128 + (src[i] - blur[i]) * gain;
      let g = 128 + (src[i + 1] - blur[i + 1]) * gain;
      let b = 128 + (src[i + 2] - blur[i + 2]) * gain;
      if (mono > 0) {
        const l = luma(r, g, b);
        r += (l - r) * mono;
        g += (l - g) * mono;
        b += (l - b) * mono;
      }
      out[i] = r;
      out[i + 1] = g;
      out[i + 2] = b;
      out[i + 3] = 255;
    }
    return out;
  }

  // ---------- tone looks ----------

  function solarizeFx(src, p) {
    const amt = p.amount / 100;
    const colour = p.colour / 100;
    const luts = [];
    for (let c = 0; c < 3; c++) {
      const thr = clamp((p.threshold / 100) * 255 * (1 + (c - 1) * colour * 0.45), 4, 251);
      const lut = new Uint8ClampedArray(256);
      for (let v = 0; v < 256; v++) {
        const s = v <= thr ? v : thr - ((v - thr) * thr) / Math.max(1, 255 - thr);
        lut[v] = v + (s - v) * amt;
      }
      luts.push(lut);
    }
    return applyChannelLUT(src, luts[0], luts[1], luts[2]);
  }

  function thresholdFx(src, w, h, p) {
    const gray = grayF32(src, w, h);
    const lvl = (p.level / 100) * 255;
    const local = p.local / 100;
    const soft = Math.max(0.5, (p.softness / 100) * 60);
    const bl = local > 0 ? boxBlurF32(gray, w, h, Math.max(2, Math.round(Math.min(w, h) / 16)), 2) : null;
    const out = new Uint8ClampedArray(src.length);
    for (let j = 0, i = 0; j < gray.length; j++, i += 4) {
      const ref = bl ? lvl + (bl[j] - 128) * local : lvl;
      const t = clamp((gray[j] - ref) / soft + 0.5, 0, 1);
      const v = t * 255;
      out[i] = v;
      out[i + 1] = v;
      out[i + 2] = v;
      out[i + 3] = 255;
    }
    return out;
  }

  function splitToneFx(src, p) {
    const sc = normTint(hueColour(p.shadowHue), p.saturation / 100);
    const hc = normTint(hueColour(p.highlightHue), p.saturation / 100);
    const bal = p.balance / 100;
    const str = p.strength / 100;
    const out = new Uint8ClampedArray(src.length);
    for (let i = 0; i < src.length; i += 4) {
      const l = luma(src[i], src[i + 1], src[i + 2]) / 255;
      let t = clamp((l - (bal - 0.35)) / 0.7, 0, 1);
      t = t * t * (3 - 2 * t);
      for (let c = 0; c < 3; c++) {
        const k = sc[c] + (hc[c] - sc[c]) * t;
        out[i + c] = src[i + c] * (1 + (k - 1) * str);
      }
      out[i + 3] = 255;
    }
    return out;
  }

  function matteFadeFx(src, p) {
    const lift = (p.lift / 100) * 70;
    const roll = (p.rolloff / 100) * 45;
    const warm = p.warmth / 100;
    const luts = [];
    for (let c = 0; c < 3; c++) {
      const lo = lift * (c === 0 ? 1 + 0.5 * warm : c === 2 ? 1 - 0.45 * warm : 1);
      const hi = 255 - roll;
      const lut = new Uint8ClampedArray(256);
      for (let v = 0; v < 256; v++) lut[v] = lo + (v * (hi - lo)) / 255;
      luts.push(lut);
    }
    const out = applyChannelLUT(src, luts[0], luts[1], luts[2]);
    if (p.fade > 0) saturate(out, 1 - (p.fade / 100) * 0.85);
    return out;
  }

  function crossProcessFx(src, p) {
    const amt = p.amount / 100;
    const shift = p.shift / 100;
    const luts = [];
    for (let c = 0; c < 3; c++) {
      const lut = new Uint8ClampedArray(256);
      for (let v = 0; v < 256; v++) {
        const f = v / 255;
        let s;
        if (c === 0) s = Math.pow(f, 0.82) * 1.05;
        else if (c === 1) s = f * f * (3 - 2 * f) * (1 + 0.08 * shift);
        else s = 0.1 + 0.16 * shift + Math.pow(f, 1.4) * 0.78;
        lut[v] = 255 * (f + (clamp(s, 0, 1) - f) * amt);
      }
      luts.push(lut);
    }
    const out = applyChannelLUT(src, luts[0], luts[1], luts[2]);
    if (p.contrast > 0) contrastSCurve(out, p.contrast / 100);
    return out;
  }

  function xrayFx(src, w, h, p) {
    const inv = p.invert / 100;
    const tint = normTint(hueColour(p.hue), p.tint / 100);
    const out = new Uint8ClampedArray(src.length);
    for (let i = 0; i < src.length; i += 4) {
      const l = luma(src[i], src[i + 1], src[i + 2]);
      for (let c = 0; c < 3; c++) {
        const v = src[i + c] + (255 - src[i + c] - src[i + c]) * inv;
        const m = v + (l + (255 - l - l) * inv - v) * (p.desat / 100);
        out[i + c] = m * tint[c];
      }
      out[i + 3] = 255;
    }
    if (p.glow > 0) {
      const g = boxBlurRGBA(out, w, h, 6, 2);
      screenBlend(out, g, (p.glow / 100) * 0.7);
    }
    return out;
  }

  // ---------- print and ink ----------

  const ASCII_RAMP = ' .:-=+*#%@';

  function spreadErr(buf, w, h, x, y, c, e) {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    buf[(y * w + x) * 3 + c] += e;
  }

  function ditherFx(src, w, h, p) {
    const scale = Math.max(1, Math.round(p.scale));
    const levels = Math.max(2, Math.round(p.levels));
    const colour = p.colour / 100;
    const mode = Math.round(p.mode);
    const sw = Math.max(1, Math.round(w / scale));
    const sh = Math.max(1, Math.round(h / scale));
    const buf = new Float32Array(sw * sh * 3);
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const sx = Math.min(w - 1, Math.floor(((x + 0.5) * w) / sw));
        const sy = Math.min(h - 1, Math.floor(((y + 0.5) * h) / sh));
        const i = (sy * w + sx) * 4;
        const o = (y * sw + x) * 3;
        const l = luma(src[i], src[i + 1], src[i + 2]);
        buf[o] = src[i] + (l - src[i]) * (1 - colour);
        buf[o + 1] = src[i + 1] + (l - src[i + 1]) * (1 - colour);
        buf[o + 2] = src[i + 2] + (l - src[i + 2]) * (1 - colour);
      }
    }
    const step = 255 / (levels - 1);
    if (mode === 0) {
      const m = bayerMatrix(8);
      for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
          const th = (m[y & 7][x & 7] + 0.5) / 64 - 0.5;
          const o = (y * sw + x) * 3;
          for (let c = 0; c < 3; c++) {
            buf[o + c] = clamp(Math.round((buf[o + c] + th * step) / step), 0, levels - 1) * step;
          }
        }
      }
    } else {
      const fs = mode === 1;
      for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
          const o = (y * sw + x) * 3;
          for (let c = 0; c < 3; c++) {
            const old = buf[o + c];
            const nv = clamp(Math.round(old / step), 0, levels - 1) * step;
            buf[o + c] = nv;
            const err = old - nv;
            if (fs) {
              spreadErr(buf, sw, sh, x + 1, y, c, (err * 7) / 16);
              spreadErr(buf, sw, sh, x - 1, y + 1, c, (err * 3) / 16);
              spreadErr(buf, sw, sh, x, y + 1, c, (err * 5) / 16);
              spreadErr(buf, sw, sh, x + 1, y + 1, c, err / 16);
            } else {
              const e = err / 8;
              spreadErr(buf, sw, sh, x + 1, y, c, e);
              spreadErr(buf, sw, sh, x + 2, y, c, e);
              spreadErr(buf, sw, sh, x - 1, y + 1, c, e);
              spreadErr(buf, sw, sh, x, y + 1, c, e);
              spreadErr(buf, sw, sh, x + 1, y + 1, c, e);
              spreadErr(buf, sw, sh, x, y + 2, c, e);
            }
          }
        }
      }
    }
    const out = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      const sy = Math.min(sh - 1, Math.floor((y * sh) / h));
      for (let x = 0; x < w; x++) {
        const sx = Math.min(sw - 1, Math.floor((x * sw) / w));
        const o = (sy * sw + sx) * 3;
        const i = (y * w + x) * 4;
        out[i] = buf[o];
        out[i + 1] = buf[o + 1];
        out[i + 2] = buf[o + 2];
        out[i + 3] = 255;
      }
    }
    return out;
  }

  function asciiFx(src, w, h, p) {
    const cell = Math.max(4, Math.round(p.cell));
    const colour = p.colour / 100;
    const k = (p.contrast / 100) * 1.5 + 0.5;
    const cols = Math.max(1, Math.floor(w / cell));
    const rows = Math.max(1, Math.floor(h / cell));
    const norm = normaliseGray(grayF32(src, w, h), 1);
    const ctx = newCanvas(w, h).getContext('2d');
    ctx.fillStyle = '#0a0c10';
    ctx.fillRect(0, 0, w, h);
    ctx.font = 'bold ' + cell + 'px ui-monospace, Menlo, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let ry = 0; ry < rows; ry++) {
      for (let rx = 0; rx < cols; rx++) {
        let r = 0;
        let g = 0;
        let b = 0;
        let nl = 0;
        let n = 0;
        const y1 = Math.min(h, (ry + 1) * cell);
        const x1 = Math.min(w, (rx + 1) * cell);
        for (let y = ry * cell; y < y1; y += 2) {
          for (let x = rx * cell; x < x1; x += 2) {
            const j = y * w + x;
            const i = j * 4;
            r += src[i];
            g += src[i + 1];
            b += src[i + 2];
            nl += norm[j];
            n++;
          }
        }
        if (!n) continue;
        r /= n;
        g /= n;
        b /= n;
        let l = nl / n / 255;
        l = clamp((l - 0.5) * k + 0.5, 0, 1);
        const ch = ASCII_RAMP[Math.min(ASCII_RAMP.length - 1, Math.floor(l * ASCII_RAMP.length))];
        if (ch === ' ') continue;
        const tr = 125 + (r - 125) * colour;
        const tg = 252 + (g - 252) * colour;
        const tb = 155 + (b - 155) * colour;
        ctx.fillStyle = 'rgb(' + Math.round(tr) + ',' + Math.round(tg) + ',' + Math.round(tb) + ')';
        ctx.fillText(ch, rx * cell + cell / 2, ry * cell + cell / 2);
      }
    }
    return ctx.getImageData(0, 0, w, h).data;
  }

  // Manga screentone: solid blacks, a 45-degree dot screen through the mids,
  // paper white in the highlights, optional ink line on the edges.
  function screentoneFx(src, w, h, p) {
    const gray = normaliseGray(grayF32(src, w, h), 1);
    const dot = Math.max(2, p.dot);
    const dark = (p.shadows / 100) * 140;
    const light = 255 - (p.highlights / 100) * 140;
    const span = Math.max(1, light - dark);
    const mag = p.ink > 0 ? sobelMag(gray, w, h) : null;
    const inkThr = 255 - (p.ink / 100) * 200;
    const a = Math.SQRT1_2;
    const out = new Uint8ClampedArray(src.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const j = y * w + x;
        const g = gray[j];
        let v;
        if (g <= dark) v = 0;
        else if (g >= light) v = 255;
        else {
          const t = (g - dark) / span;
          const u = (x * a + y * a) / dot;
          const q = (-x * a + y * a) / dot;
          const fu = u - Math.floor(u) - 0.5;
          const fq = q - Math.floor(q) - 0.5;
          const d = Math.hypot(fu, fq) / 0.5;
          v = d < Math.sqrt(1 - t) ? 0 : 255;
        }
        if (mag && mag[j] > inkThr) v = 0;
        const i = j * 4;
        out[i] = v;
        out[i + 1] = v;
        out[i + 2] = v;
        out[i + 3] = 255;
      }
    }
    return out;
  }

  // Three ink plates, each pulled off one channel and printed slightly out of
  // register - the risograph misprint look.
  function risoMisprintFx(src, w, h, p) {
    const inks = [[0, 105, 180], [255, 72, 125], [250, 200, 40]];
    const plates = clamp(Math.round(p.plates), 2, 3);
    const rnd = mulberry32(Math.round(p.seed) + 1);
    const shifts = [];
    for (let k = 0; k < plates; k++) {
      const ang = rnd() * TAU;
      shifts.push([Math.cos(ang) * p.offset, Math.sin(ang) * p.offset]);
    }
    const grain = p.grain / 100;
    const gain = (p.ink / 100) * 1.4;
    const m = bayerMatrix(4);
    const out = new Uint8ClampedArray(src.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let r = 255;
        let g = 255;
        let b = 255;
        for (let k = 0; k < plates; k++) {
          const sx = clamp(Math.round(x + shifts[k][0]), 0, w - 1);
          const sy = clamp(Math.round(y + shifts[k][1]), 0, h - 1);
          const i = (sy * w + sx) * 4;
          let cov = clamp((1 - src[i + k] / 255) * gain, 0, 1);
          if (grain > 0) cov = clamp(cov + (((m[y & 3][x & 3] + 0.5) / 16 - 0.5) * grain), 0, 1);
          r *= 1 - cov * (1 - inks[k][0] / 255);
          g *= 1 - cov * (1 - inks[k][1] / 255);
          b *= 1 - cov * (1 - inks[k][2] / 255);
        }
        const o = (y * w + x) * 4;
        out[o] = r;
        out[o + 1] = g;
        out[o + 2] = b;
        out[o + 3] = 255;
      }
    }
    return out;
  }

  // Threshold to ink, then close/dilate it so the strokes bleed into each
  // other. OpenCV's morphology when it is up; min/max filters otherwise.
  function inkBleedFx(src, w, h, p) {
    const cv = window.cv;
    const gray = normaliseGray(grayF32(src, w, h), 1);
    const lvl = (p.level / 100) * 255;
    const rnd = mulberry32(17);
    const jit = (p.rough / 100) * 60;
    const ink = new Uint8ClampedArray(w * h);
    for (let j = 0; j < gray.length; j++) {
      const t = clamp((lvl - gray[j] + (rnd() - 0.5) * jit) / 22 + 0.5, 0, 1);
      ink[j] = t * 255;
    }
    const sz = 2 * Math.max(1, Math.round(p.bleed)) + 1;
    let mask = ink;
    let done = false;
    if (cvIsReady() && typeof cv.morphologyEx === 'function') {
      const m = new cv.Mat(h, w, cv.CV_8UC1);
      const d = new cv.Mat();
      let kern = null;
      try {
        m.data.set(ink);
        kern = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(sz, sz));
        cv.morphologyEx(m, d, cv.MORPH_CLOSE, kern);
        if (p.spread > 0) cv.dilate(d, d, cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(2 * Math.round(p.spread) + 1, 2 * Math.round(p.spread) + 1)));
        mask = new Uint8ClampedArray(d.data);
        done = true;
      } catch (err) {
        done = false;
      }
      if (kern) kern.delete();
      d.delete();
      m.delete();
    }
    if (!done) {
      let f = Float32Array.from(ink);
      f = maxFilterF32(f, w, h, Math.max(1, Math.round(p.bleed)));
      f = minFilterF32(f, w, h, Math.max(1, Math.round(p.bleed) - Math.round(p.spread)));
      mask = new Uint8ClampedArray(f.length);
      for (let j = 0; j < f.length; j++) mask[j] = f[j];
    }
    const paper = mottle(w, h, 5, 3);
    const out = new Uint8ClampedArray(src.length);
    const tone = normTint(hueColour(p.hue), p.tint / 100);
    for (let j = 0, i = 0; j < mask.length; j++, i += 4) {
      const t = mask[j] / 255;
      const pv = 246 + paper[j] * 9;
      for (let c = 0; c < 3; c++) out[i + c] = (pv + (26 - pv) * t) * tone[c];
      out[i + 3] = 255;
    }
    return out;
  }

  // ---------- geometry ----------

  function triSample(src, w, h, tri) {
    const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3;
    const cy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let k = 0; k < 4; k++) {
      const px = k === 0 ? cx : cx + (tri[k - 1][0] - cx) * 0.6;
      const py = k === 0 ? cy : cy + (tri[k - 1][1] - cy) * 0.6;
      const x = clamp(Math.round(px), 0, w - 1);
      const y = clamp(Math.round(py), 0, h - 1);
      const i = (y * w + x) * 4;
      r += src[i];
      g += src[i + 1];
      b += src[i + 2];
      n++;
    }
    return 'rgb(' + Math.round(r / n) + ',' + Math.round(g / n) + ',' + Math.round(b / n) + ')';
  }

  function lowPolyFx(src, w, h, p) {
    const cell = Math.max(8, Math.round(p.cell));
    const cols = Math.ceil(w / cell);
    const rows = Math.ceil(h / cell);
    const rnd = mulberry32(Math.round(p.seed) + 3);
    const jit = (p.jitter / 100) * cell * 0.5;
    const pts = [];
    for (let ry = 0; ry <= rows; ry++) {
      for (let rx = 0; rx <= cols; rx++) {
        const edge = rx === 0 || ry === 0 || rx === cols || ry === rows;
        pts.push([
          clamp(rx * cell + (edge ? 0 : (rnd() - 0.5) * 2 * jit), 0, w),
          clamp(ry * cell + (edge ? 0 : (rnd() - 0.5) * 2 * jit), 0, h)
        ]);
      }
    }
    const ctx = newCanvas(w, h).getContext('2d');
    const at = (rx, ry) => pts[ry * (cols + 1) + rx];
    const stroke = p.edges / 100;
    ctx.lineJoin = 'round';
    for (let ry = 0; ry < rows; ry++) {
      for (let rx = 0; rx < cols; rx++) {
        const a = at(rx, ry);
        const b = at(rx + 1, ry);
        const c = at(rx, ry + 1);
        const d = at(rx + 1, ry + 1);
        const tris = ((rx + ry) & 1) === 0 ? [[a, b, c], [b, d, c]] : [[a, b, d], [a, d, c]];
        for (const t of tris) {
          const fill = triSample(src, w, h, t);
          ctx.fillStyle = fill;
          ctx.beginPath();
          ctx.moveTo(t[0][0], t[0][1]);
          ctx.lineTo(t[1][0], t[1][1]);
          ctx.lineTo(t[2][0], t[2][1]);
          ctx.closePath();
          ctx.fill();
          // A hairline in the fill colour hides the seams antialiasing leaves.
          ctx.strokeStyle = stroke > 0 ? 'rgba(12,14,18,' + stroke.toFixed(3) + ')' : fill;
          ctx.lineWidth = stroke > 0 ? 0.6 + stroke : 1;
          ctx.stroke();
        }
      }
    }
    return ctx.getImageData(0, 0, w, h).data;
  }

  // Luma bands -> contours -> simplified polygons. Drop shadows make it read as
  // cut paper; dark outlines make it read as stained glass.
  function paperCutFx(src, w, h, p) {
    const cv = window.cv;
    const layers = clamp(Math.round(p.layers), 2, 8);
    if (!cvIsReady() || typeof cv.findContours !== 'function') {
      const q = new Uint8ClampedArray(src);
      posterize(q, layers);
      return q;
    }
    const simplify = (p.simplify / 100) * 6 + 0.5;
    const shadow = p.shadow / 100;
    const line = p.outline / 100;
    const m = matFromRGBA(cv, src, w, h);
    const rgb = new cv.Mat();
    const sm = new cv.Mat();
    const gray = new cv.Mat();
    const bin = new cv.Mat();
    let ctx = null;
    try {
      cv.cvtColor(m, rgb, cv.COLOR_RGBA2RGB);
      cv.medianBlur(rgb, sm, 2 * Math.max(1, Math.round(p.smooth)) + 1);
      cv.cvtColor(sm, gray, cv.COLOR_RGB2GRAY);

      const sums = [];
      for (let k = 0; k < layers; k++) sums.push([0, 0, 0, 0]);
      const gd = gray.data;
      for (let j = 0, i = 0; j < gd.length; j++, i += 4) {
        const b = Math.min(layers - 1, Math.floor((gd[j] / 256) * layers));
        const s = sums[b];
        s[0] += src[i];
        s[1] += src[i + 1];
        s[2] += src[i + 2];
        s[3]++;
      }
      const cols = sums.map((s, k) => {
        if (s[3]) return [s[0] / s[3], s[1] / s[3], s[2] / s[3]];
        const g = (k * 255) / (layers - 1);
        return [g, g, g];
      });
      const css = (c) => 'rgb(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ')';

      ctx = newCanvas(w, h).getContext('2d');
      ctx.fillStyle = css(cols[0]);
      ctx.fillRect(0, 0, w, h);
      const outer = cv.RETR_EXTERNAL === undefined ? cv.RETR_LIST : cv.RETR_EXTERNAL;

      for (let k = 1; k < layers; k++) {
        cv.threshold(gray, bin, (k * 256) / layers, 255, cv.THRESH_BINARY);
        const contours = new cv.MatVector();
        const hier = new cv.Mat();
        const poly = new cv.Mat();
        cv.findContours(bin, contours, hier, outer, cv.CHAIN_APPROX_SIMPLE);
        const shapes = [];
        for (let ci = 0; ci < contours.size(); ci++) {
          const c = contours.get(ci);
          if (cv.contourArea(c) >= 24) {
            cv.approxPolyDP(c, poly, simplify, true);
            const d = poly.data32S;
            if (d.length >= 6) shapes.push(Int32Array.from(d));
          }
          c.delete();
        }
        const trace = (d) => {
          ctx.beginPath();
          ctx.moveTo(d[0], d[1]);
          for (let q = 2; q < d.length; q += 2) ctx.lineTo(d[q], d[q + 1]);
          ctx.closePath();
        };
        if (shadow > 0) {
          ctx.shadowColor = 'rgba(0,0,0,' + (0.5 * shadow).toFixed(3) + ')';
          ctx.shadowBlur = 6 * shadow + 2;
          ctx.shadowOffsetX = 3 * shadow;
          ctx.shadowOffsetY = 4 * shadow;
        }
        ctx.fillStyle = css(cols[k]);
        for (const d of shapes) {
          trace(d);
          ctx.fill();
        }
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        if (line > 0) {
          ctx.strokeStyle = 'rgba(14,12,18,' + line.toFixed(3) + ')';
          ctx.lineWidth = 1 + line * 2.5;
          ctx.lineJoin = 'round';
          for (const d of shapes) {
            trace(d);
            ctx.stroke();
          }
        }
        poly.delete();
        hier.delete();
        contours.delete();
      }
    } catch (err) {
      ctx = null;
    }
    bin.delete();
    gray.delete();
    sm.delete();
    rgb.delete();
    m.delete();
    if (!ctx) {
      const q = new Uint8ClampedArray(src);
      posterize(q, layers);
      return q;
    }
    return ctx.getImageData(0, 0, w, h).data;
  }

  // Canny edges on blueprint paper, optionally rebuilt as straight Hough
  // segments so the result reads as a drafted technical drawing.
  function blueprintFx(src, w, h, p) {
    const cv = window.cv;
    const ctx = newCanvas(w, h).getContext('2d');
    const paper = normTint(hueColour(p.hue), 1);
    const base = 62;
    ctx.fillStyle = 'rgb(' + Math.round(base * paper[0] * 0.55) + ',' + Math.round(base * paper[1] * 0.9) + ',' + Math.round(Math.min(255, base * paper[2] * 2.1)) + ')';
    ctx.fillRect(0, 0, w, h);
    if (p.grid > 0) {
      const g = Math.max(8, Math.round(Math.min(w, h) / 18));
      ctx.strokeStyle = 'rgba(255,255,255,' + ((p.grid / 100) * 0.16).toFixed(3) + ')';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = g; x < w; x += g) {
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, h);
      }
      for (let y = g; y < h; y += g) {
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(w, y + 0.5);
      }
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(232,244,255,0.92)';
    ctx.lineWidth = p.weight / 10;
    ctx.lineCap = 'round';
    let drew = false;
    if (cvIsReady() && typeof cv.Canny === 'function') {
      const m = matFromRGBA(cv, src, w, h);
      const gray = new cv.Mat();
      const edges = new cv.Mat();
      const lines = new cv.Mat();
      try {
        cv.cvtColor(m, gray, cv.COLOR_RGBA2GRAY);
        const lo = 10 + (100 - p.detail) * 1.1;
        cv.Canny(gray, edges, lo, lo * 2.4);
        if (p.lines > 0) {
          const minLen = Math.max(6, (1 - p.lines / 100) * 60 + 8);
          cv.HoughLinesP(edges, lines, 1, Math.PI / 180, 28, minLen, 6);
          ctx.beginPath();
          for (let i = 0; i < lines.rows; i++) {
            const d = lines.data32S;
            ctx.moveTo(d[i * 4], d[i * 4 + 1]);
            ctx.lineTo(d[i * 4 + 2], d[i * 4 + 3]);
          }
          ctx.stroke();
        }
        if (p.lines < 100) {
          const ed = edges.data;
          const img = ctx.getImageData(0, 0, w, h);
          const o = img.data;
          const a = 1 - p.lines / 100;
          for (let j = 0, i = 0; j < ed.length; j++, i += 4) {
            if (!ed[j]) continue;
            o[i] += (232 - o[i]) * a;
            o[i + 1] += (244 - o[i + 1]) * a;
            o[i + 2] += (255 - o[i + 2]) * a;
          }
          ctx.putImageData(img, 0, 0);
        }
        drew = true;
      } catch (err) {
        drew = false;
      }
      lines.delete();
      edges.delete();
      gray.delete();
      m.delete();
    }
    if (!drew) {
      const mag = sobelMag(grayF32(src, w, h), w, h);
      const img = ctx.getImageData(0, 0, w, h);
      const o = img.data;
      const thr = 20 + (100 - p.detail) * 1.6;
      for (let j = 0, i = 0; j < mag.length; j++, i += 4) {
        const a = clamp((mag[j] - thr) / 40, 0, 1);
        if (a <= 0) continue;
        o[i] += (232 - o[i]) * a;
        o[i + 1] += (244 - o[i + 1]) * a;
        o[i + 2] += (255 - o[i + 2]) * a;
      }
      ctx.putImageData(img, 0, 0);
    }
    const out = ctx.getImageData(0, 0, w, h).data;
    if (p.glow > 0) {
      const g = boxBlurRGBA(out, w, h, 4, 2);
      screenBlend(out, g, (p.glow / 100) * 0.5);
    }
    return out;
  }

  // Parallel strokes, one pass per tone band, each stroke free to bend along
  // the local iso-contour so the hatching wraps around form like an engraving.
  function crossHatchFx(src, w, h, p) {
    const gray = normaliseGray(boxBlurF32(grayF32(src, w, h), w, h, 2, 1), 1);
    const grad = sobelXY(gray, w, h);
    const gx = grad[0];
    const gy = grad[1];
    const ctx = newCanvas(w, h).getContext('2d');
    ctx.fillStyle = '#f6f2e9';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(24,22,28,' + (0.3 + (p.ink / 100) * 0.6).toFixed(3) + ')';
    ctx.lineWidth = Math.max(0.4, p.weight / 10);
    ctx.lineCap = 'round';
    const passes = clamp(Math.round(p.passes), 1, 5);
    const spacing = Math.max(2, p.spacing);
    const follow = p.follow / 100;
    const base = (p.angle * Math.PI) / 180;
    const diag = Math.hypot(w, h);
    const step = 2;
    for (let pass = 0; pass < passes; pass++) {
      const ang = base + (pass * 40 * Math.PI) / 180;
      const thr = 245 - ((pass + 1) / (passes + 1)) * 235;
      const nx = -Math.sin(ang);
      const ny = Math.cos(ang);
      const lines = Math.ceil(diag / spacing);
      ctx.beginPath();
      for (let li = -lines; li <= lines; li++) {
        const ox = w / 2 + nx * li * spacing - Math.cos(ang) * diag * 0.5;
        const oy = h / 2 + ny * li * spacing - Math.sin(ang) * diag * 0.5;
        let x = ox;
        let y = oy;
        let dir = ang;
        let drawing = false;
        const steps = Math.ceil(diag / step);
        for (let s = 0; s < steps; s++) {
          const ix = x | 0;
          const iy = y | 0;
          if (ix < 1 || iy < 1 || ix >= w - 1 || iy >= h - 1) {
            drawing = false;
          } else {
            const j = iy * w + ix;
            if (gray[j] < thr) {
              if (drawing) ctx.lineTo(x, y);
              else {
                ctx.moveTo(x, y);
                drawing = true;
              }
            } else {
              drawing = false;
            }
            if (follow > 0) {
              const iso = Math.atan2(gx[j], -gy[j]);
              let d = iso - dir;
              while (d > Math.PI / 2) d -= Math.PI;
              while (d < -Math.PI / 2) d += Math.PI;
              dir += d * follow * 0.3;
            }
            let back = ang - dir;
            while (back > Math.PI / 2) back -= Math.PI;
            while (back < -Math.PI / 2) back += Math.PI;
            dir += back * 0.14;
          }
          x += Math.cos(dir) * step;
          y += Math.sin(dir) * step;
        }
      }
      ctx.stroke();
    }
    return ctx.getImageData(0, 0, w, h).data;
  }

  // ---------- painterly and portrait ----------

  function watercolourFx(src, w, h, p) {
    const r = Math.max(1, Math.round(p.bleed));
    let cur = medianRGBA(src, w, h, r);
    cur = kuwahara(cur, w, h, Math.max(1, Math.round(p.bleed * 0.8)));
    // Two noise fields push the colour around, which is what gives the edges
    // their wobble instead of the machine-clean boundaries a blur leaves.
    const wet = p.wet / 100;
    if (wet > 0) {
      const nx = mottle(w, h, 21, 5);
      const ny = mottle(w, h, 57, 5);
      const disp = new Uint8ClampedArray(cur.length);
      const amp = wet * 7;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const j = y * w + x;
          sampleAt(cur, w, h, x + nx[j] * amp, y + ny[j] * amp, disp, j * 4);
        }
      }
      cur = disp;
    }
    if (p.levels > 0) lumaQuantize(cur, Math.max(3, Math.round(12 - (p.levels / 100) * 8)));
    saturate(cur, 1 + (p.pigment / 100) * 0.6);
    // Pigment pools where the paper meets an edge.
    const mag = sobelMag(grayF32(cur, w, h), w, h);
    const dark = p.edges / 100;
    const paper = mottle(w, h, 9, 2);
    const out = new Uint8ClampedArray(cur.length);
    for (let j = 0, i = 0; j < mag.length; j++, i += 4) {
      const e = clamp((mag[j] - 26) / 90, 0, 1) * dark;
      const grain = 1 + paper[j] * (p.paper / 100) * 0.12;
      for (let c = 0; c < 3; c++) out[i + c] = cur[i + c] * (1 - e * 0.55) * grain;
      out[i + 3] = 255;
    }
    return out;
  }

  // Soft YCbCr skin test - no cascade file needed, and it degrades gracefully
  // on anything that is not a face.
  function skinWeight(r, g, b) {
    const y = luma(r, g, b);
    const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
    const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
    const dc = (cb - 112) / 20;
    const dr = (cr - 152) / 20;
    const w0 = Math.exp(-0.5 * (dc * dc + dr * dr));
    return y > 40 && y < 246 ? w0 : w0 * 0.2;
  }

  function portraitSmoothFx(src, w, h, p) {
    const r = Math.max(1, Math.round(p.smooth));
    const soft = boxBlurRGBA(medianRGBA(src, w, h, r), w, h, r, 2);
    const amt = p.amount / 100;
    const tex = p.texture / 100;
    const everywhere = p.everywhere / 100;
    const out = new Uint8ClampedArray(src.length);
    for (let i = 0; i < src.length; i += 4) {
      const sw = skinWeight(src[i], src[i + 1], src[i + 2]);
      const k = amt * (everywhere + (1 - everywhere) * sw);
      for (let c = 0; c < 3; c++) {
        const smooth = soft[i + c];
        const detail = (src[i + c] - smooth) * tex;
        out[i + c] = src[i + c] + (smooth + detail - src[i + c]) * k;
      }
      out[i + 3] = 255;
    }
    if (p.glow > 0) {
      const g = boxBlurRGBA(out, w, h, Math.max(2, r * 3), 2);
      screenBlend(out, g, (p.glow / 100) * 0.35);
    }
    if (p.warmth > 0) {
      const t = p.warmth / 100;
      for (let i = 0; i < out.length; i += 4) {
        out[i] *= 1 + 0.09 * t;
        out[i + 2] *= 1 - 0.07 * t;
      }
    }
    return out;
  }

  // ---------- warps ----------

  // The photo is treated as a polar image (rows = angle, cols = radius) and
  // unwrapped back to Cartesian, which wraps the bottom edge into a horizon.
  function tinyPlanetFx(src, w, h, p) {
    const cv = window.cv;
    const S = Math.round(Math.max(w, h));
    const roll = Math.round((p.rotate / 360) * w);
    const flip = p.invert > 50;
    // Roll horizontally so the seam can be moved off whatever matters.
    const rolled = new Uint8ClampedArray(src.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const sx = (((x + roll) % w) + w) % w;
        const si = (y * w + sx) * 4;
        const di = (y * w + x) * 4;
        rolled[di] = src[si];
        rolled[di + 1] = src[si + 1];
        rolled[di + 2] = src[si + 2];
        rolled[di + 3] = 255;
      }
    }
    let square = null;
    if (cvIsReady() && typeof cv.warpPolar === 'function') {
      const m = matFromRGBA(cv, rolled, w, h);
      const rgb = new cv.Mat();
      const fl = new cv.Mat();
      const polar = new cv.Mat();
      const dst = new cv.Mat();
      try {
        cv.cvtColor(m, rgb, cv.COLOR_RGBA2RGB);
        // Vertical flip puts the ground at radius 0; transpose turns the
        // panorama axis into the angle axis warpPolar expects.
        if (flip) rgb.copyTo(fl);
        else cv.flip(rgb, fl, 0);
        cv.transpose(fl, polar);
        cv.warpPolar(
          polar,
          dst,
          new cv.Size(S, S),
          new cv.Point(S / 2, S / 2),
          S / 2,
          cv.WARP_POLAR_LINEAR | cv.WARP_INVERSE_MAP | cv.INTER_LINEAR
        );
        square = rgbMatToRGBA(dst, S, S);
      } catch (err) {
        square = null;
      }
      dst.delete();
      polar.delete();
      fl.delete();
      rgb.delete();
      m.delete();
    }
    if (!square) {
      square = new Uint8ClampedArray(S * S * 4);
      const c = S / 2;
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          const dx = x - c;
          const dy = y - c;
          const rr = clamp(Math.hypot(dx, dy) / c, 0, 1);
          const a = (Math.atan2(dy, dx) + Math.PI) / TAU;
          const sy = flip ? rr * (h - 1) : (1 - rr) * (h - 1);
          sampleAt(rolled, w, h, a * (w - 1), sy, square, (y * S + x) * 4);
        }
      }
    }
    // Fit the square back into the original frame.
    const out = new Uint8ClampedArray(src.length);
    const k = (S / Math.hypot(w, h)) * (100 / clamp(p.zoom, 40, 200));
    const ox = S / 2 - (w * k) / 2;
    const oy = S / 2 - (h * k) / 2;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        sampleAt(square, S, S, x * k + ox, y * k + oy, out, (y * w + x) * 4);
      }
    }
    return out;
  }

  function lensWarpFx(src, w, h, p) {
    const amt = p.amount / 100;
    const barrel = p.barrel / 100;
    const cx = w / 2;
    const cy = h / 2;
    const maxR = Math.hypot(cx, cy);
    const r0 = Math.max(0.02, p.radius / 100) * maxR;
    const out = new Uint8ClampedArray(src.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const d = Math.hypot(dx, dy);
        let k = 1;
        if (d < r0) {
          const t = 1 - d / r0;
          k = 1 - amt * t * t * 0.75;
        }
        if (barrel !== 0) {
          const n = d / maxR;
          k *= 1 + barrel * 0.45 * (n * n - 0.35);
        }
        sampleAt(src, w, h, cx + dx * k, cy + dy * k, out, (y * w + x) * 4);
      }
    }
    return out;
  }

  function kaleidoscopeFx(src, w, h, p) {
    const seg = Math.max(2, Math.round(p.segments));
    const rot = (p.rotate * Math.PI) / 180;
    const zoom = Math.max(0.1, p.zoom / 100);
    const mirror = p.mirror / 100;
    const cx = w / 2;
    const cy = h / 2;
    const wedge = TAU / seg;
    const out = new Uint8ClampedArray(src.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const r = Math.hypot(dx, dy) / zoom;
        let a = Math.atan2(dy, dx) - rot;
        a = ((a % wedge) + wedge) % wedge;
        if (a > wedge / 2) a += (wedge - a - a) * mirror;
        a += rot + (p.offset / 100) * wedge;
        sampleAt(src, w, h, cx + Math.cos(a) * r, cy + Math.sin(a) * r, out, (y * w + x) * 4);
      }
    }
    return out;
  }

  function anaglyphFx(src, w, h, p) {
    const sep = p.separation;
    const depth = p.depth / 100;
    const desat = p.desat / 100;
    const ghost = p.ghost / 100;
    let field = null;
    if (depth > 0) {
      const g = grayF32(src, w, h);
      field = boxBlurF32(g, w, h, Math.max(2, Math.round(Math.min(w, h) / 40)), 2);
    }
    const out = new Uint8ClampedArray(src.length);
    const px = new Uint8ClampedArray(4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const j = y * w + x;
        const d = field ? (field[j] / 255 - 0.5) * 2 * depth + (1 - depth) : 1;
        const s = sep * d;
        sampleAt(src, w, h, x - s, y, px, 0);
        let r = desat > 0 ? px[0] + (luma(px[0], px[1], px[2]) - px[0]) * desat : px[0];
        sampleAt(src, w, h, x + s, y, px, 0);
        const l = luma(px[0], px[1], px[2]);
        let g = desat > 0 ? px[1] + (l - px[1]) * desat : px[1];
        let b = desat > 0 ? px[2] + (l - px[2]) * desat : px[2];
        const i = j * 4;
        if (ghost > 0) {
          r += (src[i] - r) * ghost * 0.4;
          g += (src[i + 1] - g) * ghost * 0.4;
          b += (src[i + 2] - b) * ghost * 0.4;
        }
        out[i] = r;
        out[i + 1] = g;
        out[i + 2] = b;
        out[i + 3] = 255;
      }
    }
    return out;
  }

  // ---------- optical overlays ----------

  function lightLeakFx(src, w, h, p) {
    const rnd = mulberry32(Math.round(p.seed) + 29);
    const ctx = newCanvas(w, h).getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    const n = clamp(Math.round(p.count), 1, 4);
    const spread = (p.spread / 100) * Math.max(w, h);
    for (let k = 0; k < n; k++) {
      const edge = Math.floor(rnd() * 4);
      const t = rnd();
      const x = edge === 0 ? 0 : edge === 1 ? w : t * w;
      const y = edge === 2 ? 0 : edge === 3 ? h : t * h;
      const c = hueColour(p.hue + (rnd() - 0.5) * p.variation);
      const rad = spread * (0.5 + rnd() * 0.8);
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      const rgbStr = Math.round(c[0] * 255) + ',' + Math.round(c[1] * 255) + ',' + Math.round(c[2] * 255);
      g.addColorStop(0, 'rgba(' + rgbStr + ',0.95)');
      g.addColorStop(0.45, 'rgba(' + rgbStr + ',0.35)');
      g.addColorStop(1, 'rgba(' + rgbStr + ',0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    const leak = ctx.getImageData(0, 0, w, h).data;
    const out = new Uint8ClampedArray(src);
    screenBlend(out, leak, p.amount / 100);
    if (p.haze > 0) {
      const lift = (p.haze / 100) * 26;
      for (let i = 0; i < out.length; i += 4) {
        out[i] = lift + (out[i] * (255 - lift)) / 255;
        out[i + 1] = lift + (out[i + 1] * (255 - lift)) / 255;
        out[i + 2] = lift + (out[i + 2] * (255 - lift)) / 255;
      }
    }
    return out;
  }

  function lensFlareFx(src, w, h, p) {
    // Anchor the flare on the brightest part of the frame.
    const step = Math.max(1, Math.round(Math.min(w, h) / 60));
    let bx = w / 2;
    let by = h / 2;
    let best = -1;
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        const i = (y * w + x) * 4;
        const l = luma(src[i], src[i + 1], src[i + 2]);
        if (l > best) {
          best = l;
          bx = x;
          by = y;
        }
      }
    }
    const ctx = newCanvas(w, h).getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    const R = Math.min(w, h);
    const size = p.size / 100;
    const tint = hueColour(p.hue);
    const rgbStr = Math.round(tint[0] * 255) + ',' + Math.round(tint[1] * 255) + ',' + Math.round(tint[2] * 255);
    const core = ctx.createRadialGradient(bx, by, 0, bx, by, R * (0.12 + size * 0.4));
    core.addColorStop(0, 'rgba(255,255,255,0.95)');
    core.addColorStop(0.2, 'rgba(' + rgbStr + ',0.55)');
    core.addColorStop(1, 'rgba(' + rgbStr + ',0)');
    ctx.fillStyle = core;
    ctx.fillRect(0, 0, w, h);

    const streaks = Math.round(p.streaks);
    if (streaks > 0) {
      const len = R * (0.5 + size);
      ctx.save();
      ctx.translate(bx, by);
      for (let k = 0; k < streaks; k++) {
        ctx.save();
        ctx.rotate((k * Math.PI) / streaks + (p.angle * Math.PI) / 180);
        const g = ctx.createLinearGradient(-len, 0, len, 0);
        g.addColorStop(0, 'rgba(' + rgbStr + ',0)');
        g.addColorStop(0.5, 'rgba(255,255,255,0.5)');
        g.addColorStop(1, 'rgba(' + rgbStr + ',0)');
        ctx.fillStyle = g;
        const th = Math.max(1, R * 0.006 * (0.5 + size));
        ctx.fillRect(-len, -th / 2, len * 2, th);
        ctx.restore();
      }
      ctx.restore();
    }

    const ghosts = Math.round(p.ghosts);
    const cx = w / 2;
    const cy = h / 2;
    for (let k = 1; k <= ghosts; k++) {
      const t = (k / (ghosts + 1)) * 2.2;
      const gx = bx + (cx - bx) * t;
      const gy = by + (cy - by) * t;
      const rad = R * (0.02 + 0.05 * (((k * 7) % 5) / 5)) * (size + 0.5);
      const gc = hueColour(p.hue + k * 53);
      const gs = Math.round(gc[0] * 255) + ',' + Math.round(gc[1] * 255) + ',' + Math.round(gc[2] * 255);
      const g = ctx.createRadialGradient(gx, gy, rad * 0.55, gx, gy, rad);
      g.addColorStop(0, 'rgba(' + gs + ',0)');
      g.addColorStop(0.75, 'rgba(' + gs + ',0.3)');
      g.addColorStop(1, 'rgba(' + gs + ',0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(gx, gy, rad, 0, TAU);
      ctx.fill();
    }
    const flare = ctx.getImageData(0, 0, w, h).data;
    const out = new Uint8ClampedArray(src);
    screenBlend(out, flare, p.amount / 100);
    return out;
  }

  function crtFx(src, w, h, p) {
    const scan = p.scanlines / 100;
    const grille = p.grille / 100;
    const bleed = p.bleed;
    const curve = p.curve / 100;
    const noise = p.noise / 100;
    const rnd = mulberry32(Math.round(p.seed) + 11);
    const rowShift = new Float32Array(h);
    if (noise > 0) {
      const bands = Math.max(1, Math.round(noise * 6));
      for (let k = 0; k < bands; k++) {
        const y0 = Math.floor(rnd() * h);
        const hh = Math.max(2, Math.round(rnd() * h * 0.06));
        const amt = (rnd() - 0.5) * 44 * noise;
        for (let y = y0; y < Math.min(h, y0 + hh); y++) rowShift[y] = amt;
      }
    }
    const cx = w / 2;
    const cy = h / 2;
    const maxR = Math.hypot(cx, cy);
    const out = new Uint8ClampedArray(src.length);
    const px = new Uint8ClampedArray(4);
    const boost = 1 + scan * 0.34 + grille * 0.3;
    for (let y = 0; y < h; y++) {
      const sl = 1 - scan * 0.55 * (0.5 + 0.5 * Math.cos(y * Math.PI));
      for (let x = 0; x < w; x++) {
        let sx = x + rowShift[y];
        let sy = y;
        if (curve > 0) {
          const dx = (sx - cx) / maxR;
          const dy = (sy - cy) / maxR;
          const k = 1 - curve * 0.3 * (dx * dx + dy * dy);
          sx = cx + (sx - cx) * k;
          sy = cy + (sy - cy) * k;
        }
        sampleAt(src, w, h, sx - bleed, sy, px, 0);
        let r = px[0];
        sampleAt(src, w, h, sx, sy, px, 0);
        let g = px[1];
        sampleAt(src, w, h, sx + bleed, sy, px, 0);
        let b = px[2];
        const m = x % 3;
        const dim = 1 - grille * 0.55;
        const kr = m === 0 ? 1 : dim;
        const kg = m === 1 ? 1 : dim;
        const kb = m === 2 ? 1 : dim;
        r *= sl * kr * boost;
        g *= sl * kg * boost;
        b *= sl * kb * boost;
        if (noise > 0) {
          const n = (rnd() - 0.5) * 44 * noise;
          r += n;
          g += n;
          b += n;
        }
        const i = (y * w + x) * 4;
        out[i] = r;
        out[i + 1] = g;
        out[i + 2] = b;
        out[i + 3] = 255;
      }
    }
    return out;
  }

  // Exposure fusion over a synthetic bracket - the grungy local-contrast look
  // people mean by "HDR".
  function hdrTonemapFx(src, w, h, p) {
    const cv = window.cv;
    let out = null;
    if (cvIsReady() && typeof cv.MergeMertens === 'function') {
      const m = matFromRGBA(cv, src, w, h);
      const rgb = new cv.Mat();
      const vec = new cv.MatVector();
      const fused = new cv.Mat();
      const made = [];
      let mm = null;
      try {
        cv.cvtColor(m, rgb, cv.COLOR_RGBA2RGB);
        const spread = 0.5 + (p.strength / 100) * 1.5;
        for (const ev of [-spread, 0, spread]) {
          const e = new cv.Mat();
          if (ev === 0) rgb.copyTo(e);
          else rgb.convertTo(e, cv.CV_8U, Math.pow(2, ev), 0);
          vec.push_back(e);
          made.push(e);
        }
        mm = new cv.MergeMertens();
        mm.process(vec, fused);
        const conv = new cv.Mat();
        fused.convertTo(conv, cv.CV_8U, 255, 0);
        out = rgbMatToRGBA(conv, w, h);
        conv.delete();
      } catch (err) {
        out = null;
      }
      if (mm) mm.delete();
      for (const e of made) e.delete();
      fused.delete();
      vec.delete();
      rgb.delete();
      m.delete();
    }
    if (!out) {
      out = localContrast(src, w, h, { clarity: 40 + p.strength * 0.5, tiles: 8 });
      contrastSCurve(out, 0.35);
    }
    if (p.detail > 0) unsharp(out, w, h, Math.max(2, Math.round(p.radius)), p.detail / 100);
    if (p.saturation !== 100) saturate(out, p.saturation / 100);
    return out;
  }

  // ---------- registration ----------

  window.Filters.push(
    {
      id: 'exposure',
      name: 'Exposure',
      params: [
        { key: 'exposure', label: 'Exposure', min: -100, max: 100, value: 18, primary: true },
        { key: 'contrast', label: 'Contrast', min: -100, max: 100, value: 35 },
        { key: 'black', label: 'Black point', min: -100, max: 100, value: -12 }
      ],
      apply(data, w, h, p) {
        return exposureAdjust(data, p);
      }
    },
    {
      id: 'white-balance',
      name: 'White Balance',
      params: [
        { key: 'temp', label: 'Temperature', min: -100, max: 100, value: 38, primary: true },
        { key: 'tint', label: 'Tint', min: -100, max: 100, value: -8 },
        { key: 'preserve', label: 'Keep brightness', min: 0, max: 100, value: 70 }
      ],
      apply(data, w, h, p) {
        return whiteBalanceAdjust(data, p);
      }
    },
    {
      id: 'shadows-highlights',
      name: 'Shadows & Highlights',
      params: [
        { key: 'shadows', label: 'Shadows', min: -100, max: 100, value: 55, primary: true },
        { key: 'highlights', label: 'Highlights', min: -100, max: 100, value: -45 },
        { key: 'midtones', label: 'Midtones', min: -100, max: 100, value: 10 }
      ],
      apply(data, w, h, p) {
        return shadowsHighlights(data, p);
      }
    },
    {
      id: 'levels',
      name: 'Levels',
      params: [
        { key: 'blackIn', label: 'Black in', min: 0, max: 128, step: 1, value: 16, primary: true },
        { key: 'whiteIn', label: 'White in', min: 128, max: 255, step: 1, value: 238 },
        { key: 'gamma', label: 'Gamma', min: 20, max: 300, step: 1, value: 105 },
        { key: 'outBlack', label: 'Output black', min: 0, max: 60, value: 0 },
        { key: 'outWhite', label: 'Output white', min: 0, max: 60, value: 0 }
      ],
      apply(data, w, h, p) {
        return levelsAdjust(data, p);
      }
    },
    {
      id: 'auto-levels',
      name: 'Auto Levels',
      params: [
        { key: 'amount', label: 'Amount', min: 0, max: 100, value: 85, primary: true },
        { key: 'colour', label: 'Per channel', min: 0, max: 100, value: 45 },
        { key: 'clip', label: 'Clip', min: 0, max: 40, value: 6 }
      ],
      apply(data, w, h, p) {
        return autoLevels(data, w, h, p);
      }
    },
    {
      id: 'clarity',
      name: 'Clarity',
      maxPixels: 1400000,
      params: [
        { key: 'clarity', label: 'Clarity', min: 0, max: 100, value: 55, primary: true },
        { key: 'tiles', label: 'Detail scale', min: 2, max: 16, step: 1, value: 8 },
        { key: 'structure', label: 'Structure', min: 0, max: 100, value: 30 }
      ],
      apply(data, w, h, p) {
        return claheClarity(data, w, h, p);
      }
    },
    {
      id: 'tilt-shift',
      name: 'Tilt Shift',
      maxPixels: 900000,
      params: [
        { key: 'blur', label: 'Blur', min: 1, max: 24, step: 1, value: 9, primary: true },
        { key: 'position', label: 'Position', min: 0, max: 100, value: 55 },
        { key: 'band', label: 'Band width', min: 2, max: 60, value: 16 },
        { key: 'angle', label: 'Angle', min: 0, max: 180, step: 1, value: 0 },
        { key: 'pop', label: 'Colour pop', min: 0, max: 100, value: 45 }
      ],
      apply(data, w, h, p) {
        return tiltShift(data, w, h, p);
      }
    },
    {
      id: 'motion-blur',
      name: 'Motion Blur',
      maxPixels: 700000,
      params: [
        { key: 'length', label: 'Length', min: 1, max: 40, step: 1, value: 14, primary: true },
        { key: 'angle', label: 'Angle', min: 0, max: 180, step: 1, value: 0 },
        { key: 'mix', label: 'Intensity', min: 0, max: 100, value: 100 }
      ],
      apply(data, w, h, p) {
        return motionBlurFx(data, w, h, p);
      }
    },
    {
      id: 'zoom-blur',
      name: 'Zoom Blur',
      maxPixels: 700000,
      params: [
        { key: 'amount', label: 'Amount', min: 0, max: 100, value: 55, primary: true },
        { key: 'centre', label: 'Clear centre', min: 0, max: 90, value: 22 }
      ],
      apply(data, w, h, p) {
        return zoomBlurFx(data, w, h, p);
      }
    },
    {
      id: 'spin-blur',
      name: 'Spin Blur',
      maxPixels: 700000,
      params: [
        { key: 'amount', label: 'Amount', min: 0, max: 100, value: 50, primary: true },
        { key: 'centre', label: 'Clear centre', min: 0, max: 90, value: 18 }
      ],
      apply(data, w, h, p) {
        return spinBlurFx(data, w, h, p);
      }
    },
    {
      id: 'bloom',
      name: 'Bloom',
      params: [
        { key: 'amount', label: 'Amount', min: 0, max: 100, value: 65, primary: true },
        { key: 'threshold', label: 'Threshold', min: 0, max: 100, value: 62 },
        { key: 'radius', label: 'Radius', min: 1, max: 40, step: 1, value: 14 },
        { key: 'soften', label: 'Orton soften', min: 0, max: 100, value: 30 }
      ],
      apply(data, w, h, p) {
        return bloomFx(data, w, h, p);
      }
    },
    {
      id: 'high-pass',
      name: 'High Pass',
      params: [
        { key: 'radius', label: 'Radius', min: 1, max: 30, step: 1, value: 6, primary: true },
        { key: 'gain', label: 'Gain', min: 0, max: 100, value: 40 },
        { key: 'mono', label: 'Desaturate', min: 0, max: 100, value: 60 }
      ],
      apply(data, w, h, p) {
        return highPassFx(data, w, h, p);
      }
    },
    {
      id: 'solarize',
      name: 'Solarize',
      params: [
        { key: 'threshold', label: 'Threshold', min: 5, max: 95, value: 40, primary: true },
        { key: 'amount', label: 'Amount', min: 0, max: 100, value: 85 },
        { key: 'colour', label: 'Channel split', min: 0, max: 100, value: 40 }
      ],
      apply(data, w, h, p) {
        return solarizeFx(data, p);
      }
    },
    {
      id: 'threshold',
      name: 'Threshold',
      params: [
        { key: 'level', label: 'Level', min: 5, max: 95, value: 50, primary: true },
        { key: 'softness', label: 'Softness', min: 0, max: 100, value: 8 },
        { key: 'local', label: 'Local (photocopy)', min: 0, max: 100, value: 55 }
      ],
      apply(data, w, h, p) {
        return thresholdFx(data, w, h, p);
      }
    },
    {
      id: 'split-tone',
      name: 'Split Tone',
      params: [
        { key: 'shadowHue', label: 'Shadow hue', min: 0, max: 359, step: 1, value: 205, primary: true },
        { key: 'highlightHue', label: 'Highlight hue', min: 0, max: 359, step: 1, value: 38 },
        { key: 'balance', label: 'Balance', min: 0, max: 100, value: 50 },
        { key: 'strength', label: 'Strength', min: 0, max: 100, value: 60 },
        { key: 'saturation', label: 'Saturation', min: 0, max: 100, value: 55 }
      ],
      apply(data, w, h, p) {
        return splitToneFx(data, p);
      }
    },
    {
      id: 'matte-fade',
      name: 'Matte Fade',
      params: [
        { key: 'lift', label: 'Lifted blacks', min: 0, max: 100, value: 45, primary: true },
        { key: 'rolloff', label: 'Soft whites', min: 0, max: 100, value: 30 },
        { key: 'fade', label: 'Fade', min: 0, max: 100, value: 35 },
        { key: 'warmth', label: 'Warmth', min: -100, max: 100, value: 40 }
      ],
      apply(data, w, h, p) {
        return matteFadeFx(data, p);
      }
    },
    {
      id: 'cross-process',
      name: 'Cross Process',
      params: [
        { key: 'amount', label: 'Amount', min: 0, max: 100, value: 80, primary: true },
        { key: 'shift', label: 'Colour shift', min: -100, max: 100, value: 30 },
        { key: 'contrast', label: 'Contrast', min: 0, max: 100, value: 35 }
      ],
      apply(data, w, h, p) {
        return crossProcessFx(data, p);
      }
    },
    {
      id: 'xray',
      name: 'X-Ray',
      params: [
        { key: 'invert', label: 'Invert', min: 0, max: 100, value: 100, primary: true },
        { key: 'desat', label: 'Desaturate', min: 0, max: 100, value: 80 },
        { key: 'hue', label: 'Tint hue', min: 0, max: 359, step: 1, value: 195 },
        { key: 'tint', label: 'Tint', min: 0, max: 100, value: 45 },
        { key: 'glow', label: 'Glow', min: 0, max: 100, value: 40 }
      ],
      apply(data, w, h, p) {
        return xrayFx(data, w, h, p);
      }
    },
    {
      id: 'dither',
      name: 'Dither',
      params: [
        { key: 'mode', label: 'Bayer / Floyd / Atkinson', min: 0, max: 2, step: 1, value: 1, primary: true },
        { key: 'levels', label: 'Levels', min: 2, max: 8, step: 1, value: 2 },
        { key: 'scale', label: 'Pixel size', min: 1, max: 8, step: 1, value: 2 },
        { key: 'colour', label: 'Colour', min: 0, max: 100, value: 0 }
      ],
      apply(data, w, h, p) {
        return ditherFx(data, w, h, p);
      }
    },
    {
      id: 'ascii',
      name: 'ASCII',
      maxPixels: 700000,
      params: [
        { key: 'cell', label: 'Cell size', min: 4, max: 20, step: 1, value: 8, primary: true },
        { key: 'colour', label: 'Source colour', min: 0, max: 100, value: 0 },
        { key: 'contrast', label: 'Contrast', min: 0, max: 100, value: 55 }
      ],
      apply(data, w, h, p) {
        return asciiFx(data, w, h, p);
      }
    },
    {
      id: 'screentone',
      name: 'Screentone',
      params: [
        { key: 'dot', label: 'Screen size', min: 2, max: 14, value: 5, primary: true },
        { key: 'shadows', label: 'Solid blacks', min: 0, max: 100, value: 42 },
        { key: 'highlights', label: 'Paper whites', min: 0, max: 100, value: 40 },
        { key: 'ink', label: 'Ink lines', min: 0, max: 100, value: 55 }
      ],
      apply(data, w, h, p) {
        return screentoneFx(data, w, h, p);
      }
    },
    {
      id: 'riso',
      name: 'Riso Misprint',
      params: [
        { key: 'offset', label: 'Misregister', min: 0, max: 20, step: 1, value: 5, primary: true },
        { key: 'plates', label: 'Plates', min: 2, max: 3, step: 1, value: 3 },
        { key: 'ink', label: 'Ink weight', min: 0, max: 100, value: 72 },
        { key: 'grain', label: 'Grain', min: 0, max: 100, value: 45 },
        { key: 'seed', label: 'Seed', min: 0, max: 999, step: 1, value: 12 }
      ],
      apply(data, w, h, p) {
        return risoMisprintFx(data, w, h, p);
      }
    },
    {
      id: 'ink-bleed',
      name: 'Ink Bleed',
      maxPixels: 900000,
      params: [
        { key: 'level', label: 'Ink level', min: 10, max: 90, value: 34, primary: true },
        { key: 'bleed', label: 'Bleed', min: 1, max: 8, step: 1, value: 3 },
        { key: 'spread', label: 'Spread', min: 0, max: 4, step: 1, value: 1 },
        { key: 'rough', label: 'Rough edge', min: 0, max: 100, value: 45 },
        { key: 'hue', label: 'Ink hue', min: 0, max: 359, step: 1, value: 25 },
        { key: 'tint', label: 'Ink tint', min: 0, max: 100, value: 18 }
      ],
      apply(data, w, h, p) {
        return inkBleedFx(data, w, h, p);
      }
    },
    {
      id: 'low-poly',
      name: 'Low Poly',
      maxPixels: 900000,
      params: [
        { key: 'cell', label: 'Cell size', min: 8, max: 80, step: 1, value: 26, primary: true },
        { key: 'jitter', label: 'Jitter', min: 0, max: 100, value: 65 },
        { key: 'edges', label: 'Edges', min: 0, max: 100, value: 0 },
        { key: 'seed', label: 'Seed', min: 0, max: 999, step: 1, value: 5 }
      ],
      apply(data, w, h, p) {
        return lowPolyFx(data, w, h, p);
      }
    },
    {
      id: 'paper-cut',
      name: 'Paper Cut',
      maxPixels: 900000,
      params: [
        { key: 'layers', label: 'Layers', min: 2, max: 8, step: 1, value: 5, primary: true },
        { key: 'simplify', label: 'Simplify', min: 0, max: 100, value: 35 },
        { key: 'smooth', label: 'Smooth', min: 1, max: 6, step: 1, value: 3 },
        { key: 'shadow', label: 'Drop shadow', min: 0, max: 100, value: 60 },
        { key: 'outline', label: 'Leading (glass)', min: 0, max: 100, value: 0 }
      ],
      apply(data, w, h, p) {
        return paperCutFx(data, w, h, p);
      }
    },
    {
      id: 'blueprint',
      name: 'Blueprint',
      maxPixels: 1200000,
      params: [
        { key: 'detail', label: 'Detail', min: 0, max: 100, value: 72, primary: true },
        { key: 'lines', label: 'Straighten', min: 0, max: 100, value: 45 },
        { key: 'grid', label: 'Grid', min: 0, max: 100, value: 55 },
        { key: 'weight', label: 'Line weight', min: 4, max: 30, step: 1, value: 10 },
        { key: 'glow', label: 'Glow', min: 0, max: 100, value: 35 },
        { key: 'hue', label: 'Paper hue', min: 0, max: 359, step: 1, value: 220 }
      ],
      apply(data, w, h, p) {
        return blueprintFx(data, w, h, p);
      }
    },
    {
      id: 'cross-hatch',
      name: 'Cross Hatch',
      maxPixels: 900000,
      params: [
        { key: 'passes', label: 'Passes', min: 1, max: 5, step: 1, value: 4, primary: true },
        { key: 'spacing', label: 'Spacing', min: 2, max: 16, value: 5 },
        { key: 'angle', label: 'Angle', min: 0, max: 180, step: 1, value: 35 },
        { key: 'follow', label: 'Follow form', min: 0, max: 100, value: 30 },
        { key: 'weight', label: 'Line weight', min: 4, max: 24, step: 1, value: 8 },
        { key: 'ink', label: 'Ink', min: 0, max: 100, value: 55 }
      ],
      apply(data, w, h, p) {
        return crossHatchFx(data, w, h, p);
      }
    },
    {
      id: 'watercolour',
      name: 'Watercolour',
      maxPixels: 700000,
      params: [
        { key: 'bleed', label: 'Bleed', min: 1, max: 8, step: 1, value: 3, primary: true },
        { key: 'wet', label: 'Wet edges', min: 0, max: 100, value: 45 },
        { key: 'levels', label: 'Flatten', min: 0, max: 100, value: 22 },
        { key: 'pigment', label: 'Pigment', min: 0, max: 100, value: 50 },
        { key: 'edges', label: 'Edge pooling', min: 0, max: 100, value: 42 },
        { key: 'paper', label: 'Paper grain', min: 0, max: 100, value: 50 }
      ],
      apply(data, w, h, p) {
        return watercolourFx(data, w, h, p);
      }
    },
    {
      id: 'portrait-smooth',
      name: 'Portrait Smooth',
      maxPixels: 900000,
      params: [
        { key: 'amount', label: 'Amount', min: 0, max: 100, value: 70, primary: true },
        { key: 'smooth', label: 'Radius', min: 1, max: 8, step: 1, value: 3 },
        { key: 'texture', label: 'Keep texture', min: 0, max: 100, value: 30 },
        { key: 'everywhere', label: 'Ignore skin mask', min: 0, max: 100, value: 0 },
        { key: 'glow', label: 'Glow', min: 0, max: 100, value: 30 },
        { key: 'warmth', label: 'Warmth', min: 0, max: 100, value: 25 }
      ],
      apply(data, w, h, p) {
        return portraitSmoothFx(data, w, h, p);
      }
    },
    {
      id: 'tiny-planet',
      name: 'Tiny Planet',
      maxPixels: 900000,
      params: [
        { key: 'zoom', label: 'Zoom', min: 40, max: 200, step: 1, value: 100, primary: true },
        { key: 'rotate', label: 'Rotate', min: 0, max: 359, step: 1, value: 0 },
        { key: 'invert', label: 'Tunnel', min: 0, max: 100, step: 100, value: 0 }
      ],
      apply(data, w, h, p) {
        return tinyPlanetFx(data, w, h, p);
      }
    },
    {
      id: 'lens-warp',
      name: 'Fisheye',
      maxPixels: 900000,
      params: [
        { key: 'amount', label: 'Bulge / pinch', min: -100, max: 100, value: 55, primary: true },
        { key: 'radius', label: 'Radius', min: 5, max: 100, value: 60 },
        { key: 'barrel', label: 'Barrel', min: -100, max: 100, value: 25 }
      ],
      apply(data, w, h, p) {
        return lensWarpFx(data, w, h, p);
      }
    },
    {
      id: 'kaleidoscope',
      name: 'Kaleidoscope',
      maxPixels: 900000,
      params: [
        { key: 'segments', label: 'Segments', min: 2, max: 16, step: 1, value: 6, primary: true },
        { key: 'mirror', label: 'Mirror', min: 0, max: 100, value: 100 },
        { key: 'rotate', label: 'Rotate', min: 0, max: 359, step: 1, value: 0 },
        { key: 'zoom', label: 'Zoom', min: 30, max: 200, step: 1, value: 100 },
        { key: 'offset', label: 'Sample offset', min: 0, max: 100, value: 0 }
      ],
      apply(data, w, h, p) {
        return kaleidoscopeFx(data, w, h, p);
      }
    },
    {
      id: 'anaglyph',
      name: 'Anaglyph 3D',
      maxPixels: 900000,
      params: [
        { key: 'separation', label: 'Separation', min: 0, max: 30, step: 1, value: 8, primary: true },
        { key: 'depth', label: 'Fake depth', min: 0, max: 100, value: 55 },
        { key: 'desat', label: 'Desaturate', min: 0, max: 100, value: 60 },
        { key: 'ghost', label: 'Ghost', min: 0, max: 100, value: 20 }
      ],
      apply(data, w, h, p) {
        return anaglyphFx(data, w, h, p);
      }
    },
    {
      id: 'light-leak',
      name: 'Light Leak',
      params: [
        { key: 'amount', label: 'Amount', min: 0, max: 100, value: 70, primary: true },
        { key: 'hue', label: 'Hue', min: 0, max: 359, step: 1, value: 22 },
        { key: 'variation', label: 'Hue spread', min: 0, max: 180, step: 1, value: 55 },
        { key: 'spread', label: 'Size', min: 10, max: 120, value: 60 },
        { key: 'count', label: 'Leaks', min: 1, max: 4, step: 1, value: 2 },
        { key: 'haze', label: 'Haze', min: 0, max: 100, value: 35 },
        { key: 'seed', label: 'Seed', min: 0, max: 999, step: 1, value: 3 }
      ],
      apply(data, w, h, p) {
        return lightLeakFx(data, w, h, p);
      }
    },
    {
      id: 'lens-flare',
      name: 'Lens Flare',
      params: [
        { key: 'amount', label: 'Amount', min: 0, max: 100, value: 70, primary: true },
        { key: 'size', label: 'Size', min: 0, max: 100, value: 45 },
        { key: 'hue', label: 'Hue', min: 0, max: 359, step: 1, value: 38 },
        { key: 'streaks', label: 'Streaks', min: 0, max: 8, step: 1, value: 3 },
        { key: 'ghosts', label: 'Ghosts', min: 0, max: 8, step: 1, value: 5 },
        { key: 'angle', label: 'Angle', min: 0, max: 180, step: 1, value: 0 }
      ],
      apply(data, w, h, p) {
        return lensFlareFx(data, w, h, p);
      }
    },
    {
      id: 'crt',
      name: 'CRT / VHS',
      maxPixels: 900000,
      params: [
        { key: 'scanlines', label: 'Scanlines', min: 0, max: 100, value: 65, primary: true },
        { key: 'grille', label: 'Aperture grille', min: 0, max: 100, value: 45 },
        { key: 'bleed', label: 'Chroma bleed', min: 0, max: 8, step: 1, value: 2 },
        { key: 'curve', label: 'Screen curve', min: 0, max: 100, value: 35 },
        { key: 'noise', label: 'Tracking noise', min: 0, max: 100, value: 30 },
        { key: 'seed', label: 'Seed', min: 0, max: 999, step: 1, value: 8 }
      ],
      apply(data, w, h, p) {
        return crtFx(data, w, h, p);
      }
    },
    {
      id: 'hdr',
      name: 'HDR Tonemap',
      maxPixels: 1200000,
      params: [
        { key: 'strength', label: 'Strength', min: 0, max: 100, value: 60, primary: true },
        { key: 'detail', label: 'Detail', min: 0, max: 100, value: 55 },
        { key: 'radius', label: 'Detail radius', min: 2, max: 20, step: 1, value: 6 },
        { key: 'saturation', label: 'Saturation', min: 0, max: 200, value: 115 }
      ],
      apply(data, w, h, p) {
        return hdrTonemapFx(data, w, h, p);
      }
    }
  );

})();
