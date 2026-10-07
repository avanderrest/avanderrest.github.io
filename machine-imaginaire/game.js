/* Machine Imaginaire — generative pictures after artists who worked by rules:
   Ellsworth Kelly and Sol LeWitt (a grid dealt out by chance), Vera Molnár (the
   disrupted grid), François Morellet (superimposed line grids), Bridget Riley
   (wave stripes) and Tyler Hobbs (flow fields).

   Every picture is a pure function of four things: the seed, the style, that
   style's settings, and the palette. The palette comes either from the seed or
   from a photo the visitor drops in, which is analysed in the browser (k-means
   for the five main colours and their shares, plus a 16x10 map of light and
   dark) and then forgotten. Both are kept in a quantised "canonical" form, the
   same one the share link carries, so a link renders exactly what was on screen.

   The picture is drawn at a fixed 2400x1500 whatever the window size, so the
   screen never changes it either. */
(() => {
  'use strict';

  // ---------- constants ----------
  const SAVE_KEY = 'machine-imaginaire-save-v1';
  const W = 2400, H = 1500;
  const LUM_COLS = 16, LUM_ROWS = 10;
  const ANALYSE_MAX = 120;          // a photo is shrunk to this long side before k-means
  const K = 5;
  const TAU = Math.PI * 2;
  const PI_DIGITS = '3141592653589793238462643383279502884197169399375105820974944592307816406286208998628034825342117067982148086513282306647';

  // ---------- seeded randomness ----------
  // A string hash (cyrb53's mixing) feeding Mulberry32. Each concern draws from its
  // own stream, rngFor(tag), so moving a slider in one style never reshuffles the palette.
  function hashString(str) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 2654435761);
      h2 = Math.imul(h2 ^ c, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h1 ^ h2) >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rngFor = (tag) => mulberry32(hashString(S.seed + '|' + tag));
  function shuffle(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  // 2D gradient noise (Perlin's), its permutation and gradients from the seed.
  // Returns roughly -1..1.
  function makeNoise(rng) {
    const perm = new Uint8Array(512);
    const p = shuffle(Array.from({ length: 256 }, (_, i) => i), rng);
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
    const gx = new Float32Array(256), gy = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const a = rng() * TAU; gx[i] = Math.cos(a); gy[i] = Math.sin(a); }
    const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
    return function (x, y) {
      const xi = Math.floor(x), yi = Math.floor(y);
      const xf = x - xi, yf = y - yi;
      const X = xi & 255, Y = yi & 255;
      const g = (ix, iy, dx, dy) => { const h = perm[ix + perm[iy]]; return gx[h] * dx + gy[h] * dy; };
      const n00 = g(X, Y, xf, yf), n10 = g(X + 1, Y, xf - 1, yf);
      const n01 = g(X, Y + 1, xf, yf - 1), n11 = g(X + 1, Y + 1, xf - 1, yf - 1);
      const u = fade(xf), v = fade(yf);
      const a = n00 + u * (n10 - n00), b = n01 + u * (n11 - n01);
      return (a + v * (b - a)) * 1.414;
    };
  }

  // ---------- colour ----------
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const rgbToHex = (rgb) => '#' + rgb.map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
  const luma = (rgb) => 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  function hsl(h, s, l) {
    h = ((h % 360) + 360) % 360;
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
    const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
  }
  const mkColor = (c) => ({ hex: c.hex, w: c.w, rgb: hexToRgb(c.hex) });
  const lightest = (P) => P.reduce((a, b) => (luma(b.rgb) > luma(a.rgb) ? b : a));
  const darkest = (P) => P.reduce((a, b) => (luma(b.rgb) < luma(a.rgb) ? b : a));
  function pickWeighted(list, rng) {
    const tot = list.reduce((s, c) => s + c.w, 0);
    if (tot <= 0) return list[Math.floor(rng() * list.length)];
    let r = rng() * tot;
    for (const c of list) { r -= c.w; if (r < 0) return c; }
    return list[list.length - 1];
  }

  // The canonical palette is [{ hex, w }] sorted by share, w to 0.1%. It is what the
  // link and the save hold, and what every style draws from.
  const canon = (list) => list
    .map((c) => ({ hex: c.hex, w: Math.round(c.w * 1000) / 1000 }))
    .sort((a, b) => b.w - a.w);
  const encodePal = (pal) => pal.map((c) => c.hex.slice(1) + '.' + Math.round(c.w * 1000)).join('-');
  function decodePal(str) {
    const pal = String(str || '').split('-').map((s) => {
      const m = /^([0-9a-f]{6})\.(\d{1,4})$/i.exec(s);
      return m && { hex: '#' + m[1].toLowerCase(), w: Math.min(1000, +m[2]) / 1000 };
    });
    return pal.length && pal.every(Boolean) ? canon(pal) : null;
  }
  const validLum = (s) => (typeof s === 'string' && new RegExp('^[0-9a-f]{' + LUM_COLS * LUM_ROWS + '}$').test(s) ? s : null);

  // With no photo the seed mixes a palette: a paper (or, now and then, a night)
  // ground that always has the largest share, and four inks from a colour scheme.
  function seededPalette() {
    const rng = rngFor('palette');
    const h = rng() * 360;
    const schemes = [[0, 25, -25, 50], [0, 180, 15, 195], [0, 120, 240, 30], [0, 150, 210, 10], [0, 0, 10, -10], [0, 40, 180, 200]];
    const offs = schemes[Math.floor(rng() * schemes.length)];
    const dark = rng() < 0.28;
    const warm = rng() < 0.6;      // most often a cream paper, otherwise one tinted to the scheme
    const ground = dark ? hsl(h + 200, 0.18 + rng() * 0.15, 0.1 + rng() * 0.05)
      : warm ? hsl(36 + rng() * 14, 0.3 + rng() * 0.25, 0.89 + rng() * 0.05) : hsl(h + 30, 0.18 + rng() * 0.25, 0.88 + rng() * 0.06);
    const ls = shuffle(dark ? [0.45, 0.58, 0.68, 0.8] : [0.24, 0.4, 0.52, 0.64], rng);
    const inks = offs.map((o, i) => hsl(h + o + (rng() - 0.5) * 16, 0.45 + rng() * 0.4, ls[i]));
    const gw = 0.35 + rng() * 0.2;
    const parts = inks.map(() => 0.5 + rng());
    const ps = parts.reduce((a, b) => a + b, 0);
    return canon([{ hex: rgbToHex(ground), w: gw }].concat(inks.map((c, i) => ({ hex: rgbToHex(c), w: (1 - gw) * parts[i] / ps }))));
  }

  // ---------- photo analysis ----------
  // k-means on the photo's pixels (k-means++ start from a fixed seed, so a photo
  // always gives the same palette whatever the picture's seed), and the light map.
  function analyse(img) {
    const { width: w, height: h, data } = img;
    const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 14000)));
    const px = [];
    for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4;
      if (data[i + 3] > 127) px.push(data[i], data[i + 1], data[i + 2]);
    }
    const n = px.length / 3;
    if (!n) return null;
    const rng = mulberry32(0x5eed);
    const d2 = (i, c) => { const a = px[i * 3] - c[0], b = px[i * 3 + 1] - c[1], e = px[i * 3 + 2] - c[2]; return a * a + b * b + e * e; };
    const cents = [];
    const first = Math.floor(rng() * n);
    cents.push([px[first * 3], px[first * 3 + 1], px[first * 3 + 2]]);
    const near = new Float64Array(n).fill(Infinity);
    while (cents.length < K) {
      let sum = 0;
      const c = cents[cents.length - 1];
      for (let i = 0; i < n; i++) { near[i] = Math.min(near[i], d2(i, c)); sum += near[i]; }
      if (sum === 0) break;                       // fewer than K distinct colours
      let r = rng() * sum, pick = n - 1;
      for (let i = 0; i < n; i++) { r -= near[i]; if (r <= 0) { pick = i; break; } }
      cents.push([px[pick * 3], px[pick * 3 + 1], px[pick * 3 + 2]]);
    }
    const label = new Int32Array(n);
    let counts = [];
    for (let it = 0; it < 24; it++) {
      let moved = 0;
      for (let i = 0; i < n; i++) {
        let best = 0, bd = Infinity;
        for (let k = 0; k < cents.length; k++) { const d = d2(i, cents[k]); if (d < bd) { bd = d; best = k; } }
        if (label[i] !== best) { label[i] = best; moved++; }
      }
      const sums = cents.map(() => [0, 0, 0]);
      counts = cents.map(() => 0);
      for (let i = 0; i < n; i++) { const s = sums[label[i]]; s[0] += px[i * 3]; s[1] += px[i * 3 + 1]; s[2] += px[i * 3 + 2]; counts[label[i]]++; }
      cents.forEach((c, k) => { if (counts[k]) { c[0] = sums[k][0] / counts[k]; c[1] = sums[k][1] / counts[k]; c[2] = sums[k][2] / counts[k]; } });
      if (!moved && it) break;
    }
    const palette = canon(cents.map((c, k) => ({ hex: rgbToHex(c), w: counts[k] / n })).filter((c) => c.w > 0));

    let lum = '';
    for (let gy = 0; gy < LUM_ROWS; gy++) for (let gx = 0; gx < LUM_COLS; gx++) {
      const x0 = Math.floor(gx * w / LUM_COLS), x1 = Math.max(x0 + 1, Math.floor((gx + 1) * w / LUM_COLS));
      const y0 = Math.floor(gy * h / LUM_ROWS), y1 = Math.max(y0 + 1, Math.floor((gy + 1) * h / LUM_ROWS));
      let s = 0, c = 0;
      for (let y = y0; y < y1 && y < h; y++) for (let x = x0; x < x1 && x < w; x++) {
        const i = (y * w + x) * 4;
        s += luma([data[i], data[i + 1], data[i + 2]]); c++;
      }
      lum += Math.round((c ? s / c : 128) / 255 * 15).toString(16);
    }
    return { palette, lum };
  }

  // Deal `cells` out in proportion to the weights, exactly: floor each share, then
  // hand the leftovers to the largest remainders.
  function allocate(P, cells) {
    const tot = P.reduce((s, c) => s + c.w, 0);
    const raw = P.map((c) => (tot > 0 ? c.w / tot : 1 / P.length) * cells);
    const counts = raw.map(Math.floor);
    let left = cells - counts.reduce((a, b) => a + b, 0);
    const order = raw.map((r, i) => i).sort((a, b) => (raw[b] - counts[b]) - (raw[a] - counts[a]) || a - b);
    for (let k = 0; left > 0; k++, left--) counts[order[k % order.length]]++;
    return counts;
  }

  // ---------- drawing helpers ----------
  // Parallel lines filling a rectangle, in one of LeWitt's four directions:
  // 0 vertical, 1 horizontal, 2 and 3 the two diagonals.
  function hatch(ctx, x, y, w, h, dir, spacing, lw, color) {
    const R = Math.hypot(w, h) / 2;
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate([Math.PI / 2, 0, Math.PI / 4, -Math.PI / 4][dir]);
    ctx.fillStyle = color;
    for (let t = -Math.ceil(R / spacing) * spacing; t <= R; t += spacing) ctx.fillRect(-R, t - lw / 2, 2 * R, lw);
    ctx.restore();
  }

  // ---------- the styles ----------
  // Each draw(ctx, R) gets R = { rng, noise, P, ground, inks, prm, lumAt } and may
  // return what it decided, for the tests.
  const STYLES = {
    kelly: {
      name: 'Chance grid',
      after: 'Ellsworth Kelly · Sol LeWitt',
      params: [
        { k: 'grid', label: 'Columns', min: 3, max: 30, step: 1, def: 12 },
        { k: 'fill', label: 'Panels', opts: [['flat', 'Flat'], ['lines', 'Lines'], ['both', 'Both']], def: 'flat' },
        { k: 'line', label: 'Line spacing', min: 6, max: 40, step: 1, def: 14 },
        { k: 'gap', label: 'Gap', min: 0, max: 30, step: 1, def: 0 },
      ],
      draw(ctx, { rng, P, prm }) {
        const cols = prm.grid, rows = Math.max(1, Math.round(cols * H / W)), cells = cols * rows;
        const counts = allocate(P, cells);
        const deck = [];
        counts.forEach((c, i) => { for (let k = 0; k < c; k++) deck.push(i); });
        shuffle(deck, rng);
        const paper = rgbToHex(mix(lightest(P).rgb, [255, 255, 255], 0.55));
        const ink0 = darkest(P);
        ctx.fillStyle = prm.gap > 0 ? paper : P[0].hex;
        ctx.fillRect(0, 0, W, H);
        const cw = W / cols, ch = H / rows, g = prm.gap;
        const lw = Math.max(1.5, prm.line * 0.28);
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
          const col = P[deck[r * cols + c]];
          const x = c * cw + g / 2, y = r * ch + g / 2, w = cw - g, h = ch - g;
          const lines = prm.fill === 'lines' || (prm.fill === 'both' && rng() < 0.5);
          if (!lines) { ctx.fillStyle = col.hex; ctx.fillRect(x, y, w + (g ? 0 : 0.6), h + (g ? 0 : 0.6)); continue; }
          ctx.fillStyle = paper; ctx.fillRect(x, y, w, h);
          const ink = Math.abs(luma(col.rgb) - luma(hexToRgb(paper))) < 60 ? ink0 : col;
          const d1 = Math.floor(rng() * 4);
          hatch(ctx, x, y, w, h, d1, prm.line, lw, ink.hex);
          if (rng() < 0.35) hatch(ctx, x, y, w, h, (d1 + 1 + Math.floor(rng() * 3)) % 4, prm.line, lw, ink.hex);
        }
        return { cells, counts, deck };
      },
    },

    molnar: {
      name: 'Disrupted grid',
      after: 'Vera Molnár',
      params: [
        { k: 'grid', label: 'Columns', min: 4, max: 24, step: 1, def: 10 },
        { k: 'nest', label: 'Squares in each', min: 1, max: 8, step: 1, def: 4 },
        { k: 'disorder', label: 'Disorder', min: 0, max: 100, step: 1, def: 45 },
        { k: 'omit', label: 'Left out', min: 0, max: 40, step: 1, def: 8, unit: '%' },
        { k: 'fill', label: 'Filled', min: 0, max: 100, step: 1, def: 12, unit: '%' },
        { k: 'drift', label: 'Disorder grows', opts: [['grows', 'Left to right'], ['centre', 'From the centre'], ['even', 'Evenly']], def: 'grows' },
      ],
      draw(ctx, { rng, ground, inks, prm }) {
        const cols = prm.grid, s = W / (cols + 1);
        const rows = Math.max(1, Math.floor(H / s) - 1);
        const ox = (W - cols * s) / 2, oy = (H - rows * s) / 2;
        ctx.fillStyle = ground.hex; ctx.fillRect(0, 0, W, H);
        ctx.lineWidth = Math.max(2, s * 0.022);
        ctx.lineJoin = 'miter';
        const maxD = Math.hypot(cols / 2, rows / 2);
        let drawn = 0;
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
          if (rng() < prm.omit / 100) continue;
          const t = prm.drift === 'grows' ? (cols > 1 ? c / (cols - 1) : 1)
            : prm.drift === 'centre' ? Math.hypot(c + 0.5 - cols / 2, r + 0.5 - rows / 2) / maxD : 1;
          const dis = prm.disorder / 100 * (prm.drift === 'even' ? 1 : 0.06 + 0.94 * t);
          const col = pickWeighted(inks, rng).hex;
          const cx = ox + (c + 0.5) * s, cy = oy + (r + 0.5) * s;
          const fillK = rng() < prm.fill / 100 ? Math.floor(rng() * prm.nest) : -1;
          for (let k = 0; k < prm.nest; k++) {
            const half = s * 0.42 * (1 - (k / prm.nest) * 0.85);
            const rot = (rng() - 0.5) * dis * 0.9 * (1 + k * 0.4);
            const cs = Math.cos(rot), sn = Math.sin(rot);
            ctx.beginPath();
            [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([u, v], i) => {
              const jx = (rng() - 0.5) * 2 * dis * s * 0.16, jy = (rng() - 0.5) * 2 * dis * s * 0.16;
              const x = cx + (u * cs - v * sn) * half + jx, y = cy + (u * sn + v * cs) * half + jy;
              if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
            });
            ctx.closePath();
            if (k === fillK) { ctx.fillStyle = col; ctx.fill(); } else { ctx.strokeStyle = col; ctx.stroke(); }
          }
          drawn++;
        }
        return { cols, rows, drawn };
      },
    },

    morellet: {
      name: 'Superimposed',
      after: 'François Morellet',
      params: [
        { k: 'layers', label: 'Grids', min: 2, max: 5, step: 1, def: 3 },
        { k: 'spacing', label: 'Spacing', min: 8, max: 80, step: 1, def: 34 },
        { k: 'weight', label: 'Line weight', min: 10, max: 60, step: 1, def: 26, unit: '%' },
        { k: 'angles', label: 'Angles', opts: [['pi', 'From π'], ['near', 'Nearly parallel'], ['random', 'Any']], def: 'pi' },
        { k: 'holes', label: 'Holes', min: 0, max: 60, step: 1, def: 0, unit: '%' },
      ],
      draw(ctx, { rng, P, prm }) {
        // Multiply needs a light ground, so the lightest colour becomes paper.
        const src = lightest(P);
        ctx.fillStyle = rgbToHex(mix(src.rgb, [255, 255, 255], 0.35));
        ctx.fillRect(0, 0, W, H);
        let inks = P.filter((c) => c !== src);
        if (!inks.length) inks = [mkColor({ hex: '#1c1b19', w: 1 })];
        const D = Math.hypot(W, H);
        // From π: successive digits of pi, each one not used yet, times 18°, so the
        // grids spread over the half-turn and no two ever lie on top of each other.
        let at = Math.floor(rng() * 90);
        const digits = [];
        while (digits.length < prm.layers) { const d = +PI_DIGITS[at++]; if (!digits.includes(d)) digits.push(d); }
        const base = rng() * 180;
        const angles = [];
        ctx.globalCompositeOperation = 'multiply';
        for (let i = 0; i < prm.layers; i++) {
          const deg = prm.angles === 'pi' ? digits[i] * 18
            : prm.angles === 'near' ? base + (rng() - 0.5) * 12 : rng() * 180;
          // nearly parallel grids also differ a little in pitch: that is where moiré comes from
          const pitch = prm.angles === 'near' ? prm.spacing * (1 + (rng() - 0.5) * 0.1) : prm.spacing;
          angles.push(deg);
          ctx.save();
          if (prm.holes > 0) {
            ctx.beginPath();
            let on = 0;
            for (let gy = 0; gy < 5; gy++) for (let gx = 0; gx < 8; gx++) {
              if (rng() < prm.holes / 100) continue;
              ctx.rect(gx * W / 8, gy * H / 5, W / 8, H / 5); on++;
            }
            if (!on) ctx.rect(0, 0, W, H);
            ctx.clip();
          }
          ctx.translate(W / 2, H / 2);
          ctx.rotate(deg * Math.PI / 180);
          ctx.fillStyle = inks[i % inks.length].hex;
          const lw = pitch * prm.weight / 100;
          for (let t = -D / 2 + rng() * pitch; t < D / 2; t += pitch) ctx.fillRect(-D / 2, t, D, lw);
          ctx.restore();
        }
        ctx.globalCompositeOperation = 'source-over';
        return { angles };
      },
    },

    riley: {
      name: 'Waves',
      after: 'Bridget Riley',
      params: [
        { k: 'stripes', label: 'Stripes', min: 16, max: 140, step: 1, def: 56 },
        { k: 'waves', label: 'Waves across', min: 1, max: 8, step: 0.5, def: 3 },
        { k: 'amp', label: 'Swell', min: 0, max: 100, step: 1, def: 55 },
        { k: 'drift', label: 'Phase drift', min: 0, max: 100, step: 1, def: 25 },
        { k: 'colour', label: 'Colour', opts: [['alternate', 'Alternate'], ['sequence', 'Sequence']], def: 'alternate' },
      ],
      draw(ctx, { rng, P, ground, inks, prm, lumAt }) {
        ctx.fillStyle = ground.hex; ctx.fillRect(0, 0, W, H);
        const n = prm.stripes, band = H / n, A = prm.amp / 100 * band * 4;
        const om = prm.waves * TAU / W, phi0 = rng() * TAU, drift = prm.drift / 100 * 0.5;
        const xs = [];
        for (let x = -16; x <= W + 16; x += 8) xs.push(x);
        const pad = Math.ceil(A / band) + 2;
        const lines = [];
        for (let i = -pad; i <= n + pad; i++) {
          const y0 = i * band, prev = lines[lines.length - 1];
          lines.push(xs.map((x, j) => {
            const y = y0 + A * (0.15 + 0.85 * lumAt(x / W, clamp(y0 / H, 0, 1))) * Math.sin(om * x + phi0 + i * drift);
            return prev ? Math.max(y, prev[j] + band * 0.15) : y;   // never let stripes cross
          }));
        }
        for (let s = 0; s < lines.length - 1; s++) {
          const i = s - pad;
          const col = prm.colour === 'sequence' ? P[((i % P.length) + P.length) % P.length] : (i & 1) ? pickWeighted(inks, rng) : ground;
          if (col === ground && prm.colour !== 'sequence') continue;
          ctx.fillStyle = col.hex;
          ctx.beginPath();
          xs.forEach((x, j) => (j ? ctx.lineTo(x, lines[s][j]) : ctx.moveTo(x, lines[s][j])));
          for (let j = xs.length - 1; j >= 0; j--) ctx.lineTo(xs[j], lines[s + 1][j] + 0.6);
          ctx.closePath();
          ctx.fill();
        }
        return { stripes: lines.length - 1 };
      },
    },

    hobbs: {
      name: 'Flow field',
      after: 'Tyler Hobbs',
      params: [
        { k: 'lines', label: 'Lines tried', min: 100, max: 2500, step: 50, def: 900 },
        { k: 'length', label: 'Length', min: 20, max: 400, step: 10, def: 180 },
        { k: 'scale', label: 'Field zoom', min: 1, max: 10, step: 0.5, def: 3 },
        { k: 'turn', label: 'Turbulence', min: 0, max: 100, step: 1, def: 40 },
        { k: 'width', label: 'Width', min: 1, max: 30, step: 1, def: 8 },
        { k: 'spacing', label: 'Spacing', min: 0, max: 30, step: 1, def: 10 },
      ],
      draw(ctx, { rng, noise, ground, inks, prm }) {
        ctx.fillStyle = ground.hex; ctx.fillRect(0, 0, W, H);
        const base = rng() * TAU, turn = prm.turn / 100 * TAU * 1.2, sc = prm.scale / W;
        const field = (x, y) => base + noise(x * sc, y * sc) * turn;
        const m = W * 0.035, stepLen = 4, sep = prm.spacing;
        const cell = Math.max(sep, 6), gw = Math.ceil(W / cell), gh = Math.ceil(H / cell);
        const grid = new Array(gw * gh);
        const clash = (x, y) => {
          if (!sep) return false;
          const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
          for (let yy = cy - 1; yy <= cy + 1; yy++) for (let xx = cx - 1; xx <= cx + 1; xx++) {
            if (xx < 0 || yy < 0 || xx >= gw || yy >= gh) continue;
            const b = grid[yy * gw + xx];
            if (b) for (let i = 0; i < b.length; i += 2) { const dx = b[i] - x, dy = b[i + 1] - y; if (dx * dx + dy * dy < sep * sep) return true; }
          }
          return false;
        };
        let kept = 0;
        for (let L = 0; L < prm.lines; L++) {
          let x = m + rng() * (W - 2 * m), y = m + rng() * (H - 2 * m);
          const width = prm.width * (0.6 + 0.8 * rng());
          const col = pickWeighted(inks, rng).hex;
          const pts = [];
          for (let s = 0; s < prm.length; s++) {
            if (x < m || y < m || x > W - m || y > H - m || clash(x, y)) break;
            pts.push(x, y);
            const a = field(x, y);
            x += Math.cos(a) * stepLen; y += Math.sin(a) * stepLen;
          }
          const n = pts.length / 2;
          if (n < 6) continue;
          for (let i = 0; i < pts.length; i += 2) {
            const k = Math.floor(pts[i + 1] / cell) * gw + Math.floor(pts[i] / cell);
            (grid[k] || (grid[k] = [])).push(pts[i], pts[i + 1]);
          }
          // a ribbon, fattest in the middle and tapering to both ends
          const left = [], right = [];
          for (let i = 0; i < n; i++) {
            const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
            let nx = -(pts[b * 2 + 1] - pts[a * 2 + 1]), ny = pts[b * 2] - pts[a * 2];
            const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
            const hw = width / 2 * (0.3 + 0.7 * Math.pow(Math.sin(Math.PI * i / (n - 1)), 0.6));
            left.push(pts[i * 2] + nx * hw, pts[i * 2 + 1] + ny * hw);
            right.push(pts[i * 2] - nx * hw, pts[i * 2 + 1] - ny * hw);
          }
          ctx.fillStyle = col;
          ctx.beginPath();
          for (let i = 0; i < n; i++) (i ? ctx.lineTo : ctx.moveTo).call(ctx, left[i * 2], left[i * 2 + 1]);
          for (let i = n - 1; i >= 0; i--) ctx.lineTo(right[i * 2], right[i * 2 + 1]);
          ctx.closePath();
          ctx.fill();
          kept++;
        }
        return { kept };
      },
    },
  };
  const ORDER = ['kelly', 'molnar', 'morellet', 'riley', 'hobbs'];
  const defaults = (style) => Object.fromEntries(STYLES[style].params.map((p) => [p.k, p.def]));
  function cleanParam(p, v) {
    if (p.opts) return p.opts.some((o) => o[0] === v) ? v : p.def;
    const n = Number(v);
    return Number.isFinite(n) ? clamp(Math.round(n / p.step) * p.step, p.min, p.max) : p.def;
  }

  // ---------- state ----------
  const ADJ = ['quiet', 'amber', 'plum', 'tidal', 'paper', 'slow', 'bright', 'hollow', 'woven', 'folded', 'salt', 'velvet', 'copper', 'misty', 'sunlit', 'inky', 'chalk', 'violet', 'rust', 'silver'];
  const NOUN = ['grid', 'loom', 'tide', 'field', 'square', 'line', 'wave', 'moth', 'kite', 'reed', 'orchard', 'window', 'harbour', 'garden', 'thread', 'lantern', 'pebble', 'meadow', 'ribbon', 'prism'];
  const dice = () => ADJ[Math.floor(Math.random() * ADJ.length)] + '-' + NOUN[Math.floor(Math.random() * NOUN.length)] + '-' + (100 + Math.floor(Math.random() * 900));

  const S = {
    seed: '',
    style: 'kelly',
    params: Object.fromEntries(ORDER.map((s) => [s, defaults(s)])),
    photo: null,          // { pal: canonical palette, lum: 160 hex digits, name }
    last: null,           // what the last draw returned
  };

  function palette() {
    return (S.photo ? S.photo.pal : seededPalette()).map(mkColor);
  }
  function lumSampler() {
    if (!S.photo || !S.photo.lum) {
      const nz = makeNoise(rngFor('light'));
      return (u, v) => clamp(0.5 + 0.5 * nz(u * 2.2, v * 2.2), 0, 1);
    }
    const g = Array.from(S.photo.lum, (c) => parseInt(c, 16) / 15);
    return (u, v) => {
      const x = clamp(u * LUM_COLS - 0.5, 0, LUM_COLS - 1), y = clamp(v * LUM_ROWS - 0.5, 0, LUM_ROWS - 1);
      const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(LUM_COLS - 1, x0 + 1), y1 = Math.min(LUM_ROWS - 1, y0 + 1);
      const fx = x - x0, fy = y - y0, at = (a, b) => g[b * LUM_COLS + a];
      return (at(x0, y0) * (1 - fx) + at(x1, y0) * fx) * (1 - fy) + (at(x0, y1) * (1 - fx) + at(x1, y1) * fx) * fy;
    };
  }

  // ---------- render ----------
  const canvas = document.getElementById('art');
  const ctx = canvas.getContext('2d');

  function renderNow() {
    const P = palette();
    const ground = P[0];
    let inks = P.slice(1);
    if (!inks.length) inks = [mkColor({ hex: luma(ground.rgb) > 128 ? '#1c1b19' : '#f4f1ea', w: 1 })];
    const style = STYLES[S.style];
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.save();
    S.last = style.draw(ctx, {
      rng: rngFor(S.style),
      noise: makeNoise(rngFor(S.style + '|noise')),
      P, ground, inks,
      prm: Object.assign(defaults(S.style), S.params[S.style]),
      lumAt: lumSampler(),
    }) || {};
    ctx.restore();
    paintSwatches(P);
    document.getElementById('caption').textContent = style.name + ' · after ' + style.after + ' · seed “' + S.seed + '”';
    writeHash();
    save();
    return S.last;
  }
  let queued = false;
  function render() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; renderNow(); });
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
    const q = new URLSearchParams();
    q.set('seed', S.seed);
    q.set('style', S.style);
    const prm = S.params[S.style];
    STYLES[S.style].params.forEach((p) => q.set(p.k, prm[p.k]));
    if (S.photo) { q.set('pal', encodePal(S.photo.pal)); q.set('lum', S.photo.lum); }
    const h = '#' + q.toString();
    if (location.hash !== h) history.replaceState(null, '', h);
  }
  function readHash() {
    if (!location.hash.includes('seed=')) return false;
    const q = new URLSearchParams(location.hash.slice(1));
    S.seed = q.get('seed') || dice();
    if (STYLES[q.get('style')]) S.style = q.get('style');
    STYLES[S.style].params.forEach((p) => { if (q.has(p.k)) S.params[S.style][p.k] = cleanParam(p, q.get(p.k)); });
    const pal = decodePal(q.get('pal'));
    S.photo = pal ? { pal, lum: validLum(q.get('lum')), name: null } : null;
    return true;
  }
  function save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        seed: S.seed, style: S.style, params: S.params,
        photo: S.photo && { pal: encodePal(S.photo.pal), lum: S.photo.lum, name: S.photo.name },
      }));
    } catch (e) { /* private mode: nothing kept, nothing lost */ }
  }
  function load() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { d = null; }
    if (!d) return false;
    if (typeof d.seed === 'string' && d.seed) S.seed = d.seed;
    if (STYLES[d.style]) S.style = d.style;
    ORDER.forEach((s) => STYLES[s].params.forEach((p) => {
      if (d.params && d.params[s] && p.k in d.params[s]) S.params[s][p.k] = cleanParam(p, d.params[s][p.k]);
    }));
    const pal = d.photo && decodePal(d.photo.pal);
    S.photo = pal ? { pal, lum: validLum(d.photo.lum), name: d.photo.name || null } : null;
    return !!S.seed;
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
      b.addEventListener('click', () => { S.style = key; syncUi(); render(); });
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
            prm[p.k] = v;
            seg.querySelectorAll('button').forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
            render();
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

  function paintSwatches(P) {
    const box = $('swatches');
    box.innerHTML = '';
    P.forEach((c, i) => {
      const s = document.createElement('span');
      s.style.background = c.hex;
      s.style.flexGrow = Math.max(c.w, 0.001);
      s.style.color = luma(c.rgb) > 140 ? '#1c1b19' : '#fff';
      s.textContent = Math.round(c.w * 100) + '%';
      s.title = c.hex + (i ? '' : ' — the ground');
      box.appendChild(s);
    });
  }

  let thumbUrl = null;
  function syncPhotoUi() {
    const thumb = $('photo-thumb');
    thumb.hidden = !(S.photo && thumbUrl);
    if (!thumb.hidden) thumb.src = thumbUrl;
    $('btn-unphoto').hidden = !S.photo;
    $('photo-label').textContent = !S.photo ? 'No photo — the seed picks the colours.'
      : S.photo.name ? 'Colours from ' + S.photo.name + '.' : 'Colours from a photo.';
  }

  function syncUi() {
    seedIn.value = S.seed;
    document.querySelectorAll('#styles button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.style === S.style)));
    buildParams();
    syncPhotoUi();
  }

  function setPhotoData(img, name) {
    const a = analyse(img);
    if (!a) { toast('That picture has no visible pixels'); return null; }
    S.photo = { pal: a.palette, lum: a.lum, name: name || null };
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
  $('btn-dice').addEventListener('click', () => { S.seed = dice(); seedIn.value = S.seed; render(); });
  $('photo').addEventListener('change', (e) => { loadPhoto(e.target.files[0]); e.target.value = ''; });
  $('btn-unphoto').addEventListener('click', () => { S.photo = null; syncPhotoUi(); render(); });
  $('btn-reset').addEventListener('click', () => { S.params[S.style] = defaults(S.style); buildParams(); render(); });
  $('btn-help').addEventListener('click', () => $('help').showModal());
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

  window.__machine = {
    S, STYLES, ORDER, W, H,
    analyse, allocate, encodePal, decodePal, hashString, fingerprint, setPhotoData,
    palette: () => palette(),
    clearPhoto() { S.photo = null; syncPhotoUi(); return renderNow(); },
    // render({ seed, style, params }) draws synchronously and returns what the style decided
    render(opts = {}) {
      if (opts.seed != null) S.seed = String(opts.seed);
      if (opts.style && STYLES[opts.style]) S.style = opts.style;
      if (opts.params) Object.assign(S.params[S.style], opts.params);
      syncUi();
      return renderNow();
    },
  };
})();
